# UmiBridge 1.1.0 dashboard design

Scope: desktop/laptop dashboard with independent Corp and Arena workspaces, existing tools/settings and token analytics. Layout targets are 1600x1000 and 1366x768. Synthetic fixtures and live provider operation remain distinct evidence.

## Shared chrome

Keep the existing graphite/jade identity and Segoe UI typography. Shared console.css owns --ink, --muted, --surface, --canvas and --line; light/dark mode remains dashboard-owned. Primary text, compact labels, focus indicators and tabular token numerals retain established sizing and contrast.

Light colors: ink #202e31, canvas #f1f5f4, surface #ffffff, accent #19735e. Dark colors: ink #e6efeb, canvas #142022, surface #1c2a2b, accent #71d6b1. Sidebar stays graphite #17262a. Controls use 6-8px corners; main frames use 12px corners and a neutral 2px focus outline. Native customizable selects preserve browser keyboard behavior and fallback.

Arena has its own top-level navigation entry beside Corp. Navigation switches the working area without sharing Corp's selected Project, employees, queue or enabled flag. Existing Overview, Analytics, Projects & chats, Requests, Devices, Tools, Skills and Settings remain available. No mobile feature scope is added.

## Arena workspace

The header presents Arena connection state, its independent dispatch switch, refresh and creation. The compact creation form accepts a name, idea and remembered parent folder. Counts and format are fixed: twenty contestants, one judge, and selection 20 -> 10 -> 5 -> 3 -> 2 -> 1. Each Arena creates its own Project and twenty-one chats. Controls explain setup readiness and extension 0.4.0 requirements without exposing credentials or internal report syntax in the main form.

The saved Arena selector operates independently of Projects & chats. Setup progress counts confirmed chats out of 21. Creation, Project/chat setup and actual product dispatch remain explicit actions. Start, pause, retry, cancel and remove controls reflect durable state; pending actions prevent duplicate submissions. Ambiguous creation or sends show a reason and require reconciliation. Removing a finished Arena explains that product files and the ChatGPT Project remain.

Four keyboard-accessible internal views share one working area: Trực tiếp, Ứng viên, Vòng đấu and Lịch sử. Tab choice, chosen round and open product details persist through refresh. Arrow keys, Home and End move between tabs. Text results render as text rather than HTML; refresh retains active scroll/focus context.

Trực tiếp shows setup or the active contestant/judge step, confirmed progress, the fixed selection path and winner summary. Processing motion reflects recorded dispatch/running state only. Hidden views stop motion; reduced motion keeps the same status and progress in static form. No invented scores, model activity or results.

Ứng viên shows all twenty contestants, each with its own chat and folder. Version disclosures expose accepted source/README/evidence paths, source hash, manifest SHA-256, individual file hashes and build/test/run check evidence. Latest judge feedback stays with its contestant. The judge has a separate chat link. Historical source and evidence remain distinct from the mutable working product.

Vòng đấu selects one of five judging rounds. Its ranking table shows every remaining contestant, all five criterion scores, total and advancement. Each row exposes criterion reasons, feedback and check evidence. Before another judging pass, every survivor completes a source revision and fresh build/test/run evidence. The next round cannot proceed on unchanged source or missing delivery. There is no group table, pairwise bracket or department workflow in this module.

Lịch sử shows recorded setup, dispatch, product/revision, judging, pause, recovery and completion events. Timestamps and textual blocked reasons explain what requires action. Completion identifies the selected product and its local delivery path; it does not imply publication.

## Corp workspace

Corp keeps Văn phòng, Từ ý tưởng and Hàng đợi. Office title, connection, visibility and dispatch controls remain compact. Manual task/team drawers live in Queue; switching views preserves drafts. The existing idea workflow keeps eight department chats, fixed stages and its report gates. Arena is absent from Corp tabs, forms, employee state and queue cards.

The office uses locally bundled Pixel Agents sprites and a timber floor with graphite chrome. Logical room layout balances desks across centered rows, preserves a corridor below the lounge and expands with the pane. Manual zoom remains 75-200%; Fit computes only on request. Resize and expansion retain zoom; Escape exits expanded mode. Names/statuses use crisp DOM tooltips and roster entries. Motion follows recorded tasks and handoffs; hidden views stop animation and reduced motion stays static.

## Folder selection

Corp and Arena use the same dashboard folder dialog. It lists drives/directories, accepts typed absolute paths, supports parent navigation and confirms only a loaded folder. Cancel, Escape or failed navigation retains the draft. The helper reads folder metadata and works without an interactive Windows desktop. Saved setup requests own their canonical parent and separate product/project folders; later preferences do not move existing files.

## Analytics and reset state

Analytics offers MCP, Corp, Arena and combined sources with period, application, tool and status filters. Overview/detail/budget panes share compact metrics and tables. Token estimates use observed offline o200k_base text; provider billing, actual model, reasoning, cache and remaining quota stay unavailable.

After an explicitly requested project-data reset, Requests and Overview show new operational history only. Historical numeric MCP measurements move to token-history.jsonl, while Analytics reads archive plus live requests and retained Corp usage. Historical task/chat labels are neutralized; raw parameters, command output, folder roots and chat links are absent from the archive. OAuth, browser pairing, tunnel, tool permissions and interface/budget preferences remain. The reset requires a stopped gateway and does not delete product folders or remote ChatGPT data.

## Validation boundaries

Browser checks use temporary state and simulated provider pages unless explicitly marked as real-account operation. The adapter prompt requests GPT-6.1 Sol; no UI model-selection guarantee follows. Local evidence and SHA-256 checks protect recorded artifact identity, not complete semantic correctness. Current test totals and release verification belong in the release acceptance record once run; historical 1.0.0 acceptance does not certify Arena 1.1.0.
