"""Gera o sprite do Douglas (rapaz pálido de tapa-olho) desenhado em código.

Saída no mesmo formato dos sprites LPC do jogo: quadros de 64x64, linhas
norte, oeste, sul, leste; walk.png com 9 quadros e idle.png com 2 (respiração).
Também gera a sheet de 4 poses (costas, perfil direito, frente, perfil esquerdo)
em 1x e 4x.

    python3 art-sources/custom-sprites/douglas/gerar.py [pasta_de_saida]
"""
import math
import os
import sys

from PIL import Image

S = 64


def cor(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


CONTORNO = cor('15141C')
# Cada material tem 4 tons: sombra profunda, sombra, base, luz (borda voltada à luz).
MAT = {
    'pele':   [cor('8A839C'), cor('B9B3C4'), cor('E4E0E6'), cor('F2EFF4')],
    'cabelo': [cor('3A3F58'), cor('565C78'), cor('7C84A0'), cor('A8AEC6')],
    'camisa': [cor('7C7690'), cor('A59FB4'), cor('CFCAD8'), cor('E4E0E6')],
    'colete': [cor('1A1924'), cor('1A1924'), cor('2C2A38'), cor('44425A')],
    'calca':  [cor('7C7690'), cor('8A849C'), cor('BEB9C8'), cor('CFCAD8')],
    'preto':  [cor('1C1B22'), cor('1C1B22'), cor('1C1B22'), cor('34323E')],
    'laco':   [cor('1A1924'), cor('2E2C38'), cor('2E2C38'), cor('44425A')],
    # mãos e tornozelos: pele pálida sem a luz extra, para não virarem quadrados brancos
    'mao':    [cor('8A839C'), cor('B9B3C4'), cor('E4E0E6'), cor('E4E0E6')],
}
XADREZ = cor('8C86A6')
IRIS, BRILHO = cor('4A4658'), cor('6A6880')
BOTAO = cor('6A6880')
COSTURA = cor('44425A')
BOCA = cor('9C7E86')
OLHEIRA = MAT['pele'][0]
SOMBRA_PELE = MAT['pele'][1]
SOBRANCELHA = MAT['cabelo'][0]
TIRA = MAT['preto'][0]


class Peca:
    """Uma forma com contorno próprio e sombreado automático em 3 níveis + luz."""

    def __init__(self, m):
        self.m = m
        self.p = set()
        self.cor_extra = None  # f(x, y, tom) -> cor ou None (ex.: xadrez)

    def pinta(self, x, y):
        x, y = int(x), int(y)
        if 0 <= x < S and 0 <= y < S:
            self.p.add((x, y))

    def tira(self, x, y):
        self.p.discard((int(x), int(y)))

    def ret(self, x0, y0, x1, y1):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.pinta(x, y)
        return self

    def elipse(self, cx, cy, rx, ry, filtro=None):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                if nx * nx + ny * ny <= 1 and (filtro is None or filtro(x, y)):
                    self.pinta(x, y)
        return self

    def poli(self, pts):
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(min(xs)), int(max(xs)) + 1):
                px, py, dentro = x + 0.5, y + 0.5, False
                for i in range(len(pts)):
                    (ax, ay), (bx, by) = pts[i], pts[i - 1]
                    if (ay > py) != (by > py) and px < ax + (bx - ax) * (py - ay) / (by - ay):
                        dentro = not dentro
                if dentro:
                    self.pinta(x, y)
        return self

    def tons(self, longe=False):
        out = {}
        for (x, y) in self.p:
            vazio = lambda dx, dy: (x + dx, y + dy) not in self.p
            luz = vazio(-1, 0) + vazio(0, -1)
            sombra = vazio(1, 0) + vazio(0, 1)
            if sombra >= 2 or (vazio(1, 0) and vazio(1, 1) and vazio(0, 1)):
                t = 0
            elif sombra == 1:
                t = 1
            elif luz:
                t = 3
            else:
                t = 2
            if longe:
                t = max(0, t - 1)
            out[(x, y)] = t
        return out


