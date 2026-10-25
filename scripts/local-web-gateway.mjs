import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidClientMetadataError, InvalidGrantError, InvalidScopeError, InvalidTargetError, InvalidTokenError, TooManyRequestsError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListResourceTemplatesRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRequestHistory, createChatLinksStore, renderAdminPage, parseProjectLink, parseChatLink } from './local-admin.mjs';
import { createSkillLibrary, RECOMMENDED_SKILLS } from './skill-library.mjs';
import { createOAuthState } from './oauth-state.mjs';
import { createDeviceRegistry } from './device-registry.mjs';
import { createWorkflowLedger } from './workflow-ledger.mjs';
import { createCorpRuntime } from './corp-runtime.mjs';
import { createGeneratedProjectGit } from './generated-project-git.mjs';
import { createProjectLifecycle } from './project-lifecycle.mjs';
import { createArenaRuntime } from './arena-runtime.mjs';
import { createCorpFolderBrowser } from './corp-folder-browser.mjs';
import { baseInstructions, CATALOG_META, createToolPolicy, WINDOWS_TOOL_NAMES, withContext, withoutContext } from './tool-policy.mjs';
import { createPrivilegeControl } from './privilege-control.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const randomToken = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest();
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isLoopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
const sameResource = (a, b) => String(a).replace(/\/$/, '') === String(b).replace(/\/$/, '');
const contentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

