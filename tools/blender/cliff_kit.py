"""Cliff wall kits: real wall geometry along terrain cliff lines (terrain v15, docs/26).

The user wants real cliff walls ("sharp and crisp cliffs ... real cliff walls", "especially vesper can look much
more closer to the concept") built new after the concept's cliffs, not reused kit pieces
(art/concepts/01-worlds-direction.png):

- Khepri (left panel): sheer walls of large dark charcoal-brown slabs in vertical cleavage with crevices, most
  topping out at one flat, sand-dusted rim; a few broken lower or cleaved horizontally; teal crystal seams in some
  cracks; rubble at the foot.
- Vesper (right panel): a flat-topped ice shelf ending in a sharp, fractured ice face (since 22 October; narrow V-ridged
  shards and then columns read as pillars): irregular jagged chunks of every size overlapping at their own depths, a
  broken rim of them, deep shadow between, snow on every surface that faces up, chunks fallen at the foot
  (`fractured_wall`, reusable in rock for a fractured mountain world).

Each node is one 2-unit wall segment that tiles along x (AO is baked with its neighbours repeated). Frame, as in
the other kits: glTF +Y up, front (the outward, downhill face) toward glTF +Z (Blender -y), pivot at the base
centre. Bounds: x -1.05 .. 1.05, glTF z -0.6 (back, into the slope) .. +0.35 (front relief), base -0.15, top exactly
1 so the terrain scales y by the local drop. Vertex colours carry the look; Khepri's crystal seams use a `mineral`
material (the kit loader makes those faces glow).

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/cliff_kit.py)" -- [--world khepri|vesper|amnion] [--preview DIR]
"""
import argparse, math, os, random, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import khepri_kit as kit  # noqa: E402
import vesper_common as vc  # noqa: E402
from vesper_common import HS  # noqa: E402
import vesper_kit as vk  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HALF_X, FRONT, BACK, BASE = 1.05, -0.35, 0.6, -0.15   # Blender: front is -y
VARIANTS = 4
# Triangles per 2-unit segment (650 since the fractured walls of 22 October; dozens stand in view).
TRI_BUDGET = 650


def chop(rng, x0, x1, lo, hi):
    """Split [x0, x1] into widths between lo and hi."""
    cuts, x = [x0], x0
    while x1 - x > hi:
        x += rng.uniform(lo, hi)
        cuts.append(min(x, x1 - lo))
        x = cuts[-1]
    cuts.append(x1)
    return list(zip(cuts, cuts[1:]))


def hull(hs, points, paint, mat):
    """A convex rubble chunk with its own material index (vesper_kit.hull_hs assumes Vesper's materials)."""
    import bmesh
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:], use_existing_faces=False)
    junk = list(dict.fromkeys(g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)))
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    base = len(hs.verts)
    for v in bm.verts:
        hs.v((v.co.x, v.co.y, v.co.z))
    for f in bm.faces:
        hs.face(tuple(base + v.index for v in f.verts), paint, "main", mat, outward=tuple(f.normal))
    bm.free()


def prism(hs, poly, z0, z1, side, top, mat, mt, tag="main", fall=0.0):
    """Vertical prism over a CCW (x, y) polygon: walls `side`, top face `top`. `fall`: the top slopes down by
    this much toward the front (a cleaved block's lit edge); the back stays at z1."""
    if kit.poly_area(poly) < 0:
        poly = list(reversed(poly))
    n = len(poly)
    lo = [hs.v((x, y, z0)) for x, y in poly]
    hi = [hs.v((x, y, z1 - fall * kit.clamp((BACK - y) / (BACK - FRONT), 0.0, 1.0))) for x, y in poly]
    for i in range(n):
        j = (i + 1) % n
        nx, ny = vk.outward_normal(poly[i], poly[j])
        hs.face((lo[i], lo[j], hi[j], hi[i]), side, tag, mat, outward=(nx, ny, 0.0))
    hs.face(tuple(hi), top, "top", mt if top == "dust" else mat, outward=(0, 0, 1))


