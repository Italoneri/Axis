"""Forja (forge) - níveis 2 e 3 da arte outer (768x506), a partir do nível 1 aprovado.
O nível 1 (forge.outer.png) não muda. Os níveis 2 e 3 reaproveitam dele o telhado e a fornalha,
redesenham o pátio com a Stone Wall 23 (mesmos parâmetros da receita original) e acrescentam peças.
Uso: python3 -I compose_forja_niveis.py <pasta_pipeline> <stonewall_23_basecolor.png> <pasta_saida>
  pasta_pipeline: docs/art-pipeline (layout.v4.json, templates/, exemplos/forge.outer.png, renders/barris.png, renders/caixote.png)
Nível 2 (Oficina): segunda chaminé, fole, monte de carvão, tina de têmpera, rebolo, armeiro com armas.
Nível 3 (Grande Forja): acabamento dourado, bigorna rúnica sobre círculo de runas, cadinho de aetherium,
lingotes de mithril e ouro, suporte de armadura e armeiro com lâmina encantada."""
import json, math, sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

PIPE, STONE, OUT = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)
L = json.load(open(f'{PIPE}/layout.v4.json'))
arc = next(x for x in L['slots'] if x['type'] == 'outer')['arc']
ri, ro = arc['innerRadius'], arc['outerRadius']; half = (arc['endAngle'] - arc['startAngle']) / 2
SS = 2
W0 = 768; w = 2 * ro * math.sin(math.radians(half)); h = ro - ri * math.cos(math.radians(half))
H0 = round(W0 * h / w); W, H = W0 * SS, H0 * SS; sc = W / w
CX, CY = W / 2, ro * sc
def P(r, a): return (CX + r * sc * math.sin(math.radians(a)), CY - r * sc * math.cos(math.radians(a)))
def P1(r, a): x, y = P(r, a); return x / SS, y / SS
def px2deg(px, r): return math.degrees(px * SS / (r * sc))
def px2r(px): return px * SS / sc
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / sc
A = np.degrees(np.arctan2(xx - CX, CY - yy))
GOLD = (226, 184, 74); GOLD_D = (150, 112, 40)
r_split = ro - 0.046; roof_half = half - 1.0; ridge = (r_split + ro) / 2
yard_r = (ri + r_split) / 2

