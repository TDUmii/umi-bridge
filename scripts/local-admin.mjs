import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { dirname, join, win32 } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Tiktoken } from 'js-tiktoken/lite';
import o200k from 'js-tiktoken/ranks/o200k_base';
import { readUsageReport } from './usage-analytics.mjs';

const tokenizer = new Tiktoken(o200k);

export function countTextTokens(value) {
  const text = String(value ?? '');
  if (text.length > 65_536 || /[^\s]{4096}/u.test(text)) return null;
  try { return tokenizer.encode(text, [], []).length; } catch { return null; }
}

const MAX_ENTRIES = 500;
const MAX_TEXT = 500;
const MAX_COMMAND_OUTPUT = 12_000;
const sensitiveKey = /^(content|data|input|text|value|message|args|arguments|password|secret|token|authorization|cookie)$/i;
const home = homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const homePattern = home ? new RegExp(home, 'ig') : null;
const outputSecretPattern = /((?:authorization\s*:\s*bearer|password|passwd|token|secret|api[-_]?key|cookie)\s*[:=]\s*)([^\s,;]+)/ig;

function safeString(value) {
  const text = String(value).replace(homePattern ?? /$^/, '~');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

function safeArguments(value, key, depth = 0, sanitize = safeString) {
  if (key && sensitiveKey.test(key)) return '[redacted for privacy]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitize(value);
  if (depth >= 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map(item => safeArguments(item, key, depth + 1, sanitize));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([name, item]) => [sanitize(name), safeArguments(item, name, depth + 1, sanitize)]));
  }
  return String(value);
}

function outputFor(result, safeOutput) {
  const text = result?.content?.find(item => item?.type === 'text')?.text;
  if (typeof text !== 'string' || !text) return null;
  try {
    const payload = JSON.parse(text);
    if (payload && typeof payload === 'object' && ('stdout' in payload || 'stderr' in payload || 'exit_code' in payload)) {
      return {
        exitCode: Number.isInteger(payload.exit_code) ? payload.exit_code : null,
        timedOut: Boolean(payload.timed_out),
        stdout: safeOutput(payload.stdout),
        stderr: safeOutput(payload.stderr),
      };
    }
  } catch { /* Keep non-JSON tool errors as a bounded output message. */ }
  return { exitCode: null, timedOut: Boolean(result?.isError), stdout: safeOutput(text), stderr: '' };
}

