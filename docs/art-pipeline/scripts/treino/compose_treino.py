"""Campo de Treinamento (training_hall) - arte outer, 3 níveis, só treino físico.
Uso: python3 -I compose_arena.py <pasta_pipeline> <renders_arena> <renders_taverna> <pasta_texturas> <pasta_saida>
  renders_arena: antique_estoc_r90, antique_katana_01_r-90, wooden_axe_03_flat, kite_shield_r-90, book_08,
                 chalk_rm90, chemistry_set, brass_candleholders, gothic_statue (render2.py)
  renders_taverna: wine_barrel_01, wooden_lantern_01, wooden_stool_01
  pasta_texturas: dirt_diff_2k.jpg, floor_tiles_02_diff_2k.jpg (Poly Haven, CC0)
Nível 1: pátio de terra com paliçada. Nível 2: arena com paredes de pedra.
Nível 3: salão dividido - guerreiros à esquerda (terra, ringue), magos à direita (mármore, círculo arcano)."""
import json, math, sys, os, numpy as np
from collections import deque
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

PIPE, REN, REN_T, TEX, OUT = sys.argv[1:6]
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
def px2r(px): return px * SS / sc
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / sc
A = np.degrees(np.arctan2(xx - CX, CY - yy))
U = np.radians(A) * R * sc
V = (ro - R) * sc
GOLD = (226, 184, 74); GOLD_D = (150, 112, 40)
SPLIT = False   # versão antiga do nível 3 (dividido) desativada

