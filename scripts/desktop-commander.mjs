import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

// Bundled UmiBridge desktop tools, derived from MIT-licensed Desktop Commander.
export function createDesktopCommander({ stateDir }) {
  let client, transport, pending, catalog = [];
  let state = 'disabled';
  async function connect() {
    if (client) return;
    if (pending) return pending;
    pending = (async () => {
      let config;
      try { config = JSON.parse(await readFile(join(stateDir, 'desktop-commander.json'), 'utf8')); }
      catch (error) { if(error.code !== 'ENOENT'){state='invalid_config';return;} config={enabled:true}; }
      if (!config || typeof config !== 'object' || Array.isArray(config)) { state='invalid_config'; return; }
      config.entry=fileURLToPath(new URL('./vendor/desktop-tools/dist/index.js',import.meta.url));
      if (config.enabled !== true) { state = 'disabled'; return; }
      if (typeof config.entry !== 'string' || !isAbsolute(config.entry) || !config.entry.endsWith('.js') ||
          config.allowedDirectories !== undefined && (!Array.isArray(config.allowedDirectories) || !config.allowedDirectories.length || config.allowedDirectories.some(path => typeof path !== 'string' || !isAbsolute(path)))) { state = 'invalid_config'; return; }
      const directory = join(stateDir, 'desktop-commander');
      await mkdir(directory, { recursive: true });
      // Isolate upstream preferences and disable telemetry before the first startup.
      await writeFile(join(directory, 'config.json'), JSON.stringify({telemetryEnabled:false,allowedDirectories:config.allowedDirectories || [stateDir]}), {flag:'wx'}).catch(error => { if (error.code !== 'EEXIST') throw error; });
      transport = new StdioClientTransport({ command: process.execPath, args:[config.entry,'--no-onboarding'], env:{...getDefaultEnvironment(),UV_THREADPOOL_SIZE:'32',DESKTOP_COMMANDER_CONFIG_DIR:directory}, stderr:'pipe' });
      transport.stderr?.on('data', () => {});
      const next = new Client({name:'umibridge-desktop-commander',version:'1.0.0'});
      try {
        await next.connect(transport, {timeout:30000});
        const result = await next.listTools({}, {timeout:30000});
        catalog = result.tools.filter(tool => tool.name !== 'give_feedback_to_desktop_commander').map(tool => ({...tool,name:'dc_'+tool.name,description:'Desktop Commander on this PC. '+(tool.description || '')}));
        client = next; state = 'ready';
        const lost = () => { if(client===next){client=undefined;catalog=[];state='disconnected';} };
        next.onclose = lost;
        next.onerror = () => { lost(); void next.close().catch(()=>{}); };
      } catch { await next.close().catch(()=>{}); state = 'unavailable'; }
    })().finally(() => { pending = undefined; });
    return pending;
  }
  return {
    async listTools() { await connect(); return [{name:'dc_status',description:'Read UmiBridge bundled desktop tools status. No external Desktop Commander installation is required. Windows desktop input uses windows_* tools.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},...catalog]; },
    async callTool(name,args) {
      await connect();
      if (name === 'dc_status') return {content:[{type:'text',text:JSON.stringify({state,available:state==='ready',toolCount:catalog.length})}]};
      if (!client || !catalog.some(tool=>tool.name===name)) throw Error('desktop_commander_unavailable');
      // Never retry a side effect after transport failure.
      return client.callTool({name:name.slice(3),arguments:args},undefined,{timeout:60000});
    },
    async close() { await pending; await client?.close(); }
  };
}
