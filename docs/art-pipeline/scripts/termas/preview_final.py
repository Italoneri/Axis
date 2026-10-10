import json, math, sys
from PIL import Image, ImageDraw, ImageFont
PKG='/home/claude/pkg/axis-art-pipeline'; L=json.load(open(f'{PKG}/layout.json'))
arc=next(x for x in L['slots'] if x['type']=='outer')['arc']; ro=arc['outerRadius']; half=(arc['endAngle']-arc['startAngle'])/2
W=768; sc=W/(2*ro*math.sin(math.radians(half))); CX,CY=W/2,ro*sc
base=Image.open(f'{PKG}/base_mapa_1600.jpg').convert('RGBA'); S=base.width; k=S/sc
for lv,sid in ((1,'outer_1'),(2,'outer_7'),(3,'outer_13'),(3,'outer_4')):
    art=Image.open(f'/home/claude/out/final.png'); art=art.resize((round(W*k),round(art.height*k)),Image.LANCZOS)
    sl=next(x for x in L['slots'] if x['id']==sid); layer=Image.new('RGBA',(S,S),(0,0,0,0))
    layer.alpha_composite(art,(int(S/2-CX*k),int(S/2-CY*k))); base.alpha_composite(layer.rotate(-sl['angle'],center=(S/2,S/2),resample=Image.BICUBIC))
base.convert('RGB').save('/home/claude/out/termas_no_mapa.jpg',quality=92)
