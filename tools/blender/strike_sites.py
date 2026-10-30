"""Strike sites (docs/33 § 3 and § 6): hand-built low-poly site models, one GLB per site with a finish per world.

The user (29 October): "just model them yourself. They dont need to be amazing and the existing infra is good
inspiration". References: art/concepts/strike-sites/00-all-sites.png (one world per site; the other finishes derived).
Built from the boss/facility toolkit's faceted solids (boss_remodel.Solids, remodel_facilities.Kit): flat paints, baked
AO in the vertex colours, glow materials named *glow*. Shape over texture: bold silhouettes for the 55-degree camera.

One GLB per site and finish: public/assets/shared/sites/<site>-<finish>.glb, so a world loads only its own finishes.

Contract: src/render/site-models.ts (SITE_MODELS) is the single source for each site's finishes and bounds; this
builder parses it and asserts every node against it. Frame: the pivot is the core target's ground point; x lateral,
y away from the camera (glTF -z), z up. The core's centre stands CORE (0.85, the ground targets' core height) above
the pivot. Nodes per finish: site_<id>_<finish>_body, _core (the target), _ruin (the broken core). Rules (docs/25):
top <= 3.25; nothing of the body in front of the core (|x| < 0.9, y < 0) above 0.75 + 1.43 * -y (line of sight);
foundations reach below the pivot so a site sits on uneven ground.

Headless (every path Blender sees is a Windows path):
  cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
    --python "$(wslpath -w /abs/path/tools/blender/strike_sites.py)" -- [--site=crash-site] [--no-export] [--preview]
--preview renders every finish of each built site from the game camera into lookdev/strike-sites/<site>.png.
"""
import bpy, math, os, re, sys, random, time
from mathutils import Vector, Matrix

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boss_remodel as br
import remodel_facilities as rf
from remodel_facilities import B, cyl, dome

REGISTRY = os.path.join(br.ROOT, 'src', 'render', 'site-models.ts')
OUT = os.path.join(br.ROOT, 'public', 'assets', 'shared', 'sites')
PREVIEW = os.path.join(br.ROOT, 'lookdev', 'strike-sites')
CORE = .85
TOP_MAX = 3.25
TAU = 2 * math.pi


def registry():
    """{site: dict(finishes, x, s, top, below)} parsed from site-models.ts."""
    out = {}
    pattern = (r"'([a-z-]+)': \{ finishes: \[([^\]]*)\], x: \[([-\d.]+), ([-\d.]+)\], "
               r"s: \[([-\d.]+), ([-\d.]+)\], top: ([\d.]+), below: ([\d.]+)")
    for m in re.finditer(pattern, open(REGISTRY).read()):
        out[m.group(1)] = dict(finishes=re.findall(r"'(\w+)'", m.group(2)),
                               x=(float(m.group(3)), float(m.group(4))), s=(float(m.group(5)), float(m.group(6))),
                               top=float(m.group(7)), below=float(m.group(8)))
    return out


# ----------------------------------------------------------------------------- finishes
# One palette per world (key: colour, roughness, metallic[, emission]); a site uses the slots it needs. Glow slots end
# in 'glow': the game reads them as lamps and turns them off when the site is destroyed.
GLOW = 2.2
PALETTE = {
    'luna': dict(paint=('#e6e5e0', .56, .03), accent=('#b9bab8', .55, .05), metal=('#2c2e33', .45, .55), steel=('#80858c', .4, .6),
                 stripe=('#dca12e', .5, .08), deck=('#8e8d89', .88, .02), asphalt=('#2f3134', .9, .02), ground=('#5f5d5a', .95, .0),
                 glass=('#18202a', .18, .3), canvas=('#cfc9bc', .8, .0), snow=('#eef3f7', .7, .0),
                 glow=('#2a1606', .5, .2, '#ffa83a'), core_glow=('#2a1606', .4, .1, '#ff8a3a')),
    'khepri': dict(paint=('#d9cbb4', .62, .04), accent=('#b8582a', .55, .1), metal=('#2b2724', .45, .6), steel=('#6e675f', .42, .55),
                   stripe=('#dd9a30', .55, .08), deck=('#8a705c', .9, .02), asphalt=('#3b2e27', .9, .02), ground=('#5a301c', .95, .0),
                   glass=('#1b1a1c', .18, .3), canvas=('#bfa47a', .85, .0), snow=('#eef3f7', .7, .0),
                   glow=('#2a1006', .5, .2, '#ff8a2a'), core_glow=('#04201f', .35, .1, '#4ff2df')),
    'vesper': dict(paint=('#dfe4ea', .5, .12), accent=('#5c6876', .5, .25), metal=('#1d2127', .45, .55), steel=('#8d949e', .4, .55),
                   stripe=('#d27a2e', .55, .1), deck=('#4b525c', .8, .1), asphalt=('#24282e', .85, .05), ground=('#e4ebf2', .75, .0),
                   glass=('#141b24', .15, .3), canvas=('#8a9cb0', .8, .0), snow=('#f0f5fa', .7, .0),
                   glow=('#06121e', .5, .2, '#52c2ff'), core_glow=('#06121e', .35, .1, '#7fd8ff')),
    'nacre': dict(paint=('#b4aec0', .6, .05), accent=('#554a86', .55, .1), metal=('#251f3b', .45, .45), steel=('#7c76a8', .45, .4),
                  stripe=('#3fb6b0', .5, .1), ground=('#2a2238', .95, .0), glass=('#141022', .18, .3),
                  stone=('#c7c0b0', .82, .02), stone_dark=('#8e8778', .85, .02), moss=('#3c5e4c', .9, .0), frond=('#6a3fb0', .7, .0),
                  water=('#122028', .12, .1), bone=('#bdb3cf', .6, .0), chitin=('#2c2244', .35, .1), resin=('#3a2a5e', .25, .05),
                  flesh=('#1e1830', .6, .0), egg=('#8d6cc0', .22, .05),
                  glow=('#1a0a2a', .5, .2, '#b46cff'), core_glow=('#04201f', .35, .1, '#5ff0e4'), alt_glow=('#04201f', .4, .1, '#5ff0e4'),
                  sac_glow=('#1a0a2a', .35, .1, '#c86cff'), dim_glow=('#04201f', .5, .1, '#2fb8b0')),
    'amnion': dict(paint=('#cfc6b6', .62, .04), accent=('#8a3a2a', .55, .1), metal=('#2a1a16', .45, .5), steel=('#6a5a50', .42, .5),
                   stripe=('#c9862e', .55, .08), ground=('#4a2a22', .95, .0), glass=('#1a1210', .18, .3),
                   bone=('#d8c8a8', .62, .0), chitin=('#4a2c1e', .35, .1), resin=('#a8541a', .22, .05), flesh=('#44120f', .6, .0),
                   egg=('#e0b878', .4, .0),
                   glow=('#2a1606', .5, .1, '#ffc23a'), core_glow=('#2a1606', .35, .1, '#ffc23a'), alt_glow=('#2a1606', .4, .1, '#ffb02a'),
                   sac_glow=('#2a1004', .35, .1, '#ffa82a')),
    'umbra': dict(paint=('#8f8c98', .6, .1), accent=('#4a3a9a', .5, .2), metal=('#121018', .4, .5), steel=('#4a4658', .4, .5),
                  stripe=('#6a58c8', .5, .1), ground=('#1c1a26', .9, .0), glass=('#0c0a12', .15, .3),
                  obsidian=('#16141f', .12, .0), stone=('#24212e', .45, .05), stone_dark=('#191722', .5, .05),
                  glow=('#140a2a', .5, .2, '#8a6cff'), core_glow=('#140a2a', .35, .1, '#b48cff'), alt_glow=('#140a2a', .4, .1, '#9a6cff'),
                  dim_glow=('#140a2a', .5, .1, '#6a4cd0')),
}
STRENGTH = {'core_glow': 3.0, 'sac_glow': 3.0, 'dim_glow': 1.4}


