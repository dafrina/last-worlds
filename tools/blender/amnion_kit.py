"""Amnion (Brood Wastes) terrain kit for Last Worlds (docs/27, art/amnion-kit).

After the user's brood-wastes concept (a reference only, never a runtime asset): clutches of amber eggs glowing from
within on sinew mounds; curved bone horns and spires; ribbed bone nests arching over a glowing yolk pool; small bone
shards. Dry, hot and calcified (Nacre is the wet, cool organic world).

Three materials. COLOR_0 carries the linear colour of every face, also for the glowing ones:
    amnion_bone  (roughness 0.85)  bone, horn and crust
    amnion_flesh (roughness 0.5)   sinew and flesh
    amnion_glow  (emissive)        egg cores and yolk: the runtime emits each face's own COLOR_0 (glow weight = its
                                   brightest channel), so colour sets the glow.

Conventions: glTF +Y up, 1 unit = 1 game unit, pivots at the base centre. Pieces marked `top` are scaled so their top
is exactly 1.0 (the runtime scales y by the instance height). Deterministic.

    R=/home/davidfarina/Projects/alien-skies
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/amnion_kit.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/amnion/amnion-kit.glb)" --preview-dir "$(wslpath -w $R/art/amnion-kit)"
"""

import argparse
import math
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import khepri_kit as kit  # noqa: E402
import vesper_common as vc  # noqa: E402
from vesper_common import HS  # noqa: E402
from nacre_kit import hull, centre_xy, fit_top, glow_material  # noqa: E402

SEED = "amnion-kit-v1"
BONE, FLESH, GLOW = 0, 1, 2
MAT_NAMES = ("amnion_bone", "amnion_flesh", "amnion_glow")
TAU = 2.0 * math.pi
SINK = -0.1

C = {k: kit.hex_linear(v) for k, v in dict(
    bone_dark="#b3a58c", bone="#ddd3bf", bone_lit="#f3ece0", stain="#b49a74",
    flesh_dark="#3a0e0d", flesh="#6a2420", sinew="#9c4c40",
    egg_shell="#b07a38", egg_lit="#e8b25a", egg_core="#ffd45a", yolk="#ffbe3a", yolk_hot="#fff0a0",
    shell_shade="#9a8c80", shell="#ddd2c6", shell_lit="#f6f1ea",
).items()}


PEARL = [kit.hex_linear(c) for c in ("#e9b9c9", "#c9b9ea", "#addbd3", "#ecd6a6")]


def mix(a, b, t):
    return kit.mix3(a, b, kit.clamp(t, 0.0, 1.0))


# ----------------------------------------------------------------------------
# Geometry helpers (Blender space: x right, y away from the camera = glTF -Z, z up)
# ----------------------------------------------------------------------------

def egg(hs, rng, x, y, r, tilt=(0.0, 0.0), sides=8, lit=False):
    """A low-poly egg (convex hull of rings on a prolate ellipsoid), its narrow end up and leaning a little. Most are matte
    cream shells; a `lit` one glows gold from within (after the concept: only some eggs glow)."""
    pts = []
    h = r * rng.uniform(1.25, 1.45)
    for k, t in enumerate((-.85, -.4, .15, .6)):
        rr = r * math.sqrt(max(0.0, 1 - t * t)) * (1.0 if t < 0 else 1 - .18 * t)
        z = h * (1 + t)
        for i in range(sides):
            a = (i + .5 * (k % 2)) * TAU / sides
            pts.append((x + rr * math.cos(a) + tilt[0] * z, y + rr * math.sin(a) + tilt[1] * z, z + SINK * .4))
    pts.append((x + tilt[0] * 2 * h, y + tilt[1] * 2 * h, 2 * h * .98 + SINK * .4))
    hull(hs, pts, ("glow", "egg") if lit else ("shell", rng.uniform(0, 1)), GLOW if lit else BONE)


def mound(hs, rng, x, y, rx, ry, h, paint="flesh", mat=FLESH, n=9):
    """A low irregular mound (sinew bed under a clutch, a bone foot under a horn)."""
    pts = []
    for i in range(n):
        a = i * TAU / n + rng.uniform(-.2, .2)
        pts.append((x + rx * math.cos(a) * rng.uniform(.8, 1.1), y + ry * math.sin(a) * rng.uniform(.8, 1.1), SINK))
        pts.append((x + rx * .6 * math.cos(a), y + ry * .6 * math.sin(a), h * rng.uniform(.6, 1.0)))
    hull(hs, pts, paint, mat)


def horn(hs, rng, x, y, h, r, bend, heading, sides=8, rings=10, paint="horn", lean=0.0, flare=.6, flute=.08, z0=SINK):
    """A tusk-like bone horn (after the concept's great tusks): a flared, fluted base tapering along a curve to a sharp
    tip. Its centre line moves `lean` * h * t + `bend` * h * t² toward `heading` (lean out, then curve back in when
    `bend` is negative). Smooth-shaded."""
    ca, sa = math.cos(heading), math.sin(heading)
    loops = []
    for k in range(rings):
        t = k / (rings - 1)
        z = z0 + (h - z0) * t
        off = h * (lean * t + bend * t * t)
        rr = r * (1 - .93 * t ** 1.1) * (1 + flare * (1 - t) ** 4)
        cx, cy = x + ca * off, y + sa * off
        loops.append([hs.v((cx + rr * (1 + flute * (1 - .6 * t) * (1 if i % 2 else -1)) * math.cos(i * TAU / sides),
                            cy + rr * (1 + flute * (1 - .6 * t) * (1 if i % 2 else -1)) * math.sin(i * TAU / sides), z)) for i in range(sides)])
    for lo, hi in zip(loops, loops[1:]):
        for i in range(sides):
            a = (i + .5) * TAU / sides
            hs.face((lo[i], lo[(i + 1) % sides], hi[(i + 1) % sides], hi[i]), paint, "smooth", BONE, outward=(math.cos(a), math.sin(a), 0.0))
    off = h * (lean * 1.03 + bend * 1.06)
    tip = hs.v((x + ca * off, y + sa * off, h + (h - z0) * .035))
    for i in range(sides):
        hs.face((loops[-1][i], loops[-1][(i + 1) % sides], tip), paint, "smooth", BONE, outward=(0.0, 0.0, 1.0))


