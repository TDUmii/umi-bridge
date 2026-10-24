# UmiBridge Corp UI

Scope: Corp extension of the existing Sakura Console dashboard, not a redesign of other sections. Operate mode. Desktop/laptop only, verified widths 1600 and 1366 pixels.

## Overview

Inherit dashboard `--ink`, `--muted`, `--surface`, `--canvas`, `--line` and existing `.btn`/`.panel` controls. Existing platform typography remains for consistency. Headings establish hierarchy; no decorative section labels added. Light/dark state remains owned by the dashboard.

Corp presents its title and two distinct switches first: office visibility and dispatch enablement. The pixel office precedes task creation and the durable queue. At laptop widths the creation form and queue stack; desktop uses two columns. Pairing instructions stay in an expandable section below work controls.

## Colors

Dashboard colors come from the existing theme variables. Office chrome uses `#101c2b`, panels `#172639`, primary text `#edf3fb`, secondary text `#b4c6d9` and accent `#9be2c5`. Room colors come from the raster art and the floor renderer.

## Typography

Preserve the existing Segoe UI dashboard text. Corp title is 28px, form/queue headings 18px, task headings 15px and dense helper copy 12px. Canvas labels are separate from accessible roster text.

## Layout

Renderer uses locally bundled Pixel Agents raster sprites and a timber floor, with dark blue chrome and warm green room surfaces. Sprite canvas width is capped at 640 CSS pixels to avoid oversized characters on wide screens. Roster supplies keyboard navigation and task details alongside the canvas.

Motion reflects only dispatch, reading, waiting and recorded handoffs. Hidden views stop animation. Reduced motion clears walking and preserves static information. Provider-limit wait is a distinct state; its exact deadline lives in the queue.

## Shapes

Inputs use 8px corners, the office frame 12px and existing dashboard panels retain their established geometry. Focus rings remain visible on controls; keyboard users select employees through the roster.

## Components

Buttons show explicit enabled/disabled state with `aria-pressed`. New tasks start paused. Paired-but-offline, no chats, empty queue, missing composer, active draft, unknown reset and ambiguous sends have textual recovery instructions. Results render as text, never HTML. Synthetic screenshots carry MINH HỌA in task/chat names.

Existing decorative dashboard branding is outside this change; it is not a new recommendation for other surfaces. Contrast detector lacked parser dependencies during this task; visual review does not certify whole-product accessibility.
