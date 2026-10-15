"""Santuário (id sanctuary) – slot middle (layout v4), 3 níveis, interior visto de cima.
Uso: python3 -I compose_santuario.py <pasta_dl> <pasta_renders> <repo> <pasta_saida>
  <pasta_dl>      zips extraídos: planks/ (Planks039 2K), marble/ (Marble001 2K)
  <pasta_renders> renders de cima (render_topdown.py): gothic_statue, marble_bust_01, wooden_candlestick,
                  brass_candleholders, brass_diya_lantern, brass_vase_01, brass_pot_01
  <repo>          raiz do projeto (texturas em public/assets/textures, renders e moldes em docs/)
Trabalha em 2x (1536x622) e reduz para 768x311 no final.
Base (piso, paredes, porta, helpers) reaproveitada do compose_deposito.py."""
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

# ================================================================== Santuário
white_marble = ftex(f'{DL}/marble/Marble001_2K-JPG_Color.jpg')
white_marble = white_marble * np.array([1.0, 0.98, 0.94])

# ------------------------------------------------------------------ props renderizados
P = {k: load(f'{REN}/{k}.png') for k in ['gothic_statue', 'marble_bust_01', 'wooden_candlestick', 'brass_diya_lantern',
                                          'brass_vase_01', 'brass_pot_01']}
P['gothic_statue'] = tint(P['gothic_statue'], (1.0, 0.95, 0.86))
ch = Image.open(f'{REN}/brass_candleholders.png').convert('RGBA')        # três peças lado a lado: fica com a de 6 braços
col = np.asarray(ch.getchannel('A'), np.float32).sum(0)
xs = np.where(col > 0)[0]; gaps = np.where(np.diff(xs) > 4)[0]
P['candelabra'] = crop_alpha(ch.crop((int(xs[gaps[-1] + 1]) - 1, 0, ch.width, ch.height)))
P['bed'] = load(f'{PIPE}/renders/old_bed_frame.png')
P['chest'] = load(f'{PIPE}/renders/guilda/chest.png')
P['goblets'] = load(f'{PIPE}/renders/guilda/goblets.png')
P['plant'] = load(f'{PIPE}/renders/potted_plant_01.png')
P['pit'] = load(f'{PIPE}/renders/stone_fire_pit.png')

# ------------------------------------------------------------------ props feitos por código
def flame(d, core=(255, 248, 220), mid=(255, 190, 80), outer=(255, 120, 30)):
    s = int(d * 2.2) | 1; c = s / 2
    yy_, xx_ = np.mgrid[0:s, 0:s].astype(np.float32)
    r = np.hypot(xx_ - c, yy_ - c) / (d / 2)
    colr = np.where((r < 0.35)[..., None], core, np.where((r < 0.7)[..., None], mid, outer)).astype(np.float32)
    a = np.clip(1.25 - r, 0, 1) ** 1.2 * 255
    return to_img(colr, a)

def candle(d, lit=True):
    s = int(d * 1.3) + 2; im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2; r = d / 2
    dr.ellipse([c - r, c - r, c + r, c + r], fill=(236, 226, 200, 255), outline=(176, 160, 128, 255))
    if lit:
        f = flame(d * 0.7); im.alpha_composite(f, (int(c - f.width / 2), int(c - f.height / 2)))
    return im

def votives(w, h, seed, n=None):
    """prateleira de velas votivas: tábua com velinhas em fileiras"""
    im = board(w, h, seed, dark=0.7)
    rng = np.random.default_rng(seed)
    d = h / 3.0
    for row in range(2):
        x = d * 0.8
        while x < w - d * 0.6:
            dd = d * rng.uniform(0.7, 1.0)
            cd = candle(dd, lit=rng.random() > 0.15)
            im.alpha_composite(cd, (int(x - cd.width / 2), int(h * (0.3 + row * 0.36) - cd.height / 2)))
            x += d * rng.uniform(0.95, 1.2)
    return im

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

