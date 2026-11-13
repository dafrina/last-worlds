"""THE CITADEL, Nahara's boss, built of the ruin kit (13 November 2026; docs/39).

The user, on the adapted Tripo mesh: "its color is off ... I would expect you to reuse some of the existing brick and arc
models on the boss so it seems coherent"; then "keep it kit built, but obviously you can still take shapes etc from the
tripo model". Built of the kit's own construction (tools/blender/nahara_kit.py): rounded weathered blocks (rblock,
tower_of_blocks), rings of wedge voussoirs with the teal channel, the kit's paint and AO, texture-baked in Nahara's
sandstone (--bake). After the Tripo model's shapes: a rock mesa carved with pillars and arches down to the canyon floor,
a curved upper terrace, a drum fronted by nested rings round the emblem under a crown of turquoise panels, blade fins,
long stepped buttresses; ruined throughout (cave-ins, broken fins and columns, broken bridges).

Frame (src/content/citadel.ts): x right, y = s (away from the camera; the stairs toward -y), z up, the plaza's base at
z 0 (the arena's plateau), the rock down to z -6.8. Nodes (src/render/veil-view.ts approvedRig):
    citadel_hull       everything that is not a target
    citadel_heart      the crown's turquoise crystal panels and their bronze ribs (the core)
    citadel_pod_left   the left lantern (crystal in a bronze cage)
    citadel_pod_right  the right lantern
    citadel_prow       the round emblem at the rings' centre
    and a dark crumpled _wreck of each target. The report (lookdev/nahara/citadel/citadel-v2-report.json) gives each
    target's position projected onto the target plane.

Headless:
    R=/home/davidfarina/Projects/alien-skies
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/nahara_citadel.py)" -- [--bake] [--no-export] [--no-previews]
"""
import bpy, json, math, os, random, sys, time
import numpy as np

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import boss_remodel as br
import approved_eclipse as ae
import nahara_kit as nk
from nahara_kit import RoundKit, rblock, voussoir, channel, tower_of_blocks, tone, octagon, open_tops
from nahara_kit import SAND, STONE, BROWN, DARK, BRONZE, GLOW

OUT = os.path.join(br.ROOT, 'public', 'assets', 'nahara', 'the-citadel-v2.glb')
PREVIEW = os.path.join(br.ROOT, 'lookdev', 'nahara', 'citadel')
P = 'citadel_'
CRYSTAL = 'citadel_crystal_glow'
# The dressed walls' darker sandstone: under the sun behind the ship every face toward the camera is lit, so the walls are
# painted darker than the pale tops, or the stepped mass reads flat.
WALL = 'citadel_wall'
ROLES = nk.ROLES + [CRYSTAL, WALL]
TARGET_HEIGHT = 2.4
COT = 1 / math.tan(math.radians(55))

# The plan (game units).
# After the user's Tripo model's shapes (user, 13 November: "keep it kit built, but obviously you can still take shapes etc
# from the tripo model"; "make it higher, more imposing"; "Just like boxes on boxes"): a rotunda on a rocky mesa in a
# canyon, its front nested rings of wedge stones round the emblem, a crown of turquoise panels round the drum's top, tall
# blade fins leaning out round it, long stepped buttresses running down to the mesa's corners, stairs down the cliff.
MESA = dict(w=7.4, front=-6.4, centre=-3.6, top=0.9, foot=-6.8)   # the rock: a front edge, its back a half circle
UPPER = dict(cx=0.0, cy=-.6, r=4.9, z0=0.9, z1=1.9)              # the curved upper terrace the rotunda stands on
DRUM = dict(cx=0.0, cy=.3, r=3.0, z0=1.9, z1=4.3)                # the rotunda's drum
LANTERN = dict(x=2.9, y=-3.6, z=1.9)                              # the pedestals (the pods)
EMBLEM = dict(y=-3.25, z=2.78, r=.6)                             # the round emblem (prow) at the rings' centre
CROWN_Z = (4.3, 5.08)                                             # the crown panels round the drum's front
GATES = (-4.2, 4.2)                                               # the drone gates (src/content/citadel.ts bays), y -5.5


def log(*a):
    print('CITADEL2', *a, flush=True)


class _Loft:
    def __init__(self, inner, p, flip):
        self.inner, self.p, self.flip = inner, p, flip

    def loft(self, loops, mat, caps=True):
        loops = [[self.p(v) for v in loop] for loop in loops]
        if self.flip:
            loops = [list(reversed(loop)) for loop in loops]
        self.inner.loft(loops, mat, caps)

    def box(self, lo, hi, mat, chamfer=0.0):
        a, b = self.p(lo), self.p(hi)
        self.inner.box(tuple(min(a[i], b[i]) for i in range(3)), tuple(max(a[i], b[i]) for i in range(3)), mat, chamfer)


class Placed:
    """A kit seen through a placement (offset, positive or mirrored scale): the kit's builders (tower_of_blocks, voussoir,
    channel) draw into it at the citadel's coordinates."""

    def __init__(self, k, at=(0, 0, 0), sc=(1, 1, 1), yaw=0.0):
        self.k, self.at, self.sc = k, at, sc
        c, s_ = math.cos(yaw), math.sin(yaw)
        def p(v):
            x, y = v[0] * sc[0], v[1] * sc[1]
            return (at[0] + x * c - y * s_, at[1] + x * s_ + y * c, at[2] + v[2] * sc[2])
        flip = sc[0] * sc[1] * sc[2] < 0
        self.major, self.minor = _Loft(k.major, p, flip), _Loft(k.minor, p, flip)
        self._p = p

    def box(self, lo, hi, mat, chamfer=0.0):
        a, b = self._p(lo), self._p(hi)
        self.k.box(tuple(min(a[i], b[i]) for i in range(3)), tuple(max(a[i], b[i]) for i in range(3)), mat, chamfer)


def B(k, x0, x1, y0, y1, z0, z1, mat):
    k.box((min(x0, x1), min(y0, y1), min(z0, z1)), (max(x0, x1), max(y0, y1), max(z0, z1)), mat)


