import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const scope={};vm.runInNewContext(await readFile(new URL('../scripts/corp-office/office-life.js',import.meta.url),'utf8'),scope);
const Life=scope.OfficeLife;
const fixture=()=>{const people=new Map(Array.from({length:8},(_,index)=>{const seat={x:105+(index%4)*165,y:300+Math.floor(index/4)*140};return ['p'+index,{id:'p'+index,status:index===0?'WAITING':'IDLE',seat,x:seat.x,y:seat.y,route:[]}];}));const life=new Life(people);life.configure(800,700);return{life,people};};
test('office choreography visits every phase, reserves resources and never steps through desk footprints',()=>{
  const{life,people}=fixture(),seen=new Set();
  for(let frame=0;frame<30*180;frame++){
    const positions=new Map([...people].map(([id,p])=>[id,{x:p.x,y:p.y}]));life.step(1/30);
    for(const p of people.values()){
      seen.add(p.activity);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.x>=0&&p.x<=800&&p.y>=0&&p.y<=700);
      assert.ok(Math.hypot(p.x-positions.get(p.id).x,p.y-positions.get(p.id).y)<=72/30+.001,'fixed speed, no teleport');
      if(p.route.length)for(const other of people.values())assert.ok(!(p.x>other.seat.x-36&&p.x<other.seat.x+36&&p.y>other.seat.y-68&&p.y<other.seat.y-20),'route avoids desk');
    }
    assert.equal(people.get('p0').activity,'desk','a working employee never goes on a decorative break');
    assert.ok(life.beds.filter(Boolean).length<=2);assert.ok([...people.values()].filter(p=>!['desk','handoff'].includes(p.activity)).length<=2);
  }
  for(const phase of ['walk_bed','spread','lie_down','sleep','wake','pack','return','walk_snack','snack'])assert.ok(seen.has(phase),phase);
  assert.ok(life.log.some(event=>event.kind==='courier_leave'));
});
test('new work interrupts spreading, lying down and sleeping without skipping cleanup',()=>{
  for(const phase of ['spread','lie_down','sleep']){
    const{life,people}=fixture();let p;
    for(let frame=0;frame<30*60;frame++){life.step(1/30);p=[...people.values()].find(person=>person.activity===phase);if(p)break;}
    assert.ok(p,phase);life.step(.2);p.status='WAITING';const states=new Set();
    for(let frame=0;frame<30*30;frame++){life.step(1/30);states.add(p.activity);if(p.activity==='desk')break;}
    if(phase!=='spread')assert.ok(states.has('wake'));assert.ok(states.has('pack'));assert.ok(states.has('return'));assert.equal(p.activity,'desk');assert.equal(p.x,p.seat.x);assert.equal(p.y,p.seat.y);assert.ok(!life.beds.includes(p.id));
  }
});
test('ambient off spawns no breaks or couriers',()=>{
  const{life,people}=fixture();for(let frame=0;frame<30*120;frame++)life.step(1/30,{ambient:false});
  assert.ok([...people.values()].every(p=>p.activity==='desk'));assert.equal(life.courier,null);assert.equal(life.log.length,0);
});