def altar(w, h, seed, level):
    """bloco do altar visto de cima: pedra (1-2) ou mármore negro (3), toalha branca com barra dourada"""
    if level < 3:
        base = to_img(stone_tex(h, w, seed, (150, 142, 130)))
    else:
        yy_, xx_ = np.mgrid[0:h, 0:w].astype(np.float32)
        base = to_img(sample(marble, xx_ * 1.4 + 200, yy_ * 1.4 + 80) * 1.05)
    dr = ImageDraw.Draw(base)
    dr.rectangle([0, 0, w - 1, h - 1], outline=GD4 if level >= 3 else (70, 64, 58, 255), width=3 if level >= 3 else 2)
    if level >= 3: dr.rectangle([5, 5, w - 6, h - 6], outline=G4, width=2)
    # toalha: cobre o meio do altar e cai pelas duas pontas
    cw = int(w * (0.72 if level < 3 else 0.56)); ch_ = h + 6
    cl = np.array([238, 234, 222.]) * (1 + noise((ch_, cw), 2, seed + 3)[..., None] * 0.03)
    yy_, xx_ = np.mgrid[0:ch_, 0:cw].astype(np.float32)
    cl *= (1 - 0.06 * np.sin(xx_ / cw * 40)[..., None] * (np.abs(yy_ - ch_ / 2) > h * 0.42)[..., None])
    cloth = to_img(cl); cd = ImageDraw.Draw(cloth)
    for y in (3, ch_ - 6): cd.rectangle([0, y, cw, y + 2], fill=G4)
    cd.rectangle([0, 0, cw - 1, ch_ - 1], outline=(200, 194, 180, 255))
    out = Image.new('RGBA', (w, h + 8), (0, 0, 0, 0)); out.alpha_composite(base, (0, 4))
    out.alpha_composite(cloth, (int((w - cw) / 2), 1))
    return out

def eternal_flame(d):
    s = int(d); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    dr.ellipse([1, 1, s - 2, s - 2], fill=(120, 86, 30, 255), outline=G4, width=3)
    dr.ellipse([s * .16, s * .16, s * .84, s * .84], fill=(60, 40, 20, 255), outline=GD4, width=2)
    f = flame(s * 0.62, core=(255, 255, 250), mid=(255, 236, 160), outer=(255, 190, 70))
    im.alpha_composite(f, (int(c - f.width / 2), int(c - f.height / 2)))
    return im

def font(d, seed):
    s = int(d); yy_, xx_ = np.mgrid[0:s, 0:s].astype(np.float32)
    r = np.hypot(xx_ - s / 2, yy_ - s / 2) / (s / 2)
    st = stone_tex(s, s, seed, (156, 148, 136)) * np.clip(1.1 - r * 0.25, 0, 2)[..., None]
    wat = np.array([70, 120, 150.]) * (0.7 + 0.5 * np.clip(1 - r / 0.72, 0, 1))[..., None]
    colr = np.where((r < 0.72)[..., None], wat, st)
    im = to_img(colr, np.where(r <= 1, 255, 0)); dr = ImageDraw.Draw(im)
    dr.ellipse([s * .14, s * .14, s * .86, s * .86], outline=(90, 84, 76, 255), width=2)
    dr.ellipse([s * .3, s * .26, s * .44, s * .36], fill=(220, 240, 250, 170))
    dr.ellipse([1, 1, s - 2, s - 2], outline=(96, 90, 80, 255), width=2)
    return im