def noise(shape, cell, seed):
    g = np.random.default_rng(seed).random((max(2, shape[0] // cell[0] + 2), max(2, shape[1] // cell[1] + 2))).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((g.shape[1] * cell[1], g.shape[0] * cell[0]), Image.BICUBIC)
    return np.asarray(im, np.float32)[:shape[0], :shape[1]] / 255
def fbm(shape, cell, seed, oct=4):
    acc = np.zeros(shape, np.float32); amp = 1; tot = 0
    for o in range(oct):
        c = (max(1, cell[0] >> o), max(1, cell[1] >> o)); acc += amp * noise(shape, c, seed + o); tot += amp; amp *= .5
    return acc / tot

def load(p): return np.asarray(Image.open(p).convert('RGB'), np.float32) / 255
dirt_t = load(f'{TEX}/dirt_diff_2k.jpg')
marble_t = load(f'{TEX}/floor_tiles_02_diff_2k.jpg')
lab = Image.open(f'{PIPE}/exemplos/arcane_lab.outer.png').convert('RGB')
patch = np.asarray(lab.crop((330, 342, 560, 456)), np.float32) / 255
pt = np.concatenate([patch, patch[:, ::-1]], 1); pt = np.concatenate([pt, pt[::-1]], 0)
pt = np.asarray(Image.fromarray((pt * 255).astype(np.uint8)).resize((pt.shape[1] * SS, pt.shape[0] * SS), Image.BICUBIC), np.float32) / 255
def stone_at(Uc, Vc):
    th, tw = pt.shape[:2]; return pt[Vc.astype(int) % th, Uc.astype(int) % tw]
def polar(tex, tile_px, swap=False):
    th, tw = tex.shape[:2]; k = tw / (tile_px * SS)
    uu, vv = (U - U.min()) * k, V * k
    if swap: uu, vv = vv, uu
    return tex[vv.astype(int) % th, uu.astype(int) % tw]

def rgba(p):
    im = Image.open(p).convert('RGBA'); return im.crop(im.split()[3].getbbox())
def parts(p, min_px=300):
    im = Image.open(p).convert('RGBA'); a = np.asarray(im.split()[3]) > 20
    seen = np.zeros_like(a); out = []; H_, W_ = a.shape
    for y0 in range(0, H_, 2):
        for x0 in range(0, W_, 2):
            if a[y0, x0] and not seen[y0, x0]:
                q = deque([(y0, x0)]); seen[y0, x0] = 1; ys = []; xs = []
                while q:
                    y, x = q.popleft(); ys.append(y); xs.append(x)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < H_ and 0 <= nx < W_ and a[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = 1; q.append((ny, nx))
                if len(ys) > min_px: out.append((len(ys), (min(xs), min(ys), max(xs) + 1, max(ys) + 1)))
    return [im.crop(b) for _, b in sorted(out, reverse=True)]       # maior primeiro
def tint(im, mul):
    a = im.split()[3]; arr = np.asarray(im.convert('RGB'), np.float32)
    g = arr.mean(-1, keepdims=True); arr = g * np.array(mul)[None, None] * 1.0 + arr * 0.15
    o = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert('RGBA'); o.putalpha(a); return o
def bright(im, k):
    a = im.split()[3]; o = ImageEnhance.Brightness(im.convert('RGB')).enhance(k).convert('RGBA'); o.putalpha(a); return o

S = {}
S['sword'] = rgba(f'{REN}/antique_estoc_r90.png')
S['katana'] = rgba(f'{REN}/antique_katana_01_r-90.png')
S['axe'] = rgba(f'{REN}/wooden_axe_03_flat.png')
S['shield'] = rgba(f'{REN}/kite_shield_r-90.png'); S['shield'] = S['shield'].crop((0, int(S['shield'].height * .44), S['shield'].width, S['shield'].height))
S['shield'] = S['shield'].crop(S['shield'].split()[3].getbbox())
book = rgba(f'{REN}/book_08.png')
S['books'] = [book, tint(book, (.55, .95, .6)), tint(book, (.5, .65, 1.1)), tint(book, (1.0, .78, .5)), tint(book, (.35, .3, .45))]
S['chalk'] = rgba(f'{REN}/chalk_rm90.png')
S['alchemy'] = rgba(f'{REN}/chemistry_set.png')
S['candle'] = parts(f'{REN}/brass_candleholders.png')[0]
S['statue'] = rgba(f'{REN}/gothic_statue.png')
S['barrel'] = rgba(f'{REN_T}/wine_barrel_01.png')
S['lantern'] = rgba(f'{REN_T}/wooden_lantern_01.png')
S['stool'] = rgba(f'{REN_T}/wooden_stool_01.png')
_a = S['stool'].split()[3]; _s = np.asarray(S['stool'].convert('RGB'), np.float32) * np.array([.62, .46, .32]) * 1.05
S['stool'] = Image.fromarray(np.clip(_s, 0, 255).astype(np.uint8)).convert('RGBA'); S['stool'].putalpha(_a)
S['crate'] = rgba(f'{PIPE}/renders/caixote.png')

# ---------------- peças feitas por código ----------------
def wood_tex(size, seed, base=(.36, .24, .15)):
    w_, h_ = size; g = fbm((h_, w_), (40 * SS, 2), seed, 3)
    col = np.array(base)[None, None] * (0.7 + 0.55 * g[..., None])
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).convert('RGBA')

def make_dummy(seed, armored=False):
    s = 48 * SS; dm = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(dm)
    d.rounded_rectangle([2 * SS, s / 2 - 3 * SS, s - 2 * SS, s / 2 + 3 * SS], radius=2 * SS, fill=(88, 60, 36, 255), outline=(30, 18, 10, 255))
    n = 28 * SS
    straw = np.asarray(Image.new('RGB', (n, n), (190, 160, 90)), np.float32) / 255
    straw *= 0.7 + 0.5 * fbm((n, n), (2, 2), seed, 2)[..., None]
    st = Image.fromarray((straw * 255).astype(np.uint8)).convert('RGBA')
    m = Image.new('L', st.size, 0); ImageDraw.Draw(m).ellipse([0, 0, n - 1, n - 1], fill=255)
    dm.paste(st, (int(s / 2 - n / 2), int(s / 2 - n / 2)), m)
    d.ellipse([s / 2 - n / 2, s / 2 - n / 2, s / 2 + n / 2, s / 2 + n / 2], outline=(110, 84, 40, 255), width=SS)
    if armored:
        d.rounded_rectangle([6 * SS, s / 2 - 9 * SS, s - 6 * SS, s / 2 + 9 * SS], radius=8 * SS, fill=(120, 124, 132, 255), outline=(40, 40, 46, 255), width=SS)
        d.ellipse([s / 2 - 10 * SS, s / 2 - 10 * SS, s / 2 + 10 * SS, s / 2 + 10 * SS], fill=(150, 154, 162, 255), outline=(40, 40, 46, 255), width=SS)
        d.line([(s / 2, s / 2 - 10 * SS), (s / 2, s / 2 + 10 * SS)], fill=GOLD + (255,), width=2 * SS)
        d.ellipse([s / 2 - 7 * SS, s / 2 - 8 * SS, s / 2 - 2 * SS, s / 2 - 4 * SS], fill=(230, 232, 240, 200))
    else:
        d.line([(s / 2 - 13 * SS, s / 2), (s / 2 + 13 * SS, s / 2)], fill=(120, 30, 26, 255), width=2 * SS)
        d.ellipse([s / 2 - 5 * SS, s / 2 - 5 * SS, s / 2 + 5 * SS, s / 2 + 5 * SS], fill=(150, 30, 26, 255))
    return dm

def make_target(seed, magic=False):
    """alvo redondo de palha (visto de frente, deitado no chão como convenção de vista de cima) com suporte"""
    s = 46 * SS; t = Image.new('RGBA', (s, s + 8 * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(t)
    d.rectangle([4 * SS, s - 2 * SS, s - 4 * SS, s + 6 * SS], fill=(70, 46, 28, 255), outline=(26, 16, 8, 255))   # pés do suporte
    n = s
    straw = np.asarray(Image.new('RGB', (n, n), (196, 168, 100)), np.float32) / 255
    straw *= 0.72 + 0.45 * fbm((n, n), (2, 2), seed, 2)[..., None]
    st = Image.fromarray((straw * 255).astype(np.uint8)).convert('RGBA')
    m = Image.new('L', (n, n), 0); ImageDraw.Draw(m).ellipse([0, 0, n - 1, n - 1], fill=255); t.paste(st, (0, 0), m)
    rings = [(.86, (200, 40, 34)), (.66, (236, 228, 210)), (.46, (40, 80, 160) if not magic else (90, 60, 200)), (.24, GOLD)]
    for f, c in rings:
        rr_ = n / 2 * f; d.ellipse([n / 2 - rr_, n / 2 - rr_, n / 2 + rr_, n / 2 + rr_], fill=c + (230,))
    d.ellipse([0, 0, n - 1, n - 1], outline=(110, 84, 40, 255), width=2 * SS)
    rng = np.random.default_rng(seed)
    if magic:   # marcas de queimado
        burn = Image.new('RGBA', t.size, (0, 0, 0, 0)); bd = ImageDraw.Draw(burn)
        for _ in range(5):
            x, y = rng.uniform(.25, .75, 2) * n; r = rng.uniform(3, 7) * SS
            bd.ellipse([x - r, y - r, x + r, y + r], fill=(20, 12, 20, 200))
        t.alpha_composite(burn.filter(ImageFilter.GaussianBlur(2 * SS)))
    else:      # flechas cravadas
        for _ in range(3):
            x, y = rng.uniform(.3, .7, 2) * n
            d.line([(x, y), (x + 9 * SS, y + 9 * SS)], fill=(110, 80, 50, 255), width=SS)
            d.polygon([(x + 9 * SS, y + 9 * SS), (x + 13 * SS, y + 9 * SS), (x + 9 * SS, y + 13 * SS)], fill=(235, 235, 235, 255))
    return t

def make_rack(items, length=96, seed=1):
    """suporte de armas visto de cima: duas travessas e as armas deitadas lado a lado, atravessadas"""
    Lp, Dp = length * SS, 74 * SS
    rk = Image.new('RGBA', (Lp, Dp), (0, 0, 0, 0)); d = ImageDraw.Draw(rk)
    for y in (12 * SS, Dp - 20 * SS):
        rk.alpha_composite(wood_tex((Lp, 8 * SS), seed + y, (.33, .21, .12)), (0, y))
        d.rectangle([0, y, Lp - 1, y + 8 * SS - 1], outline=(24, 14, 8, 255), width=SS)
    for x in (0, Lp - 8 * SS):
        for y in (12 * SS, Dp - 20 * SS): d.rectangle([x, y - 2 * SS, x + 8 * SS, y + 10 * SS], fill=(52, 34, 20, 255), outline=(20, 12, 6, 255))
    n = len(items)
    for i, it in enumerate(items):
        im = it if it.height >= it.width else it.rotate(90, expand=True)
        s_ = (Dp - 4 * SS) / im.height; im = im.resize((max(1, int(im.width * s_)), int(im.height * s_)), Image.LANCZOS)
        x = int(10 * SS + (i + .5) * (Lp - 20 * SS) / n - im.width / 2)
        sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); sh.putalpha(im.split()[3].point(lambda v: int(v * .5)))
        rk.alpha_composite(sh.filter(ImageFilter.GaussianBlur(2 * SS)), (x + 2 * SS, 4 * SS))
        rk.alpha_composite(im, (x, 2 * SS))
    return rk

def make_haybale(seed):
    w_, h_ = 50 * SS, 30 * SS
    n = fbm((h_, w_), (2, 9), seed, 3)
    col = np.array([.80, .66, .36])[None, None] * (0.65 + 0.5 * n[..., None])
    yy_, xx_ = np.mgrid[0:h_, 0:w_]
    edge = np.clip(np.minimum(np.minimum(xx_, w_ - 1 - xx_), np.minimum(yy_, h_ - 1 - yy_)) / (5 * SS), 0, 1)
    col *= (0.7 + 0.3 * edge)[..., None]
    im = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    m = Image.new('L', (w_, h_), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w_ - 1, h_ - 1], radius=5 * SS, fill=255); im.putalpha(m)
    d = ImageDraw.Draw(im)
    for x in (w_ * .3, w_ * .7): d.line([(x, 0), (x, h_)], fill=(90, 60, 30, 255), width=2 * SS)
    return im

def make_pell(seed):
    s = 26 * SS; p = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(p)
    wt_ = wood_tex((s, s), seed, (.38, .25, .15)); m = Image.new('L', (s, s), 0); ImageDraw.Draw(m).ellipse([0, 0, s - 1, s - 1], fill=255)
    p.paste(wt_, (0, 0), m); d = ImageDraw.Draw(p)
    for k in range(3): d.ellipse([s / 2 - (k + 1) * 3.5 * SS, s / 2 - (k + 1) * 3.5 * SS, s / 2 + (k + 1) * 3.5 * SS, s / 2 + (k + 1) * 3.5 * SS], outline=(60, 38, 22, 200), width=1)
    rng = np.random.default_rng(seed)
    for _ in range(4):
        t = rng.uniform(0, 2 * math.pi); d.line([(s / 2 + math.cos(t) * s * .25, s / 2 + math.sin(t) * s * .25), (s / 2 + math.cos(t) * s * .5, s / 2 + math.sin(t) * s * .5)], fill=(200, 170, 120, 255), width=SS)
    d.ellipse([0, 0, s - 1, s - 1], outline=(30, 18, 10, 255), width=SS)
    return p

def make_brazier(seed, gold=False):
    bz = 40 * SS; b = Image.new('RGBA', (bz, bz), (0, 0, 0, 0)); d = ImageDraw.Draw(b)
    d.ellipse([0, 0, bz - 1, bz - 1], fill=(GOLD_D if gold else (52, 50, 54)) + (255,), outline=(24, 20, 16, 255), width=SS)
    d.ellipse([5 * SS, 5 * SS, bz - 6 * SS, bz - 6 * SS], fill=(28, 18, 14, 255))
    rr = np.random.default_rng(seed)
    for _ in range(26):
        x, y = rr.uniform(8 * SS, bz - 8 * SS, 2); r = rr.uniform(1.5, 3.5) * SS
        if math.hypot(x - bz / 2, y - bz / 2) < bz / 2 - 8 * SS:
            d.ellipse([x - r, y - r, x + r, y + r], fill=[(255, 140, 40), (255, 90, 20), (255, 210, 100)][rr.integers(0, 3)] + (255,))
    gl = Image.new('RGBA', b.size, (0, 0, 0, 0)); ImageDraw.Draw(gl).ellipse([8 * SS, 8 * SS, bz - 8 * SS, bz - 8 * SS], fill=(255, 140, 40, 150))
    b.alpha_composite(gl.filter(ImageFilter.GaussianBlur(4 * SS)))
    if gold: ImageDraw.Draw(b).ellipse([0, 0, bz - 1, bz - 1], outline=GOLD + (255,), width=SS)
    return b

def make_crystals(seed, size=40):
    """aglomerado de cristais roxos vistos de cima (prismas com face clara e face escura)"""
    s = size * SS; c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); rng = np.random.default_rng(seed)
    gl = Image.new('RGBA', (s, s), (0, 0, 0, 0)); ImageDraw.Draw(gl).ellipse([s * .15, s * .15, s * .85, s * .85], fill=(170, 120, 255, 120))
    c.alpha_composite(gl.filter(ImageFilter.GaussianBlur(6 * SS)))
    d = ImageDraw.Draw(c)
    for k in range(rng.integers(4, 7)):
        ang = rng.uniform(0, 2 * math.pi); ln = rng.uniform(.25, .46) * s; wd = rng.uniform(.07, .12) * s
        cx_, cy_ = s / 2 + math.cos(ang) * s * .06, s / 2 + math.sin(ang) * s * .06
        tip = (cx_ + math.cos(ang) * ln, cy_ + math.sin(ang) * ln)
        nx, ny = -math.sin(ang) * wd, math.cos(ang) * wd
        b1 = (cx_ + nx, cy_ + ny); b2 = (cx_ - nx, cy_ - ny)
        m1 = (cx_ + math.cos(ang) * ln * .75 + nx, cy_ + math.sin(ang) * ln * .75 + ny)
        m2 = (cx_ + math.cos(ang) * ln * .75 - nx, cy_ + math.sin(ang) * ln * .75 - ny)
        mid = (cx_ + math.cos(ang) * ln * .75, cy_ + math.sin(ang) * ln * .75); base = (cx_, cy_)
        d.polygon([b1, m1, tip, mid, base], fill=(196, 160, 255, 255))
        d.polygon([b2, m2, tip, mid, base], fill=(108, 70, 196, 255))
        d.line([b1, m1, tip, m2, b2], fill=(60, 30, 120, 255), width=SS)
        d.line([base, mid, tip], fill=(235, 220, 255, 200), width=SS)
    return c

def make_arcane(radius_px, seed, level):
    s = int(radius_px * 2 * SS + 30 * SS); c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); o = s / 2; R_ = radius_px * SS
    rng = np.random.default_rng(seed)
    lines = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(lines)
    CYAN = (120, 220, 255); PURP = (170, 120, 255)
    for f, col, wd in ((1.0, GOLD, 3), (.92, PURP, 2), (.70, CYAN, 2), (.30, PURP, 2)):
        d.ellipse([o - R_ * f, o - R_ * f, o + R_ * f, o + R_ * f], outline=col + (255,), width=wd * SS)
    for k in range(2):     # hexagrama
        pts = [(o + R_ * .70 * math.cos(math.radians(90 + k * 60 + i * 120)), o - R_ * .70 * math.sin(math.radians(90 + k * 60 + i * 120))) for i in range(3)]
        d.polygon(pts, outline=CYAN + (255,), width=2 * SS)
    for i in range(24):    # runas entre os anéis externos
        t = math.radians(i * 15 + 7); rr_ = R_ * .81
        x, y = o + rr_ * math.cos(t), o + rr_ * math.sin(t); g = 3.2 * SS
        kind = rng.integers(0, 4)
        if kind == 0: d.line([(x - g, y - g), (x + g, y + g), (x + g, y - g)], fill=PURP + (255,), width=SS)
        elif kind == 1: d.ellipse([x - g, y - g, x + g, y + g], outline=PURP + (255,), width=SS)
        elif kind == 2: d.line([(x, y - g), (x, y + g)], fill=PURP + (255,), width=SS); d.line([(x - g, y), (x + g, y - g)], fill=PURP + (255,), width=SS)
        else: d.polygon([(x, y - g), (x + g, y + g), (x - g, y + g)], outline=PURP + (255,), width=SS)
    glow = lines.filter(ImageFilter.GaussianBlur(5 * SS))
    floor = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(floor).ellipse([o - R_, o - R_, o + R_, o + R_], fill=(30, 20, 60, 110))
    ImageDraw.Draw(floor).ellipse([o - R_ * .3, o - R_ * .3, o + R_ * .3, o + R_ * .3], fill=(120, 90, 255, 150))
    c.alpha_composite(floor.filter(ImageFilter.GaussianBlur(4 * SS)))
    c.alpha_composite(glow); c.alpha_composite(glow); c.alpha_composite(lines)
    return c

def make_duel_ring(radius_px, seed, gold):
    s = int(radius_px * 2 * SS + 10 * SS); c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); o = s / 2; R_ = radius_px * SS
    d = ImageDraw.Draw(c)
    d.ellipse([o - R_, o - R_, o + R_, o + R_], fill=(220, 196, 150, 60))                      # areia mais clara
    col = GOLD if gold else (190, 180, 160)
    n = 28
    for i in range(n):                                                                           # pedras/estacas da borda
        t = 2 * math.pi * i / n; x, y = o + R_ * math.cos(t), o + R_ * math.sin(t); r_ = 3.2 * SS
        d.ellipse([x - r_, y - r_, x + r_, y + r_], fill=col + (255,), outline=(60, 50, 30, 255))
    d.ellipse([o - R_ * .97, o - R_ * .97, o + R_ * .97, o + R_ * .97], outline=col + (200,), width=SS)
    d.line([(o - R_ * .25, o), (o + R_ * .25, o)], fill=(255, 255, 255, 70), width=2 * SS)
    for sx in (-1, 1): d.line([(o + sx * R_ * .55, o - R_ * .12), (o + sx * R_ * .55, o + R_ * .12)], fill=(255, 255, 255, 90), width=2 * SS)
    return c

