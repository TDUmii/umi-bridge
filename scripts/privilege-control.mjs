import { spawn } from 'node:child_process';
import { join } from 'node:path';

const unavailable = () => ({ mode: 'unavailable', elevated: false, installed: false, capability: 'unavailable', running: false });
const fields = ['mode', 'elevated', 'installed', 'capability', 'running', 'version', 'needsUpdate', 'pending', 'error'];

// Native Windows owns consent and credentials. The web API accepts only a mode.
export function createPrivilegeControl({ root, enabled = process.platform === 'win32', spawnProcess = spawn } = {}) {
  const shell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const helper = join(root, 'scripts', 'windows', 'Admin-Mode.ps1');
  const args = action => ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', action, '-SourceRoot', root, ...(action === 'status' ? [] : ['-GatewayRequest'])];
  let operation, error, cached, expires = 0, reading, operationStarted = 0;

  const read = () => new Promise(resolve => {
    let child, output = '', done = false;
    const finish = value => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { child?.kill(); finish(unavailable()); }, 15_000);
    try {
      child = spawnProcess(shell, args('status'), { windowsHide: true, cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.length > 8192) { child.kill(); finish(unavailable()); }
      });
      child.once('error', () => finish(unavailable()));
      child.once('close', code => {
        try {
          const value = JSON.parse(output.replace(/^\uFEFF/, '').trim());
          if (code !== 0 || !['normal', 'admin', 'unavailable'].includes(value.mode) ||
              !['available', 'needs-admin-account', 'integrity-error'].includes(value.capability) ||
              !['elevated', 'installed', 'running'].every(key => typeof value[key] === 'boolean')) throw new Error();
          const result = Object.fromEntries(fields.filter(key => key in value).map(key => [key, value[key]]));
          if (typeof result.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(result.version)) delete result.version;
          if (typeof result.needsUpdate !== 'boolean') delete result.needsUpdate;
          if (typeof result.pending !== 'boolean') delete result.pending;
          if (!['uac_cancelled', 'privilege_failed'].includes(result.error)) delete result.error;
          finish(result);
        } catch { finish(unavailable()); }
      });
    } catch { finish(unavailable()); }
  });

  return {
    async status() {
      if (!enabled) return { ...unavailable(), pending: false };
      if (!cached || Date.now() >= expires) {
        reading ??= read().then(value => { cached = value; expires = Date.now() + 2000; return value; }).finally(() => { reading = undefined; });
        await reading;
      }
      const timedOut = operation && Date.now() - operationStarted >= 120_000;
      if (timedOut) {
        const stale = operation;
        operation = undefined;
        error ||= 'privilege_timeout';
        try { stale.kill(); } catch { }
      }
      return { ...cached, pending: Boolean(operation) || cached.pending === true, ...(error || timedOut ? { error: error || 'privilege_timeout' } : {}) };
    },
    async change(body) {
      if (!body || Object.keys(body).length !== 1 || !['normal', 'admin'].includes(body.mode)) {
        throw Object.assign(new Error('invalid_mode'), { status: 400 });
      }
      if (!enabled) throw Object.assign(new Error('privilege_unavailable'), { status: 409 });
      if (operation) throw Object.assign(new Error('privilege_pending'), { status: 409 });
      const current = await this.status();
      if (current.pending) throw Object.assign(new Error('privilege_pending'), { status: 409 });
      if (current.capability !== 'available') throw Object.assign(new Error('privilege_unavailable'), { status: 409 });
      if (body.mode === 'normal' && !current.installed) {
        if (current.elevated) throw Object.assign(new Error('privilege_unavailable'), { status: 409 });
        return { ...current, pending: false };
      }
      if (body.mode === 'admin' && current.installed && current.elevated && current.running) return { ...current, pending: false };
      // Reserve synchronously after the await: two concurrent HTTP requests must
      // never open duplicate native prompts or race two installations.
      if (operation) throw Object.assign(new Error('privilege_pending'), { status: 409 });
      error = undefined;
      try {
        const child = spawnProcess(shell, args(body.mode === 'admin' ? 'enable' : 'disable'), {
          // Windows PowerShell can exit successfully without running -File
          // under DETACHED_PROCESS. Hide its window; unref the handle below.
          windowsHide: true, cwd: root, stdio: 'ignore',
        });
        operation = child;
        operationStarted = Date.now();
        const finish = code => {
          if (operation !== child) return;
          operation = undefined; cached = undefined; expires = 0;
          if (code !== 0) error = code === 1223 ? 'uac_cancelled' : 'privilege_failed';
        };
        child.once('error', () => finish(1));
        child.once('close', finish);
        child.unref();
      } catch { operation = undefined; error = 'privilege_failed'; throw Object.assign(new Error(error), { status: 500 }); }
      return { pending: true };
    },
  };
}
