"""HELION ARK v5: a clean remodel traced over the user's supplied starship GLB, made longer.

Masses come from boss_remodel.trace over art/source/approved-bosses/futuristic-starship-original.glb
at the v4 placement (x9.5). The shape follows the source; only the outriggers, which ended abruptly
at the back ("cut off", user, 20 October), now run on past the aft wing to a tapered stern at
y 5.85 instead of stopping at 3.9, so they flank the tower. Aft wing, turret platforms, tower and
the ceramic-white palette follow the source; the centre hull is chunkier and longer
(y -2.45..5.25, user request), its bow flanks carrying the launch-bay hatches.

Combat sockets are unchanged (src/content/ark.ts): radiators x = +-2.4 at s -0.5, bridge s 1.6,
target height 1.6; radiators and the bridge lens sit on the 55-degree camera ray through each.
Bay doors are the prow's flank plates and slide 0.9 outward, as in v4. Waterline z = 0. Backs and
undersides plain.
"""
import math, os
from mathutils import Vector, Matrix
import boss_remodel as br
from boss_remodel import mirror_plan, slab, join

TARGET_Z, RAD_X, RAD_Y, BRIDGE_Y = 1.6, 2.4, -.5, 1.6
LABEL = 'v5-remodel'
# Sampled from the supplied atlas: ceramic white-grey with darker inset panels, red-orange stripes.
PALETTE = dict(
    paint=('#b8b7bf', .42, .22, None), panel=('#7f7d87', .5, .35, None), metal=('#3a3438', .45, .62, None),
    steel=('#dcdce2', .32, .45, None), stripe=('#c44a1f', .48, .2, None), glow=('#2a1006', .5, .2, '#ff7a2a'),
)


def materials():
    return {key: br.material('ark_' + key, c, r, m, e, 1.0 if e else 0) for key, (c, r, m, e) in PALETTE.items()}


def ray_y(z, target_y):
    return br.ray_y(z, target_y, TARGET_Z)


def loft_sections(h, sections, mat):
    """Loft a hull through (y, [(x, z), ...]) sections of equal point count."""
    h.loft([[(x, y, z) for x, z in pts] for y, pts in sections], mat)


def centre_section(w, deck, bottom):
    return [(-w * .55, bottom), (w * .55, bottom), (w, bottom + .45), (w * 1.04, deck - .3), (w * .88, deck),
            (-w * .88, deck), (-w * 1.04, deck - .3), (-w, bottom + .45)]


# Chunkier and longer than the source's centre hull (y -.42..3.9), at the user's request (20 October).
CENTRE = [(-2.45, .25, 1.45, .55), (-2.0, .78, 1.75, -.05), (-1.2, 1.12, 1.95, -.3), (0.0, 1.25, 2.1, -.3), (.6, 1.3, 2.2, -.3),
          (1.2, 1.45, 2.3, -.3), (1.5, 1.75, 2.35, -.3), (2.9, 1.75, 2.4, -.3), (4.2, 1.5, 2.3, -.3), (4.9, 1.05, 2.1, -.2),
          (5.25, .6, 1.85, -.1)]


def deck_z(y):
    """Centre-hull deck height at y (piecewise linear through CENTRE)."""
    for (y0, _, d0, _), (y1, _, d1, _) in zip(CENTRE, CENTRE[1:]):
        if y0 <= y <= y1:
            return d0 + (d1 - d0) * (y - y0) / (y1 - y0)
    return CENTRE[-1][2]


def centre_hull(h):
    loft_sections(h, [(y, centre_section(w, d, b)) for y, w, d, b in CENTRE], 'paint')
    # Spine stripe forward of the tower, deck inlays, and the glowing hangar mouths behind the bay doors.
    h.loft([[(x, y, deck_z(y) - .05) for x, y in [(-.08, -2.2), (.08, -2.2), (.08, .4), (-.08, .4)]],
            [(x, y, deck_z(y) + .03) for x, y in [(-.08, -2.2), (.08, -2.2), (.08, .4), (-.08, .4)]]], 'stripe')
    for s in (-1, 1):
        inlay = mirror_plan([(.22, -1.7), (.62, -1.35), (.78, -.9), (.78, .2), (.22, .2)], s)
        h.loft([[(x, y, deck_z(y) - .05) for x, y in inlay], [(x, y, deck_z(y) + .025) for x, y in inlay]], 'panel')
        h.box((min(s * .66, s * .82), -2.4, .78), (max(s * .66, s * .82), -1.6, 1.38), 'glow')


