(() => {
  'use strict';
  const $=id=>document.getElementById(id),root=$('browserSessions');if(!root)return;
  const t=(vi,en)=>(localStorage.getItem('umibridge.admin.language')||document.documentElement.lang)==='en'?en:vi;
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
  const words={ready:['Sẵn sàng','Ready'],idle:['Sẵn sàng','Ready'],paused:['Tạm dừng','Paused'],stopped:['Đã dừng','Stopped'],needs_repair:['Cần đối chiếu','Needs inspection'],running:['Đang chạy','Running'],passed:['Đạt','Passed'],partial:['Chưa đủ dữ liệu xác nhận','Verification incomplete'],failed:['Chưa đạt','Failed'],queued:['Đang chờ','Queued']};
  const word=value=>words[value]?t(...words[value]):value;
  let data=null,pending=false,loading=false,timer=null,listSignature='',eventSignature='';
  async function api(path,body){const response=await fetch('/admin/api/chrome/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-DC-Admin-Action':'1'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.error||'Browser operation failed');return value;}
  async function act(operation){if(pending)return;pending=true;$('browserMessage').textContent='';render();try{await operation();await refresh();}catch(error){$('browserMessage').textContent=error.message;}finally{pending=false;render();}}
  function options(select,rows,empty){const old=select.value,key=JSON.stringify(rows);if(select.dataset.options===key)return;select.dataset.options=key;select.replaceChildren(...(rows.length?rows.map(([value,label])=>new Option(label,value)):[new Option(empty,'')]));if(rows.some(([id])=>id===old))select.value=old;}
  function instance(){return data?.instances.find(row=>row.instanceId===$('browserInstance').value);}
  function labels(){
    const copy={browserSessionsTitle:['Phiên Chrome - bản thử','Chrome sessions - trial'],browserSessionsIntro:['Thao tác trong từng tab, giữ chuột và bàn phím Windows cho bạn.','Operate within each tab while keeping Windows input available to you.'],browserRefresh:['Làm mới','Refresh'],browserInstanceLabel:['Chrome đã kết nối','Connected Chrome'],browserConcurrencyLabel:['Số tab song song','Parallel tabs'],browserDemo:['Chạy demo 2 tab','Run two-tab demo'],browserDemoClose:['Đóng tab kiểm thử','Close test tabs'],browserTabLabel:['Tab đích','Target tab'],browserCreateSession:['Gắn phiên','Bind session'],browserEventsTitle:['Sự kiện phiên','Session events'],browserSessionNote:['Các tab cùng profile dùng chung đăng nhập. Phiên chỉ tồn tại đến khi gateway khởi động lại. Repair không chạy lại lệnh cũ; không có kiểm tra màn hình định kỳ.','Tabs in one profile share login state. Sessions last until the gateway restarts. Repair never replays old actions; no scheduled screen checks.']};
    for(const [id,text]of Object.entries(copy))$(id).textContent=t(...text);
  }
  function render(){
    labels();if(!data)return;
    const ready=data.instances.filter(row=>row.online&&row.enabled&&row.protocol>=2&&row.capabilities?.background&&row.capabilities?.sessionBinding);
    options($('browserInstance'),ready.map(row=>[row.instanceId,'Chrome · '+row.instanceId.slice(0,8)]),t('Chưa có extension sẵn sàng','No ready extension'));
    const selected=instance();
    options($('browserTab'),(selected?.tabs||[]).map(row=>[String(row.tabId),'#'+row.tabId+' · '+row.origin]),t('Chưa có tab được cấp quyền','No permitted tabs'));
    if(document.activeElement!==$('browserConcurrency'))$('browserConcurrency').value=String(data.concurrency);
    $('browserStatus').textContent=ready.length?t('Đã kết nối','Connected')+' · '+data.busy+'/'+data.concurrency+' '+t('tab đang xử lý','tabs in flight')+' · '+data.pending+' '+t('lệnh chờ','queued'):t('Bật Browser control trong extension UmiBridge. Nếu đang dùng bản cũ, hãy Reload extension để nhận tính năng chạy nền.','Enable Browser control in the UmiBridge extension. Reload an older extension to enable background sessions.');
    $('browserDemo').disabled=pending||!selected||data.demo?.status==='running';$('browserRefresh').disabled=pending;
    $('browserCreateSession').disabled=pending||!$('browserTab').value;$('browserConcurrency').disabled=pending;
    $('browserDemoClose').hidden=!data.demo?.tabs?.length;$('browserDemoClose').disabled=pending||data.demo?.status==='running';
    const demo=data.demo;
    const foreground=demo?.checks?.foregroundUnchanged;
    $('browserDemoStatus').textContent=demo?t('Demo 2 tab: ','Two-tab demo: ')+word(demo.status)+(demo.checks?' · '+t('nhập, click xác thực, cuộn, đọc','input, trusted click, scroll, read')+' · '+demo.maxInFlight+' '+t('lệnh đồng thời tối đa','peak in-flight actions')+' · '+(foreground===true?t('Giữ nguyên tab đang dùng','Active tab stayed unchanged'):foreground===false?t('Tab đang dùng đã thay đổi','Active tab changed'):t('Chưa xác nhận tab đang dùng','Active tab not yet verified')):'')+(demo.error?' · '+t('Mở tab kiểm thử và xem phiên trước khi chạy lại.','Inspect the test tabs and sessions before retrying.'):''):t('Demo mở hai trang nội bộ ở nền, thực hiện click/gõ/cuộn và đọc lại kết quả. Không dùng tài khoản hoặc website bên ngoài.','The demo opens two local background pages, types, clicks, scrolls and checks the result. No accounts or external sites are used.');
    const signature=JSON.stringify([data.sessions,data.jobs,pending,document.documentElement.lang,localStorage.getItem('umibridge.admin.language')]);
    if(signature!==listSignature){listSignature=signature;const focused=document.activeElement?.dataset?.sessionAction;const fragment=document.createDocumentFragment();
      for(const row of data.sessions){const item=el('article',null,'browser-session-row');item.dataset.state=row.status;const info=el('div');info.append(el('strong','#'+row.tabId+' · '+row.origin),el('small',word(row.status)+' · '+row.sessionId.slice(0,8)));const actions=el('div',null,'browser-session-actions');
        for(const [action,vi,en]of [['pause','Tạm dừng','Pause'],['resume','Tiếp tục','Resume'],['repair','Repair','Repair'],['stop','Dừng','Stop']]){if(action==='pause'&&!['idle','running','ready'].includes(row.status)||action==='resume'&&row.status!=='paused'||action==='repair'&&!row.needsRepair||action==='stop'&&row.status==='stopped')continue;const button=el('button',t(vi,en),'btn small');button.type='button';button.dataset.sessionAction=row.sessionId+':'+action;button.disabled=pending;button.onclick=()=>void act(async()=>{if(action==='repair'&&!await window.umiConfirm(t('Đối chiếu phiên','Inspect session'),t('Hãy kiểm tra tab đích trước. Lệnh đã gửi có thể đã chạy. Repair chỉ mở lại phiên, không gửi lại lệnh.','Inspect the target tab first. An issued command may have executed. Repair only reopens the session and never replays it.'),t('Đã đối chiếu - mở lại','Inspected - reopen')))return;await api('sessions/'+action,{sessionId:row.sessionId,...(action==='repair'?{confirmed:true}:{})});});actions.append(button);}
        item.append(info,actions);fragment.append(item);
      }
      if(!data.sessions.length)fragment.append(el('p',t('Chưa có phiên. Chọn tab và gắn phiên, hoặc chạy demo.','No sessions. Bind a target tab or run the demo.'),'browser-session-note'));
      $('browserSessionList').replaceChildren(fragment);if(focused)root.querySelector('[data-session-action="'+CSS.escape(focused)+'"]')?.focus();
    }
    const events=JSON.stringify(data.events.slice(-12));if(events!==eventSignature){eventSignature=events;$('browserEvents').replaceChildren(...data.events.slice(-12).reverse().map(row=>el('li',new Date(row.at).toLocaleTimeString()+' · '+row.type+(row.action?' · '+row.action:'')+(row.tabId!=null?' · #'+row.tabId:''))));}
  }
  async function refresh(){if(loading)return;loading=true;try{data=await api('sessions');render();}catch(error){$('browserMessage').textContent=error.message;}finally{loading=false;}}
  function watching(){return !document.hidden&&document.getElementById('tool-permissions')?.classList.contains('view-active');}
  function schedule(){clearInterval(timer);if(watching()){void refresh();timer=setInterval(()=>void refresh(),2000);}}
  $('browserRefresh').onclick=()=>void refresh();$('browserInstance').onchange=render;
  $('browserConcurrency').onchange=()=>void act(()=>api('sessions/configure',{concurrency:Number($('browserConcurrency').value)}));
  $('browserDemo').onclick=()=>void act(()=>api('demo',{instanceId:$('browserInstance').value}));
  $('browserDemoClose').onclick=()=>void act(()=>api('demo/close',{}));
  $('browserSessionForm').onsubmit=event=>{event.preventDefault();const current=instance(),tab=current?.tabs.find(row=>String(row.tabId)===$('browserTab').value);if(tab)void act(()=>api('sessions/create',{instanceId:current.instanceId,tabId:tab.tabId,origin:tab.origin}));};
  window.addEventListener('umibridge-view',schedule);document.addEventListener('visibilitychange',schedule);$('languageSelect')?.addEventListener('change',()=>{listSignature='';render();});schedule();
})();
