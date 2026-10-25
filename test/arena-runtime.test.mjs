import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createArenaRuntime} from '../scripts/arena-runtime.mjs';

async function fixture(t,extra={}) {
  const root=await mkdtemp(join(tmpdir(),'umibridge-arena-independent-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let now=1800000000000;
  const file=join(root,'arena-state.json'),options={projectsRoot:join(root,'projects'),clock:()=>now,...extra};
  let runtime=await createArenaRuntime(file,options);
  const {token}=extra.authenticate?{token:'shared-browser-key'}:await runtime.pair();
  const create=input=>runtime.create({requestKey:randomUUID(),name:'Independent products',idea:'Build a complete local counter with source, tests and instructions.',...input});
  const poll=()=>{const snapshot=runtime.snapshot(),chats=snapshot.bootstraps.flatMap(row=>row.chats),projectChats=snapshot.bootstraps.flatMap(row=>row.chats.map(chat=>({chatId:chat.chatId,projectId:row.projectId})));return runtime.poll(token,{extensionVersion:'0.4.0',chats:chats.map(row=>row.chatId),projectChats});};
  const setup=async arena=>{
    await runtime.settings({enabled:true});await runtime.action(arena.id,'setup');
    for(let index=0;index<22;index++){
      const {bootstrap}=await poll();assert.ok(bootstrap);assert.equal(bootstrap.channel,'arena');assert.equal((await runtime.bootstrapAuthorize(token,bootstrap)).allowed,true);
      const projectId=`g-p-${arena.id.replaceAll('-','').slice(0,32)}`;
      if(bootstrap.type==='bootstrap-project')await runtime.bootstrapReport(token,{...bootstrap,kind:'project',projectUrl:`https://chatgpt.com/g/${projectId}/project`});
      else {assert.match(bootstrap.seed,/UmiBridge arena setup/);assert.equal(bootstrap.setupMarker,bootstrap.seed.split('\n')[0]);await runtime.bootstrapReport(token,{...bootstrap,kind:'chat',roleId:bootstrap.roleId,chatUrl:`https://chatgpt.com/g/${projectId}/c/${arena.id}-${bootstrap.roleId}`});}
    }
    return runtime.snapshot().arenas.find(row=>row.id===arena.id);
  };
  return {get runtime(){return runtime;},root,file,token,create,poll,setup,advance:ms=>now+=ms,restart:async()=>{await runtime.close();runtime=await createArenaRuntime(file,options);}};
}

async function product(f,command,{unchanged=false,artifacts,source}={}) {
  const arena=f.runtime.snapshot().arenas.find(row=>row.id===command.arenaId),candidate=arena.candidates.find(row=>row.id===command.candidateId);
  await mkdir(join(candidate.root,'src'),{recursive:true});
  if(!unchanged)await writeFile(join(candidate.root,'src','main.mjs'),`export const count = ${command.round};\n`);
  await writeFile(join(candidate.root,'README.md'),'Install: no dependencies. Build: node --check src/main.mjs. Test: node test.mjs. Run: node src/main.mjs.\n');
  await writeFile(join(candidate.root,'evidence.txt'),`Round ${command.round}: build passed; tests passed; run passed.\n`);
  const report={status:'complete',summary:`Working product round ${command.round}`,source:source||['src/main.mjs'],readme:'README.md',artifacts:artifacts||['src/main.mjs','README.md','evidence.txt'],checks:['build','test','run'].map(name=>({name,status:'pass',command:`node ${name}.mjs`,evidence:`${name}: passed`,artifacts:['evidence.txt']}))};
  return {report,candidate,result:`UMI_ARENA_PRODUCT: ${JSON.stringify(report)}`};
}

function decision(f,command) {
  const arena=f.runtime.snapshot().arenas.find(row=>row.id===command.arenaId),round=arena.rounds.at(-1),ranking=round.inputIds.map((candidateId,index)=>{
    const score=95-index;
    return {candidateId,score,feedback:`Product ${candidateId}: functionality passed; improve counter labels and test edge case at round ${command.round+1}.`,criteria:arena.rubric.map(row=>({id:row.id,score:row.max*score/100,reason:`Verified ${row.id}`})),checks:[{name:'Source and runtime review',status:'pass',evidence:'Build/test/run logs inspected and checks passed.',artifacts:['evidence.txt']}]};
  });
  return {summary:`Reviewed every active product at round ${round.number}`,ranking,advance:ranking.slice(0,Math.ceil(ranking.length/2)).map(row=>row.candidateId)};
}
const numericUsage=rows=>rows.map(({id,chatId,title,...row})=>row);

test('New Arena uses seven rubric criteria and gives contestants measurable acceptance standards',async t=>{
  const f=await fixture(t),arena=await f.create();
  assert.equal(arena.rubricVersion,2);
  assert.deepEqual(arena.rubric.map(({id,max})=>[id,max]),[['requirements',30],['ux',15],['evidence',20],['security',10],['performance',10],['maintainability',5],['delivery',10]]);
  assert.equal(arena.rubric.reduce((sum,row)=>sum+row.max,0),100);
  await f.setup(arena);await f.runtime.action(arena.id,'start');
  const {command}=await f.poll();
  for(const dimension of ['accessibility','performance','maintainability','delivery'])assert.ok(command.prompt.includes(dimension));
});

test('Legacy Arena keeps five-criterion scores and queued judge prompt across restart',async t=>{
  const f=await fixture(t),arena=await f.create();await f.setup(arena);await f.runtime.action(arena.id,'start');
  for(let index=0;index<20;index++){const {command}=await f.poll(),data=await product(f,command);await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:data.result});}
  await f.runtime.action(arena.id,'pause');
  const saved=JSON.parse(await readFile(f.file,'utf8')),legacy=saved.arenas[0];
  delete legacy.rubric;delete legacy.rubricVersion;
  const judge=legacy.steps.at(-1);judge.prompt='Legacy queued judge prompt: requirements35 ux15 evidence20 security15 delivery15';
  const oldDecision={summary:'Historical decision must stay intact',ranking:[{criteria:[{id:'security',score:12}]}]};
  legacy.history.push({type:'legacy_decision',decision:oldDecision});
  await writeFile(f.file,JSON.stringify(saved));await f.restart();
  const restored=f.runtime.snapshot().arenas[0];
  assert.equal(restored.rubricVersion,1);
  assert.equal(JSON.parse(await readFile(f.file,'utf8')).arenas[0].rubricVersion,1);
  assert.deepEqual(restored.rubric.map(({id,max})=>[id,max]),[['requirements',35],['ux',15],['evidence',20],['security',15],['delivery',15]]);
  assert.equal(restored.steps.at(-1).prompt,judge.prompt);assert.deepEqual(restored.history.at(-1).decision,oldDecision);
  await f.runtime.action(arena.id,'start');const {command}=await f.poll();
  const result=await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:'UMI_ARENA_RESULT: '+JSON.stringify(decision(f,command))});
  assert.equal(result.blocked,undefined);assert.equal(f.runtime.snapshot().arenas[0].rounds[0].decision.ranking[0].criteria.length,5);
});

