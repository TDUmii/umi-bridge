(() => {
  const $ = id => document.getElementById(id), section = $('corp'), scene = $('corpScene');
  let data = null, busy = false, signature = '', first = true;
  const labels = { queued:'Chờ giao việc', dispatching:'Đang gửi', running:'Chờ phản hồi', limit_wait:'Chờ reset hạn mức', blocked:'Cần kiểm tra', paused:'Tạm dừng', done:'Hoàn thành', cancelled:'Đã hủy' };
  const reasons = { send_unconfirmed:'Chưa xác nhận đã gửi. Mở chat kiểm tra trước khi thử lại.', composer_busy:'Chat đang trả lời hoặc còn bản nháp. Corp giữ nguyên bản nháp.', composer_missing:'Chưa thấy ô nhập. Kiểm tra đăng nhập và giao diện chat.', chat_changed:'Chat đã thay đổi hoặc có lượt gửi khác. Kiểm tra trước khi tiếp tục.', browser_unavailable:'Không kết nối được tab chat.', response_timeout:'Chưa xác nhận kết quả sau 45 phút. Mở chat kiểm tra.', response_too_large:'Kết quả vượt 48.000 ký tự. Chia nhiệm vụ nhỏ hơn.', limit_time_unknown:'Có thông báo hạn mức nhưng không đọc được giờ reset. Cần kiểm tra thủ công.' };
  const node = (tag, value, className) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; };
  const selectedProject = () => data?.workspaces.find(item => item.id === $('corpProject').value && item.kind === 'project');
  const scopedChats = () => selectedProject()?.chats || (data?.workspaces || []).filter(item => item.kind !== 'project');
  const scopedRuns = () => data.runs.filter(run => selectedProject() ? run.workspaceId === selectedProject().id : !run.workspaceId);
  function error(value) { $('corpError').textContent = value; $('corpError').hidden = !value; }
  async function api(path, body) {
    const response = await fetch('/admin/api/corp' + path, body === undefined ? { cache:'no-store' } : { method:'POST', headers:{ 'Content-Type':'application/json', 'X-DC-Admin-Action':'1' }, body:JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw Error(result.error || 'Không cập nhật được Corp'); return result;
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
    const project = selectedProject(), status = project?.sync?.status;
    $('corpOpenProject').hidden = $('corpSync').hidden = !project;
    if (project) $('corpOpenProject').href = project.chatUrl;
    $('corpScopeStatus').textContent = project ? project.chats.length + ' chat · ' + ({pending:'Mở Project trong Chrome để đồng bộ',partial:'Đã nhận một phần · Đồng bộ để quét hết',complete:'Đã quét hết danh sách',unavailable:'Chưa đọc được danh sách · Chọn tab Trò chuyện rồi đồng bộ'}[status] || 'Chờ đồng bộ') : scopedChats().length + ' chat';
    $('corpComposeToggle').disabled = !scopedChats().length;
  }
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
        if (!a.count) { a.role=step.role; a.roles=[step.role]; a.status='COMPLETED'; a.pose='read'; a.task=step.prompt; }
        continue;
      }
      a.count++; if (a.task_id && step.status === 'queued') continue;
      a.role = step.role; a.roles = [step.role]; a.task = step.prompt; a.task_id = step.id.slice(0, 8);
      a.status = { queued:'QUEUED', dispatching:'DISPATCHED', running:'WAITING', limit_wait:'LIMIT', blocked:'BLOCKED' }[step.status] || 'IDLE';
      if (run.status === 'paused') a.status = 'PAUSED';
      a.pose = step.status === 'dispatching' && data.enabled && run.status === 'running' ? 'type' : 'idle';
      a.resetAt = step.resetAt;
    }
    const handoffs = data.events.filter(event => event.type === 'handoff' && runs.some(run => run.id === event.runId)).map(event => ({ id:event.id, from:event.from, to:event.to, task:event.task, at:event.at }));
    return { project:selectedProject()?.id || 'umibridge-corp', name:selectedProject()?.name || 'UmiBridge Corp', coordinator:data.enabled, agents:[...agents.values()], handoffs, baseline:first };
  }
  function syncScene() {
    if (!data || !scene.contentWindow) return;
    const visible = section.classList.contains('view-active') && data.office && !section.classList.contains('composing') && !document.hidden;
    scene.contentWindow.postMessage({ type:'corp-office', snapshot:officeSnapshot(), visible }, location.origin); first = !visible;
  }
  function render() {
    renderScope();
    $('corpEnabled').textContent = 'Điều phối: ' + (data.enabled ? 'Bật' : 'Tắt'); $('corpEnabled').setAttribute('aria-pressed', String(data.enabled));
    $('corpOffice').textContent = 'Văn phòng: ' + (data.office ? 'Bật' : 'Tắt'); $('corpOffice').setAttribute('aria-pressed', String(data.office)); scene.hidden = !data.office;
    $('corpAutoResume').checked = data.autoResume;
    $('corpConnection').textContent = data.connected ? 'Đã nối · ' + data.connectedChats.length + ' chat đang mở' : data.paired ? 'Extension offline · Mở Chrome để kết nối lại' : 'Chưa ghép extension · Chọn Kết nối';
    section.classList.toggle('office-hidden', !data.office);
    const filter = $('corpRunFilter').value;
    const runs = scopedRuns().filter(run => filter === 'all' || (filter === 'done') === ['done', 'cancelled'].includes(run.status));
    $('corpRunCount').textContent = runs.length;
    updateChoices();
    const next = JSON.stringify([runs, data.enabled, data.connected, filter]);
    if (signature !== next) {
      signature = next; $('corpRuns').replaceChildren();
      if (!runs.length) $('corpRuns').append(node('p', filter === 'active' ? 'Hàng đợi trống. Chọn Giao việc để bắt đầu.' : 'Chưa có nhiệm vụ trong nhóm này.', 'corp-empty'));
      for (const run of [...runs].reverse()) {
        const article = node('article', undefined, 'corp-run'); article.dataset.status = run.status; article.append(node('h4', run.title), node('span', labels[run.status] || run.status, 'corp-status'));
        const steps = document.createElement('ol');
        for (const step of run.steps) {
          const li = node('li'); li.append(node('strong', step.role), node('span', labels[step.status] || step.status));
          if (step.resetAt && step.status === 'limit_wait') { const stamp = node('time'); stamp.dataset.reset = step.resetAt; stamp.dateTime = new Date(step.resetAt).toISOString(); li.append(stamp); }
          if (step.reason && (reasons[step.reason] || step.reason === 'chat_outside_project')) li.append(node('span', reasons[step.reason] || 'Chat đã rời Project. Đồng bộ và kiểm tra lại phạm vi giao việc.', 'corp-reason'));
          if (step.result) { const details = node('details'); details.append(node('summary', 'Kết quả bàn giao'), node('pre', step.result)); li.append(details); }
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
    countdown(); syncScene();
  }
  function countdown() { for (const el of section.querySelectorAll('[data-reset]')) { const at = Number(el.dataset.reset), seconds = Math.max(0, Math.ceil((at - Date.now()) / 1000)); el.textContent = 'Tiếp tục sau ' + Math.floor(seconds / 3600) + ' giờ ' + Math.floor(seconds % 3600 / 60) + ' phút ' + seconds % 60 + ' giây - ' + new Date(at).toLocaleTimeString('vi-VN') + (seconds === 0 ? ' (đợi extension kiểm tra lại)' : ''); } }
  async function load() {
    if (busy) return; busy = true;
    try { data = await api(''); render(); }
    catch (cause) { error(cause.message); scene.contentWindow?.postMessage({type:'corp-office-error'}, location.origin); }
    finally { busy = false; }
  }
  $('corpAddStep').onclick = addStep;
  function compose(open) { $('corpCompose').hidden = !open; section.classList.toggle('composing', open); $('corpComposeToggle').setAttribute('aria-expanded', String(open)); syncScene(); if (open) $('corpRunTitle').focus(); else $('corpComposeToggle').focus(); }
  $('corpComposeToggle').onclick = () => compose($('corpCompose').hidden);
  $('corpComposeClose').onclick = () => compose(false);
  $('corpSetupToggle').onclick = () => { const open = $('corpSetup').hidden; $('corpSetup').hidden = !open; $('corpSetupToggle').setAttribute('aria-expanded', String(open)); if (open) $('corpSetup').scrollIntoView({block:'nearest'}); };
  $('corpRunFilter').onchange = render;
  $('corpForm').onsubmit = async event => { event.preventDefault(); const project = selectedProject(); const steps = [...$('corpSteps').children].map(field => ({...Object.fromEntries([...field.querySelectorAll('[name]')].map(input => [input.name, input.value])), ...(project ? {workspaceId:project.id} : {})})); const result = await act('/runs', {title:$('corpRunTitle').value, ...(project ? {workspaceId:project.id} : {}), steps}); if (result) { $('corpForm').reset(); $('corpSteps').replaceChildren(); addStep(); $('corpRunFilter').value = 'active'; compose(false); render(); } };
  $('corpProject').onchange = () => { localStorage.setItem('umibridge.corp.project',$('corpProject').value); first = true; for (const select of $('corpSteps').querySelectorAll('select')) select.value = ''; render(); };
  $('corpSync').onclick = async () => {
    const project = selectedProject(); if (!project) return;
    try { const response = await fetch('/admin/api/workspaces/sync',{method:'POST',headers:{'Content-Type':'application/json','X-DC-Admin-Action':'1'},body:JSON.stringify({id:project.id})}); const result = await response.json(); if (!response.ok) throw Error(result.error); await load(); } catch (cause) { error(cause.message); }
  };
  $('corpEnabled').onclick = () => data && act('/settings', {enabled:!data.enabled});
  $('corpOffice').onclick = () => data && act('/settings', {office:!data.office});
  $('corpAutoResume').onchange = () => act('/settings', {autoResume:$('corpAutoResume').checked});
  $('corpPair').onclick = async () => { const result = await act('/pair'); if (result) { $('corpPairToken').value = result.token; $('corpPairBox').hidden = false; } };
  $('corpRevoke').onclick = async () => { await act('/revoke'); $('corpPairToken').value = ''; $('corpPairBox').hidden = true; };
  $('corpCopyToken').onclick = () => navigator.clipboard.writeText($('corpPairToken').value).catch(() => { $('corpPairToken').select(); error('Không chép được. Chọn ô mã rồi nhấn Ctrl+C.'); });
  scene.onload = () => { first = true; syncScene(); };
  window.addEventListener('umibridge-view', () => { first = true; syncScene(); if (section.classList.contains('view-active')) void load(); });
  document.addEventListener('visibilitychange', syncScene);
  window.addEventListener('message', event => { if (event.origin !== location.origin || event.source !== scene.contentWindow || event.data?.type !== 'corp-open-chat') return; const chat = scopedChats().find(item => item.chatId === event.data.id); if (chat) window.open(chat.chatUrl, '_blank', 'noopener,noreferrer'); });
  setInterval(() => { countdown(); if (section.classList.contains('view-active') && !document.hidden) void load(); }, 2000);
  addStep(); void load();
})();
