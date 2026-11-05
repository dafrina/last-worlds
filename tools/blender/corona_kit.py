"""Corona's infrastructure kit (docs/37): six terrain landmarks after art/concepts/corona/02-infrastructure.webp.

The user, 5 November 2026: "also make some models for the ships and infrastructure". The sheet's six modules, as
original faceted geometry (the strike-site toolkit, tools/blender/boss_remodel.py Solids): gunmetal frames, bronze-grey
plates, bronze trim, gold glowing seams and cores. Bold silhouettes for the 55-degree camera; baked AO.

Nodes (public/assets/corona/corona-kit.glb; src/world/terrain-scatter.ts KIT, kinds cor*):
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
PAINT = dict(cor_plate=('#7c7064', .55, .35), cor_frame=('#211e1c', .5, .45), cor_bronze=('#8a5e30', .4, .7),
             cor_stone=('#3a3532', .85, .02), cor_glow=('#ffa030', .5, .1), cor_glow_hot=('#ffe0a0', .4, .1))
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


# ----------------------------------------------------------------------------- modules
def extractor():
    k = rf.Kit([])
    dais(k, .78, .6, .1)
    C = .78
    # The star in free-floating arcs (no arms touching it): six arcs round it in the plane across the view, a halo.
    for i in range(6):
        a0 = TAU * i / 6 + .14
        pts = [(math.cos(a0 + (TAU / 6 - .28) * q / 6) * .56, 0, C + math.sin(a0 + (TAU / 6 - .28) * q / 6) * .56) for q in range(7)]
        tube(k, pts, .06, PLATE if i % 2 else FRAME, seg=6)
        tube(k, [(p[0] * .9, -.04, (p[2] - C) * .9 + C) for p in pts], .015, GLOW, seg=4)
    sphere(k, (0, 0, C), .32, HOT)
    halo(k, (0, 0), .45, C, thick=.02)
    # Horns rising from the dais corners toward the star.
    for s in (-1, 1):
        claw(k, [(s * .62, .32, .1), (s * .7, .2, .55), (s * .45, .05, .95)], .1, hot=True)
        pod(k, (s * .55, -.35, .2), .12)
    return k


def collector():
    k = rf.Kit([])
    dais(k, .55, .5, .08)
    C = 1.35
    # Three claws curl up from the dais and meet under the hub; four petals open round it toward the camera.
    for i in range(3):
        a = TAU * i / 3 + math.pi / 2
        claw(k, [(math.cos(a) * .42, math.sin(a) * .38, .08), (math.cos(a) * .4, math.sin(a) * .36, .6), (math.cos(a) * .12, math.sin(a) * .1, 1.15)], .1, mat=BRONZE if i else PLATE)
    tilt = math.radians(35)
    nrm = Vector((0, -math.cos(tilt), math.sin(tilt))); u = Vector((1, 0, 0)); v = nrm.cross(u).normalized()
    hub = Vector((0, .02, C))
    at = lambda r, a, off=0.0: tuple(hub + (u * math.cos(a) + v * math.sin(a)) * r - nrm * off)
    for i in range(4):
        a = math.radians(45 + 90 * i)
        pts = lambda off, a=a: [at(.16, a - .25, off), at(.5, a - .5, off), at(.68, a - .1, off), at(.64, a + .3, off), at(.16, a + .25, off)]
        k.major.loft([pts(.02), pts(-.02)], FRAME)
        k.minor.loft([pts(-.025), pts(-.03)], GLOW)
    sphere(k, tuple(hub), .14, HOT, seg=10, rings=6)
    halo(k, (0, .02), .26, C + .28, thick=.018)
    return k


def hangar():
    k = rf.Kit([])
    k.major.box((-.8, -.62, -.25), (.8, .62, .05), STONE, chamfer=.12)
    carapace(k, 0, .08, .58, .5, .5, .05, PLATE)
    for x in (-.5, 0, .5):
        B(k, x - .015, x + .015, -.6, -.45, .05, .07, GLOW)
    for s in (-1, 1):
        claw(k, [(s * .6, -.35, .05), (s * .7, -.5, .3), (s * .55, -.62, .45)], .08, hot=True)
        pod(k, (s * .66, .42, .14), .1)
    return k


def refinery():
    k = rf.Kit([])
    k.major.box((-.75, -.55, -.25), (.75, .55, .06), STONE, chamfer=.1)
    # Three plasma pods, veins to a twisted spire ringed by floating halos.
    for x, y, r in ((-.45, -.2, .22), (-.42, .25, .18), (-.05, .3, .15)):
        pod(k, (x, y, .06 + r * .8), r)
        tube(k, [(x, y, .06 + r * .3), ((x + .5) / 2, y * .5, .12), (.45, 0, .2)], .02, GLOW, seg=4)
    pts = [(.45 + math.cos(q * .9) * .08, math.sin(q * .9) * .08, .06 + q * .11) for q in range(10)]
    claw(k, pts, .13, mat=FRAME)
    tube(k, [(p[0], p[1], p[2]) for p in pts], .03, HOT, seg=4)
    for z, r in ((.45, .2), (.75, .16), (1.0, .12)):
        halo(k, (.45, 0), r, z, thick=.018)
    return k


def gantry():
    k = rf.Kit([])
    k.major.box((-.8, -.6, -.25), (.8, .6, .05), STONE, chamfer=.12)
    B(k, -.55, .55, -.45, .45, .05, .08, PLATE)
    halo(k, (0, 0), .4, .09, thick=.02)
    # Two horns arch over the pad and nearly meet; an orb hangs between their tips, held by nothing.
    for s in (-1, 1):
        claw(k, [(s * .66, .2, .05), (s * .72, .2, .6), (s * .45, .2, 1.0), (s * .1, .2, 1.08)], .13, mat=PLATE)
        tube(k, [(s * .7, .1, .3), (s * .62, .1, .8), (s * .3, .1, 1.0)], .015, GLOW, seg=4)
    sphere(k, (0, .2, .82), .1, HOT, seg=10, rings=6)
    halo(k, (0, .2), .16, .82, thick=.014)
    k.major.wedge([(-.25, -.3), (.25, -.3), (.32, .0), (0, .1), (-.32, .0)], .08, .16, FRAME)
    return k


def dome():
    k = rf.Kit([])
    hexa = lambda r: [(math.cos(TAU * i / 6 + math.pi / 6) * r, math.sin(TAU * i / 6 + math.pi / 6) * r) for i in range(6)]
    k.major.wedge(hexa(.78), -.25, .06, STONE)
    k.major.wedge(hexa(.62), .06, .14, FRAME)
    # Claw ribs curling in over a glowing core; a halo floating above them; small horned pylons.
    R, n = .55, 7
    for i in range(n):
        a = TAU * i / n
        claw(k, [(math.cos(a) * R, math.sin(a) * R, .14), (math.cos(a) * R * .95, math.sin(a) * R * .95, .45), (math.cos(a) * R * .35, math.sin(a) * R * .35, .72)], .06, mat=PLATE)
    sphere(k, (0, 0, .34), .2, HOT, seg=10, rings=6)
    k.cylinder((0, 0, 0), 'z', R + .03, .14, .19, GLOW, seg=16)
    halo(k, (0, 0), .3, .92, thick=.025)
    for i in (0, 2, 4):
        a = TAU * i / 6 + math.pi / 6
        claw(k, [(math.cos(a) * .7, math.sin(a) * .7, .06), (math.cos(a) * .74, math.sin(a) * .74, .42)], .05, mat=FRAME, hot=True)
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
