# UmiBridge Sakura Console - 1.2.0

## Split observation and clearer Corp briefs

Xem đôi shows the existing Corp office and Arena colosseum in separate panes. Project and Arena selectors retain their own scope. Each pane can expand, Escape restores the split, and hidden panes stop motion. The saved Corp Office visibility switch applies here too. Returning to the office establishes a handoff baseline instead of replaying historical deliveries. Opening or refreshing this view reads existing state and does not create work or change dispatch switches.

Arena Live and Xem đôi share a Roman colosseum renderer with twenty contestant positions and a separate judge. Empty, queued, active, blocked, advancing, eliminated and winner states follow recorded Arena data. The confirmed-progress band, selection path and current chat link appear before arena decoration; contestant states remain at least 11px on desktop/laptop. Reduced motion retains text and static state. Corp retains the Pixel Agents office with a quieter jade/cream room and existing manual zoom, Fit, tooltips and scope controls. The split view uses compact office mode with a roster overlay and one initial Fit for each visible populated pane, preserving manual zoom across later refreshes.

Corp Idea adds a direct brief path for a selected existing chat, creating one scoped run. Dispatch-off saves it paused; dispatch-on requests start. Stable request keys recover lost create acknowledgements across restart; conflicting input is rejected. A failed start retains the created run for reconciliation. Existing multistep Queue and eight-department Idea workflows remain available.

## Versioned scoring and acceptance

New Arenas pin rubric v2: requirements/function 30, UX/accessibility 15, tests/evidence 20, security 10, performance/stability 10, maintainability 5 and local delivery/docs 10. Existing Arenas retain the original five-criterion v1, saved decisions, historical evidence and queued judge prompts. Round tables use the selected Arena's rubric. Fairness requires equal data, checks and evidence standards across candidates rather than adding a product criterion.

Contestant prompts and Corp Idea handoffs now state shared acceptance dimensions, including keyboard/focus/labels/contrast/reduced motion where applicable, observed performance, maintainable source and reproducible local delivery. Report/file/hash gates retain their prior boundaries: they do not independently rerun every reported command or certify semantic quality.

Validation: syntax build and all 151 Windows regression tests pass with zero failures, cancellations or skips (400,600 ms). Arena browser QA covers twenty seats and seven criteria; adapter QA passes. Corp browser QA passes eight direct-brief cases and hidden-state checks; Idea QA completes one Project, eight chats, thirteen turns and two repair rounds with a provider fixture. Split-view QA passes scoped selectors, focus/Escape, hidden/reduced motion, Office visibility, handoff baseline and initial Fit, with zero POSTs, remote requests or page errors. Filled direct-brief form captures cover desktop and laptop. Live local health and watch assets return successfully; the current Arena is cancelled/static and the real Corp roster has zero agents. Extension 0.4.0 is connected and paired.

ZIP/privacy and remote release parity remain pending in docs/ACCEPTANCE-1.2.vi.md. Historical counts below remain evidence only for their own releases. Extension stays at 0.4.0, with no new provider/account capability or complete real-account tournament claim.

## Previous 1.1.0

## Independent Arena

Arena moves to its own top-level dashboard page, independent state, enabled flag, setup jobs, API and event/usage records. Each Arena creates a separate ChatGPT Project containing twenty contestant chats and one judge chat. Every contestant delivers a complete product in its own chat and local folder. Corp retains Office, Idea and Queue; existing department workflows remain available. Browser transport and its revocable credential, folder selection, analytics and authorized tools are shared infrastructure.

One judge ranks every remaining product with the same complete five-criterion rubric and individual feedback. Selection follows 20 -> 10 -> 5 -> 3 -> 2 -> 1. Before the next judging pass, every survivor changes source according to feedback and reruns build, test and run checks. Required source, README installation/build/test/run instructions, actual scoped evidence files and structured pass reports block incomplete delivery. Accepted versions retain source/README/evidence snapshots, manifests and SHA-256 hashes; historical versions cannot be silently replaced. Hashes and report validation establish artifact consistency, not independent semantic certification of reported command outcomes.

The desktop/laptop UI separates Live, Candidates, Rounds and History, with confirmed 21-chat setup progress, per-product version evidence, round-wide scores and feedback, recovery reasons and winner delivery. Legacy Corp Arena creation returns 410 arena_moved, while legacy Arena setup input is rejected with 400; it cannot create new work through Corp.

Extension 0.4.0 is required. Reload its installed extension card and open ChatGPT tabs manually after update; existing browser pairing remains reusable. Prompts request GPT-6.1 Sol, but the adapter does not guarantee the actual UI-selected model. No real-account full-tournament completion is claimed. Pause, restart reconciliation, cancellation and local artifact limits remain explicit; cancel/delete preserves product folders and ChatGPT Projects/chats.

## Fresh operational history with retained token analytics

