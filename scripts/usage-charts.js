(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg', states = new WeakMap(), animations = new Set();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let chartId = 0;
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  const language = options => options.language === 'en' ? 'en' : 'vi';
  const locale = lang => lang === 'en' ? 'en-US' : 'vi-VN';
  const text = (lang, vi, en) => lang === 'en' ? en : vi;
  const format = (value, lang) => new Intl.NumberFormat(locale(lang), {maximumFractionDigits:20}).format(value);
  const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const coverage = row => {
    const requests = number(row.requests), measured = count(row.measured);
    return {requests, measured, partial:number(row.partial), unmeasured:count(row.unmeasured) ?? (measured == null ? null : Math.max(0, requests - measured))};
  };
  const unavailable = row => row.requests > 0 && (row.measured === 0 || row.unmeasured >= row.requests);
  const incomplete = row => row.partial > 0 || row.unmeasured > 0;
  const sumCoverage = rows => ({requests:rows.reduce((sum, row) => sum + row.requests, 0),
    measured:rows.every(row => row.measured != null) ? rows.reduce((sum, row) => sum + row.measured, 0) : null,
    partial:rows.reduce((sum, row) => sum + row.partial, 0),
    unmeasured:rows.every(row => row.unmeasured != null) ? rows.reduce((sum, row) => sum + row.unmeasured, 0) : null});
  function coverageNote(row, lang) {
    const parts = [];
    if (!row.requests && !row.partial && !row.unmeasured) return '';
    if (unavailable(row)) parts.push(text(lang, 'Chưa có số đếm token', 'Token counts unavailable'));
    else if (incomplete(row)) parts.push(text(lang, 'Tổng token đã biết; số đếm chưa đầy đủ', 'Known token subtotal; counts are incomplete'));
    if (row.measured != null) parts.push(format(row.measured, lang) + '/' + format(row.requests, lang) + ' ' + text(lang, 'lượt có số đếm', 'requests counted'));
    if (row.partial) parts.push(format(row.partial, lang) + ' ' + text(lang, 'một phần', 'partial'));
    if (row.unmeasured) parts.push(format(row.unmeasured, lang) + ' ' + text(lang, 'chưa có số đếm', 'uncounted'));
    return parts.join(' · ');
  }
  const node = (tag, value, cls) => {
    const el = document.createElement(tag);
    if (value != null) el.textContent = String(value);
    if (cls) el.className = cls;
    return el;
  };
  const svgNode = (tag, attrs = {}, value) => {
    const el = document.createElementNS(NS, tag);
    for (const [name, content] of Object.entries(attrs)) el.setAttribute(name, String(content));
    if (value != null) el.textContent = String(value);
    return el;
  };
  const calm = () => {
    if (reduced?.matches || document.hidden || document.body?.dataset.uiMotion === 'off') return true;
    try { return localStorage.getItem('umibridge.motion') === 'off'; } catch { return false; }
  };
  function stop() { for (const animation of [...animations]) animation.cancel(); }
  function play(target) {
    const state = states.get(target);
    if (!state || calm() || !target.getClientRects().length) return;
    for (const previous of state.animations || []) previous.cancel();
    state.animations = [];
    const items = state.kind === 'timeline' ? target.querySelectorAll('.umi-chart-series')
      : state.kind === 'composition' ? target.querySelectorAll('.umi-donut-segments') : target.querySelectorAll('.umi-ranking-bar');
    target.classList.add('umi-chart-enter');
    for (const item of items) {
      if (!item.animate) continue;
      const frames = state.kind === 'ranking' ? [{transform:'scaleX(0)'}, {transform:'scaleX(1)'}]
        : [{opacity:0, clipPath:'inset(0 100% 0 0)'}, {opacity:1, clipPath:'inset(0 0 0 0)'}];
      const animation = item.animate(frames, {duration:650, easing:'cubic-bezier(.16,1,.3,1)'});
      animations.add(animation); state.animations.push(animation);
      const done = () => { animations.delete(animation); target.classList.remove('umi-chart-enter'); };
      animation.onfinish = done; animation.oncancel = done;
    }
    if (!state.animations.length) target.classList.remove('umi-chart-enter');
  }
  function replace(target, state, cls, options) {
    const previous = states.get(target);
    if (previous?.signature === state.signature) return false;
    for (const animation of previous?.animations || []) animation.cancel();
    states.set(target, state); target.replaceChildren(); target.classList.add(cls);
    target.setAttribute('aria-label', options.label || state.label);
    return true;
  }
  function empty(target, lang, requests, measured) {
    const message = node('div', null, 'umi-chart-empty');
    const unmeasured = requests > 0 && measured === 0;
    message.append(node('strong', requests ? unmeasured ? text(lang, 'Có hoạt động, chưa có số đếm token', 'Activity recorded, token counts unavailable') : text(lang, 'Chưa có token trong kỳ', 'No tokens in this period')
      : text(lang, 'Chưa có hoạt động trong kỳ', 'No activity in this period')),
    node('span', requests ? unmeasured ? text(lang, 'Các lượt đã ghi nhận chưa có token đo được.', 'Recorded requests have no measured tokens yet.') : text(lang, 'Tổng token đã ghi nhận bằng 0.', 'Recorded token totals are zero.')
      : text(lang, 'Biểu đồ hiện khi có dữ liệu được ghi nhận.', 'The chart appears when activity is recorded.')));
    target.append(message);
  }
  const total = row => typeof row.totalTokens === 'number' && Number.isFinite(row.totalTokens) && row.totalTokens >= 0
    ? row.totalTokens : number(row.inputTokens) + number(row.outputTokens);
  const dateFormat = (stamp, lang, hourly, full = false) => new Intl.DateTimeFormat(locale(lang), full
    ? {year:'numeric', month:'2-digit', day:'2-digit', ...(hourly ? {hour:'2-digit', minute:'2-digit'} : {})}
    : hourly ? {hour:'2-digit', minute:'2-digit'} : {day:'2-digit', month:'short'}).format(stamp);
  function niceScale(maximum) {
    if (!maximum) return {maximum:1, step:.2};
    const rough = maximum / 4, unit = 10 ** Math.floor(Math.log10(rough)), ratio = rough / unit;
    const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * unit;
    return {maximum:Math.ceil(maximum / step) * step, step};
  }
  function showPoint(target, index) {
    const state = states.get(target);
    if (!state?.rows.length) return;
    state.index = Math.max(0, Math.min(state.rows.length - 1, index));
    const row = state.rows[state.index], X = state.x(row.at), lang = state.lang, missing = unavailable(row);
    state.crosshair.removeAttribute('hidden'); state.crosshair.style.display = '';
    state.crosshairLine.setAttribute('x1', X); state.crosshairLine.setAttribute('x2', X);
    for (const [dot, key] of [[state.inputDot, 'inputTokens'], [state.outputDot, 'outputTokens']]) {
      dot.style.display = missing ? 'none' : '';
      dot.setAttribute('cx', X); dot.setAttribute('cy', state.y(row[key]));
    }
    state.tooltip.hidden = false;
    state.tooltipTitle.textContent = dateFormat(row.at, lang, state.hourly, true);
    for (const [key, value] of Object.entries({inputTokens:row.inputTokens, outputTokens:row.outputTokens, totalTokens:row.totalTokens, requests:row.requests})) {
      const unknown = missing && key !== 'requests';
      state.values[key].textContent = unknown ? '—' : format(value, lang);
      if (unknown) state.values[key].setAttribute('aria-label', text(lang, 'Chưa có số đếm token', 'Token counts unavailable'));
      else state.values[key].removeAttribute('aria-label');
    }
    state.totalLabel.textContent = !missing && incomplete(row) ? text(lang, 'Tổng token đã biết', 'Known token subtotal') : text(lang, 'Tổng token', 'Total tokens');
    const note = coverageNote(row, lang); state.tooltipCoverage.textContent = note; state.tooltipCoverage.hidden = !note;
    state.tooltip.setAttribute('aria-label', state.tooltipTitle.textContent + '. ' + (missing ? text(lang, 'Chưa có số đếm token', 'Token counts unavailable')
      : 'Input ' + format(row.inputTokens, lang) + ', Output ' + format(row.outputTokens, lang) + ', ' + state.totalLabel.textContent + ' ' + format(row.totalTokens, lang))
      + '. ' + format(row.requests, lang) + ' ' + text(lang, 'lượt', 'requests') + (note ? '. ' + note : ''));
    const box = target.getBoundingClientRect(), svgBox = state.svg.getBoundingClientRect();
    state.tooltip.style.maxWidth = Math.max(0, box.width - 16) + 'px';
    const tipBox = state.tooltip.getBoundingClientRect();
    // SVG uses its default xMidYMid meet alignment; account for letterboxing in narrow cards.
    const scale = Math.min(svgBox.width / state.W, svgBox.height / state.H);
    const localX = svgBox.left - box.left + (svgBox.width - state.W * scale) / 2 + X * scale;
    const padding = 8, available = Math.max(padding, box.width - tipBox.width - padding);
    const left = Math.max(padding, Math.min(available, localX + 14 > available ? localX - tipBox.width - 14 : localX + 14));
    state.tooltip.style.left = left + 'px';
    state.tooltip.style.top = Math.max(padding, Math.min(Math.max(padding, box.height - tipBox.height - padding), svgBox.top - box.top + 12)) + 'px';
  }
  function hidePoint(target) {
    const state = states.get(target);
    if (!state) return;
    state.tooltip.hidden = true; state.crosshair.style.display = 'none';
  }
  function bindTimeline(target) {
    if (target.dataset.umiChartBound) return;
    target.dataset.umiChartBound = 'true';
    target.addEventListener('keydown', event => {
      const state = states.get(target);
      if (event.key === 'Escape') { hidePoint(target); event.preventDefault(); return; }
      if (!state?.rows.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? state.rows.length - 1
        : (state.index ?? state.rows.length - 1) + (event.key === 'ArrowRight' ? 1 : -1);
      showPoint(target, index);
    });
    target.addEventListener('focus', () => { const state = states.get(target); if (state) showPoint(target, state.index ?? state.rows.length - 1); });
    target.addEventListener('blur', () => { if (!states.get(target)?.hover) hidePoint(target); });
    target.addEventListener('pointermove', event => {
      const state = states.get(target);
      if (!state?.rows.length) return;
      const box = state.svg.getBoundingClientRect(), scale = Math.min(box.width / state.W, box.height / state.H);
      if (!scale) return;
      const X = (event.clientX - box.left - (box.width - state.W * scale) / 2) / scale;
      if (X < state.left || X > state.right) { if (document.activeElement !== target) hidePoint(target); return; }
      state.hover = true;
      const stamp = state.first + Math.max(0, Math.min(1, (X - state.plotStart) / state.plotWidth)) * state.span;
      let low = 0, high = state.rows.length - 1;
      while (low < high) { const mid = (low + high) >> 1; if (state.rows[mid].at < stamp) low = mid + 1; else high = mid; }
      if (low && stamp - state.rows[low - 1].at <= state.rows[low].at - stamp) low--;
      showPoint(target, low);
    });
    target.addEventListener('pointerleave', () => { const state = states.get(target); if (state) state.hover = false; if (document.activeElement !== target) hidePoint(target); });
  }
  function timeline(target, rows, options = {}) {
    if (!target) return;
    const lang = language(options), hourly = !!options.hourly, mode = options.mode === 'bar' ? 'bar' : 'line';
    const W = Math.max(320, number(target.clientWidth) || 960), H = Math.max(220, number(target.clientHeight) || 320);
    const left = 52, right = W - 18, top = 16, base = H - 36, plotWidth = right - left;
    const values = (Array.isArray(rows) ? rows : []).filter(row => row && row.at != null && row.at !== '' && Number.isFinite(new Date(row.at).getTime()))
      .map(row => ({at:new Date(row.at).getTime(), inputTokens:number(row.inputTokens), outputTokens:number(row.outputTokens), totalTokens:total(row), ...coverage(row)}))
      .sort((a, b) => a.at - b.at);
    const previous = states.get(target), selectedAt = previous?.rows?.[previous.index]?.at;
    const state = {kind:'timeline', rows:values, lang, hourly, W, H, left, right, index:values.findIndex(row => row.at === selectedAt),
      signature:JSON.stringify([values, mode, hourly, lang, options.label || '', W, H]), label:text(lang, 'Token ước tính theo thời gian. Dùng phím trái, phải, Home và End để xem số liệu.', 'Estimated tokens over time. Use Left, Right, Home and End to inspect values.')};
    if (!replace(target, state, 'umi-timeline', options)) return;
    target.tabIndex = 0; target.setAttribute('role', 'group'); target.setAttribute('aria-roledescription', text(lang, 'biểu đồ', 'chart'));
    target.setAttribute('aria-description', text(lang, 'Dùng phím trái, phải, Home và End để xem số liệu.', 'Use Left, Right, Home and End to inspect values.'));
    bindTimeline(target);
    const svg = state.svg = svgNode('svg', {viewBox:`0 0 ${W} ${H}`, class:'umi-chart', 'aria-hidden':'true'});
    const first = state.first = values[0]?.at || 0, span = state.span = (values[values.length - 1]?.at || first) - first;
    const inset = mode === 'bar' ? Math.min(24, plotWidth / 2 / Math.max(1, values.length)) : 0;
    state.plotStart = left + inset; state.plotWidth = plotWidth - inset * 2;
    state.x = stamp => span ? state.plotStart + (stamp - first) / span * state.plotWidth : (left + right) / 2;
    const maximum = values.reduce((max, row) => unavailable(row) ? max : Math.max(max, row.inputTokens, row.outputTokens), 0), scale = niceScale(maximum);
    state.y = value => base - value / scale.maximum * (base - top);
    const compact = value => new Intl.NumberFormat(locale(lang), {notation:'compact', maximumFractionDigits:1}).format(value);
    for (let index = 0; index <= Math.round(scale.maximum / scale.step); index++) {
      const value = Math.min(scale.maximum, index * scale.step), Y = state.y(value);
      svg.append(svgNode('line', {x1:left, y1:Y, x2:right, y2:Y, class:'umi-chart-grid'}),
        svgNode('text', {x:left - 10, y:Y + 4, 'text-anchor':'end', class:'umi-chart-tick', 'font-size':12}, compact(value)));
    }
    const hasTokens = values.some(row => !unavailable(row) && (row.inputTokens || row.outputTokens));
    if (hasTokens) {
      const series = svgNode('g', {class:'umi-chart-series'});
      if (mode === 'bar') {
        let gap = plotWidth;
        for (let index = 1; index < values.length; index++) { const distance = state.x(values[index].at) - state.x(values[index - 1].at); if (distance > 0) gap = Math.min(gap, distance); }
        const width = Math.max(.15, Math.min(22, gap * .32)), barGap = Math.min(.5, width * .1);
        for (const row of values.filter(row => !unavailable(row))) for (const [key, offset, cls] of [['inputTokens', -width - barGap, 'umi-bar-input'], ['outputTokens', barGap, 'umi-bar-output']]) {
          series.append(svgNode('rect', {x:state.x(row.at) + offset, y:state.y(row[key]), width, height:base - state.y(row[key]), rx:Math.min(width / 3, 3), class:cls}));
        }
      } else {
        const segments = []; let segment = [];
        for (const row of values) {
          if (unavailable(row)) { if (segment.length) segments.push(segment); segment = []; }
          else segment.push(row);
        }
        if (segment.length) segments.push(segment);
        for (const [key, cls] of [['inputTokens', 'umi-series-input'], ['outputTokens', 'umi-series-output']]) {
          const paths = segments.map(points => points.map((row, index) => (index ? 'L' : 'M') + state.x(row.at).toFixed(2) + ' ' + state.y(row[key]).toFixed(2)).join(' '));
          const path = paths.join(' '), area = segments.map((points, index) => points.length > 1 ? paths[index] + ` L${state.x(points[points.length - 1].at)} ${base} L${state.x(points[0].at)} ${base} Z` : '').filter(Boolean).join(' ');
          if (key === 'inputTokens' && area) series.append(svgNode('path', {d:area, class:'umi-chart-area', fill:'currentColor', 'fill-opacity':'.055', stroke:'none'}));
          series.append(svgNode('path', {d:path, class:cls, fill:'none', stroke:'currentColor', 'stroke-width':2.5, ...(key === 'outputTokens' ? {'stroke-dasharray':'6 5'} : {}), 'vector-effect':'non-scaling-stroke'}));
          for (const points of segments) if (points.length === 1) series.append(svgNode('circle', {cx:state.x(points[0].at), cy:state.y(points[0][key]), r:4, class:cls, fill:'currentColor'}));
        }
      }
      svg.append(series);
    }
    const tickCount = Math.min(6, values.length, Math.max(2, Math.floor(plotWidth / 90) + 1));
    const tickIndices = [...new Set(Array.from({length:tickCount}, (_, index) => Math.round(index * (values.length - 1) / Math.max(1, tickCount - 1))))];
    for (const index of tickIndices) svg.append(svgNode('text', {x:state.x(values[index].at), y:H - 10, class:'umi-chart-tick', 'font-size':12, 'text-anchor':values.length === 1 ? 'middle' : index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle'}, dateFormat(values[index].at, lang, hourly)));
    state.crosshair = svgNode('g', {class:'umi-chart-crosshair', 'pointer-events':'none'}); state.crosshair.style.display = 'none';
    state.crosshairLine = svgNode('line', {y1:top, y2:base, stroke:'currentColor', 'stroke-dasharray':'3 5', 'stroke-opacity':'.4'});
    state.inputDot = svgNode('circle', {r:4, class:'umi-chart-dot-input', fill:'currentColor'});
    state.outputDot = svgNode('circle', {r:4, class:'umi-chart-dot-output', fill:'var(--bg, #171717)', stroke:'currentColor', 'stroke-width':2});
    state.crosshair.append(state.crosshairLine, state.inputDot, state.outputDot); svg.append(state.crosshair); target.append(svg);
    state.tooltip = node('div', null, 'umi-chart-tooltip'); state.tooltip.id = 'umi-chart-tooltip-' + (++chartId); state.tooltip.hidden = true;
    state.tooltip.setAttribute('role', 'status'); state.tooltip.setAttribute('aria-live', 'polite'); state.tooltip.setAttribute('aria-atomic', 'true');
    state.tooltipTitle = node('strong'); state.tooltip.append(state.tooltipTitle); const details = node('dl'); state.values = {};
    for (const [key, label] of [['inputTokens', 'Input'], ['outputTokens', 'Output'], ['totalTokens', text(lang, 'Tổng token', 'Total tokens')], ['requests', text(lang, 'Lượt', 'Requests')]]) {
      const item = node('div'), value = state.values[key] = node('dd'), term = node('dt', label); if (key === 'totalTokens') state.totalLabel = term; item.append(term, value); details.append(item);
    }
    state.tooltipCoverage = node('p', null, 'umi-chart-coverage'); state.tooltipCoverage.hidden = true;
    state.tooltip.append(details, state.tooltipCoverage); target.append(state.tooltip); target.setAttribute('aria-describedby', state.tooltip.id);
    const summary = sumCoverage(values);
    if (!hasTokens) empty(target, lang, summary.requests, summary.measured);
    if (state.index < 0) state.index = Math.max(0, values.length - 1);
    if (document.activeElement === target) showPoint(target, state.index);
    if (options.animate) play(target);
  }
  function composition(target, totals, options = {}) {
    if (!target) return;
    const lang = language(options), input = number(totals?.inputTokens), output = number(totals?.outputTokens), counts = coverage(totals || {}), sum = input + output, missing = unavailable(counts), note = coverageNote(counts, lang);
    const state = {kind:'composition', signature:JSON.stringify([input, output, counts, lang, options.label || '']), label:text(lang, 'Tỷ trọng token input và output', 'Input and output token composition')};
    if (!replace(target, state, 'umi-composition', options)) return;
    target.setAttribute('role', 'group');
    if (note) target.setAttribute('aria-label', (options.label || state.label) + '. ' + note);
    const svg = svgNode('svg', {viewBox:'0 0 220 220', class:'umi-donut', 'aria-hidden':'true'}), radius = 80, circumference = 2 * Math.PI * radius;
    svg.append(svgNode('circle', {cx:110, cy:110, r:radius, class:'umi-donut-track', fill:'none', stroke:'currentColor', 'stroke-opacity':'.09', 'stroke-width':20}));
    if (sum && !missing) {
      const rings = svgNode('g', {class:'umi-donut-segments', transform:'rotate(-90 110 110)'});
      let offset = 0;
      for (const [value, cls, opacity] of [[input, 'umi-donut-input', 1], [output, 'umi-donut-output', .32]]) {
        if (value) rings.append(svgNode('circle', {cx:110, cy:110, r:radius, class:cls, fill:'none', stroke:'currentColor', 'stroke-opacity':opacity, 'stroke-width':20, 'stroke-dasharray':`${value / sum * circumference} ${circumference}`, 'stroke-dashoffset':-offset}));
        offset += value / sum * circumference;
      }
      svg.append(rings);
    }
    svg.append(svgNode('text', {x:110, y:106, 'text-anchor':'middle', class:'umi-donut-total'}, missing ? '—' : format(sum, lang)), svgNode('text', {x:110, y:130, 'text-anchor':'middle', class:'umi-donut-label'}, missing ? text(lang, 'chưa có số đếm', 'counts unavailable') : incomplete(counts) ? text(lang, 'token đã biết', 'known tokens') : text(lang, 'token ước tính', 'estimated tokens')));
    target.append(svg); const legend = node('div', null, 'umi-composition-legend');
    for (const [name, value, cls] of [['Input', input, 'input'], ['Output', output, 'output']]) {
      const row = node('div', null, 'umi-composition-row umi-composition-' + cls), share = sum && !missing ? new Intl.NumberFormat(locale(lang), {style:'percent', maximumFractionDigits:1}).format(value / sum) : '—';
      const amount = node('strong', missing ? '—' : format(value, lang), 'umi-composition-value');
      if (missing) amount.setAttribute('aria-label', text(lang, 'Chưa có số đếm token', 'Token counts unavailable'));
      row.append(node('span', name, 'umi-composition-name'), amount, node('small', share, 'umi-composition-share')); legend.append(row);
    }
    target.append(legend);
    if (incomplete(counts) && !missing) target.append(node('p', note, 'umi-chart-coverage'));
    if (!sum || missing) empty(target, lang, counts.requests, counts.measured);
    if (options.animate) play(target);
  }
  function ranking(target, groups, options = {}) {
    if (!target) return;
    const lang = language(options), limit = Number.isInteger(options.maxItems) && options.maxItems > 0 ? options.maxItems : 6;
    const rows = (Array.isArray(groups) ? groups : []).filter(row => row && typeof row === 'object').map((row, index) => ({
      name:row.name == null || String(row.name).trim() === '' ? text(lang, 'Chưa gắn tên', 'Unnamed') : String(row.name), tokens:total(row), ...coverage(row), index
    })).sort((a, b) => b.tokens - a.tokens || a.index - b.index);
    const state = {kind:'ranking', signature:JSON.stringify([rows, limit, lang, options.label || '']), label:text(lang, 'Xếp hạng theo token ước tính', 'Ranking by estimated tokens')};
    if (!replace(target, state, 'umi-ranking', options)) return;
    target.setAttribute('role', 'list');
    if (!rows.length) { empty(target, lang, 0); return; }
    const shown = rows.slice(0, limit), rest = rows.slice(limit);
    if (rest.length) shown.push({name:text(lang, 'Khác', 'Other'), tokens:rest.reduce((sum, row) => sum + row.tokens, 0), ...sumCoverage(rest)});
    const maximum = shown.reduce((max, row) => unavailable(row) ? max : Math.max(max, row.tokens), 0);
    for (const row of shown) {
      const item = node('div', null, 'umi-ranking-row'); item.setAttribute('role', 'listitem');
      const heading = node('div', null, 'umi-ranking-heading'), name = node('span', row.name, 'umi-ranking-name'); name.title = row.name;
      const missing = unavailable(row), amount = node('strong', missing ? '—' : format(row.tokens, lang), 'umi-ranking-value');
      if (missing) amount.setAttribute('aria-label', text(lang, 'Chưa có số đếm token', 'Token counts unavailable'));
      heading.append(name, amount);
      const track = node('div', null, 'umi-ranking-track'), bar = node('span', null, 'umi-ranking-bar'); bar.style.width = (maximum && !missing ? row.tokens / maximum * 100 : 0) + '%'; bar.style.transformOrigin = 'left center'; track.append(bar);
      const qualifier = missing || incomplete(row) ? coverageNote(row, lang) : text(lang, 'token ước tính', 'estimated tokens');
      item.append(heading, track, node('small', format(row.requests, lang) + ' ' + text(lang, 'lượt', 'requests') + ' · ' + qualifier, 'umi-ranking-meta')); target.append(item);
    }
    const summary = sumCoverage(rows);
    if (!maximum) empty(target, lang, summary.requests, summary.measured);
    if (options.animate) play(target);
  }
  function replay(target) {
    if (!target) return;
    if (states.has(target)) play(target);
    else for (const chart of target.querySelectorAll('.umi-timeline,.umi-composition,.umi-ranking')) play(chart);
  }
  reduced?.addEventListener('change', () => { if (calm()) stop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  if (document.body && typeof MutationObserver !== 'undefined') new MutationObserver(() => { if (calm()) stop(); }).observe(document.body, {attributes:true, attributeFilter:['data-ui-motion']});
  window.umiUsageCharts = {timeline, composition, ranking, replay, stop};
})();
