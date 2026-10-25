import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { startGateway } from '../scripts/local-web-gateway.mjs';

test('Corp local API protects writes and browser credentials; dispatch is controlled and assets are local',async t=>{
  const root=await mkdtemp(join(tmpdir(),'umibridge-corp-http-'));
  const gateway=await startGateway({port:0,publicUrl:'https://corp-test.example',connectionSecret:randomBytes(32).toString('base64url'),configDir:join(root,'profile')});
  t.after(async()=>{await gateway.close();await rm(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${gateway.port}`;
  const request=(path,body,headers={})=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'x-local-admin':'1',...(body===undefined?{}:{'content-type':'application/json','x-dc-admin-action':'1'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal((await fetch(base+'/',{redirect:'manual'})).status,404,'Public root must not expose the dashboard redirect');
  const home=await fetch(base+'/',{headers:{'x-local-admin':'1'},redirect:'manual'});
  assert.equal(home.status,302);assert.equal(home.headers.get('location'),'/admin');
  assert.equal((await fetch(base+'/admin/api/corp')).status,404);
  assert.equal((await fetch(base+'/admin/api/usage')).status,404);
  const usage=await (await request('/admin/api/usage?period=all')).json();assert.equal(usage.totals.requests,0);assert.equal(usage.providerReported,null);
  assert.equal((await request('/admin/api/corp/pair',{}, {'x-dc-admin-action':'0'})).status,403);
  for(const path of ['/admin/api/corp/ideas','/admin/api/corp/projects','/admin/api/corp/projects/unknown/start','/admin/api/corp/arenas','/admin/api/corp/arenas/unknown/start','/admin/api/corp/arenas/unknown/retry']){
    assert.equal((await request(path,{}, {'x-dc-admin-action':'0'})).status,403,path+' requires an admin write action');
    assert.equal((await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404,path+' is local only');
  }
  for(const path of ['/admin/corp/bridge/bootstrap-authorize','/admin/corp/bridge/bootstrap-report'])assert.equal((await request(path,{})).status,401,path+' requires a paired adapter');
  assert.equal((await request('/admin/corp/bridge/poll',{})).status,401);
  const snapshot=await (await request('/admin/api/corp')).json();assert.equal(snapshot.enabled,false);assert.equal(snapshot.office,true);
  assert.equal(snapshot.companyRoles.length,8);
  assert.equal((await request('/admin/api/corp/team',{workspaceId:'missing',members:[]},{'x-dc-admin-action':'0'})).status,403);
  const {token}=await (await request('/admin/api/corp/pair',{})).json();
  assert.equal((await request('/admin/corp/bridge/sync',{})).status,401);
  const projectId='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', projectUrl=`https://chatgpt.com/g/${projectId}/project`;
  const project=(await (await request('/admin/api/workspaces',{name:'Project fixture',root:'D:\\ProjectFixture',chatUrl:projectUrl})).json()).workspace;
  assert.equal((await request('/admin/api/workspaces/sync',{id:project.id},{'x-dc-admin-action':'0'})).status,403);
  const projectHeaders={authorization:'Bearer '+token};
  const scope=(await (await request('/admin/corp/bridge/poll',{},projectHeaders)).json()).projects[0];
  assert.equal(scope.projectId,projectId);
  const sync={workspaceId:project.id,projectUrl,requested:scope.requested,status:'complete',chats:[{name:'Member',chatUrl:`https://chatgpt.com/g/${projectId}/c/member-chat`}]};
  assert.equal((await request('/admin/corp/bridge/sync',sync,projectHeaders)).status,200);
  assert.equal((await request('/admin/api/corp/team',{workspaceId:project.id,members:[{chatId:'member-chat',roleId:'design'}]})).status,200);
  assert.equal((await request('/admin/api/corp/team',{workspaceId:project.id,members:[{chatId:'outside-chat',roleId:'qa'}]})).status,400);
  assert.equal((await request('/admin/corp/bridge/sync',{...sync,chats:[{chatUrl:'https://chatgpt.com/c/outside-chat'}]},projectHeaders)).status,400);
  assert.equal((await (await request('/admin/api/corp')).text()).includes(token),false);
  const headers={authorization:'Bearer '+token};
  const workspace=await (await request('/admin/api/workspaces',{name:'Fixture worker',root:'D:\\Synthetic',chatUrl:'https://chatgpt.com/c/corp-fixture'})).json();
  const run=await (await request('/admin/api/corp/runs',{title:'Synthetic task',steps:[{workspaceId:workspace.workspace.id,role:'Builder',prompt:'Reply CORP_FIXTURE_OK'}]})).json();
  assert.equal(run.status,'paused');
  assert.equal((await (await request('/admin/corp/bridge/poll',{chats:['corp-fixture']},headers)).json()).command,null);
  await request('/admin/api/corp/settings',{enabled:true});await request('/admin/api/corp/runs/'+run.id+'/start',{});
  const {command}=await (await request('/admin/corp/bridge/poll',{chats:['corp-fixture']},headers)).json();assert.match(command.prompt,/CORP_FIXTURE_OK/);
  assert.equal((await (await request('/admin/corp/bridge/authorize',command,headers)).json()).allowed,true);
  await request('/admin/api/corp/runs/'+run.id+'/pause',{});
  assert.equal((await (await request('/admin/corp/bridge/authorize',command,headers)).json()).allowed,false);
  for(const path of ['/admin/corp-dashboard.js','/admin/corp-dashboard.css','/admin/usage-dashboard.js','/admin/console.css','/admin/corp/office/','/admin/corp/office/office.js','/admin/corp/office/assets/char_0.png']){
    const response=await request(path);assert.equal(response.status,200,path);
    assert.equal((await fetch(base+path)).status,404,path+' is private');
  }
  const office=await request('/admin/corp/office/');assert.match(office.headers.get('content-security-policy'),/frame-ancestors 'self'/);
  await request('/admin/api/corp/revoke',{});assert.equal((await request('/admin/corp/bridge/poll',{},headers)).status,401);
});