def outer_section(xi, xo, top, bottom):
    w, hgt = xo - xi, top - bottom  # chamfers shrink with the section, so the bow stays a clean chisel
    co, ci, cb = min(.45, .32 * w), min(.3, .22 * w), min(.25, .18 * w)
    return [(xi + cb, bottom), (xo - cb, bottom), (xo, bottom + min(.5, .35 * hgt)), (xo, top - min(.35, .3 * hgt)), (xo - co, top),
            (xi + ci, top), (xi, top - min(.35, .3 * hgt)), (xi, bottom + min(.3, .25 * hgt))]


OUTER = [(-3.64, 2.98, 3.12, 1.46, 1.22), (-3.35, 2.66, 3.34, 1.5, .62), (-3.0, 2.68, 3.62, 1.53, .1), (-2.5, 2.74, 3.92, 1.55, -.2),
         (-1.0, 2.3, 4.1, 1.6, -.25), (.5, 2.1, 4.15, 1.62, -.25), (1.15, 2.0, 4.2, 2.28, -.25), (3.4, 2.0, 4.2, 2.28, -.25),
         (4.6, 2.15, 4.15, 2.02, -.25), (5.4, 2.5, 3.95, 1.75, -.15), (5.85, 2.95, 3.6, 1.5, .1)]


def outrigger(s, h):
    secs = []
    for y, xi, xo, top, bottom in OUTER:
        pts = [(s * x, z) for x, z in outer_section(xi, xo, top, bottom)]
        secs.append((y, pts if s > 0 else pts[::-1]))
    loft_sections(h, secs, 'paint')
    # Outboard stripe along the bow, deck walkway inlay, and the raised aft deck rim.
    h.loft([[(s * 3.95, y, z) for y, z in [(-2.9, .95), (-1.2, .95), (-1.2, 1.15), (-2.9, 1.15)]],
            [(s * 4.12, y, z) for y, z in [(-2.9, .95), (-1.2, .95), (-1.2, 1.15), (-2.9, 1.15)]]], 'stripe')
    h.loft([[(s * x, y, 1.5) for x, y in mirror_plan([(3.02, -3.45), (3.14, -3.45), (3.3, -2.6), (3.18, -2.6)], s)],
            [(s * x, y, 1.6) for x, y in mirror_plan([(3.02, -3.45), (3.14, -3.45), (3.3, -2.6), (3.18, -2.6)], s)]], 'stripe')
    walk = mirror_plan([(3.45, -2.2), (3.75, -1.9), (3.75, .9), (3.45, .9)], s)
    h.loft([[(x, y, 1.58) for x, y in walk], [(x, y, 1.68) for x, y in walk]], 'panel')
    h.box((min(s * 2.0, s * 4.2), 1.15, 2.28), (max(s * 2.0, s * 4.2), 3.4, 2.36), 'panel', chamfer=.1)
    # Aft deck past the wing: a long engine housing towards the tapered stern.
    h.box((min(s * 2.45, s * 3.75), 3.4, 1.9), (max(s * 2.45, s * 3.75), 5.2, 2.3), 'metal', chamfer=.18)
    h.box((min(s * 2.6, s * 3.6), 3.5, 2.3), (max(s * 2.6, s * 3.6), 5.0, 2.38), 'steel', chamfer=.12)


WING = [(1.5, 1.6), (1.82, 1.38), (3.95, 1.38), (4.38, 1.62), (4.38, 2.42), (4.74, 2.62), (4.74, 2.95), (3.75, 3.28), (3.12, 3.28), (1.85, 3.15)]


def wing(h):
    plan = mirror_plan(WING, 1)[::-1] + mirror_plan(WING, -1)[::-1]
    plan = [(x, y) for x, y in WING] + [(-x, y) for x, y in reversed(WING)]
    h.loft([[(x, y, 2.42) for x, y in plan], [(x, y, 2.72) for x, y in plan]], 'paint')
    for s in (-1, 1):
        # Turret platform and its forward pylon (traced: x 2.1-3.25, y 1.25-2.8; arm x 2.35-2.75 to y .4).
        h.cylinder((s * 2.75, 2.1, 0), 'z', .66, 2.72, 2.92, 'panel', seg=12)
        h.cylinder((s * 2.75, 2.1, 0), 'z', .7, 2.86, 2.9, 'stripe', seg=12)
        h.box((min(s * 2.38, s * 2.78), .45, 2.3), (max(s * 2.38, s * 2.78), 1.5, 2.86), 'metal', chamfer=.06)
        h.box((min(s * 1.6, s * 1.9), 1.5, 2.72), (max(s * 1.6, s * 1.9), 3.1, 2.9), 'steel', chamfer=.05)
        # Wing-tip fins.
        h.prism([(2.62, 2.72), (2.95, 2.72), (2.95, 2.95), (2.75, 3.15)], 'x', s * 4.6, s * 4.74, 'stripe')


