"""Aventureira gata (raposa) desenhada pixel a pixel.

Mesmo formato da Selena: frames 64x64; sheet de 4 poses na ordem
costas, perfil para a esquerda, frente, perfil para a direita, e as folhas
do jogo walk.png (9 quadros) e idle.png (2), 832x256, linhas norte, oeste, sul, leste.

O perfil é desenhado virado para a direita e espelhado para o oeste, mas com
o lado certo do corpo: no leste aparecem a pintura facial e o osso (lado
direito dela); no oeste, as bolsinhas e a bainha (lado esquerdo).

Uso: python3 draw_aventureira.py [pasta_de_saida]
"""

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

W = H = 64


def hx(s):
    s = s.lstrip("#")
    return tuple(int(s[i : i + 2], 16) for i in (0, 2, 4)) + (255,)


# luz, base, sombra, sombra profunda
MATS = {
    "hair": ["#FFB566", "#F07A2A", "#C2501A", "#8A3410"],
    "ear": ["#FFB566", "#F07A2A", "#C2501A", "#8A3410"],
    "skin": ["#FBE3D3", "#F3D2BC", "#D9A58E", "#C48A74"],
    "fur": ["#E6D9BC", "#E6D9BC", "#C9B994", "#9C8B68"],
    "shirt": ["#3A4262", "#2A3048", "#1A1E30", "#1A1E30"],
    "vest": ["#86603F", "#6B4A30", "#45301E", "#45301E"],
    "belt": ["#3A3A44", "#222228", "#16161A", "#16161A"],
    "pants": ["#5E4535", "#4A3528", "#2E2018", "#2E2018"],
    "boot": ["#5A3E2E", "#45301E", "#2E2018", "#2E2018"],
    "pouch": ["#8A6648", "#6B4A30", "#45301E", "#45301E"],
    "bone": ["#EDE6D6", "#EDE6D6", "#B8AE98", "#B8AE98"],
    "sheath": ["#3A3A44", "#1A1A1E", "#1A1A1E", "#1A1A1E"],
    "silver": ["#E0E4EC", "#C8CCD6", "#7E8494", "#7E8494"],
}
MATS = {k: [hx(c) for c in v] for k, v in MATS.items()}
MAT_ID = {k: i + 1 for i, k in enumerate(MATS)}
ID_MAT = {v: k for k, v in MAT_ID.items()}

OUTLINE = hx("#1C1418")
OUTLINE_BY_MAT = {"hair": hx("#4A1C0C"), "ear": hx("#4A1C0C"), "fur": hx("#5E5240")}
C = {
    "ear_tip": hx("#4A2A1A"),
    "ear_tip_hi": hx("#6A4030"),
    "ear_in": hx("#F2E2C8"),
    "ear_in_sh": hx("#D9A890"),
    "eye_hi": hx("#C8F57A"),
    "iris": hx("#5DBA3A"),
    "eye_sh": hx("#2E6E22"),
    "white": hx("#FFFFFF"),
    "lash": hx("#2A1C14"),
    "paint": hx("#E0482A"),
    "mouth": hx("#B87A66"),
    "lace": hx("#121216"),
    "vine": hx("#5E9E3A"),
    "vine_sh": hx("#3A6A24"),
    "hilt": hx("#6B4A30"),
    "hilt_sh": hx("#45301E"),
    "stitch": hx("#45301E"),
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


def line(a, b, width):
    return mask_from(lambda d: d.line([a, b], fill=1, width=width))


def shift(m, dx, dy):
    """Valor de m no pixel p+(dx,dy); fora da tela conta como vazio."""
    out = np.zeros_like(m)
    ys, ye = max(0, -dy), min(H, H - dy)
    xs, xe = max(0, -dx), min(W, W - dx)
    out[ys:ye, xs:xe] = m[ys + dy : ye + dy, xs + dx : xe + dx]
    return out


def fuzzy(m, phase=0):
    """Borda felpuda: tufos de 1px para baixo e para os lados, e pixels soltos."""
    out = m.copy()
    bottom = m & ~shift(m, 0, 1)
    side = m & (~shift(m, 1, 0) | ~shift(m, -1, 0)) & ~bottom
    for y, x in zip(*np.nonzero(bottom)):
        k = (x + phase) % 4
        if k in (0, 1) and y + 1 < H:
            out[y + 1, x] = True
        if k == 0 and y + 2 < H:
            out[y + 2, x] = True
    for y, x in zip(*np.nonzero(side)):
        if (y + phase) % 3 == 0:
            dx = 1 if not m[y, min(W - 1, x + 1)] else -1
            if 0 <= x + dx < W:
                out[y, x + dx] = True
    return out


def fur_texture(tone, m):
    ys, xs = np.mgrid[0:H, 0:W]
    inner = m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1) & shift(m, 0, -1)
    tone = tone.copy()
    tufts = inner & (((xs * 3 + ys * 5) % 7) == 0) & (tone <= 1)
    tone[tufts] = 2
    return tone