def noise(shape, cell, seed):
    g = np.random.default_rng(abs(int(seed))).random((max(2, shape[0] // cell[0] + 2), max(2, shape[1] // cell[1] + 2))).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((g.shape[1] * cell[1], g.shape[0] * cell[0]), Image.BICUBIC)
    return np.asarray(im, np.float32)[:shape[0], :shape[1]] / 255
def fbm(shape, cell, seed, oct=4):
    acc = np.zeros(shape, np.float32); amp = 1; tot = 0
    for o in range(oct):
        c = (max(1, cell[0] >> o), max(1, cell[1] >> o)); acc += amp * noise(shape, c, seed + o); tot += amp; amp *= .5
    return acc / tot
def to_img(rgb, a=None):
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    if a is not None: im.putalpha(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)))
    return im
def crop_a(im): return im.crop(im.split()[3].getbbox())

LV1 = Image.open(f'{PIPE}/exemplos/forge.outer.png').convert('RGBA')
stone_t = np.asarray(Image.open(STONE).convert('RGB'), np.float32) / 255

# ---------------- sprites reaproveitados ----------------
def furnace_from_lv1():
    x, y = P1(yard_r, -1.6); r = 57
    c = LV1.crop((int(x - r), int(y - r), int(x + r), int(y + r))).resize((4 * r, 4 * r), Image.LANCZOS)
    m = Image.new('L', c.size, 0); ImageDraw.Draw(m).ellipse([6, 6, c.width - 7, c.height - 7], fill=255)
    c.putalpha(m); return c
barrels = Image.open(f'{PIPE}/renders/barris.png').convert('RGBA')
B1 = crop_a(barrels.crop((110, 60, 225, 175))); B2 = crop_a(barrels.crop((370, 60, 480, 175)))
CRATE = crop_a(Image.open(f'{PIPE}/renders/caixote.png').convert('RGBA'))
FURN = furnace_from_lv1()

def wood(wd, ht, seed, base=(.36, .23, .13), along_x=True):
    g = fbm((ht, wd), (2, 40 * SS) if along_x else (40 * SS, 2), seed, 3)
    return to_img(np.array(base)[None, None] * (0.7 + 0.5 * g[..., None]))
def stone_block(wd, ht, seed, k=.75):
    rr = np.random.default_rng(seed); x0, y0 = rr.integers(0, 1500, 2)
    t = stone_t[y0:y0 + ht, x0:x0 + wd]; g = t.mean(-1, keepdims=True)
    return to_img((g * np.array([1.0, .95, .9]) * .8 + t * .2) * k)

# ---------------- peças feitas por código ----------------
def anvil(gold=False, runes=False):
    an = Image.new('RGBA', (120 * SS, 60 * SS), (0, 0, 0, 0)); ad = ImageDraw.Draw(an)
    s = SS
    body = (52, 54, 60) if not runes else (44, 46, 58)
    ad.polygon([(8 * s, 14 * s), (70 * s, 14 * s), (112 * s, 30 * s), (70 * s, 46 * s), (8 * s, 46 * s)], fill=body + (255,), outline=((GOLD if gold else (20, 20, 24)) + (255,)), width=s if not gold else 2 * s)
    ad.rectangle([14 * s, 20 * s, 64 * s, 40 * s], fill=(92, 96, 104, 255))
    ad.line([(16 * s, 22 * s), (60 * s, 22 * s)], fill=(150, 155, 165, 255), width=2 * s)
    ad.rectangle([22 * s, 4 * s, 52 * s, 14 * s], fill=(40, 40, 46, 255)); ad.rectangle([22 * s, 46 * s, 52 * s, 56 * s], fill=(40, 40, 46, 255))
    if gold:
        for yb in (4, 46): ad.rectangle([22 * s, yb * s, 52 * s, (yb + 10) * s], outline=GOLD + (255,), width=s)
    if runes:
        g = Image.new('RGBA', an.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
        rr = np.random.default_rng(5)
        for k in range(6):
            x = (18 + k * 8) * s; y = 30 * s
            for _ in range(2):
                a1 = rr.uniform(0, math.pi); l = 2.6 * s
                gd.line([(x - l * math.cos(a1), y - l * math.sin(a1)), (x + l * math.cos(a1), y + l * math.sin(a1))], fill=(120, 230, 255, 255), width=s)
        an.alpha_composite(g.filter(ImageFilter.GaussianBlur(2 * s))); an.alpha_composite(g)
    return an

def hammer_tongs():
    im = Image.new('RGBA', (44 * SS, 30 * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); s = SS
    d.line([(4 * s, 6 * s), (34 * s, 10 * s)], fill=(92, 60, 34, 255), width=3 * s)            # cabo do martelo
    d.rectangle([32 * s, 3 * s, 40 * s, 17 * s], fill=(70, 72, 80, 255), outline=(25, 25, 30, 255))
    d.line([(33 * s, 5 * s), (39 * s, 5 * s)], fill=(150, 155, 165, 255), width=s)
    d.line([(4 * s, 26 * s), (36 * s, 18 * s)], fill=(40, 40, 46, 255), width=2 * s)         # tenaz
    d.line([(4 * s, 22 * s), (36 * s, 20 * s)], fill=(55, 55, 62, 255), width=2 * s)
    return im

def coal_pile(dia=60, seed=1, glowing=.12):
    D = dia * SS; im = Image.new('RGBA', (D, D), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    rr = np.random.default_rng(seed); c = D / 2
    for k in range(260):
        ang = rr.uniform(0, 2 * math.pi); rad = (rr.random() ** .7) * (D / 2 - 4 * SS)
        x, y = c + rad * math.cos(ang) * 1.0, c + rad * math.sin(ang) * .8
        sz = rr.uniform(2, 5) * SS * (1.2 - rad / D)
        h_ = 1 - rad / (D / 2)
        v = int(18 + 40 * h_ * rr.uniform(.5, 1))
        col = (v, v, int(v * 1.08))
        if rr.random() < glowing * h_: col = (255, int(rr.uniform(80, 150)), 30)
        pts = [(x + sz * math.cos(t) * rr.uniform(.6, 1.1), y + sz * math.sin(t) * rr.uniform(.6, 1.1)) for t in np.linspace(0, 2 * math.pi, 6, endpoint=False)]
        d.polygon(pts, fill=col + (255,))
    return crop_a(im)

def trough(wd=96, ht=40, seed=2, gold=False):
    W_, H_ = wd * SS, ht * SS
    im = stone_block(W_, H_, seed, .78); d = ImageDraw.Draw(im)
    m = 6 * SS
    yy_, xx_ = np.mgrid[0:H_ - 2 * m, 0:W_ - 2 * m].astype(np.float32)
    rip = fbm(yy_.shape, (4 * SS, 10 * SS), seed + 3, 3)
    water = np.array([.10, .22, .26]) * (0.8 + 0.5 * rip[..., None])
    water += (np.sin(xx_ / (3.2 * SS) + rip * 6) > .92)[..., None] * .18
    im.paste(to_img(water), (m, m))
    d = ImageDraw.Draw(im)
    d.rectangle([m, m, W_ - m - 1, H_ - m - 1], outline=(20, 30, 34, 255), width=SS)
    d.rectangle([0, 0, W_ - 1, H_ - 1], outline=((GOLD if gold else GOLD_D) + (255,)), width=SS if not gold else 2 * SS)
    # vapor sobre a água
    st = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(st).ellipse([W_ * .25, H_ * .2, W_ * .7, H_ * .8], fill=(230, 235, 240, 70))
    im.alpha_composite(st.filter(ImageFilter.GaussianBlur(6 * SS)))
    return im

def grindstone(seed=3):
    im = Image.new('RGBA', (64 * SS, 46 * SS), (0, 0, 0, 0)); s = SS
    frame = wood(64 * s, 46 * s, seed); m = Image.new('L', frame.size, 0); dm = ImageDraw.Draw(m)
    dm.rectangle([0, 6 * s, 64 * s, 12 * s], fill=255); dm.rectangle([0, 34 * s, 64 * s, 40 * s], fill=255)
    dm.rectangle([2 * s, 0, 8 * s, 46 * s], fill=255); dm.rectangle([56 * s, 0, 62 * s, 46 * s], fill=255)
    frame.putalpha(m); im.alpha_composite(frame); d = ImageDraw.Draw(im)
    # roda de pedra (de pé): vista de cima é uma faixa com sombreado cilíndrico
    wheel = np.zeros((30 * s, 18 * s, 3), np.float32); x = np.linspace(-1, 1, 18 * s)
    sh = .45 + .55 * np.sqrt(np.clip(1 - x ** 2, 0, 1)); n = fbm((30 * s, 18 * s), (2, 3), seed, 2)
    wheel[:] = np.array([.55, .52, .48])[None, None] * sh[None, :, None] * (.85 + .25 * n[..., None])
    im.alpha_composite(to_img(wheel), (23 * s, 8 * s))
    d.line([(32 * s, 4 * s), (32 * s, 42 * s)], fill=(60, 60, 66, 255), width=2 * s)            # eixo
    d.line([(32 * s, 42 * s), (44 * s, 44 * s)], fill=(60, 60, 66, 255), width=2 * s)           # manivela
    d.ellipse([42 * s, 41 * s, 47 * s, 46 * s], fill=(92, 60, 34, 255))
    return im

def sword(length=70, gold=False, glow=None, seed=0):
    Lp = length * SS; im = Image.new('RGBA', (Lp, 14 * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); s = SS; cy = 7 * s
    bl0 = 22 * s
    d.polygon([(bl0, cy - 2.6 * s), (Lp - 6 * s, cy - 2.2 * s), (Lp - 1, cy), (Lp - 6 * s, cy + 2.2 * s), (bl0, cy + 2.6 * s)], fill=(178, 184, 194, 255), outline=(70, 74, 82, 255))
    d.line([(bl0, cy), (Lp - 4 * s, cy)], fill=(225, 230, 238, 255), width=max(1, s // 2))
    gc = GOLD if gold else (70, 64, 58)
    d.rectangle([bl0 - 3 * s, 1 * s, bl0, 13 * s], fill=gc + (255,), outline=(30, 26, 20, 255))
    d.rectangle([7 * s, cy - 1.8 * s, bl0 - 3 * s, cy + 1.8 * s], fill=(84, 46, 26, 255))
    for k in range(3): d.line([(9 * s + k * 4 * s, cy - 1.8 * s), (11 * s + k * 4 * s, cy + 1.8 * s)], fill=(50, 26, 14, 255), width=1)
    d.ellipse([2 * s, cy - 3 * s, 8 * s, cy + 3 * s], fill=gc + (255,), outline=(30, 26, 20, 255))
    if glow:
        g = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(g).line([(bl0 + 2 * s, cy), (Lp - 4 * s, cy)], fill=glow + (200,), width=3 * s)
        im.alpha_composite(g.filter(ImageFilter.GaussianBlur(2 * s)))
    return im

def axe(length=58):
    im = Image.new('RGBA', (length * SS, 26 * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); s = SS; cy = 13 * s
    d.line([(2 * s, cy), (length * s - 6 * s, cy)], fill=(98, 64, 36, 255), width=3 * s)
    hx = length * s - 16 * s
    d.polygon([(hx, cy - 2 * s), (hx + 10 * s, cy - 11 * s), (hx + 14 * s, cy - 2 * s), (hx + 14 * s, cy + 2 * s), (hx + 10 * s, cy + 11 * s), (hx, cy + 2 * s)], fill=(140, 146, 156, 255), outline=(50, 52, 58, 255))
    d.line([(hx + 10 * s, cy - 10 * s), (hx + 10 * s, cy + 10 * s)], fill=(210, 215, 222, 255), width=s)
    return im

def weapon_rack(wd=124, ht=62, gold=False, enchanted=False, seed=4):
    """bancada de armas: tampo de madeira com espadas, machado e martelo deitados (comprimento na horizontal)"""
    W_, H_ = wd * SS, ht * SS; s = SS
    im = wood(W_, H_, seed, base=(.38, .25, .14))
    d = ImageDraw.Draw(im)
    for k in range(1, 4): d.line([(0, H_ * k / 4), (W_, H_ * k / 4)], fill=(40, 24, 12, 255), width=s)
    d.rectangle([0, 0, W_ - 1, H_ - 1], outline=((GOLD if gold else (40, 24, 12)) + (255,)), width=2 * s if gold else s)
    rows = [('sword', 0), ('sword', 1), ('axe', 2), ('sword', 3)]
    for kind, k in rows:
        y = H_ * (k + .5) / 4
        if kind == 'sword':
            ench = enchanted and k == 1
            wpn = sword(int(wd * .86), gold=gold and k != 3, glow=(110, 220, 255) if ench else None, seed=k)
            if k == 3: wpn = wpn.transpose(Image.FLIP_LEFT_RIGHT)
        else:
            wpn = axe(int(wd * .7))
        sh = Image.new('RGBA', wpn.size, (0, 0, 0, 0)); sh.putalpha(wpn.split()[3].point(lambda v: int(v * .55)))
        x = int(W_ / 2 - wpn.width / 2 + (k % 2 * 2 - 1) * 3 * s)
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(s)), (x + s, int(y - wpn.height / 2 + 2 * s)))
        im.alpha_composite(wpn, (x, int(y - wpn.height / 2)))
    return im

def bellows(seed=6):
    im = Image.new('RGBA', (34 * SS, 64 * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); s = SS
    leather = (96, 58, 34)
    d.polygon([(17 * s, 2 * s), (31 * s, 30 * s), (27 * s, 50 * s), (7 * s, 50 * s), (3 * s, 30 * s)], fill=(124, 76, 44, 255), outline=(40, 22, 12, 255))
    for k in range(4): d.line([(6 * s + k, 22 * s + k * 7 * s), (28 * s - k, 22 * s + k * 7 * s)], fill=(60, 34, 18, 255), width=s)
    d.polygon([(17 * s, 4 * s), (28 * s, 28 * s), (24 * s, 46 * s), (10 * s, 46 * s), (6 * s, 28 * s)], outline=(130, 88, 54, 255))
    d.rectangle([14 * s, 0, 20 * s, 6 * s], fill=(60, 60, 66, 255))                              # bico
    d.rectangle([9 * s, 50 * s, 13 * s, 63 * s], fill=(92, 60, 34, 255)); d.rectangle([21 * s, 50 * s, 25 * s, 63 * s], fill=(92, 60, 34, 255))
    return im

def ingots(kind='mixed', seed=7):
    im = Image.new('RGBA', (60 * SS, 46 * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); s = SS
    cols = {'iron': (120, 124, 132), 'mithril': (170, 200, 225), 'gold': GOLD}
    rows = [('iron', 3), ('mithril', 3), ('gold', 2)] if kind == 'mixed' else [('iron', 3), ('iron', 2)]
    y = 4 * s
    for name, n in rows:
        c = cols[name]
        for k in range(n):
            x = 4 * s + k * 18 * s + (6 * s if n == 2 else 0)
            d.polygon([(x, y), (x + 16 * s, y), (x + 14 * s, y + 11 * s), (x + 2 * s, y + 11 * s)], fill=c + (255,), outline=tuple(int(v * .45) for v in c) + (255,))
            d.rectangle([x + 3 * s, y + 2 * s, x + 13 * s, y + 4 * s], fill=tuple(min(255, int(v * 1.3)) for v in c) + (255,))
        y += 13 * s
    return crop_a(im)

def crucible(dia=44):
    D = dia * SS; im = Image.new('RGBA', (D, D), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = D / 2
    d.ellipse([0, 0, D - 1, D - 1], fill=(60, 56, 54, 255), outline=(25, 22, 20, 255), width=SS)
    d.ellipse([5 * SS, 5 * SS, D - 6 * SS, D - 6 * SS], fill=(30, 26, 40, 255))
    yy_, xx_ = np.mgrid[0:D, 0:D].astype(np.float32); rad = np.hypot(xx_ - c, yy_ - c) / (D / 2 - 7 * SS)
    n = fbm((D, D), (3 * SS, 3 * SS), 4, 3)
    liq = np.stack([.45 + .4 * n, .85 + .15 * n, 1.0 + 0 * n], -1) * (1.1 - .4 * rad[..., None])
    im.alpha_composite(to_img(liq, (rad < 1).astype(np.float32)))
    g = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(g).ellipse([8 * SS, 8 * SS, D - 8 * SS, D - 8 * SS], fill=(150, 240, 255, 140))
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(4 * SS)))
    ImageDraw.Draw(im).ellipse([0, 0, D - 1, D - 1], outline=GOLD + (255,), width=2 * SS)
    return im

def armor_stand():
    im = Image.new('RGBA', (60 * SS, 44 * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); s = SS; cx, cy = 30 * s, 22 * s
    d.rectangle([4 * s, cy - 2 * s, 56 * s, cy + 2 * s], fill=(80, 50, 28, 255))                 # travessa
    steel = (150, 156, 166); dark = (60, 62, 70)
    for sx in (-1, 1):                                                                             # ombreiras
        d.ellipse([cx + sx * 16 * s - 12 * s, cy - 11 * s, cx + sx * 16 * s + 12 * s, cy + 11 * s], fill=steel + (255,), outline=dark + (255,), width=s)
        for k in range(2): d.arc([cx + sx * 16 * s - (9 - 3 * k) * s, cy - (8 - 3 * k) * s, cx + sx * 16 * s + (9 - 3 * k) * s, cy + (8 - 3 * k) * s], 0, 360, fill=dark + (255,), width=s)
    d.rounded_rectangle([cx - 10 * s, cy - 14 * s, cx + 10 * s, cy + 16 * s], radius=5 * s, fill=(130, 136, 146, 255), outline=dark + (255,), width=s)   # peitoral
    d.ellipse([cx - 8 * s, cy - 8 * s, cx + 8 * s, cy + 8 * s], fill=(176, 182, 192, 255), outline=GOLD + (255,), width=s)                            # elmo
    d.line([(cx - 6 * s, cy + 2 * s), (cx + 6 * s, cy + 2 * s)], fill=(30, 30, 34, 255), width=s)
    d.line([(cx, cy - 8 * s), (cx, cy + 8 * s)], fill=GOLD + (255,), width=s)
    return im

def rune_circle(dia=150):
    D = dia * SS; im = Image.new('RGBA', (D, D), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = D / 2
    CY_ = (110, 220, 255)
    for r_, wd in ((D / 2 - 3 * SS, 2 * SS), (D / 2 - 14 * SS, SS)):
        d.ellipse([c - r_, c - r_, c + r_, c + r_], outline=GOLD + (255,), width=wd)
    rr = np.random.default_rng(21)
    for i in range(28):
        an = math.radians(i * 360 / 28); x, y = c + (D / 2 - 8.5 * SS) * math.cos(an), c + (D / 2 - 8.5 * SS) * math.sin(an)
        for _ in range(2):
            a1 = rr.uniform(0, math.pi); l = 2.4 * SS
            d.line([(x - l * math.cos(a1), y - l * math.sin(a1)), (x + l * math.cos(a1), y + l * math.sin(a1))], fill=CY_ + (255,), width=SS)
    tri = [(c + (D / 2 - 15 * SS) * math.cos(math.radians(-90 + k * 120)), c + (D / 2 - 15 * SS) * math.sin(math.radians(-90 + k * 120))) for k in range(3)]
    d.polygon(tri, outline=GOLD_D + (255,)); d.polygon([(2 * c - x, 2 * c - y) for x, y in tri], outline=GOLD_D + (255,))
    g = Image.new('RGBA', im.size, (0, 0, 0, 0)); g.putalpha(im.split()[3])
    gl = Image.new('RGBA', im.size, CY_ + (0,)); gl.putalpha(im.split()[3].point(lambda v: int(v * .8)))
    out = Image.new('RGBA', im.size, (0, 0, 0, 0)); out.alpha_composite(gl.filter(ImageFilter.GaussianBlur(4 * SS))); out.alpha_composite(im)
    return out

def chimney(gold=False, seed=0):
    ch = 96 * SS; im = stone_block(ch, ch, seed + 30, .7); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, ch - 1, ch - 1], outline=((GOLD if gold else GOLD_D) + (255,)), width=3 * SS)
    if gold: d.rectangle([5 * SS, 5 * SS, ch - 6 * SS, ch - 6 * SS], outline=GOLD_D + (255,), width=SS)
    d.rectangle([18 * SS, 18 * SS, ch - 19 * SS, ch - 19 * SS], fill=(20, 12, 10, 255))
    g = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(g).ellipse([14 * SS, 14 * SS, ch - 14 * SS, ch - 14 * SS], fill=(255, 120, 30, 230))
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(7 * SS)))
    return im

# =====================================================================
def compose(level):
    gold = level >= 3
    # base: nível 1 ampliado (telhado, chaminé original), pátio redesenhado
    base = LV1.resize((W, H), Image.LANCZOS)
    img = np.asarray(base, np.float32)[..., :3] / 255; alpha = np.asarray(base, np.float32)[..., 3] / 255
    th, tw = stone_t.shape[:2]
    u = (np.radians(A) * ro * sc / (300 * SS) * tw) % tw; v = ((ro - R) * sc / (300 * SS) * th) % th
    st = stone_t[v.astype(int) % th, u.astype(int) % tw]; g = st.mean(-1, keepdims=True)
    st = g * np.array([1.0, 0.93, 0.85]) * 0.55 + st * 0.15
    yard = (R >= ri) & (R < r_split + 0.002) & (np.abs(A) <= half)
    img[yard] = st[yard]; alpha[yard] = 1
    if gold:      # faixas de pedra polida com friso dourado no pátio
        band = yard & (np.abs(R - (ri + .0085)) < .0012)
        img[band] = img[band] * .7 + np.array(GOLD) / 255 * .3
    out = to_img(img, alpha)
    d = ImageDraw.Draw(out, 'RGBA')
    def arcline(r, a1, a2, col, wd, n=120):
        d.line([P(r, a1 + (a2 - a1) * i / n) for i in range(n + 1)], fill=col, width=wd, joint='curve')
    sh = Image.new('RGBA', out.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    sd.polygon([P(r_split, -roof_half + i * 2 * roof_half / 60) for i in range(61)] +
               [P(r_split - 0.006, roof_half - i * 2 * roof_half / 60) for i in range(61)], fill=(0, 0, 0, 120))
    out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6 * SS))); d = ImageDraw.Draw(out, 'RGBA')
    arcline(r_split, -roof_half, roof_half, (GOLD if gold else GOLD_D) + (255,), 3 * SS)
    arcline(ri + 0.002, -half + .3, half - .3, GOLD + (160 if not gold else 230,), 2 * SS)
    if gold:
        arcline(ridge, -roof_half, roof_half, (255, 214, 110, 255), 4 * SS)           # cumeeira mais viva
        for s_ in (-1, 1): d.line([P(r_split, s_ * roof_half), P(ro, s_ * roof_half)], fill=GOLD + (255,), width=3 * SS)
        arcline(ri + .0085 + .0012, -half + .5, half - .5, GOLD_D + (200,), SS)
        arcline(ri + .0085 - .0012, -half + .5, half - .5, GOLD_D + (200,), SS)

    def paste(im, r, a, size_px, rot_extra=0, shadow=True, sh_alpha=.6, sh_off=6, sh_blur=5):
        nonlocal out
        im = im.copy(); s = size_px * SS / max(im.size)
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
        im = im.rotate(-a + rot_extra, expand=True, resample=Image.BICUBIC)
        x, y = P(r, a)
        if shadow:
            s2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); s2.putalpha(im.split()[3].point(lambda v: int(v * sh_alpha)))
            s2 = s2.filter(ImageFilter.GaussianBlur(sh_blur * SS)); out.alpha_composite(s2, (int(x - im.width / 2 + sh_off * SS), int(y - im.height / 2 + (sh_off + 1) * SS)))
        out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))
    def glow(r, a, rad_px, col, alpha_):
        nonlocal out
        g = Image.new('RGBA', out.size, (0, 0, 0, 0)); x, y = P(r, a)
        ImageDraw.Draw(g).ellipse([x - rad_px * SS, y - rad_px * SS, x + rad_px * SS, y + rad_px * SS], fill=col + (alpha_,))
        out.alpha_composite(g.filter(ImageFilter.GaussianBlur(rad_px * SS * .45)))
    FX = []
    def fx(kind, r, a, **kw):
        x, y = P(r, a); FX.append(dict(type=kind, x=round(x / W, 3), y=round(y / H, 3), **kw))
    rr = np.random.default_rng(level)

    # ---------- telhado: chaminés ----------
    if gold: paste(chimney(True, 1), ridge + .008, -4.6, 96, shadow=False)
    glow(ridge + .008, 4.6, 80, (255, 120, 30), 60)
    paste(chimney(gold, 2), ridge + .008, 4.6, 86 if not gold else 96)
    fx('smoke', ridge + .008, -4.6); fx('glow', ridge + .008, -4.6, color='#ff7a1a', radius=0.08)
    fx('smoke', ridge + .008, 4.6); fx('glow', ridge + .008, 4.6, color='#ff7a1a', radius=0.07)
    if gold:     # chaminé central de aetherium (fumaça azulada)
        glow(ridge + .006, 0, 60, (110, 220, 255), 70)
        ce = chimney(True, 3); arr = np.asarray(ce, np.float32)
        hot = (arr[..., 0] > 200) & (arr[..., 2] < 120)
        arr[hot, :3] = arr[hot][:, [2, 1, 0]] * np.array([1.0, 1.0, 1.0]); arr[..., :3] = np.where(hot[..., None], np.array([110, 220, 255]) * (arr[..., 0:1] / 255 + .4), arr[..., :3])
        paste(Image.fromarray(arr.clip(0, 255).astype(np.uint8)), ridge + .006, 0, 70)
        fx('smoke', ridge + .006, 0, color='#9fe6ff'); fx('glow', ridge + .006, 0, color='#6ed8ff', radius=0.06)

    # ---------- pátio ----------
    # fornalha (a mesma do nível 1) + fole + carvão
    if gold:
        glow(yard_r, -1.6, 60, (255, 130, 40), 60)
        ring = Image.new('RGBA', (124 * SS, 124 * SS), (0, 0, 0, 0)); ImageDraw.Draw(ring).ellipse([0, 0, 124 * SS - 1, 124 * SS - 1], fill=GOLD_D + (255,), outline=GOLD + (255,), width=2 * SS)
        paste(ring, yard_r, -1.6, 124, sh_alpha=.6)
        paste(FURN, yard_r, -1.6, 112, shadow=False)
    else:
        paste(FURN, yard_r, -1.6, 112, sh_alpha=.0)
    fx('glow', yard_r, -1.6, color='#ff7a1a', radius=0.07)
    paste(bellows(), yard_r + .001, -1.6 - px2deg(78, yard_r), 72, rot_extra=-90, sh_alpha=.55, sh_off=4)
    paste(coal_pile(56, 3), yard_r - .0105, -3.55, 50, sh_alpha=.4, sh_off=3, sh_blur=3)

    # bigorna
    a_an = 2.2
    if gold:
        paste(rune_circle(150), yard_r + 0.003, a_an, 150, shadow=False)
        fx('glow', yard_r + 0.003, a_an, color='#6ed8ff', radius=0.09, minLevel=3)
    paste(anvil(gold=gold, runes=gold), yard_r + 0.003, a_an, 116)
    paste(hammer_tongs(), yard_r - .009, a_an + .1, 40, rot_extra=-8, sh_alpha=.5, sh_off=3, sh_blur=2)
    fx('sparks', yard_r + 0.003, a_an, **({'color': '#9fe6ff'} if gold else {}))
    d = ImageDraw.Draw(out, 'RGBA')
    for _ in range(26):
        a = a_an + rr.uniform(-2.2, 2.2); r = yard_r + 0.003 + rr.uniform(-0.01, 0.01)
        x, y = P(r, a); s = rr.uniform(1, 2.6) * SS
        col = (160, 235, 255, 230) if gold and rr.random() < .5 else (255, int(rr.integers(150, 230)), 60, 230)
        d.ellipse([x - s, y - s, x + s, y + s], fill=col)

    # lado esquerdo: armeiro e caixote
    paste(CRATE, yard_r + .0092, -6.4, 84, rot_extra=4)
    paste(weapon_rack(124, 62, gold=gold, enchanted=gold, seed=level), yard_r - .0072, -5.75, 124, sh_alpha=.6, sh_off=5)
    if gold: fx('glow', yard_r - .0075, -6.0, color='#6ed8ff', radius=0.03, minLevel=3)

    # lado direito: tina de têmpera, rebolo, barris / suporte de armadura e lingotes
    paste(trough(92, 38, 2, gold), yard_r + .0085, 5.1, 92, sh_alpha=.55, sh_off=5)
    fx('smoke', yard_r + .0085, 5.1, color='#dfe6ea')
    if not gold:
        paste(grindstone(), yard_r - .0082, 5.0, 66, rot_extra=90)
        paste(B1, yard_r + .006, 7.15, 52); paste(B2, yard_r - .0085, 7.05, 50)
    else:
        paste(armor_stand(), yard_r - .0082, 5.0, 74)
        paste(ingots('mixed'), yard_r - .0095, 7.0, 46, rot_extra=-6, sh_alpha=.55, sh_off=3)
        paste(crucible(44), yard_r + .0065, 7.15, 44)
        glow(yard_r + .0065, 7.15, 34, (110, 220, 255), 90)
        fx('glow', yard_r + .0065, 7.15, color='#6ed8ff', radius=0.045, minLevel=3)

    clamp = ((R >= ri) & (R <= ro) & (np.abs(A) <= half)).astype(np.float32)
    clamp *= np.maximum(np.asarray(base, np.float32)[..., 3] / 255, (R < r_split + 0.002))
    out.putalpha(Image.fromarray((np.asarray(out.split()[3], np.float32) * clamp).astype(np.uint8)))
    out = out.resize((W0, H0), Image.LANCZOS)
    m = Image.open(f'{PIPE}/templates/outer_arc_mask.png').convert('L')
    out.putalpha(Image.fromarray(np.minimum(np.asarray(out.split()[3]), np.asarray(m))))
    return out, FX

if __name__ == '__main__':
    allfx = {}
    for lv, name in ((2, 'forge.outer.lv2.png'), (3, 'forge.outer.lv3.png')):
        im, f = compose(lv); im.save(f'{OUT}/{name}'); allfx[lv] = f; print('ok', lv, im.size)
    json.dump(allfx, open(f'{OUT}/fx_por_nivel.json', 'w'), indent=1)
