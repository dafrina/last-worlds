"""Nahara's sandstone ruin kit (docs/39): the terrain's ruins after art/concepts/nahara/01-world.

User, 12 November 2026 (the Nahara handover): "Massive sandstone structures ... Monumental ruined alien buildings. Giant
ancient pillars. Broken arches and bridges. Partially buried temple structures. Huge circular mechanical structures
embedded in rock. Turquoise illuminated conduits"; "also use blender for the sandstone ruins that are part of the
terrain". After the concept: everything is built of large stacked sandstone blocks, chamfered and a little uneven,
warm sand to mid brown, with turquoise light only in thin grooves, slits and the cores of the old machines.

Nodes (public/assets/nahara/nahara-kit.glb; src/world/scenery-kit.ts KIT, kinds nah*):
    nah_wall_0..3     cliff facing on the cliff-wall contract (below): great courses; tall slits, a tall portal, a conduit
    nah_tower_0..2    three setback masses, a lit door and slits; the third broken off
    nah_gate_0..1     a framed portal, its opening glowing
    nah_pillar_0..2   the chasm's monoliths: great blocks piled up (the concept's towers out of the haze); the third broken
    nah_arch_0..1     a massive arch from foot (x -1) to foot (x +1), wedge voussoirs; the second broken
    nah_spur_0..1     a broken half arch from a pier at x -1, reaching toward +x
    nah_ring_0        a circular mechanism in a square frame, its core glowing
    nah_blocks_0..2   rubble: a few great tumbled blocks
Detail (joints, courses, per-block shading) is the world's masonry map, not geometry (user, 12 November).
Frames: base-centre pivot, x right, the front toward the camera (-y), z up; tops are normalised to 1 at load (exactTop).
The walls: x -1.05 .. 1.05, y -0.35 (front relief) .. 0.6 (into the slope), base -0.15, top exactly 1 (the terrain scales
their height by the local drop). Colour is the material's base colour times the AO in COLOR_0; materials named *glow*
glow (the kit shader's turquoise glowColor).

Headless (every path Blender sees is a Windows path):
  cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
    --python '\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\tools\\blender\\nahara_kit.py' -- [--preview] [--no-export]
"""
import bpy, math, os, random, sys
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boss_remodel as br
import remodel_facilities as rf
from remodel_facilities import B

OUT = os.path.join(br.ROOT, 'public', 'assets', 'nahara', 'nahara-kit.glb')
PREVIEW = os.path.join(br.ROOT, 'lookdev', 'nahara')
# The handover's palette: light sand, warm sandstone, mid brown, the canyon shadow, bronze, and the turquoise energy.
# (13 November: a little darker and closer together, as the cliffs' sandstone; the pale sand read as clean toy blocks.)
PAINT = dict(nah_sand=('#c4a677', .9, .0), nah_stone=('#a98860', .88, .0), nah_brown=('#86664a', .9, .0),
             nah_dark=('#3a2e26', .92, .0), nah_bronze=('#7a5a32', .5, .55), nah_glow=('#43d8c8', .4, .0))
SAND, STONE, BROWN, DARK, BRONZE, GLOW = 'nah_sand', 'nah_stone', 'nah_brown', 'nah_dark', 'nah_bronze', 'nah_glow'
ROLES = [SAND, STONE, BROWN, DARK, BRONZE, GLOW]


def materials():
    return {n: br.material(n, c, r, m) for n, (c, r, m) in PAINT.items()}


def tone(rng):
    """A block's sandstone: mostly warm sandstone, some light sand, a few mid brown."""
    u = rng.random()
    # Quiet variation, as the concept's: brown only now and then (a checkerboard of dark blocks read as patchwork).
    return SAND if u < .32 else STONE if u < .93 else BROWN


# Big blocks only (user, 12 November: "make larger structures and just use textures for details"): the masonry joints, the
# per-block shading and the courses come from the world's masonry detail map (src/render/terrain-kit.ts, box-projected in
# world units), so a piece is a few chamfered masses, never hundreds of small blocks.