def tower(h):
    """Static tower: lower block behind the lens recess, tapered superstructure, side pods, mast."""
    block = [(1.05, 1.85), (3.6, 1.85), (3.6, 3.36), (1.05, 3.36)]
    h.prism(block, 'x', -.82, .82, 'paint')
    for s in (-1, 1):  # recess cheeks beside the lens (outside the core ray)
        h.prism([(.25, 1.85), (1.05, 1.85), (1.05, 3.36), (.6, 3.36)], 'x', s * .82, s * .96, 'panel')
    lo = [(0, .6), (.3, .9), (.65, 1.3), (.8, 1.95), (.8, 2.65), (.65, 3.2), (.15, 3.5)]
    hi = [(0, 1.3), (.2, 1.45), (.45, 1.7), (.55, 2.0), (.55, 2.6), (.45, 2.9), (.1, 3.05)]
    full = lambda pts: pts + [(-x, y) for x, y in reversed(pts[1:-1])] + [(-pts[-1][0], pts[-1][1])]
    h.loft([[(x, y, 3.36) for x, y in full(lo)], [(x, y, 4.8) for x, y in full(hi)]], 'paint')
    h.loft([[(x, y, 4.8) for x, y in full(hi)], [(x * .8, y, 4.88) for x, y in full(hi)]], 'panel')  # mid grey: dark read as a canopy
    # Bridge windows: a hot band across the superstructure front.
    h.prism([(.72, 4.12), (.86, 4.12), (.96, 4.42), (.82, 4.42)], 'x', -.42, .42, 'glow')
    for s in (-1, 1):
        h.box((min(s * .78, s * 1.4), 1.95, 3.0), (max(s * .78, s * 1.4), 2.55, 4.1), 'paint', chamfer=.08)
        h.box((min(s * 1.4, s * 1.46), 2.05, 3.5), (max(s * 1.4, s * 1.46), 2.45, 3.8), 'glow')
    h.cylinder((0, 1.75, 0), 'z', .05, 4.88, 5.95, 'steel', seg=6)
    h.box((-.5, 1.7, 5.4), (.5, 1.8, 5.46), 'steel')


def connectors(h):
    """Struts tying the outriggers to the centre hull under the wing."""
    for s in (-1, 1):
        h.box((min(s * 1.4, s * 2.15), 1.5, 1.2), (max(s * 1.4, s * 2.15), 3.0, 2.45), 'metal', chamfer=.12)


def radiator(s, sc, mats, wreck=False):
    """Finned heat sink on the outrigger fore-deck, on the ray through its target (x +-2.4, s -0.5)."""
    nm = 'left' if s < 0 else 'right'
    h = br.Solids(['panel', 'metal', 'steel', 'glow'])
    # Footprint follows the outrigger's inner edge (x 2.42 at the front, 2.12 at the back).
    inner = lambda y: 2.12 + .3 * (-.1 - y) / 1.5
    base = mirror_plan([(2.42, -1.6), (3.35, -1.6), (3.35, -.1), (2.12, -.1)], s)
    h.loft([[(x, y, 1.55) for x, y in base], [(x, y, 1.86) for x, y in base]], 'metal')
    slot = mirror_plan([(2.5, -1.52), (3.27, -1.52), (3.27, -.18), (2.2, -.18)], s)
    h.loft([[(x, y, 1.86) for x, y in slot], [(x, y, 1.94) for x, y in slot]], 'glow')
    x1 = s * 3.32
    fins = 7
    for k in range(fins):
        y = -1.5 + k * (1.32 / (fins - 1))
        x0 = s * (inner(y) + .06)
        x0, x1 = (x0, s * 3.32) if s > 0 else (s * 3.32, x0)
        if wreck and k % 3 == 1:
            continue
        lean = (.25 if wreck else 0) * (1 if k % 2 else -1)
        h.loft([[(x0 + .08, y - .045, 1.9), (x1 - .08, y - .045, 1.9), (x1 - .08, y + .045, 1.9), (x0 + .08, y + .045, 1.9)],
                [(x0 + .1 + lean, y - .04, 2.3 - (.2 if wreck else 0)), (x1 - .1 + lean, y - .04, 2.3), (x1 - .1 + lean, y + .04, 2.3), (x0 + .1 + lean, y + .04, 2.3 - (.2 if wreck else 0))]],
               'steel' if k % 2 else 'panel')
    lo, hi = sorted((s * 2.42, s * 3.37))
    h.box((lo, -1.66, 2.28), (hi, -1.56, 2.36), 'metal')
    name = 'ark_radiator_%s%s' % (nm, '_wreck' if wreck else '')
    return h.object(name, mats, (s * 2.75, -.85, 1.6), sc, bevel=.015)


