/* State-only helper shared by the renderer and its regression check. */
class OfficeModel {
  constructor() { this.project = null; this.seen = new Set(); this.current = null; }
  accept(snapshot) {
    const reset = snapshot.baseline || this.project !== snapshot.project;
    const events = reset ? [] : snapshot.handoffs.filter(e => !this.seen.has(e.id));
    this.project = snapshot.project;
    this.current = snapshot;
    this.seen = new Set(snapshot.handoffs.map(e => e.id));
    return events;
  }
}
globalThis.OfficeModel = OfficeModel;
if (typeof module !== 'undefined') module.exports = OfficeModel;

// Visual installation history only. First arrival is an existing office;
// only new staff observed afterward carry furniture. Reloads never replay it.
class OfficeFurnitureHistory {
  constructor(storage) {this.storage=storage;this.projects=Object.create(null);try{const saved=JSON.parse(storage?.getItem('umibridge.office.furniture.v1')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))this.projects=Object.fromEntries(Object.entries(saved).filter(([id,staff])=>id.length<=200&&Array.isArray(staff)).slice(-64).map(([id,staff])=>[id,staff.filter(value=>typeof value==='string'&&value.length<=200).slice(-1000)]));}catch{}}
  claim(project,agents,baseline=false) {
    const known=new Set(Object.hasOwn(this.projects,project)?this.projects[project]:[]),install=new Set();
    let changed=!Object.hasOwn(this.projects,project);
    for(const agent of agents){if(!known.has(agent.id))changed=true;if(!baseline&&!known.has(agent.id))install.add(agent.id);known.add(agent.id);}
    this.projects[project]=[...known].slice(-1000);
    this.projects=Object.fromEntries(Object.entries(this.projects).slice(-64));
    try{if(changed)this.storage?.setItem('umibridge.office.furniture.v1',JSON.stringify(this.projects));}catch{}
    return install;
  }
}
globalThis.OfficeFurnitureHistory=OfficeFurnitureHistory;
if(typeof module!=='undefined')module.exports.OfficeFurnitureHistory=OfficeFurnitureHistory;

