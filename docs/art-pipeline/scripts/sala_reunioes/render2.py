import bpy, sys, math, mathutils
blend, out, res = sys.argv[-3], sys.argv[-2], int(sys.argv[-1])
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o, do_unlink=True)
sc.render.use_compositing=False; sc.render.use_sequencer=False
try: sc.render.use_border=False
except: pass
meshes = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render]
pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c = (mn + mx) / 2; size = max(mx.x - mn.x, mx.y - mn.y) * 1.08
print('BBOX', mn, mx, 'SIZE', size)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = size; cam.data.clip_start=0.01; cam.data.clip_end=1000
cam.location = (c.x, c.y, mx.z + 5); cam.rotation_euler = (0, 0, 0); sc.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(35), math.radians(-25), 0); sun.data.angle=math.radians(8)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.35, 0.4, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64; sc.cycles.use_denoising = False
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = res; sc.render.resolution_percentage=100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform='Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
