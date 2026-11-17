"""THE CRADLE (Amnion) since 17 November 2026: a colossal walking brood hive adapted from the user's spider GLB
(art/source/bosses/cradle-walker-original.glb, "monster spider 3d model.glb"; docs/43 §4-7). The flying CRADLE before it
(the user's Tripo hive GLB) is now THE VEIL (boss_veil.py).

Adapted like the approved Tripo bosses (art/bosses/README.md): the user's mesh, UVs and painted atlases are kept and
reduced; nothing of the shape is regenerated except the heart, its cavity and the hatchling drone, which the spider lacks
(painted from patches of its own atlas). Run headless:

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/run_build.py)" -- boss_cradle [--no-export] [--no-preview]

Working units are the source x10 (x right, y away from the player, the spider's face toward -y, z up, feet at 0); the game
model is the working model x G (1.45), so the source's own egg sacs land on the fixed brood-chamber targets (x +-2.17).
Parts (the rig contract of src/render/cradle-walker.ts):
- cradle_body, cradle_carapace, cradle_underside: the spider's body inside its flanks (its own legs cut off at the body's
  edge), split at heights into the armoured top, the flanks and the hanging brood structure underneath;
- cradle_vents: the body's glowing pores and mouths (their own node, so the view can make them breathe);
- cradle_body_core: a dark flesh core inside the body, closing the cuts where its legs and sacs came off;
- cradle_pod_left/right (+ _wreck): the brood chambers, the spider's own egg sacs enlarged, glowing amber from within; the
  wreck is the sac ruptured and sagging;
- cradle_heart (+ _wreck) inside cradle_heart_cavity, under cradle_heart_shutter_0..3: the carapace over the heart cut in
  four plates, each hinged on its outer edge (local x along the hinge, local -y outward, as THE ECLIPSE's), so the view's
  swing opens them outward and clears the heart's camera ray;
- cradle_leg_<k>_coxa/femur/tibia/tarsus, k 0..7 (0-3 left, front to back; 4-7 right): the spider's side leg, cut at its
  joints, copied to every hip (mirrored on the right, scaled per pair). Each segment's origin is its proximal joint; the
  empty cradle_leg_<k>_foot marks the claw's tip. The rest pose is the spider's; the view poses the legs by IK;
- cradle_flight_pod: the hatchling drone the boss launches.
"""
import bpy, bmesh, os, math, json, random
import numpy as np
from mathutils import Vector, Matrix
import lib_tripo as tripo
import lib_solids as br

SRC = os.path.join(br.ROOT, 'art', 'source', 'bosses', 'cradle-walker-original.glb')
W = 10.0                 # working units per source unit
# The crouched walker (user, 17 November: "make its body sit lower, when it crashes it will be finally laying on the
# ground"): it stands on the plateau the player flies over, so it is built at SIZE of its first scale (1.45 game units per
# working unit) and its whole frame stands DROP lower on its feet, the body hanging near the ground between high knees,
# its top well under the flight plane. Its brood chambers keep their places on the targets (x +-2.17), larger.
SIZE = .55
G = 1.45 * SIZE          # game units per working unit
DROP = .6                # how far the frame is lowered below its rest pose's feet (the view plants the feet on the ground)
TOP = 4.05               # the highest any part may stand over its feet's ground (the flight plane 3.8 over a -0.75 floor)
TAN = math.tan(math.radians(35))
TARGET_Z = 2.6           # the visual target plane over the floor (WALKER.targetHeight in the view)
HEART_AT = (-.45, 4.2)   # working (y, z) of the heart: under the middle of the dorsal crest
CHAMBER_Z = 1.25         # the brood chambers' centres over the ground: slung low on the flanks
SAC_X, SAC_S, HEART_S = 2.17, -0.28, 1.26
BUDGET = 80000
TAU = 2 * math.pi
# The body: an elliptic cylinder round its middle (working); faces outside it are legs.
BODY = dict(c=(0.0, -0.3), r=(1.2, 2.1))
# The template leg (the spider's left side leg, foot at (-4.65, -1.26, 0)): its plane runs from BODY c along LEG_DIR.
LEG_DIR = (-.975, -.221)
# Its joints in the leg plane (t along LEG_DIR from BODY c, z): hip, coxa end, knee, ankle, claw tip (read side-on).
LEG_JOINTS = [(1.72, 3.96), (2.3, 4.02), (3.49, 3.92), (4.67, 2.48), (4.83, .05)]
SEGMENTS = ('coxa', 'femur', 'tibia', 'tarsus')
# Hips: azimuth (deg, from +x toward +y, the spider's face at -90) and size per pair, left side; the right mirrors them.
PAIRS = [(-133, 1.06), (172, 1.0), (148, .96), (118, 1.0)]
HIP_Z = 3.96             # working: where the template's femur leaves the body


