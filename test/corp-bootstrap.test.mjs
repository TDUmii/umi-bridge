import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile,realpath,readdir,symlink,unlink,rmdir,open} from 'node:fs/promises';
import {join,relative} from 'node:path';
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

test('bootstrap creates only selected specialist chats and pins their standards into the workflow',async t=>{
  const f=await fixture(t),{token}=await f.corp.pair();await f.corp.settings({enabled:true});
  const input={requestKey:randomUUID(),idea:'Ứng dụng giáo dục kiểm thử',reviewTeams:['accessibility','education-test'],productProfile:'education',productGoal:'Lớp 3 tự học',start:true};
  const job=await f.corp.bootstrap(input),command=(await f.poll(token)).bootstrap;
  await f.corp.bootstrapReport(token,{...command,kind:'project',projectUrl});
  for(const roleId of [...companyRoles.map(role=>role.id),'accessibility','education-test']){
    const phase=(await f.poll(token)).bootstrap;assert.equal(phase.roleId,roleId);await f.corp.bootstrapReport(token,{...phase,kind:'chat',roleId,chatUrl:`https://chatgpt.com/g/${projectId}/c/${roleId}`});
  }
  const saved=f.corp.snapshot().bootstraps.find(row=>row.id===job.id),run=f.corp.snapshot().runs.find(row=>row.id===saved.runId);
  assert.equal(saved.chats.length,10);assert.equal(saved.status,'done');assert.equal(run.steps.length,15);assert.equal(run.idea.productGoal,input.productGoal);assert.ok(!saved.chats.some(row=>row.roleId==='game-test'));
  await f.restart();assert.equal((await f.corp.bootstrap(input)).id,job.id);await assert.rejects(f.corp.bootstrap({...input,reviewTeams:[]}),/idea_request_conflict/);
});
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
  const parentRoot=join(f.root,'selected idea parent');await mkdir(parentRoot);
  const input={requestKey:randomUUID(),idea:'Một trang quản lý bài tập',customerName:'Khách trường học',parentRoot,start:true};const job=await f.corp.bootstrap(input);
  assert.equal(job.parentRoot,await realpath(parentRoot));assert.equal(relative(job.parentRoot,job.root).includes('..'),false);
  const command=(await f.poll(token)).bootstrap;
  await assert.rejects(f.corp.bootstrapReport(token,{...command,kind:'project',projectUrl:'https://example.com/project'}),/invalid_project_url/);
  await f.corp.bootstrapReport(token,{...command,kind:'project',projectUrl});assert.equal(f.workspaces.length,1);
  assert.equal(f.workspaces[0].root,job.root);
  for(const role of companyRoles){
    const phase=(await f.poll(token)).bootstrap;assert.equal(phase.type,'bootstrap-chat');assert.equal(phase.roleId,role.id);
    assert.equal(phase.projectId,projectId);assert.match(phase.seed,/UmiBridge setup/);
    await assert.rejects(f.corp.bootstrapReport(token,{...phase,kind:'chat',roleId:role.id,chatUrl:'https://chatgpt.com/c/outside'}),/chat_outside_project/);
    await f.corp.bootstrapReport(token,{...phase,kind:'chat',roleId:role.id,chatUrl:`https://chatgpt.com/g/${projectId}/c/new-${role.id}`});
  }
  const state=f.corp.snapshot();assert.equal(state.bootstraps[0].status,'done');assert.equal(state.bootstraps[0].chats.length,8);
  assert.equal(state.runs.length,1);assert.equal(state.runs[0].customerName,'Khách trường học');assert.equal(state.runs[0].status,'running');assert.equal(state.runs[0].steps.length,11);assert.equal(state.teams[0].members.length,8);
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
  const parentRoot=join(f.root,'selected arena parent');await mkdir(parentRoot);
  const input={requestKey:randomUUID(),kind:'arena',count:20,mode:'build',idea:'Một ứng dụng học tập có nhiều phương án cạnh tranh',parentRoot,start:true,runAfterSetup:false};
  const job=await f.corp.bootstrap(input);
  await f.corp.bootstrapReport(token,{...(await f.poll(token)).bootstrap,kind:'project',projectUrl});
  for(const role of companyRoles){const phase=(await f.poll(token)).bootstrap;await f.corp.bootstrapReport(token,{...phase,kind:'chat',roleId:role.id,chatUrl:`https://chatgpt.com/g/${projectId}/c/arena-${role.id}`});}
  const state=f.corp.snapshot(),arena=state.arenas[0];
  assert.equal(state.bootstraps[0].id,job.id);assert.equal(state.bootstraps[0].kind,'arena');assert.equal(state.bootstraps[0].status,'done');
  assert.equal(f.workspaces.length,1);assert.equal(f.workspaces[0].chats.length,8);assert.equal(state.teams[0].members.length,8);
  assert.equal(state.arenas.length,1);assert.equal(arena.count,20);assert.equal(arena.status,'paused');assert.equal(state.runs.filter(run=>run.arenaId===arena.id).length,0,'candidate workflows are created lazily after explicit Arena start');
  assert.equal(job.parentRoot,await realpath(parentRoot));assert.equal(f.workspaces[0].root,job.root);
  assert.ok(relative(job.root,arena.root).startsWith('.umibridge-arenas'));
  assert.ok(arena.candidateRuns.every(candidate=>relative(arena.root,candidate.root).startsWith('candidate-')));
  await f.restart();assert.equal((await f.corp.bootstrap(input)).root,job.root);assert.equal(f.corp.snapshot().arenas[0].root,arena.root);
});

