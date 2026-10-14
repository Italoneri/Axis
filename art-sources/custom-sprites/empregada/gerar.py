"""Empregada (maid de cabelo prateado com espada rosa) desenhada pixel a pixel.

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
    "hair": ["#EEF0F8", "#C4C8D6", "#8A8FA3", "#4E5266"],
    "skin": ["#F8E4DC", "#F2D6CC", "#B8948E", "#B8948E"],
    "dress": ["#3A3D55", "#1A1B24", "#0D0D14", "#0D0D14"],
    "white": ["#FFFFFF", "#EEEFF5", "#DCDDE6", "#9EA1B3"],
    "gaunt": ["#4A4F6A", "#22232E", "#121219", "#121219"],
    "ribbon": ["#3A3D55", "#1A1B24", "#0D0D14", "#0D0D14"],
    "guard": ["#4A4F6A", "#22232E", "#121219", "#121219"],
}
MATS = {k: [hx(c) for c in v] for k, v in MATS.items()}
MAT_ID = {k: i + 1 for i, k in enumerate(MATS)}
ID_MAT = {v: k for k, v in MAT_ID.items()}

OUTLINE = hx("#14141C")
HAIR_OUTLINE = hx("#2A2C38")
RIM = hx("#9FB4FF")
C = {
    "eye_hi": hx("#FFB3D9"),
    "iris": hx("#FF3D8B"),
    "eye_rim": hx("#B0105A"),
    "mouth": hx("#7A2E44"),
    "gem": hx("#E0204A"),
    "gem_hi": hx("#FF8A9E"),
    "slit": hx("#FF3D6E"),
    "blade_core": hx("#FFD0E4"),
    "blade_mid": hx("#FF3D8B"),
    "blade_edge": hx("#A0104A"),
    "lacing": hx("#1A1B24"),
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
        self.rim_rows = (0, 40)  # faixa onde a roupa recebe luz de contorno

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
        """Mistura a cor num pixel já pintado (brilho sobre o que existe)."""
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
        # luz de contorno azul-clara: borda externa do cabelo e dos ombros
        edge = a & (~shift(a, -1, 0) | ~shift(a, 1, 0) | ~shift(a, 0, -1))
        y0, y1 = self.rim_rows
        for y, x in zip(*np.nonzero(edge)):
            name = ID_MAT.get(self.mat[y, x])
            if name == "hair" or (name in ("dress", "white", "ribbon") and y0 <= y <= y1):
                self.rgba[y, x] = mix(self.rgba[y, x], RIM, 0.55 if name != "hair" else 0.4)
        # contorno escuro de 1px; mais azulado ao lado do cabelo
        hair = self.mat == MAT_ID["hair"]
        near_hair = shift(hair, 1, 0) | shift(hair, -1, 0) | shift(hair, 0, 1) | shift(hair, 0, -1)
        out = (shift(a, 1, 0) | shift(a, -1, 0) | shift(a, 0, 1) | shift(a, 0, -1)) & ~a
        self.rgba[out] = OUTLINE
        self.rgba[out & near_hair] = HAIR_OUTLINE
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


def lace(f, x0, x1, y):
    for x in range(x0, x1 + 1):
        f.px(x, y, MATS["white"][0] if x % 2 == 0 else MATS["white"][2], "white")


def ruffle_edge(f, x0, x1, y, down=True):
    """Borda ondulada de babado: alterna 1px para fora a cada 2 colunas."""
    for x in range(x0, x1 + 1):
        if (x // 2) % 2 == 0:
            f.px(x, y + (1 if down else -1), MATS["white"][2], "white")
        f.px(x, y, MATS["white"][1] if x % 2 else MATS["white"][0], "white")


def gem(f, x, y):
    f.px(x, y, C["gem"])
    f.px(x, y - 1, C["gem_hi"]) if f.rgba[y - 1, x, 3] else None


def blade(f, a, b, glow=True):
    """Lâmina rosa brilhante de 3px: borda, meio e núcleo claro."""
    ax, ay = a
    bx, by = b
    n = int(max(abs(bx - ax), abs(by - ay))) + 1
    dx, dy = (bx - ax) / n, (by - ay) / n
    # normal da lâmina para as bordas
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln, dx / ln
    body = set()
    for i in range(n + 1):
        x, y = ax + dx * i, ay + dy * i
        core = (round(x), round(y))
        body.add(core)
        taper = i < n - 1
        for s in (-1, 1):
            if taper or s < 0:
                e = (round(x + nx * s), round(y + ny * s))
                body.add(e)
    for (x, y) in body:
        f.px(x, y, C["blade_mid"])
    for i in range(n + 1):
        x, y = ax + dx * i, ay + dy * i
        f.px(round(x + nx), round(y + ny), C["blade_edge"]) if i < n - 1 else None
        f.px(round(x), round(y), C["blade_core"] if i < n - 1 else C["blade_mid"])

    def halo():
        for (x, y) in list(body):
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + ox, y + oy)
                if q not in body:
                    f.glow(q[0], q[1], C["blade_mid"], 0.35, 120)

    if glow:
        f.post.append(halo)


def particles(f, pts):
    def put():
        for i, (x, y) in enumerate(pts):
            f.glow(x, y, C["slit"], 0.9, 230 if i % 2 == 0 else 150)

    f.post.append(put)


def eye_glow(f, pts):
    def put():
        for x, y in pts:
            f.tint(x, y, C["iris"], 0.35)

    f.post.append(put)


def gauntlet(f, cx, cy, point=(0, 1)):
    """Manopla preta pontuda com fenda vermelha."""
    m = ellipse(cx, cy, 2.2, 2.0)
    px_, py_ = point
    m |= poly([(cx - 1.5, cy + 0.5), (cx + 1.5, cy + 0.5), (cx + px_ * 3.5, cy + py_ * 3.5)])
    m |= rect(int(cx) - 2, int(cy) - 3, int(cx) + 1, int(cy) - 2)  # punho
    f.part(m, "gaunt")
    f.px(cx - 1, cy - 1, MATS["gaunt"][0])
    f.px(cx, cy, C["slit"])
    f.px(cx - 1, cy - 3, C["slit"])


def cap(f, cx, top, half, d, bow_side=-1, bow_visible=True):
    """Touca branca de babados com fita preta e laço de um lado."""
    body = ellipse(cx, top + 3.5, half, 2)
    for i, bx in enumerate(range(cx - half + 2, cx + half - 1, 3)):
        body |= ellipse(bx + 0.5, top + 1.5 + (i % 2) + (1 if abs(bx - cx) > half - 3 else 0), 1.8, 1.6)
    f.part(body, "white")
    # dobras do babado
    for bx in range(cx - half + 3, cx + half - 2, 3):
        f.px(bx + 1, top + 3, MATS["white"][2])
        f.px(bx + 1, top + 4, MATS["white"][3])
    # fita preta logo abaixo
    band = rect(cx - half + 1, top + 5, cx + half - 1, top + 5)
    f.part(band, "ribbon")
    if bow_visible:
        bx = cx + bow_side * (half - 1)
        f.part(rect(bx - 2, top + 4, bx - 1, top + 6) | rect(bx + 1, top + 4, bx + 2, top + 6), "ribbon")
        f.px(bx, top + 5, MATS["ribbon"][0], "ribbon")
        f.pts([(bx - 1, top + 7), (bx - 1, top + 8), (bx + 1, top + 7), (bx + 2, top + 8)], MATS["ribbon"][1], "ribbon")
        f.px(bx - 2, top + 4, MATS["ribbon"][0])


# ---------------------------------------------------------------- frente
def draw_front(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d, s = dy, sway
    # cabelo longo e solto atrás do corpo, até a cintura, pontas abrindo para os lados
    back = ellipse(32, 17 + d, 12, 11) | poly([(21, 16 + d), (43, 16 + d), (46, 30 + d), (47, 43 + d),
                                                (17, 43 + d), (18, 30 + d)])
    back |= spikes([(19, 42 + d, 2, 17 + s, 48 + d), (24, 43 + d, 2, 23 + s, 47 + d),
                    (45, 42 + d, 2, 47 + s, 48 + d), (40, 43 + d, 2, 41 + s, 47 + d),
                    (19, 27 + d, 2, 14 + s, 31 + d), (18, 36 + d, 2, 13 + s, 40 + d),
                    (45, 27 + d, 2, 50 + s, 31 + d), (46, 36 + d, 2, 51 + s, 40 + d)])
    f.part(back, "hair", strands=strands(phase=0.6))

    # anágua de babado branco por baixo da barra preta
    h = passo // 2
    f.part(rect(26, 60 - pe_e, 30, 61 - pe_e), "dress")
    f.part(rect(34, 60 - pe_d, 38, 61 - pe_d), "dress")
    f.part(poly([(25, 50), (39, 50), (44 + h, 59), (20 + h, 59)]), "white")
    ruffle_edge(f, 20 + h, 44 + h, 59)
    # saia preta
    f.part(poly([(26, 45), (38, 45), (43 + h, 57), (21 + h, 57)]), "dress")
    for x, y0 in ((23, 51), (41, 51)):
        for y in range(y0, 57):
            f.px(x + h, y, MATS["dress"][0])

    # tronco preto
    f.part(poly([(25, 31 + d), (39, 31 + d), (37, 40 + d), (38, 46 + d), (26, 46 + d), (27, 40 + d)]), "dress")
    # avental branco com babados: peitilho + saia do avental
    bib = poly([(28, 34 + d), (36, 34 + d), (35, 46 + d), (29, 46 + d)])
    f.part(bib, "white")
    for y in range(34 + d, 46 + d):
        f.px(27 if y < 40 + d else 28, y, MATS["white"][2], "white")
        f.px(37 if y < 40 + d else 36, y, MATS["white"][2], "white")
    f.part(poly([(28, 46 + d), (36, 46 + d), (40 + h, 56), (24 + h, 56)]), "white")
    ruffle_edge(f, 24 + h, 40 + h, 56)
    for x in (24 + h, 40 + h):
        for y in range(50, 56):
            f.px(x - (1 if x < 32 else -1) * 0, y, MATS["white"][2] if y % 2 else MATS["white"][0], "white")
    # amarração em X preta no meio do peitilho
    for i, y in enumerate(range(37 + d, 46 + d)):
        f.px(31 + (i % 2), y, C["lacing"])
        f.px(33 - (i % 2), y, C["lacing"])

    # braços: mangas bufantes nos ombros, antebraços até a espada no centro
    for side in (-1, 1):
        sx = 32 + side * 9
        hand = (32 + side * 2, 42 + d)
        arm = line((sx, 35 + d), (hand[0] + side, hand[1] - 2), 4)
        f.part(arm, "dress")
        f.part(ellipse(sx + side * 0.5, 33 + d, 5, 4), "dress")
        f.px(sx - 2 * side, 31 + d, MATS["dress"][0])

    # gola alta de renda branca com broche
    f.part(rect(29, 27 + d, 35, 31 + d), "white")
    lace(f, 28, 36, 31 + d)
    gem(f, 32, 30 + d)

    # cabeça
    f.part(ellipse(32, 20 + d, 8, 8.5), "skin", flat=True)
    # sombra no rosto logo abaixo da franja
    for x in range(25, 40):
        if f.mat[19 + d, x] == MAT_ID["skin"]:
            f.px(x, 19 + d, MATS["skin"][2])
    # olhos rosa-magenta brilhantes
    for ex in (27, 35):
        f.pts([(ex - 1, 20 + d), (ex, 20 + d), (ex + 1, 20 + d), (ex + 2, 20 + d)], C["eye_rim"])
        for yy in (21, 22):
            f.px(ex, yy + d, C["iris"])
            f.px(ex + 1, yy + d, C["iris"])
        f.px(ex, 21 + d, C["eye_hi"])
        f.px(ex + 1, 23 + d, C["eye_rim"])
        f.px(ex, 23 + d, C["eye_rim"])
    eye_glow(f, [(25, 21 + d), (25, 22 + d), (30, 21 + d), (30, 22 + d), (27, 24 + d), (28, 24 + d),
                 (33, 21 + d), (33, 22 + d), (38, 21 + d), (38, 22 + d), (35, 24 + d), (36, 24 + d)])
    # sorriso sutil e sinistro
    f.pts([(31, 27 + d), (32, 27 + d), (33, 27 + d), (34, 26 + d)], C["mouth"])

    # topo do cabelo e franja longa e irregular sobre os olhos
    top = ellipse(32, 15 + d, 10, 8) & ~rect(0, 17 + d, 63, 63)
    f.part(top, "hair", strands=strands(period=3, amp=0.0, slant=0.5), cast=True)
    bangs = spikes([(25, 16 + d, 2, 24, 25 + d), (28, 16 + d, 2, 26, 22 + d), (31, 16 + d, 2, 30, 24 + d),
                    (34, 16 + d, 2, 34, 21 + d), (37, 16 + d, 2, 38, 23 + d), (39, 16 + d, 2, 40, 26 + d)])
    f.part(bangs, "hair", strands=strands(period=3, amp=0.0, slant=-0.3), cast=True)
    # mechas laterais emoldurando o rosto até o ombro
    f.part(poly([(22, 15 + d), (25, 16 + d), (25, 27 + d), (24, 33 + d), (21, 31 + d), (21, 21 + d)]), "hair", cast=True)
    f.part(poly([(39, 16 + d), (42, 15 + d), (43, 21 + d), (43, 31 + d), (40, 33 + d), (39, 27 + d)]), "hair", cast=True)
    # brincos com gema vermelha
    for ex in (24, 40):
        f.px(ex, 26 + d, MATS["hair"][3])
        f.px(ex, 27 + d, C["gem"])

    # touca de babados (2-3px acima do cabelo) com laço do lado esquerdo
    cap(f, 32, 4 + d, 9, d, bow_side=-1)

    # espada no centro, à frente do avental: lâmina para baixo na diagonal
    b = braco
    blade(f, (32 + b, 46 + d), (27 + b, 60))
    guard = line((28 + b, 45 + d), (36 + b, 44 + d), 2)
    guard |= rect(27 + b, 43 + d, 27 + b, 44 + d) | rect(37 + b, 42 + d, 37 + b, 43 + d)
    f.part(guard, "guard")
    f.px(32 + b, 44 + d, C["blade_mid"])
    f.px(32 + b, 45 + d, C["gem"])
    f.part(rect(32 + b, 39 + d, 33 + b, 43 + d), "guard")  # empunhadura
    for side in (-1, 1):
        gauntlet(f, 32.5 + side * 1.5 + b, 41 + d, point=(side * 0.4, 1))
    f.px(32 + b, 38 + d, C["gem"])  # pomo
    particles(f, [(24 + b, 52), (37 + b, 55 + d), (22 + b, 58)])
    return f.finish()


# ---------------------------------------------------------------- costas
def draw_back(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d, s = dy, sway
    h = -(passo // 2)
    f.part(rect(26, 60 - pe_d, 30, 61 - pe_d), "dress")
    f.part(rect(34, 60 - pe_e, 38, 61 - pe_e), "dress")
    f.part(poly([(25, 50), (39, 50), (44 + h, 59), (20 + h, 59)]), "white")
    ruffle_edge(f, 20 + h, 44 + h, 59)
    f.part(poly([(26, 45), (38, 45), (43 + h, 57), (21 + h, 57)]), "dress")
    for x in (25, 30, 34, 39):
        for y in range(50, 57):
            f.px(x + h, y, MATS["dress"][0])
    # braços dobrados para a frente (as mãos ficam escondidas)
    for side in (-1, 1):
        sx = 32 + side * 9
        f.part(line((sx, 35 + d), (sx - side, 43 + d), 4), "dress")
        f.part(ellipse(sx + side * 0.5, 33 + d, 5, 4), "dress")
    f.part(poly([(25, 31 + d), (39, 31 + d), (37, 40 + d), (38, 46 + d), (26, 46 + d), (27, 40 + d)]), "dress")
    # laço grande do avental na cintura, com pontas
    f.part(rect(26, 45 + d, 38, 45 + d), "white")
    loops = ellipse(28.5, 46 + d, 3, 2.2) | ellipse(35.5, 46 + d, 3, 2.2)
    f.part(loops, "white")
    f.part(rect(31, 45 + d, 33, 47 + d), "white")
    f.px(32, 46 + d, MATS["white"][3])
    tails = poly([(30, 47 + d), (32, 47 + d), (29 + s, 53 + d), (27 + s, 52 + d)]) | \
        poly([(32, 47 + d), (34, 47 + d), (37 + s, 52 + d), (35 + s, 53 + d)])
    f.part(tails, "white")
    # cabelo cobre quase todo o tronco, em leque com pontas
    hair = ellipse(32, 18 + d, 11, 11) | poly([(21, 18 + d), (43, 18 + d), (46, 30 + d), (47, 40 + d),
                                                (17, 40 + d), (18, 30 + d)])
    hair |= spikes([(19, 39 + d, 2, 16 + s, 45 + d), (24, 40 + d, 3, 23 + s, 46 + d), (29, 40 + d, 2, 29 + s, 45 + d),
                    (35, 40 + d, 2, 35 + s, 45 + d), (40, 40 + d, 3, 41 + s, 46 + d), (45, 39 + d, 2, 48 + s, 45 + d),
                    (19, 26 + d, 2, 14 + s, 30 + d), (18, 34 + d, 2, 13 + s, 38 + d),
                    (45, 26 + d, 2, 50 + s, 30 + d), (46, 34 + d, 2, 51 + s, 38 + d)])
    f.part(hair, "hair", strands=strands(period=5, amp=1.5, phase=1.0))
    # touca vista de trás: babado no topo, fita e laço do lado esquerdo da personagem
    cap(f, 32, 4 + d, 9, d, bow_side=1)
    # brilho da lâmina aparecendo entre as pernas
    particles(f, [(40, 56 + d), (24, 53)])
    return f.finish()


# ---------------------------------------------------------------- perfil (virada para a direita)
def draw_profile_right(dy=0, sway=0, pe_e=0, pe_d=0, passo=0, braco=0):
    f = Frame()
    d, s = dy, sway
    # cabelo longo atrás do ombro, mechas balançando para trás
    back = ellipse(28, 17 + d, 10, 10) | poly([(20, 16 + d), (32, 14 + d), (31, 26 + d), (29, 36 + d),
                                                (27 - s, 44 + d), (18 - s, 45 + d), (16 - s, 34 + d), (17, 22 + d)])
    back |= spikes([(19 - s, 44 + d, 2, 15 - s, 49 + d), (24 - s, 44 + d, 2, 22 - 2 * s, 49 + d),
                    (17, 27 + d, 2, 12 - s, 30 + d), (16 - s, 37 + d, 2, 11 - 2 * s, 41 + d)])
    f.part(back, "hair", strands=strands(phase=1.4, slant=0.2))
    # pés, anágua e saia
    f.part(rect(29 - passo, 60 - pe_d, 33 - passo, 61 - pe_d), "dress")
    f.part(rect(32 + passo, 60 - pe_e, 36 + passo, 61 - pe_e), "dress")
    f.px(37 + passo, 61 - pe_e, MATS["dress"][1], "dress")
    h = abs(passo) // 2
    f.part(poly([(27, 50), (38, 50), (43 + h, 59), (22 - h, 59)]), "white")
    ruffle_edge(f, 22 - h, 43 + h, 59)
    f.part(poly([(28, 45), (37, 45), (42 + h, 57), (23 - h, 57)]), "dress")
    for x, y0 in ((27, 51), (33, 50), (38, 52)):
        for y in range(y0, 57):
            f.px(x, y, MATS["dress"][0])
    # laço do avental nas costas
    f.part(ellipse(25.5, 45 + d, 2.5, 2) | rect(26, 44 + d, 28, 46 + d), "white")
    f.part(poly([(25, 46 + d), (27, 46 + d), (24 - s, 52 + d), (22 - s, 51 + d)]), "white")
    # tronco de lado com busto
    f.part(poly([(28, 31 + d), (35, 31 + d), (38, 35 + d), (36, 40 + d), (36, 46 + d), (28, 46 + d), (29, 40 + d)]),
           "dress")
    # peitilho do avental (borda branca na frente) e saia do avental com babado
    f.part(poly([(35, 34 + d), (38, 35 + d), (36, 40 + d), (36, 46 + d), (34, 46 + d), (34, 40 + d)]), "white")
    for y in range(37 + d, 46 + d, 2):
        f.px(35, y, C["lacing"])
    f.part(poly([(33, 46 + d), (37, 46 + d), (42 + h, 56), (35, 56)]), "white")
    ruffle_edge(f, 35, 42 + h, 56)
    # gola alta de renda com broche
    f.part(rect(31, 27 + d, 35, 31 + d), "white")
    lace(f, 31, 36, 31 + d)
    gem(f, 35, 30 + d)
    # braço da frente: manga bufante e antebraço segurando a espada
    b = braco
    f.part(line((31, 36 + d), (37 + b, 41 + d), 4), "dress")
    f.part(ellipse(31, 34 + d, 5, 4), "dress")
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
    # olho único brilhante
    f.pts([(36, 20 + d), (37, 20 + d), (38, 20 + d)], C["eye_rim"])
    for yy in (21, 22):
        f.px(36, yy + d, C["iris"])
        f.px(37, yy + d, C["iris"])
    f.px(37, 21 + d, C["eye_hi"])
    f.pts([(36, 23 + d), (37, 23 + d)], C["eye_rim"])
    eye_glow(f, [(35, 21 + d), (35, 22 + d), (38, 21 + d), (38, 22 + d), (36, 24 + d), (37, 24 + d)])
    # sorriso sinistro de lado
    f.pts([(38, 26 + d), (39, 26 + d), (40, 25 + d)], C["mouth"])
    # cabelo sobre a cabeça e franja longa caindo sobre o olho
    hair = (ellipse(30, 16 + d, 10, 8.5) | poly([(20, 17 + d), (28, 17 + d), (30, 30 + d), (24, 34 + d), (20, 28 + d)])) \
        & ~poly([(31, 18 + d), (35, 16 + d), (43, 17 + d), (43, 31 + d), (31, 31 + d)])
    f.part(hair, "hair", strands=strands(amp=0.8, phase=0.3, slant=-0.3), cast=True)
    bangs = poly([(32, 11 + d), (40, 13 + d), (41, 17 + d), (35, 16 + d)])
    bangs |= spikes([(35, 16 + d, 2, 35, 23 + d), (38, 16 + d, 2, 39, 21 + d), (40, 16 + d, 1, 41, 24 + d)])
    f.part(bangs, "hair", strands=strands(period=3, amp=0.0, slant=-0.6), cast=True)
    # orelha com brinco de gema vermelha
    f.part(ellipse(31, 22 + d, 1.4, 2), "skin")
    f.px(31, 25 + d, MATS["hair"][3])
    f.px(31, 26 + d, C["gem"])
    f.px(31, 27 + d, C["gem_hi"])
    # touca de lado, laço visível atrás
    cap(f, 30, 4 + d, 8, d, bow_side=-1)
    # espada: lâmina para baixo, na diagonal à frente do corpo
    gx, gy = 39 + b, 44 + d
    blade(f, (gx + 1, gy + 2), (gx + 8, 60))
    guard = line((gx - 3, gy + 2), (gx + 4, gy - 1), 2)
    guard |= rect(gx - 4, gy + 1, gx - 4, gy + 3) | rect(gx + 4, gy - 3, gx + 4, gy - 1)
    f.part(guard, "guard")
    f.px(gx, gy + 1, C["gem"])
    f.part(line((gx - 2, gy - 4), (gx, gy), 2), "guard")  # empunhadura
    gauntlet(f, gx - 1, gy - 2, point=(0.6, 0.8))
    f.px(gx - 3, gy - 5, C["gem"])  # pomo
    particles(f, [(gx + 11, 52), (gx + 3, 57), (gx + 12, 58)])
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
    colors = {tuple(c) for c in np.array(prev).reshape(-1, 4) if c[3]}
    print(f"ok: {dest} ({len(colors)} cores na prévia)")


if __name__ == "__main__":
    main()
