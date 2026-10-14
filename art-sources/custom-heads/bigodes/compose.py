import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from heads import render, NORTH, WEST, SOUTH
from PIL import Image, ImageOps
HEADS = os.environ.get('HEADS','/home/claude/Axis/vendor/lpc-generator/spritesheets/head/heads/human/male_plump')
src, dst = sys.argv[1], sys.argv[2]
drawings = [render(NORTH), render(WEST), render(SOUTH), ImageOps.mirror(render(WEST))]
for f in sorted(os.listdir(src)):
    if not f.endswith('.png') or f.startswith('preview'): continue
    body = Image.open(os.path.join(src,f)).convert('RGBA')
    hp = os.path.join(HEADS, f)
    if not os.path.exists(hp): print('skip', f); continue
    head = Image.open(hp).convert('RGBA')
    if head.height != body.height: print('size mismatch', f, head.size, body.size); continue
    out = body.copy()
    rows = body.height // 64
    for r in range(rows):
        d = r % 4
        for c in range(head.width // 64):
            bb = head.crop((c*64, r*64, c*64+64, r*64+64)).getbbox()
            if not bb: continue
            img = drawings[d]
            x0, y0, x1, y1 = bb
            if d in (0, 2): x = (x0 + x1)//2 - img.width//2
            elif d == 1: x = x1 - img.width + 1
            else: x = x0 - 1
            y = y1 - img.height + 1
            out.alpha_composite(img, (c*64 + x, r*64 + y))
    out.save(os.path.join(dst, f))
    print('ok', f)
