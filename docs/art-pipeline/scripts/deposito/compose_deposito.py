"""Depósito (id armory) – slot middle (layout v4), 3 níveis, interior visto de cima.
Uso: python3 -I compose_deposito.py <pasta_dl> <pasta_renders> <repo> <pasta_saida>
  <pasta_dl>      zips extraídos: planks/ (Planks039 2K), metal/ (MetalPlates006 2K)
  <pasta_renders> renders de cima (render_dep.py): crate, chest, kite_shield, antique_estoc,
                  wooden_handle_saber, ornate_medieval_dagger, ornate_medieval_mace,
                  ornate_war_hammer, wooden_axe, wooden_lantern_01, wooden_bucket_01, wicker_basket_01
  <repo>          raiz do projeto (texturas em public/assets/textures, renders e moldes em docs/)
Trabalha em 2x (1536x622) e reduz para 768x311 no final."""
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
metal = ftex(f'{DL}/metal/MetalPlates006_2K-JPG_Color.jpg')
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

# ------------------------------------------------------------------ props renderizados
P = {k: load(f'{REN}/{k}.png') for k in ['crate', 'chest', 'kite_shield', 'antique_estoc', 'wooden_handle_saber',
                                          'ornate_medieval_dagger', 'ornate_medieval_mace', 'ornate_war_hammer',
                                          'wooden_axe', 'wooden_lantern_01', 'wooden_bucket_01', 'wicker_basket_01']}
P['kite_shield'] = tint(P['kite_shield'], (0.78, 0.76, 0.74))
P['caixote'] = load(f'{PIPE}/renders/caixote.png')
bar = Image.open(f'{PIPE}/renders/barris.png').convert('RGBA')
P['barrel'] = crop_alpha(bar.crop((110, 60, 225, 175)))
P['barrel2'] = crop_alpha(bar.crop((370, 60, 480, 175)))
def lantern_lit(img):
    im = img.copy(); dr = ImageDraw.Draw(im); c = im.width / 2, im.height / 2; r = im.width * 0.2
    dr.ellipse([c[0] - r * 1.6, c[1] - r * 1.6, c[0] + r * 1.6, c[1] + r * 1.6], fill=(255, 150, 50, 140))
    dr.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=(255, 205, 110, 255))
    dr.ellipse([c[0] - r * .45, c[1] - r * .45, c[0] + r * .45, c[1] + r * .45], fill=(255, 245, 210, 255))
    return im
P['books'] = tint(load(f'{PIPE}/renders/livros.png'), (1.55, 1.55, 1.55))
P['candelabro'] = load(f'{PIPE}/renders/candelabro.png')
# a adaga vem com a bainha ao lado: separa as duas peças pela coluna vazia entre elas
dg = P['ornate_medieval_dagger']; col = np.asarray(dg.getchannel('A'), np.float32).sum(0)
mid = int(dg.width * 0.35) + int(np.argmin(col[int(dg.width * 0.35):int(dg.width * 0.75)]))
P['dagger'] = crop_alpha(dg.crop((0, 0, mid, dg.height))); P['sheath'] = crop_alpha(dg.crop((mid, 0, dg.width, dg.height)))

# ------------------------------------------------------------------ props feitos por código
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

