import sys, json, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
T, LAY, BASE, OUT = sys.argv[1:5]
L = json.load(open(LAY)); S = 1600; K = 4  # supersample
base = Image.open(BASE).convert('RGBA')
stone = Image.open(f'{T}/wall/stonewall_23-2K/stonewall_23_basecolor-2K.png').convert('L')
tiles = Image.open(f'{T}/tiles/Tiles075_2K-JPG_Color.jpg').convert('RGB')
GOLD, GOLD_D = (226, 184, 74, 255), (140, 104, 34, 255)

wall_out = L['wall']['outerRadius']; th = L['wall']['thickness']
door = L['entrances']['width'] * S
H = th * S + 22          # profundidade do portão (um pouco além da muralha)
P = 26                   # largura de cada pilar
W = door + 2 * P

def mix(c, t, f): return tuple(int(c[i] + (t[i] - c[i]) * f) for i in range(3))
def prism(im, cx, cy, r, color):
    base = color['rgb']; glow = color.get('glow', base)
    # halo
    g = Image.new('RGBA', im.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
    gd.ellipse([cx - r * 1.9, cy - r * 1.9, cx + r * 1.9, cy + r * 1.9], fill=glow + (150,))
    g = g.filter(ImageFilter.GaussianBlur(r * 0.7)); im.alpha_composite(g)
    d = ImageDraw.Draw(im)
    # engaste dourado
    d.regular_polygon((cx, cy, r * 1.18), 6, rotation=30, fill=(28, 24, 30, 255), outline=GOLD, width=2 * K)
    # facetas do prisma (hexágono com centro)
    pts = [(cx + r * np.cos(np.radians(60 * i - 90)), cy + r * np.sin(np.radians(60 * i - 90))) for i in range(6)]
    shades = [0.55, 0.30, -0.10, -0.35, -0.20, 0.25]   # luz vindo de cima/esquerda
    for i in range(6):
        f = shades[i]
        c = mix(base, (255, 255, 255), f) if f > 0 else mix(base, (0, 0, 0), -f)
        d.polygon([(cx, cy), pts[i], pts[(i + 1) % 6]], fill=c + (255,))
    inner = [(cx + (x - cx) * 0.45, cy + (y - cy) * 0.45) for x, y in pts]
    d.polygon(inner, fill=mix(base, (255, 255, 255), 0.35) + (255,), outline=color.get('edge', mix(base, (255, 255, 255), 0.6)) + (255,))
    d.polygon(pts, outline=color.get('edge', mix(base, (255, 255, 255), 0.6)) + (255,), width=K)
    d.ellipse([cx - r * 0.45, cy - r * 0.62, cx - r * 0.18, cy - r * 0.35], fill=(255, 255, 255, 220))  # brilho

def gate_sprite(color):
    w, h = int(W * K), int(H * K)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    # folhas da porta: mármore negro escurecido
    dw = int(door * K); dx = int(P * K); dy0, dy1 = int(14 * K), int(h - 14 * K)
    leaf = ImageEnhance.Brightness(tiles.crop((0, 0, 400, 400)).resize((dw, dy1 - dy0))).enhance(0.8).convert('RGBA')
    im.paste(leaf, (dx, dy0))
    d.rectangle([dx, dy0, dx + dw, dy1], outline=GOLD, width=3 * K)
    d.line([dx + dw // 2, dy0, dx + dw // 2, dy1], fill=GOLD, width=3 * K)        # junção das folhas
    for f in (0.3, 0.7):                                                          # reforços
        y = dy0 + int((dy1 - dy0) * f); d.line([dx, y, dx + dw, y], fill=GOLD_D, width=2 * K)
    cx, cy, r = dx + dw // 2, (dy0 + dy1) // 2, int(min(dw, dy1 - dy0) * 0.34)
    prism(im, cx, cy, r, color)
    # pilares de pedra com topo dourado
    pil = ImageEnhance.Brightness(stone.crop((300, 300, 600, 900)).resize((int(P * K), h)).convert('RGB')).enhance(0.75)
    pil = Image.blend(pil, Image.new('RGB', pil.size, (120, 112, 104)), 0.35).convert('RGBA')
    for x in (0, w - int(P * K)):
        im.paste(pil, (x, 0))
        d.rectangle([x, 0, x + int(P * K) - 1, h - 1], outline=GOLD, width=3 * K)
        d.rectangle([x + 5 * K, 5 * K, x + int(P * K) - 5 * K, int(P * K) - 5 * K], outline=GOLD_D, width=2 * K)
    return im.resize((int(W), int(H)), Image.LANCZOS)


cx = cy = S / 2
COLORS = [{k: (tuple(v) if isinstance(v, list) else v) for k, v in c.items()} for c in L['entrances']['prisms']]
for a, col in zip(L['entrances']['angles'], COLORS):
    spr = gate_sprite(col)
    sh = Image.new('RGBA', spr.size, (0, 0, 0, 0)); sh.putalpha(spr.split()[3].point(lambda a: int(a * 0.55))); sh = sh.filter(ImageFilter.GaussianBlur(4))
    spr.save(OUT.replace('.jpg', f"_portao_{col['id']}.png"))
    rmid = (wall_out - th / 2) * S
    x = cx + rmid * np.sin(np.radians(a)); y = cy - rmid * np.cos(np.radians(a))
    for im, off in ((sh, 4), (spr, 0)):
        rot = im.rotate(-a, expand=True, resample=Image.BICUBIC)
        base.alpha_composite(rot, (int(x - rot.width / 2 + off), int(y - rot.height / 2 + off)))
base.convert('RGB').save(OUT, quality=92)
print('ok')
