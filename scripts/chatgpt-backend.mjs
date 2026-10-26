import { createCommandSession } from './command-session.mjs';
import {readOrchestrationSettings} from './orchestration-state.mjs';
import { createWindowsTools } from './windows-tools.mjs';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, readdir, stat, writeFile, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createSkillLibrary } from './skill-library.mjs';
import { baseInstructions, CATALOG_META, createToolPolicy, withContext } from './tool-policy.mjs';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_READ_LINES = 1000;
// The gateway passes the isolated profile path to the backend subprocess.
const skillStateDir = process.env.CHATGPT_LOCAL_CONFIG_DIR ? resolve(process.env.CHATGPT_LOCAL_CONFIG_DIR, '..') : resolve(ROOT, '.local-data');
const skillLibrary = createSkillLibrary({ stateDir: skillStateDir, projectDir: ROOT });
const toolPolicy = createToolPolicy({ stateDir: skillStateDir });
const commandSession = createCommandSession({ cwd: ROOT });
const windowsTools = createWindowsTools({ root: ROOT });
const windowsPaused = () => existsSync(resolve(skillStateDir, 'windows-tools-disabled'));

const tools = [
  {
    name: 'windows_status',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Check whether the Windows desktop tools are installed, ready or paused. Desktop input affects this PC. The user can pause it in Dashboard Settings and regain control with the Windows-MCP takeover shortcut.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'list_skills',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'List UmiBridge and compatible external SKILL.md documents and their enabled states. Manage them in the local /admin Skill Center. Automatic context includes enabled summaries only; full documents require read_skill. No skill scripts run automatically.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'read_skill',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Read the SKILL.md instructions of an enabled skill appropriate to the user task. Reads text only; never runs skill scripts automatically.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', description: 'Skill name returned by list_skills, e.g. ui-ux-pro-max.' } }, required: ['name'] },
  },
  {
    name: 'read_file',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Read a local text file with optional starting line and maximum line count.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'File path.' },
        offset: { type: 'integer', minimum: 0, description: 'Zero-based starting line.' },
        length: { type: 'integer', minimum: 1, maximum: 10000, description: 'Maximum lines to read.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    description: 'Create or overwrite a local text file.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'File path.' },
        content: { type: 'string', description: 'Content to write.' },
        mode: { type: 'string', enum: ['rewrite', 'append'], description: 'Use rewrite to replace content or append to add content.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_block',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    description: 'Replace exactly one matching text block in a file.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', description: 'Original text block (must occur exactly once).' },
        new_string: { type: 'string', description: 'Replacement text block.' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'list_directory',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'List files and subfolders in a local directory.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Directory path.' },
        max_entries: { type: 'integer', minimum: 1, maximum: 1000 },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_directory',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Create a directory and any missing parent directories.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'move_file',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    description: 'Move or rename a local file or directory.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { source: { type: 'string' }, destination: { type: 'string' } },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'get_file_info',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Get basic metadata for a local file or directory.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'search_files',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Search for text in files within a directory.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'Root directory to search.' },
        query: { type: 'string', description: 'Case-insensitive search term.' },
        file_pattern: { type: 'string', description: 'Optional file extension or name filter, e.g. .js or README.' },
        max_results: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
      },
      required: ['path', 'query'],
    },
  },
  {
    name: 'run_command',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    description: 'Execute a command in the prestarted hidden PowerShell session and return stdout, stderr and the exit code. Ordinary calls reuse the session; timeout or shell exit resets it. Start-Process defaults to Hidden; invoke console programs directly to capture output, and specify -WindowStyle Normal only when the user requests a visible application. The command and bounded output appear in the local admin history.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        command: { type: 'string', description: 'Command to run.' },
        cwd: { type: 'string', description: 'Optional working directory.' },
        timeout_ms: { type: 'integer', minimum: 1000, maximum: 120000, default: 120000 },
      },
      required: ['command'],
    },
  },
];

