"""Strike sites (docs/33 § 3 and § 6): hand-built low-poly site models, one GLB per site and finish.

The user (29 October): "just model them yourself. They dont need to be amazing and the existing infra is good
inspiration". References: art/concepts/strike-sites/00-all-sites.png (one world per site; the other finishes derived).
Built from the boss/facility toolkit's faceted solids (boss_remodel.Solids, remodel_facilities.Kit): flat paints, baked
AO in the vertex colours, glow materials named *glow*. Shape over texture: bold silhouettes for the 55-degree camera.

One GLB per site and finish: public/assets/shared/sites/<site>-<finish>.glb, so a world loads only its own finishes.

Contracts, all parsed from the TypeScript sources (single sources):
- src/render/site-models.ts SITE_MODELS: each site's finishes and bounds (every node is asserted against them);
- src/content/sites.ts SITE_CORE_HEIGHT (the core's centre over the pivot) and SITE_FOOTPRINT (every model fits it);
- src/content/formations.ts RING_*: the guard batteries' spots (nothing stands on or hides one).
Frame: the pivot is the site's centre on its floor (the core's ground point; the sealed vault's centre between its three
seals); x lateral, y away from the camera (glTF -z), z up. Nodes per finish: site_<id>_<finish>_body, _core (the target;
the vault's is one seal, drawn at each seal), _ruin (the broken core with its debris and scorch). Rules (docs/25): top
<= 3.25; rays from every core and guard battery toward the camera never meet the site (line of sight); foundations reach below the pivot.
In the game the site stands on its seat's floor (src/sim/sites.ts) and the terrain under it is levelled to that floor (site pads,
src/render/terrain-kit.ts); foundation blocks fill what is left (src/render/site-view.ts).

Headless (every path Blender sees is a Windows path):
  cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
    --python '\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\tools\\blender\\strike_sites.py' -- [--site=crash-site] [--no-export] [--preview]
--preview renders every finish of each built site from the game camera into lookdev/strike-sites/<site>.png.
"""
import bpy, math, os, re, sys, random, time
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boss_remodel as br
import remodel_facilities as rf
from remodel_facilities import B, cyl, dome

REGISTRY = os.path.join(br.ROOT, 'src', 'render', 'site-models.ts')
CONTENT = os.path.join(br.ROOT, 'src', 'content', 'sites.ts')
FORMATIONS = os.path.join(br.ROOT, 'src', 'content', 'formations.ts')
OUT = os.path.join(br.ROOT, 'public', 'assets', 'shared', 'sites')
PREVIEW = os.path.join(br.ROOT, 'lookdev', 'strike-sites')
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


def content():
    """SITE_CORE_HEIGHT {site: height} and SITE_FOOTPRINT (x, s0, s1) from content/sites.ts."""
    text = open(CONTENT).read()
    block = text[text.index('SITE_CORE_HEIGHT'):]
    block = block[:block.index('};')]
    heights = {m.group(1): float(m.group(2)) for m in re.finditer(r"'([a-z-]+)': ([\d.]+),", block)}
    m = re.search(r"SITE_FOOTPRINT = \{ x: ([\d.]+), s: \[([-\d.]+), ([-\d.]+)\] \}", text)
    return heights, (float(m.group(1)), float(m.group(2)), float(m.group(3)))


def guard_spots():
    """{site: guard ring spots (both mirrors)}: which ring formations each site's guards fly (content/sites.ts, every
    world) and their seats (content/formations.ts RING_*), on the ground (the lens spreads them about 7%)."""
    text = open(FORMATIONS).read()
    rings = {m.group(1): [(float(x), float(y)) for x, y in re.findall(r"\[([-\d.]+), ([-\d.]+)\]", m.group(2))]
             for m in re.finditer(r"^const (RING_\w+) = \[(.*)\] as const;", text, re.M)}
    formation_ring = {m.group(1): m.group(2) for m in re.finditer(r"id: '(site-[\w-]+)'[^\n]*?siteGuard\([^)]*?(RING_\w+)\)", text)}
    sites_text = open(CONTENT).read()
    sites_text = sites_text[sites_text.index('export const SITES'):]
    out = {}
    for m in re.finditer(r"^  '?([a-z-]+)'?: \{\n(.*?)\n  \},", sites_text, re.M | re.S):
        spots = set()
        for formation in re.findall(r"g\('(site-[\w-]+)'", m.group(2)):
            for x, y in rings.get(formation_ring.get(formation, ''), ()):
                for sign in (-1, 1):
                    spots.add((sign * x * 1.07, y * 1.07))
        out[m.group(1)] = sorted(spots)
    return out


CORE_HEIGHT, FOOTPRINT = content()
GUARD_SPOTS = guard_spots()
# The sealed vault's three seals around its centre (content/formations.ts site-core-sealed-vault slots, on the ground).
VAULT_SEALS = ((-1.07, -.43), (1.07, -.43), (0, 1.07))
CORES = {'sealed-vault': VAULT_SEALS}


# ----------------------------------------------------------------------------- finishes
# One palette per world (key: colour, roughness, metallic[, emission]) over a shared base; a site uses the slots it
# needs. Glow slots end in 'glow': the game reads them as lamps and turns them off when the site is destroyed.
GLOW = 2.2
BASE = dict(
    paint=('#e2e0da', .56, .04), accent=('#b9bab8', .55, .05), metal=('#2c2e33', .45, .55), steel=('#80858c', .4, .6),
    stripe=('#dca12e', .5, .08), deck=('#8e8d89', .88, .02), asphalt=('#2f3134', .9, .02), ground=('#5f5d5a', .95, .0),
    glass=('#18202a', .18, .3), canvas=('#cfc9bc', .8, .0), snow=('#eef3f7', .7, .0), scorch=('#151110', .95, .0),
    crate_a=('#2f5f9a', .6, .1), crate_b=('#c0602a', .6, .1), crate_c=('#8a8f96', .6, .2),
    stone=('#8a8478', .85, .02), stone_dark=('#4e4a56', .85, .02), moss=('#3c5e4c', .9, .0), frond=('#6a3fb0', .7, .0),
    water=('#122028', .12, .1), bone=('#d8c8a8', .62, .0), chitin=('#4a2c1e', .35, .1), resin=('#a8541a', .22, .05),
    flesh=('#44120f', .6, .0), egg=('#e0b878', .4, .0), obsidian=('#16141f', .12, .0),
    glow=('#2a1606', .5, .2, '#ffa83a'), core_glow=('#2a1606', .4, .1, '#ff8a3a'), alt_glow=('#2a1606', .4, .1, '#ffb02a'),
    sac_glow=('#2a1004', .35, .1, '#ffa82a'), dim_glow=('#2a1606', .5, .1, '#c06a2a'), ember_glow=('#2a0a02', .6, .0, '#ff6a1e'),
    prism_glow=('#3c2a80', .1, .1, '#9a74ff'), field_glow=('#0a2030', .3, .1, '#6fd0ff'), ash=('#b8b2a8', .92, .0),
)
WORLD = {
    'luna': dict(),
    'khepri': dict(paint=('#d9cbb4', .62, .04), accent=('#b8582a', .55, .1), metal=('#2b2724', .45, .6), steel=('#6e675f', .42, .55),
                   stripe=('#dd9a30', .55, .08), deck=('#8a705c', .9, .02), asphalt=('#3b2e27', .9, .02), ground=('#5a301c', .95, .0),
                   glass=('#1b1a1c', .18, .3), canvas=('#bfa47a', .85, .0),
                   glow=('#2a1006', .5, .2, '#ff8a2a'), core_glow=('#04201f', .35, .1, '#4ff2df')),
    'vesper': dict(paint=('#dfe4ea', .5, .12), accent=('#5c6876', .5, .25), metal=('#1d2127', .45, .55), steel=('#8d949e', .4, .55),
                   stripe=('#d27a2e', .55, .1), deck=('#4b525c', .8, .1), asphalt=('#24282e', .85, .05), ground=('#e4ebf2', .75, .0),
                   glass=('#141b24', .15, .3), canvas=('#8a9cb0', .8, .0), snow=('#f0f5fa', .7, .0),
                   glow=('#06121e', .5, .2, '#52c2ff'), core_glow=('#06121e', .35, .1, '#7fd8ff'), dim_glow=('#06121e', .5, .1, '#3a8ac8')),
    'nacre': dict(paint=('#d2cdd8', .55, .05), accent=('#554a86', .55, .1), metal=('#251f3b', .45, .45), steel=('#7c76a8', .45, .4),
                  stripe=('#3fb6b0', .5, .1), ground=('#2a2238', .95, .0), glass=('#141022', .18, .3),
                  stone=('#a49d90', .85, .02), stone_dark=('#4a4458', .85, .02), bone=('#bdb3cf', .6, .0), chitin=('#2c2244', .35, .1),
                  resin=('#3a2a5e', .25, .05), flesh=('#1e1830', .6, .0), egg=('#8d6cc0', .22, .05),
                  glow=('#1a0a2a', .5, .2, '#b46cff'), core_glow=('#04201f', .35, .1, '#5ff0e4'), alt_glow=('#04201f', .4, .1, '#5ff0e4'),
                  sac_glow=('#1a0a2a', .35, .1, '#c86cff'), dim_glow=('#04201f', .5, .1, '#2fb8b0'), prism_glow=('#0e4a46', .1, .1, '#4fe0d4')),
    'amnion': dict(paint=('#cfc6b6', .62, .04), accent=('#8a3a2a', .55, .1), metal=('#2a1a16', .45, .5), steel=('#6a5a50', .42, .5),
                   stripe=('#c9862e', .55, .08), ground=('#4a2a22', .95, .0), glass=('#1a1210', .18, .3), stone=('#3a2a2a', .6, .05),
                   stone_dark=('#241818', .6, .05),
                   glow=('#2a1606', .5, .1, '#ffc23a'), core_glow=('#2a1606', .35, .1, '#ffc23a'), alt_glow=('#2a1606', .4, .1, '#ffb02a'),
                   sac_glow=('#2a1004', .35, .1, '#ffa82a'), dim_glow=('#2a1606', .5, .1, '#d08a2a')),
    'umbra': dict(paint=('#c8c4d0', .5, .1), accent=('#4a3a9a', .5, .2), metal=('#121018', .4, .5), steel=('#5a5668', .4, .5),
                  stripe=('#6a58c8', .5, .1), ground=('#1c1a26', .9, .0), glass=('#0c0a12', .15, .3),
                  stone=('#3c3654', .4, .05), stone_dark=('#26222f', .45, .05), obsidian=('#2e2a46', .16, .05),
                  glow=('#140a2a', .5, .2, '#8a6cff'), core_glow=('#140a2a', .35, .1, '#c09cff'), alt_glow=('#140a2a', .4, .1, '#9a6cff'),
                  dim_glow=('#140a2a', .5, .1, '#7a5ce0')),
}
STRENGTH = {'core_glow': 3.2, 'sac_glow': 3.0, 'dim_glow': 1.4, 'ember_glow': 2.6, 'prism_glow': 1.1, 'field_glow': 1.6}


def materials(world):
    out = {}
    for slot, spec in dict(BASE, **WORLD[world]).items():
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




# ----------------------------------------------------------------------------- shared site pieces
def scorch(h, rng, x, y, r, mat='scorch'):
    """A burnt patch: an irregular flat disc just over the ground, its rim sunk below it."""
    n = 11
    radii = [r * rng.uniform(.7, 1.1) for _ in range(n)]
    ring = lambda k, z: [(x + radii[i] * k * math.cos(TAU * i / n), y + radii[i] * k * math.sin(TAU * i / n), z) for i in range(n)]
    h.minor.loft([ring(1.0, -.12), ring(1.0, .02), ring(.35, .035)], mat)


def wreckage(h, rng, x, y, r0, r1, n, mats=('metal', 'steel', 'scorch'), size=.13, embers=2, z=0.0):
    """Debris thrown around a blast: tumbled chunks and plates between radii r0 and r1, a few still smouldering."""
    for i in range(n):
        a, d = rng.uniform(0, TAU), rng.uniform(r0, r1)
        px, py, k = x + math.cos(a) * d, y + math.sin(a) * d, size * rng.uniform(.6, 1.5)
        obox(h, px, py, k * rng.uniform(.8, 1.7), k * rng.uniform(.5, 1), z - .06, z + k * rng.uniform(.5, 1.1), rng.uniform(0, TAU),
             mats[i % len(mats)], tilt=rng.uniform(-.6, .6), minor=True)
    for i in range(embers):
        a, d = rng.uniform(0, TAU), rng.uniform(r0 * .5, r1 * .7)
        blob(h, (x + math.cos(a) * d, y + math.sin(a) * d, z + .05), .07, .07, .06, 'ember_glow', seg=6, rings=4)