test('Arena creates a separate Project, twenty independent chats/folders and one judge, paused after setup',async t=>{
  const f=await fixture(t),arena=await f.create();
  assert.equal(f.runtime.snapshot().enabled,false);assert.equal((await f.poll()).bootstrap,null);
  await assert.rejects(f.runtime.action(arena.id,'setup'),/enable_arena_first/);
  const ready=await f.setup(arena),snapshot=f.runtime.snapshot();
  assert.equal(ready.status,'paused');assert.equal(ready.candidates.length,20);assert.equal(new Set(ready.candidates.map(row=>row.root)).size,20);assert.equal(new Set(ready.candidates.map(row=>row.chatId)).size,20);
  assert.equal(snapshot.bootstraps[0].chats.length,21);assert.equal(ready.judge.roleId,'judge');assert.equal(ready.steps.length,20);assert.ok(ready.steps.every(row=>row.kind==='build'&&!row.workspaceId&&!row.roleId));
  assert.equal((await f.poll()).command,null);assert.equal(snapshot.runs,undefined);assert.equal(snapshot.teams,undefined);
  assert.ok(!JSON.stringify(snapshot).includes('companyRoles'));assert.ok(!JSON.stringify(snapshot).includes('ideaStages'));
  const folders=await readdir(arena.root);assert.equal(folders.filter(name=>name.startsWith('contestant-')).length,20);
});

