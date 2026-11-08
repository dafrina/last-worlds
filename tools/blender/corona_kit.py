"""Corona's infrastructure kit (docs/37): six terrain landmarks after art/concepts/corona/02-infrastructure.webp.

The user, 5 November 2026: "also make some models for the ships and infrastructure". The sheet's six modules, as
original faceted geometry (the strike-site toolkit, tools/blender/boss_remodel.py Solids): gunmetal frames, bronze-grey
plates, bronze trim, gold glowing seams and cores. Bold silhouettes for the 55-degree camera; baked AO.

Nodes (public/assets/corona/corona-kit.glb; src/world/scenery-kit.ts KIT, kinds cor*):
    cor_extractor_0   a captured star between two C-shaped arms on a dais, pipes off its sides
    cor_collector_0   a lattice tower carrying a glowing hub and four fan panels facing the camera
    cor_hangar_0      a ribbed half-barrel hangar, its open front glowing, crates and a pad apron
    cor_refinery_0    two horizontal tanks banded in glow, a plasma column tower, pipes
    cor_gantry_0      two pylons and a bridge beam over a landing pad, a glowing pod hanging from it
    cor_dome_0        a ribbed dome on a hexagonal ring wall, a gold field ring, a spire, corner pylons
Kit contract (src/render/terrain-kit.ts extractKitNode): base-centre pivot, x right, the front toward the camera (-y),
z up; the top is normalised to 1 at load (exactTop) and the footprint stays in model units (the scatter scales it).
Colour is the material's base colour times the AO in COLOR_0; materials named *glow* glow (Corona's kit shader burns them
the star's orange).

Headless (every path Blender sees is a Windows path):
  cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
    --python '\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\tools\\blender\\corona_kit.py' -- [--preview] [--no-export]
"""
import bpy, math, os, sys
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boss_remodel as br
import remodel_facilities as rf
from remodel_facilities import B, cyl

OUT = os.path.join(br.ROOT, 'public', 'assets', 'corona', 'corona-kit.glb')
PREVIEW = os.path.join(br.ROOT, 'lookdev', 'corona')
TAU = 2 * math.pi
# Base colours; the glow slots carry their glow colour as base colour (the kit reads it as the emissive tint).
# (Ancient, mechanical and dim, user 5 November: "they look like toys now. refine them, alien and ancient looking, and also
# mechanical"; "normal buildings etc look too glowy so hard to distinguish from the strike sites": glow only in thin
# grooves and small dim cores, darker glow colours.)
PAINT = dict(cor_plate=('#5a5048', .6, .4), cor_frame=('#1c1816', .5, .5), cor_bronze=('#6e4a26', .45, .7),
             cor_stone=('#34302c', .85, .02), cor_glow=('#b05a18', .5, .1), cor_glow_hot=('#c87a30', .4, .1))
PLATE, FRAME, BRONZE, STONE, GLOW, HOT = 'cor_plate', 'cor_frame', 'cor_bronze', 'cor_stone', 'cor_glow', 'cor_glow_hot'


def materials():
    return {n: br.material(n, c, r, m) for n, (c, r, m) in PAINT.items()}


def beam(k, p0, p1, w, d, mat):
    """A square-section bar from p0 to p1 (any direction)."""
    a, b = Vector(p0), Vector(p1)
    ax = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(ax.z) < .9 else Vector((1, 0, 0))
    u = ax.cross(up).normalized() * w / 2
    v = ax.cross(u).normalized() * d / 2
    loop = lambda c: [tuple(c + u + v), tuple(c - u + v), tuple(c - u - v), tuple(c + u - v)]
    k.minor.loft([loop(a), loop(b)], mat)


def tube(k, pts, r, mat, seg=6):
    for p, q in zip(pts, pts[1:]):
        a, b = Vector(p), Vector(q)
        ax = (b - a).normalized()
        up = Vector((0, 0, 1)) if abs(ax.z) < .9 else Vector((1, 0, 0))
        u = ax.cross(up).normalized(); v = ax.cross(u).normalized()
        ring = lambda c: [tuple(c + (u * math.cos(TAU * i / seg) + v * math.sin(TAU * i / seg)) * r) for i in range(seg)]
        k.minor.loft([ring(a), ring(b)], mat)


def sphere(k, c, r, mat, seg=12, rings=7):
    loops = []
    for j in range(1, rings):
        t = math.pi * j / rings
        z, rr = c[2] - math.cos(t) * r, math.sin(t) * r
        loops.append([(c[0] + rr * math.cos(TAU * i / seg), c[1] + rr * math.sin(TAU * i / seg), z) for i in range(seg)])
    k.major.loft(loops, mat)


