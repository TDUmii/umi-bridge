import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile, unlink, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createMutex } from 'node:net';
import { startGateway } from './local-web-gateway.mjs';
import { readTunnelConfig, tunnelUrlFromOutput } from './tunnel-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(root, '.local-data');
const port = Number(process.env.DC_WEB_PORT || 43127);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('DC_WEB_PORT must be between 1024 and 65535');
await mkdir(stateDir, { recursive: true });
if (process.platform === 'win32') {
  const protection = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/protect-local-data.ps1'), '-Path', stateDir], { windowsHide: true, encoding: 'utf8' });
  if (protection.status !== 0) throw new Error('Cannot protect local credentials: ' + (protection.stderr || protection.error?.message || 'ACL failed'));
}
const mutex = createMutex(socket => socket.destroy());
const mutexAddress = process.platform === 'win32'
  ? '\\\\.\\pipe\\DesktopCommanderLocal-' + createHash('sha256').update(root).digest('hex').slice(0, 16)
  : path.join(stateDir, 'launcher.sock');
await new Promise((resolve, reject) => { mutex.once('error', reject); mutex.listen(mutexAddress, resolve); });
const stateFile = path.join(stateDir, 'web-status.json');
// Upgrade cleanup only: these retired credentials no longer grant access.
for (const name of ['GEMINI-CONNECT.txt', 'gemini-pairing-secret.txt']) {
  await unlink(path.join(stateDir, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
const secretFile = path.join(stateDir, 'connection-secret.txt');
let secret;
try { secret = (await readFile(secretFile, 'utf8')).trim(); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  secret = randomBytes(24).toString('base64url');
  await writeFile(secretFile, secret + '\n', { mode: 0o600, flag: 'wx' });
}
if (!/^[A-Za-z0-9_-]{32,}$/.test(secret)) throw new Error('Invalid local connection secret. Restore .local-data/connection-secret.txt.');
let tunnel;
let tunnelAuthorizationRejected = false;
let gateway;
let publicUrl = process.env.DC_PUBLIC_URL;
const localOnly = process.env.DC_LOCAL_ONLY === '1';
if (localOnly) {
  // Preserve the OAuth issuer/grants during local maintenance without a tunnel.
  try { publicUrl ||= (await readTunnelConfig(stateDir, port)).publicUrl; }
  catch { /* Local maintenance must still work if tunnel settings need repair. */ }
  try { publicUrl ||= JSON.parse(await readFile(path.join(stateDir, 'oauth-state.json'), 'utf8')).issuer; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  publicUrl ||= `http://127.0.0.1:${port}`;
}
let frontend;
let closing = false;
let ownsState = false;
let tunnelProvider = localOnly ? 'local' : publicUrl ? 'external' : 'cloudflare';
async function close(code = 0) {
  if (closing) return;
  closing = true;
  if (ownsState) await unlink(stateFile).catch(() => {});
  tunnel?.kill();
  if (frontend) await new Promise(resolve => { frontend.close(resolve); frontend.closeAllConnections(); });
  await gateway?.close().catch(() => {});
  await new Promise(resolve => mutex.close(resolve));
  process.exitCode = code;
}
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

try {
  // Bind the tunnel's origin before creating it, so an occupied port can never expose another service.
  frontend = createServer((req, res) => {
    if (!gateway || closing) { res.writeHead(503); res.end('Starting'); return; }
    const host = new URL(publicUrl).host;
    if (![host, `127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
    // This gateway applies one shared rate limit; forwarded client IPs are deliberately not trusted.
    const incomingHost = String(req.headers.host ?? '');
    const localHost = incomingHost === `127.0.0.1:${port}` || incomingHost === `localhost:${port}`;
    if (localOnly && !localHost) { res.writeHead(404); res.end(); return; }
    const pathname = String(req.url ?? '').split('?', 1)[0];
    const adminPath = pathname === '/' || pathname.startsWith('/admin');
    const headers = { ...req.headers, host };
    for (const name of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-local-admin']) delete headers[name];
    if (localHost && adminPath) headers['x-local-admin'] = '1';
    const upstream = httpRequest({ hostname: '127.0.0.1', port: gateway.port, path: req.url, method: req.method, headers }, response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end(); });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    frontend.once('error', reject);
    frontend.listen(port, '127.0.0.1', resolve);
  });
  if (!publicUrl) {
    const config = process.env.DC_DISABLE_SAVED_TUNNEL === '1'
      ? { provider: 'cloudflare' }
      : await readTunnelConfig(stateDir, port);
    tunnelProvider = config.provider;
    let executable, args;
    if (tunnelProvider === 'devtunnel') {
      executable = path.join(root, '.runtime', 'devtunnel', 'devtunnel.exe');
      if (!existsSync(executable)) throw new Error('Missing Dev Tunnels CLI. Run UmiBridge.cmd -Action repair first.');
      // Keeping both headers is essential: a rewritten loopback Host could expose the local admin UI.
      args = ['host', config.tunnelId, '--host-header', 'unchanged', '--origin-header', 'unchanged'];
      console.log('Connecting the saved Microsoft Dev Tunnel...');
    } else {
      executable = path.join(root, 'local-bin', 'cloudflared.exe');
      if (!existsSync(executable)) throw new Error('Missing local-bin/cloudflared.exe. Double-click UmiBridge.cmd first.');
      const emptyConfig = path.join(stateDir, 'cloudflared.yml');
      await writeFile(emptyConfig, '# Separate local quick tunnel configuration\n');
      args = ['tunnel', '--config', emptyConfig, '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2', '--no-autoupdate'];
      console.log('Establishing a temporary HTTPS connection...');
    }
    tunnel = spawn(executable, args, {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    publicUrl = await new Promise((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => reject(new Error('The tunnel did not return a URL within 60 seconds. See .local-data/tunnel.log.')), 60_000);
      const onOutput = data => {
        const chunk = data.toString();
        void appendFile(path.join(stateDir, 'tunnel.log'), chunk).catch(() => {});
        buffer = (buffer + chunk).slice(-16_384);
        if (/unauthorized|login token expired|authentication token expired|not authenticated/i.test(buffer)) tunnelAuthorizationRejected = true;
        const url = tunnelUrlFromOutput(buffer, tunnelProvider, port);
        if (url) { clearTimeout(timeout); resolve(url); }
      };
      tunnel.stdout.on('data', onOutput);
      tunnel.stderr.on('data', onOutput);
      tunnel.once('error', error => { clearTimeout(timeout); reject(error); });
      tunnel.once('exit', code => { clearTimeout(timeout); reject(new Error(tunnelAuthorizationRejected ? 'TUNNEL_AUTH_REQUIRED: The saved tunnel sign-in was rejected.' : `Tunnel exited (${code}). Check the network or see .local-data/tunnel.log.`)); });
    });
    if (tunnelProvider === 'devtunnel') {
      if (config.publicUrl && config.publicUrl !== publicUrl) throw new Error('The saved tunnel address changed. Reconfigure the ChatGPT connection before using this tunnel.');
      if (!config.publicUrl) {
        const configPath = path.join(stateDir, 'tunnel-config.json');
        await writeFile(configPath + '.tmp', JSON.stringify({ ...config, publicUrl }, null, 2) + '\n', { mode: 0o600 });
        await rename(configPath + '.tmp', configPath);
      }
    }
    tunnel.once('exit', () => {
      if (!closing) { console.error(tunnelAuthorizationRejected ? 'TUNNEL_AUTH_REQUIRED: The saved tunnel sign-in was rejected.' : 'HTTPS tunnel disconnected. Please restart UmiBridge.'); void close(1); }
    });
  }
  gateway = await startGateway({ port: 0, publicUrl, connectionSecret: secret, configDir: path.join(stateDir, 'profile') });
  gateway.closed.then(() => {
    if (!closing) { console.error('UmiBridge backend stopped. Please restart UmiBridge.'); void close(1); }
  });
  const endpoint = new URL('/mcp', publicUrl).href;
  const connectionText = [
    'UmiBridge · Sakura Console | ChatGPT MCP Bridge', '',
    `Server URL: ${endpoint}`,
    'Authentication: OAuth',
    'Client registration: Dynamic (DCR); leave client ID and secret blank', '',
    `Connection code (enter it on the UmiBridge authorization page): ${secret}`,
    `Local dashboard: http://127.0.0.1:${port}/admin`,
    'The dashboard is accessible only from this computer, not through the public tunnel.',
    'Never share your connection code in a chat.',
    'Keep this terminal running. Press Ctrl+C to stop.',
    tunnelProvider === 'devtunnel'
      ? 'Saved Dev Tunnel: the same URL and OAuth grants are reused after restart.'
      : localOnly ? 'Local browser mode: no public tunnel is running. ChatGPT remote access is unavailable in this mode.'
      : 'Temporary tunnel URL: reconnect ChatGPT whenever the URL changes. Run UmiBridge.cmd -Action repair for a fixed address.',
    '', '--- Tiếng Việt ---',
    `URL máy chủ: ${endpoint}`,
    'Xác thực: OAuth, đăng ký máy khách tự động (DCR).',
    `Mã kết nối (nhập tại trang xác thực UmiBridge): ${secret}`,
    `Trang quản trị trên máy: http://127.0.0.1:${port}/admin`,
    'Trang quản trị chỉ truy cập từ máy này, không qua tunnel công khai.',
    'Không chia sẻ mã kết nối trong cuộc trò chuyện.',
    'Giữ cửa sổ này mở. Nhấn Ctrl+C để dừng.',
    tunnelProvider === 'devtunnel'
      ? 'Tunnel cố định: giữ nguyên URL và phiên OAuth sau khi khởi động lại.'
      : localOnly ? 'Chế độ trình duyệt local: không chạy tunnel công khai; ChatGPT từ xa chưa hoạt động trong chế độ này.'
      : 'Link tạm đổi khi khởi động lại: cần cập nhật kết nối ChatGPT. Chạy UmiBridge.cmd -Action repair để có địa chỉ cố định.',
  ].join('\r\n');
  await writeFile(path.join(stateDir, 'CONNECT.txt'), connectionText, { mode: 0o600 });
  await writeFile(stateFile, JSON.stringify({ pid: process.pid, tunnelPid: tunnel?.pid, tunnelProvider, port, publicUrl, endpoint, startedAt: new Date().toISOString() }, null, 2));
  ownsState = true;
  console.log('\n' + connectionText);
  console.log('\nSetup guide (English and Vietnamese): README.md');
} catch (error) {
  console.error(`Unable to start UmiBridge: ${error.message}`);
  await close(1);
}
