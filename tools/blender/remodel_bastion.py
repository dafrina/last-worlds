"""BASTION-9 v5: a clean hard-surface remodel traced over the user's supplied tank GLB.

Outlines and heights come from boss_remodel.trace/print_height_map over the supplied model
(art/source/approved-bosses/futuristic-tank-original.glb) placed 20% larger than v4 (the user
asked for a bigger fortress): x8 -> x9.6. All coordinates below are final game units.
Combat geometry scaled with it (src/content/bastion.ts: batteries x = +-2.64, core 1.62 behind,
both at height 1.74), and the batteries and the reactor sit where the 55-degree game camera's
ray through each target meets the armour; the reactor hatches part sideways.

The game camera looks from the front at 55 degrees: backs, undersides and rear-facing ends
are never seen, so they stay plain (user note, 20 October).

Blender axes: x right, y away from the player (glTF -z), z up. Ground at z = 0.
"""
import math, os
from mathutils import Vector, Matrix
import boss_remodel as br
from boss_remodel import mirror_plan, slab, join

SCALE = 1.2  # relative to the v4 adaptation (documentation; the reference placement carries it)
TAN = math.tan(math.radians(35))  # the camera ray loses TAN of y per unit of height
LABEL = 'v5-remodel'
# Sampled from the supplied atlas: dark rusted copper and weathered metal, small hot accents.
PALETTE = dict(
    paint=('#7a4024', .48, .5, None), panel=('#43291d', .58, .5, None), metal=('#2a221e', .46, .7, None),
    tread=('#1f1815', .82, .45, None), steel=('#857d76', .38, .66, None), glow=('#2a1006', .5, .2, '#ff6a1c'),
)


def materials():
    return {key: br.material('bastion_' + key, c, r, m, e, 1.0 if e else 0) for key, (c, r, m, e) in PALETTE.items()}


BATTERY_X, CORE_Y, TARGET_Z = 2.64, 1.62, 1.74  # src/content/bastion.ts (batteryOffset, coreRowOffset, targetHeight)


def ray_y(z, target_y):
    """y where the camera ray through a combat target reaches height z."""
    return br.ray_y(z, target_y, TARGET_Z)


def stadium(front, rear, r, seg=8):
    """Closed (y, z) loop around two arc centres (a belt's side profile)."""
    pts = []
    for i in range(seg + 1):
        a = -math.pi / 2 + math.pi * i / seg
        pts.append((rear[0] + r * math.cos(a), rear[1] + r * math.sin(a)))
    for i in range(seg + 1):
        a = math.pi / 2 + math.pi * i / seg
        pts.append((front[0] + r * math.cos(a), front[1] + r * math.sin(a)))
    return pts


def along(loop, pitch):
    """Points every `pitch` along a closed (y, z) polyline with unit tangents."""
    out, carry = [], pitch / 2
    for a, b in zip(loop, loop[1:] + loop[:1]):
        length = math.dist(a, b)
        d = carry
        while d < length:
            f = d / length
            out.append(((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), ((b[0] - a[0]) / length, (b[1] - a[1]) / length)))
            d += pitch
        carry = d - length
    return out


# Tracks span the whole hull, -3.55..4.3 (user: the traced short belts looked comical, 20 October).
# Taller, wider double drums than the trace, after the design sheet (front elevation).
FRONT, REAR, R = (-2.4, 1.15), (3.15, 1.15), 1.15
BELTS = [(1.7, 2.68), (2.78, 3.8)]
CENTRE = ((FRONT[0] + REAR[0]) / 2, R)