# ----------------------------------------------------------------------------- Khepri
KHEPRI = {k: kit.hex_linear(v) for k, v in dict(
    rock="#4a4038", rock_lit="#857160", rock_edge="#9a8068", dust="#b8743f", dust_lit="#d08a4c",
    mineral="#2ff0dc", mineral_core="#b8fff6").items()}
ROCK, MINERAL = 0, 1


def khepri_wall(rng, idx):
    """Cleaved slabs to a flat dusty rim; crevices between; a broken or cleaved slab or two; crystal seams;
    rubble at the foot."""
    hs = HS(rng)
    # A dark backing behind the slabs: crevices read as deep shadow, never as sky.
    prism(hs, [(-HALF_X, BACK - .12), (HALF_X, BACK - .12), (HALF_X, BACK), (-HALF_X, BACK)], BASE, .97, "rock", "dust", ROCK, ROCK, tag="crack")
    slabs = chop(rng, -HALF_X, HALF_X, .36, .72)
    broken = set(rng.sample(range(len(slabs)), 1 + (idx % 2)))
    seams = [rng.randrange(len(slabs) - 1)] if idx in (1, 3) else []
    for k, (a, b) in enumerate(slabs):
        g = .018
        a, b = a + g, b - g
        fy = FRONT + (rng.uniform(.2, .34) if rng.random() < .3 else rng.uniform(.0, .18))   # relief: some blocks set back
        mid = (a + b) / 2 + rng.uniform(-.06, .06)
        poly = [(a, BACK), (a, fy + rng.uniform(0, .05)), (mid, fy - rng.uniform(.0, .06)), (b, fy + rng.uniform(0, .05)), (b, BACK)]
        poly = [(x, max(FRONT, y)) for x, y in poly]
        top = rng.uniform(.7, .82) if k in broken else (1.0 if rng.random() < .55 else rng.uniform(.86, .97))   # stepped rim
        if rng.random() < .62 and top > .9:
            # Horizontal cleavage: a lower block and an upper block set back or forward a little.
            cut = rng.uniform(.38, .66)
            prism(hs, poly, BASE, cut, "rock", "rock", ROCK, ROCK)
            d = rng.choice((-1, 1)) * rng.uniform(.03, .07)
            upper = [(x, min(BACK, max(FRONT, y + (d if y < BACK - 1e-6 else 0)))) for x, y in poly]
            prism(hs, upper, cut, top, "rock", "dust", ROCK, ROCK, fall=rng.uniform(.02, .07))
        else:
            prism(hs, poly, BASE, top, "rock", "dust", ROCK, ROCK, fall=rng.uniform(.02, .07))
        if top < .99:  # a lower block: the rim continues behind it
            back = [(a, BACK), (a, BACK - .22), (b, BACK - .22), (b, BACK)]
            prism(hs, back, top - .02, 1.0, "rock", "dust", ROCK, ROCK)
    for k in seams:  # glowing crystal veins in a crevice
        x = slabs[k][1]
        h0, h1 = rng.uniform(.05, .25), rng.uniform(.6, .9)
        for j in range(3):
            y0 = FRONT + .12 + j * .05
            hs_crystal = [(x - .03, y0), (x + .03, y0), (x + .02, y0 + .05), (x - .02, y0 + .05)]
            prism(hs, hs_crystal, h0 + j * .04, h1 - j * .08, "mineral", "mineral", MINERAL, MINERAL)
    for _ in range(3 + idx % 2):  # rubble at the foot
        cx, cy, r = rng.uniform(-.85, .85), rng.uniform(FRONT + .06, FRONT + .2), rng.uniform(.06, .12)
        pts = [Vector((cx + rng.uniform(-r, r), cy + rng.uniform(-r * .6, r * .6), rng.uniform(BASE, BASE + r * 2.2))) for _ in range(9)]
        hull(hs, pts, "rock", ROCK)
    return hs


