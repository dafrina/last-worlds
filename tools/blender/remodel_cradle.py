"""THE CRADLE: a clean rebuild traced over the user's Tripo reference (23 October 2026; docs/27 milestone 4).

Superseded on 24 October by tools/blender/approved_cradle.py, which adapts the Tripo GLB itself (user: "keep to the glb
you have which is fully detailed. start fresh"). Only `drone` and `materials` here are still used (the hatchling drone).

The reference (art/source/approved-bosses/cradle-tripo-original.glb, about 1.6 million triangles, placed in game space
by boss_remodel.PLACEMENT) is for dimensions and shapes only (user: "Rebuild it not minimize it"); nothing of it is
exported. Positions below were measured from its height map (tips of every plate, the body, the tracks), then
rounded:
- a crown of curved bone shell plates round the amber egg core, kept where the reference has them, asymmetry and all
  (user: "the thorns and stuff can be asymmetrical"); the ones round the core are its shutters;
- two great outer plates on the arms (the schematic's crescents);
- a mass of glossy red flesh lobes, every gap glowing;
- the lower structure traced from the reference's own geometry and mirrored (user: "im just talking about the lower
  part", "the lower part needs to be addressed according to the tripo glb", "the symmetry by adding a fourth wing is
  fine"): a base of tall rock slabs on its outline, stepped underneath at about -1.1 with a keel under the core (the
  floating stone, at the reference's own depth); chunky segmented bone rails at 0 to 0.65, a great ring round the back
  and at each side a wing loop and a lower loop fused at a clamp, round sunken amber floors with struts; spur bars;
- the brood bays the hatchlings burst from, in the base's front corners, with hinged doors and docked hatchlings.

Combat sockets are THE CRADLE's (src/content/cradle.ts, at SCALE): turret nodes at x +-3.1, s -0.4, the core at s 1.8,
all on the 2.2 target plane here (the core sits on the camera ray through it), exported at 70%. Node names follow THE VEIL's rig contract with the
`cradle_` prefix (src/render/veil-view.ts). The game camera looks from the front at 55 degrees: the back and underside
stay plain. Blender axes: x right, y away from the player (glTF -z), z up. Plateau surface at z = 0.
"""
import math, os, random
from mathutils import Vector, Matrix
import boss_remodel as br
from boss_remodel import join
from remodel_veil import loft, egg, sweep, solid

LABEL = 'v1'
# Exported at 70% of the reference's size (24 October; user: "the model seems pretty big no?"). All positions below are at
# the reference's size; src/content/cradle.ts holds the scaled combat values (sockets, target plane, bays, lanes).
SCALE = .7
TAN = math.tan(math.radians(35))
TARGET_Z = 2.2
NODE_X, NODE_S, CORE_S = 3.1, -0.4, 1.8
TAU = 2 * math.pi
UP = Vector((0, 0, 1))
PALETTE = dict(
    bone=('#bc9a74', .42, .04, None), plate=('#ab926e', .6, .04, None), seam=('#3a160c', .5, .04, None),
    flesh=('#6e140f', .32, .08, None), dark=('#2e0806', .5, .04, None), glow=('#3a1a04', .4, .1, '#ffb32a'),
    crust=('#4a1a12', .85, .02, None), rock=('#5a1812', .75, .03, None), rockdark=('#2c0907', .8, .02, None),
    track=('#9a8a74', .65, .05, None),
    # The base's slabs and the loops' sunken floors (the reference's glossy brown rock and dim amber).
    slab=('#6a3a1c', .42, .05, None), slabdark=('#3a1a0c', .55, .04, None), amber=('#8a4a14', .3, .06, '#4a1e04'),
    # Old weathered bone on the plates, the torn webbing at their feet and its dark tear rims.
    old=('#7e5c3e', .6, .03, None), web=('#9a6a52', .5, .05, None), tear=('#3e0b07', .4, .06, None),
)
# The flesh mass (measured: about 6 across and 10 deep, about 3 high, its centre behind the core).
MOUND = dict(c=(0.0, 3.0), rx=2.6, ry=4.2, top=3.3)
# The core: on the camera ray through its target (0, 1.8, 2.2); at height 3.2 that ray is at y 1.1.
CORE = dict(c=(0.0, 1.1, 3.2), r=.95, h=2.4)
# Plates: measured tips (x, y, z) from the reference, base width, and whether it is a shutter (round the core).
PLATES = [
    ((+1.12, 7.18, 5.13), 1.7, False), ((-1.88, 7.18, 5.07), 1.7, False), ((-0.62, 6.92, 4.87), 1.5, False),
    ((-4.62, 2.92, 5.06), 1.9, False), ((+3.62, 1.42, 4.91), 1.7, False), ((+4.38, 0.42, 4.77), 1.6, False),
    ((-0.12, 4.42, 4.30), 1.2, False),
    ((-0.88, 2.42, 4.81), 1.3, True), ((+0.88, 1.42, 4.70), 1.3, True), ((-1.38, 1.42, 4.62), 1.2, True),
    ((-1.62, -1.08, 4.00), 1.4, True), ((+1.38, -1.32, 3.74), 1.4, True),
]
CLOSED_TILT = math.radians(10)
OPEN_ANGLE = math.radians(42)    # the view's opening (CRADLE_STYLE.shutterOpen, src/render/veil-view.ts)
HOVER = .8                       # how high it hovers over the plateau once risen (the view's `hover`)


def materials():
    return {key: br.material('cradle_' + key, c, r, m, e, 2.4 if e else 0) for key, (c, r, m, e) in PALETTE.items()}


def ray_y(z, target_y):
    return target_y - (z - TARGET_Z) * TAN


def mound_at(z, a):
    """A point on the flesh mass's surface at height z, Blender azimuth a."""
    prof = [(-.6, 1.0), (0.0, 1.0), (1.2, .97), (2.2, .82), (3.0, .5), (3.4, .18), (3.5, 0.0)]
    for (z0, k0), (z1, k1) in zip(prof, prof[1:]):
        if z <= z1:
            k = k0 + (k1 - k0) * (z - z0) / (z1 - z0)
            break
    else:
        k = 0
    cx, cy = MOUND['c']
    return Vector((cx + MOUND['rx'] * k * math.cos(a), cy + MOUND['ry'] * k * math.sin(a), z)), k


# ----------------------------------------------------------------------------- the flesh mass
def mound(mats, sc):
    """An inner body of light under large glossy red lobes packed over it, so every gap glows; the core's bone frame."""
    rng = random.Random('cradle-mound-v2')

    def build(h):
        rings_ = []
        for k in range(10):
            z = -.6 + k * (MOUND['top'] - .1 + .6) / 9
            rings_.append([tuple(mound_at(z, TAU * j / 20)[0] * .985 + Vector((0, MOUND['c'][1] * .015, 0))) for j in range(20)])
        rings_.append([(MOUND['c'][0], MOUND['c'][1], MOUND['top'])])
        loft(h, rings_, 'glow', ('', ''))
        placed = []
        for _ in range(8000):
            if len(placed) >= 240:
                break
            z = rng.uniform(.1, MOUND['top'] - .25)
            a = rng.uniform(0, TAU)
            p, k = mound_at(z, a)
            # Never over the core's face.
            if math.hypot(p.x - CORE['c'][0], (p.z - CORE['c'][2]) * .8) < CORE['r'] * 1.25 and p.y < CORE['c'][1] + .6:
                continue
            r = rng.uniform(.28, .48) * (.65 + .35 * k)
            if any((p - q).length < (r + qr) * .72 for q, qr in placed):
                continue
            placed.append((p, r))
            tall = rng.uniform(1.4, 1.9)
            egg(h, tuple(p), [(-r * tall, 0), (-r * .75 * tall, r * .7), (-r * .2 * tall, r), (r * .45 * tall, r * .9), (r * .85 * tall, r * .45), (r * tall, 0)],
                7, 'flesh' if rng.random() < .8 else 'dark', sx=rng.uniform(.85, 1.05), sy=rng.uniform(.85, 1.05), phase=rng.uniform(0, 1))
        cx, cy, cz = CORE['c']
        A, B, rho = CORE['r'] * 1.12, CORE['h'] * .54, .22
        frame = []
        for k in range(24):
            phi = TAU * k / 24
            c = Vector((cx + A * math.cos(phi), cy + .05, cz + B * math.sin(phi)))
            d = Vector((math.cos(phi), 0, math.sin(phi)))
            frame.append([tuple(c + d * rho * math.cos(TAU * j / 6) + Vector((0, 1, 0)) * rho * 1.3 * math.sin(TAU * j / 6)) for j in range(6)])
        frame.append(frame[0])
        loft(h, frame, 'bone')
    return solid(build, 'cradle_mound', mats, sc, bevel=0)


