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


# ----------------------------------------------------------------------------- modules
def extractor():
    k = rf.Kit([])
    dais(k, .78, .6, .1)
    C, R0, R1, depth = .78, .48, .62, .2
    def arm(a0, a1, n):
        for i in range(n):
            b0, b1 = a0 + (a1 - a0) * i / n + .02, a0 + (a1 - a0) * (i + 1) / n - .02
            quad = lambda off: [(math.cos(b0) * R0, off, C + math.sin(b0) * R0), (math.cos(b0) * R1, off, C + math.sin(b0) * R1),
                                (math.cos(b1) * R1, off, C + math.sin(b1) * R1), (math.cos(b1) * R0, off, C + math.sin(b1) * R0)]
            k.major.loft([quad(-depth / 2), quad(depth / 2)], PLATE if i % 2 else FRAME)
        tube(k, [(math.cos(a0 + (a1 - a0) * i / 10) * (R0 - .02), -depth / 2 - .01, C + math.sin(a0 + (a1 - a0) * i / 10) * (R0 - .02)) for i in range(11)], .018, GLOW, seg=4)
    lo = math.asin(max(-1.0, (.1 - C) / R1))
    arm(lo, math.radians(76), 6)
    arm(math.radians(104), math.pi - lo, 6)
    sphere(k, (0, 0, C), .34, HOT)
    for x in (-.55, .55):
        k.major.box((x - .14, -.14, .1), (x + .14, .14, .3), FRAME, chamfer=.04)
    for s in (-1, 1):
        tube(k, [(s * .62, .3, .2), (s * .76, .45, .2)], .05, BRONZE)
        cyl(k, s * .66, .42, .07, .1, .5, PLATE, seg=8)
        cyl(k, s * .66, .42, .075, .3, .34, GLOW, seg=8)
    return k


def collector():
    k = rf.Kit([])
    dais(k, .55, .5, .08)
    C, top = 1.35, 1.1
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        beam(k, (sx * .4, sy * .38, .08), (sx * .07, sy * .07, top), .05, .05, BRONZE)
    for z, w in ((.4, .3), (.75, .18)):
        for (x0, y0), (x1, y1) in (((-w, -w), (w, -w)), ((w, -w), (w, w)), ((w, w), (-w, w)), ((-w, w), (-w, -w))):
            beam(k, (x0, y0, z), (x1, y1, z), .025, .025, FRAME)
    tilt = math.radians(35)
    nrm = Vector((0, -math.cos(tilt), math.sin(tilt))); u = Vector((1, 0, 0)); v = nrm.cross(u).normalized()
    hub = Vector((0, .02, C))
    at = lambda r, a, off=0.0: tuple(hub + (u * math.cos(a) + v * math.sin(a)) * r - nrm * off)
    for i in range(4):
        a = math.radians(45 + 90 * i)
        pts = lambda off, a=a: [at(.18, a - .2, off), at(.62, a - .42, off), at(.66, a, off), at(.62, a + .42, off), at(.18, a + .2, off)]
        k.major.loft([pts(.025), pts(-.025)], FRAME)
        k.minor.loft([pts(-.03), pts(-.036)], GLOW)
    sphere(k, tuple(hub), .14, HOT, seg=10, rings=6)
    return k


def hangar():
    k = rf.Kit([])
    k.major.box((-.8, -.62, -.25), (.8, .62, .05), STONE, chamfer=.12)
    B(k, -.75, .75, -.6, -.2, .05, .07, PLATE)                       # apron
    for x in (-.5, 0, .5):
        B(k, x - .015, x + .015, -.58, -.24, .07, .075, GLOW)
    # The half-barrel: ribbed arcs along y, plates between, an open glowing front.
    R, n = .5, 7
    for i in range(n + 1):
        a = math.pi * i / n
        p = lambda y: (math.cos(a) * R, y, .05 + math.sin(a) * R)
    for j, (y0, y1) in enumerate(((-.2, .05), (.05, .3), (.3, .55))):
        loops = []
        for y in (y0, y1):
            loops.append([(math.cos(math.pi * i / n) * R, y, .05 + math.sin(math.pi * i / n) * R) for i in range(n + 1)]
                         + [(math.cos(math.pi * i / n) * (R - .05), y, .05 + math.sin(math.pi * i / n) * (R - .05)) for i in range(n, -1, -1)])
        k.major.loft(loops, PLATE)
        tube(k, [(math.cos(math.pi * i / n) * (R + .015), y1, .05 + math.sin(math.pi * i / n) * (R + .015)) for i in range(n + 1)], .02, FRAME, seg=4)
    k.major.loft([[(math.cos(math.pi * i / n) * (R - .05), .55, .05 + math.sin(math.pi * i / n) * (R - .05)) for i in range(n + 1)],
                  [(math.cos(math.pi * i / n) * (R - .05), .58, .05 + math.sin(math.pi * i / n) * (R - .05)) for i in range(n + 1)]], FRAME)
    B(k, -.3, .3, -.18, -.15, .05, .4, GLOW)                        # the open bay, lit inside
    tube(k, [(math.cos(math.pi * i / n) * R, -.21, .05 + math.sin(math.pi * i / n) * R) for i in range(n + 1)], .025, BRONZE, seg=4)
    for x, y in ((-.68, -.45), (-.6, .4), (.66, .3), (.66, .45)):
        k.major.box((x - .09, y - .07, .05), (x + .09, y + .07, .2), FRAME, chamfer=.02)
        B(k, x - .09, x + .09, y - .075, y - .065, .1, .13, GLOW)
    return k