def khepri_colour_fn(hs):
    zs = [v[2] for v in hs.verts]
    zhi = max(zs)
    rng = random.Random(f"cliff-khepri:shade:{len(zs)}")
    jit = [rng.uniform(.86, 1.12) for _ in hs.faces]

    def fn(paint, p, n, ao, fi):
        if paint == "mineral":
            return kit.mix3(KHEPRI["mineral"], KHEPRI["mineral_core"], .35)
        if paint == "dust" or (n.z > .7 and p.z > zhi - .05):
            col = kit.mix3(KHEPRI["dust"], KHEPRI["dust_lit"], kit.clamp(n.z, 0, 1) * .5)
            return kit.mul3(col, kit.lerp(.55, 1.0, ao))
        # Dark cleaved faces, lighter where a face turns up (ledges, edges), darker in the crevices.
        col = kit.mix3(KHEPRI["rock"], KHEPRI["rock_lit"], kit.clamp(.35 + n.z * .6 - n.y * .2, 0, 1))
        if hs.ftag[fi] == "top" and p.z < zhi - .05:
            col = kit.mix3(col, KHEPRI["dust"], .35)   # sand on a broken ledge
        return kit.mul3(col, kit.lerp(.35, 1.0, ao) * jit[fi])
    return fn


# ----------------------------------------------------------------------------- Vesper
ICE, SNOW, VROCK = 0, 1, 2


def fractured_block(hs, box, planes, paint, mat, snow_mat=None, snow=.72):
    """A block of rock or ice fractured by planes: the box (x0, x1, y0, y1, z0, z1) is cut by each (point, normal) plane,
    the outer side cleared and the cut filled, so every fracture is a sharp planar facet. Faces pointing up become
    snow when `snow_mat` is given."""
    import bmesh
    x0, x1, y0, y1, z0, z1 = box
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((x0 + (v.co.x + .5) * (x1 - x0), y0 + (v.co.y + .5) * (y1 - y0), z0 + (v.co.z + .5) * (z1 - z0)))
    for co, no in planes:
        before = len(bm.verts)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vector(co), plane_no=Vector(no).normalized(), clear_outer=True)
        bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
        if len(bm.verts) < 4:  # a cut that took the whole block: not this one
            bm.free()
            return fractured_block(hs, box, [], paint, mat, snow_mat, snow) if planes else None
        del before
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    base = len(hs.verts)
    for v in bm.verts:
        hs.v((v.co.x, v.co.y, v.co.z))
    for f in bm.faces:
        up = snow_mat is not None and f.normal.z > snow
        hs.face(tuple(base + v.index for v in f.verts), "snow" if up else paint, "main", snow_mat if up else mat, outward=tuple(f.normal))
    bm.free()


def fracture_planes(rng, center, half, cuts, flat_top=False):
    """Planes carving a box (centre, half extents) into a jagged stone: each a random direction (half of them facing
    the front, for big facets on the face) at 55-95% of the box's reach that way, so each cut takes a corner or an edge.
    `flat_top`: no cut leans up enough to break the top (a chunk flush with the rim)."""
    planes = []
    for k in range(cuts):
        n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
        if k % 2 == 0:
            n.y = -abs(n.y) - .8          # toward the front
        if flat_top:
            n.z = min(n.z, .25)
        n.normalize()
        reach = abs(n.x) * half[0] + abs(n.y) * half[1] + abs(n.z) * half[2]
        planes.append((tuple(Vector(center) + n * reach * rng.uniform(.55, .95)), tuple(n)))
    return planes