def tracks(s, h):
    loop = stadium(FRONT, REAR, R)
    for x0, x1 in BELTS:
        h.prism(loop, 'x', s * x0, s * x1, 'tread')
        for (y, z), (ty, tz) in along(loop, .36):
            if y > REAR[0] or z < .35:
                continue  # rear arc and bottom run face away from the camera
            ny, nz = tz, -ty
            if ny * (y - CENTRE[0]) + nz * (z - CENTRE[1]) < 0:
                ny, nz = -ny, -nz
            c = (y + ny * .07, z + nz * .07)
            prof = [(c[0] + ty * u + ny * n, c[1] + tz * u + nz * n) for u, n in [(-.09, -.07), (.09, -.07), (.09, .07), (-.09, .07)]]
            h.prism(prof, 'x', s * (x0 + .05), s * (x1 - .05), 'metal')
    h.cylinder((0, FRONT[0], FRONT[1]), 'x', .34, s * 2.68, s * 2.78, 'metal', seg=10)


def wheels(s, mats, sc):
    """Front sprocket and rear idler on the outer belt face: nodes that roll on their axles."""
    out = []
    for name, (y, z), r in [('sprocket', FRONT, .92), ('idler', REAR, .84)]:
        h = br.Solids(['metal', 'paint', 'steel', 'glow'])
        x0, x1 = s * 3.8, s * 3.92
        h.gear((0, y, z), 'x', r, .12, 14, x0, x1, 'metal')
        h.cylinder((0, y, z), 'x', r * .62, x1, s * 4.0, 'paint', seg=12)
        h.cylinder((0, y, z), 'x', r * .3, s * 4.0, s * 4.12, 'steel', seg=10)
        h.cylinder((0, y, z), 'x', r * .13, s * 4.12, s * 4.18, 'glow', seg=8)
        for k in range(6):
            a = 2 * math.pi * k / 6
            cy, cz = y + math.cos(a) * r * .45, z + math.sin(a) * r * .45
            h.cylinder((0, cy, cz), 'x', .08, s * 4.0, s * 4.06, 'steel', seg=6)
        out.append(h.object('bastion_%s_%s' % (name, 'left' if s < 0 else 'right'), mats, (s * 3.9, y, z), sc, bevel=.015))
    return out


ROOF = 3.0  # shoulder roof, raised over the taller drums


def shoulder_roof(x, y):
    ax = abs(x)  # flat inboard, then a faceted slope down over the outer drum (design sheet)
    return ROOF if ax <= 2.4 else ROOF - (ax - 2.4) * .35


def shoulders(s, h):
    # Cut back over the belts at the front (user, 20 October: show more of the treads); the inboard nose stays.
    plan = [(1.0, -2.45), (1.62, -2.45), (1.72, -1.9), (3.05, -1.9), (3.5, -1.45), (3.5, .75), (1.0, .75)]
    slab(h, mirror_plan(plan, s), shoulder_roof, 2.35, 'paint')
    # Raised armour plates with dark seams between them.
    for plate in ([(1.25, -2.3), (1.55, -2.3), (1.66, -1.8), (2.62, -1.8), (2.62, -1.5), (1.25, -1.5)],
                  [(2.8, -1.45), (3.0, -1.45), (3.32, -1.08), (3.32, .55), (2.8, .55)],
                  [(1.3, -.55), (2.62, -.55), (2.62, .55), (1.3, .55)]):
        slab(h, mirror_plan(plate, s), lambda x, y: shoulder_roof(x, y) + .07, 2.6, 'panel')
    # The gull-wing side skirts, the stowage boxes over the outer drums and the front fender are gone (user,
    # 20 October: no boxy pieces over the treads); a slim track guard runs along the shoulder's outer edge.
    h.box((min(s * 3.45, s * 3.62), -1.45, 2.42), (max(s * 3.45, s * 3.62), .75, 2.62), 'panel', chamfer=.04)
    # Raised block behind each shoulder, and the outer strip beside it.
    rear = [(1.3, .62), (2.35, .62), (2.35, 2.82), (1.3, 2.82)]
    slab(h, mirror_plan(rear, s), lambda x, y: 3.5, 2.6, 'paint')
    h.box((min(s * 2.7, s * 3.12), .8, 2.6), (max(s * 2.7, s * 3.12), 2.82, 3.5), 'panel', chamfer=.08)
    h.box((min(s * 2.35, s * 2.7), .7, 2.6), (max(s * 2.35, s * 2.7), 2.9, 3.3), 'metal')
    h.box((min(s * 3.12, s * 3.6), .7, 2.4), (max(s * 3.12, s * 3.6), 2.9, 3.05), 'paint', chamfer=.06)
    for k in range(5):  # cooling slots on the rear block
        y = 1.0 + k * .32
        h.box((min(s * 1.45, s * 2.2), y, 3.5), (max(s * 1.45, s * 2.2), y + .14, 3.56), 'metal')
    # Disc housing that read as a turret in the source; now a sensor drum with a hot lens.
    h.cylinder((s * 2.25, .1, 0), 'z', .36, 3.1, 3.55, 'metal', seg=10)
    h.cylinder((s * 2.25, .1, 0), 'z', .16, 3.55, 3.61, 'glow', seg=8)