def dais(k, hx, hy, z, mat=STONE, rim=FRAME):
    k.major.box((-hx, -hy, -.25), (hx, hy, z), mat, chamfer=min(hx, hy) * .2)
    B(k, -hx * .8, hx * .8, -hy - .01, -hy + .02, z * .4, z * .7, GLOW)


# ----------------------------------------------------------------------------- alien parts
# The user, 5 November: "looks a bit not so alien, make it a bit more alien looking". As the fleet: curved claws and
# horns, ribbed carapaces, bulbous plasma pods joined by veins, and rings floating free, held by nothing.
def claw(k, pts, r, mat=PLATE, seg=6, hot=False):
    """A tapered horn or claw through the points (thick at the first, a point at the last)."""
    pts = [Vector(p) for p in pts]
    n = len(pts) - 1
    for i in range(n):
        a, b = pts[i], pts[i + 1]
        ra, rb = r * (1 - i / n) + .01, r * (1 - (i + 1) / n) + .01
        ax = (b - a).normalized(); up = Vector((0, 0, 1)) if abs(ax.z) < .9 else Vector((1, 0, 0))
        u = ax.cross(up).normalized(); v = ax.cross(u).normalized()
        ring = lambda c, rr: [tuple(c + (u * math.cos(TAU * q / seg) + v * math.sin(TAU * q / seg)) * rr) for q in range(seg)]
        (k.major if ra > .06 else k.minor).loft([ring(a, ra), ring(b, rb)], mat)
    if hot:
        sphere(k, tuple(pts[-1]), .035, HOT, seg=6, rings=4)


def halo(k, c, r, z, thick=.03, mat=GLOW, n=24):
    cx, cy = c
    pts = [(cx + math.cos(TAU * i / n) * r, cy + math.sin(TAU * i / n) * r, z) for i in range(n + 1)]
    tube(k, pts, thick, mat, seg=4)


def pod(k, c, r, mat=PLATE, glow=True):
    """A bulbous plasma pod: a squashed orb with a glowing equator."""
    loops = []
    for j in range(1, 8):
        t = math.pi * j / 8
        loops.append([(c[0] + math.sin(t) * r * math.cos(TAU * i / 12), c[1] + math.sin(t) * r * math.sin(TAU * i / 12), c[2] - math.cos(t) * r * .85) for i in range(12)])
    k.major.loft(loops, mat)
    if glow:
        halo(k, c[:2], r * 1.01, c[2], thick=.022)


def carapace(k, cx, cy, rx, ry, h, z0, mat, ribs=6, mouth=True):
    """A ribbed shell (a beetle's back) over an ellipse, ribs as raised bands, a glowing mouth at the front."""
    loops = []
    for j in range(0, 6):
        t = (math.pi / 2) * j / 5
        sc, z = math.cos(t), z0 + math.sin(t) * h
        loops.append([(cx + rx * sc * math.cos(TAU * i / 16), cy + ry * sc * math.sin(TAU * i / 16), z) for i in range(16)])
    k.major.loft(loops, mat)
    for r_ in range(1, ribs):
        a = math.pi * r_ / ribs
        pts = [(cx + math.cos(a) * rx * math.cos(t), cy + ry * math.sin(t) * 0 + (math.sin(a) * 0), z0) for t in (0,)]
    for r_ in range(1, ribs):
        y = cy - ry + 2 * ry * r_ / ribs
        frac = math.sqrt(max(0.0, 1 - ((y - cy) / ry) ** 2))
        pts = [(cx + rx * frac * math.cos(math.pi * q / 8) * 1.02, y, z0 + h * frac * math.sin(math.pi * q / 8) * 1.02) for q in range(9)]
        tube(k, pts, .022, FRAME, seg=4)
    if mouth:
        k.major.wedge([(cx - rx * .45, cy - ry * .98), (cx + rx * .45, cy - ry * .98), (cx + rx * .3, cy - ry * .8), (cx - rx * .3, cy - ry * .8)], z0, z0 + h * .45, GLOW)


# ----------------------------------------------------------------------------- ancient details
def glyph(k, x, y, z, length, angle, step=.07, w=.018, seed=0):
    """A glyph groove: a stepped zigzag inlaid in a surface (dim glow)."""
    import random
    r = random.Random(seed)
    u = Vector((math.cos(angle), math.sin(angle), 0)); v = Vector((-u.y, u.x, 0))
    p = Vector((x, y, z)) - u * length / 2; start = p.copy(); off = 0.0
    while (p - start).length < length - 1e-6:
        q = p + u * step
        off = max(-1.0, min(1.0, off + r.choice((-1, 0, 0, 1))))
        beam(k, tuple(p), tuple(q + v * off * step * .5), w, .012, GLOW)
        p = q + v * off * step * .5