def slab(h, x0, x1, y0, y1, top, mat, floor=-1.0, skirt=.1, lip='steel'):
    """A built apron: a slab whose skirt reaches below uneven ground, a steel lip along its front."""
    plan = lambda e: [(x0 - e, y0 - e), (x1 + e, y0 - e), (x1 + e, y1 + e), (x0 - e, y1 + e)]
    h.major.wedge(plan(skirt), floor, 0, mat, top=plan(0))
    B(h, x0, x1, y0, y1, 0, top, mat)
    if lip:
        B(h, x0 + .04, x1 - .04, y0 - .05, y0 + .02, top - .04, top + .015, lip)


def blade(h, base, tip, bulge, width, mat, thin=.3, steps=6, phase=0.0, soft=False):
    """A curved, sharp blade from base to tip through a bulge control point (a flattened, tapering rhombus section)."""
    pts = curve(base, bulge, tip, steps)
    radii = [width * (1 - (i / steps) ** 1.6 * .97) for i in range(steps + 1)]
    tube(h, pts, radii, mat, seg=4, soft=soft, phase=phase, squash=thin)


def ember_spots(h, spots):
    for x, y, z in spots:
        blob(h, (x, y, z), .08, .08, .07, 'ember_glow', seg=6, rings=4)


def fence(h, x0, x1, y0, y1, sides='fbl r', post='steel', rail='stripe', height=.42, step=.55):
    """A low perimeter fence (posts and two rails) on the chosen sides: f front, b back, l left, r right."""
    runs = {'f': ((x0, y0), (x1, y0)), 'b': ((x0, y1), (x1, y1)), 'l': ((x0, y0), (x0, y1)), 'r': ((x1, y0), (x1, y1))}
    for side in sides.replace(' ', ''):
        (ax, ay), (bx, by) = runs[side]
        n = max(1, int(math.hypot(bx - ax, by - ay) / step))
        for i in range(n + 1):
            px, py = ax + (bx - ax) * i / n, ay + (by - ay) * i / n
            B(h, px - .025, px + .025, py - .025, py + .025, -.1, height, post)
        for z in (height * .45, height * .9):
            beam(h, (ax, ay, z), (bx, by, z), .025, .03, rail)


def lamp_mast(h, x, y, z0, z1, lamp='glow'):
    """A light mast with a lamp head."""
    cyl(h, x, y, .07, z0, z0 + .15, 'metal', seg=8)
    cyl(h, x, y, .035, z0 + .15, z1 - .08, 'steel', seg=6)
    B(h, x - .1, x + .1, y - .06, y + .06, z1 - .08, z1, 'metal')
    B(h, x - .085, x + .085, y - .075, y - .055, z1 - .07, z1 - .015, lamp)


def container(h, x, y, z, yaw, mat, length=.9, width=.42, height=.42):
    """A shipping container with ribbed sides and dark door ends."""
    obox(h, x, y, length / 2, width / 2, z, z + height, yaw, mat)
    c, s = math.cos(yaw), math.sin(yaw)
    for k in (-1, 1):
        ex, ey = x + c * k * (length / 2 + .005), y + s * k * (length / 2 + .005)
        obox(h, ex, ey, .012, width / 2 - .03, z + .03, z + height - .03, yaw, 'metal', minor=True)


def ice_block(h, rng, x, y, r, top, mat='snow'):
    """A blocky ice drift for Vesper (low, faceted)."""
    rock(h, rng, x, y, r, top, mat, floor=-.3, seg=5)


