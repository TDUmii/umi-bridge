import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatLinksStore } from '../scripts/local-admin.mjs';

test('project links migrate safely, match folder boundaries and provider, and refuse ambiguous chats', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'umibridge-projects-'));
  try {
    const path = join(directory, 'links.json');
    await writeFile(path, JSON.stringify([{ requestId: 'legacy-request', chatUrl: 'https://chatgpt.com/c/legacy-chat' }]));
    let store = await createChatLinksStore(path);
    assert.equal(store.list().length, 1);
    const project = await store.addWorkspace({ name: 'Fixture', root: 'D:/Projects/App', chatUrl: 'https://chatgpt.com/c/project-chat' });
    const request = (id, path, provider = 'chatgpt') => ({ id, provider, arguments: { path } });
    const records = [request('match', 'd:\\projects\\APP\\src\\file.txt'), request('boundary', 'D:/Projects/Application'), request('provider', 'D:/Projects/App/a', 'other'), request('relative', 'src/a')];
    assert.deepEqual(store.resolve(records).map(row => row.requestId), ['match']);
    assert.equal(store.resolve(records)[0].workspaceId, project.id);
    await assert.rejects(store.addWorkspace({ root: 'D:/Projects/../Other', chatUrl: 'https://chatgpt.com/c/project-chat' }));
    await assert.rejects(store.addWorkspace({ root: 'D:/Projects', chatUrl: 'https://evil.example/c/project-chat' }));
    store = await createChatLinksStore(path);
    assert.equal(store.workspaces().length, 1);
    assert.equal(store.list().length, 1);
    const duplicate = await store.addWorkspace({ root: 'D:/Projects/App', chatUrl: 'https://chatgpt.com/c/another-chat' });
    assert.equal(store.resolve(records).length, 0, 'Ambiguous folder matches must never guess a conversation.');
    await store.removeWorkspace(duplicate.id);
    assert.equal(store.resolve(records).length, 1);
    const stored = JSON.parse(await readFile(path));
    assert.equal(stored.version, 3);
    await store.clear();
    assert.equal(store.workspaces().length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
