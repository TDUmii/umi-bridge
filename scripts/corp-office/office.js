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
  let pending = [], delivery = null, lastRoster = '';
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
    if(boss)return {x:320,y:140};
    return {x:100+(index%3)*220,y:285+Math.floor(index/3)*140};
  }
  function layout(agents, reset) {
    if(reset)people.clear();
    const alive=new Set(agents.map(a=>a.id));
    for(const id of people.keys())if(!alive.has(id))people.delete(id);
    const slots=new Set([...people.values()].filter(p=>!p.boss).map(p=>p.slot));
    let hasBoss=[...people.values()].some(p=>p.boss);
    for(const a of agents) {
      const old=people.get(a.id);
      const boss=old?.boss||(!hasBoss&&a.roles.includes('CEO / Orchestrator'));
      let slot=old?.slot??0;
      if(!old&&!boss){while(slots.has(slot))slot++;slots.add(slot);}
      if(boss)hasBoss=true;
      const s=seat(slot,boss);
      people.set(a.id,{...old,...a,seat:s,boss,slot,palette:hash(a.id)%6,
        x:old?.x??s.x,y:old?.y??s.y,route:old?.route??[]});
    }
    const n=slots.size?Math.max(...slots)+1:0;
    sceneHeight=Math.max(420,Math.ceil(n/3)*140+235);
    canvas.width=1280;canvas.height=sceneHeight*2;ctx.setTransform(2,0,0,2,0,0);ctx.imageSmoothingEnabled=false;
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
      `${data.coordinator?'Điều phối đang bật':'Điều phối đang tắt'} · ${data.agents.length} nhân viên · Cập nhật từ sổ nhiệm vụ`;
    $('connection').classList.toggle('error',error);
    $('count').textContent=data.agents.length;
    $('empty').hidden=!!data.agents.length;
    const signature=JSON.stringify([data.agents,selected]);
    if(signature!==lastRoster) {
      const focused=document.activeElement?.dataset.agent;
      $('roster').replaceChildren();
      for(const a of data.agents) {
        const b=document.createElement('button');b.type='button';b.className='person';b.dataset.agent=a.id;
        b.setAttribute('aria-pressed',String(selected===a.id));b.append(avatar(a));
        const words=document.createElement('span'), title=document.createElement('strong'), state=document.createElement('small');
        title.textContent=a.role;state.textContent=labels[a.status]||labels.UNKNOWN;
        words.append(title,state);b.append(words);b.onclick=()=>select(a.id);$('roster').append(b);
        if(focused===a.id)b.focus({preventScroll:true});
      }
      lastRoster=signature;
    }
    const a=data.agents.find(a=>a.id===selected);
    $('detail').hidden=!a;
    if(a) {
      $('detail-status').textContent=(labels[a.status]||labels.UNKNOWN)+(a.provisional?' · Chưa gắn chat':'');
      $('detail-role').textContent=a.roles.join(' / ');
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
    // Corridors sit below each desk row; vertical travel uses the gap between columns.
    const rowY=y=>y<200?190:y+48;
    const lane=p.x<210?210:430;
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
    rect(0,0,640,sceneHeight,'#d9e3ce');
    // Timber planks belong to the office floor, and stay behind all task information.
    for(let y=70;y<sceneHeight-18;y+=18) {
      rect(18,y,604,17,y%36?'#e8d5b2':'#e3cfa9');
      for(let x=18+((y/18|0)%2)*45;x<622;x+=90)rect(x,y,1,17,'#d1bc95');
    }
    rect(10,14,620,54,'#a7c4ac');rect(10,61,620,7,'#6d967e');
    rect(10,68,8,sceneHeight-78,'#759981');rect(622,68,8,sceneHeight-78,'#759981');
    rect(10,sceneHeight-18,620,8,'#759981');
    for(const x of [62,452]){rect(x,25,100,30,'#6e9e98');rect(x+4,28,92,24,'#d4e9e3');rect(x+49,28,3,24,'#8bb4a1');}
    text('UMIBRIDGE / CORP',320,43,'#284638',13);
    rect(240,87,160,111,'#a6bdae');rect(247,94,146,97,'#b5cebd');
    sprite('BOOKSHELF',190,38,1.5);sprite('CLOCK',401,21,1);
    sprite('LARGE_PLANT',24,83,1.5);sprite('LARGE_PLANT',568,83,1.5);
    sprite('SOFA_FRONT',68,135,2);sprite('COFFEE',153,146,1.5);
    sprite('WHITEBOARD',482,97,1.5);text('KHU CHỜ',117,184,'#38574c',10);
    for(const p of people.values()) {
      const {x,y}=p.seat;
      if(!p.boss){rect(x-77,y-49,154,106,'#c2ccb0');rect(x-71,y-43,142,94,'#ced7be');}
      sprite('WOODEN_CHAIR_FRONT',x-12,y-45,1.5);
      sprite('DESK_FRONT',x-36,y-51,1.5);
      const active=!error&&p.pose==='type';
      sprite(active?`PC_FRONT_ON_${1+(Math.floor(now*3)%3)}`:'PC_FRONT_OFF',x-12,y-68,1.5);
      const name=p.boss?'CEO / Orchestrator':p.role.replace(' Engineer','').replace(' / Architect','');
      text(name,x,y+27,'#2d4640',11);
      text(labels[p.status]||labels.UNKNOWN,x,y+42,colors[p.status]||'#46665f',10);
      if(p.id===selected){ctx.strokeStyle='#24674d';ctx.lineWidth=2;ctx.strokeRect(x-76,y-51,152,108);}
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
      const reset=data.baseline||model.project!==data.project;
      const events=model.accept(data);error=false;
      layout(data.agents,reset);if(reset)clearMovement();
      if(!people.has(selected))selected=data.agents[0]?.id??null;
      // Bound visual backlog. The full history remains visible in the ledger.
      if(!reduced)pending.push(...events.slice(-12));
      pending=pending.slice(-12);
      renderUI();draw();schedule();
    },
    setVisible(value){visible=value;if(!value){cancelAnimationFrame(raf);raf=0;last=0;clearMovement();}else schedule();},
    setError(){error=true;clearMovement();renderUI();draw();},
    inspect(){return{agents:people.size,pending:pending.length,delivery:delivery?.event.id??null,visible,reduced,error,framesActive:!!raf,project:model.project,bridgeReady:!!bridge};}
  };
  canvas.addEventListener('click',event=>{
    const bounds=canvas.getBoundingClientRect(),x=(event.clientX-bounds.left)*640/bounds.width,y=(event.clientY-bounds.top)*sceneHeight/bounds.height;
    const p=[...people.values()].find(p=>Math.abs(p.x-x)<55&&Math.abs(p.y-y)<55);if(p)select(p.id);
  });
  $('open-chat').onclick=()=>{const a=model.current?.agents.find(a=>a.id===selected);if(a?.can_open&&!error&&bridge)bridge.openChat(a.id);};
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent)return;
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