def ray_y(z, target_y):
    return target_y - (z - TARGET_Z) * TAN


def source(sc):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SRC)
    meshes = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
    if len(meshes) != 1:
        raise RuntimeError('Spider source mesh count changed')
    ob = meshes[0]; ob.name = 'walker_source'
    for o in list(sc.objects):
        if o != ob and o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    return ob


def face_data(ob):
    me = ob.data
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    M = np.array(ob.matrix_world); co = (co @ M[:3, :3].T + M[:3, 3]) * W
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    img = next(nd.image for nd in me.materials[0].node_tree.nodes if nd.type == 'TEX_IMAGE' and 'basecolor' in nd.image.name)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    uv = np.empty(len(me.loops) * 2, dtype=np.float32); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    ls = np.empty(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_start', ls)
    fuv = (uv[ls] + uv[ls + 1] + uv[ls + 2]) / 3
    rgb = px[np.clip((fuv[:, 1] % 1) * h, 0, h - 1).astype(int), np.clip((fuv[:, 0] % 1) * w, 0, w - 1).astype(int), :3]
    return co, fv, co[fv].mean(1), rgb, uv, ls, fuv


# ----------------------------------------------------------------------------- paint
# Display-space tones after the user's target sheet (references/cradle-walker-target*.png): weathered cream bone plates,
# dark red sinew, amber glow.
BONE = [(.34, .25, .17), (.70, .60, .45), (.93, .87, .74)]
SINEW = [(.10, .02, .02), (.30, .06, .04), (.55, .16, .09)]
AMBER = [(.32, .09, .02), (.86, .42, .08), (1.0, .72, .30)]
GLOW = (1.0, .55, .12)


def ramp(t, stops):
    t = np.clip(t, 0, 1)[:, None]
    a, b, c = (np.array(s, dtype=np.float32) for s in stops)
    return np.where(t < .5, a + (b - a) * (t / .5), b + (c - b) * ((t - .5) / .5))


def weights(rgb):
    """The spider's orange paint read as glow (saturated yellow-orange with little blue), bone (the light tan plates) and
    sinew (the darker brown flesh)."""
    r, g, b = rgb.T
    lum = .3 * r + .59 * g + .11 * b
    glow = np.clip((r - .8) * 8, 0, 1) * np.clip((g - .45) * 6, 0, 1) * np.clip((.42 - b / np.maximum(g, .02)) * 6, 0, 1)
    bone = np.clip((lum - .36) * 6, 0, 1) * (1 - glow)
    sinew = np.clip(1 - glow - bone, 0, 1)
    return lum, glow, bone, sinew


def regrade(rgb):
    lum, glow, bone, sinew = weights(rgb)
    out = bone[:, None] * ramp((lum - .34) / .5, BONE) + sinew[:, None] * ramp((lum - .08) / .45, SINEW) + glow[:, None] * ramp((lum - .4) / .5, AMBER)
    return np.clip(out, 0, 1), glow


def raster(tris, size):
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
        inside = (l1 >= -.1) & (l2 >= -.1) & (1 - l1 - l2 >= -.1)
        rows.append(ys.ravel()[inside]); cols.append(xs.ravel()[inside])
    return (np.concatenate(rows), np.concatenate(cols)) if rows else (np.zeros(0, int), np.zeros(0, int))


def material(ob, glow_tris, size=2048, normal_size=1024):
    """The spider's atlases at working size, regraded to the target palette; an emission map from its own glowing pores
    and over the faces in `glow_tris` (the brood chambers, painted with their veins)."""
    key = 'cradle_walker'
    mat = ob.data.materials[0].copy(); mat.name = key
    nt = mat.node_tree; bs = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    directory = os.path.join(br.ROOT, 'lookdev', 'boss-remodel', 'textures'); os.makedirs(directory, exist_ok=True)
    base = base_glow = None
    for node in [nd for nd in nt.nodes if nd.type == 'TEX_IMAGE']:
        nm = node.image.name
        kind = 'base' if 'basecolor' in nm else 'rm' if '_rm.' in nm else 'normal'
        s = normal_size if kind == 'normal' else size
        img = node.image.copy(); img.name = key + '_' + kind; img.scale(s, s)
        data = np.empty(s * s * 4, dtype=np.float32); img.pixels.foreach_get(data); rgba = data.reshape(-1, 4)
        if kind == 'rm':
            rgba[:, 1] = np.clip(rgba[:, 1], .38, .88)
            rgba[:, 2] = np.clip(rgba[:, 2] * .5, 0, .2)
        elif kind == 'base':
            painted, base_glow = regrade(rgba[:, :3].copy())
            # The brood chambers' own paint turns amber egg (the regrade reads their pale shells as bone).
            rows, cols = raster(glow_tris, s)
            lit = rows * s + cols
            l = rgba[lit, :3] @ np.array([.3, .59, .11], dtype=np.float32)
            painted[lit] = ramp((l - .25) / .55, AMBER)
            rgba[:, :3] = painted
        img.pixels.foreach_set(data)
        path = os.path.join(directory, key + '_' + kind + ('.png' if kind == 'normal' else '.jpg'))
        img.filepath_raw = path; img.file_format = 'PNG' if kind == 'normal' else 'JPEG'; img.save()
        saved = bpy.data.images.load(path, check_existing=False); saved.colorspace_settings.name = img.colorspace_settings.name; saved.pack(); node.image = saved
        if kind == 'base':
            base = saved
    rgba = np.ones((size * size, 4), dtype=np.float32)
    rgba[:, :3] = base_glow[:, None] * np.array(GLOW)
    rows, cols = raster(glow_tris, size)
    lit = rows * size + cols
    data = np.empty(size * size * 4, dtype=np.float32); base.pixels.foreach_get(data); rgb = data.reshape(-1, 4)[:, :3]
    lum = rgb[lit] @ np.array([.3, .59, .11], dtype=np.float32)
    lo, hi = np.percentile(lum, 20), np.percentile(lum, 98)
    rgba[lit, :3] = np.maximum(rgba[lit, :3], (.35 + .65 * np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1))[:, None] * np.array(GLOW))
    emit = bpy.data.images.new(key + '_emission', width=size, height=size, alpha=False)
    emit.colorspace_settings.name = 'Non-Color'; emit.pixels.foreach_set(rgba.ravel()); emit.pack()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = emit; tex.location = (-400, -600)
    nt.links.new(tex.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 2.0
    return mat


# ----------------------------------------------------------------------------- parts
def to_game(p, offset):
    return (np.asarray(p) * G) + np.asarray(offset)


def mesh_from(name, verts, faces, uvs, mat, sc, pivot=(0, 0, 0), smooth=True):
    """A mesh from game-space triangles (verts per face corner given by faces), with per-corner UVs."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v - np.asarray(pivot)) for v in verts], [], faces)
    me.update()
    layer = me.uv_layers.new(name='UVMap')
    layer.data.foreach_set('uv', np.asarray(uvs, dtype=np.float32).ravel())
    me.materials.append(mat)
    me.polygons.foreach_set('use_smooth', [smooth] * len(me.polygons))
    ob = bpy.data.objects.new(name, me); ob.location = pivot; sc.collection.objects.link(ob)
    return ob


def extract(src, idx, name, offset, pivot, ratio, scale_about=None, scale=1.0, mirror=False, xform=None):
    """lib_tripo.extract with the working-to-game placement, then optional scaling about a point, mirroring (x -> -x)
    and a further transform (a Matrix applied in game space)."""
    o = tripo.extract(src, idx, name, W * G, tuple(offset), (0, 0, 0), 1)
    me = o.data
    if scale_about is not None and scale != 1:
        c = Vector(scale_about)
        me.transform(Matrix.Translation(c) @ Matrix.Scale(scale, 4) @ Matrix.Translation(-c))
    if mirror:
        me.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        me.flip_normals()
    if xform is not None:
        me.transform(xform)
    me.transform(Matrix.Translation(-Vector(pivot))); o.location = pivot
    if ratio < 1:
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        mod = o.modifiers.new('reduce', 'DECIMATE'); mod.ratio = ratio; mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name); o.select_set(False)
    return o


def cap_holes(o, uv_patch):
    """Close a cut part's open ends (a fan per boundary loop), painted from a dark patch of the atlas."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    uvl = bm.loops.layers.uv.active
    edges = [e for e in bm.edges if e.is_boundary]
    res = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    new = res['faces']
    bmesh.ops.triangulate(bm, faces=new)
    for f in bm.faces:
        if f.select or any(l[uvl].uv.length == 0 for l in f.loops):
            pass
    for f in [f for f in bm.faces if f in set(new)] if new else []:
        for loop in f.loops:
            v = loop.vert.co
            loop[uvl].uv = (float(uv_patch[0]) + (v.x + v.y) * .002, float(uv_patch[1]) + v.z * .002)
    bm.to_mesh(o.data); bm.free()


def lathe(name, centre, profile, seg, mat, sc, uv_patch, inward=False, pivot=None):
    """A lathed solid round a vertical axis: profile [(dz, r)], r 0 an apex; UVs a small patch round uv_patch."""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    cx, cy, cz = centre
    rings = []
    for dz, r in profile:
        if r <= 0:
            rings.append([bm.verts.new((cx, cy, cz + dz))])
        else:
            rings.append([bm.verts.new((cx + r * math.cos(TAU * k / seg), cy + r * math.sin(TAU * k / seg), cz + dz)) for k in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for j in range(seg):
            if len(a) == 1:
                bm.faces.new((b[j], b[(j + 1) % seg], a[0]) if not inward else (a[0], b[(j + 1) % seg], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[j], a[(j + 1) % seg], b[0]) if not inward else (b[0], a[(j + 1) % seg], a[j]))
            else:
                q = (a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j])
                bm.faces.new(q if not inward else tuple(reversed(q)))
    if not inward:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert.co
            loop[uvl].uv = (float(uv_patch[0]) + (v.x - cx) * .006, float(uv_patch[1]) + (v.z - cz + v.y - cy) * .006)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    pivot = pivot or centre
    me.transform(Matrix.Translation(-Vector(pivot)))
    ob = bpy.data.objects.new(name, me); ob.location = pivot; sc.collection.objects.link(ob)
    return ob


def drone(sc, mat, uv_bone, uv_glow, uv_dark):
    """The hatchling drone (cradle_flight_pod), on its own origin: a bone carapace over a glowing abdomen, two scythe wings
    (the old CRADLE's hatchling, rebuilt in the walker's paint)."""
    parts = [lathe('d_abdomen', (0, .15, 0), [(-.12, 0), (-.08, .2), (.06, .24), (.14, 0)], 8, mat, sc, uv_glow),
             lathe('d_shell', (0, -.25, .04), [(-.1, 0), (-.05, .17), (.08, .19), (.15, 0)], 8, mat, sc, uv_bone)]
    for o in parts[:2]:
        o.data.transform(Matrix.Scale(1.5, 4, (0, 1, 0)))
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    for s in (-1, 1):
        a = [bm.verts.new(p) for p in [(s * .12, -.2, .05), (s * .12, .1, .05), (s * .12, .1, .09), (s * .12, -.2, .09)]]
        b = [bm.verts.new(p) for p in [(s * .62, .2, .14), (s * .62, .32, .14), (s * .62, .32, .16), (s * .62, .2, .16)]]
        for j in range(4):
            bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
        bm.faces.new(a); bm.faces.new(list(reversed(b)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert.co
            loop[uvl].uv = (float(uv_bone[0]) + v.x * .01, float(uv_bone[1]) + v.y * .01)
    me = bpy.data.meshes.new('d_wings'); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    wings = bpy.data.objects.new('d_wings', me); sc.collection.objects.link(wings)
    parts.append(wings)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    out = parts[0]; out.name = 'cradle_flight_pod'; out.data.name = 'cradle_flight_pod'
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = out; out.select_set(True)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS'); out.location = (0, 0, 0); out.select_set(False)
    return out


def chamber(name, centre, radius, dirs, uvs, mat, sc, out, wreck=False, seg=22, rings=14):
    """A brood chamber: a closed egg (a little long front to back, fuller outward), UVs projected from the sac's shell.
    The wreck is the same egg burst and sagging: squashed, dropped, its top caved in."""
    verts, faces = [], []
    for i in range(rings + 1):
        th = math.pi * i / rings
        for j in range(seg):
            ph = TAU * j / seg
            d = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
            k = 1.0 + .08 * max(0, d.x * out)
            p = Vector((d.x * radius * k, d.y * radius * 1.12, d.z * radius * .96))
            if wreck:
                p = Vector((p.x * 1.08, p.y * 1.08, p.z * .42 - radius * .45 - (.35 * radius if d.z > .4 else 0) * d.z))
            verts.append(p)
    for i in range(rings):
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    # Outward normals: the sphere's own winding faces inward with this ordering; flip it.
    me.flip_normals()
    ndirs = []
    for poly in me.polygons:
        for vi in poly.vertices:
            v = Vector(verts[vi]); v = Vector((v.x, v.y / 1.12, v.z)).normalized()
            ndirs.append(v)
    nd = np.array([tuple(v) for v in ndirs], dtype=np.float32)
    best = np.empty(len(nd), dtype=np.int64)
    D = dirs.astype(np.float32)
    for k in range(0, len(nd), 256):
        best[k:k + 256] = np.argmax(nd[k:k + 256] @ D.T, axis=1)
    corner_uv = np.asarray(uvs, dtype=np.float32)[best]
    # A face whose corners landed on different UV islands takes one corner's UV for all three.
    n = 0
    for poly in me.polygons:
        c = corner_uv[n:n + poly.loop_total]
        if np.ptp(c[:, 0]) > .04 or np.ptp(c[:, 1]) > .04:
            corner_uv[n:n + poly.loop_total] = c[0]
        n += poly.loop_total
    layer = me.uv_layers.new(name='UVMap'); layer.data.foreach_set('uv', corner_uv.ravel())
    me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me); ob.location = tuple(centre); sc.collection.objects.link(ob)
    return ob


def join_into(target, other):
    bpy.ops.object.select_all(action='DESELECT')
    other.select_set(True); target.select_set(True); bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    return target


def leg_frame(az_deg):
    a = math.radians(az_deg)
    return np.array([math.cos(a), math.sin(a)])


def fit_sphere(pts, guess, radius, rounds=6):
    """Least-squares sphere through the points near a guess, refined on the points close to the fitted surface."""
    c, r = np.asarray(guess, dtype=np.float64), radius
    sel = pts[np.linalg.norm(pts - c, axis=1) < radius * 1.3]
    for _ in range(rounds):
        A = np.hstack([2 * sel, np.ones((len(sel), 1))]); bvec = (sel ** 2).sum(1)
        sol, *_ = np.linalg.lstsq(A, bvec, rcond=None)
        c = sol[:3]; r = math.sqrt(max(sol[3] + c @ c, 1e-6))
        d = np.abs(np.linalg.norm(pts - c, axis=1) - r)
        sel = pts[(d < .06) & (np.linalg.norm(pts - c, axis=1) < r * 1.2)]
        if len(sel) < 50:
            break
    return c, r


def leg_transform(az_deg, size, mirror):
    """Template (working) -> this leg (working): turn about BODY c from the template's azimuth to this one, slide its hip
    to the body's edge, scale about the hip; a right leg is the left one mirrored."""
    a0 = math.atan2(LEG_DIR[1], LEG_DIR[0]); a = math.radians(az_deg)
    cx, cy = BODY['c']
    edge = 1 / math.sqrt((math.cos(a) / BODY['r'][0]) ** 2 + (math.sin(a) / BODY['r'][1]) ** 2)
    t_hip = LEG_JOINTS[0][0]
    hip = Vector((cx + math.cos(a) * edge * .97, cy + math.sin(a) * edge * .97, HIP_Z))
    turn = Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(a - a0, 4, 'Z') @ Matrix.Translation((-cx, -cy, 0))
    hip_template = turn @ Vector((cx + LEG_DIR[0] * t_hip, cy + LEG_DIR[1] * t_hip, HIP_Z))
    M = Matrix.Translation(hip) @ Matrix.Scale(size, 4) @ Matrix.Translation(-hip_template) @ turn
    if mirror:
        M = Matrix.Scale(-1, 4, (1, 0, 0)) @ M
    return M


def build(export=True, preview=True):
    sc = br.scene('Last Worlds — THE CRADLE walker')
    src = source(sc)
    co, fv, fc, rgb, uv, ls, fuv = face_data(src)
    lum, glow, bone, sinew = weights(rgb)
    c = np.array(BODY['c'])
    rel = fc[:, :2] - c
    inside = (rel[:, 0] / BODY['r'][0]) ** 2 + (rel[:, 1] / BODY['r'][1]) ** 2 < 1
    # The egg sacs, fitted as spheres on the spider's flanks (working).
    sacs = {side: fit_sphere(fc, (sgn * 1.5, -.26, 3.25), .58) for side, sgn in (('left', -1), ('right', 1))}
    print('sacs', {k: (v[0].round(3).tolist(), round(v[1], 3)) for k, v in sacs.items()})
    sac_c = (sacs['left'][0] * np.array([-1, 1, 1]) + sacs['right'][0]) / 2
    # Placement: the sacs' centres onto their targets' camera rays; working -> game is x G, then this offset.
    # Placement: the heart under the crest's middle on its target's camera ray (the crouched, smaller body sets the body by
    # its heart: at this scale the chambers' rays fall a body-length ahead of the heart's), the chambers on theirs.
    y_off = ray_y(HEART_AT[1] * G - DROP, HEART_S) - HEART_AT[0] * G
    offset = np.array([0, y_off, -DROP])
    # Only the sac's own shell (near the fitted sphere), not the body behind it.
    sac_mask = {side: np.abs(np.linalg.norm(fc - v[0], axis=1) - v[1]) < .12 for side, v in sacs.items()}
    sac_cut = {side: np.linalg.norm(fc - v[0], axis=1) < v[1] + .06 for side, v in sacs.items()}
    # The crest over the heart (the tall dorsal plate): the heart's armour, cut in two halves hinged on their outer edges.
    crest = inside & (np.abs(fc[:, 0]) < .62) & (fc[:, 1] > -1.15) & (fc[:, 1] < .05) & (fc[:, 2] > 4.25)
    heart_y, heart_z = HEART_AT
    print('offset y %.3f; heart working (0, %.3f, %.2f)' % (y_off, heart_y, heart_z))
    # Body masks (inside the flanks, not the sacs or the crest), split by height.
    body = inside & ~sac_cut['left'] & ~sac_cut['right'] & ~crest
    vents = body & (glow > .55)
    carapace = body & ~vents & (fc[:, 2] > 3.75)
    underside = body & ~vents & (fc[:, 2] < 2.25)
    flank = body & ~vents & ~carapace & ~underside
    # The template leg: its plane's slab beyond the hip, clear of the sac.
    d0, n0 = np.array(LEG_DIR), np.array([-LEG_DIR[1], LEG_DIR[0]])
    t, w = rel @ d0, rel @ n0
    tz = np.stack([t, fc[:, 2]], 1)
    template = (np.abs(w) < .5) & (t > LEG_JOINTS[0][0] - .05) & ~sac_cut['left'] & (fc[:, 0] < 0)
    J = np.array(LEG_JOINTS)
    dist = []
    for a, b in zip(J, J[1:]):
        ab = b - a; u = np.clip(((tz - a) @ ab) / (ab @ ab), 0, 1)
        dist.append(np.linalg.norm(tz - (a + u[:, None] * ab), axis=1))
    dist = np.stack(dist, 1); nearest = np.argmin(dist, 1)
    seg_masks = []
    for k in range(4):
        m = template & (nearest == k)
        for j in (k, k + 1):   # overlap round the joints, so a bent joint shows no gap
            if 0 < j < 4:
                m |= template & (np.linalg.norm(tz - J[j], axis=1) < .14) & ((nearest == j - 1) | (nearest == j))
        seg_masks.append(m)
    print('faces: body %d (vents %d carapace %d underside %d flank %d), crest %d, sacs %d/%d, template %s' % (
        body.sum(), vents.sum(), carapace.sum(), underside.sum(), flank.sum(), crest.sum(), sac_mask['left'].sum(), sac_mask['right'].sum(),
        [int(m.sum()) for m in seg_masks]))
    # Paint: the chambers glow from within.
    sac_faces = np.where(sac_mask['left'] | sac_mask['right'])[0]
    glow_tris = uv[(ls[sac_faces][:, None] + np.arange(3)[None, :])].reshape(-1, 3, 2)
    mat = material(src, glow_tris)
    # Paint patches (UV centroids) for the made parts: the brightest glow, a dark sinew, a light bone.
    pick = lambda score: fuv[int(np.argmax(score))]
    uv_glow = pick(np.where(glow > .8, lum, -1))
    uv_sac = pick(np.where(sac_mask['left'], lum, -1))
    uv_dark = pick(np.where(sinew > .9, -np.abs(lum - .18), -9))
    uv_bone = pick(np.where(bone > .9, -np.abs(lum - .7), -9))
    objects = []

    def part(name, mask, pivot=(0, 0, 0), ratio=.1, **kw):
        idx = np.where(mask)[0].tolist()
        o = extract(src, idx, name, offset, pivot, ratio, **kw)
        o.data.materials.clear(); o.data.materials.append(mat); objects.append(o)
        return o

    n_target = lambda mask, tris: min(1.0, tris / max(int(mask.sum()), 1))
    part('cradle_body', flank, ratio=n_target(flank, 10000))
    part('cradle_carapace', carapace, ratio=n_target(carapace, 11000))
    part('cradle_underside', underside, ratio=n_target(underside, 8000))
    part('cradle_vents', vents, ratio=n_target(vents, 2500))
    # Brood chambers: closed eggs round each sac (the spider modelled only their outer half), 1.3 times its size, each
    # corner taking the UV of the sac's own shell in its direction from the centre, so they wear the sac's veined paint.
    for side in ('left', 'right'):
        centre_w, r_w = sacs[side]
        # On its target's ray at its own height, out at the target's x (the smaller body leaves the sac nearer its middle).
        # Slung low on its flank, out at the target's x, on the target's ray at that height.
        cg = np.array([SAC_X if side == 'right' else -SAC_X, ray_y(CHAMBER_Z, SAC_S), CHAMBER_Z])
        loops = (ls[sac_mask[side]][:, None] + np.arange(3)[None, :]).ravel()
        lp = (co[fv[sac_mask[side]].ravel()] - centre_w)
        dirs = lp / np.maximum(np.linalg.norm(lp, axis=1, keepdims=True), 1e-6)
        out = 1 if side == 'right' else -1
        for name, sag in (('cradle_pod_' + side, None), ('cradle_pod_%s_wreck' % side, True)):
            objects.append(chamber(name, cg, r_w * G * 2.0, dirs, uv[loops], mat, sc, out, wreck=bool(sag)))
    # The heart: a glowing core on its camera ray, in a dark cavity under the crest.
    hc = Vector((0, heart_y * G + y_off, heart_z * G - DROP))
    heart = lathe('cradle_heart', tuple(hc), [(z * .95, r * .95) for z, r in [(-.62, 0), (-.52, .3), (-.38, .5), (-.15, .62), (.1, .62), (.32, .52), (.52, .34), (.66, .14), (.72, 0)]], 16, mat, sc, uv_sac)
    objects.append(heart)
    hw = heart.copy(); hw.data = heart.data.copy(); hw.name = 'cradle_heart_wreck'; sc.collection.objects.link(hw)
    hw.data.transform(Matrix.Diagonal((.85, .85, .55, 1))); objects.append(hw)
    cavity = lathe('cradle_heart_cavity', tuple(hc + Vector((0, 0, -.2))), [(z * .78, r * .78) for z, r in [(.7, 1.05), (.2, .95), (-.35, .7), (-.7, .3), (-.8, 0)]], 12, mat, sc, uv_dark, inward=True)
    cavity.data.transform(Matrix.Diagonal((1.0, 1.45, 1.0, 1)))
    objects.append(cavity)
    # A dark flesh core filling the body, so the cuts where its own legs and sacs came off never show through.
    bc = Vector((BODY['c'][0] * G, BODY['c'][1] * G + y_off, 3.0 * G - DROP))
    core = lathe('cradle_body_core', tuple(bc), [(-1.05, 0), (-.85, .55), (-.4, .85), (.2, .95), (.7, .78), (1.05, .45), (1.25, 0)], 14, mat, sc, uv_dark)
    core.data.transform(Matrix.Diagonal((BODY['r'][0] * G * 1.05, BODY['r'][1] * G * .95, G * 1.0, 1)))
    objects.append(core)
    # The crest halves: hinged on their lowest outer line, local -y outward (the view's +x swing tips the top outward).
    for k, sgn in enumerate((-1, 1)):
        mask = crest & (np.sign(fc[:, 0]) == sgn)
        pts = to_game(co[fv[mask].ravel()], offset)
        low = pts[pts[:, 2] < pts[:, 2].min() + .3].mean(0)
        hinge = (sgn * np.abs(pts[:, 0]).max() * .8, low[1], low[2])
        # Flattened to 0.7 of its height over its foot, so the crouched hive's top stays low.
        base = Vector((0, 0, float(pts[:, 2].min())))
        flat = Matrix.Translation(base) @ Matrix.Diagonal((1, 1, .7, 1)) @ Matrix.Translation(-base)
        o = part('cradle_heart_shutter_%d' % k, mask, hinge, n_target(mask, 1400), xform=flat)
        out = Vector((sgn, 0, 0))
        phi = math.atan2(out.x, -out.y)
        o.data.transform(Matrix.Rotation(-phi, 4, 'Z')); o.rotation_euler = (0, 0, phi)
    # Legs: the template's four segments, decimated once, then copied to every hip.
    templates = []
    for k, (name, m) in enumerate(zip(SEGMENTS, seg_masks)):
        o = tripo.extract(src, np.where(m)[0].tolist(), 'template_' + name, W, (0, 0, 0), (0, 0, 0), 1)
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        mod = o.modifiers.new('reduce', 'DECIMATE'); mod.ratio = n_target(m, (260, 1000, 950, 650)[k]); mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name); o.select_set(False)
        o.data.materials.clear(); o.data.materials.append(mat)
        cap_holes(o, uv_dark)
        templates.append(o)
    jw = [Vector((BODY['c'][0] + LEG_DIR[0] * tt, BODY['c'][1] + LEG_DIR[1] * tt, z)) for tt, z in LEG_JOINTS]
    legs = []
    for i in range(8):
        side = 0 if i < 4 else 1
        az, size = PAIRS[i % 4]
        M = leg_transform(az, size, side == 1)
        to_g = Matrix.Translation(Vector(offset)) @ Matrix.Scale(G, 4)
        joints = [to_g @ (M @ j) for j in jw]
        for k, name in enumerate(SEGMENTS):
            o = templates[k].copy(); o.data = templates[k].data.copy(); o.name = 'cradle_leg_%d_%s' % (i, name)
            sc.collection.objects.link(o)
            o.data.transform(to_g @ M)
            if side == 1:
                o.data.flip_normals()
            o.data.transform(Matrix.Translation(-joints[k])); o.location = joints[k]
            objects.append(o)
        foot = br.marker('cradle_leg_%d_foot' % i, tuple(joints[4]), sc)
        objects.append(foot)
        legs.append([tuple(round(c, 3) for c in j) for j in joints])
    for o in templates:
        bpy.data.objects.remove(o, do_unlink=True)
    objects.append(drone(sc, mat, uv_bone, uv_glow, uv_dark))
    bpy.data.objects.remove(src, do_unlink=True)
    total = br.triangles(objects)
    bpy.context.view_layer.update()
    top = max((o.matrix_world @ Vector(c)).z for o in objects if o.type == 'MESH' and not o.name.endswith('_wreck') and o.name != 'cradle_flight_pod' for c in o.bound_box)
    tops = {o.name: round(max((o.matrix_world @ Vector(c)).z for c in o.bound_box), 2) for o in objects if o.type == 'MESH' and not o.name.endswith('_wreck') and o.name != 'cradle_flight_pod'}
    print('top over the ground %.2f; tallest %s' % (top, sorted(tops.items(), key=lambda kv: -kv[1])[:6]))
    if top > TOP:
        raise RuntimeError('THE CRADLE stands too tall: %.2f over its ground' % top)
    print('triangles', total, {o.name: len(o.data.polygons) for o in objects if o.type == 'MESH' and not o.name.startswith('cradle_leg_')})
    print('legs', json.dumps(legs))
    if total > BUDGET:
        raise RuntimeError('THE CRADLE over its %d-triangle budget: %d' % (BUDGET, total))
    objects.append(br.marker('cradle_walker_v1', sc=sc, source_file=os.path.basename(SRC), target_height=TARGET_Z,
                             note='The user\'s spider GLB adapted into a walking brood hive; legs cut at their joints'))
    result = None
    if export:
        path = os.path.join(br.ROOT, 'public', 'assets', 'amnion', 'the-cradle.glb')
        result = br.export(path, objects, 'Last Worlds — THE CRADLE: the user-supplied spider GLB, adapted in Blender into a walking brood hive')
    if preview:
        os.makedirs(br.LOOKDEV, exist_ok=True)
        shown = [o for o in objects if o.type == 'MESH' and not o.name.endswith('_wreck') and o.name != 'cradle_flight_pod']
        for view in ('game', 'top', 'side', 'front', 'three_quarter'):
            br.render_view(sc, view, (0, .5, 3.6), 16, os.path.join(br.LOOKDEV, 'cradle-walker-%s.png' % view), res=1000, objects=shown, light='desert')
    return objects, result
