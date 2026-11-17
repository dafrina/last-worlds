"""THE VEIL (Nacre) since 17 November 2026: the old CRADLE model, re-cut and repainted as an ancient relic (docs/43 §3).

The user: "Reuse and reskin Amnion's current CRADLE model to become Nacre's new VEIL" (the old flying CRADLE, not the
walking spider). The earlier VEIL, a clean remodel traced over the user's spacecraft GLB, is in git history (this file
before 17 November).

Adapted like the approved Tripo bosses (art/bosses/README.md): the user's GLB (art/source/bosses/cradle-tripo-original.glb)
is placed, its faces copied into parts (tools/blender/lib_tripo.py), reduced, and its own UVs and atlases kept; nothing of
the shape is regenerated. This is the adaptation THE CRADLE used from 24 October to 17 November, moved here before the
walking CRADLE replaced it (docs/43 §14 step 1), with the VEIL's own node names, materials and atlas. Run headless:

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/run_build.py)" -- boss_veil [--no-export] [--no-preview]

The reference placement (source x 17, offset (0, 2.9, -1.6)) is the VEIL's own frame: THE CRADLE was first fitted to the
VEIL's combat sockets and later shrunk to 70% (src/content/cradle.ts), so at full size its egg and flanks sit where the
VEIL's targets are (x +-3.1, s -0.4 and 1.8 on the plane 2.2 over the mire). Parts, cut by shape:
- veil_heart (+ _wreck): the old golden egg, repainted as a cyan reactor crystal;
- veil_heart_shutter_0..5: the six inner shields' upper parts, hinged on their cut line (local x along it, local -y
  outward), so the view's 42 degree swing (VEIL_STYLE.shutterOpen) opens them outward and clears the heart's ray;
- veil_pod_left/right (+ _wreck): the relic side modules, the flank faces round the point where the camera ray through
  each fixed target first meets the hull, lit turquoise from within (their own emission, painted into the atlas);
- veil_hull: everything else, the floating stone under the outer ring shields included;
- veil_flight_pod: the Nacre pod the VEIL deploys (the earlier VEIL's drop pod shape), painted from patches of the relic's
  own atlas, so it draws in one material.
Repainted from the old CRADLE's atlas (`relic_paint`): bone becomes pearlescent violet stone, flesh deep indigo, the amber
glows turquoise; nothing reads as flesh or brood. Blender axes: x right, y away from the player (glTF -z), z up; mire at 0.
"""
import bpy, bmesh, os, math, json, random
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import lib_tripo as tripo
import lib_solids as br

SRC = os.path.join(br.ROOT, 'art', 'source', 'bosses', 'cradle-tripo-original.glb')
REF_SCALE, REF_OFFSET = 17.0, Vector((0, 2.9, -1.6))
TAU = 2 * math.pi
TAN = math.tan(math.radians(35))   # the 55-degree game camera's ray loses TAN of y per unit of height
TARGET_Z = 2.2                     # VEIL.targetHeight
POD_X, POD_S, HEART_S = 3.1, -0.4, 1.8
BUDGET = 80000
# Reference-placement measurements of the old CRADLE (boss_cradle.py of 24 October).
EGG = dict(c=(.05, .27, 3.38), r=(.7, 1.1, .86))
NEST = (-.1, 1.3)
SHIELDS = [  # sector round NEST (mid azimuth, extent either side, rad), radius range, cut height
    dict(name='front_left', amid=-2.186, a0=-.468, a1=.372, r0=2.548, r1=4.867, zc=1.313),
    dict(name='front_right', amid=-1.041, a0=-.207, a1=.257, r0=2.617, r1=3.937, zc=2.562),
    dict(name='left', amid=-3.085, a0=-.495, a1=.565, r0=.890, r1=2.818, zc=2.658),
    dict(name='right', amid=.127, a0=-.991, a1=1.027, r0=.623, r1=3.161, zc=2.580),
    dict(name='back_left', amid=2.428, a0=-.540, a1=.552, r0=1.080, r1=3.245, zc=2.726),
    dict(name='back', amid=1.603, a0=-.395, a1=.343, r0=2.295, r1=4.375, zc=2.674),
]
# Outer shields' feet (centre, half extents across x and y, wing deck height): stone hangs below each.
OUTER = [((-5.1, 2.2), (.55, 1.3), .45), ((4.8, 1.3), (.6, 1.4), .45), ((-2.5, 7.1), (.6, .9), .6), ((1.7, 7.3), (.55, .9), .6), ((.4, 6.6), (.6, .8), .7)]
# A relic side module: the hull faces within this reach of where the target's camera ray first meets the hull.
MODULE_REACH = (.95, .8)   # horizontal radius, half height


