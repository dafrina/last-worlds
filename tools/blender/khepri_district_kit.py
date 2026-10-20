"""Khepri district kit (docs/23 §5.3): pieces the refinery district needs that no kit has yet.

`khepri_processing_tower`, the district's landmark, after the Khepri facility sheet item 01 (heavy
refinery tower, art/concepts/facility-sheets/khepri.jpg): a dominant armoured processing tower
(rust armour, cream panels, a hot orange slot, stepped crown), two tall stacks with lamp tips, four
cream storage towers with dark domes, looping large pipework, a control bunker and a grated ramp on a
hazard-edged plinth. Contract (src/world/settlement-modules.ts): footprint 3 x 3, top 3.5, skirt to
-0.05, large-pipe sockets (centreline 0.35, docs/14) at the middle of each face, ending in half
flanges on the footprint edge so district pipes join without gaps.

Same construction as khepri_infra.py (its HS builder, paints, AO/wear/dust vertex-colour bake, the
khepri_infra / khepri_light materials and box UVs), so the runtime infra material draws it alike.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/khepri_district_kit.py)" -- \\
        --glb "$(wslpath -w public/assets/khepri/district-kit.glb)" [--preview "$(wslpath -w art/khepri-district/preview.png)"]
"""
import argparse, math, os, random, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import khepri_infra as infra  # noqa: E402
from khepri_infra import HS, pipe_run, vents, SINK  # noqa: E402

SEED = 'khepri-district-kit-v1'
PIECES = {'khepri_processing_tower': dict(foot=(3.0, 3.0), top=3.5, budget=9000)}
PIPE_R, PIPE_Z = .16, .35   # docs/14 large pipe: diameter 0.32, centreline 0.35


def storage_tower(hs, x, y, r, h, rng):
    """A cream storage tower: ochre band, steel stiffeners, dark dome, a ladder and a top lamp."""
    hs.cyl((x, y, .12), (0, 0, 1), r, h, 16, 0.0, 'ivory', cap0=False, cap1=False)
    hs.dome((x, y, .12 + h), (0, 0, 1), r, r * .45, 16, 'graphite', bands=2)
    for z, paint, t in ((.3, 'steel', .05), (h * .55, 'ochre', .12), (h * .82, 'steel', .05)):
        hs.cyl((x, y, .12 + z), (0, 0, 1), r + .025, t, 16, 0.0, paint, cap0=False)
    hs.box((x + r + .03, y, .12 + h * .5), (.05, .12, h * .9), .01, 'graphite_dk', bottom=True)   # ladder spine
    hs.light((x, y, .12 + h + r * .45 - .01), r=.035, h=.05)


