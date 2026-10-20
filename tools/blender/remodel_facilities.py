"""Facility compounds v2: the gun-court plants remodelled after the user's facility sheets.

art/concepts/facility-sheets/{khepri,vesper,nacre}.jpg are the references (user, 20 October: "take the
render arts as inspiration"; the v1 compounds read flat). Khepri borrows the heavy refinery tower and
pipeline junction: bone armour with rust-orange cladding, domed tanks, banded pipes, orange light slits
and lamp masts. Vesper borrows the thermal reactor and heat exchanger: angular graphite blocks, sloped
buttresses, frosted roofs and glowing exchanger columns. Nacre borrows the monolith relay and mire pump:
lavender stone, crescent arcs, glowing basins and ember slits.

The gameplay contract of v1 (src/render/facility-view.ts, tests/world/cinematic-assets.test.ts) is kept:
node names facility_<planet>[_large]; the battery's court around the origin stays below 0.25 within
|x| < .65, |y| < .7; small plants fit |x| < 3.35, -1.8 < y < 4.6, z <= 2.651; large ones |x| < 4.4,
-2.8 < y < 6.1, z <= 2.831, with 1.8-2.2x the small plan area. Foundations reach below the ground for
uneven seats. The game camera looks from the front (-y) at 55 degrees, so roofs and front faces carry
the detail; backs and undersides stay plain.

Each planet's two plants share one baked atlas (boss_remodel.texture_bake) and one GLB:
public/assets/<planet>/facility-compounds-v2.glb. Headless: remodel_run.py facilities [--planet=khepri].
Blender axes: x right, y away from the player, z up; ground z = 0.
"""
import math, os, sys
from mathutils import Vector
import boss_remodel as br

LABEL = 'v2-remodel'
PLANETS = ('khepri', 'vesper', 'nacre')
LIMITS = {False: dict(half=3.34, front=-1.79, back=4.59, top=2.651), True: dict(half=4.39, front=-2.79, back=6.09, top=2.831)}
PALETTES = {  # key: (colour, roughness, metallic, emission)
    'khepri': dict(paint=('#d9cbb4', .62, .04, None), accent=('#b8582a', .55, .1, None), metal=('#2b2724', .45, .6, None),
                   steel=('#6e675f', .42, .55, None), stripe=('#dd9a30', .55, .08, None), glow=('#2a1006', .5, .2, '#ff8a2a')),
    'vesper': dict(paint=('#40454e', .5, .2, None), accent=('#727b88', .5, .25, None), metal=('#1d2127', .45, .55, None),
                   steel=('#8d949e', .4, .55, None), stripe=('#d27a2e', .55, .1, None), glow=('#2a0e04', .5, .2, '#ff7a26')),
    'nacre': dict(paint=('#7f77ab', .6, .05, None), accent=('#554a86', .55, .1, None), metal=('#251f3b', .45, .45, None),
                  steel=('#7c76a8', .45, .4, None), stripe=('#3fb6b0', .5, .1, None), glow=('#06201e', .5, .2, '#5ff0e4'),
                  glow_ember=('#2a0804', .5, .2, '#ff5a3a'), glow_pool=('#04201f', .2, .0, '#1f9c95')),
}


for _p in PLANETS:  # finer plating than the bosses: these sit lower and wider in the frame
    br.STYLES[_p + '_facility'] = dict(br.STYLES[_p], **({'cells': br.STYLES[_p]['cells'] * 1.5} if 'cells' in br.STYLES[_p] else {'panel': .55}))
# Vesper: broad snow caps on every ledge (the sheet), not a marbled frost.
br.STYLES['vesper_facility'].update(dust_amount=.46, dust_scale=1.2, dust_lo=.3, dust_hi=.55)


def materials(planet):
    return {k: br.material('facility_%s_%s' % (planet, k), c, r, m, e, 2.2 if e else 0) for k, (c, r, m, e) in PALETTES[planet].items()}


class Kit:
    """Two solids: major masses get the chamfer bevel, small trim does not (a bevel quadruples a small box's
    triangles for an edge the camera cannot resolve). Finished into one node."""

    def __init__(self, roles):
        self.major, self.minor = br.Solids(roles), br.Solids(roles)

    def box(self, lo, hi, mat, chamfer=0.0):
        size = [hi[i] - lo[i] for i in range(3)]
        (self.minor if min(size) < .07 or max(size) < .3 else self.major).box(lo, hi, mat, chamfer)

    def cylinder(self, centre, axis, r, a, b, mat, seg=12, r2=None, phase=0.0):
        (self.minor if r < .12 or abs(b - a) < .07 else self.major).cylinder(centre, axis, r, a, b, mat, seg, r2, phase)

    def gear(self, *args):
        self.minor.gear(*args)

    def prism(self, *args, **kw):
        self.major.prism(*args, **kw)

    def wedge(self, *args, **kw):
        self.major.wedge(*args, **kw)

    def loft(self, loops, mat, caps=True):
        self.major.loft(loops, mat, caps)

    def object(self, name, mats, sc):
        a = self.major.object(name + '_major', mats, (0, 0, 0), sc, bevel=.02)
        b = self.minor.object(name + '_minor', mats, (0, 0, 0), sc, bevel=0)
        ob = br.join([a, b], name, (0, 0, 0))
        br.merge_slots(ob)
        return ob


def B(h, x0, x1, y0, y1, z0, z1, mat, c=0.0):
    """Order-free box: mirrored callers pass s*x."""
    h.box((min(x0, x1), min(y0, y1), min(z0, z1)), (max(x0, x1), max(y0, y1), max(z0, z1)), mat, chamfer=c)


def cyl(h, x, y, r, z0, z1, mat, seg=16, r2=None):
    h.cylinder((x, y, 0), 'z', r, z0, z1, mat, seg=seg, r2=r2)


def dome(h, x, y, r, z, rise, mat, seg=16, rings=5, top=.22):
    """A cap lofted from radius r at z up to `top`*r at z + rise."""
    loops = []
    for i in range(rings + 1):
        a = (math.pi / 2) * i / rings * (1 - top * .6)
        rad = max(r * math.cos(a), r * top)
        loops.append([(x + rad * math.cos(2 * math.pi * k / seg), y + rad * math.sin(2 * math.pi * k / seg), z + rise * math.sin(a) / math.sin((math.pi / 2) * (1 - top * .6))) for k in range(seg)])
    h.loft(loops, mat)


