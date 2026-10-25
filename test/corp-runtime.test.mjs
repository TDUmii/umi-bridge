import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCorpRuntime, parseResetDelay } from '../scripts/corp-runtime.mjs';

test('quota countdown parses all supplied spellings and rejects absent or unbounded times', () => {
  for (const [text, minutes] of [['in 2h 11m',131],['in 2h 29min',149],['2h 37m',157],['Try again in 2 hours 11 minutes',131],['sau 2 giờ 29 phút',149],['in 37m',37],['in 2h',120]]) assert.equal(parseResetDelay(text), minutes*60000, text);
  for (const value of ['', 'tomorrow', '0m', 'in 999h', 'no reset available']) assert.equal(parseResetDelay(value), null);
});

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'umibridge-corp-')); t.after(()=>rm(root,{recursive:true,force:true}));
  let now=1800000000000;
  const file=join(root,'corp-state.json');
  const options={clock:()=>now,workspaces:()=>[{id:'one',name:'Builder',chatUrl:'https://chatgpt.com/c/chat-one'},{id:'two',name:'Reviewer',chatUrl:'https://chatgpt.com/g/project/c/chat-two'}]};
  let corp=await createCorpRuntime(file,options); const {token}=await corp.pair();
  const create=()=>corp.create({title:'Build and review',steps:[{workspaceId:'one',role:'Builder',prompt:'Build only the requested file.'},{workspaceId:'two',role:'Reviewer',prompt:'Review the result.'}]});
  const poll=()=>corp.poll(token,{chats:['chat-one','chat-two']});
  return {get corp(){return corp;},token,create,poll,file,advance:ms=>now+=ms,now:()=>now,restart:async()=>{await corp.close();corp=await createCorpRuntime(file,options);}};
}

test('Corp sends ordered steps once, preserves acknowledgement and hands off real result',async t=>{
  const f=await fixture(t),run=await f.create();
  assert.equal((await f.poll()).command,null);
  await assert.rejects(f.corp.action(run.id,'start'),/enable_corp_first/);
  await f.corp.settings({enabled:true});await f.corp.action(run.id,'start');
  const command=(await f.poll()).command;assert.equal(command.chatId,'chat-one');
  assert.equal(f.corp.usage().length,0,'An issued command is not proof of sending.');
  assert.equal((await f.poll()).command,null);
  await f.restart();assert.equal((await f.poll()).command,null);
  await f.corp.report(f.token,{...command,kind:'sent'});
  assert.equal(f.corp.usage().length,1); assert.ok(f.corp.usage()[0].usage.inputTokens>0); assert.equal(f.corp.usage()[0].usage.outputTokens,null);
  await f.corp.report(f.token,{...command,kind:'done',sent:true,result:'Created the requested file.'});
  await f.corp.report(f.token,{...command,kind:'done',sent:true,result:'Duplicate'});
  const next=(await f.poll()).command;assert.equal(next.chatId,'chat-two');assert.match(next.prompt,/Created the requested file/);
  await f.corp.report(f.token,{...next,kind:'done',sent:true,result:'Review passed.'});
  assert.equal(f.corp.snapshot().runs[0].status,'done');assert.equal(f.corp.snapshot().events.filter(e=>e.type==='handoff').length,1);
  assert.equal((await f.poll()).command,null);
  assert.equal(f.corp.usage().length,2,'Duplicate reports cannot add another measured turn.');
  assert.ok(f.corp.usage().every(row=>row.status==='ok'&&row.usage.outputTokens>0&&!row.usage.partial));
  const usage=f.corp.usage();await f.restart();assert.deepEqual(f.corp.usage(),usage);
  await f.corp.action(run.id,'delete');assert.deepEqual(f.corp.usage(),usage,'Deleting a finished run keeps numeric history.');
  assert.ok(!(await readFile(f.file,'utf8')).includes(f.token));
});

test('provider load-error placeholders block instead of handing off even with an older adapter',async t=>{
  const f=await fixture(t),run=await f.create();await f.corp.settings({enabled:true});await f.corp.action(run.id,'start');
  const command=(await f.poll()).command;await f.corp.report(f.token,{...command,kind:'sent'});
  await f.corp.report(f.token,{...command,kind:'done',sent:true,result:'Không thể tải phản hồi này'});
  const saved=f.corp.snapshot();assert.equal(saved.runs[0].steps[0].status,'blocked');assert.equal(saved.runs[0].steps[0].reason,'response_unavailable');
  assert.equal(saved.runs[0].steps[0].result,null);assert.equal(saved.events.some(e=>e.type==='handoff'),false);assert.equal((await f.poll()).command,null);
  assert.equal(f.corp.usage()[0].status,'error');assert.equal(f.corp.usage()[0].usage.outputTokens,null);
});

