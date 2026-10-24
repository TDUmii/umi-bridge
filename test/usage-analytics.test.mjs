import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readUsageReport } from '../scripts/usage-analytics.mjs';

test('usage filters scan the full journal, respect local day, paginate and omit payloads', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'umi-usage-')); t.after(() => rm(dir, {recursive:true,force:true}));
  const file = join(dir,'requests.jsonl'), now = Date.parse('2026-10-24T18:30:00Z');
  const row = (id, timestamp, extra = {}) => ({id, timestamp, toolName:'read_file', clientName:'ChatGPT', provider:'chatgpt', status:'ok', durationMs:100,
    arguments:{content:'PRIVATE_PAYLOAD'}, usage:{estimated:true,method:'o200k_base',inputTokens:10,outputTokens:20,totalTokens:30,inputBytes:40,outputBytes:80}, ...extra});
  const entries = Array.from({length:620}, (_,i) => row('request-'+String(i).padStart(4,'0'), new Date(now-i*1000).toISOString()));
  entries.push(row('before-local-midnight','2026-10-24T16:59:00Z'),row('future','2026-10-25T20:00:00Z'),row('old','2026-08-01T00:00:00Z'),row('bad-date','broken'));
  entries.push(row('legacy','2026-10-24T17:01:00Z',{usage:{estimated:true,method:'utf8-bytes/4',inputTokens:3,outputTokens:3,totalTokens:6}}));
  await writeFile(file, entries.map(JSON.stringify).join('\n')+'\n{incomplete');
  const today = await readUsageReport(file,{period:'today',offset:'-420'},[],now);
  assert.equal(today.since,'2026-10-24T17:00:00.000Z'); assert.equal(today.totals.requests,621);
  assert.equal(today.totals.totalTokens,620*30); assert.equal(today.totals.unmeasured,1); assert.equal(today.rows.length,50); assert.equal(today.pages,13);
  assert.equal(today.timeline.reduce((sum,r)=>sum+r.requests,0),621);
  assert.equal(JSON.stringify(today).includes('PRIVATE_PAYLOAD'),false); assert.equal(today.model,null); assert.equal(today.providerReported,null);
  const next = await readUsageReport(file,{period:'today',offset:'-420',page:1},[],now);
  assert.equal(next.rows[0].id,'request-0050'); assert.deepEqual(next.totals,today.totals);
  const all = await readUsageReport(file,{period:'all'},[],now);
  assert.equal(all.totals.requests,623); assert.equal(all.timeline.length,60); assert.equal(all.groups.applications[0].requests,623);
  const filtered = await readUsageReport(file,{period:'all',search:'request-061',application:'ChatGPT',tool:'read_file'},[],now);
  assert.equal(filtered.totals.requests,10);
  const corpse = row('corp-attempt','2026-10-24T18:01:00Z',{clientName:'ChatGPT Corp',toolName:'chat_turn',chatId:'chat-test',status:'pending',usage:{estimated:true,method:'o200k_base',inputTokens:9,outputTokens:null,partial:true}});
  const corp = await readUsageReport(file,{source:'corp',period:'all'},[corpse],now);
  assert.equal(corp.totals.requests,1); assert.equal(corp.totals.totalTokens,9); assert.equal(corp.totals.partial,1); assert.equal(corp.totals.successRate,null);
  assert.equal(corp.groups.chats[0].name,'chat-test');
});
