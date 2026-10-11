# Arquivo (archive) — arte do anel intermediário v4 (768x311), níveis 1..3
# uso: python3 -I compose_arquivo.py <nivel> <saida.png> [fx.json]
# Ajuste os caminhos abaixo antes de rodar.
import json, math, sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageOps

NIVEL = int(sys.argv[1]); OUT = sys.argv[2]; FXOUT = sys.argv[3] if len(sys.argv) > 3 else None
PKG = '/home/claude/axis/axis-art-pipeline-v2'
AS = '/home/claude/axis/archive/assets'
RD = '/home/claude/axis/archive/renders'
STONE = os.environ.get('STONE', f'{AS}/stonewall_23/stonewall_23-2K/stonewall_23_basecolor-2K.png')

L = json.load(open(f'{PKG}/layout.v4.json'))
arc = next(x for x in L['slots'] if x['type'] == 'middle')['arc']
ri, ro = arc['innerRadius'], arc['outerRadius']; half = (arc['endAngle'] - arc['startAngle']) / 2
w = 2 * ro * math.sin(math.radians(half)); h = ro - ri * math.cos(math.radians(half))
W0 = 768; H0 = round(W0 * h / w)
SS = 2                                   # supersampling: compõe em 2x e reduz no fim
W, H = W0 * SS, H0 * SS; sc = W / w
CX, CY = W / 2, ro * sc
def P(r, a): return (CX + r * sc * math.sin(math.radians(a)), CY - r * sc * math.cos(math.radians(a)))
def P0(r, a):                            # coordenada normalizada (0-1) na arte final
    x, y = P(r, a); return round(x / W, 3), round(y / H, 3)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / sc
A = np.degrees(np.arctan2(xx - CX, CY - yy))
U = np.radians(A) * ro * sc              # px ao longo do arco
V = (ro - R) * sc                        # px a partir da borda externa
rng = np.random.default_rng(11)
GOLD = (226, 184, 74, 255); GOLD_D = (150, 112, 40, 255)
GOLDf = np.array([226, 184, 74]) / 255

def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
def polar_tex(tex, scale_px, uu=None, vv=None):
    th, tw = tex.shape[:2]; uu = U if uu is None else uu; vv = V if vv is None else vv
    return tex[((vv / scale_px * th) % th).astype(int) % th, ((uu / scale_px * tw) % tw).astype(int) % tw]
def smooth(x, a, b): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def crop_alpha(im): return im.crop(im.split()[3].getbbox())

inside = (R >= ri) & (R <= ro) & (np.abs(A) <= half)
r_split = 0.2465                         # frente: pátio | fundo: galpão do arquivo
ridge = (r_split + ro) / 2
roof_half = half - 0.9

# ---------------- pátio de pedra
if os.path.exists(STONE):
    stone_t = load(STONE)
else:                                    # rascunho: sem a Stone Wall 23, usa pedra do exemplo do laboratório
    print('AVISO: Stone Wall 23 ausente, usando pedra provisória')
    stone_t = load(f'{PKG}/exemplos/arcane_lab.outer.png')[300:420, 230:330]
st = polar_tex(stone_t, 300 * SS); g = st.mean(-1, keepdims=True)
st = g * np.array([1.0, 0.93, 0.85]) * 0.55 + st * 0.15
img = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
yard = inside & (R < r_split + 0.002)
img[yard] = st[yard]; alpha[yard] = 1

# ---------------- telhado de ardósia em duas águas
roof_t = load(f'{AS}/RoofingTiles013A/RoofingTiles013A_2K-JPG_Color.jpg')[:900, :900]
roof_t = np.repeat(roof_t.mean(-1, keepdims=True), 3, -1)
roof_t = np.clip((roof_t - roof_t.mean()) * 2.2 + roof_t.mean(), 0, 1)
roof = (R >= r_split) & (R <= ro - 0.0015) & (np.abs(A) <= roof_half)
rt = polar_tex(roof_t, 300 * SS) * 1.55 * np.array([0.95, 0.97, 1.08])
slope = np.where(R > ridge, 0.62, 1.0)[..., None]
edge = np.clip(np.abs(R - ridge) / (ro - ridge), 0, 1)[..., None]
rt = rt * slope * (1.15 - 0.45 * edge)
img[roof] = rt[roof]; alpha[roof] = 1

