import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

// Optional local upstream. Configuration is owner-controlled, never supplied by MCP callers.
export function createDesktopCommander({ stateDir }) {
  let client, transport, pending, catalog = [];
  let state = 'disabled';
  const allowed = new Set(['create_directory','edit_block','get_file_info','get_more_search_results','interact_with_process','list_directory','list_processes','list_searches','list_sessions','move_file','read_file','read_multiple_files','read_process_output','start_process','start_search','stop_search','force_terminate','kill_process','write_file','write_pdf']);
  async function connect() {
    if (client) return;
    if (pending) return pending;
    pending = (async () => {
      let config;
      try { config = JSON.parse(await readFile(join(stateDir, 'desktop-commander.json'), 'utf8')); }
      catch (error) { state = error.code === 'ENOENT' ? 'disabled' : 'invalid_config'; return; }
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
        catalog = result.tools.filter(tool => allowed.has(tool.name)).map(tool => ({...tool,name:'dc_'+tool.name,description:'Desktop Commander on this PC. '+(tool.description || '')}));
        client = next; state = 'ready';
        next.onclose = () => { client = undefined; catalog = []; state = 'disconnected'; };
      } catch { await next.close().catch(()=>{}); state = 'unavailable'; }
    })().finally(() => { pending = undefined; });
    return pending;
  }
  return {
    async listTools() { await connect(); return [{name:'dc_status',description:'Read the optional local Desktop Commander integration status. This is a file/terminal backend; Windows desktop input uses windows_* tools.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},...catalog]; },
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
