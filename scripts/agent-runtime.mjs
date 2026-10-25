import { createCommandSession } from './command-session.mjs';
import { createWindowsTools } from './windows-tools.mjs';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { hostname, platform } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_INTERVAL_MS = 1_500;
const VERSION = '1.0.1';
const commandSession = createCommandSession({ cwd: process.cwd() });
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const windowsTools = createWindowsTools({ root: ROOT });
const windowsToolsDisabled = () => existsSync(join(ROOT, '.local-data', 'windows-tools-disabled'));
const FILE_CAPABILITIES = ['run_command', 'read_file', 'write_file', 'edit_block', 'list_directory', 'create_directory', 'move_file', 'get_file_info', 'search_files'];
const agentCapabilities = () => [...FILE_CAPABILITIES, ...(!windowsToolsDisabled() && windowsTools.status().available ? ['windows_tool'] : [])];

const text = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const error = message => ({ isError: true, content: [{ type: 'text', text: `Error: ${message}` }] });
const pathOf = value => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('path must be a non-empty string.');
  return resolve(value);
};
const bounded = (value, fallback, max) => Math.min(Math.max(Number(value) || fallback, 1), max);

async function readTextFile(filePath, offset = 0, length = 1000) {
  const buffer = await readFile(filePath);
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error(`File exceeds the ${MAX_FILE_BYTES}-byte limit.`);
  const lines = buffer.toString('utf8').split(/\r?\n/);
  const selected = lines.slice(offset, offset + length);
  return { text: selected.join('\n'), totalLines: lines.length, start: offset, end: Math.min(offset + selected.length, lines.length) };
}

async function searchFiles(rootPath, query, pattern, limit) {
  const results = [], needle = query.toLocaleLowerCase();
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
        buffer.toString('utf8').split(/\r?\n/).forEach((line, index) => {
          if (results.length < limit && line.toLocaleLowerCase().includes(needle)) results.push({ path: target, line: index + 1, text: line.slice(0, 500) });
        });
      } catch { /* Ignore unreadable files. */ }
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

export const closeAgentCommands = () => Promise.allSettled([commandSession.close(), windowsTools.close()]);

/** Execute one of the existing safe file/PowerShell operations on this Agent host. */
export async function executeAgentTool(name, args = {}, { windowsWorker = windowsTools } = {}) {
  try {
    switch (name) {
      case 'read_file': return text(await readTextFile(pathOf(args.path), Math.max(Number(args.offset) || 0, 0), bounded(args.length, 1000, 10000)));
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
        return text(entries.slice(0, bounded(args.max_entries, 200, 1000)).map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other' })));
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
        const filePath = pathOf(args.path), info = await stat(filePath);
        return text({ path: filePath, type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other', size: info.size, modified: info.mtime.toISOString(), created: info.birthtime.toISOString() });
      }
      case 'search_files': {
        if (typeof args.query !== 'string' || !args.query) throw new Error('query must be a non-empty string.');
        return text(await searchFiles(pathOf(args.path), args.query, args.file_pattern, bounded(args.max_results, 100, 500)));
      }
      case 'run_command': {
        if (typeof args.command !== 'string' || !args.command.trim()) throw new Error('command must be a non-empty string.');
        return await runCommand(args.command, args.cwd ? pathOf(args.cwd) : process.cwd(), bounded(args.timeout_ms, 120000, 120000));
      }
      case 'windows_tool': {
        if (windowsToolsDisabled() || !windowsWorker.status().available) throw new Error('Windows desktop tools are disabled or unavailable on this device. No action was executed.');
        if (typeof args.name !== 'string' || !/^windows_[a-z0-9_]{1,80}$/.test(args.name)) throw new Error('A Windows tool name is required.');
        if (!args.arguments || typeof args.arguments !== 'object' || Array.isArray(args.arguments)) throw new Error('Windows tool arguments must be an object.');
        if (Buffer.byteLength(JSON.stringify(args), 'utf8') > 64 * 1024) throw new Error('Windows tool arguments exceed the 64 KiB limit.');
        return await windowsWorker.callTool(args.name, args.arguments);
      }
      default: throw new Error(`Unknown Agent tool: ${name}`);
    }
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : String(cause));
  }
}

function parseArgs(argv) {
  const result = { intervalMs: DEFAULT_INTERVAL_MS, once: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--once') result.once = true;
    else if (value === '--pair-code') result.pairCode = argv[++index];
    else if (value === '--hub') result.hub = argv[++index];
    else if (value === '--config') result.config = argv[++index];
    else if (value === '--name') result.name = argv[++index];
    else if (value === '--interval-ms') result.intervalMs = Math.min(Math.max(Number(argv[++index]) || DEFAULT_INTERVAL_MS, 500), 30_000);
    else if (value === '--help') result.help = true;
  }
  return result;
}

function normaliseHub(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Use --hub with the Hub origin, for example https://host.example.');
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Hub must be a clean HTTP(S) origin.');
  return url.origin;
}

async function loadConfig(configPath) {
  try { return JSON.parse(await readFile(configPath, 'utf8')); }
  catch (cause) { if (cause.code === 'ENOENT') throw new Error(`Agent is not paired. Run UmiBridge.cmd -Action pair first and save ${configPath}.`); throw cause; }
}

async function saveConfig(configPath, config) {
  await mkdir(dirname(configPath), { recursive: true });
  const temporary = `${configPath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, configPath);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Hub returned HTTP ${response.status}.`);
  return body;
}

