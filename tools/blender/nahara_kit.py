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
from mathutils import Euler, Vector

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


def dim_glow(ob, factor):
    """The game reads a glow face's brightness from its vertex colour: the canyon floor's inlays glow at `factor`, a quiet
    accent down in the haze (many small lit lines on the floor read busy, and could be taken for the ship's own shots)."""
    me = ob.data
    attr = me.color_attributes.get('Color')
    glow = [i for i, m in enumerate(me.materials) if m and 'glow' in m.name]
    if attr is None or not glow:
        return
    values = [0.0] * (len(me.loops) * 4)
    attr.data.foreach_get('color', values)
    for p in me.polygons:
        if p.material_index in glow:
            for li in p.loop_indices:
                values[li * 4:li * 4 + 3] = [v * factor for v in values[li * 4:li * 4 + 3]]
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


# ----------------------------------------------------------------------------- the canyon floor's ruins (15 November)
# User, 15 November: "lets enhance nahara by placing more things on naharas canyon grounds. Theyre so empty now"; "khepri
# has nice canyons as inspiration". The fallen city on the canyon's ledges and at the feet of its walls: columns fallen
# into their drums, obelisk and column stumps, foundations, rubble fields and the empire's relics. Low pieces at real size
# (src/world/terrain-nahara.ts canyonFloor scales them a little), the same rounded sandstone and turquoise inlays.

def turned(loops, at=(0, 0, 0), yaw=0.0, roll=0.0, pitch=0.0):
    """Local loops turned (roll about x, pitch about y, then yaw about z) and moved to `at`."""
    rot = Euler((roll, pitch, yaw), 'XYZ').to_matrix()
    o = Vector(at)
    return [[tuple(o + rot @ Vector(p)) for p in loop] for loop in loops]


def stone(k, at, w, d, h, mat, yaw=0.0, roll=0.0, pitch=0.0, r=.04):
    """rblock's weathered block about its base centre (half sizes w, d; height h), turned and set at `at`."""
    r = max(.005, min(r, w * .6, d * .6, h * .3))
    inner = octagon(-w + r * .7, w - r * .7, -d + r * .7, d - r * .7, r * .6)
    outer = octagon(-w, w, -d, d, r)
    loops = [[(x, y, 0) for x, y in inner], [(x, y, r) for x, y in outer], [(x, y, h - r) for x, y in outer], [(x, y, h) for x, y in inner]]
    k.major.loft(turned(loops, at, yaw, roll, pitch), mat)


def chip(k, at, w, d, h, mat, yaw=0.0, roll=0.0, pitch=0.0):
    """A small chip or slab: a plain box (no rounding the camera could resolve at its size)."""
    loops = [[(-w, -d, 0), (w, -d, 0), (w, d, 0), (-w, d, 0)], [(-w, -d, h), (w, -d, h), (w, d, h), (-w, d, h)]]
    k.minor.loft(turned(loops, at, yaw, roll, pitch), mat)


def drum(k, at, length, r, mat, yaw=0.0, roll=0.0, pitch=0.0, n=12, c=.022, broken=0.0, band=None):
    """A column drum along its local x, centred at `at`: a 12-sided shaft, its rims worn round; `broken` slopes its +x end
    (a snapped shaft); `band` (offset along x) inlays a thin turquoise ring."""
    def ring(x, rad, slope=0.0):
        return [(x + slope * math.cos(2 * math.pi * (i + .5) / n), rad * math.cos(2 * math.pi * (i + .5) / n), rad * math.sin(2 * math.pi * (i + .5) / n)) for i in range(n)]
    h = length / 2
    loops = [ring(-h, r - c), ring(-h + c, r), ring(h - c, r, broken), ring(h, r - c, broken)]
    k.major.loft(turned(loops, at, yaw, roll, pitch), mat)
    if band is not None:
        k.minor.loft(turned([ring(band - .012, r + .006), ring(band + .012, r + .006)], at, yaw, roll, pitch), GLOW)


