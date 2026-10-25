import { readFile, writeFile, rename, unlink, lstat, realpath } from 'node:fs/promises';
import { createServer, createConnection } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readUsageReport } from './usage-analytics.mjs';

const names = ['request-history.jsonl', 'corp-state.json', 'chat-links.json', 'workflows.jsonl', 'token-history.jsonl'];
const historical = 'Dữ liệu trước khi làm mới';
const safeLabel = (value, fallback) => typeof value === 'string' && value.length <= 160 && !/[\r\n]|https?:\/\/|[a-z]:[\\/]|[\\/]{2}/i.test(value) ? value : fallback;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const optionalRead = async path => {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('reset_store_must_be_regular_file');
    return await readFile(path, 'utf8');
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const parse = (value, fallback) => value === null ? fallback : JSON.parse(value);

function usageMetadata(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return undefined;
  const result = {};
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'inputBytes', 'outputBytes', 'providerReported']) {
    if (usage[key] === null || typeof usage[key] === 'number' && Number.isFinite(usage[key])) result[key] = usage[key];
  }
  for (const key of ['estimated', 'partial']) if (typeof usage[key] === 'boolean') result[key] = usage[key];
  if ('method' in usage) result.method = ['o200k_base', 'utf8-bytes/4'].includes(usage.method) ? usage.method : 'unknown';
  if (usage.skipped) result.skipped = 'historical-measurement-skipped';
  return result;
}

function metadata(entry, index, corp = false) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error('reset_invalid_usage_record');
  const result = { id: `historical-${corp ? 'corp' : 'mcp'}-${index + 1}` };
  for (const key of ['timestamp', 'durationMs', 'contentItems']) {
    if (Object.hasOwn(entry, key)) result[key] = entry[key];
  }
  if ('provider' in entry) result.provider = safeLabel(entry.provider, 'unknown');
  if ('clientName' in entry) result.clientName = safeLabel(entry.clientName, historical);
  if ('toolName' in entry) result.toolName = safeLabel(entry.toolName, 'historical_tool');
  if ('status' in entry) result.status = ['ok', 'error'].includes(entry.status) ? entry.status : 'pending';
  if (entry.usage) result.usage = usageMetadata(entry.usage);
  if (corp) { result.chatId = 'historical'; result.title = historical; }
  return result;
}

function journal(text) {
  const rows = [];
  let invalid = 0;
  for (const line of (text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { invalid++; continue; }
    // Both readers ignore JSON primitives and rows lacking these fields.
    if (!entry || typeof entry !== 'object' || !entry.id || !entry.timestamp || !entry.toolName) { invalid++; continue; }
    rows.push(entry);
  }
  return { rows, invalid };
}

async function numericReports(file, usage, now, archive) {
  const result = [];
  for (const period of ['today', '24h', '7d', '30d', '60d', 'all']) {
    for (const source of ['all', 'mcp', 'corp']) for (const offset of [0, -420]) {
      const report = await readUsageReport(file, { period, source, offset }, usage, now, [], archive);
      result.push({ period, source, offset, totals: report.totals, timeline: report.timeline,
        groups: { sources: report.groups.sources } });
    }
  }
  return result;
}

async function validateRoot(root) {
  if (!root || !isAbsolute(root)) throw Error('reset_requires_absolute_app_root');
  const app = resolve(root);
  if ((await lstat(app)).isSymbolicLink() || (await realpath(app)).toLowerCase() !== app.toLowerCase()) throw Error('reset_app_root_alias_rejected');
  const pkg = JSON.parse(await optionalRead(join(app, 'package.json')));
  if (pkg?.name !== 'umibridge-sakura-console') throw Error('reset_wrong_app_root');
  if (await optionalRead(join(app, 'scripts', 'run-local-web.mjs')) === null) throw Error('reset_wrong_app_root');
  const state = join(app, '.local-data');
  if (!(await lstat(state)).isDirectory() || (await realpath(state)).toLowerCase() !== state.toLowerCase()) throw Error('reset_state_alias_rejected');
  return { app, state };
}

async function portIsOpen(port) {
  return await new Promise((accept, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); accept(true); });
    socket.setTimeout(1000, () => { socket.destroy(); reject(Error('reset_gateway_status_uncertain')); });
    socket.once('error', error => {
      if (error.code === 'ECONNREFUSED') accept(false); else reject(Error('reset_gateway_status_uncertain'));
    });
  });
}

