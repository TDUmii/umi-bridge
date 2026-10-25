import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { resetProjectData, projectDataInventory } from '../scripts/reset-project-data.mjs';
import { readUsageReport } from '../scripts/usage-analytics.mjs';

const now = Date.parse('2026-10-25T10:30:00Z');
const privateText = 'OLD_PRIVATE_PROJECT_CHAT_PAYLOAD';
const usage = { estimated: true, method: 'o200k_base', inputTokens: 19, outputTokens: 31, totalTokens: 50, inputBytes: 67, outputBytes: 101 };

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'umi-reset-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = join(root, '.local-data');
  await mkdir(state); await mkdir(join(root, 'scripts'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'umibridge-sakura-console' }));
  await writeFile(join(root, 'scripts', 'run-local-web.mjs'), '// test app entry');
  const requests = [
    { id: privateText, timestamp: new Date(now - 1000).toISOString(), toolName: 'run_command', provider: 'chatgpt', clientName: 'ChatGPT', status: 'ok', durationMs: 11, usage,
      arguments: { path: privateText }, command: privateText, cwd: privateText, output: { stdout: privateText }, chatUrl: privateText },
    { id: 'old', timestamp: '2026-06-01T00:00:00Z', toolName: 'read_file', provider: 'other', clientName: 'Other', status: 'error', durationMs: 300,
      usage: { ...usage, method: 'utf8-bytes/4' }, arguments: { content: privateText } },
    { id: 'skipped', timestamp: new Date(now - 86_400_000).toISOString(), toolName: 'read_file', clientName: 'ChatGPT', status: 'ok', durationMs: 7,
      usage: { ...usage, inputTokens: null, outputTokens: null, totalTokens: null, skipped: 'payload-size' } },
  ];
  const corp = { schema: 1, enabled: true, office: false, autoResume: false, tokenHash: 'PRESERVE_PAIRING_HASH',
    runs: [{ id: privateText, prompt: privateText }], events: [{ id: privateText }], teams: [{ title: privateText }],
    bootstraps: [{ root: privateText }], arenas: [{ title: privateText }],
    usage: [{ ...requests[0], id: privateText, toolName: 'chat_turn', clientName: 'ChatGPT Corp', title: privateText, chatId: privateText,
      usage: { estimated: true, method: 'o200k_base', inputTokens: 17, outputTokens: null, inputBytes: 29, outputBytes: 0, partial: true }, status: 'pending' }] };
  await writeFile(join(state, 'request-history.jsonl'), requests.map(JSON.stringify).join('\n') + '\n{incomplete\n');
  await writeFile(join(state, 'corp-state.json'), JSON.stringify(corp));
  await writeFile(join(state, 'chat-links.json'), JSON.stringify({ version: 3, links: [{ requestId: privateText }], workspaces: [{ root: privateText }] }));
  await writeFile(join(state, 'workflows.jsonl'), JSON.stringify({ title: privateText }) + '\n');
  for (const name of ['connection-secret.txt', 'oauth-state.json', 'tunnel-config.json', 'devices.json', 'tool-policy.json', 'agent-config.json']) await writeFile(join(state, name), `UNCHANGED_${name}`);
  // A source/product outside app stores must never be deleted.
  await writeFile(join(root, 'generated-product.txt'), privateText);
  const server = createServer(); await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  const port = server.address().port; await new Promise(accept => server.close(accept));
  await writeFile(join(state, 'web-status.json'), JSON.stringify({ port }));
  return { root, state, corp, port };
}

test('dry-run changes nothing; apply erases project content and keeps exact token totals and time series', async t => {
  const { root, state, corp } = await fixture(t);
  const names = await readdir(state);
  const original = new Map(await Promise.all(names.map(async name => [name, await readFile(join(state, name), 'utf8')])));
  const plan = await resetProjectData({ root, now });
  assert.equal(plan.applied, false); assert.equal(plan.removed.workspaces, 1); assert.equal(plan.removed.invalidRequestLines, 1);
  assert.equal(plan.usageTotals.totalTokens, 67);
  assert.deepEqual(await readdir(state), names);
  for (const [name, text] of original) assert.equal(await readFile(join(state, name), 'utf8'), text);
  const inventory = await projectDataInventory({ root });
  assert.deepEqual(inventory, { workspaces: [{ chats: [] }], links: [{}] });
  assert.equal(JSON.stringify(inventory).includes(privateText), false);
  const before = await readUsageReport(join(state, 'request-history.jsonl'), { period: 'all' }, corp.usage, now);
  const result = await resetProjectData({ root, apply: true, now });
  assert.equal(result.applied, true); assert.equal(result.usageChecksum, plan.usageChecksum);
  const cleanCorp = JSON.parse(await readFile(join(state, 'corp-state.json'), 'utf8'));
  const after = await readUsageReport(join(state, 'request-history.jsonl'), { period: 'all' }, cleanCorp.usage, now, [], join(state, 'token-history.jsonl'));
  assert.deepEqual(after.totals, before.totals); assert.deepEqual(after.timeline, before.timeline);
  assert.equal(cleanCorp.enabled, false); assert.equal(cleanCorp.tokenHash, corp.tokenHash);
  assert.equal(cleanCorp.office, false); assert.equal(cleanCorp.autoResume, false);
  for (const name of ['runs', 'events', 'teams', 'bootstraps', 'arenas']) assert.deepEqual(cleanCorp[name], []);
  for (const name of ['request-history.jsonl', 'corp-state.json', 'chat-links.json', 'workflows.jsonl', 'token-history.jsonl']) assert.equal((await readFile(join(state, name), 'utf8')).includes(privateText), false);
  assert.equal(await readFile(join(state, 'request-history.jsonl'), 'utf8'), '');
  assert.equal((await readFile(join(state, 'token-history.jsonl'), 'utf8')).trim().split('\n').length, 3);
  assert.deepEqual(JSON.parse(await readFile(join(state, 'chat-links.json'), 'utf8')), { version: 3, links: [], workspaces: [] });
  assert.equal(await readFile(join(state, 'workflows.jsonl'), 'utf8'), '');
  for (const [name, text] of original) if (!result.files.includes(name)) assert.equal(await readFile(join(state, name), 'utf8'), text);
  assert.equal(await readFile(join(root, 'generated-product.txt'), 'utf8'), privateText);
  assert.equal((await readdir(state)).some(name => /reset-|backup/.test(name)), false);
  const again = await resetProjectData({ root, apply: true, now });
  assert.equal(again.usageChecksum, result.usageChecksum);
  assert.equal(again.retained.newlyArchivedMeasurements, 0);
  assert.equal(again.retained.existingArchivedMeasurements, 3);
});