def yblock(k, cx, cy, hx, hy, z0, z1, yaw, mat, r=.06):
    """rblock turned about z (for courses along the terraces' rounded backs)."""
    r = max(.005, min(r, hx * .6, hy * .6, (z1 - z0) * .3))
    inner = octagon(-hx + r * .7, hx - r * .7, -hy + r * .7, hy - r * .7, r * .6)
    outer = octagon(-hx, hx, -hy, hy, r)
    c, s = math.cos(yaw), math.sin(yaw)
    rot = lambda x, y: (cx + x * c - y * s, cy + x * s + y * c)
    loops = [[rot(x, y) + (z,) for x, y in ring] for ring, z in ((inner, z0), (outer, z0 + r), (outer, z1 - r), (inner, z1))]
    k.major.loft(loops, mat)


def cuts(rng, a, b, lmin, lmax):
    """Joints of a course from a to b: block lengths lmin..lmax, no sliver at the end."""
    out = [a]
    while out[-1] < b - 1e-6:
        e = min(b, out[-1] + rng.uniform(lmin, lmax))
        if b - e < lmin * .5:
            e = b
        out.append(e)
    return out


def run_x(k, rng, x0, x1, y0, y1, z0, z1, lmin=.8, lmax=1.5, r=.05, skip=0.0, holes=()):
    """A course of rounded blocks along x; `holes` (x0, x1) are left open; `skip` blocks are missing (ruin)."""
    j = cuts(rng, x0, x1, lmin, lmax)
    for a, b in zip(j, j[1:]):
        pieces = [(a, b)]
        for h0, h1 in holes:
            pieces = [p for q in pieces for p in ((q[0], min(q[1], h0)), (max(q[0], h1), q[1])) if p[1] - p[0] > .05]
        for pa, pb in pieces:
            if rng.random() < skip:
                continue
            rblock(k, pa + .012, pb - .012, y0, y1, z0 + .006, z1 - .006, tone(rng), r)


def run_y(k, rng, x0, x1, y0, y1, z0, z1, lmin=.8, lmax=1.5, r=.05, skip=0.0):
    j = cuts(rng, y0, y1, lmin, lmax)
    for a, b in zip(j, j[1:]):
        if rng.random() < skip:
            continue
        rblock(k, x0, x1, a + .012, b - .012, z0 + .006, z1 - .006, tone(rng), r)


def run_arc(k, rng, cx, cy, radius, depth, z0, z1, a0=0.0, a1=math.pi, lmin=.8, lmax=1.4, r=.05, skip=0.0):
    """A course along a half circle (outer face at `radius`), each block a chord."""
    length = radius * (a1 - a0)
    j = cuts(rng, 0, length, lmin, lmax)
    rm = radius - depth / 2
    for a, b in zip(j, j[1:]):
        if rng.random() < skip:
            continue
        t = a0 + (a + b) / 2 / radius
        half = (b - a) / 2 * rm / radius - .012
        yblock(k, cx + math.cos(t) * rm, cy + math.sin(t) * rm, depth / 2, half, z0 + .006, z1 - .006, t, tone(rng), r)


def inside(t, x, y, inset=0.0):
    """Within a terrace's plan (a rectangle in front of its centre, a half circle behind it)."""
    w = t['w'] - inset
    if y < t['front'] + inset:
        return False
    if y <= t['centre']:
        return abs(x) <= w
    return x * x + (y - t['centre']) ** 2 <= w * w


def run_arc(k, rng, cx, cy, radius, depth, z0, z1, a0=0.0, a1=math.pi, lmin=.8, lmax=1.4, r=.05, skip=0.0, mat=None):
    """A course along an arc (outer face at `radius`), each block a chord."""
    length = radius * (a1 - a0)
    j = cuts(rng, 0, length, lmin, lmax)
    rm = radius - depth / 2
    for a, b in zip(j, j[1:]):
        if rng.random() < skip:
            continue
        t = a0 + (a + b) / 2 / radius
        half = (b - a) / 2 * rm / radius - .012
        yblock(k, cx + math.cos(t) * rm, cy + math.sin(t) * rm, depth / 2, half, z0 + .006, z1 - .006, t, mat or tone(rng), r)


NOTCHES = ((-2.55, .14, 1.1), (-1.05, .1, .8), (-.35, .12, 1.0), (.5, .16, 1.2), (1.35, .1, .7), (2.35, .12, .9), (2.9, .09, .8))


def mesa_outline(off, wob, n=72, notched=False):
    """The mesa's plan: a front edge and a half circle behind, its edge ragged (`wob`), pushed out by `off`; `notched`:
    bites broken out of its rim (user, 13 November: "include some broken off parts ... some caving ins")."""
    w, f, c = MESA['w'] + off, MESA['front'] - off, MESA['centre']
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        dx, dy = math.cos(t), math.sin(t)
        if dy >= 0:
            x, y = dx * w, c + dy * w
        else:
            # Toward the front: the rectangle's edge along the ray from (0, c).
            k = min(w / max(abs(dx), 1e-6), (c - f) / max(-dy, 1e-6))
            x, y = dx * k, c + dy * k
        e = wob * (math.sin(t * 7 + 1.3) * .5 + math.sin(t * 13 + 4.1) * .3 + math.sin(t * 23 + .7) * .2)
        if notched:
            for c, w, depth in NOTCHES:
                dt = (t - c + math.pi) % (2 * math.pi) - math.pi
                e -= depth * math.exp(-(dt / w) ** 2) * (1 + .3 * math.sin(t * 41))
        pts.append((x + dx * e, y + dy * e))
    return pts