def fractured_wall(rng, idx, paint, mat, snow_mat=None, face=(10, 14)):
    """A sharp, fractured cliff face (user, 22 October: "go all out on rocky sharp looking cliffs, more detailed and
    sharper"; "it's still columns ... irregular shapes that overlap would look better"; reusable for a fractured mountain
    world): no column grid. A row of jagged chunks breaks the rim, more chunks of every size overlap across the face at
    their own depths (ledges, overhangs, deep shadow between them), each a box carved by fracture planes in random
    directions; a dark mass behind closes every gap. Every chunk is clipped to the segment's box."""
    hs = HS(rng)
    snow_paint = "snow" if snow_mat is not None else paint
    # The dark mass behind: gaps between chunks read as deep shadow, never as sky.
    prism(hs, [(-HALF_X, BACK - .26), (HALF_X, BACK - .26), (HALF_X, BACK), (-HALF_X, BACK)], BASE, .9, paint, snow_paint,
          mat, snow_mat if snow_mat is not None else mat, tag="crack")
    clip = [((-HALF_X, 0, 0), (-1, 0, 0)), ((HALF_X, 0, 0), (1, 0, 0)), ((0, FRONT, 0), (0, -1, 0)), ((0, BACK, 0), (0, 1, 0)), ((0, 0, BASE), (0, 0, -1))]

    def chunk(cx, cz, w, h, d, front, flush=False):
        cy = min(BACK - d / 2, front + d / 2)
        half = (w / 2, d / 2, h / 2)
        box = (cx - half[0], cx + half[0], cy - half[1], cy + half[1], cz - half[2], cz + half[2])
        planes = fracture_planes(rng, (cx, cy, cz), half, rng.randint(4, 6), flat_top=flush) + clip
        if flush:  # a clean top, exactly at the rim
            planes.append(((0, 0, 1.0), (0, 0, 1)))
        # Snow lies only on the flush rim (user, 22 October: snow on every ledge read as stacked cubes).
        fractured_block(hs, box, planes, paint, mat, snow_mat if flush else None)

    # The rim: a row of chunks, uneven in size and depth; most flush with the shelf (user, 22 October: "make sure at
    # least 60-70% is flush at the top", then "ice not always flush": four in five), the rest broken lower.
    x = -HALF_X - rng.uniform(.0, .15)
    while x < HALF_X:
        w, h = rng.uniform(.18, .4), rng.uniform(.3, .55)
        flush = rng.random() < .8
        cz = 1.04 - h / 2 if flush else 1.0 - h * rng.uniform(.55, .75)
        chunk(x + w / 2, cz, w, h, rng.uniform(.5, .85), FRONT + rng.uniform(.04, .2), flush)
        x += w * rng.uniform(.6, .85)   # overlapping neighbours
    # The face: narrow, tall chunks (spiky, user 22 October) overlapping at their own depths.
    for _ in range(rng.randint(*face)):
        w, h = rng.uniform(.14, .4), rng.uniform(.3, .7)
        chunk(rng.uniform(-HALF_X + .1, HALF_X - .1), rng.uniform(BASE + h * .4, .78), w, h, rng.uniform(.35, .75), FRONT + rng.uniform(.0, .22))
    for _ in range(2 + idx % 2):  # chunks fallen at the foot
        cx, cy, r = rng.uniform(-.85, .85), rng.uniform(FRONT + .04, FRONT + .14), rng.uniform(.05, .09)
        tip = Vector((cx + rng.uniform(-r, r), cy + rng.uniform(-r * .5, r * .5), BASE + r * rng.uniform(1.5, 2.5)))
        pts = [Vector((cx + rng.uniform(-r, r), cy + rng.uniform(-r * .6, r * .6), BASE + rng.uniform(0, r * .6))) for _ in range(5)] + [tip]
        vk.hull_hs(hs, [Vector((p.x, max(FRONT + .005, p.y), p.z)) for p in pts], paint)
    return hs


def vesper_wall(rng, idx):
    """Vesper's ice walls: the fractured cliff in glacier ice under snow (after lookdev/cliff-study/vesper.png)."""
    return fractured_wall(rng, idx, "ice", ICE, SNOW)


