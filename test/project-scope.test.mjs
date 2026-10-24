import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatLinksStore, parseProjectLink } from '../scripts/local-admin.mjs';
import { createCorpRuntime } from '../scripts/corp-runtime.mjs';

const projectId = 'g-p-cccccccccccccccccccccccccccccccc';
const projectUrl = `https://chatgpt.com/g/${projectId}/project`;
const member = id => ({ name:id, chatUrl:`https://chatgpt.com/g/${projectId}/c/${id}` });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),'umibridge-project-')); t.after(() => rm(root,{recursive:true,force:true}));
  const path = join(root,'links.json'), store = await createChatLinksStore(path);
  const project = await store.addWorkspace({name:'Fixture Project',root:'D:\\SyntheticCorp',chatUrl:projectUrl});
  const sync = (chats,status='complete',extra={}) => store.syncProject({workspaceId:project.id,projectUrl,requested:store.workspaces()[0].sync.requested,chats,status,...extra});
  return {root,path,store,project,sync};
}

test('Project URL normalizes slug while rejecting off-origin, credentials and ambiguous paths', () => {
  assert.equal(parseProjectLink(projectUrl.replace('/project','-umibgrm/project')).chatUrl,projectUrl);
  for (const url of [projectUrl+'?x=1',projectUrl+'#x',projectUrl.replace('https:','http:'),projectUrl.replace('chatgpt.com','chatgpt.com.evil.test'),projectUrl.replace('chatgpt.com','user@chatgpt.com'),projectUrl.replace('chatgpt.com','chatgpt.com:8443'),projectUrl.replace('/project','/c/chat-one'),projectUrl.replace('g-p-','g-')]) assert.throws(()=>parseProjectLink(url));
});

test('Project members survive reload; partial lists merge; completed scans remove departed chats',async t=>{
  const f=await fixture(t);
  await f.sync([member('chat-one'),member('chat-two')]);
  await f.sync([member('chat-three')],'partial');
  assert.equal(f.store.workspaces()[0].chats.length,3);
  await assert.rejects(f.sync([{chatUrl:'https://chatgpt.com/c/outside-chat'}]),/chat_outside_project/);
  await assert.rejects(f.sync([{chatUrl:member('other-chat').chatUrl.replace(projectId,'g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')}]),/chat_outside_project/);
  await assert.rejects(f.sync([], 'complete', {requested:'old-request'}),/stale_project_sync/);
  assert.equal(f.store.workspaces()[0].chats.length,3);
  const reloaded=await createChatLinksStore(f.path);
  assert.equal(reloaded.workspaces()[0].chats.length,3);
  assert.equal(reloaded.workspaces()[0].sync.status,'pending');
  await f.sync([member('chat-one')]); assert.equal(f.store.workspaces()[0].chats.length,1);
  const publicCopy=f.store.workspaces(); publicCopy[0].chats.length=0; assert.equal(f.store.workspaces()[0].chats.length,1);
  await assert.rejects(f.store.set('request-test',projectUrl));
  await assert.rejects(f.store.addWorkspace({name:'duplicate',root:'D:\\Other',chatUrl:projectUrl}),/already added/);
  const legacy=join(f.root,'legacy.json'); await writeFile(legacy,JSON.stringify({version:2,links:[],workspaces:[{id:'legacy-workspace',name:'old',root:'D:\\Old',chatUrl:'https://chatgpt.com/c/old-chat'}]}));
  assert.equal((await createChatLinksStore(legacy)).workspaces()[0].chatId,'old-chat');
});

test('Project run rejects cross-group steps and requires live Project tab scope through handoff',async t=>{
  const f=await fixture(t); await f.sync([member('chat-one'),member('chat-two')]);
  const legacy=await f.store.addWorkspace({name:'outside',root:'D:\\Other',chatUrl:'https://chatgpt.com/c/outside-chat'});
  const corp=await createCorpRuntime(join(f.root,'corp.json'),{workspaces:()=>f.store.workspaces()}); t.after(()=>corp.close());
  const {token}=await corp.pair(); await corp.settings({enabled:true});
  const step = id => ({workspaceId:f.project.id,chatId:id,prompt:'Reply with scope test result.'});
  await assert.rejects(corp.create({steps:[step('chat-one')]}),/chat_outside_project/);
  await assert.rejects(corp.create({workspaceId:f.project.id,steps:[step('outside-chat')]}),/chat_not_in_project/);
  await assert.rejects(corp.create({workspaceId:f.project.id,steps:[{workspaceId:legacy.id,prompt:'bad'}]}),/chat_outside_project/);
  const run=await corp.create({workspaceId:f.project.id,steps:[step('chat-one'),step('chat-two')]}); await corp.action(run.id,'start');
  assert.equal((await corp.poll(token,{chats:['chat-one']})).command,null,'A bare conversation tab cannot receive a Project task');
  const poll = ()=>corp.poll(token,{chats:['chat-one','chat-two'],projectChats:[{chatId:'chat-one',projectId},{chatId:'chat-two',projectId}]});
  const command=(await poll()).command; assert.equal(command.projectId,projectId);
  assert.equal((await corp.authorize(token,{...command,projectId:'wrong-project'})).allowed,false);
  assert.equal((await corp.authorize(token,command)).allowed,true);
  await corp.report(token,{...command,kind:'done',sent:true,result:'First scoped result'});
  const next=(await poll()).command; assert.equal(next.chatId,'chat-two'); assert.match(next.prompt,/First scoped result/);
  await f.sync([member('chat-one')]);
  assert.equal((await corp.authorize(token,next)).allowed,false,'Membership removal invalidates outstanding send');
  assert.equal((await corp.report(token,{...next,kind:'done',sent:true,result:'Late result from departed chat'})).ignored,true);
  assert.equal(corp.snapshot().runs[0].steps[1].result,null,'Departed chat cannot hand off a late result');
  assert.equal((await poll()).monitors.length,0);
  assert.equal(corp.snapshot().runs[0].steps[1].reason,'chat_outside_project');
});
