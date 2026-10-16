"""Prisão (prison) - arte outer, 3 níveis.
Uso: python3 -I compose_prisao.py <pasta_pipeline> <pasta_renders_prisao> <pasta_texturas_prisao> <pasta_saida>
Vista de cima por dentro (sem telhado), no molde outer 768x506: muralha no topo, bloco de celas
contra ela, corredor no meio, posto do carcereiro (esq.) e sala de interrogatório (dir.) na frente,
pátio com o portão voltado para baixo (centro da Axis). Base: receita do Alojamento (compose_quartel.py).
Assets CC0: Poly Haven small_wooden_table_01, WoodenChair_01, wooden_stool_02, large_iron_gate,
cobblestone_floor_08; ambientCG Metal041B e ThatchedRoof002A; demais renders já existentes em renders/."""
import json, math, sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

PIPE, REND, TEX, OUT = sys.argv[1:5]
os.makedirs(OUT, exist_ok=True)
L = json.load(open(f'{PIPE}/layout.v4.json'))
arc = next(x for x in L['slots'] if x['type'] == 'outer')['arc']
ri, ro = arc['innerRadius'], arc['outerRadius']; half = (arc['endAngle'] - arc['startAngle']) / 2
SS = 2
W0 = 768; w = 2 * ro * math.sin(math.radians(half)); h = ro - ri * math.cos(math.radians(half))
H0 = round(W0 * h / w); W, H = W0 * SS, H0 * SS; sc = W / w
CX, CY = W / 2, ro * sc
def P(r, a): return (CX + r * sc * math.sin(math.radians(a)), CY - r * sc * math.cos(math.radians(a)))
def px2deg(px, r): return math.degrees(px * SS / (r * sc))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / sc
A = np.degrees(np.arctan2(xx - CX, CY - yy))
U = np.radians(A) * R * sc
V = (ro - R) * sc

GOLD = (226, 184, 74); GOLD_D = (150, 112, 40)
IRON = (58, 54, 52); IRON_L = (120, 116, 112)