def ray_y(z, target_y):
    """y where the camera ray through a fixed combat target (on the plane TARGET_Z) reaches height z."""
    return target_y - (z - TARGET_Z) * TAN


def source(sc):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SRC)
    meshes = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
    if len(meshes) != 1:
        raise RuntimeError('Approved source mesh count changed')
    ob = meshes[0]
    ob.name = 'relic_source'
    for o in list(sc.objects):
        if o != ob and o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    return ob


def face_data(ob):
    """Face centroids (reference placement), atlas colours at their UV centroids, UV centroids and seam-merged vertex ids."""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    M = np.array(ob.matrix_world)
    co = (co @ M[:3, :3].T + M[:3, 3]) * REF_SCALE + np.array(REF_OFFSET)
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    img = next(nd.image for nd in me.materials[0].node_tree.nodes if nd.type == 'TEX_IMAGE' and 'basecolor' in nd.image.name)
    W, H = img.size
    px = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)
    uv = np.empty(len(me.loops) * 2, dtype=np.float32); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    ls = np.empty(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_start', ls)
    fuv = (uv[ls] + uv[ls + 1] + uv[ls + 2]) / 3
    rgb = px[np.clip((fuv[:, 1] % 1) * H, 0, H - 1).astype(int), np.clip((fuv[:, 0] % 1) * W, 0, W - 1).astype(int), :3]
    _, vid = np.unique(np.round(co, 5), axis=0, return_inverse=True)
    return co, fv, co[fv].mean(1), rgb, vid.ravel(), uv, ls, fuv


def adjacency(F, idx):
    """Edge-adjacent face pairs among faces idx (positions in idx), both directions."""
    sub = F[idx]
    e = np.concatenate([np.sort(sub[:, [0, 1]], 1), np.sort(sub[:, [1, 2]], 1), np.sort(sub[:, [2, 0]], 1)])
    owner = np.tile(np.arange(len(idx)), 3)
    key = e[:, 0] * (F.max() + 1) + e[:, 1]
    order = np.argsort(key); key, owner = key[order], owner[order]
    same = key[1:] == key[:-1]
    a, b = owner[:-1][same], owner[1:][same]
    return np.concatenate([a, b]), np.concatenate([b, a])


def classify(co, fv, fc, rgb, vid):
    """Face classes: -1 hull, 0..5 inner shields, 99 the egg (the heart)."""
    r, g, b = rgb.T
    flesh = (r > g * 1.45) & (r > b * 1.5)
    cls = np.full(len(fc), -1)
    (ex, ey, ez), (rx, ry, rz) = EGG['c'], EGG['r']
    cls[((fc[:, 0] - ex) / rx) ** 2 + ((fc[:, 1] - ey) / ry) ** 2 + ((fc[:, 2] - ez) / rz) ** 2 < 1] = 99
    d = fc[:, :2] - np.array(NEST)
    fa, fr = np.arctan2(d[:, 1], d[:, 0]), np.hypot(d[:, 0], d[:, 1])
    F = vid[fv]
    for k, sh in enumerate(SHIELDS):
        da = np.angle(np.exp(1j * (fa - sh['amid'])))
        idx = np.where((da > sh['a0']) & (da < sh['a1']) & (fr > sh['r0']) & (fr < sh['r1']) & (fc[:, 2] > sh['zc']) & (cls == -1))[0]
        src, dst = adjacency(F, idx)
        sel = ~flesh[idx]
        for _ in range(4):   # close over thin cracks
            grown = sel.copy(); grown[dst[sel[src]]] = True; sel = grown
        for _ in range(4):
            out = ~sel; shrunk = sel.copy(); shrunk[dst[out[src]]] = False; sel = shrunk
        lab = np.where(sel, np.arange(len(idx)), -1)
        for _ in range(500):
            m = sel[src] & sel[dst]
            new = lab.copy(); np.minimum.at(new, dst[m], lab[src[m]])
            if np.array_equal(new, lab):
                break
            lab = new
        u, c = np.unique(lab[sel], return_counts=True)
        keep = u[c >= max(c.max() * .15, 200)]
        cls[idx[np.isin(lab, keep) & sel]] = k
    return cls


def first_hits(co, fv, cls, rays):
    """Where each camera ray (x, s on the target plane) first meets the hull (class -1) from above."""
    hull = np.where(cls == -1)[0]
    tree = BVHTree.FromPolygons([tuple(p) for p in co.tolist()], fv[hull].tolist())
    d = Vector((0, math.cos(math.radians(55)), -math.sin(math.radians(55))))
    out = []
    for x, s in rays:
        top = 8.0
        origin = Vector((x, ray_y(top, s), top))
        hit, _, index, dist = tree.ray_cast(origin, d, 30)
        out.append(hit)
    return out


def modules(fc, cls, hits):
    """Classes 100 (left) and 101 (right): hull faces round each flank ray's first hit."""
    for k, hit in ((100, hits[0]), (101, hits[1])):
        h, half = MODULE_REACH
        m = (np.hypot(fc[:, 0] - hit.x, fc[:, 1] - hit.y) < h) & (np.abs(fc[:, 2] - hit.z) < half) & (cls == -1)
        cls[m] = k
    return cls


# ----------------------------------------------------------------------------- the relic paint
# Display-space tones (the atlas's own encoding): Nacre's pearl, violet and indigo, its turquoise and pale cyan light.
PEARL = [(.30, .27, .44), (.62, .58, .76), (.86, .84, .95)]   # stone: shadow, mid, light
TINTS = [(1.0, .96, 1.04), (.93, 1.02, 1.03), (1.04, .97, .99)]   # pearlescent drift: lilac, pale teal, rose
DEEP = [(.05, .04, .13), (.17, .11, .33), (.33, .22, .55)]     # the old flesh: deep indigo to violet
LIGHT = [(.04, .30, .36), (.30, .86, .84), (.66, 1.0, .95)]      # the old amber: teal to pale cyan
GLOW = (.22, 1.0, .86)                                           # emission colour


def ramp(t, stops):
    t = np.clip(t, 0, 1)[:, None]
    a, b, c = (np.array(s, dtype=np.float32) for s in stops)
    return np.where(t < .5, a + (b - a) * (t / .5), b + (c - b) * ((t - .5) / .5))


def relic_paint(rgb, uv):
    """The old CRADLE's atlas repainted: weights for its bone, flesh and amber glow, each mapped onto a Nacre ramp by its
    own brightness, so every crack, plate edge and baked shadow of the paint stays."""
    r, g, b = rgb.T
    lum = .3 * r + .59 * g + .11 * b
    glow = np.clip((g / np.maximum(b, .02) - 1.5) * 3, 0, 1) * np.clip((r - .7) * 6, 0, 1)
    flesh = np.clip((r / np.maximum(g, .02) - 1.3) * 2.2, 0, 1) * (1 - glow)
    bone = np.clip(1 - glow - flesh, 0, 1)
    u, v = uv[:, 0], uv[:, 1]
    drift = (np.sin(TAU * (u * 3.1 + v * 2.3)) * np.sin(TAU * (v * 4.7 - u * 1.3)) + 1) / 2
    w = np.stack([np.clip(1 - drift * 2, 0, 1), 1 - np.abs(drift * 2 - 1), np.clip(drift * 2 - 1, 0, 1)], 1)
    tint = w @ np.array(TINTS, dtype=np.float32)
    stone = ramp((lum - .18) / .7, PEARL) * tint
    deep = ramp((lum - .06) / .55, DEEP)
    light = ramp((lum - .2) / .7, LIGHT)
    out = bone[:, None] * stone + flesh[:, None] * deep + glow[:, None] * light
    return np.clip(out, 0, 1), glow


def raster(tris, size):
    """Pixel indices (row, col) covered by UV triangles (n, 3, 2), one triangle at a time over its bounding box."""
    rows, cols = [], []
    for t in tris:
        p = t * size
        x0, y0 = np.floor(p.min(0)).astype(int); x1, y1 = np.ceil(p.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1 + 1, size)), np.arange(max(y0, 0), min(y1 + 1, size)))
        px, py = xs.ravel() + .5, ys.ravel() + .5
        (ax, ay), (bx, by), (cx, cy) = p
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den
        l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den
        inside = (l1 >= -.08) & (l2 >= -.08) & (1 - l1 - l2 >= -.08)   # a little bleed over the seams
        rows.append(ys.ravel()[inside]); cols.append(xs.ravel()[inside])
    return (np.concatenate(rows), np.concatenate(cols)) if rows else (np.zeros(0, int), np.zeros(0, int))


