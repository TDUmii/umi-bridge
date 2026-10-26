/* Pixel Agents sprites: MIT, Pablo De Lucca. See assets/provenance.json.
   Animation is a projection of Corp's ledger; it never advances a task. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('room'), ctx = canvas.getContext('2d');
  const model = new OfficeModel(), images = {}, people = new Map(), life = new OfficeLife(people);
  let storage;try{storage=localStorage;}catch{}
  const furnitureHistory=new OfficeFurnitureHistory(storage);
  let ambient=true, floor=new OfficeFloor([]), roomPlan=false, hoveredZone=null, mapReady=false;
  let infoConfig={team:true,conversation:true,customers:false,handoffs:true};try{const saved=JSON.parse(localStorage.getItem('umibridge.office.info.v1')||'{}');for(const key of Object.keys(infoConfig))if(typeof saved[key]==='boolean')infoConfig[key]=saved[key];}catch{}
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
  life.configure(sceneWidth,sceneHeight,floor);
  const statusTone = status => ({DISPATCHED:'sending',WAITING:'waiting',COMPLETED:'review',REVIEW:'review',LIMIT:'limit',BLOCKED:'blocked',DONE:'sending'}[status] || 'idle');
  function geometry() {
    return {width:floor.width,height:floor.height,cols:Math.min(3,floor.rooms.length),rows:floor.rooms.length,count:people.size,first:214,gap:180};
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
    life.configure(sceneWidth,sceneHeight,floor);
    if (changed) {
      for (const p of people.values()) p.seat = floor.seats.get(p.id) || p.seat;
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
      label.style.top = `${(p.seat.y - 20) * zoom}px`;
      label.style.width = `${44 * zoom}px`;
      label.style.height = `${44 * zoom}px`;
    }

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
    $('tooltip-name').textContent = p.chatName || p.role.split('\n')[0];
    $('tooltip-status').textContent = labels[p.status] || labels.UNKNOWN;
    $('tooltip-department').textContent = [p.department,p.role].filter(Boolean).join(' · ');
    $('tooltip-task').textContent = p.taskDetail || p.task || 'Chưa có nhiệm vụ đang thực hiện.';
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
    'KENNEY_BOOKCASE','KENNEY_BOOKCASE_ALT','KENNEY_MAP','KENNEY_ART','KENNEY_PLANT','KENNEY_CABINET','KENNEY_PIANO',
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
  function layout(agents, reset) {
    const install=furnitureHistory.claim(model.project,agents,reset);
    if(reset)people.clear();
    const alive=new Set(agents.map(a=>a.id));for(const id of people.keys())if(!alive.has(id))people.delete(id);
    floor=new OfficeFloor(agents);
    for(const [slot,a] of agents.entries()){
      const old=people.get(a.id),seat=floor.seats.get(a.id),moved=old&&(old.seat.x!==seat.x||old.seat.y!==seat.y);
      people.set(a.id,{...old,...a,seat,slot,boss:a.roleId==='ceo',palette:hash(a.id)%6,furniture:old?.furniture??3,
        x:old&&!moved?old.x:seat.x,y:old&&!moved?old.y:seat.y,route:old&&!moved?old.route:[]});
    }
    life.configure(floor.width,floor.height,floor);for(const p of people.values())life.init(p);resizeView();
    if(!reduced)for(const p of people.values())if(install.has(p.id))life.install(p);
  }
  function select(id) {selected=id;lastRoster='';renderUI();draw();}
  function applyInfoConfig(){for(const [key,value] of Object.entries(infoConfig)){document.querySelectorAll(`[data-info="${key}"]`).forEach(input=>input.checked=value);}const panel={team:'panel-team',customers:'panel-customers',handoffs:'panel-handoffs'};for(const [key,id] of Object.entries(panel)){const enabled=infoConfig[key];document.querySelector(`[data-office-tab="${key}"]`)?.toggleAttribute('hidden',!enabled);const node=$(id);if(node&&!enabled)node.hidden=true;}document.querySelector('.conversation-section').hidden=!infoConfig.conversation;}
  function avatar(a) {
    const c=document.createElement('canvas');c.width=24;c.height=40;c.className='avatar';c.setAttribute('aria-hidden','true');
    const g=c.getContext('2d'), im=images[`char_${hash(a.id)%6}`];g.imageSmoothingEnabled=false;
    if(im?.naturalWidth)g.drawImage(im,16,0,16,32,2,0,20,40);
    return c;
  }
  function renderUI() {
    const data=model.current;if(!data)return;
    document.querySelector('.conversation-section h2').textContent=data.meeting?'Cuộc họp sửa dự án':'Trao đổi công việc';
    $('health').textContent=error?'Mất cập nhật. Trạng thái hiển thị đã cũ; đang thử lại.':
      `${data.coordinator?'Điều phối: Bật':'Điều phối: Tắt'} · ${data.agents.length} nhân viên`;
    $('connection').classList.toggle('error',error);
    $('connection').hidden=!error;
    const active=data.agents.some(agent=>['DISPATCHED','WAITING','LIMIT','REVIEW','BLOCKED','QUEUED','PAUSED'].includes(agent.status));
    $('connection').dataset.state=error?'error':active?'active':'idle';
    $('count').textContent=data.agents.length;
    const customers=data.customers||[];$('customer-count').textContent=customers.length;$('customers').replaceChildren();
    for(const customer of customers.slice(0,12)){const li=document.createElement('li'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=customer.name||'Chưa đặt tên';small.textContent=customer.title||'';li.append(strong,small);$('customers').append(li);}
    if(!customers.length){const li=document.createElement('li');li.textContent='Chưa có khách chờ.';$('customers').append(li);}
    $('customer-line').hidden=!customers.length;$('customer-line').replaceChildren();
    for(const [index,customer] of customers.slice(0,3).entries()){const name=document.createElement('span');name.textContent=`${index+1} · ${customer.name||'Chưa đặt tên'}`;name.title=customer.name||'Chưa đặt tên';name.setAttribute('role','listitem');$('customer-line').append(name);}
    if(customers.length>3){const count=document.createElement('span');count.textContent=`+${customers.length-3} khách`;$('customer-line').append(count);}
    $('empty').hidden=mapReady;$('stage').hidden=!mapReady;
    $('empty-message').textContent=data.staffing?.message||'Thêm chat trong Projects & chats để tạo đội ngũ. Văn phòng mở khi danh sách nhân sự đã đầy đủ.';
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
        title.textContent=a.chatName||a.role.split('\n')[0];b.title=a.role;state.textContent=labels[a.status]||labels.UNKNOWN;
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
      $('detail-task').textContent=a.taskDetail||a.task||'Chưa có nhiệm vụ. Chat đã sẵn sàng trong Project này.';
      $('detail-count').textContent=`${a.count} nhiệm vụ chưa kết thúc${a.task_id?' · '+a.task_id:''}`;
      $('open-chat').disabled=!a.can_open||error;
    }
    renderConversations(data);
    $('handoffs').replaceChildren();
    $('handoff-empty').hidden=!!data.handoffs.length;
    for(const h of data.handoffs.slice(-4).reverse()) {
      const li=document.createElement('li'), b=document.createElement('b'), t=document.createElement('time');
      b.textContent=`${people.get(h.from)?.role||'Nhân viên'} giao cho ${people.get(h.to)?.role||'nhân viên'}`;
      const stamp=new Date(h.at);t.textContent=Number.isNaN(stamp.valueOf())?'':stamp.toLocaleString('vi-VN');
      li.append(b,t);li.title=h.task;$('handoffs').append(li);
    }
  }
  function renderConversations(data) {
    const entries=data.conversations||data.handoffs.filter(h=>h.text);
    $('office-roster').classList.toggle('conversation-is-empty',!entries.length);
    const signature=JSON.stringify(entries);if($('conversation').dataset.signature===signature)return;
    const root=$('conversation'),nearBottom=root.scrollHeight-root.scrollTop-root.clientHeight<48;root.dataset.signature=signature;root.replaceChildren();
    if(!entries.length){const p=document.createElement('p');p.className='conversation-empty';p.textContent='Chưa có nội dung bàn giao được ghi nhận. Kết quả thực từ các lượt chạy sẽ xuất hiện tại đây.';root.append(p);return;}
    for(const entry of entries){const article=document.createElement('article'),header=document.createElement('div'),name=document.createElement('strong'),stamp=document.createElement('time'),task=document.createElement('p'),body=document.createElement('p');
      article.className='conversation-entry';name.textContent=[people.get(entry.from)?.chatName||people.get(entry.from)?.role||entry.fromName||'Kết quả đã ghi nhận',entry.to?(people.get(entry.to)?.chatName||people.get(entry.to)?.role||entry.toName||'Nhân viên nhận'):''].filter(Boolean).join(' bàn giao cho ');
      const date=entry.at?new Date(entry.at):null;stamp.textContent=!date||Number.isNaN(date.valueOf())?'':date.toLocaleString('vi-VN');header.append(name,stamp);task.className='conversation-task';task.textContent=entry.task||'';body.className='conversation-text';const marker=(entry.text||'').lastIndexOf('UMI_CORP_RESULT:'),content=marker>=0?entry.text.slice(0,marker).trim():entry.text;body.textContent=content||entry.summary||'Nội dung kết quả chưa được ghi nhận.';article.append(header,task,body);if(marker>=0){const details=document.createElement('details'),summary=document.createElement('summary'),raw=document.createElement('pre');summary.textContent='Báo cáo gốc';raw.textContent=entry.text;details.append(summary,raw);article.append(details);}root.append(article);}
    if(nearBottom)root.scrollTop=root.scrollHeight;
  }
  function walkTo(p,target) {life.routeTo(p,target);}
  function startDelivery() {
    if(delivery||!pending.length||reduced)return;
    const event=pending.shift(),p=people.get(event.from),target=people.get(event.to);
    if(!p||!target)return;
    // Finish an existing rest trip before a real handoff; avoid teleporting a sleeper.
    if(p.activity!=='desk'){pending.unshift(event);life.interrupt(p);return;}
    delivery={event,actor:p.id,phase:'out',hold:0};
    if(!life.routeTo(p,target.seat)){delivery=null;return;}life.begin(p,'handoff');
  }
  function advance(dt) {
    startDelivery();life.step(dt,{ambient});now=life.time;
    if(delivery){const p=people.get(delivery.actor);if(!p)delivery=null;
      else if(!p.route.length){if(delivery.phase==='out'){delivery.phase='hold';delivery.hold=now+1.3;}
        else if(delivery.phase==='hold'&&now>delivery.hold){delivery.phase='back';walkTo(p,p.seat);}
        else if(delivery.phase==='back'){life.begin(p,'desk');delivery=null;}}
    }
    life.takeEvents();
  }
  function drawRoom() {
    rect(0,0,sceneWidth,sceneHeight,'#263c37');rect(14,16,sceneWidth-28,sceneHeight-30,'#e7d5b4');
    for(let y=64;y<sceneHeight-18;y+=16){rect(18,y,sceneWidth-36,15,(y/16)%2?'#e5cfa9':'#eddcbb');for(let x=18+((y/16|0)%2)*40;x<sceneWidth-18;x+=80)rect(x,y,1,15,'#d5bb90');}
    rect(16,18,sceneWidth-32,48,'#a5c3b3');rect(16,61,sceneWidth-32,7,'#54796a');
    for(const x of [64,410,820]){rect(x,28,130,28,'#527b79');rect(x+4,31,122,21,'#c4ded5');rect(x+63,31,3,21,'#8eb6a7');}
    sprite('HANGING_PLANT',234,22,1.5);sprite('SMALL_PAINTING_2',650,18,1.5);sprite('CLOCK',580,28,1);
    const themes={ceo:['#decba7','#926d43','#d9b866','KENNEY_MAP'],product:['#e3d3b6','#a67a54','#cc996d','WHITEBOARD'],design:['#d9cfe0','#7a648c','#b394bf','KENNEY_ART'],engineering:['#c5d2db','#526b7d','#81a7ba','WHITEBOARD'],qa:['#c8d8ca','#557966','#8cae84','KENNEY_MAP'],security:['#c6cece','#526767','#80a59e','KENNEY_MAP'],devops:['#c5d3d8','#506e77','#87adb5','CLOCK'],docs:['#e1d4bb','#8d7755','#bfab7c','KENNEY_BOOKCASE']};
    for(const room of floor.rooms){
      const [surface,trim,accent,art]=themes[room.roleId]||themes.qa;
      rect(room.x,room.y,room.w,room.h,surface);
      if(['engineering','devops','security'].includes(room.roleId)){for(let y=room.y+10;y<room.y+room.h-7;y+=20)for(let x=room.x+10;x<room.x+room.w-7;x+=20){rect(x,y,18,18,'#ffffff18');rect(x,y,18,1,'#314b5c15');}}
      else{for(let y=room.y+8;y<room.y+room.h-6;y+=12){rect(room.x+8,y,room.w-16,1,'#5c503b1c');for(let x=room.x+18+(y%24?28:0);x<room.x+room.w-8;x+=56)rect(x,y,1,12,'#5c503b15');}}
      rect(room.x+28,room.y+64,room.w-56,84,accent);rect(room.x+32,room.y+68,room.w-64,76,surface);rect(room.x+36,room.y+72,room.w-72,68,accent+'65');
      if(room.glass){
        const edges=[{x:room.x,y:room.y,w:room.w,h:7},{x:room.x,y:room.y,w:7,h:room.h},{x:room.x+room.w-7,y:room.y,w:7,h:room.h},{x:room.x,y:room.y+room.h-7,w:room.w/2-30,h:7},{x:room.x+room.w/2+30,y:room.y+room.h-7,w:room.w/2-30,h:7}];
        for(const edge of edges){rect(edge.x+2,edge.y+5,edge.w,edge.h,'#4b6a5c22');rect(edge.x,edge.y-10,edge.w,edge.h+10,'#a0c8c55c');if(edge.w>edge.h){rect(edge.x,edge.y-12,edge.w,3,'#608982');rect(edge.x,edge.y+4,edge.w,3,'#608982');for(let x=edge.x+4;x<edge.x+edge.w-4;x+=52){rect(x,edge.y-12,3,19,'#608982');rect(x+8,edge.y-7,23,2,'#e1f5e47a');}}else{rect(edge.x,edge.y-10,3,edge.h+10,'#608982');rect(edge.x+5,edge.y-10,2,edge.h+10,'#abcfc6');for(let y=edge.y+9;y<edge.y+edge.h-5;y+=52)rect(edge.x,y,7,3,'#608982');}}
        rect(room.x+room.w/2-24,room.y+room.h-8,48,3,'#91b7a6');
      }
      sprite(room.index%3===1?'KENNEY_PLANT':room.index%2?'PLANT_2':'LARGE_PLANT',room.plant.x,room.plant.y-10,room.index%3===1?2:1);
      sprite(art,room.x+room.w/2-16,room.y+12,art.startsWith('KENNEY')?2:1);
      sprite(room.roleId==='docs'?'KENNEY_BOOKCASE_ALT':room.roleId==='ceo'?'KENNEY_BOOKCASE':'KENNEY_CABINET',room.cabinet.x-2,room.cabinet.y-5,2);
      if(room.roleId==='design'){for(let i=0;i<4;i++)rect(room.x+65+i*13,room.y+48,10,12,['#e5a58e','#e8ce85','#9db8bc','#b49fc2'][i]);}
      if(['engineering','devops','security'].includes(room.roleId)){rect(room.cabinet.x,room.cabinet.y+2,26,25,'#344d56');for(let i=0;i<3;i++){rect(room.cabinet.x+3,room.cabinet.y+5+i*7,20,4,'#67828a');rect(room.cabinet.x+19,room.cabinet.y+6+i*7,2,2,'#b6d6a0');}}
      if(room.roleId==='qa'){for(let i=0;i<3;i++){rect(room.x+70+i*18,room.y+17,14,19,'#f5edcf');rect(room.x+73+i*18,room.y+21,8,3,accent);rect(room.x+73+i*18,room.y+27,8,2,'#87a18d');}}
      for(const [index,island]of room.islands.entries()){
        const members=[...people.values()].filter(p=>p.seat.room===room.name&&p.seat.island===index);
        if(members.some(p=>p.furniture>0)){
          const wood={single:'#b69b71',executive:'#ac8054',collaboration:'#c9aa74',benches:'#b4a18b',corner:'#a9b3a4',paired:'#c49a66'}[island.kind];
          for(const part of island.parts){rect(part.x+3,part.y+5,part.w,part.h,'#48624b30');rect(part.x,part.y,part.w,part.h,'#855e3c');rect(part.x+3,part.y+2,part.w-6,part.h-6,wood);}
          if(island.kind==='collaboration'){rect(island.x+68,island.y+8,28,18,'#f1e8ca');rect(island.x+72,island.y+12,9,5,'#9cb7a2');rect(island.x+84,island.y+12,8,9,'#b49582');}
          else if(island.kind==='benches'){rect(island.x+40,island.y+10,20,16,'#5a6a65');rect(island.x+44,island.y+13,12,7,'#a6b7a5');}
          else if(island.kind==='corner'){rect(island.x+5,island.y+38,16,6,'#64817c');rect(island.x+5,island.y+45,16,5,'#d3c5a0');}
          else if(island.kind==='executive'){rect(island.x+79,island.y-26,16,10,'#ece2bd');rect(island.x+82,island.y-24,10,2,'#749080');}
        }

        for(const p of members){const {x,y,facing}=p.seat;if(p.furniture>=2)drawChair(p.seat);
          if(p.furniture>=3){
            if(facing==='left'||facing==='right'){const mx=x+(facing==='right'?32:-42);rect(mx,y-33,10,25,'#3c5053');rect(mx+2,y-31,6,19,life.working(p)?'#a1c8ba':'#547378');rect(mx-2,y-7,14,3,'#52605a');}
            else{const monitorY=facing==='down'?island.y-6:island.y+12;if(facing==='down'){rect(x-13,monitorY,26,17,'#3c5053');rect(x-11,monitorY+2,22,11,'#547378');rect(x-2,monitorY+17,4,5,'#52605a');}else sprite(life.working(p)?`PC_FRONT_ON_${1+Math.floor(now*3)%3}`:'PC_FRONT_OFF',x-12,monitorY-10,1.5);}
          }
          if(p.id===selected){ctx.strokeStyle='#24674d';ctx.lineWidth=2;ctx.strokeRect(x-26,y-34,52,48);}
        }
      }
    }
    if(floor.courtyard){const c=floor.courtyard;
      rect(c.x-70,c.y-14,c.w+140,c.h+28,'#c9c6b0');
      for(let y=c.y-10;y<c.y+c.h+14;y+=20)for(let x=c.x-66;x<c.x+c.w+70;x+=30){rect(x,y,28,18,'#dcd8bf');rect(x,y+17,28,1,'#adb6a16b');}
      rect(c.x,c.y,c.w,c.h,'#a8ba97');rect(c.x+7,c.y+7,c.w-14,c.h-14,'#c7d1ad');
      rect(c.x+90,c.y+4,c.w-180,c.h-8,'#d8d2b5');
      for(const prop of floor.gardenProps){if(prop.kind==='planter'){rect(prop.x+3,prop.y+5,prop.w,prop.h,'#60745b30');rect(prop.x,prop.y,prop.w,prop.h,'#728c6b');rect(prop.x+4,prop.y+3,prop.w-8,prop.h-6,'#8fa67b');sprite('LARGE_PLANT',prop.x+8,prop.y-13,1);sprite('KENNEY_PLANT',prop.x+14,prop.y+35,1.5);}else if(prop.kind==='bench'){rect(prop.x,prop.y,prop.w,prop.h,'#6e8066');rect(prop.x+4,prop.y+4,prop.w-8,prop.h-10,'#ac996c');for(let y=prop.y+9;y<prop.y+prop.h-5;y+=8)rect(prop.x+4,y,prop.w-8,2,'#847b56');rect(prop.x+5,prop.y+prop.h-3,6,6,'#5a705e');rect(prop.x+prop.w-11,prop.y+prop.h-3,6,6,'#5a705e');}else{sprite('COFFEE_TABLE',prop.x,prop.y,1.2);sprite('COFFEE',prop.x+19,prop.y-7,1);}}
    }
    const reception=floor.reception,pantry=floor.pantry,lounge=floor.lounge,rest=floor.rest;
    rect(reception.x,reception.y,reception.w,reception.h,'#b9cbb8');for(const x of [76,168,260])sprite('CUSHIONED_CHAIR_BACK',x,98,1.5);
    (model.current?.customers||[]).slice(0,3).forEach((customer,index)=>drawCharacter(hash(customer.id)%6,1,'down',88+index*92,157));
    rect(pantry.x,pantry.y,pantry.w,pantry.h,'#c6d5c2');sprite('DOUBLE_BOOKSHELF',756,82,1.5);sprite('COFFEE',854,94,1.5);sprite('PLANT_2',980,83,1.5);rect(912,108,60,18,'#caa16e');rect(912,105,60,4,'#725940');
    rect(sceneWidth-19,172,5,40,'#3f6359');rect(sceneWidth-16,177,3,30,'#c6d9bf');
    rect(lounge.x,lounge.y,lounge.w,lounge.h,'#b8c9b8');sprite('SOFA_FRONT',58,sceneHeight-118,2);sprite('COFFEE_TABLE',238,sceneHeight-104,1.5);sprite('SOFA_SIDE',360,sceneHeight-118,1.5);sprite('KENNEY_PIANO',505,sceneHeight-122,2);
    rect(rest.x,rest.y,rest.w,rest.h,'#c9cfba');
    for(let index=0;index<2;index++){const bed=life.bedPoints[index];rect(bed.x-35,bed.y-25,70,38,'#a5997d');rect(bed.x-32,bed.y-23,64,34,'#c5d4bd');rect(bed.x-30,bed.y-21,14,30,'#e6ead8');if(!life.beds[index]){rect(bed.x+8,bed.y-20,23,28,'#78978b');rect(bed.x+8,bed.y-20,23,5,'#abc5b0');}}
    if(life.parcel){rect(life.parcel.x,life.parcel.y,23,15,'#b8814f');rect(life.parcel.x+9,life.parcel.y,3,15,'#e4c99a');}
    if(roomPlan&&hoveredZone){const r=hoveredZone;rect(r.x,r.y,r.w,r.h,'#287b7838');ctx.strokeStyle='#226756';ctx.lineWidth=3;ctx.strokeRect(r.x,r.y,r.w,r.h);}
  }
  function drawChair(seat,guest=false) {
    if(seat.facing==='left'||seat.facing==='right'){const back=seat.facing==='right'?seat.x-12:seat.x+8;rect(seat.x-12,seat.y-8,24,9,guest?'#84988c':'#967854');rect(back,seat.y-23,4,23,'#5b705f');rect(seat.x-9,seat.y+1,3,8,'#5b705f');rect(seat.x+6,seat.y+1,3,8,'#5b705f');}
    else sprite(seat.facing==='down'?'CUSHIONED_CHAIR_BACK':'WOODEN_CHAIR_FRONT',seat.x-12,seat.y-(seat.facing==='down'?17:35),1.5);
  }
  function drawCharacter(palette,frame,dir,x,y,{angle=0}={}) {
    const image=images[`char_${palette}`];if(!image?.naturalWidth)return;
    const row=dir==='up'?1:dir==='left'||dir==='right'?2:0;
    if(qaMode)frameDraws.push({palette,frame,row,dir,x,y,angle,valid:frame>=0&&(frame+1)*16<=image.width&&(row+1)*32<=image.height});
    ctx.save();ctx.translate(Math.round(x),Math.round(y));if(angle)ctx.rotate(angle);if(dir==='left')ctx.scale(-1,1);
    ctx.drawImage(image,frame*16,row*32,16,32,-12,-43,24,48);ctx.restore();
  }
  function drawPerson(p) {
    if(p.activity==='install_wait')return;
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
    const dir=moving?p.dir:p.activity==='desk'?p.seat.facing:'down';
    const typing=!error&&!reduced&&!moving&&working&&p.pose==='type';
    const reading=!error&&!reduced&&!moving&&!working&&p.pose==='read';
    const frame=moving?[0,1,2,1][Math.floor(now*8)%4]:typing?3+Math.floor(now*3)%2:p.activity==='snack'?5+Math.floor(now*3)%2:reading?5+Math.floor(now*2)%2:p.activity==='desk'?3:1;
    ctx.fillStyle='#304d4329';ctx.beginPath();ctx.ellipse(p.x,p.y,12,4,0,0,Math.PI*2);ctx.fill();
    drawCharacter(p.palette,frame,dir,p.x,p.y);
    if(p.carry){const item=p.carry;if(item==='desk'){rect(p.x-14,p.y-26,28,10,'#b5824f');rect(p.x-12,p.y-16,4,10,'#694b34');rect(p.x+8,p.y-16,4,10,'#694b34');}else if(item==='chair')sprite('WOODEN_CHAIR_FRONT',p.x-12,p.y-35,1);else sprite('PC_FRONT_OFF',p.x-12,p.y-38,1.5);}
    if(p.activity==='ambient_pause'){if(p.ambientKind==='read'){rect(p.x-12,p.y-23,24,15,'#efe2ba');rect(p.x,p.y-23,1,15,'#9b886b');}else if(p.ambientKind==='plant'){rect(p.x+8,p.y-21,13,10,'#749eab');rect(p.x+19,p.y-22,7,3,'#749eab');}else{rect(p.x-22,p.y-28,12,5,'#e0b995');rect(p.x+10,p.y-28,12,5,'#e0b995');}}
    if(p.activity==='snack'){const bite=Math.floor(now*3)%2;rect(p.x-9,p.y-13,17,10,'#d8b77b');rect(p.x-6,p.y-11,11,2,'#a87b45');rect(p.x+8,p.y-17-bite*5,6,5,'#c48742');rect(p.x+10,p.y-16-bite*5,1,1,'#5a3d28');}
    if(delivery?.actor===p.id&&delivery.phase!=='back'){rect(p.x+8,p.y-24,12,15,'#fff8df');rect(p.x+10,p.y-20,8,1,'#789b81');}
    if(['WAITING','BLOCKED','REVIEW','LIMIT','PAUSED'].includes(p.status)&&!moving&&p.activity==='desk'){
      rect(p.x+11,p.y-56,22,14,'#fffbed');rect(p.x+13,p.y-42,4,4,'#fffbed');text(p.status==='BLOCKED'?'!':p.status==='REVIEW'?'?':'...',p.x+22,p.y-45,colors[p.status],11);
    }
  }
  function draw() {
    if(qaMode)frameDraws=[];
    ctx.imageSmoothingEnabled=false;if(!mapReady){ctx.clearRect(0,0,sceneWidth,sceneHeight);return;}drawRoom();
    [...people.values()].sort((a,b)=>a.y-b.y).forEach(drawPerson);
    if(life.courier){const p=life.courier,moving=p.route.length&&!p.motionBlocked,dir=moving?p.dir:'up';drawCharacter(p.palette,moving?[0,1,2,1][Math.floor(now*8)%4]:1,dir,p.x,p.y);rect(p.x-9,p.y-43,18,5,'#447594');rect(p.x-12,p.y-39,24,3,'#315d77');if(p.phase!=='out'){const bx=p.x+(dir==='left'?-18:5);rect(bx,p.y-23,15,15,'#bf8d56');rect(bx+6,p.y-23,3,15,'#e7cda0');}}
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
      mapReady=data.staffing?.ready!==false&&data.agents.length>0&&!data.agents.some(a=>a.provisional);
      const roles=JSON.stringify(data.agents.map(agent=>[agent.id,agent.roleId||'']).sort());
      const reset=model.project!==data.project;lastRoles=roles;
      const events=model.accept(data);error=false;
      if(reset){clearMovement();life.log=[];}layout(mapReady?data.agents:[],reset);
      if(!people.has(selected))selected=null;
      // Bound visual backlog. The full history remains visible in the ledger.
      if(!reduced)pending.push(...events.slice(-12));
      pending=pending.slice(-12);
      renderUI();draw();schedule();
      if(compact&&visible&&people.size&&!compactFitted){compactFitted=true;fitRoom();}
    },
    setVisible(value){if(!value)compactFitted=false;visible=value;document.body.dataset.visible=String(value);if(!value){cancelAnimationFrame(raf);raf=0;last=0;}else{resizeView();if(compact&&people.size&&!compactFitted){compactFitted=true;fitRoom();}schedule();}},
    setError(){error=true;cancelAnimationFrame(raf);raf=0;last=0;renderUI();draw();},
    inspect(){return{life:life.inspect(),frameDraws:qaMode?frameDraws:undefined,mapReady,rooms:floor.rooms,courtyard:floor.courtyard,gardenProps:floor.gardenProps,seats:[...floor.seats],obstacles:floor.obstacles,roomPlan,assetsReady:assets.every(name=>images[name]?.naturalWidth),ambient,agents:people.size,pending:pending.length,delivery:delivery?.event.id??null,visible,reduced,error,framesActive:!!raf,project:model.project,bridgeReady:!!bridge,zoom,fit,sceneWidth,columns,sceneHeight,deskRows,firstRow,rowGap,tooltipAgent};}
  };
  $('ambient').onclick=()=>{ambient=!ambient;$('ambient').textContent='Sinh hoạt: '+(ambient?'Bật':'Tắt');$('ambient').setAttribute('aria-pressed',String(ambient));if(!ambient)for(const p of people.values())life.interrupt(p);};
  $('room-plan').onclick=()=>{roomPlan=!roomPlan;$('room-plan').setAttribute('aria-pressed',String(roomPlan));if(!roomPlan){hoveredZone=null;$('zone-tooltip').hidden=true;}draw();};
  for(const button of document.querySelectorAll('[data-office-tab]'))button.onclick=()=>{
    for(const tab of document.querySelectorAll('[data-office-tab]'))tab.setAttribute('aria-selected',String(tab===button));
    for(const pane of document.querySelectorAll('[data-office-panel]'))pane.hidden=pane.dataset.officePanel!==button.dataset.officeTab;
  };
  $('office-tabs').onkeydown=event=>{const tabs=[...document.querySelectorAll('[data-office-tab]')],index=tabs.indexOf(document.activeElement);if(index<0)return;let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].focus();tabs[next].click();};
  $('stage').addEventListener('pointermove',event=>{if(!roomPlan)return;const bounds=canvas.getBoundingClientRect(),x=(event.clientX-bounds.left)/zoom,y=(event.clientY-bounds.top)/zoom;hoveredZone=floor.zones.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)||null;const tip=$('zone-tooltip');tip.hidden=!hoveredZone;if(hoveredZone){tip.textContent=hoveredZone.name;tip.style.left=`${Math.min(innerWidth-220,event.clientX+14)}px`;tip.style.top=`${Math.max(8,event.clientY-36)}px`;}draw();});
  $('stage').addEventListener('pointerleave',()=>{hoveredZone=null;$('zone-tooltip').hidden=true;draw();});
  if(qaMode)window.office.advanceForTest=seconds=>{for(let elapsed=0;elapsed<seconds;elapsed+=1/30)advance(Math.min(1/30,seconds-elapsed));draw();return life.inspect();};
  $('zoom-out').onclick=()=>{fit=false;zoom=Math.max(.25,Math.round((zoom-.25)*100)/100);resizeView();};
  $('zoom-in').onclick=()=>{fit=false;zoom=Math.min(2,Math.round((zoom+.25)*100)/100);resizeView();};
  $('zoom-fit').onclick=fitRoom;
  $('expand').onclick=()=>parent.postMessage({type:'corp-office-expand'},location.origin);
  $('toggle-roster').onclick=()=>{const open=document.body.classList.toggle('show-roster');$('toggle-roster').setAttribute('aria-expanded',String(open));};
  $('info-settings-toggle').onclick=()=>{const open=$('info-settings').hidden;$('info-settings').hidden=!open;$('info-settings-toggle').setAttribute('aria-expanded',String(open));};
  for(const input of document.querySelectorAll('[data-info]'))input.onchange=()=>{infoConfig[input.dataset.info]=input.checked;try{localStorage.setItem('umibridge.office.info.v1',JSON.stringify(infoConfig));}catch{}applyInfoConfig();};
  applyInfoConfig();
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
