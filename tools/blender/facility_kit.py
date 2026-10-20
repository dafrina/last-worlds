"""Facility kits v3: per-world textured building modules for the modular plants (docs/25-modular-facilities.md).

The user liked the v2 plants (remodel_facilities.py, after art/concepts/facility-sheets) but not their single
inverted-U layout, and asked for modular facilities (20 October). Each world's modules are cut from the same
builders, plus new pieces from the sheets (Khepri's power relay spire and extractor crane). A seeded layout in the
game (src/render/facility-layouts.ts) composes them around each battery.

Contract: src/render/facility-kit.ts is the single source for every module's footprint, top and foundation depth.
This builder parses it and asserts each built module against it. Module frame: pivot at the base centre on the
ground; x lateral, y away from the camera; the detailed front faces the camera (-y); left and right faces are detailed
too (layouts turn modules a quarter), and backs and undersides stay plain. Every module carries its own foundation.

One GLB per world: public/assets/<world>/facility-kit-v3.glb, all modules sharing one baked atlas.
Headless: remodel_run.py facility_kit [--world=khepri] [--no-export] [--no-preview].
"""
import math, os, re, sys
from mathutils import Vector
import boss_remodel as br
import remodel_facilities as rf
from remodel_facilities import B, cyl, dome, pipe, ring, front_slit, grooves, fan, mast, stack, sawtooth, column, plates

LABEL = 'v3'
WORLDS = ('khepri', 'vesper', 'nacre', 'luna')
REGISTRY = os.path.join(br.ROOT, 'src', 'render', 'facility-kit.ts')
PALETTES = {w: dict(p) for w, p in rf.PALETTES.items()}
PALETTES['khepri']['glow_crystal'] = ('#04201f', .3, .1, '#4ff2df')  # the sheet's teal mineral
# Ground decks under the plants (aprons): concrete, graphite, violet paving; lightly weathered (boss_remodel `_deck`).
for _w, _c in (('khepri', '#6f6862'), ('vesper', '#454b55'), ('nacre', '#2f2b44')):
    PALETTES[_w]['deck'] = (_c, .7, .05, None)
# Luna: white human-built panels (nearly dielectric: Luna's black sky turns metallic white grey), amber stripes and lamps.
PALETTES['luna'] = dict(paint=('#e6e5e0', .56, .03, None), accent=('#b9bab8', .55, .05, None), metal=('#2c2e33', .45, .55, None),
                        steel=('#80858c', .4, .6, None), stripe=('#dca12e', .5, .08, None), glow=('#2a1606', .5, .2, '#ffa83a'))
br.STYLES['luna_facility'] = dict(br.STYLES['luna'], panel=.55)


def registry():
    """{node: dict(world, half, top, below)} parsed from facility-kit.ts (`m(world, name, [hx, hs], top, ...)`)."""
    out = {}
    for match in re.finditer(r"m\('(\w+)', '(\w+)', \[([\d.]+), ([\d.]+)\], ([\d.]+),[^\n]*", open(REGISTRY).read()):
        below = re.search(r"below: ([\d.]+)", match.group(0))
        out['fk_%s_%s' % (match.group(1), match.group(2))] = dict(world=match.group(1), half=(float(match.group(3)), float(match.group(4))),
                                                                top=float(match.group(5)), below=float(below.group(1)) if below else .6)
    return out


def materials(world):
    strength = {'glow_pool': .7}
    return {k: br.material('fk_%s_%s' % (world, k), c, r, mt, e, strength.get(k, 2.2) if e else 0) for k, (c, r, mt, e) in PALETTES[world].items()}


