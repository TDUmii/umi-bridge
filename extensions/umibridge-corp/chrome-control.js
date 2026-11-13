/* Fixed page actions; never evaluate source supplied by web pages or callers. */
async function chromePageAction(command) {
  if (command.expected_origin && location.origin !== command.expected_origin) throw Error('Target origin changed; inspect and repair the session');
  if (command.expected_url && location.href !== command.expected_url) throw Error('Target URL changed; inspect before continuing');
  const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const query = selector => selector?.startsWith('umi:') ? document.querySelector('[data-umi-control-id="' + CSS.escape(selector.slice(4)) + '"]') : document.querySelector(selector || '');
  const find = selector => { const el = query(selector); if (!el || !visible(el)) throw Error('Visible element not found'); return el; };
  if (command.action === 'probe') {
    const condition = command.wait_for || {}, el = condition.selector ? query(condition.selector) : null, state = condition.state || 'visible';
    const matched = (!condition.selector || (state === 'attached' ? !!el : state === 'detached' ? !el : state === 'hidden' ? !el || !visible(el) : !!el && visible(el))) && (!condition.url || location.href === condition.url) && (!condition.text || (condition.selector ? el?.innerText || el?.textContent || '' : document.body?.innerText || '').includes(condition.text));
    return { ready: document.readyState !== 'loading', matched, url: location.href };
  }
  const describe = el => ({ id: 'umi:' + el.dataset.umiControlId, tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), name: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || '').slice(0, 160), type: el.getAttribute('type') });
  if (command.action === 'read') {
    const elements = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(visible).slice(0, 400);
    for (const [index, el] of elements.entries()) el.dataset.umiControlId = crypto.randomUUID() + '-' + String(index + 1);
    return { url: location.href, title: document.title, text: (document.body?.innerText || '').slice(0, 50000), elements: elements.map(describe) };
  }
  if (command.action === 'scroll') { window.scrollBy({ left: Number(command.x) || 0, top: Number(command.y) || 0, behavior: 'instant' }); return { scrollX, scrollY, url: location.href }; }
  const el = find(command.selector); el.scrollIntoView({ block: 'center', inline: 'nearest' });
  if (command.action === 'select') {
    if (!(el instanceof HTMLSelectElement)) throw Error('Element is not a select');
    if (![...el.options].some(option => option.value === command.text && !option.disabled)) throw Error('Select option not found or disabled');
    el.value = command.text; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    if (el.value !== command.text) throw Error('Selection was not retained');
  } else throw Error('Unsupported page action');
  return { performed: command.action, url: location.href, verification: 'value_matched' };
}

