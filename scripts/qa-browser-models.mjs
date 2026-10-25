// Public picker DOM fixture. No account, provider request or real message.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage();await page.setContent(`<!doctype html><button id="picker" aria-label="Chọn mô hình ChatGPT" aria-expanded="false">Model</button><div id="menu" style="display:none"><button data-model-picker-view-toggle></button><div id="list" style="display:none"></div><div data-reasoning-slider tabindex="0"><span role="slider" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0"></span></div></div><script>
  window.fixture={model:'GPT-6.1 Sol',index:0};const names=['GPT-6.1 Sol','GPT-5.6 Sol'],labels=['Nhẹ nhàng','Vừa','Cao','Chuyên sâu','Max'];
  function render(){document.querySelector('[data-model-picker-view-toggle]').textContent=fixture.model+labels[fixture.index];document.querySelector('[role=slider]').setAttribute('aria-valuenow',fixture.index);for(const row of document.querySelectorAll('[role=menuitemradio]')){row.setAttribute('aria-checked',String(row.textContent===fixture.model));if(row.textContent===fixture.model)row.setAttribute('data-model-selected','true');else row.removeAttribute('data-model-selected');}}
  for(const name of names){const item=document.createElement('div');item.role='menuitemradio';item.textContent=name;item.onclick=()=>{fixture.model=name;document.getElementById('list').style.display='none';render();};document.getElementById('list').append(item);}
  document.getElementById('picker').onclick=event=>{const open=event.currentTarget.getAttribute('aria-expanded')!=='true';event.currentTarget.setAttribute('aria-expanded',String(open));document.getElementById('menu').style.display=open?'block':'none';};document.querySelector('[data-model-picker-view-toggle]').onclick=()=>document.getElementById('list').style.display='block';document.querySelector('[data-reasoning-slider]').onkeydown=event=>{if(event.key==='ArrowRight')fixture.index=Math.min(4,fixture.index+1);if(event.key==='ArrowLeft')fixture.index=Math.max(0,fixture.index-1);render();};render();</script>`);
  await page.addScriptTag({content:await readFile('extensions/umibridge-corp/model-picker.js','utf8')});
  const models=await page.evaluate(()=>UmiModelPicker.scan());assert.deepEqual(models,[{model:'GPT-6.1 Sol',efforts:['low','medium','high','xhigh','max']},{model:'GPT-5.6 Sol',efforts:['low','medium','high','xhigh','max']}]);
  assert.deepEqual(await page.evaluate(()=>fixture),{model:'GPT-6.1 Sol',index:0});
  await page.evaluate(()=>UmiModelPicker.apply({model:'GPT-5.6 Sol',effort:'high'}));assert.deepEqual(await page.evaluate(()=>fixture),{model:'GPT-5.6 Sol',index:2});assert.equal(await page.evaluate(()=>UmiModelPicker.verify({model:'GPT-5.6 Sol',effort:'high'})),true);assert.equal(await page.evaluate(()=>UmiModelPicker.verify({model:'GPT-6.1 Sol',effort:'high'})),false);
  await assert.rejects(page.evaluate(()=>UmiModelPicker.apply({model:'Invented',effort:'high'})),/model_not_available/);await assert.rejects(page.evaluate(()=>UmiModelPicker.apply({model:'GPT-5.6 Sol',effort:'ultra'})),/reasoning_not_available/);
  await mkdir('.impeccable/review/model-settings',{recursive:true});await writeFile('.impeccable/review/model-settings/picker-report.json',JSON.stringify({pass:true,synthetic:true,models,restoresOriginal:true,selectsHigh:true,unsupportedRejected:true}));console.log('PASS: picker scan, original restoration, GPT-5.6 Sol/high, verification and unavailable rejection');
}finally{await browser.close();}
