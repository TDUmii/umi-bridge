import { spawn as spawnProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const MAX_INPUT_BYTES = 16 * 1024;
const MAX_OUTPUT_WAIT_MS = 25_000;
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const integer = (value, fallback, min, max) => {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw error('invalid_terminal_dimensions');
  return value;
};
const nameFor = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.length > 80 || /[\x00-\x1f\x7f]/.test(value)) throw error('invalid_terminal_name');
  return value.trim();
};
const directoryFor = value => {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value) || !isAbsolute(value)) throw error('invalid_terminal_cwd');
  try {
    const directory = realpathSync(value);
    if (statSync(directory).isDirectory()) return directory;
  } catch { /* Report a stable validation error without leaking filesystem details. */ }
  throw error('invalid_terminal_cwd');
};

// A terminal runs as the local owner; bridge credentials must not be inherited.
export function terminalEnvironment(source = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && !/^(?:DC_|UMI(?:BRIDGE)?_|CODEX_|NODE_OPTIONS$|NODE_PATH$)/i.test(key) &&
        !/(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|AUTHORIZATION|CREDENTIAL)/i.test(key)) env[key] = value;
  }
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  if (process.platform === 'win32') {
    const fallback = (name, value) => { if (!Object.keys(env).some(key => key.toLowerCase() === name.toLowerCase() && env[key])) env[name] = value; };
    fallback('ComSpec', join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32', 'cmd.exe'));
    fallback('PATHEXT', '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC');
  }
  return env;
}

function powershellBootstrap(token) {
  // Get-History describes completed execution, including multiline commands.
  // Reset LASTEXITCODE between prompts so a cmdlet failure cannot inherit an old native failure.
  const script = `Import-Module PSReadLine -ErrorAction SilentlyContinue
if (Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue) {
  Set-PSReadLineOption -HistorySaveStyle SaveNothing
  if ((Get-Command Set-PSReadLineOption).Parameters.ContainsKey('PredictionSource')) { Set-PSReadLineOption -PredictionSource None }
  try { [Microsoft.PowerShell.PSConsoleReadLine]::ClearHistory() } catch {}
}
$global:UmiTerminalHistoryId = 0
$global:UmiTerminalReady = $false
function global:prompt {
  $umiSuccess = $?
  $umiNativeExit = $global:LASTEXITCODE
  $umiRecord = @{ cwd = (Get-Location).Path }
  $umiHistory = Get-History -Count 1
  if ($global:UmiTerminalReady -and $null -ne $umiHistory -and $umiHistory.Id -gt $global:UmiTerminalHistoryId) {
    $global:UmiTerminalHistoryId = $umiHistory.Id
    $umiExit = 0
    if (-not $umiSuccess -or $umiHistory.ExecutionStatus -ne 'Completed') { $umiExit = 1; if ($umiNativeExit -is [int] -and $umiNativeExit -ne 0) { $umiExit = $umiNativeExit } }
    $umiCommand = $umiHistory.CommandLine
    if ($umiCommand.Length -gt 16384) { $umiCommand = $umiCommand.Substring(0, 16384) }
    $umiRecord.command = @{ id = $umiHistory.Id; command = $umiCommand; startedAt = $umiHistory.StartExecutionTime.ToUniversalTime().ToString('o'); durationMs = [Math]::Max(0, ($umiHistory.EndExecutionTime - $umiHistory.StartExecutionTime).TotalMilliseconds); exitCode = $umiExit; executionStatus = $umiHistory.ExecutionStatus.ToString() }
  }
  $umiPayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($umiRecord | ConvertTo-Json -Compress -Depth 4)))
  [Console]::Write(([char]27).ToString() + ']633;UmiBridge;${token};' + $umiPayload + [char]7)
  if ($null -ne $umiHistory) { $global:UmiTerminalHistoryId = $umiHistory.Id }
  $global:UmiTerminalReady = $true
  $global:LASTEXITCODE = 0
  'PS ' + (Get-Location).Path + '> '
}`;
  return Buffer.from(script, 'utf16le').toString('base64');
}

