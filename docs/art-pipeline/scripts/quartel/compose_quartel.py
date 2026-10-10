"""Quartel (alojamento dos soldados) - arte outer, 3 níveis.
Uso: python3 -I compose_quartel.py <pasta_pipeline> <pasta_saida>
Vista de cima do interior do dormitório (sem telhado), no molde outer 768x506:
muralha no topo, porta e pátio voltados para baixo (centro da Axis).
Texturas: pedra extraída do Laboratório Arcano aprovado (Stone Wall 23 já tratada);
caixote, barris e candelabro dos renders Poly Haven (CC0) em renders/;
madeira do piso, camas e cobertores gerados por código."""
import json, math, sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageChops

PIPE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
L = json.load(open(f'{PIPE}/layout.v4.json'))
arc = next(x for x in L['slots'] if x['type'] == 'outer')['arc']
ri, ro = arc['innerRadius'], arc['outerRadius']; half = (arc['endAngle'] - arc['startAngle']) / 2
SS = 2                                             # supersampling
W0 = 768; w = 2 * ro * math.sin(math.radians(half)); h = ro - ri * math.cos(math.radians(half))
H0 = round(W0 * h / w); W, H = W0 * SS, H0 * SS; sc = W / w
CX, CY = W / 2, ro * sc
def P(r, a): return (CX + r * sc * math.sin(math.radians(a)), CY - r * sc * math.cos(math.radians(a)))
def px2deg(px, r): return math.degrees(px * SS / (r * sc))   # px (na arte final) ao longo do arco -> graus
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / sc
A = np.degrees(np.arctan2(xx - CX, CY - yy))
U = np.radians(A) * R * sc            # comprimento de arco (tangencial), px SS
V = (ro - R) * sc                     # profundidade radial, px SS
rng0 = np.random.default_rng(7)

GOLD = (226, 184, 74); GOLD_D = (150, 112, 40)