def potion_shelf(w, h, seed, colors, rows=2, glow=False, glass=False, big=None):
    """prateleira de poções vista de cima: tábua com frascos em fileiras (comprimento ao longo de x)"""
    im = board(w, h, seed)
    rng = np.random.default_rng(seed)
    d = h / (rows + 0.6)
    x = d * 0.7
    while x < w - d * 0.6:
        for rw in range(rows):
            if rng.random() < 0.12: continue
            dd = d * rng.uniform(0.72, 0.92)
            c = colors[rng.integers(len(colors))]
            yb = h * (rw + 0.75) / (rows + 0.5) + rng.uniform(-1.5, 1.5)
            if big and rng.random() < 0.25:
                c = big[rng.integers(len(big))]; dd = d * 1.0
            b = bottle(dd, POTION[c], int(rng.integers(1e6)), glow=0.8 if glow and c in ('green', 'purple', 'gold', 'white') else 0)
            im.alpha_composite(b, (int(x + rng.uniform(-1.5, 1.5) - b.width / 2), int(yb - b.height / 2)))
        x += d * rng.uniform(0.95, 1.15)
    if glass:
        gl = Image.new('RGBA', (w, h), (0, 0, 0, 0)); gd = ImageDraw.Draw(gl)
        gd.rectangle([0, 0, w - 1, h - 1], fill=(200, 225, 240, 38))
        for k in range(0, w, int(h * 2.2)):
            gd.polygon([(k, h), (k + h * 0.5, 0), (k + h * 0.9, 0), (k + h * 0.4, h)], fill=(255, 255, 255, 34))
        gd.line([(w / 2, 0), (w / 2, h)], fill=G4, width=2)
        gd.rectangle([0, 0, w - 1, h - 1], outline=G4, width=2)
        im.alpha_composite(gl)
    return im