const deviceToolDefinitions = [
  { name: 'windows_on_device', operation: 'windows_tool', description: 'Use Windows desktop tools on a linked Windows Agent. First inspect windows_snapshot or windows_screenshot on that same device; coordinates belong to that PC. Returns real MCP text/image content. Desktop access must be installed and enabled on the target.', properties: { device_id: { type: 'string' }, name: { type: 'string', pattern: '^windows_[a-z_]+$', description: 'For example windows_snapshot, windows_screenshot, windows_click, windows_type, windows_app or windows_display_inventory.' }, arguments: { type: 'object', additionalProperties: true } }, required: ['device_id', 'name'] },
  { name: 'list_devices', description: 'List linked Windows agents and their online status.', properties: {}, required: [] },
  { name: 'get_device_status', description: 'Get status and capabilities for one linked Windows agent.', properties: { device_id: { type: 'string', description: 'Linked device ID.' } }, required: ['device_id'] },
  { name: 'get_job_status', description: 'Get the status and result of a remote device job.', properties: { job_id: { type: 'string', description: 'Remote job ID.' } }, required: ['job_id'] },
  { name: 'run_on_device', operation: 'run_command', description: 'Run a PowerShell command on a linked Windows device and return its real stdout, stderr and exit code.', properties: { device_id: { type: 'string' }, command: { type: 'string' }, cwd: { type: 'string' }, timeout_ms: { type: 'integer', minimum: 1000, maximum: 120000 } }, required: ['device_id', 'command'] },
  { name: 'read_file_on_device', operation: 'read_file', description: 'Read a text file from a linked Windows device.', properties: { device_id: { type: 'string' }, path: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, length: { type: 'integer', minimum: 1, maximum: 10000 } }, required: ['device_id', 'path'] },
  { name: 'write_file_on_device', operation: 'write_file', description: 'Create or overwrite a text file on a linked Windows device.', properties: { device_id: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' }, mode: { type: 'string', enum: ['rewrite', 'append'] } }, required: ['device_id', 'path', 'content'] },
  { name: 'edit_block_on_device', operation: 'edit_block', description: 'Replace one matching text block on a linked Windows device.', properties: { device_id: { type: 'string' }, path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['device_id', 'path', 'old_string', 'new_string'] },
  { name: 'list_directory_on_device', operation: 'list_directory', description: 'List a directory on a linked Windows device.', properties: { device_id: { type: 'string' }, path: { type: 'string' }, max_entries: { type: 'integer', minimum: 1, maximum: 1000 } }, required: ['device_id', 'path'] },
  { name: 'create_directory_on_device', operation: 'create_directory', description: 'Create a directory on a linked Windows device.', properties: { device_id: { type: 'string' }, path: { type: 'string' } }, required: ['device_id', 'path'] },
  { name: 'move_file_on_device', operation: 'move_file', description: 'Move or rename a file on a linked Windows device.', properties: { device_id: { type: 'string' }, source: { type: 'string' }, destination: { type: 'string' } }, required: ['device_id', 'source', 'destination'] },
  { name: 'get_file_info_on_device', operation: 'get_file_info', description: 'Get metadata for a file or directory on a linked Windows device.', properties: { device_id: { type: 'string' }, path: { type: 'string' } }, required: ['device_id', 'path'] },
  { name: 'search_files_on_device', operation: 'search_files', description: 'Search text in files on a linked Windows device.', properties: { device_id: { type: 'string' }, path: { type: 'string' }, query: { type: 'string' }, file_pattern: { type: 'string' }, max_results: { type: 'integer', minimum: 1, maximum: 500 } }, required: ['device_id', 'path', 'query'] },
];
const deviceToolSpecs = deviceToolDefinitions.map(spec => {
  const { operation, properties, required, ...metadata } = spec;
  return {
    ...metadata,
    annotations: { readOnlyHint: !operation || ['read_file', 'list_directory', 'get_file_info', 'search_files'].includes(operation), destructiveHint: Boolean(operation && !['read_file', 'list_directory', 'get_file_info', 'search_files'].includes(operation)), idempotentHint: !operation || ['read_file', 'list_directory', 'get_file_info', 'search_files', 'get_file_info'].includes(operation), openWorldHint: operation === 'run_command' || operation === 'windows_tool' },
    inputSchema: { type: 'object', additionalProperties: false, properties, required },
  };
});
const deviceToolsByName = new Map(deviceToolDefinitions.map(tool => [tool.name, tool]));

/** One local process shared by authorized MCP clients through an authenticated endpoint. */
export async function startGateway({ port = 8767, publicUrl, connectionSecret, configDir, privilegeControl, workflowEnabled, corpClock, corpProjectsRoot, arenaProjectsRoot, corpFolderPicker = createCorpFolderBrowser() } = {}) {
  if (typeof connectionSecret !== 'string' || connectionSecret.length < 24) {
    throw new Error('connectionSecret must contain at least 24 characters.');
  }
  if (!configDir) throw new Error('An isolated configDir is required.');
  const privilege = privilegeControl ?? createPrivilegeControl({ root: ROOT, enabled: process.platform === 'win32' && resolve(configDir, '..') === resolve(ROOT, '.local-data') });
  const issuer = new URL(publicUrl);
  if ((issuer.protocol !== 'https:' && !(issuer.protocol === 'http:' && isLoopback(issuer.hostname))) ||
      issuer.username || issuer.password || issuer.search || issuer.hash || issuer.pathname !== '/') {
    throw new Error('publicUrl must be an HTTPS origin (HTTP loopback is allowed for local tests).');
  }
  const resource = new URL('/mcp', issuer);
  const secretHash = digest(connectionSecret);
  const requestHistory = await createRequestHistory(resolve(configDir, '..', 'request-history.jsonl'), { secretValues: [connectionSecret] });
  const chatLinks = await createChatLinksStore(resolve(configDir, '..', 'chat-links.json'));
  const addCorpWorkspace=async item=>{let link;try{link=parseProjectLink(item.chatUrl);}catch{link=parseChatLink(item.chatUrl);}if(link.projectId&&arena.snapshot().arenas.some(row=>row.projectId===link.projectId))throw Error('arena_project_reserved');return chatLinks.addWorkspace(item);};
  const corp = await createCorpRuntime(resolve(configDir, '..', 'corp-state.json'), { workspaces: () => chatLinks.workspaces(), createWorkspace:addCorpWorkspace, syncProject:input=>chatLinks.syncProject(input), ...(corpClock ? { clock: corpClock } : {}),...(corpProjectsRoot?{projectsRoot:corpProjectsRoot}:{}) });
  const arena = await createArenaRuntime(resolve(configDir,'..','arena-state.json'),{authenticate:token=>corp.authenticate(token),isPaired:()=>corp.snapshot().paired,projectAllowed:id=>!chatLinks.workspaces().some(project=>project.projectId===id),...(corpClock?{clock:corpClock}:{}),...((arenaProjectsRoot||corpProjectsRoot)?{projectsRoot:arenaProjectsRoot||corpProjectsRoot}:{})});
  const generatedProjects=()=>[
    ...corp.snapshot().bootstraps.map(job=>({...job,channel:'corp',busy:job.status==='running'||corp.snapshot().runs.some(run=>run.workspaceId===job.workspaceId&&run.status==='running'),completed:corp.snapshot().runs.some(run=>run.id===job.runId&&run.status==='done')})),
    ...arena.snapshot().arenas.map(item=>({...item,channel:'arena',chats:arena.snapshot().bootstraps.find(job=>job.arenaId===item.id)?.chats||[],busy:item.status==='running'||arena.snapshot().bootstraps.some(job=>job.arenaId===item.id&&job.status==='running'),completed:item.status==='done'}))
  ];
  const generatedGit=await createGeneratedProjectGit(resolve(configDir,'..','generated-git'),{projects:generatedProjects});
  const lifecycleProjects=()=>[...generatedProjects().map(project=>({...project,chats:(project.chats||[]).map(chat=>({...chat,name:chatLinks.workspaces().find(workspace=>workspace.projectId===project.projectId)?.chats.find(member=>member.chatId===chat.chatId)?.name||chat.name}))})),...chatLinks.workspaces().filter(row=>row.kind==='project'&&!generatedProjects().some(item=>item.projectId===row.projectId)).map(row=>({...row,channel:'corp',busy:corp.snapshot().runs.some(run=>run.workspaceId===row.id&&run.status==='running')}))].flatMap(project=>{const removed=(project.channel==='arena'?arena:corp).deletedTargets().filter(row=>row.projectId===project.projectId);if(removed.some(row=>!row.chatId))return [];return [{...project,chats:(project.chats||[]).filter(chat=>!removed.some(row=>row.chatId===chat.chatId))}];});
  const lifecycle=createProjectLifecycle({projects:lifecycleProjects,onDeleted:async target=>{
    await (target.channel==='arena'?arena:corp).recordDeletion(target);
    for(const workspace of chatLinks.workspaces().filter(row=>row.projectId===target.projectId)){
      if(!target.chatId)await chatLinks.removeWorkspace(workspace.id);
      else await chatLinks.syncProject({workspaceId:workspace.id,projectUrl:workspace.projectUrl||workspace.chatUrl,requested:workspace.sync.requested,status:'complete',chats:workspace.chats.filter(chat=>chat.chatId!==target.chatId).map(chat=>({name:chat.name,chatUrl:chat.chatUrl||chat.url}))});
    }
  }});
  const checkpoint=(channel,input)=>{
    if(input.kind!=='done')return;
    const project=channel==='corp'?generatedProjects().find(row=>row.channel==='corp'&&corp.snapshot().runs.some(run=>run.id===input.runId&&run.workspaceId===row.workspaceId)):generatedProjects().find(row=>row.channel==='arena'&&row.id===(input.arenaId||input.runId));
    const step=channel==='corp'?corp.snapshot().runs.find(run=>run.id===input.runId)?.steps.find(row=>row.id===input.stepId):arena.snapshot().arenas.find(row=>row.id===(input.arenaId||input.runId))?.steps.find(row=>row.id===input.stepId);
    if(project&&step?.status==='done')void generatedGit.checkpoint({channel,id:project.id,checkpoint:input.attempt});
  };
  const deviceRegistry = await createDeviceRegistry({ stateDir: resolve(configDir, '..') });
  const workflowsEnabled = workflowEnabled === undefined ? process.env.UMIBRIDGE_WORKFLOWS === '1' || existsSync(resolve(configDir, 'workflows-enabled')) : workflowEnabled === true || workflowEnabled === '1';
  const workflowLedger = await createWorkflowLedger(resolve(configDir, '..', 'workflows.jsonl'), { enabled: workflowsEnabled });
  if (workflowsEnabled && typeof workflowLedger.recover === 'function') await workflowLedger.recover();
  const skillLibrary = createSkillLibrary({ stateDir: resolve(configDir, '..'), projectDir: ROOT });
  const toolPolicy = createToolPolicy({ stateDir: resolve(configDir, '..') });
  const oauthState = createOAuthState(resolve(configDir, '..', 'oauth-state.json'), issuer.href);
  const { clients, access, refresh } = oauthState;
  const pending = new Map(), codes = new Map();
  const stores = [clients, pending, codes, access, refresh];
  const sweep = () => {
    oauthState.assertHealthy();
    for (const store of stores) for (const [key, value] of store) if (value.expiresAt <= Date.now()) store.delete(key);
  };
  const requireCapacity = store => {
    sweep();
    if (store.size >= 1000) throw new TooManyRequestsError('Too many active requests.');
  };
  const checkResource = requested => {
    if (requested && !sameResource(requested, resource)) throw new InvalidTargetError('Unknown resource.');
  };
  const checkScopes = scopes => {
    if (scopes?.some(scope => !['desktop', 'offline_access'].includes(scope))) throw new InvalidScopeError('Unknown scope.');
    return ['desktop', ...(scopes?.includes('offline_access') ? ['offline_access'] : [])];
  };
  const grantFor = (store, key, client) => {
    sweep();
    const grant = store.get(key);
    if (!grant || grant.clientId !== client.client_id) throw new InvalidGrantError('Invalid or expired grant.');
    return grant;
  };
  const issueTokens = (client, scopes, allowRefresh = client.grant_types?.includes('refresh_token') || scopes.includes('offline_access')) => {
    requireCapacity(access); requireCapacity(refresh);
    const clientId = client.client_id;
    const accessToken = randomToken(), refreshToken = allowRefresh ? randomToken() : undefined;
    access.set(accessToken, { clientId, scopes, refreshToken, expiresAt: Date.now() + 15 * 60_000 });
    if (refreshToken) refresh.set(refreshToken, { clientId, scopes, accessToken, expiresAt: Date.now() + 30 * 24 * 60 * 60_000 });
    clients.get(clientId).expiresAt = Date.now() + 365 * 24 * 60 * 60_000;
    oauthState.save();
    return { access_token: accessToken, token_type: 'Bearer', expires_in: 900, refresh_token: refreshToken, scope: scopes.join(' ') };
  };
  const revoke = (store, key) => {
    const grant = store.get(key);
    if (!grant) return;
    access.delete(grant.accessToken ?? key);
    refresh.delete(grant.refreshToken ?? key);
  };
  const consentPage = (id, request, message = '') => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect to UmiBridge</title><style>body{font:17px/1.6 system-ui;background:#f3f5f7;color:#17202a;padding:36px 20px}main{max-width:540px;margin:auto;background:white;border:1px solid #d6dde3;border-radius:18px;padding:30px}h1{font-size:26px;line-height:1.3}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;padding:12px;border-radius:8px;border:1px solid #8d9ba7}button{margin-top:18px;background:#155bcc;color:white;cursor:pointer}small{overflow-wrap:anywhere;color:#475867}.error{color:#a71919}</style><main><h1>Connect to your computer</h1><p lang="vi">Kết nối với máy tính của bạn</p><p><strong>${escapeHtml(request.client.client_name || 'MCP application')}</strong> wants to read or modify files and execute commands on this computer.</p><p lang="vi">Ứng dụng này yêu cầu quyền đọc, sửa tệp và chạy lệnh trên máy tính của bạn.</p><p>Only authorize this connection if you initiated it yourself.</p><p lang="vi">Chỉ cấp quyền nếu chính bạn đã chủ động thêm kết nối này.</p><small>OAuth redirect URL / Địa chỉ chuyển hướng: ${escapeHtml(request.params.redirectUri)}</small>${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ''}<form method="post" action="/consent"><input type="hidden" name="requestId" value="${id}"><p><label for="secret">Connection code from the UmiBridge terminal (mã kết nối trong cửa sổ UmiBridge)</label><input id="secret" name="secret" type="password" autocomplete="off" required autofocus maxlength="256"></p><button type="submit">Authorize connection / Cho phép kết nối</button></form></main></html>`;
  const sendConsent = (res, id, request, message) => {
    // Chromium also applies form-action to the final redirect after a form POST.
    const callbackOrigin = new URL(request.params.redirectUri).origin;
    res.set('Content-Security-Policy', contentSecurityPolicy.replace("form-action 'self'", `form-action 'self' ${callbackOrigin}`));
    res.type('html').send(consentPage(id, request, message));
  };

  const provider = {
    clientsStore: {
      getClient(clientId) { sweep(); return clients.get(clientId)?.client; },
      registerClient(client) {
        if (!client.redirect_uris?.length || client.redirect_uris.length > 10) throw new InvalidClientMetadataError('Invalid redirect URIs.');
        for (const uri of client.redirect_uris) {
          const url = new URL(uri);
          if ((url.protocol !== 'https:' && !(isLoopback(issuer.hostname) && url.protocol === 'http:' && isLoopback(url.hostname))) || url.hash || url.username || url.password) {
            throw new InvalidClientMetadataError('Redirect URIs must use HTTPS.');
          }
        }
        requireCapacity(clients);
        const registered = { ...client, client_id: randomToken(), client_id_issued_at: Math.floor(Date.now() / 1000) };
        clients.set(registered.client_id, { client: registered, expiresAt: Date.now() + 365 * 24 * 60 * 60_000 });
        oauthState.save();
        return registered;
      }
    },
    async authorize(client, params, res) {
      checkResource(params.resource); params.scopes = checkScopes(params.scopes);
      requireCapacity(pending);
      const id = randomToken(), csrf = randomToken();
      const request = { client, params, csrf, attempts: 0, expiresAt: Date.now() + 5 * 60_000 };
      pending.set(id, request);
      res.cookie('dc_authorize', csrf, { httpOnly: true, secure: issuer.protocol === 'https:', sameSite: 'lax', maxAge: 5 * 60_000, path: '/consent' });
      sendConsent(res, id, request);
    },
    async challengeForAuthorizationCode(client, code) { return grantFor(codes, code, client).codeChallenge; },
    async exchangeAuthorizationCode(client, code, _verifier, redirectUri, requestedResource) {
      const grant = grantFor(codes, code, client);
      codes.delete(code); // Consume before issuing; replay and redirect failures cannot reuse it.
      if (redirectUri !== grant.redirectUri) throw new InvalidGrantError('Redirect URI does not match.');
      checkResource(requestedResource);
      return issueTokens(client, grant.scopes);
    },
    async exchangeRefreshToken(client, token, scopes, requestedResource) {
      const grant = grantFor(refresh, token, client);
      checkResource(requestedResource);
      if (scopes?.some(scope => !grant.scopes.includes(scope))) throw new InvalidScopeError('Cannot extend granted scopes.');
      const effectiveScopes = [...new Set(scopes ?? grant.scopes)];
      if (!effectiveScopes.includes('desktop')) throw new InvalidScopeError('The desktop scope is required.');
      revoke(refresh, token);
      return issueTokens(client, effectiveScopes, true);
    },
    async verifyAccessToken(token) {
      sweep();
      const grant = access.get(token);
      if (!grant) throw new InvalidTokenError('Invalid or expired access token.');
      return { token, clientId: grant.clientId, scopes: grant.scopes, expiresAt: Math.floor(grant.expiresAt / 1000), resource };
    },
    async revokeToken(client, request) {
      for (const store of [access, refresh]) if (store.get(request.token)?.clientId === client.client_id) revoke(store, request.token);
      oauthState.save();
    }
  };

  const backendTransport = new StdioClientTransport({
    command: process.execPath, args: [resolve(ROOT, 'scripts/chatgpt-backend.mjs')], cwd: ROOT, stderr: 'pipe',
    env: { CHATGPT_LOCAL_ONLY: '1', CHATGPT_LOCAL_CONFIG_DIR: resolve(configDir) }
  });
  // The backend may include file contents in diagnostics. Never relay them to public responses or gateway logs.
  backendTransport.stderr?.resume();
  const backend = new Client({ name: 'umibridge-local-web', version: '0.1.0-beta.6' });
  let backendAlive = true, closing = false, httpServer, closePromise;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const connections = new Set();
  const close = () => closePromise ??= (async () => {
    closing = true; backendAlive = false;
    for (const store of stores) store.clear();
    await Promise.allSettled([...connections].map(server => server.close()));
    if (httpServer) await new Promise(resolve => { httpServer.close(resolve); httpServer.closeAllConnections(); });
    await deviceRegistry.close().catch(() => {});
    if (typeof workflowLedger.close === 'function') await workflowLedger.close().catch(() => {});
    await corp.close();
    await arena.close();
    await backend.close().catch(() => {});
    resolveClosed();
  })();
  backend.onclose = () => { backendAlive = false; if (!closing) void close(); };
  backend.onerror = () => { backendAlive = false; if (!closing) void close(); };
  try {
    await backend.connect(backendTransport, { timeout: 30_000 });
    // Ensure the upstream is usable before exposing any HTTP endpoint.
    await backend.listTools({}, { timeout: 30_000 });
    const readToolContext = async () => {
      // The private stdio catalog stays in this process; public tools/list exposes only enabled schemas.
      const listed = await backend.listTools({ _meta: { [CATALOG_META]: true } }, { timeout: 30_000 });
      const backendCatalog = listed._meta?.[CATALOG_META] ?? listed.tools ?? [];
      const paused = existsSync(resolve(configDir, '..', 'windows-tools-disabled'));
      const catalog = [...backendCatalog, ...deviceToolSpecs].map(tool => ({ ...tool, available: !(paused && tool.name.startsWith('windows_') && tool.name !== 'windows_status') }));
      const names = new Set(catalog.map(tool => tool.name));
      const policyCatalog = [...catalog, ...WINDOWS_TOOL_NAMES.filter(name => !names.has(name)).map(name => ({ name, available: false, description: 'Named Windows desktop operation on linked devices. The local worker does not currently expose this operation.' }))];
      const skills = await skillLibrary.list().catch(() => []);
      return { catalog, context: await toolPolicy.snapshot(policyCatalog, skills), paused };
    };
    const deliveredContexts = new Map();
    const deliverContext = (result, context, clientId) => {
      const now = Date.now();
      for (const [key, value] of deliveredContexts) if (value.expiresAt <= now) deliveredContexts.delete(key);
      const previous = deliveredContexts.get(clientId);
      if (previous?.revision === context.revision) return withContext(result, context, true);
      // OAuth registration is capped at 1000 clients; the same bound protects this cache.
      if (deliveredContexts.size >= 1000) deliveredContexts.delete(deliveredContexts.keys().next().value);
      deliveredContexts.set(clientId, { revision: context.revision, expiresAt: now + 24 * 60 * 60_000 });
      return withContext(result, context);
    };
    const capabilities = backend.getServerCapabilities() ?? {};
    const app = express();
    app.disable('x-powered-by');
    if (process.env.UMIBRIDGE_MCP_DIAGNOSTICS === '1') app.use((req, res, next) => {
      const path = req.path;
      if (path === '/mcp' || path.startsWith('/mcp/')) {
        const route = 'mcp';
        res.once('finish', () => {
          const accept = String(req.headers.accept ?? '');
          const protocolVersion = String(req.headers['mcp-protocol-version'] ?? '');
          console.error('[umibridge-mcp]', JSON.stringify({
            httpMethod: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PUT', 'PATCH'].includes(req.method) ? req.method : 'other',
            route,
            rpcMethod: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call'].includes(req.body?.method) ? req.body.method : 'other',
            statusCode: res.statusCode,
            acceptsJson: accept.includes('application/json'), acceptsSse: accept.includes('text/event-stream'),
            isJson: /^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] ?? '')),
            protocolVersion: /^\d{4}-\d{2}-\d{2}$/.test(protocolVersion) ? protocolVersion : 'other',
          }));
        });
      }
      next();
    });
    app.use((req, res, next) => {
      const boundPort = httpServer?.address()?.port ?? port;
      if (![issuer.host, `127.0.0.1:${boundPort}`, `localhost:${boundPort}`].includes(req.headers.host)) return res.sendStatus(403);
      res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': contentSecurityPolicy });
      if (!backendAlive) return res.status(503).json({ error: 'backend_unavailable' });
      next();
    });
    const agentKeyFrom = req => {
      const bearer = String(req.headers.authorization ?? '');
      return String(req.headers['x-umi-agent-key'] ?? '').trim() || (bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '');
    };
    const agentError = (res, cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      const status = /credential|unknown device|unknown job|revoked/i.test(message) ? 401 : 400;
      res.status(status).json({ error: message });
    };
    const resultValue = result => {
      const first = result?.content?.find(item => item?.type === 'text')?.text;
      if (typeof first !== 'string') return result ?? null;
      try { return JSON.parse(first); } catch { return first; }
    };
    const jobResult = job => {
      const result = job.result;
      const images = result?.content?.filter(item => item.type === 'image') ?? [];
      const safe = images.length ? { ...result, content: result.content.filter(item => item.type !== 'image') } : result;
      const content = [{ type: 'text', text: JSON.stringify({ ...job, result: resultValue(safe) }, null, 2) }, ...images];
      return job.status === 'failed' ? { isError: true, content } : { content };
    };
    const callDeviceTool = async (name, args = {}) => {
      const spec = deviceToolsByName.get(name);
      if (!spec) throw new Error(`Unknown device tool: ${name}`);
      if (name === 'list_devices') return { content: [{ type: 'text', text: JSON.stringify(deviceRegistry.listDevices(), null, 2) }] };
      if (name === 'get_device_status') return { content: [{ type: 'text', text: JSON.stringify(deviceRegistry.getDevice(args.device_id), null, 2) }] };
      if (name === 'get_job_status') return jobResult(deviceRegistry.getJob(args.job_id));
      const { device_id: deviceId, ...operationArgs } = args;
      const job = await deviceRegistry.enqueue(deviceId, spec.operation, operationArgs);
      const waitMs = spec.operation === 'run_command'
        ? Math.min(Math.max(Number(operationArgs.timeout_ms) || 120_000, 1_000) + 5_000, 120_000)
        : spec.operation === 'windows_tool' ? 65_000 : 30_000;
      const completed = await deviceRegistry.waitForJob(job.jobId, waitMs);
      const device = deviceRegistry.getDevice(deviceId);
      if (!completed) {
        return { content: [{ type: 'text', text: JSON.stringify({ job_id: job.jobId, device_id: deviceId, hostname: device.hostname, status: 'running', timed_out: true }, null, 2) }] };
      }
      const envelope = { job_id: completed.job_id, device_id: deviceId, hostname: device.hostname, status: completed.status, result: resultValue(completed.result), error: completed.error };
      if (spec.operation === 'windows_tool') return jobResult({ ...completed, device_id: deviceId, hostname: device.hostname });
      const content = [{ type: 'text', text: JSON.stringify(envelope, null, 2) }];
      return completed.status === 'failed' ? { isError: true, content } : { content };
    };
    const agentJson = express.json({ limit: '32kb' });
    app.post('/agent/pair', agentJson, async (req, res) => {
      try { res.json(await deviceRegistry.pair(req.body)); }
      catch (cause) { agentError(res, cause); }
    });
    app.post('/agent/poll', agentJson, async (req, res) => {
      try { res.json(await deviceRegistry.poll({ ...req.body, agentKey: agentKeyFrom(req) })); }
      catch (cause) { agentError(res, cause); }
    });
    app.post('/agent/result', express.json({ limit: '4mb' }), async (req, res) => {
      try { res.json(await deviceRegistry.result({ ...req.body, agentKey: agentKeyFrom(req) })); }
      catch (cause) { agentError(res, cause); }
    });
    app.post('/agent/heartbeat', agentJson, async (req, res) => {
      try { res.json(await deviceRegistry.heartbeat({ ...req.body, agentKey: agentKeyFrom(req) })); }
      catch (cause) { agentError(res, cause); }
    });
    app.get('/health', (_req, res) => res.json({ ok: true }));
    const localAdmin = (req, res, next) => {
      const directLoopback = issuer.protocol === 'http:' && isLoopback(req.hostname);
      if (req.headers['x-local-admin'] !== '1' && !directLoopback) return res.sendStatus(404);
      next();
    };
    app.get('/', localAdmin, (_req, res) => res.redirect('/admin'));
    app.get('/admin', localAdmin, (_req, res) => {
      res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.type('html').send(renderAdminPage());
    });
    app.get('/admin/i18n.js', localAdmin, (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.type('application/javascript').send(readFileSync(new URL('./admin-i18n.js', import.meta.url), 'utf8'));
    });
    const startedAt = Date.now();
    app.get('/admin/api/requests', localAdmin, async (_req, res) => {
      const { context } = await readToolContext();
      const desktop = context.allows('windows_status')
        ? resultValue(await backend.callTool({ name: 'windows_status', arguments: {} }, undefined, { timeout: 5_000 }))
        : { state: 'disabled', available: false, enabled: false, message: 'Windows status tool is disabled in Dashboard Settings.' };
      res.json({
      stats: requestHistory.stats(), requests: requestHistory.list(),
      runtime: { startedAt: new Date(startedAt).toISOString(), uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), endpoint: resource.href, localOnly: true, desktop,
        connection: { mode: issuer.hostname.endsWith('.trycloudflare.com') ? 'temporary' : issuer.protocol === 'https:' ? 'persistent' : 'local',
          authorizedClients: clients.size, refreshGrants: refresh.size, codeSaved: true } }
      });
    });
    app.get('/admin/api/chats', localAdmin, (_req, res) => res.json({ links: chatLinks.resolve(requestHistory.list(500)), workspaces: chatLinks.workspaces() }));
    app.get('/admin/api/usage', localAdmin, async (req, res) => {
      const filters = Object.fromEntries(Object.entries(req.query).filter(([, value]) => typeof value === 'string'));
      const report = await requestHistory.analytics(filters, corp.usage(), corpClock?.(), arena.usage());
      const snapshot = corp.snapshot();
      res.set('Cache-Control', 'no-store').json({ ...report, corpRetention: 5000,
        limits: snapshot.runs.flatMap(run => run.steps.filter(step => ['limit_wait', 'blocked'].includes(step.status) && step.limitText).map(step => ({
          runId: run.id, title: run.title, role: step.role, chatId: step.chatId, resetAt: step.resetAt, notice: step.limitText,
          autoResume: snapshot.autoResume && snapshot.enabled && run.status === 'running', status: step.status,
        }))) });
    });
    app.get('/admin/api/skills', localAdmin, async (_req, res) => {
      try { res.json({ skills: await skillLibrary.list(), recommended: RECOMMENDED_SKILLS }); }
      catch { res.status(500).json({ error: 'Unable to load local skills.' }); }
    });
    app.get('/admin/api/skills/:name', localAdmin, async (req, res) => {
      try {
        const skill = await skillLibrary.read(req.params.name);
        res.json(skill);
      } catch (error) { res.status(400).json({ error: error.message }); }
    });
    // This header is a browser CSRF barrier: a third-party page cannot set it without CORS preflight.
    const adminWrite = (req, res, next) => req.headers['x-dc-admin-action'] === '1' ? next() : res.sendStatus(403);
    const corpJson = express.json({ limit: '256kb' });
    const arenaJson=express.json({limit:'1mb'});
    const corpHandler = action => async (req, res) => {
      try { res.json(await action(req)); }
      catch (error) { res.status(['invalid_corp_key','invalid_arena_key'].includes(error.message) ? 401 : error.message.endsWith('_not_found') ? 404 : 400).json({ error: error.message }); }
    };
    const pairBrowser=async()=>{await arena.settings({enabled:false});return corp.pair();};
    const revokeBrowser=async()=>{await arena.settings({enabled:false});return corp.revoke();};
    app.get('/admin/api/corp', localAdmin, (_req, res) => res.json({ ...corp.snapshot(), workspaces: chatLinks.workspaces() }));
    app.post('/admin/api/corp/folder', localAdmin, adminWrite, corpJson, corpHandler(req => corpFolderPicker(req.body ?? {})));
    app.post('/admin/api/folders', localAdmin, adminWrite, corpJson, corpHandler(req => corpFolderPicker(req.body ?? {})));
    app.get('/admin/api/arena', localAdmin, (_req,res)=>res.set('Cache-Control','no-store').json(arena.snapshot()));
    app.post('/admin/api/arena/settings',localAdmin,adminWrite,corpJson,corpHandler(req=>arena.settings(req.body??{})));
    app.post('/admin/api/arena/arenas',localAdmin,adminWrite,corpJson,corpHandler(req=>arena.create(req.body??{})));
    app.post('/admin/api/arena/arenas/:id/:action',localAdmin,adminWrite,corpHandler(req=>arena.action(req.params.id,req.params.action)));
    for(const action of ['poll','report','authorize','bootstrap-authorize','bootstrap-report']){
      const method={'bootstrap-authorize':'bootstrapAuthorize','bootstrap-report':'bootstrapReport'}[action]||action;
      app.post('/admin/arena/bridge/'+action,localAdmin,arenaJson,corpHandler(async req=>{if(action==='poll')corp.authenticate(String(req.headers.authorization??'').replace(/^Bearer /,''));if(action==='poll'&&!/^([1-9]\d*\.|0\.([7-9]|[1-9]\d)\.)/.test(req.body?.extensionVersion||''))return {command:null,monitors:[],bootstrap:null};const result=await arena[method](String(req.headers.authorization??'').replace(/^Bearer /,''),req.body??{});if(action==='report')checkpoint('arena',req.body??{});if(action==='poll'){const preference=corp.snapshot().modelPreference;if(preference){if(result.command)result.command.modelPreference=preference;if(result.bootstrap)result.bootstrap.modelPreference=preference;}}return action==='poll'?{...result,lifecycle:/^(?:[1-9]\d*\.|0\.(?:[8-9]|[1-9]\d)\.)/.test(req.body?.extensionVersion||'')?lifecycle.poll():null,resetGeneration:corp.snapshot().resetGeneration}:result;}));
    }
    app.get('/admin/api/generated-git',localAdmin,(_req,res)=>res.set('Cache-Control','no-store').json(generatedGit.snapshot()));
    app.post('/admin/api/generated-git/settings',localAdmin,adminWrite,corpJson,corpHandler(req=>generatedGit.settings(req.body??{})));
    app.post('/admin/api/generated-git/archive',localAdmin,adminWrite,corpJson,corpHandler(req=>generatedGit.archive(req.body??{})));
    app.get('/admin/api/project-lifecycle',localAdmin,(_req,res)=>res.set('Cache-Control','no-store').json({actions:lifecycle.snapshot(),projects:lifecycleProjects().map(({id,channel,name,projectId,chats,busy})=>({id,channel,name,projectId,chats,busy})),cleanupSuggestions:generatedProjects().filter(row=>row.cleanupAfterDelivery&&row.completed).map(({id,channel,name,projectId})=>({id,channel,name,projectId}))}));
    app.post('/admin/api/project-lifecycle/prepare',localAdmin,adminWrite,corpJson,corpHandler(req=>lifecycle.prepare(req.body??{})));
    app.post('/admin/api/project-lifecycle/confirm',localAdmin,adminWrite,corpJson,corpHandler(req=>lifecycle.confirm(req.body??{})));
    for(const action of ['authorize','report'])app.post('/admin/corp/bridge/lifecycle-'+action,localAdmin,corpJson,corpHandler(req=>{corp.authenticate(String(req.headers.authorization??'').replace(/^Bearer /,''));return lifecycle[action](req.body??{});}));
    for(const action of ['authorize','report'])app.post('/admin/arena/bridge/lifecycle-'+action,localAdmin,corpJson,corpHandler(req=>{corp.authenticate(String(req.headers.authorization??'').replace(/^Bearer /,''));return lifecycle[action](req.body??{});}));
    app.post('/admin/api/browser/pair',localAdmin,adminWrite,corpHandler(pairBrowser));
    app.post('/admin/api/browser/revoke',localAdmin,adminWrite,corpHandler(revokeBrowser));
    app.post('/admin/api/corp/settings', localAdmin, adminWrite, corpJson, corpHandler(req => corp.settings(req.body ?? {})));
    app.post('/admin/api/corp/team', localAdmin, adminWrite, corpJson, corpHandler(req => corp.team(req.body ?? {})));
    app.post('/admin/api/corp/pair', localAdmin, adminWrite, corpHandler(pairBrowser));
    app.post('/admin/api/corp/revoke', localAdmin, adminWrite, corpHandler(revokeBrowser));
    app.post('/admin/api/corp/runs', localAdmin, adminWrite, corpJson, corpHandler(req => corp.create(req.body ?? {})));
    app.post('/admin/api/corp/ideas', localAdmin, adminWrite, corpJson, corpHandler(req => corp.idea(req.body ?? {})));
    app.post('/admin/api/corp/arenas', localAdmin, adminWrite, (_req,res)=>res.status(410).json({error:'arena_moved',path:'/admin/api/arena/arenas'}));
    app.post('/admin/api/corp/arenas/:id/:action', localAdmin, adminWrite, (_req,res)=>res.status(410).json({error:'arena_moved',path:'/admin/api/arena/arenas'}));
    app.post('/admin/api/corp/projects', localAdmin, adminWrite, corpJson, corpHandler(req => {if(req.body?.kind==='arena')throw Error('arena_moved');return corp.bootstrap(req.body ?? {});}));
    app.post('/admin/api/corp/projects/:id/:action', localAdmin, adminWrite, corpJson, corpHandler(req => corp.bootstrapAction(req.params.id,req.params.action)));
    app.post('/admin/corp/bridge/bootstrap-authorize', localAdmin, corpJson, corpHandler(req=>corp.bootstrapAuthorize(String(req.headers.authorization??'').replace(/^Bearer /,''),req.body??{})));
    app.post('/admin/corp/bridge/bootstrap-report', localAdmin, corpJson, corpHandler(req=>corp.bootstrapReport(String(req.headers.authorization??'').replace(/^Bearer /,''),req.body??{})));
    app.post('/admin/api/corp/runs/:id/:action', localAdmin, adminWrite, corpHandler(req => corp.action(req.params.id, req.params.action)));
    for (const action of ['poll', 'report', 'authorize','models']) {
      app.post(`/admin/corp/bridge/${action}`, localAdmin, corpJson, corpHandler(async req => {
        const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
        if(action==='poll'&&!/^([1-9]\d*\.|0\.([7-9]|[1-9]\d)\.)/.test(req.body?.extensionVersion||'')){return corp.poll(token,{...(req.body??{}),suppressDispatch:true});}
        const result = await corp[action](token, req.body ?? {});
        if(action==='report')checkpoint('corp',req.body??{});
        if(action==='poll'&&corp.snapshot().modelPreference){if(result.command)result.command.modelPreference=corp.snapshot().modelPreference;if(result.bootstrap)result.bootstrap.modelPreference=corp.snapshot().modelPreference;}
        return action === 'poll' ? { ...result,lifecycle:/^(?:[1-9]\d*\.|0\.(?:[8-9]|[1-9]\d)\.)/.test(req.body?.extensionVersion||'')?lifecycle.poll():null, modelScan:corp.snapshot().modelScan, resetGeneration:corp.snapshot().resetGeneration, projects: chatLinks.workspaces().filter(item => item.kind === 'project' && !corp.snapshot().bootstraps.some(job=>job.workspaceId===item.id&&!['done','cancelled'].includes(job.status))).map(({id, projectId, chatUrl, sync}) => ({id, projectId, chatUrl, requested: sync.requested})) } : result;
      }));
    }
    app.post('/admin/corp/bridge/sync', localAdmin, express.json({ limit: '1mb' }), corpHandler(req => {
      corp.authenticate(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
      return chatLinks.syncProject(req.body ?? {});
    }));
    app.post('/admin/api/workspaces/sync', localAdmin, adminWrite, corpJson, corpHandler(req => chatLinks.requestProjectSync(req.body?.id)));
    app.use('/admin/corp/office', localAdmin, (_req, res, next) => {
      res.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'");
      next();
    }, express.static(resolve(ROOT, 'scripts/corp-office'), { dotfiles: 'deny', index: 'index.html' }));
    app.use('/admin/arena/assets', localAdmin, express.static(resolve(ROOT, 'scripts/arena-assets'), {dotfiles:'deny', index:false}));
    for (const asset of ['help-center.js', 'model-settings.js', 'corp-dashboard.js', 'corp-dashboard.css', 'arena-dashboard.js', 'arena-dashboard.css', 'dashboard-experience.js', 'dashboard-experience.css', 'folder-dialog.js', 'usage-dashboard.js', 'console.css']) {
      app.get('/admin/' + asset, localAdmin, (_req, res) => res.sendFile(resolve(ROOT, 'scripts', asset)));
    }
    const workflowAvailable = (_req, res, next) => {
      if (!workflowsEnabled) return res.status(404).json({ error: 'workflows_disabled', enabled: false });
      next();
    };
    const workflowJson = express.json({ limit: '256kb' });
    const workflowStatus = cause => {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/version_conflict|dispatch_conflict|conflict/i.test(message)) return 409;
      if (/not found|unknown workflow|workflow_not_found/i.test(message)) return 404;
      if (/disabled/i.test(message)) return 404;
      return 400;
    };
    const workflowError = (res, cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(workflowStatus(cause)).json({ error: message });
    };
    const setWorkflowVersion = (res, workflow) => {
      if (Number.isSafeInteger(workflow?.version)) res.set('ETag', `W/\"${workflow.version}\"`);
      return res;
    };
    const workflowWithLinks = workflow => {
      if (!workflow) return workflow;
      const missing = [];
      for (const requestId of workflow.request_ids ?? []) {
        if (!requestHistory.has(requestId)) missing.push({ kind: 'request', id: requestId, reason: 'request_missing' });
      }
      if (workflow.job_id) {
        try { deviceRegistry.getJob(workflow.job_id); }
        catch { missing.push({ kind: 'job', id: workflow.job_id, reason: 'job_missing' }); }
      }
      return { ...workflow, missing_links: missing.slice(0, 50) };
    };
    const workflowsWithLinks = workflows => workflows.map(workflowWithLinks);
    const expectedWorkflowVersion = (body, req) => {
      const value = body.version ?? String(req.headers['if-match'] ?? '').match(/\d+/)?.[0];
      if (value === undefined || value === '') return undefined;
      return Number(value);
    };
    app.get('/admin/api/workflows', localAdmin, workflowAvailable, async (req, res) => {
      try {
        const filters = {};
        for (const key of ['projectKey', 'chatKey', 'status', 'from', 'to']) if (typeof req.query[key] === 'string') filters[key] = req.query[key];
        if (typeof req.query.limit === 'string') filters.limit = req.query.limit;
        res.json({ enabled: true, workflows: workflowsWithLinks(await workflowLedger.list(filters)) });
      } catch (cause) { workflowError(res, cause); }
    });
    app.post('/admin/api/workflows', localAdmin, workflowAvailable, adminWrite, workflowJson, async (req, res) => {
      try {
        const workflow = await workflowLedger.create(req.body ?? {});
        setWorkflowVersion(res, workflow).status(201).json(workflowWithLinks(workflow));
      } catch (cause) { workflowError(res, cause); }
    });
    app.post('/admin/api/workflows/export', localAdmin, workflowAvailable, adminWrite, workflowJson, async (_req, res) => {
      try { res.json(await workflowLedger.exportData()); }
      catch (cause) { workflowError(res, cause); }
    });
    app.post('/admin/api/workflows/import', localAdmin, workflowAvailable, adminWrite, workflowJson, async (req, res) => {
      try { res.json(await workflowLedger.importData(req.body ?? {})); }
      catch (cause) { workflowError(res, cause); }
    });
    app.get('/admin/api/workflows/:workflowId/events', localAdmin, workflowAvailable, async (req, res) => {
      try {
        const events = typeof workflowLedger.getEvents === 'function'
          ? await workflowLedger.getEvents(req.params.workflowId)
          : typeof workflowLedger.events === 'function'
            ? await workflowLedger.events(req.params.workflowId)
            : (await workflowLedger.get(req.params.workflowId))?.events ?? [];
        res.json({ events });
      } catch (cause) { workflowError(res, cause); }
    });
    app.get('/admin/api/workflows/:workflowId', localAdmin, workflowAvailable, async (req, res) => {
      try {
        const workflow = await workflowLedger.get(req.params.workflowId);
        if (!workflow) return res.status(404).json({ error: 'workflow_not_found' });
        setWorkflowVersion(res, workflow).json(workflowWithLinks(workflow));
      } catch (cause) { workflowError(res, cause); }
    });
    app.patch('/admin/api/workflows/:workflowId', localAdmin, workflowAvailable, adminWrite, workflowJson, async (req, res) => {
      try {
        const body = { ...(req.body ?? {}) };
        const expectedVersion = expectedWorkflowVersion(body, req);
        delete body.version;
        const workflow = await workflowLedger.update(req.params.workflowId, body, expectedVersion);
        setWorkflowVersion(res, workflow).json(workflowWithLinks(workflow));
      } catch (cause) { workflowError(res, cause); }
    });
    app.post('/admin/api/workflows/:workflowId/link-job', localAdmin, workflowAvailable, adminWrite, workflowJson, async (req, res) => {
      try {
        const body = { ...(req.body ?? {}) };
        const expectedVersion = expectedWorkflowVersion(body, req);
        delete body.version;
        const linked = await workflowLedger.linkJob(req.params.workflowId, { ...body, expectedVersion });
        setWorkflowVersion(res, linked).json(workflowWithLinks(linked));
      } catch (cause) { workflowError(res, cause); }
    });
    app.get('/admin/api/privilege', localAdmin, async (_req, res) => {
      res.set('Cache-Control', 'no-store').json(await privilege.status());
    });
    app.post('/admin/api/privilege', localAdmin, adminWrite, express.json({ limit: '1kb' }), async (req, res) => {
      try {
        const result = await privilege.change(req.body);
        res.status(result.pending ? 202 : 200).json(result);
      } catch (error) {
        res.status([400, 409].includes(error.status) ? error.status : 500).json({ error: ['invalid_mode', 'privilege_unavailable', 'privilege_pending'].includes(error.message) ? error.message : 'privilege_failed' });
      }
    });
    const toolSettings = context => ({ tools: context.tools, autoPrompt: context.autoPrompt, prompt: context.prompt, revision: context.revision });
    app.get('/admin/api/tools', localAdmin, async (_req, res) => {
      try { res.json(toolSettings((await readToolContext()).context)); }
      catch { res.status(500).json({ error: 'Unable to load local tool settings.' }); }
    });
    app.post('/admin/api/tools', localAdmin, adminWrite, express.json({ limit: '2kb' }), async (req, res) => {
      try {
        const { context } = await readToolContext();
        await toolPolicy.update(req.body, context.tools);
        res.json(toolSettings((await readToolContext()).context));
      } catch (cause) { res.status(400).json({ error: cause.message }); }
    });
    app.post('/admin/api/windows', localAdmin, adminWrite, express.json({ limit: '1kb' }), async (req, res) => {
      if (typeof req.body?.enabled !== 'boolean') return res.sendStatus(400);
      const marker = resolve(configDir, '..', 'windows-tools-disabled');
      if (req.body.enabled) await unlink(marker).catch(error => { if (error.code !== 'ENOENT') throw error; });
      else await writeFile(marker, 'paused\n', { mode: 0o600 });
      res.json({ enabled: req.body.enabled });
    });
    app.post('/admin/api/workspaces', localAdmin, adminWrite, express.json({ limit: '3kb' }), async (req, res) => {
      try { res.json({ workspace: await addCorpWorkspace(req.body ?? {}) }); }
      catch (error) { res.status(400).json({ error: error.message }); }
    });
    app.post('/admin/api/workspaces/remove', localAdmin, adminWrite, express.json({ limit: '1kb' }), async (req, res) => {
      if (typeof req.body?.id !== 'string') return res.sendStatus(400);
      await chatLinks.removeWorkspace(req.body.id);
      res.json({ ok: true });
    });
    app.post('/admin/api/connection/code', localAdmin, adminWrite, (_req, res) => res.json({ connectionCode: connectionSecret }));
    app.get('/admin/api/devices', localAdmin, (_req, res) => res.json({ devices: deviceRegistry.listDevices(), jobs: deviceRegistry.listJobs({ limit: 100 }) }));
    app.post('/admin/api/devices/pairing', localAdmin, adminWrite, express.json({ limit: '2kb' }), async (req, res) => {
      try { res.json(await deviceRegistry.createPairing(req.body?.label)); }
      catch (cause) { res.status(400).json({ error: cause.message }); }
    });
    app.post('/admin/api/devices/:deviceId/revoke', localAdmin, adminWrite, async (req, res) => {
      try { res.json(await deviceRegistry.revokeDevice(req.params.deviceId)); }
      catch (cause) { res.status(400).json({ error: cause.message }); }
    });
    app.get('/admin/api/jobs/:jobId', localAdmin, (req, res) => {
      try { res.json(deviceRegistry.getJob(req.params.jobId)); }
      catch (cause) { res.status(404).json({ error: cause.message }); }
    });
    const skillJson = express.json({ limit: '2kb' });
    app.post('/admin/api/skills', localAdmin, adminWrite, skillJson, async (req, res) => {
      try { res.json({ ok: true, skill: await skillLibrary.add(req.body?.folder) }); }
      catch (error) { res.status(400).json({ error: error.message }); }
    });
    app.post('/admin/api/skills/enable', localAdmin, adminWrite, skillJson, async (req, res) => {
      try { res.json({ ok: true, skill: await skillLibrary.setEnabled(req.body?.name, req.body?.enabled) }); }
      catch (error) { res.status(400).json({ error: error.message }); }
    });
    app.post('/admin/api/skills/remove', localAdmin, adminWrite, skillJson, async (req, res) => {
      try { res.json({ ok: true, skill: await skillLibrary.remove(req.body?.name) }); }
      catch (error) { res.status(400).json({ error: error.message }); }
    });
    app.post('/admin/api/chats', localAdmin, adminWrite, express.json({ limit: '2kb' }), async (req, res) => {
      try {
        if (!requestHistory.has(req.body?.requestId)) return res.status(404).json({ error: 'Request is no longer in local history.' });
        const link = await chatLinks.set(req.body.requestId, req.body.chatUrl);
        res.json({ ok: true, link });
      } catch (error) { res.status(400).json({ error: error.message }); }
    });
    app.post('/admin/api/chats/unlink', localAdmin, adminWrite, express.json({ limit: '2kb' }), async (req, res) => {
      const requestId = req.body?.requestId;
      if (typeof requestId !== 'string' || requestId.length > 120) return res.sendStatus(400);
      await chatLinks.unlink(requestId);
      res.json({ ok: true });
    });
    app.post('/admin/api/clear', localAdmin, async (_req, res) => {
      await requestHistory.clear();
      await chatLinks.clear();
      res.json({ ok: true });
    });
    // Shared limit intentionally counts all tunnel requests together on this single-user server.
    let failedWindow = Date.now(), failedAttempts = 0;
    app.post('/consent', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
      sweep();
      const request = pending.get(req.body.requestId);
      const cookie = String(req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith('dc_authorize='))?.slice(13);
      if (!request || cookie !== request.csrf || (req.headers.origin && req.headers.origin !== issuer.origin)) return res.status(400).send('Invalid or expired authorization request. Please reconnect.');
      if (Date.now() - failedWindow > 15 * 60_000) { failedWindow = Date.now(); failedAttempts = 0; }
      if (failedAttempts >= 10 || request.attempts >= 5) return res.status(429).send('Too many incorrect attempts. Please retry after 15 minutes.');
      const supplied = typeof req.body.secret === 'string' ? req.body.secret : '';
      if (!timingSafeEqual(secretHash, digest(supplied))) {
        failedAttempts++; request.attempts++;
        res.status(401);
        return sendConsent(res, req.body.requestId, request, 'Incorrect connection code. / Mã kết nối chưa đúng.');
      }
      pending.delete(req.body.requestId);
      requireCapacity(codes);
      const code = randomToken();
      codes.set(code, { clientId: request.client.client_id, codeChallenge: request.params.codeChallenge, redirectUri: request.params.redirectUri, scopes: request.params.scopes, expiresAt: Date.now() + 60_000 });
      const redirect = new URL(request.params.redirectUri);
      redirect.searchParams.set('code', code);
      if (request.params.state !== undefined) redirect.searchParams.set('state', request.params.state);
      res.clearCookie('dc_authorize', { path: '/consent', httpOnly: true, secure: issuer.protocol === 'https:', sameSite: 'lax' });
      res.redirect(302, redirect.href);
    });
    app.use(mcpAuthRouter({ provider, issuerUrl: issuer, resourceServerUrl: resource, scopesSupported: ['desktop', 'offline_access'], resourceName: 'UmiBridge Sakura Console', clientRegistrationOptions: { clientSecretExpirySeconds: 0 } }));
    app.use('/mcp', requireBearerAuth({ verifier: provider, requiredScopes: ['desktop'], expectedResource: resource, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource) }));
    const handleMcp = async (req, res) => {
      const initialization = req.body?.method === 'initialize' ? (await readToolContext()).context : undefined;
      const server = new Server({ name: 'umibridge-sakura-console', version: '1.0.0' }, { capabilities: { tools: {}, ...(capabilities.resources ? { resources: {} } : {}) }, instructions: [baseInstructions, initialization?.prompt].filter(Boolean).join('\n\n') });
      const options = { timeout: 120_000 };
      server.setRequestHandler(ListToolsRequestSchema, async () => {
        const { catalog, context } = await readToolContext();
        return { tools: catalog.filter(tool => context.allows(tool.name)).map(({ available, ...tool }) => tool) };
      });
      server.setRequestHandler(CallToolRequestSchema, async request => {
        const startedAt = performance.now();
        const clientName = clients.get(req.auth?.clientId)?.client.client_name;
        const { context, paused } = await readToolContext();
        let result;
        try {
          context.assertCall(request.params.name, request.params.arguments ?? {});
          if (paused && request.params.name === 'windows_on_device') throw new Error('Windows desktop tools are paused. Enable them in Dashboard Settings.');
          result = deviceToolsByName.has(request.params.name)
            ? await callDeviceTool(request.params.name, request.params.arguments ?? {})
            : withoutContext(await backend.callTool(request.params, undefined, options));
        } catch (cause) {
          result = { isError: true, content: [{ type: 'text', text: `Error: ${cause instanceof Error ? cause.message : String(cause)}` }] };
        }
        await requestHistory.add(request.params.name, request.params.arguments, result, performance.now() - startedAt, clientName);
        return deliverContext(result, context, req.auth?.clientId);
      });
      if (capabilities.resources) {
        server.setRequestHandler(ListResourcesRequestSchema, request => backend.listResources(request.params, options));
        server.setRequestHandler(ReadResourceRequestSchema, request => backend.readResource(request.params, options));
        server.setRequestHandler(ListResourceTemplatesRequestSchema, request => backend.listResourceTemplates(request.params, options));
      }
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, keepAliveMs: 1000 });
      connections.add(server);
      res.on('close', () => { connections.delete(server); void server.close(); });
      try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
      catch { if (!res.headersSent) res.status(503).json({ error: 'mcp_unavailable' }); }
    };
    app.post('/mcp', express.json({ limit: '2mb' }), handleMcp);
    app.all('/mcp', (_req, res) => res.set('Allow', 'POST').sendStatus(405));
    app.use((_error, _req, res, _next) => { if (!res.headersSent) res.status(400).json({ error: 'invalid_request' }); });
    httpServer = await new Promise((resolve, reject) => {
      const server = app.listen(port, '127.0.0.1', () => resolve(server));
      server.on('error', reject);
    });
    if (!backendAlive) { await close(); throw new Error('UmiBridge backend disconnected.'); }
    return { port: httpServer.address().port, publicUrl: issuer.href, url: resource.href, backendPid: backendTransport.pid, close, closed };
  } catch (error) { await close(); throw error; }
}