def fan(cx, top, period=4, spread=9.0, phase=0):
    """Mechas que abrem em leque a partir do alto da cabeça."""

    def fn(tone, m):
        ys, xs = np.mgrid[0:H, 0:W]
        u = (xs + 0.5 - cx) * spread / (np.maximum(ys - top, 0) + spread * 0.7)
        k = np.floor(u + phase).astype(int) % period
        inner = m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1)
        tone = tone.copy()
        tone[inner & (k == 0) & (tone < 3)] = 2
        tone[inner & (k == 1) & (tone == 1)] = 0
        return tone

    return fn


def strands(period=4, slant=0.0, phase=0.0):
    """Mechas: linha de sombra a cada `period` px e 1px de brilho ao lado."""

    def fn(tone, m):
        ys, xs = np.mgrid[0:H, 0:W]
        off = np.round(0.8 * np.sin(ys * 0.5 + phase) + ys * slant).astype(int)
        k = (xs + off) % period
        inner = m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1)
        tone = tone.copy()
        tone[inner & (k == 0) & (tone < 3)] = 2
        tone[inner & (k == 1) & (tone == 1)] = 0
        return tone

    return fn


# ---------------------------------------------------------------- canvas
class Frame:
    def __init__(self):
        self.rgba = np.zeros((H, W, 4), np.uint8)
        self.mat = np.zeros((H, W), np.uint8)

    def part(self, m, mat, tex=None, cast=False, light_from=-1):
        t = MATS[mat]
        L = light_from
        deep = ~shift(m, -L, 0) | ~shift(m, 0, 1)
        shadow = (~shift(m, -3 * L, 1) | ~shift(m, -L, 3)) & ~deep
        light = (~shift(m, 2 * L, -1) | ~shift(m, L, -2)) & ~shadow & ~deep
        tone = np.full((H, W), 1)
        tone[shadow] = 2
        tone[deep] = 3
        tone[light] = 0
        if tex is not None:
            tone = tex(tone, m)
        if cast:
            below = shift(m, 0, -1) & ~m & (self.mat > 0)
            for y, x in zip(*np.nonzero(below)):
                under = ID_MAT[self.mat[y, x]]
                if under not in ("silver",):
                    self.rgba[y, x] = MATS[under][2]
        for i in range(4):
            self.rgba[m & (tone == i)] = t[i]
        self.mat[m] = MAT_ID[mat]

    def px(self, x, y, color, mat=None):
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
        for y, x in zip(*np.nonzero(out)):
            color = OUTLINE
            for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                qx, qy = x + dx, y + dy
                if 0 <= qx < W and 0 <= qy < H and a[qy, qx]:
                    name = ID_MAT.get(self.mat[qy, qx])
                    if name in OUTLINE_BY_MAT:
                        color = OUTLINE_BY_MAT[name]
                        break
            self.rgba[y, x] = color
        return Image.fromarray(self.rgba, "RGBA")