The explicit project-data reset defaults to dry-run and requires an absolute verified app root. Apply requires a stopped gateway, acquires the launcher lock, stages sanitized replacements and verifies numeric totals/time series before and after writes, with in-memory rollback on handled failure. Five exact stores participate: request-history.jsonl, token-history.jsonl, corp-state.json, chat-links.json and workflows.jsonl. Operational request history clears; sanitized historical MCP measurements move to token-history.jsonl and continue contributing to Analytics alongside live requests. Corp usage totals remain while old task/chat labels are neutralized.

OAuth, tunnel, pairing, tool permissions and preferences are preserved. The utility does not create a backup containing deleted chat content, delete product folders, reset independent Arena state or delete remote ChatGPT data. Remote deletion requires separate explicit authorization. Private account statistics and data are not part of release source.

Validation commands include build/local tests, arena:qa and arena:adapter:qa. Final check results and their evidence belong in the release acceptance record; historical release results below do not certify this new Arena. See README.md, docs/CORP.vi.md and docs/ARENA.vi.md for setup and limits.

## Previous 1.0.1

## Save location and desktop workspace

Idea and Arena creation now accept a save location. Users can type an absolute path or browse drives and directories in a local dashboard dialog, then confirm the current directory. Cancellation and failed navigation preserve the form value. The browser remembers the last location; each saved request retains its canonical parent and a separate project folder across pause and restart. The configured default folder is created on first use. Existing projects keep their current folder.

Directory browsing uses local filesystem metadata through the existing local-admin/CSRF guards and works with the gateway running in the background. It reads directory names only, caps each listing at 500 entries and does not launch PowerShell or a Windows dialog. Custom locations must already exist and be writable. Exclusive project folders prevent overwrite; handled file/state write failures clean up only files owned by that attempt, preserving unrelated files.

Corp reduces repeated descriptions and subtitles. Arena puts idea/rubric/location details behind a disclosure, keeps setup information collapsed and focuses the selected tournament. Group standings clear inherited history-table widths so every column is visible. Desktop uses two table columns and laptop uses one. Idea forms retain visible creation controls. Validation targets 1600x1000 and 1366x768; no narrow-screen feature development or mobile QA is included.

Validation includes syntax build, path/default/idempotency/restart/rollback checks, local API guards and folder-browser tests. Browser checks cover navigation, confirmation, cancellation, failures, input retention, creation locks and desktop/laptop layouts. Existing tournament, workflow and provider-fixture limits continue to apply.

## Previous 1.0.0

First stable release. Future releases track feature updates and fixes; historical beta releases remain available.

## Arena tournaments and Corp tabs

Corp adds Arena for 20, 50 or 100 product variants from one user idea. Setup creates one ChatGPT Project and eight department chats, then leaves the Arena paused for explicit review and start. That team develops products sequentially in separate local folders. Creating an Arena does not enable global coordination. Office, idea entry, Arena and queue have separate internal tabs; each Arena has Live, Groups, Bracket, History and Products views with keyboard navigation and remembered selection.

The form defaults to groups plus knockout (`group_knockout`); knockout-only (`knockout`) remains available. Groups of five play each pair once, and the top two qualify. A win earns three match points; ranking then uses score difference, total score and original seed order. Group-plus-knockout uses 47/119/239 judged matches and 267/669/1339 baseline tasks for 20/50/100 products. Knockout-only uses 19/49/99 matches and 239/599/1199 tasks. Baselines include eleven stages per product plus match judging, before bounded repairs; they do not estimate provider price or quota. API input persists the selected format.

Every comparison requires five scored criteria and reasons: requirements/function 35, UX 15, tests/evidence 20, security 15 and local delivery/docs 15. Totals must match; both products need checks and nonempty evidence files inside their candidate folders. Reports, standings, bracket rounds, lifecycle history and winner artifacts persist. Report/file validation does not independently certify command results or product quality. Live animation indicates recorded processing state, respects reduced motion and does not invent scores or outcomes.

Validation: syntax build and all 119 Windows regression tests pass, with zero failures, cancellations or skips. Synthetic runtime tests complete both tournament formats with 20/50/100 products, including full history retention, standings, tie breaks, evidence validation and restart recovery. Edge dashboard QA verifies five Arena views, complete five-criterion reports, keyboard navigation, filters and selection across polling/reload, error recovery, active/paused/reduced motion, and desktop/laptop plus narrow-screen reflow. See `docs/ACCEPTANCE-1.0.vi.md` for scope and evidence. Real-account verification covers Project/eight-chat bootstrap and a paused workflow. Complete real-LLM product generation and tournament delivery remain unverified. Desktop/laptop are the supported scope; supplementary narrow-screen reflow does not certify a physical mobile device.

## Idea-to-project workflow

Corp adds Từ ý tưởng: enter an initial idea, create a ChatGPT Project and eight department chats through extension 0.3.0, then run a predefined planning, implementation, QA, repair and local delivery chain. Users may choose planning-only, keep the created workflow paused, or reuse an existing Project. New project files are separated under Documents/UmiBridge Projects, with per-run Markdown reports.

Setup persists each confirmed step and stops on uncertain creation instead of recreating Projects/chats after a lost acknowledgement. Role assignments stay Project-scoped. Reports require a structured outcome, artifacts and checks; plan/final QA/local run/delivery gates stop on incomplete or negative evidence. A fixed additional engineering/QA round is allowed once, for at most two repair rounds. Model replies cannot route arbitrary work. No provider API key or additional AI service is introduced. Reload the installed extension after updating its source.

