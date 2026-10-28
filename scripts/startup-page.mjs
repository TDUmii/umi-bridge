import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.DC_WEB_PORT || 43127);
const statusFile = path.join(root, '.local-data', 'startup-progress.json');
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UmiBridge - Đang khởi động</title>
<style>body{margin:0;background:#101b19;color:#edf5ef;font:17px system-ui;display:grid;place-items:center;min-height:100vh}main{width:min(560px,85vw);padding:36px;border:1px solid #365448;border-radius:24px;background:#192b25}small{color:#9fc6ac}h1{font-size:30px}p{line-height:1.7}#step{color:#bce6c8}a{color:#bce6c8}progress{width:100%;accent-color:#86be9a}</style>
<main><small>UMIBRIDGE SAKURA CONSOLE</small><h1 id="title">Đang chuẩn bị UmiBridge</h1><progress id="busy"></progress><p id="step" role="status" aria-live="polite">Đang kiểm tra ứng dụng...</p><p id="detail">Trang này sẽ tự chuyển vào dashboard khi gateway sẵn sàng. Nếu cần đăng nhập tunnel, hãy hoàn tất trên tab đăng nhập.</p><a href="http://127.0.0.1:${port}/admin">Mở dashboard</a></main>
<script>
let authTab=null;
const auth=document.createElement('p');document.querySelector('main').append(auth);
async function poll(){try{
  const r=await fetch('/status',{cache:'no-store'});const s=await r.json();
  document.getElementById('step').textContent=s.step;
  if(s.state==='auth'&&s.authUrl==='https://github.com/login/device'){
    if(!auth.firstChild){const code=document.createElement('strong');const button=document.createElement('button');button.textContent='Mở tab đăng nhập tunnel';button.onclick=()=>{authTab=window.open('https://github.com/login/device','umibridge-tunnel-login');};auth.append(code,document.createElement('br'),button)}
    auth.firstChild.textContent='Mã đăng nhập: '+s.authCode;
  }else{if(authTab&&!authTab.closed)authTab.close();authTab=null;auth.replaceChildren()}
  if(s.state==='error'){document.getElementById('title').textContent='UmiBridge chưa khởi động được';document.getElementById('busy').hidden=true;document.getElementById('detail').textContent='Đọc lỗi ở trên, sau đó chọn Restart từ biểu tượng UmiBridge để thử lại.'}
  if(s.state==='ready'){location.replace('http://127.0.0.1:${port}/admin');return}
}catch{}setTimeout(poll,1000)}poll()
</script></html>`;
const server = createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port + 1}`) { res.writeHead(403); res.end(); return; }
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/status') {
    let status = { state: 'starting', step: 'Đang chuẩn bị ứng dụng...' };
    try { status = JSON.parse(await readFile(statusFile, 'utf8')); } catch {}
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(status));
    if (status.state === 'ready') setTimeout(() => server.close(), 3000).unref();
  } else if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
  } else { res.writeHead(404); res.end(); }
});
server.listen(port + 1, '127.0.0.1');
server.on('error', () => process.exit(1));
setTimeout(() => server.close(), 30 * 60 * 1000).unref();