/* Room bounds own both furniture placement and walkable geometry. */
class OfficeFloor {
  constructor(agents) {
    this.width=1080;this.rooms=[];this.seats=new Map();this.obstacles=[];
    const groups=new Map();
    for(const agent of agents){const key=agent.department||'Chưa phân công';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(agent);}
    const entries=[...groups],cols=Math.min(4,Math.max(1,entries.length)),roomWidth=(this.width-80-(cols-1)*40)/cols;
    let y=214;
    for(let row=0;row<Math.ceil(entries.length/cols);row++){
      const batch=entries.slice(row*cols,(row+1)*cols),height=Math.max(194,...batch.map(([,members])=>Math.ceil(members.length/4)*180+24));
      batch.forEach(([name,members],column)=>{
        const x=40+column*(roomWidth+40),role=members[0].roleId||'',index=this.rooms.length;
        const style=role==='ceo'?'executive':/design|product/.test(role)?'collaboration':/engineer|devops|developer/.test(role)?'benches':/qa|security|test/.test(role)?'corner':['executive','collaboration','benches','corner'][index%4];
        const room={id:name,name,roleId:role,x,y,w:roomWidth,h:height,index,style,islands:[]};
        this.rooms.push(room);
        // Each room has a south doorway into a continuous cross-corridor.
        this.obstacles.push({x,y,w:roomWidth,h:7},{x,y,w:7,h:height},{x:x+roomWidth-7,y,w:7,h:height},
          {x,y:y+height-7,w:roomWidth/2-30,h:7},{x:x+roomWidth/2+30,y:y+height-7,w:roomWidth/2-30,h:7});
        for(let i=0;i<Math.ceil(members.length/4);i++){
          const cx=x+roomWidth/2,cy=y+100+i*180,occupants=members.slice(i*4,i*4+4),kind=occupants.length>2?'paired':style;
          let parts,positions;
          if(kind==='executive'){
            parts=[{x:cx-50,y:cy-18,w:100,h:36},{x:cx+26,y:cy-50,w:24,h:32}];
            positions=[{x:cx-12,y:cy-44,facing:'down'},{x:cx-12,y:cy+48,facing:'up'}];
          }else if(kind==='collaboration'){
            parts=[{x:cx-56,y:cy-22,w:112,h:44}];
            positions=[{x:cx-23,y:cy-48,facing:'down'},{x:cx+23,y:cy+52,facing:'up'}];
          }else if(kind==='benches'){
            parts=[{x:cx-32,y:cy-48,w:28,h:96},{x:cx+4,y:cy-48,w:28,h:96}];
            positions=[{x:cx-60,y:cy+14,facing:'right'},{x:cx+62,y:cy-6,facing:'left'}];
          }else if(kind==='corner'){
            parts=[{x:cx-48,y:cy-22,w:96,h:36},{x:cx-48,y:cy+14,w:26,h:34}];
            positions=[{x:cx+14,y:cy+46,facing:'up'},{x:cx+14,y:cy-50,facing:'down'}];
          }else{
            parts=[{x:cx-70,y:cy-22,w:140,h:44}];
            positions=[{x:cx-36,y:cy-48,facing:'down'},{x:cx+36,y:cy-48,facing:'down'},{x:cx-36,y:cy+52,facing:'up'},{x:cx+36,y:cy+52,facing:'up'}];
          }
          const island={...parts[0],kind,parts,guest:occupants.length===1?positions[1]:null};room.islands.push(island);this.obstacles.push(...parts);
          if(island.guest){const guest=island.guest;this.obstacles.push({x:guest.x-12,y:guest.y-12,w:24,h:24});}
          occupants.forEach((member,j)=>this.seats.set(member.id,{...positions[j],room:name,island:i}));
        }
        const plant={x:x+18,y:y+20,w:22,h:25};room.plant=plant;this.obstacles.push(plant);
        room.cabinet={x:x+roomWidth-47,y:y+14,w:28,h:24};this.obstacles.push(room.cabinet);
      });
      y+=height+42;
    }
    this.height=Math.max(570,y+142);this.reception={name:'Tiếp khách',x:40,y:76,w:300,h:96};
    this.pantry={name:'Pantry',x:740,y:76,w:300,h:96};this.lounge={name:'Thư giãn',x:40,y:this.height-134,w:570,h:106};
    this.rest={name:'Góc nghỉ',x:660,y:this.height-134,w:380,h:106};
    this.obstacles.push({x:756,y:86,w:252,h:40},{x:56,y:98,w:260,h:34},{x:58,y:this.height-118,w:144,h:52},
      {x:238,y:this.height-104,w:80,h:36},{x:360,y:this.height-118,w:62,h:54},{x:505,y:this.height-122,w:66,h:66});
    this.zones=[...this.rooms,this.reception,this.pantry,this.lounge,this.rest];
  }
  blocked(x,y,padding=14) {return x<20||y<70||x>this.width-20||y>this.height-18||this.obstacles.some(r=>x>r.x-padding&&x<r.x+r.w+padding&&y>r.y-padding&&y<r.y+r.h+padding);}
  segment(a,b) {
    if(a.x!==b.x&&a.y!==b.y)return false;
    if(this.blocked(a.x,a.y)||this.blocked(b.x,b.y))return false;
    return !this.obstacles.some(r=>a.x===b.x?a.x>r.x-14&&a.x<r.x+r.w+14&&Math.max(a.y,b.y)>r.y-14&&Math.min(a.y,b.y)<r.y+r.h+14:
      a.y>r.y-14&&a.y<r.y+r.h+14&&Math.max(a.x,b.x)>r.x-14&&Math.min(a.x,b.x)<r.x+r.w+14);
  }
  path(start,end) {
    if(this.blocked(start.x,start.y)||this.blocked(end.x,end.y))return null;
    // A* on obstacle-edge coordinates gives a shortest orthogonal aisle path.
    const xs=[...new Set([20,this.width-20,start.x,end.x,...this.obstacles.flatMap(r=>[r.x-14,r.x+r.w+14])])].filter(x=>x>=20&&x<=this.width-20).sort((a,b)=>a-b);
    const ys=[...new Set([70,this.height-18,start.y,end.y,...this.obstacles.flatMap(r=>[r.y-14,r.y+r.h+14])])].filter(y=>y>=70&&y<=this.height-18).sort((a,b)=>a-b);
    const key=(x,y)=>y*xs.length+x,source=key(xs.indexOf(start.x),ys.indexOf(start.y)),goal=key(xs.indexOf(end.x),ys.indexOf(end.y));
    const queue=[source],cost=new Map([[source,0]]),previous=new Map(),closed=new Set(),point=id=>({x:xs[id%xs.length],y:ys[Math.floor(id/xs.length)]});
    const score=id=>{const p=point(id);return cost.get(id)+Math.abs(p.x-end.x)+Math.abs(p.y-end.y);};
    while(queue.length){let best=0;for(let i=1;i<queue.length;i++)if(score(queue[i])<score(queue[best]))best=i;
      const current=queue.splice(best,1)[0];if(current===goal){const route=[];let cursor=goal;while(cursor!==source){route.unshift(point(cursor));cursor=previous.get(cursor);}return route.filter((p,i)=>i===route.length-1||i===0||(route[i-1].x!==route[i+1].x&&route[i-1].y!==route[i+1].y));}
      if(closed.has(current))continue;closed.add(current);const x=current%xs.length,y=Math.floor(current/xs.length),a=point(current);
      for(const [nx,ny]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||ny<0||nx>=xs.length||ny>=ys.length)continue;const next=key(nx,ny),b=point(next);if(closed.has(next)||!this.segment(a,b))continue;
        const distance=cost.get(current)+Math.abs(a.x-b.x)+Math.abs(a.y-b.y);if(distance<(cost.get(next)??Infinity)){cost.set(next,distance);previous.set(next,current);queue.push(next);}}
    }return null;
  }
}
globalThis.OfficeFloor=OfficeFloor;
if(typeof module!=='undefined'){module.exports=OfficeModel;module.exports.OfficeFloor=OfficeFloor;module.exports.OfficeFurnitureHistory=OfficeFurnitureHistory;}
