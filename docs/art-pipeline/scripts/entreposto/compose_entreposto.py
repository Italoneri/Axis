"""Entreposto (id trading_post) – slot middle (layout v4), 3 níveis, interior visto de cima.
Uso: python3 -I compose_entreposto.py <pasta_dl> <pasta_renders> <repo> <pasta_saida>
  <pasta_dl>      zips extraídos: planks/ (Planks039 2K), marble/ (Marble001 2K)
  <pasta_renders> renders de cima (render_topdown.py): wooden_crate_02, wine_barrel_01, wine_barrel_01_lay,
                  ceramic_pot, CheeseBox_01, magnifying_glass_01, brass_pot_02, brass_vase_03
  <repo>          raiz do projeto (texturas em public/assets/textures, renders e moldes em docs/)
Trabalha em 2x (1536x622) e reduz para 768x311 no final.
Base (piso, paredes, porta, helpers) reaproveitada do compose_santuario.py."""
import sys, os, math, json, random
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageChops

DL, REN, REPO, OUT = sys.argv[1:5]
os.makedirs(OUT, exist_ok=True)
PIPE = f'{REPO}/docs/art-pipeline'

SS = 2
W, H = 768 * SS, 311 * SS
RO, RI, HALF = 0.274, 0.220, math.radians(16.5)
SC = 768 / (2 * RO * math.sin(HALF)) * SS
CX, CY = W / 2, RO * SC
PPM = 62 * SS
T = 14 * SS / SC
GOLD = np.array([226, 184, 74.]); GOLD_D = np.array([150, 111, 40.])
G4, GD4 = tuple(int(v) for v in GOLD) + (255,), tuple(int(v) for v in GOLD_D) + (255,)
DOOR_HALF = 34 * SS

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / SC
A = np.arctan2(xx - CX, CY - yy)
ADEG = np.degrees(A)

def rp(r, a_deg):
    a = math.radians(a_deg); return CX + r * SC * math.sin(a), CY - r * SC * math.cos(a)

def d2r(d1x): return RO - d1x * SS / SC          # profundidade (px 1x a partir da borda externa) -> raio
def px2deg(px1x, d1x): return math.degrees(px1x * SS / (d2r(d1x) * SC))