def cushion(w, h, colr=(150, 30, 40), gold=True):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([1, 1, w - 2, h - 2], radius=min(w, h) // 3, fill=colr + (255,), outline=tuple(int(v * .55) for v in colr) + (255,), width=2)
    dr.rounded_rectangle([w * .2, h * .2, w * .8, h * .8], radius=min(w, h) // 5, fill=tuple(min(255, int(v * 1.15)) for v in colr) + (255,))
    if gold:
        for x, y in ((3, 3), (w - 4, 3), (3, h - 4), (w - 4, h - 4)): dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=G4)
    return im

def bedding(bed, level):
    """colchão, lençol e travesseiro sobre o estrado de ferro (cabeceira no topo)"""
    im = bed.copy(); w, h = im.size; dr = ImageDraw.Draw(im)
    m = int(w * 0.1)
    dr.rounded_rectangle([m, m, w - m, h - m], radius=6, fill=(188, 176, 152, 255))
    sh_h, sh_w = int(h * .66), w - 2 * m - 4
    yy_, xx_ = np.mgrid[0:sh_h, 0:sh_w].astype(np.float32)
    folds = 1 + 0.05 * np.sin(xx_ / sh_w * 9 + noise((sh_h, sh_w), 8, 6) * 2.5)
    edge = 1 - 0.18 * np.exp(-np.minimum(xx_, sh_w - 1 - xx_) / 5)
    sheet = np.array([222, 214, 196.]) * (folds * edge * (1 + noise((sh_h, sh_w), 3, 5) * 0.03))[..., None]
    im.alpha_composite(to_img(sheet), (m + 2, int(h * 0.3)))
    dr.line([(m + 2, h * 0.3), (w - m - 2, h * 0.3)], fill=(200, 196, 186, 255), width=4)
    dr.rounded_rectangle([w * .2, h * .08, w * .8, h * .22], radius=8, fill=(232, 226, 212, 255), outline=(170, 160, 142, 255))
    if level >= 2: dr.rectangle([m + 2, h * .62, w - m - 2, h * .66], fill=(150, 30, 40, 255))
    return im

def canopy(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, w - 1, h - 1], fill=(250, 248, 240, 70))
    for k in range(0, h, 9): dr.line([(0, k), (w, k)], fill=(255, 255, 255, 40))
    dr.rectangle([0, 0, w - 1, h - 1], outline=G4, width=3)
    for x, y in ((0, 0), (w - 7, 0), (0, h - 7), (w - 7, h - 7)): dr.rectangle([x, y, x + 6, y + 6], fill=GD4)
    return im

def herb_table(w, h, seed):
    im = table(w, h, seed); dr = ImageDraw.Draw(im); rng = np.random.default_rng(seed)
    for k in range(18):                                    # maço de ervas
        x, y = rng.uniform(w * .08, w * .4), rng.uniform(h * .2, h * .8); rr = rng.uniform(3, 6)
        g = int(rng.uniform(90, 150)); dr.ellipse([x - rr, y - rr * .6, x + rr, y + rr * .6], fill=(60, g, 50, 255))
    for i in range(3):                                     # rolos de atadura
        x, y, rr = w * (.52 + i * .1), h * .35 + (i % 2) * h * .3, h * .14
        dr.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(240, 236, 224, 255), outline=(190, 184, 170, 255))
        dr.ellipse([x - rr * .35, y - rr * .35, x + rr * .35, y + rr * .35], outline=(190, 184, 170, 255))
    x, y, rr = w * .84, h * .5, h * .26                     # tigela
    dr.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(140, 100, 64, 255), outline=(80, 54, 30, 255), width=2)
    dr.ellipse([x - rr * .6, y - rr * .6, x + rr * .6, y + rr * .6], fill=(110, 140, 80, 255))
    b = bottle(h * .3, POTION['green'], 2); im.alpha_composite(b, (int(w * .66), int(h * .55)))
    return im

