(() => {
  const $ = id => document.getElementById(id), section = $('watch'), frame = $('watchCorpScene');
  if (!section) return;
  const labels = {setup:'Khởi tạo',paused:'Tạm dừng',running:'Đang hoạt động',done:'Hoàn tất',cancelled:'Đã hủy',blocked:'Cần kiểm tra'};
  let data = null, busy = false, signature = '', baseline = true, selected = localStorage.getItem('umibridge.watch.arena') || '';
  const visible = () => section.classList.contains('view-active') && !document.hidden;
  const paneVisible = pane => visible() && (!section.dataset.focusPane || section.dataset.focusPane === pane);
  const current = () => data?.arenas.find(item => item.id === selected) || data?.arenas[0];
  function choices(select, list, value, empty) {
    const next = JSON.stringify(list);
    if (select.dataset.choices !== next) { select.replaceChildren(...(list.length ? list.map(([id,name]) => new Option(name,id)) : [new Option(empty,'')])); select.dataset.choices = next; }
    if ([...select.options].some(option => option.value === value)) select.value = value;
    select.disabled = !list.length;
  }
  function renderArena() {
    const arena = current(), job = data?.bootstraps.find(item => item.arenaId === arena?.id || item.id === arena?.id);
    if (arena) { selected = arena.id; localStorage.setItem('umibridge.watch.arena',selected); }
    choices($('watchArenaSelect'),(data?.arenas || []).map(item => [item.id,item.title]),selected,'Chưa có Arena');
    $('watchArenaTitle').textContent = arena?.title || 'Đấu trường Arena';
    $('watchArenaState').textContent = labels[arena?.status] || 'Chờ ý tưởng';
    const next = JSON.stringify([arena,job,data?.enabled,paneVisible('arena'),matchMedia('(prefers-reduced-motion: reduce)').matches]);
    if (next !== signature && window.umiArenaLayout) {
      signature = next;
      $('watchArenaScene').replaceChildren(window.umiArenaLayout.renderWorld(arena,job,{enabled:data?.enabled,visible:paneVisible('arena'),compact:true}));
    }
  }
  function syncCorp() {
    const snapshot = window.umiCorpLayout?.getSnapshot();
    if (!snapshot) return;
    choices($('watchCorpSelect'),[...$('corpProject').options].map(option => [option.value,option.textContent]),$('corpProject').value,'Chưa có Project');
    $('watchCorpSelect').disabled = $('corpProject').disabled;
    $('watchCorpTitle').textContent = snapshot.name;
    const working = snapshot.agents.filter(agent => ['DISPATCHED','WAITING'].includes(agent.status)).length;
    $('watchCorpState').textContent = working ? `${working} chat đang xử lý` : snapshot.coordinator ? 'Sẵn sàng' : 'Điều phối tắt';
    const show = snapshot.office !== false;
    frame.hidden = !show; $('watchCorpEmpty').hidden = show;
    frame.contentWindow?.postMessage({type:'corp-office',snapshot:{...snapshot,baseline},visible:paneVisible('corp') && show},location.origin);
    baseline = !paneVisible('corp') || !show;
  }
  async function load() {
    if (busy || !visible()) return;
    busy = true;
    try {
      const [response] = await Promise.all([fetch('/admin/api/arena',{cache:'no-store'}),window.umiCorpLayout?.refresh()]);
      if (!response.ok) throw Error('Không tải được Arena. Bấm Làm mới để thử lại.');
      data = await response.json(); $('watchError').hidden = true;
      renderArena(); syncCorp();
    } catch (cause) { $('watchError').textContent = cause.message; $('watchError').hidden = false; }
    finally { busy = false; }
  }
  function focusPane(pane) {
    section.dataset.focusPane = section.dataset.focusPane === pane ? '' : pane;
    for (const button of section.querySelectorAll('[data-watch-expand]')) button.setAttribute('aria-pressed',String(section.dataset.focusPane === button.dataset.watchExpand));
    renderArena(); syncCorp();
  }
  $('watchArenaSelect').onchange = event => { selected = event.target.value; signature = ''; renderArena(); };
  $('watchCorpSelect').onchange = event => { window.umiCorpLayout?.selectProject(event.target.value); baseline = true; syncCorp(); };
  $('watchRefresh').onclick = () => void load();
  frame.onload = () => { baseline = true; syncCorp(); };
  for (const button of section.querySelectorAll('[data-watch-expand]')) button.onclick = () => focusPane(button.dataset.watchExpand);
  window.addEventListener('message',event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'corp-open-chat') window.umiCorpLayout?.openChat(event.data.id);
    if (event.data?.type === 'corp-office-expand') focusPane('corp');
    if (event.data?.type === 'corp-office-collapse') { section.dataset.focusPane = ''; renderArena(); syncCorp(); }
  });
  function viewChanged() { signature = ''; renderArena(); syncCorp(); if (!visible()) baseline = true; else void load(); }
  window.addEventListener('umibridge-view',viewChanged);
  document.addEventListener('visibilitychange',viewChanged);
  document.addEventListener('keydown',event => { if (event.key === 'Escape') { section.dataset.focusPane = ''; for (const button of section.querySelectorAll('[data-watch-expand]')) button.setAttribute('aria-pressed','false'); renderArena(); syncCorp(); } });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',() => { signature = ''; renderArena(); });
  setInterval(() => void load(),2000);
  void load();
})();
