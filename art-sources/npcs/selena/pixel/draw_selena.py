"""Selena (bartender da taverna) desenhada pixel a pixel.

Gera uma sheet de 4 frames 64x64 na ordem da preview do LPC:
costas, perfil virado para a esquerda, frente, perfil virado para a direita.
O perfil é desenhado uma vez (virado para a direita) e espelhado.

Uso: python3 draw_selena.py [pasta_de_saida]
Saída: selena_sheet.png (1x) e selena_sheet_4x.png (nearest neighbor),
selena_breath.png (2 linhas: respiração, opcional) e as folhas do jogo
walk.png (9 quadros) e idle.png (2 quadros), 832x256, linhas norte, oeste, sul, leste.
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


# Cada material: luz, base, sombra, sombra profunda (3 níveis + highlight).
MATS = {
    "hair": ["#E4E3F2", "#B9B7D6", "#8584A8", "#5E5C80"],
    "skin": ["#FBE3D3", "#F3D2BC", "#D9A58E", "#D9A58E"],
    "blouse": ["#FFFFFF", "#F4EFE6", "#CFC8BC", "#A39C93"],
    "corset": ["#3C3F52", "#262833", "#16171F", "#16171F"],
    "leather": ["#7A5A44", "#5A3E2E", "#3F2A1F", "#3F2A1F"],
    "skirt": ["#4A4E78", "#34375A", "#212340", "#212340"],
    "apron": ["#FFFFFF", "#EDE6D8", "#CFC8BC", "#A39C93"],
    "bow": ["#3A3A48", "#1E1E26", "#1E1E26", "#1E1E26"],
    "shoe": ["#3A3A48", "#1E1E26", "#1E1E26", "#1E1E26"],
}
MATS = {k: [hx(c) for c in v] for k, v in MATS.items()}
MAT_ID = {k: i + 1 for i, k in enumerate(MATS)}
ID_MAT = {v: k for k, v in MAT_ID.items()}

OUTLINE = hx("#17131C")
GOLD = hx("#FFE9B8")
C = {
    "iris": hx("#7C86A8"),
    "white": hx("#FFFFFF"),
    "lash": hx("#2A2433"),
    "brow": hx("#6E6C8C"),
    "mouth": hx("#C4574F"),
    "blush": hx("#EBA99F"),
    "gem": hx("#5B8FD8"),
    "gem_hi": hx("#A8CCF5"),
    "silver": hx("#C9CCD6"),
    "lace": hx("#CFC8BC"),
    "lacing": hx("#8E90A8"),
    "trim": hx("#8E90A8"),
    "stitch": hx("#8E90A8"),
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
    m[y0 : y1 + 1, x0 : x1 + 1] = True
    return m


def shift(m, dx, dy):
    """Valor de m no pixel p+(dx,dy); fora da tela conta como vazio."""
    out = np.zeros_like(m)
    ys, ye = max(0, -dy), min(H, H - dy)
    xs, xe = max(0, -dx), min(W, W - dx)
    out[ys:ye, xs:xe] = m[ys + dy : ye + dy, xs + dx : xe + dx]
    return out


# ---------------------------------------------------------------- canvas
class Frame:
    def __init__(self):
        self.rgba = np.zeros((H, W, 4), np.uint8)
        self.mat = np.zeros((H, W), np.uint8)

    def part(self, m, mat, strands=None, cast=False, light_from=-1):
        """Pinta a máscara m com o material, sombreado em 3 níveis.

        light_from=-1: luz vem da esquerda (padrão da cena);
        +1 inverte (usado só onde a forma está virada).
        """
        t = MATS[mat]
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
            sel = m & (tone == i)
            self.rgba[sel] = t[i]
        self.mat[m] = MAT_ID[mat]

    def px(self, x, y, color, mat=None):
        if 0 <= x < W and 0 <= y < H:
            self.rgba[y, x] = color
            if mat:
                self.mat[y, x] = MAT_ID[mat]

    def pts(self, pts, color):
        for x, y in pts:
            self.px(x, y, color)

    def finish(self):
        a = self.rgba[..., 3] > 0
        # luz lateral dourada nas bordas voltadas à esquerda
        edge = a & ~shift(a, -1, 0)
        for y, x in zip(*np.nonzero(edge)):
            name = ID_MAT.get(self.mat[y, x])
            if name in ("hair", "apron"):
                c = np.array(MATS[name][0][:3], float)
                c = c * 0.65 + np.array(GOLD[:3]) * 0.35
                self.rgba[y, x] = tuple(int(v) for v in c) + (255,)
        # contorno escuro de 1px por fora da silhueta
        out = (shift(a, 1, 0) | shift(a, -1, 0) | shift(a, 0, 1) | shift(a, 0, -1)) & ~a
        self.rgba[out] = OUTLINE
        return Image.fromarray(self.rgba, "RGBA")


def wavy_strands(period=4, amp=1.3, freq=0.42, phase=0.0, slant=0.0):
    """Mechas largas: linha de sombra a cada `period` px e 1px de brilho ao lado."""

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


def lace_dots(f, x0, x1, y, a=C["white"], b=C["lace"]):
    for x in range(x0, x1 + 1):
        f.px(x, y, a if (x % 2 == 0) else b)


def bow(f, cx, cy, sway=0):
    """Laço preto: duas alças 3x3, nó central com luz e duas pontas caindo."""
    f.part(rect(cx - 3, cy - 1, cx - 1, cy + 1), "bow")
    f.part(rect(cx + 1, cy - 1, cx + 3, cy + 1), "bow")
    f.px(cx, cy, MATS["bow"][0], "bow")
    f.px(cx - 2, cy - 1, MATS["bow"][0])
    f.px(cx + 2, cy - 1, MATS["bow"][0])
    f.pts([(cx - 1, cy + 2), (cx - 1, cy + 3), (cx + 1 + sway, cy + 2), (cx + 1 + sway, cy + 3), (cx + 2 + sway, cy + 4)],
          MATS["bow"][1])


# ---------------------------------------------------------------- frente
def draw_front(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d = dy  # respiração: tronco e cabeça sobem 1px
    # cabelo de trás + rabo de cavalo alto (lado direito da tela)
    s = sway
    back = (
        ellipse(32, 18 + d, 11, 11)
        | ellipse(41 + s, 8 + d, 7, 6)
        | poly([(37, 12 + d), (45 + s, 10 + d), (48 + s, 18 + d), (48 + s, 28 + d), (46 + s, 38 + d),
                (42 + s, 44 + d), (39, 40 + d), (38, 30 + d), (39, 20 + d)])
        | poly([(22, 16 + d), (20, 24 + d), (21, 32 + d), (20, 37 + d), (24, 35 + d), (25, 22 + d)])
    )
    # contorno ondulado: bolhas e reentrâncias ao longo da borda externa
    for bx, by in ((49, 15), (49, 23), (49, 31), (47, 39), (43, 45)):
        back |= ellipse(bx + s, by + d, 2.2, 2.6)
    for bx, by in ((51, 19), (51, 27), (50, 35), (19, 28)):
        back &= ~ellipse(bx + s, by + d, 1.5, 1.5)
    back |= ellipse(20, 31 + d, 1.8, 2.4)
    f.part(back, "hair", strands=wavy_strands(phase=0.6))

    # saia (trapézio) com pregas
    # sapatos primeiro: o pé erguido some sob a barra da saia
    f.part(rect(26, 60 - pe_e, 30, 61 - pe_e), "shoe")
    f.part(rect(34, 60 - pe_d, 38, 61 - pe_d), "shoe")
    h = passo // 2  # barra da saia balança com o passo
    skirt = poly([(26, 46), (38, 46), (43 + h, 59), (21 + h, 59)])
    f.part(skirt, "skirt")
    for x, y0 in ((24, 52), (29, 50), (35, 50), (40, 52)):
        for y in range(y0, 59):
            f.px(x + (1 if y > 55 and x > 32 else 0) - (1 if y > 55 and x < 32 else 0), y, MATS["skirt"][2])
    # sapatos

    # braços (finos) e mãos claras
    for side in (-1, 1):
        cx = 32 + side * 9
        a = d - (braco * side if braco * side > 0 else 0)  # mão que vai à frente sobe 1px
        arm = poly([(cx - 1, 37 + d), (cx + 1, 37 + d), (cx + 1 + side, 45 + a), (cx - 1 + side, 45 + a)])
        f.part(arm, "skin")
        f.part(ellipse(cx + side, 46 + a, 1.6, 1.6), "skin")
        lace_dots(f, cx - 1 + side, cx + 1 + side, 43 + a)  # pulseira de renda
        sleeve = ellipse(cx, 34 + d, 4, 4)
        f.part(sleeve, "blouse")
        lace_dots(f, cx - 3, cx + 3, 38 + d)  # babado do punho 3/4

    # blusa (peito) com decote quadrado
    f.part(poly([(25, 31 + d), (39, 31 + d), (38, 38 + d), (26, 38 + d)]), "blouse")
    neck_skin = rect(28, 30 + d, 36, 33 + d)
    f.part(neck_skin, "skin")
    lace_dots(f, 27, 37, 34 + d)

    # espartilho em ampulheta + alças
    corset = poly([(26, 35 + d), (38, 35 + d), (36, 42 + d), (37, 46 + d), (27, 46 + d), (28, 42 + d)])
    f.part(corset, "corset")
    for sx in (26, 37):
        f.part(rect(sx, 31 + d, sx + 1, 35 + d), "corset")
        f.px(sx, 32 + d, C["stitch"])
        f.px(sx + 1, 34 + d, C["stitch"])
    # laço preto pequeno no peito
    f.pts([(31, 35 + d), (33, 35 + d), (32, 36 + d)], MATS["bow"][0])
    f.px(32, 35 + d, MATS["bow"][1])
    # cadarço em X
    for i, y in enumerate(range(37 + d, 45 + d)):
        f.px(31 + (i % 2), y, C["lacing"])
        f.px(33 - (i % 2), y, C["lacing"])

    # cinto de couro, fivela prateada, bolsinha no quadril
    f.part(rect(27, 45 + d, 37, 46 + d), "leather")
    f.pts([(31, 45 + d), (32, 45 + d), (31, 46 + d), (32, 46 + d)], C["silver"])
    f.part(rect(37, 46 + d, 39, 49 + d), "leather")
    f.px(38, 47 + d, C["silver"])

    # avental creme em trapézio, barra bordada
    apron = poly([(28, 47), (36, 47), (39 + h, 57), (25 + h, 57)])
    f.part(apron, "apron")
    for x in range(26 + h, 39 + h):
        f.px(x, 56, C["trim"] if x % 2 else MATS["apron"][2])
    for y in range(49, 56):
        f.px(30, y, MATS["apron"][2])
        f.px(34, y, MATS["apron"][2])

    # cabeça
    face = ellipse(32, 20 + d, 8, 8.5)
    f.part(face, "skin")
    # olhos grandes: cílios, íris, brilho
    for ex in (27, 35):
        f.pts([(ex - 1, 20 + d), (ex, 20 + d), (ex + 1, 20 + d), (ex + 2, 20 + d)], C["lash"])
        for yy in (21, 22, 23):
            f.px(ex, yy + d, C["iris"])
            f.px(ex + 1, yy + d, C["iris"])
        f.px(ex, 21 + d, C["white"])
    # sobrancelhas finas arqueadas
    f.pts([(26, 18 + d), (27, 17 + d), (28, 17 + d), (29, 18 + d)], C["brow"])
    f.pts([(35, 18 + d), (36, 17 + d), (37, 17 + d), (38, 18 + d)], C["brow"])
    # nariz e sorriso
    f.px(32, 24 + d, MATS["skin"][2])
    f.pts([(30, 26 + d), (31, 27 + d), (32, 27 + d), (33, 26 + d)], C["mouth"])
    # bochechas rosadas
    f.pts([(26, 24 + d), (27, 24 + d), (37, 24 + d), (38, 24 + d)], C["blush"])

    # franja lateral em curva, mais o topo do cabelo
    top = ellipse(32, 15 + d, 10, 8) & ~poly([(23, 30 + d), (25, 19 + d), (33, 14 + d), (41, 17 + d), (42, 30 + d)])
    f.part(top, "hair", strands=wavy_strands(period=4, amp=0.0, slant=0.6), cast=True)
    sweep = poly([(23, 13 + d), (34, 10 + d), (40, 13 + d), (33, 15 + d), (27, 18 + d), (24, 21 + d)])
    f.part(sweep, "hair", strands=wavy_strands(period=4, amp=0.0, slant=-0.8), cast=True)
    # mechas laterais grossas emoldurando o rosto e fios soltos
    f.part(poly([(23, 14 + d), (25, 15 + d), (25, 26 + d), (24, 31 + d), (22, 29 + d), (22, 20 + d)]), "hair", cast=True)
    f.part(poly([(40, 14 + d), (42, 15 + d), (42, 22 + d), (41, 30 + d), (39, 26 + d), (40, 20 + d)]), "hair", cast=True)
    for x, y in ((25, 27), (25, 28), (26, 29), (39, 27), (39, 28), (38, 29)):
        f.px(x, y + d, MATS["hair"][2], "hair")

    # laço preto na base do rabo, com pontas caindo
    bow(f, 39 + s, 8 + d, s)

    # gargantilha com pingente azul
    for x in range(29, 36):
        f.px(x, 30 + d, MATS["bow"][1])
    f.px(32, 31 + d, C["gem"])
    f.px(32, 32 + d, C["gem_hi"])
    # brincos pendentes
    for ex in (24, 40):
        f.px(ex, 24 + d, C["silver"])
        f.px(ex, 25 + d, C["gem"])
        f.px(ex, 26 + d, C["gem_hi"])
    return f.finish()


# ---------------------------------------------------------------- costas
def draw_back(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d = dy
    # saia e sapatos
    f.part(rect(26, 60 - pe_d, 30, 61 - pe_d), "shoe")
    f.part(rect(34, 60 - pe_e, 38, 61 - pe_e), "shoe")
    h = -(passo // 2)
    f.part(poly([(26, 46), (38, 46), (43 + h, 59), (21 + h, 59)]), "skirt")
    for x in (25, 30, 34, 39):
        for y in range(50, 59):
            f.px(x, y, MATS["skirt"][2])
    # braços e mangas
    for side in (-1, 1):
        cx = 32 + side * 9
        a = d - (braco * -side if braco * -side > 0 else 0)
        f.part(poly([(cx - 1, 37 + d), (cx + 1, 37 + d), (cx + 1 + side, 45 + a), (cx - 1 + side, 45 + a)]), "skin")
        f.part(ellipse(cx + side, 46 + a, 1.6, 1.6), "skin")
        lace_dots(f, cx - 1 + side, cx + 1 + side, 43 + a)
        f.part(ellipse(cx, 34 + d, 4, 4), "blouse")
        lace_dots(f, cx - 3, cx + 3, 38 + d)
    # blusa nos ombros e espartilho visto de trás
    f.part(poly([(25, 31 + d), (39, 31 + d), (38, 38 + d), (26, 38 + d)]), "blouse")
    f.part(poly([(26, 35 + d), (38, 35 + d), (36, 42 + d), (37, 46 + d), (27, 46 + d), (28, 42 + d)]), "corset")
    for sx in (26, 37):
        f.part(rect(sx, 31 + d, sx + 1, 35 + d), "corset")
    for i, y in enumerate(range(38 + d, 45 + d)):
        f.px(31 + (i % 2), y, C["lacing"])
        f.px(33 - (i % 2), y, C["lacing"])
    f.part(rect(27, 45 + d, 37, 46 + d), "leather")
    # laço do avental amarrado atrás (4x3) com pontas
    f.part(rect(30, 44 + d, 34, 46 + d), "apron")
    f.px(32, 45 + d, MATS["apron"][2])
    f.pts([(30, 47 + d), (30, 48 + d), (34, 47 + d), (34, 48 + d), (35, 49 + d), (29, 49 + d)], MATS["apron"][2])
    # cabeça toda coberta de cabelo
    f.part(ellipse(32, 19 + d, 10, 10), "hair", strands=wavy_strands(amp=0.6, phase=1.0))
    # rabo de cavalo alto: sai do topo, cai em ondas até a cintura (pendendo à direita)
    tail = (
        ellipse(32, 9 + d, 7, 5)
        | poly([(27, 11 + d), (37, 11 + d), (40 + sway, 22 + d), (39 + sway, 34 + d),
                (37 + sway, 41 + d), (33 + sway, 42 + d), (30, 34 + d), (28, 22 + d)])
    )
    f.part(tail, "hair", strands=wavy_strands(phase=0.2), cast=True)
    # laço no topo
    bow(f, 32, 8 + d, sway)
    return f.finish()


# ---------------------------------------------------------------- perfil (virada para a direita)
def draw_profile_right(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d = dy
    # rabo de cavalo alto atrás, caindo pelas costas
    tail = (
        ellipse(25, 9 + d, 7, 5)
        | poly([(22, 7 + d), (29, 9 + d), (28, 20 + d), (27, 32 + d), (25 - sway, 43 + d),
                (20 - sway, 44 + d), (18 - sway, 34 + d), (17, 20 + d)])
    )
    f.part(tail, "hair", strands=wavy_strands(phase=1.4))
    # saia triangular vista de lado
    # pés: um à frente e outro atrás, conforme o passo
    f.part(rect(29 - passo, 60 - pe_d, 33 - passo, 61 - pe_d), "shoe")
    f.part(rect(32 + passo, 60 - pe_e, 36 + passo, 61 - pe_e), "shoe")
    f.px(37 + passo, 61 - pe_e, MATS["shoe"][1], "shoe")
    h = abs(passo) // 2  # saia abre um pouco no meio do passo
    f.part(poly([(28, 46), (37, 46), (42 + h, 59), (23 - h, 59)]), "skirt")
    for x, y0 in ((27, 51), (33, 50), (38, 52)):
        for y in range(y0, 59):
            f.px(x, y, MATS["skirt"][2])
    # tronco de lado: blusa, espartilho com busto
    f.part(poly([(28, 31 + d), (35, 31 + d), (38, 34 + d), (37, 38 + d), (28, 38 + d)]), "blouse")
    f.part(rect(32, 30 + d, 34, 33 + d), "skin")
    lace_dots(f, 34, 37, 34 + d)
    corset = poly([(28, 35 + d), (37, 35 + d), (38, 37 + d), (35, 42 + d), (36, 46 + d), (28, 46 + d), (29, 41 + d)])
    f.part(corset, "corset")
    f.part(rect(30, 31 + d, 31, 35 + d), "corset")
    f.px(30, 32 + d, C["stitch"])
    for y in range(37 + d, 45 + d, 2):
        f.px(36 if y < 42 + d else 35, y, C["lacing"])
    f.part(rect(28, 45 + d, 36, 46 + d), "leather")
    f.pts([(35, 45 + d), (36, 45 + d)], C["silver"])
    f.part(rect(27, 46 + d, 29, 49 + d), "leather")
    # avental de lado: aba à frente
    f.part(poly([(34, 47), (37, 47), (42, 57), (37, 57)]), "apron")
    for x in range(37, 42):
        f.px(x, 56, C["trim"] if x % 2 else MATS["apron"][2])
    # laço do avental nas costas
    f.part(rect(26, 44 + d, 28, 46 + d), "apron")
    # braço à frente, manga bufante
    b = braco
    f.part(poly([(32, 37 + d), (34, 37 + d), (36 + b, 45 + d), (34 + b, 45 + d)]), "skin")
    f.part(ellipse(35 + b, 46 + d, 1.6, 1.6), "skin")
    lace_dots(f, 34 + b, 36 + b, 43 + d)
    f.part(ellipse(32, 34 + d, 4, 4), "blouse")
    lace_dots(f, 29, 35, 38 + d)
    # cabeça de lado: crânio atrás + perfil do rosto definido linha a linha.
    # Borda da frente (x mais à direita) por linha: testa reta e arredondada,
    # nariz 1px para fora, lábios recolhidos 1px atrás do nariz, queixo pequeno
    # e mandíbula subindo para a orelha.
    edge = {12: 36, 13: 37, 14: 38, 15: 39, 16: 40, 17: 40, 18: 40, 19: 40, 20: 40, 21: 40,
            22: 41, 23: 40, 24: 40, 25: 40, 26: 39, 27: 38, 28: 36}
    face = np.zeros((H, W), bool)
    for y, xe in edge.items():
        face[y + d, 30 : xe + 1] = True
    head = (ellipse(31, 20 + d, 8, 8.5) & (np.arange(W)[None, :] <= 36)) | face
    f.part(head, "skin")
    f.px(40, 23 + d, MATS["skin"][2])  # sombra sob o nariz
    # olho único
    f.pts([(36, 20 + d), (37, 20 + d), (38, 20 + d)], C["lash"])
    for yy in (21, 22, 23):
        f.px(36, yy + d, C["iris"])
        f.px(37, yy + d, C["iris"])
    f.px(37, 21 + d, C["white"])
    f.pts([(35, 17 + d), (36, 17 + d), (37, 17 + d), (38, 18 + d)], C["brow"])
    # boca de perfil: 1px colado na borda, 2px abaixo do nariz,
    # e a covinha do sorriso 1px acima, do lado de dentro
    f.px(40, 24 + d, C["mouth"])
    f.px(39, 23 + d, C["mouth"])
    f.pts([(35, 24 + d), (36, 24 + d)], C["blush"])
    # cabelo cobrindo a nuca e o alto da cabeça, franja à frente
    hair = (ellipse(30, 17 + d, 10, 9) | poly([(21, 18 + d), (27, 18 + d), (29, 30 + d), (24, 33 + d), (21, 28 + d)])) \
        & ~poly([(31, 19 + d), (35, 15 + d), (42, 17 + d), (42, 31 + d), (31, 31 + d)])
    f.part(hair, "hair", strands=wavy_strands(amp=0.8, phase=0.3, slant=-0.3), cast=True)
    f.part(poly([(33, 11 + d), (40, 13 + d), (41, 18 + d), (38, 16 + d), (34, 17 + d)]), "hair",
           strands=wavy_strands(amp=0.0, slant=-0.8), cast=True)
    # orelha com brinco pendente
    f.part(ellipse(31, 22 + d, 1.4, 2), "skin")
    f.px(31, 25 + d, C["silver"])
    f.px(31, 26 + d, C["gem"])
    f.px(31, 27 + d, C["gem_hi"])
    # fio solto na bochecha
    f.pts([(34, 19 + d), (34, 20 + d), (33, 21 + d)], MATS["hair"][2])
    # gargantilha
    for x in range(32, 36):
        f.px(x, 30 + d, MATS["bow"][1])
    f.px(35, 31 + d, C["gem"])
    # laço na base do rabo
    bow(f, 28, 9 + d, -sway)
    return f.finish()


def sheet(dy=0, sway=0):
    right = draw_profile_right(dy, sway)
    left = right.transpose(Image.FLIP_LEFT_RIGHT)
    frames = [draw_back(dy, sway), left, draw_front(dy, sway), right]
    out = Image.new("RGBA", (W * 4, H), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        out.paste(fr, (i * W, 0))
    return out


# ---------------------------------------------------------------- folhas do jogo (formato LPC)
def params(anim, i):
    """Mesmo ciclo da Bigodes: walk com 9 quadros (0 = parado), idle com 2."""
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
    s = sheet()
    s.save(dest / "selena_sheet.png")
    s.resize((s.width * 4, s.height * 4), Image.NEAREST).save(dest / "selena_sheet_4x.png")
    # respiração opcional: segunda linha com o tronco 1px acima e o rabo balançando
    breath = Image.new("RGBA", (W * 4, H * 2), (0, 0, 0, 0))
    breath.paste(s, (0, 0))
    breath.paste(sheet(dy=-1, sway=1), (0, H))
    breath.save(dest / "selena_breath.png")
    breath.resize((breath.width * 4, breath.height * 4), Image.NEAREST).save(dest / "selena_breath_4x.png")
    walk, idle = game_sheet("walk", 9), game_sheet("idle", 2)
    walk.save(dest / "walk.png")
    idle.save(dest / "idle.png")
    colors = {tuple(c) for c in np.array(s).reshape(-1, 4) if c[3]}
    print(f"cores: {len(colors)}")


if __name__ == "__main__":
    main()
