# UmiBridge 1.2.1 dashboard design

Scope: desktop/laptop dashboard with independent Corp and Arena workspaces, existing tools/settings and token analytics. Layout targets are 1600x1000 and 1366x768. Synthetic fixtures and live provider operation remain distinct evidence.

## Shared chrome

Keep the existing graphite/jade identity and Segoe UI typography. Shared console.css owns --ink, --muted, --surface, --canvas and --line; light/dark mode remains dashboard-owned. Primary text, compact labels, focus indicators and tabular token numerals retain established sizing and contrast.

Light colors: ink #202e31, canvas #f1f5f4, surface #ffffff, accent #19735e. Dark colors: ink #e6efeb, canvas #142022, surface #1c2a2b, accent #71d6b1. Sidebar stays graphite #17262a. Controls use 6-8px corners; main frames use 12px corners and a neutral 2px focus outline. Native customizable selects preserve browser keyboard behavior and fallback.

Arena has its own top-level navigation entry beside Corp. Navigation switches the working area without sharing Corp's selected Project, employees, queue or enabled flag. Existing Overview, Analytics, Projects & chats, Requests, Devices, Tools, Skills and Settings remain available. No mobile feature scope is added.

## Arena workspace

The header presents Arena connection state, its independent dispatch switch, refresh and creation. The compact creation form accepts a name, idea and remembered parent folder. Counts and format are fixed: twenty contestants, one judge, and selection 20 -> 10 -> 5 -> 3 -> 2 -> 1. Each Arena creates its own Project and twenty-one chats. Controls explain setup readiness and extension 0.4.0 requirements without exposing credentials or internal report syntax in the main form.

The saved Arena selector operates independently of Projects & chats. Setup progress counts confirmed chats out of 21. Creation, Project/chat setup and actual product dispatch remain explicit actions. Start, pause, retry, cancel and remove controls reflect durable state; pending actions prevent duplicate submissions. Ambiguous creation or sends show a reason and require reconciliation. Removing a finished Arena explains that product files and the ChatGPT Project remain.

Four keyboard-accessible internal views share one working area: Trực tiếp, Ứng viên, Vòng đấu and Lịch sử. Tab choice, chosen round and open product details persist through refresh. Arrow keys, Home and End move between tabs. Text results render as text rather than HTML; refresh retains active scroll/focus context.

Trực tiếp shows a Roman colosseum with twenty contestant positions, a separate judge and an empty arena before creation. The same renderer is used in Xem đôi. A top progress band comes before the decorative arena: confirmed chat/turn count, native progress, the fixed selection path and current chat link. Setup or the active contestant/judge step and winner summary remain visible. Contestant status text is at least 11px in the desktop/laptop layouts. Processing motion reflects recorded dispatch/running state only. Hidden views stop motion; reduced motion keeps the same status and progress in static form. No invented scores, model activity or results.

Ứng viên shows all twenty contestants, each with its own chat and folder. Version disclosures expose accepted source/README/evidence paths, source hash, manifest SHA-256, individual file hashes and build/test/run check evidence. Latest judge feedback stays with its contestant. The judge has a separate chat link. Historical source and evidence remain distinct from the mutable working product.

Vòng đấu selects one of five judging rounds. Its ranking table shows every remaining contestant, the criterion scores pinned to that Arena, total and advancement. Each row exposes criterion reasons, feedback and check evidence. Before another judging pass, every survivor completes a source revision and fresh build/test/run evidence. The next round cannot proceed on unchanged source or missing delivery. There is no group table, pairwise bracket or department workflow in this module.

New Arenas pin rubric v2: requirements 30, UX/accessibility 15, evidence 20, security 10, performance/stability 10, maintainability 5 and delivery/docs 10. Existing Arenas pin the original five-criterion v1 without rewriting decisions or queued prompts. Round headers, maxima and reasons use the selected Arena's rubric. Fairness governs judging across candidates, rather than adding a product score.

Lịch sử shows recorded setup, dispatch, product/revision, judging, pause, recovery and completion events. Timestamps and textual blocked reasons explain what requires action. Completion identifies the selected product and its local delivery path; it does not imply publication.

## Corp workspace

