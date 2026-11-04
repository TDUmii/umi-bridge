(() => {
  'use strict';
  const $=id=>document.getElementById(id),vi=()=>localStorage.getItem('umibridge.admin.language')==='vi',t=(a,b)=>vi()?a:b;
  const root=$('terminal-view'),panes=new Map();let sessions=[],active=null,split=false,loading=false,polling=false,defaultCwd='',pollTimer,inputError=false,mode='shell',logFilter='all',activity=[],activityAt=0;
  const mobileOption=new Option('Terminal','terminal');$('mobileView').add(mobileOption,2);
  if(root.classList.contains('view-active'))$('mobileView').value='terminal';
  const error=message=>{$('terminalError').textContent=message||'';$('terminalError').hidden=!message;};
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  async function api(path='',body,signal){
    const response=await fetch('/admin/api/terminal'+path,{method:body===undefined?'GET':'POST',cache:'no-store',signal,headers:body===undefined?{}:{'Content-Type':'application/json','X-DC-Admin-Action':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const value=await response.json().catch(()=>({error:response.status===404?t('Terminal chỉ mở trực tiếp trên máy Windows.','Open Terminal directly on the Windows host.'):'HTTP '+response.status}));
    if(!response.ok){const messages={invalid_terminal_cwd:t('Chọn thư mục tuyệt đối đang tồn tại trên máy.','Choose an existing absolute folder path on this host.'),invalid_terminal_name:t('Tên phiên cần từ 1 đến 80 ký tự.','Session names need 1 to 80 characters.'),terminal_spawn_failed:t('Chưa mở được PowerShell. Mở lại UmiBridge để kiểm tra các thành phần runtime.','PowerShell could not start. Reopen UmiBridge to check its runtime components.'),terminal_session_limit:t('Đã đủ 8 phiên. Đóng một phiên trước khi mở thêm.','Eight sessions are open. Close one before creating another.'),terminal_not_running:t('Phiên đã kết thúc. Mở phiên mới để tiếp tục.','This session has ended. Open a new session to continue.'),terminal_not_found:t('Phiên không còn tồn tại. Chọn Làm mới.','This session is no longer available. Select Refresh.')};throw Error(messages[value.error]||value.error||'HTTP '+response.status);}return value;
  }
  function textLabels(){
    const labels={terminalNew:['Phiên mới','New session'],terminalSplit:['Chia đôi','Split view'],terminalRename:['Đổi tên','Rename'],terminalStop:['Ngắt Ctrl+C','Interrupt Ctrl+C'],terminalRefresh:['Làm mới','Refresh'],terminalCreateTitle:['Mở phiên PowerShell','Open a PowerShell session'],terminalNameLabel:['Tên phiên','Session name'],terminalCwdLabel:['Thư mục làm việc','Working folder'],terminalCreateButton:['Mở terminal','Open terminal'],terminalCreateCancel:['Hủy','Cancel'],terminalEmptyTitle:['Terminal của bạn','Your terminal'],terminalEmptyText:['Mở một phiên để chạy lệnh PowerShell trực tiếp. Không có lệnh nào tự chạy khi mở tab.','Open a session to run PowerShell commands directly. Opening this tab does not run commands.'],terminalDetailsTitle:['Chi tiết phiên','Session details'],terminalRecentTitle:['Lệnh gần đây','Recent commands'],terminalPrivacy:['Phiên và output chỉ ở bộ nhớ của gateway, không lưu vào lịch sử request hay Git. Khi gateway khởi động lại, các phiên sẽ đóng.','Sessions and output stay in gateway memory, outside request history and Git. Gateway restart closes sessions.']};
    for(const [id,copy]of Object.entries(labels))$(id).textContent=t(...copy);
    $('terminalTabs').setAttribute('aria-label',t('Các phiên terminal','Terminal sessions'));
    $('terminalActivityMode').textContent=t('Hoạt động UmiBridge','UmiBridge activity');$('terminalActivityTitle').textContent=t('Lệnh đã ghi nhận','Recorded commands');$('terminalActivityNote').textContent=t('Lệnh và output đã ghi nhận, hiển thị theo thứ tự thời gian. Chỉ đọc.','Recorded commands and output in chronological order. Read only.');
    $('terminalLog').setAttribute('aria-label',t('Bản ghi lệnh và output','Recorded command transcript'));
    for(const button of root.querySelectorAll('[data-log-filter]'))button.textContent=({all:t('Tất cả','All'),ok:t('Thành công','Success'),error:t('Lỗi','Error')})[button.dataset.logFilter];
    renderActivity();
    renderTabs();renderInspector();
  }
  function selected(){return sessions.find(s=>s.id===active);}
  function renderTabs(){
    const tabs=$('terminalTabs'),focus=document.activeElement?.dataset?.session;tabs.replaceChildren();
    for(const session of sessions){
      const wrap=node('div',null,'terminal-tab-wrap'),button=node('button',session.name,'terminal-tab');button.type='button';button.id='terminal-tab-'+session.id;button.dataset.session=session.id;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(session.id===active));button.setAttribute('aria-controls','terminal-pane-'+session.id);button.tabIndex=session.id===active?0:-1;
      button.onclick=()=>select(session.id);button.onkeydown=event=>{const keys=['ArrowRight','ArrowLeft','Home','End'];if(!keys.includes(event.key))return;event.preventDefault();const index=sessions.indexOf(session),next=event.key==='Home'?0:event.key==='End'?sessions.length-1:(index+(event.key==='ArrowRight'?1:-1)+sessions.length)%sessions.length;select(sessions[next].id);$('terminal-tab-'+sessions[next].id)?.focus();};
      const close=node('button',null,'terminal-close');close.type='button';close.setAttribute('aria-label',t('Đóng phiên ','Close session ')+session.name);close.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
      close.onclick=()=>void closeSession(session);wrap.append(button,close);tabs.append(wrap);
    }
    if(focus)tabs.querySelector(`[data-session="${CSS.escape(focus)}"]`)?.focus();
    $('terminalEmpty').hidden=sessions.length>0||mode!=='shell';$('terminalLayout').hidden=!sessions.length||mode!=='shell';$('terminalTabs').hidden=mode!=='shell';$('terminalSplit').disabled=sessions.length<2;
    for(const id of ['terminalStop','terminalRename'])$(id).disabled=!active;
  }
  function renderInspector(){
    const s=selected(),dl=$('terminalDetails');dl.replaceChildren();$('terminalHistory').replaceChildren();if(!s)return;
    const history=Array.isArray(s.history)?s.history:[];
    const last=history.at(-1);
    for(const [key,value]of [[t('Shell','Shell'),s.shell],[t('Thư mục hiện tại','Current folder'),s.cwd],[t('Trạng thái phiên','Session status'),s.status],[t('Exit gần nhất','Last exit code'),last?.exitCode??s.exitCode??'—'],[t('Thời gian lệnh','Command duration'),last?(last.durationMs/1000).toFixed(2)+' s':'—']]){const dd=node('dd',value??'—');dd.title=String(value??'—');dl.append(node('dt',key),dd);}
    for(const command of history.slice(-8).reverse()){
      const li=node('li'),copy=node('button',command.command);copy.type='button';copy.title=t('Sao chép lệnh','Copy command');copy.onclick=()=>void navigator.clipboard.writeText(command.command).catch(cause=>error(cause.message));
      const ms=Number(command.durationMs),info=[command.exitCode==null?'…':'exit '+command.exitCode,Number.isFinite(ms)?(ms/1000).toFixed(2)+'s':''].filter(Boolean).join(' · ');li.append(copy,node('small',info));$('terminalHistory').append(li);
    }
    if(!history.length)$('terminalHistory').append(node('li',t('Lệnh hoàn tất sẽ xuất hiện ở đây.','Completed commands appear here.')));
  }
  function select(id){active=id;renderTabs();renderInspector();layout();}
  function layout(){
    const visible=[active];if(split){const second=sessions.find(s=>s.id!==active);if(second)visible.push(second.id);}
    $('terminalLayout').classList.toggle('terminal-split',split&&visible.length>1);$('terminalSplit').setAttribute('aria-pressed',String(split));
    for(const [id,pane]of panes){pane.element.hidden=!visible.includes(id);if(!pane.element.hidden&&!root.hidden&&root.classList.contains('view-active'))requestAnimationFrame(()=>fit(pane));}
    syncOutput();
  }
  function renderActivity(){
    const target=$('terminalLog'),rows=activity.filter(item=>logFilter==='all'||item.status===logFilter).reverse(),keep=new Set(rows.map(item=>String(item.id)));
    const follow=target.dataset.filter!==logFilter||target.scrollHeight-target.clientHeight-target.scrollTop<24,top=target.scrollTop;
    const anchor=Array.from(target.children).find(child=>child.getBoundingClientRect().bottom>target.getBoundingClientRect().top),offset=anchor?.getBoundingClientRect().top;
    for(const child of Array.from(target.children))if(!keep.has(child.dataset.id))child.remove();
    const existing=new Map(Array.from(target.querySelectorAll('.terminal-log-entry'),entry=>[entry.dataset.id,entry]));
    let position=target.firstElementChild;
    for(const item of rows){
      const id=String(item.id);let article=existing.get(id);
      if(!article){
        article=node('article',null,'terminal-log-entry');article.dataset.id=id;
        const command=node('pre',null,'terminal-log-command');command.tabIndex=0;
        article.append(node('pre',null,'terminal-log-meta'),command,node('pre',null,'terminal-log-text'));
      }
      article.dataset.status=item.status;
      const date=new Date(item.timestamp),time=Number.isFinite(date.getTime())?date.toLocaleString(vi()?'vi-VN':'en-US'):t('Không rõ thời gian','Time unavailable');
      const result=item.status==='error'?t('Lỗi','Error'):item.status==='ok'?t('Thành công','Success'):t('Đang chạy','Running'),duration=Number(item.durationMs);
      const meta='['+time+'] '+item.toolName+' '+result+(Number.isFinite(duration)?' / '+(duration<1000?Math.round(duration)+' ms':(duration/1000).toFixed(2)+' s'):'');
      const command=item.command?'PS '+(item.cwd||'')+'> '+item.command:'> '+item.toolName,output=[item.output?.stdout,item.output?.stderr].filter(Boolean).join('\n');
      for(const [index,value]of [meta,command,output].entries())if(article.children[index].textContent!==value)article.children[index].textContent=value;
      if(article!==position)target.insertBefore(article,position);position=article.nextElementSibling;
    }
    if(!rows.length)target.append(node('p',t('Chưa có lệnh được ghi nhận trong bộ lọc này.','No recorded commands match this filter.'),'terminal-log-empty'));
    target.dataset.filter=logFilter;
    if(follow)target.scrollTop=target.scrollHeight;
    else target.scrollTop=anchor?.isConnected?target.scrollTop+anchor.getBoundingClientRect().top-offset:top;
  }
  function setMode(value){mode=value;inputError=false;error('');$('terminalActivity').hidden=mode!=='activity';$('terminalPrivacy').hidden=mode!=='shell';$('terminalShellMode').setAttribute('aria-pressed',String(mode==='shell'));$('terminalActivityMode').setAttribute('aria-pressed',String(mode==='activity'));$('terminalCreate').hidden=true;renderTabs();layout();void refresh();}
  function fit(pane){try{if(pane.host.clientWidth<50||pane.host.clientHeight<50||pane.dead)return;pane.fit.fit();if(pane.term.cols>500||pane.term.rows>200)pane.term.resize(Math.min(500,pane.term.cols),Math.min(200,pane.term.rows));const shape=pane.term.cols+':'+pane.term.rows;if(shape===pane.shape)return;pane.shape=shape;void api('/'+pane.id+'/resize',{cols:pane.term.cols,rows:pane.term.rows}).catch(cause=>error(cause.message));}catch(cause){error(cause.message);}}
  function mount(s){
    if(panes.has(s.id))return;
    const element=node('section',null,'terminal-console');element.id='terminal-pane-'+s.id;element.setAttribute('role','tabpanel');element.setAttribute('aria-labelledby','terminal-tab-'+s.id);
    const toolbar=node('div',null,'terminal-toolbar'),findLabel=node('label',null,'terminal-find search'),find=node('input');find.type='search';find.placeholder=t('Tìm trong output…','Find in output…');find.setAttribute('aria-label',t('Tìm trong output của ','Find in output of ')+s.name);findLabel.innerHTML='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>';findLabel.append(find);
    const makeButton=(label,action)=>{const b=node('button',label,'btn small');b.type='button';b.onclick=action;return b;};
    const host=node('div',null,'terminal-host'),status=node('div',null,'terminal-status');status.textContent=s.name;
    const auto=makeButton(t('Tự cuộn: Bật','Auto-scroll: On'),()=>{pane.auto=!pane.auto;auto.textContent=pane.auto?t('Tự cuộn: Bật','Auto-scroll: On'):t('Tự cuộn: Tắt','Auto-scroll: Off');auto.setAttribute('aria-pressed',String(pane.auto));if(pane.auto)term.scrollToBottom();});auto.setAttribute('aria-pressed','true');
    toolbar.append(findLabel,makeButton(t('Trước','Previous'),()=>search.findPrevious(find.value,{caseSensitive:false})),makeButton(t('Sau','Next'),()=>search.findNext(find.value,{caseSensitive:false})),auto,makeButton(t('Xóa hiển thị','Clear view'),()=>term.clear()),makeButton(t('Xuất log','Export log'),()=>exportLog(pane)));
    element.append(toolbar,host,status);$('terminalConsoles').append(element);
    const term=new Terminal({cursorBlink:!matchMedia('(prefers-reduced-motion: reduce)').matches,allowProposedApi:false,linkHandler:{activate(){}},fontFamily:'Consolas, "Cascadia Mono", monospace',fontSize:14,lineHeight:1.25,scrollback:5000,screenReaderMode:true,theme:{background:'#0b0b0e',foreground:'#e4e4e9',cursor:'#eeeeF2',selectionBackground:'#5a5a6680',black:'#19191e',red:'#f28b82',green:'#8fdaac',yellow:'#edcb83',blue:'#87b7f3',magenta:'#c6a7de',cyan:'#86cbd5',white:'#d5d5df',brightBlack:'#858592',brightRed:'#ffaaa1',brightGreen:'#b5efc8',brightYellow:'#f7e3b0',brightBlue:'#aecffa',brightMagenta:'#e0c4f1',brightCyan:'#b6e7ed',brightWhite:'#ffffff'}});
    const fitAddon=new FitAddon.FitAddon(),search=new SearchAddon.SearchAddon();term.loadAddon(fitAddon);term.loadAddon(search);term.open(host);
    // Block terminal-supplied hyperlinks/clipboard writes: output never becomes a privileged browser action.
    term.parser.registerOscHandler(52,()=>true);term.parser.registerOscHandler(8,()=>true);
    const pane={id:s.id,element,host,status,term,fit:fitAddon,search,cursor:0,auto:true,input:'',sending:false,inputTimer:0,shape:'',dead:s.status!=='running',replaying:true,stream:null,retryTimer:0};panes.set(s.id,pane);
    term.onData(data=>{if(pane.dead||pane.replaying&&/^(?:\x1b\[[?>]?[0-9;]*(?:[cnRt]|\$y)|\x1bP[01]\$r[\s\S]*\x1b\\)$/.test(data))return;pane.input+=data;if(!pane.inputTimer)pane.inputTimer=setTimeout(()=>void sendInput(pane),12);});
    term.attachCustomKeyEventHandler(event=>{if(event.type!=='keydown')return true;if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==='c'){const selection=term.getSelection();if(selection)void navigator.clipboard.writeText(selection).catch(cause=>error(cause.message));return false;}if(event.ctrlKey&&event.key.toLowerCase()==='f'){find.focus();return false;}return true;});
    find.oninput=()=>{if(find.value)search.findNext(find.value,{incremental:true});else search.clearDecorations();};find.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();event.shiftKey?search.findPrevious(find.value):search.findNext(find.value);}};
    pane.resizeObserver=new ResizeObserver(()=>fit(pane));pane.resizeObserver.observe(host);
  }
  async function sendInput(pane){
    clearTimeout(pane.inputTimer);pane.inputTimer=0;if(pane.sending||pane.dead)return;pane.sending=true;
    try{while(pane.input){let size=4000;if(/[\uD800-\uDBFF]/.test(pane.input.charAt(size-1)))size--;const data=pane.input.slice(0,size);pane.input=pane.input.slice(data.length);await api('/'+pane.id+'/input',{data});}inputError=false;}
    catch(cause){pane.input='';inputError=true;error(t('Chưa gửi được input. Không tự gửi lại để tránh chạy lệnh hai lần. ','Input was not confirmed. It will not replay automatically. ')+cause.message);}
    finally{pane.sending=false;}
  }
  function outputVisible(pane){return mode==='shell'&&root.classList.contains('view-active')&&!document.hidden&&!pane.element.hidden;}
  function syncOutput(){
    for(const pane of panes.values()){
      if(!outputVisible(pane)){clearTimeout(pane.retryTimer);pane.retryTimer=0;pane.stream?.abort();}
      else if(!pane.stream&&!pane.retryTimer)void readOutput(pane);
    }
  }
  async function readOutput(pane){
    const controller=new AbortController();pane.stream=controller;
    try{
      do{
        const output=await api('/'+pane.id+'/output?after='+pane.cursor+'&wait='+(pane.dead?0:20000),undefined,controller.signal);
        if(controller.signal.aborted)break;
        if(output.reset){pane.replaying=true;pane.term.reset();pane.term.writeln('\x1b[33m'+t('Đang hiển thị phần output còn giữ trong bộ nhớ.','Showing output retained in memory.')+'\x1b[0m');}
        const chunks=output.chunks||[],viewport=pane.term.buffer.active.viewportY;
        if(chunks.length){
          await new Promise(resolve=>pane.term.write(chunks.map(chunk=>chunk.data).join(''),resolve));
          pane.cursor=chunks.at(-1).seq;pane.replaying=false;
          if(pane.auto)pane.term.scrollToBottom();else pane.term.scrollToLine(viewport);
        }
        const state=output.session;
        if(state){
          pane.cursor=Math.max(pane.cursor,state.sequence||0);
          const index=sessions.findIndex(s=>s.id===pane.id);if(index>=0)sessions[index]=state;
          pane.dead=state.status!=='running';pane.status.textContent=state.name+' · '+state.shell+' · '+state.status+(state.exitCode==null?'':' · exit '+state.exitCode);
          updateInspector();
        }
        if(!inputError)error('');
      }while(!pane.dead&&outputVisible(pane)&&!controller.signal.aborted);
    }catch(cause){
      if(!controller.signal.aborted){error(cause.message);pane.retryTimer=setTimeout(()=>{pane.retryTimer=0;syncOutput();},1500);}
    }finally{if(pane.stream===controller)pane.stream=null;if(controller.signal.aborted&&panes.get(pane.id)===pane&&outputVisible(pane))syncOutput();}
  }
  function updateInspector(){
    const signature=JSON.stringify(selected());if($('terminalDetails').dataset.signature!==signature){$('terminalDetails').dataset.signature=signature;renderInspector();}
  }
  async function poll(){
    clearTimeout(pollTimer);if(polling)return;polling=true;const shown=root.classList.contains('view-active')&&!document.hidden;
    if(shown){try{
      if(mode==='activity'){
        if(Date.now()-activityAt>3000){const state=await api('/activity');activity=state.requests||[];renderActivity();activityAt=Date.now();}
        error('');polling=false;pollTimer=setTimeout(()=>void poll(),3000);return;
      }
      const state=await api();sessions=state.sessions;defaultCwd=state.defaultCwd;if(!active||!sessions.some(s=>s.id===active))active=sessions[0]?.id||null;
      for(const [id,pane]of panes)if(!sessions.some(s=>s.id===id)){pane.dead=true;pane.stream?.abort();clearTimeout(pane.retryTimer);clearTimeout(pane.inputTimer);pane.resizeObserver.disconnect();pane.term.dispose();pane.element.remove();panes.delete(id);}
      for(const s of sessions)mount(s);
      const signature=JSON.stringify(sessions.map(s=>[s.id,s.name,s.status]));if($('terminalTabs').dataset.signature!==signature){$('terminalTabs').dataset.signature=signature;renderTabs();layout();}
      updateInspector();syncOutput();
      if(!inputError)error('');
    }catch(cause){error(cause.message);}}
    polling=false;pollTimer=setTimeout(()=>void poll(),1500);
  }
  async function refresh(){if(loading)return;loading=true;try{await poll();}finally{loading=false;}}
  async function closeSession(s){
    if(!confirm(t('Đóng phiên “','Close session “')+s.name+t('”? Tiến trình trong phiên này sẽ bị dừng.','”? Processes in this session will be stopped.')))return;
    try{await api('/'+s.id+'/close',{});await refresh();}catch(cause){error(cause.message);}
  }
  function exportLog(pane){const lines=[],buffer=pane.term.buffer.active;for(let i=0;i<buffer.length;i++)lines.push(buffer.getLine(i).translateToString(true));const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'})),a=node('a');a.href=url;a.download='umibridge-terminal-'+pane.id+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('terminalNew').onclick=()=>{if(mode!=='shell')setMode('shell');$('terminalCreate').hidden=false;$('terminalCwd').value=defaultCwd;$('terminalName').value='PowerShell '+(sessions.length+1);$('terminalName').focus();};
  $('terminalCreateCancel').onclick=()=>{$('terminalCreate').hidden=true;};
  $('terminalCreate').onsubmit=async event=>{event.preventDefault();const button=$('terminalCreateButton');button.disabled=true;try{const value=await api('',{name:$('terminalName').value,cwd:$('terminalCwd').value,cols:100,rows:28}),s=value.session||value;active=s.id;$('terminalCreate').hidden=true;await refresh();panes.get(active)?.term.focus();}catch(cause){error(cause.message);}finally{button.disabled=false;}};
  $('terminalStop').onclick=async()=>{if(active)try{await api('/'+active+'/input',{data:'\u0003'});panes.get(active)?.term.focus();}catch(cause){error(cause.message);}};
  $('terminalRename').onclick=async()=>{const s=selected();if(!s)return;const name=prompt(t('Tên phiên','Session name'),s.name);if(name===null)return;try{await api('/'+s.id+'/rename',{name});await refresh();}catch(cause){error(cause.message);}};
  $('terminalSplit').onclick=()=>{split=!split;layout();};$('terminalRefresh').onclick=()=>void refresh();
  $('terminalShellMode').onclick=()=>setMode('shell');$('terminalActivityMode').onclick=()=>setMode('activity');
  root.querySelectorAll('[data-log-filter]').forEach(button=>button.onclick=()=>{logFilter=button.dataset.logFilter;for(const other of root.querySelectorAll('[data-log-filter]'))other.setAttribute('aria-pressed',String(button===other));renderActivity();});
  window.addEventListener('umibridge-view',event=>{if(event.detail==='terminal'){void refresh();layout();}else syncOutput();});
  document.addEventListener('visibilitychange',()=>{syncOutput();if(!document.hidden&&root.classList.contains('view-active'))void refresh();});
  $('languageSelect').addEventListener('change',textLabels);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{for(const pane of panes.values())pane.term.options.cursorBlink=!event.matches;});
  textLabels();if(root.classList.contains('view-active'))void refresh();
})();
