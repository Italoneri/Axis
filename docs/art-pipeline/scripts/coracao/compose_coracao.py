"""Gera a arte do Coração da Axis (slot core) nos 3 níveis, toda por código.
Uso: python3 -I compose_coracao.py <layout.json> <pasta_saida> [tamanho=512]
Saída: axis_heart.core.png, axis_heart.core.lv2.png, axis_heart.core.lv3.png (fundo transparente).
Vista de cima, ângulo 0 = Norte, sentido horário; o círculo da arte é o círculo do core."""
import json, math, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

LAY, OUT = sys.argv[1], sys.argv[2]
SIZE = int(sys.argv[3]) if len(sys.argv) > 3 else 512
N = 2048                       # supersample
C = N / 2                      # centro
R = N / 2                      # raio do core na arte
_Y, _X = np.mgrid[0:N, 0:N].astype(np.float32)
DIST = np.hypot(_X - C, _Y - C)  # distância ao centro, calculada uma vez
GOLD = (226, 184, 74)          # #E2B84A
GOLD_LIGHT = (255, 224, 138)

prisms = json.load(open(LAY))['entrances']['prisms']
ANGLES = json.load(open(LAY))['entrances']['angles']
# cor de cada feixe: o "glow" quando existe (o preto brilha em violeta)
BEAM = [tuple(p.get('glow', p['rgb'])) for p in prisms]
FACET = [tuple(p['rgb']) for p in prisms]


def pol(r, a):
    a = math.radians(a)
    return (C + r * math.sin(a), C - r * math.cos(a))


def layer():
    return Image.new('RGBA', (N, N), (0, 0, 0, 0))


