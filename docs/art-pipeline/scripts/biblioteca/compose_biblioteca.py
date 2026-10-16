"""Biblioteca (id library) – slot middle (layout v4), 3 níveis, interior visto de cima.
Uso: python3 -I compose_biblioteca.py <pasta_dl> <pasta_renders> <repo> <pasta_saida>
  <pasta_dl>      zips extraídos: planks/ (Planks039 2K), marble/ (Marble001 2K)
  <pasta_renders> renders de cima (render_topdown.py): chair, table (os mesmos da Prisão)
  <repo>          raiz do projeto (texturas em public/assets/textures, renders e moldes em docs/)
Trabalha em 2x (1536x622) e reduz para 768x311 no final.
Base (piso, paredes, porta, helpers) reaproveitada do compose_entreposto.py."""
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

white_marble = ftex(f'{DL}/marble/Marble001_2K-JPG_Color.jpg') * np.array([1.0, 0.98, 0.94])
KP = 2048 / (2.6 * PPM) * 0.55                                   # escala das tábuas em polar_band


# ================================================================== Biblioteca
# ------------------------------------------------------------------ props renderizados
P = {k: load(f'{REN}/{k}.png') for k in ['chair', 'table']}
P['chair'] = tint(P['chair'], (0.82, 0.72, 0.64), 1.1)
for k, p in [('mesa', 'arquivo/mesa.png'), ('castical', 'arquivo/castical2.png'), ('castical3', 'arquivo/castical3.png'),
             ('lamparina', 'arquivo/lamparina.png'), ('gaveteiro', 'arquivo/gaveteiro.png'), ('bau', 'arquivo/bau.png'),
             ('pilha1', 'arquivo/pilha1.png'), ('pilha2', 'arquivo/pilha2.png'), ('pilha3', 'arquivo/pilha3.png'),
             ('livros', 'livros.png'), ('candelabro', 'candelabro.png'), ('stool', 'guilda/stool.png'),
             ('lantern', 'deposito/wooden_lantern_01.png'), ('crate', 'deposito/crate.png'),
             ('bust', 'santuario/marble_bust_01.png'), ('lupa', 'entreposto/magnifying_glass_01.png')]:
    P[k] = load(f'{PIPE}/renders/{p}')

# ------------------------------------------------------------------ helpers do piso (iguais ao Entreposto)
def floor_planks():
    u = A * R * SC * KP * 1.8; v = (RO - R) * SC * KP * 1.8
    col = sample(planks, v + 300, u + 120)                       # tábuas estreitas, no sentido do raio
    lum = col.mean(-1, keepdims=True); col = (col * .7 + lum * .3) * 0.86
    din = np.minimum.reduce([(R - (RI + T)) * SC, ((RO - T) - R) * SC, (HALF - T / np.maximum(R, 1e-3) - np.abs(A)) * R * SC])
    col *= (1 - 0.45 * np.exp(-np.clip(din, 0, None) / (11 * SS)))[..., None]
    return to_img(col)

def band_mask(d0, d1, a0, a1): return (R <= d2r(d0)) & (R >= d2r(d1)) & (ADEG >= a0) & (ADEG <= a1)

def solid(colr, m, seed=0, var=0.05):
    c = np.zeros((H, W, 3)) + np.array(colr, np.float32)
    c *= 1 + noise((H, W), 1.0, seed)[..., None] * var
    return to_img(c, np.where(m, 255, 0))

# ------------------------------------------------------------------ props feitos por código
LEATHER = [(110, 30, 28), (70, 44, 28), (38, 70, 46), (32, 44, 84), (150, 104, 40), (40, 30, 26),
           (120, 64, 30), (86, 24, 50), (60, 80, 90), (150, 130, 100)]

