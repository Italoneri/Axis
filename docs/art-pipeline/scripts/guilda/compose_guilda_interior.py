"""Salão da Guilda (guild), slot outer: vista do INTERIOR (sem telhado), níveis 1, 2 e 3.
Uso: python3 -I compose_guilda_interior.py <pasta_trabalho>
Espera em <pasta_trabalho>:
  layout.v4.json, templates/outer_arc_mask.png
  tex/planks.jpg (Planks039 Color), tex/paper.jpg (Paper001 Color), tex/fabric.jpg (Fabric030 Color)
  renders/: chest, table (wooden_picnic_table), goblets, lantern, stool, shield, estoc, barris, caixote, livros, candelabro
Gera out/guild.outer.png, out/guild.outer.lv2.png, out/guild.outer.lv3.png e out/fx.json
"""
import json, math, sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageOps

SP = sys.argv[1]; T = f'{SP}/tex'; RD = f'{SP}/renders'; OUT = f'{SP}/out'
os.makedirs(OUT, exist_ok=True)
L = json.load(open(f'{SP}/layout.v4.json'))
arc = next(x for x in L['slots'] if x['type'] == 'outer')['arc']
ri, ro = arc['innerRadius'], arc['outerRadius']; half = (arc['endAngle'] - arc['startAngle']) / 2
w = 2 * ro * math.sin(math.radians(half)); W = 768; sc = W / w
H = round(W * (ro - ri * math.cos(math.radians(half))) / w)
CX, CY = W / 2, ro * sc
def P(r, a): return (CX + r * sc * math.sin(math.radians(a)), CY - r * sc * math.cos(math.radians(a)))
def norm(r, a): x, y = P(r, a); return round(x / W, 3), round(y / H, 3)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
R = np.hypot(xx - CX, CY - yy) / sc
A = np.degrees(np.arctan2(xx - CX, CY - yy))
GOLD = (226, 184, 74, 255); GOLD_D = (150, 111, 40, 255); WINE = (92, 22, 34)

def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
planks_t = load(f'{T}/planks.jpg'); paper_t = load(f'{T}/paper.jpg'); fabric_t = load(f'{T}/fabric.jpg')
def polar_tex(tex, scale_px, rot=False):
    th, tw = tex.shape[:2]
    u = (np.radians(A) * ro * sc / scale_px * tw) % tw
    v = ((ro - R) * sc / scale_px * th) % th
    return tex[u.astype(int) % th, v.astype(int) % tw] if rot else tex[v.astype(int) % th, u.astype(int) % tw]
def crop_alpha(im): return im.crop(im.split()[3].getbbox())
def rend(n): return crop_alpha(Image.open(f'{RD}/{n}.png').convert('RGBA'))
def to_img(rgb, mask):
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    im.putalpha(Image.fromarray((mask * 255).astype(np.uint8))); return im

# ---------- geometria (unidades do mapa / graus)
WALL = 0.0042                    # espessura das paredes
SIDE = half - 0.55               # face interna das paredes laterais (graus)
R_IN, R_BACK = ri + WALL, ro - WALL
DOOR = 1.45                      # meia abertura da porta (graus)
C_R1, C_R2, C_A = 0.4205, 0.4265, 4.9      # balcão: faixa radial e meia extensão
C_RET = 0.4125                   # ponta das voltas do balcão (em U)
SH_R = R_BACK - 0.0042           # prateleiras na parede do fundo