def offering_table(w, h, seed):
    im = table(w, h, seed, cloth=(110, 24, 32)); dr = ImageDraw.Draw(im)
    g = P['goblets'].resize((int(h * 0.9), int(h * 0.9 * P['goblets'].height / P['goblets'].width)), Image.LANCZOS)
    im.alpha_composite(g, (int(w * .06), int((h - g.height) / 2)))
    for i, (x, y) in enumerate(((.55, .45), (.66, .55))):     # pães
        cx, cy, rr = w * x, h * y, h * .17
        dr.ellipse([cx - rr * 1.3, cy - rr, cx + rr * 1.3, cy + rr], fill=(188, 128, 62, 255), outline=(120, 70, 30, 255))
        dr.line([(cx - rr * .6, cy), (cx + rr * .6, cy)], fill=(222, 176, 110, 255), width=2)
    cd = candle(h * 0.22); im.alpha_composite(cd, (int(w * .84 - cd.width / 2), int(h * .5 - cd.height / 2)))
    return im

def vase_flowers(img, seed):
    im = img.copy(); dr = ImageDraw.Draw(im); rng = np.random.default_rng(seed); c = im.width / 2
    for k in range(16):
        t = rng.uniform(0, 2 * math.pi); rr = rng.uniform(0, im.width * 0.36)
        x, y = c + rr * math.cos(t), c + rr * math.sin(t); s = rng.uniform(4, 8)
        dr.ellipse([x - s, y - s, x + s, y + s], fill=(40 + int(rng.uniform(0, 40)), 110, 50, 255))
    for k in range(9):
        t = rng.uniform(0, 2 * math.pi); rr = rng.uniform(0, im.width * 0.32)
        x, y = c + rr * math.cos(t), c + rr * math.sin(t); s = rng.uniform(5, 8)
        fc = [(240, 240, 235), (236, 200, 60), (220, 90, 120)][k % 3]
        dr.ellipse([x - s, y - s, x + s, y + s], fill=fc + (255,)); dr.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(200, 150, 40, 255))
    return im

def lit_candelabra(img):
    im = img.copy(); c = im.width / 2, im.height / 2
    for i in range(6):
        t = math.radians(i * 60); rr = im.width * 0.405
        f = flame(im.width * 0.12)
        im.alpha_composite(f, (int(c[0] + rr * math.cos(t) - f.width / 2), int(c[1] - rr * math.sin(t) - f.height / 2)))
    return im

def lit_center(img, k=0.18):
    im = img.copy(); f = flame(im.width * k)
    im.alpha_composite(f, (int(im.width / 2 - f.width / 2), int(im.height / 2 - f.height / 2))); return im

def halo(d):
    s = int(d); yy_, xx_ = np.mgrid[0:s, 0:s].astype(np.float32)
    r = np.hypot(xx_ - s / 2, yy_ - s / 2) / (s / 2)
    a = np.clip(1 - r, 0, 1) ** 1.5 * 90 + ((r > 0.88) & (r < 0.95)) * 200
    return to_img(np.zeros((s, s, 3)) + np.array([255, 214, 110.]), a)

def resurrection_circle(d):
    s = int(d); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    dr.ellipse([2, 2, s - 3, s - 3], fill=(30, 26, 30, 150))
    for k, wd in ((0.98, 5), (0.86, 2), (0.62, 3), (0.5, 1)):
        rr = c * k; dr.ellipse([c - rr, c - rr, c + rr, c + rr], outline=G4, width=wd)
    for i in range(32):                                    # runas entre os anéis
        t = i / 32 * 2 * math.pi; rr = c * 0.74; x, y = c + rr * math.cos(t), c + rr * math.sin(t); k = 3 + (i % 3)
        if i % 4 == 0: continue
        if i % 2: dr.line([(x - k, y - k), (x + k, y + k)], fill=G4, width=2); dr.line([(x - k, y + k), (x, y)], fill=G4, width=1)
        else: dr.polygon([(x, y - k), (x + k, y), (x, y + k), (x - k, y)], outline=G4)
    pts = []                                               # estrela de 8 pontas
    for i in range(16):
        t = math.radians(i * 22.5 - 90); rr = c * (0.5 if i % 2 == 0 else 0.26)
        pts.append((c + rr * math.cos(t), c + rr * math.sin(t)))
    dr.line(pts + [pts[0]], fill=G4, width=2)
    for i in range(8):                                     # pontos nas cores dos portões, nos pontos da estrela de fora
        t = math.radians(i * 45 - 90); rr = c * 0.86; x, y = c + rr * math.cos(t), c + rr * math.sin(t); k = c * 0.075
        dr.ellipse([x - k, y - k, x + k, y + k], fill=PRISMS[i] + (255,), outline=G4, width=2)
    rr = c * 0.12; dr.ellipse([c - rr, c - rr, c + rr, c + rr], fill=(255, 240, 200, 255), outline=G4, width=2)
    return im

