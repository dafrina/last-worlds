"""Corona's fleet (docs/37): the enemy craft of the Dying Star, after art/concepts/corona/03-craft.webp.

The user, 5 November 2026: "make some models for the ships". The concept sheet shows six craft: plated ceramic armour
over dark gunmetal frames, bronze trim, gold honeycomb panels glowing like the plasma, white-gold engines. The concepts
are references only; all geometry is original and built here from faceted solids (the strike-site toolkit,
tools/blender/boss_remodel.py Solids): bold plated silhouettes for the 55-degree camera, flat paints, baked AO.

Nodes (one GLB, public/assets/corona/corona-craft.glb), each kind's role as in Umbra's fleet (src/render/scene.ts
CORONA_CRAFT):
    corona_interceptor  dart, needle    concept 2: a needle hull with a spike nose, angled gold side panels
    corona_fighter      weaver          concept 1: forward body, swept wings with honeycomb panels, twin engines
    corona_hunter       lancer          concept 5: a tubular hull round a glowing plasma core, twin cannons
    corona_carrier      diamond         concept 3: the blocky heavy, four forward cannons, stub wings
    corona_artillery    pulsar          concept 4: a ring round a glowing core, four gold crescents, spokes
    corona_drone        boss pods       concept 4, small and simple
    corona_turret       turret, missile ground battery (base pivot, lowest point -0.05): a basalt-and-bronze drum
    corona_wraith       the Wraith      concept 6: a glowing hub, two great crescent wings, twin nose prongs
Frame: Blender x right, -y forward (the nose; glTF +Z, toward the player), z up; air craft pivot at their mid-plane.
Engine sockets: empties <node>_engine_N at each nozzle (the game's plumes).

Materials (the runtime craft loader, src/render/models.ts loadCraftNodes, classes them by name):
    corona_plate      pale ceramic armour      corona_frame   dark gunmetal
    corona_bronze     bronze trim and barrels  corona_glow    gold plasma panels (emissive)
    corona_glow_hot   white-gold engines and cores (emissive)

Headless (every path Blender sees is a Windows path):
  cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
    --python '\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\tools\\blender\\corona_craft.py' -- [--preview] [--no-export]
--preview renders the line-up from above and from the game camera into lookdev/corona/craft-*.png.
"""
import bpy, math, os, sys
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boss_remodel as br

OUT = os.path.join(br.ROOT, 'public', 'assets', 'corona', 'corona-craft.glb')
PREVIEW = os.path.join(br.ROOT, 'lookdev', 'corona')
TAU = 2 * math.pi

PAINT = dict(
    corona_plate=('#8c7d6c', .45, .35), corona_frame=('#1f1c1a', .42, .45), corona_bronze=('#a0703a', .34, .75),
    corona_glow=('#3a2006', .4, .1, '#ffaa2e'), corona_glow_hot=('#3a2a10', .3, .1, '#ffe6b0'),
)
PLATE, FRAME, BRONZE, GLOW, HOT = 'corona_plate', 'corona_frame', 'corona_bronze', 'corona_glow', 'corona_glow_hot'
# Footprints (glTF x, z), as Umbra's fleet per role (umbra_craft.py RULES); the Wraith as Umbra's (wraith-v2.glb).
RULES = {
    'corona_interceptor': dict(foot=(0.8, 1.32), z=(-0.1, 0.14)),
    'corona_fighter': dict(foot=(1.5, 1.64), z=(-0.12, 0.2)),
    'corona_hunter': dict(foot=(1.1, 1.62), z=(-0.14, 0.22)),
    'corona_carrier': dict(foot=(1.66, 1.98), z=(-0.16, 0.28)),
    'corona_artillery': dict(foot=(1.42, 1.8), z=(-0.16, 0.3)),
    'corona_drone': dict(foot=(0.54, 0.66), z=(-0.07, 0.09)),
    'corona_turret': dict(foot=(1.1, 1.1), z=(-0.05, 0.7)),
    'corona_wraith': dict(foot=(3.1, 3.3), z=(-0.2, 0.5)),
}


