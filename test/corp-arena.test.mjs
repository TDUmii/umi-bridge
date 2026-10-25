import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createCorpRuntime} from '../scripts/corp-runtime.mjs';
import {companyRoles,arenaRubric} from '../scripts/corp-company.mjs';

const projectId='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const projectUrl=`https://chatgpt.com/g/${projectId}/project`;
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'umibridge-arena-'));
  const workspaces=[];let now=1800000000000;
  const options={projectsRoot:join(root,'projects'),clock:()=>now,workspaces:()=>structuredClone(workspaces),
    createWorkspace:async item=>{const row={...item,id:randomUUID(),kind:'project',projectId,chats:[],sync:{requested:randomUUID(),status:'pending'}};workspaces.push(row);return structuredClone(row);},
    syncProject:async input=>{const row=workspaces.find(item=>item.id===input.workspaceId);row.chats=input.chats.map(chat=>({...chat,chatId:new URL(chat.chatUrl).pathname.split('/').at(-1)}));return structuredClone(row);}};
  const file=join(root,'corp.json');let corp=await createCorpRuntime(file,options);
  const {token}=await corp.pair();
  t.after(async()=>{await corp.close();await rm(root,{recursive:true,force:true});});
  const poll=()=>corp.poll(token,{extensionVersion:'0.3.0',chats:workspaces.flatMap(project=>project.chats.map(chat=>chat.chatId)),projectChats:workspaces.flatMap(project=>project.chats.map(chat=>({chatId:chat.chatId,projectId:project.projectId})))});
  const setup=async(count=20,extra={})=>{
    await corp.settings({enabled:true});
    const input={requestKey:randomUUID(),kind:'arena',count,mode:'build',idea:'SYNTHETIC TEST ONLY - công cụ quản lý công việc',start:true,runAfterSetup:false,...extra};
    const job=await corp.arena(input),command=(await poll()).bootstrap;
    assert.equal(command.type,'bootstrap-project');
    await corp.bootstrapReport(token,{...command,kind:'project',projectUrl});
    for(const role of companyRoles){const command=(await poll()).bootstrap;assert.equal(command.roleId,role.id);assert.equal(command.projectId,projectId);await corp.bootstrapReport(token,{...command,kind:'chat',roleId:role.id,chatUrl:`https://chatgpt.com/g/${projectId}/c/chat-${role.id}`});}
    return {arena:corp.snapshot().arenas.at(-1),job,input};
  };
  return {root,file,token,workspaces,poll,setup,get corp(){return corp;},advance:ms=>now+=ms,restart:async()=>{await corp.close();corp=await createCorpRuntime(file,options);}};
}
function snapshot(f,id){return f.corp.snapshot().arenas.find(arena=>arena.id===id);}
async function productResult(f,command,outcome='pass',artifacts=['evidence.md']) {
  const run=f.corp.snapshot().runs.find(run=>run.id===command.runId);
  await writeFile(join(run.idea.root,'evidence.md'),'SYNTHETIC fixture evidence only. No real product or tool verification.\n');
  return 'UMI_CORP_RESULT: '+JSON.stringify({outcome,summary:`SYNTHETIC ${outcome}`,artifacts,checks:[{name:'Fixture check',status:outcome==='pass'?'pass':'fail',evidence:'SYNTHETIC test adapter assertion'}]});
}
function judgeResult(f,command,override={}) {
  const run=f.corp.snapshot().runs.find(run=>run.id===command.runId),arena=snapshot(f,run.arenaId),match=arena.matches.find(match=>match.id===run.arenaMatchId);
  return 'UMI_ARENA_RESULT: '+JSON.stringify({winner:match.leftId,summary:'SYNTHETIC left score wins',scores:[{candidateId:match.leftId,score:90},{candidateId:match.rightId,score:80}].map(score=>({...score,reason:'Synthetic rubric score',criteria:arenaRubric.map(item=>({id:item.id,score:item.max*score.score/100,reason:'Synthetic criterion evidence'}))})),checks:[match.leftId,match.rightId].map(candidateId=>({candidateId,name:'Fixture comparison',status:'pass',evidence:'Synthetic filesystem fixture',artifacts:['evidence.md']})),...override});
}
async function completeCommand(f,command,extra={}) {
  const run=f.corp.snapshot().runs.find(run=>run.id===command.runId);
  const result=run.arenaKind==='judge'?judgeResult(f,command):await productResult(f,command);
  await f.corp.report(f.token,{...command,kind:'done',sent:true,result,...extra});
}

