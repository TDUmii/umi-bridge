import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const valueOf = result => {
  if (result?.isError) throw Error('tool_probe_failed');
  const text = result?.content?.find(row => row.type === 'text')?.text;
  try { return JSON.parse(text); } catch { return text; }
};

/** Fixed probes only: never execute user-supplied arguments or desktop input. */
export function createToolHealth({ stateDir, readContext, callBackend, execution, orchestration, chrome, devices }) {
  let pending;
  async function check({ repair = false } = {}) {
    const { context } = await readContext(); // listing reconnects disconnected runtime workers
    const protectedMode = orchestration.settings().flags.workspaceLocksEnabled;
    const rows = context.tools.map(tool => ({ name: tool.name, group: tool.group,
      status: !tool.enabled ? 'disabled' : !tool.available ? 'blocked' : 'untested',
      detail: !tool.enabled ? 'Disabled by owner.' : !tool.available ? 'Unavailable in the current mode.' : 'Catalog available; action not executed.' }));
    const checks = [];
    const probe = async (name, run, retrySafe = true) => {
      const row = rows.find(item => item.name === name);
      if (!row || ['disabled', 'blocked'].includes(row.status)) return;
      let passed = false;
      for (let attempt = 0; attempt < (repair && retrySafe ? 2 : 1); attempt++) {
        try {
          if (attempt) await readContext();
          await run(); passed = true;
          row.status = attempt ? 'recovered' : 'passed'; row.detail = attempt ? 'Safe probe passed after reconnecting.' : 'Live probe passed.';
          break;
        } catch { row.status = 'failed'; row.detail = 'Live probe failed. Recheck runtime or connection.'; }
      }
      checks.push({ name, passed, recovered: row.status === 'recovered' });
    };
    const call = async (name, args = {}) => valueOf(await callBackend(name, args));
    let scratch, lease;
    try {
      scratch = await mkdtemp(join(stateDir, 'tool-check-'));
      if (protectedMode) {
        lease = await execution.issue({ root: scratch, taskId: randomUUID(), attemptId: randomUUID(),
          runId: 'tool-health', projectId: 'tool-health', workerId: randomUUID(), readScope: ['.'], writeScope: ['.'] });
        await probe('scope_write_file', () => execution.execute('scope_write_file', { scopeToken: lease.scopeToken, path: 'probe.txt', expectedHash: null, content: 'UMIBRIDGE_TOOL_CHECK' }), false);
        await probe('scope_read_file', async () => {
          const result = await execution.execute('scope_read_file', { scopeToken: lease.scopeToken, path: 'probe.txt' });
          if (result.text !== 'UMIBRIDGE_TOOL_CHECK') throw Error('readback_mismatch');
        });
        await probe('scope_list_directory', () => execution.execute('scope_list_directory', { scopeToken: lease.scopeToken, path: '.' }));
      } else {
        await probe('write_file', () => call('write_file', { path: join(scratch, 'probe.txt'), content: 'UMIBRIDGE_TOOL_CHECK' }), false);
        await probe('read_file', async () => {
          const result = await call('read_file', { path: join(scratch, 'probe.txt') });
          if (!JSON.stringify(result).includes('UMIBRIDGE_TOOL_CHECK')) throw Error('readback_mismatch');
        });
        await probe('list_directory', () => call('list_directory', { path: scratch, max_entries: 5 }));
        await probe('run_command', async () => {
          const command = process.platform === 'win32' ? "Write-Output 'UMIBRIDGE_TOOL_CHECK'" : "printf UMIBRIDGE_TOOL_CHECK";
          const result = await call('run_command', { command, cwd: scratch, timeout_ms: 5000 });
          if (result?.exit_code !== 0 || !result.stdout?.includes('UMIBRIDGE_TOOL_CHECK')) throw Error('command_probe_failed');
        });
        await probe('dc_get_usage_stats', () => call('dc_get_usage_stats'));
        await probe('windows_control_status', () => call('windows_control_status'));
      }
      await probe('dc_status', async () => { if (!(await call('dc_status'))?.available) throw Error('desktop_unavailable'); });
      await probe('windows_status', async () => { if (!(await call('windows_status'))?.available) throw Error('windows_unavailable'); });
      await probe('list_skills', () => call('list_skills'));
      await probe('list_devices', () => devices.listDevices());
      await probe('chrome_control', async () => { valueOf(await chrome.call({ action: 'tabs' })); });
    } finally {
      if (lease) await execution.release(lease.id, 'tool_health_complete');
      if (scratch) await rm(scratch, { recursive: true, force: true });
    }
    const required = protectedMode ? ['scope_read_file', 'scope_write_file', 'scope_list_directory', 'corp_task_details', 'corp_submit_result'] : ['read_file', 'write_file', 'list_directory'];
    const missing = required.filter(name => !context.tools.some(tool => tool.name === name && tool.enabled && tool.available));
    const order = { failed: 0, recovered: 1, passed: 2, disabled: 3, blocked: 4, untested: 5 };
    return { checkedAt: new Date().toISOString(), protectedMode, repair, checks, tools: rows.sort((a,b) => order[a.status] - order[b.status]),
      summary: { passed: checks.filter(row => row.passed).length, failed: checks.filter(row => !row.passed).length,
        recovered: checks.filter(row => row.recovered).length, untested: rows.filter(row => row.status === 'untested').length },
      corp: { ready: missing.length === 0, missing, requiredTools: required },
      guidance: protectedMode
        ? 'Workspace protection is on. Corp uses scope_* tools; global file, shell and desktop tools are blocked. If ChatGPT cannot see scope_* tools, refresh the UmiBridge connection in ChatGPT and reopen the chat.'
        : 'If a tool works here but is missing in ChatGPT, refresh the UmiBridge connection in ChatGPT and reopen the chat.' };
  }
  return { run(options) {
    if (pending) return pending;
    pending = check(options).finally(() => { pending = undefined; });
    return pending;
  } };
}