def mesa(k):
    """The rock the citadel stands on, as the canyon's own walls: strata stepping out a little as they go down, each its own
    shade, ragged; its top the plaza (z MESA top). It reaches far down, so where the canyon falls away round the citadel's
    pad (src/world/terrain-nahara.ts) its cliff is the rock's."""
    bands = [(MESA['foot'], -4.2, .22, BROWN, .2, False), (-4.2, -2.0, .14, STONE, .18, False), (-2.0, -.4, .07, BROWN, .17, False),
             (-.4, MESA['top'] - .08, 0.0, STONE, .3, True)]
    for z0, z1, off, mat, wob, notched in bands:
        k.major.loft([[(x, y, z0) for x, y in mesa_outline(off + .08, wob, 144, notched)], [(x, y, z1 - .1) for x, y in mesa_outline(off, wob, 144, notched)],
                      [(x, y, z1) for x, y in mesa_outline(off - .1, wob, 144, notched)]], mat)
    # The plaza: a slab a little in from the rim.
    k.major.loft([[(x, y, MESA['top'] - .1) for x, y in mesa_outline(-.15, .3, 144, True)], [(x, y, MESA['top']) for x, y in mesa_outline(-.3, .3, 144, True)]], SAND)
    # Its pavement's turquoise lines (old conduits) either side of the stairs.
    for side in (-1, 1):
        B(k, side * 2.3, side * 6.2, -5.95, -5.88, MESA['top'] - .005, MESA['top'] + .008, GLOW)


def cliff_facade(k, rng):
    """The rock's cliff carved as the canyon's own ruins (user, 13 November: "extend the bottom base of the model to have
    pillars and whatnot so it reads like part of the terrain, not like just planted on top"): all round, engaged pillars
    of stacked blocks from the canyon floor to the plaza's rim, wedge-stone arches between them over dark lit recesses,
    some pillars fallen short; strata bands of rock between."""
    pts = mesa_outline(.3, 0.0, n=360)
    # Walk the outline, a pillar every ~2.3 units (none across the stairs).
    L = [0.0]
    for a, b in zip(pts, pts[1:] + pts[:1]):
        L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = L[-1]
    n = int(total / 2.3)
    def at(u):
        u %= total
        i = max(j for j in range(len(pts)) if L[j] <= u)
        a, b = pts[i], pts[(i + 1) % len(pts)]
        f = (u - L[i]) / max(1e-6, L[i + 1] - L[i])
        x, y = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
        tx, ty = b[0] - a[0], b[1] - a[1]
        return x, y, math.atan2(ty, tx)
    top = MESA['top'] - .15
    piers = []
    for i in range(n):
        x, y, yaw = at(total * i / n)
        stairs = abs(x) < 2.3 and y < MESA['front'] + .5
        piers.append(None if stairs else (x, y, yaw))
    for i, pr in enumerate(piers):
        if pr is None:
            continue
        x, y, yaw = pr
        short = rng.random() < .3
        z = MESA['foot']
        zt = top if not short else rng.uniform(-3.5, -1.5)
        hh = .55
        while z < zt - .05:
            z1 = min(zt, z + hh * rng.uniform(.85, 1.15))
            w = .32 * rng.uniform(.95, 1.05)
            yblock(k, x, y, w, .3, z + .005, z1 - .005, yaw, tone(rng), .05)
            z = z1
        if short:
            rubble(k, rng, [(x, y, zt, 1)])
        nxt = piers[(i + 1) % len(piers)]
        if nxt is None or short:
            continue
        # The arch to the next pillar, in the cliff's plane, over a dark recess lit low.
        x2, y2, _ = nxt
        span = math.hypot(x2 - x, y2 - y)
        if span > 3.2 or rng.random() < .3:
            # (An arch fallen: a dark cave in the rock between the pillars instead, its mouth ragged.)
            if span <= 3.2 and rng.random() < .7:
                mx, my, yaw2 = (x + x2) / 2, (y + y2) / 2, math.atan2(y2 - y, x2 - x)
                zc = rng.uniform(-4.5, -2.0)
                yblock(k, mx, my, span / 2 - .45, .08, zc - .7, zc + .6, yaw2, DARK, .1)
                rubble(k, rng, [(mx - math.sin(yaw2) * -.5, my + math.cos(yaw2) * -.5, zc - .75, 2)])
            continue
        mx, my, yaw2 = (x + x2) / 2, (y + y2) / 2, math.atan2(y2 - y, x2 - x)
        p = Placed(k, (mx, my, 0), (1, 1, 1), yaw2)
        rad1 = span / 2 + .02
        zc = top - .5 - rad1 * .55
        for j in range(7):
            voussoir(p, math.pi * (1 - j / 7), math.pi * (1 - (j + 1) / 7), rad1 - .32, rad1, rad1 * .55 - .3, rad1 * .55, zc, .26, tone(rng), .03)
        nx, ny = -math.sin(yaw2), math.cos(yaw2)
        # (The outline runs anticlockwise: inward is to the left of the walk.)
        yblock(k, mx + nx * .32, my + ny * .32, span / 2 - .3, .06, MESA['foot'] + .4, zc + rad1 * .55 - .3, yaw2, DARK, .02)
        if rng.random() < .6:
            yblock(k, mx + nx * .25, my + ny * .25, .05, .02, MESA['foot'] + 1.2, zc, yaw2, GLOW, .005)


def front_stairs(k, rng):
    """Stairs down the mesa's cliff into the canyon (the Tripo model's front stairs), between cheek walls, a teal channel
    down each cheek; and the short flight up onto the upper terrace."""
    def flight(x, y0, y1, z0, z1, steps, cheek):
        run, rise = (y1 - y0) / steps, (z1 - z0) / steps
        for i in range(steps):
            top = z0 + rise * (i + 1)
            base = z0 + rise * i - (.45 if i == 0 else .02)
            rblock(k, -x, x, y0 + run * i, y1, base, top, SAND, .035)
            for side in (-1, 1):
                rblock(k, side * x, side * (x + cheek), y0 + run * i, y1, base, top + .22, STONE, .04)
        if z0 < MESA['top'] - 1:
            # The flight's foot on pillars of stacked blocks down to the canyon floor, an arch between them.
            for px in (-x - cheek * .5, -.35, .35, x + cheek * .5):
                z, zt = MESA['foot'], z0 - .45
                while z < zt - .05:
                    z1 = min(zt, z + .55 * rng.uniform(.85, 1.15))
                    rblock(k, px - .24, px + .24, y0 + .05, y0 + .5, z + .005, z1 - .005, tone(rng), .05)
                    z = z1
                B(k, side * (x + cheek * .42), side * (x + cheek * .58), y0 + run * i + .04, y0 + run * (i + 1) - .04, top + .22, top + .232, GLOW)
    flight(1.5, -8.2, -6.3, -2.6, MESA['top'], 9, .42)
    flight(1.15, -5.95, UPPER['cy'] - UPPER['r'] + .45, MESA['top'], UPPER['z1'], 5, .32)


