"""Cliff wall kits: real wall geometry along terrain cliff lines (terrain v15, docs/26).

The user wants real cliff walls ("sharp and crisp cliffs ... real cliff walls", "especially vesper can look much
more closer to the concept") built new after the concept's cliffs, not reused kit pieces
(art/concepts/01-worlds-direction.png):

- Khepri (left panel): sheer walls of large dark charcoal-brown slabs in vertical cleavage with crevices, most
  topping out at one flat, sand-dusted rim; a few broken lower or cleaved horizontally; teal crystal seams in some
  cracks; rubble at the foot.
- Vesper (right panel): a flat-topped ice shelf ending in narrow, fractured ice shards with sharp outward ridges
  (pale lit facets, deep blue shadow and cracks), broken tips at varied heights under a sawtooth snow rim, pointed
  shards at the foot (crisper and more pointed since 21 October, at the user's request).

Each node is one 2-unit wall segment that tiles along x (AO is baked with its neighbours repeated). Frame, as in
the other kits: glTF +Y up, front (the outward, downhill face) toward glTF +Z (Blender -y), pivot at the base
centre. Bounds: x -1.05 .. 1.05, glTF z -0.6 (back, into the slope) .. +0.35 (front relief), base -0.15, top exactly
1 so the terrain scales y by the local drop. Vertex colours carry the look; Khepri's crystal seams use a `mineral`
material (the kit loader makes those faces glow).

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/cliff_kit.py)" -- [--world khepri|vesper] [--preview DIR]
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


def shard(hs, lo_poly, hi_poly, z0, z1, side, top, mat, tag="main", fall=0.0):
    """A column between two rings with the same vertex count (a lean or taper between them). `fall`: the top
    drops by this much toward the front, so a pointed plan gives a pointed, broken tip."""
    if kit.poly_area(hi_poly) < 0:
        lo_poly, hi_poly = list(reversed(lo_poly)), list(reversed(hi_poly))
    n = len(hi_poly)
    lo = [hs.v((x, y, z0)) for x, y in lo_poly]
    hi = [hs.v((x, y, z1 - fall * kit.clamp((BACK - y) / (BACK - FRONT), 0.0, 1.0))) for x, y in hi_poly]
    for i in range(n):
        j = (i + 1) % n
        nx, ny = vk.outward_normal(hi_poly[i], hi_poly[j])
        hs.face((lo[i], lo[j], hi[j], hi[i]), side, tag, mat, outward=(nx, ny, 0.0))
    hs.face(tuple(hi), top, "top", mat if top != "snow" else SNOW, outward=(0, 0, 1))


def vesper_wall(rng, idx):
    """Crisp, pointed ice (user, 21 October: "vesper could be a bit more crisp and pointy"): narrow fractured shards,
    each a sharp outward ridge (a V in plan) whose two faces split light and shadow, leaning out a little toward the
    top; broken tips at varied heights that drop steeply to the front; a sawtooth snow rim; pointed shards fallen at
    the foot. After the concept's right panel."""
    hs = HS(rng)
    prism(hs, [(-HALF_X, BACK - .14), (HALF_X, BACK - .14), (HALF_X, BACK), (-HALF_X, BACK)], BASE, .9, "ice", "snow", ICE, SNOW, tag="crack")
    cols = chop(rng, -HALF_X, HALF_X, .22, .62)
    broken = set(rng.sample(range(len(cols)), 1 + (idx % 2)))
    for k, (a, b) in enumerate(cols):
        g = rng.uniform(.006, .016)
        a, b = a + g, b - g
        w = b - a
        # Most shards stand forward; some are set back, so the face is a fractured mass, not a fence.
        depth = rng.uniform(.14, .26) if rng.random() < .3 else rng.uniform(.0, .1)
        y0 = FRONT + depth
        if w > .42:
            # A wide mass: two ridges with a notch between them.
            t1, t2 = a + w * rng.uniform(.18, .34), a + w * rng.uniform(.66, .82)
            notch = (t1 + t2) / 2 + rng.uniform(-.04, .04)
            ridge = [(t2, y0 + rng.uniform(0, .05)), (notch, y0 + rng.uniform(.09, .16)), (t1, y0 + rng.uniform(0, .05))]
        else:
            ridge = [(a + w * rng.uniform(.3, .7), y0)]
        sa, sb = y0 + rng.uniform(.1, .2), y0 + rng.uniform(.1, .2)   # shoulders well behind the ridges
        hi_poly = [(b, BACK), (b, min(BACK - .05, sb))] + ridge + [(a, min(BACK - .05, sa)), (a, BACK)]
        lean = rng.uniform(.04, .1)                                 # the foot sits back: the face leans out
        lo_poly = [(x, min(BACK, y + lean)) if y < BACK - 1e-6 else (x, y) for x, y in hi_poly]
        if k in broken:
            top, fall = rng.uniform(.48, .7), rng.uniform(.18, .32)
        else:
            top, fall = rng.uniform(.8, .97), rng.uniform(.08, .28)
        shard(hs, lo_poly, hi_poly, BASE, top, "ice", "ice", ICE, fall=fall)
        if k in broken or top < .86:  # the shelf continues behind a broken shard
            back = [(a, BACK), (a, BACK - .26), (b, BACK - .26), (b, BACK)]
            prism(hs, back, top - .05, .92, "ice", "ice", ICE, ICE)
    # Sawtooth snow rim, top exactly 1: teeth point out over the face, notches cut back between them.
    xs = [-HALF_X + .01 + i * (2 * HALF_X - .02) / 8 for i in range(9)]
    front = [(x, FRONT + (.02 + rng.uniform(0, .05) if i % 2 else .14 + rng.uniform(0, .08))) for i, x in enumerate(xs)]
    poly = [(HALF_X - .01, BACK)] + list(reversed(front)) + [(-HALF_X + .01, BACK)]
    prism(hs, poly, .9, 1.0, "snow", "snow", SNOW, SNOW)
    for _ in range(2 + idx % 2):  # pointed shards fallen at the foot
        cx, cy, r = rng.uniform(-.85, .85), rng.uniform(FRONT + .04, FRONT + .14), rng.uniform(.05, .09)
        tip = Vector((cx + rng.uniform(-r, r), cy + rng.uniform(-r * .5, r * .5), BASE + r * rng.uniform(3.0, 4.5)))
        pts = [Vector((cx + rng.uniform(-r, r), cy + rng.uniform(-r * .6, r * .6), BASE + rng.uniform(0, r * .6))) for _ in range(5)] + [tip]
        vk.hull_hs(hs, [Vector((p.x, max(FRONT + .005, p.y), p.z)) for p in pts], "ice")
    return hs


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