# ----------------------------------------------------------------------------- plates
def cracks(rng, count):
    """Crack lines over a plate in (t, u): long irregular fissures that mostly run up the blade, wandering sideways, and
    one that branches across (as on the reference)."""
    out = []
    for k in range(count):
        if k == 0:   # across: from one edge part way over
            t, u = rng.uniform(.25, .6), rng.choice((-1.0, 1.0))
            line = [(t, u)]
            for _ in range(5):
                u -= math.copysign(rng.uniform(.15, .3), line[0][1]); t += rng.uniform(-.03, .03)
                line.append((t, max(-.95, min(.95, u))))
        else:        # along: up the blade with a sideways wander
            t, u = rng.uniform(.05, .35), rng.uniform(-.6, .6)
            line = [(t, u)]
            for _ in range(rng.randint(5, 8)):
                t += rng.uniform(.05, .1); u += rng.uniform(-.14, .14)
                if t > .92:
                    break
                line.append((t, max(-.85, min(.85, u))))
        out.append(line)
    return out


def blade(h, base, ctrl, tip, out, side, width, rng, thick, t_end=1.0, broken=False, lines=(), lift=0.0):
    """One bone blade: few, large facets (5 across, every vertex jittered, flat-shaded), its outline chipped on each
    edge, a jagged fracture face if snapped; flesh inside within a bone rim. Crack lines are drawn as dark grooves.
    Returns its rings (outer then inner points per station) for webbing and cracks."""
    chips = [(sg, rng.uniform(.15, .85), rng.uniform(.15, .35), rng.uniform(.06, .14)) for sg in (-1, 1) for _ in range(rng.choice((1, 2, 2, 3)))]
    us = [-1, -.5, 0, .5, 1]
    stations = [0.0] + sorted((k + rng.uniform(-.3, .3)) / 8 * t_end for k in range(1, 8)) + [t_end]

    def half(t, sg):
        w = width * .8 * (1 - t ** 1.3) ** .7 + .04
        for csg, t0, depth, span in chips:
            if csg == sg:
                w *= 1 - depth * max(0.0, 1 - abs(t - t0) / span)
        return w

    def point(t, u, inner=False):
        centre = base * (1 - t) ** 2 + ctrl * 2 * t * (1 - t) + tip * t * t
        w = half(t, -1 if u < 0 else 1)
        cur = width * .2 * (1 - t * .4)
        if inner:
            return centre + side * (u * w * .86) + out * (cur * (1 - u * u) - (thick * (1 - t * .6) + .05))
        return centre + side * (u * w) + out * (cur * (1 - u * u) + lift)

    rings_ = []
    for k, t in enumerate(stations):
        jit = 0.0 if k == 0 else 1.0
        outer = [point(t, u) + (out * rng.uniform(-.06, .09) + side * rng.uniform(-.04, .04) + UP * rng.uniform(-.04, .04)) * jit * width for u in us]
        inner = [point(t, u, True) + out * rng.uniform(-.03, .03) * jit * width for u in reversed(us)]
        rings_.append([tuple(p) for p in outer + inner])
    for i in range(len(rings_) - 1):
        foot = stations[i + 1] < .2
        mats_ = ['old' if foot else 'bone' for j in range(4)] + ['bone', 'bone', 'flesh', 'flesh', 'bone', 'bone']
        loft(h, [rings_[i], rings_[i + 1]], mats_)
    last = rings_[-1]
    if broken:
        c = sum((Vector(p) for p in last), Vector()) / len(last)
        jag = [tuple(Vector(p) + (c - Vector(p)) * rng.uniform(.2, .55) + UP * rng.uniform(-.06, .1)) for p in last]
        loft(h, [last, jag, [tuple(c + UP * .03)]], 'old')
    else:
        end_dir = (tip - ctrl).normalized()
        loft(h, [last, [tuple(tip + end_dir * .14 + side * rng.uniform(-.05, .05))]], 'bone')
    # Cracks: thin dark grooves just proud of the outer face, jagged across the blade.
    for line in lines:
        pts = [point(t * t_end, u) for t, u in line]
        nrm = [(point(t * t_end, u) - point(t * t_end, u, True)).normalized() for t, u in line]
        for (a, na), (b, nb) in zip(zip(pts, nrm), zip(pts[1:], nrm[1:])):
            d = (b - a).normalized()
            wa, wb = na.cross(d).normalized() * .016, nb.cross(d).normalized() * .016
            loft(h, [[tuple(a - wa + na * .004), tuple(a + wa + na * .004), tuple(a + na * .02)],
                     [tuple(b - wb + nb * .004), tuple(b + wb + nb * .004), tuple(b + nb * .02)]], 'seam')
    return rings_


def shell(h, base, tip, width, rng, thick=.3, skirt=True):
    """A plate of old bone, like the reference's and the planet's horns (user, 24 October: "the shields ... should look
    more biological and irregular and antique"): a thick curved blade broken into large chipped facets, cracked across,
    darker old bone at the foot, some tips snapped off; about half carry a second, smaller shard layered over their lower
    part, as the reference's plates do. Fleshy inside. Its foot spreads into torn webbing (`webbing`).
    Returns its outward direction."""
    out = Vector((tip.x - MOUND['c'][0], tip.y - MOUND['c'][1], 0))
    out = out.normalized() if out.length > 1e-3 else Vector((0, -1, 0))
    side = Vector((-out.y, out.x, 0))
    length = (tip - base).length
    ctrl = (base + tip) / 2 + out * length * .3 - UP * length * .08 + side * length * rng.uniform(-.07, .07)
    broken = rng.random() < .3
    lines = cracks(rng, rng.choice((3, 4, 4, 5)))
    blade(h, base, ctrl, tip, out, side, width, rng, thick, rng.uniform(.8, .9) if broken else 1.0, broken, lines)
    if rng.random() < .5:
        # A second shard over the lower part, offset to one side: the plate reads as layered, broken bone.
        sg = rng.choice((-1, 1))
        b2 = base + side * sg * width * .25 + out * .05
        t2 = base * .3 + ctrl * .55 + tip * .15 + side * sg * width * .3 + out * .1
        c2 = (b2 + t2) / 2 + out * (t2 - b2).length * .25
        blade(h, b2, c2, t2, out, side, width * .55, rng, thick * .7, 1.0, rng.random() < .5, cracks(rng, 1), lift=.06)
    loft(h, [[tuple(base + side * u * width * .8 + out * width * .2 * (1 - u * u) - UP * .35) for u in (-1, -.5, 0, .5, 1)],
             [tuple(base + side * u * width * .8 + out * width * .2 * (1 - u * u)) for u in (-1, -.5, 0, .5, 1)]], 'flesh')
    if skirt:
        webbing(h, base, out, side, width, rng)
    return out