test('limit anchors reset once, survives restart, resumes same task after deadline with continuation',async t=>{
  const f=await fixture(t),run=await f.create();await f.corp.settings({enabled:true});await f.corp.action(run.id,'start');
  const command=(await f.poll()).command;await f.corp.report(f.token,{...command,kind:'sent'});
  await f.corp.report(f.token,{...command,kind:'limit',notice:'You reached your limit. Try again in 2h 29min',sent:true});
  const reset=f.corp.snapshot().runs[0].steps[0].resetAt;assert.equal(reset,f.now()+149*60000+15000);
  f.advance(60000);await f.corp.report(f.token,{...command,kind:'limit',notice:'You reached your limit. Try again in 2h 29min'});
  assert.equal(f.corp.snapshot().runs[0].steps[0].resetAt,reset);
  await f.restart();assert.equal((await f.poll()).command,null);
  assert.equal(f.corp.usage().length,1,'Repeated quota notices do not count more requests.');
  await assert.rejects(f.corp.action(run.id,'retry'),/not_reset/);
  f.advance(reset-f.now()-1);assert.equal((await f.poll()).command,null);f.advance(1);
  const resumed=(await f.poll()).command;assert.equal(resumed.stepId,command.stepId);assert.notEqual(resumed.attempt,command.attempt);assert.equal(resumed.refresh,true);assert.match(resumed.prompt,/Tiếp tục nhiệm vụ đang dở/);
  await assert.rejects(f.corp.report(f.token,{...command,kind:'done',sent:true,result:'old'}),/stale_attempt/);
  assert.equal((await f.poll()).command,null);
});

test('pause, disable, auto-resume off, unknown reset and ambiguous sends never auto-dispatch',async t=>{
  const f=await fixture(t),run=await f.create();await f.corp.settings({enabled:true});await f.corp.action(run.id,'start');
  const command=(await f.poll()).command;assert.equal((await f.corp.authorize(f.token,command)).allowed,true);
  await f.corp.action(run.id,'pause');assert.equal((await f.corp.authorize(f.token,command)).allowed,false);
  await f.corp.report(f.token,{...command,kind:'limit',notice:'Usage limit reached, in 2h 11m',sent:false});
  f.advance(132*60000);assert.equal((await f.poll()).command,null);
  await f.corp.action(run.id,'start');await f.corp.settings({autoResume:false});assert.equal((await f.poll()).command,null);
  await f.corp.settings({autoResume:true,enabled:false});assert.equal((await f.poll()).command,null);
  await f.corp.settings({enabled:true});const resumed=(await f.poll()).command;assert.ok(resumed);assert.doesNotMatch(resumed.prompt,/Tiếp tục nhiệm vụ đang dở/);
  await f.corp.report(f.token,{...resumed,kind:'limit',notice:'Limit reached. Try later.'});assert.equal(f.corp.snapshot().runs[0].steps[0].reason,'limit_time_unknown');
  f.advance(9*86400000);assert.equal((await f.poll()).command,null);
  await f.corp.action(run.id,'retry');await f.corp.action(run.id,'start');await f.poll();f.advance(91000);assert.equal((await f.poll()).command,null);
  assert.equal(f.corp.snapshot().runs[0].steps[0].reason,'send_unconfirmed');
});

test('Corp rejects unregistered targets, wrong credential, cancelled reports and parallel sends to same chat',async t=>{
  const f=await fixture(t);await assert.rejects(f.corp.create({steps:[{workspaceId:'missing',prompt:'x'}]}),/workspace_not_found/);
  await assert.rejects(f.corp.poll('wrong'),/invalid_corp_key/);
  const a=await f.create(),b=await f.create();await f.corp.settings({enabled:true});await f.corp.action(a.id,'start');await f.corp.action(b.id,'start');
  const command=(await f.poll()).command;assert.equal((await f.poll()).command,null);
  await f.corp.action(a.id,'cancel');await f.corp.report(f.token,{...command,kind:'done',sent:true,result:'late'});
  assert.equal(f.corp.snapshot().runs[0].status,'cancelled');assert.equal((await f.poll()).command.runId,b.id);
  await f.corp.revoke();await assert.rejects(f.poll(),/invalid_corp_key/);
});