test('older saved idea bootstraps without kind/count keep idempotent request identity',async t=>{
  const f=await fixture(t);await f.corp.pair();
  const input={requestKey:randomUUID(),idea:'Older saved idea workflow',mode:'plan'};
  const job=await f.corp.bootstrap(input);await f.corp.close();
  const state=JSON.parse(await readFile(f.path,'utf8'));delete state.bootstraps[0].kind;delete state.bootstraps[0].count;delete state.bootstraps[0].parentRoot;
  await writeFile(f.path,JSON.stringify(state));await f.restart();
  assert.equal((await f.corp.bootstrap(input)).id,job.id);
  assert.equal(f.corp.snapshot().bootstraps.length,1);
  await assert.rejects(f.corp.bootstrap({...input,kind:'arena',count:20,mode:'build'}),/idea_request_conflict/);
});

test('selected parent is canonical, idempotent after restart, and conflicts cannot redirect an existing request',async t=>{
  const f=await fixture(t);await f.corp.pair();
  const selected=join(f.root,'selected'),other=join(f.root,'other'),alias=join(f.root,'alias');await mkdir(selected);await mkdir(other);
  await symlink(selected,alias,process.platform==='win32'?'junction':'dir');
  const input={requestKey:randomUUID(),name:'Selected project',idea:'Create selected project',parentRoot:alias};
  const job=await f.corp.bootstrap(input);
  assert.equal(job.parentRoot,await realpath(selected));assert.equal(relative(job.parentRoot,job.root),`selected-project-${input.requestKey}`);
  assert.deepEqual(await readdir(selected),[`selected-project-${input.requestKey}`]);
  await f.restart();assert.deepEqual(await f.corp.bootstrap({...input,parentRoot:selected}),job);
  await assert.rejects(f.corp.bootstrap({...input,parentRoot:other}),/idea_request_conflict/);
  await assert.rejects(f.corp.bootstrap({...input,parentRoot:''}),/parent_folder_unavailable|idea_request_conflict/);
  assert.deepEqual(await readdir(other),[]);assert.equal(f.corp.snapshot().bootstraps.length,1);
});

test('explicit configured default parent is created on first use while missing custom parents remain invalid',async t=>{
  const f=await fixture(t);await f.corp.pair();
  const parentRoot=f.corp.snapshot().projectsRoot;
  const job=await f.corp.bootstrap({requestKey:randomUUID(),idea:'Create first explicit default project',parentRoot:join(parentRoot,'.')});
  assert.equal(job.parentRoot,await realpath(parentRoot));assert.ok(relative(job.parentRoot,job.root));
  await assert.rejects(f.corp.bootstrap({requestKey:randomUUID(),idea:'Missing custom parent remains invalid',parentRoot:join(f.root,'missing custom')}),/parent_folder_unavailable/);
});

for(const method of ['arena','createArena'])test(`Arena creation alias ${method} preserves rollback, chosen parent and same-key retry`,async t=>{
  const f=await fixture(t);await f.corp.pair();
  const parentRoot=join(f.root,'selected arena parent');await mkdir(parentRoot);
  const input={requestKey:randomUUID(),idea:'Arena alias rollback check',count:20,parentRoot};
  const saved=await readFile(f.path,'utf8');await unlink(f.path);await mkdir(f.path);
  await assert.rejects(f.corp[method](input));assert.deepEqual(await readdir(parentRoot),[]);
  await rmdir(f.path);await writeFile(f.path,saved);
  const job=await f.corp[method](input);assert.equal(job.kind,'arena');assert.equal(job.parentRoot,await realpath(parentRoot));assert.equal(job.status,'paused');
  assert.equal((await f.corp[method](input)).id,job.id);
});

