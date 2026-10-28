"""Modular hero ships for Last Worlds (docs/31-hero-ships.md): per chassis, four part slots (hull, wings, engines,
cockpit) in three designs each, mixed and matched within that chassis.

Every design of a chassis is authored in place around that chassis's shared anchors (cockpit seat, wing roots, engine
mounts, the hit-region centre at the origin), so any hull, wings, engines and cockpit of one chassis assemble without
runtime transforms: the game merges the chosen part nodes into one mesh. Parts are cosmetic only (docs/04 section 9):
the central hit region, handling and gun origins never change.

Node names: hero_<chassis>_<slot>_<design>, slot in hull | wings | engines | cockpit, design a | b | c. Each engines
design carries its own exhaust empties hero_<chassis>_engines_<design>_plume_<i> (the engine glow sockets).

Conventions as the Scrapper before it (tools/blender/cinematic_assets.py): Blender x right, y forward (the nose, glTF
-z, up the screen), z up; 1 unit = 1 game unit before the game's HERO_SCALE; centred on the hit region.

    R=/home/davidfarina/Projects/alien-skies-ships
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/hero_kit.py)" -- --chassis scrapper \\
        --glb "$(wslpath -w $R/public/assets/shared/hero-scrapper-kit.glb)" --preview-dir "$(wslpath -w $R/art/hero-kit)"
"""

import argparse
import math
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import vesper_common as vc  # noqa: E402

PLATE, FRAME, GLOW = 0, 1, 2
PAINTS = dict(vc.PAINTS, ivory=('#c8c9bd', .2, '#ece7d5'), rust=('#78442f', .25, '#b17852'),
              ochre=('#88673e', .25, '#baa17d'), metal=('#454e58', .35, '#9baab4'), black=('#10171e', .15, '#455564'))
SLOTS = ('hull', 'wings', 'engines', 'cockpit')
# Paint roles for recolouring (user, 28 October: "we should be able to recolor at some point too"): each face's role is
# stored in its vertex colour's alpha, the baked colour keeping the default scheme and all the shading and wear. A
# recolour tints a role's faces at runtime, keeping their baked lightness: primary paint, secondary paint; metal,
# glass and anything else stay as baked (alpha 1). Glow is its own material and tints separately.
ROLE_ALPHA = dict(ivory=.75, rust=.5, ochre=.5)
DESIGNS = ('a', 'b', 'c')
# A whole ship stays near 2,500 triangles; the Scrapper's original barrel engines (about 1,400) are the heaviest part.
BUDGET = dict(hull=760, wings=640, engines=1400, cockpit=320)


def solid(h, points, z, height, paint, mat=PLATE):
    """A chamfered-free planar plate in Blender x/y, `height` thick from z (the Scrapper's hard-surface plates)."""
    lo = [h.v((x, y, z)) for x, y in points]
    hi = [h.v((x, y, z + height)) for x, y in points]
    h.face(tuple(hi), paint, 'main', mat, outward=(0, 0, 1))
    h.face(tuple(reversed(lo)), paint, 'main', mat, outward=(0, 0, -1))
    for i in range(len(points)):
        j = (i + 1) % len(points)
        a, b = points[i], points[j]
        h.face((lo[i], lo[j], hi[j], hi[i]), paint, 'edge', mat, outward=(b[1] - a[1], a[0] - b[0], 0))


def mirrored(points, side):
    """A right-hand outline mirrored to `side`, its winding kept outward."""
    pts = [(side * x, y) for x, y in points]
    return pts if side > 0 else list(reversed(pts))


# ============================================================================= Scrapper (starter, basic)
# A cheap rusty salvage fighter (docs/04): patched metal, faded ivory paint, exposed but serviceable twin engines.
# Anchors: hit region at the origin; cockpit seat (0, 0.24, 0.10); engine mounts hugging the fuselage at x +-0.29, from
# y 0.15 back to the nozzles at y -0.5 (plumes there); wing roots under the engine pods at x +-0.28, the wings reaching
# out to x +-0.62 ... 0.72, so each wing design draws the outer silhouette (the first layout hid the wings behind
# engines at x +-0.38). About 1.25 wide: still the smallest chassis.
SCRAPPER_PLUMES = dict(a=[(-.29, -.52, 0), (.29, -.52, 0)], b=[(-.29, -.46, 0), (.29, -.46, 0)], c=[(-.29, -.5, -.01), (.29, -.5, -.01)])