class Craft:
    """Major masses get a small chamfer bevel; trim stays plain. Engines are recorded for the sockets."""

    def __init__(self):
        self.major, self.minor, self.engines = br.Solids([]), br.Solids([]), []

    def pick(self, size):
        return self.minor if min(size) < .05 or max(size) < .18 else self.major

    def box(self, lo, hi, mat, chamfer=0.0):
        self.pick([hi[i] - lo[i] for i in range(3)]).box(lo, hi, mat, chamfer)

    def slab(self, plan, z0, z1, mat, top=None, minor=False):
        (self.minor if minor else self.major).wedge(plan, z0, z1, mat, top)

    def loft(self, loops, mat, minor=False):
        (self.minor if minor else self.major).loft(loops, mat)

    def cyl(self, centre, axis, r, a, b, mat, seg=10, r2=None):
        (self.minor if r < .05 else self.major).cylinder(centre, axis, r, a, b, mat, seg, r2)

    def object(self, name, mats, sc):
        a = self.major.object(name + '_major', mats, (0, 0, 0), sc, bevel=.008)
        b = self.minor.object(name + '_minor', mats, (0, 0, 0), sc, bevel=0)
        ob = br.join([a, b], name, (0, 0, 0))
        br.merge_slots(ob)
        return ob


# ----------------------------------------------------------------------------- shared parts
def hull(c, stations, mat, x=0.0):
    """A faceted plated hull along y: stations (y, half width, top z, bottom z), an octagonal section at each."""
    loops = []
    for y, w, top, bot in stations:
        mid = (top + bot) / 2
        loops.append([(x - w, y, mid), (x - w * .62, y, top), (x + w * .62, y, top), (x + w, y, mid),
                      (x + w * .62, y, bot), (x - w * .62, y, bot)])
    c.loft(loops, mat)


def plating(c, y0, y1, w, z, n, vent=True):
    """Armour plates along a hull's back: n raised plates with gaps (the frame shows between them), a frame seam down
    the middle, and side vents with glowing slits."""
    step = (y1 - y0) / n
    for k in range(n):
        a, b = y0 + k * step + .012, y0 + (k + 1) * step - .012
        for sx in (-1, 1):
            c.box((min(sx * .012, sx * w), a, z), (max(sx * .012, sx * w), b, z + .018), 'corona_plate')
    c.box((-.012, y0, z - .004), (.012, y1, z + .012), 'corona_frame')
    if vent:
        for sx in (-1, 1):
            for k in range(0, n, 2):
                a = y0 + k * step + step * .3
                c.box((min(sx * w, sx * (w + .025)), a, z - .05), (max(sx * w, sx * (w + .025)), a + step * .4, z - .01), 'corona_frame')
                c.box((min(sx * (w + .02), sx * (w + .03)), a + .01, z - .04), (max(sx * (w + .02), sx * (w + .03)), a + step * .4 - .01, z - .02), 'corona_glow')


def mirror(fn):
    for side in (-1, 1):
        fn(side)


def panel(c, plan, z, mat_frame=FRAME, cells=3, rib=BRONZE, inset=.03):
    """A gold honeycomb panel: a frame slab, the glowing face just over it, and bronze ribs dividing it into cells."""
    c.slab(plan, z - .02, z, mat_frame)
    cx = sum(p[0] for p in plan) / len(plan); cy = sum(p[1] for p in plan) / len(plan)
    inner = [(cx + (p[0] - cx) * (1 - inset * 6), cy + (p[1] - cy) * (1 - inset * 6)) for p in plan]
    c.slab(inner, z, z + .008, GLOW, minor=True)
    # Ribs across the panel's long direction.
    xs = [p[0] for p in inner]; ys = [p[1] for p in inner]
    long_x = max(xs) - min(xs) > max(ys) - min(ys)
    for k in range(1, cells):
        t = k / cells
        if long_x:
            x = min(xs) + (max(xs) - min(xs)) * t
            c.box((x - .008, min(ys), z), (x + .008, max(ys), z + .014), rib)
        else:
            y = min(ys) + (max(ys) - min(ys)) * t
            c.box((min(xs), y - .008, z), (max(xs), y + .008, z + .014), rib)


def engine(c, x, y0, y1, r, z=0.0, mat=PLATE):
    """A nacelle from y0 forward to y1 (rear), a frame collar, a white-gold nozzle; records the socket."""
    c.cyl((x, 0, z), 'y', r, y0, y1 - .05, mat, seg=10, r2=r * .92)
    c.cyl((x, 0, z), 'y', r * 1.04, y1 - .12, y1 - .05, FRAME, seg=10)
    c.cyl((x, 0, z), 'y', r * .78, y1 - .05, y1, HOT, seg=10)
    c.engines.append((x, y1, z))


