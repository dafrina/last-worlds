"""WARDEN-1 v5: a bulky, layered remodel after the user's design sheet (front elevation).

There is no supplied GLB for the Warden: art/concepts/boss-sheets/warden.jpg is the reference,
measured off the sheet (about 7.6 units across) and stacked as it shows: huge chevron side blocks
over big thruster housings with white cladding on their flanks, heavy twin-barrel turret pods on
top of them, inner armour towers with dark vent modules and small thrusters below, and a tall
octagonal command column whose glowing slot is the seam of its two front armour halves (the core
hatches), under a crowned cap with two tall masts. Every white block carries raised plates, panel
grooves, bolts, warning marks and orange light slits (the user found the first pass cheap-looking).

Combat geometry is unchanged (src/content/warden.ts: pods x = +-2.1 at s 0, command core 0.9
behind, render-only target height 2.4). The turret pods yaw about their own centres, which sit on
the 55-degree camera ray through their targets; the reactor sits on the core's ray behind the
hatches, which slide apart by 0.8. It flies: the thruster nozzles sit about 1.15 above the ground.
Backs and undersides stay plain. Blender axes: x right, y away from the player, z up; ground z = 0.
"""
import math, os
from mathutils import Vector, Matrix
import boss_remodel as br

POD_X, CORE_Y, TARGET_Z = 2.1, .9, 2.4   # src/content/warden.ts (podOffset, commandS, targetHeight)
LABEL = 'v5-remodel'
TURRET_Z = 3.7                           # turret centre height (the sheet's upper turrets)
NOZZLE_Z = 1.15                          # thruster nozzles: it hovers on them
PALETTE = dict(
    # Armour paints are nearly dielectric: Luna's black sky would turn metallic white into grey.
    paint=('#e8e7e2', .56, .03, None), panel=('#cdccc7', .58, .04, None), metal=('#2e3035', .45, .55, None),
    steel=('#80858c', .4, .6, None), stripe=('#d79a2a', .55, .1, None), glow=('#2a1006', .5, .2, '#ff8a2a'),
    jet=('#0c1824', .4, .3, '#8fd2ff'),
)


def materials():
    # 'jet' has no 'glow' in its name: the view keeps it (its glow materials become heat and lamps).
    return {key: br.material('warden_' + key, c, r, m, e, 1.0 if e else 0) for key, (c, r, m, e) in PALETTE.items()}


def ray_y(z, target_y):
    return br.ray_y(z, target_y, TARGET_Z)


def box(h, x0, x1, y0, y1, z0, z1, mat, c=0.0):
    h.box((min(x0, x1), min(y0, y1), min(z0, z1)), (max(x0, x1), max(y0, y1), max(z0, z1)), mat, chamfer=c)


# ----------------------------------------------------------------------------- surface detail
def front_panel(h, x0, x1, z0, z1, y, mat='panel', t=.035):
    """A raised plate on a front (-y) face at y."""
    box(h, x0, x1, y - t, y, z0, z1, mat)


def front_grooves(h, x0, x1, z0, z1, y, mat='metal', w=.018):
    """Dark panel lines outlining a rectangle on a front face."""
    for a, b, c, d in [(x0, x1, z0, z0 + w), (x0, x1, z1 - w, z1), (x0, x0 + w, z0, z1), (x1 - w, x1, z0, z1)]:
        box(h, a, b, y - .012, y + .004, c, d, mat)


def top_panel(h, x0, x1, y0, y1, z, mat='panel', t=.035):
    box(h, x0, x1, y0, y1, z, z + t, mat)


def top_grooves(h, x0, x1, y0, y1, z, mat='metal', w=.02):
    for a, b, c, d in [(x0, x1, y0, y0 + w), (x0, x1, y1 - w, y1), (x0, x0 + w, y0, y1), (x1 - w, x1, y0, y1)]:
        box(h, a, b, c, d, z - .004, z + .012, mat)


def bolts_front(h, xs, z, y, mat='steel', r=.028):
    for x in xs:
        box(h, x - r, x + r, y - .03, y, z - r, z + r, mat)


def bolts_top(h, pts, z, mat='steel', r=.028):
    for x, y in pts:
        box(h, x - r, x + r, y - r, y + r, z, z + .03, mat)