def ovum(hs, rng, x, y, zc, r, lit=False, sides=8):
    """A nearly round egg centred at height zc (smooth-shaded, a little taller than wide). Most are pale glossy shells;
    a `lit` one glows amber from within."""
    pts = []
    for k, t in enumerate((-.82, -.4, .15, .62)):
        rr = r * math.sqrt(max(0.0, 1 - t * t))
        for i in range(sides):
            a = (i + .5 * (k % 2)) * TAU / sides
            pts.append((x + rr * math.cos(a), y + rr * math.sin(a), zc + r * 1.1 * t))
    pts.append((x, y, zc + r * 1.1))
    pts.append((x, y, zc - r * 1.1))
    hull(hs, pts, ("glow", "egg") if lit else ("shell", rng.uniform(0, 1)), GLOW if lit else BONE, tag="smooth")


def clutch(hs, rng, cx, cy, spread, big, count, z0=0.0, lit_every=6, trail=None, packed=None):
    """A heap of eggs as the concept piles them: two or three big eggs at the core, the rest smaller and smaller,
    each settled where it rests lowest and closest (touching, stacked on the others), tiny ones filling the gaps and,
    with `trail` (a heading), spilling away in a short line. Returns the eggs (x, y, zc, r)."""
    eggs = packed if packed is not None else []
    sizes = sorted([big * rng.uniform(.85, 1.0) for _ in range(min(3, count))] +
                   [big * rng.uniform(.3, .75) for _ in range(max(0, count - 3))], reverse=True)
    for k, r in enumerate(sizes):
        best = None
        for _ in range(64):
            a, d = rng.uniform(0, TAU), spread * 2 * math.sqrt(rng.uniform(0, 1))
            x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
            zc = z0 + r * .8
            for px, py, pz, pr in eggs:
                touch = (r + pr) * .9
                dd = math.hypot(x - px, y - py)
                if dd < touch:
                    zc = max(zc, pz + math.sqrt(touch * touch - dd * dd))
            if zc + r * 1.1 > z0 + big * 2.9:
                continue  # at most about two layers: a heap, never a tower
            score = 1.6 * (zc - z0) + .6 * math.hypot(x - cx, y - cy) + rng.uniform(0, .02)
            if best is None or score < best[0]:
                best = (score, x, y, zc)
        if best is None:
            continue
        _, x, y, zc = best
        eggs.append((x, y, zc, r))
        ovum(hs, rng, x, y, zc, r, lit=(k % lit_every == lit_every - 2), sides=10 if r > big * .6 else (7 if r > big * .35 else 5))
    if trail is not None:
        ca, sa = math.cos(trail), math.sin(trail)
        d = spread + big * .4
        for k in range(4):
            r = big * rng.uniform(.18, .3) * (1 - k * .15)
            d += r * 2.2 + rng.uniform(0, big * .2)
            side = rng.uniform(-1, 1) * big * .5
            ovum(hs, rng, cx + ca * d - sa * side, cy + sa * d + ca * side, z0 + r * .8, r, sides=5)
    return eggs


def ellipse(cx, cy, ra, rb, ang, n=8):
    ca, sa = math.cos(ang), math.sin(ang)
    return [(cx + ca * ra * math.cos(k * TAU / n) - sa * rb * math.sin(k * TAU / n),
             cy + sa * ra * math.cos(k * TAU / n) + ca * rb * math.sin(k * TAU / n)) for k in range(n)]


def inside(px, py, hole, grow):
    cx, cy, ra, rb, ang = hole
    ca, sa = math.cos(ang), math.sin(ang)
    dx, dy = px - cx, py - cy
    return ((dx * ca + dy * sa) / (ra + grow)) ** 2 + ((-dx * sa + dy * ca) / (rb + grow)) ** 2 < 1


def pack_holes(rng, candidate, fits, count, strand, tries=400, holes=None):
    """Holes packed densely without touching (`strand` of membrane kept between them): candidate() proposes
    (cx, cy, ra, rb, angle); fits(points) checks a hole's outline against the sheet's own edges."""
    holes = list(holes or [])
    goal = len(holes) + count
    for _ in range(tries):
        if len(holes) >= goal:
            break
        h = candidate()
        pts = ellipse(*h)
        if not fits(pts):
            continue
        if any(inside(px, py, o, strand) for o in holes for px, py in pts) or \
           any(inside(px, py, h, strand) for o in holes for px, py in ellipse(*o)) or \
           any(inside(o[0], o[1], h, strand) for o in holes):
            continue
        holes.append(h)
    return holes


