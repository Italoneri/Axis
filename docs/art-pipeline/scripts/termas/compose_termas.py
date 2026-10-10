# Fontes Termais (hot_springs) — arte outer 768x506, níveis 1..3
# uso: python3 -I compose_termas.py <nivel> <saida.png>
import json, math, sys, glob, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

NIVEL = int(sys.argv[1]); OUT = sys.argv[2]
LV = 3                      # layout fixo: versão com a piscininha (aprovada)
LANT = NIVEL >= 2           # lanternas a partir do nível 2
ZEN = NIVEL >= 3            # nível 3: borda de mármore + jardim zen
PKG = '/home/claude/pkg/axis-art-pipeline'; AS = '/home/claude/assets'; RD = '/home/claude/renders'
L = json.load(open(f'{PKG}/layout.json'))
arc = next(x for x in L['slots'] if x['type'] == 'outer')['arc']
ri, ro = arc['innerRadius'], arc['outerRadius']; half = (arc['endAngle'] - arc['startAngle']) / 2
w = 2 * ro * math.sin(math.radians(half)); h = ro - ri * math.cos(math.radians(half))
W = 768; H = round(W * h / w); sc = W / w
CX, CY = W / 2, ro * sc
def P(r, a): return (CX + r * sc * math.sin(math.radians(a)), CY - r * sc * math.cos(math.radians(a)))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / sc
A = np.degrees(np.arctan2(xx - CX, CY - yy))
U = np.radians(A) * ro * sc          # px ao longo do arco
V = (ro - R) * sc                    # px a partir da muralha, para dentro
rng = np.random.default_rng(7 + LV)

def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
def polar_tex(tex, scale_px):
    th, tw = tex.shape[:2]
    u = (U / scale_px * tw) % tw; v = (V / scale_px * th) % th
    return tex[v.astype(int) % th, u.astype(int) % tw]
def smooth(x, a, b): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

inside = (R >= ri) & (R <= ro) & (np.abs(A) <= half)

# ---------- chão: seixos (úmidos e escurecidos) ----------
peb = load(f'{AS}/ganges_river_pebbles_2k.blend/textures/ganges_river_pebbles_diff_2k.jpg')
pg = polar_tex(peb, 260)
g = pg.mean(-1, keepdims=True)
ground = g * np.array([0.92, 0.9, 0.86]) * 0.50 + pg * 0.12      # cinza quente, pouco saturado

# ---------- piscina: forma orgânica em coordenadas do arco ----------
def blob(u0, v0, ru, rv, seed, amp=0.10):
    r2 = np.random.default_rng(seed); th = np.arctan2((V - v0) / rv, (U - u0) / ru)
    n = sum(r2.uniform(-amp, amp) * np.cos(k * th + r2.uniform(0, 6.28)) for k in (2, 3, 5, 7))
    d = np.hypot((U - u0) / ru, (V - v0) / rv)
    return 1 - d / (1 + n)          # >0 dentro; ~1 no centro
deck_v0 = (ro - ri - 0.016) * sc   # início do deck (px a partir da muralha) no eixo central
if LV == 1:
    pools = [blob(-10, 245, 215, 120, 11)]
elif LV == 2:
    pools = [blob(-5, 240, 290, 135, 11)]
else:
    pools = [blob(-60, 238, 255, 132, 11), blob(262, 262, 72, 58, 23, 0.06)]
F = np.maximum.reduce(pools) if len(pools) > 1 else pools[0]
F = np.where(inside, F, -1)
water = F > 0
depth = smooth(F, 0.0, 0.55)        # 0 na borda, 1 no meio

