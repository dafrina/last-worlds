"""WARDEN-1 v5: a clean remodel after the user's design sheet (front elevation, 20 October).

There is no supplied GLB for the Warden: the sheet is the shape reference and the published
reference-sheet model (luna/warden-v3-study.glb, boss_references.warden) gives the size, so the
game footprint (about 6.6 x 4 units) and every combat socket stay as they are (src/content/warden.ts:
pods x = +-2.1 at s 0, command core 0.9 behind, target height 1.3).

From the sheet: a tall white command column whose glowing slot is the seam between its two front
armour halves (the core hatches; they slide apart by 0.8 to expose the reactor, which sits on the
55-degree camera ray through the core target); twin-barrel turret pods (the weak points, yawing as a
whole about their target) on top of big chevron side blocks; inner armour blocks with amber lights
and vent grilles; blue thruster bells underneath; two antenna masts with orange tips. Backs and
undersides plain. Blender axes: x right, y away from the player, z up; the ground is z = 0.
"""
import math, os
from mathutils import Vector, Matrix
import boss_remodel as br
from boss_remodel import mirror_plan, slab, join

POD_X, CORE_Y, TARGET_Z = 2.1, .9, 1.3
LABEL = 'v5-remodel'
# Weathered white armour, dark gunmetal machinery, orange lights; thrusters burn pale blue.
PALETTE = dict(
    # Armour paints are nearly dielectric: Luna's black sky would turn metallic white into grey.
    paint=('#d6d5d0', .58, .04, None), panel=('#a3a29d', .6, .06, None), metal=('#34363b', .45, .55, None),
    steel=('#7d8188', .4, .6, None), stripe=('#c9622a', .5, .2, None), glow=('#2a1006', .5, .2, '#ff8a2a'),
    jet=('#0c1824', .4, .3, '#8fd2ff'),
)


def materials():
    # 'jet' has no 'glow' in its name: the view keeps it (its glow materials become heat and lamps).
    return {key: br.material('warden_' + key, c, r, m, e, 1.0 if e else 0) for key, (c, r, m, e) in PALETTE.items()}


def ray_y(z, target_y):
    return br.ray_y(z, target_y, TARGET_Z)


def chamfer_box(h, lo, hi, mat, c=.08):
    h.box(lo, hi, mat, chamfer=c)


def side_block(s, h):
    """Big chevron armour block under each turret, with its thruster bells and a landing leg."""
    x0, x1 = sorted((s * 1.85, s * 3.3))
    # Front face slants back at the top (the sheet's bevelled block).
    prof = [(-1.55, .32), (1.25, .32), (1.25, 1.12), (-1.25, 1.12), (-1.6, .82)]
    h.prism(prof, 'x', x0, x1, 'paint')
    xo0, xo1 = sorted((s * 3.3, s * 3.42))
    h.prism([(-1.3, .45), (1.0, .45), (1.0, 1.0), (-1.2, 1.0)], 'x', xo0, xo1, 'panel')
    # Chevron emblem on the front: two dark V strokes.
    cx = s * 2.6
    for dz in (0, .16):
        for k in (-1, 1):
            a = (cx + k * .32, -1.612 + .02, .86 + dz)
            b = (cx, -1.62 + .02, .64 + dz)
            h.loft([[(a[0] - .05, a[1], a[2]), (a[0] + .05, a[1], a[2]), (b[0] + .05, b[1], b[2]), (b[0] - .05, b[1], b[2])],
                    [(a[0] - .05, a[1] - .03, a[2]), (a[0] + .05, a[1] - .03, a[2]), (b[0] + .05, b[1] - .03, b[2]), (b[0] - .05, b[1] - .03, b[2])]], 'metal')
    lo, hi = sorted((s * 2.95, s * 3.15))
    h.box((lo, -1.66, .5), (hi, -1.58, .58), 'glow')
    # Thruster housings under the block (bells burn blue), and short landing legs.
    for y in (-.7, .55):
        h.cylinder((s * 2.6, y, 0), 'z', .42, .14, .34, 'metal', seg=14)
        h.cylinder((s * 2.6, y, 0), 'z', .34, .06, .14, 'steel', seg=14, r2=.38)
        h.cylinder((s * 2.6, y, 0), 'z', .26, .05, .07, 'jet', seg=12)
    for y in (-1.3, 1.05):
        h.box((s * 3.1 - .08, y - .08, 0), (s * 3.1 + .08, y + .08, .34), 'metal')
        h.box((s * 3.1 - .16, y - .16, 0), (s * 3.1 + .16, y + .16, .05), 'steel')


