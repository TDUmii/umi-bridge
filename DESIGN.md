# UmiBridge Corp UI

Scope: compact desktop dashboard, Corp office/queue and detailed usage management within UmiBridge. Operate mode. Desktop/laptop targets are 1600 and 1366 pixels; validation evidence distinguishes isolated UI fixtures from live provider operation.

## Overview

Shared `console.css` defines graphite/jade dashboard tokens through `--ink`, `--muted`, `--surface`, `--canvas` and `--line`, and compacts existing `.btn`/`.panel` controls. Existing platform typography remains for consistency. Headings establish hierarchy; decorative section labels and redundant subtitles are hidden. Light/dark state remains owned by the dashboard.

Corp presents its title and compact controls first: connection, office visibility, dispatch enablement and task creation. Internal tabs separate Văn phòng, Từ ý tưởng, Arena and Hàng đợi so one view does not stack every workflow. Office, Arena and queue each fill the working width. Task/team drawers share the Queue tab in two columns on desktop; switching tabs closes drawers without deleting drafts. Pairing remains a compact section. Tabs preserve selection on reload and use native tab semantics with arrow/Home/End navigation.

## Colors

Dashboard light colors are ink `#202e31`, canvas `#f1f5f4`, surface `#ffffff` and accent `#19735e`. Dark colors are ink `#e6efeb`, canvas `#142022`, surface `#1c2a2b` and accent `#71d6b1`. The sidebar remains graphite `#17262a`. Office chrome shares graphite `#142022`, panels `#1c2a2b`, primary text `#edf5f0`, secondary text `#b6c9c0` and accent `#a2d9bf`. Room colors come from the raster art and floor renderer.

## Typography

Preserve the existing Segoe UI dashboard text. Main titles are 27px, operational labels 13px and token metrics 23-26px with tabular numerals. Employee names appear in a 13px DOM tooltip on pointer hover, keyboard focus or tap, with a colored status dot before the name and a textual state. Each seat shows a 12px status dot inset 6px into its upper-right corner; map dots use darker state colors against the light rug. Names do not persist over desks. UMIBRIDGE / CORP and Khu chờ use crisp 14/12px DOM signs; all DOM text retains its font size during map zoom. Corp navigation uses a company building SVG in the existing icon system.

## Layout

Renderer uses locally bundled Pixel Agents raster sprites and a timber floor, with graphite chrome and warm green room surfaces. The logical room grows horizontally with its pane. Grid shape considers both usable floor dimensions, with a minimum 156px column pitch and 120px row pitch. Employee counts are balanced between rows; short rows are centered, removed employees leave no empty slots, and spare height spreads the rows instead of accumulating below them. The first monitor stays at least 20 logical pixels below the lounge/manager area. The manager rug appears only when a manager is assigned. Walking uses outer aisles to clear centered short rows.

Default zoom is 100%, manual zoom is 75-200%, and Fit chooses 75-150% only when explicitly pressed. Resizing, expansion and collapse retain zoom. Expanded mode remains within the existing content area and exits through its button or Escape. Header health information sits beside its title where width permits, preserving floor height. The roster, optional employee detail and recent handoffs share the office side column, with independent scroll regions. Workspace height derives from the available main viewport instead of a fixed header-height assumption. More employees add rows and map scrolling. Previous office QA includes a 24-employee fixture; Arena UI evidence uses separate synthetic state.

Motion reflects only dispatch, reading, waiting and recorded handoffs. Hidden views stop animation. Reduced motion clears walking and preserves static information. Provider-limit wait is a distinct state; its exact deadline lives in the queue.

## Shapes

Controls use 6-8px corners, and the office frame and usage panes use 12px corners. Focus uses a quiet 2px neutral outline; keyboard users select employees through desk labels or roster. Native customizable selects theme the popup surface, options, selection and arrow while preserving browser keyboard navigation; older browsers retain their native fallback.

## Components

The Corp header offers Từ ý tưởng as the primary entry. Its inline pane accepts an idea, defaults to creating a new ChatGPT Project plus eight department chats, shows the local parent folder and team, and lets users choose planning-only or full delivery. Existing Project reuse remains an option. A compact status strip records setup progress, pause/resume and exact blocked reasons; completion selects the created Project. Setup writes are version-gated to extension 0.3.0. No credentials or internal reporting protocol appear in the main form.

Idea runs show named stages, department reports, artifacts and textual check results. Arena accepts one user idea, a 20/50/100 product count and a format. The default is `group_knockout`: groups of five play a single round robin, with two qualifiers per group entering knockout. `knockout` is available as an alternative. Setup provisions one new Project plus eight department chats, develops candidates sequentially in separate local folders and leaves the Arena paused after setup. Full build is required. The form explains 47/119/239 matches and 267/669/1339 baseline tasks for groups plus knockout, or 19/49/99 matches and 239/599/1199 tasks for knockout-only, before repairs. Format stays fixed after creation.

Each Arena has keyboard-accessible Trực tiếp, Vòng bảng, Sơ đồ đấu, Lịch sử and Sản phẩm tabs, with remembered selection. Live shows the current product stage or pair being judged; processing animation follows recorded running/dispatching state and never supplies a score before a valid report arrives. Hidden views and reduced motion retain readable static state. Groups show match counts, three points per win and ranking by match points, score difference, total score and original seed order. Two qualifiers appear only after a group completes. Scrollable round columns retain every knockout round. History filters completed group/knockout matches; saved lifecycle events and reports survive restart. Product details and winner summaries expose local folders and artifact paths as text. Bracket disclosures retain state through refresh.

Judge reports show five criterion scores and reasons: requirements/function 35, UX 15, tests/evidence 20, security 15 and local delivery/docs 15. The total must equal the five scores, and each product needs checks plus nonempty evidence files inside its own folder. Report and path validation do not certify the contents or independently rerun commands. Arena member workflows appear through a jump from Queue instead of hundreds of full task cards. The workflow has fixed stage order, at most two repair rounds, and explicit pass gates for plan, final QA, local run and delivery. Arena also requires successful repair and documentation reports. A failed or missing required report is visibly blocked; receiving a response alone never becomes a success badge. Files remain local to the generated project folder. Existing manual task composition and the office keep their established controls.

Buttons show explicit enabled/disabled state with `aria-pressed` or `aria-expanded`. New tasks start paused. Paired-but-offline, no chats, empty queue, missing composer, active draft, unknown reset and ambiguous sends have textual recovery instructions. Results render as text, never HTML. Synthetic screenshots carry MINH HỌA in task/chat names.

## Usage surface

The Analytics route uses a compact graphite and jade operational layout. One metric strip shows token input/output, total, request count, success and latency. Time, source, application, tool and status filters stay in one toolbar. Overview, detail and limits/budget panes avoid long stacked sections. Token values use observed offline `o200k_base` payload estimates; provider billing, model, cache, reasoning and remaining quota remain explicitly unavailable.

Existing brand name and logo remain; shared chrome removes decorative branding accents. Contrast detector lacked parser dependencies during this task; visual review and targeted computed-color checks do not certify whole-product accessibility.