def window_glass(w, h, colors):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    n = len(colors)
    for i, cl in enumerate(colors):
        dr.rectangle([w * i / n, 0, w * (i + 1) / n, h], fill=tuple(cl) + (255,))
    for i in range(1, n): dr.line([(w * i / n, 0), (w * i / n, h)], fill=(40, 34, 30, 255), width=2)
    dr.line([(0, h / 2), (w, h / 2)], fill=(40, 34, 30, 120), width=1)
    dr.rectangle([0, 0, w - 1, h - 1], outline=G4, width=3)
    return im

AMBER, BLUE, RED = (240, 170, 60), (60, 110, 220), (200, 50, 50)

def light_patch(a_win, colors, d0=14, d1=150, shear=2.6, width_deg=2.8):
    """luz do vitral no piso: faixa que parte da janela e cai inclinada (para baixo e à direita), uma cor por vidro"""
    layer = new_layer()
    dd = (RO - R) * SC / SS                                      # profundidade em px 1x
    t = np.clip((dd - d0) / (d1 - d0), 0, 1)
    center = a_win + shear * t
    rel = (ADEG - center) / width_deg + 0.5                     # 0..1 ao longo da largura da janela
    inside = (dd >= d0) & (dd <= d1) & (rel >= 0) & (rel <= 1)
    idx = np.clip((rel * len(colors)).astype(int), 0, len(colors) - 1)
    pal = np.array(colors, np.float32)
    colr = pal[idx]
    fade = (1 - t) ** 0.8 * 0.55 + 0.1
    edge = np.clip(np.minimum(rel, 1 - rel) * 8, 0, 1)
    a = np.where(inside, fade * edge * 200, 0)
    return to_img(colr, a)

def pew(layer, d0, a0, a1, seed, level):
    k = 2048 / (2.6 * PPM) * 0.55
    seat = polar_band(planks, k, d0, d0 + 13, a0, a1, 0.85)
    back = polar_band(planks, k, d0 + 13, d0 + 19, a0, a1, 0.5)
    layer.alpha_composite(seat); layer.alpha_composite(back)
    ends = 0.45
    for a in (a0, a1 - ends):
        layer.alpha_composite(polar_band(planks, k, d0 - 1, d0 + 20, a, a + ends, 0.38))
    if level >= 3:                                            # almofada vermelha no assento
        m = (R <= d2r(d0 + 3)) & (R >= d2r(d0 + 11)) & (ADEG >= a0 + 0.8) & (ADEG <= a1 - 0.8)
        cl = np.zeros((H, W, 3)) + np.array([128, 26, 34.]) * (1 + noise((H, W), 0.8, seed)[..., None] * 0.05)
        layer.alpha_composite(to_img(cl, np.where(m, 255, 0)))