def webbing(h, foot, out, side, width, rng):
    """Torn webbing at a plate's foot, spread like dough pulled apart (user, 24 October: "the holes like stretched dough
    would been nice"; the planet's nests have it): a membrane fanning from the foot out and down over the flesh, packed
    with oval holes stretched along the spread, big then small, their rims curling under in dark flesh. Built with
    Blender's triangle fill, so a dozen holes cost a few hundred triangles."""
    import bmesh
    reach = width * rng.uniform(.7, .95)
    lobes, ph = rng.choice((4, 5, 6)), rng.uniform(0, TAU)
    fw = width * .7

    def R(a):   # the membrane's reach at angle a (0 = straight out from the plate)
        return reach * (.72 + .35 * max(0.0, math.cos(a)) + .1 * math.sin(lobes * a + ph))

    n = 26
    outer = [(math.cos(TAU * k / n) * R(TAU * k / n) * rng.uniform(.94, 1.05), math.sin(TAU * k / n) * R(TAU * k / n) * rng.uniform(.94, 1.05)) for k in range(n)]
    footline = [(math.cos(TAU * k / 12) * .22, math.sin(TAU * k / 12) * fw) for k in range(12)]   # (along out, along side)

    def ok(px, py):
        a = math.atan2(py, px)
        r = math.hypot(px, py)
        return r < R(a) * .9 and (px / .34) ** 2 + (py / (fw + .12)) ** 2 > 1

    holes = []
    for size, count, tries in ((.3, 8, 500), (.14, 12, 700)):
        for _ in range(tries):
            if len(holes) >= count + (8 if size < .3 else 0):
                break
            a = rng.uniform(-math.pi, math.pi)
            t = rng.uniform(.3, .85)
            cx, cy = math.cos(a) * R(a) * t, math.sin(a) * R(a) * t
            ra = reach * size * rng.uniform(.6, 1.0) * .5
            hole = (cx, cy, ra, ra * rng.uniform(.4, .7), a)   # stretched along the spread
            pts = [(cx + math.cos(hole[4]) * ra * math.cos(TAU * k / 8) - math.sin(hole[4]) * hole[3] * math.sin(TAU * k / 8),
                    cy + math.sin(hole[4]) * ra * math.cos(TAU * k / 8) + math.cos(hole[4]) * hole[3] * math.sin(TAU * k / 8)) for k in range(8)]
            if not all(ok(px, py) for px, py in pts):
                continue
            strand = reach * .05
            if any(math.hypot(cx - o[0], cy - o[1]) < ra + o[2] + strand for o in holes):
                continue
            holes.append(hole)
    bm = bmesh.new()
    loops, edges = [], []
    hole_pts = []
    for hole in holes:
        cx, cy, ra, rb, ang = hole
        hole_pts.append([(cx + math.cos(ang) * ra * math.cos(TAU * k / 8) - math.sin(ang) * rb * math.sin(TAU * k / 8),
                          cy + math.sin(ang) * ra * math.cos(TAU * k / 8) + math.cos(ang) * rb * math.sin(TAU * k / 8)) for k in range(8)])
    for loop in [outer, footline] + hole_pts:
        vs = [bm.verts.new((x, y, 0.0)) for x, y in loop]
        loops.append(vs)
        edges += [bm.edges.new((vs[i], vs[(i + 1) % len(vs)])) for i in range(len(vs))]
    res = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges, normal=(0, 0, 1))

    def world(px, py, under=0.0):
        r = math.hypot(px, py) / max(R(math.atan2(py, px)), 1e-3)
        z = .25 - .45 * r ** 1.4 - under    # drapes from the foot down over the flesh
        return tuple(foot + out * px + side * py + UP * z)

    web, tear = h._m('web'), h._m('tear')
    vmap = {v: h.bm.verts.new(Vector(world(v.co.x, v.co.y))) for v in bm.verts}
    for f in res['geom']:
        if isinstance(f, bmesh.types.BMFace) and f.calc_area() > 1e-6:
            nf = h.bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = web
    # Rims: each hole's edge curls under toward its centre; the outer edge tucks down into the flesh.
    for vs, hole in [(loops[0], None)] + list(zip(loops[2:], holes)):
        low = []
        for v in vs:
            x, y = v.co.x, v.co.y
            if hole is None:
                d = math.hypot(x, y) or 1.0
                low.append(h.bm.verts.new(Vector(world(x * (1 + .06 / d), y * (1 + .06 / d), .25))))
            else:
                dx, dy = hole[0] - x, hole[1] - y
                d = math.hypot(dx, dy) or 1.0
                low.append(h.bm.verts.new(Vector(world(x + dx / d * .04, y + dy / d * .04, .09))))
        m = len(vs)
        for i in range(m):
            j = (i + 1) % m
            try:
                nf = h.bm.faces.new((vmap[vs[i]], vmap[vs[j]], low[j], low[i]))
                nf.material_index = tear if hole is not None else web
            except ValueError:
                pass
    bm.free()


def plate_base(tip):
    """Where a plate grows from: drawn in toward the mass's axis, low on the mass; the outer arm plates from the arm."""
    if abs(tip.x) > 3.5:
        return Vector((tip.x * 1.02, tip.y - .4, .6))
    c = Vector((MOUND['c'][0], MOUND['c'][1], 0))
    return c + (Vector((tip.x, tip.y, 0)) - c) * 1.16 + UP * .7


def plate(k, n, mats, sc):
    """A shutter plate round the core (shutter n), hinged at its foot: it leans in a little more while the core is shut."""
    tip, width, _ = PLATES[k]
    tip = Vector(tip)
    base = plate_base(tip)
    rng = random.Random('cradle-plate-%d' % k)
    holder = {}

    def build(h):
        holder['out'] = shell(h, base, tip, width, rng, skirt=False)   # its webbing stays on the hull (fixed_plates)

    ob = faceted(solid(build, 'cradle_heart_shutter_%d' % n, mats, sc, pivot=tuple(base), bevel=0))
    out = holder['out']
    tang = Vector((-out.y, out.x, 0))
    ob.data.transform(Matrix.Rotation(-CLOSED_TILT, 4, tang))
    az = math.atan2(out.y, out.x)
    phi = math.atan2(math.cos(az), -math.sin(az))
    ob.data.transform(Matrix.Rotation(-phi, 4, 'Z'))
    ob.rotation_euler = (0, 0, phi)
    return ob


def fixed_plates(mats, sc):
    """The plates that never move (behind and beside the core, and the two great ones on the arms): part of the hull;
    with the torn webbing at the feet of the shutters too, which stays put while they open."""
    def build(h):
        for k, (tip, width, shutter) in enumerate(PLATES):
            tip = Vector(tip)
            if not shutter:
                shell(h, plate_base(tip), tip, width, random.Random('cradle-fixed-%d' % k))
            else:
                out = Vector((tip.x - MOUND['c'][0], tip.y - MOUND['c'][1], 0)).normalized()
                webbing(h, plate_base(tip), out, Vector((-out.y, out.x, 0)), width, random.Random('cradle-web-%d' % k))
    return faceted(solid(build, 'cradle_plates', mats, sc, bevel=0))   # flat facets need no chamfer