test('Twenty full products reach champion only through feedback, individual revisions and five judge rounds',async t=>{
  const f=await fixture(t),arena=await f.create();await f.setup(arena);await f.runtime.action(arena.id,'start');
  const calls=[],oldVersions=[];
  for(let index=0;index<60;index++){
    if(f.runtime.snapshot().arenas[0].status==='done')break;
    const {command}=await f.poll();assert.ok(command,`Expected command ${index}`);assert.equal((await f.runtime.authorize(f.token,command)).allowed,true);assert.equal((await f.poll()).command,null,'Persisted outbox dispatches only once');
    calls.push(command);await f.runtime.report(f.token,{...command,kind:'sent'});
    let result;
    if(command.kind==='judge')result=`UMI_ARENA_RESULT: ${JSON.stringify(decision(f,command))}`;
    else {if(command.kind==='revise'){assert.match(command.prompt,/judge_feedback/);assert.match(command.prompt,/improve counter labels/);}const data=await product(f,command);result=data.result;}
    const response=await f.runtime.report(f.token,{...command,kind:'done',sent:true,result});assert.equal(response.blocked,undefined,response.reason);
    await f.runtime.report(f.token,{...command,kind:'done',sent:true,result});
    if(command.kind==='build')oldVersions.push(f.runtime.snapshot().arenas[0].candidates.find(row=>row.id===command.candidateId).versions[0]);
  }
  const finished=f.runtime.snapshot().arenas[0];
  assert.equal(finished.status,'done');assert.equal(finished.winnerId,'contestant-01');assert.deepEqual(finished.rounds.map(row=>row.inputIds.length),[20,10,5,3,2]);assert.deepEqual(finished.rounds.map(row=>row.outputIds.length),[10,5,3,2,1]);
  assert.equal(calls.filter(row=>row.kind==='build').length,20);assert.equal(calls.filter(row=>row.kind==='revise').length,20);assert.equal(calls.filter(row=>row.kind==='judge').length,5);assert.equal(f.runtime.usage().length,45);
  const champion=finished.candidates.find(row=>row.id===finished.winnerId);assert.equal(champion.versions.length,5);assert.equal(champion.feedback.length,5);assert.equal(finished.candidates[19].feedback.length,1);
  for(const version of oldVersions){const file=version.files.find(row=>row.path==='src/main.mjs');assert.equal(await readFile(file.snapshotPath,'utf8'),'export const count = 1;\n');}
  assert.equal(finished.history.filter(row=>row.type==='product_revised').length,20);assert.equal(finished.history.filter(row=>row.type==='round_completed').length,5);
  const usage=f.runtime.usage();assert.ok(usage.every(row=>row.status==='ok'&&row.usage.inputTokens>0&&row.usage.outputTokens>0));await f.restart();assert.deepEqual(f.runtime.usage(),usage);assert.equal(f.runtime.snapshot().arenas[0].winnerId,finished.winnerId);
  await f.runtime.resetMetadata();assert.equal(f.runtime.snapshot().arenas.length,0);assert.equal(f.runtime.snapshot().enabled,false);assert.deepEqual(numericUsage(f.runtime.usage()),numericUsage(usage));assert.ok(f.runtime.usage().every(row=>row.chatId===null&&row.title==='Lịch sử Arena'&&row.id.startsWith('arena-history-')));assert.equal(await readFile(champion.versions[0].files[0].snapshotPath,'utf8'),'export const count = 1;\n');
});

test('Restart pauses unconfirmed outbox, explicit reconciliation required, shared auth does not share data',async t=>{
  const f=await fixture(t,{authenticate:token=>{if(token!=='shared-browser-key')throw Error('invalid_browser_key');},isPaired:()=>true});
  const arena=await f.create();await f.setup(arena);await f.runtime.action(arena.id,'start');const {command}=await f.poll();
  assert.equal(f.runtime.usage().length,0);await f.restart();assert.equal((await f.poll()).command,null);assert.equal(f.runtime.snapshot().arenas[0].status,'paused');assert.equal(f.runtime.snapshot().arenas[0].steps[0].reason,'restart_reconcile');
  await assert.rejects(f.runtime.action(arena.id,'start'),/check_chat_before_retry/);await f.runtime.action(arena.id,'retry');await f.runtime.action(arena.id,'start');const retry=(await f.poll()).command;assert.notEqual(retry.attempt,command.attempt);assert.equal(retry.chatId,command.chatId);assert.match(retry.prompt,/đối chiếu thủ công/);
  await assert.rejects(f.runtime.report(f.token,{...command,kind:'sent'}),/stale_attempt/);await assert.rejects(f.runtime.poll('wrong'),/invalid_browser_key/);
  await f.runtime.report(f.token,{...retry,kind:'sent'});const usage=f.runtime.usage();await f.runtime.action(arena.id,'pause');await f.runtime.resetMetadata();assert.deepEqual(numericUsage(f.runtime.usage()),numericUsage(usage));assert.ok(!(await readFile(f.file,'utf8')).includes(f.token));
});

