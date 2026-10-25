/* Visual choreography only. Never changes a task, sends a chat or places an order. */
class OfficeLife {
  constructor(people) { this.people=people;this.time=0;this.beds=[null,null];this.snacker=null;this.courier=null;this.nextCourier=18;this.events=[];this.log=[]; }
  static hash(value) {return [...value].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);}
  configure(width,height,floor) {this.width=width;this.height=height;if(floor)this.floor=floor;this.bedPoints=[{x:width-280,y:height-76},{x:width-130,y:height-76}];this.snackPoint={x:width-170,y:155};this.entry={x:width-22,y:190};}
  working(p) {return ['DISPATCHED','WAITING'].includes(p.status);}
  init(p) {p.activity??='desk';p.route??=[];p.nextBreak??=this.time+7+OfficeLife.hash(p.id)%12;p.phaseAt??=this.time;}
  emit(kind,actor) {const event={kind,actor,at:this.time};this.events.push(event);this.log.push(event);this.log=this.log.slice(-24);}
  release(p) {this.beds=this.beds.map(id=>id===p.id?null:id);if(this.snacker===p.id)this.snacker=null;p.bed=null;}
  reset() {this.beds=[null,null];this.snacker=null;this.courier=null;this.parcel=null;this.traffic=null;this.nextCourier=this.time+18;this.events=[];for(const p of this.people.values()){p.route=[];p.x=p.seat.x;p.y=p.seat.y;p.activity='desk';p.phaseAt=this.time;p.nextBreak=this.time+7+OfficeLife.hash(p.id)%12;p.bed=null;p.carry=null;p.furniture=3;}}
  routeTo(p,target) {
    const route=this.floor?.path(p,target);
    p.route=route||[];p.pathBlocked=route===null;
    p.trafficTicket=this.sequence=(this.sequence||0)+1;
    return !p.pathBlocked;
  }
  install(p){const room=this.floor.rooms.find(room=>room.name===p.seat.room);p.installSupply={x:room.x+room.w/2,y:room.y+room.h+14};p.furniture=0;p.installPart=0;p.x=this.entry.x;p.y=this.entry.y;p.carry=null;p.route=[];this.begin(p,'install_wait');}
  begin(p,activity) {if(activity==='wake')p.wakeFrom=p.activity==='lie_down'?Math.min(1,(this.time-p.phaseAt)/.8):p.activity==='sleep'?1:0;if(activity==='pack')p.packFrom=p.activity==='spread'?Math.min(1,(this.time-p.phaseAt)/1.2):1;p.activity=activity;p.phaseAt=this.time;}
  home(p) {this.routeTo(p,p.seat);this.begin(p,'return');}
  interrupt(p) {
    if(p.activity.startsWith('install'))return;
    if(p.activity==='spread'){this.begin(p,'pack');p.route=[];}
    else if(['sleep','lie_down'].includes(p.activity)){this.begin(p,'wake');p.route=[];}
    else if(!['desk','return','wake','pack','handoff'].includes(p.activity))this.home(p);
  }
  move(p,dt) {
    let distance=(p.activity?.startsWith('install')?144:72)*dt;
    while(distance>0&&p.route.length){const target=p.route[0],dx=target.x-p.x,dy=target.y-p.y,length=Math.hypot(dx,dy);if(length<.001){p.x=target.x;p.y=target.y;p.route.shift();continue;}p.dir=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';if(length<=distance){p.x=target.x;p.y=target.y;p.route.shift();distance-=length;}else{p.x+=dx/length*distance;p.y+=dy/length*distance;distance=0;}}
  }
  step(dt,{ambient=true}={}) {
    this.time+=dt;
    if(![...this.people.values()].some(p=>['install_walk','install_place','install_fetch'].includes(p.activity))){const next=[...this.people.values()].find(p=>p.activity==='install_wait');if(next){next.carry='desk';this.routeTo(next,next.seat);this.begin(next,'install_walk');this.emit('install_start',next.id);}}
    // ponytail: one traveler owns narrow aisles; add per-segment reservations if room traffic grows.
    const travelers=[...this.people.values(),...(this.courier?[this.courier]:[])];
    if(!travelers.some(p=>p.id===this.traffic&&p.route.length))this.traffic=travelers.filter(p=>p.route.length).sort((a,b)=>a.trafficTicket-b.trafficTicket)[0]?.id||null;
    let away=[...this.people.values()].filter(p=>!['desk','handoff'].includes(p.activity)).length;
    for(const p of this.people.values()){
      this.init(p);
      if(this.working(p)&&!p.activity.startsWith('install'))this.interrupt(p);
      p.motionBlocked=!!p.route.length&&this.traffic!==p.id;if(!p.motionBlocked)this.move(p,dt);
      const elapsed=this.time-p.phaseAt;
      if(p.activity==='install_walk'&&!p.route.length&&!p.pathBlocked){this.begin(p,'install_place');}
      else if(p.activity==='install_place'&&elapsed>=1.2){p.furniture=++p.installPart;p.carry=null;if(p.installPart===3){this.begin(p,'desk');this.emit('install_done',p.id);}else{this.routeTo(p,p.installSupply);this.begin(p,'install_fetch');}}
      else if(p.activity==='install_fetch'&&!p.route.length&&!p.pathBlocked){p.carry=['desk','chair','monitor'][p.installPart];this.routeTo(p,p.seat);this.begin(p,'install_walk');}
      else if(p.activity==='desk'&&!this.working(p)&&ambient&&this.time>=p.nextBreak&&away<2){
        const choice=OfficeLife.hash(p.id)+(p.breakCount||0);p.breakCount=(p.breakCount||0)+1;p.nextBreak=this.time+36+choice%18;
        const bed=this.beds.indexOf(null);
        if(choice%5===2){p.ambientKind='stretch';this.begin(p,'ambient_pause');this.emit('stretch',p.id);away++;}
        else if(choice%5===3){const room=this.floor?.rooms.find(room=>room.name===p.seat.room);if(room){p.ambientKind='plant';this.routeTo(p,{x:room.plant.x+40,y:room.plant.y+40});this.begin(p,'walk_ambient');away++;}}
        else if(choice%5===4){p.ambientKind='read';this.routeTo(p,{x:460,y:this.height-62});this.begin(p,'walk_ambient');away++;}
        else if(choice%2===0&&bed>=0){this.beds[bed]=p.id;p.bed=bed;this.routeTo(p,{x:this.bedPoints[bed].x,y:this.bedPoints[bed].y+26});this.begin(p,'walk_bed');this.emit('rest_walk',p.id);away++;}
        else if(!this.snacker){this.snacker=p.id;this.routeTo(p,this.snackPoint);this.begin(p,'walk_snack');this.emit('snack_walk',p.id);away++;}
      }else if(p.activity==='walk_ambient'&&!p.route.length&&!p.pathBlocked){this.begin(p,'ambient_pause');this.emit(p.ambientKind,p.id);}
      else if(p.activity==='ambient_pause'&&elapsed>=4){this.home(p);}
      else if(p.activity==='walk_bed'&&!p.route.length&&!p.pathBlocked){this.begin(p,'spread');this.emit('spread',p.id);}
      else if(p.activity==='spread'&&elapsed>=1.2)this.begin(p,'lie_down');
      else if(p.activity==='lie_down'&&elapsed>=.8){this.begin(p,'sleep');this.emit('sleep',p.id);}
      else if(p.activity==='sleep'&&elapsed>=7)this.begin(p,'wake');
      else if(p.activity==='wake'&&elapsed>=.8)this.begin(p,'pack');
      else if(p.activity==='pack'&&elapsed>=1.2){this.home(p);this.emit('rest_return',p.id);}
      else if(p.activity==='walk_snack'&&!p.route.length&&!p.pathBlocked){this.begin(p,'snack');this.emit('snack',p.id);}
      else if(p.activity==='snack'&&elapsed>=4){this.home(p);this.emit('snack_return',p.id);}
      else if(p.activity==='return'&&!p.route.length){this.release(p);this.begin(p,'desk');p.nextBreak=this.time+24+OfficeLife.hash(p.id)%18;}
    }
    if(ambient&&this.people.size&&!this.courier&&this.time>=this.nextCourier){
      this.courier={id:'courier',palette:4,...this.entry,seat:this.entry,route:[],dir:'left',phase:'in',phaseAt:this.time};this.routeTo(this.courier,{x:this.width-120,y:155});this.emit('courier_arrive',null);this.nextCourier=this.time+45;
    }
    if(this.courier){const p=this.courier;p.motionBlocked=!!p.route.length&&this.traffic!==p.id;if(!p.motionBlocked)this.move(p,dt);if(!p.route.length&&!p.pathBlocked){if(p.phase==='in'){p.phase='drop';p.phaseAt=this.time;this.emit('courier_drop',null);}else if(p.phase==='drop'&&this.time-p.phaseAt>=2){this.parcel={x:p.x+8,y:p.y-15};p.phase='out';this.routeTo(p,this.entry);}else if(p.phase==='out'){this.courier=null;this.emit('courier_leave',null);}}}
  }
  takeEvents(){return this.events.splice(0);}
  inspect(){return {time:this.time,beds:[...this.beds],bedPoints:this.bedPoints,snackPoint:this.snackPoint,snacker:this.snacker,courier:this.courier?{phase:this.courier.phase,x:this.courier.x,y:this.courier.y}:null,log:this.log,actors:[...this.people.values()].map(p=>({id:p.id,x:p.x,y:p.y,seat:p.seat,activity:p.activity,phaseAt:p.phaseAt,direction:p.activity==='desk'?p.seat.facing:p.dir||'down',furniture:p.furniture,carry:p.carry,pathBlocked:p.pathBlocked,route:p.route.map(point=>({...point})),bed:p.bed}))};}
}
globalThis.OfficeLife=OfficeLife;
if(typeof module!=='undefined')module.exports=OfficeLife;