# ---------------- claraboias (lanternins de vidro) mostrando as estantes por dentro
SKY = [(-11.6, -4.4), (4.4, 11.6)]
sk_r0, sk_r1 = r_split + 0.0045, ro - 0.0045
row = load(f'{RD}/livros_fileira.png')
rowA = np.asarray(Image.open(f'{RD}/livros_fileira.png').convert('RGBA')).astype(np.float32) / 255
rth, rtw = row.shape[:2]
wood = load(f'{AS}/WoodenTable_01_2k.blend/textures/WoodenTable_01_diff_2k.jpg')
glow_k = {1: 0.75, 2: 0.9, 3: 1.1}[NIVEL]
for a0, a1 in SKY:
    m = (R >= sk_r0) & (R <= sk_r1) & (A >= a0) & (A <= a1)
    vv = (sk_r1 - R) * sc                      # px a partir do topo da claraboia
    RH = 15 * SS; BOARD = 3 * SS; AISLE = 10 * SS; PER = 2 * RH + BOARD + AISLE
    k = vv % PER; shelf = (vv // PER).astype(int)
    off = (shelf * 137.0) % 997
    Lrow = RH * rtw / rth
    tu = (((U + off) % Lrow) / Lrow * rtw).astype(int) % rtw
    inA = k < RH; inB = (k >= RH + BOARD) & (k < 2 * RH + BOARD)
    tvA = (k / RH * rth).astype(int).clip(0, rth - 1)
    tvB = ((2 * RH + BOARD - k) / RH * rth).astype(int).clip(0, rth - 1)
    books = np.where(inA[..., None], row[tvA, tu], row[tvB, tu])
    books_a = np.where(inA, rowA[tvA, tu, 3], rowA[tvB, tu, 3])
    shelfwood = polar_tex(wood, 200 * SS) * 0.55
    floor = np.array([0.16, 0.11, 0.07]) * (0.7 + 0.3 * np.sin(U * 0.05))[..., None]
    # variação por livro: topo das páginas envelhecido + couro de cores diferentes
    bid = ((U + off) // (RH * 0.33)).astype(np.int64) + shelf * 7919 + inB * 31
    hsh = (bid * 2654435761 % 4294967296) / 4294967296.0
    leather = np.stack([0.28 + 0.25 * hsh, 0.12 + 0.10 * ((hsh * 7) % 1), 0.08 + 0.06 * ((hsh * 13) % 1)], -1)
    books = books * np.array([0.92, 0.80, 0.60]) * (0.55 + 0.4 * ((hsh * 3) % 1))[..., None]
    books = books * 0.6 + leather * 0.4
    inside_c = np.where((inA | inB)[..., None], books * books_a[..., None] + shelfwood * (1 - books_a[..., None]), shelfwood)
    inside_c = np.where((k >= 2 * RH + BOARD)[..., None], floor, inside_c)
    # luz âmbar vinda de baixo, mais forte no meio da claraboia
    am = (a0 + a1) / 2
    lamp = np.exp(-((A - am) / 3.2) ** 2) * np.exp(-((R - (sk_r0 + sk_r1) / 2) / 0.012) ** 2)
    warm = np.array([1.0, 0.72, 0.38])
    c = inside_c * (0.45 + 0.75 * lamp[..., None] * glow_k) * (0.65 + 0.35 * warm)
    c += warm * lamp[..., None] * 0.12 * glow_k
    # vidro: leve azul-acinzentado + reflexos diagonais
    refl = smooth(np.sin((U * 0.6 + V) * 0.045 / SS * 2), 0.82, 1.0) * 0.18
    c = c * 0.86 + np.array([0.55, 0.62, 0.7]) * 0.07 + refl[..., None]
    img[m] = c[m]; alpha[m] = 1

out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
d = ImageDraw.Draw(out, 'RGBA')
def arcline(dd, r, a1, a2, col, wd, n=120):
    dd.line([P(r, a1 + (a2 - a1) * i / n) for i in range(n + 1)], fill=col, width=wd * SS, joint='curve')
def radline(dd, a, r1, r2, col, wd): dd.line([P(r1, a), P(r2, a)], fill=col, width=wd * SS)

# sombra do beiral sobre o pátio
sh = Image.new('RGBA', out.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
sd.polygon([P(r_split, -roof_half + i * 2 * roof_half / 80) for i in range(81)] +
           [P(r_split - 0.0055, roof_half - i * 2 * roof_half / 80) for i in range(81)], fill=(0, 0, 0, 120))
out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6 * SS)))
d = ImageDraw.Draw(out, 'RGBA')

