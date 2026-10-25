(() => {
  const $=id=>document.getElementById(id);let data=null,last='',busy=false;
  const labels={low:'Low - nhẹ',medium:'Medium - vừa',high:'High - cao',xhigh:'Extra High - chuyên sâu',max:'Max',ultra:'Ultra'};
  async function api(body){const response=await fetch('/admin/api/corp'+(body?'/settings':''),body?{method:'POST',headers:{'Content-Type':'application/json','X-DC-Admin-Action':'1'},body:JSON.stringify(body)}:{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error==='model_not_available'?'Lựa chọn chưa được xác minh trên ChatGPT. Quét lại danh sách.':result.error);return result;}
  function efforts(value){const select=$('settingsReasoning'),saved=value||select.value;select.replaceChildren();for(const effort of data.modelCatalog?.find(row=>row.model===$('settingsChatModel').value)?.efforts||[])select.add(new Option(labels[effort]||effort,effort));if([...select.options].some(row=>row.value===saved))select.value=saved;select.disabled=!$('settingsChatModel').value;}
  async function load(){
    if(location.hash!=='#settings'||busy)return;
    try{data=await api();const signature=JSON.stringify([data.modelCatalog,data.modelPreference]);
      if(last!==signature){const model=$('settingsChatModel');model.replaceChildren(new Option('Giữ lựa chọn hiện tại trên ChatGPT',''));for(const row of data.modelCatalog||[])model.add(new Option(row.model,row.model));model.value=data.modelPreference?.model||'';efforts(data.modelPreference?.effort);last=signature;}
      const old=!data.extensionVersion||Number(data.extensionVersion.split('.')[1])<5&&Number(data.extensionVersion.split('.')[0])===0;
      const pending=data.modelScan?.status==='pending'&&Date.now()-new Date(data.modelScan.at).valueOf()<120000;
      $('settingsModelScan').disabled=old||pending;
      $('settingsModelStatus').textContent=old?'Cần nạp lại extension 0.5.0 và tab ChatGPT.':pending?'Đang quét. Mở tab ChatGPT ở chế độ Công việc, giữ ô nhập trống.':data.modelScan?.status==='error'?'Không đọc được model picker. Mở tab Công việc với ô nhập trống rồi quét lại.':data.modelCatalog?.length?'Đã đọc '+data.modelCatalog.length+' model từ web · '+new Date(data.modelScan.at).toLocaleString('vi-VN'): 'Mở tab ChatGPT ở chế độ Công việc rồi quét danh sách.';
    }catch(error){$('settingsModelStatus').textContent=error.message;}
  }
  $('settingsChatModel').onchange=()=>efforts();
  $('settingsModelScan').onclick=async()=>{busy=true;try{await api({scanModels:true});}catch(error){$('settingsModelStatus').textContent=error.message;}finally{busy=false;await load();}};
  $('settingsModelForm').onsubmit=async event=>{event.preventDefault();busy=true;try{await api({modelPreference:$('settingsChatModel').value?{model:$('settingsChatModel').value,effort:$('settingsReasoning').value}:null});last='';$('settingsModelSaved').textContent='Đã lưu. Áp dụng cho lượt gửi mới của Corp và Arena.';}catch(error){$('settingsModelSaved').textContent=error.message;}finally{busy=false;await load();}};
  window.addEventListener('hashchange',load);setInterval(load,3000);void load();
})();