def build(level):
    fx = []
    # ---------- piso de tábuas (acompanha a curva)
    img = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
    inside = (R >= ri) & (R <= ro) & (np.abs(A) <= half)
    fl = polar_tex(planks_t, 190); fl = fl.mean(-1, keepdims=True) * 0.55 + fl * 0.45
    fl = (0.62 + 0.55 * (fl - fl.mean())) * np.array([0.66, 0.47, 0.32])
    # leve variação por tábua para não parecer repetido
    row = ((ro - R) * sc / (190 / 6.6)).astype(int)
    rng = np.random.default_rng(2); jit = rng.uniform(0.85, 1.12, 400)
    fl *= jit[row % 400][..., None]
    # escurece junto às paredes (oclusão) e esquenta onde há luz
    dwall = np.minimum.reduce([(R - R_IN) * sc, (R_BACK - R) * sc,
                               (SIDE - np.abs(A)) * np.radians(1) * R * sc])
    fl *= (0.55 + 0.45 * np.clip(dwall / 40, 0, 1))[..., None]
    img[inside] = fl[inside]; alpha[inside] = 1
    out = to_img(img, alpha)

    def light_pool(r, a, rad, col, op):
        lp = Image.new('RGBA', out.size, (0, 0, 0, 0)); x, y = P(r, a)
        ImageDraw.Draw(lp).ellipse([x - rad, y - rad, x + rad, y + rad], fill=col + (op,))
        out.alpha_composite(lp.filter(ImageFilter.GaussianBlur(rad * 0.45)))

    def shadow_of(layer, dx=6, dy=7, blur=5, op=.6):
        s2 = Image.new('RGBA', layer.size, (0, 0, 0, 0)); s2.putalpha(layer.split()[3].point(lambda v: int(v * op)))
        return s2.filter(ImageFilter.GaussianBlur(blur)), dx, dy

    def paste(im, r, a, size, rot_extra=0, shadow=True, sh_op=.6, sh_off=(6, 7)):
        im = im.copy(); s = size / max(im.size)
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
        im = im.rotate(-a + rot_extra, expand=True, resample=Image.BICUBIC)
        x, y = P(r, a)
        if shadow:
            s2, dx, dy = shadow_of(im, *sh_off, op=sh_op)
            out.alpha_composite(s2, (int(x - im.width / 2 + dx), int(y - im.height / 2 + dy)))
        out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))

    def layer_paste(rgb, mask, sh=True, dx=6, dy=7, op=.6):
        lay = to_img(rgb, mask.astype(np.float32))
        if sh:
            s2, dx, dy = shadow_of(lay, dx, dy, op=op); out.alpha_composite(s2, (dx, dy))
        out.alpha_composite(lay)

    # ---------- tapete (nível 2+): passarela vinho da porta até o balcão
    if level >= 2:
        rug_a = 1.15; r0, r1 = R_IN + 0.004, C_RET - 0.0005
        rug = (R >= r0) & (R <= r1) & (np.abs(A) <= rug_a)
        fb = polar_tex(fabric_t, 120).mean(-1, keepdims=True) * np.array(WINE) / 255 * 2.0
        border = rug & ((np.abs(A) > rug_a - 0.22) | (R < r0 + 0.0016) | (R > r1 - 0.0016))
        inner = rug & ((np.abs(np.abs(A) - (rug_a - 0.32)) < 0.05) | (np.abs(R - (r0 + 0.0026)) < 0.0003) | (np.abs(R - (r1 - 0.0026)) < 0.0003))
        rgb = fb.copy()
        gold = np.array([0.80, 0.63, 0.26]) * (0.75 + 0.5 * polar_tex(fabric_t, 120).mean(-1, keepdims=True))
        rgb = np.where((border | inner)[..., None], gold, rgb)
        layer_paste(rgb, rug, sh=True, dx=2, dy=3, op=.35)
        em = make_emblem(78); paste(em, (r0 + r1) / 2 + 0.006, 0, 78, shadow=False)

    # ---------- nível 3: mosaico dourado na entrada
    if level >= 3:
        mx, my = P(R_IN, 0); rad = 0.0085 * sc
        dd = np.hypot(xx - mx, yy - my); ang = np.degrees(np.arctan2(xx - mx, my - yy))
        semi = (dd < rad) & (R >= R_IN) & (np.abs(ang) < 90)
        rgb = np.zeros((H, W, 3), np.float32) + np.array([0.07, 0.065, 0.075])
        ring = (dd > rad * 0.84)
        rays = (np.minimum(ang % 22.5, 22.5 - ang % 22.5) < 1.5) & (dd > rad * 0.25)
        rgb[ring | rays] = [0.86, 0.69, 0.29]
        layer_paste(rgb, semi, sh=False)

    # ---------- balcão em U (madeira escura polida, borda dourada)
    top_t = polar_tex(planks_t, 260); top_t = (0.5 + 0.6 * (top_t.mean(-1, keepdims=True) - top_t.mean())) * np.array([0.40, 0.22, 0.13])
    cmask = ((R >= C_R1) & (R <= C_R2) & (np.abs(A) <= C_A)) | \
            ((R >= C_RET) & (R <= C_R2) & (np.abs(A) >= C_A - 0.95) & (np.abs(A) <= C_A))
    shine = 1 + 0.6 * np.clip(1 - np.abs(R - (C_R1 + 0.0015)) * sc / 6, 0, 1)
    layer_paste(top_t * shine[..., None], cmask, dx=7, dy=9, op=.7)
    d = ImageDraw.Draw(out, 'RGBA')
    def arcline(r, a1, a2, col, wd, n=80): d.line([P(r, a1 + (a2 - a1) * i / n) for i in range(n + 1)], fill=col, width=wd, joint='curve')
    # contorno dourado do balcão
    for sg in (-1, 1):
        d.line([P(C_RET, sg * (C_A - 0.95)), P(C_R1, sg * (C_A - 0.95))], fill=GOLD, width=3)
        d.line([P(C_RET, sg * C_A), P(C_R2, sg * C_A)], fill=GOLD_D, width=3)
        d.line([P(C_RET, sg * (C_A - 0.95)), P(C_RET, sg * C_A)], fill=GOLD, width=3)
    arcline(C_R1, -(C_A - 0.95), C_A - 0.95, GOLD, 3); arcline(C_R2, -C_A, C_A, GOLD_D, 3)

    # ---------- prateleiras na parede do fundo + estoque atrás do balcão
    shelf = (R >= SH_R) & (R <= R_BACK) & (np.abs(A) <= SIDE - 1.6)
    st = polar_tex(planks_t, 200) * np.array([0.40, 0.26, 0.15])
    layer_paste(st, shelf, dx=3, dy=4, op=.5)
    rng = np.random.default_rng(7)
    a = -(SIDE - 1.8)
    while a < SIDE - 1.8:              # livros e garrafas na prateleira
        if rng.random() < 0.55:
            b = rend('livros'); paste(b, (SH_R + R_BACK) / 2, a, 26, rot_extra=rng.uniform(-20, 20), sh_op=.4, sh_off=(2, 3))
            a += 0.75
        else:
            for k in range(rng.integers(2, 4)):
                x, y = P((SH_R + R_BACK) / 2 + rng.uniform(-0.001, 0.001), a + k * 0.28)
                c = [(40, 90, 50), (90, 40, 30), (60, 45, 25), (40, 60, 100)][rng.integers(0, 4)]
                d = ImageDraw.Draw(out, 'RGBA')
                d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=c + (255,), outline=(20, 15, 10, 255))
                d.ellipse([x - 2, y - 3, x + 1, y], fill=(230, 230, 210, 200))
            a += 0.9
    d = ImageDraw.Draw(out, 'RGBA'); arcline(SH_R, -(SIDE - 1.6), SIDE - 1.6, GOLD_D, 2)
    # cantos do fundo: barris e caixote (direita), baú (esquerda)
    barrels = Image.open(f'{RD}/barris.png').convert('RGBA')
    b1 = crop_alpha(barrels.crop((110, 60, 225, 175))); b2 = crop_alpha(barrels.crop((370, 60, 480, 175)))
    paste(b1, R_BACK - 0.0055, SIDE - 0.85, 50); paste(b2, R_BACK - 0.0145, SIDE - 0.7, 46)
    paste(rend('caixote'), R_BACK - 0.0095, SIDE - 2.35, 62, rot_extra=4)
    chest_pos = (R_BACK - 0.0085, -(SIDE - 1.25))
    if level >= 3: paste(make_open_chest(), *chest_pos, 78, rot_extra=0)
    else:          paste(rend('chest'), *chest_pos, 70, rot_extra=0)
    if level >= 3:
        fx.append({"type": "glow", **dict(zip("xy", norm(*chest_pos))), "color": "#ffd76a", "radius": 0.05, "minLevel": 3})
        fx.append({"type": "sparks", **dict(zip("xy", norm(*chest_pos))), "color": "#ffe9a0", "minLevel": 3})

    # ---------- banquinhos de frente para o balcão
    for a in (-3.3, -2.0, 2.0, 3.3):
        paste(rend('stool'), C_R1 - 0.0058, a, 28, sh_off=(4, 5))
    # ---------- objetos sobre o balcão
    lan = rend('lantern')
    lan_pos = (C_R1 + 0.003, -3.4)
    light_pool(*lan_pos, 70, (255, 170, 70), 70)
    paste(lan, *lan_pos, 30, sh_off=(4, 5))
    fx.append({"type": "glow", **dict(zip("xy", norm(*lan_pos))), "color": "#ffb347", "radius": 0.06})
    paste(make_ledger(), C_R1 + 0.003, 0.2, 40, rot_extra=-8, sh_off=(3, 4))
    paste(make_scrolls(), C_R1 + 0.003, 2.3, 44, sh_off=(3, 4))
    if level >= 2:
        paste(rend('goblets'), C_R1 + 0.003, 3.8, 30, sh_off=(3, 4), sh_op=.4)

    # ---------- paredes (pedra escura de mármore da Axis com remate dourado)
    noise = polar_tex(paper_t, 140).mean(-1, keepdims=True)
    wall_rgb = (0.10 + 0.22 * (noise - noise.mean())) * np.array([1.0, 0.97, 1.03]) + 0.02
    walls = inside & ((R < R_IN) | (R > R_BACK) | (np.abs(A) > SIDE))
    walls &= ~((R < R_IN) & (np.abs(A) <= DOOR))
    layer_paste(np.repeat(wall_rgb, 1, -1), walls, dx=5, dy=6, op=.75)
    d = ImageDraw.Draw(out, 'RGBA')
    arcline(R_BACK, -SIDE, SIDE, GOLD, 3); arcline(ro - 0.0008, -half + 0.3, half - 0.3, GOLD_D, 2)
    arcline(R_IN, -SIDE, -DOOR, GOLD, 3); arcline(R_IN, DOOR, SIDE, GOLD, 3)
    arcline(ri + 0.0008, -half + 0.3, -DOOR, GOLD_D, 2); arcline(ri + 0.0008, DOOR, half - 0.3, GOLD_D, 2)
    for sg in (-1, 1):
        d.line([P(R_IN, sg * SIDE), P(R_BACK, sg * SIDE)], fill=GOLD, width=3)
        d.line([P(R_IN, sg * DOOR), P(ri, sg * DOOR)], fill=GOLD, width=3)
    # pilares nos cantos e no meio das laterais
    for (r, a) in [(R_IN, -SIDE), (R_IN, SIDE), (R_BACK, -SIDE), (R_BACK, SIDE), (R_IN, -DOOR), (R_IN, DOOR),
                   ((R_IN + R_BACK) / 2, -SIDE), ((R_IN + R_BACK) / 2, SIDE)]:
        x, y = P(r, a); s = 11
        d.rectangle([x - s, y - s, x + s, y + s], fill=(24, 22, 26, 255), outline=GOLD, width=2)
    # soleira e portas abertas para dentro
    door_leaf = tex_img(planks_t, 22, 70, (0.72, 0.48, 0.28), crop=(0, 0, 400, 1600))
    ImageDraw.Draw(door_leaf).rectangle([0, 0, 21, 69], outline=GOLD_D, width=2)
    ImageDraw.Draw(door_leaf).ellipse([12, 30, 18, 36], fill=GOLD)
    for sg in (-1, 1):
        paste(door_leaf.rotate(sg * 35, expand=True, resample=Image.BICUBIC), R_IN + 0.0052, sg * (DOOR - 0.15), 70, sh_off=(4, 5))

    # ---------- mural de missões na parede esquerda
    board = make_board().rotate(90, expand=True)
    paste(board, (R_IN + C_R1) / 2 + 0.002, -(SIDE - 0.42), 150, sh_off=(4, 5))

    # ---------- mesas compridas (radiais), com bancos
    table = rend('table')
    cand = rend('candelabro')
    for sg in (-1, 1):
        tp = (0.3905, sg * 3.15)
        paste(table, *tp, 124, sh_off=(7, 9), sh_op=.65)
        if level >= 2:
            paste(cand, tp[0] + 0.004, tp[1], 30, sh_off=(4, 5), sh_op=.4)
            light_pool(tp[0] + 0.004, tp[1], 60, (255, 170, 70), 55)
            fx.append({"type": "glow", **dict(zip("xy", norm(tp[0] + 0.004, tp[1]))), "color": "#ffb347", "radius": 0.045, "minLevel": 2})
            paste(rend('goblets'), tp[0] - 0.006, tp[1], 30, rot_extra=60 * sg, sh_off=(3, 4), sh_op=.4)
        else:
            paste(rend('goblets'), tp[0] - 0.004, tp[1], 26, rot_extra=60 * sg, sh_off=(3, 4), sh_op=.4)

    # ---------- mesas redondas com banquinhos (nível 2+), nível 1 só banquinhos soltos
    stool = rend('stool')
    rt_pos = [(0.3745, -5.75), (0.3745, 5.75)] if level < 3 else [(0.3745, -5.75)]
    if level >= 2:
        for (r, a) in rt_pos:
            for k in range(4):
                ang = math.radians(45 + 90 * k); off = 0.0068
                paste(stool, r + off * math.cos(ang), a + math.degrees(off * math.sin(ang) / r), 30, sh_off=(4, 5))
            paste(make_round_table(70), r, a, 70, sh_off=(7, 9))
            paste(rend('goblets'), r, a, 26, rot_extra=a * 9, sh_off=(3, 4), sh_op=.4)
    else:
        paste(stool, 0.3745, -5.6, 30); paste(stool, 0.379, 5.4, 30)

    # ---------- nível 3: lareira na parede direita + lustre sobre o tapete
    if level >= 3:
        fr = 0.3765
        pxdeg = fr * sc * math.radians(1)                 # px por grau nesse raio
        FL, FD, FB = 124, 48, 32                          # comprimento, profundidade total, parte dentro da parede (px)
        fa = half - 0.15 - (FD / 2) / pxdeg               # topo da peça encostado na borda externa da parede
        light_pool(fr, SIDE - 1.3, 105, (255, 120, 30), 95)
        paste(make_fireplace(FL, FD, FB), fr, fa, FL, rot_extra=-90, sh_off=(3, 4), sh_op=.45)
        fmouth = SIDE - 0.05
        fx += [{"type": "glow", **dict(zip("xy", norm(fr, fmouth))), "color": "#ff7a1a", "radius": 0.09, "minLevel": 3},
               {"type": "sparks", **dict(zip("xy", norm(fr, fmouth))), "minLevel": 3}]
        cr = 0.392
        light_pool(cr, 0, 120, (255, 200, 110), 70)
        paste(cand, cr, 0, 104, sh_off=(16, 20), sh_op=.45)
        fx.append({"type": "glow", **dict(zip("xy", norm(cr, 0))), "color": "#ffd27a", "radius": 0.12, "minLevel": 3})

    # recorte final pelo molde
    m = Image.open(f'{SP}/templates/outer_arc_mask.png').convert('L')
    a_ = np.minimum(np.asarray(out.split()[3]), np.asarray(m)); arr = np.asarray(out).copy(); arr[..., 3] = a_; arr[a_ == 0, :3] = 0
    return Image.fromarray(arr, 'RGBA'), fx

