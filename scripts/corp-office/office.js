/* Pixel Agents sprites: MIT, Pablo De Lucca. See assets/provenance.json.
   Animation is a projection of Corp's ledger; it never advances a task. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('room'), ctx = canvas.getContext('2d');
  const model = new OfficeModel(), images = {}, people = new Map(), life = new OfficeLife(people);
  let ambient=true,lifeStatus='',lastLifeUI=-1,preview=false,latestSnapshot=null;
  const labels = { IDLE:'Sẵn sàng', QUEUED:'Đợi nhận việc', DISPATCHED:'Đã gửi nhiệm vụ',
    WAITING:'Chờ phản hồi', LIMIT:'Chờ reset hạn mức', PAUSED:'Tạm dừng', COMPLETED:'Đã có kết quả', REVIEW:'Chờ duyệt', BLOCKED:'Bị chặn', DONE:'Đã bàn giao', UNKNOWN:'Chưa rõ trạng thái' };
  const colors = { IDLE:'#46665f', QUEUED:'#46665f', DISPATCHED:'#176448', WAITING:'#345b92', LIMIT:'#82541e', PAUSED:'#46665f', COMPLETED:'#72501a', REVIEW:'#72501a', BLOCKED:'#a6333a', DONE:'#176448' };
  let visible = false, raf = 0, selected = null, sceneHeight = 420, last = 0, now = 0, error = false;
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pending = [], delivery = null, lastRoster = '', lastRoles = '';
  let zoom = 1, fit = true, sceneWidth = 640, columns = 3, tooltipAgent = null, viewScale = 1, tooltipTimer;
  let deskRows = 0, seatCount = 0, firstRow = 244, rowGap = 120;
  const qaMode=new URLSearchParams(location.search).get('qa')==='1';let frameDraws=[];
  const compact=new URLSearchParams(location.search).get('compact')==='1';let compactFitted=false;
  document.body.classList.toggle('compact-office',compact);
  life.configure(sceneWidth,sceneHeight);
  const statusTone = status => ({DISPATCHED:'sending',WAITING:'waiting',COMPLETED:'review',REVIEW:'review',LIMIT:'limit',BLOCKED:'blocked',DONE:'sending'}[status] || 'idle');
  function geometry(scale, fillHeight=true) {
    const width=Math.max(640,Math.min(1280,Math.floor($('scene').clientWidth-16)));
    const count=[...people.values()].filter(p=>!p.boss).length,capacity=Math.max(2,Math.min(4,Math.floor((width-56)/140)));
    const rows=Math.ceil(count/capacity),cols=rows?Math.ceil(count/rows):2;
    const top=[...people.values()].some(p=>p.boss)?300:280;
    const contentHeight=Math.max(620,top+Math.max(0,rows-1)*120+180);
    const height=contentHeight;
    return {width,cols,rows,count,height,first:top,gap:rows>1?Math.max(120,(height-180-top)/(rows-1)):120};
  }
  function resizeView() {
    if($('scene').clientWidth<=16||$('scene').clientHeight<=16)return;
    const g=geometry(1,false);const maxZoom=Math.max(.1,Math.min(2,($('scene').clientWidth-16)/g.width,($('scene').clientHeight-16)/g.height));
    zoom=fit?maxZoom:Math.min(zoom,maxZoom);
    const next = geometry(zoom), changed = sceneWidth !== next.width || sceneHeight !== next.height || columns !== next.cols ||
      deskRows !== next.rows || seatCount !== next.count || firstRow !== next.first || rowGap !== next.gap;
    if (changed || viewScale !== zoom) hideTooltip();
    viewScale = zoom;
    sceneWidth = next.width; sceneHeight = next.height; columns = next.cols;
    deskRows = next.rows; seatCount = next.count; firstRow = next.first; rowGap = next.gap;
    life.configure(sceneWidth,sceneHeight);
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
    $('zoom-out').disabled = zoom <= .25;
    $('zoom-in').disabled = zoom >= maxZoom-.01;
    for (const label of $('seat-labels').children) {
      const p = people.get(label.dataset.agent);
      if (!p) continue;
      label.style.left = `${p.seat.x * zoom}px`;
      label.style.top = `${(p.seat.y - (p.boss ? 7 : 12)) * zoom}px`;
      label.style.width = `${(p.boss ? 144 : 132) * zoom}px`;
      label.style.height = `${94 * zoom}px`;
    }
    $('room-sign').style.top = `${27 * zoom}px`;
    $('lounge-sign').style.left = `${110 * zoom}px`;
    $('lounge-sign').style.top = `${(sceneHeight-120) * zoom}px`;
    draw();
  }
  function fitRoom() {fit=true;resizeView();}
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
    'COFFEE_TABLE','CUSHIONED_CHAIR_BACK','SOFA_SIDE','SOFA_BACK','PLANT','PLANT_2','CACTUS','SMALL_PAINTING_2','HANGING_PLANT','DOUBLE_BOOKSHELF',
    ...Array.from({length:6},(_,i)=>`char_${i}`)];
  const hash = value => [...value].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
  function sprite(name,x,y,scale=1) {
    const image = images[name];
    if (image?.complete && image.naturalWidth) ctx.drawImage(image, Math.round(x), Math.round(y), image.width*scale, image.height*scale);
  }
  function text(value,x,y,color='#314d49',size=11,align='center') {
    size=Math.max(size,12/Math.max(.25,zoom));
    ctx.fillStyle=color;ctx.font=`${size}px "Segoe UI", sans-serif`;ctx.textAlign=align;ctx.fillText(value,x,y);
  }
  function rect(x,y,w,h,fill) {ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);}
  function seat(index, boss) {
    if(boss)return {x:sceneWidth/2,y:154};
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
    for(const p of people.values())life.init(p);
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
      `${data.illustration?'MINH HỌA · ':''}${data.coordinator?'Điều phối: Bật':'Điều phối: Tắt'} · ${data.agents.length} nhân viên`;
    $('connection').classList.toggle('error',error);
    const active=data.agents.some(agent=>['DISPATCHED','WAITING','LIMIT','REVIEW','BLOCKED','QUEUED','PAUSED'].includes(agent.status));
    $('connection').dataset.state=error?'error':active?'active':'idle';
    $('count').textContent=data.agents.length;
    const customers=data.customers||[];$('customer-count').textContent=customers.length;$('customers').replaceChildren();
    for(const customer of customers.slice(0,12)){const li=document.createElement('li'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=customer.name||'Chưa đặt tên';small.textContent=customer.title||'';li.append(strong,small);$('customers').append(li);}
    if(!customers.length){const li=document.createElement('li');li.textContent='Chưa có khách chờ.';$('customers').append(li);}
    $('customer-line').hidden=!customers.length;$('customer-line').replaceChildren();
    for(const [index,customer] of customers.slice(0,3).entries()){const name=document.createElement('span');name.textContent=`${index+1} · ${customer.name||'Chưa đặt tên'}`;name.title=customer.name||'Chưa đặt tên';name.setAttribute('role','listitem');$('customer-line').append(name);}
    if(customers.length>3){const count=document.createElement('span');count.textContent=`+${customers.length-3} khách`;$('customer-line').append(count);}
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
  function walkTo(p,target) {life.routeTo(p,target);}
  function startDelivery() {
    if(delivery||!pending.length||reduced)return;
    const event=pending.shift(),p=people.get(event.from),target=people.get(event.to);
    if(!p||!target)return;
    // Finish an existing rest trip before a real handoff; avoid teleporting a sleeper.
    if(p.activity!=='desk'){pending.unshift(event);life.interrupt(p);return;}
    delivery={event,actor:p.id,phase:'out',hold:0};
    walkTo(p,{x:target.seat.x+40,y:target.seat.y+30,desk:true});life.begin(p,'handoff');
  }
  function advance(dt) {
    startDelivery();life.step(dt,{ambient});now=life.time;
    if(delivery){const p=people.get(delivery.actor);if(!p)delivery=null;
      else if(!p.route.length){if(delivery.phase==='out'){delivery.phase='hold';delivery.hold=now+1.3;}
        else if(delivery.phase==='hold'&&now>delivery.hold){delivery.phase='back';walkTo(p,p.seat);}
        else if(delivery.phase==='back'){life.begin(p,'desk');delivery=null;}}
    }
    const eventNames={spread:'Trải nệm nghỉ',sleep:'Nghỉ một lát',snack:'Ăn vặt ở pantry',courier_arrive:'Shipper đến cửa',courier_drop:'Nhận đồ tại quầy',courier_leave:'Shipper rời văn phòng'};
    for(const event of life.takeEvents())if(eventNames[event.kind]){const actor=people.get(event.actor),entry=document.createElement('li');entry.textContent=(actor?actor.role.split('\n')[0]+' · ':'')+eventNames[event.kind];$('life-events').prepend(entry);while($('life-events').children.length>6)$('life-events').lastElementChild.remove();lifeStatus=eventNames[event.kind];}
    if(Math.floor(now)!==lastLifeUI){lastLifeUI=Math.floor(now);document.body.dataset.life=lifeStatus;}
  }
  function drawRoom() {
    rect(0,0,sceneWidth,sceneHeight,'#263c37');
    rect(14,16,sceneWidth-28,sceneHeight-30,'#e7d5b4');
    for(let y=64;y<sceneHeight-18;y+=16){rect(18,y,sceneWidth-36,15,(y/16)%2?'#e5cfa9':'#eddcbb');for(let x=18+((y/16|0)%2)*40;x<sceneWidth-18;x+=80)rect(x,y,1,15,'#d5bb90');}
    rect(16,18,sceneWidth-32,48,'#a5c3b3');rect(16,61,sceneWidth-32,7,'#54796a');
    for(const x of [38,sceneWidth-134]){rect(x,28,96,28,'#527b79');rect(x+4,31,88,21,'#c4ded5');rect(x+47,31,3,21,'#8eb6a7');rect(x+6,33,23,3,'#e3f1e2');}
    sprite('HANGING_PLANT',150,22,1.5);sprite('SMALL_PAINTING_2',sceneWidth-205,18,1.5);sprite('CLOCK',sceneWidth/2+90,28,1);
    // Reception: customers are actual queued runs; the empty chairs never invent a visitor.
    rect(36,88,170,105,'#bccbb4');rect(42,94,158,93,'#d5dfc7');
    for(const x of [65,113,161])sprite('CUSHIONED_CHAIR_BACK',x-12,119,1.5);
    text('TIẾP KHÁCH',121,108,'#365a4c',10);
    const customers=model.current?.customers||[];
    customers.slice(0,3).forEach((customer,index)=>{const x=65+index*48;drawCharacter(hash(customer.id)%6,1,'down',x,158);text(String(index+1),x,179,'#355044',Math.max(11,11/zoom));});
    // Pantry counter and delivery shelf, separated from the central corridor.
    const px=sceneWidth-196;rect(px,85,160,108,'#bbccb9');rect(px+6,91,148,96,'#d9e3cf');
    sprite('DOUBLE_BOOKSHELF',px+8,82,1.5);sprite('COFFEE',px+74,106,1.5);sprite('PLANT_2',px+122,88,1.5);
    text('PANTRY',px+77,103,'#365a4c',10);rect(px+72,150,38,17,'#caa16e');rect(px+72,148,38,3,'#725940');
    for(let index=0;index<3;index++){rect(px+78+index*9,143,6,7,['#a65743','#ba9445','#5f8b77'][index]);}
    rect(sceneWidth-19,190,5,48,'#3f6359');rect(sceneWidth-16,197,3,34,'#c6d9bf');
    text('CỬA',sceneWidth-34,190,'#365a4c',9);
    // Work islands: different textiles, chairs and desk accessories, common reachable aisles.
    const rugs=['#b7cbbd','#c4c9df','#d5bdad','#c0d0ac'];
    for(const p of people.values()){
      const {x,y}=p.seat,theme=p.slot%4;
      rect(x-55,y-94,110,112,rugs[theme]);rect(x-51,y-90,102,104,'#ffffff25');
      sprite('WOODEN_CHAIR_FRONT',x-12,y-47,1.5);
      sprite('DESK_FRONT',x-36,y-68,1.5);
      sprite(life.working(p)?`PC_FRONT_ON_${1+(Math.floor(now*3)%3)}`:'PC_FRONT_OFF',x-12,y-85,1.5);
      if(theme===0){rect(x-28,y-52,12,3,'#8d6e50');rect(x-28,y-56,10,3,'#5b8b8a');}
      else if(theme===1){rect(x+21,y-57,7,9,'#f3eddb');rect(x+22,y-60,5,4,'#9a6b4a');}
      else if(theme===2){rect(x-28,y-58,8,10,'#6c8d66');rect(x-26,y-63,4,6,'#476c4a');}
      else {rect(x+20,y-55,12,7,'#e9e0cb');rect(x+22,y-53,8,1,'#b7ae97');}
      if(p.id===selected){ctx.strokeStyle='#24674d';ctx.lineWidth=2;ctx.strokeRect(x-55,y-94,110,112);}
    }
    const ry=sceneHeight-118;rect(36,ry,Math.max(240,sceneWidth-290),91,'#b8c9b8');rect(42,ry+6,Math.max(228,sceneWidth-302),79,'#d5decb');
    sprite('SOFA_FRONT',60,ry+27,2);sprite('COFFEE_TABLE',139,ry+18,1.5);sprite('LARGE_PLANT',38,ry+10,1.5);sprite('SOFA_SIDE',219,ry+13,1.5);
    if(sceneWidth>850){const mx=sceneWidth*.46;sprite('SOFA_BACK',mx-42,ry+15,1.5);sprite('COFFEE_TABLE',mx-18,ry+32,1.5);sprite('SOFA_FRONT',mx-42,ry+62,1.5);sprite('PLANT',mx+66,ry+17,1.5);sprite('BOOKSHELF',mx-102,ry+20,1.5);}
    sprite('CACTUS',sceneWidth-270,ry+10,1.5);text('GÓC NGHỈ',sceneWidth-133,ry+5,'#365a4c',10);
    for(let index=0;index<2;index++){const bed=life.bedPoints[index];rect(bed.x-35,bed.y-25,70,38,'#a5997d');rect(bed.x-32,bed.y-23,64,34,'#c5d4bd');rect(bed.x-30,bed.y-21,14,30,'#e6ead8');rect(bed.x-28,bed.y-19,10,26,'#f5efdb');if(!life.beds[index]){rect(bed.x+8,bed.y-20,23,28,'#78978b');rect(bed.x+8,bed.y-20,23,5,'#abc5b0');rect(bed.x+11,bed.y-12,17,2,'#5e7c70');}}
    if(life.parcel){rect(life.parcel.x,life.parcel.y,23,15,'#b8814f');rect(life.parcel.x+9,life.parcel.y,3,15,'#e4c99a');}
  }
  function drawCharacter(palette,frame,dir,x,y,{angle=0}={}) {
    const image=images[`char_${palette}`];if(!image?.naturalWidth)return;
    const row=dir==='up'?1:dir==='left'||dir==='right'?2:0;
    if(qaMode)frameDraws.push({palette,frame,row,dir,x,y,angle,valid:frame>=0&&(frame+1)*16<=image.width&&(row+1)*32<=image.height});
    ctx.save();ctx.translate(Math.round(x),Math.round(y));if(angle)ctx.rotate(angle);if(dir==='left')ctx.scale(-1,1);
    ctx.drawImage(image,frame*16,row*32,16,32,-12,-43,24,48);ctx.restore();
  }
  function drawPerson(p) {
    const moving=!!p.route.length&&!p.motionBlocked,working=life.working(p)&&p.activity==='desk';
    const sleeping=['lie_down','sleep','wake'].includes(p.activity),elapsed=now-p.phaseAt;
    if(sleeping){
      const bed=life.bedPoints[p.bed??0],fraction=p.activity==='sleep'?1:p.activity==='wake'?(p.wakeFrom??1)*(1-Math.min(1,elapsed/.8)):Math.min(1,elapsed/.8);
      const pose=Math.round(fraction*4)/4;
      drawCharacter(p.palette,1,'down',bed.x+20*pose,bed.y+26-29*pose,{angle:-Math.PI/2*pose});
      if(pose>.5){rect(bed.x-10,bed.y-21,44,30,'#78978b');rect(bed.x-10,bed.y-20,44,4,'#b8cfba');for(let x=bed.x-7;x<bed.x+32;x+=9)rect(x,bed.y-11,2,15,'#91ada0');}
      if(p.activity==='sleep')text('z z',bed.x-18,bed.y-35,'#48685c',11);
      return;
    }
    if(['spread','pack'].includes(p.activity)){
      const bed=life.bedPoints[p.bed??0],progress=p.activity==='spread'?Math.min(1,elapsed/1.2):(p.packFrom??1)*(1-Math.min(1,elapsed/1.2)),length=12+Math.floor(progress*4)*13;
      rect(bed.x-30,bed.y-21,length,30,'#91ada0');rect(bed.x-30,bed.y-21,10,30,'#dce3ce');
      drawCharacter(p.palette,3+Math.floor(now*4)%2,'up',bed.x,bed.y+26);return;
    }
    const dir=moving?p.dir:working?'up':'down';
    const typing=!error&&!reduced&&!moving&&working&&p.pose==='type';
    const reading=!error&&!reduced&&!moving&&!working&&p.pose==='read';
    const frame=moving?[0,1,2,1][Math.floor(now*8)%4]:typing?3+Math.floor(now*3)%2:p.activity==='snack'?5+Math.floor(now*3)%2:reading?5+Math.floor(now*2)%2:1;
    ctx.fillStyle='#304d4329';ctx.beginPath();ctx.ellipse(p.x,p.y,12,4,0,0,Math.PI*2);ctx.fill();
    drawCharacter(p.palette,frame,dir,p.x,p.y);
    if(p.activity==='snack'){const bite=Math.floor(now*3)%2;rect(p.x-9,p.y-13,17,10,'#d8b77b');rect(p.x-6,p.y-11,11,2,'#a87b45');rect(p.x+8,p.y-17-bite*5,6,5,'#c48742');rect(p.x+10,p.y-16-bite*5,1,1,'#5a3d28');}
    if(delivery?.actor===p.id&&delivery.phase!=='back'){rect(p.x+8,p.y-24,12,15,'#fff8df');rect(p.x+10,p.y-20,8,1,'#789b81');}
    if(['WAITING','BLOCKED','REVIEW','LIMIT','PAUSED'].includes(p.status)&&!moving&&p.activity==='desk'){
      rect(p.x+11,p.y-56,22,14,'#fffbed');rect(p.x+13,p.y-42,4,4,'#fffbed');text(p.status==='BLOCKED'?'!':p.status==='REVIEW'?'?':'...',p.x+22,p.y-45,colors[p.status],11);
    }
  }
  function draw() {
    if(qaMode)frameDraws=[];
    ctx.imageSmoothingEnabled=false;drawRoom();
    [...people.values()].sort((a,b)=>a.y-b.y).forEach(drawPerson);
    if(life.courier){const p=life.courier,moving=p.route.length&&!p.motionBlocked,dir=moving?p.dir:'up';drawCharacter(p.palette,moving?[0,1,2,1][Math.floor(now*8)%4]:1,dir,p.x,p.y);rect(p.x-9,p.y-43,18,5,'#447594');rect(p.x-12,p.y-39,24,3,'#315d77');if(p.phase!=='out'){const bx=p.x+(dir==='left'?-18:5);rect(bx,p.y-23,15,15,'#bf8d56');rect(bx+6,p.y-23,3,15,'#e7cda0');}text('Shipper',Math.max(40,Math.min(sceneWidth-40,p.x)),p.y-50,'#365a4c',10);}
  }
  function frame(ts) {
    raf=0;if(!visible||document.hidden)return;
    const dt=last?Math.min((ts-last)/1000,.06):0;last=ts;
    if(!reduced&&!error)advance(dt);draw();
    if(!reduced&&!error)raf=requestAnimationFrame(frame);
  }
  function schedule() {if(visible&&!document.hidden&&!raf)raf=requestAnimationFrame(frame);}
  function clearMovement(){pending=[];delivery=null;life.reset();}
  window.office={
    setSnapshot(data) {
      if(!data.illustration){latestSnapshot=data;if(preview)return;}
      const roles=JSON.stringify(data.agents.map(agent=>[agent.id,agent.roleId||'']).sort());
      const reset=data.baseline||model.project!==data.project||roles!==lastRoles;lastRoles=roles;
      const events=model.accept(data);error=false;
      layout(data.agents,reset);if(reset){clearMovement();life.log=[];$('life-events').replaceChildren();}
      if(!people.has(selected))selected=null;
      // Bound visual backlog. The full history remains visible in the ledger.
      if(!reduced)pending.push(...events.slice(-12));
      pending=pending.slice(-12);
      renderUI();draw();schedule();
      if(compact&&visible&&people.size&&!compactFitted){compactFitted=true;fitRoom();}
    },
    setVisible(value){if(!value)compactFitted=false;visible=value;document.body.dataset.visible=String(value);if(!value){cancelAnimationFrame(raf);raf=0;last=0;clearMovement();}else{resizeView();if(compact&&people.size&&!compactFitted){compactFitted=true;fitRoom();}schedule();}},
    setError(){error=true;clearMovement();renderUI();draw();},
    inspect(){return{life:life.inspect(),frameDraws:qaMode?frameDraws:undefined,preview,assetsReady:assets.every(name=>images[name]?.naturalWidth),ambient,agents:people.size,pending:pending.length,delivery:delivery?.event.id??null,visible,reduced,error,framesActive:!!raf,project:model.project,bridgeReady:!!bridge,zoom,fit,sceneWidth,columns,sceneHeight,deskRows,firstRow,rowGap,tooltipAgent};}
  };
  $('ambient').onclick=()=>{ambient=!ambient;$('ambient').textContent='Sinh hoạt: '+(ambient?'Bật':'Tắt');$('ambient').setAttribute('aria-pressed',String(ambient));if(!ambient)for(const p of people.values())life.interrupt(p);};
  $('preview').onclick=()=>{preview=!preview;$('preview').textContent=preview?'Thoát mẫu':'Xem mẫu';$('preview').setAttribute('aria-pressed',String(preview));if(preview){window.office.setSnapshot({illustration:true,project:'office-demo',name:'MINH HỌA - Văn phòng',baseline:true,coordinator:true,handoffs:[],customers:['Khách mẫu An','Khách mẫu Bình','Khách mẫu Chi'].map((name,index)=>({id:'demo-client-'+index,name,title:'Sản phẩm minh họa'})),agents:['Điều hành','Sản phẩm','Thiết kế','Kỹ thuật','QA','Bảo mật','DevOps','Tài liệu'].map((role,index)=>({id:'demo-staff-'+index,role,roleId:index===0?'ceo':String(index),roles:[role],status:index<2?'WAITING':'IDLE',pose:index<2?'type':'idle',count:index<2?1:0,can_open:false}))});}else window.office.setSnapshot(latestSnapshot?{...latestSnapshot,baseline:true}:{project:null,name:'',baseline:true,coordinator:false,handoffs:[],customers:[],agents:[]});};
  if(qaMode)window.office.advanceForTest=seconds=>{for(let elapsed=0;elapsed<seconds;elapsed+=1/30)advance(Math.min(1/30,seconds-elapsed));draw();return life.inspect();};
  $('zoom-out').onclick=()=>{fit=false;zoom=Math.max(.25,Math.round((zoom-.25)*100)/100);resizeView();};
  $('zoom-in').onclick=()=>{fit=false;zoom=Math.min(2,Math.round((zoom+.25)*100)/100);resizeView();};
  $('zoom-fit').onclick=fitRoom;
  $('expand').onclick=()=>parent.postMessage({type:'corp-office-expand'},location.origin);
  $('toggle-roster').onclick=()=>{const open=document.body.classList.toggle('show-roster');$('toggle-roster').setAttribute('aria-expanded',String(open));};
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
  function updateMotion(){document.body.dataset.reducedMotion=String(reduced); $('motion').setAttribute('aria-pressed',String(reduced));if(reduced)clearMovement();schedule(); }
  $('motion').onclick=()=>{reduced=!reduced;updateMotion();};
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{reduced=e.matches;updateMotion();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0;}else schedule();});
  Promise.all(assets.map(name=>new Promise(resolve=>{const im=new Image();images[name]=im;im.onload=resolve;im.onerror=resolve;im.src=`assets/${name}.png`;})))
    .then(()=>{lastRoster='';renderUI();draw();});
  updateMotion();draw();
})();