# cumeeira dourada (interrompida pelas claraboias) e contornos
segs = [(-roof_half, SKY[0][0]), (SKY[0][1], SKY[1][0]), (SKY[1][1], roof_half)]
for s0, s1 in segs: arcline(d, ridge, s0, s1, GOLD, 4)
arcline(d, r_split, -roof_half, roof_half, GOLD_D, 2)
radline(d, -roof_half, r_split, ro, GOLD_D, 2); radline(d, roof_half, r_split, ro, GOLD_D, 2)
# molduras das claraboias: sombra, caixilho e montantes
FR = GOLD if NIVEL >= 3 else GOLD_D
for a0, a1 in SKY:
    shd = Image.new('RGBA', out.size, (0, 0, 0, 0)); s2 = ImageDraw.Draw(shd)
    s2.line([P(sk_r0 - 0.0008, a0 + (a1 - a0) * i / 40) for i in range(41)], fill=(0, 0, 0, 150), width=5 * SS)
    out.alpha_composite(shd.filter(ImageFilter.GaussianBlur(3 * SS))); d = ImageDraw.Draw(out, 'RGBA')
    n = 4 if NIVEL < 3 else 6
    for i in range(1, n):
        radline(d, a0 + (a1 - a0) * i / n, sk_r0, sk_r1, (60, 45, 22, 255) if NIVEL < 3 else GOLD_D, 2)
    arcline(d, (sk_r0 + sk_r1) / 2, a0, a1, (60, 45, 22, 255) if NIVEL < 3 else GOLD_D, 2, 40)
    for r_ in (sk_r0, sk_r1): arcline(d, r_, a0, a1, FR, 3, 40)
    radline(d, a0, sk_r0, sk_r1, FR, 3); radline(d, a1, sk_r0, sk_r1, FR, 3)
arcline(d, ri + 0.0012, -half + .4, half - .4, (226, 184, 74, 170), 2)       # limite frontal

def paste(im, r, a, size, rot_extra=0, shadow=True, sh_off=(6, 7), sh_blur=5, sh_k=0.6):
    global out
    im = im.copy(); s = size * SS / max(im.size)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    im = im.rotate(-a + rot_extra, expand=True, resample=Image.BICUBIC)
    x, y = P(r, a)
    if shadow:
        s2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); s2.putalpha(im.split()[3].point(lambda v: int(v * sh_k)))
        s2 = s2.filter(ImageFilter.GaussianBlur(sh_blur * SS))
        out.alpha_composite(s2, (int(x - im.width / 2 + sh_off[0] * SS), int(y - im.height / 2 + sh_off[1] * SS)))
    out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))