def build_tower(rng):
    hs = HS(rng)
    # Plinth: chamfered graphite slab on the full 3 x 3 footprint, hazard chevrons along the front edge.
    slab = [(-1.5, -1.5), (1.5, -1.5), (1.5, 1.5), (-1.5, 1.5)]
    hs.prism([(x * .985, y * .985) for x, y in slab], SINK, .12, .05, 'graphite_dk')
    for k in range(10):
        hs.decal((-1.3 + k * .29, -1.38, .1205), (.13, .11), 'ochre', rot=.6)
    # The processing tower: graphite frame, rust armour faces, cream panels, a hot slot, bands and a crown.
    cx, cy, w = .15, .22, 1.18
    hs.box((cx, cy, 1.5), (w, w, 2.76), .06, 'graphite', bottom=False)
    for z0, z1 in ((.35, 1.55), (1.7, 2.7)):
        zc, zh = (z0 + z1) / 2, z1 - z0
        hs.box((cx, cy - w / 2 - .03, zc), (w * .86, .06, zh), .02, 'rust', bottom=True)          # front armour
        hs.box((cx - w / 2 - .03, cy, zc), (.06, w * .86, zh), .02, 'rust', bottom=True)          # left armour
        hs.box((cx + w / 2 + .03, cy, zc), (.06, w * .86, zh), .02, 'ivory', bottom=True)         # right panels
    hs.box((cx, cy - w / 2 - .07, 1.52), (.16, .03, 2.0), .0, 'graphite_dk', bottom=True)        # slot frame
    hs.box((cx, cy - w / 2 - .085, 1.52), (.08, .02, 1.84), .0, 'lamp', mat=1, bottom=True)      # the hot slot
    for z in (1.62, 2.78):
        hs.cyl((cx, cy, z), (0, 0, 1), w * .78, .07, 8, 0.0, 'steel', cap0=False, rot=math.pi / 8)
    for k, (dx, dz) in enumerate(((-.36, .7), (.36, .7), (-.36, 2.25), (.36, 2.25))):
        hs.box((cx + dx, cy - w / 2 - .065, dz), (.12, .03, .05), .0, 'lamp', mat=1, bottom=True)
    hs.box((cx, cy, 2.98), (w * .92, w * .92, .16), .04, 'graphite_dk')                             # crown
    hs.box((cx, cy, 3.12), (w * .62, w * .62, .14), .03, 'rust')
    hs.box((cx, cy, 3.23), (w * .34, w * .34, .1), .02, 'graphite')
    vents(hs, cx - .4, cx + .4, cy + w / 2 + .03, 2.86, 3.02, 5, .03)
    # Two tall stacks behind-left with rust bands; their lamps top out at exactly 3.5.
    for (sx, sy, h) in ((-.48, .95, 3.31), (-.18, 1.12, 3.06)):
        hs.cyl((sx, sy, .12), (0, 0, 1), .1, h - .12, 10, 0.0, 'graphite', r1=.075, cap0=False, cap1=False)
        for z in (.9, 1.8, h - .3):
            hs.cyl((sx, sy, z), (0, 0, 1), .1 - (z - .12) * .008 + .012, .05, 10, 0.0, 'rust', cap0=False)
        hs.cyl((sx, sy, h), (0, 0, 1), .06, .07, 8, 0.0, 'graphite_dk', cap0=False)
        top = 3.5 if h > 3.2 else h + .14
        hs.cyl((sx, sy, h + .07), (0, 0, 1), .045, top - h - .07, 8, .01, 'lamp', mat=1, cap0=False)
    # Storage towers round the core.
    storage_tower(hs, -.88, -.62, .4, 1.7, rng)
    storage_tower(hs, 1.03, -.82, .34, 1.25, rng)
    storage_tower(hs, -.98, .78, .3, 2.15, rng)
    storage_tower(hs, 1.05, 1.0, .27, 1.0, rng)
    # Large looping pipework between the towers and the core.
    pipe_run(hs, [(-.88, -.2, 1.2), (-.88, -.05, 1.2), (cx - w / 2 - .05, -.05, 1.2)], .1, 'steel')
    pipe_run(hs, [(1.03, -.46, .95), (1.03, -.2, .95), (cx + w / 2 + .06, -.2, .95)], .09, 'rust')
    pipe_run(hs, [(-.98, .46, .75), (-.98, .3, .75), (-.55, .3, .75), (-.55, .3, 1.9), (cx - w / 2 - .05, .3, 1.9)], .08, 'steel')
    pipe_run(hs, [(1.05, .72, .6), (1.05, .5, .6), (cx + w / 2 + .06, .5, .6)], .08, 'steel')
    # Socket stubs: one large pipe per face, from the plant to a half flange on the footprint edge.
    for (a, b) in (((0, -.98), (0, -1.5)), ((0, .88), (0, 1.5)), ((-.6, 0), (-1.5, 0)), ((.78, 0), (1.5, 0))):
        x0, y0 = a
        x1, y1 = b
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy)
        axis = (dx / length, dy / length, 0)
        hs.cyl((x0, y0, PIPE_Z), axis, PIPE_R, length - .06, 12, 0.0, 'steel', cap0=False, cap1=False)
        hs.cyl((x1 - axis[0] * .06, y1 - axis[1] * .06, PIPE_Z), axis, PIPE_R + .035, .06, 12, .01, 'graphite_dk', cap0=False)
        hs.box((x0 + dx * .45, y0 + dy * .45, .2), (.16, .16, .16), .0, 'graphite_dk')          # stand
        hs.cyl((x0 + dx * .7, y0 + dy * .7, PIPE_Z + PIPE_R), (0, 0, 1), .05, .1, 8, .01, 'rust', cap0=False)  # valve
    # Control bunker at the front right, a grated ramp up to the core, and corner work lights.
    hs.box((.78, -1.12, .36), (.7, .44, .48), .05, 'ivory')
    hs.box((.78, -1.35, .42), (.46, .03, .08), .0, 'visor', bottom=True)
    hs.box((.45, -1.12, .42), (.04, .26, .3), .0, 'ochre', bottom=True)
    hs.box((.78, -1.1, .62), (.4, .26, .07), .02, 'graphite_dk')
    for k in range(6):
        hs.box((cx, -1.2 + k * .1, .14 + k * .035), (.5, .09, .03), .0, 'steel', bottom=True)
    for (x, y) in ((-1.38, -1.38), (1.38, 1.38), (-1.38, 1.38)):
        hs.box((x, y, .3), (.08, .08, .36), .01, 'graphite_dk')
        hs.light((x, y, .5), r=.035, h=.05)
    return hs


