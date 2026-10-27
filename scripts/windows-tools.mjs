import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '0.8.8';
const UMBRIDGE_VERSION = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;
const toolName = name => `windows_${name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase()}`;
const toolError = message => ({ isError: true, content: [{ type: 'text', text: message }] });

/** One hidden stdio worker; listing starts it, failed actions are never replayed. */
export function createWindowsTools({ root = ROOT, executable, args, env = {}, timeoutMs = 60_000 } = {}) {
  root = resolve(root);
  const injected = Boolean(executable);
  const command = executable ?? resolve(root, '.runtime/windows-tools/Scripts/python.exe');
  const configPath = resolve(root, '.local-data/windows-tools.toml');
  const requestTimeout = Math.min(Math.max(Number(timeoutMs) || 60_000, 1_000), 120_000);
  const startupTimeout = Math.min(requestTimeout, 20_000);
  const schemas = new Map();
  let worker, connecting, closePromise, closed = false;
  let state = 'unavailable', message = 'Windows tools are not installed. Open UmiBridge.cmd to set them up.';

  const installed = () => injected || existsSync(command);
  const status = () => ({
    state,
    available: state === 'ready',
    runtimeInstalled: installed(),
    version: UMBRIDGE_VERSION,
    runtimeVersion: VERSION,
    toolCount: schemas.size,
    message,
  });
  const lost = owner => {
    if (worker !== owner) return;
    worker = undefined;
    schemas.clear();
    if (!closed) {
      state = 'error';
      message = 'The Windows worker disconnected. List tools again to reconnect; no action was retried.';
    }
  };

  const connect = async () => {
    if (closed || state === 'ready') return;
    if (connecting) return connecting;
    if (!installed()) {
      state = 'unavailable';
      message = 'Windows tools are not installed. Open UmiBridge.cmd to set them up.';
      return;
    }
    state = 'starting';
    message = 'Starting the hidden Windows worker.';
    connecting = (async () => {
      // An explicit config avoids reading another application's global MCP settings.
      if (!args) {
        await mkdir(dirname(configPath), { recursive: true });
        await writeFile(configPath, '# UmiBridge private Windows tool settings.\n', { flag: 'wx', mode: 0o600 }).catch(error => {
          if (error.code !== 'EEXIST') throw error;
        });
      }
      if (closed) return;
      const transport = new StdioClientTransport({
        command,
        args: args ?? ['-m', 'windows_mcp', 'serve', '--transport', 'stdio', '--config', configPath, '--exclude-tools', 'PowerShell', '--control'],
        cwd: root,
        stderr: 'pipe',
        env: {
          ...env,
          ...(!injected ? { PYTHONPATH: resolve(root, '.runtime/windows-mcp-source/src') } : {}),
          ANONYMIZED_TELEMETRY: 'false',
          POSTHOG_API_KEY: '',
          WINDOWS_MCP_WATCHDOG: 'false',
          WINDOWS_MCP_CONTROL: 'true',
          PYTHONNOUSERSITE: '1',
          NO_COLOR: '1',
        },
      });
      // Never retain diagnostics that can contain window titles or screen contents.
      transport.stderr?.resume();
      const client = new Client({ name: 'umibridge-windows-tools', version: VERSION });
      const owner = { client, transport };
      worker = owner;
      client.onclose = () => lost(owner);
      client.onerror = () => { lost(owner); void client.close().catch(() => {}); };
      try {
        const startedAt = performance.now();
        await client.connect(transport, { timeout: startupTimeout });
        const remaining = Math.floor(startupTimeout - (performance.now() - startedAt));
        if (remaining <= 0) throw new Error('startup-timeout');
        const listed = await client.listTools({}, { timeout: remaining });
        if (closed || worker !== owner) throw new Error('disconnected');
        for (const original of listed.tools ?? []) {
          if (typeof original.name !== 'string' || /^powershell$/i.test(original.name)) continue;
          const name = toolName(original.name);
          if (schemas.has(name)) throw new Error('duplicate-tool');
          schemas.set(name, { originalName: original.name, schema: { ...original, name } });
        }
        state = 'ready';
        message = 'Windows desktop tools are ready.';
      } catch {
        lost(owner);
        await client.close().catch(() => {});
        if (!closed) {
          state = 'error';
          message = 'The Windows worker could not start. Open UmiBridge.cmd to repair its local runtime.';
        }
      }
    })().catch(() => {
      if (!closed) {
        state = 'error';
        message = 'The Windows worker could not initialize its private settings.';
      }
    }).finally(() => { connecting = undefined; });
    return connecting;
  };

  return {
    async listTools() {
      await connect();
      return [...schemas.values()].map(item => item.schema);
    },
    async callTool(name, argumentsValue = {}) {
      if (closed) return toolError('Windows tools have stopped. No action was executed.');
      const spec = schemas.get(name), owner = worker;
      if (!spec || !owner || state !== 'ready') return toolError('Windows tools are unavailable. List tools again to reconnect. No action was executed.');
      if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) return toolError('Tool arguments must be an object. No action was executed.');
      const forwarded = spec.originalName === 'Scrape' ? { ...argumentsValue, use_sampling: false } : argumentsValue;
      try {
        // Preserve image/text blocks and structured results without storing screenshots.
        return await owner.client.callTool({ name: spec.originalName, arguments: forwarded }, undefined, { timeout: requestTimeout });
      } catch {
        // A timeout/disconnect cannot establish whether a click or write completed.
        return toolError('The Windows tool call did not complete. Its action may already have run; inspect current state before continuing. The action was not retried.');
      }
    },
    status,
    close() {
      if (closePromise) return closePromise;
      closed = true;
      state = 'closed';
      message = 'Windows tools have stopped.';
      const owner = worker;
      worker = undefined;
      schemas.clear();
      closePromise = (async () => {
        if (owner) await owner.client.close().catch(() => {});
        await connecting;
      })();
      return closePromise;
    },
  };
}