# ---------------- selo dourado da Axis no telhado (nível 3)
if NIVEL >= 3:
    sz = 64 * SS; seal = Image.new('RGBA', (sz, sz), (0, 0, 0, 0)); sd = ImageDraw.Draw(seal)
    c = sz / 2
    sd.ellipse([2, 2, sz - 3, sz - 3], fill=(22, 18, 16, 255), outline=GOLD, width=3 * SS)
    sd.ellipse([9 * SS, 9 * SS, sz - 9 * SS, sz - 9 * SS], outline=GOLD_D, width=SS)
    star = []
    for i in range(16):
        rr = (c - 12 * SS) if i % 2 == 0 else (c - 22 * SS)
        an = math.radians(i * 22.5); star.append((c + rr * math.sin(an), c - rr * math.cos(an)))
    sd.polygon(star, fill=GOLD, outline=GOLD_D)
    gates = [(155, 90, 255), (90, 200, 110), (240, 240, 240), (255, 150, 50), (70, 140, 255), (30, 30, 34), (220, 50, 50), (250, 215, 60)]
    for i, col in enumerate(gates):                                # 8 portões, a partir do Norte
        an = math.radians(i * 45); x, y = c + (c - 6 * SS) * math.sin(an), c - (c - 6 * SS) * math.cos(an)
        sd.ellipse([x - 3 * SS, y - 3 * SS, x + 3 * SS, y + 3 * SS], fill=col + (255,), outline=GOLD_D)
    sd.ellipse([c - 6 * SS, c - 6 * SS, c + 6 * SS, c + 6 * SS], fill=(22, 18, 16, 255), outline=GOLD_D, width=SS)
    out.alpha_composite(seal.rotate(0), (int(P(ridge, 0)[0] - sz / 2), int(P(ridge, 0)[1] - sz / 2)))

# ---------------- peças feitas por código
paper_t = Image.open(f'{AS}/Paper005_2K-JPG/Paper005_2K-JPG_Color.jpg').convert('RGB')
def parchment(wd, ht, seed=0, lines=True, tone=(1.0, 0.93, 0.78)):
    r2 = np.random.default_rng(seed)
    x0, y0 = r2.integers(0, 1500, 2)
    t = paper_t.crop((x0, y0, x0 + 400, y0 + 400)).resize((wd, ht))
    t = ImageOps.colorize(ImageOps.autocontrast(t.convert('L'), cutoff=2), (150, 128, 92), (246, 234, 205)).convert('RGBA')
    t = Image.blend(t, Image.new('RGBA', t.size, (int(230 * tone[0]), int(214 * tone[1]), int(176 * tone[2]), 255)), 0.35)
    dd = ImageDraw.Draw(t)
    if lines:
        y = int(ht * 0.14)
        while y < ht * 0.88:
            l = r2.uniform(0.55, 0.85) * wd
            dd.line([(wd * 0.12, y), (wd * 0.12 + l * 0.85, y)], fill=(70, 55, 40, 150), width=max(1, SS))
            y += max(3, int(3.2 * SS))
    dd.rectangle([0, 0, wd - 1, ht - 1], outline=(140, 115, 80, 255), width=1)
    return t