def scrapper_hull(h, design):
    if design == 'a':   # The tug: the original hexagonal fuselage, an ivory stripe.
        solid(h, [(-.14, -.47), (.14, -.47), (.19, .24), (.1, .6), (-.1, .6), (-.19, .24)], -.09, .18, 'rust')
        solid(h, [(-.1, .15), (.1, .15), (.105, .39), (0, .61), (-.105, .39)], .09, .035, 'ivory')
        h.box((-.08, -.3, .105), (.09, .16, .028), .005, 'ivory', PLATE)
        h.box((.07, .44, .15), (.055, .07, .015), .003, 'rust', PLATE)
    elif design == 'b':   # The ram: a blunt, broad armoured hull with a black plough over the nose, ochre patches.
        solid(h, [(-.18, -.46), (.18, -.46), (.22, .18), (.17, .5), (-.17, .5), (-.22, .18)], -.1, .2, 'rust')
        solid(h, [(-.17, .5), (.17, .5), (.12, .64), (-.12, .64)], -.08, .15, 'black', FRAME)
        for x, y in ((-.12, .3), (.13, -.1), (-.1, -.32)):
            h.box((x, y, .1), (.1, .12, .02), .004, 'ochre', PLATE)
        for y in (-.4, -.2, 0.0):
            h.box((0, y, .11), (.3, .02, .015), .002, 'metal', FRAME)
    else:   # The spine: a narrow keel with exposed frame ribs and fuel tanks slung under it.
        solid(h, [(-.11, -.5), (.11, -.5), (.13, .3), (.05, .66), (-.05, .66), (-.13, .3)], -.07, .15, 'rust')
        solid(h, [(-.06, .3), (.06, .3), (.03, .62), (-.03, .62)], .08, .02, 'ivory')
        for y in (-.36, -.2, -.04, .12):
            h.box((0, y, .02), (.32, .035, .16), .004, 'metal', FRAME)
        for x in (-.07, .07):
            h.cyl((x, .1, -.1), (0, -1, 0), .05, .5, 10, .006, 'ochre', PLATE)


def scrapper_wings(h, design):
    for side in (-1, 1):
        if design == 'a':   # Swept salvage wings with a gun rail and patch plates (the original).
            solid(h, mirrored([(.27, .2), (.66, -.14), (.62, -.31), (.27, -.18)], side), -.04, .055, 'ivory')
            h.box((side * .46, -.24, .0), (.26, .06, .06), .008, 'metal', FRAME)
            for x, y in ((side * .44, -.1), (side * .56, -.2)):
                h.box((x, y, .025), (.025, .025, .012), .002, 'metal', FRAME)
            solid(h, mirrored([(.5, -.05), (.6, -.15), (.58, -.22), (.48, -.12)], side), .015, .012, 'rust')
        elif design == 'b':   # Straight box wings with vertical end plates, cross-braced.
            solid(h, mirrored([(.27, .1), (.64, .08), (.64, -.22), (.27, -.24)], side), -.035, .05, 'ivory')
            solid(h, mirrored([(.63, .12), (.68, .12), (.68, -.26), (.63, -.26)], side), -.09, .22, 'rust')
            for y in (-.16, .02):
                h.box((side * .46, y, .022), (.34, .02, .012), .002, 'metal', FRAME)
            h.box((side * .5, -.08, .025), (.08, .08, .01), .002, 'ochre', PLATE)
        else:   # Forward-swept gull wings, their tips bent down.
            solid(h, mirrored([(.27, -.05), (.56, .22), (.62, .13), (.27, -.24)], side), -.03, .045, 'ivory')
            tip = mirrored([(.56, .22), (.68, .16), (.72, .03), (.62, .13)], side)
            lo = [h.v((x, y, -.03 - (abs(x) - .56) * .9)) for x, y in tip]
            hi = [h.v((x, y, .015 - (abs(x) - .56) * .9)) for x, y in tip]
            h.face(tuple(hi), 'rust', 'main', PLATE, outward=(0, 0, 1))
            h.face(tuple(reversed(lo)), 'rust', 'main', PLATE, outward=(0, 0, -1))
            for i in range(4):
                j = (i + 1) % 4
                a, b = tip[i], tip[j]
                h.face((lo[i], lo[j], hi[j], hi[i]), 'rust', 'edge', PLATE, outward=(b[1] - a[1], a[0] - b[0], 0))
            h.box((side * .44, -.02, .02), (.12, .05, .012), .002, 'metal', FRAME)