def noise(shape, cell, seed):
    """ruído suave: grade aleatória ampliada (bilinear), valores ~0..1"""
    g = np.random.default_rng(seed).random((max(2, shape[0] // cell[0] + 2), max(2, shape[1] // cell[1] + 2))).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((g.shape[1] * cell[1], g.shape[0] * cell[0]), Image.BICUBIC)
    return np.asarray(im, np.float32)[:shape[0], :shape[1]] / 255
def fbm(shape, cell, seed, oct=4):
    acc = np.zeros(shape, np.float32); amp = 1; tot = 0
    for o in range(oct):
        c = (max(1, cell[0] >> o), max(1, cell[1] >> o)); acc += amp * noise(shape, c, seed + o); tot += amp; amp *= .5
    return acc / tot

# ---------------- texturas ----------------
lab = Image.open(f'{PIPE}/exemplos/arcane_lab.outer.png').convert('RGB')
patch = np.asarray(lab.crop((330, 342, 560, 456)), np.float32) / 255
pt = np.concatenate([patch, patch[:, ::-1]], 1); pt = np.concatenate([pt, pt[::-1]], 0)      # tile espelhado
pt = np.asarray(Image.fromarray((pt * 255).astype(np.uint8)).resize((pt.shape[1] * SS, pt.shape[0] * SS), Image.BICUBIC), np.float32) / 255
def stone_at(Uc, Vc, k=1.0):
    th, tw = pt.shape[:2]
    return pt[(Vc * k).astype(int) % th, (Uc * k).astype(int) % tw]

def wood_floor():
    """tábuas tangenciais (acompanham a curva), cada uma com tom, emendas e veios próprios"""
    pw = 21 * SS                                  # largura da tábua
    row = np.floor(V / pw).astype(int)
    rr = np.random.default_rng(11)
    nrow = row.max() + 2
    tone = rr.uniform(.78, 1.12, nrow); hue = rr.uniform(-.04, .04, nrow); off = rr.uniform(0, 400, nrow)
    seg_len = 150 * SS
    useg = U + off[row] * SS + 3000
    seg = np.floor(useg / seg_len).astype(int)
    segtone = np.random.default_rng(5).uniform(.88, 1.1, (nrow, 200))[row, seg % 200]
    # veio: ruído esticado na direção tangencial
    gshape = (int(V.max()) + 4, int(U.max() - U.min()) + 4)
    grain = fbm(gshape, (3 * SS, 70 * SS), 21, 4)
    gi = grain[np.clip(V.astype(int), 0, gshape[0] - 1), np.clip((U - U.min()).astype(int), 0, gshape[1] - 1)]
    fine = fbm(gshape, (1, 18 * SS), 31, 3)[np.clip(V.astype(int), 0, gshape[0] - 1), np.clip((U - U.min()).astype(int), 0, gshape[1] - 1)]
    base = np.stack([.42, .29, .18])
    t = (tone[row] * segtone)[..., None]
    col = base * t * (0.75 + 0.5 * gi[..., None]) * (0.9 + 0.2 * fine[..., None])
    col[..., 0] *= 1 + hue[row]; col[..., 2] *= 1 - hue[row]
    # frestas entre tábuas e emendas
    fv = (V % pw); gap = (fv < 1.6 * SS)
    fu = (useg % seg_len); gap2 = fu < 1.6 * SS
    col[gap | gap2] *= .35
    # pregos nas pontas
    nail = ((fu > 6 * SS) & (fu < 9 * SS) & ((np.abs(fv - pw * .3) < 1.3 * SS) | (np.abs(fv - pw * .7) < 1.3 * SS)))
    col[nail] = col[nail] * .4 + .12
    # sujeira / desgaste em manchas grandes
    dirt = fbm(gshape, (60 * SS, 60 * SS), 41, 3)[np.clip(V.astype(int), 0, gshape[0] - 1), np.clip((U - U.min()).astype(int), 0, gshape[1] - 1)]
    col *= (0.82 + 0.3 * dirt[..., None])
    return np.clip(col, 0, 1)

# ---------------- sprites ----------------
crate = Image.open(f'{PIPE}/renders/caixote.png').convert('RGBA'); crate = crate.crop(crate.split()[3].getbbox())
barrels = Image.open(f'{PIPE}/renders/barris.png').convert('RGBA')
barrel = barrels.crop((110, 60, 225, 175)); barrel = barrel.crop(barrel.split()[3].getbbox())
candle = Image.open(f'{PIPE}/renders/candelabro.png').convert('RGBA'); candle = candle.crop(candle.split()[3].getbbox())

def wool(size, color, seed, stripes=False, gold=False):
    """cobertor de lã com dobras, vista de cima. size=(w,h) px SS"""
    w_, h_ = size
    n = fbm((h_, w_), (2, 2), seed, 2)
    folds = fbm((h_, w_), (h_ // 3 + 1, w_ // 5 + 1), seed + 9, 3)
    c = np.array(color, np.float32)[None, None] / 255
    img = c * (0.8 + 0.35 * folds[..., None]) * (0.9 + 0.18 * n[..., None])
    yy_, xx_ = np.mgrid[0:h_, 0:w_]
    if stripes:
        band = (np.abs(yy_ - h_ * .78) < h_ * .045)
        img[band] = img[band] * .5 + np.array([.82, .78, .7]) * .45
    if gold:
        for yc in (h_ * .72, h_ * .84):
            b = np.abs(yy_ - yc) < max(2, h_ * .012)
            img[b] = np.array(GOLD) / 255 * (0.85 + 0.25 * folds[b][..., None])
    # bordas laterais caindo (mais escuras)
    edge = np.clip(np.minimum(xx_, w_ - 1 - xx_) / (w_ * .12), 0, 1)[..., None]
    img *= 0.6 + 0.4 * edge
    a = np.full((h_, w_), 255, np.uint8)
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA'); im.putalpha(Image.fromarray(a))
    m = Image.new('L', size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w_ - 1, h_ - 1], radius=6 * SS, fill=255)
    im.putalpha(m); return im

def wood_tex(size, seed, base=(.36, .24, .15)):
    w_, h_ = size
    g = fbm((h_, w_), (40 * SS, 2), seed, 3)
    col = np.array(base)[None, None] * (0.7 + 0.55 * g[..., None])
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).convert('RGBA')

def make_bed(seed, level, blanket):
    """cama de soldado; cabeceira em cima (y=0). 48x96 px finais"""
    bw, bl = 50 * SS, 96 * SS
    bed = Image.new('RGBA', (bw, bl), (0, 0, 0, 0))
    frame = wood_tex((bw, bl), seed, (.30, .19, .11))
    m = Image.new('L', (bw, bl), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, bw - 1, bl - 1], radius=3 * SS, fill=255)
    bed.paste(frame, (0, 0), m)
    d = ImageDraw.Draw(bed)
    d.rounded_rectangle([0, 0, bw - 1, bl - 1], radius=3 * SS, outline=(28, 18, 10, 255), width=SS)
    post = 6 * SS
    for x0, y0 in ((0, 0), (bw - post, 0), (0, bl - post), (bw - post, bl - post)):
        d.rectangle([x0, y0, x0 + post - 1, y0 + post - 1], fill=(46, 30, 18, 255), outline=(20, 12, 6, 255))
        if level >= 3: d.ellipse([x0 + 1.5 * SS, y0 + 1.5 * SS, x0 + post - 1.5 * SS, y0 + post - 1.5 * SS], fill=GOLD + (255,))
    # colchão / lençol
    ins = 4 * SS
    lin = np.asarray(Image.new('RGB', (bw - 2 * ins, bl - 2 * ins), (214, 204, 184)), np.float32) / 255
    lin = lin * (0.88 + 0.16 * fbm(lin.shape[:2], (6 * SS, 6 * SS), seed + 3, 3)[..., None])
    li = Image.fromarray((lin * 255).astype(np.uint8)).convert('RGBA')
    bed.alpha_composite(li, (ins, ins))
    # travesseiro
    pw_, ph_ = bw - 2 * ins - 6 * SS, 20 * SS
    pil = Image.new('RGBA', (pw_, ph_), (0, 0, 0, 0)); pd = ImageDraw.Draw(pil)
    pd.rounded_rectangle([0, 0, pw_ - 1, ph_ - 1], radius=8 * SS, fill=(232, 226, 212, 255), outline=(170, 160, 140, 255), width=SS)
    pn = np.asarray(pil, np.float32)
    yy_, xx_ = np.mgrid[0:ph_, 0:pw_]
    puff = 1 - 0.22 * (((xx_ - pw_ / 2) / (pw_ / 2)) ** 2 + ((yy_ - ph_ / 2) / (ph_ / 2)) ** 2)
    crease = 1 - 0.18 * np.exp(-((xx_ - pw_ * (0.5 + 0.08 * math.sin(seed))) / (2.2 * SS)) ** 2)
    pn[..., :3] *= (puff * crease)[..., None]
    bed.alpha_composite(Image.fromarray(np.clip(pn, 0, 255).astype(np.uint8)), (ins + 3 * SS, ins + 3 * SS))
    # cobertor (um pouco mais largo que o colchão) + dobra do lençol
    by = 30 * SS
    bl_ = wool((bw - 2 * SS, bl - by - 3 * SS), blanket, seed + 20, stripes=(level == 2), gold=(level >= 3))
    sh = Image.new('RGBA', bed.size, (0, 0, 0, 0)); sh.paste((0, 0, 0, 110), (SS, by - 2 * SS), bl_.split()[3])
    bed.alpha_composite(sh.filter(ImageFilter.GaussianBlur(2 * SS)))
    bed.alpha_composite(bl_, (SS, by))
    d = ImageDraw.Draw(bed)
    d.rounded_rectangle([2 * SS, by - 1 * SS, bw - 3 * SS, by + 7 * SS], radius=2 * SS, fill=(226, 218, 200, 255))
    d.line([(3 * SS, by + 7 * SS), (bw - 4 * SS, by + 7 * SS)], fill=(150, 140, 120, 255), width=SS)
    # luz vinda do canto superior esquerdo
    g = np.asarray(bed, np.float32)
    yy_, xx_ = np.mgrid[0:bl, 0:bw]
    lit = 1.08 - 0.16 * (xx_ / bw) - 0.08 * (yy_ / bl)
    g[..., :3] *= lit[..., None]
    return Image.fromarray(np.clip(g, 0, 255).astype(np.uint8))

def make_locker(level, seed):
    lk = crate.resize((40 * SS, 24 * SS), Image.LANCZOS)
    lk = ImageEnhance.Brightness(lk).enhance(0.72)
    d = ImageDraw.Draw(lk)
    band = (34, 30, 28, 255) if level < 3 else GOLD_D + (255,)
    for x in (7 * SS, 31 * SS): d.rectangle([x, 0, x + 2 * SS, 24 * SS], fill=band)
    d.rectangle([0, 0, 40 * SS - 1, 24 * SS - 1], outline=(25, 18, 12, 255), width=SS)
    if level >= 3: d.rectangle([18 * SS, 19 * SS, 22 * SS, 23 * SS], fill=GOLD + (255,))
    return lk

def make_fireplace(level):
    fw, fh = 104 * SS, 46 * SS
    fp = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    st = Image.fromarray((pt[:fh, :fw] * 255 * .8).astype(np.uint8)).convert('RGBA')
    fp.paste(st, (0, 0))
    d = ImageDraw.Draw(fp)
    d.rectangle([0, 0, fw - 1, fh - 1], outline=GOLD_D + (255,), width=2 * SS)
    # boca da lareira
    bx0, by0, bx1, by1 = 22 * SS, 4 * SS, fw - 22 * SS, fh - 12 * SS
    d.rectangle([bx0, by0, bx1, by1], fill=(22, 14, 10, 255))
    rr = np.random.default_rng(4)
    hot = level >= 2
    for _ in range(80):
        x = rr.uniform(bx0 + 4 * SS, bx1 - 4 * SS); y = rr.uniform(by0 + 4 * SS, by1 - 3 * SS); r = rr.uniform(1.5, 4) * SS
        c = [(255, 140, 40), (255, 90, 20), (255, 200, 90), (60, 30, 20), (40, 24, 16)][rr.integers(0, 5 if hot else 5)]
        if not hot and rr.random() < .6: c = (70, 40, 26)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,))
    # toras
    for i, (x, y) in enumerate(((fw * .42, fh * .45), (fw * .58, fh * .5))):
        d.rounded_rectangle([x - 14 * SS, y - 3 * SS, x + 14 * SS, y + 3 * SS], radius=3 * SS, fill=(58, 36, 22, 255), outline=(20, 12, 8, 255))
    gl = Image.new('RGBA', fp.size, (0, 0, 0, 0))
    ImageDraw.Draw(gl).ellipse([bx0 + 4 * SS, by0, bx1 - 4 * SS, by1], fill=(255, 130, 40, 170 if hot else 70))
    fp.alpha_composite(gl.filter(ImageFilter.GaussianBlur(6 * SS)))
    # soleira de pedra na frente
    d = ImageDraw.Draw(fp)
    d.line([(bx0 - 4 * SS, by1 + 3 * SS), (bx1 + 4 * SS, by1 + 3 * SS)], fill=GOLD + (255,), width=SS)
    return fp