def post(k, x, y, height, w, lean=(0, 0), seed=0):
    """A carved monolith post: tapered, leaning, a bronze cap, glyph notches down its front."""
    t = (x + lean[0], y + lean[1])
    k.major.loft([[(x - w, y - w * .7, -.2), (x + w, y - w * .7, -.2), (x + w, y + w * .7, -.2), (x - w, y + w * .7, -.2)],
                  [(t[0] - w * .65, t[1] - w * .45, height), (t[0] + w * .65, t[1] - w * .45, height), (t[0] + w * .65, t[1] + w * .45, height), (t[0] - w * .65, t[1] + w * .45, height)]], STONE)
    k.major.loft([[(t[0] - w * .7, t[1] - w * .5, height), (t[0] + w * .7, t[1] - w * .5, height), (t[0] + w * .7, t[1] + w * .5, height), (t[0] - w * .7, t[1] + w * .5, height)],
                  [(t[0] - w * .35, t[1] - w * .25, height + w * .8), (t[0] + w * .35, t[1] - w * .25, height + w * .8), (t[0] + w * .35, t[1] + w * .25, height + w * .8), (t[0] - w * .35, t[1] + w * .25, height + w * .8)]], BRONZE)
    for q in range(2):
        z = height * (.35 + .25 * q); f = z / height
        cx, cy = x + lean[0] * f, y + lean[1] * f - w * .7 * (1 - f * .35) - .004
        beam(k, (cx - w * .4, cy, z), (cx + w * .4, cy, z), .02, .012, GLOW)


def blocks(k, r0, r1, z0, z1, n, seed=0):
    """A ring of carved stone blocks with glyph grooves on every other top."""
    import random
    r = random.Random(seed)
    for i in range(n):
        a0, a1 = TAU * i / n + .04, TAU * (i + 1) / n - .04
        top = z1 + r.uniform(-.03, .04)
        quad = lambda z, a0=a0, a1=a1: [(math.cos(a0) * r0, math.sin(a0) * r0, z), (math.cos(a0) * r1, math.sin(a0) * r1, z),
                                        (math.cos(a1) * r1, math.sin(a1) * r1, z), (math.cos(a1) * r0, math.sin(a1) * r0, z)]
        k.major.loft([quad(z0), quad(top)], STONE if i % 3 else FRAME)
        if i % 2 == 0:
            am = (a0 + a1) / 2
            glyph(k, math.cos(am) * (r0 + r1) / 2, math.sin(am) * (r0 + r1) / 2, top + .003, (a1 - a0) * (r0 + r1) / 2 * .75, am + math.pi / 2, seed=seed * 17 + i)


def bands(k, centre, r, z0, z1, n, mat=BRONZE):
    for q in range(n):
        z = z0 + (z1 - z0) * (q + .5) / n
        k.cylinder((centre[0], centre[1], 0), 'z', r, z - .02, z + .02, mat, seg=12)


# ----------------------------------------------------------------------------- modules
def extractor():
    """An ancient star well: a carved stone dais, a ring of glyph-cut blocks, iron arcs in bronze bands floating round a
    small dim star, a ring gear, horns at the back, carved posts at the front."""
    k = rf.Kit([])
    dais(k, .78, .6, .1)
    blocks(k, .5, .74, .1, .22, 12, seed=1)
    C = .78
    for i in range(6):
        a0 = TAU * i / 6 + .14
        pts = [(math.cos(a0 + (TAU / 6 - .28) * q / 6) * .56, 0, C + math.sin(a0 + (TAU / 6 - .28) * q / 6) * .56) for q in range(7)]
        tube(k, pts, .06, FRAME if i % 2 else PLATE, seg=6)
        mid = pts[3]
        k.cylinder((mid[0], 0, mid[2]), 'y', .075, -.04, .04, BRONZE, seg=8)
    sphere(k, (0, 0, C), .2, HOT)
    k.gear((0, 0, 0), 'z', .46, .04, 22, .22, .27, BRONZE)
    for s in (-1, 1):
        claw(k, [(s * .62, .32, .1), (s * .7, .2, .55), (s * .45, .05, .9)], .1, mat=FRAME)
        post(k, s * .6, -.45, .45, .08, (0, .04), seed=s + 5)
    return k