# ----------------------------------------------------------------------------- crash site
def crash_site(world):
    """A freighter broken in two at the end of a long scorched furrow, its reactor exposed in the break (the target),
    embers and spilled cargo. Frontier worlds get a survivors' camp; Vesper snow, Nacre moss and mire, Amnion brood
    growths, Umbra obsidian shards."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(11)
    th = math.radians(14)
    d, n = Vector((math.cos(th), math.sin(th), 0)), Vector((-math.sin(th), math.cos(th), 0))
    R, AZ, C = .62, .42, CORE_HEIGHT['crash-site']
    P = lambda t, off=0.0, z=AZ: Vector((0, 0, z)) + d * t + n * off

    def hull(t0, t1, jag_at, taper=None):
        """A hull half from t0 to t1 (decagon); the end at `jag_at` is torn open into a dark cavity."""
        seg = 10
        def ring_at(t, r, jag=False):
            out = []
            for k in range(seg):
                a = TAU * k / seg + math.pi / seg
                dt = rng.uniform(-.2, .14) if jag else 0
                rr = r * (rng.uniform(.86, 1.05) if jag else 1)
                out.append(tuple(P(t + dt) + n * math.cos(a) * rr + Vector((0, 0, math.sin(a) * rr))))
            return out
        ts = [t0, t1] if taper is None else [t0, taper[0], t1]
        rs = [R, R] if taper is None else [R, R, taper[1]]
        loops = [ring_at(t, r, jag=(t == jag_at)) for t, r in zip(ts, rs)]
        if jag_at == t0:
            loops = loops[::-1]
        inward = -.5 if jag_at == t1 else .5
        jag = loops[-1]
        cavity = [tuple(Vector(p).lerp(P(jag_at + inward), .9)) for p in jag]
        body.major.loft(loops, 'paint', caps=False)
        body.major.loft([loops[0], [tuple(Vector(p).lerp(P(ts[0] if jag_at != t0 else t1), .999)) for p in loops[0]]], 'metal', caps=False)
        body.minor.loft([jag, cavity], 'metal', caps=False)

    # The furrow it ploughed: a scorched trench the whole length, berms of thrown earth on both sides.
    a, b = P(-2.75, 0, 0), P(2.75, 0, 0)
    side = n * .8
    body.minor.loft([[tuple(a - side + Vector((0, 0, z))), tuple(b - side + Vector((0, 0, z))), tuple(b + side + Vector((0, 0, z))),
                      tuple(a + side + Vector((0, 0, z)))] for z in (-.15, .03)], 'scorch')
    for off in (-1.0, 1.0):
        ridge(body, P(-2.55, off, 0), P(2.6, off, 0), .32, .26, 'ground')
    mound(body, rng, *tuple(P(2.55, 0, 0))[:2], .3, .5, .45, 'ground', seg=8)
    # Stern half (engines), front-left: torn at -0.85; exposed frames in the gap toward the reactor.
    hull(-2.45, -.85, -.85)
    for t in (-.72, -.56):
        ring_tube(body, P(t), d, R * .98, .04, 'steel', seg=12, side=4, arc=(math.pi - .35, TAU + .35))
    for off in (-.4, .4):
        beam(body, P(-.9, off, AZ + .44), P(-.45, off, AZ + .36), .06, .06, 'steel')
    for t in (-1.2, -2.15):
        tube(body, [P(t - .07), P(t + .07)], R + .035, 'accent', seg=10, soft=False, phase=math.pi / 10)
    for k in range(6):  # running lights and ports along the camera side
        t = -2.25 + k * .25
        p = P(t, -R * .72, AZ + R * .6)
        obox(body, p.x, p.y, .09, .045, p.z - .07, p.z + .07, th, 'glass', minor=True)
        if k % 2 == 0:
            q = P(t + .13, -R * .95, AZ + .1)
            obox(body, q.x, q.y, .07, .03, q.z - .03, q.z + .03, th, 'glow', minor=True)
    for off in (-.28, 0, .28):  # three dead engine nozzles at the stern
        p = P(-2.45, off * 1.1, AZ + .05 - abs(off) * .3)
        tube(body, [p, p - d * .2], [.2, .23], 'metal', seg=8, soft=False)
        tube(body, [p - d * .05, p - d * .21], [.15, .17], 'steel', seg=8, soft=False)
    for t, half, mat in ((-1.95, .24, 'stripe'), (-1.48, .2, 'accent')):  # cargo modules clamped to the spine
        p = P(t, 0, AZ + R - .1)
        obox(body, p.x, p.y, half, .36, p.z, p.z + .3, th, mat)
        obox(body, p.x, p.y, half + .015, .375, p.z + .3, p.z + .33, th, 'steel', minor=True)
    # Bow half, back-right: torn at 0.75, tapering into the cockpit.
    hull(.75, 2.6, .75, taper=(2.0, .3))
    tube(body, [P(1.05), P(1.19)], R + .035, 'accent', seg=10, soft=False, phase=math.pi / 10)
    tube(body, [P(1.7), P(1.84)], R + .035, 'stripe', seg=10, soft=False, phase=math.pi / 10)
    for k in range(3):  # cockpit glazing, lit
        t = 2.05 + k * .16
        p = P(t, -R * .45 * (1 - k * .18), AZ + R * .7 * (1 - k * .2))
        obox(body, p.x, p.y, .08, .055, p.z - .05, p.z + .08, th, 'glow' if k == 1 else 'glass', minor=True)
    beam(body, P(1.45, 0, AZ + R), P(1.45, 0, AZ + R + .5), .045, .045, 'steel')  # antenna
    beam(body, P(1.4, 0, AZ + R + .34), P(1.52, 0, AZ + R + .34), .12, .025, 'steel')
    # The reactor cradle in the break and its conduits (body); the reactor itself is the core.
    body.major.box((-.4, -.34, -.4), (.4, .34, .66), 'metal', chamfer=.09)
    B(body, -.42, .42, -.36, .36, .58, .66, 'steel')
    for sgn, t in ((-1, -.85), (1, .75)):
        tube(body, [Vector((sgn * .34, 0, .5)), P(t + sgn * -.05, 0, AZ + .12)], .08, 'steel', seg=6)
        tube(body, [Vector((sgn * .34, .16, .38)), P(t, .22, AZ - .05)], .05, 'stripe', seg=5)
    ember_spots(body, [tuple(P(-.95, .3, AZ + R - .1)), tuple(P(.8, -.35, AZ + .5)), tuple(P(.9, .5, .1)), tuple(P(-1.3, -1.05, .05))])
    blob(core, (0, 0, C), .36, .36, .36, 'core_glow', seg=12, rings=8)
    ring_tube(core, (0, 0, C), (1, 0, 0), .46, .04, 'steel', seg=14, side=5)
    ring_tube(core, (0, 0, C), (math.cos(.9), math.sin(.9), 0), .46, .035, 'steel', seg=14, side=5)
    cyl(core, 0, 0, .13, .64, C - .3, 'steel', seg=8)
    # Destroyed: a split, burnt reactor slumped in its cradle, a scorch and debris all round.
    blob(ruin, (0, 0, .74), .32, .3, .16, 'metal', seg=10, rings=5, rng=rng, wobble=.2)
    ring_tube(ruin, (0, .05, .8), (math.cos(.4), math.sin(.4), .3), .42, .035, 'steel', seg=8, side=4, arc=(.2, 2.6))
    for ang in (.4, 2.3, 4.1):
        shard(ruin, (math.cos(ang) * .22, math.sin(ang) * .22, .66), .34, .08, 'steel', rng, lean=.6)
    scorch(ruin, rng, .1, -.9, 1.0)
    wreckage(ruin, rng, 0, -.4, .9, 2.3, 12, embers=3)
    # Torn hull plates and spilled cargo.
    for x, y, yaw, tilt, mat in ((-1.35, 1.2, .5, .45, 'paint'), (1.15, -1.45, 2.2, .3, 'paint'), (-.6, 1.55, 1.2, .5, 'accent'),
                                 (2.3, -1.0, .9, .55, 'paint'), (.7, 1.6, 2.9, .35, 'steel')):
        obox(body, x, y, .3, .19, .02, .05, yaw, mat, tilt=tilt)
    for x, y, yaw, mat in ((-1.75, .75, .3, 'stripe'), (-1.25, 1.85, 1.1, 'accent'), (.3, 1.95, .2, 'steel'), (1.85, -1.75, .7, 'stripe')):
        obox(body, x, y, .25, .16, -.1, .32, yaw, mat)
        obox(body, x, y, .265, .175, .32, .35, yaw, 'metal', minor=True)
    if world in ('luna', 'khepri', 'vesper'):
        # Survivors' camp at the front-left: two dome tents, a crate stack and a lamp.
        for x, y, r in ((-2.3, -1.75, .34), (-1.55, -2.15, .3)):
            cyl(body, x, y, r, -.1, .08, 'canvas', seg=8)
            dome(body, x, y, r, .08, r * .95, 'canvas', seg=8, rings=3)
            B(body, x - .09, x + .09, y - r - .01, y - r + .1, 0, .22, 'metal')
        obox(body, -2.55, -.95, .16, .14, -.05, .26, .4, 'accent')
        obox(body, -2.5, -.95, .12, .1, .26, .44, .6, 'stripe')
        rf.mast(body, -1.9, -1.2, 0, .85)
    if world == 'vesper':
        for t0, t1 in ((-2.3, -1.0), (.9, 2.0)):
            ridge(body, P(t0, 0, AZ + R - .02), P(t1, 0, AZ + R - .02), .3, .1, 'snow', z0=0)
        for x, y, r in ((-2.3, -1.75, .34), (-1.55, -2.15, .3)):
            dome(body, x, y + .03, r * .7, .08 + r * .62, r * .32, 'snow', seg=8, rings=2)
        snow_drifts(body, rng, ((-.6, 2.2, .6, .3, .14), (1.7, 1.9, .45, .3, .13)))
    elif world == 'nacre':
        overgrowth(body, rng, ((P(-1.7).x, P(-1.7).y, AZ + R - .02, .34), (P(1.3).x, P(1.3).y, AZ + R - .02, .3),
                               (-1.9, 1.35, 0, .4), (1.7, -1.6, 0, .38), (2.5, 1.0, 0, .3), (-.9, -1.75, 0, .3)),
                   puddles=((-2.4, -.9, .5), (1.0, -2.0, .4), (-.2, 2.2, .45)))
    elif world == 'amnion':
        arches = [(tuple(P(t, -1.1, 0)), tuple(P(t, 1.1, 0)), 1.15) for t in (-1.25, -1.7, -2.15)]
        brood_growths(body, rng, arches=arches,
                      plates=((P(1.4).x, P(1.4).y, AZ + R - .05, .3), (P(1.9).x, P(1.9).y, AZ + R - .1, .24), (P(-1.05).x, P(-1.05).y, AZ + R - .05, .22)),
                      resin=((P(-.95, -.65).x, P(-.95, -.65).y, .05, .2), (P(.85, .65).x, P(.85, .65).y, .05, .22), (-2.0, 1.1, .02, .18)),
                      eggs=((-1.2, -1.75, 5), (1.5, 1.85, 4)),
                      spikes=((2.55, .5, .85, (.25, -.1)), (-2.7, .9, .75, (-.2, .15)), (.4, 2.1, .65, (.05, .25))))
    elif world == 'umbra':
        obsidian_shards(body, rng, ((-2.0, 1.2, 1.1), (1.9, -1.55, .9), (2.55, 1.0, 1.0), (-.6, 2.05, .8), (-2.1, -1.95, .8)))
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
    """A half-barrel hangar (axis along y), its lit door to the camera, ribbed shell."""
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
    """A long runway on a concrete apron, a tall control tower beside it (its glazed cab is the target), a hangar,
    parked fighters, a fuel truck, a radar dish and fuel tanks. Vesper's apron carries snow patches."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(23)
    Z, C = .1, CORE_HEIGHT['airfield']
    X0, X1, Y0, Y1 = -2.55, 2.85, -3.05, 3.15
    slab(body, X0, X1, Y0, Y1, Z, 'deck', floor=-1.3)
    # Runway the apron's full length: centre dashes, threshold bars, an arrow, edge lights, approach lights.
    RX0, RX1 = -2.45, -.95
    B(body, RX0, RX1, Y0 + .05, Y1 - .05, Z, Z + .02, 'asphalt')
    for k in range(11):
        y = -2.0 + k * .5
        B(body, -1.73, -1.67, y, y + .26, Z + .02, Z + .026, 'paint')
    for k in range(6):
        x = RX0 + .14 + k * (RX1 - RX0 - .28) / 5
        B(body, x - .06, x + .06, -3.0, -2.6, Z + .02, Z + .026, 'paint')
    for sgn in (-1, 1):
        obox(body, -1.7 + sgn * .17, -2.25, .03, .21, Z + .02, Z + .026, sgn * .7, 'paint', minor=True)
    for k in range(12):
        y = -3.0 + k * .56
        for x in (RX0 + .04, RX1 - .04):
            B(body, x - .035, x + .035, y - .035, y + .035, Z, Z + .07, 'glow')
    for x in (-2.25, -1.95, -1.45, -1.15):
        B(body, x - .04, x + .04, Y0 + .02, Y0 + .1, Z, Z + .09, 'glow')
    # Taxi line and parking boxes in amber.
    B(body, RX1, 1.0, 1.0, 1.06, Z, Z + .006, 'stripe')
    for cx, cy in ((1.1, -1.05), (2.15, -.85)):
        for dx0, dx1, dy0, dy1 in ((-.5, .5, -.55, -.5), (-.5, .5, .5, .55), (-.5, -.45, -.55, .55), (.45, .5, -.55, .55)):
            B(body, cx + dx0, cx + dx1, cy + dy0, cy + dy1, Z, Z + .006, 'stripe')
    quonset(body, 1.6, 1.3, 3.05, .85, Z, snow=(world == 'vesper'))
    jet(body, 1.1, -1.05, math.radians(195), Z)
    jet(body, 2.15, -.85, math.radians(165), Z)
    obox(body, -.3, -1.75, .3, .13, Z, Z + .2, .1, 'steel')
    tube(body, [(-.53, -1.78, Z + .27), (-.07, -1.73, Z + .27)], .11, 'stripe', seg=8, soft=False)
    obox(body, .12, -1.7, .12, .13, Z, Z + .3, .1, 'paint')
    obox(body, 2.45, .2, .16, .11, Z, Z + .16, .5, 'stripe')
    for x, y in ((2.55, .6), (2.55, 1.1)):
        cyl(body, x, y, .2, Z, Z + .5, 'paint', seg=10)
        dome(body, x, y, .2, Z + .5, .08, 'paint', seg=10, rings=3)
        cyl(body, x, y, .21, Z + .18, Z + .25, 'stripe', seg=10)
    rx, ry = 2.35, -2.3  # the radar dish at the apron's front-right corner
    cyl(body, rx, ry, .14, Z, Z + .2, 'metal', seg=8)
    cyl(body, rx, ry, .05, Z + .2, 1.25, 'steel', seg=6)
    body.major.loft([[(rx + .42 * math.cos(TAU * k / 12), ry - .07, 1.35 + .42 * math.sin(TAU * k / 12) * .8) for k in range(12)],
                     [(rx + .12 * math.cos(TAU * k / 12), ry + .03, 1.35 + .12 * math.sin(TAU * k / 12) * .8) for k in range(12)]], 'paint')
    beam(body, (rx, ry + .03, 1.25), (rx, ry - .25, 1.4), .03, .03, 'steel')
    rf.mast(body, -1.7, 2.95, Z, 1.3)
    # The control tower: a striped base and a tall shaft (body); the glazed cab, roof, antenna and dish (the core).
    body.major.box((-.42, -.42, -.4), (.42, .42, .6), 'paint', chamfer=.12)
    body.minor.box((-.435, -.435, .42), (.435, .435, .5), 'stripe', chamfer=.12)
    B(body, -.13, .13, -.45, -.42, Z, .4, 'metal')
    B(body, -.15, .15, -.47, -.42, .41, .44, 'glow')
    body.major.box((-.25, -.25, .6), (.25, .25, 1.55), 'paint', chamfer=.07)
    for z in (.95, 1.3):
        body.minor.box((-.26, -.26, z), (.26, .26, z + .06), 'accent', chamfer=.07)
    for z in (.8, 1.15):  # slit windows up the shaft
        B(body, -.05, .05, -.27, -.25, z, z + .14, 'glow')
    core.major.box((-.48, -.48, 1.55), (.48, .48, 1.62), 'metal', chamfer=.14)
    core.minor.box((-.4, -.4, 1.62), (.4, .4, 2.08), 'core_glow', chamfer=.12)
    for k in range(8):
        ang = TAU * k / 8 + math.pi / 8
        x, y = math.cos(ang) * .43, math.sin(ang) * .43
        B(core, x - .028, x + .028, y - .028, y + .028, 1.62, 2.08, 'metal')
    core.major.box((-.52, -.52, 2.08), (.52, .52, 2.18), 'metal', chamfer=.15)
    core.major.box((-.32, -.32, 2.18), (.32, .32, 2.25), 'paint', chamfer=.1)
    cyl(core, .12, .12, .025, 2.25, 2.88, 'steel', seg=6)
    cyl(core, .12, .12, .045, 2.84, 2.93, 'glow', seg=8)
    beam(core, (-.14, .06, 2.4), (-.14, .06, 2.25), .04, .04, 'steel')
    core.minor.loft([[(-.14 + .22 * math.cos(TAU * k / 10), .06 - .06, 2.42 + .22 * math.sin(TAU * k / 10)) for k in range(10)],
                     [(-.14 + .05 * math.cos(TAU * k / 10), .06 + .02, 2.42 + .05 * math.sin(TAU * k / 10)) for k in range(10)]], 'paint')
    if world == 'vesper':
        B(core, -.32, .32, -.32, .32, 2.25, 2.28, 'snow')
    # Destroyed: the cab blown out to a jagged frame, the antenna fallen, a scorch and debris round the tower.
    for k in range(8):
        ang = TAU * k / 8 + math.pi / 8
        x, y = math.cos(ang) * .43, math.sin(ang) * .43
        B(ruin, x - .032, x + .032, y - .032, y + .032, 1.55, 1.62 + rng.uniform(.06, .34), 'metal')
    ruin.major.box((-.48, -.48, 1.55), (.48, .48, 1.63), 'metal', chamfer=.14)
    obox(ruin, .18, .12, .45, .28, 1.63, 1.7, .6, 'metal', tilt=.25)
    beam(ruin, (.4, .5, Z + .02), (1.0, 1.2, Z + .3), .035, .035, 'steel')
    scorch(ruin, rng, .1, -.75, .85)
    wreckage(ruin, rng, 0, -.3, .7, 1.9, 12, embers=3, z=Z)
    if world == 'vesper':
        # Snow lies on the apron itself (never spilling past its edges) and on the roofs.
        for x0, x1, y0, y1 in ((-2.5, -2.47, -2.0, 2.4), (2.5, 2.8, -2.0, -1.5), (-.6, .7, 2.85, 3.1), (.3, 1.3, -3.0, -2.8)):
            ridge(body, ((x0 + x1) / 2 if x1 - x0 < y1 - y0 else x0, y0 if x1 - x0 < y1 - y0 else (y0 + y1) / 2, Z),
                  ((x0 + x1) / 2 if x1 - x0 < y1 - y0 else x1, y1 if x1 - x0 < y1 - y0 else (y0 + y1) / 2, Z),
                  min(x1 - x0, y1 - y0) / 2 + .04, .08, 'snow', z0=Z)
        B(body, -.3, .3, -.3, .3, .6, .63, 'snow')
    return body, core, ruin