def make_shield(seed, rim=GOLD_D):
    s = 36 * SS; sh = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    wt = wood_tex((s, s), seed, (.40, .27, .16))
    m = Image.new('L', (s, s), 0); ImageDraw.Draw(m).ellipse([0, 0, s - 1, s - 1], fill=255)
    sh.paste(wt, (0, 0), m); d = ImageDraw.Draw(sh)
    for k in range(-2, 3): d.line([(s / 2 + k * 7 * SS, 2 * SS), (s / 2 + k * 7 * SS, s - 2 * SS)], fill=(30, 20, 12, 120), width=1)
    sh.putalpha(m)
    d = ImageDraw.Draw(sh)
    d.ellipse([0, 0, s - 1, s - 1], outline=(60, 62, 68, 255), width=3 * SS)
    d.ellipse([s / 2 - 6 * SS, s / 2 - 6 * SS, s / 2 + 6 * SS, s / 2 + 6 * SS], fill=rim + (255,), outline=(30, 24, 14, 255))
    d.ellipse([s / 2 - 3 * SS, s / 2 - 4 * SS, s / 2 + 1 * SS, s / 2 - 1 * SS], fill=(255, 235, 170, 200))
    return sh

def make_rack(level, seed):
    """suporte de lanças + escudos, vista de cima. comprido na horizontal"""
    rw, rh = 120 * SS, 40 * SS
    rk = Image.new('RGBA', (rw, rh), (0, 0, 0, 0)); d = ImageDraw.Draw(rk)
    bar = wood_tex((rw, 8 * SS), seed, (.33, .21, .12))
    rk.alpha_composite(bar, (0, 6 * SS))
    d.rectangle([0, 6 * SS, rw - 1, 14 * SS - 1], outline=(24, 14, 8, 255), width=SS)
    for i in range(6):           # lanças apoiadas (hastes + ponta de ferro)
        x = 10 * SS + i * 13 * SS
        d.line([(x, 2 * SS), (x + 3 * SS, 36 * SS)], fill=(96, 66, 40, 255), width=2 * SS)
        d.polygon([(x - 2 * SS, 2 * SS), (x + 2 * SS, 2 * SS), (x, -0 * SS + 0)], fill=(170, 174, 182, 255))
        d.ellipse([x - 2.5 * SS, 0, x + 2.5 * SS, 5 * SS], fill=(180, 184, 192, 255), outline=(60, 60, 66, 255))
    sh = make_shield(seed + 1, GOLD if level >= 3 else GOLD_D)
    rk.alpha_composite(sh, (rw - 38 * SS, 2 * SS))
    return rk

