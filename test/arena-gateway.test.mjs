import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {startGateway} from '../scripts/local-web-gateway.mjs';

test('Arena HTTP API has local/CSRF guards, shared pairing and independent Project/state/dispatch',async t=>{
  const root=await mkdtemp(join(tmpdir(),'umibridge-arena-http-'));
  const gateway=await startGateway({port:0,publicUrl:'https://arena-test.example',connectionSecret:randomBytes(32).toString('base64url'),configDir:join(root,'profile'),corpProjectsRoot:join(root,'projects')});
  t.after(async()=>{await gateway.close();await rm(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${gateway.port}`;
  const request=(path,body,headers={})=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'x-local-admin':'1',...(body===undefined?{}:{'content-type':'application/json','x-dc-admin-action':'1'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=async(path,body,headers)=>{const response=await request(path,body,headers);assert.equal(response.status,200,`${path}: ${response.status} ${response.status===200?'':await response.text()}`);return response.json();};
  assert.equal((await fetch(base+'/admin/api/arena')).status,404);
  for(const path of ['/admin/api/arena/settings','/admin/api/arena/arenas','/admin/api/arena/arenas/unknown/setup','/admin/api/arena/arenas/unknown/start']){
    assert.equal((await request(path,{}, {'x-dc-admin-action':'0'})).status,403,path+' requires write header');
    assert.equal((await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404,path+' is local only');
  }
  for(const action of ['poll','report','authorize','bootstrap-authorize','bootstrap-report'])assert.equal((await request('/admin/arena/bridge/'+action,{})).status,401,action+' requires shared paired token');
  const before=await json('/admin/api/arena');assert.equal(before.enabled,false);assert.equal(before.paired,false);
  const {token}=await json('/admin/api/corp/pair',{}),bridgeHeaders={authorization:'Bearer '+token};
  assert.equal((await json('/admin/api/arena')).paired,true);assert.equal((await json('/admin/api/arena')).enabled,false);assert.ok(!(await (await request('/admin/api/arena')).text()).includes(token));
  assert.equal((await request('/admin/api/corp/arenas',{})).status,410,'Legacy Corp Arena creation points to independent Arena');
  assert.equal((await request('/admin/api/corp/projects',{kind:'arena',requestKey:randomUUID(),idea:'Legacy Arena must not create Corp project',count:20,parentRoot:root})).status,400);
  const corpProjectId=`g-p-${'a'.repeat(32)}`,projectId=`g-p-${'b'.repeat(32)}`;
  await json('/admin/api/workspaces',{name:'Existing Corp Project',root,chatUrl:`https://chatgpt.com/g/${corpProjectId}/project`});
  const registeredBefore=(await json('/admin/api/chats')).workspaces;
  const arena=await json('/admin/api/arena/arenas',{requestKey:randomUUID(),name:'Independent HTTP products',idea:'Build a complete local counter with working source and tests.',parentRoot:root,count:20});
  assert.equal(arena.candidates.length,20);assert.equal(arena.status,'setup');assert.deepEqual((await json('/admin/api/chats')).workspaces,registeredBefore,'Creating Arena must not register Corp workspace');
  assert.equal((await request('/admin/api/arena/arenas/'+arena.id+'/setup',{})).status,400,'Arena needs its own enabled switch');
  await json('/admin/api/arena/settings',{enabled:true});assert.equal((await json('/admin/api/corp')).enabled,false);
  await json('/admin/api/corp/settings',{enabled:true});await json('/admin/api/arena/settings',{enabled:false});assert.equal((await json('/admin/api/corp')).enabled,true);
  await json('/admin/api/arena/settings',{enabled:true});await json('/admin/api/corp/settings',{enabled:false});assert.equal((await json('/admin/api/arena')).enabled,true);
  await json('/admin/api/arena/arenas/'+arena.id+'/setup',{});
  assert.equal((await json('/admin/arena/bridge/poll',{extensionVersion:'0.3.9'},bridgeHeaders)).bootstrap,null);
  const first=(await json('/admin/arena/bridge/poll',{extensionVersion:'0.4.0'},bridgeHeaders)).bootstrap;assert.equal(first.type,'bootstrap-project');assert.equal(first.channel,'arena');
  assert.equal((await json('/admin/arena/bridge/bootstrap-authorize',first,bridgeHeaders)).allowed,true);assert.equal((await json('/admin/arena/bridge/poll',{extensionVersion:'0.4.0'},bridgeHeaders)).bootstrap,null);
  assert.equal((await request('/admin/arena/bridge/bootstrap-report',{...first,kind:'project',projectUrl:`https://chatgpt.com/g/${corpProjectId}/project`},bridgeHeaders)).status,400,'Arena cannot reuse Corp Project');
  await json('/admin/arena/bridge/bootstrap-report',{...first,kind:'project',projectUrl:`https://chatgpt.com/g/${projectId}/project`},bridgeHeaders);
  for(const chatUrl of [`https://chatgpt.com/g/${projectId}/project`,`https://chatgpt.com/g/${projectId}/c/arena-chat-manual`]){
    const reserved=await request('/admin/api/workspaces',{name:'Cannot share Arena Project',root,chatUrl});assert.equal(reserved.status,400);assert.equal((await reserved.json()).error,'arena_project_reserved');
  }
  assert.deepEqual((await json('/admin/api/chats')).workspaces,registeredBefore,'Arena Project cannot be registered through reverse Corp path');
  const chats=[];
  for(let index=0;index<21;index++){
    const phase=(await json('/admin/arena/bridge/poll',{extensionVersion:'0.4.0'},bridgeHeaders)).bootstrap,roleId=index===20?'judge':`contestant-${String(index+1).padStart(2,'0')}`;
    assert.equal(phase.roleId,roleId);assert.equal(phase.projectId,projectId);assert.match(phase.seed,/UmiBridge arena setup/);
    await json('/admin/arena/bridge/bootstrap-report',{...phase,kind:'chat',roleId,chatUrl:`https://chatgpt.com/g/${projectId}/c/http-${roleId}`},bridgeHeaders);chats.push(`http-${roleId}`);
  }
  const ready=(await json('/admin/api/arena')).arenas[0];assert.equal(ready.status,'paused');assert.equal(ready.judge.chatId,'http-judge');assert.equal(ready.steps.length,20);assert.equal((await json('/admin/api/corp')).runs.length,0);assert.equal((await json('/admin/api/corp')).teams.length,0);assert.deepEqual((await json('/admin/api/chats')).workspaces,registeredBefore,'Completed Arena bootstrap must not mutate Corp registration');
  const pollInput={extensionVersion:'0.4.0',chats,projectChats:chats.map(chatId=>({chatId,projectId}))};
  assert.equal((await json('/admin/arena/bridge/poll',pollInput,bridgeHeaders)).command,null,'Setup completion never starts product work');
  await json('/admin/api/arena/arenas/'+arena.id+'/start',{});
  assert.equal((await json('/admin/arena/bridge/poll',{...pollInput,extensionVersion:'0.3.9'},bridgeHeaders)).command,null);
  assert.equal((await json('/admin/arena/bridge/poll',{...pollInput,projectChats:[]},bridgeHeaders)).command,null,'Project ownership attestation required');
  const {command}=await json('/admin/arena/bridge/poll',pollInput,bridgeHeaders);assert.equal(command.kind,'build');assert.equal(command.chatId,'http-contestant-01');assert.equal((await json('/admin/arena/bridge/authorize',command,bridgeHeaders)).allowed,true);
  await json('/admin/arena/bridge/report',{...command,kind:'sent'},bridgeHeaders);
  await json('/admin/api/arena/arenas/'+arena.id+'/pause',{});assert.equal((await json('/admin/arena/bridge/authorize',command,bridgeHeaders)).allowed,false);
  const candidate=ready.candidates[0];await mkdir(join(candidate.root,'src'));await writeFile(join(candidate.root,'src','main.mjs'),'export const count = 1;\n');await writeFile(join(candidate.root,'README.md'),'Build: node --check src/main.mjs. Test: node test.mjs. Run: node src/main.mjs.');await writeFile(join(candidate.root,'evidence.txt'),'HTTP fixture build/test/run evidence.');
  const product={status:'complete',summary:'HTTP fixture product',source:['src/main.mjs'],readme:'README.md',artifacts:['src/main.mjs','README.md','evidence.txt'],checks:['build','test','run'].map(name=>({name,status:'pass',command:`node ${name}.mjs`,evidence:'Fixture check passed',artifacts:['evidence.txt']}))};
  await json('/admin/arena/bridge/report',{...command,kind:'done',sent:true,result:`UMI_ARENA_PRODUCT: ${JSON.stringify(product)}`},bridgeHeaders);
  const finished=(await json('/admin/api/arena')).arenas[0];assert.equal(finished.steps[0].status,'done');assert.equal(finished.status,'paused');assert.equal((await json('/admin/arena/bridge/poll',pollInput,bridgeHeaders)).command,null);
  const usage=await json('/admin/api/usage?period=all');assert.equal(usage.totals.requests,1);assert.equal(usage.rows[0].application,'ChatGPT Arena');assert.ok(usage.totals.inputTokens>0);assert.ok(usage.totals.outputTokens>0);assert.equal(usage.rows[0].model,null,'Prompt request does not prove actual provider model');
  const arenaUsage=await json('/admin/api/usage?period=all&source=arena');assert.equal(arenaUsage.totals.requests,1);assert.equal(arenaUsage.rows[0].source,'arena');assert.equal((await json('/admin/api/usage?period=all&source=corp')).totals.requests,0);
  assert.equal(JSON.parse(await readFile(join(root,'arena-state.json'),'utf8')).arenas[0].id,arena.id);
  await json('/admin/api/corp/revoke',{});assert.equal((await request('/admin/arena/bridge/poll',pollInput,bridgeHeaders)).status,401);assert.equal((await json('/admin/api/arena')).paired,false);
});