const text = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const error = message => ({ isError: true, content: [{ type: 'text', text: `Error: ${message}` }] });
const pathOf = value => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('path must be a non-empty string.');
  return resolve(value);
};
const bounded = (value, fallback, max) => Math.min(Math.max(Number(value) || fallback, 1), max);

async function readTextFile(filePath, offset = 0, length = DEFAULT_READ_LINES) {
  const buffer = await readFile(filePath);
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error(`File exceeds the ${MAX_FILE_BYTES}-byte limit.`);
  const source = buffer.toString('utf8');
  const lines = source.split(/\r?\n/);
  const selected = lines.slice(offset, offset + length);
  return { text: selected.join('\n'), totalLines: lines.length, start: offset, end: Math.min(offset + selected.length, lines.length) };
}

async function searchFiles(rootPath, query, pattern, limit) {
  const results = [];
  const needle = query.toLocaleLowerCase();
  const ignored = new Set(['.git', 'node_modules', '.local-data', 'dist']);
  async function visit(current, depth) {
    if (depth > 20 || results.length >= limit) return;
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (results.length >= limit || ignored.has(entry.name)) continue;
      const target = resolve(current, entry.name);
      if (entry.isDirectory()) { await visit(target, depth + 1); continue; }
      if (!entry.isFile() || (pattern && !entry.name.toLowerCase().includes(pattern.toLowerCase()))) continue;
      try {
        const buffer = await readFile(target);
        if (buffer.byteLength > 512 * 1024 || buffer.includes(0)) continue;
        const lines = buffer.toString('utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
          if (results.length < limit && line.toLocaleLowerCase().includes(needle)) results.push({ path: target, line: index + 1, text: line.slice(0, 500) });
        });
      } catch { /* Skip unreadable or binary files. */ }
    }
  }
  await visit(rootPath, 0);
  return results;
}

async function runCommand(command, cwd, timeoutMs) {
  const payload = await commandSession.run(command, cwd, timeoutMs);
  const result = text(payload);
  return payload.exit_code === 0 && !payload.timed_out ? result : { ...result, isError: true };
}