def make_table(wpx, hpx, seed):
    t = wood_tex((wpx * SS, hpx * SS), seed, (.36, .23, .13)); d = ImageDraw.Draw(t)
    for k in range(1, 4): d.line([(0, k * hpx * SS / 4), (wpx * SS, k * hpx * SS / 4)], fill=(30, 18, 10, 160), width=1)
    d.rectangle([0, 0, wpx * SS - 1, hpx * SS - 1], outline=(24, 14, 8, 255), width=SS)
    return t

def make_bookshelf(length_px, seed):
    Lp, Dp = length_px * SS, 26 * SS
    sh = wood_tex((Lp, Dp), seed, (.30, .19, .11)); d = ImageDraw.Draw(sh)
    d.rectangle([0, 0, Lp - 1, Dp - 1], outline=(24, 14, 8, 255), width=SS)
    rng = np.random.default_rng(seed); x = 4 * SS
    while x < Lp - 18 * SS:            # pilhas de livros deitados
        bk = S['books'][rng.integers(0, len(S['books']))]
        bk = bk.rotate(90 * rng.integers(0, 4), expand=True)
        s_ = (Dp - 6 * SS) / max(bk.size); bk = bk.resize((max(1, int(bk.width * s_)), max(1, int(bk.height * s_))), Image.LANCZOS)
        bk = bk.rotate(rng.uniform(-8, 8), expand=True, resample=Image.BICUBIC)
        sh.alpha_composite(bk, (int(x), int((Dp - bk.height) / 2)))
        x += bk.width * .8
    return sh