// Only our private prompt marker is removed. All other ANSI/OSC bytes reach xterm.
function markerReader(token, append, update) {
  const prefix = `\x1b]633;UmiBridge;${token};`;
  let pending = '';
  return {
    write(data) {
      pending += data;
      while (pending) {
        const start = pending.indexOf(prefix);
        if (start < 0) {
          let hold = Math.min(prefix.length - 1, pending.length);
          while (hold && !prefix.startsWith(pending.slice(-hold))) hold--;
          append(pending.slice(0, pending.length - hold));
          pending = hold ? pending.slice(-hold) : '';
          return;
        }
        if (start) { append(pending.slice(0, start)); pending = pending.slice(start); }
        const end = pending.indexOf('\x07', prefix.length);
        if (end < 0) {
          if (pending.length > 65536) { append(pending); pending = ''; }
          return;
        }
        const raw = pending.slice(prefix.length, end);
        try { update(JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))); } catch { /* Malformed prompt metadata never executes code. */ }
        pending = pending.slice(end + 1);
      }
    },
    flush() { append(pending); pending = ''; },
  };
}

async function terminateTree(session) {
  if (session.status !== 'running') return;
  if (process.platform === 'win32') {
    await new Promise(resolve => {
      // Use the system executable, never a taskkill found in the terminal's cwd/PATH.
      const killer = spawnProcess(join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(session.pty.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { killer.kill(); resolve(); }, 5000);
      const done = () => { clearTimeout(timer); resolve(); };
      killer.once('error', done);
      killer.once('close', done);
    });
    // Exiting the last process closes ConPTY. Calling kill after taskkill races
    // node-pty's console enumeration and emits an unhandled native helper error.
    if (session.status === 'running') {
      await Promise.race([session.exited, new Promise(resolve => { const timer = setTimeout(resolve, 1000); timer.unref(); })]);
      if (session.status === 'running') { try { session.pty.kill(); } catch { /* Already exited. */ } }
    }
  } else {
    try { process.kill(-session.pty.pid, 'SIGKILL'); } catch { try { session.pty.kill('SIGKILL'); } catch { /* Already exited. */ } }
  }
  await Promise.race([session.exited, new Promise(resolve => { const timer = setTimeout(resolve, 2000); timer.unref(); })]);
  releaseConptyReader(session);
}

function releaseConptyReader(session) {
  // node-pty 1.1.0's bundled ConPTY DLL leaves its reader Worker alive when
  // the last process exits without another data event. Its public kill() does
  // not dispose that Worker in this case. Dispose its connection after exit;
  // this only drains/closes the native reader, and never touches another PTY.
  if (process.platform === 'win32') session.pty._agent?._conoutSocketWorker?.dispose();
}

export function createTerminalRuntime({ cwd = process.cwd(), maxSessions = 8, outputLimitBytes = 256 * 1024, env = process.env } = {}) {
  const defaultCwd = directoryFor(cwd);
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 8 || !Number.isInteger(outputLimitBytes) || outputLimitBytes < 1024 || outputLimitBytes > 256 * 1024) throw error('invalid_terminal_limits');
  const shell = process.platform === 'win32' ? join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : '/bin/sh';
  const sessions = new Map();
  let closed = false, closePromise;
  const find = id => {
    const session = sessions.get(id);
    if (!session) throw error('terminal_not_found', 404);
    return session;
  };
  const snapshot = session => ({ id: session.id, name: session.name, shell, cwd: session.cwd, initialCwd: session.initialCwd,
    status: session.status, exitCode: session.exitCode, signal: session.signal, cols: session.cols, rows: session.rows,
    createdAt: session.createdAt, endedAt: session.endedAt, pid: session.pty.pid, sequence: session.sequence, error: session.ioError ?? null,
    commandTracking: process.platform === 'win32' ? 'powershell-history' : 'unavailable', history: session.history.map(row => ({ ...row })) });
  const running = id => { const session = find(id); if (session.status !== 'running' || session.closing) throw error('terminal_not_running', 409); return session; };
  const notify = session => { for (const wake of [...session.waiters]) wake(); };
  const emergencyClose = () => { for (const session of sessions.values()) if (session.status === 'running') { try { session.pty.kill(); } catch { /* Best effort during process teardown. */ } } };
  process.once('exit', emergencyClose);
  const runtime = {
    list() { return { sessions: [...sessions.values()].map(snapshot), defaultCwd, shell, maxSessions, outputLimitBytes }; },
    get(id) { return snapshot(find(id)); },
    create(options = {}) {
      if (closed) throw error('terminal_runtime_closed', 409);
      if (!options || typeof options !== 'object' || Array.isArray(options)) throw error('invalid_terminal_options');
      if (Object.keys(options).some(key => !['name', 'cwd', 'cols', 'rows'].includes(key))) throw error('invalid_terminal_options');
      if (sessions.size >= maxSessions) throw error('terminal_session_limit', 409);
      const directory = directoryFor(options.cwd ?? defaultCwd);
      const name = nameFor(options.name, `PowerShell ${sessions.size + 1}`);
      const cols = integer(options.cols, 100, 2, 500), rows = integer(options.rows, 28, 2, 200);
      const token = randomBytes(24).toString('hex');
      let child;
      try {
        // Native addon loading is deferred: a missing ConPTY addon must not stop the gateway.
        const pty = require('node-pty');
        child = pty.spawn(shell, process.platform === 'win32' ? ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', powershellBootstrap(token)] : ['-i'], {
          name: 'xterm-256color', cols, rows, cwd: directory, env: terminalEnvironment(env), useConpty: true, useConptyDll: true,
        });
      } catch { throw error('terminal_spawn_failed', 503); }
      const session = { id: randomUUID(), name, pty: child, cwd: directory, initialCwd: directory, cols, rows, status: 'running',
        exitCode: null, signal: null, createdAt: new Date().toISOString(), endedAt: null, history: [], historyId: 0,
        sequence: 0, chunks: [], bytes: 0, discardedThrough: 0, closing: null, waiters: new Set() };
      const append = data => {
        if (!data) return;
        let bytes = Buffer.byteLength(data);
        const seq = ++session.sequence;
        if (bytes > outputLimitBytes) {
          const buffer = Buffer.from(data); let start = buffer.length - outputLimitBytes;
          while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start++;
          data = buffer.subarray(start).toString('utf8'); bytes = Buffer.byteLength(data);
          session.discardedThrough = seq;
        }
        session.chunks.push({ seq, data, bytes }); session.bytes += bytes;
        while (session.bytes > outputLimitBytes || session.chunks.length > 2048) {
          const removed = session.chunks.shift(); session.bytes -= removed.bytes;
          session.discardedThrough = Math.max(session.discardedThrough, removed.seq);
        }
        notify(session);
      };
      const reader = markerReader(token, append, metadata => {
        if (typeof metadata?.cwd === 'string' && metadata.cwd.length <= 4096 && isAbsolute(metadata.cwd)) session.cwd = metadata.cwd;
        const command = metadata?.command;
        if (command && Number.isSafeInteger(command.id) && command.id > session.historyId && typeof command.command === 'string' &&
            typeof command.startedAt === 'string' && Number.isFinite(Date.parse(command.startedAt)) && Number.isFinite(command.durationMs) && Number.isInteger(command.exitCode)) {
          session.historyId = command.id;
          session.history.push({ command: command.command.slice(0, 16384), startedAt: command.startedAt, durationMs: Math.max(0, Math.round(command.durationMs)), exitCode: command.exitCode, executionStatus: String(command.executionStatus ?? '').slice(0, 30) });
          if (session.history.length > 64) session.history.shift();
        }
        // Advance the output cursor for prompt metadata too, so a reader that
        // reconnects between the prompt marker and its text still sees history/cwd.
        session.sequence++;
        notify(session);
      });
      child.on('error', () => {
        session.ioError = 'terminal_io_failed';
        session.sequence++;
        notify(session);
        if (!session.closing) session.closing = terminateTree(session).then(() => { session.status = 'error'; session.endedAt ??= new Date().toISOString(); notify(session); });
      });
      child.onData(data => reader.write(data));
      session.exited = new Promise(resolve => child.onExit(({ exitCode, signal }) => {
        reader.flush(); session.status = session.closing ? 'closed' : 'exited'; session.exitCode = Number.isInteger(exitCode) ? exitCode : null;
        session.signal = signal ?? null; session.endedAt = new Date().toISOString(); releaseConptyReader(session); notify(session); resolve();
      }));
      sessions.set(session.id, session);
      return snapshot(session);
    },
    output(id, after = 0) {
      const session = find(id);
      if (!Number.isSafeInteger(after) || after < 0) throw error('invalid_terminal_cursor');
      const reset = after < session.discardedThrough || after > session.sequence;
      return { chunks: session.chunks.filter(chunk => reset || chunk.seq > after).map(({ seq, data }) => ({ seq, data })), session: snapshot(session), reset };
    },
    async waitOutput(id, after = 0, { wait = 20_000, signal } = {}) {
      if (!Number.isInteger(wait) || wait < 0 || wait > MAX_OUTPUT_WAIT_MS) throw error('invalid_terminal_wait');
      signal?.throwIfAborted();
      const output = runtime.output(id, after), session = find(id);
      if (!wait || output.reset || session.sequence !== after || session.status !== 'running') return output;
      return new Promise((resolve, reject) => {
        const finish = (cause, aborted = false) => {
          clearTimeout(timer); session.waiters.delete(wake); signal?.removeEventListener('abort', abort);
          if (aborted) reject(cause); else resolve(runtime.output(id, after));
        };
        const wake = () => finish(), abort = () => finish(signal.reason, true);
        const timer = setTimeout(wake, wait);
        session.waiters.add(wake);
        signal?.addEventListener('abort', abort, { once: true });
      });
    },
    input(id, data) {
      if (typeof data !== 'string' || Buffer.byteLength(data) > MAX_INPUT_BYTES) throw error('invalid_terminal_input');
      const session = running(id);
      try { session.pty.write(data); } catch { throw error('terminal_write_failed', 409); }
      return { ok: true };
    },
    resize(id, cols, rows) {
      cols = integer(cols, undefined, 2, 500); rows = integer(rows, undefined, 2, 200);
      if (cols === undefined || rows === undefined) throw error('invalid_terminal_dimensions');
      const session = running(id);
      try { session.pty.resize(cols, rows); } catch { throw error('terminal_resize_failed', 409); }
      session.cols = cols; session.rows = rows;
      session.sequence++;
      notify(session);
      return { session: snapshot(session) };
    },
    rename(id, name) { const session = find(id); session.name = nameFor(name, session.name); session.sequence++; notify(session); return { session: snapshot(session) }; },
    async closeSession(id) {
      const session = find(id);
      if (!session.closing) session.closing = terminateTree(session);
      await session.closing;
      session.status = 'closed'; session.endedAt ??= new Date().toISOString();
      notify(session);
      const result = { ok: true, session: snapshot(session) };
      sessions.delete(id);
      return result;
    },
    close() {
      if (!closePromise) {
        closed = true;
        closePromise = Promise.all([...sessions.keys()].map(id => runtime.closeSession(id))).then(() => { process.removeListener('exit', emergencyClose); });
      }
      return closePromise;
    },
  };
  return runtime;
}