for(const count of [20,50,100]) test(`Arena ${count}: new Project, eight scoped chats, full products and N-1 judged matches survive restarts`,async t=>{
  const f=await fixture(t),{arena}=await f.setup(count);
  assert.equal(f.workspaces.length,1);assert.equal(f.workspaces[0].chats.length,8);
  assert.equal(arena.status,'paused');assert.equal(arena.candidateRuns.length,count);assert.equal(f.corp.snapshot().runs.length,0);
  assert.equal(new Set(arena.candidateRuns.map(item=>item.approach)).size,count);
  assert.equal((await f.poll()).command,null);
  await f.corp.arenaAction(arena.id,'start');
  let turns=0,restartedCandidate=false,restartedBracket=false;
  while(snapshot(f,arena.id).status!=='done') {
    const {command}=await f.poll();assert.ok(command,JSON.stringify({arena:snapshot(f,arena.id).status,reason:snapshot(f,arena.id).reason,turns}));
    assert.equal((await f.corp.authorize(f.token,command)).allowed,true);
    const run=f.corp.snapshot().runs.find(run=>run.id===command.runId);
    if(run.arenaKind==='judge') {const match=snapshot(f,arena.id).matches.find(item=>item.id===run.arenaMatchId);assert.ok(command.prompt.includes(match.leftId));assert.ok(command.prompt.includes(match.rightId));}
    await completeCommand(f,command);turns++;
    if(!restartedCandidate&&turns===4){await f.restart();restartedCandidate=true;}
    if(!restartedBracket&&run.arenaKind==='judge'){await f.restart();restartedBracket=true;}
    assert.ok(turns<count*14,'bounded execution');
  }
  const done=snapshot(f,arena.id),runs=f.corp.snapshot().runs.filter(run=>run.arenaId===arena.id);
  assert.equal(turns,count*11+count-1);assert.equal(runs.length,count*2-1);
  assert.equal(runs.filter(run=>run.arenaKind==='candidate').length,count);
  assert.equal(runs.filter(run=>run.arenaKind==='judge').length,count-1);
  assert.ok(done.candidateRuns.every(candidate=>candidate.status==='done'&&candidate.artifacts.length));
  assert.ok(runs.every(run=>run.status==='done'&&run.compacted));
  assert.equal(done.matches.filter(match=>match.status==='done').length,count-1);
  assert.ok(done.matches.every(match=>['done','bye'].includes(match.status)));
  assert.equal(done.winnerId,done.candidateRuns[0].id);
  await f.restart();assert.deepEqual(snapshot(f,arena.id),done);
  assert.equal((await f.poll()).command,null);
});

test('Arena validates public input, preserves max idea, starts paused and freezes team',async t=>{
  const f=await fixture(t);
  for(const input of [{count:21,idea:'valid idea'},{count:'20',idea:'valid idea'},{count:20,idea:'x'},{count:20,idea:'x'.repeat(8001)},{count:20,idea:'valid idea',mode:'plan'},{count:20,idea:'valid idea',format:'group'},{count:20,idea:'valid idea',workspaceId:'old-project'}]) await assert.rejects(f.corp.arena({requestKey:randomUUID(),...input}),/invalid_|arena_new_project_required/);
  const {arena,input}=await f.setup(20,{idea:'x'.repeat(8000)});
  assert.equal((await f.corp.arena(input)).runId,arena.id);
  await assert.rejects(f.corp.arena({...input,count:50}),/idea_request_conflict/);
  await assert.rejects(f.corp.arena({...input,format:'group_knockout'}),/idea_request_conflict/);
  await assert.rejects(f.corp.arena({...input,mode:'plan'}),/invalid_arena_mode/);
  await f.corp.team({workspaceId:arena.workspaceId,members:companyRoles.map((role,index)=>({roleId:role.id,chatId:`chat-${companyRoles[(index+1)%8].id}`}))});
  await f.corp.arenaAction(arena.id,'start');const {command}=await f.poll();
  assert.equal(command.chatId,'chat-product');assert.ok(command.prompt.includes('x'.repeat(8000)));assert.ok(command.prompt.includes('UMI_CORP_RESULT:'));
  assert.equal(snapshot(f,arena.id).team.find(item=>item.roleId==='product').chatId,'chat-product');
  await assert.rejects(f.corp.action(command.runId,'pause'),/arena_run_owned/);
  await assert.rejects(f.corp.arenaAction(arena.id,'finish'),/invalid_arena_action/);
});

