#!/usr/bin/env python3
"""Generates every brand image the app and its store listings need, reproducibly, from code (Pillow only).

    python3 mobile/scripts/release-assets.py            # writes into mobile/assets/ and mobile/assets/store/
    python3 mobile/scripts/release-assets.py --check    # regenerates in memory and fails if a committed file differs

The mark is the ⬡ the app already shows on its login, lock and settings screens: a cyan hexagon outline with a purple
core, on the app's #080B14 background. Nothing here is a photograph or a claim; no text is baked into the icon itself.

Rules each output has to meet (they are asserted by mobile/__tests__/releaseAssets.test.mts):
  icon.png                        1024x1024, RGB, NO alpha channel (App Store rejects an alpha channel), full bleed
  adaptive-icon.png               1024x1024, RGBA foreground; every visible pixel inside Android's 66dp-of-108dp safe circle
  adaptive-icon-background.png    1024x1024, RGB, plain (the launcher masks and parallax-moves it)
  adaptive-icon-monochrome.png    1024x1024, RGBA, single colour + alpha (Android 13 themed icons)
  splash-icon.png                 1024x1024, RGBA, transparent; mark inside the central circle Android 12 keeps
  notification-icon.png           96x96, RGBA, white + alpha only (Android tints it; colour would show as a white blob)
  favicon.png                     48x48 (web)
  store/play-icon-512.png         512x512 (Google Play hi-res icon)
  store/play-feature-graphic.png  1024x500 (Google Play feature graphic)
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
STORE = os.path.join(ASSETS, 'store')

BG = (0x08, 0x0B, 0x14)          # Colors.bg
BG_LIFT = (0x12, 0x1A, 0x30)     # centre of the soft glow behind the mark
CYAN = (0x00, 0xD4, 0xFF)        # Colors.cyan
PURPLE = (0x7B, 0x2F, 0xF7)      # Colors.purple
WHITE = (255, 255, 255)
SS = 4                           # supersampling factor (anti-aliasing)


def hexagon(cx, cy, r):
    """Pointy-top hexagon, like the ⬡ glyph."""
    return [(cx + r * math.cos(math.radians(-90 + 60 * k)), cy + r * math.sin(math.radians(-90 + 60 * k))) for k in range(6)]


def mark(size, radius, stroke, ring=CYAN, core=PURPLE, core_ratio=0.30):
    """The ⬡ mark on a transparent square canvas of `size` px. radius = centre to vertex of the stroke's centre line."""
    big = size * SS
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = big / 2
    R, w = radius * SS, stroke * SS
    pts = hexagon(c, c, R)
    ring_rgba = ring + (255,)
    d.polygon(pts, fill=ring_rgba)                            # the stroke is centred on the hexagon: this covers its inner half
    for i in range(6):                                        # outer half: one exact rectangle per edge, a disc per vertex (round joins)
        (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % 6]
        mx, my = (x1 + x2) / 2 - c, (y1 + y2) / 2 - c
        n = math.hypot(mx, my)
        ox, oy = mx / n * w / 2, my / n * w / 2
        d.polygon([(x1, y1), (x2, y2), (x2 + ox, y2 + oy), (x1 + ox, y1 + oy)], fill=ring_rgba)
        d.ellipse((x1 - w / 2, y1 - w / 2, x1 + w / 2, y1 + w / 2), fill=ring_rgba)
    inner = hexagon(c, c, R - (w / 2) / math.cos(math.radians(30)))   # hollow out the inside
    d.polygon(inner, fill=(0, 0, 0, 0))
    cr = radius * core_ratio * SS
    if core is not None:
        d.ellipse((c - cr, c - cr, c + cr, c + cr), fill=core + (255,))
    return img.resize((size, size), Image.LANCZOS)


def radial_background(size, centre=BG_LIFT, edge=BG):
    """Plain dark field with a soft lift in the middle, built with integer maths so output is identical on every machine."""
    img = Image.new('RGB', (size, size), edge)
    px = img.load()
    c = (size - 1) / 2
    maxd = math.hypot(c, c)
    for y in range(size):
        for x in range(size):
            t = min(1.0, math.hypot(x - c, y - c) / (maxd * 0.62))
            t = t * t * (3 - 2 * t)                           # smoothstep
            px[x, y] = tuple(int(round(centre[i] + (edge[i] - centre[i]) * t)) for i in range(3))
    return img


