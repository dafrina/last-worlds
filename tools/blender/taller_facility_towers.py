"""Height-only previews of the shipped facility kits, through live Blender MCP.

Keep the footprint, foundation, materials and UVs. Raise the tower above its .14-unit
base by 50%. Also raise Khepri's small machine hall walls by 70%, moving its
roof machinery up without stretching it. Other modules stay unchanged; v3
files remain the rollback. Preview approval is separate from deployment.
"""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]


def run():
    for world in ('khepri', 'vesper'):
        name = f'Facility tower height - {world}'
        scene = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        bpy.context.window.scene = scene
        for obj in list(scene.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.ops.import_scene.gltf(filepath=str(ROOT / f'public/assets/{world}/facility-kit-v3.glb'))
        tower = next(o for o in scene.objects if o.name == f'fk_{world}_tower')
        assert tower.type == 'MESH'
        before = max(v.co.z for v in tower.data.vertices)
        for vertex in tower.data.vertices:
            if vertex.co.z > .14:
                vertex.co.z = .14 + (vertex.co.z - .14) * 1.5
        tower.data.update()
        after = max(v.co.z for v in tower.data.vertices)
        if world == 'khepri':
            hall = next(o for o in scene.objects if o.name == 'fk_khepri_hall_s')
            for vertex in hall.data.vertices:
                z = vertex.co.z
                if z > .12:
                    # Keep the plinth; lengthen the walls and translate the roof intact.
                    vertex.co.z = z + min(z - .12, 1.28) * .7
            hall.data.update()
            print(f'Khepri machine hall top: {max(v.co.z for v in hall.data.vertices):.3f}')
        marker = bpy.data.objects.new('facility_tower_height_v4', None)
        marker['tower_height_before'] = before
        marker['tower_height_after'] = after
        scene.collection.objects.link(marker)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in scene.objects:
            obj.select_set(True)
        # GLB verified against the live 5.2 operator's dynamic export_format enum.
        out = ROOT / f'public/assets/{world}/facility-kit-v4-taller.glb'
        # Blender makes cross-scene names unique; keep the shipped marker name in each GLB.
        contract = next(o for o in scene.objects if o.name.startswith('facility_kit_v3'))
        prior_name = contract.name
        conflict = bpy.data.objects.get('facility_kit_v3')
        if conflict is not None and conflict != contract:
            conflict.name = 'facility_kit_v3_export_hold'
        contract.name = 'facility_kit_v3'
        try:
            bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                                      use_active_scene=True, export_extras=True, export_animations=False)
        finally:
            contract.name = prior_name
            if conflict is not None and conflict != contract:
                conflict.name = 'facility_kit_v3'
        print(f'{world}: {before:.3f} -> {after:.3f}; exported {out}')


if __name__ == '__main__':
    run()
