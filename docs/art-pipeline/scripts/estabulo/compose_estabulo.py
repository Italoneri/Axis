"""Estábulo (id stable) – slot middle (layout v4), 3 níveis, interior visto de cima.
Uso: python3 -I compose_estabulo.py <pasta_dl> <pasta_renders> <repo> <pasta_saida>
  <pasta_dl>      zips extraídos: planks/ (Planks039 2K), straw/ (ThatchedRoof002A 1K)
  <pasta_renders> renders de cima (render_est.py): wooden_bowl_01, wicker_basket_02 (sem tampa),
                  rusted_spade_01, wooden_broom, wooden_stool_02, pillow (throw_pillows_01, uma almofada),
                  wooden_bucket_02, horse_statue_01
  <repo>          raiz do projeto (texturas em public/assets/textures, renders e moldes em docs/)
Base (moldura, piso, paredes, porta) igual à do Depósito. Trabalha em 2x e reduz para 768x311."""
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
    x0 = np.floor(u).astype(int); y0 = np.floor(v).astype(int)
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
def board(w, h, seed, dark=0.9, lip=True):
    im = to_img(wood(w, h, dark=dark, seed=seed)); dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, w - 1, h - 1], outline=(46, 28, 16, 255), width=2)
    if lip: dr.rectangle([0, h - max(3, h // 7), w - 1, h - 1], fill=(70, 44, 26, 255))
    return im
def sack(w, h, seed, tone=(176, 150, 112)):
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    nx, ny = (xx_ - w / 2) / (w / 2), (yy_ - h * 0.55) / (h * 0.45)
    wob = 1 + 0.06 * noise((h, w), 6, seed)
    r = np.hypot(nx, ny * np.where(ny < 0, 1.25, 1.0)) / wob
    shade = np.clip(1.15 - r * 0.6, 0.4, 1.2)[..., None]
    weave = 1 + 0.08 * noise((h, w), 0.6, seed + 1)[..., None]
    folds = 1 + 0.08 * np.sin(xx_ / w * 18 + noise((h, w), 4, seed + 2) * 2)[..., None] * np.clip(-ny, 0, 1)[..., None]
    col = np.array(tone, np.float32) * shade * weave * folds
    a = np.clip((1 - r) * 25, 0, 1) * 255
    im = to_img(col, a); dr = ImageDraw.Draw(im)
    k = w * 0.09
    dr.ellipse([w / 2 - k * 1.6, h * 0.12 - k, w / 2 + k * 1.6, h * 0.12 + k], fill=(150, 124, 88, 255))
    dr.line([(w / 2 - k * 1.8, h * 0.17), (w / 2 + k * 1.8, h * 0.17)], fill=(70, 46, 24, 255), width=3)
    return im

def rope(d, seed):
    s = int(d) + 4
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    c = s / 2; r = d / 2
    dr.ellipse([c - r, c - r, c + r, c + r], fill=(150, 120, 74, 255))
    rr = r
    while rr > r * 0.25:
        dr.ellipse([c - rr, c - rr, c + rr, c + rr], outline=(98, 74, 42, 255), width=1)
        rr -= max(2.2, d / 14)
    dr.ellipse([c - r * .22, c - r * .22, c + r * .22, c + r * .22], fill=(40, 30, 20, 0))
    return im

def label(w, h):
    a = np.array([228, 210, 168.]) * (1 + noise((h, w), 1, w * 7 + h)[..., None] * 0.05)
    im = to_img(a); dr = ImageDraw.Draw(im)
    for y in range(3, h - 2, 4): dr.line([(3, y), (w - 4, y)], fill=(110, 80, 50, 200), width=1)
    dr.rectangle([0, 0, w - 1, h - 1], outline=(150, 120, 80, 255))
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

# ------------------------------------------------------------------ palha
straw_raw = ftex(f'{DL}/straw/ThatchedRoof002A_1K-JPG_Color.jpg')
sl = straw_raw.mean(-1, keepdims=True) / 255.0
sl = (sl - sl.mean()) * 1.5 + 0.62
straw = np.clip(sl[..., :1] * np.array([250, 200, 112.]), 0, 255)

def straw_patch(h, w, seed, k=1.0, dark=1.0):
    """palha solta: duas amostras giradas da textura misturadas para parecer remexida"""
    rng = np.random.default_rng(seed)
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    out = np.zeros((h, w, 3), np.float32)
    for i, ang in enumerate(rng.uniform(0, math.pi, 2)):
        ca, sa = math.cos(ang), math.sin(ang)
        u = (xx_ * ca - yy_ * sa) * k * 1.4 + rng.uniform(0, 1024); v = (xx_ * sa + yy_ * ca) * k * 1.4 + rng.uniform(0, 1024)
        out += sample(straw, u, v) * (0.55 if i == 0 else 0.45)
    out *= (1 + noise((h, w), 6, seed) * 0.12)[..., None] * dark
    return out

# ------------------------------------------------------------------ props renderizados
P = {k: load(f'{REN}/{k}.png') for k in ['wooden_bowl_01', 'wicker_basket_02', 'rusted_spade_01', 'wooden_broom',
                                          'wooden_stool_02', 'pillow', 'wooden_bucket_02', 'horse_statue_01']}
RD = f'{PIPE}/renders'
P['bucket'] = load(f'{RD}/deposito/wooden_bucket_01.png')
P['basket1'] = load(f'{RD}/deposito/wicker_basket_01.png')
P['lantern'] = load(f'{RD}/deposito/wooden_lantern_01.png')
P['crate'] = load(f'{RD}/deposito/crate.png')
P['brass_pot'] = load(f'{RD}/santuario/brass_pot_01.png')
P['diya'] = load(f'{RD}/santuario/brass_diya_lantern.png')
bar = Image.open(f'{RD}/barris.png').convert('RGBA')
P['barrel'] = crop_alpha(bar.crop((110, 60, 225, 175)))
for k in ('rusted_spade_01', 'wooden_broom'): P[k] = tint(P[k], (1.15, 1.12, 1.1))

# ------------------------------------------------------------------ props feitos por código
CLOTH = [(150, 40, 44), (44, 80, 150), (60, 120, 70), (176, 130, 50)]
LEATHER, LEATHER_D = (120, 72, 40), (70, 40, 22)

def hay_bale(w, h, seed):
    """fardo visto de cima: bloco de palha com bordas arredondadas e duas cordas"""
    yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    col = straw_patch(h, w, seed, k=0.8) * 0.95
    ex = np.minimum(np.minimum(xx_, w - 1 - xx_), np.minimum(yy_, h - 1 - yy_)) / (min(w, h) * 0.18)
    col *= np.clip(0.62 + ex * 0.45, 0.62, 1.07)[..., None]
    rr = min(w, h) * 0.14
    cx_ = np.clip(xx_, rr, w - 1 - rr); cy_ = np.clip(yy_, rr, h - 1 - rr)
    a = np.clip((rr - np.hypot(xx_ - cx_, yy_ - cy_)) * 1.5, 0, 1) * 255
    im = to_img(col, a); dr = ImageDraw.Draw(im)
    for f in (0.3, 0.7):
        x = w * f; dr.line([(x, 1), (x + 2, h - 2)], fill=(92, 62, 30, 255), width=max(2, w // 40))
    rng = np.random.default_rng(seed)
    for _ in range(int(w * 0.25)):                   # fiapos soltos na borda
        x, y = rng.uniform(0, w), rng.choice([rng.uniform(0, 4), rng.uniform(h - 4, h)])
        t = rng.uniform(0, math.pi); L = rng.uniform(3, 8)
        dr.line([(x, y), (x + L * math.cos(t), y + L * math.sin(t))], fill=(230, 196, 120, 200), width=1)
    return im

def loose_straw(layer, x0, y0, rx, ry, n, seed, alpha=210):
    dr = ImageDraw.Draw(layer); rng = np.random.default_rng(seed)
    for _ in range(n):
        r = rng.random() ** 0.6; t = rng.uniform(0, 2 * math.pi)
        x, y = x0 + rx * r * math.cos(t), y0 + ry * r * math.sin(t)
        a = rng.uniform(0, math.pi); L = rng.uniform(4, 11) * SS / 2
        c = int(rng.uniform(170, 235))
        dr.line([(x, y), (x + L * math.cos(a), y + L * math.sin(a))], fill=(c, int(c * .82), int(c * .48), alpha), width=1)

def trough(w, h, seed, crystal=False):
    im = board(w, h, seed, dark=0.7, lip=False); dr = ImageDraw.Draw(im)
    b = max(4, h // 5)
    if crystal:
        inner = np.array([60, 58, 66.]) * (1 + noise((h - 2 * b, w - 2 * b), 1, seed)[..., None] * 0.1)
        im.paste(to_img(inner), (b, b)); rng = np.random.default_rng(seed)
        for _ in range(9):
            x, y = rng.uniform(b + 3, w - b - 3), rng.uniform(b + 3, h - b - 3); s = rng.uniform(3, 6) * SS / 2
            pts = [(x + s * math.cos(t), y + s * 1.3 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 6)[:-1] + rng.uniform(0, 1)]
            dr.polygon(pts, fill=(120, 200, 255, 255), outline=(220, 245, 255, 255))
    else:
        im.paste(to_img(straw_patch(h - 2 * b, w - 2 * b, seed, k=1.2, dark=0.9)), (b, b))
    dr.rectangle([0, 0, w - 1, h - 1], outline=(40, 24, 14, 255), width=3)
    dr.rectangle([b - 2, b - 2, w - b + 1, h - b + 1], outline=(56, 34, 18, 255), width=2)
    return im

def blanket(w, h, color, seed):
    c = np.array(color, np.float32) * (1 + noise((h, w), 2, seed)[..., None] * 0.08)
    yy_ = np.mgrid[0:h, 0:w][0]
    c[(yy_ % max(6, h // 4)) < 2] *= 0.75                       # dobras
    im = to_img(c); dr = ImageDraw.Draw(im)
    for f in (0.12, 0.88): dr.line([(w * f, 0), (w * f, h)], fill=(235, 220, 180, 255), width=2)
    dr.rectangle([0, 0, w - 1, h - 1], outline=tuple(int(v * .5) for v in color) + (255,), width=1)
    return im

def saddle(w, h, seed, gala=False):
    """sela vista de cima: gota de couro com assento escuro, abas e estribos"""
    s = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(s)
    lc = (150, 30, 40) if gala else LEATHER
    dr.ellipse([w * .05, h * .18, w * .95, h * .82], fill=tuple(int(v * .7) for v in lc) + (255,))       # abas
    dr.ellipse([w * .2, h * .02, w * .8, h * .98], fill=lc + (255,), outline=LEATHER_D + (255,), width=2)
    dr.ellipse([w * .32, h * .25, w * .68, h * .75], fill=tuple(int(v * .65) for v in lc) + (255,))
    dr.ellipse([w * .42, h * .04, w * .58, h * .16], fill=(90, 56, 30, 255))                               # cabeça da sela
    if gala:
        dr.ellipse([w * .2, h * .02, w * .8, h * .98], outline=G4, width=3)
        dr.ellipse([w * .32, h * .25, w * .68, h * .75], outline=GD4, width=2)
    for f in (0.06, 0.94):
        dr.rectangle([w * f - 3, h * .45, w * f + 3, h * .6], fill=(150, 150, 156, 255))
    a = np.asarray(s, np.float32)
    a[..., :3] *= (1 + noise((h, w), 0.8, seed) * 0.06)[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')

def tack_wall(w, h, seed, gala=False):
    """parede de arreios: prancha com ganchos, duas selas em cavaletes, rédeas, coleiras e ferradura"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    im.alpha_composite(board(w, int(h * 0.2), seed, dark=0.6, lip=False), (0, 0))
    dr = ImageDraw.Draw(im)
    sw = int(w * 0.24)
    for i, f in enumerate((0.2, 0.8)):
        x = int(w * f - sw / 2)
        dr.rectangle([x + sw * .45, int(h * .15), x + sw * .55, h - 2], fill=(70, 44, 26, 255))    # cavalete
        sd = saddle(sw, int(h * 0.82), seed + i, gala=gala and i == 0)
        im.alpha_composite(sd, (x, int(h * 0.14)))
    for k, f in enumerate((0.4, 0.47, 0.54, 0.61)):                                              # ganchos com rédeas/coleiras
        x = w * f; dr.rectangle([x - 2, 0, x + 2, h * .22], fill=(40, 40, 44, 255))
        r = h * (0.16 if k % 2 else 0.12); y = h * 0.22 + r
        col = (CLOTH[k % 4] if k % 2 else LEATHER)
        dr.ellipse([x - r, y - r, x + r, y + r], outline=col + (255,), width=max(3, int(h * .05)))
        if k % 2: dr.ellipse([x - 3, y + r - 4, x + 3, y + r + 2], fill=(200, 170, 80, 255))
    x, y, r = w * 0.5, h * 0.75, h * 0.11                                                      # ferradura
    dr.arc([x - r, y - r, x + r, y + r], 200, 340 + 0, fill=G4, width=max(3, int(h * .05)))
    dr.arc([x - r, y - r, x + r, y + r], -20, 20 + 180, fill=G4, width=max(3, int(h * .05)))
    dr.rectangle([x - r - 1, y - 1, x - r + 4, y + r * .4], fill=G4); dr.rectangle([x + r - 4, y - 1, x + r + 1, y + r * .4], fill=G4)
    return im

def brush(w, h, seed):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([0, 0, w - 1, h - 1], radius=h // 3, fill=(130, 84, 46, 255), outline=(60, 36, 18, 255))
    rng = np.random.default_rng(seed)
    for _ in range(int(w * h / 10)):
        x, y = rng.uniform(3, w - 3), rng.uniform(3, h - 3); dr.point((x, y), fill=(50, 40, 30, 255))
    return im

def grooming_table(w, h, seed):
    im = table(w, h, seed); dr = ImageDraw.Draw(im)
    b1 = brush(int(w * .22), int(h * .3), seed); im.alpha_composite(b1, (int(w * .08), int(h * .15)))
    b2 = brush(int(w * .18), int(h * .26), seed + 1).rotate(25, expand=True); im.alpha_composite(b2, (int(w * .1), int(h * .5)))
    x0, y0 = w * .4, h * .3                                                                  # pente
    dr.rectangle([x0, y0, x0 + w * .2, y0 + h * .08], fill=(180, 170, 150, 255))
    for k in range(10): dr.line([(x0 + k * w * .02, y0 + h * .08), (x0 + k * w * .02, y0 + h * .18)], fill=(180, 170, 150, 255), width=1)
    x0, y0 = w * .7, h * .55                                                                  # tesoura de tosa
    dr.line([(x0, y0), (x0 + w * .2, y0 - h * .25)], fill=(190, 194, 200, 255), width=3)
    dr.line([(x0, y0 - h * .25), (x0 + w * .2, y0)], fill=(190, 194, 200, 255), width=3)
    for dx in (0, w * .2): dr.ellipse([x0 + dx - 5, y0 - 2, x0 + dx + 5, y0 + 8], outline=(60, 60, 64, 255), width=2)
    x0, y0 = w * .45, h * .6                                                                  # rolo de atadura
    dr.ellipse([x0, y0, x0 + h * .25, y0 + h * .25], fill=(225, 220, 205, 255), outline=(150, 140, 120, 255))
    return im

def ladder(w, h, seed):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); rw = max(5, w // 6)
    for k in range(int(h / (w * 0.55))):
        y = int(w * 0.35 + k * w * 0.55)
        if y > h - 6: break
        im.alpha_composite(board(w - rw, max(4, rw * 2 // 3), seed + k, dark=0.85, lip=False), (rw // 2, y))
    for x in (0, w - rw): im.alpha_composite(board(rw, h, seed + 50 + x, dark=0.75, lip=False), (x, 0))
    return im

def fruit_basket(seed):
    im = P['basket1'].copy(); dr = ImageDraw.Draw(im); rng = np.random.default_rng(seed)
    c, r0 = im.width / 2, im.width * 0.3
    for _ in range(18):
        t = rng.uniform(0, 2 * math.pi); rr = r0 * rng.random() ** 0.5
        x, y = c + rr * math.cos(t), im.height / 2 + rr * math.sin(t) * 0.8
        if rng.random() < 0.7:
            s = im.width * 0.07; dr.ellipse([x - s, y - s, x + s, y + s], fill=(rng.integers(170, 215), 30, 30, 255), outline=(90, 16, 16, 255))
            dr.ellipse([x - s * .5, y - s * .6, x - s * .1, y - s * .2], fill=(255, 200, 200, 200))
        else:
            a = rng.uniform(0, math.pi); L = im.width * 0.2
            dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
            dr.line([(x - dx, y - dy), (x + dx, y + dy)], fill=(235, 120, 30, 255), width=max(3, int(im.width * .03)))
            dr.line([(x + dx, y + dy), (x + dx * 1.25, y + dy * 1.25)], fill=(60, 140, 50, 255), width=4)
    return im

def pet_bed(seed, color):
    im = P['wicker_basket_02'].copy(); dr = ImageDraw.Draw(im)
    w, h = im.size; c = (w / 2, h / 2)
    k = 0.32
    cl = blanket(int(w * k * 2), int(h * k * 2), color, seed)
    m = Image.new('L', cl.size, 0); ImageDraw.Draw(m).ellipse([0, 0, cl.width - 1, cl.height - 1], fill=255)
    cl.putalpha(m)
    im.alpha_composite(cl, (int(c[0] - cl.width / 2), int(c[1] - cl.height / 2)))
    dr.ellipse([c[0] - w * .12, c[1] - h * .1, c[0] + w * .1, c[1] + h * .12], fill=tuple(int(v * .7) for v in color) + (255,))  # amassado
    return im

def perch(w, seed):
    """poleiro de cima: base redonda de tronco e um galho em T"""
    s = int(w); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    r = s * 0.17
    dr.ellipse([c - r, c - r, c + r, c + r], fill=(110, 76, 46, 255), outline=(60, 38, 22, 255), width=2)
    for k in (0.7, 0.45): dr.ellipse([c - r * k, c - r * k, c + r * k, c + r * k], outline=(140, 100, 62, 255), width=1)
    dr.line([(s * .05, c), (s * .95, c)], fill=(96, 66, 40, 255), width=max(5, s // 14))
    dr.line([(s * .2, c), (s * .12, c - s * .14)], fill=(96, 66, 40, 255), width=max(3, s // 24))
    dr.line([(s * .78, c), (s * .9, c + s * .12)], fill=(96, 66, 40, 255), width=max(3, s // 24))
    dr.ellipse([s * .82, c - s * .26, s * .98, c - s * .1], fill=(150, 120, 80, 255), outline=(90, 70, 40, 255))   # pratinho de sementes
    for _ in range(6):
        x, y = s * .9 + (np.random.default_rng(seed + _).random() - .5) * s * .08, c - s * .18
        dr.point((x, y), fill=(60, 40, 20, 255))
    return im

def aviary(d, seed):
    s = int(d); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    dr.ellipse([2, 2, s - 3, s - 3], fill=(60, 50, 40, 150))
    im.alpha_composite(perch(s * 0.72, seed), (int(c - s * .36), int(c - s * .36)))
    for k in np.linspace(-c, c, 15):                                                         # grade
        h_ = math.sqrt(max(0, c * c - k * k))
        dr.line([(c + k, c - h_), (c + k, c + h_)], fill=(150, 112, 70, 235), width=2)
    for i in range(12):
        t = i / 12 * math.pi
        dr.line([(c + c * .95 * math.cos(t), c + c * .95 * math.sin(t)), (c - c * .95 * math.cos(t), c - c * .95 * math.sin(t))], fill=(150, 112, 70, 140), width=1)
    dr.ellipse([2, 2, s - 3, s - 3], outline=(110, 76, 44, 255), width=max(5, s // 22))
    dr.ellipse([c - s * .06, c - s * .06, c + s * .06, c + s * .06], fill=(150, 104, 60, 255), outline=(80, 50, 26, 255))   # argola do topo
    return im

def iron_gate(w, h, seed):
    """portão de ferro visto de cima: barra com pontas douradas"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rectangle([0, h * .3, w - 1, h * .7], fill=(46, 46, 52, 255), outline=(20, 20, 24, 255))
    for x in np.linspace(h * .5, w - h * .5, max(3, int(w / (h * 1.4)))):
        dr.ellipse([x - h * .42, h * .08, x + h * .42, h * .92], fill=(56, 56, 62, 255), outline=(24, 24, 28, 255))
        dr.ellipse([x - h * .2, h * .3, x + h * .2, h * .7], fill=G4)
    return im

def rune_circle(d, seed):
    s = int(d); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    for k, wd in ((0.97, 3), (0.8, 2), (0.42, 2)):
        rr = c * k; dr.ellipse([c - rr, c - rr, c + rr, c + rr], outline=G4, width=wd)
    for i in range(20):
        t = i / 20 * 2 * math.pi; rr = c * 0.885; x, y = c + rr * math.cos(t), c + rr * math.sin(t); k = s * .025
        if i % 3 == 0: dr.line([(x - k, y - k), (x + k, y + k)], fill=(200, 160, 255, 255), width=2); dr.line([(x - k, y + k), (x, y)], fill=(200, 160, 255, 255), width=2)
        elif i % 3 == 1: dr.polygon([(x, y - k), (x + k, y), (x, y + k), (x - k, y)], outline=(200, 160, 255, 255))
        else: dr.line([(x, y - k), (x, y + k)], fill=(200, 160, 255, 255), width=2)
    pts = [(c + c * .8 * math.cos(t), c + c * .8 * math.sin(t)) for t in np.linspace(-math.pi / 2, 1.5 * math.pi, 6)[:-1]]
    for i in range(5): dr.line([pts[i], pts[(i + 2) % 5]], fill=(180, 140, 240, 200), width=1)
    return im

def enchanted_basin(d, seed):
    s = int(d); yy_, xx_ = np.mgrid[0:s, 0:s].astype(np.float32); c = s / 2
    r = np.hypot(xx_ - c, yy_ - c) / c
    st = stone_tex(s, s, seed, (150, 144, 134)) * np.clip(1.1 - r * 0.25, 0, 2)[..., None]
    wat = np.array([90, 200, 245.]) * (0.55 + 0.6 * np.clip(1 - r / 0.78, 0, 1)[..., None] ** 0.7)
    wat *= (1 + noise((s, s), 3, seed)[..., None] * 0.07)
    col = np.where((r < 0.78)[..., None], wat, st)
    col[(r > 0.76) & (r < 0.82)] = GOLD_D
    im = to_img(col, np.where(r <= 1, 255, 0)); dr = ImageDraw.Draw(im)
    dr.ellipse([c - s * .3, c - s * .3, c - s * .12, c - s * .18], fill=(255, 255, 255, 150))
    for i in range(3):
        rr = s * (0.12 + i * 0.09); dr.ellipse([c - rr + s * .05, c - rr + s * .04, c + rr + s * .05, c + rr + s * .04], outline=(200, 245, 255, 90), width=1)
    return im

def nest(d, seed):
    s = int(d); yy_, xx_ = np.mgrid[0:s, 0:s].astype(np.float32); c = s / 2
    r = np.hypot(xx_ - c, yy_ - c) / c
    col = straw_patch(s, s, seed, k=1.6) * np.clip(1.25 - np.abs(r - 0.7) * 1.4, 0.45, 1.2)[..., None]
    col[r < 0.45] *= 0.55
    a = np.clip((1 - r) * 12, 0, 1) * 255
    im = to_img(col, a); dr = ImageDraw.Draw(im)
    loose_straw(im, c, c, c * 1.0, c * 1.0, 40, seed, alpha=230)
    ew, eh = s * 0.3, s * 0.4                                                                  # ovo escamado dourado
    ey = np.mgrid[0:int(eh), 0:int(ew)].astype(np.float32)
    nx, ny = (ey[1] - ew / 2) / (ew / 2), (ey[0] - eh / 2) / (eh / 2)
    er = np.hypot(nx, ny * np.where(ny < 0, 1.1, 0.95))
    eg = np.array([236, 186, 70.]) * np.clip(1.25 - er * 0.55 - nx * 0.15 - ny * 0.15, 0.5, 1.3)[..., None]
    scale = ((ey[0] + (ey[1] // 6 % 2) * 3) % 6 < 1.2)
    eg[scale] *= 0.72
    egg = to_img(eg, np.clip((1 - er) * 20, 0, 1) * 255)
    ImageDraw.Draw(egg).ellipse([ew * .25, eh * .18, ew * .45, eh * .34], fill=(255, 245, 210, 200))
    im.alpha_composite(egg, (int(c - ew / 2), int(c - eh / 2)))
    return im

def brazier(img, seed):
    im = img.copy(); dr = ImageDraw.Draw(im); rng = np.random.default_rng(seed); c = im.width / 2, im.height / 2
    r0 = im.width * 0.3
    dr.ellipse([c[0] - r0, c[1] - r0, c[0] + r0, c[1] + r0], fill=(40, 22, 14, 255))
    for _ in range(28):
        t = rng.uniform(0, 2 * math.pi); rr = r0 * rng.random() ** 0.5 * .9; x, y = c[0] + rr * math.cos(t), c[1] + rr * math.sin(t)
        k = rng.uniform(2, 5) * SS / 2; hot = rng.random()
        dr.ellipse([x - k, y - k, x + k, y + k], fill=(255, int(90 + hot * 140), int(hot * 60), 255))
    return im

def bowl(fill, seed):
    im = P['wooden_bowl_01'].copy(); dr = ImageDraw.Draw(im); c = im.width / 2; r = im.width * 0.3; rng = np.random.default_rng(seed)
    if fill == 'water':
        dr.ellipse([c - r, c - r, c + r, c + r], fill=(70, 120, 150, 220)); dr.ellipse([c - r * .5, c - r * .6, c - r * .1, c - r * .3], fill=(230, 245, 255, 160))
    elif fill == 'food':
        for _ in range(40):
            t = rng.uniform(0, 2 * math.pi); rr = r * rng.random() ** 0.5; x, y = c + rr * math.cos(t), c + rr * math.sin(t); k = im.width * 0.03
            v = int(rng.uniform(100, 160)); dr.ellipse([x - k, y - k, x + k, y + k], fill=(v, int(v * .66), int(v * .4), 255))
    return im

def nameplate(w, h, gold=False):
    if not gold: return label(w, h)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, w - 1, h - 1], fill=(196, 150, 70, 255), outline=GD4, width=2)
    for y in range(4, h - 3, 4): dr.line([(4, y), (w - 5, y)], fill=(110, 76, 30, 255), width=1)
    return im

def water_trough(w, h, seed, gold=False):
    st = stone_tex(h, w, seed, (140, 134, 124)); yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    b = max(5, h // 5)
    inner = (xx_ >= b) & (xx_ < w - b) & (yy_ >= b) & (yy_ < h - b)
    wat = np.array([58, 86, 92.]) * (1 + noise((h, w), 3, seed)[..., None] * 0.06)
    col = np.where(inner[..., None], wat, st)
    im = to_img(col); dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, w - 1, h - 1], outline=GD4 if gold else (80, 76, 70, 255), width=3)
    dr.rectangle([b, b, w - b - 1, h - b - 1], outline=(50, 50, 50, 255), width=1)
    dr.line([(b + 6, b + 4), (w * 0.4, b + 4)], fill=(220, 240, 250, 140), width=2)
    return im

# ------------------------------------------------------------------ porta dupla
def double_door(layer):
    th = (R >= RI) & (R < RI + T) & (np.abs(A * R * SC) < DOOR_HALF)
    layer.alpha_composite(to_img(stone_tex(H, W, 3, (150, 142, 128)), np.where(th, 255, 0)))
    lw, lh = int(DOOR_HALF * 0.95), int(7 * SS)
    for sgn in (-1, 1):
        leaf = board(lw, lh, 99 + sgn, dark=0.7, lip=False); dr = ImageDraw.Draw(leaf)
        for x in (lw * .2, lw * .75): dr.rectangle([x - 3, 0, x + 3, lh], fill=(40, 40, 44, 255))
        x0, y0 = rp(RI + T, sgn * math.degrees(DOOR_HALF / (RI * SC)))
        lr = leaf.rotate(sgn * 62 + (180 if sgn > 0 else 0), expand=True, resample=Image.BICUBIC)
        # dobradiça no batente; folha aberta para dentro
        ang = math.radians(-sgn * 62 + (0 if sgn < 0 else 180))
        cx_ = x0 - sgn * lw / 2 * math.cos(math.radians(62)); cy_ = y0 - lw / 2 * math.sin(math.radians(62))
        layer.alpha_composite(lr, (int(cx_ - lr.width / 2), int(cy_ - lr.height / 2)))

# ------------------------------------------------------------------ níveis
STALL_EDGES = [-15.7, -11.0, -6.3, -1.9]   # ângulos das divisórias (3 baias)
STALL_DEPTH = 136                            # profundidade da baia (px 1x a partir da borda externa)

def partition(layer, a, d0, d1, seed):
    """divisória radial de tábuas, de d0 até d1"""
    x0, y0 = rp(d2r(d0), a); x1, y1 = rp(d2r(d1), a)
    L = math.hypot(x1 - x0, y1 - y0); w = int(6 * SS)
    bd = board(w, int(L), seed, dark=0.62, lip=False)
    put(layer, bd, (x0 + x1) / 2, (y0 + y1) / 2, width_px=w, rot=-a)

def compose(level):
    fxl = []
    def fx(t_, x, y, **kw): fxl.append((t_, x, y, kw))
    canvas = build_floor()
    floor_deco = new_layer(); low = new_layer(); mid_ = new_layer(); top = new_layer()
    nst = 2 if level == 1 else 3
    edges = STALL_EDGES[:nst + 1]

    # ---------------- piso das baias: palha
    bed = straw_patch(H, W, 5, k=0.55, dark=0.92)
    for i in range(nst):
        a0, a1 = edges[i], edges[i + 1]
        arcane = level >= 3 and i == 2
        m = (R <= d2r(10)) & (R >= d2r(STALL_DEPTH + 6)) & (ADEG >= a0) & (ADEG <= a1)
        if arcane:
            k = 2048 / (520 * SS); u = A * R * SC * k; v = (RO - R) * SC * k
            mb = sample(marble, u + 300, v + 120) * 1.1
            floor_deco.alpha_composite(to_img(mb, np.where(m, 255, 0)))
        else:
            edge_soft = np.clip((d2r(STALL_DEPTH + 6) - R) * -SC / 10 + 1, 0, 1) if False else 1
            floor_deco.alpha_composite(to_img(bed, np.where(m, 235, 0)))
    if level >= 2:                                   # estrado sob a forragem
        k = 2048 / (2.6 * PPM) * 0.55
        floor_deco.alpha_composite(polar_band(planks, k, 44, 100, -1.4, 3.0, 0.8))
    # palha espalhada no corredor
    for d0, a, n in ((150, -8, 60), (170, -3, 50), (110, 1.0, 50), (60, 0.6, 40), (200, 2, 25), (150, -13, 50)):
        x, y = rp(d2r(d0), a); loose_straw(floor_deco, x, y, 70 * SS, 30 * SS, n, int(d0 + a * 7))

    # ---------------- ala esquerda: baias
    for i, a in enumerate(edges[1:]):
        partition(mid_, a, 12, STALL_DEPTH, 30 + i)
    for i in range(nst):
        a0, a1 = edges[i], edges[i + 1]; ac = (a0 + a1) / 2
        arcane = level >= 3 and i == 2
        tw = trough(int(1.2 * PPM), int(0.42 * PPM), 40 + i, crystal=arcane)
        place(low, tw, 30, ac, width_m=1.2)
        if arcane:
            rc = rune_circle(1.5 * PPM, 3); place(floor_deco, rc, 88, ac, width_m=1.5)
            fx('glow', *rp(d2r(88), ac), color='#b48cff', radius=0.05)
            fx('glow', *rp(d2r(30), ac), color='#7fd4ff', radius=0.03)
        else:
            place(low, P['bucket'], 96, a1 - 1.1, width_m=0.42)
            loose_straw(top, *rp(d2r(30), ac), 40 * SS, 12 * SS, 25, 70 + i)
        # frente da baia
        if level == 2:
            g = board(int(px2deg(1, STALL_DEPTH) and (a1 - a0 - 1.2) / px2deg(1, STALL_DEPTH) * SS), int(5 * SS), 60 + i, dark=0.66, lip=False)
            place(mid_, g, STALL_DEPTH, a0 + (a1 - a0) * 0.36, width_px=g.width)                # portinhola meio aberta
        if level >= 3:
            g = iron_gate(int((a1 - a0 - 1.0) / px2deg(1, STALL_DEPTH) * SS * 0.62), int(6 * SS), 60 + i)
            place(mid_, g, STALL_DEPTH, a0 + (a1 - a0) * 0.33, width_px=g.width)
        if level >= 2:
            place(top, nameplate(int(0.32 * PPM), int(0.16 * PPM), gold=level >= 3), STALL_DEPTH + 9, a1 - 0.2, width_m=0.32)
            if not arcane:
                bl = blanket(int(0.5 * PPM), int(0.24 * PPM), CLOTH[i], 80 + i)
                place(top, bl, 70, a1, rot_extra=90, width_m=0.5)

    # ---------------- centro: forragem e arreios
    if level == 1:
        place(low, sack(int(0.6 * PPM), int(0.74 * PPM), 1), 34, -0.6, rot_extra=-10, width_m=0.6)
        place(low, sack(int(0.56 * PPM), int(0.7 * PPM), 2, (166, 140, 102)), 36, 1.6, rot_extra=14, width_m=0.56)
    else:
        tk = tack_wall(int(2.1 * PPM), int(0.62 * PPM), 7, gala=level >= 3)
        place(mid_, tk, 30, 0.8, width_m=2.1)
        place(low, sack(int(0.6 * PPM), int(0.74 * PPM), 1), 120, 3.3, rot_extra=-10, width_m=0.6)
        place(low, sack(int(0.56 * PPM), int(0.7 * PPM), 2, (166, 140, 102)), 112, -1.4 if level == 2 else 4.0, rot_extra=14, width_m=0.56)
    for d0, a, r_ in ((72, -0.6, 2), (72, 2.2, -3), (95, 0.8, 5)):
        place(mid_, hay_bale(int(1.05 * PPM), int(0.58 * PPM), int(d0 + a * 10)), d0, a, rot_extra=r_, width_m=1.05)
    if level >= 2:                                   # segunda camada: o fardo de cima
        place(top, hay_bale(int(1.05 * PPM), int(0.58 * PPM), 77), 82, 0.9, rot_extra=-4, width_m=1.05)
    place(low, P['barrel'], 112, 3.3 if level == 1 else 1.1 if level == 2 else -1.0, width_m=0.6)
    if level >= 2:
        place(mid_, ladder(int(0.46 * PPM), int(1.5 * PPM), 9), 60, 4.75, width_m=0.46)
        place(low, fruit_basket(4), 186, -4.6, width_m=0.5)
        gt = grooming_table(int(1.3 * PPM), int(0.6 * PPM), 21)
        place(mid_, gt, 176, -9.6, rot_extra=2, width_m=1.3)
        place(low, P['wooden_stool_02'], 200, -7.4, rot_extra=20, width_m=0.36)
        x, y = place(low, lantern_lit(P['lantern']), 34, -2.6, width_m=0.28)
        fx('glow', x, y, color='#ffb347', radius=0.035)
    # ferramentas encostadas na parede da frente, do lado direito da porta
    for nm, a, Lm in (('rusted_spade_01', 5.6, 1.1), ('wooden_broom', 7.2, 1.3)):
        img = P[nm]; place(low, img, 240, a, rot_extra=90 + (a - 6) * 6, height_m=Lm)
    # bebedouro comprido de pedra junto à parede da frente, para as montarias
    wt = water_trough(int(1.9 * PPM), int(0.46 * PPM), 12, gold=level >= 3)
    place(mid_, wt, 236, -10.4, width_m=1.9)
    if level >= 3:
        eb = enchanted_basin(0.95 * PPM, 8); place(mid_, eb, 136, 0.4, width_m=0.95)
        fx('glow', *rp(d2r(136), 0.4), color='#7fd4ff', radius=0.045)
        em = emblem(64 * SS); place(floor_deco, em, 196, 0, width_px=em.width)
        fx('glow', *rp(d2r(196), 0), color='#e2b84a', radius=0.06)
        # estátua de montaria num pedestal
        s = int(0.8 * PPM); ped = to_img(stone_tex(s, s, 4, (110, 104, 98)))
        mk = Image.new('L', (s, s), 0); ImageDraw.Draw(mk).ellipse([0, 0, s - 1, s - 1], fill=255); ped.putalpha(mk)
        pd = ImageDraw.Draw(ped); pd.ellipse([1, 1, s - 2, s - 2], outline=GD4, width=4); pd.ellipse([7, 7, s - 8, s - 8], outline=G4, width=2)
        place(mid_, ped, 214, -5.0, width_m=0.78)
        place(top, P['horse_statue_01'], 214, -5.0, rot_extra=20, width_m=0.6)

    # ---------------- ala direita: pets pequenos
    for a, c in ((6.4, CLOTH[0]), (9.6, CLOTH[1])):
        place(low, pet_bed(int(a * 10), c), 54, a, rot_extra=(a - 8) * 3, width_m=0.62)
    for d0, a, f in ((122, 6.0, 'food'), (118, 7.6, 'food'), (126, 9.2, 'water')):
        place(low, bowl(f, int(a * 10)), d0, a, width_m=0.3)
    if level == 1:
        place(mid_, perch(int(0.95 * PPM), 2), 72, 13.3, rot_extra=-10, width_m=0.95)
    else:
        place(mid_, aviary(int(1.3 * PPM), 2), 74, 13.0, width_m=1.3)
        place(low, P['pillow'], 172, 9.6, rot_extra=-15, width_m=0.55)
        place(low, P['wooden_bucket_02'], 150, 13.7, width_m=0.5)
        ImageDraw.Draw(low)
    if level >= 3:
        place(low, nest(0.9 * PPM, 6), 214, 11.6, width_m=0.9)
        br = brazier(P['brass_pot'], 3); x, y = place(low, br, 196, 14.6, width_m=0.5)
        fx('sparks', x, y, color='#FF7A1A')
        x, y = place(low, P['diya'], 104, 12.0, width_m=0.3)
        fx('glow', x, y, color='#ffb347', radius=0.03)

    # ---------------- lanternas da porta
    for sgn in (-1, 1):
        x, y = place(low, lantern_lit(P['lantern']), 232, sgn * 3.2, width_m=0.34)
        fx('glow', x, y, color='#ffb347', radius=0.04)

    th = new_layer(); double_door(th)
    canvas = with_shadow(canvas, floor_deco, off=3, blur=3, strength=0.3)
    canvas = with_shadow(canvas, low)
    canvas = with_shadow(canvas, mid_, off=10, blur=8, strength=0.5)
    canvas = with_shadow(canvas, top, off=5, blur=3, strength=0.45)
    canvas = with_shadow(canvas, th, off=6, blur=5, strength=0.4)
    walls = build_walls(level)
    canvas = with_shadow(canvas, walls, off=12, blur=9, strength=0.5)

    c = np.asarray(canvas, np.float32)
    for t_, x, y, kw in fxl:
        if t_ != 'glow': continue
        rad = kw['radius'] * W * 1.6
        g = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * (rad / 2) ** 2))[..., None]
        tintc = np.array([int(kw['color'][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
        c[..., :3] = c[..., :3] * (1 + 0.22 * g) + (tintc - 128) * g * 0.25
    canvas = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), 'RGBA')

    out = canvas.resize((768, 311), Image.LANCZOS)
    mask = Image.open(f'{REPO}/docs/art-templates/middle_arc_mask.png').convert('L')
    out.putalpha(ImageChops.darker(out.getchannel('A'), mask))
    name = 'stable.middle.png' if level == 1 else f'stable.middle.lv{level}.png'
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
sheet.save(f'{OUT}/estabulo_niveis.jpg', quality=90)
print('ok', len(fxs), 'fx')
