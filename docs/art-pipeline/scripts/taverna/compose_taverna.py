"""Taverna -> Restaurante (tavern) - arte outer, 3 níveis.
Uso: python3 -I compose_taverna.py <pasta_pipeline> <pasta_renders> <pasta_texturas> <pasta_saida>
  <pasta_renders>: PNGs de cima feitos com render2.py (ver LEIA-ME)
  <pasta_texturas>: old_wood_floor_diff_2k.jpg e medieval_wood_diff_2k.jpg (Poly Haven, CC0)
Interior visto de cima (sem telhado), como o Quartel: muralha no topo, porta voltada para o centro."""
import json, math, sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

PIPE, REN, TEX, OUT = sys.argv[1:5]
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
def load(p): return np.asarray(Image.open(p).convert('RGB'), np.float32) / 255
floor_t = load(f'{TEX}/old_wood_floor_diff_2k.jpg')           # tábuas horizontais
counter_t = load(f'{TEX}/medieval_wood_diff_2k.jpg')          # tábuas verticais com cravos
lab = Image.open(f'{PIPE}/exemplos/arcane_lab.outer.png').convert('RGB')
patch = np.asarray(lab.crop((330, 342, 560, 456)), np.float32) / 255
pt = np.concatenate([patch, patch[:, ::-1]], 1); pt = np.concatenate([pt, pt[::-1]], 0)
pt = np.asarray(Image.fromarray((pt * 255).astype(np.uint8)).resize((pt.shape[1] * SS, pt.shape[0] * SS), Image.BICUBIC), np.float32) / 255
def stone_at(Uc, Vc):
    th, tw = pt.shape[:2]; return pt[Vc.astype(int) % th, Uc.astype(int) % tw]
def polar(tex, tile_px, swap=False):
    """mapeia a textura acompanhando a curva. tile_px = tamanho de um ladrilho da textura na arte final"""
    th, tw = tex.shape[:2]; k = tw / (tile_px * SS)
    uu, vv = (U - U.min()) * k, V * k
    if swap: uu, vv = vv, uu
    return tex[vv.astype(int) % th, uu.astype(int) % tw]

# ---------------- sprites dos renders ----------------
def rgba(p):
    im = Image.open(p).convert('RGBA'); return im.crop(im.split()[3].getbbox())
def parts(p, min_px=300):
    """separa um render com várias peças soltas em sprites individuais (da esquerda p/ direita)"""
    im = Image.open(p).convert('RGBA'); a = np.asarray(im.split()[3]) > 20
    from collections import deque
    seen = np.zeros_like(a); out = []
    H_, W_ = a.shape
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
                if len(ys) > min_px: out.append((min(xs), (min(xs), min(ys), max(xs) + 1, max(ys) + 1)))
    return [im.crop(b) for _, b in sorted(out)]
def bright(im, k):
    a = im.split()[3]; im = ImageEnhance.Brightness(im.convert('RGB')).enhance(k).convert('RGBA'); im.putalpha(a); return im

S = {}
S['table_r'] = rgba(f'{REN}/round_wooden_table_01.png')
S['stool'] = rgba(f'{REN}/wooden_stool_01.png')
_a = S['stool'].split()[3]; _s = np.asarray(S['stool'].convert('RGB'), np.float32) * np.array([.62, .46, .32]) * 1.05
S['stool'] = Image.fromarray(np.clip(_s, 0, 255).astype(np.uint8)).convert('RGBA'); S['stool'].putalpha(_a)
S['table_d'] = rgba(f'{REN}/dining_table_bare.png')
S['chair'] = bright(rgba(f'{REN}/gallinera_chair.png'), 1.35)
S['barrel'] = rgba(f'{REN}/wine_barrel_01.png')
S['bottles'] = parts(f'{REN}/wine_bottles_lying.png')
S['goblets'] = parts(f'{REN}/brass_goblets.png')
S['plate'] = rgba(f'{REN}/carved_wooden_plate.png')
S['jug'] = rgba(f'{REN}/jug_01.png')
S['pot'] = rgba(f'{REN}/brass_pot_02.png')
S['lantern'] = rgba(f'{REN}/wooden_lantern_01.png')
S['croissant'] = rgba(f'{REN}/croissant.png')
S['apple'] = rgba(f'{REN}/food_apple_01.png')
S['basket'] = rgba(f'{REN}/wicker_basket_01.png')
S['board'] = rgba(f'{REN}/wooden_cutting_board.png')
S['chand'] = rgba(f'{REN}/lantern_chandelier_01.png')
S['plant'] = rgba(f'{REN}/potted_plant_01.png')
S['crate'] = rgba(f'{PIPE}/renders/caixote.png')
bar_ = Image.open(f'{PIPE}/renders/barris.png').convert('RGBA'); S['keg'] = rgba_c = bar_.crop((110, 60, 225, 175)); S['keg'] = S['keg'].crop(S['keg'].split()[3].getbbox())

