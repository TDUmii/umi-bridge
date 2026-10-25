# UmiBridge 1.2.0

Local Windows gateway exposing authorized file, PowerShell and desktop tools to ChatGPT through MCP, with a private dashboard for desktop and laptop.

## Arena

Arena is a separate top-level dashboard module. Each Arena provisions its own new ChatGPT Project, twenty contestant chats and one judge chat. Each contestant owns one local product folder and independently delivers a complete working product, including source, README installation/build/test/run instructions and actual evidence files. Arena does not reuse Corp departments, workspace selection or task queue.

The fixed selection path is 20 -> 10 -> 5 -> 3 -> 2 -> 1. One judge ranks every product remaining in a round using its pinned rubric. New Arenas use rubric v2: requirements/function 30, UX/accessibility 15, tests/evidence 20, security 10, performance/stability 10, maintainability 5 and local delivery/docs 10. Existing Arenas retain rubric v1 (35/15/20/15/15), saved scores and queued judge prompts. Fairness is a shared judging rule: use the same evidence standards, data and checks for every candidate. Every ranking includes criterion scores and reasons, checks and specific feedback for every contestant. Each survivor revises its own source and reruns build, test and run checks before the next judging round. Incomplete delivery, missing evidence and uncertain browser operations block progress rather than count as success.

Accepted product versions retain source, README and evidence snapshots with a manifest and SHA-256 hashes. Revision requires a source change, and stored historical versions must remain unchanged. These checks establish file identity and report consistency; they do not certify semantic quality or independently prove every reported command result.

Arena owns its enabled flag, state, setup jobs, candidates, rounds, events, usage and API. Corp retains its own state and dispatch controls. Shared infrastructure is limited to browser transport and its credential, the folder dialog, analytics and existing authorized tools. Extension 0.4.0 is required for Arena provisioning and dispatch; installed extensions and open ChatGPT tabs require manual reload after update. Prompts request GPT-6.1 Sol, but the adapter does not guarantee the model selected in ChatGPT UI.

Arena creation, setup, start, pause, retry, cancel and deletion require explicit user actions. Setup and sends are checkpointed; ambiguous results and restart recovery require reconciliation. Cancel/delete retains ChatGPT Projects/chats and product files. Browser automation uses visible ChatGPT UI, without provider cookies, internal APIs, model switching or quota bypass. A complete real-account tournament is not established by synthetic runtime/browser checks.

## Corp

Corp remains the chat orchestration and animated office module. Users register Project-scoped chats, define ordered handoffs or start the existing idea-to-project workflow with eight department chats. Office, Idea and Queue stay within Corp. Provider quota notices retain their reset deadlines; uncertain sends stop for reconciliation. Legacy Corp Arena routes no longer create work, returning 410 arena_moved or rejecting legacy setup input with 400. Current Arena uses its separate entry and API.

Corp also accepts a direct brief for a selected existing chat. It creates a single paused run when dispatch is off, or explicitly starts it when dispatch is enabled; it does not provision a new Project or team. A stable request key recovers a lost creation acknowledgement without creating duplicate runs. A conflicting retry fails. The idea workflow retains its eight departments and adds shared acceptance dimensions for functionality, UX/accessibility, evidence, security, performance, maintainability and reproducible local delivery.

## Shared observation

Xem đôi displays the existing Corp office and Arena colosseum beside each other. Project and Arena selectors stay scoped to their own module; changing the Corp selection does not import Arena chats or state. The same Arena renderer serves its own Live page and the split view, including twenty contestant positions, a judge, empty states and a top band for confirmed progress, selection path and current chat. Desktop/laptop contestant states use at least 11px text. Corp uses the existing office in compact mode with a roster overlay and one initial Fit for a visible populated pane; later refreshes preserve manual zoom. Pane expansion, Escape, hidden-pane visibility and reduced motion affect presentation only. Corp office visibility remains governed by its saved Office switch. Neither opening Xem đôi nor its refresh creates work or changes dispatch switches. Historical handoffs are a baseline, not animation to replay on entry.

## Usage and private data

Analytics separates MCP, Corp and Arena observations. Offline o200k_base estimates cover observed tool text or confirmed browser prompts/results; combined totals can overlap and are not billing or remaining quota. No model identity, reasoning or cache usage is inferred.

An explicit project-data reset clears operational requests, links, Corp work and workflow records while retaining sanitized numeric measurements in token-history.jsonl and Corp usage. Analytics reads the archive plus new requests; Requests and Overview start fresh. The reset utility defaults to dry-run, requires an explicit app root, and permits apply only with the gateway stopped. It preserves OAuth, tunnel, pairing, tool permissions and preferences, and does not delete product folders. Remote ChatGPT deletion is a separate operation requiring explicit authorization.

Target devices are desktop and laptop at 1600x1000 and 1366x768. Preserve OAuth, privilege controls, tool permissions and dashboard identity. Private state, logs, browser profiles and account data remain excluded from Git and release ZIPs. No automatic public deployment, purchases or background monitoring are introduced. The optional Workflows ledger retains its manual contract.
