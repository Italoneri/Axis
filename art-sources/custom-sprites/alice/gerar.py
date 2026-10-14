"""Alice (garota de cabelo platinado com flores, estola de folhas e espada de luz)
desenhada pixel a pixel.

Mesmo formato dos outros sprites do jogo: quadros 64x64, linhas norte, oeste,
sul, leste; walk.png com 9 quadros e idle.png com 2. O perfil é desenhado
virado para a direita e espelhado para o oeste.

    python3 gerar.py [pasta_de_saida]
"""

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

W = H = 64


def hx(s, a=255):
    s = s.lstrip("#")
    return tuple(int(s[i : i + 2], 16) for i in (0, 2, 4)) + (a,)


# Cada material: luz, base, sombra, sombra profunda.
MATS = {
    "hair": ["#FFFDF2", "#F2E8C8", "#D6C49A", "#A8936A"],
    "skin": ["#FFF2EA", "#FCE8DC", "#DDB6A4", "#DDB6A4"],
    "white": ["#FFFFFF", "#EEEDE6", "#C8C6B8", "#A9A798"],
    "leafd": ["#3F6E35", "#2E5A2A", "#1A3A1A", "#1A3A1A"],
    "leafl": ["#A8D870", "#6FAE4A", "#4F8A38", "#2E5A2A"],
    "shoe": ["#D9B48A", "#A87E52", "#7A5636", "#7A5636"],
    "vine": ["#7CC452", "#5EAE3A", "#3E7A2A", "#2E5A2A"],
}
MATS = {k: [hx(c) for c in v] for k, v in MATS.items()}
MAT_ID = {k: i + 1 for i, k in enumerate(MATS)}
ID_MAT = {v: k for k, v in MAT_ID.items()}

OUTLINE = hx("#2A2620")
OUTLINE_BY_MAT = {
    "hair": hx("#5A4A30"),
    "white": hx("#5A584C"),
    "leafd": hx("#1A3A1A"),
    "leafl": hx("#1A3A1A"),
    "vine": hx("#1A3A1A"),
}
RIM = hx("#FFF6D0")
C = {
    "hair_hi": hx("#FFF6D0"),
    "petal": hx("#FFFFFF"),
    "petal_sh": hx("#DDE0D0"),
    "pistil": hx("#F5C842"),
    "pistil_dk": hx("#E08A20"),
    "eye_hi": hx("#FFF4B0"),
    "iris": hx("#FFB020"),
    "eye_rim": hx("#C25A10"),
    "blush": hx("#E87A6A"),
    "mouth": hx("#D9737A"),
    "blade_core": hx("#FFFFFF"),
    "blade_mid": hx("#FFF6D8"),
    "blade_edge": hx("#FFE08A"),
    "blade_glow": hx("#FFF0A0"),
    "engrave": hx("#5EAE3A"),
    "gold": hx("#FFD040"),
    "spark": hx("#FFE070"),
}


# ---------------------------------------------------------------- formas
def mask_from(draw_fn):
    im = Image.new("L", (W, H), 0)
    draw_fn(ImageDraw.Draw(im))
    return np.array(im) > 0


def ellipse(cx, cy, rx, ry):
    return mask_from(lambda d: d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=1))


def poly(pts):
    return mask_from(lambda d: d.polygon(pts, fill=1))


def rect(x0, y0, x1, y1):
    m = np.zeros((H, W), bool)
    m[max(0, y0) : y1 + 1, max(0, x0) : x1 + 1] = True
    return m


def line(a, b, width=1):
    return mask_from(lambda d: d.line([a, b], fill=1, width=width))


def shift(m, dx, dy):
    """Valor de m no pixel p+(dx,dy); fora da tela conta como vazio."""
    out = np.zeros_like(m)
    ys, ye = max(0, -dy), min(H, H - dy)
    xs, xe = max(0, -dx), min(W, W - dx)
    out[ys:ye, xs:xe] = m[ys + dy : ye + dy, xs + dx : xe + dx]
    return out


def spikes(tips):
    """Pontas de mecha: cada item (x, y, largura, ponta_x, ponta_y)."""
    m = np.zeros((H, W), bool)
    for x, y, w, tx, ty in tips:
        m |= poly([(x - w, y), (x + w, y), (tx, ty)])
    return m