def make_dummy(seed):
    s = 44 * SS; dm = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(dm)
    d.rounded_rectangle([2 * SS, s / 2 - 3 * SS, s - 2 * SS, s / 2 + 3 * SS], radius=2 * SS, fill=(88, 60, 36, 255), outline=(30, 18, 10, 255))  # braço
    straw = np.asarray(Image.new('RGB', (26 * SS, 26 * SS), (190, 160, 90)), np.float32) / 255
    straw *= 0.7 + 0.5 * fbm((26 * SS, 26 * SS), (2, 2), seed, 2)[..., None]
    st = Image.fromarray((straw * 255).astype(np.uint8)).convert('RGBA')
    m = Image.new('L', st.size, 0); ImageDraw.Draw(m).ellipse([0, 0, 26 * SS - 1, 26 * SS - 1], fill=255)
    dm.paste(st, (int(s / 2 - 13 * SS), int(s / 2 - 13 * SS)), m)
    d.ellipse([s / 2 - 13 * SS, s / 2 - 13 * SS, s / 2 + 13 * SS, s / 2 + 13 * SS], outline=(110, 84, 40, 255), width=SS)
    d.line([(s / 2 - 12 * SS, s / 2), (s / 2 + 12 * SS, s / 2)], fill=(120, 30, 26, 255), width=2 * SS)  # corda
    d.ellipse([s / 2 - 5 * SS, s / 2 - 5 * SS, s / 2 + 5 * SS, s / 2 + 5 * SS], fill=(150, 30, 26, 255))  # alvo
    return dm

