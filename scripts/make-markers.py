#!/usr/bin/env python3
"""Generate the map marker badges from MaterialCommunityIcons.

One spec, one look: white disc, coloured ring, coloured glyph, soft shadow.
The same glyph family is used for in-app category icons (via
@expo/vector-icons), so what you tap in a list matches what you see on the map.

Run from the repo root after changing the spec:
    python3 scripts/make-markers.py
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons"
FONT = VENDOR / "Fonts/MaterialCommunityIcons.ttf"
GLYPHS = json.loads((VENDOR / "glyphmaps/MaterialCommunityIcons.json").read_text())
OUT = ROOT / "apps/mobile/src/assets/markers"

SIZE = 72
RING = 6

# badge name -> (MDI glyph, ring/glyph colour)
SPEC = {
    # facilities & services
    "water": ("faucet", "#3D8A5A"),
    "elsan": ("toilet", "#3E7C8F"),
    "pumpout": ("water-pump", "#5D5FB8"),
    "bins": ("trash-can-outline", "#6E6A63"),
    "shower": ("shower-head", "#3E7C8F"),
    "laundry": ("washing-machine", "#8E6FC0"),
    "facility": ("dots-horizontal", "#6E6A63"),  # multi/unknown services
    # places
    "pub": ("glass-mug-variant", "#C98A2B"),
    "shop": ("storefront", "#AD5D82"),
    "fuel": ("gas-station", "#B8860B"),
    "chandlery": ("hammer-wrench", "#3E7C8F"),
    "station": ("train", "#2B2B2B"),
    # navigation
    "mooring": ("anchor", "#33647E"),
    "winding": ("autorenew", "#33647E"),
    "stoppage": ("alert", "#C94B33"),
    "reach": ("flag-variant", "#3D8A5A"),
}


def badge(glyph_name: str, colour: str) -> Image.Image:
    scale = 4  # supersample for crisp edges
    size = SIZE * scale
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = 3 * scale
    # shadow
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        [pad, pad + 2 * scale, size - pad, size - pad + 2 * scale], fill=(40, 36, 30, 90)
    )
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(2 * scale)))

    # disc + ring
    draw.ellipse([pad, pad, size - pad, size - pad], fill="#FFFFFF", outline=colour,
                 width=RING * scale)

    # glyph
    font = ImageFont.truetype(str(FONT), int(size * 0.44))
    ch = chr(GLYPHS[glyph_name])
    box = draw.textbbox((0, 0), ch, font=font)
    draw.text(
        ((size - box[2] - box[0]) / 2, (size - box[3] - box[1]) / 2),
        ch,
        font=font,
        fill=colour,
    )
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (glyph, colour) in SPEC.items():
        badge(glyph, colour).save(OUT / f"{name}.png")
        print(f"{name}.png  <- {glyph} {colour}")


if __name__ == "__main__":
    main()


def photo_pin() -> Image.Image:
    """Google-style photo-pin backdrop: white teardrop — circular head that the
    photo sits inside, pointed tail marking the exact spot."""
    scale = 4
    W, H = 220 * scale, 264 * scale
    cx, cy, r = W // 2, 108 * scale, 100 * scale
    tip_y = H - 6 * scale

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse([cx - r, cy - r + 3 * scale, cx + r, cy + r + 3 * scale], fill=(40, 36, 30, 80))
    sd.polygon(
        [(cx - 26 * scale, cy + r - 24 * scale), (cx + 26 * scale, cy + r - 24 * scale), (cx, tip_y)],
        fill=(40, 36, 30, 80),
    )
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(3 * scale)))

    d = ImageDraw.Draw(img)
    d.polygon(
        [(cx - 26 * scale, cy + r - 24 * scale), (cx + 26 * scale, cy + r - 24 * scale), (cx, tip_y - 3 * scale)],
        fill="#FFFFFF",
    )
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#FFFFFF")
    return img.resize((W // scale, H // scale), Image.LANCZOS)


photo_pin().save(OUT / "photo-pin.png")
print("photo-pin.png  <- teardrop backdrop")
