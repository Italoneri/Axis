# Enfermaria (infirmary) — arte middle v4 768x311, níveis 1..3
# uso: python3 -I compose_enfermaria.py <nivel> <saida.png>
# Ajuste os caminhos abaixo (PKG = pasta do art-pipeline, DL = assets baixados, RD = renders de cima).
import json, math, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
from scipy import ndimage

NIVEL = int(sys.argv[1]); OUT = sys.argv[2]
BASE = '/tmp/claude-0/-home-claude/d3adfd81-307e-5c15-beda-79ab2823adb4/scratchpad'
PKG = f'{BASE}/dl/axis-art-pipeline-v2/axis-art-pipeline-v2'
DL = f'{BASE}/dl'; RD = f'{BASE}/work/renders'; PR = f'{PKG}/renders'

L = json.load(open(f'{PKG}/layout.v4.json'))
arc = next(x for x in L['slots'] if x['type'] == 'middle')['arc']
ri, ro = arc['innerRadius'], arc['outerRadius']; half = (arc['endAngle'] - arc['startAngle']) / 2
w = 2 * ro * math.sin(math.radians(half)); h = ro - ri * math.cos(math.radians(half))
W = 768; H = round(W * h / w); sc = W / w
CX, CY = W / 2, ro * sc
def P(r, a): return (CX + r * sc * math.sin(math.radians(a)), CY - r * sc * math.cos(math.radians(a)))
def UV(u, v): return P(ro - v / sc, math.degrees(u / (ro * sc)))       # px no arco -> px da imagem
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / sc
A = np.degrees(np.arctan2(xx - CX, CY - yy))
U = np.radians(A) * ro * sc          # px ao longo do arco (escala da borda externa)
V = (ro - R) * sc                    # px a partir da borda externa, para dentro
DEPTH = (ro - ri) * sc; UMAX = math.radians(half) * ro * sc
inside = (R >= ri) & (R <= ro) & (np.abs(A) <= half)
rng = np.random.default_rng(11)
GOLD = (226, 184, 74, 255); GOLD_D = (150, 112, 40, 255)

def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
def tex_at(tex, x, y, scale_px):
    th, tw = tex.shape[:2]
    return tex[(y / scale_px * th).astype(int) % th, (x / scale_px * tw).astype(int) % tw]
def smooth(x, a, b): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# ---------------- piso do pátio: lajotas cinza-quente (RoofingTiles015A) ----------------
pav = load(f'{DL}/RoofingTiles015A_2K-JPG/RoofingTiles015A_2K-JPG_Color.jpg')
pg = tex_at(pav, U + 1000, V + 1000, 300)
g = pg.mean(-1, keepdims=True)
g = (g - g.mean()) * 2.3 + g.mean()
img = g * np.array([1.0, 0.94, 0.86]) * 0.78
# leve variação de mancha
noise = ndimage.gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 18)
img = img * (1 + noise[..., None] * 1.6)
# caminho central (porta -> bacia -> frente), lajotas mais claras
path = (np.abs(U) < 34) & (V > 120)
img = np.where(path[..., None], img * 1.18, img)

# ---------------- canteiro de ervas (esquerda) ----------------
def rect_mask(u1, u2, v1, v2, rad=10):
    du = np.maximum(np.maximum(u1 - U, U - u2), 0); dv = np.maximum(np.maximum(v1 - V, V - v2), 0)
    inner = (U > u1 + rad) & (U < u2 - rad) | (V > v1 + rad) & (V < v2 - rad)
    cu = np.clip(U, u1 + rad, u2 - rad); cv = np.clip(V, v1 + rad, v2 - rad)
    return np.hypot(U - cu, V - cv) <= rad
beds = [(-345, -110, 168, 246)]
if NIVEL >= 2: beds.append((-380, -278, 22, 132))    # canteiro extra ao lado do pavilhão
soil = load(f'{DL}/JPG/Ground037_2K-JPG_Color.jpg')
sg = tex_at(soil, U, V, 260)
sg = (sg * 0.6 + sg.mean(-1, keepdims=True) * 0.4) * np.array([0.80, 0.70, 0.56]) * 0.78          # terra mais escura e quente
curb_m = np.zeros((H, W), bool); soil_m = np.zeros((H, W), bool)
for b in beds:
    o = rect_mask(*b, rad=12); i_ = rect_mask(b[0] + 7, b[1] - 7, b[2] + 7, b[3] - 7, rad=7)
    curb_m |= o & ~i_; soil_m |= i_