def slit(h, x0, x1, z0, z1, y, mat='glow'):
    """An orange light slit set into a front face (a dark frame around a hot core)."""
    box(h, x0 - .025, x1 + .025, y - .02, y + .002, z0 - .025, z1 + .025, 'metal')
    box(h, x0, x1, y - .035, y, z0, z1, mat)


def vents_front(h, x0, x1, z0, z1, y, n=5):
    box(h, x0, x1, y - .01, y + .002, z0, z1, 'metal')
    step = (z1 - z0) / n
    for k in range(n):
        z = z0 + (k + .3) * step
        box(h, x0 + .04, x1 - .04, y - .05, y - .01, z, z + step * .45, 'steel')


def warning(h, x, z, y, size=.13):
    """A small amber warning triangle on a front face."""
    pts = [(x - size / 2, z - size * .4), (x + size / 2, z - size * .4), (x, z + size * .5)]
    h.loft([[(px, y - .006, pz) for px, pz in pts], [(px, y - .018, pz) for px, pz in pts]], 'stripe')


def chevron(h, cx, cz, y, s=1.0):
    """The sheet's Warden chevron mark: two nested dark V strokes."""
    for dz in (0, .17 * s):
        for k in (-1, 1):
            a, b = (cx + k * .34 * s, cz + .2 * s + dz), (cx, cz - .05 * s + dz)
            q = [(a[0] - .055 * s, a[1]), (a[0] + .055 * s, a[1]), (b[0] + .055 * s, b[1]), (b[0] - .055 * s, b[1])]
            h.loft([[(px, y - .006, pz) for px, pz in q], [(px, y - .03, pz) for px, pz in q]], 'metal')


# ----------------------------------------------------------------------------- masses
def side_block(s, h):
    """The huge chevron block: lower front bevel, cladding, raised plates, mark and light."""
    lo, hi = sorted((s * 1.62, s * 3.08))
    prof = [(-1.25, 2.08), (1.35, 2.08), (1.35, 3.24), (-1.45, 3.24), (-1.45, 2.36)]
    h.prism(prof, 'x', lo, hi, 'paint')
    fx = lambda a: s * a
    # Front: a big raised panel with grooves, the chevron, bolts and a light slit.
    flo, fhi = sorted((fx(1.78), fx(2.92)))
    front_panel(h, flo, fhi, 2.52, 3.12, -1.45)
    front_grooves(h, flo, fhi, 2.52, 3.12, -1.485)
    chevron(h, fx(2.35), 2.74, -1.485, 1.0)
    bolts_front(h, [fx(1.86), fx(2.84)], 3.04, -1.485)
    bolts_front(h, [fx(1.86), fx(2.84)], 2.6, -1.485)
    slit(h, *sorted((fx(2.62), fx(2.86))), 2.38, 2.44, -1.33)
    # Top: plate field with grooves and bolts (the camera sees this most).
    for y0, y1 in [(-1.32, -.1), (.05, 1.22)]:
        top_panel(h, flo, fhi, y0, y1, 3.24)
        top_grooves(h, flo, fhi, y0, y1, 3.275)
    bolts_top(h, [(fx(1.83), -1.24), (fx(2.87), -1.24), (fx(1.83), 1.14), (fx(2.87), 1.14)], 3.275)
    # Orange running lights along the roof's front edge (seen from the game camera).
    for a, b in [(1.9, 2.15), (2.55, 2.8)]:
        box(h, *sorted((fx(a), fx(b))), -1.42, -1.36, 3.24, 3.29, 'glow')
    # Outer cladding: two white plates with a dark gap, a vent and an amber light.
    olo, ohi = sorted((s * 3.08, s * 3.72))
    box(h, olo, ohi, -1.12, 1.12, 1.92, 3.0, 'metal', c=.08)
    clo, chi = sorted((s * 3.12, s * 3.78))
    box(h, clo, chi, -1.08, -.04, 2.0, 3.12, 'paint', c=.06)
    box(h, clo, chi, .04, 1.08, 2.0, 3.12, 'paint', c=.06)
    front_grooves(h, clo, chi, 2.05, 3.07, -1.08)
    vents_front(h, *sorted((s * 3.2, s * 3.66)), 2.12, 2.5, -1.09, 4)
    slit(h, *sorted((s * 3.3, s * 3.56)), 2.86, 2.92, -1.1)
    top_grooves(h, clo, chi, -1.08, -.04, 3.12)