def make_brazier(seed, gold=False):
    bz = 40 * SS; b = Image.new('RGBA', (bz, bz), (0, 0, 0, 0)); d = ImageDraw.Draw(b)
    d.ellipse([0, 0, bz - 1, bz - 1], fill=(GOLD_D if gold else (52, 50, 54)) + (255,), outline=(24, 20, 16, 255), width=SS)
    d.ellipse([5 * SS, 5 * SS, bz - 6 * SS, bz - 6 * SS], fill=(28, 18, 14, 255))
    rr = np.random.default_rng(seed)
    for _ in range(26):
        x, y = rr.uniform(8 * SS, bz - 8 * SS, 2); r = rr.uniform(1.5, 3.5) * SS
        if math.hypot(x - bz / 2, y - bz / 2) < bz / 2 - 8 * SS:
            c = [(255, 140, 40), (255, 90, 20), (255, 210, 100)][rr.integers(0, 3)]
            d.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,))
    gl = Image.new('RGBA', b.size, (0, 0, 0, 0)); ImageDraw.Draw(gl).ellipse([8 * SS, 8 * SS, bz - 8 * SS, bz - 8 * SS], fill=(255, 140, 40, 150))
    b.alpha_composite(gl.filter(ImageFilter.GaussianBlur(4 * SS)))
    if gold: ImageDraw.Draw(b).ellipse([0, 0, bz - 1, bz - 1], outline=GOLD + (255,), width=SS)
    return b

def make_armor_stand(seed):
    s = 44 * SS; a_ = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(a_)
    d.ellipse([3 * SS, 3 * SS, s - 3 * SS, s - 3 * SS], fill=(60, 44, 30, 255), outline=(26, 18, 10, 255))   # base de madeira
    d.rounded_rectangle([5 * SS, s / 2 - 8 * SS, s - 5 * SS, s / 2 + 8 * SS], radius=7 * SS, fill=(120, 124, 132, 255), outline=(40, 40, 46, 255), width=SS)  # ombreiras
    d.ellipse([s / 2 - 9 * SS, s / 2 - 9 * SS, s / 2 + 9 * SS, s / 2 + 9 * SS], fill=(150, 154, 162, 255), outline=(40, 40, 46, 255), width=SS)  # elmo
    d.line([(s / 2, s / 2 - 9 * SS), (s / 2, s / 2 + 9 * SS)], fill=GOLD + (255,), width=2 * SS)  # crista dourada
    d.ellipse([s / 2 - 6 * SS, s / 2 - 7 * SS, s / 2 - 1 * SS, s / 2 - 3 * SS], fill=(230, 232, 240, 200))
    return a_

