// Synthetic worker/browser fixtures only. Never touches real ChatGPT tabs or account.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const workerSource=await readFile(new URL('../extensions/umibridge-corp/background.js',import.meta.url),'utf8');
const contentSource=await readFile(new URL('../extensions/umibridge-corp/content.js',import.meta.url),'utf8');
const projectId='g-p-'+'a'.repeat(32),chatUrl=`https://chatgpt.com/g/${projectId}/c/fixture-chat`;
const storage={endpoint:'http://127.0.0.1:4040'},requests=[],messages=[],created=[],responses={corp:[],arena:[]};
const tabs=[{id:1,url:chatUrl}];let listener;
const local={get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,storage[key]])),set:async rows=>Object.assign(storage,structuredClone(rows))};
const chrome={storage:{local},runtime:{id:'fixture',getManifest:()=>({version:'0.4.0'}),onMessage:{addListener:fn=>{listener=fn;}},onInstalled:{addListener(){}},onStartup:{addListener(){}},openOptionsPage(){}},action:{onClicked:{addListener(){}}},alarms:{onAlarm:{addListener(){}},create(){}},tabs:{query:async()=>tabs,get:async id=>{const tab=tabs.find(tab=>tab.id===id);if(!tab)throw Error('missing');return tab;},create:async row=>{const tab={id:tabs.length+1,...row};tabs.push(tab);created.push(tab);return tab;},reload:async()=>{},sendMessage:async(id,message)=>{
  messages.push({id,...message});
  if(message.type==='bootstrap-inspect')return null;
  if(message.type==='bootstrap-chat')return {kind:'chat',roleId:message.roleId,chatUrl};
  if(message.type==='observe'||message.type==='dispatch')return {report:{runId:message.runId,stepId:message.stepId,attempt:message.attempt,kind:'sent'}};
}}};
const context=vm.createContext({chrome,URL,AbortSignal,Date,Map,Promise,Error,setInterval(){},setTimeout,fetch:async(url,options)=>{
  const [,channel,path]=new URL(url).pathname.match(/^\/admin\/(corp|arena)\/bridge\/(.+)$/)||[];assert.ok(channel,url);
  const body=JSON.parse(options.body);requests.push({channel,path,body,authorization:options.headers.Authorization});
  return {ok:true,json:async()=>path==='poll'?(responses[channel].shift()||{monitors:[]}):{allowed:true}};
}});
vm.runInContext(workerSource,context);await new Promise(resolve=>setTimeout(resolve,0));
storage.token='fixture-shared-credential';
storage.outbox=[{runId:'old-corp',kind:'sent'},{channel:'arena',bootstrap:true,jobId:'pending',attempt:'a',kind:'blocked'}];
for(const channel of ['corp','arena'])responses[channel].push({monitors:[{runId:'same-run',stepId:'same-step',attempt:'same-attempt',chatId:'fixture-chat',projectId}],command:{runId:'same-run',stepId:'same-step',attempt:'same-attempt',chatId:'fixture-chat',projectId,prompt:'fixture'}});
await Promise.all([context.tick(),context.tick()]);
assert.deepEqual(requests.filter(r=>r.path==='poll').map(r=>r.channel),['corp','arena'],'single worker lock serializes both lanes');
assert.deepEqual(requests.slice(0,2).map(r=>[r.channel,r.path]),[['corp','report'],['arena','bootstrap-report']],'restart outbox preserves lane; legacy defaults Corp');
assert.deepEqual(requests.filter(r=>r.path==='report'&&r.body.runId==='same-run').map(r=>r.channel),['corp','corp','arena','arena']);
assert.ok(requests.every(r=>r.authorization==='Bearer fixture-shared-credential'));
for(const channel of ['corp','arena'])responses[channel].push({bootstrap:{type:'bootstrap-chat',jobId:'same-job',attempt:'same-attempt',roleId:'contestant-01',projectId,projectUrl:`https://chatgpt.com/g/${projectId}/project`}});
await context.tick();
assert.equal(created.length,2,'separate bootstrap tab ownership for same IDs in different lanes');
assert.deepEqual(Object.keys(storage.bootstrapTabs).sort(),['arena:same-job:contestant-01','corp:same-job:contestant-01']);
const authorize=message=>new Promise(resolve=>listener(message,{id:'fixture',tab:{id:created[1].id,url:created[1].url}},resolve));
assert.equal((await authorize({type:'bootstrap-authorize',channel:'corp',jobId:'same-job',attempt:'same-attempt',roleId:'contestant-01'})).allowed,false,'cannot authorize another lane');
assert.equal((await authorize({type:'bootstrap-authorize',channel:'arena',jobId:'same-job',attempt:'same-attempt',roleId:'judge'})).allowed,false,'cannot authorize another role');
assert.equal((await authorize({type:'bootstrap-authorize',channel:'arena',jobId:'same-job',attempt:'same-attempt',roleId:'contestant-01'})).allowed,true);
assert.equal(requests.at(-1).channel,'arena');
storage.outbox=[{channel:'arena',kind:'sent',runId:'pre-reset'}];storage.observations={oldProject:'old-observation'};storage.preference='preserved';
await context.reconcileReset('fixture-reset-1');
assert.deepEqual(storage.outbox,[]);assert.deepEqual(storage.bootstrapTabs,{});assert.deepEqual(storage.observations,{});
assert.equal(storage.token,'fixture-shared-credential');assert.equal(storage.endpoint,'http://127.0.0.1:4040');assert.equal(storage.preference,'preserved');
storage.outbox=[{channel:'corp',kind:'sent',runId:'post-reset'}];storage.bootstrapTabs={newProject:{tabId:1}};storage.observations={newProject:'new-observation'};
await context.reconcileReset('fixture-reset-1');await context.reconcileReset(null);await context.reconcileReset('');
assert.equal(storage.outbox.length,1);assert.equal(storage.bootstrapTabs.newProject.tabId,1);assert.equal(storage.observations.newProject,'new-observation');
for(const channel of ['corp','arena'])responses[channel].push({resetGeneration:'fixture-reset-2',monitors:[]});await context.tick();
assert.equal(storage.resetGeneration,'fixture-reset-2');assert.deepEqual(storage.bootstrapTabs,{});assert.deepEqual(storage.observations,{});assert.equal(storage.token,'fixture-shared-credential');