class RoundKit(rf.Kit):
    """The kit's solids, finished with no extra bevel and smooth shading across the rounded blocks' 45-degree cuts, so a
    block reads pillowy like the concept's weathered sandstone (rblock and the voussoirs carry their own rounding)."""

    def object(self, name, mats, sc):
        # (45: the blocks' flat tops keep their own plane, smooth only down the rounded edge onto the faces; at 60 the tops
        # took the edge's normals and shaded like domes, user 13 November: "top shadow ... looks weird".)
        a = self.major.object(name + '_major', mats, (0, 0, 0), sc, bevel=0, sharp=45)
        b = self.minor.object(name + '_minor', mats, (0, 0, 0), sc, bevel=0)
        ob = br.join([a, b], name, (0, 0, 0))
        br.merge_slots(ob)
        return ob


def open_tops(ob, floor=.9):
    """The AO is sampled at the corners only, so a neighbour's occlusion at one corner of a broad top smeared across the
    whole of it as a soft dark wedge: tops (faces looking up) keep at most a trace of it."""
    me = ob.data
    attr = me.color_attributes.get('Color')
    if attr is None:
        return
    values = [0.0] * (len(me.loops) * 4)
    attr.data.foreach_get('color', values)
    rot = ob.matrix_world.to_3x3().normalized()
    for p in me.polygons:
        if (rot @ p.normal).normalized().z > .8:
            for li in p.loop_indices:
                v = max(values[li * 4], floor)
                values[li * 4:li * 4 + 3] = [v, v, v]
    attr.data.foreach_set('color', values)


def octagon(a0, a1, b0, b1, c):
    c = max(0.0, min(c, (a1 - a0) * .45, (b1 - b0) * .45))
    return [(a0 + c, b0), (a1 - c, b0), (a1, b0 + c), (a1, b1 - c), (a1 - c, b1), (a0 + c, b1), (a0, b1 - c), (a0, b0 + c)]


def rblock(k, x0, x1, y0, y1, z0, z1, mat, r=.08):
    """A weathered block: every edge rounded (an octagonal plan, its top and bottom rims cut back as well)."""
    x0, x1, y0, y1, z0, z1 = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), min(z0, z1), max(z0, z1)
    r = max(.005, min(r, (x1 - x0) * .3, (y1 - y0) * .3, (z1 - z0) * .3))
    inner = octagon(x0 + r * .7, x1 - r * .7, y0 + r * .7, y1 - r * .7, r * .6)
    outer = octagon(x0, x1, y0, y1, r)
    loops = [[(x, y, z0) for x, y in inner], [(x, y, z0 + r) for x, y in outer], [(x, y, z1 - r) for x, y in outer], [(x, y, z1) for x, y in inner]]
    k.major.loft(loops, mat)


def voussoir(k, t0, t1, rx0, rx1, rz0, rz1, zc, d, mat, r=.035):
    """A rounded wedge stone of an elliptic ring between angles t0 and t1 (radians, from +x over the top): its section across
    the ring an octagon (rounded front and back edges), its ends cut back at the joints."""
    def at(t, f, y):
        return (math.cos(t) * (rx0 + (rx1 - rx0) * f), y, zc + math.sin(t) * (rz0 + (rz1 - rz0) * f))
    ring = max(rx1 - rx0, rz1 - rz0)
    cf, cy = r / ring, r
    full = [(cf, -d), (1 - cf, -d), (1, -d + cy), (1, d - cy), (1 - cf, d), (cf, d), (0, d - cy), (0, -d + cy)]
    inset = [(cf * .8 + f * (1 - 2 * cf * .8), y * (1 - cy * .8 / d)) for f, y in [(0, -1 * d), (1, -1 * d), (1, -d), (1, d), (1, d), (0, d), (0, d), (0, -d)]]
    inset = [(min(max(f, cf * .7), 1 - cf * .7), max(min(y, d - cy * .7), -d + cy * .7)) for f, y in full]
    dt = (t1 - t0) * .1
    loops = [[at(t0, f, y) for f, y in inset], [at(t0 + dt, f, y) for f, y in full], [at(t1 - dt, f, y) for f, y in full], [at(t1, f, y) for f, y in inset]]
    k.major.loft(loops, mat)