def vesper_colour_fn(hs):
    base_fn = vk.kit_colour_fn(hs, False)

    def fn(paint, p, n, ao, fi):
        if hs.ftag[fi] == "crack":
            return kit.mix3(vk.C["ice_abyss"], vk.C["ice_deep"], .4)
        col = base_fn(paint, p, n, ao, fi)
        if paint != "ice":
            return col
        if hs.ftag[fi] == "top":
            return kit.mix3(vk.C["ice_top"], vk.C["snow"], .35)   # a broken tip: bright fresh fracture
        # Crisp, saturated ice: no grey. Faces split by the ridge keep strong colour; deep blue low down.
        return kit.mix3(col, vk.C["ice"], .3 * ao)
    return fn


# ----------------------------------------------------------------------------- Amnion
FLESH, BONE = 0, 1
AMNION = {k: kit.hex_linear(v) for k, v in dict(
    flesh_dark="#240a0a", flesh="#561816", flesh_lit="#82302a", sinew="#9c4c40", sinew_lit="#cf8674",
    bone="#ddd3c0", bone_shade="#b4a58c", crack="#120404").items()}
# Fallen chunks at the foot are hulls painted through vesper_kit's paint-to-material table.
vk.PAINT_MAT.setdefault("flesh", FLESH)
vk.PAINT_MAT.setdefault("sinew", FLESH)
vk.PAINT_MAT.setdefault("lip", BONE)


def vtube(hs, rings, sides, paint, mat, tag="main", cap=False):
    """A vertical tube through horizontal elliptical rings (x, y, z, rx, ry), bottom to top; `cap` closes its top."""
    loops = []
    for x, y, z, rx, ry in rings:
        loops.append([hs.v((x + rx * math.cos(k * math.tau / sides), y + ry * math.sin(k * math.tau / sides), z)) for k in range(sides)])
    for lo, hi in zip(loops, loops[1:]):
        for k in range(sides):
            a = (k + .5) * math.tau / sides
            hs.face((lo[k], lo[(k + 1) % sides], hi[(k + 1) % sides], hi[k]), paint, tag, mat, outward=(math.cos(a), math.sin(a), 0.0))
    if cap:
        hs.face(tuple(loops[-1]), paint, "top", mat, outward=(0.0, 0.0, 1.0))


def amnion_wall(rng, idx):
    """Amnion's canyon walls (docs/27, after the user's brood-wastes concept): organic, not fractured rock. Bulging
    vertical flesh lobes overlap across the face (muscle and organ folds, each swelling and narrowing down its height,
    rounding off just under the rim), and a few sinews sag between them. The plateau's own crisp edge is the bone crust
    (a separate bone lip read as stepped stone blocks: user, 23 October, "seamless with the tops"). A dark flesh mass
    behind fills every gap."""
    hs = HS(rng)
    prism(hs, [(-HALF_X, BACK - .3), (HALF_X, BACK - .3), (HALF_X, BACK), (-HALF_X, BACK)], BASE, .86, "flesh", "flesh", FLESH, FLESH, tag="crack")
    # Lobes: evenly spread with jitter, each its own girth, lean and swell.
    n = rng.randint(5, 6)
    for j in range(n):
        rx = rng.uniform(.2, .3)
        x0 = kit.clamp(-HALF_X + (j + .5) * 2 * HALF_X / n + rng.uniform(-.08, .08), -HALF_X + rx * 1.25, HALF_X - rx * 1.25)
        squash, lean, phase, out = rng.uniform(.6, .9), rng.uniform(-.14, .14), rng.uniform(0, math.tau), rng.uniform(0, .12)
        rings = []
        top = rng.uniform(.93, 1.0) if j else 1.0
        for k, z in enumerate((BASE, BASE + .3, .38, .64, top - .08, top)):
            r = rx * (.72 + .42 * math.sin(phase + k * 1.3)) * (.55 if k == 5 else 1.0)
            ry = r * squash
            rings.append((kit.clamp(x0 + lean * (z - BASE), -HALF_X + r, HALF_X - r), FRONT + ry + out * (1 - .5 * min(k, 4) / 4), z, r, ry))
        vtube(hs, rings, 8, "flesh", FLESH, cap=True)
    # Sinews: tapered strands hanging from under the lip, sagging out from the face between their ends.
    for _ in range(rng.randint(3, 4)):
        x, r = rng.uniform(-HALF_X + .15, HALF_X - .15), rng.uniform(.022, .032)
        drift, zl = rng.uniform(-.12, .12), BASE + rng.uniform(.05, .35)
        rings = []
        for k, z in enumerate((zl, (zl + .9) * .5 - .1, .9)):
            sag = (.02 if k == 1 else .06)
            rr = r * (1.0 if k == 2 else .7)
            rings.append((x + drift * (1 - k / 2), FRONT + rr + sag, z, rr, rr))
        vtube(hs, rings, 3, "sinew", FLESH, tag="sinew")
    for _ in range(2 + idx % 2):  # flesh fallen at the foot
        cx, cy, r = rng.uniform(-.85, .85), rng.uniform(FRONT + .04, FRONT + .14), rng.uniform(.05, .08)
        pts = [Vector((cx + rng.uniform(-r, r), cy + rng.uniform(-r * .6, r * .6), BASE + rng.uniform(0, r * .8))) for _ in range(6)]
        vk.hull_hs(hs, [Vector((p.x, max(FRONT + .005, p.y), p.z)) for p in pts], "flesh")
    return hs


