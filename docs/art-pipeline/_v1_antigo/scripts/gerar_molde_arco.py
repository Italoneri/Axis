import json, math
from PIL import Image, ImageDraw
L = json.load(open('/mnt/user-data/outputs/layout.json'))
s = next(x for x in L['slots'] if x['type'] == 'outer')['arc']
ri, ro = s['innerRadius'], s['outerRadius']; half = (s['endAngle'] - s['startAngle']) / 2
W, H = 768, None
w = 2 * ro * math.sin(math.radians(half)); h = ro - ri * math.cos(math.radians(half))
H = round(W * h / w); sc = W / w
def P(r, a):  # a em graus relativo ao centro do slot (0 = norte); topo da imagem = muralha
    x = r * math.sin(math.radians(a)); y = r * math.cos(math.radians(a))
    return ((x + w / 2) * sc, (ro - y) * sc)
pts = [P(ro, a) for a in [ -half + i * (2*half) / 60 for i in range(61)]] + [P(ri, a) for a in [half - i * (2*half) / 60 for i in range(61)]]
mask = Image.new('L', (W, H), 0); ImageDraw.Draw(mask).polygon(pts, fill=255)
mask.save('/mnt/user-data/outputs/art-templates/outer_arc_mask.png')
guide = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(guide)
d.polygon(pts, fill=(60, 55, 70, 255), outline=(226, 184, 74, 255), width=3)
d.text((W/2 - 70, 12), 'MURALHA (topo)', fill=(226, 184, 74, 255))
d.text((W/2 - 80, H - 40), 'FRENTE -> centro da Axis', fill=(226, 184, 74, 255))
guide.save('/mnt/user-data/outputs/art-templates/outer_arc_guide.png')
print(W, H, round(w*2048), round(h*2048))