def barrel(c, x, y_root, y_tip, r, z=0.0):
    c.cyl((x, 0, z), 'y', r * 1.5, y_root, y_root - .06, FRAME, seg=8)
    c.cyl((x, 0, z), 'y', r, y_root - .06, y_tip + .03, BRONZE, seg=8)
    c.cyl((x, 0, z), 'y', r * .7, y_tip + .03, y_tip, GLOW, seg=8)


def ring(c, centre, r0, r1, z0, z1, n, mats, gap=.03, arcs=None):
    """A segmented ring in plan (z-up axis): n blocky segments between radii r0 and r1, alternate paints."""
    cx, cy = centre
    for k in range(n):
        a0, a1 = TAU * k / n + gap, TAU * (k + 1) / n - gap
        if arcs and not any(lo <= (a0 + a1) / 2 % TAU <= hi for lo, hi in arcs):
            continue
        plan = [(cx + math.cos(a0) * r0, cy + math.sin(a0) * r0), (cx + math.cos(a0) * r1, cy + math.sin(a0) * r1),
                (cx + math.cos(a1) * r1, cy + math.sin(a1) * r1), (cx + math.cos(a1) * r0, cy + math.sin(a1) * r0)]
        c.slab(plan, z0, z1, mats[k % len(mats)])


def crescent(c, centre, r_in, r_out, a0, a1, z0, z1, mat, n=8, glow=True):
    """A crescent blade in plan from angle a0 to a1, thickest in its middle; a glowing inner face."""
    cx, cy = centre
    outer, inner = [], []
    for i in range(n + 1):
        t = i / n
        a = a0 + (a1 - a0) * t
        bulge = math.sin(math.pi * t)
        ro = r_in + (r_out - r_in) * (.15 + .85 * bulge)
        outer.append((cx + math.cos(a) * ro, cy + math.sin(a) * ro))
        inner.append((cx + math.cos(a) * r_in, cy + math.sin(a) * r_in))
    plan = outer + inner[::-1]
    # Faceted: one slab per span so each is convex.
    for i in range(n):
        quad = [outer[i], outer[i + 1], inner[i + 1], inner[i]]
        c.slab(quad, z0, z1, mat)
        if glow:
            mid = lambda p, q, f: (p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f)
            g = [mid(inner[i], outer[i], .25), mid(inner[i + 1], outer[i + 1], .25), mid(inner[i + 1], outer[i + 1], .7), mid(inner[i], outer[i], .7)]
            c.slab(g, z1, z1 + .008, GLOW, minor=True)
    return plan


def core(c, centre, r, z=0.0, rim=FRAME):
    """A glowing plasma core in a housing ring: a white-gold disc and dome, a gold ring."""
    cx, cy = centre
    c.cyl((cx, cy, 0), 'z', r * 1.3, z - .05, z + .05, rim, seg=16)
    c.cyl((cx, cy, 0), 'z', r * 1.12, z + .05, z + .07, GLOW, seg=16)
    c.cyl((cx, cy, 0), 'z', r, z + .05, z + .1, HOT, seg=16, r2=r * .55)


# ----------------------------------------------------------------------------- alien parts
# The user, 5 November: "looks a bit not so alien, make it a bit more alien looking". Star-forged forms instead of
# machinery: ridged lens shells, scythe blades with glowing inner edges, curved claws and mandibles with hot tips (no
# gun barrels), glowing slit engines in curved cowls, veins of plasma along the curves, and rings that float free of
# their craft, held by nothing (the brief's "magnetic structures").
def bez(p0, p1, p2, t):
    return tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c for a, b, c in zip(p0, p1, p2))


def shell(c, stations, mat, x=0.0, ridge=.35):
    """A lens hull along y with a dorsal ridge: stations (y, half width, top z, bottom z); eight points a section, the
    top drawn up into a keel line, the flanks pinched to knife edges."""
    loops = []
    for y, w, top, bot in stations:
        mid = (top + bot) / 2
        loops.append([(x - w, y, mid), (x - w * .78, y, mid + (top - mid) * .55), (x - w * .3, y, top - (top - mid) * ridge * .2), (x, y, top),
                      (x + w * .3, y, top - (top - mid) * ridge * .2), (x + w * .78, y, mid + (top - mid) * .55), (x + w, y, mid),
                      (x, y, bot)])
    c.loft(loops, mat)