def noise(shape, cell, seed):
    g = np.random.default_rng(seed).random((max(2, shape[0] // cell[0] + 2), max(2, shape[1] // cell[1] + 2))).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((g.shape[1] * cell[1], g.shape[0] * cell[0]), Image.BICUBIC)
    return np.asarray(im, np.float32)[:shape[0], :shape[1]] / 255
def fbm(shape, cell, seed, oct=4):
    acc = np.zeros(shape, np.float32); amp = 1; tot = 0
    for o in range(oct):
        c = (max(1, cell[0] >> o), max(1, cell[1] >> o)); acc += amp * noise(shape, c, seed + o); tot += amp; amp *= .5
    return acc / tot

# ---------------- texturas ----------------
def load_tex(path, px):
    """textura quadrada reduzida para px (SS) de lado, valores 0..1"""
    return np.asarray(Image.open(path).convert('RGB').resize((px, px), Image.LANCZOS), np.float32) / 255
def tex_at(t, Uc, Vc):
    th, tw = t.shape[:2]
    return t[Vc.astype(int) % th, (Uc.astype(int) + 100000) % tw]

lab = Image.open(f'{PIPE}/exemplos/arcane_lab.outer.png').convert('RGB')
patch = np.asarray(lab.crop((330, 342, 560, 456)), np.float32) / 255
pt = np.concatenate([patch, patch[:, ::-1]], 1); pt = np.concatenate([pt, pt[::-1]], 0)
pt = np.asarray(Image.fromarray((pt * 255).astype(np.uint8)).resize((pt.shape[1] * SS, pt.shape[0] * SS), Image.BICUBIC), np.float32) / 255
def stone_at(Uc, Vc, k=1.0):
    th, tw = pt.shape[:2]
    return pt[(Vc * k).astype(int) % th, ((Uc * k).astype(int) + 100000) % tw]

COBBLE = load_tex(f'{TEX}/cobblestone_floor_08_diff_2k.jpg', 96 * SS)       # ~1,5 m de calçamento por ladrilho
METAL = load_tex(f'{TEX}/Metal041B_2K-JPG_Color.jpg', 160 * SS)
THATCH = load_tex(f'{TEX}/ThatchedRoof002A_2K-JPG_Color.jpg', 120 * SS)
MARBLE = load_tex(f'{PIPE}/../../public/assets/textures/marble_gold.jpg', 260 * SS)

def iron_color(img_rgb, seed=0):
    """aplica o ferro enferrujado (Metal041B escurecido) sobre uma camada RGBA"""
    a = np.asarray(img_rgb, np.float32)
    h_, w_ = a.shape[:2]
    m = METAL[(np.arange(h_)[:, None] + seed * 37) % METAL.shape[0], (np.arange(w_)[None] + seed * 53) % METAL.shape[1]]
    rust = np.clip((m[..., 0] - m[..., 2]) * 3, 0, 1)[..., None]
    base = a[..., :3] / 255
    col = base * (1 - rust * .55) + np.array([.42, .2, .1]) * rust * .55
    a[..., :3] = np.clip(col, 0, 1) * 255
    return Image.fromarray(a.astype(np.uint8))

def wood_floor(seed=11, base=(.40, .28, .18)):
    pw = 19 * SS
    row = np.floor(V / pw).astype(int)
    rr = np.random.default_rng(seed)
    nrow = row.max() + 2
    tone = rr.uniform(.78, 1.12, nrow); off = rr.uniform(0, 400, nrow)
    seg_len = 130 * SS
    useg = U + off[row] * SS + 3000
    seg = np.floor(useg / seg_len).astype(int)
    segtone = np.random.default_rng(seed + 1).uniform(.88, 1.1, (nrow, 200))[row, seg % 200]
    gshape = (int(V.max()) + 4, int(U.max() - U.min()) + 4)
    vi = np.clip(V.astype(int), 0, gshape[0] - 1); ui = np.clip((U - U.min()).astype(int), 0, gshape[1] - 1)
    gi = fbm(gshape, (3 * SS, 70 * SS), 21, 4)[vi, ui]
    col = np.array(base) * (tone[row] * segtone)[..., None] * (0.75 + 0.5 * gi[..., None])
    fv = V % pw; fu = useg % seg_len
    col[(fv < 1.6 * SS) | (fu < 1.6 * SS)] *= .35
    dirt = fbm(gshape, (60 * SS, 60 * SS), 41, 3)[vi, ui]
    col *= (0.8 + 0.3 * dirt[..., None])
    return np.clip(col, 0, 1)

# ---------------- sprites ----------------
def crop_a(im): return im.crop(im.split()[3].getbbox())
def rnd(name): return crop_a(Image.open(name).convert('RGBA'))
table = rnd(f'{REND}/table.png')
chair = rnd(f'{REND}/chair.png')
stool = rnd(f'{REND}/stool.png')
gate = rnd(f'{REND}/gate.png').transpose(Image.FLIP_TOP_BOTTOM)
bucket = rnd(f'{PIPE}/renders/deposito/wooden_bucket_01.png')
lantern = rnd(f'{PIPE}/renders/deposito/wooden_lantern_01.png')
chest = rnd(f'{PIPE}/renders/deposito/chest.png')
shield = rnd(f'{PIPE}/renders/deposito/kite_shield.png')
hammer = rnd(f'{PIPE}/renders/deposito/ornate_war_hammer.png')
crate = rnd(f'{PIPE}/renders/deposito/crate.png')
gtable = rnd(f'{PIPE}/renders/guilda/table.png')
books = rnd(f'{PIPE}/renders/livros.png')
barrels = Image.open(f'{PIPE}/renders/barris.png').convert('RGBA')
barrel = crop_a(barrels.crop((110, 60, 225, 175)))

def wood_tex(size, seed, base=(.36, .24, .15)):
    w_, h_ = size
    g = fbm((h_, w_), (40 * SS, 2), seed, 3)
    col = np.array(base)[None, None] * (0.7 + 0.55 * g[..., None])
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).convert('RGBA')

def blob_mask(w_, h_, seed, rough=.35):
    yy_, xx_ = np.mgrid[0:h_, 0:w_]
    d = ((xx_ - w_ / 2) / (w_ / 2)) ** 2 + ((yy_ - h_ / 2) / (h_ / 2)) ** 2
    n = fbm((h_, w_), (max(2, h_ // 4), max(2, w_ // 4)), seed, 3)
    return Image.fromarray(((d + (n - .5) * rough * 2) < .85).astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(1))

def make_straw(seed, size=(54, 36)):
    w_, h_ = size[0] * SS, size[1] * SS
    rr = np.random.default_rng(seed)
    oy, ox = rr.integers(0, THATCH.shape[0] - h_), rr.integers(0, THATCH.shape[1] - w_)
    t = THATCH[oy:oy + h_, ox:ox + w_]
    lum = t.mean(-1, keepdims=True)
    col = lum * np.array([1.35, 1.12, .62]) * (0.85 + 0.3 * fbm((h_, w_), (6, 6), seed, 2)[..., None])
    im = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    m = blob_mask(w_, h_, seed); im.putalpha(m)
    # fios soltos na borda
    d = ImageDraw.Draw(im)
    for _ in range(40):
        a = rr.uniform(0, 2 * math.pi); x = w_ / 2 + math.cos(a) * w_ * .44; y = h_ / 2 + math.sin(a) * h_ * .44
        d.line([(x, y), (x + rr.uniform(-5, 5) * SS, y + rr.uniform(-5, 5) * SS)], fill=(170, 140, 70, 230), width=1)
    return im

def wool(size, color, seed):
    w_, h_ = size
    folds = fbm((h_, w_), (h_ // 3 + 1, w_ // 4 + 1), seed + 9, 3)
    img = np.array(color, np.float32)[None, None] / 255 * (0.72 + 0.45 * folds[..., None])
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    im.putalpha(blob_mask(w_, h_, seed + 3, .25)); return im

def make_cot(seed, level):
    cw, ch = 28 * SS, 60 * SS
    cot = wood_tex((cw, ch), seed, (.34, .23, .14)); d = ImageDraw.Draw(cot)
    for k in range(1, 4): d.line([(0, ch * k / 4), (cw, ch * k / 4)], fill=(30, 20, 12, 255), width=SS)
    d.rectangle([0, 0, cw - 1, ch - 1], outline=(24, 15, 8, 255), width=SS)
    straw = make_straw(seed + 4, (24, 50)); cot.alpha_composite(straw.resize((cw - 4 * SS, ch - 8 * SS)), (2 * SS, 4 * SS))
    if seed % 2 == 0:
        bl = wool((cw - 2 * SS, int(ch * .55)), (96, 88, 74) if level < 3 else (70, 74, 92), seed)
        cot.alpha_composite(bl, (SS, int(ch * .4)))
    return cot

def make_chain_layer(size, seed, glow_=False):
    """grilhões: duas correntes saindo da parede (topo) e caindo em arco, com algemas"""
    w_, h_ = size
    im = Image.new('RGBA', (w_, h_), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for side in (-1, 1):
        x0 = w_ / 2 + side * w_ * .28
        pts = []
        n = 9
        for i in range(n):
            t = i / (n - 1)
            pts.append((x0 - side * w_ * .12 * t, 2 * SS + t * h_ * .75 + math.sin(t * math.pi) * 3 * SS))
        d.rectangle([x0 - 3 * SS, 0, x0 + 3 * SS, 3 * SS], fill=IRON + (255,))
        for i, (x, y) in enumerate(pts):
            rw, rh = (2.2 * SS, 3.2 * SS) if i % 2 == 0 else (3.2 * SS, 2.2 * SS)
            col = (150, 210, 255, 255) if glow_ else IRON_L + (255,)
            d.ellipse([x - rw, y - rh, x + rw, y + rh], outline=col, width=SS)
        x, y = pts[-1]
        d.ellipse([x - 5 * SS, y, x + 5 * SS, y + 9 * SS], outline=(170, 230, 255, 255) if glow_ else IRON + (255,), width=2 * SS)
    return im if glow_ else iron_color(im, seed)

def make_bars_seg(r, a1, a2, level, door=None, seed=0):
    """grade de ferro ao longo do arco r, de a1 a a2 (graus). door=(ad1, ad2) desenha porta com cadeado"""
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    thick = 5.5 if level == 1 else 6.5
    pts = [P(r, a1 + (a2 - a1) * i / 60) for i in range(61)]
    d.line(pts, fill=IRON + (255,), width=int(2.2 * SS) if level == 1 else 3 * SS, joint='curve')
    if level >= 2:
        pts2 = [P(r + .0012, a1 + (a2 - a1) * i / 60) for i in range(61)]
        d.line(pts2, fill=IRON + (255,), width=2 * SS, joint='curve')
    step = px2deg(9, r)
    a = a1 + step / 2
    while a < a2:
        x, y = P(r + .0006, a); rad = thick * SS / 2
        top = GOLD if (level >= 3 and int(round((a - a1) / step)) % 3 == 0) else IRON_L
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=(84, 80, 78, 255), outline=(18, 16, 14, 255))
        d.ellipse([x - rad * .6, y - rad * .75, x + rad * .1, y - rad * .05], fill=(top if top == GOLD else (190, 186, 180)) + (255,))
        a += step
    if door:
        ad1, ad2 = door
        for aa in (ad1, ad2):           # batentes da porta
            x0, y0 = P(r - .0016, aa); x1, y1 = P(r + .0028, aa)
            d.line([(x0, y0), (x1, y1)], fill=(36, 32, 30, 255), width=3 * SS)
        x, y = P(r - .0012, ad2 - px2deg(5, r))
        lockc = GOLD if level >= 3 else (90, 80, 70)
        d.rounded_rectangle([x - 3.5 * SS, y - 3 * SS, x + 3.5 * SS, y + 3 * SS], radius=SS, fill=lockc + (255,), outline=(20, 16, 12, 255))
    return iron_color(lay, seed)

def make_torch(crystal=False):
    s = 18 * SS; t = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(t)
    d.rectangle([s / 2 - 2 * SS, 0, s / 2 + 2 * SS, s / 2], fill=(40, 34, 30, 255))
    if crystal:
        d.polygon([(s / 2, s * .25), (s * .78, s * .58), (s / 2, s * .95), (s * .22, s * .58)], fill=(200, 235, 255, 255), outline=(110, 170, 220, 255))
        d.polygon([(s / 2, s * .35), (s * .62, s * .58), (s / 2, s * .8)], fill=(255, 255, 255, 220))
    else:
        d.ellipse([s * .22, s * .38, s * .78, s * .94], fill=(255, 150, 40, 255))
        d.ellipse([s * .34, s * .5, s * .66, s * .82], fill=(255, 230, 140, 255))
    return t

def make_brazier(seed, gold=False):
    bz = 40 * SS; b = Image.new('RGBA', (bz, bz), (0, 0, 0, 0)); d = ImageDraw.Draw(b)
    d.ellipse([0, 0, bz - 1, bz - 1], fill=(GOLD_D if gold else (52, 50, 54)) + (255,), outline=(24, 20, 16, 255), width=SS)
    d.ellipse([5 * SS, 5 * SS, bz - 6 * SS, bz - 6 * SS], fill=(28, 18, 14, 255))
    rr = np.random.default_rng(seed)
    pal = [(255, 230, 140), (255, 200, 90), (255, 250, 210)] if gold else [(255, 140, 40), (255, 90, 20), (255, 210, 100)]
    for _ in range(26):
        x, y = rr.uniform(8 * SS, bz - 8 * SS, 2); r = rr.uniform(1.5, 3.5) * SS
        if math.hypot(x - bz / 2, y - bz / 2) < bz / 2 - 8 * SS:
            d.ellipse([x - r, y - r, x + r, y + r], fill=pal[rr.integers(0, 3)] + (255,))
    gl = Image.new('RGBA', b.size, (0, 0, 0, 0)); ImageDraw.Draw(gl).ellipse([8 * SS, 8 * SS, bz - 8 * SS, bz - 8 * SS], fill=pal[1] + (150,))
    b.alpha_composite(gl.filter(ImageFilter.GaussianBlur(4 * SS)))
    if gold: ImageDraw.Draw(b).ellipse([0, 0, bz - 1, bz - 1], outline=GOLD + (255,), width=SS)
    return iron_color(b, seed) if not gold else b

def make_keys(gold=False):
    s = 16 * SS; k = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(k)
    c = GOLD if gold else (120, 110, 96)
    d.ellipse([3 * SS, 3 * SS, 11 * SS, 11 * SS], outline=c + (255,), width=SS)
    for ang in (-40, 10, 60):
        x0, y0 = 7 * SS + 4 * SS * math.cos(math.radians(ang)), 7 * SS + 4 * SS * math.sin(math.radians(ang))
        x1, y1 = x0 + 7 * SS * math.cos(math.radians(ang)), y0 + 7 * SS * math.sin(math.radians(ang))
        d.line([(x0, y0), (x1, y1)], fill=c + (255,), width=SS); d.rectangle([x1 - SS, y1 - SS, x1 + SS, y1 + SS], fill=c + (255,))
    return k

def make_drain():
    s = 22 * SS; g = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
    d.ellipse([0, 0, s - 1, s - 1], fill=(20, 18, 18, 255), outline=IRON + (255,), width=2 * SS)
    for k in range(-2, 3): d.line([(s / 2 + k * 4 * SS, 3 * SS), (s / 2 + k * 4 * SS, s - 3 * SS)], fill=IRON_L + (255,), width=SS)
    return iron_color(g, 5)

def make_strap_chair():
    c = chair.copy(); s = 120 / max(c.size); c = c.resize((int(c.width * s * 3), int(c.height * s * 3)), Image.LANCZOS)
    d = ImageDraw.Draw(c); w_, h_ = c.size
    for y in (h_ * .45, h_ * .7):
        d.rectangle([w_ * .12, y - 5, w_ * .88, y + 5], fill=(52, 30, 20, 255))
        d.rectangle([w_ * .47, y - 7, w_ * .53, y + 7], fill=(150, 140, 120, 255))
    for x in (w_ * .12, w_ * .88):
        d.rectangle([x - 6, h_ * .55, x + 6, h_ * .6], fill=(52, 30, 20, 255))
    return c

def make_shelf(level):
    sw_, sh_ = 96 * SS, 18 * SS
    s = wood_tex((sw_, sh_), 70, (.30, .20, .12)); d = ImageDraw.Draw(s)
    d.rectangle([0, 0, sw_ - 1, sh_ - 1], outline=(22, 14, 8, 255), width=SS)
    hm = hammer.resize((int(hammer.width * 40 * SS / max(hammer.size)), int(hammer.height * 40 * SS / max(hammer.size))))
    hm = hm.rotate(90, expand=True); s.alpha_composite(hm.crop((0, 0, min(hm.width, sw_), min(hm.height, sh_))), (4 * SS, 0))
    # corda enrolada, alicate e correntes
    d.ellipse([50 * SS, 3 * SS, 62 * SS, 15 * SS], outline=(170, 140, 90, 255), width=2 * SS)
    d.ellipse([53 * SS, 6 * SS, 59 * SS, 12 * SS], outline=(150, 120, 74, 255), width=SS)
    d.line([(68 * SS, 4 * SS), (80 * SS, 13 * SS)], fill=IRON_L + (255,), width=2 * SS)
    d.line([(68 * SS, 13 * SS), (80 * SS, 4 * SS)], fill=IRON_L + (255,), width=2 * SS)
    for i in range(5): d.ellipse([83 * SS + i * 2 * SS, 5 * SS + (i % 2) * 4 * SS, 87 * SS + i * 2 * SS, 9 * SS + (i % 2) * 4 * SS], outline=IRON_L + (255,), width=SS)
    return s

def make_crystal():
    s = 24 * SS; c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(c)
    d.ellipse([2 * SS, 2 * SS, s - 2 * SS, s - 2 * SS], fill=GOLD_D + (255,), outline=GOLD + (255,), width=SS)
    d.polygon([(s / 2, 4 * SS), (s - 6 * SS, s / 2), (s / 2, s - 4 * SS), (6 * SS, s / 2)], fill=(150, 215, 255, 255), outline=(230, 250, 255, 255))
    d.polygon([(s / 2, 6 * SS), (s / 2 + 4 * SS, s / 2), (s / 2, s / 2 + 2 * SS)], fill=(255, 255, 255, 230))
    return c

def make_keyboard():
    kw, kh = 50 * SS, 10 * SS
    k = wood_tex((kw, kh), 80, (.30, .20, .12)); d = ImageDraw.Draw(k)
    d.rectangle([0, 0, kw - 1, kh - 1], outline=GOLD + (255,), width=SS)
    for i in range(6):
        x = 5 * SS + i * 8 * SS
        d.ellipse([x - 1.5 * SS, 2 * SS, x + 1.5 * SS, 5 * SS], fill=GOLD + (255,))
        d.line([(x, 5 * SS), (x, 9 * SS)], fill=GOLD + (255,), width=SS)
    return k

def make_spear():
    s = Image.new('RGBA', (8 * SS, 70 * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(s)
    d.line([(4 * SS, 10 * SS), (4 * SS, 70 * SS)], fill=(110, 76, 44, 255), width=2 * SS)
    d.polygon([(4 * SS, 0), (7 * SS, 11 * SS), (1 * SS, 11 * SS)], fill=(180, 184, 192, 255), outline=(60, 60, 66, 255))
    return s

# ---------------- composição ----------------
r_wall_in = 0.3735; wt = 0.0032; r_back = ro - .0005
a_side = half - .55; a_side_in = a_side - math.degrees(wt / .405)
R_BAR = 0.4205                 # frente das celas
R_RW = 0.4045                  # parede de trás das salas da frente (lado do corredor)
r_mid_room = (r_wall_in + wt + R_RW - wt) / 2
HALL = px2deg(46, r_mid_room)  # meia largura do saguão de entrada
r_y = (ri + r_wall_in) / 2
R_CORR = (R_RW + R_BAR) / 2
R_CELL = (R_BAR + r_back - wt) / 2

def cells_for(level):
    n = 6; step = 2 * a_side_in / n
    edges = [-a_side_in + step * i for i in range(n + 1)]
    cells = [(edges[i], edges[i + 1]) for i in range(n)]
    if level == 1: return cells[1:5], [cells[0], cells[5]], edges
    if level == 2: return cells, [], edges
    return [cells[0], cells[1], (edges[2], edges[4]), cells[4], cells[5]], [], edges

def norm(r, a):
    x, y = P(r, a); return round(x / W, 3), round(y / H, 3)

FX = {}

def compose(level):
    fx = []
    cells, storage, edges = cells_for(level)
    img = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
    inside = (R >= ri) & (R <= ro) & (np.abs(A) <= half)
    # pátio de pedra
    st = stone_at(U, V) * .92
    img[inside] = st[inside]; alpha[inside] = 1
    # pisos internos
    corridor = (R > R_RW) & (R < R_BAR) & (np.abs(A) < a_side_in)
    hall = (R > r_wall_in + wt) & (R <= R_RW) & (np.abs(A) < HALL)
    rooms = (R > r_wall_in + wt) & (R < R_RW - wt) & (np.abs(A) > HALL + math.degrees(wt / .39)) & (np.abs(A) < a_side_in)
    cellz = (R >= R_BAR) & (R < r_back - wt) & (np.abs(A) < a_side_in)
    cbc = tex_at(COBBLE, U * 1.0 + 37, V * 1.0 + 11)
    fl = (cbc.mean(-1, keepdims=True) * .6 + cbc * .4) * np.array([1.08, 1.0, .9])
    img[corridor | hall] = np.clip(fl * .8, 0, 1)[corridor | hall]
    wf = wood_floor(13, (.38, .26, .17) if level < 3 else (.42, .29, .19))
    img[rooms] = wf[rooms]
    cb = tex_at(COBBLE, U, V)
    cbg = cb.mean(-1, keepdims=True); cb = cbg * .7 + cb * .3
    dirt = fbm((H, W), (30 * SS, 30 * SS), 55, 3)[..., None]
    mud = np.clip((fbm((H, W), (14 * SS, 14 * SS), 66, 3) - .45) * 3, 0, 1)[..., None]
    cellf = cb * (.62 + .25 * dirt) * np.array([.95, .88, .76])
    cellf = cellf * (1 - mud * .55) + np.array([.28, .22, .14]) * mud * .55
    img[cellz] = cellf[cellz]
    # depósito nas pontas (nível 1): mesmo chão de pedra, mais claro
    for a1, a2 in storage:
        m = (R >= R_BAR - .001) & (R < r_back - wt) & (A > a1) & (A < a2)
        img[m] = (cb * (.6 + .25 * dirt))[m]
    # cela de contenção (nível 3): mármore negro com veios dourados
    if level >= 3:
        c1, c2 = cells[2]
        m = (R >= R_BAR) & (R < r_back - wt) & (A > c1) & (A < c2)
        mb = tex_at(MARBLE, U, V)
        img[m] = np.clip(mb * 1.25, 0, 1)[m]
    # paredes
    walls = (R >= r_wall_in) & (R <= r_back) & (np.abs(A) <= a_side) & ~(corridor | hall | rooms | cellz)
    for a1, a2 in storage:
        walls &= ~((R >= R_BAR - .002) & (R < r_back - wt) & (A > a1) & (A < a2))
    # divisórias das celas (radiais)
    divs = np.zeros_like(walls)
    for e in edges[1:-1]:
        if level >= 3 and abs(e) < 1e-6: continue
        aw = math.degrees(wt * .75 / R_CELL)
        divs |= (R >= R_BAR) & (R <= r_back) & (np.abs(A - e) < aw)
    walls |= divs
    # parede de trás das salas e paredes radiais do saguão
    rw = (R > R_RW - wt) & (R <= R_RW) & (np.abs(A) < a_side_in) & (np.abs(A) > HALL)
    rad = (R > r_wall_in) & (R <= R_RW) & (np.abs(np.abs(A) - HALL - math.degrees(wt / 2 / .39)) < math.degrees(wt / 2 / .39))
    # portas das salas (no meio das paredes radiais, abrindo para o saguão)
    door_r = (R > r_mid_room - .0035) & (R < r_mid_room + .0035)
    rad &= ~door_r
    walls |= rw | rad
    radstrip = (R > r_wall_in + wt) & (R < R_RW - wt) & (np.abs(A) >= HALL) & (np.abs(A) <= HALL + math.degrees(wt / .39)) & door_r
    walls &= ~radstrip
    img[radstrip] = wf[radstrip] * .85
    door_front = (R < r_wall_in + wt + .0003) & (np.abs(A) < px2deg(26, r_wall_in))
    walls &= ~door_front
    img[door_front & (R >= r_wall_in)] = fl[door_front & (R >= r_wall_in)] * .85
    img[door_r & (np.abs(np.abs(A) - HALL - math.degrees(wt / 2 / .39)) < math.degrees(wt / 2 / .39))] *= .9
    sw = stone_at(U * 1.6, V * 1.6)
    swg = sw.mean(-1, keepdims=True)
    img[walls] = (swg * np.array([.6, .6, .63]) + sw * .06)[walls]
    # sombra das paredes
    wm = Image.fromarray((walls * 255).astype(np.uint8))
    shm = Image.new('L', wm.size, 0); shm.paste(wm, (6 * SS, 7 * SS)); shm = shm.filter(ImageFilter.GaussianBlur(5 * SS))
    shv = np.asarray(shm, np.float32) / 255 * 0.55
    img *= (1 - shv * (~walls))[..., None]
    ao = Image.fromarray((walls * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10 * SS))
    img *= (1 - 0.3 * np.asarray(ao, np.float32) / 255 * (~walls))[..., None]
    # celas mais escuras (pouca luz)
    img[cellz] *= .9

    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
    d = ImageDraw.Draw(out, 'RGBA')

    def arcline(r, a1, a2, col, wd, n=120):
        d.line([P(r, a1 + (a2 - a1) * i / n) for i in range(n + 1)], fill=col, width=wd, joint='curve')

    def paste(im, r, a, size_px, rot_extra=0, shadow=True, sh_alpha=.6):
        nonlocal out
        im = im.copy(); s = size_px * SS / max(im.size)
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
        im = im.rotate(-a + rot_extra, expand=True, resample=Image.BICUBIC)
        x, y = P(r, a)
        if shadow:
            s2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); s2.putalpha(im.split()[3].point(lambda v: int(v * sh_alpha)))
            s2 = s2.filter(ImageFilter.GaussianBlur(3 * SS)); out.alpha_composite(s2, (int(x - im.width / 2 + 4 * SS), int(y - im.height / 2 + 5 * SS)))
        out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))

    def glow(r, a, rad_px, col, alpha_):
        nonlocal out
        g = Image.new('RGBA', out.size, (0, 0, 0, 0)); x, y = P(r, a)
        ImageDraw.Draw(g).ellipse([x - rad_px * SS, y - rad_px * SS, x + rad_px * SS, y + rad_px * SS], fill=col + (alpha_,))
        out.alpha_composite(g.filter(ImageFilter.GaussianBlur(rad_px * SS * .45)))

    rr = np.random.default_rng(level * 17)

    # ---- nível 3: círculo de runas na cela de contenção ----
    if level >= 3:
        c1, c2 = cells[2]
        rc, ac = R_CELL - .0005, (c1 + c2) / 2
        glow(rc, ac, 52, (226, 184, 74), 60)
        x, y = P(rc, ac); rad = 34 * SS
        rl = Image.new('RGBA', out.size, (0, 0, 0, 0)); rd = ImageDraw.Draw(rl)
        rd.ellipse([x - rad, y - rad, x + rad, y + rad], outline=GOLD + (255,), width=2 * SS)
        rd.ellipse([x - rad * .8, y - rad * .8, x + rad * .8, y + rad * .8], outline=GOLD + (220,), width=SS)
        for k in range(24):
            t = math.radians(k * 15 + 7)
            rx, ry_ = x + math.cos(t) * rad * .9, y + math.sin(t) * rad * .9
            rd.line([(rx - 1.5 * SS, ry_ - 1.5 * SS), (rx + 1.5 * SS, ry_ + 1.5 * SS)], fill=GOLD + (255,), width=SS)
            if k % 2: rd.line([(rx + 1.5 * SS, ry_ - 1.5 * SS), (rx - 1.5 * SS, ry_ + 1.5 * SS)], fill=GOLD + (255,), width=SS)
        cols = [(150, 80, 200), (70, 170, 90), (240, 240, 240), (240, 140, 50), (70, 120, 220), (30, 30, 34), (210, 50, 50), (240, 210, 60)]
        for k, c in enumerate(cols):
            t = math.radians(k * 45 - 90)
            px_, py_ = x + math.cos(t) * rad, y + math.sin(t) * rad
            rd.ellipse([px_ - 4 * SS, py_ - 4 * SS, px_ + 4 * SS, py_ + 4 * SS], fill=c + (255,), outline=GOLD + (255,), width=SS)
        rd.polygon([(x, y - rad * .5), (x + rad * .5, y), (x, y + rad * .5), (x - rad * .5, y)], outline=GOLD + (200,), width=SS)
        out.alpha_composite(rl)
        fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(rc, ac))), "color": "#E2B84A", "radius": 0.07, "minLevel": 3})
        fx.append({"type": "sparks", **dict(zip(('x', 'y'), norm(rc, ac))), "color": "#ffe08a", "minLevel": 3})
        # grilhões de luz na parede do fundo da contenção
        ch = make_chain_layer((60 * SS, 40 * SS), 9, glow_=True)
        glow(r_back - wt - .004, ac, 30, (150, 210, 255), 50)
        paste(ch, r_back - wt - 20 * SS / sc, ac, 60, shadow=False)
        fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(r_back - wt - .004, ac))), "color": "#9fd8ff", "radius": 0.04, "minLevel": 3})

    # ---- conteúdo das celas ----
    for i, (a1, a2) in enumerate(cells):
        if level >= 3 and i == 2: continue
        ac = (a1 + a2) / 2; s_ = -1 if ac < 0 else 1
        if level == 1 or i % 2 == 1:
            paste(make_straw(level * 10 + i), R_CELL + .002, ac + rr.uniform(-.3, .3), 56, rot_extra=rr.uniform(-20, 20), sh_alpha=.35)
            if i == 1 or (level >= 2 and i == 4):
                paste(wool((40 * SS, 26 * SS), (92, 84, 70), i + level), R_CELL + .002, ac, 38, rot_extra=rr.uniform(-30, 30), sh_alpha=.4)
        else:
            paste(make_cot(i + level, level), R_CELL + .0005, ac - s_ * .5, 62, rot_extra=0, sh_alpha=.5)
        paste(bucket, R_BAR + .0045, a2 - px2deg(16, R_CELL) if s_ < 0 else a1 + px2deg(16, R_CELL), 17)
        if level >= 2:
            paste(make_chain_layer((44 * SS, 30 * SS), i), r_back - wt - 15 * SS / sc, ac + s_ * .4, 44, shadow=False)
    # grades (por cima do conteúdo)
    for i, (a1, a2) in enumerate(cells):
        aw = math.degrees(wt * .75 / R_BAR)
        ac = (a1 + a2) / 2; dw = px2deg(13, R_BAR)
        out.alpha_composite(make_bars_seg(R_BAR + .0004, a1 + aw, a2 - aw, level, door=(ac - dw, ac + dw), seed=i))
    # depósito (nível 1): caixotes e barris nas pontas
    for a1, a2 in storage:
        ac = (a1 + a2) / 2
        paste(crate, R_CELL + .004, ac - .4, 46, rot_extra=rr.uniform(-6, 6))
        paste(barrel, R_CELL - .006, ac + .7, 30)
        paste(barrel, R_CELL - .004, ac - .9, 26)

    # ---- corredor ----
    torch_as = [-4.4, 4.4] if level == 1 else [-5.6, -1.9, 1.9, 5.6]
    rt = R_RW + .0012
    for a in torch_as:
        if level >= 3:
            glow(rt + .002, a, 34, (210, 235, 255), 70)
            fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(rt + .002, a))), "color": "#dff2ff", "radius": 0.04, "minLevel": 3})
        else:
            glow(rt + .002, a, 34, (255, 160, 60), 75)
            fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(rt + .002, a))), "color": "#ffb347", "radius": 0.04,
                       **({"maxLevel": 2} if abs(a) == 4.4 or True else {}), **({"minLevel": 2} if level == 2 and abs(a) > 5 else {})})
        paste(make_torch(level >= 3), rt, a, 18, rot_extra=180, sh_alpha=.4)
    if level >= 2:
        paste(make_drain(), R_CORR + .0015, 0, 20, shadow=False)

    # ---- posto do carcereiro (esquerda) ----
    gL = -(HALL + a_side_in) / 2
    if level == 1:
        paste(crate, r_mid_room + .001, gL, 44, rot_extra=4)
        paste(make_keys(), r_mid_room + .0015, gL + .3, 14, shadow=False)
        paste(lantern, r_mid_room + .0005, gL - .9, 16)
        glow(r_mid_room + .0005, gL - .9, 22, (255, 170, 80), 70)
        fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(r_mid_room + .0005, gL - .9))), "color": "#ffb347", "radius": 0.03, "maxLevel": 1})
        paste(stool, r_mid_room - .0075, gL, 26, rot_extra=90)
        paste(barrel, R_RW - wt - .004, -a_side_in + px2deg(16, R_RW), 26)
    else:
        paste(gtable, r_mid_room + .001, gL, 74)
        paste(books, r_mid_room + .002, gL - .5, 20, rot_extra=8)
        paste(make_keys(gold=level >= 3), r_mid_room + .0012, gL + 1.0, 14, shadow=False)
        paste(lantern, r_mid_room, gL + 1.9, 16)
        glow(r_mid_room, gL + 1.9, 24, (255, 170, 80), 70)
        if level == 2:
            fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(r_mid_room, gL + 1.9))), "color": "#ffb347", "radius": 0.03, "minLevel": 2})
        paste(stool, r_mid_room - .0095, gL, 26, rot_extra=90)
        paste(chest, R_RW - wt - .0055, gL + 1.3, 40, rot_extra=180)
        paste(shield, r_wall_in + wt + .006, -a_side_in + px2deg(18, r_wall_in + .01), 34, rot_extra=0)
        paste(make_spear(), r_mid_room, -a_side_in + px2deg(8, r_mid_room), 64, rot_extra=4)
        if level >= 3:
            paste(make_keyboard(), R_RW - wt - .0025, gL - 1.0, 50, rot_extra=180, sh_alpha=.4)

    # ---- sala de interrogatório (direita) ----
    gR = (HALL + a_side_in) / 2
    tr = r_mid_room + .001
    if level >= 3:     # tapete escuro com borda dourada
        rx0, ry0 = P(tr, gR)
        rug = Image.new('RGBA', (96 * SS, 66 * SS), (0, 0, 0, 0)); rdd = ImageDraw.Draw(rug)
        rdd.rectangle([0, 0, 96 * SS - 1, 66 * SS - 1], fill=(58, 18, 22, 255), outline=GOLD + (255,), width=2 * SS)
        rdd.rectangle([5 * SS, 5 * SS, 91 * SS, 61 * SS], outline=GOLD_D + (255,), width=SS)
        paste(rug, tr, gR, 96, shadow=False)
    paste(table, tr, gR, 64, rot_extra=0)
    if level >= 2:
        paste(make_strap_chair(), tr + 36 * SS / sc, gR, 38, rot_extra=0)
    else:
        paste(chair, tr + 36 * SS / sc, gR, 36, rot_extra=0)
    paste(chair, tr - 36 * SS / sc, gR, 36, rot_extra=180)
    if level >= 3:
        glow(tr, gR + .4, 26, (150, 210, 255), 80)
        paste(make_crystal(), tr, gR + .4, 20)
        fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(tr, gR + .4))), "color": "#9fd8ff", "radius": 0.035, "minLevel": 3})
    else:
        glow(tr, gR + .6, 24, (255, 170, 80), 75)
        paste(lantern, tr, gR + .6, 15)
        fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(tr, gR + .6))), "color": "#ffb347", "radius": 0.03, "maxLevel": 2})
    if level >= 2:
        paste(books, tr + .001, gR - .6, 18, rot_extra=-10)
        paste(make_shelf(level), r_mid_room, a_side_in - px2deg(10, r_mid_room), 96, rot_extra=-90, sh_alpha=.5)
        bz_r, bz_a = R_RW - wt - .0062, HALL + px2deg(36, R_RW)
        glow(bz_r, bz_a, 34, (255, 120, 30), 70)
        paste(make_brazier(11, gold=level >= 3), bz_r, bz_a, 30)
        fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(bz_r, bz_a))), "color": "#ff7a1a", "radius": 0.04, "minLevel": 2})
        fx.append({"type": "sparks", **dict(zip(('x', 'y'), norm(bz_r, bz_a))), "minLevel": 2})

    # ---- pátio e portão ----
    dh = px2deg(26, r_wall_in)
    if level == 1:
        for s_ in (-1, 1):     # folhas de madeira abertas para fora
            lf = wood_tex((26 * SS, 6 * SS), 60 + s_, (.34, .22, .13))
            ImageDraw.Draw(lf).rectangle([0, 0, 26 * SS - 1, 6 * SS - 1], outline=(22, 14, 8, 255), width=SS)
            for xk in (4, 21): ImageDraw.Draw(lf).line([(xk * SS, 0), (xk * SS, 6 * SS)], fill=IRON + (255,), width=SS)
            x0, y0 = P(r_wall_in, s_ * dh)
            lf = lf.rotate(-s_ * 70, expand=True, resample=Image.BICUBIC)
            cx_, cy_ = x0 - s_ * 13 * SS * math.cos(math.radians(70)), y0 + 13 * SS * math.sin(math.radians(70))
            out.alpha_composite(lf, (int(cx_ - lf.width / 2), int(cy_ - lf.height / 2)))
        paste(barrel, r_y, -px2deg(150, r_y), 32)
        paste(crate, r_y + .001, px2deg(170, r_y), 44, rot_extra=8)
    else:
        gw_ = 2 * 26 + 10
        g_ = gate.resize((gw_ * SS * 2, 20 * SS * 2), Image.LANCZOS)
        if level >= 3:
            gd = ImageDraw.Draw(g_)
            for k in range(9): gd.ellipse([k * g_.width / 8 - 3 * SS, g_.height / 2 - 3 * SS, k * g_.width / 8 + 3 * SS, g_.height / 2 + 3 * SS], fill=GOLD + (255,))
            gd.ellipse([g_.width / 2 - 8 * SS, g_.height / 2 - 8 * SS, g_.width / 2 + 8 * SS, g_.height / 2 + 8 * SS], fill=GOLD_D + (255,), outline=GOLD + (255,), width=SS)
        g_ = ImageEnhance.Brightness(g_).enhance(3.0)
        gl_ = Image.new('RGBA', g_.size, (0, 0, 0, 0)); ImageDraw.Draw(gl_).rectangle([0, g_.height * .38, g_.width, g_.height * .62], fill=IRON + (255,))
        gl_.alpha_composite(g_); g_ = gl_
        paste(g_, r_wall_in - .0012, 0, gw_, sh_alpha=.8)
        for s_ in (-1, 1):
            pst = Image.new('RGBA', (12 * SS, 12 * SS), (0, 0, 0, 0))
            ImageDraw.Draw(pst).rectangle([0, 0, 12 * SS - 1, 12 * SS - 1], fill=(120, 116, 112, 255), outline=(GOLD if level >= 3 else (40, 38, 36)) + (255,), width=SS)
            paste(pst, r_wall_in - .0012, s_ * px2deg(gw_ / 2 + 3, r_wall_in), 12, sh_alpha=.6)
        for s_ in (-1, 1):
            a = s_ * px2deg(52, r_y)
            col = (255, 200, 90) if level >= 3 else (255, 120, 30)
            glow(r_y, a, 44, col, 70)
            paste(make_brazier(s_ + 3, gold=level >= 3), r_y, a, 36)
            fx.append({"type": "glow", **dict(zip(('x', 'y'), norm(r_y, a))), "color": "#ffc04d" if level >= 3 else "#ff7a1a", "radius": 0.05,
                       **({"minLevel": 2, "maxLevel": 2} if level == 2 else {"minLevel": 3})})
        paste(barrel, r_y + .002, -px2deg(170, r_y), 32)
        paste(barrel, r_y - .003, -px2deg(140, r_y), 28)
        paste(crate, r_y + .001, px2deg(165, r_y), 50, rot_extra=-6)
        if level >= 3:
            paste(make_spear(), r_y, px2deg(215, r_y), 56, rot_extra=86)

    # ---- contornos dourados ----
    gw = (4 if level >= 3 else 3) * SS
    arcline(r_back - .0005, -a_side, a_side, GOLD + (255,), gw)
    arcline(r_wall_in + .0003, -a_side, -dh, GOLD + (255,), gw)
    arcline(r_wall_in + .0003, dh, a_side, GOLD + (255,), gw)
    for s_ in (-1, 1):
        d.line([P(r_wall_in, s_ * (a_side - .05)), P(r_back, s_ * (a_side - .05))], fill=GOLD + (255,), width=gw)
    arcline(ri + .0015, -half + .35, half - .35, GOLD + (150,), 2 * SS)
    for s_ in (-1, 1):     # cravos nos cantos
        for r_ in (r_back - .0005, r_wall_in + .0003):
            x, y = P(r_, s_ * (a_side - .05)); k = (6 if level >= 3 else 4) * SS
            d.polygon([(x, y - k), (x + k, y), (x, y + k), (x - k, y)], fill=GOLD + (255,), outline=GOLD_D + (255,))

    clamp = inside.astype(np.float32)
    out.putalpha(Image.fromarray((np.asarray(out.split()[3], np.float32) * clamp).astype(np.uint8)))
    out = out.resize((W0, H0), Image.LANCZOS)
    m = Image.open(f'{PIPE}/templates/outer_arc_mask.png').convert('L')
    out.putalpha(Image.fromarray(np.minimum(np.asarray(out.split()[3]), np.asarray(m))))
    FX[level] = fx
    return out

names = {1: 'prison.outer.png', 2: 'prison.outer.lv2.png', 3: 'prison.outer.lv3.png'}
for lv in (1, 2, 3):
    compose(lv).save(f'{OUT}/{names[lv]}')
    print('ok', lv)
json.dump(FX, open(f'{OUT}/fx_por_nivel.json', 'w'), indent=1)
