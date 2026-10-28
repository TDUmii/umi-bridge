(() => {
  const $ = id => document.getElementById(id), section = $('corp'), scene = $('corpScene');
  let data = null, busy = false, signature = '', first = true, corpTab = localStorage.getItem('umibridge.corp.tab') || 'office';
  let ideaSending=false,ideaRequest=null,directSending=false,directRequest=null,specTab='goals';
  let folderPicking=null, queueDrawerRunId=null;
  let focusBootstrap=localStorage.getItem('umibridge.corp.bootstrap');
  const labels = { reported_complete:'Chờ kiểm chứng',failed:'Thất bại',queued:'Chờ giao việc', dispatching:'Đang gửi', running:'Chờ phản hồi', waiting:'Đang chờ', limit_wait:'Chờ reset hạn mức', blocked:'Cần kiểm tra', paused:'Tạm dừng', done:'Hoàn thành', cancelled:'Đã hủy' };
  const reasons = {chat_mode_unconfirmed:'Chưa xác nhận Chat thường. Chọn Trò chuyện trên web rồi thử lại.', send_unconfirmed:'Chưa xác nhận đã gửi. Mở chat kiểm tra trước khi thử lại.', composer_busy:'Chat đang trả lời hoặc còn bản nháp. Corp giữ nguyên bản nháp.', composer_missing:'Chưa thấy ô nhập. Kiểm tra đăng nhập và giao diện chat.', chat_changed:'Chat đã thay đổi hoặc có lượt gửi khác. Kiểm tra trước khi tiếp tục.', browser_unavailable:'Không kết nối được tab chat.', response_timeout:'Chưa xác nhận kết quả sau 45 phút. Mở chat kiểm tra.', response_too_large:'Kết quả vượt 48.000 ký tự. Chia nhiệm vụ nhỏ hơn.', limit_time_unknown:'Có thông báo hạn mức nhưng không đọc được giờ reset. Cần kiểm tra thủ công.' };
  const node = (tag, value, className) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; };
  reasons.model_selection_unconfirmed='Chưa chọn/xác minh được model và mức suy nghĩ. Kiểm tra Cài đặt và model picker trên ChatGPT trước khi thử lại.';
  reasons.response_unavailable = 'ChatGPT không tải được phản hồi. Kiểm tra kết quả công cụ và chat; không tự chạy lại phần đã thực hiện.';
  reasons.idea_report_invalid='Chat trả lời thiếu báo cáo hoặc bằng chứng cần thiết. Mở chat để kiểm tra, sau đó chuẩn bị thử lại.';
  reasons.idea_stage_blocked='Bộ phận báo chưa thể tiếp tục. Xem báo cáo để bổ sung thông tin hoặc kết nối công cụ.';
  reasons.idea_quality_failed='Chặng nghiệm thu chưa đạt. Xem các lỗi và bằng chứng, xử lý trước khi tiếp tục.';
  reasons.chat_outside_project='Chat đã rời Project. Đồng bộ và kiểm tra lại nhóm nhận việc.';
  const accessModeRecovery='Chế độ truy cập đã thay đổi. Tiếp tục công việc trong Project và chat hiện tại.';
  reasons.access_mode_changed=accessModeRecovery;
  Object.assign(reasons,{invalid_project_spec:'Mỗi mục yêu cầu chi tiết tối đa 1.200 ký tự.',follow_up_requires_completed_project:'Chọn một phiên bản Corp đã hoàn thành để bổ sung.',project_has_open_work:'Project còn công việc chưa kết thúc. Hoàn tất hoặc hủy lượt cũ trước khi bổ sung.',pause_and_reconcile_before_feature_change:'Cần kiểm tra các lượt đang chạy trước khi bật điều phối song song.',project_requirements_too_long:'Yêu cầu quá dài. Rút gọn các mục chi tiết trước khi gửi.'});
  Object.assign(reasons,{folder_path_unavailable:'Không mở được thư mục. Kiểm tra đường dẫn và quyền truy cập.',invalid_parent_root:'Nhập đường dẫn thư mục tuyệt đối hợp lệ.',parent_folder_unavailable:'Thư mục không tồn tại hoặc không có quyền ghi.',project_folder_exists:'Thư mục dự án đã tồn tại. Bấm tạo lại để dùng thư mục riêng.'});
  const selectedProject = () => data?.workspaces.find(item => item.id === $('corpProject').value && item.kind === 'project');
  const scopedChats = () => selectedProject()?.chats || (data?.workspaces || []).filter(item => item.kind !== 'project');
  const scopedRuns = () => (data?.runs||[]).filter(run => selectedProject() ? run.workspaceId === selectedProject().id : !run.workspaceId);
  const teamMembers = () => data?.teams?.find(team=>team.workspaceId===selectedProject()?.id)?.members || [];
  const staffRole = chatId => [...(data?.companyRoles||[]),...(data?.reviewTeams||[])].find(role=>role.id===teamMembers().find(member=>member.chatId===chatId)?.roleId);
  function error(value,source='action') { $('corpError').textContent = value; $('corpError').hidden = !value;$('corpError').dataset.source=source; }
  async function api(path, body) {
    const response = await fetch('/admin/api/corp' + path, body === undefined ? { cache:'no-store' } : { method:'POST', headers:{ 'Content-Type':'application/json', 'X-DC-Admin-Action':'1' }, body:JSON.stringify(body) });
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Gateway đang khởi động hoặc kết nối lại. Tiến độ được giữ; tự kiểm tra lại trong giây lát.');
    const result = await response.json(); if (!response.ok) {
      const messages={invalid_idea:'Nhập ý tưởng từ 4 đến 8.000 ký tự.',project_folder_required:'Project cần có thư mục làm việc. Cập nhật trong Dự án & chat.',invalid_idea_request:'Yêu cầu đã hết hiệu lực. Đóng rồi mở lại phần Từ ý tưởng.',idea_request_conflict:'Ý tưởng đã thay đổi. Thử tạo lại quy trình.',enable_corp_first:'Bật Điều phối trước khi bắt đầu quy trình.',project_not_found:'Chọn một Project trước khi tạo quy trình.',pair_corp_first:'Kết nối extension Corp trước khi tạo Project tự động.',bootstrap_unavailable:'Khởi động lại UmiBridge để nạp chức năng tạo Project.'};
      const cause=Error(result.error?.startsWith('missing_company_roles:')?'Chưa có chat nhận việc cho: '+result.error.split(':')[1].split(',').map(id=>data?.companyRoles?.find(role=>role.id===id)?.department||id).join(', ')+'. Mở Bộ phận để phân công.':messages[result.error]||reasons[result.error]||result.error||'Không cập nhật được Corp');cause.code=result.error;throw cause;
    } return result;
  }
  async function act(path, body = {}) { try { error(''); const result = await api(path, body); await load(); return result; } catch (cause) { error(cause.message); return null; } }
  function button(label, action) { const b = node('button', label, 'btn small'); b.type = 'button'; b.onclick = action; return b; }
  const currentTask=run=>['reported_complete','blocked','running','dispatching','waiting','limit_wait','queued'].map(status=>run.steps.find(step=>step.status===status)).find(Boolean);
  function showDelivery(runId){
    $('corpRunFilter').value='done';setCorpTab('queue');render();
    const article=[...$('corpRuns').children].find(row=>row.dataset.runId===runId);if(!article)return;
    const delivery=article.querySelector('[data-delivery]');if(delivery){delivery.open=true;const journey=delivery.closest('.corp-journey');if(journey)journey.open=true;}
    const target=delivery||article;target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:delivery?'start':'nearest'});
  }
  function closeQueueDrawer(){const drawer=$('corpQueueDrawer');if(drawer?.open)drawer.close();queueDrawerRunId=null;}
  function renderQueueDrawer(run){
    const drawer=$('corpQueueDrawer');if(!drawer)return;
    if(!run){if(drawer.open)drawer.close();return;}
    queueDrawerRunId=run.id;
    $('corpQueueDrawerTitle').textContent=run.title||'Chi tiết hàng đợi';
    const active=currentTask(run), status=labels[active?.status]||labels[run.status]||run.status;
    $('corpQueueDrawerStatus').textContent=(run.customerName||'Khách chưa đặt tên')+' · '+status;
    $('corpQueueDrawerNote').textContent=active?`Việc tiếp theo: ${active.title||active.role}. ${active.status==='running'||active.status==='dispatching'?'Đang chờ phản hồi từ chat.':'Đang chờ xử lý.'}`:run.status==='done'?'Đã bàn giao. Có thể gửi follow-up.':'Chưa có chặng đang xử lý.';
    const steps=$('corpQueueDrawerSteps');steps.replaceChildren();
    for(const [index,step] of run.steps.entries()){
      const li=node('li'), state=labels[step.status]||step.status;li.dataset.state=step.status;
      li.append(node('strong',`${index+1}. ${step.title||step.role}`),node('span',`${step.role} · ${state}`));
      if(step.reason)li.append(node('small',reasons[step.reason]||step.reason,'corp-reason'));
      steps.append(li);
    }
    const actions=$('corpQueueDrawerActions');actions.replaceChildren();
    if(!['done','cancelled'].includes(run.status)){
      const start=button(run.status==='running'?'Tạm dừng':'Bắt đầu',()=>act('/runs/'+run.id+'/'+(run.status==='running'?'pause':'start')));
      start.disabled=run.status!=='running'&&(!data.enabled||active?.status==='blocked');actions.append(start);
      if(['blocked','limit_wait'].includes(active?.status))actions.append(button('Đã kiểm tra chat - thử lại',()=>act('/runs/'+run.id+'/retry')));
    }
    if(run.status==='done'&&run.idea)actions.append(button('Gửi follow-up',()=>{const form=$('corpQueueFollowUp');form.hidden=false;$('corpQueueFollowUpText').focus();}));
    actions.append(button('Đóng',closeQueueDrawer));
    if(!document.activeElement?.closest?.('#corpQueueFollowUp')){$('corpQueueFollowUp').hidden=true;$('corpQueueFollowUpMessage').textContent='';}
    if(!drawer.open)drawer.showModal();
  }
  function openQueueDrawer(run){renderQueueDrawer(run);}
  function loadFollowUp(run){
    if(!run?.idea||ideaSending||directSending)return;
    $('corpIdeaTarget').value='follow-up';setCorpTab('idea');$('corpIdeaWorkflowToggle').click();renderIdea();$('corpFollowUpRun').value=run.id;
    for(const field of $('corpProjectSpecFields').querySelectorAll('textarea'))field.value=run.idea.projectSpec?.[field.dataset.spec]||'';
    for(const field of $('corpReviewTeams').querySelectorAll('input'))field.checked=(run.idea.reviewTeams||[]).includes(field.value);
    $('corpProductProfile').value=run.idea.productProfile||'general';$('corpProductGoal').value=run.idea.productGoal||'';
    $('corpIdeaMode').value=run.idea.mode||'build';$('corpParallel').checked=run.idea.parallelRequested??run.idea.parallel??true;
    $('corpIdeaCustomer').value=run.customerName||'';$('corpIdeaText').value='';ideaRequest=null;
    $('corpIdeaText').placeholder='Mô tả tính năng muốn thêm hoặc thay đổi trên sản phẩm hiện có...';renderIdea();$('corpIdeaText').focus();
  }
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
    const created=data.bootstraps?.find(job=>job.id===focusBootstrap&&job.status==='done'&&job.runId);
    if(created&&[...select.options].some(option=>option.value===created.workspaceId)){select.value=created.workspaceId;localStorage.setItem('umibridge.corp.project',select.value);focusBootstrap=null;localStorage.removeItem('umibridge.corp.bootstrap');first=true;setCorpTab('queue');}
    const project = selectedProject(), status = project?.sync?.status;
    $('corpOpenProject').hidden = $('corpSync').hidden = !project;
    if (project) $('corpOpenProject').href = project.chatUrl;
    $('corpScopeStatus').textContent = project ? project.chats.length + ' chat · ' + ({pending:'Mở Project trong Chrome để đồng bộ',partial:'Đã nhận một phần · Đồng bộ để quét hết',complete:'Đã quét hết danh sách',unavailable:'Chưa đọc được danh sách · Chọn tab Trò chuyện rồi đồng bộ'}[status] || 'Chờ đồng bộ') : scopedChats().length + ' chat';
    $('corpComposeToggle').disabled = !scopedChats().length;
    $('corpTeamToggle').disabled=!project;
    if(!$('corpTeam').hidden&&($('corpTeam').dataset.project!==(project?.id||'')||$('corpTeam').dataset.members!==JSON.stringify(scopedChats().map(chat=>chat.chatId))))renderTeam(true);
    renderIdea();
  }
  function renderDirectBrief(){
    const select=$('corpDirectChat'),chats=scopedChats();
    if(!select)return;
    const signature=JSON.stringify(chats.map(chat=>[chat.id,chat.chatId,chat.name]));
    if(select.dataset.choices!==signature){
      const selected=select.value;select.replaceChildren(new Option(chats.length?'Chọn chat nhận brief':'Chưa có chat Corp',''));
      for(const chat of chats){
        const name=(chat.name||chat.chatId||chat.id).split('\n')[0];
        select.add(new Option(name,chat.chatId||chat.id));
      }
      select.value=[...select.options].some(option=>option.value===selected)?selected:chats[0]?.chatId||chats[0]?.id||'';
      select.dataset.choices=signature;
    }
    select.disabled=directSending||!chats.length;
    $('corpProject').disabled=directSending||ideaSending;
    $('corpIdeaWorkflowToggle').disabled=$('corpDirectToggle').disabled=directSending||ideaSending;
    $('corpDirectBrief').readOnly=directSending;$('corpDirectCustomer').readOnly=directSending;
    $('corpDirectBriefSubmit').disabled=directSending||!chats.length;
    $('corpDirectBriefSubmit').textContent=directSending?'Đang lưu...':data.enabled?'Gửi brief vào chat':'Lưu brief';
    if(!directSending&&!$('corpDirectBriefStatus').dataset.sticky)$('corpDirectBriefStatus').textContent=chats.length?'':'Thêm hoặc đồng bộ chat Corp trước khi gửi.';
  }
  function renderIdea(){
    if(!data)return;
    if(!$('corpProjectSpecFields').children.length)for(const [key,value] of Object.entries(data.projectSpecDefaults||{})){
      const label=node('label',data.projectSpecLabels?.[key]||key),input=node('textarea');input.rows=2;input.maxLength=1200;input.dataset.spec=key;input.placeholder=value;input.setAttribute('form','corpIdeaForm');label.dataset.specGroup=['audience','features','design'].includes(key)?'goals':['platform','technology','storage'].includes(key)?'technical':'acceptance';label.append(input);$('corpProjectSpecFields').append(label);
    }
    for(const label of $('corpProjectSpecFields').children)label.hidden=label.dataset.specGroup!==specTab;
    for(const tab of $('corpSpecTabs').querySelectorAll('button'))tab.setAttribute('aria-pressed',String(tab.dataset.specTab===specTab));
    for(const input of $('corpProjectSpecFields').querySelectorAll('textarea'))input.readOnly=ideaSending;
    const completed=scopedRuns().filter(run=>run.status==='done'&&run.idea&&!run.arenaId),followSelect=$('corpFollowUpRun');
    const completedKey=JSON.stringify(completed.map(run=>[run.id,run.title]));if(followSelect.dataset.choices!==completedKey){const old=followSelect.value;followSelect.replaceChildren(new Option(completed.length?'Chọn phiên bản đã xong':'Chưa có phiên bản đã xong',''));for(const run of [...completed].reverse())followSelect.add(new Option(run.title,run.id));followSelect.value=completed.some(run=>run.id===old)?old:completed.at(-1)?.id||'';followSelect.dataset.choices=completedKey;}
    const followUp=$('corpIdeaTarget').value==='follow-up';$('corpFollowUpField').hidden=!followUp;followSelect.disabled=ideaSending;
    if(!$('corpReviewTeams').children.length){
      for(const row of data.productProfiles||[])$('corpProductProfile').add(new Option(row.name,row.id));
      for(const team of data.reviewTeams||[]){const label=node('label'),input=document.createElement('input'),words=node('span',team.department),small=node('small',team.checks);input.type='checkbox';input.value=team.id;input.onchange=renderIdea;words.append(small);label.append(input,words);$('corpReviewTeams').append(label);}
    }
    $('corpProductStandard').textContent=data.productProfiles?.find(row=>row.id===$('corpProductProfile').value)?.standard||'';
    for(const input of $('corpReviewTeams').querySelectorAll('input'))input.disabled=ideaSending||$('corpIdeaMode').value==='plan';
    $('corpProductProfile').disabled=$('corpProductGoal').readOnly=ideaSending;
    window.umiFolderDialog.initialize('corpIdeaParentRoot',data.projectsRoot);
    const project=selectedProject(),mode=$('corpIdeaMode').value,isNew=$('corpIdeaTarget').value==='new';
    const chosenReviews=[...$('corpReviewTeams').querySelectorAll('input:checked')].map(input=>input.value);
    const extras=(data.reviewTeams||[]).filter(row=>chosenReviews.includes(row.id)).map(row=>({id:'review-'+row.id,roleId:row.id,title:row.department}));
    const stages=(data.ideaStages||[]).filter((stage,index)=>mode==='build'||index<3).flatMap(stage=>stage.id==='repair'?[...extras,stage]:stage.id==='qa-final'?[stage,...extras.map(row=>({...row,id:row.id+'-final',title:row.title+' - nghiệm thu'}))]:[stage]);
    const required=[...new Set([...stages.map(stage=>stage.roleId),...($('corpIdeaMode').value==='build'?chosenReviews:[])])],displayRequired=isNew?['ceo']:required;
    const ready=data.ideaProjects?.find(item=>item.workspaceId===project?.id),members=[...(ready?.members||[])];
    for(const member of teamMembers())if(!members.some(row=>row.chatId===member.chatId))members.push(member);
    const version=data.extensionVersion?.split('.').map(Number),supported=!!version&&(version[0]>0||version[1]>=7);
    const missing=required.filter(id=>!members.some(member=>member.roleId===id));
    $('corpIdeaProject').textContent=isNew?'Tự tạo Project mới; tạo Điều hành trước, các bộ phận khác mở theo chặng.':project?'Project: '+project.name:'Chọn Project ở thanh phía trên để bắt đầu.';
    $('corpIdeaProject').hidden=isNew;
    $('corpIdeaRoot').textContent=project?.root||'Chưa có thư mục làm việc.';$('corpIdeaRoot').hidden=isNew;$('corpIdeaFolder').hidden=!isNew;
    $('corpIdeaParentRoot').readOnly=ideaSending||folderPicking==='corpIdeaParentRoot';$('corpIdeaBrowse').disabled=ideaSending||!!folderPicking;
    $('corpIdeaReadiness').textContent=isNew?(!data.paired?'Kết nối extension Corp để tạo Project.':!supported?'Nạp lại extension Corp.':'Bắt đầu bằng Điều hành; các bộ phận khác chỉ tạo khi chặng cần đến.'):!project?'Chọn Project đã đồng bộ chat.':!stages.length?'Khởi động lại UmiBridge.':`${required.length-missing.length}/${required.length} bộ phận sẵn sàng.`;
    $('corpIdeaReadiness').hidden=!$('corpIdeaReadiness').textContent;
    const signature=JSON.stringify([isNew,project?.id,displayRequired,members,project?.chats]);
    if($('corpIdeaTeam').dataset.signature!==signature){
      $('corpIdeaTeam').dataset.signature=signature;$('corpIdeaTeam').replaceChildren();
      for(const id of displayRequired){const role=[...(data.companyRoles||[]),...(data.reviewTeams||[])].find(role=>role.id===id),member=members.find(member=>member.roleId===id);
        const row=node('div'),name=node('dt',role.department),chat=node('dd',isNew?role.name:member?(project.chats.find(chat=>chat.chatId===member.chatId)?.name.split('\n')[0]||member.chatId):'Chưa có chat');
        if(!isNew&&!member)row.className='missing';if(!isNew&&member?.suggested)chat.append(node('small','Gợi ý theo tên chat'));row.append(name,chat);$('corpIdeaTeam').append(row);
      }
    }
    const parallel=$('corpParallel').checked,sequence=JSON.stringify([parallel,stages.map(stage=>stage.id)]);
    if($('corpIdeaStages').dataset.sequence!==sequence){$('corpIdeaStages').dataset.sequence=sequence;$('corpIdeaStages').replaceChildren();const groups=parallel?mode==='plan'?['Sản phẩm + Thiết kế cùng làm','CEO đối chiếu và chốt kế hoạch']:['Sản phẩm + Thiết kế cùng làm','CEO chốt kế hoạch','Kỹ thuật triển khai','QA + Bảo mật + đội kiểm thử cùng rà soát','Kỹ thuật sửa theo nhận xét','QA cuối + DevOps + Tài liệu cùng kiểm tra','CEO tổng hợp bàn giao']:stages.map(stage=>stage.title);for(const title of groups)$('corpIdeaStages').append(node('li',title));}
    $('corpIdeaStagesTitle').textContent=`${stages.length} chặng thực hiện`;
    $('corpIdeaProcessNote').textContent=mode==='build'?'Có vòng sửa lỗi và nghiệm thu lại, tối đa 2 vòng sửa. Quy trình dừng nếu kiểm thử cuối chưa đạt hoặc một bộ phận bị chặn. Chạy thử và bàn giao ở local.':'Ba chặng tạo brief chi tiết, thiết kế giải pháp và kế hoạch triển khai, được lưu thành tệp trong thư mục dự án.';
    $('corpIdeaDispatch').textContent=data.enabled?'':'Điều phối tắt · lưu tạm dừng.';$('corpIdeaDispatch').hidden=!$('corpIdeaDispatch').textContent;
    $('corpIdeaSubmit').textContent=ideaSending?'Đang tạo...':followUp?'Gửi yêu cầu bổ sung':isNew?'Tạo Project':data.enabled?'Tạo và bắt đầu':'Tạo quy trình';
    $('corpIdeaSubmit').disabled=ideaSending||!!folderPicking||!stages.length||(isNew?!data.paired||!supported:!project||!project.root||!!missing.length)||(followUp&&!followSelect.value);
    $('corpIdeaConfigure').hidden=isNew;$('corpIdeaRun').closest('label').hidden=!isNew;
    $('corpIdeaConfigure').disabled=!project||ideaSending;
    renderDirectBrief();
  }
  function renderBootstraps(){
    const jobs=(data.bootstraps||[]).filter(job=>!['done','cancelled'].includes(job.status));
    $('corpBootstraps').hidden=!jobs.length;
    const runStates=jobs.map(job=>{const run=data.runs?.find(run=>run.id===job.runId),task=run&&currentTask(run);return [run?.status,task?.status,task?.reason,task?.attempt];});
    const signature=JSON.stringify([jobs,data.enabled,runStates]);if($('corpBootstraps').dataset.signature===signature)return;
    $('corpBootstraps').dataset.signature=signature;$('corpBootstraps').replaceChildren();
    const reasons={bootstrap_unconfirmed:'Chưa xác nhận được thao tác tạo. Kiểm tra tab ChatGPT trước khi tiếp tục.',bootstrap_recovery_required:'Không còn tab khởi tạo cũ. Kiểm tra Project/chat đã tạo; hệ thống giữ tiến độ để tránh tạo trùng.',project_create_ui_missing:'Chưa thấy nút tạo Project. Kiểm tra đã đăng nhập ChatGPT và tải lại extension.',bootstrap_ui_timeout:'ChatGPT chưa phản hồi đúng giao diện trong thời gian chờ. Kiểm tra tab khởi tạo.',project_dialog_busy:'Hộp thoại tạo Project đang có nội dung khác. Kiểm tra rồi thử tiếp.',composer_busy:'Chat có bản nháp hoặc đang trả lời. Hoàn tất trước khi tiếp tục.',bootstrap_content_unavailable:'Chưa kết nối được trang ChatGPT. Tải lại extension và tab ChatGPT.',bootstrap_stopped:'Khởi tạo đã dừng theo lựa chọn điều phối.',bootstrap_project_changed:'Tab đã chuyển khỏi Project khởi tạo. Kiểm tra trước khi tiếp tục.'};
    for(const job of jobs){
      const run=data.runs?.find(run=>run.id===job.runId),task=run&&currentTask(run),blocked=task?.status==='blocked';
      const row=node('article',undefined,'corp-bootstrap');row.append(node('strong',job.name));
      const summary=node('p');summary.append(node('span',blocked?'Cần tiếp tục công việc':run?.status==='paused'?'Tạm dừng':{running:'Đang chuẩn bị nhân sự',partial:'Đội ngũ đang làm việc',paused:'Tạm dừng',blocked:'Cần kiểm tra'}[job.status]),' · ',node('span',job.projectId?'Đã tạo Project':'Đang chuẩn bị Project'),' · ',node('span',job.lazy?job.chats.length+' bộ phận đã có · thêm khi cần':job.chats.length+'/'+(8+(job.mode==='plan'?0:(job.reviewTeams||[]).length))+' chat bộ phận'));row.append(summary);
      if(blocked)row.append(node('p',task.reason==='access_mode_changed'?accessModeRecovery:'Nhiệm vụ đang bị chặn. Mở hàng đợi để xem lỗi và cách tiếp tục.','corp-reason'));
      if(job.reason)row.append(node('p',reasons[job.reason]||'Khởi tạo bị chặn: '+job.reason,'corp-reason'));
      const actions=node('div',undefined,'actions');
      if(run&&(run.status==='paused'||blocked)){
        if(task&&(!blocked&&!['reported_complete','limit_wait'].includes(task.status)||task.reason==='access_mode_changed')){const resume=button('Tiếp tục công việc',async()=>{resume.disabled=true;await act('/runs/'+run.id+'/resume');resume.disabled=false;});resume.disabled=!data.enabled;actions.append(resume);}
        else actions.append(button('Xem hàng đợi',()=>{setCorpTab('queue');openQueueDrawer(run);}));
      }else if(!['running','partial'].includes(job.status)){const start=button(job.status==='blocked'?'Kiểm tra và tiếp tục':job.projectId?'Tiếp tục thiết lập':'Bắt đầu',()=>act('/projects/'+job.id+'/start'));start.disabled=!data.enabled;actions.append(start);}
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
    const roles=[...(data.companyRoles||[]),...(data.reviewTeams||[])], members=teamMembers();
    const staffed=new Set(members.filter(member=>project.chats.some(chat=>chat.chatId===member.chatId)).map(member=>member.roleId));
    $('corpTeamSummary').textContent=`${staffed.size}/${roles.length} bộ phận có nhân viên · ${project.chats.length} chat`;
    const departments=node('div',undefined,'corp-departments');
    for(const role of roles){const row=node('div');row.append(node('strong',role.department),node('span',staffed.has(role.id)?'Đã phân công':'Chưa có nhân viên'));row.title=role.brief||role.checks;departments.append(row);}
    root.append(departments);
    for(const chat of project.chats){const label=node('label',chat.name.split('\n')[0]),select=document.createElement('select');select.dataset.chat=chat.chatId;select.add(new Option('Chưa phân công',''));for(const role of roles)select.add(new Option(`${role.department} · ${role.name}`,role.id));select.value=drafts.get(chat.chatId)??members.find(member=>member.chatId===chat.chatId)?.roleId??'';label.append(select);root.append(label);}
  }
  function team(open){if(open)setCorpTab('queue');$('corpTeam').hidden=!open;section.classList.toggle('teaming',open);$('corpTeamToggle').setAttribute('aria-expanded',String(open));if(open)renderTeam();syncScene();sizeWorkspace();}
  function officeSnapshot() {
    if(!data)return null;
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
      a.role = step.role; a.roles = [step.role]; a.task = step.title||run.title; a.taskDetail=step.assessment?.summary||run.title; a.task_id = step.id.slice(0, 8);
      a.status = { queued:'QUEUED', dispatching:'DISPATCHED', running:'WAITING', reported_complete:'REVIEW',failed:'BLOCKED', limit_wait:'LIMIT', blocked:'BLOCKED' }[step.status] || 'IDLE';
      if (run.status === 'paused') a.status = 'PAUSED';
      a.pose = ['dispatching','running'].includes(step.status) && data.enabled && run.status === 'running' ? 'type' : 'idle';
      a.resetAt = step.resetAt;
    }
    for(const agent of agents.values()){
      const role=staffRole(agent.id);agent.chatName=scopedChats().find(chat=>chat.chatId===agent.id)?.name?.split('\n')[0]||agent.role;
      if(role){agent.roleId=role.id;agent.department=role.department;agent.role=role.name;agent.roles=[role.name];}
      else agent.department='Chưa phân công';
    }
    const activeMeeting=runs.find(run=>run.status==='running'&&run.meeting&&run.steps.some(step=>step.stage?.startsWith('meeting-')&&!['done','cancelled'].includes(step.status)));
    for(const agent of agents.values())agent.meeting=!!activeMeeting?.meeting.participants.includes(agent.roleId);
    const order=[...(data.companyRoles||[]),...(data.reviewTeams||[])].map(role=>role.id);
    const handoffs = data.events.filter(event => event.type === 'handoff' && runs.some(run => run.id === event.runId)).map(event => ({ id:event.id, from:event.from, to:event.to, task:event.task, at:event.at }));
    const conversations=runs.flatMap(run=>run.steps.flatMap((step,index)=>{if(!step.result&&!step.recoveredFromArtifact)return [];const next=run.steps[index+1],handoff=data.events.find(event=>event.type==='handoff'&&event.runId===run.id&&event.stepId===next?.id&&event.from===step.chatId),recorded=data.events.find(event=>['done','blocked'].includes(event.type)&&event.runId===run.id&&event.stepId===step.id);return [{id:run.id+':'+step.id,from:step.chatId,to:handoff?.to||null,fromName:step.role,toName:handoff?next.role:null,at:step.completedAt||step.finishedAt||recorded?.at||null,task:step.title||run.title,text:step.result||'[Khôi phục từ artifact đã ghi, không phải phản hồi ChatGPT mới]\n'+step.assessment.summary+'\n'+step.assessment.artifacts.join('\n'),summary:step.assessment?.summary||'',status:step.assessment?.outcome||step.status}];}));
    const project=selectedProject(),projectJob=(data.bootstraps||[]).find(row=>row.workspaceId===project?.id),job=projectJob&&!['done','cancelled'].includes(projectJob.status)?projectJob:null;
    const expected=job?8+(job.mode==='plan'?0:(job.reviewTeams||[]).length):teamMembers().length||agents.size;
    const registered=job?.chats.length??agents.size,rosterConfirmed=!project||projectJob?.status==='done'||project.sync?.status==='complete',staffing={ready:((job?.lazy&&agents.size>0)||!job&&rosterConfirmed&&agents.size>0),expected,registered,message:job?.lazy?'Đang chuẩn bị bộ phận nhận việc đầu tiên.':job?'Đang chuẩn bị đội ngũ. Văn phòng mở khi đủ nhân sự.':!rosterConfirmed?'Đồng bộ danh sách chat đầy đủ trước khi tạo văn phòng.':agents.size?'':'Thêm và phân công nhân sự để tạo văn phòng.'};
    return { project:project?.id || 'umibridge-corp', name:project?.name || 'UmiBridge Corp', coordinator:data.enabled, office:data.office, staffing,meeting:activeMeeting?{request:activeMeeting.meeting.request}:null,conversations,agents:[...agents.values()].sort((a,b)=>(order.indexOf(a.roleId)<0?99:order.indexOf(a.roleId))-(order.indexOf(b.roleId)<0?99:order.indexOf(b.roleId))), handoffs, customers:runs.filter(run=>!['done','cancelled'].includes(run.status)).map(run=>({id:run.id,name:run.customerName||'Chưa đặt tên',title:run.title,status:run.status})), baseline:first };
  }
  function syncScene() {
    if (!data || !scene.contentWindow) return;
    const visible = corpTab === 'office' && section.classList.contains('view-active') && data.office && !section.classList.contains('composing') && !section.classList.contains('teaming') && !section.classList.contains('ideaing') && !document.hidden;
    scene.contentWindow.postMessage({ type:'corp-office', snapshot:officeSnapshot(), visible }, location.origin); first = !visible;
  }
  function setCorpTab(tab, focus = false) {
    const allowed = ['office', 'idea', 'queue']; if (!allowed.includes(tab)) tab = 'office'; corpTab = tab;
    localStorage.setItem('umibridge.corp.tab', tab);section.dataset.corpTab=tab;
    for(const [id,state,toggle] of [['corpCompose','composing','corpComposeToggle'],['corpTeam','teaming','corpTeamToggle']]){$(id).hidden=true;section.classList.remove(state);$(toggle).setAttribute('aria-expanded','false');}
    expandOffice(false);
    for (const button of section.querySelectorAll('.corp-tab')) {
      const active = button.dataset.corpTab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      if (focus && active) button.focus();
    }
    const panels = { office: $('corpPanelOffice'), idea: $('corpIdea'), queue: $('corpPanelQueue') };
    for (const [name, panel] of Object.entries(panels)) if (panel) panel.hidden = name !== tab;
    $('corpIdeaToggle').setAttribute('aria-expanded',String(tab==='idea'));
    section.classList.toggle('ideaing', tab === 'idea');
    if (tab === 'idea') renderIdea();
    syncScene(); sizeWorkspace();
  }
  function render() {
    renderScope();
    if(data)window.dispatchEvent(new CustomEvent('umibridge-orchestration',{detail:data}));
    renderBootstraps();
    $('corpEnabled').textContent = 'Điều phối: ' + (data.enabled ? 'Bật' : 'Tắt'); $('corpEnabled').setAttribute('aria-pressed', String(data.enabled));
    $('corpOffice').textContent = 'Văn phòng: ' + (data.office ? 'Bật' : 'Tắt'); $('corpOffice').setAttribute('aria-pressed', String(data.office)); scene.hidden = !data.office;$('corpOfficeEmpty').hidden=data.office;
    $('corpAutoResume').checked = data.autoResume;
    $('corpConnection').textContent = data.connected ? 'Đã nối · ' + data.connectedChats.length + ' chat đang mở' : data.paired ? 'Extension offline · Mở Chrome để kết nối lại' : 'Chưa ghép extension · Chọn Kết nối';
    section.classList.toggle('office-hidden', !data.office);
    const filter = $('corpRunFilter').value;
    const runs = scopedRuns().filter(run => filter === 'all' || (filter === 'done') === ['done', 'cancelled'].includes(run.status));
    section.classList.toggle('queue-empty', !runs.length);
    $('corpRunCount').textContent = runs.length;
    updateChoices();
    const delivered=scopedRuns().findLast(run=>run.status==='done'&&run.idea&&!run.arenaId);
    const next = JSON.stringify([runs,delivered?.id, data.enabled, data.connected, filter]);
    if (signature !== next) {
      signature = next; $('corpRuns').replaceChildren();
      if(filter==='active'&&delivered){const notice=node('div',undefined,'corp-delivery-notice');notice.append(node('span','Đã bàn giao: '+delivered.title),button('Xem bàn giao',()=>showDelivery(delivered.id)));$('corpRuns').append(notice);}
      if (!runs.length) $('corpRuns').append(node('p', filter === 'active' ? delivered?'Không có công việc đang mở.':'Hàng đợi trống. Chọn Giao việc để bắt đầu.' : 'Chưa có nhiệm vụ trong nhóm này.', 'corp-empty'));
      for (const run of [...runs].reverse()) {
        const article = node('article', undefined, 'corp-run'); article.dataset.status = run.status;article.dataset.runId=run.id;article.tabIndex=-1;
        const activeStep=currentTask(run),completed=run.steps.filter(step=>step.status==='done').length;
        const header=node('header',undefined,'corp-run-heading'),who=node('div');who.append(node('h4',run.customerName||'Khách chưa đặt tên'),node('p',run.title,'corp-customer-task'));
        header.append(who,node('span',labels[activeStep?.status]||labels[run.status]||run.status,'corp-status'));article.append(header);
        const meter=node('div',undefined,'corp-run-meter'),progress=node('progress');progress.max=run.steps.length;progress.value=completed;progress.setAttribute('aria-label','Tiến độ công việc');meter.append(progress,node('span',completed+'/'+run.steps.length+' chặng'));article.append(meter);
        const working=run.steps.filter(step=>['running','dispatching'].includes(step.status));if(working.length>1)article.append(node('p','Đang làm đồng thời: '+working.map(step=>step.title||step.role).join(' · '),'corp-run-parallel'));
        if(activeStep){const focus=node('section',undefined,'corp-run-focus');focus.dataset.state=activeStep.status;focus.append(node('h5',activeStep.title||activeStep.role),node('p',activeStep.role));if(activeStep.reason)focus.append(node('p',reasons[activeStep.reason]||activeStep.reason,'corp-reason'));article.append(focus);}
        if(run.idea){
          const index=run.steps.indexOf(activeStep);
          article.append(node('p',index<0?'Đã kết thúc quy trình':`Chặng ${index+1}/${run.steps.length} · ${run.steps[index].title}`,'corp-idea-progress'));
          const brief=node('details');brief.append(node('summary','Ý tưởng và thư mục đầu ra'),node('p',run.idea.text),node('code',run.idea.root+' / '+run.idea.artifactDir));article.append(brief);
        }
        const journey=node('details',undefined,'corp-journey');journey.append(node('summary','Quy trình · '+run.steps.length+' chặng'));
        const steps = document.createElement('ol');steps.className='corp-stage-grid';
        for (const [stepIndex,step] of run.steps.entries()) {
          const li = node('li');li.dataset.state=step.status;li.append(node('b',String(stepIndex+1),'corp-step-number'));li.append(node('strong', step.title||step.role));if(step.title)li.append(node('small',step.role,'corp-stage-role'));
          li.append(node('span',step.status==='done'&&step.assessment?.outcome==='needs_changes'?'Đã phát hiện lỗi':labels[step.status] || step.status));
          if (step.resetAt && step.status === 'limit_wait') { const stamp = node('time'); stamp.dataset.reset = step.resetAt; stamp.dateTime = new Date(step.resetAt).toISOString(); li.append(stamp); }
          if (step.reason && (reasons[step.reason] || step.reason === 'chat_outside_project')) li.append(node('span', reasons[step.reason] || 'Chat đã rời Project. Đồng bộ và kiểm tra lại phạm vi giao việc.', 'corp-reason'));
          if (step.result||step.assessment) { const details = node('details');if(step===run.steps.at(-1))details.dataset.delivery='true';details.append(node('summary','Kết quả bàn giao'));
            if(step.assessment){details.append(node('p',step.assessment.summary));const checks=node('ul');for(const check of step.assessment.checks)checks.append(node('li',`${{pass:'Đạt',fail:'Chưa đạt',unverified:'Chưa kiểm tra'}[check.status]} · ${check.name}: ${check.evidence}`));details.append(checks);for(const path of step.assessment.artifacts)details.append(node('code',path,'corp-artifact'));}
            else details.append(node('pre',step.result));li.append(details);
          }
          steps.append(li);
        }
        journey.append(steps);article.append(journey); const actions = node('div', undefined, 'actions'), current = activeStep;
        if(run.status==='done'&&run.idea&&!run.arenaId){
          const summary=run.steps.at(-1)?.assessment?.summary;if(summary)article.append(node('p',summary,'corp-delivery-summary'));
          actions.append(button('Xem bàn giao',()=>showDelivery(run.id)),button('Sao chép thư mục',async()=>{try{await navigator.clipboard.writeText(run.idea.root);error('Đã sao chép thư mục.');}catch{const field=node('input');field.value=run.idea.root;field.readOnly=true;field.setAttribute('aria-label','Đường dẫn thư mục để sao chép');actions.append(field);field.focus();field.select();error('Không chép được. Nhấn Ctrl+C để sao chép đường dẫn đang chọn.');}}),button('Yêu cầu bổ sung',()=>loadFollowUp(run)));
        }
        const pending=run.steps.find(step=>step.status==='reported_complete');if(pending)actions.append(button('Kiểm chứng',()=>window.dispatchEvent(new CustomEvent('umibridge-corp-verify',{detail:{runId:run.id,taskId:pending.id}}))));
        if (!['done','cancelled'].includes(run.status)) {
          const start = button(run.status === 'running' ? 'Tạm dừng' : 'Bắt đầu', () => act('/runs/' + run.id + '/' + (run.status === 'running' ? 'pause' : 'start')));
          start.disabled = run.status !== 'running' && (!data.enabled || current?.status === 'blocked'); actions.append(start);
          if (['blocked','limit_wait'].includes(current?.status)) actions.append(button('Đã kiểm tra chat - thử lại', async () => {
            if (await window.umiConfirm('Thử lại nhiệm vụ?', 'Chỉ tiếp tục sau khi đối chiếu chat. Lần trước đã chạy có thể tạo thêm lượt khi gửi lại.','Chuẩn bị thử lại')) void act('/runs/' + run.id + '/retry');
          }));
          actions.append(button('Hủy', () => act('/runs/' + run.id + '/cancel')));
        } else {actions.append(button('Xóa khỏi hàng đợi', () => act('/runs/' + run.id + '/delete')));const source=(data.bootstraps||[]).find(job=>job.runId===run.id);if(run.status==='done'&&source?.cleanupAfterDelivery)actions.append(button('Dọn chat sau bàn giao',()=>window.umiProjectManager?.({channel:'corp',id:source.id,name:source.name,chats:source.chats||[],projectUrl:source.projectUrl})));}
        if (current) { const a = node('a', 'Mở chat', 'btn small'); a.href = current.chatUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; actions.append(a); }
        actions.prepend(button('Việc tiếp theo',()=>openQueueDrawer(run)));
        article.append(actions); $('corpRuns').append(article);
      }
      renderQueueDrawer(queueDrawerRunId ? scopedRuns().find(run=>run.id===queueDrawerRunId) : null);
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
    try { data = await api('');if($('corpError').dataset.source==='connection')error('','connection');render(); }
    catch (cause) { if($('corpError').hidden||$('corpError').dataset.source==='connection')error(cause.message,'connection');scene.contentWindow?.postMessage({type:'corp-office-error'}, location.origin); }
    finally { busy = false; }
  }
  $('corpAddStep').onclick = addStep;
  function compose(open) { if(open)setCorpTab('queue');$('corpCompose').hidden = !open; section.classList.toggle('composing', open); $('corpComposeToggle').setAttribute('aria-expanded', String(open)); syncScene();sizeWorkspace(); if (open) $('corpRunTitle').focus(); }
  $('corpIdeaToggle').onclick=()=>{if($('corpIdea').hidden){setCorpTab('idea');idea(true);}else{idea(false);setCorpTab('office');}};
  $('corpIdeaClose').onclick=()=>setCorpTab('office',true);
  $('corpIdeaConfigure').onclick=()=>team(true);
  $('corpIdeaMode').onchange=renderIdea;
  $('corpProductProfile').onchange=renderIdea;
  $('corpIdeaTarget').onchange=()=>{renderIdea();if($('corpIdeaTarget').value==='follow-up')loadFollowUp(scopedRuns().find(run=>run.id===$('corpFollowUpRun').value));};
  $('corpFollowUpRun').onchange=()=>loadFollowUp(scopedRuns().find(run=>run.id===$('corpFollowUpRun').value));
  $('corpParallel').onchange=renderIdea;
  $('corpSpecTabs').onclick=event=>{const button=event.target.closest('[data-spec-tab]');if(button){specTab=button.dataset.specTab;renderIdea();}};
  $('corpIdeaBrowse').onclick=()=>window.umiFolderDialog.open('corpIdeaParentRoot','corpIdeaBrowse','corpIdeaFolderStatus');
  $('corpIdeaParentRoot').oninput=()=>window.umiFolderDialog.remember($('corpIdeaParentRoot'));
  window.addEventListener('umibridge-folder-dialog',event=>{if(event.detail.inputId==='corpIdeaParentRoot'){folderPicking=event.detail.open?'corpIdeaParentRoot':null;renderIdea();}});
  $('corpIdeaForm').onsubmit=async event=>{
    event.preventDefault();if(ideaSending||directSending||folderPicking)return;const project=selectedProject(),isNew=$('corpIdeaTarget').value==='new';if(!isNew&&!project)return;
    const followUp=$('corpIdeaTarget').value==='follow-up',projectSpec=Object.fromEntries([...$('corpProjectSpecFields').querySelectorAll('textarea')].map(field=>[field.dataset.spec,field.value.trim()]));
    const value={...(isNew?{parentRoot:$('corpIdeaParentRoot').value.trim()}:{workspaceId:project.id}),parallel:$('corpParallel').checked,projectSpec,cleanupAfterDelivery:$('corpCleanupAfterDelivery').checked,customerName:$('corpIdeaCustomer').value.trim(),idea:$('corpIdeaText').value.trim(),mode:$('corpIdeaMode').value,productProfile:$('corpProductProfile').value||'general',productGoal:$('corpProductGoal').value.trim(),reviewTeams:[...$('corpReviewTeams').querySelectorAll('input:checked')].map(input=>input.value),start:data.enabled,...(isNew?{runAfterSetup:$('corpIdeaRun').checked,staffingMode:'lazy'}:{})};
    if(isNew)window.umiFolderDialog.remember($('corpIdeaParentRoot'));
    const signature=JSON.stringify(value);if(ideaRequest?.signature!==signature)ideaRequest={signature,key:crypto.randomUUID()};
    ideaSending=true;$('corpIdeaForm').setAttribute('aria-busy','true');$('corpIdeaText').readOnly=true;$('corpIdeaCustomer').readOnly=true;$('corpIdeaMode').disabled=true;$('corpIdeaTarget').disabled=true;$('corpProject').disabled=true;renderIdea();$('corpIdeaError').hidden=true;
    try {const result=await api(followUp?'/runs/'+$('corpFollowUpRun').value+'/follow-up':isNew?'/projects':'/ideas',{...value,requestKey:ideaRequest.key});if(isNew){focusBootstrap=result.id;localStorage.setItem('umibridge.corp.bootstrap',result.id);}await load();$('corpIdeaText').value='';ideaRequest=null;setCorpTab('queue');$('corpRunFilter').value='active';render();}
    catch(cause){if(cause.code==='project_folder_exists')ideaRequest=null;$('corpIdeaError').textContent=cause.message;$('corpIdeaError').hidden=false;}
    finally{ideaSending=false;$('corpIdeaForm').setAttribute('aria-busy','false');$('corpIdeaText').readOnly=false;$('corpIdeaCustomer').readOnly=false;$('corpIdeaMode').disabled=false;$('corpIdeaTarget').disabled=false;$('corpProject').disabled=false;renderIdea();}
  };
  $('corpDirectBriefForm').onsubmit=async event=>{
    event.preventDefault();if(directSending||ideaSending)return;
    const chats=scopedChats(),chat=chats.find(item=>(item.chatId||item.id)===$('corpDirectChat').value),project=selectedProject(),prompt=$('corpDirectBrief').value.trim();
    if(!chat||prompt.length<4)return;
    const title=`Brief Corp · ${prompt.split(/\r?\n/,1)[0].slice(0,120)}`;
    const body={title,customerName:$('corpDirectCustomer').value.trim(),...(project?{workspaceId:project.id}:{}),steps:[{workspaceId:project?.id||chat.id,chatId:chat.chatId,role:chat.name?.split('\n')[0]||'Nhân viên Corp',prompt}]};
    const signature=JSON.stringify(body);if(directRequest?.signature!==signature)directRequest={signature,key:crypto.randomUUID(),runId:null};
    directSending=true;$('corpDirectBriefForm').setAttribute('aria-busy','true');$('corpDirectBriefStatus').dataset.sticky='true';$('corpDirectBriefStatus').textContent='Đang lưu brief...';renderDirectBrief();
    $('corpProject').disabled=true;
    try {
      const run=directRequest.runId?{id:directRequest.runId}:await api('/runs',{...body,requestKey:directRequest.key});directRequest.runId=run.id;
      if(data.enabled){await api('/runs/'+run.id+'/start',{});$('corpDirectBriefStatus').textContent='Đã xếp lượt gửi. Xem tiến độ trong Hàng đợi.';}
      else $('corpDirectBriefStatus').textContent='Đã lưu ở trạng thái tạm dừng. Bật Điều phối rồi mở Hàng đợi để gửi.';
      $('corpDirectBrief').value='';$('corpDirectCustomer').value='';directRequest=null;await load();
    } catch(cause) { $('corpDirectBriefStatus').textContent=directRequest?.runId?'Brief đã lưu. Chưa xác nhận xếp lượt gửi; kiểm tra Hàng đợi. '+cause.message:cause instanceof TypeError?'Chưa xác nhận brief đã lưu. Giữ nguyên nội dung và thử lại để đối chiếu.':cause.message; }
    finally { directSending=false;$('corpProject').disabled=false;$('corpDirectBriefForm').setAttribute('aria-busy','false');renderDirectBrief(); }
  };
  $('corpDirectBrief').oninput=()=>{delete $('corpDirectBriefStatus').dataset.sticky;$('corpDirectBriefStatus').textContent='';};
  $('corpIdeaWorkflowToggle').onclick=()=>{ $('corpIdeaWorkflow').hidden=false;$('corpDirectSection').hidden=true;$('corpIdeaWorkflowToggle').setAttribute('aria-pressed','true');$('corpDirectToggle').setAttribute('aria-pressed','false'); };
  $('corpDirectToggle').onclick=()=>{ $('corpIdeaWorkflow').hidden=true;$('corpDirectSection').hidden=false;$('corpIdeaWorkflowToggle').setAttribute('aria-pressed','false');$('corpDirectToggle').setAttribute('aria-pressed','true');$('corpDirectBrief').focus(); };
  $('corpTeamToggle').onclick=()=>team($('corpTeam').hidden);
  $('corpProjectManage').onclick=()=>{const project=selectedProject(),job=(data.bootstraps||[]).find(row=>row.workspaceId===project?.id);if(!project){error('Chọn Project để quản lý chat.');return;}window.umiProjectManager?.({channel:'corp',id:job?.id||project.id,gitId:job?.id,name:job?.name||project.name,chats:project.chats||job?.chats||[],projectUrl:project.chatUrl||project.projectUrl,onSync:()=>$('corpSync').click()});};
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
  for (const tab of section.querySelectorAll('.corp-tab')) tab.onclick = () => setCorpTab(tab.dataset.corpTab, true);
  section.querySelector('.corp-tabs')?.addEventListener('keydown', event => {
    const tabs = [...section.querySelectorAll('.corp-tab')]; const index = tabs.indexOf(document.activeElement); if (index < 0) return;
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); setCorpTab(tabs[next].dataset.corpTab, true); }
  });
  $('corpSetupToggle').onclick = () => { const open = $('corpSetup').hidden; $('corpSetup').hidden = !open; $('corpSetupToggle').setAttribute('aria-expanded', String(open)); if (open) $('corpSetup').scrollIntoView({block:'nearest'}); };
  $('corpRunFilter').onchange = render;
  $('corpQueueDrawerClose').onclick=closeQueueDrawer;
  $('corpQueueDrawer').addEventListener('cancel',event=>{event.preventDefault();closeQueueDrawer();});
  $('corpQueueFollowUp').onsubmit=async event=>{
    event.preventDefault();const run=scopedRuns().find(item=>item.id===queueDrawerRunId),text=$('corpQueueFollowUpText').value.trim();
    if(!run?.idea||text.length<4)return;
    const submit=$('corpQueueFollowUpSubmit');submit.disabled=true;$('corpQueueFollowUpMessage').textContent='Đang gửi follow-up...';
    try{await api('/runs/'+run.id+'/follow-up',{requestKey:crypto.randomUUID(),workspaceId:run.workspaceId,idea:text,parallel:run.idea.parallelRequested??run.idea.parallel??true,projectSpec:run.idea.projectSpec||{},productProfile:run.idea.productProfile||'general',productGoal:run.idea.productGoal||'',reviewTeams:run.idea.reviewTeams||[],mode:run.idea.mode||'build',customerName:run.customerName||'',start:data.enabled});$('corpQueueFollowUpMessage').textContent='Đã xếp follow-up vào hàng đợi.';$('corpQueueFollowUpText').value='';await load();setTimeout(closeQueueDrawer,250);
    }catch(cause){$('corpQueueFollowUpMessage').textContent=cause.message;}
    finally{if(submit.isConnected)submit.disabled=false;}
  };
  $('corpForm').onsubmit = async event => { event.preventDefault(); const project = selectedProject(); const steps = [...$('corpSteps').children].map(field => ({...Object.fromEntries([...field.querySelectorAll('[name]')].map(input => [input.name, input.value])), ...(project ? {workspaceId:project.id} : {})})); const result = await act('/runs', {title:$('corpRunTitle').value, customerName:$('corpCustomerName').value.trim(), ...(project ? {workspaceId:project.id} : {}), steps}); if (result) { $('corpForm').reset(); $('corpSteps').replaceChildren(); addStep(); $('corpRunFilter').value = 'active'; compose(false); render(); } };
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
  window.umiCorpLayout={refresh:load,getSnapshot:officeSnapshot,selectProject(id){if(!$('corpProject').disabled&&[...$('corpProject').options].some(option=>option.value===id)){$('corpProject').value=id;$('corpProject').dispatchEvent(new Event('change'));}},openChat(id){const chat=scopedChats().find(item=>item.chatId===id);if(chat)window.open(chat.chatUrl,'_blank','noopener,noreferrer');}};
  window.addEventListener('umibridge-corp-navigate',event=>{
    const {workspaceId,runId,action,filter}=event.detail||{};if(!data||ideaSending||directSending||folderPicking)return;
    const target=data.runs.find(run=>run.id===runId),scope=workspaceId||target?.workspaceId;
    if(scope){if(![...$('corpProject').options].some(option=>option.value===scope)){error('Project chưa có trong danh sách. Đồng bộ rồi thử lại.');return;}if(target&&target.workspaceId!==scope){error('Công việc không thuộc Project đã chọn.');return;}$('corpProject').value=scope;$('corpProject').dispatchEvent(new Event('change'));}
    if(action==='follow-up'){if(target?.status==='done'&&target.idea)loadFollowUp(target);else error('Chọn phiên bản đã bàn giao để bổ sung.');}
    else if(action==='new'){$('corpIdeaTarget').value='new';setCorpTab('idea');$('corpIdeaWorkflowToggle').click();renderIdea();$('corpIdeaText').placeholder='Mô tả sản phẩm và yêu cầu của bạn...';$('corpIdeaText').focus();}
    else if(action==='queue'){if(!target&&['active','done','all'].includes(filter))$('corpRunFilter').value=filter;setCorpTab('queue');if(target){$('corpRunFilter').value=['done','cancelled'].includes(target.status)?'done':'active';render();const article=[...$('corpRuns').children].find(row=>row.dataset.runId===target.id);article?.focus();article?.scrollIntoView({block:'nearest'});}else render();}
  });
  window.addEventListener('umibridge-view', () => { first = true; syncScene(); if (section.classList.contains('view-active')) void load(); });
  document.addEventListener('visibilitychange',syncScene);
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