def thrusters(s, h):
    """Big thruster housings under the side blocks (blue jets) with armour fronts."""
    for y, r in [(-.35, .66), (.9, .5)]:
        cx = s * 2.33
        h.cylinder((cx, y, 0), 'z', r, NOZZLE_Z + .2, 2.1, 'metal', seg=16)
        h.cylinder((cx, y, 0), 'z', r * .9, NOZZLE_Z + .02, NOZZLE_Z + .2, 'steel', seg=16, r2=r * .98)
        h.cylinder((cx, y, 0), 'z', r * .72, NOZZLE_Z, NOZZLE_Z + .03, 'jet', seg=14)
        for k in range(8):  # cooling ribs around the housing
            a = k * math.pi / 4 + math.pi / 8
            px, py = cx + math.cos(a) * r, y + math.sin(a) * r
            box(h, px - .04, px + .04, py - .04, py + .04, NOZZLE_Z + .25, 2.05, 'steel')
    # Armour front on the main housing, with its own plate and light.
    lo, hi = sorted((s * 1.9, s * 2.76))
    box(h, lo, hi, -1.12, -.62, 1.55, 2.08, 'paint', c=.07)
    front_grooves(h, lo + .05, hi - .05, 1.6, 2.03, -1.12)
    slit(h, *sorted((s * 2.1, s * 2.36)), 1.7, 1.75, -1.13)
    bolts_front(h, [lo + .1, hi - .1], 1.96, -1.12)


def turret(s, sc, mats, wreck=False):
    """A heavy turret pod: armoured housing, dark mantlet, long twin barrels; yaws about its centre,
    which sits on the camera ray through its target (x +-2.1, height 2.4)."""
    nm = 'left' if s < 0 else 'right'
    h = br.Solids(['paint', 'panel', 'metal', 'steel', 'glow', 'stripe'])
    x, y, z = s * POD_X, ray_y(TURRET_Z, 0), TURRET_Z
    # Turret ring on the side block's roof, and the armoured housing.
    h.cylinder((x, y, 0), 'z', .6, 3.24, 3.32, 'metal', seg=12)
    box(h, x - .5, x + .5, y - .52, y + .62, z - .42, z + .38, 'paint', c=.12)
    box(h, x - .42, x + .42, y - .3, y + .5, z + .38, z + .46, 'panel', c=.08)
    top_grooves(h, x - .42, x + .42, y - .3, y + .5, z + .46)
    bolts_top(h, [(x - .34, y - .22), (x + .34, y - .22), (x - .34, y + .42), (x + .34, y + .42)], z + .46)
    box(h, x - .2, x + .2, y + .52, y + .58, z + .38, z + .43, 'glow')
    box(h, x - .3, x + .3, y + .62, y + .95, z - .32, z + .22, 'metal', c=.05)   # rear machinery
    # Side armour cheeks with an orange slit (the sheet's lit cheek panel).
    for k in (-1, 1):
        ex = x + k * .5
        box(h, ex, ex + k * .07, y - .4, y + .5, z - .3, z + .28, 'panel')
        box(h, ex + k * .07, ex + k * .09, y - .2, y + .3, z - .12, z + .12, 'glow')
    warning(h, x - s * .24, z + .2, y - .52)
    # Mantlet and barrels (forward and a little outward, as the sheet's turrets splay).
    box(h, x - .34, x + .34, y - .64, y - .52, z - .28, z + .28, 'metal', c=.04)
    axis = Vector((s * .28, -1, 0)).normalized()
    side = Vector((-axis.y, axis.x, 0))
    length = .7 if wreck else 1.45

    def ring(c, r):
        return [c + side * (r * math.cos(a)) + Vector((0, 0, r * math.sin(a))) for a in [k * math.pi / 4 + math.pi / 8 for k in range(8)]]
    for dz in (.14, -.14):
        base = Vector((x + s * .1, y - .6, z + dz))
        h.loft([ring(base, .13), ring(base + axis * .32, .13)], 'metal')
        h.loft([ring(base + axis * .32, .095), ring(base + axis * length, .095)], 'steel')
        for d in (.55, 1.0):
            if d < length:
                h.loft([ring(base + axis * d, .115), ring(base + axis * (d + .08), .115)], 'metal')
        if not wreck:
            tip = base + axis * length
            h.loft([ring(tip, .12), ring(tip + axis * .14, .12)], 'metal')
            h.loft([ring(tip + axis * .14, .07), ring(tip + axis * .16, .07)], 'glow')
    name = 'warden_pod_%s%s' % (nm, '_wreck' if wreck else '')
    ob = h.object(name, mats, (x, y, z), sc, bevel=.02)
    if wreck:
        ob.data.transform(Matrix.Rotation(math.radians(16 * s), 4, 'Y') @ Matrix.Rotation(math.radians(-9), 4, 'X'))
    return ob