def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)


# ---------------------------------------------------------------- canvas
class Frame:
    def __init__(self):
        self.rgba = np.zeros((H, W, 4), np.uint8)
        self.mat = np.zeros((H, W), np.uint8)
        self.post = []  # brilhos aplicados depois do contorno

    def part(self, m, mat, strands=None, cast=False, light_from=-1, flat=False):
        t = MATS[mat]
        if flat:
            self.rgba[m] = t[1]
            self.rgba[m & ~shift(m, 0, 1)] = t[2]
            self.rgba[m & ~shift(m, 1, 0) & ~shift(m, 0, 2)] = t[2]
            self.mat[m] = MAT_ID[mat]
            return
        L = light_from
        deep = ~shift(m, -L, 0) | ~shift(m, 0, 1)
        shadow = (~shift(m, -3 * L, 1) | ~shift(m, -L, 3)) & ~deep
        light = (~shift(m, 2 * L, -1) | ~shift(m, L, -2)) & ~shadow & ~deep
        tone = np.full((H, W), 1)
        tone[shadow] = 2
        tone[deep] = 3
        tone[light] = 0
        if strands is not None:
            tone = strands(tone, m)
        if cast:
            below = shift(m, 0, -1) & ~m & (self.mat > 0)
            for y, x in zip(*np.nonzero(below)):
                under = ID_MAT[self.mat[y, x]]
                self.rgba[y, x] = MATS[under][2]
        for i in range(4):
            self.rgba[m & (tone == i)] = t[i]
        self.mat[m] = MAT_ID[mat]

    def px(self, x, y, color, mat=None):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < W and 0 <= y < H:
            self.rgba[y, x] = color
            if mat:
                self.mat[y, x] = MAT_ID[mat]

    def pts(self, pts, color, mat=None):
        for x, y in pts:
            self.px(x, y, color, mat)

    def tint(self, x, y, color, t):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H and self.rgba[y, x, 3]:
            self.rgba[y, x] = mix(self.rgba[y, x], color, t)

    def glow(self, x, y, color, t=0.45, alpha=110):
        """Brilho de 1px: tinge o que existe ou deixa um pixel translúcido."""
        x, y = int(round(x)), int(round(y))
        if not (0 <= x < W and 0 <= y < H):
            return
        if self.rgba[y, x, 3] == 255:
            self.rgba[y, x] = mix(self.rgba[y, x], color, t)
        elif self.rgba[y, x, 3] == 0:
            self.rgba[y, x] = color[:3] + (alpha,)

    def finish(self):
        a = self.rgba[..., 3] > 0
        # luz quente de contorno no alto do cabelo
        edge = a & ~shift(a, 0, -1)
        hair = self.mat == MAT_ID["hair"]
        for y, x in zip(*np.nonzero(edge & hair)):
            self.rgba[y, x] = mix(self.rgba[y, x], RIM, 0.6)
        # contorno escuro de 1px, na cor do material vizinho
        out = (shift(a, 1, 0) | shift(a, -1, 0) | shift(a, 0, 1) | shift(a, 0, -1)) & ~a
        self.rgba[out] = OUTLINE
        for name, col in OUTLINE_BY_MAT.items():
            m = self.mat == MAT_ID[name]
            near = shift(m, 1, 0) | shift(m, -1, 0) | shift(m, 0, 1) | shift(m, 0, -1)
            self.rgba[out & near] = col
        for fn in self.post:
            fn()
        return Image.fromarray(self.rgba, "RGBA")


def strands(period=4, amp=1.3, freq=0.45, phase=0.0, slant=0.0):
    """Mechas: linha de sombra a cada `period` px e 1px de brilho ao lado."""

    def fn(tone, m):
        ys, xs = np.mgrid[0:H, 0:W]
        off = np.round(amp * np.sin(ys * freq + phase) + ys * slant).astype(int)
        k = (xs + off) % period
        inner = m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1)
        tone = tone.copy()
        tone[inner & (k == 0) & (tone < 3)] = 2
        tone[inner & (k == 1) & (tone == 1)] = 0
        return tone

    return fn


