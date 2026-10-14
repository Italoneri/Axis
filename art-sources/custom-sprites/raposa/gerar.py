"""Raposa (garota kitsune de cabelo rosa-coral) desenhada pixel a pixel.

Gera uma sheet de 4 frames 64x64 na ordem da preview do LPC:
costas, perfil virado para a esquerda, frente, perfil virado para a direita.
O perfil é desenhado uma vez (virado para a direita) e espelhado.

Uso: python3 draw_raposa.py [pasta_de_saida]
Saída: raposa_sheet.png (1x) e raposa_sheet_4x.png (nearest neighbor),
raposa_breath.png / raposa_breath_4x.png (2 linhas: respiração) e as folhas
do jogo walk.png (9 quadros) e idle.png (2 quadros), 832x256,
linhas norte, oeste, sul, leste.
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
    "hair": ["#F58CA0", "#E0607A", "#B83E5C", "#8A2848"],
    "tail": ["#F58CA0", "#E0607A", "#B83E5C", "#8A2848"],
    "skin": ["#FDEAE0", "#F6DCCF", "#DDAE9F", "#DDAE9F"],
    "dress": ["#FFFFFF", "#F4F2F6", "#CFCBDA", "#A29DB5"],
    "ear": ["#7A2A3C", "#7A2A3C", "#4A1A2A", "#4A1A2A"],
    "fluff": ["#F4EDE6", "#F4EDE6", "#CFC4C0", "#CFC4C0"],
    "shoe": ["#FFFFFF", "#F4F2F6", "#CFCBDA", "#A29DB5"],
    "rose": ["#F4F0F0", "#F4F0F0", "#BDB6C0", "#BDB6C0"],
    "book": ["#F4EEDC", "#E4D8C0", "#E4D8C0", "#E4D8C0"],
}
MATS = {k: [hx(c) for c in v] for k, v in MATS.items()}
MAT_ID = {k: i + 1 for i, k in enumerate(MATS)}
ID_MAT = {v: k for k, v in MAT_ID.items()}

OUTLINE = hx("#2A1420")
C = {
    "iris": hx("#C23A52"),
    "white": hx("#FFFFFF"),
    "lid": hx("#2A1420"),
    "brow": hx("#8A2848"),
    "mouth": hx("#B8665E"),
    "blush": hx("#F0A8A8"),
    "lacing": hx("#E5A3A8"),
    "ribbon": hx("#1E1A24"),
    "page": hx("#F4EEDC"),
    "cover": hx("#E4D8C0"),
    "ear_top": hx("#4A1A2A"),
    "ear_base": hx("#7A2A3C"),
    "spine": hx("#A08868"),
    "tail_tip": hx("#F7B0C0"),
    "bow": hx("#F4F2F6"),
    "bow_shade": hx("#CFCBDA"),
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


def line(pts, width=1):
    return mask_from(lambda d: d.line(pts, fill=1, width=width))


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
        """Pinta a máscara m com o material, sombreado em 3 níveis + luz.

        light_from=-1: luz vem da esquerda e de cima.
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
        # contorno escuro de 1px por fora da silhueta
        out = (shift(a, 1, 0) | shift(a, -1, 0) | shift(a, 0, 1) | shift(a, 0, -1)) & ~a
        self.rgba[out] = OUTLINE
        return Image.fromarray(self.rgba, "RGBA")


def wavy_strands(period=4, amp=1.3, freq=0.42, phase=0.0, slant=0.0):
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


def hair_locks(cx, slant_l=0.7, slant_r=-0.7, amp=0.8, phase=0.0):
    """Mechas largas (3 px de base, 1 px de sombra, 1 px de brilho) que abrem
    para os dois lados a partir de cx, em vez de listras verticais regulares."""

    def fn(tone, m):
        ys, xs = np.mgrid[0:H, 0:W]
        slant = np.where(xs < cx, slant_l, slant_r)
        off = np.round(ys * slant + amp * np.sin(ys * 0.5 + xs * 0.3 + phase)).astype(int)
        k = (xs + off) % 5
        inner = m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1)
        tone = tone.copy()
        tone[inner & (k == 0) & (tone < 3)] = 2
        tone[inner & (k == 1) & (tone == 1)] = 0
        return tone

    return fn