class Quadro:
    def __init__(self):
        self.img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    def poe(self, peca, contorno=True, longe=False):
        px = self.img.load()
        if contorno:
            for (x, y) in peca.p:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    q = (x + dx, y + dy)
                    if q not in peca.p and 0 <= q[0] < S and 0 <= q[1] < S:
                        px[q] = CONTORNO
        for (x, y), t in peca.tons(longe).items():
            c = MAT[peca.m][t]
            if peca.cor_extra:
                c = peca.cor_extra(x, y, t) or c
            px[x, y] = c

    def px(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < S and 0 <= y < S:
            self.img.putpixel((x, y), c)

    def cheio(self, x, y):
        return 0 <= x < S and 0 <= y < S and self.img.getpixel((int(x), int(y)))[3] > 0

    def linha(self, a, b, c, so_sobre=False):
        n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) or 1
        for i in range(n + 1):
            x = round(a[0] + (b[0] - a[0]) * i / n)
            y = round(a[1] + (b[1] - a[1]) * i / n)
            if not so_sobre or self.cheio(x, y):
                self.px(x, y, c)


def xadrez(ox, oy):
    """Grade lavanda sutil, 1 px a cada 3 px, ancorada na perna (não "nada" quando ela anda).
    Só aparece no tom base: sombras e luz quebram a grade."""
    def f(x, y, t):
        if t == 2 and ((x - ox) % 3 == 0 or (y - oy) % 3 == 0):
            return XADREZ
        return None
    return f


def dobras(q, pts):
    """Dobras diagonais de sombra que quebram a grade."""
    for a, b in pts:
        q.linha(a, b, MAT['calca'][1], so_sobre=True)


def barra_amarrotada(q, x0, x1, y):
    for x in range(x0, x1 + 1):
        q.px(x, y, MAT['calca'][0] if x % 2 else MAT['calca'][1])


# ---------- partes de baixo (iguais na frente e nas costas) ----------