def upper_terrace(k, rng):
    """The curved upper terrace (the Tripo model's rounded inner court): a retaining wall of curved courses round a circle,
    a bronze band, a pale coping; its floor plain."""
    cx, cy, r, z0, z1 = UPPER['cx'], UPPER['cy'], UPPER['r'], UPPER['z0'], UPPER['z1']
    gap = math.asin(1.5 / r)
    a_front = -math.pi / 2
    spans = [(a_front + gap, a_front + 2 * math.pi - gap)]
    for a0, a1 in spans:
        run_arc(k, rng, cx, cy, r, .55, z0, z0 + .45, a0, a1, 1.2, 1.9, mat=BROWN)
        run_arc(k, rng, cx, cy, r - .03, .5, z0 + .45, z1 - .3, a0, a1, 1.4, 2.2, mat=STONE)
        run_arc(k, rng, cx, cy, r + .02, .1, z1 - .3, z1 - .16, a0, a1, 2.0, 2.0, mat=BRONZE, r=.015)
        run_arc(k, rng, cx, cy, r + .08, .62, z1 - .16, z1, a0, a1, 1.3, 2.0, mat=SAND, skip=.3)
        run_arc(k, rng, cx, cy, r - .03, .5, z1 - .3, z1 - .16, a0, a1, .8, 1.4, mat=STONE, skip=.15)
    k.cylinder((cx, cy, 0), 'z', r - .3, z0, z1 - .03, SAND, seg=48)


def drum(k, rng):
    """The rotunda's drum: curved courses in a running bond round a circle, a bronze band under its crown, a stepped dome
    with a lit oculus inside the crown."""
    cx, cy, r, z0, z1 = DRUM['cx'], DRUM['cy'], DRUM['r'], DRUM['z0'], DRUM['z1']
    n = 6
    h = (z1 - z0 - .2) / n
    for c in range(n):
        a = z0 + h * c
        off = (c % 2) * .35
        run_arc(k, rng, cx, cy, r, .6, a, a + h, -math.pi / 2 + off, 3 * math.pi / 2 + off, 1.3, 1.9, mat=STONE if c % 3 else BROWN)
    run_arc(k, rng, cx, cy, r + .05, .7, z1 - .2, z1, 0, 2 * math.pi, 2.2, 2.2, mat=BRONZE, r=.02)
    k.cylinder((cx, cy, 0), 'z', r - .4, z0, z1, BROWN, seg=40)
    # The dome inside the crown: rings stepping in, a lit oculus at the top.
    for rr, a, b, mat in ((r - .3, z1, z1 + .22, SAND), (r - .85, z1 + .22, z1 + .44, STONE), (r - 1.45, z1 + .44, z1 + .62, SAND), (.62, z1 + .62, z1 + .7, BRONZE)):
        k.cylinder((cx, cy, 0), 'z', rr, a, b, mat, seg=40)
    k.cylinder((cx, cy, 0), 'z', .42, z1 + .7, z1 + .72, GLOW, seg=20)
    # Ribs over the dome's steps, from the oculus down to the crown.
    for i in range(10):
        a = (i + .5) * 2 * math.pi / 10
        slab(k, a, cx, cy, [(.66, z1 + .66), (r - .2, z1 + .02), (r - .2, z1 + .2), (.66, z1 + .8)], .18, SAND, .04)
    # The back half's parapet (the crown only rounds the front).
    run_arc(k, rng, cx, cy, r + .05, .4, z1, z1 + .42, math.radians(20), math.radians(160), 1.0, 1.4, mat=SAND, skip=.35)