def niche(layer, a, level, seed):
    """capela: meia-lua de pedra escura encostada na parede do fundo, com borda dourada"""
    x, y = rp(RO - T, a); rad = 50 * SS
    s = int(rad * 2) + 4
    yy_, xx_ = np.mgrid[0:s, 0:s].astype(np.float32)
    r = np.hypot(xx_ - s / 2, yy_ - s / 2) / rad
    st = stone_tex(s, s, seed, (96, 90, 84)) * np.clip(1.05 - r * 0.2, 0, 2)[..., None]
    if level >= 3:
        st = sample(marble, xx_ * 1.2 + seed * 40, yy_ * 1.2) * 1.05
    a_ = np.where((r <= 1) & (yy_ >= s / 2), 255, 0)
    im = to_img(st, a_); dr = ImageDraw.Draw(im)
    gw = 3 if level < 3 else 5
    dr.arc([s / 2 - rad + 1, s / 2 - rad + 1, s / 2 + rad - 1, s / 2 + rad - 1], 0, 180, fill=G4, width=gw)
    dr.arc([s / 2 - rad + 9, s / 2 - rad + 9, s / 2 + rad - 9, s / 2 + rad - 9], 0, 180, fill=GD4, width=1)
    im = im.rotate(-a, expand=True, resample=Image.BICUBIC)
    layer.alpha_composite(im, (round(x - im.width / 2), round(y - im.height / 2)))

# ------------------------------------------------------------------ níveis
CH_A = 12.4             # ângulo das capelas (±)