# ----------------------------------------------------------------------------- salvage yard
def salvage_yard(world):
    """A fenced scrap yard: a gantry crane whose hook holds a salvaged reactor pod (the target), a ship's hull stripped
    to its ribs, scrap piles and a container stack."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(51)
    Z, C = .06, CORE_HEIGHT['salvage-yard']
    slab(body, -2.85, 2.85, -2.75, 3.15, Z, 'deck', floor=-1.0, lip=None)
    fence(body, -2.8, 2.8, -2.7, 3.1, sides='flrb')
    # The gantry: A-frame legs either side, a box girder across, a trolley with the hook's cable.
    for sx in (-2.3, 2.3):
        for sy in (-.65, .65):
            beam(body, (sx, sy, 0), (sx, 0, 2.6), .14, .14, 'stripe', minor=False)
        beam(body, (sx, -.5, .9), (sx, .5, .9), .08, .08, 'metal')
        B(body, sx - .2, sx + .2, -.8, .8, -.2, .12, 'metal')
    B(body, -2.55, 2.55, -.17, .17, 2.55, 2.82, 'stripe')
    B(body, -2.55, 2.55, -.19, -.15, 2.6, 2.77, 'metal')
    B(body, -.28, .28, -.24, .24, 2.4, 2.58, 'metal')
    for dx in (-.06, .06):
        beam(body, (dx, 0, 2.4), (dx, 0, C + .42), .018, .018, 'steel')
    B(body, -.12, .12, -.08, .08, C + .32, C + .44, 'steel')
    # The hull carcass behind: a keel and ribs, a few skin plates still on at one end.
    beam(body, (-2.2, 2.1, .12), (1.7, 2.1, .12), .16, .14, 'metal', minor=False)
    for k, x in enumerate((-2.0, -1.4, -.8, -.2, .4, 1.0, 1.55)):
        r = .85 - abs(x + .2) * .12
        ring_tube(body, (x, 2.1, .12), (1, 0, 0), r, .055, 'paint' if k % 2 else 'steel', seg=10, side=4, arc=(math.pi + .15, TAU - .15))
    for x in (1.1, 1.4):
        obox(body, x, 2.1, .14, .75, .62, .68, 0, 'paint', tilt=0)
    beam(body, (-2.0, 2.1 + .8, .5), (1.55, 2.1 + .8, .5), .06, .06, 'steel')
    # Scrap piles and a container stack.
    for cx, cy in ((-1.95, -1.55), (1.9, -1.7)):
        mound(body, rng, cx, cy, .6, .45, .22, 'scorch', seg=7)
        for i in range(6):
            a = rng.uniform(0, TAU)
            obox(body, cx + math.cos(a) * .3, cy + math.sin(a) * .25, rng.uniform(.12, .25), rng.uniform(.06, .14), .05, .1 + rng.uniform(.05, .3),
                 rng.uniform(0, TAU), rng.choice(('steel', 'paint', 'accent', 'metal')), tilt=rng.uniform(-.7, .7), minor=True)
    container(body, -2.25, .6, Z, math.pi / 2, 'crate_a')
    container(body, -1.8, .6, Z, math.pi / 2, 'crate_b')
    container(body, -2.02, .6, Z + .42, math.pi / 2, 'crate_c')
    lamp_mast(body, 2.55, 2.85, Z, 1.6)
    lamp_mast(body, -2.55, -2.45, Z, 1.3)
    # The hanging load: a salvaged reactor pod with glowing bands (the core).
    core.major.cylinder((0, 0, C), 'x', .3, -.4, .4, 'metal', seg=10)
    for x in (-.24, 0, .24):
        core.minor.cylinder((0, 0, C), 'x', .315, x - .05, x + .05, 'core_glow', seg=10)
    for x in (-.42, .42):
        core.minor.cylinder((0, 0, C), 'x', .2, x - .03, x + .03, 'steel', seg=8)
    B(core, -.06, .06, -.06, .06, C + .28, C + .34, 'steel')
    # Destroyed: the pod fallen and split open under the hook, a scorch and scattered scrap.
    obox(ruin, -.2, -.05, .3, .26, 0, .4, .3, 'metal', tilt=.3)
    obox(ruin, .3, .1, .22, .24, 0, .32, -.4, 'metal', tilt=-.4)
    scorch(ruin, rng, 0, -.2, 1.0)
    wreckage(ruin, rng, 0, -.1, .6, 1.8, 10, embers=3, z=Z)
    if world == 'vesper':
        B(body, -2.55, 2.55, -.17, .17, 2.82, 2.86, 'snow')
        snow_drifts(body, rng, ((-1.95, -1.55, .5, .35, .12), (1.9, -1.7, .45, .35, .12), (-2.4, 2.75, .35, .25, .12)))
    return body, core, ruin


# ----------------------------------------------------------------------------- shield depot
def shield_depot(world):
    """A round generator hall open to the camera under a half-dome of ribs, its glowing generator the target; four
    pylon towers with glowing bands and conduits, an annex and crates."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(61)
    C, R = CORE_HEIGHT['shield-depot'], 1.35
    disc(body, 0, 0, 1.6, -1.0, .1, 'deck', seg=16)
    annulus_wall = lambda r0, r1, z0, z1, mat, seg=16: body.major.loft(
        [[(r * math.cos(TAU * k / seg), r * math.sin(TAU * k / seg), z) for k in range(seg)] for r, z in ((r1, z0), (r1, z1), (r0, z1), (r0, z0))], mat)
    annulus_wall(R - .16, R, .1, .55, 'paint')
    annulus_wall(R - .17, R + .01, .38, .46, 'accent')
    disc(body, 0, 0, R - .16, .1, .14, 'metal', seg=16)
    # The half-dome: ribs over the back half from the rim to an apex behind the generator, a lit crown ring.
    apex = Vector((0, .35, 1.85))
    ribs = []
    for deg in (8, 40, 75, 105, 140, 172):
        a = math.radians(deg)
        base = Vector((R * math.cos(a), R * math.sin(a), .55))
        mid = base * .7 + apex * .3 + Vector((0, 0, .75)) + (base - Vector((0, 0, .55))).normalized() * .25
        ribs.append(curve(base, mid, apex, 6))
        tube(body, ribs[-1], [.08, .075, .07, .065, .06, .06, .06], 'field_glow', seg=5)
    for k in (2, 4):  # latitude rings across the ribs: the dome reads as a lit lattice
        tube(body, [rib[k] for rib in ribs], .045, 'field_glow', seg=4, soft=False)
    ring_tube(body, tuple(apex), (0, 0, 1), .16, .04, 'glow', seg=10, side=4)
    ring_tube(body, (0, 0, .58), (0, 0, 1), R - .08, .03, 'dim_glow', seg=24, side=4)
    # Pylons at the corners with conduits to the hall.
    for px, py in ((-2.25, -1.55), (2.25, -1.55), (-2.25, 1.8), (2.25, 1.8)):
        cyl(body, px, py, .4, -.4, .2, 'metal', seg=10)
        cyl(body, px, py, .3, .2, 1.85, 'paint', seg=10)
        for z in (.7, 1.25):
            cyl(body, px, py, .315, z, z + .12, 'glow', seg=10)
        cyl(body, px, py, .34, 1.85, 1.98, 'metal', seg=10)
        dome(body, px, py, .2, 1.98, .12, 'steel', seg=8, rings=2)
        tube(body, [(px * .82, py * .82, .22), (px * .5, py * .5, .25), (px * (R + .05) / math.hypot(px, py), py * (R + .05) / math.hypot(px, py), .3)],
             .07, 'steel', seg=6)
    # The annex behind and crates at the front-right.
    body.major.box((-1.2, 2.2, -.4), (1.2, 3.0, .75), 'paint', chamfer=.06)
    B(body, -1.22, 1.22, 2.18, 3.02, .75, .82, 'metal')
    for x in (-.7, 0, .7):
        B(body, x - .14, x + .14, 2.16, 2.2, .3, .55, 'glow')
    for x, y, mat in ((1.55, -2.35, 'crate_c'), (2.0, -2.2, 'stripe'), (1.75, -2.3, 'crate_a')):
        obox(body, x, y, .16, .16, 0, .3, .3, mat)
    # The generator: a glowing drum in its cage (the core).
    cyl(core, 0, 0, .45, .14, .32, 'metal', seg=12)
    cyl(core, 0, 0, .36, .32, 1.38, 'core_glow', seg=12)
    for k in range(6):
        a = TAU * k / 6
        B(core, math.cos(a) * .37 - .03, math.cos(a) * .37 + .03, math.sin(a) * .37 - .03, math.sin(a) * .37 + .03, .32, 1.38, 'steel')
    cyl(core, 0, 0, .42, 1.38, 1.48, 'metal', seg=12)
    # Destroyed: the drum burst to a stump, scorch and debris.
    cyl(ruin, 0, 0, .45, .14, .32, 'metal', seg=12)
    for k in range(6):
        a = TAU * k / 6
        B(ruin, math.cos(a) * .37 - .03, math.cos(a) * .37 + .03, math.sin(a) * .37 - .03, math.sin(a) * .37 + .03, .32, .5 + rng.uniform(0, .4), 'steel')
    scorch(ruin, rng, 0, -.5, 1.1)
    wreckage(ruin, rng, 0, -.3, .5, 1.6, 10, embers=3, z=.1)
    if world == 'vesper':
        for px, py in ((-2.25, -1.55), (2.25, -1.55), (-2.25, 1.8), (2.25, 1.8)):
            dome(body, px, py, .3, 1.98, .08, 'snow', seg=8, rings=2)
        B(body, -1.2, 1.2, 2.2, 3.0, .82, .86, 'snow')
    return body, core, ruin