def turret(s, sc, mats):
    nm = 'left' if s < 0 else 'right'
    h = br.Solids(['paint', 'panel', 'metal', 'glow'])
    cx, cy, z = s * 2.75, 2.1, 2.92
    h.cylinder((cx, cy, 0), 'z', .48, z, z + .14, 'metal', seg=10)
    house = [(-.36, .4), (.36, .4), (.42, -.1), (.22, -.48), (-.22, -.48), (-.42, -.1)]
    h.loft([[(cx + u, cy + v, z + .14) for u, v in house], [(cx + u * .8, cy + v * .85, z + .5) for u, v in house]], 'paint')
    for bx in (-.13, .13):
        h.cylinder((cx + bx, 0, z + .32), 'y', .075, cy - .45, cy - 1.45, 'metal', seg=8)
        h.cylinder((cx + bx, 0, z + .32), 'y', .09, cy - 1.45, cy - 1.55, 'glow', seg=8)
    return h.object('ark_turret_' + nm, mats, (cx, cy, z), sc, bevel=.02)


def bridge(sc, mats):
    """The core: a glowing lens in the recess, facing the game camera, on the bridge ray."""
    h = br.Solids(['glow', 'metal', 'steel'])
    c = Vector((0, ray_y(2.55, BRIDGE_Y), 2.55))
    h.cylinder((0, 0, 0), 'y', .52, -.06, .12, 'metal', seg=16)
    h.cylinder((0, 0, 0), 'y', .42, -.12, -.06, 'glow', seg=16)
    h.cylinder((0, 0, 0), 'y', .16, -.16, -.12, 'steel', seg=10)
    ob = h.object('ark_bridge', mats, (0, 0, 0), sc, bevel=.012)
    ob.data.transform(Matrix.Rotation(math.radians(-55), 4, 'X'))
    ob.location = c
    return ob


def shutters(sc, mats):
    """The bridge cowl over the lens, split down its glowing seam: its halves are the bridge shutters and part
    sideways by 1.0 to expose the lens (core phase). Kept compact (user, 20 October: the tall dark spire read as a
    giant canopy and made the ship look like a toy; a small cowl lets the hull read huge)."""
    out = []
    for s, tag in [(-1, 'a'), (1, 'b')]:
        h = br.Solids(['paint', 'panel', 'stripe', 'glow'])
        # (y, |x|) outline per level: base on the deck, a waist ledge, and a low ridge.
        levels = [(2.0, [(-.6, .02), (-.3, .66), (1.35, .66), (1.4, .02)]),
                  (3.0, [(-.15, .02), (.05, .58), (1.25, .58), (1.3, .02)]),
                  (3.6, [(.5, .02), (.6, .14), (1.0, .14), (1.05, .02)])]
        loops = []
        for z, pts in levels:
            ring = [(s * x, y, z) for y, x in pts]
            loops.append(ring if s > 0 else ring[::-1])
        h.loft(loops, 'paint')  # the hull's light armour, not a dark canopy
        # Ledge plate at the waist, small lit vision slits (scale cues), and the hot seam along the front edge.
        lo, hi = sorted((s * .02, s * .56))
        h.box((lo, .0, 2.97), (hi, 1.17, 3.05), 'panel')
        for k in range(3):
            y = .05 + k * .12
            xa, xb = sorted((s * (.2 + k * .06), s * (.26 + k * .06)))
            h.box((xa, y - .02, 2.62 + k * .03), (xb, y + .02, 2.68 + k * .03), 'glow')
        edge = [(-.6, 2.0), (-.15, 3.0), (.5, 3.6)]
        xa, xb = sorted((s * .02, s * .06))
        h.loft([[(xa, y - .03, z), (xb, y - .03, z), (xb, y + .03, z), (xa, y + .03, z)] for y, z in edge], 'glow')
        out.append(h.object('ark_bridge_shutter_' + tag, mats, (s * .35, 0.0, 2.7), sc, bevel=.015))
    return out