def materials(world):
    out = {}
    for slot, spec in PALETTE[world].items():
        colour, rough, metal = spec[:3]
        emit = spec[3] if len(spec) > 3 else None
        out[slot] = br.material('site_%s_%s' % (world, slot), colour, rough, metal, emit, STRENGTH.get(slot, GLOW) if emit else 0)
    return out


# ----------------------------------------------------------------------------- geometry helpers
class Kit(rf.Kit):
    """remodel_facilities.Kit (major masses chamfered, small trim plain) plus `soft`: unbevelled organic lofts."""

    def __init__(self):
        super().__init__([])

    def soft(self, loops, mat, caps=True):
        self.minor.loft(loops, mat, caps)


def frames(points):
    """Parallel-transported frames (point, tangent, normal, binormal) along a polyline."""
    path = [Vector(p) for p in points]
    n = len(path)
    tangents = [(path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < .9 else Vector((1, 0, 0))
    normal = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
    out = []
    for p, t in zip(path, tangents):
        normal = (normal - t * normal.dot(t)).normalized()
        out.append((p, t, normal, t.cross(normal)))
    return out


def tube(h, points, radii, mat, seg=8, soft=True, phase=0.0, squash=1.0):
    """A tube through the points, radius per point (tapers and tips); `squash` flattens it along its normal."""
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(points)
    loops = []
    for (p, t, n, b), r in zip(frames(points), radii):
        r = max(r, .004)
        loops.append([tuple(p + (n * math.cos(phase + TAU * k / seg) * squash + b * math.sin(phase + TAU * k / seg)) * r) for k in range(seg)])
    (h.soft if soft else h.loft)(loops, mat)


def curve(p0, p1, p2, n=6):
    """Quadratic Bezier points from p0 through control p1 to p2."""
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
    return [p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t for t in (i / n for i in range(n + 1))]


def blob(h, c, rx, ry, rz, mat, seg=10, rings=6, rng=None, wobble=0.0, floor=None, soft=True):
    """An ellipsoid (optionally lumpy); `floor` sinks its lower half to that height (a mound with a skirt)."""
    c = Vector(c)
    jitter = [1 + (rng.uniform(-wobble, wobble) if rng else 0) for _ in range(seg)]
    loops = []
    for i in range(1, rings):
        a = -math.pi / 2 + math.pi * i / rings
        rr, z = math.cos(a), math.sin(a)
        zz = c.z + rz * z
        if floor is not None and z < 0:
            zz, rr = c.z + (floor - c.z) * (-z), 1 + .12 * -z
        loops.append([(c.x + rx * rr * jitter[k] * math.cos(TAU * k / seg), c.y + ry * rr * jitter[k] * math.sin(TAU * k / seg), zz) for k in range(seg)])
    (h.soft if soft else h.loft)(loops, mat)


def crystal(h, base, height, r, mat, seg=6, lean=(0, 0), waist=.35, phase=0.0, tip=.02, bottom=None):
    """A faceted crystal from `base` up `height`, leaning by `lean` per unit height; widest at `waist` of its height.
    With `bottom`, a bipyramid whose lower point reaches down by that much."""
    bx, by, bz = base
    lx, ly = lean
    ring = lambda rr, k: [(bx + lx * k + rr * math.cos(phase + TAU * i / seg), by + ly * k + rr * math.sin(phase + TAU * i / seg), bz + k) for i in range(seg)]
    loops = [ring(r * tip, -bottom)] if bottom else [ring(r * .7, 0)]
    loops += [ring(r, height * waist), ring(r * tip, height)]
    h.minor.loft(loops, mat)


def shard(h, base, height, r, mat, rng, lean=.25):
    """A leaning crystal shard in a random direction."""
    a = rng.uniform(0, TAU)
    crystal(h, base, height, r, mat, seg=rng.choice((4, 5, 6)), lean=(math.cos(a) * lean, math.sin(a) * lean), waist=rng.uniform(.25, .5), phase=rng.uniform(0, 1))


def rock(h, rng, x, y, r, height, mat, floor=-.35, seg=6):
    """An irregular faceted boulder, sunk into the ground."""
    a0 = rng.uniform(0, TAU)
    radii = [r * rng.uniform(.75, 1.15) for _ in range(seg)]
    ox, oy = rng.uniform(-.2, .2) * r, rng.uniform(-.2, .2) * r
    ring = lambda s, z, dx=0, dy=0: [(x + dx + radii[i] * s * math.cos(a0 + TAU * i / seg), y + dy + radii[i] * s * math.sin(a0 + TAU * i / seg), z) for i in range(seg)]
    h.loft([ring(1.05, floor), ring(1, height * .45), ring(.55, height, ox, oy)], mat)


def mound(h, rng, x, y, rx, ry, height, mat, floor=-.8, seg=9):
    """A low irregular earth mound whose skirt reaches below uneven ground."""
    blob(h, (x, y, 0), rx, ry, height, mat, seg=seg, rings=6, rng=rng, wobble=.18, floor=floor)


def ridge(h, p0, p1, w, height, mat, z0=0.0):
    """A lens-section ridge (a snow cap, a dirt berm) along p0 -> p1."""
    a, b = Vector(p0), Vector(p1)
    t = (b - a).normalized()
    side = Vector((-t.y, t.x, 0)).normalized()
    up = Vector((0, 0, 1))
    prof = [(-w, z0), (-w * .6, height * .8), (0, height), (w * .6, height * .8), (w, z0), (0, z0 - height * .3)]
    h.soft([[tuple(p + side * u + up * v) for u, v in prof] for p in (a, b)], mat)


def beam(h, p0, p1, w, d, mat, minor=True):
    """A rectangular bar between two points."""
    a, b = Vector(p0), Vector(p1)
    t = (b - a).normalized()
    side = t.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
    up = side.cross(t).normalized()
    rect = lambda c: [tuple(c + side * sx * w / 2 + up * sz * d / 2) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    (h.minor if minor else h.major).loft([rect(a), rect(b)], mat)


def obox(h, cx, cy, hx, hy, z0, z1, yaw, mat, tilt=0.0, minor=False):
    """A box turned by `yaw` about z (and optionally tipped by `tilt` about its own x axis)."""
    c, s = math.cos(yaw), math.sin(yaw)
    ct, st = math.cos(tilt), math.sin(tilt)
    def corner(u, v, z):
        v2, z2 = v * ct - (z - z0) * st, v * st + (z - z0) * ct + z0
        return (cx + u * c - v2 * s, cy + u * s + v2 * c, z2)
    loops = [[corner(u, v, z) for u, v in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))] for z in (z0, z1)]
    (h.minor if minor else h.major).loft(loops, mat)


def ring_tube(h, centre, axis, r, thickness, mat, seg=14, side=5, arc=(0.0, TAU)):
    """A torus segment (a frame ring, a gimbal) about `axis` through `centre`."""
    c, ax = Vector(centre), Vector(axis).normalized()
    u = ax.cross(Vector((0, 0, 1)) if abs(ax.z) < .9 else Vector((1, 0, 0))).normalized()
    v = ax.cross(u)
    a0, a1 = arc
    pts = [c + (u * math.cos(a) + v * math.sin(a)) * r for a in (a0 + (a1 - a0) * i / seg for i in range(seg + 1))]
    tube(h, pts, thickness, mat, seg=side, soft=True)


def disc(h, x, y, r, z0, z1, mat, seg=16):
    h.minor.cylinder((x, y, 0), 'z', r, z0, z1, mat, seg=seg)


# ----------------------------------------------------------------------------- world dressings
def snow_drifts(h, rng, spots):
    for x, y, rx, ry, hgt in spots:
        mound(h, rng, x, y, rx, ry, hgt, 'snow', floor=-.3, seg=8)


def overgrowth(h, rng, pads, puddles=()):
    """Nacre: moss pads with violet fronds and teal glow bulbs; dark mire puddles."""
    for x, y, z, r in pads:
        blob(h, (x, y, z), r, r * rng.uniform(.7, 1), .07, 'moss', seg=8, rings=4, rng=rng, wobble=.2)
        for _ in range(3):
            a, d = rng.uniform(0, TAU), rng.uniform(0, r * .7)
            px, py = x + math.cos(a) * d, y + math.sin(a) * d
            lean = rng.uniform(0, TAU)
            hgt = rng.uniform(.22, .42)
            tube(h, curve((px, py, z), (px + math.cos(lean) * .05, py + math.sin(lean) * .05, z + hgt * .6),
                          (px + math.cos(lean) * .16, py + math.sin(lean) * .16, z + hgt), 3), [.035, .03, .02, .004], 'frond', seg=3)
        a = rng.uniform(0, TAU)
        bx, by = x + math.cos(a) * r * .4, y + math.sin(a) * r * .4
        blob(h, (bx, by, z + .07), .055, .055, .06, 'alt_glow', seg=6, rings=4)
    for x, y, r in puddles:
        disc(h, x, y, r, -.2, .025, 'water', seg=12)


def brood_growths(h, rng, arches=(), plates=(), resin=(), eggs=(), spikes=()):
    """Amnion's overrun set (docs/33: the brood has overrun frontier sites): bone arches, chitin plates, resin blobs,
    egg clusters and bone spikes, shared by every overrun site."""
    for p0, p1, height in arches:
        a, b = Vector(p0), Vector(p1)
        mid = (a + b) / 2 + Vector((0, 0, height))
        pts = curve(a + Vector((0, 0, -.3)), mid + Vector((0, 0, height * .25)), b + Vector((0, 0, -.3)), 8)
        tube(h, pts, [.1, .095, .085, .075, .07, .075, .085, .095, .1], 'bone', seg=6)
        for k in (2, 4, 6):  # thorns along the arch
            p = pts[k]
            tube(h, [p, p + Vector((0, 0, .18)) + (p - (a + b) / 2).normalized() * .05], [.035, .004], 'bone', seg=4)
    for x, y, z, r in plates:
        blob(h, (x, y, z), r, r * .8, r * .35, 'chitin', seg=7, rings=4, rng=rng, wobble=.15)
    for x, y, z, r in resin:
        blob(h, (x, y, z), r, r * rng.uniform(.8, 1.1), r * .7, 'resin', seg=8, rings=5, rng=rng, wobble=.15)
    for x, y, n in eggs:
        for i in range(n):
            a, d = TAU * i / n + rng.uniform(-.3, .3), (.16 if n > 1 else 0) + rng.uniform(0, .06)
            ex, ey = x + math.cos(a) * d, y + math.sin(a) * d
            r = rng.uniform(.13, .18)
            blob(h, (ex, ey, r * 1.1), r, r, r * 1.45, 'egg', seg=8, rings=5)
    for x, y, height, lean in spikes:
        tube(h, curve((x, y, -.2), (x + lean[0] * .3, y + lean[1] * .3, height * .55), (x + lean[0], y + lean[1], height), 3),
             [.12, .09, .05, .004], 'bone', seg=5)


def obsidian_shards(h, rng, clusters):
    """Umbra: glossy black shards breaking through the ground, a violet one among them."""
    for x, y, scale in clusters:
        for i in range(3):
            a = rng.uniform(0, TAU)
            shard(h, (x + math.cos(a) * .18 * scale, y + math.sin(a) * .18 * scale, -.2), rng.uniform(.6, 1.1) * scale,
                  rng.uniform(.12, .18) * scale, 'obsidian' if i else 'alt_glow', rng, lean=.3)


# ----------------------------------------------------------------------------- crash site
def crash_site(world):
    """A freighter broken in two, its reactor exposed in the break (the target), plowed ground and spilled cargo.
    Frontier worlds get a survivors' camp; Vesper snow, Nacre moss and mire, Amnion brood growths, Umbra obsidian."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(11)
    th = math.radians(17)
    d, n = Vector((math.cos(th), math.sin(th), 0)), Vector((-math.sin(th), math.cos(th), 0))
    R, AZ = .5, .3
    P = lambda t, off=0.0, z=AZ: Vector((0, 0, z)) + d * t + n * off

    def hull(t0, t1, jag_at, taper=None):
        """A hull half from t0 to t1 (decagon, flat-sided); the end at `jag_at` is torn open into a dark cavity."""
        seg = 10
        def ring_at(t, r, jag=False):
            out = []
            for k in range(seg):
                a = TAU * k / seg + math.pi / seg
                dt = rng.uniform(-.16, .12) if jag else 0
                rr = r * (rng.uniform(.88, 1.05) if jag else 1)
                out.append(tuple(P(t + dt) + n * math.cos(a) * rr + Vector((0, 0, math.sin(a) * rr))))
            return out
        ts = [t0, t1] if taper is None else [t0, taper[0], t1]
        rs = [R, R] if taper is None else [R, R, taper[1]]
        loops = [ring_at(t, r, jag=(t == jag_at)) for t, r in zip(ts, rs)]
        if jag_at == t0:
            loops = loops[::-1]
        inward = -.42 if jag_at == t1 else .42
        jag = loops[-1]
        cavity = [tuple(Vector(p).lerp(P(jag_at + inward), .9)) for p in jag]
        body.major.loft(loops, 'paint', caps=False)
        body.major.loft([loops[0], [tuple(Vector(p).lerp(P(ts[0] if jag_at != t0 else t1), .999)) for p in loops[0]]], 'metal', caps=False)
        body.minor.loft([jag, cavity], 'metal', caps=False)

    # Rear (engine) half, front-left: torn at -0.78; exposed frame rings in the gap toward the reactor.
    hull(-2.55, -.78, -.78)
    for t in (-.66, -.5):
        ring_tube(body, P(t), d, R * .98, .035, 'steel', seg=12, side=4, arc=(-.35, math.pi + .35))
    for off in (-.32, .32):
        beam(body, P(-.82, off, AZ + .36), P(-.42, off, AZ + .3), .05, .05, 'steel')
    for t in (-1.25, -2.05):  # hull bands
        tube(body, [P(t - .06), P(t + .06)], R + .03, 'accent', seg=10, soft=False, phase=math.pi / 10)
    for k in range(5):  # a row of dark ports along the camera side
        t = -2.25 + k * .3
        p = P(t, -R * .72, AZ + R * .62)
        obox(body, p.x, p.y, .08, .04, p.z - .06, p.z + .06, th, 'glass', minor=True)
    for off in (-.24, 0, .24):  # three dead engine nozzles at the stern
        p = P(-2.55, off * 1.1, AZ + .05 + abs(off) * -.3)
        tube(body, [p, p - d * .22], [.17, .2], 'metal', seg=8, soft=False)
        tube(body, [p - d * .05, p - d * .23], [.13, .15], 'steel', seg=8, soft=False)
    # Bow half, back-right: torn at 0.62, tapering into the cockpit, plowed into a dirt mound.
    hull(.62, 2.55, .62, taper=(1.95, .26))
    tube(body, [P(.95), P(1.07)], R + .03, 'accent', seg=10, soft=False, phase=math.pi / 10)
    tube(body, [P(1.55), P(1.67)], R + .03, 'stripe', seg=10, soft=False, phase=math.pi / 10)
    for k in range(3):  # cockpit glazing on the bow's camera side
        t = 2.0 + k * .16
        p = P(t, -R * .45 * (1 - k * .18), AZ + R * .7 * (1 - k * .2))
        obox(body, p.x, p.y, .07, .05, p.z - .05, p.z + .07, th, 'glass', minor=True)
    beam(body, P(1.35, 0, AZ + R), P(1.35, 0, AZ + R + .45), .04, .04, 'steel')  # antenna
    # Cargo modules still clamped to the spine: what makes it a freighter from above.
    for t, half, mat in ((-2.0, .26, 'stripe'), (-1.48, .22, 'accent')):
        p = P(t, 0, AZ + R - .08)
        obox(body, p.x, p.y, half, .3, p.z, p.z + .26, th, mat)
        obox(body, p.x, p.y, half + .015, .315, p.z + .26, p.z + .29, th, 'steel', minor=True)
    for t in (-2.25, -1.74, -1.22):  # clamps over the modules
        beam(body, P(t, -.42, AZ + .25), P(t, 0, AZ + R + .3), .05, .04, 'steel')
        beam(body, P(t, 0, AZ + R + .3), P(t, .42, AZ + .25), .05, .04, 'steel')
    beam(body, P(1.3, 0, AZ + R + .3), P(1.42, 0, AZ + R + .3), .1, .02, 'steel')
    # The reactor cradle in the break, conduits to both halves (body); the reactor itself is the core.
    body.major.box((-.34, -.3, -.4), (.34, .3, .5), 'metal', chamfer=.08)
    B(body, -.36, .36, -.32, .32, .42, .5, 'steel')
    for sgn, t in ((-1, -.78), (1, .62)):
        pipe = [Vector((sgn * .3, 0, .4)), P(t + sgn * -.05, 0, AZ + .1)]
        tube(body, pipe, .07, 'steel', seg=6)
        tube(body, [Vector((sgn * .3, .14, .3)), P(t, .2, AZ - .05)], .045, 'stripe', seg=5)
    blob(core, (0, 0, CORE), .3, .3, .3, 'core_glow', seg=12, rings=8)
    ring_tube(core, (0, 0, CORE), (1, 0, 0), .38, .035, 'steel', seg=14, side=5)
    ring_tube(core, (0, 0, CORE), (math.cos(.9), math.sin(.9), 0), .38, .03, 'steel', seg=14, side=5)
    cyl(core, 0, 0, .12, .48, .58, 'steel', seg=8)
    # Destroyed: a split, burnt reactor slumped in its cradle.
    blob(ruin, (0, 0, .58), .27, .25, .14, 'metal', seg=10, rings=5, rng=rng, wobble=.2)
    ring_tube(ruin, (0, .05, .62), (math.cos(.4), math.sin(.4), .3), .36, .033, 'steel', seg=8, side=4, arc=(.2, 2.6))
    for a in (.4, 2.3, 4.1):
        shard(ruin, (math.cos(a) * .2, math.sin(a) * .2, .5), .3, .07, 'steel', rng, lean=.6)
    # Plowed ground: the bow's mound and a crater rim around the break.
    mound(body, rng, *tuple(P(2.6, 0, 0))[:2], .45, .7, .4, 'ground')
    for a, dist, size in ((.4, 1.15, .32), (1.4, 1.05, .28), (2.6, 1.15, .3), (3.5, 1.2, .26), (5.2, 1.05, .24), (4.4, .95, .2)):
        x, y = math.cos(a) * dist, math.sin(a) * dist
        mound(body, rng, x, y, size * 1.6, size * 1.2, size * .55, 'ground', seg=7)
    # Torn hull plates and spilled cargo.
    for x, y, yaw, tilt, mat in ((-1.25, .95, .5, .45, 'paint'), (1.05, -1.1, 2.2, .3, 'paint'), (-.6, 1.35, 1.2, .5, 'accent'),
                                 (2.2, -.55, .9, .55, 'paint'), (.55, 1.25, 2.9, .35, 'steel')):
        obox(body, x, y, .26, .17, .02, .05, yaw, mat, tilt=tilt)
    for x, y, yaw, mat, hx in ((-1.65, .45, .3, 'stripe', .24), (-1.3, 1.55, 1.1, 'accent', .22), (.25, 1.6, .2, 'steel', .26),
                               (1.7, -1.25, .7, 'stripe', .2)):
        obox(body, x, y, hx, .15, -.1, .3, yaw, mat)
        obox(body, x, y, hx + .015, .155, .3, .33, yaw, 'metal', minor=True)
    if world in ('luna', 'khepri', 'vesper'):
        # Survivors' camp at the front-left: two tents, a crate stack and a lamp.
        for x, y, r in ((-2.15, -1.25, .34), (-1.45, -1.62, .3)):
            cyl(body, x, y, r, -.1, .08, 'canvas', seg=8)
            dome(body, x, y, r, .08, r * .95, 'canvas', seg=8, rings=3)
            B(body, x - .09, x + .09, y - r - .01, y - r + .1, 0, .22, 'metal')
        obox(body, -2.4, -.55, .16, .14, -.05, .26, .4, 'accent')
        obox(body, -2.35, -.55, .12, .1, .26, .44, .6, 'stripe')
        rf.mast(body, -1.75, -.85, 0, .85)
    if world == 'vesper':
        for t0, t1, off in ((-2.4, -.95, 0), (.8, 1.9, 0)):
            ridge(body, P(t0, off, AZ + R - .02), P(t1, off, AZ + R - .02), .26, .1, 'snow', z0=0)
        snow_drifts(body, rng, ((-1.0, -1.05, .55, .3, .16), (2.4, .1, .5, .3, .18), (-.4, 1.85, .7, .3, .14), (1.45, 1.6, .45, .3, .13)))
        for x, y, r in ((-2.15, -1.25, .34), (-1.45, -1.62, .3)):
            dome(body, x, y + .03, r * .7, .08 + r * .62, r * .32, 'snow', seg=8, rings=2)
    elif world == 'nacre':
        overgrowth(body, rng, ((P(-1.6).x, P(-1.6).y, AZ + R - .02, .32), (P(1.25).x, P(1.25).y, AZ + R - .02, .28),
                               (-1.7, 1.2, 0, .4), (1.6, -1.3, 0, .38), (2.6, .95, 0, .3), (-.9, -1.45, 0, .3)),
                   puddles=((-2.3, -.9, .55), (1.0, -1.65, .4), (-.2, 1.8, .45)))
    elif world == 'amnion':
        arches = [(tuple(P(t, -.95, 0)), tuple(P(t, .95, 0)), 1.0) for t in (-1.35, -1.85, -2.3)]
        brood_growths(body, rng, arches=arches,
                      plates=((P(1.3).x, P(1.3).y, AZ + R - .05, .26), (P(1.75).x, P(1.75).y, AZ + R - .1, .22), (P(-1.0).x, P(-1.0).y, AZ + R - .05, .2)),
                      resin=((P(-.9, -.55).x, P(-.9, -.55).y, .05, .18), (P(.75, .55).x, P(.75, .55).y, .05, .2), (-1.9, .9, .02, .16)),
                      eggs=((-1.15, -1.45, 5), (1.45, 1.55, 4)),
                      spikes=((2.6, -.7, .8, (.25, -.1)), (-2.7, .6, .7, (-.2, .15)), (.4, 1.75, .6, (.05, .25))))
    elif world == 'umbra':
        obsidian_shards(body, rng, ((-1.9, .95, 1.1), (1.9, -1.25, .9), (2.55, .9, 1.0), (-.6, 1.75, .8), (-2.4, -1.3, .8)))
    return body, core, ruin


# ----------------------------------------------------------------------------- airfield
def jet(h, x, y, yaw, z0):
    """A parked delta fighter (nose along its local +y), about 0.95 long."""
    c, s = math.cos(yaw), math.sin(yaw)
    T = lambda u, v, z: (x + u * c - v * s, y + u * s + v * c, z0 + z)
    sec = lambda v, w, hh, zc: [T(-w, v, zc), T(0, v, zc - hh), T(w, v, zc), T(0, v, zc + hh)]
    h.major.loft([sec(-.48, .07, .06, .18), sec(-.2, .1, .09, .19), sec(.22, .08, .08, .19), sec(.46, .012, .012, .16)], 'paint')
    h.major.loft([[T(u, v, .15) for u, v in ((-.42, -.36), (.42, -.36), (.1, .2), (-.1, .2))],
                  [T(u, v, .19) for u, v in ((-.4, -.34), (.4, -.34), (.09, .18), (-.09, .18))]], 'paint')
    for side in (-1, 1):
        h.minor.loft([[T(side * .08, -.46, .22), T(side * .09, -.22, .22), T(side * .09, -.3, .23)],
                      [T(side * .16, -.48, .44), T(side * .16, -.4, .44), T(side * .16, -.42, .45)]], 'accent')
        h.minor.loft([[T(side * u, v, .195) for u, v in ((.18, -.34), (.38, -.36), (.36, -.3), (.2, -.28))],
                      [T(side * u, v, .2) for u, v in ((.18, -.34), (.38, -.36), (.36, -.3), (.2, -.28))]], 'stripe')
    blob(h, T(0, .18, .27), .045, .12, .05, 'glass', seg=6, rings=4)


def quonset(h, cx, y0, y1, r, z0, snow=False):
    """A half-barrel hangar (axis along y), its open door to the camera, ribbed shell."""
    arc = lambda rr, a0=0.0, a1=math.pi, n=10: [(cx + rr * math.cos(a0 + (a1 - a0) * i / n), z0 + rr * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    h.major.prism(arc(r), 'y', y0, y1, 'paint')
    for y in [y0 + .05 + (y1 - y0 - .1) * i / 4 for i in range(5)]:
        band = arc(r + .03) + arc(r - .01)[::-1]
        h.minor.prism(band, 'y', y - .035, y + .035, 'accent')
    B(h, cx - r * .62, cx + r * .62, y0 - .03, y0 + .02, z0, z0 + r * .72, 'glass')
    B(h, cx - r * .66, cx + r * .66, y0 - .05, y0 + .02, z0 + r * .72, z0 + r * .78, 'glow')
    B(h, cx - r * .7, cx - r * .62, y0 - .05, y0 + .02, z0, z0 + r * .72, 'metal')
    B(h, cx + r * .62, cx + r * .7, y0 - .05, y0 + .02, z0, z0 + r * .72, 'metal')
    if snow:
        cap = arc(r + .06, math.radians(48), math.radians(132), 6) + arc(r - .02, math.radians(48), math.radians(132), 6)[::-1]
        h.minor.prism(cap, 'y', y0 + .02, y1 - .02, 'snow')


def airfield(world):
    """A runway on a concrete apron, the control tower (its cab is the target) beside it, a hangar, parked fighters,
    a fuel truck and a radar mast. Vesper's apron carries snow."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(23)
    Z = .1  # apron top
    # Apron: a concrete slab whose skirt reaches below uneven ground, a steel lip along its front.
    plan = lambda e, x0=-2.5, x1=2.7, y0=-3.0, y1=3.1: [(x0 - e, y0 - e), (x1 + e, y0 - e), (x1 + e, y1 + e), (x0 - e, y1 + e)]
    body.major.wedge(plan(.1), -1.3, 0, 'deck', top=plan(0))
    B(body, -2.5, 2.7, -3.0, 3.1, 0, Z, 'deck')
    B(body, -2.46, 2.66, -3.05, -2.98, Z - .04, Z + .015, 'steel')
    # Runway with centre dashes, threshold bars, an arrow and edge lights.
    RX0, RX1 = -2.28, -.82
    B(body, RX0, RX1, -2.95, 3.05, Z, Z + .02, 'asphalt')
    for k in range(9):
        y = -1.55 + k * .5
        B(body, -1.58, -1.52, y, y + .26, Z + .02, Z + .026, 'paint')
    for k in range(6):
        x = RX0 + .14 + k * (RX1 - RX0 - .28) / 5
        B(body, x - .06, x + .06, -2.85, -2.5, Z + .02, Z + .026, 'paint')
    for side in (-1, 1):
        obox(body, -1.55 + side * .16, -2.12, .03, .2, Z + .02, Z + .026, side * .7, 'paint', minor=True)
    for k in range(11):
        y = -2.85 + k * .58
        for x in (RX0 + .04, RX1 - .04):
            B(body, x - .035, x + .035, y - .035, y + .035, Z, Z + .07, 'glow')
    # Taxi lines and parking boxes in amber.
    B(body, RX1, .9, 1.02, 1.08, Z, Z + .006, 'stripe')
    for cx, cy in ((1.05, -.95), (2.05, -.7)):
        for dx0, dx1, dy0, dy1 in ((-.5, .5, -.55, -.5), (-.5, .5, .5, .55), (-.5, -.45, -.55, .55), (.45, .5, -.55, .55)):
            B(body, cx + dx0, cx + dx1, cy + dy0, cy + dy1, Z, Z + .006, 'stripe')
    # Hangar behind-right, door to the camera.
    quonset(body, 1.55, .95, 2.65, .82, Z, snow=(world == 'vesper'))
    # Fighters on their stands, a fuel truck and a tug.
    jet(body, 1.05, -.95, math.radians(195), Z)
    jet(body, 2.05, -.7, math.radians(165), Z)
    obox(body, -.25, -1.55, .3, .13, Z, Z + .2, .1, 'steel')
    tube(body, [(-.48, -1.58, Z + .27), (-.02, -1.53, Z + .27)], .11, 'stripe', seg=8, soft=False)
    obox(body, .17, -1.5, .12, .13, Z, Z + .3, .1, 'paint')
    B(body, .26, .3, -1.6, -1.42, Z + .16, Z + .27, 'glass')
    obox(body, 2.3, .35, .16, .11, Z, Z + .16, .5, 'stripe')
    # Radar mast behind the tower; a beacon at the runway's far end; two fuel tanks by the hangar.
    cyl(body, -.15, 2.35, .14, Z, Z + .2, 'metal', seg=8)
    cyl(body, -.15, 2.35, .05, Z + .2, 1.45, 'steel', seg=6)
    body.major.loft([[(-.15 + .5 * math.cos(TAU * k / 12), 2.28 + .06, 1.55 + .5 * math.sin(TAU * k / 12) * .8) for k in range(12)],
                     [(-.15 + .14 * math.cos(TAU * k / 12), 2.38 + .06, 1.55 + .14 * math.sin(TAU * k / 12) * .8) for k in range(12)]], 'paint')
    beam(body, (-.15, 2.38, 1.45), (-.15, 2.1, 1.6), .03, .03, 'steel')
    rf.mast(body, -1.55, 3.0, Z, 1.25)
    for x, y in ((2.42, 1.35), (2.42, 2.0)):
        cyl(body, x, y, .2, Z, Z + .5, 'paint', seg=10)
        dome(body, x, y, .2, Z + .5, .08, 'paint', seg=10, rings=3)
        cyl(body, x, y, .21, Z + .18, Z + .25, 'stripe', seg=10)
    # The control tower: a striped pedestal (body), its glazed cab, roof, antenna and dish (the core).
    body.major.box((-.33, -.33, -.4), (.33, .33, .55), 'paint', chamfer=.1)
    body.minor.box((-.345, -.345, .38), (.345, .345, .46), 'stripe', chamfer=.1)
    B(body, -.12, .12, -.36, -.33, Z, .36, 'metal')
    B(body, -.14, .14, -.38, -.33, .37, .4, 'glow')
    core.major.box((-.43, -.43, .55), (.43, .43, .6), 'metal', chamfer=.13)
    core.minor.box((-.37, -.37, .6), (.37, .37, 1.08), 'core_glow', chamfer=.11)
    for k in range(8):
        a = TAU * k / 8 + math.pi / 8
        x, y = math.cos(a) * .39, math.sin(a) * .39
        B(core, x - .025, x + .025, y - .025, y + .025, .6, 1.08, 'metal')
    core.major.box((-.47, -.47, 1.08), (.47, .47, 1.17), 'metal', chamfer=.14)
    core.major.box((-.3, -.3, 1.17), (.3, .3, 1.24), 'paint', chamfer=.09)
    cyl(core, .1, .1, .025, 1.24, 2.0, 'steel', seg=6)
    cyl(core, .1, .1, .045, 1.95, 2.03, 'glow', seg=8)
    beam(core, (-.12, .05, 1.36), (-.12, .05, 1.24), .04, .04, 'steel')
    core.minor.loft([[(-.12 + .2 * math.cos(TAU * k / 10), .05 - .06, 1.38 + .2 * math.sin(TAU * k / 10)) for k in range(10)],
                     [(-.12 + .05 * math.cos(TAU * k / 10), .05 + .02, 1.38 + .05 * math.sin(TAU * k / 10)) for k in range(10)]], 'paint')
    # Destroyed: the cab blown out to a jagged frame, the antenna fallen across the roof deck.
    for k in range(8):
        a = TAU * k / 8 + math.pi / 8
        x, y = math.cos(a) * .39, math.sin(a) * .39
        B(ruin, x - .03, x + .03, y - .03, y + .03, .55, .6 + rng.uniform(.05, .3), 'metal')
    ruin.major.box((-.43, -.43, .55), (.43, .43, .62), 'metal', chamfer=.13)
    obox(ruin, .15, .1, .4, .25, .62, .68, .6, 'metal', tilt=.25)
    beam(ruin, (.05, .2, .66), (.85, .7, Z + .02), .03, .03, 'steel')
    if world == 'vesper':
        snow_drifts(body, rng, ((-2.45, .5, .25, .9, .14), (2.65, -1.6, .3, .7, .14), (-.1, 2.95, .8, .22, .12), (.7, -2.95, .9, .2, .1)))
        B(core, -.3, .3, -.3, .3, 1.24, 1.27, 'snow')
    return body, core, ruin


# ----------------------------------------------------------------------------- prism reactor
def prism_reactor(world):
    """A floating crystal (the target) over a stepped block dais, ringed by curved horns with glowing seams. On Nacre a
    pale overgrown ruin: missing and sunken blocks, snapped and fallen horns, moss and mire."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(31)
    ruined = world == 'nacre'
    stone, dark = 'stone', 'stone_dark'
    seam = 'dim_glow' if ruined else 'glow'
    # Inner disc (16-gon) with a glowing ring inlay and a cross of seams; a skirt below.
    disc(body, 0, 0, 1.5, -1.15, .3, dark, seg=16)
    for a in range(16):
        a0, a1 = TAU * a / 16, TAU * (a + 1) / 16
        if ruined and a in (3, 4):
            continue
        quad = lambda r0, r1: [(r0 * math.cos(a0), r0 * math.sin(a0)), (r1 * math.cos(a0), r1 * math.sin(a0)),
                               (r1 * math.cos(a1), r1 * math.sin(a1)), (r0 * math.cos(a1), r0 * math.sin(a1))]
        body.minor.wedge(quad(.95, 1.05), .3, .315, seam)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        if ruined and k == 1:
            continue
        p0, p1 = Vector((math.cos(a) * .55, math.sin(a) * .55, .3)), Vector((math.cos(a) * 1.42, math.sin(a) * 1.42, .3))
        beam(body, p0, p1, .05, .03, seam)
    # Outer ring of blocks: 18 annular blocks of uneven heights (Nacre: some missing, some sunk).
    for k in range(18):
        a0, a1 = TAU * k / 18 + .02, TAU * (k + 1) / 18 - .02
        if ruined and k in (2, 7, 11, 15):
            continue
        top = rng.uniform(.12, .26) - (.12 if ruined and k in (5, 13) else 0)
        r0, r1 = 1.55, rng.uniform(2.2, 2.4)
        pts = lambda r, z: [(r * math.cos(a0), r * math.sin(a0), z), (r * math.cos((a0 + a1) / 2), r * math.sin((a0 + a1) / 2), z), (r * math.cos(a1), r * math.sin(a1), z)]
        inner, outer = pts(r0, 0), pts(r1, 0)
        loop = lambda z, e=0: [(x * (1 + e / r1), y * (1 + e / r1), z) for x, y, _ in outer] + [(x, y, z) for x, y, _ in inner[::-1]]
        body.major.loft([loop(-1.1, .1), loop(top)], stone if k % 3 else dark)
        if k % 4 == 1 and not ruined:  # a glowing groove on some blocks
            beam(body, ((r0 + .1) * math.cos((a0 + a1) / 2), (r0 + .1) * math.sin((a0 + a1) / 2), top), ((r1 - .1) * math.cos((a0 + a1) / 2), (r1 - .1) * math.sin((a0 + a1) / 2), top), .04, .02, seam)
    # Pedestal and emitter; a short beam lifting the crystal.
    cyl(body, 0, 0, .55, .3, .4, dark, seg=12)
    cyl(body, 0, 0, .42, .4, .46, 'obsidian' if not ruined else stone, seg=12)
    disc(body, 0, 0, .3, .46, .475, seam if ruined else 'glow', seg=12)
    tube(body, [(0, 0, .47), (0, 0, .62)], [.07, .02], 'core_glow', seg=6)
    # The horns: five curved claws around the dais, tall at the back, low at the front sides.
    horns = ((90, 2.9), (35, 2.5), (145, 2.5), (-15, 1.85), (195, 1.85))
    for i, (deg, height) in enumerate(horns):
        a = math.radians(deg)
        u = Vector((math.cos(a), math.sin(a), 0))
        base, mid, tip = u * 2.0 + Vector((0, 0, -.3)), u * 2.15 + Vector((0, 0, height * .5)), u * 1.45 + Vector((0, 0, height))
        pts = curve(base, mid, tip, 6)
        radii = [.33, .31, .27, .22, .16, .09, .01]
        if ruined and i == 0:  # snapped at half height, a jagged stump
            pts, radii = pts[:4], radii[:3] + [.2]
        if ruined and i == 2:  # snapped low; its upper half lies beside the stump
            pts, radii = pts[:3], radii[:2] + [.24]
            side = Vector((-math.sin(a), math.cos(a), 0))
            lie = u * 2.25 + Vector((0, 0, .14))
            tube(body, [lie - side * .1, lie - side * .5 + u * .1, lie - side * .9 + u * .15, lie - side * 1.25 + u * .15], [.22, .17, .1, .01], stone, seg=5, soft=False)
        if ruined and i in (3, 4):
            pts, radii = pts[:4], radii[:3] + [.18]
        tube(body, pts, radii, 'obsidian' if not ruined else stone, seg=5, soft=False)
        if ruined and i in (0, 3, 4):
            end = pts[-1]
            for k in range(3):
                shard(body, end + Vector((rng.uniform(-.06, .06), rng.uniform(-.06, .06), -.05)), rng.uniform(.12, .22), .07, stone, rng, lean=.4)
        if not (ruined and i == 2):
            inner = [p - u * (r * .9) for p, r in zip(pts, radii)]
            tube(body, inner[1:-1], .03, seam, seg=4)
    # The floating crystal and its three satellite shards (the core; it turns in the game).
    crystal(core, (0, 0, .8), .78, .42, 'core_glow', seg=6, waist=0, bottom=.3, tip=.03)
    for deg, r, z, size in ((20, .72, 1.25, .1), (160, .7, 1.05, .09), (95, .65, 1.55, .08)):
        a = math.radians(deg)
        crystal(core, (math.cos(a) * r, math.sin(a) * r, z), size * 2.2, size, 'core_glow', seg=4, waist=0, bottom=size * 1.4)
    # Destroyed: the crystal fallen and shattered on the pedestal.
    for k in range(6):
        a = TAU * k / 6 + rng.uniform(-.3, .3)
        shard(ruin, (math.cos(a) * .2, math.sin(a) * .2, .44), rng.uniform(.18, .34), rng.uniform(.07, .11), 'obsidian' if not ruined else 'stone_dark', rng, lean=.8)
    if ruined:
        overgrowth(body, rng, ((-1.85, .9, .2, .38), (1.95, -.4, .2, .32), (.8, 1.9, .22, .34), (-1.2, -1.75, .18, .3), (0, 1.1, .3, .28)),
                   puddles=((-.9, 2.25, .45), (2.35, .9, .4), (-2.35, -.9, .4)))
    else:
        obsidian_shards(body, rng, ((-2.35, 1.35, .7), (2.4, 1.3, .65)))
    return body, core, ruin


# ----------------------------------------------------------------------------- brood hive
def brood_hive(world):
    """A brood ribcage arching over a glowing heart-sac (the target): a fleshy mound, a dorsal spine and rib pairs,
    tusks at the mouth, segmented chitin tubes, egg clusters and bone spikes."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(41)
    # The mound with its skirt; a resin rim cupping the sac.
    blob(body, (0, .6, 0), 2.15, 1.95, .2, 'flesh', seg=14, rings=6, rng=rng, wobble=.1, floor=-1.2)
    blob(body, (0, 0, .12), .62, .58, .2, 'resin', seg=12, rings=5, rng=rng, wobble=.1)
    blob(body, (0, 0, .36), .36, .34, .1, 'flesh', seg=10, rings=4)
    # Spine from just behind the sac, curving back down into the mound.
    spine = curve((0, .3, 2.1), (0, 1.9, 2.15), (0, 2.75, .35), 8)
    tube(body, spine, [.16, .17, .17, .16, .15, .14, .13, .12, .1], 'bone', seg=7)
    for k in range(1, 8):  # dorsal thorns
        p = spine[k]
        tube(body, [p, p + Vector((0, .08, .22))], [.05, .004], 'bone', seg=4)
    for t, w in ((0, 1.45), (2, 1.55), (4, 1.45), (6, 1.25)):
        p = spine[t]
        for sgn in (-1, 1):
            pts = curve(p + Vector((0, 0, -.05)), (sgn * w * 1.25, p.y - .1, p.z * 1.0), (sgn * w, p.y + .1, -.3), 7)
            tube(body, pts, [.13, .125, .12, .115, .105, .095, .09, .085], 'bone', seg=6)
            tube(body, [pts[3], pts[3] + Vector((sgn * .3, -.05, .12))], [.06, .004], 'bone', seg=4)
    # Tusks framing the mouth.
    for sgn in (-1, 1):
        tube(body, curve((sgn * 1.45, -.35, -.2), (sgn * 1.85, -.75, .9), (sgn * 1.15, -.55, 1.65), 6),
             [.17, .16, .14, .11, .08, .045, .006], 'bone', seg=6)
    # Segmented chitin tubes along both flanks.
    for sgn in (-1, 1):
        pts = curve((sgn * 1.65, 2.55, .2), (sgn * 2.45, 1.0, .35), (sgn * 1.95, -.65, .12), 8)
        tube(body, pts, .2, 'chitin', seg=8)
        for k in range(1, 8):
            tube(body, [pts[k] - (pts[k + 1] - pts[k - 1]).normalized() * .04, pts[k] + (pts[k + 1] - pts[k - 1]).normalized() * .04], .235, 'bone', seg=8, soft=False)
    brood_growths(body, rng, eggs=((-1.1, -1.05, 6), (1.2, -1.1, 5), (-1.75, 1.85, 3), (1.85, 1.95, 3)),
                  spikes=((-2.3, .6, .75, (-.25, 0)), (2.3, .5, .8, (.25, .05)), (-1.9, 2.6, .7, (-.15, .2)), (1.85, 2.7, .65, (.15, .2))),
                  resin=((-.75, .75, .3, .16), (.8, .9, .3, .14), (.3, 1.7, .4, .15)))
    for x, y in ((-.55, -.55), (.6, -.5), (-.9, .2), (.95, .3), (0, -.75)):
        blob(body, (x, y, .32), .055, .055, .05, 'alt_glow', seg=6, rings=4)
    # The heart-sac (core): a glowing membrane wrapped in dark veins, tied down to the cup.
    blob(core, (0, 0, CORE), .46, .42, .48, 'sac_glow', seg=14, rings=8)
    for k in range(5):
        a = TAU * k / 5 + .3
        pts = [(math.cos(a) * .47 * math.cos(b), math.sin(a) * .43 * math.cos(b), CORE + .49 * math.sin(b)) for b in (-1.1, -.6, 0, .6, 1.15)]
        tube(core, pts, [.035, .03, .028, .022, .01], 'flesh', seg=4)
    # Destroyed: the sac burst and slumped into its cup, torn flaps.
    blob(ruin, (0, 0, .48), .4, .37, .14, 'flesh', seg=12, rings=5, rng=rng, wobble=.25)
    for k in range(5):
        a = TAU * k / 5 + rng.uniform(-.2, .2)
        tube(ruin, curve((math.cos(a) * .25, math.sin(a) * .25, .55), (math.cos(a) * .4, math.sin(a) * .4, .8), (math.cos(a) * .55, math.sin(a) * .55, .62), 3),
             [.06, .05, .03, .01], 'resin', seg=4, squash=.4)
    return body, core, ruin


BUILDERS = {'crash-site': crash_site, 'airfield': airfield, 'prism-reactor': prism_reactor, 'brood-hive': brood_hive}


# ----------------------------------------------------------------------------- build, check, export
def world_points(ob):
    me = ob.data
    mw = ob.matrix_world
    return [mw @ v.co for v in me.vertices]


def check(site, spec, objects):
    """Asserts the registry contract: bounds, top, foundation depth, the line of sight to the core."""
    problems = []
    lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for part, ob in objects.items():
        pts = world_points(ob)
        for p in pts:
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
        if part == 'body':
            for p in pts:
                if abs(p.x) < .9 and p.y < -.05 and p.z > .75 + 1.43 * -p.y + .02:
                    problems.append('%s body hides the core at (%.2f, %.2f, %.2f)' % (ob.name, p.x, p.y, p.z))
                    break
    tol = .01
    if lo.x < spec['x'][0] - tol or hi.x > spec['x'][1] + tol:
        problems.append('%s x %.2f..%.2f outside %s' % (site, lo.x, hi.x, spec['x']))
    if lo.y < spec['s'][0] - tol or hi.y > spec['s'][1] + tol:
        problems.append('%s s %.2f..%.2f outside %s' % (site, lo.y, hi.y, spec['s']))
    if hi.z > min(spec['top'], TOP_MAX) + tol:
        problems.append('%s top %.2f over %.2f' % (site, hi.z, spec['top']))
    if lo.z < -spec['below'] - tol:
        problems.append('%s foundation %.2f under %.2f' % (site, lo.z, -spec['below']))
    return problems, (lo, hi)


def build_site(site, spec, sc):
    out = {}
    for world in spec['finishes']:
        mats = materials(world)
        kits = BUILDERS[site](world)
        name = 'site_%s_%s' % (site.replace('-', '_'), world)
        objects = {part: kit.object('%s_%s' % (name, part), mats, sc) for part, kit in zip(('body', 'core', 'ruin'), kits)}
        br.bake_ao([objects['body'], objects['core']], [objects['body'], objects['core']], strength=.8, reach=1.6, ground=0.0, rays=24)
        br.bake_ao([objects['ruin']], [objects['body'], objects['ruin']], strength=.8, reach=1.6, ground=0.0, rays=24)
        out[world] = objects
    return out


def preview(site, finishes, sc, ruin=False):
    """Every finish from the game camera (intact, or destroyed with `ruin`), tiles in rows of three, one PNG."""
    os.makedirs(PREVIEW, exist_ok=True)
    ground = bpy.data.objects.get('site_preview_ground')
    if not ground:
        me = bpy.data.meshes.new('site_preview_ground')
        me.from_pydata([(-9, -9, -.02), (9, -9, -.02), (9, 9, -.02), (-9, 9, -.02)], [], [(0, 1, 2, 3)])
        ground = bpy.data.objects.new('site_preview_ground', me)
        sc.collection.objects.link(ground)
        ground.data.materials.append(br.material('site_preview_ground', '#6a6660', .9, 0))
    tiles = []
    for world, objects in finishes.items():
        shown = [objects['body'], objects['ruin' if ruin else 'core'], ground]
        tiles.append(br.render_view(sc, 'game', (0, .3, .6), 7.2, os.path.join(PREVIEW, 'tile_%s.png' % world), res=640, objects=shown))
    rows = [tiles[i:i + 3] for i in range(0, len(tiles), 3)]
    while len(rows[-1]) < len(rows[0]):
        rows[-1].append(br.render_view(sc, 'game', (40, 40, 0), 7.2, os.path.join(PREVIEW, 'tile_blank_%d.png' % len(rows[-1])), res=640, objects=[ground]))
    return br.compose(rows, os.path.join(PREVIEW, '%s%s.png' % (site, '-ruin' if ruin else '')))


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = next((a.split('=', 1)[1] for a in args if a.startswith('--site=')), None)
    spec_all = registry()
    os.makedirs(OUT, exist_ok=True)
    report = []
    failed = []
    for site, builder in BUILDERS.items():
        if only and site != only:
            continue
        started = time.time()
        sc = br.scene('strike_sites')
        spec = spec_all[site]
        finishes = build_site(site, spec, sc)
        for world, objects in finishes.items():
            problems, (lo, hi) = check(site, spec, objects)
            tris = {part: br.triangles([ob]) for part, ob in objects.items()}
            report.append('%s/%s: tris body %d core %d ruin %d; x %.2f..%.2f s %.2f..%.2f z %.2f..%.2f' % (
                site, world, tris['body'], tris['core'], tris['ruin'], lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
            failed += problems
        if '--no-export' not in args:
            for world, objects in finishes.items():
                result = br.export(os.path.join(OUT, '%s-%s.glb' % (site, world)), list(objects.values()),
                                   'Last Worlds strike site %s, %s finish (tools/blender/strike_sites.py)' % (site, world))
                report.append('%s/%s: %d triangles, %d bytes' % (site, world, result['triangles'], result['bytes']))
        if '--preview' in args:
            report.append('preview %s' % preview(site, finishes, sc))
            report.append('preview %s' % preview(site, finishes, sc, ruin=True))
        report.append('%s built in %.1fs' % (site, time.time() - started))
    print('\n'.join('SITES ' + line for line in report))
    for p in failed:
        print('SITES PROBLEM', p)
    print('SITES DONE', 'FAILED %d' % len(failed) if failed else 'OK')


main()