def column_drums(variant):
    """A fallen column lying in its drums (the concept's colonnades, toppled): four drums in a line, the last rolled away
    (first); two drums, one rolled, and the capital tipped on its side beside them (second). A thin turquoise ring inlaid
    in one drum, a few chips knocked off."""
    rng = random.Random(9800 + variant)
    k = RoundKit(ROLES)
    r = .17
    if variant == 0:
        x = -.86
        for i, length in enumerate((.4, .34, .36, .3)):
            gap = rng.uniform(.02, .06)
            cx = x + length / 2
            if i < 3:
                drum(k, (cx, rng.uniform(-.04, .04), r - .01), length, r, tone(rng), yaw=rng.uniform(-.07, .07), roll=rng.uniform(0, 1), band=.06 if i == 1 else None)
            else:
                # The last drum rolled off the line.
                drum(k, (cx + .06, .2, r - .01), length, r, tone(rng), yaw=.55, roll=rng.uniform(0, 1))
            x += length + gap
        for i in range(3):
            chip(k, (rng.uniform(-.7, .7), rng.choice((-1, 1)) * rng.uniform(.22, .34), 0), rng.uniform(.03, .06), rng.uniform(.025, .05), rng.uniform(.03, .06), tone(rng), yaw=rng.uniform(0, 3))
    else:
        drum(k, (-.6, .02, r - .01), .42, r, tone(rng), yaw=.05, roll=.4, band=-.08)
        drum(k, (-.12, -.04, r - .01), .36, r, tone(rng), yaw=-.08, roll=1.3)
        drum(k, (.16, .26, r - .01), .32, r, tone(rng), yaw=.9, roll=.2)
        # The capital fallen beside them: its square abacus tilted on one edge, its round echinus rolled against it.
        stone(k, (.64, -.06, 0), .21, .21, .13, SAND, yaw=.25, roll=.32, r=.03)
        drum(k, (.6, .26, .13), .12, .14, STONE, yaw=.25 + math.pi / 2)
        for i in range(3):
            chip(k, (rng.uniform(-.8, .8), rng.choice((-1, 1)) * rng.uniform(.24, .36), 0), rng.uniform(.03, .06), rng.uniform(.025, .05), rng.uniform(.03, .05), tone(rng), yaw=rng.uniform(0, 3))
    return k


def stub(variant):
    """Standing stumps (top normalised to 1, the terrain sets their height): an obelisk snapped off over its two-step plinth,
    a turquoise glyph line down its face (first); two broken column stumps on a shared stylobate, a drum fallen at their
    feet (second)."""
    rng = random.Random(9850 + variant)
    k = RoundKit(ROLES)
    if variant == 0:
        stone(k, (0, 0, 0), .34, .34, .1, STONE, r=.03)
        stone(k, (0, 0, .1), .27, .27, .09, SAND, r=.025)
        # The shaft: square, tapering, broken off on a slant (its top loop higher at the back left).
        b0, b1, z0, z1 = .17, .13, .19, .93
        def plan(half, z, slant=0.0):
            return [(x, y, z + slant * (-x - y * .6)) for x, y in octagon(-half, half, -half, half, .025)]
        k.major.loft([plan(b0, z0), plan(b0 * .99, z0 + .03), plan(b1, z1), plan(b1 * .95, z1 + .04, .22)], STONE)
        # Glyph line on the front face: short turquoise dashes following the taper.
        for i, (za, zb) in enumerate(((.3, .4), (.45, .5), (.55, .68), (.73, .79))):
            ya = -(b0 + (b1 - b0) * (za - z0) / (z1 - z0)) - .004
            B(k, -.025 if i % 2 else -.04, .025 if i % 2 else .04, ya - .008, ya + .004, za, zb, GLOW)
        # Its broken tip lying at its foot.
        stone(k, (.48, -.12, .085), .13, .09, .16, STONE, yaw=.6, roll=math.radians(80), r=.02)
        chip(k, (-.42, .2, 0), .06, .04, .05, tone(rng), yaw=.8)
    else:
        stone(k, (0, 0, 0), .62, .22, .08, STONE, r=.03)
        for x, top, slope in ((-.32, 1.0, .1), (.3, .62, -.14)):
            stone(k, (x, 0, .08), .16, .16, .06, SAND, r=.02)
            drum(k, (x, 0, .14 + (top - .14) / 2), top - .14, .12, tone(rng), pitch=-math.pi / 2, broken=slope, band=(top - .14) * .2 if x < 0 else None)
        drum(k, (.08, -.36, .1), .3, .11, tone(rng), yaw=.3, roll=.8)
        chip(k, (.62, -.26, 0), .05, .04, .05, tone(rng), yaw=.4)
    return k