def scythe(c, p0, p1, p2, w0, thick, mat, n=8, edge=True, side=1):
    """A curved blade along the quadratic curve p0-p1-p2, w0 wide at its root tapering to a point, a glowing inner
    edge (toward -x on the right side, +x on the left)."""
    pts = [bez(p0, p1, p2, i / n) for i in range(n + 1)]
    for i in range(n):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        d = (b - a).normalized(); nrm = Vector((-d.y, d.x, 0)) * side
        wa, wb = w0 * (1 - i / n) ** .8 + .004, w0 * (1 - (i + 1) / n) ** .8 + .004
        quad = [tuple((a + nrm * wa)[:2]), tuple((b + nrm * wb)[:2]), tuple((b - nrm * wb * .2)[:2]), tuple((a - nrm * wa * .2)[:2])]
        c.slab(quad, a.z - thick / 2, a.z + thick / 2, mat, minor=wa < .05)
        if edge:
            g = [tuple((a - nrm * wa * .2)[:2]), tuple((b - nrm * wb * .2)[:2]), tuple((b + nrm * wb * .15)[:2]), tuple((a + nrm * wa * .15)[:2])]
            c.slab(g, a.z + thick / 2, a.z + thick / 2 + .006, GLOW, minor=True)


def prong(c, base, tip, r, mat=BRONZE, hot=True, seg=6):
    """A tapered claw from base to tip (a curved one: give it a middle point), a hot point."""
    pts = [Vector(p) for p in ((base, tip) if len(tip) == 3 and not isinstance(tip[0], tuple) else (base,) + tuple(tip))]
    for k in range(len(pts) - 1):
        a, b = pts[k], pts[k + 1]
        ra, rb = r * (1 - k / (len(pts) - 1)), r * (1 - (k + 1) / (len(pts) - 1)) + .003
        ax = (b - a).normalized(); up = Vector((0, 0, 1)) if abs(ax.z) < .9 else Vector((1, 0, 0))
        u = ax.cross(up).normalized(); v = ax.cross(u).normalized()
        ring_ = lambda cc, rr: [tuple(cc + (u * math.cos(TAU * i / seg) + v * math.sin(TAU * i / seg) * .6) * rr) for i in range(seg)]
        c.loft([ring_(a, ra), ring_(b, rb)], mat, minor=True)
    if hot:
        t = pts[-1]
        c.cyl((t.x, t.y, t.z), 'z', .012, t.z - .012, t.z + .012, HOT, seg=6)


def vein(c, pts, r=.008):
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b)
        ax = (b - a).normalized(); up = Vector((0, 0, 1)) if abs(ax.z) < .9 else Vector((1, 0, 0))
        u = ax.cross(up).normalized(); v = ax.cross(u).normalized()
        ring_ = lambda cc: [tuple(cc + (u * math.cos(TAU * i / 4) + v * math.sin(TAU * i / 4)) * r) for i in range(4)]
        c.loft([ring_(a), ring_(b)], GLOW, minor=True)


def slit(c, x, y, w, z=0.0, depth=.05):
    """A glowing slit engine in a curved cowl at the tail; records the socket."""
    c.slab([(x - w, y - depth), (x + w, y - depth), (x + w * .8, y), (x - w * .8, y)], z - .035, z + .035, FRAME)
    c.slab([(x - w * .7, y - .01), (x + w * .7, y - .01), (x + w * .6, y + .012), (x - w * .6, y + .012)], z - .02, z + .02, HOT, minor=True)
    c.engines.append((x, y + .012, z))


def halo(c, centre, r, z, thick=.02, n=24, gap=0.0, mat=GLOW):
    """A ring floating free over (or round) a craft: thin, glowing, unattached."""
    cx, cy = centre
    pts = [(cx + math.cos(TAU * i / n + gap) * r, cy + math.sin(TAU * i / n + gap) * r, z) for i in range(n + 1)]
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized(); o = Vector((-d.y, d.x, 0)) * thick
        c.slab([tuple((a - o)[:2]), tuple((b - o)[:2]), tuple((b + o)[:2]), tuple((a + o)[:2])], z - thick * .4, z + thick * .4, mat, minor=True)


def orb(c, centre, r, z, mat=HOT, seg=10):
    cx, cy = centre
    loops = []
    for j in range(1, 6):
        t = math.pi * j / 6
        loops.append([(cx + math.sin(t) * r * math.cos(TAU * i / seg), cy + math.sin(t) * r * math.sin(TAU * i / seg), z - math.cos(t) * r * .7) for i in range(seg)])
    c.loft(loops, mat)