def tower_of_blocks(k, rng, courses, half, z0=0.0, z1=1.0, taper=0.0, broken=0, openings=(), r=.07):
    """The concept's towers: courses of two to four rounded blocks, bonded (a course split across, the next split along), the
    outline stepping in and out course by course, the last `broken` courses losing blocks. `openings` are (face x0, x1,
    course from, course to) cut into the front face: deep dark recesses lit teal at the back and up their jambs."""
    heights = [rng.uniform(.8, 1.2) for _ in range(courses)]
    scale = (z1 - z0) / sum(heights)
    z = z0
    h = half
    for c, hh in enumerate(heights):
        top = z + hh * scale
        w = half * (1 - taper * c / courses) * rng.uniform(.9, 1.04)
        hx, hy = w * rng.uniform(.94, 1.0), w * rng.uniform(.94, 1.0)
        across = c % 2 == 0
        cuts = [-1.0]
        while cuts[-1] < .99:
            cuts.append(min(1.0, cuts[-1] + rng.uniform(.6, 1.1)))
        if 1 - cuts[-2] < .35 and len(cuts) > 2:
            cuts.pop(-2)
        cuts[-1] = 1.0
        lost = broken and c >= courses - broken
        for a, b in zip(cuts, cuts[1:]):
            if lost and rng.random() < .45:
                continue
            ox, oy = rng.uniform(-.03, .03) * w, rng.uniform(-.03, .03) * w
            if across:
                xa, xb, ya, yb = a * hx, b * hx, -hy, hy
            else:
                xa, xb, ya, yb = -hx, hx, a * hy, b * hy
            # Leave the front openings out of the courses they cut.
            pieces = [(xa, xb)]
            for (o0, o1, c0, c1) in openings:
                if c0 <= c <= c1:
                    pieces = [p for q in pieces for p in ((q[0], min(q[1], o0 * w)), (max(q[0], o1 * w), q[1])) if p[1] - p[0] > .04]
            for pa, pb in pieces:
                cut_front = across and any(c0 <= c <= c1 and pa < o1 * w and pb > o0 * w for (o0, o1, c0, c1) in openings)
                rblock(k, pa + ox + .01, pb + ox - .01, ya + oy + .01, yb + oy - .01, z + .006, top - .006, tone(rng), r * w)
            if not across:
                # A split along: the front face shows one block; openings still need their gap.
                pass
        z = top
    for (o0, o1, c0, c1) in openings:
        zb = z0 + sum(heights[:c0]) * scale
        zt = z0 + sum(heights[:c1 + 1]) * scale
        B(k, o0 * half, o1 * half, -half * .55, -half * .2, zb, zt, DARK)
        B(k, o0 * half + .02, o1 * half - .02, -half * .56, -half * .53, zb + .01, zt - .02, GLOW)
        for x in (o0 * half + .015, o1 * half - .015):
            B(k, x - .012, x + .012, -half * .95, -half * .56, zb + .02, zt - .03, GLOW)


def carved(k, x0, x1, y0, y1, z0, z1, holes, mat):
    """A continuous face from x0 to x1 (front y0, back y1, base z0, top z1) with `holes` (x0, x1, z0, z1) cut through it:
    split into as few boxes as the openings allow."""
    cuts = sorted({c for h in holes for c in (h[0], h[1]) if x0 < c < x1})
    edges = [x0] + cuts + [x1]
    for e0, e1 in zip(edges, edges[1:]):
        mid = (e0 + e1) / 2
        spans = [(z0, z1)]
        for (h0, h1, hz0, hz1) in holes:
            if h0 <= mid <= h1:
                spans = [(a0, min(a1, hz0)) for a0, a1 in spans if a0 < hz0] + [(max(a0, hz1), a1) for a0, a1 in spans if a1 > hz1]
        for a0, a1 in spans:
            if a1 - a0 > .01:
                B(k, e0, e1, y0, y1, a0, a1, mat)