def perforated(hs, outer, inner, holes, lift, thick, paint="web", mat=BONE, hub=(0.0, 0.0)):
    """A membrane torn with real holes (the concept's spread, torn bone; user, 23 October: "tears ... like tearing apart
    by spreading it like a dough"): the region inside `outer`, outside `inner` and every hole ellipse is filled by
    Blender's triangle fill, lifted by lift(x, y), and every hole gets a rounded rim curling under, the outer edge a
    wall down into the crust. Smooth-shaded; a few hundred triangles even with a dozen holes."""
    import bmesh
    bm = bmesh.new()
    edges, loops = [], []
    for loop in [outer] + ([inner] if inner else []) + [ellipse(*h) for h in holes]:
        vs = [bm.verts.new((x, y, 0.0)) for x, y in loop]
        loops.append(vs)
        edges += [bm.edges.new((vs[i], vs[(i + 1) % len(vs)])) for i in range(len(vs))]
    res = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges, normal=(0, 0, 1))
    bm.verts.index_update()
    base = len(hs.verts)
    for v in bm.verts:
        hs.v((v.co.x, v.co.y, lift(v.co.x, v.co.y)))
    for f in res["geom"]:
        if isinstance(f, bmesh.types.BMFace) and f.calc_area() > 1e-6:  # the fill leaves a few slivers: drop them
            hs.face(tuple(base + v.index for v in f.verts), paint, "smooth", mat, outward=(0.0, 0.0, 1.0))
    # Rims: each hole's edge curls under toward its centre; the outer edge runs down into the crust.
    hole_loops = loops[2 if inner else 1:]
    for vs, h in [(loops[0], None)] + list(zip(hole_loops, holes)):
        low = []
        for v in vs:
            x, y = v.co.x, v.co.y
            if h is None:
                dx, dy = x - hub[0], y - hub[1]
                d = math.hypot(dx, dy) or 1.0
                low.append(hs.v((x + dx / d * thick, y + dy / d * thick, SINK)))
            else:
                dx, dy = h[0] - x, h[1] - y
                d = math.hypot(dx, dy) or 1.0
                low.append(hs.v((x + dx / d * thick * .5, y + dy / d * thick * .5, lift(x, y) - thick * 1.6)))
        n = len(vs)
        for i in range(n):
            j = (i + 1) % n
            mx, my = (vs[i].co.x + vs[j].co.x) / 2, (vs[i].co.y + vs[j].co.y) / 2
            out = (mx - hub[0], my - hub[1], 0.0) if h is None else (h[0] - mx, h[1] - my, 0.0)
            hs.face((base + vs[i].index, base + vs[j].index, low[j], low[i]), paint if h is None else "tear", "smooth", mat, outward=out)
    bm.free()


def skirt(hs, rng, x, y, rin, zt, reach, heading, centre=None, paint="web"):
    """The torn bone webbing round a tusk's foot: a membrane flowing from inside the tusk at height zt down and out over
    the crust, reaching furthest behind the tusk's lean (a buttress) and in ragged lobes, packed with holes stretched
    along the spread."""
    ph, lobes = rng.uniform(0, TAU), rng.choice((4, 5, 6))
    cx, cy = centre or (x, y)

    def R(a):
        return reach * (.75 + .4 * max(0.0, -math.cos(a - heading)) + .09 * math.sin(lobes * a + ph))

    outer = [(x + math.cos(k * TAU / 22) * R(k * TAU / 22) * rng.uniform(.94, 1.06), y + math.sin(k * TAU / 22) * R(k * TAU / 22) * rng.uniform(.94, 1.06)) for k in range(22)]
    inner = [(cx + math.cos(k * TAU / 10) * rin, cy + math.sin(k * TAU / 10) * rin) for k in range(10)]

    def lift(px, py):
        d, a = math.hypot(px - x, py - y), math.atan2(py - y, px - x)
        v = kit.clamp((d - rin) / max(R(a) - rin, 1e-3), 0, 1)
        return SINK * .4 + (zt - SINK * .4) * (1 - v) ** 1.35

    size = [(.2, .3)]

    def candidate():
        a = rng.uniform(0, TAU)
        span = R(a) - rin
        t = rng.uniform(.2, .9)
        ra = span * rng.uniform(*size[0])
        return (x + math.cos(a) * (rin + span * t), y + math.sin(a) * (rin + span * t), ra, ra * rng.uniform(.5, .8), a)

    def fits(pts):
        return all(rin * 1.5 < math.hypot(px - x, py - y) < R(math.atan2(py - y, px - x)) * .94 for px, py in pts)

    # Big tears first, then smaller ones in the bone left between them.
    holes = pack_holes(rng, candidate, fits, 10, reach * .03, tries=600)
    size[0] = (.08, .14)
    holes = pack_holes(rng, candidate, fits, 14, reach * .025, tries=900, holes=holes)
    perforated(hs, outer, inner, holes, lift, reach * .07, paint, hub=(x, y))


def rib(hs, x0, y0, x1, y1, h, r, paint="bone", segs=4):
    """A bone rib arching from the ground at (x0, y0) up and over toward (x1, y1) (square section, tapering)."""
    pts = []
    for k in range(segs + 1):
        t = k / segs
        px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        pz = SINK + r + (h - SINK - r) * math.sin(t * math.pi * .62) / math.sin(math.pi * .62)
        pts.append((px, py, pz, r * (1 - .55 * t)))
    for (ax, ay, az, ar), (bx, by, bz, br) in zip(pts, pts[1:]):
        hull(hs, [(ax + dx * ar, ay + dy * ar, az + dz * ar) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
             + [(bx + dx * br, by + dy * br, bz + dz * br) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)], paint, BONE)


