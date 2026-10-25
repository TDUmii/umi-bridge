"""Rebuild bundled CC0 sprite strips from the author's downloaded ZIP.

Usage: python scripts/prepare-arena-sprites.py path/to/sms_gladiator_toby_orbon_free_files.zip
Downloads are deliberately separate. Never executes files from the archive.
"""
import hashlib
import json
import sys
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, PngImagePlugin

SOURCE = "https://opengameart.org/content/rpg-asset-character-gladiator-sms"
DOWNLOAD = "https://opengameart.org/sites/default/files/sms_gladiator_toby_orbon_free_files.zip"
DEST = Path(__file__).resolve().parent / "arena-assets"
PALETTES = [
    ((173, 55, 47), (157, 131, 83)),
    ((48, 106, 80), (124, 141, 126)),
    ((54, 91, 143), (135, 147, 160)),
    ((114, 68, 127), (156, 136, 153)),
    ((164, 111, 34), (174, 151, 92)),
]


def build(archive_path):
    DEST.mkdir(exist_ok=True)
    archive_bytes = Path(archive_path).read_bytes()
    records = []
    with ZipFile(BytesIO(archive_bytes)) as archive:
        def read(name):
            path = next(item for item in archive.namelist() if item.endswith("/" + name))
            blob = archive.read(path)
            records.append({"path": path, "sha256": hashlib.sha256(blob).hexdigest()})
            return Image.open(BytesIO(blob)).convert("RGBA")

        for motion in ("Idle", "Run"):
            # Shared crop, not per-frame crop: identical feet and origin prevent jitter.
            frames = [read(f"{motion}/{motion}_South_frame_{index}.png").crop((3, 8, 21, 32)) for index in range(4)]
            atlas = Image.new("RGBA", (72, 120))
            for row, (cloth, helmet) in enumerate(PALETTES):
                for column, original in enumerate(frames):
                    frame = original.copy()
                    pixels = frame.load()
                    for y in range(frame.height):
                        for x in range(frame.width):
                            color = pixels[x, y]
                            if color == (255, 85, 85, 255): pixels[x, y] = (*cloth, 255)
                            elif color == (128, 128, 128, 255): pixels[x, y] = (*helmet, 255)
                            elif color == (0, 0, 0, 255): pixels[x, y] = (37, 43, 41, 255)
                            elif color == (255, 255, 255, 255): pixels[x, y] = (245, 231, 203, 255)
                    atlas.paste(frame, (column * 18, row * 24))
            save(atlas, f"gladiator-{motion.lower()}.png")
        save(read("Avatar/Avatar.png").crop((0, 0, 24, 24)), "judge-portrait.png")
    manifest = {"title": "RPG Asset Character 'Gladiator' SMS", "author": "Chasersgaming", "license": "CC0-1.0", "source": SOURCE, "download": DOWNLOAD,
                "archiveSha256": hashlib.sha256(archive_bytes).hexdigest(), "originalFiles": records,
                "changes": "Fixed crop (3,8)-(21,32), four-frame strips; five cloth/helmet palettes; softened outlines. Avatar head crop. No frame interpolation.",
                "frame": {"width": 18, "height": 24, "count": 4, "paletteRows": 5},
                "outputs": [{"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(DEST.glob("*.png"))]}
    (DEST / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def save(image, name):
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Source", SOURCE)
    metadata.add_text("Author", "Chasersgaming")
    metadata.add_text("License", "CC0-1.0 https://creativecommons.org/publicdomain/zero/1.0/")
    image.save(DEST / name, pnginfo=metadata, optimize=True)


if __name__ == "__main__":
    build(sys.argv[1])
