const $ = id => document.getElementById(id);
async function status() { const data = await chrome.storage.local.get(['status', 'endpoint']); $('status').textContent = data.status || 'Chưa ghép Corp'; if (data.endpoint) $('endpoint').value = data.endpoint; }
$('connect').onsubmit = async event => {
  event.preventDefault();
  try {
    const url = new URL($('endpoint').value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Chỉ dùng địa chỉ http://127.0.0.1:PORT');
    const token = $('token').value.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('Mã ghép Corp không hợp lệ');
    await chrome.storage.local.set({ endpoint: url.origin, token, outbox: [] });
    $('token').value = ''; await chrome.runtime.sendMessage({ type: 'connect' }); await status();
  } catch (error) { $('status').textContent = error.message; }
};
$('disconnect').onclick = async () => { await chrome.storage.local.remove(['token', 'outbox']); await chrome.storage.local.set({ status: 'Đã ngắt kết nối' }); await status(); };
void status();