# ----------------------------------------------------------------------------
# Pieces
# ----------------------------------------------------------------------------

def build_eggs(rng, idx):
    """A clutch heaped as in the concept: big eggs at the core, smaller ones pressed in and stacked on them, tiny ones
    in the gaps, on a dark flesh bed; one variant spills a short trail, one is two heaps grown together."""
    hs = HS(rng)
    mound(hs, rng, 0, 0, .46, .4, .025, paint="bed")
    if idx == 0:
        clutch(hs, rng, 0, 0, .14, .21, 8)
    elif idx == 1:
        clutch(hs, rng, -.08, 0, .17, .23, 10, trail=rng.uniform(-.6, .6))
    else:
        heap = clutch(hs, rng, -.17, -.04, .12, .2, 6)
        clutch(hs, rng, .2, .06, .1, .17, 6, packed=heap)
    return hs


def tusk(hs, rng, x, y, h, r, heading, lean, bend, web=True):
    """A great bone tusk growing out of torn webbing over a dark flesh bed (the concept's tusks)."""
    flare = .45
    horn(hs, rng, x, y, h, r, bend=bend, heading=heading, lean=lean, flare=flare, flute=.05, sides=8, rings=8)
    if web:
        # The webbing leaves the tusk a third of the way up, from just inside its surface there.
        t = .4
        rr = r * (1 - .93 * t ** 1.1) * (1 + flare * (1 - t) ** 4)
        off = h * (lean * t + bend * t * t)
        skirt(hs, rng, x, y, rr * .85, SINK + (h - SINK) * t, r * 4.2, heading,
              centre=(x + math.cos(heading) * off, y + math.sin(heading) * off))


def build_spire(rng, idx):
    """Great bone tusks (user, 23 October: "the horns are absolutely underwhelming"; "make them closer to the
    concept"): one huge tusk sweeping out of torn webbing (variant 0), a diverging pair, or a fat low tusk arching
    over a small one. Curved hard so their length reads from the game's steep camera."""
    hs = HS(rng)
    H = rng.uniform(0, TAU)
    if idx == 0:
        tusk(hs, rng, 0, 0, 1.0, .13, H, .16, .68)
    elif idx == 1:
        tusk(hs, rng, 0, 0, 1.0, .12, H, .14, .62)
        tusk(hs, rng, math.cos(H + 2.4) * .22, math.sin(H + 2.4) * .22, .62, .1, H + 1.3, .14, .55)
    else:
        tusk(hs, rng, 0, 0, .75, .16, H, .24, .75)
        tusk(hs, rng, math.cos(H + 2.6) * .26, math.sin(H + 2.6) * .26, .36, .09, H + 2.0, .1, .3)
    return hs


def build_nest(rng, idx):
    """A brood nest: a ring of bone ribs arching inward over a glowing yolk pool, eggs in the pool, a flesh rim."""
    hs = HS(rng)
    ribs = 7 + idx
    # The pool: a shallow glowing disc inside a low flesh rim.
    rim = [hs.v((math.cos(i * TAU / 10) * .78, math.sin(i * TAU / 10) * .78, .06)) for i in range(10)]
    centre = hs.v((0.0, 0.0, .03))
    for i in range(10):
        hs.face((rim[i], rim[(i + 1) % 10], centre), ("glow", "yolk"), "pool", GLOW, outward=(0.0, 0.0, 1.0))
    for i in range(10):
        a0, a1 = i * TAU / 10, (i + 1) * TAU / 10
        pts = [(math.cos(a) * rr, math.sin(a) * rr, z) for a in (a0, a1) for rr, z in ((.76, .02), (.98, .02), (.86, .16))] + \
              [(math.cos(a) * rr, math.sin(a) * rr, SINK) for a in (a0, a1) for rr in (.76, .98)]
        hull(hs, pts, "flesh", FLESH)
    for k in range(ribs):
        a = k * TAU / ribs + rng.uniform(-.12, .12)
        rib(hs, math.cos(a) * .95, math.sin(a) * .95, math.cos(a + .25) * .3, math.sin(a + .25) * .3, rng.uniform(.85, 1.0), rng.uniform(.045, .06))
    for k in range(3):
        a = k * TAU / 3 + rng.uniform(-.3, .3)
        egg(hs, rng, math.cos(a) * .3, math.sin(a) * .3, rng.uniform(.12, .16), lit=True)
    return hs


def build_shards(rng, idx):
    """Two to four small bone shards and knobs, half sunk in the crust."""
    hs = HS(rng)
    for k in range(2 + idx):
        x, y, s = rng.uniform(-.35, .35), rng.uniform(-.3, .3), rng.uniform(.08, .16)
        pts = [(x + rng.uniform(-s, s), y + rng.uniform(-s, s) * .7, SINK + rng.uniform(0, .05)) for _ in range(4)]
        pts += [(x + rng.uniform(-s, s) * .6, y + rng.uniform(-s, s) * .5, s * rng.uniform(.8, 2.0)) for _ in range(3)]
        hull(hs, pts, "bone", BONE)
    return hs