# ---------- peças feitas por código
def tex_img(t, w, h, rgb_mul, crop=(0, 0, 700, 700), k=1.0):
    im = Image.fromarray((np.clip(t * np.array(rgb_mul) * k, 0, 1) * 255).astype(np.uint8)).crop(crop).resize((w, h), Image.LANCZOS)
    return im.convert('RGBA')

def make_emblem(s):
    """Brasão dourado vetorial: duas espadas cruzadas atrás de um escudo."""
    k = 4; S = s * k; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    G = (236, 196, 88, 255); GD = (120, 86, 28, 255); c = S / 2
    for sg in (-1, 1):
        a = math.radians(sg * 40); ca, sa = math.cos(a), math.sin(a)
        def rp(x, y): return (c + x * ca - y * sa, c + x * sa + y * ca)
        L2 = S * 0.46; bw = S * 0.05
        d.polygon([rp(-bw, L2 * 0.55), rp(bw, L2 * 0.55), rp(bw, -L2 * 0.8), rp(0, -L2), rp(-bw, -L2 * 0.8)], fill=G, outline=GD)
        d.polygon([rp(-S * 0.11, L2 * 0.52), rp(S * 0.11, L2 * 0.52), rp(S * 0.11, L2 * 0.6), rp(-S * 0.11, L2 * 0.6)], fill=G, outline=GD)
        d.line([rp(0, L2 * 0.6), rp(0, L2 * 0.8)], fill=G, width=int(S * 0.04))
        d.ellipse([*rp(-S * 0.04, L2 * 0.82 - S * 0.04), *rp(S * 0.04, L2 * 0.82 + S * 0.04)], fill=G)
    sw, sh = S * 0.42, S * 0.52; x0, y0 = c - sw / 2, c - sh / 2 - S * 0.02
    d.polygon([(x0, y0), (x0 + sw, y0), (x0 + sw, y0 + sh * 0.45), (c, y0 + sh), (x0, y0 + sh * 0.45)], fill=G, outline=GD, width=k * 2)
    d.line([(c, y0 + sh * 0.1), (c, y0 + sh * 0.82)], fill=GD, width=int(k * 2.5))
    d.line([(x0 + sw * 0.15, y0 + sh * 0.32), (x0 + sw * 0.85, y0 + sh * 0.32)], fill=GD, width=int(k * 2.5))
    return im.resize((s, s), Image.LANCZOS)

