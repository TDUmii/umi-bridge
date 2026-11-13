import {randomUUID} from 'node:crypto';
import {directTerminalRequest} from './terminal-routes.mjs';

const fixtureHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UmiBridge background test</title><link rel="stylesheet" href="/admin/browser-sessions.css"></head><body class="browser-fixture"><main><h1>UmiBridge background test</h1><p>This local page belongs to the two-tab test. No account or external website is used.</p><label for="demoInput">Test input</label><input id="demoInput" autocomplete="off"><button id="demoCommit" type="button">Confirm input</button><output id="demoResult">Waiting for the test</output><p id="demoReceipt" aria-live="polite"></p><div class="browser-fixture-space" aria-hidden="true"></div><p>End of test page</p></main><script src="/admin/chrome/fixture.js"></script></body></html>`;
const fixtureJS = `(()=>{let value='',trusted=false;const receipt=()=>document.getElementById('demoReceipt').textContent='UMI_RECEIPT '+value+' trusted='+trusted+' scroll='+Math.round(scrollY);document.getElementById('demoCommit').onclick=e=>{value=document.getElementById('demoInput').value;trusted=e.isTrusted;document.getElementById('demoResult').textContent=value;receipt();};addEventListener('scroll',receipt);setTimeout(()=>{const ready=document.createElement('p');ready.id='demoReady';ready.textContent='Ready';document.querySelector('main').prepend(ready);},1800);})();`;

function payload(result) {
  const text = result?.content?.find(row => row.type === 'text')?.text || '{}';
  if (result?.isError) throw Error(text);
  return JSON.parse(text);
}

// The demo can operate only its own disposable local pages. GET never runs actions.
export function registerBrowserSessionRoutes(app, {bridge, localAdmin, adminWrite, json, handler}) {
  const inheritedAdmin=localAdmin;localAdmin=(req,res,next)=>directTerminalRequest(req,res,()=>inheritedAdmin(req,res,next));
  let demo = null;
  const publicDemo = () => demo ? {
    id:demo.id,status:demo.status,startedAt:demo.startedAt,completedAt:demo.completedAt,
    maxInFlight:demo.maxInFlight,checks:demo.checks,error:demo.error,
    tabs:demo.tabs.map(({tabId,sessionId,lane,status})=>({tabId,sessionId,lane,status})),
  } : null;
  app.get('/admin/api/chrome/sessions', localAdmin, (_req,res)=>res.set('Cache-Control','no-store').json({...bridge.snapshot(),demo:publicDemo()}));
  app.post('/admin/api/chrome/sessions/:action', localAdmin, adminWrite, json, handler(req=>bridge.sessionAction(req.params.action,req.body??{})));
  app.get('/admin/chrome/fixture', localAdmin, (_req,res)=>res.set({'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'"}).type('html').send(fixtureHTML));
  app.get('/admin/chrome/fixture.js', localAdmin, (_req,res)=>res.set('Cache-Control','no-store').type('js').send(fixtureJS));

  async function runDemo(run) {
    let lastFocusSample=null;
    run.focusSamples=0;run.focusChanged=false;run.initialFocus=null;
    const sample=()=>{
      const instance=bridge.snapshot().instances.find(row=>row.instanceId===run.instanceId),focus=instance?.focus;
      if(!instance?.online||!Number.isFinite(instance.lastSeen)||!Number.isSafeInteger(focus?.activeTabId)||!Number.isSafeInteger(focus?.windowId)||typeof focus.windowFocused!=='boolean')return null;
      if(!lastFocusSample||instance.lastSeen>lastFocusSample.lastSeen){
        lastFocusSample={lastSeen:instance.lastSeen,focus:{...focus}};run.focusSamples++;
        if(run.initialFocus&&(focus.activeTabId!==run.initialFocus.activeTabId||focus.windowId!==run.initialFocus.windowId||focus.windowFocused!==run.initialFocus.windowFocused))run.focusChanged=true;
      }
      return lastFocusSample;
    };
    // Capture the original tab before opening anything; later telemetry cannot replace a missing baseline.
    run.initialFocus=sample()?.focus??null;
    const inFlight=()=>{const owned=new Set(run.tabs.map(row=>row.sessionId).filter(Boolean));return bridge.snapshot().jobs.filter(row=>owned.has(row.sessionId)&&(row.status==='running'||row.status==='sent')).length;};
    const call = async args => {
      const response=await bridge.call({instance_id:run.instanceId,...args});
      if(response?.isError&&args.action==='open'){
        let partial=response.structuredContent;
        try {partial??=JSON.parse(response.content?.find(row=>row.type==='text')?.text||'{}');} catch {}
        if(partial?.result?.created&&Number.isSafeInteger(partial.result.id))run.tabs.push({tabId:partial.result.id,sessionId:null,lane:Number(new URL(args.url).searchParams.get('lane')),url:args.url,status:'failed'});
      }
      const result = payload(response);
      run.lastActionCompletedAt=Date.now();
      sample();
      run.maxInFlight = Math.max(run.maxInFlight,inFlight());
      return result;
    };
    try {
      // Open serially so cancellation never loses track of an owned page.
      for (let lane=1;lane<=2;lane++) {
        const url=run.url+'&lane='+lane;
        const result = await call({action:'open',url});
        const tabId = result.id;
        if(!Number.isSafeInteger(tabId))throw Error('Demo tab was not confirmed.');
        const row={tabId,sessionId:null,lane,url,status:'running'};run.tabs.push(row);
        const session=bridge.sessionAction('create',{instanceId:run.instanceId,tabId,origin:run.origin});
        row.sessionId=session.sessionId;
      }
      const timer=setInterval(()=>{run.maxInFlight=Math.max(run.maxInFlight,inFlight());sample();},50);
      try {
        const results=await Promise.allSettled(run.tabs.map(async row=>{
          const act=args=>call({session_id:row.sessionId,...args});
          await act({action:'wait',wait_for:{selector:'#demoReady',state:'visible'},wait_timeout_ms:8000});
          const value='umi-'+run.id.slice(0,8)+'-'+row.lane;
          await act({action:'type',selector:'#demoInput',text:value});
          await act({action:'click',selector:'#demoCommit',wait_for:{selector:'#demoResult',text:value},wait_timeout_ms:4000});
          const scrolled=await act({action:'scroll',y:650});
          if(!Number.isFinite(scrolled.scrollY)||scrolled.scrollY<600)throw Error('The page did not confirm the expected scroll position.');
          const read=await act({action:'read'});
          if(!String(read.text).includes('UMI_RECEIPT '+value+' trusted=true'))throw Error('The page did not confirm the expected input and trusted click.');
          row.status='passed';
        }));
        const failures=results.filter(row=>row.status==='rejected');
        if(failures.length)throw Error(failures[0].reason?.message||'Demo action failed.');
      } finally {clearInterval(timer);}
      let foregroundUnchanged=null;
      if(run.initialFocus){
        const deadline=Date.now()+2500;
        while(true){
          const observed=sample();
          if(run.focusChanged){foregroundUnchanged=false;break;}
          if(observed&&observed.lastSeen>run.lastActionCompletedAt){foregroundUnchanged=true;break;}
          const remaining=deadline-Date.now();if(remaining<=0)break;
          await new Promise(resolve=>setTimeout(resolve,Math.min(50,remaining)));
        }
      }
      run.checks={tabs:run.tabs.length,input:true,trustedClick:true,scroll:true,read:true,parallel:run.maxInFlight>=2,foregroundUnchanged};
      run.status=foregroundUnchanged===false?'failed':run.checks.parallel&&foregroundUnchanged===true?'passed':'partial';
      if(foregroundUnchanged===false)run.error='The foreground tab or window changed during the two-tab test.';
    } catch {run.status='failed';run.error='The two-tab test did not complete. Inspect the test tabs and session status before trying again.';}
    finally {run.completedAt=new Date().toISOString();}
  }
  app.post('/admin/api/chrome/demo',localAdmin,adminWrite,json,handler(req=>{
    if(demo?.status==='running')throw Error('A browser demo is already running.');
    if(demo?.tabs.length)throw Error('Close the previous demo tabs before starting another test.');
    const candidates=bridge.snapshot().instances.filter(row=>row.online&&row.enabled&&row.protocol>=2&&row.capabilities?.background&&row.capabilities?.sessionBinding);
    const instance=req.body?.instanceId?candidates.find(row=>row.instanceId===req.body.instanceId):candidates.length===1?candidates[0]:null;
    if(!instance)throw Error('Select a connected, updated Chrome extension with Browser control enabled.');
    if(bridge.snapshot().concurrency<2)throw Error('Set parallel tabs to 2 or more before running the demo.');
    const origin=new URL('http://'+req.get('host')).origin,id=randomUUID();
    demo={id,instanceId:instance.instanceId,origin,url:origin+'/admin/chrome/fixture?run='+id,status:'running',startedAt:new Date().toISOString(),tabs:[],maxInFlight:0,checks:null,error:null,completedAt:null};
    void runDemo(demo);
    return publicDemo();
  }));
  app.post('/admin/api/chrome/demo/close',localAdmin,adminWrite,json,handler(async()=>{
    if(demo?.status==='running')throw Error('Wait for the browser test to finish before closing its tabs.');
    if(!demo)return {closed:0};
    let closed=0;
    for(const row of [...demo.tabs]){
      try {
        // Never close a tab which the owner navigated away from this test.
        payload(await bridge.call({instance_id:demo.instanceId,tab_id:row.tabId,action:'wait',wait_for:{url:row.url},wait_timeout_ms:1}));
        {
          if(row.sessionId)bridge.sessionAction('stop',{sessionId:row.sessionId});
          payload(await bridge.call({instance_id:demo.instanceId,tab_id:row.tabId,action:'close',expected_url:row.url}));closed++;
        }
        if(row.sessionId)bridge.sessionAction('stop',{sessionId:row.sessionId});
        demo.tabs=demo.tabs.filter(item=>item!==row);
      }catch{ /* Keep unresolved tabs listed for explicit inspection and another close attempt. */ }
    }
    return {closed,remaining:demo.tabs.length};
  }));
}
