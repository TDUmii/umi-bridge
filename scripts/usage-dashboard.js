(() => {
  'use strict';
  const $ = id => document.getElementById(id), section = $('analytics');
  const fmt = value => value == null ? '-' : Number(value).toLocaleString('vi-VN');
  const ms = value => value == null ? '-' : value < 1000 ? fmt(value) + ' ms' : fmt(Math.round(value / 100) / 10) + ' s';
  const date = value => new Date(value).toLocaleString('vi-VN', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
  const usageLanguage=()=>localStorage.getItem('umibridge.admin.language')||document.documentElement.lang;
  for(const [value,vi,en]of [['projects','Project','Project'],['tasks','DAG task','DAG task'],['workers','Worker','Worker'],['roles','Vai trò','Role'],['attempts','Attempt','Attempt']])$('usageGroup').add(new Option(usageLanguage()==='en'?en:vi,value));
  const element = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  const diagnostics=element('section',null,'usage-diagnostics');diagnostics.id='usageDiagnostics';diagnostics.hidden=true;$('usageOverview').after(diagnostics);const diagnosticTab=element('button','Phân tích sâu','btn');diagnosticTab.type='button';diagnosticTab.dataset.pane='diagnostics';diagnosticTab.setAttribute('aria-pressed','false');$('usageTabs').insertBefore(diagnosticTab,$('usageCoverage'));
  let report = null, page = 0, period = '7d', sequence = 0, controller, timer, cost = {};
  try { cost = JSON.parse(localStorage.getItem('umibridge.usage.budget') || '{}') || {}; } catch {}
  for (const [key, id] of Object.entries({input:'usageInputRate', output:'usageOutputRate', budget:'usageBudget'})) {
    if (Number.isFinite(cost[key]) && cost[key] >= 0) $(id).value = cost[key];
  }
  function error(message) { $('usageError').textContent = message; $('usageError').hidden = !message; }
  function selectOptions(id, values) {
    const select = $(id), value = select.value, signature = JSON.stringify(values);
    if (select.dataset.options === signature) return;
    select.replaceChildren(new Option('Tất cả', 'all'));
    for (const item of values) select.add(new Option(item, item));
    // Preserve the active filter even when a different period has no matching rows.
    if (value !== 'all' && !values.includes(value)) select.add(new Option(value, value));
    select.value = value; select.dataset.options = signature;
  }
  function rowTable(target, rows, columns, emptyText = 'Chưa có dữ liệu trong bộ lọc này.') {
    target.replaceChildren();
    if (!rows.length) { const tr = element('tr'), td = element('td', emptyText, 'usage-empty'); td.colSpan = columns.length; tr.append(td); target.append(tr); return; }
    for (const row of rows) {
      const tr = element('tr');
      for (const column of columns) { const td = element('td'); const value = column(row); if (value instanceof Node) td.append(value); else td.textContent = value; tr.append(td); }
      target.append(tr);
    }
  }
  function twoLines(top, bottom) { const box = element('span', null, 'usage-two-lines'); box.append(element('strong', top), element('small', bottom)); return box; }
  function renderGroups() {
    if (!report) return;
    const labels = {unassigned:'Chưa gắn chat', mcp:'Công cụ MCP', corp:'Chat Corp', arena:'Arena'};
    rowTable($('usageGroups'), report.groups[$('usageGroup').value], [r => labels[r.name] || r.name, r => fmt(r.requests), r => fmt(r.inputTokens), r => fmt(r.outputTokens), r => fmt(r.totalTokens), r => fmt(r.errors), r => ms(r.averageMs)]);
  }
  function renderChart() {
    const chart = $('usageChart');
    if(window.umiCharts){
      window.umiCharts.render(chart,report.timeline,{hourly:['today','24h'].includes(period),label:usageLanguage()==='en'?'Estimated input and output tokens over time':'Token input và output ước tính theo thời gian'});
      $('usageChartScope').textContent=report.chartDays?'Biểu đồ 60 ngày gần nhất · tổng tính toàn bộ':'Giờ trên máy';
      return;
    }
    chart.replaceChildren();
    const max = Math.max(1, ...report.timeline.map(row => row.totalTokens));
    const hourly = ['today','24h'].includes(period);
    for (const [index, row] of report.timeline.entries()) {
      const item = element('div', null, 'usage-column');
      const label = new Date(row.at).toLocaleString('vi-VN', hourly ? {hour:'2-digit', minute:'2-digit'} : {day:'2-digit',month:'2-digit'});
      item.title = label + ': input ' + fmt(row.inputTokens) + ', output ' + fmt(row.outputTokens) + ', ' + fmt(row.requests) + ' lượt';
      const bars = element('div', null, 'usage-bars');
      for (const key of ['outputTokens','inputTokens']) { const bar = element('span', null, key); bar.style.height = (100 * row[key] / max) + '%'; bars.append(bar); }
      item.append(bars, element('small', index % Math.max(1, Math.ceil(report.timeline.length / 10)) === 0 ? label : ''));
      chart.append(item);
    }
    chart.setAttribute('aria-label', 'Token theo thời gian. ' + report.timeline.filter(r => r.requests).map(r => date(r.at) + ': ' + fmt(r.totalTokens)).join('; '));
    $('usageChartScope').textContent = report.chartDays ? 'Biểu đồ 60 ngày gần nhất · tổng tính toàn bộ' : 'Giờ trên máy';
  }
  function countdown() {
    for (const node of $('usageLimitRows').querySelectorAll('[data-reset]')) {
      const seconds = Math.max(0, Math.ceil((Number(node.dataset.reset) - Date.now()) / 1000));
      node.textContent = seconds ? Math.floor(seconds / 3600) + 'h ' + Math.floor(seconds % 3600 / 60) + 'm ' + seconds % 60 + 's · ' + date(Number(node.dataset.reset)) : 'Đến mốc reset · chờ extension kiểm tra';
    }
  }
  function renderLimits() {
    const target = $('usageLimitRows'); target.replaceChildren();
    if (!report.limits.length) target.append(element('p', 'Chưa ghi nhận thông báo hạn mức.', 'usage-empty'));
    for (const limit of report.limits) {
      const row = element('article', null, 'usage-limit'); row.append(element('strong', limit.role), element('span', limit.title));
      const time = element('time', limit.resetAt ? '' : 'Chưa đọc được giờ reset'); if (limit.resetAt) time.dataset.reset = limit.resetAt;
      row.append(time, element('small', limit.autoResume ? 'Tự tiếp tục đã bật' : 'Cần bật điều phối và tiếp tục nhiệm vụ'));
      const details = element('details'); details.append(element('summary', 'Thông báo gốc'), element('p', limit.notice)); row.append(details); target.append(row);
    }
    countdown(); renderCost();
  }
  function renderCost() {
    if (!report) return;
    const valid = key => typeof cost[key] === 'number' && Number.isFinite(cost[key]) && cost[key] >= 0;
    const available = valid('input') && valid('output');
    const amount = available ? (report.totals.inputTokens * cost.input + report.totals.outputTokens * cost.output) / 1e6 : null;
    $('usageCost').textContent = available ? amount.toLocaleString('vi-VN', {style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:4}) + ' tham khảo' : 'Chưa đặt giá input và output';
    const hasBudget = available && valid('budget') && cost.budget > 0;
    $('usageBudgetProgress').hidden = !hasBudget;
    $('usageBudgetProgress').value = hasBudget ? Math.min(100, amount / cost.budget * 100) : 0;
    $('usageBudgetMessage').textContent = hasBudget ? (amount >= cost.budget ? 'Đã vượt ngân sách tham khảo: ' : 'Đã dùng ') + fmt(Math.round(amount / cost.budget * 1000) / 10) + '% kỳ đang lọc' : '';
    $('usageBudgetMessage').classList.toggle('over-budget', hasBudget && amount >= cost.budget);
  }
  function renderDiagnostics(){
    const root=$('usageDiagnostics');root.replaceChildren();const totals=report.totals,list=element('dl',null,'usage-diagnostic-metrics');
    const dag=element('section');dag.append(element('h3',usageLanguage()==='en'?'Task execution':'Thực thi task'));
    for(const [vi,en,value]of [['Task đã kiểm chứng','Verified tasks',totals.verifiedTasks],['Task thất bại','Failed tasks',totals.failedTasks],['Lượt thử lại','Retry requests',totals.retryRequests],['Estimated Tokens cho thử lại','Retry Estimated Tokens',totals.retryTokens],['Lượt bị chặn do hạn mức','Provider limit blocks',totals.limitBlocked],['Chờ dependency (ms)','Dependency wait (ms)',totals.dependencyWaitMs],['Estimated Tokens / task verified','Estimated Tokens / verified task',totals.estimatedTokensPerVerifiedTask]])dag.append(element('p',`${usageLanguage()==='en'?en:vi}: ${fmt(value)}`));root.append(dag);
    for(const [name,value]of [['Token / lượt',totals.requests?fmt(Math.round(totals.totalTokens/totals.requests)):'—'],['Input / output',fmt(totals.inputTokens)+' / '+fmt(totals.outputTokens)],['Lượt có số đếm',totals.requests?fmt(Math.round(totals.measured/totals.requests*100))+'%':'—'],['Lượt lỗi',fmt(totals.errors)]]){const row=element('div');row.append(element('dt',name),element('dd',value));list.append(row);}root.append(list);
    const grid=element('div',null,'usage-diagnostic-grid');for(const [heading,rows,type]of [['Đóng góp theo nguồn',report.groups.sources,'tokens'],['Nhóm có token nhiều nhất',report.groups.tools.slice(0,5),'tokens'],['Nhóm mất nhiều thời gian / lượt',[...report.groups.tools].filter(row=>row.averageMs!=null).sort((a,b)=>b.averageMs-a.averageMs).slice(0,5),'time'],['Nhóm cần kiểm tra lỗi',[...report.groups.tools].filter(row=>row.errors).sort((a,b)=>b.errors-a.errors).slice(0,5),'errors']]){const section=element('section');section.append(element('h3',heading));if(!rows.length)section.append(element('p','Chưa có dữ liệu trong bộ lọc.','usage-note'));for(const row of rows){const item=element('div',null,'usage-diagnostic-row');item.append(element('strong',({mcp:'Công cụ MCP',corp:'Corp',arena:'Arena'})[row.name]||row.name),element('span',fmt(row.requests)+' lượt · '+fmt(row.totalTokens)+' token · '+ms(row.averageMs)+'/lượt · '+fmt(row.errors)+' lỗi'));if(type==='tokens'){const bar=element('progress');bar.max=Math.max(1,totals.totalTokens);bar.value=row.totalTokens;bar.setAttribute('aria-label','Tỷ trọng '+row.name);item.append(bar);}section.append(item);}grid.append(section);}root.append(grid);
    const peak=[...report.timeline].sort((a,b)=>b.totalTokens-a.totalTokens)[0];root.append(element('p',peak?.requests?'Khoảng có token cao nhất: '+date(peak.at)+' · '+fmt(peak.totalTokens)+' token, '+fmt(peak.requests)+' lượt.':'Chưa có hoạt động trong kỳ.','usage-note'));root.append(element('p','Số liệu theo bộ lọc và văn bản đã quan sát. Thời gian nhóm là trung bình; token ước tính, không phải hóa đơn hoặc hiệu năng model.','usage-note'));
  }
  function render() {
    const totals = report.totals;
    const set=(id,value,format=fmt)=>window.umiNumbers?window.umiNumbers.set($(id),value,format):$(id).textContent=format(value);
    for (const [id,key] of Object.entries({usageTotal:'totalTokens',usageInput:'inputTokens',usageOutput:'outputTokens',usageRequests:'requests'})) set(id,totals[key]);
    set('usageSuccess',totals.successRate,value=>value==null?'-':fmt(value)+'%');
    set('usageLatency',totals.averageMs,ms);
    $('usageCoverage').textContent = fmt(totals.measured) + '/' + fmt(totals.requests) + ' có số đếm · ' + fmt(totals.partial) + ' một phần';
    $('usageBytes').textContent = fmt(totals.inputBytes) + ' byte input · ' + fmt(totals.outputBytes) + ' byte output · ' + fmt(totals.unmeasured) + ' lượt không đếm được';
    selectOptions('usageApplication', report.options.applications); selectOptions('usageTool', report.options.tools);
    rowTable($('usageRows'), report.rows, [r => twoLines(date(r.timestamp), r.id), r => twoLines(r.application, r.tool + (r.task ? ' · ' + r.task : '')), r => ({ok:'Hoàn thành',error:'Lỗi / đã dừng',pending:'Chưa đủ kết quả'}[r.status]), r => fmt(r.inputTokens), r => fmt(r.outputTokens), r => fmt(r.totalTokens) + (r.partial ? ' *' : ''), r => ms(r.durationMs)]);
    $('usagePageLabel').textContent = 'Trang ' + (report.pages ? page + 1 : 0) + '/' + report.pages + ' · ' + fmt(totals.requests) + ' lượt';
    $('usagePrevious').disabled = page === 0; $('usageNext').disabled = page + 1 >= report.pages;
    $('usageExport').disabled = !report.rows.length;
    renderChart(); renderGroups(); renderLimits(); renderDiagnostics();
  }
  async function load() {
    const version = ++sequence; controller?.abort(); controller = new AbortController();
    const params = new URLSearchParams({period, page, offset:new Date().getTimezoneOffset(), source:$('usageSource').value,
      application:$('usageApplication').value, tool:$('usageTool').value, status:$('usageStatus').value, search:$('usageSearch').value});
    section.setAttribute('aria-busy','true');
    try {
      const response = await fetch('/admin/api/usage?' + params, {cache:'no-store',signal:controller.signal});
      if (!response.ok) throw Error('Không tải được thống kê. Kiểm tra gateway rồi bấm Làm mới.');
      const next = await response.json(); if (version !== sequence) return;
      report = next;
      if (page && page >= report.pages) { page = Math.max(0, report.pages - 1); return void load(); }
      error(''); render();
    } catch (cause) { if (version === sequence && cause.name !== 'AbortError') error(cause.message); }
    finally { if (version === sequence) section.setAttribute('aria-busy','false'); }
  }
  const reset = () => { page = 0; void load(); };
  $('usagePeriods').onclick = event => { const button = event.target.closest('[data-period]'); if (!button) return; period = button.dataset.period; for (const item of $('usagePeriods').querySelectorAll('button')) item.setAttribute('aria-pressed',String(item === button)); reset(); };
  $('usageTabs').onclick = event => { const button = event.target.closest('[data-pane]'); if (!button) return; for (const item of $('usageTabs').querySelectorAll('button')) item.setAttribute('aria-pressed',String(item === button)); for (const name of ['Overview','History','Limits','Diagnostics']) $('usage' + name).hidden = name.toLowerCase() !== button.dataset.pane; };
  for (const id of ['usageSource','usageApplication','usageTool','usageStatus']) $(id).onchange = () => { if (id === 'usageSource') { $('usageApplication').value='all'; $('usageTool').value='all'; } reset(); };
  $('usageGroup').onchange = renderGroups;
  $('usageSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(reset, 300); };
  $('usageReload').onclick = () => void load();
  $('usagePrevious').onclick = () => { page--; void load(); };
  $('usageNext').onclick = () => { page++; void load(); };
  $('usageBudgetForm').onsubmit = event => {
    event.preventDefault(); cost = {};
    for (const [key,id] of Object.entries({input:'usageInputRate',output:'usageOutputRate',budget:'usageBudget'})) if ($(id).value !== '') cost[key] = Number($(id).value);
    try { localStorage.setItem('umibridge.usage.budget',JSON.stringify(cost)); renderCost(); } catch { error('Trình duyệt không cho lưu ngân sách.'); }
  };
  $('usageExport').onclick = () => {
    if (!report) return;
    const fields = ['id','timestamp','source','application','tool','chat','status','inputTokens','outputTokens','totalTokens','partial','durationMs'];
    const cell = value => { const raw = String(value ?? ''); return '"' + (/^[=+@\-\t\r]/.test(raw) ? "'" : '') + raw.replaceAll('"','""') + '"'; };
    const csv = '\ufeff' + [fields, ...report.rows.map(row => fields.map(key => row[key]))].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})), link = element('a');
    link.href = url; link.download = 'umibridge-usage-page-' + (page + 1) + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  window.addEventListener('umibridge-view', event => { if (event.detail === 'analytics') void load(); });
  setInterval(() => { countdown(); }, 1000);
  setInterval(() => { if (section.classList.contains('view-active') && !document.hidden) void load(); }, 15000);
  if (section.classList.contains('view-active')) void load();
})();