# ---------------- peças feitas por código ----------------
def make_fireplace(level):
    fw, fh = 104 * SS, 46 * SS
    fp = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    fp.paste(Image.fromarray((pt[:fh, :fw] * 255 * .8).astype(np.uint8)).convert('RGBA'), (0, 0))
    d = ImageDraw.Draw(fp)
    d.rectangle([0, 0, fw - 1, fh - 1], outline=GOLD_D + (255,), width=2 * SS)
    bx0, by0, bx1, by1 = 16 * SS, 4 * SS, fw - 16 * SS, fh - 10 * SS
    d.rectangle([bx0, by0, bx1, by1], fill=(22, 14, 10, 255))
    rr = np.random.default_rng(4)
    for _ in range(90):
        x = rr.uniform(bx0 + 4 * SS, bx1 - 4 * SS); y = rr.uniform(by0 + 4 * SS, by1 - 3 * SS); r = rr.uniform(1.5, 4) * SS
        c = [(255, 140, 40), (255, 90, 20), (255, 200, 90), (60, 30, 20), (40, 24, 16)][rr.integers(0, 5)]
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,))
    gl = Image.new('RGBA', fp.size, (0, 0, 0, 0))
    ImageDraw.Draw(gl).ellipse([bx0 + 4 * SS, by0, bx1 - 4 * SS, by1], fill=(255, 130, 40, 170))
    fp.alpha_composite(gl.filter(ImageFilter.GaussianBlur(6 * SS)))
    d = ImageDraw.Draw(fp)
    # grelha de ferro sobre o fogo
    for k in range(7):
        x = bx0 + 6 * SS + k * (bx1 - bx0 - 12 * SS) / 6
        d.line([(x, by0 + 2 * SS), (x, by1 - 2 * SS)], fill=(30, 28, 30, 255), width=SS)
    d.line([(bx0 - 4 * SS, by1 + 3 * SS), (bx1 + 4 * SS, by1 + 3 * SS)], fill=GOLD + (255,), width=SS)
    return fp

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