def footing(variant):
    """A fallen building's stepped foundation (low, at real size): the outline of its lower course with blocks missing, an
    inner course on two sides, a pier base and paving slabs (first); a stepped platform, its front corner broken into
    tumbled blocks (second)."""
    rng = random.Random(9900 + variant)
    k = RoundKit(ROLES)
    if variant == 0:
        half = .82
        for side in range(4):
            for i in range(4):
                if rng.random() < .22:
                    continue
                t = -half + (i + .5) * (2 * half / 4)
                at = [(t, -half), (half, t), (-t, half), (-half, -t)][side]
                yaw = 0 if side % 2 == 0 else math.pi / 2
                B(k, at[0] - (.2 if yaw == 0 else .11), at[0] + (.2 if yaw == 0 else .11), at[1] - (.11 if yaw == 0 else .2), at[1] + (.11 if yaw == 0 else .2), 0, .14 + rng.uniform(-.02, .02), tone(rng), c=.03)
        # The inner course along the back and the left.
        for i in range(3):
            t = -half + .3 + i * .42
            if rng.random() < .25:
                continue
            B(k, t - .19, t + .19, half - .32, half - .12, .0, .26, tone(rng), c=.03)
            B(k, -half + .12, -half + .32, -t - .19, -t + .19, .0, .24, tone(rng), c=.03)
        stone(k, (-half + .22, half - .22, 0), .17, .17, .42, SAND, r=.03)
        for i in range(5):
            chip(k, (rng.uniform(-.45, .4), rng.uniform(-.45, .35), 0), rng.uniform(.1, .16), rng.uniform(.08, .13), .035, STONE if i % 2 else SAND, yaw=rng.uniform(-.1, .1))
    else:
        steps = ((.88, .58, .12), (.66, .4, .24), (.4, .22, .34))
        for i, (w, d, z) in enumerate(steps):
            # Each step a course of long blocks, its front right quarter gone.
            n = 3 if i < 2 else 2
            for j in range(n):
                x0 = -w + j * 2 * w / n
                x1 = x0 + 2 * w / n
                if i < 2 and j == n - 1:
                    x1 = x0 + (x1 - x0) * .45
                B(k, x0 + .01, x1 - .01, -d + .01, d - .01, z - .12 if i else 0, z, tone(rng), c=.03)
        for (x, y, w) in ((.62, -.42, .14), (.82, -.12, .11), (.5, -.7, .1)):
            stone(k, (x, y, 0), w, w * .8, w * 1.1, tone(rng), yaw=rng.uniform(0, 3), roll=rng.uniform(-.3, .3), r=.03)
        chip(k, (-.7, -.68, 0), .06, .04, .04, tone(rng), yaw=.5)
    return k


