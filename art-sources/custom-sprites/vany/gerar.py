"""Vany, sacerdotisa de manto branco e cabelo lavanda, desenhada pixel a pixel.

Duas variantes: com capuz e sem capuz (capuz abaixado nos ombros).
Mesmo formato dos outros sprites do jogo: quadros 64x64, linhas norte, oeste,
sul, leste; walk.png com 9 quadros e idle.png com 2. O perfil é desenhado
virado para a direita e espelhado para o oeste.

    python3 gerar.py capuz [pasta_de_saida]
    python3 gerar.py sem_capuz [pasta_de_saida]
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
    "hair": ["#F2EEFF", "#CFC6EE", "#A096CC", "#6E64A0"],
    "skin": ["#FBE6E0", "#FBE6E0", "#D9B4B0", "#D9B4B0"],
    "robe": ["#FFFFFF", "#EDEBF5", "#C9C3DE", "#8E86AE"],
    "sash": ["#4A4070", "#2A2440", "#1A1630", "#1A1630"],
    "gold": ["#FFF2B0", "#E8C25A", "#A8822E", "#A8822E"],
}
MATS = {k: [hx(c) for c in v] for k, v in MATS.items()}
MAT_ID = {k: i + 1 for i, k in enumerate(MATS)}
ID_MAT = {v: k for k, v in MAT_ID.items()}

OUTLINE = hx("#3A3450")
HAIR_OUTLINE = hx("#3A3460")
RIM = hx("#F4F0FF")
GOLD, GOLD_SH, GOLD_HI = MATS["gold"][1], MATS["gold"][2], MATS["gold"][0]
C = {
    "eye_hi": hx("#F0D8FF"),
    "iris": hx("#B36BFF"),
    "eye_rim": hx("#6A2AB0"),
    "mouth": hx("#C27886"),
    "blush": hx("#F2B8C6"),
    "gem": hx("#B36BFF"),
    "gem_hi": hx("#E0C2FF"),
    "star_core": hx("#FFFFFF"),
    "star_glow": hx("#FFF2B0"),
    "aura": hx("#CDB0FF"),
    "particle": hx("#9B6BFF"),
    "hood_in": hx("#8E86AE"),
    "band": hx("#D8D4E8"),
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


def grow(m):
    return m | shift(m, 1, 0) | shift(m, -1, 0) | shift(m, 0, 1) | shift(m, 0, -1)


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
        x, y = int(x), int(y)
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
        x, y = int(x), int(y)
        if not (0 <= x < W and 0 <= y < H):
            return
        if self.rgba[y, x, 3] == 255:
            self.rgba[y, x] = mix(self.rgba[y, x], color, t)
        elif self.rgba[y, x, 3] == 0:
            self.rgba[y, x] = color[:3] + (alpha,)

    def finish(self):
        a = self.rgba[..., 3] > 0
        # luz fria de contorno no alto do cabelo
        edge = a & (~shift(a, -1, 0) | ~shift(a, 0, -1))
        for y, x in zip(*np.nonzero(edge)):
            if ID_MAT.get(self.mat[y, x]) == "hair":
                self.rgba[y, x] = mix(self.rgba[y, x], RIM, 0.4)
        hair = self.mat == MAT_ID["hair"]
        out = grow(a) & ~a
        self.rgba[out] = OUTLINE
        self.rgba[out & grow(hair)] = HAIR_OUTLINE
        for fn in self.post:
            fn()
        return Image.fromarray(self.rgba, "RGBA")


TIPS = (0, 2, 1, 3, 0, 1, 2, 0, 3, 1)


def jagged(m, phase=0, pattern=TIPS):
    """Pontas irregulares: tira 0-3px do fim de cada coluna."""
    m = m.copy()
    for x in range(W):
        ys = np.nonzero(m[:, x])[0]
        if len(ys):
            k = pattern[(x + phase) % len(pattern)]
            if k:
                m[ys[-1] - k + 1 : ys[-1] + 1, x] = False
    return m


def masses(hl=None, tip_rows=4, period=3):
    """Cabelo em massas de cor: base, sombra em blocos nas laterais e embaixo,
    brilho só numa faixa curva (hl) e separação de mechas só nas pontas."""

    def fn(tone, m):
        tone = tone.copy()
        tone[(tone == 0)] = 1
        # blocos de sombra nas laterais (2px) e borda profunda à direita/embaixo
        side = m & (~shift(m, -2, 0) | ~shift(m, 2, 0))
        tone[side & (tone == 1)] = 2
        if hl is not None:
            tone[m & hl & (tone < 3)] = 0
        # separação de mechas só nas pontas
        for x in range(W):
            ys = np.nonzero(m[:, x])[0]
            if len(ys) > tip_rows + 2 and x % period == 0:
                for y in range(ys[-1] - tip_rows + 1, ys[-1] + 1):
                    if m[y, x]:
                        tone[y, x] = max(tone[y, x], 2)
        return tone

    return fn


def crown(cx, cy, rx, ry):
    """Faixa curva de brilho no alto da cabeça."""
    return (ellipse(cx, cy, rx, ry) & ~ellipse(cx, cy + 1.6, rx, ry)) & rect(0, 0, 63, int(cy))


# ---------------------------------------------------------------- detalhes
def tiny_star(f, x, y):
    """Estrelinha de 1-2px no tecido."""
    f.px(x, y, GOLD)
    f.px(x, y - 1, GOLD_HI) if (x + y) % 2 == 0 else None


def star4(f, x, y, arm=2):
    """Estrela dourada de 4 pontas (3-5px) com centro claro e brilho."""
    for k in range(1, arm + 1):
        c = GOLD if k < arm else GOLD_SH
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            f.px(x + dx, y + dy, c)
    f.px(x, y, GOLD_HI)

    def shine():
        for dx, dy in ((1, 1), (-1, -1), (1, -1), (-1, 1)):
            f.glow(x + dx, y + dy, C["star_glow"], 0.35, 90)

    f.post.append(shine)


def hem(f, x0, x1, y, stars):
    """Friso dourado de 1px na barra e estrelinhas logo acima."""
    for x in range(x0, x1 + 1):
        if f.mat[y, x] == MAT_ID["robe"]:
            f.px(x, y, GOLD if x % 4 else GOLD_SH)
    for sx, sy in stars:
        if f.mat[sy, sx] == MAT_ID["robe"]:
            tiny_star(f, sx, sy)


def gold_edge(f, m, side="bottom"):
    """Friso dourado na borda inferior de uma forma de tecido."""
    edge = m & ~shift(m, 0, 1)
    for y, x in zip(*np.nonzero(edge)):
        f.px(x, y, GOLD if x % 3 else GOLD_SH)


def magic_star(f, x, y, parts):
    """Estrela brilhante nas mãos: núcleo, brilho, 1px de contorno lavanda e aura."""
    star = [(x, y), (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1), (x, y - 2), (x, y + 2)]
    ring = {(px_ + ox, py_ + oy) for px_, py_ in star for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))} - set(star)
    for q in ring:
        f.px(q[0], q[1], C["hood_in"])
    f.px(x, y, C["star_core"])
    for q in star[1:]:
        f.px(q[0], q[1], C["star_glow"])

    def aura():
        outer = {(px_ + ox, py_ + oy) for px_, py_ in ring for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))}
        for q in outer - ring - set(star):
            f.glow(q[0], q[1], C["aura"], 0.45, 140)
        for i, (px_, py_) in enumerate(parts):
            f.glow(px_, py_, C["particle"], 0.85, 230 if i % 2 == 0 else 160)

    f.post.append(aura)


def eye(f, ex, y):
    """Olho aberto roxo-violeta: borda, íris e centro claro (3px de largura)."""
    f.pts([(ex - 1, y), (ex, y), (ex + 1, y), (ex + 2, y)], C["eye_rim"])
    for yy in (y + 1, y + 2):
        f.px(ex, yy, C["iris"])
        f.px(ex + 1, yy, C["iris"])
    f.px(ex, y + 1, C["eye_hi"])
    f.pts([(ex, y + 3), (ex + 1, y + 3)], C["eye_rim"])

    def halo():
        for gx, gy in ((ex - 1, y + 1), (ex - 1, y + 2), (ex + 2, y + 1), (ex + 2, y + 2),
                       (ex - 1, y + 3), (ex + 2, y + 3)):
            f.tint(gx, gy, C["iris"], 0.3)

    f.post.append(halo)


def choker(f, x0, x1, y, gx):
    for x in range(x0, x1 + 1):
        f.px(x, y, GOLD, "gold")
    f.px(gx, y, C["gem_hi"])
    f.px(gx, y + 1, C["gem"])


def hood_trim(f, hood, opening, ymax):
    """Borda frontal do capuz: 1px de sombra interna e faixa bordada com pontos dourados."""
    ring1 = hood & grow(opening) & (np.arange(H)[:, None] <= ymax)
    ring2 = hood & grow(ring1) & ~ring1 & ~opening & (np.arange(H)[:, None] <= ymax)
    for y, x in zip(*np.nonzero(ring2)):
        f.px(x, y, GOLD if (x + y) % 3 == 0 else C["band"])
    for y, x in zip(*np.nonzero(ring1)):
        f.px(x, y, C["hood_in"])


def HOOD(d):
    """Capuz arredondado caindo sobre os ombros como uma capinha."""
    return ellipse(32, 17 + d, 11.5, 10.5) | ellipse(32, 30 + d, 14, 5) | poly([(22, 20 + d), (42, 20 + d), (45, 30 + d), (19, 30 + d)])


def HOOD_SIDE(d):
    return ellipse(29, 17 + d, 11, 10.5) | ellipse(28, 30 + d, 10, 5) | poly([(19, 20 + d), (34, 22 + d), (37, 32 + d), (19, 31 + d)])


# ---------------------------------------------------------------- frente
def draw_front(hood, dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d, s = dy, sway
    h = passo // 2
    if hood:
        # parte de trás do capuz e o cabelo por dentro dele
        f.part(HOOD(d), "robe")
        f.part(ellipse(32, 19 + d, 10, 9.5), "hair", strands=masses())
    else:
        # cabelo liso e longo atrás do corpo, afinando até a cintura
        back = ellipse(32, 18 + d, 10.5, 10) | poly([(22, 18 + d), (42, 18 + d), (42, 38 + d), (39, 45 + d),
                                                      (25, 45 + d), (22, 38 + d)])
        f.part(jagged(back, s), "hair", strands=masses())

    # pés (sapatilhas brancas) e manto até os pés
    f.part(rect(27, 60 - pe_e, 30, 61 - pe_e), "robe")
    f.part(rect(34, 60 - pe_d, 37, 61 - pe_d), "robe")
    robe = poly([(25, 31 + d), (39, 31 + d), (44 + h, 59), (20 + h, 59)])
    f.part(robe, "robe")
    for x0, y0 in ((24, 47), (40, 47), (29, 52), (35, 52)):  # dobras
        for y in range(y0, 58):
            f.px(x0 + h + (1 if y > 54 and x0 > 32 else 0), y, MATS["robe"][2])
    # abas do manto abertas na frente mostrando o corpete roxo escuro (trapézio)
    sash = poly([(28, 43 + d), (36, 43 + d), (34.5, 49 + d), (29.5, 49 + d)])
    f.part(sash, "sash", flat=True)
    for y, x in zip(*np.nonzero(sash)):  # brilho roxo no alto e no lado da luz
        if y <= 45 + d or x == int(np.nonzero(sash[y])[0][0]) + 1:
            f.px(x, y, MATS["sash"][0])
    for x in range(28, 37):
        f.px(x, 43 + d, GOLD if x != 32 else GOLD_HI)
    for y in range(43 + d, 51 + d):
        f.px(27 + (y - 43 - d) // 4, y, MATS["robe"][3])
        f.px(37 - (y - 43 - d) // 4, y, MATS["robe"][3])
    hem(f, 18, 46, 59, [(23 + h, 56), (27 + h, 58), (31 + h, 55), (38 + h, 57), (42 + h, 55), (34 + h, 58)])

    # mangas largas: do ombro até as mãos juntas no peito, alargando no punho
    for side in (-1, 1):
        sx = 32 + side * 8
        sleeve = line((sx, 33 + d), (32 + side * 4, 40 + d), 5) | ellipse(sx, 33 + d, 4, 3.5)
        cuff = poly([(32 + side * 2, 38 + d), (32 + side * 6, 37 + d), (32 + side * 7, 43 + d), (32 + side * 2, 43 + d)])
        f.part(sleeve | cuff, "robe")
        for x in range(32 + min(side * 2, side * 7), 32 + max(side * 2, side * 7) + 1):
            f.px(x, 43 + d, GOLD if x % 3 else GOLD_SH)
        tiny_star(f, 32 + side * 6, 40 + d)
        tiny_star(f, 32 + side * 8, 34 + d)
    # mãos juntas diante do peito, abaixo da gargantilha
    f.part(ellipse(32, 41 + d, 2.5, 1.6), "skin", flat=True)

    if not hood:
        # capuz abaixado, dobrado atrás do pescoço sobre os ombros
        down = ellipse(32, 30 + d, 11, 3)
        f.part(down, "robe")
        gold_edge(f, down & ~rect(29, 0, 35, 63))

    # pescoço e gargantilha fina com gema
    f.part(rect(30, 27 + d, 34, 30 + d), "skin", flat=True)
    choker(f, 30, 34, 29 + d, 32)

    # cabeça, olhos, blush e sorriso leve
    f.part(ellipse(32, 20 + d, 8, 8.5), "skin", flat=True)
    eye(f, 27, 20 + d)
    eye(f, 35, 20 + d)
    f.pts([(25, 25 + d), (26, 25 + d), (38, 25 + d), (39, 25 + d)], C["blush"])
    f.pts([(31, 27 + d), (32, 27 + d)], C["mouth"])

    # topo do cabelo e franja reta e cheia logo acima dos olhos
    top = ellipse(32, 17 + d, 9.5, 8) & rect(0, 0, 63, 19 + d)
    f.part(top, "hair", strands=masses(hl=crown(32, 14 + d, 7, 5), tip_rows=0), cast=True)
    for x in range(24, 41):  # sombra embaixo da franja reta
        if f.mat[19 + d, x] == MAT_ID["hair"]:
            f.px(x, 19 + d, MATS["hair"][2])
    # mechas lisas emoldurando o rosto, descendo até o peito
    lock_l = poly([(22, 16 + d), (25, 17 + d), (26, 28 + d), (27, 38 + d), (23, 38 + d), (21, 28 + d)])
    lock_r = poly([(42, 16 + d), (39, 17 + d), (38, 28 + d), (37, 38 + d), (41, 38 + d), (43, 28 + d)])

    if hood:
        hood_m = HOOD(d)
        opening = ellipse(32, 21 + d, 10, 8.5) | poly([(26, 27 + d), (38, 27 + d), (39, 33 + d), (25, 33 + d)])
        hood_m &= ~opening
        f.part(hood_m, "robe")
        gold_edge(f, hood_m & ~rect(25, 0, 39, 63))
        hood_trim(f, hood_m, opening, 30 + d)
        # mechas nascem na borda interna do capuz, ao lado das bochechas, e descem por fora até o peito
        ml = poly([(22, 21 + d), (24, 22 + d), (24, 28 + d), (26, 33 + d), (26, 39 + d), (23, 39 + d), (22, 30 + d)])
        mr = poly([(42, 21 + d), (40, 22 + d), (40, 28 + d), (38, 33 + d), (38, 39 + d), (41, 39 + d), (42, 30 + d)])
        f.part(jagged(ml, 1, (0, 1, 2)), "hair", strands=masses(tip_rows=3, period=2))
        f.part(jagged(mr, 0, (2, 1, 0)), "hair", strands=masses(tip_rows=3, period=2))
        star4(f, 41, 15 + d, arm=2)
    else:
        f.part(jagged(lock_l, 1, (0, 1, 2)), "hair", strands=masses(tip_rows=3, period=2), cast=True)
        f.part(jagged(lock_r, 0, (2, 1, 0)), "hair", strands=masses(tip_rows=3, period=2), cast=True)
        star4(f, 39, 12 + d, arm=2)
        tiny_star(f, 41, 16 + d)

    # gargantilha por cima das mechas no meio
    choker(f, 30, 34, 29 + d, 32)
    b = braco
    magic_star(f, 32, 38 + d, [(26 + b, 36 + d), (38 - b, 34 + d), (37 + b, 42 + d)])
    return f.finish()


# ---------------------------------------------------------------- costas
def draw_back(hood, dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d = dy
    h = -(passo // 2)
    f.part(rect(27, 60 - pe_d, 30, 61 - pe_d), "robe")
    f.part(rect(34, 60 - pe_e, 37, 61 - pe_e), "robe")
    robe = poly([(25, 31 + d), (39, 31 + d), (44 + h, 59), (20 + h, 59)])
    f.part(robe, "robe")
    for x0, y0 in ((25, 46), (32, 44), (39, 46)):
        for y in range(y0, 58):
            f.px(x0 + h, y, MATS["robe"][2])
    for side in (-1, 1):
        sx = 32 + side * 8
        f.part(line((sx, 33 + d), (sx - side, 42 + d), 5) | ellipse(sx, 33 + d, 4, 3.5), "robe")
        tiny_star(f, sx, 38 + d)
    hem(f, 18, 46, 59, [(22 + h, 56), (28 + h, 57), (35 + h, 55), (41 + h, 57)])
    if hood:
        # capuz liso caindo até os ombros, friso dourado embaixo, sem mechas
        hood_m = HOOD(d)
        f.part(hood_m, "robe")
        gold_edge(f, hood_m)
        for y in range(10 + d, 33 + d):  # costura central
            f.px(32, y, MATS["robe"][2])
        star4(f, 23, 15 + d, arm=2)
    else:
        # capuz abaixado: tecido dobrado em U apoiado nos ombros
        down = (ellipse(32, 29 + d, 13, 8) & rect(0, 28 + d, 63, 63)) & ~(ellipse(32, 27 + d, 8, 4) & rect(0, 0, 63, 29 + d))
        f.part(down, "robe")
        for x0 in (23, 27, 37, 41):  # dobras
            for y in range(29 + d, 31 + d + (x0 % 2)):
                f.px(x0, y, MATS["robe"][2])
            f.px(x0 + 1, 29 + d, MATS["robe"][3])
        edge = down & ~shift(down, 0, 1)
        for y, x in zip(*np.nonzero(edge)):  # friso dourado ondulando
            wave = 1 if (x // 3) % 2 else 0
            f.px(x, y - wave, GOLD if x % 3 else GOLD_SH)
            if wave:
                f.px(x, y, MATS["robe"][2])
        # cabelo passa por cima do capuz, no centro, até a cintura com pontas irregulares
        hair = ellipse(32, 18 + d, 10.5, 10.5) | poly([(23, 22 + d), (41, 22 + d), (38, 31 + d), (39, 46 + d),
                                                        (25, 46 + d), (26, 31 + d)])
        f.part(jagged(hair, d), "hair", strands=masses(hl=crown(32, 13 + d, 8, 6), tip_rows=5))
        star4(f, 25, 12 + d, arm=2)
        tiny_star(f, 23, 16 + d)
    # leve brilho da estrela saindo pelos lados do corpo

    def side_glow():
        for x, y, t in ((19, 37, 0.5), (18, 38, 0.3), (45, 37, 0.5), (46, 38, 0.3), (20, 40, 0.3), (44, 40, 0.3)):
            f.glow(x, y + d, C["aura"], t, int(200 * t))
        f.glow(17, 34 + d, C["particle"], 0.8, 160)
        f.glow(47, 35 + d, C["particle"], 0.8, 160)

    f.post.append(side_glow)
    return f.finish()


# ---------------------------------------------------------------- perfil (virada para a direita)
FACE_EDGE = {12: 36, 13: 37, 14: 38, 15: 39, 16: 40, 17: 40, 18: 40, 19: 40, 20: 40, 21: 40,
             22: 41, 23: 40, 24: 40, 25: 40, 26: 39, 27: 38, 28: 36}


def draw_profile_right(hood, dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d, s = dy, sway
    if hood:
        f.part(HOOD_SIDE(d), "robe")
    else:
        # cabelo cai atrás do ombro até a cintura, cobrindo a orelha
        back = ellipse(29, 18 + d, 10, 10) | poly([(19, 18 + d), (33, 16 + d), (31, 30 + d), (29, 38 + d),
                                                    (27, 46 + d), (22 - s, 47 + d), (20 - s, 41 + d), (18, 30 + d)])
        f.part(jagged(back, s), "hair", strands=masses(tip_rows=5))
    # pés e manto
    f.part(rect(29 - passo, 60 - pe_d, 33 - passo, 61 - pe_d), "robe")
    f.part(rect(32 + passo, 60 - pe_e, 36 + passo, 61 - pe_e), "robe")
    f.px(37 + passo, 61 - pe_e, MATS["robe"][2], "robe")
    h = abs(passo) // 2
    robe = poly([(27, 31 + d), (36, 31 + d), (38, 37 + d), (42 + h, 59), (22 - h, 59)])
    f.part(robe, "robe")
    for x, y0 in ((27, 48), (33, 46), (38, 50)):
        for y in range(y0, 58):
            f.px(x, y, MATS["robe"][2])
    # corpete: 2px só na frente do corpo
    f.part(rect(37, 43 + d, 38, 48 + d), "sash", flat=True)
    f.pts([(37, y) for y in range(44 + d, 49 + d)], MATS["sash"][0])
    f.pts([(37, 43 + d), (38, 43 + d)], GOLD)
    hem(f, 20, 46, 59, [(25 - h, 56), (31, 57), (37 + h, 55), (40 + h, 57)])
    if not hood:
        # capuz abaixado dobrado atrás do pescoço
        down = ellipse(27, 31 + d, 6, 3.5)
        f.part(down, "robe")
        gold_edge(f, down)
    # manga larga do braço da frente, mãos diante do peito
    sleeve = line((31, 34 + d), (36, 39 + d), 5) | ellipse(31, 34 + d, 4, 3.5)
    cuff = poly([(34, 36 + d), (38, 37 + d), (38, 43 + d), (33, 42 + d)])
    f.part(sleeve | cuff, "robe")
    for y in range(37 + d, 44 + d):
        f.px(38, y, GOLD if y % 3 else GOLD_SH)
    tiny_star(f, 32, 38 + d)
    tiny_star(f, 35, 41 + d)
    f.part(ellipse(40, 39 + d, 1.8, 1.6), "skin", flat=True)
    # pescoço e gargantilha
    f.part(rect(31, 27 + d, 35, 30 + d), "skin", flat=True)
    # cabeça de perfil
    face = np.zeros((H, W), bool)
    for y, xe in FACE_EDGE.items():
        face[y + d, 30 : xe + 1] = True
    head = (ellipse(31, 20 + d, 8, 8.5) & (np.arange(W)[None, :] <= 36)) | face
    f.part(head, "skin", flat=True)
    f.px(40, 23 + d, MATS["skin"][2])
    eye(f, 36, 20 + d)
    f.pts([(38, 25 + d), (39, 25 + d)], C["blush"])
    f.pts([(38, 27 + d), (39, 26 + d)], C["mouth"])
    # cabelo sobre a cabeça e franja reta acima do olho; mecha cobre a orelha
    hair = (ellipse(30, 16 + d, 10, 8.5) | poly([(20, 17 + d), (29, 17 + d), (31, 30 + d), (25, 33 + d), (20, 28 + d)])) \
        & ~poly([(32, 18 + d), (35, 17 + d), (43, 18 + d), (43, 31 + d), (32, 31 + d)])
    f.part(hair, "hair", strands=masses(hl=crown(30, 13 + d, 7, 5), tip_rows=0), cast=True)
    bangs = poly([(32, 11 + d), (40, 13 + d), (41, 19 + d), (33, 19 + d)])
    f.part(bangs, "hair", strands=masses(hl=crown(36, 14 + d, 5, 3), tip_rows=0), cast=True)
    for x in range(33, 42):
        if f.mat[19 + d, x] == MAT_ID["hair"]:
            f.px(x, 19 + d, MATS["hair"][2])
    if hood:
        hood_m = HOOD_SIDE(d)
        opening = ellipse(38, 21 + d, 6.5, 9.5) | poly([(33, 27 + d), (42, 27 + d), (42, 34 + d), (36, 34 + d)])
        hood_m &= ~opening
        f.part(hood_m, "robe")
        gold_edge(f, hood_m & ~rect(33, 0, 63, 63))
        hood_trim(f, hood_m, opening, 30 + d)
        # mecha saindo do capuz e caindo sobre o peito
        f.part(jagged(poly([(31, 24 + d), (33, 25 + d), (35, 38 + d), (32, 38 + d)]), 0, (0, 1, 2)), "hair",
               strands=masses(tip_rows=3, period=2), cast=True)
        star4(f, 27, 14 + d, arm=2)
    else:
        f.part(jagged(poly([(30, 18 + d), (33, 19 + d), (33, 34 + d), (29, 35 + d)]), 0, (1, 0, 2)), "hair",
               strands=masses(tip_rows=3, period=2), cast=True)
        star4(f, 26, 12 + d, arm=2)
        tiny_star(f, 24, 16 + d)
    choker(f, 32, 35, 29 + d, 35)
    b = braco
    magic_star(f, 41, 36 + d, [(45 + b, 33 + d), (44 - b, 41 + d), (38 + b, 31 + d)])
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
    return dict(dy=i, sway=i, braco=i)


def game_frame(hood, direction, anim, i):
    """direction: 0 norte (costas), 1 oeste, 2 sul (frente), 3 leste."""
    p = params(anim, i)
    if direction == 0:
        return draw_back(hood, **p)
    if direction == 2:
        return draw_front(hood, **p)
    right = draw_profile_right(hood, **p)
    return right if direction == 3 else right.transpose(Image.FLIP_LEFT_RIGHT)


def game_sheet(hood, anim, n, width=832):
    img = Image.new("RGBA", (width, 4 * H), (0, 0, 0, 0))
    for d in range(4):
        for i in range(n):
            img.alpha_composite(game_frame(hood, d, anim, i), (i * W, d * H))
    return img


def main():
    variant = sys.argv[1] if len(sys.argv) > 1 else "capuz"
    hood = variant == "capuz"
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent / variant
    dest.mkdir(parents=True, exist_ok=True)
    walk, idle = game_sheet(hood, "walk", 9), game_sheet(hood, "idle", 2)
    walk.save(dest / "walk.png")
    idle.save(dest / "idle.png")
    # prévia: frente, oeste, costas, leste (quadro parado)
    prev = Image.new("RGBA", (4 * W, H), (0, 0, 0, 0))
    for k, row in enumerate((2, 1, 0, 3)):
        prev.alpha_composite(walk.crop((0, row * H, W, (row + 1) * H)), (k * W, 0))
    prev.save(dest / "preview.png")
    prev.resize((prev.width * 4, prev.height * 4), Image.NEAREST).save(dest / "preview-4x.png")
    frames = [walk.crop((i * W, 2 * H, (i + 1) * W, 3 * H)) for i in range(1, 9)]
    big = [fr.resize((W * 4, H * 4), Image.NEAREST) for fr in frames]
    bg = [Image.new("RGBA", b.size, (58, 52, 80, 255)) for b in big]
    for g, b in zip(bg, big):
        g.alpha_composite(b)
    bg[0].save(dest / "andando.gif", save_all=True, append_images=bg[1:], duration=110, loop=0)
    colors = {tuple(c) for c in np.array(prev).reshape(-1, 4) if c[3]}
    print(f"ok: {dest} ({len(colors)} cores na prévia)")


if __name__ == "__main__":
    main()
