import {modelCatalog,modelPreference} from './browser-models.mjs';
import {reviewTeams,productProfiles,reviewConfig} from './corp-review-teams.mjs';
import { mkdir, readFile, writeFile, rename, lstat, realpath, access, open, unlink, rmdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { countTextTokens } from './local-admin.mjs';
import { companyRoles, staffRoles, deliveryOrder, ideaStages, suggestCompanyTeam, buildIdeaWorkflow, readIdeaReport, arenaRubric } from './corp-company.mjs';

const hash = value => createHash('sha256').update(String(value)).digest();
const copy = value => structuredClone(value);
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const active = step => !['done', 'cancelled'].includes(step.status);
export const validateParentRoot = value => {
  if (typeof value !== 'string' || !value || value.length > 1500 || !isAbsolute(value) || /[\x00-\x1f\x7f-\x9f]/.test(value) || /^[\\/]{2}[?.][\\/]/.test(value)) throw Error('invalid_parent_root');
  if (process.platform === 'win32' && (!/^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/i.test(value) || /[<>"|?*]/.test(value) || /:/.test(value.replace(/^[a-z]:/i,'')) || value.split(/[\\/]+/).some(part => /[. ]$/.test(part) && !['.','..'].includes(part) || /^(?:con|conin\$|conout\$|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)))) throw Error('invalid_parent_root');
  return resolve(value);
};
const chatId = value => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['chatgpt.com', 'chat.openai.com'].includes(url.hostname) || url.port || url.username || url.password) throw Error('invalid_chat_url');
  const match = url.pathname.match(/(?:^|\/)c\/([a-zA-Z0-9-]+)\/?$/);
  if (!match) throw Error('invalid_chat_url');
  return { id: match[1], url: url.origin + url.pathname.replace(/\/$/, '') };
};

// Parse only a provider UI notice supplied by the browser adapter, never assistant prose.
export function parseResetDelay(value) {
  const source = String(value ?? '').toLowerCase().replace(/\u00a0/g, ' ').trim();
  if (!source || source.length > 1000) return null;
  const match = source.match(/(?:\bin\s+|\bsau\s+|\b)(?:(\d{1,3})\s*(?:hours?|hrs?|h|giờ)\s*)?(?:(\d{1,3})\s*(?:minutes?|mins?|m|phút)\b)/u)
    ?? source.match(/\b(\d{1,3})\s*(?:hours?|hrs?|h|giờ)\b/u);
  if (!match) return null;
  const minutes = Number(match[1] || 0) * 60 + Number(match[2] || 0);
  return minutes > 0 && minutes <= 7 * 24 * 60 ? minutes * 60_000 : null;
}

export async function createCorpRuntime(filePath, { workspaces, createWorkspace, syncProject, projectsRoot = join(homedir(),'Documents','UmiBridge Projects'), clock = Date.now } = {}) {
  await mkdir(dirname(filePath), { recursive: true });
  let state = { schema: 1, enabled: false, office: true, autoResume: true, tokenHash: null, runs: [], events: [] };
  try {
    if ((await lstat(filePath)).isSymbolicLink()) throw Error('corp_store_symlink');
    const saved = JSON.parse(await readFile(filePath, 'utf8'));
    if (saved.schema !== 1 || !Array.isArray(saved.runs) || !Array.isArray(saved.events)) throw Error('corp_store_invalid');
    state = saved;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if(state.modelSurface!=='chat'){state.modelSurface='chat';state.modelCatalog=[];state.modelScan=null;}
  state.autoResume ??= true;
  state.usage = Array.isArray(state.usage) ? state.usage : [];
  state.teams = Array.isArray(state.teams) ? state.teams : [];
  state.bootstraps = Array.isArray(state.bootstraps) ? state.bootstraps : [];
  // Arena state is additive so older Corp stores remain readable.
  state.arenas = Array.isArray(state.arenas) ? state.arenas : [];
  const arenasBeforeMigration = JSON.stringify(state.arenas);
  for (const arena of state.arenas) {
    arena.format ??= 'knockout'; arena.groups ??= []; arena.history ??= [];
    // Saved decisions remain historical evidence even when the global event ring has rolled over.
    for (const round of arena.rounds) for (const match of round.matches) {
      match.stage ??= 'knockout'; match.round ??= round.number;
      if (match.status === 'done' && !arena.history.some(row => row.type === 'match_completed' && row.matchId === match.id))
        arena.history.push({id:randomUUID(),type:'match_completed',at:match.completedAt ?? null,matchId:match.id,stage:match.stage,round:round.number,leftId:match.leftId,rightId:match.rightId,winnerId:match.winnerId,decision:copy(match.decision),recovered:true});
    }
  }
  const recordUsage = (run, step, status = 'pending') => {
    if (!step.sent || !step.pendingUsage) return;
    let row = state.usage.find(item => item.id === step.attempt);
    if (!row) {
      row = { id: step.attempt, timestamp: new Date(step.issuedAt).toISOString(), provider: 'chatgpt', clientName: 'ChatGPT Corp',
        toolName: 'chat_turn', chatId: step.chatId, title: run.title, usage: { ...step.pendingUsage, outputTokens: null, outputBytes: 0, estimated: true, method: 'o200k_base', partial: true } };
      state.usage.push(row); state.usage = state.usage.slice(-5000);
    }
    row.status = status;
    if (status === 'ok') {
      row.usage.outputTokens = countTextTokens(step.result);
      row.usage.outputBytes = Buffer.byteLength(step.result);
      row.usage.partial = row.usage.inputTokens === null || row.usage.outputTokens === null;
      row.durationMs = Math.max(0, clock() - step.issuedAt);
    }
  };
  let queue = Promise.resolve(), lastSeen = 0, connectedChats = [], extensionVersion = null;
  const bootstrapSupported=()=>{const version=extensionVersion?.split('.').map(Number);return !!version&&(version[0]>0||version[1]>=3);};
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  const save = async () => {
    const temp = `${filePath}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, filePath);
  };
  const transaction = fn => serial(async () => {
    const before = copy(state), rollbacks = [];
    try { const result = await fn(cleanup => rollbacks.push(cleanup)); if (JSON.stringify(state) !== JSON.stringify(before)) await save(); return result; }
    catch (error) { state = before; for (const cleanup of rollbacks.reverse()) { try { await cleanup(); } catch {} } throw error; }
  });
  const event = (type, run, step, extra = {}) => {
    state.events.push({ id: randomUUID(), type, runId: run.id, stepId: step?.id, at: new Date(clock()).toISOString(), ...extra });
    state.events = state.events.slice(-200);
  };
  const find = id => { const run = state.runs.find(item => item.id === id); if (!run) throw Error('run_not_found'); return run; };
  const current = run => run.steps.find(active);
  const inScope = (run, step) => {
    if (!run.workspaceId) return true; // Existing standalone-chat runs retain their saved scope.
    const workspace = workspaces().find(item => item.id === run.workspaceId && item.kind === 'project');
    const arena = run.arenaId ? state.arenas.find(item => item.id === run.arenaId) : null;
    return Boolean(workspace && workspace.projectId === run.projectId && step.workspaceId === workspace.id && workspace.chats.some(chat => chat.chatId === step.chatId) && (!arena || arena.team.every(member => workspace.chats.some(chat => chat.chatId === member.chatId))));
  };
  const bootstrapRoles=job=>[...companyRoles,...(job.mode==='plan'?[]:reviewTeams.filter(team=>(job.reviewTeams||[]).includes(team.id)).map(team=>({...team,brief:team.checks})))];
  const summary = () => ({ enabled: state.enabled, office: state.office, autoResume: state.autoResume, resetGeneration:state.resetGeneration||null, modelSurface:'chat',modelPreference:state.modelPreference??null,modelCatalog:copy(state.modelCatalog||[]),modelScan:copy(state.modelScan||null),
    paired: Boolean(state.tokenHash), connected: lastSeen > 0 && clock() - lastSeen < 45_000,
    lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null, connectedChats: [...connectedChats],extensionVersion,
    runs: copy(state.runs), events: copy(state.events), teams:copy(state.teams), companyRoles:copy(companyRoles),reviewTeams:copy(reviewTeams),productProfiles:copy(productProfiles), deliveryOrder:[...deliveryOrder],
    ideaStages:ideaStages.map(({id,roleId,title,requiresPass})=>({id,roleId,title,requiresPass:requiresPass===true})),
    ideaProjects:workspaces().filter(project=>project.kind==='project').map(project=>suggestCompanyTeam(project,state.teams.find(team=>team.workspaceId===project.id)?.members)),bootstraps:copy(state.bootstraps),arenas:state.arenas.map(arena => ({...copy(arena),matches:copy(arenaMatches(arena))})),projectsRoot });
  const authenticate = token => {
    if (!state.tokenHash || !token || token.length > 200 || !timingSafeEqual(Buffer.from(state.tokenHash, 'hex'), hash(token))) throw Error('invalid_corp_key');
  };
  const newAttempt = step => { step.attempt = randomUUID(); step.sent = false; step.issuedAt = null; step.status = 'queued'; step.reason = null; };
  const arenaRunCount = arena => arena.count + (arena.format === 'group_knockout' ? arena.count * 2 + arena.count / 5 * 2 - 1 : arena.count - 1);
  const reservedArenaRuns = (excludeKey) => state.arenas.filter(arena => !['done','cancelled'].includes(arena.status)).reduce((sum,arena) => sum + Math.max(0,arenaRunCount(arena)-state.runs.filter(run=>run.arenaId===arena.id).length),0) + state.bootstraps.filter(job=>job.kind==='arena'&&!['done','cancelled'].includes(job.status)&&job.id!==excludeKey&&!state.arenas.some(arena=>arena.requestKey===job.id)).reduce((sum,job)=>sum+arenaRunCount(job),0);
  const createRun = (input, options = {}) => {
    const customerName=text(input.customerName,80);
    let requestDigest;
    if(input.requestKey!==undefined){
      if(typeof input.requestKey!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestKey))throw Error('invalid_run_request');
      requestDigest=hash(JSON.stringify({title:text(input.title,180)||'Nhiệm vụ Corp',...(customerName?{customerName}:{}),workspaceId:input.workspaceId||null,steps:Array.isArray(input.steps)?input.steps.map(step=>({workspaceId:step.workspaceId,chatId:step.chatId||null,role:text(step.role,80),prompt:text(step.prompt,options.arena?20000:12000)})):input.steps})).toString('hex');
      const existing=state.runs.find(run=>run.requestKey===input.requestKey);
      if(existing){if(existing.requestDigest!==requestDigest)throw Error('run_request_conflict');return existing;}
    }
    if (state.runs.length >= 2100 || !options.arena && (state.runs.filter(run => !run.arenaId).length >= 100 || state.runs.length + reservedArenaRuns() >= 2100)) throw Error('corp_run_capacity');
    if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > (options.idea?32:12)) throw Error('invalid_steps');
    const known = workspaces();
    const run = { id:randomUUID(),title:text(input.title,180)||'Nhiệm vụ Corp',...(customerName?{customerName}:{}),status:'paused',createdAt:new Date(clock()).toISOString(),steps:[], ...(options.arena ? {arenaId: options.arena.id, arenaKind: options.kind, arenaRound: options.round, arenaMatchId: options.matchId, arenaCandidateId: options.candidateId} : {}) };
    if (input.workspaceId) {
      const project=known.find(item=>item.id===input.workspaceId&&item.kind==='project');
      if(!project)throw Error('project_not_found');run.workspaceId=project.id;run.projectId=project.projectId;
    }
    run.steps=input.steps.map(item=>{
      const workspace=known.find(row=>row.id===item.workspaceId);if(!workspace)throw Error('workspace_not_found');
      if(workspace.kind==='project'&&run.workspaceId!==workspace.id||run.workspaceId&&workspace.id!==run.workspaceId)throw Error('chat_outside_project');
      const member=workspace.kind==='project'?workspace.chats.find(row=>row.chatId===item.chatId):workspace;if(!member)throw Error('chat_not_in_project');
      const chat=chatId(member.chatUrl),prompt=text(item.prompt,options.arena||options.idea ? 20000 : 12000);if(!prompt)throw Error('prompt_required');
      if (options.arena && (typeof item.prompt !== 'string' || item.prompt.trim().length > 20000)) throw Error('invalid_prompt');
      return {id:randomUUID(),workspaceId:workspace.id,...(run.projectId?{projectId:run.projectId}:{}),chatId:chat.id,chatUrl:chat.url,
        role:text(item.role,80)||member.name,prompt,status:'queued',attempt:randomUUID(),sent:false,issuedAt:null,resetAt:null,limitText:null,result:null,reason:null};
    });
    if(input.requestKey!==undefined)Object.assign(run,{requestKey:input.requestKey,requestDigest});
    state.runs.push(run);event('created',run);return run;
  };
  const createIdeaRun = input => {
    const config=reviewConfig(input);
    if(typeof input.requestKey!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestKey))throw Error('invalid_idea_request');
    const existing=state.runs.find(run=>run.idea?.requestKey===input.requestKey);
    if(existing){
      if(existing.workspaceId!==input.workspaceId||existing.idea.text!==String(input.idea||'').trim()||existing.idea.mode!==(input.mode||'build')||(existing.customerName||'')!==text(input.customerName,80)||JSON.stringify(reviewConfig(existing.idea))!==JSON.stringify(config))throw Error('idea_request_conflict');
      return existing;
    }
    if(input.start===true&&!state.enabled)throw Error('enable_corp_first');
    const project=workspaces().find(item=>item.id===input.workspaceId&&item.kind==='project');
    const stateTeamBefore=state.teams.find(team=>team.workspaceId===project?.id)?.members;
    const plan=buildIdeaWorkflow({project,members:stateTeamBefore,idea:input.idea,mode:input.mode,requestKey:input.requestKey,...config});
    const run=createRun({...plan,customerName:input.customerName},{idea:true});run.idea={...plan.idea,repairRounds:1};
    run.steps.forEach((step,index)=>Object.assign(step,{stage:plan.steps[index].stage,title:plan.steps[index].title,roleId:plan.steps[index].roleId,requiresPass:plan.steps[index].requiresPass}));
    state.teams=state.teams.filter(team=>team.workspaceId!==project.id);state.teams.push({workspaceId:project.id,members:[...(stateTeamBefore||[]).filter(member=>project.chats.some(chat=>chat.chatId===member.chatId)&&staffRoles.some(role=>role.id===member.roleId)&&!plan.team.some(row=>row.chatId===member.chatId)),...plan.team]});
    if(input.start!==false&&state.enabled){run.status='running';event('start',run,run.steps[0]);}return run;
  };
  const arenaForRun = run => run?.arenaId ? state.arenas.find(arena => arena.id === run.arenaId) : null;
  const arenaMatches = arena => [...(arena.groups ?? []).flatMap(group => group.matches), ...arena.rounds.flatMap(round => round.matches)];
  const arenaHistory = (arena, type, fields = {}) => {
    arena.updatedAt = new Date(clock()).toISOString();
    arena.history.push({id:randomUUID(),type,at:arena.updatedAt,...Object.fromEntries(Object.entries(fields).filter(([,value]) => value !== undefined))});
  };
  const arenaCurrentRun = arena => state.runs.find(run => run.id === arena.activeRunId);
  const markArenaBlocked = (run, reason) => {
    const arena = arenaForRun(run); if (!arena || ['done', 'cancelled'].includes(arena.status)) return;
    arena.status = 'paused'; arena.reason = reason; run.status = 'paused';
    const candidate = arena.candidateRuns.find(item => item.runId === run.id);
    if (candidate) { candidate.status = 'blocked'; candidate.reason = reason; }
    const match = arenaMatches(arena).find(item => item.judgeRunId === run.id);
    if (match) { match.status = 'blocked'; match.reason = reason; }
    arenaHistory(arena,'blocked',{runId:run.id,matchId:match?.id,reason});
  };
  const scopedFiles = async (root, paths) => {
    if (!Array.isArray(paths) || !paths.length || paths.length > 20) throw Error('arena_evidence_invalid');
    let actualRoot; try {actualRoot=await realpath(root);} catch {throw Error('arena_evidence_invalid');}
    for (const path of paths) {
      if (typeof path !== 'string' || !path.trim() || path.length > 2000) throw Error('arena_evidence_invalid');
      const target = resolve(root, path), delta = relative(root, target);
      if (!delta || delta === '..' || delta.startsWith('..\\') || delta.startsWith('../') || isAbsolute(delta)) throw Error('arena_evidence_invalid');
      let metadata, actual;
      try { metadata = await lstat(target); actual = await realpath(target); } catch { throw Error('arena_evidence_invalid'); }
      const realDelta = relative(actualRoot, actual);
      if (!metadata.isFile() || !metadata.size || metadata.isSymbolicLink() || realDelta === '..' || realDelta.startsWith('..\\') || realDelta.startsWith('../') || isAbsolute(realDelta)) throw Error('arena_evidence_invalid');
    }
  };
  const readArenaDecision = async (result, arena, match) => {
    const source = String(result).trim(), marker = 'UMI_ARENA_RESULT:', index = source.lastIndexOf(marker);
    let value; try { value = JSON.parse(source.slice(index + marker.length).trim()); } catch { throw Error('arena_decision_invalid'); }
    const ids = [match.leftId, match.rightId];
    if (index < 0 || !value || !ids.includes(value.winner) || typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 2000 ||
      !Array.isArray(value.scores) || value.scores.length !== 2 || new Set(value.scores.map(score => score?.candidateId)).size !== 2 ||
      value.scores.some(score => !ids.includes(score?.candidateId) || !Number.isFinite(score.score) || score.score < 0 || score.score > 100 || typeof score.reason !== 'string' || !score.reason.trim() || score.reason.length > 2000) ||
      !Array.isArray(value.checks) || !value.checks.length || value.checks.length > 40 || value.checks.some(check => !ids.includes(check?.candidateId) || typeof check.name !== 'string' || !check.name.trim() || !['pass','fail'].includes(check.status) || typeof check.evidence !== 'string' || !check.evidence.trim() || check.evidence.length > 2000)) throw Error('arena_decision_invalid');
    const winner = value.scores.find(score => score.candidateId === value.winner), loser = value.scores.find(score => score.candidateId !== value.winner);
    if (winner.score < loser.score || winner.score === loser.score && (typeof value.tieBreak !== 'string' || !value.tieBreak.trim() || value.tieBreak.length > 2000)) throw Error('arena_decision_invalid');
    if (arena.rubricVersion === 1) for (const score of value.scores) {
      if (!Array.isArray(score.criteria) || score.criteria.length !== arenaRubric.length || new Set(score.criteria.map(item => item?.id)).size !== arenaRubric.length ||
        arenaRubric.some(criterion => !score.criteria.some(item => item?.id === criterion.id && Number.isFinite(item.score) && item.score >= 0 && item.score <= criterion.max && typeof item.reason === 'string' && item.reason.trim() && item.reason.length <= 2000)) ||
        Math.abs(score.criteria.reduce((sum,item) => sum + item.score,0) - score.score) > 0.000001) throw Error('arena_decision_invalid');
    }
    for (const id of ids) {
      const checks = value.checks.filter(check => check.candidateId === id);
      if (!checks.length) throw Error('arena_decision_invalid');
      for (const check of checks) await scopedFiles(arena.candidateRuns.find(candidate => candidate.id === id).root, check.artifacts);
    }
    return value;
  };
  const createArenaRound = (arena, ids) => {
    const round = {number: arena.rounds.length + 1, stage:'knockout', inputIds: [...ids], outputIds: [], matches: []};
    for (let index = 0; index < ids.length; index += 2) {
      const leftId = ids[index], rightId = ids[index + 1] ?? null;
      round.matches.push({id:randomUUID(),stage:'knockout',round:round.number,slot:index / 2 + 1,leftId,rightId,status:rightId ? 'queued' : 'bye',winnerId:rightId ? null : leftId,judgeRunId:null,decision:null,reason:null});
    }
    arena.rounds.push(round); return round;
  };
  const updateArenaStandings = arena => {
    for (const group of arena.groups) {
      const rows = group.candidateIds.map(candidateId => ({candidateId,played:0,wins:0,losses:0,points:0,scoreFor:0,scoreAgainst:0,scoreDifference:0}));
      for (const match of group.matches.filter(item => item.status === 'done')) for (const row of rows.filter(item => [match.leftId,match.rightId].includes(item.candidateId))) {
        row.played++; row.wins += Number(match.winnerId === row.candidateId); row.losses += Number(match.winnerId !== row.candidateId);
        row.scoreFor += match.decision.scores.find(score => score.candidateId === row.candidateId).score;
        row.scoreAgainst += match.decision.scores.find(score => score.candidateId !== row.candidateId).score;
      }
      for (const row of rows) { row.points = row.wins * 3; row.scoreDifference = row.scoreFor - row.scoreAgainst; }
      rows.sort((a,b) => b.points-a.points || b.scoreDifference-a.scoreDifference || b.scoreFor-a.scoreFor || group.candidateIds.indexOf(a.candidateId)-group.candidateIds.indexOf(b.candidateId));
      group.status = group.matches.every(match => match.status === 'done') ? 'done' : group.matches.some(match => match.status !== 'queued') ? 'running' : 'queued';
      group.qualifiedIds = group.status === 'done' ? rows.slice(0,2).map(row => row.candidateId) : [];
      group.standings = rows.map((row,index) => ({...row,rank:index+1,qualified:group.qualifiedIds.includes(row.candidateId)}));
    }
  };
  const createArenaGroups = arena => {
    for (let index = 0; index < arena.candidateRuns.length; index += 5) {
      const group = {id:randomUUID(),label:`Bảng ${index / 5 + 1}`,candidateIds:arena.candidateRuns.slice(index,index+5).map(candidate => candidate.id),matches:[],standings:[],qualifiedIds:[],status:'queued',tieBreak:'Điểm trận (3 điểm/trận thắng), hiệu số điểm chấm, tổng điểm chấm, thứ tự hạt giống ban đầu.'};
      for (let left = 0; left < group.candidateIds.length; left++) for (let right = left + 1; right < group.candidateIds.length; right++)
        group.matches.push({id:randomUUID(),stage:'group',groupId:group.id,round:1,slot:group.matches.length+1,leftId:group.candidateIds[left],rightId:group.candidateIds[right],status:'queued',winnerId:null,judgeRunId:null,decision:null,reason:null});
      arena.groups.push(group);
    }
    updateArenaStandings(arena);
  };
  const arenaJudgePrompt = (arena, match, round) => {
    const candidates = [match.leftId, match.rightId].map(id => arena.candidateRuns.find(candidate => candidate.id === id));
    return `Bạn là giám khảo theo vai trò trong cùng đội Arena ${match.stage === 'group' ? arena.groups.find(group => group.id === match.groupId).label : 'vòng loại trực tiếp ' + round.number}, trận ${match.slot}. Không sửa source hoặc tự tạo bằng chứng. Ý tưởng và tiêu chí gốc giống nhau cho mọi ứng viên:\n<user_idea>\n${arena.idea}\n</user_idea>\n\n${candidates.map(candidate => `ID: ${candidate.id}; ${candidate.label}; thư mục: ${candidate.root}; báo cáo: ${candidate.artifacts.join(', ')}`).join('\n')}\nĐọc source và chạy kiểm tra cần thiết trên cả hai sản phẩm. Dùng cùng rubric 0-100: ${arenaRubric.map(item => `${item.id}: ${item.label} tối đa ${item.max}`).join('; ')}. Điểm score phải bằng tổng năm criteria, mỗi criteria cần reason giải thích dựa trên bằng chứng. Nếu thiếu công cụ hoặc bằng chứng không đọc được, báo blocked; không ép chọn người thắng. Chỉ chọn một trong hai ID. Điểm bằng nhau cần tieBreak giải thích. Kết thúc bằng JSON ngoài code fence:\nUMI_ARENA_RESULT: {"winner":"${candidates[0].id}","summary":"Lý do","scores":[${candidates.map(candidate => JSON.stringify({candidateId:candidate.id,score:80,reason:'Giải thích theo rubric',criteria:arenaRubric.map(item => ({id:item.id,score:item.max*0.8,reason:'Kết quả kiểm tra tiêu chí'}))})).join(',')}],"checks":[${candidates.map(candidate => `{"candidateId":"${candidate.id}","name":"Kiểm tra sản phẩm","status":"pass","evidence":"Lệnh, kết quả quan sát","artifacts":["đường dẫn bằng chứng trong thư mục ứng viên"]}`).join(',')}]}\nstatus chỉ pass hoặc fail; không dùng unverified. Mỗi ứng viên cần ít nhất một check và tệp bằng chứng thật, không rỗng. Báo cáo không hợp lệ sẽ dừng Arena.`;
  };
  const createArenaCandidate = async (arena, candidate) => {
    const project = workspaces().find(item => item.id === arena.workspaceId && item.kind === 'project');
    if (!project) throw Error('project_not_found');
    await mkdir(candidate.root, {recursive:true});
    const plan = buildIdeaWorkflow({project,members:arena.team,idea:arena.idea,mode:'build',requestKey:candidate.id,rootOverride:candidate.root,
      variantInstructions:`Arena: ${candidate.label}, phương án ${candidate.index}/${arena.count}. Hướng thiết kế độc lập: ${candidate.approach}. Phải tạo sản phẩm local hoạt động, khác biệt có ý nghĩa về giải pháp; số thứ tự hoặc đổi tên không tạo khác biệt. Giữ cùng yêu cầu và tiêu chí nghiệm thu gốc. Chỉ đọc/sửa trong thư mục ứng viên này, không đọc phương án khác.`});
    const run = createRun({...plan,title:`${arena.title} - ${candidate.label}`}, {arena,kind:'candidate',candidateId:candidate.id});
    run.idea = {...plan.idea,arenaId:arena.id,candidateId:candidate.id,repairRounds:1};
    run.steps.forEach((step,index) => Object.assign(step,{stage:plan.steps[index].stage,title:plan.steps[index].title,roleId:plan.steps[index].roleId,requiresPass:plan.steps[index].requiresPass || ['repair','docs'].includes(plan.steps[index].stage)}));
    candidate.runId = run.id; return run;
  };
  const advanceArena = async arena => {
    if (!arena || arena.status !== 'running' || !state.enabled) return;
    const project = workspaces().find(item => item.id === arena.workspaceId && item.kind === 'project' && item.projectId === arena.projectId);
    if (!project || !arena.team.every(member => project.chats.some(chat => chat.chatId === member.chatId))) {
      arena.status = 'paused'; arena.reason = 'chat_outside_project'; const activeRun = arenaCurrentRun(arena); if (activeRun) { const step = current(activeRun); if (step) {step.status='blocked';step.reason='chat_outside_project';} markArenaBlocked(activeRun,'chat_outside_project'); } return;
    }
    let run = arenaCurrentRun(arena);
    // A paused/blocked active run owns the lane until explicitly resumed or retried.
    if (run && run.status !== 'done') {
      if (current(run)?.status === 'blocked') { markArenaBlocked(run, current(run).reason); return; }
      run.status = 'running'; return;
    }
    arena.activeRunId = null;
    if (arena.phase === 'candidates') {
      const candidate = arena.candidateRuns.find(item => item.status !== 'done');
      if (candidate) {
        run = candidate.runId ? find(candidate.runId) : await createArenaCandidate(arena, candidate);
        candidate.status = 'running'; candidate.reason = null; run.status = 'running'; arena.activeRunId = run.id; return;
      }
      if (arena.format === 'group_knockout') { arena.phase = 'groups'; createArenaGroups(arena); }
      else { arena.phase = 'matches'; createArenaRound(arena, arena.candidateRuns.map(candidate => candidate.id)); }
    }
    while (['groups','matches'].includes(arena.phase)) {
      const group = arena.phase === 'groups' ? arena.groups.find(group => group.matches.some(item => item.status === 'queued')) : null;
      const round = arena.phase === 'groups' ? {number:1,matches:arena.groups.flatMap(group => group.matches)} : arena.rounds.at(-1);
      const match = (group?.matches ?? round.matches).find(item => item.status === 'queued');
      if (match) {
        const member = arena.team.find(item => item.roleId === 'ceo');
        const judge = createRun({title:`${arena.title} - ${group?.label ?? 'Vòng ' + round.number} - Trận ${match.slot}`,workspaceId:arena.workspaceId,steps:[{workspaceId:arena.workspaceId,chatId:member.chatId,role:'Arena Judge',prompt:arenaJudgePrompt(arena,match,round)}]}, {arena,kind:'judge',round:round.number,matchId:match.id});
        match.judgeRunId = judge.id; match.status = 'running'; match.startedAt = new Date(clock()).toISOString(); if (group) group.status = 'running'; judge.status = 'running'; arena.activeRunId = judge.id; return;
      }
      if (round.matches.some(item => !['done','bye'].includes(item.status))) return;
      if (arena.phase === 'groups') {
        updateArenaStandings(arena);
        // Pair each group winner with the next group's runner-up; no immediate same-group rematch.
        arena.qualifiedIds = [];
        for (let index = 0; index < arena.groups.length; index += 2) arena.qualifiedIds.push(arena.groups[index].qualifiedIds[0],arena.groups[index+1].qualifiedIds[1],arena.groups[index+1].qualifiedIds[0],arena.groups[index].qualifiedIds[1]);
        arena.phase = 'matches'; arenaHistory(arena,'groups_completed',{qualifiedIds:[...arena.qualifiedIds]}); createArenaRound(arena,arena.qualifiedIds); continue;
      }
      round.outputIds = round.matches.map(item => item.winnerId);
      if (round.outputIds.length === 1) { arena.status = 'done'; arena.winnerId = round.outputIds[0]; arena.completion = new Date(clock()).toISOString(); arena.completedAt = arena.completion; arenaHistory(arena,'finished',{winnerId:arena.winnerId}); event('arena_finished',{id:arena.id}); return; }
      createArenaRound(arena, round.outputIds);
    }
  };
  const createArena = async input => {
    if (typeof input.idea !== 'string' || input.idea.trim().length < 4 || input.idea.trim().length > 8000) throw Error('invalid_arena_idea');
    if (![20,50,100].includes(input.count)) throw Error('invalid_arena_count');
    if ((input.mode ?? 'build') !== 'build') throw Error('invalid_arena_mode');
    if (!['knockout','group_knockout'].includes(input.format ?? 'knockout')) throw Error('invalid_arena_format');
    if (typeof input.requestKey !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestKey)) throw Error('invalid_arena_request');
    const existing = state.arenas.find(item => item.requestKey === input.requestKey);
    if (existing) { if (existing.idea !== input.idea.trim() || existing.count !== input.count || existing.workspaceId !== input.workspaceId || existing.mode !== (input.mode ?? 'build') || existing.format !== (input.format ?? 'knockout')) throw Error('arena_request_conflict'); return existing; }
    if (state.arenas.filter(item => !['done','cancelled'].includes(item.status)).length >= 10 || state.arenas.length >= 100 || state.runs.length + reservedArenaRuns(input.requestKey) + arenaRunCount(input) > 2100) throw Error('corp_arena_capacity');
    const project = workspaces().find(item => item.id === input.workspaceId && item.kind === 'project');
    if (!project) throw Error('project_not_found');
    const team = state.teams.find(item => item.workspaceId === project.id)?.members;
    if (!team || team.length !== companyRoles.length || new Set(team.map(item => item.chatId)).size !== companyRoles.length || companyRoles.some(role => !team.some(item => item.roleId === role.id))) throw Error('missing_company_roles');
    const id = randomUUID(), root = resolve(project.root, '.umibridge-arenas', id);
    // Validate the full workflow before recording metadata or touching candidate directories.
    buildIdeaWorkflow({project,members:team,idea:input.idea,mode:'build',requestKey:input.requestKey,rootOverride:root});
    const approaches = ['ưu tiên luồng tác vụ ngắn và thao tác bàn phím','ưu tiên khả năng tiếp cận và trạng thái dễ hiểu','ưu tiên xử lý offline và dữ liệu người dùng kiểm soát','ưu tiên trực quan hóa và phản hồi tương tác','ưu tiên hiệu năng và ít dependency','ưu tiên hướng dẫn theo từng bước','ưu tiên khả năng tùy chỉnh bằng cấu hình','ưu tiên cộng tác và trao đổi tệp local','ưu tiên tìm kiếm và tổ chức thông tin','ưu tiên phục hồi lỗi và bảo toàn dữ liệu'];
    const strategies = ['cấu trúc đơn giản dựa trên nội dung','cấu trúc theo tác vụ người dùng','cấu trúc theo dòng thời gian','cấu trúc dạng bảng điều khiển','cấu trúc tìm kiếm làm trung tâm','cấu trúc theo mẫu tái sử dụng','cấu trúc theo tiến độ','cấu trúc xem trước trực tiếp','cấu trúc theo bộ sưu tập','cấu trúc theo ngữ cảnh'];
    const arena = {id,requestKey:input.requestKey,workspaceId:project.id,projectId:project.projectId,title:text(input.title,180)||`Arena - ${input.idea.trim().split('\n')[0].slice(0,100)}`,idea:input.idea.trim(),count:input.count,mode:'build',format:input.format ?? 'knockout',rubricVersion:1,rubric:copy(arenaRubric),root,team:copy(team),status:'paused',phase:'candidates',createdAt:new Date(clock()).toISOString(),candidateRuns:[],groups:[],qualifiedIds:[],rounds:[],history:[],activeRunId:null,winnerId:null,completion:null,reason:null};
    for (let index = 0; index < input.count; index++) arena.candidateRuns.push({id:randomUUID(),index:index+1,label:`Ứng viên ${index+1}`,approach:`${approaches[index % 10]}; ${strategies[Math.floor(index / 10)]}`,status:'queued',root:join(root,`candidate-${String(index+1).padStart(3,'0')}`),runId:null,artifacts:[],reason:null});
    arenaHistory(arena,'created',{format:arena.format,count:arena.count}); state.arenas.push(arena); return arena;
  };
  const arenaById = id => { const arena = state.arenas.find(item => item.id === id); if (!arena) throw Error('arena_not_found'); return arena; };
  const bootstrapById=id=>{const job=state.bootstraps.find(item=>item.id===id);if(!job)throw Error('bootstrap_not_found');return job;};
  const projectLink=value=>{
    let url;try{url=new URL(value);}catch{throw Error('invalid_project_url');}
    const match=url.pathname.match(/^\/g\/(g-p-[a-f0-9]{32})(?:-[a-zA-Z0-9_-]+)?\/project\/?$/);
    if(url.protocol!=='https:'||url.hostname!=='chatgpt.com'||url.port||url.username||url.password||url.search||url.hash||!match)throw Error('invalid_project_url');
    return {projectId:match[1],projectUrl:`https://chatgpt.com/g/${match[1]}/project`};
  };
  const createBootstrap = async (input, onRollback) => {
      if(input.chatMode==='temporary')throw Error('temporary_chat_project_unsupported');
      if(!createWorkspace||!syncProject)throw Error('bootstrap_unavailable');if(!state.tokenHash)throw Error('pair_corp_first');
      if(typeof input.idea!=='string'||input.idea.trim().length<4||input.idea.trim().length>8000)throw Error('invalid_idea');
      if(!['build','plan'].includes(input.mode||'build'))throw Error('invalid_idea_mode');
      const config=reviewConfig(input);
      const kind=input.kind||'idea';if(!['idea','arena'].includes(kind))throw Error('invalid_bootstrap_kind');
      if(kind==='arena'&&input.workspaceId!==undefined)throw Error('arena_new_project_required');
      const count=kind==='arena'?input.count:null;if(kind==='arena'&&!([20,50,100].includes(count)))throw Error('invalid_arena_count');
      if(kind==='arena'&&(input.mode||'build')!=='build')throw Error('invalid_arena_mode');
      if(kind==='arena'&&!['knockout','group_knockout'].includes(input.format ?? 'knockout'))throw Error('invalid_arena_format');
      if(typeof input.requestKey!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestKey))throw Error('invalid_idea_request');
      const existing=state.bootstraps.find(job=>job.id===input.requestKey);
      const fallback=input.parentRoot===undefined||input.parentRoot==='';
      const defaultParent=validateParentRoot(projectsRoot);
      const requestedParent=fallback?defaultParent:validateParentRoot(input.parentRoot);
      const useDefault=relative(defaultParent,requestedParent)==='';
      if(existing){
        let parent;try{parent=await realpath(requestedParent);}catch{throw Error('parent_folder_unavailable');}
        const savedParent=existing.parentRoot??await realpath(dirname(existing.root));
        if(existing.idea!==input.idea.trim()||existing.mode!==(input.mode||'build')||(existing.kind||'idea')!==kind||(existing.count??null)!==count||kind==='arena'&&(existing.format??'knockout')!==(input.format??'knockout')||relative(savedParent,parent)!==''||(existing.customerName||'')!==text(input.customerName,80)||JSON.stringify(reviewConfig(existing))!==JSON.stringify(config))throw Error('idea_request_conflict');return copy(existing);
      }
      if(state.bootstraps.length>=100)throw Error('corp_run_capacity');
      if(kind==='arena'&&(state.runs.length+reservedArenaRuns()+arenaRunCount(input)>2100||state.arenas.filter(arena=>!['done','cancelled'].includes(arena.status)).length+state.bootstraps.filter(job=>job.kind==='arena'&&!['done','cancelled'].includes(job.status)).length>=10))throw Error('corp_arena_capacity');
      const base=text(input.name,32)||input.idea.trim().split('\n')[0].slice(0,32).trim(),name=`${base} [UMI-${input.requestKey.slice(0,8)}]`;
      const slug=base.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'project';
      let parentRoot;
      try{
        if(useDefault)await mkdir(requestedParent,{recursive:true});
        parentRoot=await realpath(requestedParent);
        if(!(await lstat(parentRoot)).isDirectory())throw Error('not_directory');
        await access(parentRoot,constants.W_OK);
      }catch{throw Error('parent_folder_unavailable');}
      const root=resolve(parentRoot,`${slug}-${input.requestKey}`);
      try{await mkdir(root);}catch(error){throw Error(error.code==='EEXIST'?'project_folder_exists':'parent_folder_unavailable');}
      const ideaFile=join(root,'UMI-IDEA.md');let ideaCreated=false;
      onRollback(async()=>{
        if(ideaCreated)await unlink(ideaFile).catch(()=>{});
        // Only this attempt's new directory: preserve any other files, including external writes.
        await rmdir(root).catch(()=>{});
      });
      const canonicalRoot=await realpath(root),delta=relative(parentRoot,canonicalRoot);
      if(!delta||delta==='..'||delta.startsWith('..\\')||delta.startsWith('../')||isAbsolute(delta)||(await lstat(root)).isSymbolicLink())throw Error('invalid_parent_root');
      const contents=`# ${name}\n\n${input.idea.trim()}\n`,ideaHandle=await open(ideaFile,'wx');ideaCreated=true;
      try{await ideaHandle.writeFile(contents,'utf8');}finally{await ideaHandle.close();}
      const job={id:input.requestKey,cleanupAfterDelivery:input.cleanupAfterDelivery===true,...config,customerName:text(input.customerName,80),idea:input.idea.trim(),name,parentRoot,root,kind,count,...(kind==='arena'?{format:input.format??'knockout'}:{}),mode:input.mode||'build',runAfterSetup:kind==='arena'?false:input.runAfterSetup!==false,
        status:input.start!==false&&state.enabled?'running':'paused',createdAt:new Date(clock()).toISOString(),projectUrl:null,projectId:null,workspaceId:null,chats:[],attempt:null,issuedAt:null,reason:null,runId:null};
      state.bootstraps.push(job);return copy(job);
  };
  if (JSON.stringify(state.arenas) !== arenasBeforeMigration) await save();
  return {
    snapshot: summary,
    deletedTargets:()=>copy(state.deletedTargets||[]),
    recordDeletion:input=>transaction(()=>{const target={projectId:input.projectId,chatId:input.chatId||null};state.deletedTargets??=[];if(!state.deletedTargets.some(row=>row.projectId===target.projectId&&row.chatId===target.chatId))state.deletedTargets.push({...target,at:new Date(clock()).toISOString()});for(const run of state.runs.filter(row=>row.projectId===target.projectId&&(!target.chatId||row.steps.some(step=>step.chatId===target.chatId))))if(!['done','cancelled'].includes(run.status)){run.status='cancelled';for(const step of run.steps.filter(active)){recordUsage(run,step,'error');step.status='cancelled';step.reason=target.chatId?'chat_deleted':'project_deleted';}event('cancel',run,current(run),{reason:target.chatId?'chat_deleted':'project_deleted'});}return {ok:true};}),
    usage: () => copy(state.usage),
    team: input => transaction(() => {
      const project=workspaces().find(item=>item.id===input.workspaceId&&item.kind==='project');
      if(!project)throw Error('project_not_found');
      if(!Array.isArray(input.members)||input.members.length>100)throw Error('invalid_team');
      const seen=new Set();
      const members=input.members.map(member=>{
        if(!staffRoles.some(role=>role.id===member.roleId)||!project.chats.some(chat=>chat.chatId===member.chatId))throw Error('invalid_team_member');
        if(seen.has(member.chatId))throw Error('duplicate_team_chat');seen.add(member.chatId);
        return {chatId:member.chatId,roleId:member.roleId};
      });
      state.teams=state.teams.filter(team=>team.workspaceId!==project.id);state.teams.push({workspaceId:project.id,members});
      return summary();
    }),
    models:(token,input)=>transaction(()=>{
      authenticate(token);if(input.surface!=='chat')throw Error('invalid_model_surface');if(!state.modelScan||input.id!==state.modelScan.id||state.modelScan.status!=='pending')throw Error('stale_model_scan');
      state.modelCatalog=modelCatalog(input.models||[]);state.modelScan={...state.modelScan,status:input.error?'error':'done',error:text(input.error,100)||null,at:new Date(clock()).toISOString()};return {ok:true};
    }),
    authenticate,
    authorize: (token, input) => serial(() => {
      authenticate(token);
      const run = find(input.runId), step = current(run);
      return { allowed: Boolean(state.enabled && run.status === 'running' && step?.id === input.stepId && step.attempt === input.attempt && inScope(run, step) && (!run.workspaceId || input.chatId === step.chatId && input.projectId === step.projectId) && step.status === 'dispatching' && clock() - step.issuedAt < 90_000) };
    }),
    settings: input => transaction(() => {
      if(input.modelPreference!==undefined)state.modelPreference=modelPreference(input.modelPreference,state.modelCatalog||[]);
      if(input.scanModels===true)state.modelScan={id:randomUUID(),status:'pending',at:new Date(clock()).toISOString()};
      for (const key of ['enabled', 'office', 'autoResume']) if (typeof input[key] === 'boolean') state[key] = input[key];
      return summary();
    }),
    pair: () => transaction(() => { const token = randomBytes(32).toString('base64url'); state.tokenHash = hash(token).toString('hex'); lastSeen = 0; return { token }; }),
    revoke: () => transaction(() => { state.tokenHash = null; state.enabled = false; lastSeen = 0; return summary(); }),
    create: input => transaction(() => copy(createRun(input))),
    idea: input => transaction(() => copy(createIdeaRun(input))),
    arena: input => transaction(onRollback => createBootstrap({...input,kind:'arena'},onRollback)),
    createArena: input => transaction(onRollback => createBootstrap({...input,kind:'arena'},onRollback)),
    arenaAction: (id, action) => transaction(async () => {
      const arena = arenaById(id), run = arenaCurrentRun(arena);
      if (action === 'delete') {
        if (!['done','cancelled'].includes(arena.status)) throw Error('cancel_before_delete');
        state.runs = state.runs.filter(item => item.arenaId !== arena.id);
        state.arenas = state.arenas.filter(item => item.id !== arena.id); return {ok:true};
      }
      if (['done','cancelled'].includes(arena.status)) throw Error('arena_finished');
      if (action === 'start') {
        if (!state.enabled) throw Error('enable_corp_first');
        if (run && current(run)?.status === 'blocked') throw Error('check_chat_before_retry');
        arena.status = 'running'; arena.reason = null; arena.startedAt ??= new Date(clock()).toISOString(); await advanceArena(arena);
      } else if (action === 'pause') {
        arena.status = 'paused'; if (run && run.status === 'running') run.status = 'paused';
      } else if (action === 'retry') {
        const step = run && current(run);
        if (!step || !['blocked','limit_wait'].includes(step.status)) throw Error('retry_not_available');
        if (step.resetAt && clock() < step.resetAt) throw Error('provider_limit_not_reset');
        step.continuation = Boolean(step.continuation || step.sent); newAttempt(step); run.status = 'paused';
        arena.status = 'paused'; arena.reason = null;
        const candidate = arena.candidateRuns.find(item => item.runId === run.id); if (candidate) {candidate.status = 'running'; candidate.reason = null;}
        const match = arenaMatches(arena).find(item => item.judgeRunId === run.id); if (match) {match.status = 'running'; match.reason = null;}
      } else if (action === 'cancel') {
        arena.status = 'cancelled'; arena.reason = null;
        for (const item of state.runs.filter(item => item.arenaId === arena.id && !['done','cancelled'].includes(item.status))) {
          item.status = 'cancelled'; for (const step of item.steps.filter(active)) {recordUsage(item,step,'error');step.status = 'cancelled';}
        }
        for (const candidate of arena.candidateRuns.filter(item => item.status !== 'done')) candidate.status = 'cancelled';
        for (const match of arenaMatches(arena).filter(item => !['done','bye'].includes(item.status))) match.status = 'cancelled';
      } else throw Error('invalid_arena_action');
      arenaHistory(arena,action);
      return copy(arena);
    }),
    bootstrap: input => transaction(onRollback => createBootstrap(input,onRollback)),
    bootstrapAction:(id,action)=>transaction(()=>{
      const job=bootstrapById(id);if(['done','cancelled'].includes(job.status))throw Error('bootstrap_finished');
      if(action==='start'){if(!state.enabled)throw Error('enable_corp_first');job.status='running';job.reason=null;job.issuedAt=null;job.attempt=null;}
      else if(action==='pause')job.status='paused';else if(action==='cancel')job.status='cancelled';else throw Error('invalid_corp_action');return copy(job);
    }),
    bootstrapAuthorize:(token,input)=>serial(()=>{
      authenticate(token);const job=bootstrapById(input.jobId);
      return {allowed:state.enabled&&job.status==='running'&&job.attempt===input.attempt&&job.issuedAt!==null&&clock()-job.issuedAt<120000};
    }),
    bootstrapReport:(token,input)=>transaction(async()=>{
      authenticate(token);const job=bootstrapById(input.jobId);if(job.attempt!==input.attempt)throw Error('stale_attempt');
      if(['done','cancelled'].includes(job.status)||job.issuedAt===null)return {ignored:true};
      if(input.kind==='blocked'){job.status='blocked';job.reason=text(input.reason,150)||'bootstrap_unconfirmed';job.issuedAt=null;return {ok:true};}
      if(input.kind==='project'&&!job.projectId){
        const link=projectLink(input.projectUrl),existing=workspaces().find(item=>item.kind==='project'&&item.projectId===link.projectId);
        if(existing&&(existing.root!==job.root||existing.name!==job.name))throw Error('bootstrap_project_conflict');
        const workspace=existing||await createWorkspace({name:job.name,root:job.root,chatUrl:link.projectUrl});Object.assign(job,link,{workspaceId:workspace.id});
      }else if(input.kind==='chat'&&job.projectId){
        const role=bootstrapRoles(job)[job.chats.length];if(!role||input.roleId!==role.id)throw Error('bootstrap_role_mismatch');
        const chat=chatId(input.chatUrl),path=new URL(chat.url).pathname;
        if(!path.startsWith(`/g/${job.projectId}/c/`)||job.chats.some(item=>item.chatId===chat.id))throw Error('chat_outside_project');
        const chats=[...job.chats,{roleId:role.id,chatId:chat.id,name:role.name,chatUrl:chat.url}];
        const workspace=workspaces().find(item=>item.id===job.workspaceId);if(!workspace)throw Error('project_not_found');
        await syncProject({workspaceId:workspace.id,projectUrl:job.projectUrl,requested:workspace.sync.requested,status:'partial',chats:chats.map(({name,chatUrl})=>({name,chatUrl}))});job.chats=chats;
        if(chats.length===bootstrapRoles(job).length){
          state.teams=state.teams.filter(team=>team.workspaceId!==job.workspaceId);state.teams.push({workspaceId:job.workspaceId,members:chats.map(({chatId,roleId})=>({chatId,roleId}))});
          const created=job.kind==='arena'
            ? await createArena({workspaceId:job.workspaceId,idea:job.idea,count:job.count,mode:job.mode,format:job.format,requestKey:job.id})
            : createIdeaRun({workspaceId:job.workspaceId,customerName:job.customerName,...reviewConfig(job),idea:job.idea,mode:job.mode,requestKey:job.id,start:job.runAfterSetup&&state.enabled&&job.status==='running'});
          if(job.kind==='arena')job.arenaId=created.id;
          job.runId=created.id;job.status='done';
        }
      }else throw Error('invalid_bootstrap_report');
      job.attempt=null;job.issuedAt=null;job.reason=null;return {ok:true};
    }),
    action: (id, action) => transaction(() => {
      const run = find(id), step = current(run);
      if (run.arenaId) throw Error('arena_run_owned');
      if (action === 'delete') {
        if (!['done', 'cancelled'].includes(run.status)) throw Error('cancel_before_delete');
        state.runs = state.runs.filter(item => item !== run); return { ok: true };
      }
      if (['done', 'cancelled'].includes(run.status)) throw Error('run_finished');
      if (action === 'start') {
        if (!state.enabled) throw Error('enable_corp_first');
        if (step?.status === 'blocked') throw Error('check_chat_before_retry');
        run.status = 'running';
      } else if (action === 'pause') run.status = 'paused';
      else if (action === 'cancel') { run.status = 'cancelled'; for (const item of run.steps.filter(active)) { recordUsage(run, item, 'error'); item.status = 'cancelled'; } }
      else if (action === 'retry') {
        if (!step || !['blocked', 'limit_wait'].includes(step.status)) throw Error('retry_not_available');
        if (step.resetAt && clock() < step.resetAt) throw Error('provider_limit_not_reset');
        // Explicit user reconciliation is needed for an ambiguous send; never retry it on a timer.
        step.continuation = Boolean(step.continuation || step.sent); newAttempt(step); run.status = 'paused';
      } else throw Error('invalid_corp_action');
      event(action, run, step); return copy(run);
    }),
    poll: (token, input = {}) => serial(async () => {
      authenticate(token);
      lastSeen = clock();
      extensionVersion=typeof input.extensionVersion==='string'&&/^\d+\.\d+\.\d+$/.test(input.extensionVersion)?input.extensionVersion:null;
      connectedChats = Array.isArray(input.chats) ? input.chats.filter(id => /^[a-zA-Z0-9-]{1,120}$/.test(id)).slice(0, 100) : [];
      const before = copy(state);
      if(input.suppressDispatch)return {monitors:[],command:null,bootstrap:null};
      if(state.modelPreference&&!extensionVersion?.match(/^(?:[1-9]\d*\.|0\.(?:[5-9]|[1-9]\d)\.)/))return {monitors:[],command:null,bootstrap:null};
      const monitors = [];
      let command = null;
      let bootstrap = null;
      try {
        for (const arena of state.arenas.filter(item => item.status === 'running')) await advanceArena(arena);
        for(const job of state.bootstraps){
          if(job.status!=='running')continue;
          if(job.issuedAt!==null){if(clock()-job.issuedAt>120000){job.status='blocked';job.reason='bootstrap_unconfirmed';}continue;}
          if(!state.enabled||bootstrap||!bootstrapSupported())continue;job.attempt=randomUUID();job.issuedAt=clock();const role=bootstrapRoles(job)[job.chats.length];
          bootstrap={jobId:job.id,attempt:job.attempt,type:job.projectId?'bootstrap-chat':'bootstrap-project',projectName:job.name,projectUrl:job.projectUrl,projectId:job.projectId,
            ...(job.projectId?{roleId:role.id,roleName:role.name,seed:`[UmiBridge setup ${job.id}:${role.id}]\nBạn là bộ phận ${role.department}, vai trò ${role.name}. Thư mục dự án local: ${job.root}. Chờ nhiệm vụ riêng do Corp gửi sau. Không tự tạo việc hoặc thao tác tệp lúc khởi tạo. Chỉ trả lời ngắn gọn: UMI_READY ${role.id}.`}:{})};
        }
        // One lane per conversation avoids concurrent writes to the same chat.
        const occupied = new Set(state.runs.flatMap(run => run.steps.filter(step => ['dispatching', 'running', 'limit_wait', 'blocked'].includes(step.status)).map(step => step.chatId)));
        for (const run of state.runs) {
          if (['done', 'cancelled'].includes(run.status)) continue;
          const step = current(run);
          if (!step) continue;
          if (!inScope(run, step)) {
            if (step.status !== 'blocked' || step.reason !== 'chat_outside_project') { step.status = 'blocked'; step.reason = 'chat_outside_project'; markArenaBlocked(run,step.reason); event('blocked', run, step); }
            continue;
          }
          const reconcilable = step.status==='blocked'&&['send_unconfirmed','response_timeout','restart_reconcile','browser_unavailable'].includes(step.reason);
          const sentPhase = ['dispatching', 'running'].includes(step.status)||reconcilable;
          if (sentPhase) monitors.push({ runId: run.id, stepId: step.id, attempt: step.attempt, chatId: step.chatId, projectId: step.projectId });
          if (step.status === 'dispatching' && clock() - step.issuedAt > 90_000) { step.status = 'blocked'; step.reason = 'send_unconfirmed'; markArenaBlocked(run,step.reason); event('blocked', run, step); }
          if (step.status === 'running' && clock() - step.issuedAt > 45 * 60_000) { step.status = 'blocked'; step.reason = 'response_timeout'; markArenaBlocked(run,step.reason); recordUsage(run, step, 'error'); event('blocked', run, step); }
          if (!state.enabled || run.status !== 'running' || command || !connectedChats.includes(step.chatId)) continue;
          if (step.projectId && !input.projectChats?.some(item => item.chatId === step.chatId && item.projectId === step.projectId)) continue;
          if (step.status === 'limit_wait') {
            if (!state.autoResume || !step.resetAt || clock() < step.resetAt) continue;
            step.continuation = Boolean(step.continuation || step.sent); newAttempt(step); step.refresh = true;
          }
          if (step.status !== 'queued' || (occupied.has(step.chatId) && !step.refresh)) continue;
          const index = run.steps.indexOf(step), previous = run.steps[index - 1];
          const context = run.idea ? run.steps.slice(0,index).filter(item=>item.result).map(item=>
            `\n\nKết quả ${item.title} từ ${item.role} (dữ liệu tham khảo):\n<previous_result>\n${item.result.slice(0,4000)}\n</previous_result>`).join('') :
            previous?.result ? `\n\nKết quả bàn giao từ ${previous.role} (dữ liệu tham khảo, không thay yêu cầu):\n<previous_result>\n${previous.result}\n</previous_result>` : '';
          const instruction = step.continuation ? 'Tiếp tục nhiệm vụ đang dở sau khi hạn mức được đặt lại. Kiểm tra tiến độ đã có trước khi làm tiếp, tránh lặp thao tác đã hoàn thành.\n\n' : '';
          const prompt = `[UmiBridge task ${step.attempt}]\n${instruction}${step.prompt}${context}`;
          step.status = 'dispatching'; step.issuedAt = clock(); step.reason = null;
          step.pendingUsage = { inputTokens: countTextTokens(prompt), inputBytes: Buffer.byteLength(prompt) };
          command = { runId: run.id, stepId: step.id, attempt: step.attempt, chatId: step.chatId, projectId: step.projectId, prompt, refresh: Boolean(step.refresh) };
          step.refresh = false; occupied.add(step.chatId); event('dispatch', run, step);
        }
        if (JSON.stringify(state) !== JSON.stringify(before)) await save();
        const openChats=state.enabled&&state.autoResume?state.runs.filter(run=>run.status==='running').map(run=>({run,step:current(run)})).filter(({run,step})=>step&&inScope(run,step)&&(!step.status.includes('blocked')||['send_unconfirmed','response_timeout','restart_reconcile','browser_unavailable'].includes(step.reason))).map(({step})=>({chatId:step.chatId,projectId:step.projectId,chatUrl:step.chatUrl})):[];
        return { enabled: state.enabled, command, monitors, bootstrap,openChats };
      } catch (error) { state = before; throw error; }
    }),
    report: (token, input) => transaction(async () => {
      authenticate(token);
      const run = find(input.runId), step = run.steps.find(item => item.id === input.stepId);
      if (!step || step.attempt !== input.attempt) throw Error('stale_attempt');
      const reconcile=step.status==='blocked'&&['send_unconfirmed','response_timeout','restart_reconcile','browser_unavailable'].includes(step.reason)&&['sent','done'].includes(input.kind);
      if (['done', 'cancelled'].includes(run.status) || !reconcile&&!['dispatching', 'running', 'limit_wait'].includes(step.status)) return { ignored: true };
      if(reconcile){step.status='running';step.reason=null;}
      if (!inScope(run, step)) { step.status = 'blocked'; step.reason = 'chat_outside_project'; markArenaBlocked(run, step.reason); event('blocked', run, step); return { ignored: true }; }
      if (input.kind === 'sent') {
        if (step.status === 'limit_wait') return { ignored: true };
        if (!step.sent) { step.sent = true; step.status = 'running'; recordUsage(run, step); event('sent', run, step); }
      } else if (input.kind === 'limit') {
        if (step.status === 'limit_wait') return { ignored: true };
        step.sent ||= input.sent === true;
        recordUsage(run, step);
        step.limitText = text(input.notice, 1000);
        const delay = parseResetDelay(step.limitText);
        // Relative countdown is anchored once. Polling the same notice must not slide the deadline.
        step.resetAt = delay === null ? null : clock() + delay + 15_000;
        step.status = delay === null ? 'blocked' : 'limit_wait';
        step.reason = delay === null ? 'limit_time_unknown' : 'provider_limit';
        if (delay === null) markArenaBlocked(run,step.reason);
        event('limit', run, step, { resetAt: step.resetAt });
      } else if (input.kind === 'done') {
        if (!input.sent || !text(input.result, 48_000) || step.status === 'limit_wait') return { ignored: true };
        // Older adapters may mistake the provider's load-error placeholder for an answer.
        if (/^(?:không thể tải phản hồi này|unable to load this response|couldn['’]t load this response)[.!]?$/iu.test(input.result.trim())) {
          step.sent=true;recordUsage(run, step, 'error');step.status='blocked';step.reason='response_unavailable';markArenaBlocked(run, step.reason);event('blocked',run,step);return {ok:true};
        }
        step.sent = true; step.result = text(input.result, 48_000);
        if(run.idea){
          try { step.assessment=readIdeaReport(step.result); }
          catch { step.status='blocked';step.reason='idea_report_invalid';run.status='paused';markArenaBlocked(run, step.reason);recordUsage(run,step,'error');event('blocked',run,step);return {ok:true}; }
          const outcome=step.assessment.outcome;
          if(outcome==='blocked'||step.requiresPass&&outcome!=='pass'){
            if(step.stage==='qa-final'&&outcome==='needs_changes'&&run.idea.repairRounds<2){
              const repair=run.steps.find(item=>item.stage==='repair'),round=++run.idea.repairRounds;
              const repeat=template=>{
                const value={...copy(template),id:randomUUID(),result:null,assessment:null,resetAt:null,limitText:null,continuation:false};
                value.title=template.title+` - vòng ${round}`;
                value.prompt=template.prompt.replace(/(07-repair|08-acceptance)\.md/g,`$1-round-${round}.md`)+`\nĐây là vòng sửa bổ sung ${round}. Đọc báo cáo nghiệm thu vừa thất bại và giữ bằng chứng các vòng trước.`;
                newAttempt(value);return value;
              };
              run.steps.splice(run.steps.indexOf(step)+1,0,repeat(repair),repeat(step));event('repair_round',run,step,{round});
            }else{step.status='blocked';step.reason=outcome==='blocked'?'idea_stage_blocked':'idea_quality_failed';run.status='paused';markArenaBlocked(run, step.reason);recordUsage(run,step,'ok');event('blocked',run,step);return {ok:true};}
          }
        }
        const arena = arenaForRun(run);
        if (arena) {
          try {
            if (run.arenaKind === 'candidate' && step.assessment?.outcome === 'pass') await scopedFiles(run.idea.root, step.assessment.artifacts);
            if (run.arenaKind === 'judge') {
              const match = arenaMatches(arena).find(item => item.id === run.arenaMatchId);
              step.assessment = await readArenaDecision(step.result, arena, match);
            }
          } catch (error) {step.status='blocked';step.reason=error.message === 'arena_evidence_invalid' ? error.message : 'arena_decision_invalid';markArenaBlocked(run,step.reason);recordUsage(run,step,'error');event('blocked',run,step);return {ok:true};}
        }
        step.status = 'done'; step.reason = null;
        recordUsage(run, step, 'ok');
        event('done', run, step);
        const next = current(run);
        if (next) event('handoff', run, next, { from: step.chatId, to: next.chatId, task: next.prompt.slice(0, 180) });
        else {
          if (arena && run.arenaKind === 'candidate') {
            const candidate = arena.candidateRuns.find(item => item.runId === run.id);
            const gates = ['plan','repair','qa-final','local-run','docs','delivery'];
            if (gates.some(stage => run.steps.filter(item => item.stage === stage).at(-1)?.assessment?.outcome !== 'pass')) {
              step.status='blocked';step.reason='idea_quality_failed';markArenaBlocked(run,step.reason);return {ok:true};
            }
            candidate.status='done';candidate.reason=null;candidate.artifacts=[...step.assessment.artifacts];candidate.completedAt=new Date(clock()).toISOString();
            arenaHistory(arena,'candidate_completed',{candidateId:candidate.id,runId:run.id,artifacts:[...candidate.artifacts],summary:step.assessment.summary});
          } else if (arena && run.arenaKind === 'judge') {
            const match=arenaMatches(arena).find(item=>item.id===run.arenaMatchId);
            match.winnerId=step.assessment.winner;match.decision=copy(step.assessment);match.status='done';match.reason=null;match.completedAt=new Date(clock()).toISOString();
            arenaHistory(arena,'match_completed',{matchId:match.id,stage:match.stage,groupId:match.groupId,round:match.round,leftId:match.leftId,rightId:match.rightId,winnerId:match.winnerId,decision:copy(match.decision)});
            if (match.stage === 'group') updateArenaStandings(arena);
          }
          run.status='done';event('finished',run);
          if (arena) {run.compacted=true;for(const item of run.steps){delete item.prompt;delete item.result;delete item.pendingUsage;}}
        }
        if (arena && run.status === 'done') await advanceArena(arena);
      } else if (input.kind === 'blocked') {
        step.sent ||= input.sent === true;
        recordUsage(run, step, 'error');
        step.status = 'blocked'; step.reason = ['composer_busy', 'composer_missing', 'send_unconfirmed', 'chat_changed', 'response_too_large', 'response_unavailable','model_selection_unconfirmed','chat_mode_unconfirmed'].includes(input.reason) ? input.reason : 'browser_unavailable';
        markArenaBlocked(run, step.reason);
        event('blocked', run, step);
      } else throw Error('invalid_report');
      return { ok: true };
    }),
    close: () => queue,
  };
}
