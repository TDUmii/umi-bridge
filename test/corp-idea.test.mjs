import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createCorpRuntime} from '../scripts/corp-runtime.mjs';
import {companyRoles,suggestCompanyTeam,buildIdeaWorkflow,readIdeaReport} from '../scripts/corp-company.mjs';

const projectId='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const project=()=>({id:'project',kind:'project',projectId,name:'MINH HỌA - Idea',root:'D:\\SyntheticIdea',chats:companyRoles.map(role=>({chatId:role.id,name:role.name,chatUrl:`https://chatgpt.com/g/${projectId}/c/${role.id}`}))});
const report=(outcome='pass')=>'Báo cáo minh họa, không chạy công cụ thật.\nUMI_CORP_RESULT: '+JSON.stringify({outcome,summary:'MINH HỌA - '+outcome,artifacts:['.umibridge-projects/fixture/report.md'],checks:[{name:'Synthetic check',status:outcome==='pass'?'pass':'fail',evidence:'MINH HỌA - fixture only'}]});
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'umibridge-idea-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,'corp.json'),workspace=project(),options={workspaces:()=>[workspace]};
  let corp=await createCorpRuntime(file,options);t.after(()=>corp.close());
  const {token}=await corp.pair();
  const poll=()=>corp.poll(token,{chats:workspace.chats.map(chat=>chat.chatId),projectChats:workspace.chats.map(chat=>({chatId:chat.chatId,projectId}))});
  return {get corp(){return corp;},workspace,token,poll,restart:async()=>{await corp.close();corp=await createCorpRuntime(file,options);}};
}

test('idea template matches named departments, keeps explicit assignments, and scopes every stage to the Project',()=>{
  const p=project(),team=suggestCompanyTeam(p);assert.equal(team.members.length,8);assert.deepEqual(team.missingRoles,[]);
  assert.equal(suggestCompanyTeam({...p,chats:[...p.chats,{chatId:'second-qa',name:'QA Engineer'}]}).missingRoles.includes('qa'),true,'ambiguous names require assignment');
  assert.equal(suggestCompanyTeam(p,[{chatId:'product',roleId:'qa'}]).members.find(item=>item.chatId==='product').roleId,'qa');
  const plan=buildIdeaWorkflow({project:p,idea:'Một ứng dụng quản lý việc học',requestKey:randomUUID()});
  assert.equal(plan.steps.length,11);assert.equal(plan.steps[0].stage,'brief');assert.equal(plan.steps.at(-1).stage,'delivery');
  assert.ok(plan.steps.every(step=>step.workspaceId===p.id&&p.chats.some(chat=>chat.chatId===step.chatId)));
  assert.match(plan.steps[0].prompt,/tiêu chí nghiệm thu/);assert.match(plan.steps[3].prompt,/Triển khai mã hoạt động/);
  for(const dimension of ['accessibility','performance','maintainability','delivery'])assert.ok(plan.steps.every(step=>step.prompt.includes(dimension)),dimension);
  assert.equal(plan.steps.filter(step=>step.requiresPass).length,4);
  const planning=buildIdeaWorkflow({project:{...p,chats:p.chats.filter(chat=>['ceo','product','design'].includes(chat.chatId))},idea:'Một công cụ ghi chú',mode:'plan',requestKey:randomUUID()});
  assert.equal(planning.steps.length,3);
  assert.throws(()=>buildIdeaWorkflow({project:{...p,chats:[]},idea:'Một công cụ ghi chú',requestKey:randomUUID()}),/missing_company_roles/);
  assert.throws(()=>buildIdeaWorkflow({project:p,idea:'x'.repeat(8001),requestKey:randomUUID()}),/invalid_idea/);
});