# ---------------------------------------------------------------- peças comuns
def ear(f, base_a, tip, base_b, inner=True, d=0):
    """Orelha triangular: exterior laranja, terço superior marrom, interior creme."""
    a = (base_a[0], base_a[1] + d)
    t = (tip[0], tip[1] + d)
    b = (base_b[0], base_b[1] + d)
    m = poly([a, t, b])
    f.part(m, "ear")
    top = min(a[1], b[1])
    cut = t[1] + (top - t[1]) / 3 + 0.5
    for y, x in zip(*np.nonzero(m)):
        if y <= cut:
            f.px(x, y, C["ear_tip"] if (x + y) % 5 else C["ear_tip_hi"])
    if inner:
        cx = (a[0] + b[0]) / 2
        cy = (a[1] + b[1]) / 2
        k = 0.42
        ia = (a[0] + (cx - a[0]) * k + (t[0] - a[0]) * 0.12, a[1] + (t[1] - a[1]) * 0.12)
        ib = (b[0] + (cx - b[0]) * k + (t[0] - b[0]) * 0.12, b[1] + (t[1] - b[1]) * 0.12)
        it = (t[0] + (cx - t[0]) * 0.35, t[1] + (cy - t[1]) * 0.42)
        im = poly([ia, it, ib]) & m
        for y, x in zip(*np.nonzero(im)):
            f.px(x, y, C["ear_in_sh"] if y >= cy - 2 or not im[max(0, y - 1), x] else C["ear_in"])
        for y, x in zip(*np.nonzero(im)):
            if y > cut and y < cy - 2 and (x + y) % 2 == 0:
                f.px(x, y, C["ear_in"])


def front_eye(f, ex, y):
    f.pts([(ex - 1, y), (ex, y), (ex + 1, y), (ex + 2, y)], C["lash"])
    f.px(ex, y + 1, C["white"])
    f.px(ex + 1, y + 1, C["eye_hi"])
    f.px(ex, y + 2, C["iris"])
    f.px(ex + 1, y + 2, C["iris"])
    f.px(ex, y + 3, C["eye_sh"])
    f.px(ex + 1, y + 3, C["eye_sh"])


def buckle(f, x0, y0, w=5, h=5):
    """Fivela quadrada prateada: moldura com miolo escuro."""
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            edge = x in (x0, x0 + w - 1) or y in (y0, y0 + h - 1)
            if edge:
                shade = x == x0 + w - 1 or y == y0 + h - 1
                f.px(x, y, MATS["silver"][2] if shade else MATS["silver"][1], "silver")
            else:
                f.px(x, y, MATS["belt"][2], "belt")
    f.px(x0, y0, MATS["silver"][0])
    f.px(x0 + w // 2, y0 + h // 2, MATS["silver"][2])  # pino


def vine_line(f, x0, x1, y, phase=0):
    """Vinha fina ondulando sobre uma linha horizontal, com folhinhas."""
    for x in range(x0, x1 + 1):
        k = (x + phase) % 6
        yy = y + (0 if k < 3 else 1)
        f.px(x, yy, C["vine"] if k % 3 else C["vine_sh"])
        if k == 1:
            f.px(x, yy - 1, C["vine"])
        if k == 4:
            f.px(x + 1, yy + 1, C["vine_sh"])


def boot_vine(f, x0, y0, w):
    for i in range(w):
        f.px(x0 + i, y0 + (i % 3 == 1), C["vine"] if i % 2 else C["vine_sh"])


def bone(f, a, b):
    m = line(a, b, 1)
    for p in (a, b):
        m |= rect(int(p[0]) - 1, int(p[1]) - 1, int(p[0]), int(p[1])) | rect(int(p[0]), int(p[1]), int(p[0]) + 1, int(p[1]) + 1)
    f.part(m, "bone")


def sheath(f, a, b):
    m = line(a, b, 3)
    f.part(m, "sheath")
    # brilho de 1px ao longo da bainha e ponteira prateada
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])))
    for i in range(1, n):
        t = i / n
        x, y = round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t)
        if i % 3:
            f.px(x - 1, y, MATS["sheath"][0])
    f.px(round(b[0]), round(b[1]), MATS["silver"][2], "silver")