def compose(level):
    fxl = []
    def fx(t_, x, y, **kw): fxl.append((t_, x, y, kw))
    canvas = build_floor()
    floor_deco = new_layer(); light = new_layer()
    low = new_layer(); mid_ = new_layer(); top = new_layer(); wallp = new_layer(); over = new_layer()

    # ---------------- estrado do altar (2 degraus)
    if level < 3:
        floor_deco.alpha_composite(to_img(stone_tex(H, W, 21, (150, 142, 130)), np.where((R <= d2r(14)) & (R >= d2r(76)) & (np.abs(ADEG) <= 6.0), 255, 0)))
        floor_deco.alpha_composite(to_img(stone_tex(H, W, 22, (168, 160, 146)), np.where((R <= d2r(14)) & (R >= d2r(62)) & (np.abs(ADEG) <= 5.0), 255, 0)))
    else:
        k = 2048 / (520 * SS)
        floor_deco.alpha_composite(polar_band(marble, k, 14, 76, -6.0, 6.0, 0.95))
        floor_deco.alpha_composite(polar_band(marble, k, 14, 62, -5.0, 5.0, 1.15))
    for dd_, aa in ((76, 6.0), (62, 5.0)):                         # filetes dourados nas bordas dos degraus
        m = (((np.abs(R - d2r(dd_)) * SC) < (1.6 if level < 3 else 2.4)) & (np.abs(ADEG) <= aa)) | \
            ((np.abs(np.abs(ADEG) - aa) * np.pi / 180 * R * SC < (1.6 if level < 3 else 2.4)) & (R <= d2r(14)) & (R >= d2r(dd_)))
        floor_deco.alpha_composite(to_img(np.zeros((H, W, 3)) + (GOLD if level >= 2 or dd_ == 76 else GOLD_D), np.where(m, 255, 0)))

    # ---------------- corredor: tapete (2) ou mármore branco (3)
    if level == 2:
        rn = runner(int(50 * SS), int(176 * SS), 5)
        place(floor_deco, rn, 76 + 88, 0, width_px=rn.width)
    if level >= 3:
        k = 2048 / (420 * SS)
        floor_deco.alpha_composite(polar_band(white_marble, k, 76, 252, -2.7, 2.7, 1.0))
        gl = (R <= d2r(76)) & (R >= d2r(252)) & (np.abs(np.abs(ADEG) - 2.7) * R * SC * math.pi / 180 < 2.4)
        floor_deco.alpha_composite(to_img(np.zeros((H, W, 3)) + GOLD, np.where(gl, 255, 0)))

    # ---------------- vitrais na parede do fundo e luz no piso
    if level >= 2:
        wins = [(-8.0, [AMBER, BLUE, RED]), (8.0, [RED, BLUE, AMBER])] if level == 2 else \
               [(-8.0, PRISMS[:4]), (8.0, PRISMS[4:])]
        for a_w, cols in wins:
            cols_l = [tuple(min(255, int(v * 1.0 + 30)) for v in c) for c in cols]
            light.alpha_composite(light_patch(a_w - 1.4, cols_l, d0=14, d1=130 if level == 2 else 150))
            wg = window_glass(int(1.1 * PPM), int(T * SC * 0.55), cols)
            x, y = rp(RO - T * 0.5, a_w); put(wallp, wg, x, y, width_px=wg.width, rot=-a_w)
            x, y = rp(d2r(60), a_w + 1.0)
            gc = max(cols, key=lambda c: max(c) - min(c))          # a cor mais viva do vitral
            fx('glow', x, y, color='#%02x%02x%02x' % gc, radius=0.04)

    # ---------------- altar
    alt = altar(int(2.3 * PPM), int(0.8 * PPM), 31, level)
    place(mid_, alt, 36, 0, width_px=alt.width)
    for sgn in (-1, 1):
        x, y = place(top, lit_center(P['wooden_candlestick'], 0.35), 36, sgn * 2.55, width_m=0.2)
        fx('glow', x, y, color='#ffb347', radius=0.03)
    if level < 3:
        place(top, open_book(int(0.5 * PPM), int(0.34 * PPM)), 38, 0, width_m=0.5)
    else:
        place(top, open_book(int(0.44 * PPM), int(0.3 * PPM)), 38, -1.4, rot_extra=6, width_m=0.44)
        x, y = place(top, eternal_flame(0.42 * PPM), 36, 0.9, width_m=0.42)
        fx('glow', x, y, color='#ffe08a', radius=0.06)
        fx('sparks', x, y, color='#ffe08a')
    if level == 1:
        for sgn in (-1, 1):
            x, y = place(mid_, lit_center(P['wooden_candlestick'], 0.35), 68, sgn * 5.4, width_m=0.3)
            fx('glow', x, y, color='#ffb347', radius=0.035)
        place(mid_, P['plant'], 214, -13.0, width_m=0.6)
        place(mid_, P['plant'], 120, 13.6, width_m=0.45)
    if level >= 2:
        for sgn in (-1, 1):
            x, y = place(mid_, lit_candelabra(P['candelabra']), 64, sgn * 4.9, width_m=0.62)
            fx('glow', x, y, color='#ffb347', radius=0.045)
        place(mid_, vase_flowers(P['brass_vase_01'], 4), 24, 4.6, width_m=0.34)
    if level >= 3:
        place(mid_, P['chest'], 26, -4.3, rot_extra=2, width_m=0.72)

    # ---------------- capelas dos deuses
    for sgn in (-1, 1):
        niche(floor_deco, sgn * CH_A, level, 40 + sgn)
    if level >= 3:
        for sgn in (-1, 1):
            hl = halo(1.15 * PPM); place(floor_deco, hl, 46, sgn * CH_A, width_px=hl.width)
            fx('glow', *rp(d2r(46), sgn * CH_A), color='#ffd36e', radius=0.05)
    place(mid_, P['gothic_statue'], 46, -CH_A, width_m=1.2)
    ped = to_img(stone_tex(int(0.62 * PPM), int(0.62 * PPM), 9, (176, 168, 156)))
    ImageDraw.Draw(ped).rectangle([0, 0, ped.width - 1, ped.height - 1], outline=GD4 if level >= 2 else (90, 84, 76, 255), width=3)
    place(low, ped, 44, CH_A, width_px=ped.width)
    if level == 1:
        place(mid_, P['plant'], 44, CH_A, width_m=0.55)
    else:
        place(mid_, P['marble_bust_01'], 44, CH_A, width_m=0.55)
    # velas votivas no chão da capela esquerda
    for i, aa in enumerate((-13.6, -12.4, -11.2)):
        x, y = place(top, candle(0.14 * PPM), 84 + (i % 2) * 5, aa, width_m=0.16)
    fx('glow', *rp(d2r(86), -12.4), color='#ffb347', radius=0.035)
    if level >= 2:
        for sgn in (-1, 1):
            if level >= 3:
                rg = runner(int(30 * SS), int(56 * SS), 8 + sgn)
                place(floor_deco, rg, 104, sgn * CH_A, rot_extra=90, width_px=rg.width)
            for aa in (-1.0, 1.0):
                place(low, cushion(int(0.32 * PPM), int(0.25 * PPM)), 106, sgn * CH_A + aa * 0.9, width_m=0.32)
            x, y = place(mid_, lit_center(P['brass_diya_lantern'], 0.3), 92, sgn * (CH_A - 3.2), width_m=0.28)
            fx('glow', x, y, color='#ffb347', radius=0.03)

    # ---------------- bancos (3 fileiras de cada lado)
    for i, d0 in enumerate((134, 166, 198)):
        pew(mid_, d0, -10.2, -2.9, i, level)
        pew(mid_, d0, 2.9, 10.2, i + 10, level)

    # ---------------- mesa de oferendas (2) / círculo de ressurreição e incensários (3)
    if level == 2:
        place(mid_, offering_table(int(1.25 * PPM), int(0.5 * PPM), 61), 100, 0, width_m=1.25)
    if level >= 3:
        rc = resurrection_circle(56 * SS); place(floor_deco, rc, 102, 0, width_px=rc.width)
        fx('glow', *rp(d2r(102), 0), color='#e2b84a', radius=0.075)
        for sgn in (-1, 1):
            x, y = place(mid_, P['brass_pot_01'], 102, sgn * 4.3, width_m=0.34)
            fx('smoke', x, y, color='#d8cfc0')

    # ---------------- vigília: leitos junto às pontas, perto da frente
    beds = [1] if level == 1 else [-1, 1]
    for sgn in beds:
        bd = bedding(P['bed'], level)
        x, y = place(mid_, bd, 186, sgn * 13.0, height_m=1.85)
        stool = to_img(wood(int(0.34 * PPM), int(0.34 * PPM), seed=5, dark=0.75))
        place(low, stool, 214, sgn * 10.9, width_m=0.34)
        if level >= 3:
            cn = canopy(int(1.12 * PPM), int(1.95 * PPM)); place(over, cn, 186, sgn * 13.0, width_px=cn.width)
            x, y = place(top, candle(0.12 * PPM), 134, sgn * 11.2, width_m=0.14)
            fx('glow', x, y, color='#ffc46b', radius=0.03)
    if level >= 2:
        place(mid_, herb_table(int(0.86 * PPM), int(0.44 * PPM), 71), 236, -7.6, width_m=0.86)
        vt = votives(int(0.9 * PPM), int(0.3 * PPM), 81)
        x, y = place(mid_, vt, 236, 7.6, width_m=0.9)
        fx('glow', x, y, color='#ffb347', radius=0.04)

    # ---------------- pia de água benta ao lado da porta
    place(mid_, font(0.56 * PPM, 3), 232, -4.0 if level >= 2 else 4.0, width_m=0.56)

    th = new_layer(); leaf, lx, ly = threshold_and_door(th)
    canvas.alpha_composite(th)
    canvas = with_shadow(canvas, floor_deco, off=3, blur=3, strength=0.3)
    canvas.alpha_composite(light)
    canvas = with_shadow(canvas, low)
    canvas = with_shadow(canvas, mid_, off=10, blur=8, strength=0.5)
    canvas = with_shadow(canvas, top, off=5, blur=3, strength=0.45)
    canvas.alpha_composite(over)
    walls = build_walls(level)
    walls.alpha_composite(wallp)
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
    name = 'sanctuary.middle.png' if level == 1 else f'sanctuary.middle.lv{level}.png'
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
sheet.save(f'{OUT}/santuario_niveis.jpg', quality=90)
print('ok', len(fxs), 'fx')