def make_log(length_px, seed):
    """tronco deitado (trave de equilíbrio): casca com veios, pontas com anéis"""
    Lp, Dp = length_px * SS, 16 * SS
    g = fbm((Dp, Lp), (2, 14 * SS), seed, 3)
    col = np.array([.36, .25, .16])[None, None] * (0.6 + 0.6 * g[..., None])
    yy_ = np.arange(Dp)[:, None]; shade = 1.15 - 0.6 * np.abs(yy_ - Dp * .4) / Dp
    col = col * shade[..., None]
    im = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    m = Image.new('L', (Lp, Dp), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, Lp - 1, Dp - 1], radius=Dp // 2, fill=255); im.putalpha(m)
    d = ImageDraw.Draw(im)
    for x0 in (0, Lp - Dp):
        d.ellipse([x0, 0, x0 + Dp - 1, Dp - 1], fill=(170, 130, 86, 255), outline=(60, 40, 24, 255), width=SS)
        for k in (.32, .18): d.ellipse([x0 + Dp * (.5 - k), Dp * (.5 - k), x0 + Dp * (.5 + k), Dp * (.5 + k)], outline=(120, 86, 52, 255), width=1)
    return im

def make_weight(size_px, seed):
    """pedra redonda de levantamento com argola de ferro"""
    s = size_px * SS; im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    st_ = Image.fromarray((pt[:s, :s] * 255).astype(np.uint8)).convert('L').convert('RGB')
    arr = np.asarray(st_, np.float32) / 255
    yy_, xx_ = np.mgrid[0:s, 0:s]; dd = np.hypot(xx_ - s * .42, yy_ - s * .4) / (s / 2)
    arr = arr * (1.25 - 0.55 * dd)[..., None] * np.array([1.0, .97, .93])
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    m = Image.new('L', (s, s), 0); ImageDraw.Draw(m).ellipse([0, 0, s - 1, s - 1], fill=255); im.putalpha(m)
    d = ImageDraw.Draw(im); d.ellipse([0, 0, s - 1, s - 1], outline=(40, 38, 36, 255), width=SS)
    d.ellipse([s * .32, s * .32, s * .68, s * .68], outline=(50, 50, 56, 255), width=2 * SS)
    d.arc([s * .32, s * .32, s * .68, s * .68], 200, 290, fill=(170, 170, 180, 255), width=SS)
    return im