// This bridge sees tool payloads, not the provider's model billing or chat context.
function estimateUsage(toolName, args, result) {
  const input = JSON.stringify({ name: toolName, arguments: args ?? {} });
  const output = JSON.stringify((result?.content ?? []).filter(item => item?.type === 'text'));
  const bytes = { inputBytes: Buffer.byteLength(input), outputBytes: Buffer.byteLength(output) };
  // Bound synchronous BPE work; never delay a command for optional analytics.
  const skipped = input.length + output.length > 65_536 || /[^\s]{4096}/u.test(input + output);
  const base = { ...bytes, estimated: true, method: 'o200k_base', scope: 'text-tool-payloads', providerReported: null };
  if (skipped) return { ...base, inputTokens: null, outputTokens: null, totalTokens: null, skipped: 'payload-size' };
  try {
    const inputTokens = tokenizer.encode(input, [], []).length;
    const outputTokens = tokenizer.encode(output, [], []).length;
    return { ...base, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
  } catch {
    return { ...base, inputTokens: null, outputTokens: null, totalTokens: null, skipped: 'tokenizer-error' };
  }
}

function measuredUsage(entry) {
  const usage = entry?.usage;
  return usage?.estimated === true && usage.method === 'o200k_base' &&
    ['inputTokens', 'outputTokens', 'totalTokens'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0) &&
    usage.totalTokens === usage.inputTokens + usage.outputTokens ? usage : null;
}

function recordFor(toolName, args, result, duration, safeOutput, clientName) {
  const sanitize = value => safeString(safeOutput(value));
  // DCR names are self-declared display labels, never authorization rules.
  const name = safeOutput(typeof clientName === 'string' ? clientName : '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
  const provider = /\b(?:chatgpt|openai)\b/i.test(name) ? 'chatgpt' : 'other';
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    toolName: sanitize(toolName),
    arguments: safeArguments(toolName.startsWith('dc_') ? {details:'[omitted for privacy]'} : toolName === 'windows_multi_edit' ? { ...args, labels: '[redacted for privacy]', locs: '[redacted for privacy]' } : args, undefined, 0, sanitize),
    status: result?.isError ? 'error' : 'ok',
    contentItems: Array.isArray(result?.content) ? result.content.length : 0,
    durationMs: Math.max(0, Math.round(duration)),
    provider,
    clientName: name || 'Unknown app',
    usage: estimateUsage(toolName, args, result),
  };
  if (toolName === 'run_command') {
    entry.command = sanitize(args?.command ?? '');
    entry.cwd = sanitize(args?.cwd ?? 'project root');
    entry.output = outputFor(result, safeOutput);
  }
  return entry;
}

export async function createRequestHistory(filePath, { secretValues = [] } = {}) {
  const secretPatterns = secretValues.filter(value => typeof value === 'string' && value.length >= 8)
    .map(value => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
  const safeOutput = value => {
    let text = String(value ?? '').replace(homePattern ?? /$^/, '~').replace(outputSecretPattern, '$1[redacted]');
    for (const pattern of secretPatterns) text = text.replace(pattern, '[redacted]');
    if (text.length > MAX_COMMAND_OUTPUT) return `${text.slice(0, MAX_COMMAND_OUTPUT)}\n[output truncated]`;
    return text;
  };
  await mkdir(dirname(filePath), { recursive: true });
  let entries = [];
  let received = { total: 0, success: 0, errors: 0 };
  const emptyUsage = () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, measuredRequests: 0 });
  let tokenTotals = emptyUsage();
  let tokenProviders = new Map();
  let legacyMeasurements = 0;
  let skippedMeasurements = 0;
  let payloadBytes = { inputBytes: 0, outputBytes: 0 };
  let daily = new Map();
  const retain = entry => {
    received.total++;
    if (entry.status === 'ok') received.success++; else received.errors++;
    const usage = measuredUsage(entry);
    if (entry.usage?.method === 'utf8-bytes/4') legacyMeasurements++;
    if (entry.usage?.skipped) skippedMeasurements++;
    for (const key of ['inputBytes', 'outputBytes']) {
      if (Number.isSafeInteger(entry.usage?.[key]) && entry.usage[key] >= 0) payloadBytes[key] += entry.usage[key];
    }
    const day = entry.timestamp.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Date.parse(day) >= Date.now() - 31 * 86400_000) {
      const bucket = daily.get(day) ?? { day, count: 0, errors: 0, totalTokens: 0, durationMs: 0 };
      bucket.count++;
      bucket.errors += entry.status === 'ok' ? 0 : 1;
      bucket.totalTokens += usage?.totalTokens ?? 0;
      bucket.durationMs += Number(entry.durationMs) || 0;
      daily.set(day, bucket);
      for (const key of daily.keys()) if (Date.parse(key) < Date.now() - 31 * 86400_000) daily.delete(key);
    }
    if (usage) {
      const provider = entry.provider === 'chatgpt' ? 'chatgpt' : 'other';
      const group = tokenProviders.get(provider) ?? emptyUsage();
      for (const key of ['inputTokens', 'outputTokens', 'totalTokens']) {
        tokenTotals[key] += usage[key];
        group[key] += usage[key];
      }
      tokenTotals.measuredRequests++;
      group.measuredRequests++;
      tokenProviders.set(provider, group);
    }
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();
  };
  try {
    // Restore totals without loading the growing journal into memory.
    const lines = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (item?.id && item?.timestamp && item?.toolName) retain(item);
      } catch { /* Ignore incomplete or invalid journal lines. */ }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  let writes = Promise.resolve();
  const enqueue = task => {
    writes = writes.then(task, task);
    return writes;
  };
  return {
    add(toolName, args, result, duration, clientName) {
      const entry = recordFor(toolName, args, result, duration, safeOutput, clientName);
      retain(entry);
      return enqueue(() => appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8'));
    },
    list(limit = 200) {
      const safeLimit = Math.min(Math.max(Number(limit) || 0, 0), MAX_ENTRIES);
      return entries.slice(-safeLimit).reverse();
    },
    has(requestId) { return entries.some(entry => entry.id === requestId); },
    async analytics(filters, corpUsage = [], now, arenaUsage = []) {
      await writes;
      return readUsageReport(filePath, filters, corpUsage, now, arenaUsage, join(dirname(filePath),'token-history.jsonl'));
    },
    stats() {
      const tools = new Set(entries.map(entry => entry.toolName));
      const success = entries.filter(entry => entry.status === 'ok').length;
      const errors = entries.length - success;
      const elapsed = entries.map(entry => entry.durationMs).filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
      const averageMs = elapsed.length ? Math.round(elapsed.reduce((a, b) => a + b, 0) / elapsed.length) : null;
      const p95Ms = elapsed.length ? elapsed[Math.ceil(elapsed.length * .95) - 1] : null;
      const toolCounts = new Map();
      for (const entry of entries) {
        const name = entry.toolName;
        const current = toolCounts.get(name) ?? { name, count: 0, errors: 0, totalDuration: 0, ...emptyUsage() };
        current.count++;
        current.errors += entry.status === 'ok' ? 0 : 1;
        current.totalDuration += entry.durationMs;
        const usage = measuredUsage(entry);
        if (usage) {
          for (const key of ['inputTokens', 'outputTokens', 'totalTokens']) current[key] += usage[key];
          current.measuredRequests++;
        }
        toolCounts.set(name, current);
      }
      const toolBreakdown = [...toolCounts.values()].sort((a, b) => b.count - a.count);
      const recent24h = entries.filter(entry => Date.now() - Date.parse(entry.timestamp) <= 86400_000 && Date.now() >= Date.parse(entry.timestamp)).length;
      const hourly = [];
      const now = new Date();
      const currentHour = Math.floor(now.getTime() / 3600_000);
      for (let offset = 11; offset >= 0; offset--) {
        const start = (currentHour - offset) * 3600_000;
        hourly.push({ hour: new Date(start).toISOString(), count: entries.filter(entry => {
          const ms = Date.parse(entry.timestamp);
          return ms >= start && ms < start + 3600_000;
        }).length });
      }
      const tokens = { ...tokenTotals, unmeasuredRequests: received.total - tokenTotals.measuredRequests,
        ...payloadBytes, legacyMeasurements, skippedMeasurements,
        estimated: true, method: 'o200k_base', scope: 'text-tool-payloads', providerReported: null,
        byProvider: [...tokenProviders].map(([provider, usage]) => ({ provider, ...usage })),
        recentTools: toolBreakdown.filter(tool => tool.measuredRequests).sort((a,b) => b.totalTokens - a.totalTokens).slice(0, 6) };
      return { total: entries.length, received: { ...received }, tokens, historyLimit: MAX_ENTRIES, tools: tools.size, latest: entries.at(-1)?.timestamp ?? null,
        success, errors, averageMs, p95Ms, p50Ms: elapsed.length ? elapsed[Math.floor((elapsed.length - 1) / 2)] : null,
        recent24h, toolBreakdown, hourly, daily: [...daily.values()].sort((a,b) => a.day.localeCompare(b.day)) };
    },
    clear() {
      entries = [];
      received = { total: 0, success: 0, errors: 0 };
      tokenTotals = emptyUsage();
      tokenProviders = new Map();
      legacyMeasurements = 0;
      skippedMeasurements = 0;
      payloadBytes = { inputBytes: 0, outputBytes: 0 };
      daily = new Map();
      return enqueue(() => writeFile(filePath, '', 'utf8'));
    },
  };
}