def sac(hs, rng, x, y, z0, r, h, sides=8):
    """A glowing heart sac: a tall ovoid hull, brightest at its crown (the nest's core)."""
    pts = []
    for k, t in enumerate((0.0, .25, .55, .82)):
        rr = r * (.75, 1.0, .92, .55)[k]
        for i in range(sides):
            a = (i + .5 * (k % 2)) * TAU / sides
            pts.append((x + rr * math.cos(a), y + rr * math.sin(a), z0 + h * t))
    pts.append((x, y, z0 + h))
    hull(hs, pts, ("glow", "sac"), GLOW)


def build_broodnest(rng, idx):
    """A landmark brood nest (Amnion's buildings; user, 23 October: "big and high", "high and horn-like", then "closer
    to the concept" and "way too uniform"): after the concept's great nest, a bowl of torn bone round a
    glowing yolk pool (holes packed in its walls), four or five tusks of very different size and lean rising irregularly from its rim (the tallest
    curling over the pool). Its egg heaps are separate pieces (the runtime stretches the nest tall; eggs stay round)."""
    hs = HS(rng)
    ph = rng.uniform(0, TAU)
    prof = [(.24, .06), (.29, .15), (.34, .21), (.4, .17), (.48, .08), (.56, SINK * .5)]

    def wob(a):
        return 1 + .06 * math.sin(2 * a + ph) + .04 * math.sin(5 * a + ph * 2)

    def at(t):
        t = kit.clamp(t, 0, 1) * (len(prof) - 1)
        j0 = min(int(t), len(prof) - 2)
        f = t - j0
        return tuple(prof[j0][k] + (prof[j0 + 1][k] - prof[j0][k]) * f for k in (0, 1))

    def lift(px, py):
        a = math.atan2(py, px)
        return at((math.hypot(px, py) / wob(a) - .24) / .32)[1]

    count = 4 + idx
    heights = [1.0, rng.uniform(.68, .8), rng.uniform(.48, .58), rng.uniform(.34, .42), rng.uniform(.26, .32)][:count]
    gaps = [rng.uniform(.6, 1.6) for _ in range(count)]
    a, bases = rng.uniform(0, TAU), []
    for k, h in enumerate(heights):
        a += gaps[k] / sum(gaps) * TAU
        bases.append((a, h))
    outer = [(math.cos(k * TAU / 40) * .56 * wob(k * TAU / 40), math.sin(k * TAU / 40) * .56 * wob(k * TAU / 40)) for k in range(40)]
    inner = [(math.cos(k * TAU / 20) * .24 * wob(k * TAU / 20), math.sin(k * TAU / 20) * .24 * wob(k * TAU / 20)) for k in range(20)]

    size = [(.055, .08)]

    def candidate():
        a = rng.uniform(0, TAU)
        d = rng.uniform(.29, .51) * wob(a)
        ra = rng.uniform(*size[0])
        return (math.cos(a) * d, math.sin(a) * d, ra, ra * rng.uniform(.55, .85), a + rng.uniform(-.3, .3))

    def fits(pts):
        ok = all(.27 < math.hypot(px, py) / wob(math.atan2(py, px)) < .53 for px, py in pts)
        return ok and all(math.hypot(px - math.cos(b) * .38, py - math.sin(b) * .38) > .05 + .16 * h for px, py in pts for b, h in bases)

    holes = pack_holes(rng, candidate, fits, 14 + idx * 2, .022, tries=900)
    size[0] = (.025, .04)
    perforated(hs, outer, inner, pack_holes(rng, candidate, fits, 18, .018, tries=1200, holes=holes), lift, .05)
    pool = [hs.v((math.cos(i * TAU / 20) * .25 * wob(i * TAU / 20), math.sin(i * TAU / 20) * .25 * wob(i * TAU / 20), .065)) for i in range(20)]
    centre = hs.v((0.0, 0.0, .055))
    for i in range(20):
        hs.face((pool[i], pool[(i + 1) % 20], centre), ("glow", "pool"), "smooth", GLOW, outward=(0.0, 0.0, 1.0))
    # Tusks: very different sizes, irregular gaps round the rim, mixed leans; the tallest curls in over the pool.
    for k, (a, h) in enumerate(bases):
        x, y = math.cos(a) * .38, math.sin(a) * .38
        r = .06 + .09 * h
        if k == 0:
            lean, bend, heading = .14, -.45, a
        else:
            lean = rng.uniform(-.04, .18)
            bend = min(rng.uniform(-.3, .55), .42 - lean)
            heading = a + rng.uniform(-.5, .5)
        tusk(hs, rng, x, y, h, r, heading, lean, bend, web=h > .4)
    return hs


def build_hive(rng, idx):
    """A landmark tusk grove (replaces the ring of spikes round a glowing core, which the user rejected on
    23 October as "way too uniform"): two or three huge tusks fanning out of one mass of torn webbing, egg heaps
    placed against their foot by the scatter (never enclosed)."""
    hs = HS(rng)
    H = rng.uniform(0, TAU)
    tusk(hs, rng, 0, 0, 1.0, .12, H, .15, .62)
    tusk(hs, rng, math.cos(H + 2.2) * .16, math.sin(H + 2.2) * .16, .7, .12, H + 1.2 + rng.uniform(-.2, .2), .15, .6)
    if idx:
        tusk(hs, rng, math.cos(H - 2.2) * .17, math.sin(H - 2.2) * .17, .48, .1, H - 1.3, .14, .55)
    return hs