# ----------------------------------------------------------------------------- the craft
def build_interceptor():
    c = Craft()
    shell(c, [(-.62, .006, .01, -.01), (-.38, .07, .06, -.04), (0, .11, .09, -.05), (.35, .1, .08, -.05), (.6, .05, .04, -.03)], PLATE)
    vein(c, [(0, -.5, .02), (0, -.25, .068), (0, .1, .092), (0, .45, .07)])
    def side(s):
        prong(c, (s * .05, -.35, -.01), ((s * .14, -.55, -.01), (s * .06, -.66, -.01)), .028)          # mandible
        scythe(c, (s * .08, -.05, 0), (s * .42, .1, 0), (s * .36, .5, 0), .12, .02, PLATE, n=7, side=s)
        slit(c, s * .05, .62, .035)
    mirror(side)
    return c


def build_fighter():
    c = Craft()
    shell(c, [(-.8, .01, .02, -.01), (-.5, .1, .09, -.05), (-.1, .17, .13, -.07), (.3, .17, .12, -.07), (.66, .09, .07, -.05)], PLATE)
    vein(c, [(0, -.62, .04), (0, -.3, .11), (0, .1, .133), (0, .55, .1)])
    def side(s):
        # The wings: two great scythes sweeping back and out, their tips hooking forward, glowing inner edges and veins.
        scythe(c, (s * .12, -.2, .01), (s * .8, .05, .01), (s * .63, -.35, .01), .21, .03, PLATE, n=10, side=s)
        vein(c, [(s * .2, -.1, .03), (s * .45, -.04, .03), (s * .62, -.12, .03)])
        scythe(c, (s * .12, .3, 0), (s * .4, .55, 0), (s * .3, .78, 0), .1, .02, FRAME, n=6, side=s)
        prong(c, (s * .06, -.5, -.03), ((s * .1, -.7, -.03), (s * .04, -.8, -.03)), .022)
        slit(c, s * .07, .79, .05)
    mirror(side)
    return c


def build_hunter():
    c = Craft()
    shell(c, [(-.66, .07, .05, -.05), (-.4, .17, .13, -.1), (.1, .21, .15, -.1), (.5, .19, .13, -.09), (.72, .1, .07, -.05)], PLATE)
    # The plasma core shows through three glowing ribs across the back; a halo floats over it.
    for y in (-.2, 0, .2):
        c.box((-.15, y - .02, .13), (.15, y + .02, .155), GLOW)
    halo(c, (0, 0), .2, .205, thick=.018)
    def side(s):
        # Two long mandibles curving forward and in, a hot point each (no cannons).
        prong(c, (s * .12, -.45, 0), ((s * .3, -.62, 0), (s * .1, -.81, -.01)), .045)
        scythe(c, (s * .18, .05, 0), (s * .55, .3, 0), (s * .48, .55, 0), .12, .025, PLATE, n=7, side=s)
        vein(c, [(s * .2, -.3, .07), (s * .2, .3, .1)])
        slit(c, s * .08, .74, .05)
    mirror(side)
    return c


def build_carrier():
    c = Craft()
    # A manta: a broad layered lens, three shells stacked and stepped back, glowing seams between them.
    shell(c, [(-.7, .3, .1, -.1), (-.35, .6, .14, -.13), (.25, .7, .16, -.14), (.7, .45, .12, -.1), (.95, .2, .06, -.05)], PLATE, ridge=.6)
    shell(c, [(-.45, .2, .2, .05), (.0, .38, .24, .06), (.5, .3, .2, .05), (.8, .12, .14, .04)], FRAME)
    shell(c, [(-.15, .1, .25, .14), (.2, .18, .26, .15), (.55, .1, .24, .13)], PLATE)
    for y, w in ((-.4, .22), (.55, .3)):
        vein(c, [(-w, y, .19), (0, y - .05, .23), (w, y, .19)])
    halo(c, (0, .2), .34, .27, thick=.02)
    for x, tip in ((-.34, -.99), (-.12, -.93), (.12, -.93), (.34, -.99)):
        prong(c, (x, -.6, -.02), ((x * 1.25, -.8, -.02), (x * .9, tip, -.03)), .035)
    def side(s):
        scythe(c, (s * .55, .1, 0), (s * .83, .35, 0), (s * .7, .75, 0), .16, .03, PLATE, n=7, side=s)
        slit(c, s * .2, .96, .08)
    mirror(side)
    return c


