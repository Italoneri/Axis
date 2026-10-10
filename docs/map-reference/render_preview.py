import json, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
T = sys.argv[1]; LAY = sys.argv[2]; OUT = sys.argv[3]
S = 1600
L = json.load(open(LAY))
Image.MAX_IMAGE_PIXELS = None

def load(p, size=None):
    im = Image.open(p).convert('RGB')
    if size: im = im.resize(size, Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255

# ---- texturas
tiles = load(f'{T}/tiles/Tiles075_2K-JPG_Color.jpg', (800, 800))
wall = load(f'{T}/wall/stonewall_23-2K/stonewall_23_basecolor-2K.png', (700, 700))
marble = load(f'{T}/marble/elegant_black_and_gold_marble_effect_background_with_gold_glitter_2605.jpg', (S, S))

# máscara do dourado: matiz amarela, saturada e clara
r, g, b = marble[..., 0], marble[..., 1], marble[..., 2]
mx, mn = marble.max(-1), marble.min(-1)
sat = (mx - mn) / (mx + 1e-6)
gold_mask = np.clip((sat - 0.25) / 0.25, 0, 1) * np.clip((mx - 0.30) / 0.3, 0, 1) * (r > b + 0.08)
gold_mask = np.asarray(Image.fromarray((gold_mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255
# mais veios: soma o original com cópias giradas/espelhadas
gm = Image.fromarray((gold_mask*255).astype(np.uint8))
extra = np.maximum(np.asarray(gm.rotate(120).transpose(Image.FLIP_LEFT_RIGHT)), np.asarray(gm.rotate(240)))
gold_mask = np.maximum(gold_mask, extra.astype(np.float32)/255*0.9)
# cor dourada com brilho variável (glitter)
noise = np.random.default_rng(1).random((S, S)).astype(np.float32)
gold_col = (np.array([0.83, 0.64, 0.24]) * (0.75 + 0.5*noise[..., None])).astype(np.float32)

yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
cx = cy = S / 2
dx, dy = xx - cx, yy - cy
rad = np.hypot(dx, dy) / S          # normalizado
ang = (np.degrees(np.arctan2(dx, -dy)) + 360) % 360  # 0 = norte, horário

# chão: ladrilhos de mármore negro repetidos
floor = np.tile(tiles, (2, 2, 1))[:S, :S]
floor = floor * 1.05
# veios dourados por cima (screen + substituição pela cor do brilho)
m = gold_mask[..., None] * 0.95
floor = floor * (1 - m) + gold_col * m

img = np.full((S, S, 3), [0.17, 0.165, 0.17], np.float32)

wall_out = L['wall']['outerRadius']; wall_in = wall_out - L['wall']['thickness']
disc = L['innerDisc']['radius']; core = L['core']['radius']

inside = rad <= wall_in
img[inside] = floor[inside]

# muralha: textura de pedra mapeada em coordenadas polares (pedras acompanham a curva)
th = wall_out - wall_in
u = ((np.radians(ang) * (wall_in + th / 2) * S) / 1.0) % wall.shape[1]
v = ((rad - wall_in) / th * 120) % wall.shape[0]
wtex = wall[v.astype(int) % wall.shape[0], u.astype(int) % wall.shape[1]]
gray = wtex.mean(-1, keepdims=True)
wtex = gray * np.array([1.02, 0.98, 0.93]) * 0.85 + wtex * 0.15   # dessatura, puxa para cinza quente
ring = (rad > wall_in) & (rad <= wall_out)
img[ring] = wtex[ring]
# veios dourados também na muralha (mais sutis)
mw = (gold_mask * ring)[..., None] * 0.85
img = img * (1 - mw) + gold_col * mw

# disco azul: o mármore tingido de azul, veios mantidos dourados
blue = marble.mean(-1, keepdims=True) * np.array([0.55, 0.62, 1.35]) * 1.25 + np.array([0.06, 0.07, 0.16])
blue = blue * (1 - gold_mask[..., None]) + gold_col * gold_mask[..., None]
dmask = rad <= disc
img[dmask] = blue[dmask]

# sombra suave nas bordas internas (profundidade)
shade = np.clip(1 - np.clip((rad - (wall_in - 0.03)) / 0.03, 0, 1) * 0.35 * (rad <= wall_in), 0, 1)
img *= shade[..., None]

out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
d = ImageDraw.Draw(out, 'RGBA')
GOLD = (222, 180, 70, 255)
def circ(rn, w, col=GOLD):
    rr = rn * S; d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=col, width=w)
for rn, w in [(wall_out, 4), (wall_in, 4), (disc, 5), (core, 5)]: circ(rn, w)

def P(rn, a): a = np.radians(a); return (cx + rn * S * np.sin(a), cy - rn * S * np.cos(a))
# entradas
for a in (L['entrances']['angles'] if len(sys.argv) < 5 else []):
    hw = L['entrances']['width'] / 2 / wall_in * 180 / np.pi * 1.0
    pts = [P(wall_out + .004, a - hw), P(wall_out + .004, a + hw), P(wall_in - .004, a + hw), P(wall_in - .004, a - hw)]
    d.polygon(pts, fill=(40, 36, 42, 255), outline=GOLD)
# fundações (pré-visualização)
for s in L['slots']:
    if s['shape'] == 'arc':
        a1, a2 = s['arc']['startAngle'], s['arc']['endAngle']; ri, ro = s['arc']['innerRadius'], s['arc']['outerRadius']
        arc = [P(ro, t) for t in np.linspace(a1, a2, 30)] + [P(ri, t) for t in np.linspace(a2, a1, 30)]
        d.polygon(arc, fill=(20, 18, 24, 120), outline=(222, 180, 70, 200))
    elif s['type'] == 'middle':
        x, y = s['x'] * S, s['y'] * S; h = s['size'] * S / 2
        d.rectangle([x - h, y - h, x + h, y + h], fill=(20, 18, 24, 120), outline=(222, 180, 70, 200), width=2)
out.save(OUT, quality=92)
print('ok')
