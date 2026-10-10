"""Gera o molde (máscara + guia) de cada tipo de slot em arco a partir do layout.json.
Uso: python3 -I gerar_moldes.py <layout.json> <pasta_saida>
Saída: <tipo>_arc_mask.png e <tipo>_arc_guide.png, 768 px de largura, borda externa no topo."""
import json, math, sys
from PIL import Image, ImageDraw
L = json.load(open(sys.argv[1])); OUT = sys.argv[2]
done = set()
for s in L['slots']:
    if s.get('shape') != 'arc' or s['type'] in done: continue
    done.add(s['type']); a = s['arc']; ri, ro = a['innerRadius'], a['outerRadius']; half = (a['endAngle'] - a['startAngle']) / 2
    W = 768; w = 2 * ro * math.sin(math.radians(half)); h = ro - ri * math.cos(math.radians(half)); H = round(W * h / w); sc = W / w
    P = lambda r, t: ((w / 2 + r * math.sin(math.radians(t))) * sc, (ro - r * math.cos(math.radians(t))) * sc)
    pts = [P(ro, -half + i * 2 * half / 90) for i in range(91)] + [P(ri, half - i * 2 * half / 90) for i in range(91)]
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(pts, fill=255); m.save(f"{OUT}/{s['type']}_arc_mask.png")
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
    d.polygon(pts, fill=(60, 55, 70, 255), outline=(226, 184, 74, 255), width=3)
    d.text((W / 2 - 60, 10), 'EXTERNO (topo)', fill=(226, 184, 74, 255)); d.text((W / 2 - 80, H - 30), 'FRENTE -> centro', fill=(226, 184, 74, 255))
    g.save(f"{OUT}/{s['type']}_arc_guide.png")
    print(s['type'], W, H, f'sc={sc:.1f}px/unid', f'r {ri}-{ro}', f'abertura ±{half}°')