def goo(hs, rng, yc, za, zb, sag, w0, neck, holes, nx=12, ny=5):
    """A sheet of sticky sinew stretched across x −1 … +1 (after the concept's stretched goo): thick and wide where it
    clings to the walls, necking in and thinning toward the middle, sagging there, torn through with oval holes.
    A closed, smooth-shaded solid. Returns (x, y, z) points under the sheet for drips."""
    ph, wob = rng.uniform(0, TAU), rng.uniform(.02, .05)
    tears = [(rng.uniform(.25, .75), rng.uniform(-.45, .45), rng.uniform(.06, .11), rng.uniform(.3, .55)) for _ in range(holes)]
    T, B = [], []
    for i in range(nx + 1):
        u = i / nx
        x = -1 + 2 * u
        mid = math.sin(math.pi * u)
        half = w0 * (1 - neck * mid) * (1 + .18 * math.sin(u * 9 + ph))
        ymid = yc + wob * math.sin(u * 5 + ph)
        thick = .03 + .1 * (1 - mid) ** 2
        tr, br = [], []
        for j in range(ny + 1):
            v = -1 + 2 * j / ny
            z = za + (zb - za) * u - sag * 4 * u * (1 - u) * (1 + .2 * (1 - v * v))
            th = thick * math.sqrt(max(.2, 1 - v * v))
            tr.append(hs.v((x, ymid + v * half, z)))
            br.append(hs.v((x, ymid + v * half, z - th)))
        T.append(tr)
        B.append(br)

    def open_(i, j):
        if i < 0 or j < 0 or i >= nx or j >= ny:
            return True
        u, v = (i + .5) / nx, -1 + 2 * (j + .5) / ny
        return any(((u - hu) / ru) ** 2 + ((v - hv) / rv) ** 2 < 1 for hu, hv, ru, rv in tears) and .1 < u < .9

    drips = []
    for i in range(nx):
        for j in range(ny):
            if open_(i, j):
                continue
            q = (T[i][j], T[i + 1][j], T[i + 1][j + 1], T[i][j + 1])
            hs.face(q, "goo", "smooth", FLESH, outward=(0.0, 0.0, 1.0))
            hs.face((B[i][j], B[i + 1][j], B[i + 1][j + 1], B[i][j + 1]), "goo", "smooth", FLESH, outward=(0.0, 0.0, -1.0))
            c = [sum(hs.verts[n][a] for n in q + (B[i][j], B[i + 1][j + 1])) / 6 for a in range(3)]
            for (di, dj), (p0, p1) in (((0, -1), ((i, j), (i + 1, j))), ((0, 1), ((i, j + 1), (i + 1, j + 1))),
                                       ((-1, 0), ((i, j), (i, j + 1))), ((1, 0), ((i + 1, j), (i + 1, j + 1)))):
                if open_(i + di, j + dj):
                    hs.face((T[p0[0]][p0[1]], T[p1[0]][p1[1]], B[p1[0]][p1[1]], B[p0[0]][p0[1]]), "goo", "smooth", FLESH, center=c)
            if .2 < (i + .5) / nx < .8:
                drips.append(tuple((hs.verts[B[i][j]][a] + hs.verts[B[i + 1][j + 1]][a]) / 2 for a in range(3)))
    return drips


def drip(hs, rng, x, y, z, length, r):
    """A sticky drip hanging from (x, y, z): a thin tapering thread ending in a glowing yolk droplet."""
    loops = []
    for k in range(4):
        t = k / 3
        rr = r * (1 - .55 * t)
        loops.append([hs.v((x + rr * math.cos(i * TAU / 4), y + rr * math.sin(i * TAU / 4), z + .02 - (length + .02) * t)) for i in range(4)])
    for lo, hi in zip(loops, loops[1:]):
        for i in range(4):
            a = (i + .5) * TAU / 4
            hs.face((lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]), "goo", "smooth", FLESH, outward=(math.cos(a), math.sin(a), 0.0))
    d = r * rng.uniform(1.3, 1.8)
    zb = z - length - d * .7
    hull(hs, [(x + d * math.cos(i * TAU / 6), y + d * math.sin(i * TAU / 6), zb) for i in range(6)] +
         [(x, y, zb + d * 1.3), (x, y, zb - d)], ("glow", "drop"), GLOW, tag="smooth")


def build_web(rng, idx):
    """Sticky goo across a crevasse (user, 23 October: strands "too stringy and uniform ... should read sticky", like
    the concept): stretched sinew sheets, thick at the walls and necking in, sagging, holed, with drips of glowing yolk
    hanging under them. Variant 0 one broad sheet, 1 two narrower sheets at different sags, 2 a sheet anchored lower on
    one side with a torn strand hanging down the far wall. The runtime scales x to the crevasse's width."""
    hs = HS(rng)
    if idx == 0:
        sheets = [(rng.uniform(-.06, .06), -.02, -rng.uniform(.05, .15), rng.uniform(.34, .42), .3, .66, 3)]
    elif idx == 1:
        sheets = [(-.2, -.03, -rng.uniform(.0, .1), rng.uniform(.18, .24), .16, .55, 1),
                  (.22, -.06, -rng.uniform(.1, .2), rng.uniform(.46, .54), .13, .5, 1)]
    else:
        sheets = [(0.0, 0.0, -rng.uniform(.3, .38), rng.uniform(.26, .32), .36, .7, 4)]
    under = []
    for yc, za, zb, sag, w0, neck, holes in sheets:
        under += goo(hs, rng, yc, za, zb, sag, w0, neck, holes)
    rng.shuffle(under)
    for x, y, z in under[:2 + idx]:
        drip(hs, rng, x, y, z, min(rng.uniform(.12, .4), z + .82), rng.uniform(.018, .026))
    if idx == 2:
        drip(hs, rng, .95, rng.uniform(-.15, .15), -.02, .62, .034)
    return hs