test('pause during candidate delivery and judge result never advances; resume keeps lane',async t=>{
  const f=await fixture(t),{arena}=await f.setup();await f.corp.arenaAction(arena.id,'start');
  for(let stage=0;stage<10;stage++)await completeCommand(f,(await f.poll()).command);
  let command=(await f.poll()).command;const firstRun=command.runId;
  await f.corp.arenaAction(arena.id,'pause');await completeCommand(f,command);
  assert.equal(snapshot(f,arena.id).status,'paused');assert.equal(f.corp.snapshot().runs.length,1);assert.equal((await f.poll()).command,null);
  await f.restart();await f.corp.arenaAction(arena.id,'start');command=(await f.poll()).command;assert.notEqual(command.runId,firstRun);
  await f.corp.arenaAction(arena.id,'pause');await f.restart();await f.corp.arenaAction(arena.id,'start');assert.equal(snapshot(f,arena.id).activeRunId,command.runId);
  await completeCommand(f,command);
  while(snapshot(f,arena.id).phase==='candidates')await completeCommand(f,(await f.poll()).command);
  command=(await f.poll()).command;await f.corp.arenaAction(arena.id,'pause');await completeCommand(f,command);
  assert.equal(snapshot(f,arena.id).status,'paused');assert.equal(snapshot(f,arena.id).matches.filter(match=>match.status==='done').length,1);
  assert.equal((await f.poll()).command,null);await f.restart();await f.corp.arenaAction(arena.id,'start');
  assert.notEqual((await f.poll()).command.runId,command.runId);
});

test('missing, escaped and symlink evidence blocks candidate and retry repairs same stage',async t=>{
  const f=await fixture(t),{arena}=await f.setup();await f.corp.arenaAction(arena.id,'start');
  let command=(await f.poll()).command;
  for(const artifacts of [['missing.md'],['../outside.md'],[f.file]]) {
    const result=await productResult(f,command,'pass',artifacts);await f.corp.report(f.token,{...command,kind:'done',sent:true,result});
    assert.equal(snapshot(f,arena.id).reason,'arena_evidence_invalid');assert.equal(snapshot(f,arena.id).candidateRuns[0].status,'blocked');
    assert.equal(f.corp.snapshot().runs[0].steps[0].status,'blocked');
    await f.corp.arenaAction(arena.id,'retry');assert.equal(snapshot(f,arena.id).status,'paused');await f.corp.arenaAction(arena.id,'start');command=(await f.poll()).command;
  }
  await completeCommand(f,command);assert.equal(f.corp.snapshot().runs[0].steps[0].status,'done');
});

test('repair and docs quality failures retry at failed stage without final-gate deadlock',async t=>{
  const f=await fixture(t),{arena}=await f.setup();await f.corp.arenaAction(arena.id,'start');
  for(let index=0;index<11;index++) {
    let command=(await f.poll()).command;const run=f.corp.snapshot().runs.find(run=>run.id===command.runId),step=run.steps.find(step=>step.id===command.stepId);
    if(['repair','docs'].includes(step.stage)) {
      await completeCommand(f,command,{result:await productResult(f,command,'needs_changes')});assert.equal(snapshot(f,arena.id).reason,'idea_quality_failed');
      await f.corp.arenaAction(arena.id,'retry');await f.corp.arenaAction(arena.id,'start');const retried=(await f.poll()).command;assert.equal(retried.stepId,command.stepId);command=retried;
    }
    await completeCommand(f,command);
  }
  assert.equal(snapshot(f,arena.id).candidateRuns[0].status,'done');assert.equal(snapshot(f,arena.id).candidateRuns[1].status,'running');
});