# ----------------------------------------------------------------------------- build
def check(name, hs):
    xs, ys, zs = ([v[i] for v in hs.verts] for i in range(3))
    problems = []
    if max(-min(xs), max(xs)) > HALF_X + 1e-6: problems.append('x %.3f' % max(-min(xs), max(xs)))
    if min(ys) < FRONT - 1e-6 or max(ys) > BACK + 1e-6: problems.append('y %.3f..%.3f' % (min(ys), max(ys)))
    if abs(max(zs) - 1.0) > 1e-6: problems.append('top %.4f' % max(zs))
    if min(zs) < BASE - 1e-6: problems.append('base %.3f' % min(zs))
    if hs.tris() > 250: problems.append('tris %d > 250' % hs.tris())  # dozens per view (terrain budget)
    return [f'{name}: {p}' for p in problems]


def build(world, preview=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if world == 'khepri':
        mats = [vc.make_material('khepri_basalt', 'vc', rough=.88, metal=0.0),
                vc.make_material('khepri_mineral', 'vc', rough=.3, metal=0.0)]
        prefix, make, colour, names = 'cliff_wall', khepri_wall, khepri_colour_fn, ('khepri_basalt', 'khepri_mineral')
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
        nodes[name] = dict(budget=250, foot=(2 * HALF_X, 1.2), y_min_exact=BASE, y_max_exact=1.0)
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
    top = br.material('preview_top', '#b8743f' if world == 'khepri' else '#eef3f7', .9, 0)
    low = br.material('preview_low', '#a0602f' if world == 'khepri' else '#13385c', .9 if world == 'khepri' else .2, 0)
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
    ap.add_argument('--world', choices=('khepri', 'vesper'), default=None)
    ap.add_argument('--preview', default=None)
    args = ap.parse_args(argv)
    for w in ([args.world] if args.world else ['khepri', 'vesper']):
        build(w, args.preview)