def wall(variant):
    """A carved front of a cliff, on the cliff-wall contract (stretched to the cliff's drop, its masonry the world's map laid
    level in world units, src/render/terrain-kit.ts): one continuous face, a little proud of the rock, and only tall
    features, which keep their look however far the piece is stretched (user, 13 November: the facings of stacked blocks
    stretched into "vertical planks"). Pilasters; tall lit slits; a tall stepped portal; a high window over a conduit."""
    k = rf.Kit(ROLES)
    # The dark backing: what shows at the back of every opening.
    B(k, -1.05, 1.05, -.06, .6, -.15, .94, DARK)
    # A stone cap over the whole depth at the rim: from above the piece reads as the cliff's own top, not a dark slab.
    B(k, -1.05, 1.05, -.24, .6, .94, 1.0, STONE)
    holes = {1: [(-.52, -.42, .1, .86), (.42, .52, .1, .86)], 2: [(-.3, .3, -.15, .7)], 3: [(.3, .5, .52, .84)]}.get(variant, [])
    carved(k, -1.05, 1.05, -.24, -.04, -.15, .94, holes, STONE)
    # Pilasters: tall shallow piers proud of the face (flanking the slits and the portal, framing the plain face).
    piers = {0: [(-.78, -.56), (.56, .78)], 1: [(-.7, -.56), (.56, .7)], 2: [(-.46, -.3), (.3, .46)], 3: [(-.86, -.7)]}[variant]
    for p0, p1 in piers:
        B(k, p0, p1, -.34, -.2, -.15, .97 if variant != 2 else .82, SAND)
    if variant == 2:
        # The portal's stepped head over its jambs.
        B(k, -.46, .46, -.34, -.2, .7, .82, SAND)
        B(k, -.36, .36, -.3, -.2, .82, .9, STONE)
    for (h0, h1, hz0, hz1) in holes:
        # The light at the back of each opening.
        inset = .02 if h1 - h0 < .2 else .08
        B(k, h0 + inset, h1 - inset, -.08, -.06, hz0 + .03, hz1 - .04, GLOW)
    if variant == 3:
        # A conduit running down the face from the window: a thin lit groove.
        B(k, .385, .415, -.255, -.235, .05, .52, GLOW)
    return k


def tower(variant):
    """A ruined tower on the tablelands, as the concept's: bonded courses of rounded blocks stepping in as it rises, a tall
    recessed doorway lit teal at its foot; the second with a lit slit higher up; the third broken off."""
    rng = random.Random(9200 + variant)
    k = RoundKit(ROLES)
    openings = [(-.22, .22, 0, 2)] + ([(-.08, .08, 4, 6)] if variant == 1 else [])
    tower_of_blocks(k, rng, 8 if variant < 2 else 6, .72, 0, 1, taper=.25, broken=2 if variant == 2 else 0, openings=openings)
    return k


def gate(variant):
    """A massive framed portal: two jamb masses, a lintel and a stepped crown; its deep opening glows at the back."""
    rng = random.Random(9300 + variant)
    k = rf.Kit(ROLES)
    w, d = 1.0, .4
    B(k, -w, -.48, -d, d, 0, .82, tone(rng))
    B(k, .48, w, -d, d, 0, .82, tone(rng))
    B(k, -w - .04, w + .04, -d - .04, d, .82, .94, STONE)
    B(k, -.7, .7, -d * .6, d * .6, .94, 1.0, SAND)
    B(k, -.48, .48, .1, .3, 0, .82, DARK)
    B(k, -.38, .38, .08, .12, 0, .64 + variant * .06, GLOW)
    for x in (-.45, .45):
        B(k, x - .02, x + .02, -d - .03, -d, .08, .74, GLOW)
    return k