# fundo da piscina: seixos claros vistos através da água
bottom = polar_tex(peb, 180)
shallow = np.array([0.30, 0.66, 0.64]); deep = np.array([0.04, 0.26, 0.31])
tint = shallow * (1 - depth[..., None]) + deep * depth[..., None]
wcol = bottom.mean(-1, keepdims=True) * 0.55 * (1 - depth[..., None] * 0.85) + tint * (0.55 + 0.45 * depth[..., None])
wcol = wcol * 0.75 + tint * 0.35
# cáusticas
def caust(f, s):
    a = np.sin(U * f + np.sin(V * f * 1.3 + s) * 2.2) + np.sin(V * f * 1.1 + np.sin(U * f * 0.8 + s * 2) * 2.4)
    return np.exp(-(a ** 2) * 9)
c = caust(0.09, 0.3) * 0.55 + caust(0.137, 1.7) * 0.45
wcol = wcol + c[..., None] * np.array([0.55, 0.9, 0.85]) * 0.13 * (1 - depth[..., None] * 0.5)
# leitoso termal + reflexo do céu (luz vinda de cima/esquerda)
milk = 0.10 + 0.06 * np.sin(U * 0.012 + V * 0.02)
wcol = wcol * (1 - milk[..., None]) + np.array([0.75, 0.92, 0.9]) * milk[..., None]
spec = smooth(-(xx - 300) * 0.6 - (yy - 200), -40, 260) * 0.08
wcol = wcol + spec[..., None]
# borda: anel de espuma/raso
rim = smooth(F, 0.0, 0.04) * (1 - smooth(F, 0.04, 0.12))
wcol = wcol * (1 - rim[..., None] * 0.35) + np.array([0.85, 0.95, 0.92]) * rim[..., None] * 0.35
# chão molhado perto da água
near = smooth(F, -0.18, 0.0)
groundw = ground * (1 - 0.35 * near[..., None])

wa = smooth(F, -0.012, 0.012)[..., None]
img = wcol * wa + groundw * (1 - wa)
alpha = inside.astype(np.float32)

# ---------- nível 3: borda de mármore negro + areia rastelada ----------
if ZEN:
    from scipy.ndimage import distance_transform_edt as edt
    wat = water & inside
    dist = edt(~wat).astype(np.float32)
    RIM = 17.0
    mar = polar_tex(load(f'{AS}/Marble006_2K-JPG/Marble006_2K-JPG_Color.jpg'), 340) * 0.85
    lum = mar.mean(-1, keepdims=True)
    veia = smooth(lum, 0.22, 0.55)
    mar = mar * (1 - veia * 0.8) + np.array([0.886, 0.722, 0.29]) * veia * 0.8      # veios dourados
    sand = load(f'{AS}/coast_sand_01_2k.blend/textures/coast_sand_01_diff_2k.jpg')
    sd_ = polar_tex(sand, 220); sg = sd_.mean(-1, keepdims=True)
    sd_ = (sg * 0.85 + sd_ * 0.15) * np.array([1.02, 0.99, 0.93]) * 1.05            # areia clara, pouco saturada
    k = dist - RIM
    conc = np.cos(2 * np.pi * k / 7.5)                       # sulcos acompanhando as piscinas
    para = np.cos(2 * np.pi * V / 7.5)                       # sulcos paralelos à muralha, longe da água
    blend = smooth(k, 45, 75)
    rake = (conc * (1 - blend) + para * blend)[..., None]
    sd_ = sd_ * (0.86 + 0.14 * rake)
    zone = inside & ~wat
    rimm = zone & (dist <= RIM)
    img = np.where((zone & ~rimm)[..., None], sd_, img)
    img = np.where(rimm[..., None], mar * (1.0 - 0.25 * smooth(dist, RIM - 4, RIM))[..., None], img)
    gl = zone & (np.abs(dist - RIM) < 1.3)                    # friso dourado externo
    img = np.where(gl[..., None], np.array([0.886, 0.722, 0.29]), img)
    gi = zone & (dist <= 1.6)                                 # friso fino na beira d'água
    img = np.where(gi[..., None], np.array([0.59, 0.44, 0.16]), img)