test('Model adapter version, project scope, disabled state and leases prevent unwanted sends',async t=>{
  const f=await fixture(t),arena=await f.create();await f.runtime.settings({enabled:true});await f.runtime.action(arena.id,'setup');
  assert.equal((await f.runtime.poll(f.token,{extensionVersion:'0.3.9'})).bootstrap,null);const first=(await f.poll()).bootstrap;assert.ok(first);assert.equal((await f.poll()).bootstrap,null);
  await f.runtime.settings({enabled:false});assert.equal((await f.runtime.bootstrapAuthorize(f.token,first)).allowed,false);await f.runtime.settings({enabled:true});f.advance(120001);await f.poll();assert.equal(f.runtime.snapshot().bootstraps[0].reason,'bootstrap_unconfirmed');assert.equal((await f.poll()).bootstrap,null);
  await f.runtime.action(arena.id,'retry');await f.setup(arena);await f.runtime.action(arena.id,'start');
  const ready=f.runtime.snapshot().arenas[0];assert.equal((await f.runtime.poll(f.token,{extensionVersion:'0.4.0',chats:ready.candidates.map(row=>row.chatId)})).command,null);
  const {command}=await f.poll();await f.runtime.settings({enabled:false});assert.equal((await f.runtime.authorize(f.token,command)).allowed,false);await f.runtime.settings({enabled:true});f.advance(90001);await f.poll();assert.equal(f.runtime.snapshot().arenas[0].reason,'send_unconfirmed');assert.equal((await f.poll()).command,null);assert.equal(f.runtime.usage().length,0);
});

test('Incomplete products, traversal and symlink evidence block instead of reaching judge',async t=>{
  for(const mode of ['missing','traversal','symlink']){
    const f=await fixture(t),arena=await f.create();await f.setup(arena);await f.runtime.action(arena.id,'start');const {command}=await f.poll(),data=await product(f,command);
    if(mode==='missing')data.report.checks=data.report.checks.filter(row=>row.name!=='run');
    if(mode==='traversal'){await writeFile(join(arena.root,'other.txt'),'not your evidence');data.report.artifacts.push('../other.txt');}
    if(mode==='symlink'){const target=join(data.candidate.root,'real');await mkdir(target);await writeFile(join(target,'proof.txt'),'proof');await symlink(target,join(data.candidate.root,'alias'),'junction');data.report.artifacts.push('alias/proof.txt');}
    const response=await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:`UMI_ARENA_PRODUCT: ${JSON.stringify(data.report)}`});assert.equal(response.blocked,true,mode);assert.match(response.reason,/arena_(?:product_incomplete|evidence_invalid)/);assert.equal(f.runtime.snapshot().arenas[0].rounds[0].decision,null);assert.equal((await f.poll()).command,null);
  }
});

test('Revisions must change own source; judges cannot omit feedback, mis-sum rubric or advance failed products',async t=>{
  const f=await fixture(t),arena=await f.create();await f.setup(arena);await f.runtime.action(arena.id,'start');
  for(let index=0;index<20;index++){const {command}=await f.poll(),data=await product(f,command);await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:data.result});}
  let {command}=await f.poll();const good=decision(f,command);
  for(const mutate of [value=>value.ranking[0].score--,value=>value.ranking[19].feedback='',value=>value.ranking[0].checks[0].status='fail',value=>value.advance.reverse()]){
    const invalid=structuredClone(good);mutate(invalid);const reply=await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:`UMI_ARENA_RESULT: ${JSON.stringify(invalid)}`});assert.equal(reply.blocked,true);assert.equal(f.runtime.snapshot().arenas[0].rounds.length,1);
    await f.runtime.action(arena.id,'retry');await f.runtime.action(arena.id,'start');command=(await f.poll()).command;
  }
  await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:`UMI_ARENA_RESULT: ${JSON.stringify(good)}`});command=(await f.poll()).command;assert.equal(command.kind,'revise');const unchanged=await product(f,command,{unchanged:true});const reply=await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:unchanged.result});assert.equal(reply.reason,'arena_revision_unchanged');assert.equal(f.runtime.snapshot().arenas[0].candidates[0].versions.length,1);
});

