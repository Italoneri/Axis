# render ortográfico de cima; se o objeto estiver "em pé" (Z é a maior dimensão) deita-o (rot X 90°)
import bpy, sys, math, mathutils
blend, out, res, mode = sys.argv[-4], sys.argv[-3], int(sys.argv[-2]), sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o, do_unlink=True)
sc.render.use_compositing=False; sc.render.use_sequencer=False
meshes = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render]
def bbox():
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
    mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx
mn, mx = bbox(); d = mx - mn
print('BBOX0', tuple(round(v,3) for v in d))
if mode.startswith('lay') and d.z > max(d.x, d.y):
    piv = bpy.data.objects.new('piv', None); sc.collection.objects.link(piv)
    piv.location = (mn + mx) / 2
    bpy.context.view_layer.update()
    tops = [o for o in sc.objects if o.parent is None and o is not piv]
    for o in tops:
        mw = o.matrix_world.copy(); o.parent = piv; o.matrix_parent_inverse = piv.matrix_world.inverted()
    ry = {'lay':0,'layside':90,'layflip':180}[mode]
    piv.rotation_euler = (math.radians(90), math.radians(ry), 0)
    mn, mx = bbox(); d = mx - mn
    print('LAID', tuple(round(v,3) for v in d))
c = (mn + mx) / 2; size = max(d.x, d.y) * 1.06
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = size; cam.data.clip_start=0.01; cam.data.clip_end=1000
cam.location = (c.x, c.y, mx.z + 5); cam.rotation_euler = (0, 0, 0); sc.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(35), math.radians(-25), 0); sun.data.angle=math.radians(8)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.35, 0.4, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = False
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = res; sc.render.resolution_percentage=100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform='Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