def build_artillery():
    c = Craft()
    # The ring floats free of the core in five arcs (no spokes); the core hangs at its heart under a small halo; four
    # crescents ride outside it.
    for k in range(5):
        a0 = TAU * k / 5 + .1
        crescent(c, (0, .02), .5, .62, a0, a0 + TAU / 5 - .2, -.04, .04, PLATE, n=5, glow=k % 2 == 0)
    orb(c, (0, .02), .2, .02)
    halo(c, (0, .02), .3, .12, thick=.015)
    halo(c, (0, .02), .3, -.08, thick=.012, mat=FRAME)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        crescent(c, (0, .02), .66, .71, a - .45, a + .45, -.03, .03, FRAME, n=5)
    prong(c, (0, -.62, 0), ((.08, -.76, 0), (0, -.89, 0)), .04)
    for s in (-1, 1):
        slit(c, s * .1, .86, .05)
    return c


def build_drone():
    c = Craft()
    orb(c, (0, 0), .09, 0)
    halo(c, (0, 0), .19, .0, thick=.025, mat=PLATE)
    halo(c, (0, 0), .19, .02, thick=.012)
    for a in (0, math.pi):
        crescent(c, (0, 0), .22, .27, a - .7, a + .7, -.02, .02, PLATE, n=4)
    prong(c, (0, -.12, 0), ((.03, -.22, 0), (0, -.3, 0)), .02, hot=False)
    c.engines.append((0, .27, 0))
    return c


def build_turret():
    c = Craft()
    # A basalt plinth, three claws curling up round a glowing eye, a floating halo over it, and a long prong aimed at
    # the player.
    hexa = lambda r: [(math.cos(TAU * k / 6 + math.pi / 6) * r, math.sin(TAU * k / 6 + math.pi / 6) * r) for k in range(6)]
    c.slab(hexa(.48), -.05, .1, FRAME)
    c.slab(hexa(.4), .1, .13, BRONZE)
    for k in range(3):
        a = TAU * k / 3 + math.pi / 2
        p0 = (math.cos(a) * .32, math.sin(a) * .32, .13)
        prong(c, p0, ((math.cos(a) * .36, math.sin(a) * .36, .4), (math.cos(a) * .14, math.sin(a) * .14, .58)), .07, mat=PLATE)
    orb(c, (0, 0), .14, .36)
    halo(c, (0, 0), .22, .6, thick=.02)
    prong(c, (0, -.08, .34), ((0, -.3, .38), (0, -.5, .36)), .05)
    return c


def build_wraith():
    c = Craft()
    # Hub: the core under a floating halo; a ridged spine forward to curved twin mandibles; shells and slits aft.
    orb(c, (0, .05), .24, .06)
    halo(c, (0, .05), .38, .2, thick=.03)
    halo(c, (0, .05), .3, -.06, thick=.02, mat=FRAME)
    shell(c, [(-1.55, .02, .03, -.02), (-1.2, .1, .1, -.06), (-.5, .2, .16, -.1), (-.15, .22, .14, -.08)], PLATE)
    shell(c, [(.3, .24, .16, -.1), (.8, .3, .2, -.12), (1.3, .18, .13, -.08), (1.42, .06, .05, -.03)], PLATE)
    vein(c, [(0, -1.3, .06), (0, -.8, .14), (0, -.3, .16)])
    vein(c, [(0, .35, .16), (0, .9, .2), (0, 1.3, .13)])
    def side(s):
        prong(c, (s * .08, -1.45, 0), ((s * .2, -1.65, 0), (s * .06, -1.86, 0)), .045)
        # The great crescent wings, free of the hull at their roots: each a scythe sweeping round the hub.
        crescent(c, (0, .1), 1.02, 1.5, (math.pi / 2 - 1.35) if s > 0 else (math.pi / 2 + 1.35), (math.pi / 2 - 2.95) if s > 0 else (math.pi / 2 + 2.95),
                 -.04, .06, PLATE, n=10)
        scythe(c, (s * .3, .5, 0), (s * .75, .7, 0), (s * .6, 1.2, 0), .18, .04, FRAME, n=7, side=s)
        vein(c, [(s * .35, .55, .03), (s * .6, .75, .03), (s * .58, 1.05, .03)])
        slit(c, s * .12, 1.4, .07)
        slit(c, s * .35, 1.2, .05)
    mirror(side)
    return c