# ---------- deck de madeira na frente ----------
wood = load(f'{AS}/wood_planks_2k.blend/textures/wood_planks_diff_2k.jpg')
# tábuas correndo ao longo do arco: trocar eixos
th_, tw_ = wood.shape[:2]
uu = (V / 300 * tw_) % tw_; vv = (U / 300 * th_) % th_
wd = wood[vv.astype(int) % th_, uu.astype(int) % tw_]
wd = ImageEnhance.Color(Image.fromarray((wd * 255).astype(np.uint8))).enhance(0.75)
wd = np.asarray(ImageEnhance.Brightness(wd).enhance(0.78)).astype(np.float32) / 255
r_deck = ri + 0.015
deck = inside & (R < r_deck) & ~water
img = np.where(deck[..., None], wd, img)

out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
GOLD = (226, 184, 74, 255); GOLD_D = (150, 112, 40, 255)
d = ImageDraw.Draw(out, 'RGBA')
def arcline(r, a1, a2, col, wd_):
    d.line([P(r, a1 + (a2 - a1) * i / 80) for i in range(81)], fill=col, width=wd_, joint='curve')
# sombra/borda do deck sobre o chão
sh = Image.new('RGBA', out.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
sd.line([P(r_deck + 0.001, -half + 0.6 + i * 2 * (half - 0.6) / 80) for i in range(81)], fill=(0, 0, 0, 150), width=8)
out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(4)))
d = ImageDraw.Draw(out, 'RGBA')
arcline(r_deck, -half, half, GOLD_D, 3)            # friso do deck
arcline(ri + 0.002, -half + .3, half - .3, (226, 184, 74, 170), 2)   # limite frontal (igual à Forja)
d.line([P(ri, -half + .15), P(ro, -half + .15)], fill=GOLD_D, width=3)
d.line([P(ri, half - .15), P(ro, half - .15)], fill=GOLD_D, width=3)

# ---------- objetos ----------
def crop_alpha(im): return im.crop(im.split()[3].getbbox())
def grade(im, sat=0.7, bri=0.85, cool=True):
    a = im.split()[3]; rgb = im.convert('RGB')
    rgb = ImageEnhance.Color(rgb).enhance(sat); rgb = ImageEnhance.Brightness(rgb).enhance(bri)
    if cool:
        arr = np.asarray(rgb).astype(np.float32) * np.array([0.95, 0.97, 1.03]); rgb = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    rgb.putalpha(a); return rgb
def paste(im, x, y, size, rot=0, shadow=True, sh_alpha=.6, dx=6, dy=7):
    global out
    s = size / max(im.size); im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    if shadow:
        s2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); s2.putalpha(im.split()[3].point(lambda v: int(v * sh_alpha)))
        out.alpha_composite(s2.filter(ImageFilter.GaussianBlur(5)), (int(x - im.width / 2 + dx), int(y - im.height / 2 + dy)))
    out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))
def UV(u, v):   # px no arco -> px da imagem
    a = math.degrees(u / (ro * sc)); r = ro - v / sc; return P(r, a)

rocks = [grade(crop_alpha(Image.open(f).convert('RGBA')), 0.55, 0.8) for f in
         sorted(glob.glob(f'{RD}/rock_moss_set_0[12]/*.png'))]
boulder = grade(crop_alpha(Image.open(f'{RD}/boulder_01/00_boulder_01_LOD0.png').convert('RGBA')), 0.45, 0.78)
ferns = [crop_alpha(Image.open(f).convert('RGBA')) for f in sorted(glob.glob(f'{RD}/fern_02/*.png'))]
ferns = [grade(f, 0.85, 0.8, cool=False) for f in ferns]
bucket = crop_alpha(Image.open(f'{RD}/wooden_bucket_01/00_all.png').convert('RGBA'))
stool = grade(crop_alpha(Image.open(f'{RD}/wooden_stool_01/00_wooden_stool_01.png').convert('RGBA')), 0.9, 0.62, cool=False)
lantern = crop_alpha(Image.open(f'{RD}/lantern/00_all.png').convert('RGBA'))

