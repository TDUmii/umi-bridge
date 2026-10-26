const $ = id => document.getElementById(id);
async function status() { const data = await chrome.storage.local.get(['status', 'endpoint']); $('status').textContent = data.status || 'Not paired'; if (data.endpoint) $('endpoint').value = data.endpoint; }
$('connect').onsubmit = async event => {
  event.preventDefault();
  try {
    const url = new URL($('endpoint').value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Use http://127.0.0.1:PORT');
    const token = $('token').value.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('Invalid pairing code');
    await chrome.storage.local.set({ endpoint: url.origin, token, outbox: [] });
    $('token').value = ''; await chrome.runtime.sendMessage({ type: 'connect' }); await status();
  } catch (error) { $('status').textContent = error.message; }
};
$('disconnect').onclick = async () => { await chrome.storage.local.remove(['token', 'outbox']); await chrome.storage.local.set({ status: 'Disconnected',browserEnabled:false }); await status(); };
void status();
async function browserStatus(){const{browserEnabled}=await chrome.storage.local.get('browserEnabled');$('browser-toggle').setAttribute('aria-pressed',String(!!browserEnabled));$('browser-toggle').textContent=browserEnabled?'Disable browser control':'Enable browser control';$('browser-status').textContent=browserEnabled?'On · uses your existing pairing':'Off';}
$('browser-toggle').onclick=async()=>{try{const{browserEnabled}=await chrome.storage.local.get('browserEnabled');let enabled=false;if(!browserEnabled)enabled=await chrome.permissions.request({origins:['<all_urls>']});await chrome.storage.local.set({browserEnabled:enabled});await browserStatus();}catch(error){$('browser-status').textContent=error.message;}};
void browserStatus();
