import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCorpRuntime} from '../scripts/corp-runtime.mjs';
import {companyRoles,deliveryOrder} from '../scripts/corp-company.mjs';

test('company assignments persist per Project, validate membership and do not invent employees or dispatch',async t=>{
  const root=await mkdtemp(join(tmpdir(),'umibridge-company-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const options={workspaces:()=>[{id:'project',kind:'project',chats:[{chatId:'one'},{chatId:'two'}]},{id:'other',kind:'project',chats:[{chatId:'external'}]}]};
  const path=join(root,'corp.json');let corp=await createCorpRuntime(path,options);
  assert.equal(companyRoles.length,8);assert.deepEqual(new Set(deliveryOrder),new Set(companyRoles.map(role=>role.id)));
  assert.deepEqual(corp.snapshot().teams,[]);
  await assert.rejects(corp.team({workspaceId:'project',members:[{chatId:'external',roleId:'qa'}]}),/invalid_team_member/);
  await assert.rejects(corp.team({workspaceId:'project',members:[{chatId:'one',roleId:'unknown'}]}),/invalid_team_member/);
  await assert.rejects(corp.team({workspaceId:'project',members:[{chatId:'one',roleId:'qa'},{chatId:'one',roleId:'design'}]}),/duplicate_team_chat/);
  await corp.team({workspaceId:'project',members:[{chatId:'one',roleId:'design'},{chatId:'two',roleId:'qa'}]});
  await corp.team({workspaceId:'other',members:[{chatId:'external',roleId:'ceo'}]});
  const teams=corp.snapshot().teams;await corp.close();corp=await createCorpRuntime(path,options);
  assert.deepEqual(corp.snapshot().teams,teams);assert.equal(corp.snapshot().runs.length,0);assert.equal(corp.snapshot().enabled,false);
  await corp.team({workspaceId:'project',members:[]});assert.equal(corp.snapshot().teams.find(team=>team.workspaceId==='other').members.length,1);
});
