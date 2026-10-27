import {mkdir,readFile,writeFile,rename,readdir,lstat,realpath,unlink} from 'node:fs/promises';
import {join,dirname,relative,isAbsolute,extname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const sourceExtensions=new Set(['.js','.mjs','.cjs','.jsx','.ts','.tsx','.html','.css','.scss','.sass','.less','.vue','.svelte','.py','.go','.rs','.c','.h','.cpp','.hpp','.cs','.java','.kt','.swift','.sql','.json','.toml','.yaml','.yml','.xml','.svg','.txt','.md','.png','.jpg','.jpeg','.webp','.woff','.woff2','.ps1','.sh','.bash','.cmd','.bat','.csproj','.fsproj','.vbproj','.sln','.props','.targets','.gradle','.kts','.glsl','.vert','.frag','.wgsl']);
const safeDotfile=/(^|\/)(?:\.gitignore|\.dockerignore|\.editorconfig)$/i;
const excluded=/(^|\/)(?:\.[^/]+|node_modules|vendor|dist|coverage|test(?:s)?|__tests__|docs|logs|reports|evidence|screenshots|captures|recordings|backups|downloads|private|secrets?|credentials?|hardware|diagnostics|fixtures|__pycache__|bin|obj|chats?|conversations?)(\/|$)|(?:^|\/)(?:UMI-[^/]*|.*\.(?:test|spec)\.[^/]+|.*(?:hardware|diagnostic|machine|personal|auth-state)[^/]*|[^/]*\.env[^/]*|[^/]*\.log|(?:secrets?|credentials?|passwords?|tokens?|sessions?|accounts?|cookies?)(?:\.[^/]+)?)$/i;
const sensitive=/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b|(?<![A-Za-z0-9_])[A-Z]:[\\/]|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|connection[_-]?string)\s*[=:]\s*["'][^"'\s]{8,}["']|Bearer\s+[A-Za-z0-9._~+/-]{16,}|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/i;
// Unix home paths are case-sensitive; /Home/End in keyboard help is not a user path.
const localUserPath=/\/(?:Users|home)\/[^\s/]+/;
const within=(root,path)=>{const part=relative(root,path);return part&&part!=='..'&&!part.startsWith('../')&&!part.startsWith('..\\')&&!isAbsolute(part);};
// Metadata-bearing images are excluded rather than publishing location or author fields.
function safeAsset(name,bytes){
  const ext=extname(name).toLowerCase();
  if(ext==='.png'){
    if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return false;
    let offset=8;while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);if(offset+12+length>bytes.length||['tEXt','iTXt','zTXt','eXIf','tIME'].includes(kind))return false;offset+=12+length;if(kind==='IEND')return offset===bytes.length;}return false;
  }
  if(ext==='.jpg'||ext==='.jpeg'){
    if(bytes[0]!==255||bytes[1]!==216)return false;let offset=2;
    while(offset+4<=bytes.length){if(bytes[offset++]!==255)return false;const marker=bytes[offset++];if(marker===218)return true;if([225,237,254].includes(marker))return false;const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)return false;offset+=length;}return false;
  }
  if(ext==='.webp'){
    if(bytes.length<12||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)return false;
    let offset=12;while(offset+8<=bytes.length){const kind=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4);if(['EXIF','XMP '].includes(kind)||offset+8+length>bytes.length)return false;if(kind==='VP8X'&&length>0&&(bytes[offset+8]&12))return false;offset+=8+length+(length%2);}return offset===bytes.length;
  }
  if(ext==='.woff')return bytes.length>=44&&bytes.toString('ascii',0,4)==='wOFF'&&bytes.readUInt32BE(24)===0;
  if(ext==='.woff2')return bytes.length>=48&&bytes.toString('ascii',0,4)==='wOF2'&&bytes.readUInt32BE(28)===0;
  return false;
}
export async function collectGeneratedSource(root){
  if((await lstat(root)).isSymbolicLink())throw Error('git_source_symlink');
  const canonical=await realpath(root),files=[];let total=0,visited=0;
  const skipped={excluded:0,unsupported:0,unsafe:0};
  const visit=async(dir)=>{for(const entry of await readdir(dir,{withFileTypes:true})){
    if(++visited>20000)throw Error('git_source_capacity');
    const path=join(dir,entry.name),name=relative(canonical,path).replaceAll('\\','/');
    if((excluded.test(name)&&!safeDotfile.test(name))||entry.isSymbolicLink()){skipped.excluded++;continue;}
    if(entry.isDirectory()){await visit(path);continue;}
    if(!entry.isFile()||!sourceExtensions.has(extname(name).toLowerCase())&&!safeDotfile.test(name)&&!/(^|\/)(?:LICENSE|Dockerfile(?:\.[\w-]+)?|Makefile|CMakeLists\.txt|go\.mod|go\.sum|Cargo\.lock|Gemfile(?:\.lock)?|Procfile)$/i.test(name)){skipped.unsupported++;continue;}
    if(/\.(json|ya?ml|txt|md)$/i.test(name)&&!/(^|\/)(?:README(?:\.md)?|LICENSE(?:\.md)?|package(?:-lock)?\.json|tsconfig(?:\.[a-z-]+)?\.json|jsconfig\.json|requirements(?:[-.\w]*)\.txt|CMakeLists\.txt|pnpm-lock\.yaml|compose\.ya?ml|docker-compose\.ya?ml|manifest\.json|appsettings(?:\.[\w-]+)?\.json|[\w.-]+\.config\.(?:json|ya?ml))$/i.test(name)&&!(/\.(json|ya?ml)$/i.test(name)&&/(^|\/)(?:src|assets?|public|static|locales?|i18n|config)(\/|$)/i.test(name))){skipped.unsupported++;continue;}
    const asset=/\.(png|jpe?g|webp|woff2?)$/i.test(name),stat=await lstat(path);if(stat.size>(asset?4:2)*1024*1024||stat.nlink!==1||!within(canonical,await realpath(path))){skipped.unsafe++;continue;}
    const bytes=await readFile(path);
    if(asset){
      if(!/(^|\/)(?:assets?|public|static|images?|fonts?|icons?)(\/|$)/i.test(name)||!safeAsset(name,bytes)){skipped.unsafe++;continue;}
    }else if(bytes.includes(0)||sensitive.test(bytes.toString('utf8'))||localUserPath.test(bytes.toString('utf8'))){skipped.unsafe++;continue;}
    total+=bytes.length;if(total>30*1024*1024||files.length>=3000)throw Error('git_source_capacity');
    files.push({name,bytes});
  }};
  await visit(canonical);Object.defineProperty(files,'skipped',{value:skipped});return files;
}
export async function createGeneratedProjectGit(directory,{projects,runner=execute}={}){
  await mkdir(directory,{recursive:true});const statePath=join(directory,'settings.json');
  let state={enabled:false,projects:[]};try{if((await lstat(statePath)).isSymbolicLink())throw Error('git_store_symlink');state=JSON.parse(await readFile(statePath,'utf8'));if(typeof state.enabled!=='boolean'||!Array.isArray(state.projects))throw Error('git_store_invalid');}catch(error){if(error.code!=='ENOENT')throw error;}
  let queue=Promise.resolve();const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  const save=async()=>{const temp=statePath+'.tmp';await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,statePath);};
  const run=async(command,args,cwd)=>{try{return (await runner(command,args,{cwd,windowsHide:true,timeout:120000,maxBuffer:1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GH_PROMPT_DISABLED:'1',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'}})).stdout.trim();}catch{throw Error(command==='gh'?'private_git_github_unavailable':'private_git_command_failed');}};
  let available=false;try{await run('gh',['auth','status']);available=true;}catch{}
  const displayName=project=>{const name=typeof project.name==='string'?project.name.replace(/\s+\[UMI-[a-f0-9-]+\]$/i,'').trim():'';return name||({corp:'Corp product',arena:'Arena product'}[project.channel]||'Generated product');};
  const snapshot=()=>{const current=projects(),archives=current.map(project=>({key:project.channel+'-'+project.id,channel:project.channel,id:project.id,status:state.enabled?'not_archived':'disabled',...state.projects.find(row=>row.id===project.id&&row.channel===project.channel),name:displayName(project)}));for(const row of state.projects)if(!archives.some(item=>item.key===row.key))archives.push({...row,name:row.name||({corp:'Corp product',arena:'Arena product'}[row.channel]||'Generated product')});return structuredClone({...state,available,error:available?null:'private_git_github_unavailable',archives,privateOnly:true,sourceOnly:true});};
  const archive=async(input)=>{
    if(!state.enabled)throw Error('generated_git_disabled');
    const project=projects().find(row=>row.channel===input.channel&&row.id===input.id);if(!project)throw Error('generated_project_not_found');
    const key=project.channel+'-'+project.id;if(!/^(corp|arena)-[a-f0-9-]{36}$/i.test(key))throw Error('generated_project_invalid');
    let record=state.projects.find(row=>row.key===key);if(!record){record={key,channel:project.channel,id:project.id,status:'pending'};state.projects.push(record);}
    if(input.checkpoint&&record.status==='synced'&&record.checkpoint===String(input.checkpoint).slice(0,120))return structuredClone(record);
    try{
      Object.assign(record,{status:'syncing',attempts:(record.attempts||0)+1,lastAttemptAt:new Date().toISOString(),error:null,stage:'collect'});await save();
      const files=await collectGeneratedSource(project.root);record.skipped=files.skipped;record.files=files.length;if(!files.length){record.status='waiting_source';record.updatedAt=new Date().toISOString();await save();return structuredClone(record);}
      record.stage='authenticate';await run('gh',['auth','status']);available=true;const owner=await run('gh',['api','user','--jq','.login']);if(!/^[a-zA-Z0-9-]{1,39}$/.test(owner))throw Error('private_git_owner_invalid');
      if(record.owner&&record.owner!==owner)throw Error('private_git_account_changed');
      const requested=typeof input.repoName==='string'?input.repoName.trim():'';
      if(!record.repo&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(requested))throw Error('private_git_repo_name_required');
      const repo=record.repo||`${owner}/${requested}`;
      if(!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repo))throw Error('private_git_repo_name_invalid');
      const verifyPrivate=async()=>{const info=JSON.parse(await run('gh',['repo','view',repo,'--json','visibility,url,nameWithOwner']));if(info.visibility!=='PRIVATE'||info.nameWithOwner?.toLowerCase()!==repo.toLowerCase())throw Error('private_git_required');return info;};
      if(record.repo){record.stage='verify_private';await verifyPrivate();}
      const mirror=join(directory,key);await mkdir(mirror,{recursive:true});if((await lstat(mirror)).isSymbolicLink())throw Error('git_mirror_symlink');
      const git=(...args)=>run('git',['-c','core.hooksPath='+join(directory,'disabled-hooks'),'-c','commit.gpgsign=false','-c','credential.helper=','-c','credential.helper=!gh auth git-credential',...args],mirror);
      let fresh=false;try{await lstat(join(mirror,'.git'));}catch(error){if(error.code!=='ENOENT')throw error;await git('init','-b','main');fresh=true;}
      if((await lstat(join(mirror,'.git'))).isSymbolicLink())throw Error('git_mirror_symlink');
      if(record.repo){
        const remotes=(await git('remote')).split(/\s+/);if(!remotes.includes('origin'))await git('remote','add','origin',`https://github.com/${repo}.git`);
        const origin=await git('remote','get-url','origin');if(origin!==`https://github.com/${repo}.git`)throw Error('private_git_remote_mismatch');
        if(fresh){
          await git('fetch','--no-tags','--no-recurse-submodules','origin','refs/heads/main');
          await git('update-ref','refs/heads/main','FETCH_HEAD');
          // Load only the index, never checkout remote files or run their filters/hooks.
          await git('read-tree','FETCH_HEAD');
        }
      }
      record.stage='commit';await git('config','user.name','UmiBridge');await git('config','user.email','generated-product@users.noreply.github.com');
      const names=new Set(files.map(file=>file.name));
      const tracked=(await git('ls-files','-z')).split('\0').filter(Boolean);
      for(const name of tracked){if(!within(mirror,join(mirror,name))||name.startsWith('.git/'))throw Error('git_mirror_invalid');if(!names.has(name))await unlink(join(mirror,name)).catch(error=>{if(error.code!=='ENOENT')throw error;});}
      for(const file of files){const target=join(mirror,file.name);await mkdir(dirname(target),{recursive:true});if(!within(await realpath(mirror),await realpath(dirname(target)))){if(dirname(target)!==mirror)throw Error('git_mirror_invalid');}try{if((await lstat(target)).isSymbolicLink())throw Error('git_mirror_symlink');}catch(error){if(error.code!=='ENOENT')throw error;}await writeFile(target,file.bytes);}
      const pathsFile=join(directory,key+'-paths');await writeFile(pathsFile,[...new Set([...names,...tracked])].join('\0')+'\0');try{await git('add','--all','--pathspec-from-file='+pathsFile,'--pathspec-file-nul');}finally{await unlink(pathsFile);}
      if(await git('diff','--cached','--name-only'))await git('commit','-m','Generated product checkpoint');
      if(!record.repo){
        record.stage='create_private';record.owner=owner;await save();
        // Recover a repository created before a failed settings write or process exit.
        if((await git('remote')).split(/\s+/).includes('origin')){if(await git('remote','get-url','origin')!==`https://github.com/${repo}.git`)throw Error('private_git_remote_mismatch');await verifyPrivate();}
        else try{await run('gh',['repo','create',repo,'--private','--source',mirror,'--remote','origin']);}catch(error){
          // GitHub may have created the repo before gh failed to add its local remote.
          await verifyPrivate();if(!(await git('remote')).split(/\s+/).includes('origin'))await git('remote','add','origin',`https://github.com/${repo}.git`);
        }
        record.repo=repo;await save();
      }
      const info=await verifyPrivate();
      const remote=await git('remote','get-url','origin');if(![`https://github.com/${repo}.git`,`https://github.com/${repo}`,`git@github.com:${repo}.git`].includes(remote))throw Error('private_git_remote_mismatch');
      record.url=info.url;record.stage='push';await save();await git('push','origin','HEAD:refs/heads/main');
      Object.assign(record,{status:'synced',stage:'complete',commit:await git('rev-parse','HEAD'),files:files.length,checkpoint:String(input.checkpoint||'manual').slice(0,120),updatedAt:new Date().toISOString(),error:null});await save();return structuredClone(record);
    }catch(error){record.status='error';record.error=/^(?:private_git_|git_)[a-z_]+$/.test(error.message)?error.message:'private_git_archive_failed';if(record.error==='private_git_github_unavailable'&&record.stage==='authenticate')available=false;record.updatedAt=new Date().toISOString();await save();throw Error(record.error);}
  };
  return {snapshot,settings:input=>serial(async()=>{if(typeof input.enabled!=='boolean')throw Error('invalid_git_setting');if(input.enabled){await run('gh',['auth','status']);available=true;}state.enabled=input.enabled;await save();return snapshot();}),archive:input=>serial(()=>archive(input)),checkpoint:input=>{if(!state.enabled)return Promise.resolve();return serial(()=>archive(input)).catch(()=>{});},close:()=>queue};
}
