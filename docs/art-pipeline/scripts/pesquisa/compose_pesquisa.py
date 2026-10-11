"""Laboratório de Pesquisa (research_lab) - arte outer 768x506, 3 níveis.
Interior visto de cima (sem telhado), no padrão da Taverna/Quartel: muralha no topo, porta voltada para o centro.
Uso: python3 -I compose_pesquisa.py <pasta_pipeline> <renders_arquivo> <stonewall_23_basecolor.png> <renders_plantas> <pasta_saida>
  pasta_pipeline : docs/art-pipeline (layout.v4.json, templates/, renders/caixote.png, renders/candelabro.png)
  renders_arquivo: docs/art-pipeline/renders/arquivo (mesa, gaveteiro, bau, lamparina, castical2/3, pilha1-3, livros_fileira)
  stonewall      : art-sources/originals/stonewall_23_basecolor-2K.png
  renders_plantas: docs/art-pipeline/renders (potted_plant_01.png)
Feito por código: pergaminhos (fechados, abertos, pontas em espiral, cestos, nichos), papéis, mapa,
lupa, tinteiro e pena, selos de cera, quadro de comparação com fios vermelhos, lente de análise,
cadeiras, piso de tábuas, estantes, tapete e braseiros."""
import json, math, sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

PIPE, RA, STONE, RPL, OUT = sys.argv[1:6]
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
INK = (58, 40, 26)

