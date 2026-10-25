// Disposable gateway + synthetic Corp responses. No provider/account/extension actions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {startGateway} from './local-web-gateway.mjs';
import {companyRoles,ideaStages,arenaRubric} from './corp-company.mjs';
const require=createRequire(import.meta.url);
if(!process.env.PLAYWRIGHT_MODULE)throw Error('Set PLAYWRIGHT_MODULE.');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const root=await mkdtemp(join(tmpdir(),'umibridge-arena-ui-')),shots=resolve('.impeccable/review/corp-arena');await mkdir(shots,{recursive:true});
const makeProject=(id,name)=>({id,kind:'project',name,root:join(root,id),chatUrl:`https://chatgpt.com/g/g-p-${id.repeat(32).slice(0,32)}/project`,sync:{status:'complete'},chats:companyRoles.map((role,index)=>({chatId:id+'-chat-'+index,name:role.department,chatUrl:`https://chatgpt.com/g/g-p-${id.repeat(32).slice(0,32)}/c/${id}-chat-${index}`}))});
const project=makeProject('a','MINH HỌA - Arena học tập'),other=makeProject('b','MINH HỌA - Project khác');
function makeArena(id,workspaceId,count=20){
  const candidates=Array.from({length:count},(_,i)=>({id:`${id}-candidate-${i}`,index:i,label:`Phương án ${String(i+1).padStart(2,'0')} - Lịch học ${i%2?'trực quan':'theo môn'}`,status:'done',root:join(root,'products',String(i+1)),runId:null,artifacts:[`products/${i+1}/DELIVERY.md`]}));
  const arena={id,title:'MINH HỌA - Ứng dụng lịch học',idea:'MINH HỌA - Tạo ứng dụng giúp học sinh lập lịch học và nhắc bài tập.',workspaceId,count,mode:'build',format:'group_knockout',rubricVersion:1,rubric:structuredClone(arenaRubric),status:'paused',phase:'matches',candidateRuns:candidates,groups:[],rounds:[],matches:[],history:[]};
  const makeMatch=(matchId,leftId,rightId,stage,extra={})=>({id:matchId,leftId,rightId,stage,...extra,status:rightId?'done':'bye',winnerId:leftId,completedAt:'2026-10-25T09:00:00.000Z',decision:rightId?{winner:leftId,summary:'MINH HỌA - Phương án rõ ràng hơn, đáp ứng tiêu chí đã chấm.',scores:[{candidateId:leftId,score:90,reason:'Luồng học sinh ngắn gọn.',criteria:arenaRubric.map(item=>({id:item.id,score:item.max*.9,reason:'MINH HỌA - rubric kiểm tra.'}))},{candidateId:rightId,score:80,reason:'Cần giảm bước nhập.',criteria:arenaRubric.map(item=>({id:item.id,score:item.max*.8,reason:'MINH HỌA - cần giảm bước.'}))}],checks:[leftId,rightId].map(candidateId=>({candidateId,name:'Kiểm thử local',status:'pass',evidence:'MINH HỌA - fixture, không xác nhận sản phẩm thật.',artifacts:['reports/qa.md']}))}:null});
  for(let start=0;start<count;start+=5){const members=candidates.slice(start,start+5).map(c=>c.id),groupId=`${id}-group-${start/5+1}`,matches=[];for(let left=0;left<members.length;left++)for(let right=left+1;right<members.length;right++)matches.push(makeMatch(`${groupId}-${left}-${right}`,members[left],members[right],'group',{groupId}));const standings=members.map((candidateId,index)=>({candidateId,rank:index+1,played:4,wins:4-index,losses:index,points:(4-index)*3,scoreFor:(4-index)*90+index*80,scoreAgainst:(4-index)*80+index*90,scoreDifference:(4-2*index)*10,qualified:index<2}));arena.groups.push({id:groupId,label:`Bảng ${String.fromCharCode(65+start/5)}`,candidateIds:members,matches,standings,qualifiedIds:members.slice(0,2),status:'done'});arena.matches.push(...matches);}
  let input=arena.groups.flatMap(group=>group.qualifiedIds),number=1;
  while(input.length>1){const matches=[],output=[];for(let i=0;i<input.length;i+=2){const match=makeMatch(`${id}-round-${number}-${i/2}`,input[i],input[i+1]||null,'knockout',{round:number,slot:i/2});matches.push(match);output.push(match.winnerId);}arena.rounds.push({number,inputIds:input,outputIds:output,matches});arena.matches.push(...matches);input=output;number++;}
  arena.history=arena.matches.filter(match=>match.decision).map(match=>({id:'history-'+match.id,type:'match_completed',at:match.completedAt,matchId:match.id,stage:match.stage,groupId:match.groupId,round:match.round,winnerId:match.winnerId,decision:match.decision}));
  arena.winnerId=input[0];arena.completion={artifacts:['WINNER.md']};return arena;
}
const arena=makeArena('arena-a',project.id),hiddenArena=makeArena('arena-other',other.id);
const state={enabled:true,office:true,autoResume:true,paired:true,connected:true,extensionVersion:'0.3.0',connectedChats:project.chats.map(c=>c.chatId),workspaces:[project,other],companyRoles,ideaStages,deliveryOrder:companyRoles.map(r=>r.id),teams:[],ideaProjects:[],runs:[],events:[],bootstraps:[],arenas:[arena,hiddenArena],projectsRoot:join(root,'projects')};
const posts=[],external=[],errors=[];let gateway,browser,failCreate=true,failAction=false;
try{
  gateway=await startGateway({port:0,publicUrl:'http://127.0.0.1',connectionSecret:randomBytes(32).toString('base64url'),configDir:join(root,'profile'),corpProjectsRoot:join(root,'projects')});
  const origin=`http://127.0.0.1:${gateway.port}`;
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(()=>{localStorage.setItem('umibridge.admin.language','vi');localStorage.setItem('umibridge.corp.tab',localStorage.getItem('umibridge.corp.tab')||'office');});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){external.push(request.url());return route.abort();}
    if(url.pathname==='/admin/api/corp')return route.fulfill({json:state});
    if(request.method()==='POST'&&url.pathname.startsWith('/admin/api/corp/')){
      const body=JSON.parse(request.postData()||'{}');posts.push({path:url.pathname,body});
      if(url.pathname.endsWith('/projects')){
        if(failCreate)return route.fulfill({status:400,json:{error:'invalid_arena_idea'}});
        await new Promise(resolve=>setTimeout(resolve,200));
        const job={id:'fixture-bootstrap',name:'MINH HỌA - Arena mới',kind:'arena',count:body.count,status:'paused',chats:[],workspaceId:other.id};state.bootstraps=[job];return route.fulfill({json:job});
      }
      if(url.pathname.includes('/arenas/')){
        if(failAction)return route.fulfill({status:400,json:{error:'arena_evidence_invalid'}});
        const verb=url.pathname.split('/').at(-1);if(verb==='start')arena.status='running';if(verb==='pause'||verb==='retry')arena.status='paused';if(verb==='cancel')arena.status='cancelled';return route.fulfill({json:arena});
      }
      return route.fulfill({json:{ok:true}});
    }
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack||e.message));await page.goto(origin+'/admin#corp');
  const refresh=async()=>{await Promise.all([page.waitForResponse(response=>response.url()===origin+'/admin/api/corp'),page.locator('#corpArenaRefresh').click()]);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  const card=page.locator('[data-arena="arena-a"]');
  const view=name=>card.locator(`.corp-arena-tabs [data-arena-view="${name}"]`);
  const panel=name=>card.locator(`.corp-arena-view[data-view="${name}"]`);
  const assertRubric=async details=>{const tables=details.locator('.corp-arena-score-table');assert.equal(await tables.count(),2);for(let scoreIndex=0;scoreIndex<2;scoreIndex++){const rows=tables.nth(scoreIndex).locator('tbody tr');assert.equal(await rows.count(),5);for(let index=0;index<arenaRubric.length;index++){const criterion=arenaRubric[index];assert.equal(await rows.nth(index).locator('th').textContent(),criterion.label);assert.equal(await rows.nth(index).locator('td').first().innerText(),`${criterion.max*(scoreIndex===0?.9:.8)}/${criterion.max}`);}}};
  await page.locator('#corpProject option[value="a"]').waitFor({state:'attached'});
  await page.locator('#corpTabOffice').click();
  assert.equal(await page.locator('.corp-tab[aria-selected="true"]').count(),1);
  await page.locator('#corpTabOffice').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#corpTabIdea').getAttribute('aria-selected'),'true');await page.keyboard.press('End');assert.equal(await page.locator('#corpTabQueue').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');
  await page.locator('#corpComposeToggle').click();assert.equal(await page.locator('#corpCompose').isVisible(),true);await page.locator('#corpTabArena').click();assert.equal(await page.locator('#corpCompose').isVisible(),false);
  await page.locator('#corpTeamToggle').click();assert.equal(await page.locator('#corpTeam').isVisible(),true);await page.locator('#corpTabArena').click();assert.equal(await page.locator('#corpTeam').isVisible(),false);
  assert.equal(await page.locator('.corp-arena-match').count(),1,'Arena scope excludes other Project');
  assert.equal(await card.locator('.corp-arena-tabs [role="tab"]').count(),5);
  await view('groups').click();assert.equal(await panel('groups').isVisible(),true);assert.equal(await card.locator('.corp-arena-standings').count(),4);assert.match(await panel('groups').innerText(),/Bảng A/);assert.match(await panel('groups').innerText(),/Phương án 01/);assert.deepEqual(await card.locator('.corp-arena-standings').first().locator('tbody tr').first().locator('td').allTextContents(),['1',arena.candidateRuns[0].label+' · Đi tiếp','4','4','0','12','40']);
  await view('groups').focus();await page.keyboard.press('End');assert.equal(await view('products').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await view('live').getAttribute('aria-selected'),'true');await page.keyboard.press('ArrowRight');assert.equal(await view('groups').getAttribute('aria-selected'),'true');assert.equal(await card.locator('.corp-arena-tabs [aria-selected="true"]').count(),1);
  await view('bracket').click();assert.equal(await panel('bracket').isVisible(),true);assert.equal(await panel('bracket').locator('.corp-arena-round').count(),3);assert.equal(await panel('bracket').locator('.corp-arena-pair').count(),7,'eight qualified products play seven knockout matches');
  assert.match(await page.locator('.corp-arena-winner').innerText(),/Phương án 01/);assert.match(await page.locator('.corp-arena-winner').innerText(),/WINNER.md/);
  assert.equal(await panel('bracket').locator('.corp-arena-pair').first().innerText().then(text=>text.includes('candidate-')),false,'bracket shows human labels');
  const bracketReport=panel('bracket').locator('details').first();await bracketReport.locator('>summary').click();await bracketReport.locator('h6').first().waitFor();assert.match(await bracketReport.innerText(),/90/);assert.match(await bracketReport.innerText(),/rubric kiểm tra/);await assertRubric(bracketReport);
  await view('history').click();const filter=card.locator('.corp-arena-history-filter');await filter.selectOption('group');assert.equal(await panel('history').locator('[data-match]').count(),40);const historyReport=panel('history').locator('[data-match] details').first();await historyReport.locator('>summary').click();await historyReport.locator('h6').first().waitFor();assert.match(await historyReport.innerText(),/90/);assert.match(await historyReport.innerText(),/reports\/qa.md/);await assertRubric(historyReport);
  arena.history.push({id:'fixture-refresh',type:'paused',at:'2026-10-25T10:00:00.000Z'});arena.title+=' · polling';await page.waitForResponse(response=>response.url()===origin+'/admin/api/corp');await page.waitForFunction(()=>document.querySelector('[data-arena="arena-a"] h4')?.textContent.includes('polling'));assert.equal(await view('history').getAttribute('aria-selected'),'true','selected view survives changed snapshot');assert.equal(await filter.inputValue(),'group','history filter survives changed snapshot');assert.equal(await panel('history').locator('[data-match] details').first().getAttribute('open'),'','score report stays open after polling');
  await filter.selectOption('knockout');assert.equal(await panel('history').locator('[data-match]').count(),7);await filter.selectOption('all');assert.equal(await panel('history').locator('[data-match]').count(),47);
  await view('products').click();assert.equal(await panel('products').isVisible(),true);assert.match(await panel('products').innerText(),/Phương án 20/);await view('live').click();assert.equal(await panel('live').isVisible(),true);
  await page.locator('#corpArenaFormat').selectOption('knockout');await page.locator('#corpArenaCount').selectOption('100');assert.match(await page.locator('#corpArenaWorkload').innerText(),/1199/);await page.locator('#corpArenaCount').selectOption('50');assert.match(await page.locator('#corpArenaWorkload').innerText(),/599/);await page.locator('#corpArenaCount').selectOption('20');await page.locator('#corpArenaFormat').selectOption('group_knockout');
  await page.locator('#corpArenaPrompt').fill('MINH HỌA - Ý tưởng tạo sản phẩm lịch học cho học sinh.');await page.locator('#corpArenaSubmit').click();await page.waitForFunction(()=>document.getElementById('corpArenaStatus').classList.contains('error'));
  assert.equal(state.bootstraps.length,0);assert.equal(await page.locator('.corp-arena-match').count(),1,'failed create adds no fake Arena');const failedKey=posts.at(-1).body.requestKey;
  failCreate=false;await page.locator('#corpArenaSubmit').click();await page.locator('#corpArenaSubmit').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('corpArenaForm').getAttribute('aria-busy')==='false');assert.equal(posts.at(-1).body.requestKey,failedKey,'retry keeps idempotency key');
  assert.equal(posts.at(-1).path,'/admin/api/corp/projects');assert.equal(posts.at(-1).body.kind,'arena');assert.equal(posts.at(-1).body.mode,'build');assert.equal(posts.at(-1).body.format,'group_knockout');assert.equal(posts.at(-1).body.runAfterSetup,false);assert.match(await page.locator('#corpArenaStatus').innerText(),/tạm dừng/);assert.equal(await page.locator('#corpBootstraps .corp-bootstrap').count(),1);
  state.bootstraps=[];await refresh();
  state.enabled=false;await refresh();await page.waitForFunction(()=>document.querySelector('.corp-arena-match [data-action="start"]')?.disabled);assert.equal(await page.locator('.corp-arena-match [data-action="start"]').isDisabled(),true);state.enabled=true;await refresh();await page.waitForFunction(()=>!document.querySelector('.corp-arena-match [data-action="start"]')?.disabled);
  failAction=true;await page.locator('.corp-arena-match [data-action="start"]').click();await page.waitForFunction(()=>document.querySelector('.corp-arena-feedback')?.textContent.includes('Bằng chứng'));assert.equal(arena.status,'paused');failAction=false;
  await page.locator('.corp-arena-match [data-action="start"]').click();await page.locator('.corp-arena-match [data-action="pause"]').waitFor();await page.locator('.corp-arena-match [data-action="pause"]').click();await page.locator('.corp-arena-match [data-action="start"]').waitFor();
  await view('groups').click();await page.reload();await page.locator('#corpArena').waitFor();await card.waitFor();assert.equal(await page.locator('#corpTabArena').getAttribute('aria-selected'),'true');assert.equal(await view('groups').getAttribute('aria-selected'),'true','arena subview persists after reload');
  state.runs=[{id:'fixture-member',workspaceId:project.id,arenaId:arena.id,status:'paused',steps:[],title:'MINH HỌA - Member'}];await refresh();await page.locator('#corpTabQueue').click();assert.equal(await page.locator('#corpRuns .corp-run').count(),0);assert.match(await page.locator('#corpArenaQueueSummary').innerText(),/1 quy trình/);await page.locator('#corpArenaQueueSummary').click();
  const activeMatch=arena.rounds.at(-1).matches[0],finishedMatch=structuredClone(activeMatch);Object.assign(activeMatch,{status:'running',winnerId:null,decision:null,judgeRunId:'fixture-judge'});arena.status='running';arena.winnerId=null;
  state.runs=[{id:'fixture-judge',workspaceId:project.id,arenaId:arena.id,arenaKind:'judge',arenaMatchId:activeMatch.id,status:'running',title:'MINH HỌA - Chấm chung kết',steps:[{id:'fixture-step',role:'qa',chatId:project.chats[5].chatId,title:'MINH HỌA - Đang so sánh bằng chứng',status:'running'}]}];await refresh();await view('live').click();await card.locator('.corp-arena-live[data-active="true"]').waitFor();
  const runningMotion=()=>card.locator('.corp-arena-live').evaluate(el=>el.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().duration>1).length);
  assert.ok(await runningMotion()>0,'active fixture has visible CSS motion');await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await runningMotion(),0,'reduced motion stops live animation');await page.screenshot({path:join(shots,'arena-reduced-motion.png'),animations:'disabled'});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#corpArenaCreate').evaluate(el=>{el.open=false;});
  const sizes=[{width:1600,height:1000,name:'arena-desktop'},{width:1366,height:768,name:'arena-laptop'},{width:390,height:844,name:'arena-mobile-sanity'}];
  const screenshots=[];
  for(const size of sizes){await page.setViewportSize(size);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow '+size.width);assert.equal(await card.locator('.corp-arena-tabs').isVisible(),true);await panel('live').scrollIntoViewIfNeeded();const path=join(shots,size.name+'.png');await page.screenshot({path,animations:'disabled'});screenshots.push(path);for(const name of ['groups','bracket','history']){await view(name).click();assert.equal(await panel(name).isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} has no page overflow at ${size.width}`);const path=join(shots,size.name+'-'+name+'.png');await panel(name).screenshot({path,animations:'disabled'});screenshots.push(path);}await view('live').click();}
  Object.assign(activeMatch,finishedMatch);arena.status='paused';arena.winnerId=arena.candidateRuns[0].id;state.runs=[];await refresh();assert.equal(await card.locator('.corp-arena-live').getAttribute('data-active'),'false');assert.equal(await runningMotion(),0,'paused arena has no live motion');
  await page.setViewportSize({width:1600,height:1000});await page.locator('#corpTabOffice').click();const office=await page.locator('#corpPanelOffice').boundingBox(),workspace=await page.locator('.corp-workspace').boundingBox();assert.ok(Math.abs(office.width-workspace.width)<2,'office spans workspace');await page.screenshot({path:join(shots,'office-desktop.png'),animations:'disabled'});
  await page.locator('#corpTabQueue').click();const queue=await page.locator('#corpPanelQueue').boundingBox();assert.ok(Math.abs(queue.width-workspace.width)<2,'queue spans workspace');await page.screenshot({path:join(shots,'queue-desktop.png'),animations:'disabled'});
  state.paired=false;await page.locator('#corpTabArena').click();await refresh();await page.waitForFunction(()=>document.getElementById('corpArenaSubmit').disabled);assert.equal(await page.locator('#corpArenaSubmit').isDisabled(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={pass:true,fixture:'disposable gateway + mocked Corp API; no provider/account/extension actions',tabs:4,arenaViews:5,keyboardTabs:true,groups:4,groupMatches:40,knockoutRounds:3,knockoutMatches:7,historyMatches:47,rubricEvidence:true,pollingPreservesViewFilterAndDetails:true,reloadPreservesView:true,liveAnimation:true,reducedMotion:true,pausedMotionStops:true,idempotentRetry:true,creationFailureTruthful:true,scopedList:true,actionErrors:true,queueCompacted:true,externalRequests:external.length,screenshots:screenshots.concat([join(shots,'arena-reduced-motion.png'),join(shots,'office-desktop.png'),join(shots,'queue-desktop.png')])};await writeFile(join(shots,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await gateway?.close();await rm(root,{recursive:true,force:true});}
