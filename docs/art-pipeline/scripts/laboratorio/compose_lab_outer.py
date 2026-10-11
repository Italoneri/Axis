# Laboratório Arcano (slot middle) — composição em 1024 px, reduzida para 256 no final.
# Uso: python3 -I compose_lab.py <pasta_dl> <pasta_rend> <saida_dir>
import math, sys, random, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
DL, REND, OUT = sys.argv[1:4]
LEVEL = int(sys.argv[4]) if len(sys.argv) > 4 else 1
S = 1024; C = np.array([512.0, 512.0])
GOLD = (226, 184, 74, 255); GOLD_D = (150, 112, 40, 255)
rng = np.random.default_rng(7); random.seed(7)

def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
def to_img(rgb, a):
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    im.putalpha(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))); return im
def oct_pts(c, ap, rot=22.5):
    r = ap / math.cos(math.radians(22.5))
    return [(c[0] + r * math.sin(math.radians(rot + 45 * k)), c[1] - r * math.cos(math.radians(rot + 45 * k))) for k in range(8)]
def oct_mask(c, ap):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32); dx, dy = xx - c[0], yy - c[1]
    m = np.ones((S, S), bool)
    for k in range(8):
        a = math.radians(45 * k); m &= (dx * math.sin(a) - dy * math.cos(a)) <= ap
    return m
def shadow_of(alpha_img, off=26, blur=20, strength=0.6):
    a = alpha_img.point(lambda v: int(v * strength))
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); sh.putalpha(ImageChops.offset(a, off, off))
    return sh.filter(ImageFilter.GaussianBlur(blur))

yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))

# ---------------- base octogonal de pedra (plataforma + terraço)
AP_BASE = 500
stone = load(f'{DL}/stone/stonewall_23-2K/stonewall_23_basecolor-2K.png')
th, tw = stone.shape[:2]; k = tw / 960
st = stone[(yy * k).astype(int) % th, (xx * k).astype(int) % tw]
g = st.mean(-1, keepdims=True)
st = g * np.array([1.0, 0.93, 0.85]) * 0.55 + st * 0.15
base_m = oct_mask(C, AP_BASE)
base = to_img(st, base_m.astype(np.float32))
STONE_ARR = st  # base octogonal não é usada na versão de muralha

# (anel de runas refeito na composição em arco)
if False:
    RC = (520, 878)
    ring = Image.new('RGBA', (S, S), (0, 0, 0, 0)); rgd = ImageDraw.Draw(ring)
    for r_, w_ in ((122, 5), (96, 4)):
        rgd.ellipse([RC[0] - r_, RC[1] - r_, RC[0] + r_, RC[1] + r_], outline=GOLD, width=w_)
    rr_ = random.Random(21)
    for i in range(24):
        a = math.radians(i * 15 + 7); cx, cy = RC[0] + 109 * math.sin(a), RC[1] - 109 * math.cos(a)
        for _ in range(2):
            a1 = rr_.uniform(0, math.pi); l = rr_.uniform(3, 6)
            rgd.line([(cx - l * math.cos(a1), cy - l * math.sin(a1)), (cx + l * math.cos(a1), cy + l * math.sin(a1))], fill=GOLD, width=3)
    clipm = Image.fromarray((base_m * 255).astype(np.uint8))
    ring.putalpha(ImageChops.multiply(ring.split()[3], clipm))
    dark = Image.new('RGBA', (S, S), (0, 0, 0, 0)); dark.putalpha(ring.split()[3].point(lambda v: int(v * 0.6)))
    canvas.alpha_composite(ImageChops.offset(dark, 2, 2)); canvas.alpha_composite(ring)
    gl = ring.copy(); gl.putalpha(ring.split()[3].point(lambda v: int(v * 0.5)))
    canvas.alpha_composite(gl.filter(ImageFilter.GaussianBlur(6)))