# ---------------------------------------------------------------- peças
def leaf(f, x, y, ang, length=4.0, mat="leafl"):
    """Folha pontuda saindo de (x, y) na direção `ang` (graus, 0 = direita, 90 = baixo)."""
    a = math.radians(ang)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    mx, my = x + dx * length * 0.45, y + dy * length * 0.45
    w = 1.3 if length >= 4 else 0.9
    tip = (x + dx * length, y + dy * length)
    m = poly([(x, y), (mx + nx * w, my + ny * w), tip, (mx - nx * w, my - ny * w)])
    m |= mask_from(lambda d: d.point([(round(x), round(y)), (round(tip[0]), round(tip[1]))], fill=1))
    f.part(m, mat, flat=True)
    if mat == "leafl":
        f.px(mx - nx * 0.4, my - ny * 0.4, MATS["leafl"][0], mat)
    else:
        f.px(mx, my, MATS["leafd"][0], mat)


def flower(f, cx, cy, big=True):
    """Flor branca de 5 pétalas com miolo amarelo e 1px laranja."""
    W_, S = C["petal"], C["petal_sh"]
    if big:
        rows = {
            -2: [(-1, W_), (1, W_)],
            -1: [(-2, W_), (-1, W_), (0, W_), (1, W_), (2, W_)],
            0: [(-2, S), (-1, W_), (1, W_), (2, S)],
            1: [(-1, S), (1, S)],
        }
        center = [(0, 0, C["pistil"]), (0, 1, C["pistil_dk"])]
    else:
        rows = {-1: [(0, W_)], 0: [(-1, W_), (1, W_)], 1: [(-1, S), (1, S)]}
        center = [(0, 0, C["pistil"]), (0, 1, C["pistil_dk"])]
    for dy, cols in rows.items():
        for dx, col in cols:
            f.px(cx + dx, cy + dy, col, "white")
    for dx, dy, col in center:
        f.px(cx + dx, cy + dy, col, "white")

    def glint():
        f.glow(cx, cy - 3 if big else cy - 2, C["spark"], 0.3, 60)

    f.post.append(glint)


def hair_flower(f, cx, cy, side):
    """Flor grande no cabelo com duas folhas pontudas saindo por trás."""
    leaf(f, cx + side * 1, cy - 1, -90 + side * 35, 5, "leafl")
    leaf(f, cx + side * 2, cy + 1, side * 10 if side > 0 else 170, 4, "leafd")
    # folhagem escura atrás da flor, para ela se destacar do cabelo claro
    f.part(ellipse(cx, cy, 3, 2.5), "leafd", flat=True)
    flower(f, cx, cy)


