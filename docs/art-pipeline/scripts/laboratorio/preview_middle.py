import json, sys
from PIL import Image
LAY, BASE, ART, OUT = sys.argv[1:5]
L = json.load(open(LAY)); base = Image.open(BASE).convert('RGBA'); S = base.width
art = Image.open(ART).convert('RGBA')
for sid in ('mid_1', 'mid_2', 'mid_4', 'mid_7'):
    sl = next(x for x in L['slots'] if x['id'] == sid)
    n = round(sl['size'] * S); a = art.resize((n, n), Image.LANCZOS).rotate(-sl['angle'], expand=True, resample=Image.BICUBIC)
    base.alpha_composite(a, (round(sl['x'] * S - a.width / 2), round(sl['y'] * S - a.height / 2)))
base.convert('RGB').save(OUT, quality=90)
crop = base.crop((330, 330, 1270, 1270)).resize((940, 940)); crop.convert('RGB').save(OUT.replace('.jpg', '_zoom.jpg'), quality=90)