if(!process.env.PLAYWRIGHT_MODULE)throw Error('Set PLAYWRIGHT_MODULE to installed playwright module path.');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE),browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
try{
  const browserContext=await browser.newContext();let external=0;
  await browserContext.route('**/*',route=>{if(route.request().url().startsWith('https://chatgpt.com/'))return route.fulfill({contentType:'text/html',body:'<main><h1>Fixture Project</h1><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></main>'});external++;return route.abort();});
  const page=await browserContext.newPage();
  const load=async()=>{
    await page.goto(`https://chatgpt.com/g/${projectId}/project`);
    await page.evaluate(()=>{
      window.auth=[];window.clicked=0;window.denyAt=0;
      window.chrome={runtime:{id:'fixture',onMessage:{addListener:fn=>{window.handler=fn;}},sendMessage:async message=>{window.auth.push(message);return {allowed:window.auth.length!==window.denyAt};}}};
      document.querySelector('button').onclick=()=>{window.clicked++;const message=document.createElement('div');message.dataset.messageAuthorRole='user';message.textContent=document.querySelector('textarea').value;document.querySelector('main').append(message);history.replaceState({},'',location.pathname.replace('/project','/c/fixture-chat'));};
    });
    await page.evaluate(contentSource);
  };
  const send=command=>page.evaluate(command=>new Promise(resolve=>window.handler(command,{id:'fixture'},resolve)),command);
  for(const channel of ['corp','arena']){
    await load();const marker=`[UmiBridge ${channel==='arena'?'arena ':''}setup fixture-job:contestant-20]`;
    const command={type:'bootstrap-chat',channel,jobId:'fixture-job',attempt:'bootstrap-attempt',roleId:'contestant-20',roleName:'Full product candidate 20',projectId,seed:marker+'\nCreate complete product independently.'};
    assert.equal((await send(command)).kind,'chat');
    const state=await page.evaluate(()=>({auth:window.auth,clicked:window.clicked}));assert.equal(state.clicked,1);assert.equal(state.auth.length,2);assert.ok(state.auth.every(a=>a.channel===channel&&a.roleId==='contestant-20'));
    assert.equal((await send({type:'bootstrap-inspect',command})).kind,'chat');
    assert.equal(await send({type:'bootstrap-inspect',command:{...command,channel:channel==='arena'?'corp':'arena'}}),null,'setup marker cannot reconcile another channel');
  }
  await load();await page.locator('textarea').fill('User draft');
  const command={type:'bootstrap-chat',channel:'arena',jobId:'fixture-job',attempt:'bootstrap-attempt',roleId:'judge',projectId,seed:'[UmiBridge arena setup fixture-job:judge]\nJudge complete products.'};
  assert.equal((await send(command)).reason,'composer_busy');assert.equal(await page.locator('textarea').inputValue(),'User draft');assert.equal(await page.evaluate(()=>window.auth.length),0);
  await load();await page.evaluate(()=>{window.denyAt=2;});assert.equal((await send(command)).reason,'bootstrap_stopped');assert.equal(await page.evaluate(()=>window.clicked),0,'second authorization required before click');
  await load();await page.evaluate(()=>{
    history.replaceState({},'','/');window.adopted=0;
    document.querySelector('main').innerHTML='<h1>Home</h1><nav><button id="existing">Same title</button></nav><button id="new" data-app-action-sidebar-project-create>New project</button><div role="dialog" hidden><input id="chatgpt-project-name" type="text"><button id="create">Create project</button></div>';
    document.querySelector('#existing').onclick=()=>{window.adopted++;};document.querySelector('#new').onclick=()=>{document.querySelector('[role="dialog"]').hidden=false;};
    document.querySelector('#create').onclick=()=>{document.querySelector('h1').textContent='Same title';history.replaceState({},'','/g/g-p-'+'b'.repeat(32)+'/project');};
  });
  assert.equal((await send({type:'bootstrap-project',channel:'arena',jobId:'fresh-arena',attempt:'fresh-attempt',projectName:'Same title'})).kind,'project');
  assert.equal(await page.evaluate(()=>window.adopted),0,'Arena never adopts Corp Project from matching title');
  assert.equal(external,0);
  console.log(JSON.stringify({pass:true,fixture:'synthetic worker + browser content; no real ChatGPT actions',version:'0.4.0',sharedCredential:true,serialLanes:true,restartOutboxRouting:true,bootstrapOwnershipIsolation:true,resetGenerationClearsMetadataOnly:true,stableGenerationPreservesMetadata:true,freshArenaProject:true,generic21RoleDescriptors:true,channelMarkers:true,doubleAuthorization:true,draftGuard:true,externalRequests:0},null,2));
}finally{await browser.close();}