/** Optional, user-entered conversation links. The MCP protocol does not expose chat IDs. */
export function parseChatLink(raw) {
  if (typeof raw !== 'string' || raw.length > 500) throw new Error('Provide a valid ChatGPT conversation URL.');
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('Use a full ChatGPT HTTPS URL.'); }
  if (url.protocol !== 'https:' ||
      !['chatgpt.com', 'chat.openai.com'].includes(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('Only HTTPS links from chatgpt.com or chat.openai.com are accepted, without query parameters.');
  }
  const match = url.pathname.match(/^\/(?:g\/[a-zA-Z0-9_-]+\/)?(?:c|share)\/([a-zA-Z0-9_-]{6,100})\/?$/);
  if (!match) throw new Error('The URL must point to a ChatGPT conversation (/c/...) or shared chat (/share/...).');
  const projectId = url.pathname.match(/^\/g\/(g-p-[a-f0-9]{32})(?:-[a-zA-Z0-9_-]+)?\//)?.[1];
  return { chatId: match[1], chatUrl: url.origin + url.pathname.replace(/\/$/, ''), kind: url.pathname.includes('/share/') ? 'shared' : 'conversation', provider: 'chatgpt', ...(projectId ? { projectId } : {}) };
}

export function parseProjectLink(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { throw Error('Use a full ChatGPT Project HTTPS URL.'); }
  const match = url.pathname.match(/^\/g\/(g-p-[a-f0-9]{32})(?:-[a-zA-Z0-9_-]+)?\/project\/?$/);
  if (String(raw).length > 500 || url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' || url.username || url.password || url.port || url.search || url.hash || !match) throw Error('Use a ChatGPT Project URL: https://chatgpt.com/g/g-p-.../project');
  return { kind: 'project', provider: 'chatgpt', projectId: match[1], chatUrl: `https://chatgpt.com/g/${match[1]}/project` };
}

export async function createChatLinksStore(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
  let links = new Map();
  let workspaces = [];
  const normalizePath = value => {
    if (typeof value !== 'string' || value.length > 700 || /[\u0000-\u001f]/.test(value)) throw new Error('Use an absolute Windows folder path.');
    const path = value.trim().replace(/\//g, '\\');
    if (!/^[a-z]:\\/i.test(path) || path.split('\\').some(part => part === '..' || part === '.')) throw new Error('Use an absolute Windows folder path.');
    const normalized = win32.normalize(path);
    return /^[a-z]:\\$/i.test(normalized) ? normalized : normalized.replace(/\\+$/, '');
  };
  const projectChat = (item, projectId) => {
    const chat = parseChatLink(item.chatUrl);
    if (chat.kind !== 'conversation' || chat.projectId !== projectId) throw Error('chat_outside_project');
    return { ...chat, name: String(item.name ?? '').trim().slice(0, 180) || chat.chatId };
  };
  const validateWorkspace = item => {
    let parsed;
    try { parsed = parseProjectLink(item.chatUrl); } catch { parsed = parseChatLink(item.chatUrl); }
    const workspace = { id: typeof item.id === 'string' && /^[a-zA-Z0-9-]{6,80}$/.test(item.id) ? item.id : randomUUID(),
      name: String(item.name ?? '').trim().slice(0, 80) || 'Project', root: normalizePath(item.root), ...parsed };
    if (parsed.kind === 'project') {
      workspace.chats = [];
      for (const chat of (Array.isArray(item.chats) ? item.chats : []).slice(0, 1000)) {
        try { const valid = projectChat(chat, parsed.projectId); if (!workspace.chats.some(row => row.chatId === valid.chatId)) workspace.chats.push(valid); } catch { /* Never restore a chat from another Project. */ }
      }
      workspace.sync = { status: 'pending', requested: randomUUID() };
    }
    return workspace;
  };
  try {
    const stored = JSON.parse(await readFile(filePath, 'utf8'));
    if (Array.isArray(stored) || [2, 3].includes(stored?.version)) {
      for (const item of (Array.isArray(stored?.workspaces) ? stored.workspaces : []).slice(0, 50)) {
        try { workspaces.push(validateWorkspace(item)); } catch { /* Invalid saved scope is never applied. */ }
      }
      for (const entry of (Array.isArray(stored) ? stored : Array.isArray(stored.links) ? stored.links : []).slice(-MAX_ENTRIES)) {
        if (typeof entry?.requestId !== 'string' || entry.requestId.length > 120) continue;
        try {
          links.set(entry.requestId, { requestId: entry.requestId, ...parseChatLink(entry.chatUrl), linkedAt: entry.linkedAt || null });
        } catch { /* Ignore tampered or obsolete entries. */ }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  let pendingWrite = Promise.resolve();
  const persist = () => {
    const snapshot = JSON.stringify({ version: 3, links: [...links.values()], workspaces });
    const write = () => writeFile(filePath, snapshot, { encoding: 'utf8', mode: 0o600 });
    pendingWrite = pendingWrite.then(write, write);
    return pendingWrite;
  };
  return {
    list() { return [...links.values()]; },
    workspaces() { return structuredClone(workspaces); },
    resolve(entries) {
      return entries.flatMap(entry => {
        if (links.has(entry.id)) return [links.get(entry.id)];
        const args = entry.arguments ?? {};
        const paths = [args.path, args.cwd, args.source, args.destination, args.source_path, args.destination_path].filter(value => typeof value === 'string');
        const matches = workspaces.filter(workspace => workspace.provider === entry.provider && paths.some(value => {
          try {
            const expanded = value.startsWith('~\\') || value.startsWith('~/') ? homedir() + value.slice(1) : value;
            const path = normalizePath(expanded).toLowerCase(), root = workspace.root.toLowerCase();
            return path === root || path.startsWith(root.endsWith('\\') ? root : root + '\\');
          } catch { return false; }
        }));
        // Multiple chats sharing a folder cannot be distinguished by MCP. Leave unassigned.
        return matches.length === 1 ? [{ ...matches[0], workspaceId: matches[0].id, requestId: entry.id }] : [];
      });
    },
    async addWorkspace(item) {
      if (workspaces.length >= 50) throw new Error('Maximum 50 project groups.');
      const workspace = validateWorkspace({ ...item, id: randomUUID() });
      if (workspace.kind === 'project' && workspaces.some(row => row.projectId === workspace.projectId && row.kind === 'project')) throw Error('Project already added. Select it in Corp.');
      workspaces.push(workspace);
      await persist();
      return workspace;
    },
    async requestProjectSync(id) {
      const workspace = workspaces.find(item => item.id === id && item.kind === 'project');
      if (!workspace) throw Error('project_not_found');
      workspace.sync = { status: 'pending', requested: randomUUID() }; await persist(); return structuredClone(workspace);
    },
    async syncProject(input) {
      const workspace = workspaces.find(item => item.id === input.workspaceId && item.kind === 'project');
      if (!workspace) throw Error('project_not_found');
      if (parseProjectLink(input.projectUrl).projectId !== workspace.projectId) throw Error('chat_outside_project');
      if (input.requested !== workspace.sync.requested) throw Error('stale_project_sync');
      if (!Array.isArray(input.chats) || input.chats.length > 1000 || !['partial', 'complete', 'unavailable'].includes(input.status)) throw Error('invalid_project_sync');
      const chats = input.chats.map(item => projectChat(item, workspace.projectId));
      // Partial/virtualized pages merge observations. Only a completed scan can remove membership.
      const members = new Map((input.status === 'complete' ? [] : workspace.chats).map(item => [item.chatId, item]));
      const added = chats.some(chat => !members.has(chat.chatId));
      for (const chat of chats) members.set(chat.chatId, chat);
      if (members.size > 1000) throw Error('project_chat_capacity');
      const next = [...members.values()];
      const status = input.status === 'partial' && workspace.sync.status === 'complete' && !added ? 'complete' : input.status;
      if (JSON.stringify(next) !== JSON.stringify(workspace.chats) || workspace.sync.status !== status) {
        workspace.chats = next; workspace.sync = { ...workspace.sync, status, at: new Date().toISOString() }; await persist();
      }
      return structuredClone(workspace);
    },
    async removeWorkspace(id) { workspaces = workspaces.filter(item => item.id !== id); await persist(); },
    async set(requestId, rawUrl) {
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{6,120}$/.test(requestId)) throw new Error('Invalid request ID.');
      const parsed = parseChatLink(rawUrl);
      links.set(requestId, { requestId, ...parsed, linkedAt: new Date().toISOString() });
      if (links.size > MAX_ENTRIES) links.delete(links.keys().next().value);
      await persist();
      return links.get(requestId);
    },
    async unlink(requestId) { links.delete(requestId); await persist(); },
    async clear() { links.clear(); workspaces = []; await persist(); },
  };
}

export function renderAdminPage() {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  return readFileSync(new URL('./admin-dashboard.html', import.meta.url), 'utf8').replaceAll('{{APP_VERSION}}', version);
}