# pedras contornando a borda da água (amostra pontos do contorno)
edge_pts = []
for pf in pools:
    m = (pf > -0.06) & (pf < 0.02) & inside & (R > r_deck + 0.006)
    ys, xs = np.nonzero(m); edge_pts.append((xs, ys))
placed = []
def far(x, y, dmin): return all(math.hypot(x - a, y - b) > dmin for a, b, _ in placed)
for xs, ys in edge_pts:
    idx = rng.permutation(len(xs))
    for i in idx:
        x, y = xs[i], ys[i]
        sz = rng.uniform(46, 78) if R[y, x] > ri + 0.03 else rng.uniform(34, 52)
        if far(x, y, sz * 0.62): placed.append((x, y, sz))
edge_set = set(placed)
# pedras e samambaias no barranco do fundo (contra a muralha)
back = []
for _ in range(400):
    u = rng.uniform(-370, 370); v = rng.uniform(12, 90)
    x, y = UV(u, v)
    if 0 <= int(y) < H and 0 <= int(x) < W and inside[int(y), int(x)] and F[int(y), int(x)] < -0.05:
        sz = rng.uniform(52, 92)
        if far(x, y, sz * 0.7): placed.append((x, y, sz)); back.append((x, y))
order = sorted(placed, key=lambda p: p[1])
# sombra larga do barranco sobre a água
for x, y, sz in order:
    ri_ = rng.integers(len(rocks)); rot_ = rng.uniform(0, 360)
    if ZEN and (x, y, sz) in edge_set: continue     # nível 3: borda de mármore no lugar das pedras soltas
    paste(rocks[ri_], x, y, sz, rot=rot_)

# rocha grande da nascente
bx, by = UV(-40 if LV < 3 else -90, 52)
paste(boulder, bx, by, 150, rot=rng.uniform(-20, 20) + 90)

# samambaias
n_f = {1: 4, 2: 7, 3: 8}[LV]
fpts = [p for p in back]; rng.shuffle(fpts)
for x, y in fpts[:n_f]:
    paste(ferns[rng.integers(len(ferns))], x + rng.uniform(-20, 20), y + rng.uniform(-10, 10), rng.uniform(60, 88), rot=rng.uniform(0, 360), sh_alpha=.45, dx=4, dy=5)



