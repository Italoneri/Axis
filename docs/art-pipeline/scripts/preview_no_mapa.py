import json, math, sys
from PIL import Image
SP, ART, OUT = sys.argv[1:4]
L = json.load(open('/mnt/user-data/outputs/layout.json'))
arc = next(x for x in L['slots'] if x['type'] == 'outer')['arc']
ro, half = arc['outerRadius'], (arc['endAngle'] - arc['startAngle']) / 2
w = 2 * ro * math.sin(math.radians(half)); W = 768; sc = W / w
m = Image.open('/mnt/user-data/outputs/art-templates/outer_arc_mask.png').convert('L')
art = Image.open(ART).convert('RGBA'); a = art.split()[3]
from PIL import ImageChops
art.putalpha(ImageChops.multiply(a, m))
base = Image.open(f'{SP}/prism.jpg').convert('RGBA'); S = 1600; k = S / sc
A = art.resize((round(art.width * k), round(art.height * k)), Image.LANCZOS)
for sid in ('outer_1', 'outer_7', 'outer_13'):
    ang = next(x for x in L['slots'] if x['id'] == sid)['angle']
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); layer.alpha_composite(A, (int(S/2 - W*k/2), int(S/2 - ro*sc*k)))
    base.alpha_composite(layer.rotate(-ang, center=(S/2, S/2), resample=Image.BICUBIC))
base.convert('RGB').save(OUT, quality=90)