def refinery():
    k = rf.Kit([])
    k.major.box((-.75, -.55, -.25), (.75, .55, .06), STONE, chamfer=.1)
    for y in (-.2, .22):
        k.major.box((-.62, y - .16, .06), (.25, y + .16, .14), FRAME, chamfer=.03)
        k.cylinder((-.18, y, .32), 'x', .2, -.6, .22, PLATE, seg=14)
        for x in (-.48, .1):
            k.cylinder((x, y, .32), 'x', .215, x - .03, x + .03, GLOW, seg=14)
    # The plasma column: a glass-banded tower with a glowing core, crowned with stacks.
    cyl(k, .5, 0, .2, .06, .2, FRAME, seg=10)
    cyl(k, .5, 0, .14, .2, 1.05, FRAME, seg=10)
    cyl(k, .5, 0, .1, .22, 1.02, HOT, seg=8)
    for z in (.35, .6, .85):
        cyl(k, .5, 0, .16, z, z + .05, BRONZE, seg=10)
    for x in (.42, .58):
        cyl(k, x, .06, .035, 1.05, 1.28, FRAME, seg=6)
    tube(k, [(.22, -.2, .32), (.4, -.12, .32), (.4, 0, .4)], .045, BRONZE)
    tube(k, [(.22, .22, .32), (.4, .12, .32), (.42, 0, .55)], .045, BRONZE)
    return k


def gantry():
    k = rf.Kit([])
    k.major.box((-.8, -.6, -.25), (.8, .6, .05), STONE, chamfer=.12)
    B(k, -.55, .55, -.45, .45, .05, .08, PLATE)                      # the pad
    for x0, x1 in ((-.5, -.48), (.48, .5)):
        B(k, x0, x1, -.45, .45, .08, .09, GLOW)
    for s in (-1, 1):
        k.major.box((s * .66 - .1, .1, .05), (s * .66 + .1, .35, 1.0), FRAME, chamfer=.03)
        B(k, s * .66 - .105, s * .66 + .105, .09, .1, .3, .85, GLOW)
        k.major.box((s * .66 - .13, .05, 1.0), (s * .66 + .13, .4, 1.1), PLATE, chamfer=.03)
    k.major.box((-.79, .12, .98), (.79, .33, 1.08), PLATE, chamfer=.02)
    B(k, -.6, .6, .11, .12, 1.0, 1.03, GLOW)
    beam(k, (0, .22, .98), (0, .22, .7), .03, .03, BRONZE)
    k.major.box((-.14, .1, .45), (.14, .34, .7), FRAME, chamfer=.04)
    B(k, -.1, .1, .095, .105, .5, .65, HOT)
    # A parked lander on the pad.
    k.major.wedge([(-.25, -.3), (.25, -.3), (.32, .0), (0, .1), (-.32, .0)], .08, .16, PLATE)
    B(k, -.05, .05, -.32, -.1, .16, .19, GLOW)
    return k


def dome():
    k = rf.Kit([])
    hexa = lambda r: [(math.cos(TAU * i / 6 + math.pi / 6) * r, math.sin(TAU * i / 6 + math.pi / 6) * r) for i in range(6)]
    k.major.wedge(hexa(.78), -.25, .06, STONE)
    k.major.wedge(hexa(.62), .06, .16, FRAME)
    B(k, -.3, .3, -.56, -.54, .08, .14, GLOW)
    # Ribbed dome: eight ribs to a crown, a glowing field ring at its foot, a spire.
    R, n = .52, 8
    for i in range(n):
        a = TAU * i / n
        pts = [(math.cos(a) * R * math.cos(t), math.sin(a) * R * math.cos(t), .16 + math.sin(t) * R * .9) for t in (0, .4, .8, 1.15, 1.45)]
        tube(k, pts, .03, PLATE, seg=4)
    for t, mat in ((.45, FRAME), (.95, BRONZE)):
        r, z = R * math.cos(t), .16 + math.sin(t) * R * .9
        tube(k, [(math.cos(TAU * i / 16) * r, math.sin(TAU * i / 16) * r, z) for i in range(17)], .022, mat, seg=4)
    k.cylinder((0, 0, 0), 'z', R + .02, .16, .22, GLOW, seg=16)
    sphere(k, (0, 0, .4), .18, HOT, seg=10, rings=6)
    cyl(k, 0, 0, .05, .6, .95, FRAME, seg=6)
    cyl(k, 0, 0, .06, .95, 1.0, GLOW, seg=6)
    for i in (0, 2, 4):
        a = TAU * i / 6 + math.pi / 6
        x, y = math.cos(a) * .7, math.sin(a) * .7
        cyl(k, x, y, .05, .06, .42, FRAME, seg=6)
        cyl(k, x, y, .06, .42, .47, GLOW, seg=6)
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