# ---------------- composição ----------------
def compose(level):
    img = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
    # faixas radiais
    r_yard_out = 0.3735                       # pátio: ri .. r_yard_out
    r_wall_in = r_yard_out; wt = 0.0032       # espessura da parede
    r_back = ro - 0.0005
    a_side = half - 0.55                      # paredes laterais
    a_side_in = a_side - math.degrees(wt / 0.405)
    door_half = px2deg(30, r_wall_in)

    # pátio de pedra
    yard = (R >= ri) & (R <= ro) & (np.abs(A) <= half)
    st0 = stone_at(U, V, 1.0); st1 = stone_at(U + 173 * SS, V + 61 * SS, 1.0)
    mix = np.clip((fbm((H, W), (40 * SS, 40 * SS), 99, 3) - .5) * 4 + .5, 0, 1)[..., None]
    st = st0 * mix + st1 * (1 - mix)
    img[yard] = st[yard] * .92; alpha[yard] = 1
    # piso de madeira interno
    inner = (R > r_wall_in + wt) & (R < r_back - wt) & (np.abs(A) < a_side_in)
    wf = wood_floor()
    if level >= 3: wf = wf * 1.06
    img[inner] = wf[inner]
    # paredes de pedra (mais escuras e frias, como cantaria)
    walls = (R >= r_wall_in) & (R <= r_back) & (np.abs(A) <= a_side) & ~inner
    door = (R < r_wall_in + wt + .0003) & (np.abs(A) < door_half)
    walls &= ~door
    img[door & (R >= r_wall_in)] = wf[door & (R >= r_wall_in)] * .9          # soleira de madeira
    sw = stone_at(U * 1.6, V * 1.6, 1.0)
    swg = sw.mean(-1, keepdims=True)
    img[walls] = (swg * np.array([.78, .76, .74]) * 1.05 + sw * .1)[walls]
    # sombra das paredes sobre o piso (luz de cima/esquerda -> sombra para baixo/direita)
    wm = Image.fromarray((walls * 255).astype(np.uint8))
    shm = Image.new('L', wm.size, 0); shm.paste(wm, (6 * SS, 7 * SS)); shm = shm.filter(ImageFilter.GaussianBlur(5 * SS))
    shv = np.asarray(shm, np.float32) / 255 * 0.55
    img *= (1 - shv * (~walls))[..., None]
    # oclusão suave nos cantos internos
    ao = Image.fromarray((walls * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10 * SS))
    img *= (1 - 0.25 * np.asarray(ao, np.float32) / 255 * (~walls))[..., None]

    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
    d = ImageDraw.Draw(out, 'RGBA')

    def arcline(r, a1, a2, col, wd, n=120):
        d.line([P(r, a1 + (a2 - a1) * i / n) for i in range(n + 1)], fill=col, width=wd, joint='curve')
    # tapete (nível 3) no corredor central
    if level >= 3:
        rug_in, rug_out = 0.3985, 0.4115; ra = a_side_in - 2.1
        rug = (R > rug_in) & (R < rug_out) & (np.abs(A) < ra)
        rn = fbm((H, W), (3, 3), 77, 2)
        rc = np.array([.42, .07, .08])[None, None] * (0.8 + 0.35 * rn[..., None])
        # losangos sutis
        pat = (np.abs(((U / (26 * SS)) % 1) - .5) + np.abs(((R - rug_in) / (rug_out - rug_in)) - .5)) < .28
        rc[pat] *= 1.25
        arr = np.asarray(out, np.float32) / 255
        arr[..., :3][rug] = rc[rug]
        out = Image.fromarray((arr * 255).astype(np.uint8)); d = ImageDraw.Draw(out, 'RGBA')
        for rr_, wd in ((rug_in + .0009, 2), (rug_out - .0009, 2)):
            arcline(rr_, -ra + .25, ra - .25, GOLD + (255,), wd * SS)
        arcline(rug_in + .0024, -ra + .5, ra - .5, GOLD_D + (230,), SS)
        arcline(rug_out - .0024, -ra + .5, ra - .5, GOLD_D + (230,), SS)
        for s_ in (-1, 1):
            d.line([P(rug_in + .0009, s_ * (ra - .25)), P(rug_out - .0009, s_ * (ra - .25))], fill=GOLD + (255,), width=2 * SS)
        # franjas
        for s_ in (-1, 1):
            for k in range(14):
                r_ = rug_in + (rug_out - rug_in) * (k + .5) / 14
                d.line([P(r_, s_ * (ra - .25)), P(r_, s_ * (ra + .2))], fill=(210, 196, 160, 255), width=SS)

    # contornos dourados: topo das paredes (linha externa) e borda do pátio
    gw = 3 * SS
    arcline(r_back - .0005, -a_side, a_side, GOLD + (255,), gw)
    arcline(r_wall_in + .0003, -a_side, -door_half, GOLD + (255,), gw)
    arcline(r_wall_in + .0003, door_half, a_side, GOLD + (255,), gw)
    for s_ in (-1, 1):
        d.line([P(r_wall_in, s_ * (a_side - .05)), P(r_back, s_ * (a_side - .05))], fill=GOLD + (255,), width=gw)
        d.line([P(r_wall_in + wt, s_ * door_half), P(r_wall_in, s_ * door_half)], fill=GOLD + (255,), width=gw)
    arcline(ri + .0015, -half + .35, half - .35, GOLD + (150,), 2 * SS)

    # janelas: vidro azulado nas paredes (frente e laterais)
    def window(r, a, length_px, radial=False):
        if not radial:
            da = px2deg(length_px / 2, r)
            arcline(r, a - da, a + da, (120, 160, 190, 255), int(wt * sc * .45))
            arcline(r, a - da, a + da, (200, 225, 240, 160), SS)
        else:
            d.line([P(r - length_px * SS / 2 / sc, a), P(r + length_px * SS / 2 / sc, a)], fill=(120, 160, 190, 255), width=int(wt * sc * .45))
    wr = r_wall_in + wt / 2
    for a in (-3.9, 3.9, -6.6, 6.6): window(wr, a, 24)
    for s_ in (-1, 1): window(.404, s_ * (a_side - math.degrees(wt / 2 / .404)), 30, radial=True)

    def paste(im, r, a, size_px, rot_extra=0, shadow=True, sh_alpha=.6):
        nonlocal out
        im = im.copy(); s = size_px * SS / max(im.size)
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
        im = im.rotate(-a + rot_extra, expand=True, resample=Image.BICUBIC)
        x, y = P(r, a)
        if shadow:
            s2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); s2.putalpha(im.split()[3].point(lambda v: int(v * sh_alpha)))
            s2 = s2.filter(ImageFilter.GaussianBlur(4 * SS)); out.alpha_composite(s2, (int(x - im.width / 2 + 5 * SS), int(y - im.height / 2 + 6 * SS)))
        out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))

    def glow(r, a, rad_px, col, alpha_):
        nonlocal out
        g = Image.new('RGBA', out.size, (0, 0, 0, 0)); x, y = P(r, a)
        ImageDraw.Draw(g).ellipse([x - rad_px * SS, y - rad_px * SS, x + rad_px * SS, y + rad_px * SS], fill=col + (alpha_,))
        out.alpha_composite(g.filter(ImageFilter.GaussianBlur(rad_px * SS * .45)))

    # folhas da porta, abertas para dentro
    for s_ in (-1, 1):
        lf = wood_tex((30 * SS, 6 * SS), 60 + s_, (.34, .22, .13))
        ImageDraw.Draw(lf).rectangle([0, 0, 30 * SS - 1, 6 * SS - 1], outline=(22, 14, 8, 255), width=SS)
        ImageDraw.Draw(lf).rectangle([2 * SS, 1 * SS, 5 * SS, 5 * SS], fill=GOLD_D + (255,))
        x0, y0 = P(r_wall_in + wt, s_ * door_half)
        lf = lf.rotate(s_ * 72 + 0, expand=True, resample=Image.BICUBIC)
        ang = math.radians(-s_ * 72)
        cx_, cy_ = x0 - s_ * 15 * SS * math.cos(math.radians(72)), y0 - 15 * SS * math.sin(math.radians(72))
        sh2 = Image.new('RGBA', lf.size, (0, 0, 0, 0)); sh2.putalpha(lf.split()[3].point(lambda v: int(v * .5)))
        out.alpha_composite(sh2.filter(ImageFilter.GaussianBlur(3 * SS)), (int(cx_ - lf.width / 2 + 4 * SS), int(cy_ - lf.height / 2 + 5 * SS)))
        out.alpha_composite(lf, (int(cx_ - lf.width / 2), int(cy_ - lf.height / 2)))

    # lareira no centro da parede do fundo
    r_fp = r_back - wt - 23 * SS / sc + .0009
    glow(r_fp - .006, 0, 90, (255, 130, 40), 60 if level >= 2 else 25)
    paste(make_fireplace(level), r_fp, 0, 104, shadow=True, sh_alpha=.45)

    # camas
    blanket = {1: (92, 90, 84), 2: (58, 70, 92), 3: (122, 26, 30)}[level]
    pitch = 68
    back_px = [88, 156, 224, 292]
    front_px = [96, 164, 232]
    r_bh = r_back - wt - .0006            # cabeceira fileira de trás
    r_fh = r_wall_in + wt + .0006         # cabeceira fileira da frente
    bedlen = 96 * SS / sc
    lockd = 24 * SS / sc
    use_back = back_px if level >= 2 else back_px[:2]
    use_front = front_px if level >= 2 else front_px[:1]
    k = 0
    rr = np.random.default_rng(level * 13)
    for s_ in (-1, 1):
        for p in back_px:
            a = s_ * px2deg(p, r_bh - bedlen / 2)
            if p in use_back:
                paste(make_bed(k, level, blanket), r_bh - bedlen / 2, a, 96, rot_extra=rr.uniform(-1.5, 1.5)); k += 1
                if level >= 2 or p == back_px[0]:
                    paste(make_locker(level, k), r_bh - bedlen - lockd / 2 - .0006, a, 40, rot_extra=rr.uniform(-3, 3))
            else:   # nível 1: sacos de palha / colchonete enrolado no lugar da cama
                bed_roll = Image.new('RGBA', (40 * SS, 16 * SS), (0, 0, 0, 0))
                ImageDraw.Draw(bed_roll).rounded_rectangle([0, 0, 40 * SS - 1, 16 * SS - 1], radius=8 * SS, fill=(150, 128, 86, 255), outline=(80, 64, 40, 255), width=SS)
                for xk in (12, 28): ImageDraw.Draw(bed_roll).line([(xk * SS, 0), (xk * SS, 16 * SS)], fill=(90, 60, 34, 255), width=2 * SS)
                paste(bed_roll, r_bh - .006, a, 40, rot_extra=rr.uniform(-12, 12))
        for p in front_px:
            a = s_ * px2deg(p, r_fh + bedlen / 2)
            if p in use_front:
                paste(make_bed(k + 50, level, blanket), r_fh + bedlen / 2, a, 96, rot_extra=180 + rr.uniform(-1.5, 1.5)); k += 1
                if level >= 2:
                    paste(make_locker(level, k), r_fh + bedlen + lockd / 2 + .0006, a, 40, rot_extra=180 + rr.uniform(-3, 3))
        # canto da frente, junto à parede lateral: suporte de armas (lv2) / armadura (lv3) / barril (lv1)
        a_corner = s_ * px2deg(288, r_fh + .007)
        if level == 1:
            paste(barrel, r_fh + .006, a_corner, 40)
        elif level == 2:
            paste(make_rack(level, 90 + s_), r_fh + .0105, s_ * (a_side_in - px2deg(16, r_fh + .01)), 86, rot_extra=90 * s_)
        else:
            paste(make_armor_stand(5 + s_), r_fh + .0065, a_corner, 46)

    # candelabros no corredor (nível 2 em diante; nível 1 = vela simples)
    r_aisle = (r_bh - bedlen - lockd + r_fh + bedlen + lockd) / 2
    for s_ in (-1, 1):
        a = s_ * (a_side_in - px2deg(30, r_aisle))
        if level >= 2:
            glow(r_aisle, a, 40, (255, 190, 90), 70)
            paste(candle, r_aisle, a, 44 if level >= 3 else 36, sh_alpha=.4)

    # pátio (frente): braseiros ladeando a porta + itens por nível
    r_y = (ri + r_wall_in) / 2
    for s_ in (-1, 1):
        a = s_ * px2deg(52, r_y)
        if level >= 2:
            glow(r_y, a, 46, (255, 120, 30), 70)
            paste(make_brazier(s_ + 3, gold=level >= 3), r_y, a, 40)
    if level == 1:
        glow(r_y, -px2deg(46, r_y), 24, (255, 170, 80), 70)
        lan = Image.new('RGBA', (16 * SS, 16 * SS), (0, 0, 0, 0)); ld = ImageDraw.Draw(lan)
        ld.rectangle([0, 0, 16 * SS - 1, 16 * SS - 1], fill=(40, 34, 30, 255), outline=(20, 16, 12, 255)); ld.ellipse([4 * SS, 4 * SS, 12 * SS, 12 * SS], fill=(255, 200, 110, 255))
        paste(lan, r_y, -px2deg(46, r_y), 16)
    # lado esquerdo do pátio: barris e caixote; direito: suporte de armas / bonecos de treino
    paste(barrel, r_y + .0025, -px2deg(250, r_y), 40)
    paste(barrel, r_y - .0035, -px2deg(212, r_y), 36)
    if level >= 2: paste(crate, r_y, -px2deg(150, r_y), 62, rot_extra=5)
    if level >= 2: paste(make_rack(level, 7), r_y + .001, px2deg(165, r_y), 116)
    if level >= 3:
        paste(make_dummy(3), r_y, px2deg(250, r_y), 44)
    elif level == 1:
        paste(make_dummy(3), r_y, px2deg(220, r_y), 42)

    # recorte final pela máscara + redução
    clamp = ((R >= ri) & (R <= ro) & (np.abs(A) <= half)).astype(np.float32)
    out.putalpha(Image.fromarray((np.asarray(out.split()[3], np.float32) * clamp).astype(np.uint8)))
    out = out.resize((W0, H0), Image.LANCZOS)
    m = Image.open(f'{PIPE}/templates/outer_arc_mask.png').convert('L')
    out.putalpha(Image.fromarray(np.minimum(np.asarray(out.split()[3]), np.asarray(m))))
    return out