# ---------------- torre: telhado em 8 águas
T = np.array([512.0, 420.0]); AP_T = 320
roof_t = load(f'{DL}/roof/RoofingTiles013A_2K-JPG_Color.jpg')[:900, :900]
roof_t = np.repeat(roof_t.mean(-1, keepdims=True), 3, -1)
roof_t = np.clip((roof_t - roof_t.mean()) * 2.2 + roof_t.mean(), 0, 1)
rh, rw = roof_t.shape[:2]
dx, dy = xx - T[0], yy - T[1]
ang = (np.degrees(np.arctan2(dx, -dy)) + 360) % 360           # 0 = cima, horário
face = (((ang + 22.5) // 45) % 8).astype(int)
fa = np.radians(face * 45.0)
nx, ny = np.sin(fa), -np.cos(fa)                               # normal da água (no plano)
dist_edge = AP_T - (dx * nx + dy * ny)                         # 0 na beirada, cresce p/ o centro
u = dx * ny * -1 + dy * nx                                      # ao longo da beirada
TS = 230.0
vi = ((dist_edge / TS * rh) % rh).astype(int); ui = ((u / TS * rw) % rw).astype(int)
ao_t = load(f'{DL}/roof/RoofingTiles013A_2K-JPG_AmbientOcclusion.jpg')[:900, :900, 0]
nm_t = load(f'{DL}/roof/RoofingTiles013A_2K-JPG_NormalGL.jpg')[:900, :900] * 2 - 1
rt = roof_t[vi, ui] * (ao_t[vi, ui] ** 1.6)[..., None]
tnx, tny = nm_t[vi, ui, 0], nm_t[vi, ui, 1]
rt = rt * 1.45 * np.array([0.93, 0.93, 1.07])                   # ardósia levemente violeta
slope = math.radians(38)
L = np.array([-0.55, -0.55, 0.63]); L /= np.linalg.norm(L)     # luz vinda de cima-esquerda
n3x, n3y, n3z = nx * math.sin(slope), ny * math.sin(slope), math.cos(slope)
lam = np.clip(n3x * L[0] + n3y * L[1] + n3z * L[2], 0, 1)
px_ = tnx * (-ny) + tny * (-nx); py_ = tnx * nx + tny * (-ny)          # normal da textura no plano da tela
relief = (px_ * L[0] + py_ * L[1]) * 1.1
shade = 0.32 + 1.0 * lam ** 1.3 + relief
shade = shade * (0.92 + 0.12 * np.clip(dist_edge / AP_T, 0, 1))  # leve ganho em direção ao topo
rt = rt * shade[..., None]
tower_m = oct_mask(T, AP_T)
roof = to_img(rt, tower_m.astype(np.float32))
canvas.alpha_composite(shadow_of(roof.split()[3], 28, 22, 0.7))
canvas.alpha_composite(roof)
d = ImageDraw.Draw(canvas)
tp = oct_pts(T, AP_T)
OC_R = 108
for v in tp:                                                    # espigões dourados
    vv = np.array(v) - T; vv /= np.linalg.norm(vv)
    a0 = tuple(T + vv * (OC_R + 4))
    d.line([a0, v], fill=(70, 50, 20, 200), width=14)
    d.line([a0, v], fill=GOLD, width=9)
d.line(tp + [tp[0]], fill=GOLD_D, width=9, joint='curve')         # beiral

# ---------------- chaminé (água de trás, à direita)
CH = (668, 238); CHS = 74
ch = Image.new('RGBA', (S, S), (0, 0, 0, 0)); cd = ImageDraw.Draw(ch)
box = [CH[0] - CHS / 2, CH[1] - CHS / 2, CH[0] + CHS / 2, CH[1] + CHS / 2]
cd.rectangle(box, fill=(255, 255, 255, 255))
chm = np.asarray(ch.split()[3]) > 0
cst = (g * np.array([1.0, 0.95, 0.88]) * 0.75 + st * 0.2)
chimg = to_img(cst, chm.astype(np.float32))
canvas.alpha_composite(shadow_of(chimg.split()[3], 22, 10, 0.75))
canvas.alpha_composite(chimg)
d = ImageDraw.Draw(canvas)
d.rectangle(box, outline=GOLD_D, width=5)
inner = [box[0] + 16, box[1] + 16, box[2] - 16, box[3] - 16]
d.rectangle(inner, fill=(14, 22, 16, 255))
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
gd.rectangle(inner, fill=(90, 255, 140, 120))
canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(8)))