def faceted(ob):
    """Flat shading on the plates' bone faces (their chipped facets), smooth on flesh and webbing."""
    names = [m.name for m in ob.data.materials]
    for p in ob.data.polygons:
        if names[p.material_index] in ('cradle_bone', 'cradle_old', 'cradle_seam'):
            p.use_smooth = False
    return ob


# ----------------------------------------------------------------------------- the lower structure (mirrored)
# Traced from the reference's own geometry (z-band outlines and grid sheets, 23 October; user: "the lower part just
# looks shit maybe keep to the model on that", then "the lower part needs to be addressed according to the tripo glb"),
# its left side mirrored (user: "the symmetry by adding a fourth wing is fine"). Measured: the slab base reaches down to
# about -1.1 (a keel to -1.55 under the core, the rear lifting to -0.8), the rails run at 0 to 0.65, the arms reach
# x +-8.5, the ring's crown y 8.95.
BASE_RIGHT = [(0.0, -2.4), (.8, -2.25), (1.15, -1.75), (1.9, -1.4), (2.6, -1.05), (2.95, -.6), (3.35, -.2), (3.9, .2),
              (4.55, .55), (4.65, 1.0), (4.35, 1.6), (4.35, 2.3), (4.55, 2.8), (4.5, 3.4), (4.0, 3.85), (3.2, 4.25),
              (2.7, 4.8), (2.3, 5.4), (1.8, 5.9), (1.3, 6.35), (.8, 6.8), (.45, 7.3), (0.0, 7.5)]
RAIL_Z = .35                     # rail centre height: the blocks' tops at about .65, as measured
FLOOR_Z = .0                     # the sunken floors inside the loops
JUNCTION = (5.35, 4.65)          # where the ring, the wing loop and the lower loop meet (right side)
WING = dict(p0=(5.55, 5.05), p1=(6.55, 7.25), r0=.5, r1=.95)     # the wing loop: narrow end at the junction, round tip
LOWER = dict(c=(6.8, 1.45), hx=1.4, hy=1.75, r=.9, turn=math.radians(-8))
RING = dict(c=(0.0, 3.45), rx=5.4, ry=5.5, p=2.5, a0=math.radians(14), a1=math.radians(166))
BACK_BLOCK = dict(c=(0.0, 7.75), hx=1.1, hy=.75, z=1.0)
# The brood bays: on the camera rays of THE CRADLE's bays (src/content/cradle.ts: x +-2.8, s -2.4 on the target plane
# 2.2), in the base's front corners just inside the brood sacs, facing out along the corner. A ray cast along the game
# camera found the base's front clear only here and under the keel: the front shutter plates' feet cover x 0.9 to 2.6
# and the outer arm plates the corners. Hatchlings burst out of them; hinged flesh doors close them.
BAY = dict(x=2.8, y=-.95, z=.15, rx=.46, rz=.38, turn=math.radians(26))


def outline():
    """The base's outline (counter-clockwise, front first): the right side traced, mirrored."""
    right = BASE_RIGHT
    return right + [(-x, y) for x, y in reversed(right[1:-1])]


def rounded_rect(cx, cy, hx, hy, r, n):
    """Points round a rounded rectangle (x, y, heading), evenly spaced."""
    sx, sy = hx - r, hy - r
    segs = [(2 * sx, 'line', (cx - sx, cy - hy), 0.0), (math.pi / 2 * r, 'arc', (cx + sx, cy - sy), -math.pi / 2),
            (2 * sy, 'line', (cx + hx, cy - sy), math.pi / 2), (math.pi / 2 * r, 'arc', (cx + sx, cy + sy), 0.0),
            (2 * sx, 'line', (cx + sx, cy + hy), math.pi), (math.pi / 2 * r, 'arc', (cx - sx, cy + sy), math.pi / 2),
            (2 * sy, 'line', (cx - hx, cy + sy), -math.pi / 2), (math.pi / 2 * r, 'arc', (cx - sx, cy - sy), math.pi)]
    total = sum(s[0] for s in segs)
    out = []
    for k in range(n):
        d = total * k / n
        for length, kind, p, a in segs:
            if d <= length:
                if kind == 'line':
                    out.append((p[0] + math.cos(a) * d, p[1] + math.sin(a) * d, a))
                else:
                    b = a + d / r
                    out.append((p[0] + r * math.cos(b), p[1] + r * math.sin(b), b + math.pi / 2))
                break
            d -= length
    return out


def turned(points, cx, cy, turn):
    """(x, y, heading) points about the origin, turned by `turn` and moved to (cx, cy)."""
    c, sn = math.cos(turn), math.sin(turn)
    return [(cx + x * c - y * sn, cy + x * sn + y * c, h + turn) for x, y, h in points]


def resample(points, spacing, closed=True):
    """A polyline of (x, y) resampled every `spacing` (about), as (x, y, heading)."""
    pts = list(points) + ([points[0]] if closed else [])
    lengths = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:])]
    total = sum(lengths)
    n = max(2, round(total / spacing))
    out = []
    for k in range(n + (0 if closed else 1)):
        d = total * k / n
        for (a, b), seg in zip(zip(pts, pts[1:]), lengths):
            if d <= seg + 1e-9:
                f = d / seg if seg else 0
                out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, math.atan2(b[1] - a[1], b[0] - a[0])))
                break
            d -= seg
    return out


def teardrop(p0, p1, r0, r1, n=48):
    """The hull of two circles (narrow end r0 at p0, round end r1 at p1), counter-clockwise (x, y)."""
    pts = [(c[0] + r * math.cos(TAU * k / n), c[1] + r * math.sin(TAU * k / n)) for c, r in ((p0, r0), (p1, r1)) for k in range(n)]
    pts = sorted(set((round(x, 5), round(y, 5)) for x, y in pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower_, upper_ = [], []
    for p in pts:
        while len(lower_) >= 2 and cross(lower_[-2], lower_[-1], p) <= 0:
            lower_.pop()
        lower_.append(p)
    for p in reversed(pts):
        while len(upper_) >= 2 and cross(upper_[-2], upper_[-1], p) <= 0:
            upper_.pop()
        upper_.append(p)
    return lower_[:-1] + upper_[:-1]


def ring_arc(n=72):
    """The great ring's centreline: a squarish superellipse arc round the back."""
    cx, cy, rx, ry, pw = RING['c'][0], RING['c'][1], RING['rx'], RING['ry'], 2 / RING['p']
    out = []
    for k in range(n + 1):
        a = RING['a0'] + (RING['a1'] - RING['a0']) * k / n
        c, s = math.cos(a), math.sin(a)
        out.append((cx + rx * math.copysign(abs(c) ** pw, c), cy + ry * math.copysign(abs(s) ** pw, s)))
    return out


def lower_loop(s):
    return [(x, y) for x, y, _ in turned(rounded_rect(0, 0, LOWER['hx'], LOWER['hy'], LOWER['r'], 64), s * LOWER['c'][0], LOWER['c'][1],
                                         s * LOWER['turn'])]


def wing_loop(s):
    p0, p1 = (s * WING['p0'][0], WING['p0'][1]), (s * WING['p1'][0], WING['p1'][1])
    return teardrop(p0, p1, WING['r0'], WING['r1'])


def offset(poly, d):
    """A closed (x, y) polygon moved `d` along each vertex's outward normal (negative: inward). Counter-clockwise."""
    n = len(poly)
    out = []
    for i in range(n):
        a, b, c = poly[i - 1], poly[i], poly[(i + 1) % n]
        t = Vector((c[0] - a[0], c[1] - a[1], 0)).normalized()
        out.append((b[0] + t.y * d, b[1] - t.x * d))
    return out


def ccw(poly):
    area = .5 * sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))
    return poly if area > 0 else poly[::-1]


