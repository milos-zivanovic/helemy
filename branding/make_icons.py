"""
Make the web icons from the master logo (branding/logo.png). Run from the repo root:

    api/.venv/Scripts/python.exe branding/make_icons.py

The logo is a symbol on a transparent background. It is trimmed to its visible part and centred on
a square canvas with a little padding. The opaque icons put it on the brand's dark background.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BACKGROUND = (13, 17, 67)  # #0d1143, the dark navy of the brand


def square(symbol, padding):
    """The symbol centred on a transparent square, with `padding` (share of the side) around it."""
    side = round(max(symbol.size) / (1 - 2 * padding))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(
        symbol, ((side - symbol.width) // 2, (side - symbol.height) // 2)
    )
    return canvas


def save(image, path, size):
    image.resize((size, size), Image.LANCZOS).save(ROOT / path, optimize=True)
    print(path, f"{size}x{size}")


def on_background(image):
    flat = Image.new("RGBA", image.size, BACKGROUND + (255,))
    flat.alpha_composite(image)
    return flat.convert("RGB")


source = Image.open(ROOT / "branding/logo.png").convert("RGBA")
# Trim to the visible symbol; alpha > 128 ignores faint stray pixels at the edges.
symbol = source.crop(
    source.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()
)

# Small sizes: almost no padding, every pixel counts at 16-32 px.
save(square(symbol, 0.02), "web/public/favicon.png", 64)
save(square(symbol, 0.02), "web/src/assets/logo.png", 128)
# iOS home screen: opaque (iOS fills transparency with black) and with room for its rounded mask.
save(on_background(square(symbol, 0.12)), "web/public/apple-touch-icon.png", 180)