def inner_block(s, h):
    """Inner armour blocks beside the column, amber lights, vent grilles below and small thrusters."""
    x0, x1 = sorted((s * .62, s * 1.48))
    prof = [(-.95, .85), (1.3, .85), (1.3, 1.95), (-.7, 1.95), (-.95, 1.7)]
    h.prism(prof, 'x', x0, x1, 'paint')
    lo, hi = sorted((s * .7, s * 1.4))
    h.prism([(-.98, 1.12), (-.92, 1.12), (-.92, 1.5), (-.98, 1.5)], 'x', lo, hi, 'panel')
    for k in range(5):  # vent grille under the block
        z = .5 + k * .065
        h.box((lo, -.86, z), (hi, -.8, z + .035), 'steel')
    h.box((lo, -.82, .44), (hi, .9, .85), 'metal')
    for x in (.85, 1.2):
        h.box((s * x - .05, -.97, 1.78), (s * x + .05, -.93, 1.86), 'glow')
    h.cylinder((s * 1.05, .1, 0), 'z', .2, .2, .44, 'metal', seg=10)
    h.cylinder((s * 1.05, .1, 0), 'z', .14, .18, .2, 'jet', seg=10)


def chassis(h):
    """Dark frame deck tying everything, the column's static body, masts and the lower nose."""
    h.box((-3.0, -1.5, .5), (3.0, 1.75, .78), 'metal', chamfer=.2)
    h.box((-1.85, -1.2, .78), (1.85, 1.6, .86), 'steel')
    # Static column body behind the hatches (front face at y .55, clear of the core ray).
    h.box((-.5, .55, .6), (.5, 1.6, 3.0), 'paint', chamfer=.08)
    h.box((-.44, .32, 3.0), (.44, 1.5, 3.22), 'panel', chamfer=.08)
    h.box((-.3, .3, 3.06), (.3, .34, 3.14), 'glow')
    h.cylinder((0, .9, 0), 'z', .07, 3.22, 3.5, 'steel', seg=6)
    for s in (-1, 1):  # column cheeks
        lo, hi = sorted((s * .5, s * .66))
        h.prism([(-.25, 1.5), (1.4, 1.5), (1.4, 2.7), (.1, 2.7)], 'x', lo, hi, 'panel')
    # Lower nose under the hatches with the centre thruster.
    h.prism([(-.42, .5), (.55, .5), (.55, 1.56), (-.36, 1.56), (-.48, 1.0)], 'x', -.5, .5, 'paint')
    h.box((-.08, -.49, .9), (.08, -.44, 1.4), 'glow')
    h.cylinder((0, .1, 0), 'z', .28, .18, .5, 'metal', seg=12)
    h.cylinder((0, .1, 0), 'z', .2, .15, .18, 'jet', seg=10)
    # Antenna masts with orange tips behind the turrets (the sheet's two tall spires).
    for s in (-1, 1):
        x, y = s * .95, 1.15
        h.box((x - .14, y - .14, 1.95), (x + .14, y + .14, 2.25), 'metal')
        h.cylinder((x, y, 0), 'z', .035, 2.25, 3.75, 'steel', seg=6)
        for z in (2.6, 3.05):
            h.cylinder((x, y, 0), 'z', .08, z, z + .18, 'panel', seg=8)
        h.cylinder((x, y, 0), 'z', .05, 3.75, 3.86, 'glow', seg=6)