def make_board():
    """Mural de missões: painel de tábuas com cartazes de pergaminho presos por tachas."""
    BW, BH = 300, 110
    b = tex_img(planks_t, BW, BH, (0.38, 0.25, 0.15), crop=(0, 0, 1400, 600))
    b.paste(tex_img(planks_t, BW - 14, BH - 14, (0.62, 0.42, 0.26), crop=(0, 0, 1400, 600)), (7, 7))
    d = ImageDraw.Draw(b); d.rectangle([0, 0, BW - 1, BH - 1], outline=GOLD_D, width=4)
    rng = np.random.default_rng(11)
    pap = Image.fromarray((np.clip(paper_t * np.array([0.95, 0.84, 0.62]), 0, 1) * 255).astype(np.uint8))
    for i, (x, y, w_, h_) in enumerate([(16, 12, 46, 58), (72, 20, 44, 50), (126, 10, 52, 62), (190, 18, 44, 54), (246, 12, 40, 60),
                                        (40, 70, 44, 30), (130, 72, 56, 28), (210, 72, 50, 28)]):
        p = pap.crop((i * 200, i * 150, i * 200 + 300, i * 150 + 380)).resize((w_, h_)).convert('RGBA')
        pd = ImageDraw.Draw(p)
        for ln in range(5, h_ - 5, 6):
            pd.line([(5, ln), (w_ - 5 - rng.integers(0, 12), ln)], fill=(70, 50, 35, 150), width=2)
        if i in (0, 2): pd.rectangle([w_ // 2 - 7, h_ - 15, w_ // 2 + 7, h_ - 6], outline=(120, 30, 30, 200), width=2)
        p = p.rotate(rng.uniform(-8, 8), expand=True, resample=Image.BICUBIC)
        s2 = Image.new('RGBA', p.size, (0, 0, 0, 0)); s2.putalpha(p.split()[3].point(lambda v: int(v * .5)))
        b.alpha_composite(s2.filter(ImageFilter.GaussianBlur(2)), (x + 3, y + 3)); b.alpha_composite(p, (x, y))
        tx = x + p.width // 2; d = ImageDraw.Draw(b)
        d.ellipse([tx - 4, y + 3, tx + 4, y + 11], fill=(170, 30, 30, 255), outline=(60, 10, 10, 255))
    return b

def make_round_table(s):
    k = 3; S = s * k; im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    t = tex_img(planks_t, S, S, (0.55, 0.36, 0.21), crop=(0, 0, 900, 900))
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse([0, 0, S - 1, S - 1], fill=255)
    im.paste(t, (0, 0), m); d = ImageDraw.Draw(im)
    d.ellipse([0, 0, S - 1, S - 1], outline=(45, 28, 16, 255), width=4 * k)
    d.ellipse([5 * k, 5 * k, S - 5 * k, S - 5 * k], outline=(150, 111, 40, 200), width=k)
    return im.resize((s, s), Image.LANCZOS)

def make_ledger():
    """Livro de registro aberto sobre o balcão."""
    im = Image.new('RGBA', (120, 84), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, 119, 83], 6, fill=(80, 22, 30, 255))
    pap = Image.fromarray((np.clip(paper_t[:300, :400] * np.array([0.97, 0.88, 0.68]), 0, 1) * 255).astype(np.uint8)).resize((52, 72)).convert('RGBA')
    im.alpha_composite(pap, (6, 6)); im.alpha_composite(pap, (62, 6))
    d.line([(60, 4), (60, 80)], fill=(60, 40, 25, 255), width=3)
    for y in range(14, 74, 7):
        d.line([(12, y), (52, y)], fill=(70, 50, 35, 160), width=2); d.line([(68, y), (108, y)], fill=(70, 50, 35, 160), width=2)
    d.line([(90, 20), (118, 60)], fill=(240, 235, 220, 255), width=3)     # pena
    return im

def make_scrolls():
    im = Image.new('RGBA', (100, 80), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i, (x, y, ang) in enumerate([(10, 18, 0), (14, 38, 8), (8, 56, -6)]):
        s = Image.new('RGBA', (84, 16), (0, 0, 0, 0)); sd = ImageDraw.Draw(s)
        sd.rounded_rectangle([0, 0, 83, 15], 7, fill=(222, 200, 150, 255), outline=(140, 110, 70, 255), width=2)
        sd.rectangle([38, 0, 46, 15], fill=(140, 30, 30, 255))
        s = s.rotate(ang, expand=True, resample=Image.BICUBIC); im.alpha_composite(s, (x, y))
    return im

def make_open_chest():
    ch = rend('chest'); W2, H2 = ch.size
    im = Image.new('RGBA', (W2, int(H2 * 1.45)), (0, 0, 0, 0))
    lid = ImageEnhance.Brightness(ch.resize((W2, int(H2 * 0.45)))).enhance(0.7)
    im.alpha_composite(lid, (0, 0)); im.alpha_composite(ch, (0, int(H2 * 0.45)))
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = W2 * 0.09, H2 * 0.57, W2 * 0.91, H2 * 1.33
    d.rectangle([x0, y0, x1, y1], fill=(60, 36, 20, 255))
    rng = np.random.default_rng(5)
    for _ in range(int(W2 * H2 / 35)):
        x, y = rng.uniform(x0 + 4, x1 - 4), rng.uniform(y0 + 4, y1 - 4); r = rng.uniform(4, 7)
        c = [(240, 200, 90), (226, 184, 74), (255, 228, 140), (170, 128, 46)][rng.integers(0, 4)]
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,), outline=(120, 85, 30, 255))
    for _ in range(14):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1); r = rng.uniform(3, 6)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 250, 220, 220))
    return im

