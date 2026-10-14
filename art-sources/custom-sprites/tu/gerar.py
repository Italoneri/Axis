"""Tu (mago anão com chapéu de cogumelo amanita) desenhado pixel a pixel.

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
    "hat": ["#FF8A5A", "#E8502A", "#B03418", "#6E1E10"],
    "gill": ["#E8D8B0", "#E8D8B0", "#BFA87E", "#BFA87E"],
    "skin": ["#E6B48E", "#D9A27A", "#A86E4E", "#A86E4E"],
    "beard": ["#FFF6D6", "#F0E2A8", "#C9B676", "#8E7C48"],
    "coat": ["#A0945A", "#7A6E3E", "#524828", "#2E2814"],
    "tunic": ["#DCC9A0", "#C9B48A", "#9A8460", "#9A8460"],
    "pants": ["#3E342C", "#2E2620", "#221C17", "#221C17"],
    "shoe": ["#A65E40", "#8A4A30", "#5A2E1C", "#5A2E1C"],
    "belt": ["#6A4830", "#4A3020", "#33200F", "#33200F"],
    "pouch": ["#9A6E46", "#7A5232", "#553820", "#553820"],
    "pack": ["#8A6A44", "#6A5030", "#4A3820", "#33260F"],
    "mush_or": ["#F2B456", "#E89A30", "#C2701E", "#C2701E"],
    "mush_br": ["#A4744A", "#8A5A30", "#6A4220", "#6A4220"],
    "cap_br": ["#94603A", "#7A4A28", "#5A341A", "#5A341A"],
    "cap_ye": ["#F6D266", "#E8B840", "#B88A24", "#B88A24"],
    "stem": ["#F0DCB0", "#E2CC9C", "#BFA87E", "#BFA87E"],
    "bottle": ["#C8E4F2", "#9AC8E0", "#6A9AB4", "#6A9AB4"],
}
MATS = {k: [hx(c) for c in v] for k, v in MATS.items()}
MAT_ID = {k: i + 1 for i, k in enumerate(MATS)}
ID_MAT = {v: k for k, v in MAT_ID.items()}

OUTLINE = hx("#1E160E")
OUTLINES = {"hat": hx("#3A1008"), "beard": hx("#4A3E22"), "gill": hx("#3A1008")}
C = {
    "spot": hx("#FFF2DC"),
    "spot_sh": hx("#D9C4A0"),
    "cap_spot": hx("#F0DCB0"),
    "lens": hx("#1A1A1E"),
    "glint": hx("#8A8A9A"),
    "brim_shadow": hx("#7A4A30"),
    "pipe": hx("#5A3A20"),
    "pipe_dark": hx("#3A2412"),
    "smoke": hx("#E8ECE6"),
    "smoke2": hx("#B8C0B8"),
    "buckle": hx("#C9A24A"),
    "lamella": hx("#BFA87E"),
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


def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)


# ---------------------------------------------------------------- canvas
class Frame:
    def __init__(self):
        self.rgba = np.zeros((H, W, 4), np.uint8)
        self.mat = np.zeros((H, W), np.uint8)
        self.post = []  # detalhes aplicados depois do contorno (fumaça)

    def part(self, m, mat, strands=None, cast=False, light_from=-1, flat=False):
        t = MATS[mat]
        if flat:
            self.rgba[m] = t[1]
            self.rgba[m & ~shift(m, 0, 1)] = t[2]
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
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H:
            self.rgba[y, x] = color
            if mat:
                self.mat[y, x] = MAT_ID[mat]

    def pts(self, pts, color, mat=None):
        for x, y in pts:
            self.px(x, y, color, mat)

    def finish(self):
        a = self.rgba[..., 3] > 0
        out = (shift(a, 1, 0) | shift(a, -1, 0) | shift(a, 0, 1) | shift(a, 0, -1)) & ~a
        self.rgba[out] = OUTLINE
        # contorno da cor do material vizinho (chapéu vinho, barba oliva escura)
        for name, col in OUTLINES.items():
            m = self.mat == MAT_ID[name]
            near = shift(m, 1, 0) | shift(m, -1, 0) | shift(m, 0, 1) | shift(m, 0, -1)
            self.rgba[out & near] = col
        for fn in self.post:
            fn()
        return Image.fromarray(self.rgba, "RGBA")


def strands(period=3, amp=0.6, freq=0.5, phase=0.0, slant=0.0):
    """Fios de barba: linha de sombra a cada `period` px e 1px de brilho ao lado."""

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


def ragged_hem(f, x0, x1, y, mat, seed=0):
    """Barra esfarrapada: pontas de 1 a 2px presas na borda, sem pixels soltos."""
    t = MATS[mat]
    pattern = [0, 1, 2, 1, 0, 0, 1, 0, 2, 1, 0, 1]
    for x in range(x0, x1 + 1):
        n = pattern[(x + seed) % len(pattern)]
        for k in range(1, n + 1):
            f.px(x, y + k, t[3] if k == n else t[2], mat)


# ---------------------------------------------------------------- peças
SPOTS = [  # bolinhas do chapéu (dx a partir do centro, y relativo ao topo da aba, raio)
    (-13, 0, 1.6), (-6, 1, 1.8), (2, 0, 1.6), (9, 1, 1.8), (15, 0, 1.3),
    (-9, -4, 1.4), (-2, -3, 1.5), (5, -4, 1.4), (11, -3, 1.0),
    (-5, -8, 1.1), (2, -8, 1.2), (-1, -12, 0.8), (3, -14, 0.6), (0, -17, 0.5),
]


def mushroom_hat(f, cx, top, half=16, tilt=0, gills=True, spots=SPOTS):
    """Chapéu amanita: aba larga caída nas pontas e cone subindo até ponta fina.

    top = linha de cima da aba. A ponta fica ~18px acima."""
    b = top
    tip = (cx + 1 + tilt, b - 18)
    cone = poly([(cx - 11, b), (cx - 8, b - 4), (cx - 5, b - 9), (cx - 2, b - 14), tip,
                 (cx + 3 + tilt, b - 14), (cx + 6, b - 9), (cx + 9, b - 4), (cx + 12, b)])
    brim = ellipse(cx, b + 1.5, half, 2.6)
    brim |= poly([(cx - half, b + 1), (cx - half + 1, b + 4), (cx - half + 3, b + 3)])  # pontas caídas
    brim |= poly([(cx + half, b + 1), (cx + half - 1, b + 4), (cx + half - 3, b + 3)])
    f.part(cone | brim, "hat", light_from=-1)
    if gills:
        # parte de baixo da aba em creme, com lamelas
        under = ellipse(cx, b + 2.6, half - 2, 1.6) & ~rect(0, 0, 63, b + 2)
        f.part(under, "gill", flat=True)
        for x in range(cx - half + 3, cx + half - 2):
            if f.mat[b + 3, x] == MAT_ID["gill"] and x % 2 == 0:
                f.px(x, b + 3, C["lamella"])
            if f.mat[b + 4, x] == MAT_ID["gill"]:
                f.px(x, b + 4, C["lamella"] if x % 2 == 0 else MATS["gill"][1])
    hat = (f.mat == MAT_ID["hat"])
    for dx, dy, r in spots:
        x, y = cx + dx + (tilt if dy < -8 else 0), b + dy
        s = ellipse(x, y, r, r * 0.8) & hat
        f.rgba[s] = C["spot"]
        f.rgba[s & ~shift(s, 0, 1)] = C["spot_sh"]
        if r <= 0.8 and 0 <= y < H and hat[int(y), int(x)]:
            f.px(x, y, C["spot"])


def small_mushroom(f, x, y, cap="mush_or", stem=True, r=1.5):
    """Cogumelo pequeno: chapéu meia-lua + talo creme."""
    if stem:
        f.part(rect(int(x), int(y), int(x), int(y) + 2), "stem", flat=True)
    f.part(ellipse(x, y, r, r * 0.7) & rect(0, 0, 63, int(y) + 1), cap, flat=True)


def load_of_mushrooms(f, items):
    """Carga da mochila: (x, y, material, raio, com_bolinha)."""
    for x, y, mat, r, dots in items:
        f.part(rect(int(x), int(y), int(x), int(y) + 3), "stem")
        cap = ellipse(x, y, r, r * 0.65) & rect(0, 0, 63, int(y + 0.6))
        f.part(cap, mat)
        if dots:
            f.px(x - r / 2, y - 1, C["cap_spot"])
            f.px(x + r / 2 + 0.5, y - 1, C["cap_spot"])
            if r > 2.5:
                f.px(x, y - 2, C["cap_spot"])


def smoke(f, x, y, phase):
    """2 a 3 pixels de fumaça subindo em espiral a partir do fornilho."""
    path = [(0, 0), (1, -1), (0, -2), (-1, -3), (0, -4), (1, -5)]
    k = phase % 2

    def put():
        for i in range(3):
            dx, dy = path[i + k]
            f.px(x + dx, y + dy, C["smoke"] if i < 2 else C["smoke2"])

    f.post.append(put)


def backpack_mushrooms_front(f, d):
    """Pontas da mochila vistas por cima dos ombros, de frente."""
    f.part(rect(19, 28 + d, 22, 33 + d) | rect(42, 28 + d, 45, 33 + d), "pack")
    load_of_mushrooms(f, [(19, 27 + d, "cap_br", 2.5, True), (45, 26 + d, "cap_ye", 2.2, False),
                          (22, 26 + d, "hat", 1.6, True), (16, 29 + d, "cap_ye", 1.5, False)])


# ---------------------------------------------------------------- frente
def draw_front(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0, fase=0):
    f = Frame()
    d, s = dy, sway
    # mochila atrás: alças da carga e cogumelos acima dos ombros
    backpack_mushrooms_front(f, d)
    # pernas curtas e sapatos arredondados
    h = passo // 2
    for x, pe in ((27, pe_e), (34, pe_d)):
        f.part(rect(x, 55 - pe, x + 3, 58 - pe), "pants")
        f.part(ellipse(x + 1.5, 59.5 - pe, 2.6, 1.6), "shoe")
    # casaco longo (até as canelas), aberto na frente
    coat = poly([(23, 31 + d), (41, 31 + d), (44 + h, 55), (20 + h, 55)])
    f.part(coat, "coat")
    ragged_hem(f, 20 + h, 44 + h, 55, "coat")
    # capuz abaixado atrás do pescoço
    f.part(ellipse(32, 31 + d, 9, 2.4), "coat")
    # túnica bege no centro, até os joelhos
    f.part(poly([(29, 34 + d), (35, 34 + d), (37 + h, 52), (27 + h, 52)]), "tunic")
    for y in range(36 + d, 55):  # bordas das abas do casaco
        f.px(28 + h - (1 if y > 46 else 0), y, MATS["coat"][3])
        f.px(36 + h + (1 if y > 46 else 0), y, MATS["coat"][0])
    # braço esquerdo da imagem: segura o cinto (o direito fica caído)
    f.part(line((23, 34 + d), (26, 42 + d), 5), "coat")
    f.part(poly([(23, 40 + d), (29, 42 + d), (28, 45 + d), (22, 44 + d)]), "coat")  # punho largo
    # cinto com fivela
    f.part(rect(22, 44 + d, 42, 45 + d), "belt", flat=True)
    f.pts([(32, 44 + d), (33, 44 + d), (32, 45 + d)], C["buckle"])
    f.px(33, 45 + d, MATS["belt"][2])
    f.part(ellipse(28, 44 + d, 1.8, 1.4), "skin")  # mão no cinto
    # pendurados no cinto: cogumelos e bolsinha
    small_mushroom(f, 24, 47 + d, "mush_or", r=1.6)
    small_mushroom(f, 37, 47 + d, "mush_br", r=1.5)
    small_mushroom(f, 27, 48 + d, "mush_or", r=1.2)
    f.part(ellipse(40.5, 48.5 + d, 1.8, 2) | rect(40, 46 + d, 41, 46 + d), "pouch")
    f.px(40, 47 + d, MATS["belt"][1])
    # braço direito da imagem: caído ao lado do corpo, manga larga
    f.part(line((41, 34 + d), (43, 41 + d), 5), "coat")
    f.part(poly([(40, 40 + d), (45, 39 + d), (47, 44 + d), (41, 45 + d)]), "coat")  # punho largo
    f.part(ellipse(44, 46 + d, 1.8, 1.6), "skin")
    # barba longa até o cinto, afinando na ponta
    beard = poly([(24, 26 + d), (40, 26 + d), (39, 34 + d), (36, 41 + d), (32, 46 + d), (28, 41 + d), (25, 34 + d)])
    f.part(beard, "beard", strands=strands(period=3, amp=0.5, phase=s))
    # rosto: pouco aparece, sombra da aba na testa
    face = ellipse(32, 25 + d, 6, 3.5)
    f.part(face, "skin", flat=True)
    for x in range(26, 39):
        if f.mat[23 + d, x] == MAT_ID["skin"]:
            f.px(x, 23 + d, C["brim_shadow"])
    # óculos redondos de lente escura
    for ex in (28, 35):
        f.pts([(ex, 24 + d), (ex + 1, 24 + d), (ex, 25 + d), (ex + 1, 25 + d)], C["lens"])
        f.px(ex, 24 + d, C["glint"])
    f.pts([(30, 24 + d), (33, 24 + d)], C["lens"])
    f.pts([(31, 24 + d), (32, 24 + d)], MATS["skin"][2])
    # nariz grande e redondo
    f.part(ellipse(32, 26.5 + d, 1.6, 1.5), "skin")
    # bigode cheio caindo sobre a boca
    stache = poly([(26, 28 + d), (31, 27 + d), (33, 27 + d), (38, 28 + d), (39, 31 + d), (36, 30 + d),
                   (32, 29 + d), (28, 30 + d), (25, 31 + d)])
    f.part(stache, "beard", strands=strands(period=2, amp=0.0, slant=0.5))
    f.part(ellipse(32, 26.5 + d, 1.6, 1.3) & rect(0, 0, 63, 27 + d), "skin")  # ponta do nariz por cima
    # cachimbo fino saindo do canto da boca
    f.pts([(37, 30 + d), (38, 30 + d), (39, 29 + d), (40, 29 + d)], C["pipe"])
    f.pts([(41, 27 + d), (41, 28 + d), (42, 28 + d), (42, 27 + d)], C["pipe"])
    f.px(41, 27 + d, C["pipe_dark"])
    smoke(f, 42, 25 + d, fase)
    # chapéu-cogumelo
    mushroom_hat(f, 32, 19 + d, tilt=s)
    return f.finish()


# ---------------------------------------------------------------- costas
def draw_back(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0, fase=0):
    f = Frame()
    d, s = dy, sway
    h = -(passo // 2)
    for x, pe in ((27, pe_d), (34, pe_e)):
        f.part(rect(x, 55 - pe, x + 3, 58 - pe), "pants")
        f.part(ellipse(x + 1.5, 59.5 - pe, 2.6, 1.6), "shoe")
    coat = poly([(23, 31 + d), (41, 31 + d), (44 + h, 55), (20 + h, 55)])
    f.part(coat, "coat")
    ragged_hem(f, 20 + h, 44 + h, 55, "coat", seed=5)
    for x in (26, 32, 38):  # dobras do casaco
        for y in range(48, 55):
            f.px(x + h, y, MATS["coat"][2])
    # mangas largas
    for side in (-1, 1):
        sx = 32 + side * 10
        f.part(line((sx, 34 + d), (sx + side * 2, 43 + d), 5), "coat")
        f.part(poly([(sx + side * 4, 40 + d), (sx - side * 1, 41 + d), (sx, 45 + d), (sx + side * 5, 44 + d)]), "coat")
    # cabelo e barba aparecendo dos lados, longos e lisos
    for x0 in (22, 38):
        f.part(poly([(x0, 22 + d), (x0 + 4, 22 + d), (x0 + 4, 30 + d), (x0 + 3, 40 + d), (x0 + 1, 41 + d), (x0, 34 + d)]),
               "beard", strands=strands(period=2, amp=0.0))
    # nuca e capuz abaixado
    f.part(ellipse(32, 25 + d, 7, 4), "beard", strands=strands(period=2, amp=0.0))
    f.part(ellipse(32, 31 + d, 8, 3), "coat")
    # mochila volumosa cobrindo o casaco, com cinta e garrafinha
    pack = poly([(21, 30 + d), (43, 30 + d), (45, 34 + d), (45, 48 + d), (43, 50 + d), (21, 50 + d), (19, 48 + d), (19, 34 + d)])
    f.part(pack, "pack")
    f.part(rect(20, 39 + d, 44, 40 + d), "belt", flat=True)
    f.pts([(32, 39 + d), (32, 40 + d)], C["buckle"])
    f.part(poly([(24, 42 + d), (40, 42 + d), (40, 48 + d), (24, 48 + d)]), "pack")  # bolso
    f.px(32, 44 + d, C["buckle"])
    f.part(rect(46, 40 + d, 47, 44 + d) | rect(46, 39 + d, 47, 39 + d), "bottle")
    f.px(46, 38 + d, C["pipe"])
    f.px(46, 41 + d, MATS["bottle"][0])
    # carga de cogumelos saindo acima dos ombros
    load_of_mushrooms(f, [(21, 28 + d, "cap_ye", 2.4, False), (27, 27 + d, "cap_br", 3.2, True),
                          (37, 27 + d, "hat", 2.8, True), (43, 28 + d, "cap_br", 2.6, True),
                          (32, 29 + d, "cap_ye", 2.0, False), (18, 32 + d, "hat", 1.8, True),
                          (46, 32 + d, "cap_ye", 1.8, False)])
    mushroom_hat(f, 32, 19 + d, tilt=-s, gills=False,
                 spots=[(-dx, dy, r) for dx, dy, r in SPOTS])
    # fumaça subindo pela frente, do lado do cachimbo
    smoke(f, 21, 23 + d, fase)
    return f.finish()


# ---------------------------------------------------------------- perfil (virado para a direita)
def draw_profile_right(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0, fase=0):
    f = Frame()
    d, s = dy, sway
    # mochila projetada atrás do corpo
    pack = poly([(17, 31 + d), (26, 30 + d), (27, 49 + d), (18, 49 + d), (16, 46 + d)])
    f.part(pack, "pack")
    f.part(rect(16, 40 + d, 26, 41 + d), "belt", flat=True)
    f.part(rect(14, 43 + d, 15, 47 + d) | rect(14, 42 + d, 15, 42 + d), "bottle")
    f.px(14, 44 + d, MATS["bottle"][0])
    f.px(15, 41 + d, C["pipe"])
    load_of_mushrooms(f, [(19, 29 + d, "cap_br", 3.0, True), (25, 28 + d, "cap_ye", 2.2, False),
                          (15, 33 + d, "hat", 2.0, True), (22, 27 + d, "hat", 1.6, True)])
    # pernas e sapatos
    for x, pe in ((29 - passo, pe_d), (32 + passo, pe_e)):
        f.part(rect(x, 55 - pe, x + 3, 58 - pe), "pants")
        f.part(ellipse(x + 2.5, 59.5 - pe, 2.8, 1.6), "shoe")
    # casaco de lado
    h = abs(passo) // 2
    coat = poly([(27, 31 + d), (36, 31 + d), (39, 38 + d), (41 + h, 55), (24 - h, 55), (26, 40 + d)])
    f.part(coat, "coat")
    ragged_hem(f, 24 - h, 41 + h, 55, "coat", seed=3)
    # túnica aparecendo na frente, entre a aba e a barba
    f.part(poly([(37, 40 + d), (39, 40 + d), (40 + h, 52), (38 + h, 52)]), "tunic")
    # capuz abaixado na nuca
    f.part(ellipse(27, 31 + d, 3.5, 2.5), "coat")
    # cinto com cogumelos e bolsinha na frente
    f.part(rect(27, 44 + d, 39, 45 + d), "belt", flat=True)
    f.px(38, 44 + d, C["buckle"])
    small_mushroom(f, 37, 47 + d, "mush_or", r=1.5)
    small_mushroom(f, 34, 47 + d, "mush_br", r=1.3)
    f.part(ellipse(30, 48 + d, 1.5, 1.8) | rect(30, 46 + d, 30, 46 + d), "pouch")
    # braço da frente: manga larga, mão aberta à frente
    b = braco
    f.part(line((31, 34 + d), (35 + b, 41 + d), 5), "coat")
    f.part(poly([(32 + b, 39 + d), (38 + b, 38 + d), (39 + b, 43 + d), (34 + b, 44 + d)]), "coat")
    # barba longa caindo na frente do peito
    beard = poly([(32, 28 + d), (34, 29 + d), (40, 29 + d), (41, 32 + d), (40, 37 + d), (38, 43 + d), (36, 46 + d), (34, 40 + d), (31, 33 + d)])
    f.part(beard, "beard", strands=strands(period=3, amp=0.5, phase=s, slant=0.2))
    f.part(ellipse(41.5 + b, 42 + d, 1.8, 1.6) | rect(43 + b, 41 + d, 43 + b, 41 + d), "skin")  # mão aberta
    # cabelo comprido atrás da orelha
    f.part(poly([(24, 22 + d), (29, 22 + d), (29, 30 + d), (28, 36 + d), (25, 34 + d), (24, 28 + d)]), "beard",
           strands=strands(period=2, amp=0.0))
    # rosto de perfil (pouco aparece)
    face = ellipse(36, 25.5 + d, 5.5, 3.8) & ~rect(0, 0, 63, 21 + d)
    f.part(face, "skin", flat=True)
    for x in range(30, 41):
        if f.mat[23 + d, x] == MAT_ID["skin"]:
            f.px(x, 23 + d, C["brim_shadow"])
    # óculos: uma lente de lado, haste até a orelha
    f.pts([(37, 24 + d), (38, 24 + d), (37, 25 + d), (38, 25 + d)], C["lens"])
    f.px(38, 24 + d, C["glint"])
    f.pts([(33, 24 + d), (34, 24 + d), (35, 24 + d), (36, 24 + d)], C["lens"])
    # nariz grande e redondo para fora
    f.part(ellipse(40.5, 26.5 + d, 1.6, 1.5), "skin")
    # bigode cheio
    f.part(poly([(34, 28 + d), (40, 28 + d), (41, 31 + d), (37, 31 + d), (34, 30 + d)]), "beard",
           strands=strands(period=2, amp=0.0, slant=0.5))
    f.part(ellipse(40.5, 26.5 + d, 1.6, 1.3) & rect(0, 0, 63, 27 + d), "skin")
    # orelha
    f.part(ellipse(31.5, 26 + d, 1.2, 1.6), "skin")
    # cachimbo fino para a frente
    f.pts([(41, 30 + d), (42, 30 + d), (43, 29 + d), (44, 29 + d)], C["pipe"])
    f.pts([(45, 27 + d), (45, 28 + d), (46, 28 + d), (46, 27 + d)], C["pipe"])
    f.px(45, 27 + d, C["pipe_dark"])
    smoke(f, 46, 25 + d, fase)
    # chapéu-cogumelo, aba larga para os dois lados
    mushroom_hat(f, 32, 19 + d, half=18, tilt=-1 - s)
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
            fase=(i // 2),
        )
    return dict(dy=i, sway=0, fase=i)


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
    colors = {tuple(c) for c in np.array(prev).reshape(-1, 4) if c[3]}
    print(f"ok: {dest} ({len(colors)} cores na prévia)")


if __name__ == "__main__":
    main()