test('quota waits, unknown limits, timeouts, cancellation and missing project scope preserve Arena lane',async t=>{
  const f=await fixture(t),{arena}=await f.setup();await f.corp.arenaAction(arena.id,'start');
  let command=(await f.poll()).command;await f.corp.report(f.token,{...command,kind:'limit',notice:'in 1m',sent:true});
  assert.equal((await f.poll()).command,null);await f.restart();f.advance(75001);const resumed=(await f.poll()).command;assert.equal(resumed.runId,command.runId);assert.notEqual(resumed.attempt,command.attempt);
  await assert.rejects(f.corp.report(f.token,{...command,kind:'done',sent:true,result:'old'}),/stale_attempt/);
  await f.corp.report(f.token,{...resumed,kind:'limit',notice:'try later',sent:true});assert.equal(snapshot(f,arena.id).reason,'limit_time_unknown');
  await f.corp.arenaAction(arena.id,'retry');await f.corp.arenaAction(arena.id,'start');command=(await f.poll()).command;
  f.advance(90001);assert.equal((await f.poll()).command,null);assert.equal(snapshot(f,arena.id).reason,'send_unconfirmed');
  await f.corp.arenaAction(arena.id,'retry');await f.corp.arenaAction(arena.id,'start');command=(await f.poll()).command;
  await f.corp.report(f.token,{...command,kind:'sent'});f.advance(45*60000+1);await f.poll();assert.equal(snapshot(f,arena.id).reason,'response_timeout');
  await f.corp.arenaAction(arena.id,'retry');await f.corp.arenaAction(arena.id,'start');
  f.workspaces[0].chats.pop();await f.poll();assert.equal(snapshot(f,arena.id).reason,'chat_outside_project');
  await f.corp.arenaAction(arena.id,'cancel');assert.equal(snapshot(f,arena.id).status,'cancelled');assert.ok(snapshot(f,arena.id).candidateRuns.every(item=>item.status==='cancelled'));
  await f.corp.arenaAction(arena.id,'delete');assert.equal(f.corp.snapshot().arenas.length,0);assert.equal(f.corp.snapshot().runs.length,0);
});

test('judge rejects wrong winner, missing contestant checks, unverified evidence and unresolved ties',async t=>{
  const f=await fixture(t),{arena}=await f.setup();await f.corp.arenaAction(arena.id,'start');
  while(snapshot(f,arena.id).phase==='candidates')await completeCommand(f,(await f.poll()).command);
  let command=(await f.poll()).command;
  const valid=JSON.parse(judgeResult(f,command).split('UMI_ARENA_RESULT: ')[1]),left=valid.scores[0],right=valid.scores[1];
  for(const override of [{winner:randomUUID()},{checks:[]},{checks:[{candidateId:'outside',name:'Fake',status:'unverified',evidence:'x',artifacts:['evidence.md']}]},{scores:[]},{scores:[{...left,criteria:[]},right]},{scores:[{...left,score:95},right]},{scores:[{...left,criteria:left.criteria.map((item,index)=>index?item:{...item,score:36})},right]},{scores:[{...left,score:80,criteria:right.criteria},right]}]) {
    await completeCommand(f,command,{result:judgeResult(f,command,override)});assert.equal(snapshot(f,arena.id).reason,'arena_decision_invalid');
    const run=f.corp.snapshot().runs.find(run=>run.id===command.runId);assert.equal(run.status,'paused');assert.equal(run.steps[0].status,'blocked');
    assert.equal(snapshot(f,arena.id).matches.filter(match=>match.status==='done').length,0);
    await f.corp.arenaAction(arena.id,'retry');await f.corp.arenaAction(arena.id,'start');command=(await f.poll()).command;
  }
  await completeCommand(f,command,{result:judgeResult(f,command,{scores:[{...left,score:80,criteria:right.criteria},right],tieBreak:'Synthetic equal-score tiebreak based on observed keyboard access.'})});assert.equal(snapshot(f,arena.id).matches.filter(match=>match.status==='done').length,1);
  assert.equal(snapshot(f,arena.id).history.filter(row=>row.type==='match_completed').length,1);
});

