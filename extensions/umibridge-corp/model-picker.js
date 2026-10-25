/* Reads and operates public composer controls only. No cookies, private APIs or account tokens. */
(() => {
  const models=['GPT-6','GPT-5.6 Sol'];
  const visible=e=>!!e?.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
  const toggle=()=>[...document.querySelectorAll('button')].find(e=>visible(e)&&/^(Chọn mô hình ChatGPT|Choose model|Choose ChatGPT model|Select model)$/i.test(e.getAttribute('aria-label')||''));
  const view=()=>document.querySelector('[data-model-picker-view-toggle]');
  const rail=()=>document.querySelector('[data-reasoning-slider]');
  const slider=()=>rail()?.querySelector('[role="slider"]');
  const selected=()=>[...document.querySelectorAll('[data-model-selected="true"]')].find(e=>models.includes(e.textContent.trim()))?.textContent.trim();
  function effort(){
    const text=(view()?.querySelector('[data-effort-only]')?.textContent||view()?.textContent||'').replace(selected()||'','').trim().toLowerCase();
    return /tức thì|instant/.test(text)?'instant':/ultra/.test(text)?'ultra':/^max$/.test(text)?'max':/chuyên sâu|extra high/.test(text)?'xhigh':/^(cao|high)$/.test(text)?'high':/trung bình|vừa|medium/.test(text)?'medium':/nhẹ|light|low/.test(text)?'low':null;
  }
  async function open(){let button=toggle();for(let i=0;!button&&i<100;i++){await pause();button=toggle();}if(!button)throw Error('model_picker_missing');if(button.getAttribute('aria-expanded')!=='true'){button.click();await pause();}if(!view())throw Error('model_picker_missing');}
  async function close(){const button=toggle();if(button?.getAttribute('aria-expanded')==='true'){button.click();await pause();}}
  async function ensureChat(){
    const chat=()=>[...document.querySelectorAll('button[aria-pressed]')].find(e=>visible(e)&&/^(Trò chuyện|Chat)$/i.test(e.textContent.trim()));
    let control=chat();
    if(control){if(control.getAttribute('aria-pressed')!=='true'){await close();control.click();await pause();control=chat();}if(control?.getAttribute('aria-pressed')!=='true')throw Error('chat_mode_unconfirmed');return;}
    try{await open();view().click();await pause();const choices=[...document.querySelectorAll('[role="menuitemradio"]')].filter(visible),names=choices.map(e=>e.textContent.trim());if(!names.length||names.some(name=>!models.includes(name)))throw Error('chat_mode_unconfirmed');const item=choices.find(e=>e.getAttribute('aria-checked')==='true');if(!item)throw Error('chat_mode_unconfirmed');item.click();await pause();}finally{await close();}
  }
  async function choose(model){
    await open();if(![...document.querySelectorAll('[role="menuitemradio"]')].some(visible)){view().click();await pause();}
    const item=[...document.querySelectorAll('[role="menuitemradio"]')].find(e=>visible(e)&&e.textContent.trim()===model);
    if(!item||item.getAttribute('aria-disabled')==='true'||item.hasAttribute('disabled'))throw Error('model_not_available');
    item.click();await pause();if(selected()!==model)throw Error('model_selection_unconfirmed');
  }
  async function position(target){
    const control=rail(),thumb=slider();if(!control||!thumb||control.getAttribute('aria-disabled')==='true')throw Error('reasoning_picker_missing');
    for(let i=0;i<7&&Number(slider()?.getAttribute('aria-valuenow'))!==target;i++){
      const key=Number(slider()?.getAttribute('aria-valuenow'))<target?'ArrowRight':'ArrowLeft';
      control.focus();control.dispatchEvent(new KeyboardEvent('keydown',{key,code:key,bubbles:true}));await pause();
    }
    if(Number(slider()?.getAttribute('aria-valuenow'))!==target)throw Error('reasoning_selection_unconfirmed');
  }
  async function levels(){
    const min=Number(slider()?.getAttribute('aria-valuemin')),max=Number(slider()?.getAttribute('aria-valuemax'));
    if(!slider()||min!==0||max<1||max>5)throw Error('reasoning_picker_missing');
    const values=[];for(let index=0;index<=max;index++){await position(index);const value=effort();if(!value||values.includes(value))throw Error('reasoning_picker_unknown');values.push(value);}return values;
  }
  async function scan(){
    await ensureChat();await open();const original={model:selected(),index:Number(slider()?.getAttribute('aria-valuenow'))};if(!original.model)throw Error('model_selection_unconfirmed');
    const result=[];
    try {for(const model of models){try{await choose(model);result.push({model,efforts:await levels()});}catch{/* Unavailable/locked choices never enter the catalog. */}}if(!result.length)throw Error('model_picker_unknown');return result;}
    finally{await choose(original.model);await position(original.index);await close();}
  }
  async function apply(preference){
    if(!preference)return;
    try{await open();if(selected()===preference.model&&effort()===preference.effort)return;if(selected()!==preference.model)await choose(preference.model);if(effort()===preference.effort)return;const values=await levels(),index=values.indexOf(preference.effort);if(index<0)throw Error('reasoning_not_available');await position(index);if(selected()!==preference.model||effort()!==preference.effort)throw Error('model_selection_unconfirmed');}
    finally{await close();}
  }
  async function verify(preference){
    if(!preference)return true;
    try{await open();return selected()===preference.model&&effort()===preference.effort;}finally{await close();}
  }
  globalThis.UmiModelPicker={scan,apply,verify,ensureChat};
})();
