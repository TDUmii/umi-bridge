/* The credential stays in the extension worker. Page scripts never receive it. */
let busy = false;
let lastModelScan=null;
const validOrigin = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Chỉ dùng địa chỉ http://127.0.0.1:PORT');
  return url.origin;
};
const channelOf = value => value?.channel === 'arena' ? 'arena' : 'corp';
async function api(path, body, channel = channelOf(body)) {
  const { endpoint, token } = await chrome.storage.local.get(['endpoint', 'token']);
  if (!endpoint || !token) throw Error('Chưa ghép Corp');
  const response = await fetch(validOrigin(endpoint) + '/admin/' + channel + '/bridge/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body), signal: AbortSignal.timeout(12_000), cache: 'no-store',
  });
  if (!response.ok) throw Error(channel + ' HTTP ' + response.status);
  return response.json();
}
async function report(message) {
  // Persist before network I/O so a worker restart cannot lose the send acknowledgement.
  const { outbox = [] } = await chrome.storage.local.get('outbox');
  outbox.push({...message, channel:channelOf(message)});
  await chrome.storage.local.set({ outbox: outbox.slice(-100) });
}
async function flush() {
  const { outbox = [] } = await chrome.storage.local.get('outbox');
  while (outbox.length) {
    try { await api(outbox[0].bootstrap?'bootstrap-report':'report', outbox[0]); }
    catch (error) { if (!/HTTP (400|404|409)/.test(error.message)) throw error; }
    outbox.shift(); await chrome.storage.local.set({ outbox });
  }
}
function conversation(url) { try { return new URL(url).pathname.match(/(?:^|\/)c\/([a-zA-Z0-9-]+)\/?$/)?.[1]; } catch { return null; } }
function project(url) { try { return new URL(url).pathname.match(/^\/g\/(g-p-[a-f0-9]{32})(?:-[a-zA-Z0-9_-]+)?\//)?.[1]; } catch { return null; } }
const projectScans = new Map();
async function reconcileReset(resetGeneration){
  if(typeof resetGeneration!=='string'||!resetGeneration.trim()||resetGeneration.length>200)return;
  const saved=await chrome.storage.local.get('resetGeneration');
  if(saved.resetGeneration===resetGeneration)return;
  // One atomic metadata reset keeps pairing, preferences and page drafts intact.
  await chrome.storage.local.set({resetGeneration,outbox:[],bootstrapTabs:{},observations:{}});
  projectScans.clear();
}
async function bootstrap(command){
  const channel=channelOf(command),oldKey=command.jobId+':'+(command.roleId||'project'),key=channel+':'+oldKey;
  const {bootstrapTabs={}}=await chrome.storage.local.get('bootstrapTabs');
  if(channel==='corp'&&!bootstrapTabs[key]&&bootstrapTabs[oldKey]){bootstrapTabs[key]=bootstrapTabs[oldKey];delete bootstrapTabs[oldKey];}
  let record=bootstrapTabs[key],tab;const previousAttempt=record?.attempt;
  if(record)try{tab=await chrome.tabs.get(record.tabId);}catch{}
  const reconcileOnly=Boolean(record?.began&&!tab);
  if(!tab){tab=await chrome.tabs.create({url:command.projectUrl||'https://chatgpt.com/',active:false});record={tabId:tab.id,began:false};bootstrapTabs[key]=record;}
  record.attempt=command.attempt;record.jobId=command.jobId;record.roleId=command.roleId;record.channel=channel;await chrome.storage.local.set({bootstrapTabs});
  let ready=false;
  for(let i=0;i<45;i++){
    try{await chrome.tabs.sendMessage(tab.id,{type:'bootstrap-inspect',command});ready=true;break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw Error('bootstrap_content_unavailable');
  const inspected=await chrome.tabs.sendMessage(tab.id,{type:'bootstrap-inspect',command});
  let result=inspected;
  if(!result){
    const recover=record.began&&previousAttempt!==command.attempt;
    record.began=true;await chrome.storage.local.set({bootstrapTabs});
    try{result=await chrome.tabs.sendMessage(tab.id,{...command,reconcileOnly:reconcileOnly||recover});}
    catch{
      // Navigation can replace the content script after a confirmed click. Observe only.
      for(let i=0;i<45&&!result;i++){await new Promise(resolve=>setTimeout(resolve,1000));try{result=await chrome.tabs.sendMessage(tab.id,{type:'bootstrap-inspect',command});}catch{}}
    }
  }
  result||={kind:'blocked',reason:'bootstrap_unconfirmed'};
    if(result.kind==='blocked'&&['project_create_ui_missing','project_name_too_long','project_dialog_busy','composer_busy','bootstrap_stopped','model_picker_missing','model_selection_unconfirmed','model_not_available','reasoning_picker_missing','reasoning_picker_unknown','reasoning_selection_unconfirmed','reasoning_not_available','chat_mode_unconfirmed'].includes(result.reason)){record.began=false;await chrome.storage.local.set({bootstrapTabs});}
  await report({bootstrap:true,jobId:command.jobId,attempt:command.attempt,...result,channel});
  if(result.kind==='chat'&&(channel==='arena'||command.roleId==='docs')){
    const projectTab=bootstrapTabs[channel+':'+command.jobId+':project'];if(projectTab)await chrome.tabs.reload(projectTab.tabId).catch(()=>{});
  }
}
async function lifecycleCommand(command){
  const target=command.target,url=new URL(target.url),channel=channelOf(command);
  if(url.origin!=='https://chatgpt.com'||project(url.href)!==target.projectId||(target.chatId&&conversation(url.href)!==target.chatId))throw Error('lifecycle_scope_invalid');
  const tab=await chrome.tabs.create({url:url.href,active:true});
  let ready=false;
  for(let i=0;i<30;i++){try{await chrome.tabs.sendMessage(tab.id,{type:'lifecycle-ready',target});ready=true;break;}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
  if(!ready)throw Error('lifecycle_content_unavailable');
  const result=await chrome.tabs.sendMessage(tab.id,{type:'lifecycle-prepare',...command});
  await api('lifecycle-report',{channel,ticket:command.ticket,index:command.index,...result},channel);
}
const matches = (tab, command) => conversation(tab.url) === command.chatId && (!command.projectId || project(tab.url) === command.projectId);
async function tabMessage(tab, command) {
  // Sending never creates or navigates a tab. Only an existing, matching conversation is eligible.
  const response = await chrome.tabs.sendMessage(tab.id, command);
  if (response?.report) await report({...response.report,channel:channelOf(command)});
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
    const statuses=[];
    // One worker lock and serial lanes prevent overlapping poll/dispatch ownership.
    for(const channel of ['corp','arena'])try{
    const response = await api('poll', { channel,extensionVersion:chrome.runtime.getManifest().version,chats, projectChats: tabs.filter(tab => conversation(tab.url) && project(tab.url)).map(tab => ({chatId:conversation(tab.url), projectId:project(tab.url)})) });
    await reconcileReset(response.resetGeneration);
    if(channel==='corp'&&response.modelScan?.status==='pending'&&lastModelScan!==response.modelScan.id){
      const tab=tabs.find(tab=>!conversation(tab.url))||tabs[0];
      if(tab){lastModelScan=response.modelScan.id;try{const result=await chrome.tabs.sendMessage(tab.id,{type:'model-catalog'});await api('models',{id:lastModelScan,...result},'corp');}catch{lastModelScan=null;}}
    }
    for (const scope of response.projects || []) {
      const home = tabs.find(tab => project(tab.url) === scope.projectId && /\/project\/?$/.test(new URL(tab.url).pathname));
      if (!home) continue;
      const scanKey=channel+':'+scope.id,previous = projectScans.get(scanKey);
      if (previous?.requested === scope.requested && Date.now() - previous.at < 15_000) continue;
      try {
        const discovery = await chrome.tabs.sendMessage(home.id, {type:'project-chats', projectId:scope.projectId, scan:previous?.requested !== scope.requested || previous?.status === 'unavailable'});
        if (discovery) {
          await api('sync', {...discovery, workspaceId:scope.id, requested:scope.requested,channel});
          projectScans.set(scanKey, {requested:scope.requested, at:Date.now(), status:discovery.status});
        }
      } catch { /* A loading/navigated Project is retried; it never widens the task scope. */ }
    }
    if(response.lifecycle){try{await lifecycleCommand(response.lifecycle);}catch(error){await api('lifecycle-report',{channel:channelOf(response.lifecycle),ticket:response.lifecycle.ticket,index:response.lifecycle.index,status:'blocked',reason:String(error.message).slice(0,120)},channelOf(response.lifecycle)).catch(()=>{});}}
    for(const chat of (response.openChats||[]).slice(0,1)){
      if(!tabs.some(tab=>matches(tab,chat))){const url=new URL(chat.chatUrl);if(url.origin==='https://chatgpt.com'&&conversation(url.href)===chat.chatId&&(!chat.projectId||project(url.href)===chat.projectId))await chrome.tabs.create({url:url.href,active:false});}
    }
    for (const monitor of response.monitors || []) {
      const tab = tabs.find(item => matches(item, monitor));
      if (tab) await tabMessage(tab, { type: 'observe', ...monitor,channel }).catch(() => {});
    }
    if (response.command) {
      const command = {...response.command,channel}, tab = tabs.find(item => matches(item, command));
      if (tab) {
        try {
          if (command.refresh) {
            await chrome.tabs.reload(tab.id);
            // Wait for content script after reset; re-check authorization immediately before sending.
            let ready = false;
            for (let i = 0; i < 30; i++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              try { if ((await chrome.tabs.sendMessage(tab.id, { type: 'ready', chatId: command.chatId, projectId:command.projectId }))?.ready) { ready = true; break; } } catch {}
            }
            if (!ready) throw Error('chat_unavailable');
          }
          await tabMessage(tab, { type: 'dispatch', ...command });
        } catch { await report({ ...command, prompt: undefined, kind: 'blocked', reason: 'send_unconfirmed' }); }
      }
    }
    if(response.bootstrap){
      try{await bootstrap({...response.bootstrap,channel});}catch(error){await report({bootstrap:true,jobId:response.bootstrap.jobId,attempt:response.bootstrap.attempt,channel,kind:'blocked',reason:String(error.message||'bootstrap_unconfirmed').slice(0,150)});}
    }
    statuses.push(channel+': OK');
    }catch(error){statuses.push(channel+': '+error.message);}
    await flush();
    await chrome.storage.local.set({ status: statuses.join(' · ') + '. ' + chats.length + ' chat đang mở.', checkedAt: Date.now() });
  } catch (error) { await chrome.storage.local.set({ status: error.message, checkedAt: Date.now() }); }
  finally { busy = false; }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if(message.type==='lifecycle-authorize'&&sender.tab){
    if(project(sender.tab.url)!==message.projectId||(message.chatId&&conversation(sender.tab.url)!==message.chatId)){respond({allowed:false});return;}
    api('lifecycle-authorize',message,channelOf(message)).then(respond,()=>respond({allowed:false}));return true;
  }
  if(message.type==='bootstrap-authorize'&&sender.tab){
    chrome.storage.local.get('bootstrapTabs').then(({bootstrapTabs={}})=>{
      const owns=Object.values(bootstrapTabs).some(row=>row.tabId===sender.tab.id&&row.jobId===message.jobId&&row.attempt===message.attempt&&channelOf(row)===channelOf(message)&&row.roleId===message.roleId);
      if(!owns){respond({allowed:false});return;}api('bootstrap-authorize',message).then(respond,()=>respond({allowed:false}));
    });return true;
  }
  if (message.type === 'authorize' && sender.tab) {
    if (!matches(sender.tab, message)) { respond({ allowed: false }); return; }
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