def pernas_frente(q, f):
    for lado, lev in ((-1, f['lev_e']), (1, f['lev_d'])):
        X = (lambda x: x) if lado < 0 else (lambda x: 64 - x)
        lx = (lambda x: x) if lado < 0 else (lambda x: 63 - x)
        bainha = 57 - lev
        # sapato pequeno e simples
        sap = Peca('preto')
        sap.ret(min(lx(26), lx(31)), bainha + 2, max(lx(26), lx(31)), bainha + 4)
        sap.tira(lx(26), bainha + 2)
        q.poe(sap)
        # tornozelo aparecendo acima do sapato
        tz = Peca('mao')
        tz.ret(min(lx(28), lx(30)), bainha + 1, max(lx(28), lx(30)), bainha + 1)
        q.poe(tz)
        # calça larga: mais larga embaixo, barra irregular
        c = Peca('calca')
        c.poli([(X(26), 44), (X(32), 44), (X(32), bainha + 1), (X(24.6), bainha + 1), (X(25.4), 50)]
               if lado < 0 else
               [(X(32), 44), (X(26), 44), (X(25.4), 50), (X(24.6), bainha + 1), (X(32), bainha + 1)])
        c.tira(lx(28), bainha)
        c.cor_extra = xadrez(lx(26), 45 - lev)
        q.poe(c)
        # dobras diagonais nos joelhos e barra amarrotada
        dobras(q, [((lx(26), 49 - lev // 2), (lx(29), 52 - lev // 2)),
                   ((lx(28), 50 - lev // 2), (lx(30), 52 - lev // 2)),
                   ((lx(27), 54 - lev), (lx(29), 56 - lev))])
        barra_amarrotada(q, min(lx(25), lx(31)), max(lx(25), lx(31)), bainha)


def mao(q, x, y, fechada, b=0, longe=False):
    """Mão pequena de pele pálida, com 1 px de divisão dos dedos."""
    m = Peca('mao')
    if fechada:
        m.ret(x, y, x + 2, y + 2)
    else:
        m.ret(x, y, x + 2, y + 3)
        m.tira(x, y + 3)
        m.tira(x + 2, y + 3)
    q.poe(m, longe=longe)
    if not longe:
        if fechada:
            q.px(x + 1, y + 1, MAT['mao'][1])
            q.px(x + 1, y + 2, MAT['mao'][1])
        else:
            q.px(x + 1, y + 2, MAT['mao'][1])


def bracos_frente(q, f, punho_esq):
    """Braços longos e finos com mangas largas. punho_esq: mão fechada à esquerda da tela."""
    b = f['bob']
    for lado in (-1, 1):
        lx = (lambda x: x) if lado < 0 else (lambda x: 63 - x)
        m = Peca('camisa')
        pts = [(23.6, 31.8), (26.6, 30.4), (27, 38), (26.6, 44.6), (22.8, 44.6), (23.2, 38.5), (22.8, 34)]
        m.poli([(x if lado < 0 else 64 - x, y + b) for x, y in pts])
        q.poe(m)
        # dobras de 1 px na manga, cotovelo e punho simples
        for (x, y) in ((24, 35), (25, 36), (24, 39), (25, 39), (23, 41), (25, 42)):
            q.px(lx(x), y + b, MAT['camisa'][0])
        for x in range(23, 27):
            q.px(lx(x), 44 + b, MAT['camisa'][1])
        fechada = (lado < 0) == punho_esq
        x0 = lx(23) if lado < 0 else lx(25)
        mao(q, x0, 46 + b, fechada)


def tronco_pts(b):
    # ombros caídos: o topo é estreito e desce até a cava
    return [(28.4, 29 + b), (36.6, 29 + b), (38.6, 31.2 + b), (38.4, 40 + b), (39, 48 + b),
            (26, 48 + b), (26.6, 40 + b), (26.4, 31.2 + b)]


def cabeca_frente(b):
    """Rosto fino, maçãs discretas e queixo pontudo."""
    h = Peca('pele')
    h.elipse(32.5, 20 + b, 5.1, 7.2)
    for y in range(23, 28):
        for x in range(25, 41):
            if abs(x + 0.5 - 32.5) > 4.6 - (y - 23) * 1.15:
                h.tira(x, y + b)
    for y in (19, 20, 21):
        h.pinta(27, y + b)
        h.pinta(38, y + b)
    return h


def laco_frente(q, b, sw):
    """Laço escuro 4x3 no colarinho, com duas pontas curtas de 2 px."""
    for x, y in ((30, 30), (33, 30), (30, 31), (31, 31), (32, 31), (33, 31), (30, 32), (33, 32)):
        q.px(x, y + b, MAT['laco'][1])
    q.px(31, 31 + b, MAT['laco'][0])
    q.px(32, 31 + b, MAT['laco'][0])
    q.px(30, 30 + b, MAT['laco'][3])
    for x, y in ((31, 33), (31 + sw, 34), (32, 33), (32 + sw, 34)):
        q.px(x, y + b, MAT['laco'][1])


def tapa_olho(q, x0, y0, larg, alt):
    t = Peca('preto').ret(x0, y0, x0 + larg - 1, y0 + alt - 1)
    t.tira(x0, y0)
    t.tira(x0 + larg - 1, y0)
    t.tira(x0, y0 + alt - 1)
    t.tira(x0 + larg - 1, y0 + alt - 1)
    q.poe(t, contorno=False)
    q.px(x0 + 1, y0, MAT['preto'][3])
    q.px(x0 + 1, y0 + 1, MAT['preto'][3])
    q.px(x0 + 2, y0, MAT['preto'][3])
    return t


# ---------- direções ----------

def sul(q, f):
    b, sw = f['bob'], f['balanco']
    pernas_frente(q, f)
    pesc = Peca('pele').ret(31, 26 + b, 33, 29 + b)
    q.poe(pesc)
    camisa = Peca('camisa').poli(tronco_pts(b))
    q.poe(camisa)
    colete = Peca('colete').poli([(x, y + 1) for x, y in tronco_pts(b)])
    for y in range(29, 39):
        w = (38 - y) * 2.2 / 8
        for x in range(26, 40):
            if abs(x + 0.5 - 32.5) <= w + 0.5:
                colete.tira(x, y + b)
    for x in (27, 28, 29, 30, 31, 34, 35, 36, 37, 38):
        colete.pinta(x, 49 + b)
    q.poe(colete)
    # golas e costuras do colete
    for y in range(30, 39):
        w = (38 - y) * 2.2 / 8
        q.px(round(32.5 - w - 1.5), y + b, COSTURA)
        q.px(round(32.5 + w + 0.5), y + b, COSTURA)
    for y in range(33, 47):
        q.px(28, y + b, COSTURA)
        q.px(37, y + b, COSTURA)
    for y in (40, 43, 46):
        q.px(32, y + b, BOTAO)
    q.px(30, 29 + b, MAT['camisa'][3])
    q.px(35, 29 + b, MAT['camisa'][3])
    laco_frente(q, b, sw)
    bracos_frente(q, f, punho_esq=True)
    q.poe(cabeca_frente(b))
    # rosto: maçãs sutis, olho cansado à esquerda da tela, nariz, boca fina
    q.px(29, 23 + b, SOMBRA_PELE)
    q.px(36, 23 + b, SOMBRA_PELE)
    q.px(30, 19 + b, OLHEIRA)  # pálpebra caída
    q.px(29, 19 + b, OLHEIRA)
    q.px(29, 20 + b, IRIS)
    q.px(30, 20 + b, BRILHO)
    q.px(29, 21 + b, OLHEIRA)  # olheira de 2 px
    q.px(30, 21 + b, OLHEIRA)
    q.px(32, 22 + b, SOMBRA_PELE)
    q.px(32, 25 + b, BOCA)
    q.px(33, 25 + b, BOCA)
    cabelo = cabelo_frente(q, b, sw)
    # sobrancelha fina, caindo para fora (por cima da franja rala)
    for x, y in ((31, 17), (30, 17), (29, 18), (28, 18)):
        q.px(x, y + b, SOBRANCELHA)
    # tapa-olho no olho esquerdo do personagem (direita da tela); a franja cobre só a borda
    tapa = tapa_olho(q, 33, 17 + b, 4, 5)
    for (x, y) in tapa.p:
        if (x, y) in cabelo.p and y == 17 + b and x in (34, 35):
            q.px(x, y, MAT['cabelo'][1])
    # tira de 1 px cruzando a testa na diagonal, por cima da franja, até atrás da orelha
    q.linha((33, 17 + b), (25, 13 + b), TIRA)
    q.px(37, 19 + b, TIRA)
    q.px(38, 19 + b, TIRA)
    q.px(39, 19 + b, TIRA)


def cabelo_frente(q, b, sw):
    h = Peca('cabelo')
    h.elipse(32.5, 17 + b, 7.4, 7.2, filtro=lambda x, y: y <= 15 + b)
    # topo desfiado: tufos e cortes irregulares (nada de capacete)
    for x, y in ((26, 11), (27, 10), (30, 9), (31, 9), (35, 9), (38, 11), (39, 12)):
        h.pinta(x, y + b)
    for x, y in ((29, 10), (33, 10), (40, 13), (25, 12)):
        h.tira(x, y + b)
    # laterais na altura do queixo/orelha, comprimentos desiguais
    for x, fundo in ((24, 21), (25, 25), (26, 27), (27, 18), (38, 24), (39, 27), (40, 22), (41, 19)):
        h.ret(x, 14 + b, x, fundo + b)
    h.tira(24, 14 + b)
    # franja comprida de lado; sobre o tapa-olho só encosta na borda de cima
    for x, fundo in ((27, 16), (28, 15), (29, 16), (30, 15), (31, 16), (32, 17),
                     (33, 16), (34, 17), (35, 17), (36, 16), (37, 18)):
        h.ret(x, 12 + b, x, fundo + b)
    # fios soltos
    h.pinta(28, 9 + b)
    h.pinta(36, 8 + b)
    h.pinta(23, 20 + b)
    q.poe(h)
    # mecha longa caindo na frente do rosto, junto à bochecha (sem contorno, para não riscar o rosto)
    for y in range(17, 25):
        x = 28 + (sw if y > 21 else 0)
        q.px(x, y + b, MAT['cabelo'][2] if y < 23 else MAT['cabelo'][1])
        q.px(x - 1, y + b, MAT['cabelo'][1] if y < 24 else CONTORNO)
    q.px(28 + sw, 25 + b, CONTORNO)
    for x, y0, y1 in ((29, 12, 15), (33, 11, 14), (36, 11, 15), (25, 18, 23), (39, 17, 25), (27, 14, 20)):
        for y in range(y0, y1 + 1):
            if (x, y + b) in h.p:
                q.px(x, y + b, MAT['cabelo'][1])
    for x, y in ((30, 10), (31, 11), (27, 12), (34, 10)):
        q.px(x, y + b, MAT['cabelo'][3])
    return h


def norte(q, f):
    b, sw = f['bob'], f['balanco']
    pernas_frente(q, f)
    camisa = Peca('camisa').poli(tronco_pts(b))
    q.poe(camisa)
    colete = Peca('colete').poli([(x, y + 1) for x, y in tronco_pts(b)])
    q.poe(colete)
    for y in range(32, 48):
        q.px(32, y + b, COSTURA if y % 2 else MAT['colete'][1])
    for y in range(33, 47):
        q.px(28, y + b, COSTURA)
        q.px(37, y + b, COSTURA)
    # ajuste/fivela de 2 px na cintura
    for x in range(29, 37):
        q.px(x, 43 + b, COSTURA)
    q.px(32, 43 + b, BOTAO)
    q.px(33, 43 + b, BOTAO)
    pesc = Peca('pele').ret(31, 26 + b, 33, 29 + b)
    q.poe(pesc)
    for x in (31, 32, 33):
        q.px(x, 29 + b, MAT['camisa'][2])
    bracos_frente(q, f, punho_esq=False)
    q.poe(cabeca_frente(b))
    h = Peca('cabelo')
    h.elipse(32.5, 18 + b, 7.4, 8.2)
    for x, y in ((26, 11), (27, 10), (30, 9), (31, 9), (35, 9), (38, 11), (39, 12)):
        h.pinta(x, y + b)
    for x, y in ((29, 10), (33, 10), (40, 13)):
        h.tira(x, y + b)
    # nuca desfiada: pontas desiguais
    for x, fundo in ((24, 21), (25, 25), (26, 27), (27, 24), (28, 27), (29, 25), (30, 28),
                     (31, 26), (32, 27), (33, 28), (34, 25), (35, 27), (36, 24), (37, 27),
                     (38, 25), (39, 27), (40, 22), (41, 19)):
        h.ret(x, 14 + b, x, fundo + b)
    h.pinta(28, 9 + b)
    h.pinta(36, 8 + b)
    h.pinta(42, 20 + b + sw)
    h.pinta(23, 21 + b)
    q.poe(h)
    for x, y0, y1 in ((27, 17, 23), (30, 15, 27), (33, 13, 27), (36, 16, 23), (39, 17, 26)):
        for y in range(y0, y1 + 1):
            if (x, y + b) in h.p:
                q.px(x, y + b, MAT['cabelo'][1])
    for x, y in ((29, 11), (31, 12), (34, 11), (28, 14), (36, 12)):
        q.px(x, y + b, MAT['cabelo'][3])
    # tira do tapa-olho atravessando o cabelo atrás da cabeça, com nozinho de 2 px
    for x in range(24, 42):
        y = 18 + (1 if abs(x - 32.5) > 5 else 0)
        q.px(x, y + b, TIRA)
    q.px(32, 18 + b, MAT['preto'][3])
    q.px(32, 19 + b, MAT['preto'][3])


def leste(q, f, com_tapa=False):
    """Perfil de verdade (90°) olhando para a direita. O oeste é o espelho deste,
    desenhado com com_tapa=True: é o lado do tapa-olho que fica voltado para a câmera."""
    b, sw, p, a = f['bob'], f['balanco'], f['passo'], f['braco']
    # braço de trás (mais escuro), quase todo escondido pelo tronco
    mt = Peca('camisa').poli([(30, 32 + b), (32.6, 32 + b), (32.4 - a, 44.6 + b), (29.8 - a, 44.6 + b)])
    q.poe(mt, longe=True)
    mao(q, 30 - a, 46 + b, True, longe=True)
    # pernas: a de trás mais escura e 1 px mais alta
    for o, lev, longe in ((-p, f['lev_d'] + 1, True), (p, f['lev_e'], False)):
        bainha = 57 - lev
        sap = Peca('preto').ret(30 + o, bainha + 2, 36 + o, bainha + 4)
        sap.tira(30 + o, bainha + 2)
        sap.tira(36 + o, bainha + 2)
        q.poe(sap, longe=longe)
        tz = Peca('mao').ret(31 + o, bainha + 1, 33 + o, bainha + 1)
        q.poe(tz, longe=longe)
        c = Peca('calca').poli([(29.4, 44), (35.6, 44), (36.4 + o, bainha + 1.4),
                                (28.6 + o, bainha + 1.4), (29 + o * 0.5, 50)])
        c.tira(32 + o, bainha)
        c.cor_extra = xadrez(30 + o, 45 - lev)
        q.poe(c, longe=longe)
        dobras(q, [((31 + o, 49), (34 + o, 52)), ((33 + o, 50), (35 + o, 52)),
                   ((31 + o, 54 - lev), (33 + o, 56 - lev))])
        barra_amarrotada(q, 29 + o, 36 + o, bainha)
    pesc = Peca('pele').poli([(32.4, 26 + b), (35, 26 + b), (35.4, 30 + b), (32.6, 30 + b)])
    q.poe(pesc)
    # tronco de lado com 6 px: costas curvadas, peito levemente côncavo
    tronco = [(30.2, 29.6 + b), (34.8, 29.4 + b), (35.6, 31.4 + b), (35, 34 + b), (34.8, 39 + b),
              (35.8, 44 + b), (36, 48 + b), (30, 48 + b), (29.6, 42 + b), (29, 36 + b), (29.4, 32 + b)]
    q.poe(Peca('camisa').poli(tronco))
    colete = Peca('colete').poli([(x, y + 1) for x, y in tronco])
    for y in range(29, 36):
        for x in range(33, 38):
            if x - 33 >= (35 - y) * 0.45:
                colete.tira(x, y + b)
    q.poe(colete)
    # alça/cava do colete, costura da gola e botões no canto da frente
    for x, y in ((31, 31), (31, 32), (32, 33), (32, 34), (31, 35)):
        q.px(x, y + b, COSTURA)
    for y in (39, 42, 45):
        q.px(34 if y < 42 else 35, y + b, BOTAO)
    # laço do pescoço visível de lado: nó, uma asa e as pontas curtas
    for x, y in ((35, 29), (36, 29), (35, 30), (36, 30), (35, 31), (36, 31)):
        q.px(x, y + b, MAT['laco'][1])
    q.px(35, 30 + b, MAT['laco'][0])
    q.px(36, 29 + b, MAT['laco'][3])
    q.px(36, 32 + b, MAT['laco'][1])
    q.px(36 + (1 if sw > 0 else 0), 33 + b, MAT['laco'][1])
    # braço da frente: longo, cotovelo marcado, manga larga com dobras, mão em punho
    m = Peca('camisa').poli([(30.6, 30.6 + b), (34, 30.6 + b), (33.4, 38 + b), (34.4 + a, 44.6 + b),
                             (31.2 + a, 44.6 + b), (30, 39.4 + b), (30.2, 34 + b)])
    q.poe(m)
    for x, y in ((32, 34), (33, 35), (31, 38), (32, 39), (33, 39), (32 + a, 42)):
        q.px(x, y + b, MAT['camisa'][0])
    q.px(30, 39 + b, MAT['camisa'][1])
    for x in range(31, 35):
        q.px(x + a, 44 + b, MAT['camisa'][1])
    mao(q, 31 + a, 46 + b, True)
    # cabeça de perfil, à frente do tronco (postura curvada), queixo pontudo
    h = Peca('pele')
    h.elipse(34.6, 20 + b, 5.1, 7.2)
    for y in range(23, 28):
        for x in range(28, 42):
            if x < 33 and y >= 24:
                h.tira(x, y + b)
    for y in range(23, 28):
        for x in range(35, 42):
            if x - 35 > 4 - (y - 23) * 1.2:
                h.tira(x, y + b)
    h.pinta(39, 20 + b)
    h.pinta(40, 21 + b)
    h.pinta(39, 21 + b)
    q.poe(h)
    q.px(39, 21 + b, SOMBRA_PELE)
    q.px(35, 23 + b, SOMBRA_PELE)
    q.px(37, 25 + b, BOCA)
    # orelha
    orelha = Peca('pele').ret(31, 19 + b, 32, 22 + b)
    orelha.tira(31, 22 + b)
    q.poe(orelha)
    q.px(32, 20 + b, MAT['pele'][1])
    # cabelo: mechas caindo sobre a orelha e a nuca, silhueta desfiada, franja sobre a testa
    hc = Peca('cabelo')
    hc.elipse(33.6, 17 + b, 7.2, 7.4, filtro=lambda x, y: y <= 15 + b or x <= 30)
    for x, y in ((28, 10), (31, 9), (32, 9), (36, 9), (39, 11)):
        hc.pinta(x, y + b)
    for x, y in ((30, 10), (34, 10)):
        hc.tira(x, y + b)
    for x, fundo in ((25, 20), (26, 23), (27, 26), (28, 24), (29, 28), (30, 25), (31, 20), (32, 19)):
        hc.ret(x, 13 + b, x, fundo + b)
    for x, fundo in ((34, 16), (35, 17), (36, 15), (37, 16), (38, 17), (39, 16), (40, 18)):
        hc.ret(x, 12 + b, x, fundo + b)
    for y in range(16, 23):
        hc.pinta(41 if y < 19 else 41 + sw, y + b)
    for x, y in ((24, 16), (24, 21), (25, 24), (29, 8)):
        hc.pinta(x, y + b)
    q.poe(hc)
    for x, y0, y1 in ((27, 14, 25), (29, 14, 27), (31, 13, 19), (35, 11, 16), (38, 11, 16)):
        for y in range(y0, y1 + 1):
            if (x, y + b) in hc.p:
                q.px(x, y + b, MAT['cabelo'][1])
    for x, y in ((33, 10), (35, 10), (31, 12), (38, 12)):
        q.px(x, y + b, MAT['cabelo'][3])
    # sobrancelha fina caída, por cima da franja rala
    for x, y in ((36, 17), (37, 17), (38, 18)):
        q.px(x, y + b, SOBRANCELHA)
    if com_tapa:
        tapa_olho(q, 36, 18 + b, 4, 4)
        q.linha((36, 18 + b), (30, 16 + b), TIRA)
        q.px(29, 16 + b, TIRA)
    else:
        q.px(37, 19 + b, OLHEIRA)  # pálpebra caída
        q.px(38, 19 + b, OLHEIRA)
        q.px(37, 20 + b, IRIS)
        q.px(38, 20 + b, BRILHO)
        q.px(37, 21 + b, OLHEIRA)
        q.px(38, 21 + b, OLHEIRA)
        # só a tira, passando atrás da orelha
        q.linha((33, 18 + b), (29, 16 + b), TIRA)


# ---------- animação ----------

def parametros(anim, i):
    if anim == 'walk' and i > 0:
        t = 2 * math.pi * (i - 1) / 8
        s, c = math.sin(t), math.cos(t)
        return {
            'bob': 1 if abs(s) > 0.7 else 0,
            'balanco': round(s),
            'lev_e': max(0, round(2 * c)),
            'lev_d': max(0, round(-2 * c)),
            'passo': round(3 * c),
            'braco': round(-2 * c),
        }
    # idle: respiração lenta (corpo desce 1 px, franja e laço balançam 1 px)
    return {'bob': i if anim == 'idle' else 0, 'balanco': i if anim == 'idle' else 0,
            'lev_e': 0, 'lev_d': 0, 'passo': 0, 'braco': 0}


def quadro(direcao, anim, i):
    """direcao: 0 norte, 1 oeste, 2 sul, 3 leste (ordem das linhas LPC)."""
    q = Quadro()
    f = parametros(anim, i)
    if direcao == 0:
        norte(q, f)
    elif direcao == 2:
        sul(q, f)
    else:
        leste(q, f, com_tapa=(direcao == 1))
        if direcao == 1:
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
    # sheet de 4 poses: costas, perfil direito, frente, perfil esquerdo
    sheet = Image.new('RGBA', (4 * S, S), (0, 0, 0, 0))
    for k, d in enumerate((0, 3, 2, 1)):
        sheet.alpha_composite(quadro(d, 'idle', 0), (k * S, 0))
    sheet.save(os.path.join(saida, 'douglas_sheet.png'))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(
        os.path.join(saida, 'douglas_sheet_4x.png'))
    # respiração: as 4 poses nos 2 quadros do idle
    resp = Image.new('RGBA', (4 * S, 2 * S), (0, 0, 0, 0))
    for k, d in enumerate((0, 3, 2, 1)):
        for i in range(2):
            resp.alpha_composite(quadro(d, 'idle', i), (k * S, i * S))
    resp.save(os.path.join(saida, 'douglas_breath.png'))
    resp.resize((resp.width * 4, resp.height * 4), Image.NEAREST).save(
        os.path.join(saida, 'douglas_breath_4x.png'))
    cores = set()
    for im in (walk, idle):
        cores |= {im.getpixel((x, y)) for x in range(im.width) for y in range(im.height)} - {(0, 0, 0, 0)}
    print(f'ok: {saida} ({len(cores)} cores)')


if __name__ == '__main__':
    main()