# ----------------------------------------------------------------------------- relay station
def relay_station(world):
    """A big dish on its pedestal, turned three-quarters to the camera (user, 30 October: "turn the satelite dish of the
    relay station so its better visible"), its feed horn the target; a lattice mast with a beacon, equipment huts and cable
    trays. On Amnion the brood has overrun it."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(71)
    C = CORE_HEIGHT['relay-station']
    slab(body, -2.6, 2.85, -2.6, 2.95, .06, 'deck', floor=-1.0, lip=None)
    # The dish's axis: 38 degrees up, yawed 63 degrees toward the map's west (-x) from facing the camera, so it sits about
    # 45 degrees off the camera's view and the bowl reads as an ellipse with depth (rim, back shell, struts, horn). Sites are
    # not mirrored for the west side; from either side the camera sees it three-quarters. It turns about the feed horn.
    elev, yaw = math.radians(38), math.radians(63)
    axis = Vector((-math.cos(elev) * math.sin(yaw), -math.cos(elev) * math.cos(yaw), math.sin(elev))).normalized()
    feed = Vector((0, 0, C))
    hub = feed - axis * 1.05
    u = Vector((0, 0, 1)).cross(axis).normalized(); v = axis.cross(u).normalized()
    # Pedestal, turntable and yoke behind the hub (away from the bowl's opening).
    back = Vector((-axis.x, -axis.y, 0)).normalized()
    ped = hub + back * .45
    ped_yaw = math.atan2(back.y, back.x)
    obox(body, ped.x, ped.y, .55, .55, -.4, .65, ped_yaw, 'paint')
    obox(body, ped.x, ped.y, .56, .56, .45, .53, ped_yaw, 'stripe', minor=True)
    cyl(body, ped.x, ped.y, .5, .65, .85, 'metal', seg=14)
    side = Vector((-back.y, back.x, 0))
    for sk in (-.3, .3):
        beam(body, tuple(ped + side * sk + Vector((0, 0, .85 - ped.z))), tuple(hub + side * sk), .12, .12, 'steel', minor=False)
    # The dish: a paraboloid shell (front and back surfaces), its rim and three struts to the feed.
    rings, seg, f = (.12, .45, .8, 1.1, 1.38), 16, 1.0
    point = lambda r, k, off=0.0: tuple(hub + (u * math.cos(TAU * k / seg) + v * math.sin(TAU * k / seg)) * r + axis * (r * r / (4 * f) + off))
    front = [[point(r, k) for k in range(seg)] for r in rings]
    back = [[point(r, k, -.07) for k in range(seg)] for r in rings[::-1]]
    body.major.loft(front + back, 'paint')
    ring_tube(body, tuple(hub + axis * (rings[-1] ** 2 / (4 * f))), tuple(axis), rings[-1] + .02, .04, 'accent', seg=20, side=4)
    for k in (4, 9, 14):
        beam(body, point(rings[-1] - .05, k), tuple(feed - axis * .2), .035, .035, 'steel')
    tube(body, [hub - axis * .4, hub - axis * .03], .16, 'metal', seg=8, soft=False)  # the axle behind the bowl
    # The lattice mast with its beacon, back-right.
    mx, my = 2.15, 1.75
    for sx in (-1, 1):
        for sy in (-1, 1):
            beam(body, (mx + sx * .38, my + sy * .38, 0), (mx + sx * .1, my + sy * .1, 3.0), .06, .06, 'steel')
    for z in (.5, 1.1, 1.7, 2.3):
        k = 1 - z / 3.0 * .74
        for (ax, ay), (bx, by) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            beam(body, (mx + ax * .38 * k, my + ay * .38 * k, z), (mx + bx * .38 * k, my + by * .38 * k, z), .035, .035, 'stripe')
    cyl(body, mx, my, .07, 3.0, 3.1, 'glow', seg=8)
    # Equipment huts and a cable tray to the pedestal.
    body.major.box((-2.4, -1.5, -.4), (-1.3, -.55, .7), 'paint', chamfer=.06)
    B(body, -2.42, -1.28, -1.52, -.53, .7, .76, 'metal')
    B(body, -2.0, -1.7, -1.53, -1.5, .1, .55, 'metal')
    B(body, -1.62, -1.38, -1.53, -1.5, .4, .5, 'glow')
    body.major.box((1.3, -2.3, -.4), (2.1, -1.65, .55), 'paint', chamfer=.05)
    B(body, 1.5, 1.9, -2.33, -2.3, .2, .3, 'glow')
    beam(body, (-1.3, -1.0, .2), (ped.x - .45, ped.y - .3, .2), .14, .05, 'metal')
    if world == 'amnion':
        # Overrun: the brood's bone arches over the pedestal, chitin on the huts, resin and eggs.
        brood_growths(body, rng, arches=(((-1.3, 1.6, 0), (1.3, 1.6, 0), 1.4), ((-1.6, -.2, 0), (-1.5, 1.4, 0), .9),
                                         ((1.3, -1.0, 0), (2.6, .9, 0), 1.0)),
                      plates=((-1.85, -1.0, .72, .32), (1.7, -1.95, .55, .26), (ped.x, ped.y, .82, .3), (1.2, -.4, .06, .34),
                              (-2.2, 1.9, .06, .3), (-.1, -2.3, .06, .28)),
                      resin=((.9, -.9, .06, .2), (-.8, 2.3, .06, .22), (2.1, .6, .06, .18), (-1.3, -2.0, .06, .26), (2.3, 2.4, .06, .24)),
                      eggs=((-2.1, .6, 5), (1.0, 2.5, 4), (-.9, -2.2, 3), (2.35, -2.4, 4), (-2.4, -1.9, 3)),
                      spikes=((-2.4, 2.4, .9, (-.2, .2)), (2.5, -.6, .8, (.25, 0)), (1.8, 2.7, .85, (.15, .2)), (-2.65, -.6, .75, (-.2, 0))))
    elif world == 'vesper':
        B(body, -2.4, -1.3, -1.5, -.55, .76, .8, 'snow')
        B(body, 1.3, 2.1, -2.3, -1.65, .55, .59, 'snow')
        snow_drifts(body, rng, ((-.4, 2.6, .5, .25, .1), (2.4, -2.3, .3, .25, .1)))
    # The feed horn (the core): a glowing horn at the dish's focus, its collar.
    tip, back_ = feed + axis * .2, feed - axis * .2
    tube(core, [back_, feed, tip], [.13, .17, .22], 'core_glow', seg=8, soft=False)
    tube(core, [back_ - axis * .06, back_ + axis * .06], .16, 'metal', seg=8, soft=False)
    # Destroyed: the horn blown off, its strut ends bent; scorch and debris under it.
    tube(ruin, [back_ - axis * .06, back_ + axis * .08], .15, 'metal', seg=8, soft=False)
    for k in range(3):
        shard(ruin, tuple(back_ + Vector((rng.uniform(-.1, .1), rng.uniform(-.1, .1), .02))), .18, .05, 'steel', rng, lean=.7)
    scorch(ruin, rng, 0, -.5, .9)
    wreckage(ruin, rng, 0, -.3, .5, 1.6, 10, embers=3, z=.06)
    return body, core, ruin


# ----------------------------------------------------------------------------- freight terminal
def freight_terminal(world):
    """A container apron with a freighter parked on its pad, a gantry over the stacks and light masts; the glowing
    weapons container on its trestles is the target. On Amnion the brood has overrun it."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(81)
    Z, C = .06, CORE_HEIGHT['freight-terminal']
    slab(body, -2.85, 2.85, -2.9, 3.2, Z, 'deck', floor=-1.0)
    for x0, x1, y0, y1 in ((-2.75, 2.75, -2.3, -2.25), (-2.75, -2.7, -2.3, 3.1), (.9, .95, -2.3, 3.1)):
        B(body, x0, x1, y0, y1, Z, Z + .006, 'stripe')
    ring_tube(body, (-.6, 1.75, Z), (0, 0, 1), 1.25, .03, 'stripe', seg=24, side=3)
    # The freighter on its pad: a boxy hull, a tapered nose, engines, struts.
    hx0, hx1, hy, hz0, hz1 = -2.35, 1.1, 1.75, .3, 1.1
    sec = lambda x, w, z0, z1: [(x, hy - w, z0), (x, hy + w, z0), (x, hy + w * .8, z1), (x, hy - w * .8, z1)]
    body.major.loft([sec(hx0, .5, hz0, hz1), sec(-1.2, .55, hz0 - .05, hz1 + .05), sec(.4, .55, hz0 - .05, hz1 + .05), sec(hx1, .3, hz0 + .1, hz1 - .25),
                     sec(hx1 + .45, .08, hz0 + .3, hz1 - .5)], 'paint')
    for x in (-1.55, -.55, .35):
        B(body, x - .05, x + .05, hy - .57, hy + .57, hz0 - .04, hz1 + .07, 'stripe')
    for k in range(4):
        B(body, -1.3 + k * .4, -1.1 + k * .4, hy - .58, hy - .55, .75, .88, 'glass')
    B(body, hx1 - .1, hx1 + .25, hy - .3, hy - .26, .72, .85, 'glow')
    for sy in (-.28, .28):
        tube(body, [(hx0 + .05, hy + sy, .65), (hx0 - .3, hy + sy, .65)], [.2, .23], 'metal', seg=8, soft=False)
    for x, y in ((-1.8, hy - .45), (-1.8, hy + .45), (.6, hy - .4), (.6, hy + .4)):
        beam(body, (x, y, hz0 + .05), (x, y + (y - hy) * .3, Z), .07, .07, 'metal')
    # Container stacks, the gantry over the right ones, light masts.
    for x, y, z, mat in ((-2.1, -2.0, Z, 'crate_a'), (-2.1, -2.0, Z + .42, 'crate_b'), (-1.2, -2.0, Z, 'crate_c'), (-1.2, -1.55, Z, 'crate_b'),
                         (1.8, -2.0, Z, 'crate_b'), (1.8, -1.55, Z, 'crate_a'), (1.8, -2.0, Z + .42, 'crate_a'), (1.8, -1.55, Z + .42, 'crate_c'),
                         (1.8, -1.78, Z + .84, 'crate_b')):
        container(body, x, y, z, 0, mat)
    for k, (x, y, z, mat) in enumerate(((-2.3, -1.2, Z, 'crate_a'), (-2.3, -.7, Z, 'crate_b'), (-2.3, -1.2, Z + .42, 'crate_c'),
                                         (2.15, .3, Z, 'crate_c'), (2.15, .8, Z, 'crate_a'),
                                         (2.15, .3, Z + .42, 'crate_b'), (2.15, .8, Z + .42, 'crate_c'), (2.15, .55, Z + .84, 'crate_a'))):
        container(body, x, y, z, math.pi / 2, mat)
    for sx in (1.55, 2.75):
        for sy in (-.35, 1.45):
            beam(body, (sx, sy, Z), (sx, sy, 1.95), .1, .1, 'stripe', minor=False)
        beam(body, (sx, -.35, 1.95), (sx, 1.45, 1.95), .12, .14, 'stripe', minor=False)
    B(body, 1.5, 2.8, .45, .65, 1.9, 2.05, 'metal')
    lamp_mast(body, -2.65, -2.7, Z, 2.2)
    lamp_mast(body, 2.65, -2.7, Z, 2.2)
    obox(body, .95, -1.35, .16, .12, Z, Z + .22, .4, 'stripe')
    beam(body, (1.1, -1.25, Z + .05), (1.1, -1.25, Z + .5), .03, .03, 'steel')
    # The weapons container on its trestles (body) is lit and armoured (the core).
    for x in (-.32, .32):
        B(body, x - .06, x + .06, -.3, .3, Z, .6, 'metal')
        B(body, x - .1, x + .1, -.32, .32, .56, .62, 'steel')
    core.major.box((-.48, -.26, .62), (.48, .26, 1.1), 'metal', chamfer=.03)
    for x in (-.32, 0, .32):
        B(core, x - .1, x + .1, -.275, -.255, .7, 1.02, 'core_glow')
        B(core, x - .1, x + .1, .255, .275, .7, 1.02, 'core_glow')
    B(core, -.5, .5, -.28, .28, 1.08, 1.12, 'stripe')
    for x in (-.49, .49):
        B(core, x - .01, x + .01, -.2, .2, .7, 1.0, 'core_glow')
    # Destroyed: the container burst open, crates thrown round, scorch.
    obox(ruin, -.2, 0, .3, .26, .62, .7, .2, 'metal', tilt=.4)
    obox(ruin, .35, -.1, .25, .24, .62, .68, -.5, 'metal', tilt=-.5)
    scorch(ruin, rng, 0, -.6, 1.0)
    wreckage(ruin, rng, 0, -.3, .6, 1.8, 10, embers=3, z=Z)
    for k in range(3):
        a = rng.uniform(math.pi * 1.1, math.pi * 1.9)
        container(ruin, math.cos(a) * 1.3, math.sin(a) * 1.3 - .3, Z, rng.uniform(0, TAU), rng.choice(('crate_a', 'crate_b')), length=.5, width=.3, height=.28)
    if world == 'amnion':
        # Overrun (stronger, 30 October): bone arches over the freighter and across the yard, chitin crusting the stacks
        # and the apron, resin pools, egg clutches and spikes all round.
        brood_growths(body, rng, arches=(((-1.5, 1.0, 0), (-1.5, 2.6, 0), 1.3), ((-.4, 1.0, 0), (-.4, 2.6, 0), 1.35),
                                         ((-2.6, -.35, 0), (-.95, -.35, 0), 1.0), ((1.0, 1.35, 0), (2.7, 1.35, 0), 1.25)),
                      plates=((-2.3, -1.0, .92, .3), (2.15, .55, 1.3, .28), (-1.0, 1.75, 1.15, .32), (1.8, -1.78, 1.32, .3),
                              (-2.1, -2.0, .92, .26), (1.15, -.65, .06, .38), (-1.65, .55, .06, .32), (.3, 2.75, .06, .3)),
                      resin=((-1.6, -.5, .06, .22), (1.4, -1.9, .06, .2), (2.3, 2.3, .06, .18), (-.3, -2.45, .06, .3), (2.45, -.55, .06, .26),
                             (-2.5, 1.5, .06, .25)),
                      eggs=((-2.0, 2.6, 5), (1.3, 2.6, 4), (-1.2, -2.4, 3), (2.45, -2.55, 4), (.9, 2.85, 5)),
                      spikes=((2.55, -1.6, .85, (.25, 0)), (-2.55, .3, .8, (-.25, .1)), (-.9, 2.95, .9, (0, .2)), (2.65, 1.95, .8, (.2, .1)),
                              (-2.65, -2.65, .75, (-.2, -.2))))
    elif world == 'vesper':
        for x, y, z in ((-2.3, -1.2, Z + .84), (2.15, .55, Z + 1.26), (-2.3, -.7, Z + .42)):
            obox(body, x, y, .2, .44, z, z + .04, math.pi / 2, 'snow', minor=True)
        body.major.loft([sec(-1.2, .5, hz1 + .05, hz1 + .1), sec(.4, .5, hz1 + .05, hz1 + .1)], 'snow')
    return body, core, ruin


# ----------------------------------------------------------------------------- Umbral platforms
def dais(h, rng, r_inner, r_outer, top_inner, top_outer, blocks, ruined, stone, dark, seam, missing=(), sunk=(), floor=-1.1):
    """A round stepped dais: an inner disc with a glowing ring inlay, and an outer ring of separate blocks (a ruin
    misses some and has others sunk)."""
    disc(h, 0, 0, r_inner, floor, top_inner, dark, seg=16)
    for a in range(16):
        if ruined and a in (3, 4, 11):
            continue
        a0, a1 = TAU * a / 16, TAU * (a + 1) / 16
        rr0, rr1 = r_inner * .62, r_inner * .69
        quad = [(rr0 * math.cos(a0), rr0 * math.sin(a0)), (rr1 * math.cos(a0), rr1 * math.sin(a0)), (rr1 * math.cos(a1), rr1 * math.sin(a1)), (rr0 * math.cos(a1), rr0 * math.sin(a1))]
        h.minor.wedge(quad, top_inner, top_inner + .015, seam)
    for k in range(blocks):
        if k in missing:
            continue
        a0, a1 = TAU * k / blocks + .025, TAU * (k + 1) / blocks - .025
        top = top_outer * rng.uniform(.7, 1.25) - (.14 if k in sunk else 0)
        r1 = r_outer * rng.uniform(.93, 1.0)
        pts = lambda r: [(r * math.cos(a0), r * math.sin(a0)), (r * math.cos((a0 + a1) / 2), r * math.sin((a0 + a1) / 2)), (r * math.cos(a1), r * math.sin(a1))]
        loop = lambda z, e=0.0: [(x * (1 + e / r1), y * (1 + e / r1), z) for x, y in pts(r1)] + [(x, y, z) for x, y in pts(r_inner + .03)[::-1]]
        h.major.loft([loop(floor, .1), loop(top)], stone if k % 3 else dark)


