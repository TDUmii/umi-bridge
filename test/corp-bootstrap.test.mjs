import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createCorpRuntime} from '../scripts/corp-runtime.mjs';
import {companyRoles} from '../scripts/corp-company.mjs';

const projectId='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',projectUrl=`https://chatgpt.com/g/${projectId}/project`;
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'umibridge-bootstrap-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let now=Date.now();const workspaces=[];
  const options={projectsRoot:join(root,'projects'),clock:()=>now,workspaces:()=>structuredClone(workspaces),
    createWorkspace:async item=>{const row={...item,id:'created-project',kind:'project',projectId,chats:[],sync:{requested:'sync-key',status:'pending'}};workspaces.push(row);return structuredClone(row);},
    syncProject:async input=>{const row=workspaces.find(row=>row.id===input.workspaceId);assert.equal(input.requested,row.sync.requested);row.chats=input.chats.map(chat=>({...chat,chatId:new URL(chat.chatUrl).pathname.split('/').at(-1)}));return structuredClone(row);}};
  const path=join(root,'corp.json');let corp=await createCorpRuntime(path,options);t.after(()=>corp.close());
  return {get corp(){return corp;},root,path,workspaces,poll:token=>corp.poll(token,{extensionVersion:'0.3.0'}),advance:ms=>now+=ms,restart:async()=>{await corp.close();corp=await createCorpRuntime(path,options);}};
}
test('new-project setup needs pairing, respects dispatch off, persists the idea locally, and never reissues an uncertain creation',async t=>{
  const f=await fixture(t),input={requestKey:randomUUID(),idea:'Ứng dụng sổ tay học tập với lịch học, nhắc nhở và quản lý bài tập cho học sinh',start:true};
  await assert.rejects(f.corp.bootstrap(input),/pair_corp_first/);
  const {token}=await f.corp.pair();const job=await f.corp.bootstrap(input);
  assert.equal(job.status,'paused');assert.match(await readFile(join(job.root,'UMI-IDEA.md'),'utf8'),/sổ tay học tập/);
  assert.ok(job.name.length<=50,'generated names fit the ChatGPT Project name limit');
  assert.equal((await f.corp.bootstrap(input)).id,job.id);assert.equal(f.corp.snapshot().bootstraps.length,1);
  assert.equal((await f.poll(token)).bootstrap,null);
  await f.corp.settings({enabled:true});await f.corp.bootstrapAction(job.id,'start');
  assert.equal((await f.corp.poll(token,{extensionVersion:'0.2.2'})).bootstrap,null,'older adapters cannot claim setup commands');
  const command=(await f.poll(token)).bootstrap;assert.equal(command.type,'bootstrap-project');
  assert.equal((await f.corp.bootstrapAuthorize(token,command)).allowed,true);
  assert.equal((await f.poll(token)).bootstrap,null,'issued creation is not sent again on a poll');
  f.advance(120001);await f.poll(token);
  assert.equal(f.corp.snapshot().bootstraps[0].status,'blocked');assert.equal((await f.corp.bootstrapAuthorize(token,command)).allowed,false);
  await f.restart();assert.equal((await f.poll(token)).bootstrap,null,'restart preserves uncertain state instead of creating a duplicate Project');
});
test('confirmed Project plus eight scoped chats produces one assigned idea workflow and remains idempotent after restart',async t=>{
  const f=await fixture(t),{token}=await f.corp.pair();await f.corp.settings({enabled:true});
  const input={requestKey:randomUUID(),idea:'Một trang quản lý bài tập',start:true};const job=await f.corp.bootstrap(input);
  const command=(await f.poll(token)).bootstrap;
  await assert.rejects(f.corp.bootstrapReport(token,{...command,kind:'project',projectUrl:'https://example.com/project'}),/invalid_project_url/);
  await f.corp.bootstrapReport(token,{...command,kind:'project',projectUrl});assert.equal(f.workspaces.length,1);
  for(const role of companyRoles){
    const phase=(await f.poll(token)).bootstrap;assert.equal(phase.type,'bootstrap-chat');assert.equal(phase.roleId,role.id);
    assert.equal(phase.projectId,projectId);assert.match(phase.seed,/UmiBridge setup/);
    await assert.rejects(f.corp.bootstrapReport(token,{...phase,kind:'chat',roleId:role.id,chatUrl:'https://chatgpt.com/c/outside'}),/chat_outside_project/);
    await f.corp.bootstrapReport(token,{...phase,kind:'chat',roleId:role.id,chatUrl:`https://chatgpt.com/g/${projectId}/c/new-${role.id}`});
  }
  const state=f.corp.snapshot();assert.equal(state.bootstraps[0].status,'done');assert.equal(state.bootstraps[0].chats.length,8);
  assert.equal(state.runs.length,1);assert.equal(state.runs[0].status,'running');assert.equal(state.runs[0].steps.length,11);assert.equal(state.teams[0].members.length,8);
  assert.equal(f.workspaces[0].chats.length,8);await f.restart();assert.equal((await f.corp.bootstrap(input)).runId,state.runs[0].id);
  assert.equal(f.corp.snapshot().runs.length,1);assert.equal((await f.poll(token)).bootstrap,null);
  assert.equal(state.bootstraps[0].id,job.id);
});
test('pausing during the last confirmed chat cannot auto-start the created workflow',async t=>{
  const f=await fixture(t),{token}=await f.corp.pair();await f.corp.settings({enabled:true});
  const job=await f.corp.bootstrap({requestKey:randomUUID(),idea:'Một công cụ ghi chú đơn giản',start:true});
  await f.corp.bootstrapReport(token,{...(await f.poll(token)).bootstrap,kind:'project',projectUrl});
  for(const [index,role]of companyRoles.entries()){
    const phase=(await f.poll(token)).bootstrap;
    if(index===7)await f.corp.bootstrapAction(job.id,'pause');
    await f.corp.bootstrapReport(token,{...phase,kind:'chat',roleId:role.id,chatUrl:`https://chatgpt.com/g/${projectId}/c/paused-${role.id}`});
  }
  assert.equal(f.corp.snapshot().runs[0].status,'paused');assert.equal((await f.poll(token)).command,null);
});

