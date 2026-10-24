"""THE CRADLE from the user's Tripo GLB itself (24 October 2026). The user: "keep to the glb you have which is fully
detailed. start fresh. theres an inner core with the egg on flesheggs surrounded by 5-6 shields, then theres the wings
with 4-5 outer shields that kinda extend below to look like floating rocks. forget the turret nodes".

Adapted like the approved bosses (tools/blender/approved_bosses.py): the supplied mesh, UVs, normals and painted atlases
are kept; nothing is regenerated. Run through Blender MCP (UNC workspace path):

    import sys, importlib
    sys.path.insert(0, r'\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\tools\\blender')
    import approved_cradle; importlib.reload(approved_cradle).build()

Tripo split the mesh into arbitrary pieces (one holds half the egg, a shield and the flesh beside it), so parts are cut by
shape, in the reference placement (boss_remodel.PLACEMENT: source x 17, offset (0, 2.9, -1.6)):
- cradle_heart (+ _wreck): the golden egg, inside an ellipsoid round it;
- cradle_heart_shutter_0..5: the upper parts of the six inner shields round the egg. Each is a sector round the nest
  above a cut height, keeping only painted bone (the atlas tells bone from red flesh), closed over thin cracks (grown and
  shrunk four rings) and reduced to its main piece. Hinged on its cut line, local x along it, so the view's 42 degree
  swing (CRADLE_STYLE.shutterOpen) opens it outward; the stump stays on the hull like a joint;
- cradle_pod_left/right (+ _wreck): the red flesh bulges at the front flanks, the brood sacs (no turrets);
- cradle_hull: everything else, with faceted rock hanging under the five outer shields (on the wings and at the back),
  so the wings read as floating rock;
- cradle_flight_pod: the hatchling drone (remodel_cradle.drone).
Exported at 70% of the reference placement (user: "the model seems pretty big no?"): src/content/cradle.ts holds the
matching combat values.
"""
import bpy, bmesh, os, math, json, random
import numpy as np
from mathutils import Vector, Matrix
import approved_bosses as ab
import boss_remodel as br

SRC = os.path.join(br.ROOT, 'art', 'source', 'approved-bosses', 'cradle-tripo-original.glb')
REF_SCALE, REF_OFFSET = 17.0, Vector((0, 2.9, -1.6))
SCALE = .7
LABEL = 'v2-approved'
TAU = 2 * math.pi
# Reference-placement measurements (source pieces' bounds; boss_remodel.trace and height maps).
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
# The densest red flesh at each front flank (the model is asymmetric): the brood sacs.
SACS = dict(left=(-2.5, -.8, 1.66), right=(2.6, .4, 1.12), radius=.7)
# Outer shields' feet (centre, half extents across x and y, wing deck height): rock hangs below each, reaching down past
# the body's own base (about -1.6) so the wings read as floating rock.
OUTER = [((-5.1, 2.2), (.55, 1.3), .45), ((4.8, 1.3), (.6, 1.4), .45), ((-2.5, 7.1), (.6, .9), .6), ((1.7, 7.3), (.55, .9), .6), ((.4, 6.6), (.6, .8), .7)]


def source():
    key = 'approved_source_cradle'
    if key not in bpy.data.objects:
        sc = bpy.data.scenes.new('Last Worlds — Approved source cradle')
        bpy.context.window.scene = sc
        bpy.ops.import_scene.gltf(filepath=SRC)
        meshes = [o for o in sc.objects if o.type == 'MESH']
        if len(meshes) != 1:
            raise RuntimeError('Approved source mesh count changed')
        meshes[0].name = key
    return bpy.data.objects[key]


