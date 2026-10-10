# render ortográfico de cima, com opções: --hide nome1,nome2  --only nome  --rotx graus (deita objetos)
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
blend, out, res = argv[0], argv[1], int(argv[2])
opts = dict(zip(argv[3::2], argv[4::2]))
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
sc.render.use_compositing = False; sc.render.use_sequencer = False
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT') or o.type not in ('MESH', 'EMPTY'): bpy.data.objects.remove(o, do_unlink=True)
hide = [h for h in opts.get('--hide', '').split(',') if h]
only = opts.get('--only')
for o in list(sc.objects):
    if o.type == 'MESH' and (any(h in o.name for h in hide) or (only and only not in o.name)):
        bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in sc.objects if o.type == 'MESH']
if '--rotx' in opts:
    for o in meshes:
        if o.parent is None: o.rotation_euler.rotate_axis('X', math.radians(float(opts['--rotx'])))
    bpy.context.view_layer.update()
for o in meshes: o.hide_render = False
pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c = (mn + mx) / 2; size = max(mx.x - mn.x, mx.y - mn.y) * 1.04
print('BBOX', mn, mx, 'SIZE', size)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = size; cam.data.clip_end = 1000
cam.location = (c.x, c.y, mx.z + 10); cam.rotation_euler = (0, 0, 0); sc.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(35), math.radians(-25), 0)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.35, 0.4, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = False
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = res; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