def make_banner(side):
    """estandarte visto de cima: base redonda, mastro e o pano caído para um lado"""
    s = 40 * SS; b = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(b)
    d.rectangle([s * .30, s * .40, s * .92, s * .60], fill=(140, 26, 30, 255), outline=(60, 10, 12, 255), width=SS)
    d.line([(s * .30, s * .44), (s * .92, s * .44)], fill=GOLD + (255,), width=SS); d.line([(s * .30, s * .56), (s * .92, s * .56)], fill=GOLD + (255,), width=SS)
    d.polygon([(s * .92, s * .40), (s * .99, s * .50), (s * .92, s * .60)], fill=GOLD + (255,))
    d.ellipse([s * .14, s * .34, s * .40, s * .66], fill=(60, 58, 60, 255), outline=(20, 20, 22, 255), width=SS)
    d.ellipse([s * .21, s * .43, s * .33, s * .57], fill=GOLD + (255,))
    return b if side < 0 else b.transpose(Image.FLIP_LEFT_RIGHT)

# ---------------- composição ----------------
def compose(level):
    img = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
    r_wall_in = 0.3735; wt = 0.0032; r_back = ro - 0.0005
    a_side = half - 0.55; a_side_in = a_side - math.degrees(wt / 0.405)
    door_half = px2deg(30, r_wall_in)
    yard = (R >= ri) & (R <= ro) & (np.abs(A) <= half)
    st0 = stone_at(U, V); st1 = stone_at(U + 173 * SS, V + 61 * SS)
    mix = np.clip((fbm((H, W), (40 * SS, 40 * SS), 99, 3) - .5) * 4 + .5, 0, 1)[..., None]
    st = st0 * mix + st1 * (1 - mix)
    img[yard] = st[yard] * .92; alpha[yard] = 1
    inner = (R > r_wall_in + wt) & (R < r_back - wt) & (np.abs(A) < a_side_in)
    dirt = polar(dirt_t, 300) * np.array([1.05, .98, .9]) * 0.95
    scuff = fbm((H, W), (30 * SS, 30 * SS), 5, 4)[..., None]                  # terra pisoteada
    dirt = dirt * (0.78 + 0.4 * scuff)
    img[inner] = dirt[inner]
    r_div = 0.3905                                                            # nível 3: início da mureta
    if level >= 3 and SPLIT:
        mar = polar(marble_t, 230)
        mar = mar.mean(-1, keepdims=True) * np.array([.72, .74, .86]) * 0.86 + mar * .08
        right = inner & ((A > 0) | (R < r_div))
        img[right] = mar[right]
    walls = np.zeros_like(inner)
    if level >= 2:
        walls = (R >= r_wall_in) & (R <= r_back) & (np.abs(A) <= a_side) & ~inner
        door = (R < r_wall_in + wt + .0003) & (np.abs(A) < door_half)
        walls &= ~door
        img[door & (R >= r_wall_in)] = (mar if (level >= 3 and SPLIT) else dirt)[door & (R >= r_wall_in)]
        sw = stone_at(U * 1.6, V * 1.6); swg = sw.mean(-1, keepdims=True)
        img[walls] = (swg * np.array([.78, .76, .74]) * 1.05 + sw * .1)[walls]
    div = np.zeros_like(inner)
    if level >= 3 and SPLIT:      # mureta divisória radial com passagem em arco
        dw = px2deg(6, .41)
        div = inner & (np.abs(A) < dw * .41 / R) & (R > r_div) & ~((R > .4075) & (R < .4185))
        img[div] = (stone_at(U * 1.6, V * 1.6).mean(-1, keepdims=True) * np.array([.8, .78, .76]))[div]
    solid = walls | div
    if solid.any():
        wm = Image.fromarray((solid * 255).astype(np.uint8))
        shm = Image.new('L', wm.size, 0); shm.paste(wm, (6 * SS, 7 * SS)); shm = shm.filter(ImageFilter.GaussianBlur(5 * SS))
        img *= (1 - np.asarray(shm, np.float32) / 255 * 0.55 * (~solid))[..., None]
        ao = Image.fromarray((walls * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10 * SS))
        img *= (1 - 0.25 * np.asarray(ao, np.float32) / 255 * (~walls))[..., None]

    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
    d = ImageDraw.Draw(out, 'RGBA')
    def arcline(r, a1, a2, col, wd, n=120):
        d.line([P(r, a1 + (a2 - a1) * i / n) for i in range(n + 1)], fill=col, width=wd, joint='curve')
    def paste(im, r, a, size_px, rot_extra=0, shadow=True, sh_alpha=.6, sh_off=5):
        nonlocal out
        im = im.copy(); s = size_px * SS / max(im.size)
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
        im = im.rotate(-a + rot_extra, expand=True, resample=Image.BICUBIC)
        x, y = P(r, a)
        if shadow:
            s2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); s2.putalpha(im.split()[3].point(lambda v: int(v * sh_alpha)))
            s2 = s2.filter(ImageFilter.GaussianBlur(3 * SS)); out.alpha_composite(s2, (int(x - im.width / 2 + sh_off * SS), int(y - im.height / 2 + (sh_off + 1) * SS)))
        out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))
    def glow(r, a, rad_px, col, alpha_):
        nonlocal out
        g = Image.new('RGBA', out.size, (0, 0, 0, 0)); x, y = P(r, a)
        ImageDraw.Draw(g).ellipse([x - rad_px * SS, y - rad_px * SS, x + rad_px * SS, y + rad_px * SS], fill=col + (alpha_,))
        out.alpha_composite(g.filter(ImageFilter.GaussianBlur(rad_px * SS * .45)))
    FX = []
    def fx(kind, r, a, **kw):
        x, y = P(r, a); FX.append(dict(type=kind, x=round(x / W, 3), y=round(y / H, 3), **kw))
    rr = np.random.default_rng(level * 11 + 3)

    gw = 3 * SS
    if level == 1:
        # paliçada: estacas redondas ligadas por travessa, com portão na frente
        def fence_line(pts):
            nonlocal d
            d.line(pts, fill=(60, 40, 24, 255), width=4 * SS)
            for k, (x, y) in enumerate(pts):
                if k % 2 == 0:
                    rp = 4.5 * SS
                    d.ellipse([x - rp + 2 * SS, y - rp + 3 * SS, x + rp + 2 * SS, y + rp + 3 * SS], fill=(0, 0, 0, 90))
                    d.ellipse([x - rp, y - rp, x + rp, y + rp], fill=(96, 66, 40, 255), outline=(36, 22, 12, 255), width=SS)
                    d.ellipse([x - rp * .45, y - rp * .45, x + rp * .45, y + rp * .45], outline=(140, 104, 66, 255), width=1)
        rb, rf = r_back - .002, r_wall_in + .0015; asd = a_side - .2
        def arcpts(r, a1, a2, step_px=16):
            n = max(2, int(abs(a2 - a1) / px2deg(step_px, r))); return [P(r, a1 + (a2 - a1) * i / n) for i in range(n + 1)]
        fence_line(arcpts(rb, -asd, asd))
        fence_line(arcpts(rf, -asd, -door_half - .3)); fence_line(arcpts(rf, door_half + .3, asd))
        for s_ in (-1, 1):
            n = int((rb - rf) * sc / (16 * SS)); fence_line([P(rf + (rb - rf) * i / n, s_ * asd) for i in range(n + 1)])
        for s_ in (-1, 1):   # mourões do portão com detalhe dourado
            x, y = P(rf, s_ * (door_half + .3)); rp = 6 * SS
            d.ellipse([x - rp, y - rp, x + rp, y + rp], fill=(80, 54, 32, 255), outline=GOLD + (255,), width=SS)
    else:
        arcline(r_back - .0005, -a_side, a_side, GOLD + (255,), gw)
        arcline(r_wall_in + .0003, -a_side, -door_half, GOLD + (255,), gw)
        arcline(r_wall_in + .0003, door_half, a_side, GOLD + (255,), gw)
        for s_ in (-1, 1):
            d.line([P(r_wall_in, s_ * (a_side - .05)), P(r_back, s_ * (a_side - .05))], fill=GOLD + (255,), width=gw)
            d.line([P(r_wall_in + wt, s_ * door_half), P(r_wall_in, s_ * door_half)], fill=GOLD + (255,), width=gw)
        wr = r_wall_in + wt / 2
        for a in (-3.9, 3.9, -6.6, 6.6):
            da = px2deg(12, wr)
            arcline(wr, a - da, a + da, (120, 160, 190, 255), int(wt * sc * .45)); arcline(wr, a - da, a + da, (200, 225, 240, 160), SS)
    arcline(ri + .0015, -half + .35, half - .35, GOLD + (150,), 2 * SS)
    if level >= 3 and SPLIT:     # mureta: topo dourado e pilares do arco
        dwp = px2deg(6, .41)
        for s_ in (-1, 1):
            for (r1, r2) in ((r_div, .4075), (.4185, r_back - wt)):
                d.line([P(r1, s_ * dwp * .41 / r1), P(r2, s_ * dwp * .41 / r2)], fill=GOLD + (255,), width=2 * SS)
        d.line([P(r_div, -dwp * .41 / r_div), P(r_div, dwp * .41 / r_div)], fill=GOLD + (255,), width=2 * SS)
        for rp in (.4075, .4185):
            x, y = P(rp, 0); q = 9 * SS
            d.rectangle([x - q, y - q * .7, x + q, y + q * .7], fill=(70, 66, 64, 255), outline=GOLD + (255,), width=2 * SS)
        x0, y0 = P(.4075, 0); x1, y1 = P(.4185, 0)
        d.line([(x0, y0), (x1, y1)], fill=GOLD + (120,), width=SS)     # soleira do arco

    r_y = (ri + r_wall_in) / 2
    # ---------------- NÍVEL 1 ----------------
    if level == 1:
        paste(make_target(1), .4255, -4.2, 44, rot_extra=0, sh_alpha=.5)
        paste(make_target(2), .4255, -1.4, 44, rot_extra=0, sh_alpha=.5)
        d = ImageDraw.Draw(out, 'RGBA'); arcline(.407, -5.6, 0.0, (235, 225, 200, 110), 2 * SS)      # linha de tiro
        paste(make_dummy(3), .3985, -2.0, 46); paste(make_dummy(4), .396, 2.6, 46)
        paste(make_rack([S['sword'], S['axe'], S['sword']], 84, 5), .408, 6.2, 84, rot_extra=90)
        paste(S['barrel'], .4285, 6.4, 40); paste(S['barrel'], .4295, 5.1, 36)
        paste(S['crate'], .428, 3.4, 54, rot_extra=-5)
        paste(make_haybale(1), .4295, 1.3, 50, rot_extra=4); paste(make_haybale(2), .4245, 0.2, 50, rot_extra=-8)
        paste(make_haybale(3), .3885, -5.6, 50, rot_extra=80); paste(make_haybale(4), .3885, 6.4, 50, rot_extra=95)
        paste(make_pell(1), .4005, -4.6, 26); paste(make_pell(2), .4085, 0.8, 26)
        paste(S['stool'], .392, -6.9, 24)
        bench = wood_tex((80 * SS, 16 * SS), 9, (.36, .24, .14)); ImageDraw.Draw(bench).rectangle([0, 0, 80 * SS - 1, 16 * SS - 1], outline=(26, 16, 8, 255), width=SS)
        paste(bench, .404, -6.6, 80, rot_extra=90)
        a_l = -px2deg(46, r_y); glow(r_y, a_l, 26, (255, 180, 90), 80); paste(S['lantern'], r_y, a_l, 20, sh_alpha=.5, sh_off=3)
        fx('glow', r_y, a_l, color='#ffb347', radius=0.035)
        paste(S['barrel'], r_y + px2r(4), -6.3, 38)
    # ---------------- NÍVEL 2 ----------------
    elif level == 2:
        for k, a in enumerate((-6.2, -4.5, -2.8)):
            paste(make_target(10 + k), r_back - wt - px2r(26), a, 44, sh_alpha=.5)
        d = ImageDraw.Draw(out, 'RGBA'); arcline(.409, -7.0, -1.6, (235, 225, 200, 120), 2 * SS)
        rc, ac = .4015, 3.3
        paste(make_duel_ring(70, 1, False), rc, ac, 150, shadow=False)
        paste(make_dummy(5), .392, -5.6, 46); paste(make_dummy(6), .392, -2.4, 46); paste(make_dummy(7), .4005, 0.4, 46)
        for a in (1.6, 3.3, 5.0): paste(S['shield'], r_back - wt - px2r(20), a, 40, rot_extra=0, sh_alpha=.5)
        paste(make_rack([S['sword'], S['katana'], S['axe'], S['sword']], 100, 7), .4055, 6.55, 100, rot_extra=90)
        paste(S['barrel'], .3835, 6.3, 36); paste(S['stool'], .3835, -6.7, 26)
        paste(make_pell(3), .4235, -0.6, 26); paste(make_pell(4), .4235, 0.8, 26); paste(make_pell(5), .4235, 6.6, 26)
        paste(make_haybale(5), .4295, -7.0, 48, rot_extra=90); paste(make_haybale(6), .3855, -5.2, 48, rot_extra=10)
        paste(make_haybale(7), .3855, -4.0, 48, rot_extra=-6); paste(make_haybale(8), .3905, 6.6, 48, rot_extra=85)
        bench = wood_tex((80 * SS, 16 * SS), 19, (.36, .24, .14)); ImageDraw.Draw(bench).rectangle([0, 0, 80 * SS - 1, 16 * SS - 1], outline=(26, 16, 8, 255), width=SS)
        paste(bench, .3835, 3.3, 80, rot_extra=0)
        for s_ in (-1, 1):
            a = s_ * px2deg(52, r_y)
            glow(r_y, a, 46, (255, 120, 30), 70); paste(make_brazier(s_ + 3), r_y, a, 40)
            fx('glow', r_y, a, color='#ff7a1a', radius=0.06); fx('sparks', r_y, a)
        paste(S['barrel'], r_y + px2r(4), -6.3, 38); paste(S['crate'], r_y, 6.0, 52, rot_extra=-6)
    # ---------------- NÍVEL 3 (arena de elite, só treino físico) ----------------
    else:
        # ringue de duelo central, grande e dourado
        paste(make_duel_ring(66, 2, True), .4025, 0.0, 142, shadow=False)
        # arqueria no fundo esquerdo, com feno atrás dos alvos
        for k, a in enumerate((-6.3, -4.7, -3.1)):
            paste(make_target(30 + k), r_back - wt - px2r(26), a, 46, sh_alpha=.5)
        d = ImageDraw.Draw(out, 'RGBA'); arcline(.4105, -7.1, -2.2, (235, 225, 200, 130), 2 * SS)
        for k in range(3): d.line([P(.4105, -6.3 + k * 1.6 - .15), P(.4105 + px2r(5), -6.3 + k * 1.6)], fill=GOLD + (200,), width=SS)
        # bonecos com armadura e postes no fundo central
        paste(make_dummy(41, True), .4275, -1.1, 50); paste(make_dummy(42, True), .4275, 1.1, 50)
        paste(make_pell(11), .4185, -2.1, 26); paste(make_pell(12), .4185, 2.1, 26)
        # parede de escudos e suportes de armas
        for a in (2.9, 4.2, 5.5, 6.8): paste(S['shield'], r_back - wt - px2r(20), a, 40, sh_alpha=.5)
        paste(make_rack([S['sword'], S['katana'], S['axe'], S['sword'], S['axe']], 110, 9), .4045, 6.75, 110, rot_extra=90)
        paste(make_rack([S['sword'], S['katana'], S['sword']], 84, 10), .3975, -6.8, 84, rot_extra=-90)
        # pista de obstáculos (frente direita): troncos de equilíbrio e postes em zigue-zague
        for k, a in enumerate((3.5, 4.4)):
            paste(make_log(80, 50 + k), .3895, a, 80, rot_extra=90 + (k * 6 - 3))
        for k in range(4):
            paste(make_pell(20 + k), .3845 + (k % 2) * px2r(18), 5.4 + k * .45, 22, sh_alpha=.5)
        # pedras de levantamento (frente esquerda)
        for (r_, a_, sz) in ((.3865, -5.6, 30), (.3905, -4.75, 26), (.3845, -4.3, 22)):
            paste(make_weight(int(a_ * 10) + 90, sz), r_, a_, sz, sh_alpha=.55)
        paste(make_haybale(31), .4295, -7.15, 46, rot_extra=90)
        paste(S['barrel'], .3835, -6.9, 34); paste(S['barrel'], .3825, 6.95, 32)
        # bancos de plateia junto à parede da frente
        for a_ in (-2.6, 2.6):
            bench = wood_tex((76 * SS, 14 * SS), 60 + int(a_), (.36, .24, .14)); ImageDraw.Draw(bench).rectangle([0, 0, 76 * SS - 1, 14 * SS - 1], outline=GOLD_D + (255,), width=SS)
            paste(bench, .3805, a_, 76)
        # tochas nas paredes laterais
        for s_ in (-1, 1):
            r_t = .4195; a_t = s_ * (a_side_in - px2deg(6, r_t))
            glow(r_t, a_t, 30, (255, 150, 60), 90); fx('glow', r_t, a_t, color='#ff9a3a', radius=0.04)
            x, y = P(r_t, a_t); q = 4 * SS
            dd = ImageDraw.Draw(out, 'RGBA'); dd.ellipse([x - q, y - q, x + q, y + q], fill=(255, 190, 90, 255), outline=(60, 40, 20, 255), width=SS)
        # entrada: braseiros dourados e estandartes
        for s_ in (-1, 1):
            a = s_ * px2deg(52, r_y)
            glow(r_y, a, 46, (255, 120, 30), 70); paste(make_brazier(s_ + 3, gold=True), r_y, a, 40)
            fx('glow', r_y, a, color='#ff7a1a', radius=0.06); fx('sparks', r_y, a)
            paste(make_banner(s_), r_y, s_ * px2deg(110, r_y), 40)
        paste(make_dummy(30), r_y, -5.7, 42); paste(S['crate'], r_y, 5.8, 52, rot_extra=-6)

    clamp = ((R >= ri) & (R <= ro) & (np.abs(A) <= half)).astype(np.float32)
    out.putalpha(Image.fromarray((np.asarray(out.split()[3], np.float32) * clamp).astype(np.uint8)))
    out = out.resize((W0, H0), Image.LANCZOS)
    m = Image.open(f'{PIPE}/templates/outer_arc_mask.png').convert('L')
    out.putalpha(Image.fromarray(np.minimum(np.asarray(out.split()[3]), np.asarray(m))))
    return out, FX

names = {1: 'training_hall.outer.png', 2: 'training_hall.outer.lv2.png', 3: 'training_hall.outer.lv3.png'}
allfx = {}
for lv in (1, 2, 3):
    im, fxl = compose(lv); im.save(f'{OUT}/{names[lv]}'); allfx[lv] = fxl; print('ok', lv)
json.dump(allfx, open(f'{OUT}/fx_por_nivel.json', 'w'), indent=1)