async function callTool(name, args = {}) {
  if (name === 'windows_status') return text({ ...windowsTools.status(), ...(windowsPaused() ? { state: 'paused', available: false } : {}), enabled: !windowsPaused() });
  if (name.startsWith('windows_')) {
    if (windowsPaused()) throw new Error('Windows desktop tools are paused. Enable them in Dashboard Settings.');
    return windowsTools.callTool(name, args);
  }
  switch (name) {
    case 'list_skills': return text({ skills: await skillLibrary.list() });
    case 'read_skill': return text(await skillLibrary.read(args.name));
    case 'read_file': {
      const result = await readTextFile(pathOf(args.path), Math.max(Number(args.offset) || 0, 0), bounded(args.length, DEFAULT_READ_LINES, 10000));
      return text(result);
    }
    case 'write_file': {
      const filePath = pathOf(args.path);
      if (typeof args.content !== 'string') throw new Error('content must be a string.');
      if (Buffer.byteLength(args.content, 'utf8') > MAX_FILE_BYTES) throw new Error(`content exceeds the ${MAX_FILE_BYTES}-byte limit.`);
      await mkdir(dirname(filePath), { recursive: true });
      if (args.mode === 'append') await appendFile(filePath, args.content, 'utf8');
      else await writeFile(filePath, args.content, 'utf8');
      return text({ ok: true, path: filePath, bytes: Buffer.byteLength(args.content, 'utf8'), mode: args.mode === 'append' ? 'append' : 'rewrite' });
    }
    case 'edit_block': {
      const filePath = pathOf(args.path);
      if (typeof args.old_string !== 'string' || typeof args.new_string !== 'string') throw new Error('old_string and new_string must be strings.');
      const source = await readFile(filePath, 'utf8');
      const first = source.indexOf(args.old_string);
      if (first < 0) throw new Error('old_string was not found in the file.');
      if (source.indexOf(args.old_string, first + args.old_string.length) >= 0) throw new Error('old_string matches multiple locations.');
      await writeFile(filePath, source.slice(0, first) + args.new_string + source.slice(first + args.old_string.length), 'utf8');
      return text({ ok: true, path: filePath });
    }
    case 'list_directory': {
      const directory = pathOf(args.path);
      const entries = await readdir(directory, { withFileTypes: true });
      const max = bounded(args.max_entries, 200, 1000);
      return text(entries.slice(0, max).map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other' })));
    }
    case 'create_directory': {
      const directory = pathOf(args.path);
      await mkdir(directory, { recursive: true });
      return text({ ok: true, path: directory });
    }
    case 'move_file': {
      const source = pathOf(args.source), destination = pathOf(args.destination);
      await mkdir(dirname(destination), { recursive: true });
      await rename(source, destination);
      return text({ ok: true, source, destination });
    }
    case 'get_file_info': {
      const filePath = pathOf(args.path);
      const info = await stat(filePath);
      return text({ path: filePath, type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other', size: info.size, modified: info.mtime.toISOString(), created: info.birthtime.toISOString() });
    }
    case 'search_files': {
      if (typeof args.query !== 'string' || !args.query) throw new Error('query must be a non-empty string.');
      return text(await searchFiles(pathOf(args.path), args.query, args.file_pattern, bounded(args.max_results, 100, 500)));
    }
    case 'run_command': {
      if (typeof args.command !== 'string' || !args.command.trim()) throw new Error('command must be a non-empty string.');
      const cwd = args.cwd ? pathOf(args.cwd) : ROOT;
      const timeoutMs = bounded(args.timeout_ms, 120000, 120000);
      return runCommand(args.command, cwd, timeoutMs);
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

const currentContext = async () => {
  const catalog = [...tools, ...await windowsTools.listTools()];
  const skills = await skillLibrary.list().catch(() => []);
  return { catalog, context: await toolPolicy.snapshot(catalog, skills) };
};
const initial = await currentContext();
let deliveredRevision;
const server = new Server({ name: 'umibridge-sakura-console', version: '0.1.0-beta.21' }, { capabilities: { tools: {} }, instructions: [baseInstructions, initial.context.prompt].filter(Boolean).join('\n\n') });
server.setRequestHandler(ListToolsRequestSchema, async request => {
  const { catalog, context } = await currentContext();
  const protectedMode=(await readOrchestrationSettings(skillStateDir)).flags.workspaceLocksEnabled;
  return {
    tools: catalog.filter(tool => context.allows(tool.name)&&(!protectedMode||['list_skills','read_skill','windows_status'].includes(tool.name))),
    ...(request.params?._meta?.[CATALOG_META] === true ? { _meta: { [CATALOG_META]: catalog } } : {}),
  };
});
server.setRequestHandler(CallToolRequestSchema, async request => {
  const { context } = await currentContext();
  let result;
  try {
    context.assertCall(request.params.name, request.params.arguments ?? {});
    // Shared OAuth and stdio do not identify a conversation. Fail closed for all
    // global filesystem, shell, Windows and remote operations in protected mode.
    if((await readOrchestrationSettings(skillStateDir)).flags.workspaceLocksEnabled&&!['list_skills','read_skill','windows_status'].includes(request.params.name))throw Error('protected_workspace_requires_scoped_gateway_tool');
    result = await callTool(request.params.name, request.params.arguments ?? {});
  } catch (cause) { result = error(cause instanceof Error ? cause.message : String(cause)); }
  if (deliveredRevision !== context.revision) {
    deliveredRevision = context.revision;
    return withContext(result, context);
  }
  return withContext(result, context, true);
});

const closeWorkers = () => Promise.allSettled([commandSession.close(), windowsTools.close()]);
server.onclose = () => { void closeWorkers(); };
process.stdin.once('end', () => { void closeWorkers(); });
process.once('SIGINT', () => { void closeWorkers().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void closeWorkers().finally(() => process.exit(0)); });
await server.connect(new StdioServerTransport());
// Prepare the hidden host immediately, but keep file tools responsive on cold Windows starts.
void commandSession.start().catch(() => console.error('Background PowerShell is not ready; the next command will retry.'));
