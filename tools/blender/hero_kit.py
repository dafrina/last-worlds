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
BUDGET = dict(hull=760, wings=640, engines=1400, cockpit=360)


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
# A cheap rusty salvage fighter (docs/04): patched metal, faded ivory paint, exposed but serviceable engines. Each slot's
# three designs differ in silhouette and paint, not just detail (user, 28 October: "make them a bit more different").
# Anchors, shared by every design: the hit region at the origin; the cockpit seat on the hull's spine (0, 0.14, 0.1);
# wing roots under the hull at x +-0.15, the wings drawing the outer silhouette out to x +-0.6 ... 0.72; the engines at
# the hull's flanks and tail (twin at x +-0.29, quad at x +-0.24 and +-0.37, or one central thruster behind the tail),
# their plumes at the nozzles. About 1.25 to 1.45 wide: still the smallest chassis.
SCRAPPER_PLUMES = dict(a=[(-.29, -.52, 0), (.29, -.52, 0)],
                       b=[(-.24, -.48, -.03), (-.37, -.48, .02), (.24, -.48, -.03), (.37, -.48, .02)],
                       c=[(0, -.8, 0), (-.24, -.43, 0), (.24, -.43, 0)])


def bent_tip(h, outline, x0, droop, paint):
    """A wingtip panel whose outer part bends down by `droop` per unit of span past x0."""
    lo = [h.v((x, y, -.03 - (abs(x) - x0) * droop)) for x, y in outline]
    hi = [h.v((x, y, .015 - (abs(x) - x0) * droop)) for x, y in outline]
    h.face(tuple(hi), paint, 'main', PLATE, outward=(0, 0, 1))
    h.face(tuple(reversed(lo)), paint, 'main', PLATE, outward=(0, 0, -1))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        a, b = outline[i], outline[j]
        h.face((lo[i], lo[j], hi[j], hi[i]), paint, 'edge', PLATE, outward=(b[1] - a[1], a[0] - b[0], 0))


def scrapper_hull(h, design):
    if design == 'a':   # The tug: the original hexagonal rust fuselage, an ivory stripe.
        solid(h, [(-.14, -.47), (.14, -.47), (.19, .24), (.1, .6), (-.1, .6), (-.19, .24)], -.09, .18, 'rust')
        solid(h, [(-.1, .15), (.1, .15), (.105, .39), (0, .61), (-.105, .39)], .09, .035, 'ivory')
        h.box((-.08, -.3, .105), (.09, .16, .028), .005, 'ivory', PLATE)
        h.box((.07, .44, .15), (.055, .07, .015), .003, 'rust', PLATE)
    elif design == 'b':   # The flat-iron: a broad, short, flat delta in ivory, rust edges, a black nose cap.
        solid(h, [(-.31, -.46), (.31, -.46), (.24, .0), (.08, .5), (-.08, .5), (-.24, .0)], -.07, .13, 'ivory')
        solid(h, [(-.08, .5), (.08, .5), (.03, .62), (-.03, .62)], -.05, .09, 'black', FRAME)
        for side in (-1, 1):
            solid(h, mirrored([(.2, -.46), (.31, -.46), (.24, -.05), (.17, -.05)], side), .06, .02, 'rust')
        for x, y in ((-.12, -.25), (.14, -.1)):
            h.box((x, y, .07), (.09, .1, .015), .003, 'ochre', PLATE)
    else:   # The needle: a long dark-metal keel ending in a forked twin-prong nose, lamps at the prong tips.
        solid(h, [(-.1, -.5), (.1, -.5), (.12, .25), (.06, .42), (-.06, .42), (-.12, .25)], -.07, .15, 'metal', FRAME)
        for x in (-.06, .06):
            h.box((x, .6, .0), (.045, .38, .07), .006, 'black', FRAME)
            h.box((x, .795, .0), (.03, .012, .04), .0, 'lamp', GLOW)
        solid(h, [(-.07, -.2), (.07, -.2), (.06, .3), (-.06, .3)], .08, .02, 'rust')
        for y in (-.36, -.2):
            h.box((0, y, .02), (.26, .03, .14), .004, 'rust', PLATE)