def collector():
    """Three iron claws curling up to a small dim hub; four petals of iron with bronze ribs; a stone base cut with glyphs."""
    k = rf.Kit([])
    dais(k, .55, .5, .08)
    blocks(k, .32, .5, .08, .16, 10, seed=2)
    C = 1.35
    for i in range(3):
        a = TAU * i / 3 + math.pi / 2
        claw(k, [(math.cos(a) * .42, math.sin(a) * .38, .08), (math.cos(a) * .4, math.sin(a) * .36, .6), (math.cos(a) * .12, math.sin(a) * .1, 1.15)], .1, mat=FRAME if i else PLATE)
    tilt = math.radians(35)
    nrm = Vector((0, -math.cos(tilt), math.sin(tilt))); u = Vector((1, 0, 0)); v = nrm.cross(u).normalized()
    hub = Vector((0, .02, C))
    at = lambda r, a, off=0.0: tuple(hub + (u * math.cos(a) + v * math.sin(a)) * r - nrm * off)
    for i in range(4):
        a = math.radians(45 + 90 * i)
        pts = lambda off, a=a: [at(.16, a - .25, off), at(.5, a - .5, off), at(.68, a - .1, off), at(.64, a + .3, off), at(.16, a + .25, off)]
        k.major.loft([pts(.02), pts(-.02)], PLATE)
        for f in (-.3, .1):
            beam(k, at(.2, a + f * .5, -.025), at(.62, a + f, -.025), .025, .012, BRONZE)
    sphere(k, tuple(hub), .1, HOT, seg=8, rings=5)
    k.gear((0, .02, 0), 'z', .2, .03, 12, C - .14, C - .1, BRONZE)
    return k


def hangar():
    """A ribbed iron carapace on a carved base, its mouth a thin glowing slit; horned posts and pods round it."""
    k = rf.Kit([])
    k.major.box((-.8, -.62, -.25), (.8, .62, .05), STONE, chamfer=.12)
    for x in (-.55, 0, .55):
        glyph(k, x, -.5, .052, .35, math.pi / 2, seed=int(x * 10) + 20)
    carapace(k, 0, .08, .58, .5, .5, .05, PLATE, mouth=False)
    k.major.wedge([(-.24, -.44), (.24, -.44), (.2, -.4), (-.2, -.4)], .05, .14, GLOW)
    for s in (-1, 1):
        claw(k, [(s * .6, -.35, .05), (s * .7, -.5, .3), (s * .55, -.62, .45)], .08, mat=FRAME)
        pod(k, (s * .66, .42, .14), .1, glow=False)
        bands(k, (s * .66, .42), .1, .1, .2, 2)
    return k


def refinery():
    """Three iron pods in bronze bands, pipes to a twisted iron spire, bronze halos round it, a dim core in its heart."""
    k = rf.Kit([])
    k.major.box((-.75, -.55, -.25), (.75, .55, .06), STONE, chamfer=.1)
    for x, y, r in ((-.45, -.2, .22), (-.42, .25, .18), (-.05, .3, .15)):
        pod(k, (x, y, .06 + r * .8), r, glow=False)
        bands(k, (x, y), r * 1.02, .06 + r * .3, .06 + r * 1.3, 3)
        tube(k, [(x, y, .06 + r * .3), ((x + .5) / 2, y * .5, .12), (.45, 0, .2)], .025, FRAME, seg=4)
    pts = [(.45 + math.cos(q * .9) * .08, math.sin(q * .9) * .08, .06 + q * .11) for q in range(10)]
    claw(k, pts, .13, mat=FRAME)
    for z, r in ((.45, .2), (.75, .16), (1.0, .12)):
        halo(k, (.45, 0), r, z, thick=.018, mat=BRONZE)
    sphere(k, (.45, 0, .6), .05, HOT, seg=6, rings=4)
    post(k, -.62, -.42, .35, .07, seed=11)
    return k


def gantry():
    """Two stone-and-iron horns arching over a landing pad cut with glyphs, a small dim orb hanging between their tips."""
    k = rf.Kit([])
    k.major.box((-.8, -.6, -.25), (.8, .6, .05), STONE, chamfer=.12)
    B(k, -.55, .55, -.45, .45, .05, .08, FRAME)
    for x in (-.35, .35):
        glyph(k, x, 0, .082, .7, math.pi / 2, seed=int(x * 10) + 40)
    for s in (-1, 1):
        claw(k, [(s * .66, .2, .05), (s * .72, .2, .6), (s * .45, .2, 1.0), (s * .1, .2, 1.08)], .13, mat=PLATE)
        for z in (.25, .55):
            k.cylinder((s * .69, .2, 0), 'z', .1, z - .025, z + .025, BRONZE, seg=8)
    sphere(k, (0, .2, .82), .07, HOT, seg=8, rings=5)
    halo(k, (0, .2), .14, .82, thick=.012, mat=BRONZE)
    k.major.wedge([(-.25, -.3), (.25, -.3), (.32, .0), (0, .1), (-.32, .0)], .08, .16, PLATE)
    return k