for (const count of [20,50,100]) test(`group Arena ${count}: groups of five, standings, cross-group qualifiers, champion and complete durable history`,async t=>{
  const f=await fixture(t),{arena,input}=await f.setup(count,{format:'group_knockout'});
  assert.equal(arena.format,'group_knockout');assert.deepEqual(arena.rubric,arenaRubric);
  await assert.rejects(f.corp.arena({...input,format:'knockout'}),/idea_request_conflict/);
  // Candidate workflows are exercised above; seed completed synthetic products here to isolate tournament scheduling at all supported sizes.
  await f.corp.close();const saved=JSON.parse(await readFile(f.file,'utf8')),savedArena=saved.arenas.find(item=>item.id===arena.id);
  for(const candidate of savedArena.candidateRuns){await mkdir(candidate.root,{recursive:true});await writeFile(join(candidate.root,'evidence.md'),'SYNTHETIC tournament fixture only.');candidate.status='done';candidate.artifacts=['evidence.md'];}
  await writeFile(f.file,JSON.stringify(saved));await f.restart();await f.corp.arenaAction(arena.id,'start');
  const initial=snapshot(f,arena.id);assert.equal(initial.phase,'groups');assert.equal(initial.groups.length,count/5);
  for(const group of initial.groups){assert.equal(group.matches.length,10);assert.equal(new Set(group.matches.map(match=>[match.leftId,match.rightId].sort().join(':'))).size,10);}
  let games=0,restarted=false;
  while(snapshot(f,arena.id).status!=='done'){
    const {command}=await f.poll();assert.ok(command,`missing judge after ${games}`);
    const current=snapshot(f,arena.id),match=current.matches.find(match=>match.judgeRunId===command.runId);
    if(count===20&&match.groupId===current.groups[0].id){
      // Five-way circular tie: each candidate wins twice with identical score totals, then seed breaks the tie.
      const ids=current.groups[0].candidateIds,winner=ids.indexOf(match.rightId)-ids.indexOf(match.leftId)<=2?match.leftId:match.rightId;
      const scores=[match.leftId,match.rightId].map(candidateId=>({candidateId,score:candidateId===winner?90:80,reason:'Synthetic circular group tie',criteria:arenaRubric.map(item=>({id:item.id,score:item.max*(candidateId===winner?0.9:0.8),reason:'Synthetic criterion'}))}));
      await completeCommand(f,command,{result:judgeResult(f,command,{winner,scores})});
    }else await completeCommand(f,command);
    games++;
    if(games===3){await f.restart();restarted=true;}
    assert.ok(games<=count*2+count/5*2-1,'bounded group and knockout scheduling');
  }
  const done=snapshot(f,arena.id);assert.equal(restarted,true);assert.equal(games,count*2+count/5*2-1);
  assert.equal(done.groups.flatMap(group=>group.matches).filter(match=>match.status==='done').length,count*2);
  for(const group of done.groups){
    assert.equal(group.status,'done');assert.deepEqual(group.qualifiedIds,group.candidateIds.slice(0,2));
    assert.deepEqual(group.standings.map(row=>row.points),count===20&&group.id===done.groups[0].id?[6,6,6,6,6]:[12,9,6,3,0]);assert.ok(group.standings.every(row=>row.played===4));assert.equal(group.standings.filter(row=>row.qualified).length,2);assert.match(group.tieBreak,/hạt giống/);
  }
  assert.equal(done.qualifiedIds.length,count/5*2);
  for(const match of done.rounds[0].matches.filter(match=>match.rightId))assert.notEqual(done.groups.find(group=>group.candidateIds.includes(match.leftId)).id,done.groups.find(group=>group.candidateIds.includes(match.rightId)).id);
  assert.equal(done.rounds.at(-1).outputIds.length,1);assert.equal(done.winnerId,done.candidateRuns[0].id);assert.equal(done.completedAt,done.completion);
  const history=done.history.filter(row=>row.type==='match_completed');assert.equal(history.length,games);assert.equal(new Set(history.map(row=>row.matchId)).size,games);assert.ok(history.every(row=>row.decision.scores.every(score=>score.criteria.length===5)));
  assert.ok(f.corp.snapshot().events.length<=200);if(count===100)assert.ok(history.length>200);
  await f.restart();assert.deepEqual(snapshot(f,arena.id),done);assert.equal((await f.poll()).command,null);
});

test('legacy knockout decisions migrate to durable history without inventing timestamps or rubric scores',async t=>{
  const f=await fixture(t),{arena}=await f.setup();await f.corp.close();
  const saved=JSON.parse(await readFile(f.file,'utf8')),legacy=saved.arenas[0],leftId=legacy.candidateRuns[0].id,rightId=legacy.candidateRuns[1].id;
  delete legacy.format;delete legacy.groups;delete legacy.history;delete legacy.rubricVersion;delete legacy.rubric;
  const decision={winner:leftId,summary:'Synthetic legacy saved decision',scores:[{candidateId:leftId,score:90,reason:'Legacy total only'},{candidateId:rightId,score:80,reason:'Legacy total only'}],checks:[]};
  legacy.rounds=[{number:1,inputIds:[leftId,rightId],outputIds:[leftId],matches:[{id:randomUUID(),leftId,rightId,status:'done',winnerId:leftId,decision}]}];
  await writeFile(f.file,JSON.stringify(saved));await f.restart();const migrated=snapshot(f,arena.id),history=migrated.history[0];
  assert.equal(migrated.format,'knockout');assert.equal(history.type,'match_completed');assert.equal(history.recovered,true);assert.equal(history.at,null);assert.equal(history.round,1);assert.deepEqual(history.decision,decision);
  assert.deepEqual(JSON.parse(await readFile(f.file,'utf8')).arenas[0].history,migrated.history);
  await f.restart();assert.deepEqual(snapshot(f,arena.id),migrated);
});