def hilt(f, guard, grip_end, curve=1):
    """Guarda prateada curva, cabo marrom enrolado e pomo claro."""
    gx, gy = guard
    f.pts([(gx - 2, gy + curve), (gx - 1, gy), (gx, gy), (gx + 1, gy), (gx + 2, gy + curve)], MATS["silver"][1], "silver")
    f.px(gx - 1, gy, MATS["silver"][0])
    f.px(gx + 2, gy + curve, MATS["silver"][2])
    ex, ey = grip_end
    n = max(abs(ex - gx), abs(ey - gy))
    for i in range(1, n + 1):
        t = i / n
        x, y = round(gx + (ex - gx) * t), round(gy + (ey - gy) * t)
        f.px(x, y, C["hilt"] if i % 2 else C["hilt_sh"], "pouch")
    dx = 0 if ex == gx else (1 if ex > gx else -1)
    dy = -1 if ey < gy else 1
    f.px(ex + dx, ey + dy, MATS["silver"][0], "silver")
    f.px(ex + dx, ey + dy - dy, MATS["silver"][1], "silver") if dx else None


def pouch(f, x0, y0, w=3, h=4):
    f.part(rect(x0, y0, x0 + w - 1, y0 + h - 1), "pouch")
    for x in range(x0, x0 + w):
        f.px(x, y0, MATS["pouch"][2])
    f.px(x0 + w // 2, y0 + 1, MATS["silver"][1])


# ---------------------------------------------------------------- frente
def draw_front(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d = dy
    s = sway

    # bainha (lado esquerdo dela = direita da tela), atrás das bolsinhas
    sheath(f, (40, 47 + d), (47 + s, 57))

    # pernas largas e botas com dobra (a de trás de cada passo sobe)
    for x0, lev in ((24, pe_e), (33, pe_d)):
        leg = poly([(x0 + 1, 47 + d), (x0 + 7, 47 + d), (x0 + 8, 56 - lev), (x0, 56 - lev)])
        f.part(leg, "pants")
        f.part(rect(x0, 55 - lev, x0 + 7, 61 - lev), "boot")
        f.part(rect(x0 - 1, 55 - lev, x0 + 8, 56 - lev), "boot")
        for x in range(x0 - 1, x0 + 9):
            f.px(x, 55 - lev, MATS["boot"][0] if x % 2 else MATS["boot"][1])
        boot_vine(f, x0, 58 - lev, 8)
    f.part(rect(31, 47 + d, 33, 50 + d), "pants")

    # braços: manga longa azul-marinho e mãos
    for side in (-1, 1):
        cx = 32 + side * 11
        a = d - (braco * side if braco * side > 0 else 0)
        sleeve = poly([(cx - 3, 33 + d), (cx + 2, 33 + d), (cx + 2 + side, 44 + a), (cx - 2 + side, 44 + a)])
        f.part(sleeve, "shirt")
        f.part(ellipse(cx + side, 46 + a, 1.8, 1.8), "skin")

    # tronco: camisa, colete de couro com amarração em X
    f.part(poly([(25, 33 + d), (39, 33 + d), (39, 47 + d), (25, 47 + d)]), "shirt")
    f.part(poly([(26, 34 + d), (38, 34 + d), (38, 45 + d), (26, 45 + d)]), "vest")
    for y in range(36 + d, 45 + d):
        f.px(32, y, MATS["shirt"][2])
    for i, y in enumerate(range(37 + d, 45 + d)):
        f.px(31 + (i % 2), y, C["lace"])
        f.px(33 - (i % 2), y, C["lace"])

    # cinto preto largo com fivela prata grande e vinha na cintura
    f.part(rect(25, 44 + d, 39, 47 + d), "belt")
    vine_line(f, 25, 39, 48 + d, phase=1)
    buckle(f, 30, 43 + d)

    # osso pendurado na diagonal (lado direito dela = esquerda da tela)
    bone(f, (28, 47 + d), (24 - s, 54 + d))
    # duas bolsinhas no quadril oposto
    pouch(f, 35, 47 + d)
    pouch(f, 38, 47 + d, w=3, h=3)
    # cabo da espada acima da cintura
    hilt(f, (40, 44 + d), (41, 40 + d))

    # capa curta de pelo, volumosa, mais larga que os ombros
    cape = ellipse(32, 33 + d, 14.5, 5.5) | ellipse(32, 30 + d, 9, 3)
    for tx in (20, 24, 28, 32, 36, 40, 44):
        cape |= poly([(tx - 2.5, 35 + d), (tx + 2.5, 35 + d), (tx + (s if tx % 8 else 0), 39 + d + (tx % 3 == 0))])
    f.part(fuzzy(cape, phase=s + 2), "fur", tex=fur_texture)

    # cabelo de trás (bob até o queixo, pontas para fora)
    back = ellipse(32, 18 + d, 11, 10) | ellipse(32, 21 + d, 11.5, 7.5)
    back |= ellipse(21 - (s < 0), 27 + d, 2, 1.6) | ellipse(43 + (s > 0), 27 + d, 2, 1.6)
    back &= rect(0, 0, 63, 28 + d)
    f.part(back, "hair", tex=fan(32, 8 + d))

    # pescoço e rosto
    f.part(rect(30, 27 + d, 34, 30 + d), "skin")
    f.part(ellipse(32, 20 + d, 8, 8), "skin")
    for x in range(30, 35):
        f.px(x, 29 + d, MATS["skin"][2])

    # orelhas de raposa grandes, inclinadas para fora
    ear(f, (21, 14), (16, 2), (30, 9), d=d)
    ear(f, (43, 14), (48, 2), (34, 9), d=d)


    # franja repicada com mecha central mais longa
    fringe = ellipse(32, 16 + d, 10.5, 8) & poly([
        (21, 6 + d), (43, 6 + d), (43, 21 + d), (41, 17 + d), (39, 19 + d), (37, 16 + d),
        (35, 18 + d), (33, 22 + d), (32, 23 + d), (31, 22 + d), (30, 17 + d), (28, 16 + d), (26, 19 + d),
        (24, 16 + d), (21, 21 + d),
    ])
    f.part(fringe, "hair", tex=fan(32, 6 + d, period=3), cast=True)
    # mechas laterais emoldurando o rosto, pontas viradas para fora
    left = poly([(21, 14 + d), (24, 14 + d), (25, 21 + d), (24, 26 + d), (23, 28 + d), (20, 29 + d), (21, 25 + d), (20, 20 + d)])
    right = poly([(43, 14 + d), (40, 14 + d), (39, 21 + d), (40, 26 + d), (41, 28 + d), (44, 29 + d), (43, 25 + d), (44, 20 + d)])
    f.part(left, "hair", tex=strands(period=3, slant=0.3), cast=True)
    f.part(right, "hair", tex=strands(period=3, slant=-0.3), cast=True)
    f.pts([(19 - (s < 0), 29 + d), (45 + (s > 0), 29 + d)], MATS["hair"][2], "hair")
    # fios soltos no topo
    f.pts([(30, 7 + d), (31, 6 + d), (35, 8 + d)], MATS["hair"][1], "hair")
    # olhos verdes, boca de 1px, pintura facial na bochecha direita dela
    front_eye(f, 27, 20 + d)
    front_eye(f, 35, 20 + d)
    f.px(32, 26 + d, C["mouth"])
    f.pts([(25, 25 + d), (26, 24 + d), (25, 27 + d), (26, 26 + d), (27, 25 + d)], C["paint"])
    return f.finish()


# ---------------------------------------------------------------- costas
def draw_back(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d = dy
    s = sway
    # bainha e bolsinhas (lado esquerdo dela = esquerda da tela) saindo da silhueta
    sheath(f, (25, 47 + d), (17 - s, 57))
    pouch(f, 21, 46 + d)
    pouch(f, 24, 47 + d, w=3, h=3)

    for x0, lev in ((24, pe_d), (33, pe_e)):
        leg = poly([(x0 + 1, 47 + d), (x0 + 7, 47 + d), (x0 + 8, 56 - lev), (x0, 56 - lev)])
        f.part(leg, "pants")
        f.part(rect(x0, 55 - lev, x0 + 7, 61 - lev), "boot")
        f.part(rect(x0 - 1, 55 - lev, x0 + 8, 56 - lev), "boot")
        for x in range(x0 - 1, x0 + 9):
            f.px(x, 55 - lev, MATS["boot"][0] if x % 2 else MATS["boot"][1])
        boot_vine(f, x0, 58 - lev, 8)
    f.part(rect(31, 47 + d, 33, 50 + d), "pants")

    for side in (-1, 1):
        cx = 32 + side * 11
        a = d - (braco * -side if braco * -side > 0 else 0)
        f.part(poly([(cx - 3, 33 + d), (cx + 2, 33 + d), (cx + 2 + side, 44 + a), (cx - 2 + side, 44 + a)]), "shirt")
        f.part(ellipse(cx + side, 46 + a, 1.8, 1.8), "skin")

    f.part(poly([(25, 33 + d), (39, 33 + d), (39, 47 + d), (25, 47 + d)]), "shirt")
    # costas do colete
    f.part(poly([(26, 38 + d), (38, 38 + d), (38, 45 + d), (26, 45 + d)]), "vest")
    f.part(rect(25, 44 + d, 39, 47 + d), "belt")
    vine_line(f, 25, 39, 48 + d, phase=4)
    # ponta do osso aparecendo do outro lado
    f.part(ellipse(41.5 + s, 50 + d, 1.3, 1.3), "bone")

    # capa de pelo cobrindo toda a parte de cima das costas
    cape = ellipse(32, 33.5 + d, 14.5, 5.5) | ellipse(32, 31 + d, 9, 2.5)
    for tx in (20, 24, 28, 32, 36, 40, 44):
        cape |= poly([(tx - 2.5, 36 + d), (tx + 2.5, 36 + d), (tx - (s if tx % 8 else 0), 40 + d + (tx % 3 == 0))])
    f.part(fuzzy(cape, phase=1 - s), "fur", tex=fur_texture)

    # nuca visível entre o cabelo e a gola
    f.part(rect(29, 24 + d, 35, 28 + d), "skin")

    # orelhas: só o exterior laranja com ponta escura
    ear(f, (21, 14), (16, 2), (30, 9), inner=False, d=d)
    ear(f, (43, 14), (48, 2), (34, 9), inner=False, d=d)

    # cabelo arredondado que não passa da nuca, pontas para fora
    hair = ellipse(32, 17 + d, 11, 9.5) | ellipse(32, 20 + d, 11.5, 6)
    hair &= ~poly([(29, 27 + d), (30, 25 + d), (34, 25 + d), (35, 27 + d)])
    hair |= ellipse(21 - (s > 0), 25 + d, 2, 1.5) | ellipse(43 + (s < 0), 25 + d, 2, 1.5)
    f.part(hair, "hair", tex=fan(32, 7 + d, phase=0.5))
    f.pts([(19 - (s > 0), 26 + d), (45 + (s < 0), 26 + d)], MATS["hair"][2], "hair")
    # redemoinho no alto
    f.pts([(31, 11 + d), (32, 10 + d), (33, 11 + d), (32, 12 + d)], MATS["hair"][0])
    return f.finish()


# ---------------------------------------------------------------- perfil (virada para a direita)
def draw_profile(near="dir", dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    """near: lado do corpo virado para a câmera ('dir' no leste, 'esq' no oeste)."""
    f = Frame()
    d = dy
    s = sway

    if near == "dir":
        # bainha do lado de lá: só a ponta aparece atrás das pernas
        sheath(f, (30, 47 + d), (21 - s, 57))

    # perna de trás e perna da frente, com passo
    for x0, lev in ((28 - passo, pe_d), (30 + passo, pe_e)):
        leg = poly([(x0, 47 + d), (x0 + 6, 47 + d), (x0 + 7, 56 - lev), (x0, 56 - lev)])
        f.part(leg, "pants")
        f.part(rect(x0, 55 - lev, x0 + 7, 61 - lev), "boot")
        f.px(x0 + 8, 61 - lev, MATS["boot"][1], "boot")
        f.px(x0 + 8, 60 - lev, MATS["boot"][1], "boot")
        f.part(rect(x0 - 1, 55 - lev, x0 + 7, 56 - lev), "boot")
        for x in range(x0 - 1, x0 + 8):
            f.px(x, 55 - lev, MATS["boot"][0] if x % 2 else MATS["boot"][1])
        boot_vine(f, x0, 58 - lev, 7)

    # tronco de lado, colete com amarração na frente
    f.part(poly([(27, 33 + d), (36, 33 + d), (38, 37 + d), (37, 47 + d), (27, 47 + d)]), "shirt")
    f.part(poly([(30, 34 + d), (36, 34 + d), (38, 37 + d), (37, 45 + d), (30, 45 + d)]), "vest")
    for y in range(37 + d, 45 + d):
        f.px(36 + (1 if y < 41 + d else 0) - (y % 2), y, C["lace"])
    f.part(rect(27, 44 + d, 38, 47 + d), "belt")
    vine_line(f, 27, 38, 48 + d, phase=2)
    buckle(f, 36, 43 + d, w=3, h=5)

    if near == "dir":
        bone(f, (30, 47 + d), (27 - s, 54 + d))
        hilt(f, (37, 44 + d), (40, 41 + d), curve=0)
    else:
        pouch(f, 26, 47 + d)
        sheath(f, (33, 47 + d), (22 - s, 57))
        hilt(f, (35, 44 + d), (39, 41 + d), curve=0)

    # braço da frente
    b = braco
    f.part(poly([(29, 33 + d), (34, 33 + d), (35 + b, 44 + d), (31 + b, 44 + d)]), "shirt")
    f.part(ellipse(33 + b, 46 + d, 1.8, 1.8), "skin")

    # capa de pelo
    cape = ellipse(31, 33 + d, 10, 5.5) | ellipse(32, 30 + d, 6, 3)
    for tx in (23, 27, 31, 35, 39):
        cape |= poly([(tx - 2.5, 35 + d), (tx + 2.5, 35 + d), (tx - s, 39 + d + (tx % 3 == 0))])
    f.part(fuzzy(cape, phase=s), "fur", tex=fur_texture)

    # orelha de lá (mais à frente) e cabelo de trás
    ear(f, (31, 11), (36, 2), (38, 11), inner=False, d=d)
    hair_back = ellipse(30, 17 + d, 9.5, 9) | poly([(21, 17 + d), (30, 17 + d), (31, 27 + d), (26, 28 + d), (22, 27 + d)])
    hair_back |= ellipse(22 - (s > 0), 27 + d, 2, 1.5)
    f.part(hair_back, "hair", tex=strands(period=4, slant=-0.25, phase=0.3))
    f.px(20 - (s > 0), 28 + d, MATS["hair"][2], "hair")

    # rosto de perfil (borda da frente linha a linha) e pescoço
    f.part(rect(30, 27 + d, 33, 30 + d), "skin")
    edge = {12: 36, 13: 37, 14: 38, 15: 39, 16: 40, 17: 40, 18: 40, 19: 40, 20: 40, 21: 40,
            22: 41, 23: 40, 24: 40, 25: 40, 26: 39, 27: 38, 28: 36}
    face = np.zeros((H, W), bool)
    for y, xe in edge.items():
        face[y + d, 30 : xe + 1] = True
    head = (ellipse(31, 20 + d, 8, 8.5) & (np.arange(W)[None, :] <= 36)) | face
    f.part(head, "skin")
    f.px(40, 23 + d, MATS["skin"][2])
    # olho verde
    f.pts([(35, 20 + d), (36, 20 + d), (37, 20 + d)], C["lash"])
    f.px(36, 21 + d, C["white"])
    f.px(37, 21 + d, C["eye_hi"])
    f.pts([(36, 22 + d), (37, 22 + d)], C["iris"])
    f.pts([(36, 23 + d), (37, 23 + d)], C["eye_sh"])
    f.px(39, 25 + d, C["mouth"])
    if near == "dir":
        f.pts([(34, 25 + d), (35, 24 + d), (34, 27 + d), (35, 26 + d), (36, 25 + d)], C["paint"])

    # cabelo por cima: cobre o crânio, franja repicada à frente
    hair = (ellipse(30, 16 + d, 9.5, 8.5) | poly([(21, 17 + d), (28, 17 + d), (29, 27 + d), (24, 29 + d), (21, 27 + d)])) \
        & ~poly([(31, 19 + d), (34, 15 + d), (42, 16 + d), (42, 31 + d), (31, 31 + d)])
    f.part(hair, "hair", tex=fan(33, 7 + d, phase=0.5), cast=True)
    fringe = poly([(31, 9 + d), (38, 11 + d), (41, 16 + d), (40, 19 + d), (39, 16 + d), (37, 18 + d), (36, 15 + d),
                   (34, 17 + d), (33, 15 + d)])
    f.part(fringe, "hair", tex=strands(period=3, slant=-0.8), cast=True)
    # mecha na frente da orelha, ponta virada para fora
    f.part(poly([(30, 18 + d), (33, 18 + d), (33, 26 + d), (34, 29 + d), (31, 28 + d), (30, 24 + d)]), "hair",
           tex=strands(period=3, slant=0.2), cast=True)
    f.px(35, 29 + d, MATS["hair"][2], "hair")

    # orelha de cá: grande, inclinada para trás, interior creme visível
    ear(f, (22, 13), (19, 2), (30, 9), d=d)
    return f.finish()


# ---------------------------------------------------------------- folhas
def sheet(dy=0, sway=0):
    east = draw_profile("dir", dy, sway)
    west = draw_profile("esq", dy, sway).transpose(Image.FLIP_LEFT_RIGHT)
    frames = [draw_back(dy, sway), west, draw_front(dy, sway), east]
    out = Image.new("RGBA", (W * 4, H), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        out.paste(fr, (i * W, 0))
    return out


def params(anim, i):
    """Mesmo ciclo da Selena e do Bigodes: walk com 9 quadros (0 = parado), idle com 2."""
    if anim == "walk":
        si = 0 if i == 0 else math.sin(2 * math.pi * (i - 1) / 8)
        co = 0 if i == 0 else math.cos(2 * math.pi * (i - 1) / 8)
        return dict(
            dy=0 if i == 0 else (-1 if abs(co) > 0.7 else 0),
            sway=round(si),
            pe_e=max(0, round(1.6 * si)),
            pe_d=max(0, round(-1.6 * si)),
            passo=round(2.4 * si),
            braco=round(-1.2 * si),
        )
    return dict(dy=i, sway=i)


def game_frame(direction, anim, i):
    """direction: 0 norte (costas), 1 oeste, 2 sul (frente), 3 leste."""
    p = params(anim, i)
    if direction == 0:
        return draw_back(**p)
    if direction == 2:
        return draw_front(**p)
    if direction == 3:
        return draw_profile("dir", **p)
    return draw_profile("esq", **p).transpose(Image.FLIP_LEFT_RIGHT)


def game_sheet(anim, n, width=832):
    img = Image.new("RGBA", (width, 4 * H), (0, 0, 0, 0))
    for d in range(4):
        for i in range(n):
            img.alpha_composite(game_frame(d, anim, i), (i * W, d * H))
    return img


def main():
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
    dest.mkdir(parents=True, exist_ok=True)
    s = sheet()
    s.save(dest / "aventureira_sheet.png")
    s.resize((s.width * 4, s.height * 4), Image.NEAREST).save(dest / "aventureira_sheet_4x.png")
    walk, idle = game_sheet("walk", 9), game_sheet("idle", 2)
    walk.save(dest / "walk.png")
    idle.save(dest / "idle.png")
    walk.resize((walk.width * 3, walk.height * 3), Image.NEAREST).save(dest / "walk_3x.png")
    colors = {tuple(c) for c in np.array(s).reshape(-1, 4) if c[3]}
    print(f"cores: {len(colors)}")


if __name__ == "__main__":
    main()
