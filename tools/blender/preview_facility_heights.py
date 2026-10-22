"""Isolated Blender renders of the proposed height edits, not gameplay captures."""
from pathlib import Path
from math import radians
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/facility-height-previews'


def preview(world, module, title):
    OUT.mkdir(parents=True, exist_ok=True)
    name = f'Height preview - {world} {module}'
    scene = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    for ob in list(scene.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    source = bpy.data.scenes[f'Facility tower height - {world}'].objects[f'fk_{world}_{module}']
    for index in range(2):
        ob = source.copy()
        ob.data = source.data.copy()
        ob.name = f'{title} - {"Original" if index == 0 else "Taller"}'
        scene.collection.objects.link(ob)
        ob.location = ((index * 2 - 1) * 1.55, 0, 0)
        ob.rotation_euler.z = radians(-22)
        if index == 0:
            for vertex in ob.data.vertices:
                z = vertex.co.z
                if module == 'tower' and z > .14:
                    vertex.co.z = .14 + (z - .14) / 1.5
                elif module == 'hall_s' and z > .12:
                    vertex.co.z = .12 + (z - .12) / 1.7 if z <= 2.296 else z - .896
        ob.data.update()

    scene.render.engine = 'BLENDER_EEVEE'  # Verified with live operator before running.
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 950
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    world_data = bpy.data.worlds.new(name)
    world_data.use_nodes = True
    bg = next(n for n in world_data.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (.14, .17, .22, 1)
    bg.inputs['Strength'].default_value = .45
    scene.world = world_data

    ground_mat = bpy.data.materials.new(name + ' ground')
    ground_mat.use_nodes = True
    bsdf = next(n for n in ground_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (.022, .032, .049, 1)
    bsdf.inputs['Roughness'].default_value = .85
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.015))
    bpy.context.object.data.materials.append(ground_mat)

    target = Vector((0, 0, 1.9 if module == 'tower' else 1.3))
    camera_data = bpy.data.cameras.new(name)
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 9.1 if module == 'tower' else 7.2
    camera = bpy.data.objects.new(name + ' camera', camera_data)
    scene.collection.objects.link(camera)
    camera.location = target + Vector((0, -14, 7))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    for pos, power, size, color in [((-5,-6,9),1400,5,(1,.86,.72)),((5,-3,6),1100,5,(.65,.8,1)),((0,5,9),1800,4,(.65,.82,1))]:
        data = bpy.data.lights.new(name + ' softbox', type='AREA')
        data.energy, data.size, data.color = power, size, color
        ob = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(ob)
        ob.location = pos
        ob.rotation_euler = (target - ob.location).to_track_quat('-Z', 'Y').to_euler()

    text_mat = bpy.data.materials.new(name + ' label')
    text_mat.use_nodes = True
    bsdf = next(n for n in text_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (.8,.9,1,1)
    bsdf.inputs['Emission Color'].default_value = (.8,.9,1,1)
    bsdf.inputs['Emission Strength'].default_value = 1
    width = camera_data.ortho_scale
    height = width * scene.render.resolution_y / scene.render.resolution_x
    labels = [(title.upper(), 0, height * .42, .21), ('ORIGINAL', -1.55, -height * .4, .16), ('TALLER', 1.55, -height * .4, .16)]
    for label, x, y, size in labels:
        curve = bpy.data.curves.new(label, type='FONT')
        curve.body, curve.size, curve.align_x = label, size, 'CENTER'
        ob = bpy.data.objects.new(label, curve)
        scene.collection.objects.link(ob)
        ob.parent = camera
        ob.location = (x, y, -8)
        ob.data.materials.append(text_mat)
    bpy.context.view_layer.update()
    path = OUT / f'{world}-{module}.png'
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(str(path))
