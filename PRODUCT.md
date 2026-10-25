# UmiBridge 1.1.0

Local Windows gateway exposing authorized file, PowerShell and desktop tools to ChatGPT through MCP, with a private dashboard for desktop and laptop.

## Arena

Arena is a separate top-level dashboard module. Each Arena provisions its own new ChatGPT Project, twenty contestant chats and one judge chat. Each contestant owns one local product folder and independently delivers a complete working product, including source, README installation/build/test/run instructions and actual evidence files. Arena does not reuse Corp departments, workspace selection or task queue.

The fixed selection path is 20 -> 10 -> 5 -> 3 -> 2 -> 1. One judge ranks every product remaining in a round using the same five-criterion rubric: requirements/function 35, UX 15, tests/evidence 20, security 15 and local delivery/docs 15. Every ranking includes criterion scores and reasons, checks and specific feedback for every contestant. Each survivor revises its own source and reruns build, test and run checks before the next judging round. Incomplete delivery, missing evidence and uncertain browser operations block progress rather than count as success.

Accepted product versions retain source, README and evidence snapshots with a manifest and SHA-256 hashes. Revision requires a source change, and stored historical versions must remain unchanged. These checks establish file identity and report consistency; they do not certify semantic quality or independently prove every reported command result.

Arena owns its enabled flag, state, setup jobs, candidates, rounds, events, usage and API. Corp retains its own state and dispatch controls. Shared infrastructure is limited to browser transport and its credential, the folder dialog, analytics and existing authorized tools. Extension 0.4.0 is required for Arena provisioning and dispatch; installed extensions and open ChatGPT tabs require manual reload after update. Prompts request GPT-6.1 Sol, but the adapter does not guarantee the model selected in ChatGPT UI.

Arena creation, setup, start, pause, retry, cancel and deletion require explicit user actions. Setup and sends are checkpointed; ambiguous results and restart recovery require reconciliation. Cancel/delete retains ChatGPT Projects/chats and product files. Browser automation uses visible ChatGPT UI, without provider cookies, internal APIs, model switching or quota bypass. A complete real-account tournament is not established by synthetic runtime/browser checks.

## Corp

Corp remains the chat orchestration and animated office module. Users register Project-scoped chats, define ordered handoffs or start the existing idea-to-project workflow with eight department chats. Office, Idea and Queue stay within Corp. Provider quota notices retain their reset deadlines; uncertain sends stop for reconciliation. Legacy Corp Arena routes no longer create work, returning 410 arena_moved or rejecting legacy setup input with 400. Current Arena uses its separate entry and API.

## Usage and private data

Analytics separates MCP, Corp and Arena observations. Offline o200k_base estimates cover observed tool text or confirmed browser prompts/results; combined totals can overlap and are not billing or remaining quota. No model identity, reasoning or cache usage is inferred.

An explicit project-data reset clears operational requests, links, Corp work and workflow records while retaining sanitized numeric measurements in token-history.jsonl and Corp usage. Analytics reads the archive plus new requests; Requests and Overview start fresh. The reset utility defaults to dry-run, requires an explicit app root, and permits apply only with the gateway stopped. It preserves OAuth, tunnel, pairing, tool permissions and preferences, and does not delete product folders. Remote ChatGPT deletion is a separate operation requiring explicit authorization.

Target devices are desktop and laptop at 1600x1000 and 1366x768. Preserve OAuth, privilege controls, tool permissions and dashboard identity. Private state, logs, browser profiles and account data remain excluded from Git and release ZIPs. No automatic public deployment, purchases or background monitoring are introduced. The optional Workflows ledger retains its manual contract.
