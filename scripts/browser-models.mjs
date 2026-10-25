// API existence is documented; actual web availability is supplied by the paired picker.
export const browserModels = ['GPT-6','GPT-5.6 Sol'];
export const browserEfforts = ['instant','low','medium','high','xhigh','max','ultra'];
export function modelCatalog(input) {
  if(!Array.isArray(input)||input.length>browserModels.length)throw Error('invalid_model_catalog');
  const rows=input.map(row=>{
    if(!browserModels.includes(row.model)||!Array.isArray(row.efforts)||!row.efforts.length||row.efforts.length>6||new Set(row.efforts).size!==row.efforts.length||row.efforts.some(item=>!browserEfforts.includes(item)))throw Error('invalid_model_catalog');
    return {model:row.model,efforts:[...row.efforts]};
  });
  if(new Set(rows.map(row=>row.model)).size!==rows.length)throw Error('invalid_model_catalog');
  return rows;
}
export function modelPreference(input,catalog) {
  if(input===null)return null;
  if(!input||!catalog.some(row=>row.model===input.model&&row.efforts.includes(input.effort)))throw Error('model_not_available');
  return {model:input.model,effort:input.effort};
}