def fox_tail(f, spine, tufts):
    """Rabo de raposa fofo ao longo de uma linha central (x, y, raio).

    Sombreado em mechas curvas que seguem o rabo (não em faixas), luz do lado
    de cima, ponta mais clara e tufos pontudos de tamanhos diferentes no contorno.
    tufts: (t, lado, comprimento), t de 0 (quadril) a 1 (ponta)."""
    pts = []
    for (x0, y0, r0), (x1, y1, r1) in zip(spine, spine[1:]):
        for t in np.linspace(0, 1, 12, endpoint=False):
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t))
    pts.append(spine[-1])
    P = np.array(pts, float)
    n = len(P)
    tang = np.gradient(P[:, :2], axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    norm = np.stack([-tang[:, 1], tang[:, 0]], axis=1)

    m = np.zeros((H, W), bool)
    for x, y, r in P:
        m |= ellipse(x, y, r, r)
    for t, side, ln in tufts:
        i = min(n - 1, int(t * (n - 1)))
        x, y, r = P[i]
        nx, ny = norm[i] * side
        tx, ty = tang[i]
        bx, by = x + nx * (r - 0.5), y + ny * (r - 0.5)
        tip = (bx + nx * ln * 0.7 + tx * ln * 0.7, by + ny * ln * 0.7 + ty * ln * 0.7)
        m |= poly([(bx - tx * 1.5, by - ty * 1.5), tip, (bx + tx * 1.5, by + ty * 1.5)])
    # tufo da ponta: duas pontinhas tortas
    x, y, r = P[-1]
    tx, ty = tang[-1]
    nx, ny = norm[-1]
    m |= poly([(x - nx, y - ny), (x + tx * 3 + nx, y + ty * 3 + ny), (x + nx, y + ny)])
    m |= poly([(x, y), (x + tx * 2 - nx * 2, y + ty * 2 - ny * 2), (x - nx, y - ny)])

    f.part(m, "tail")
    # para cada pixel: amostra mais próxima (t) e posição através do rabo (u)
    ys, xs = np.nonzero(m)
    dx = xs[:, None] - P[None, :, 0]
    dy = ys[:, None] - P[None, :, 1]
    k = np.argmin(dx * dx + dy * dy, axis=1)
    t = k / (n - 1)
    r = np.maximum(P[k, 2], 1)
    u = (dx[np.arange(len(k)), k] * norm[k, 0] + dy[np.arange(len(k)), k] * norm[k, 1]) / r
    inner = (m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1) & shift(m, 0, -1))[ys, xs]
    sh, lt = MATS["tail"][2], MATS["tail"][0]
    # luz no lado de cima (u < 0 aponta para cima/esquerda nas curvas usadas)
    up = norm[k, 1] < 0
    side_u = np.where(up, u, -u)
    for (lo, hi, o) in ((0.10, 0.62, 0.15), (0.28, 0.84, -0.30), (0.05, 0.45, 0.55), (0.45, 0.78, 0.45)):
        sel = inner & (t > lo) & (t < hi) & (np.abs(side_u - o) * r < 0.5)
        f.rgba[ys[sel], xs[sel]] = sh
    sel = inner & (t > 0.15) & (t < 0.8) & (np.abs(side_u + 0.7) * r < 0.5)
    f.rgba[ys[sel], xs[sel]] = lt
    # ponta mais clara (3-4 px)
    tipm = (t > 0.86) & (m[ys, xs])
    f.rgba[ys[tipm], xs[tipm]] = C["tail_tip"]


def lock(spine, tips=()):
    """Mecha solta: círculos ao longo da linha central (x, y, raio) + pontas."""
    m = np.zeros((H, W), bool)
    for (x0, y0, r0), (x1, y1, r1) in zip(spine, spine[1:]):
        for t in np.linspace(0, 1, 6):
            m |= ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t)
    for a, b, c in tips:
        m |= poly([a, b, c])
    return m


def lace(f, x0, x1, y):
    """Barra de renda: pixels alternando branco e cinza claro."""
    for x in range(x0, x1 + 1):
        f.px(x, y, MATS["dress"][0] if x % 2 == 0 else MATS["dress"][2], "dress")


