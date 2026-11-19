"""Genera los íconos y las pantallas de carga (splash) para iPhone de la app.
Uso: python3 tools/pwa/gen-icons.py   (requiere Pillow). Escribe en web/public."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[2] / 'web' / 'public'
GREEN, WHITE = (12, 107, 92), (255, 255, 255)
PTS = [(19, 23.5), (29, 44), (46, 18)]  # el visto de icon.svg, en una grilla de 64
SS = 4  # supermuestreo para bordes suaves


def check(size, bg, glyph_scale=1.0, rounded=0.0, glyph=WHITE, tile=None):
    """Cuadrado de `size` px con el visto centrado. glyph_scale<1 deja margen (maskable)."""
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0) if bg is None else bg + (255,))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * rounded), fill=(tile or GREEN) + (255,))
    k = S / 64 * glyph_scale
    ox = S / 2 - 32.5 * k
    oy = S / 2 - 31 * k
    pts = [(ox + x * k, oy + y * k) for x, y in PTS]
    w = 6.5 * k
    d.line(pts, fill=glyph + (255,), width=int(w), joint='curve')
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=glyph + (255,))
    return img.resize((size, size), Image.LANCZOS)


def save(img, name):
    img.save(OUT / name, optimize=True)
    print('escrito', name, img.size)


# Ícono de iOS: cuadrado completo, sin transparencia (iOS le pone las esquinas).
save(check(180, GREEN, 0.95).convert('RGB'), 'apple-touch-icon.png')
# Ícono "maskable" de Android: el visto dentro de la zona segura (80% central).
save(check(512, GREEN, 0.72).convert('RGB'), 'icon-maskable-512.png')

# Pantallas de carga de iPhone (ancho x alto en px físicos).
SPLASH = [
    (1320, 2868), (1206, 2622), (1290, 2796), (1179, 2556), (1284, 2778),
    (1170, 2532), (1125, 2436), (1242, 2688), (828, 1792), (1242, 2208), (750, 1334),
]
THEMES = {'light': ((242, 244, 243), GREEN), 'dark': ((13, 17, 16), (22, 130, 112))}
(OUT / 'splash').mkdir(exist_ok=True)
for theme, (bg, tile) in THEMES.items():
    for w, h in SPLASH:
        icon_px = int(w * 0.24)
        tile_img = check(icon_px, None, 0.95, rounded=0.22, tile=tile)
        canvas = Image.new('RGB', (w, h), bg)
        canvas.paste(tile_img, ((w - icon_px) // 2, (h - icon_px) // 2 - int(h * 0.02)), tile_img)
        canvas = canvas.convert('P', palette=Image.ADAPTIVE, colors=32)
        canvas.save(OUT / 'splash' / f'{theme}-{w}x{h}.png', optimize=True)
print('splash listos')