def rail(h, path, rng, clamps=7, thorns=True, closed=True):
    """The reference's chunky track: tan bone blocks with dark joints and a dark socket on top, every `clamps`th a
    heavier clamp collar with bone thorns."""
    for k, (x, y, heading) in enumerate(path):
        if not closed and k == len(path) - 1:
            break
        t = Vector((math.cos(heading), math.sin(heading), 0))
        n = Vector((-t.y, t.x, 0))
        c = Vector((x, y, 0))
        nxt = path[(k + 1) % len(path)]
        seg = math.hypot(nxt[0] - x, nxt[1] - y)
        half = seg * .5
        c = c + t * seg * .5
        z = RAIL_Z
        lo = [c + t * a * half + n * b * .27 + Vector((0, 0, z - .32)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        mid = [c + t * a * half + n * b * .28 + Vector((0, 0, z + .2)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        hi = [c + t * a * (half - .035) + n * b * .23 + Vector((0, 0, z + .3)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        side = 'plate' if rng.random() < .7 else 'track'
        loft(h, [[tuple(p) for p in lo], [tuple(p) for p in mid], [tuple(p) for p in hi]], side, ('', 'plate' if rng.random() < .6 else 'bone'))
        if rng.random() < .3:  # the dark socket on the block's top
            sq = [c + t * a * .05 + n * b * .05 + Vector((0, 0, z + .305)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            loft(h, [[tuple(p) for p in sq], [tuple(p + Vector((0, 0, .015))) for p in sq]], 'dark', ('', 'dark'))
        if clamps and k % clamps == clamps // 2:
            col_lo = [c + t * a * .17 + n * b * .36 + Vector((0, 0, z - .36)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            col_hi = [c + t * a * .15 + n * b * .33 + Vector((0, 0, z + .4)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            loft(h, [[tuple(p) for p in col_lo], [tuple(p) for p in col_hi]], 'slab', ('', 'plate'))
            if thorns:
                for sgn in (-1, 1):
                    base_ = c + n * sgn * .3 + Vector((0, 0, z + .3))
                    tip = base_ + n * sgn * .18 + Vector((0, 0, .32)) - t * .08
                    curl = base_ + n * sgn * .02 + Vector((0, 0, .2))
                    sweep(h, [tuple(base_), tuple(curl), tuple(tip)], [[(-.06, -.05), (.06, -.05), (.06, .05), (-.06, .05)], [(-.04, -.03), (.04, -.03), (.04, .03), (-.04, .03)], None], 'bone')


def ray2d(origin, direction, poly):
    """Distance along a 2D ray to a closed polygon's edge."""
    best = None
    ox, oy = origin
    dx, dy = direction
    for a, b in zip(poly, poly[1:] + poly[:1]):
        ex, ey = b[0] - a[0], b[1] - a[1]
        den = dx * ey - dy * ex
        if abs(den) < 1e-9:
            continue
        t = ((a[0] - ox) * ey - (a[1] - oy) * ex) / den
        u = ((a[0] - ox) * dy - (a[1] - oy) * dx) / den
        if t > 1e-6 and 0 <= u <= 1 and (best is None or t < best):
            best = t
    return best or 0.0


def bar(h, a, b, z0, z1, w, mat='slabdark', top='slab'):
    """A strut from (x, y) a to b, `w` wide, from z0 to z1."""
    t = Vector((b[0] - a[0], b[1] - a[1], 0))
    if t.length < 1e-6:
        return
    t.normalize()
    n = Vector((-t.y, t.x, 0)) * w / 2
    pa, pb = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    ring_ = lambda z, k: [tuple(p + Vector((0, 0, z))) for p in (pa - n * k, pb - n * k, pb + n * k, pa + n * k)]
    loft(h, [ring_(z0, 1.0), ring_(z1 - .06, 1.0), ring_(z1, .7)], mat, ('', top))


def floor(h, rim, rng, struts='k'):
    """A sunken floor inside a loop: a dark slab, a dimly glowing amber field, struts across it (a K or a Y)."""
    rim = ccw(rim)
    loft(h, [[(x, y, FLOOR_Z - .42) for x, y in rim], [(x, y, FLOOR_Z) for x, y in rim]], 'slabdark', ('slabdark', ''))
    cx, cy = sum(p[0] for p in rim) / len(rim), sum(p[1] for p in rim) / len(rim)
    loft(h, [[(x, y, FLOOR_Z) for x, y in rim], [(cx, cy, FLOOR_Z + .02)]], 'slabdark')
    # The struts: the floor's long axis, and two diagonals from a point on it to the rim.
    far = max(rim, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
    ax = Vector((far[0] - cx, far[1] - cy, 0)).normalized()
    d1, d2 = ray2d((cx, cy), (ax.x, ax.y), rim), ray2d((cx, cy), (-ax.x, -ax.y), rim)
    a, b = (cx + ax.x * d1 * .92, cy + ax.y * d1 * .92), (cx - ax.x * d2 * .92, cy - ax.y * d2 * .92)
    bar(h, a, b, FLOOR_Z - .05, FLOOR_Z + .3, .26)
    hub = (cx + ax.x * d1 * (.15 if struts == 'k' else -.25), cy + ax.y * d1 * (.15 if struts == 'k' else -.25))
    for sgn in (-1, 1):
        ang = math.atan2(ax.y, ax.x) + sgn * math.radians(rng.uniform(48, 62)) + (math.pi if struts == 'y' else 0)
        dirn = (math.cos(ang), math.sin(ang))
        reach = ray2d(hub, dirn, rim) * .92
        bar(h, hub, (hub[0] + dirn[0] * reach, hub[1] + dirn[1] * reach), FLOOR_Z - .05, FLOOR_Z + .26, .22)
    # Amber pools in the hollows between the struts, a bright spot in each (the reference's lit hollows).
    for k in range(3):
        ang = math.atan2(ax.y, ax.x) + (k - 1) * 2.1 + rng.uniform(-.3, .3) + math.pi / 2
        r_ = ray2d((cx, cy), (math.cos(ang), math.sin(ang)), rim) * rng.uniform(.4, .55)
        px, py = cx + math.cos(ang) * r_, cy + math.sin(ang) * r_
        size = min(.5, r_ * .55)
        egg(h, (px, py, FLOOR_Z - .01), [(0, size), (.02, size * .75), (.035, 0)], 10, 'amber', sx=1.0, sy=rng.uniform(.6, .9))
        egg(h, (px, py, FLOOR_Z + .01), [(0, size * .35), (.03, size * .2), (.05, 0)], 8, 'glow')


def tracks(mats, sc):
    """The rails after the reference: the great ring round the back, at each side a wing loop up and out and a lower
    loop fused at a clamp, every loop round a sunken floor; floors bridging to the base; spur bars off the lower loops;
    the platform block at the back of the ring."""
    rng = random.Random('cradle-tracks')

    def build(h):
        arc = ring_arc()
        rail(h, resample(arc, .62, closed=False), rng, clamps=8, closed=False)
        for s in (-1, 1):
            low, wing = ccw(lower_loop(s)), ccw(wing_loop(s))
            for loop, kind in ((low, 'y'), (wing, 'k')):
                rail(h, resample(loop, .6), rng, clamps=6)
                floor(h, offset(loop, -.3), rng, kind)
            jx, jy = s * JUNCTION[0], JUNCTION[1]
            # The clamp where the ring, the wing and the lower loop meet: a heavy knot with thorns.
            sq = lambda r, z: [(jx + r * math.cos(a), jy + r * math.sin(a), z) for a in (TAU * k / 8 + math.pi / 8 for k in range(8))]
            loft(h, [sq(.6, RAIL_Z - .4), sq(.62, RAIL_Z + .3), sq(.5, RAIL_Z + .45)], ['plate', 'slab'] * 4, ('', 'bone'))
            for k in range(3):
                a = TAU * k / 3 + .4
                base_ = Vector((jx + math.cos(a) * .45, jy + math.sin(a) * .45, RAIL_Z + .35))
                sweep(h, [tuple(base_), tuple(base_ + Vector((math.cos(a) * .12, math.sin(a) * .12, .22))), tuple(base_ + Vector((math.cos(a) * .3, math.sin(a) * .3, .36)))],
                      [[(-.07, -.06), (.07, -.06), (.07, .06), (-.07, .06)], [(-.05, -.04), (.05, -.04), (.05, .04), (-.05, .04)], None], 'bone')
            # The lower loop's inner corner up to the clamp.
            corner = max(low, key=lambda p: p[1] - abs(p[0]) * .2) if s > 0 else max(low, key=lambda p: p[1] - abs(p[0]) * .2)
            rail(h, resample([corner, (jx, jy - .35)], .55, closed=False), rng, clamps=0, closed=False)
            # Floors bridging the lower loop and the wing to the base (the reference's arm decks).
            bridge = [(s * 4.2, .55), (s * 5.6, .2), (s * 5.7, 3.3), (s * 5.2, 4.3), (s * 4.3, 3.6)]
            floor(h, bridge if s > 0 else bridge[::-1], rng, 'k')
            arm = [(s * x, y) for x, y in [(3.4, 4.2), (4.9, 4.6), (4.75, 6.0), (3.9, 7.35), (2.6, 8.1), (1.6, 7.0), (2.3, 5.4)]]
            floor(h, arm if s > 0 else arm[::-1], rng, 'k')
            # The spur bar off the lower loop's outer front, angled down at its tip, a hook on its end.
            root = (s * (LOWER['c'][0] + LOWER['hx'] * .7), LOWER['c'][1] - LOWER['hy'] * .9)
            tip = (s * 8.5, -.35)
            mid_ = ((root[0] + tip[0]) / 2, (root[1] + tip[1]) / 2)
            sweep(h, [(root[0], root[1], RAIL_Z + .1), (mid_[0], mid_[1], RAIL_Z), (tip[0], tip[1], RAIL_Z - .55)],
                  [[(-.17, -.14), (.17, -.14), (.17, .14), (-.17, .14)]] * 2 + [[(-.12, -.1), (.12, -.1), (.12, .1), (-.12, .1)]], ['track', 'plate', 'bone', 'plate'], ('track', 'bone'))
            sweep(h, [(tip[0], tip[1], RAIL_Z - .5), (tip[0] + s * .1, tip[1] - .05, RAIL_Z - .2), (tip[0] + s * .02, tip[1] - .1, RAIL_Z + .05)],
                  [[(-.07, -.06), (.07, -.06), (.07, .06), (-.07, .06)], [(-.05, -.04), (.05, -.04), (.05, .04), (-.05, .04)], None], 'bone')
        # The platform block at the back of the ring, with a slot of light.
        bx, by, hx, hy, bz = BACK_BLOCK['c'][0], BACK_BLOCK['c'][1], BACK_BLOCK['hx'], BACK_BLOCK['hy'], BACK_BLOCK['z']
        loft(h, [[(bx - hx, by - hy, FLOOR_Z - .45), (bx + hx, by - hy, FLOOR_Z - .45), (bx + hx, by + hy, FLOOR_Z - .45), (bx - hx, by + hy, FLOOR_Z - .45)],
                 [(bx - hx * .85, by - hy * .8, bz), (bx + hx * .85, by - hy * .8, bz), (bx + hx * .85, by + hy * .8, bz), (bx - hx * .85, by + hy * .8, bz)]], 'plate', ('', 'bone'))
        loft(h, [[(bx - .5, by - .3, bz), (bx + .5, by - .3, bz), (bx + .5, by + .3, bz), (bx - .5, by + .3, bz)],
                 [(bx - .4, by - .22, bz + .5), (bx + .4, by - .22, bz + .5), (bx + .4, by + .22, bz + .5), (bx - .4, by + .22, bz + .5)]], 'bone', ('', 'bone'))
        loft(h, [[(bx - .3, by - hy * .8 - .01, bz - .55), (bx + .3, by - hy * .8 - .01, bz - .55), (bx + .3, by - hy * .8 - .01, bz - .25), (bx - .3, by - hy * .8 - .01, bz - .25)],
                 [(bx - .26, by - hy * .8 - .03, bz - .52), (bx + .26, by - hy * .8 - .03, bz - .52), (bx + .26, by - hy * .8 - .03, bz - .28), (bx - .26, by - hy * .8 - .03, bz - .28)]], 'glow', ('', 'glow'))
    return solid(build, 'cradle_tracks', mats, sc, bevel=.012)


# ----------------------------------------------------------------------------- the base: a mass of rock slabs
def base_top(x, y):
    """The base's top: tallest under the front (up to the front plates), lower at the sides and the back."""
    t = min(1.0, max(0.0, (y + 1.5) / 4.5))
    return 1.0 + (.5 - 1.0) * t * t * (3 - 2 * t)


def base_bottom(x, y):
    """The stepped underside: about -1.1, a keel under the core down to -1.55, the rear lifting to -0.8."""
    keel = .45 * min(1.0, max(0.0, (-1.0 - y) / 1.2)) * (1 - min(1.0, abs(x) / 1.6))
    rear = .3 * min(1.0, max(0.0, (y - 4.5) / 2.5))
    return -1.1 - keel + rear


def near_bay(x, y, pad=.62):
    return math.hypot(abs(x) - BAY['x'], y - BAY['y']) < BAY['rx'] + pad


def base(mats, sc):
    """The base after the reference: tall faceted slabs of rock and bone standing round its outline, layered two deep,
    their feet stepping, amber light in a few of the joints; a keel of slabs under the core; a dark core behind."""
    rng = random.Random('cradle-base-v2')
    rim = ccw(outline())

    def column(h, p, nrm, tan, depth, width, top, bottom, mat):
        jut = rng.uniform(-.06, .14)
        ridge = rng.uniform(.02, .1)
        sec = [p + nrm * jut - tan * width / 2, p + nrm * (jut + ridge) + tan * rng.uniform(-.12, .12) * width, p + nrm * jut + tan * width / 2,
               p - nrm * depth + tan * width * .42, p - nrm * depth - tan * width * .42]
        loft(h, [[(q.x, q.y, bottom) for q in sec], [(q.x, q.y, top) for q in sec]], [mat, mat, 'slabdark', 'slabdark', 'slabdark'], ('rockdark', 'plate' if rng.random() < .5 else mat))

    def stations(poly, spacing):
        path = resample(poly, spacing)
        for x, y, heading in path:
            tan = Vector((math.cos(heading), math.sin(heading), 0))
            yield Vector((x, y, 0)), Vector((tan.y, -tan.x, 0)), tan   # counter-clockwise: outward is to the right

    def build(h):
        # The hidden core, a little inside the slabs.
        core_rim = offset(rim, -.45)
        cx, cy = 0.0, sum(p[1] for p in core_rim) / len(core_rim)
        loft(h, [[(x, y, -.95) for x, y in core_rim], [(x, y, .45) for x, y in core_rim]], 'rockdark', ('rockdark', 'slabdark'))
        # Outer slabs, then a taller inner layer behind them.
        for layer, (inset, spacing, extra) in enumerate(((0.0, .42, 0.0), (-.5, .55, .32))):
            poly = offset(rim, inset) if inset else rim
            for p, nrm, tan in stations(poly, spacing):
                if near_bay(p.x, p.y, .62 if layer == 0 else .3):
                    continue
                width = spacing * rng.uniform(.85, 1.1)
                top = base_top(p.x, p.y) + extra + rng.choice((0, 0, -.12, -.25, .1))
                bottom = base_bottom(p.x, p.y) + (rng.choice((0, 0, .12, .25, .4)) if layer == 0 else .15)
                mat = 'plate' if rng.random() < .22 else ('slab' if rng.random() < .6 else 'slabdark')
                column(h, p, nrm, tan, rng.uniform(.35, .55), width, top, bottom, mat)
                if layer == 0 and rng.random() < .16:   # amber light in the joint
                    q = p + tan * width * .5 - nrm * .1
                    seam = lambda c: [(c.x - tan.x * .04, c.y - tan.y * .04, bottom + .25), (c.x + tan.x * .04, c.y + tan.y * .04, bottom + .25),
                                      (c.x + tan.x * .04, c.y + tan.y * .04, top - .3), (c.x - tan.x * .04, c.y - tan.y * .04, top - .3)]
                    loft(h, [seam(q), seam(q - nrm * .2)], 'glow', ('glow', ''))
        # The keel under the core: slabs packed under the prow, the longest in the middle.
        for k in range(7):
            x = -.95 + k * .32
            y = -2.05 + abs(x) * .55 + rng.uniform(-.05, .05)
            p, nrm, tan = Vector((x, y, 0)), Vector((0, -1, 0)), Vector((1, 0, 0))
            column(h, p, nrm, tan, .6, .3, base_top(x, y) - .2 - rng.uniform(0, .25), base_bottom(x, y) - rng.uniform(0, .12), 'slab' if k % 2 else 'plate')
        # The brood bays' sockets: a sunken oval of flesh with light at its back, flesh lips round its mouth.
        for s in (-1, 1):
            W, rx, rz = bay_frame(s), BAY['rx'], BAY['rz']
            mouth = [W(rx * math.cos(TAU * k / 14), -.02, rz * math.sin(TAU * k / 14)) for k in range(14)]
            back = [W(rx * .7 * math.cos(TAU * k / 14), .7, rz * .7 * math.sin(TAU * k / 14)) for k in range(14)]
            loft(h, [mouth, back, [W(0, .75, 0)]], 'flesh')
            egg(h, W(0, .62, -.08), [(0, .2), (.12, .17), (.2, 0)], 8, 'glow')
            frame = [W((rx + .18) * math.cos(TAU * k / 14), -.04, (rz + .16) * math.sin(TAU * k / 14)) for k in range(14)]
            loft(h, [[W((rx + .18) * math.cos(TAU * k / 14), .5, (rz + .16) * math.sin(TAU * k / 14)) for k in range(14)], frame, mouth],
                 ['dark' if k % 3 else 'flesh' for k in range(14)])
            for k in range(9):   # fleshy lips
                a = TAU * k / 9 + .2
                egg(h, W((rx + .1) * math.cos(a), -.05, (rz + .08) * math.sin(a)), [(-.1, 0), (-.06, .1), (.04, .11), (.1, 0)], 6, 'flesh' if k % 2 else 'dark')
            # Two bone tusks flanking the mouth (nothing over it: the camera looks down into it).
            for side in (-1, 1):
                sweep(h, [W(side * (rx + .22), -.05, -rz - .1), W(side * (rx + .3), -.12, .1), W(side * (rx + .2), -.2, rz + .3)],
                      [[(-.07, -.06), (.07, -.06), (.07, .06), (-.07, .06)], [(-.05, -.04), (.05, -.04), (.05, .04), (-.05, .04)], None], 'bone')
    return solid(build, 'cradle_base', mats, sc, bevel=.012)


def bay_turn(s):
    """The bay's heading: its mouth faces the corner's way, halfway between the base face and the player."""
    return s * BAY['turn']


def bay_frame(s):
    """Map bay-local (a across the mouth, b into the base, c up) to world, for the bay on side s."""
    phi = bay_turn(s)
    across, inward = Vector((math.cos(phi), math.sin(phi), 0)), Vector((-math.sin(phi), math.cos(phi), 0))
    centre = Vector((s * BAY['x'], BAY['y'], BAY['z']))
    return lambda a, b, c: tuple(centre + across * a + inward * b + Vector((0, 0, c)))


def bay_doors(mats, sc):
    """The bays' doors: a curved plate of bone over flesh, hinged on the mouth's outer side like a gate. The view swings
    them -0.9 rad about their local x axis before each launch; that axis is turned upright here, so they swing out
    sideways and never cover the mouth from the camera above (a door hinged at the top would)."""
    out = []
    for s in (-1, 1):
        W, rx, rz = bay_frame(s), BAY['rx'], BAY['rz']
        hinge = W(s * (rx + .12), -.1, 0)

        def build(h, W=W, rx=rx, rz=rz):
            rings_ = []
            for k in range(7):
                v = k / 6
                c = rz + .04 - v * (2 * rz + .12)
                w = (rx + .1) * math.sqrt(max(0.0, 1 - (2 * v - 1) ** 2)) * .95 + .05
                b = -.12 - .1 * math.sin(math.pi * v)
                outer = [W(w * q, b - .04 * (1 - q * q), c) for q in (-1, -.5, 0, .5, 1)]
                inner = [W(w * .9 * q, b + .06, c) for q in (1, 0, -1)]
                rings_.append(outer + inner)
            loft(h, rings_, ['plate', 'bone', 'bone', 'plate', 'flesh', 'flesh', 'flesh', 'flesh'], ('plate', 'plate'))
            sweep(h, [W(-.2, -.17, rz - .14), W(0, -.2, rz - .26), W(.2, -.17, rz - .14)], [[(-.025, 0), (.025, 0), (.025, .03), (-.025, .03)]] * 3, 'seam')
        ob = solid(build, 'cradle_bay_door_' + ('left' if s < 0 else 'right'), mats, sc, pivot=hinge, bevel=.008)
        # Local x upright (down on the right, up on the left), so the view's swing turns each door outward on its hinge.
        ob.data.transform(Matrix.Rotation(-s * math.pi / 2, 4, 'Y'))
        ob.rotation_euler = (0, s * math.pi / 2, 0)
        out.append(ob)
    return out



# ----------------------------------------------------------------------------- weak points
def turret(s, mats, sc, wreck=False):
    """A turret platform on the front rail at its combat socket: a bone drum ringed with fins, a glowing orb, barrels."""
    x, y = s * NODE_X, NODE_S
    z0 = base_top(x, y) - .1   # seated on the base's front corner

    def build(h):
        egg(h, (x, y, z0), [(.0, .62), (.3, .66), (.45, .54), (.52, 0)], 12, 'bone')
        for k in range(6):
            a = k * TAU / 6 + .3
            loft(h, [[(x + math.cos(a) * .5 + dx, y + math.sin(a) * .5 + dy, z0 + .05) for dx, dy in ((-.08, -.08), (.08, -.08), (.08, .08), (-.08, .08))],
                     [(x + math.cos(a) * .78, y + math.sin(a) * .78, z0 + .8)]], 'plate', ('', ''))
        if wreck:
            egg(h, (x, y, z0 + .5), [(0, .4), (.15, .3), (.22, 0)], 8, 'dark')
            return
        egg(h, (x, y, z0 + .5), [(-.05, 0), (0, .36), (.28, .43), (.58, .31), (.75, 0)], 12, 'glow')
        for dx in (-.16, .16):
            sweep(h, [(x + dx, y - .35, z0 + .8), (x + dx, y - 1.0, z0 + .75)], [[(-.07, -.07), (.07, -.07), (.07, .07), (-.07, .07)]] * 2, 'plate', ('plate', 'glow'))
    side = 'left' if s < 0 else 'right'
    return solid(build, 'cradle_pod_%s%s' % (side, '_wreck' if wreck else ''), mats, sc, pivot=(x, y, z0), bevel=.015)


def core(mats, sc, wreck=False):
    """The amber egg, pointed at the top, dark veins over its front."""
    cx, cy, cz = CORE['c']
    r, hgt = CORE['r'], CORE['h']

    def build(h):
        prof = [(-hgt * .45, 0), (-hgt * .4, r * .55), (-hgt * .25, r * .9), (-hgt * .05, r), (hgt * .15, r * .88),
                (hgt * .32, r * .58), (hgt * .45, r * .25), (hgt * .55, 0)]
        if wreck:
            prof = [(dz * .6, rr * .85) for dz, rr in prof]
        egg(h, (cx, cy, cz), prof, 16, 'dark' if wreck else 'glow', sy=.85)
        if wreck:
            return
        for k in range(5):
            a = -math.pi / 2 + (k - 2) * .45
            path = [(cx + math.cos(a) * rr * 1.02, cy + math.sin(a) * rr * .85 * 1.02, cz + dz) for dz, rr in prof[1:-1]]
            sweep(h, path, [[(-.03, 0), (.03, 0), (.03, .04), (-.03, .04)]] * len(path), 'seam')
    return solid(build, 'cradle_heart%s' % ('_wreck' if wreck else ''), mats, sc, pivot=(cx, cy, cz), bevel=.01)


def drone(h, c=(0, 0, 0), k=1.0):
    """A hatchling drone: a wasp-like carapace of bone over a glowing abdomen, two scythe wings."""
    x, y, z = c
    egg(h, (x, y + .15 * k, z), [(-.12 * k, 0), (-.08 * k, .2 * k), (.06 * k, .24 * k), (.14 * k, 0)], 8, 'glow', sy=1.6)
    egg(h, (x, y - .25 * k, z + .04 * k), [(-.1 * k, 0), (-.05 * k, .17 * k), (.08 * k, .19 * k), (.15 * k, 0)], 8, 'plate', sy=1.3)
    for s in (-1, 1):
        loft(h, [[(x + s * .12 * k, y - .2 * k, z + .05 * k), (x + s * .12 * k, y + .1 * k, z + .05 * k), (x + s * .12 * k, y + .1 * k, z + .09 * k), (x + s * .12 * k, y - .2 * k, z + .09 * k)],
                 [(x + s * .62 * k, y + .2 * k, z + .14 * k), (x + s * .62 * k, y + .32 * k, z + .14 * k), (x + s * .62 * k, y + .32 * k, z + .16 * k), (x + s * .62 * k, y + .2 * k, z + .16 * k)]],
             'bone', ('bone', 'bone'))


def flight_pod(mats, sc):
    """The launched drone, on its own origin (instanced by the view at flight height)."""
    return solid(lambda h: drone(h), 'cradle_flight_pod', mats, sc, bevel=0)


def docked_pods(mats, sc):
    """Hatchlings waiting in the brood bays, wings folded in: 0/1 left, 2/3 right (0 and 2 in the mouths, where the
    view's launch flash comes from; 1 and 3 behind them)."""
    out = []
    for i, (s, front) in enumerate([(-1, True), (-1, False), (1, True), (1, False)]):
        c = bay_frame(s)(0, .22 if front else .5, -.04)
        out.append(solid(lambda h, c=c: drone(h, c, .5), 'cradle_drop_pod_%d' % i, mats, sc, pivot=c, bevel=0))
    return out


# ----------------------------------------------------------------------------- assembly
def open_pose(objects, amount=1.0):
    """Shutters and bay doors as the game opens them (previews)."""
    for o in objects:
        if o.name.startswith('cradle_heart_shutter_'):
            o.rotation_euler.x = OPEN_ANGLE * amount
        elif o.name.startswith('cradle_bay_door_'):
            o.rotation_euler.x = -.9 * amount


def compare(objects):
    br.compare('cradle', objects, os.path.join(br.LOOKDEV, 'cradle-compare.png'), (0, 2.6, 2.0), 22,
               views=('game', 'three_quarter', 'top', 'front'))


def build(export=True, preview=True):
    import bpy
    sc = br.scene('Last Worlds — THE CRADLE')
    mats = materials()
    objects = [join([base(mats, sc), mound(mats, sc), fixed_plates(mats, sc), tracks(mats, sc)], 'cradle_hull', (0, 0, 0))]
    for s in (-1, 1):
        objects.append(turret(s, mats, sc))
        objects.append(turret(s, mats, sc, wreck=True))
    objects.append(core(mats, sc))
    objects.append(core(mats, sc, wreck=True))
    shutters = [k for k, (_, _, shutter) in enumerate(PLATES) if shutter]
    objects += [plate(k, n, mats, sc) for n, k in enumerate(shutters)]
    objects += bay_doors(mats, sc)
    objects += docked_pods(mats, sc)
    objects.append(flight_pod(mats, sc))
    bpy.context.view_layer.update()
    print('CRADLE triangles', br.triangles([o for o in objects if not o.name.endswith('_wreck')]))
    if '--bake' in os.environ.get('CRADLE_FLAGS', ''):
        br.texture_bake(objects, 'cradle', 'amnion')
    live = [o for o in objects if not o.name.endswith('_wreck') and o.name != 'cradle_flight_pod']
    br.bake_ao(objects, live, reach=2.2)
    objects.append(br.marker('cradle_bay_left', (-BAY['x'], BAY['y'], BAY['z']), sc))
    objects.append(br.marker('cradle_bay_right', (BAY['x'], BAY['y'], BAY['z']), sc))
    objects.append(br.marker('cradle_remodel_v1', sc=sc, source_file=br.SOURCES['cradle'],
                             note='Clean rebuild traced over the user-supplied Tripo reference; no source geometry exported'))
    result = None
    hidden = [o for o in objects if o.name.endswith('_wreck') or o.name == 'cradle_flight_pod']
    for o in hidden:
        o.hide_render = True
    if preview:   # against the reference, at its size
        os.makedirs(br.LOOKDEV, exist_ok=True)
        open_pose(objects)
        compare(objects)
        open_pose(objects, 0)
    if export:
        shrink(objects)
        for o in hidden:
            o.hide_render = False
        path = os.path.join(br.ROOT, 'public', 'assets', 'amnion', 'the-cradle-%s.glb' % LABEL)
        result = br.export(path, objects, 'Last Worlds — THE CRADLE, rebuilt over the user-supplied Tripo reference')
    return objects, result


def shrink(objects):
    """Everything to SCALE about the pivot, keeping rotations (hinges and shutters swing the same); the launched drone
    keeps its size (it flies as a combatant)."""
    import bpy
    for o in objects:
        if o.name == 'cradle_flight_pod':
            continue
        o.location = o.location * SCALE
        if o.type == 'MESH':
            o.data.transform(Matrix.Scale(SCALE, 4))
    bpy.context.view_layer.update()