def face_data(ob):
    """Face centroids (reference placement), atlas colours at their UV centroids, and seam-merged vertex ids."""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3) * REF_SCALE + np.array(REF_OFFSET)
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    img = next(nd.image for nd in me.materials[0].node_tree.nodes if nd.type == 'TEX_IMAGE' and 'basecolor' in nd.image.name)
    W, H = img.size
    px = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)
    uv = np.empty(len(me.loops) * 2, dtype=np.float32); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    ls = np.empty(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_start', ls)
    fuv = (uv[ls] + uv[ls + 1] + uv[ls + 2]) / 3
    rgb = px[np.clip((fuv[:, 1] % 1) * H, 0, H - 1).astype(int), np.clip((fuv[:, 0] % 1) * W, 0, W - 1).astype(int), :3]
    _, vid = np.unique(np.round(co, 5), axis=0, return_inverse=True)
    return co, fv, co[fv].mean(1), rgb, vid.ravel()


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


def classify(ob):
    """Face classes: -1 hull, 0..5 inner shields, 'egg' 99, sacs 100/101."""
    co, fv, fc, rgb, vid = face_data(ob)
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
    for k, side in ((100, 'left'), (101, 'right')):
        sx, sy, sz = SACS[side]
        m = (np.linalg.norm(fc - np.array((sx, sy, sz)), axis=1) < SACS['radius']) & flesh & (cls == -1)
        cls[m] = k
    return cls, co, fv


def material(ob, size=2048, normal_size=1024):
    """The supplied atlases at working size; roughness kept legible; the egg's and the hollows' amber glows emit."""
    key = 'approved_cradle_surface_%d_v1' % size
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    mat = ob.data.materials[0].copy(); mat.name = key
    nt = mat.node_tree; bs = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    base = None
    directory = os.path.join(br.ROOT, 'lookdev', 'approved-bosses', 'textures'); os.makedirs(directory, exist_ok=True)
    for node in [nd for nd in nt.nodes if nd.type == 'TEX_IMAGE']:
        nm = node.image.name
        kind = 'base' if 'basecolor' in nm else 'rm' if '_rm.' in nm else 'normal'
        s = normal_size if kind == 'normal' else size
        img = node.image.copy(); img.name = key + '_' + kind; img.scale(s, s)
        if kind == 'rm':
            data = np.empty(s * s * 4, dtype=np.float32); img.pixels.foreach_get(data); rgba = data.reshape(-1, 4)
            rgba[:, 1] = np.clip(rgba[:, 1], .34, .86); img.pixels.foreach_set(data)
        path = os.path.join(directory, key + '_' + kind + ('.png' if kind == 'normal' else '.jpg'))
        img.filepath_raw = path; img.file_format = 'PNG' if kind == 'normal' else 'JPEG'; img.save()
        saved = bpy.data.images.load(path, check_existing=False); saved.colorspace_settings.name = img.colorspace_settings.name; saved.pack(); node.image = saved
        if kind == 'base':
            base = saved
    data = np.empty(size * size * 4, dtype=np.float32); base.pixels.foreach_get(data); rgb = data.reshape(-1, 4)[:, :3]
    r, g, b = rgb.T
    weight = np.clip((g / np.maximum(b, .02) - 1.5) * 3, 0, 1) * np.clip((r - .7) * 6, 0, 1)
    rgba = np.ones((size * size, 4), dtype=np.float32); rgba[:, :3] = weight[:, None] * np.array((1, .62, .16))
    emit = bpy.data.images.new(key + '_emission', width=size, height=size, alpha=False)
    emit.colorspace_settings.name = 'Non-Color'; emit.pixels.foreach_set(rgba.ravel()); emit.pack()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = emit
    nt.links.new(tex.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 2.2
    return mat


def bone_uv(ob, cls, rgb):
    """UV centroids of hull faces painted as weathered bone on the outer shields (for texturing the rock below them)."""
    me = ob.data
    uv = np.empty(len(me.loops) * 2, dtype=np.float32); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    ls = np.empty(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_start', ls)
    return (uv[ls] + uv[ls + 1] + uv[ls + 2]) / 3


def rocks(sc, mat, fc, fuv, rgb, cls):
    """Floating rock under the five outer shields, as if each ran on down through the wing: one chunky boulder mass per
    shield, wide under its foot and breaking off in a blunt, jagged underside, with two smaller chunks beside it.
    Flat-shaded and painted from the atlas where the body's own rock slabs are (each chunk samples a patch round one of
    those faces), so it carries the model's paint."""
    rng = random.Random('cradle-floating-rocks')
    r, g, b = rgb.T
    slabs = np.where((cls == -1) & (fc[:, 2] < -.3) & (fc[:, 2] > -1.5) & (np.hypot(fc[:, 0], fc[:, 1] - 2.5) < 4.5) & (r > .3) & (r < .75))[0]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')

    def chunk(ox, oy, top, rad, depth, sides):
        u0 = fuv[slabs[rng.randrange(len(slabs))]]
        ph = rng.uniform(0, TAU)
        prof = [(1.0, top), (rng.uniform(.95, 1.08), top - depth * .25), (rng.uniform(.7, .85), top - depth * .55), (rng.uniform(.38, .5), top - depth * .82)]
        rings = [[bm.verts.new(((ox + math.cos(ph + TAU * j / sides) * rad * f * rng.uniform(.82, 1.18)) * SCALE,
                                (oy + math.sin(ph + TAU * j / sides) * rad * f * rng.uniform(.82, 1.18)) * SCALE, (z + rng.uniform(-.14, .14)) * SCALE))
                  for j in range(sides)] for f, z in prof]
        faces = [bm.faces.new((a[j], a[(j + 1) % sides], bb[(j + 1) % sides], bb[j])) for a, bb in zip(rings, rings[1:]) for j in range(sides)]
        # A blunt, broken underside: two or three short points.
        last = rings[-1]
        c = sum((v.co for v in last), Vector()) / sides
        points = [bm.verts.new(c + Vector((rng.uniform(-.2, .2) * rad, rng.uniform(-.2, .2) * rad, -rng.uniform(.25, .55) * depth * SCALE * .3))) for _ in range(rng.choice((2, 3)))]
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
    me = bpy.data.meshes.new('cradle_rocks'); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new('cradle_rocks', me); sc.collection.objects.link(ob)
    return ob


BUDGET = 80000   # user, 24 October: "lets raise the max to the veils 80k" (the v2 export was 111k)


def build(ratio=.037, part_ratio=.15, label=LABEL):
    src = source()
    sc = bpy.data.scenes.get('Last Worlds — THE CRADLE approved') or bpy.data.scenes.new('Last Worlds — THE CRADLE approved')
    bpy.context.window.scene = sc
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(m)
    cls, co, fv = classify(src)
    _, _, fc, rgb, _ = face_data(src)
    fuv = bone_uv(src, cls, rgb)
    mat = material(src)
    scale, offset = REF_SCALE * SCALE, REF_OFFSET * SCALE
    objects = []

    def part(name, mask, pivot=(0, 0, 0), r=part_ratio):
        o = ab.extract(src, np.where(mask)[0].tolist(), name, scale, offset, pivot, r)
        o.data.materials.clear(); o.data.materials.append(mat); objects.append(o)
        return o

    hull = part('cradle_hull', cls == -1, r=ratio)
    rock = rocks(sc, mat, fc, fuv, rgb, cls)
    bpy.ops.object.select_all(action='DESELECT')
    rock.select_set(True); hull.select_set(True); bpy.context.view_layer.objects.active = hull; bpy.ops.object.join()
    egg_c = Vector(EGG['c']) * SCALE
    heart = part('cradle_heart', cls == 99, tuple(egg_c), .3)
    objects.append(ab.wreck_copy(heart))
    for side, k in (('left', 100), ('right', 101)):
        sac = part('cradle_pod_' + side, cls == k, tuple(Vector(SACS[side]) * SCALE))
        objects.append(ab.wreck_copy(sac))
    for k, sh in enumerate(SHIELDS):
        mask = cls == k
        pts = co[fv[mask].ravel()]
        low = pts[pts[:, 2] < pts[:, 2].min() + .25].mean(0)
        hinge = Vector(low) * SCALE
        o = part('cradle_heart_shutter_%d' % k, mask, tuple(hinge))
        out = Vector((low[0] - NEST[0], low[1] - NEST[1], 0)).normalized()
        phi = math.atan2(out.x, -out.y)   # local -y outward: the view's +x swing tips the top outward
        o.data.transform(Matrix.Rotation(-phi, 4, 'Z')); o.rotation_euler = (0, 0, phi)
    import remodel_cradle as rc
    pod = rc.flight_pod(rc.materials(), sc)
    objects.append(pod)
    total = 0
    for o in objects:
        if o.type == 'MESH':
            o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
    if total > BUDGET:
        raise RuntimeError('THE CRADLE over its %d-triangle budget: %d' % (BUDGET, total))
    tag = ab.marker('cradle_approved_v2'); tag['source_file'] = os.path.basename(SRC); tag['reduction_ratio'] = ratio; objects.append(tag)
    path = os.path.join(br.ROOT, 'public', 'assets', 'amnion', 'the-cradle-%s.glb' % label)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path + '.tmp.glb', export_format='GLB', use_selection=True, use_active_scene=True,
                              export_materials='EXPORT', export_image_format='AUTO', export_texcoords=True, export_normals=True,
                              export_yup=True, export_animations=False, export_extras=True, export_cameras=False, export_lights=False,
                              export_copyright='Last Worlds — user-supplied Tripo GLB, adapted in Blender without regeneration')
    os.replace(path + '.tmp.glb', path)
    tris = 0
    for o in objects:
        if o.type == 'MESH':
            o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
    counts = {int(k): int((cls == k).sum()) for k in np.unique(cls)}
    print(json.dumps(dict(file=path, triangles=tris, bytes=os.path.getsize(path), faces=counts, nodes=[o.name for o in objects])))
    return objects
