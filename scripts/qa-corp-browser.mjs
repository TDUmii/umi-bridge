// Isolated, synthetic browser test. No provider traffic, login or production state.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startGateway } from './local-web-gateway.mjs';
const require = createRequire(import.meta.url);
if (!process.env.PLAYWRIGHT_MODULE) throw Error('Set PLAYWRIGHT_MODULE to the installed playwright module path.');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const root = await mkdtemp(join(tmpdir(), 'umibridge-corp-browser-'));
const screenshots = resolve('.impeccable/review/corp'); await mkdir(screenshots, { recursive: true });
let offset=0, limited=true, gateway, context, diagnostic;
const errors=[], remote=[];
const fixture = (quota, draft='') => `<!doctype html><html><body><h1>UmiBridge synthetic ChatGPT fixture</h1><main id="conversation">${quota?'<div role="alert">You have reached your usage limit. Try again in 2h 29min.</div>':''}</main><form onsubmit="return false"><textarea id="prompt-textarea">${draft}</textarea><button type="button" data-testid="send-button">Send</button></form><script>window.sentCount=0;document.querySelector('button').onclick=()=>{window.sentCount++;const user=document.createElement('div');user.dataset.messageAuthorRole='user';user.textContent=document.querySelector('textarea').value;document.querySelector('textarea').value='';document.querySelector('main').append(user);const turn=document.createElement('article');const answer=document.createElement('div');answer.dataset.messageAuthorRole='assistant';answer.textContent='SYNTHETIC_RESULT_'+window.sentCount;const copy=document.createElement('button');copy.dataset.testid='copy-turn-action-button';copy.textContent='Copy';turn.append(answer,copy);document.querySelector('main').append(turn);};</script></body></html>`;
async function until(fn, label, timeout=50000) { const start=Date.now();while(Date.now()-start<timeout){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,500));}throw Error('Timed out: '+label); }
try {
  gateway=await startGateway({port:0,publicUrl:'http://127.0.0.1',connectionSecret:randomBytes(32).toString('base64url'),configDir:join(root,'profile'),corpClock:()=>Date.now()+offset});
  const origin=`http://127.0.0.1:${gateway.port}`;
  const api=async(path,body)=>{const response=await fetch(origin+'/admin/api/'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-dc-admin-action':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.equal(response.ok,true,JSON.stringify(value));return value;};
  const a=(await api('workspaces',{name:'MINH HỌA - Sếp',root:'D:\\SyntheticCorp',chatUrl:'https://chatgpt.com/c/fixture-boss'})).workspace;
  const b=(await api('workspaces',{name:'MINH HỌA - Lập trình',root:'D:\\SyntheticCorp',chatUrl:'https://chatgpt.com/c/fixture-builder'})).workspace;
  const extension=resolve('extensions/umibridge-corp');
  context=await chromium.launchPersistentContext(join(root,'browser'),{headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1600,height:1000}});
  await context.route('https://chatgpt.com/**',route=>{
    const builder=route.request().url().includes('fixture-builder');
    let html=fixture(builder&&limited);
    if(builder) html=html.replace("user.dataset.messageAuthorRole='user'", "user.setAttribute('data-chatgpt-search-unit-key','turn:user')").replace("answer.dataset.messageAuthorRole='assistant'", "answer.setAttribute('data-chatgpt-search-unit-key','turn:assistant');turn.setAttribute('data-talvt-turn-state','complete')");
    return route.fulfill({contentType:'text/html',body:html});
  });
  context.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('https://chatgpt.com/')&&!request.url().startsWith('chrome-extension:'))remote.push(request.url());});});
  const boss=await context.newPage();await boss.goto('https://chatgpt.com/c/fixture-boss');
  const builder=await context.newPage();await builder.goto('https://chatgpt.com/c/fixture-builder');
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  diagnostic=async()=>({state:await api('corp'),extension:await worker.evaluate(()=>chrome.storage.local.get(['status','checkedAt'])),pages:await Promise.all(context.pages().map(async p=>({url:p.url(),text:(await p.locator('body').innerText()).slice(0,1500)}))),errors});
  const {token}=await api('corp/pair',{});
  await worker.evaluate(async value=>{await chrome.storage.local.set(value);}, {endpoint:origin,token});
  const page=await context.newPage();await page.goto(origin+'/admin#corp');
  await page.locator('#corpEnabled').click();
  await page.locator('#corpRunTitle').fill('MINH HỌA - Sếp giao việc, nhân viên nhận hồ sơ');
  await page.locator('#corpSteps select').selectOption(a.id);await page.locator('#corpSteps input').fill('CEO / Orchestrator');await page.locator('#corpSteps textarea').fill('Lập yêu cầu thử nghiệm. Chỉ trả lời bằng văn bản minh họa.');
  await page.locator('#corpAddStep').click();await page.locator('#corpSteps select').nth(1).selectOption(b.id);await page.locator('#corpSteps input').nth(1).fill('Lập trình');await page.locator('#corpSteps textarea').nth(1).fill('Nhận bàn giao và báo hoàn thành minh họa.');
  await page.locator('#corpForm button[type=submit]').click();
  await page.locator('#corpRuns button', {hasText:'Bắt đầu'}).click();
  await until(async()=>{const d=await api('corp');return d.runs[0]?.steps[1]?.status==='limit_wait';},'handoff and quota');
  let snapshot=await api('corp');assert.equal(snapshot.events.filter(e=>e.type==='handoff').length,1);assert.equal(await boss.evaluate(()=>window.sentCount),1);assert.equal(await builder.evaluate(()=>window.sentCount),0);
  await page.locator('#corpRuns time').waitFor();
  await page.evaluate(()=>{const main=document.getElementById('main');main.style.scrollBehavior='auto';main.scrollTop=0;});
  await page.waitForFunction(()=>document.getElementById('main').scrollTop===0);
  if(!process.env.CORP_SKIP_CAPTURES) await page.screenshot({path:join(screenshots,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>document.getElementById('main').scrollTop=0);if(!process.env.CORP_SKIP_CAPTURES)await page.screenshot({path:join(screenshots,'laptop.png'),fullPage:true});
  await page.locator('#corpRuns').scrollIntoViewIfNeeded();if(!process.env.CORP_SKIP_CAPTURES)await page.screenshot({path:join(screenshots,'queue.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const office=page.frameLocator('#corpScene');await office.locator('#roster button').first().click();assert.equal(await office.locator('#detail').isVisible(),true);
  await office.locator('#motion').click();assert.equal(await office.locator('#motion').getAttribute('aria-pressed'),'true');
  await page.locator('#corpOffice').click();await until(async()=>!(await api('corp')).office,'office toggle');
  await page.reload();assert.equal(await page.locator('#corpScene').isHidden(),true);await page.locator('#corpOffice').click();
  // Deadline advancement affects only this disposable gateway clock. No real waiting or provider calls.
  limited=false;offset=snapshot.runs[0].steps[1].resetAt-Date.now()+1000;
  await until(async()=>await builder.evaluate(()=>window.sentCount===1),'resumed send');
  await builder.locator('[data-talvt-turn-state]').evaluate(el=>el.setAttribute('data-talvt-turn-state','streaming'));
  await new Promise(resolve=>setTimeout(resolve,8000));
  assert.notEqual((await api('corp')).runs[0].status,'done','streaming answer must not hand off even with copy button');
  await builder.locator('[data-talvt-turn-state]').evaluate(el=>el.setAttribute('data-talvt-turn-state','complete'));
  await until(async()=>(await api('corp')).runs[0]?.status==='done','automatic resume after reset');
  assert.equal(await builder.evaluate(()=>window.sentCount),1);
  snapshot=await api('corp');assert.equal(snapshot.runs[0].steps[1].result,'SYNTHETIC_RESULT_1');
  // Assistant prose cannot be mistaken for the quota UI; existing draft cannot be overwritten.
  const draftPage=await context.newPage();await draftPage.goto('https://chatgpt.com/c/fixture-draft');
  await draftPage.locator('textarea').fill('USER_DRAFT_PRESERVED');
  const d=(await api('workspaces',{name:'MINH HỌA - Bản nháp',root:'D:\\SyntheticCorp',chatUrl:'https://chatgpt.com/c/fixture-draft'})).workspace;
  const blocked=await api('corp/runs',{title:'Draft guard',steps:[{workspaceId:d.id,prompt:'Do not overwrite draft'}]});await api('corp/runs/'+blocked.id+'/start',{});
  await until(async()=>(await api('corp')).runs.find(r=>r.id===blocked.id).steps[0].status==='blocked','draft guard');
  assert.equal(await draftPage.locator('textarea').inputValue(),'USER_DRAFT_PRESERVED');assert.equal(await draftPage.evaluate(()=>window.sentCount),0);
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  console.log(JSON.stringify({pass:true,realExtension:true,syntheticProvider:true,desktop:[1600,1000],laptop:[1366,768],dispatchOnce:true,handoff:true,quotaResetResume:true,draftPreserved:true,remoteRequests:remote.length,screenshots},null,2));
} catch(error) { if(diagnostic)console.error(JSON.stringify(await diagnostic(),null,2));throw error; }
finally {await context?.close();await gateway?.close();await rm(root,{recursive:true,force:true});}
