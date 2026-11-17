"""Building toolkit for the facility, Corona, Nahara and strike-site models: faceted solids in named paints.

`Kit` (two lib_solids.Solids: chamfered masses, plain trim), box/cylinder/dome/pipe/ring primitives, details (light slits, grooves,
fans, masts, stacks, sawtooth roofs, plates, columns) and the per-world module pieces of the facility sheets
(art/concepts/facility-sheets: Khepri's tanks and pumps, Vesper's exchangers and stacks, Nacre's horns, basins and halls).
Importing it registers the `<world>_facility` bake styles (lib_solids.STYLES) for Khepri, Vesper and Nacre.

Users: kit_facilities.py, kit_facilities_nacre.py, kit_corona.py, kit_nahara.py, sites_strike.py. It grew out of the v2
facility compounds (20 October; retired 8 November, their builder removed 17 November).
Blender axes: x right, y away from the player, z up; ground z = 0.
"""
import math, os, sys
from mathutils import Vector
import lib_solids as br

PLANETS = ('khepri', 'vesper', 'nacre')
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


