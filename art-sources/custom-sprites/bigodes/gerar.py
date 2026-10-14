"""Gera o sprite do Bigodes (gato persa ferreiro) desenhado em código.

Saída no mesmo formato dos sprites LPC do jogo: quadros de 64x64, linhas
norte, oeste, sul, leste; walk.png com 9 quadros e idle.png com 2.

    python3 art-sources/custom-sprites/bigodes/gerar.py [pasta_de_saida]
"""
import math
import os
import sys

from PIL import Image

S = 64


def cor(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


CONTORNO = cor('18181C')
# Materiais em 3 tons: sombra, base, luz.
MAT = {
    'pelo':   [cor('2C2C30'), cor('3C3C40'), cor('5A5A5E')],
    'branco': [cor('9C9CA0'), cor('CFCFCB'), cor('F2F2EE')],
    'couro':  [cor('241810'), cor('3E2A20'), cor('5A3E2E')],
    'luva':   [cor('241810'), cor('3A271D'), cor('5A3E2E')],
    'metal':  [cor('121614'), cor('1E2420'), cor('34403A')],
    'ouro':   [cor('8C8A3A'), cor('8C8A3A'), cor('C9A44A')],
    'gema':   [cor('B6E04A'), cor('B6E04A'), cor('E8FF9A')],
    # versões mais escuras para o que fica longe da câmera no perfil
    'couro_longe':  [cor('1A120C'), cor('241810'), cor('3E2A20')],
    'branco_longe': [cor('7E7E84'), cor('9C9CA0'), cor('CFCFCB')],
    'luva_longe':   [cor('1A120C'), cor('241810'), cor('3A271D')],
}
PELUDOS = {'pelo', 'branco', 'branco_longe'}
OLHO, BRILHO = cor('C8962E'), cor('F2C14E')
ROSA = cor('E8A0A8')
SOBRANCELHA = cor('1E1E22')
ROSTO = [cor('5A5A5E'), cor('6E6E74')]
OLHO_SOMBRA = cor('94681E')
COSTURA = cor('6A4A36')
CABO = [cor('2A2A2A'), cor('3C3C3C')]
CABO_LUZ = [cor('3C3C3C'), cor('5A5A5E')]
LUZ_VERDE = cor('9BCB4A')


class Peca:
    """Uma peça com um contorno próprio; pode ter mais de um material."""

    def __init__(self):
        self.mat = {}  # (x, y) -> material

    def pinta(self, x, y, m):
        x, y = int(x), int(y)
        if 0 <= x < S and 0 <= y < S:
            self.mat[(x, y)] = m

    def elipse(self, cx, cy, rx, ry, m):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                if nx * nx + ny * ny <= 1:
                    self.pinta(x, y, m)

    def triangulo(self, a, b, c, m):
        xs, ys = [p[0] for p in (a, b, c)], [p[1] for p in (a, b, c)]

        def lado(p, q, r):
            return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(min(xs)), int(max(xs)) + 1):
                p = (x + 0.5, y + 0.5)
                d = (lado(a, b, p), lado(b, c, p), lado(c, a, p))
                if all(v >= 0 for v in d) or all(v <= 0 for v in d):
                    self.pinta(x, y, m)

    def retangulo(self, x0, y0, x1, y1, m):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.pinta(x, y, m)

    def linha(self, a, b, larg, m):
        n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) * 2) + 1
        for i in range(n + 1):
            t = i / n
            x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            self.elipse(x, y, larg / 2, larg / 2, m)

    def recorta(self, outra):
        """Mantém só os pixels que existem na outra peça."""
        self.mat = {p: m for p, m in self.mat.items() if p in outra.mat}

    def render(self, contorno=True, luz_verde=None):
        img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        px = img.load()
        tem = self.mat
        if not tem:
            return img
        ys = [p[1] for p in tem]
        topo, alt = min(ys), max(ys) - min(ys) + 1
        for (x, y), m in tem.items():
            vazio = lambda dx, dy: (x + dx, y + dy) not in tem
            nota = vazio(0, -1) + vazio(0, -2) + vazio(-1, -1)
            nota -= vazio(0, 1) + vazio(1, 1) + vazio(1, 0)
            rel = (y - topo) / alt
            nota += 1 if rel < 0.2 else (-2 if rel > 0.82 else (-1 if rel > 0.66 else 0))
            xadrez = (x + y) % 2 == 0
            if nota >= 2:
                t = 2
            elif nota == 1:
                t = 2 if (m in PELUDOS and xadrez) else 1
            elif nota == 0:
                t = 1
            elif nota == -1:
                t = 0 if (m in PELUDOS and xadrez) else 1
            else:
                t = 0
            px[x, y] = MAT[m][t]
            if luz_verde and vazio(0, -1) and luz_verde(x, y):
                px[x, y] = mistura(px[x, y], LUZ_VERDE, 0.3)
        if contorno:
            for (x, y) in list(tem):
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    q = (x + dx, y + dy)
                    if q not in tem and 0 <= q[0] < S and 0 <= q[1] < S:
                        px[q] = CONTORNO
        return img