# ---------- nível 3: lanterna de pedra e bonsai no jardim zen ----------
ZEN_SPOTS = {'stone_lantern': (640, 150), 'bonsai': (196, 100)}
if ZEN:
    # anéis rastelados em volta dos objetos
    rk = Image.new('RGBA', out.size, (0, 0, 0, 0)); rkd = ImageDraw.Draw(rk)
    for (x, y), base in ((ZEN_SPOTS['stone_lantern'], 30), (ZEN_SPOTS['bonsai'], 38)):
        for i in range(4):
            r_ = base + i * 7.5
            rkd.ellipse([x - r_, y - r_, x + r_, y + r_], outline=(40, 34, 26, 70), width=2)
            rkd.ellipse([x - r_ + 2, y - r_ + 2, x + r_ - 2, y + r_ - 2], outline=(255, 248, 230, 45), width=1)
    out.alpha_composite(rk.filter(ImageFilter.GaussianBlur(0.6)))
    # lanterna de pedra (tōrō) vista de cima: telhado de 4 águas + pináculo
    S_ = 50; st = Image.new('RGBA', (S_, S_), (0, 0, 0, 0))
    stex = Image.open(f'{AS}/rock_moss_set_01_2k.blend/textures/rock_moss_set_01_diff_2k.jpg').convert('L').crop((200, 200, 700, 700)).resize((S_, S_))
    stex = ImageEnhance.Contrast(stex).enhance(1.3)
    c0 = S_ / 2; faces = [([(0, 0), (S_, 0), (c0, c0)], 1.18), ([(S_, 0), (S_, S_), (c0, c0)], 0.92),
                          ([(S_, S_), (0, S_), (c0, c0)], 0.70), ([(0, S_), (0, 0), (c0, c0)], 1.02)]
    for poly, k_ in faces:
        m_ = Image.new('L', (S_, S_), 0); ImageDraw.Draw(m_).polygon(poly, fill=255)
        face = ImageEnhance.Brightness(stex.convert('RGB')).enhance(0.62 * k_)
        st.paste(face, (0, 0), m_)
    sdw = ImageDraw.Draw(st)
    sdw.rectangle([0, 0, S_ - 1, S_ - 1], outline=(38, 36, 34, 255), width=2)
    sdw.line([(2, 2), (S_ - 3, S_ - 3)], fill=(55, 52, 48, 200), width=1); sdw.line([(S_ - 3, 2), (2, S_ - 3)], fill=(55, 52, 48, 200), width=1)
    sdw.ellipse([c0 - 6, c0 - 6, c0 + 6, c0 + 6], fill=(92, 88, 82, 255), outline=GOLD_D, width=2)   # pináculo com anel dourado
    sdw.ellipse([c0 - 2.5, c0 - 2.5, c0 + 2.5, c0 + 2.5], fill=GOLD)
    x, y = ZEN_SPOTS['stone_lantern']
    halo = Image.new('RGBA', out.size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([x - 48, y - 48, x + 48, y + 48], fill=(255, 170, 70, 70))
    out.alpha_composite(halo.filter(ImageFilter.GaussianBlur(18)))
    paste(st, x, y, S_, rot=8, dx=9, dy=11, sh_alpha=.7)
    # bonsai: vaso de cerâmica escura com friso dourado + copa do Shrub 04
    x, y = ZEN_SPOTS['bonsai']
    pot = Image.new('RGBA', (54, 54), (0, 0, 0, 0)); pd = ImageDraw.Draw(pot)
    pd.ellipse([1, 1, 52, 52], fill=(44, 40, 46, 255), outline=GOLD_D, width=3)
    pd.ellipse([5, 5, 48, 48], outline=GOLD, width=1)
    pd.ellipse([9, 9, 44, 44], fill=(58, 44, 32, 255))                 # terra
    paste(pot, x, y, 54, dx=7, dy=8)
    cr = Image.new('RGBA', (140, 140), (0, 0, 0, 0))
    for f, (ox, oy, sz, rot) in (('00_shrub_04_c_LOD0', (34, 30, 80, 0)), ('01_shrub_04_b_LOD0', (60, 44, 74, 130)),
                                 ('02_shrub_04_d_LOD0', (40, 56, 78, 250)), ('03_shrub_04_a_LOD0', (56, 24, 60, 60))):
        im = crop_alpha(Image.open(f'{RD}/shrub/{f}.png').convert('RGBA')); k_ = sz / max(im.size)
        im = im.resize((int(im.width * k_), int(im.height * k_)), Image.LANCZOS).rotate(rot, expand=True, resample=Image.BICUBIC)
        cr.alpha_composite(im, (int(ox + 35 - im.width / 2 + 5), int(oy + 35 - im.height / 2 + 5)))
    crown = grade(crop_alpha(cr), 1.05, 0.9, cool=False)
    paste(crown, x - 2, y - 3, 84, sh_alpha=.55, dx=6, dy=7)

# deck: baldes e banquinhos
dv = (ro - (ri + r_deck) / 2) * sc
items = [('stool', -250), ('bucket', -195), ('stool', 205), ('bucket', 255)]
if LV >= 2: items += [('bucket', -120), ('stool', 125)]
for kind, u in items:
    x, y = UV(u, dv)
    if kind == 'stool': paste(stool, x, y, 52, rot=rng.uniform(0, 360))
    else: paste(bucket, x, y, 42, rot=rng.uniform(0, 360) if LV else 0)


# ---------- cerca de bambu (privacidade) ----------
bam = Image.open(f'{AS}/bamboo/Bamboo001A_2K-JPG_Color.jpg').convert('RGB')
bam = ImageEnhance.Color(bam).enhance(0.35); bam = ImageEnhance.Brightness(bam).enhance(0.62)
bam = np.asarray(bam).astype(np.float32) / 255 * np.array([1.06, 0.92, 0.72])   # bambu seco
bh, bw = bam.shape[:2]
FW = 16                                   # espessura da cerca (px)
r_f = r_deck + 0.0045                     # cerca da frente, logo atrás do deck
side_a = half - 0.75
gap = 26                                  # meia-abertura da entrada (px no arco)
def arcmask(r, u1, u2, wdt):
    m = Image.new('L', out.size, 0); dm = ImageDraw.Draw(m)
    a1, a2 = math.degrees(u1 / (ro * sc)), math.degrees(u2 / (ro * sc))
    dm.line([P(r, a1 + (a2 - a1) * i / 60) for i in range(61)], fill=255, width=wdt, joint='curve'); return m
def radmask(a, r1, r2, wdt):
    m = Image.new('L', out.size, 0); ImageDraw.Draw(m).line([P(r1, a), P(r2, a)], fill=255, width=wdt); return m
umax = math.radians(side_a) * ro * sc
r_div_end = ro - 92 / sc                  # divisória: do anteparo até as pedras do fundo
arcs = [arcmask(r_f, -umax, -gap, FW), arcmask(r_f, gap, umax, FW),
        arcmask(r_f + 0.0085, -gap - 30, gap + 30, FW)]           # anteparo atrás da entrada
rads = [radmask(-side_a, r_f, ro - 0.001, FW), radmask(side_a, r_f, ro - 0.001, FW),
        radmask(0, r_f + 0.0085, r_div_end, FW),
        radmask(-math.degrees(gap / (ro * sc)), r_f, r_f + 0.0085, FW - 2), radmask(math.degrees(gap / (ro * sc)), r_f, r_f + 0.0085, FW - 2)]
ma = np.maximum.reduce([np.asarray(m) for m in arcs]).astype(np.float32) / 255
mr = np.maximum.reduce([np.asarray(m) for m in rads]).astype(np.float32) / 255
mr = mr * (1 - ma)
tex_a = bam[(V * 2.2).astype(int) % bh, (U * 2.2).astype(int) % bw]          # varas atravessando a faixa
tex_r = bam[(U * 2.2).astype(int) % bh, (V * 2.2).astype(int) % bw]
# volume: centro da faixa mais claro (topo arredondado das varas)
def ridge_shade(m):
    b = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255
    return 0.7 + 0.45 * b
col = tex_a * (ma * ridge_shade(ma))[..., None] + tex_r * (mr * ridge_shade(mr))[..., None]
fm = np.clip(ma + mr, 0, 1)
fence_img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
fence_img.putalpha(Image.fromarray((fm * 255).astype(np.uint8)))
# sombra alta (a cerca é mais alta que os objetos)
s2 = Image.new('RGBA', out.size, (0, 0, 0, 0)); s2.putalpha(fence_img.split()[3].point(lambda v: int(v * .7)))
out.alpha_composite(s2.filter(ImageFilter.GaussianBlur(6)), (9, 10))
out.alpha_composite(fence_img)
d = ImageDraw.Draw(out, 'RGBA')
# amarrações escuras e travessa central
for m_, kind in ((arcs, 'a'), (rads, 'r')):
    pass
def arc_pts(r, u1, u2, n=60):
    a1, a2 = math.degrees(u1 / (ro * sc)), math.degrees(u2 / (ro * sc)); return [P(r, a1 + (a2 - a1) * i / n) for i in range(n + 1)]
for (r, u1, u2) in ((r_f, -umax, -gap), (r_f, gap, umax), (r_f + 0.0085, -gap - 30, gap + 30)):
    d.line(arc_pts(r, u1, u2), fill=(62, 44, 26, 230), width=3, joint='curve')
for a in (-side_a, side_a):
    d.line([P(r_f, a), P(ro - 0.001, a)], fill=(62, 44, 26, 230), width=3)
d.line([P(r_f + 0.0085, 0), P(r_div_end, 0)], fill=(62, 44, 26, 230), width=3)
# postes com capa dourada
def post(x, y, rr=7):
    d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(88, 64, 36, 255), outline=GOLD_D, width=2)
    d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=GOLD)