def scrapper_engines(h, design):
    for side in (-1, 1):
        x = side * .29
        if design == 'a':   # Twin barrels: long rusted cylinders with clamp rings and a black nozzle.
            h.cyl((x, .15, .0), (0, -1, 0), .092, .59, 16, .009, 'rust', mat=PLATE, smooth=True)
            h.cyl((x, -.435, .0), (0, -1, 0), .095, .07, 16, .006, 'black', mat=FRAME, smooth=True)
            h.cyl((x, -.505, .0), (0, -1, 0), .06, .012, 12, .0, 'lamp', mat=GLOW, smooth=True)
            for y in (-.27, -.06, .13):
                h.cyl((x, y, .0), (0, 1, 0), .096, .022, 16, .003, 'metal', mat=FRAME, smooth=True)
        elif design == 'b':   # Turbo cans: short fat pods with a wide intake ring and a big glowing nozzle.
            h.cyl((x, .06, .0), (0, -1, 0), .115, .44, 16, .012, 'ochre', mat=PLATE, smooth=True)
            h.cyl((x, .1, .0), (0, 1, 0), .125, .05, 16, .004, 'metal', mat=FRAME, smooth=True)
            h.cyl((x, -.38, .0), (0, -1, 0), .105, .06, 16, .006, 'black', mat=FRAME, smooth=True)
            h.cyl((x, -.445, .0), (0, -1, 0), .08, .012, 12, .0, 'lamp', mat=GLOW, smooth=True)
        else:   # Ducted blocks: square exhaust ducts with twin glowing slots and a cooling fin on top.
            h.box((x, -.15, .0), (.17, .64, .16), .012, 'rust', PLATE)
            h.box((x, -.47, -.01), (.14, .04, .11), .006, 'black', FRAME)
            for dz in (-.035, .02):
                h.box((x, -.495, dz), (.1, .012, .025), .0, 'lamp', GLOW)
            h.box((x, -.12, .1), (.02, .36, .06), .003, 'metal', FRAME)


def scrapper_cockpit(h, design):
    if design == 'a':   # A dark glass slab in an ivory frame (the original).
        solid(h, [(-.102, .02), (.102, .02), (.078, .27), (-.078, .27)], .11, .07, 'black', FRAME)
        for x in (-.1, .1):
            h.box((x, .14, .15), (.012, .26, .012), .002, 'metal', FRAME)
    elif design == 'b':   # A bubble canopy on a metal ring.
        h.cyl((0, .14, .1), (0, 0, 1), .12, .03, 14, .004, 'metal', mat=FRAME, smooth=True)
        h.cyl((0, .14, .13), (0, 0, 1), .11, .07, 14, .01, 'black', mat=FRAME, r1=.06, smooth=True)
        h.box((0, .14, .21), (.02, .2, .012), .002, 'metal', FRAME)
    else:   # An armoured hood with a narrow glowing visor slit.
        solid(h, [(-.12, .0), (.12, .0), (.1, .3), (-.1, .3)], .1, .09, 'ochre')
        h.box((0, .29, .155), (.15, .02, .022), .0, 'lamp', GLOW)
        h.box((0, .12, .2), (.03, .24, .015), .003, 'metal', FRAME)