# ---------------------------------------------------------------- peças
def fox_ear(f, base_l, base_r, tip, inner=True, far=False):
    """Orelha triangular: externo vinho (topo #4A1A2A, base #7A2A3C) e tufos cremes."""
    m = poly([base_l, tip, base_r])
    ty = tip[1]
    by = max(base_l[1], base_r[1])
    for y, x in zip(*np.nonzero(m)):
        top = (y - ty) < (by - ty) * 0.45
        c = C["ear_top"] if (top or far) else C["ear_base"]
        f.px(x, y, c, "ear")
    if not inner:
        return
    # interior: triângulo menor com borda em zigue-zague (tufos)
    cx = (base_l[0] + base_r[0]) / 2
    inn = poly([(base_l[0] + (cx - base_l[0]) * 0.45, base_l[1] - 1),
                (tip[0] + (cx - tip[0]) * 0.3, tip[1] + 4),
                (base_r[0] - (base_r[0] - cx) * 0.45, base_r[1] - 1)])
    for y, x in zip(*np.nonzero(inn)):
        zig = (x + y) % 2 == 0 and not inn[min(y + 1, H - 1), x]
        f.px(x, y, MATS["fluff"][2] if zig or (y % 3 == 0 and x % 2) else MATS["fluff"][1], "fluff")
    # tufos saindo da base (3-4 px em zigue-zague)
    bx = int(round(cx))
    for i, (dx, dy) in enumerate(((-2, 0), (-1, -1), (0, 0), (1, -1), (2, 0))):
        f.px(bx + dx, base_l[1] - 1 + dy, MATS["fluff"][i % 2 * 2 if i % 2 else 1], "fluff")


def rose(f, x, y, ribbon_sway=0):
    """Rosa branca 4x4 com fita preta de 1px caindo 4px."""
    m = rect(x, y, x + 3, y + 3)
    f.part(m, "rose")
    f.rgba[m] = MATS["rose"][1]
    # pétalas em espiral
    f.pts([(x + 1, y + 1), (x + 2, y + 2), (x + 3, y + 2), (x, y + 2), (x + 2, y)], MATS["rose"][2])
    for i in range(4):
        f.px(x + 1 + (ribbon_sway if i >= 2 else 0), y + 4 + i, C["ribbon"])
    f.px(x + 2, y + 4, C["ribbon"])


def book(f, x, y):
    """Livro aberto 5x4: capa clara, páginas, lombada no meio."""
    f.part(rect(x, y, x + 4, y + 3), "book")
    for xx in (x + 1, x + 3):
        for yy in (y, y + 1, y + 2):
            f.px(xx, yy, C["page"])
    for yy in range(y, y + 4):
        f.px(x + 2, yy, C["spine"])


def bracelet(f, x0, x1, y):
    for x in range(x0, x1 + 1):
        f.px(x, y, C["white"] if x % 2 == 0 else MATS["dress"][2], "dress")


def sandal(f, x, y, toes=0):
    """Sandália de plataforma: tira no tornozelo, sola, salto grosso de 2px.
    x é a borda esquerda do pé (5 px); y é a linha da tira do tornozelo."""
    f.px(x + 1, y, MATS["shoe"][1], "shoe")
    f.px(x + 2, y, MATS["shoe"][2], "shoe")
    f.px(x + 3, y, MATS["shoe"][1], "shoe")
    f.part(rect(x + 1, y + 1, x + 3, y + 1), "skin")
    f.part(rect(x, y + 2, x + 4 + toes, y + 2), "shoe")
    f.part(rect(x + 1, y + 3, x + 3, y + 4), "shoe")
    f.px(x + 1, y + 2, MATS["shoe"][0])


def legs_front(f, x, top, foot_y, shade_right=True):
    leg = rect(x, top, x + 2, foot_y)
    f.part(leg, "skin")
    # sombra atrás do joelho
    f.px(x + (2 if shade_right else 0), top + 3, MATS["skin"][2], "skin")


