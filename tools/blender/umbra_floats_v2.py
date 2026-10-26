"""Run build() through live Blender MCP. Replace only the three floating-rock undersides.

Keeps the approved flat fractured tops, palette, pivot/size contract and old kit for rollback.
Three broad cleaved wedges replace the hanging thicket of needles. No other kit models rebuilt.
"""
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import umbra_kit as uk
import vesper_common as vc
from nacre_kit import glow_material

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def floating(variant):
    name = f'umb_float_{variant}'
    original = uk.build_float(random.Random(f'{uk.SEED}:{name}'), variant)
    # Preserve the original normalization/centering and top outline, including its luminous fracture sheet.
    uk.centre_xy(original)
    bottom = min(v[2] for v in original.verts)
    for v in original.verts:
        v[2] -= bottom
    uk.fit_top(original, 1.0)
    hs = vc.HS(random.Random(f'umbra-float-v2:{variant}'))
    outline = None
    for face, paint, tag, mat in zip(original.faces, original.fpaint, original.ftag, original.fmat):
        if min(original.verts[v][2] for v in face) < .98:
            continue
        points = [original.verts[v] for v in face]
        hs.face(tuple(hs.v(p) for p in points), paint, tag, mat, outward=(0, 0, 1))
        if mat == uk.GLOW and len(points) > 8:
            outline = [(p[0] / .995, p[1] / .995) for p in points]
    assert outline is not None
    # Two oblique cleavages split a broad hanging body into three/four substantial shards.
    cuts = [((-.19, 0), (.22, 1)), ((.23, 0), (-.25, 1))]
    pieces = uk.split_polygon(outline, cuts)
    for k, plate in enumerate(pieces):
        cx = sum(p[0] for p in plate) / len(plate)
        cy = sum(p[1] for p in plate) / len(plate)
        upper, lower = [], []
        for x, y in plate:
            # Tiny gaps give dark cleavage lines; upper rim remains tucked behind the unchanged top sheet.
            u, v = x * .995, y * .995
            upper.append(hs.v((u, v, .989)))
            bx, by = x * .66 + cx * .12 + (.06 if variant == 1 else -.03), y * .67 + cy * .12
            z = .12 + .14 * (k % 2) + .23 * bx - .18 * by
            lower.append(hs.v((bx, by, max(.035, z))))
        for i in range(len(plate)):
            j = (i + 1) % len(plate)
            mx, my = (plate[i][0] + plate[j][0]) / 2, (plate[i][1] + plate[j][1]) / 2
            hs.face((upper[i], upper[j], lower[j], lower[i]), ('obs', k), 'main', uk.OBS,
                    outward=(mx-cx, my-cy, -.15))
        # A slanted broken face, with a broad cutting edge rather than a single needle tip.
        hs.face(tuple(reversed(lower)), ('obs', k + 10), 'under', uk.OBS, outward=(0, 0, -1))
    # Keep exactly the existing base=0 / top=1 contract without moving any top vertex.
    lo = min(v[2] for v in hs.verts)
    for v in hs.verts:
        if v[2] < .98:
            v[2] = (v[2] - lo) * .989 / (.989 - lo)
    vc.triangulate_nonplanar(hs, tol=1e-6)
    return hs


def build():
    scene = bpy.data.scenes.get('Codex Umbra floating shards v2') or bpy.data.scenes.new('Codex Umbra floating shards v2')
    bpy.context.window.scene = scene
    owned = [obj for obj in scene.objects if obj.get('float_revision') == 2]
    if any(len(obj.users_scene) > 1 for obj in owned):
        raise RuntimeError('Generated float shared with another scene; refusing to remove it.')
    for obj in owned:
        bpy.data.objects.remove(obj, do_unlink=True)
    mats = [vc.make_material('umbra_float_v2_obsidian', 'vc', rough=.12),
            vc.make_material('umbra_float_v2_alloy', 'vc', rough=.2), glow_material('umbra_float_v2_glow')]
    objects = []
    for i in range(3):
        name = f'umb_float_{i}'
        hs = floating(i)
        cols = vc.bake(hs, name, dict(glow=set(), ao=.3, ground=None, colour_fn=uk.colour_fn_for(hs, name)))
        uk.gloss_alpha(hs, cols)
        obj = vc.make_object(name, hs, mats, (0, 0, 0), cols)
        obj['float_revision'] = 2
        objects.append(obj)
        print(name, 'triangles', hs.tris(), 'bounds', hs.bounds())
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path = os.path.join(ROOT, 'public', 'assets', 'umbra', 'floating-shards-v2.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, use_active_scene=True, export_apply=True,
                              export_animations=False, export_extras=True, export_vertex_color='ACTIVE')
    print('EXPORTED', path, os.path.getsize(path))
    return objects


if __name__ == '__main__':
    build()
