"""Sala de Reuniões (meeting_hall) – slot middle (layout v4), 3 níveis.
Uso: python3 -I compose_meeting.py <pasta_scratch> <pasta_saida>
Trabalha em 2x (1536x622) e reduz para 768x311 no final."""
import sys, os, math, json, random
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageChops, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True

S, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
PKG = f'{S}/pkg/axis-art-pipeline-v2'
REN = f'{S}/renders'
DL = f'{S}/dl'

SS = 2
W, H = 768 * SS, 311 * SS
RO, RI, HALF = 0.274, 0.220, math.radians(16.5)
SC = 768 / (2 * RO * math.sin(HALF)) * SS        # px (2x) por unidade
CX, CY = W / 2, RO * SC
PPM = 62 * SS                                    # px por metro
T = 14 * SS / SC                                 # espessura da parede (normalizado)
GOLD = np.array([226, 184, 74]); GOLD_D = np.array([150, 111, 40])

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / SC
A = np.arctan2(xx - CX, CY - yy)

def rp(r, a_deg):
    a = math.radians(a_deg); return CX + r * SC * math.sin(a), CY - r * SC * math.cos(a)

def d2r(d1x):            # profundidade (px 1x a partir da borda externa) -> raio
    return RO - d1x * SS / SC

def noise(shape, blur, seed):
    rng = np.random.default_rng(seed)
    n = Image.fromarray((rng.random(shape) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(n, np.float32) / 255.0
    return (a - a.mean()) / (a.std() + 1e-6)

def sample(tex, u, v):
    """bilinear com repetição; tex float HxWx3"""
    h, w = tex.shape[:2]
    u = np.mod(u, w); v = np.mod(v, h)
    x0 = np.floor(u).astype(int); y0 = np.floor(v).astype(int)
    fx = (u - x0)[..., None]; fy = (v - y0)[..., None]
    x1 = (x0 + 1) % w; y1 = (y0 + 1) % h
    return (tex[y0, x0] * (1 - fx) * (1 - fy) + tex[y0, x1] * fx * (1 - fy) +
            tex[y1, x0] * (1 - fx) * fy + tex[y1, x1] * fx * fy)

def crop_alpha(im):
    return im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())

def load(name):
    return crop_alpha(Image.open(name).convert('RGBA'))

def to_img(arr, alpha=None):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    if alpha is None: alpha = np.full(arr.shape[:2], 255, np.uint8)
    return Image.fromarray(np.dstack([arr, np.clip(alpha, 0, 255).astype(np.uint8)]), 'RGBA')

def put(layer, img, x, y, width_m=None, width_px=None, rot=0.0):
    wpx = width_px if width_px else width_m * PPM
    k = wpx / img.width
    im = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    if rot: im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    layer.alpha_composite(im, (round(x - im.width / 2), round(y - im.height / 2)))

def facing(px, py, tx, ty):   # rotação para a frente (baixo da imagem) apontar para (tx,ty)
    return math.degrees(math.atan2(tx - px, ty - py))

def with_shadow(canvas, layer, off=13, blur=10, strength=0.55):
    a = layer.getchannel('A')
    sh = Image.new('L', canvas.size, 0); sh.paste(a, (off, off))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    s = np.asarray(sh, np.float32)[..., None] / 255.0 * strength
    c = np.asarray(canvas, np.float32)
    c[..., :3] *= (1 - s)
    canvas = Image.fromarray(c.astype(np.uint8), 'RGBA')
    canvas.alpha_composite(layer)
    return canvas

def new_layer(): return Image.new('RGBA', (W, H), (0, 0, 0, 0))

# ------------------------------------------------------------------ texturas
floor_src = np.asarray(Image.open(f'{S}/partial_wood_floor_worn_diff_2k.jpg').convert('RGB'), np.float32)[69:675]  # 4 tábuas inteiras
carpet = np.asarray(Image.open(f'{DL}/Carpet015_2K-JPG/Carpet015_2K-JPG_Color.jpg').convert('L'), np.float32) / 255.0
wood_dark = np.asarray(load(f'{REN}/GothicCommode_01_2k.png').convert('RGB'), np.float32)
wood_dark = wood_dark[int(wood_dark.shape[0] * .25):int(wood_dark.shape[0] * .75), int(wood_dark.shape[1] * .1):int(wood_dark.shape[1] * .9)]

def wood_patch(w, h, rot90=False, dark=1.0, seed=0):
    t = wood_dark
    if rot90: t = np.rot90(t)
    im = Image.fromarray(t.astype(np.uint8)).resize((w, h), Image.LANCZOS)
    a = np.asarray(im, np.float32) * dark
    return a

# ------------------------------------------------------------------ props
P = {}
P['round_table'] = load(f'{REN}/round_table.png')
ch = load(f'{REN}/painted_wooden_chair_01_2k.png'); a = np.asarray(ch, np.float32)
lum = a[..., :3].mean(-1, keepdims=True) / 255.0
a[..., :3] = lum ** 1.3 * np.array([150, 98, 58]) * 1.05
P['chair_simple'] = Image.fromarray(a.astype(np.uint8), 'RGBA')
P['chair_gothic'] = load(f'{REN}/WoodenChair_01_2k.png')

arm = np.asarray(load(f'{REN}/ArmChair_01_2k.png'), np.float32)
lum = arm[..., :3].mean(-1) / 255.0
sat = arm[..., :3].max(-1) - arm[..., :3].min(-1)
uph = (lum > 0.42) & (sat < 30)
uph_s = np.asarray(Image.fromarray((uph * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32)[..., None] / 255
red = (lum[..., None] ** 1.4) * np.array([200, 30, 38]) * 1.15
frame = (lum[..., None] ** 1.1) * np.array([120, 80, 50]) * 1.25
gold_frame = (lum[..., None] ** 0.9) * GOLD * 1.15
b = arm.copy(); b[..., :3] = red * uph_s + frame * (1 - uph_s)
P['chair_red'] = Image.fromarray(np.clip(b, 0, 255).astype(np.uint8), 'RGBA')
b = arm.copy(); b[..., :3] = red * 0.95 * uph_s + gold_frame * (1 - uph_s)
P['chair_throne'] = Image.fromarray(np.clip(b, 0, 255).astype(np.uint8), 'RGBA')

P['commode'] = load(f'{REN}/GothicCommode_01_2k.png')
P['plant'] = load(f'{REN}/potted_plant_04_2k.png')
gob = Image.open(f'{REN}/brass_goblets_2k.png').convert('RGBA')
P['goblet'] = crop_alpha(gob.crop((0, gob.height // 2 + 40, gob.width // 2, gob.height)))
cand = Image.open(f'{REN}/brass_candleholders_2k.png').convert('RGBA')
c = np.asarray(cand, np.float32)
mag = (c[..., 0] > 120) & (c[..., 2] > 120) & (c[..., 1] < c[..., 0] * 0.75) & (c[..., 3] > 0)
c[mag, :3] = [255, 214, 120]
cand = Image.fromarray(c.astype(np.uint8), 'RGBA')
cw = cand.width
P['cand1'] = crop_alpha(cand.crop((0, 0, int(cw * .40), cand.height)))
P['cand3'] = crop_alpha(cand.crop((int(cw * .40), 0, int(cw * .63), cand.height)))
P['cand6'] = crop_alpha(cand.crop((int(cw * .63), 0, cw, cand.height)))
P['candelabro'] = load(f'{PKG}/renders/candelabro.png')
P['books'] = load(f'{PKG}/renders/livros.png')
P['crate'] = load(f'{PKG}/renders/caixote.png')
bar = Image.open(f'{PKG}/renders/barris.png').convert('RGBA')
P['barrel'] = crop_alpha(bar.crop((110, 60, 225, 175)))
bk = np.asarray(P['books'], np.float32); bk[..., :3] *= 1.55
P['books'] = Image.fromarray(np.clip(bk, 0, 255).astype(np.uint8), 'RGBA')

# ---- props feitos por código
def parchment(w, h, seed, lines=True, map_=False):
    rng = np.random.default_rng(seed)
    base = np.array([226, 204, 160], np.float32)
    n = noise((h, w), 2, seed)[..., None]
    yy_, xx_ = np.mgrid[0:h, 0:w]
    edge = np.minimum(np.minimum(xx_, w - 1 - xx_), np.minimum(yy_, h - 1 - yy_)).astype(np.float32)
    burn = np.clip(1 - edge / (min(w, h) * 0.18), 0, 1)[..., None]
    a = base * (1 + n * 0.05) * (1 - burn * 0.35)
    im = to_img(a)
    d = ImageDraw.Draw(im)
    ink = (92, 58, 30, 255)
    if map_:
        for k in range(3):   # contornos de costa
            cx0, cy0 = rng.uniform(.25, .75) * w, rng.uniform(.3, .7) * h
            rad = rng.uniform(.12, .22) * min(w, h) * 2
            pts = [(cx0 + math.cos(t) * rad * (1 + .25 * math.sin(3 * t + k)) * (w / h if w > h else 1) * .5,
                    cy0 + math.sin(t) * rad * (1 + .2 * math.cos(5 * t + k)) * .5) for t in np.linspace(0, 2 * math.pi, 40)]
            d.line(pts, fill=ink, width=max(1, w // 90))
        for k in range(4):
            x0, y0 = rng.uniform(.2, .8) * w, rng.uniform(.2, .8) * h
            d.line([(x0 - 4, y0 - 4), (x0 + 4, y0 + 4)], fill=(150, 30, 30, 255), width=2)
            d.line([(x0 - 4, y0 + 4), (x0 + 4, y0 - 4)], fill=(150, 30, 30, 255), width=2)
        d.rectangle([2, 2, w - 3, h - 3], outline=(120, 80, 40, 255), width=1)
    elif lines:
        for y in range(int(h * .15), int(h * .88), max(3, h // 9)):
            x1 = w * rng.uniform(.6, .88)
            d.line([(w * .12, y), (x1, y)], fill=(120, 90, 60, 200), width=1)
    return im

def scroll(w, h, seed):
    im = parchment(w, h, seed)
    d = ImageDraw.Draw(im)
    rr = max(4, h // 6)
    for y0 in (0, h - rr):  # rolos nas pontas
        g = Image.new('RGBA', (w + 6, rr), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
        for i in range(rr):
            t = i / max(1, rr - 1); s = 0.65 + 0.45 * math.sin(math.pi * t)
            gd.line([(0, i), (w + 5, i)], fill=(int(212 * s), int(186 * s), int(140 * s), 255))
        big = Image.new('RGBA', (w + 6, h), (0, 0, 0, 0)); big.alpha_composite(im, (3, 0)); big.alpha_composite(g, (0, y0)); im = big
    return im

def chest(w, h, seed):
    a = wood_patch(w, h, dark=0.85, seed=seed)
    im = to_img(a)
    d = ImageDraw.Draw(im)
    for x in np.linspace(0, w, 5)[1:-1]:      # tábuas da tampa
        d.line([(x, 0), (x, h)], fill=(40, 22, 14, 255), width=1)
    g, gd_ = tuple(GOLD) + (255,), tuple(GOLD_D) + (255,)
    bw = max(3, w // 14)
    for x in (w * .22, w * .78):
        d.rectangle([x - bw / 2, 0, x + bw / 2, h - 1], fill=gd_)
        d.line([(x - bw / 2 + 1, 0), (x - bw / 2 + 1, h)], fill=g, width=1)
    cs = max(5, w // 9)
    for (x0, y0) in ((0, 0), (w - cs, 0), (0, h - cs), (w - cs, h - cs)):
        d.rectangle([x0, y0, x0 + cs - 1, y0 + cs - 1], fill=g, outline=gd_)
    d.rectangle([0, 0, w - 1, h - 1], outline=gd_, width=2)
    lw = max(6, w // 8)
    d.rectangle([w / 2 - lw / 2, h - lw * 0.9, w / 2 + lw / 2, h - 1], fill=g, outline=(90, 60, 20, 255))
    d.ellipse([w / 2 - 2, h - lw * .55, w / 2 + 2, h - lw * .55 + 4], fill=(30, 20, 10, 255))
    return im

def torch_iron(sz):
    im = Image.new('RGBA', (sz, sz), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rectangle([sz * .38, 0, sz * .62, sz * .45], fill=(48, 44, 42, 255))           # suporte saindo da parede
    d.ellipse([sz * .2, sz * .3, sz * .8, sz * .9], fill=(58, 50, 44, 255), outline=(30, 26, 24, 255), width=2)
    d.ellipse([sz * .3, sz * .4, sz * .7, sz * .8], fill=(255, 150, 40, 255))
    d.ellipse([sz * .4, sz * .5, sz * .6, sz * .7], fill=(255, 236, 170, 255))
    return im

def sconce_gold(sz):
    im = Image.new('RGBA', (sz, sz), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    g, gd_ = tuple(GOLD) + (255,), tuple(GOLD_D) + (255,)
    d.rectangle([sz * .2, 0, sz * .8, sz * .18], fill=gd_)                          # placa na parede
    d.line([(sz * .5, sz * .1), (sz * .5, sz * .45)], fill=g, width=max(2, sz // 10))
    for cx_ in (.25, .5, .75):
        x = sz * cx_; y = sz * (.62 if cx_ != .5 else .7)
        d.ellipse([x - sz * .15, y - sz * .15, x + sz * .15, y + sz * .15], fill=g, outline=gd_, width=1)
        d.ellipse([x - sz * .08, y - sz * .08, x + sz * .08, y + sz * .08], fill=(245, 236, 215, 255))
        d.ellipse([x - sz * .035, y - sz * .035, x + sz * .035, y + sz * .035], fill=(255, 190, 70, 255))
    d.line([(sz * .25, sz * .62), (sz * .75, sz * .62)], fill=g, width=max(1, sz // 16))
    return im

def stone_tex(h, w, seed, base=(132, 124, 112)):
    n = noise((h, w), 1.2, seed) * 0.06 + noise((h, w), 6, seed + 1) * 0.07
    return np.array(base, np.float32) * (1 + n[..., None])

def fireplace(w, h, seed):
    """lareira vista de cima: bloco de pedra com moldura dourada e o fogo visível"""
    a = stone_tex(h, w, seed, (110, 104, 96))
    im = to_img(a); d = ImageDraw.Draw(im)
    for x in np.arange(0, w, w / 6): d.line([(x, 0), (x, h * .22)], fill=(60, 56, 52, 255), width=1)
    d.line([(0, h * .22), (w, h * .22)], fill=(60, 56, 52, 255), width=1)
    ix0, iy0, ix1, iy1 = w * .14, h * .2, w * .86, h * .86
    # caixa de fogo
    fb = np.zeros((int(iy1 - iy0), int(ix1 - ix0), 3), np.float32)
    fh, fw = fb.shape[:2]
    gy, gx = np.mgrid[0:fh, 0:fw]
    dd = np.hypot((gx - fw / 2) / (fw / 2), (gy - fh * .55) / (fh / 2))
    fb[:] = np.array([18, 12, 10])
    rng = np.random.default_rng(seed)
    fire = np.clip(1.1 - dd, 0, 1)
    nn = noise((fh, fw), 1.5, seed + 3)
    heat = np.clip(fire * 1.2 + nn * 0.22 * fire, 0, 1)[..., None]
    col = np.where(heat > .55, np.array([255, 200, 90]) * 1.0, np.array([255, 110, 25]))
    fb = fb * (1 - heat) + col * heat * np.clip(heat * 1.6, 0, 1)
    fim = to_img(fb)
    fd = ImageDraw.Draw(fim)
    for k in range(4):                                       # lenha
        cxl = fw * (.25 + .17 * k) + rng.uniform(-3, 3); ang = rng.uniform(-35, 35)
        L, Wd = fw * .38, max(5, fh * .2)
        lg = Image.new('RGBA', (int(L), int(Wd)), (0, 0, 0, 0)); ld = ImageDraw.Draw(lg)
        ld.rounded_rectangle([0, 0, L - 1, Wd - 1], radius=Wd / 2, fill=(54, 32, 20, 235), outline=(28, 16, 10, 255))
        ld.line([(Wd * .4, Wd * .35), (L - Wd * .4, Wd * .35)], fill=(255, 120, 30, 200), width=1)
        lg = lg.rotate(ang, expand=True, resample=Image.BICUBIC)
        fim.alpha_composite(lg, (int(cxl - lg.width / 2), int(fh * .55 - lg.height / 2)))
    ember = (np.clip(nn, 1.3, 3) - 1.3) / 1.7 * fire
    e = np.asarray(fim, np.float32); e[..., :3] += ember[..., None] * np.array([255, 160, 60]) * 0.9
    fim = to_img(e[..., :3])
    im.paste(fim, (int(ix0), int(iy0)))
    g, gd_ = tuple(GOLD) + (255,), tuple(GOLD_D) + (255,)
    d = ImageDraw.Draw(im)
    d.rectangle([ix0 - 2, iy0 - 2, ix1 + 1, iy1 + 1], outline=g, width=2)
    d.rectangle([0, 0, w - 1, h - 1], outline=gd_, width=2)
    d.line([(0, h - 2), (w, h - 2)], fill=g, width=2)
    return im

def rug(w, h, seed):
    """tapete no estilo da referência: campo vermelho, bordas douradas, losangos, franjas"""
    fr = int(w * 0.025)                     # franja nas pontas
    ww = w - 2 * fr
    yy_, xx_ = np.mgrid[0:h, 0:ww].astype(np.float32)
    weave = sample(np.dstack([carpet] * 3) * 255, xx_ * 4.0, yy_ * 4.0)[..., 0] / 255.0
    weave = (weave - weave.mean()) / (weave.std() + 1e-6)
    field = np.array([150, 22, 30], np.float32)
    border = np.array([118, 14, 22], np.float32)
    img = np.zeros((h, ww, 3), np.float32) + field
    b1 = h * 0.13
    edge = np.minimum(np.minimum(xx_, ww - 1 - xx_), np.minimum(yy_, h - 1 - yy_))
    img[edge < b1] = border
    def ring(e0, e1, col):
        m = (edge >= e0) & (edge < e1); img[m] = col
    ring(0, SS * 1.5, GOLD * .8)
    ring(b1 - SS * 2.2, b1 - SS * 0.6, GOLD)
    ring(b1 * .45, b1 * .45 + SS, GOLD_D * 1.1)
    # losangos no campo central
    cyf = h / 2; inner_h = h - 2 * b1
    dh = inner_h * 0.36; dw = dh * 1.25
    n = int((ww - 2 * b1) // (dw * 2.1))
    xs = np.linspace(b1 + dw * 1.2, ww - b1 - dw * 1.2, n)
    for cx0 in xs:
        dist = np.abs(xx_ - cx0) / dw + np.abs(yy_ - cyf) / dh
        img[(dist < 1.0)] = GOLD_D * 1.15
        img[(dist < 0.86)] = np.array([196, 40, 44])
        img[(dist < 0.55)] = np.array([120, 16, 24])
        img[(dist < 0.30)] = GOLD
        img[(dist < 0.18)] = np.array([196, 40, 44])
    # losangos pequenos na borda
    for yc in (b1 * .45 / 2 + SS, h - b1 * .45 / 2 - SS):
        pass
    for yc in ((b1 * .45 + b1) / 2, h - (b1 * .45 + b1) / 2):
        sh_ = (b1 - b1 * .45) * .32
        for cx0 in np.arange(b1, ww - b1 + 1, sh_ * 3.2):
            dist = np.abs(xx_ - cx0) / sh_ + np.abs(yy_ - yc) / sh_
            img[dist < 1] = GOLD * .85
    for xc in ((b1 * .45 + b1) / 2, ww - (b1 * .45 + b1) / 2):
        sh_ = (b1 - b1 * .45) * .32
        for cy0 in np.arange(b1, h - b1 + 1, sh_ * 3.2):
            dist = np.abs(xx_ - xc) / sh_ + np.abs(yy_ - cy0) / sh_
            img[dist < 1] = GOLD * .85
    img *= (1 + weave[..., None] * 0.07 + noise((h, ww), 8, seed)[..., None] * 0.04)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    im.paste(to_img(img), (fr, 0))
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(seed)
    for y in np.arange(SS, h - SS, SS * 1.6):           # franjas
        for x0, x1 in ((fr, 0), (w - fr - 1, w - 1)):
            j = rng.uniform(-1, 1) * SS
            d.line([(x0, y), (x1 + (j if x1 else -j), y + rng.uniform(-.6, .6))], fill=(222, 196, 140, 255), width=1)
    return im

def round_rug(D, seed):
    yy_, xx_ = np.mgrid[0:D, 0:D].astype(np.float32)
    rr_ = np.hypot(xx_ - D / 2, yy_ - D / 2) / (D / 2)
    weave = sample(np.dstack([carpet] * 3) * 255, xx_ * 4.0, yy_ * 4.0)[..., 0] / 255.0
    weave = (weave - weave.mean()) / (weave.std() + 1e-6)
    img = np.zeros((D, D, 3), np.float32) + np.array([96, 70, 44])
    img[rr_ > 0.86] = [70, 48, 30]
    img[(rr_ > 0.80) & (rr_ < 0.83)] = GOLD_D
    img[(rr_ > 0.93) & (rr_ < 0.95)] = GOLD_D * 0.9
    img[(rr_ > 0.5) & (rr_ < 0.52)] = [70, 48, 30]
    img *= (1 + weave[..., None] * 0.09 + noise((D, D), 8, seed)[..., None] * 0.04)
    a = np.clip((1 - rr_) * D / 2, 0, 1) * 255
    return to_img(img, a)

# ------------------------------------------------------------------ sala base (piso + paredes)
def build_floor(warm=1.0, seed=7):
    u = A * R * SC; v = (RO - R) * SC
    k = 30 / 151.5
    su, sv = u / k, v / k
    plank = np.floor(sv / 151.5)
    rng = np.random.default_rng(seed)
    offs = rng.random(400) * 2048
    tone = 0.9 + rng.random(400) * 0.18
    pi_ = (plank.astype(int)) % 400
    col = sample(floor_src, su + offs[pi_], sv)
    col *= tone[pi_][..., None]
    lum = col.mean(-1, keepdims=True)
    col = col * 0.62 + lum * 0.38
    col *= np.array([0.84, 0.72, 0.62]) * warm
    # AO junto às paredes
    din = np.minimum.reduce([(R - (RI + T)) * SC, ((RO - T) - R) * SC, (HALF - T / np.maximum(R, 1e-3) - np.abs(A)) * R * SC])
    col *= (1 - 0.42 * np.exp(-np.clip(din, 0, None) / (11 * SS)))[..., None]
    return to_img(col)

DOOR_HALF = 34 * SS     # meia largura da porta (px 2x, ao longo do arco)

def build_walls(seed=11):
    rng = np.random.default_rng(seed)
    out = (R > RO - T) & (R <= RO + 2 / SC)
    inn = (R < RI + T) & (R >= RI - 2 / SC)
    side = (np.abs(A) > HALF - T / np.maximum(R, 1e-3)) & (R >= RI - 2 / SC) & (R <= RO + 2 / SC)
    arc_u = A * R * SC
    door = inn & (np.abs(arc_u) < DOOR_HALF)
    wall = (out | inn | side) & ~door
    # coordenadas locais (ao longo, através)
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
    # arremate dourado: borda externa escura, face interna dourada
    gl = (across < 3.2) & wall
    col[gl] = GOLD_D
    gi = (np.abs(across - T * SC) < 2.6) & wall
    col[gi] = GOLD
    alpha = np.where(wall, 255, 0).astype(np.float32)
    im = to_img(col, alpha)
    # pilares nos cantos e batentes da porta
    d = ImageDraw.Draw(im)
    def pillar(x, y, s):
        pil = stone_tex(int(s), int(s), seed + 5, (108, 102, 94))
        p = to_img(pil); pd = ImageDraw.Draw(p)
        pd.rectangle([0, 0, s - 1, s - 1], outline=tuple(GOLD_D) + (255,), width=3)
        pd.rectangle([s * .28, s * .28, s * .72, s * .72], outline=tuple(GOLD) + (255,), width=2)
        im.alpha_composite(p, (int(x - s / 2), int(y - s / 2)))
    for sgn in (-1, 1):
        for r in (RO - T / 2, RI + T / 2):
            x, y = rp(r, sgn * (math.degrees(HALF) - math.degrees(T / 2 / r)))
            pillar(x, y, T * SC * 1.25)
        # batentes
        x, y = rp(RI + T / 2, math.degrees(sgn * (DOOR_HALF + T * SC * 0.3) / (RI * SC)))
        pillar(x, y, T * SC * 1.05)
    return im

def threshold(layer):
    # soleira de pedra na porta
    th = np.zeros((H, W), bool)
    th = (R >= RI) & (R < RI + T) & (np.abs(A * R * SC) < DOOR_HALF)
    c = stone_tex(H, W, 3, (150, 142, 128))
    a = np.where(th, 255, 0)
    layer.alpha_composite(to_img(c, a))

# ------------------------------------------------------------------ níveis
FX = []
def fx(type_, x, y, **kw):
    e = {'type': type_, 'x': round(x / W, 3), 'y': round(y / H, 3)}; e.update(kw); FX.append(e)

def compose(level):
    rng = random.Random(100 + level)
    canvas = build_floor(warm=1.0 if level < 3 else 1.03)
    th = new_layer(); threshold(th); canvas.alpha_composite(th)
    furn_low = new_layer(); chairs = new_layer(); tables = new_layer(); top = new_layer(); wallprops = new_layer()
    fxl = []   # (tipo, x, y, kw) deste nível

    if level == 1:
        # mesa redonda 2,4 m com 8 cadeiras
        tx, ty = CX, 136 * SS
        rl = new_layer(); rl.alpha_composite(round_rug(int(3.3 * PPM), 77), (int(tx - 1.65 * PPM), int(ty - 1.65 * PPM)))
        canvas = with_shadow(canvas, rl, off=3, blur=4, strength=0.3)
        put(tables, P['round_table'], tx, ty, width_m=2.4)
        rr = 1.2 * PPM + 0.12 * PPM
        for i in range(8):
            ang = math.radians(22.5 + i * 45)
            px, py = tx + rr * math.sin(ang), ty - rr * math.cos(ang) * 0.93
            put(chairs, P['chair_simple'], px, py, width_m=0.5, rot=facing(px, py, tx, ty))
        # em cima da mesa
        put(top, P['candelabro'], tx, ty, width_m=0.62)
        mp = parchment(int(0.85 * PPM), int(0.6 * PPM), 5, map_=True)
        put(top, mp, tx - 0.55 * PPM, ty + 0.35 * PPM, width_m=0.85, rot=12)
        put(top, P['books'], tx + 0.62 * PPM, ty - 0.3 * PPM, width_m=0.42, rot=-20)
        put(top, scroll(int(.22 * PPM), int(.42 * PPM), 9), tx + 0.5 * PPM, ty + 0.55 * PPM, width_m=0.22, rot=70)
        fxl.append(('glow', tx, ty, {'color': '#ffb347', 'radius': 0.07}))
        # cantos rústicos
        x, y = rp(d2r(44), -12.2); put(furn_low, P['crate'], x, y, width_m=0.9, rot=8)
        x, y = rp(d2r(52), -9.0); put(furn_low, P['barrel'], x, y, width_m=0.55)
        x, y = rp(d2r(84), -12.6); put(furn_low, P['barrel'], x, y, width_m=0.5)
        x, y = rp(d2r(40), 12.8); put(furn_low, P['plant'], x, y, width_m=0.55)
        x, y = rp(d2r(226), 12.0); put(furn_low, P['plant'], x, y, width_m=0.5)
        x, y = rp(d2r(222), -12.4); put(furn_low, P['books'], x, y, width_m=0.38, rot=30)
    else:
        # mesa retangular longa 7 m x 1,5 m
        tw, thh = 7.0 * PPM, 1.5 * PPM
        tx, ty = CX, 140 * SS
        tt = wood_patch(int(tw), int(thh), dark=0.95)
        tb = to_img(tt); d = ImageDraw.Draw(tb)
        d.rectangle([0, 0, tb.width - 1, tb.height - 1], outline=(40, 22, 14, 255), width=4)
        d.rectangle([12, 12, tb.width - 13, tb.height - 13], outline=tuple(GOLD) + (255,), width=2)
        for x in np.linspace(0, tb.width, 8)[1:-1]:
            d.line([(x, 4), (x, tb.height - 5)], fill=(52, 30, 20, 160), width=1)
        sh = np.asarray(tb, np.float32); gy = np.linspace(1.08, 0.86, tb.height)[:, None, None]; sh[..., :3] *= gy
        tb = Image.fromarray(np.clip(sh, 0, 255).astype(np.uint8), 'RGBA')
        tables.alpha_composite(tb, (int(tx - tw / 2), int(ty - thh / 2)))
        chair = P['chair_gothic'] if level == 2 else P['chair_red']
        cwm = 0.66 if level == 2 else 0.8
        xs = np.linspace(-tw / 2 + 0.75 * PPM, tw / 2 - 0.75 * PPM, 5)
        for sx in xs:
            for side_ in (-1, 1):
                px, py = tx + sx, ty + side_ * (thh / 2 + 0.2 * PPM)
                put(chairs, chair, px, py, width_m=cwm, rot=0 if side_ < 0 else 180)
                # taça e papel em cada lugar
                gx, gy_ = tx + sx + 0.32 * PPM, ty + side_ * (thh / 2 - 0.22 * PPM)
                put(top, P['goblet'], gx, gy_, width_m=0.13)
                if rng.random() < 0.7:
                    pp = parchment(int(.3 * PPM), int(.4 * PPM), abs(int(sx)) * 3 + side_ + 50)
                    put(top, pp, tx + sx - 0.08 * PPM, ty + side_ * (thh / 2 - 0.3 * PPM), width_m=0.3, rot=rng.uniform(-12, 12))
        head = P['chair_gothic'] if level == 2 else P['chair_throne']
        hw = 0.72 if level == 2 else 0.98
        for side_ in (-1, 1):
            px = tx + side_ * (tw / 2 + 0.28 * PPM)
            put(chairs, head, px, ty, width_m=hw, rot=-90 * side_)
            put(top, P['goblet'], tx + side_ * (tw / 2 - 0.25 * PPM), ty - 0.3 * PPM, width_m=0.14)
        # centro da mesa
        mp = parchment(int(1.3 * PPM), int(0.85 * PPM), 21, map_=True)
        put(top, mp, tx, ty, width_m=1.3, rot=2)
        for sx in (-1, 1):
            put(top, P['cand6'] if level == 3 else P['cand3'], tx + sx * 1.6 * PPM, ty, width_m=0.7 if level == 3 else 0.62, rot=90)
            fxl.append(('glow', tx + sx * 1.6 * PPM, ty, {'color': '#ffb347', 'radius': 0.05}))
            put(top, P['cand1'], tx + sx * 2.75 * PPM, ty + 0.1 * PPM, width_m=0.16)
            put(top, P['books'], tx + sx * 2.2 * PPM, ty - 0.15 * PPM, width_m=0.38, rot=sx * 15)
        put(top, scroll(int(.2 * PPM), int(.45 * PPM), 33), tx + 0.95 * PPM, ty + 0.25 * PPM, width_m=0.2, rot=80)
        put(top, scroll(int(.2 * PPM), int(.4 * PPM), 34), tx - 0.9 * PPM, ty - 0.28 * PPM, width_m=0.2, rot=-75)
        # cômodas no fundo
        for sgn in (-1, 1):
            x, y = rp(d2r(14 + 19), sgn * 12.0)
            put(furn_low, P['commode'], x, y, width_m=1.2, rot=-sgn * 12.0 + 180)
            x2, y2 = rp(d2r(14 + 19), sgn * 12.0)
            put(top, P['cand1'] if level == 2 else P['goblet'], x2 + sgn * 0.25 * PPM, y2, width_m=0.15)
        if level == 2:
            for sgn in (-1, 1):
                x, y = rp(d2r(222), sgn * 12.8); put(furn_low, P['plant'], x, y, width_m=0.55)

    if level >= 3:
        # tapete por baixo de tudo
        rg = rug(int(470 * SS), int(176 * SS), 41)
        rl = new_layer(); rl.alpha_composite(rg, (int(CX - rg.width / 2), int(140 * SS - rg.height / 2)))
        # passadeira até a porta
        run = rug(int(56 * SS), int(70 * SS), 43).rotate(90, expand=True)
        run = run.crop((0, 0, run.width, int(66 * SS)))
        rl.alpha_composite(run, (int(CX - run.width / 2), int(226 * SS)))
        canvas = with_shadow(canvas, rl, off=3, blur=4, strength=0.35)
        # lareira na parede do fundo
        fp = fireplace(int(150 * SS), int(40 * SS), 51)
        wallprops.alpha_composite(fp, (int(CX - fp.width / 2), int(10 * SS)))
        fxl += [('glow', CX, 28 * SS, {'color': '#ff7a1a', 'radius': 0.1}),
                ('smoke', CX, 22 * SS, {}),
                ('sparks', CX, 27 * SS, {'color': '#ffb347'})]
        # arandelas douradas
        for sgn in (-1, 1):
            x, y = rp(RO - T, sgn * 6.4)
            sc_ = sconce_gold(int(30 * SS)); put(wallprops, sc_, x, y + 12 * SS / 2, width_px=30 * SS, rot=-sgn * 6.4)
            fxl.append(('glow', x, y + 16 * SS / 2 + 6, {'color': '#ffc46b', 'radius': 0.035}))
            # parede lateral
            ang = math.degrees(HALF) - math.degrees(T / d2r(130))
            x, y = rp(d2r(130), sgn * ang)
            put(wallprops, sc_, x - sgn * 8 * SS, y, width_px=30 * SS, rot=-sgn * 90 - sgn * 16.5)
            fxl.append(('glow', x - sgn * 14 * SS, y, {'color': '#ffc46b', 'radius': 0.035}))
            # candelabros de chão
            x, y = rp(d2r(200), sgn * 13.6)
            put(furn_low, P['cand6'], x, y, width_m=0.95)
            fxl.append(('glow', x, y, {'color': '#ffb347', 'radius': 0.055}))
            # baús junto à parede da frente
            x, y = rp(d2r(252 - 20), sgn * 7.5)
            ch_ = chest(int(1.05 * PPM), int(0.58 * PPM), 61 + sgn)
            put(furn_low, ch_, x, y, width_m=1.05, rot=-sgn * 7.5 + 180)
    else:
        # tochas de ferro nas paredes laterais
        for sgn in (-1, 1):
            ang = math.degrees(HALF) - math.degrees(T / d2r(130))
            x, y = rp(d2r(130), sgn * ang)
            put(wallprops, torch_iron(int(22 * SS)), x - sgn * 6 * SS, y, width_px=22 * SS, rot=-sgn * 90 - sgn * 16.5)
            fxl.append(('glow', x - sgn * 10 * SS, y, {'color': '#ff9a3c', 'radius': 0.04}))
            fxl.append(('smoke', x - sgn * 10 * SS, y, {}))

    canvas = with_shadow(canvas, furn_low)
    canvas = with_shadow(canvas, chairs, off=10, blur=8, strength=0.5)
    canvas = with_shadow(canvas, tables, off=14, blur=10, strength=0.55)
    canvas = with_shadow(canvas, top, off=5, blur=3, strength=0.45)
    walls = build_walls()
    walls.alpha_composite(wallprops)
    canvas = with_shadow(canvas, walls, off=12, blur=9, strength=0.5)

    # luz quente cozida (sutil) em volta das fontes de luz
    c = np.asarray(canvas, np.float32)
    for t_, x, y, kw in fxl:
        if t_ != 'glow': continue
        rad = kw['radius'] * W * 1.6
        g = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * (rad / 2) ** 2))[..., None]
        c[..., :3] = c[..., :3] * (1 + 0.22 * g) + np.array([60, 30, 0]) * g * 0.35
    canvas = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), 'RGBA')

    out = canvas.resize((768, 311), Image.LANCZOS)
    mask = Image.open(f'{PKG}/templates/middle_arc_mask.png').convert('L')
    al = ImageChops.darker(out.getchannel('A'), mask); out.putalpha(al)
    name = 'meeting_hall.middle.png' if level == 1 else f'meeting_hall.middle.lv{level}.png'
    out.save(f'{OUT}/{name}')
    return out, [(t_, x, y, kw) for t_, x, y, kw in fxl]

levels = {}
for lv in (1, 2, 3):
    levels[lv] = compose(lv)
    print('ok', lv)

# fx consolidado com minLevel/maxLevel
def key(t_, x, y, kw): return (t_, round(x / W, 3), round(y / H, 3), json.dumps(kw, sort_keys=True))
allk = {}
for lv in (1, 2, 3):
    for e in levels[lv][1]:
        allk.setdefault(key(*e), []).append(lv)
fxs = []
for k, lvs in allk.items():
    t_, x, y, kw = k; e = {'type': t_, 'x': x, 'y': y}; e.update(json.loads(kw))
    if min(lvs) > 1: e['minLevel'] = min(lvs)
    if max(lvs) < 3: e['maxLevel'] = max(lvs)
    fxs.append(e)
json.dump(fxs, open(f'{OUT}/_fx.json', 'w'), indent=1)
print(len(fxs), 'fx')
