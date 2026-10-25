import {randomUUID} from 'node:crypto';
export function createProjectLifecycle({projects,clock=Date.now,onDeleted=async()=>{}}={}){
  const tickets=new Map();
  const find=input=>{const project=projects().find(row=>row.channel===input.channel&&row.id===input.id);if(!project?.projectId||!/^g-p-[a-f0-9]{32}$/.test(project.projectId))throw Error('owned_project_not_found');return project;};
  const prune=()=>{for(const [id,row] of tickets)if(clock()-row.createdAt>30*60_000)tickets.delete(id);};
  const snapshot=()=>{prune();return [...tickets.values()].map(({createdAt,...row})=>structuredClone(row));};
  return {
    snapshot,
    prepare(input){
      prune();const project=find(input);if(project.busy)throw Error('pause_project_before_delete');
      if(!['delete-project','delete-chats','delete-chat'].includes(input.action))throw Error('invalid_project_lifecycle_action');
      const chats=project.chats||[];
      const selected=input.action==='delete-chat'?chats.filter(chat=>chat.chatId===input.chatId):chats;
      if(input.action!=='delete-project'&&!selected.length)throw Error('owned_chat_not_found');
      const targets=input.action==='delete-project'?[{projectId:project.projectId,projectName:project.name,url:`https://chatgpt.com/g/${project.projectId}/project`}]:selected.map(chat=>({projectId:project.projectId,chatId:chat.chatId,name:chat.name,url:`https://chatgpt.com/g/${project.projectId}/c/${chat.chatId}`}));
      const ticket=randomUUID(),row={ticket,channel:project.channel,id:project.id,action:input.action,projectId:project.projectId,projectName:project.name,targets,status:'prepared',createdAt:clock(),expiresAt:new Date(clock()+300000).toISOString(),confirmation:`DELETE ${project.projectId}`,preserves:['local_product','git_history'],current:0};
      if(tickets.size>=100)throw Error('lifecycle_capacity');tickets.set(ticket,row);return structuredClone(row);
    },
    confirm(input){const row=tickets.get(input.ticket);if(!row||clock()-row.createdAt>300000)throw Error('lifecycle_ticket_expired');if(input.confirmation!==row.confirmation)throw Error('lifecycle_confirmation_required');if(row.status!=='prepared')return structuredClone(row);const project=find(row);if(project.busy)throw Error('pause_project_before_delete');if(project.projectId!==row.projectId||row.targets.some(target=>target.chatId&&!project.chats.some(chat=>chat.chatId===target.chatId)))throw Error('lifecycle_scope_changed');row.status='queued';return structuredClone(row);},
    poll(){prune();const row=[...tickets.values()].find(item=>item.status==='queued');if(!row)return null;if(clock()-row.createdAt>300000){row.status='expired';return null;}row.status='dispatching';return {channel:row.channel,ticket:row.ticket,action:row.action,index:row.current,target:structuredClone(row.targets[row.current])};},
    authorize(input){const row=tickets.get(input.ticket),target=row?.targets[row.current];let project;try{project=row&&find(row);}catch{}return {allowed:Boolean(row&&project&&!project.busy&&project.projectId===row.projectId&&(!target?.chatId||project.chats?.some(chat=>chat.chatId===target.chatId))&&row.status==='dispatching'&&clock()-row.createdAt<=300000&&input.index===row.current&&input.projectId===target.projectId&&(target.chatId||null)===(input.chatId||null))};},
    async report(input){const row=tickets.get(input.ticket);if(!row||row.status!=='dispatching'||input.index!==row.current)throw Error('lifecycle_stale_attempt');if(input.status==='done'){row.status='recording';try{await onDeleted({channel:row.channel,id:row.id,action:row.action,...structuredClone(row.targets[row.current])});row.current++;row.status=row.current===row.targets.length?'done':'queued';}catch{row.status='blocked';row.reason='deletion_metadata_unconfirmed';}}else if(input.status==='awaiting_user'){row.status='awaiting_user';}else{row.status='blocked';row.reason=String(input.reason||'delete_unconfirmed').slice(0,120);}return {ok:true};},
  };
}