def with_glow(base_rgb, fg_rgba, blur, strength=0.55):
    """Composite fg over base with a soft glow of its own colour underneath."""
    glow = fg_rgba.filter(ImageFilter.GaussianBlur(blur))
    alpha = glow.getchannel('A').point(lambda v: int(v * strength))
    glow.putalpha(alpha)
    out = base_rgb.convert('RGBA')
    out.alpha_composite(glow)
    out.alpha_composite(fg_rgba)
    return out.convert('RGB')


def make_icon():
    fg = mark(1024, radius=318, stroke=70)
    return with_glow(radial_background(1024), fg, blur=26)


def make_adaptive_foreground():
    # Safe zone: circle of 66dp in a 108dp canvas -> radius 0.3056 * size = 312.5 px at 1024. Outer reach = radius + stroke/2.
    return mark(1024, radius=232, stroke=58)


def make_adaptive_background():
    return radial_background(1024)


def _mono(size, radius, stroke):
    """Ring + core in one opaque colour (the launcher recolours it)."""
    return mark(size, radius, stroke, ring=WHITE, core=WHITE)


def make_splash():
    # Android 12 shows the icon inside a circle of 2/3 of its width: keep the mark inside radius 0.3333 * size = 341 px.
    return mark(1024, radius=262, stroke=62)


def make_notification_icon():
    # 96x96, white on transparent. Hexagon only (a core of the same colour reads as a solid blob at 24dp, so leave a visible dot).
    return mark(96, radius=34, stroke=9, ring=WHITE, core=WHITE, core_ratio=0.26)


def make_favicon():
    img = radial_background(48)
    fg = mark(48, radius=17, stroke=5)
    out = img.convert('RGBA')
    out.alpha_composite(fg)
    return out


def make_play_icon():
    return make_icon().resize((512, 512), Image.LANCZOS)


def _font(size, bold=True):
    for path, idx in (('/System/Library/Fonts/HelveticaNeue.ttc', 1 if bold else 0), ('/System/Library/Fonts/Helvetica.ttc', 1 if bold else 0),
                      ('/Library/Fonts/Arial Bold.ttf', 0), ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 0), ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 0)):
        try:
            return ImageFont.truetype(path, size, index=idx)
        except Exception:      # noqa: BLE001
            continue
    return ImageFont.load_default()


def make_feature_graphic():
    w, h = 1024, 500
    base = Image.new('RGB', (w, h), BG)
    px = base.load()
    for y in range(h):                                        # soft diagonal lift towards the mark
        for x in range(w):
            t = min(1.0, math.hypot(x - 250, y - 250) / 520)
            t = t * t * (3 - 2 * t)
            px[x, y] = tuple(int(round(BG_LIFT[i] + (BG[i] - BG_LIFT[i]) * t)) for i in range(3))
    m = mark(360, radius=128, stroke=28)
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    layer.alpha_composite(m, (70, 70))
    out = with_glow(base, layer, blur=16, strength=0.5).convert('RGBA')
    d = ImageDraw.Draw(out)
    d.text((470, 150), 'FIN·OS', font=_font(104), fill=(245, 247, 250))
    d.text((474, 282), 'Your money, in one place.', font=_font(36, bold=False), fill=(136, 146, 164))
    d.text((474, 336), 'Private by default. Estimates, not advice.', font=_font(24, bold=False), fill=(136, 146, 164))
    return out.convert('RGB')


OUTPUTS = {
    'icon.png': make_icon,
    'adaptive-icon.png': make_adaptive_foreground,
    'adaptive-icon-background.png': make_adaptive_background,
    'adaptive-icon-monochrome.png': lambda: _mono(1024, 232, 58),
    'splash-icon.png': make_splash,
    'notification-icon.png': make_notification_icon,
    'favicon.png': make_favicon,
    'store/play-icon-512.png': make_play_icon,
    'store/play-feature-graphic.png': make_feature_graphic,
}


def encode(img):
    import io
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def main():
    check = '--check' in sys.argv
    os.makedirs(STORE, exist_ok=True)
    bad = 0
    for name, fn in OUTPUTS.items():
        data = encode(fn())
        path = os.path.join(ASSETS, name)
        if check:
            same = os.path.exists(path) and open(path, 'rb').read() == data
            print(('same     ' if same else 'DIFFERS  ') + name)
            bad += 0 if same else 1
        else:
            open(path, 'wb').write(data)
            print(f'wrote {name}  ({len(data):,} bytes)')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
