"""Prévia do Coração no mapa: aplica a arte do core e simula os glows do fx (estáticos, no meio do pulso).
Uso: python3 -I preview_coracao.py <layout.json> <base_mapa_1600.jpg> <buildings.json do coração> <pasta_arte> <saida_niveis.jpg> <saida_mapa.jpg>"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

LAY, BASE, BJ, ART, OUT_LV, OUT_MAP = sys.argv[1:]
L = json.load(open(LAY)); B = json.load(open(BJ))
core = next(s for s in L['slots'] if s['type'] == 'core')
FILES = ['axis_heart.core.png', 'axis_heart.core.lv2.png', 'axis_heart.core.lv3.png']


def glow_sprite(px, color, alpha):
    """Mesmo degradê do GLOW_TEXTURE do jogo (1 → 0,45 em 40% → 0)."""
    y, x = np.mgrid[0:px, 0:px].astype(np.float32)
    d = np.hypot(x - px / 2, y - px / 2) / (px / 2)
    a = np.interp(d, [0, 0.4, 1], [1, 0.45, 0]) * alpha
    rgb = np.array([int(color[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    return rgb, a


def render(base, size, cx, cy, level):
    """Arte + fx do nível sobre `base` (RGB float), com o core de diâmetro `size` em (cx, cy)."""
    art = Image.open(f'{ART}/{FILES[level - 1]}').convert('RGBA').resize((size, size), Image.LANCZOS)
    a = np.asarray(art, np.float32) / 255
    x0, y0 = int(cx - size / 2), int(cy - size / 2)
    reg = base[y0:y0 + size, x0:x0 + size]
    reg[:] = reg * (1 - a[..., 3:]) + a[..., :3] * 255 * a[..., 3:]
    for fx in B.get('fx', []):
        if not (fx.get('minLevel', 1) <= level <= fx.get('maxLevel', 99)) or fx['type'] != 'glow':
            continue
        px = max(4, int(fx['radius'] * size * 2))
        rgb, al = glow_sprite(px, fx['color'], 0.72)
        gx, gy = int(x0 + fx['x'] * size - px / 2), int(y0 + fx['y'] * size - px / 2)
        sub = base[gy:gy + px, gx:gx + px]
        sub[:] = np.clip(sub + rgb * al[..., None], 0, 255)   # ADD, como no jogo


base = Image.open(BASE).convert('RGB'); S = base.width
size = round(core['size'] * S); cx, cy = core['x'] * S, core['y'] * S

# prévia no mapa (nível 3)
m = np.asarray(base, np.float32).copy(); render(m, size, cx, cy, 3)
Image.fromarray(m.astype(np.uint8)).save(OUT_MAP, quality=90)

# os 3 níveis lado a lado, ampliados: recorte do disco azul em 3×
crop = 0.24 * S; k = 3
tiles = []
for lv in (1, 2, 3):
    big = base.crop((int(cx - crop), int(cy - crop), int(cx + crop), int(cy + crop)))
    big = big.resize((big.width * k // 2, big.height * k // 2), Image.LANCZOS)
    arr = np.asarray(big, np.float32).copy()
    render(arr, size * k // 2, arr.shape[1] / 2, arr.shape[0] / 2, lv)
    t = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(t)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
    except OSError:
        f = ImageFont.load_default()
    d.text((20, 16), ['Nível 1: Adormecido', 'Nível 2: Desperto', 'Nível 3: Coração da Axis'][lv - 1], fill=(240, 220, 160), font=f)
    tiles.append(t)
w = sum(t.width for t in tiles) + 20 * 2
out = Image.new('RGB', (w, tiles[0].height), (20, 20, 28))
x = 0
for t in tiles:
    out.paste(t, (x, 0)); x += t.width + 20
out.save(OUT_LV, quality=90)
