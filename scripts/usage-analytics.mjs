import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const DAY = 86400_000;
const nonnegative = value => Number.isFinite(value) && value >= 0;
const label = value => typeof value === 'string' ? value.slice(0, 160) : '';
const empty = () => ({ requests: 0, success: 0, errors: 0, pending: 0, measured: 0, partial: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 0, timed: 0, inputBytes: 0, outputBytes: 0 });

function normalize(entry, source) {
  if (!entry?.id || typeof entry.timestamp !== 'string' || !Number.isFinite(Date.parse(entry.timestamp))) return null;
  const usage = entry.usage || {};
  const valid = usage.estimated === true && usage.method === 'o200k_base' &&
    (usage.totalTokens == null || usage.totalTokens === usage.inputTokens + usage.outputTokens);
  const token = key => valid && Number.isSafeInteger(usage[key]) && usage[key] >= 0 ? usage[key] : null;
  const inputTokens = token('inputTokens'), outputTokens = token('outputTokens');
  return { id: label(entry.id), timestamp: new Date(entry.timestamp).toISOString(), source, provider: label(entry.provider) || 'unknown',
    application: label(entry.clientName) || 'Unknown app', tool: label(entry.toolName) || 'unknown',
    chat: source === 'corp' ? label(entry.chatId) : '', task: source === 'corp' ? label(entry.title) : '',
    status: entry.status === 'ok' ? 'ok' : entry.status === 'error' ? 'error' : 'pending',
    durationMs: nonnegative(entry.durationMs) ? entry.durationMs : null,
    inputTokens, outputTokens, totalTokens: inputTokens === null && outputTokens === null ? null : (inputTokens || 0) + (outputTokens || 0),
    partial: Boolean(usage.partial) || inputTokens === null || outputTokens === null,
    inputBytes: nonnegative(usage.inputBytes) ? usage.inputBytes : 0, outputBytes: nonnegative(usage.outputBytes) ? usage.outputBytes : 0,
    model: null, providerReported: null };
}

function add(bucket, row) {
  bucket.requests++;
  bucket[row.status === 'ok' ? 'success' : row.status === 'error' ? 'errors' : 'pending']++;
  if (row.totalTokens !== null) bucket.measured++;
  if (row.partial && row.totalTokens !== null) bucket.partial++;
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'inputBytes', 'outputBytes']) bucket[key] += row[key] || 0;
  if (row.durationMs !== null) { bucket.durationMs += row.durationMs; bucket.timed++; }
}
const finish = bucket => ({ ...bucket, unmeasured: bucket.requests - bucket.measured,
  averageMs: bucket.timed ? Math.round(bucket.durationMs / bucket.timed) : null,
  successRate: bucket.success + bucket.errors ? Math.round(1000 * bucket.success / (bucket.success + bucket.errors)) / 10 : null });

export async function readUsageReport(filePath, filters = {}, corpUsage = [], now = Date.now()) {
  const period = ['today', '24h', '7d', '30d', '60d', 'all'].includes(filters.period) ? filters.period : '7d';
  const offset = Math.max(-840, Math.min(840, Number(filters.offset) || 0)) * 60_000;
  const midnight = Math.floor((now - offset) / DAY) * DAY + offset;
  const since = period === 'all' ? 0 : period === 'today' ? midnight : now - ({ '24h': 1, '7d': 7, '30d': 30, '60d': 60 }[period] * DAY);
  const page = Math.max(0, Math.min(2000, Math.trunc(Number(filters.page) || 0)));
  const limit = 50, keep = (page + 1) * limit;
  const source = ['mcp', 'corp'].includes(filters.source) ? filters.source : 'all';
  const search = label(filters.search).toLowerCase();
  const total = empty(), groups = { applications: new Map(), tools: new Map(), chats: new Map(), sources: new Map() };
  const options = { applications: new Set(), tools: new Set() }, timeline = new Map();
  const hourly = period === 'today' || period === '24h', unit = hourly ? 3600_000 : DAY;
  const chartSince = Math.max(since, midnight - 59 * DAY);
  const bucketKey = stamp => Math.floor((stamp - offset) / unit) * unit + offset;
  for (let stamp = bucketKey(chartSince); stamp <= now; stamp += unit) timeline.set(stamp, empty());
  let rows = [];
  function accept(entry, origin) {
    const row = normalize(entry, origin);
    if (!row) return;
    const stamp = Date.parse(row.timestamp);
    if (stamp < since || stamp > now || (source !== 'all' && row.source !== source)) return;
    options.applications.add(row.application); options.tools.add(row.tool);
    if (filters.application && filters.application !== 'all' && filters.application !== row.application) return;
    if (filters.tool && filters.tool !== 'all' && filters.tool !== row.tool) return;
    if (filters.status && filters.status !== 'all' && filters.status !== row.status) return;
    if (search && ![row.id, row.application, row.tool, row.chat, row.task].some(value => value.toLowerCase().includes(search))) return;
    add(total, row);
    for (const [dimension, name] of Object.entries({ applications: row.application, tools: row.tool, chats: row.chat || 'unassigned', sources: row.source })) {
      const group = groups[dimension].get(name) || { name, ...empty() };
      add(group, row); groups[dimension].set(name, group);
    }
    const bucket = timeline.get(bucketKey(stamp));
    if (stamp >= chartSince && bucket) add(bucket, row);
    rows.push(row);
    // Keep pagination bounded while streaming the full journal for accurate totals.
    if (rows.length > keep + 1000) rows = rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id)).slice(0, keep);
  }
  if (source !== 'corp') {
    try {
      const lines = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
      for await (const line of lines) {
        let entry; try { entry = JSON.parse(line); } catch { continue; }
        accept(entry, 'mcp');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (source !== 'mcp') for (const entry of corpUsage) accept(entry, 'corp');
  return { period, source, since: new Date(since).toISOString(), until: new Date(now).toISOString(), offsetMinutes: offset / 60_000,
    method: 'o200k_base', estimated: true, providerReported: null, model: null,
    totals: finish(total), groups: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, [...values.values()].map(finish).sort((a, b) => b.totalTokens - a.totalTokens)])),
    options: Object.fromEntries(Object.entries(options).map(([key, values]) => [key, [...values].sort()])),
    timeline: [...timeline].map(([at, values]) => ({ at: new Date(at).toISOString(), ...finish(values) })), chartDays: period === 'all' ? 60 : null,
    rows: rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id)).slice(page * limit, keep), page, limit, pages: Math.ceil(total.requests / limit) };
}