# ---------------------------------------------------------------- frente
def draw_front(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d = dy
    s = sway

    # rabo atrás do vestido: sai do quadril, desce, sobe em S e cai para trás
    fox_tail(f, [(35, 46, 2.5), (40, 49, 4), (45, 48 + s, 4.8), (48, 43 + s, 4.8), (48 + s, 38, 4),
                 (46 + s, 34 - s, 2.6), (43 + s, 32 - s, 1.2)],
             tufts=[(0.30, 1, 4), (0.5, -1, 2.5), (0.62, 1, 5), (0.78, -1, 3.5)])

    # orelhas atrás do cabelo: altas, separadas e inclinadas para fora
    e = s if s > 0 else 0
    fox_ear(f, (21, 15 + d), (30, 10 + d), (17 - e, 1 + d))
    fox_ear(f, (34, 10 + d), (43, 15 + d), (47 + e, 1 + d))

    # cabelo de trás: curto, na altura do queixo
    back = ellipse(32, 19 + d, 10.5, 10)
    back |= poly([(22, 20 + d), (42, 20 + d), (42, 26 + d), (22, 26 + d)])
    for tx, ty in ((24, 29), (28, 28), (37, 28), (41, 29)):  # pontas repicadas no queixo
        back |= poly([(tx - 2, 25 + d), (tx, ty + d), (tx + 2, 25 + d)])
    f.part(back, "hair", strands=hair_locks(32, phase=0.4))

    # rabo de cavalo lateral à esquerda de quem olha, em ondas até o ombro
    pony = lock([(21, 16 + d, 3), (18 - s, 20 + d, 3), (17 - s, 25 + d, 2.6), (18 - s, 29 + d, 2.2), (16 - s, 33 + d, 1.4)],
                tips=[((14 - s, 32 + d), (15 - s, 37 + d), (17 - s, 33 + d)),
                      ((17 - s, 32 + d), (19 - s, 36 + d), (20 - s, 31 + d)),
                      ((15 - s, 26 + d), (13 - s, 30 + d), (16 - s, 29 + d))])
    f.part(pony, "hair", strands=hair_locks(64, slant_l=-0.3, amp=1.2, phase=1.2))

    # pernas nuas, sandálias de plataforma
    legs_front(f, 28, 52, 57 - pe_e, shade_right=False)
    legs_front(f, 34, 52, 57 - pe_d, shade_right=True)
    sandal(f, 27, 57 - pe_e)
    sandal(f, 33, 57 - pe_d)

    # braço esquerdo do personagem (direita de quem olha): relaxado, punho de renda
    a = d - (1 if braco > 0 else 0)
    f.part(poly([(38, 33 + d), (40, 33 + d), (41, 42 + a), (39, 42 + a)]), "skin")
    f.part(ellipse(40, 43 + a, 1.4, 1.6), "skin")
    bracelet(f, 39, 41, 41 + a)

    # ombros nus e pescoço
    f.part(ellipse(32, 34 + d, 8, 3), "skin")
    f.part(rect(30, 27 + d, 34, 32 + d), "skin")

    # vestido frente-única: corpete
    bodice = poly([(28, 33 + d), (36, 33 + d), (37, 37 + d), (36, 43), (28, 43), (27, 37 + d)])
    f.part(bodice, "dress")
    # tirinhas do pescoço e laço pequeno
    f.pts([(29, 32 + d), (30, 31 + d), (31, 30 + d), (35, 32 + d), (34, 31 + d), (33, 30 + d)], MATS["dress"][1])
    f.pts([(31, 29 + d), (33, 29 + d), (32, 30 + d)], MATS["dress"][0])
    f.px(32, 29 + d, MATS["dress"][2])
    f.pts([(31, 31 + d), (33, 31 + d)], MATS["dress"][2])
    # costura do decote e cintura marcada
    for x in range(28, 37):
        f.px(x, 42, MATS["dress"][2])
    # saia curta rodada em sino, acima do joelho
    h = passo // 2
    skirt = ellipse(32, 51, 10, 8) & rect(0, 43, 63, 52)
    skirt |= poly([(28, 43), (36, 43), (41, 48), (23, 48)])
    skirt = np.roll(skirt, h, axis=1)
    f.part(skirt, "dress")
    # pregas e florzinhas de 1px
    for x, y in ((27, 48), (31, 47), (35, 49), (38, 47), (29, 51), (34, 51), (25, 51), (39, 51)):
        f.px(x + h, y, MATS["dress"][2])
    for x in (24, 28, 32, 36, 40):
        for y in range(47, 52):
            if (x + y) % 3 == 0:
                f.px(x + h, y, MATS["dress"][3])
    lace(f, 23 + h, 41 + h, 52)
    for x in range(23 + h, 42 + h, 2):
        f.px(x, 53, MATS["dress"][2], "dress")

    # cabeça
    face = ellipse(32, 20 + d, 8, 8.5)
    f.part(face, "skin")
    # olhos estreitos, inclinados, pálpebra escura
    f.pts([(26, 20 + d), (27, 20 + d), (28, 20 + d), (29, 21 + d)], C["lid"])
    f.pts([(35, 21 + d), (36, 20 + d), (37, 20 + d), (38, 20 + d)], C["lid"])
    for ex in (27, 36):
        for yy in (21, 22):
            f.px(ex, yy + d, C["iris"])
            f.px(ex + 1, yy + d, C["iris"])
        f.px(ex, 21 + d, C["white"])
    f.px(26, 21 + d, MATS["skin"][2])
    f.px(38, 21 + d, MATS["skin"][2])
    # nariz, boca emburrada e rubor
    f.px(32, 24 + d, MATS["skin"][2])
    f.pts([(31, 26 + d), (32, 26 + d)], C["mouth"])
    f.pts([(26, 24 + d), (27, 24 + d), (37, 24 + d), (38, 24 + d)], C["blush"])

    # topo do cabelo e franja de lado cobrindo parte da testa
    top = ellipse(32, 15 + d, 10.5, 7.5) & ~rect(0, 17 + d, 63, 63)
    f.part(top, "hair", strands=hair_locks(30, slant_l=0.9, slant_r=-0.5, amp=0.0), cast=True)
    # franja de lado: cobre parte da testa e para acima dos olhos
    fringe = poly([(22, 13 + d), (36, 10 + d), (42, 14 + d), (40, 16 + d), (38, 18 + d), (36, 16 + d),
                   (33, 18 + d), (31, 15 + d), (28, 18 + d), (26, 17 + d), (24, 19 + d), (22, 18 + d)])
    f.part(fringe, "hair", strands=hair_locks(64, slant_l=-1.0, amp=0.0), cast=True)
    # mechas pontudas nas laterais: curtas, na altura do queixo
    f.part(poly([(22, 15 + d), (25, 16 + d), (26, 22 + d), (25, 27 + d), (24, 25 + d), (22, 28 + d), (21, 22 + d)]),
           "hair", strands=hair_locks(64, slant_l=0.3, amp=0.0), cast=True)
    f.part(poly([(39, 16 + d), (42, 15 + d), (43, 21 + d), (43, 25 + d), (42, 24 + d), (41, 28 + d), (40, 25 + d),
                 (39, 27 + d), (38, 22 + d)]),
           "hair", strands=hair_locks(0, slant_r=-0.3, amp=0.0), cast=True)
    # sobrancelhas franzidas, descendo em direção ao nariz
    f.pts([(25, 17 + d), (26, 17 + d), (27, 18 + d), (28, 18 + d), (29, 19 + d)], C["brow"])
    f.pts([(35, 19 + d), (36, 18 + d), (37, 18 + d), (38, 17 + d), (39, 17 + d)], C["brow"])

    # braço direito do personagem (esquerda de quem olha): antebraço dobrado,
    # livro aberto na altura do peito e a mão por baixo
    f.part(poly([(24, 33 + d), (26, 33 + d), (25, 39 + d), (23, 39 + d)]), "skin")  # braço
    f.part(poly([(23, 38 + d), (25, 39 + d), (28, 35 + d), (27, 34 + d)]), "skin")  # antebraço
    book(f, 24, 30 + d)
    f.part(ellipse(27, 34 + d, 1.2, 1.0), "skin")  # mão sob o livro

    # rosa branca na base do rabo de cavalo, com fita preta
    rose(f, 19 - s, 13 + d, s)
    return f.finish()


# ---------------------------------------------------------------- costas
def draw_back(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d = dy
    s = sway

    # orelhas: só o lado externo escuro
    e = s if s > 0 else 0
    # mais próximas do topo, inclinadas para fora só 1 a 2 px
    fox_ear(f, (23, 13 + d), (30, 9 + d), (25 - e, 1 + d), inner=False)
    fox_ear(f, (34, 9 + d), (41, 13 + d), (39 + e, 1 + d), inner=False)

    # pernas e sandálias
    legs_front(f, 28, 52, 57 - pe_d, shade_right=False)
    legs_front(f, 34, 52, 57 - pe_e, shade_right=True)
    for lx in (28, 36):
        f.px(lx + (0 if lx == 28 else 0), 55, MATS["skin"][2])
    sandal(f, 27, 57 - pe_d)
    sandal(f, 33, 57 - pe_e)

    # braços relaxados
    for side in (-1, 1):
        cx = 32 + side * 8
        a = d - (1 if braco * -side > 0 else 0)
        f.part(poly([(cx - 1, 33 + d), (cx + 1, 33 + d), (cx + 1 + side, 42 + a), (cx - 1 + side, 42 + a)]), "skin")
        f.part(ellipse(cx + side, 43 + a, 1.4, 1.6), "skin")
    bracelet(f, 22, 24, 40 + d)
    # ombros nus
    f.part(ellipse(32, 34 + d, 8, 3), "skin")
    f.part(rect(30, 27 + d, 34, 32 + d), "skin")

    # vestido: costas abertas em V, laterais do corpete
    bodice = poly([(27, 34 + d), (37, 34 + d), (37, 37 + d), (36, 43), (28, 43), (27, 37 + d)])
    f.part(bodice, "dress")
    open_back = poly([(28, 33 + d), (36, 33 + d), (35, 42), (29, 42)])
    f.part(open_back, "skin")
    # cadarço cruzado em X descendo pelas costas (8 px de altura)
    for i, y in enumerate(range(34 + d, 42 + d)):
        t = (0, 1, 2, 3, 2, 1)[i % 6]
        f.px(29 + t, y, C["lacing"])
        f.px(35 - t, y, C["lacing"])
    # saia
    h = -(passo // 2)
    skirt = ellipse(32, 51, 10, 8) & rect(0, 43, 63, 52)
    skirt |= poly([(28, 43), (36, 43), (41, 48), (23, 48)])
    skirt = np.roll(skirt, h, axis=1)
    f.part(skirt, "dress")
    for x, y in ((26, 48), (30, 50), (36, 48), (39, 50), (33, 47)):
        f.px(x + h, y, MATS["dress"][2])
    lace(f, 23 + h, 41 + h, 52)
    for x in range(23 + h, 42 + h, 2):
        f.px(x, 53, MATS["dress"][2], "dress")
    # rabo nascendo abaixo do laço, descendo para a esquerda e subindo em S
    fox_tail(f, [(32, 46, 2.5), (28, 50, 4), (22, 51 + s, 4.8), (17, 47 + s, 4.8), (15 - s, 41, 4),
                 (16 - s, 36 - s, 2.6), (19 - s, 34 - s, 1.2)],
             tufts=[(0.35, -1, 4), (0.55, 1, 2.5), (0.66, -1, 5), (0.8, 1, 3.5)])

    # laço grande na cintura (6x4) com duas fitas de 1px até a barra
    bw, bs = C["bow"], C["bow_shade"]
    bowm = np.zeros((H, W), bool)
    for x in range(29, 35):
        for y in range(41, 45):
            if x in (29, 30, 33, 34) or y in (42, 43):
                bowm[y, x] = True
    ribs = []
    for y in range(45, 53):
        ribs += [(30 - (y - 45) // 4, y), (33 + (y - 45) // 4 + (s if y > 49 else 0), y)]
    for x, y in ribs:
        bowm[y, x] = True
    # contorno lilás do laço para ele não sumir no vestido branco
    ring = (shift(bowm, 1, 0) | shift(bowm, -1, 0) | shift(bowm, 0, 1) | shift(bowm, 0, -1)) & ~bowm
    ring &= (f.rgba[..., 3] > 0) & ~rect(0, 53, 63, 63)
    f.rgba[ring] = MATS["dress"][3]
    f.rgba[bowm] = bw
    f.pts([(31, 42), (32, 43), (30, 43), (33, 43), (29, 44), (34, 44)], bs)
    for x, y in ribs[1::2] + ribs[::2]:
        if y % 2:
            f.px(x, y, bs)

    # cabeça coberta de cabelo curto, pontas repicadas na altura do queixo
    hair = ellipse(32, 19 + d, 10.5, 10)
    for tx in (23, 27, 31, 35, 39):
        hair |= poly([(tx - 2, 26 + d), (tx, 31 + d), (tx + 2, 26 + d)])
    f.part(hair, "hair", strands=hair_locks(32, slant_l=-0.5, slant_r=0.5, phase=1.0))
    # tirinhas da frente-única atadas em laço de 3 px na nuca
    f.pts([(31, 31 + d), (33, 31 + d)], C["bow"])
    f.px(32, 31 + d, C["bow_shade"])
    f.pts([(31, 32 + d), (33, 32 + d)], C["bow_shade"])

    # rabo de cavalo lateral (à direita de quem olha, nas costas)
    pony = lock([(43, 16 + d, 3), (46 + s, 20 + d, 3), (47 + s, 25 + d, 2.6), (46 + s, 29 + d, 2.2), (48 + s, 33 + d, 1.4)],
                tips=[((50 + s, 32 + d), (49 + s, 37 + d), (47 + s, 33 + d)),
                      ((47 + s, 32 + d), (45 + s, 36 + d), (44 + s, 31 + d)),
                      ((49 + s, 26 + d), (51 + s, 30 + d), (48 + s, 29 + d))])
    f.part(pony, "hair", strands=hair_locks(0, slant_r=0.3, amp=1.2, phase=0.2))
    rose(f, 41 + s, 13 + d, s)
    return f.finish()


# ---------------------------------------------------------------- perfil (virada para a direita)
def draw_profile_right(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d = dy
    s = sway

    # orelha de trás, quase escondida pela cabeça
    fox_ear(f, (24, 14 + d), (29, 11 + d), (21 - max(s, 0), 3 + d), inner=False, far=True)

    # rabo saindo do quadril traseiro, para trás e subindo em S
    fox_tail(f, [(28, 45, 2.5), (23, 49, 4), (17, 49 + s, 4.8), (13, 45 + s, 4.8), (12 - s, 39, 4),
                 (14 - s, 35 - s, 2.6), (17 - s, 33 - s, 1.2)],
             tufts=[(0.32, 1, 4), (0.5, -1, 2.5), (0.64, 1, 5), (0.8, -1, 3.5)])

    # rabo de cavalo pendendo atrás da cabeça, até o ombro
    pony = lock([(25, 16 + d, 3), (22 - s, 20 + d, 3), (21 - s, 25 + d, 2.4), (22 - s, 29 + d, 1.8)],
                tips=[((19 - s, 28 + d), (20 - s, 33 + d), (22 - s, 29 + d)),
                      ((22 - s, 28 + d), (24 - s, 32 + d), (24 - s, 27 + d)),
                      ((20 - s, 22 + d), (17 - s, 25 + d), (20 - s, 25 + d))])
    f.part(pony, "hair", strands=hair_locks(64, slant_l=-0.3, amp=1.2, phase=1.4))

    # pernas: uma à frente e outra atrás conforme o passo
    back_x, front_x = 30 - passo, 32 + passo
    f.part(poly([(30, 52), (32, 52), (back_x + 2, 57 - pe_d), (back_x, 57 - pe_d)]), "skin")
    f.px(back_x, 55 - pe_d // 2, MATS["skin"][2])
    sandal(f, back_x - 1, 57 - pe_d, toes=1)
    f.part(poly([(32, 52), (34, 52), (front_x + 2, 57 - pe_e), (front_x, 57 - pe_e)]), "skin")
    f.px(front_x, 55 - pe_e // 2, MATS["skin"][2])
    sandal(f, front_x - 1, 57 - pe_e, toes=1)

    # tronco de lado: ombro nu, corpete
    f.part(ellipse(32, 34 + d, 4, 3), "skin")
    f.part(rect(31, 27 + d, 34, 32 + d), "skin")
    f.part(poly([(29, 34 + d), (35, 33 + d), (37, 35 + d), (36, 39 + d), (35, 43), (29, 43), (28, 38 + d)]),
           "dress")
    f.pts([(34, 32 + d), (34, 31 + d), (33, 30 + d), (32, 29 + d)], MATS["dress"][1])  # tirinha
    f.pts([(30, 30 + d), (29, 31 + d), (30, 31 + d)], MATS["dress"][1])  # laço da nuca
    for x in range(29, 36):
        f.px(x, 42, MATS["dress"][2])
    # saia em sino vista de lado
    h = abs(passo) // 2
    skirt = (ellipse(32, 51, 9 + h, 8) & rect(0, 43, 63, 52)) | poly([(29, 43), (35, 43), (40, 48), (24, 48)])
    f.part(skirt, "dress")
    for x, y in ((27, 49), (31, 47), (35, 50), (38, 48), (30, 51)):
        f.px(x, y, MATS["dress"][2])
    lace(f, 23 - h, 41 + h, 52)
    for x in range(23 - h, 42 + h, 2):
        f.px(x, 53, MATS["dress"][2], "dress")
    # laço da cintura atrás, com fita caindo
    f.part(rect(25, 41, 28, 44), "dress")
    f.px(27, 42, MATS["dress"][2])
    for y in range(45, 52):
        f.px(26 - (y - 45) // 3 - (s if y > 48 else 0), y, MATS["dress"][1], "dress")

    # braço dobrado segurando o livro à frente do peito, mão por baixo
    f.part(poly([(31, 34 + d), (33, 34 + d), (34, 39 + d), (32, 39 + d)]), "skin")
    f.part(poly([(32, 38 + d), (34, 39 + d), (38, 35 + d), (37, 34 + d)]), "skin")
    book(f, 36, 30 + d)
    f.part(ellipse(38, 34 + d, 1.2, 1.0), "skin")

    # cabeça de lado: crânio atrás + perfil do rosto linha a linha.
    # testa, nariz 1px para fora, boca recolhida e queixo pequeno.
    edge = {12: 36, 13: 37, 14: 38, 15: 39, 16: 40, 17: 40, 18: 40, 19: 40, 20: 40, 21: 40,
            22: 41, 23: 40, 24: 40, 25: 40, 26: 39, 27: 38, 28: 36}
    face = np.zeros((H, W), bool)
    for y, xe in edge.items():
        face[y + d, 30 : xe + 1] = True
    head = (ellipse(31, 20 + d, 8, 8.5) & (np.arange(W)[None, :] <= 36)) | face
    f.part(head, "skin")
    f.px(40, 23 + d, MATS["skin"][2])  # sombra sob o nariz
    # olho único, estreito, com pálpebra escura
    f.pts([(36, 20 + d), (37, 20 + d), (38, 21 + d)], C["lid"])
    for yy in (21, 22):
        f.px(36, yy + d, C["iris"])
        f.px(37, yy + d, C["iris"])
    f.px(37, 21 + d, C["white"])
    # sobrancelha franzida descendo para o nariz
    f.pts([(35, 17 + d), (36, 18 + d), (37, 18 + d), (38, 19 + d)], C["brow"])
    # boca de perfil: 1px colado à borda, sem passar o queixo
    f.px(40, 25 + d, C["mouth"])
    f.px(39, 25 + d, C["mouth"])
    f.pts([(35, 24 + d), (36, 24 + d)], C["blush"])

    # cabelo curto: nuca, topo e franja à frente com mechas pontudas
    hair = (ellipse(30, 17 + d, 10, 9) | poly([(21, 18 + d), (28, 18 + d), (29, 28 + d), (26, 31 + d),
                                                (24, 28 + d), (22, 30 + d), (21, 26 + d)])) \
        & ~poly([(31, 19 + d), (35, 15 + d), (42, 17 + d), (42, 31 + d), (31, 31 + d)])
    f.part(hair, "hair", strands=hair_locks(30, slant_l=0.6, slant_r=-0.4, phase=0.3), cast=True)
    f.part(poly([(32, 10 + d), (40, 12 + d), (42, 17 + d), (39, 16 + d), (37, 18 + d), (35, 16 + d), (33, 18 + d)]),
           "hair", strands=hair_locks(64, slant_l=-1.0, amp=0.0), cast=True)
    # mecha pontuda descendo na frente da orelha
    f.part(poly([(31, 17 + d), (33, 18 + d), (33, 26 + d), (32, 29 + d), (31, 25 + d)]), "hair", cast=True)

    # orelha da frente, alta e inclinada para trás
    fox_ear(f, (26, 13 + d), (35, 10 + d), (27 - max(s, 0), 1 + d))

    # rosa na base do rabo de cavalo
    rose(f, 24 - s, 13 + d, -s)
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
    """Mesmo ciclo da Selena: walk com 9 quadros (0 = parado), idle com 2."""
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
    # idle: respiração (corpo sobe 1px), rabo, orelhas e fitas balançam 1px
    return dict(dy=-i, sway=i)


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
    s.save(dest / "raposa_sheet.png")
    s.resize((s.width * 4, s.height * 4), Image.NEAREST).save(dest / "raposa_sheet_4x.png")
    breath = Image.new("RGBA", (W * 4, H * 2), (0, 0, 0, 0))
    breath.paste(s, (0, 0))
    breath.paste(sheet(dy=-1, sway=1), (0, H))
    breath.save(dest / "raposa_breath.png")
    breath.resize((breath.width * 4, breath.height * 4), Image.NEAREST).save(dest / "raposa_breath_4x.png")
    walk, idle = game_sheet("walk", 9), game_sheet("idle", 2)
    walk.save(dest / "walk.png")
    idle.save(dest / "idle.png")
    colors = {tuple(c) for c in np.array(walk).reshape(-1, 4) if c[3]}
    print(f"cores: {len(colors)}")


if __name__ == "__main__":
    main()
