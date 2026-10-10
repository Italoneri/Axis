"""Aplica uma arte em arco (outer ou middle) nos espaços indicados do mapa, para conferir encaixe e rotação.
Uso: python3 -I preview_no_mapa.py <layout.json> <base_mapa_1600.jpg> <arte.png> <saida.jpg> <slot_id> [slot_id ...]
A arte deve estar no molde do tipo do slot (768 px de largura, borda externa no topo)."""
import json, math, sys
from PIL import Image, ImageChops
LAY, BASE, ART, OUT, *IDS = sys.argv[1:]
L = json.load(open(LAY)); base = Image.open(BASE).convert('RGBA'); S = base.width
art0 = Image.open(ART).convert('RGBA')
for sid in IDS:
    sl = next(x for x in L['slots'] if x['id'] == sid); a = sl['arc']
    ri, ro = a['innerRadius'], a['outerRadius']; half = (a['endAngle'] - a['startAngle']) / 2; ang = (a['startAngle'] + a['endAngle']) / 2
    w = 2 * ro * math.sin(math.radians(half)); k = S * w / art0.width       # px do mapa por px da arte
    art = art0.resize((round(art0.width * k), round(art0.height * k)), Image.LANCZOS)
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.alpha_composite(art, (int(S / 2 - art.width / 2), int(S / 2 - ro * S)))   # topo da arte = borda externa no norte
    base.alpha_composite(layer.rotate(-ang, center=(S / 2, S / 2), resample=Image.BICUBIC))
base.convert('RGB').save(OUT, quality=90)
