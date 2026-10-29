(() => {
  'use strict';
  const $=id=>document.getElementById(id),vi=()=>localStorage.getItem('umibridge.admin.language')==='vi',tr=(a,b)=>vi()?a:b;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),ease='cubic-bezier(.16,1,.3,1)',animations=new Set();
  let motionEnabled=localStorage.getItem('umibridge.motion')!=='off',view='',tabKey='',frame=0,chartId=0;
  document.body.dataset.uiMotion=motionEnabled?'on':'off';
  const calm=()=>reduced.matches||!motionEnabled||document.hidden;
  function animate(node,frames,options={}){
    if(!node||calm()||!node.animate)return;
    const animation=node.animate(frames,{duration:360,easing:ease,...options});animations.add(animation);
    const done=()=>animations.delete(animation);animation.onfinish=done;animation.oncancel=done;return animation;
  }
  function stop(){for(const animation of animations)animation.cancel();animations.clear();}
  function heading(node){animate(node,[{transform:'translateY(11px)',clipPath:'inset(0 0 90% 0)',filter:'blur(4px)'},{transform:'translateY(-1px)',clipPath:'inset(-10% -2% -10% -2%)',filter:'blur(0)',offset:.82},{transform:'translateY(0)',filter:'blur(0)'}],{duration:520});}
  function draw(root){
    if(!root?.getClientRects().length||calm())return;
    for(const path of root.querySelectorAll('.usage-line-input,.usage-line-output')){
      const length=path.getTotalLength();if(!length)continue;
      path.style.strokeDasharray=String(length);
      const animation=animate(path,[{strokeDashoffset:String(length)},{strokeDashoffset:'0'}],{duration:950,delay:path.classList.contains('usage-line-output')?100:0});
      if(animation){const finish=()=>{path.style.strokeDasharray='';animations.delete(animation);};animation.onfinish=finish;animation.oncancel=finish;}
      else path.style.strokeDasharray='';
    }
    for(const area of root.querySelectorAll('.usage-line-area'))animate(area,[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:950});
    for(const dot of root.querySelectorAll('.usage-line-dot'))animate(dot,[{opacity:0},{opacity:1}],{duration:250,delay:650});
  }
  const svgNode=(name,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  const num=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  function renderChart(container,timeline,{label='',className='',hourly=false}={}){
    const rows=Array.isArray(timeline)?timeline:[],signature=JSON.stringify([rows.map(row=>[row.at,row.inputTokens,row.outputTokens]),label,hourly]);
    if(container.dataset.chartSignature===signature&&container.querySelector('svg'))return;
    container.dataset.chartSignature=signature;container.replaceChildren();const W=800,H=214,left=43,right=12,top=15,bottom=31,base=H-bottom;
    const maximum=Math.max(1,...rows.map(row=>num(row.inputTokens)+num(row.outputTokens))),svg=svgNode('svg',{viewBox:`0 0 ${W} ${H}`,class:'usage-line-chart '+className,'aria-hidden':'true'});
    const format=value=>new Intl.NumberFormat(vi()?'vi-VN':'en-US',{notation:'compact',maximumFractionDigits:1}).format(value);
    const x=index=>left+index/Math.max(1,rows.length-1)*(W-left-right),y=value=>base-num(value)/maximum*(base-top);
    for(let index=0;index<4;index++){
      const level=maximum*(3-index)/3,Y=y(level);svg.append(svgNode('line',{x1:left,y1:Y,x2:W-right,y2:Y,class:'usage-chart-grid'}));
      const tick=svgNode('text',{x:left-9,y:Y+4,'text-anchor':'end',class:'usage-chart-tick'});tick.textContent=format(level);svg.append(tick);
    }
    const hasData=rows.some(row=>num(row.inputTokens)+num(row.outputTokens)>0);
    if(hasData){
      const gradient=svgNode('linearGradient',{id:'umi-chart-fade-'+(++chartId),x1:0,y1:0,x2:0,y2:1});gradient.append(svgNode('stop',{offset:'0%','stop-color':'currentColor','stop-opacity':.8}),svgNode('stop',{offset:'100%','stop-color':'currentColor','stop-opacity':0}));const defs=svgNode('defs');defs.append(gradient);svg.append(defs);
      for(const key of ['inputTokens','outputTokens']){
        const points=rows.map((row,index)=>`${index?'L':'M'}${x(index).toFixed(2)} ${y(row[key]).toFixed(2)}`).join(' ');
        if(key==='inputTokens')svg.append(svgNode('path',{d:points+` L${x(rows.length-1)} ${base} L${left} ${base} Z`,class:'usage-line-area',fill:`url(#${gradient.id})`}));
        svg.append(svgNode('path',{d:points,class:key==='inputTokens'?'usage-line-input':'usage-line-output'}));
      }
      const last=rows.length-1;svg.append(svgNode('circle',{cx:x(last),cy:y(rows[last].inputTokens),r:4,class:'usage-line-dot'}));
    }
    const positions=[...new Set([0,Math.floor((rows.length-1)/3),Math.floor((rows.length-1)*2/3),rows.length-1])].filter(index=>index>=0&&rows[index]);
    for(const index of positions){const date=new Date(rows[index].at);if(!Number.isFinite(date.getTime()))continue;const tick=svgNode('text',{x:x(index),y:H-4,'text-anchor':index===0?'start':index===rows.length-1?'end':'middle',class:'usage-chart-tick'});tick.textContent=hourly?date.toLocaleTimeString(vi()?'vi-VN':'en-US',{hour:'2-digit',minute:'2-digit'}):date.toLocaleDateString(vi()?'vi-VN':'en-US',{day:'2-digit',month:'short'});svg.append(tick);}
    container.append(svg);container.setAttribute('role','img');container.setAttribute('aria-label',label||tr('Token ước tính theo thời gian','Estimated tokens over time'));
    if(!hasData){const empty=document.createElement('div');empty.className='usage-chart-empty';const title=document.createElement('strong'),note=document.createElement('span');title.textContent=tr('Chưa có hoạt động trong kỳ','No activity in this period');note.textContent=tr('Biểu đồ sẽ hiện khi có dữ liệu được ghi nhận.','The chart appears when activity is recorded.');empty.append(title,note);container.append(empty);}
    draw(container);
  }
  window.umiCharts={render:renderChart};
  function reveal(){
    frame=0;const active=document.querySelector('main>.view-active');if(!active)return;
    const current=active.dataset.view;
    if(current!==view){stop();view=current;tabKey='';animate(active,[{opacity:.5,transform:'translateY(8px)',filter:'blur(2px)'},{opacity:1,transform:'translateY(0)',filter:'blur(0)'}],{duration:300});heading(active.querySelector('h1,h2'));
      const items=[...active.querySelectorAll('.overview-grid>section,.metric,.settings-card:not([hidden]),.usage-metrics>div')].filter(node=>node.getClientRects().length).slice(0,7);
      items.forEach((node,index)=>animate(node,[{opacity:.45,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:400,delay:Math.min(index*45,180)}));
      for(const chart of active.querySelectorAll('.overview-flow-chart,#usageChart'))draw(chart);
      const nav=document.querySelector(`.nav-link[data-view="${current}"]`);animate(nav,[{boxShadow:'inset 0 0 0 1px rgba(255,255,255,.28)'},{boxShadow:'inset 0 0 0 1px rgba(255,255,255,0)'}],{duration:450});
    }
    const selected=[...active.querySelectorAll('[role=tab][aria-selected=true],.usage-tabs button[aria-pressed=true],.segmented button[aria-pressed=true]')];
    const next=selected.map(node=>node.id||node.dataset.pane||node.dataset.period||node.dataset.tab||node.textContent).join('|');
    if(next!==tabKey){const previous=tabKey;tabKey=next;if(previous)for(const panel of active.querySelectorAll('[role=tabpanel]:not([hidden]),.usage-pane:not([hidden])'))if(panel.getClientRects().length)animate(panel,[{opacity:.55,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:260});
      for(const node of selected)animate(node,[{transform:'scale(.96)'},{transform:'scale(1)'}],{duration:230});
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(reveal);}
  window.addEventListener('umibridge-view',schedule);
  document.addEventListener('click',event=>{if(event.target.closest('[role=tab],.segmented button,.usage-tabs button'))schedule();});
  new MutationObserver(records=>{if(records.some(record=>record.attributeName==='aria-selected'||record.attributeName==='aria-pressed'))schedule();}).observe($('main'),{subtree:true,attributes:true,attributeFilter:['aria-selected','aria-pressed']});
  reduced.addEventListener('change',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  // These controls affect presentation only. No tools, screenshots or workflow actions run here.
  const appearance=document.querySelector('.appearance-editor');
  if(appearance){const label=document.createElement('label');label.className='umi-motion-toggle';const input=document.createElement('input'),copy=document.createElement('span');input.type='checkbox';input.checked=motionEnabled;copy.textContent=tr('Hiệu ứng chuyển động','Interface motion');label.append(input,copy);appearance.append(label);input.onchange=()=>{motionEnabled=input.checked;document.body.dataset.uiMotion=motionEnabled?'on':'off';localStorage.setItem('umibridge.motion',motionEnabled?'on':'off');if(!motionEnabled)stop();};$('languageSelect').addEventListener('change',()=>{copy.textContent=tr('Hiệu ứng chuyển động','Interface motion');});}
  const studio=document.querySelector('.overview-studio');let overviewLoading=false,lastOverview=0;
  if(studio){
    const grid=document.createElement('div');grid.className='overview-grid';
    const flow=document.createElement('section');flow.className='overview-flow';flow.innerHTML='<div class="overview-flow-head"><h3 id="overviewFlowTitle"></h3><span id="overviewFlowPeriod"></span></div><div class="overview-flow-total"><strong id="overviewFlowTotal">—</strong><span id="overviewFlowUnit"></span></div><div class="overview-flow-legend"><span>Input</span><span>Output</span></div><div id="overviewFlowChart" class="overview-flow-chart"></div><div class="overview-flow-note"><span id="overviewFlowCount"></span><a href="#analytics" id="overviewFlowLink"></a></div>';
    const focus=document.createElement('section');focus.className='overview-focus';const focusTitle=document.createElement('h3');focusTitle.id='overviewFocusTitle';focus.append(focusTitle,$('studioStatus'),$('studioPeople'));
    const columns=studio.querySelector('.studio-columns'),projects=columns?.children[0],events=columns?.children[1];
    grid.append(flow,focus);if(projects){projects.classList.add('overview-activity');grid.append(projects);}if(events){events.classList.add('overview-signal');grid.append(events);}columns?.remove();studio.append(grid);
    function labels(){for(const [id,a,b]of [['overviewFlowTitle','Nhịp hoạt động','Activity rhythm'],['overviewFlowPeriod','7 ngày gần nhất','Last 7 days'],['overviewFlowUnit','token ước tính','estimated tokens'],['overviewFlowLink','Xem phân tích','View analytics'],['overviewFocusTitle','Công việc của bạn','Your work']])$(id).textContent=tr(a,b);}
    async function overview(force=false){labels();if(overviewLoading||document.hidden||!$('overview').classList.contains('view-active')||!force&&Date.now()-lastOverview<30000)return;overviewLoading=true;
      try{const response=await fetch('/admin/api/usage?period=7d&source=all&offset='+new Date().getTimezoneOffset(),{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();$('overviewFlowTotal').textContent=new Intl.NumberFormat(vi()?'vi-VN':'en-US').format(num(data.totals.totalTokens));$('overviewFlowCount').textContent=new Intl.NumberFormat(vi()?'vi-VN':'en-US').format(num(data.totals.requests))+' '+tr('lượt được ghi nhận','recorded requests');renderChart($('overviewFlowChart'),data.timeline,{label:tr('Token ước tính trong 7 ngày gần nhất','Estimated tokens in the last 7 days')});lastOverview=Date.now();}
      catch{$('overviewFlowTotal').textContent='—';$('overviewFlowCount').textContent=tr('Chưa tải được dữ liệu. Thử Làm mới.','Data unavailable. Select Refresh to retry.');}
      finally{overviewLoading=false;}
    }
    window.addEventListener('umibridge-view',event=>{if(event.detail==='overview')void overview();});$('languageSelect').addEventListener('change',()=>void overview(true));$('refresh').addEventListener('click',()=>void overview(true));void overview();
  }
  schedule();
})();
