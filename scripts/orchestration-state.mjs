import {mkdir,readFile,writeFile,rename,lstat,copyFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {modelPreference} from './browser-models.mjs';

export const featureNames = ['dagSchedulerEnabled','workspaceLocksEnabled','evidenceGateEnabled','workerHealthEnabled','projectMemoryEnabled','capabilityRoutingEnabled'];
export const defaultOrchestration = () => ({version:1,flags:Object.fromEntries(featureNames.map(key=>[key,false])),globalLimit:4,projectLimit:2,routes:{}});
export async function readOrchestrationSettings(stateDir) {
  try {
    const file=join(stateDir,'orchestration-settings.json');
    if ((await lstat(file)).isSymbolicLink()) throw Error('orchestration_settings_symlink');
    const value=JSON.parse(await readFile(file,'utf8'));
    validateSettings(value);return value;
  } catch(error) {if(error.code==='ENOENT')return defaultOrchestration();throw error;}
}
function validateSettings(value) {
  if(value?.version!==1||!value.flags||featureNames.some(key=>typeof value.flags[key]!=='boolean')||Object.keys(value.flags).some(key=>!featureNames.includes(key))||
    !Number.isSafeInteger(value.globalLimit)||value.globalLimit<1||value.globalLimit>16||!Number.isSafeInteger(value.projectLimit)||value.projectLimit<1||value.projectLimit>value.globalLimit||
    !value.routes||typeof value.routes!=='object'||Array.isArray(value.routes)||Object.keys(value.routes).length>100)throw Error('invalid_orchestration_settings');
  if(Object.entries(value.routes).some(([key,row])=>!/^[a-z][a-z0-9_-]{0,79}$/.test(key)||!row||typeof row.model!=='string'||typeof row.effort!=='string'||Object.keys(row).some(key=>!['model','effort'].includes(key))))throw Error('invalid_model_route');
  if(value.flags.dagSchedulerEnabled&&['workspaceLocksEnabled','evidenceGateEnabled','workerHealthEnabled'].some(key=>!value.flags[key]))throw Error('dag_requires_safety_flags');
}
export async function atomicJson(file,value) {
  await mkdir(dirname(file),{recursive:true});
  const temporary=`${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify(value),{mode:0o600});await rename(temporary,file);
}
export async function backupBeforeMigration(file,version) {
  const target=`${file}.before-v${version}.bak`;
  try {await copyFile(file,target,1);}catch(error){if(!['ENOENT','EEXIST'].includes(error.code))throw error;}
  return target;
}
const memoryKinds=['architecture','convention','verified_fix','known_issue','constraint','tested_command','dependency','user_decision'];
export async function createOrchestrationState(stateDir,{clock=Date.now}={}) {
  let settings=await readOrchestrationSettings(stateDir),queue=Promise.resolve();
  const file=join(stateDir,'project-memory.json');let memories={version:1,entries:[]};
  try {if((await lstat(file)).isSymbolicLink())throw Error('memory_store_symlink');memories=JSON.parse(await readFile(file,'utf8'));if(memories.version!==1||!Array.isArray(memories.entries))throw Error('invalid_memory_store');}catch(error){if(error.code!=='ENOENT')throw error;}
  const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  return {
    settings:()=>structuredClone(settings),
    update: input=>serial(async()=>{
      const value={...settings,...input,version:1,flags:{...settings.flags,...input.flags}};
      if(Object.keys(input).some(key=>!['flags','globalLimit','projectLimit','routes'].includes(key)))throw Error('invalid_orchestration_settings');
      validateSettings(value);await backupBeforeMigration(join(stateDir,'orchestration-settings.json'),1);
      await atomicJson(join(stateDir,'orchestration-settings.json'),value);settings=value;return structuredClone(value);
    }),
    route(task,catalog,fallback) {
      if(!settings.flags.capabilityRoutingEnabled)return fallback;
      const route=settings.routes[task.roleId]??settings.routes[task.category];
      // No fallback to a different provider or an unobserved model combination.
      return route ? modelPreference(route,catalog) : fallback;
    },
    memory(projectId,partition='corp') {return structuredClone(memories.entries.filter(row=>row.projectId===projectId&&row.partition===partition));},
    recall(projectId,partition='corp',maxBytes=6000) {
      if(!settings.flags.projectMemoryEnabled)return '';
      const rows=memories.entries.filter(row=>row.projectId===projectId&&row.partition===partition&&row.status==='approved').slice(-20),parts=[];
      let size=0;for(const row of rows){const text=JSON.stringify({id:row.id,kind:row.kind,text:row.text,evidenceRefs:row.evidenceRefs});if(size+Buffer.byteLength(text)>Math.min(12000,maxBytes))break;size+=Buffer.byteLength(text);parts.push(text);}
      return parts.length?`\n<project_memory_data>\n${parts.join('\n')}\n</project_memory_data>`:'';
    },
    memoryChange: (projectId,input,partition='corp')=>serial(async()=>{
      if(typeof projectId!=='string'||!projectId||projectId.length>160||!['corp',...Array.from({length:100},(_,i)=>`candidate-${String(i+1).padStart(3,'0')}`)].includes(partition))throw Error('invalid_memory_scope');
      const before=structuredClone(memories);
      try {
        let row;
        if(input.id){
          row=memories.entries.find(row=>row.projectId===projectId&&row.partition===partition&&row.id===input.id);if(!row)throw Error('memory_not_found');
          if(!({candidate:['reviewed','deprecated'],reviewed:['approved','deprecated'],approved:['deprecated'],deprecated:[]}[row.status]||[]).includes(input.status))throw Error('invalid_memory_transition');
          if(input.status==='approved'&&['verified_fix','tested_command'].includes(row.kind)&&!row.evidenceRefs.length)throw Error('memory_requires_verified_evidence');
          row.status=input.status;row.updatedAt=clock();
        }else{
          if(!memoryKinds.includes(input.kind)||typeof input.text!=='string'||!input.text.trim()||input.text.length>3000||memories.entries.length>=10000||!Array.isArray(input.evidenceRefs)||input.evidenceRefs.length>20||input.evidenceRefs.some(id=>typeof id!=='string'||id.length>160))throw Error('invalid_memory');
          row={id:randomUUID(),projectId,partition,kind:input.kind,text:input.text.trim(),evidenceRefs:input.evidenceRefs,status:'candidate',createdAt:clock()};memories.entries.push(row);
        }
        await atomicJson(file,memories);return structuredClone(row);
      }catch(error){memories=before;throw error;}
    }),
    close:()=>queue,
  };
}