## Readable Corp workspace

Employee names now appear on hover, keyboard focus or tap in a crisp DOM tooltip, with a colored status dot and textual state. Persistent name cards no longer cover desks. The office signs UMIBRIDGE / CORP and Khu chờ are clear DOM text, and the Corp navigation icon is a company building. The team list and recent handoffs share a side column; an empty filtered queue becomes a compact lower toolbar.

Map zoom supports 75-200%. Fit calculates 75-150% at the moment it is pressed. Expanding or resizing preserves zoom while the room grows sideways and reflows desk columns. Expansion stays within the working page, with its button or Escape restoring the queue. Larger teams add rows and scroll independently. Canvas backing storage is reused between unchanged snapshots.

Desks now balance between rows and use spare floor height, with centered shorter rows and no empty slots after staff removal. A clear corridor separates the lounge from the first row. Status dots sit inside the upper-right corner of each seat area, with stronger colors on the light rugs. Compact title/status lines preserve more floor height on laptops.

Project and form selects use the browser's customizable select surface where supported, retaining native keyboard/form behavior and an older-browser fallback. Neutral 2px focus outlines replace the bright green rings. Operational labels and the roster have larger text; office chrome follows the dashboard graphite palette.

README now covers first install, daily launch, MCP versus extension pairing, complete Project grouping, task controls, reset/recovery, zoom and larger teams, token estimates/budgets, tool permissions/skills, devices, optional workflows, private backups and the Normal/Admin update lifecycle.

## Provider response failure guard

Live supervision found ChatGPT's “Không thể tải phản hồi này” placeholder could be marked complete by the previous adapter and handed to the next chat. Extension 0.2.2 and gateway 1.0.0 now block recognized load-error placeholders rather than recording successful answers. The gateway guard also protects against older adapters. It does not replay commands already executed. Reload the installed extension and ChatGPT tabs after updating; actual files/tool results must be reconciled before a retry.

Earlier validation for the response guard and office passed Windows regressions and real Edge-extension QA against disposable synthetic provider pages: dispatch, handoff, simulated reset/resume, draft preservation, Project scope, response-load failure handling, analytics and desktop/laptop layout. Office checks cover hover/focus tooltips, status dots, zoom/fit, expansion with unchanged zoom, Escape, the themed Project menu and a 24-employee fixture. Local live-page checks confirmed desk reflow at unchanged 100% zoom, no excess page scroll at 1366x768 or 1600x1000, and a tooltip that survives normal state refresh. These earlier checks do not replace final release validation above. Physical scope remains one Windows PC. Real provider quota reset and every ChatGPT UI variation remain unverified. The optional typography detector ran in degraded regex mode; it does not certify accessibility.

## Previous beta.26

## ChatGPT Project groups in Corp

Projects & chats now accepts ChatGPT Project URLs as parent groups. A paired Corp extension discovers child chat names/URLs from the open Project's chat list, scans supported pagination, and excludes unrelated account-sidebar chats. Corp selects one Project for its office, employee choices and queue. Every step of a Project run must stay in that group; both gateway and extension recheck scope before sending. Completed sync removes departed members and blocks outstanding steps targeting them. Existing standalone chat groups and runs remain compatible.

Discovery uses rendered UI only, with no cookie access or private provider API. Partial scans merge observations; unknown DOM cannot certify an empty Project. Scans are bounded to 60 rounds and 1,000 chats. Reload the unpacked UmiBridge Corp extension to load adapter 0.2.1, then reload ChatGPT tabs. Open the Project chat list and choose Sync chats in Corp. The adapter recognizes Lexical paragraph line breaks while retaining its draft-edit checks and revalidates the conversation immediately before clicking Send.

Validation: 95 Windows regression checks passed, with subsequent focused checks for late-result rejection after membership removal. Real Edge-extension QA uses disposable state and synthetic provider pages to test discovery/pagination/sidebar exclusion, textarea/Lexical dispatch, handoff, reset/resume, drafts, analytics and desktop/laptop fit. Live Chrome adapter 0.2.1 discovered two child chats in the selected Project and completed an automatic two-step run: UMI_CORP_PROJECT_STEP1_OK followed by UMI_CORP_PROJECT_HANDOFF_OK, with exactly one handoff event. The beta.26 Administrator runtime was checked against current source hashes. Physical scope remains one Windows PC; a real provider reset wait remains unverified.

## Previous beta.25

## Open the dashboard from the local base address

Opening `http://127.0.0.1:43127/` now redirects to `/admin` instead of returning `Cannot GET /`. The local frontend recognizes the root path as a dashboard entry; the existing local-admin guard still protects both routes, including when a saved HTTPS tunnel is configured. Public tunnel requests do not receive the dashboard redirect.

Validation covers direct loopback redirects and the local-admin guard with an HTTPS issuer. The existing `/admin` address remains available.

## Previous beta.24

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