def crown(heart):
    """The core: a crown of turquoise crystal panels round the drum's front half, between bronze ribs (the Tripo model's
    crown)."""
    cx, cy, r = DRUM['cx'], DRUM['cy'], DRUM['r'] + .12
    a0, a1, n = math.radians(198), math.radians(342), 9
    za, zb = CROWN_Z
    for i in range(n):
        t0, t1 = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
        tm = (t0 + t1) / 2
        half = r * math.sin((t1 - t0) / 2) - .05
        yblock(heart, cx + math.cos(tm) * r, cy + math.sin(tm) * r, .14, half, za + .04, zb - .02 - .1 * abs(i - n // 2) / (n // 2), tm, CRYSTAL, .04)
    for i in range(n + 1):
        t = a0 + (a1 - a0) * i / n
        yblock(heart, cx + math.cos(t) * (r + .02), cy + math.sin(t) * (r + .02), .2, .07, za, zb + .04 - .1 * abs(i - n / 2) / (n / 2), t, BRONZE, .02)
    # Its bronze sill.
    for i in range(n):
        t0, t1 = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
        tm = (t0 + t1) / 2
        yblock(heart, cx + math.cos(tm) * (r + .02), cy + math.sin(tm) * (r + .02), .2, r * math.sin((t1 - t0) / 2) + .01, za - .08, za + .04, tm, BRONZE, .015)


def rings(hull, rng):
    """The rotunda's front: nested rings of wedge stones round the emblem (the Tripo model's concentric arches), each a step
    further out from the drum; their lower ends stand on the upper terrace; a vertical rib through the middle, lit."""
    zc = EMBLEM['z']
    for rad0, rad1, y, d in ((1.42, 1.8, DRUM['cy'] - DRUM['r'] - .05, .3), (.92, 1.18, DRUM['cy'] - DRUM['r'] - .22, .2)):
        floor = UPPER['z1'] + .02
        low = math.asin(max(-1, min(1, (floor - zc) / rad1)))
        n = 13 if rad0 > 1.5 else 10
        a0, a1 = math.pi - low, low
        p = Placed(hull, (0, y, 0))
        for i in range(n):
            t0, t1 = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
            voussoir(p, t0, t1, rad0, rad1, rad0, rad1, zc, d, SAND if i % 2 == 0 else STONE, .04)
        channel(p, rad0, rad1, rad0, rad1, zc, d, a0, a1, n)
    # The dark recess round the emblem, and the rib through it.
    yb = DRUM['cy'] - DRUM['r'] + .05
    hull.cylinder((0, 0, zc), 'y', 1.0, yb - .02, yb + .3, DARK, seg=28)
    hull.cylinder((0, 0, zc), 'y', EMBLEM['r'] * .95, EMBLEM['y'] - .1, yb, STONE, seg=24)
    for z0, z1 in ((UPPER['z1'], zc - EMBLEM['r'] - .05), (zc + EMBLEM['r'] + .05, zc + 1.85)):
        rblock(hull, -.16, .16, EMBLEM['y'] - .12, yb + .1, z0, z1, SAND, .03)
        B(hull, -.03, .03, EMBLEM['y'] - .13, EMBLEM['y'] - .12, z0 + .06, z1 - .06, GLOW)


def slab(k, ang, cx, cy, profile, th, mat, r=.05):
    """A blade: `profile` (radial distance, z) points, extruded `th` thick across the radius at plan angle `ang` about
    (cx, cy), its long edges rounded (an inset loop at each face)."""
    ux, uy = math.cos(ang), math.sin(ang)
    vx, vy = -uy, ux
    mr = sum(p[0] for p in profile) / len(profile); mz = sum(p[1] for p in profile) / len(profile)
    def loop(v, inset):
        pts = []
        for rr, z in profile:
            dr, dz = mr - rr, mz - z
            L = math.hypot(dr, dz) or 1
            rr2, z2 = rr + dr / L * inset, z + dz / L * inset
            pts.append((cx + ux * rr2 + vx * v, cy + uy * rr2 + vy * v, z2))
        return pts
    k.major.loft([loop(-th / 2, r), loop(-th / 2 + r, 0), loop(th / 2 - r, 0), loop(th / 2, r)], mat)


def fins(hull, rng):
    """Tall blade fins round the drum, leaning out (the Tripo model's sunburst of pylons): in two layers, each with a lit
    slot up its face."""
    cx, cy, r = DRUM['cx'], DRUM['cy'], DRUM['r']
    for deg, lean, top, length, broken in ((200, .5, 5.0, 1.5, False), (222, .7, 4.6, 1.6, True), (338, .5, 5.0, 1.5, False), (318, .7, 4.6, 1.6, False),
                                           (165, .4, 4.7, 1.3, True), (15, .4, 4.7, 1.3, False), (120, .3, 4.4, 1.2, False), (60, .3, 4.4, 1.2, True)):
        a = math.radians(deg)
        r0 = r - .25
        if broken:
            # Snapped off: a jagged top a third of the way down, its tip lying on the terrace below.
            zb = UPPER['z1'] + (top - UPPER['z1']) * rng.uniform(.45, .6)
            prof = [(r0, UPPER['z1'] - .1), (r0 + length, UPPER['z1'] - .1), (r0 + length + lean * .4, UPPER['z1'] + 1.1),
                    (r0 + .7 + lean * .6, zb - .15), (r0 + .45 + lean * .5, zb + .12), (r0 + .3, zb - .1), (r0 + .05, zb + .05)]
            fx, fy = cx + math.cos(a) * (r0 + length + .9), cy + math.sin(a) * (r0 + length + .9)
            yblock(hull, fx, fy, .7, .17, MESA['top'] if math.hypot(fx - UPPER['cx'], fy - UPPER['cy']) > UPPER['r'] else UPPER['z1'],
                   (MESA['top'] if math.hypot(fx - UPPER['cx'], fy - UPPER['cy']) > UPPER['r'] else UPPER['z1']) + .34, a + .5, SAND, .06)
        else:
            prof = [(r0, UPPER['z1'] - .1), (r0 + length, UPPER['z1'] - .1), (r0 + length + lean * .4, UPPER['z1'] + 1.1),
                    (r0 + .5 + lean, top - .35), (r0 + .25 + lean * .8, top), (r0 + .05, top - .6)]
        slab(hull, a, cx, cy, prof, .34, SAND if deg % 2 == 0 else STONE, .06)
        # A lit slot up the fin's outer edge.
        ux, uy = math.cos(a), math.sin(a)
        for f in (.25, .55):
            rr = r0 + length * (1 - f) + (r0 + .5 + lean) * f - r0 * f
        rr = r0 + length + .02
        x, y = cx + ux * rr, cy + uy * rr
        yblock(hull, x, y, .03, .06, UPPER['z1'] + .2, UPPER['z1'] + 1.0, a, GLOW, .01)


def buttresses(hull, rng):
    """The long stepped buttresses running from the drum down to the mesa's front corners (the Tripo model's diagonal
    walls): a stair of great rounded blocks, each lower, a teal channel along their tops."""
    for side in (-1, 1):
        x0, y0, z0 = side * 3.1, -1.4, 3.3
        x1, y1, z1 = side * 6.7, -5.4, MESA['top']
        n = 7
        yaw = math.atan2(y1 - y0, x1 - x0)
        gap = 4 if side < 0 else 2
        for i in range(n):
            if i == gap:
                # A block fallen out of the run, lying at its foot.
                f = (i + .5) / n
                rubble(hull, rng, [(x0 + (x1 - x0) * f + side * .6, y0 + (y1 - y0) * f - .4, MESA['top'], 3)])
                continue
            f0, f1 = i / n, (i + 1) / n
            mx, my = x0 + (x1 - x0) * (f0 + f1) / 2, y0 + (y1 - y0) * (f0 + f1) / 2
            top = z0 + (z1 - z0) * f0 + .1
            half = math.hypot(x1 - x0, y1 - y0) / n / 2 + .05
            base = MESA['top'] - .1 if i > 1 else UPPER['z1'] - .1
            yblock(hull, mx, my, half, .38, base, top, yaw, STONE if i % 2 else SAND, .06)
            yblock(hull, mx, my, half * .7, .04, top, top + .015, yaw, GLOW, .005)
        # A plinth block at its foot.
        rblock(hull, x1 - .5, x1 + .5, y1 - .5, y1 + .5, MESA['top'] - .1, MESA['top'] + .5, BROWN, .07)


def emblem(k):
    """The round emblem at the rings' centre (the prow): a bronze toothed ring round a stone disc and a crystal eye."""
    y, z, r = EMBLEM['y'], EMBLEM['z'], EMBLEM['r']
    k.gear((0, 0, z), 'y', r, .05, 18, y - .2, y - .1, BRONZE)
    k.cylinder((0, 0, z), 'y', r * .78, y - .24, y - .12, STONE, seg=20)
    k.cylinder((0, 0, z), 'y', r * .5, y - .27, y - .2, BRONZE, seg=16)
    k.cylinder((0, 0, z), 'y', r * .36, y - .31, y - .24, CRYSTAL, seg=12)
    for a in range(4):
        t = a * math.pi / 2 + math.pi / 4
        cx, cz = math.cos(t) * r * .64, math.sin(t) * r * .64
        k.cylinder((cx, 0, z + cz), 'y', .045, y - .28, y - .2, CRYSTAL, seg=6)


def lantern(k, x):
    """A lantern (a pod): a crystal in a bronze cage on its pedestal."""
    y, z = LANTERN['y'], LANTERN['z'] + .66
    B(k, x - .36, x + .36, y - .36, y + .36, z, z + .08, BRONZE)
    k.cylinder((x, y, 0), 'z', .24, z + .08, z + .62, CRYSTAL, seg=6, r2=.17)
    k.cylinder((x, y, 0), 'z', .15, z + .62, z + .78, CRYSTAL, seg=6, r2=.03)
    for sx in (-1, 1):
        for sy in (-1, 1):
            B(k, x + sx * .33, x + sx * .26, y + sy * .33, y + sy * .26, z + .08, z + .68, BRONZE)
    B(k, x - .35, x + .35, y - .35, y + .35, z + .64, z + .7, BRONZE)
    B(k, x - .2, x + .2, y - .2, y + .2, z + .7, z + .76, BRONZE)


def gate(k, rng, x):
    """A drone gate (bays): a framed portal facing the stairs, its opening dark and lit at the back."""
    y, z = -5.5, MESA['top']
    for side in (-1, 1):
        zz = z
        for hh in (.34, .32, .3):
            rblock(k, x + side * .5, x + side * .8, y - .3, y + .3, zz + .005, zz + hh - .005, tone(rng), .04)
            zz += hh
    rblock(k, x - .92, x + .92, y - .34, y + .34, z + .96, z + 1.14, SAND, .05)
    rblock(k, x - .6, x + .6, y - .22, y + .22, z + 1.14, z + 1.24, STONE, .04)
    B(k, x - .5, x + .5, y + .12, y + .26, z, z + .96, DARK)
    B(k, x - .42, x + .42, y + .11, y + .12, z + .02, z + .84, GLOW)


def rubble(k, rng, spots):
    for (x, y, z, n) in spots:
        for i in range(n):
            r = rng.uniform(.18, .3)
            cx, cy = x + rng.uniform(-.35, .35), y + rng.uniform(-.35, .35)
            yblock(k, cx, cy, r, r * .8, z + (.0 if i < 2 else .2), z + r * rng.uniform(1.1, 1.5) + (.0 if i < 2 else .2),
                   rng.uniform(-.5, .5), tone(rng), .06)


def kit_arch(k, rng, x, y, z, sx, sz, yaw_deg, broken):
    """One of the kit's arches (nahara_kit.arch), placed on the mesa: piers of rounded blocks, a ring of voussoirs with the
    teal channel; broken: its crown fallen."""
    p = Placed(k, (x, y, z), (sx, 1.0, sz))
    d, zc = .2, .4
    for side in (-1, 1):
        zz = 0
        for hh in (.15, .13, .12):
            rblock(p, side * .7, side * 1.0, -d - .01, d + .01, zz + .004, zz + hh - .004, tone(rng), .035)
            zz += hh
    n, skip = 9, ((4, 5) if broken else ())
    for i in range(n):
        if i in skip:
            continue
        voussoir(p, math.pi * (1 - i / n), math.pi * (1 - (i + 1) / n), .7, 1.0, .36, .6, zc, d, tone(rng))
    channel(p, .7, 1.0, .36, .6, zc, d, math.pi, 0, n, skip)


def cave_in(k, rng, x, y, r):
    """A collapse in the plaza (user: "some caving ins"): a dark pit, broken slabs tipped round it, rubble."""
    k.cylinder((x, y, 0), 'z', r, MESA['top'] - .02, MESA['top'] + .012, DARK, seg=9)
    for i in range(7):
        a = i / 7 * 2 * math.pi + rng.uniform(-.2, .2)
        rr = r + rng.uniform(.05, .25)
        bx, by = x + math.cos(a) * rr, y + math.sin(a) * rr
        hh = rng.uniform(.08, .2)
        yblock(k, bx, by, rng.uniform(.2, .34), rng.uniform(.14, .22), MESA['top'] - .05, MESA['top'] + hh, a + rng.uniform(-.4, .4), tone(rng), .04)
    rubble(k, rng, [(x + r * .9, y - r * .3, MESA['top'], 2)])


def plaza_pillars(k, rng):
    """Free-standing columns of drums on the plaza, the ruins' colonnade: some whole with a lintel stone, some broken, two
    fallen and lying in their drums."""
    spots = [(-6.3, -3.2, 'whole'), (-6.0, -.5, 'broken'), (-4.9, 2.4, 'whole'), (-2.6, 4.1, 'fallen'), (2.4, 4.2, 'broken'),
             (4.8, 2.6, 'whole'), (6.1, -.2, 'fallen'), (6.4, -3.0, 'broken')]
    for x, y, state in spots:
        if state == 'fallen':
            a = rng.uniform(0, math.pi)
            for d in range(4):
                cx, cy = x + math.cos(a) * (d - 1.5) * .55, y + math.sin(a) * (d - 1.5) * .55
                yblock(k, cx, cy, .25, .22, MESA['top'] - .02, MESA['top'] + .42, a + rng.uniform(-.15, .15), tone(rng), .07)
            continue
        drums = 7 if state == 'whole' else rng.randint(2, 4)
        z = MESA['top']
        for d in range(drums):
            w = .24 * rng.uniform(.95, 1.04)
            yblock(k, x, y, w, w, z + .004, z + .38 - .004, rng.uniform(0, .3), tone(rng), .06)
            z += .38
        if state == 'whole':
            yblock(k, x, y, .36, .3, z, z + .16, rng.uniform(0, .4), SAND, .04)
        else:
            rubble(k, rng, [(x + .5, y + .2, MESA['top'], 2)])


def pier(k, rng, x, y, z_top, hw=.38, hd=.85):
    z = MESA['foot']
    while z < z_top - .05:
        z1 = min(z_top, z + .55 * rng.uniform(.85, 1.15))
        w = hw * rng.uniform(.95, 1.05)
        rblock(k, x - w, x + w, y - hd, y + hd, z + .005, z1 - .005, tone(rng), .05)
        z = z1


def bridge(k, rng, side, y, broken_up):
    """A bridge out of the rock across the canyon (user, 13 November: "a half broken bridge to the left and right, one
    extending over the canyon one broken up"): a deck of rounded slabs with low parapets on wedge-stone arches and stacked
    piers down to the canyon floor. `broken_up`: piers standing at different heights, one fragment of deck, fallen
    blocks; otherwise it reaches out over the canyon and ends broken off in mid-air."""
    top, d = MESA['top'] + .05, .9
    x0 = side * (MESA['w'] - .3)
    p1, p2 = side * 9.0, side * 10.9
    under = top - .32
    def deck(a, b, ragged=False):
        a, b = sorted((a, b))
        j = cuts(rng, a, b, .5, .8)
        for i, (u, v) in enumerate(zip(j, j[1:])):
            drop = 0.0
            if ragged:
                end = (i + 1) / (len(j) - 1)
                if (side > 0 and end > .75) or (side < 0 and end < .25):
                    drop = rng.uniform(.05, .25)
            rblock(k, u + .01, v - .01, y - d, y + d, under - drop, top - drop, SAND, .03)
            for e in (-1, 1):
                if rng.random() > .3:
                    rblock(k, u + .02, v - .02, y + e * d - .1 * (e + 1) / 2 + .0, y + e * d + .1 * (1 - e) / 2 - .1 * 0, top - drop, top - drop + .2, STONE, .02)
    def arch(a, b, frac=1.0):
        a, b = sorted((a, b))
        rad = (b - a) / 2
        pl = Placed(k, ((a + b) / 2, y, 0))
        n = 7
        zc = under - rad * .85
        for i in range(n):
            t0, t1 = math.pi * (1 - i / n), math.pi * (1 - (i + 1) / n)
            if frac < 1 and ((side > 0 and i / n > frac) or (side < 0 and (n - 1 - i) / n > frac)):
                continue
            voussoir(pl, t0, t1, rad - .3, rad, rad * .85 - .3, rad * .85, zc, d - .05, tone(rng), .03)
    if not broken_up:
        pier(k, rng, p1, y, under)
        arch(x0, p1)
        pier(k, rng, p2, y, under)
        arch(p1, p2)
        deck(x0, p2 + side * 1.0, ragged=True)
        # Past the second pier the next arch broke away: part of its ring still hangs from the pier, the deck's end out
        # over the void.
        arch(p2, p2 + side * 2.2, frac=.4)
        rubble(k, rng, [(p2 + side * .8, y + .3, MESA['foot'] + .2, 3)])
    else:
        pier(k, rng, p1, y, under)
        pier(k, rng, p2, y, rng.uniform(-2.8, -1.8))
        pier(k, rng, side * 12.0, y, rng.uniform(-4.2, -3.2))
        arch(x0, p1)
        deck(x0, p1 + side * .5, ragged=True)
        # A fragment of the next arch on the far pier, and blocks fallen from the deck.
        arch(p1, p2, frac=.3)
        rubble(k, rng, [(p1 + side * .7, y - .2, MESA['foot'] + .3, 3), (p2, y + .4, MESA['foot'] + .2, 2)])


def build():
    rng = random.Random(3901)
    hull, heart, prow = RoundKit(ROLES), RoundKit(ROLES), RoundKit(ROLES)
    pods = {'left': RoundKit(ROLES), 'right': RoundKit(ROLES)}
    mesa(hull)
    cliff_facade(hull, rng)
    front_stairs(hull, rng)
    upper_terrace(hull, rng)
    drum(hull, rng)
    crown(heart)
    rings(hull, rng)
    fins(hull, rng)
    buttresses(hull, rng)
    for side, x in (('left', -LANTERN['x']), ('right', LANTERN['x'])):
        tower_of_blocks(Placed(hull, (x, LANTERN['y'], 0)), random.Random(3950 + (side == 'right')), 3, .44,
                        LANTERN['z'] - .05, LANTERN['z'] + .66)
        lantern(pods[side], x)
    emblem(prow)
    bridge(hull, rng, -1, -1.6, False)
    bridge(hull, rng, 1, -3.0, True)
    plaza_pillars(hull, rng)
    for x, y, r in ((-4.6, -4.4, .55), (5.2, 1.8, .7), (-3.4, 3.4, .45), (3.6, -6.0, .4)):
        cave_in(hull, rng, x, y, r)
    for x in GATES:
        gate(hull, rng, x)
    # The kit's ruins on the mesa: monoliths at its front corners, broken arches on its back, a tower stump, rubble.
    for x, top, broken in ((-6.4, 3.4, 1), (6.4, 2.8, 2)):
        tower_of_blocks(Placed(hull, (x, -5.7, 0)), random.Random(3970 + (x > 0)), 7, .46, MESA['top'], top, taper=.15, broken=broken,
                        openings=[(-.07, .07, 2, 5)])
    kit_arch(hull, rng, -5.6, .9, MESA['top'], 1.3, 2.4, 0, False)
    kit_arch(hull, rng, 5.7, 1.2, MESA['top'], 1.2, 2.2, 0, True)
    rubble(hull, rng, [(-6.3, -4.6, MESA['top'], 3), (6.0, -4.4, MESA['top'], 2), (-4.6, 3.1, MESA['top'], 2), (4.9, 3.4, MESA['top'], 3),
                       (2.6, -6.0, MESA['top'], 1), (-6.6, -1.6, MESA['top'], 2), (0, 4.2, MESA['top'], 2)])
    return hull, heart, pods, prow


def sockets(objs):
    out = {}
    for name in ('heart', 'pod_left', 'pod_right', 'prow'):
        ob = objs[name]
        glow = [i for i, s in enumerate(ob.material_slots) if 'glow' in s.material.name]
        me = ob.data
        pts = np.array([[*(ob.matrix_world @ me.vertices[v].co)] for p in me.polygons if p.material_index in glow for v in p.vertices])
        x, s, z = float(pts[:, 0].mean()), float(pts[:, 1].min()), float(np.percentile(pts[:, 2], 70))
        out[P + name] = dict(x=x, s_face=s, z=z, s_on_plane=s + (z - TARGET_HEIGHT) * COT,
                             half_width=float((np.percentile(pts[:, 0], 95) - np.percentile(pts[:, 0], 5)) / 2))
    return out


def wreck(ob, mat, sag, jitter, seed):
    """A dark, broken copy of a target: one non-emissive material, its stones jittered and sagging toward the middle."""
    w = ob.copy(); w.data = ob.data.copy(); w.name = ob.name + '_wreck'
    bpy.context.scene.collection.objects.link(w)
    me = w.data
    me.materials.clear(); me.materials.append(mat)
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    rng = np.random.default_rng(seed)
    centre = co.mean(0)
    reach = np.linalg.norm(co[:, :2] - centre[:2], axis=1)
    fall = np.clip(1 - reach / max(reach.max(), 1e-6), 0, 1)
    co += rng.normal(0, jitter, co.shape)
    co[:, 2] -= sag * fall
    me.vertices.foreach_set('co', co.ravel()); me.update()
    return w


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    t0 = time.time()
    sc = br.scene('nahara_citadel')
    mats = nk.materials()
    mats[CRYSTAL] = br.material(CRYSTAL, '#1f6f68', .25, .1, emit='#3cc8b8', strength=1.0)
    mats[WALL] = br.material(WALL, '#866447', .9, .0)
    hull, heart, pods, prow = build()
    objs = {'hull': hull.object(P + 'hull', mats, sc), 'heart': heart.object(P + 'heart', mats, sc),
            'pod_left': pods['left'].object(P + 'pod_left', mats, sc), 'pod_right': pods['right'].object(P + 'pod_right', mats, sc),
            'prow': prow.object(P + 'prow', mats, sc)}
    every = list(objs.values())
    br.bake_ao(every, every, strength=.9, reach=1.6, ground=-.6, rays=20)
    for ob in every:
        open_tops(ob)
    report = dict(triangles={k: br.triangles([o]) for k, o in objs.items()})
    pts = np.array([[*(o.matrix_world @ v.co)] for o in every for v in o.data.vertices])
    report['bounds'] = dict(x=[float(pts[:, 0].min()), float(pts[:, 0].max())], s=[float(pts[:, 1].min()), float(pts[:, 1].max())],
                            z=[float(pts[:, 2].min()), float(pts[:, 2].max())])
    report['sockets'] = sockets(objs)
    log(json.dumps(report))
    if '--bake' in args:
        br.texture_bake(every, 'citadel_v2', 'nahara', size=1536, samples=6)
    wmat = ae.wreck_material(mats[DARK]); wmat.name = 'citadel_wreck'
    wrecks = [wreck(objs[k], wmat, sag=.12, jitter=.04, seed=i + 1) for i, k in enumerate(('heart', 'pod_left', 'pod_right', 'prow'))]
    if '--no-export' not in args:
        report['export'] = br.export(OUT, every + wrecks, 'Last Worlds THE CITADEL v2 (tools/blender/nahara_citadel.py, the Nahara ruin kit)')
    if '--no-previews' not in args:
        os.makedirs(PREVIEW, exist_ok=True)
        ground = bpy.data.objects.get('citadel_ground')
        if not ground:
            me = bpy.data.meshes.new('citadel_ground')
            me.from_pydata([(-14, -14, MESA['foot']), (14, -14, MESA['foot']), (14, 14, MESA['foot']), (-14, 14, MESA['foot'])], [], [(0, 1, 2, 3)])
            ground = bpy.data.objects.new('citadel_ground', me)
            sc.collection.objects.link(ground)
            ground.data.materials.append(br.material('citadel_ground', '#b09068', .95, 0))
        shown = every + [ground]
        report['previews'] = [br.render_view(sc, v, (0, -2.0, 1.0), size, os.path.join(PREVIEW, 'v2-%s.png' % v), res=1100, objects=shown)
                              for v, size in (('game', 21), ('top', 18), ('three_quarter', 23))]
    report['seconds'] = round(time.time() - t0, 1)
    with open(os.path.join(PREVIEW, 'citadel-v2-report.json'), 'w') as f:
        json.dump(report, f, indent=1, default=ae.plain)
    log('DONE', report['seconds'])


if __name__ == '__main__':
    main()