const chromeControlActive = new Map(), chromeControlLanes = new Map(), chromeControlCancelled = new Set();
let chromeControlPolling = false, chromeControlConcurrency = 2;
let chromeControlIdentity;
async function chromeBridgeIdentity() {
  if (!chromeControlIdentity) chromeControlIdentity = (async () => {
    const saved = await chrome.storage.local.get(['chromeBridgeInstanceId', 'chromeBridgeClaimed']);
    const instanceId = typeof saved.chromeBridgeInstanceId === 'string' && /^[a-zA-Z0-9-]{8,100}$/.test(saved.chromeBridgeInstanceId) ? saved.chromeBridgeInstanceId : crypto.randomUUID();
    if (instanceId !== saved.chromeBridgeInstanceId) await chrome.storage.local.set({ chromeBridgeInstanceId: instanceId });
    return { instanceId, claimed: new Set(Array.isArray(saved.chromeBridgeClaimed) ? saved.chromeBridgeClaimed.slice(-200) : []) };
  })().catch(error => { chromeControlIdentity = null; throw error; });
  return chromeControlIdentity;
}
function checkChromeCommand(command) {
  if (chromeControlCancelled.has(command.id)) throw Error('Command cancelled; inspect outcome before retrying');
  if (command.session_id && !command.expected_origin) throw Error('Session requires a bound origin');
}
async function allowedChromeOrigin(url, expectedOrigin) {
  if (!/^https?:\/\//i.test(url || '')) throw Error('Chrome internal pages are not supported');
  const origin = new URL(url).origin;
  if (expectedOrigin && origin !== expectedOrigin) throw Error('Target origin changed; inspect and repair the session');
  if (!await chrome.permissions.contains({ origins: [origin + '/*'] })) throw Error('Grant page access in extension settings first');
  return origin;
}
async function chromeCommandTab(command) {
  checkChromeCommand(command);
  const tab = await chrome.tabs.get(command.tab_id);
  await allowedChromeOrigin(tab.pendingUrl || tab.url, command.expected_origin);
  if (command.expected_url && (tab.pendingUrl || tab.url) !== command.expected_url) throw Error('Target URL changed; inspect before continuing');
  return tab;
}
async function waitChromeReady(command, condition, timeout = 10000) {
  const deadline = Date.now() + Math.min(15000, Math.max(1, Number(timeout) || 10000));
  let lastError;
  do {
    const tab = await chromeCommandTab(command);
    if (!tab.pendingUrl) {
      try {
        const rows = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: chromePageAction, args: [{ action: 'probe', expected_origin: command.expected_origin || new URL(tab.url).origin, expected_url: command.expected_url, wait_for: condition }] });
        const row = rows[0];
        if (row?.result?.ready && row.result.matched) return { ...row.result, documentId: row.documentId };
      } catch (error) {
        if (/origin changed/i.test(error.message)) throw error;
        lastError = error;
      }
    }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (true);
  throw Error('Page readiness or wait condition timed out' + (lastError ? ': ' + lastError.message : ''));
}
async function chromeInputPoint(tabId, documentId, selector, expectedOrigin) {
  const rows = await chrome.scripting.executeScript({ target: { tabId, ...(documentId ? { documentIds: [documentId] } : {}) }, func: (selector, expectedOrigin) => {
    if (location.origin !== expectedOrigin) throw Error('Target origin changed; inspect and repair the session');
    const el = selector?.startsWith('umi:') ? document.querySelector('[data-umi-control-id="' + CSS.escape(selector.slice(4)) + '"]') : document.querySelector(selector || '');
    if (!el || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') throw Error('Visible element not found');
    if (el.matches('input[type=password],input[type=file]')) throw Error('Sensitive input requires user interaction');
    if (el.disabled) throw Error('Element is disabled');
    el.scrollIntoView({ block: 'center' });
    el.focus({preventScroll:true});
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, url: location.href };
  }, args: [selector, expectedOrigin] });
  if (!rows[0]?.result) throw Error('Target document is unavailable');
  return rows[0].result;
}
async function trustedChromeInput(tabId, command, ready) {
  const target = { tabId }, origin = new URL(ready.url).origin;
  await chrome.debugger.attach(target, '1.3');
  let mouseDown = false, pressedKey, lastPoint,focusEmulated=false;
  const rawSend = (method, params) => chrome.debugger.sendCommand(target, method, params);
  try {
    // Focus belongs to this renderer, without activating the browser tab or OS window.
    checkChromeCommand(command);await chromeCommandTab(command);
    await rawSend('Emulation.setFocusEmulationEnabled',{enabled:true});
    focusEmulated=true;
    const point = selector => chromeInputPoint(tabId, ready.documentId, selector, origin);
    const p = await point(command.selector); lastPoint = p;
    // Document-bound probes prevent stale coordinates after a tab navigates.
    const send = async (method, params) => {
      checkChromeCommand(command); await chromeCommandTab(command);
      const rows = await chrome.scripting.executeScript({ target: { tabId, ...(ready.documentId ? { documentIds: [ready.documentId] } : {}) }, func: expected => {
        if (location.href !== expected) throw Error('Target document changed; inspect outcome before retrying'); return true;
      }, args: [p.url] });
      if (!rows[0]?.result) throw Error('Target document changed; inspect outcome before retrying');
      if (method === 'Input.dispatchMouseEvent' && params.type === 'mousePressed') mouseDown = true;
      if (method === 'Input.dispatchKeyEvent' && params.type !== 'keyUp') pressedKey = params;
      return rawSend(method, params);
    };
    const mouse = async (type, position, extra = {}) => { lastPoint = position; await send('Input.dispatchMouseEvent', { type, x: position.x, y: position.y, ...extra }); if (type === 'mouseReleased') mouseDown = false; };
    const click = async position => { await mouse('mouseMoved',position); await mouse('mousePressed', position, { button: 'left', buttons:1, clickCount: 1 }); await mouse('mouseReleased', position, { button: 'left', buttons:0, clickCount: 1 }); };
    const key = async (type, params) => { await send('Input.dispatchKeyEvent', { type, ...params }); if (type === 'keyUp') pressedKey = null; };
    if (command.action === 'click') await click(p);
    else if (command.action === 'type') {
      await click(p);
      if (command.clear !== false) {
        await key('rawKeyDown', { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }); await key('keyUp', { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
        await key('rawKeyDown', { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await key('keyUp', { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
      }
      await send('Input.insertText', { text: command.text || '' });
      const verified=await chrome.scripting.executeScript({target:{tabId,...(ready.documentId?{documentIds:[ready.documentId]}:{})},func:(selector,text,clear)=>{const el=selector?.startsWith('umi:')?document.querySelector('[data-umi-control-id="'+CSS.escape(selector.slice(4))+'"]'):document.querySelector(selector||'');if(!el)return false;const value=el.isContentEditable?el.textContent:el.value;return typeof value==='string'&&(clear?value===text:value.endsWith(text));},args:[command.selector,command.text||'',command.clear!==false]});
      if(verified[0]?.result!==true)throw Error('Typed text was not retained in the target element; inspect before retrying');
    } else if (command.action === 'key') {
      const parts = (command.key || 'Enter').split('+'), name = parts.pop(), codes = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, PageUp: 33, PageDown: 34, Space: 32 };
      const params = { key: name, windowsVirtualKeyCode: codes[name] || name.toUpperCase().charCodeAt(0), modifiers: (parts.includes('Alt') ? 1 : 0) | (parts.includes('Control') || parts.includes('Ctrl') ? 2 : 0) | (parts.includes('Meta') ? 4 : 0) | (parts.includes('Shift') ? 8 : 0), ...(name === 'Enter' ? { text: '\r' } : {}) };
      await key('keyDown', params); await key('keyUp', params);
    } else if (command.action === 'drag') {
      const end = await point(command.target);
      await mouse('mouseMoved', p); await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 12; i++) await mouse('mouseMoved', { x: p.x + (end.x - p.x) * i / 12, y: p.y + (end.y - p.y) * i / 12 }, { button: 'left', buttons: 1 });
      await mouse('mouseReleased', end, { button: 'left', clickCount: 1 });
    }
    return { result: { performed: command.action, url: p.url, verification: 'dispatched' } };
  } finally {
    // Release only through this tab's debugger target, including cancellation during a drag.
    if (mouseDown && lastPoint) await rawSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lastPoint.x, y: lastPoint.y, button: 'left', clickCount: 1 }).catch(() => {});
    if (pressedKey) await rawSend('Input.dispatchKeyEvent', { type: 'keyUp', ...pressedKey }).catch(() => {});
    if(focusEmulated)await rawSend('Emulation.setFocusEmulationEnabled',{enabled:false}).catch(()=>{});
    await chrome.debugger.detach(target).catch(() => {});
  }
}
async function runChromeCommand(command) {
  checkChromeCommand(command);
  if (command.action === 'tabs') return { result: (await chrome.tabs.query({})).filter(t => /^https?:\/\//i.test(t.url || '')).map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active })) };
  if (command.action === 'open') {
    await allowedChromeOrigin(command.url, command.expected_origin); checkChromeCommand(command);
    const tab = await chrome.tabs.create({ url: command.url, active: false });
    try {
      const ready = await waitChromeReady({ ...command, tab_id: tab.id, expected_origin: command.expected_origin || new URL(command.url).origin }, command.wait_for, command.wait_timeout_ms);
      return { result: { id: tab.id, url: ready.url, ready: true, verification: 'condition_matched' } };
    } catch (error) { error.result = { id: tab.id, url: command.url, ready: false, created: true }; throw error; }
  }
  let tab = await chromeCommandTab(command);
  if (command.action === 'close') { checkChromeCommand(command); await chrome.tabs.remove(tab.id); return { result: { closed: tab.id } }; }
  if (command.action === 'navigate') {
    await allowedChromeOrigin(command.url, command.expected_origin); checkChromeCommand(command);
    await chrome.tabs.update(tab.id, { url: command.url });
    const ready = await waitChromeReady({ ...command, expected_url:undefined, expected_origin: command.expected_origin || new URL(command.url).origin }, command.wait_for, command.wait_timeout_ms);
    return { result: { navigating: command.url, url: ready.url, ready: true, verification: 'condition_matched' } };
  }
  const ready = await waitChromeReady(command, command.action === 'wait' ? command.wait_for : undefined, command.wait_timeout_ms);
  if (command.action === 'wait') return { result: { matched: true, url: ready.url, ready: true, verification: 'condition_matched' } };
  tab = await chromeCommandTab(command);
  const scoped = { ...command, expected_origin: command.expected_origin || new URL(ready.url).origin };
  let output;
  if (command.action === 'screenshot') {
    const target = { tabId: tab.id }; await chrome.debugger.attach(target, '1.3');
    try { await chromeCommandTab(scoped); checkChromeCommand(command); const shot = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); output = { image: shot.data }; }
    finally { await chrome.debugger.detach(target).catch(() => {}); }
  } else if (['click', 'type', 'key', 'drag'].includes(command.action)) {
    if (!await chrome.permissions.contains({ permissions: ['debugger'] })) throw Error('Reload UmiBridge extension to enable trusted page input');
    output = await trustedChromeInput(tab.id, scoped, ready);
  } else {
    checkChromeCommand(command);
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, ...(ready.documentId ? { documentIds: [ready.documentId] } : {}) }, func: chromePageAction, args: [scoped] });
    output = { result: results[0]?.result };
  }
  if (command.wait_for) { const matched = await waitChromeReady(command, command.wait_for, command.wait_timeout_ms); if (output.result) output.result = { ...output.result, url: matched.url, verification: 'condition_matched' }; }
  else if (command.session_id) await chromeCommandTab(command);
  return output;
}