def amnion_colour_fn(hs):
    def fn(paint, p, n, ao, fi):
        if hs.ftag[fi] == "crack":
            return AMNION["crack"]
        if paint in ("snow", "lip"):   # the bone-crust lip (its top lit, its ragged front edge shaded)
            return kit.mul3(kit.mix3(AMNION["bone_shade"], AMNION["bone"], kit.clamp(n.z, 0, 1)), kit.lerp(.7, 1.0, ao))
        if paint == "sinew" or hs.ftag[fi] == "sinew":
            return kit.mul3(kit.mix3(AMNION["sinew"], AMNION["sinew_lit"], kit.clamp(.4 - n.y * .5, 0, 1)), kit.lerp(.55, 1.0, ao))
        # Flesh: dark low and in the crevices, warmer where a face turns up or to the light.
        low = kit.clamp((p.z - BASE) / (1.0 - BASE), 0, 1)
        col = kit.mix3(AMNION["flesh_dark"], AMNION["flesh"], low)
        col = kit.mix3(col, AMNION["flesh_lit"], kit.clamp(.25 + n.z * .5 - n.y * .25, 0, 1) * .6)
        return kit.mul3(col, kit.lerp(.4, 1.0, ao))
    return fn


# ----------------------------------------------------------------------------- build
def check(name, hs):
    xs, ys, zs = ([v[i] for v in hs.verts] for i in range(3))
    problems = []
    if max(-min(xs), max(xs)) > HALF_X + 1e-6: problems.append('x %.3f' % max(-min(xs), max(xs)))
    if min(ys) < FRONT - 1e-6 or max(ys) > BACK + 1e-6: problems.append('y %.3f..%.3f' % (min(ys), max(ys)))
    if abs(max(zs) - 1.0) > 1e-6: problems.append('top %.4f' % max(zs))
    if min(zs) < BASE - 1e-6: problems.append('base %.3f' % min(zs))
    if hs.tris() > TRI_BUDGET: problems.append('tris %d > %d' % (hs.tris(), TRI_BUDGET))  # dozens per view (terrain budget)
    return [f'{name}: {p}' for p in problems]


