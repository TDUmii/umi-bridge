(() => {
  const $=id=>document.getElementById(id),dialog=$('corpFolderDialog');
  const preference='umibridge.projects.parentRoot';
  let target=null,listing=null,loadVersion=0;
  const node=(tag,text)=>{const element=document.createElement(tag);element.textContent=text;return element;};
  function remember(input){localStorage.setItem(preference,input.value.trim());}
  function initialize(inputId,defaultRoot=''){
    const input=$(inputId);if(!input||input.dataset.initialized)return;
    const saved=localStorage.getItem(preference)??localStorage.getItem('umibridge.corp.parentRoot');
    input.value=saved??defaultRoot;input.dataset.initialized='true';if(saved!==null)localStorage.setItem(preference,saved);
  }
  const notify=(open,inputId)=>window.dispatchEvent(new CustomEvent('umibridge-folder-dialog',{detail:{open,inputId}}));
  async function api(path){
    const response=await fetch('/admin/api/folders',{method:'POST',headers:{'Content-Type':'application/json','X-DC-Admin-Action':'1'},body:JSON.stringify({path})});
    const result=await response.json();if(!response.ok){const cause=Error(({folder_path_unavailable:'Không mở được thư mục. Kiểm tra đường dẫn và quyền truy cập.',invalid_parent_root:'Nhập đường dẫn thư mục tuyệt đối hợp lệ.'})[result.error]||result.error||'Không mở được thư mục.');cause.code=result.error;throw cause;}return result;
  }
  async function load(path,initial=false){
    const version=++loadVersion;listing=null;$('corpFolderError').hidden=true;$('corpFolderList').replaceChildren();$('corpFolderList').setAttribute('aria-busy','true');$('corpFolderEmpty').hidden=true;
    for(const id of ['corpFolderSelect','corpFolderUp','corpFolderOpen','corpFolderDrive'])$(id).disabled=true;
    $('corpFolderPath').value=path;$('corpFolderPath').readOnly=true;
    try{
      let result;
      try{result=await api(path);}
      catch(cause){if(version!==loadVersion||!target)return;if(!initial||!path||cause.code!=='folder_path_unavailable')throw cause;result=await api('');if(version!==loadVersion||!target)return;$('corpFolderError').textContent='Không mở được vị trí đã nhập. Chọn thư mục khác.';$('corpFolderError').hidden=false;}
      if(version!==loadVersion||!target)return;listing=result;$('corpFolderPath').value=result.path;$('corpFolderDrive').replaceChildren();
      for(const root of result.roots){const option=node('option',root.name);option.value=root.path;$('corpFolderDrive').append(option);}
      const drive=result.roots.find(root=>result.path.toLowerCase().startsWith(root.path.toLowerCase()));if(drive)$('corpFolderDrive').value=drive.path;
      for(const folder of result.folders){const entry=node('button',folder.name);entry.type='button';entry.className='btn small';entry.dataset.folderPath=folder.path;entry.onclick=()=>void load(folder.path);$('corpFolderList').append(entry);}
      $('corpFolderEmpty').textContent=result.truncated?'Chỉ hiện 500 thư mục. Nhập đường dẫn để mở vị trí khác.':!result.folders.length?'Không có thư mục con.':'';$('corpFolderEmpty').hidden=!$('corpFolderEmpty').textContent;
    }catch(cause){if(version!==loadVersion||!target)return;$('corpFolderError').textContent=cause.message;$('corpFolderError').hidden=false;}
    finally{if(version===loadVersion&&target){$('corpFolderList').setAttribute('aria-busy','false');$('corpFolderPath').readOnly=false;$('corpFolderOpen').disabled=false;$('corpFolderDrive').disabled=!$('corpFolderDrive').options.length;$('corpFolderSelect').disabled=!listing;$('corpFolderUp').disabled=!listing?.parentPath;}}
  }
  function close(){
    const previous=target;target=null;listing=null;loadVersion++;
    if(previous){previous.input.readOnly=previous.readOnly;previous.button.disabled=previous.disabled;notify(false,previous.input.id);if(previous.button.isConnected&&!previous.button.disabled)previous.button.focus();}
  }
  function open(inputId,buttonId,statusId){
    const input=$(inputId),button=$(buttonId);if(target||!input||!button||input.disabled||input.readOnly||button.disabled)return false;
    target={input,button,readOnly:input.readOnly,disabled:button.disabled};input.readOnly=true;button.disabled=true;if($(statusId))$(statusId).hidden=true;
    dialog.showModal();notify(true,inputId);void load(input.value.trim(),true);return true;
  }
  dialog.addEventListener('close',close);
  $('corpFolderCancel').onclick=()=>dialog.close();
  $('corpFolderNavigate').onsubmit=event=>{event.preventDefault();void load($('corpFolderPath').value.trim());};
  $('corpFolderPath').oninput=()=>{$('corpFolderSelect').disabled=!listing||$('corpFolderPath').value!==listing.path;};
  $('corpFolderDrive').onchange=()=>void load($('corpFolderDrive').value);
  $('corpFolderUp').onclick=()=>{if(listing?.parentPath)void load(listing.parentPath);};
  $('corpFolderSelect').onclick=()=>{if(!listing||!target||$('corpFolderPath').value!==listing.path)return;const input=target.input;input.value=listing.path;remember(input);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));dialog.close();};
  window.umiFolderDialog={open,initialize,remember};
})();