test('existing numeric archive merges fresh live requests without duplicate IDs or lost totals', async t => {
  const { root, state } = await fixture(t);
  const first = await resetProjectData({ root, apply: true, now });
  const entry = { id: 'historical-mcp-1', timestamp: new Date(now - 2000).toISOString(), toolName: 'run_command', provider: 'chatgpt', clientName: 'ChatGPT', status: 'ok', durationMs: 11, usage,
    arguments: { content: privateText }, command: privateText };
  await writeFile(join(state, 'request-history.jsonl'), JSON.stringify(entry) + '\n');
  const second = await resetProjectData({ root, apply: true, now });
  assert.equal(second.retained.requestMeasurements, 4);
  assert.equal(second.retained.existingArchivedMeasurements, 3);
  assert.equal(second.retained.newlyArchivedMeasurements, 1);
  assert.equal(second.usageTotals.totalTokens, first.usageTotals.totalTokens + 50);
  const archive = (await readFile(join(state, 'token-history.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(new Set(archive.map(row => row.id)).size, 4);
  assert.equal(JSON.stringify(archive).includes(privateText), false);
  assert.equal(await readFile(join(state, 'request-history.jsonl'), 'utf8'), '');
});

test('failed second replacement restores all originals and removes sanitized staging files', async t => {
  const { root, state } = await fixture(t);
  const names = await readdir(state);
  const originals = new Map(await Promise.all(names.map(async name => [name, await readFile(join(state, name), 'utf8')])));
  const originalRename = fs.rename;
  let calls = 0;
  fs.rename = async (...args) => {
    if (++calls === 2) throw Error('fixture_replace_failure');
    return originalRename(...args);
  };
  syncBuiltinESMExports();
  try { await assert.rejects(resetProjectData({ root, apply: true, now }), /fixture_replace_failure/); }
  finally { fs.rename = originalRename; syncBuiltinESMExports(); }
  assert.deepEqual(await readdir(state), names);
  for (const [name, text] of originals) assert.equal(await readFile(join(state, name), 'utf8'), text);
  // The failed reset also released the launcher mutex.
  assert.equal((await resetProjectData({ root, apply: true, now })).applied, true);
});

test('live PID or live listener blocks apply without changing stores', async t => {
  const { root, state, port } = await fixture(t);
  const original = await readFile(join(state, 'corp-state.json'), 'utf8');
  await writeFile(join(state, 'web-status.json'), JSON.stringify({ pid: process.pid, port }));
  await assert.rejects(resetProjectData({ root, apply: true, now }), /reset_gateway_must_be_stopped/);
  await writeFile(join(state, 'web-status.json'), JSON.stringify({ port }));
  const server = createServer(); await new Promise(accept => server.listen(port, '127.0.0.1', accept));
  try { await assert.rejects(resetProjectData({ root, apply: true, now }), /reset_gateway_must_be_stopped/); }
  finally { await new Promise(accept => server.close(accept)); }
  assert.equal(await readFile(join(state, 'corp-state.json'), 'utf8'), original);
});

test('wrong root, symlinked store and invalid Corp state fail before mutation', async t => {
  const { root, state } = await fixture(t);
  await assert.rejects(resetProjectData({ root: '.' }), /reset_requires_absolute_app_root/);
  await writeFile(join(root, 'package.json'), '{"name":"different-app"}');
  await assert.rejects(resetProjectData({ root }), /reset_wrong_app_root/);
  await writeFile(join(root, 'package.json'), '{"name":"umibridge-sakura-console"}');
  await writeFile(join(state, 'corp-state.json'), '{"schema":2,"runs":[],"events":[]}');
  await assert.rejects(resetProjectData({ root, apply: true, now }), /reset_invalid_corp_store/);
  const originalRequests = await readFile(join(state, 'request-history.jsonl'), 'utf8');
  assert.ok(originalRequests.includes(privateText));
  const external = join(root, 'outside.json'); await writeFile(external, originalRequests);
  await rm(join(state, 'request-history.jsonl'));
  try { await symlink(external, join(state, 'request-history.jsonl')); }
  catch (error) { if (error.code === 'EPERM') return; throw error; }
  await assert.rejects(resetProjectData({ root, apply: true, now }), /reset_store_must_be_regular_file/);
  assert.equal(await readFile(external, 'utf8'), originalRequests);
});