def prism_reactor(world):
    """A big faceted crystal floating high over a pedestal (the target), held by a beam, over a broken crown of sharp
    blades leaning out round a stepped block dais (integrator, 30 October: "a broken crown with a crystal over it, not a
    saucer": the blades stay under the crystal so the gap reads from the game camera). On Nacre a pale overgrown ruin:
    snapped and fallen blades, a teal crystal."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(31)
    ruined, C = world == 'nacre', CORE_HEIGHT['prism-reactor']
    stone, dark = ('stone', 'stone_dark') if ruined else ('obsidian', 'stone')
    seam = 'dim_glow' if ruined else 'glow'
    dais(body, rng, 1.05, 1.85, .3, .2, 14, ruined, 'stone_dark' if ruined else 'stone', 'stone_dark', seam,
         missing=(2, 6, 11) if ruined else (4, 10), sunk=(5, 9) if ruined else ())
    for k in range(4):  # a cross of seams on the inner disc
        a = math.pi / 4 + k * math.pi / 2
        if ruined and k == 1:
            continue
        beam(body, (math.cos(a) * .55, math.sin(a) * .55, .3), (math.cos(a) * 1.0, math.sin(a) * 1.0, .3), .05, .03, seam)
    cyl(body, 0, 0, .55, .3, .45, dark, seg=12)
    cyl(body, 0, 0, .42, .45, .58, stone, seg=12)
    disc(body, 0, 0, .3, .58, .6, seam, seg=12)
    tube(body, [(0, 0, .6), (0, 0, 1.0), (0, 0, 1.38)], [.1, .07, .035], 'core_glow', seg=6)
    # The crown: seven tall blades on a ring of nine (two gaps), leaning out; the back ones tallest, the front ones low
    # so the crystal floats clear over them from the camera.
    crown = ((90, 1.75), (130, 1.6), (50, 1.6), (170, 1.35), (10, 1.35), (250, 1.0), (290, 1.0))
    for i, (deg, height) in enumerate(crown):
        a = math.radians(deg)
        u = Vector((math.cos(a), math.sin(a), 0))
        base, bulge, tip = u * 1.45 + Vector((0, 0, .05)), u * 1.62 + Vector((0, 0, height * .55)), u * 1.95 + Vector((0, 0, height))
        width = .32 if height > 1.3 else .26
        if ruined and i in (0, 4):  # snapped: a jagged stump
            tip = base + (bulge - base) * 1.1
            blade(body, base, tip, base + (bulge - base) * .55, width, 'stone', thin=.4, steps=4, phase=a)
            for k in range(3):
                shard(body, tuple(tip + Vector((rng.uniform(-.08, .08), rng.uniform(-.08, .08), -.08))), rng.uniform(.12, .22), .08, 'stone', rng, lean=.4)
            continue
        if ruined and i == 2:  # fallen beside its socket
            side = Vector((-math.sin(a), math.cos(a), 0))
            lie = u * 1.75 + Vector((0, 0, .15))
            blade(body, lie, lie - side * 1.2 + u * .25 + Vector((0, 0, -.05)), lie - side * .6 + u * .3 + Vector((0, 0, .1)), width, 'stone', thin=.4, phase=a)
            cyl(body, base.x, base.y, .22, -.3, .3, 'stone', seg=6)
            continue
        blade(body, base, tip, bulge, width, 'stone' if ruined else 'obsidian', thin=.4, phase=a)
        inner = [p - u * .1 for p in curve(base, bulge, tip, 6)][1:5]
        tube(body, inner, .03, seam, seg=4)
    # The crystal (the core): a big faceted bipyramid floating high over the crown, a bright heart inside its front, and
    # three satellite shards (it turns in the game).
    crystal(core, (0, 0, C), .78, .62, 'prism_glow', seg=6, waist=0, bottom=.62, tip=.03)
    crystal(core, (0, -.06, C), .42, .3, 'core_glow', seg=6, waist=0, bottom=.32, tip=.05, phase=.5)
    for deg, r, z, size in ((20, 1.0, 1.75, .12), (160, .95, 2.3, .11), (95, .9, 2.65, .1)):
        a = math.radians(deg)
        crystal(core, (math.cos(a) * r, math.sin(a) * r, z), size * 2.2, size, 'core_glow', seg=4, waist=0, bottom=size * 1.4)
    # Destroyed: the crystal fallen and shattered across the pedestal, a scorch and thrown blocks.
    for k in range(7):
        a = TAU * k / 7 + rng.uniform(-.3, .3)
        shard(ruin, (math.cos(a) * .25, math.sin(a) * .25, .55), rng.uniform(.2, .42), rng.uniform(.08, .13), 'stone' if ruined else 'obsidian', rng, lean=.9)
    scorch(ruin, rng, 0, -.55, .9)
    wreckage(ruin, rng, 0, -.2, .9, 2.0, 9, mats=('stone_dark', 'stone', 'scorch'), embers=2, z=.3)
    if ruined:
        overgrowth(body, rng, ((-1.85, .9, .22, .4), (1.95, -.4, .22, .34), (.8, 1.9, .24, .36), (-1.2, -1.75, .2, .32), (0, 1.0, .33, .3),
                               (-.9, .2, .33, .28), (1.2, .9, .3, .3)),
                   puddles=((-.9, 2.3, .4), (2.3, .95, .38), (-2.35, -.9, .38)))
    else:
        obsidian_shards(body, rng, ((-2.0, 2.15, .7), (2.1, 2.05, .65)))
    return body, core, ruin


# ----------------------------------------------------------------------------- sealed vault
def sealed_vault(world):
    """A stepped vault behind a terrace, its door lit, sealed by three crystals on monoliths (the three seal cores, each
    drawn at its own seal). Umbra: obsidian with violet seams; Nacre: a pale overgrown ruin with teal crystals."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(91)
    ruined, C = world == 'nacre', CORE_HEIGHT['sealed-vault']
    stone, dark = ('stone', 'stone_dark') if ruined else ('obsidian', 'stone')
    seam = 'dim_glow' if ruined else 'glow'
    # Terrace in two steps, its front stairs.
    body.major.box((-2.7, -2.0, -1.1), (2.7, 2.9, .14), dark, chamfer=.3)
    body.major.box((-2.2, -1.4, .14), (2.2, 2.7, .3), stone, chamfer=.25)
    for k in range(3):
        B(body, -.8, .8, -2.05 - k * .22, -1.83 - k * .22, -.1, .14 - k * .06, stone)
    # The vault: stepped tiers behind, a domed cap, a recessed door to the camera with a lit frame.
    vy = 2.15
    for k, (half, z0, z1) in enumerate(((1.0, .3, .85), (.78, .85, 1.32), (.56, 1.32, 1.72))):
        missing = ruined and k == 2
        if missing:
            body.major.box((-half, vy - half, z0), (half * .2, vy + half, z1 - .15), stone, chamfer=.06)
            continue
        body.major.box((-half, vy - half, z0), (half, vy + half, z1), stone if k % 2 == 0 else dark, chamfer=.06)
        B(body, -half - .01, half + .01, vy - half - .02, vy - half + .02, z1 - .05, z1 - .02, seam)
    if not ruined:
        dome(body, 0, vy, .42, 1.72, .32, dark, seg=10, rings=3)
        crystal(body, (0, vy, 2.0), .6, .1, 'glow', seg=4, waist=.3)
    B(body, -.32, .32, vy - 1.05, vy - .98, .3, 1.0, 'metal')
    B(body, -.4, .4, vy - 1.07, vy - 1.02, .98, 1.06, seam)
    for x in (-.38, .38):
        B(body, x - .04, x + .04, vy - 1.07, vy - 1.02, .3, 1.0, seam)
    # The monoliths, one under each seal, with glowing runes on their faces and a cradle on top.
    for sx, sy in VAULT_SEALS:
        if sy > 0:  # the third seal rests on the vault's first tier, before the second: the vault is its stone
            B(body, sx - .3, sx + .3, sy - .25, sy + .25, .85, .92, dark)
            for x0, x1, z0, z1 in ((sx - .4, sx - .34, .9, 1.95), (sx + .34, sx + .4, .9, 1.95), (sx - .4, sx + .4, 1.89, 1.95)):
                B(body, x0, x1, vy - .8, vy - .77, z0, z1, seam)  # a lit frame round the seal
            continue
        my = sy + .3
        tall = 1.75 if ruined and sx > 0 else 2.3  # one Nacre stone broken off
        body.major.wedge([(sx - .3, my - .2), (sx + .3, my - .2), (sx + .3, my + .2), (sx - .3, my + .2)], -.4, tall, stone,
                         top=[(sx - .16, my - .11), (sx + .16, my - .11), (sx + .16, my + .11), (sx - .16, my + .11)])
        for z in (.4, .7, 1.95):
            if z < tall - .15:
                B(body, sx - .08, sx + .08, my - .21, my - .19, z, z + .14, seam)
        B(body, sx - .3, sx + .3, sy - .28, sy + .28, -.2, .2, dark)  # the seal's plinth at the stone's foot
        for px in (-.2, .2):
            blade(body, (sx + px, sy + .05, .2), (sx + px * 1.25, sy, 1.15), (sx + px * 1.35, sy, .7), .06, dark, thin=.5, steps=3)
    # A seal (the core, drawn at each seal): a big crystal held in front of its standing stone.
    crystal(core, (0, 0, 1.03), .86, .27, 'prism_glow', seg=5, waist=.45)
    crystal(core, (0, -.06, 1.25), .42, .12, 'core_glow', seg=5, waist=.45, phase=.6)
    # Destroyed seal: shards on the monolith top, a scorch at its foot.
    for k in range(4):
        shard(ruin, (rng.uniform(-.1, .1), rng.uniform(-.08, .08), 1.08), rng.uniform(.1, .2), .06, stone, rng, lean=.7)
    scorch(ruin, rng, 0, -.35, .55)
    wreckage(ruin, rng, 0, -.2, .35, .9, 5, mats=(stone, dark, 'scorch'), size=.1, embers=1, z=.3)
    if ruined:
        overgrowth(body, rng, ((-1.6, 1.4, .3, .4), (1.7, 1.2, .3, .38), (-.9, -1.2, .3, .3), (1.0, -1.25, .3, .3), (0, 2.15, 1.32, .35),
                               (-2.2, -.6, .14, .3), (2.2, .2, .14, .32)),
                   puddles=((-2.3, 2.4, .35), (2.4, -1.6, .35)))
        for x, y in ((-.7, vy - .5), (.8, vy + .4)):
            obox(body, x, y, .22, .18, .85, 1.1, rng.uniform(0, 1), stone, tilt=.4)
    else:
        obsidian_shards(body, rng, ((-2.35, 2.4, .7), (2.4, 2.45, .7)))
    return body, core, ruin


