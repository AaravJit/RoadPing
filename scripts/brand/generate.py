#!/usr/bin/env python3
"""
Generates every RoadPing brand asset from one geometric mark.

The mark is a map pin whose head holds a "ping": a ring and a dot. It is one
flat color with no gradients, radar rings or road, so it reads at 16px.

    python3 -m pip install cairosvg fonttools pillow
    python3 scripts/brand/generate.py

Outputs (paths relative to the repo root):
  assets/brand/roadping-mark.svg          mark, brand orange, transparent
  assets/brand/roadping-logo-light.svg    mark + wordmark for light backgrounds
  assets/brand/roadping-logo-dark.svg     mark + wordmark for dark backgrounds
  assets/brand/roadping-logo-{light,dark}.png
  assets/icon.png         iOS light icon: white pin on orange, opaque
  assets/icon-dark.png    iOS dark icon: orange pin on transparent
  assets/icon-tinted.png  iOS tinted icon: white pin on transparent
  assets/splash-icon.png  splash mark (same image on light and dark)
  assets/favicon.png, assets/android-icon-*.png
  docs/mark.svg, docs/favicon.png   website header mark and favicon

Keep the geometry in sync with src/components/RoadPingLogo.tsx.
"""
import io
import math
import pathlib

import cairosvg
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
BRAND_DIR = ASSETS / "brand"
DOCS = ROOT / "docs"

ORANGE = "#FF6B35"
WHITE = "#FFFFFF"
INK_LIGHT = "#1C1C1E"  # wordmark on light backgrounds
INK_DARK = "#F5F5F7"   # wordmark on dark backgrounds

# ── Mark geometry (120 × 120 box) ────────────────────────────────────────────
CX, CY, R = 60.0, 44.0, 28.0  # pin head
TIP_Y = 104.0                 # pin tip
RING_R, DOT_R = 14.0, 7.0     # the "ping" inside the head


def pin_path() -> str:
    d = TIP_Y - CY
    theta = math.acos(R / d)
    tx, ty = R * math.sin(theta), CY + R * math.cos(theta)
    outer = (
        f"M{CX:.2f} {TIP_Y:.2f} L{CX - tx:.2f} {ty:.2f} "
        f"A{R} {R} 0 1 1 {CX + tx:.2f} {ty:.2f} Z"
    )

    def circle(r: float) -> str:
        return (
            f"M{CX + r:.2f} {CY:.2f} A{r} {r} 0 1 0 {CX - r:.2f} {CY:.2f} "
            f"A{r} {r} 0 1 0 {CX + r:.2f} {CY:.2f} Z"
        )

    # evenodd: pin, minus ring hole, plus dot.
    return f"{outer} {circle(RING_R)} {circle(DOT_R)}"


PIN = pin_path()


def mark_group(color: str, scale: float = 1.0, dx: float = 0.0, dy: float = 0.0) -> str:
    return (
        f'<g transform="translate({dx:.2f} {dy:.2f}) scale({scale:.4f})">'
        f'<path d="{PIN}" fill="{color}" fill-rule="evenodd"/></g>'
    )


def svg(w: float, h: float, body: str, bg: str | None = None) -> str:
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}">{rect}{body}</svg>\n'
    )


def square(size: int, color: str, glyph_ratio: float, bg: str | None = None) -> str:
    """Mark centered in a square; glyph_ratio is mark height / side."""
    glyph_h = TIP_Y - (CY - R)  # 88 units
    scale = size * glyph_ratio / glyph_h
    dx = size / 2 - CX * scale
    dy = size / 2 - ((CY - R) + glyph_h / 2) * scale
    return svg(size, size, mark_group(color, scale, dx, dy), bg)


def png(svg_text: str, path: pathlib.Path, size: int, opaque: bool = False) -> None:
    data = cairosvg.svg2png(bytestring=svg_text.encode(), output_width=size, output_height=size)
    img = Image.open(io.BytesIO(data))
    # The App Store rejects icons with an alpha channel.
    img = img.convert("RGB") if opaque else img.convert("RGBA")
    img.save(path, optimize=True)
    print("wrote", path.relative_to(ROOT))


def wordmark_path(text: str, font_size: float) -> tuple[str, float]:
    """Outlines the wordmark so the SVG never depends on installed fonts."""
    font = TTFont("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf")
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    upm = font["head"].unitsPerEm
    k = font_size / upm
    tracking = -0.02 * upm
    pen = SVGPathPen(glyphs)
    x = 0.0
    for ch in text:
        name = cmap[ord(ch)]
        glyphs[name].draw(TransformPen(pen, (k, 0, 0, -k, x * k, 0)))
        x += glyphs[name].width + tracking
    return pen.getCommands(), (x - tracking) * k


def logo(ink: str) -> tuple[str, float, float]:
    h = 120.0
    font_size = 64.0
    words, words_w = wordmark_path("RoadPing", font_size)
    mark_w = 2 * R
    gap = 24.0
    w = mark_w + gap + words_w + 4.0  # 4 units of breathing room for the "g"
    baseline = 60 + font_size * 0.36  # cap height optically centered on the mark
    body = mark_group(ORANGE, dx=-(CX - R)) + (
        f'<path transform="translate({mark_w + gap:.2f} {baseline:.2f})" d="{words}" fill="{ink}"/>'
    )
    return svg(round(w, 2), h, body), w, h


def write(path: pathlib.Path, text: str) -> None:
    path.write_text(text)
    print("wrote", path.relative_to(ROOT))


def main() -> None:
    BRAND_DIR.mkdir(exist_ok=True)

    # Mark
    write(BRAND_DIR / "roadping-mark.svg", svg(120, 120, mark_group(ORANGE)))
    write(DOCS / "mark.svg", svg(120, 120, mark_group(ORANGE)))

    # Logo lockups
    for variant, ink in (("light", INK_LIGHT), ("dark", INK_DARK)):
        text, w, h = logo(ink)
        write(BRAND_DIR / f"roadping-logo-{variant}.svg", text)
        data = cairosvg.svg2png(bytestring=text.encode(), output_width=int(w * 8), output_height=int(h * 8))
        (BRAND_DIR / f"roadping-logo-{variant}.png").write_bytes(data)
        print("wrote", (BRAND_DIR / f"roadping-logo-{variant}.png").relative_to(ROOT))

    # iOS app icons (the system applies the rounded mask)
    png(square(1024, WHITE, 0.56, ORANGE), ASSETS / "icon.png", 1024, opaque=True)
    png(square(1024, ORANGE, 0.56), ASSETS / "icon-dark.png", 1024)
    png(square(1024, WHITE, 0.56), ASSETS / "icon-tinted.png", 1024)

    # Splash mark; expo-splash-screen sets the light/dark background colors.
    png(square(1024, ORANGE, 0.9), ASSETS / "splash-icon.png", 1024)

    # Web and Android
    png(square(48, WHITE, 0.62, ORANGE), ASSETS / "favicon.png", 48)
    png(square(64, WHITE, 0.62, ORANGE), DOCS / "favicon.png", 64)
    png(svg(512, 512, "", ORANGE), ASSETS / "android-icon-background.png", 512)
    png(square(512, WHITE, 0.36), ASSETS / "android-icon-foreground.png", 512)
    png(square(432, WHITE, 0.36), ASSETS / "android-icon-monochrome.png", 432)


if __name__ == "__main__":
    main()
