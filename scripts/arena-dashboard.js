(() => {
  const $=id=>document.getElementById(id),section=$('arena');
  let data=null,loading=false,sending=false,request=null,signature='',selected=localStorage.getItem('umibridge.arena.selected')||'',folderOpen=false,seatPage=null;
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion=motionQuery.matches;
  const pending=new Set(),opened=new Set();
  const labels={setup:'Khởi tạo',paused:'Tạm dừng',running:'Đang thực hiện',done:'Hoàn thành',cancelled:'Đã hủy',blocked:'Cần kiểm tra',queued:'Chờ thực hiện',dispatching:'Đang gửi',complete:'Hoàn chỉnh',advancing:'Đi tiếp',eliminated:'Dừng thi',waiting:'Chưa thực hiện'};
  const weaponNames=['Đoản kiếm','Trường kiếm','Kiếm cong','Búa chiến','Khiên','Rìu chiến'];
  const weaponFigure=index=>{const weapon=node('i',undefined,'arena-weapon weapon-'+(index%weaponNames.length));weapon.setAttribute('aria-hidden','true');return weapon;};
  const reasons={pair_arena_first:'Kết nối extension trước khi tạo Arena.',enable_arena_first:'Bật điều phối Arena trước khi bắt đầu.',arena_setup_required:'Tạo xong Project và toàn bộ chat trước khi bắt đầu.',check_browser_before_retry:'Kiểm tra Project và chat đã tạo trước khi chuẩn bị thử lại.',check_chat_before_retry:'Kiểm tra chat và tệp trước khi chuẩn bị thử lại.',bootstrap_unconfirmed:'Chưa xác nhận thao tác tạo. Kiểm tra tab ChatGPT trước khi thử lại.',bootstrap_recovery_required:'Tab khởi tạo cũ không còn. Kiểm tra Project và chat đã tạo để tránh tạo trùng.',restart_reconcile:'UmiBridge đã khởi động lại. Đối chiếu chat và tệp trước khi tiếp tục.',send_unconfirmed:'Chưa xác nhận đã gửi. Kiểm tra chat trước khi thử lại.',composer_busy:'Chat đang trả lời hoặc có bản nháp. Hoàn tất bản nháp trước khi tiếp tục.',arena_evidence_invalid:'Bằng chứng chưa hợp lệ. Kiểm tra source và tệp build, test, run.',arena_report_invalid:'Báo cáo chưa hợp lệ. Mở chat để kiểm tra.',arena_decision_invalid:'Báo cáo giám khảo chưa hợp lệ. Kiểm tra điểm, thứ hạng và phản hồi.',provider_limit:'ChatGPT báo giới hạn. Kiểm tra hạn mức trước khi thử lại.',response_timeout:'Chưa có kết quả xác nhận sau thời gian chờ. Kiểm tra chat.',parent_folder_unavailable:'Thư mục không tồn tại hoặc không có quyền ghi.',invalid_parent_root:'Nhập đường dẫn thư mục tuyệt đối hợp lệ.',project_folder_exists:'Thư mục đã tồn tại. Thử tạo lại để dùng thư mục riêng.',invalid_idea:'Nhập ý tưởng từ 4 đến 8.000 ký tự.',arena_project_conflict:'Project này đã được dùng. Kiểm tra tab khởi tạo để giữ Arena riêng.',cancel_before_delete:'Hủy Arena trước khi xóa khỏi danh sách.'};
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  const selectionPath=count=>{const rows=[count];while(count>1){count=Math.ceil(count/2);rows.push(count);}return rows;};
  const button=(text,action)=>{const element=node('button',text,'btn small');element.type='button';element.onclick=action;return element;};
  const current=()=>data?.arenas.find(arena=>arena.id===selected);
  const capable=(count=Number($('arenaCount').value))=>{const [major,minor]=String(data?.extensionVersion||'').split('.').map(Number);return major>0||minor>=(7);};
  const message=(text='')=>{$('arenaError').textContent=text;$('arenaError').hidden=!text;};
  async function api(path='',body,global=false){
    const response=await fetch((global?'/admin/api':'/admin/api/arena')+path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-DC-Admin-Action':'1'},body:JSON.stringify(body)});
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Gateway đang khởi động hoặc kết nối lại. Arena giữ tiến độ và tự kiểm tra lại.');
    const result=await response.json();if(!response.ok){const cause=Error(reasons[result.error]||result.error||'Không cập nhật được Arena.');cause.code=result.error;throw cause;}return result;
  }
  const link=(label,url)=>{const element=node('a',label,'btn small');element.href=url;element.target='_blank';element.rel='noopener noreferrer';return element;};
  const setMotion=()=>{reducedMotion=motionQuery.matches;section.dataset.motion=reducedMotion?'reduced':'full';signature='';render();};
  section.dataset.motion=reducedMotion?'reduced':'full';
  window.umiArenaLayout={renderWorld:arenaWorld};
  motionQuery.addEventListener?.('change',setMotion);
  function detail(key,label){const element=node('details');element.dataset.key=key;element.open=opened.has(key);const summary=node('summary',label);summary.dataset.focus=key;element.append(summary);element.addEventListener('toggle',()=>{if(element.open)opened.add(key);else opened.delete(key);});return element;}
  function readiness(){
    if(!data)return;
    $('arenaRecommendation').textContent='Khuyến cáo máy này: '+(data.capacity?.recommended||20)+' đội. Tối đa 100; tác vụ AI chạy trên web, còn phụ thuộc hạn mức tài khoản. Chỉ mở tab đang cần.';
    $('arenaCount').disabled=sending;
    $('arenaEnabled').textContent='Điều phối Arena: '+(data.enabled?'Bật':'Tắt');$('arenaEnabled').setAttribute('aria-pressed',String(data.enabled));
    $('arenaConnection').textContent=data.connected?'Extension '+(data.extensionVersion||'chưa rõ phiên bản'):data.paired?'Extension offline':'Chưa kết nối extension';
    const neededCount=$('arenaCreate').open?Number($('arenaCount').value):(current()?.count||Number($('arenaCount').value));
    $('arenaReadiness').textContent=!data.paired?'Ghép extension để tạo Project và chat.':!capable(neededCount)?'Nạp lại extension UmiBridge 0.7.0 và tải lại các tab ChatGPT. Arena chờ phiên bản mới.':!data.connected?'Mở trình duyệt có extension đã ghép.':'';
    $('arenaSubmit').disabled=sending||folderOpen||!data.paired||!capable();$('arenaSubmit').textContent=sending?'Đang lưu...':'Lưu Arena';
    for(const id of ['arenaName','arenaIdea','arenaRoot'])$(id).readOnly=sending||(id==='arenaRoot'&&folderOpen);
    $('arenaBrowse').disabled=sending||folderOpen;
    $('arenaEnabled').disabled=pending.has('settings');
    window.umiFolderDialog.initialize('arenaRoot',data.projectsRoot);
  }
  async function action(id,verb){
    if(pending.has(id))return;
    if(verb==='retry'&&!confirm('Chỉ thử lại sau khi đã đối chiếu chat và tệp đã tạo. Nếu lượt trước đã chạy, gửi lại có thể lặp thao tác. Chuẩn bị thử lại và giữ Arena tạm dừng?'))return;
    if(verb==='delete'&&!confirm('Xóa Arena khỏi danh sách? Tệp sản phẩm và Project ChatGPT vẫn được giữ.'))return;
    pending.add(id);message();signature='';render();
    try{await api('/arenas/'+encodeURIComponent(id)+'/'+verb,{});await load(true);}
    catch(cause){message(cause.message);}
    finally{pending.delete(id);signature='';render();}
  }
  function controls(arena,job){
    const root=$('arenaActions');root.replaceChildren();const busy=pending.has(arena.id),finished=['done','cancelled'].includes(arena.status),blocked=arena.reason||arena.steps?.some(step=>step.status==='blocked')||job?.status==='blocked';
    const add=(label,verb,disabled=false)=>{const element=button(label,()=>action(arena.id,verb));element.dataset.action=verb;element.disabled=busy||disabled;root.append(element);};
    if(!finished){
      if(job?.status!=='done')add(job?.status==='running'?'Đang tạo Project và chat':'Tạo Project và '+(arena.count+1)+' chat','setup',!data.enabled||!capable(arena.count)||job?.status==='running'||!!job?.issuedAt);
      else add(arena.status==='running'?'Đang thực hiện':'Bắt đầu','start',!data.enabled||!capable(arena.count)||arena.status==='running'||!!blocked);
      if(arena.status==='running'||job?.status==='running')add('Tạm dừng','pause');
      if(blocked)add('Đã kiểm tra - thử lại','retry');
      add('Hủy Arena','cancel');
    }else add('Xóa khỏi danh sách','delete');
    if(arena.projectUrl)root.append(link('Mở Project',arena.projectUrl));
    if(arena.projectId)root.append(button(arena.status==='done'&&arena.cleanupAfterDelivery?'Dọn chat sau bàn giao':'Quản lý Project',()=>window.umiProjectManager?.({channel:'arena',id:arena.id,gitId:arena.id,name:arena.name,projectUrl:arena.projectUrl,chats:[...(arena.candidates||[]).filter(row=>row.chatId).map(row=>({chatId:row.chatId,name:row.label})),...(arena.judge?.chatId?[{chatId:arena.judge.chatId,name:'Giám khảo'}]:[])]})));
  }
  function arenaWorld(arena,job,{enabled=false,visible=true,compact=false}={}){
    const roster=arena?.candidates||[],steps=arena?.steps||[],active=steps.find(step=>!['done','cancelled'].includes(step.status)),candidate=roster.find(row=>row.id===active?.candidateId),setup=!!arena&&job?.status!=='done';
    const running=!!(arena&&enabled&&visible&&arena.status==='running'&&['dispatching','running'].includes(active?.status)),status=arena?(arena.reason||active?.status==='blocked'||job?.status==='blocked'?'blocked':arena.status):'empty';
    const world=node('section',undefined,'arena-world');world.dataset.running=String(running);world.dataset.visible=String(visible);world.dataset.status=status;world.dataset.compact=String(compact);world.setAttribute('aria-label','Đấu trường La Mã - '+(arena?.count||10)+' đội và giám khảo');
    if(arena){
      const band=node('div',undefined,'arena-progress-band'),confirmed=setup?(job?.chats?.length||0):steps.filter(step=>step.status==='done').length,total=setup?arena.count+1:steps.length,progressGroup=node('div',undefined,'arena-progress-group');
      progressGroup.append(node('span',`${confirmed}/${total} ${setup?'chat':'lượt'} đã xác nhận`));const progress=node('progress');progress.max=Math.max(1,total);progress.value=confirmed;progress.setAttribute('aria-label','Tiến độ Arena');progressGroup.append(progress);band.append(progressGroup);
      const path=node('ol',undefined,'arena-path');path.setAttribute('aria-label','Lộ trình sản phẩm');for(const count of selectionPath(arena.count)){const item=node('li',String(count));item.dataset.reached=String(count===arena.count||(arena.rounds||[]).some(round=>round.outputIds?.length===count));item.setAttribute('aria-label',count+' sản phẩm');path.append(item);}band.append(path);
      if(active?.chatUrl)band.append(link(active.kind==='judge'?'Chat giám khảo':'Chat thí sinh',active.chatUrl));world.append(band);
    }
    const architecture=node('div',undefined,'arena-colosseum');architecture.setAttribute('aria-hidden','true');
    for(let tier=0;tier<3;tier++){const row=node('div',undefined,'arena-colosseum-tier');for(let arch=0;arch<18;arch++)row.append(node('i',undefined,'arena-colosseum-arch'));architecture.append(row);}world.append(architecture);
    const floor=node('div',undefined,'arena-sand');floor.setAttribute('aria-hidden','true');floor.append(node('i'),node('i'),node('i'));world.append(floor);
    for(const side of ['left','right']){const standard=node('div',undefined,'arena-standard '+side);standard.setAttribute('aria-hidden','true');standard.append(node('i'),node('b'));world.append(standard);}
    const heading=node('header',undefined,'arena-world-heading');heading.append(node('strong','ARENA'),node('span',arena?'Đấu trường sản phẩm':'Đấu trường La Mã'));world.append(heading);
    const judge=node('div',undefined,'arena-world-judge');judge.dataset.active=String(active?.kind==='judge'&&running);judge.append(node('i',undefined,'arena-judge-figure'),node('strong','Giám khảo'),node('span',!arena?'Chưa có chat':active?.kind==='judge'?`Vòng ${active.round} · ${labels[active.status]||active.status}`:arena.judge?.chatUrl?'Đã có chat':'Chờ khởi tạo'));world.append(judge);
    const focus=node('div',undefined,'arena-world-focus');focus.setAttribute('role','status');focus.append(node('span',!arena?'10–100 đội độc lập':setup?'Khởi tạo Project và chat':active?.kind==='judge'?`Chấm vòng ${active.round}`:candidate?`${candidate.label} · Vòng ${active.round}`:arena.winnerId?'Đã chọn sản phẩm thắng':'Chờ lượt thực hiện'),node('small',!arena?'Tạo Arena để bắt đầu':setup?labels[job?.status]||'Chờ khởi tạo':active?labels[active.status]||active.status:labels[arena.status]||arena.status));world.append(focus);
    const seats=node('ol',undefined,'arena-contestants');seats.setAttribute('aria-label','Vị trí đội đang xem');
    const activeIndex=arena?.candidates.findIndex(row=>row.id===active?.candidateId)??0,totalSeats=arena?.count||10,pageSize=10,currentPage=Math.min(Math.max(0,seatPage??Math.floor(Math.max(0,activeIndex)/pageSize)),Math.ceil(totalSeats/pageSize)-1),start=currentPage*pageSize,end=Math.min(totalSeats,start+pageSize);
    if(totalSeats>pageSize){const pages=node('nav',undefined,'arena-seat-pages');pages.setAttribute('aria-label','Trang đội');for(let page=0;page<Math.ceil(totalSeats/pageSize);page++){const control=button((page*pageSize+1)+'–'+Math.min(totalSeats,(page+1)*pageSize),()=>{seatPage=page;signature='';render();});control.setAttribute('aria-pressed',String(page===currentPage));pages.append(control);}world.append(pages);}
    for(let index=start;index<end;index++){
      const item=roster[index],state=!item?'empty':item.id===arena.winnerId?'winner':item.id===candidate?.id?(running?'active':active?.status==='blocked'?'blocked':item.status||'waiting'):item.status||'waiting';
      const seat=node('li',undefined,'arena-contestant');seat.dataset.state=state;seat.style.setProperty('--seat-arc',String(Math.abs((index%10)-4.5)));seat.style.setProperty('--seat-index',String(index));
      const positions=[[75,28],[90,49],[87,73],[73,87],[58,85],[42,85],[27,87],[13,73],[10,49],[25,28]],position=positions[index-start];seat.style.left=position[0]+'%';seat.style.top=position[1]+'%';
      const name=item?.label||`Vị trí ${String(index+1).padStart(2,'0')}`,stateText=state==='empty'?'Trống':state==='winner'?'Thắng':state==='active'?'Đang làm':labels[state]||state;
      seat.title=`${name} · ${stateText} · ${weaponNames[index%weaponNames.length]} · ${item?.versions?.length||0} phiên bản`;seat.setAttribute('aria-label',seat.title);if(item)seat.tabIndex=0;
      const figure=node('span',undefined,'arena-contestant-figure');figure.setAttribute('aria-hidden','true');figure.style.setProperty('--palette-row',String(index%5));const weapon=weaponFigure(index);seat.append(figure,weapon,node('strong',String(index+1).padStart(2,'0')),node('span',stateText),node('small',item?.versions?.length?`${item.versions.length} bản`:''));seats.append(seat);
    }world.append(seats);
    if(candidate&&!setup){const featured=node('div',undefined,'arena-featured');featured.dataset.active=String(running);const figure=node('i',undefined,'arena-featured-figure');figure.style.setProperty('--palette-row',String(Math.max(0,activeIndex)%5));const weapon=weaponFigure(Math.max(0,activeIndex));featured.title=weaponNames[Math.max(0,activeIndex)%weaponNames.length];featured.append(figure,weapon,node('strong',candidate.label),node('span',active?.kind==='judge'?'Đang được chấm':labels[active?.status]||'Chờ lượt'));world.append(featured);}
    const legend=node('footer',undefined,'arena-world-legend');for(const [state,text] of [['active','Đang làm'],['advancing','Đi tiếp'],['eliminated','Dừng thi'],['blocked','Cần kiểm tra']]){const entry=node('span',text);entry.dataset.state=state;legend.append(entry);}world.append(legend);
    const credit=node('a','Chasersgaming · CC0','arena-art-credit');credit.href='https://opengameart.org/content/rpg-asset-character-gladiator-sms';credit.target='_blank';credit.rel='noopener noreferrer';world.append(credit);
    return world;
  }
  function live(arena,job,root){
    root.append(arenaWorld(arena,job,{enabled:data.enabled,visible:section.classList.contains('view-active')&&!document.hidden}));
    const completed=arena.candidates.filter(candidate=>candidate.versions?.length).length,versions=arena.candidates.reduce((sum,candidate)=>sum+(candidate.versions?.length||0),0),summary=node('dl',undefined,'arena-summary');
    for(const [title,value] of [['Sản phẩm hoàn chỉnh',completed+'/'+arena.count],['Phiên bản đã lưu',versions],['Vòng đã chấm',(arena.rounds||[]).filter(round=>round.status==='done').length+'/'+(selectionPath(arena.count).length-1)]]){const row=node('div');row.append(node('dt',title),node('dd',String(value)));summary.append(row);}root.append(summary);
    if(arena.winnerId){const winner=arena.candidates.find(row=>row.id===arena.winnerId),result=node('div',undefined,'arena-winner');result.append(node('h3','Sản phẩm thắng: '+(winner?.label||arena.winnerId)),node('code',winner?.root||arena.root));if(winner?.versions?.at(-1)?.report?.summary)result.append(node('p',winner.versions.at(-1).report.summary));root.append(result);}
    const info=detail('info-'+arena.id,'Ý tưởng và thư mục');info.append(node('p',arena.idea),node('code',arena.root));root.append(info);
  }
  function candidates(arena,root){
    const list=node('div',undefined,'arena-candidates');
    for(const candidate of arena.candidates){
      const row=detail(arena.id+'-'+candidate.id,candidate.label+' · '+(labels[candidate.status]||candidate.status)+' · '+(candidate.versions?.length||0)+' phiên bản');row.dataset.candidate=candidate.id;
      const head=node('div',undefined,'actions');if(candidate.chatUrl)head.append(link('Mở chat',candidate.chatUrl));row.append(head,node('code',candidate.root));
      if(!candidate.versions?.length)row.append(node('p','Chưa có phiên bản hoàn chỉnh được xác nhận.','arena-muted'));
      for(const version of [...(candidate.versions||[])].reverse()){
        const entry=node('section',undefined,'arena-version');entry.append(node('h4','Phiên bản vòng '+version.round),node('p',version.report?.summary||''),node('code',version.snapshotRoot+'/manifest.json'));
        if(version.manifestSha256)entry.append(node('code','Manifest SHA-256: '+version.manifestSha256));if(version.sourceHash)entry.append(node('code','Source SHA-256: '+version.sourceHash));
        const files=node('ul');for(const file of version.files||[])files.append(node('li',`${file.path} · ${file.bytes} byte · SHA-256 ${file.sha256}`));entry.append(files);
        for(const check of version.report?.checks||[]){entry.append(node('p',`${check.name}: ${check.status==='pass'?'Đạt':check.status} · ${check.evidence}`));if(check.command)entry.append(node('code',check.command));}
        const artifacts=version.report?.artifacts||[];for(const path of artifacts)entry.append(node('code',path));row.append(entry);
      }
      const feedback=candidate.feedback?.at(-1);if(feedback)row.append(node('p',`Phản hồi vòng ${feedback.round}: ${feedback.feedback}`));list.append(row);
    }
    root.append(list);const judge=node('div',undefined,'arena-judge');judge.append(node('h3','Giám khảo'));if(arena.judge?.chatUrl)judge.append(link('Mở chat giám khảo',arena.judge.chatUrl));else judge.append(node('p','Chat giám khảo được tạo sau '+arena.count+' đội.'));root.append(judge);
  }
  function rounds(arena,root){
    const all=arena.rounds||[],rubric=arena.rubric||data.rubric||[];if(!all.length){root.append(node('p','Chưa bắt đầu vòng đấu.'));return;}
    const picker=node('select');picker.setAttribute('aria-label','Chọn vòng đấu');picker.id='arenaRound';picker.dataset.focus='round';for(const round of all){const option=node('option',`Vòng ${round.number} · ${round.inputIds.length} sản phẩm${round.status==='done'?' · Đã chấm':''}`);option.value=round.number;picker.append(option);}const key='umibridge.arena.round.'+arena.id;picker.value=localStorage.getItem(key)||String(all.at(-1).number);if(!picker.value)picker.value=String(all.at(-1).number);root.append(picker);
    const content=node('div');root.append(content);
    const populate=()=>{
      localStorage.setItem(key,picker.value);content.replaceChildren();const round=all.find(round=>round.number===Number(picker.value));
      if(!round.decision){content.append(node('p',round.number>1?'Thí sinh đi tiếp cải tiến sản phẩm theo phản hồi trước khi giám khảo chấm lại.':'Mỗi thí sinh hoàn thiện sản phẩm trước khi giám khảo chấm.'));return;}
      content.append(node('p',round.decision.summary));if(round.decision.tieBreak)content.append(node('p','Phân định bằng điểm: '+round.decision.tieBreak));
      const wrap=node('div',undefined,'arena-table-wrap'),table=node('table',undefined,'arena-scores'),head=node('thead'),header=node('tr');
      for(const title of ['Hạng','Sản phẩm',...rubric.map(row=>row.label+' / '+row.max),'Tổng / 100','Kết quả']){const th=node('th',title);th.scope='col';header.append(th);}head.append(header);table.append(head);const body=node('tbody');
      round.decision.ranking.forEach((score,index)=>{const row=node('tr'),candidate=arena.candidates.find(candidate=>candidate.id===score.candidateId);row.append(node('td',String(index+1)),node('th',candidate?.label||score.candidateId));for(const rule of rubric)row.append(node('td',String(score.criteria?.find(item=>item.id===rule.id)?.score??'—')));row.append(node('td',String(score.score)),node('td',round.outputIds.includes(score.candidateId)?'Đi tiếp':'Dừng thi'));row.dataset.advance=String(round.outputIds.includes(score.candidateId));body.append(row);
        const feedbackRow=node('tr'),cell=node('td');cell.colSpan=rubric.length+4;const feedback=detail(arena.id+'-round-'+round.number+'-'+score.candidateId,'Phản hồi · '+(candidate?.label||score.candidateId));feedback.append(node('p',score.feedback));for(const criterion of score.criteria||[]){const rule=rubric.find(item=>item.id===criterion.id);feedback.append(node('p',`${rule?.label||criterion.id}: ${criterion.reason}`));}for(const check of score.checks||[]){feedback.append(node('p',`${check.name} · ${check.status==='pass'?'Đạt':check.status}: ${check.evidence}`));for(const path of check.artifacts||[])feedback.append(node('code',path));}cell.append(feedback);feedbackRow.append(cell);body.append(feedbackRow);
      });table.append(body);wrap.append(table);content.append(wrap);
    };picker.onchange=populate;populate();
  }
  function history(arena,root){
    const words={created:'Lưu Arena',setup:'Bắt đầu khởi tạo',setup_completed:'Đã tạo Project và các chat',bootstrap_blocked:'Khởi tạo cần kiểm tra',start:'Bắt đầu',pause:'Tạm dừng',retry:'Chuẩn bị thử lại',cancel:'Hủy Arena',dispatch:'Giao lượt thực hiện',product_completed:'Sản phẩm hoàn chỉnh',product_revised:'Đã lưu bản cải tiến',round_completed:'Hoàn tất chấm vòng',finished:'Hoàn tất Arena',blocked:'Cần kiểm tra'};
    const list=node('ol',undefined,'arena-history');for(const item of [...(arena.history||[])].reverse()){const row=node('li'),candidate=arena.candidates.find(row=>row.id===item.candidateId);row.append(node('time',new Date(item.at).toLocaleString('vi-VN')),node('strong',words[item.type]||'Cập nhật Arena'));if(candidate)row.append(node('span',candidate.label));if(item.round)row.append(node('span','Vòng '+item.round));if(item.reason)row.append(node('p',reasons[item.reason]||item.reason));list.append(row);}if(!list.children.length)root.append(node('p','Chưa có lịch sử.'));root.append(list);
  }
  function render(){
    if(!data)return;readiness();
    const selector=$('arenaSelect'),choices=JSON.stringify(data.arenas.map(arena=>[arena.id,arena.title]));
    if(selector.dataset.choices!==choices){selector.replaceChildren();for(const arena of data.arenas){const option=node('option',arena.title);option.value=arena.id;selector.append(option);}selector.dataset.choices=choices;}
    if(!data.arenas.some(arena=>arena.id===selected))selected=data.arenas[0]?.id||'';selector.value=selected;selector.disabled=!data.arenas.length;$('arenaSelection').hidden=!data.arenas.length;
    const arena=current();$('arenaEmpty').hidden=!!arena;$('arenaWorkspace').hidden=!arena;if(!arena){if(!$('arenaEmpty').querySelector('.arena-world'))$('arenaEmpty').replaceChildren(arenaWorld(null,null,{visible:section.classList.contains('view-active')&&!document.hidden}));return;}
    const job=data.bootstraps.find(job=>job.arenaId===arena.id||job.id===arena.id);controls(arena,job);
    const next=JSON.stringify([arena,job,data.enabled,data.connected,[...pending],document.hidden]);if(signature===next)return;signature=next;
    const root=$('arenaContent'),scroll=root.scrollTop,focus=document.activeElement?.dataset.focus;for(const el of root.querySelectorAll('details[data-key]')){if(el.open)opened.add(el.dataset.key);else opened.delete(el.dataset.key);}
    $('arenaCurrentTitle').textContent=arena.title;$('arenaState').textContent=labels[arena.status]||arena.status;$('arenaReason').textContent=reasons[arena.reason||job?.reason]||arena.reason||job?.reason||'';$('arenaReason').hidden=!$('arenaReason').textContent;
    root.replaceChildren();const active=localStorage.getItem('umibridge.arena.tab.'+arena.id)||'live';
    for(const tab of section.querySelectorAll('[data-arena-tab]')){const selected=tab.dataset.arenaTab===active;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
    const activeTab=section.querySelector('[data-arena-tab][aria-selected="true"]');if(activeTab)root.setAttribute('aria-labelledby',activeTab.id);
    ({live,candidates,rounds,history}[active]||live)(arena,...(active==='live'?[job,root]:[root]));
    const health=node('div',undefined,'umi-arena-health'),running=arena.steps.filter(step=>['dispatching','running'].includes(step.status)),waiting=arena.steps.filter(step=>step.status==='queued'),blocked=arena.steps.filter(step=>step.status==='blocked'),verification=arena.steps.filter(step=>step.status==='reported_complete'),en=localStorage.getItem('umibridge.admin.language')!=='vi';
    for(const text of [en?`Active workers: ${running.length}`:`Worker đang chạy: ${running.length}`,en?`Queued sessions: ${waiting.length}`:`Phiên chờ: ${waiting.length}`,en?`Blocked: ${blocked.length}`:`Bị chặn: ${blocked.length}`,en?`Awaiting verification: ${verification.length}`:`Chờ kiểm chứng: ${verification.length}`])health.append(node('span',text));
    for(const step of [...running,...blocked])health.append(node('span',`${step.kind==='judge'?(en?'Judge':'Giám khảo'):step.candidateId} · ${step.workerHealth||step.reason||step.status}`));
    for(const step of verification)health.append(button((en?'Verify ':'Kiểm chứng ')+(step.kind==='judge'?(en?'judge':'giám khảo'):step.candidateId),async()=>{await window.umiVerifyArenaTask?.(arena,step);await load(true);}));
    root.prepend(health);root.scrollTop=scroll;if(focus)root.querySelector(`[data-focus="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
  }
  async function load(force=false){if(loading&&!force)return;loading=true;try{data=await api();render();}catch(cause){message(cause.message);}finally{loading=false;}}
  $('arenaSelect').onchange=()=>{selected=$('arenaSelect').value;seatPage=null;localStorage.setItem('umibridge.arena.selected',selected);signature='';render();};
  $('arenaRefresh').onclick=()=>load();$('arenaNew').onclick=()=>{$('arenaCreate').open=!$('arenaCreate').open;if($('arenaCreate').open)$('arenaIdea').focus();readiness();};
  $('arenaBrowse').onclick=()=>window.umiFolderDialog.open('arenaRoot','arenaBrowse','arenaFolderStatus');$('arenaCount').oninput=readiness;$('arenaRoot').oninput=()=>window.umiFolderDialog.remember($('arenaRoot'));
  window.addEventListener('umibridge-folder-dialog',event=>{if(event.detail.inputId==='arenaRoot'){folderOpen=event.detail.open;readiness();}});
  $('arenaEnabled').onclick=async()=>{if(!data||pending.has('settings'))return;pending.add('settings');readiness();try{await api('/settings',{enabled:!data.enabled});await load(true);}catch(cause){message(cause.message);}finally{pending.delete('settings');readiness();}};
  $('arenaForm').onsubmit=async event=>{
    event.preventDefault();if(sending||folderOpen||!data?.paired||!capable())return;
    const body={name:$('arenaName').value.trim(),idea:$('arenaIdea').value.trim(),parentRoot:$('arenaRoot').value.trim(),count:Number($('arenaCount').value),cleanupAfterDelivery:$('arenaCleanupAfterDelivery').checked,start:false},key=JSON.stringify(body);if(request?.signature!==key)request={signature:key,key:crypto.randomUUID()};
    sending=true;message();$('arenaForm').setAttribute('aria-busy','true');readiness();
    try{const arena=await api('/arenas',{...body,requestKey:request.key});selected=arena.id;localStorage.setItem('umibridge.arena.selected',selected);await load(true);$('arenaIdea').value='';$('arenaName').value='';request=null;$('arenaCreate').open=false;}
    catch(cause){if(cause.code==='project_folder_exists')request=null;message(cause.message);}
    finally{sending=false;$('arenaForm').setAttribute('aria-busy','false');readiness();}
  };
  const tabs=[...section.querySelectorAll('[data-arena-tab]')];for(const tab of tabs)tab.onclick=()=>{const arena=current();if(!arena)return;localStorage.setItem('umibridge.arena.tab.'+arena.id,tab.dataset.arenaTab);signature='';render();};
  $('arenaTabs').onkeydown=event=>{const index=tabs.indexOf(document.activeElement);if(index<0)return;const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;if(next>=0){event.preventDefault();tabs[next].click();tabs[next].focus();}};
  $('arenaConnect').onclick=()=>{$('arenaPairPanel').hidden=!$('arenaPairPanel').hidden;};
  $('arenaPair').onclick=async()=>{try{const result=await api('/browser/pair',{},true);$('arenaPairToken').value=result.token;$('arenaPairBox').hidden=false;await load();}catch(cause){message(cause.message);}};
  $('arenaCopyToken').onclick=()=>navigator.clipboard.writeText($('arenaPairToken').value).catch(()=>{$('arenaPairToken').select();message('Không chép được. Chọn ô mã rồi nhấn Ctrl+C.');});
  window.addEventListener('umibridge-view',()=>{signature='';if(section.classList.contains('view-active'))void load();else render();});document.addEventListener('visibilitychange',()=>{signature='';render();});
  setInterval(()=>{if(section.classList.contains('view-active')&&!document.hidden)void load();},2000);void load();
})();