CHASSIS = dict(scrapper=dict(hull=scrapper_hull, wings=scrapper_wings, engines=scrapper_engines, cockpit=scrapper_cockpit,
                             plumes=SCRAPPER_PLUMES, mats=('scrapper_plate', 'scrapper_frame', 'scrapper_glow')))


# ============================================================================= build, verify, preview
def build_part(chassis, slot, design, mats):
    h = vc.HS(random.Random('hero-kit:%s:%s:%s' % (chassis, slot, design)))
    CHASSIS[chassis][slot](h, design)
    vc.triangulate_nonplanar(h)
    name = 'hero_%s_%s_%s' % (chassis, slot, design)
    colours = vc.bake(h, name, dict(glow={GLOW}, paints=PAINTS, ao=.12, ground=None))
    corner = 0
    for f, paint in zip(h.faces, h.fpaint):
        a = ROLE_ALPHA.get(paint if isinstance(paint, str) else paint[0], 1.0)
        for c in range(corner, corner + len(f)):
            colours[c] = (colours[c][0], colours[c][1], colours[c][2], a)
        corner += len(f)
    ob = vc.make_object(name, h, mats, (0.0, 0.0, 0.0), colours)
    print('HKIT %-28s tris=%4d' % (name, h.tris()))
    return ob


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser(prog='hero_kit.py')
    ap.add_argument('--chassis', default='scrapper', choices=sorted(CHASSIS))
    ap.add_argument('--glb', required=True)
    ap.add_argument('--preview-dir', default=None)
    args = ap.parse_args(argv)
    spec = CHASSIS[args.chassis]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    names = spec['mats']
    mats = [vc.make_material(names[0], 'vc', rough=.43, metal=.35), vc.make_material(names[1], 'vc', rough=.29, metal=.82),
            vc.make_material(names[2], 'glow', colour='#78f9f1', emission=1)]  # (the game sets the glow's strength)
    parts, nodes = {}, {}
    for slot in SLOTS:
        for design in DESIGNS:
            ob = build_part(args.chassis, slot, design, mats)
            parts[(slot, design)] = ob
            nodes[ob.name] = dict(budget=BUDGET[slot], mats=names, x=(-.75, .75), z=(-.8, .8))
    for design in DESIGNS:
        for i, p in enumerate(spec['plumes'][design]):
            name = 'hero_%s_engines_%s_plume_%d' % (args.chassis, design, i)
            vc.make_empty(name, (p[0], p[2], -p[1]))
            nodes[name] = dict(empty=True, t=(p[0], p[2], -p[1]))
    vc.publish(args.glb, 'hero_kit.py', dict(materials=names, nodes=nodes, max_bytes=600_000), 'HKIT')
    if args.preview_dir:
        render_previews(args, parts, mats)


def render_previews(args, parts, mats):
    """Nine assembled ships (the three all-one-design presets and six seeded mixes) from the game camera and from above."""
    import boss_remodel as br
    scene = bpy.context.scene
    rng = random.Random('hero-kit-preview')
    combos = [{s: d for s in SLOTS} for d in DESIGNS] + [{s: rng.choice(DESIGNS) for s in SLOTS} for _ in range(6)]
    shown = []
    for k, combo in enumerate(combos):
        ox, oy = (k % 3 - 1) * 1.6, -(k // 3 - 1) * 1.7
        for slot, design in combo.items():
            src = parts[(slot, design)]
            ob = src.copy()
            scene.collection.objects.link(ob)
            ob.location = (ox, oy, 0)
            shown.append(ob)
        print('HKIT combo %d: %s' % (k, ' '.join('%s-%s' % (s, combo[s]) for s in SLOTS)))
    for src in parts.values():
        src.hide_render = True
    os.makedirs(args.preview_dir, exist_ok=True)
    for view in ('game', 'top'):
        br.render_view(scene, view, (0, 0, 0), 5.4, os.path.join(args.preview_dir, '%s-%s.png' % (args.chassis, view)), res=1200,
                       objects=shown, light='desert')


if __name__ == '__main__':
    main()
