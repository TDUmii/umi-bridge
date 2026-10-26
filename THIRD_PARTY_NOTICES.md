# Pixel Agents

The optional UmiBridge Corp office reuses character and furniture PNG sprites from [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents), pinned at `b1bafd02896d90d83457266575a1e8e5011ce997`.

- MIT, Pablo De Lucca; upstream sprite artwork credits JIK-A-4 Metro City.
- Full license: `scripts/corp-office/assets/LICENSE.pixel-agents.txt`.
- Source URLs and original SHA-256 values: `scripts/corp-office/assets/provenance.json`.
- UmiBridge uses its own Canvas renderer and chat coordinator. It does not bundle the upstream AI runtime or service.

# Arena gladiators

The independent Arena and split observation view bundle adapted **RPG Asset Character 'Gladiator' SMS** sprites by **Chasersgaming**, licensed **CC0 1.0 Universal**.

- Source: https://opengameart.org/content/rpg-asset-character-gladiator-sms
- License: `scripts/arena-assets/LICENSE.CC0.txt` and https://creativecommons.org/publicdomain/zero/1.0/
- Archive, original PNG and derived atlas SHA-256: `scripts/arena-assets/provenance.json`.
- Changes: fixed frame crop/baseline, five cloth/helmet palette rows, charcoal outlines and ivory fabric; avatar head crop.
- These are raster pixel sprites; they are not AI-generated. Animation only projects the recorded active step and does not create fights, scores or outcomes.

# Windows-MCP

UmiBridge uses CursorTouch/Windows-MCP as an isolated local stdio worker.

- Source: https://github.com/CursorTouch/Windows-MCP
- Revision: e28abb5c6934cb3427190bdb970e02644c915ae3
- Package metadata: windows-mcp 0.8.8
- Runtime dependencies are installed from the hash-pinned `scripts/windows-tools-requirements.txt` lock. The reviewed source revision is loaded from the verified source archive; the registry wheel alone does not include all of the reviewed revision's features.
- Telemetry is disabled by UmiBridge. Upstream HTTP, OAuth and startup-task installers are not used.

## Cinzel display typeface

Copyright 2020 The Cinzel Project Authors. Source: https://github.com/NDISCOVER/Cinzel and https://github.com/google/fonts/tree/main/ofl/cinzel. Distributed under SIL Open Font License 1.1; full license in `scripts/arena-assets/LICENSE.Cinzel.txt`. Used only for Latin display text such as ARENA. Vietnamese labels use the dashboard text font to preserve accents.

Arena composition references: Kenney Mini Arena (https://kenney.nl/assets/mini-arena) and TorjusFS/colosseum-fight (https://github.com/TorjusFS/colosseum-fight). No code, art, random combat outcomes or assets copied from these references.

## MIT License

Copyright (c) 2025 JEOMON GEORGE

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Archify 3.2.0

The generic system-map viewer in scripts/system-map-template.html is generated
with Archify (https://github.com/tt-a1i/archify), copyright 2026 tt-a1i and
copyright 2025 Cocoon AI. Apache-2.0, with historical MIT portions. Complete
license and third-party notices are embedded in that self-contained viewer.
The UmiBridge local-state panel is an addition to the generated template.
Generated per-installation maps and runtime snapshots remain in .local-data.

## Kenney Roguelike Indoors

Selected interior sprites by Kenney Vleugels, CC0-1.0, from
https://kenney.nl/assets/roguelike-indoors. Local crops preserve original pixels.
Source license: scripts/corp-office/assets/LICENSE.kenney-indoors.txt.
Tile coordinates and SHA-256: scripts/corp-office/assets/provenance.kenney-indoors.json.

## Arena weapons - Kenney Tiny Dungeon

Six unmodified 16x16 weapon/shield tiles from **Tiny Dungeon 1.0** by **Kenney**, CC0-1.0.
Source: https://kenney.nl/assets/tiny-dungeon.
License: scripts/arena-assets/LICENSE.Kenney.txt. Exact tile indices, archive/output SHA-256 hashes: scripts/arena-assets/provenance.json.