def scrapper_wings(h, design):
    for side in (-1, 1):
        if design == 'a':   # Swept salvage wings with a gun rail and patch plates (the original), rooted under the hull.
            solid(h, mirrored([(.15, .22), (.66, -.14), (.62, -.31), (.15, -.2)], side), -.04, .055, 'ivory')
            h.box((side * .46, -.24, .0), (.26, .06, .06), .008, 'metal', FRAME)
            for x, y in ((side * .44, -.1), (side * .56, -.2)):
                h.box((x, y, .025), (.025, .025, .012), .002, 'metal', FRAME)
            solid(h, mirrored([(.5, -.05), (.6, -.15), (.58, -.22), (.48, -.12)], side), .015, .012, 'rust')
        elif design == 'b':   # The biplane: two stacked straight panels, the upper one forward, joined by end plates.
            solid(h, mirrored([(.15, .0), (.58, -.02), (.58, -.22), (.15, -.22)], side), -.09, .04, 'ivory')
            solid(h, mirrored([(.15, .1), (.62, .08), (.62, -.12), (.15, -.12)], side), .1, .04, 'ivory')
            solid(h, mirrored([(.58, .1), (.64, .1), (.64, -.24), (.58, -.24)], side), -.1, .26, 'rust')
            for y in (-.15, .02):
                h.box((side * .4, y, .04), (.02, .02, .2), .002, 'metal', FRAME)
        else:   # The gull: big forward-swept wings, tips bent down, a gun pod on each tip.
            solid(h, mirrored([(.15, -.08), (.6, .24), (.68, .14), (.15, -.3)], side), -.03, .045, 'ivory')
            bent_tip(h, mirrored([(.6, .24), (.72, .17), (.76, .04), (.68, .14)], side), .6, .9, 'rust')
            h.cyl((side * .7, .38, -.08), (0, -1, 0), .035, .34, 8, .004, 'metal', mat=FRAME, smooth=True)
            h.box((side * .7, .39, -.08), (.03, .012, .03), .0, 'lamp', GLOW)
            h.box((side * .4, -.02, .02), (.12, .05, .012), .002, 'metal', FRAME)


def scrapper_engines(h, design):
    if design == 'c':   # One big central thruster jutting out behind the tail, small side vents.
        h.cyl((0, -.3, .0), (0, -1, 0), .15, .46, 16, .012, 'ochre', mat=PLATE, smooth=True)
        for y in (-.42, -.6):
            h.cyl((0, y, .0), (0, -1, 0), .155, .025, 16, .003, 'metal', mat=FRAME, smooth=True)
        h.cyl((0, -.76, .0), (0, -1, 0), .13, .04, 16, .004, 'black', mat=FRAME, smooth=True)
        h.cyl((0, -.8, .0), (0, -1, 0), .1, .012, 12, .0, 'lamp', mat=GLOW, smooth=True)
        for side in (-1, 1):
            h.box((side * .24, -.36, .0), (.08, .14, .06), .006, 'rust', PLATE)
            h.box((side * .24, -.43, .0), (.06, .012, .03), .0, 'lamp', GLOW)
        return
    for side in (-1, 1):
        if design == 'a':   # Twin barrels: long rusted cylinders with clamp rings and a black nozzle.
            x = side * .29
            h.cyl((x, .15, .0), (0, -1, 0), .092, .59, 16, .009, 'rust', mat=PLATE, smooth=True)
            h.cyl((x, -.435, .0), (0, -1, 0), .095, .07, 16, .006, 'black', mat=FRAME, smooth=True)
            h.cyl((x, -.505, .0), (0, -1, 0), .06, .012, 12, .0, 'lamp', mat=GLOW, smooth=True)
            for y in (-.27, -.06, .13):
                h.cyl((x, y, .0), (0, 1, 0), .096, .022, 16, .003, 'metal', mat=FRAME, smooth=True)
        else:   # Quad: two small thrusters a side, staggered in height, on a shared clamp.
            for x, z in ((side * .24, -.03), (side * .37, .02)):
                h.cyl((x, .05, z), (0, -1, 0), .065, .48, 12, .006, 'rust', mat=PLATE, smooth=True)
                h.cyl((x, -.43, z), (0, -1, 0), .068, .04, 12, .004, 'black', mat=FRAME, smooth=True)
                h.cyl((x, -.47, z), (0, -1, 0), .045, .01, 10, .0, 'lamp', mat=GLOW, smooth=True)
            h.box((side * .305, -.1, .0), (.2, .06, .1), .006, 'metal', FRAME)


def scrapper_cockpit(h, design):
    if design == 'a':   # A dark glass slab in a metal frame (the original).
        solid(h, [(-.102, .02), (.102, .02), (.078, .27), (-.078, .27)], .11, .07, 'black', FRAME)
        for x in (-.1, .1):
            h.box((x, .14, .15), (.012, .26, .012), .002, 'metal', FRAME)
    elif design == 'b':   # A tall bubble canopy with a radar mast behind it.
        h.cyl((0, .16, .1), (0, 0, 1), .12, .03, 14, .004, 'metal', mat=FRAME, smooth=True)
        h.cyl((0, .16, .13), (0, 0, 1), .11, .12, 14, .01, 'black', mat=FRAME, r1=.04, smooth=True)
        h.box((0, -.02, .22), (.02, .02, .24), .002, 'metal', FRAME)
        h.cyl((0, -.02, .34), (0, 1, .4), .07, .015, 10, .002, 'ivory', mat=PLATE, smooth=True)
    else:   # An armoured hood with twin glowing visor slits and a small turret ring on top.
        solid(h, [(-.12, .0), (.12, .0), (.1, .3), (-.1, .3)], .1, .09, 'ochre')
        for z in (.15, .175):
            h.box((0, .29, z), (.15, .02, .012), .0, 'lamp', GLOW)
        h.cyl((0, .1, .19), (0, 0, 1), .065, .04, 12, .004, 'metal', mat=FRAME, smooth=True)
        h.box((0, .2, .21), (.02, .2, .02), .002, 'black', FRAME)


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
            nodes[ob.name] = dict(budget=BUDGET[slot], mats=names, x=(-.8, .8), z=(-.85, .85))
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