def inner_tower(s, h):
    """Inner armour towers beside the column, with vent modules and small thrusters below."""
    lo, hi = sorted((s * .66, s * 1.22))
    box(h, lo, hi, -.6, 1.55, 2.54, 3.8, 'paint', c=.08)
    front_panel(h, lo + .06, hi - .06, 3.02, 3.7, -.6)
    front_grooves(h, lo + .06, hi - .06, 3.02, 3.7, -.635)
    box(h, lo + .12, hi - .12, -.645, -.6, 3.48, 3.62, 'metal')         # dark viewport
    slit(h, lo + .14, lo + .3, 3.52, 3.58, -.65)
    slit(h, lo + .14, hi - .14, 2.66, 2.7, -.61)
    warning(h, (lo + hi) / 2 + s * .12, 2.86, -.6)
    top_panel(h, lo + .05, hi - .05, -.5, 1.4, 3.8)
    top_grooves(h, lo + .05, hi - .05, -.5, .4, 3.835)
    bolts_top(h, [(lo + .1, -.42), (hi - .1, -.42)], 3.835)
    box(h, lo + .15, hi - .15, -.58, -.53, 3.8, 3.85, 'glow')
    # Vent module (dark, grilled) between the tower and the side block.
    vlo, vhi = sorted((s * 1.08, s * 1.6))
    box(h, vlo, vhi, -.62, .7, 2.08, 2.86, 'metal', c=.05)
    vents_front(h, vlo + .04, vhi - .04, 2.16, 2.78, -.62, 6)
    # Small thruster under it, with a light.
    tx = s * 1.3
    box(h, tx - .2, tx + .2, -.45, .3, 1.48, 2.08, 'metal', c=.05)
    h.cylinder((tx, -.08, 0), 'z', .2, NOZZLE_Z + .14, 1.48, 'steel', seg=10, r2=.17)
    h.cylinder((tx, -.08, 0), 'z', .15, NOZZLE_Z + .12, NOZZLE_Z + .15, 'jet', seg=10)
    slit(h, tx - .12, tx + .12, 1.86, 1.91, -.46)
    # Beam from the tower to the turret block (the sheet's dark linkage).
    blo, bhi = sorted((s * 1.18, s * 1.66))
    box(h, blo, bhi, -.35, .35, 3.18, 3.42, 'metal', c=.04)
    h.cylinder((s * 1.4, 0, 3.3), 'y', .07, -.4, .4, 'steel', seg=8)