def mistura(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)


class Quadro:
    def __init__(self):
        self.img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    def poe(self, peca, **kw):
        self.img.alpha_composite(peca.render(**kw))

    def px(self, x, y, c):
        if 0 <= x < S and 0 <= y < S:
            self.img.putpixel((int(x), int(y)), c)

    def mistura(self, x, y, c, t):
        if 0 <= x < S and 0 <= y < S:
            atual = self.img.getpixel((x, y))
            if atual[3]:
                self.img.putpixel((x, y), mistura(atual, c, t))


# ---------- peças compartilhadas ----------

def cauda(pontos, raio=3.2):
    p = Peca()
    n = len(pontos)
    for i, (x, y) in enumerate(pontos):
        r = raio - 0.6 * i / n
        p.elipse(x, y, r, r, 'branco' if i >= n - 2 else 'pelo')
    return p


def luva(cx, cy, quadro_pecas, punho='cima'):
    p = Peca()
    p.elipse(cx, cy, 3.6, 3.2, 'luva')
    if punho == 'cima':
        p.retangulo(cx - 3, cy - 4, cx + 3, cy - 3, 'couro')
    quadro_pecas.append(('luva', p, (cx, cy)))
    return p


def costura(q, cx, cy):
    for ang in range(200, 341, 35):
        a = math.radians(ang)
        q.px(round(cx + 2.2 * math.cos(a)), round(cy - 1.8 * math.sin(a) + 1), COSTURA)


def martelo_cabeca(cx, cy, larg=13, alt=11, emblema=True):
    p = Peca()
    x0, y0 = cx - larg // 2, cy - alt // 2
    x1, y1 = x0 + larg - 1, y0 + alt - 1
    p.retangulo(x0, y0, x1, y1, 'metal')
    for x in range(x0, x1 + 1):
        p.pinta(x, y0, 'ouro')
        p.pinta(x, y1, 'ouro')
    for y in range(y0, y1 + 1):
        p.pinta(x0, y, 'ouro')
        p.pinta(x1, y, 'ouro')
    return p, (x0, y0, x1, y1, emblema)


def emblema(q, caixa):
    x0, y0, x1, y1, tem = caixa
    if not tem:
        return
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    ol = MAT['ouro'][0]
    for dx, dy in ((-2, -2), (2, -2), (-2, -1), (-1, -1), (0, -1), (1, -1), (2, -1),
                   (-2, 0), (2, 0), (-2, 1), (0, 1), (2, 1), (-1, 2), (0, 2), (1, 2)):
        q.px(cx + dx, cy + dy, ol)
    q.px(cx - 1, cy, MAT['gema'][0])
    q.px(cx + 1, cy, MAT['gema'][2])
    for x in range(x0 + 1, x1):
        q.mistura(x, y0, LUZ_VERDE, 0.5)