def stole(f, x0, x1, y0, y1, flowers, seed=0, back=False):
    """Estola de folhas em dois tons sobre ombros e peito."""
    rng = np.random.default_rng(seed)
    base = poly([(x0 + 2, y0), (x1 - 2, y0), (x1, y0 + 3), (x1 - 1, y1 - 2), (32, y1), (x0 + 1, y1 - 2), (x0, y0 + 3)])
    if back:
        base = poly([(x0 + 2, y0), (x1 - 2, y0), (x1, y0 + 3), (x1 - 1, y1), (x0 + 1, y1), (x0, y0 + 3)])
    f.part(base, "leafd", flat=True)
    # folhas pontudas sobrepostas; pontas escapando da borda de baixo
    for x in range(x0, x1 + 1, 3):
        yb = y1 - 1 if back else y1 - 1 - int(abs(x - 32) / 4)
        ang = 90 + (x - 32) * 3
        leaf(f, x, yb - 1, ang, 4, "leafd" if (x // 3) % 2 else "leafl")
    for i, x in enumerate(range(x0 + 1, x1, 3)):
        y = y0 + 2 + (i % 2) * 3 + int(rng.integers(0, 2))
        ang = 60 + 60 * ((x - x0) / max(1, x1 - x0)) + rng.integers(-15, 15)
        leaf(f, x, y, ang, 4, "leafl" if i % 2 == 0 else "leafd")
    for x in (x0 - 1, x1 + 1):
        leaf(f, x, y0 + 2, 180 if x < 32 else 0, 3, "leafl")
    for cx, cy, big in flowers:
        flower(f, cx, cy, big)


def light_blade(f, a, b):
    """Lâmina de luz: núcleo branco, meio creme, borda dourada, vinha verde no centro e halo."""
    ax, ay = a
    bx, by = b
    n = int(max(abs(bx - ax), abs(by - ay))) + 1
    dx, dy = (bx - ax) / n, (by - ay) / n
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln, dx / ln
    body = set()
    for i in range(n + 1):
        x, y = ax + dx * i, ay + dy * i
        body.add((round(x), round(y)))
        if i < n - 1:
            for s in (-1, 1):
                body.add((round(x + nx * s), round(y + ny * s)))
    for (x, y) in body:
        f.px(x, y, C["blade_edge"])
    for i in range(n + 1):
        x, y = ax + dx * i, ay + dy * i
        if i < n - 1:
            f.px(x - nx * 0.5, y - ny * 0.5, C["blade_mid"])
        f.px(x, y, C["blade_core"] if i < n - 1 else C["blade_mid"])
    # vinha gravada: pontinhos verdes alternando no centro da lâmina
    for i in range(2, n - 2):
        if i % 3 != 0:
            x, y = ax + dx * i, ay + dy * i
            off = 0.6 if (i // 3) % 2 else -0.6
            f.px(x + nx * off, y + ny * off, C["engrave"])

    def halo():
        for (x, y) in list(body):
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + ox, y + oy)
                if q not in body:
                    f.glow(q[0], q[1], C["blade_glow"], 0.4, 140)

    f.post.append(halo)


def vine_guard(f, gx, gy, ang):
    """Guarda de vinhas e folhas com flor de miolo dourado brilhante no centro."""
    a = math.radians(ang)
    ux, uy = math.cos(a), math.sin(a)
    f.part(line((gx - ux * 4, gy - uy * 4), (gx + ux * 4, gy + uy * 4), 2), "vine")
    leaf(f, gx + ux * 4, gy + uy * 4, ang + 30, 3, "leafl")
    leaf(f, gx - ux * 4, gy - uy * 4, ang + 180 - 30, 3, "leafl")
    for s in (-1, 1):
        f.px(gx + ux * 2 * s, gy + uy * 2 * s, MATS["vine"][0])
    # flor no centro
    f.pts([(gx - 1, gy), (gx + 1, gy), (gx, gy - 1), (gx, gy + 1)], C["petal"], "white")
    f.px(gx, gy, C["gold"])

    def shine():
        for ox, oy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            f.glow(gx + ox, gy + oy, C["blade_glow"], 0.5, 170)

    f.post.append(shine)


def vine_grip(f, a, b):
    """Cabo envolto em vinhas: listras verde-claro e escuro."""
    ax, ay = a
    bx, by = b
    n = int(max(abs(bx - ax), abs(by - ay))) + 1
    for i in range(n + 1):
        x = ax + (bx - ax) * i / n
        y = ay + (by - ay) * i / n
        f.px(x, y, MATS["vine"][1] if i % 2 else MATS["vine"][3], "vine")


def skirt_vines(f, pts):
    """Vinhas descendo da cintura pela saia, com folhinhas."""
    for x, y0, y1, dirn in pts:
        for y in range(y0, y1):
            xx = x + int(round(math.sin((y - y0) * 0.7) * 0.8))
            f.px(xx, y, MATS["vine"][1] if y % 2 else MATS["vine"][2], "vine")
            if (y - y0) % 3 == 1:
                f.px(xx + dirn, y, MATS["leafl"][1], "leafl")


def particles(f, pts):
    def put():
        for i, (x, y) in enumerate(pts):
            f.glow(x, y, C["spark"], 0.9, 230 if i % 2 == 0 else 150)

    f.post.append(put)


def eye_glow(f, pts):
    def put():
        for x, y in pts:
            f.tint(x, y, C["iris"], 0.3)

    f.post.append(put)


def hands(f, cx, cy):
    f.part(ellipse(cx, cy, 2, 1.6), "skin", flat=True)


# ---------------------------------------------------------------- frente
def draw_front(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d, s = dy, sway
    h = passo // 2
    # cabelo de trás (bob até o queixo)
    f.part(ellipse(32, 18 + d, 11, 10.5) & rect(0, 0, 63, 28 + d), "hair", strands=strands(phase=0.6))
    # sandálias e pernas
    f.part(rect(27, 58 - pe_e, 30, 61 - pe_e), "shoe")
    f.part(rect(34, 58 - pe_d, 37, 61 - pe_d), "shoe")
    f.part(rect(28, 55, 30, 57 - pe_e), "skin", flat=True)
    f.part(rect(34, 55, 36, 57 - pe_d), "skin", flat=True)
    # saia branca rodada
    skirt = poly([(26, 44 + d), (38, 44 + d), (43 + h, 57), (21 + h, 57)])
    f.part(skirt, "white")
    for x in range(21 + h, 44 + h, 2):
        f.px(x, 57, MATS["white"][2], "white")
    for x in (25 + h, 30, 34, 39 + h):
        for y in range(50, 57):
            f.px(x, y, MATS["white"][2] if y > 52 else MATS["white"][1], "white")
    skirt_vines(f, [(27, 45 + d, 54, -1), (37, 45 + d, 52, 1), (32, 46 + d, 50, 1)])
    # blusa/vestido branco
    f.part(poly([(25, 31 + d), (39, 31 + d), (38, 40 + d), (38, 46 + d), (26, 46 + d), (26, 40 + d)]), "white")
    # mangas bufantes e antebraços até a espada
    for side in (-1, 1):
        sx = 32 + side * 9
        f.part(line((sx, 37 + d), (33 + side * 2, 42 + d), 3), "skin", flat=True)
        f.part(ellipse(sx + side * 0.5, 35 + d, 4.5, 4), "white")
        f.px(sx + side * 2, 38 + d, MATS["white"][2], "white")
    # estola de folhas sobre ombros e peito, com flores
    stole(f, 22, 42, 28 + d, 37 + d, [(24, 31 + d, True), (40, 31 + d, True), (28, 34 + d, False),
                                      (36, 34 + d, False)], seed=1)
    # pescoço e cabeça
    f.part(rect(30, 26 + d, 34, 29 + d), "skin", flat=True)
    f.part(ellipse(32, 20 + d, 8, 8), "skin", flat=True)
    for x in range(25, 40):
        if f.mat[19 + d, x] == MAT_ID["skin"]:
            f.px(x, 19 + d, MATS["skin"][2])
    # olhos dourado-alaranjados brilhantes
    for ex in (27, 35):
        f.pts([(ex - 1, 20 + d), (ex, 20 + d), (ex + 1, 20 + d), (ex + 2, 20 + d)], C["eye_rim"])
        for yy in (21, 22):
            f.px(ex, yy + d, C["iris"])
            f.px(ex + 1, yy + d, C["iris"])
        f.px(ex, 21 + d, C["eye_hi"])
        f.px(ex + 1, 22 + d, C["eye_hi"])
        f.pts([(ex, 23 + d), (ex + 1, 23 + d)], C["eye_rim"])
        # rubor logo abaixo
        f.pts([(ex - 1, 24 + d), (ex + 2, 24 + d)], C["blush"])
    eye_glow(f, [(25, 21 + d), (25, 22 + d), (30, 21 + d), (30, 22 + d),
                 (33, 21 + d), (33, 22 + d), (38, 21 + d), (38, 22 + d)])
    f.px(32, 26 + d, C["mouth"])  # boca séria de 1px
    # topo do cabelo e franja reta e cheia logo acima dos olhos
    top = ellipse(32, 15 + d, 10, 8) & ~rect(0, 17 + d, 63, 63)
    f.part(top, "hair", strands=strands(period=3, amp=0.0, slant=0.4), cast=True)
    fringe = rect(24, 13 + d, 40, 18 + d)
    for x in range(24, 41):
        if x % 3 == 1:
            fringe[19 + d, x] = True  # mechas finas um pouco mais longas
    f.part(fringe, "hair", strands=strands(period=2, amp=0.0), cast=True)
    for x in range(25, 40, 3):
        f.px(x, 18 + d, MATS["hair"][3], "hair")  # separação entre as mechas
    # laterais do bob até o queixo, pontas repicadas viradas para fora
    sides = poly([(21, 15 + d), (25, 16 + d), (25, 26 + d), (21, 27 + d)])
    sides |= poly([(39, 16 + d), (43, 15 + d), (43, 27 + d), (39, 26 + d)])
    sides |= spikes([(22, 26 + d, 1.5, 18 + s, 29 + d), (24, 26 + d, 1, 23, 29 + d),
                     (42, 26 + d, 1.5, 46 + s, 29 + d), (40, 26 + d, 1, 41, 29 + d)])
    f.part(sides, "hair", strands=strands(period=3, amp=0.0), cast=True)
    # reflexo quente no topo
    f.pts([(29, 9 + d), (30, 9 + d), (31, 8 + d)], C["hair_hi"])
    # flores grandes acima das orelhas
    hair_flower(f, 22, 16 + d, -1)
    hair_flower(f, 42, 16 + d, 1)
    # espada de luz erguida na diagonal à frente do corpo
    b = braco
    gx, gy = 36 + b, 40 + d
    light_blade(f, (gx + 2, gy - 2), (gx + 12, 16 + d))
    vine_grip(f, (gx - 1, gy + 1), (gx - 3, gy + 4))
    vine_guard(f, gx, gy, -50)
    hands(f, 34 + b, 42 + d)
    particles(f, [(gx + 14, 22 + d), (gx + 9, 19 + d), (gx + 6, 28 + d), (19, 12 + d)])
    return f.finish()


# ---------------------------------------------------------------- costas
def draw_back(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d, s = dy, sway
    h = -(passo // 2)
    f.part(rect(27, 58 - pe_d, 30, 61 - pe_d), "shoe")
    f.part(rect(34, 58 - pe_e, 37, 61 - pe_e), "shoe")
    f.part(rect(28, 55, 30, 57 - pe_d), "skin", flat=True)
    f.part(rect(34, 55, 36, 57 - pe_e), "skin", flat=True)
    f.part(poly([(26, 44 + d), (38, 44 + d), (43 + h, 57), (21 + h, 57)]), "white")
    for x in range(21 + h, 44 + h, 2):
        f.px(x, 57, MATS["white"][2], "white")
    for x in (25 + h, 29, 35, 39 + h):
        for y in range(50, 57):
            f.px(x, y, MATS["white"][2] if y > 52 else MATS["white"][1], "white")
    skirt_vines(f, [(29, 45 + d, 51, -1), (36, 45 + d, 53, 1)])
    # braços para a frente (mãos escondidas) e mangas bufantes
    for side in (-1, 1):
        sx = 32 + side * 9
        f.part(line((sx, 37 + d), (sx - side, 43 + d), 3), "skin", flat=True)
        f.part(ellipse(sx + side * 0.5, 35 + d, 4.5, 4), "white")
    f.part(poly([(25, 31 + d), (39, 31 + d), (38, 40 + d), (38, 46 + d), (26, 46 + d), (26, 40 + d)]), "white")
    # folhagem cobrindo a parte de cima das costas, com flores
    stole(f, 22, 42, 28 + d, 37 + d, [(25, 32 + d, True), (39, 32 + d, True), (32, 35 + d, False)],
          seed=2, back=True)
    # cabelo bob visto de trás, pontas viradas para fora
    hair = ellipse(32, 17 + d, 11, 10) | rect(21, 17 + d, 43, 27 + d)
    hair |= spikes([(22, 27 + d, 1.5, 18 + s, 30 + d), (26, 27 + d, 1.5, 25 + s, 30 + d),
                    (30, 27 + d, 1.5, 30, 29 + d), (34, 27 + d, 1.5, 34, 29 + d),
                    (38, 27 + d, 1.5, 39 + s, 30 + d), (42, 27 + d, 1.5, 46 + s, 30 + d)])
    f.part(hair, "hair", strands=strands(period=4, amp=0.6, phase=1.0))
    f.pts([(30, 8 + d), (31, 8 + d), (33, 9 + d)], C["hair_hi"])
    # as duas flores aparecendo nas laterais da cabeça
    hair_flower(f, 22, 15 + d, -1)
    hair_flower(f, 42, 15 + d, 1)
    # brilho da lâmina aparecendo pelo lado
    particles(f, [(46, 40 + d), (48, 34 + d), (17, 44 + d)])
    return f.finish()


# ---------------------------------------------------------------- perfil (virada para a direita)
def draw_profile_right(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d, s = dy, sway
    # flor do outro lado da cabeça aparecendo atrás
    hair_flower(f, 25, 11 + d, -1)
    # cabelo de trás (bob)
    back = ellipse(29, 17 + d, 10, 10) & rect(0, 0, 63, 28 + d)
    back |= spikes([(21, 27 + d, 1.5, 19 - s, 29 + d), (25, 27 + d, 1.5, 24 - s, 30 + d)])
    f.part(back, "hair", strands=strands(phase=1.4, slant=0.2))
    # pés, pernas e saia
    f.part(rect(29 - passo, 58 - pe_d, 33 - passo, 61 - pe_d), "shoe")
    f.part(rect(32 + passo, 58 - pe_e, 36 + passo, 61 - pe_e), "shoe")
    f.part(rect(30 - passo, 55, 32 - passo, 57 - pe_d), "skin", flat=True)
    f.part(rect(33 + passo, 55, 35 + passo, 57 - pe_e), "skin", flat=True)
    h = abs(passo) // 2
    f.part(poly([(28, 44 + d), (37, 44 + d), (42 + h, 57), (23 - h, 57)]), "white")
    for x in range(23 - h, 43 + h, 2):
        f.px(x, 57, MATS["white"][2], "white")
    for x, y0 in ((27, 51), (33, 50), (38, 52)):
        for y in range(y0, 57):
            f.px(x, y, MATS["white"][2] if y > 53 else MATS["white"][1], "white")
    skirt_vines(f, [(30, 45 + d, 53, -1), (35, 45 + d, 50, 1)])
    # tronco
    f.part(poly([(28, 31 + d), (35, 31 + d), (37, 35 + d), (36, 40 + d), (36, 46 + d), (28, 46 + d), (29, 40 + d)]),
           "white")
    # estola de folhas no ombro e peito
    stole(f, 26, 38, 28 + d, 37 + d, [(31, 31 + d, True), (36, 34 + d, False)], seed=3)
    # braço da frente: manga bufante e antebraço segurando a espada
    b = braco
    f.part(line((31, 37 + d), (37 + b, 41 + d), 3), "skin", flat=True)
    f.part(ellipse(31, 35 + d, 4.5, 4), "white")
    leaf(f, 28, 32 + d, 200, 3, "leafl")
    # cabeça de perfil
    edge = {12: 36, 13: 37, 14: 38, 15: 39, 16: 40, 17: 40, 18: 40, 19: 40, 20: 40, 21: 40,
            22: 41, 23: 40, 24: 40, 25: 40, 26: 39, 27: 38, 28: 36}
    face = np.zeros((H, W), bool)
    for y, xe in edge.items():
        face[y + d, 30 : xe + 1] = True
    head = (ellipse(31, 20 + d, 8, 8.5) & (np.arange(W)[None, :] <= 36)) | face
    f.part(head, "skin", flat=True)
    f.px(40, 23 + d, MATS["skin"][2])
    for x in range(31, 41):
        if f.mat[19 + d, x] == MAT_ID["skin"]:
            f.px(x, 19 + d, MATS["skin"][2])
    # olho brilhante e rubor
    f.pts([(36, 20 + d), (37, 20 + d), (38, 20 + d)], C["eye_rim"])
    for yy in (21, 22):
        f.px(36, yy + d, C["iris"])
        f.px(37, yy + d, C["iris"])
    f.px(37, 21 + d, C["eye_hi"])
    f.pts([(36, 23 + d), (37, 23 + d)], C["eye_rim"])
    f.pts([(37, 24 + d), (38, 24 + d)], C["blush"])
    eye_glow(f, [(35, 21 + d), (35, 22 + d), (38, 21 + d), (38, 22 + d)])
    f.px(39, 26 + d, C["mouth"])
    # cabelo sobre a cabeça, lateral do bob e franja reta
    hair = (ellipse(30, 16 + d, 10, 8.5) | poly([(20, 17 + d), (29, 17 + d), (30, 27 + d), (21, 27 + d)])) \
        & ~poly([(31, 18 + d), (35, 16 + d), (43, 17 + d), (43, 31 + d), (31, 31 + d)])
    hair |= spikes([(22, 26 + d, 1.5, 20 - s, 29 + d), (28, 26 + d, 1.5, 30, 29 + d)])
    f.part(hair, "hair", strands=strands(amp=0.5, phase=0.3, slant=-0.2), cast=True)
    fringe = poly([(31, 11 + d), (39, 13 + d), (41, 16 + d), (41, 18 + d), (33, 18 + d)])
    for x in (34, 37, 40):
        fringe[19 + d, x] = True
    f.part(fringe, "hair", strands=strands(period=2, amp=0.0), cast=True)
    f.pts([(29, 9 + d), (30, 9 + d), (31, 9 + d)], C["hair_hi"])
    # flor grande deste lado, acima da orelha
    hair_flower(f, 28, 16 + d, -1)
    # espada: lâmina para baixo, na diagonal à frente do corpo
    gx, gy = 39 + b, 43 + d
    light_blade(f, (gx + 2, gy + 2), (gx + 9, 60))
    vine_grip(f, (gx - 1, gy - 1), (gx - 3, gy - 4))
    vine_guard(f, gx, gy, -40)
    hands(f, gx - 2, gy - 2)
    particles(f, [(gx + 12, 52), (gx + 4, 57), (gx + 12, 59), (22, 9 + d)])
    return f.finish()


# ---------------------------------------------------------------- folhas do jogo (formato LPC)
def params(anim, i):
    """Mesmo ciclo dos outros sprites desenhados: walk com 9 quadros (0 = parado), idle com 2."""
    if anim == "walk":
        si = 0 if i == 0 else math.sin(2 * math.pi * (i - 1) / 8)
        co = 0 if i == 0 else math.cos(2 * math.pi * (i - 1) / 8)
        return dict(
            dy=0 if i == 0 else (-1 if abs(co) > 0.7 else 0),
            sway=round(si),
            pe_e=max(0, round(1.6 * si)),
            pe_d=max(0, round(-1.6 * si)),
            passo=round(2.4 * si),
            braco=round(-0.6 * si),
        )
    return dict(dy=i, sway=i)


def game_frame(direction, anim, i):
    """direction: 0 norte (costas), 1 oeste, 2 sul (frente), 3 leste."""
    p = params(anim, i)
    if direction == 0:
        return draw_back(**p)
    if direction == 2:
        return draw_front(**p)
    right = draw_profile_right(**p)
    return right if direction == 3 else right.transpose(Image.FLIP_LEFT_RIGHT)


def game_sheet(anim, n, width=832):
    img = Image.new("RGBA", (width, 4 * H), (0, 0, 0, 0))
    for d in range(4):
        for i in range(n):
            img.alpha_composite(game_frame(d, anim, i), (i * W, d * H))
    return img


def main():
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
    dest.mkdir(parents=True, exist_ok=True)
    walk, idle = game_sheet("walk", 9), game_sheet("idle", 2)
    walk.save(dest / "walk.png")
    idle.save(dest / "idle.png")
    # prévia: costas, oeste, frente, leste (quadro parado)
    prev = Image.new("RGBA", (4 * W, H), (0, 0, 0, 0))
    for k in range(4):
        prev.alpha_composite(walk.crop((0, k * H, W, (k + 1) * H)), (k * W, 0))
    prev.save(dest / "preview.png")
    prev.resize((prev.width * 4, prev.height * 4), Image.NEAREST).save(dest / "preview-4x.png")
    # walk animado (frente e perfil) para conferir
    frames = []
    for i in range(1, 9):
        fr = Image.new("RGBA", (2 * W, H), (0, 0, 0, 0))
        fr.alpha_composite(walk.crop((i * W, 2 * H, (i + 1) * W, 3 * H)), (0, 0))
        fr.alpha_composite(walk.crop((i * W, 3 * H, (i + 1) * W, 4 * H)), (W, 0))
        bg = Image.new("RGBA", fr.size, (70, 80, 70, 255))
        bg.alpha_composite(fr)
        frames.append(bg.resize((fr.width * 4, fr.height * 4), Image.NEAREST).convert("P"))
    frames[0].save(dest / "andando.gif", save_all=True, append_images=frames[1:], duration=110, loop=0)
    colors = {tuple(c) for c in np.array(prev).reshape(-1, 4) if c[3]}
    print(f"ok: {dest} ({len(colors)} cores na prévia)")


if __name__ == "__main__":
    main()