img = np.where(soil_m[..., None], sg, img)
curb = tex_at(pav, U * 2.3, V * 2.3, 300).mean(-1, keepdims=True) * np.array([0.9, 0.86, 0.8]) * 0.55
img = np.where(curb_m[..., None], curb, img)

# ---------------- telhado de 4 águas (ardósia RoofingTiles003) ----------------
LU, V0, V1 = 262, 16, 138           # meia-largura do pavilhão (px no arco) e faixa radial
VC, LV = (V0 + V1) / 2, (V1 - V0) / 2
slate = load(f'{DL}/RoofingTiles003_2K-JPG/RoofingTiles003_2K-JPG_Color.jpg')
slate = np.repeat(slate.mean(-1, keepdims=True), 3, -1)
slate = np.minimum(slate, np.percentile(slate, 85))
slate = np.clip((slate - slate.mean()) * 1.25 + slate.mean() + 0.12, 0, 1) * np.array([0.95, 0.98, 1.06])
du = LU - np.abs(U); dv = LV - np.abs(V - VC)
roof = (du > 0) & (dv > 0) & inside
endf = du < dv
long_t = tex_at(slate, U, V, 270)
end_t = tex_at(slate, V + 37, U, 270)                 # nas águas laterais as fiadas correm no sentido radial
rt = np.where(endf[..., None], end_t, long_t)
face_k = np.where(endf, np.where(U < 0, 0.92, 0.70), np.where(V < VC, 0.66, 1.0))
hgt = np.minimum(du, dv) / LV
rt = rt * (face_k * (0.80 + 0.38 * hgt))[..., None]
roof_layer = np.zeros((H, W, 4), np.float32)
roof_layer[..., :3] = rt; roof_layer[..., 3] = roof

out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
out.putalpha(Image.fromarray((inside * 255).astype(np.uint8)))
d = ImageDraw.Draw(out, 'RGBA')

def arc_pts(v, u1, u2, n=80): return [UV(u1 + (u2 - u1) * i / n, v) for i in range(n + 1)]
def line_uv(p1, p2, n=40): return [UV(p1[0] + (p2[0] - p1[0]) * i / n, p1[1] + (p2[1] - p1[1]) * i / n) for i in range(n + 1)]

# frisos dourados dos canteiros
for b in beds:
    u1, u2, v1, v2 = b; pts = arc_pts(v1 + 1, u1 + 12, u2 - 12) + arc_pts(v2 - 1, u2 - 12, u1 + 12)
for b in beds:
    m = rect_mask(*b, rad=12)
    edge = m & ~ndimage.binary_erosion(m, iterations=2)
    a_ = np.asarray(out).copy(); a_[edge] = GOLD_D; out = Image.fromarray(a_)
d = ImageDraw.Draw(out, 'RGBA')

# ---------------- objetos ----------------
def crop_alpha(im): return im.crop(im.split()[3].getbbox())
def grade(im, sat=0.8, bri=0.9):
    a = im.split()[3]; rgb = im.convert('RGB')
    rgb = ImageEnhance.Color(rgb).enhance(sat); rgb = ImageEnhance.Brightness(rgb).enhance(bri); rgb.putalpha(a); return rgb
def paste(im, x, y, size, rot=0, shadow=True, sh_alpha=.6, dx=6, dy=7, blur=5):
    global out
    s = size / max(im.size); im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    if shadow:
        s2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); s2.putalpha(im.split()[3].point(lambda v: int(v * sh_alpha)))
        out.alpha_composite(s2.filter(ImageFilter.GaussianBlur(blur)), (int(x - im.width / 2 + dx), int(y - im.height / 2 + dy)))
    out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))