def column(h):
    """The static command column: back wall and sides behind the hatches, the lower nose with the
    centre thruster, and the crowned cap with its window and the two masts."""
    box(h, -.56, .56, .84, 2.0, 1.6, 3.84, 'paint', c=.08)               # body (behind the reactor)
    box(h, -.16, .16, .76, .86, 1.75, 3.7, 'metal')                      # dark channel back wall
    for s in (-1, 1):
        lo, hi = sorted((s * .56, s * .66))
        box(h, lo, hi, -.12, 2.0, 1.72, 3.84, 'metal')                    # dark side frame
        for z in (2.1, 2.9, 3.5):
            box(h, s * .6, s * .68, -.16, -.1, z, z + .1, 'glow')
    # Lower nose under the hatches: white block, light, and the centre thruster.
    box(h, -.42, .42, -.55, .7, 1.42, 1.72, 'paint', c=.07)
    slit(h, -.16, .16, 1.54, 1.6, -.56)
    h.cylinder((0, .05, 0), 'z', .34, NOZZLE_Z + .02, 1.42, 'metal', seg=14, r2=.3)
    h.cylinder((0, .05, 0), 'z', .26, NOZZLE_Z, NOZZLE_Z + .03, 'jet', seg=12)
    # Crowned cap with its amber window and a raised crown.
    box(h, -.52, .52, -.08, 1.7, 3.84, 4.28, 'paint', c=.1)
    box(h, -.36, .36, .1, 1.4, 4.28, 4.42, 'panel', c=.08)
    slit(h, -.28, .28, 4.0, 4.1, -.09)
    for x in (-.4, .4):
        box(h, x - .05, x + .05, -.1, -.05, 3.94, 4.16, 'metal')
    h.cylinder((0, .7, 0), 'z', .06, 4.42, 4.8, 'steel', seg=6)
    h.cylinder((0, .7, 0), 'z', .1, 4.8, 4.86, 'metal', seg=8)
    # Masts with segments and orange tips (the sheet's two tall spires), plus short antennas.
    for s in (-1, 1):
        x, y = s * .74, .9
        box(h, x - .14, x + .14, y - .14, y + .14, 3.84, 4.1, 'metal', c=.04)
        h.cylinder((x, y, 0), 'z', .045, 4.1, 5.06, 'steel', seg=6)
        for z in (4.35, 4.7):
            h.cylinder((x, y, 0), 'z', .08, z, z + .14, 'metal', seg=8)
        h.cylinder((x, y, 0), 'z', .055, 4.62, 4.68, 'glow', seg=6)
        h.cylinder((x, y, 0), 'z', .06, 5.0, 5.1, 'glow', seg=6)
        h.cylinder((s * .98, 1.2, 0), 'z', .03, 3.8, 4.45, 'steel', seg=5)
    # Rear plant deck (its top is in the camera's view): armour with plates and roof vents.
    box(h, -2.6, 2.6, 1.35, 2.1, 1.95, 3.0, 'paint', c=.12)
    for x0, x1 in [(-2.4, -1.25), (1.25, 2.4)]:
        top_panel(h, x0, x1, 1.45, 2.0, 3.0)
        top_grooves(h, x0, x1, 1.45, 2.0, 3.035)
        for k in range(4):
            vx = x0 + .12 + k * (x1 - x0 - .24) / 3
            box(h, vx - .06, vx + .06, 1.55, 1.9, 3.035, 3.08, 'metal')
    # Chassis spine beside the column (not in front of its hatches), with pipework under the towers.
    for s in (-1, 1):
        box(h, s * .66, s * 3.0, -.3, 1.5, 2.08, 2.5, 'metal')
        for z in (2.18, 2.38):
            h.cylinder((0, -.42, z), 'x', .07, s * .66, s * 1.08, 'steel', seg=8)
        for x in (.8, .95):
            box(h, s * x - .05, s * x + .05, -.5, -.36, 2.12, 2.46, 'metal')


def hatches(sc, mats):
    """The column's octagonal white front armour, split down its glowing slot: the core hatches."""
    out = []
    for i, s in enumerate((-1, 1)):
        h = br.Solids(['paint', 'panel', 'metal', 'glow', 'stripe'])
        half = [(.02, 1.72), (.3, 1.72), (.55, 2.02), (.55, 3.5), (.38, 3.82), (.02, 3.82)]
        prof = [(s * x, z) for x, z in half]
        h.prism(prof if s > 0 else prof[::-1], 'y', -.16, .22, 'paint')
        # Raised inner plate, the hot seam edge, bolts and a warning mark.
        plate = [(.1, 1.95), (.42, 2.12), (.42, 3.4), (.3, 3.62), (.1, 3.62)]
        pp = [(s * x, z) for x, z in plate]
        h.prism(pp if s > 0 else pp[::-1], 'y', -.2, -.16, 'panel')
        box(h, s * .02, s * .07, -.21, -.16, 1.95, 3.55, 'glow')
        box(h, s * .02, s * .07, -.21, -.16, 3.62, 3.74, 'glow')
        bolts_front(h, [s * .46], 2.2, -.16)
        bolts_front(h, [s * .46], 3.3, -.16)
        warning(h, s * .3, 2.3, -.2, .1)
        out.append(h.object('warden_core_hatch_%d' % i, mats, (s * .3, .03, 2.77), sc, bevel=.015))
    return out