test('arena bootstrap creates one Project with eight chats and keeps its bracket paused',async t=>{
  const f=await fixture(t),{token}=await f.corp.pair();await f.corp.settings({enabled:true});
  const job=await f.corp.bootstrap({requestKey:randomUUID(),kind:'arena',count:20,mode:'build',idea:'Một ứng dụng học tập có nhiều phương án cạnh tranh',start:true,runAfterSetup:false});
  await f.corp.bootstrapReport(token,{...(await f.poll(token)).bootstrap,kind:'project',projectUrl});
  for(const role of companyRoles){const phase=(await f.poll(token)).bootstrap;await f.corp.bootstrapReport(token,{...phase,kind:'chat',roleId:role.id,chatUrl:`https://chatgpt.com/g/${projectId}/c/arena-${role.id}`});}
  const state=f.corp.snapshot(),arena=state.arenas[0];
  assert.equal(state.bootstraps[0].id,job.id);assert.equal(state.bootstraps[0].kind,'arena');assert.equal(state.bootstraps[0].status,'done');
  assert.equal(f.workspaces.length,1);assert.equal(f.workspaces[0].chats.length,8);assert.equal(state.teams[0].members.length,8);
  assert.equal(state.arenas.length,1);assert.equal(arena.count,20);assert.equal(arena.status,'paused');assert.equal(state.runs.filter(run=>run.arenaId===arena.id).length,0,'candidate workflows are created lazily after explicit Arena start');
});

test('older saved idea bootstraps without kind/count keep idempotent request identity',async t=>{
  const f=await fixture(t);await f.corp.pair();
  const input={requestKey:randomUUID(),idea:'Older saved idea workflow',mode:'plan'};
  const job=await f.corp.bootstrap(input);await f.corp.close();
  const state=JSON.parse(await readFile(f.path,'utf8'));delete state.bootstraps[0].kind;delete state.bootstraps[0].count;
  await writeFile(f.path,JSON.stringify(state));await f.restart();
  assert.equal((await f.corp.bootstrap(input)).id,job.id);
  assert.equal(f.corp.snapshot().bootstraps.length,1);
  await assert.rejects(f.corp.bootstrap({...input,kind:'arena',count:20,mode:'build'}),/idea_request_conflict/);
});
