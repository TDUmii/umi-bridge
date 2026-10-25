import { opendir, realpath, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { validateParentRoot } from './corp-runtime.mjs';

export function createCorpFolderBrowser({ home = homedir(), openDirectory = opendir } = {}) {
  return async (input = {}) => {
    try {
      const requested = validateParentRoot(input.path === undefined || input.path === '' ? home : input.path);
      const path = await realpath(requested);
      if (!(await stat(path)).isDirectory()) throw Error('not_directory');
      const folders = [];
      let truncated = false;
      // Stop after 501 directories; file contents never enter this read-only browser.
      for await (const entry of await openDirectory(path)) {
        const childPath = join(path, entry.name);
        try { validateParentRoot(childPath); } catch { continue; }
        let directory = entry.isDirectory();
        if (!directory && entry.isSymbolicLink()) { try { directory = (await stat(childPath)).isDirectory(); } catch {} }
        if (!directory) continue;
        if (folders.length === 500) { truncated = true; break; }
        folders.push({name:entry.name,path:childPath});
      }
      folders.sort((left,right) => left.name.localeCompare(right.name));
      const roots = process.platform === 'win32'
        ? (await Promise.all(Array.from({length:26},async (_,index) => {
          const name = String.fromCharCode(65 + index) + ':', root = name + '\\';
          try { return (await stat(root)).isDirectory() ? {name,path:root} : null; } catch { return null; }
        }))).filter(Boolean)
        : [{name:'/',path:'/'}];
      const parent = dirname(path);
      return {path,parentPath:parent === path ? null : parent,roots,folders,truncated};
    } catch { throw Error('folder_path_unavailable'); }
  };
}
