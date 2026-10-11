import json, math, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
SP = sys.argv[1]; F = f'{SP}/forge'; T = f'{SP}/tex'
L = json.load(open('/mnt/user-data/outputs/layout.json'))
arc = next(x for x in L['slots'] if x['type'] == 'outer')['arc']
ri, ro = arc['innerRadius'], arc['outerRadius']; half = (arc['endAngle'] - arc['startAngle']) / 2
w = 2 * ro * math.sin(math.radians(half)); h = ro - ri * math.cos(math.radians(half))
W = 768; H = round(W * h / w); sc = W / w
CX, CY = W / 2, ro * sc            # centro do círculo do mapa, em px da arte (abaixo da imagem)
def P(r, a):
    return (CX + r * sc * math.sin(math.radians(a)), CY - r * sc * math.cos(math.radians(a)))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / sc
A = np.degrees(np.arctan2(xx - CX, CY - yy))
def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
def polar_tex(tex, scale_px, r0):
    th, tw = tex.shape[:2]
    u = (np.radians(A) * ro * sc / scale_px * tw) % tw
    v = ((ro - R) * sc / scale_px * th) % th
    return tex[v.astype(int) % th, u.astype(int) % tw]

roof_t = load(f'{F}/roof/RoofingTiles013A_2K-JPG_Color.jpg')[:900, :900]
roof_t = np.repeat(roof_t.mean(-1, keepdims=True), 3, -1)
roof_t = np.clip((roof_t - roof_t.mean()) * 2.2 + roof_t.mean(), 0, 1)
stone_t = load(f'{T}/wall/stonewall_23-2K/stonewall_23_basecolor-2K.png')
img = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)

r_split = ro - 0.046          # fundo: oficina coberta | frente: pátio
roof_half = half - 1.0
# --- pátio (piso de pedra)
yard = (R >= ri) & (R < r_split + 0.002) & (np.abs(A) <= half)
st = polar_tex(stone_t, 300, 0); g = st.mean(-1, keepdims=True)
st = (g * np.array([1.0, 0.93, 0.85]) * 0.55 + st * 0.15)
img[yard] = st[yard]; alpha[yard] = 1
# --- telhado
roof = (R >= r_split) & (R <= ro - 0.002) & (np.abs(A) <= roof_half)
rt = polar_tex(roof_t, 330, 0) * 1.55 * np.array([0.95, 0.97, 1.08])
ridge = (r_split + ro) / 2
slope = np.where(R > ridge, 0.62, 1.0)[..., None]       # água de trás mais escura
edge = np.clip(np.abs(R - ridge) / (ro - ridge), 0, 1)[..., None]
rt = rt * slope * (1.15 - 0.45 * edge)
img[roof] = rt[roof]; alpha[roof] = 1

out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
d = ImageDraw.Draw(out, 'RGBA')
GOLD = (226, 184, 74, 255); GOLD_D = (150, 112, 40, 255)
def arcline(r, a1, a2, col, wd):
    d.line([P(r, a1 + (a2 - a1) * i / 80) for i in range(81)], fill=col, width=wd, joint='curve')
# sombra do beiral sobre o pátio
sh = Image.new('RGBA', out.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
sd.polygon([P(r_split, -roof_half + i * 2 * roof_half / 60) for i in range(61)] +
           [P(r_split - 0.006, roof_half - i * 2 * roof_half / 60) for i in range(61)], fill=(0, 0, 0, 120))
out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6)))
d = ImageDraw.Draw(out, 'RGBA')
arcline(ridge, -roof_half, roof_half, GOLD, 5)                    # cumeeira dourada
arcline(r_split, -roof_half, roof_half, GOLD_D, 3)                # beiral
d.line([P(r_split, -roof_half), P(ro, -roof_half)], fill=GOLD_D, width=3)
d.line([P(r_split, roof_half), P(ro, roof_half)], fill=GOLD_D, width=3)
arcline(ri + 0.002, -half + .3, half - .3, (226, 184, 74, 160), 2)  # limite do pátio

def paste(im, r, a, size, rot_extra=0, shadow=True):
    global out
    im = im.copy(); s = size / max(im.size); im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    im = im.rotate(-a + rot_extra, expand=True, resample=Image.BICUBIC)
    x, y = P(r, a)
    if shadow:
        s2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); s2.putalpha(im.split()[3].point(lambda v: int(v * .6)))
        s2 = s2.filter(ImageFilter.GaussianBlur(5)); out.alpha_composite(s2, (int(x - im.width / 2 + 6), int(y - im.height / 2 + 7)))
    out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))

def crop_alpha(im):
    return im.crop(im.split()[3].getbbox())