posts = []
for u in np.arange(-umax, -gap + 1, 64).tolist() + [-gap, gap] + np.arange(gap, umax + 1, 64).tolist()[1:] + [umax]:
    posts.append(UV(u, (ro - r_f) * sc))
for u in (-gap - 30, gap + 30): posts.append(UV(u, (ro - r_f - 0.0085) * sc))
for a in (-side_a, side_a):
    for k in range(1, 6):
        r = r_f + (ro - 0.004 - r_f) * k / 5; posts.append(P(r, a))
for k in range(1, 5): posts.append(P(r_f + 0.0085 + (r_div_end - r_f - 0.0085) * k / 4, 0))
for x, y in posts: post(x, y)

# lanternas (lv3) com halo
if LANT:
    for u, v in ((-330, 70), (330, 70)) + (() if ZEN else ((130, 150),)):
        x, y = UV(u, v)
        halo = Image.new('RGBA', out.size, (0, 0, 0, 0))
        ImageDraw.Draw(halo).ellipse([x - 55, y - 55, x + 55, y + 55], fill=(255, 170, 70, 80))
        out.alpha_composite(halo.filter(ImageFilter.GaussianBlur(22)))
        paste(lantern, x, y, 34, rot=0)
        ImageDraw.Draw(out).ellipse([x - 5, y - 5, x + 5, y + 5], fill=(255, 210, 120, 230))