def stack(variant):
    """The chasm's monoliths, as the concept's towers out of the haze: ten bonded courses of great rounded blocks, the outline
    stepping in and out, a tall lit doorway low down (first), a lit slit up its face (second), broken off (third)."""
    rng = random.Random(9400 + variant)
    k = RoundKit(ROLES)
    openings = [[(-.2, .2, 1, 3)], [(-.07, .07, 3, 7)], [(.25, .55, 2, 4)]][variant]
    tower_of_blocks(k, rng, 10, .98, 0, 1, taper=.12, broken=3 if variant == 2 else 1, openings=openings)
    return k


def arch(variant):
    """A massive arch from foot (x -1) to foot (x +1), as the concept's: piers of great rounded blocks, a deep ring of
    rounded wedge voussoirs to the crown (top 1), a teal channel inlaid along its front face. The second is broken: its
    crown fallen."""
    rng = random.Random(9500 + variant)
    k = RoundKit(ROLES)
    d, zc = .2, .4
    for side in (-1, 1):
        z = 0
        for hh in (.15, .13, .12):
            rblock(k, side * .7, side * 1.0, -d - .01, d + .01, z + .004, z + hh - .004, tone(rng), .035)
            z += hh
    n, skip = 9, ((4, 5) if variant == 1 else ())
    for i in range(n):
        if i in skip:
            continue
        t0, t1 = math.pi * (1 - i / n), math.pi * (1 - (i + 1) / n)
        voussoir(k, t0, t1, .7, 1.0, .36, .6, zc, d, tone(rng))
    channel(k, .7, 1.0, .36, .6, zc, d, math.pi, 0, n, skip)
    return k


