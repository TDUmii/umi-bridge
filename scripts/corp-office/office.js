/* Pixel Agents sprites: MIT, Pablo De Lucca. See assets/provenance.json.
   Animation is a projection of Corp's ledger; it never advances a task. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('room'), ctx = canvas.getContext('2d');
  const model = new OfficeModel(), images = {}, people = new Map();
  const labels = { IDLE:'Sẵn sàng', QUEUED:'Đợi nhận việc', DISPATCHED:'Đã gửi nhiệm vụ',
    WAITING:'Chờ phản hồi', LIMIT:'Chờ reset hạn mức', PAUSED:'Tạm dừng', COMPLETED:'Đã có kết quả', REVIEW:'Chờ duyệt', BLOCKED:'Bị chặn', DONE:'Đã bàn giao', UNKNOWN:'Chưa rõ trạng thái' };
  const colors = { IDLE:'#46665f', QUEUED:'#46665f', DISPATCHED:'#176448', WAITING:'#345b92', LIMIT:'#82541e', PAUSED:'#46665f', COMPLETED:'#72501a', REVIEW:'#72501a', BLOCKED:'#a6333a', DONE:'#176448' };
  let visible = false, raf = 0, selected = null, sceneHeight = 420, last = 0, now = 0, error = false;
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pending = [], delivery = null, lastRoster = '', lastRoles = '';
  let zoom = 1, fit = false, sceneWidth = 640, columns = 3, tooltipAgent = null, viewScale = 1, tooltipTimer;
  let deskRows = 0, seatCount = 0, firstRow = 244, rowGap = 120;
  const statusTone = status => ({DISPATCHED:'sending',WAITING:'waiting',COMPLETED:'review',REVIEW:'review',LIMIT:'limit',BLOCKED:'blocked',DONE:'sending'}[status] || 'idle');
  function geometry(scale, fillHeight=true) {
    const width = Math.max(480, Math.floor(($('scene').clientWidth - 16) / scale));
    const capacity = Math.max(2, Math.floor((width - 48) / 156));
    const staff = [...people.values()].filter(p => !p.boss);
    // Keep a corridor below the lounge, then distribute desks across the usable floor.
    const top = [...people.values()].some(p => p.boss) ? 264 : 244;
    const count = staff.length, floorHeight = Math.max(120,($('scene').clientHeight-16)/scale-(top-68)-28);
    const preferred = Math.max(2,Math.round(Math.sqrt(count*(width-48)/(floorHeight*1.4))));
    const rows = Math.ceil(count/Math.min(capacity,preferred)), cols = rows ? Math.ceil(count/rows) : 2;
    const contentHeight = Math.max(320, count ? top + Math.max(0,rows-1)*120 + 62 : 0);
    const height = Math.max(contentHeight,fillHeight?Math.floor(($('scene').clientHeight-16)/scale):0);
    return {width, cols, rows, count, height, first:rows===1?top+(height-top-62)/2:top,
      gap:rows>1?(height-top-62)/(rows-1):120};
  }
  function resizeView() {
    const next = geometry(zoom), changed = sceneWidth !== next.width || sceneHeight !== next.height || columns !== next.cols ||
      deskRows !== next.rows || seatCount !== next.count || firstRow !== next.first || rowGap !== next.gap;
    if (changed || viewScale !== zoom) hideTooltip();
    viewScale = zoom;
    sceneWidth = next.width; sceneHeight = next.height; columns = next.cols;
    deskRows = next.rows; seatCount = next.count; firstRow = next.first; rowGap = next.gap;
    if (changed) {
      for (const p of people.values()) p.seat = seat(p.slot, p.boss);
      clearMovement();
    }
    if (canvas.width !== sceneWidth * 2 || canvas.height !== sceneHeight * 2) {
      canvas.width=sceneWidth*2;canvas.height=sceneHeight*2;ctx.setTransform(2,0,0,2,0,0);ctx.imageSmoothingEnabled=false;
    }
    $('stage').style.width = `${sceneWidth * zoom}px`;
    $('stage').style.height = `${sceneHeight * zoom}px`;
    $('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
    $('zoom-fit').setAttribute('aria-pressed', String(fit));
    $('zoom-out').disabled = zoom <= .75;
    $('zoom-in').disabled = zoom >= 2;
    for (const label of $('seat-labels').children) {
      const p = people.get(label.dataset.agent);
      if (!p) continue;
      label.style.left = `${p.seat.x * zoom}px`;
      label.style.top = `${(p.seat.y - (p.boss ? 7 : 12)) * zoom}px`;
      label.style.width = `${(p.boss ? 144 : 132) * zoom}px`;
      label.style.height = `${94 * zoom}px`;
    }
    $('room-sign').style.top = `${27 * zoom}px`;
    $('lounge-sign').style.left = `${100 * zoom}px`;
    $('lounge-sign').style.top = `${134 * zoom}px`;
    draw();
  }
  function fitRoom() {
    fit = true; zoom = .75;
    for (let candidate=1.5;candidate>=.75;candidate-=.05) {
      const value = Math.round(candidate * 100) / 100, g = geometry(value,false);
      if (g.width * value <= $('scene').clientWidth - 16 && g.height * value <= $('scene').clientHeight - 16) { zoom=value;break; }
    }
    resizeView();
  }
  function hideTooltip() {
    clearTimeout(tooltipTimer);
    tooltipAgent = null; $('employee-tooltip').hidden = true;
  }
  function deferTooltipHide() { clearTimeout(tooltipTimer);tooltipTimer=setTimeout(hideTooltip,180); }
  function showTooltip(id, anchor) {
    const p = people.get(id); if (!p) return;
    clearTimeout(tooltipTimer);
    tooltipAgent = id;
    $('tooltip-name').textContent = p.role.split('\n')[0];
    $('tooltip-status').textContent = labels[p.status] || labels.UNKNOWN;
    $('tooltip-department').textContent = [p.department, p.chatName && p.chatName !== p.role ? p.chatName : ''].filter(Boolean).join(' · ');
    $('tooltip-dot').className = `status-dot ${statusTone(p.status)}`;
    const tip = $('employee-tooltip'); tip.hidden = false;
    const box = anchor.getBoundingClientRect(), bounds = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(innerWidth - bounds.width - 8, box.left + box.width / 2 - bounds.width / 2))}px`;
    const above = box.top - bounds.height - 8;
    tip.style.top = `${Math.max(8, Math.min(innerHeight - bounds.height - 8, above >= 8 ? above : box.bottom + 8))}px`;
  }
  const bridge = {openChat(id){parent.postMessage({type:'corp-open-chat',id},location.origin);}};
  const assets = ['DESK_FRONT','PC_FRONT_OFF','PC_FRONT_ON_1','PC_FRONT_ON_2','PC_FRONT_ON_3',
    'WOODEN_CHAIR_FRONT','SOFA_FRONT','BOOKSHELF','LARGE_PLANT','COFFEE','WHITEBOARD','CLOCK',
    ...Array.from({length:6},(_,i)=>`char_${i}`)];
  const hash = value => [...value].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
  function sprite(name,x,y,scale=1) {
    const image = images[name];
    if (image?.complete && image.naturalWidth) ctx.drawImage(image, Math.round(x), Math.round(y), image.width*scale, image.height*scale);
  }
  function text(value,x,y,color='#314d49',size=11,align='center') {
    ctx.fillStyle=color;ctx.font=`${size}px "Segoe UI", sans-serif`;ctx.textAlign=align;ctx.fillText(value,x,y);
  }
  function rect(x,y,w,h,fill) {ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);}
  function seat(index, boss) {
    if(boss)return {x:sceneWidth/2,y:137};
    if(!deskRows)return {x:sceneWidth/2,y:firstRow};
    const perRow=Math.floor(seatCount/deskRows), extra=seatCount%deskRows, longSlots=(perRow+1)*extra;
    const row=index<longSlots?Math.floor(index/(perRow+1)):extra+Math.floor((index-longSlots)/perRow);
    const inRow=perRow+(row<extra?1:0), column=index-row*perRow-Math.min(row,extra);
    const cell=(sceneWidth-48)/columns, offset=(columns-inRow)/2;
    return {x:24+cell*(column+offset+.5),y:firstRow+row*rowGap};
  }
  function layout(agents, reset) {
    if(reset)people.clear();
    const alive=new Set(agents.map(a=>a.id));
    for(const id of people.keys())if(!alive.has(id))people.delete(id);
    const staff=[...people.values()].filter(p=>!p.boss).sort((a,b)=>a.slot-b.slot);
    staff.forEach((p,index)=>{p.slot=index;});
    const slots=new Set(staff.map(p=>p.slot));
    let hasBoss=[...people.values()].some(p=>p.boss);
    for(const a of agents) {
      const old=people.get(a.id);
      const boss=old?.boss||(!hasBoss&&(a.roleId==='ceo'||a.roles.includes('CEO / Orchestrator')));
      let slot=old?.slot??0;
      if(!old&&!boss){while(slots.has(slot))slot++;slots.add(slot);}
      if(boss)hasBoss=true;
      const s=seat(slot,boss);
      const moved=old&&(old.seat.x!==s.x||old.seat.y!==s.y);
      people.set(a.id,{...old,...a,seat:s,boss,slot,palette:hash(a.id)%6,
        x:old&&!moved?old.x:s.x,y:old&&!moved?old.y:s.y,route:old&&!moved?old.route:[]});
    }
    resizeView();
  }
  function select(id) {selected=id;lastRoster='';renderUI();draw();}
  function avatar(a) {
    const c=document.createElement('canvas');c.width=24;c.height=40;c.className='avatar';c.setAttribute('aria-hidden','true');
    const g=c.getContext('2d'), im=images[`char_${hash(a.id)%6}`];g.imageSmoothingEnabled=false;
    if(im?.naturalWidth)g.drawImage(im,16,0,16,32,2,0,20,40);
    return c;
  }
  function renderUI() {
    const data=model.current;if(!data)return;
    $('project').textContent=data.project?data.name:'Chọn ChatGPT Project để xem đội ngũ.';
    $('health').textContent=error?'Mất cập nhật. Trạng thái hiển thị đã cũ; đang thử lại.':
      `${data.coordinator?'Điều phối: Bật':'Điều phối: Tắt'} · ${data.agents.length} nhân viên`;
    $('connection').classList.toggle('error',error);
    $('count').textContent=data.agents.length;
    $('empty').hidden=!!data.agents.length;
    const signature=JSON.stringify([data.agents,selected]);
    if(signature!==lastRoster) {
      const focused=document.activeElement?.dataset.agent;
      $('roster').replaceChildren();
      let department=null;
      for(const a of data.agents) {
        if(a.department&&department!==a.department){department=a.department;const heading=document.createElement('h3');heading.className='department-title';heading.textContent=department;$('roster').append(heading);}
        const b=document.createElement('button');b.type='button';b.className='person';b.dataset.agent=a.id;
        b.setAttribute('aria-pressed',String(selected===a.id));b.append(avatar(a));
        const words=document.createElement('span'), title=document.createElement('strong'), state=document.createElement('small');
        title.textContent=a.role.split('\n')[0];b.title=a.role;state.textContent=labels[a.status]||labels.UNKNOWN;
        const dot=document.createElement('i');dot.className=`status-dot ${statusTone(a.status)}`;dot.setAttribute('aria-hidden','true');title.prepend(dot);
        words.append(title,state);b.append(words);b.onclick=()=>select(a.id);$('roster').append(b);
        if(focused===a.id)b.focus({preventScroll:true});
      }
      lastRoster=signature;
      const labelsRoot = $('seat-labels');hideTooltip();
      const seatFocus = labelsRoot.contains(document.activeElement) ? document.activeElement.dataset.agent : null;
      labelsRoot.replaceChildren();
      for (const p of people.values()) {
        const b=document.createElement('button');b.type='button';b.className='seat-label';b.dataset.agent=p.id;
        b.setAttribute('aria-pressed',String(selected===p.id));
        b.setAttribute('aria-label',`${p.role.split('\n')[0]} - ${labels[p.status]||labels.UNKNOWN}`);
        b.setAttribute('aria-describedby','employee-tooltip');
        const dot=document.createElement('i');dot.className=`status-dot ${statusTone(p.status)}`;dot.setAttribute('aria-hidden','true');b.append(dot);
        b.onpointerenter=()=>showTooltip(p.id,b);b.onpointerleave=()=>{if(document.activeElement!==b)deferTooltipHide();};
        b.onfocus=()=>showTooltip(p.id,b);b.onblur=hideTooltip;
        b.onclick=()=>{select(p.id);const current=[...labelsRoot.children].find(el=>el.dataset.agent===p.id);if(current)showTooltip(p.id,current);};labelsRoot.append(b);
        if(seatFocus===p.id)b.focus({preventScroll:true});
      }
      resizeView();
    }
    const a=data.agents.find(a=>a.id===selected);
    $('detail').hidden=!a;
    if(a) {
      $('detail-status').textContent=(labels[a.status]||labels.UNKNOWN)+(a.provisional?' · Chưa gắn chat':'');
      $('detail-role').textContent=[a.department,a.chatName||a.roles.join(' / ')].filter(Boolean).join(' · ');
      $('detail-task').textContent=a.task||'Chưa có nhiệm vụ. Chat đã sẵn sàng trong Project này.';
      $('detail-count').textContent=`${a.count} nhiệm vụ chưa kết thúc${a.task_id?' · '+a.task_id:''}`;
      $('open-chat').disabled=!a.can_open||error;
    }
    $('handoffs').replaceChildren();
    $('handoff-empty').hidden=!!data.handoffs.length;
    for(const h of data.handoffs.slice(-4).reverse()) {
      const li=document.createElement('li'), b=document.createElement('b'), t=document.createElement('time');
      b.textContent=`${people.get(h.from)?.role||'Nhân viên'} giao cho ${people.get(h.to)?.role||'nhân viên'}`;
      const stamp=new Date(h.at);t.textContent=Number.isNaN(stamp.valueOf())?'':stamp.toLocaleString('vi-VN');
      li.append(b,t);li.title=h.task;$('handoffs').append(li);
    }
  }
  function walkTo(p,target) {
    // Outer aisles stay clear even when a shorter desk row is centered.
    const rowY=y=>y<200?190:y+48;
    const lane=p.x<sceneWidth/2?26:sceneWidth-26;
    p.route=[{x:p.x,y:rowY(p.y)},{x:lane,y:rowY(p.y)},
      {x:lane,y:rowY(target.y)},{x:target.x,y:rowY(target.y)},{...target}];
  }
  function startDelivery() {
    if(delivery||!pending.length||reduced)return;
    const event=pending.shift(), p=people.get(event.from), target=people.get(event.to);
    if(!p||!target)return;
    delivery={event,actor:p.id,phase:'out',hold:0};
    walkTo(p,{x:target.seat.x+32,y:target.seat.y});
  }
  function advance(dt) {
    startDelivery();
    for(const p of people.values()) {
      if(!p.route.length)continue;
      const target=p.route[0],dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),step=95*dt;
      p.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
      if(d<=step){p.x=target.x;p.y=target.y;p.route.shift();}
      else{p.x+=dx/d*step;p.y+=dy/d*step;}
    }
    if(delivery) {
      const p=people.get(delivery.actor);
      if(!p){delivery=null;return;}
      if(!p.route.length) {
        if(delivery.phase==='out'){delivery.phase='hold';delivery.hold=now+1.3;}
        else if(delivery.phase==='hold'&&now>delivery.hold){delivery.phase='back';walkTo(p,p.seat);}
        else if(delivery.phase==='back')delivery=null;
      }
    }
  }
  function drawRoom() {
    rect(0,0,sceneWidth,sceneHeight,'#d9e3ce');
    // Timber planks belong to the office floor, and stay behind all task information.
    for(let y=70;y<sceneHeight-18;y+=18) {
      rect(18,y,sceneWidth-36,17,y%36?'#e8d5b2':'#e3cfa9');
      for(let x=18+((y/18|0)%2)*45;x<sceneWidth-18;x+=90)rect(x,y,1,17,'#d1bc95');
    }
    rect(10,14,sceneWidth-20,54,'#a7c4ac');rect(10,61,sceneWidth-20,7,'#6d967e');
    rect(10,68,8,sceneHeight-78,'#759981');rect(sceneWidth-18,68,8,sceneHeight-78,'#759981');
    rect(10,sceneHeight-18,sceneWidth-20,8,'#759981');
    for(const x of [44,sceneWidth-144]){rect(x,25,100,30,'#6e9e98');rect(x+4,28,92,24,'#d4e9e3');rect(x+49,28,3,24,'#8bb4a1');}
    if([...people.values()].some(p=>p.boss)){
      rect(sceneWidth/2-72,83,144,94,'#a6bdae');rect(sceneWidth/2-66,89,132,82,'#b5cebd');
    }
    sprite('BOOKSHELF',168,41,1.2);sprite('CLOCK',sceneWidth-174,25,1);
    sprite('LARGE_PLANT',24,80,1.5);sprite('LARGE_PLANT',sceneWidth-72,80,1.5);
    sprite('SOFA_FRONT',48,95,2);sprite('COFFEE',136,107,1.5);
    sprite('WHITEBOARD',sceneWidth-152,98,1.5);
    for(const p of people.values()) {
      const {x,y}=p.seat;
      if(!p.boss){rect(x-66,y-59,132,94,'#c2ccb0');rect(x-60,y-53,120,82,'#ced7be');}
      sprite('WOODEN_CHAIR_FRONT',x-12,y-45,1.5);
      sprite('DESK_FRONT',x-36,y-51,1.5);
      const active=!error&&p.pose==='type';
      sprite(active?`PC_FRONT_ON_${1+(Math.floor(now*3)%3)}`:'PC_FRONT_OFF',x-12,y-68,1.5);
      if(p.id===selected){ctx.strokeStyle='#24674d';ctx.lineWidth=2;ctx.strokeRect(x-(p.boss?72:66),y-(p.boss?54:59),p.boss?144:132,94);}
    }
  }
  function drawPerson(p) {
    const moving=!!p.route.length, dir=moving?p.dir:'down';
    const typing=!error&&!reduced&&!moving&&p.pose==='type';
    const reading=!error&&!reduced&&!moving&&p.pose==='read';
    const frame=moving?[0,1,2,1][Math.floor(now*8)%4]:typing?3+Math.floor(now*3)%2:reading?5+Math.floor(now*2)%2:1;
    const row=dir==='up'?1:(dir==='left'||dir==='right')?2:0;
    const image=images[`char_${p.palette}`];
    ctx.fillStyle='#304d4329';ctx.beginPath();ctx.ellipse(p.x,p.y,13,4,0,0,Math.PI*2);ctx.fill();
    if(image?.naturalWidth){ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y));if(dir==='left')ctx.scale(-1,1);
      ctx.drawImage(image,frame*16,row*32,16,32,-12,-43,24,48);ctx.restore();}
    if(delivery?.actor===p.id&&delivery.phase!=='back') {
      rect(p.x+8,p.y-24,12,15,'#fff8df');rect(p.x+10,p.y-20,8,1,'#789b81');rect(p.x+10,p.y-17,6,1,'#789b81');
    }
    if(['WAITING','BLOCKED','REVIEW','QUEUED','LIMIT','PAUSED'].includes(p.status)&&!moving) {
      rect(p.x+10,p.y-56,24,16,'#fffbed');
      rect(p.x+13,p.y-40,4,4,'#fffbed');
      const mark=p.status==='BLOCKED'?'!':p.status==='REVIEW'?'?':p.status==='QUEUED'?'Z':'...';
      text(mark,p.x+22,p.y-44,colors[p.status],12);
    }
  }
  function draw() {
    ctx.imageSmoothingEnabled=false;drawRoom();
    [...people.values()].sort((a,b)=>a.y-b.y).forEach(drawPerson);
  }
  function frame(ts) {
    raf=0;if(!visible||document.hidden)return;
    const dt=last?Math.min((ts-last)/1000,.06):0;last=ts;now=ts/1000;
    if(!reduced&&!error)advance(dt);draw();
    if(!reduced&&!error)raf=requestAnimationFrame(frame);
  }
  function schedule() {if(visible&&!document.hidden&&!raf)raf=requestAnimationFrame(frame);}
  function clearMovement(){pending=[];delivery=null;for(const p of people.values()){p.route=[];p.x=p.seat.x;p.y=p.seat.y;}}
  window.office={
    setSnapshot(data) {
      const roles=JSON.stringify(data.agents.map(agent=>[agent.id,agent.roleId||'']).sort());
      const reset=data.baseline||model.project!==data.project||roles!==lastRoles;lastRoles=roles;
      const events=model.accept(data);error=false;
      layout(data.agents,reset);if(reset)clearMovement();
      if(!people.has(selected))selected=null;
      // Bound visual backlog. The full history remains visible in the ledger.
      if(!reduced)pending.push(...events.slice(-12));
      pending=pending.slice(-12);
      renderUI();draw();schedule();
    },
    setVisible(value){visible=value;if(!value){cancelAnimationFrame(raf);raf=0;last=0;clearMovement();}else schedule();},
    setError(){error=true;clearMovement();renderUI();draw();},
    inspect(){return{agents:people.size,pending:pending.length,delivery:delivery?.event.id??null,visible,reduced,error,framesActive:!!raf,project:model.project,bridgeReady:!!bridge,zoom,fit,sceneWidth,columns,sceneHeight,deskRows,firstRow,rowGap,tooltipAgent};}
  };
  $('zoom-out').onclick=()=>{fit=false;zoom=Math.max(.75,Math.round((zoom-.25)*100)/100);resizeView();};
  $('zoom-in').onclick=()=>{fit=false;zoom=Math.min(2,Math.round((zoom+.25)*100)/100);resizeView();};
  $('zoom-fit').onclick=fitRoom;
  $('expand').onclick=()=>parent.postMessage({type:'corp-office-expand'},location.origin);
  new ResizeObserver(resizeView).observe($('scene'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTooltip();parent.postMessage({type:'corp-office-collapse'},location.origin);}});
  $('scene').addEventListener('scroll',()=>{
    const focused=document.activeElement;
    if(focused?.classList.contains('seat-label')&&tooltipAgent===focused.dataset.agent)showTooltip(tooltipAgent,focused);
    else hideTooltip();
  });
  $('employee-tooltip').onpointerenter=()=>clearTimeout(tooltipTimer);
  $('employee-tooltip').onpointerleave=deferTooltipHide;
  canvas.addEventListener('click',event=>{
    const bounds=canvas.getBoundingClientRect(),x=(event.clientX-bounds.left)*sceneWidth/bounds.width,y=(event.clientY-bounds.top)*sceneHeight/bounds.height;
    const p=[...people.values()].find(p=>Math.abs(p.x-x)<55&&Math.abs(p.y-y)<55);if(p)select(p.id);
  });
  $('open-chat').onclick=()=>{const a=model.current?.agents.find(a=>a.id===selected);if(a?.can_open&&!error&&bridge)bridge.openChat(a.id);};
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent)return;
    if(event.data?.type==='corp-office-expanded'){$('expand').textContent=event.data.expanded?'Thu gọn':'Mở rộng';$('expand').setAttribute('aria-pressed',String(event.data.expanded));return;}
    if(event.data?.type==='corp-office-error'){window.office.setError();return;}
    if(event.data?.type!=='corp-office')return;
    window.office.setSnapshot(event.data.snapshot);window.office.setVisible(Boolean(event.data.visible));
  });
  function updateMotion(){ $('motion').setAttribute('aria-pressed',String(reduced));if(reduced)clearMovement();schedule(); }
  $('motion').onclick=()=>{reduced=!reduced;updateMotion();};
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{reduced=e.matches;updateMotion();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0;}else schedule();});
  Promise.all(assets.map(name=>new Promise(resolve=>{const im=new Image();images[name]=im;im.onload=resolve;im.onerror=resolve;im.src=`assets/${name}.png`;})))
    .then(()=>{lastRoster='';renderUI();draw();});
  updateMotion();draw();
})();