def make_fireplace(FL, FD, FB):
    """Lareira embutida: o topo da imagem fica dentro da parede (fornalha com brasas, aberta para o salão),
    a parte de baixo é a soleira de pedra que avança para dentro do salão. Gira -90 graus na parede direita."""
    k = 3; Wf, Hf, B = FL * k, FD * k, FB * k
    noise = Image.fromarray((paper_t[:Hf, :Wf].mean(-1) * 255).astype(np.uint8)).resize((Wf, Hf))
    stone = ImageOps.colorize(ImageEnhance.Contrast(noise).enhance(3), (20, 18, 22), (64, 60, 66)).convert('RGBA')
    im = stone.copy(); d = ImageDraw.Draw(im)
    # blocos de pedra das ombreiras
    for x0 in (0, Wf - 26 * k):
        for yb in range(0, B, 10 * k):
            d.rectangle([x0, yb, x0 + 26 * k, yb + 10 * k], outline=(14, 12, 16, 255), width=k)
    # fornalha (dentro da parede), aberta para baixo
    fx0, fx1 = 26 * k, Wf - 26 * k
    d.rectangle([fx0, 4 * k, fx1, B], fill=(16, 9, 7, 255))
    rng = np.random.default_rng(9); coal = Image.new('RGBA', (Wf, Hf), (0, 0, 0, 0)); cd = ImageDraw.Draw(coal)
    for _ in range(70):
        x, y = rng.uniform(fx0 + 6 * k, fx1 - 6 * k), rng.uniform(8 * k, B - 2 * k); r = rng.uniform(1.5, 4) * k
        c = [(255, 140, 40), (255, 90, 20), (255, 200, 90), (60, 30, 20)][rng.integers(0, 4)]
        cd.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,))
    for i in range(3):                                        # lenhas
        y = B - (6 + i * 7) * k
        cd.rounded_rectangle([fx0 + (12 + i * 8) * k, y - 2 * k, fx1 - (14 - i * 6) * k, y + 2 * k], 2 * k, fill=(70, 38, 20, 255), outline=(30, 16, 10, 255))
    im.alpha_composite(coal)
    hal = Image.new('RGBA', (Wf, Hf), (0, 0, 0, 0)); ImageDraw.Draw(hal).rectangle([fx0 + 8 * k, 10 * k, fx1 - 8 * k, B], fill=(255, 130, 40, 160))
    im.alpha_composite(hal.filter(ImageFilter.GaussianBlur(6 * k)))
    d = ImageDraw.Draw(im)
    d.line([(fx0, 4 * k), (fx0, B)], fill=GOLD_D, width=2 * k); d.line([(fx1, 4 * k), (fx1, B)], fill=GOLD_D, width=2 * k)
    # soleira (dentro do salão), mais estreita que a parede da lareira
    hearth = (20 * k, B, Wf - 20 * k, Hf - 1)
    im.paste((0, 0, 0, 0), (0, B, Wf, Hf))
    hs = stone.crop((0, 0, hearth[2] - hearth[0], Hf - B)); hs = Image.blend(hs, Image.new('RGBA', hs.size, (120, 60, 30, 255)), 0.18)
    im.paste(hs, (hearth[0], B))
    d = ImageDraw.Draw(im)
    d.rectangle(hearth, outline=GOLD, width=2 * k)
    d.line([(hearth[0], B), (hearth[2], B)], fill=GOLD, width=3 * k)
    return im.resize((FL, FD), Image.LANCZOS)

if __name__ == '__main__':
    allfx = []
    for lv in (1, 2, 3):
        im, fx = build(lv)
        name = 'guild.outer.png' if lv == 1 else f'guild.outer.lv{lv}.png'
        im.save(f'{OUT}/{name}'); print('ok', name, im.size)
        for f in fx:
            if f not in allfx: allfx.append(f)
    json.dump(allfx, open(f'{OUT}/fx.json', 'w'), indent=1)
