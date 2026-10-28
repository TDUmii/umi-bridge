import { readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDesktopCommander } from './desktop-commander.mjs';
import { createWindowsTools } from './windows-tools.mjs';
import { createCommandSession } from './command-session.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const stateDir=join(root,'.local-data');
await mkdir(stateDir,{recursive:true});
const scratch=await mkdtemp(join(stateDir,'setup-check-'));
const desktop=createDesktopCommander({stateDir,timeoutMs:300000}),windows=createWindowsTools({root}),shell=createCommandSession({cwd:scratch});
const marker='UMIBRIDGE_SETUP_CHECK',checks=[];
const reportFile=join(stateDir,'setup-check.json');
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
function checked(result){if(result?.isError)throw Error('Tool returned an error');return result;}
async function probe(name,label,run){
  await writeFile(join(stateDir,'startup-progress.json'),JSON.stringify({state:'starting',step:label}));
  try{await run();checks.push({name,passed:true});console.log('PASS '+name);}
  catch(error){checks.push({name,passed:false});throw Error('Setup verification failed: '+name,{cause:error});}
}
try{
  await probe('pdf_browser','Đang cài trình kết xuất PDF riêng cho UmiBridge...',async()=>{
    const {install,Browser,detectBrowserPlatform}=await import('@puppeteer/browsers');
    const {PUPPETEER_REVISIONS}=await import('puppeteer');
    await install({browser:Browser.CHROME,buildId:PUPPETEER_REVISIONS.chrome,platform:detectBrowserPlatform(),cacheDir:join(stateDir,'desktop-commander','puppeteer-cache')});
  });
  await probe('desktop_runtime','Đang khởi động và kiểm tra runtime desktop...',async()=>{
    const tools=await desktop.listTools();if(!tools.some(tool=>tool.name==='dc_write_file'))throw Error('Missing desktop tools');
  });
  const call=async(name,args)=>checked(await desktop.callTool(name,args));
  const file=join(scratch,'probe.txt');
  await probe('desktop_files','Đang thử ghi và đọc lại tệp...',async()=>{
    await call('dc_write_file',{path:file,content:marker});
    if(!JSON.stringify(await call('dc_read_file',{path:file})).includes(marker))throw Error('Readback mismatch');
  });
  await probe('powershell','Đang thử terminal PowerShell...',async()=>{
    const result=await shell.run("Write-Output '"+marker+"'",scratch,5000);
    if(result.exit_code!==0||!result.stdout?.includes(marker))throw Error('PowerShell probe failed');
  });
  await probe('desktop_terminal','Đang thử terminal tích hợp...',async()=>{
    const result=await call('dc_start_process',{command:"Write-Output '"+marker+"'",timeout_ms:10000});
    if(!JSON.stringify(result).includes(marker))throw Error('Desktop terminal probe failed');
  });
  await probe('search','Đang thử bộ máy tìm kiếm tệp...',async()=>{
    const {rgPath}=await import('@vscode/ripgrep');await stat(rgPath);
    await call('dc_start_search',{path:scratch,pattern:'probe.txt',searchType:'files',timeout_ms:5000});
  });
  await probe('pdf','Đang chuẩn bị trình kết xuất và thử tạo PDF...',async()=>{
    const path=join(scratch,'probe.pdf');
    await call('dc_write_pdf',{path,content:'# UmiBridge setup check\n\n'+marker});
    const pdf=await readFile(path);if(pdf.length<100||pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF');
  });
  await probe('windows_runtime','Đang khởi động công cụ điều khiển Windows...',async()=>{
    const tools=await windows.listTools();if(!['windows_click','windows_type','windows_screenshot'].every(name=>tools.some(tool=>tool.name===name)))throw Error('Missing Windows tools');
    checked(await windows.callTool('windows_control_status',{}));
  });
  await writeFile(reportFile,JSON.stringify({version,checkedAt:new Date().toISOString(),passed:true,checks},null,2));
  console.log('All setup probes passed.');
}catch(error){
  await writeFile(reportFile,JSON.stringify({version,checkedAt:new Date().toISOString(),passed:false,checks},null,2));
  await writeFile(join(stateDir,'startup-progress.json'),JSON.stringify({state:'error',step:error.message}));
  console.error(error.message);process.exitCode=1;
}finally{
  await Promise.allSettled([desktop.close(),windows.close(),shell.close()]);
  await rm(scratch,{recursive:true,force:true});
}