def paste_uv(im, u, v, size, rot_extra=0, **k):
    x, y = UV(u, v); a = math.degrees(u / (ro * sc)); paste(im, x, y, size, rot=-a + rot_extra, **k)
def clumps(path, min_px=300):
    im = Image.open(path).convert('RGBA'); a = np.asarray(im)[..., 3] > 20
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=3))
    res = []
    for sl in ndimage.find_objects(lab):
        c = im.crop((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
        if (np.asarray(c)[..., 3] > 20).sum() > min_px: res.append(crop_alpha(c))
    return res

nettle = [grade(c, 0.85, 0.95) for c in clumps(f'{RD}/nettle_plant.png')]
peri = [grade(c, 0.9, 1.0) for c in clumps(f'{RD}/periwinkle_plant.png')]

# ervas em fileiras ao longo do arco
for bi, (u1, u2, v1, v2) in enumerate(beds):
    rows = np.linspace(v1 + 22, v2 - 22, 3 if v2 - v1 > 70 else 2)
    for ri_, vr in enumerate(rows):
        kind = nettle if (ri_ + bi) % 2 == 0 else peri
        for u in np.arange(u1 + 24, u2 - 18, 27):
            c = kind[rng.integers(len(kind))]
            paste_uv(c, u + rng.uniform(-4, 4), vr + rng.uniform(-4, 4), rng.uniform(26, 34),
                     rot_extra=rng.uniform(0, 360), sh_alpha=.45, dx=3, dy=4, blur=3)

# leitos: armação metálica (Poly Haven) + colchão, lençol de linho (Fabric019), travesseiro e manta
frame = grade(crop_alpha(Image.open(f'{RD}/old_bed_frame.png').convert('RGBA')), 0.6, 0.85)
fab = Image.open(f'{DL}/Fabric019_2K-JPG/Fabric019_2K-JPG_Color.jpg').convert('RGB')
def make_cot(blanket=(52, 98, 92)):
    fw, fh = frame.size; cot = frame.copy()
    s = Image.new('RGBA', (fw, fh), (0, 0, 0, 0)); sd = ImageDraw.Draw(s)
    mx, my = int(fw * 0.06), int(fh * 0.035)
    lin = ImageEnhance.Brightness(fab.crop((0, 0, 600, 1200)).resize((fw - 2 * mx, fh - 2 * my))).enhance(0.92)
    lin = Image.fromarray(np.clip(np.asarray(lin).astype(np.float32) * np.array([1.0, 0.97, 0.9]), 0, 255).astype(np.uint8))
    mk = Image.new('L', lin.size, 0); ImageDraw.Draw(mk).rounded_rectangle([0, 0, lin.width - 1, lin.height - 1], 18, fill=255)
    s.paste(lin, (mx, my), mk)
    # travesseiro (cabeceira no topo = voltada para o pavilhão)
    pw = int(fw * 0.62); ph = int(fh * 0.12); px = (fw - pw) // 2; py = my + int(fh * 0.03)
    sd.rounded_rectangle([px + 4, py + 6, px + pw + 4, py + ph + 6], 20, fill=(0, 0, 0, 60))
    sd.rounded_rectangle([px, py, px + pw, py + ph], 20, fill=(246, 241, 228, 255), outline=(200, 192, 175, 255), width=3)
    # manta dobrada sobre a metade de baixo, com listra dourada
    by = my + int(fh * 0.46)
    sd.rectangle([mx - 2, by + 8, fw - mx + 2, fh - my + 4], fill=(0, 0, 0, 55))
    sd.rectangle([mx - 2, by, fw - mx + 2, fh - my], fill=blanket + (255,))
    for k in range(0, fw, 9): sd.line([(k, by), (k + 6, fh - my)], fill=tuple(int(c * 0.88) for c in blanket) + (90,), width=2)
    sd.rectangle([mx - 2, by, fw - mx + 2, by + int(fh * 0.035)], fill=tuple(min(255, int(c * 1.25)) for c in blanket) + (255,))
    sd.line([(mx - 2, by + int(fh * 0.075)), (fw - mx + 2, by + int(fh * 0.075))], fill=GOLD, width=max(3, fw // 60))
    cot.alpha_composite(s.filter(ImageFilter.GaussianBlur(0.6)))
    # barras de cabeceira e pé por cima
    top = frame.crop((0, 0, fw, int(fh * 0.05))); bot = frame.crop((0, int(fh * 0.95), fw, fh))
    cot.alpha_composite(top, (0, 0)); cot.alpha_composite(bot, (0, int(fh * 0.95))); return cot
cots = [(210, 196)] if NIVEL == 1 else [(160, 196), (262, 196)]
blankets = [(52, 98, 92), (120, 48, 44)]
for i, (u, v) in enumerate(cots): paste_uv(make_cot(blankets[i % 2]), u, v, 104, dx=5, dy=6)

# mesinha com livros entre os leitos (lv2+)
if NIVEL >= 2:
    books = grade(crop_alpha(Image.open(f'{PR}/livros.png').convert('RGBA')), 0.8, 0.9)
    paste_uv(books, 211, 180, 34, rot_extra=12, dx=3, dy=4, blur=3)

# vasos e utilidades nos cantos ao lado do pavilhão
pot1 = grade(crop_alpha(Image.open(f'{RD}/potted_plant_01.png').convert('RGBA')), 0.85, 0.9)
pot4 = grade(crop_alpha(Image.open(f'{RD}/potted_plant_04.png').convert('RGBA')), 0.9, 0.95)
crate = grade(crop_alpha(Image.open(f'{PR}/caixote.png').convert('RGBA')), 0.85, 0.85)
barrels = Image.open(f'{PR}/barris.png').convert('RGBA')
b1 = crop_alpha(barrels.crop((110, 60, 225, 175))); b2 = crop_alpha(barrels.crop((370, 60, 480, 175)))
paste_uv(pot4, 330, 52, 50)
paste_uv(crate, 318, 112, 58, rot_extra=90)
if NIVEL == 1: paste_uv(pot1, -322, 70, 66, rot_extra=40)
paste_uv(pot1, 345, 258 - 30, 52, rot_extra=200)
if NIVEL >= 2:
    paste_uv(b1, -240, 152, 32); paste_uv(b2, -205, 154, 28)
    paste_uv(pot4, -95, 238, 40, rot_extra=70)

# ---------------- sombra e telhado ----------------
rl = Image.fromarray((np.clip(roof_layer, 0, 1) * 255).astype(np.uint8), 'RGBA')
s2 = Image.new('RGBA', out.size, (0, 0, 0, 0)); s2.putalpha(rl.split()[3].point(lambda v: int(v * .7)))
out.alpha_composite(s2.filter(ImageFilter.GaussianBlur(6)), (9, 11))
out.alpha_composite(rl)
d = ImageDraw.Draw(out, 'RGBA')
rid = LU - LV
corners = [(-LU, V0), (LU, V0), (LU, V1), (-LU, V1)]
d.line(arc_pts(V0, -LU, LU) + line_uv((LU, V0), (LU, V1)) + arc_pts(V1, LU, -LU) + line_uv((-LU, V1), (-LU, V0)),
       fill=GOLD_D, width=3, joint='curve')                                            # beiral
for cu, cv in corners: d.line(line_uv((math.copysign(rid, cu), VC), (cu, cv)), fill=GOLD, width=3)   # espigões
d.line(arc_pts(VC, -rid, rid), fill=GOLD, width=5, joint='curve')                      # cumeeira

# claraboia central: vidro verde-água com caixilho dourado e emblema de cura
CL = 50
cl = Image.new('RGBA', (CL, CL), (0, 0, 0, 0)); cd = ImageDraw.Draw(cl)
cd.rectangle([0, 0, CL - 1, CL - 1], fill=GOLD_D)
glass = Image.new('RGBA', (CL - 10, CL - 10)); gpx = np.zeros((CL - 10, CL - 10, 4), np.uint8)
gy, gx = np.mgrid[0:CL - 10, 0:CL - 10]
gl = 0.55 + 0.45 * np.clip(1 - (gx + gy) / (CL - 10) * 0.9, 0, 1)
gpx[..., 0] = 60 * gl; gpx[..., 1] = 170 * gl + 30; gpx[..., 2] = 150 * gl + 25; gpx[..., 3] = 255
cl.paste(Image.fromarray(gpx, 'RGBA'), (5, 5))
cd.line([(CL / 2, 5), (CL / 2, CL - 6)], fill=GOLD_D, width=2); cd.line([(5, CL / 2), (CL - 6, CL / 2)], fill=GOLD_D, width=2)
cd.rectangle([0, 0, CL - 1, CL - 1], outline=GOLD, width=3)
c0 = CL / 2
cd.ellipse([c0 - 11, c0 - 11, c0 + 11, c0 + 11], fill=(30, 70, 66, 255), outline=GOLD, width=2)
cd.rectangle([c0 - 2.5, c0 - 8, c0 + 2.5, c0 + 8], fill=(250, 240, 210, 255)); cd.rectangle([c0 - 8, c0 - 2.5, c0 + 8, c0 + 2.5], fill=(250, 240, 210, 255))
x, y = UV(0, VC)
halo = Image.new('RGBA', out.size, (0, 0, 0, 0))
hr = 46 if NIVEL < 3 else 62
ImageDraw.Draw(halo).ellipse([x - hr, y - hr, x + hr, y + hr], fill=(120, 240, 210, 70 if NIVEL < 3 else 105))
out.alpha_composite(halo.filter(ImageFilter.GaussianBlur(16)))
paste(cl, x, y, CL, rot=0, dx=4, dy=5, sh_alpha=.5, blur=3)

# porta / degrau na frente do pavilhão
d = ImageDraw.Draw(out, 'RGBA')
step = [UV(-26, V1), UV(26, V1), UV(26, V1 + 13), UV(-26, V1 + 13)]
d.polygon(step, fill=(86, 80, 74, 255)); d.line(step + [step[0]], fill=GOLD_D, width=2)
d.line([UV(-20, V1 + 1), UV(20, V1 + 1)], fill=(70, 46, 28, 255), width=4)            # soleira de madeira

# ---------------- bacia de cura (stone_fire_pit com água) ----------------
BU, BV, BS = 0, 205, 94
pit = crop_alpha(Image.open(f'{RD}/stone_fire_pit.png').convert('RGBA'))
pit = grade(pit, 0.5, 0.85)
pw_ = pit.width; wat = Image.new('RGBA', pit.size, (0, 0, 0, 0))
wy, wx = np.mgrid[0:pit.height, 0:pit.width]
cxp, cyp = pit.width / 2, pit.height / 2; rr = np.hypot(wx - cxp, wy - cyp) / (pw_ / 2)
rad_w = 0.62
ang = np.arctan2(wy - cyp, wx - cxp)
edge_n = rad_w + 0.012 * np.sin(ang * 7) + 0.008 * np.sin(ang * 11 + 1)
inw = rr < edge_n
dep = np.clip(1 - rr / edge_n, 0, 1)
col = np.zeros(pit.size[::-1] + (4,), np.float32)
shallow = np.array([78, 160, 146]); deep = np.array([16, 66, 74])
col[..., :3] = shallow * (1 - dep[..., None]) + deep * dep[..., None]
rip = np.sin(rr * 46) * 0.5 + 0.5
col[..., :3] += rip[..., None] * 18 * (1 - dep[..., None] * 0.6)
spec = np.clip(1 - np.hypot(wx - cxp * 0.7, wy - cyp * 0.7) / (pw_ * 0.18), 0, 1) ** 2
col[..., :3] += spec[..., None] * 55
col[..., 3] = inw * 255 * np.clip((edge_n - rr) * 40, 0, 1)
wat = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGBA')
pit.alpha_composite(wat.filter(ImageFilter.GaussianBlur(0.8)))
x, y = UV(BU, BV)
if NIVEL >= 3:
    # anel de mármore negro com friso dourado em volta da bacia
    ring = Image.new('RGBA', out.size, (0, 0, 0, 0)); rd = ImageDraw.Draw(ring)
    R1 = BS / 2 + 9
    rd.ellipse([x - R1 + 5, y - R1 + 6, x + R1 + 5, y + R1 + 6], fill=(0, 0, 0, 110))
    out.alpha_composite(ring.filter(ImageFilter.GaussianBlur(5)))
    d = ImageDraw.Draw(out, 'RGBA')
    d.ellipse([x - R1, y - R1, x + R1, y + R1], fill=(26, 24, 28, 255), outline=GOLD, width=3)
    d.ellipse([x - R1 + 7, y - R1 + 7, x + R1 - 7, y + R1 - 7], outline=GOLD_D, width=2)
    for k in range(12):
        t = math.radians(k * 30 + 15); px_, py_ = x + (R1 - 4) * math.cos(t) * 0.86, y + (R1 - 4) * math.sin(t) * 0.86
        d.ellipse([px_ - 2.2, py_ - 2.2, px_ + 2.2, py_ + 2.2], fill=GOLD)
halo = Image.new('RGBA', out.size, (0, 0, 0, 0))
hr = 52 if NIVEL < 3 else 70
ImageDraw.Draw(halo).ellipse([x - hr, y - hr, x + hr, y + hr], fill=(110, 240, 210, 45 if NIVEL < 3 else 85))
out.alpha_composite(halo.filter(ImageFilter.GaussianBlur(20)))
paste(pit, x, y, BS, rot=0)
if NIVEL >= 3:
    gl2 = Image.new('RGBA', out.size, (0, 0, 0, 0))
    ImageDraw.Draw(gl2).ellipse([x - 22, y - 22, x + 22, y + 22], fill=(170, 255, 230, 90))
    out.alpha_composite(gl2.filter(ImageFilter.GaussianBlur(9)))

# ---------------- nível 3: candelabros dourados na entrada ----------------
LAMPS = [(-98, 160), (98, 160)]
if NIVEL >= 3:
    cand = crop_alpha(Image.open(f'{PR}/candelabro.png').convert('RGBA'))
    for u, v in LAMPS:
        x, y = UV(u, v)
        h_ = Image.new('RGBA', out.size, (0, 0, 0, 0))
        ImageDraw.Draw(h_).ellipse([x - 40, y - 40, x + 40, y + 40], fill=(255, 175, 80, 80))
        out.alpha_composite(h_.filter(ImageFilter.GaussianBlur(15)))
        paste_uv(cand, u, v, 40, dx=5, dy=6, blur=3)

# ---------------- bordas douradas do espaço ----------------
d = ImageDraw.Draw(out, 'RGBA')
d.line([P(ri + 0.0009, -half + i * 2 * half / 120) for i in range(121)], fill=(226, 184, 74, 170), width=2, joint='curve')
d.line([P(ri, -half + .2), P(ro, -half + .2)], fill=GOLD_D, width=3)
d.line([P(ri, half - .2), P(ro, half - .2)], fill=GOLD_D, width=3)

# ---------------- recorte pelo molde ----------------
m = Image.open(f'{PKG}/templates/middle_arc_mask.png').convert('L')
geo = np.asarray(Image.fromarray((inside * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)))
out.putalpha(Image.fromarray(np.minimum.reduce([np.asarray(out.split()[3]), np.asarray(m), geo])))
arr = np.asarray(out).copy(); arr[arr[..., 3] == 0] = 0
Image.fromarray(arr).save(OUT)

# ---------------- fx sugeridos (0-1 na arte) ----------------
def fxp(u, v): x, y = UV(u, v); return round(x / W, 3), round(y / H, 3)
fx = []
x, y = fxp(0, VC); fx.append({"type": "glow", "x": x, "y": y, "color": "#7fe0c8", "radius": 0.07})
x, y = fxp(BU, BV); fx.append({"type": "glow", "x": x, "y": y, "color": "#6ff0d0", "radius": 0.08})
fx.append({"type": "sparks", "x": x, "y": y, "color": "#b8fff0", "minLevel": 3})
for u, v in LAMPS:
    x, y = fxp(u, v); fx.append({"type": "glow", "x": x, "y": y, "color": "#ffb347", "radius": 0.05, "minLevel": 3})
json.dump(fx, open(OUT.replace('.png', '.fx.json'), 'w'), indent=1)
print('ok', W, H, OUT)