def spine_roof(x, y):
    z = 3.5 - .24 * abs(x) / 1.05
    if y < -1.55:
        z -= (-1.55 - y) * .42
    if y > 2.45:
        z -= (y - 2.45) * .45
    return z


WELL, WELL_R = (0.0, .5), .58  # centred on the core ray between the roof (3.5) and the reactor top (3.22)
TOWER_BACK = .7


def body(h):
    """Belly between the tracks, gabled armoured spine around the reactor well, glacis, tower, rear block."""
    belly = [(-1.72, .95), (-.92, .95), (-.42, .45), (.42, .45), (.92, .95), (1.72, .95), (1.72, 2.7), (-1.72, 2.7)]
    h.prism(belly, 'y', -2.4, 2.75, 'metal')
    # The spine roof (gable 3.5 -> 3.26, dropping over the prow) in pieces around the well.
    w0, w1 = WELL[1] - WELL_R, WELL[1] + WELL_R
    front = [(0, -2.5), (.22, -2.45), (.95, -1.55), (1.05, w0), (-1.05, w0), (-.95, -1.55), (-.22, -2.45)]
    rear = [(1.05, w1), (1.05, 2.45), (.62, 3.35), (-.62, 3.35), (-1.05, 2.45), (-1.05, w1)]
    slab(h, front[::-1], spine_roof, 2.6, 'paint')
    slab(h, rear[::-1], spine_roof, 2.6, 'paint')
    for s in (-1, 1):
        slab(h, mirror_plan([(WELL_R, w0), (1.05, w0), (1.05, w1), (WELL_R, w1)], s), spine_roof, 2.6, 'paint')
    collar = [(.72 * math.cos(math.pi / 8 + k * math.pi / 4), .72 * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]
    for k in range(8):  # hatch collar around the well
        a, b = collar[k], collar[(k + 1) % 8]
        f = WELL_R / .72
        quad = [(a[0], a[1] + WELL[1]), (b[0], b[1] + WELL[1]), (b[0] * f, b[1] * f + WELL[1]), (a[0] * f, a[1] * f + WELL[1])]
        h.wedge(quad, 3.38, 3.47, 'metal')
    h.box((-WELL_R, w0, 2.6), (WELL_R, w1, 2.66), 'metal')  # well floor
    # Centre ridge plate along the spine, with a glowing seam forward of the well.
    slab(h, [(-.16, -2.3), (.16, -2.3), (.16, -.82), (-.16, -.82)], lambda x, y: spine_roof(0, y) + .08, 2.9, 'panel')
    slab(h, [(-.05, -2.1), (.05, -2.1), (.05, -1.0), (-.05, -1.0)], lambda x, y: spine_roof(0, y) + .1, 3.0, 'glow')
    # Glacis between the cannon pods, and the nose lamp.
    # The design sheet's V-chevron: the glacis narrows to a point near the ground, with a hot centre seam.
    h.loft([[(-.42, -2.0, 1.0), (.42, -2.0, 1.0), (.42, -2.0, 3.05), (-.42, -2.0, 3.05)],
            [(-.04, -2.98, .95), (.04, -2.98, .95), (.46, -2.98, 2.78), (-.46, -2.98, 2.78)]], 'paint')
    h.loft([[(-.04, -2.99, 1.15), (.04, -2.99, 1.15), (.04, -2.99, 2.6), (-.04, -2.99, 2.6)],
            [(-.04, -3.03, 1.15), (.04, -3.03, 1.15), (.04, -3.03, 2.6), (-.04, -3.03, 2.6)]], 'glow')
    h.cylinder((0, -2.95, 1.0), 'y', .12, -3.04, -2.9, 'glow', seg=10)
    # Command tower behind the well (static armour), slanted front with a hot slit.
    # (Set 0.7 further back than the source's so the reactor well in front of it sits on the core ray.)
    t = TOWER_BACK
    side = [(.42 + t, 3.38), (1.8 + t, 3.38), (1.8 + t, 4.1), (1.25 + t, 4.6), (.62 + t, 4.6), (.42 + t, 4.0)]
    h.prism(side, 'x', -.66, .66, 'paint')
    h.prism([(.62 + t, 4.6), (1.25 + t, 4.6), (1.25 + t, 4.66), (.62 + t, 4.66)], 'x', -.44, .44, 'metal')
    h.prism([(.38 + t, 3.62), (.44 + t, 3.62), (.44 + t, 3.96), (.38 + t, 3.96)], 'x', -.07, .07, 'glow')
    for s in (-1, 1):
        h.prism([(.6 + t, 3.55), (1.6 + t, 3.55), (1.6 + t, 4.25), (.75 + t, 4.25)], 'x', s * .66, s * .82, 'panel')
        h.box((min(s * .82, s * .86), .9 + t, 3.8), (max(s * .82, s * .86), 1.4 + t, 3.95), 'glow')
    h.cylinder((.12, 1.3 + t, 0), 'z', .03, 4.66, 5.0, 'steel', seg=5)
    # Rear engine block and tail (seen only from above: plain).
    h.prism([(2.45, 2.6), (3.4, 2.6), (3.4, 3.6), (2.55, 3.6)], 'x', -.95, .95, 'metal')
    h.prism([(3.4, 2.62), (4.45, 2.62), (4.45, 2.78), (3.7, 2.92), (3.4, 3.12)], 'x', -.55, .55, 'panel')
    for s in (-1, 1):
        for x in (.6, 1.4):  # rear fins
            h.prism([(2.65, 3.05), (3.45, 3.05), (3.45, 3.25), (3.1, 3.62), (2.75, 3.62)], 'x', s * x - .04, s * x + .04, 'steel')


def exhausts(s, h):
    """Aft exhausts, and the two big upper cannons."""
    for x, r, z, y1 in [(1.18, .17, 2.78, 4.4), (.72, .14, 2.78, 4.3)]:
        h.cylinder((s * x, 0, z), 'y', r, 2.4, y1 - .2, 'steel', seg=10)
        h.cylinder((s * x, 0, z), 'y', r * 1.12, y1 - .2, y1, 'metal', seg=10)
    # The source's two big pale tubes, turned forward as the sheet's upper cannons with glowing muzzles.
    cx = s * 2.3
    lo, hi = sorted((s * 1.95, s * 2.65))
    h.box((lo, 1.7, 3.5), (hi, 3.3, 3.7), 'metal', chamfer=.08)
    h.cylinder((cx, 0, 3.98), 'y', .32, 1.35, 3.9, 'steel', seg=12)
    h.cylinder((cx, 0, 3.98), 'y', .38, .95, 1.35, 'metal', seg=12)
    h.cylinder((cx, 0, 3.98), 'y', .36, 3.9, 4.2, 'metal', seg=12)
    h.cylinder((cx, 0, 3.98), 'y', .22, .92, .95, 'glow', seg=10)
    h.box((min(s * 1.9, s * 2.7), 2.4, 2.4), (max(s * 1.9, s * 2.7), 3.2, 2.85), 'metal')


def battery(s, sc, mats, wreck=False):
    """Shoulder battery where the camera ray through its target (x = +-2.64) meets the roof."""
    nm = 'left' if s < 0 else 'right'
    x, base = s * BATTERY_X, ROOF + .07
    cy = ray_y(base + .2, 0)
    ring = br.Solids(['paint', 'metal', 'glow'])
    ring.cylinder((x, cy, 0), 'z', .6, base - .04, base + .14, 'metal', seg=8, phase=math.pi / 8)
    ring.cylinder((x, cy, 0), 'z', .63, base + .03, base + .08, 'glow', seg=8, phase=math.pi / 8)
    ring.cylinder((x, cy, 0), 'z', .5, base + .14, base + .22, 'paint', seg=8, phase=math.pi / 8)
    gun = br.Solids(['paint', 'panel', 'metal', 'glow'])
    gz = base + .22
    # Round drum turret with one thick barrel and a glowing eye (design sheet), yawing about its centre.
    gun.cylinder((x, cy, 0), 'z', .48, gz, gz + .52, 'paint', seg=12)
    gun.cylinder((x, cy, 0), 'z', .36, gz + .52, gz + .62, 'panel', seg=12)
    gun.cylinder((x, cy, 0), 'z', .5, gz + .22, gz + .28, 'metal', seg=12)
    gun.box((x - .2, cy - .62, gz + .1), (x + .2, cy - .3, gz + .44), 'metal', chamfer=.06)
    length = .35 if wreck else .75
    gun.cylinder((x, 0, gz + .27), 'y', .17, cy - .6, cy - .6 - length, 'metal', seg=10)
    if not wreck:
        gun.cylinder((x, 0, gz + .27), 'y', .2, cy - 1.35, cy - 1.45, 'metal', seg=10)
        gun.cylinder((x, 0, gz + .27), 'y', .13, cy - 1.45, cy - 1.48, 'glow', seg=10)
    if wreck:
        r = ring.object('bastion_battery_%s_wreck_ring' % nm, mats, (x, cy, base), sc, bevel=.02)
        g = gun.object('bastion_battery_%s_wreck_gun' % nm, mats, (x, cy, gz), sc, bevel=.02)
        g.rotation_euler = (math.radians(-10), math.radians(16 * s), math.radians(25 * s))
        return join([r, g], 'bastion_battery_%s_wreck' % nm, (x, cy, base))
    return [ring.object('bastion_battery_' + nm, mats, (x, cy, base), sc, bevel=.02),
            gun.object('bastion_gun_' + nm, mats, (x, cy, gz), sc, bevel=.02)]


def forward_cannon(s, sc, mats):
    """Octagonal cannon pod with a pointed drill muzzle beside the chevron (design sheet; traced at x .4-1.45)."""
    h = br.Solids(['paint', 'panel', 'metal', 'glow'])
    lo, hi = sorted((s * .42, s * 1.45))
    h.prism([(-2.98, 1.35), (-2.4, 1.35), (-2.4, 2.6), (-2.98, 2.5)], 'x', lo, hi, 'metal')
    cx, cz = s * .95, 1.95
    h.cylinder((cx, 0, cz), 'y', .52, -2.95, -3.72, 'paint', seg=8, phase=math.pi / 8)
    h.cylinder((cx, 0, cz), 'y', .56, -3.3, -3.42, 'panel', seg=8, phase=math.pi / 8)
    h.cylinder((cx, 0, cz), 'y', .44, -3.72, -4.42, 'metal', seg=8, r2=.1, phase=math.pi / 8)
    h.cylinder((cx, 0, cz), 'y', .12, -4.42, -4.54, 'glow', seg=8)
    h.box((cx - .04, -3.66, cz + .46), (cx + .04, -3.0, cz + .52), 'glow')
    return h.object('bastion_forward_cannon_' + ('left' if s < 0 else 'right'), mats, (cx, -2.7, cz), sc, bevel=.02)


def hatches(sc, mats):
    """Reactor hatch halves (core shutters a/b) over the well; they part sideways by 1.1."""
    out = []
    for s, tag in [(-1, 'a'), (1, 'b')]:
        h = br.Solids(['paint', 'panel', 'glow'])
        w = WELL[1]
        half = mirror_plan([(.02, w - .71), (.5, w - .71), (.74, w - .35), (.74, w + .35), (.5, w + .71), (.02, w + .71)], s)
        h.loft([[(x, y, 3.42) for x, y in half], [(x, y, 3.58 - .08 * abs(x)) for x, y in half]], 'paint')
        rib = mirror_plan([(.12, w - .55), (.5, w - .55), (.5, w + .55), (.12, w + .55)], s)
        h.loft([[(x, y, 3.5) for x, y in rib], [(x, y, 3.62 - .08 * abs(x)) for x, y in rib]], 'panel')
        h.box((min(s * .02, s * .07), w - .67, 3.5), (max(s * .02, s * .07), w + .67, 3.6), 'glow')
        out.append(h.object('bastion_core_shutter_' + tag, mats, (s * .4, WELL[1], 3.5), sc, bevel=.02))
    return out


def reactor(sc, mats):
    """The core: a glowing reactor in the well, on the ray through its fixed target."""
    h = br.Solids(['glow', 'metal', 'steel'])
    h.cylinder((WELL[0], WELL[1], 0), 'z', .52, 2.66, 3.0, 'metal', seg=16)
    h.cylinder((WELL[0], WELL[1], 0), 'z', .46, 3.0, 3.22, 'glow', seg=16, r2=.3)
    for k in range(6):
        a = k * math.pi / 3
        px, py = WELL[0] + .5 * math.cos(a), WELL[1] + .5 * math.sin(a)
        h.box((px - .05, py - .05, 2.66), (px + .05, py + .05, 3.3), 'steel')
    return h.object('bastion_core', mats, (WELL[0], WELL[1], 2.9), sc, bevel=.015)


def compare(objects):
    br.compare('bastion', objects, os.path.join(br.LOOKDEV, 'bastion-v5-compare.png'), (0, -.1, 2.4), 11.5)


def build(export=True, preview=True):
    import bpy
    sc = br.scene('Last Worlds — Remodel BASTION')
    mats = materials()
    hull = br.Solids(['paint', 'panel', 'metal', 'tread', 'steel', 'glow'])
    for s in (-1, 1):
        tracks(s, hull)
        shoulders(s, hull)
        exhausts(s, hull)
    body(hull)
    objects = [hull.object('bastion_hull', mats, (0, 0, 0), sc, bevel=.03)]
    for s in (-1, 1):
        objects += wheels(s, mats, sc)
        objects += battery(s, sc, mats)
        objects.append(battery(s, sc, mats, wreck=True))
        objects.append(forward_cannon(s, sc, mats))
    objects += hatches(sc, mats)
    objects.append(reactor(sc, mats))
    bpy.context.view_layer.update()
    br.texture_bake(objects, 'bastion', 'khepri')
    live = [o for o in objects if not o.name.endswith('_wreck')]
    br.bake_ao(objects, live)
    objects.append(br.marker('bastion_remodel_v5', sc=sc, source_file=br.SOURCES['bastion'], scale_vs_v4=SCALE,
                             note='Clean remodel traced over the supplied GLB; no source geometry exported'))
    result = None
    if export:
        path = os.path.join(br.ROOT, 'public', 'assets', 'khepri', 'bastion-9-%s.glb' % LABEL)
        result = br.export(path, objects, 'Last Worlds — BASTION-9 remodel traced over the user-supplied GLB')
    for o in objects:
        if o.name.endswith('_wreck'):
            o.hide_render = True
    if preview:
        os.makedirs(br.LOOKDEV, exist_ok=True)
        br.game_view(sc, (0, .1, 2.4), 12.5, os.path.join(br.LOOKDEV, 'bastion-v5-game.png'),
                     objects=[o for o in objects if o.type == 'MESH' and not o.name.endswith('_wreck')])
    return objects, result