# ----------------------------------------------------------------------------- gate ring
def gate_ring(world):
    """A tall ring of blocky segments rising from a stepped dais, a glowing membrane in it (the target), spires at the
    back corners. Nacre: a pale broken ruin; Amnion: crusted with the brood's bone, chitin and resin."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(101)
    ruined, crusted, C = world == 'nacre', world == 'amnion', CORE_HEIGHT['gate-ring']
    stone, dark = ('stone', 'stone_dark') if ruined else ('obsidian', 'stone')
    seam = 'dim_glow' if ruined else 'glow'
    body.major.box((-2.6, -2.3, -1.1), (2.6, 2.6, .18), dark, chamfer=.5)
    body.major.box((-1.9, -1.4, .18), (1.9, 1.9, .4), stone, chamfer=.4)
    for k in range(3):
        B(body, -.9, .9, -2.35 - k * .22, -2.13 - k * .22, -.1, .18 - k * .07, dark)
    for x in (-1.5, 1.5):
        beam(body, (x, -1.4, .41), (x, 1.9, .41), .05, .02, seam)
    # The ring: 18 segments around a tilted axis (leaning back toward the camera's view), a glowing inner rim.
    tilt = math.radians(28)
    axis = Vector((0, -math.cos(tilt), math.sin(tilt)))
    u, v = Vector((1, 0, 0)), axis.cross(Vector((1, 0, 0))).normalized()
    centre, R0, R1, depth = Vector((0, 0, C)), 1.02, 1.38, .34
    at = lambda r, a, off: tuple(centre + (u * math.cos(a) + v * math.sin(a)) * r + axis * off)
    gone = {2, 3, 4} if ruined else set()
    for k in range(18):
        if k in gone:
            continue
        a0, a1 = TAU * k / 18 + .02, TAU * (k + 1) / 18 - .02
        quad = lambda off: [at(R0, a0, off), at(R1, a0, off), at(R1, a1, off), at(R0, a1, off)]
        body.major.loft([quad(-depth / 2), quad(depth / 2)], stone if k % 2 else dark)
        if k % 3 == 0:
            body.minor.loft([[at(R1 + .02, a0 + .05, o), at(R1 + .1, (a0 + a1) / 2, o), at(R1 + .02, a1 - .05, o)] for o in (-.1, .1)], seam)
    ring_tube(body, tuple(centre), tuple(axis), R0 - .02, .045, seam, seg=24, side=4, arc=(0, TAU) if not ruined else (TAU * 5 / 18, TAU))
    # Two spires at the back corners, a pair of braziers at the stairs.
    for sx in (-1.95, 1.95):
        h_ = 2.4 if ruined and sx > 0 else 2.95
        body.major.loft([[(sx + dx * w, 2.0 + dy * w, z) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))] for w, z in ((.34, .18), (.22, h_ * .6), (.02, h_))],
                        dark if not ruined else stone)
        beam(body, (sx, 2.0 - .3, .4), (sx, 2.0 - .14, h_ * .7), .04, .02, seam)
    for sx in (-1.1, 1.1):
        cyl(body, sx, -1.85, .14, .1, .55, dark, seg=6)
        blob(body, (sx, -1.85, .6), .1, .1, .08, 'ember_glow' if crusted else seam, seg=6, rings=4)
    # The membrane (the core): a glowing disc in the ring and a darker swirl over it.
    n = 16
    core.minor.loft([[at(R0 - .04, TAU * i / n, o) for i in range(n)] for o in (-.025, .025)], 'core_glow')
    for k in range(3):
        a0 = TAU * k / 3
        pts = [Vector(at((R0 - .1) * (1 - t * .9), a0 + t * 2.6, .035)) for t in (0, .25, .5, .75, 1.0)]
        tube(core, pts, [.05, .045, .04, .03, .015], 'dim_glow' if not crusted else 'alt_glow', seg=4)
    # Destroyed: the membrane torn to dark shards, a scorch under the ring, thrown segments.
    for k in range(5):
        a = TAU * k / 5 + rng.uniform(-.3, .3)
        shard(ruin, (math.cos(a) * .5, -.2 + math.sin(a) * .3, .42), rng.uniform(.15, .3), .08, dark, rng, lean=.9)
    scorch(ruin, rng, 0, -.4, 1.0)
    wreckage(ruin, rng, 0, -.4, .7, 1.8, 9, mats=(dark, stone, 'scorch'), embers=2, z=.4)
    if ruined:
        for k, (x, y) in enumerate(((1.1, -.6), (1.55, .3))):
            obox(body, x, y, .2, .16, .4, .62, rng.uniform(0, 1), stone, tilt=.5)
        overgrowth(body, rng, ((-1.5, -.9, .4, .38), (1.4, 1.3, .4, .36), (-1.2, 1.5, .4, .32), (2.2, -1.4, .18, .3), (-2.2, .8, .18, .32)),
                   puddles=((-2.3, -1.9, .35), (2.3, 2.4, .3)))
    elif crusted:
        brood_growths(body, rng, arches=(((-1.7, -1.2, .4), (-1.7, 1.6, .4), 1.1), ((1.7, -1.2, .4), (1.7, 1.6, .4), 1.0)),
                      plates=((-.9, -.2, 2.6, .3), (1.0, -.1, 2.5, .28), (-1.35, .1, 1.1, .26), (1.35, .2, 1.3, .24)),
                      resin=((-.7, -1.1, .42, .2), (.9, 1.2, .42, .22), (-2.2, 2.2, .2, .2)),
                      eggs=((-2.0, -1.6, 4), (2.0, -1.5, 5), (0, 2.3, 4)),
                      spikes=((-2.4, .6, .9, (-.2, .1)), (2.4, .8, .85, (.2, .1))))
    else:
        obsidian_shards(body, rng, ((-2.45, -1.9, .7), (2.45, -1.7, .65)))
    return body, core, ruin


# ----------------------------------------------------------------------------- dark spaceport
def dark_spaceport(world):
    """A cross-shaped stepped landing platform with a tall black spire, the crystal set in its face the target;
    landing pads on the arms, curved blades at the corners. Nacre: a broken pale ruin, the spire snapped."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(111)
    ruined, C = world == 'nacre', CORE_HEIGHT['dark-spaceport']
    stone, dark = ('stone', 'stone_dark') if ruined else ('obsidian', 'stone')
    seam = 'dim_glow' if ruined else 'glow'
    body.major.box((-2.95, -.7, -1.1), (2.95, .7, .2), dark, chamfer=.15)
    body.major.box((-.7, -3.0, -1.1), (.7, 3.1, .2), dark, chamfer=.15)
    body.major.box((-1.25, -1.25, .2), (1.25, 1.25, .42), stone, chamfer=.3)
    for sgn in (-1, 1):
        beam(body, (sgn * 1.3, 0, .21), (sgn * 2.85, 0, .21), .06, .02, seam)
    beam(body, (0, 1.3, .21), (0, 3.0, .21), .06, .02, seam)
    for k in range(3):
        B(body, -.6, .6, -3.0 + k * .25, -2.75 + k * .25, -.1, .2 - (2 - k) * .06 + .06, stone)
    for x, y in ((-2.35, 0), (2.35, 0), (0, 2.55)):
        cyl(body, x, y, .5, .2, .26, stone, seg=12)
        ring_tube(body, (x, y, .27), (0, 0, 1), .42, .03, seam, seg=14, side=3)
    # The spire behind the crystal: a tall square pyramid with a glowing line up its face (Nacre: snapped).
    sy, top = .55, (2.35 if ruined else 3.2)
    body.major.loft([[(dx * w, sy + dy * w, z) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))] for w, z in ((.75, .42), (.5, 1.4), (.06 if not ruined else .3, top))],
                    'obsidian' if not ruined else stone)
    if ruined:
        for k in range(4):
            shard(body, (rng.uniform(-.2, .2), sy + rng.uniform(-.2, .2), top - .05), rng.uniform(.15, .3), .1, stone, rng, lean=.5)
        obox(body, 1.6, 1.4, .3, .2, .2, .55, .7, stone, tilt=.6)
    beam(body, (0, sy - .74, .45), (0, sy - .06 if not ruined else sy - .32, top - .1), .05, .02, seam)
    for sx in (-.32, .32):
        blade(body, (sx, -.05, 1.45), (sx * 1.2, -.12, 2.3), (sx * 1.6, -.15, 1.9), .07, dark, thin=.5, steps=3)
    # Curved blades at the four corners, taller at the back.
    for sx, sy_, height in ((-2.1, -1.95, 1.7), (2.1, -1.95, 1.7), (-2.0, 2.0, 2.6), (2.0, 2.0, 2.6)):
        if ruined and sx > 0 and sy_ < 0:
            continue
        u = Vector((sx, sy_, 0)).normalized()
        base = Vector((sx, sy_, -.3))
        blade(body, base, base - u * .55 + Vector((0, 0, height)), base + u * .2 + Vector((0, 0, height * .55)), .3, 'stone' if ruined else 'obsidian', thin=.32, phase=math.atan2(u.y, u.x))
    # The crystal (the core), set in the spire's face.
    crystal(core, (0, 0, C - .45), .95, .36, 'prism_glow', seg=6, waist=.45)
    crystal(core, (0, -.12, C - .25), .5, .18, 'core_glow', seg=6, waist=.45, phase=.5)
    # Destroyed: the crystal shattered at the spire's foot, a scorch and thrown slabs.
    for k in range(5):
        a = TAU * k / 5
        shard(ruin, (math.cos(a) * .3, -.2 + math.sin(a) * .2, .42), rng.uniform(.15, .3), .08, 'obsidian' if not ruined else stone, rng, lean=.8)
    scorch(ruin, rng, 0, -.6, 1.0)
    wreckage(ruin, rng, 0, -.4, .7, 1.9, 9, mats=(dark, stone, 'scorch'), embers=2, z=.42)
    if ruined:
        overgrowth(body, rng, ((-2.3, .3, .2, .4), (1.4, -1.0, .42, .34), (-.9, 1.0, .42, .3), (.3, 2.6, .26, .32), (-.4, -2.4, .2, .3)),
                   puddles=((-2.2, -1.9, .4), (2.2, 2.3, .35), (2.3, -1.2, .3)))
    return body, core, ruin