# --- chaminé de pedra com brilho
ch = 96
chim = Image.new('RGBA', (ch, ch), (0, 0, 0, 0)); cd = ImageDraw.Draw(chim)
stone = Image.open(f'{T}/wall/stonewall_23-2K/stonewall_23_basecolor-2K.png').convert('L').crop((0, 0, 400, 400)).resize((ch, ch))
stone = ImageEnhance.Brightness(stone.convert('RGB')).enhance(0.7).convert('RGBA'); chim.paste(stone, (0, 0))
cd.rectangle([0, 0, ch - 1, ch - 1], outline=GOLD_D, width=3)
cd.rectangle([18, 18, ch - 19, ch - 19], fill=(20, 12, 10, 255))
glow = Image.new('RGBA', (ch, ch), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
gd.ellipse([14, 14, ch - 14, ch - 14], fill=(255, 120, 30, 230)); glow = glow.filter(ImageFilter.GaussianBlur(7))
chim.alpha_composite(glow)
spill = Image.new('RGBA', out.size, (0, 0, 0, 0)); x, y = P(ridge + 0.008, -4.6)
ImageDraw.Draw(spill).ellipse([x - 90, y - 90, x + 90, y + 90], fill=(255, 120, 30, 70)); out.alpha_composite(spill.filter(ImageFilter.GaussianBlur(30)))
paste(chim, ridge + 0.008, -4.6, ch)

# --- objetos do pátio
barrels = Image.open(f'{F}/barrels.png').convert('RGBA')
b1 = crop_alpha(barrels.crop((110, 60, 225, 175))); b2 = crop_alpha(barrels.crop((370, 60, 480, 175)))
crate = crop_alpha(Image.open(f'{F}/crate.png').convert('RGBA'))
yard_r = (ri + r_split) / 2
paste(crate, yard_r + 0.002, -6.3, 112, rot_extra=4)
paste(b1, yard_r + 0.007, 5.4, 60); paste(b2, yard_r - 0.008, 6.8, 56)

# braseiro/fornalha: tigela de metal com carvões em brasa
bz = 112
braz = Image.new('RGBA', (bz, bz), (0, 0, 0, 0)); bd = ImageDraw.Draw(braz)
metal = Image.open(f'{F}/brazier/Brazier_3_basecolor-2K.png').convert('RGB').crop((300, 300, 900, 900)).resize((bz, bz))
mask = Image.new('L', (bz, bz), 0); ImageDraw.Draw(mask).ellipse([2, 2, bz - 3, bz - 3], fill=255)
braz.paste(ImageEnhance.Brightness(metal).enhance(0.8), (0, 0), mask)
bd.ellipse([2, 2, bz - 3, bz - 3], outline=(40, 30, 25, 255), width=4)
rng = np.random.default_rng(3)
coal = Image.new('RGBA', (bz, bz), (0, 0, 0, 0)); cdd = ImageDraw.Draw(coal)
cdd.ellipse([14, 14, bz - 15, bz - 15], fill=(30, 18, 14, 255))
for _ in range(70):
    x, y = rng.uniform(18, bz - 18, 2); r = rng.uniform(2, 5)
    if math.hypot(x - bz / 2, y - bz / 2) < bz / 2 - 18:
        c = rng.choice([(255, 140, 40), (255, 90, 20), (255, 200, 90), (60, 30, 20)])
        cdd.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(v) for v in c) + (255,))
braz.alpha_composite(coal)
hal = Image.new('RGBA', (bz, bz), (0, 0, 0, 0)); ImageDraw.Draw(hal).ellipse([20, 20, bz - 20, bz - 20], fill=(255, 130, 40, 150))
braz.alpha_composite(hal.filter(ImageFilter.GaussianBlur(8)))
paste(braz, yard_r, -1.6, bz)

# bigorna (vista de cima): corpo + chifre, ferro escuro
an = Image.new('RGBA', (120, 60), (0, 0, 0, 0)); ad = ImageDraw.Draw(an)
ad.polygon([(8, 14), (70, 14), (112, 30), (70, 46), (8, 46)], fill=(52, 54, 60, 255), outline=(20, 20, 24, 255))
ad.rectangle([14, 20, 64, 40], fill=(92, 96, 104, 255))           # face polida
ad.line([(16, 22), (60, 22)], fill=(150, 155, 165, 255), width=2)  # brilho
ad.rectangle([22, 4, 52, 14], fill=(40, 40, 46, 255)); ad.rectangle([22, 46, 52, 56], fill=(40, 40, 46, 255))  # base
paste(an, yard_r + 0.003, 2.2, 116, rot_extra=0)
# faíscas
d = ImageDraw.Draw(out, 'RGBA')
for _ in range(22):
    a = 2.2 + rng.uniform(-2.2, 2.2); r = yard_r + 0.003 + rng.uniform(-0.01, 0.01)
    x, y = P(r, a); s = rng.uniform(1, 2.6)
    d.ellipse([x - s, y - s, x + s, y + s], fill=(255, rng.integers(150, 230), 60, 230))

# máscara final do arco
m = Image.open('/mnt/user-data/outputs/art-templates/outer_arc_mask.png').convert('L')
a_ = Image.fromarray(np.minimum(np.asarray(out.split()[3]), np.asarray(m)))
out.putalpha(a_)
out.save(f'{SP}/forge_outer.png')

# ---- colocar no mapa (prévia 1600px) em dois slots
base = Image.open(f'{SP}/prism.jpg').convert('RGBA'); S = 1600
k = S / sc
art = out.resize((round(W * k), round(H * k)), Image.LANCZOS)
cx_a, cy_a = CX * k, CY * k
for sid in ('outer_1', 'outer_7', 'outer_13'):
    sl = next(x for x in L['slots'] if x['id'] == sid); ang = sl['angle']
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.alpha_composite(art, (int(S / 2 - cx_a), int(S / 2 - cy_a)))
    layer = layer.rotate(-ang, center=(S / 2, S / 2), resample=Image.BICUBIC)
    base.alpha_composite(layer)
base.convert('RGB').save(f'{SP}/forge_map.jpg', quality=92)
print('ok', W, H)