names = {1: 'barracks.outer.png', 2: 'barracks.outer.lv2.png', 3: 'barracks.outer.lv3.png'}
for lv in (1, 2, 3):
    compose(lv).save(f'{OUT}/{names[lv]}')
    print('ok', lv)

# coordenadas úteis para o fx (na arte final, 0-1)
def norm(r, a):
    x, y = P(r, a); return round(x / W, 3), round(y / H, 3)
r_back = ro - 0.0005; wt = 0.0032; r_fp = r_back - wt - 23 * SS / sc + .0009
r_y = (ri + 0.3735) / 2
print('lareira', norm(r_fp, 0), 'braseiros', norm(r_y, -px2deg(52, r_y)), norm(r_y, px2deg(52, r_y)), 'lanterna', norm(r_y, -px2deg(46, r_y)))
r_bh = r_back - wt - .0006; r_fh = 0.3735 + wt + .0006; bedlen = 96 * SS / sc; lockd = 24 * SS / sc
r_aisle = (r_bh - bedlen - lockd + r_fh + bedlen + lockd) / 2
a_side_in = half - 0.55 - math.degrees(wt / 0.405)
print('candelabros', norm(r_aisle, -(a_side_in - px2deg(30, r_aisle))), norm(r_aisle, a_side_in - px2deg(30, r_aisle)))
