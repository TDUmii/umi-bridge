/* The credential stays in the extension worker. Page scripts never receive it. */
let busy = false;
const validOrigin = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Chỉ dùng địa chỉ http://127.0.0.1:PORT');
  return url.origin;
};
async function api(path, body) {
  const { endpoint, token } = await chrome.storage.local.get(['endpoint', 'token']);
  if (!endpoint || !token) throw Error('Chưa ghép Corp');
  const response = await fetch(validOrigin(endpoint) + '/admin/corp/bridge/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body), signal: AbortSignal.timeout(12_000), cache: 'no-store',
  });
  if (!response.ok) throw Error('Corp HTTP ' + response.status);
  return response.json();
}
async function report(message) {
  // Persist before network I/O so a worker restart cannot lose the send acknowledgement.
  const { outbox = [] } = await chrome.storage.local.get('outbox');
  outbox.push(message);
  await chrome.storage.local.set({ outbox: outbox.slice(-100) });
}
async function flush() {
  const { outbox = [] } = await chrome.storage.local.get('outbox');
  while (outbox.length) {
    try { await api('report', outbox[0]); }
    catch (error) { if (!/HTTP (400|404|409)/.test(error.message)) throw error; }
    outbox.shift(); await chrome.storage.local.set({ outbox });
  }
}
function conversation(url) { try { return new URL(url).pathname.match(/(?:^|\/)c\/([a-zA-Z0-9-]+)\/?$/)?.[1]; } catch { return null; } }
async function tabMessage(tab, command) {
  // Sending never creates or navigates a tab. Only an existing, matching conversation is eligible.
  const response = await chrome.tabs.sendMessage(tab.id, command);
  if (response?.report) await report(response.report);
}
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const { token } = await chrome.storage.local.get('token');
    if (!token) return;
    await flush();
    const tabs = await chrome.tabs.query({ url: ['https://chatgpt.com/*', 'https://chat.openai.com/*'] });
    // Duplicate tabs of a conversation use one stable tab ID only.
    tabs.sort((a, b) => a.id - b.id);
    const chats = [...new Set(tabs.map(tab => conversation(tab.url)).filter(Boolean))];
    const response = await api('poll', { chats });
    for (const monitor of response.monitors) {
      const tab = tabs.find(item => conversation(item.url) === monitor.chatId);
      if (tab) await tabMessage(tab, { type: 'observe', ...monitor }).catch(() => {});
    }
    if (response.command) {
      const command = response.command, tab = tabs.find(item => conversation(item.url) === command.chatId);
      if (tab) {
        try {
          if (command.refresh) {
            await chrome.tabs.reload(tab.id);
            // Wait for content script after reset; re-check authorization immediately before sending.
            let ready = false;
            for (let i = 0; i < 30; i++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              try { if ((await chrome.tabs.sendMessage(tab.id, { type: 'ready', chatId: command.chatId }))?.ready) { ready = true; break; } } catch {}
            }
            if (!ready) throw Error('chat_unavailable');
          }
          await tabMessage(tab, { type: 'dispatch', ...command });
        } catch { await report({ ...command, prompt: undefined, kind: 'blocked', reason: 'send_unconfirmed' }); }
      }
    }
    await flush();
    await chrome.storage.local.set({ status: 'Đã nối UmiBridge. ' + chats.length + ' chat đang mở.', checkedAt: Date.now() });
  } catch (error) { await chrome.storage.local.set({ status: error.message, checkedAt: Date.now() }); }
  finally { busy = false; }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'authorize' && sender.tab) {
    if (conversation(sender.tab.url) !== message.chatId) { respond({ allowed: false }); return; }
    api('authorize', message).then(respond, () => respond({ allowed: false })); return true;
  }
  if (message.type === 'connect' && !sender.tab) { tick().then(() => respond({ ok: true })); return true; }
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'corp') void tick(); });
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('corp', { periodInMinutes: 0.5 }));
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('corp', { periodInMinutes: 0.5 }); void tick(); });
chrome.alarms.create('corp', { periodInMinutes: 0.5 });
setInterval(() => void tick(), 3000);
void tick();