Corp keeps Văn phòng, Từ ý tưởng and Hàng đợi. Office title, connection, visibility and dispatch controls remain compact. Manual task/team drawers live in Queue; switching views preserves drafts. The existing idea workflow keeps eight department chats, fixed stages and its report gates. Arena is absent from Corp tabs, forms, employee state and queue cards.

The office uses locally bundled Pixel Agents sprites and a light jade/cream room with restrained graphite controls. Logical room layout balances desks across centered rows, preserves a corridor below the lounge and expands with the pane. Manual zoom remains 75-200%; the main Corp office computes Fit on request. Xem đôi embeds the same office with ?compact=1, hides the roster behind an overlay toggle and computes one initial Fit when a visible populated pane appears; subsequent snapshots retain manual zoom. Resize and expansion retain zoom; Escape exits expanded mode. Names/statuses use crisp DOM tooltips and roster entries. Motion follows recorded tasks and handoffs; hidden views stop animation and reduced motion stays static.

The direct brief form selects a chat already registered in the current Corp scope and accepts one free-form request. It creates one run; dispatch-off saves paused, while dispatch-on requests start. Pending submission disables conflicting scope controls. Lost create acknowledgements reuse a stable request key, and a failed start retains the created run ID for reconciliation. Existing multistep Queue and Idea workflows remain available. Common idea acceptance covers functionality, UX/accessibility, evidence, security, performance, maintainability and local delivery. Desktop and laptop QA captures the filled direct-brief form as well as the office, Arena and split layouts.

## Split observation

Xem đôi is a top-level view with separate Corp and Arena panes. Corp uses its existing office renderer and current Project selection; Arena uses the shared colosseum renderer with a separate remembered Arena selection. Selectors refresh without stealing focus or mixing queues. Each pane can expand; Escape restores the two-pane layout. Visibility follows the visible pane and document, so a covered pane stops motion. Returning to Corp observation establishes a handoff baseline rather than replaying older events. The saved Office switch controls Corp visibility here as well. Refresh reads existing state and does not dispatch, create projects or change enabled flags.

## Folder selection

Corp and Arena use the same dashboard folder dialog. It lists drives/directories, accepts typed absolute paths, supports parent navigation and confirms only a loaded folder. Cancel, Escape or failed navigation retains the draft. The helper reads folder metadata and works without an interactive Windows desktop. Saved setup requests own their canonical parent and separate product/project folders; later preferences do not move existing files.

## Analytics and reset state

Analytics offers MCP, Corp, Arena and combined sources with period, application, tool and status filters. Overview/detail/budget panes share compact metrics and tables. Token estimates use observed offline o200k_base text; provider billing, actual model, reasoning, cache and remaining quota stay unavailable.

After an explicitly requested project-data reset, Requests and Overview show new operational history only. Historical numeric MCP measurements move to token-history.jsonl, while Analytics reads archive plus live requests and retained Corp usage. Historical task/chat labels are neutralized; raw parameters, command output, folder roots and chat links are absent from the archive. OAuth, browser pairing, tunnel, tool permissions and interface/budget preferences remain. The reset requires a stopped gateway and does not delete product folders or remote ChatGPT data.

## Validation boundaries

Browser checks use temporary state and simulated provider pages unless explicitly marked as real-account operation. The adapter prompt requests GPT-6.1 Sol; no UI model-selection guarantee follows. Local evidence and SHA-256 checks protect recorded artifact identity, not complete semantic correctness. Current test totals and release verification belong in the release acceptance record once run; historical acceptance records do not certify 1.2.0. See docs/ACCEPTANCE-1.2.vi.md for the current release checks.

## Arena pixel artwork 1.2.1

Use bundled Chasersgaming Gladiator SMS CC0 sprites in scripts/arena-assets, shared by Arena and Xem đôi. Frames are 18x24, displayed at integer 2x (36x48) with nearest-neighbor pixels; fixed crop (3,8)-(21,32) retains feet in every frame. Five cloth/helmet palettes identify seats. Active step uses four-frame run; idle, paused, hidden and reduced motion remain static. Judge uses the supplied avatar portrait. Status labels stay DOM, >=11px; versions remain in accessible seat labels and product details. Focus copy occupies its own pale inset band. Native short panes lift judge clear of the first row; bottom spacing keeps both roster rows and source credit inside the scene. Source, license and hashes are retained with sprites.