def book_row(im, x0, y0, x1, y1, seed, open_down=True, fill=0.95, gold=False, palette=None):
    """fileira de livros vistos de cima, encostados no fundo da prateleira; a lombada fica do lado aberto"""
    rng = np.random.default_rng(seed); dr = ImageDraw.Draw(im)
    pal = palette or LEATHER
    depth = y1 - y0; x = x0
    while x < x1 - 2:
        t = int(rng.integers(3, 8))
        if rng.random() > fill:                                   # vão na prateleira
            x += int(rng.integers(6, 20)); continue
        if x + t > x1: break
        c = np.array(pal[rng.integers(len(pal))], np.float32) * rng.uniform(0.75, 1.15)
        dd = depth * rng.uniform(0.72, 0.96)
        if open_down: ya, yb = y1 - dd, y1
        else: ya, yb = y0, y0 + dd
        top = tuple(int(min(255, v)) for v in c) + (255,)
        dr.rectangle([x, ya, x + t - 1, yb], fill=top)
        # páginas: faixa clara no miolo do topo do livro
        if t >= 4: dr.line([(x + t / 2, ya + 2), (x + t / 2, yb - 3)], fill=(214, 200, 168, 200), width=1)
        sp = (yb - 2, yb) if open_down else (ya, ya + 2)
        dr.rectangle([x, sp[0], x + t - 1, sp[1]], fill=tuple(int(min(255, v * 1.3 + 20)) for v in c) + (255,))
        if gold and rng.random() < 0.45: dr.rectangle([x, sp[0] - 1, x + t - 1, sp[1]], fill=G4)
        dr.line([(x + t - 1, ya), (x + t - 1, yb)], fill=(20, 12, 8, 160), width=1)
        x += t
    return im

def bookcase(L, D, seed, double=False, gold=False, fill=0.95, palette=None):
    """estante vista de cima, comprida em x. single: aberta para baixo; double: aberta dos dois lados"""
    L, D = int(L), int(D)
    im = to_img(wood(L, D, dark=0.55, seed=seed)); dr = ImageDraw.Draw(im)
    f = max(4, D // 9)
    dr.rectangle([0, 0, L - 1, D - 1], outline=(30, 18, 10, 255), width=2)
    if double:
        mid = D // 2
        dr.rectangle([f, f, L - 1 - f, mid - 2], fill=(28, 18, 12, 255))
        dr.rectangle([f, mid + 2, L - 1 - f, D - 1 - f], fill=(28, 18, 12, 255))
        book_row(im, f + 1, f, L - f - 1, mid - 2, seed, open_down=False, fill=fill, gold=gold, palette=palette)
        book_row(im, f + 1, mid + 2, L - f - 1, D - 1 - f, seed + 1, open_down=True, fill=fill, gold=gold, palette=palette)
    else:
        dr.rectangle([f, f, L - 1 - f, D - 1], fill=(28, 18, 12, 255))
        book_row(im, f + 1, f, L - f - 1, D - 1, seed, open_down=True, fill=fill, gold=gold, palette=palette)
    # montantes (divisões das prateleiras)
    n = max(1, round(L / (0.9 * PPM)))
    for i in range(1, n):
        x = i * L / n; dr.rectangle([x - f / 2, 0, x + f / 2, D - 1], fill=(64, 40, 24, 255))
    dr.rectangle([0, 0, f, D - 1], fill=(64, 40, 24, 255)); dr.rectangle([L - 1 - f, 0, L - 1, D - 1], fill=(64, 40, 24, 255))
    if gold:
        dr.rectangle([0, 0, L - 1, D - 1], outline=G4, width=3)
        for x in [0, L - 1] + [i * L / n for i in range(1, n)]:
            k = f * 0.6; dr.ellipse([x - k, D / 2 - k, x + k, D / 2 + k] if double else [x - k, f / 2 - k / 2, x + k, f / 2 + k * 1.5], fill=G4, outline=GD4)
    return im

def ladder(Lp, Wp):
    im = Image.new('RGBA', (int(Wp), int(Lp)), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    rw = max(3, int(Wp * 0.16))
    for y in np.arange(rw, Lp - rw, Lp / 9):
        dr.rectangle([rw, y, Wp - rw, y + rw * 0.8], fill=(118, 80, 46, 255), outline=(50, 30, 16, 255))
    for x in (0, Wp - rw):
        dr.rectangle([x, 0, x + rw, Lp - 1], fill=(104, 68, 38, 255), outline=(46, 28, 14, 255))
    for y in (2, Lp - rw - 2):
        dr.ellipse([-1, y, rw + 1, y + rw + 2], fill=(40, 40, 44, 255)); dr.ellipse([Wp - rw - 1, y, Wp, y + rw + 2], fill=(40, 40, 44, 255))
    return im

def candle_flames(img, pts, k=0.12):
    im = img.copy(); dr = ImageDraw.Draw(im); r = im.width * k
    for fx_, fy_ in pts:
        cx, cy = im.width * fx_, im.height * fy_
        dr.ellipse([cx - r * 1.7, cy - r * 1.7, cx + r * 1.7, cy + r * 1.7], fill=(255, 150, 50, 110))
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 205, 110, 255))
        dr.ellipse([cx - r * .45, cy - r * .45, cx + r * .45, cy + r * .45], fill=(255, 248, 220, 255))
    return im

