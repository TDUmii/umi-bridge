(() => {
  const $ = id => document.getElementById(id), section = $('corp'), scene = $('corpScene');
  let data = null, busy = false, signature = '', first = true, corpTab = localStorage.getItem('umibridge.corp.tab') || 'office';
  let ideaSending=false,ideaRequest=null,arenaSending=false,arenaRequest=null,arenaSignature='';
  const arenaActions=new Set();
  const arenaDetails=new Map();
  const arenaHistoryFilters=new Map();
  let focusBootstrap=localStorage.getItem('umibridge.corp.bootstrap');
  const labels = { queued:'Chờ giao việc', dispatching:'Đang gửi', running:'Chờ phản hồi', limit_wait:'Chờ reset hạn mức', blocked:'Cần kiểm tra', paused:'Tạm dừng', done:'Hoàn thành', cancelled:'Đã hủy' };
  const reasons = { send_unconfirmed:'Chưa xác nhận đã gửi. Mở chat kiểm tra trước khi thử lại.', composer_busy:'Chat đang trả lời hoặc còn bản nháp. Corp giữ nguyên bản nháp.', composer_missing:'Chưa thấy ô nhập. Kiểm tra đăng nhập và giao diện chat.', chat_changed:'Chat đã thay đổi hoặc có lượt gửi khác. Kiểm tra trước khi tiếp tục.', browser_unavailable:'Không kết nối được tab chat.', response_timeout:'Chưa xác nhận kết quả sau 45 phút. Mở chat kiểm tra.', response_too_large:'Kết quả vượt 48.000 ký tự. Chia nhiệm vụ nhỏ hơn.', limit_time_unknown:'Có thông báo hạn mức nhưng không đọc được giờ reset. Cần kiểm tra thủ công.' };
  const node = (tag, value, className) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; };
  reasons.response_unavailable = 'ChatGPT không tải được phản hồi. Kiểm tra kết quả công cụ và chat; không tự chạy lại phần đã thực hiện.';
  reasons.idea_report_invalid='Chat trả lời thiếu báo cáo hoặc bằng chứng cần thiết. Mở chat để kiểm tra, sau đó chuẩn bị thử lại.';
  reasons.idea_stage_blocked='Bộ phận báo chưa thể tiếp tục. Xem báo cáo để bổ sung thông tin hoặc kết nối công cụ.';
  reasons.idea_quality_failed='Chặng nghiệm thu chưa đạt. Xem các lỗi và bằng chứng, xử lý trước khi tiếp tục.';
  reasons.arena_decision_invalid='Báo cáo chấm trận chưa hợp lệ. Kiểm tra chat giám khảo trước khi thử lại.';
  reasons.arena_evidence_invalid='Bằng chứng sản phẩm chưa đủ để chấm trận. Kiểm tra tệp và báo cáo.';
  reasons.chat_outside_project='Chat đã rời Project. Đồng bộ và kiểm tra lại nhóm nhận việc.';
  const selectedProject = () => data?.workspaces.find(item => item.id === $('corpProject').value && item.kind === 'project');
  const scopedChats = () => selectedProject()?.chats || (data?.workspaces || []).filter(item => item.kind !== 'project');
  const scopedRuns = () => (data?.runs||[]).filter(run => selectedProject() ? run.workspaceId === selectedProject().id : !run.workspaceId);
  const scopedArenas = () => (data?.arenas||[]).filter(arena => selectedProject() ? arena.workspaceId === selectedProject().id : !arena.workspaceId);
  const teamMembers = () => data?.teams?.find(team=>team.workspaceId===selectedProject()?.id)?.members || [];
  const staffRole = chatId => data?.companyRoles?.find(role=>role.id===teamMembers().find(member=>member.chatId===chatId)?.roleId);
  function error(value) { $('corpError').textContent = value; $('corpError').hidden = !value; }
  async function api(path, body) {
    const response = await fetch('/admin/api/corp' + path, body === undefined ? { cache:'no-store' } : { method:'POST', headers:{ 'Content-Type':'application/json', 'X-DC-Admin-Action':'1' }, body:JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) {
      const messages={invalid_idea:'Nhập ý tưởng từ 4 đến 8.000 ký tự.',invalid_arena_idea:'Nhập ý tưởng Arena từ 4 đến 8.000 ký tự.',invalid_arena_count:'Chọn 20, 50 hoặc 100 sản phẩm.',invalid_arena_request:'Yêu cầu Arena hết hiệu lực. Tạo lại trận.',arena_request_conflict:'Yêu cầu Arena đã thay đổi. Tạo lại trận.',project_folder_required:'Project cần có thư mục làm việc. Cập nhật trong Dự án & chat.',invalid_idea_request:'Yêu cầu đã hết hiệu lực. Đóng rồi mở lại phần Từ ý tưởng.',idea_request_conflict:'Ý tưởng đã thay đổi. Thử tạo lại quy trình.',enable_corp_first:'Bật Điều phối trước khi bắt đầu quy trình.',project_not_found:'Chọn một Project trước khi tạo quy trình.',pair_corp_first:'Kết nối extension Corp trước khi tạo Project tự động.',bootstrap_unavailable:'Khởi động lại UmiBridge để nạp chức năng tạo Project.',invalid_arena_chat:'Arena cần team chat hợp lệ trong cùng Project.',missing_arena_judge:'Project chưa có bộ phận Điều hành hoặc QA làm giám khảo.'};
      throw Error(result.error?.startsWith('missing_company_roles:')?'Chưa có chat nhận việc cho: '+result.error.split(':')[1].split(',').map(id=>data?.companyRoles?.find(role=>role.id===id)?.department||id).join(', ')+'. Mở Bộ phận để phân công.':messages[result.error]||reasons[result.error]||result.error||'Không cập nhật được Corp');
    } return result;
  }
  async function act(path, body = {}) { try { error(''); const result = await api(path, body); await load(); return result; } catch (cause) { error(cause.message); return null; } }
  function button(label, action) { const b = node('button', label, 'btn small'); b.type = 'button'; b.onclick = action; return b; }
  function addStep() {
    if ($('corpSteps').children.length >= 12) return;
    const field = node('fieldset', undefined, 'corp-step'), count = $('corpSteps').children.length + 1;
    field.append(node('legend', 'Bước ' + count));
    const chatLabel = node('label', 'Nhân viên / Chat'), select = document.createElement('select'); select.name = 'workspaceId'; select.required = true;
    chatLabel.append(select); field.append(chatLabel);
    const roleLabel = node('label', 'Vai trò'), role = document.createElement('input'); role.name = 'role'; role.maxLength = 80; role.placeholder = count === 1 ? 'Sếp / Điều phối' : 'Lập trình / Kiểm tra'; roleLabel.append(role); field.append(roleLabel);
    const promptLabel = node('label', 'Yêu cầu cho bước này'), prompt = document.createElement('textarea'); prompt.name = 'prompt'; prompt.required = true; prompt.maxLength = 12000; prompt.placeholder = 'Mô tả việc cần làm và kết quả cần bàn giao...'; promptLabel.append(prompt); field.append(promptLabel);
    field.append(button('Bỏ bước', () => { field.remove(); [...$('corpSteps').children].forEach((item, i) => item.querySelector('legend').textContent = 'Bước ' + (i + 1)); }));
    $('corpSteps').append(field); updateChoices();
  }
  function updateChoices() {
    const project = selectedProject(), chats = scopedChats(), choices = JSON.stringify([project?.id, chats]);
    for (const select of $('corpSteps').querySelectorAll('select')) {
      if (select.dataset.choices === choices) continue;
      const selected = select.value; select.name = project ? 'chatId' : 'workspaceId'; select.replaceChildren(new Option('Chọn chat nhận việc', ''));
      for (const item of chats) select.add(new Option(item.name, project ? item.chatId : item.id));
      select.value = selected; select.dataset.choices = choices;
    }
  }
  function renderScope() {
    const projects = data.workspaces.filter(item => item.kind === 'project'), select = $('corpProject'), signature = JSON.stringify(projects.map(item => [item.id,item.name]));
    if (select.dataset.choices !== signature) {
      const selected = select.value || localStorage.getItem('umibridge.corp.project'); select.replaceChildren();
      for (const item of projects) select.add(new Option(item.name,item.id));
      select.add(new Option('Chat riêng lẻ', 'standalone')); select.value = [...select.options].some(item => item.value === selected) ? selected : projects[0]?.id || 'standalone';
      select.dataset.choices = signature;
    }
    const created=data.bootstraps?.find(job=>job.id===focusBootstrap&&job.status==='done'&&(job.runId||job.arenaId));
    if(created&&[...select.options].some(option=>option.value===created.workspaceId)){select.value=created.workspaceId;localStorage.setItem('umibridge.corp.project',select.value);focusBootstrap=null;localStorage.removeItem('umibridge.corp.bootstrap');first=true;setCorpTab(created.kind==='arena'?'arena':'queue');}
    const project = selectedProject(), status = project?.sync?.status;
    $('corpOpenProject').hidden = $('corpSync').hidden = !project;
    if (project) $('corpOpenProject').href = project.chatUrl;
    $('corpScopeStatus').textContent = project ? project.chats.length + ' chat · ' + ({pending:'Mở Project trong Chrome để đồng bộ',partial:'Đã nhận một phần · Đồng bộ để quét hết',complete:'Đã quét hết danh sách',unavailable:'Chưa đọc được danh sách · Chọn tab Trò chuyện rồi đồng bộ'}[status] || 'Chờ đồng bộ') : scopedChats().length + ' chat';
    $('corpComposeToggle').disabled = !scopedChats().length;
    $('corpTeamToggle').disabled=!project;
    if(!$('corpTeam').hidden&&($('corpTeam').dataset.project!==(project?.id||'')||$('corpTeam').dataset.members!==JSON.stringify(scopedChats().map(chat=>chat.chatId))))renderTeam(true);
    renderIdea();
  }
  function renderIdea(){
    if(!data)return;
    const project=selectedProject(),mode=$('corpIdeaMode').value,isNew=$('corpIdeaTarget').value==='new';
    const stages=(data.ideaStages||[]).filter((stage,index)=>mode==='build'||index<3);
    const required=isNew?(data.companyRoles||[]).map(role=>role.id):[...new Set(stages.map(stage=>stage.roleId))];
    const ready=data.ideaProjects?.find(item=>item.workspaceId===project?.id),members=ready?.members||[];
    const version=data.extensionVersion?.split('.').map(Number),supported=!!version&&(version[0]>0||version[1]>=3);
    const missing=required.filter(id=>!members.some(member=>member.roleId===id));
    $('corpIdeaProject').textContent=isNew?'Tự tạo Project mới, 8 chat và phân công bộ phận.':project?'Project: '+project.name:'Chọn Project ở thanh phía trên để bắt đầu.';
    $('corpIdeaProject').hidden=isNew;
    $('corpIdeaRoot').textContent=isNew?'Thư mục dự án mới sẽ nằm trong: '+(data.projectsRoot||'Documents / UmiBridge Projects'):project?.root?'Thư mục làm việc: '+project.root:'Chưa có thư mục làm việc.';
    $('corpIdeaReadiness').textContent=isNew?!data.paired?'Kết nối extension Corp trước khi tạo Project tự động.':!supported?'Nạp lại UmiBridge Corp 0.3.0 trong trang quản lý extension rồi chờ kết nối.':'Extension sẽ tạo các chat sau trong Project mới, sau đó tự chuyển sang văn phòng của dự án.':!project?'Chọn Project đã đồng bộ chat.':!stages.length?'Khởi động lại UmiBridge để nạp tính năng Từ ý tưởng.':missing.length?`${required.length-missing.length}/${required.length} bộ phận sẵn sàng. Bổ sung chat và phân công các bộ phận còn thiếu.`:`${required.length}/${required.length} bộ phận sẵn sàng. Phân công gợi ý theo tên chat sẽ được lưu khi tạo quy trình.`;
    const signature=JSON.stringify([isNew,project?.id,required,members,project?.chats]);
    if($('corpIdeaTeam').dataset.signature!==signature){
      $('corpIdeaTeam').dataset.signature=signature;$('corpIdeaTeam').replaceChildren();
      for(const id of required){const role=data.companyRoles.find(role=>role.id===id),member=members.find(member=>member.roleId===id);
        const row=node('div'),name=node('dt',role.department),chat=node('dd',isNew?role.name:member?(project.chats.find(chat=>chat.chatId===member.chatId)?.name.split('\n')[0]||member.chatId):'Chưa có chat');
        if(!isNew&&!member)row.className='missing';if(!isNew&&member?.suggested)chat.append(node('small','Gợi ý theo tên chat'));row.append(name,chat);$('corpIdeaTeam').append(row);
      }
    }
    const sequence=JSON.stringify(stages.map(stage=>stage.id));
    if($('corpIdeaStages').dataset.sequence!==sequence){$('corpIdeaStages').dataset.sequence=sequence;$('corpIdeaStages').replaceChildren();for(const stage of stages)$('corpIdeaStages').append(node('li',stage.title));}
    $('corpIdeaStagesTitle').textContent=`${stages.length} chặng thực hiện`;
    $('corpIdeaProcessNote').textContent=mode==='build'?'Có vòng sửa lỗi và nghiệm thu lại, tối đa 2 vòng sửa. Quy trình dừng nếu kiểm thử cuối chưa đạt hoặc một bộ phận bị chặn. Chạy thử và bàn giao ở local.':'Ba chặng tạo brief chi tiết, thiết kế giải pháp và kế hoạch triển khai, được lưu thành tệp trong thư mục dự án.';
    $('corpIdeaDispatch').textContent=data.enabled?isNew?'Giữ Chrome và UmiBridge đang chạy trong khi khởi tạo.':'Bấm Tạo và bắt đầu để giao chặng đầu. Các chặng tiếp theo tự bàn giao theo kết quả.':'Điều phối đang tắt. Yêu cầu sẽ được lưu tạm dừng; bật Điều phối và bấm Bắt đầu khi sẵn sàng.';
    $('corpIdeaSubmit').textContent=ideaSending?'Đang tạo...':isNew?'Tạo Project':data.enabled?'Tạo và bắt đầu':'Tạo quy trình';
    $('corpIdeaSubmit').disabled=ideaSending||!stages.length||(isNew?!data.paired||!supported:!project||!project.root||!!missing.length);
    $('corpIdeaConfigure').hidden=isNew;$('corpIdeaRun').closest('label').hidden=!isNew;
    $('corpIdeaConfigure').disabled=!project||ideaSending;
  }
  function renderBootstraps(){
    const jobs=(data.bootstraps||[]).filter(job=>!['done','cancelled'].includes(job.status));
    $('corpBootstraps').hidden=!jobs.length;
    const signature=JSON.stringify([jobs,data.enabled]);if($('corpBootstraps').dataset.signature===signature)return;
    $('corpBootstraps').dataset.signature=signature;$('corpBootstraps').replaceChildren();
    const reasons={bootstrap_unconfirmed:'Chưa xác nhận được thao tác tạo. Kiểm tra tab ChatGPT trước khi tiếp tục.',bootstrap_recovery_required:'Không còn tab khởi tạo cũ. Kiểm tra Project/chat đã tạo; hệ thống giữ tiến độ để tránh tạo trùng.',project_create_ui_missing:'Chưa thấy nút tạo Project. Kiểm tra đã đăng nhập ChatGPT và tải lại extension.',bootstrap_ui_timeout:'ChatGPT chưa phản hồi đúng giao diện trong thời gian chờ. Kiểm tra tab khởi tạo.',project_dialog_busy:'Hộp thoại tạo Project đang có nội dung khác. Kiểm tra rồi thử tiếp.',composer_busy:'Chat có bản nháp hoặc đang trả lời. Hoàn tất trước khi tiếp tục.',bootstrap_content_unavailable:'Chưa kết nối được trang ChatGPT. Tải lại extension và tab ChatGPT.',bootstrap_stopped:'Khởi tạo đã dừng theo lựa chọn điều phối.',bootstrap_project_changed:'Tab đã chuyển khỏi Project khởi tạo. Kiểm tra trước khi tiếp tục.'};
    for(const job of jobs){
      const row=node('article',undefined,'corp-bootstrap');row.append(node('strong',job.name));
      row.append(node('p',`${job.kind==='arena'?'Arena · ':''}${{running:'Đang khởi tạo',paused:'Tạm dừng',blocked:'Cần kiểm tra'}[job.status]} · ${job.projectId?'Đã tạo Project':'Đang chuẩn bị Project'} · ${job.chats.length}/8 chat bộ phận${job.kind==='arena'&&job.count?` · ${job.count} sản phẩm`:''}`));
      if(job.reason)row.append(node('p',reasons[job.reason]||'Khởi tạo bị chặn: '+job.reason,'corp-reason'));
      const actions=node('div',undefined,'actions');
      if(job.status!=='running'){const start=button(job.status==='blocked'?'Kiểm tra và tiếp tục':'Bắt đầu',()=>act('/projects/'+job.id+'/start'));start.disabled=!data.enabled;actions.append(start);}
      else actions.append(button('Tạm dừng',()=>act('/projects/'+job.id+'/pause')));
      if(job.projectUrl){const link=node('a','Mở Project','btn small');link.href=job.projectUrl;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
      actions.append(button('Hủy khởi tạo',()=>act('/projects/'+job.id+'/cancel')));row.append(actions);$('corpBootstraps').append(row);
    }
  }
  function idea(open){setCorpTab(open?'idea':'office');if(open)$('corpIdeaText').focus();}
  function renderTeam(preserve=false) {
    const project=selectedProject(), root=$('corpTeamMembers');
    const drafts=new Map(preserve&&$('corpTeam').dataset.project===project?.id?[...root.querySelectorAll('select')].map(select=>[select.dataset.chat,select.value]):[]);
    root.replaceChildren();$('corpTeam').dataset.project=project?.id||'';$('corpTeam').dataset.members=JSON.stringify(scopedChats().map(chat=>chat.chatId));
    if(!project){$('corpTeamSummary').textContent='Chọn Project để phân công bộ phận.';return;}
    const roles=data.companyRoles||[], members=teamMembers();
    const staffed=new Set(members.filter(member=>project.chats.some(chat=>chat.chatId===member.chatId)).map(member=>member.roleId));
    $('corpTeamSummary').textContent=`${staffed.size}/${roles.length} bộ phận có nhân viên · ${project.chats.length} chat`;
    const departments=node('div',undefined,'corp-departments');
    for(const role of roles){const row=node('div');row.append(node('strong',role.department),node('span',staffed.has(role.id)?'Đã phân công':'Chưa có nhân viên'));row.title=role.brief;departments.append(row);}
    root.append(departments);
    for(const chat of project.chats){const label=node('label',chat.name.split('\n')[0]),select=document.createElement('select');select.dataset.chat=chat.chatId;select.add(new Option('Chưa phân công',''));for(const role of roles)select.add(new Option(`${role.department} · ${role.name}`,role.id));select.value=drafts.get(chat.chatId)??members.find(member=>member.chatId===chat.chatId)?.roleId??'';label.append(select);root.append(label);}
  }
  function team(open){if(open)setCorpTab('queue');$('corpTeam').hidden=!open;section.classList.toggle('teaming',open);$('corpTeamToggle').setAttribute('aria-expanded',String(open));if(open)renderTeam();syncScene();sizeWorkspace();}
  function officeSnapshot() {
    const agents = new Map();
    for (const workspace of scopedChats()) {
      if (agents.has(workspace.chatId)) continue;
      agents.set(workspace.chatId, { id:workspace.chatId, role:workspace.name, roles:[workspace.name], status:'IDLE', pose:'idle', count:0, can_open:true, provisional:false });
    }
    const runs = scopedRuns();
    for (const run of runs) for (const step of run.steps) {
      let a = agents.get(step.chatId);
      if (!a) { a = { id:step.chatId, role:step.role, roles:[step.role], status:'IDLE', pose:'idle', count:0, can_open:true, provisional:false }; agents.set(step.chatId, a); }
      if (step.status === 'cancelled') continue;
      if (step.status === 'done') {
        if (!a.count) { a.role=step.role; a.roles=[step.role]; a.status='COMPLETED'; a.pose='read'; a.task=step.prompt||step.title||run.title; }
        continue;
      }
      a.count++; if (a.task_id && step.status === 'queued') continue;
      a.role = step.role; a.roles = [step.role]; a.task = step.prompt; a.task_id = step.id.slice(0, 8);
      a.status = { queued:'QUEUED', dispatching:'DISPATCHED', running:'WAITING', limit_wait:'LIMIT', blocked:'BLOCKED' }[step.status] || 'IDLE';
      if (run.status === 'paused') a.status = 'PAUSED';
      a.pose = step.status === 'dispatching' && data.enabled && run.status === 'running' ? 'type' : 'idle';
      a.resetAt = step.resetAt;
    }
    for(const agent of agents.values()){
      const role=staffRole(agent.id);agent.chatName=scopedChats().find(chat=>chat.chatId===agent.id)?.name?.split('\n')[0]||agent.role;
      if(role){agent.roleId=role.id;agent.department=role.department;agent.role=role.name;agent.roles=[role.name];}
      else agent.department='Chưa phân công';
    }
    const order=data.companyRoles?.map(role=>role.id)||[];
    const handoffs = data.events.filter(event => event.type === 'handoff' && runs.some(run => run.id === event.runId)).map(event => ({ id:event.id, from:event.from, to:event.to, task:event.task, at:event.at }));
    return { project:selectedProject()?.id || 'umibridge-corp', name:selectedProject()?.name || 'UmiBridge Corp', coordinator:data.enabled, agents:[...agents.values()].sort((a,b)=>(order.indexOf(a.roleId)<0?99:order.indexOf(a.roleId))-(order.indexOf(b.roleId)<0?99:order.indexOf(b.roleId))), handoffs, baseline:first };
  }
  function syncScene() {
    if (!data || !scene.contentWindow) return;
    const visible = corpTab === 'office' && section.classList.contains('view-active') && data.office && !section.classList.contains('composing') && !section.classList.contains('teaming') && !section.classList.contains('ideaing') && !document.hidden;
    scene.contentWindow.postMessage({ type:'corp-office', snapshot:officeSnapshot(), visible }, location.origin); first = !visible;
  }
  function renderArena() {
    if(!data)return;
    const version=data.extensionVersion?.split('.').map(Number),supported=!!version&&(version[0]>0||version[1]>=3);
    $('corpArenaSubmit').disabled=arenaSending||!data.paired||!supported;
    $('corpArenaSubmit').textContent=arenaSending?'Đang lưu...':'Tạo Project Arena';
    $('corpArenaReadiness').textContent=!data.paired?'Kết nối extension Corp trước khi tạo Arena.':!supported?'Nạp lại extension UmiBridge Corp 0.3.0 rồi chờ kết nối.':data.enabled?'Khởi tạo Project và 8 chat. Arena dừng để bạn kiểm tra trước khi bắt đầu.':'Điều phối đang tắt. Yêu cầu khởi tạo sẽ được lưu tạm dừng.';
    const count=Number($('corpArenaCount').value),groupFormat=$('corpArenaFormat').value==='group_knockout',expectedMatches=groupFormat?count/5*10+count/5*2-1:count-1;
    $('corpArenaWorkload').textContent=`${count*11+expectedMatches} lượt giao việc cơ bản: ${count} sản phẩm, ${expectedMatches} trận chấm; có thể thêm lượt sửa lỗi.${groupFormat?' Mỗi bảng 5 sản phẩm, lấy 2 sản phẩm đầu bảng.':''} Dùng lại 8 chat.`;
    const root=$('corpArenaMatches'),arenas=scopedArenas(),next=JSON.stringify([arenas,data.runs?.filter(run=>run.arenaId),data.enabled,selectedProject()?.id,[...arenaActions]]);
    if(arenaSignature===next)return;arenaSignature=next;
    const scrolls=new Map([...root.querySelectorAll('[data-scroll]')].map(el=>[el.dataset.scroll,{left:el.scrollLeft,top:el.scrollTop}]));
    const focusKey=root.contains(document.activeElement)?document.activeElement?.closest('[data-focus]')?.dataset.focus:null;
    for(const el of root.querySelectorAll('details[data-key]'))arenaDetails.set(el.dataset.key,el.open);root.replaceChildren();
    $('corpArenaScope').textContent=selectedProject()?`Arena trong ${selectedProject().name}`:'Chọn Project để xem Arena đã tạo. Arena mới luôn có Project riêng.';
    if(!arenas.length){root.append(node('p',selectedProject()?'Project này chưa có Arena.':'Chưa chọn Project Arena.','corp-empty'));return;}
    const detail=(key,label,initial=false)=>{const el=node('details');el.dataset.key=key;el.open=arenaDetails.get(key)??initial;el.append(node('summary',label));return el;};
    for(const arena of [...arenas].reverse()){
      const card=node('article',undefined,'corp-arena-match');card.dataset.arena=arena.id;
      const candidates=arena.candidateRuns||[],name=id=>candidates.find(candidate=>candidate.id===id)?.label||'Sản phẩm chưa xác định';
      const completed=candidates.filter(candidate=>candidate.status==='done').length,rounds=arena.rounds||[],groups=arena.groups||[],matches=arena.matches||[...groups.flatMap(group=>group.matches||[]),...rounds.flatMap(round=>round.matches||[])],judged=matches.filter(match=>match.rightId&&match.status==='done').length;
      const totalMatches=arena.format==='group_knockout'?arena.count/5*12-1:arena.count-1;
      const current=candidates.find(candidate=>!['done','cancelled'].includes(candidate.status)),currentRun=data.runs?.find(run=>run.id===current?.runId),currentStep=currentRun?.steps.find(step=>!['done','cancelled'].includes(step.status));
      const pendingMatch=matches.find(match=>match.rightId&&!['done','cancelled','bye'].includes(match.status)),judge=data.runs?.find(run=>run.id===pendingMatch?.judgeRunId),judgeStep=judge?.steps.find(step=>!['done','cancelled'].includes(step.status));
      const problem=arena.reason||current?.reason||currentStep?.reason||judgeStep?.reason;
      const heading=node('div',undefined,'corp-arena-heading');heading.append(node('h4',arena.title||'Arena'),node('span',arena.status==='running'?'Đang thực hiện':labels[arena.status]||arena.status,'corp-status'));card.append(heading);
      card.append(node('p',arena.idea,'corp-arena-idea'),node('p',`${arena.format==='group_knockout'?'Vòng bảng + loại trực tiếp':'Loại trực tiếp'} · ${completed}/${arena.count} sản phẩm hoàn tất · ${judged}/${totalMatches} trận chấm hoàn tất`,'corp-arena-progress'));
      const progress=document.createElement('progress');progress.max=arena.count+totalMatches;progress.value=completed+judged;progress.setAttribute('aria-label','Tiến độ sản phẩm và trận chấm');card.append(progress);
      if(arena.status==='paused'&&!problem)card.append(node('p','Đang tạm dừng. Kiểm tra Project, 8 chat và công cụ trước khi bấm Bắt đầu.'));
      if(arena.status==='running')card.append(node('p',['groups','matches'].includes(arena.phase)?arena.phase==='groups'?'Đang chấm vòng bảng.':'Đang chấm vòng loại trực tiếp.':current?`Đang phát triển ${current.label}${currentStep?' · '+(currentStep.title||currentStep.role):''}`:'Đang chuẩn bị sản phẩm tiếp theo.'));
      if(problem)card.append(node('p',reasons[problem]||`Cần kiểm tra: ${problem}`,'corp-reason'));
      const waiting=currentStep?.status==='limit_wait'?currentStep:judgeStep?.status==='limit_wait'?judgeStep:null;
      if(waiting?.resetAt){const time=node('time');time.dataset.reset=waiting.resetAt;card.append(time);}
      if(arena.winnerId){const winner=candidates.find(candidate=>candidate.id===arena.winnerId),winnerRun=data.runs?.find(run=>run.id===winner?.runId);const result=node('section',undefined,'corp-arena-winner');result.append(node('h5','Sản phẩm thắng: '+name(arena.winnerId)));
        const finalDecision=[...matches].reverse().find(match=>match.winnerId===arena.winnerId&&match.decision)?.decision;
        if(finalDecision?.summary)result.append(node('p',finalDecision.summary));
        const artifacts=[...new Set([...(winner?.artifacts||[]),...(arena.completion?.artifacts||[]),...(winnerRun?.steps.flatMap(step=>step.assessment?.artifacts||[])||[])])];
        if(winner?.root)result.append(node('code',winner.root,'corp-artifact'));
        for(const path of artifacts)result.append(node('code',path,'corp-artifact'));card.append(result);
      }
      const actions=node('div',undefined,'actions'),pending=arenaActions.has(arena.id);
      const action=(label,verb,disabled=false)=>{const control=button(label,()=>arenaAction(arena.id,verb));control.disabled=pending||disabled;control.dataset.action=verb;actions.append(control);};
      if(!['done','cancelled'].includes(arena.status)){
        action(arena.status==='running'?'Tạm dừng':'Bắt đầu',arena.status==='running'?'pause':'start',arena.status!=='running'&&(!data.enabled||!!problem||currentStep?.status==='blocked'||judgeStep?.status==='blocked'));
        if(problem||currentStep?.status==='blocked'||judgeStep?.status==='blocked')action('Đã kiểm tra - chuẩn bị thử lại','retry');
        action('Hủy Arena','cancel');
      }else action('Xóa khỏi danh sách','delete');
      heading.append(actions);
      const feedback=node('p',undefined,'corp-arena-feedback');feedback.id='corpArenaFeedback-'+arena.id;feedback.setAttribute('role','status');card.append(feedback);
      const views=new Map(),tabs=node('div',undefined,'corp-arena-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Theo dõi '+(arena.title||'Arena'));card.append(tabs);
      let selectedView=localStorage.getItem('umibridge.corp.arena-view.'+arena.id)||'live';
      const chooseView=(key,focus=false)=>{selectedView=key;localStorage.setItem('umibridge.corp.arena-view.'+arena.id,key);for(const [id,{tab,panel}] of views){tab.setAttribute('aria-selected',String(id===key));tab.tabIndex=id===key?0:-1;panel.hidden=id!==key;if(id===key&&focus)tab.focus();}};
      for(const [key,label] of [['live','Trực tiếp'],['groups','Vòng bảng'],['bracket','Sơ đồ đấu'],['history','Lịch sử'],['products','Sản phẩm']]){
        const tab=button(label,()=>chooseView(key)),panel=node('section',undefined,'corp-arena-view');
        tab.dataset.arenaView=key;tab.dataset.focus=arena.id+'-tab-'+key;tab.id=arena.id+'-tab-'+key;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',arena.id+'-view-'+key);
        panel.id=arena.id+'-view-'+key;panel.dataset.view=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);tabs.append(tab);card.append(panel);views.set(key,{tab,panel});
      }
      tabs.onkeydown=event=>{const buttons=[...tabs.children],index=buttons.indexOf(document.activeElement);if(index<0)return;const next=event.key==='ArrowRight'?(index+1)%buttons.length:event.key==='ArrowLeft'?(index+buttons.length-1)%buttons.length:event.key==='Home'?0:event.key==='End'?buttons.length-1:-1;if(next>=0){event.preventDefault();chooseView(buttons[next].dataset.arenaView,true);}};
      chooseView(views.has(selectedView)?selectedView:'live');
      const scoreFor=(match,id)=>match.decision?.scores?.find(score=>score.candidateId===id);
      const matchLabel=match=>match.stage==='group'||match.groupId?(groups.find(group=>group.id===match.groupId)?.label||'Vòng bảng'):`Vòng ${match.round||rounds.find(round=>round.matches?.some(item=>item.id===match.id))?.number||1}`;
      const reportFor=match=>{
        const report=detail(arena.id+'-decision-'+match.id+'-'+(match.reportContext||''),'Kết quả chấm và bằng chứng');report.dataset.focus=arena.id+'-report-'+match.id+'-'+(match.reportContext||'');
        let populated=false;const populate=()=>{if(populated||!report.open)return;populated=true;
        report.append(node('p',match.decision.summary||'Đã ghi báo cáo chấm.'));
        if(match.decision.tieBreak)report.append(node('p','Phân định khi bằng điểm: '+match.decision.tieBreak));
        for(const score of match.decision.scores||[]){report.append(node('h6',`${name(score.candidateId)} · ${score.score}/100`),node('p',score.reason));
          if(score.criteria?.length){const table=node('table',undefined,'corp-arena-score-table'),caption=node('caption','Điểm theo tiêu chí');table.append(caption);const head=node('thead'),row=node('tr');for(const label of ['Tiêu chí','Điểm','Nhận xét']){const cell=node('th',label);cell.scope='col';row.append(cell);}head.append(row);table.append(head);const body=node('tbody');for(const criterion of score.criteria){const rubric=arena.rubric?.find(item=>item.id===criterion.id),line=node('tr');line.append(node('th',rubric?.label||criterion.id),node('td',`${criterion.score}${rubric?'/'+rubric.max:''}`),node('td',criterion.reason));line.firstChild.scope='row';body.append(line);}table.append(body);report.append(table);}
        }
        for(const check of match.decision.checks||[]){report.append(node('p',`${name(check.candidateId)} · ${check.name} · ${check.status==='pass'?'Đạt':check.status==='fail'?'Không đạt':'Chưa xác minh'}: ${check.evidence}`));for(const path of check.artifacts||[])report.append(node('code',path,'corp-artifact'));}
        };report.addEventListener('toggle',populate);populate();
        return report;
      };
      const matchRow=(match,context)=>{const row=node('article',undefined,'corp-arena-pair');row.dataset.status=match.status;row.dataset.match=match.id;row.append(node('p',matchLabel(match),'corp-arena-match-label'));
        for(const id of [match.leftId,match.rightId].filter(Boolean)){const line=node('div',undefined,'corp-arena-contender');line.dataset.winner=String(match.winnerId===id);line.append(node('strong',name(id)),node('span',scoreFor(match,id)?.score===undefined?'':String(scoreFor(match,id).score)));row.append(line);}
        row.append(node('small',!match.rightId?'Miễn đấu - đi tiếp':match.winnerId?'Thắng: '+name(match.winnerId):labels[match.status]||match.status));
        if(match.completedAt)row.append(node('time',new Date(match.completedAt).toLocaleString('vi-VN')));
        if(match.decision)row.append(reportFor({...match,reportContext:context}));return row;
      };
      const live=views.get('live').panel,featured=pendingMatch||[...matches].reverse().find(match=>match.decision),liveStage=node('div',undefined,'corp-arena-live');
      liveStage.dataset.active=String(!document.hidden&&data.enabled&&arena.status==='running'&&!!featured&&featured.id===pendingMatch?.id&&['running','dispatching'].includes(judgeStep?.status));
      if(featured){
        liveStage.append(node('p',`${matchLabel(featured)} · ${featured.decision?'Đã có kết quả':labels[judgeStep?.status||featured.status]||'Chờ chấm'}`,'corp-arena-live-state'));
        const battle=node('div',undefined,'corp-arena-battle');
        for(const [index,id] of [featured.leftId,featured.rightId].entries()){
          if(index===1){const center=node('div',undefined,'corp-arena-duel');center.setAttribute('aria-hidden','true');center.append(node('i',undefined,'corp-arena-beam'),node('span','VS'),node('i',undefined,'corp-arena-beam'));battle.append(center);}
          const contender=node('div',undefined,'corp-arena-fighter'),candidate=candidates.find(item=>item.id===id),score=scoreFor(featured,id);contender.dataset.winner=String(featured.winnerId===id);contender.append(node('span',index===0?'Sản phẩm A':'Sản phẩm B','corp-arena-side'),node('h5',name(id)),node('p',candidate?.approach||'Phương án từ ý tưởng của bạn'),node('strong',score?score.score+'/100':'Chưa có điểm','corp-arena-live-score'));if(featured.winnerId===id)contender.append(node('span','Thắng trận','corp-arena-victory'));battle.append(contender);
        }liveStage.append(battle,node('p',featured.decision?.summary||(arena.status==='paused'?'Trận đang tạm dừng. Bắt đầu Arena khi đã sẵn sàng.':arena.status==='cancelled'?'Arena đã hủy. Trận này chưa có kết quả.':!data.enabled?'Điều phối đang tắt. Trận chưa tiếp tục.':judgeStep?.status==='limit_wait'?'Đang chờ hạn mức nhà cung cấp. Trận chưa có kết quả.':judgeStep?.status==='running'?'Giám khảo đang đối chiếu sản phẩm và bằng chứng. Điểm xuất hiện khi nhận đủ báo cáo hợp lệ.':'Trận đang chờ lượt chấm. Điểm chỉ xuất hiện sau báo cáo hợp lệ.'),'corp-arena-live-note'));
        if(featured.decision)liveStage.append(reportFor({...featured,reportContext:'live'}));
        else if(judgeStep)liveStage.append(node('p',(judgeStep.title||judgeStep.role)+' · '+(labels[judgeStep.status]||judgeStep.status)));
      }else{liveStage.append(node('h5',current?`Đang chuẩn bị ${current.label}`:'Chuẩn bị đấu trường'),node('p',currentStep?`${currentStep.title||currentStep.role} · ${labels[currentStep.status]||currentStep.status}`:'Hoàn tất sản phẩm trước khi bắt đầu các trận chấm.'));
        const phases=node('ol',undefined,'corp-arena-pipeline');for(const label of ['Phát triển sản phẩm','Vòng bảng','Loại trực tiếp','Quán quân']){const item=node('li',label);if(label==='Vòng bảng'&&arena.format!=='group_knockout')continue;phases.append(item);}liveStage.append(phases);
      }live.append(liveStage);
      const rubric=node('p',(arena.rubric||[]).map(item=>`${item.label}: ${item.max}`).join(' · '),'corp-arena-rubric');if(rubric.textContent)live.append(rubric);
      live.append(node('p','Diễn biến cập nhật từ trạng thái điều phối. Animation biểu thị xử lý, không mô phỏng điểm hoặc kết quả.','corp-arena-note'));
      const groupPanel=views.get('groups').panel;
      if(!groups.length)groupPanel.append(node('p',arena.format==='group_knockout'?'Bảng được lập sau khi tất cả sản phẩm hoàn tất.':'Giải này dùng loại trực tiếp. Chọn Vòng bảng + loại trực tiếp khi tạo giải mới.','corp-empty'));
      else{groupPanel.append(node('p','Thắng 3 điểm. Mỗi bảng lấy 2 sản phẩm đầu vào vòng loại trực tiếp.','corp-arena-note'));const grid=node('div',undefined,'corp-arena-groups');grid.dataset.scroll=arena.id+'-groups';
        for(const group of groups){const block=node('section',undefined,'corp-arena-group');block.append(node('h5',group.label),node('p',group.tieBreak||'Xếp hạng: điểm, hiệu số điểm chấm, tổng điểm chấm, thứ tự hạt giống.'));
          const wrap=node('div',undefined,'corp-arena-table-wrap'),table=node('table',undefined,'corp-arena-standings');table.append(node('caption',group.label+' - bảng xếp hạng'));const head=node('thead'),headRow=node('tr');for(const label of ['Hạng','Sản phẩm','Trận','Thắng','Thua','Điểm','Hiệu số']){const cell=node('th',label);cell.scope='col';headRow.append(cell);}head.append(headRow);table.append(head);const body=node('tbody');
          for(const standing of group.standings||[]){const row=node('tr');row.dataset.qualified=String(!!standing.qualified);for(const value of [standing.rank,name(standing.candidateId)+(standing.qualified?' · Đi tiếp':''),standing.played,standing.wins,standing.losses,standing.points,standing.scoreDifference])row.append(node('td',String(value??0)));body.append(row);}table.append(body);wrap.append(table);block.append(wrap);
          const games=detail(arena.id+'-group-'+group.id,`Các trận · ${(group.matches||[]).filter(match=>match.status==='done').length}/${group.matches?.length||0}`);for(const match of group.matches||[])games.append(matchRow(match,'groups'));block.append(games);grid.append(block);
        }groupPanel.append(grid);
      }
      const bracketPanel=views.get('bracket').panel;
      if(rounds.length){const columns=node('div',undefined,'corp-arena-bracket');columns.dataset.scroll=arena.id+'-bracket';columns.tabIndex=0;columns.setAttribute('role','region');columns.setAttribute('aria-label','Sơ đồ loại trực tiếp, cuộn ngang để xem các vòng');
        for(const [index,round] of rounds.entries()){const column=node('section',undefined,'corp-arena-round');column.append(node('h5',round.matches?.length===1?'Chung kết':`Vòng ${round.number}`));for(const match of round.matches||[])column.append(matchRow({...match,round:round.number},'bracket'));columns.append(column);}
        bracketPanel.append(columns);if(arena.winnerId)bracketPanel.append(node('p','Quán quân: '+name(arena.winnerId),'corp-arena-victory'));
        if(!arena.winnerId)bracketPanel.append(node('p','Vòng tiếp theo xuất hiện khi toàn bộ trận vòng hiện tại chấm xong.','corp-arena-note'));
      }else bracketPanel.append(node('p',arena.format==='group_knockout'?'Sơ đồ loại trực tiếp xuất hiện sau vòng bảng.':'Sơ đồ xuất hiện sau khi tất cả sản phẩm hoàn tất.','corp-empty'));
      const historyPanel=views.get('history').panel,filterLabel=node('label','Lọc lịch sử trận '),filter=node('select',undefined,'corp-arena-history-filter');filter.dataset.focus=arena.id+'-filter';for(const [value,label] of [['all','Tất cả'],['group','Vòng bảng'],['knockout','Loại trực tiếp']]){const option=node('option',label);option.value=value;filter.append(option);}filter.value=arenaHistoryFilters.get(arena.id)||'all';filterLabel.append(filter);historyPanel.append(filterLabel);
      const history=node('div',undefined,'corp-arena-history');history.dataset.scroll=arena.id+'-history';historyPanel.append(history);
      const populateHistory=()=>{history.replaceChildren();const played=matches.filter(match=>match.decision&&match.status==='done'&&(filter.value==='all'||(match.stage==='group'||match.groupId?'group':'knockout')===filter.value)).sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||'')));if(!played.length)history.append(node('p','Chưa có trận đã chấm trong mục này.','corp-empty'));for(const match of played)history.append(matchRow(match,'history'));};
      filter.onchange=()=>{arenaHistoryFilters.set(arena.id,filter.value);populateHistory();};populateHistory();
      const activity=detail(arena.id+'-activity','Nhật ký điều phối'),events=arena.history||[];for(const item of [...events].reverse()){const words={created:'Tạo Arena',groups_completed:'Hoàn tất vòng bảng',blocked:'Cần kiểm tra',started:'Bắt đầu giải',start:'Bắt đầu giải',paused:'Tạm dừng',pause:'Tạm dừng',retry:'Chuẩn bị thử lại',cancelled:'Hủy giải',cancel:'Hủy giải',finished:'Giải hoàn tất',candidate_completed:'Sản phẩm hoàn tất',match_completed:'Trận chấm hoàn tất'};activity.append(node('p',`${item.at?new Date(item.at).toLocaleString('vi-VN')+' · ':''}${words[item.type]||'Cập nhật điều phối'}${item.candidateId?' · '+name(item.candidateId):''}${item.winnerId?' · Thắng: '+name(item.winnerId):''}`));}if(!events.length)activity.append(node('p','Giải cũ chưa có nhật ký điều phối; kết quả trận vẫn được giữ.'));historyPanel.append(activity);
      const list=node('ol',undefined,'corp-arena-products');list.dataset.scroll=arena.id+'-products';for(const candidate of candidates){const item=node('li');item.append(node('strong',candidate.label||'Sản phẩm '+(candidate.index+1)),node('span',labels[candidate.status]||candidate.status));if(candidate.approach)item.append(node('p',candidate.approach));if(candidate.reason)item.append(node('p',reasons[candidate.reason]||candidate.reason));if(candidate.root)item.append(node('code',candidate.root,'corp-artifact'));list.append(item);}views.get('products').panel.append(list);
      root.append(card);
    }
    for(const el of root.querySelectorAll('[data-scroll]')){const saved=scrolls.get(el.dataset.scroll);if(saved){el.scrollLeft=saved.left;el.scrollTop=saved.top;}}
    if(focusKey){const target=[...root.querySelectorAll('[data-focus]')].find(el=>el.dataset.focus===focusKey);(target?.tagName==='DETAILS'?target.querySelector('summary'):target)?.focus({preventScroll:true});}
  }
  async function arenaAction(id,verb){
    if(arenaActions.has(id))return;
    if(verb==='retry'&&!confirm('Chỉ thử lại sau khi đã kiểm tra chat và tệp đã tạo. Lượt gửi lại có thể lặp thao tác. Chuẩn bị thử lại và giữ Arena tạm dừng?'))return;
    arenaActions.add(id);renderArena();
    let failure='';
    try{await api('/arenas/'+id+'/'+verb,{});await load();}
    catch(cause){failure=cause.message;}
    finally{arenaActions.delete(id);arenaSignature='';renderArena();if(failure){const message=$('corpArenaFeedback-'+id);if(message){message.textContent=failure;message.classList.add('error');}}}
  }
  function setCorpTab(tab, focus = false) {
    const allowed = ['office', 'idea', 'arena', 'queue']; if (!allowed.includes(tab)) tab = 'office'; corpTab = tab;
    localStorage.setItem('umibridge.corp.tab', tab);section.dataset.corpTab=tab;
    for(const [id,state,toggle] of [['corpCompose','composing','corpComposeToggle'],['corpTeam','teaming','corpTeamToggle']]){$(id).hidden=true;section.classList.remove(state);$(toggle).setAttribute('aria-expanded','false');}
    expandOffice(false);
    for (const button of section.querySelectorAll('.corp-tab')) {
      const active = button.dataset.corpTab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      if (focus && active) button.focus();
    }
    const panels = { office: $('corpPanelOffice'), idea: $('corpIdea'), arena: $('corpArena'), queue: $('corpPanelQueue') };
    for (const [name, panel] of Object.entries(panels)) if (panel) panel.hidden = name !== tab;
    $('corpIdeaToggle').setAttribute('aria-expanded',String(tab==='idea'));
    section.classList.toggle('arenaing', tab === 'arena');
    section.classList.toggle('ideaing', tab === 'idea');
    if (tab === 'idea') renderIdea();
    if (tab === 'arena') renderArena();
    syncScene(); sizeWorkspace();
  }
  function render() {
    renderScope();
    renderBootstraps();
    renderArena();
    $('corpEnabled').textContent = 'Điều phối: ' + (data.enabled ? 'Bật' : 'Tắt'); $('corpEnabled').setAttribute('aria-pressed', String(data.enabled));
    $('corpOffice').textContent = 'Văn phòng: ' + (data.office ? 'Bật' : 'Tắt'); $('corpOffice').setAttribute('aria-pressed', String(data.office)); scene.hidden = !data.office;$('corpOfficeEmpty').hidden=data.office;
    $('corpAutoResume').checked = data.autoResume;
    $('corpConnection').textContent = data.connected ? 'Đã nối · ' + data.connectedChats.length + ' chat đang mở' : data.paired ? 'Extension offline · Mở Chrome để kết nối lại' : 'Chưa ghép extension · Chọn Kết nối';
    section.classList.toggle('office-hidden', !data.office);
    const filter = $('corpRunFilter').value;
    const allRuns=scopedRuns(),arenaRuns=allRuns.filter(run=>run.arena||run.arenaId);
    const runs = allRuns.filter(run=>!run.arena&&!run.arenaId).filter(run => filter === 'all' || (filter === 'done') === ['done', 'cancelled'].includes(run.status));
    $('corpArenaQueueSummary').hidden=!arenaRuns.length;
    $('corpArenaQueueSummary').textContent=arenaRuns.length?`${arenaRuns.length} quy trình sản phẩm và giám khảo được quản lý trong tab Arena. Xem tiến độ Arena`:'';
    section.classList.toggle('queue-empty', !runs.length);
    $('corpRunCount').textContent = runs.length;
    updateChoices();
    const next = JSON.stringify([runs, data.enabled, data.connected, filter]);
    if (signature !== next) {
      signature = next; $('corpRuns').replaceChildren();
      if (!runs.length) $('corpRuns').append(node('p', filter === 'active' ? 'Hàng đợi trống. Chọn Giao việc để bắt đầu.' : 'Chưa có nhiệm vụ trong nhóm này.', 'corp-empty'));
      for (const run of [...runs].reverse()) {
        const article = node('article', undefined, 'corp-run'); article.dataset.status = run.status; article.append(node('h4', run.title), node('span', labels[run.status] || run.status, 'corp-status'));
        if(run.idea){
          const index=run.steps.findIndex(step=>!['done','cancelled'].includes(step.status));
          article.append(node('p',index<0?'Đã kết thúc quy trình':`Chặng ${index+1}/${run.steps.length} · ${run.steps[index].title}`,'corp-idea-progress'));
          const brief=node('details');brief.append(node('summary','Ý tưởng và thư mục đầu ra'),node('p',run.idea.text),node('code',run.idea.root+' / '+run.idea.artifactDir));article.append(brief);
        }
        const steps = document.createElement('ol');
        for (const step of run.steps) {
          const li = node('li'); li.append(node('strong', step.title||step.role));if(step.title)li.append(node('small',step.role,'corp-stage-role'));
          li.append(node('span',step.status==='done'&&step.assessment?.outcome==='needs_changes'?'Đã phát hiện lỗi':labels[step.status] || step.status));
          if (step.resetAt && step.status === 'limit_wait') { const stamp = node('time'); stamp.dataset.reset = step.resetAt; stamp.dateTime = new Date(step.resetAt).toISOString(); li.append(stamp); }
          if (step.reason && (reasons[step.reason] || step.reason === 'chat_outside_project')) li.append(node('span', reasons[step.reason] || 'Chat đã rời Project. Đồng bộ và kiểm tra lại phạm vi giao việc.', 'corp-reason'));
          if (step.result) { const details = node('details');details.append(node('summary','Kết quả bàn giao'));
            if(step.assessment){details.append(node('p',step.assessment.summary));const checks=node('ul');for(const check of step.assessment.checks)checks.append(node('li',`${{pass:'Đạt',fail:'Chưa đạt',unverified:'Chưa kiểm tra'}[check.status]} · ${check.name}: ${check.evidence}`));details.append(checks);for(const path of step.assessment.artifacts)details.append(node('code',path,'corp-artifact'));}
            else details.append(node('pre',step.result));li.append(details);
          }
          steps.append(li);
        }
        article.append(steps); const actions = node('div', undefined, 'actions'), current = run.steps.find(step => !['done','cancelled'].includes(step.status));
        if (!['done','cancelled'].includes(run.status)) {
          const start = button(run.status === 'running' ? 'Tạm dừng' : 'Bắt đầu', () => act('/runs/' + run.id + '/' + (run.status === 'running' ? 'pause' : 'start')));
          start.disabled = run.status !== 'running' && (!data.enabled || current?.status === 'blocked'); actions.append(start);
          if (['blocked','limit_wait'].includes(current?.status)) actions.append(button('Đã kiểm tra chat - chuẩn bị thử lại', () => {
            if (confirm('Chỉ tiếp tục khi bạn đã kiểm tra chat và chấp nhận gửi lại hoặc gửi lời nhắc tiếp tục. Nếu lần trước đã chạy, thao tác này có thể tạo thêm lượt. Chuẩn bị thử lại?')) void act('/runs/' + run.id + '/retry');
          }));
          actions.append(button('Hủy', () => act('/runs/' + run.id + '/cancel')));
        } else actions.append(button('Xóa khỏi hàng đợi', () => act('/runs/' + run.id + '/delete')));
        if (current) { const a = node('a', 'Mở chat', 'btn small'); a.href = current.chatUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; actions.append(a); }
        article.append(actions); $('corpRuns').append(article);
      }
    }
    countdown(); syncScene();sizeWorkspace();
  }
  function sizeWorkspace() {
    if (!section.classList.contains('view-active')) return;
    const workspace=section.querySelector('.corp-workspace'), main=$('main');
    const bottom=main.getBoundingClientRect().bottom-parseFloat(getComputedStyle(main).paddingBottom);
    const top=workspace.getBoundingClientRect().top+main.scrollTop;
    workspace.style.height=`${Math.max(420,Math.floor(bottom-top))}px`;
  }
  window.addEventListener('resize',sizeWorkspace);
  function countdown() { for (const el of section.querySelectorAll('[data-reset]')) { const at = Number(el.dataset.reset), seconds = Math.max(0, Math.ceil((at - Date.now()) / 1000)); el.textContent = 'Tiếp tục sau ' + Math.floor(seconds / 3600) + ' giờ ' + Math.floor(seconds % 3600 / 60) + ' phút ' + seconds % 60 + ' giây - ' + new Date(at).toLocaleTimeString('vi-VN') + (seconds === 0 ? ' (đợi extension kiểm tra lại)' : ''); } }
  async function load() {
    if (busy) return; busy = true;
    try { data = await api(''); render(); }
    catch (cause) { error(cause.message); scene.contentWindow?.postMessage({type:'corp-office-error'}, location.origin); }
    finally { busy = false; }
  }
  $('corpAddStep').onclick = addStep;
  function compose(open) { if(open)setCorpTab('queue');$('corpCompose').hidden = !open; section.classList.toggle('composing', open); $('corpComposeToggle').setAttribute('aria-expanded', String(open)); syncScene();sizeWorkspace(); if (open) $('corpRunTitle').focus(); }
  $('corpIdeaToggle').onclick=()=>{if($('corpIdea').hidden){setCorpTab('idea');idea(true);}else{idea(false);setCorpTab('office');}};
  $('corpIdeaClose').onclick=()=>setCorpTab('office',true);
  $('corpIdeaConfigure').onclick=()=>team(true);
  $('corpIdeaMode').onchange=renderIdea;
  $('corpIdeaTarget').onchange=renderIdea;
  $('corpIdeaForm').onsubmit=async event=>{
    event.preventDefault();if(ideaSending)return;const project=selectedProject(),isNew=$('corpIdeaTarget').value==='new';if(!isNew&&!project)return;
    const value={...(isNew?{}:{workspaceId:project.id}),idea:$('corpIdeaText').value.trim(),mode:$('corpIdeaMode').value,start:data.enabled,...(isNew?{runAfterSetup:$('corpIdeaRun').checked}:{})};
    const signature=JSON.stringify(value);if(ideaRequest?.signature!==signature)ideaRequest={signature,key:crypto.randomUUID()};
    ideaSending=true;$('corpIdeaForm').setAttribute('aria-busy','true');$('corpIdeaText').readOnly=true;$('corpIdeaMode').disabled=true;$('corpIdeaTarget').disabled=true;$('corpProject').disabled=true;renderIdea();$('corpIdeaError').hidden=true;
    try {const result=await api(isNew?'/projects':'/ideas',{...value,requestKey:ideaRequest.key});if(isNew){focusBootstrap=result.id;localStorage.setItem('umibridge.corp.bootstrap',result.id);}await load();$('corpIdeaText').value='';ideaRequest=null;setCorpTab('queue');$('corpRunFilter').value='active';render();}
    catch(cause){$('corpIdeaError').textContent=cause.message;$('corpIdeaError').hidden=false;}
    finally{ideaSending=false;$('corpIdeaForm').setAttribute('aria-busy','false');$('corpIdeaText').readOnly=false;$('corpIdeaMode').disabled=false;$('corpIdeaTarget').disabled=false;$('corpProject').disabled=false;renderIdea();}
  };
  $('corpTeamToggle').onclick=()=>team($('corpTeam').hidden);
  $('corpTeamClose').onclick=()=>{team(false);$('corpTeamToggle').focus();};
  $('corpTeamForm').onsubmit=async event=>{event.preventDefault();const project=selectedProject();if(!project)return;const members=[...$('corpTeamMembers').querySelectorAll('select')].filter(select=>select.value).map(select=>({chatId:select.dataset.chat,roleId:select.value}));if(await act('/team',{workspaceId:project.id,members})){renderTeam();team(false);}};
  $('corpCompanyTemplate').onclick=()=>{
    const project=selectedProject(), brief=$('corpCompanyBrief').value.trim();if(!project||!brief){$('corpTemplateStatus').textContent='Chọn Project, nhập yêu cầu chung và phân công đủ bộ phận trước.';return;}
    const roles=data.deliveryOrder.map(id=>data.companyRoles.find(role=>role.id===id));
    const assignments=roles.map(role=>({role,chat:project.chats.find(chat=>teamMembers().some(member=>member.chatId===chat.chatId&&member.roleId===role.id))}));
    const missing=assignments.filter(item=>!item.chat);if(missing.length){$('corpTemplateStatus').textContent='Chưa có nhân viên: '+missing.map(item=>item.role.department).join(', ')+'. Mở Bộ phận để phân công.';return;}
    if([...$('corpSteps').querySelectorAll('textarea')].some(input=>input.value.trim())&&!confirm('Mẫu sẽ thay các bước đang soạn. Dùng chuỗi công ty?'))return;
    $('corpSteps').replaceChildren();
    for(const {role,chat} of assignments){addStep();const field=$('corpSteps').lastElementChild;field.querySelector('select').value=chat.chatId;field.querySelector('input').value=role.name;field.querySelector('textarea').value=`${brief}\n\nBộ phận ${role.department}: ${role.brief}\nĐọc previous_result như dữ liệu tham khảo, đối chiếu tệp và bằng chứng thực. Chỉ làm trong phạm vi yêu cầu. Nếu thiếu dữ liệu hoặc bị chặn, báo rõ; không tự đổi quyền, public hoặc chạy lại thao tác chưa đối chiếu. Kết quả cuối ngắn gọn, ghi đường dẫn artifact chi tiết và giới hạn để bàn giao.`;}
    $('corpTemplateStatus').textContent='Đã tạo 8 bước. Kiểm tra, lưu rồi bấm Bắt đầu khi sẵn sàng.';
  };
  $('corpComposeToggle').onclick = () => compose($('corpCompose').hidden);
  $('corpComposeClose').onclick = () => compose(false);
  $('corpArenaQueueSummary').onclick=()=>setCorpTab('arena',true);
  for (const tab of section.querySelectorAll('.corp-tab')) tab.onclick = () => setCorpTab(tab.dataset.corpTab, true);
  section.querySelector('.corp-tabs')?.addEventListener('keydown', event => {
    const tabs = [...section.querySelectorAll('.corp-tab')]; const index = tabs.indexOf(document.activeElement); if (index < 0) return;
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); setCorpTab(tabs[next].dataset.corpTab, true); }
  });
  $('corpArenaRefresh').onclick = async () => { try{data=await api('');render();$('corpArenaStatus').textContent='Đã làm mới trạng thái Arena.';$('corpArenaStatus').classList.remove('error');}catch(cause){$('corpArenaStatus').textContent=cause.message;$('corpArenaStatus').classList.add('error');} };
  $('corpArenaCount').onchange=renderArena;
  $('corpArenaFormat').onchange=renderArena;
  $('corpArenaForm').onsubmit = async event => {
    event.preventDefault();if(arenaSending||!data)return;
    const value={kind:'arena',idea:$('corpArenaPrompt').value.trim(),count:Number($('corpArenaCount').value),format:$('corpArenaFormat').value,mode:'build',start:data.enabled,runAfterSetup:false};
    const requestSignature=JSON.stringify(value);if(arenaRequest?.signature!==requestSignature)arenaRequest={signature:requestSignature,key:crypto.randomUUID()};
    arenaSending=true;$('corpArenaForm').setAttribute('aria-busy','true');$('corpArenaPrompt').readOnly=true;$('corpArenaCount').disabled=true;$('corpArenaFormat').disabled=true;renderArena();
    $('corpArenaStatus').textContent = 'Đang lưu yêu cầu khởi tạo...';
    $('corpArenaStatus').classList.remove('error');
    try { const result = await api('/projects', {...value,requestKey:arenaRequest.key});focusBootstrap=result.id;localStorage.setItem('umibridge.corp.bootstrap',result.id);await load();$('corpArenaStatus').textContent=result.status==='paused'?'Đã lưu yêu cầu. Khởi tạo đang tạm dừng; bật Điều phối và bấm Bắt đầu trên thanh khởi tạo khi sẵn sàng.':'Đã lưu yêu cầu. Đang tạo Project, sau đó tạo 8 chat bên trong. Arena sẽ tạm dừng để kiểm tra.';$('corpArenaForm').reset();arenaRequest=null; }
    catch (cause) { $('corpArenaStatus').textContent = cause.message; $('corpArenaStatus').classList.add('error'); }
    finally{arenaSending=false;$('corpArenaForm').setAttribute('aria-busy','false');$('corpArenaPrompt').readOnly=false;$('corpArenaCount').disabled=false;$('corpArenaFormat').disabled=false;renderArena();}
  };
  $('corpSetupToggle').onclick = () => { const open = $('corpSetup').hidden; $('corpSetup').hidden = !open; $('corpSetupToggle').setAttribute('aria-expanded', String(open)); if (open) $('corpSetup').scrollIntoView({block:'nearest'}); };
  $('corpRunFilter').onchange = render;
  $('corpForm').onsubmit = async event => { event.preventDefault(); const project = selectedProject(); const steps = [...$('corpSteps').children].map(field => ({...Object.fromEntries([...field.querySelectorAll('[name]')].map(input => [input.name, input.value])), ...(project ? {workspaceId:project.id} : {})})); const result = await act('/runs', {title:$('corpRunTitle').value, ...(project ? {workspaceId:project.id} : {}), steps}); if (result) { $('corpForm').reset(); $('corpSteps').replaceChildren(); addStep(); $('corpRunFilter').value = 'active'; compose(false); render(); } };
  $('corpProject').onchange = () => { localStorage.setItem('umibridge.corp.project',$('corpProject').value); first = true; for (const select of $('corpSteps').querySelectorAll('select')) select.value = ''; render(); };
  $('corpSync').onclick = async () => {
    const project = selectedProject(); if (!project) return;
    try { const response = await fetch('/admin/api/workspaces/sync',{method:'POST',headers:{'Content-Type':'application/json','X-DC-Admin-Action':'1'},body:JSON.stringify({id:project.id})}); const result = await response.json(); if (!response.ok) throw Error(result.error); await load(); } catch (cause) { error(cause.message); }
  };
  $('corpEnabled').onclick = () => data && act('/settings', {enabled:!data.enabled});
  $('corpOffice').onclick = () => {setCorpTab('office');if(data)void act('/settings', {office:!data.office});};
  $('corpAutoResume').onchange = () => act('/settings', {autoResume:$('corpAutoResume').checked});
  $('corpPair').onclick = async () => { const result = await act('/pair'); if (result) { $('corpPairToken').value = result.token; $('corpPairBox').hidden = false; } };
  $('corpRevoke').onclick = async () => { await act('/revoke'); $('corpPairToken').value = ''; $('corpPairBox').hidden = true; };
  $('corpCopyToken').onclick = () => navigator.clipboard.writeText($('corpPairToken').value).catch(() => { $('corpPairToken').select(); error('Không chép được. Chọn ô mã rồi nhấn Ctrl+C.'); });
  scene.onload = () => { first = true; syncScene(); };
  window.addEventListener('umibridge-view', () => { first = true; syncScene(); if (section.classList.contains('view-active')) void load(); });
  document.addEventListener('visibilitychange',()=>{syncScene();arenaSignature='';renderArena();});
  function expandOffice(expanded) {
    section.classList.toggle('corp-expanded', expanded);
    scene.contentWindow?.postMessage({type:'corp-office-expanded',expanded},location.origin);
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape')expandOffice(false);});
  window.addEventListener('umibridge-view',()=>expandOffice(false));
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== scene.contentWindow) return;
    if(event.data?.type==='corp-office-expand'){expandOffice(!section.classList.contains('corp-expanded'));return;}
    if(event.data?.type==='corp-office-collapse'){expandOffice(false);return;}
    if(event.data?.type!=='corp-open-chat')return;
    const chat = scopedChats().find(item => item.chatId === event.data.id); if (chat) window.open(chat.chatUrl, '_blank', 'noopener,noreferrer');
  });
  setInterval(() => { countdown(); if (section.classList.contains('view-active') && !document.hidden) void load(); }, 2000);
  addStep(); setCorpTab(corpTab); void load();
})();
