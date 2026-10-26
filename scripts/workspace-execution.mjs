import {lstat,realpath,readFile,readdir,mkdir,writeFile,rename,open} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,dirname,parse} from 'node:path';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {atomicJson} from './orchestration-state.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const within=(root,path)=>{const delta=relative(root,path);return delta===''||delta!=='..'&&!delta.startsWith('../')&&!delta.startsWith('..\\')&&!isAbsolute(delta);};
const same=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const overlap=(a,b)=>within(a,b)||within(b,a);
const privateParts=new Set(['.git','.local-data','.umibridge-arenas']);
const privateTarget=(root,target)=>relative(root,target).split(/[\\/]/).some(part=>privateParts.has(part.toLowerCase()));
export async function canonicalWorkspacePath(root,value,{allowRoot=false}={}) {
  if(typeof value!=='string'||!value||value.length>2000||/[\x00-\x1f\x7f]/.test(value)||/^[\\/]{2}[?.]/.test(value))throw Error('invalid_workspace_path');
  const base=resolve(root),target=resolve(base,value);
  if(!within(base,target)||!allowRoot&&same(base,target))throw Error('workspace_path_escape');
  if(process.platform==='win32'&&relative(base,target).split(/[\\/]/).some(part=>/[. ]$|[<>:"|?*]/.test(part)||/^(con|conin\$|conout\$|nul|aux|prn|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)))throw Error('invalid_workspace_path');
  let cursor=parse(target).root;
  for(const part of target.slice(cursor.length).split(/[\\/]/).filter(Boolean)){
    cursor=join(cursor,part);let info;try{info=await lstat(cursor);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(info.isSymbolicLink()||info.isFile()&&info.nlink>1)throw Error('workspace_link_forbidden');
    if(!same(await realpath(cursor),resolve(cursor)))throw Error('workspace_alias_forbidden');
  }
  const baseInfo=await lstat(base);if(!baseInfo.isDirectory())throw Error('workspace_root_invalid');
  return target;
}
const ignored=new Set(['.git','node_modules','.local-data','.umibridge-arenas','.umibridge-corp','.umibridge-projects']);
export async function sourceSnapshot(root) {
  const files=[];let bytes=0;
  async function visit(dir,depth){
    if(depth>24)throw Error('source_snapshot_limit');
    for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      if(ignored.has(entry.name.toLowerCase()))continue;
      const path=await canonicalWorkspacePath(root,join(dir,entry.name));
      const info=await lstat(path);
      if(info.isDirectory())await visit(path,depth+1);
      else if(info.isFile()){
        if(files.length>=2000||info.size>8*1024*1024||(bytes+=info.size)>64*1024*1024)throw Error('source_snapshot_limit');
        files.push({path:relative(root,path).replace(/\\/g,'/'),sha256:hash(await readFile(path))});
      }else throw Error('workspace_special_file');
    }
  }
  await canonicalWorkspacePath(root,'.',{allowRoot:true});await visit(root,0);
  return {sha256:hash(JSON.stringify(files)),files};
}
async function fileHash(file){try{const info=await lstat(file);if(!info.isFile()||info.size>8*1024*1024)throw Error('workspace_file_invalid');return hash(await readFile(file));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function gitConflicts(root){
  // Read the local index through git. Never execute a project script or a hook.
  return new Promise((resolveResult,reject)=>{
    const child=spawn('git',['-c','core.fsmonitor=false','-C',root,'ls-files','-u','-z'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});
    let count=0,error='';const timer=setTimeout(()=>{child.kill();reject(Error('git_conflict_check_timeout'));},5000);
    child.stdout.on('data',chunk=>count+=chunk.length);child.stderr.on('data',chunk=>{error+=chunk.toString().slice(0,1000);});
    child.on('error',cause=>{clearTimeout(timer);reject(cause);});child.on('close',code=>{clearTimeout(timer);if(code===0)resolveResult(count>0);else if(/not a git repository/i.test(error))resolveResult(false);else reject(Error('git_conflict_check_failed'));});
  });
}
export const scopedToolSpecs=['scope_read_file','scope_write_file','scope_list_directory'].map(name=>({name,
  description:'Protected attempt-scoped workspace operation. scopeToken comes from the assigned task. Read returns sha256; write requires exact expectedHash (null only for a new file). No shell or external workspace access.',
  annotations:{readOnlyHint:name!=='scope_write_file',destructiveHint:name==='scope_write_file',idempotentHint:name!=='scope_write_file',openWorldHint:false},
  inputSchema:{type:'object',additionalProperties:false,properties:{scopeToken:{type:'string'},path:{type:'string'},...(name==='scope_write_file'?{content:{type:'string'},expectedHash:{type:['string','null']}}:{})},required:['scopeToken','path',...(name==='scope_write_file'?['content','expectedHash']:[])]}}));
export async function createWorkspaceExecution(stateDir,{clock=Date.now}={}) {
  const file=join(stateDir,'execution-ledger.json');let state={version:1,leases:[],receipts:[],verifications:[]},queue=Promise.resolve();
  try{if((await lstat(file)).isSymbolicLink())throw Error('execution_store_symlink');state=JSON.parse(await readFile(file,'utf8'));if(state.version!==1||!['leases','receipts','verifications'].every(key=>Array.isArray(state[key])))throw Error('execution_store_invalid');}catch(error){if(error.code!=='ENOENT')throw error;}
  const transaction=fn=>{const result=queue.then(async()=>{const before=structuredClone(state);try{const result=await fn();await atomicJson(file,state);return result;}catch(error){state=before;throw error;}});queue=result.catch(()=>{});return result;};
  const leaseFor=id=>{const lease=state.leases.find(row=>row.id===id);if(!lease)throw Error('lease_not_found');return lease;};
  const publicLease=({tokenHash,observed,source,...row})=>({...structuredClone(row),sourceHash:source?.sha256});
  const receipt=(lease,operation,extra={})=>{
    const row={id:randomUUID(),taskId:lease.taskId,attemptId:lease.attemptId,runId:lease.runId,projectId:lease.projectId,workerId:lease.workerId,at:clock(),operation,...extra};
    state.receipts.push(row);return row;
  };
  return {
    evidence:(id,projectId)=>{const row=state.verifications.find(row=>row.id===id&&row.projectId===projectId);if(!row)throw Error('project_evidence_not_found');return structuredClone(row);},
    snapshot:()=>({leases:state.leases.map(publicLease),receipts:structuredClone(state.receipts.slice(-200)),verifications:structuredClone(state.verifications.slice(-200))}),
    issue:input=>transaction(async()=>{
      if(state.leases.some(row=>row.attemptId===input.attemptId&&row.status==='active'))throw Error('attempt_lease_exists');
      const active=state.leases.filter(row=>row.status==='active');
      if(input.globalLimit&&active.length>=input.globalLimit||input.projectLimit&&active.filter(row=>row.projectId===input.projectId).length>=input.projectLimit)throw Error('execution_capacity_wait');
      if(active.some(row=>row.workerId===input.workerId))throw Error('worker_already_leased');
      const root=await canonicalWorkspacePath(input.root,'.',{allowRoot:true});
      if(await gitConflicts(root))throw Error('workspace_git_conflict');
      const scopes=async values=>{
        if(!Array.isArray(values)||values.length>40)throw Error('invalid_workspace_scope');
        return Promise.all(values.map(value=>canonicalWorkspacePath(root,value,{allowRoot:true})));
      };
      const reads=await scopes(input.readScope),writes=await scopes(input.writeScope);
      if(state.leases.some(row=>row.status==='active'&&row.writes.some(a=>writes.some(b=>overlap(a,b)))))throw Error('workspace_lock_conflict');
      const token=randomBytes(32).toString('base64url'),lease={id:randomUUID(),taskId:input.taskId,attemptId:input.attemptId,runId:input.runId,projectId:input.projectId,workerId:input.workerId,
        root,reads,writes,tokenHash:hash(token),observed:{},status:'active',issuedAt:clock(),heartbeatAt:clock(),progressAt:clock(),expiresAt:clock()+120000,source:await sourceSnapshot(root)};
      state.leases.push(lease);return {id:lease.id,scopeToken:token,expiresAt:lease.expiresAt};
    }),
    heartbeat:(id,{progress=false,sessionId=null}={})=>transaction(()=>{
      const lease=leaseFor(id);if(lease.status!=='active')return {ignored:true};
      lease.heartbeatAt=clock();lease.expiresAt=clock()+120000;if(progress)lease.progressAt=clock();if(sessionId)lease.sessionId=String(sessionId).slice(0,100);return publicLease(lease);
    }),
    release:(id,reason)=>transaction(()=>{const lease=leaseFor(id);lease.status='released';lease.releasedAt=clock();lease.releaseReason=reason;lease.observed={};lease.source={sha256:lease.source.sha256,files:[]};return publicLease(lease);}),
    health:id=>{const lease=leaseFor(id);return lease.status!=='active'?'released':clock()>lease.expiresAt?'disconnected':clock()-lease.progressAt>10*60_000?'stalled':'connected';},
    execute:(name,args)=>transaction(async()=>{
      const lease=state.leases.find(row=>row.tokenHash===hash(String(args.scopeToken||''))&&row.status==='active');
      if(!lease||clock()>lease.expiresAt)throw Error('scope_lease_expired');
      if(!scopedToolSpecs.some(tool=>tool.name===name))throw Error('scoped_operation_forbidden');
      const write=name==='scope_write_file',target=await canonicalWorkspacePath(lease.root,args.path,{allowRoot:name==='scope_list_directory'});
      if(privateTarget(lease.root,target))throw Error('workspace_private_path');
      if(!(write?lease.writes:lease.reads).some(scope=>within(scope,target)))throw Error('workspace_scope_denied');
      if(write){
        if(await gitConflicts(lease.root))throw Error('workspace_git_conflict');
        if(typeof args.content!=='string'||Buffer.byteLength(args.content)>2*1024*1024)throw Error('workspace_content_invalid');
        const current=await fileHash(target);
        if(current!==args.expectedHash||current!==null&&lease.observed[target]!==current)throw Error('workspace_stale_read');
        await mkdir(dirname(target),{recursive:true});await canonicalWorkspacePath(lease.root,target);
        // Exclusive create protects new files. Existing writes require a fresh read/CAS.
        const handle=await open(target,current===null?'wx':'r+');
        try{
          if(current!==null&&hash(await handle.readFile())!==current)throw Error('workspace_stale_read');
          const buffer=Buffer.from(args.content);let offset=0;
          while(offset<buffer.length){const {bytesWritten}=await handle.write(buffer,offset,buffer.length-offset,offset);if(!bytesWritten)throw Error('workspace_short_write');offset+=bytesWritten;}
          await handle.truncate(buffer.length);await handle.sync();
        }finally{await handle.close();}
        const next=hash(args.content);lease.observed[target]=next;lease.progressAt=clock();
        const row=receipt(lease,'write_file',{path:relative(lease.root,target),sha256:next,exitCode:0});return {ok:true,sha256:next,receiptId:row.id};
      }
      if(name==='scope_list_directory'){
        const entries=await readdir(target,{withFileTypes:true});return entries.filter(row=>!privateParts.has(row.name.toLowerCase())).slice(0,500).map(row=>({name:row.name,type:row.isSymbolicLink()?'blocked':row.isDirectory()?'directory':'file'}));
      }
      const info=await lstat(target);if(!info.isFile()||info.size>2*1024*1024)throw Error('workspace_file_invalid');
      const contents=await readFile(target),sha256=hash(contents);lease.observed[target]=sha256;lease.progressAt=clock();
      const row=receipt(lease,'read_file',{path:relative(lease.root,target),sha256,exitCode:0});return {text:contents.toString('utf8'),sha256,receiptId:row.id};
    }),
    verify:(id,{artifacts=[],criteria=[{type:'artifact'}],command=null}={})=>transaction(async()=>{
      const lease=leaseFor(id);if(lease.status!=='active')throw Error('lease_not_active');
      if(await gitConflicts(lease.root))throw Error('workspace_git_conflict');
      const sourceBefore=await sourceSnapshot(lease.root),files=[];
      const changedRead=await Promise.all(Object.entries(lease.observed).map(async([path,expected])=>(await fileHash(await canonicalWorkspacePath(lease.root,path)))!==expected));
      const sourceMap=new Map(sourceBefore.files.map(row=>[row.path,row.sha256]));
      const changedOutsideScope=lease.source.files.some(row=>!lease.writes.some(scope=>within(scope,resolve(lease.root,row.path)))&&sourceMap.get(row.path)!==row.sha256)
        ||sourceBefore.files.some(row=>!lease.writes.some(scope=>within(scope,resolve(lease.root,row.path)))&&!lease.source.files.some(old=>old.path===row.path));
      if(changedRead.some(Boolean)||changedOutsideScope){
        const row={id:randomUUID(),projectId:lease.projectId,runId:lease.runId,taskId:lease.taskId,attemptId:lease.attemptId,workerId:lease.workerId,at:clock(),files:[],checks:[],sourceHash:sourceBefore.sha256,status:'stale',reason:'workspace_changed_during_task'};
        state.verifications.push(row);return structuredClone(row);
      }
      if(!Array.isArray(artifacts)||artifacts.length>80||!Array.isArray(criteria)||!criteria.length||criteria.length>40)throw Error('invalid_verification');
      for(const path of artifacts){const target=await canonicalWorkspacePath(lease.root,path);if(privateTarget(lease.root,target)||!lease.reads.some(scope=>within(scope,target)))throw Error('workspace_scope_denied');const sha256=await fileHash(target);if(!sha256)throw Error('evidence_artifact_missing');files.push({path,sha256});}
      const checks=[];
      for(const criterion of criteria){
        if(criterion.type==='artifact')checks.push({type:'artifact',pass:files.length>0});
        else if(criterion.type==='json'){
          const target=await canonicalWorkspacePath(lease.root,criterion.path);if(privateTarget(lease.root,target)||!lease.reads.some(scope=>within(scope,target)))throw Error('workspace_scope_denied');
          const content=await readFile(target);if(content.length>2*1024*1024)throw Error('evidence_file_too_large');JSON.parse(content.toString());checks.push({type:'json',path:criterion.path,pass:true});
        }else if(criterion.type==='command'){
          // Only local admin supplies a command plan. Model reports never execute code.
          const plan=criterion.name?command?.[criterion.name]:command;
          if(!plan||typeof plan.executable!=='string'||!isAbsolute(plan.executable)||!Array.isArray(plan.args)||plan.args.length>50||plan.args.some(arg=>typeof arg!=='string'||arg.length>2000))throw Error('verification_command_approval_required');
          const result=await new Promise((resolveResult,reject)=>{
            const child=spawn(plan.executable,plan.args,{cwd:lease.root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
            const timer=setTimeout(()=>{
              if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill('SIGKILL');
              resolveResult({command:structuredClone(plan),exitCode:null,stdout,stderr,timedOut:true,pass:false});
            },30000);
            child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString()).slice(-32000);});child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-32000);});
            child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',exitCode=>{clearTimeout(timer);resolveResult({command:structuredClone(plan),exitCode,stdout,stderr,pass:exitCode===0});});
          });checks.push({type:'command',name:criterion.name??null,...result,testPassed:result.exitCode===0,pass:criterion.requireSuccess===false?result.exitCode!==null:result.pass});
          if(result.timedOut)break;
        }else throw Error('unknown_acceptance_criterion');
      }
      const sourceAfter=await sourceSnapshot(lease.root),row={id:randomUUID(),projectId:lease.projectId,runId:lease.runId,taskId:lease.taskId,attemptId:lease.attemptId,workerId:lease.workerId,at:clock(),files,checks,sourceHash:sourceBefore.sha256,
        status:sourceBefore.sha256!==sourceAfter.sha256?'stale':checks.every(row=>row.pass)?'verified':'failed'};
      state.verifications.push(row);receipt(lease,'verification',{verificationId:row.id,status:row.status});return structuredClone(row);
    }),
    checkEvidence:(id,root)=>transaction(async()=>{
      const row=state.verifications.find(row=>row.id===id);if(!row)throw Error('evidence_not_found');
      if(row.checks.some(check=>check.type!=='artifact')&&(await sourceSnapshot(root)).sha256!==row.sourceHash)row.status='stale';
      for(const artifact of row.files)if(await fileHash(await canonicalWorkspacePath(root,artifact.path))!==artifact.sha256)row.status='stale';
      return structuredClone(row);
    }),
    close:()=>queue,
  };
}