def pipe(h, points, r, mat, seg=10, bend=.35):
    """A tube through the points with rounded corners (quadratic fillets) and parallel-transported rings."""
    pts = [Vector(p) for p in points]
    path = [pts[0]]
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        d = min(bend, (b - a).length / 2, (c - b).length / 2)
        p0, p2 = b + (a - b).normalized() * d, b + (c - b).normalized() * d
        for t in (0, .25, .5, .75, 1):
            path.append(p0 * (1 - t) ** 2 + b * 2 * t * (1 - t) + p2 * t * t)
    path.append(pts[-1])
    tangents = [((path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()) for i in range(len(path))]
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < .9 else Vector((1, 0, 0))
    n = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
    loops = []
    for i, (p, t) in enumerate(zip(path, tangents)):
        if i:
            n = (n - t * n.dot(t)).normalized()
        b = t.cross(n)
        loops.append([tuple(p + (n * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
    h.loft(loops, mat)


def ring(h, p, axis, r, w, mat, seg=12):
    """A flange or band around a straight pipe at p along an axis."""
    c = {'x': 0, 'y': 1, 'z': 2}[axis]
    h.cylinder(tuple(p), axis, r, p[c] - w / 2, p[c] + w / 2, mat, seg=seg)


# ----------------------------------------------------------------------------- shared pieces
def plinth(h, x0, x1, y0, y1, top=.18, skirt=.1, floor=-.75):
    """Dark foundation whose sloped skirt reaches below uneven ground; a steel lip and hazard dashes on the front."""
    x0, x1 = min(x0, x1), max(x0, x1)
    plan = lambda e: [(x0 - e, y0 - e), (x1 + e, y0 - e), (x1 + e, y1 + e), (x0 - e, y1 + e)]
    h.wedge(plan(skirt), floor, 0, 'metal', top=plan(0))
    B(h, x0, x1, y0, y1, 0, top, 'metal', c=.04)
    B(h, x0 + .04, x1 - .04, y0 - .015, y0 + .05, top - .05, top + .015, 'steel')
    k, step = 0, .34
    x = x0 + .14
    while x + .18 < x1 - .1:
        B(h, x, x + .18, y0 - .02, y0, .04, top - .06, 'stripe' if k % 2 == 0 else 'metal')
        x += step
        k += 1


def front_slit(h, x, y, z0, z1, w=.07, mat='glow'):
    """A framed vertical light slit on a front face at y."""
    B(h, x - w - .05, x + w + .05, y - .05, y, z0 - .06, z1 + .06, 'metal')
    B(h, x - w, x + w, y - .07, y - .04, z0, z1, mat)


def grooves(h, x0, x1, z0, z1, y, mat='metal', w=.02):
    for a, b, c, d in [(x0, x1, z0, z0 + w), (x0, x1, z1 - w, z1), (x0, x0 + w, z0, z1), (x1 - w, x1, z0, z1)]:
        B(h, a, b, y - .014, y + .002, c, d, mat)


def fan(h, x, y, z, r, mat='metal'):
    """A roof fan: housing ring, blades and a hub."""
    cyl(h, x, y, r + .06, z, z + .1, 'steel', seg=16)
    cyl(h, x, y, r, z + .1, z + .13, mat, seg=16)
    h.gear((x, y, 0), 'z', r * .92, r * .5, 7, z + .1, z + .16, 'steel')
    cyl(h, x, y, r * .26, z + .1, z + .21, mat, seg=10)


def fins(h, x0, x1, y0, y1, z, height=.22, n=6, mat='steel'):
    """A cooling grille: a low frame and fins across x."""
    B(h, x0, x1, y0, y1, z, z + .05, 'metal')
    for i in range(n):
        y = y0 + .06 + (y1 - y0 - .12) * i / max(n - 1, 1)
        B(h, x0 + .04, x1 - .04, y - .025, y + .025, z + .05, z + height, mat)


def mast(h, x, y, z0, z1, lamp='glow'):
    cyl(h, x, y, .05, z0, z0 + .12, 'metal', seg=8)
    cyl(h, x, y, .022, z0 + .12, z1 - .05, 'steel', seg=6)
    cyl(h, x, y, .035, z1 - .05, z1, lamp, seg=8)


def stack(h, x, y, r, z0, z1, accent='accent'):
    """An exhaust stack with a collar, a coloured band and a dark crown."""
    cyl(h, x, y, r + .05, z0, z0 + .12, 'metal', seg=14)
    cyl(h, x, y, r, z0 + .12, z1 - .1, 'steel', seg=14)
    cyl(h, x, y, r + .015, (z0 + z1) / 2, (z0 + z1) / 2 + .1, accent, seg=14)
    cyl(h, x, y, r + .035, z1 - .1, z1, 'metal', seg=14)
    cyl(h, x, y, r * .6, z1 - .02, z1 + .005, 'glow', seg=10)


def court(h, inner, front, back, ring_r=.95):
    """The open gun court: a flush turntable ring framing the battery and lamp bollards at its mouth."""
    seg = 28
    outer = [(ring_r * math.cos(2 * math.pi * k / seg), ring_r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    inner_r = ring_r - .14
    # Flush ring of dashes (all below 0.1, well under the court's 0.25 ceiling).
    for k in range(seg):
        if k % 2:
            continue
        a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * (k + 1) / seg
        quad = [(inner_r * math.cos(a0), inner_r * math.sin(a0)), (ring_r * math.cos(a0), ring_r * math.sin(a0)),
                (ring_r * math.cos(a1), ring_r * math.sin(a1)), (inner_r * math.cos(a1), inner_r * math.sin(a1))]
        h.wedge(quad, -.03, .05, 'stripe' if k % 4 == 0 else 'steel')
    for s in (-1, 1):
        # Lamp bollards at the court mouth.
        B(h, s * (inner - .32), s * (inner - .1), front + .12, front + .34, -.1, .5, 'metal', c=.04)
        B(h, s * (inner - .3), s * (inner - .12), front + .14, front + .32, .5, .56, 'glow')


# ----------------------------------------------------------------------------- khepri
def k_tank(h, x, y, r, z0, zb, s=1):
    """Refinery storage tank: steel foot, bone body with rust bands, dome, dark hatch, a framed slit to the front."""
    cyl(h, x, y, r + .07, z0, z0 + .16, 'metal', seg=18)
    cyl(h, x, y, r, z0 + .16, zb, 'paint', seg=18)
    for zb0 in (z0 + .42, zb - .34):
        cyl(h, x, y, r + .02, zb0, zb0 + .13, 'accent', seg=18)
    dome(h, x, y, r, zb, r * .5, 'paint', seg=18)
    top = zb + r * .5
    cyl(h, x, y, r * .3, top - .03, top + .08, 'metal', seg=12)
    cyl(h, x, y, r * .17, top + .08, top + .14, 'steel', seg=10)
    for k in range(6):  # crown bolts
        a = 2 * math.pi * (k + .5) / 6
        cyl(h, x + r * .7 * math.cos(a), y + r * .7 * math.sin(a), .035, zb + r * .22, zb + r * .32, 'steel', seg=6)
    front_slit(h, x, y - r + .03, z0 + .62, zb - .48, w=.045)
    # Ladder cage on the outward flank.
    lx = x + s * (r + .05)
    for dy in (-.09, .09):
        B(h, lx - .02, lx + .02, y + dy - .02, y + dy + .02, z0 + .16, zb + .1, 'steel')
    for z in [z0 + .35 + .22 * i for i in range(int((zb - z0 - .3) / .22))]:
        B(h, lx - .015, lx + .015, y - .09, y + .09, z, z + .025, 'steel')


def k_hall(h, s, xi, xo, y0, y1, z0, z1, roof=True):
    """Machine hall: bone walls, rust cladding with light slits on the front, a rooftop plant and fins."""
    B(h, s * xi, s * xo, y0, y1, z0, z1, 'paint', c=.07)
    # Base course and parapet.
    B(h, s * (xi - .03), s * (xo + .03), y0 - .03, y1 + .03, z0, z0 + .16, 'metal')
    for a, b, c, d in [(xi, xo, y0 - .02, y0 + .08), (xi, xo, y1 - .08, y1 + .02), (xi - .02, xi + .08, y0, y1), (xo - .08, xo + .02, y0, y1)]:
        B(h, s * a, s * b, c, d, z1, z1 + .08, 'steel')
    # Front: rust cladding, two slits, grooves, corner pilasters.
    w = xo - xi
    B(h, s * (xi + .14), s * (xo - .14), y0 - .035, y0, z0 + .26, z1 - .14, 'accent')
    grooves(h, s * (xi + .14), s * (xo - .14), z0 + .26, z1 - .14, y0 - .035)
    for f in (.3, .7):
        front_slit(h, s * (xi + w * f), y0 - .035, z0 + .42, z1 - .3, w=.045)
    for x in (xi, xo):
        B(h, s * (x - .06), s * (x + .06), y0 - .08, y0 + .18, z0, z1 + .06, 'metal')
    # Court wall: a door with a lit lintel and steel ribs.
    d = y0 + (y1 - y0) * .32
    B(h, s * (xi - .05), s * xi, d - .32, d + .32, z0 + .16, z0 + .82, 'metal')
    B(h, s * (xi - .07), s * (xi - .03), d - .26, d + .26, z0 + .86, z0 + .92, 'glow')
    for y in (y0 + (y1 - y0) * .6, y0 + (y1 - y0) * .85):
        B(h, s * (xi - .06), s * xi, y - .07, y + .07, z0 + .16, z1, 'steel')
    # Outer buttresses lean in under the parapet.
    for y in (y0 + .45, (y0 + y1) / 2, y1 - .45):
        h.prism([(s * xo, z0), (s * (xo + .16), z0), (s * xo, z1 - .25)], 'y', y - .1, y + .1, 'accent')
    if not roof:
        return
    # Rooftop plant: a rust machine block with a fan, a sawtooth shed with lit glazing behind it, a hatch.
    mx0, mx1 = xi + .16, xi + .16 + w * .52
    my0, my1 = y0 + .3, y0 + .3 + min(1.25, (y1 - y0) * .4)
    B(h, s * mx0, s * mx1, my0, my1, z1, z1 + .34, 'accent', c=.05)
    B(h, s * mx0, s * mx1, my0 - .02, my0 + .06, z1 + .3, z1 + .36, 'metal')
    fan(h, s * (mx0 + mx1) / 2, (my0 + my1) / 2, z1 + .34, min(mx1 - mx0, my1 - my0) * .36)
    sawtooth(h, s * (xi + .42), s * (xi + w * .6), my1 + .3, 2, .6, z1, .32)
    B(h, s * (mx1 + .35), s * (xo - .2), my0, my0 + .7, z1, z1 + .06, 'steel')  # access hatch
    plates(h, s * (mx1 + .3), s * (xo - .16), my0 + .82, my1 + .9, z1)
    plates(h, s * (xi + .14), s * (mx0 + w * .1), y0 + .14, my0 - .1, z1, n=1)


def sawtooth(h, x0, x1, y, n, depth, z, rise):
    """North-light shed roof: each tooth's upright, glazed face looks at the camera; its slope falls away."""
    x0, x1 = min(x0, x1), max(x0, x1)
    for k in range(n):
        ya = y + k * depth
        h.prism([(ya, z), (ya + depth, z), (ya + depth, z + .05), (ya + .04, z + rise), (ya, z + rise)], 'x', x0, x1, 'accent')
        B(h, x0 + .05, x1 - .05, ya - .03, ya + .01, z + .04, z + rise - .04, 'metal')
        B(h, x0 + .1, x1 - .1, ya - .05, ya - .02, z + rise * .45, z + rise * .62, 'glow')
        B(h, x0 - .02, x1 + .02, ya - .02, ya + .06, z + rise - .02, z + rise + .03, 'steel')


def plates(h, x0, x1, y0, y1, z, n=2, mat='paint'):
    """Raised roof plates with shadow gaps and a lifting lug each: breaks a flat roof into readable panels."""
    x0, x1 = min(x0, x1), max(x0, x1)
    if x1 - x0 < .2 or y1 - y0 < .2:
        return
    step = (y1 - y0) / n
    for k in range(n):
        a, b = y0 + k * step + .03, y0 + (k + 1) * step - .03
        B(h, x0, x1, a, b, z, z + .035, mat)
        B(h, (x0 + x1) / 2 - .05, (x0 + x1) / 2 + .05, (a + b) / 2 - .05, (a + b) / 2 + .05, z + .035, z + .06, 'steel')


def column(h, x, y, r, z0, z1, slit=True, cap='metal'):
    """Refinery process column (the sheet's heavy tower): steel foot, bone shell with rust bands, rust cladding
    and a tall light slit to the front, a dark domed crown with a hatch."""
    seg = 16 if r > .3 else 12
    cyl(h, x, y, r + .06, z0, z0 + .14, 'metal', seg=seg)
    cyl(h, x, y, r, z0 + .14, z1, 'paint', seg=seg)
    for zz in (z0 + .3, z1 - .22):
        cyl(h, x, y, r + .02, zz, zz + .1, 'accent', seg=seg)
    cyl(h, x, y, r + .03, z1 - .04, z1 + .04, 'metal', seg=seg)
    dome(h, x, y, r, z1 + .04, r * .5, cap, seg=seg, rings=4)
    top = z1 + .04 + r * .5
    cyl(h, x, y, r * .3, top - .03, top + .06, 'steel', seg=10)
    if slit and z1 - z0 > .6:
        B(h, x - r * .55, x + r * .55, y - r - .02, y - r * .7, z0 + .44, z1 - .3, 'accent')
        front_slit(h, x, y - r - .02, z0 + .56, z1 - .42, w=max(.03, r * .1))


def k_rear(h, hw, y0, y1, z0, ztop, twin=False):
    """Refinery block behind the court: a lit gate between rust panels, then a cluster of process columns
    (one big, or twin with a lit core and a catwalk), domed shoulder tanks and lamp masts."""
    B(h, -hw, hw, y0, y1, z0, 1.2, 'paint', c=.09)
    B(h, -hw - .03, hw + .03, y0 - .03, y1 + .03, z0, z0 + .16, 'metal')
    B(h, -hw, hw, y0 - .02, y0 + .1, 1.2, 1.28, 'steel')
    # Gate: dark frame, glowing bay, vertical bars.
    B(h, -.5, .5, y0 - .07, y0, z0 + .02, .98, 'metal')
    B(h, -.36, .36, y0 - .09, y0 - .05, z0 + .08, .86, 'glow')
    for x in (-.24, -.08, .08, .24):
        B(h, x - .025, x + .025, y0 - .12, y0 - .07, z0 + .08, .86, 'metal')
    B(h, -.56, .56, y0 - .1, y0 - .02, .98, 1.06, 'stripe')
    for s in (-1, 1):
        B(h, s * .62, s * (hw - .12), y0 - .035, y0, z0 + .3, 1.08, 'accent')
        grooves(h, s * .62, s * (hw - .12), z0 + .3, 1.08, y0 - .035)
        front_slit(h, s * (.62 + (hw - .74) / 2), y0 - .035, z0 + .5, .9, w=.04)
    cy = (y0 + y1) / 2 + .1
    if not twin:
        column(h, 0, cy, .5, 1.24, ztop - .4)
        for s in (-1, 1):
            column(h, s * .8, y1 - .42, .24, 1.24, ztop - .78, slit=False)
            k_small_tank(h, s * .86, y0 + .38, .2, 1.28)
            mast(h, s * 1.0, y1 - .12, 1.28, ztop if s < 0 else ztop - .15)
        pipe(h, [(-.8, y1 - .42, 1.6), (-.4, y1 - .42, 1.6), (-.3, cy + .1, 1.75)], .06, 'steel', bend=.15)
    else:
        for s in (-1, 1):
            column(h, s * .85, cy, .55, 1.24, ztop - .45)
            k_small_tank(h, s * 1.58, y0 + .35, .22, 1.28)
            mast(h, s * 1.6, y1 - .14, 1.28, ztop if s < 0 else ztop - .15)
        # A slim lit core between them, banded, with a catwalk in front at mid height.
        cyl(h, 0, cy + .1, .2, 1.24, ztop - .7, 'metal', seg=14)
        for zz in (1.4, 1.65, 1.9):
            cyl(h, 0, cy + .1, .215, zz, zz + .07, 'glow', seg=14)
        dome(h, 0, cy + .1, .2, ztop - .7, .1, 'steel', seg=14)
        B(h, -.36, .36, cy - .5, cy - .28, 1.86, 1.93, 'steel')
        for y in (cy - .5, cy - .28):
            B(h, -.36, .36, y - .012, y + .012, 2.08, 2.11, 'steel')
        for x in (-.3, 0, .3):
            B(h, x - .012, x + .012, cy - .51, cy - .49, 1.93, 2.11, 'steel')


def k_small_tank(h, x, y, r, z0):
    cyl(h, x, y, r + .04, z0, z0 + .08, 'metal', seg=12)
    cyl(h, x, y, r, z0 + .08, z0 + .38, 'paint', seg=12)
    cyl(h, x, y, r + .015, z0 + .2, z0 + .28, 'accent', seg=12)
    dome(h, x, y, r, z0 + .38, r * .45, 'paint', seg=12, rings=3)
    cyl(h, x, y, r * .3, z0 + .38 + r * .43, z0 + .38 + r * .43 + .06, 'metal', seg=10)


def k_pump(h, s, xi, xo, y0, y1, z0, z1):
    """Forward pump house (large plants): rust body, a fan on the roof, a lit intake to the front."""
    B(h, s * xi, s * xo, y0, y1, z0, z1, 'accent', c=.07)
    B(h, s * (xi - .03), s * (xo + .03), y0 - .03, y1 + .03, z0, z0 + .14, 'metal')
    B(h, s * (xi + .1), s * (xo - .1), y0 - .03, y0, z0 + .22, z1 - .12, 'paint')
    for k in range(4):
        z = z0 + .3 + k * (z1 - z0 - .5) / 3
        B(h, s * (xi + .2), s * (xo - .2), y0 - .06, y0 - .02, z, z + .05, 'metal')
    front_slit(h, s * (xi + (xo - xi) * .5), y0 - .06, z1 - .2, z1 - .14, w=(xo - xi) * .3)
    fan(h, s * (xi + (xo - xi) * .38), (y0 + y1) / 2, z1, min(xo - xi, y1 - y0) * .3)
    stack(h, s * (xo - .22), y1 - .22, .1, z1, z1 + .6)


def khepri(h, large):
    if not large:
        xi, xo, front, back = 1.32, 3.2, -1.62, 4.38
        for s in (-1, 1):
            plinth(h, s * 1.22, s * 3.22, front, back)
            k_tank(h, s * 2.22, -.42, .66, .18, 1.32, s)
            k_hall(h, s, xi, xo - .05, .62, 4.18, .18, 1.42)
            column(h, s * 2.78, 3.72, .3, 1.5, 2.3)
            column(h, s * 2.82, 2.98, .2, 1.5, 1.95, slit=False)
            mast(h, s * 1.48, 4.06, 1.5, 2.6)
            # Feed pipes: tank to hall on both flanks, banded and flanged.
            pipe(h, [(s * 1.62, -.2, .5), (s * 1.62, .55, .5), (s * 1.62, .64, .9)], .1, 'metal')
            pipe(h, [(s * 3.0, -.2, .36), (s * 3.0, .66, .36)], .085, 'steel')
            ring(h, (s * 1.62, .1, .5), 'y', .135, .08, 'accent')
            ring(h, (s * 3.0, .25, .36), 'y', .115, .07, 'accent')
            # Roof pipe from the columns along the court edge, then over the gap into the refinery.
            pipe(h, [(s * 2.6, 3.72, 1.75), (s * 1.55, 3.72, 1.75), (s * 1.3, 3.72, 1.75), (s * .98, 3.75, 1.5)], .07, 'metal', bend=.15)
            ring(h, (s * 2.1, 3.72, 1.75), 'x', .095, .06, 'accent')
            B(h, s * 1.98, s * 2.06, 3.66, 3.78, 1.5, 1.68, 'steel')
        plinth(h, -1.22, 1.22, 2.8, back)
        k_rear(h, 1.12, 2.92, 4.3, .18, 2.62)
        court(h, xi, front, 2.8)
    else:
        xi, xo, front, back = 2.02, 4.26, -2.68, 5.96
        for s in (-1, 1):
            plinth(h, s * 1.92, s * 4.26, front, back)
            k_pump(h, s, xi + .12, xo - .2, -2.5, -1.45, .18, .98)
            k_tank(h, s * 3.1, -.42, .76, .18, 1.42, s)
            k_small_tank(h, s * 2.3, -1.18, .18, .18)
            k_hall(h, s, xi, xo - .06, .72, 4.08, .18, 1.55)
            k_hall(h, s, xi, xo - .06, 4.28, 5.82, .18, 1.12, roof=False)
            k_small_tank(h, s * 2.7, 5.0, .3, 1.2)
            column(h, s * 3.6, 5.05, .38, 1.2, 2.3)
            column(h, s * 3.8, 3.62, .32, 1.63, 2.45)
            column(h, s * 3.84, 2.88, .22, 1.63, 2.1, slit=False)
            mast(h, s * 2.2, 3.98, 1.63, 2.8)
            pipe(h, [(s * 2.4, -.15, .55), (s * 2.4, .62, .55), (s * 2.4, .72, 1.0)], .11, 'metal')
            pipe(h, [(s * 4.0, -.2, .38), (s * 4.0, .76, .38)], .09, 'steel')
            ring(h, (s * 2.4, .2, .55), 'y', .145, .08, 'accent')
            ring(h, (s * 4.0, .3, .38), 'y', .12, .07, 'accent')
            pipe(h, [(s * 3.55, -1.5, .5), (s * 3.55, -.95, .5)], .08, 'metal')
            pipe(h, [(s * 3.55, 3.62, 1.9), (s * 2.3, 3.62, 1.9), (s * 2.05, 3.62, 1.9), (s * 1.65, 4.6, 1.75)], .08, 'metal', bend=.2)
            ring(h, (s * 2.9, 3.62, 1.9), 'x', .105, .06, 'accent')
            B(h, s * 2.78, s * 2.86, 3.56, 3.68, 1.63, 1.82, 'steel')
        # Transverse manifold behind the court on low stands, into the refinery.
        pipe(h, [(-2.0, 3.7, .55), (2.0, 3.7, .55)], .12, 'metal', seg=12)
        for x in (-1.4, -.7, .7, 1.4):
            ring(h, (x, 3.7, .55), 'x', .155, .08, 'accent')
            B(h, x - .06, x + .06, 3.62, 3.78, 0, .44, 'steel')
        plinth(h, -1.92, 1.92, 3.98, back)
        k_rear(h, 1.82, 4.1, 5.82, .18, 2.8, twin=True)
        court(h, xi, front, 3.6, ring_r=1.05)


# ----------------------------------------------------------------------------- vesper
def octagon(h, x, y, r, z0, z1, mat, r2=None):
    """Eight-sided solid with flat faces toward the camera and the flanks (Vesper is angular)."""
    h.cylinder((x, y, 0), 'z', r, z0, z1, mat, seg=8, r2=r2, phase=math.pi / 8)


def v_exchanger(h, x, y, r, z0, z1):
    """Heat-exchanger column: graphite octagon, steel bands, glowing seams on the faces, a hot crown and a vent cap."""
    a = r * math.cos(math.pi / 8)  # apothem: the flat faces
    octagon(h, x, y, r + .08, z0, z0 + .18, 'metal')
    octagon(h, x, y, r, z0 + .18, z1, 'paint')
    for zz in (z0 + .5, z1 - .4):
        octagon(h, x, y, r + .03, zz, zz + .1, 'steel')
    B(h, x - .05, x + .05, y - a - .04, y - a + .03, z0 + .3, z1 - .12, 'glow')
    for s in (-1, 1):
        B(h, x + s * a - .03, x + s * a + .04, y - .05, y + .05, z0 + .3, z1 - .12, 'glow')
        B(h, x + s * a * .45 - .07, x + s * a * .45 + .07, y - a - .06, y - a + .02, z0 + .18, z1 - .06, 'accent')
    octagon(h, x, y, r + .06, z1, z1 + .1, 'metal')
    octagon(h, x, y, r * .72, z1 + .02, z1 + .12, 'glow')
    octagon(h, x, y, r * .42, z1 + .12, z1 + .3, 'metal', r2=r * .3)
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        B(h, x + r * .5 * math.cos(ang) - .03, x + r * .5 * math.cos(ang) + .03, y + r * .5 * math.sin(ang) - .03, y + r * .5 * math.sin(ang) + .03, z1 + .08, z1 + .22, 'steel')


def v_stack(h, x, y, r, z0, z1):
    octagon(h, x, y, r + .05, z0, z0 + .12, 'metal')
    octagon(h, x, y, r, z0 + .12, z1 - .08, 'accent', r2=r * .85)
    octagon(h, x, y, r * .85 + .04, z1 - .08, z1, 'metal')
    octagon(h, x, y, r * .55, z1 - .02, z1 + .005, 'glow')


def v_hall(h, s, xi, xo, y0, y1, z0, z1, roof=True):
    """Reactor hall: graphite block whose top front rakes back, leaning armour fins with slits between them,
    a lit band on the rake, a roof reactor housing with a glowing grille and hot stacks."""
    w, rake = xo - xi, .42
    h.prism([(y0, z0), (y1, z0), (y1, z1), (y0 + rake, z1), (y0, z1 - rake)], 'x', s * xi, s * xo, 'paint')
    B(h, s * (xi - .03), s * (xo + .03), y0 - .03, y1 + .03, z0, z0 + .16, 'metal')
    for a, b, c, d in [(xi, xo, y1 - .08, y1 + .02), (xi - .02, xi + .08, y0 + rake, y1), (xo - .08, xo + .02, y0 + rake, y1)]:
        B(h, s * a, s * b, c, d, z1, z1 + .07, 'steel')
    B(h, s * (xi + .16), s * (xo - .16), y0 + rake * .5 - .03, y0 + rake * .5 + .03, z1 - rake * .5 - .03, z1 - rake * .5 + .03, 'glow')
    for f in (.08, .5, .92):
        x = xi + w * f
        h.prism([(y0, z0 + .1), (y0 - .32, z0 + .1), (y0 - .05, z1 - rake - .05), (y0, z1 - rake - .05)], 'x', s * (x - .08), s * (x + .08), 'accent')
    for f in (.29, .71):
        front_slit(h, s * (xi + w * f), y0, z0 + .4, z1 - rake - .2, w=.05)
    # Court wall door, ribs; outer buttresses.
    d = y0 + (y1 - y0) * .32
    B(h, s * (xi - .05), s * xi, d - .32, d + .32, z0 + .16, z0 + .82, 'metal')
    B(h, s * (xi - .07), s * (xi - .03), d - .26, d + .26, z0 + .86, z0 + .92, 'glow')
    for y in (y0 + (y1 - y0) * .6, y0 + (y1 - y0) * .85):
        B(h, s * (xi - .06), s * xi, y - .07, y + .07, z0 + .16, z1, 'steel')
    for y in (y0 + .6, (y0 + y1) / 2, y1 - .45):
        h.prism([(s * xo, z0), (s * (xo + .16), z0), (s * xo, z1 - .3)], 'y', y - .1, y + .1, 'accent')
    if not roof:
        return
    hx0, hx1 = xi + .2, xi + .2 + w * .5
    hy0, hy1 = y0 + rake + .25, y0 + rake + .25 + min(1.3, (y1 - y0) * .42)
    B(h, s * hx0, s * hx1, hy0, hy1, z1, z1 + .38, 'accent', c=.12)
    B(h, s * (hx0 + .12), s * (hx1 - .12), hy0 + .12, hy1 - .12, z1 + .38, z1 + .4, 'glow')
    for k in range(5):
        y = hy0 + .18 + (hy1 - hy0 - .36) * k / 4
        B(h, s * (hx0 + .1), s * (hx1 - .1), y - .025, y + .025, z1 + .38, z1 + .46, 'metal')
    plates(h, s * (hx1 + .14), s * (xo - .16), hy0, hy1, z1)
    plates(h, s * (xi + .16), s * (xi + w * .58), hy1 + .2, y1 - .25, z1, n=2, mat='steel')


def v_rear(h, hw, y0, y1, z0, ztop, twin=False):
    """Thermal reactor block: stairs to a glowing gate, graphite towers with a glowing channel behind leaning
    armour plates, hot crowns, heat stacks on the shoulders and lamp masts."""
    B(h, -hw, hw, y0, y1, z0, 1.15, 'paint', c=.12)
    B(h, -hw - .03, hw + .03, y0 - .03, y1 + .03, z0, z0 + .16, 'metal')
    B(h, -hw, hw, y0 - .02, y0 + .08, 1.15, 1.22, 'steel')
    for k in range(4):  # stairs to the gate
        B(h, -.4, .4, y0 - .38 + k * .095, y0, z0 + k * .07, z0 + (k + 1) * .07, 'steel')
    B(h, -.5, .5, y0 - .07, y0, z0 + .2, 1.0, 'metal')
    B(h, -.34, .34, y0 - .09, y0 - .05, z0 + .3, .9, 'glow')
    for s in (-1, 1):
        h.prism([(y0, z0 + .16), (y0 - .3, z0 + .16), (y0 - .04, 1.05), (y0, 1.05)], 'x', s * .52, s * .66, 'accent')
        B(h, s * .74, s * (hw - .1), y0 - .035, y0, z0 + .32, 1.0, 'accent')
        front_slit(h, s * (.74 + (hw - .84) / 2), y0 - .035, z0 + .45, .88, w=.04)
    cy = (y0 + y1) / 2 + .1
    xs = [0] if not twin else [-.85, .85]
    r = .5 if not twin else .52
    for x in xs:
        a = r * math.cos(math.pi / 8)
        octagon(h, x, cy, r, 1.15, ztop - .4, 'paint')
        B(h, x - .08, x + .08, cy - a - .05, cy - a + .03, 1.3, ztop - .55, 'glow')
        B(h, x - .14, x + .14, cy - a - .03, cy - a + .02, ztop - .55, ztop - .48, 'metal')
        for side in (-1, 1):
            h.prism([(cy - a + .02, 1.15), (cy - a - .26, 1.15), (cy - a - .02, ztop - .6), (cy - a + .02, ztop - .6)], 'x',
                    x + side * .12, x + side * .3, 'accent')
        octagon(h, x, cy, r + .07, ztop - .4, ztop - .28, 'metal')
        octagon(h, x, cy, r * .75, ztop - .28, ztop - .22, 'glow')
        octagon(h, x, cy, r * .45, ztop - .26, ztop - .14, 'steel')
    for s in (-1, 1):
        v_stack(h, s * (hw - .26), y1 - .35, .17, 1.22, ztop - .5)
        mast(h, s * (hw - .2), y0 + .25, 1.22, ztop if s < 0 else ztop - .15)
    if twin:
        B(h, -.42, .42, cy - .2, cy + .2, 1.15, 1.75, 'metal', c=.05)
        B(h, -.3, .3, cy - .22, cy - .19, 1.25, 1.65, 'glow')
        B(h, -.4, .4, cy - .6, cy - .38, 1.86, 1.93, 'steel')


def vesper(h, large):
    if not large:
        xi, xo, front, back = 1.32, 3.2, -1.62, 4.38
        for s in (-1, 1):
            plinth(h, s * 1.22, s * 3.22, front, back)
            v_exchanger(h, s * 2.22, -.42, .64, .18, 1.5)
            v_hall(h, s, xi, xo - .05, .62, 4.18, .18, 1.42)
            v_stack(h, s * 2.8, 3.78, .16, 1.42, 2.35)
            v_stack(h, s * 2.8, 3.2, .12, 1.42, 2.05)
            mast(h, s * 1.48, 4.06, 1.49, 2.6)
            pipe(h, [(s * 1.62, -.2, .5), (s * 1.62, .55, .5), (s * 1.62, .64, .9)], .1, 'steel')
            pipe(h, [(s * 3.0, -.2, .36), (s * 3.0, .66, .36)], .085, 'metal')
            ring(h, (s * 1.62, .1, .5), 'y', .13, .07, 'glow')
            ring(h, (s * 3.0, .25, .36), 'y', .11, .06, 'glow')
            pipe(h, [(s * 2.6, 3.78, 1.7), (s * 1.3, 3.78, 1.7), (s * .98, 3.78, 1.5)], .07, 'steel', bend=.15)
        plinth(h, -1.22, 1.22, 2.8, back)
        v_rear(h, 1.12, 3.0, 4.3, .18, 2.62)
        court(h, xi, front, 2.8)
    else:
        xi, xo, front, back = 2.02, 4.26, -2.68, 5.96
        for s in (-1, 1):
            plinth(h, s * 1.92, s * 4.26, front, back)
            v_hall(h, s, xi + .12, xo - .2, -2.4, -1.4, .18, .98, roof=False)
            v_stack(h, s * 3.0, -1.95, .14, .98, 1.7)
            v_exchanger(h, s * 3.1, -.38, .72, .18, 1.62)
            v_exchanger(h, s * 2.32, -1.05, .26, .18, 1.1)
            v_hall(h, s, xi, xo - .06, .72, 4.08, .18, 1.55)
            v_hall(h, s, xi, xo - .06, 4.28, 5.82, .18, 1.12, roof=False)
            v_exchanger(h, s * 3.2, 5.05, .34, 1.12, 1.95)
            v_stack(h, s * 3.82, 3.65, .17, 1.55, 2.6)
            v_stack(h, s * 3.82, 3.05, .13, 1.55, 2.25)
            mast(h, s * 2.2, 3.98, 1.62, 2.8)
            pipe(h, [(s * 2.4, -.15, .55), (s * 2.4, .62, .55), (s * 2.4, .72, 1.0)], .11, 'steel')
            pipe(h, [(s * 4.0, -.2, .38), (s * 4.0, .76, .38)], .09, 'metal')
            ring(h, (s * 2.4, .2, .55), 'y', .14, .07, 'glow')
            ring(h, (s * 4.0, .3, .38), 'y', .115, .06, 'glow')
            pipe(h, [(s * 3.6, 3.65, 1.85), (s * 2.05, 3.65, 1.85), (s * 1.65, 4.6, 1.7)], .08, 'steel', bend=.2)
        pipe(h, [(-2.0, 3.7, .55), (2.0, 3.7, .55)], .12, 'steel', seg=12)
        for x in (-1.4, -.7, .7, 1.4):
            ring(h, (x, 3.7, .55), 'x', .15, .07, 'glow')
            B(h, x - .06, x + .06, 3.62, 3.78, 0, .44, 'metal')
        plinth(h, -1.92, 1.92, 3.98, back)
        v_rear(h, 1.82, 4.2, 5.82, .18, 2.8, twin=True)
        court(h, xi, front, 3.6, ring_r=1.05)


# ----------------------------------------------------------------------------- nacre
def horn(h, cx, cy, cz, R, a0, a1, w, d, mat, n=9, lean=.45):
    """A crescent blade: an arc from angle a0 to a1 (radians) in the x/up plane leaned back by `lean` toward the
    game camera, so the 55-degree view sees the crescent nearly full size; it tapers to a tip."""
    up = Vector((0, math.sin(lean), math.cos(lean)))
    nrm = Vector((0, math.cos(lean), -math.sin(lean)))
    c = Vector((cx, cy, cz))
    loops = []
    for i in range(n + 1):
        t = i / n
        a = a0 + (a1 - a0) * t
        half = w * (1 - .75 * t) / 2
        dep = d * (1 - .4 * t) / 2
        loops.append([tuple(c + Vector((rr * math.cos(a), 0, 0)) + up * (rr * math.sin(a)) + nrm * yy)
                      for rr, yy in ((R - half, -dep), (R + half, -dep), (R + half, dep), (R - half, dep))])
    h.loft(loops, mat)


def hexagon(h, x, y, r, z0, z1, mat, r2=None):
    h.cylinder((x, y, 0), 'z', r, z0, z1, mat, seg=6, r2=r2, phase=0.0)


def n_basin(h, x, y, r, z0, zt):
    """Mire pump: a stone basin brimming with light, spilling down its front, a banded pump spire in the middle."""
    cyl(h, x, y, r + .07, z0, z0 + .12, 'metal', seg=18)
    cyl(h, x, y, r, z0 + .12, zt, 'paint', seg=18)
    cyl(h, x, y, r + .025, zt - .1, zt, 'accent', seg=18)
    cyl(h, x, y, r - .12, zt - .05, zt + .01, 'glow_pool', seg=18)
    cyl(h, x, y, r - .1, zt - .02, zt + .004, 'glow', seg=18)
    for dx in (-.22, 0, .22):
        yy = y - math.sqrt(max(r * r - dx * dx, 0))
        B(h, x + dx - .035, x + dx + .035, yy - .03, yy + .04, z0 + .14, zt, 'glow')
    hexagon(h, x, y, .17, zt, zt + .55, 'accent', r2=.11)
    hexagon(h, x, y, .19, zt + .2, zt + .27, 'glow_ember')
    hexagon(h, x, y, .13, zt + .55, zt + .62, 'metal')


def n_hall(h, s, xi, xo, y0, y1, z0, z1, roof=True):
    """Monolith wing: tapered lavender stone with a cut ember slit, teal seams along the crest, light pads on
    the crest: a lit canal, standing stones and a pool with a banded spire."""
    w = xo - xi
    prof = [(xi, z0), (xo, z0), (xo - .14, z1 - .32), (xo - .42, z1), (xi + .42, z1), (xi + .14, z1 - .32)]
    h.prism([(s * x, z) for x, z in prof], 'y', y0, y1, 'paint')
    B(h, s * (xi - .03), s * (xo + .03), y0 - .03, y1 + .03, z0, z0 + .16, 'metal')
    for x in (xi + .42, xo - .42):
        B(h, s * (x - .025), s * (x + .025), y0 + .05, y1 - .05, z1 - .01, z1 + .015, 'glow')
    # Front: a cut ember slit in a dark frame, flanked by carved violet panels.
    cx = xi + w / 2
    front_slit(h, s * cx, y0, z0 + .3, z1 - .25, w=.06, mat='glow_ember')
    for side in (-1, 1):
        B(h, s * (cx + side * .28 - .12), s * (cx + side * .28 + .12), y0 - .03, y0, z0 + .28, z1 - .45, 'accent')
    for f in (.12, .88):
        B(h, s * (xi + w * f - .05), s * (xi + w * f + .05), y0 - .05, y0, z0 + .16, z1 - .4, 'metal')
    if not roof:
        return
    # Crest: a glowing canal between rims, standing stones along the court side, a pool at the back.
    cx0, cx1 = xi + .46, xo - .46
    ym = y1 - 1.05
    B(h, s * cx0, s * cx1, y0 + .3, ym, z1, z1 + .07, 'accent')
    mid = (cx0 + cx1) / 2
    B(h, s * (mid - .05), s * (mid + .05), y0 + .38, ym - .08, z1 + .06, z1 + .085, 'glow')  # a lit seam down the crest
    for k in range(4):  # stone sills across it
        y = y0 + .55 + k * (ym - y0 - .8) / 3
        B(h, s * (cx0 + .06), s * (cx1 - .06), y - .06, y + .06, z1 + .06, z1 + .12, 'paint')
    for k in range(3):
        y = y0 + .55 + k * (ym - y0 - .8) / 2
        hexagon(h, s * (xi + .3), y, .15, z1 - .2, z1 + .75 - k * .15, 'paint', r2=.07)
        B(h, s * (xi + .3) - .025, s * (xi + .3) + .025, y - .14, y - .12, z1 + .1, z1 + .5 - k * .12, 'glow')
    cyl(h, s * (xi + w * .55), y1 - .55, .38, z1 - .05, z1 + .12, 'paint', seg=16)
    cyl(h, s * (xi + w * .55), y1 - .55, .3, z1 + .1, z1 + .13, 'glow_pool', seg=16)
    hexagon(h, s * (xi + w * .55), y1 - .55, .09, z1 + .1, z1 + .55, 'accent', r2=.05)
    hexagon(h, s * (xi + w * .55), y1 - .55, .1, z1 + .3, z1 + .35, 'glow_ember')


def n_rear(h, hw, y0, y1, z0, ztop, twin=False):
    """Monolith relay: a carved base with an ember gate, an obelisk (or two) crowned with a glowing crystal, a
    lit halo, crescent blades curving up on both sides."""
    B(h, -hw, hw, y0, y1, z0, 1.15, 'paint', c=.16)
    B(h, -hw - .03, hw + .03, y0 - .03, y1 + .03, z0, z0 + .16, 'metal')
    B(h, -.42, .42, y0 - .07, y0, z0 + .16, .95, 'metal')
    B(h, -.28, .28, y0 - .09, y0 - .05, z0 + .22, .85, 'glow_ember')
    for s in (-1, 1):
        B(h, s * .55, s * (hw - .12), y0 - .03, y0, z0 + .3, 1.0, 'accent')
        B(h, s * (.55 + (hw - .67) / 2) - .03, s * (.55 + (hw - .67) / 2) + .03, y0 - .05, y0 - .02, z0 + .4, .9, 'glow')
    cy = (y0 + y1) / 2 + .08
    xs = [0] if not twin else [-.8, .8]
    for x in xs:
        r = .42
        hexagon(h, x, cy, r + .1, 1.15, 1.32, 'metal')
        hexagon(h, x, cy, r, 1.32, ztop - .62, 'paint', r2=r * .62)
        ap = r * math.cos(math.pi / 6)
        B(h, x - .06, x + .06, cy - ap * .9 - .04, cy - ap * .9 + .03, 1.45, ztop - .8, 'glow_ember')
        zc = ztop - .45
        h.loft([[(x + rr * math.cos(k * math.pi / 3), cy + rr * math.sin(k * math.pi / 3), zz) for k in range(6)]
                for rr, zz in ((.02, ztop - .62), (.15, zc), (.02, ztop - .02))], 'glow')
        # Halo ring around the obelisk on the base roof.
        seg = 16
        ring_loops = [[(x + (.62 + .05 * math.cos(b)) * math.cos(a), cy + (.62 + .05 * math.cos(b)) * math.sin(a), 1.32 + .05 * math.sin(b))
                       for b in [k * math.pi / 2 for k in range(4)]] for a in [2 * math.pi * i / seg for i in range(seg + 1)]]
        h.loft(ring_loops, 'glow', caps=False)
    if not twin:
        horn(h, 0, cy, 1.05, 1.15, math.pi * 1.07, math.pi * .6, .36, .28, 'paint')
        horn(h, 0, cy, 1.05, 1.15, -math.pi * .07, math.pi * .4, .36, .28, 'paint')
    else:
        horn(h, -.8, cy + .1, 1.05, 1.05, math.pi * 1.07, math.pi * .58, .34, .26, 'paint')
        horn(h, .8, cy + .1, 1.05, 1.05, -math.pi * .07, math.pi * .42, .34, .26, 'paint')
        cyl(h, 0, cy - .1, .26, 1.15, 1.2, 'accent', seg=14)
        cyl(h, 0, cy - .1, .2, 1.2, 1.215, 'glow', seg=14)
    for s in (-1, 1):
        mast(h, s * (hw - .2), y1 - .2, 1.15, ztop - .1 if s < 0 else ztop - .3, lamp='glow_ember')


def nacre(h, large):
    if not large:
        xi, xo, front, back = 1.32, 3.2, -1.62, 4.38
        for s in (-1, 1):
            plinth(h, s * 1.22, s * 3.22, front, back)
            n_basin(h, s * 2.22, -.42, .66, .18, .78)
            n_hall(h, s, xi, xo - .05, .62, 4.18, .18, 1.42)
            pipe(h, [(s * 1.62, -.2, .5), (s * 1.62, .55, .5), (s * 1.62, .64, .9)], .09, 'accent')
            ring(h, (s * 1.62, .1, .5), 'y', .12, .06, 'glow')
        plinth(h, -1.22, 1.22, 2.8, back)
        n_rear(h, 1.12, 2.95, 4.3, .18, 2.62)
        court(h, xi, front, 2.8)
    else:
        xi, xo, front, back = 2.02, 4.26, -2.68, 5.96
        for s in (-1, 1):
            plinth(h, s * 1.92, s * 4.26, front, back)
            n_basin(h, s * 3.15, -2.0, .55, .18, .62)
            n_basin(h, s * 3.1, -.3, .76, .18, .82)
            n_hall(h, s, xi, xo - .06, .72, 4.08, .18, 1.55)
            n_hall(h, s, xi, xo - .06, 4.28, 5.82, .18, 1.12, roof=False)
            pipe(h, [(s * 2.4, -.15, .55), (s * 2.4, .62, .55), (s * 2.4, .72, 1.0)], .1, 'accent')
            ring(h, (s * 2.4, .2, .55), 'y', .13, .06, 'glow')
            pipe(h, [(s * 3.1, -1.5, .4), (s * 3.1, -1.1, .4)], .08, 'accent')
        plinth(h, -1.92, 1.92, 3.98, back)
        n_rear(h, 1.82, 4.15, 5.82, .18, 2.8, twin=True)
        court(h, xi, front, 3.6, ring_r=1.05)


# ----------------------------------------------------------------------------- build
def compound(planet, large, sc, mats):
    h = Kit(list(PALETTES[planet]))
    {'khepri': khepri, 'vesper': vesper, 'nacre': nacre}[planet](h, large)
    name = 'facility_%s%s' % (planet, '_large' if large else '')
    ob = h.object(name, mats, sc)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    lim = LIMITS[large]
    print('%s: x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f  tris %d' % (name, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], br.triangles([ob])))
    assert max(-lo[0], hi[0]) < lim['half'] and lo[1] > lim['front'] and hi[1] < lim['back'] and hi[2] <= lim['top'], name + ' exceeds its bounds'
    court = [v.co for v in ob.data.vertices if abs(v.co.x) < .65 and abs(v.co.y) < .7 and v.co.z >= .25]
    assert not court, '%s: %d vertices in the gun court' % (name, len(court))
    return ob


def build(export=True, preview=True):
    import bpy
    wanted = [a.split('=')[1] for a in sys.argv if a.startswith('--planet=')]
    results = []
    for planet in [p for p in PLANETS if not wanted or p in wanted]:
        sc = br.scene('Last Worlds — Facility compounds ' + planet)
        mats = materials(planet)
        objects = [compound(planet, large, sc, mats) for large in (False, True)]
        bpy.context.view_layer.update()
        area = [(max(v.co.x for v in o.data.vertices) - min(v.co.x for v in o.data.vertices)) * (max(v.co.y for v in o.data.vertices) - min(v.co.y for v in o.data.vertices)) for o in objects]
        print('%s large/small plan area %.2f' % (planet, area[1] / area[0]))
        assert 1.8 < area[1] / area[0] < 2.2
        br.texture_bake(objects, 'facility_' + planet, planet + '_facility')
        for o in objects:  # AO each plant on its own, sitting on the ground
            br.bake_ao([o], [o], strength=.8, reach=1.6)
        marker = br.marker('facility_remodel_v2', sc=sc, note='Facility compounds remodelled after the facility sheets')
        if export:
            path = os.path.join(br.ROOT, 'public', 'assets', planet, 'facility-compounds-%s.glb' % LABEL)
            results.append(br.export(path, objects + [marker], 'Last Worlds — %s facility compounds after the facility sheets' % planet))
        if preview:
            for o in objects:
                large = o.name.endswith('_large')
                br.game_view(sc, (0, 1.9 if large else 1.35, .9), 10.5 if large else 8.2,
                             os.path.join(br.LOOKDEV, '..', 'facility-remodel', '%s-game.png' % o.name),
                             objects=[o], light='ice' if planet == 'vesper' else 'desert')
    return objects, results