# máscara final do arco
m = Image.open(f'{PKG}/outer_arc_mask.png').convert('L')
geo = (np.asarray(Image.fromarray((inside * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))))
out.putalpha(Image.fromarray(np.minimum.reduce([np.asarray(out.split()[3]), np.asarray(m), geo])))
arr = np.asarray(out).copy(); arr[arr[..., 3] == 0, :3] = 0; arr[arr[..., 3] == 0, 3] = 0
out = Image.fromarray(arr); out.save(OUT)

# coordenadas sugeridas para fx (0-1 na imagem)
cx_, cy_ = UV(-10, 240) if LV < 3 else UV(-60, 238)
hl, hr = UV(-150, 240), UV(140, 240)
fx = [{"type": "smoke", "x": round(hl[0] / W, 3), "y": round(hl[1] / H, 3)},
      {"type": "smoke", "x": round(hr[0] / W, 3), "y": round(hr[1] / H, 3)},
      {"type": "glow", "x": round(cx_ / W, 3), "y": round(cy_ / H, 3), "color": "#7fe0d6", "radius": 0.12}]
x2, y2 = UV(262, 262); fx.append({"type": "smoke", "x": round(x2 / W, 3), "y": round(y2 / H, 3)})
if ZEN:
    x, y = ZEN_SPOTS['stone_lantern']; fx.append({"type": "glow", "x": round(x / W, 3), "y": round(y / H, 3), "color": "#ffb347", "radius": 0.06})
if LANT:
    for u, v in ((-330, 70), (330, 70)) + (() if ZEN else ((130, 150),)):
        x, y = UV(u, v); fx.append({"type": "glow", "x": round(x / W, 3), "y": round(y / H, 3), "color": "#ffb347", "radius": 0.05})
json.dump(fx, open(OUT.replace('.png', '.fx.json'), 'w'), indent=1)
print('ok', W, H, OUT)
