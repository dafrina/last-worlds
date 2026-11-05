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


# ----------------------------------------------------------------------------- the craft
def build_interceptor():
    c = Craft()
    hull(c, [(-.64, .005, .01, -.01), (-.4, .06, .05, -.04), (-.05, .1, .08, -.06), (.35, .12, .08, -.06), (.58, .09, .06, -.05)], PLATE)
    c.cyl((0, 0, 0), 'y', .012, -.66, -.5, HOT, seg=6)                       # the glowing spike tip
    c.box((-.03, -.38, .05), (.03, .2, .095), FRAME)                          # dorsal spine
    c.box((-.022, -.3, .09), (.022, -.1, .1), GLOW)                           # canopy slit
    plating(c, -.05, .45, .07, .075, 3)
    def side(s):
        panel(c, [(s * .1, -.02), (s * .38, .18), (s * .38, .34), (s * .1, .3)], .0, cells=2)
        c.box((min(s * .36, s * .41), .14, -.03), (max(s * .36, s * .41), .38, .04), FRAME)
        engine(c, s * .1, .28, .66, .055)
    mirror(side)
    return c


def build_fighter():
    c = Craft()
    hull(c, [(-.82, .01, .02, -.01), (-.55, .08, .07, -.05), (-.2, .16, .11, -.07), (.25, .18, .11, -.07), (.6, .14, .08, -.06)], PLATE)
    c.box((-.05, -.5, .09), (.05, .3, .14), FRAME)
    c.box((-.035, -.42, .13), (.035, -.18, .15), GLOW)
    plating(c, -.12, .55, .12, .105, 4)
    barrel(c, 0, -.55, -.8, .018, z=-.05)
    def side(s):
        wing = [(s * .14, -.25), (s * .72, .08), (s * .75, .3), (s * .6, .36), (s * .16, .3)]
        c.slab(wing, -.02, .02, PLATE)
        panel(c, [(s * .22, -.1), (s * .6, .13), (s * .6, .27), (s * .22, .22)], .02, cells=3)
        c.box((min(s * .68, s * .76), .02, -.04), (max(s * .68, s * .76), .4, .1), FRAME)   # wingtip fin
        c.box((min(s * .7, s * .74), -.12, -.02), (max(s * .7, s * .74), .02, .03), BRONZE)   # forward prong
        engine(c, s * .2, .2, .82, .085)
    mirror(side)
    return c


def build_hunter():
    c = Craft()
    hull(c, [(-.72, .06, .05, -.05), (-.45, .16, .12, -.1), (.1, .2, .14, -.1), (.55, .18, .12, -.09), (.72, .12, .08, -.06)], PLATE)
    # The plasma core: a glowing tube along the spine, banded by frame rings.
    c.cyl((0, 0, .1), 'y', .07, -.35, .45, HOT, seg=10)
    for y in (-.25, -.05, .15, .35):
        c.cyl((0, 0, .1), 'y', .085, y, y + .04, FRAME, seg=10)
    plating(c, -.5, -.36, .1, .1, 1, vent=False)
    plating(c, .45, .68, .1, .1, 2, vent=False)
    for s in (-1, 1):
        barrel(c, s * .1, -.6, -.81, .024, z=-.03)
    def side(s):
        c.cyl((s * .3, 0, 0), 'y', .07, -.35, .4, FRAME, seg=8)
        c.box((min(s * .25, s * .36), -.2, .04), (max(s * .25, s * .36), .3, .075), PLATE)
        c.box((min(s * .355, s * .375), -.1, -.01), (max(s * .355, s * .375), .2, .03), GLOW)
        wing = [(s * .35, .1), (s * .55, .3), (s * .55, .48), (s * .35, .42)]
        c.slab(wing, -.015, .015, PLATE)
        panel(c, [(s * .38, .18), (s * .52, .33), (s * .52, .44), (s * .38, .39)], .015, cells=2)
        engine(c, s * .15, .45, .81, .08)
    mirror(side)
    return c


def build_carrier():
    c = Craft()
    hull(c, [(-.72, .26, .12, -.1), (-.4, .36, .2, -.13), (.3, .38, .22, -.14), (.75, .3, .18, -.12)], PLATE)
    # Stacked armour plates on top, a glowing dorsal vent.
    c.box((-.26, -.35, .2), (.26, .45, .26), FRAME, chamfer=.06)
    c.box((-.18, -.25, .26), (.18, .3, .28), PLATE, chamfer=.04)
    c.box((-.05, -.2, .275), (.05, .25, .285), GLOW)
    plating(c, -.68, -.38, .3, .15, 2)
    plating(c, .46, .74, .27, .17, 2)
    for x in (-.32, -.11, .11, .32):
        barrel(c, x, -.72, -.99, .03, z=-.02)
    def side(s):
        c.box((min(s * .36, s * .5), -.3, -.06), (max(s * .36, s * .5), .5, .12), FRAME, chamfer=.03)
        wing = [(s * .48, -.05), (s * .83, .15), (s * .83, .42), (s * .48, .5)]
        c.slab(wing, -.02, .03, PLATE)
        panel(c, [(s * .52, .05), (s * .78, .2), (s * .78, .38), (s * .52, .42)], .03, cells=3)
        engine(c, s * .24, .6, .99, .13)
    mirror(side)
    return c