def open_book(wd=74, ht=52, seed=3):
    wd *= SS; ht *= SS
    im = Image.new('RGBA', (wd, ht), (0, 0, 0, 0)); dd = ImageDraw.Draw(im)
    dd.rounded_rectangle([0, 0, wd - 1, ht - 1], radius=3 * SS, fill=(70, 22, 16, 255), outline=(40, 12, 8, 255), width=SS)
    pw = (wd - 8 * SS) // 2
    for i, x in enumerate((4 * SS, 4 * SS + pw)):
        pg = parchment(pw, ht - 8 * SS, seed + i)
        g = np.linspace(0.78, 1.0, pw) if i == 0 else np.linspace(1.0, 0.78, pw)     # curvatura das páginas
        arr = np.asarray(pg).astype(np.float32); arr[..., :3] *= g[None, :, None]
        im.alpha_composite(Image.fromarray(arr.clip(0, 255).astype(np.uint8)), (x, 4 * SS))
    dd.line([(wd // 2, 3 * SS), (wd // 2, ht - 3 * SS)], fill=(90, 70, 45, 255), width=SS)
    dd.line([(wd // 2 - 2 * SS, ht - 2 * SS), (wd // 2 - 2 * SS, ht + 6 * SS)], fill=(160, 30, 30, 255), width=2 * SS)  # fitilho
    dd.rectangle([3 * SS, 1 * SS, wd - 4 * SS, 2 * SS], fill=GOLD_D)
    return im

def scroll(length=58, dia=11, seed=0, ribbon=(150, 30, 30)):
    Lp, Dp = length * SS, dia * SS
    t = np.asarray(parchment(Lp, Dp, seed, lines=False)).astype(np.float32)
    y = np.linspace(-1, 1, Dp); shade = (0.55 + 0.6 * np.sqrt(np.clip(1 - y ** 2, 0, 1)))  # cilindro
    shade = shade * (1 + 0.25 * np.exp(-((y + 0.35) / 0.25) ** 2))
    t[..., :3] *= shade[:, None, None]; t[..., 3] = 255
    im = Image.fromarray(t.clip(0, 255).astype(np.uint8)); dd = ImageDraw.Draw(im)
    rx = int(Lp * (0.38 + 0.2 * np.random.default_rng(seed).random()))
    dd.rectangle([rx, 0, rx + 3 * SS, Dp], fill=ribbon + (255,))
    for x in (0, Lp - 2 * SS): dd.rectangle([x, 0, x + 2 * SS, Dp], fill=(110, 80, 50, 255))   # pontas
    return im

def scroll_end(dia, seed):                     # rolo visto pela ponta (dentro dos nichos)
    D = dia * SS; im = Image.new('RGBA', (D, D), (0, 0, 0, 0)); dd = ImageDraw.Draw(im)
    tone = np.random.default_rng(seed).uniform(0.85, 1.05)
    base = tuple(int(v * tone) for v in (226, 208, 168))
    dd.ellipse([0, 0, D - 1, D - 1], fill=base + (255,), outline=(120, 95, 60, 255), width=SS)
    for k in range(3):
        rr = D / 2 - (k + 1.3) * D / 9
        if rr > 1: dd.ellipse([D / 2 - rr, D / 2 - rr, D / 2 + rr, D / 2 + rr], outline=(150, 125, 85, 255), width=1)
    dd.ellipse([D / 2 - SS, D / 2 - SS, D / 2 + SS, D / 2 + SS], fill=(90, 65, 40, 255))
    return im

def scroll_rack(cols=7, rows=3, cell=13):
    C = cell * SS; fw = 3 * SS
    wd, ht = cols * C + 2 * fw, rows * C + 2 * fw
    wt = Image.fromarray((wood[200:600, 200:600] * 255).astype(np.uint8)).resize((wd, ht))
    im = ImageEnhance.Brightness(wt).enhance(0.75).convert('RGBA'); dd = ImageDraw.Draw(im)
    r2 = np.random.default_rng(5)
    for i in range(cols):
        for j in range(rows):
            x, y = fw + i * C, fw + j * C
            dd.rectangle([x + SS, y + SS, x + C - SS, y + C - SS], fill=(25, 17, 11, 255))
            n = r2.integers(0, 4)
            if n == 0: continue
            if n == 3:                                  # nicho cheio: três rolos menores
                for (ox, oy) in ((0.3, 0.32), (0.7, 0.32), (0.5, 0.7)):
                    e = scroll_end(5, i * 9 + j); im.alpha_composite(e, (int(x + C * ox - e.width / 2), int(y + C * oy - e.height / 2)))
            else:
                e = scroll_end(10, i * 7 + j); im.alpha_composite(e, (int(x + C / 2 - e.width / 2), int(y + C / 2 - e.height / 2)))
                if r2.random() < 0.35: dd.rectangle([x + C / 2 - SS, y + 2 * SS, x + C / 2 + SS, y + C - 2 * SS], fill=(160, 30, 30, 255))
    dd.rectangle([0, 0, wd - 1, ht - 1], outline=(60, 38, 20, 255), width=SS)
    return im

def loose_papers(n=3, seed=1):
    S0 = 60 * SS; im = Image.new('RGBA', (S0, S0), (0, 0, 0, 0)); r2 = np.random.default_rng(seed)
    for k in range(n):
        p = parchment(26 * SS, 34 * SS, seed * 10 + k).rotate(r2.uniform(-35, 35), expand=True, resample=Image.BICUBIC)
        im.alpha_composite(p, (int(S0 / 2 - p.width / 2 + r2.uniform(-8, 8) * SS), int(S0 / 2 - p.height / 2 + r2.uniform(-8, 8) * SS)))
    return crop_alpha(im)

# ---------------- renders
def rd(n): return crop_alpha(Image.open(f'{RD}/{n}.png').convert('RGBA'))
mesa, bau, gav, lamp = ImageEnhance.Color(ImageEnhance.Brightness(rd('mesa')).enhance(0.78)).enhance(0.7), rd('bau'), rd('gaveteiro'), rd('lamparina')
cas2, cas3 = rd('castical2'), rd('castical3')
pilhas = [rd(f'pilha{i}') for i in (1, 2, 3)]
caixote = crop_alpha(Image.open(f'{PKG}/renders/caixote.png').convert('RGBA'))

def gold_fittings(im):                          # ferragens escuras do baú viram ouro
    a = np.asarray(im).astype(np.float32) / 255; rgb = a[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1); sat = (mx - mn) / (mx + 1e-4); lum = rgb.mean(-1)
    m = smooth(0.32 - sat, 0, 0.12) * (a[..., 3] > 0)
    goldc = np.clip(lum[..., None] * 2.1, 0, 1.25) * GOLDf
    rgb = rgb * (1 - m[..., None]) + goldc * m[..., None]
    return Image.fromarray((np.dstack([rgb.clip(0, 1), a[..., 3]]) * 255).astype(np.uint8))
def amber_shade(im):                            # cúpula floral -> vidro âmbar
    a = np.asarray(im).astype(np.float32) / 255; rgb = a[..., :3]; lum = rgb.mean(-1)
    m = smooth(lum, 0.45, 0.65)[..., None]
    amber = (0.6 + 0.7 * lum[..., None]) * np.array([1.0, 0.66, 0.26])
    rgb = rgb * (1 - m) + amber * m
    return Image.fromarray((np.dstack([rgb.clip(0, 1), a[..., 3]]) * 255).astype(np.uint8))
def index_cards(im):                            # fichas de papel dentro da gaveta aberta (parte de baixo do render)
    im = im.copy(); wd, ht = im.size
    x0, x1 = int(wd * 0.42), int(wd * 0.58)
    dd = ImageDraw.Draw(im)
    y = int(ht * 0.66)
    while y < ht * 0.95:
        dd.line([(x0, y), (x1, y)], fill=(225, 210, 175, 255), width=max(2, ht // 120))
        dd.line([(x0, y + 2), (x1, y + 2)], fill=(120, 95, 60, 255), width=1)
        y += max(5, ht // 40)
    return im

yard_r = (ri + r_split) / 2
fx = []
# mesa de catalogação no centro
paste(mesa, yard_r + 0.0005, 0, 150, sh_off=(7, 8), sh_blur=6)
paste(open_book(), yard_r + 0.001, -1.4, 58, rot_extra=3, shadow=True, sh_off=(2, 2), sh_blur=2, sh_k=0.5)
paste(loose_papers(2, 4), yard_r - 0.003, 1.5, 34, shadow=True, sh_off=(2, 2), sh_blur=2, sh_k=0.4)
if NIVEL >= 2:
    paste(amber_shade(lamp), yard_r + 0.003, 2.85, 26, sh_off=(4, 5), sh_blur=3)
    fx.append({'type': 'glow', 'pos': (yard_r + 0.003, 2.85), 'color': '#ffb347', 'radius': 0.04, 'minLevel': 2})
else:
    paste(cas2, yard_r + 0.003, 2.6, 34, rot_extra=80, sh_off=(4, 5), sh_blur=3)
    fx.append({'type': 'glow', 'pos': (yard_r + 0.003, 2.6), 'color': '#ffcf7a', 'radius': 0.035, 'maxLevel': 1})

# baú dos registros (esquerda)
paste(gold_fittings(bau) if NIVEL >= 3 else bau, yard_r + 0.0015, -12.0, 84, rot_extra=-3)
# caixote com pilha de livros (direita)
paste(caixote, yard_r + 0.0015, 12.2, 70, rot_extra=5)
paste(pilhas[2], yard_r + 0.002, 12.0, 40, rot_extra=-10, sh_off=(3, 4), sh_blur=3)
paste(scroll(46, 10, 2), yard_r - 0.0075, 13.6, 46, rot_extra=-70, sh_off=(3, 4), sh_blur=3)

if NIVEL == 1:
    paste(pilhas[0], yard_r + 0.002, -6.4, 44, rot_extra=8)
    paste(pilhas[1], yard_r - 0.004, 7.0, 42, rot_extra=-12)
    paste(scroll(52, 11, 5), yard_r + 0.006, 7.3, 52, rot_extra=12, sh_off=(3, 4), sh_blur=3)
else:
    # nível 2+: armário de pergaminhos e gaveteiro-fichário
    paste(scroll_rack(), yard_r + 0.0035, -6.6, 92, sh_off=(6, 7))
    paste(index_cards(gav), yard_r + 0.0005, 7.2, 64)
    paste(pilhas[0], ri + 0.0055, -14.2, 36, rot_extra=8, sh_off=(4, 5), sh_blur=4)
    paste(scroll(48, 10, 7, (40, 80, 150)), ri + 0.0045, -9.6, 48, rot_extra=-15, sh_off=(3, 4), sh_blur=3)
    paste(pilhas[1], ri + 0.0055, 9.9, 34, rot_extra=-12, sh_off=(4, 5), sh_blur=4)
if NIVEL >= 3:
    paste(cas3, ri + 0.0075, 14.7, 40, sh_off=(5, 6), sh_blur=4)
    fx.append({'type': 'glow', 'pos': (ri + 0.0075, 14.7), 'color': '#ffcf7a', 'radius': 0.045, 'minLevel': 3})
    fx.append({'type': 'glow', 'pos': (ridge, 0), 'color': '#e2b84a', 'radius': 0.05, 'minLevel': 3})
    fx.append({'type': 'sparks', 'pos': (ridge, 0), 'color': '#ffe08a', 'minLevel': 3})
for a0, a1 in SKY:
    fx.append({'type': 'glow', 'pos': ((sk_r0 + sk_r1) / 2, (a0 + a1) / 2), 'color': '#ffc36b', 'radius': 0.085})

# ---------------- reduzir e recortar pelo molde
out = out.resize((W0, H0), Image.LANCZOS)
m = Image.open(f'{PKG}/templates/middle_arc_mask.png').convert('L')
out.putalpha(Image.fromarray(np.minimum(np.asarray(out.split()[3]), np.asarray(m))))
out.save(OUT)
if FXOUT:
    res = []
    for f in fx:
        x, y = P0(*f.pop('pos')); res.append({'type': f.pop('type'), 'x': x, 'y': y, **f})
    json.dump(res, open(FXOUT, 'w'), indent=1)
print('ok', NIVEL, out.size)
