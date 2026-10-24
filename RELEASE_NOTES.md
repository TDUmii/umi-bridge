# UmiBridge Sakura Console - beta.24

## Compact console and usage management

The desktop dashboard uses a compact graphite/jade layout. Corp keeps its animated office and queue side by side at desktop and laptop widths, with task creation and extension pairing opened on demand. Queue filters separate active and finished runs. Switching sections now updates office visibility immediately.

Usage adds Today/24h/7d/30d/60d/all-time filters, application/tool/status/search filters, input/output totals, time-series bars, breakdowns, paginated request details and current-page CSV export. MCP totals scan the complete retained journal, including records beyond the latest 500. Day boundaries follow the browser's UTC offset. Provider model, cache, reasoning, remaining account quota and billing data stay explicitly unavailable.

Corp records token estimates only for confirmed sends, by unique attempt, and counts the observed response after completion. Duplicate reports do not add duplicate usage. Numeric usage survives restart and deleting finished runs; the latest 5,000 Corp attempts are retained. Partial results remain marked as partial. No historic chat totals are invented. Both sources use offline o200k_base counts and may overlap in content; combined totals are not a provider bill.

The quota tab displays observed Corp reset notices/deadlines and auto-resume state. Optional user-entered per-million input/output rates and a budget for the selected period are saved only in that browser. Cost and budget warnings are references, do not change provider billing, and do not automatically stop work. CSV exports omit prompt/response/argument bodies and protect spreadsheet formula prefixes.

Validation: 92 Windows regression checks passed. Focused analytics tests cover complete-journal totals, local-midnight boundaries, pagination, missing estimates, privacy and independent MCP/Corp sources. Browser QA uses a real Edge extension with synthetic ChatGPT pages and disposable gateway state; it checks dispatch, handoff, simulated reset/resume, draft preservation, streaming completion, desktop/laptop layouts and usage filters/export/budget. Physical scope is one Windows machine. Real provider reset waits and live Chrome dispatch require separate verification; simulated QA does not certify those paths.

## Previous beta.23


## Corp chat coordination and Pixel Office

Corp now lives inside UmiBridge. Users register existing ChatGPT conversations, define an ordered sequence of tasks, explicitly start it and hand each completed response to the next selected chat. A locally paired Chrome/Edge extension performs browser sends and observations. The optional Pixel Agents office reflects queue states and real handoff events, with remembered visibility and reduced motion.

Provider UI quota notices such as `in 2h 11m`, `in 2h 29min` and `2h 37m` become durable absolute deadlines with a 15-second buffer. With auto-resume enabled, the same task resumes in the same chat after rechecking the provider UI. Closing the browser or sleeping the PC retains pending work; it does not wake the machine. Unknown reset times and ambiguous sends stop for manual reconciliation. No account/model switching or limit bypass is used.

Local-admin/CSRF guards protect setup and task writes. The extension receives a separate revocable credential, never the MCP connection secret. Original drafts are preserved, duplicate submissions are reconciled by task markers, and uncertain sends are not automatically replayed. Corp private state participates in the existing Normal/Admin migration and digest checks. The MIT sprite license and pinned asset provenance ship with the source.

Validation: 91 local regression tests passed; subsequent focused runtime/migration checks passed. A real Edge extension connected to a disposable gateway and synthetic ChatGPT DOM pages verified dispatch once, result handoff, quota waiting, automatic reset resume, draft preservation, toggles and desktop/laptop layouts. Only the current Windows machine was tested. Provider quota reset was simulated; this does not certify a real 2-3 hour provider wait or every ChatGPT DOM variation. No mobile delivery is included.

Read `docs/CORP.vi.md` for extension pairing, task controls, recovery and limits. Existing Administrator installations must authorize the protected update through the normal Windows lifecycle.

## Previous beta.22

## Post-release acceptance, 2026-10-24

The actual ChatGPT web connector reached the running beta.22 Administrator gateway and displayed `ELEVATED=True`, exit code 0 and no timeout. Two web conversations used the same connector with unmixed command results. Two separate local Agent CLI/PowerShell workers also completed concurrent submissions with distinct job IDs and matching proof files. New regression coverage checks simultaneous workflow writers and concurrent device routing.

Two initial plugin-mentioned web replies failed to render after successful gateway execution. One conversation recovered by asking for the already received result without another tool call; this remains an observed web-client limitation, not a claimed runtime fix. Testing is limited to one Windows machine as requested, and project/chat grouping is not per-person authorization. See [acceptance evidence and limits](docs/ACCEPTANCE.vi.md).

This documentation/test closeout leaves the beta.22 runtime tag and source ZIP unchanged.

## Manual workflow ledger

