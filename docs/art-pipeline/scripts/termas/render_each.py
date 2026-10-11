# renderiza cada mesh (ou o conjunto) de um .blend, vista ortográfica de cima, fundo transparente
import bpy, sys, math, mathutils, os
blend, outdir, res, mode = sys.argv[-4], sys.argv[-3], int(sys.argv[-2]), sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in sc.objects if o.type == 'MESH']
print('MESHES', [m.name for m in meshes])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'; sc.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.data.angle = math.radians(8); sun.rotation_euler = (math.radians(35), math.radians(-25), 0)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.35, 0.4, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = False
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = res
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
groups = [[m] for m in meshes] if mode == 'each' else [meshes]
for i, g in enumerate(groups):
    for m in meshes: m.hide_render = m not in g
    pts = [o.matrix_world @ mathutils.Vector(c) for o in g for c in o.bound_box]
    mn = mathutils.Vector([min(p[k] for p in pts) for k in range(3)]); mx = mathutils.Vector([max(p[k] for p in pts) for k in range(3)])
    c = (mn + mx) / 2; cam.data.ortho_scale = max(mx.x - mn.x, mx.y - mn.y) * 1.08
    cam.location = (c.x, c.y, mx.z + 10); cam.rotation_euler = (0, 0, 0)
    name = g[0].name if mode == 'each' else 'all'
    sc.render.filepath = os.path.join(outdir, f'{i:02d}_{name}.png')
    print('SIZE', name, mx - mn)
    bpy.ops.render.render(write_still=True)