BUILDERS = {'corona_interceptor': build_interceptor, 'corona_fighter': build_fighter, 'corona_hunter': build_hunter,
            'corona_carrier': build_carrier, 'corona_artillery': build_artillery, 'corona_drone': build_drone,
            'corona_turret': build_turret, 'corona_wraith': build_wraith}


def materials():
    return {name: br.material(name, spec[0], spec[1], spec[2], spec[3] if len(spec) > 3 else None, 2.6 if len(spec) > 3 else 0)
            for name, spec in PAINT.items()}


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    sc = br.scene('corona_craft')
    mats = materials()
    objects, report, problems = [], [], []
    for name, build in BUILDERS.items():
        c = build()
        ob = c.object(name, mats, sc)
        br.bake_ao([ob], [ob], strength=.7, reach=.35, ground=(-0.05 if name == 'corona_turret' else -50), rays=24)
        objects.append(ob)
        for i, (x, y, z) in enumerate(c.engines):
            e = bpy.data.objects.new('%s_engine_%d' % (name, i), None)
            e.location = (x, y, z)
            e.parent = ob
            sc.collection.objects.link(e)
            objects.append(e)
        pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        r = RULES[name]
        w, l = hi.x - lo.x, hi.y - lo.y
        if w > r['foot'][0] + .02 or l > r['foot'][1] + .02:
            problems.append('%s footprint %.2f x %.2f over %s' % (name, w, l, r['foot']))
        if lo.z < r['z'][0] - .02 or hi.z > r['z'][1] + .02:
            problems.append('%s height %.2f..%.2f outside %s' % (name, lo.z, hi.z, r['z']))
        report.append('%s: %d tris, %.2f x %.2f (glTF x, z), height %.2f..%.2f, %d engines' % (
            name, br.triangles([ob]), w, l, lo.z, hi.z, len(c.engines)))
    if '--no-export' not in args:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        result = br.export(OUT, objects, 'Last Worlds Corona fleet (tools/blender/corona_craft.py)')
        report.append('export %s: %d triangles, %d bytes' % (result['file'], result['triangles'], result['bytes']))
    if '--preview' in args:
        os.makedirs(PREVIEW, exist_ok=True)
        meshes = [o for o in objects if o.type == 'MESH']
        xs = [-3.0, -1.4, 0.0, 1.5, 3.0, -2.2, 0.0, 2.4]
        ys = [-1.4, -1.4, -1.4, -1.4, -1.4, 1.6, 1.6, 1.6]
        order = ['corona_drone', 'corona_interceptor', 'corona_fighter', 'corona_hunter', 'corona_turret', 'corona_carrier', 'corona_artillery', 'corona_wraith']
        for ob, name in ((next(o for o in meshes if o.name == n), n) for n in order):
            i = order.index(name)
            ob.location = (xs[i], ys[i], 0)
        ground = bpy.data.objects.get('craft_preview_ground')
        if not ground:
            me = bpy.data.meshes.new('craft_preview_ground')
            me.from_pydata([(-9, -9, -.6), (9, -9, -.6), (9, 9, -.6), (-9, 9, -.6)], [], [(0, 1, 2, 3)])
            ground = bpy.data.objects.new('craft_preview_ground', me)
            sc.collection.objects.link(ground)
            ground.data.materials.append(br.material('craft_preview_ground', '#2a2220', .9, 0))
        shown = meshes + [ground]
        report.append('preview %s' % br.render_view(sc, 'top', (0, .1, 0), 8.6, os.path.join(PREVIEW, 'craft-top.png'), res=1400, objects=shown))
        report.append('preview %s' % br.render_view(sc, 'game', (0, .1, 0), 8.6, os.path.join(PREVIEW, 'craft-game.png'), res=1400, objects=shown))
        report.append('preview %s' % br.render_view(sc, 'three_quarter', (0, .1, 0), 8.6, os.path.join(PREVIEW, 'craft-hero.png'), res=1400, objects=shown))
    print('\n'.join('CCRAFT ' + line for line in report))
    for p in problems:
        print('CCRAFT PROBLEM', p)
    print('CCRAFT DONE', 'FAILED %d' % len(problems) if problems else 'OK')


main()