async function pairAgent(options, configPath) {
  const hub = normaliseHub(options.hub);
  if (!options.pairCode) throw new Error('Use --pair-code with the code shown in the Hub dashboard.');
  const body = await requestJson(`${hub}/agent/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: options.pairCode, name: options.name, hostname: hostname(), platform: platform(), version: VERSION, capabilities: FILE_CAPABILITIES }),
  });
  const config = { hub, deviceId: body.device_id, agentKey: body.agent_key, name: body.name || options.name || hostname(), version: VERSION };
  await saveConfig(configPath, config);
  console.log(`Agent paired: ${config.name} (${config.deviceId})`);
  console.log(`Config saved locally: ${configPath}`);
}

async function runAgent(configPath, options) {
  const config = await loadConfig(configPath);
  const headers = { authorization: `Bearer ${config.agentKey}`, 'content-type': 'application/json' };
  let stopping = false;
  const stop = () => { stopping = true; void closeAgentCommands(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    await commandSession.start();
    if (!windowsToolsDisabled()) await windowsTools.listTools();
    console.log('UmiBridge Agent ready. One hidden PowerShell session is waiting for commands.');
    while (!stopping) {
      try {
        const response = await requestJson(`${normaliseHub(config.hub)}/agent/poll`, {
          method: 'POST', headers,
          body: JSON.stringify({ deviceId: config.deviceId, hostname: hostname(), platform: platform(), version: config.version || VERSION, capabilities: agentCapabilities() }),
          timeoutMs: Math.max(options.intervalMs * 3, 10_000),
        });
        if (response.job) {
          const result = await executeAgentTool(response.job.tool, response.job.arguments || {});
          await requestJson(`${normaliseHub(config.hub)}/agent/result`, { method: 'POST', headers, body: JSON.stringify({ deviceId: config.deviceId, jobId: response.job.job_id, result }) });
          console.log(`[${new Date().toLocaleTimeString()}] ${response.job.tool} - ${result.isError ? 'error' : 'ok'}`);
        }
        if (options.once) break;
      } catch (cause) {
        if (options.once) throw cause;
        if (!stopping) process.stderr.write(`[UmiBridge Agent] ${cause.message}\n`);
      }
      if (!options.once && !stopping) await new Promise(resolvePromise => setTimeout(resolvePromise, options.intervalMs));
    }
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    await closeAgentCommands();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: node scripts/agent-runtime.mjs --hub <origin> --pair-code <code> --name <name> [--config <path>]');
    console.log('       node scripts/agent-runtime.mjs --config <path> [--interval-ms 1500]');
    return;
  }
  const configPath = resolve(options.config || join(process.cwd(), '.local-data', 'agent-config.json'));
  if (options.pairCode) return pairAgent(options, configPath);
  return runAgent(configPath, options);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(cause => { console.error(`UmiBridge Agent could not start: ${cause.message}`); process.exitCode = 1; });
}