def check(name, hs):
    rule = PIECES[name]
    x0, x1, y0, y1, z0, z1 = hs.bounds()
    fx, fy = rule['foot']
    problems = []
    if hs.tris() > rule['budget']:
        problems.append('tris %d > %d' % (hs.tris(), rule['budget']))
    if max(-x0, x1) > fx / 2 + 1e-5 or max(-y0, y1) > fy / 2 + 1e-5:
        problems.append('footprint [%.3f,%.3f]x[%.3f,%.3f] exceeds +-%.2f' % (x0, x1, y0, y1, fx / 2))
    if abs(z0 - SINK) > 1e-6:
        problems.append('base %.4f' % z0)
    if abs(z1 - rule['top']) > 1e-6:
        problems.append('top %.4f != %.2f' % (z1, rule['top']))
    print('DISTRICT %s tris=%d x=[%+.3f,%+.3f] z=[%+.3f,%+.3f] y=[%+.3f,%+.3f] %s'
          % (name, hs.tris(), x0, x1, y0, y1, z0, z1, 'OK' if not problems else 'FAIL ' + ', '.join(problems)))
    return problems


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser(prog='khepri_district_kit.py')
    ap.add_argument('--glb', required=True)
    ap.add_argument('--preview', default=None)
    args = ap.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = infra.make_materials()
    pieces = [('khepri_processing_tower', build_tower(random.Random(SEED + ':tower')), .9)]
    problems = [p for name, hs, _ in pieces for p in check(name, hs)]
    if problems:
        raise SystemExit('District kit contract violations: ' + '; '.join(problems))
    objs = [infra.make_object(name, hs, mats, ao) for name, hs, ao in pieces]
    os.makedirs(os.path.dirname(args.glb), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.glb, check_existing=False, export_format='GLB',
        export_copyright='Last Worlds - original procedural geometry (tools/blender/khepri_district_kit.py)',
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
        export_image_format='NONE', export_vertex_color='ACTIVE', export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True, export_attributes=False, export_cameras=False,
        export_lights=False, export_animations=False, export_skins=False, export_morph=False, export_yup=True,
        export_apply=False, export_extras=False, use_selection=False)
    print('DISTRICT exported %s (%d bytes)' % (args.glb, os.path.getsize(args.glb)))
    if args.preview:
        import boss_remodel as br
        sc = bpy.context.scene
        out = os.path.dirname(args.preview)
        os.makedirs(out, exist_ok=True)
        tiles = []
        for view in ('game', 'front', 'side', 'top'):
            p = os.path.join(out, '_%s.png' % view)
            br.render_view(sc, view, (0, 0, 1.6), 4.6, p, 520, objs)
            tiles.append(p)
        br.compose([tiles[:2], tiles[2:]], args.preview)
        print('DISTRICT preview', args.preview)


if __name__ == '__main__':
    main()
