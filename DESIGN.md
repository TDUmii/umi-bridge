# UmiBridge Corp UI

Scope: compact desktop dashboard, Corp office/queue and detailed usage management within UmiBridge. Operate mode. Desktop/laptop only, verified widths 1600 and 1366 pixels.

## Overview

Shared `console.css` defines graphite/jade dashboard tokens through `--ink`, `--muted`, `--surface`, `--canvas` and `--line`, and compacts existing `.btn`/`.panel` controls. Existing platform typography remains for consistency. Headings establish hierarchy; decorative section labels and redundant subtitles are hidden. Light/dark state remains owned by the dashboard.

Corp presents its title and compact controls first: connection, office visibility, dispatch enablement and task creation. The pixel office and durable queue stay side by side at desktop and laptop widths. Task creation and extension pairing open in compact drawers so the working view stays short.

## Colors

Dashboard light colors are ink `#202e31`, canvas `#f1f5f4`, surface `#ffffff` and accent `#19735e`. Dark colors are ink `#e6efeb`, canvas `#142022`, surface `#1c2a2b` and accent `#71d6b1`. The sidebar remains graphite `#17262a`. Office chrome uses `#101c2b`, panels `#172639`, primary text `#edf3fb`, secondary text `#b4c6d9` and accent `#9be2c5`. Room colors come from the raster art and floor renderer.

## Typography

Preserve the existing Segoe UI dashboard text. Main titles are 27px, dense labels 11-12px and token metrics 23-26px with tabular numerals. Canvas labels are separate from accessible roster text.

## Layout

Renderer uses locally bundled Pixel Agents raster sprites and a timber floor, with dark blue chrome and warm green room surfaces. Sprite canvas width is capped at 640 CSS pixels to avoid oversized characters on wide screens. The roster stays inside the office frame, while queue cards scroll independently. The main Corp view fits the tested 1366x768 laptop viewport without page scrolling.

Motion reflects only dispatch, reading, waiting and recorded handoffs. Hidden views stop animation. Reduced motion clears walking and preserves static information. Provider-limit wait is a distinct state; its exact deadline lives in the queue.

## Shapes

Controls use 6-8px corners, and the office frame and usage panes use 12px corners. Focus rings remain visible on controls; keyboard users select employees through the roster.

## Components

Buttons show explicit enabled/disabled state with `aria-pressed` or `aria-expanded`. New tasks start paused. Paired-but-offline, no chats, empty queue, missing composer, active draft, unknown reset and ambiguous sends have textual recovery instructions. Results render as text, never HTML. Synthetic screenshots carry MINH HỌA in task/chat names.

## Usage surface

The Analytics route uses a compact graphite and jade operational layout. One metric strip shows token input/output, total, request count, success and latency. Time, source, application, tool and status filters stay in one toolbar. Overview, detail and limits/budget panes avoid long stacked sections. Token values use observed offline `o200k_base` payload estimates; provider billing, model, cache, reasoning and remaining quota remain explicitly unavailable.

Existing brand name and logo remain; shared chrome removes decorative branding accents. Contrast detector lacked parser dependencies during this task; visual review and targeted computed-color checks do not certify whole-product accessibility.