async function assertStopped(state) {
  const status = parse(await optionalRead(join(state, 'web-status.json')), {});
  if (Number.isSafeInteger(status.pid) && status.pid > 0) {
    try { process.kill(status.pid, 0); throw Error('reset_gateway_must_be_stopped'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const port = status.port ?? 43127;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('reset_invalid_gateway_port');
  if (await portIsOpen(port)) throw Error('reset_gateway_must_be_stopped');
}

async function launcherLock(app, state) {
  const address = process.platform === 'win32'
    ? '\\\\.\\pipe\\DesktopCommanderLocal-' + createHash('sha256').update(app).digest('hex').slice(0, 16)
    : join(state, 'launcher.sock');
  const server = createServer(socket => socket.destroy());
  await new Promise((accept, reject) => {
    server.once('error', () => reject(Error('reset_gateway_or_reset_already_running')));
    server.listen(address, accept);
  });
  return () => new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
}

/** Registered remote identifiers only. Never returns folder roots, prompts, results or credentials. */
export async function projectDataInventory({ root } = {}) {
  const { state } = await validateRoot(root);
  const store = parse(await optionalRead(join(state, 'chat-links.json')), { workspaces: [], links: [] });
  const fields = item => Object.fromEntries(['id', 'name', 'kind', 'provider', 'projectId', 'chatId', 'chatUrl'].filter(key => typeof item?.[key] === 'string').map(key => [key, item[key]]));
  return { workspaces: (store.workspaces ?? []).map(item => ({ ...fields(item), chats: (item.chats ?? []).map(fields) })),
    links: (Array.isArray(store) ? store : store.links ?? []).map(fields) };
}

/** Exact store reset. Originals stay in memory only; temporary files contain sanitized data. */
export async function resetProjectData({ root, apply = false, now = Date.now() } = {}) {
  const { app, state } = await validateRoot(root);
  let unlock;
  const staged = [], originals = new Map(), replaced = [];
  try {
    if (apply) { unlock = await launcherLock(app, state); await assertStopped(state); }
    for (const name of names) originals.set(name, await optionalRead(join(state, name)));
    const requests = journal(originals.get(names[0]));
    const archive = journal(originals.get(names[4]));
    const corp = parse(originals.get(names[1]), { schema: 1, enabled: false, office: true, autoResume: true, tokenHash: null, runs: [], events: [] });
    if (corp.schema !== 1 || !Array.isArray(corp.runs) || !Array.isArray(corp.events) || corp.usage !== undefined && !Array.isArray(corp.usage)) throw Error('reset_invalid_corp_store');
    const usage = corp.usage ?? [];
    const links = parse(originals.get(names[2]), { version: 3, links: [], workspaces: [] });
    if (!Array.isArray(links) && ![2, 3].includes(links?.version)) throw Error('reset_invalid_chat_links_store');
    const cleanCorp = { schema: 1, enabled: false, office: corp.office, autoResume: corp.autoResume, tokenHash: corp.tokenHash,resetGeneration:randomUUID(),
      runs: [], events: [], usage: usage.map((entry, index) => metadata(entry, index, true)), teams: [], bootstraps: [], arenas: [] };
    const cleanRequests = [...archive.rows, ...requests.rows].map((entry, index) => metadata(entry, index));
    const contents = new Map([
      [names[0], ''],
      [names[1], JSON.stringify(cleanCorp) + '\n'],
      [names[2], JSON.stringify({ version: 3, links: [], workspaces: [] }) + '\n'],
      [names[3], ''],
      [names[4], cleanRequests.map(entry => JSON.stringify(entry)).join('\n') + (cleanRequests.length ? '\n' : '')],
    ]);
    const before = await numericReports(join(state, names[0]), usage, now, join(state, names[4]));
    // Dry-run never creates even a sanitized staging file.
    const report = { applied: false, files: names, activity: { enabled: corp.enabled === true,
      runs: corp.runs.filter(row => !['done', 'cancelled', 'failed'].includes(row.status)).length,
      bootstraps: (corp.bootstraps ?? []).filter(row => !['done', 'cancelled', 'failed'].includes(row.status)).length,
      arenas: (corp.arenas ?? []).filter(row => !['done', 'cancelled', 'failed'].includes(row.status)).length }, removed: {
      workspaces: links.workspaces?.length ?? 0, links: Array.isArray(links) ? links.length : links.links?.length ?? 0,
      runs: corp.runs.length, events: corp.events.length, teams: corp.teams?.length ?? 0,
      bootstraps: corp.bootstraps?.length ?? 0, arenas: corp.arenas?.length ?? 0,
      workflows: (originals.get(names[3]) ?? '').split(/\r?\n/).filter(line => line.trim()).length,
      invalidRequestLines: requests.invalid + archive.invalid }, retained: { requestMeasurements: cleanRequests.length,
        existingArchivedMeasurements: archive.rows.length, newlyArchivedMeasurements: requests.rows.length, corpMeasurements: usage.length },
      usageChecksum: digest(before), usageTotals: before.find(row => row.period === 'all' && row.source === 'all' && row.offset === 0).totals };
    if (!apply) return report;
    for (const name of names) {
      const path = join(state, `${name}.reset-${randomUUID()}.tmp`);
      await writeFile(path, contents.get(name), { flag: 'wx', mode: 0o600 });
      staged.push({ name, path });
    }
    const after = await numericReports(staged[0].path, cleanCorp.usage, now, staged[4].path);
    if (digest(before) !== digest(after)) throw Error('reset_usage_verification_failed');
    await assertStopped(state);
    // Refuse stale snapshots rather than overwriting concurrent modifications.
    for (const name of names) if (await optionalRead(join(state, name)) !== originals.get(name)) throw Error('reset_store_changed');
    for (const entry of staged) { await rename(entry.path, join(state, entry.name)); replaced.push(entry.name); }
    const writtenCorp = JSON.parse(await readFile(join(state, names[1]), 'utf8'));
    if (digest(await numericReports(join(state, names[0]), writtenCorp.usage, now, join(state, names[4]))) !== digest(before)) throw Error('reset_usage_verification_failed');
    return { ...report, applied: true };
  } catch (error) {
    const failures = [];
    for (const name of replaced.reverse()) {
      try {
        const original = originals.get(name), path = join(state, name);
        if (original === null) await unlink(path); else await writeFile(path, original, { mode: 0o600 });
      } catch { failures.push(name); }
    }
    if (failures.length) throw Error(`reset_rollback_failed:${failures.join(',')}`, { cause: error });
    throw error;
  } finally {
    for (const entry of staged) await unlink(entry.path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (unlock) await unlock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] !== '--root' || !args[1] || args.slice(2).some(arg => !['--apply', '--dry-run', '--inventory'].includes(arg)) || new Set(args.slice(2)).size > 1) throw Error('Usage: node scripts/reset-project-data.mjs --root ABSOLUTE_APP_ROOT [--apply|--dry-run|--inventory]');
    console.log(JSON.stringify(args.includes('--inventory') ? await projectDataInventory({ root: args[1] }) : await resetProjectData({ root: args[1], apply: args.includes('--apply') }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