def cabo(q, a, b):
    """Cabo com empunhadura enrolada (listras diagonais) e pomo."""
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
    for i in range(n + 1):
        t = i / n
        x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        for oy, tons in ((0, CABO_LUZ), (1, CABO)):
            xi, yi = round(x), round(y) + oy
            q.px(xi, yi, tons[(xi + yi) // 2 % 2])
        q.px(round(x), round(y) - 1, CONTORNO)
        q.px(round(x), round(y) + 2, CONTORNO)
    pomo = Peca()
    pomo.elipse(b[0] + 0.5, b[1] + 1, 1.7, 1.7, 'ouro')
    q.poe(pomo)


def gema(q, x, y):
    g = Peca()
    g.retangulo(x, y, x + 1, y + 1, 'gema')
    q.poe(g)
    q.px(x, y, MAT['gema'][2])
    q.px(x + 1, y, MAT['gema'][0])
    q.px(x, y + 1, MAT['gema'][0])
    q.px(x + 1, y + 1, cor('8CB838'))


def rebites(q, x0, x1, y, passo=4, pula=()):
    for x in range(x0, x1 + 1, passo):
        if not any(a <= x <= b for a, b in pula):
            q.px(x, y, MAT['ouro'][2])


# ---------- direções ----------

def sul(q, f):
    by, sw, pe_e, pe_d = f['bob'], f['balanco'], f['pe_e'], f['pe_d']
    com_martelo = f['martelo']
    q.poe(cauda([(44, 50 + by), (47, 48 + by), (49, 45 + by), (50 + sw, 42 + by),
                 (50 + sw, 39 + by), (49 + sw, 36 + by)]))
    for cx, lev in ((26.5, pe_e), (37.5, pe_d)):
        perna = Peca()
        perna.elipse(cx, 54 - lev, 4.6, 4.2, 'couro')
        q.poe(perna)
    for cx, lev in ((26, pe_e), (38, pe_d)):
        pata = Peca()
        pata.elipse(cx, 59.5 - lev, 4.6, 2.6, 'branco')
        q.poe(pata)
        for dx in (-2, 0, 2):
            q.px(cx + dx, 60 - lev, ROSA)
    tronco = Peca()
    tronco.elipse(32, 45 + by, 14.5, 11, 'couro')
    q.poe(tronco)
    # alças cruzadas e fivelas
    for a, b in (((22, 35), (30, 47)), ((42, 35), (34, 47))):
        n = 14
        for i in range(n + 1):
            t = i / n
            x, y = round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t)
            q.px(x, y + by, MAT['couro'][2])
            q.px(x + (1 if a[0] < 32 else -1), y + by, MAT['couro'][2])
            q.px(x - (1 if a[0] < 32 else -1), y + by, MAT['couro'][0])
    q.px(25, 40 + by, MAT['ouro'][2])
    q.px(39, 40 + by, MAT['ouro'][2])
    # cinto, bolsinhas e bombinha
    cinto = Peca()
    cinto.retangulo(17, 48 + by, 47, 51 + by, 'couro')
    cinto.recorta(_alargado(tronco, 0))
    q.poe(cinto)
    rebites(q, 19, 45, 49 + by, pula=((29, 35),))
    fivela = Peca()
    fivela.retangulo(30, 48 + by, 34, 51 + by, 'ouro')
    q.poe(fivela)
    q.px(32, 49 + by, CONTORNO)
    q.px(32, 50 + by, CONTORNO)
    for x0 in (18, 42):
        bolsa = Peca()
        bolsa.retangulo(x0, 51 + by, x0 + 4, 55 + by, 'couro')
        q.poe(bolsa)
        q.px(x0 + 2, 52 + by, MAT['ouro'][2])
    bomba = Peca()
    bomba.elipse(47.5, 56 + by, 2.6, 2.6, 'metal')
    q.poe(bomba)
    q.px(48, 52 + by, MAT['ouro'][2])
    # braços: mangas brancas peludas, ombros caídos
    pecas = []
    if com_martelo:
        mangas = [((18, 41), (23, 45)), ((46, 41), (42, 47))]
    else:
        mangas = [((18, 41), (17, 46)), ((46, 41), (47, 46))]
    for (sx, sy), (fx, fy) in mangas:
        m = Peca()
        m.elipse(sx, sy + by, 5, 6.5, 'branco')
        m.elipse(fx, fy + by, 4, 4, 'branco')
        for t in range(3):
            m.pinta(sx - 5 if sx < 32 else sx + 4, sy + by - 2 + 2 * t, 'branco')
        q.poe(m, luz_verde=lambda x, y: True)
    # barba e costeletas (até o meio do peito, com tufos)
    barba = Peca()
    barba.elipse(25.5, 32 + by, 7.5, 6.5, 'branco')
    barba.elipse(38.5, 32 + by, 7.5, 6.5, 'branco')
    barba.elipse(32, 35 + by, 9, 6.5, 'branco')
    for tx, fundo in ((21, 41), (26.5, 44), (32, 43), (37.5, 44), (43, 41)):
        barba.triangulo((tx - 3, 37 + by), (tx + 3, 37 + by), (tx + sw, fundo + by), 'branco')
    for lado in (-1, 1):
        barba.triangulo((32 + lado * 13, 27 + by), (32 + lado * 13, 33 + by),
                        (32 + lado * 17, 31 + by), 'branco')
    if not com_martelo or True:
        gema(q, 31, 45 + by) if not com_martelo else None
    orelhas = Peca()
    for lado in (-1, 1):
        orelhas.triangulo((32 + lado * 12, 18 + by), (32 + lado * 10.5, 10 + by),
                          (32 + lado * 5.5, 15 + by), 'pelo')
    q.poe(orelhas)
    for lado in (-1, 1):
        q.px(32 + lado * 10 - (1 if lado < 0 else 0), 14 + by, ROSA)
        q.px(32 + lado * 10 - (1 if lado < 0 else 0), 15 + by, MAT['branco'][1])
        q.px(32 + lado * 11 - (1 if lado < 0 else 0), 12 + by, MAT['branco'][2])
    cabeca = Peca()
    cabeca.elipse(32, 24 + by, 13.5, 10.5, 'pelo')
    for tx, ty in ((26, 13), (30, 12), (34, 12), (38, 13)):
        cabeca.triangulo((tx - 2, ty + 2 + by), (tx + 2, ty + 2 + by), (tx + 1, ty - 1 + by), 'pelo')
    q.poe(cabeca)
    focinho = Peca()
    focinho.elipse(32, 29 + by, 4.5, 2.5, 'branco')
    q.poe(focinho, contorno=False)
    for y in range(20, 27):
        for x in range(21, 43):
            if ((x + 0.5 - 32) / 10.5) ** 2 + ((y + 0.5 - 24) / 4) ** 2 <= 1:
                q.px(x, y + by, ROSTO[1] if (x + y) % 2 or abs(x - 32) < 8 else ROSTO[0])
    q.poe(barba, luz_verde=lambda x, y: abs(x - 32) > 9)
    # rosto: sobrancelhas em V, olhos semicerrados, nariz, boca emburrada
    for lado in (-1, 1):
        def X(x):
            return x if lado < 0 else 63 - x
        for x, y in ((21, 19), (22, 19), (23, 20), (24, 20), (25, 21), (26, 21), (27, 22), (28, 22), (29, 23),
                     (22, 20), (23, 21), (24, 21), (25, 22), (26, 22), (27, 23), (28, 23)):
            q.px(X(x), y + by, SOBRANCELHA)
        for x, c in ((24, OLHO), (25, OLHO), (26, BRILHO), (27, CONTORNO), (28, OLHO)):
            q.px(X(x), 24 + by, c)
        for x, c in ((25, OLHO_SOMBRA), (26, OLHO), (27, CONTORNO), (28, OLHO_SOMBRA)):
            q.px(X(x), 25 + by, c)
        for x in range(24, 30):
            q.px(X(x), 26 + by, MAT['pelo'][0])
    q.px(31, 28 + by, ROSA)
    q.px(32, 28 + by, ROSA)
    q.px(31, 29 + by, MAT['branco'][0])
    q.px(32, 29 + by, MAT['branco'][0])
    for x, y in ((29, 32), (30, 31), (31, 31), (32, 31), (33, 31), (34, 32)):
        q.px(x, y + by, MAT['branco'][0])
    if com_martelo:
        gema(q, 31, 44 + by)
        cabeca_m, caixa = martelo_cabeca(12, 37 + by)
        q.poe(cabeca_m, luz_verde=lambda x, y: True)
        emblema(q, caixa)
        a, b = (19, 39 + by), (47, 54 + by)
        cabo(q, a, b)
        for t in (0.25, 0.7):
            cx, cy = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 1
            g = Peca()
            g.elipse(cx, cy, 3.6, 3.3, 'luva')
            g.retangulo(cx - 2 + (0 if t < 0.5 else 2), cy - 5, cx + 2 + (0 if t < 0.5 else 2), cy - 3, 'luva')
            q.poe(g)
            costura(q, round(cx), round(cy))
    else:
        for cx in (17, 47):
            g = Peca()
            g.elipse(cx, 50 + by, 3.8, 3.4, 'luva')
            g.retangulo(cx - 3, 46 + by, cx + 3, 47 + by, 'luva')
            q.poe(g)
            costura(q, cx, 50 + by)


def _alargado(peca, n):
    return peca


def norte(q, f):
    by, sw, pe_e, pe_d = f['bob'], f['balanco'], f['pe_e'], f['pe_d']
    for cx, lev in ((26.5, pe_e), (37.5, pe_d)):
        perna = Peca()
        perna.elipse(cx, 54 - lev, 4.6, 4.2, 'couro')
        q.poe(perna)
        pata = Peca()
        pata.elipse(cx, 59.5 - lev, 4.6, 2.6, 'branco')
        q.poe(pata)
    # martelo preso nas costas, na diagonal
    cabeca_m, caixa = martelo_cabeca(47, 29 + by, 11, 10, emblema=False)
    q.poe(cabeca_m, luz_verde=lambda x, y: True)
    tronco = Peca()
    tronco.elipse(32, 45 + by, 14.5, 11, 'couro')
    q.poe(tronco)
    for a, b in (((22, 35), (42, 49)), ((42, 35), (22, 49))):
        n = 20
        for i in range(n + 1):
            t = i / n
            x, y = round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t)
            q.px(x, y + by, MAT['couro'][2])
            q.px(x + 1, y + by, MAT['couro'][2])
    q.px(32, 42 + by, MAT['ouro'][2])
    q.px(33, 42 + by, MAT['ouro'][2])
    cabo(q, (43, 32 + by), (20, 50 + by))
    cinto = Peca()
    cinto.retangulo(18, 48 + by, 46, 51 + by, 'couro')
    q.poe(cinto)
    rebites(q, 20, 44, 49 + by)
    for x0 in (16, 44):
        bolsa = Peca()
        bolsa.retangulo(x0, 50 + by, x0 + 4, 54 + by, 'couro')
        q.poe(bolsa)
    for lado, (sx, sy) in ((-1, (18, 41)), (1, (46, 41))):
        m = Peca()
        m.elipse(sx, sy + by, 5, 6.5, 'branco')
        m.elipse(sx - lado, 46 + by, 4, 4, 'branco')
        q.poe(m, luz_verde=lambda x, y: True)
        g = Peca()
        oy = f['braco'] * lado
        g.elipse(sx - lado, 50 + by + oy, 3.8, 3.4, 'luva')
        g.retangulo(sx - lado - 3, 46 + by + oy, sx - lado + 3, 47 + by + oy, 'luva')
        q.poe(g)
    barba = Peca()
    for lado in (-1, 1):
        barba.elipse(32 + lado * 12, 31 + by, 4.5, 6, 'branco')
        barba.triangulo((32 + lado * 10, 34 + by), (32 + lado * 15, 34 + by),
                        (32 + lado * 13 + sw, 40 + by), 'branco')
    q.poe(barba, luz_verde=lambda x, y: True)
    orelhas = Peca()
    for lado in (-1, 1):
        orelhas.triangulo((32 + lado * 12, 18 + by), (32 + lado * 10.5, 10 + by),
                          (32 + lado * 5.5, 15 + by), 'pelo')
    q.poe(orelhas)
    cabeca = Peca()
    cabeca.elipse(32, 24 + by, 13.5, 10.5, 'pelo')
    for tx, ty in ((26, 13), (30, 12), (34, 12), (38, 13)):
        cabeca.triangulo((tx - 2, ty + 2 + by), (tx + 2, ty + 2 + by), (tx + 1, ty - 1 + by), 'pelo')
    # tufo volumoso na nuca
    for tx in (24, 28, 32, 36, 40):
        cabeca.triangulo((tx - 2, 32 + by), (tx + 2, 32 + by), (tx + sw, 36 + by), 'pelo')
    q.poe(cabeca)
    for x, y in ((27, 17), (29, 16), (31, 18), (35, 17), (37, 19), (26, 22), (33, 21), (38, 24), (29, 27), (35, 28)):
        q.px(x, y + by, MAT['pelo'][2])
    q.poe(cauda([(33, 52 + by), (36, 50 + by), (39, 47 + by), (40 + sw, 44 + by),
                 (40 + sw, 41 + by), (39 + sw, 38 + by)], raio=3.4))


