import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const jsonForHTML = value => JSON.stringify(value).replace(/</g, '\\u003c');

// Only aggregate operational state belongs in this local map. No chat text,
// workspace paths, hostnames, credentials or remote repository URLs are copied.
export function systemMapState({ corp = {}, arena = {}, git = {}, version, installationId, startedAt }) {
  const runs = corp.runs || [], tournaments = arena.arenas || [];
  return {
    schema: 1, installationId, version, generatedAt: new Date().toISOString(), localOnly: true,
    gateway: { running: true, uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) },
    extension: { connected: corp.connected === true, version: /^\d+\.\d+\.\d+$/.test(corp.extensionVersion || '') ? corp.extensionVersion : null },
    corp: { runs: runs.length, active: runs.filter(row => row.status === 'running').length, paused: runs.filter(row => row.status === 'paused').length, pending: runs.reduce((total, row) => total + (row.steps || []).filter(step => step.status === 'reported_complete').length, 0) },
    arena: { beta: true, tournaments: tournaments.length, active: tournaments.filter(row => row.status === 'running').length },
    git: { enabled: git.enabled === true, available: git.available === true, synced: (git.archives || []).filter(row => row.status === 'synced').length },
  };
}

export async function createSystemMap(directory, { snapshot, version }) {
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink()) throw Error('system_map_directory_link');
  const identityFile = join(directory, 'identity.json');
  let identity;
  try {
    if ((await lstat(identityFile)).isSymbolicLink()) throw Error('system_map_identity_link');
    identity = JSON.parse(await readFile(identityFile, 'utf8'));
    if (!/^[a-f0-9-]{36}$/.test(identity.installationId || '')) throw Error('system_map_identity_invalid');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    identity = { installationId: randomUUID() };
    await writeFile(identityFile, JSON.stringify(identity), { flag: 'wx', mode: 0o600 });
  }
  const template = await readFile(new URL('./system-map-template.html', import.meta.url), 'utf8');
  const startedAt = Date.now();
  let queue = Promise.resolve();
  return (includeHTML = true) => {
    const generate = async () => {
      const state = systemMapState({ ...snapshot(), version, installationId: identity.installationId, startedAt });
      const html = template.replace('<!-- UMIBRIDGE_LOCAL_STATE -->', '<script id="umi-map-state" type="application/json">' + jsonForHTML(state) + '</script>');
      // Unique temporary files and atomic replacement keep concurrent opens safe.
      const files = [['current.json', JSON.stringify(state, null, 2)]];
      if (includeHTML) files.push(['current.html', html]);
      for (const [name, content] of files) {
        const target = join(directory, name), temporary = target + '.' + randomUUID() + '.tmp';
        await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
        await rename(temporary, target);
      }
      return { state, html };
    };
    const pending = queue.then(generate);queue = pending.catch(() => {});return pending;
  };
}
