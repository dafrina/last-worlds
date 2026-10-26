"""Umbra cliff revision, 25 October 2026. Run build() through live Blender MCP.

Preserves the approved hills, existing scenes and cliff-kit.glb. Four real fractured wall sections,
large oblique facets, razor lips and dark cleavage seams; no smooth/rounded faces or tall column rhythm.
Same bounds/node contract and 650-triangle budget as the old kit. Export only this isolated scene.
"""
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import cliff_kit as ck
import umbra_kit as uk
import vesper_common as vc
import vesper_kit as vk
from nacre_kit import glow_material


def wall(rng, variant):
    hs = vc.HS(rng)
    # Wide facets, not a repeated bank of vertical needles. One asymmetric joint in the paired forms.
    divides = [(-1.05, .14, 1.05), (-1.05, -.36, 1.05), (-1.05, 1.05), (-1.05, .46, 1.05)][variant]
    for k, (a, b) in enumerate(zip(divides, divides[1:])):
        mid = (a + b) * .5
        lip = 1.0 if k == 0 else .91
        face = -.29 + (.10 if k == 1 else 0)
        yaw = (-18, 23, -26, 14)[variant]
        planes = [
            uk.face_plane(180, 85, (a + (.014 if k else 0), 0, .5)),
            uk.face_plane(0, 83, (b - (.014 if k < len(divides) - 2 else 0), 0, .5)),
            uk.face_plane(-90 + yaw, 82, (mid - (b-a)*.18, face, .52)),
            uk.face_plane(-90 - yaw * .75, 87, (mid + (b-a)*.23, face + .015, .5)),
            # A large, clean diagonal shoulder makes the rim read as broken glass from the game camera.
            uk.face_plane(90 + yaw, 21, (mid, .1, lip)),
            uk.face_plane(-90 + yaw * .5, 48, (mid, face + .03, lip - .08)),
        ]
        if variant in (1, 3):
            planes.append(uk.face_plane(-55, 68, (mid + .2, face + .06, .23)))
        fractures = [uk.frac(15 + variant * 24, 67, (mid, .04, .48), .025, .035, .014)]
        if variant == 2:
            fractures.append(uk.frac(-104, 86, (mid, -.15, .5), .018, .025, -.01))
        uk.fractured(hs, rng, planes, fractures, glow=(0,) if variant == 2 else (),
                     box=(a, b, ck.FRONT, ck.BACK, ck.BASE, 1.0), bottom=ck.BASE,
                     bevel_w=.009, bevel_front=.24)
    # A fractured fragment rests against the foot on two variants. Never a horizontal ledge repeated in rows.
    if variant in (0, 3):
        uk.cut_solid(hs, rng, [uk.face_plane(-90, 44, (.25, -.25, .22)),
                              uk.face_plane(15, 62, (.6, -.12, .17))],
                     box=(-.12, .71, -.35, .12, ck.BASE, .3), bottom=ck.BASE, bevel_w=.006)
    for v in hs.verts:
        v[0] = max(-ck.HALF_X, min(ck.HALF_X, v[0]))
        v[1] = max(ck.FRONT, min(ck.BACK, v[1]))
        v[2] = max(ck.BASE, v[2])
    vk.fit_top(hs, 1.0)
    vc.triangulate_nonplanar(hs, tol=1e-6)
    return hs


def build():
    scene = bpy.data.scenes.get('Codex Umbra cliffs v2') or bpy.data.scenes.new('Codex Umbra cliffs v2')
    bpy.context.window.scene = scene
    # A repeat export keeps stable node names without resetting anyone else's scene or clearing unrelated objects.
    owned = [obj for obj in scene.objects if obj.get('cliff_revision') == 2]
    if any(len(obj.users_scene) > 1 for obj in owned):
        raise RuntimeError('A generated cliff is shared with another scene; preserve that scene before rebuilding.')
    for obj in owned:
        bpy.data.objects.remove(obj, do_unlink=True)
    mats = [vc.make_material('umbra_v2_obsidian', 'vc', rough=.25, metal=0),
            vc.make_material('umbra_v2_alloy', 'vc', rough=.2, metal=0), glow_material('umbra_v2_glow')]
    objects = []
    for i in range(4):
        name = 'void_wall_%d' % i
        hs = wall(random.Random('umbra-cliffs-v2:%d' % i), i)
        problems = ck.check(name, hs)
        if problems:
            raise RuntimeError(problems)
        cols = vc.bake(hs, name, dict(glow=set(), ao=.35, ground=0.,
                       colour_fn=uk.colour_fn_for(hs, 'void_wall', reach=.2, rock=True), tile=('x', 2.0)))
        uk.gloss_alpha(hs, cols, broad_up=.6, broad=.3)
        obj = vc.make_object(name, hs, mats, (0, 0, 0), cols)
        # Export name cannot accidentally inherit a name from another user's scene.
        obj['cliff_revision'] = 2
        objects.append(obj)
        print(name, 'actual name', obj.name, 'triangles', hs.tris())
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path = os.path.join(ck.ROOT, 'public', 'assets', 'umbra', 'cliff-kit-v2.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, use_active_scene=True, export_apply=True,
                              export_animations=False, export_extras=True, export_vertex_color='ACTIVE')
    print('EXPORTED', path, os.path.getsize(path))
    return objects


if __name__ == '__main__':
    build()