def debris(variant):
    """Rubble fields (low, at real size): chips and slabs spilled over the sand round two weathered blocks (first); a wall
    course fallen in a row, its blocks tipping one on the next (second); a carved slab cracked in three, its turquoise
    glyph broken across the pieces (third)."""
    rng = random.Random(9950 + variant)
    k = RoundKit(ROLES)
    if variant == 0:
        stone(k, (-.18, .06, 0), .17, .13, .2, tone(rng), yaw=.4, r=.04)
        stone(k, (.32, -.14, 0), .12, .1, .15, tone(rng), yaw=1.2, roll=.2, r=.035)
        for i in range(11):
            a, d = rng.uniform(0, 2 * math.pi), rng.uniform(.25, .85)
            w = rng.uniform(.04, .1)
            chip(k, (math.cos(a) * d, math.sin(a) * d * .65, -.005), w, w * rng.uniform(.5, .9), rng.uniform(.025, .07), tone(rng),
                 yaw=rng.uniform(0, 3), roll=rng.uniform(-.25, .25), pitch=rng.uniform(-.25, .25))
    elif variant == 1:
        for i in range(5):
            x = -.72 + i * .34
            lean = min(1.2, .2 + i * .28)
            stone(k, (x, rng.uniform(-.03, .03), 0), .15, .12, .22, tone(rng), yaw=rng.uniform(-.08, .08), pitch=lean if i else .05, r=.03)
        for i in range(6):
            chip(k, (rng.uniform(-.9, .9), rng.choice((-1, 1)) * rng.uniform(.2, .4), -.005), rng.uniform(.04, .07), rng.uniform(.03, .05), rng.uniform(.03, .05), tone(rng), yaw=rng.uniform(0, 3))
    else:
        # The slab's three pieces, a little apart and tilted, the glyph inlay running across them.
        for (x0, x1, yaw, tilt) in ((-.55, -.12, .04, .05), (-.08, .22, -.06, -.08), (.27, .58, .14, .12)):
            cx, w = (x0 + x1) / 2, (x1 - x0) / 2
            stone(k, (cx, 0, 0), w, .3, .07, SAND, yaw=yaw, roll=tilt, r=.02)
            B(k, x0 + .03, x1 - .03, -.025, .025, .07, .078, GLOW)
        for i in range(7):
            a, d = rng.uniform(0, 2 * math.pi), rng.uniform(.45, .85)
            chip(k, (math.cos(a) * d, math.sin(a) * d * .6, -.005), rng.uniform(.03, .07), rng.uniform(.03, .05), rng.uniform(.025, .05), tone(rng), yaw=rng.uniform(0, 3))
    return k


