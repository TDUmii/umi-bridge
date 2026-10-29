import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.DC_WEB_PORT || 43127);
const statusFile = path.join(root, '.local-data', 'startup-progress.json');
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UmiBridge - Đang khởi động</title>
<style>
@font-face{font-family:Manrope;src:url('/fonts/Manrope-VF.ttf') format('truetype');font-weight:200 800;font-display:swap}
*{box-sizing:border-box}body{margin:0;background:#0b0b0e;color:#f5f5f7;font:16px/1.7 Manrope,'Segoe UI',sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;color-scheme:dark}main{width:min(632px,100%);padding:40px;border:1px solid #303036;border-radius:16px;background:radial-gradient(ellipse at 50% 0%,#1d1d22,#131316 70%);box-shadow:0 16px 48px #0006}small{color:#a1a1aa;font-size:11px;letter-spacing:.08em}h1{font-size:clamp(24px,4vw,30px);line-height:1.3;font-weight:650;letter-spacing:-.025em;margin:18px 0 28px}p{color:#a1a1aa;margin:20px 0}#step{color:#f5f5f7}a{color:#e4e4e9;text-underline-offset:5px}a:hover{color:#fff}progress{appearance:none;display:block;width:100%;height:5px;border:0;border-radius:3px;overflow:hidden;accent-color:#d4d4d8;background:#2a2a30}progress::-webkit-progress-bar{background:transparent}progress::-webkit-progress-value{background:#d4d4d8}progress:indeterminate{background:linear-gradient(90deg,#2a2a30 15%,#d4d4d8 48%,#2a2a30 82%);background-size:220% 100%;animation:prepare 1.8s ease-in-out infinite}button{font:inherit;font-weight:600;padding:10px 16px;margin:0 12px 16px 0;background:#eeeef2;color:#111114;border:1px solid #eeeef2;border-radius:8px;cursor:pointer;transition:background .18s,transform .18s}button:hover{background:#d4d4d8}button:active{transform:translateY(1px)}button:disabled{opacity:.65;cursor:wait}button:focus-visible,a:focus-visible{outline:2px solid #f5f5f7;outline-offset:4px}[hidden]{display:none!important}::selection{background:#eeeef2;color:#111114}@keyframes prepare{to{background-position:220% 0}}@media(max-width:480px){body{padding:18px}main{padding:28px 24px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style>
<main><small>UMIBRIDGE SAKURA CONSOLE</small><h1 id="title">Đang chuẩn bị UmiBridge</h1><progress id="busy" aria-label="Tiến trình khởi động"></progress><p id="step" role="status" aria-live="polite">Đang kiểm tra ứng dụng...</p><p id="detail">Trang này sẽ tự chuyển vào dashboard khi gateway sẵn sàng. Nếu cần đăng nhập tunnel, hãy hoàn tất trên tab đăng nhập.</p><button id="retry" type="button" hidden>Thử lại kết nối</button><a href="http://127.0.0.1:${port}/admin">Mở dashboard</a></main>
<script>
let authTab=null;
const auth=document.createElement('p');document.querySelector('main').append(auth);
document.getElementById('retry').onclick=async()=>{
 const button=document.getElementById('retry');button.disabled=true;
 try{const response=await fetch('/retry',{method:'POST',headers:{'X-DC-Startup-Action':'1'}});if(!response.ok)throw Error();document.getElementById('step').textContent='Đang thử lại kết nối đã lưu...';}
 catch{document.getElementById('step').textContent='Không gửi được yêu cầu. Mở lại UmiBridge.cmd để thử lại.';button.disabled=false}
};
async function poll(){try{
  const r=await fetch('/status',{cache:'no-store'});const s=await r.json();
  document.getElementById('step').textContent=s.step;
  if(s.state==='auth'&&s.authUrl==='https://github.com/login/device'){
    if(!auth.firstChild){const code=document.createElement('strong');const button=document.createElement('button');button.textContent='Mở tab đăng nhập tunnel';button.onclick=()=>{authTab=window.open('https://github.com/login/device','umibridge-tunnel-login');};auth.append(code,document.createElement('br'),button)}
    auth.firstChild.textContent='Mã đăng nhập: '+s.authCode;
  }else{if(authTab&&!authTab.closed)authTab.close();authTab=null;auth.replaceChildren()}
  document.getElementById('retry').hidden=s.state!=='error';
  if(s.state==='error'){document.getElementById('retry').disabled=false;document.getElementById('title').textContent=s.reason==='tunnel_auth_required'?'Cần đăng nhập lại tunnel':'Chưa kết nối được UmiBridge';document.getElementById('busy').hidden=true;document.getElementById('detail').textContent=s.reason==='tunnel_auth_required'?'Bấm Thử lại kết nối, sau đó hoàn tất đăng nhập GitHub trên tab được mở. URL, khóa và Project hiện có được giữ nguyên.':'Bấm Thử lại kết nối hoặc mở lại UmiBridge.cmd. Việc này không chạy kiểm tra màn hình.'}
  else{document.getElementById('title').textContent=s.state==='auth'?'Đăng nhập tunnel để tiếp tục':'Đang chuẩn bị UmiBridge';document.getElementById('busy').hidden=false}
  if(s.state==='ready'){location.replace('http://127.0.0.1:${port}/admin');return}
}catch{}setTimeout(poll,1000)}poll()
</script></html>`;
const server = createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port + 1}`) { res.writeHead(403); res.end(); return; }
  res.setHeader('Cache-Control', 'no-store');
  if(req.url==='/fonts/Manrope-VF.ttf'){
    try{res.setHeader('Content-Type','font/ttf');res.end(await readFile(path.join(root,'scripts','fonts','Manrope-VF.ttf')))}catch{res.writeHead(404);res.end()}
    return;
  }
  if (req.url === '/retry') {
    if (req.method !== 'POST' || req.headers['x-dc-startup-action'] !== '1' || req.headers.origin !== `http://127.0.0.1:${port + 1}`) { res.writeHead(403); res.end(); return; }
    try {
      await writeFile(path.join(root,'.local-data','launcher-retry'),new Date().toISOString());
      await writeFile(statusFile,JSON.stringify({state:'starting',step:'Đang thử lại kết nối đã lưu...'}));
      res.writeHead(202);res.end();
    } catch { res.writeHead(503);res.end(); }
    return;
  }
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