function scheduleChromeCommand(command, request, instanceId) {
  const lane = Number.isInteger(command.tab_id) ? 'tab:' + command.tab_id : 'job:' + command.id;
  const previous = chromeControlLanes.get(lane) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    let output;
    try {
      if ((command.target_instance_id || command.instanceId) && (command.target_instance_id || command.instanceId) !== instanceId) throw Error('Chrome instance binding does not match this profile');
      output = await runChromeCommand(command);
    } catch (error) { output = { error: error.message, ...(error.result ? { result: error.result } : {}) }; }
    // Reporting may fail, but execution is never retried or replayed.
    await request('report', { id: command.id, instanceId, ...output }).catch(() => {});
  }).finally(() => {
    chromeControlActive.delete(command.id); chromeControlCancelled.delete(command.id);
    if (chromeControlLanes.get(lane) === task) chromeControlLanes.delete(lane);
    void tickChromeControl();
  });
  chromeControlActive.set(command.id, task); chromeControlLanes.set(lane, task);
}
async function tickChromeControl() {
  if (chromeControlPolling) return;
  chromeControlPolling = true;
  try {
    const { browserEnabled, endpoint, token } = await chrome.storage.local.get(['browserEnabled', 'endpoint', 'token']);
    if (!endpoint || !token) return;
    const { instanceId, claimed } = await chromeBridgeIdentity();
    if (browserEnabled !== true) for (const id of chromeControlActive.keys()) chromeControlCancelled.add(id);
    const request = async (path, body) => {
      const response = await fetch(validOrigin(endpoint) + '/admin/chrome/bridge/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!response.ok) throw Error('Chrome bridge ' + response.status);
      return response.json();
    };
    const candidates = (await chrome.tabs.query({})).filter(tab => /^https?:\/\//i.test(tab.url || ''));
    const granted = await Promise.all(candidates.map(tab => chrome.permissions.contains({ origins: [new URL(tab.url).origin + '/*'] })));
    const tabs = candidates.filter((_tab, index) => granted[index]).map(tab => ({ tabId: tab.id, origin: new URL(tab.url).origin }));
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const window = Number.isInteger(activeTab?.windowId) && chrome.windows?.get ? await chrome.windows.get(activeTab.windowId).catch(() => null) : null;
    const focus = activeTab ? { activeTabId: activeTab.id, ...(Number.isInteger(activeTab.windowId) ? { windowId: activeTab.windowId } : {}), ...(typeof window?.focused === 'boolean' ? { windowFocused: window.focused } : {}) } : {};
    // Heartbeats still receive revocations when all local execution slots are occupied.
    for (let count = 0; count < 4; count++) {
      const response = await request('poll', { protocol: 2, instanceId, enabled: browserEnabled === true, capacity: Math.max(0, chromeControlConcurrency - chromeControlActive.size), capabilities: { background: true, physicalInput: false, sessionBinding: true, waitConditions: true, maxParallelTabs: 4, concurrency: chromeControlConcurrency }, tabs, focus });
      if (Number.isInteger(response.concurrency)) chromeControlConcurrency = Math.min(4, Math.max(1, response.concurrency));
      for (const id of response.cancelIds || []) if (chromeControlActive.has(id)) chromeControlCancelled.add(id);
      const command = response.command;
      if (!command) break;
      if (claimed.has(command.id)) {
        if (!chromeControlActive.has(command.id)) await request('report', { id: command.id, instanceId, error: 'Command was already claimed; inspect outcome before retrying' }).catch(() => {});
        break;
      }
      claimed.add(command.id);
      while (claimed.size > 200) claimed.delete(claimed.values().next().value);
      // Persist the claim before any page action so worker restarts cannot replay it.
      await chrome.storage.local.set({ chromeBridgeClaimed: [...claimed] });
      if (browserEnabled !== true) chromeControlCancelled.add(command.id);
      scheduleChromeCommand(command, request, instanceId);
      if (chromeControlActive.size >= chromeControlConcurrency) break;
    }
  } catch { /* A failed poll or report never causes command replay. */ }
  finally { chromeControlPolling = false; }
}
setInterval(() => void tickChromeControl(), 400);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'corp') void tickChromeControl(); });
void tickChromeControl();