def pod(s, sc, mats, wreck=False):
    """Twin-barrel turret pod on its side block; the whole pod yaws about its target (x +-2.1, s 0)."""
    nm = 'left' if s < 0 else 'right'
    h = br.Solids(['paint', 'panel', 'metal', 'steel', 'glow'])
    x = s * POD_X
    h.cylinder((x, 0, 0), 'z', .58, 1.12, 1.26, 'metal', seg=12)
    house = [(-.55, .55), (.55, .55), (.6, -.25), (.42, -.55), (-.42, -.55), (-.6, -.25)]
    h.loft([[(x + u, v, 1.26) for u, v in house], [(x + u * .92, v * .92, 1.9) for u, v in house]], 'paint')
    h.box((x - .62, -.3, 1.36), (x - .55, .4, 1.78), 'panel')
    h.box((x + .55, -.3, 1.36), (x + .62, .4, 1.78), 'panel')
    h.box((x - .3, -.05, 1.9), (x + .3, .45, 1.98), 'metal', chamfer=.05)
    h.box((x - .12, -.58, 1.66), (x + .12, -.54, 1.74), 'glow')
    axis = Vector((s * .32, -1, 0)).normalized()
    length = .7 if wreck else 1.6
    for dz in (.13, -.13):
        base = Vector((x + s * .16, -.45, 1.58 + dz))
        tip = base + axis * length
        # Barrel as a loft of octagons along its axis (cylinder() is axis-aligned only).
        side = Vector((-axis.y, axis.x, 0))
        def ring(c, r):
            return [c + side * (r * math.cos(a)) + Vector((0, 0, r * math.sin(a))) for a in [k * math.pi / 4 + math.pi / 8 for k in range(8)]]
        h.loft([ring(base, .1), ring(base + axis * .25, .1)], 'steel')
        h.loft([ring(base + axis * .25, .075), ring(tip, .075)], 'metal')
        if not wreck:
            h.loft([ring(tip, .09), ring(tip + axis * .1, .09)], 'metal')
            h.loft([ring(tip + axis * .1, .06), ring(tip + axis * .12, .06)], 'glow')
    name = 'warden_pod_%s%s' % (nm, '_wreck' if wreck else '')
    ob = h.object(name, mats, (x, 0, TARGET_Z), sc, bevel=.02)
    if wreck:
        ob.data.transform(Matrix.Rotation(math.radians(14 * s), 4, 'Y') @ Matrix.Rotation(math.radians(-8), 4, 'X'))
    return ob


CORE_Z = 2.25  # reactor height on the core ray: y = ray_y(CORE_Z, CORE_Y)


def reactor(sc, mats, wreck=False):
    h = br.Solids(['glow', 'metal', 'steel', 'panel'])
    cy = ray_y(CORE_Z, CORE_Y)
    if wreck:
        h.cylinder((0, cy, 0), 'z', .28, 1.6, 2.4, 'metal', seg=10)
        h.cylinder((0, cy, 0), 'z', .34, 1.75, 1.85, 'panel', seg=10)
        return h.object('warden_core_wreck', mats, (0, cy, CORE_Z), sc, bevel=.015)
    h.cylinder((0, cy, 0), 'z', .26, 1.62, 2.88, 'glow', seg=12)
    for z in (1.62, 2.02, 2.42, 2.78):
        h.cylinder((0, cy, 0), 'z', .33, z, z + .08, 'metal', seg=12)
    h.cylinder((0, cy, 0), 'z', .12, 2.88, 3.0, 'steel', seg=8)
    return h.object('warden_core', mats, (0, cy, CORE_Z), sc, bevel=.012)


