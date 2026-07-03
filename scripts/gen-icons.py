#!/usr/bin/env python3
"""Generate finla app icons: black bg, white "fin" in SF (SF Pro Display, Heavy).

Outputs (overwrites):
  assets/images/icon.png                     1024  iOS/general, opaque RGB
  assets/images/android-icon-foreground.png   512  adaptive foreground, transparent
  assets/images/android-icon-background.png    512  adaptive background, solid black
  assets/images/android-icon-monochrome.png    432  themed icon, white glyph on transparent
"""
import os
from PIL import Image, ImageDraw, ImageFont

SF = "/System/Library/Fonts/SFNS.ttf"
# axes order: [Width, Optical Size, GRAD, Weight]
AXES = [100, 96, 400, 800]  # Heavy weight, Display optical size
TEXT = "fin"
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "images")


def make_font(px: float) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(SF, int(px))
    try:
        f.set_variation_by_axes(AXES)
    except Exception:
        try:
            f.set_variation_by_name("Heavy")
        except Exception:
            pass
    return f


def fitted_font(target_w: float) -> ImageFont.FreeTypeFont:
    """Return a font whose 'fin' tight-bbox width ~= target_w."""
    probe = make_font(400)
    d = ImageDraw.Draw(Image.new("L", (10, 10)))
    x0, y0, x1, y1 = d.textbbox((0, 0), TEXT, font=probe)
    w = x1 - x0
    return make_font(400 * target_w / w)


def draw_centered(size: int, font, color, transparent: bool) -> Image.Image:
    if transparent:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        img = Image.new("RGB", (size, size), BLACK)
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = d.textbbox((0, 0), TEXT, font=font)
    gw, gh = x1 - x0, y1 - y0
    x = (size - gw) / 2 - x0
    y = (size - gh) / 2 - y0
    d.text((x, y), TEXT, font=font, fill=color)
    return img


def gen():
    # iOS / general: opaque black, white text ~60% width, no alpha
    ios = draw_centered(1024, fitted_font(1024 * 0.60), WHITE, transparent=False)
    ios.save(os.path.join(OUT, "icon.png"))

    # Android adaptive foreground: transparent, white text within safe zone (~52%)
    fg = draw_centered(512, fitted_font(512 * 0.52), WHITE, transparent=True)
    fg.save(os.path.join(OUT, "android-icon-foreground.png"))

    # Android adaptive background: solid black
    bg = Image.new("RGB", (512, 512), BLACK)
    bg.save(os.path.join(OUT, "android-icon-background.png"))

    # Android monochrome (themed): white glyph on transparent, within safe zone
    mono = draw_centered(432, fitted_font(432 * 0.52), WHITE, transparent=True)
    mono.save(os.path.join(OUT, "android-icon-monochrome.png"))

    print("done")


if __name__ == "__main__":
    gen()