def colour_fn_for(hs, name):
    zs = [v[2] for v in hs.verts]
    zhi = max(zs)
    rng = random.Random(f"{SEED}:shade:{name}")
    jit = [rng.uniform(0.0, 1.0) for _ in hs.faces]

    def fn(paint, p, n, ao, fi):
        kind = paint if isinstance(paint, str) else paint[0]
        j = jit[fi]
        if kind == "glow":
            if paint[1] == "egg":
                # Amber shells, brighter toward the crown and where they face up (the core shows through).
                # Deep amber, the core showing only where the shell faces up (it emits its own colour: kept dark).
                return kit.mul3(mix(mix(kit.hex_linear("#4a1e04"), C["egg_shell"], kit.smoothstep(-.4, .6, n.z) * .8), C["egg_core"], kit.smoothstep(.75, 1.0, n.z) * .5), .82)
            if paint[1] == "dimyolk":
                return mix(kit.hex_linear("#7a3c0c"), C["yolk"], (1 - kit.clamp(math.hypot(p.x, p.y) / .38, 0, 1)) * .5)
            if paint[1] == "pool":
                # The nest's yolk: hot at the heart, crackled darker toward the bowl.
                return mix(kit.hex_linear("#8a3a08"), C["yolk_hot"], (1 - kit.clamp(math.hypot(p.x, p.y) / .4, 0, 1)) * .7 + j * .25)
            if paint[1] == "drop":
                return mix(C["yolk"], C["yolk_hot"], kit.clamp(n.z, 0, 1) * .5)
            if paint[1] == "sac":
                return mix(C["egg_lit"], C["yolk_hot"], kit.smoothstep(.2, 1.0, p.z / max(zhi, 1e-3)) * .8 + kit.clamp(n.z, 0, 1) * .2)
            return mix(C["yolk"], C["yolk_hot"], (1 - kit.clamp(math.hypot(p.x, p.y) / .78, 0, 1)) * .6 + j * .15)
        if kind == "shell":
            # Pearl shells (user, 23 October: "this perlescent color with shine"): a pale nacre body turning to pastel
            # pink, lilac, teal and gold toward the rim, each egg its own hue. The game's camera never turns, so the
            # rim is where the view grazes the shell: baking the shift by the normal stands in for iridescence. The
            # shine is real: these faces are marked glossy (vertex alpha, see main) and the runtime gives them a
            # sharp highlight.
            up = kit.clamp(n.z, 0, 1)
            k = (paint[1] + n.z * .9) % 1.0 * len(PEARL)
            pastel = mix(PEARL[int(k)], PEARL[(int(k) + 1) % len(PEARL)], k - int(k))
            col = mix(mix(C["shell_shade"], C["shell"], kit.smoothstep(-.3, .7, n.z)), C["shell_lit"], kit.smoothstep(.75, 1.0, n.z) * .6)
            col = mix(col, pastel, kit.smoothstep(.15, .9, 1 - up) * .6)
            return kit.mul3(col, kit.lerp(.62, 1.0, ao) * kit.lerp(.6, 1.0, kit.smoothstep(-.8, .2, n.z)))
        if kind == "bed":
            return kit.mul3(mix(C["flesh_dark"], C["flesh"], j * .4), kit.lerp(.6, 1.0, ao))
        if kind == "tear":
            # Inside a tear: dark wet flesh showing through the bone.
            return mix(C["flesh_dark"], C["flesh"], kit.clamp(n.z + .3, 0, 1) * .5 + j * .2)
        if kind == "web":
            # Spread bone webbing: pale where it faces up, stained toward the crust, dark flesh-brown underneath.
            if n.z < .1:
                return kit.mul3(mix(kit.hex_linear("#5a2a20"), C["stain"], kit.clamp(n.z + .5, 0, 1) * .6), kit.lerp(.5, 1.0, ao))
            col = mix(C["stain"], C["bone"], kit.smoothstep(.0, .25, p.z) * .7 + kit.clamp(n.z, 0, 1) * .3)
            return kit.mul3(mix(col, C["bone_lit"], kit.smoothstep(.85, 1.0, n.z) * .3), kit.lerp(.45, 1.0, ao) * (.94 + .1 * j))
        if kind == "goo":
            # Wet stretched sinew: glistening pink on top (brightest where it faces straight up), stretched paler and
            # thinner toward the middle, lit warm orange underneath by the yolk below.
            mid = math.sin(math.pi * kit.clamp((p.x + 1) / 2, 0, 1))
            if n.z < 0:
                return mix(C["flesh_dark"], kit.hex_linear("#c4551e"), -n.z * .55 + mid * .2)
            col = mix(mix(C["flesh"], C["sinew"], .55 + mid * .3), kit.hex_linear("#d88a70"), mid * .25)
            return mix(col, kit.hex_linear("#f2c0aa"), kit.smoothstep(.8, 1.0, n.z) * .55 + j * .08)
        if kind == "sinew":
            return mix(mix(C["flesh"], C["sinew"], .6), kit.hex_linear("#c8806c"), kit.clamp(n.z, 0, 1) * .5 + j * .15)
        if kind in ("flesh",):
            return kit.mul3(mix(C["flesh_dark"], C["flesh"], kit.smoothstep(-.1, .2, p.z) * .7 + j * .3), kit.lerp(.5, 1.0, ao))
        # Bone: pale along its length (it is seen from above), a little stained low, palest where it faces up.
        t = kit.clamp(p.z / max(zhi, 1e-3), 0, 1)
        col = mix(C["bone_dark"], C["bone"], .55 + t * .45 + kit.clamp(n.z, 0, 1) * .3)
        col = mix(col, C["bone_lit"], kit.smoothstep(.7, 1.0, t) * .5 * max(0.0, n.z * .5 + .5))
        if kind == "bonefoot":
            col = mix(col, C["stain"], .45)
        return kit.mul3(col, kit.lerp(.5, 1.0, ao) * (.92 + .16 * j))
    return fn


