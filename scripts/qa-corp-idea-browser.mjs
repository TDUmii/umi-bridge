// Isolated browser/extension proof: provider UI is synthetic and no account is used.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {startGateway} from './local-web-gateway.mjs';
const require=createRequire(import.meta.url);
if(!process.env.PLAYWRIGHT_MODULE)throw Error('Set PLAYWRIGHT_MODULE.');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const root=await mkdtemp(join(tmpdir(),'umibridge-idea-browser-')),shots=resolve('.impeccable/review/corp-idea');await mkdir(shots,{recursive:true});
const projectId='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',projectUrl=`https://chatgpt.com/g/${projectId}/project`;
let context,gateway,projectName='',projectsCreated=0,chatSequence=0,finalQaCount=0;
const chats=new Map(),turns=[],errors=[],remote=[],providerPaths=[],creationBodies=[];
const manualRoot=join(root,'MINH HOA - manual folder'),pickerRoot=join(root,'projects'),pickedRoot=join(pickerRoot,'MINH HOA - picked folder');let folderError=null;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wait=async(fn,label,timeout=240000)=>{const start=Date.now();while(Date.now()-start<timeout){if(errors.length)throw Error(errors.join('\n'));if(await fn())return;await new Promise(resolve=>setTimeout(resolve,400));}throw Error('Timed out: '+label);};
const html=(path)=>{
  const id=path.match(/\/c\/([^/]+)$/)?.[1],chat=chats.get(id);
  const items=[...chats].map(([id,item])=>`<a href="/g/${projectId}/c/${id}">${escape(item.role)}</a>`).join('');
  return `<!doctype html><html lang="vi"><body><nav><button aria-label="Thêm dự án mới" data-app-action-sidebar-project-create>+</button></nav><main data-chatgpt-project-conversation-drop-target><h1>${escape(projectName||'MINH HỌA - ChatGPT')}</h1>${chat?`<article><div data-message-author-role="user">${escape(chat.seed)}</div><div data-message-author-role="assistant">UMI_READY ${escape(chat.role)}</div><button data-testid="copy-turn-action-button">Copy</button></article>`:`<div role="tabpanel" id="project-chats">${items}</div>`}</main><form onsubmit="return false"><textarea id="prompt-textarea" aria-label="Tin nhắn"></textarea><button type="button" data-testid="send-button">Gửi</button></form><script>
document.querySelector('nav button').onclick=()=>{const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<h2>Tạo dự án</h2><label for="chatgpt-project-name">Tên dự án</label><input id="chatgpt-project-name" type="text"><button>Tạo dự án</button>';document.body.append(dialog);dialog.querySelector('button').onclick=async()=>{const result=await fetch('/fixture/project',{method:'POST',body:JSON.stringify({name:dialog.querySelector('input').value})}).then(r=>r.json());location.href=result.url;};};
document.querySelector('[data-testid="send-button"]').onclick=async()=>{const input=document.getElementById('prompt-textarea'),prompt=input.value;if(!prompt)return;input.value='';if(prompt.startsWith('[UmiBridge setup ')){const result=await fetch('/fixture/chat',{method:'POST',body:JSON.stringify({prompt})}).then(r=>r.json());location.href=result.url;return;}
const user=document.createElement('div');user.dataset.messageAuthorRole='user';user.textContent=prompt;document.querySelector('main').append(user);const result=await fetch('/fixture/answer',{method:'POST',body:JSON.stringify({prompt})}).then(r=>r.json());const article=document.createElement('article');article.dataset.talvtTurnState='complete';const answer=document.createElement('div');answer.dataset.messageAuthorRole='assistant';answer.textContent=result.text;const copy=document.createElement('button');copy.dataset.testid='copy-turn-action-button';copy.textContent='Copy';article.append(answer,copy);document.querySelector('main').append(article);};
</script></body></html>`;
};
new Function(html('/').match(/<script>([\s\S]*?)<\/script>/)[1]);
try{
  await mkdir(manualRoot,{recursive:true});await mkdir(pickedRoot,{recursive:true});
  gateway=await startGateway({port:0,publicUrl:'http://127.0.0.1',connectionSecret:randomBytes(32).toString('base64url'),configDir:join(root,'profile'),corpProjectsRoot:join(root,'projects')});
  const origin=`http://127.0.0.1:${gateway.port}`;
  const api=async(path,body)=>{const response=await fetch(origin+'/admin/api/'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-dc-admin-action':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
  const extension=resolve('extensions/umibridge-corp');
  context=await chromium.launchPersistentContext(join(root,'browser'),{headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1600,height:1000}});
  await context.addInitScript(()=>{try{localStorage.setItem('umibridge.admin.language','vi');}catch{}});
  await context.route('**/admin/api/corp/folder',route=>{if(folderError)return route.fulfill({status:400,json:{error:folderError}});const path=JSON.parse(route.request().postData()||'{}').path||pickerRoot;return route.fulfill({json:{path,parentPath:path===root?null:dirname(path),roots:[{name:'MINH HỌA',path:pickerRoot}],folders:path===pickerRoot?[{name:'MINH HOA - picked folder',path:pickedRoot}]:[],truncated:false}});});
  await context.route('**/admin/api/corp/projects',async route=>{const body=JSON.parse(route.request().postData()||'{}');creationBodies.push(body);await new Promise(resolve=>setTimeout(resolve,300));if(process.env.CORP_FOLDER_ONLY)return route.fulfill({json:{id:'fixture-folder-only',name:'MINH HỌA - Chọn thư mục',root:join(body.parentRoot,'fixture-project'),status:'paused',chats:[]}});await route.continue();});
  await context.route('https://chatgpt.com/**',async route=>{
    const url=new URL(route.request().url());
    providerPaths.push({path:url.pathname,method:route.request().method()});
    if(url.pathname==='/fixture/project'){projectsCreated++;projectName=JSON.parse(route.request().postData()).name;return route.fulfill({contentType:'application/json',body:JSON.stringify({url:projectUrl})});}
    if(url.pathname==='/fixture/chat'){
      const {prompt}=JSON.parse(route.request().postData()),role=prompt.match(/\[UmiBridge setup [^:]+:([^\]]+)\]/)?.[1];assert.ok(role);
      assert.equal([...chats.values()].some(chat=>chat.role===role),false,'department chat created only once');
      const id='created-'+(++chatSequence);chats.set(id,{role,seed:prompt});return route.fulfill({contentType:'application/json',body:JSON.stringify({url:`https://chatgpt.com/g/${projectId}/c/${id}`})});
    }
    if(url.pathname==='/fixture/answer'){
      const {prompt}=JSON.parse(route.request().postData());turns.push(prompt);
      const phase=prompt.match(/\nChặng: ([^\n]+)/)?.[1]||'';let outcome='pass';
      if(phase==='Kiểm thử độc lập')outcome='needs_changes';
      if(phase==='Nghiệm thu sau sửa'&&++finalQaCount===1)outcome='needs_changes';
      const result={outcome,summary:'MINH HỌA - '+phase,artifacts:['MINH-HOA/report.md'],checks:[{name:'Synthetic provider check',status:outcome==='pass'?'pass':'fail',evidence:'Synthetic fixture, no real implementation'}]};
      return route.fulfill({contentType:'application/json',body:JSON.stringify({text:'MINH HỌA - '+phase+'\nUMI_CORP_RESULT: '+JSON.stringify(result)})});
    }
    return route.fulfill({contentType:'text/html; charset=utf-8',body:html(url.pathname)});
  });
  context.on('page',page=>{page.on('pageerror',error=>errors.push(error.stack||error.message));page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('https://chatgpt.com/')&&!request.url().startsWith('chrome-extension:'))remote.push(request.url());});});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  // Attach the isolated test route before extension-created tabs navigate; their first
  // navigation otherwise races Playwright's page attachment and could reach the provider.
  await worker.evaluate(()=>{
    const create=chrome.tabs.create.bind(chrome.tabs);
    chrome.tabs.create=async options=>{
      if(!options.url?.startsWith('https://chatgpt.com/'))return create(options);
      const tab=await create({...options,url:'about:blank'});await new Promise(resolve=>setTimeout(resolve,500));
      return chrome.tabs.update(tab.id,{url:options.url});
    };
  });
  const {token}=await api('corp/pair',{});await worker.evaluate(value=>chrome.storage.local.set(value),{token,endpoint:origin});await api('corp/settings',{enabled:true});
  await wait(async()=>(await api('corp')).connected,'extension connected');
  const page=await context.newPage();await page.goto(origin+'/admin#corp');await page.locator('#corpTabIdea').click();
  assert.equal(await page.locator('#corpIdeaTarget').inputValue(),'new');assert.equal(await page.locator('#corpIdeaTeam>div').count(),8);
  const folderInput=page.locator('#corpIdeaParentRoot'),folderBrowse=page.locator('#corpIdeaBrowse'),folderDialog=page.locator('#corpFolderDialog');assert.equal(await folderInput.inputValue(),pickerRoot);
  const folderReady=()=>page.waitForFunction(()=>!document.getElementById('corpFolderSelect').disabled);
  await folderBrowse.click();await folderDialog.waitFor();await folderReady();assert.equal(await page.locator('#corpFolderPath').inputValue(),pickerRoot);await page.locator('#corpFolderList button',{hasText:'MINH HOA - picked folder'}).click();await folderReady();assert.equal(await folderInput.inputValue(),pickerRoot,'navigation waits for confirmation');await page.screenshot({path:join(shots,'folder-dialog-desktop.png'),animations:'disabled'});await page.setViewportSize({width:1366,height:768});await page.screenshot({path:join(shots,'folder-dialog-laptop.png'),animations:'disabled'});await page.locator('#corpFolderSelect').click();await folderDialog.waitFor({state:'hidden'});assert.equal(await folderInput.inputValue(),pickedRoot);
  await folderBrowse.click();await folderReady();await page.locator('#corpFolderUp').click();await folderReady();await page.locator('#corpFolderCancel').click();await folderDialog.waitFor({state:'hidden'});assert.equal(await folderInput.inputValue(),pickedRoot,'cancel preserves chosen folder');
  await folderBrowse.click();await folderReady();await page.keyboard.press('Escape');await folderDialog.waitFor({state:'hidden'});assert.equal(await folderInput.inputValue(),pickedRoot,'Escape preserves chosen folder');
  folderError='folder_path_unavailable';await folderBrowse.click();await page.locator('#corpFolderError').waitFor({state:'visible'});assert.equal(await folderDialog.isVisible(),true);assert.equal(await page.locator('#corpFolderSelect').isDisabled(),true);assert.equal(await folderInput.inputValue(),pickedRoot,'listing error preserves chosen folder');folderError=null;await page.locator('#corpFolderPath').fill(manualRoot);await page.locator('#corpFolderOpen').click();await folderReady();await page.locator('#corpFolderCancel').click();await folderDialog.waitFor({state:'hidden'});
  if(process.env.CORP_FOLDER_ONLY){
    await page.locator('#corpIdeaText').fill('MINH HỌA - Chọn thư mục đầu ra Project.');await Promise.all([page.waitForRequest(request=>request.url()===origin+'/admin/api/corp/projects'),page.locator('#corpIdeaSubmit').click()]);assert.equal(await folderInput.evaluate(el=>el.readOnly),true);assert.equal(await folderBrowse.isDisabled(),true);await page.waitForFunction(()=>!document.getElementById('corpIdeaSubmit').disabled);assert.equal(creationBodies[0].parentRoot,pickedRoot);assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);assert.equal(projectsCreated,0);assert.equal(turns.length,0);const report={pass:true,fixture:'disposable gateway + mocked dashboard folder tree; no provider actions',dashboardFolderBrowser:true,navigationAndConfirm:true,cancelAndEscapePreserve:true,listErrorPreserves:true,chosenParentRootSubmitted:true,creationFreezesFolder:true,providerActions:0,remoteRequests:0};await writeFile(join(shots,'folder-dialog-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }else{
  await page.setViewportSize({width:1600,height:1000});
  await folderInput.fill(manualRoot);await folderInput.dispatchEvent('change');await page.waitForResponse(response=>response.url()===origin+'/admin/api/corp');assert.equal(await folderInput.inputValue(),manualRoot,'polling preserves manual folder');
  await page.reload();await folderInput.waitFor();assert.equal(await folderInput.inputValue(),manualRoot,'saved folder restores after reload');
  await page.locator('#corpIdeaText').fill('MINH HỌA - Tạo ứng dụng quản lý bài tập cho học sinh, có lịch học và danh sách việc cần làm.');
  await page.screenshot({path:join(shots,'idea-desktop.png'),animations:'disabled'});
  await page.setViewportSize({width:1366,height:768});await page.screenshot({path:join(shots,'idea-laptop.png'),animations:'disabled'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await Promise.all([page.waitForRequest(request=>request.url()===origin+'/admin/api/corp/projects'),page.locator('#corpIdeaSubmit').click()]);assert.equal(await folderInput.evaluate(el=>el.readOnly),true,'creation freezes folder input');assert.equal(await folderBrowse.isDisabled(),true,'creation freezes folder picker');await page.locator('#corpBootstraps').waitFor();assert.equal(creationBodies[0].parentRoot,manualRoot,'typed folder is submitted');
  await wait(async()=>{const data=await api('corp');if(data.bootstraps[0]?.status==='blocked')throw Error('Bootstrap blocked: '+data.bootstraps[0].reason);return data.bootstraps[0]?.status==='done';},'one Project and eight department chats');
  assert.equal(projectsCreated,1);assert.equal(chats.size,8);assert.ok((await api('corp')).bootstraps[0].root.startsWith(manualRoot),'Project files use chosen parent folder');
  await wait(async()=>{const run=(await api('corp')).runs[0];if(run?.steps.some(step=>step.status==='blocked'))throw Error('Workflow blocked: '+run.steps.find(step=>step.status==='blocked').reason);return run?.status==='done';},'idea workflow including extra repair and final delivery');
  const data=await api('corp'),run=data.runs[0];assert.equal(run.steps.length,13);assert.equal(run.idea.repairRounds,2);assert.equal(turns.length,13);
  assert.equal(run.steps.at(-1).assessment.outcome,'pass');assert.ok(run.steps.filter(step=>step.stage==='qa-final').some(step=>step.assessment.outcome==='needs_changes'));
  assert.equal(await page.locator('#corpProject').inputValue(),data.bootstraps[0].workspaceId,'dashboard follows the new Project');
  await page.locator('#corpTabQueue').click();await page.locator('#corpRunFilter').selectOption('all');await page.locator('.corp-run[data-status="done"]').waitFor();await page.screenshot({path:join(shots,'idea-delivery.png'),animations:'disabled'});
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  console.log(JSON.stringify({pass:true,realExtension:true,syntheticProvider:true,desktop:[1600,1000],laptop:[1366,768],folderSelection:true,folderCancelAndErrorPreserveInput:true,manualFolderSurvivesPollingAndReload:true,creationFreezesFolder:true,chosenRootUsed:true,projectsCreated,departmentChats:chats.size,workflowTurns:turns.length,extraRepair:true,delivered:true,remoteRequests:remote.length,screenshots:shots},null,2));
  }
}catch(error){console.error(JSON.stringify({projectsCreated,chats:chats.size,turns:turns.length,errors,providerPaths,pages:await Promise.all((context?.pages()||[]).map(async page=>({url:page.url(),text:(await page.locator('body').innerText().catch(()=>'' )).slice(0,800)})))}));throw error;}
finally{await context?.close();await gateway?.close();await rm(root,{recursive:true,force:true});}