test('handled state-save failure cleans only its newly created bootstrap files and same-key retry succeeds',async t=>{
  const f=await fixture(t);await f.corp.pair();
  const saved=await readFile(f.path,'utf8');await unlink(f.path);await mkdir(f.path);
  const input={requestKey:randomUUID(),name:'Save failure',idea:'Retry after state save failure'};
  const parentRoot=f.corp.snapshot().projectsRoot;
  await assert.rejects(f.corp.bootstrap(input));
  assert.deepEqual(await readdir(parentRoot),[]);assert.equal(f.corp.snapshot().bootstraps.length,0);
  await rmdir(f.path);await writeFile(f.path,saved);
  const job=await f.corp.bootstrap(input);assert.match(await readFile(join(job.root,'UMI-IDEA.md'),'utf8'),/Retry after state save failure/);
  assert.equal((await f.corp.bootstrap(input)).id,job.id);
});

test('handled partial idea-file write failure removes its own partial file and allows same-key retry',async t=>{
  const f=await fixture(t);await f.corp.pair();
  const probePath=join(f.root,'handle-probe'),probe=await open(probePath,'wx'),prototype=Object.getPrototypeOf(probe);
  await probe.close();await unlink(probePath);
  const original=prototype.writeFile;
  const fault=t.mock.method(prototype,'writeFile',async function(contents,...options){
    if(String(contents).includes('Faulted partial idea write')){await original.call(this,'partial file');throw Error('injected_idea_write_failure');}
    return original.call(this,contents,...options);
  });
  const input={requestKey:randomUUID(),name:'Write failure',idea:'Faulted partial idea write'};
  await assert.rejects(f.corp.bootstrap(input),/injected_idea_write_failure/);
  assert.deepEqual(await readdir(f.corp.snapshot().projectsRoot),[]);assert.equal(f.corp.snapshot().bootstraps.length,0);
  fault.mock.restore();
  const job=await f.corp.bootstrap(input);assert.match(await readFile(join(job.root,'UMI-IDEA.md'),'utf8'),/Faulted partial idea write/);
});

test('rollback preserves other files added to its new directory and leaves collision guard intact',async t=>{
  const f=await fixture(t);await f.corp.pair();
  const input={requestKey:randomUUID(),name:'Preserved folder',idea:'Preserve external file during rollback'};
  const target=join(f.corp.snapshot().projectsRoot,`preserved-folder-${input.requestKey}`),probe=await open(join(f.root,'handle-probe'),'wx');
  const prototype=Object.getPrototypeOf(probe),original=prototype.writeFile;await probe.close();
  const fault=t.mock.method(prototype,'writeFile',async function(contents,...options){
    await original.call(this,contents,...options);
    if(String(contents).includes(input.idea)){await writeFile(join(target,'keep.txt'),'unrelated data');throw Error('injected_idea_write_failure');}
  });
  await assert.rejects(f.corp.bootstrap(input),/injected_idea_write_failure/);fault.mock.restore();
  assert.deepEqual(await readdir(target),['keep.txt']);assert.equal(await readFile(join(target,'keep.txt'),'utf8'),'unrelated data');
  await assert.rejects(f.corp.bootstrap(input),/project_folder_exists/);
});

test('invalid or unavailable parent paths do not create projects or touch existing data',async t=>{
  const f=await fixture(t);await f.corp.pair();const input={requestKey:randomUUID(),idea:'Invalid path request'};
  const invalid=[null,7,{},'relative/folder','folder\nname',join(f.root,'bad\u0000path'),'\\\\?\\C:\\Unsafe','\\\\.\\C:\\Unsafe',...(process.platform==='win32'?['C:relative','\\root-relative','C:\\CON','C:\\safe\\LPT1.txt','C:\\safe\\bad:name','C:\\safe\\trailing.','C:\\safe\\bad?name']:['C:\\Windows\\path'])];
  for(const parentRoot of invalid)await assert.rejects(f.corp.bootstrap({...input,parentRoot}),/invalid_parent_root/);
  const file=join(f.root,'regular-file');await writeFile(file,'keep');
  for(const parentRoot of [join(f.root,'missing'),file])await assert.rejects(f.corp.bootstrap({...input,parentRoot}),/parent_folder_unavailable/);
  const parentRoot=join(f.root,'collision-parent');await mkdir(parentRoot);
  const target=join(parentRoot,`existing-${input.requestKey}`);await mkdir(target);await writeFile(join(target,'UMI-IDEA.md'),'keep old project');
  await assert.rejects(f.corp.bootstrap({...input,name:'Existing',parentRoot}),/project_folder_exists/);
  assert.equal(await readFile(join(target,'UMI-IDEA.md'),'utf8'),'keep old project');assert.equal(await readFile(file,'utf8'),'keep');
  assert.equal(f.corp.snapshot().bootstraps.length,0);
});