def build_artillery():
    c = Craft()
    ring(c, (0, .02), .5, .64, -.05, .05, 12, [PLATE, FRAME])
    core(c, (0, .02), .19, z=0.0)
    # Spokes to the ring, four gold crescents outside it on the diagonals.
    for k in range(4):
        a = math.radians(45 + 90 * k)
        p0, p1 = (math.cos(a) * .22, .02 + math.sin(a) * .22), (math.cos(a) * .52, .02 + math.sin(a) * .52)
        w = .035
        nx, ny = -math.sin(a) * w, math.cos(a) * w
        c.slab([(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)], -.03, .04, FRAME)
        crescent(c, (0, .02), .66, .71, a - .5, a + .5, -.03, .04, PLATE, n=6)
    # A forward module and twin engines behind.
    c.box((-.12, -.84, -.05), (.12, -.55, .08), PLATE, chamfer=.04)
    barrel(c, 0, -.84, -.9, .03)
    for s in (-1, 1):
        engine(c, s * .12, .6, .88, .07)
    return c


def build_drone():
    c = Craft()
    ring(c, (0, 0), .17, .23, -.025, .025, 8, [PLATE, FRAME])
    core(c, (0, 0), .08, z=-.01)
    for a in (0, math.pi):
        crescent(c, (0, 0), .235, .27, a - .7, a + .7, -.02, .02, PLATE, n=4)
    c.box((-.03, .2, -.02), (.03, .33, .03), FRAME)
    c.engines.append((0, .33, 0))
    return c


def build_turret():
    c = Craft()
    # A hexagonal basalt plinth with bronze trim, a drum, a twin-barrelled head aimed at the player, a gold vent.
    hexa = lambda r: [(math.cos(TAU * k / 6 + math.pi / 6) * r, math.sin(TAU * k / 6 + math.pi / 6) * r) for k in range(6)]
    c.slab(hexa(.5), -.05, .12, FRAME)
    c.slab(hexa(.44), .12, .16, BRONZE)
    c.cyl((0, 0, 0), 'z', .3, .16, .34, PLATE, seg=12, r2=.26)
    c.cyl((0, 0, 0), 'z', .27, .34, .37, GLOW, seg=12)
    c.box((-.22, -.2, .37), (.22, .22, .55), PLATE, chamfer=.06)
    c.box((-.14, -.1, .55), (.14, .16, .6), FRAME, chamfer=.04)
    c.box((-.05, .05, .6), (.05, .14, .62), GLOW)
    for s in (-1, 1):
        barrel(c, s * .1, -.2, -.5, .035, z=.46)
    return c


def build_wraith():
    c = Craft()
    # Hub: the glowing plasma core in a heavy ring; a spine forward to twin nose prongs; engines aft.
    ring(c, (0, .05), .26, .4, -.06, .1, 12, [PLATE, FRAME])
    core(c, (0, .05), .22, z=.02)
    hull(c, [(-1.6, .02, .03, -.02), (-1.25, .1, .1, -.06), (-.5, .2, .16, -.1), (.0, .22, .16, -.1)], PLATE)
    hull(c, [(.3, .22, .16, -.1), (.9, .26, .18, -.12), (1.4, .2, .14, -.1)], PLATE)
    c.box((-.06, -1.2, .12), (.06, -.45, .2), FRAME)
    plating(c, .45, 1.3, .2, .15, 4)
    c.box((-.035, -1.1, .19), (.035, -.6, .21), GLOW)
    def side(s):
        c.box((min(s * .05, s * .13), -1.88, -.02), (max(s * .05, s * .13), -1.5, .04), BRONZE)    # nose prong
        c.cyl((s * .09, 0, .01), 'y', .012, -1.88, -1.83, HOT, seg=6)
        # Struts from the hub to the crescent, the crescent itself (a great gold-lined scythe).
        for y0, y1 in ((-.05, -.35), (.15, .35)):
            c.slab([(s * .38, y0 - .05), (s * 1.0, y1 - .05), (s * 1.0, y1 + .05), (s * .38, y0 + .05)], -.03, .05, FRAME)
        crescent(c, (0, .1), 1.02, 1.5, (math.pi / 2 - 1.35) if s > 0 else (math.pi / 2 + 1.35), (math.pi / 2 - 2.95) if s > 0 else (math.pi / 2 + 2.95),
                 -.04, .06, PLATE, n=10)
        # Shoulder armour and the engine banks.
        c.box((min(s * .22, s * .55), .35, -.08), (max(s * .22, s * .55), 1.1, .2), PLATE, chamfer=.06)
        panel(c, [(s * .26, .45), (s * .5, .45), (s * .5, .95), (s * .26, .95)], .2, cells=4)
        engine(c, s * .2, 1.0, 1.4, .12)
        engine(c, s * .45, 1.0, 1.3, .09)
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
