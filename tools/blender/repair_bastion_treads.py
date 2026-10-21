"""Restore articulation in the approved v5 asset; run through live Blender MCP.

Extract the existing bevelled grouser bars, preserving their UVs and baked PBR atlas.
Keep one link template per belt; the renderer instances it around the original belt
profile. Nothing else is remodelled or rebaked. v5 remains available for rollback.
"""
from pathlib import Path
import bpy
import bmesh
import math
from mathutils import Vector

ROOT = Path(r'\\wsl.localhost\Ubuntu\home\davidfarina\Projects\alien-skies')


def run():
    scene = bpy.data.scenes.get('Bastion Tread Repair') or bpy.data.scenes.new('Bastion Tread Repair')
    bpy.context.window.scene = scene
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/assets/khepri/bastion-9-v5-remodel.glb'))
    hull = next(o for o in scene.objects if o.name == 'bastion_hull')
    bm = bmesh.new()
    bm.from_mesh(hull.data)
    source = bm.faces.layers.int.new('source_face')
    for i, face in enumerate(bm.faces):
        face[source] = i
    # Only the analysis copy is welded: UV seams on the delivered mesh are retained.
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
    remaining = set(bm.verts)
    belts = {(side, belt): [] for side in (-1, 1) for belt in (0, 1)}
    while remaining:
        todo, group = [remaining.pop()], []
        while todo:
            vertex = todo.pop()
            group.append(vertex)
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in remaining:
                    remaining.remove(other)
                    todo.append(other)
        lo = Vector(tuple(min(v.co[i] for v in group) for i in range(3)))
        hi = Vector(tuple(max(v.co[i] for v in group) for i in range(3)))
        if len(group) != 24:
            continue
        for (side, belt), parts in belts.items():
            x0, x1 = [(1.75, 2.63), (2.83, 3.75)][belt]
            if side < 0:
                x0, x1 = -x1, -x0
            if abs(lo.x - x0) < .0001 and abs(hi.x - x1) < .0001 and hi.z < 2.5:
                faces = {f[source] for v in group for f in v.link_faces}
                parts.append((faces, (lo + hi) / 2))
    bm.free()
    assert all(len(parts) == 23 for parts in belts.values()), {k: len(v) for k, v in belts.items()}

    def retain_faces(mesh, indices):
        work = bmesh.new()
        work.from_mesh(mesh)
        work.faces.ensure_lookup_table()
        bmesh.ops.delete(work, geom=[f for i, f in enumerate(work.faces) if i not in indices], context='FACES')
        bmesh.ops.delete(work, geom=[v for v in work.verts if not v.link_faces], context='VERTS')
        work.to_mesh(mesh)
        work.free()
        mesh.update()

    removed = set()
    for (side, belt), parts in belts.items():
        # A straight upper-run link gives local x=width, y=travel, z=normal.
        faces, center = next((faces, center) for faces, center in parts if abs(center.z - 2.37) < .001)
        mesh = hull.data.copy()
        retain_faces(mesh, faces)
        for vertex in mesh.vertices:
            vertex.co -= center
        name = f'bastion_track_link_{"left" if side < 0 else "right"}_{belt}'
        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
        obj.location = center
        # Exported in game coordinates, independent of glTF's node axis conversion.
        obj['track_x'] = center.x
        obj['track_front'] = -2.4
        obj['track_rear'] = 3.15
        obj['track_radius'] = 1.15
        obj['track_segments'] = 8
        obj['track_pitch'] = .36
        obj['track_offset'] = .07
        for indices, _ in parts:
            removed.update(indices)
    retain_faces(hull.data, set(range(len(hull.data.polygons))) - removed)
    for obj in scene.objects:
        if obj.name.startswith(('bastion_sprocket_', 'bastion_idler_')):
            obj['rolling_radius'] = 1.15
    marker = bpy.data.objects.new('bastion_treads_v6', None)
    scene.collection.objects.link(marker)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        obj.select_set(True)
    formats = [item.identifier for item in bpy.ops.export_scene.gltf.get_rna_type().properties['export_format'].enum_items]
    # Blender 5.2's dynamic enum reports no RNA items. Its live operator validation
    # reports ('GLB', 'GLTF_SEPARATE'); the verified binary identifier is GLB.
    fmt = next((value for value in formats if value == 'GLB'), 'GLB')
    out = ROOT / 'public/assets/khepri/bastion-9-v6-treads.glb'
    bpy.ops.export_scene.gltf(filepath=str(out), export_format=fmt, use_selection=True, use_active_scene=True,
                              export_extras=True, export_animations=False)
    print(f'Preserved hull/atlas; extracted {sum(map(len, belts.values()))} links into four instancing templates: {out}')


if __name__ == '__main__':
    run()