# ---------------- óculo de vidro com círculo de runas
oc = Image.new('RGBA', (S, S), (0, 0, 0, 0))
rr = np.hypot(xx - T[0], yy - T[1]) / OC_R
glass = np.stack([0.07 + 0.22 * (1 - rr), 0.04 + 0.10 * (1 - rr), 0.16 + 0.35 * (1 - rr)], -1)
noise = rng.normal(0, 0.015, (S, S, 1)); glass = glass + noise
oc = to_img(glass, (rr <= 1).astype(np.float32))
canvas.alpha_composite(oc)
runes = Image.new('RGBA', (S, S), (0, 0, 0, 0)); rd = ImageDraw.Draw(runes)
RUNE = (190, 150, 255, 255); RUNE2 = (120, 220, 255, 255)
def circ(r, col, w): rd.ellipse([T[0] - r, T[1] - r, T[0] + r, T[1] + r], outline=col, width=w)
circ(88, RUNE, 4); circ(64, RUNE, 3); circ(30, RUNE2, 3)
for k in range(2):                                                # octograma (dois quadrados)
    pts = [(T[0] + 62 * math.sin(math.radians(45 * k + 90 * i)), T[1] - 62 * math.cos(math.radians(45 * k + 90 * i))) for i in range(4)]
    rd.line(pts + [pts[0]], fill=RUNE2, width=3)
for i in range(18):                                               # glifos no anel
    a = math.radians(i * 20 + 5); r0 = 76
    cx, cy = T[0] + r0 * math.sin(a), T[1] - r0 * math.cos(a)
    for _ in range(2):
        a1 = random.uniform(0, math.pi * 2); l = random.uniform(4, 8)
        rd.line([(cx - l * math.cos(a1), cy - l * math.sin(a1)), (cx + l * math.cos(a1), cy + l * math.sin(a1))], fill=RUNE, width=3)
    if i % 3 == 0: rd.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=RUNE2)
canvas.alpha_composite(runes.filter(ImageFilter.GaussianBlur(9)))
canvas.alpha_composite(runes.filter(ImageFilter.GaussianBlur(3)))
canvas.alpha_composite(runes)
d = ImageDraw.Draw(canvas)
for k in range(8):                                                # caixilhos da cúpula
    a = math.radians(22.5 + 45 * k)
    d.line([(T[0] + 30 * math.sin(a), T[1] - 30 * math.cos(a)), (T[0] + OC_R * math.sin(a), T[1] - OC_R * math.cos(a))], fill=(60, 45, 20, 150), width=3)
hl = Image.new('RGBA', (S, S), (0, 0, 0, 0)); hd = ImageDraw.Draw(hl)
hd.ellipse([T[0] - 78, T[1] - 82, T[0] - 18, T[1] - 40], fill=(255, 255, 255, 70))
canvas.alpha_composite(hl.filter(ImageFilter.GaussianBlur(8)))
d.ellipse([T[0] - OC_R, T[1] - OC_R, T[0] + OC_R, T[1] + OC_R], outline=GOLD_D, width=18)
d.ellipse([T[0] - OC_R + 3, T[1] - OC_R + 3, T[0] + OC_R - 3, T[1] + OC_R - 3], outline=GOLD, width=10)