def hatches(sc, mats):
    """The column's front armour halves; the glowing seam between them is the sheet's slot."""
    out = []
    for i, s in enumerate((-1, 1)):
        h = br.Solids(['paint', 'panel', 'glow', 'stripe'])
        x0, x1 = sorted((s * .03, s * .52))
        prof = [(-.36, 1.56), (.55, 1.56), (.55, 2.98), (.05, 2.98), (-.3, 2.7)]
        h.prism(prof, 'x', x0, x1, 'paint')
        xa, xb = sorted((s * .14, s * .44))
        h.prism([(-.37, 1.8), (-.33, 1.8), (-.33, 2.5), (-.37, 2.5)], 'x', xa, xb, 'panel')
        xa, xb = sorted((s * .03, s * .08))
        h.prism([(-.4, 1.62), (-.34, 1.62), (-.28, 2.66), (-.34, 2.66)], 'x', xa, xb, 'glow')
        xa, xb = sorted((s * .3, s * .5))
        h.prism([(.0, 2.98), (.25, 2.98), (.25, 3.02), (.0, 3.02)], 'x', xa, xb, 'stripe')
        out.append(h.object('warden_core_hatch_%d' % i, mats, (s * .3, .1, 2.25), sc, bevel=.015))
    return out


def compare(objects):
    """No supplied GLB for the Warden: render the remodel from the four views instead."""
    import bpy
    sc = bpy.context.scene
    meshes = [o for o in objects if o.type == 'MESH' and not o.hide_render]
    rows = []
    for view in ('game', 'top', 'side', 'front'):
        p = os.path.join(br.LOOKDEV, '_warden_%s.png' % view)
        br.render_view(sc, view, (0, .1, 1.7), 8.5, p, 640, meshes, light='ice')
        rows.append([p])
    return br.compose([rows[0] + rows[1], rows[2] + rows[3]], os.path.join(br.LOOKDEV, 'warden-v5-compare.png'))


def build(export=True, preview=True):
    import bpy
    sc = br.scene('Last Worlds — Remodel WARDEN')
    mats = materials()
    hull = br.Solids(['paint', 'panel', 'metal', 'steel', 'stripe', 'glow', 'jet'])
    for s in (-1, 1):
        side_block(s, hull)
        inner_block(s, hull)
    chassis(hull)
    objects = [hull.object('warden_hull', mats, (0, 0, 0), sc, bevel=.03)]
    for s in (-1, 1):
        objects.append(pod(s, sc, mats))
        objects.append(pod(s, sc, mats, wreck=True))
    objects.append(reactor(sc, mats))
    objects.append(reactor(sc, mats, wreck=True))
    objects += hatches(sc, mats)
    bpy.context.view_layer.update()
    br.texture_bake(objects, 'warden', 'luna')
    live = [o for o in objects if not o.name.endswith('_wreck')]
    br.bake_ao(objects, live)
    objects.append(br.marker('warden_beacon', (-.95, 1.15, 3.86), sc))
    for i, (x, y) in enumerate([(-2.6, -.7), (2.6, -.7), (-2.6, .55), (2.6, .55)]):
        objects.append(br.marker('warden_thruster_%d' % i, (x, y, .06), sc))
    objects.append(br.marker('warden_remodel_v5', sc=sc, note='Clean remodel after the WARDEN-1 design sheet'))
    result = None
    if export:
        path = os.path.join(br.ROOT, 'public', 'assets', 'luna', 'warden-%s.glb' % LABEL)
        result = br.export(path, objects, 'Last Worlds — WARDEN-1 remodel after the design sheet')
    for o in objects:
        if o.name.endswith('_wreck'):
            o.hide_render = True
    if preview:
        br.game_view(sc, (0, .1, 1.7), 8.5, os.path.join(br.LOOKDEV, 'warden-v5-game.png'),
                     objects=[o for o in objects if o.type == 'MESH' and not o.hide_render], light='ice')
    return objects, result