# ----------------------------------------------------------------------------- shared pieces
def foot(h, x0, x1, y0, y1, top=.12, skirt=.04, floor=-.55, stripes=True):
    """A module's foundation: a dark slab whose skirt reaches below uneven ground, with a steel lip and hazard dashes."""
    if stripes:
        rf.plinth(h, x0, x1, y0, y1, top=top, skirt=skirt, floor=floor)
        return
    h.wedge([(x0 - skirt, y0 - skirt), (x1 + skirt, y0 - skirt), (x1 + skirt, y1 + skirt), (x0 - skirt, y1 + skirt)], floor, 0, 'metal',
            top=[(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    B(h, x0, x1, y0, y1, 0, top, 'metal', c=.04)


def round_foot(h, x, y, r, top=.12, floor=-.55, seg=16):
    cyl(h, x, y, r + .06, floor, 0, 'metal', seg=seg, r2=r)
    cyl(h, x, y, r, 0, top, 'metal', seg=seg)


def beam(h, p0, p1, w, d, mat):
    """A rectangular beam between two points (crane arms, braces)."""
    a, b = Vector(p0), Vector(p1)
    t = (b - a).normalized()
    side = t.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
    up = side.cross(t).normalized()
    rect = lambda c: [tuple(c + side * sx * w / 2 + up * sz * d / 2) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    h.loft([rect(a), rect(b)], mat)


def crystal(h, x, y, r, z0, height, lean=(0, 0), mat='glow_crystal'):
    """A hexagonal mineral crystal leaning by `lean` per unit height, with a pointed tip."""
    lx, ly = lean
    ring6 = lambda rr, zz, k: [(x + lx * k + rr * math.cos(i * math.pi / 3), y + ly * k + rr * math.sin(i * math.pi / 3), zz) for i in range(6)]
    h.loft([ring6(r, z0, 0), ring6(r * .92, z0 + height * .72, height * .72), ring6(.008, z0 + height, height)], mat)


def side_details(h, hx, y0, y1, z0, z1):
    """Both long sides of a hall: rust cladding, framed light slits, a door with a lit lintel."""
    for s in (-1, 1):
        x = s * hx
        B(h, x, x + s * .03, y0 + .22, y1 - .22, z0 + .26, z1 - .14, 'accent')
        for y in (y0 + (y1 - y0) * .3, y0 + (y1 - y0) * .72):
            B(h, x, x + s * .055, y - .1, y + .1, z0 + .4, z1 - .3, 'metal')
            B(h, x + s * .04, x + s * .07, y - .045, y + .045, z0 + .46, z1 - .36, 'glow')
        d = y0 + (y1 - y0) * .5
        B(h, x, x + s * .05, d - .26, d + .26, z0 + .16, z0 + .78, 'metal')
        B(h, x + s * .03, x + s * .065, d - .22, d + .22, z0 + .82, z0 + .87, 'glow')


class Unbevelled:
    """Routes every solid to the unbevelled half of a Kit (thin, wide pieces whose chamfer would bulge)."""

    def __init__(self, solids):
        self.solids = solids

    def __getattr__(self, name):
        return getattr(self.solids, name)


def annulus(h, cx, cy, r0, r1, z0, z1, mat, seg=24, phase=0.0, skirt=0.0):
    """A closed ring between radii r0 and r1 (seg=8 with phase pi/8 gives an octagon with a flat face to the camera);
    `skirt` widens the outer foot."""
    loops = []
    for i in range(seg + 1):
        a = phase + 2 * math.pi * i / seg
        c, s = math.cos(a), math.sin(a)
        loops.append([(cx + r0 * c, cy + r0 * s, z0), (cx + (r1 + skirt) * c, cy + (r1 + skirt) * s, z0),
                      (cx + r1 * c, cy + r1 * s, z1), (cx + r0 * c, cy + r0 * s, z1)])
    h.loft(loops, mat, caps=False)


def arc_wall(h, cx, cy, r0, r1, a0, a1, z0, top, mat, n=10):
    """A wall along a circle arc between radii r0 and r1; `z0` and `top` may vary along it (functions of t in 0..1)."""
    loops = []
    for i in range(n + 1):
        t = i / n
        a = a0 + (a1 - a0) * t
        lo = z0(t) if callable(z0) else z0
        hi = top(t) if callable(top) else top
        c, s = math.cos(a), math.sin(a)
        loops.append([(cx + r0 * c, cy + r0 * s, lo), (cx + r1 * c, cy + r1 * s, lo), (cx + r1 * c, cy + r1 * s, hi), (cx + r0 * c, cy + r0 * s, hi)])
    h.loft(loops, mat)


def court_ring(h):
    """The flush turntable ring that frames a gun (below 0.1)."""
    seg, ro, ri = 28, .98, .84
    for k in range(0, seg, 2):
        a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * (k + 1) / seg
        h.wedge([(ri * math.cos(a0), ri * math.sin(a0)), (ro * math.cos(a0), ro * math.sin(a0)),
                 (ro * math.cos(a1), ro * math.sin(a1)), (ri * math.cos(a1), ri * math.sin(a1))], -.03, .05, 'stripe' if k % 4 == 0 else 'steel')


def pipe_run(h, band):
    """A straight 2-unit pipe on two saddles, flanged at both ends so runs tile."""
    for x in (-.5, .5):
        B(h, x - .12, x + .12, -.24, .24, -.3, .06, 'metal')
        B(h, x - .07, x + .07, -.16, .16, .06, .32, 'steel')
    pipe(h, [(-1, 0, .42), (1, 0, .42)], .14, 'metal', seg=12)
    for x in (-.97, .97):
        ring(h, (x, 0, .42), 'x', .18, .06, 'steel')
    ring(h, (0, 0, .42), 'x', .16, .1, band)


def apron(k, deck, seam):
    """A 2 x 2 ground slab that tiles under a plant (the yard that makes its buildings one complex): a deck with a
    seam on two edges (so tiles make a grid), an inset panel and four tie-down plates. Flat and unbevelled."""
    h = Unbevelled(k.minor)
    B(h, -1, 1, -1, 1, -1.1, .03, deck)  # a deep skirt: on slopes a tile reads as a stepped terrace
    B(h, -1, 1, -1, -.97, .03, .04, seam)
    B(h, -1, -.97, -1, 1, .03, .04, seam)
    B(h, -.82, .82, -.82, .82, .03, .036, deck)
    for x, y in ((-.5, -.5), (.5, -.5), (-.5, .5), (.5, .5)):
        B(h, x - .05, x + .05, y - .05, y + .05, .036, .04, seam)


# ----------------------------------------------------------------------------- khepri modules
def k_hall(h, hy, roof):
    """Machine hall: bone walls, rust cladding and slits on the front and both sides, a rooftop plant."""
    hx, z0, z1 = .87, .12, 1.4
    foot(h, -hx - .04, hx + .04, -hy - .04, hy + .04, top=z0, skirt=.03)
    B(h, -hx, hx, -hy, hy, z0, z1, 'paint', c=.07)
    B(h, -hx - .03, hx + .03, -hy - .03, hy + .03, z0, z0 + .16, 'metal')
    for a, b, c, d in [(-hx, hx, -hy - .02, -hy + .08), (-hx, hx, hy - .08, hy + .02), (-hx - .02, -hx + .08, -hy, hy), (hx - .08, hx + .02, -hy, hy)]:
        B(h, a, b, c, d, z1, z1 + .08, 'steel')
    w = 2 * hx
    B(h, -hx + .14, hx - .14, -hy - .035, -hy, z0 + .26, z1 - .14, 'accent')
    grooves(h, -hx + .14, hx - .14, z0 + .26, z1 - .14, -hy - .035)
    for f in (.3, .7):
        front_slit(h, -hx + w * f, -hy - .035, z0 + .42, z1 - .3, w=.045)
    for x in (-hx, hx):
        B(h, x - .055, x + .055, -hy - .07, -hy + .18, z0, z1 + .06, 'metal')
    side_details(h, hx, -hy, hy, z0, z1)
    # Rooftop: rust machine block with a fan at the front; the long hall adds a sawtooth shed and a stack.
    mx0, mx1 = -hx + .16, -hx + .16 + w * .52
    my0 = -hy + .28
    my1 = my0 + min(1.2, 2 * hy - .55)
    B(h, mx0, mx1, my0, my1, z1, z1 + .32, 'accent', c=.05)
    B(h, mx0, mx1, my0 - .02, my0 + .06, z1 + .28, z1 + .34, 'metal')
    fan(h, (mx0 + mx1) / 2, (my0 + my1) / 2, z1 + .32, min(mx1 - mx0, my1 - my0) * .34)
    B(h, mx1 + .2, hx - .16, my0, my0 + .62, z1, z1 + .06, 'steel')
    if roof == 'long':
        sawtooth(h, -hx + .3, -hx + w * .62, my1 + .3, 2, .55, z1, .3)
        stack(h, hx - .3, hy - .32, .12, z1 + .08, z1 + .58)
        plates(h, mx1 + .16, hx - .14, my0 + .75, hy - .6, z1)
    else:
        plates(h, mx1 + .16, hx - .14, my0 + .7, hy - .14, z1, n=1)


def khepri_modules():
    def tank_l(h):
        round_foot(h, 0, 0, .74, top=.12)
        rf.k_tank(h, 0, 0, .66, .12, 1.28, 1)

    def tank_s(h):
        round_foot(h, 0, 0, .3, top=.08, floor=-.38, seg=12)
        rf.k_small_tank(h, 0, 0, .27, .08)

    def columns(h):
        foot(h, -.7, .7, -.48, .48, top=.14)
        column(h, -.3, .02, .32, .14, 2.0)
        column(h, .4, .12, .22, .14, 1.62, slit=False)
        pipe(h, [(-.02, .06, 1.35), (.22, .1, 1.35)], .05, 'steel')

    def tower(h):
        foot(h, -.55, .55, -.55, .55, top=.14)
        column(h, 0, 0, .44, .14, 2.72)
        pipe(h, [(.47, .18, .3), (.47, .18, 2.45)], .05, 'steel')
        mast(h, -.42, .4, .14, 3.25)
        mast(h, .42, .42, .14, 3.0)

    def hall_l(h):
        k_hall(h, 1.64, 'long')

    def hall_s(h):
        k_hall(h, .79, 'short')

    def pump(h):
        foot(h, -.72, .72, -.47, .47, top=.1, floor=-.45)
        rf.k_pump(h, 1, -.64, .64, -.4, .4, .1, .92)

    def refinery(h):
        foot(h, -1.13, 1.13, -.66, .7, top=.14)
        rf.k_rear(h, 1.06, -.58, .66, .14, 2.95)

    def spire(h):
        """Power relay spire (sheet 04): stepped base, four leaning bone pylons, a tapered core with a glowing slot."""
        B(h, -.72, .72, -.72, .72, -.55, .14, 'metal', c=.24)
        B(h, -.6, .6, -.6, .6, .14, .48, 'paint', c=.2)
        B(h, -.46, .46, -.46, .46, .48, .76, 'accent', c=.14)
        for x, y in ((-.4, -.4), (.4, -.4), (-.4, .4), (.4, .4)):
            h.wedge([(x - .12, y - .12), (x + .12, y - .12), (x + .12, y + .12), (x - .12, y + .12)], .48, 1.95, 'paint',
                    top=[(x * .55 - .07, y * .55 - .07), (x * .55 + .07, y * .55 - .07), (x * .55 + .07, y * .55 + .07), (x * .55 - .07, y * .55 + .07)])
            B(h, x * .62 - .08, x * .62 + .08, y * .62 - .08, y * .62 + .08, 1.62, 1.72, 'accent')
            if y < 0:
                B(h, x - .03, x + .03, y - .13, y - .1, .7, 1.3, 'glow')
        rf.octagon(h, 0, 0, .3, .76, 2.75, 'paint', r2=.18)
        B(h, -.05, .05, -.3, -.2, 1.0, 2.5, 'glow')
        for x in (-.1, .1):
            B(h, x - .02, x + .02, -.3, -.22, .95, 2.55, 'metal')
        rf.octagon(h, 0, 0, .23, 2.75, 2.86, 'metal')
        cyl(h, 0, 0, .07, 2.86, 3.02, 'steel', seg=8)
        cyl(h, 0, 0, .05, 3.02, 3.1, 'glow', seg=8)
        mast(h, -.4, .4, 1.95, 3.25)
        mast(h, .4, .4, 1.95, 3.08)
        for zz in (1.2, 1.7):
            rf.octagon(h, 0, 0, .3 - (zz - .76) * .06 + .02, zz, zz + .06, 'accent')

    def crane(h):
        """Extractor crane (sheet 02): a rust tower and a windowed cab with a counterweight; a heavy two-part arm on a
        hydraulic ram lowers a drill head over a crystal seam at its front left."""
        foot(h, -.7, .7, -.7, .7, top=.12)
        B(h, .08, .62, -.05, .62, .12, 1.55, 'accent', c=.06)
        B(h, .14, .56, -.08, -.05, .3, 1.42, 'paint')
        front_slit(h, .35, -.08, .5, 1.25, w=.04)
        for z in (.5, .9, 1.3):
            B(h, .62, .66, .05, .55, z, z + .05, 'metal')
        cyl(h, .35, .28, .34, 1.55, 1.63, 'metal', seg=16)
        B(h, -.02, .68, -.24, .62, 1.63, 1.98, 'paint', c=.07)
        B(h, .02, .64, -.27, -.24, 1.73, 1.9, 'glow')
        B(h, .1, .6, .38, .66, 1.63, 1.95, 'metal', c=.04)
        B(h, .12, .58, .64, .67, 1.7, 1.88, 'stripe')
        beam(h, (.22, .05, 1.92), (-.3, -.3, 2.3), .18, .16, 'accent')
        beam(h, (.22, .05, 1.94), (-.3, -.3, 2.32), .19, .04, 'paint')
        beam(h, (-.3, -.3, 2.3), (-.5, -.5, 1.42), .13, .12, 'accent')
        beam(h, (.3, .0, 1.68), (-.08, -.15, 2.08), .05, .05, 'steel')
        cyl(h, -.3, -.3, .1, 2.2, 2.4, 'metal', seg=10)
        cyl(h, -.5, -.5, .12, 1.12, 1.44, 'steel', seg=12)
        cyl(h, -.5, -.5, .13, 1.2, 1.26, 'stripe', seg=12)
        cyl(h, -.5, -.5, .1, .82, 1.12, 'metal', seg=10, r2=.02)
        for x, y, r, hh, lean in ((-.5, -.5, .07, .5, (.1, -.1)), (-.36, -.56, .05, .36, (.2, -.05)), (-.6, -.36, .05, .3, (-.15, .1))):
            crystal(h, x, y, r, .12, hh, lean)

    def crystals(h):
        cyl(h, 0, 0, .58, -.3, .07, 'metal', seg=14, r2=.52)
        cyl(h, 0, 0, .46, .04, .075, 'glow_crystal', seg=14)
        for x, y, r, hh, lean in ((0, 0, .12, 1.1, (0, 0)), (.24, .1, .09, .78, (.25, .1)), (-.22, .16, .09, .86, (-.22, .14)),
                                  (.08, -.24, .08, .6, (.1, -.3)), (-.2, -.2, .07, .5, (-.2, -.2)), (.3, -.18, .06, .42, (.3, -.2))):
            crystal(h, x, y, r, .06, hh, lean)
        for x, y in ((.42, .26), (-.42, .3), (.36, -.38)):
            B(h, x - .07, x + .07, y - .06, y + .06, .04, .16, 'metal')

    def pipe_k(h):
        pipe_run(h, 'accent')

    def wall(h):
        B(h, -1, 1, -.21, .21, -.5, .14, 'metal')
        B(h, -1, 1, -.17, .17, .14, .78, 'paint')
        B(h, -1, 1, -.2, .2, .78, .86, 'accent')
        for x in (-1, .92):
            B(h, x, x + .08, -.21, .21, .14, .9, 'metal')
        for s in (-1, 1):
            for a, b in ((-.82, -.08), (.08, .82)):
                B(h, a, b, s * .17, s * .2, .26, .68, 'accent')
            B(h, -.04, .04, s * .19, s * .215, .4, .7, 'glow')
            for k in range(5):
                x = -.9 + k * .38
                B(h, x, x + .18, s * .2, s * .21, .02, .12, 'stripe' if k % 2 == 0 else 'metal')

    return dict(tank_l=tank_l, tank_s=tank_s, columns=columns, tower=tower, hall_l=hall_l, hall_s=hall_s, pump=pump,
                refinery=refinery, spire=spire, crane=crane, crystals=crystals, pipe=pipe_k, wall=wall, ring=court_ring,
                apron=lambda k: apron(k, 'deck', 'metal'))


# ----------------------------------------------------------------------------- vesper modules
def v_hall(h, hy, roof):
    """Reactor hall: graphite with a raked top front, leaning armour fins and slits, detailed sides, a roof housing
    with a glowing grille and hot stacks."""
    hx, z0, z1, rake = .87, .12, 1.4, .4
    y0, w = -hy + .3, 2 * .87
    foot(h, -hx - .04, hx + .04, y0 - .04, hy + .04, top=z0, skirt=.03)
    h.prism([(y0, z0), (hy, z0), (hy, z1), (y0 + rake, z1), (y0, z1 - rake)], 'x', -hx, hx, 'paint')
    B(h, -hx - .03, hx + .03, y0 - .03, hy + .03, z0, z0 + .16, 'metal')
    for a, b, c, d in [(-hx, hx, hy - .08, hy + .02), (-hx - .02, -hx + .08, y0 + rake, hy), (hx - .08, hx + .02, y0 + rake, hy)]:
        B(h, a, b, c, d, z1, z1 + .07, 'steel')
    B(h, -hx + .16, hx - .16, y0 + rake * .5 - .03, y0 + rake * .5 + .03, z1 - rake * .5 - .03, z1 - rake * .5 + .03, 'glow')
    for f in (.08, .5, .92):
        x = -hx + w * f
        h.prism([(y0, z0 + .1), (y0 - .28, z0 + .1), (y0 - .04, z1 - rake - .05), (y0, z1 - rake - .05)], 'x', x - .08, x + .08, 'accent')
    for f in (.29, .71):
        front_slit(h, -hx + w * f, y0, z0 + .4, z1 - rake - .2, w=.05)
    side_details(h, hx, y0 + rake, hy, z0, z1)
    hx0, hx1 = -hx + .2, -hx + .2 + w * .5
    hy0 = y0 + rake + .2
    hy1 = hy0 + min(1.2, hy - hy0 - .3)
    B(h, hx0, hx1, hy0, hy1, z1, z1 + .34, 'accent', c=.1)
    B(h, hx0 + .12, hx1 - .12, hy0 + .12, hy1 - .12, z1 + .34, z1 + .36, 'glow')
    for k in range(4):
        y = hy0 + .18 + (hy1 - hy0 - .36) * k / 3
        B(h, hx0 + .1, hx1 - .1, y - .025, y + .025, z1 + .34, z1 + .42, 'metal')
    if roof == 'long':
        rf.v_stack(h, hx - .3, hy - .32, .13, z1, z1 + .5)
        rf.v_stack(h, hx - .3, hy - .82, .1, z1, z1 + .36)
        plates(h, hx1 + .14, hx - .16, hy0, hy1, z1)
    else:
        plates(h, hx1 + .14, hx - .16, hy0, hy - .16, z1, n=1)


def vesper_modules():
    def octo_foot(h, r, top=.12, floor=-.55):
        rf.octagon(h, 0, 0, r + .06, floor, 0, 'metal', r2=r)
        rf.octagon(h, 0, 0, r, 0, top, 'metal')

    def exchanger_l(h):
        octo_foot(h, .76)
        rf.v_exchanger(h, 0, 0, .64, .12, 1.6)

    def exchanger_s(h):
        octo_foot(h, .34, top=.1, floor=-.38)
        rf.v_exchanger(h, 0, 0, .26, .1, .95)

    def stacks(h):
        foot(h, -.5, .5, -.36, .36, top=.12)
        rf.v_stack(h, -.22, 0, .16, .12, 2.35)
        rf.v_stack(h, .26, .06, .12, .12, 1.95)
        pipe(h, [(-.06, .02, 1.2), (.14, .05, 1.2)], .05, 'steel')

    def reactor(h):
        """Thermal reactor tower (sheet 01): stepped base, octagonal core with a glowing channel behind leaning armour."""
        B(h, -.75, .75, -.75, .75, -.55, .14, 'metal', c=.22)
        B(h, -.62, .62, -.62, .62, .14, .55, 'paint', c=.18)
        for k in range(3):
            B(h, -.2, .2, -.62 - .12 + k * .04, -.62, .14, .26 + k * .1, 'steel')
        cy = .05
        rf.octagon(h, 0, cy, .44, .55, 2.75, 'paint')
        a = .44 * math.cos(math.pi / 8)
        B(h, -.07, .07, cy - a - .05, cy - a + .03, .7, 2.6, 'glow')
        B(h, -.12, .12, cy - a - .04, cy - a + .02, 2.6, 2.68, 'metal')
        for side in (-1, 1):
            h.prism([(cy - a + .02, .55), (cy - a - .24, .55), (cy - a - .02, 2.3), (cy - a + .02, 2.3)], 'x', side * .11, side * .3, 'accent')
            h.prism([(side * (a - .02), .55), (side * (a + .22), .55), (side * (a + .02), 2.1), (side * (a - .02), 2.1)], 'y', cy - .18, cy + .18, 'accent')
        rf.octagon(h, 0, cy, .52, 2.75, 2.88, 'metal')
        rf.octagon(h, 0, cy, .36, 2.88, 2.94, 'glow')
        rf.octagon(h, 0, cy, .24, 2.9, 3.02, 'steel')
        mast(h, .28, .32, 2.95, 3.25)
        for x in (-.45, .45):
            rf.v_stack(h, x, .45, .1, .55, 1.3)

    def hall_l(h):
        v_hall(h, 1.68, 'long')

    def hall_s(h):
        v_hall(h, .83, 'short')

    def tower(h):
        """Control tower of the cryo dock (sheet 02)."""
        octo_foot(h, .54, top=.14)
        rf.octagon(h, 0, 0, .46, .14, .6, 'accent')
        rf.octagon(h, 0, 0, .38, .6, 2.25, 'paint')
        a = .38 * math.cos(math.pi / 8)
        B(h, -.05, .05, -a - .04, -a + .02, .8, 1.85, 'glow')
        rf.octagon(h, 0, 0, .4, 1.95, 2.08, 'glow')
        rf.octagon(h, 0, 0, .44, 2.25, 2.37, 'metal')
        rf.octagon(h, 0, 0, .42, 2.37, 2.6, 'accent', r2=.28)
        mast(h, 0, 0, 2.6, 3.0)
        B(h, a, a + .04, -.05, .05, .6, 2.25, 'steel')

    def fuel(h):
        foot(h, -.75, .75, -.5, .5, top=.12, floor=-.38, stripes=False)
        for x in (-.46, 0, .46):
            cyl(h, x, .05, .2, .12, .95, 'stripe', seg=14)
            dome(h, x, .05, .2, .95, .1, 'metal', seg=14, rings=3)
            for zz in (.3, .7):
                cyl(h, x, .05, .215, zz, zz + .05, 'metal', seg=14)
        pipe(h, [(-.7, -.3, .3), (.7, -.3, .3)], .05, 'steel')
        B(h, -.08, .08, -.4, -.3, .12, .5, 'metal')

    def pylon(h):
        """Shield pylon (sheet 03, without guns: scenery must never read as a target)."""
        octo_foot(h, .38)
        rf.octagon(h, 0, 0, .3, .12, 2.2, 'paint', r2=.22)
        for x0, x1, y0, y1 in ((-.03, .03, -.29, -.22), (-.03, .03, .22, .29), (-.29, -.22, -.03, .03), (.22, .29, -.03, .03)):
            B(h, x0, x1, y0, y1, .45, 1.4, 'glow')
        rf.octagon(h, 0, 0, .3, 1.7, 1.8, 'glow')
        rf.octagon(h, 0, 0, .26, 2.2, 2.3, 'metal')
        cyl(h, 0, 0, .1, 2.3, 2.5, 'steel', seg=8, r2=.02)
        cyl(h, 0, 0, .04, 2.5, 2.6, 'glow', seg=8)

    def wall(h):
        B(h, -1, 1, -.21, .21, -.5, .12, 'metal')
        B(h, -1, 1, -.17, .17, .12, .8, 'paint')
        for s in (-1, 1):
            h.prism([(s * .17, .12), (s * .33, .12), (s * .17, .58)], 'x', -1, 1, 'accent')
            B(h, -.5, .5, s * .17, s * .19, .66, .7, 'glow')
        B(h, -1, 1, -.19, .19, .8, .86, 'steel')
        for x in (-1, .92):
            B(h, x, x + .08, -.21, .21, .12, .9, 'metal')

    def pipe_v(h):
        pipe_run(h, 'glow')

    def pad(k):
        """Landing pad of the cryo dock: an octagonal deck with a recessed centre for the gun, a lit ring, corner lights.
        A thin, wide deck: built without the chamfer (it would bulge the rims)."""
        h = Unbevelled(k.minor)
        ph = math.pi / 8
        annulus(h, 0, 0, 1.1, 2.62, -.3, .16, 'paint', seg=8, phase=ph, skirt=.06)
        rf.octagon(h, 0, 0, 1.1, -.3, .04, 'metal')
        annulus(h, 0, 0, 2.5, 2.62, .16, .2, 'steel', seg=8, phase=ph)
        annulus(h, 0, 0, 1.1, 1.2, .16, .2, 'steel', seg=8, phase=ph)
        seg, r0, r1 = 24, 1.42, 1.52
        for k_ in range(0, seg, 2):
            a0, a1 = 2 * math.pi * k_ / seg, 2 * math.pi * (k_ + 1) / seg
            h.wedge([(r0 * math.cos(a0), r0 * math.sin(a0)), (r1 * math.cos(a0), r1 * math.sin(a0)),
                     (r1 * math.cos(a1), r1 * math.sin(a1)), (r0 * math.cos(a1), r0 * math.sin(a1))], .15, .175, 'glow')
        for i in range(8):
            a = ph + i * math.pi / 4
            x, y = 2.4 * math.cos(a), 2.4 * math.sin(a)
            B(h, x - .06, x + .06, y - .06, y + .06, .16, .2, 'glow')
        front = -2.62 * math.cos(ph)
        for i in range(6):
            x = -.95 + i * .34
            B(h, x, x + .17, front - .01, front + .005, -.25, .15, 'stripe')
        for x, y in ((-1.7, .4), (1.7, .4), (0, 1.9)):
            B(h, x - .3, x + .3, y - .2, y + .2, .16, .19, 'steel')

    return dict(exchanger_l=exchanger_l, exchanger_s=exchanger_s, stacks=stacks, reactor=reactor, hall_l=hall_l, hall_s=hall_s,
                tower=tower, fuel=fuel, pylon=pylon, wall=wall, pipe=pipe_v, pad=pad, ring=court_ring,
                apron=lambda k: apron(k, 'deck', 'metal'))


# ----------------------------------------------------------------------------- nacre modules
def n_hall(h, hy):
    """Monolith wing, centred: tapered stone with an ember slit, crest seams, sills, standing stones and a pool."""
    rf.n_hall(h, 1, -.87, .87, -hy + .08, hy - .04, .12, 1.42)
    foot(h, -.92, .92, -hy + .04, hy - .02, top=.12, skirt=.02, stripes=False)


def nacre_modules():
    def basin_l(h):
        cyl(h, 0, 0, .8, -.55, 0, 'metal', seg=18, r2=.74)
        rf.n_basin(h, 0, 0, .66, .0, .72)

    def basin_s(h):
        cyl(h, 0, 0, .58, -.55, 0, 'metal', seg=16, r2=.54)
        rf.n_basin(h, 0, 0, .48, .0, .55)

    def hall_l(h):
        n_hall(h, 1.75)

    def hall_s(h):
        n_hall(h, .9)

    def obelisk(h):
        """Monolith relay (sheet 01): carved base with an ember gate, an obelisk crowned by a crystal, a halo, crescents."""
        foot(h, -1.12, 1.12, -.55, .55, top=.12, stripes=False)
        B(h, -1.06, 1.06, -.5, .5, .12, .7, 'paint', c=.16)
        B(h, -.3, .3, -.57, -.5, .12, .62, 'metal')
        B(h, -.2, .2, -.59, -.55, .18, .55, 'glow_ember')
        cy = .05
        rf.hexagon(h, 0, cy, .5, .7, .85, 'metal')
        rf.hexagon(h, 0, cy, .42, .85, 2.55, 'paint', r2=.26)
        ap = .42 * math.cos(math.pi / 6)
        B(h, -.05, .05, cy - ap - .02, cy - ap + .06, 1.0, 2.2, 'glow_ember')
        h.loft([[(rr * math.cos(k * math.pi / 3), cy + rr * math.sin(k * math.pi / 3), zz) for k in range(6)]
                for rr, zz in ((.02, 2.55), (.16, 2.8), (.02, 3.18))], 'glow')
        seg = 16
        h.loft([[((.62 + .05 * math.cos(b)) * math.cos(a), cy + (.62 + .05 * math.cos(b)) * math.sin(a), .85 + .05 * math.sin(b))
                 for b in [k * math.pi / 2 for k in range(4)]] for a in [2 * math.pi * i / seg for i in range(seg + 1)]], 'glow', caps=False)
        rf.horn(h, 0, cy, .75, 1.0, math.pi * 1.07, math.pi * .6, .3, .24, 'paint', lean=.4)
        rf.horn(h, 0, cy, .75, 1.0, -math.pi * .07, math.pi * .4, .3, .24, 'paint', lean=.4)
        for s in (-1, 1):
            mast(h, s * .92, .32, .7, 1.95 if s < 0 else 1.75, lamp='glow_ember')

    def pump(h):
        """Mire pump tower (sheet 03): a round stone tower with an ember slit, a lit crown and small crescent fins."""
        cyl(h, 0, 0, .66, -.55, 0, 'metal', seg=18, r2=.6)
        cyl(h, 0, 0, .52, 0, .3, 'metal', seg=18)
        cyl(h, 0, 0, .44, .3, 2.15, 'paint', seg=18)
        B(h, -.1, .1, -.47, -.41, .45, 1.95, 'metal')
        B(h, -.05, .05, -.49, -.45, .5, 1.9, 'glow_ember')
        cyl(h, 0, 0, .46, 1.0, 1.08, 'accent', seg=18)
        cyl(h, 0, 0, .47, 1.9, 2.0, 'glow', seg=18)
        dome(h, 0, 0, .44, 2.15, .3, 'accent', seg=18)
        rf.hexagon(h, 0, 0, .08, 2.42, 2.9, 'metal', r2=.03)
        cyl(h, 0, 0, .04, 2.9, 3.05, 'glow', seg=8)
        rf.horn(h, 0, 0, 1.25, .55, -math.pi * .08, math.pi * .45, .14, .12, 'paint', lean=.3)
        rf.horn(h, 0, 0, 1.25, .55, math.pi * 1.08, math.pi * .55, .14, .12, 'paint', lean=.3)

    def arc(h):
        """Shrine arc (sheet 02): one curved, arched stone segment of a ring of radius 2.2 around the gun. Its centre of
        curvature is at local (0, -2.2): the concave, carved face looks at the gun."""
        R, cy, half = 2.2, -2.2, math.radians(21)
        a0, a1 = math.pi / 2 - half, math.pi / 2 + half
        crest = lambda t: 1.5 + .75 * math.sin(math.pi * t)
        arc_wall(h, 0, cy, R - .24, R + .24, a0, a1, -.4, .12, 'metal')
        arc_wall(h, 0, cy, R - .16, R + .16, a0, a1, .12, crest, 'paint')
        arc_wall(h, 0, cy, R - .18, R - .12, a0 + .03, a1 - .03, lambda t: crest(t) - .05, lambda t: crest(t) + .015, 'glow')
        for x in (-.32, .32):
            B(h, x - .14, x + .14, -.2, -.15, .4, 1.25, 'accent')
        B(h, -.07, .07, -.21, -.15, .35, 1.6, 'metal')
        B(h, -.035, .035, -.23, -.19, .42, 1.52, 'glow_ember')

    def pillar(h):
        rf.hexagon(h, 0, 0, .25, -.4, .1, 'metal', r2=.22)
        rf.hexagon(h, 0, 0, .19, .1, 2.25, 'paint', r2=.13)
        B(h, -.03, .03, -.19, -.13, .4, 1.9, 'glow_ember')
        rf.hexagon(h, 0, 0, .15, 2.25, 2.33, 'metal')
        rf.hexagon(h, 0, 0, .1, 2.33, 2.45, 'glow')

    def stones(h):
        cyl(h, 0, 0, .46, -.4, .06, 'metal', seg=12, r2=.4)
        for x, y, r, hh in ((-.2, .05, .14, 1.2), (.18, -.1, .12, .85), (.12, .24, .1, .62)):
            rf.hexagon(h, x, y, r, .06, hh, 'paint', r2=r * .45)
            B(h, x - .02, x + .02, y - r * .9, y - r * .8, .2, hh * .7, 'glow')
        cyl(h, -.28, -.28, .1, .06, .075, 'glow', seg=10)

    def pool(h):
        """A glowing pool ring around the gun (flat, under the court's 0.25)."""
        annulus(h, 0, 0, 1.02, 1.95, -.3, .06, 'paint', seg=28)
        annulus(h, 0, 0, 1.12, 1.85, .06, .075, 'glow_pool', seg=28)
        annulus(h, 0, 0, 1.12, 1.16, .06, .085, 'glow', seg=28)
        annulus(h, 0, 0, 1.81, 1.85, .06, .085, 'glow', seg=28)

    def channel(h):
        for s in (-1, 1):
            B(h, -1, 1, s * .12, s * .2, -.3, .18, 'paint')
        B(h, -1, 1, -.12, .12, -.3, .05, 'metal')
        B(h, -1, 1, -.1, .1, .05, .07, 'glow_pool')
        B(h, -.92, .92, -.015, .015, .07, .085, 'glow')

    return dict(basin_l=basin_l, basin_s=basin_s, hall_l=hall_l, hall_s=hall_s, obelisk=obelisk, pump=pump, arc=arc,
                pillar=pillar, stones=stones, pool=pool, channel=channel, ring=court_ring,
                apron=lambda k: apron(k, 'deck', 'metal'))


# ----------------------------------------------------------------------------- luna modules
def l_hall(h, hy, roof):
    """Training ops block: white panels with bevelled long edges, a dark frame band, an amber window strip and door,
    detailed sides, roof vents, small tanks and an antenna."""
    hx, z0, z1 = .87, .12, 1.22
    foot(h, -hx - .04, hx + .04, -hy + .04, hy - .02, top=z0, skirt=.02)
    h.prism([(-hx, z0), (hx, z0), (hx, z1 - .2), (hx - .2, z1), (-hx + .2, z1), (-hx, z1 - .2)], 'y', -hy + .1, hy - .06, 'paint')
    y0 = -hy + .1
    B(h, -hx - .02, hx + .02, y0 - .02, hy - .04, z0, z0 + .14, 'metal')
    B(h, -hx + .1, hx - .1, y0 - .035, y0, z0 + .2, z1 - .28, 'accent')
    B(h, -hx + .2, hx - .2, y0 - .06, y0 - .03, z1 - .52, z1 - .4, 'glow')
    B(h, -.2, .2, y0 - .06, y0 - .02, z0 + .14, z0 + .72, 'metal')
    B(h, -.13, .13, y0 - .075, y0 - .05, z0 + .2, z0 + .64, 'glow')
    for k in range(6):
        x = -hx + .1 + k * (2 * hx - .2) / 6
        B(h, x, x + (2 * hx - .2) / 12, y0 - .05, y0 - .03, z0 + .02, z0 + .12, 'stripe')
    side_details(h, hx - .02, y0 + .2, hy - .2, z0, z1 - .2)
    if hy > 1.2:
        B(h, -hx + .45, hx - .45, y0 + 1.1, hy - .35, z1, z1 + .03, 'steel')
    vx = -.3
    B(h, vx - .25, vx + .25, y0 + .45, y0 + .95, z1, z1 + .2, 'accent', c=.04)
    for k in range(4):
        B(h, vx - .22, vx + .22, y0 + .52 + k * .12, y0 + .56 + k * .12, z1 + .2, z1 + .26, 'metal')
    for x, y in ((.4, y0 + .55), (.4, y0 + .95)):
        cyl(h, x, y, .13, z1, z1 + .26, 'paint', seg=12)
        dome(h, x, y, .13, z1 + .26, .06, 'paint', seg=12, rings=2)
        cyl(h, x, y, .135, z1 + .1, z1 + .15, 'stripe', seg=12)
    mast(h, hx - .25, hy - .3, z1, z1 + .5)
    if roof == 'long':
        B(h, -.1, hx - .3, hy - 1.1, hy - .5, z1 + .02, z1 + .07, 'metal')
        for k in range(4):
            y = hy - 1.05 + k * .15
            B(h, -.06, hx - .34, y, y + .03, z1 + .07, z1 + .09, 'steel')


def luna_modules():
    def octo_foot(h, r, top=.12, floor=-.55):
        rf.octagon(h, 0, 0, r + .06, floor, 0, 'metal', r2=r)
        rf.octagon(h, 0, 0, r, 0, top, 'metal')

    def bunker(h):
        """Training command bunker (sheet 01): sloped octagonal walls, a raised ops deck with an amber window band,
        side pods, rooftop tanks and masts, a lit door over a striped apron."""
        octo_foot(h, 1.2, top=.14)
        rf.octagon(h, 0, 0, 1.1, .14, .95, 'paint', r2=1.0)
        rf.octagon(h, 0, 0, 1.12, .14, .3, 'metal')
        rf.octagon(h, 0, 0, .8, .95, 1.35, 'paint')
        rf.octagon(h, 0, 0, .84, .95, 1.0, 'metal')
        a = .8 * math.cos(math.pi / 8)
        B(h, -.32, .32, -a - .03, -a + .02, 1.1, 1.2, 'glow')
        rf.octagon(h, 0, 0, .82, 1.35, 1.42, 'paint')
        rf.octagon(h, 0, 0, .3, 1.42, 1.46, 'steel')
        for i in range(8):
            ang = math.pi / 8 + i * math.pi / 4
            rx, ry = math.cos(ang), math.sin(ang)
            B(h, 1.0 * rx - .06, 1.0 * rx + .06, 1.0 * ry - .06, 1.0 * ry + .06, .3, .9, 'metal')
            if ry < 0:
                B(h, 1.05 * rx - .025, 1.05 * rx + .025, 1.05 * ry - .025, 1.05 * ry + .025, .42, .78, 'glow')
        dome(h, -.45, -.2, .17, 1.42, .08, 'paint', seg=12, rings=2)
        cyl(h, -.45, -.2, .03, 1.42, 1.6, 'steel', seg=6)
        for x, y in ((-.3, .25), (.05, .32)):
            cyl(h, x, y, .13, 1.42, 1.72, 'paint', seg=12)
            dome(h, x, y, .13, 1.72, .06, 'paint', seg=12, rings=2)
            cyl(h, x, y, .135, 1.52, 1.57, 'stripe', seg=12)
        B(h, .2, .55, -.35, .0, 1.42, 1.6, 'accent', c=.04)
        mast(h, .45, .4, 1.42, 1.95)
        mast(h, .58, .2, 1.42, 1.8)
        fa = 1.04 * math.cos(math.pi / 8)
        B(h, -.26, .26, -fa - .08, -fa + .1, .14, .72, 'metal')
        B(h, -.17, .17, -fa - .1, -fa - .06, .2, .64, 'glow')
        B(h, -.3, .3, -fa - .1, -fa + .02, .72, .78, 'stripe')
        B(h, -.36, .36, -1.18, -fa - .08, .0, .06, 'steel')
        for k in range(4):
            x = -.32 + k * .17
            B(h, x, x + .08, -1.17, -fa - .1, .06, .07, 'stripe')
        for s in (-1, 1):
            B(h, s * .9, s * 1.12, -.32, .32, .14, .62, 'paint', c=.05)
            B(h, s * 1.12, s * 1.14, -.2, .2, .3, .5, 'glow')
            B(h, s * .9, s * 1.12, -.34, .34, .62, .66, 'metal')
        for ang in (-112.5, -67.5):
            ar = math.radians(ang)
            x, y = 1.0 * math.cos(ar), 1.0 * math.sin(ar)
            B(h, x - .05, x + .05, y - .05, y + .05, .8, .95, 'glow')

    def radar(h):
        """Radar / comms tower (sheet 02): octagonal base, a braced mast, a tilted dish facing the sky over the
        camera, amber-lit antennas."""
        octo_foot(h, .9)
        rf.octagon(h, 0, 0, .7, .12, .55, 'paint', r2=.62)
        a = .66 * math.cos(math.pi / 8)
        B(h, -.18, .18, -a - .06, -a + .06, .12, .5, 'metal')
        B(h, -.11, .11, -a - .08, -a - .04, .16, .44, 'glow')
        for x, y in ((-.36, -.36), (.36, -.36), (-.36, .36), (.36, .36)):
            beam(h, (x, y, .55), (x * .35, y * .35, 2.25), .07, .07, 'metal')
        for z in (1.0, 1.6):
            k = 1 - (z - .55) / 1.7 * .65
            for (x0, y0), (x1, y1) in (((-.36, -.36), (.36, -.36)), ((.36, -.36), (.36, .36)), ((.36, .36), (-.36, .36)), ((-.36, .36), (-.36, -.36))):
                beam(h, (x0 * k, y0 * k, z), (x1 * k, y1 * k, z), .04, .04, 'steel')
        for x, y in ((-.6, .42), (.6, .42), (.0, .68)):
            B(h, x - .2, x + .2, y - .15, y + .15, .12, .5, 'paint', c=.04)
            B(h, x - .16, x + .16, y - .17, y - .15, .3, .36, 'glow')
            B(h, x - .2, x + .2, y - .15, y + .15, .5, .54, 'metal')
        cyl(h, 0, 0, .12, .55, 2.45, 'steel', seg=10)
        cyl(h, 0, 0, .2, 2.25, 2.45, 'metal', seg=12)
        # Dish: a shell lofted along its own axis, tilted to face up and toward the camera.
        axis = Vector((0, -.55, .83)).normalized()
        u = Vector((1, 0, 0))
        v = axis.cross(u).normalized()
        centre = Vector((0, .1, 2.55))
        def disc(r, depth, seg=20):
            return [tuple(centre + axis * depth + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r) for i in range(seg)]
        h.loft([disc(.06, -.02), disc(.32, .05), disc(.62, .22), disc(.6, .17), disc(.3, .0), disc(.08, -.06)], 'paint')
        tip = centre + axis * .55
        beam(h, tuple(centre + axis * .02), tuple(tip), .04, .04, 'steel')
        cyl(h, tip.x, tip.y, .05, tip.z - .04, tip.z + .04, 'glow', seg=8)
        mast(h, -.55, .45, .55, 3.25)
        mast(h, .55, .45, .55, 3.0)

    def hall_l(h):
        l_hall(h, 1.75, 'long')

    def hall_s(h):
        l_hall(h, .9, 'short')

    def capsule(h, x, y, r, z0, z1):
        cyl(h, x, y, r + .05, z0, z0 + .12, 'metal', seg=16)
        cyl(h, x, y, r, z0 + .12, z1, 'paint', seg=16)
        for zz in (z0 + .35, z1 - .3):
            cyl(h, x, y, r + .015, zz, zz + .1, 'stripe', seg=16)
        dome(h, x, y, r, z1, r * .5, 'paint', seg=16)
        cyl(h, x, y, r * .3, z1 + r * .46, z1 + r * .46 + .07, 'metal', seg=10)
        B(h, x - .06, x + .06, y - r - .03, y - r + .03, z0 + .5, z1 - .4, 'glow')

    def tank_l(h):
        round_foot(h, 0, 0, .66, top=.1)
        capsule(h, 0, 0, .6, .1, 1.3)

    def tank_s(h):
        round_foot(h, 0, 0, .32, top=.08, floor=-.38, seg=12)
        capsule(h, 0, 0, .27, .08, .7)

    def capsules(h):
        foot(h, -.75, .75, -.46, .46, top=.12)
        capsule(h, -.36, 0, .32, .12, 1.55)
        capsule(h, .42, .05, .26, .12, 1.2)
        pipe(h, [(-.04, .02, .6), (.16, .04, .6)], .05, 'steel')
        mast(h, .62, .32, .12, 1.95)

    def cargo(h):
        foot(h, -.7, .7, -.45, .45, top=.1, floor=-.38, stripes=False)
        for x0, x1, y0, y1, z0, z1, mat in ((-.68, -.02, -.42, .42, .1, .52, 'accent'), (.04, .68, -.4, .2, .1, .52, 'paint'),
                                           (-.6, .1, -.36, .36, .52, .94, 'paint')):
            B(h, x0, x1, y0, y1, z0, z1, mat, c=.02)
            for x in (x0 + .02, x1 - .06):
                B(h, x, x + .04, y0 - .02, y1 + .02, z0 + .02, z1 - .02, 'stripe')
            for k in range(3):
                xx = x0 + (x1 - x0) * (k + 1) / 4
                B(h, xx - .015, xx + .015, y0 - .015, y0, z0 + .06, z1 - .06, 'metal')
        B(h, .3, .45, .3, .42, .1, .3, 'glow')

    def power(h):
        """Power module (sheet 05): a generator housing with radiator fins, an amber status strip and a lamp mast."""
        foot(h, -.66, .66, -.46, .46, top=.12)
        B(h, -.6, .6, -.4, .4, .12, .72, 'paint', c=.06)
        B(h, -.5, .5, -.43, -.4, .5, .58, 'glow')
        B(h, -.5, .5, -.43, -.4, .2, .44, 'accent')
        for k in range(7):
            x = -.45 + k * .15
            B(h, x - .02, x + .02, -.3, .3, .72, 1.2, 'steel')
        B(h, -.5, .5, -.32, .32, .72, .76, 'metal')
        cyl(h, .5, .3, .06, .72, 2.3, 'steel', seg=8)
        cyl(h, .5, .3, .05, 2.3, 2.4, 'glow', seg=8)
        for z in (1.2, 1.7):
            cyl(h, .5, .3, .065, z, z + .05, 'stripe', seg=8)

    def beacon(h):
        cyl(h, 0, 0, .3, -.4, 0, 'metal', seg=10, r2=.26)
        cyl(h, 0, 0, .26, 0, .12, 'metal', seg=10)
        cyl(h, 0, 0, .12, .12, 2.1, 'paint', seg=10, r2=.07)
        for z in (.6, 1.3, 1.85):
            cyl(h, 0, 0, .125 - (z - .12) * .028 + .01, z, z + .07, 'stripe', seg=10)
        cyl(h, 0, 0, .09, 2.1, 2.2, 'glow', seg=10)

    def wall(h):
        """A concrete blast barrier (tiles every 2) with an amber band."""
        h.prism([(-.28, -.5), (.28, -.5), (.28, .1), (.12, .25), (.1, .76), (-.1, .76), (-.12, .25), (-.28, .1)], 'x', -1.01, 1.01, 'accent')
        for s in (-1, 1):
            B(h, -.9, .9, s * .1, s * .115, .55, .63, 'stripe')
            B(h, -.04, .04, s * .11, s * .12, .66, .72, 'glow')

    def pipe_l(h):
        pipe_run(h, 'stripe')

    def pad(k):
        """Modular hangar pad (sheet 03): a chamfered square deck around the gun's recess, an amber landing ring,
        corner lights and two ramps toward the camera. Built without the chamfer bevel (thin, wide)."""
        h = Unbevelled(k.minor)
        ph = math.pi / 8
        annulus(h, 0, 0, 1.1, 2.52, -.3, .16, 'metal', seg=8, phase=ph, skirt=.06)
        rf.octagon(h, 0, 0, 1.1, -.3, .04, 'steel')
        annulus(h, 0, 0, 2.4, 2.52, .16, .2, 'paint', seg=8, phase=ph)
        annulus(h, 0, 0, 1.1, 1.2, .16, .2, 'paint', seg=8, phase=ph)
        for side in (-1, 1):
            h.wedge([(0, -1.72), (side * .05, -1.72), (side * .42, -2.18), (side * .3, -2.2)], .16, .175, 'paint')
        annulus(h, 0, 0, 1.5, 1.6, .16, .175, 'stripe', seg=32)
        for i in range(8):
            a = ph + i * math.pi / 4
            x, y = 2.3 * math.cos(a), 2.3 * math.sin(a)
            B(h, x - .07, x + .07, y - .07, y + .07, .16, .2, 'glow')
        front = -2.52 * math.cos(ph)
        for s in (-1, 1):
            h.prism([(front, .16), (front, -.3), (front - .12, -.3), (front - .12, .02)], 'x', s * .3, s * .85, 'steel')
            B(h, s * .3, s * .34, front - .12, front, .02, .17, 'stripe')
        for x, y in ((-1.75, .2), (1.75, .2), (0, 1.95)):
            B(h, x - .28, x + .28, y - .18, y + .18, .16, .19, 'metal')

    return dict(bunker=bunker, radar=radar, hall_l=hall_l, hall_s=hall_s, tank_l=tank_l, tank_s=tank_s, capsules=capsules,
                cargo=cargo, power=power, beacon=beacon, wall=wall, pipe=pipe_l, pad=pad, ring=court_ring)


BUILDERS = {'khepri': khepri_modules, 'vesper': vesper_modules, 'nacre': nacre_modules, 'luna': luna_modules}


# ----------------------------------------------------------------------------- build
def module(world, name, make, sc, mats, contract):
    h = rf.Kit(list(PALETTES[world]))
    make(h)
    node = 'fk_%s_%s' % (world, name)
    ob = h.object(node, mats, sc)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    c = contract[node]
    print('%-22s x %+.2f..%+.2f  y %+.2f..%+.2f  z %+.2f..%.2f  tris %5d   contract half %s top %.2f below %.2f'
          % (node, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], br.triangles([ob]), c['half'], c['top'], c['below']))
    problems = []
    if max(-lo[0], hi[0]) > c['half'][0] + 1e-3: problems.append('x %.3f > %.2f' % (max(-lo[0], hi[0]), c['half'][0]))
    if max(-lo[1], hi[1]) > c['half'][1] + 1e-3: problems.append('y %.3f > %.2f' % (max(-lo[1], hi[1]), c['half'][1]))
    if hi[2] > c['top'] + 1e-3: problems.append('top %.3f > %.2f' % (hi[2], c['top']))
    if -lo[2] > c['below'] + 1e-3: problems.append('below %.3f > %.2f' % (-lo[2], c['below']))
    return ob, problems


def build(export=True, preview=True):
    import bpy
    wanted = [a.split('=')[1] for a in sys.argv if a.startswith('--world=')]
    contract = registry()
    results, objects = [], []
    for world in [w for w in WORLDS if w in BUILDERS and (not wanted or w in wanted)]:
        sc = br.scene('Last Worlds — Facility kit ' + world)
        mats = materials(world)
        objects, problems = [], []
        for name, make in BUILDERS[world]().items():
            ob, issues = module(world, name, make, sc, mats, contract)
            objects.append(ob)
            problems += ['%s: %s' % (ob.name, i) for i in issues]
        missing = sorted(n for n, c in contract.items() if c['world'] == world and n not in {o.name for o in objects})
        assert not missing, 'not built: %s' % missing
        assert not problems, 'outside the contract:\n  ' + '\n  '.join(problems)
        bpy.context.view_layer.update()
        br.texture_bake(objects, 'fk_' + world, world + '_facility')
        for o in objects:
            br.bake_ao([o], [o], strength=.8, reach=1.6)
        marker = br.marker('facility_kit_v3', sc=sc, note='Modular facility kit after the facility sheets')
        if export:
            path = os.path.join(br.ROOT, 'public', 'assets', world, 'facility-kit-%s.glb' % LABEL)
            results.append(br.export(path, objects + [marker], 'Last Worlds — %s modular facility kit' % world))
        if '--closeups' in sys.argv:
            for o in objects:
                hx, hs = contract[o.name]['half']
                br.game_view(sc, (0, 0, contract[o.name]['top'] * .45), max(2.2, 2.4 * max(hx, hs) + .6),
                             os.path.join(br.LOOKDEV, '..', 'facility-kit', 'closeups', '%s.png' % o.name), res=520,
                             objects=[o], light='ice' if world == 'vesper' else 'desert')
        if preview:
            # A contact sheet in the game view: modules on a grid (positions do not matter after export).
            x, y, row = -6.5, 0.0, 0.0
            for o in objects:
                hx, hs = contract[o.name]['half']
                if x + 2 * hx > 6.5:
                    x, y, row = -6.5, y + row + .7, 0.0
                o.location = (x + hx, y + hs, 0)
                x += 2 * hx + .5
                row = max(row, 2 * hs)
            br.game_view(sc, (0, (y + row) / 2 + .6, .9), 15.5, os.path.join(br.LOOKDEV, '..', 'facility-kit', '%s-kit.png' % world),
                         objects=objects, light='ice' if world == 'vesper' else 'desert')
    return objects, results
