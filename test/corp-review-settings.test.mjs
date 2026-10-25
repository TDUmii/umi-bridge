import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createCorpRuntime} from '../scripts/corp-runtime.mjs';
import {staffRoles,companyRoles,buildIdeaWorkflow} from '../scripts/corp-company.mjs';
import {reviewConfig,reviewTeams} from '../scripts/corp-review-teams.mjs';
import {modelCatalog} from '../scripts/browser-models.mjs';
test('selected review teams get independent checks before repair and mandatory final checks, scoped and durable',async t=>{
  const root=await mkdtemp(join(tmpdir(),'corp-review-'));t.after(()=>rm(root,{force:true,recursive:true}));
  const projectId='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',project={id:'project',kind:'project',projectId,root,name:'Fixture',chats:staffRoles.map(role=>({chatId:role.id,name:role.name,chatUrl:`https://chatgpt.com/g/${projectId}/c/${role.id}`}))};
  const options={workspaces:()=>[project]},file=join(root,'corp.json');let corp=await createCorpRuntime(file,options);t.after(()=>corp.close());
  await corp.team({workspaceId:project.id,members:staffRoles.map(role=>({roleId:role.id,chatId:role.id}))});
  const input={workspaceId:project.id,idea:'Ứng dụng học tập kiểm chứng',requestKey:randomUUID(),reviewTeams:reviewTeams.map(row=>row.id),productProfile:'education',productGoal:'Học sinh lớp 3 tự học'};
  const run=await corp.idea(input);assert.equal(run.steps.length,27);assert.equal(run.idea.productProfile,'education');
  for(const team of reviewTeams){const first=run.steps.findIndex(row=>row.stage==='review-'+team.id),repair=run.steps.findIndex(row=>row.stage==='repair'),last=run.steps.find(row=>row.stage==='review-'+team.id+'-final');assert.ok(first<repair);assert.equal(last.requiresPass,true);assert.equal(last.chatId,team.id);assert.ok(last.prompt.includes(team.checks));}
  assert.ok(run.steps.every(row=>row.prompt.includes(input.productGoal)&&row.prompt.length<=20000));
  await corp.close();corp=await createCorpRuntime(file,options);assert.equal((await corp.idea(input)).id,run.id);
  await assert.rejects(corp.idea({...input,reviewTeams:[]}),/idea_request_conflict/);
  const core=buildIdeaWorkflow({...input,project,members:companyRoles.map(row=>({roleId:row.id,chatId:row.id})),reviewTeams:[]});assert.equal(core.steps.length,11);
  await corp.idea({...input,requestKey:randomUUID(),reviewTeams:[]});
  assert.equal(corp.snapshot().teams[0].members.length,staffRoles.length,'disabling checks for one run preserves existing staff assignments');
  const {token}=await corp.pair();await corp.settings({enabled:true});await corp.action(run.id,'start');
  for(let turn=0;turn<run.steps.length;turn++){
    const {command}=await corp.poll(token,{extensionVersion:'0.5.0',chats:project.chats.map(row=>row.chatId),projectChats:project.chats.map(row=>({chatId:row.chatId,projectId}))});assert.ok(command);
    const stage=corp.snapshot().runs.find(row=>row.id===run.id).steps.find(row=>row.id===command.stepId).stage;
    const outcome=stage==='review-architecture'||stage==='review-architecture-final'?'needs_changes':'pass';
    await corp.report(token,{...command,kind:'done',sent:true,result:'UMI_CORP_RESULT: '+JSON.stringify({outcome,summary:'Synthetic review',artifacts:['report.md'],checks:[{name:'Fixture check',status:outcome==='pass'?'pass':'fail',evidence:'Fixture evidence'}]})});
    if(stage==='review-architecture-final')break;
  }
  const stopped=corp.snapshot().runs.find(row=>row.id===run.id);assert.equal(stopped.status,'paused');assert.equal(stopped.steps.find(row=>row.stage==='review-architecture-final').reason,'idea_quality_failed');assert.equal(stopped.steps.at(-1).status,'queued','a failed specialist final check cannot deliver');
  assert.throws(()=>reviewConfig({reviewTeams:['fake']}),/invalid_review_config/);
});
test('model settings accept only picker-reported choices, persist, and block older adapters',async t=>{
  const root=await mkdtemp(join(tmpdir(),'corp-model-'));t.after(()=>rm(root,{force:true,recursive:true}));const file=join(root,'corp.json');let corp=await createCorpRuntime(file,{workspaces:()=>[]});t.after(()=>corp.close());
  const {token}=await corp.pair();await assert.rejects(corp.settings({modelPreference:{model:'GPT-5.6 Sol',effort:'high'}}),/model_not_available/);
  await corp.settings({scanModels:true});const id=corp.snapshot().modelScan.id;
  await assert.rejects(corp.models('wrong',{id,models:[]}),/invalid_corp_key/);await assert.rejects(corp.models(token,{id:'stale',models:[]}),/stale_model_scan/);
  await corp.models(token,{id,models:[{model:'GPT-5.6 Sol',efforts:['low','medium','high','xhigh','max']}]});await corp.settings({modelPreference:{model:'GPT-5.6 Sol',effort:'high'}});
  await assert.rejects(corp.settings({modelPreference:{model:'GPT-5.6 Sol',effort:'ultra'}}),/model_not_available/);
  assert.throws(()=>modelCatalog([{model:'imaginary-model',efforts:['high']}]),/invalid_model_catalog/);
  await corp.close();corp=await createCorpRuntime(file,{workspaces:()=>[]});assert.deepEqual(corp.snapshot().modelPreference,{model:'GPT-5.6 Sol',effort:'high'});assert.equal((await corp.poll(token,{extensionVersion:'0.4.0'})).command,null);await corp.settings({modelPreference:null});assert.equal(corp.snapshot().modelPreference,null);
});