def dome():
    """Claw ribs of iron curling in over a dim core on a carved hexagonal base; a bronze ring gear; horned posts."""
    k = rf.Kit([])
    hexa = lambda r: [(math.cos(TAU * i / 6 + math.pi / 6) * r, math.sin(TAU * i / 6 + math.pi / 6) * r) for i in range(6)]
    k.major.wedge(hexa(.78), -.25, .06, STONE)
    k.major.wedge(hexa(.62), .06, .14, FRAME)
    for i in range(3):
        a = TAU * i / 3 + math.pi / 2
        glyph(k, math.cos(a) * .7, math.sin(a) * .7, .062, .3, a + math.pi / 2, seed=60 + i)
    R, n = .55, 7
    for i in range(n):
        a = TAU * i / n
        claw(k, [(math.cos(a) * R, math.sin(a) * R, .14), (math.cos(a) * R * .95, math.sin(a) * R * .95, .45), (math.cos(a) * R * .35, math.sin(a) * R * .35, .72)], .06, mat=PLATE if i % 2 else FRAME)
    sphere(k, (0, 0, .34), .14, HOT, seg=8, rings=5)
    k.gear((0, 0, 0), 'z', R + .05, .04, 26, .14, .19, BRONZE)
    halo(k, (0, 0), .3, .92, thick=.02, mat=BRONZE)
    for i in (0, 2, 4):
        a = TAU * i / 6 + math.pi / 6
        post(k, math.cos(a) * .7, math.sin(a) * .7, .38, .06, seed=70 + i)
    return k


BUILDERS = {'cor_extractor_0': extractor, 'cor_collector_0': collector, 'cor_hangar_0': hangar,
            'cor_refinery_0': refinery, 'cor_gantry_0': gantry, 'cor_dome_0': dome}


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    sc = br.scene('corona_kit')
    mats = materials()
    objects, report = [], []
    for name, build in BUILDERS.items():
        ob = build().object(name, mats, sc)
        br.bake_ao([ob], [ob], strength=.75, reach=.6, ground=-.25, rays=24)
        pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        report.append('%s: %d tris; halfX %.2f halfZ %.2f top %.2f (KIT halves after the top is normalised to 1: %.2f, %.2f)' % (
            name, br.triangles([ob]), max(-lo.x, hi.x), max(-lo.y, hi.y), hi.z, max(-lo.x, hi.x), max(-lo.y, hi.y)))
        objects.append(ob)
    if '--no-export' not in args:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        result = br.export(OUT, objects, 'Last Worlds Corona infrastructure kit (tools/blender/corona_kit.py)')
        report.append('export %s: %d triangles, %d bytes' % (result['file'], result['triangles'], result['bytes']))
    if '--preview' in args:
        os.makedirs(PREVIEW, exist_ok=True)
        for i, ob in enumerate(objects):
            ob.location = ((i % 3 - 1) * 2.0, (i // 3) * 2.0 - 1.0, 0)
        ground = bpy.data.objects.get('kit_preview_ground')
        if not ground:
            me = bpy.data.meshes.new('kit_preview_ground')
            me.from_pydata([(-9, -9, -.02), (9, -9, -.02), (9, 9, -.02), (-9, 9, -.02)], [], [(0, 1, 2, 3)])
            ground = bpy.data.objects.new('kit_preview_ground', me)
            sc.collection.objects.link(ground)
            ground.data.materials.append(br.material('kit_preview_ground', '#2a2422', .9, 0))
        report.append('preview %s' % br.render_view(sc, 'three_quarter', (0, 0, .4), 6.4, os.path.join(PREVIEW, 'kit-hero.png'), res=1400, objects=objects + [ground]))
        report.append('preview %s' % br.render_view(sc, 'game', (0, 0, .4), 6.4, os.path.join(PREVIEW, 'kit-game.png'), res=1400, objects=objects + [ground]))
    print('\n'.join('CKIT ' + line for line in report))
    print('CKIT DONE')


main()