def relic(variant):
    """The empire's machines left in the sand (top normalised to 1): a bronze ring's toothed arc standing out of the dune,
    its inner channel still lit, stone collars at its feet (first); a toppled pylon, its stone casing split open over a
    turquoise core (second)."""
    rng = random.Random(9990 + variant)
    k = RoundKit(ROLES)
    if variant == 0:
        # The arc: 250 degrees of a ring (the rest buried), axis along y, a little tilted back.
        lean = math.radians(12)
        def arc(rad0, rad1, y0, y1, mat, teeth=0):
            loops = []
            for i in range(19):
                t = math.radians(-35 + 250 * i / 18)
                out = rad1 + (.05 if teeth and i % 2 else 0)
                pts = [(math.cos(t) * rad0, y0, math.sin(t) * rad0), (math.cos(t) * out, y0, math.sin(t) * out),
                       (math.cos(t) * out, y1, math.sin(t) * out), (math.cos(t) * rad0, y1, math.sin(t) * rad0)]
                loops.append(pts)
            k.major.loft(turned(loops, (0, 0, .42), 0, lean), mat)
        arc(.36, .52, -.07, .07, BRONZE, teeth=1)
        arc(.3, .36, -.04, .04, GLOW)
        for x in (-.5, .46):
            stone(k, (x, -.02, 0), .14, .16, .18, tone(rng), yaw=rng.uniform(-.3, .3), r=.03)
        chip(k, (.2, -.3, 0), .06, .05, .05, tone(rng), yaw=.3)
    else:
        # The pylon's octagonal casing lying along x, split open at its +x end over a crystal core.
        casing = lambda x, rad: [(x, rad * math.cos(2 * math.pi * (i + .5) / 8), rad * math.sin(2 * math.pi * (i + .5) / 8)) for i in range(8)]
        k.major.loft(turned([casing(-.75, .2), casing(-.72, .23), casing(.05, .23), casing(.1, .19)], (0, 0, .2), .08), STONE)
        k.major.loft(turned([casing(-.8, .17), casing(-.75, .17)], (0, 0, .2), .08), BRONZE)
        # The split halves of its casing beyond the break, fallen apart either side.
        stone(k, (.42, .22, 0), .26, .09, .12, STONE, yaw=.2, roll=.5, r=.03)
        stone(k, (.46, -.2, 0), .24, .08, .1, STONE, yaw=-.15, roll=-.6, r=.03)
        for i, (x, y, ln, tilt) in enumerate(((.2, .02, .24, .5), (.32, -.05, .18, .9), (.28, .1, .14, -.6))):
            # Crystal shards of the core: tapered prisms pointing out of the break.
            base = [(x, y + .04 * math.cos(a), .2 + .04 * math.sin(a)) for a in (0, 2.1, 4.2)]
            tip = [(x + ln * math.cos(tilt * .4), y + .01, .2 + ln * math.sin(tilt * .4)) for _ in range(3)]
            k.minor.loft([base, [(p[0] + (t[0] - p[0]) * .98, p[1] + (t[1] - p[1]) * .98, p[2] + (t[2] - p[2]) * .98) for p, t in zip(base, tip)]], GLOW)
        chip(k, (-.4, -.3, 0), .05, .04, .05, tone(rng), yaw=.7)
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
    **{'nah_drums_%d' % v: (lambda v=v: column_drums(v)) for v in range(2)},
    **{'nah_stub_%d' % v: (lambda v=v: stub(v)) for v in range(2)},
    **{'nah_footing_%d' % v: (lambda v=v: footing(v)) for v in range(2)},
    **{'nah_debris_%d' % v: (lambda v=v: debris(v)) for v in range(3)},
    **{'nah_relic_%d' % v: (lambda v=v: relic(v)) for v in range(2)},
}
# The canyon floor's pieces lie on the sand (their AO ground at 0); the older pieces stand sunk into it.
FLOOR_PIECES = ('nah_drums', 'nah_stub', 'nah_footing', 'nah_debris', 'nah_relic')


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    sc = br.scene('nahara_kit')
    mats = materials()
    objects, report = [], []
    for name, build in BUILDERS.items():
        ob = build().object(name, mats, sc)
        br.bake_ao([ob], [ob], strength=.7, reach=.5, ground=0.0 if name.startswith(FLOOR_PIECES) else -.15, rays=24)
        open_tops(ob)
        if name.startswith(FLOOR_PIECES):
            dim_glow(ob, .55)
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
    if '--canyon' in args:
        # The canyon floor's pieces at the sizes the terrain gives them, on a ledge of sand (the game's own view angle).
        os.makedirs(PREVIEW, exist_ok=True)
        named = {ob.name: ob for ob in objects}
        for ob in objects:
            ob.hide_render = True
        staged = [('nah_drums_0', (-2.6, 1.8, 0), 1.1, .2), ('nah_drums_1', (1.4, 2.6, 0), 1.0, -.4), ('nah_stub_0', (-.6, 3.6, 0), (1, 1, 1.3), 0),
                  ('nah_stub_1', (2.8, .4, 0), (1, 1, .9), .3), ('nah_footing_0', (-2.4, -1.2, 0), 1.0, .1), ('nah_footing_1', (.6, -.2, 0), 1.0, -.2),
                  ('nah_debris_0', (-.4, -2.6, 0), 1.0, .5), ('nah_debris_1', (2.6, -2.2, 0), 1.0, 1.2), ('nah_debris_2', (-3.2, 3.8, 0), 1.0, -.6),
                  ('nah_relic_0', (3.4, 3.6, 0), (1, 1, .8), .4), ('nah_relic_1', (-3.6, -3.4, 0), (1, 1, .5), 2.4), ('nah_blocks_1', (1.2, -3.8, 0), .7, 0)]
        shown = []
        for name, at, size, yaw in staged:
            ob = named[name]
            ob.hide_render = False
            ob.location, ob.rotation_euler = at, (0, 0, yaw)
            ob.scale = size if isinstance(size, tuple) else (size, size, size)
            shown.append(ob)
        ground = bpy.data.objects.get('kit_canyon_ground')
        if not ground:
            me = bpy.data.meshes.new('kit_canyon_ground')
            me.from_pydata([(-6, -6, -.01), (6, -6, -.01), (6, 6, -.01), (-6, 6, -.01)], [], [(0, 1, 2, 3)])
            ground = bpy.data.objects.new('kit_canyon_ground', me)
            sc.collection.objects.link(ground)
            ground.data.materials.append(br.material('kit_canyon_ground', '#b89466', .95, 0))
        report.append('canyon %s' % br.render_view(sc, 'game', (0, .4, 0), 9.5, os.path.join(PREVIEW, 'kit-canyon.png'), res=1400, objects=shown + [ground]))
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