Adds an opt-in local JSONL ledger and a Workflows view for user-level project, task and handoff tracking. The feature stays off unless `UMIBRIDGE_WORKFLOWS=1` or the local profile contains the empty `.local-data/profile/workflows-enabled` marker. The marker persists through the standard Normal/Admin lifecycle, so protected tasks do not need inherited environment access. An explicit `workflowEnabled: false` still disables workflows for the caller. Enabled workflow routes and the dashboard section remain loopback/local-admin only. Creation, status changes, pause/resume, job linking, import and export require the existing `x-dc-admin-action` CSRF barrier.

Workflows use the approved `queued -> running -> waiting/review/blocked/paused -> running or done`, `done -> archived`, and terminal `cancelled` state model. A workflow may reference multiple request IDs and at most one active job. Linking an existing job is manual and idempotent by opaque dispatch key. Commands execute through the existing MCP/device relay; this ledger key does not deduplicate another MCP command submission. Gateway restart recovery moves a running record to `waiting` with `gateway_restart` and never resends a prompt. Imports also move active records to `waiting` with `import_requires_resume`, so restored work always requires an explicit resume. The ledger bounds opaque keys, accepts only metadata SHA-256 baseline hashes, redacts URL/token/secret-like values, ignores only malformed journal tails, and keeps request/job execution stores unchanged.

The native Normal/Admin lifecycle includes `workflows.jsonl` in production state copying and migration digest verification, while QA directories, screenshots and diagnostics stay excluded.

The protected runtime validator also handles a missing compiler TEMP directory during the state migration. Ordinary directories still pass through the existing ACL checks; the exact compiler-directory exception retains its descriptor, location, reparse-point and empty-directory guards.

Validation includes the build, local regression suite, focused ledger/gateway/UI tests, diff checks, and source privacy inspection. Profile opt-in tests use real gateways and cover the default, marker, environment, explicit disable and separate profiles. Normal launches stay disabled without explicit opt-in; no heartbeat or automatic checking is created.

## Previous beta.21

## Remembered Windows privilege mode

Settings separates the gateway's actual privileges from its saved startup mode. Normal privileges remain the default. Switching to Administrator invokes native Windows authorization; the dashboard accepts only the requested mode and never accepts credentials. An authorized protected installation and on-demand interactive scheduled task preserve the selected mode for subsequent launches through the existing `UmiBridge.cmd`. Disabling that mode returns through native authorization and migrates private state with the original medium token.

The protected copy uses administrator/SYSTEM ownership, read/execute access for the original account, owner-rights restrictions for newly created state, a same-account task principal, protected runtime paths and a cleaned worker environment. Source updates are not executed automatically by the elevated task. URL, OAuth, tool/skill choices and request history are retained. Privilege changes are local-only, guarded against CSRF, limited to a mode enum and serialized by the native lifecycle; pending and reconnect states preserve the open dashboard view.

The Windows task uses an internal protected GUI host to start the hidden worker. Native requests from the dashboard leave the gateway process tree through Explorer before requesting authorization, so a gateway restart cannot terminate its own mode transition. Native PowerShell execution is regression tested against a successful exit that previously skipped the requested script under `DETACHED_PROCESS`. The runtime validator recognizes only the exact Administrators-only descriptor of an empty native compiler directory directly under protected TEMP; ordinary code and state ACL checks remain strict.

Validation: syntax build and all 62 Windows regression checks passed. Native testing verified a real same-account highest-privilege task, ordinary-token modification denials, elevated command stdout/stderr/exit code, restart with the exact compiler-directory fixture, authorized disable and medium-token restoration. Live dashboard buttons completed both mode changes, and the real ChatGPT connector reconnected with Administrator privileges. Saved URL, connection secret and tool/skill/project selections were retained. Browser checks covered actual privilege states and the existing desktop/mobile, English/Vietnamese, light/dark controls. The test machine's existing UAC policy authorizes RunAs automatically; no password prompt was displayed or policy changed. Cancellation is covered by controlled regression tests.

## Previous beta.20

## Tools, commands and skill access

The Tools page manages named MCP tools with search, groups and individual switches. The server filters disabled tools and rejects stale calls, including the matching linked-device operation, while retaining existing OAuth grants and the saved tunnel. Choices are persisted in private local state.

Automatic MCP guidance describes the enabled tools and skills during connection and refreshes the context after selection changes. Later results carry a compact skill reminder so fresh chats sharing an OAuth client still receive the selection. The dashboard previews the full guidance. Enabled skills are used when relevant and read before applying; their scripts are never executed automatically. This is MCP context rather than an override of ChatGPT system instructions or approval rules. PowerShell access remains broad operating-system access, not a filesystem sandbox.

