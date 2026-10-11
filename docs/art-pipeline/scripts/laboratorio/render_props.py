import bpy, sys, math, mathutils, random
blend, out, res, mode = sys.argv[-4], sys.argv[-3], int(sys.argv[-2]), sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
def mat(name, col, metal=0.0, rough=0.6, emit=None, strength=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = strength
    return m
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o, do_unlink=True)
random.seed(4)
if mode == 'books':
    keep = ['book01', 'book13', 'book05', 'book17']
    covers = [(0.09, 0.006, 0.005), (0.004, 0.03, 0.015), (0.008, 0.01, 0.06), (0.05, 0.02, 0.006)]
    paper = mat('paper', (0.78, 0.70, 0.52), rough=0.8)
    z = 0
    for o in list(sc.objects):
        if o.type != 'MESH': continue
        k = next((i for i, s in enumerate(keep) if o.name.endswith(s)), None)
        if k is None: bpy.data.objects.remove(o, do_unlink=True); continue
        cov = mat(f'cov{k}', covers[k], rough=0.55)
        for i, s in enumerate(o.material_slots):
            s.material = cov if 'cover' in s.material.name else paper
        th = o.dimensions.x
        o.rotation_euler = (0, math.radians(90), math.radians(random.uniform(-25, 25)))
        bpy.context.view_layer.update()
        bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        cx = sum(p.x for p in bb) / 8; cy = sum(p.y for p in bb) / 8; mz = min(p.z for p in bb)
        o.location.x -= cx + random.uniform(-0.01, 0.01); o.location.y -= cy; o.location.z += z - mz
        z += th
elif mode == 'candle':
    brass = mat('brass', (0.85, 0.6, 0.28), metal=1, rough=0.3)
    wax = mat('wax', (0.92, 0.88, 0.78), rough=0.5)
    flame = mat('flame', (1, 0.7, 0.3), emit=(1, 0.65, 0.25), strength=25)
    for o in list(sc.objects):
        if o.type != 'MESH': continue
        if not o.name.endswith(sys.argv[-5]): bpy.data.objects.remove(o, do_unlink=True); continue
        for s in o.material_slots:
            n = s.material.name
            s.material = flame if 'flame' in n else wax if 'candles' in n else brass
meshes = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()
pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
c = (mn + mx) / 2; size = max(mx.x - mn.x, mx.y - mn.y) * 1.06
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = size; cam.location = (c.x, c.y, mx.z + 10); sc.camera = cam
cam.data.clip_end = 100
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(35), math.radians(-25), 0)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.35, 0.4, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = res
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('SIZE', size)