def oeste(q, f):
    """Perfil verdadeiro olhando para a esquerda; o leste é o espelho deste."""
    by, sw, pe_e, pe_d = f['bob'], f['balanco'], f['pe_e'], f['pe_d']
    passo, br = f['passo'], f['braco']
    com_martelo = f['martelo']
    # cauda: nasce da base das costas e sobe para trás (a base fica sob o tronco)
    rabo = Peca()
    for k, (x, y) in enumerate(((38, 52), (41, 51.5), (44, 50.5), (46.5, 48.5), (48 + sw, 46),
                                (49 + sw, 43), (49.5 + sw, 40.5))):
        r = 3.4 - 0.25 * k
        rabo.elipse(x, y + by, r, r, 'pelo')
    q.poe(rabo)
    for x, y in ((49, 39), (50, 39), (49, 40), (48, 38)):
        q.px(x + sw, y + by, MAT['branco'][1] if (x + y) % 2 else MAT['pelo'][2])
    # braço de trás: quase todo escondido pelo tronco
    longe = Peca()
    longe.elipse(23, 47 + by, 2.6, 2.4, 'luva_longe')
    q.poe(longe)
    # pernas em passo: a de trás mais escura e 1px mais alta
    for cx, lev, perna_m, pata_m in ((35 + passo, pe_d + 1, 'couro_longe', 'branco_longe'),
                                     (29 - passo, pe_e, 'couro', 'branco')):
        perna = Peca()
        perna.elipse(cx, 54 - lev, 3.6, 4, perna_m)
        q.poe(perna)
        pata = Peca()
        pata.elipse(cx - 1.5, 59.5 - lev, 4.2, 2.4, pata_m)
        q.poe(pata)
        if pata_m == 'branco':
            q.px(cx - 5, 60 - lev, ROSA)
    # tronco: oval vertical, barriga para frente, costas curvas
    tronco = Peca()
    tronco.elipse(33, 45 + by, 9.5, 11, 'couro')
    tronco.elipse(28, 47.5 + by, 6.5, 7, 'couro')
    q.poe(tronco)
    # uma alça diagonal sobre o ombro
    for i in range(16):
        x, y = round(37 - i * 0.6), 34 + i
        q.px(x, y + by, MAT['couro'][2])
        q.px(x + 1, y + by, MAT['couro'][2])
        q.px(x + 2, y + by, MAT['couro'][0])
    # cinto horizontal, fivela única na frente, bolsinha e bomba no quadril de trás
    cinto = Peca()
    cinto.retangulo(18, 48 + by, 44, 51 + by, 'couro')
    cinto.recorta(tronco)
    q.poe(cinto)
    rebites(q, 27, 41, 49 + by)
    fivela = Peca()
    fivela.retangulo(21, 48 + by, 23, 51 + by, 'ouro')
    q.poe(fivela)
    q.px(22, 49 + by, CONTORNO)
    q.px(22, 50 + by, CONTORNO)
    bolsa = Peca()
    bolsa.retangulo(39, 50 + by, 43, 54 + by, 'couro')
    q.poe(bolsa)
    q.px(41, 51 + by, MAT['ouro'][2])
    bomba = Peca()
    bomba.elipse(41.5, 56.5 + by, 2.4, 2.4, 'metal')
    q.poe(bomba)
    q.px(42, 53 + by, MAT['ouro'][2])
    # orelha de perfil, no topo e um pouco para trás
    orelha = Peca()
    orelha.triangulo((30, 16 + by), (35, 8 + by), (40, 16 + by), 'pelo')
    # cabeça: frente quase reta na vertical (focinho achatado)
    cabeca = Peca()
    cabeca.elipse(30.5, 23 + by, 11, 10, 'pelo')
    for tx, ty in ((26, 13), (38, 15), (41, 19)):
        cabeca.triangulo((tx - 2, ty + 2 + by), (tx + 2, ty + 2 + by), (tx + 1, ty - 1 + by), 'pelo')
    cabeca.mat = {p: m for p, m in cabeca.mat.items() if p[0] >= 21}
    q.poe(cabeca)
    q.poe(orelha)
    for x, y in ((34, 12), (35, 12), (34, 13), (35, 11)):
        q.px(x, y + by, ROSA)
    q.px(35, 9 + by, MAT['branco'][2])
    q.px(36, 10 + by, MAT['branco'][1])
    # testa e área do olho mais claras; bochecha branca na frente e embaixo
    for y in range(19, 27):
        for x in range(21, 31):
            if ((x + 0.5 - 25) / 5.5) ** 2 + ((y + 0.5 - 23.5) / 4) ** 2 <= 1:
                q.px(x, y + by, ROSTO[1] if (x + y) % 2 or x < 28 else ROSTO[0])
    bochecha = Peca()
    bochecha.elipse(25.5, 28.5 + by, 5, 3.5, 'branco')
    bochecha.mat = {p: m for p, m in bochecha.mat.items() if p[0] >= 21}
    q.poe(bochecha, contorno=False)
    # barba: massa arredondada do queixo ao peito, com 4 tufos que cobrem a alça
    barba = Peca()
    barba.elipse(26, 34 + by, 7, 6.5, 'branco')
    barba.elipse(31, 31 + by, 5.5, 5, 'branco')
    for tx, fundo in ((21, 41), (25, 43), (29, 42), (33, 40)):
        barba.triangulo((tx - 2.5, 37 + by), (tx + 2.5, 37 + by), (tx + sw, fundo + by), 'branco')
    q.poe(barba, luz_verde=lambda x, y: x > 28)
    for x, y in ((18, 33), (19, 38), (34, 37), (36, 33), (17, 36)):
        q.px(x + sw, y + by, MAT['branco'][1] if (x + y) % 2 else MAT['branco'][0])
    # rosto: sobrancelha franzida caindo para o nariz, um olho, nariz e boca
    for x, y in ((21, 22), (22, 22), (23, 21), (24, 21), (25, 20), (26, 20), (27, 19), (28, 19),
                 (22, 23), (23, 22), (24, 22), (25, 21), (26, 21), (27, 20)):
        q.px(x, y + by, SOBRANCELHA)
    for x, c in ((23, OLHO), (24, CONTORNO), (25, BRILHO), (26, OLHO)):
        q.px(x, 24 + by, c)
    for x, c in ((23, OLHO_SOMBRA), (24, CONTORNO), (25, OLHO_SOMBRA)):
        q.px(x, 25 + by, c)
    for x in range(22, 27):
        q.px(x, 26 + by, MAT['pelo'][0])
    for y in range(17, 33):
        if q.img.getpixel((20, y + by))[3] == 0:
            q.px(20, y + by, CONTORNO)
    q.px(20, 27 + by, ROSA)
    q.px(19, 27 + by, ROSA)
    q.px(19, 26 + by, CONTORNO)
    q.px(19, 28 + by, CONTORNO)
    q.px(18, 27 + by, CONTORNO)
    for x, y in ((21, 30), (22, 29), (23, 30)):
        q.px(x, y + by, MAT['branco'][0])
    gema(q, 21, 44 + by)
    # braço da frente: manga branca e luva
    manga = Peca()
    manga.elipse(35, 40 + by, 4, 5.5, 'branco')
    manga.elipse(31 + br, 45 + by, 3.2, 3.4, 'branco')
    q.poe(manga, luz_verde=lambda x, y: True)
    if com_martelo:
        gx, gy = 28 + br, 48 + by
        cabeca_m, _ = martelo_cabeca(14 + br, 41 + by, 5, 12, emblema=False)
        q.poe(cabeca_m, luz_verde=lambda x, y: True)
        q.px(14 + br, 41 + by, MAT['gema'][0])
        cabo(q, (17 + br, 43 + by), (41 + br, 53 + by))
    else:
        gx, gy = 31 + br, 51 + by
    g = Peca()
    g.elipse(gx, gy, 3.6, 3.3, 'luva')
    g.retangulo(gx + 1, gy - 5, gx + 4, gy - 3, 'luva')
    q.poe(g)
    costura(q, gx, gy)


