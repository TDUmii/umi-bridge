(() => {
  const memory = new Map();
  const channelOf = command => command?.channel === 'arena' ? 'arena' : 'corp';
  const attemptKey = command => channelOf(command)+':'+command.attempt;
  const setupMarker = command => `[UmiBridge ${channelOf(command)==='arena'?'arena ':''}setup ${command.jobId}:${command.roleId}]`;
  let dispatching = false;
  const chatId = () => location.pathname.match(/(?:^|\/)c\/([a-zA-Z0-9-]+)\/?$/)?.[1];
  const projectId = () => location.pathname.match(/^\/g\/(g-p-[a-f0-9]{32})(?:-[a-zA-Z0-9_-]+)?\//)?.[1];
  const matches = command => chatId() === command.chatId && (!command.projectId || projectId() === command.projectId);
  const visible = element => Boolean(element?.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const composer = () => [...document.querySelectorAll('#prompt-textarea, textarea[data-id="root"], [contenteditable="true"][data-lexical-editor], [contenteditable="true"][role="textbox"]')].find(element => visible(element) && !/start writing|document|canvas/i.test(element.getAttribute('aria-label') || ''));
  const sending = () => [...document.querySelectorAll('button')].some(button => visible(button) && (button.dataset.testid === 'stop-button' || /^(stop|stop generating|stop streaming|dừng tạo)$/i.test(button.getAttribute('aria-label') || '')));
  const value = element => element?.value ?? element?.innerText ?? '';
  // Lexical renders adjacent paragraphs with an extra innerText newline. Keep all non-newline draft edits significant.
  const sameDraft = (element, prompt) => element instanceof HTMLTextAreaElement ? value(element).trim() === prompt.trim() : value(element).replace(/\n+/g, '\n').trim() === prompt.replace(/\n+/g, '\n').trim();
  const messageSelector = '[data-message-author-role], [data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"]';
  const author = element => element.dataset.messageAuthorRole || element.getAttribute('data-chatgpt-search-unit-key')?.split(':').at(-1);
  const waitForValue=async(fn,timeout=45000)=>{const started=Date.now();while(Date.now()-started<timeout){const value=fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,300));}throw Error('bootstrap_ui_timeout');};
  const buttonText=element=>(element.getAttribute('aria-label')||element.innerText||'').trim();
  function fillInput(element,content){
    element.focus();
    if(element instanceof HTMLTextAreaElement||element instanceof HTMLInputElement){
      const prototype=element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,content);element.dispatchEvent(new Event('input',{bubbles:true}));
    }else{document.execCommand('insertText',false,content);element.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:content}));}
  }
  function bootstrapInspect(command){
    if(command.type==='bootstrap-project'){
      const heading=[...document.querySelectorAll('h1')].find(el=>visible(el)&&el.textContent.trim()===command.projectName);
      if(projectId()&&/\/project\/?$/.test(location.pathname)&&heading)return {kind:'project',projectUrl:`https://chatgpt.com/g/${projectId()}/project`};
    }else if(projectId()===command.projectId&&chatId()){
      const marker=setupMarker(command);
      if([...document.querySelectorAll(messageSelector)].some(el=>author(el)==='user'&&el.textContent.includes(marker)))return {kind:'chat',roleId:command.roleId,chatUrl:`https://chatgpt.com/g/${command.projectId}/c/${chatId()}`};
    }
    return null;
  }
  async function bootstrapAuthorized(command){
    const result=await chrome.runtime.sendMessage({type:'bootstrap-authorize',jobId:command.jobId,attempt:command.attempt,roleId:command.roleId,channel:channelOf(command)});
    if(!result?.allowed)throw Error('bootstrap_stopped');
  }
  async function setupProject(command){
    const prior=bootstrapInspect(command);if(prior)return prior;
    const existing=[...document.querySelectorAll('nav button,nav a')].find(el=>visible(el)&&el.textContent.trim()===command.projectName);
    // Arena owns a new Project; a matching title cannot prove ownership of another lane's Project.
    if(existing&&channelOf(command)==='corp'){existing.click();return waitForValue(()=>bootstrapInspect(command));}
    if(command.reconcileOnly)throw Error('bootstrap_recovery_required');
    let input=document.querySelector('#chatgpt-project-name');
    if(!input||!visible(input)){
      let create;try{create=await waitForValue(()=>[...document.querySelectorAll('button')].find(el=>visible(el)&&(el.hasAttribute('data-app-action-sidebar-project-create')||/^(new project|create project|thêm dự án mới|tạo dự án)$/i.test(buttonText(el)))));}catch{throw Error('project_create_ui_missing');}
      await bootstrapAuthorized(command);create.click();
      input=await waitForValue(()=>{const el=document.querySelector('#chatgpt-project-name')||document.querySelector('[role="dialog"] input[type="text"]');return visible(el)?el:null;});
    }
    if(value(input).trim()&&value(input).trim()!==command.projectName)throw Error('project_dialog_busy');
    if(input.maxLength>0&&command.projectName.length>input.maxLength)throw Error('project_name_too_long');
    fillInput(input,command.projectName);
    const dialog=input.closest('[role="dialog"]')||document;
    const submit=await waitForValue(()=>[...dialog.querySelectorAll('button')].find(el=>visible(el)&&!el.disabled&&/^(create project|tạo dự án)$/i.test(buttonText(el))));
    await bootstrapAuthorized(command);
    if(value(input).trim()!==command.projectName)throw Error('project_dialog_busy');submit.click();
    return waitForValue(()=>bootstrapInspect(command));
  }
  async function setupChat(command){
    if(typeof command.roleId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(command.roleId)||typeof command.seed!=='string'||command.seed.length>48000||!command.seed.includes(setupMarker(command)))throw Error('bootstrap_invalid_descriptor');
    const prior=bootstrapInspect(command);if(prior)return prior;
    if(command.reconcileOnly)throw Error('bootstrap_recovery_required');
    if(projectId()!==command.projectId||!/\/project\/?$/.test(location.pathname))throw Error('bootstrap_project_changed');
    const input=await waitForValue(()=>composer());
    if(sending()||value(input).trim())throw Error('composer_busy');await bootstrapAuthorized(command);
    if(sending()||value(input).trim()||projectId()!==command.projectId)throw Error('composer_busy');
    if(command.modelPreference)await UmiModelPicker.apply(command.modelPreference);
    fillInput(input,command.seed);
    const send=await waitForValue(()=>[...document.querySelectorAll('button')].find(el=>visible(el)&&!el.disabled&&(el.dataset.testid==='send-button'||el.id==='composer-submit-button'||/^(send|send message|send prompt|gửi|gửi tin nhắn|gửi lời nhắc)$/i.test(buttonText(el)))));
    await bootstrapAuthorized(command);
    if(command.modelPreference&&!await UmiModelPicker.verify(command.modelPreference))throw Error('model_selection_unconfirmed');
    if(!sameDraft(input,command.seed)||projectId()!==command.projectId)throw Error('composer_busy');send.click();
    return waitForValue(()=>bootstrapInspect(command));
  }
  async function discover(command) {
    if (projectId() !== command.projectId || !/\/project\/?$/.test(location.pathname)) return null;
    const home = [...document.querySelectorAll('[data-chatgpt-project-conversation-drop-target]')].find(element => visible(element) && element.querySelector('h1')) || [...document.querySelectorAll('main')].find(element => visible(element) && element.querySelector('h1'));
    const panel = home?.querySelector('[role="tabpanel"][id$="-chats"]') || home?.querySelector('[role="tabpanel"]') || home;
    if (!panel || !visible(panel) || home.querySelector('[role="tab"][aria-selected="true"]')?.textContent.match(/^(Nguồn|Sources)$/i)) return null;
    const members = new Map();
    const read = () => {
      // Exact Project-prefixed links are safe even in the sidebar. Bare /c links are accepted only inside the Project chat panel.
      for (const anchor of document.querySelectorAll('a[href]')) {
        if (!visible(anchor)) continue;
        let url; try { url = new URL(anchor.href); } catch { continue; }
        if (url.origin !== location.origin || url.search || url.hash) continue;
        const match = url.pathname.match(/^(?:\/g\/(g-p-[a-f0-9]{32})(?:-[a-zA-Z0-9_-]+)?)?\/c\/([a-zA-Z0-9-]{6,100})\/?$/);
        if (!match || (match[1] ? match[1] !== command.projectId : !panel.contains(anchor))) continue;
        members.set(match[2], {name:(anchor.innerText || anchor.getAttribute('aria-label') || match[2]).trim().slice(0,180), chatUrl:`https://chatgpt.com/g/${command.projectId}/c/${match[2]}`});
      }
    };
    let scroller = panel;
    while (scroller && scroller !== document.body && !(scroller.scrollHeight > scroller.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const scrollable = scroller && scroller !== document.body;
    const original = scrollable ? scroller.scrollTop : 0;
    let status = 'partial', stable = 0;
    try {
      if (command.scan && scrollable) scroller.scrollTop = 0;
      for (let i=0; i < (command.scan ? 60 : 1); i++) {
        if (projectId() !== command.projectId || !panel.isConnected) return null;
        read();
        const loading = [...panel.querySelectorAll('[role="progressbar"], [aria-busy="true"]')].some(visible);
        const more = [...panel.querySelectorAll('button')].find(button => visible(button) && /^(show more|load more|xem thêm|tải thêm)$/i.test(button.textContent.trim()));
        const bottom = !scrollable || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 3;
        if (!loading && !more && bottom) stable++; else stable=0;
        if (!command.scan) break;
        if (stable >= 3) { status = 'complete'; break; }
        if (more && !more.disabled) more.click();
        else if (scrollable) scroller.scrollTop += Math.max(200, scroller.clientHeight * 0.7);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      read();
      // Unknown/changed DOM never certifies an empty Project.
      if (!members.size && !/chưa có cuộc trò chuyện|không có cuộc trò chuyện|no conversations|no chats/i.test(panel.innerText)) status = 'unavailable';
      return {projectUrl:`https://chatgpt.com/g/${command.projectId}/project`, chats:[...members.values()].slice(0,1000), status:members.size > 1000 ? 'partial' : status};
    } finally { if (command.scan && scrollable && scroller.isConnected) scroller.scrollTop = original; }
  }
  function limitNotice() {
    const nodes = document.querySelectorAll('[role="alert"], [role="dialog"], [data-testid*="rate-limit"], [data-testid*="usage-limit"], [data-testid*="error"], form');
    for (const node of nodes) {
      if (!visible(node) || node.closest(messageSelector) || node.querySelector(messageSelector)) continue;
      const clone = node.cloneNode(true);
      clone.querySelectorAll('textarea, [contenteditable], script, style').forEach(child => child.remove());
      const notice = clone.textContent.trim().slice(0, 1000);
      if (/(?:hit|reached|exceeded|usage|message|rate).{0,60}limit|limit.{0,60}(?:reset|try again|reached)|hết.{0,30}(?:hạn mức|lượt)|đạt.{0,30}giới hạn|giới hạn.{0,60}(?:đặt lại|thử lại)/i.test(notice)) return notice;
    }
    return null;
  }
  function inspect(command) {
    const base = { runId: command.runId, stepId: command.stepId, attempt: command.attempt,channel:channelOf(command) };
    if (!matches(command)) return { ...base, kind: 'blocked', reason: 'chat_changed' };
    const marker = `[UmiBridge task ${command.attempt}]`;
    const messages = [...document.querySelectorAll(messageSelector)].filter(node => !node.parentElement?.closest(messageSelector));
    const user = messages.findIndex(node => author(node) === 'user' && node.textContent.includes(marker));
    const notice = limitNotice();
    if (notice) return { ...base, kind: 'limit', notice, sent: user >= 0 };
    if (user < 0) return null;
    const after = messages.slice(user + 1), answer = after.filter(node => author(node) === 'assistant').at(-1);
    // Another user's turn means the active context changed. Do not hand off an unrelated answer.
    if (after.some(node => author(node) === 'user')) return { ...base, kind: 'blocked', reason: 'chat_changed' };
    const turn = answer?.closest('[data-talvt-turn-state], article, [data-testid^="conversation-turn-"]') ?? answer?.parentElement;
    const turnState = turn?.getAttribute('data-talvt-turn-state');
    const finished = turnState ? turnState === 'complete' : turn?.querySelector('[data-testid="copy-turn-action-button"], button[aria-label="Copy"], button[aria-label="Sao chép"]');
    const result = answer ? (answer.querySelector('[data-markdown-text-style="assistant-message"]') ?? answer).innerText.trim() : '';
    if (/^(?:không thể tải phản hồi này|unable to load this response|couldn['’]t load this response)[.!]?$/iu.test(result)) {
      memory.delete(attemptKey(command));return {...base,kind:'blocked',sent:true,reason:'response_unavailable'};
    }
    if (answer && finished && !sending()) {
      if (result.length > 48_000) return { ...base, kind: 'blocked', reason: 'response_too_large' };
      const prior = memory.get(attemptKey(command));
      if (prior?.result === result && result && Date.now() - prior.since >= 6000) return { ...base, kind: 'done', sent: true, result };
      if (prior?.result !== result) memory.set(attemptKey(command), { result, since: Date.now() });
    } else memory.delete(attemptKey(command));
    return { ...base, kind: 'sent' };
  }
  async function dispatch(command) {
    const base = { runId: command.runId, stepId: command.stepId, attempt: command.attempt,channel:channelOf(command) };
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
      if (!matches(command)) return { ...base, kind: 'blocked', reason: 'chat_changed' };
      if (sending() || value(input).trim()) return { ...base, kind: 'blocked', reason: 'composer_busy' };
      try{if(command.modelPreference)await UmiModelPicker.apply(command.modelPreference);}catch{return {...base,kind:'blocked',reason:'model_selection_unconfirmed'};}
      if(!matches(command)||sending()||value(input).trim())return {...base,kind:'blocked',reason:'composer_busy'};
      input.focus();
      if (input instanceof HTMLTextAreaElement) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, command.prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.execCommand('insertText', false, command.prompt);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: command.prompt }));
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      const send = [...document.querySelectorAll('button')].find(button => visible(button) && (button.dataset.testid === 'send-button' || button.id === 'composer-submit-button' || /^(send|send message|send prompt|gửi|gửi tin nhắn|gửi lời nhắc)$/i.test(button.getAttribute('aria-label') || '')));
      if (!send || send.disabled || !matches(command)) return { ...base, kind: 'blocked', reason: 'send_unconfirmed' };
      const stillAllowed = await chrome.runtime.sendMessage({ ...command, type: 'authorize', prompt: undefined });
      if (!matches(command) || !input.isConnected || composer() !== input || !send.isConnected) return { ...base, kind: 'blocked', reason: 'chat_changed' };
      if (!stillAllowed?.allowed || sending() || send.disabled || !sameDraft(input, command.prompt)) return { ...base, kind: 'blocked', reason: 'composer_busy' };
      if(command.modelPreference&&!await UmiModelPicker.verify(command.modelPreference))return {...base,kind:'blocked',reason:'model_selection_unconfirmed'};
      if(!matches(command)||!input.isConnected||!sameDraft(input,command.prompt)||sending())return {...base,kind:'blocked',reason:'composer_busy'};
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
    if(command.type==='model-catalog'){
      if(dispatching||sending()||value(composer()).trim()){respond({models:[],error:'composer_busy'});return;}
      dispatching=true;UmiModelPicker.scan().then(models=>respond({models}),error=>respond({models:[],error:error.message})).finally(()=>{dispatching=false;});return true;
    }
    if(command.type==='bootstrap-inspect'){respond(bootstrapInspect(command.command));return;}
    if(command.type==='bootstrap-project'||command.type==='bootstrap-chat'){
      (command.type==='bootstrap-project'?setupProject(command):setupChat(command)).then(respond,error=>respond({kind:'blocked',reason:String(error.message||'bootstrap_unconfirmed').slice(0,150)}));return true;
    }
    if (command.type === 'project-chats') { discover(command).then(respond, () => respond(null)); return true; }
    if (command.type === 'ready') { respond({ ready: matches(command) && Boolean(composer()) }); return; }
    if (command.type === 'observe') { respond({ report: inspect(command) }); return; }
    if (command.type === 'dispatch') { dispatch(command).then(report => respond({ report }), () => respond({ report: { runId: command.runId, stepId: command.stepId, attempt: command.attempt, kind: 'blocked', reason: 'send_unconfirmed' } })); return true; }
  });
})();