# ---------------- lv3: pináculo dourado com cristal flutuante sobre o óculo
if LEVEL >= 3:
    SP_R = 58
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0)); spd = ImageDraw.Draw(sp)
    v8 = oct_pts(T, SP_R * math.cos(math.radians(22.5)))
    tip = tuple(T)
    for k in range(8):
        a_mid = math.radians(45 * k)                      # direção do meio da face
        nx_, ny_ = math.sin(a_mid), -math.cos(a_mid)
        lam_ = max(0, nx_ * -0.7 + ny_ * -0.7) * 0.55 + 0.6
        col = tuple(min(255, int(c * lam_)) for c in (240, 196, 80)) + (255,)
        spd.polygon([v8[(k - 1) % 8], v8[k % 8], tip], fill=col)
    for v in v8: spd.line([v, tip], fill=(110, 80, 30, 255), width=2)
    spd.line(v8 + [v8[0]], fill=(110, 80, 30, 255), width=4)
    canvas.alpha_composite(shadow_of(sp.split()[3], 40, 14, 0.7))
    canvas.alpha_composite(sp)
    cg = Image.new('RGBA', (S, S), (0, 0, 0, 0)); cgd = ImageDraw.Draw(cg)
    cgd.ellipse([T[0] - 34, T[1] - 34, T[0] + 34, T[1] + 34], fill=(185, 140, 255, 200))
    canvas.alpha_composite(cg.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(canvas)
    q = 24; dia = [(T[0], T[1] - q), (T[0] + q * 0.7, T[1]), (T[0], T[1] + q), (T[0] - q * 0.7, T[1])]
    d.polygon([dia[0], dia[1], (T[0], T[1]), dia[3]], fill=(225, 200, 255, 255))
    d.polygon([dia[3], (T[0], T[1]), dia[1], dia[2]], fill=(110, 60, 190, 255))
    d.line(dia + [dia[0]], fill=(70, 30, 130, 255), width=2)
    d.ellipse([T[0] - 5, T[1] - 14, T[0] + 1, T[1] - 8], fill=(255, 255, 255, 230))

# ---------------- helpers para objetos
PROPS = []
def place(img, center, size, angle=0, sh=(22, 16, 0.65)):
    PROPS.append((img, size, angle, sh)); return
    im = img.copy(); w, h = im.size; s = size / max(w, h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS).rotate(angle, expand=True, resample=Image.BICUBIC)
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.alpha_composite(im, (int(center[0] - im.width / 2), int(center[1] - im.height / 2)))
    if sh: canvas.alpha_composite(shadow_of(layer.split()[3], sh[0], sh[1], sh[2]))
    canvas.alpha_composite(layer)
def blank(w, h): return Image.new('RGBA', (w, h), (0, 0, 0, 0))

# ---------------- mesa de alquimia (madeira do caixote)
wood = Image.open(f'{DL}/crate/textures/wooden_crate_01_diff_2k.jpg').convert('RGB').crop((0, 0, 1024, 512)).resize((260, 120))
wood = Image.fromarray((np.asarray(wood).astype(np.float32) * 0.8).astype(np.uint8))
table = blank(260, 120); table.paste(wood, (0, 0))
td = ImageDraw.Draw(table); td.rectangle([0, 0, 259, 119], outline=(40, 25, 12, 255), width=5)
td.line([(4, 6), (255, 6)], fill=(200, 160, 110, 90), width=2)
books = Image.open(f'{REND}/books.png').convert('RGBA'); books = books.crop(books.getbbox())
bb = books.resize((84, round(84 * books.height / books.width)), Image.LANCZOS).rotate(8, expand=True, resample=Image.BICUBIC)
table.alpha_composite(bb, (8, max(0, 60 - bb.height // 2)))
cand = Image.open(f'{REND}/candle03.png').convert('RGBA'); cand = cand.crop(cand.getbbox())
cn = cand.resize((84, 84), Image.LANCZOS); table.alpha_composite(cn, (170, 18))
bd = ImageDraw.Draw(table)
bottles = [((112, 34), 13, (60, 120, 255)), ((140, 30), 10, (230, 60, 60)), ((124, 64), 15, (60, 230, 120)),
           ((152, 78), 11, (240, 170, 40)), ((108, 92), 10, (190, 90, 255)), ((150, 52), 8, (120, 220, 255))]
for (bx, by), r, col in bottles:
    bd.ellipse([bx - r + 3, by - r + 3, bx + r + 3, by + r + 3], fill=(0, 0, 0, 90))
    bd.ellipse([bx - r, by - r, bx + r, by + r], fill=(*[int(c * 0.55) for c in col], 235), outline=(*[int(c * 0.3) for c in col], 255), width=2)
    bd.ellipse([bx - r * 0.6, by - r * 0.6, bx + r * 0.6, by + r * 0.6], fill=(*col, 230))
    bd.ellipse([bx - 3, by - 3, bx + 3, by + 3], fill=(120, 80, 45, 255))
    bd.ellipse([bx - r * 0.7, by - r * 0.75, bx - r * 0.3, by - r * 0.35], fill=(255, 255, 255, 170))
place(table, (292, 820), 250, angle=-22)

# ---------------- caldeirão
cal = blank(200, 200); cdw = ImageDraw.Draw(cal)
cc = np.mgrid[0:200, 0:200].astype(np.float32); cr = np.hypot(cc[1] - 100, cc[0] - 100)
iron = np.clip(0.16 + 0.10 * (1 - np.abs(cr - 82) / 18) + rng.normal(0, 0.02, (200, 200)), 0, 1)
iron_rgb = np.stack([iron, iron * 0.97, iron * 1.03], -1)
cal = to_img(iron_rgb, (cr <= 96).astype(np.float32)); cdw = ImageDraw.Draw(cal)
for a in (math.radians(100), math.radians(280)):                 # alças
    hx, hy = 100 + 98 * math.cos(a), 100 + 98 * math.sin(a)
    cdw.ellipse([hx - 12, hy - 12, hx + 12, hy + 12], outline=(55, 55, 60, 255), width=6)
cdw.ellipse([8, 8, 192, 192], outline=(95, 95, 105, 255), width=5)
liq_r = np.clip(1 - cr / 72, 0, 1)
liq = np.stack([0.05 + 0.35 * liq_r, 0.30 + 0.70 * liq_r, 0.12 + 0.30 * liq_r], -1)
cal.alpha_composite(to_img(liq, (cr <= 72).astype(np.float32)))
cdw = ImageDraw.Draw(cal)
for _ in range(14):
    a = random.uniform(0, 2 * math.pi); r = random.uniform(0, 60); s = random.uniform(3, 9)
    bx, by = 100 + r * math.cos(a), 100 + r * math.sin(a)
    cdw.ellipse([bx - s, by - s, bx + s, by + s], outline=(190, 255, 200, 200), width=2)
halo = Image.new('RGBA', (S, S), (0, 0, 0, 0)); hd = ImageDraw.Draw(halo)
CAL = (520, 878); hd.ellipse([CAL[0] - 95, CAL[1] - 95, CAL[0] + 95, CAL[1] + 95], fill=(60, 255, 120, 90))
place(cal, CAL, 150)


# ---------------- cristais
def crystal_cluster(n, seed, size=150):
    r_ = random.Random(seed); im = blank(size * 2, size * 2); c0 = (size, size)
    glowl = blank(size * 2, size * 2); gd = ImageDraw.Draw(glowl)
    shards = []
    for i in range(n):
        a = math.radians(-90 + (i - (n - 1) / 2) * (110 / max(1, n - 1)) + r_.uniform(-10, 10))
        L_ = r_.uniform(0.5, 0.95) * size * 0.85; W_ = L_ * r_.uniform(0.38, 0.48)
        shards.append((a, L_, W_))
    shards.sort(key=lambda s: -s[1])
    dd = ImageDraw.Draw(im)
    dd.ellipse([c0[0]-size*0.16, c0[1]-size*0.12, c0[0]+size*0.16, c0[1]+size*0.14], fill=(70, 62, 72, 255), outline=(40,35,45,255), width=2)
    for a, L_, W_ in shards:
        ux, uy = math.cos(a), math.sin(a); px, py = -uy, ux
        base0 = (c0[0] + ux * 4, c0[1] + uy * 4)
        tip = (c0[0] + ux * L_, c0[1] + uy * L_)
        sh1 = (c0[0] + ux * L_ * 0.72 + px * W_ / 2, c0[1] + uy * L_ * 0.72 + py * W_ / 2)
        sh2 = (c0[0] + ux * L_ * 0.72 - px * W_ / 2, c0[1] + uy * L_ * 0.72 - py * W_ / 2)
        b1 = (base0[0] + px * W_ / 2, base0[1] + py * W_ / 2); b2 = (base0[0] - px * W_ / 2, base0[1] - py * W_ / 2)
        mid_b = base0; mid_t = tip
        gd.polygon([b1, sh1, tip, sh2, b2], fill=(170, 110, 255, 210))
        dd.polygon([b1, sh1, tip, mid_t, mid_b], fill=(205, 170, 255, 255))   # face iluminada
        dd.polygon([mid_b, mid_t, tip, sh2, b2], fill=(92, 46, 160, 255))     # face na sombra
        dd.line([mid_b, tip], fill=(240, 225, 255, 255), width=2)
        dd.line([b1, sh1, tip, sh2, b2], fill=(60, 25, 110, 255), width=2)
    out = blank(size * 2, size * 2); out.alpha_composite(glowl.filter(ImageFilter.GaussianBlur(16))); out.alpha_composite(im)
    return out
place(crystal_cluster(5, 3), (760, 820), 250, angle=-40)
place(crystal_cluster(3, 9), (110, 520), 170, angle=90)
place(crystal_cluster(3, 5), (912, 470), 160, angle=-90)

# ---------------- lv2: segunda mesa com pergaminhos + cristais extras
if LEVEL >= 2:
    t2 = blank(210, 84)
    w2 = Image.open(f'{DL}/crate/textures/wooden_crate_01_diff_2k.jpg').convert('RGB').crop((1024, 0, 2048, 410)).resize((210, 84))
    t2.paste(Image.fromarray((np.asarray(w2).astype(np.float32) * 0.78).astype(np.uint8)), (0, 0))
    d2 = ImageDraw.Draw(t2); d2.rectangle([0, 0, 209, 83], outline=(40, 25, 12, 255), width=5)
    for (x0, y0, ln, rot) in ((14, 14, 70, 0), (20, 44, 60, 0)):  # pergaminhos enrolados
        d2.rounded_rectangle([x0, y0, x0 + ln, y0 + 20], 9, fill=(214, 196, 150, 255), outline=(120, 95, 60, 255), width=2)
        d2.line([(x0 + 4, y0 + 6), (x0 + ln - 4, y0 + 6)], fill=(245, 235, 200, 255), width=2)
        d2.ellipse([x0 - 3, y0 + 2, x0 + 7, y0 + 18], fill=(150, 30, 30, 255))
    d2.rectangle([100, 14, 150, 66], fill=(200, 180, 135, 255), outline=(110, 85, 55, 255), width=2)  # folha aberta
    for yl in range(22, 62, 7): d2.line([(106, yl), (144, yl)], fill=(90, 70, 50, 200), width=1)
    d2.ellipse([118, 34, 132, 48], outline=(130, 80, 200, 255), width=2)
    for (bx, by), r, col in (((172, 26), 11, (60, 230, 120)), ((188, 54), 9, (60, 120, 255)), ((166, 62), 8, (240, 170, 40))):
        d2.ellipse([bx - r, by - r, bx + r, by + r], fill=(*[int(c * 0.55) for c in col], 235), outline=(*[int(c * 0.3) for c in col], 255), width=2)
        d2.ellipse([bx - r * 0.6, by - r * 0.6, bx + r * 0.6, by + r * 0.6], fill=(*col, 230))
        d2.ellipse([bx - 3, by - 3, bx + 3, by + 3], fill=(120, 80, 45, 255))
    place(t2, (196, 198), 175, angle=45)
    place(crystal_cluster(4, 12), (822, 206), 170, angle=-135)
    place(crystal_cluster(3, 17), (128, 672), 130, angle=60)


# =====================================================================
# Composição no arco da muralha (768x506), feita a 2x e reduzida
# =====================================================================
import json, os
LAY = os.environ['LAYOUT']; MASK = os.environ['MASK']
Lj = json.load(open(LAY)); arc = next(x for x in Lj['slots'] if x['type'] == 'outer')['arc']
ri, ro = arc['innerRadius'], arc['outerRadius']; half = (arc['endAngle'] - arc['startAngle']) / 2
K = 2; W = 768 * K
w_ = 2 * ro * math.sin(math.radians(half)); H = round(W * (ro - ri * math.cos(math.radians(half))) / w_); sc = W / w_
CX, CY = W / 2, ro * sc
def P(r, a): return (CX + r * sc * math.sin(math.radians(a)), CY - r * sc * math.cos(math.radians(a)))
gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
Rr = np.hypot(gx - CX, CY - gy) / sc; Aa = np.degrees(np.arctan2(gx - CX, CY - gy))
inside = (Rr >= ri) & (Rr <= ro) & (np.abs(Aa) <= half)
# piso de pedra em coordenadas polares
sth, stw = stone.shape[:2]; scale_px = 520
u = (np.radians(Aa) * ro * sc / scale_px * stw) % stw; v = ((ro - Rr) * sc / scale_px * sth) % sth
stp = stone[v.astype(int) % sth, u.astype(int) % stw]; gg = stp.mean(-1, keepdims=True)
stp = gg * np.array([1.0, 0.93, 0.85]) * 0.55 + stp * 0.15
out = to_img(stp, inside.astype(np.float32)) if False else None
im_ = Image.fromarray((np.clip(stp, 0, 1) * 255).astype(np.uint8)).convert('RGBA'); im_.putalpha(Image.fromarray((inside * 255).astype(np.uint8)))
art = im_
dd = ImageDraw.Draw(art)
def arcline(r, a1, a2, col, wd): dd.line([P(r, a1 + (a2 - a1) * i / 120) for i in range(121)], fill=col, width=wd, joint='curve')
arcline(ri + 0.0012, -half + 0.25, half - 0.25, GOLD_D, 6); arcline(ri + 0.0035, -half + 0.45, half - 0.45, (226, 184, 74, 170), 3)
dd.line([P(ri, -half + 0.2), P(ro, -half + 0.2)], fill=GOLD_D, width=6); dd.line([P(ri, half - 0.2), P(ro, half - 0.2)], fill=GOLD_D, width=6)
def paste(img, center, size, angle=0, sh=(22, 16, 0.65), shadow_scale=1.0):
    im = img.copy(); w0, h0 = im.size; s0 = size / max(w0, h0)
    im = im.resize((max(1, round(w0 * s0)), max(1, round(h0 * s0))), Image.LANCZOS).rotate(angle, expand=True, resample=Image.BICUBIC)
    x, y = int(center[0] - im.width / 2), int(center[1] - im.height / 2)
    if sh:
        a_ = im.split()[3].point(lambda q: int(q * sh[2])); shl = Image.new('RGBA', im.size, (0, 0, 0, 0)); shl.putalpha(a_)
        shl = shl.filter(ImageFilter.GaussianBlur(sh[1] * shadow_scale))
        art.alpha_composite(shl, (x + int(sh[0] * shadow_scale), y + int(sh[0] * shadow_scale)))
    art.alpha_composite(im, (x, y))
# torre (camada já desenhada em `canvas`, sem a base), recortada e reduzida
TS_ = 0.92                                     # escala da torre em relação ao original 1024
tb = canvas.getbbox(); tower = canvas.crop(tb)
TC = P((ri + ro) / 2 + 0.009, 0)               # centro da torre, um pouco para trás (contra a muralha)
ox, oy = T[0] - tb[0], T[1] - tb[1]
tw2 = tower.resize((round(tower.width * TS_), round(tower.height * TS_)), Image.LANCZOS)
art.alpha_composite(tw2, (int(TC[0] - ox * TS_), int(TC[1] - oy * TS_)))
def tpt(px, py): return (TC[0] + (px - T[0]) * TS_, TC[1] + (py - T[1]) * TS_)
FX = {'oculus': TC, 'chimney': tpt(668, 238)}
# objetos: ordem em PROPS = mesa, caldeirão, cristais(5,3), cristais(3,9), cristais(3,5) [+ lv2: mesa2, cristais(4,12), cristais(3,17)]
k = TS_
table, cal, cr53, cr39, cr35 = [p[0] for p in PROPS[:5]]
CAL_P = P(ri + 0.020, 5.9)
if LEVEL >= 3:                                  # anel de runas em volta do caldeirão
    ring = Image.new('RGBA', art.size, (0, 0, 0, 0)); rgd = ImageDraw.Draw(ring); RC = CAL_P
    for r_, w_r in ((146 * k, 5), (116 * k, 4)): rgd.ellipse([RC[0] - r_, RC[1] - r_, RC[0] + r_, RC[1] + r_], outline=GOLD, width=w_r)
    rr_ = random.Random(21)
    for i in range(24):
        a = math.radians(i * 15 + 7); cx, cy = RC[0] + 131 * k * math.sin(a), RC[1] - 131 * k * math.cos(a)
        for _ in range(2):
            a1 = rr_.uniform(0, math.pi); l = rr_.uniform(3, 6)
            rgd.line([(cx - l * math.cos(a1), cy - l * math.sin(a1)), (cx + l * math.cos(a1), cy + l * math.sin(a1))], fill=GOLD, width=3)
    dark = Image.new('RGBA', art.size, (0, 0, 0, 0)); dark.putalpha(ring.split()[3].point(lambda q: int(q * 0.6)))
    art.alpha_composite(ImageChops.offset(dark, 2, 2)); art.alpha_composite(ring)
    gl = ring.copy(); gl.putalpha(ring.split()[3].point(lambda q: int(q * 0.5))); art.alpha_composite(gl.filter(ImageFilter.GaussianBlur(6)))
paste(table, P(ri + 0.024, -6.0), 290 * k, angle=90 + 6.0)
paste(cal, CAL_P, 180 * k)
halo = Image.new('RGBA', art.size, (0, 0, 0, 0)); hd2 = ImageDraw.Draw(halo)
hd2.ellipse([CAL_P[0] - 115 * k, CAL_P[1] - 115 * k, CAL_P[0] + 115 * k, CAL_P[1] + 115 * k], fill=(60, 255, 120, 90)); art.alpha_composite(halo.filter(ImageFilter.GaussianBlur(26)))
FX['cauldron'] = CAL_P
paste(cr53, P(ro - 0.018, 6.3), 330 * k, angle=-40 - 6.4); FX['crystals_r'] = P(ro - 0.018, 6.3)
paste(cr39, P(ro - 0.016, -6.6), 260 * k, angle=150)
paste(cr35, P(ri + 0.011, -2.9), 210 * k, angle=180 + 20)
if LEVEL >= 2:
    t2, cr412, cr317 = [p[0] for p in PROPS[5:8]]
    paste(t2, P(ri + 0.008, 2.0), 215 * k, angle=0)
    paste(cr412, P(ro - 0.013, -4.4), 230 * k, angle=-150); FX['crystals_tl'] = P(ro - 0.013, -4.4)
    paste(cr317, P(ri + 0.009, 7.3), 190 * k, angle=100)
# recorte final e redução
m = Image.open(MASK).convert('L').resize(art.size, Image.LANCZOS)
art.putalpha(ImageChops.multiply(art.split()[3], m))
final = art.resize((768, H // K), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.0, 50, 2))
os.makedirs(OUT, exist_ok=True)
SUF = '' if LEVEL == 1 else f'.lv{LEVEL}'
final.save(f'{OUT}/arcane_lab.outer{SUF}.png')
json.dump({k_: [round(v[0] / W, 3), round(v[1] / H, 3)] for k_, v in FX.items()}, open(f'{OUT}/fx_points{SUF}.json', 'w'))
print('ok', final.size)