The Skills page adds clear design-skill labels, search and accessible controls within the existing English/Vietnamese, light/dark dashboard. Existing request details and automatic background refresh remain available.

Validation: all 33 local regression checks passed. The 525-call regression completed in approximately 25 seconds with its original 60-second limit; skill discovery metadata is cached while registry permissions are still reread on every call. Live OAuth/PKCE verified disabled cached-call rejection, matching device restrictions, selection/context updates, automatic-context off, real file contents, hidden PowerShell stdout/stderr/exit code and dashboard history. Browser checks covered 12 interactions and eight desktop/mobile, light/dark captures with no horizontal overflow or page errors. The scoped Tools/Skills visual review resolved its listed findings and scored 9.5/10; this is not a whole-product accessibility certification.

## Previous beta.19

## Windows desktop tools

Adds 20 Windows-MCP desktop tools under `windows_` names: screenshots, UI/DOM snapshots, display inventory, applications/windows, mouse and keyboard, clipboard, process and registry operations, notifications, multi-edit/select, filesystem, web content and wait conditions. Existing `run_command` remains the reusable hidden PowerShell implementation. `windows_status` reports runtime readiness; Settings can pause new desktop calls without disabling files or PowerShell.

The single `UmiBridge.cmd` launcher installs and repairs private Python 3.14.7, verified uv 0.13.5 and hash-locked dependencies. Runtime execution uses reviewed CursorTouch/Windows-MCP revision `e28abb5c6934cb3427190bdb970e02644c915ae3` from a SHA-256-verified source archive. No second endpoint, tunnel, global install or scheduled task is created. Telemetry is disabled and the upstream desktop takeover control remains enabled.

`windows_on_device` routes desktop operations to a linked Agent that advertises support. Mixed image/text results are preserved; remote results are bounded to 2 MiB and the latest eight stay in memory. Device history stores only a summary, never screenshots, clipboard content or typed text. Desktop jobs are not replayed after a Hub restart. This release includes loopback Agent/protocol checks; it does not claim a new two-physical-PC desktop deployment.

Validation: all 31 local regression checks passed. The installed Windows worker exposed all 20 schemas and completed live display, snapshot, screenshot, process, registry and disposable file operations. OAuth HTTP exposed 45 tools, returned a real cropped PNG, rejected a dashboard write without its CSRF header, blocked desktop calls while paused and resumed them afterward. No screenshot base64 entered the request journal. Mouse/keyboard/app operations are exposed from the pinned worker; the live smoke check did not exercise every input operation on the user's desktop.

## Previous beta.18

## ChatGPT-only gateway

This release removes the retired browser-provider integration from the runtime, source tree, launcher, dashboard, documentation and release archive. The private paired route, its CORS policy, setup helper and local credential files are gone. The public MCP surface is now the OAuth-protected `/mcp` endpoint used by ChatGPT.

The one-click launcher, persistent Dev Tunnel, saved OAuth grants, hidden PowerShell worker, request history, token-reference analytics, Skill Center and multi-device Hub/Agent flow remain available. Existing ChatGPT connection details continue to be reused after restart.

The local dashboard and documentation now describe one clear ChatGPT workflow. Startup removes the retired credential files when upgrading an existing installation. The current source ZIP excludes credentials, URLs, account identity, logs, browser data and runtime state.

Validation: syntax build and all 23 Windows regression checks passed, including OAuth persistence, 525 consecutive MCP calls, hidden command execution, two outbound Agents and dashboard localization. The local dashboard responds successfully and the removed endpoint returns 404. The tracked-source privacy scan found no saved credentials or runtime values.

## Previous stable improvements

- Expired Dev Tunnels authentication is refreshed once during setup while retaining the same tunnel ID and public URL.
- Incoming PowerShell commands run through a persistent hidden worker and return bounded stdout, stderr, exit code and timeout state without opening a new console window per request.
- Request counters continue beyond the latest-500 analytics window and restore from the append-only local journal.
- Token estimates use the pinned offline `o200k_base` tokenizer on observed tool payloads and remain clearly separated from model billing.
- Project groups associate requests with a ChatGPT conversation by application and folder boundary.
- The Devices page supports outbound Windows agents with durable job IDs, status, file tools and command results.
- The responsive English/Vietnamese dashboard preserves open request details during refresh and stores only interface preferences in browser local storage.

## Installation and update

Download the source ZIP, extract it to a dedicated folder and open `UmiBridge.cmd`. Existing users may replace tracked source files while preserving ignored `.local-data`; the launcher keeps current ChatGPT OAuth and tunnel settings. See `README.md` for the complete Vietnamese and English setup.
