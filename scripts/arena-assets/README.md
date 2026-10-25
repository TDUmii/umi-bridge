# Arena pixel sprites

Original: **RPG Asset Character 'Gladiator' SMS** by Chasersgaming.

- Source: https://opengameart.org/content/rpg-asset-character-gladiator-sms
- Download: https://opengameart.org/sites/default/files/sms_gladiator_toby_orbon_free_files.zip
- License: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/
- Credits are appreciated by the author; Chasersgaming retains the original artwork credit.

UmiBridge crops all four frames to the same 18x24 canvas, preserving a common foot baseline. Five cloth/helmet palettes distinguish contestants without changing identity or score. Original dark outlines become charcoal; white fabric becomes ivory. Judge uses a static crop of the supplied avatar. No generated art or interpolation.

`gladiator-idle.png` and `gladiator-run.png` have four columns and five palette rows. Each frame is 18x24 pixels. Renderer displays each frame at exactly 2x with nearest-neighbor pixels. Only the recorded active contestant cycles its run strip; paused, hidden and reduced-motion views stay static.

Rebuild after downloading the original ZIP:

```powershell
python scripts/prepare-arena-sprites.py path/to/sms_gladiator_toby_orbon_free_files.zip
```

Requires Pillow only for this offline preparation step, not for running UmiBridge. `provenance.json` records archive, original file and output SHA-256 values; PNG metadata retains author/source/license.
