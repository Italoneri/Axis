# Render ortografico de cima (estilo render_topdown.py) com modos especificos do Arquivo.
# uso: python -I render_archive.py -- <blend> <out.png> <res> <modo> [arg]
import bpy, sys, math, mathutils, random
argv = sys.argv[sys.argv.index('--')+1:]
blend, out, res, mode = argv[0], argv[1], int(argv[2]), argv[3]
extra = argv[4] if len(argv) > 4 else ''
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o, do_unlink=True)
random.seed(int(extra) if extra.isdigit() else 7)
meshes = lambda: [o for o in sc.objects if o.type == 'MESH']

def bbox(o):
    bpy.context.view_layer.update()
    return [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]

if mode == 'books_stack':
    # livros deitados empilhados, levemente desalinhados
    names = sorted(o.name for o in meshes())
    pick = random.sample(names, 5)
    z = 0
    for o in list(meshes()):
        if o.name not in pick: bpy.data.objects.remove(o, do_unlink=True)
    for n in pick:
        o = sc.objects[n]
        th = o.dimensions.x
        o.rotation_euler = (0, math.radians(90), math.radians(random.uniform(-14, 14) + (90 if random.random() < .3 else 0)))
        bb = bbox(o); cx = sum(p.x for p in bb)/8; cy = sum(p.y for p in bb)/8; mz = min(p.z for p in bb)
        o.location.x -= cx + random.uniform(-.012, .012); o.location.y -= cy + random.uniform(-.012, .012); o.location.z += z - mz
        z += th
elif mode == 'books_row':
    pass  # em pe, vistos de cima: lombadas/topos das paginas
elif mode == 'drawer_open':
    for o in meshes():
        if o.name.endswith(('drawer02',)): o.location.y -= 0.26
elif mode == 'pick':
    for o in list(meshes()):
        if not o.name.endswith(extra): bpy.data.objects.remove(o, do_unlink=True)

# chamas brilhando
for m in bpy.data.materials:
    if 'flame' in m.name.lower() and m.use_nodes:
        b = m.node_tree.nodes.get('Principled BSDF')
        if b:
            b.inputs['Emission Color'].default_value = (1, .62, .22, 1); b.inputs['Emission Strength'].default_value = 20

ms = meshes(); bpy.context.view_layer.update()
pts = [p for o in ms for p in bbox(o)]
mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
c = (mn + mx) / 2; size = max(mx.x - mn.x, mx.y - mn.y) * 1.06
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = size; cam.location = (c.x, c.y, mx.z + 10); cam.data.clip_end = 100; sc.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(35), math.radians(-25), 0)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.35, 0.4, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.render.film_transparent = True
ax, ay = mx.x - mn.x, mx.y - mn.y
sc.render.resolution_x = res if ax >= ay else max(8, int(res * ax / ay))
sc.render.resolution_y = res if ay >= ax else max(8, int(res * ay / ax))
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('SIZE_M', round(ax, 3), round(ay, 3))