# name prefix -> (builder, variants, footprint half, top (exact 1.0) or None, y_max when not exact, budget)
PIECES = {
    "amn_eggs": (build_eggs, 3, 0.7, False, 0.85, 900),
    "amn_spire": (build_spire, 3, 0.85, True, None, 2200),
    "amn_nest": (build_nest, 2, 1.1, True, None, 1200),
    "amn_shards": (build_shards, 3, 0.55, False, 0.45, 160),
    # Landmarks (Amnion's buildings) and the crevasse webs; the landmarks top out at exactly 1 (scaled in the game).
    "amn_broodnest": (build_broodnest, 2, 1.0, True, None, 4800),
    "amn_hive": (build_hive, 2, 0.95, True, None, 3400),
    "amn_web": (build_web, 3, 1.05, False, 0.1, 1000),
}


def node_list():
    out = []
    for prefix, (fn, variants, half, top, ymax, budget) in PIECES.items():
        for i in range(variants):
            # Webs hang from their anchor (rim height) down into the crevasse; every other piece stands on its base.
            rule = dict(budget=budget, x=(-half, half), z=(-half, half), y_min=-1.0 if prefix == "amn_web" else -0.15, mats=MAT_NAMES)
            if top:
                rule["y_max_exact"] = 1.0
            else:
                rule["y_max"] = ymax
            out.append((f"{prefix}_{i}", prefix, fn, i, rule))
    return out


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="amnion_kit.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--focus", default=None, help="comma-separated name prefixes: a close preview of only those pieces")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = [vc.make_material("amnion_bone", "vc", rough=0.85), vc.make_material("amnion_flesh", "vc", rough=0.5), glow_material("amnion_glow")]
    objs, nodes = {}, {}
    for name, prefix, fn, idx, rule in node_list():
        hs = fn(random.Random(f"{SEED}:{name}"), idx)
        vc.triangulate_nonplanar(hs, tol=1e-7)  # tiny egg facets: near-planar ngons would split with stray normals
        centre_xy(hs)
        cols = vc.bake(hs, name, dict(glow=set(), ao=0.35, ground=0.0, colour_fn=colour_fn_for(hs, name)))
        # Gloss marker: vertex alpha 0 on the pearl shells (the runtime turns it into a smooth, shiny surface).
        corner = 0
        for f, paint in zip(hs.faces, hs.fpaint):
            if isinstance(paint, tuple) and paint[0] == "shell":
                for c in range(corner, corner + len(f)):
                    cols[c] = (cols[c][0], cols[c][1], cols[c][2], 0.0)
            corner += len(f)
        authored = max(v[2] for v in hs.verts)
        if "y_max_exact" in rule:
            fit_top(hs, 1.0)
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        nodes[name] = rule
        x0, x1, y0, y1, _, z1 = hs.bounds()
        print(f"AKIT {name:14s} tris={hs.tris():5d} authored_height={authored:.3f} x={x0:.2f}..{x1:.2f} y={y0:.2f}..{y1:.2f} top={z1:.3f}")
    vc.publish(args.glb, "amnion_kit.py", dict(materials=MAT_NAMES, nodes=nodes, max_bytes=3_200_000), "AKIT")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        pm = glow_material("amnion_glow_preview", preview=True)
        for o in objs.values():
            for k, slot in enumerate(o.data.materials):
                if slot and slot.name == "amnion_glow":
                    o.data.materials[k] = pm
        render_sheet(objs, args)


def render_sheet(objs, args):
    """All pieces (or the --focus ones, closer) in rows from the game's camera under a warm desert light (preview only)."""
    import boss_remodel as br
    scene = bpy.context.scene
    names = list(objs)
    if args.focus:
        keep = [n for n in names if any(n.startswith(f) for f in args.focus.split(","))]
        for n in names:
            if n not in keep:
                objs[n].hide_render = True
        for i, name in enumerate(keep):
            objs[name].location = ((i % 4 - 1.5) * 2.2, (i // 4) * 2.4, 0.0)
        rows = (len(keep) + 3) // 4
        br.game_view(scene, (0.0, (rows - 1) * 1.2, 0.3), 9.5, os.path.join(args.preview_dir, "amnion-focus.png"), res=1400,
                     objects=[objs[n] for n in keep], light="desert")
        return
    for i, name in enumerate(names):
        objs[name].location = ((i % 6 - 2.5) * 2.4, (i // 6) * 2.6, 0.0)
    br.game_view(scene, (0.0, 1.3, 0.4), 15.0, os.path.join(args.preview_dir, "amnion-kit.png"), res=1400,
                 objects=list(objs.values()), light="desert")


if __name__ == "__main__":
    main()