test('idea creation is idempotent, starts only on explicit request, and carries every preceding handoff',async t=>{
  const f=await fixture(t),input={workspaceId:'project',idea:'Ứng dụng nhắc việc cho học sinh',requestKey:randomUUID()};
  const run=await f.corp.idea(input);assert.equal(run.status,'paused');assert.equal(f.corp.snapshot().enabled,false);
  assert.equal((await f.corp.idea(input)).id,run.id);assert.equal(f.corp.snapshot().runs.length,1);
  await assert.rejects(f.corp.idea({...input,idea:'Ý tưởng khác hoàn toàn'}),/idea_request_conflict/);
  await assert.rejects(f.corp.idea({...input,requestKey:randomUUID(),start:true}),/enable_corp_first/);
  await f.corp.settings({enabled:true});await f.corp.action(run.id,'start');
  for(let index=0;index<11;index++){
    const {command}=await f.poll();assert.ok(command);assert.equal((await f.corp.authorize(f.token,command)).allowed,true);
    if(index>1){assert.match(command.prompt,/Kết quả Làm rõ ý tưởng/);assert.match(command.prompt,/Kết quả Thiết kế giải pháp/);}
    await f.corp.report(f.token,{...command,kind:'done',sent:true,result:report()});
  }
  const finished=f.corp.snapshot().runs[0];assert.equal(finished.status,'done');assert.ok(finished.steps.every(step=>step.assessment.outcome==='pass'));
  await f.restart();assert.deepEqual(f.corp.snapshot().runs[0],finished);assert.equal(f.corp.snapshot().teams[0].members.length,8);
  assert.equal((await f.corp.idea(input)).id,run.id,'a lost acknowledgement after restart does not create another project run');
});

test('QA findings reach repair, final QA allows one bounded extra repair, and a second failure stops delivery',async t=>{
  const f=await fixture(t);await f.corp.settings({enabled:true});
  const run=await f.corp.idea({workspaceId:'project',idea:'Công cụ quản lý bài tập',requestKey:randomUUID(),start:true});
  let finalQa=0,seenRepair=false;
  for(let index=0;index<13;index++){
    const {command}=await f.poll();assert.ok(command);
    const step=f.corp.snapshot().runs[0].steps.find(item=>item.id===command.stepId);
    let outcome=step.stage==='qa-first'?'needs_changes':'pass';
    if(step.stage==='repair'){seenRepair=true;assert.match(command.prompt,/needs_changes/);}
    if(step.stage==='qa-final'){finalQa++;outcome='needs_changes';}
    await f.corp.report(f.token,{...command,kind:'done',sent:true,result:report(outcome)});
    if(finalQa===2)break;
  }
  const stopped=f.corp.snapshot().runs[0];assert.equal(seenRepair,true);assert.equal(stopped.id,run.id);assert.equal(stopped.steps.length,13);
  assert.equal(stopped.idea.repairRounds,2);assert.equal(stopped.status,'paused');
  assert.equal(stopped.steps.find(step=>step.status==='blocked').reason,'idea_quality_failed');assert.equal((await f.poll()).command,null);
  assert.ok(stopped.steps.filter(step=>['local-run','docs','delivery'].includes(step.stage)).every(step=>step.status==='queued'));
});

test('missing evidence, blocked departments and negative final reports cannot become successful idea delivery',async t=>{
  assert.equal(readIdeaReport(report().replace(/\n/g,' ')).outcome,'pass','rendered paragraphs may flatten line breaks before the report footer');
  assert.throws(()=>readIdeaReport('Everything passed!'),/idea_report_invalid/);
  assert.throws(()=>readIdeaReport('UMI_CORP_RESULT: {"outcome":"pass","summary":"ok","artifacts":[],"checks":[]}'),/idea_report_invalid/);
  const f=await fixture(t);await f.corp.settings({enabled:true});
  await f.corp.idea({workspaceId:'project',idea:'Ứng dụng lịch học',requestKey:randomUUID(),start:true});
  const {command}=await f.poll();await f.corp.report(f.token,{...command,kind:'done',sent:true,result:'Không có công cụ nhưng tôi đã làm xong.'});
  assert.equal(f.corp.snapshot().runs[0].steps[0].reason,'idea_report_invalid');assert.equal((await f.poll()).command,null);
  await f.corp.action(f.corp.snapshot().runs[0].id,'retry');await f.corp.action(f.corp.snapshot().runs[0].id,'start');
  const retry=(await f.poll()).command;await f.corp.report(f.token,{...retry,kind:'done',sent:true,result:report('blocked')});
  assert.equal(f.corp.snapshot().runs[0].steps[0].reason,'idea_stage_blocked');assert.equal(f.corp.snapshot().runs[0].status,'paused');
});
