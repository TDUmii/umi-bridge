import {mkdir, readFile, writeFile, rename, lstat, realpath, open, unlink, rmdir} from 'node:fs/promises';
import {dirname, resolve, join, relative, isAbsolute} from 'node:path';
import {homedir,totalmem,availableParallelism} from 'node:os';
export function recommendArenaCount(memory=totalmem(),cores=availableParallelism()){const gib=memory/1073741824;return gib<8||cores<4?10:gib<16||cores<8?20:gib<32?40:gib<64?60:100;}
import {createHash, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {countTextTokens} from './local-admin.mjs';

// Rubric v2 keeps scoring evidence-based and makes quality dimensions explicit.
// The judge must score every criterion for every candidate. Scores sum to 100.
export const arenaRubricVersion = 2;
const legacyArenaRubric = [
  {id:'requirements',label:'Yêu cầu / chức năng',max:35},
  {id:'ux',label:'Trải nghiệm sử dụng',max:15},
  {id:'evidence',label:'Kiểm thử / bằng chứng',max:20},
  {id:'security',label:'Bảo mật',max:15},
  {id:'delivery',label:'Chạy local / tài liệu',max:15},
];
export const arenaRubric = [
  {id:'requirements',label:'Yêu cầu / chức năng',max:30,guidance:'Đủ chức năng cốt lõi, đúng ý tưởng, xử lý lỗi hợp lý.'},
  {id:'ux',label:'Trải nghiệm / khả năng tiếp cận',max:15,guidance:'Luồng rõ, bàn phím, focus, nhãn, tương phản và giảm chuyển động khi phù hợp.'},
  {id:'evidence',label:'Kiểm thử / bằng chứng',max:20,guidance:'Build, test, run có lệnh, kết quả và tệp bằng chứng quan sát được.'},
  {id:'security',label:'Bảo mật',max:10,guidance:'Không lộ dữ liệu, không thao tác ngoài phạm vi, xử lý input an toàn.'},
  {id:'performance',label:'Hiệu năng / độ ổn định',max:10,guidance:'Đáp ứng nhanh, dùng tài nguyên hợp lý, hoạt động ổn định qua kiểm tra lặp.'},
  {id:'maintainability',label:'Khả năng bảo trì',max:5,guidance:'Cấu trúc rõ, thay đổi an toàn, phụ thuộc và hướng dẫn sửa được nêu.'},
  {id:'delivery',label:'Chạy local / tài liệu',max:10,guidance:'README cho cài đặt, build, test, run; sản phẩm chạy được tại thư mục riêng.'},
];
const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const clean = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const bounded = (value,max=2000) => typeof value==='string' && value.trim().length>0 && value.length<=max;
const outside = (root,target) => {const delta=relative(root,target);return !delta || delta==='..' || delta.startsWith('../') || delta.startsWith('..\\') || isAbsolute(delta);};
const finished = value => ['done','cancelled'].includes(value.status);
const parseReport = (result,marker) => {const index=result.lastIndexOf(marker);if(index<0)throw Error('arena_report_invalid');try{return JSON.parse(result.slice(index+marker.length).trim());}catch{throw Error('arena_report_invalid');}};
const parentPath = value => {
  if(typeof value!=='string'||!isAbsolute(value)||value.length>1500||/[\x00-\x1f\x7f-\x9f]/.test(value)||/^[\\/]{2}[?.][\\/]/.test(value))throw Error('invalid_parent_root');
  if(process.platform==='win32'&&(!/^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/i.test(value)||/[<>"|?*]/.test(value)||/:/.test(value.replace(/^[a-z]:/i,''))||value.split(/[\\/]+/).some(part=>/[. ]$/.test(part)&&!['.','..'].includes(part)||/^(?:con|conin\$|conout\$|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))))throw Error('invalid_parent_root');
  return resolve(value);
};
const projectLink = value => {
  let url;try{url=new URL(value);}catch{throw Error('invalid_project_url');}
  const match=url.pathname.match(/^\/g\/(g-p-[a-f0-9]{32})(?:-[a-zA-Z0-9_-]+)?\/project\/?$/);
  if(url.protocol!=='https:'||url.hostname!=='chatgpt.com'||url.port||url.username||url.password||url.search||url.hash||!match)throw Error('invalid_project_url');
  return {projectId:match[1],projectUrl:`https://chatgpt.com/g/${match[1]}/project`};
};
const scopedChat = (value,projectId) => {
  let url;try{url=new URL(value);}catch{throw Error('chat_outside_project');}
  const match=url.pathname.match(new RegExp(`^/g/${projectId}/c/([a-zA-Z0-9-]{1,120})/?$`));
  if(url.protocol!=='https:'||url.hostname!=='chatgpt.com'||url.port||url.username||url.password||url.search||url.hash||!match)throw Error('chat_outside_project');
  return {chatId:match[1],chatUrl:url.origin+url.pathname.replace(/\/$/,'')};
};

// Every path component is checked: an internal symlink is forbidden even when it resolves inside the root.
async function evidenceFiles(root, paths) {
  if(!Array.isArray(paths)||!paths.length||paths.length>80||new Set(paths).size!==paths.length)throw Error('arena_evidence_invalid');
  const rootStat=await lstat(root).catch(()=>null),canonical=await realpath(root).catch(()=>null);
  if(!rootStat?.isDirectory()||rootStat.isSymbolicLink()||canonical!==resolve(root))throw Error('arena_evidence_invalid');
  let bytes=0;
  const files=[];
  for(const path of paths){
    if(!bounded(path,1500)||isAbsolute(path))throw Error('arena_evidence_invalid');
    const target=resolve(root,path);if(outside(root,target))throw Error('arena_evidence_invalid');
    let current=root;
    for(const part of relative(root,target).split(/[\\/]/)){current=join(current,part);if((await lstat(current).catch(()=>null))?.isSymbolicLink())throw Error('arena_evidence_invalid');}
    const stat=await lstat(target).catch(()=>null),actual=await realpath(target).catch(()=>null);
    if(!stat?.isFile()||!stat.size||stat.size>5*1024*1024||!actual||outside(canonical,actual)||(bytes+=stat.size)>20*1024*1024)throw Error('arena_evidence_invalid');
    const contents=await readFile(target);files.push({path:relative(root,target).replace(/\\/g,'/'),sha256:digest(contents),bytes:contents.length,contents});
  }
  return files;
}

export async function createArenaRuntime(filePath,{projectsRoot=join(homedir(),'Documents','UmiBridge Projects'),clock=Date.now,authenticate:externalAuthenticate,isPaired,projectAllowed=()=>true}={}) {
  await mkdir(dirname(filePath),{recursive:true});
  let state={schema:1,enabled:false,tokenHash:null,arenas:[],bootstraps:[],events:[],usage:[]};
  try{if((await lstat(filePath)).isSymbolicLink())throw Error('arena_store_symlink');state=JSON.parse(await readFile(filePath,'utf8'));if(state.schema!==1||!['arenas','bootstraps','events','usage'].every(key=>Array.isArray(state[key])))throw Error('arena_store_invalid');}catch(error){if(error.code!=='ENOENT')throw error;}
  // Pin legacy tournaments to their original scoring, including queued judge prompts.
  let migrated=false;
  for(const arena of state.arenas){if(!Array.isArray(arena.rubric)){arena.rubricVersion=1;arena.rubric=clone(legacyArenaRubric);migrated=true;}}
  state.autoResume ??= true;
  let queue=Promise.resolve(),lastSeen=0,extensionVersion=null;
  const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  const save=async()=>{const temp=`${filePath}.${process.pid}.tmp`;try{await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,filePath);}catch(error){await unlink(temp).catch(()=>{});throw error;}};
  const transaction=fn=>serial(async()=>{const before=clone(state),rollbacks=[];try{const result=await fn(cleanup=>rollbacks.push(cleanup));if(JSON.stringify(before)!==JSON.stringify(state))await save();return result;}catch(error){state=before;for(const cleanup of rollbacks.reverse())await cleanup().catch(()=>{});throw error;}});
  const now=()=>new Date(clock()).toISOString();
  const paired=()=>externalAuthenticate ? (isPaired ? Boolean(isPaired()) : true) : Boolean(state.tokenHash);
  const authenticate=token=>{if(externalAuthenticate)return externalAuthenticate(token);if(typeof token!=='string'||!state.tokenHash||token.length>200||!timingSafeEqual(Buffer.from(state.tokenHash,'hex'),Buffer.from(digest(token),'hex')))throw Error('invalid_arena_key');};
  const arenaById=id=>{const arena=state.arenas.find(row=>row.id===id);if(!arena)throw Error('arena_not_found');return arena;};
  const jobById=id=>{const job=state.bootstraps.find(row=>row.id===id);if(!job)throw Error('bootstrap_not_found');return job;};
  const history=(arena,type,extra={})=>{const row={id:randomUUID(),arenaId:arena.id,type,at:now(),...extra};arena.history.push(row);state.events.push(row);state.events=state.events.slice(-300);};
  const current=arena=>arena.steps.find(step=>!finished(step));
  const supported=(count=20)=>{if(count>20){const [major,minor]=String(extensionVersion||'').split('.').map(Number);return major>0||minor>=6;}const [major,minor]=String(extensionVersion||'').split('.').map(Number);return major>0||minor>=4;};
  const block=(arena,step,reason)=>{arena.status='paused';arena.reason=reason;if(step){step.status='blocked';step.reason=reason;}history(arena,'blocked',{stepId:step?.id,reason});};
  const usage=(arena,step,status='pending')=>{
    if(!step.sent)return;
    let row=state.usage.find(item=>item.id===step.attempt);
    if(!row){row={id:step.attempt,timestamp:new Date(step.issuedAt).toISOString(),provider:'chatgpt',clientName:'ChatGPT Arena',toolName:'chat_turn',title:arena.title,chatId:step.chatId,usage:{inputTokens:step.inputTokens??null,inputBytes:step.inputBytes??0,outputTokens:null,outputBytes:0,estimated:true,method:'o200k_base',partial:true}};state.usage.push(row);}
    row.status=status;if(status==='ok'){row.usage.outputTokens=countTextTokens(step.result);row.usage.outputBytes=Buffer.byteLength(step.result);row.usage.partial=row.usage.inputTokens===null||row.usage.outputTokens===null;row.durationMs=Math.max(0,clock()-step.issuedAt);}
  };
  const promptProduct=(arena,candidate,round)=>{
    const previous=candidate.versions.at(-1),feedback=candidate.feedback.at(-1);
    return `Bạn là thí sinh AI độc lập ${candidate.label}, dùng model đã chọn và xác minh trong giao diện web. Tự làm TOÀN BỘ sản phẩm hoạt động, từ thiết kế, source, kiểm thử, chạy thực tế đến README; không chia bộ phận hoặc bàn giao cho thí sinh khác. Chỉ thao tác trong thư mục của mình: ${candidate.root}. Không đọc/sao chép sản phẩm đối thủ. Ý tưởng chung:\n<user_idea>\n${arena.idea}\n</user_idea>\n${round>1?`Đây là lần cải tiến trước vòng ${round}. Đọc đầy đủ phản hồi giám khảo vòng trước:\n<judge_feedback>\n${JSON.stringify(feedback)}\n</judge_feedback>\nSửa ít nhất một tệp source theo phản hồi, chạy lại kiểm thử/build/chạy sản phẩm. Giữ nguyên bằng chứng lịch sử ${previous?.snapshotRoot}; không sửa hoặc xóa bản cũ.\n`:''}Tiêu chuẩn nghiệm thu: chức năng đúng yêu cầu; UX và accessibility gồm bàn phím, focus, nhãn, tương phản và giảm chuyển động khi phù hợp; bằng chứng build/test/run thật; bảo mật dữ liệu và input; performance có số đo hoặc quan sát; maintainability có cấu trúc rõ và hướng dẫn sửa; delivery local có thể tái hiện. Nêu giới hạn chưa kiểm chứng, không thay số đo bằng lời khẳng định. Rubric của Arena này: ${arena.rubric.map(row=>`${row.id} ${row.max}`).join("; ")}. Sản phẩm phải có mã nguồn thật, README hướng dẫn cài đặt, build, test và chạy, cùng tệp bằng chứng lệnh/kết quả thực tế. Mỗi check build, test, run phải có command, evidence và artifacts không rỗng trong thư mục của bạn. Không đủ công cụ hoặc chưa chạy được thì báo blocked, không giả hoàn tất. Kết thúc ngoài code fence:\nUMI_ARENA_PRODUCT: {"status":"complete","summary":"Sản phẩm và phần đã kiểm chứng","source":["src/main.ext"],"readme":"README.md","artifacts":["src/main.ext","README.md","evidence/round-${round}.txt"],"checks":[{"name":"build","status":"pass","command":"lệnh thực tế","evidence":"kết quả thực tế","artifacts":["evidence/round-${round}.txt"]},{"name":"test","status":"pass","command":"lệnh thực tế","evidence":"kết quả thực tế","artifacts":["evidence/round-${round}.txt"]},{"name":"run","status":"pass","command":"lệnh thực tế","evidence":"kết quả thực tế","artifacts":["evidence/round-${round}.txt"]}]}`;
  };
  const promptJudge=(arena,round)=>{
    const candidates=round.inputIds.map(id=>arena.candidates.find(row=>row.id===id));
    return `Bạn là giám khảo duy nhất của Arena, vòng ${round.number}. Chấm TẤT CẢ ${candidates.length} sản phẩm độc lập theo cùng ý tưởng và rubric, sau đó chọn ${Math.ceil(candidates.length/2)} sản phẩm mạnh nhất. Không sửa source hoặc tạo bằng chứng thay thí sinh. Ý tưởng:\n<user_idea>\n${arena.idea}\n</user_idea>\n${candidates.map(candidate=>`ID ${candidate.id}; ${candidate.label}; source ${candidate.root}; phiên bản/bằng chứng bất biến ${candidate.versions.at(-1).snapshotRoot}; báo cáo ${JSON.stringify({summary:candidate.versions.at(-1).report.summary,checks:candidate.versions.at(-1).report.checks.map(({name,status,command,evidence,artifacts})=>({name,status,command:command?.slice(0,400),evidence:evidence?.slice(0,600),artifacts}))})}`).join('\n')}\nĐọc source, kiểm tra build/test/run và trải nghiệm thật. Rubric v${arena.rubricVersion} tổng 100: ${arena.rubric.map(row=>`${row.id}: ${row.label} tối đa ${row.max}`).join('; ')}. Công bằng là quy tắc chấm chung, không phải tiêu chí cho điểm sản phẩm: dùng cùng tiêu chí, cùng dữ liệu và cùng mức kiểm tra; không dùng tên, ngôn ngữ, framework, khuyết tật hoặc nguồn gốc làm điểm phạt. Chấm accessibility trong ux: kiểm tra bàn phím, focus, nhãn, tương phản và giảm chuyển động khi phù hợp. Ghi nhận hiệu năng bằng số đo hoặc hành vi quan sát được, và maintainability bằng cấu trúc, hướng dẫn sửa và độ rõ ràng. Cung cấp đầy đủ feedback cụ thể cho MỌI thí sinh: điểm mạnh, lỗi, thay đổi phải làm vòng sau. Mẫu JSON chỉ minh họa một dòng; ranking thực phải có đủ mọi ID thí sinh nêu trên. Mỗi reason/feedback ngắn gọn, chi tiết ghi trong tệp. Ranking giảm dần theo score; score bằng tổng criteria. Chỉ cho sản phẩm hoàn chỉnh với checks pass đi tiếp; thiếu bằng chứng phải blocked, không ép chọn. Mỗi check artifacts là đường dẫn tương đối trong thư mục đúng thí sinh. Hòa điểm tại ranh giới loại phải giải thích tieBreak. Kết thúc JSON ngoài code fence:\nUMI_ARENA_RESULT: {"summary":"Kết quả và lý do","ranking":[${candidates.slice(0,1).map(candidate=>JSON.stringify({candidateId:candidate.id,score:80,feedback:'Điểm mạnh, lỗi cần sửa và cải tiến cụ thể',criteria:arena.rubric.map(row=>({id:row.id,score:row.max*0.8,reason:'Bằng chứng tiêu chí'})),checks:[{name:'Nghiệm thu sản phẩm',status:'pass',evidence:'Lệnh và kết quả quan sát',artifacts:candidate.versions.at(-1).report.checks[0].artifacts}]})).join(',')}],"advance":["các ID đứng đầu đúng số lượng"],"tieBreak":"Lý do nếu hòa tại ranh giới"}`;
  };
  const newStep=(arena,kind,round,candidate)=>{
    const chat=candidate||arena.judge;
    const step={id:randomUUID(),kind,round,candidateId:candidate?.id??null,chatId:chat.chatId,chatUrl:chat.chatUrl,projectId:arena.projectId,status:'queued',attempt:randomUUID(),issuedAt:null,sent:false,result:null,reason:null,prompt:kind==='judge'?promptJudge(arena,arena.rounds.at(-1)):promptProduct(arena,candidate,round)};
    arena.steps.push(step);return step;
  };
  const scheduleProducts=(arena,ids,round)=>{arena.phase=round===1?'build':'revise';for(const id of ids)newStep(arena,round===1?'build':'revise',round,arena.candidates.find(row=>row.id===id));};
  const advance=arena=>{
    if(current(arena)||finished(arena))return;
    const round=arena.rounds.at(-1);
    if(arena.phase==='build'||arena.phase==='revise'){arena.phase='judge';newStep(arena,'judge',round.number);}
  };
  const snapshot=()=>({enabled:state.enabled,autoResume:state.autoResume,paired:paired(),connected:lastSeen>0&&clock()-lastSeen<45000,lastSeen:lastSeen?new Date(lastSeen).toISOString():null,extensionVersion,arenas:clone(state.arenas),bootstraps:clone(state.bootstraps),events:clone(state.events),rubricVersion:arenaRubricVersion,rubric:clone(arenaRubric),capacity:{min:10,max:100,recommended:recommendArenaCount()},projectsRoot});
  // Persisted running intent survives restart; issued attempts are observed, never replayed.
  if(migrated)await save();

  return {
    snapshot,authenticate,
    deletedTargets:()=>clone(state.deletedTargets||[]),
    recordDeletion:input=>transaction(()=>{const target={projectId:input.projectId,chatId:input.chatId||null};state.deletedTargets??=[];if(!state.deletedTargets.some(row=>row.projectId===target.projectId&&row.chatId===target.chatId))state.deletedTargets.push({...target,at:now()});for(const arena of state.arenas.filter(row=>row.projectId===target.projectId)){if(!['done','cancelled'].includes(arena.status)){arena.status='cancelled';arena.reason=target.chatId?'chat_deleted':'project_deleted';for(const step of arena.steps.filter(row=>!finished(row))){usage(arena,step,'error');step.status='cancelled';step.reason=arena.reason;}history(arena,'cancel',{reason:arena.reason});}const job=state.bootstraps.find(row=>row.arenaId===arena.id);if(job&&!finished(job))job.status='cancelled';}return {ok:true};}),
    usage:()=>clone(state.usage),
    settings:input=>transaction(()=>{if(typeof input.enabled==='boolean')state.enabled=input.enabled;if(typeof input.autoResume==='boolean')state.autoResume=input.autoResume;return snapshot();}),
    pair:()=>transaction(()=>{if(externalAuthenticate)throw Error('shared_pairing_managed_by_gateway');const token=randomBytes(32).toString('base64url');state.tokenHash=digest(token);return {token};}),
    revoke:()=>transaction(()=>{state.tokenHash=null;state.enabled=false;lastSeen=0;return snapshot();}),
    create:input=>transaction(async rollback=>{
      if(input.chatMode==='temporary')throw Error('temporary_chat_project_unsupported');
      if(!paired())throw Error('pair_arena_first');
      if(!bounded(input.idea,8000)||input.idea.trim().length<4)throw Error('invalid_idea');
      const count=input.count??20;if(!Number.isInteger(count)||count<10||count>100)throw Error('invalid_arena_count');
      if(input.workspaceId!==undefined||input.mode!==undefined&&input.mode!=='build'||input.format!==undefined&&input.format!=='knockout')throw Error('independent_arena_required');
      if(typeof input.requestKey!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestKey))throw Error('invalid_arena_request');
      const requested=parentPath(input.parentRoot||projectsRoot),existing=state.arenas.find(row=>row.requestKey===input.requestKey);
      if(existing){if(existing.idea!==input.idea.trim()||existing.count!==count||relative(existing.parentRoot,await realpath(requested))!=='')throw Error('arena_request_conflict');return clone(existing);}
      if(state.arenas.filter(row=>!finished(row)).length>=10||state.arenas.length>=100)throw Error('arena_capacity');
      if(relative(parentPath(projectsRoot),requested)==='')await mkdir(requested,{recursive:true});
      const parent=await realpath(requested).catch(()=>{throw Error('parent_folder_unavailable');});if(!(await lstat(parent)).isDirectory())throw Error('parent_folder_unavailable');
      const base=clean(input.name,48)||input.idea.trim().split('\n')[0].slice(0,48),slug=base.normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'arena';
      const root=join(parent,`${slug}-arena-${input.requestKey}`);await mkdir(root).catch(error=>{throw Error(error.code==='EEXIST'?'project_folder_exists':'parent_folder_unavailable');});rollback(()=>rmdir(root));
      if((await lstat(root)).isSymbolicLink()||outside(parent,await realpath(root)))throw Error('invalid_parent_root');
      const ideaFile=join(root,'UMI-ARENA-IDEA.md'),handle=await open(ideaFile,'wx');rollback(()=>unlink(ideaFile));try{await handle.writeFile(`# ${base}\n\n${input.idea.trim()}\n`);}finally{await handle.close();}
      const id=input.requestKey,candidates=[];
      for(let index=1;index<=count;index++){const roleId=`contestant-${String(index).padStart(2,'0')}`,candidateRoot=join(root,roleId);await mkdir(candidateRoot);rollback(()=>rmdir(candidateRoot));candidates.push({id:roleId,roleId,label:`Thí sinh ${String(index).padStart(2,'0')}`,root:candidateRoot,chatId:null,chatUrl:null,status:'waiting',versions:[],feedback:[]});}
      const arena={id,cleanupAfterDelivery:input.cleanupAfterDelivery===true,requestKey:id,title:base,name:`${base.slice(0,30)} [Arena-${id.slice(0,8)}]`,idea:input.idea.trim(),parentRoot:parent,root,count,rubricVersion:arenaRubricVersion,rubric:clone(arenaRubric),status:'setup',phase:'setup',createdAt:now(),projectId:null,projectUrl:null,candidates,judge:null,steps:[],rounds:[],history:[],winnerId:null,reason:null};
      const job={id,arenaId:id,kind:'arena',name:arena.name,root,idea:arena.idea,count,status:input.start!==false&&state.enabled?'running':'paused',projectId:null,projectUrl:null,chats:[],attempt:null,issuedAt:null,reason:null,createdAt:now()};
      state.arenas.push(arena);state.bootstraps.push(job);history(arena,'created');return clone(arena);
    }),
    action:(id,action)=>transaction(()=>{
      const arena=arenaById(id),job=jobById(id),step=current(arena);
      if(action==='delete'){if(!finished(arena))throw Error('cancel_before_delete');state.arenas=state.arenas.filter(row=>row.id!==id);state.bootstraps=state.bootstraps.filter(row=>row.id!==id);return {ok:true};}
      if(finished(arena))throw Error('arena_finished');
      if(action==='setup'){if(!state.enabled)throw Error('enable_arena_first');if(job.status==='done')throw Error('bootstrap_finished');if(job.issuedAt!==null)throw Error('check_browser_before_retry');job.status='running';job.reason=null;}
      else if(action==='start'){arena.manualPaused=false;if(!state.enabled)throw Error('enable_arena_first');if(job.status!=='done')throw Error('arena_setup_required');if(step?.status==='blocked')throw Error('check_chat_before_retry');arena.status='running';arena.reason=null;advance(arena);}
      else if(action==='pause'){arena.manualPaused=true;arena.reason='manual_pause';arena.status=job.status==='done'?'paused':'setup';if(!finished(job))job.status='paused';}
      else if(action==='retry'){
        if(job.status!=='done'){if(!['blocked','paused'].includes(job.status))throw Error('retry_not_available');job.status='paused';job.attempt=null;job.issuedAt=null;job.reason=null;}
        else {if(step?.status!=='blocked')throw Error('retry_not_available');usage(arena,step,'error');Object.assign(step,{status:'queued',attempt:randomUUID(),issuedAt:null,sent:false,result:null,reason:null,continuation:true});arena.status='paused';arena.reason=null;}
      }else if(action==='cancel'){arena.status='cancelled';job.status=finished(job)?job.status:'cancelled';for(const item of arena.steps.filter(row=>!finished(row))){usage(arena,item,'error');item.status='cancelled';}}
      else throw Error('invalid_arena_action');
      history(arena,action);return clone(arena);
    }),
    bootstrapAuthorize:(token,input)=>serial(()=>{authenticate(token);const job=jobById(input.jobId);return {allowed:state.enabled&&job.status==='running'&&job.attempt===input.attempt&&job.issuedAt!==null&&clock()-job.issuedAt<120000};}),
    bootstrapReport:(token,input)=>transaction(()=>{
      authenticate(token);const job=jobById(input.jobId),arena=arenaById(job.arenaId);
      if(job.lastAttempt===input.attempt)return {ignored:true};
      if(job.attempt!==input.attempt)throw Error('stale_attempt');if(finished(job)||job.issuedAt===null)return {ignored:true};
      if(input.kind==='blocked'){job.status='blocked';job.reason=clean(input.reason,150)||'bootstrap_unconfirmed';history(arena,'bootstrap_blocked',{reason:job.reason});return {ok:true};}
      if(input.kind==='project'&&!job.projectId){const link=projectLink(input.projectUrl);if(!projectAllowed(link.projectId)||state.arenas.some(row=>row.id!==arena.id&&row.projectId===link.projectId))throw Error('arena_project_conflict');Object.assign(job,link);Object.assign(arena,link);}
      else if(input.kind==='chat'&&job.projectId){
        const member=arena.candidates[job.chats.length]||{roleId:'judge',label:'Giám khảo'},chat=scopedChat(input.chatUrl,job.projectId);
        if(input.roleId!==member.roleId||job.chats.some(row=>row.chatId===chat.chatId))throw Error('bootstrap_role_mismatch');
        const row={roleId:member.roleId,name:member.label,...chat};job.chats.push(row);
        if(member.roleId==='judge')arena.judge=row;else Object.assign(member,chat);
        if(job.chats.length===arena.count+1){job.status='done';arena.status='paused';arena.phase='build';const ids=arena.candidates.map(row=>row.id);arena.rounds.push({number:1,inputIds:ids,outputIds:[],status:'building',decision:null});scheduleProducts(arena,ids,1);history(arena,'setup_completed',{chatCount:arena.count+1});}
      }else throw Error('invalid_bootstrap_report');
      job.lastAttempt=input.attempt;job.attempt=null;job.issuedAt=null;job.reason=null;return {ok:true};
    }),
    poll:(token,input={})=>transaction(()=>{
      authenticate(token);lastSeen=clock();extensionVersion=/^\d+\.\d+\.\d+$/.test(input.extensionVersion)?input.extensionVersion:null;
      let bootstrap=null,command=null;
      const monitors=[];
      for(const job of state.bootstraps.filter(row=>row.status==='running')){
        if(job.issuedAt!==null){if(clock()-job.issuedAt>=120000){job.status='blocked';job.reason='bootstrap_unconfirmed';}continue;}
        if(!state.enabled||!supported(job.count)||bootstrap||state.bootstraps.some(row=>row.issuedAt!==null&&!finished(row)))continue;
        job.attempt=randomUUID();job.issuedAt=clock();const arena=arenaById(job.arenaId),member=arena.candidates[job.chats.length]||{roleId:'judge',label:'Giám khảo'};
        const marker=`[UmiBridge arena setup ${job.id}:${member.roleId}]`;
        bootstrap={channel:'arena',mode:'arena',jobId:job.id,attempt:job.attempt,type:job.projectId?'bootstrap-chat':'bootstrap-project',projectName:job.name,projectUrl:job.projectUrl,projectId:job.projectId,...(job.projectId?{roleId:member.roleId,roleName:member.label,setupMarker:marker,seed:`${marker}\nBạn là ${member.roleId==='judge'?'giám khảo duy nhất':'thí sinh AI độc lập tự tạo sản phẩm hoàn chỉnh'} trong Arena riêng, không thuộc đội Corp. ${member.root?`Thư mục riêng: ${member.root}.`:''} Chờ nhiệm vụ Arena; không thao tác tệp lúc khởi tạo. Chỉ trả lời UMI_READY ${member.roleId}.`}:{})};
      }
      const inflight=state.arenas.some(arena=>arena.steps.some(step=>['dispatching','running','blocked'].includes(step.status)));
      for(const arena of state.arenas.filter(row=>!finished(row))){
        const step=current(arena);if(!step)continue;
        if(['dispatching','running'].includes(step.status)||step.status==='blocked'&&['send_unconfirmed','response_timeout','restart_reconcile','browser_unavailable'].includes(step.reason)){
          monitors.push({channel:'arena',mode:'arena',arenaId:arena.id,runId:arena.id,stepId:step.id,attempt:step.attempt,chatId:step.chatId,projectId:arena.projectId});
          if(['dispatching','running'].includes(step.status)&&clock()-step.issuedAt>(step.status==='dispatching'?90000:45*60000)){usage(arena,step,'error');block(arena,step,step.status==='dispatching'?'send_unconfirmed':'response_timeout');}
        }
        if(!state.enabled||!supported(arena.count)||arena.status!=='running'||step.status!=='queued'||command||bootstrap||inflight||state.bootstraps.some(row=>row.issuedAt!==null&&!finished(row)))continue;
        // The adapter must attest the exact Project chat; a same-named ordinary chat is insufficient.
        if(!input.chats?.includes(step.chatId)||!input.projectChats?.some(row=>row.chatId===step.chatId&&row.projectId===arena.projectId))continue;
        step.status='dispatching';step.issuedAt=clock();
        const prompt=`[UmiBridge task ${step.attempt}]\n${step.continuation?'Tiếp tục sau đối chiếu thủ công, kiểm tra tiến độ trong chat và tệp trước khi làm tiếp.\n':''}${step.prompt}`;
        step.inputTokens=countTextTokens(prompt);step.inputBytes=Buffer.byteLength(prompt);
        command={channel:'arena',mode:'arena',arenaId:arena.id,runId:arena.id,stepId:step.id,attempt:step.attempt,chatId:step.chatId,projectId:arena.projectId,prompt,kind:step.kind,round:step.round,candidateId:step.candidateId};history(arena,'dispatch',{stepId:step.id,kind:step.kind,candidateId:step.candidateId,round:step.round});
      }
      const openChats=state.enabled&&state.autoResume?state.arenas.filter(row=>row.status==='running'||row.status==='paused'&&!row.manualPaused&&['send_unconfirmed','response_timeout','restart_reconcile','browser_unavailable'].includes(row.reason)).map(current).filter(Boolean).map(step=>({chatId:step.chatId,projectId:step.projectId,chatUrl:step.chatUrl})):[];
      return {enabled:state.enabled,bootstrap,command,monitors,openChats};
    }),
    authorize:(token,input)=>serial(()=>{authenticate(token);const arena=arenaById(input.arenaId||input.runId),step=arena.steps.find(row=>row.id===input.stepId);return {allowed:state.enabled&&arena.status==='running'&&Boolean(step&&step.attempt===input.attempt&&step.status==='dispatching'&&step.issuedAt!==null&&clock()-step.issuedAt<90000)};}),
    report:(token,input)=>transaction(async rollback=>{
      authenticate(token);const arena=arenaById(input.arenaId||input.runId),step=arena.steps.find(row=>row.id===input.stepId);
      if(!step||step.attempt!==input.attempt)throw Error('stale_attempt');
      if(finished(arena)||finished(step))return {ignored:true};
      if(step.status==='blocked'&&['send_unconfirmed','response_timeout','restart_reconcile','browser_unavailable'].includes(step.reason)&&['sent','done'].includes(input.kind)){step.status='dispatching';step.reason=null;if(state.autoResume&&!arena.manualPaused&&arena.reason!=='manual_pause'){arena.status='running';arena.reason=null;}}
      if(input.kind==='sent'){if(step.status==='dispatching'){step.sent=true;step.status='running';usage(arena,step);}return {ok:true};}
      if(input.kind==='blocked'||input.kind==='limit'){step.sent ||= input.sent===true;usage(arena,step,'error');block(arena,step,input.kind==='limit'?'provider_limit':clean(input.reason,150)||'browser_unavailable');return {ok:true};}
      if(input.kind!=='done')throw Error('invalid_report');
      if(!input.sent||!bounded(input.result,240000))return {ignored:true};
      if(!['running','dispatching','blocked'].includes(step.status))return {ignored:true};
      step.sent=true;step.result=input.result.trim();const evidenceCleanups=[];
      const ownedFile=cleanup=>{rollback(cleanup);evidenceCleanups.push(cleanup);};
      try{
        if(step.kind!=='judge'){
          const candidate=arena.candidates.find(row=>row.id===step.candidateId),report=parseReport(step.result,'UMI_ARENA_PRODUCT:');
          if(report.status!=='complete'||!bounded(report.summary)||!Array.isArray(report.source)||!report.source.length||new Set(report.source).size!==report.source.length||report.source.some(path=>!bounded(path,1500)||!report.artifacts?.includes(path)||path===report.readme)||!bounded(report.readme,1500)||!report.artifacts?.includes(report.readme)||!Array.isArray(report.checks)||report.checks.length>20||report.checks.some(check=>!bounded(check.name)||check.status!=='pass'||!bounded(check.command)||!bounded(check.evidence)||!Array.isArray(check.artifacts)||!check.artifacts.length))throw Error('arena_product_incomplete');
          for(const name of ['build','test','run'])if(!report.checks.some(check=>check.name===name&&check.status==='pass'&&bounded(check.command)&&bounded(check.evidence)&&Array.isArray(check.artifacts)&&check.artifacts.length))throw Error('arena_product_incomplete');
          const allPaths=[...new Set([...report.artifacts,...report.checks.flatMap(check=>check.artifacts||[])])],files=await evidenceFiles(candidate.root,allPaths);
          const readme=files.find(file=>file.path===report.readme)?.contents.toString('utf8')||'';
          if(!/(?:run|start|chạy|khởi động)/iu.test(readme)||!/(?:test|kiểm thử)/iu.test(readme)||!/(?:build|biên dịch|đóng gói)/iu.test(readme))throw Error('arena_readme_incomplete');
          if(step.kind==='revise'&&!report.source.some(path=>files.find(file=>file.path===path)?.sha256!==candidate.versions.at(-1).files.find(file=>file.path===path)?.sha256))throw Error('arena_revision_unchanged');
          const evidenceParent=join(arena.root,'evidence'),candidateParent=join(evidenceParent,candidate.id),snapshotRoot=join(candidateParent,`round-${step.round}`);
          for(const directory of [evidenceParent,candidateParent]){try{await mkdir(directory);ownedFile(()=>rmdir(directory));}catch(error){if(error.code!=='EEXIST')throw error;}if((await lstat(directory)).isSymbolicLink()||!((await lstat(directory)).isDirectory())||outside(arena.root,await realpath(directory)))throw Error('arena_evidence_invalid');}
          await mkdir(snapshotRoot);ownedFile(()=>rmdir(snapshotRoot));
          for(let index=0;index<files.length;index++){const file=files[index],snapshotPath=join(snapshotRoot,`${String(index).padStart(3,'0')}.bin`),handle=await open(snapshotPath,'wx');ownedFile(()=>unlink(snapshotPath));try{await handle.writeFile(file.contents);}finally{await handle.close();}file.snapshotPath=snapshotPath;delete file.contents;}
          const version={round:step.round,createdAt:now(),snapshotRoot,files,report:clone(report)};
          const manifestPath=join(snapshotRoot,'manifest.json'),manifestText=JSON.stringify(version,null,2),manifest=await open(manifestPath,'wx');ownedFile(()=>unlink(manifestPath));try{await manifest.writeFile(manifestText);}finally{await manifest.close();}version.manifestSha256=digest(manifestText);
          candidate.versions.push(version);candidate.status='complete';history(arena,step.kind==='build'?'product_completed':'product_revised',{candidateId:candidate.id,round:step.round,version:clone(version)});
        }else{
          const round=arena.rounds.at(-1),decision=parseReport(step.result,'UMI_ARENA_RESULT:'),ids=round.inputIds,n=Math.ceil(ids.length/2);
          if(!bounded(decision.summary)||!Array.isArray(decision.ranking)||decision.ranking.length!==ids.length||new Set(decision.ranking.map(row=>row?.candidateId)).size!==ids.length||!Array.isArray(decision.advance)||decision.advance.length!==n)throw Error('arena_decision_invalid');
          for(let index=0;index<decision.ranking.length;index++){
            const row=decision.ranking[index],candidate=arena.candidates.find(item=>item.id===row.candidateId);
            if(!ids.includes(row.candidateId)||!Number.isFinite(row.score)||row.score<0||row.score>100||!bounded(row.feedback,8000)||!Array.isArray(row.criteria)||row.criteria.length!==arena.rubric.length||new Set(row.criteria.map(item=>item?.id)).size!==arena.rubric.length||arena.rubric.some(criterion=>!row.criteria.some(item=>item.id===criterion.id&&Number.isFinite(item.score)&&item.score>=0&&item.score<=criterion.max&&bounded(item.reason)))||Math.abs(row.criteria.reduce((sum,item)=>sum+item.score,0)-row.score)>0.000001||index>0&&decision.ranking[index-1].score<row.score||!Array.isArray(row.checks)||!row.checks.length||row.checks.length>20)throw Error('arena_decision_invalid');
            for(const check of row.checks){if(!bounded(check.name)||!['pass','fail'].includes(check.status)||!bounded(check.evidence))throw Error('arena_decision_invalid');await evidenceFiles(candidate.root,check.artifacts);}
            const version=candidate.versions.at(-1),archived=await evidenceFiles(version.snapshotRoot,version.files.map(file=>relative(version.snapshotRoot,file.snapshotPath))),[manifest]=await evidenceFiles(version.snapshotRoot,['manifest.json']);
            if(manifest.sha256!==version.manifestSha256||archived.some((file,index)=>file.sha256!==version.files[index].sha256))throw Error('arena_history_changed');
            const liveFiles=await evidenceFiles(candidate.root,version.files.map(file=>file.path));
            if(liveFiles.some((file,index)=>file.sha256!==version.files[index].sha256))throw Error('arena_product_changed');
            if(index<n&&row.checks.some(check=>check.status!=='pass'))throw Error('arena_winner_incomplete');
          }
          if(decision.advance.some((id,index)=>id!==decision.ranking[index].candidateId)||decision.ranking[n-1].score===decision.ranking[n]?.score&&!bounded(decision.tieBreak))throw Error('arena_decision_invalid');
          round.status='done';round.outputIds=[...decision.advance];round.decision=clone(decision);round.completedAt=now();
          for(const row of decision.ranking){const candidate=arena.candidates.find(item=>item.id===row.candidateId);candidate.feedback.push({round:round.number,...clone(row)});candidate.status=decision.advance.includes(candidate.id)?'advancing':'eliminated';}
          history(arena,'round_completed',{round:round.number,decision:clone(decision)});
          if(n===1){arena.status='done';arena.phase='done';arena.winnerId=decision.advance[0];arena.completedAt=now();history(arena,'champion',{candidateId:arena.winnerId});}
          else {const next={number:round.number+1,inputIds:[...decision.advance],outputIds:[],status:'revising',decision:null};arena.rounds.push(next);scheduleProducts(arena,next.inputIds,next.number);}
        }
      }catch(error){for(const cleanup of evidenceCleanups.reverse())await cleanup().catch(()=>{});usage(arena,step,'error');block(arena,step,error.message.startsWith('arena_')?error.message:'arena_evidence_invalid');return {ok:true,blocked:true,reason:arena.reason};}
      step.status='done';step.completedAt=now();step.reason=null;arena.reason=null;usage(arena,step,'ok');advance(arena);return {ok:true};
    }),
    resetMetadata:()=>transaction(()=>{if(state.arenas.some(row=>row.status==='running')||state.bootstraps.some(row=>row.status==='running'))throw Error('pause_arena_before_reset');state.arenas=[];state.bootstraps=[];state.events=[];state.usage=state.usage.map((row,index)=>({...row,id:`arena-history-${index+1}`,chatId:null,title:'Lịch sử Arena'}));state.enabled=false;lastSeen=0;return snapshot();}),
    close:()=>queue,
  };
}
