/* Fixed page actions; never evaluate source supplied by web pages or callers. */
async function chromePageAction(command){
 const visible=el=>!!(el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden';
 const find=selector=>{const el=selector?.startsWith('umi:')?document.querySelector('[data-umi-control-id="'+CSS.escape(selector.slice(4))+'"]'):document.querySelector(selector||'');if(!el||!visible(el))throw Error('Visible element not found');return el;};
 const describe=el=>({id:'umi:'+el.dataset.umiControlId,tag:el.tagName.toLowerCase(),role:el.getAttribute('role'),name:(el.getAttribute('aria-label')||el.innerText||el.getAttribute('placeholder')||'').slice(0,160),type:el.getAttribute('type')});
 if(command.action==='read'){
  const elements=[...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(visible).slice(0,400);
  for(const [index,el]of elements.entries())el.dataset.umiControlId=crypto.randomUUID()+'-'+String(index+1);
  return{url:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,50000),elements:elements.map(describe)};
 }
 if(command.action==='scroll'){window.scrollBy({left:Number(command.x)||0,top:Number(command.y)||0,behavior:'instant'});return{scrollX,scrollY};}
 const el=find(command.selector);el.scrollIntoView({block:'center',inline:'nearest'});el.focus();
 if(command.action==='click')el.click();
 else if(command.action==='type'){
  if(el.matches('input[type=password],input[type=file]'))throw Error('Password and file inputs require direct user interaction');
  if(el.isContentEditable){el.textContent=(command.clear===false?el.textContent:'')+(command.text||'');}
  else{const setter=Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')?.set;if(!setter)throw Error('Element is not editable');setter.call(el,(command.clear===false?el.value:'')+(command.text||''));}
  el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:command.text||''}));el.dispatchEvent(new Event('change',{bubbles:true}));
 }else if(command.action==='select'){if(!(el instanceof HTMLSelectElement))throw Error('Element is not a select');el.value=command.text;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
 else if(command.action==='key'){
  const key=command.key||'Enter';for(const type of ['keydown','keyup'])el.dispatchEvent(new KeyboardEvent(type,{key,bubbles:true,cancelable:true}));
  if(key==='Enter'&&el.form)el.form.requestSubmit();else if(key==='Enter'&&el.matches('button,a,[role=button]'))el.click();
 }else if(command.action==='drag'){
  const target=find(command.target),dataTransfer=new DataTransfer();for(const [node,type]of [[el,'dragstart'],[target,'dragover'],[target,'drop'],[el,'dragend']])node.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer}));
 }else throw Error('Unsupported page action');
 return{performed:command.action,url:location.href};
}
async function trustedChromeInput(tabId,command){
 const target={tabId};await chrome.debugger.attach(target,'1.3');
 try{
  const send=(method,params)=>chrome.debugger.sendCommand(target,method,params);
  const point=async selector=>{const rows=await chrome.scripting.executeScript({target:{tabId},func:selector=>{const el=selector?.startsWith('umi:')?document.querySelector('[data-umi-control-id="'+CSS.escape(selector.slice(4))+'"]'):document.querySelector(selector||'');if(!el||!el.getClientRects().length)throw Error('Visible element not found');el.scrollIntoView({block:'center'});el.focus();if(el.matches('input[type=password],input[type=file]'))throw Error('Sensitive input requires user interaction');const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};},args:[selector]});return rows[0].result;};
  const p=await point(command.selector);
  const mouse=async(type,p,extra={})=>send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,...extra});
  const click=async p=>{await mouse('mousePressed',p,{button:'left',clickCount:1});await mouse('mouseReleased',p,{button:'left',clickCount:1});};
  if(command.action==='click')await click(p);
  else if(command.action==='type'){await click(p);if(command.clear!==false){await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});}await send('Input.insertText',{text:command.text||''});}
  else if(command.action==='key'){const parts=(command.key||'Enter').split('+'),key=parts.pop(),codes={Enter:13,Tab:9,Escape:27,Backspace:8,Delete:46,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Home:36,End:35,PageUp:33,PageDown:34,Space:32},modifiers=(parts.includes('Alt')?1:0)|(parts.includes('Control')||parts.includes('Ctrl')?2:0)|(parts.includes('Meta')?4:0)|(parts.includes('Shift')?8:0),code=codes[key]||key.toUpperCase().charCodeAt(0);await send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code,modifiers,...(key==='Enter'?{text:'\r'}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code,modifiers});}
  else if(command.action==='drag'){const end=await point(command.target);await mouse('mouseMoved',p);await mouse('mousePressed',p,{button:'left',buttons:1,clickCount:1});for(let i=1;i<=12;i++)await mouse('mouseMoved',{x:p.x+(end.x-p.x)*i/12,y:p.y+(end.y-p.y)*i/12},{button:'left',buttons:1});await mouse('mouseReleased',end,{button:'left',clickCount:1});}
  return{result:{performed:command.action}};
 }finally{await chrome.debugger.detach(target).catch(()=>{});}
}
async function runChromeCommand(command){
 const allowed=async url=>{if(!/^https?:\/\//i.test(url||''))throw Error('Chrome internal pages are not supported');const origin=new URL(url).origin+'/*';if(!await chrome.permissions.contains({origins:[origin]}))throw Error('Grant page access in extension settings first');};
 if(command.action==='tabs')return{result:(await chrome.tabs.query({})).filter(t=>/^https?:\/\//i.test(t.url||'')).map(t=>({id:t.id,title:t.title,url:t.url,active:t.active}))};
 if(command.action==='open'){await allowed(command.url);const t=await chrome.tabs.create({url:command.url,active:true});return{result:{id:t.id,url:t.url||command.url}};}
 const tab=await chrome.tabs.get(command.tab_id);await allowed(tab.url);
 if(command.action==='close'){await chrome.tabs.remove(tab.id);return{result:{closed:tab.id}};}
 if(command.action==='navigate'){await allowed(command.url);await chrome.tabs.update(tab.id,{url:command.url});return{result:{navigating:command.url}};}
 if(command.action==='screenshot'){const target={tabId:tab.id};await chrome.debugger.attach(target,'1.3');try{const shot=await chrome.debugger.sendCommand(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:false});return{image:shot.data};}finally{await chrome.debugger.detach(target).catch(()=>{});}}
 if(['click','type','key','drag'].includes(command.action)){if(!await chrome.permissions.contains({permissions:['debugger']}))throw Error('Reload UmiBridge extension to enable trusted page input');return trustedChromeInput(tab.id,command);}
 const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:chromePageAction,args:[command]});return{result:results[0]?.result};
}
let chromeControlBusy=false;
async function tickChromeControl(){
 if(chromeControlBusy)return;chromeControlBusy=true;
 try{const{browserEnabled,endpoint,token}=await chrome.storage.local.get(['browserEnabled','endpoint','token']);if(!endpoint||!token)return;
 const request=async(path,body)=>{const response=await fetch(validOrigin(endpoint)+'/admin/chrome/bridge/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.timeout(8000),cache:'no-store'});if(!response.ok)throw Error('Chrome bridge '+response.status);return response.json();};
 const{command}=await request('poll',{enabled:browserEnabled===true});if(!command)return;
 let output;try{output=await runChromeCommand(command);}catch(error){output={error:error.message};}
 // Never replay a command if acknowledgement is lost.
 await request('report',{id:command.id,...output});
 }catch{}finally{chromeControlBusy=false;}
}
setInterval(()=>void tickChromeControl(),1000);
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='corp')void tickChromeControl();});
void tickChromeControl();