def lantern_lit(img):
    return candle_flames(img, [(0.5, 0.5)], 0.2)

def globe(d, gold=False):
    s = int(d * 1.25); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); c = s / 2
    yy_, xx_ = np.mgrid[0:s, 0:s].astype(np.float32); rr = np.hypot(xx_ - c, yy_ - c) / (d / 2)
    n = noise((s, s), s / 14, 3)
    land = n > 0.35
    col = np.where(land[..., None], np.array([170, 150, 100.]), np.array([70, 110, 130.]))
    shade = np.clip(1.1 - 0.55 * rr ** 2, 0.3, 1.2) * (1 - 0.25 * np.clip((xx_ + yy_ - 2 * c) / s, 0, 1))
    col = col * shade[..., None]
    a = np.where(rr <= 1, 255, 0)
    im.alpha_composite(to_img(col, a)); dr = ImageDraw.Draw(im)
    rc = G4 if gold else (170, 120, 50, 255)
    dr.ellipse([c - d / 2 - 4, c - d / 2 - 4, c + d / 2 + 4, c + d / 2 + 4], outline=rc, width=5)
    dr.arc([c - d * .18, c - d / 2, c + d * .18, c + d / 2], 0, 360, fill=(60, 50, 30, 120), width=1)
    dr.line([(c - d / 2, c), (c + d / 2, c)], fill=(60, 50, 30, 110), width=1)
    k = d * 0.07; dr.ellipse([c - k, c - k, c + k, c + k], fill=rc)
    dr.ellipse([c - d * .28, c - d * .3, c - d * .12, c - d * .16], fill=(255, 255, 255, 90))
    return im

