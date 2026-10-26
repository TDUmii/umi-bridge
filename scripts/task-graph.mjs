// Additive task schema. Legacy steps keep their IDs, attempts and original ordering.
export const taskSchemaVersion = 2;
export const inFlight = task => ['dispatching','running','limit_wait'].includes(task.status) || task.status === 'blocked' && ['send_unconfirmed','response_timeout','restart_reconcile','browser_unavailable'].includes(task.reason);
export function normalizeTasks(run, {legacy = false} = {}) {
  run.taskSchema = taskSchemaVersion;
  for (const [index,task] of run.steps.entries()) {
    task.taskId = task.id; task.runId = run.id; task.projectId ??= run.projectId ?? run.workspaceId ?? run.id;
    task.roleId ??= task.role || 'worker'; task.attemptId = task.attempt;
    task.dependencies ??= index ? [run.steps[index-1].id] : [];
    task.priority ??= 0; task.readScope ??= ['.']; task.writeScope ??= ['.'];
    task.acceptanceCriteria ??= [{type:'artifact'}]; task.retryPolicy ??= {maxAttempts:3,automatic:false};
    task.timeoutMs ??= ['engineering','contestant'].includes(task.roleId)?45*60000:['qa','security','judge'].includes(task.roleId)?30*60000:20*60000;
    task.timestamps ??= {createdAt:run.createdAt}; task.evidenceRefs ??= []; task.attemptHistory ??= [];
    // A historical text report is never retroactively certified by migration.
    task.verification ??= task.status === 'done' ? (legacy ? 'legacy_completed' : 'pending') : 'unverified';
    task.errorReason = task.reason ?? null;
  }
  validateGraph(run.steps); return run;
}
export function validateGraph(tasks) {
  if (!Array.isArray(tasks) || tasks.length > 1000) throw Error('invalid_task_graph');
  const byId = new Map(tasks.map(task => [task.id,task]));
  if (byId.size !== tasks.length || tasks.some(task => typeof task.id !== 'string' || !task.id)) throw Error('duplicate_task_id');
  const marks = new Map();
  function visit(task) {
    if (marks.get(task.id) === 1) throw Error('task_dependency_cycle');
    if (marks.get(task.id) === 2) return;
    if (!Array.isArray(task.dependencies) || new Set(task.dependencies).size !== task.dependencies.length || !Number.isSafeInteger(task.priority ?? 0) || Math.abs(task.priority ?? 0)>1000) throw Error('invalid_task_dependencies');
    marks.set(task.id,1);
    for (const id of task.dependencies) { if (!byId.has(id)) throw Error('task_dependency_missing'); visit(byId.get(id)); }
    marks.set(task.id,2);
  }
  for (const task of tasks) visit(task);
  return true;
}
export const dependencyVerified = task => task.status === 'done' && task.verification === 'verified';
export function dependencyState(task, tasks) {
  const dependencies = task.dependencies.map(id => tasks.find(item => item.id === id));
  if (dependencies.some(item => !item || ['failed','cancelled'].includes(item.status) || item.reason === 'dependency_failed')) return 'failed';
  return dependencies.every(dependencyVerified) ? 'ready' : 'waiting';
}
export function readyTasks(run) {
  return run.steps.filter(task => task.status === 'queued' && dependencyState(task,run.steps) === 'ready')
    .sort((a,b) => b.priority-a.priority || run.steps.indexOf(a)-run.steps.indexOf(b));
}
export function scheduleRuns(runs, {globalLimit=4,projectLimit=2,cursor=null,occupiedChats=[]}={}) {
  const busy = runs.flatMap(run => run.steps.filter(inFlight).map(task => ({run,task})));
  const chats = new Set([...occupiedChats,...busy.map(row=>row.task.chatId)]), counts = new Map();
  for (const {run} of busy) { const key=run.projectId||run.id; counts.set(key,(counts.get(key)||0)+1); }
  let slots = Math.max(0,globalLimit-busy.length);
  const eligible=runs.filter(run=>run.status==='running'), start=Math.max(0,eligible.findIndex(run=>run.id===cursor)+1)%Math.max(1,eligible.length);
  const ordered=[...eligible.slice(start),...eligible.slice(0,start)], selected=[];
  // Round robin grants each project one slot before granting its next slot.
  for (let pass=0; slots && pass<globalLimit; pass++) {
    let added=false;const servedProjects=new Set();
    for (const run of ordered) {
      const key=run.projectId||run.id; if (servedProjects.has(key)||(counts.get(key)||0)>=projectLimit) continue;
      const task=readyTasks(run).find(task=>!chats.has(task.chatId)&&!selected.some(row=>row.task.id===task.id));
      if (!task) continue;
      selected.push({run,task});servedProjects.add(key);chats.add(task.chatId);counts.set(key,(counts.get(key)||0)+1);slots--;added=true;
      if (!slots) break;
    }
    if (!added) break;
  }
  return selected;
}
export function graphHealth(run) {
  for (const task of run.steps.filter(task=>task.status==='queued')) if (dependencyState(task,run.steps)==='failed') {task.status='blocked';task.reason='dependency_failed';}
  const pending=run.steps.filter(task=>!['done','cancelled','failed'].includes(task.status));
  return {ready:readyTasks(run).length,active:run.steps.filter(inFlight).length,
    blocked:pending.filter(task=>['blocked','reported_complete'].includes(task.status)).length,
    waiting:pending.filter(task=>task.status==='queued'&&dependencyState(task,run.steps)==='waiting').length,
    deadlocked:pending.length>0&&!readyTasks(run).length&&!run.steps.some(inFlight)&&!pending.some(task=>['blocked','reported_complete'].includes(task.status))};
}