def noise(shape, blur, seed):
    rng = np.random.default_rng(seed)
    n = Image.fromarray((rng.random(shape) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(n, np.float32) / 255.0
    return (a - a.mean()) / (a.std() + 1e-6)

def sample(tex, u, v):
    h, w = tex.shape[:2]
    u = np.mod(u, w); v = np.mod(v, h)
    x0 = np.floor(u).astype(int) % w; y0 = np.floor(v).astype(int) % h
    fx_ = (u - x0)[..., None]; fy_ = (v - y0)[..., None]
    x1 = (x0 + 1) % w; y1 = (y0 + 1) % h
    return (tex[y0, x0] * (1 - fx_) * (1 - fy_) + tex[y0, x1] * fx_ * (1 - fy_) +
            tex[y1, x0] * (1 - fx_) * fy_ + tex[y1, x1] * fx_ * fy_)

def crop_alpha(im): return im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
def load(p): return crop_alpha(Image.open(p).convert('RGBA'))
def ftex(p): return np.asarray(Image.open(p).convert('RGB'), np.float32)

def to_img(arr, alpha=None):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    if alpha is None: alpha = np.full(arr.shape[:2], 255, np.uint8)
    return Image.fromarray(np.dstack([arr, np.clip(alpha, 0, 255).astype(np.uint8)]), 'RGBA')

def new_layer(): return Image.new('RGBA', (W, H), (0, 0, 0, 0))

def put(layer, img, x, y, width_m=None, width_px=None, height_m=None, rot=0.0):
    if height_m: k = height_m * PPM / img.height
    else: k = (width_px if width_px else width_m * PPM) / img.width
    im = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    if rot: im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    layer.alpha_composite(im, (round(x - im.width / 2), round(y - im.height / 2)))

def place(layer, img, d1x, a, rot_extra=0.0, **kw):
    """posiciona em (profundidade, ângulo); a imagem é girada para seguir a curva (topo -> parede do fundo)"""
    x, y = rp(d2r(d1x), a); put(layer, img, x, y, rot=-a + rot_extra, **kw); return x, y

def with_shadow(canvas, layer, off=12, blur=9, strength=0.55):
    a = layer.getchannel('A')
    sh = Image.new('L', canvas.size, 0); sh.paste(a, (off, off))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    s = np.asarray(sh, np.float32)[..., None] / 255.0 * strength
    c = np.asarray(canvas, np.float32)
    c[..., :3] *= (1 - s)
    canvas = Image.fromarray(c.astype(np.uint8), 'RGBA')
    canvas.alpha_composite(layer)
    return canvas

def tint(img, mul, gamma=1.0):
    a = np.asarray(img, np.float32).copy()
    a[..., :3] = (a[..., :3] / 255.0) ** gamma * 255 * np.array(mul)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')

# ------------------------------------------------------------------ texturas
stone = ftex(f'{REPO}/public/assets/textures/wall_stone.jpg')
marble = ftex(f'{REPO}/public/assets/textures/marble_gold.jpg')
planks = ftex(f'{DL}/planks/Planks039_2K-JPG_Color.jpg')
# tábuas: tom de madeira envelhecida (a textura original é clara e amarelada)
pl = planks.mean(-1, keepdims=True)
planks = (pl / 255.0) ** 1.25 * np.array([150, 104, 66.]) * 1.1 + (planks - pl) * 0.25

def wood(w, h, rot90=False, dark=1.0, seed=0):
    t = np.rot90(planks) if rot90 else planks
    rng = np.random.default_rng(seed)
    y0 = rng.integers(0, t.shape[0] - 10); x0 = rng.integers(0, t.shape[1] - 10)
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    k = 2048 / (2.6 * PPM)       # Planks039 ≈ 1,5 m de largura -> escala próxima do real
    return sample(t, x0 + xx_ * k * 0.55, y0 + yy_ * k * 0.55) * dark

def lantern_lit(img):
    im = img.copy(); dr = ImageDraw.Draw(im); c = im.width / 2, im.height / 2; r = im.width * 0.2
    dr.ellipse([c[0] - r * 1.6, c[1] - r * 1.6, c[0] + r * 1.6, c[1] + r * 1.6], fill=(255, 150, 50, 140))
    dr.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=(255, 205, 110, 255))
    dr.ellipse([c[0] - r * .45, c[1] - r * .45, c[0] + r * .45, c[1] + r * .45], fill=(255, 245, 210, 255))
    return im
POTION = {'red': (200, 30, 40), 'blue': (40, 90, 220), 'green': (60, 200, 90), 'purple': (140, 60, 210),
          'gold': (240, 196, 70), 'white': (225, 235, 250), 'amber': (230, 130, 30)}

def bottle(d, color, seed, cork=True, glow=0.0):
    """frasco visto de cima: vidro redondo com o líquido, aro, reflexo e rolha"""
    s = int(d * 1.6) | 1
    yy_, xx_ = np.mgrid[0:s, 0:s].astype(np.float32)
    c = s / 2; r = np.hypot(xx_ - c, yy_ - c) / (d / 2)
    col = np.array(color, np.float32)
    inner = np.clip(1 - r, 0, 1)
    liq = col * (0.45 + 0.75 * inner[..., None] ** 0.6)
    rim = (r > 0.80) & (r <= 1.0)
    liq[rim] = col * 0.35 + 40
    a = np.where(r <= 1.0, 255, 0).astype(np.float32)
    if glow > 0:
        halo = np.clip(1 - (r - 1) / 0.6, 0, 1) * (r > 1.0)
        liq = np.where((r > 1.0)[..., None], col, liq)
        a = np.maximum(a, halo * 110 * glow)
    im = to_img(liq, a); dr = ImageDraw.Draw(im)
    if cork:
        k = d * 0.22
        dr.ellipse([c - k, c - k, c + k, c + k], fill=(150, 104, 62, 255), outline=(90, 58, 30, 255))
    h = d * 0.12; hx, hy = c - d * 0.22, c - d * 0.24
    dr.ellipse([hx - h, hy - h, hx + h, hy + h], fill=(255, 255, 255, 210))
    return im

def lying_bottle(L, d, color, seed):
    """frasco deitado: corpo oval + gargalo"""
    w, h = int(L), int(d) + 2
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    col = tuple(int(v) for v in color)
    dr.ellipse([0, 1, w * 0.72, h - 2], fill=col + (255,), outline=tuple(int(v * .4) for v in color) + (255,))
    dr.rectangle([w * 0.68, h * 0.32, w * 0.9, h * 0.68], fill=tuple(int(v * .6 + 60) for v in color) + (255,))
    dr.rectangle([w * 0.88, h * 0.28, w - 1, h * 0.72], fill=(150, 104, 62, 255))
    dr.line([(w * 0.12, h * 0.3), (w * 0.5, h * 0.3)], fill=(255, 255, 255, 170), width=max(1, h // 6))
    return im

def board(w, h, seed, dark=0.9, lip=True):
    im = to_img(wood(w, h, dark=dark, seed=seed)); dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, w - 1, h - 1], outline=(46, 28, 16, 255), width=2)
    if lip: dr.rectangle([0, h - max(3, h // 7), w - 1, h - 1], fill=(70, 44, 26, 255))
    return im
def table(w, h, seed, cloth=None):
    im = board(w, h, seed, dark=0.85, lip=False)
    if cloth is not None:
        b = int(min(w, h) * 0.08)
        c = np.array(cloth, np.float32) * (1 + noise((h - 2 * b, w - 2 * b), 3, seed)[..., None] * 0.08)
        ci = to_img(c); dr = ImageDraw.Draw(ci)
        dr.rectangle([0, 0, ci.width - 1, ci.height - 1], outline=G4, width=3)
        dr.rectangle([6, 6, ci.width - 7, ci.height - 7], outline=GD4, width=1)
        im.paste(ci, (b, b))
    ImageDraw.Draw(im).rectangle([0, 0, w - 1, h - 1], outline=(40, 24, 14, 255), width=3)
    return im

def glass_over(w, h):
    gl = Image.new('RGBA', (w, h), (0, 0, 0, 0)); gd = ImageDraw.Draw(gl)
    gd.rectangle([0, 0, w - 1, h - 1], fill=(200, 225, 240, 30))
    for k in range(-h, w, int(w * 0.38)):
        gd.polygon([(k, h), (k + h * 0.6, 0), (k + h * 0.6 + w * .08, 0), (k + w * .08, h)], fill=(255, 255, 255, 40))
    gd.rectangle([0, 0, w - 1, h - 1], outline=G4, width=3)
    return gl
PRISMS = [(128, 52, 200), (40, 170, 80), (225, 230, 240), (240, 120, 30), (40, 90, 220), (30, 26, 36), (200, 40, 40), (235, 200, 40)]

def emblem(d):
    s = int(d); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    pts = []
    for i in range(16):
        t = math.radians(i * 22.5 - 90); rr = c * (0.98 if i % 2 == 0 else 0.6)
        pts.append((c + rr * math.cos(t), c + rr * math.sin(t)))
    dr.polygon(pts, fill=(40, 34, 30, 255), outline=G4)
    dr.line(pts + [pts[0]], fill=G4, width=4)
    for k, wd in ((0.56, 4), (0.44, 2)):
        rr = c * k; dr.ellipse([c - rr, c - rr, c + rr, c + rr], outline=G4, width=wd)
    for i in range(8):
        t = math.radians(i * 45 - 90); rr = c * 0.8
        x, y = c + rr * math.cos(t), c + rr * math.sin(t); k = c * 0.075
        dr.ellipse([x - k, y - k, x + k, y + k], fill=PRISMS[i] + (255,), outline=G4, width=2)
    rr = c * 0.2; dr.ellipse([c - rr, c - rr, c + rr, c + rr], fill=G4, outline=GD4, width=2)
    return im

def runner(w, h, seed):
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    edge = np.minimum(np.minimum(xx_, w - 1 - xx_), np.minimum(yy_, h - 1 - yy_))
    img = np.zeros((h, w, 3), np.float32) + np.array([120, 24, 30])
    b = w * 0.14
    img[edge < b] = [92, 16, 22]
    img[(edge > b - 5) & (edge < b - 2)] = GOLD
    img[edge < 2.5] = GOLD_D
    img *= (1 + noise((h, w), 0.7, seed)[..., None] * 0.06 + noise((h, w), 10, seed + 1)[..., None] * 0.08)
    img[(yy_ % 22 < 2) & (edge > b)] *= 0.85        # desgaste
    return to_img(img)

# ------------------------------------------------------------------ sala base
def polar_band(tex, k, dmin, dmax, amin, amax, mul=1.0, rot=False):
    """textura mapeada em coordenadas polares numa faixa (profundidades em px 1x, ângulos em graus)"""
    u = A * R * SC * k; v = (RO - R) * SC * k
    if rot: u, v = v, u
    col = sample(tex, u + 300, v + 120) * mul
    m = (R <= d2r(dmin)) & (R >= d2r(dmax)) & (ADEG >= amin) & (ADEG <= amax)
    return to_img(col, np.where(m, 255, 0))

def build_floor(seed=7):
    u = A * R * SC; v = (RO - R) * SC
    k = 1024 / (300 * SS)
    col = sample(stone, u * k, v * k)
    lum = col.mean(-1, keepdims=True)
    col = col * 0.35 + lum * 0.65
    col = col * np.array([1.0, 0.95, 0.88]) * 0.82
    din = np.minimum.reduce([(R - (RI + T)) * SC, ((RO - T) - R) * SC, (HALF - T / np.maximum(R, 1e-3) - np.abs(A)) * R * SC])
    col *= (1 - 0.45 * np.exp(-np.clip(din, 0, None) / (11 * SS)))[..., None]
    return to_img(col)

def stone_tex(h, w, seed, base=(132, 124, 112)):
    n = noise((h, w), 1.2, seed) * 0.06 + noise((h, w), 6, seed + 1) * 0.07
    return np.array(base, np.float32) * (1 + n[..., None])

def build_walls(level, seed=11):
    rng = np.random.default_rng(seed)
    out = (R > RO - T) & (R <= RO + 2 / SC)
    inn = (R < RI + T) & (R >= RI - 2 / SC)
    side = (np.abs(A) > HALF - T / np.maximum(R, 1e-3)) & (R >= RI - 2 / SC) & (R <= RO + 2 / SC)
    arc_u = A * R * SC
    door = inn & (np.abs(arc_u) < DOOR_HALF)
    wall = (out | inn | side) & ~door
    along = np.where(side & ~(out | inn), R * SC, arc_u)
    across = np.where(out, (RO - R) * SC, np.where(inn, (R - RI) * SC, (HALF - np.abs(A)) * R * SC))
    course = (across > T * SC / 2).astype(int)
    edges = np.cumsum(rng.uniform(34, 60, 4000)) - 60000
    edges2 = edges + 22
    idx = np.where(course == 0, np.searchsorted(edges, along), np.searchsorted(edges2, along))
    e_prev = np.where(course == 0, edges[np.clip(idx - 1, 0, 3999)], edges2[np.clip(idx - 1, 0, 3999)])
    tone = 0.82 + rng.random(4001) * 0.28
    col = stone_tex(H, W, seed, (138, 130, 118)) * tone[idx % 4001][..., None]
    mortar = (np.abs(along - e_prev) < 1.6) | (np.abs(across - T * SC / 2) < 1.0)
    col[mortar] *= 0.55
    col[(across < 3.2) & wall] = GOLD_D
    gw = 2.6 if level < 3 else 4.2
    col[(np.abs(across - T * SC) < gw) & wall] = GOLD
    im = to_img(col, np.where(wall, 255, 0).astype(np.float32))
    def pillar(x, y, s):
        p = to_img(stone_tex(int(s), int(s), seed + 5, (108, 102, 94))); pd = ImageDraw.Draw(p)
        pd.rectangle([0, 0, s - 1, s - 1], outline=GD4, width=3)
        pd.rectangle([s * .28, s * .28, s * .72, s * .72], outline=G4, width=2 if level < 3 else 4)
        if level >= 3: pd.ellipse([s * .4, s * .4, s * .6, s * .6], fill=G4)
        im.alpha_composite(p, (int(x - s / 2), int(y - s / 2)))
    for sgn in (-1, 1):
        for r in (RO - T / 2, RI + T / 2):
            x, y = rp(r, sgn * (math.degrees(HALF) - math.degrees(T / 2 / r)))
            pillar(x, y, T * SC * 1.25)
        x, y = rp(RI + T / 2, math.degrees(sgn * (DOOR_HALF + T * SC * 0.3) / (RI * SC)))
        pillar(x, y, T * SC * 1.05)
    return im

def threshold_and_door(layer):
    th = (R >= RI) & (R < RI + T) & (np.abs(A * R * SC) < DOOR_HALF)
    layer.alpha_composite(to_img(stone_tex(H, W, 3, (150, 142, 128)), np.where(th, 255, 0)))
    # porta de madeira aberta para dentro (folha encostada no batente esquerdo)
    lw, lh = int(DOOR_HALF * 1.9), int(7 * SS)
    leaf = board(lw, lh, 99, dark=0.7, lip=False)
    dr = ImageDraw.Draw(leaf)
    for x in (lw * .2, lw * .8): dr.rectangle([x - 3, 0, x + 3, lh], fill=(40, 40, 44, 255))
    x0, y0 = rp(RI + T, -math.degrees(DOOR_HALF / (RI * SC)))
    lr = leaf.rotate(-62, expand=True, resample=Image.BICUBIC)
    return lr, x0, y0

# ================================================================== Entreposto
white_marble = ftex(f'{DL}/marble/Marble001_2K-JPG_Color.jpg') * np.array([1.0, 0.98, 0.94])
KP = 2048 / (2.6 * PPM) * 0.55                                   # escala das tábuas em polar_band

# ------------------------------------------------------------------ props renderizados
P = {k: load(f'{REN}/{k}.png') for k in ['wooden_crate_02', 'wine_barrel_01', 'wine_barrel_01_lay', 'ceramic_pot',
                                          'CheeseBox_01', 'magnifying_glass_01', 'brass_pot_02', 'brass_vase_03']}
for k, p in [('crate', 'deposito/crate.png'), ('lantern', 'deposito/wooden_lantern_01.png'), ('basket', 'deposito/wicker_basket_01.png'),
             ('bucket', 'deposito/wooden_bucket_01.png'), ('chest', 'deposito/chest.png'), ('stool', 'guilda/stool.png'),
             ('goblets', 'guilda/goblets.png'), ('vase1', 'santuario/brass_vase_01.png'), ('barrels', 'barris.png')]:
    P[k] = load(f'{PIPE}/renders/{p}')

# ------------------------------------------------------------------ props feitos por código
def open_book(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([0, 0, w - 1, h - 1], radius=3, fill=(96, 34, 30, 255))
    b = max(2, w // 16)
    for x0, x1 in ((b, w / 2 - 1), (w / 2 + 1, w - 1 - b)):
        dr.rectangle([x0, b, x1, h - 1 - b], fill=(236, 224, 192, 255))
        for y in np.arange(b + 4, h - b - 3, 3.2):
            dr.line([(x0 + 3, y), (x1 - 3, y)], fill=(120, 96, 70, 170), width=1)
    dr.line([(w / 2, b), (w / 2, h - b)], fill=(150, 120, 90, 255), width=2)
    dr.rectangle([w * .3, h - b - 1, w * .34, h + 2], fill=G4)            # marcador dourado
    return im

def floor_planks():
    u = A * R * SC * KP * 1.8; v = (RO - R) * SC * KP * 1.8
    col = sample(planks, v + 300, u + 120)                       # tábuas estreitas, no sentido do raio
    lum = col.mean(-1, keepdims=True); col = (col * .7 + lum * .3) * 0.92
    din = np.minimum.reduce([(R - (RI + T)) * SC, ((RO - T) - R) * SC, (HALF - T / np.maximum(R, 1e-3) - np.abs(A)) * R * SC])
    col *= (1 - 0.45 * np.exp(-np.clip(din, 0, None) / (11 * SS)))[..., None]
    return to_img(col)

def band_mask(d0, d1, a0, a1): return (R <= d2r(d0)) & (R >= d2r(d1)) & (ADEG >= a0) & (ADEG <= a1)

def solid(colr, m, seed=0, var=0.05):
    c = np.zeros((H, W, 3)) + np.array(colr, np.float32)
    c *= 1 + noise((H, W), 1.0, seed)[..., None] * var
    return to_img(c, np.where(m, 255, 0))

def coin(d):
    s = int(d) + 2; im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.ellipse([1, 1, s - 2, s - 2], fill=(232, 190, 70, 255), outline=(150, 108, 30, 255))
    dr.ellipse([s * .3, s * .25, s * .5, s * .42], fill=(255, 240, 170, 255))
    return im

def scatter_coins(im, cx, cy, rad, n, d, seed):
    rng = np.random.default_rng(seed)
    for _ in range(n):
        t = rng.uniform(0, 2 * math.pi); rr = rad * math.sqrt(rng.random())
        c = coin(d * rng.uniform(0.85, 1.1)); im.alpha_composite(c, (int(cx + rr * math.cos(t) - c.width / 2), int(cy + rr * math.sin(t) - c.height / 2)))

def scales(w, gold=False):
    """balança de pratos vista de cima: travessão, coluna central e dois pratos"""
    h = int(w * 0.48); im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    met = (236, 196, 80) if gold else (186, 140, 70); dk = tuple(int(v * .55) for v in met)
    pr = h * 0.46
    for cx in (pr + 1, w - pr - 2):
        dr.ellipse([cx - pr, h / 2 - pr, cx + pr, h / 2 + pr], fill=met + (255,), outline=dk + (255,), width=2)
        dr.ellipse([cx - pr * .7, h / 2 - pr * .7, cx + pr * .7, h / 2 + pr * .7], outline=dk + (255,), width=1)
        dr.ellipse([cx - pr * .45, h / 2 - pr * .6, cx - pr * .1, h / 2 - pr * .3], fill=(255, 244, 200, 200))
    dr.rectangle([pr, h / 2 - 2, w - pr, h / 2 + 2], fill=dk + (255,))
    k = h * 0.16; dr.ellipse([w / 2 - k, h / 2 - k, w / 2 + k, h / 2 + k], fill=met + (255,), outline=dk + (255,), width=2)
    return im

def coin_bag(d, seed):
    s = int(d * 1.7); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s * 0.38; r = d / 2
    dr.ellipse([c - r, c - r, c + r, c + r], fill=(150, 112, 70, 255), outline=(90, 62, 36, 255), width=2)
    dr.ellipse([c - r * .35, c - r * .35, c + r * .35, c + r * .35], fill=(120, 86, 50, 255), outline=(70, 46, 24, 255))
    scatter_coins(im, s * 0.66, s * 0.66, d * 0.3, 9, d * 0.22, seed)
    return im

def sack(w, h, seed, colr=(196, 170, 120), open_=None):
    """saco de juta visto de cima; open_=cor do pó (especiaria) mostra a boca aberta"""
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    nx, ny = (xx_ - w / 2) / (w / 2), (yy_ - h / 2) / (h / 2)
    r = (np.abs(nx) ** 2.6 + np.abs(ny) ** 2.6) ** (1 / 2.6)
    sh = np.clip(1.15 - r * 0.45, 0, 2)
    weave = 1 + 0.06 * ((xx_.astype(int) // 2 + yy_.astype(int) // 2) % 2)
    col = np.array(colr, np.float32) * (sh * weave * (1 + noise((h, w), 2, seed) * 0.05))[..., None]
    im = to_img(col, np.where(r <= 1, 255, 0)); dr = ImageDraw.Draw(im)
    if open_ is None:
        dr.ellipse([w * .42, h * .08, w * .58, h * .22], fill=tuple(int(v * .6) for v in colr) + (255,))
        dr.line([(w * .5, h * .2), (w * .5, h * .32)], fill=(110, 80, 40, 255), width=2)
    else:
        k = min(w, h) * 0.34
        dr.ellipse([w / 2 - k * 1.15, h / 2 - k * 1.15, w / 2 + k * 1.15, h / 2 + k * 1.15], fill=tuple(int(v * .7) for v in colr) + (255,))
        rng = np.random.default_rng(seed)
        dr.ellipse([w / 2 - k, h / 2 - k, w / 2 + k, h / 2 + k], fill=tuple(open_) + (255,))
        for _ in range(int(k * 2)):
            x, y = w / 2 + rng.uniform(-k, k) * .8, h / 2 + rng.uniform(-k, k) * .8
            g = rng.uniform(0.75, 1.2); dr.point((x, y), fill=tuple(int(min(255, v * g)) for v in open_) + (255,))
        dr.ellipse([w / 2 - k * .35, h / 2 - k * .5, w / 2, h / 2 - k * .1], fill=tuple(min(255, int(v * 1.25)) for v in open_) + (255,))
    return im

def log(w, h, seed):
    """tora deitada: casca com ranhuras e o topo cortado (anéis) numa ponta"""
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    ny = (yy_ - h / 2) / (h / 2)
    bark = np.array([92, 64, 40.]) * (1 - 0.35 * ny[..., None] ** 2) * (1 + noise((h, w), 1.0, seed)[..., None] * 0.12)
    bark *= (1 + 0.12 * np.sin(yy_ / h * 22 + noise((h, w), 6, seed + 1) * 2))[..., None]
    im = to_img(bark, np.where(np.abs(ny) <= 1, 255, 0)); dr = ImageDraw.Draw(im)
    e = h * 0.36
    dr.ellipse([w - 2 * e, 0, w - 1, h - 1], fill=(204, 162, 106, 255), outline=(110, 74, 40, 255), width=2)
    for k in (0.65, 0.38): dr.ellipse([w - e - e * k, h / 2 - h / 2 * k, w - e + e * k, h / 2 + h / 2 * k], outline=(160, 116, 70, 255))
    return im

def log_pile(w, h, seed):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); n = 5; lh = h / n * 1.05
    rng = np.random.default_rng(seed)
    for i in range(n):
        lg = log(int(w * rng.uniform(0.86, 1.0)), int(lh), seed + i)
        im.alpha_composite(lg, (int(rng.uniform(0, w - lg.width + 1)), int(i * h / n)))
    return im

def stone_block(s, seed):
    im = to_img(stone_tex(int(s), int(s * 0.8), seed, (150, 146, 138))); dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, im.width - 1, im.height - 1], outline=(90, 86, 80, 255), width=2)
    dr.line([(2, 2), (im.width - 3, 2)], fill=(190, 186, 176, 255), width=2)
    return im

def ingot(w, colr):
    h = int(w * 0.42); im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dk = tuple(int(v * .55) for v in colr)
    dr.rectangle([0, 0, w - 1, h - 1], fill=tuple(int(v * .78) for v in colr) + (255,), outline=dk + (255,))
    dr.rectangle([w * .14, h * .22, w * .86, h * .78], fill=tuple(colr) + (255,))
    dr.line([(w * .18, h * .3), (w * .7, h * .3)], fill=(255, 255, 255, 120), width=max(1, h // 8))
    return im

def ingot_stack(w, h, colr, seed):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); iw = int(w / 2.15)
    for row in range(int(h / (iw * 0.44))):
        for col in range(2):
            ig = ingot(iw, tint_c(colr, 0.9 + 0.2 * ((row + col + seed) % 3) / 2))
            im.alpha_composite(ig, (int(col * iw * 1.08 + (row % 2) * 3), int(row * iw * 0.44)))
    return im

def tint_c(c, k): return tuple(int(min(255, v * k)) for v in c)

def fabric_rolls(w, h, seed, cols):
    """rolos de tecido deitados lado a lado, um aberto por cima"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); n = len(cols); rh = h / n
    for i, cl in enumerate(cols):
        yy_, xx_ = np.mgrid[0:int(rh), 0:w].astype(np.float32)
        ny = (yy_ - rh / 2) / (rh / 2)
        c = np.array(cl, np.float32) * (1.1 - 0.45 * ny[..., None] ** 2) * (1 + 0.04 * np.sin(xx_ / 3)[..., None])
        roll = to_img(c, np.where(np.abs(ny) < 0.98, 255, 0)); dr = ImageDraw.Draw(roll)
        dr.ellipse([w - rh * 0.6, 0, w - 1, rh - 1], fill=tint_c(cl, 0.7) + (255,), outline=tint_c(cl, 0.45) + (255,))
        dr.ellipse([w - rh * 0.38, rh * .38, w - rh * 0.22, rh * .62], fill=(70, 50, 30, 255))
        im.alpha_composite(roll, (0, int(i * rh)))
    return im

def open_cloth(w, h, colr, seed, pattern=True):
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    c = np.array(colr, np.float32) * (1 + 0.07 * np.sin(xx_ / w * 14 + noise((h, w), 6, seed) * 2))[..., None]
    im = to_img(c); dr = ImageDraw.Draw(im)
    if pattern:
        for x in np.arange(6, w, 14):
            for y in np.arange(6, h, 14): dr.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(236, 200, 90, 255))
    dr.rectangle([0, 0, w - 1, h - 1], outline=tint_c(colr, 0.6) + (255,), width=2)
    return im

def fruit_basket(seed):
    im = P['basket'].copy(); dr = ImageDraw.Draw(im); rng = np.random.default_rng(seed); c = im.width / 2
    pal = [(200, 40, 36), (230, 150, 30), (120, 170, 50), (230, 200, 60)]
    fc = pal[seed % 4]
    for _ in range(14):
        t = rng.uniform(0, 2 * math.pi); rr = rng.uniform(0, im.width * 0.3); s = im.width * rng.uniform(0.09, 0.12)
        x, y = c + rr * math.cos(t), c + rr * math.sin(t)
        dr.ellipse([x - s, y - s, x + s, y + s], fill=tint_c(fc, rng.uniform(0.8, 1.05)) + (255,), outline=tint_c(fc, 0.55) + (255,))
        dr.ellipse([x - s * .5, y - s * .55, x - s * .1, y - s * .2], fill=(255, 255, 255, 110))
    return im

def cheese_box():
    im = P['CheeseBox_01'].copy(); w, h = im.size; dr = ImageDraw.Draw(im)
    for cx in (w * .27, w * .73):                                # dois queijos nos compartimentos de baixo
        r = h * 0.17; cy = h * 0.79
        dr.ellipse([cx - r * 1.8, cy - r, cx + r * 1.8, cy + r], fill=(232, 190, 80, 255), outline=(170, 120, 40, 255), width=2)
    return im

def wheelbarrow(w, h, seed):
    """carrinho de mão visto de cima: caixa de tábuas, roda na frente, dois cabos atrás, com sacos"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    bw, bh = int(w * 0.7), int(h * 0.62)
    for x in (w * .26, w * .74):
        dr.rectangle([x - w * .03, h * .55, x + w * .03, h - 1], fill=(96, 64, 36, 255))
        dr.rectangle([x - w * .035, h * .9, x + w * .035, h - 1], fill=(60, 40, 22, 255))
    dr.rectangle([w / 2 - w * .07, 0, w / 2 + w * .07, h * .18], fill=(40, 34, 30, 255))
    bx = board(bw, bh, seed, dark=0.75, lip=False); im.alpha_composite(bx, (int((w - bw) / 2), int(h * .12)))
    for i, (x, y) in enumerate(((.38, .3), (.62, .32), (.5, .56))):
        sk = sack(int(bw * .46), int(bh * .5), seed + i); im.alpha_composite(sk, (int(w * x - sk.width / 2), int(h * y - sk.height / 2 + h * .1)))
    return im

def labeled(img, seed, n=1):
    im = img.copy(); dr = ImageDraw.Draw(im); rng = np.random.default_rng(seed); w, h = im.size
    for _ in range(n):
        x, y = rng.uniform(w * .2, w * .6), rng.uniform(h * .25, h * .6); lw, lh = w * .26, h * .2
        dr.rectangle([x, y, x + lw, y + lh], fill=(232, 220, 186, 255), outline=(120, 96, 60, 255))
        for k in range(2): dr.line([(x + 3, y + lh * (.35 + k * .3)), (x + lw * (.8 - k * .25), y + lh * (.35 + k * .3))], fill=(80, 50, 30, 255), width=1)
    return im

def order_board(w, h, seed):
    im = board(w, h, seed, dark=0.6, lip=False); dr = ImageDraw.Draw(im); rng = np.random.default_rng(seed)
    x = 6
    while x < w - 18:
        pw = rng.uniform(14, 22) * SS / 2 + 6; ph = h * rng.uniform(0.55, 0.8); y = rng.uniform(2, h - ph - 2)
        dr.rectangle([x, y, x + pw, y + ph], fill=(236, 226, 196, 255), outline=(150, 130, 96, 255))
        for k in range(3): dr.line([(x + 3, y + 4 + k * 4), (x + pw - 3, y + 4 + k * 4)], fill=(90, 70, 50, 255), width=1)
        dr.ellipse([x + pw / 2 - 2, y, x + pw / 2 + 2, y + 4], fill=(200, 40, 40, 255))
        x += pw + rng.uniform(3, 8)
    return im

def route_table(w, h, seed):
    im = table(w, h, seed); dr = ImageDraw.Draw(im)
    m = int(h * .1); mp = Image.new('RGBA', (w - 2 * m, h - 2 * m), (226, 206, 160, 255)); md = ImageDraw.Draw(mp)
    mw, mh = mp.size; rng = np.random.default_rng(seed)
    for _ in range(5):                                           # contornos de terra
        x, y, rr = rng.uniform(0, mw), rng.uniform(0, mh), rng.uniform(mh * .2, mh * .45)
        md.ellipse([x - rr * 1.4, y - rr, x + rr * 1.4, y + rr], outline=(150, 120, 80, 255), width=2)
    hub = (mw * .5, mh * .55)
    for i in range(8):
        t = math.radians(i * 45 + 10); ex = hub[0] + math.cos(t) * mw * .45; ey = hub[1] + math.sin(t) * mh * .42
        md.line([hub, (ex, ey)], fill=PRISMS[i] if i != 5 else (90, 70, 120), width=2)
        md.ellipse([ex - 3, ey - 3, ex + 3, ey + 3], fill=(110, 40, 30, 255))
    md.ellipse([hub[0] - 5, hub[1] - 5, hub[0] + 5, hub[1] + 5], fill=G4, outline=GD4)
    md.rectangle([0, 0, mw - 1, mh - 1], outline=(150, 120, 80, 255), width=2)
    im.alpha_composite(mp, (m, m))
    return im

def crystals(w, h, seed):
    """cristais de aetherium em caixa forrada de veludo, vistos de cima"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, w - 1, h - 1], fill=(70, 46, 30, 255), outline=(40, 24, 14, 255), width=3)
    dr.rectangle([5, 5, w - 6, h - 6], fill=(46, 22, 70, 255))
    rng = np.random.default_rng(seed)
    for _ in range(9):
        cx, cy = rng.uniform(w * .15, w * .85), rng.uniform(h * .2, h * .8); s = rng.uniform(h * .12, h * .2); t0 = rng.uniform(0, 1)
        pts = [(cx + s * math.cos(t0 + k * math.pi / 3) * (1.6 if k % 3 == 0 else 1), cy + s * math.sin(t0 + k * math.pi / 3) * (1.6 if k % 3 == 0 else 1) * .6) for k in range(6)]
        base = (150, 110, 255) if rng.random() > .4 else (110, 170, 255)
        dr.polygon(pts, fill=base + (255,), outline=(230, 220, 255, 255))
        dr.line([pts[0], pts[3]], fill=(240, 236, 255, 255), width=1)
    return im

def compass_rose(d):
    s = int(d); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    dr.ellipse([2, 2, s - 3, s - 3], fill=(40, 34, 30, 110), outline=G4, width=4)
    dr.ellipse([s * .1, s * .1, s * .9, s * .9], outline=GD4, width=2)
    for i in range(16):                                           # marcas da borda
        t = math.radians(i * 22.5 - 90); r0, r1 = c * .88, c * (.97 if i % 2 == 0 else .93)
        dr.line([(c + r0 * math.cos(t), c + r0 * math.sin(t)), (c + r1 * math.cos(t), c + r1 * math.sin(t))], fill=G4, width=2)
    for i in range(8):                                            # 8 pontas: metade clara, metade escura, ponta na cor do portão
        t = math.radians(i * 45 - 90); L = c * (0.84 if i % 2 == 0 else 0.62); wd = c * 0.13
        tip = (c + L * math.cos(t), c + L * math.sin(t))
        l = (c + wd * math.cos(t - math.pi / 2), c + wd * math.sin(t - math.pi / 2))
        r = (c + wd * math.cos(t + math.pi / 2), c + wd * math.sin(t + math.pi / 2))
        dr.polygon([(c, c), l, tip], fill=(236, 200, 96, 255)); dr.polygon([(c, c), r, tip], fill=(160, 118, 42, 255))
        dr.line([l, tip, r], fill=GD4, width=1)
        k = c * 0.07; x, y = c + (L + k * 1.6) * math.cos(t), c + (L + k * 1.6) * math.sin(t)
        dr.ellipse([x - k, y - k, x + k, y + k], fill=PRISMS[i] + (255,), outline=G4, width=2)
    k = c * 0.1; dr.ellipse([c - k, c - k, c + k, c + k], fill=G4, outline=GD4, width=2)
    return im

def awning(layer, d0, d1, a0, a1, colr, gold=False, fringe_side='in'):
    """toldo listrado (em polar): listras ao longo do raio, franja recortada no lado de dentro (corredor)"""
    m = band_mask(d0, d1, a0, a1)
    stripe = (np.floor((ADEG - a0) / 0.9).astype(int) % 2) == 0
    c = np.where(stripe[..., None], np.array(colr, np.float32), np.array([232, 220, 190.]))
    dd = (RO - R) * SC
    c *= (1 + 0.10 * np.sin((dd / SS) / 6.0))[..., None] * (1 + noise((H, W), 1, 3)[..., None] * 0.03)
    layer.alpha_composite(to_img(c, np.where(m, 230, 0)))
    edge_a = a0 if fringe_side == 'in' and a0 > 0 else a1 if fringe_side == 'in' else a0
    # franja de bicos ao longo da borda do lado do corredor
    for dd_ in np.arange(d0 + 3, d1 - 2, 6):
        x, y = rp(d2r(dd_), edge_a); s = 3.2 * SS
        sgn = -1 if edge_a == a0 else 1
        k = rp(d2r(dd_), edge_a + sgn * 0.0)
        dr = ImageDraw.Draw(layer)
        dx, dy = math.cos(math.radians(edge_a)), math.sin(math.radians(edge_a))
        tip = (x - sgn * dx * s * 1.4, y - sgn * dy * s * 1.4)
        dr.polygon([(x - dy * s, y + dx * s), (x + dy * s, y - dx * s), tip],
                   fill=(G4 if gold else tint_c(colr, 0.8) + (255,)))
    edge = (np.abs((ADEG - edge_a) * np.pi / 180 * R * SC) < 2.0) & (R <= d2r(d0)) & (R >= d2r(d1))
    layer.alpha_composite(to_img(np.zeros((H, W, 3)) + (GOLD if gold else np.array(colr) * 0.6), np.where(edge, 255, 0)))

def counter(layer, d0, d1, a0, a1, level):
    layer.alpha_composite(polar_band(planks, KP, d0, d1, a0, a1, 0.95, rot=True))
    layer.alpha_composite(polar_band(planks, KP, d1 - 4, d1, a0, a1, 0.42))             # borda da frente
    layer.alpha_composite(polar_band(planks, KP, d0, d0 + 3, a0, a1, 0.5))
    for a in (a0, a1 - 0.4): layer.alpha_composite(polar_band(planks, KP, d0, d1, a, a + 0.4, 0.38))
    if level >= 3:
        gl = band_mask(d0, d1, a0, a1) & ((np.abs(R - d2r(d1 - 1)) * SC < 1.6) | (np.abs(R - d2r(d0 + 1)) * SC < 1.6))
        layer.alpha_composite(to_img(np.zeros((H, W, 3)) + GOLD, np.where(gl, 255, 0)))

def stall_table(layer, d0, d1, a0, a1, seed, cloth=None):
    layer.alpha_composite(polar_band(planks, KP, d0, d1, a0, a1, 1.25, rot=True))
    edge = band_mask(d0, d1, a0, a1) & ~band_mask(d0 + 3, d1 - 3, a0 + 0.3, a1 - 0.3)
    layer.alpha_composite(solid((52, 32, 18), edge))
    if cloth is not None:
        layer.alpha_composite(solid(cloth, band_mask(d0 + 4, d1 - 4, a0 + 0.5, a1 - 0.5), seed, 0.04))

# ------------------------------------------------------------------ níveis
def compose(level):
    fxl = []
    def fx(t_, x, y, **kw): fxl.append((t_, x, y, kw))
    canvas = floor_planks()
    floor_deco = new_layer(); low = new_layer(); mid_ = new_layer(); top = new_layer(); wallp = new_layer(); over = new_layer()

    # ---------------- corredor: lajes (1), tapete (2), mármore branco e rosa dos ventos (3)
    if level < 3:
        k = 1024 / (300 * SS)
        u = A * R * SC * k; v = (RO - R) * SC * k
        st = sample(stone, u, v); lum = st.mean(-1, keepdims=True); st = (st * .35 + lum * .65) * np.array([1, .95, .88]) * .85
        floor_deco.alpha_composite(to_img(st, np.where(band_mask(70, 260, -2.0, 2.0), 255, 0)))
    if level == 2:
        rn = runner(int(40 * SS), int(150 * SS), 5); place(floor_deco, rn, 76 + 84, 0, width_px=rn.width)
    if level >= 3:
        floor_deco.alpha_composite(polar_band(white_marble, 2048 / (420 * SS), 70, 260, -2.2, 2.2, 1.0))
        gl = band_mask(70, 260, -2.2, 2.2) & (np.abs(np.abs(ADEG) - 2.2) * R * SC * math.pi / 180 < 2.4)
        floor_deco.alpha_composite(to_img(np.zeros((H, W, 3)) + GOLD, np.where(gl, 255, 0)))
        cr = compass_rose(64 * SS); x, y = place(floor_deco, cr, 160, 0, width_px=cr.width)
        fx('glow', x, y, color='#E2B84A', radius=0.07)

    # ---------------- balcão de câmbio (fundo, centro)
    counter(mid_, 44, 68, -5.4, 5.4, level)
    place(low, P['stool'], 34, 0.8, width_m=0.4)
    place(top, scales(int(0.62 * PPM) if level < 3 else int(0.78 * PPM), gold=level >= 3), 57, -3.0, width_px=int(0.62 * PPM) if level < 3 else int(0.78 * PPM))
    place(top, open_book(int(0.5 * PPM), int(0.34 * PPM)), 57, 0.2, width_m=0.5)
    place(top, coin_bag(0.3 * PPM, 3), 57, 3.0, width_m=0.42)
    x, y = place(top, lantern_lit(P['lantern']), 57, 4.4, width_m=0.26)
    fx('glow', x, y, color='#ffb347', radius=0.035)
    if level >= 2:
        place(top, P['magnifying_glass_01'], 57, 1.7, rot_extra=-35, width_m=0.16)
        ob = order_board(int(1.2 * PPM), int(0.34 * PPM), 12)
        place(low, ob, 26, 0.2, width_px=ob.width)
    if level >= 3:
        ch = P['chest'].copy(); scatter_coins(ch, ch.width * .5, ch.height * .45, ch.width * .25, 18, ch.width * .1, 5)
        place(mid_, ch, 30, 4.2, width_m=0.8)
        place(mid_, route_table(int(1.1 * PPM), int(0.62 * PPM), 21), 30, -4.0, width_m=1.1)

    # ---------------- alas: bancas dos mercadores
    BACK, FRONT = (18, 104), (124, 198)
    if level == 1:
        # banca esquerda: madeira e pedra
        stall_table(low, 22, 112, -15.2, -8.0, 1)
        place(mid_, log_pile(int(1.6 * PPM), int(0.8 * PPM), 3), 44, -11.6, width_m=1.6)
        for i, (dd, aa) in enumerate(((90, -14.0), (90, -11.6), (90, -9.2), (110, -13.0), (110, -10.4))):
            place(mid_, stone_block(0.42 * PPM, 30 + i), dd - 6, aa, rot_extra=(i * 7) % 11 - 5, width_m=0.42)
        # banca direita: metais
        stall_table(low, 22, 70, 8.0, 15.2, 2)
        place(mid_, ingot_stack(int(1.0 * PPM), int(0.6 * PPM), (150, 150, 158), 0), 46, 10.0, width_m=1.0)
        place(mid_, ingot_stack(int(1.0 * PPM), int(0.6 * PPM), (184, 110, 70), 1), 46, 13.4, width_m=1.0)
        place(mid_, P['bucket'], 92, 9.6, width_m=0.5)
        place(mid_, P['wooden_crate_02'], 96, 13.0, rot_extra=90, width_m=1.0)
        x, y = place(top, lantern_lit(P['lantern']), 84, -15.0, width_m=0.26)
    else:
        cols = [(170, 40, 40), (40, 80, 160), (50, 120, 70), (200, 140, 40)]
        stalls = [(BACK, -15.4, -7.6, 0), (FRONT, -15.4, -7.6, 1), (BACK, 7.6, 15.4, 2), (FRONT, 7.6, 15.4, 3)]
        for (d0, d1), a0, a1, i in stalls:
            stall_table(low, d0 + 6, d1 - 6, a0 + (2.4 if a0 < 0 else 0.6), a1 - (0.6 if a0 < 0 else 2.4), 10 + i,
                        cloth=[None, (90, 60, 40), None, None][i])
        # tecidos (esquerda, fundo)
        place(mid_, fabric_rolls(int(1.5 * PPM), int(0.9 * PPM), 1, [(150, 30, 40), (40, 70, 150), (200, 170, 60), (60, 120, 70), (120, 50, 130)]), 50, -10.2, width_m=1.5)
        place(mid_, open_cloth(int(1.0 * PPM), int(0.55 * PPM), (40, 70, 150), 4), 88, -10.0, rot_extra=4, width_m=1.0)
        # especiarias (esquerda, frente)
        spices = [(230, 170, 30), (190, 50, 30), (120, 70, 40), (90, 130, 60), (200, 90, 40)]
        for i, (dd, aa) in enumerate(((140, -12.4), (140, -10.4), (162, -11.4), (162, -9.4), (182, -10.4))):
            place(mid_, sack(int(0.55 * PPM), int(0.5 * PPM), 40 + i, open_=spices[i]), dd, aa, width_m=0.55)
        for i, (dd, aa) in enumerate(((150, -8.6), (176, -8.6))):
            place(mid_, P['ceramic_pot'], dd, aa, rot_extra=i * 40, width_m=0.5)
        # metais e madeira (direita, fundo)
        place(mid_, ingot_stack(int(0.9 * PPM), int(0.55 * PPM), (150, 150, 158), 0), 44, 9.6, width_m=0.9)
        place(mid_, ingot_stack(int(0.9 * PPM), int(0.55 * PPM), (184, 110, 70), 1), 44, 12.2, width_m=0.9)
        place(mid_, log_pile(int(1.5 * PPM), int(0.75 * PPM), 3), 84, 10.8, width_m=1.5)
        # comida (direita, frente)
        place(mid_, cheese_box(), 146, 9.4, rot_extra=0, width_m=0.62)
        for i, (dd, aa) in enumerate(((146, 11.8), (174, 9.0), (176, 11.4))):
            place(mid_, fruit_basket(i), dd, aa, width_m=0.5)
        # toldos
        for (d0, d1), a0, a1, i in stalls:
            if a0 < 0: awning(over, d0, d1, -16.2, -13.0, cols[i], gold=level >= 3)
            else: awning(over, d0, d1, 13.0, 16.2, cols[i], gold=level >= 3)
        for sgn in (-1, 1):
            x, y = place(top, lantern_lit(P['lantern']), 114, sgn * 12.0, width_m=0.26)
            fx('glow', x, y, color='#ffb347', radius=0.035)
    if level == 1:
        fx('glow', x, y, color='#ffb347', radius=0.03)

    # ---------------- nível 3: banca de aetherium e vitrine de raridades, junto ao corredor
    if level >= 3:
        stall_table(low, 92, 126, -7.2, -3.8, 50)
        cx = crystals(int(0.85 * PPM), int(0.55 * PPM), 7); x, y = place(mid_, cx, 109, -5.5, width_m=0.85)
        gl = glass_over(int(1.0 * PPM), int(0.7 * PPM)); place(over, gl, 109, -5.5, width_m=1.0)
        fx('glow', x, y, color='#9b7dff', radius=0.05); fx('sparks', x, y, color='#c9b8ff')
        stall_table(low, 92, 126, 3.8, 7.2, 51, cloth=(40, 30, 60))
        place(mid_, P['brass_vase_03'], 103, 4.8, width_m=0.34)
        place(mid_, P['vase1'], 103, 6.3, width_m=0.36)
        place(mid_, P['goblets'], 116, 5.4, width_m=0.42)
        gl = glass_over(int(1.0 * PPM), int(0.7 * PPM)); place(over, gl, 109, 5.5, width_m=1.0)

    # ---------------- doca de carga, junto à porta
    if level == 1:
        place(mid_, P['wooden_crate_02'], 228, -12.8, rot_extra=0, width_m=1.1)
        place(mid_, P['crate'], 232, -8.6, rot_extra=8, width_m=0.75)
        for i, aa in enumerate((8.0, 9.6)):
            place(mid_, P['wine_barrel_01'], 236, aa, width_m=0.62)
        place(mid_, P['wine_barrel_01_lay'], 226, 12.6, rot_extra=90, width_m=0.62)
        for i, (dd, aa) in enumerate(((200, -9.6), (204, -7.8))):
            place(mid_, sack(int(0.6 * PPM), int(0.48 * PPM), 60 + i), dd, aa, rot_extra=i * 25, width_m=0.6)
        place(mid_, P['ceramic_pot'], 214, 5.2, width_m=0.5)
        place(mid_, P['ceramic_pot'], 238, 5.4, rot_extra=60, width_m=0.46)
        place(mid_, labeled(P['crate'], 4), 190, 13.2, rot_extra=-6, width_m=0.75)
        place(mid_, P['wooden_crate_02'], 170, -13.4, rot_extra=90, width_m=1.0)
        for i, (dd, aa) in enumerate(((176, 9.4), (198, 10.4))):
            place(mid_, sack(int(0.6 * PPM), int(0.48 * PPM), 70 + i), dd, aa, rot_extra=i * 40, width_m=0.6)
    else:
        place(mid_, labeled(P['wooden_crate_02'], 1, 2), 232, -13.0, width_m=1.1)
        place(mid_, labeled(P['crate'], 2), 236, -9.2, rot_extra=8, width_m=0.75)
        place(mid_, labeled(P['crate'], 3), 214, -7.0, rot_extra=-12, width_m=0.6)
        for aa in (8.6, 10.2):
            place(mid_, P['wine_barrel_01'], 238, aa, width_m=0.62)
        place(mid_, P['wine_barrel_01_lay'], 224, 13.2, rot_extra=90, width_m=0.62)
        place(mid_, wheelbarrow(int(0.8 * PPM), int(1.4 * PPM), 9), 212, 6.0, rot_extra=-20, height_m=1.3)
        place(mid_, P['brass_pot_02'], 240, 5.0, width_m=0.4)
        place(mid_, sack(int(0.6 * PPM), int(0.48 * PPM), 61), 216, -10.6, rot_extra=20, width_m=0.6)

    th = new_layer(); threshold_and_door(th); canvas.alpha_composite(th)
    canvas = with_shadow(canvas, floor_deco, off=3, blur=3, strength=0.3)
    canvas = with_shadow(canvas, low, off=6, blur=5, strength=0.45)
    canvas = with_shadow(canvas, mid_, off=10, blur=8, strength=0.5)
    canvas = with_shadow(canvas, top, off=5, blur=3, strength=0.45)
    canvas = with_shadow(canvas, over, off=8, blur=8, strength=0.35)
    walls = build_walls(level); walls.alpha_composite(wallp)
    canvas = with_shadow(canvas, walls, off=12, blur=9, strength=0.5)

    c = np.asarray(canvas, np.float32)
    for t_, x, y, kw in fxl:
        if t_ != 'glow': continue
        rad = kw['radius'] * W * 1.6
        g = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * (rad / 2) ** 2))[..., None]
        c[..., :3] = c[..., :3] * (1 + 0.22 * g) + np.array([60, 30, 0]) * g * 0.35
    canvas = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), 'RGBA')

    out = canvas.resize((768, 311), Image.LANCZOS)
    mask = Image.open(f'{PIPE}/templates/middle_arc_mask.png').convert('L')
    out.putalpha(ImageChops.darker(out.getchannel('A'), mask))
    name = 'trading_post.middle.png' if level == 1 else f'trading_post.middle.lv{level}.png'
    out.save(f'{OUT}/{name}')
    return out, fxl

levels = {lv: compose(lv) for lv in (1, 2, 3)}

def key(t_, x, y, kw): return (t_, round(x / W, 3), round(y / H, 3), json.dumps(kw, sort_keys=True))
allk = {}
for lv in (1, 2, 3):
    for e in levels[lv][1]: allk.setdefault(key(*e), []).append(lv)
fxs = []
for k, lvs in allk.items():
    t_, x, y, kw = k; e = {'type': t_, 'x': x, 'y': y}; e.update(json.loads(kw))
    if min(lvs) > 1: e['minLevel'] = min(lvs)
    if max(lvs) < 3: e['maxLevel'] = max(lvs)
    fxs.append(e)
json.dump(fxs, open(f'{OUT}/_fx.json', 'w'), indent=1)

sheet = Image.new('RGB', (768 * 3 + 40, 311 + 40), (30, 27, 38))
dr = ImageDraw.Draw(sheet)
for i, lv in enumerate((1, 2, 3)):
    sheet.paste(levels[lv][0], (10 + i * 778, 30), levels[lv][0]); dr.text((14 + i * 778, 10), f'Nivel {lv}', fill=(226, 184, 74))
sheet.save(f'{OUT}/entreposto_niveis.jpg', quality=90)
print('ok', len(fxs), 'fx')