def potion_crate(w, h, seed, colors):
    im = board(w, h, seed, dark=0.8, lip=False); dr = ImageDraw.Draw(im)
    b = max(4, w // 12)
    straw = np.array([196, 160, 90.]) * (1 + noise((h - 2 * b, w - 2 * b), 0.8, seed)[..., None] * 0.12)
    im.paste(to_img(straw), (b, b))
    rng = np.random.default_rng(seed)
    for i in range(2):
        for j in range(3):
            c = colors[(i * 3 + j) % len(colors)]
            bt = bottle((w - 2 * b) / 3.6, POTION[c], seed + i * 3 + j)
            x = b + (w - 2 * b) * (j + .5) / 3 - bt.width / 2; y = b + (h - 2 * b) * (i + .5) / 2 - bt.height / 2
            im.alpha_composite(bt, (int(x + rng.uniform(-1, 1)), int(y + rng.uniform(-1, 1))))
    dr.rectangle([0, 0, w - 1, h - 1], outline=(40, 24, 14, 255), width=3)
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

def weapon_rack(w, h, seed):
    """suporte de parede visto de cima: duas travessas com pinos (comprimento ao longo de x)"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bt = board(w, int(h * 0.22), seed, dark=0.75, lip=False)
    im.alpha_composite(bt, (0, 0))
    bb = board(w, int(h * 0.14), seed + 1, dark=0.8, lip=False)
    im.alpha_composite(bb, (0, int(h * 0.62)))
    dr = ImageDraw.Draw(im)
    for x in np.linspace(w * 0.04, w * 0.96, 2):
        dr.rectangle([x - 4, 0, x + 4, h * 0.8], fill=(60, 38, 22, 255))
    return im

def spear_barrel(d, seed):
    im = P['barrel'].resize((int(d), int(d)), Image.LANCZOS).copy(); dr = ImageDraw.Draw(im)
    rng = np.random.default_rng(seed); c = d / 2
    for k in range(9):
        ang = rng.uniform(0, 2 * math.pi); rr = rng.uniform(0, d * 0.3)
        x, y = c + rr * math.cos(ang), c + rr * math.sin(ang)
        L = d * 0.24; t = rng.uniform(0, 2 * math.pi)
        dx, dy = math.cos(t) * L / 2, math.sin(t) * L / 2
        dr.line([(x - dx, y - dy), (x + dx, y + dy)], fill=(100, 72, 44, 255), width=3)
        tip = [(x + dx * 1.6, y + dy * 1.6), (x + dx - dy * .25, y + dy + dx * .25), (x + dx + dy * .25, y + dy - dx * .25)]
        dr.polygon(tip, fill=(176, 182, 188, 255), outline=(80, 84, 90, 255))
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

def funnel(d):
    s = int(d) + 2; im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = s / 2
    for k, v in ((1.0, 120), (0.75, 150), (0.5, 100), (0.22, 30)):
        r = d / 2 * k; dr.ellipse([c - r, c - r, c + r, c + r], fill=(v, v - 6, v - 14, 255))
    return im

def alembic(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    cu, cu_d = (190, 110, 60, 255), (110, 58, 30, 255)
    r = h * 0.38; cx, cy = w * 0.3, h / 2
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=cu, outline=cu_d, width=2)
    dr.ellipse([cx - r * .45, cy - r * .45, cx + r * .45, cy + r * .45], fill=(220, 150, 90, 255))
    dr.line([(cx + r * .5, cy), (w * 0.72, cy - h * .05)], fill=cu, width=4)
    sx, sy = w * 0.8, h / 2
    for k in range(4):
        rr = h * 0.32 - k * h * 0.07
        dr.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], outline=cu, width=3)
    b = bottle(h * 0.3, POTION['green'], 3)
    im.alpha_composite(b, (int(w - b.width), int(h - b.height)))
    return im

def vault_door(d):
    s = int(d)
    yy_, xx_ = np.mgrid[0:s, 0:s].astype(np.float32)
    r = np.hypot(xx_ - s / 2, yy_ - s / 2) / (s / 2)
    m = sample(metal, xx_ * 2.2, yy_ * 2.2)
    m = m.mean(-1, keepdims=True) * np.array([0.8, 0.82, 0.88]) * 0.9
    m *= np.clip(1.15 - r * 0.35, 0, 2)[..., None]
    a = np.where(r <= 1, 255, 0)
    im = to_img(m, a); dr = ImageDraw.Draw(im); c = s / 2
    for k, colr, wd in ((1.0, GD4, 5), (0.94, G4, 3), (0.62, G4, 3)):
        rr = c * k - wd / 2; dr.ellipse([c - rr, c - rr, c + rr, c + rr], outline=colr, width=wd)
    for i in range(24):                        # runas no anel
        t = i / 24 * 2 * math.pi; rr = c * 0.78
        x, y = c + rr * math.cos(t), c + rr * math.sin(t)
        k = 3 + (i % 3)
        if i % 2: dr.line([(x - k, y - k), (x + k, y + k)], fill=G4, width=2)
        else: dr.polygon([(x, y - k), (x + k, y), (x, y + k), (x - k, y)], outline=G4)
    for i in range(4):                         # volante
        t = i / 4 * math.pi + math.pi / 8
        dr.line([(c - c * .5 * math.cos(t), c - c * .5 * math.sin(t)), (c + c * .5 * math.cos(t), c + c * .5 * math.sin(t))], fill=(60, 60, 66, 255), width=6)
    dr.ellipse([c - c * .14, c - c * .14, c + c * .14, c + c * .14], fill=G4, outline=GD4, width=2)
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

# ------------------------------------------------------------------ níveis
def compose(level):
    fxl = []
    def fx(t_, x, y, **kw): fxl.append((t_, x, y, kw))
    canvas = build_floor()
    floor_deco = new_layer()
    low = new_layer(); mid_ = new_layer(); top = new_layer(); wallp = new_layer()

    # ---------------- piso: estrados, tapete, mármore
    if level >= 2:
        k = 2048 / (2.6 * PPM) * 0.55
        floor_deco.alpha_composite(polar_band(planks, k, 16, 96, -6.0, 5.2, 0.82))           # estrado dos caixotes
        floor_deco.alpha_composite(polar_band(planks, k, 16, 52, 6.0, 15.2, 0.78))           # estrado da prateleira
    if level == 2:
        rn = runner(int(56 * SS), int(98 * SS), 5)
        place(floor_deco, rn, 197, 0, width_px=rn.width)
    if level >= 3:
        k = 2048 / (520 * SS)
        mb = polar_band(marble, k, 98, 252, -3.4, 3.4, 1.15)
        md = ImageDraw.Draw(mb)
        floor_deco.alpha_composite(mb)
        for a in (-3.4, 3.4):                          # filetes dourados do corredor
            for d0 in range(98, 252, 2):
                x, y = rp(d2r(d0), a); md.point((x, y))
        gl = (R <= d2r(98)) & (R >= d2r(252)) & (np.abs(np.abs(ADEG) - 3.4) * R * SC * math.pi / 180 < 2.2)
        floor_deco.alpha_composite(to_img(np.zeros((H, W, 3)) + GOLD, np.where(gl, 255, 0)))
        em = emblem(70 * SS); place(floor_deco, em, 196, 0, width_px=em.width)
        fx('glow', *rp(d2r(196), 0), color='#e2b84a', radius=0.06)

    # ---------------- ala esquerda: armas
    # suporte de armas: estrado de madeira escura contra a parede, armas em pé (vistas de cima, deitadas no estrado)
    k = 2048 / (2.6 * PPM) * 0.55
    wallp_rack = polar_band(planks, k, 14, 74, -15.6, -7.0, 0.55)
    rk = weapon_rack(int(176 * SS), int(60 * SS), 21)
    place(low, rk, 44, -11.3, width_px=rk.width)
    weapons = [('antique_estoc', -14.3, 1.05), ('wooden_handle_saber', -12.9, 0.9)]
    if level >= 2: weapons += [('ornate_medieval_mace', -11.3, 0.72), ('ornate_war_hammer', -9.9, 0.78), ('wooden_axe', -8.5, 0.72)]
    for nm, a, L in weapons:
        img = P[nm]
        img = img.resize((int(img.width * L * PPM / img.height * 1.6), int(L * PPM)), Image.LANCZOS)
        img = tint(img, (1.25, 1.25, 1.3))
        place(mid_, img, 18 + L * PPM / SS / 2, a, rot_extra=180, width_px=img.width)
    if level == 1:
        place(mid_, P['kite_shield'], 172, -14.3, rot_extra=4, height_m=1.25)
    else:
        for a, r_ in ((-14.4, 6), (-12.8, 0), (-11.2, -6)):
            place(mid_, P['kite_shield'], 176, a, rot_extra=r_, height_m=1.2)
    place(low, spear_barrel(0.62 * PPM, 4), 128, -8.4, width_m=0.62)
    if level >= 3:
        vt = table(int(1.55 * PPM), int(0.7 * PPM), 31, cloth=(40, 26, 60))
        vd = ImageDraw.Draw(vt)
        d_ = P['dagger'].rotate(90, expand=True); d_ = d_.resize((int(0.62 * PPM), int(0.62 * PPM * d_.height / d_.width)), Image.LANCZOS)
        vt.alpha_composite(d_, (int(vt.width * .08), int(vt.height * .22)))
        sh_ = P['sheath'].rotate(90, expand=True); sh_ = sh_.resize((int(0.42 * PPM), int(0.42 * PPM * sh_.height / sh_.width)), Image.LANCZOS)
        vt.alpha_composite(sh_, (int(vt.width * .1), int(vt.height * .62)))
        es = P['antique_estoc'].rotate(90, expand=True); es = es.resize((int(0.72 * PPM), int(0.72 * PPM * es.height / es.width)), Image.LANCZOS)
        vt.alpha_composite(es, (int(vt.width * .52), int(vt.height * .3)))
        vt.alpha_composite(glass_over(vt.width, vt.height))
        place(mid_, vt, 214, -7.0, width_m=1.55)
        fx('sparks', *rp(d2r(214), -7.0), color='#ffe08a')

    # ---------------- centro: suprimentos
    place(low, P['crate'], 36, -3.6, width_m=1.24)
    place(low, P['caixote'], 40, 1.9, rot_extra=6, width_m=0.85)
    place(low, P['barrel'], 74, -4.6, width_m=0.62)
    place(low, P['barrel2'], 82, -2.6, width_m=0.56)
    place(low, sack(int(0.62 * PPM), int(0.78 * PPM), 1), 70, 1.1, rot_extra=-14, width_m=0.62)
    place(low, sack(int(0.58 * PPM), int(0.72 * PPM), 2, (166, 140, 102)), 76, 2.9, rot_extra=22, width_m=0.58)
    if level < 3:
        place(low, sack(int(0.6 * PPM), int(0.74 * PPM), 3, (184, 158, 118)), 92, 0.2, rot_extra=95, width_m=0.6)
    if level >= 2:
        for d0, a in ((30, -1.6), (36, 3.3)): place(top, label(int(0.22 * PPM), int(0.14 * PPM)), d0, a, rot_extra=4, width_m=0.22)
        place(low, rope(0.5 * PPM, 6), 58, 4.5, width_m=0.5)
        # balcão do intendente
        ct = table(int(2.1 * PPM), int(0.72 * PPM), 41)
        place(mid_, ct, 128, 0, width_m=2.1)
        x, y = rp(d2r(124), -2.0); put(top, P['books'], x, y, width_m=0.5, rot=12)
        x, y = rp(d2r(128), 0.6); put(top, P['candelabro'], x, y, width_m=0.42)
        fx('glow', x, y, color='#ffb347', radius=0.045)
        x, y = rp(d2r(126), 2.4); put(top, label(int(0.3 * PPM), int(0.36 * PPM)), x, y, width_m=0.3, rot=-8)
        x, y = rp(d2r(124), -0.6); put(top, bottle(0.12 * PPM, (30, 24, 20), 9, cork=False), x, y, width_m=0.16)
    if level >= 3:
        place(low, P['chest'], 74, 1.6, rot_extra=-4, width_m=0.96)
        vd_ = vault_door(46 * SS)
        x, y = rp(RO - T * 1.25, 0); put(wallp, vd_, x, y, width_px=vd_.width)
        fx('glow', x, y, color='#e2b84a', radius=0.04)

    # ---------------- ala direita: poções
    shelf_cols = ['red', 'blue'] if level == 1 else ['red', 'blue', 'green', 'purple']
    psh = potion_shelf(int(150 * SS), int(26 * SS), 11, shelf_cols, glass=level >= 3, glow=level >= 3,
                       big=['gold', 'white'] if level >= 3 else None)
    place(mid_, psh, 29, 10.7, width_px=psh.width)
    place(low, potion_crate(int(0.8 * PPM), int(0.6 * PPM), 12, ['red', 'blue', 'red', 'blue', 'red', 'red']), 98, 12.2, rot_extra=-8, width_m=0.8)
    if level >= 2:
        # segunda prateleira, na parede lateral direita
        ang_side = math.degrees(HALF) - math.degrees(T / d2r(130)) - px2deg(14, 130)
        sp = potion_shelf(int(118 * SS), int(24 * SS), 13, shelf_cols, glass=level >= 3, glow=level >= 3,
                          big=['gold', 'white'] if level >= 3 else None)
        place(mid_, sp, 132, ang_side, rot_extra=90, width_px=sp.width)
        # mesa de rotulagem
        lt = table(int(1.35 * PPM), int(0.68 * PPM), 51)
        place(mid_, lt, 166, 8.6, rot_extra=-4, width_m=1.35)
        for i, (dd, aa, c) in enumerate(((158, 7.2, 'green'), (163, 8.0, 'red'), (156, 8.8, 'purple'))):
            x, y = rp(d2r(dd), aa); put(top, bottle(0.13 * PPM, POTION[c], 20 + i), x, y, width_m=0.2)
        x, y = rp(d2r(176), 7.4); put(top, lying_bottle(0.3 * PPM, 0.11 * PPM, POTION['blue'], 1), x, y, width_m=0.3, rot=20)
        x, y = rp(d2r(170), 9.6); put(top, funnel(0.16 * PPM), x, y, width_m=0.16)
        x, y = rp(d2r(172), 8.4); put(top, label(int(0.12 * PPM), int(0.08 * PPM)), x, y, width_m=0.12, rot=10)
        if level >= 3:
            x, y = rp(d2r(162), 10.0); put(top, alembic(int(0.5 * PPM), int(0.3 * PPM)), x, y, width_m=0.5, rot=-8)
        else:
            x, y = rp(d2r(168), 10.0); put(top, label(int(0.12 * PPM), int(0.08 * PPM)), x, y, width_m=0.12, rot=-14)
        fx('glow', *rp(d2r(158), 7.2), color='#7dffa0', radius=0.025)
        place(low, P['wicker_basket_01'], 220, 12.6, rot_extra=-6, width_m=0.62)
        place(low, P['wicker_basket_01'], 162, -5.4, rot_extra=8, width_m=0.55)
        place(low, P['wooden_bucket_01'], 228, 6.4, width_m=0.42)
        # ervas dentro do cesto da direita
        x, y = rp(d2r(220), 12.6)
        hb = Image.new('RGBA', (int(0.42 * PPM), int(0.3 * PPM)), (0, 0, 0, 0)); hd = ImageDraw.Draw(hb)
        rng = np.random.default_rng(3)
        for k in range(26):
            px_, py_ = rng.uniform(0, hb.width), rng.uniform(0, hb.height); rr = rng.uniform(3, 7)
            g = int(rng.uniform(90, 150)); hd.ellipse([px_ - rr, py_ - rr * .6, px_ + rr, py_ + rr * .6], fill=(60, g, 50, 255))
        put(top, hb, x, y, width_m=0.42, rot=-18)
    if level >= 3:
        for (dd, aa, c) in ((29, 8.0, '#7dffa0'), (29, 12.4, '#b48cff'), (110, 14.6, '#ffe08a')):
            fx('glow', *rp(d2r(dd), aa), color=c, radius=0.03)

    # ---------------- lanternas da porta
    for sgn in (-1, 1):
        x, y = place(low, lantern_lit(P['wooden_lantern_01']), 232, sgn * 3.0, width_m=0.34)
        fx('glow', x, y, color='#ffb347', radius=0.04)
    if level >= 2:
        x, y = place(low, lantern_lit(P['wooden_lantern_01']), 100, 6.4, width_m=0.3)
        fx('glow', x, y, color='#ffb347', radius=0.035)

    th = new_layer(); leaf, lx, ly = threshold_and_door(th)
    canvas.alpha_composite(th)
    canvas = with_shadow(canvas, floor_deco, off=3, blur=3, strength=0.3)
    canvas = with_shadow(canvas, wallp_rack, off=4, blur=4, strength=0.4)
    canvas = with_shadow(canvas, low)
    canvas = with_shadow(canvas, mid_, off=10, blur=8, strength=0.5)
    canvas = with_shadow(canvas, top, off=5, blur=3, strength=0.45)
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
    mask = Image.open(f'{REPO}/docs/art-templates/middle_arc_mask.png').convert('L')
    out.putalpha(ImageChops.darker(out.getchannel('A'), mask))
    name = 'armory.middle.png' if level == 1 else f'armory.middle.lv{level}.png'
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

# lado a lado
sheet = Image.new('RGB', (768 * 3 + 40, 311 + 40), (30, 27, 38))
dr = ImageDraw.Draw(sheet)
for i, lv in enumerate((1, 2, 3)):
    sheet.paste(levels[lv][0], (10 + i * 778, 30), levels[lv][0]); dr.text((14 + i * 778, 10), f'Nivel {lv}', fill=(226, 184, 74))
sheet.save(f'{OUT}/deposito_niveis.jpg', quality=90)
print('ok', len(fxs), 'fx')