test('Request idempotency, duplicate bootstrap acknowledgement and cancellation retain files and usage',async t=>{
  const f=await fixture(t),requestKey=randomUUID(),arena=await f.create({requestKey});assert.equal((await f.create({requestKey})).id,arena.id);await assert.rejects(f.create({requestKey,idea:'Different idea'}),/arena_request_conflict/);
  await assert.rejects(f.create({count:50}),/invalid_arena_count/);await assert.rejects(f.create({workspaceId:'corp-project'}),/independent_arena_required/);
  await f.runtime.settings({enabled:true});await f.runtime.action(arena.id,'setup');const {bootstrap}=await f.poll(),report={...bootstrap,kind:'project',projectUrl:`https://chatgpt.com/g/g-p-${'a'.repeat(32)}/project`};await f.runtime.bootstrapReport(f.token,report);assert.deepEqual(await f.runtime.bootstrapReport(f.token,report),{ignored:true});
  await f.runtime.action(arena.id,'cancel');await f.runtime.action(arena.id,'delete');assert.equal(f.runtime.snapshot().arenas.length,0);assert.ok((await readFile(join(arena.root,'UMI-ARENA-IDEA.md'),'utf8')).includes('complete local counter'));
});

test('Project admission guard rejects Corp-owned or already assigned Projects',async t=>{
  const denied=`g-p-${'b'.repeat(32)}`,f=await fixture(t,{projectAllowed:id=>id!==denied}),arena=await f.create({name:'A'.repeat(48)});
  assert.ok(arena.name.length<=50);await f.runtime.settings({enabled:true});await f.runtime.action(arena.id,'setup');const {bootstrap}=await f.poll();
  await assert.rejects(f.runtime.bootstrapReport(f.token,{...bootstrap,kind:'project',projectUrl:`https://chatgpt.com/g/${denied}/project`}),/arena_project_conflict/);
  assert.equal(f.runtime.snapshot().arenas[0].projectId,null);assert.equal(f.runtime.snapshot().bootstraps[0].chats.length,0);
});

test('Failed state commit rolls back owned product directories without leaving staged metadata',async t=>{
  const f=await fixture(t);await rm(f.file);await mkdir(f.file);
  await assert.rejects(f.create());assert.equal(f.runtime.snapshot().arenas.length,0);assert.equal(f.runtime.snapshot().bootstraps.length,0);
  assert.deepEqual(await readdir(join(f.root,'projects')),[]);assert.ok(!(await readdir(f.root)).some(name=>name.endsWith('.tmp')));
});

test('Judge admission detects tampered historical snapshots and changed live source',async t=>{
  const f=await fixture(t),arena=await f.create();await f.setup(arena);await f.runtime.action(arena.id,'start');
  for(let index=0;index<20;index++){const {command}=await f.poll(),data=await product(f,command);await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:data.result});}
  let {command}=await f.poll();const good=decision(f,command),candidate=f.runtime.snapshot().arenas[0].candidates[0],source=candidate.versions[0].files.find(row=>row.path==='src/main.mjs'),original=await readFile(source.snapshotPath);
  await writeFile(source.snapshotPath,'tampered previous version');let reply=await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:`UMI_ARENA_RESULT: ${JSON.stringify(good)}`});assert.equal(reply.reason,'arena_history_changed');assert.equal(f.runtime.snapshot().arenas[0].rounds.length,1);
  await writeFile(source.snapshotPath,original);await f.runtime.action(arena.id,'retry');await f.runtime.action(arena.id,'start');command=(await f.poll()).command;await writeFile(join(candidate.root,'src','main.mjs'),'export const count = 999;');
  reply=await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:`UMI_ARENA_RESULT: ${JSON.stringify(good)}`});assert.equal(reply.reason,'arena_product_changed');assert.equal(f.runtime.snapshot().arenas[0].rounds.length,1);
});

test('Valid late completion after restart clears reconciliation reason while keeping Arena paused',async t=>{
  const f=await fixture(t),arena=await f.create();await f.setup(arena);await f.runtime.action(arena.id,'start');const {command}=await f.poll(),data=await product(f,command);
  await f.runtime.report(f.token,{...command,kind:'sent'});await f.restart();assert.equal(f.runtime.snapshot().arenas[0].reason,'restart_reconcile');
  await f.runtime.report(f.token,{...command,kind:'done',sent:true,result:data.result});
  const saved=f.runtime.snapshot().arenas[0];assert.equal(saved.status,'paused');assert.equal(saved.reason,null);assert.equal(saved.steps[0].status,'done');assert.equal(saved.steps[0].reason,null);assert.equal(saved.steps[1].status,'queued');assert.equal((await f.poll()).command,null,'Late completion never resumes dispatch');
  await f.runtime.action(arena.id,'start');assert.equal((await f.poll()).command.candidateId,'contestant-02');
});
