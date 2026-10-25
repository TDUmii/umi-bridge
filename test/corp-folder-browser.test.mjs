import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, realpath, symlink } from 'node:fs/promises';
import { join, dirname, parse } from 'node:path';
import { tmpdir } from 'node:os';
import { createCorpFolderBrowser } from '../scripts/corp-folder-browser.mjs';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'umibridge-folder-browser-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {root,browse:createCorpFolderBrowser({home:root})};
}

test('folder browser lists real child directories, roots, canonical selection, and parent navigation without file contents',async t=>{
  const {root,browse}=await fixture(t),alpha=join(root,'Alpha'),beta=join(root,'Beta'),alias=join(root,'Alias');
  await mkdir(beta);await mkdir(alpha);await writeFile(join(root,'private.txt'),'not a directory');
  await symlink(alpha,alias,process.platform==='win32'?'junction':'dir');
  const listing=await browse({path:''}),canonical=await realpath(root);
  assert.equal(listing.path,canonical);assert.equal(listing.parentPath,dirname(canonical));assert.equal(listing.truncated,false);
  assert.deepEqual(listing.folders.map(item=>item.name),['Alias','Alpha','Beta']);
  assert.deepEqual(listing.folders.find(item=>item.name==='Alpha'),{name:'Alpha',path:join(canonical,'Alpha')});
  assert.ok(listing.roots.some(item=>item.path.toLowerCase()===parse(canonical).root.toLowerCase()));
  const selected=await browse({path:alias});assert.equal(selected.path,await realpath(alpha));assert.deepEqual(selected.folders,[]);assert.equal(selected.parentPath,canonical);
  assert.equal((await browse()).path,canonical);
  const driveRoot=await browse({path:parse(canonical).root});assert.equal(driveRoot.parentPath,null);
});

test('folder browser rejects unsafe, missing, non-directory, and inaccessible paths with bounded public errors',async t=>{
  const {root,browse}=await fixture(t),file=join(root,'file.txt');await writeFile(file,'private');
  for(const path of [null,7,{},'relative',join(root,'missing'),file,join(root,'control\u0000'),'\\\\?\\C:\\Unsafe','\\\\.\\C:\\Unsafe']) {
    await assert.rejects(browse({path}),/^Error: folder_path_unavailable$/);
  }
  const inaccessible=createCorpFolderBrowser({home:root,openDirectory:async()=>{throw Object.assign(Error('private diagnostics'),{code:'EACCES'});}});
  await assert.rejects(inaccessible({path:root}),/^Error: folder_path_unavailable$/);
});

test('folder browser caps directory results at 500 and reports truncation only for additional directories',async t=>{
  const {root,browse}=await fixture(t);
  await Promise.all(Array.from({length:500},(_,index)=>mkdir(join(root,`folder-${String(index).padStart(3,'0')}`))));
  await writeFile(join(root,'private.txt'),'file contents excluded');
  const full=await browse({path:root});assert.equal(full.folders.length,500);assert.equal(full.truncated,false);
  await mkdir(join(root,'folder-500'));
  const truncated=await browse({path:root});assert.equal(truncated.folders.length,500);assert.equal(truncated.truncated,true);
});