def channel(k, rx0, rx1, rz0, rz1, zc, d, a0, a1, n, skip=()):
    """The teal channel inlaid along a ring's front face, a third of the way out from the soffit, broken where stones fell."""
    f = .3
    run = []
    for i in range(n * 3 + 1):
        t = a0 + (a1 - a0) * i / (n * 3)
        stone = min(n - 1, i // 3)
        if stone in skip or (i % 3 == 0 and 0 < i // 3 and (i // 3 - 1) in skip):
            if len(run) > 1:
                k.minor.loft(run, GLOW)
            run = []
            continue
        rx, rz = rx0 + (rx1 - rx0) * f, rz0 + (rz1 - rz0) * f
        c, s_ = math.cos(t), math.sin(t)
        w = .022
        run.append([(c * (rx - w), -d - .012, zc + s_ * (rz - w)), (c * (rx + w), -d - .012, zc + s_ * (rz + w)),
                    (c * (rx + w), -d + .01, zc + s_ * (rz + w)), (c * (rx - w), -d + .01, zc + s_ * (rz - w))])
    if len(run) > 1:
        k.minor.loft(run, GLOW)


def aqueduct(variant):
    """One bay of a ruined aqueduct (user, 13 November: aqueducts "mostly running horizontally across", "ruined", "dont make
    the aqueducts have a glow on top, should look abandoned"), from pier centre (x -1) to pier centre (x +1), its top (the
    channel's rim) at 1: a pier of great rounded blocks at each end, an arch of wedge stones between them, a deck over it and
    the dry channel on the deck. Variants: 0 whole; 1 broken through in the middle; 2 the run's ruined end (toward +x): the
    deck and channel crumbling away past the crown, half the arch fallen, the far pier broken short, a fallen block. Below
    the bay its piers continue as nah_aqpier columns down to the ground (the terrain places them)."""
    rng = random.Random(9700 + variant)
    k = RoundKit(ROLES)
    d = .26
    for side in (-1, 1):
        courses = (.28, .26, .24) if not (variant == 2 and side > 0) else (.28, .14)
        z = 0
        for hh in courses:
            rblock(k, side * .76, side * 1.04, -d, d, z + .004, z + hh - .004, tone(rng), .03)
            z += hh
    keep = range(7) if variant != 2 else range(4)
    for i in keep:
        t0, t1 = math.pi * (1 - i / 7), math.pi * (1 - (i + 1) / 7)
        voussoir(k, t0, t1, .56, .8, .2, .3, .5, d - .02, tone(rng))
    spans = {0: [(-1.04, 1.04)], 1: [(-1.04, -.18), (.22, 1.04)], 2: [(-1.04, .12)]}[variant]
    for x0, x1 in spans:
        rblock(k, x0, x1, -d - .01, d + .01, .8, .89, tone(rng), .025)
        # The channel's walls, the front one crumbling a little short of the back at a broken end.
        for y0, y1, short in ((-d - .01, -d + .07, .14), (d - .07, d + .01, 0.0)):
            end = x1 - (short if variant == 2 and x1 < 1 else 0)
            rblock(k, x0, end, y0, y1, .89, 1.0, tone(rng), .02)
        # The dry channel bed: dark, silted stone.
        B(k, x0 + .02, x1 - .02, -d + .08, d - .08, .89, .905, DARK)
    if variant == 2:
        # Its ragged end: a step of the deck left lower, and a block fallen from it on the broken pier.
        rblock(k, .12, .4, -d, d - .06, .74, .82, tone(rng), .025)
        rblock(k, .7, .98, -.2, .16, .42, .56, tone(rng), .03)
    return k


def aqueduct_pier():
    """An aqueduct pier's column below its bay (stretched to the ground): eight courses of rounded blocks, a little uneven."""
    rng = random.Random(9790)
    k = RoundKit(ROLES)
    z = 0.0
    for c in range(8):
        hh = 1 / 8
        w = .14 * rng.uniform(.95, 1.04)
        rblock(k, -w, w, -.26, .26, z + .002, z + hh - .002, tone(rng), .02)
        z += hh
    return k


def spur(variant):
    """A broken half arch springing from a pier at x -1 and reaching toward +x past the crown, as the concept's great arc:
    rounded voussoirs, the teal channel along its face."""
    rng = random.Random(9550 + variant)
    k = RoundKit(ROLES)
    d, zc = .24, .4
    z = 0
    for hh in (.14, .13, .13):
        rblock(k, -1.0, -.64, -d - .02, d + .02, z + .004, z + hh - .004, tone(rng), .04)
        z += hh
    end = math.radians(58 if variant == 0 else 36)
    n = 6 if variant == 0 else 8
    for i in range(n):
        t0 = math.pi + (end - math.pi) * i / n
        t1 = math.pi + (end - math.pi) * (i + 1) / n
        voussoir(k, t0, t1, .64, 1.0, .34, .6, zc, d, tone(rng))
    channel(k, .64, 1.0, .34, .6, zc, d, math.pi, end, n)
    return k


def ring():
    """A circular mechanism set into a square stone frame: a toothed outer ring, an inner disc, the core glowing."""
    k = rf.Kit(ROLES)
    B(k, -.8, .8, -.05, .25, 0, .12, BROWN)
    B(k, -.8, -.6, -.05, .25, .12, .88, STONE)
    B(k, .6, .8, -.05, .25, .12, .88, STONE)
    B(k, -.8, .8, -.05, .25, .88, 1.0, SAND)
    k.gear((0, 0, .5), 'y', .42, .06, 16, -.2, -.05, BRONZE)
    k.cylinder((0, 0, .5), 'y', .3, -.24, -.18, STONE, seg=16)
    k.cylinder((0, 0, .5), 'y', .14, -.27, -.22, GLOW, seg=12)
    return k


def rubble(variant):
    """Two or three great tumbled blocks, rounded with weathering, the last leaning on the others."""
    rng = random.Random(9600 + variant)
    k = RoundKit(ROLES)
    for i in range(2 + variant % 2):
        r = rng.uniform(.26, .34)
        x, y = rng.uniform(-.25, .25), rng.uniform(-.25, .25)
        z = 0 if i < 2 else .2
        rblock(k, x - r, x + r, y - r * .85, y + r * .85, z, z + r * rng.uniform(1.1, 1.6), tone(rng), .07)
    return k


BUILDERS = {
    **{'nah_wall_%d' % v: (lambda v=v: wall(v)) for v in range(4)},
    **{'nah_tower_%d' % v: (lambda v=v: tower(v)) for v in range(3)},
    **{'nah_gate_%d' % v: (lambda v=v: gate(v)) for v in range(2)},
    **{'nah_pillar_%d' % v: (lambda v=v: stack(v)) for v in range(3)},
    **{'nah_arch_%d' % v: (lambda v=v: arch(v)) for v in range(2)},
    **{'nah_spur_%d' % v: (lambda v=v: spur(v)) for v in range(2)},
    **{'nah_aqueduct_%d' % v: (lambda v=v: aqueduct(v)) for v in range(3)},
    'nah_aqpier_0': aqueduct_pier,
    'nah_ring_0': ring,
    **{'nah_blocks_%d' % v: (lambda v=v: rubble(v)) for v in range(3)},
}


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    sc = br.scene('nahara_kit')
    mats = materials()
    objects, report = [], []
    for name, build in BUILDERS.items():
        ob = build().object(name, mats, sc)
        br.bake_ao([ob], [ob], strength=.7, reach=.5, ground=-.15, rays=24)
        open_tops(ob)
        pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        report.append('%s: %d tris; x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % (name, br.triangles([ob]), lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
        objects.append(ob)
    if '--no-export' not in args:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        result = br.export(OUT, objects, 'Last Worlds Nahara ruin kit (tools/blender/nahara_kit.py)')
        report.append('export %s: %d triangles, %d bytes' % (result['file'], result['triangles'], result['bytes']))
    if '--preview' in args:
        os.makedirs(PREVIEW, exist_ok=True)
        for i, ob in enumerate(objects):
            ob.location = ((i % 6 - 2.5) * 2.4, (i // 6) * 2.4 - 2.4, 0)
        ground = bpy.data.objects.get('kit_preview_ground')
        if not ground:
            me = bpy.data.meshes.new('kit_preview_ground')
            me.from_pydata([(-9, -9, -.02), (9, -9, -.02), (9, 9, -.02), (-9, 9, -.02)], [], [(0, 1, 2, 3)])
            ground = bpy.data.objects.new('kit_preview_ground', me)
            sc.collection.objects.link(ground)
            ground.data.materials.append(br.material('kit_preview_ground', '#a88a62', .9, 0))
        report.append('preview %s' % br.render_view(sc, 'three_quarter', (0, 0, .4), 8.5, os.path.join(PREVIEW, 'kit-hero.png'), res=1600, objects=objects + [ground]))
    if '--scene' in args:
        # The pieces at the sizes the terrain gives them (src/world/terrain-nahara.ts), as in the concept: monoliths out of
        # the depths, a great arch, a spur, towers on a ledge.
        os.makedirs(PREVIEW, exist_ok=True)
        named = {ob.name: ob for ob in objects}
        for ob in objects:
            ob.hide_render = True
        staged = [('nah_pillar_0', (-4.2, 1.5, -6), (1.7, 1.7, 10)), ('nah_pillar_1', (3.8, -1.2, -6), (1.5, 1.5, 8.5)),
                  ('nah_pillar_2', (5.5, 6, -6), (1.6, 1.6, 9.5)), ('nah_arch_0', (0, 7, -1.5), (4.6, 4.6, 5)),
                  ('nah_spur_0', (-5.5, -5, -1.5), (3.6, 3.6, 4.5)), ('nah_tower_0', (-6.5, 4, -1.5), (1.6, 1.6, 3.4)),
                  ('nah_tower_1', (6.8, -4.5, -1.5), (1.5, 1.5, 3.8))]
        shown = []
        for name, at, size in staged:
            ob = named[name]
            ob.hide_render = False
            ob.location, ob.scale = at, size
            shown.append(ob)
        report.append('scene %s' % br.render_view(sc, 'three_quarter', (0, 1, -1), 17, os.path.join(PREVIEW, 'kit-scene.png'), res=1400, objects=shown))
    print('\n'.join('NKIT ' + line for line in report))
    print('NKIT DONE')


if __name__ == "__main__":
    main()