def material(ob, module_tris, size=2048, normal_size=1024):
    """The relic's own material: the old CRADLE's atlases at working size, repainted (`relic_paint`), roughness and metal
    for weathered pearl, an emission map where the old amber glowed and over the side modules."""
    key = 'veil_relic'
    mat = ob.data.materials[0].copy(); mat.name = key
    nt = mat.node_tree; bs = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    directory = os.path.join(br.ROOT, 'lookdev', 'boss-remodel', 'textures'); os.makedirs(directory, exist_ok=True)
    base = None
    for node in [nd for nd in nt.nodes if nd.type == 'TEX_IMAGE']:
        nm = node.image.name
        kind = 'base' if 'basecolor' in nm else 'rm' if '_rm.' in nm else 'normal'
        s = normal_size if kind == 'normal' else size
        img = node.image.copy(); img.name = key + '_' + kind; img.scale(s, s)
        data = np.empty(s * s * 4, dtype=np.float32); img.pixels.foreach_get(data); rgba = data.reshape(-1, 4)
        if kind == 'rm':
            rgba[:, 1] = np.clip(rgba[:, 1] * .85, .26, .74)   # roughness: polished pearl to weathered stone
            rgba[:, 2] = np.clip(rgba[:, 2] * .6 + .08, .08, .32)
        elif kind == 'base':
            jj, ii = np.divmod(np.arange(s * s), s)
            uv = np.stack([(ii + .5) / s, (jj + .5) / s], 1).astype(np.float32)
            painted, glow = relic_paint(rgba[:, :3].copy(), uv)
            rgba[:, :3] = painted
            base_glow = glow
        img.pixels.foreach_set(data)
        path = os.path.join(directory, key + '_' + kind + ('.png' if kind == 'normal' else '.jpg'))
        img.filepath_raw = path; img.file_format = 'PNG' if kind == 'normal' else 'JPEG'; img.save()
        saved = bpy.data.images.load(path, check_existing=False); saved.colorspace_settings.name = img.colorspace_settings.name; saved.pack(); node.image = saved
        if kind == 'base':
            base = saved
    rgba = np.ones((size * size, 4), dtype=np.float32)
    rgba[:, :3] = base_glow[:, None] * np.array(GLOW)
    # The side modules glow from within: their faces' UVs lit turquoise, brightest where the paint is lightest.
    # Veins and cells, not a flat wash: only the lighter half of the repainted shading lights, so the seams stay dark.
    rows, cols = raster(module_tris, size)
    lit = rows * size + cols
    data = np.empty(size * size * 4, dtype=np.float32); base.pixels.foreach_get(data); rgb = data.reshape(-1, 4)[:, :3]
    lum = rgb[lit] @ np.array([.3, .59, .11], dtype=np.float32)
    lo, hi = np.percentile(lum, 35), np.percentile(lum, 97)
    rgba[lit, :3] = np.maximum(rgba[lit, :3], (np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1) ** 1.4 * .9)[:, None] * np.array(GLOW))
    emit = bpy.data.images.new(key + '_emission', width=size, height=size, alpha=False)
    emit.colorspace_settings.name = 'Non-Color'; emit.pixels.foreach_set(rgba.ravel()); emit.pack()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = emit
    tex.location = (-400, -600)
    nt.links.new(tex.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 2.0
    return mat


def stone(sc, mat, fc, fuv, rgb, cls):
    """Floating stone under the five outer ring shields, weathered relic masonry hanging below the wings: one chunky mass
    per shield, breaking off in a blunt underside, two smaller pieces beside it. Painted from the atlas where the body's
    own stone slabs are (each chunk samples a patch round one of those faces)."""
    rng = random.Random('cradle-floating-rocks')
    r, g, b = rgb.T
    slabs = np.where((cls == -1) & (fc[:, 2] < -.3) & (fc[:, 2] > -1.5) & (np.hypot(fc[:, 0], fc[:, 1] - 2.5) < 4.5) & (r > .3) & (r < .75))[0]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')

    def chunk(ox, oy, top, rad, depth, sides):
        u0 = fuv[slabs[rng.randrange(len(slabs))]]
        ph = rng.uniform(0, TAU)
        prof = [(1.0, top), (rng.uniform(.95, 1.08), top - depth * .25), (rng.uniform(.7, .85), top - depth * .55), (rng.uniform(.38, .5), top - depth * .82)]
        rings = [[bm.verts.new((ox + math.cos(ph + TAU * j / sides) * rad * f * rng.uniform(.82, 1.18),
                                oy + math.sin(ph + TAU * j / sides) * rad * f * rng.uniform(.82, 1.18), z + rng.uniform(-.14, .14)))
                  for j in range(sides)] for f, z in prof]
        faces = [bm.faces.new((a[j], a[(j + 1) % sides], bb[(j + 1) % sides], bb[j])) for a, bb in zip(rings, rings[1:]) for j in range(sides)]
        last = rings[-1]
        c = sum((v.co for v in last), Vector()) / sides
        points = [bm.verts.new(c + Vector((rng.uniform(-.2, .2) * rad, rng.uniform(-.2, .2) * rad, -rng.uniform(.25, .55) * depth * .3))) for _ in range(rng.choice((2, 3)))]
        for j in range(sides):
            faces.append(bm.faces.new((last[j], last[(j + 1) % sides], points[j * len(points) // sides])))
        for k in range(len(points)):
            a, bb = points[k], points[(k + 1) % len(points)]
            j = (k + 1) * sides // len(points) % sides
            if a != bb:
                try:
                    faces.append(bm.faces.new((a, bb, last[j])))
                except ValueError:
                    pass
        faces.append(bm.faces.new(list(reversed(rings[0]))))
        for f in faces:
            for loop in f.loops:
                v = loop.vert.co
                loop[uvl].uv = (float(u0[0]) + (v.x + v.y) * .02, float(u0[1]) + v.z * .02)

    for (cx, cy), (hx, hy), deck in OUTER:
        chunk(cx, cy, deck + .25, max(hx, hy) * rng.uniform(.75, .9), rng.uniform(2.4, 3.1), rng.choice((7, 8)))
        for _ in range(2):
            a = rng.uniform(0, TAU)
            chunk(cx + math.cos(a) * hx * 1.1, cy + math.sin(a) * hy * 1.1, deck - rng.uniform(.4, 1.0), rng.uniform(.25, .4), rng.uniform(.8, 1.4), rng.choice((5, 6)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('veil_stone'); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new('veil_stone', me); sc.collection.objects.link(ob)
    return ob


# ----------------------------------------------------------------------------- the Nacre pod
DROP_PROFILE = [(0, .0), (.1, .32), (.28, .76), (.5, 1.0), (.72, .96), (.88, .72), (.97, .38), (1.0, .0)]   # egg, pointed bottom


def flight_pod(sc, mat, fuv, picks):
    """The launched pod (the earlier VEIL's drop pod: a violet egg in four petals, a cyan slit, a glowing tip), on its own
    origin; the view instances it at flight height. Its faces take small UV patches of the relic's own paint: pearl for
    the shell, indigo for the seams, the reactor's light for the slit and tip."""
    scale = .6
    r, height = .38 * scale, 1.7 * scale
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    seg = 8

    def ring(z, rad, phase=math.pi / seg, n=seg, centre=(0, 0)):
        return [bm.verts.new((centre[0] + rad * math.cos(phase + TAU * k / n), centre[1] + rad * math.sin(phase + TAU * k / n), z)) for k in range(n)]

    def paint(faces, key):
        u0 = fuv[picks[key]]
        for f in faces:
            for loop in f.loops:
                v = loop.vert.co
                loop[uvl].uv = (float(u0[0]) + (v.x + v.z) * .01, float(u0[1]) + v.y * .01)

    base = -height * .5
    rings = [[bm.verts.new((0, 0, base + f * height))] if k == 0 else ring(base + f * height, k * r) for f, k in DROP_PROFILE]
    shell, seams = [], []
    for a, b in zip(rings, rings[1:]):
        for j in range(seg):
            if len(a) == 1:
                f = bm.faces.new((b[j], b[(j + 1) % seg], a[0]))
            elif len(b) == 1:
                f = bm.faces.new((a[j], a[(j + 1) % seg], b[0]))
            else:
                f = bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
            (seams if j % 2 == 1 and len(a) > 1 and len(b) > 1 else shell).append(f)
    paint(shell, 'shell'); paint(seams, 'seam')
    # The cyan slit on its face (toward the player, -y) and the engine tip under it.
    slit = []
    for z0, z1 in ((base + .3 * height, base + .78 * height),):
        w = .04
        a = bm.verts.new((-w, -r * 1.02, z0)); b = bm.verts.new((w, -r * 1.02, z0))
        c = bm.verts.new((w, -r * 1.02, z1)); d = bm.verts.new((-w, -r * 1.02, z1))
        slit.append(bm.faces.new((a, b, c, d)))
    tip = ring(base - .1, .07, 0, 6)
    apex = bm.verts.new((0, 0, base - .2))
    for j in range(6):
        slit.append(bm.faces.new((tip[j], tip[(j + 1) % 6], apex)))
    slit.append(bm.faces.new(list(reversed(tip))))
    paint(slit, 'glow')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('veil_flight_pod'); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(40))
    ob = bpy.data.objects.new('veil_flight_pod', me); sc.collection.objects.link(ob)
    return ob


def crystals(sc, mat, centre, out, uv_glow, uv_dark, broken=False, seed='veil-module'):
    """A relic module's crystal cluster: faceted shards standing out of the flank, leaning outward (`out`, a unit
    vector away from the ship's middle), the tallest on the target's camera ray. Their shafts take the reactor's light
    from the atlas (`uv_glow`), their sockets the deep indigo (`uv_dark`). Broken: the same shards snapped off low."""
    rng = random.Random(seed)
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    c = Vector(centre)
    shards = [((0, 0), .3, 1.5, 0)] + [((math.cos(a) * .46, math.sin(a) * .4), rng.uniform(.14, .2), rng.uniform(.7, 1.1), a)
                                         for a in (TAU * k / 5 + rng.uniform(-.3, .3) for k in range(5))]
    for (dx, dy), rad, tall, a in shards:
        if broken:
            tall *= rng.uniform(.25, .4)
        lean = Vector((out.x * .35 + dx * .5, out.y * .35 + dy * .5, 1)).normalized()
        foot = c + Vector((dx, dy, -.18))
        side = lean.cross(Vector((0, 0, 1)))
        side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
        up = side.cross(lean).normalized()
        ph = rng.uniform(0, TAU)
        ring = lambda s, h: [bm.verts.new(foot + lean * h + (side * math.cos(ph + TAU * k / 6) + up * math.sin(ph + TAU * k / 6)) * rad * s) for k in range(6)]
        r0, r1 = ring(1.0, 0), ring(.92, tall * .78)
        faces_glow, faces_dark = [], []
        for k in range(6):
            faces_glow.append(bm.faces.new((r0[k], r0[(k + 1) % 6], r1[(k + 1) % 6], r1[k])))
        if broken:
            faces_dark.append(bm.faces.new(r1))   # the snapped face
        else:
            tip = bm.verts.new(foot + lean * tall)
            for k in range(6):
                faces_glow.append(bm.faces.new((r1[k], r1[(k + 1) % 6], tip)))
        faces_dark.append(bm.faces.new(list(reversed(r0))))
        for faces, u0 in ((faces_glow, uv_glow), (faces_dark, uv_dark)):
            for f in faces:
                for loop in f.loops:
                    v = loop.vert.co
                    loop[uvl].uv = (float(u0[0]) + (v.x + v.y) * .004, float(u0[1]) + v.z * .004)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('veil_crystals'); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new('veil_crystals', me); sc.collection.objects.link(ob)
    return ob


def join_into(target, other):
    bpy.ops.object.select_all(action='DESELECT')
    other.select_set(True); target.select_set(True); bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    return target


def open_pose(objects, amount=1.0):
    """Shutters as the game opens them (previews): a turn about each node's local x."""
    for o in objects:
        if o.name.startswith('veil_heart_shutter_'):
            o.rotation_euler = (math.radians(42) * amount, 0, o['yaw'])


def build(export=True, preview=True, ratio=.037, part_ratio=.15):
    sc = br.scene('Last Worlds — THE VEIL relic')
    src = source(sc)
    co, fv, fc, rgb, vid, uv, ls, fuv = face_data(src)
    cls = classify(co, fv, fc, rgb, vid)
    hits = first_hits(co, fv, cls, [(-POD_X, POD_S), (POD_X, POD_S)])
    cls = modules(fc, cls, hits)
    module_faces = np.where((cls == 100) | (cls == 101))[0]
    module_tris = uv[(ls[module_faces][:, None] + np.arange(3)[None, :])].reshape(-1, 3, 2)
    mat = material(src, module_tris)
    objects = []

    def part(name, mask, pivot=(0, 0, 0), r=part_ratio):
        o = tripo.extract(src, np.where(mask)[0].tolist(), name, REF_SCALE, tuple(REF_OFFSET), pivot, r)
        o.data.materials.clear(); o.data.materials.append(mat); objects.append(o)
        return o

    hull = part('veil_hull', cls == -1, r=ratio)
    rock = stone(sc, mat, fc, fuv, rgb, cls)
    bpy.ops.object.select_all(action='DESELECT')
    rock.select_set(True); hull.select_set(True); bpy.context.view_layer.objects.active = hull; bpy.ops.object.join()
    heart = part('veil_heart', cls == 99, EGG['c'], .3)
    objects.append(tripo.wreck_copy(heart))
    # Paint patches for the crystals and the pod: light pearl stone, deep indigo, the reactor's brightest light.
    lum = rgb @ np.array([.3, .59, .11])
    rr, gg, bb = rgb.T
    flesh = (rr > gg * 1.45) & (rr > bb * 1.5)
    glowing = np.clip((gg / np.maximum(bb, .02) - 1.5) * 3, 0, 1) * np.clip((rr - .7) * 6, 0, 1)
    picks = dict(shell=int(np.argmax(np.where((cls == -1) & ~flesh, lum, -1))), seam=int(np.argmax(np.where(flesh & (cls == -1), -np.abs(lum - .3), -9))),
                 glow=int(np.argmax(np.where(cls == 99, glowing * lum, -1))))
    for side, k, hit in (('left', 100, hits[0]), ('right', 101, hits[1])):
        pod = part('veil_pod_' + side, cls == k, tuple(hit))
        wreck = tripo.wreck_copy(pod)
        out = Vector((hit.x, hit.y - 1.0, 0)).normalized()
        join_into(pod, crystals(sc, mat, hit, out, fuv[picks['glow']], fuv[picks['seam']], seed='veil-module-' + side))
        join_into(wreck, crystals(sc, mat, hit, out, fuv[picks['glow']], fuv[picks['seam']], broken=True, seed='veil-module-' + side))
        objects.append(wreck)
    for k, sh in enumerate(SHIELDS):
        mask = cls == k
        pts = co[fv[mask].ravel()]
        low = pts[pts[:, 2] < pts[:, 2].min() + .25].mean(0)
        o = part('veil_heart_shutter_%d' % k, mask, tuple(low))
        out = Vector((low[0] - NEST[0], low[1] - NEST[1], 0)).normalized()
        phi = math.atan2(out.x, -out.y)   # local -y outward: the view's +x swing tips the top outward
        o.data.transform(Matrix.Rotation(-phi, 4, 'Z')); o.rotation_euler = (0, 0, phi); o['yaw'] = phi
    objects.append(flight_pod(sc, mat, fuv, picks))
    bpy.data.objects.remove(src, do_unlink=True)
    total = br.triangles(objects)
    if total > BUDGET:
        raise RuntimeError('THE VEIL over its %d-triangle budget: %d' % (BUDGET, total))
    objects.append(br.marker('veil_relic_v1', sc=sc, source_file=os.path.basename(SRC), reduction_ratio=ratio,
                             note='The old CRADLE (the user\'s Tripo GLB) adapted and repainted as THE VEIL; no geometry regenerated'))
    counts = {int(k): int((cls == k).sum()) for k in np.unique(cls)}
    print('VEIL classes', json.dumps(counts), 'module hits', [tuple(round(c, 3) for c in h) for h in hits])
    result = None
    if export:
        path = os.path.join(br.ROOT, 'public', 'assets', 'nacre', 'the-veil.glb')
        result = br.export(path, objects, 'Last Worlds — THE VEIL: the user-supplied Tripo GLB (the old CRADLE), adapted and repainted in Blender')
    if preview:
        os.makedirs(br.LOOKDEV, exist_ok=True)
        shown = [o for o in objects if o.type == 'MESH' and not o.name.endswith('_wreck') and o.name != 'veil_flight_pod']
        for view in ('game', 'top', 'side'):
            br.render_view(sc, view, (0, 1.6, 1.6), 17, os.path.join(br.LOOKDEV, 'veil-relic-%s.png' % view), res=1000, objects=shown, light='nacre')
        open_pose(objects)
        br.render_view(sc, 'game', (0, 1.6, 1.6), 17, os.path.join(br.LOOKDEV, 'veil-relic-game-open.png'), res=1000, objects=shown, light='nacre')
        open_pose(objects, 0)
    return objects, result