def build(world, preview=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if world == 'khepri':
        mats = [vc.make_material('khepri_basalt', 'vc', rough=.88, metal=0.0),
                vc.make_material('khepri_mineral', 'vc', rough=.3, metal=0.0)]
        prefix, make, colour, names = 'cliff_wall', khepri_wall, khepri_colour_fn, ('khepri_basalt', 'khepri_mineral')
    elif world == 'amnion':
        mats = [vc.make_material('amnion_flesh', 'vc', rough=.45, metal=0.0), vc.make_material('amnion_bone', 'vc', rough=.9, metal=0.0)]
        prefix, make, colour, names = 'flesh_wall', amnion_wall, amnion_colour_fn, ('amnion_flesh',)  # bone is unused (no lip)
    else:
        mats = [vc.make_material(n, 'vc', rough=r, metal=0.0) for n, r in zip(vk.MAT_NAMES, (.12, .85, .9))]
        prefix, make, colour, names = 'ice_wall', vesper_wall, vesper_colour_fn, vk.MAT_NAMES[:2]  # rock is unused
    objs, problems, nodes = {}, [], {}
    for i in range(VARIANTS):
        name = '%s_%d' % (prefix, i)
        hs = make(random.Random('cliff-kit:%s' % name), i)
        vk.fit_top(hs, 1.0)
        problems += check(name, hs)
        cols = vc.bake(hs, name, dict(glow=set(), ao=.35, ground=0.0, colour_fn=colour(hs), tile=('x', 2.0)))
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        nodes[name] = dict(budget=TRI_BUDGET, foot=(2 * HALF_X, 1.2), y_min_exact=BASE, y_max_exact=1.0)
        print('CLIFF %-14s tris=%d' % (name, hs.tris()))
    if problems:
        raise SystemExit('Cliff kit contract:\n  ' + '\n  '.join(problems))
    path = os.path.join(ROOT, 'public', 'assets', world, 'cliff-kit.glb')
    vc.publish(path, 'cliff_kit.py', dict(materials=list(names), nodes=nodes, max_bytes=800_000), 'CLIFF')
    if preview:
        render_run(objs, world, preview)


def render_run(objs, world, out_dir):
    """A continuous cliff from the game camera: segments end to end at drop 2.4, a plateau behind, ground below."""
    import boss_remodel as br
    scene = bpy.context.scene
    names = sorted(objs)
    order = [names[i % len(names)] for i in (0, 2, 1, 3, 0, 1, 3, 2)]
    for o in objs.values():
        o.hide_render = True
    run = []
    for k, name in enumerate(order):
        inst = bpy.data.objects.new('run_%d' % k, objs[name].data)
        scene.collection.objects.link(inst)
        inst.location = (-7.0 + k * 2.0, 0.0, 0.0)
        inst.scale = (1.0, 1.0, 2.4)
        run.append(inst)
    top = br.material('preview_top', {'khepri': '#b8743f', 'amnion': '#ddd3c0'}.get(world, '#eef3f7'), .9, 0)
    low = br.material('preview_low', {'khepri': '#a0602f', 'amnion': '#34100f'}.get(world, '#13385c'), .9 if world != 'vesper' else .2, 0)
    for nm, (y0, y1, z, m) in {'plateau': (.35, 8, 2.4, top), 'floor': (-8, .2, 0.0, low)}.items():
        me = bpy.data.meshes.new(nm)
        me.from_pydata([(-9, y0, z), (9, y0, z), (9, y1, z), (-9, y1, z)], [], [(0, 1, 2, 3)])
        me.materials.append(m)
        ob = bpy.data.objects.new(nm, me)
        scene.collection.objects.link(ob)
        run.append(ob)
    os.makedirs(out_dir, exist_ok=True)
    br.game_view(scene, (0, 0, 1.2), 7.0, os.path.join(out_dir, '%s-cliff-run.png' % world), res=1000, objects=run,
                 light='ice' if world == 'vesper' else 'desert')


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser(prog='cliff_kit.py')
    ap.add_argument('--world', choices=('khepri', 'vesper', 'amnion'), default=None)
    ap.add_argument('--preview', default=None)
    args = ap.parse_args(argv)
    for w in ([args.world] if args.world else ['khepri', 'vesper']):
        build(w, args.preview)