def noise(shape, cell, seed):
    g = np.random.default_rng(abs(int(seed))).random((max(2, shape[0] // cell[0] + 2), max(2, shape[1] // cell[1] + 2))).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((g.shape[1] * cell[1], g.shape[0] * cell[0]), Image.BICUBIC)
    return np.asarray(im, np.float32)[:shape[0], :shape[1]] / 255
def fbm(shape, cell, seed, oct=4):
    acc = np.zeros(shape, np.float32); amp = 1; tot = 0
    for o in range(oct):
        c = (max(1, cell[0] >> o), max(1, cell[1] >> o)); acc += amp * noise(shape, c, seed + o); tot += amp; amp *= .5
    return acc / tot
def to_img(rgb, a=None):
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    if a is not None: im.putalpha(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)))
    return im
def crop_a(im): return im.crop(im.split()[3].getbbox())

# ---------------- texturas ----------------
stone = np.asarray(Image.open(STONE).convert('RGB').resize((1024, 1024), Image.LANCZOS), np.float32) / 255
def stone_at(Uc, Vc, k=1.0):
    th, tw = stone.shape[:2]; return stone[(Vc * k).astype(int) % th, (Uc * k).astype(int) % tw]

def plank_tex(n=1024, seed=3):
    """tábuas corridas (comprimento na horizontal), madeira de nogueira escura"""
    rr = np.random.default_rng(abs(int(seed))); rows = 16; rh = n // rows
    grain = fbm((n, n), (3, 90), seed, 4); fine = fbm((n, n), (1, 25), seed + 9, 2)
    wx = np.abs(np.linspace(-1, 1, n))[None, :]                  # torna o ruído contínuo na emenda horizontal
    grain = grain * (1 - wx) + np.roll(grain, n // 2, 1) * wx; fine = fine * (1 - wx) + np.roll(fine, n // 2, 1) * wx
    tex = np.zeros((n, n, 3), np.float32)
    base = np.array([.36, .22, .13])
    for i in range(rows):
        y0 = i * rh; start = int(rr.integers(0, n)); pos = 0
        while pos < n:
            ln = int(min(rr.integers(220, 480), n - pos))
            if n - pos - ln < 120: ln = n - pos
            tone = rr.uniform(.78, 1.15); hue = rr.uniform(-.03, .03)
            cols = (start + pos + np.arange(ln)) % n
            c = (base + np.array([hue, hue * .5, 0])) * tone
            g_ = grain[y0:y0 + rh][:, cols]; f_ = fine[y0:y0 + rh][:, cols]
            blk = c * (0.72 + 0.45 * g_[..., None]) * (0.9 + 0.15 * f_[..., None])
            blk[:, -2:] *= .45
            tex[y0:y0 + rh, cols] = blk
            pos += ln
        tex[y0:y0 + 2] *= .5
    return tex
floor_t = plank_tex()
def polar(tex, tile_px):
    th, tw = tex.shape[:2]; k = tw / (tile_px * SS)
    return tex[(V * k).astype(int) % th, ((U - U.min()) * k).astype(int) % tw]

# ---------------- renders ----------------
def rgba(p): return crop_a(Image.open(p).convert('RGBA'))
def bright(im, k, sat=1.0):
    a = im.split()[3]; im = ImageEnhance.Brightness(im.convert('RGB')).enhance(k)
    im = ImageEnhance.Color(im).enhance(sat).convert('RGBA'); im.putalpha(a); return im
RS = {}
RS['mesa'] = bright(rgba(f'{RA}/mesa.png'), .8, .75)
RS['gav'] = rgba(f'{RA}/gaveteiro.png')
RS['bau'] = rgba(f'{RA}/bau.png')
RS['lamp'] = rgba(f'{RA}/lamparina.png')
RS['cas2'] = rgba(f'{RA}/castical2.png'); RS['cas3'] = rgba(f'{RA}/castical3.png')
RS['pilhas'] = [rgba(f'{RA}/pilha{i}.png') for i in (1, 2, 3)]
RS['row'] = Image.open(f'{RA}/livros_fileira.png').convert('RGBA')
RS['crate'] = rgba(f'{PIPE}/renders/caixote.png')
RS['cand'] = rgba(f'{PIPE}/renders/candelabro.png')
RS['plant'] = rgba(f'{RPL}/potted_plant_01.png')

def smooth(x, a, b): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def gold_fittings(im):
    a = np.asarray(im).astype(np.float32) / 255; rgb = a[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1); sat = (mx - mn) / (mx + 1e-4); lum = rgb.mean(-1)
    m = smooth(0.32 - sat, 0, 0.12) * (a[..., 3] > 0)
    goldc = np.clip(lum[..., None] * 2.1, 0, 1.25) * np.array(GOLD) / 255
    rgb = rgb * (1 - m[..., None]) + goldc * m[..., None]
    return Image.fromarray((np.dstack([rgb.clip(0, 1), a[..., 3]]) * 255).astype(np.uint8))
def amber_shade(im):
    a = np.asarray(im).astype(np.float32) / 255; rgb = a[..., :3]; lum = rgb.mean(-1)
    m = smooth(lum, 0.45, 0.65)[..., None]
    amber = (0.6 + 0.7 * lum[..., None]) * np.array([1.0, 0.66, 0.26])
    rgb = rgb * (1 - m) + amber * m
    return Image.fromarray((np.dstack([rgb.clip(0, 1), a[..., 3]]) * 255).astype(np.uint8))
RS['lamp_a'] = amber_shade(RS['lamp'])

# =====================================================================
#  PEÇAS FEITAS POR CÓDIGO
# =====================================================================
def parchment_arr(wd, ht, seed, tone=1.0, age=1.0):
    """pergaminho: fibras, manchas, bordas escurecidas (array RGB 0-1)"""
    f1 = fbm((ht, wd), (max(2, ht // 3), max(2, wd // 3)), seed, 3)
    f2 = fbm((ht, wd), (2, 6), seed + 3, 2)
    stain = np.clip((fbm((ht, wd), (max(2, ht // 2), max(2, wd // 2)), seed + 7, 3) - .62) * 4, 0, 1)
    base = np.array([.93, .85, .66]) * tone
    col = base * (0.86 + 0.16 * f1[..., None]) * (0.95 + 0.07 * f2[..., None])
    col = col * (1 - 0.22 * age * stain[..., None]) + np.array([.55, .38, .18]) * 0.12 * age * stain[..., None]
    yy_, xx_ = np.mgrid[0:ht, 0:wd].astype(np.float32)
    e = np.minimum(np.minimum(xx_, wd - 1 - xx_), np.minimum(yy_, ht - 1 - yy_))
    col *= (0.72 + 0.28 * smooth(e, 0, 5 * SS))[..., None] ** age
    return col

def ink_lines(d, x0, y0, x1, y1, seed, gap=3.0, col=INK, alpha=125, first_head=True):
    """linhas de texto feitas de 'palavras' curtas"""
    rr = np.random.default_rng(abs(int(seed))); y = y0; first = True
    while y < y1:
        x = x0 + (rr.uniform(4, 10) * SS if first and first_head else 0)
        xe = x1 - (rr.uniform(0, .45) * (x1 - x0) if rr.random() < .25 else 0)
        while x < xe:
            wl = rr.uniform(2, 7) * SS; wl = min(wl, xe - x)
            if wl > SS: d.line([(x, y), (x + wl, y + rr.uniform(-.3, .3) * SS)], fill=col + (alpha,), width=max(1, SS))
            x += wl + rr.uniform(1.5, 2.5) * SS
        first = False; y += gap * SS
        if rr.random() < .12: y += gap * SS * .8; first = True

def sheet(wd, ht, seed, kind='text', tone=1.0):
    """folha solta. kind: text | diagram | map | ledger"""
    W_, H_ = wd * SS, ht * SS
    im = to_img(parchment_arr(W_, H_, seed, tone)); d = ImageDraw.Draw(im, 'RGBA')
    rr = np.random.default_rng(seed + 100); m = 4 * SS
    if kind == 'text':
        ink_lines(d, m, m + SS, W_ - m, H_ - m, seed)
    elif kind == 'ledger':
        for k in range(1, 3): d.line([(W_ * k / 3, m), (W_ * k / 3, H_ - m)], fill=INK + (90,), width=1)
        ink_lines(d, m, m + SS, W_ - m, H_ - m, seed, gap=3.0, first_head=False)
    elif kind == 'diagram':
        cx, cy, rad = W_ / 2, H_ * .42, min(W_, H_) * .28
        d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=INK + (200,), width=SS)
        d.ellipse([cx - rad * .6, cy - rad * .6, cx + rad * .6, cy + rad * .6], outline=INK + (150,), width=1)
        for k in range(8):
            an = math.radians(k * 45 + 10)
            d.line([(cx, cy), (cx + rad * math.cos(an), cy + rad * math.sin(an))], fill=INK + (130,), width=1)
        d.polygon([(cx, cy - rad * .9), (cx + rad * .78, cy + rad * .45), (cx - rad * .78, cy + rad * .45)], outline=(140, 30, 30, 200))
        ink_lines(d, m, cy + rad + 3 * SS, W_ - m, H_ - m, seed + 1, first_head=False)
    elif kind == 'map':
        cx, cy = W_ * .5, H_ * .5
        pts = []
        for k in range(28):
            an = k / 28 * 2 * math.pi; rad = min(W_, H_) * (0.30 + 0.09 * math.sin(3 * an + seed) + rr.uniform(-.03, .03))
            pts.append((cx + rad * math.cos(an) * 1.15, cy + rad * math.sin(an)))
        d.polygon(pts, fill=(196, 176, 128, 120), outline=INK + (200,))
        for k in range(6):
            x, y = cx + rr.uniform(-.25, .25) * W_, cy + rr.uniform(-.22, .22) * H_
            d.polygon([(x, y - 2.5 * SS), (x + 2 * SS, y + 1.5 * SS), (x - 2 * SS, y + 1.5 * SS)], fill=INK + (150,))
        route = [(W_ * .2, H_ * .75), (W_ * .38, H_ * .6), (W_ * .5, H_ * .55), (W_ * .63, H_ * .38), (W_ * .74, H_ * .3)]
        for (a1, b1), (a2, b2) in zip(route, route[1:]):
            for t in np.linspace(0, 1, 5)[:-1]:
                d.line([(a1 + (a2 - a1) * t, b1 + (b2 - b1) * t), (a1 + (a2 - a1) * (t + .12), b1 + (b2 - b1) * (t + .12))], fill=(150, 30, 30, 220), width=SS)
        x, y = route[-1]; s = 2.5 * SS
        d.line([(x - s, y - s), (x + s, y + s)], fill=(170, 25, 25, 255), width=SS); d.line([(x - s, y + s), (x + s, y - s)], fill=(170, 25, 25, 255), width=SS)
        # rosa dos ventos
        rx, ry, rs = W_ * .82, H_ * .78, 4 * SS
        d.line([(rx, ry - rs), (rx, ry + rs)], fill=INK + (200,), width=1); d.line([(rx - rs, ry), (rx + rs, ry)], fill=INK + (200,), width=1)
    d.rectangle([0, 0, W_ - 1, H_ - 1], outline=(120, 95, 60, 200), width=1)
    return im

def wax_seal(dia=9, col=(150, 24, 24)):
    D = dia * SS; im = Image.new('RGBA', (D + 2 * SS, D + 2 * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    rr = np.random.default_rng(dia)
    pts = [(D / 2 + SS + (D / 2) * (1 + rr.uniform(-.08, .1)) * math.cos(t), D / 2 + SS + (D / 2) * (1 + rr.uniform(-.08, .1)) * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 18, endpoint=False)]
    d.polygon(pts, fill=col + (255,))
    c = D / 2 + SS; r2 = D * .3
    d.ellipse([c - r2, c - r2, c + r2, c + r2], outline=tuple(int(v * .6) for v in col) + (255,), width=SS)
    d.ellipse([c - D * .42, c - D * .42, c - D * .1, c - D * .1], fill=tuple(min(255, int(v * 1.5)) for v in col) + (120,))
    return im

def scroll_closed(length=60, dia=12, seed=0, ribbon=(150, 30, 30), caps=GOLD_D, sealed=False, tone=1.0):
    """pergaminho enrolado deitado: cilindro de papel, varetas de madeira com ponteiras e fita amarrada"""
    rr = np.random.default_rng(abs(int(seed)))
    Lp, Dp = length * SS, dia * SS
    knob = int(dia * .55 * SS); rod = int(dia * .38 * SS)
    tot = Lp + 2 * (knob + rod)
    im = Image.new('RGBA', (tot, Dp + 2 * SS), (0, 0, 0, 0))
    t = parchment_arr(Lp, Dp, seed, tone, age=.5)
    y = np.linspace(-1, 1, Dp)
    cyl = 0.5 + 0.62 * np.sqrt(np.clip(1 - y ** 2, 0, 1)) + 0.28 * np.exp(-((y + .38) / .22) ** 2)
    t = t * cyl[:, None, None]
    # camadas do papel aparecendo perto das bordas do rolo
    xs = np.arange(Lp)
    for k in range(3):
        band = (np.abs(xs - (k + 1) * 1.6 * SS) < .6 * SS) | (np.abs(xs - (Lp - 1 - (k + 1) * 1.6 * SS)) < .6 * SS)
        t[:, band] *= .82
    # linha da borda da folha enrolada (aba) correndo pelo comprimento
    lip = int(Dp * rr.uniform(.58, .7)); t[lip:lip + max(1, SS // 2)] *= .7; t[lip + SS // 2:lip + SS] *= 1.08
    paper = to_img(t); im.alpha_composite(paper, (knob + rod, SS))
    d = ImageDraw.Draw(im)
    cy_ = SS + Dp / 2
    for side in (0, 1):
        x0 = 0 if side == 0 else tot - (knob + rod)
        rx0, rx1 = (x0 + knob, x0 + knob + rod) if side == 0 else (x0, x0 + rod)
        kx0, kx1 = (x0, x0 + knob) if side == 0 else (x0 + rod, x0 + rod + knob)
        rh = Dp * .26
        d.rectangle([rx0, cy_ - rh, rx1, cy_ + rh], fill=(92, 58, 32, 255))
        d.line([(rx0, cy_ - rh * .3), (rx1, cy_ - rh * .3)], fill=(140, 96, 58, 255), width=max(1, SS // 2))
        kr = Dp * .36
        d.ellipse([kx0, cy_ - kr, kx1, cy_ + kr], fill=caps + (255,), outline=tuple(int(v * .5) for v in caps) + (255,), width=max(1, SS // 2))
        d.ellipse([kx0 + (kx1 - kx0) * .25, cy_ - kr * .7, kx0 + (kx1 - kx0) * .6, cy_ - kr * .15], fill=tuple(min(255, int(v * 1.45)) for v in caps) + (200,))
    # fita amarrada com laço
    if ribbon is not None:
        rx = knob + rod + int(Lp * rr.uniform(.38, .55)); rw = max(2, int(2.6 * SS))
        dk = tuple(int(v * .6) for v in ribbon)
        d.rectangle([rx, SS, rx + rw, SS + Dp], fill=ribbon + (255,)); d.line([(rx + rw, SS), (rx + rw, SS + Dp)], fill=dk + (255,), width=max(1, SS // 2))
        by = SS + Dp * .5
        d.polygon([(rx + rw / 2, by), (rx - 4 * SS, by - 3.2 * SS), (rx - 4 * SS, by + 1.5 * SS)], fill=ribbon + (255,), outline=dk + (255,))
        d.polygon([(rx + rw / 2, by), (rx + rw + 4 * SS, by - 3.2 * SS), (rx + rw + 4 * SS, by + 1.5 * SS)], fill=ribbon + (255,), outline=dk + (255,))
        d.line([(rx + rw / 2, by), (rx - 1 * SS, by + 6 * SS)], fill=ribbon + (255,), width=SS)
        d.line([(rx + rw / 2, by), (rx + rw + 2 * SS, by + 6.5 * SS)], fill=ribbon + (255,), width=SS)
        if sealed:
            s = wax_seal(7); im.alpha_composite(s, (int(rx + rw / 2 - s.width / 2), int(by - s.height / 2)))
    return im

def scroll_end(dia, seed, tone=1.0):
    """rolo visto pela ponta: espiral do papel enrolado em volta da vareta"""
    D = int(dia * SS); im = Image.new('RGBA', (D, D), (0, 0, 0, 0))
    yy_, xx_ = np.mgrid[0:D, 0:D].astype(np.float32); c = (D - 1) / 2
    rad = np.hypot(xx_ - c, yy_ - c); th = np.arctan2(yy_ - c, xx_ - c)
    rr = np.random.default_rng(abs(int(seed))); turns = max(3, dia / 2.2); ph = rr.uniform(0, 6.28)
    s = (rad / (D / 2) * turns - (th + ph) / (2 * math.pi)) % 1
    base = np.array([.90, .82, .64]) * tone * rr.uniform(.88, 1.05)
    col = base * (0.78 + 0.22 * smooth(np.abs(s - .5), .32, .5)[..., None] * -1 + .22)
    col = col * (1 - 0.35 * (s < .14)[..., None])
    col *= (1 - 0.25 * (rad / (D / 2)) ** 3)[..., None]
    a = (rad <= D / 2).astype(np.float32)
    core = rad < D * .12
    col[core] = np.array([.36, .22, .12])
    im = to_img(col, a); d = ImageDraw.Draw(im)
    d.ellipse([0, 0, D - 1, D - 1], outline=(110, 82, 48, 255), width=max(1, SS // 2))
    return im

def scroll_open(wd=70, ht=46, seed=0, kind='text', roll_dia=9):
    """pergaminho aberto: folha estendida com rolos nas duas pontas (esquerda e direita)"""
    Rd = roll_dia * SS
    body = sheet(wd, ht, seed, kind)
    im = Image.new('RGBA', (body.width + 2 * Rd, body.height + 4 * SS), (0, 0, 0, 0))
    im.alpha_composite(body, (Rd, 2 * SS))
    for side in (0, 1):
        roll = scroll_closed(ht + 2, roll_dia, seed + side + 5, ribbon=None).rotate(90, expand=True)
        x = 0 if side == 0 else im.width - roll.width
        y = (im.height - roll.height) // 2
        sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); a2 = Image.new('L', im.size, 0); a2.paste(roll.split()[3], (x + (2 * SS if side == 0 else -2 * SS) , y))
        sh.putalpha(a2.point(lambda v: int(v * .35)).filter(ImageFilter.GaussianBlur(2 * SS)))
        im.alpha_composite(sh); im.alpha_composite(roll, (x, y))
    return im

def basket_of_scrolls(dia=46, seed=0, n=None):
    """cesto de vime visto de cima, cheio de rolos em pé (pontas em espiral) e alguns deitados"""
    D = dia * SS; im = Image.new('RGBA', (D, D), (0, 0, 0, 0))
    yy_, xx_ = np.mgrid[0:D, 0:D].astype(np.float32); c = (D - 1) / 2
    rad = np.hypot(xx_ - c, yy_ - c); th = np.arctan2(yy_ - c, xx_ - c)
    weave = (np.sin(th * 46) * np.sin(rad / SS * 1.6) > 0).astype(np.float32)
    col = np.array([.58, .42, .24]) * (0.75 + 0.3 * weave[..., None]) * (0.85 + 0.2 * fbm((D, D), (3, 3), seed, 2)[..., None])
    rim = rad > D / 2 - 4 * SS
    col[~rim] *= .35
    im = to_img(col, (rad <= D / 2).astype(np.float32))
    rr = np.random.default_rng(abs(int(seed)))
    # rolos em pé (empacotamento simples por tentativa)
    placed = []
    for _ in range(200):
        dd = rr.uniform(8, 12.5) * SS; ang = rr.uniform(0, 2 * math.pi); rp = rr.uniform(0, D / 2 - 4 * SS - dd / 2)
        x, y = c + rp * math.cos(ang), c + rp * math.sin(ang)
        if all(math.hypot(x - px, y - py) > (dd + pd) / 2 - .5 * SS for px, py, pd in placed):
            placed.append((x, y, dd))
    for k, (x, y, dd) in enumerate(placed):
        e = scroll_end(dd / SS, seed * 31 + k)
        sh = Image.new('RGBA', e.size, (0, 0, 0, 0)); sh.putalpha(e.split()[3].point(lambda v: int(v * .6)))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(SS)), (int(x - e.width / 2 + SS), int(y - e.height / 2 + SS)))
        im.alpha_composite(e, (int(x - e.width / 2), int(y - e.height / 2)))
    # um ou dois rolos deitados por cima, saindo do cesto
    for k in range(2 if n is None else n):
        s = scroll_closed(int(dia * .9), 9, seed + 50 + k, ribbon=[(150, 30, 30), (40, 80, 150), (40, 110, 60)][k % 3]).rotate(rr.uniform(-60, 60), expand=True, resample=Image.BICUBIC)
        big = Image.new('RGBA', (D + s.width, D + s.height), (0, 0, 0, 0)); big.alpha_composite(im, (s.width // 2, s.height // 2))
        ox, oy = rr.uniform(-.15, .15) * D, rr.uniform(-.15, .15) * D
        sh = Image.new('RGBA', s.size, (0, 0, 0, 0)); sh.putalpha(s.split()[3].point(lambda v: int(v * .5)))
        big.alpha_composite(sh.filter(ImageFilter.GaussianBlur(2 * SS)), (int(big.width / 2 - s.width / 2 + ox + 2 * SS), int(big.height / 2 - s.height / 2 + oy + 3 * SS)))
        big.alpha_composite(s, (int(big.width / 2 - s.width / 2 + ox), int(big.height / 2 - s.height / 2 + oy)))
        im = crop_a(big)
    return im

def scroll_pile(n=4, seed=0, length=52):
    """monte de rolos cruzados"""
    rr = np.random.default_rng(abs(int(seed))); S0 = int(length * 1.6) * SS
    im = Image.new('RGBA', (S0, S0), (0, 0, 0, 0))
    ribs = [(150, 30, 30), (40, 80, 150), (40, 110, 60), (120, 40, 120), None]
    for k in range(n):
        s = scroll_closed(int(length * rr.uniform(.8, 1.05)), int(rr.uniform(10, 13)), seed * 10 + k, ribbon=ribs[rr.integers(0, len(ribs))],
                          sealed=rr.random() < .35, tone=rr.uniform(.9, 1.05))
        s = s.rotate(rr.uniform(-35, 35) + (90 if k % 2 else 0) * .4, expand=True, resample=Image.BICUBIC)
        x, y = S0 / 2 + rr.uniform(-.12, .12) * S0, S0 / 2 + rr.uniform(-.12, .12) * S0
        sh = Image.new('RGBA', s.size, (0, 0, 0, 0)); sh.putalpha(s.split()[3].point(lambda v: int(v * .55)))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(2 * SS)), (int(x - s.width / 2 + 2 * SS), int(y - s.height / 2 + 2 * SS)))
        im.alpha_composite(s, (int(x - s.width / 2), int(y - s.height / 2)))
    return crop_a(im)

def wood_board(wd, ht, seed, base=(.34, .21, .12), vertical=False):
    g = fbm((ht, wd), (2, 40 * SS) if not vertical else (40 * SS, 2), seed, 3)
    col = np.array(base)[None, None] * (0.7 + 0.5 * g[..., None])
    return to_img(col)

def scroll_rack(cols=8, rows=2, cell=13, seed=5, gold=False):
    """estante de nichos (losangos/quadrados) com rolos vistos pela ponta: encosta na parede (topo = parede)"""
    C = cell * SS; fw = 3 * SS
    wd, ht = cols * C + 2 * fw, rows * C + 2 * fw
    im = wood_board(wd, ht, seed); d = ImageDraw.Draw(im)
    rr = np.random.default_rng(abs(int(seed)))
    for i in range(cols):
        for j in range(rows):
            x, y = fw + i * C, fw + j * C
            d.rectangle([x + SS, y + SS, x + C - SS, y + C - SS], fill=(24, 16, 10, 255))
            n = rr.choice([0, 1, 1, 2, 3, 3])
            if n == 0: continue
            if n == 3:
                for (ox, oy) in ((0.3, 0.32), (0.7, 0.32), (0.5, 0.72)):
                    e = scroll_end(5.2, i * 9 + j + seed); im.alpha_composite(e, (int(x + C * ox - e.width / 2), int(y + C * oy - e.height / 2)))
            elif n == 2:
                for (ox, oy) in ((0.32, 0.5), (0.7, 0.5)):
                    e = scroll_end(6, i * 5 + j + seed); im.alpha_composite(e, (int(x + C * ox - e.width / 2), int(y + C * oy - e.height / 2)))
            else:
                e = scroll_end(10, i * 7 + j + seed); im.alpha_composite(e, (int(x + C / 2 - e.width / 2), int(y + C / 2 - e.height / 2)))
                if rr.random() < .4:
                    rc = [(160, 30, 30), (40, 80, 150), (40, 110, 60)][rr.integers(0, 3)]
                    d.rectangle([x + C / 2 - SS, y + 2 * SS, x + C / 2 + SS, y + C - 2 * SS], fill=rc + (255,))
    d.rectangle([0, 0, wd - 1, ht - 1], outline=(GOLD if gold else (40, 24, 12)) + (255,), width=SS)
    return im

def book_shelf(length, depth=20, seed=1, gold=False):
    """estante de livros vista de cima: lombadas/tops dos livros (fileira do render, recolorida)"""
    Lp, Dp = length * SS, depth * SS
    im = wood_board(Lp, Dp, seed + 40); d = ImageDraw.Draw(im)
    row = RS['row']; rr = np.random.default_rng(abs(int(seed)))
    x = 3 * SS
    while x < Lp - 6 * SS:
        n = rr.integers(4, 9); bw = rr.uniform(3.2, 5.2) * SS
        for k in range(n):
            if x > Lp - 6 * SS: break
            bd = (Dp - 5 * SS) * rr.uniform(.8, 1.0)
            c = np.array([rr.uniform(.25, .55), rr.uniform(.08, .2), rr.uniform(.06, .14)])
            if rr.random() < .3: c = np.array([.12, .18, rr.uniform(.25, .4)])
            if rr.random() < .2: c = np.array([.12, rr.uniform(.22, .32), .14])
            col = tuple(int(v * 255) for v in c)
            d.rectangle([x, 2 * SS, x + bw - 1, 2 * SS + bd], fill=col + (255,))
            # páginas (bloco claro) no topo, voltado para a sala
            d.rectangle([x + .6 * SS, 2 * SS + bd * .25, x + bw - 1 - .6 * SS, 2 * SS + bd - .8 * SS], fill=(214, 196, 158, 255))
            d.line([(x, 2 * SS), (x, 2 * SS + bd)], fill=(20, 12, 8, 255), width=1)
            if rr.random() < .25: d.line([(x + bw * .2, 2 * SS + bd - SS), (x + bw * .8, 2 * SS + bd - SS)], fill=GOLD + (255,), width=1)
            x += bw
        x += rr.uniform(2, 6) * SS
        if rr.random() < .3:              # livro deitado no vão
            d.rectangle([x, 3 * SS, x + 12 * SS, Dp - 3 * SS], fill=(90, 30, 22, 255), outline=(30, 12, 8, 255)); x += 14 * SS
    d.rectangle([0, 0, Lp - 1, Dp - 1], outline=(GOLD if gold else (40, 24, 12)) + (255,), width=SS)
    return im

def magnifier(dia=20, gold=True):
    D = dia * SS; hl = int(D * .9)
    im = Image.new('RGBA', (D + hl, D), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([D - 2 * SS, D / 2 - 2.2 * SS, D + hl - 1, D / 2 + 2.2 * SS], radius=2 * SS, fill=(70, 38, 20, 255), outline=(30, 16, 8, 255))
    d.rectangle([D - 2 * SS, D / 2 - 2.6 * SS, D + 3 * SS, D / 2 + 2.6 * SS], fill=(GOLD if gold else (150, 150, 150)) + (255,))
    ring = GOLD if gold else (160, 160, 160)
    d.ellipse([0, 0, D - 1, D - 1], fill=(190, 215, 225, 90), outline=ring + (255,), width=int(2.2 * SS))
    d.ellipse([D * .22, D * .18, D * .48, D * .4], fill=(255, 255, 255, 140))
    d.arc([2.5 * SS, 2.5 * SS, D - 2.5 * SS, D - 2.5 * SS], 200, 300, fill=(255, 255, 255, 160), width=SS)
    return im

def inkwell_quill(seed=0):
    S0 = 40 * SS; im = Image.new('RGBA', (S0, S0), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c = 12 * SS; r = 7 * SS
    d.ellipse([c - r, c - r, c + r, c + r], fill=(30, 34, 40, 255), outline=(10, 10, 12, 255), width=SS)
    d.ellipse([c - r * .55, c - r * .55, c + r * .55, c + r * .55], fill=(8, 8, 14, 255))
    d.ellipse([c - r * .7, c - r * .75, c - r * .2, c - r * .3], fill=(140, 160, 180, 130))
    # pena: haste + barbas
    x0, y0, x1, y1 = c, c, S0 - 3 * SS, S0 - 4 * SS
    n = 26
    for k in range(n):
        t = k / n; x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
        wv = (math.sin(t * math.pi) ** .7) * 5.5 * SS * (0.2 if t < .25 else 1)
        nx, ny = -(y1 - y0), (x1 - x0); ln = math.hypot(nx, ny); nx, ny = nx / ln, ny / ln
        col = (236, 230, 216, 255) if k % 5 else (200, 190, 170, 255)
        d.line([(x, y), (x + nx * wv + (x1 - x0) / n * 1.5, y + ny * wv + (y1 - y0) / n * 1.5)], fill=col, width=SS)
        d.line([(x, y), (x - nx * wv * .7 + (x1 - x0) / n * 1.5, y - ny * wv * .7 + (y1 - y0) / n * 1.5)], fill=col, width=SS)
    d.line([(x0, y0), (x1, y1)], fill=(170, 150, 120, 255), width=SS)
    return im

def candle(dia=9):
    D = dia * SS; im = Image.new('RGBA', (D * 3, D * 3), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = D * 1.5
    d.ellipse([c - D * .9, c - D * .9, c + D * .9, c + D * .9], fill=(150, 112, 40, 255), outline=(90, 66, 24, 255))
    d.ellipse([c - D * .5, c - D * .5, c + D * .5, c + D * .5], fill=(238, 228, 200, 255))
    g = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(g).ellipse([c - D * 1.2, c - D * 1.2, c + D * 1.2, c + D * 1.2], fill=(255, 190, 90, 120))
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(D * .5)))
    ImageDraw.Draw(im).ellipse([c - D * .18, c - D * .18, c + D * .18, c + D * .18], fill=(255, 240, 180, 255))
    return im

def open_book(wd=60, ht=42, seed=3, ribbon=(160, 30, 30)):
    wd *= SS; ht *= SS
    im = Image.new('RGBA', (wd, ht + 8 * SS), (0, 0, 0, 0)); dd = ImageDraw.Draw(im)
    dd.rounded_rectangle([0, 0, wd - 1, ht - 1], radius=3 * SS, fill=(74, 26, 18, 255), outline=(36, 12, 8, 255), width=SS)
    pw = (wd - 8 * SS) // 2
    for i, x in enumerate((4 * SS, 4 * SS + pw)):
        pg = parchment_arr(pw, ht - 8 * SS, seed + i, age=.4)
        g = np.linspace(0.75, 1.0, pw) if i == 0 else np.linspace(1.0, 0.75, pw)
        pim = to_img(pg * g[None, :, None]); d2 = ImageDraw.Draw(pim, 'RGBA')
        ink_lines(d2, 3 * SS, 3 * SS, pw - 3 * SS, ht - 11 * SS, seed * 7 + i, gap=3.0)
        im.alpha_composite(pim, (x, 4 * SS))
    dd.line([(wd // 2, 3 * SS), (wd // 2, ht - 3 * SS)], fill=(90, 70, 45, 255), width=SS)
    dd.line([(wd // 2 + 2 * SS, ht - 3 * SS), (wd // 2 + 3 * SS, ht + 6 * SS)], fill=ribbon + (255,), width=2 * SS)
    return crop_a(im)

def chair(seed=0, back=True, cushion=(120, 28, 30)):
    """cadeira vista de cima; o encosto fica no TOPO do sprite"""
    S0 = 26 * SS; im = Image.new('RGBA', (S0, S0 + 5 * SS), (0, 0, 0, 0))
    seat = wood_board(S0, S0, seed, base=(.32, .19, .1))
    m = Image.new('L', seat.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S0 - 1, S0 - 1], radius=3 * SS, fill=255); seat.putalpha(m)
    im.alpha_composite(seat, (0, 5 * SS)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([3 * SS, 8 * SS, S0 - 3 * SS, S0 + 2 * SS], radius=3 * SS, fill=cushion + (255,), outline=tuple(int(v * .55) for v in cushion) + (255,))
    d.ellipse([S0 / 2 - SS, S0 / 2 + 4 * SS, S0 / 2 + SS, S0 / 2 + 6 * SS], fill=GOLD_D + (255,))
    if back:
        d.rounded_rectangle([0, 0, S0 - 1, 6 * SS], radius=2 * SS, fill=(62, 36, 20, 255), outline=(26, 14, 8, 255), width=SS)
        d.line([(2 * SS, 2 * SS), (S0 - 3 * SS, 2 * SS)], fill=(110, 70, 40, 255), width=SS)
    return im

def brazier(seed, gold=False):
    bz = 40 * SS; b = Image.new('RGBA', (bz, bz), (0, 0, 0, 0)); d = ImageDraw.Draw(b)
    d.ellipse([0, 0, bz - 1, bz - 1], fill=(GOLD_D if gold else (52, 50, 54)) + (255,), outline=(24, 20, 16, 255), width=SS)
    d.ellipse([5 * SS, 5 * SS, bz - 6 * SS, bz - 6 * SS], fill=(28, 18, 14, 255))
    rr = np.random.default_rng(abs(int(seed)))
    for _ in range(26):
        x, y = rr.uniform(8 * SS, bz - 8 * SS, 2); r = rr.uniform(1.5, 3.5) * SS
        if math.hypot(x - bz / 2, y - bz / 2) < bz / 2 - 8 * SS:
            d.ellipse([x - r, y - r, x + r, y + r], fill=[(255, 140, 40), (255, 90, 20), (255, 210, 100)][rr.integers(0, 3)] + (255,))
    gl = Image.new('RGBA', b.size, (0, 0, 0, 0)); ImageDraw.Draw(gl).ellipse([8 * SS, 8 * SS, bz - 8 * SS, bz - 8 * SS], fill=(255, 140, 40, 150))
    b.alpha_composite(gl.filter(ImageFilter.GaussianBlur(4 * SS)))
    if gold: ImageDraw.Draw(b).ellipse([0, 0, bz - 1, bz - 1], outline=GOLD + (255,), width=SS)
    return b

def analysis_lens(dia=92):
    """lente de análise (nível 3): grande anel de latão sobre tripé, com vidro e runas gravadas"""
    D = dia * SS; pad = 14 * SS; S0 = D + 2 * pad
    im = Image.new('RGBA', (S0, S0), (0, 0, 0, 0)); d = ImageDraw.Draw(im, 'RGBA'); c = S0 / 2
    for k in range(3):                                   # pernas do tripé
        an = math.radians(k * 120 + 30)
        d.line([(c + D * .44 * math.cos(an), c + D * .44 * math.sin(an)), (c + (D / 2 + pad * .9) * math.cos(an), c + (D / 2 + pad * .9) * math.sin(an))], fill=(60, 44, 20, 255), width=4 * SS)
        d.line([(c + D * .44 * math.cos(an), c + D * .44 * math.sin(an)), (c + (D / 2 + pad * .9) * math.cos(an), c + (D / 2 + pad * .9) * math.sin(an))], fill=GOLD_D + (255,), width=2 * SS)
        fx_, fy_ = c + (D / 2 + pad * .9) * math.cos(an), c + (D / 2 + pad * .9) * math.sin(an)
        d.ellipse([fx_ - 3 * SS, fy_ - 3 * SS, fx_ + 3 * SS, fy_ + 3 * SS], fill=GOLD + (255,), outline=GOLD_D + (255,))
    yy_, xx_ = np.mgrid[0:S0, 0:S0].astype(np.float32); rad = np.hypot(xx_ - c, yy_ - c) / (D / 2)
    glass = np.zeros((S0, S0, 4), np.float32)
    inside = rad < .86
    g = np.clip(1 - rad / .86, 0, 1)
    glass[..., 0] = .75 + .25 * g; glass[..., 1] = .88 + .1 * g; glass[..., 2] = .95
    glass[..., 3] = inside * (0.06 + 0.18 * (1 - g))
    gl = Image.fromarray((glass * 255).astype(np.uint8)); im.alpha_composite(gl)
    d = ImageDraw.Draw(im, 'RGBA')
    d.ellipse([c - D / 2, c - D / 2, c + D / 2, c + D / 2], outline=GOLD + (255,), width=int(5 * SS))
    d.ellipse([c - D * .43, c - D * .43, c + D * .43, c + D * .43], outline=GOLD_D + (255,), width=SS)
    d.ellipse([c - D / 2 - SS, c - D / 2 - SS, c + D / 2 + SS, c + D / 2 + SS], outline=(70, 50, 20, 255), width=SS)
    rr = np.random.default_rng(21)
    for i in range(24):                                  # runas no anel
        an = math.radians(i * 15 + 7); cx_, cy_ = c + D * .465 * math.cos(an), c + D * .465 * math.sin(an)
        a1 = rr.uniform(0, math.pi); l = 1.4 * SS
        d.line([(cx_ - l * math.cos(a1), cy_ - l * math.sin(a1)), (cx_ + l * math.cos(a1), cy_ + l * math.sin(a1))], fill=(90, 62, 20, 255), width=SS)
    d.ellipse([c - D * .3, c - D * .34, c - D * .05, c - D * .2], fill=(255, 255, 255, 110))
    d.arc([c - D * .38, c - D * .38, c + D * .38, c + D * .38], 195, 250, fill=(255, 255, 255, 170), width=SS)
    return im

def axis_seal(sz=64):
    sz *= SS; seal = Image.new('RGBA', (sz, sz), (0, 0, 0, 0)); sd = ImageDraw.Draw(seal); c = sz / 2
    sd.ellipse([2, 2, sz - 3, sz - 3], fill=(22, 18, 16, 255), outline=GOLD + (255,), width=3 * SS)
    sd.ellipse([9 * SS, 9 * SS, sz - 9 * SS, sz - 9 * SS], outline=GOLD_D + (255,), width=SS)
    star = []
    for i in range(16):
        rr_ = (c - 12 * SS) if i % 2 == 0 else (c - 22 * SS)
        an = math.radians(i * 22.5); star.append((c + rr_ * math.sin(an), c - rr_ * math.cos(an)))
    sd.polygon(star, fill=GOLD + (255,), outline=GOLD_D + (255,))
    gates = [(155, 90, 255), (90, 200, 110), (240, 240, 240), (255, 150, 50), (70, 140, 255), (30, 30, 34), (220, 50, 50), (250, 215, 60)]
    for i, col in enumerate(gates):
        an = math.radians(i * 45); x, y = c + (c - 6 * SS) * math.sin(an), c - (c - 6 * SS) * math.cos(an)
        sd.ellipse([x - 3 * SS, y - 3 * SS, x + 3 * SS, y + 3 * SS], fill=col + (255,), outline=GOLD_D + (255,))
    sd.ellipse([c - 6 * SS, c - 6 * SS, c + 6 * SS, c + 6 * SS], fill=(22, 18, 16, 255), outline=GOLD_D + (255,), width=SS)
    return seal

def evidence_table(wd=150, ht=70, seed=0, gold=False):
    """mesa de comparação: documentos dispostos e ligados por fios vermelhos presos com alfinetes"""
    rr = np.random.default_rng(abs(int(seed)))
    top = RS['mesa'].resize((wd * SS, ht * SS), Image.LANCZOS)
    im = Image.new('RGBA', top.size, (0, 0, 0, 0)); im.alpha_composite(top)
    kinds = ['text', 'map', 'diagram', 'ledger', 'text', 'text']
    slots = [(.17, .3), (.42, .28), (.68, .32), (.86, .62), (.28, .7), (.55, .7)]
    pins = []
    for k, (fx_, fy_) in enumerate(slots):
        sw, sh_ = (34, 28) if kinds[k] == 'map' else (22, 28)
        p = sheet(sw, sh_, seed * 13 + k, kinds[k], tone=rr.uniform(.92, 1.04)).rotate(rr.uniform(-12, 12), expand=True, resample=Image.BICUBIC)
        x, y = fx_ * im.width, fy_ * im.height
        sd = Image.new('RGBA', p.size, (0, 0, 0, 0)); sd.putalpha(p.split()[3].point(lambda v: int(v * .45)))
        im.alpha_composite(sd.filter(ImageFilter.GaussianBlur(SS)), (int(x - p.width / 2 + SS), int(y - p.height / 2 + SS)))
        im.alpha_composite(p, (int(x - p.width / 2), int(y - p.height / 2)))
        pins.append((x + rr.uniform(-4, 4) * SS, y - p.height * .3))
    d = ImageDraw.Draw(im, 'RGBA')
    for a_, b_ in ((0, 1), (1, 2), (2, 3), (0, 4), (4, 5), (5, 3), (1, 5)):
        d.line([pins[a_], pins[b_]], fill=(160, 22, 22, 230), width=SS)
    for x, y in pins:
        d.ellipse([x - 1.8 * SS, y - 1.8 * SS, x + 1.8 * SS, y + 1.8 * SS], fill=((226, 184, 74) if gold else (190, 30, 30)) + (255,), outline=(60, 10, 10, 255))
    return im

# =====================================================================
#  COMPOSIÇÃO
# =====================================================================
def compose(level):
    img = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
    r_wall_in = 0.3735; wt = 0.0032; r_back = ro - 0.0005
    a_side = half - 0.55; a_side_in = a_side - math.degrees(wt / 0.405)
    door_half = px2deg(30, r_wall_in)

    yard = (R >= ri) & (R <= ro) & (np.abs(A) <= half)
    st0 = stone_at(U, V); st1 = stone_at(U + 173 * SS, V + 61 * SS)
    mix = np.clip((fbm((H, W), (40 * SS, 40 * SS), 99, 3) - .5) * 4 + .5, 0, 1)[..., None]
    st = st0 * mix + st1 * (1 - mix); g = st.mean(-1, keepdims=True)
    st = g * np.array([1.0, .93, .85]) * .58 + st * .14
    img[yard] = st[yard]; alpha[yard] = 1
    inner = (R > r_wall_in + wt) & (R < r_back - wt) & (np.abs(A) < a_side_in)
    fl = polar(floor_t, 250) * 1.05
    img[inner] = fl[inner]
    walls = (R >= r_wall_in) & (R <= r_back) & (np.abs(A) <= a_side) & ~inner
    door = (R < r_wall_in + wt + .0003) & (np.abs(A) < door_half)
    walls &= ~door
    img[door & (R >= r_wall_in)] = fl[door & (R >= r_wall_in)] * .85
    sw = stone_at(U * 1.6, V * 1.6); swg = sw.mean(-1, keepdims=True)
    img[walls] = (swg * np.array([.78, .76, .74]) * .95 + sw * .1)[walls]
    wm = Image.fromarray((walls * 255).astype(np.uint8))
    shm = Image.new('L', wm.size, 0); shm.paste(wm, (6 * SS, 7 * SS)); shm = shm.filter(ImageFilter.GaussianBlur(5 * SS))
    img *= (1 - np.asarray(shm, np.float32) / 255 * 0.55 * (~walls))[..., None]
    ao = Image.fromarray((walls * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10 * SS))
    img *= (1 - 0.25 * np.asarray(ao, np.float32) / 255 * (~walls))[..., None]

    # tapete (nível 2: simples; nível 3: azul-noite com barra dourada) da porta até a mesa central
    if level >= 2:
        rw_ = px2deg(30, 0.395); r0_, r1_ = r_wall_in + wt + .0008, .4045 - .0118
        rug = (R > r0_) & (R < r1_) & (np.abs(A) < rw_ * (0.395 / np.maximum(R, .3)))
        rn = fbm((H, W), (3, 3), 77, 2)
        base_c = np.array([.10, .12, .28]) if level >= 3 else np.array([.34, .10, .08])
        rc = base_c[None, None] * (0.8 + 0.35 * rn[..., None])
        tx = np.abs(A) / (rw_ * 0.395 / R); pat = (np.abs(((V / (22 * SS)) % 1) - .5) + np.abs(tx * .5)) < .28
        rc[pat] *= 1.45
        img[rug] = rc[rug]

    out = to_img(img, alpha)
    d = ImageDraw.Draw(out, 'RGBA')
    def arcline(r, a1, a2, col, wd, n=120):
        d.line([P(r, a1 + (a2 - a1) * i / n) for i in range(n + 1)], fill=col, width=wd, joint='curve')
    if level >= 2:
        for s_ in (-1, 1):
            d.line([P(r0_, s_ * rw_ * .395 / r0_ * .93), P(r1_, s_ * rw_ * .395 / r1_ * .93)], fill=(GOLD if level >= 3 else GOLD_D) + (255,), width=2 * SS)
            d.line([P(r0_, s_ * rw_ * .395 / r0_ * .76), P(r1_, s_ * rw_ * .395 / r1_ * .76)], fill=GOLD_D + (220,), width=SS)
        arcline(r1_ - .0004, -rw_ * .395 / r1_ * .93, rw_ * .395 / r1_ * .93, (GOLD if level >= 3 else GOLD_D) + (255,), 2 * SS, 10)

    gw = 3 * SS
    arcline(r_back - .0005, -a_side, a_side, GOLD + (255,), gw)
    arcline(r_wall_in + .0003, -a_side, -door_half, GOLD + (255,), gw)
    arcline(r_wall_in + .0003, door_half, a_side, GOLD + (255,), gw)
    for s_ in (-1, 1):
        d.line([P(r_wall_in, s_ * (a_side - .05)), P(r_back, s_ * (a_side - .05))], fill=GOLD + (255,), width=gw)
        d.line([P(r_wall_in + wt, s_ * door_half), P(r_wall_in, s_ * door_half)], fill=GOLD + (255,), width=gw)
    arcline(ri + .0015, -half + .35, half - .35, GOLD + (150,), 2 * SS)
    # janelas
    wr = r_wall_in + wt / 2
    for a in (-3.9, 3.9, -6.6, 6.6):
        da = px2deg(12, wr)
        arcline(wr, a - da, a + da, (120, 160, 190, 255), int(wt * sc * .45)); arcline(wr, a - da, a + da, (200, 225, 240, 160), SS)
    for s_ in (-1, 1):
        a_w = s_ * (a_side - math.degrees(wt / 2 / .398))
        for rw0 in (.395, .418):
            d.line([P(rw0 - px2r(13), a_w), P(rw0 + px2r(13), a_w)], fill=(120, 160, 190, 255), width=int(wt * sc * .45))

    def paste(im, r, a, size_px, rot_extra=0, shadow=True, sh_alpha=.6, sh_off=5, sh_blur=3):
        nonlocal out
        im = im.copy(); s = size_px * SS / max(im.size)
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
        im = im.rotate(-a + rot_extra, expand=True, resample=Image.BICUBIC)
        x, y = P(r, a)
        if shadow:
            s2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); s2.putalpha(im.split()[3].point(lambda v: int(v * sh_alpha)))
            s2 = s2.filter(ImageFilter.GaussianBlur(sh_blur * SS)); out.alpha_composite(s2, (int(x - im.width / 2 + sh_off * SS), int(y - im.height / 2 + (sh_off + 1) * SS)))
        out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))
    def glow(r, a, rad_px, col, alpha_):
        nonlocal out
        g = Image.new('RGBA', out.size, (0, 0, 0, 0)); x, y = P(r, a)
        ImageDraw.Draw(g).ellipse([x - rad_px * SS, y - rad_px * SS, x + rad_px * SS, y + rad_px * SS], fill=col + (alpha_,))
        out.alpha_composite(g.filter(ImageFilter.GaussianBlur(rad_px * SS * .45)))
    def at(r, a, dt_px, dr_px):
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

    gold3 = level >= 3
    CUSH = (30, 40, 90) if gold3 else (120, 28, 30)
    # ---------- parede do fundo: estantes de nichos com pergaminhos e de livros ----------
    r_sh = r_back - wt - px2r(24)
    seg_px = 100; n_seg = 6
    a_step = px2deg(seg_px + 2, r_sh)
    plan = ['books', 'scrolls', 'scrolls', 'scrolls', 'scrolls', 'books']
    for k in range(n_seg):
        a_k = (k - (n_seg - 1) / 2) * a_step
        if level == 1 and k in (0, 5): continue
        if level == 2 and k in (0, 5):
            paste(book_shelf(seg_px, 34, seed=k + level), r_sh + px2r(4), a_k, seg_px, sh_alpha=.45, sh_off=4); continue
        if plan[k] == 'scrolls' or level == 1:
            paste(scroll_rack(cols=8, rows=3, cell=12, seed=11 + k + level * 3, gold=gold3), r_sh, a_k, seg_px, sh_alpha=.5, sh_off=5)
        else:
            paste(book_shelf(seg_px, 34, seed=k + level, gold=gold3), r_sh + px2r(4), a_k, seg_px, sh_alpha=.45, sh_off=4)
    if level == 1:      # cantos ainda sem estante: caixotes e cestos de rolos
        for s_ in (-1, 1):
            a_c = s_ * 2.5 * a_step
            paste(RS['crate'], r_sh - px2r(2), a_c - s_ * .35, 66, rot_extra=rr.uniform(-6, 6))
            paste(scroll_pile(3, 40 + s_, 34), r_sh - px2r(2), a_c - s_ * .35, 54, sh_alpha=.45, sh_off=2, rot_extra=rr.uniform(-20, 20))
            paste(basket_of_scrolls(40, 60 + s_, n=1), r_sh - px2r(50), a_c + s_ * .2, 40)
    # cestos de rolos no chão, na frente das estantes (todos os níveis)
    for s_ in (-1, 1):
        paste(basket_of_scrolls(36, 70 + s_ + level, n=1), r_sh - px2r(44), s_ * .95, 36)

    # ---------- mesa central de análise ----------
    r_tab = .4045; a_lens = -px2deg(18, r_tab)
    tab_len = 230 if level >= 2 else 205
    paste(RS['mesa'], r_tab, 0, tab_len, sh_alpha=.6, sh_off=7, sh_blur=4)
    def tp(dt, dr): return at(r_tab, 0, dt, dr)
    paste(scroll_open(74, 46, 7, 'map', 10), *tp(-20, 3), 98, rot_extra=-3, sh_alpha=.45, sh_off=2, sh_blur=2)
    paste(open_book(54, 38, 5), *tp(62, -2), 58, rot_extra=5, sh_alpha=.45, sh_off=2, sh_blur=2)
    paste(sheet(22, 28, 31, 'text'), *tp(-86, 10), 28, rot_extra=-14, sh_alpha=.4, sh_off=1, sh_blur=1)
    paste(sheet(22, 28, 32, 'diagram'), *tp(-80, -12), 28, rot_extra=9, sh_alpha=.4, sh_off=1, sh_blur=1)
    if not gold3: paste(magnifier(20), *tp(-6, -10), 36, rot_extra=-35, sh_alpha=.5, sh_off=2, sh_blur=1)
    paste(inkwell_quill(), *tp(30, 12), 28, rot_extra=-20, sh_alpha=.4, sh_off=1, sh_blur=1)
    paste(wax_seal(7), *tp(24, -16), 9, shadow=False)
    paste(wax_seal(7, (40, 70, 140)), *tp(33, -18), 9, shadow=False)
    paste(scroll_closed(46, 10, 12, sealed=True), *tp(86, 16), 46, rot_extra=-8, sh_alpha=.45, sh_off=2, sh_blur=1)
    if level >= 2:
        paste(scroll_closed(40, 9, 13, (40, 80, 150)), *tp(94, -18), 40, rot_extra=12, sh_alpha=.45, sh_off=2, sh_blur=1)
        paste(sheet(20, 26, 33, 'ledger'), *tp(-98, -2), 26, rot_extra=20, sh_alpha=.4, sh_off=1, sh_blur=1)
    if level < 3:
        paste(candle(8), *tp(-60, 16), 24, shadow=False)
        fx('glow', *tp(-60, 16), color='#ffcf7a', radius=0.03, maxLevel=2)
    for dt in ((-60, 0, 60) if level >= 2 else (-46, 46)):
        r2, a2 = tp(dt, -48)
        paste(chair(abs(dt) + level, cushion=CUSH), r2, a2, 26, rot_extra=180, sh_alpha=.5, sh_off=3)
    if gold3:
        # a lente amplia o que está embaixo dela
        cx_, cy_ = P(r_tab, a_lens); rg = int(.43 * 80 * SS); src = int(rg / 1.35)
        reg = out.crop((int(cx_ - src), int(cy_ - src), int(cx_ + src), int(cy_ + src))).resize((2 * rg, 2 * rg), Image.LANCZOS)
        mk = Image.new('L', reg.size, 0); ImageDraw.Draw(mk).ellipse([0, 0, 2 * rg - 1, 2 * rg - 1], fill=255)
        reg = ImageEnhance.Brightness(reg).enhance(1.04); reg.putalpha(mk)
        glow(r_tab, a_lens, 80, (255, 214, 140), 50)
        lens = analysis_lens(80)
        sh2 = Image.new('RGBA', lens.size, (0, 0, 0, 0)); sh2.putalpha(lens.split()[3].point(lambda v: int(v * .35)))
        out.alpha_composite(sh2.filter(ImageFilter.GaussianBlur(5 * SS)), (int(cx_ - lens.width / 2 + 10 * SS), int(cy_ - lens.height / 2 + 11 * SS)))
        out.alpha_composite(reg, (int(cx_ - rg), int(cy_ - rg)))
        out.alpha_composite(lens, (int(cx_ - lens.width / 2), int(cy_ - lens.height / 2)))
        fx('glow', r_tab, a_lens, color='#ffe6a8', radius=0.075, minLevel=3)
        fx('sparks', r_tab, a_lens, color='#ffe08a', minLevel=3)
        paste(axis_seal(46), r_wall_in + wt + px2r(30), 0, 46, shadow=False)

    # ---------- lado esquerdo: mesas de leitura ----------
    a_L = -5.15
    desks = [(.4005, a_L)] if level == 1 else [(.3935, a_L), (.4185, a_L)]
    for i, (r_d, a_d) in enumerate(desks):
        paste(RS['mesa'], r_d, a_d, 122, sh_alpha=.6, sh_off=6)
        dp = lambda dt, dr: at(r_d, a_d, dt, dr)
        paste(open_book(48, 34, 20 + i + level), *dp(-6, 0), 46, rot_extra=rr.uniform(-6, 6), sh_alpha=.45, sh_off=2, sh_blur=1)
        paste(sheet(18, 24, 40 + i + level * 5, 'ledger'), *dp(32, 2), 24, rot_extra=rr.uniform(-15, 15), sh_alpha=.4, sh_off=1, sh_blur=1)
        paste(scroll_closed(34, 8, 80 + i + level, [(40, 110, 60), (40, 80, 150)][i]), *dp(36, -10), 34, rot_extra=rr.uniform(-25, 25), sh_alpha=.45, sh_off=2, sh_blur=1)
        if level >= 2:
            paste(RS['lamp_a'], *dp(-46, 6), 22, sh_alpha=.5, sh_off=3)
            glow(*dp(-46, 6), 30, (255, 180, 90), 70)
            fx('glow', *dp(-46, 6), color='#ffb347', radius=0.035, minLevel=2)
        else:
            paste(candle(8), *dp(-44, 6), 22, shadow=False)
            fx('glow', *dp(-44, 6), color='#ffcf7a', radius=0.03, maxLevel=1)
        paste(chair(i + 3 + level, cushion=CUSH), *dp(0, -28), 26, rot_extra=180 + rr.uniform(-12, 12), sh_alpha=.5, sh_off=3)
    # canto esquerdo junto à porta
    paste(RS['pilhas'][0], .3845, a_L - 1.75, 32, rot_extra=rr.uniform(-20, 20))
    paste(scroll_pile(4, 31 + level, 44), .3855, a_L + 1.3, 52, rot_extra=rr.uniform(-30, 30))
    if level >= 2:
        paste(RS['pilhas'][2], .4065, a_L - 2.0, 30, rot_extra=rr.uniform(-20, 20))
    if level >= 3:
        paste(gold_fittings(RS['bau']), .4075, -7.0, 50, rot_extra=90)
        paste(RS['cand'], .3835, a_L - .2, 34, sh_alpha=.4, sh_off=8)
        glow(.3835, a_L - .2, 40, (255, 200, 110), 80)
        fx('glow', .3835, a_L - .2, color='#ffcf7a', radius=0.05, minLevel=3)

    # ---------- lado direito: análise / comparação de documentos ----------
    a_R = 5.25
    if level == 1:
        paste(RS['mesa'], .4005, a_R, 122, sh_alpha=.6, sh_off=6)
        dp = lambda dt, dr: at(.4005, a_R, dt, dr)
        paste(scroll_open(52, 34, 61, 'text', 8), *dp(-14, 0), 66, rot_extra=4, sh_alpha=.45, sh_off=2, sh_blur=1)
        paste(magnifier(16), *dp(30, -4), 28, rot_extra=-60, sh_alpha=.5, sh_off=2, sh_blur=1)
        paste(sheet(18, 24, 62, 'diagram'), *dp(40, 8), 22, rot_extra=12, sh_alpha=.4, sh_off=1, sh_blur=1)
        paste(chair(9, cushion=CUSH), *dp(0, -28), 26, rot_extra=180, sh_alpha=.5, sh_off=3)
        paste(basket_of_scrolls(44, 3), .4175, a_R + 2.0, 44)
        paste(basket_of_scrolls(38, 4, n=2), .3855, a_R + 1.9, 38)
    else:
        paste(evidence_table(150, 76, 2 + level, gold=gold3), .4015, a_R + .15, 150, rot_extra=90, sh_alpha=.6, sh_off=6)
        for dr in (-34, 34):
            r2, a2 = at(.4015, a_R + .15, -52, dr)
            paste(chair(abs(dr) + level, cushion=CUSH), r2, a2, 25, rot_extra=-90 + rr.uniform(-10, 10), sh_alpha=.5, sh_off=3)
        paste(index_cards_gav(), .4195, a_R + 2.2, 50, rot_extra=-90)
        paste(basket_of_scrolls(40, 5), .3955, a_R + 2.25, 38)
        if level >= 3:
            paste(RS['cand'], .3835, a_R - 1.6, 34, sh_alpha=.4, sh_off=8)
            glow(.3835, a_R - 1.6, 40, (255, 200, 110), 80)
            fx('glow', .3835, a_R - 1.6, color='#ffcf7a', radius=0.05, minLevel=3)
            paste(basket_of_scrolls(36, 6, n=1), .3835, a_R + .6, 34)
        else:
            paste(scroll_pile(3, 15, 40), .3835, a_R - 1.4, 46, rot_extra=-30)
            paste(basket_of_scrolls(34, 6, n=1), .3835, a_R + .6, 32)

    # ---------- pátio ----------
    r_y = (ri + r_wall_in) / 2
    if level == 1:
        a_l = -px2deg(48, r_y); glow(r_y, a_l, 26, (255, 180, 90), 80); paste(candle(10), r_y, a_l, 24, shadow=False)
        fx('glow', r_y, a_l, color='#ffb347', radius=0.035, maxLevel=1)
        paste(RS['crate'], r_y, -5.6, 54, rot_extra=-4)
        paste(scroll_pile(3, 22, 34), r_y, -5.6, 40, rot_extra=10, sh_alpha=.45, sh_off=2)
        paste(basket_of_scrolls(34, 8, n=1), r_y, 5.4, 34)
    else:
        for s_ in (-1, 1):
            a = s_ * px2deg(52, r_y)
            glow(r_y, a, 46, (255, 120, 30), 70); paste(brazier(s_ + 3 + level, gold=gold3), r_y, a, 40)
            fx('glow', r_y, a, color='#ff7a1a', radius=0.06, minLevel=2); fx('sparks', r_y, a, minLevel=2)
        if level == 2:
            paste(RS['crate'], r_y, -5.6, 54, rot_extra=-4)
            paste(scroll_pile(3, 22, 34), r_y, -5.6, 40, rot_extra=10, sh_alpha=.45, sh_off=2)
            paste(basket_of_scrolls(34, 8, n=1), r_y, 5.4, 34)
        else:
            for s_ in (-1, 1):
                paste(RS['plant'], r_y, s_ * 5.9, 42, rot_extra=rr.uniform(0, 360))
                paste(RS['plant'], r_y, s_ * 4.1, 34, rot_extra=rr.uniform(0, 360))

    clamp = ((R >= ri) & (R <= ro) & (np.abs(A) <= half)).astype(np.float32)
    out.putalpha(Image.fromarray((np.asarray(out.split()[3], np.float32) * clamp).astype(np.uint8)))
    out = out.resize((W0, H0), Image.LANCZOS)
    m = Image.open(f'{PIPE}/templates/outer_arc_mask.png').convert('L')
    out.putalpha(Image.fromarray(np.minimum(np.asarray(out.split()[3]), np.asarray(m))))
    return out, FX

def index_cards_gav():
    """gaveteiro-fichário (render) com fichas de papel dentro da gaveta aberta"""
    im = RS['gav'].copy(); wd, ht = im.size; dd = ImageDraw.Draw(im)
    x0, x1 = int(wd * 0.42), int(wd * 0.58); y = int(ht * 0.66)
    while y < ht * 0.95:
        dd.line([(x0, y), (x1, y)], fill=(225, 210, 175, 255), width=max(2, ht // 120))
        dd.line([(x0, y + 2), (x1, y + 2)], fill=(120, 95, 60, 255), width=1)
        y += max(5, ht // 40)
    return im

if __name__ == '__main__':
    names = {1: 'research_lab.outer.png', 2: 'research_lab.outer.lv2.png', 3: 'research_lab.outer.lv3.png'}
    levels = [int(x) for x in os.environ.get('LEVELS', '1,2,3').split(',')]
    allfx = {}
    for lv in levels:
        im, fxl = compose(lv); im.save(f'{OUT}/{names[lv]}'); allfx[lv] = fxl; print('ok', lv, im.size)
    json.dump(allfx, open(f'{OUT}/fx_por_nivel.json', 'w'), indent=1)