def _union(peca, n):
    return peca


# ---------- animação ----------

def parametros(anim, i):
    if anim == 'walk':
        s = 0 if i == 0 else math.sin(2 * math.pi * (i - 1) / 8)
        c = 0 if i == 0 else math.cos(2 * math.pi * (i - 1) / 8)
        return {
            'bob': 0 if i == 0 else (-1 if abs(c) > 0.7 else 0),
            'balanco': round(s),
            'pe_e': max(0, round(1.6 * s)),
            'pe_d': max(0, round(-1.6 * s)),
            'passo': round(2.4 * s),
            'braco': round(-1.2 * s),
            'martelo': True,
        }
    return {'bob': i, 'balanco': i, 'pe_e': 0, 'pe_d': 0, 'passo': 0, 'braco': 0, 'martelo': False}


def quadro(direcao, anim, i):
    q = Quadro()
    f = parametros(anim, i)
    if direcao == 0:
        norte(q, f)
    elif direcao == 2:
        sul(q, f)
    else:
        oeste(q, f)
        if direcao == 3:
            q.img = q.img.transpose(Image.FLIP_LEFT_RIGHT)
    return q.img


def folha(anim, quadros, largura=832):
    img = Image.new('RGBA', (largura, 4 * S), (0, 0, 0, 0))
    for d in range(4):
        for i in range(quadros):
            img.alpha_composite(quadro(d, anim, i), (i * S, d * S))
    return img


def main():
    saida = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    os.makedirs(saida, exist_ok=True)
    walk, idle = folha('walk', 9), folha('idle', 2)
    walk.save(os.path.join(saida, 'walk.png'))
    idle.save(os.path.join(saida, 'idle.png'))
    # prévia de 6 quadros: costas, perfil, frente com martelo, perfil, frente sem martelo, perfil
    previa = Image.new('RGBA', (6 * S, S), (0, 0, 0, 0))
    for k, (folha_, d) in enumerate(((walk, 0), (walk, 1), (walk, 2), (walk, 3), (idle, 2), (idle, 3))):
        previa.alpha_composite(folha_.crop((0, d * S, S, (d + 1) * S)), (k * S, 0))
    previa.save(os.path.join(saida, 'preview.png'))
    previa.resize((previa.width * 4, previa.height * 4), Image.NEAREST).save(os.path.join(saida, 'preview-4x.png'))
    cores = {previa.getpixel((x, y)) for x in range(previa.width) for y in range(previa.height)} - {(0, 0, 0, 0)}
    print(f'ok: {saida} ({len(cores)} cores na prévia)')


if __name__ == '__main__':
    main()
