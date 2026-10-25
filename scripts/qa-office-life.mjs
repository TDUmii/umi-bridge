// Deterministic visual choreography QA. Synthetic customers, no account or dispatch.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startGateway} from './local-web-gateway.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
const root=await mkdtemp(join(tmpdir(),'umi-office-life-')),shots=resolve('.impeccable/review/office-life');await mkdir(shots,{recursive:true});
let gateway,browser;const errors=[],remote=[],posts=[];
const snapshot={illustration:true,baseline:true,project:'life-fixture',name:'MINH HỌA - Studio',coordinator:true,handoffs:[],customers:[{id:'client-a',name:'Khách mẫu An',title:'Trang lịch học',status:'running'},{id:'client-b',name:'Khách mẫu Bình',title:'Ứng dụng ghi chú',status:'paused'},{id:'client-c',name:'Khách mẫu Chi',title:'Website lớp học',status:'paused'}],agents:['Điều hành','Sản phẩm','Thiết kế','Kỹ thuật','QA','Bảo mật','DevOps','Tài liệu'].map((role,index)=>({id:'life-'+index,roleId:index===0?'ceo':String(index),role,roles:[role],status:index<2?'WAITING':'IDLE',pose:index<2?'type':'idle',count:index<2?1:0,can_open:false}))};
try{
  gateway=await startGateway({port:0,publicUrl:'http://127.0.0.1',connectionSecret:randomBytes(32).toString('base64url'),configDir:join(root,'profile')});const origin=`http://127.0.0.1:${gateway.port}`;
  browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext();
  await context.route('**/*',route=>{const request=route.request();if(!request.url().startsWith(origin)){remote.push(request.url());return route.abort();}if(request.method()==='POST')posts.push(request.url());return route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.stack||error.message));await page.setViewportSize({width:1600,height:1000});await page.goto(origin+'/admin/corp/office/?qa=1');
  await page.waitForFunction(()=>window.office?.inspect().assetsReady);
  await page.evaluate(value=>window.office.setSnapshot(value),snapshot);await page.locator('#zoom-fit').click();
  assert.equal(await page.locator('#customer-count').innerText(),'3');assert.match(await page.locator('#customer-line').innerText(),/Khách mẫu An/);
  await page.evaluate(value=>{window.office.advanceForTest(15);const before=window.office.inspect().life;window.office.setSnapshot({...value,baseline:false});const after=window.office.inspect().life;if(JSON.stringify(before.actors)!==JSON.stringify(after.actors)||before.time!==after.time)throw Error('poll reset choreography');},snapshot);
  const audit=await page.evaluate(()=>{
    const found={},phases=new Set(),violations=[],drawnFrames=new Set();let last=window.office.inspect().life.actors,near=Infinity,nearest=null;
    for(let index=0;index<30*180;index++){
      window.office.advanceForTest(1/30);const state=window.office.inspect();
      if(!state.frameDraws.every(row=>row.valid))violations.push('invalid sprite source rect');
      for(const row of state.frameDraws)drawnFrames.add(`${row.palette}/${row.row}/${row.frame}`);
      for(const actor of state.life.actors){
        phases.add(actor.activity);const previous=last.find(row=>row.id===actor.id);
        if(Math.hypot(actor.x-previous.x,actor.y-previous.y)>72/30+.01)violations.push('teleport');
        if(actor.x<0||actor.x>state.sceneWidth||actor.y<0||actor.y>state.sceneHeight)violations.push('outside room');
        if(actor.route.length)for(const desk of state.life.actors)if(actor.x>desk.seat.x-36&&actor.x<desk.seat.x+36&&actor.y>desk.seat.y-68&&actor.y<desk.seat.y-20)violations.push('desk collision');
        for(const other of state.life.actors)if(other.id!==actor.id&&(other.route.length||actor.route.length)){const distance=Math.hypot(actor.x-other.x,actor.y-other.y);if(distance<near){near=distance;nearest={time:state.life.time,actor,other};}}
        if(['spread','lie_down','sleep','wake','pack','snack'].includes(actor.activity)&&!found[actor.activity])found[actor.activity]={image:document.getElementById('room').toDataURL('image/png'),actor,time:state.life.time};
      }
      if(state.life.courier?.phase==='drop'&&!found.courier)found.courier={image:document.getElementById('room').toDataURL('image/png'),time:state.life.time};
      last=state.life.actors;
    }
    const state=window.office.inspect();return{found,phases:[...phases],violations:[...new Set(violations)],drawnFrames:[...drawnFrames],minimumActorDistance:near,nearest,workingDirections:state.life.actors.slice(0,2).map(actor=>actor.direction),frames:30*180};
  });
  await writeFile(join(shots,'audit-debug.json'),JSON.stringify({nearest:audit.nearest,violations:audit.violations},null,2));assert.deepEqual(audit.violations,[]);assert.deepEqual(audit.workingDirections,['up','up']);assert.ok(audit.minimumActorDistance>=16);
  for(const phase of ['spread','lie_down','sleep','wake','pack','snack','courier']){assert.ok(audit.found[phase],phase);await writeFile(join(shots,phase+'.png'),Buffer.from(audit.found[phase].image.split(',')[1],'base64'));}
  if(process.env.OFFICE_CAPTURE_ANIMATION){
    await page.evaluate(value=>window.office.setSnapshot(value),snapshot);
    const frames=await page.evaluate(()=>{const result=[],mini=document.createElement('canvas');mini.width=1000;mini.height=Math.round(1000*document.getElementById('room').height/document.getElementById('room').width);const g=mini.getContext('2d');g.imageSmoothingEnabled=false;window.office.advanceForTest(12);for(let i=0;i<450;i++){window.office.advanceForTest(.1);g.drawImage(document.getElementById('room'),0,0,mini.width,mini.height);result.push(mini.toDataURL('image/png'));}return result;});
    const directory=join(shots,'animation-frames');await mkdir(directory,{recursive:true});for(let i=0;i<frames.length;i++)await writeFile(join(directory,String(i).padStart(4,'0')+'.png'),Buffer.from(frames[i].split(',')[1],'base64'));
  }
  for(const size of [{width:1600,height:1000,name:'office-desktop'},{width:1366,height:768,name:'office-laptop'}]){await page.setViewportSize(size);await page.locator('#zoom-fit').click();await page.screenshot({path:join(shots,size.name+'.png'),animations:'disabled'});assert.equal(await page.locator('#stage').evaluate(el=>el.clientHeight<=document.getElementById('scene').clientHeight+1),true);}
  await page.locator('#ambient').click();await page.evaluate(()=>window.office.advanceForTest(45));assert.ok((await page.evaluate(()=>window.office.inspect().life.actors)).every(actor=>actor.activity==='desk'));
  await page.locator('#motion').click();assert.equal(await page.locator('#motion').getAttribute('aria-pressed'),'true');
  await page.locator('#preview').click();assert.equal(await page.evaluate(()=>window.office.inspect().preview),true);assert.match(await page.locator('#health').innerText(),/MINH HỌA/);await page.locator('#preview').click();
  await page.evaluate(()=>window.office.setVisible(true));await page.waitForTimeout(100);await page.evaluate(()=>window.office.setVisible(false));assert.equal(await page.evaluate(()=>window.office.inspect().framesActive),false);
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);assert.deepEqual(posts,[]);
  const result={pass:true,synthetic:true,framesAudited:audit.frames,sourceFrames:126,phases:audit.phases,spriteDrawsValid:true,workingDirections:audit.workingDirections,minimumActorDistance:audit.minimumActorDistance,customers:3,desktop:[1600,1366],events:7,postRequests:0,externalRequests:0,pageErrors:0};await writeFile(join(shots,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();await gateway?.close();await rm(root,{recursive:true,force:true});}