def make_cloth(wpx, hpx, seed):
    """toalha creme com barra dourada, caindo pelas bordas (sprite com o lado comprido na vertical)"""
    w_, h_ = wpx * SS, hpx * SS
    folds = fbm((h_, w_), (h_ // 4 + 1, w_ // 3 + 1), seed, 3); n = fbm((h_, w_), (2, 2), seed + 5, 2)
    col = np.array([.90, .86, .76])[None, None] * (0.86 + 0.2 * folds[..., None]) * (0.94 + 0.08 * n[..., None])
    yy_, xx_ = np.mgrid[0:h_, 0:w_]
    edge = np.minimum(np.minimum(xx_, w_ - 1 - xx_), np.minimum(yy_, h_ - 1 - yy_)).astype(np.float32)
    drop = edge < 5 * SS                                    # aba caída: mais escura
    col[drop] *= 0.72
    for e0, e1 in ((5.5, 7.2), (9.5, 10.4)):
        b = (edge >= e0 * SS) & (edge < e1 * SS); col[b] = np.array(GOLD) / 255 * (0.85 + 0.25 * folds[b][..., None])
    im = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    m = Image.new('L', (w_, h_), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w_ - 1, h_ - 1], radius=3 * SS, fill=255)
    im.putalpha(m); return im

def make_shelf(length_px, depth_px, bottles, seed):
    """prateleira de vinhos encostada na parede: garrafas deitadas com o gargalo para a sala (para baixo)"""
    L_, D_ = length_px * SS, depth_px * SS
    sh = Image.new('RGBA', (L_, D_), (0, 0, 0, 0))
    g = fbm((D_, L_), (2, 40 * SS), seed, 3)
    wood = np.array([.30, .19, .11])[None, None] * (0.7 + 0.5 * g[..., None])
    sh.paste(Image.fromarray((wood * 255).astype(np.uint8)).convert('RGBA'), (0, 0))
    d = ImageDraw.Draw(sh); d.rectangle([0, 0, L_ - 1, D_ - 1], outline=(24, 14, 8, 255), width=SS)
    rr = np.random.default_rng(seed); x = 5 * SS
    while x < L_ - 12 * SS:
        b = bottles[rr.integers(0, len(bottles))].rotate(90 if rr.random() < .5 else -90, expand=True)
        b = b.rotate(-90, expand=True) if b.width > b.height else b
        s = (D_ - 4 * SS) / b.height; b = b.resize((max(1, int(b.width * s)), int(b.height * s)), Image.LANCZOS)
        if b.getpixel((b.width // 2, 2))[3] and rr.random() < .0: pass
        sh.alpha_composite(b, (int(x), 2 * SS)); x += b.width + 2 * SS
        if rr.random() < .12: x += 8 * SS                     # espaço vazio de vez em quando
    return sh

# ---------------- composição ----------------
def compose(level):
    img = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
    r_wall_in = 0.3735; wt = 0.0032; r_back = ro - 0.0005
    a_side = half - 0.55; a_side_in = a_side - math.degrees(wt / 0.405)
    door_half = px2deg(30, r_wall_in)
    r_ctr_in, r_ctr_out = 0.4166, 0.4232            # balcão
    a_ctr0, a_ctr1 = -6.7, 2.7

    yard = (R >= ri) & (R <= ro) & (np.abs(A) <= half)
    st0 = stone_at(U, V); st1 = stone_at(U + 173 * SS, V + 61 * SS)
    mix = np.clip((fbm((H, W), (40 * SS, 40 * SS), 99, 3) - .5) * 4 + .5, 0, 1)[..., None]
    st = st0 * mix + st1 * (1 - mix)
    img[yard] = st[yard] * .92; alpha[yard] = 1
    inner = (R > r_wall_in + wt) & (R < r_back - wt) & (np.abs(A) < a_side_in)
    fl = polar(floor_t, 520) * np.array([1.12, 1.0, .9]) * 0.95
    img[inner] = fl[inner]
    if level >= 3:                                   # cozinha: piso de pedra atrás do balcão
        kit = inner & (R > r_ctr_out)
        tile = 17 * SS; ti = np.floor((U - U.min()) / tile).astype(int) + np.floor(V / tile).astype(int)
        tn = fbm((H, W), (6 * SS, 6 * SS), 61, 3)[..., None]
        kc = np.where((ti % 2 == 0)[..., None], np.array([.42, .23, .15]), np.array([.60, .54, .44])) * (0.8 + 0.3 * tn)
        grout = ((U - U.min()) % tile < 1.2 * SS) | (V % tile < 1.2 * SS)
        kc[grout] = np.array([.25, .22, .2])
        img[kit] = kc[kit]
    walls = (R >= r_wall_in) & (R <= r_back) & (np.abs(A) <= a_side) & ~inner
    door = (R < r_wall_in + wt + .0003) & (np.abs(A) < door_half)
    walls &= ~door
    img[door & (R >= r_wall_in)] = fl[door & (R >= r_wall_in)] * .85
    sw = stone_at(U * 1.6, V * 1.6); swg = sw.mean(-1, keepdims=True)
    img[walls] = (swg * np.array([.78, .76, .74]) * 1.05 + sw * .1)[walls]
    # balcão (madeira com cravos, tábuas acompanhando a curva)
    ctr = (R >= r_ctr_in) & (R <= r_ctr_out) & (A >= a_ctr0) & (A <= a_ctr1)
    ct = polar(counter_t, 160, swap=True)
    ct = ct.mean(-1, keepdims=True) * np.array([1.0, .72, .48]) * 1.05
    img[ctr] = ct[ctr]
    solid = walls | ctr
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

    # tapete (nível 3): da porta até o balcão, radial
    if level >= 3:
        rw_ = px2deg(24, 0.395); r0_, r1_ = r_wall_in + wt + .0008, r_ctr_in - .0042
        rug = (R > r0_) & (R < r1_) & (np.abs(A) < rw_ * (0.395 / np.maximum(R, .3)))
        rn = fbm((H, W), (3, 3), 77, 2)
        rc = np.array([.42, .07, .08])[None, None] * (0.8 + 0.35 * rn[..., None])
        tx = np.abs(A) / (rw_ * 0.395 / R); pat = (np.abs(((V / (26 * SS)) % 1) - .5) + np.abs(tx * .5)) < .3
        rc[pat] *= 1.25
        arr = np.asarray(out, np.float32) / 255; arr[..., :3][rug] = rc[rug]
        out = Image.fromarray((arr * 255).astype(np.uint8)); d = ImageDraw.Draw(out, 'RGBA')
        for s_ in (-1, 1):
            d.line([P(r0_, s_ * rw_ * .395 / r0_ * .93), P(r1_, s_ * rw_ * .395 / r1_ * .93)], fill=GOLD + (255,), width=2 * SS)
            d.line([P(r0_, s_ * rw_ * .395 / r0_ * .75), P(r1_, s_ * rw_ * .395 / r1_ * .75)], fill=GOLD_D + (230,), width=SS)
        arcline(r1_ - .0005, -rw_ * .395 / r1_, rw_ * .395 / r1_, GOLD + (255,), 2 * SS, 10)

    gw = 3 * SS
    arcline(r_back - .0005, -a_side, a_side, GOLD + (255,), gw)
    arcline(r_wall_in + .0003, -a_side, -door_half, GOLD + (255,), gw)
    arcline(r_wall_in + .0003, door_half, a_side, GOLD + (255,), gw)
    for s_ in (-1, 1):
        d.line([P(r_wall_in, s_ * (a_side - .05)), P(r_back, s_ * (a_side - .05))], fill=GOLD + (255,), width=gw)
        d.line([P(r_wall_in + wt, s_ * door_half), P(r_wall_in, s_ * door_half)], fill=GOLD + (255,), width=gw)
    arcline(ri + .0015, -half + .35, half - .35, GOLD + (150,), 2 * SS)
    # balcão: contorno escuro e borda dourada voltada para a sala
    arcline(r_ctr_out, a_ctr0, a_ctr1, (30, 18, 10, 255), SS)
    for a_ in (a_ctr0, a_ctr1): d.line([P(r_ctr_in, a_), P(r_ctr_out, a_)], fill=(30, 18, 10, 255), width=SS)
    arcline(r_ctr_in + .0002, a_ctr0, a_ctr1, GOLD + (255,), 2 * SS)
    # janelas
    wr = r_wall_in + wt / 2
    for a in (-3.9, 3.9, -6.6, 6.6):
        da = px2deg(12, wr)
        arcline(wr, a - da, a + da, (120, 160, 190, 255), int(wt * sc * .45)); arcline(wr, a - da, a + da, (200, 225, 240, 160), SS)
    for s_ in (-1, 1):
        a_w = s_ * (a_side - math.degrees(wt / 2 / .398))
        d.line([P(.398 - px2r(15), a_w), P(.398 + px2r(15), a_w)], fill=(120, 160, 190, 255), width=int(wt * sc * .45))

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
    def at(r, a, dt_px, dr_px):
        """desloca a partir de (r,a): dt_px tangencial (+ = sentido horário), dr_px radial (+ = para a muralha)"""
        r2 = r + px2r(dr_px); return r2, a + px2deg(dt_px, r2)
    rr = np.random.default_rng(level * 7 + 1)
    FX = []
    def fx(kind, r, a, **kw):
        x, y = P(r, a); FX.append(dict(type=kind, x=round(x / W, 3), y=round(y / H, 3), **kw))

    # folhas da porta abertas
    for s_ in (-1, 1):
        lf = Image.new('RGBA', (30 * SS, 6 * SS), (70, 46, 28, 255))
        ImageDraw.Draw(lf).rectangle([0, 0, 30 * SS - 1, 6 * SS - 1], outline=(22, 14, 8, 255), width=SS)
        ImageDraw.Draw(lf).rectangle([2 * SS, 1 * SS, 5 * SS, 5 * SS], fill=GOLD_D + (255,))
        x0, y0 = P(r_wall_in + wt, s_ * door_half)
        lf = lf.rotate(s_ * 72, expand=True, resample=Image.BICUBIC)
        cx_, cy_ = x0 - s_ * 15 * SS * math.cos(math.radians(72)), y0 - 15 * SS * math.sin(math.radians(72))
        out.alpha_composite(lf, (int(cx_ - lf.width / 2), int(cy_ - lf.height / 2)))

    # ---------- fundo: prateleira de vinhos, barris, lareira ----------
    r_shelf = r_back - wt - px2r(12)
    shelf_len = int((a_ctr1 - a_ctr0 - 2.2) * math.pi / 180 * r_shelf * sc / SS)
    a_shelf = (a_ctr0 + 2.2 + a_ctr1) / 2
    # a prateleira é reta; dividimos em 3 trechos para acompanhar a curva
    seg = shelf_len // 3
    for k in range(3):
        a_k = a_shelf + (k - 1) * px2deg(seg + 2, r_shelf)
        paste(make_shelf(seg, 22, S['bottles'], 30 + k + level), r_shelf, a_k, seg, sh_alpha=.4)
    r_bb = (r_ctr_out + r_shelf) / 2 - px2r(4)
    paste(S['barrel'], r_back - wt - px2r(22), a_ctr0 + .2, 42)                 # barris na ponta do balcão
    paste(S['barrel'], r_bb - px2r(2), a_ctr0 + 1.25, 38)
    if level >= 2: paste(S['keg'], r_ctr_in - px2r(16), a_side_in - px2deg(22, .41), 34)
    # lado direito do fundo
    a_fp = (a_ctr1 + a_side_in) / 2 + .25
    r_fp = r_back - wt - px2r(23) + .0009
    if level == 1:
        paste(S['crate'], r_fp - px2r(4), a_fp - 0.6, 62, rot_extra=4)
        paste(S['keg'], r_fp - px2r(42), a_fp + 1.4, 36); paste(S['keg'], r_fp - px2r(46), a_fp - 0.2, 32)
        paste(S['barrel'], r_fp - px2r(6), a_fp + 1.75, 40)
    else:
        glow(r_fp - .004, a_fp, 80, (255, 130, 40), 70)
        paste(make_fireplace(level), r_fp, a_fp, 104, sh_alpha=.45)
        paste(S['pot'], r_fp - px2r(2), a_fp - 0.55, 30, sh_alpha=.4)
        if level >= 3: paste(S['pot'], r_fp, a_fp + 0.75, 26, rot_extra=40, sh_alpha=.4)
        fx('smoke', r_fp + px2r(14), a_fp, color='#8a8580')
        fx('glow', r_fp, a_fp, color='#ff7a1a', radius=0.08)
    if level >= 3:     # bancada da cozinha com pão e frutas
        r_k = r_fp - px2r(50)
        paste(S['board'], r_k, a_fp - 0.9, 40, rot_extra=0)
        paste(S['croissant'], r_k + px2r(2), a_fp - 1.1, 15, rot_extra=20, sh_alpha=.4, sh_off=2)
        paste(S['croissant'], r_k - px2r(3), a_fp - 0.6, 15, rot_extra=-15, sh_alpha=.4, sh_off=2)
        paste(S['basket'], r_k, a_fp + 0.7, 34, rot_extra=-6)
        for k in range(5):
            paste(S['apple'], r_k + px2r(rr.uniform(-6, 6)), a_fp + 0.7 + px2deg(rr.uniform(-10, 10), r_k), 9, rot_extra=rr.uniform(0, 360), sh_alpha=.4, sh_off=1)

    # ---------- itens no balcão e banquetas ----------
    r_top = (r_ctr_in + r_ctr_out) / 2
    items = [('jug', 24, -5.6), ('gob', 12, -4.4), ('gob', 12, -3.8), ('bot', 26, -2.6), ('gob', 12, -1.2), ('plate', 22, 0.4), ('gob', 12, 1.9)]
    if level >= 3: items += [('plate', 18, -0.4), ('plate', 18, 1.2)]
    for kind, sz, a in items:
        if kind == 'gob': im = S['goblets'][rr.integers(0, 3)]
        elif kind == 'bot': im = S['bottles'][rr.integers(0, 4)]
        else: im = S[kind]
        paste(im, r_top, a, sz, rot_extra=(90 if kind == 'bot' else rr.uniform(-30, 30)), sh_alpha=.45, sh_off=2)
        if kind == 'plate' and level >= 2:
            paste(S['croissant'] if rr.random() < .6 else S['apple'], r_top, a, 11 if level < 3 else 12, rot_extra=rr.uniform(0, 360), sh_alpha=.4, sh_off=1)
    r_stool = r_ctr_in - px2r(15)
    for k in range(6 if level < 3 else 0):
        a = a_ctr0 + 0.9 + k * px2deg(38, r_stool)
        paste(S['stool'], r_stool, a, 27, rot_extra=rr.uniform(0, 360), sh_alpha=.5, sh_off=3)
    if level >= 3:   # restaurante: banquetas viram cadeiras altas com encosto
        for k in range(5):
            a = a_ctr0 + 1.0 + k * px2deg(46, r_stool)
            paste(S['chair'], r_stool - px2r(2), a, 26, rot_extra=180, sh_alpha=.5, sh_off=3)

    # ---------- salão ----------
    def round_table(r, a, n_stools, extras, size=74):
        paste(S['table_r'], r, a, size, rot_extra=rr.uniform(0, 360), sh_alpha=.55, sh_off=6)
        for k in range(n_stools):
            ang = rr.uniform(-15, 15) + k * 360 / n_stools + 30
            dt, dr = math.cos(math.radians(ang)) * (size / 2 + 9), math.sin(math.radians(ang)) * (size / 2 + 9)
            r2, a2 = at(r, a, dt, dr)
            paste(S['stool'], r2, a2, 27, rot_extra=rr.uniform(0, 360), sh_alpha=.5, sh_off=3)
        for kind, dt, dr, sz in extras:
            r2, a2 = at(r, a, dt, dr)
            if kind == 'lantern':
                glow(r2, a2, 34, (255, 190, 100), 80); fx('glow', r2, a2, color='#ffc56b', radius=0.04)
                paste(S['lantern'], r2, a2, sz, sh_alpha=.5, sh_off=3)
            else:
                im = S['goblets'][rr.integers(0, 3)] if kind == 'gob' else S[kind]
                paste(im, r2, a2, sz, rot_extra=rr.uniform(0, 360), sh_alpha=.45, sh_off=2)
                if kind == 'plate': paste(S['croissant'] if rr.random() < .5 else S['apple'], r2, a2, 11, rot_extra=rr.uniform(0, 360), sh_alpha=.4, sh_off=1)

    if level == 1:
        round_table(.3925, -4.7, 3, [('lantern', 0, 0, 22), ('gob', 14, 8, 12)])
        round_table(.3925, 4.7, 3, [('jug', -6, 4, 22), ('gob', 12, -8, 12)])
        round_table(.4025, 0.0, 3, [('lantern', 0, 0, 22), ('gob', -14, 6, 12), ('gob', 12, -6, 12)])
    elif level == 2:
        round_table(.3905, -5.5, 3, [('lantern', 0, 0, 22), ('plate', 14, 8, 21)])
        round_table(.3905, 5.5, 3, [('jug', -6, 4, 22), ('gob', 12, -8, 12), ('gob', 14, 6, 12)])
        round_table(.4015, -2.3, 3, [('plate', -10, 6, 21), ('gob', 12, -6, 12), ('gob', 8, 12, 12)])
        round_table(.4015, 2.3, 3, [('lantern', 0, 0, 22), ('plate', 12, -8, 21)])
    else:
        # mesas de jantar com toalha, compridas na direção radial; cadeiras dos dois lados
        for a_t in (-5.45, -2.25, 2.25, 5.45):
            r_t = .3935
            paste(S['table_d'], r_t, a_t, 100, rot_extra=90, sh_alpha=.6, sh_off=6)
            paste(make_cloth(58, 106, 100 + int(a_t * 10)), r_t, a_t, 106, shadow=False)
            for side in (-1, 1):
                for dr in (-24, 24):
                    r2, a2 = at(r_t, a_t, side * 46, dr)
                    paste(S['chair'], r2, a2, 30, rot_extra=-90 * side, sh_alpha=.55, sh_off=4)
                    r3, a3 = at(r_t, a_t, side * 16, dr)
                    paste(S['plate'], r3, a3, 19, rot_extra=rr.uniform(0, 360), sh_alpha=.35, sh_off=1)
                    paste(S['croissant'] if rr.random() < .5 else S['apple'], r3, a3, 11, rot_extra=rr.uniform(0, 360), sh_alpha=.4, sh_off=1)
                    r4, a4 = at(r_t, a_t, side * 9, dr + 14)
                    paste(S['goblets'][rr.integers(0, 3)], r4, a4, 11, sh_alpha=.4, sh_off=1)
            paste(S['jug'], r_t, a_t, 17, rot_extra=rr.uniform(0, 360), sh_alpha=.4, sh_off=2)
        # lustre sobre o tapete, perto do balcão
        r_ch = .4095
        glow(r_ch, 0, 70, (255, 200, 110), 90)
        paste(S['chand'], r_ch, 0, 54, sh_alpha=.35, sh_off=10)
        fx('glow', r_ch, 0, color='#ffd27a', radius=0.09)

    # ---------- pátio ----------
    r_y = (ri + r_wall_in) / 2
    if level == 1:
        a_l = -px2deg(48, r_y); glow(r_y, a_l, 26, (255, 180, 90), 80); paste(S['lantern'], r_y, a_l, 20, sh_alpha=.5, sh_off=3)
        fx('glow', r_y, a_l, color='#ffb347', radius=0.035)
        paste(S['barrel'], r_y + px2r(4), -6.4, 40); paste(S['keg'], r_y - px2r(10), -5.3, 30)
        paste(S['crate'], r_y, 5.6, 56, rot_extra=-6)
    else:
        for s_ in (-1, 1):
            a = s_ * px2deg(52, r_y)
            glow(r_y, a, 46, (255, 120, 30), 70); paste(make_brazier(s_ + 3, gold=level >= 3), r_y, a, 40)
            fx('glow', r_y, a, color='#ff7a1a', radius=0.06); fx('sparks', r_y, a)
        if level == 2:
            paste(S['barrel'], r_y + px2r(4), -6.4, 40); paste(S['keg'], r_y - px2r(10), -5.3, 30)
            round_table(r_y, 4.6, 2, [('jug', 0, 0, 16)], size=52)
        else:
            for s_ in (-1, 1):
                paste(S['plant'], r_y, s_ * px2deg(108, r_y), 44, rot_extra=rr.uniform(0, 360))
                a_t = s_ * 5.6
                paste(S['table_r'], r_y, a_t, 50, sh_alpha=.55, sh_off=5)
                paste(make_cloth(46, 46, 9 + s_), r_y, a_t, 46, shadow=False)
                for side in (-1, 1):
                    r2, a2 = at(r_y, a_t, side * 34, 0)
                    paste(S['chair'], r2, a2, 26, rot_extra=-90 * side, sh_alpha=.55, sh_off=4)
                paste(S['goblets'][1], r_y, a_t - .3, 9, sh_alpha=.4, sh_off=1); paste(S['plate'], r_y, a_t + .35, 15, sh_alpha=.35, sh_off=1)
            for s_ in (-1, 1): paste(S['plant'], .407, s_ * (a_side_in - px2deg(20, .407)), 38, rot_extra=rr.uniform(0, 360))

    clamp = ((R >= ri) & (R <= ro) & (np.abs(A) <= half)).astype(np.float32)
    out.putalpha(Image.fromarray((np.asarray(out.split()[3], np.float32) * clamp).astype(np.uint8)))
    out = out.resize((W0, H0), Image.LANCZOS)
    m = Image.open(f'{PIPE}/templates/outer_arc_mask.png').convert('L')
    out.putalpha(Image.fromarray(np.minimum(np.asarray(out.split()[3]), np.asarray(m))))
    return out, FX

names = {1: 'tavern.outer.png', 2: 'tavern.outer.lv2.png', 3: 'tavern.outer.lv3.png'}
allfx = {}
for lv in (1, 2, 3):
    im, fxl = compose(lv); im.save(f'{OUT}/{names[lv]}'); allfx[lv] = fxl; print('ok', lv)
json.dump(allfx, open(f'{OUT}/fx_por_nivel.json', 'w'), indent=1)