def mix(c1, c2, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def over(base, top):
    base.alpha_composite(top)
    return base


def add(base, top):
    """Soma de luz (premultiplicada) sobre a base, mantendo a transparência coerente."""
    b = np.asarray(base, dtype=np.float32) / 255
    t = np.asarray(top, dtype=np.float32) / 255
    rgb = b[..., :3] * b[..., 3:] + t[..., :3] * t[..., 3:]
    a = np.clip(b[..., 3:] + t[..., 3:] * (1 - b[..., 3:]) + t[..., 3:] * 0.0, 0, 1)
    a = np.maximum(a, np.clip(rgb.max(axis=2, keepdims=True), 0, 1))
    out_rgb = np.where(a > 0, np.clip(rgb / np.maximum(a, 1e-6), 0, 1), 0)
    return Image.fromarray((np.concatenate([out_rgb, a], axis=2) * 255).astype(np.uint8), 'RGBA')


def radial(r_px, color, alpha, falloff=2.0, center=(C, C)):
    d = (DIST if center == (C, C) else np.hypot(_X - center[0], _Y - center[1])) / r_px
    a = np.clip(1 - d, 0, 1) ** falloff * alpha
    arr = np.zeros((N, N, 4), np.float32)
    arr[..., :3] = np.array(color, np.float32) / 255
    arr[..., 3] = a
    return Image.fromarray((arr * 255).astype(np.uint8), 'RGBA')


# ---------------------------------------------------------------- runas
GLYPH_STROKES = [((0, 0), (1, 0)), ((0, 1), (1, 1)), ((0, 2), (1, 2)), ((0, 0), (0, 2)), ((1, 0), (1, 2)),
                 ((0, 0), (1, 1)), ((1, 0), (0, 1)), ((0, 1), (1, 2)), ((1, 1), (0, 2)), ((0.5, 0), (0.5, 2))]


def glyph(rng):
    return rng.sample(GLYPH_STROKES, rng.randint(2, 4))


def rune_ring(r, width, color, alpha, count, rng, broken=0.0, glow=0):
    """Anel de runas: dois filetes e glifos geométricos entre eles, cada um virado para o centro."""
    im = layer(); d = ImageDraw.Draw(im)
    col = color + (int(255 * alpha),)
    lw = max(3, int(width * 0.09))
    for rr in (r - width / 2, r + width / 2):
        d.ellipse((C - rr, C - rr, C + rr, C + rr), outline=col, width=lw)
    gh = width * 0.55; gw = gh * 0.5
    for i in range(count):
        a = 360 * (i + 0.5) / count
        g = glyph(rng)
        if rng.random() < broken:
            continue
        for (x1, y1), (x2, y2) in g:
            pts = []
            for gx, gy in ((x1, y1), (x2, y2)):
                # glifo em coordenadas locais: x ao longo do anel, y na direção radial
                lx = (gx - 0.5) * gw; ly = (gy - 1) * gh / 2
                ang = a + math.degrees(lx / r)
                pts.append(pol(r - ly, ang))
            d.line(pts, fill=col, width=lw)
        # losango separador
        b = a + 180 / count
        p = [pol(r, b - 0.9 * 360 / count / 8), pol(r + gh / 4, b), pol(r, b + 0.9 * 360 / count / 8), pol(r - gh / 4, b)]
        d.polygon(p, fill=col)
    if glow:
        im = add(im.filter(ImageFilter.GaussianBlur(glow)), im)
    return im


# ---------------------------------------------------------------- feixes
def beams(r0, r1, w0, w1, strength, core_white=0.6):
    im = layer()
    for ang, col in zip(ANGLES, BEAM):
        for scale, a, blur, c in ((2.6, 0.45 * strength, 28, col), (1.0, 0.85 * strength, 6, col),
                                  (0.35, core_white * strength, 3, mix(col, (255, 255, 255), 0.75))):
            l = layer(); d = ImageDraw.Draw(l)
            half0 = math.degrees(w0 * scale / 2 / r0); half1 = math.degrees(w1 * scale / 2 / r1)
            pts = [pol(r0, ang - half0), pol(r1, ang - half1), pol(r1 + w1 * scale, ang), pol(r1, ang + half1), pol(r0, ang + half0)]
            d.polygon(pts, fill=c + (255,))
            l = l.filter(ImageFilter.GaussianBlur(blur))
            # esmaece rumo à ponta
            arr = np.asarray(l, dtype=np.float32)
            t = np.clip((DIST - r0) / (r1 - r0), 0, 1)
            arr[..., 3] *= (1 - 0.55 * t) * a
            im = add(im, Image.fromarray(arr.astype(np.uint8), 'RGBA'))
    return im


def stubs(strength):
    return beams(R * 0.20, R * 0.42, 34, 10, strength, core_white=0.15)


# ---------------------------------------------------------------- prisma
LIGHT = (-0.55, -0.65, 0.52)   # luz de cima à esquerda


def octagon(r, rot=22.5, cx=C, cy=C):
    return [(cx + r * math.sin(math.radians(rot + 45 * k)), cy - r * math.cos(math.radians(rot + 45 * k))) for k in range(8)]


def crystal(r, tint, bright, base_col, edge_col, alpha=1.0):
    """Bipirâmide de 8 faces vista de cima: cada faceta aponta para um portão."""
    im = layer(); d = ImageDraw.Draw(im)
    v = octagon(r)
    lx, ly, lz = LIGHT; ln = math.sqrt(lx * lx + ly * ly + lz * lz)
    for k, ang in enumerate(ANGLES):
        a = math.radians(ang)
        nx, ny, nz = math.sin(a) * 0.75, -math.cos(a) * 0.75, 0.66
        lit = max(0, (nx * lx + ny * ly + nz * lz) / ln)
        shade = 0.45 + 0.75 * lit
        col = mix(base_col, FACET[k] if k != 5 else BEAM[5], tint)
        col = tuple(min(255, int(c * shade * bright)) for c in col)
        tri = [(C, C), v[(k - 1) % 8], v[k]]
        # a faceta k fica entre os vértices k-1 e k (centrada no ângulo do portão)
        tri = [(C, C), octagon(r, rot=ang - 22.5)[0], octagon(r, rot=ang + 22.5)[0]]
        d.polygon(tri, fill=col + (int(255 * alpha),))
    ew = max(3, int(r * 0.03))
    for k in range(8):
        p = octagon(r, rot=ANGLES[k] - 22.5)[0]
        d.line([(C, C), p], fill=edge_col + (int(220 * alpha),), width=ew)
    d.polygon(octagon(r, rot=ANGLES[0] - 22.5), outline=edge_col + (int(235 * alpha),), width=ew + 1)
    # mesa (face de cima) como na lapidação de uma gema: octógono menor e mais claro
    table = octagon(r * 0.46, rot=ANGLES[0] - 22.5)
    top = tuple(min(255, int(c * (0.95 + 0.25 * bright))) for c in mix(base_col, (255, 255, 255), 0.25))
    d.polygon(table, fill=top + (int(255 * alpha),), outline=edge_col + (int(235 * alpha),), width=ew)

    # brilho especular no topo, puxado para a luz
    spec = radial(r * 0.42 * bright, (255, 255, 255), 0.55 * bright, 1.6, center=(C - r * 0.18, C - r * 0.22))
    im = add(im, spec)
    mask = layer(); ImageDraw.Draw(mask).polygon(octagon(r, rot=ANGLES[0] - 22.5), fill=(255, 255, 255, 255))
    im.putalpha(Image.fromarray(np.minimum(np.asarray(im)[..., 3], np.asarray(mask)[..., 3])))
    return im


def shadow(points, dx, dy, alpha, blur):
    im = layer(); ImageDraw.Draw(im).polygon([(x + dx, y + dy) for x, y in points], fill=(5, 6, 20, int(255 * alpha)))
    return im.filter(ImageFilter.GaussianBlur(blur))


def cracks(r, rng, color, width, glow_col=None):
    im = layer(); d = ImageDraw.Draw(im)
    for start in (200, 75, 320, 140):
        pts = [pol(r * 0.08, start)]
        a, rr = start, r * 0.08
        while rr < r * 0.97:
            rr += r * rng.uniform(0.08, 0.16); a += rng.uniform(-14, 14)
            pts.append(pol(min(rr, r * 0.97), a))
            if rng.random() < 0.3:   # galho
                b = a + rng.choice((-1, 1)) * rng.uniform(20, 35)
                d.line([pts[-1], pol(min(rr + r * 0.18, r * 0.96), b)], fill=color, width=max(2, width // 2))
        d.line(pts, fill=color, width=width, joint='curve')
        if glow_col:
            d.line(pts, fill=glow_col, width=max(2, width // 3))
    return im


def shards(rng):
    im = layer(); sh = layer()
    for ang, dist, s in ((118, 0.40, 46), (238, 0.37, 38), (20, 0.44, 30)):
        cx, cy = pol(R * dist, ang)
        rot = rng.uniform(0, 360)
        pts = [(cx + s * math.cos(math.radians(rot + t)), cy + s * math.sin(math.radians(rot + t))) for t in (0, 130, 220)]
        sh = over(sh, shadow(pts, 26, 30, 0.45, 8))
        d = ImageDraw.Draw(im)
        d.polygon(pts, fill=(118, 132, 168, 255), outline=(170, 182, 214, 255), width=4)
        d.line([pts[0], ((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2)], fill=(150, 165, 200, 255), width=3)
    return over(sh, im)


def star8(r_long, r_short, color, alpha, width):
    im = layer(); d = ImageDraw.Draw(im)
    pts = []
    for k in range(16):
        pts.append(pol(r_long if k % 2 == 0 else r_short, 22.5 * k))
    d.polygon(pts, fill=color + (int(255 * alpha * 0.35),), outline=color + (int(255 * alpha),), width=width)
    for k in range(8):
        d.line([(C, C), pol(r_long, 45 * k)], fill=color + (int(255 * alpha * 0.8),), width=max(2, width // 2))
    return im


def gems(r, size):
    im = layer(); d = ImageDraw.Draw(im)
    for ang, col in zip(ANGLES, FACET):
        cx, cy = pol(r, ang)
        d.ellipse((cx - size * 1.45, cy - size * 1.45, cx + size * 1.45, cy + size * 1.45), fill=GOLD + (255,), outline=(120, 90, 30, 255), width=5)
        g = [pol(r + size, ang), pol(r, ang + math.degrees(size / r)), pol(r - size, ang), pol(r, ang - math.degrees(size / r))]
        c = BEAM[5] if col == FACET[5] else col
        d.polygon(g, fill=c + (255,), outline=mix(c, (255, 255, 255), 0.6) + (255,), width=3)
    return im


def sparkles(rng, count, r0, r1):
    im = layer(); d = ImageDraw.Draw(im)
    for _ in range(count):
        k = rng.randrange(8); rr = rng.uniform(r0, r1); a = ANGLES[k] + rng.uniform(-2, 2)
        x, y = pol(rr, a); s = rng.uniform(8, 18)
        c = mix(BEAM[k], (255, 255, 255), 0.7) + (255,)
        d.line([(x - s, y), (x + s, y)], fill=c, width=3); d.line([(x, y - s), (x, y + s)], fill=c, width=3)
    return im.filter(ImageFilter.GaussianBlur(1.5))


def dust(rng, count, r0, r1, color, alpha):
    im = layer(); d = ImageDraw.Draw(im)
    for _ in range(count):
        x, y = pol(rng.uniform(r0, r1), rng.uniform(0, 360)); s = rng.uniform(2, 6)
        d.ellipse((x - s, y - s, x + s, y + s), fill=color + (int(255 * alpha * rng.uniform(0.4, 1)),))
    return im.filter(ImageFilter.GaussianBlur(2))


# ---------------------------------------------------------------- níveis
CR = R * 0.205         # raio do prisma
SHX, SHY = R * 0.07, R * 0.085   # sombra: para baixo e à direita (flutua)
RING_IN, RING_MID, RING_OUT = R * 0.30, R * 0.56, R * 0.84


def level(n):
    rng = random.Random(7)
    im = layer()
    if n == 1:
        im = over(im, rune_ring(RING_MID, R * 0.11, (92, 112, 170), 0.55, 24, random.Random(3), broken=0.3))
        im = add(im, stubs(0.32))
        im = add(im, radial(CR * 1.7, (110, 140, 220), 0.18))
        im = over(im, shadow(octagon(CR, ANGLES[0] - 22.5), SHX, SHY, 0.6, 22))
        im = over(im, shards(random.Random(11)))
        cr = crystal(CR, 0.10, 0.62, (120, 138, 178), (170, 182, 214))
        cr = over(cr, cracks(CR, random.Random(5), (24, 26, 44, 255), 9, (130, 160, 230, 200)))
        mask = layer(); ImageDraw.Draw(mask).polygon(octagon(CR, ANGLES[0] - 22.5), fill=(255,) * 4)
        cr.putalpha(Image.fromarray(np.minimum(np.asarray(cr)[..., 3], np.asarray(mask)[..., 3])))
        im = over(im, cr)
        im = add(im, dust(rng, 60, CR * 1.1, R * 0.5, (170, 190, 255), 0.5))
    if n == 2:
        im = over(im, rune_ring(RING_MID, R * 0.11, (140, 185, 255), 0.85, 24, random.Random(3), glow=10))
        im = over(im, rune_ring(RING_IN, R * 0.06, GOLD, 0.9, 16, random.Random(4)))
        im = add(im, beams(CR * 0.9, R * 0.95, 46, 18, 0.85))
        im = add(im, radial(CR * 2.2, (170, 200, 255), 0.30))
        im = over(im, shadow(octagon(CR, ANGLES[0] - 22.5), SHX, SHY, 0.5, 22))
        cr = crystal(CR, 0.32, 0.92, (175, 195, 235), (225, 232, 250))
        cr = over(cr, cracks(CR, random.Random(5), GOLD + (255,), 7, GOLD_LIGHT + (255,)))
        mask = layer(); ImageDraw.Draw(mask).polygon(octagon(CR, ANGLES[0] - 22.5), fill=(255,) * 4)
        cr.putalpha(Image.fromarray(np.minimum(np.asarray(cr)[..., 3], np.asarray(mask)[..., 3])))
        im = over(im, cr)
    if n == 3:
        im = over(im, star8(R * 0.70, R * 0.25, GOLD, 0.55, 6))
        im = over(im, rune_ring(RING_OUT, R * 0.12, GOLD, 0.95, 32, random.Random(2), glow=8))
        im = over(im, rune_ring(RING_MID, R * 0.11, (160, 200, 255), 0.95, 24, random.Random(3), glow=12))
        im = over(im, rune_ring(RING_IN, R * 0.06, GOLD_LIGHT, 1.0, 16, random.Random(4), glow=6))
        im = add(im, beams(CR * 0.9, R * 0.95, 64, 26, 1.0))
        im = add(im, sparkles(rng, 40, CR * 1.3, R * 0.9))
        im = over(im, gems(RING_OUT, R * 0.035))
        halo = layer(); ImageDraw.Draw(halo).ellipse((C - CR * 1.45, C - CR * 1.45, C + CR * 1.45, C + CR * 1.45), outline=GOLD + (255,), width=int(CR * 0.10))
        im = add(im, halo.filter(ImageFilter.GaussianBlur(26)))
        im = over(im, halo.filter(ImageFilter.GaussianBlur(3)))
        thin = layer(); ImageDraw.Draw(thin).ellipse((C - CR * 1.62, C - CR * 1.62, C + CR * 1.62, C + CR * 1.62), outline=GOLD_LIGHT + (200,), width=6)
        im = over(im, thin)
        im = add(im, radial(CR * 2.4, GOLD_LIGHT, 0.22))
        im = over(im, shadow(octagon(CR, ANGLES[0] - 22.5), SHX, SHY, 0.4, 24))
        im = over(im, crystal(CR, 0.30, 1.0, (215, 225, 250), (255, 250, 230)))
    # recorta no círculo do core
    m = Image.new('L', (N, N), 0); ImageDraw.Draw(m).ellipse((2, 2, N - 2, N - 2), fill=255)
    im.putalpha(Image.fromarray(np.minimum(np.asarray(im)[..., 3], np.asarray(m))))
    return im.resize((SIZE, SIZE), Image.LANCZOS)


for n, name in ((1, 'axis_heart.core.png'), (2, 'axis_heart.core.lv2.png'), (3, 'axis_heart.core.lv3.png')):
    level(n).save(f'{OUT}/{name}')
    print('ok', name)