CORE_Z = 2.9


def reactor(sc, mats, wreck=False):
    """A tall glowing reactor bar behind the hatches, on the core's camera ray."""
    h = br.Solids(['glow', 'metal', 'steel'])
    cy = ray_y(CORE_Z, CORE_Y)
    if wreck:
        h.cylinder((0, cy, 0), 'z', .16, 2.3, 3.2, 'metal', seg=8)
        h.cylinder((0, cy, 0), 'z', .22, 2.5, 2.6, 'steel', seg=8)
        return h.object('warden_core_wreck', mats, (0, cy, CORE_Z), sc, bevel=.01)
    h.cylinder((0, cy, 0), 'z', .17, 2.25, 3.55, 'glow', seg=10)
    for z in (2.25, 2.62, 3.0, 3.38):
        h.cylinder((0, cy, 0), 'z', .22, z, z + .07, 'metal', seg=10)
    h.cylinder((0, cy, 0), 'z', .1, 3.55, 3.66, 'steel', seg=8)
    return h.object('warden_core', mats, (0, cy, CORE_Z), sc, bevel=.01)


def compare(objects):
    """No supplied GLB for the Warden: render the remodel from the four views instead."""
    import bpy
    sc = bpy.context.scene
    meshes = [o for o in objects if o.type == 'MESH' and not o.hide_render]
    rows = []
    for view in ('game', 'top', 'side', 'front'):
        p = os.path.join(br.LOOKDEV, '_warden_%s.png' % view)
        br.render_view(sc, view, (0, .1, 3.0), 9.5, p, 640, meshes, light='ice')
        rows.append([p])
    return br.compose([rows[0] + rows[1], rows[2] + rows[3]], os.path.join(br.LOOKDEV, 'warden-v5-compare.png'))


def build(export=True, preview=True):
    import bpy
    sc = br.scene('Last Worlds — Remodel WARDEN')
    mats = materials()
    hull = br.Solids(['paint', 'panel', 'metal', 'steel', 'stripe', 'glow', 'jet'])
    for s in (-1, 1):
        side_block(s, hull)
        thrusters(s, hull)
        inner_tower(s, hull)
    column(hull)
    objects = [hull.object('warden_hull', mats, (0, 0, 0), sc, bevel=.025)]
    for s in (-1, 1):
        objects.append(turret(s, sc, mats))
        objects.append(turret(s, sc, mats, wreck=True))
    objects.append(reactor(sc, mats))
    objects.append(reactor(sc, mats, wreck=True))
    objects += hatches(sc, mats)
    bpy.context.view_layer.update()
    br.texture_bake(objects, 'warden', 'luna')
    live = [o for o in objects if not o.name.endswith('_wreck')]
    br.bake_ao(objects, live, ground=-10)  # no ground contact while it hovers
    objects.append(br.marker('warden_beacon', (-.74, .9, 5.1), sc))
    for i, (x, y) in enumerate([(-2.33, -.35), (2.33, -.35), (-2.33, .9), (2.33, .9)]):
        objects.append(br.marker('warden_thruster_%d' % i, (x, y, NOZZLE_Z), sc))
    # The airborne gap under the nozzles; the view reads it to keep the thrusters burning.
    objects.append(br.marker('warden_remodel_v5', sc=sc, hover=NOZZLE_Z, note='Bulky remodel after the WARDEN-1 design sheet'))
    result = None
    if export:
        path = os.path.join(br.ROOT, 'public', 'assets', 'luna', 'warden-%s.glb' % LABEL)
        result = br.export(path, objects, 'Last Worlds — WARDEN-1 remodel after the design sheet')
    for o in objects:
        if o.name.endswith('_wreck'):
            o.hide_render = True
    if preview:
        br.game_view(sc, (0, .1, 3.0), 9.5, os.path.join(br.LOOKDEV, 'warden-v5-game.png'),
                     objects=[o for o in objects if o.type == 'MESH' and not o.hide_render], light='ice')
    return objects, result