def parchment(w, h, seed, lines=True):
    rng = np.random.default_rng(seed)
    c = np.array([226, 210, 170.]) * (1 + noise((h, w), 2, seed)[..., None] * 0.05)
    im = to_img(c); dr = ImageDraw.Draw(im)
    if lines:
        for y in np.arange(5, h - 4, 3.4): dr.line([(4, y), (w - 4 - rng.integers(0, w // 4), y)], fill=(110, 90, 60, 170), width=1)
    dr.rectangle([0, 0, w - 1, h - 1], outline=(160, 136, 90, 255))
    return im

def open_book(w, h, cover=(96, 34, 30), glow=None, runes=False):
    pad = int(w * 0.25) if glow else 0
    im = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    if glow:
        for k in range(pad, 0, -2):
            al = int(70 * (1 - k / pad) ** 1.5)
            dr.rounded_rectangle([pad - k, pad - k, pad + w + k, pad + h + k], radius=k, fill=glow + (al,))
    dr.rounded_rectangle([pad, pad, pad + w - 1, pad + h - 1], radius=3, fill=cover + (255,))
    b = max(2, w // 16)
    for x0, x1 in ((pad + b, pad + w / 2 - 1), (pad + w / 2 + 1, pad + w - 1 - b)):
        dr.rectangle([x0, pad + b, x1, pad + h - 1 - b], fill=(236, 224, 192, 255))
        for y in np.arange(pad + b + 4, pad + h - b - 3, 3.2):
            dr.line([(x0 + 3, y), (x1 - 3, y)], fill=(120, 96, 70, 170), width=1)
    dr.line([(pad + w / 2, pad + b), (pad + w / 2, pad + h - b)], fill=(150, 120, 90, 255), width=2)
    if runes and glow:
        for i, (cx, cy) in enumerate(((pad + w * .25, pad + h * .5), (pad + w * .75, pad + h * .5))):
            rr = h * 0.22
            dr.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=glow + (255,), width=2)
            for j in range(6):
                t = math.radians(j * 60 + i * 30)
                dr.line([(cx, cy), (cx + rr * math.cos(t), cy + rr * math.sin(t))], fill=glow + (220,), width=1)
    dr.rectangle([pad + w * .3, pad + h - b - 1, pad + w * .34, pad + h + 2], fill=G4)
    return im

def closed_book(w, h, colr, gold=False):
    im = Image.new('RGBA', (int(w), int(h)), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, w - 1, h - 1], fill=tuple(colr) + (255,), outline=tuple(int(v * .5) for v in colr) + (255,))
    dr.rectangle([w - 4, 2, w - 2, h - 3], fill=(226, 212, 176, 255))
    if gold:
        dr.rectangle([3, 3, w - 7, h - 4], outline=G4, width=1)
    return im

def lectern(w, h, level):
    """atril de leitura: pedestal de latão octogonal com o tomo aberto em cima"""
    s = int(max(w, h) * 1.4); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    pts = [(c + s * .46 * math.cos(math.radians(22.5 + 45 * i)), c + s * .46 * math.sin(math.radians(22.5 + 45 * i))) for i in range(8)]
    dr.polygon(pts, fill=(52, 44, 40, 255), outline=G4); dr.line(pts + [pts[0]], fill=G4, width=4)
    dr.rectangle([c - w / 2 - 6, c - h / 2 - 6, c + w / 2 + 6, c + h / 2 + 6], fill=(150, 112, 40, 255), outline=G4, width=3)
    return im

def crystal_lamp(d):
    s = int(d * 2.2); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    for k in range(int(d), 0, -2):
        al = int(90 * (1 - k / d) ** 1.4); dr.ellipse([c - k, c - k, c + k, c + k], fill=(200, 235, 255, al))
    pts = [(c + d * .42 * math.cos(math.radians(60 * i + 30)), c + d * .42 * math.sin(math.radians(60 * i + 30))) for i in range(6)]
    dr.polygon(pts, fill=(170, 220, 255, 255), outline=G4); dr.line(pts + [pts[0]], fill=G4, width=2)
    for p_ in pts: dr.line([(c, c), p_], fill=(235, 250, 255, 200), width=1)
    k = d * 0.14; dr.ellipse([c - k, c - k, c + k, c + k], fill=(250, 255, 255, 255))
    return im

def rug(w, h, seed, base=(30, 40, 80), border=(110, 26, 32)):
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    edge = np.minimum(np.minimum(xx_, w - 1 - xx_), np.minimum(yy_, h - 1 - yy_))
    img = np.zeros((h, w, 3), np.float32) + np.array(base)
    b = min(w, h) * 0.12
    img[edge < b] = border
    img[(edge > b - 5) & (edge < b - 2)] = GOLD
    img[edge < 2.5] = GOLD_D
    # medalhão central
    cx, cy = w / 2, h / 2; e = ((xx_ - cx) / (w * .22)) ** 2 + ((yy_ - cy) / (h * .3)) ** 2
    img[e < 1] = border; img[(e > .82) & (e < 1)] = GOLD
    img *= (1 + noise((h, w), 0.7, seed)[..., None] * 0.06 + noise((h, w), 10, seed + 1)[..., None] * 0.08)
    return to_img(img)

def bookcart(w, h, seed):
    im = board(int(w), int(h), seed, dark=0.75, lip=False); dr = ImageDraw.Draw(im)
    f = 5; dr.rectangle([f, f, w - f, h - f], fill=(30, 20, 12, 255))
    book_row(im, f + 1, f, w - f - 1, h / 2 - 1, seed, open_down=False, fill=0.8)
    book_row(im, f + 1, h / 2 + 1, w - f - 1, h - f, seed + 3, open_down=True, fill=0.7)
    for x, y in ((0, 0), (w - 8, 0), (0, h - 8), (w - 8, h - 8)): dr.ellipse([x, y, x + 8, y + 8], fill=(40, 40, 44, 255))
    return im

# ------------------------------------------------------------------ estantes
def wall_shelves(layer, d0, d1, a0, a1, seed, gold, fill, seg=3.6):
    """estantes encostadas na parede do fundo, em módulos retos que acompanham a curva"""
    n = max(1, round((a1 - a0) / seg)); st = (a1 - a0) / n
    for i in range(n):
        a = a0 + st * (i + 0.5); dm = (d0 + d1) / 2
        L = d2r(dm) * SC * math.radians(st) * 0.99; D = (d1 - d0) * SS
        place(layer, bookcase(L, D, seed + i, gold=gold, fill=fill), dm, a, width_px=L)

def side_shelves(layer, d0, d1, sgn, seed, gold, fill, a=15.35):
    """estante na parede lateral (radial), aberta para o miolo da sala"""
    L = (d1 - d0) * SS; D = 0.42 * PPM
    bc = bookcase(L, D, seed, gold=gold, fill=fill)
    bc = bc.rotate(-90 if sgn < 0 else 90, expand=True)           # lado aberto voltado para o centro
    place(layer, bc, (d0 + d1) / 2, sgn * a, height_m=L / PPM)

def stack(layer, d0, d1, a, seed, gold, fill):
    """estante dupla no meio da ala, no sentido do raio"""
    L = (d1 - d0) * SS; D = 0.6 * PPM
    bc = bookcase(L, D, seed, double=True, gold=gold, fill=fill).rotate(90, expand=True)
    place(layer, bc, (d0 + d1) / 2, a, height_m=L / PPM)

# ------------------------------------------------------------------ níveis
def compose(level):
    fxl = []
    def fx(t_, x, y, **kw): fxl.append((t_, x, y, kw))
    canvas = floor_planks()
    floor_deco = new_layer(); low = new_layer(); mid_ = new_layer(); top = new_layer(); over = new_layer()
    gold = level >= 3
    fill = {1: 0.62, 2: 0.9, 3: 0.97}[level]

    # ---------------- piso: tapetes (2+), círculo de leitura em mármore com o emblema (3)
    if level >= 2:
        rg = rug(int(3.4 * PPM), int(1.75 * PPM), 4); place(floor_deco, rg, 104, 0, width_px=rg.width)
    if level >= 3:
        cd = d2r(204); cxy = rp(cd, 0); rad = 44 * SS
        m = np.hypot(xx - cxy[0], yy - cxy[1]) < rad
        mb = sample(marble, xx * 0.9, yy * 0.9)
        ring = (np.abs(np.hypot(xx - cxy[0], yy - cxy[1]) - rad + 4) < 3.5)
        mb[ring] = GOLD
        floor_deco.alpha_composite(to_img(mb, np.where(m, 255, 0)))
        em = emblem(56 * SS); x, y = place(floor_deco, em, 204, 0, width_px=em.width)
        fx('glow', x, y, color='#E2B84A', radius=0.06)

    # ---------------- estantes da parede do fundo
    if level == 1:
        wall_shelves(mid_, 14, 40, -15.6, -6.0, 10, gold, fill)
        wall_shelves(mid_, 14, 40, 6.0, 15.6, 20, gold, fill)
    else:
        wall_shelves(mid_, 14, 40, -15.6, -2.6, 10, gold, fill)
        wall_shelves(mid_, 14, 40, 2.6, 15.6, 20, gold, fill)

    # ---------------- nicho central do fundo
    if level == 1:
        for i, (dd, aa, k) in enumerate(((30, -3.6, 'pilha1'), (28, 3.4, 'pilha2'), (32, 0.2, 'crate'))):
            place(mid_, P[k], dd, aa, rot_extra=(i * 23) % 40 - 20, width_m=0.55 if k != 'crate' else 0.75)
    else:
        ped = Image.new('RGBA', (int(0.7 * PPM), int(0.7 * PPM)), (0, 0, 0, 0)); pd = ImageDraw.Draw(ped)
        pd.rectangle([0, 0, ped.width - 1, ped.height - 1], fill=(120, 112, 104, 255) if level == 2 else (40, 36, 34, 255),
                     outline=G4 if level >= 3 else (80, 74, 68, 255), width=3)
        place(mid_, ped, 32, 0, width_m=0.7)
        place(top, P['bust'], 32, 0, rot_extra=180, width_m=0.5)
        if level >= 3:
            for sgn in (-1, 1):
                x, y = place(top, crystal_lamp(0.22 * PPM), 30, sgn * 1.85, width_m=0.48)
                fx('glow', x, y, color='#dff4ff', radius=0.03)

    # ---------------- alas: estantes laterais e duplas
    if level == 1:
        for sgn in (-1, 1):
            side_shelves(mid_, 52, 150, sgn, 30 + sgn, gold, fill)
            stack(mid_, 52, 140, sgn * 11.2, 40 + sgn, gold, fill)
    else:
        for sgn in (-1, 1):
            side_shelves(mid_, 52, 176, sgn, 30 + sgn, gold, fill)
            stack(mid_, 52, 150, sgn * 12.3, 40 + sgn, gold, fill)
            stack(mid_, 52, 150, sgn * 8.8, 50 + sgn, gold, fill)
        # escadas de correr encostadas nas estantes
        for sgn, aa, dd in ((-1, 13.75, 96), (1, 10.45, 112)):
            place(top, ladder(1.3 * PPM, 0.4 * PPM), dd, sgn * aa, height_m=1.3)

    # ---------------- mesa de leitura (centro)
    tw, th_ = (2.4, 0.9) if level == 1 else (2.8, 0.95)
    tb = board(int(tw * PPM), int(th_ * PPM), 5, dark=0.8, lip=False)
    if level >= 3: ImageDraw.Draw(tb).rectangle([0, 0, tb.width - 1, tb.height - 1], outline=G4, width=4)
    place(low, tb, 104, 0, width_m=tw)
    chairs = (-2.4, 0.0, 2.4) if level == 1 else (-3.3, -1.1, 1.1, 3.3)
    for aa in chairs:
        place(low, P['chair'], 73, aa, width_m=0.45)
        place(low, P['chair'], 136, aa * 0.92, rot_extra=180, width_m=0.45)
    # livros e velas em cima
    bk = [(96, -2.9, 'ob'), (110, -0.9, 'livros'), (96, 1.3, 'ob'), (112, 2.7, 'parch')]
    for i, (dd, aa, k) in enumerate(bk):
        if k == 'ob': place(top, open_book(int(0.46 * PPM), int(0.32 * PPM)), dd, aa, rot_extra=(i * 13) % 20 - 10, width_m=0.46)
        elif k == 'livros': place(top, P['livros'], dd, aa, rot_extra=30, width_m=0.4)
        else: place(top, parchment(int(0.3 * PPM), int(0.4 * PPM), i), dd, aa, rot_extra=-12, width_m=0.3)
    if level < 3:
        cs = candle_flames(P['castical'], [(0.06, 0.5), (0.5, 0.5), (0.94, 0.5)], 0.035)
        x, y = place(top, cs, 104, 0.1, width_m=0.5)
        fx('glow', x, y, color='#ffb347', radius=0.04)
    else:
        x, y = place(top, crystal_lamp(0.22 * PPM), 104, 0.1, width_m=0.48)
        fx('glow', x, y, color='#dff4ff', radius=0.04)
    if level == 1:
        place(top, P['lupa'], 112, -2.2, rot_extra=-35, width_m=0.16)

    # ---------------- lustre sobre a mesa (2+)
    if level >= 2:
        ch = candle_flames(P['candelabro'], [(0.5 + 0.43 * math.cos(math.radians(t)), 0.5 + 0.43 * math.sin(math.radians(t))) for t in range(30, 390, 60)], 0.05)
        x, y = place(over, ch, 104, 0, width_m=0.9)
        fx('glow', x, y, color='#ffb347', radius=0.075)

    # ---------------- balcão do bibliotecário (frente, esquerda)
    place(low, P['mesa'], 196, -10.6, rot_extra=0, width_m=1.5)
    place(low, P['stool'], 172, -10.6, width_m=0.38)
    x, y = place(top, P['lamparina'], 196, -12.4, width_m=0.26)
    place(top, open_book(int(0.4 * PPM), int(0.28 * PPM), cover=(40, 30, 26)), 198, -9.6, width_m=0.4)
    fx('glow', x, y, color='#ffb347', radius=0.03)
    if level >= 2:
        place(mid_, P['gaveteiro'], 226, -14.0, rot_extra=180, width_m=0.9)
        place(mid_, bookcart(int(0.9 * PPM), int(0.5 * PPM), 7), 228, -8.4, rot_extra=-14, width_m=0.9)
    else:
        place(mid_, P['pilha3'], 228, -13.6, rot_extra=12, width_m=0.5)
        place(mid_, P['crate'], 226, -8.8, rot_extra=-6, width_m=0.72)
    if level >= 3:
        place(top, P['lupa'], 200, -11.4, rot_extra=-35, width_m=0.16)

    # ---------------- canto de leitura (frente, direita)
    place(low, P['table'], 204, 10.6, width_m=0.9)
    place(low, P['chair'], 204, 13.4, rot_extra=-90, width_m=0.5)
    place(low, P['chair'], 204, 7.8, rot_extra=90, width_m=0.5)
    x, y = place(top, lantern_lit(P['lantern']), 198, 11.4, width_m=0.24)
    fx('glow', x, y, color='#ffb347', radius=0.03)
    place(top, open_book(int(0.36 * PPM), int(0.25 * PPM), cover=(32, 44, 84)), 210, 10.2, rot_extra=8, width_m=0.36)
    if level == 1:
        for i, (dd, aa, k) in enumerate(((172, 13.6, 'pilha2'), (176, 8.4, 'pilha1'), (236, 13.0, 'livros'))):
            place(mid_, P[k], dd, aa, rot_extra=(i * 37) % 50 - 25, width_m=0.5)
    else:
        g = globe(0.62 * PPM, gold=level >= 3); place(mid_, g, 172, 8.6, width_m=0.72)
        place(mid_, P['bau'], 234, 12.6, rot_extra=180, width_m=0.9)

    # ---------------- nível 3: atril com o grande tomo e livros flutuantes
    if level >= 3:
        lt = lectern(int(0.62 * PPM), int(0.44 * PPM), level); place(mid_, lt, 204, 0, width_m=0.8)
        tome = open_book(int(0.6 * PPM), int(0.42 * PPM), cover=(70, 20, 60), glow=(170, 120, 255), runes=True)
        x, y = place(top, tome, 204, 0, width_m=0.6 * 1.5)
        fx('glow', x, y, color='#9b7dff', radius=0.06); fx('sparks', x, y, color='#c9b8ff')
        for i, (dd, aa) in enumerate(((176, -4.6), (182, 4.8), (228, -4.4))):
            fb = open_book(int(0.34 * PPM), int(0.24 * PPM), cover=LEATHER[i * 3], glow=(170, 120, 255))
            x, y = place(over, fb, dd, aa, rot_extra=(i * 41) % 60 - 30, width_m=0.34 * 1.5)
            fx('glow', x, y, color='#b48cff', radius=0.025)

    th = new_layer(); threshold_and_door(th); canvas.alpha_composite(th)
    canvas = with_shadow(canvas, floor_deco, off=3, blur=3, strength=0.3)
    canvas = with_shadow(canvas, low, off=6, blur=5, strength=0.45)
    canvas = with_shadow(canvas, mid_, off=10, blur=8, strength=0.5)
    canvas = with_shadow(canvas, top, off=5, blur=3, strength=0.45)
    canvas = with_shadow(canvas, over, off=16, blur=10, strength=0.35)
    walls = build_walls(level)
    canvas = with_shadow(canvas, walls, off=12, blur=9, strength=0.5)

    c = np.asarray(canvas, np.float32)
    for t_, x, y, kw in fxl:
        if t_ != 'glow': continue
        rad = kw['radius'] * W * 1.6
        g = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * (rad / 2) ** 2))[..., None]
        col = np.array([int(kw['color'][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
        c[..., :3] = c[..., :3] * (1 + 0.22 * g) + (col - 128).clip(0) * g * 0.25
    canvas = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), 'RGBA')

    out = canvas.resize((768, 311), Image.LANCZOS)
    mask = Image.open(f'{PIPE}/templates/middle_arc_mask.png').convert('L')
    out.putalpha(ImageChops.darker(out.getchannel('A'), mask))
    name = 'library.middle.png' if level == 1 else f'library.middle.lv{level}.png'
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
sheet.save(f'{OUT}/biblioteca_niveis.jpg', quality=90)
print('ok', len(fxs), 'fx')
