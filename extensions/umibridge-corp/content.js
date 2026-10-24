(() => {
  const memory = new Map();
  let dispatching = false;
  const chatId = () => location.pathname.match(/(?:^|\/)c\/([a-zA-Z0-9-]+)\/?$/)?.[1];
  const visible = element => Boolean(element?.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const composer = () => [...document.querySelectorAll('#prompt-textarea, textarea[data-id="root"], [contenteditable="true"][data-lexical-editor], [contenteditable="true"][role="textbox"]')].find(element => visible(element) && !/start writing|document|canvas/i.test(element.getAttribute('aria-label') || ''));
  const sending = () => [...document.querySelectorAll('button')].some(button => visible(button) && (button.dataset.testid === 'stop-button' || /^(stop|stop generating|stop streaming|dừng tạo)$/i.test(button.getAttribute('aria-label') || '')));
  const value = element => element?.value ?? element?.innerText ?? '';
  function limitNotice() {
    const nodes = document.querySelectorAll('[role="alert"], [role="dialog"], [data-testid*="rate-limit"], [data-testid*="usage-limit"], [data-testid*="error"], form');
    for (const node of nodes) {
      if (!visible(node) || node.closest('[data-message-author-role]') || node.querySelector('[data-message-author-role]')) continue;
      const clone = node.cloneNode(true);
      clone.querySelectorAll('textarea, [contenteditable], script, style').forEach(child => child.remove());
      const notice = clone.textContent.trim().slice(0, 1000);
      if (/(?:hit|reached|exceeded|usage|message|rate).{0,60}limit|limit.{0,60}(?:reset|try again|reached)|hết.{0,30}(?:hạn mức|lượt)|đạt.{0,30}giới hạn|giới hạn.{0,60}(?:đặt lại|thử lại)/i.test(notice)) return notice;
    }
    return null;
  }
  function inspect(command) {
    const base = { runId: command.runId, stepId: command.stepId, attempt: command.attempt };
    if (chatId() !== command.chatId) return { ...base, kind: 'blocked', reason: 'chat_changed' };
    const marker = `[UmiBridge task ${command.attempt}]`;
    const messages = [...document.querySelectorAll('[data-message-author-role]')];
    const user = messages.findIndex(node => node.dataset.messageAuthorRole === 'user' && node.textContent.includes(marker));
    const notice = limitNotice();
    if (notice) return { ...base, kind: 'limit', notice, sent: user >= 0 };
    if (user < 0) return null;
    const after = messages.slice(user + 1), answer = after.find(node => node.dataset.messageAuthorRole === 'assistant');
    // Another user's turn means the active context changed. Do not hand off an unrelated answer.
    if (after.some(node => node.dataset.messageAuthorRole === 'user')) return { ...base, kind: 'blocked', reason: 'chat_changed' };
    const turn = answer?.closest('article, [data-testid^="conversation-turn-"]') ?? answer?.parentElement;
    const finished = turn?.querySelector('[data-testid="copy-turn-action-button"], button[aria-label="Copy"], button[aria-label="Sao chép"]');
    if (answer && finished && !sending()) {
      const result = answer.innerText.trim();
      if (result.length > 48_000) return { ...base, kind: 'blocked', reason: 'response_too_large' };
      const prior = memory.get(command.attempt);
      if (prior?.result === result && result && Date.now() - prior.since >= 6000) return { ...base, kind: 'done', sent: true, result };
      if (prior?.result !== result) memory.set(command.attempt, { result, since: Date.now() });
    } else memory.delete(command.attempt);
    return { ...base, kind: 'sent' };
  }
  async function dispatch(command) {
    const base = { runId: command.runId, stepId: command.stepId, attempt: command.attempt };
    const prior = inspect(command);
    if (prior) return prior;
    if (dispatching) return { ...base, kind: 'blocked', reason: 'composer_busy' };
    dispatching = true;
    try {
      const input = composer();
      if (!input) return { ...base, kind: 'blocked', reason: 'composer_missing' };
      if (sending() || value(input).trim()) return { ...base, kind: 'blocked', reason: 'composer_busy' };
      const allowed = await chrome.runtime.sendMessage({ ...command, type: 'authorize', prompt: undefined });
      if (!allowed?.allowed) return null;
      // Revalidate after the network round trip; never overwrite a draft typed during it.
      if (chatId() !== command.chatId) return { ...base, kind: 'blocked', reason: 'chat_changed' };
      if (sending() || value(input).trim()) return { ...base, kind: 'blocked', reason: 'composer_busy' };
      input.focus();
      if (input instanceof HTMLTextAreaElement) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, command.prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.execCommand('insertText', false, command.prompt);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: command.prompt }));
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      const send = [...document.querySelectorAll('button[data-testid="send-button"], button#composer-submit-button, button[aria-label="Send prompt"], button[aria-label="Gửi lời nhắc"]')].find(visible);
      if (!send || send.disabled || chatId() !== command.chatId) return { ...base, kind: 'blocked', reason: 'send_unconfirmed' };
      const stillAllowed = await chrome.runtime.sendMessage({ ...command, type: 'authorize', prompt: undefined });
      if (!stillAllowed?.allowed || value(input).trim() !== command.prompt.trim()) return { ...base, kind: 'blocked', reason: 'composer_busy' };
      send.click();
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 400));
        const observed = inspect(command);
        if (observed?.kind === 'limit' && !observed.sent) return { ...base, kind: 'blocked', reason: 'send_unconfirmed' };
        if (observed) return observed;
      }
      return { ...base, kind: 'blocked', reason: 'send_unconfirmed' };
    } finally { dispatching = false; }
  }
  chrome.runtime.onMessage.addListener((command, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (command.type === 'ready') { respond({ ready: chatId() === command.chatId && Boolean(composer()) }); return; }
    if (command.type === 'observe') { respond({ report: inspect(command) }); return; }
    if (command.type === 'dispatch') { dispatch(command).then(report => respond({ report }), () => respond({ report: { runId: command.runId, stepId: command.stepId, attempt: command.attempt, kind: 'blocked', reason: 'send_unconfirmed' } })); return true; }
  });
})();