def lens_cover(objects):
    """Fraction of the bridge lens the closed cowl hides from the game camera (printed; must stay ~1)."""
    from mathutils.bvhtree import BVHTree
    import bmesh
    lens = next(o for o in objects if o.name == 'ark_bridge')
    cover = [o for o in objects if o.name.startswith('ark_bridge_shutter_') or o.name == 'ark_hull']
    bm = bmesh.new()
    for o in cover:
        me = o.data.copy(); me.transform(o.matrix_world); bm.from_mesh(me); bpy_data_remove(me)
    tree = BVHTree.FromBMesh(bm)
    eye = Vector((0, -math.cos(math.radians(55)), math.sin(math.radians(55))))
    centre = lens.matrix_world.translation
    u, v = Vector((1, 0, 0)), eye.cross(Vector((1, 0, 0))).normalized()
    hidden = total = 0
    for i in range(9):
        for k in range(9):
            p = centre + u * (-.5 + i / 8) + v * (-.5 + k / 8)
            if (p - centre).length > .52 or abs(p.x) < .03:
                continue  # outside the lens, or on the glowing seam between the halves (open by design)
            total += 1
            hidden += tree.ray_cast(p + eye * .02, eye, 30)[0] is not None
    bm.free()
    print('ARK LENS COVER %.2f' % (hidden / total))
    return hidden / total


def bpy_data_remove(me):
    import bpy
    bpy.data.meshes.remove(me)


def bay_doors(sc, mats):
    out = []
    for s, nm in [(-1, 'left'), (1, 'right')]:
        h = br.Solids(['panel', 'metal', 'stripe'])
        # Flank hatch over the hangar mouth at the launch bay (y -2), sliding 0.9 outward.
        x0, x1 = sorted((s * .84, s * .96))
        h.prism([(-2.48, .66), (-1.52, .66), (-1.52, 1.5), (-2.36, 1.5)], 'x', x0, x1, 'panel')
        xa, xb = sorted((s * .96, s * .98))
        h.prism([(-2.3, 1.0), (-1.7, 1.0), (-1.7, 1.1), (-2.3, 1.1)], 'x', xa, xb, 'stripe')
        out.append(h.object('ark_bay_%s_door' % nm, mats, (s * .9, -2.0, 1.08), sc, bevel=.01))
    return out


def compare(objects):
    br.compare('ark', objects, os.path.join(br.LOOKDEV, 'ark-v5-compare.png'), (0, .2, 2.0), 12.0, light='ice')


def build(export=True, preview=True):
    import bpy
    sc = br.scene('Last Worlds — Remodel ARK')
    mats = materials()
    hull = br.Solids(['paint', 'panel', 'metal', 'steel', 'stripe', 'glow'])
    centre_hull(hull)
    for s in (-1, 1):
        outrigger(s, hull)
    wing(hull)
    tower(hull)
    connectors(hull)
    objects = [hull.object('ark_hull', mats, (0, 0, 0), sc, bevel=.03)]
    for s in (-1, 1):
        objects.append(radiator(s, sc, mats))
        objects.append(radiator(s, sc, mats, wreck=True))
        objects.append(turret(s, sc, mats))
    objects.append(bridge(sc, mats))
    objects += shutters(sc, mats)
    objects += bay_doors(sc, mats)
    bpy.context.view_layer.update()
    assert lens_cover(objects) > .95, 'the closed cowl must hide the bridge lens'
    br.texture_bake(objects, 'ark', 'vesper')
    live = [o for o in objects if not o.name.endswith('_wreck')]
    br.bake_ao(objects, live, ground=-10)
    for nm, x in [('left', -.75), ('right', .75)]:
        objects.append(br.marker('ark_bay_' + nm, (x, -2.0, 1.0), sc))
    objects.append(br.marker('ark_wake_anchor', (0, 4.4, 0), sc))
    objects.append(br.marker('ark_remodel_v5', sc=sc, source_file=br.SOURCES['ark'],
                             note='Clean remodel traced over the supplied GLB, lengthened; no source geometry exported'))
    result = None
    if export:
        path = os.path.join(br.ROOT, 'public', 'assets', 'vesper', 'helion-ark-%s.glb' % LABEL)
        result = br.export(path, objects, 'Last Worlds — HELION ARK remodel traced over the user-supplied GLB')
    for o in objects:
        if o.name.endswith('_wreck'):
            o.hide_render = True
    if preview:
        br.game_view(sc, (0, .2, 2.0), 12.5, os.path.join(br.LOOKDEV, 'ark-v5-game.png'),
                     objects=[o for o in objects if o.type == 'MESH' and not o.name.endswith('_wreck')], light='ice')
    return objects, result