# ----------------------------------------------------------------------------- brood hive
def brood_hive(world):
    """A brood ribcage arching over a glowing heart-sac (the target): a fleshy mound, a dorsal spine and rib pairs,
    tusks at the mouth, segmented chitin tubes, egg clusters and bone spikes."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(41)
    C = CORE_HEIGHT['brood-hive']
    blob(body, (0, .6, 0), 2.15, 1.95, .2, 'flesh', seg=14, rings=6, rng=rng, wobble=.1, floor=-1.2)
    blob(body, (0, 0, .12), .62, .58, .2, 'resin', seg=12, rings=5, rng=rng, wobble=.1)
    blob(body, (0, 0, .36), .36, .34, .1, 'flesh', seg=10, rings=4)
    spine = curve((0, .3, 2.1), (0, 1.6, 2.15), (0, 2.2, .3), 8)
    tube(body, spine, [.16, .17, .17, .16, .15, .14, .13, .12, .1], 'bone', seg=7)
    for k in range(1, 8):
        p = spine[k]
        tube(body, [p, p + Vector((0, .08, .22))], [.05, .004], 'bone', seg=4)
    for t, w in ((0, 1.45), (2, 1.55), (4, 1.45), (6, 1.25)):
        p = spine[t]
        for sgn in (-1, 1):
            pts = curve(p + Vector((0, 0, -.05)), (sgn * w * 1.25, p.y - .1, p.z * 1.0), (sgn * w, p.y + .1, -.3), 7)
            tube(body, pts, [.13, .125, .12, .115, .105, .095, .09, .085], 'bone', seg=6)
            tube(body, [pts[3], pts[3] + Vector((sgn * .3, -.05, .12))], [.06, .004], 'bone', seg=4)
    for sgn in (-1, 1):
        tube(body, curve((sgn * 1.45, -.35, -.2), (sgn * 1.85, -.75, .9), (sgn * 1.15, -.55, 1.65), 6),
             [.17, .16, .14, .11, .08, .045, .006], 'bone', seg=6)
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
    blob(core, (0, 0, C), .46, .42, .48, 'sac_glow', seg=14, rings=8)
    for k in range(5):
        a = TAU * k / 5 + .3
        pts = [(math.cos(a) * .47 * math.cos(b), math.sin(a) * .43 * math.cos(b), C + .49 * math.sin(b)) for b in (-1.1, -.6, 0, .6, 1.15)]
        tube(core, pts, [.035, .03, .028, .022, .01], 'flesh', seg=4)
    # Destroyed: the sac burst and slumped into its cup, torn flaps, a dark spill and thrown gobbets.
    blob(ruin, (0, 0, .48), .4, .37, .14, 'flesh', seg=12, rings=5, rng=rng, wobble=.25)
    for k in range(5):
        a = TAU * k / 5 + rng.uniform(-.2, .2)
        tube(ruin, curve((math.cos(a) * .25, math.sin(a) * .25, .55), (math.cos(a) * .4, math.sin(a) * .4, .8), (math.cos(a) * .55, math.sin(a) * .55, .62), 3),
             [.06, .05, .03, .01], 'resin', seg=4, squash=.4)
    scorch(ruin, rng, 0, -.7, .9)
    wreckage(ruin, rng, 0, -.4, .7, 1.6, 7, mats=('flesh', 'resin', 'scorch'), size=.12, embers=2, z=.15)
    return body, core, ruin


# ----------------------------------------------------------------------------- spawning pool
def spawning_pool(world):
    """A glowing pool ringed by tall curved tusks and egg clusters; a twisted stalk rises from it holding the pod (the
    target)."""
    body, core, ruin = Kit(), Kit(), Kit()
    rng = random.Random(121)
    C = CORE_HEIGHT['spawning-pool']
    blob(body, (0, .2, 0), 2.35, 2.25, .18, 'flesh', seg=14, rings=6, rng=rng, wobble=.1, floor=-1.1)
    disc(body, 0, 0, 1.55, .05, .17, 'water', seg=16)
    ring_tube(body, (0, 0, .17), (0, 0, 1), 1.62, .13, 'chitin', seg=18, side=6)
    for k in range(9):
        a = TAU * k / 9 + .2
        r = rng.uniform(.4, 1.25)
        disc(body, math.cos(a) * r, math.sin(a) * r, rng.uniform(.06, .12), .17, .19, 'alt_glow', seg=6)
    # The stalk: three roots twisting up from the pool to the pod, root feet spreading on the bed.
    for k in range(3):
        a0 = TAU * k / 3
        pts = [Vector((math.cos(a0 + t * 2.2) * (.32 - t * .2), math.sin(a0 + t * 2.2) * (.32 - t * .2), .1 + t * (C - .45))) for t in (0, .25, .5, .75, 1.0)]
        tube(body, pts, [.13, .11, .09, .08, .07], 'chitin', seg=6)
        foot = Vector((math.cos(a0 + .4) * .9, math.sin(a0 + .4) * .9, .12))
        tube(body, [pts[0], (pts[0] + foot) / 2 + Vector((0, 0, .08)), foot], [.1, .07, .03], 'chitin', seg=5)
    # The tusks: six tall curved claws round the rim, lower at the front.
    for deg, height in ((90, 2.5), (40, 2.3), (140, 2.3), (-5, 1.9), (185, 1.9), (-50, 1.45), (230, 1.45)):
        a = math.radians(deg)
        u = Vector((math.cos(a), math.sin(a), 0))
        base = u * 2.05 + Vector((0, 0, -.3))
        tube(body, curve(base, u * 2.35 + Vector((0, 0, height * .55)), u * 1.6 + Vector((0, 0, height)), 6),
             [.2, .19, .17, .14, .1, .05, .006], 'bone', seg=6)
    brood_growths(body, rng, eggs=((-1.5, -1.3, 5), (1.55, -1.25, 5), (-1.85, 1.2, 4), (1.85, 1.35, 4), (0, 2.1, 3)),
                  resin=((-.9, -1.75, .1, .16), (1.0, 1.85, .1, .16)))
    for x, y in ((-1.3, -1.6), (1.75, -1.0), (-1.95, .9)):
        blob(body, (x, y, .32), .08, .08, .11, 'alt_glow', seg=6, rings=4)
    # The pod (the core): a glowing sac on the stalk's crown, veined, held by three fingers.
    blob(core, (0, 0, C), .42, .4, .45, 'sac_glow', seg=12, rings=8)
    for k in range(4):
        a = TAU * k / 4 + .4
        pts = [(math.cos(a) * .43 * math.cos(b), math.sin(a) * .41 * math.cos(b), C + .46 * math.sin(b)) for b in (-1.1, -.5, .1, .7, 1.15)]
        tube(core, pts, [.035, .03, .026, .02, .008], 'chitin', seg=4)
    # Destroyed: the pod burst on the stalk's crown, dark spill over the pool, gobbets round it.
    blob(ruin, (0, 0, C - .3), .3, .28, .12, 'flesh', seg=10, rings=5, rng=rng, wobble=.25)
    for k in range(4):
        a = TAU * k / 4 + rng.uniform(-.2, .2)
        tube(ruin, curve((math.cos(a) * .2, math.sin(a) * .2, C - .25), (math.cos(a) * .35, math.sin(a) * .35, C - .05), (math.cos(a) * .45, math.sin(a) * .45, C - .3), 3),
             [.06, .05, .03, .01], 'resin', seg=4, squash=.4)
    disc(ruin, 0, -.3, .9, .17, .2, 'scorch', seg=12)
    wreckage(ruin, rng, 0, -.4, .9, 1.7, 6, mats=('flesh', 'resin', 'scorch'), size=.12, embers=2, z=.18)
    return body, core, ruin


BUILDERS = {'crash-site': crash_site, 'airfield': airfield, 'salvage-yard': salvage_yard, 'shield-depot': shield_depot,
            'relay-station': relay_station, 'freight-terminal': freight_terminal, 'dark-spaceport': dark_spaceport,
            'prism-reactor': prism_reactor, 'sealed-vault': sealed_vault, 'gate-ring': gate_ring, 'brood-hive': brood_hive,
            'spawning-pool': spawning_pool}


# ----------------------------------------------------------------------------- build, check, export
def world_points(ob):
    me = ob.data
    mw = ob.matrix_world
    return [mw @ v.co for v in me.vertices]


def check(site, spec, objects):
    """Asserts the contracts: registry bounds inside the footprint, top, foundation depth, the line of sight to each
    core, and the guard batteries' spots kept clear."""
    problems = []
    lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    fx, fs0, fs1 = FOOTPRINT
    height = CORE_HEIGHT[site]
    for part, ob in objects.items():
        pts = world_points(ob)
        for p in pts:
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
        if part != 'body':
            continue
        # Line of sight (docs/25 rule 2): rays from each core (and the guards' batteries round it) toward the camera
        # never meet the site.
        tree = BVHTree.FromPolygons(pts, [list(poly.vertices) for poly in ob.data.polygons], all_triangles=False, epsilon=0.0)
        eye = Vector((0, -math.cos(math.radians(55)), math.sin(math.radians(55))))
        for label, (cx, cy, cz), spread in ([('core', (cx, cy, height), .2) for cx, cy in CORES.get(site, ((0, 0),))]
                                            + [('guard spot', (gx, gy, .85), .25) for gx, gy in GUARD_SPOTS.get(site, ())]):
            for ox, oz in ((0, 0), (-spread, 0), (spread, 0), (0, -spread * .7), (0, spread * .7)):
                origin = Vector((cx + ox, cy, cz + oz)) + eye * .35
                hit = tree.ray_cast(origin, eye, 40)[0]
                if hit is not None:
                    problems.append('%s hides the %s (%.1f, %.1f) at (%.2f, %.2f, %.2f)' % (ob.name, label, cx, cy, hit.x, hit.y, hit.z))
                    break
        # Nothing stands where a guard battery stands.
        for gx, gy in GUARD_SPOTS.get(site, ()):
            for p in pts:
                if math.hypot(p.x - gx, p.y - gy) < .45 and p.z > .45:
                    problems.append('%s stands on the guard spot (%.1f, %.1f) at (%.2f, %.2f, %.2f)' % (ob.name, gx, gy, p.x, p.y, p.z))
                    break
    tol = .01
    if lo.x < -fx - tol or hi.x > fx + tol or lo.y < fs0 - tol or hi.y > fs1 + tol:
        problems.append('%s outside the footprint: x %.2f..%.2f s %.2f..%.2f' % (site, lo.x, hi.x, lo.y, hi.y))
    if lo.x < spec['x'][0] - tol or hi.x > spec['x'][1] + tol:
        problems.append('%s x %.2f..%.2f outside %s' % (site, lo.x, hi.x, spec['x']))
    if lo.y < spec['s'][0] - tol or hi.y > spec['s'][1] + tol:
        problems.append('%s s %.2f..%.2f outside %s' % (site, lo.y, hi.y, spec['s']))
    if hi.z > min(spec['top'], TOP_MAX) + tol:
        problems.append('%s top %.2f over %.2f' % (site, hi.z, spec['top']))
    if lo.z < -spec['below'] - tol:
        problems.append('%s foundation %.2f under %.2f' % (site, lo.z, -spec['below']))
    return problems, (lo, hi)


LOW = 1.0  # the blast lies on aprons and ground, never on roofs above this


def devastate(ruin, body, rng, bounds=None, radius=9.0, flat=None):
    """The destroyed state's overlay (integrator, 30 October: "readable at phone size"): a jagged scorch splash draped over
    the site (its aprons, roofs and the ground round it) out to the model's bounds, pale ash streaks blasted out from the
    core, chunky debris thrown off it and embers. `bounds` (x0, x1, s0, s1) clips it to the registry rectangle; `flat`
    lays it at one height instead (the vault's seals, drawn at each seal)."""
    tree = None
    if flat is None:
        pts = world_points(body)
        tree = BVHTree.FromPolygons(pts, [list(poly.vertices) for poly in body.data.polygons], all_triangles=False, epsilon=0.0)
    def surface(x, y):
        if tree is None:
            return flat
        hit = tree.ray_cast(Vector((x, y, 6.0)), Vector((0, 0, -1)), 12)[0]
        return max(0.0, hit.z) if hit is not None else 0.0
    def reach(a):
        c, sn, t = math.cos(a), math.sin(a), radius
        if bounds:
            x0, x1, s0, s1 = bounds
            if c > 1e-6: t = min(t, (x1 - .08) / c)
            if c < -1e-6: t = min(t, (x0 + .08) / c)
            if sn > 1e-6: t = min(t, (s1 - .08) / sn)
            if sn < -1e-6: t = min(t, (s0 + .08) / sn)
        return t
    n = 32
    R = [reach(TAU * i / n) * (rng.uniform(.84, 1.0) if i % 3 else rng.uniform(.55, .72)) for i in range(n)]
    def face(h, quad, mat, lift):
        """One draped quad (skipped where it would hang down a wall)."""
        pts = [(x, y, surface(x, y) + lift) for x, y in quad]
        if max(p[2] for p in pts) - min(p[2] for p in pts) > .35 or max(p[2] for p in pts) > LOW + lift:
            return  # never down a wall, nor up on a roof
        bm = h.minor.bm
        f = bm.faces.new([bm.verts.new(Vector(p)) for p in pts])
        f.material_index = h.minor._m(mat)
    rings = (.06, .15, .32, .5, .68, .84, 1.0)
    at = lambda f, i: (math.cos(TAU * i / n) * max(f * R[i % n], .04), math.sin(TAU * i / n) * max(f * R[i % n], .04))
    for k in range(len(rings) - 1):
        for i in range(n):
            face(ruin, [at(rings[k + 1], i), at(rings[k + 1], i + 1), at(rings[k], i + 1), at(rings[k], i)], 'scorch', .03)
    # Ash streaks blasted outward (pale, kept in the wreck).
    for j in range(12):
        a = TAU * j / 12 + rng.uniform(-.18, .18)
        length = reach(a) * rng.uniform(.75, .97)
        c, sn, steps = math.cos(a), math.sin(a), 5
        for k in range(steps):
            r0, r1 = .45 + (length - .45) * k / steps, .45 + (length - .45) * (k + 1) / steps
            w0, w1 = .11 * (1 - k / steps) + .02, .11 * (1 - (k + 1) / steps) + .02
            face(ruin, [(c * r1 - sn * w1, sn * r1 + c * w1), (c * r1 + sn * w1, sn * r1 - c * w1),
                        (c * r0 + sn * w0, sn * r0 - c * w0), (c * r0 - sn * w0, sn * r0 + c * w0)], 'ash', .05)
    # Chunky debris thrown off the blast, and embers.
    placed = 0
    for j in range(40):
        if placed == 9:
            break
        a = rng.uniform(0, TAU)
        k = rng.uniform(.17, .32)
        d = max(.3, reach(a) - .55) * rng.uniform(.5, 1.0)
        x, y = math.cos(a) * d, math.sin(a) * d
        z = surface(x, y)
        if z > LOW:
            continue
        placed += 1
        obox(ruin, x, y, k * rng.uniform(.9, 1.5), k * rng.uniform(.6, 1.0), z - .06, z + k * rng.uniform(.6, 1.0), rng.uniform(0, TAU),
             ('ash', 'metal', 'ash', 'steel')[placed % 4], tilt=rng.uniform(-.5, .5), minor=True)
    for j in range(8):
        a = rng.uniform(0, TAU)
        d = reach(a) * rng.uniform(.2, .75)
        x, y = math.cos(a) * d, math.sin(a) * d
        if surface(x, y) <= LOW:
            blob(ruin, (x, y, surface(x, y) + .05), .1, .1, .07, 'ember_glow', seg=6, rings=4)


def build_site(site, spec, sc):
    out = {}
    for world in spec['finishes']:
        mats = materials(world)
        kits = BUILDERS[site](world)
        name = 'site_%s_%s' % (site.replace('-', '_'), world)
        body = kits[0].object('%s_body' % name, mats, sc)
        rng = random.Random(sum(ord(ch) * (i + 1) for i, ch in enumerate(site + world)))  # stable across runs
        if site == 'sealed-vault':  # each seal's ruin, drawn at each seal: a smaller splash on the terrace
            devastate(kits[2], body, rng, radius=.95, flat=.3)
        else:
            devastate(kits[2], body, rng, bounds=(spec['x'][0], spec['x'][1], spec['s'][0], spec['s'][1]))
        objects = {'body': body, 'core': kits[1].object('%s_core' % name, mats, sc), 'ruin': kits[2].object('%s_ruin' % name, mats, sc)}
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
        tiles.append(br.render_view(sc, 'game', (0, .3, .8), 7.6, os.path.join(PREVIEW, 'tile_%s.png' % world), res=560, objects=shown))
    rows = [tiles[i:i + 3] for i in range(0, len(tiles), 3)]
    while len(rows[-1]) < len(rows[0]):
        rows[-1].append(br.render_view(sc, 'game', (40, 40, 0), 7.6, os.path.join(PREVIEW, 'tile_blank_%d.png' % len(rows[-1])), res=560, objects=[ground]))
    return br.compose(rows, os.path.join(PREVIEW, '%s%s.png' % (site, '-ruin' if ruin else '')))


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = [a.split('=', 1)[1] for a in args if a.startswith('--site=')]
    spec_all = registry()
    os.makedirs(OUT, exist_ok=True)
    report, failed = [], []
    for site in BUILDERS:
        if only and site not in only:
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
