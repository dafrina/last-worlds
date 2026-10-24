"""THE ECLIPSE, the final boss, from the user's Tripo GLB (24 October 2026; "crescent winged spaceship 3d model.glb": "fix
the one missing peak of one wing tho somehow that got fucked"; "the boss should be very large tho like a final boss";
the Umbral ships "deep black shiney and smooth surfaced").

Adapted like THE CRADLE and HELION ARK (approved_cradle.py, approved_ark.py `build()`): the supplied mesh, UVs and painted
atlases are kept and reduced; nothing of the shape is regenerated. Headless (the live Blender stays with the integrator):

    R=/home/davidfarina/Projects/alien-skies
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/approved_eclipse.py)" -- \\
        --out "$(wslpath -w $R/public/assets/umbra/the-eclipse-v1-approved.glb)" --preview-dir "$(wslpath -w $R/lookdev/umbra/eclipse)"

(`--no-previews` skips the renders.) About 90 s; deterministic. Writes the GLB, previews, working textures
(`<preview-dir>/textures`) and `<preview-dir>/eclipse-report.json` (placement, parts, hinges, triangle counts, checks).

Source: art/source/approved-bosses/eclipse-tripo-original.glb (one closed piece, 1,908,258 triangles, 4K atlases, no loose
concept-sheet pieces). It stands upright in the GLB (its front view is the concept's top view), so it is laid flat:
source (x, y, z) -> game (x, z, -y) * 20.4 (0.98 wide -> 20 units horn to horn; 6.7 thick, kept uniform), horns away
from the player, the reactor face up, the plain back underneath. Origin: x 0 on the symmetry axis, y 0 at the reactor's
centre, the glowing ring's plane at z 2.

Steps:
1. Weld the glTF's UV-seam duplicates (UVs stay per corner): one closed surface.
2. The wing fix: the left horn (x < 0) is cut off flat at source z 0.472 while the right one curves up to its point at
   0.622. Below 0.38 both horns are mirror images (cross-sections agree within 0.0015 on average), so the left horn is
   bisected at z = HORN_CUT and everything above replaced by the right horn's top mirrored across x = 0 (winding flipped,
   UVs kept, so it carries the right horn's paint). The two cut loops are stitched into one surface (zip_seam); below the
   seam, down to HORN_BAND, the left horn eases onto the mirror image of the right one, and the stitch is relaxed, so
   the surface carries on without a crease or step.
3. Straight radial cuts (bisects) round the reactor at the collar sectors' ends; the surface is checked to be closed.
4. Parts, by position (classify): the reactor (eclipse_heart: the dished lens and its glowing ring, r < 1.22); six
   sectors of the raised collar round it (eclipse_heart_shutter_0..5, r 1.22-1.95, clear of the far spike's foot and
   of the near spike cluster with the eyelid hooks); the two almond energy vents in the front of the inner wings
   (eclipse_pod_left/right, outlined in the game camera's view); everything else is eclipse_hull.
5. Taubin smoothing of the full-resolution surface (its carved micro-cracks would turn into notched highlights on the
   glossy black once reduced), then one reduction of the whole surface (parts as material slots, their seams pinned):
   first only the region the 55-degree camera never sees, then everything evenly to the 80k budget. The parts are split
   apart afterwards, so they meet the hull exactly; shading is transferred from the full-resolution surface.
6. Each collar shutter is closed underneath by its own surface lowered onto a smooth membrane, and the hull gets that
   membrane as the seat it leaves (collar_seat, underside): no cracks, no caps poking through. Hinged on its outer foot,
   local x along the hinge, local -y outward (approved_cradle.py's convention): a positive turn about local +x rolls it
   outward over that foot, its inner edge lifting off the reactor (the view sets the angle; previews use 50 degrees).
7. One material: the supplied atlases at 2K (base, roughness/metal as JPEG, normal 1K PNG), roughness 0.34-0.86, and an
   emission mask (sRGB, as glTF reads it): the thin bright violet seams and the reactor ring (brightness above its own
   surroundings on dark armour, so the broad blue gradients stay paint), the reactor's lens glowing softly, the vents
   glowing violet along their middle. Wrecks: crumpled copies (rims kept) with a non-emissive copy of the material.
"""
import bpy, bmesh, os, sys, math, json, time
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, 'art', 'source', 'approved-bosses', 'eclipse-tripo-original.glb')
SCALE = 20.4            # source width 0.98 -> 20 units horn to horn (the world is 24 wide)
HORN_CUT = .38          # source z of the wing-fix seam (horns agree there; the left one is cut off at 0.472)
HORN_BAND = .32         # below the seam, down to here, the left horn eases onto the mirrored right one
BUDGET = 80000
LABEL = 'v1-approved'


def log(*a):
    print('[eclipse]', *a, flush=True)


def plain(o):
    """json.dumps default for numpy and mathutils values."""
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    try:
        return [float(x) for x in o]
    except TypeError:
        return str(o)


# ----------------------------------------------------------------------------- source arrays
def load_source():
    """Import the GLB (never modified) and return its single mesh object."""
    sc = bpy.context.scene
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SRC)
    added = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in added if o.type == 'MESH']
    if len(meshes) != 1 or len(meshes[0].data.polygons) != 1908258:
        raise RuntimeError('Eclipse source changed: %s' % [(o.name, len(o.data.polygons)) for o in meshes])
    ob = meshes[0]
    ob.name = 'eclipse_source'
    return ob


def arrays(me):
    """Vertex positions, triangle vertex ids and per-corner UVs of a triangle mesh."""
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    uv = np.empty(len(me.loops) * 2, dtype=np.float32); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 3, 2)
    return co, fv, uv


def weld(co, fv):
    """Merge exactly coincident vertices (glTF splits them at UV seams)."""
    uniq, inv = np.unique(co, axis=0, return_inverse=True)
    return uniq, inv.ravel()[fv]


def build_mesh(name, co, fv, uv, mats=None):
    """A Blender mesh from positions, triangles and per-corner UVs (vectorized)."""
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co)); me.vertices.foreach_set('co', np.asarray(co, dtype=np.float32).ravel())
    nf = len(fv)
    me.loops.add(nf * 3); me.loops.foreach_set('vertex_index', np.asarray(fv, dtype=np.int32).ravel())
    me.polygons.add(nf); me.polygons.foreach_set('loop_start', np.arange(0, nf * 3, 3, dtype=np.int32))
    lay = me.uv_layers.new(name='UVMap'); lay.data.foreach_set('uv', np.asarray(uv, dtype=np.float32).ravel())
    me.update(calc_edges=True)
    for m in mats or []:
        me.materials.append(m)
    return me


def bm_arrays(bm):
    """(co, tri vertex ids, corner UVs) of a triangulated bmesh."""
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.verts.index_update(); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active
    co = np.array([v.co[:] for v in bm.verts], dtype=np.float64).reshape(-1, 3)
    fv = np.array([[l.vert.index for l in f.loops] for f in bm.faces], dtype=np.int64).reshape(-1, 3)
    uv = np.array([[l[uvl].uv[:] for l in f.loops] for f in bm.faces], dtype=np.float32).reshape(-1, 3, 2)
    return co, fv, uv


def bm_from(co, fv, uv):
    me = build_mesh('_tmp', co, fv, uv)
    bm = bmesh.new(); bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return bm


# ----------------------------------------------------------------------------- the wing fix
def fix_horn(co, fv, uv, cut=HORN_CUT, band=HORN_BAND, report=None):
    """Replace the truncated left horn above `cut` by the mirrored top of the right horn (source coordinates, welded
    arrays). Returns new (co, fv, uv)."""
    P = co[fv]
    cx = P[:, :, 0].mean(1)
    zmax = P[:, :, 2].max(1)
    left = np.where((cx < -.25) & (zmax > cut - .01))[0]
    right = np.where((cx > .25) & (zmax > cut - .01))[0]

    # Left: bisect at the cut and drop everything above.
    bmL = bm_from(*compact(co, fv[left], uv[left]))
    res = bmesh.ops.bisect_plane(bmL, geom=list(bmL.verts) + list(bmL.edges) + list(bmL.faces), dist=1e-9,
                                 plane_co=(0, 0, cut), plane_no=(0, 0, 1))
    bmesh.ops.delete(bmL, geom=[f for f in bmL.faces if f.calc_center_median().z > cut], context='FACES')
    # Right: the same cut, keep the top, mirror it across x = 0.
    bmR = bm_from(*compact(co, fv[right], uv[right]))
    bmesh.ops.bisect_plane(bmR, geom=list(bmR.verts) + list(bmR.edges) + list(bmR.faces), dist=1e-9,
                           plane_co=(0, 0, cut), plane_no=(0, 0, 1))
    bmesh.ops.delete(bmR, geom=[f for f in bmR.faces if f.calc_center_median().z < cut], context='FACES')
    bmesh.ops.delete(bmR, geom=[v for v in bmR.verts if not v.link_faces], context='VERTS')
    for v in bmR.verts:
        v.co.x = -v.co.x
    bmesh.ops.reverse_faces(bmR, faces=list(bmR.faces))
    # One bmesh: left remainder + mirrored top.
    me = bpy.data.meshes.new('_horn_top'); bmR.to_mesh(me); bmR.free()
    nL = len(bmL.verts)
    bmL.from_mesh(me); bpy.data.meshes.remove(me)
    bmL.verts.ensure_lookup_table(); bmL.edges.ensure_lookup_table()
    nco, nfv, nuv = bm_arrays(bmL); bmL.free()
    nco, nfv, nuv, info = zip_seam(nco, nfv, nuv, nL, cut)
    info['cut'] = cut
    keep = np.ones(len(fv), dtype=bool); keep[left] = False
    co2 = np.concatenate([co, nco]); fv2 = np.concatenate([fv[keep], nfv + len(co)]); uv2 = np.concatenate([uv[keep], nuv])
    co3, fv3 = weld(co2, fv2)
    used = np.unique(fv3)
    remap = np.full(len(co3), -1); remap[used] = np.arange(len(used))
    info['faces_before'] = int(len(fv)); info['faces_after'] = int(len(fv3)); info['replaced_left_faces'] = int(len(left))
    # Blend band: below the seam the left horn eases onto the mirror image of the right one (fully at the seam), so the
    # surface carries on without a crease where the mended top begins.
    from mathutils.bvhtree import BVHTree
    rf = np.where((cx > .25) & (zmax > band - .03) & (P[:, :, 2].min(1) < cut + .03))[0]
    used_r = np.unique(fv[rf]); rmap = np.full(len(co), -1); rmap[used_r] = np.arange(len(used_r))
    mirror = co[used_r] * np.array([-1, 1, 1])
    tree = BVHTree.FromPolygons(mirror.tolist(), rmap[fv[rf]].tolist(), all_triangles=True)
    out = co3[used].copy()
    zz = out[:, 2]
    sel = np.where((out[:, 0] < -.25) & (zz > band) & (zz <= cut + 1e-6))[0]
    moved = []
    for i in sel:
        hit = tree.find_nearest(Vector(out[i]))
        if hit[0] is None:
            continue
        t = min(1.0, (zz[i] - band) / (cut - band)); w = t * t * (3 - 2 * t)
        d = np.array(hit[0][:]) - out[i]
        if np.linalg.norm(d) > .008:      # another sheet of the surface, not this point's mirror image
            continue
        moved.append(np.linalg.norm(d))
        out[i] += w * d
    # Relax the stitch itself (a few millimetres either side of the seam), so no fold is left where the two loops met.
    fv_out = remap[fv3]
    near = (np.abs(out[:, 2] - cut) < .01) & (out[:, 0] < -.25)
    e = np.unique(np.sort(np.concatenate([fv_out[:, [0, 1]], fv_out[:, [1, 2]], fv_out[:, [2, 0]]]), 1), axis=0)
    e = e[near[e[:, 0]] | near[e[:, 1]]]
    a = np.concatenate([e[:, 0], e[:, 1]]); b = np.concatenate([e[:, 1], e[:, 0]])
    deg = np.maximum(np.bincount(a, minlength=len(out)), 1)[:, None]
    for _ in range(40):
        for f in (.5, -.53):
            acc = np.stack([np.bincount(a, weights=out[b, k], minlength=len(out)) for k in range(3)], 1)
            out[near] += f * (acc[near] / deg[near] - out[near])
    info['seam_relaxed_vertices'] = int(near.sum())
    info['blend_band'] = [band, cut]; info['blend_vertices'] = len(moved)
    info['blend_offset_mean'] = float(np.mean(moved)) if moved else 0.0; info['blend_offset_max'] = float(np.max(moved)) if moved else 0.0
    log('wing fix', json.dumps(info, default=plain))
    if report is not None:
        report.update(info)
    return out, remap[fv3], uv2


def zip_seam(co, fv, uv, n_left, cut):
    """Close the wing-fix seam: the left horn's cut loop and the mirrored top's cut loop lie in the same plane, a hair
    apart (they are mirror images). Order both along the left loop's direction and stitch them with a strip of
    triangles (a zipper that always advances along the loop whose next vertex is closer), so the surface is one
    piece; the strip takes the left horn's paint."""
    e = np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]], fv[:, [2, 0]]])
    face_z = np.tile(co[fv][:, :, 2].mean(1), 3)
    k = np.sort(e, 1)
    _, inv, cnt = np.unique(k, axis=0, return_inverse=True, return_counts=True)
    is_open = cnt[inv.ravel()] == 1
    on = (np.abs(co[e[:, 0], 2] - cut) < 1e-6) & (np.abs(co[e[:, 1], 2] - cut) < 1e-6) & is_open
    below = on & (face_z < cut)                          # the left horn's cut loop
    above = on & (face_z > cut)                          # the mirrored top's

    def order(edges):
        """The longest closed chain of directed edges (stray bits of the cut are left as they are)."""
        nxt = {}
        for a, b in edges:
            nxt.setdefault(int(a), int(b))
        seen, best = set(), []
        for start in nxt:
            if start in seen:
                continue
            loop, cur = [], start
            while cur in nxt and cur not in seen:
                seen.add(cur); loop.append(cur); cur = nxt[cur]
            if cur == start and len(loop) > len(best):
                best = loop
        return best, len(nxt)
    A, na = order(e[below])                             # left horn: its faces' winding direction
    B, nb = order(e[above])                             # mirrored top
    B = B[::-1]                                         # reversed into the same direction
    log('seam loops: left %d of %d open edges, mirrored %d of %d' % (len(A), na, len(B), nb))

    def area(loop):
        p = co[loop][:, :2]
        return float(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1]))
    if (area(A) > 0) != (area(B) > 0):
        raise RuntimeError('wing fix: seam loops run in opposite directions')
    pa, pb = co[A], co[B]
    j0 = int(np.argmin(np.linalg.norm(pb - pa[0], axis=1)))
    B = B[j0:] + B[:j0]; pb = co[B]
    n, m = len(A), len(B)
    i = j = 0
    tris, kinds = [], []
    while i < n or j < m:
        a0, a1 = A[i % n], A[(i + 1) % n]
        b0, b1 = B[j % m], B[(j + 1) % m]
        if j >= m or (i < n and np.linalg.norm(co[a1] - co[b0]) <= np.linalg.norm(co[b1] - co[a0])):
            tris.append((a1, a0, b0)); kinds.append('a'); i += 1
        else:
            tris.append((b0, b1, a0)); kinds.append('b'); j += 1
    tris = np.array(tris, dtype=np.int64)
    aset = np.array(A)
    left_corner = {}
    for f, t in zip(fv, uv):
        if co[f][:, 2].mean() < cut:
            for c in range(3):
                left_corner.setdefault(int(f[c]), t[c])

    def left_uv(v):
        if v in left_corner:
            return left_corner[v]
        near = aset[np.argmin(np.linalg.norm(co[aset] - co[v], axis=1))]
        return left_corner[int(near)]
    # One UV per strip triangle (a left horn corner): a hair-wide sliver must not stretch across atlas islands.
    tuv = np.array([[left_uv(int(t[1] if k == 'a' else t[2]))] * 3 for t, k in zip(tris, kinds)], dtype=np.float32)
    gaps = np.array([np.linalg.norm(co[B] - co[A][np.argmin(np.linalg.norm(co[A][:, None] - co[B][None], axis=2), axis=0)], axis=1)]).ravel()
    info = dict(loop_left=n, loop_mirrored=m, strip_triangles=len(tris), gap_mean=float(gaps.mean()), gap_max=float(gaps.max()))
    return co, np.concatenate([fv, tris]), np.concatenate([uv, tuv]), info


def compact(co, fv, uv):
    used, inv = np.unique(fv, return_inverse=True)
    return co[used], inv.reshape(fv.shape), uv


def taubin(co, fv, iterations, lam=.5, mu=-.53):
    """Taubin smoothing (shrink-free): washes the sculpt's carved micro-grooves and cracks out of the surface before
    reduction (at ~3% they would turn into notched, dashed highlights on the glossy black); silhouettes, plates and
    blade edges keep their shape. The painted seams and the normal map keep the panel lines."""
    if iterations <= 0:
        return co
    e = np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]], fv[:, [2, 0]]])
    e = np.unique(np.sort(e, 1), axis=0)
    a = np.concatenate([e[:, 0], e[:, 1]]); b = np.concatenate([e[:, 1], e[:, 0]])
    deg = np.bincount(a, minlength=len(co)).astype(np.float64)[:, None]
    deg[deg == 0] = 1
    x = co.copy()
    for _ in range(iterations):
        for f in (lam, mu):
            acc = np.zeros_like(x)
            for k in range(3):
                acc[:, k] = np.bincount(a, weights=x[b, k], minlength=len(x))
            x = x + f * (acc / deg - x)
    return x


# ----------------------------------------------------------------------------- placement and parts
S55, C55 = math.sin(math.radians(55)), math.cos(math.radians(55))
TO_EYE = np.array([0.0, -C55, S55])       # the game camera looks along +y, 55 degrees down
R_HEART = 1.22                             # reactor: the dished lens and its glowing ring (ring at r 1.1-1.2)
R_COLLAR = 1.95                            # the raised collar round it (top at r ~1.6), up to the trough
COLLAR_TOP = .65                           # faces higher than this over the ring belong to spikes and hooks
# Six collar sectors (degrees from +x, counterclockwise in plan), clear of the far spike's foot (62-118) and of the near
# spike cluster with the eyelid hooks that overhang the collar (210-330).
SECTORS = [(-30, 2 / 3), (2 / 3, 31 + 1 / 3), (31 + 1 / 3, 62), (118, 148 + 2 / 3), (148 + 2 / 3, 179 + 1 / 3), (179 + 1 / 3, 210)]
SMOOTH = 30             # Taubin iterations on the full-resolution surface before reduction
# The almond vents in the front of the inner wings, outlined in the game camera's view (u = x, v = y sin55 + z cos55,
# unplaced coordinates) as lower (groove) and upper (lip) edges from the inner point outward; the right one is mirrored.
VENT_LOWER = [(-2.88, 3.17), (-3.25, 3.28), (-4.0, 3.45), (-5.0, 3.71), (-6.0, 4.01), (-7.0, 4.37), (-7.6, 4.62)]
VENT_UPPER = [(-2.88, 3.17), (-3.25, 3.76), (-3.63, 4.10), (-4.0, 4.48), (-4.38, 4.67), (-5.0, 4.80), (-6.0, 4.86), (-7.0, 4.9), (-7.6, 4.8)]


def straight_cuts(co, fv, uv, centre, angles, r0=.9, r1=2.4):
    """Bisect the surface round the reactor along vertical planes through its axis at the sector boundaries, so the
    collar shutters get straight cut ends instead of the triangles' zigzag (unplaced game coordinates)."""
    P = co[fv]
    fc = P.mean(1)
    r = np.hypot(fc[:, 0] - centre[0], fc[:, 1] - centre[1])
    region = np.where((r > r0 - .15) & (r < r1 + .15))[0]     # a margin ring that is not cut keeps the rim intact
    bm = bm_from(*compact(co, fv[region], uv[region]))
    for a in sorted(set(angles)):
        t = math.radians(a)
        core = [f for f in bm.faces if r0 < math.hypot(*(f.calc_center_median().xy - Vector(centre))) < r1]
        edges = {e for f in core for e in f.edges}
        bmesh.ops.bisect_plane(bm, geom=list(edges) + core, dist=1e-7,
                               plane_co=(centre[0], centre[1], 0), plane_no=(-math.sin(t), math.cos(t), 0))
    nco, nfv, nuv = bm_arrays(bm); bm.free()
    keep = np.ones(len(fv), dtype=bool); keep[region] = False
    co2 = np.concatenate([co, nco]); fv2 = np.concatenate([fv[keep], nfv + len(co)]); uv2 = np.concatenate([uv[keep], nuv])
    co3, fv3 = weld(co2, fv2)
    used = np.unique(fv3)
    remap = np.full(len(co3), -1); remap[used] = np.arange(len(used))
    return co3[used], remap[fv3], uv2


def open_edge_count(fv):
    e = np.sort(np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]], fv[:, [2, 0]]]), 1)
    _, cnt = np.unique(e, axis=0, return_counts=True)
    return int((cnt == 1).sum())


def open_edges(objects):
    """Edges (by world position) that no other face of `objects` runs back along: holes and cracks. Works across
    separate objects and coincident pieces (no welding)."""
    keys = []
    for ob in objects:
        co, fv = mesh_arrays(ob.data)
        M = np.array(ob.matrix_world)
        w = np.round(co @ M[:3, :3].T + M[:3, 3], 4)
        keys.append(w[fv])
    tri = np.concatenate(keys)
    _, vid = np.unique(tri.reshape(-1, 3), axis=0, return_inverse=True)
    F = vid.ravel().reshape(-1, 3)
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    e = e[e[:, 0] != e[:, 1]]
    fwd = set(map(tuple, e.tolist()))
    return int(sum(1 for a, b in fwd if (b, a) not in fwd))


def to_game(co):
    """Source -> game axes and scale (unplaced): laid flat, horns away, reactor up."""
    return np.c_[co[:, 0], co[:, 2], -co[:, 1]] * SCALE


def base_pixels(mat):
    img = next(nd.image for nd in mat.node_tree.nodes if nd.type == 'TEX_IMAGE' and 'basecolor' in nd.image.name)
    W, H = img.size
    px = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(px)
    return px.reshape(H, W, 4)[:, :, :3]


def sample(px, uvs):
    H, W = px.shape[:2]
    return px[np.clip((uvs[:, 1] % 1) * H, 0, H - 1).astype(int), np.clip((uvs[:, 0] % 1) * W, 0, W - 1).astype(int)]


def reactor(fc, fn, rgb):
    """Centre (plan) of the reactor's dished lens (a paraboloid fitted to its upward faces) and the height of the
    glowing ring round it, unplaced game coordinates."""
    cx, cy = 0.0, 3.9
    for _ in range(3):
        r = np.hypot(fc[:, 0] - cx, fc[:, 1] - cy)
        dish = (r < .85) & (fc[:, 2] < 1.75) & (fn[:, 2] > .8)
        x, y, h = fc[dish, 0], fc[dish, 1], fc[dish, 2]
        A = np.c_[np.ones(len(x)), x, y, x * x + y * y]
        a, b, c, d = np.linalg.lstsq(A, h, rcond=None)[0]
        cx, cy = -b / (2 * d), -c / (2 * d)
    V = rgb.max(1)
    r = np.hypot(fc[:, 0] - cx, fc[:, 1] - cy)
    ring = (r > .95) & (r < 1.3) & (fc[:, 2] > 1.5) & (fc[:, 2] < 2.2) & (V > .8) & (rgb[:, 2] > rgb[:, 0])
    return dict(cx=float(cx), cy=float(cy), dish_faces=int(dish.sum()), dish_low=float(a - (b * b + c * c) / (4 * d)),
                radius=float(np.median(r[ring])), height=float(np.median(fc[ring, 2])), ring_faces=int(ring.sum()))


def inside(poly, u, v):
    """Point-in-polygon (even-odd) for arrays u, v."""
    res = np.zeros(len(u), dtype=bool)
    n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        cross = ((y1 > v) != (y2 > v))
        with np.errstate(divide='ignore', invalid='ignore'):
            xi = x1 + (v - y1) * (x2 - x1) / (y2 - y1)
        res ^= cross & (u < xi)
    return res


def largest_component(fv, idx):
    """The faces of idx (indices into fv) in the largest edge-connected piece."""
    if len(idx) == 0:
        return idx
    sub = fv[idx]
    e = np.concatenate([np.sort(sub[:, [0, 1]], 1), np.sort(sub[:, [1, 2]], 1), np.sort(sub[:, [2, 0]], 1)])
    owner = np.tile(np.arange(len(idx)), 3)
    key = e[:, 0] * (fv.max() + 1) + e[:, 1]
    order = np.argsort(key); key, owner = key[order], owner[order]
    same = key[1:] == key[:-1]
    a, b = owner[:-1][same], owner[1:][same]
    lab = np.arange(len(idx))
    for _ in range(2000):
        m = np.minimum(lab[a], lab[b])
        new = lab.copy(); np.minimum.at(new, a, m); np.minimum.at(new, b, m)
        new = new[new]
        if np.array_equal(new, lab):
            break
        lab = new
    u, c = np.unique(lab, return_counts=True)
    return idx[lab == u[np.argmax(c)]]


def classify(g, fv, rgb, info):
    """Part labels per face (unplaced game coordinates): 0 hull, 1 heart, 10+k shutter k, 20/21 left/right vent."""
    from mathutils.bvhtree import BVHTree
    fc = g[fv].mean(1)
    n = np.cross(g[fv[:, 1]] - g[fv[:, 0]], g[fv[:, 2]] - g[fv[:, 0]])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-20
    cx, cy, h0 = info['cx'], info['cy'], info['height']
    dx, dy = fc[:, 0] - cx, fc[:, 1] - cy
    r = np.hypot(dx, dy); az = np.degrees(np.arctan2(dy, dx))
    lab = np.zeros(len(fv), dtype=np.int16)
    heart = np.where((r < R_HEART) & (fc[:, 2] < h0 + .35))[0]
    lab[largest_component(fv, heart)] = 1
    for k, (a0, a1) in enumerate(SECTORS):
        m = np.where((r >= R_HEART) & (r < R_COLLAR) & ((az - a0) % 360 < a1 - a0) & (fc[:, 2] < h0 + COLLAR_TOP) & (lab == 0))[0]
        lab[largest_component(fv, m)] = 10 + k
    # Vents: inside the outline in the camera's view, facing it and not hidden behind other hull.
    u = fc[:, 0]; v = fc[:, 1] * S55 + fc[:, 2] * C55
    facing = n @ TO_EYE > .15
    tree = None
    for side, sign in ((20, 1), (21, -1)):
        poly = [(sign * a, b) for a, b in VENT_LOWER] + [(sign * a, b) for a, b in VENT_UPPER[::-1]]
        cand = np.where(facing & inside(poly, u, v) & (lab == 0))[0]
        if tree is None:
            tree = BVHTree.FromPolygons(g.tolist(), fv.tolist(), all_triangles=True)
        seen = []
        for i in cand:
            hit = tree.ray_cast(Vector(fc[i] + TO_EYE * 1e-3), Vector(TO_EYE), 60)
            seen.append(hit[0] is None)
        cand = cand[np.array(seen, dtype=bool)] if len(cand) else cand
        lab[largest_component(fv, cand)] = side
    return lab


# ----------------------------------------------------------------------------- objects
def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def part_object(name, co, fv, uv, faces, mats):
    c, f, u = compact(co, fv[faces], uv[faces])
    me = build_mesh(name, c, f, u, mats)
    me.shade_smooth()
    return link(bpy.data.objects.new(name, me))


def apply_modifier(ob, mod):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.select_set(False)


def boundary_vertices(me):
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    e = np.concatenate([np.sort(fv[:, [0, 1]], 1), np.sort(fv[:, [1, 2]], 1), np.sort(fv[:, [2, 0]], 1)])
    u, c = np.unique(e, axis=0, return_counts=True)
    return np.unique(u[c == 1].ravel())


def face_labels(me):
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    mi = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get('material_index', mi)
    return fv, mi


def seam_vertices(me):
    """Vertices shared by faces of different parts (material slots)."""
    fv, mi = face_labels(me)
    lo = np.full(len(me.vertices), 1 << 20); hi = np.full(len(me.vertices), -1)
    np.minimum.at(lo, fv.ravel(), np.repeat(mi, 3)); np.maximum.at(hi, fv.ravel(), np.repeat(mi, 3))
    return lo != hi


def decimate_weighted(ob, ratio, weights):
    vg = ob.vertex_groups.new(name='reduce')
    q = np.round(weights, 2)
    for w in np.unique(q):
        vg.add(np.where(q == w)[0].tolist(), float(w), 'REPLACE')
    mod = ob.modifiers.new('Approved source reduction', 'DECIMATE')
    mod.ratio = ratio; mod.use_collapse_triangulate = True; mod.vertex_group = 'reduce'
    apply_modifier(ob, mod)
    ob.vertex_groups.remove(ob.vertex_groups['reduce'])


def reduce_whole(ob, labels, names, hidden_keep=.25, margin=1200):
    """Two passes over the whole surface: first only the region the 55-degree camera never sees (the underside and
    rear walls) gives up most of its faces; then everything is reduced evenly to the triangle budget (the wrecks, the
    shutters' undersides and the seats they leave counted in), the seams between parts pinned throughout."""
    me = ob.data
    hidden = hidden_vertices(ob)
    free = hidden & ~seam_vertices(me)
    fv, mi = face_labels(me)
    hidden_faces = int(free[fv].all(1).sum())
    first = (len(fv) - hidden_faces * (1 - hidden_keep)) / len(fv)
    decimate_weighted(ob, first, free.astype(np.float64))

    def exported():
        """Triangles the export will hold: everything, plus the wreck copies, plus each shutter's underside and seat."""
        fv, mi = face_labels(ob.data)
        count = lambda nm: int((mi == labels.index(next(k for k, v in names.items() if v == nm))).sum())
        shutters = sum(count('eclipse_heart_shutter_%d' % k) for k in range(len(SECTORS)))
        wrecks = count('eclipse_heart') + count('eclipse_pod_left') + count('eclipse_pod_right')
        return len(fv) + wrecks + 2 * shutters
    ratios = []
    while exported() > BUDGET - margin:
        ratio = min(.97, (BUDGET - margin) / exported() * (1 if ratios else 1.0))
        ratios.append(round(ratio, 4))
        decimate_weighted(ob, ratio, np.where(seam_vertices(ob.data), 0.0, 1.0))
    log('reduction: first pass %.3f (hidden faces %d), then %s -> %d faces, %d with wrecks and shutter undersides' % (
        first, hidden_faces, ratios, len(ob.data.polygons), exported()))
    return 1 - float(hidden.mean())


def split_part(ob, slot, name, mats):
    """The faces of one material slot as their own object (positions, UVs)."""
    me = ob.data
    fv, mi = face_labels(me)
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    ls = np.empty(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_start', ls)
    if not np.array_equal(ls, np.arange(len(ls)) * 3):
        raise RuntimeError('split_part expects triangles with loops in face order')
    uv = np.empty(len(me.loops) * 2, dtype=np.float32); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 3, 2)
    return part_object(name, co, fv, uv, mi == slot, mats)


def transfer_normals(ob, hires):
    """Shading from the full-resolution surface (nearest corner with the best-matching face normal), so the reduced
    parts shade like the supplied sculpt and neighbouring parts shade continuously across their seams."""
    mod = ob.modifiers.new('Source normals', 'DATA_TRANSFER')
    mod.object = hires
    mod.use_loop_data = True
    mod.data_types_loops = {'CUSTOM_NORMAL'}
    mod.loop_mapping = 'NEAREST_POLYNOR'
    apply_modifier(ob, mod)


def join(target, others):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in others:
        o.select_set(True)
    target.select_set(True); bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target.select_set(False)
    return target


def set_pivot(ob, pivot, phi=None):
    """Move the object's origin to `pivot` (mesh unchanged in world space); optionally turn its local frame by phi
    about z (local -y then points along the hinge's outward direction)."""
    ob.data.transform(Matrix.Translation(-Vector(pivot)))
    ob.location = pivot
    if phi is not None:
        ob.data.transform(Matrix.Rotation(-phi, 4, 'Z'))
        ob.rotation_euler = (0, 0, phi)


def tris(objects):
    total = 0
    for o in objects:
        if o.type == 'MESH':
            o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
    return total


def wreck_copy(ob, mat, sag=.0, jitter=.05, seed=1):
    """A dark, broken copy: its own non-emissive material, the inside crumpled (seeded jitter, sagging towards the
    middle by `sag`); the rim stays where it is, so it still meets the hull."""
    w = ob.copy(); w.data = ob.data.copy(); w.name = ob.name + '_wreck'
    me = w.data
    me.materials.clear(); me.materials.append(mat)
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    rim = np.zeros(len(co), dtype=bool); rim[boundary_vertices(me)] = True
    rng = np.random.default_rng(seed)
    centre = co.mean(0)
    reach = np.linalg.norm(co[:, :2] - centre[:2], axis=1)
    fall = np.clip(1 - reach / max(reach.max(), 1e-6), 0, 1)
    d = rng.normal(0, jitter, co.shape)
    d[:, 2] -= sag * fall
    co[~rim] += d[~rim]
    me.vertices.foreach_set('co', co.ravel()); me.update()
    return link(w)


def wreck_material(mat):
    w = mat.copy(); w.name = 'approved_eclipse_wreck'
    bs = next(nd for nd in w.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED')
    bs.inputs['Emission Strength'].default_value = 0.0
    for l in list(bs.inputs['Emission Color'].links):
        w.node_tree.links.remove(l)
    bs.inputs['Emission Color'].default_value = (0, 0, 0, 1)
    return w


def marker(name, **props):
    o = link(bpy.data.objects.new(name, None))
    for k, v in props.items():
        o[k] = v
    return o


# ----------------------------------------------------------------------------- material
def blur(a, r):
    """Separable box blur, applied twice (close to a gaussian), edges clamped."""
    for _ in range(2):
        p = np.pad(a, ((r + 1, r), (0, 0)), mode='edge'); c = np.cumsum(p, 0); a = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
        p = np.pad(a, ((0, 0), (r + 1, r)), mode='edge'); c = np.cumsum(p, 1); a = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return a


def uv_region(uvs, size, grow=2):
    """Texels covered by triangles (n, 3, 2) of UVs, sampled at ten barycentric points each and grown by `grow`."""
    W = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5],
                  [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]])
    pts = np.einsum('kj,njd->nkd', W, uvs).reshape(-1, 2)
    m = np.zeros((size, size), dtype=bool)
    m[np.clip((pts[:, 1] % 1) * size, 0, size - 1).astype(int), np.clip((pts[:, 0] % 1) * size, 0, size - 1).astype(int)] = True
    for _ in range(grow):
        g = m.copy()
        g[1:] |= m[:-1]; g[:-1] |= m[1:]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
        m = g
    return m


def uv_paint(uvs, values, size, grow=2):
    """Per-texel maximum of per-triangle values over triangles (n, 3, 2) of UVs (ten barycentric samples each), grown
    by `grow` texels."""
    W = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5],
                  [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]])
    pts = np.einsum('kj,njd->nkd', W, uvs).reshape(-1, 2)
    vals = np.repeat(np.asarray(values, dtype=np.float32), len(W))
    img = np.zeros((size, size), dtype=np.float32)
    np.maximum.at(img, (np.clip((pts[:, 1] % 1) * size, 0, size - 1).astype(int), np.clip((pts[:, 0] % 1) * size, 0, size - 1).astype(int)), vals)
    for _ in range(grow):
        g = img.copy()
        g[1:] = np.maximum(g[1:], img[:-1]); g[:-1] = np.maximum(g[:-1], img[1:])
        g[:, 1:] = np.maximum(g[:, 1:], img[:, :-1]); g[:, :-1] = np.maximum(g[:, :-1], img[:, 1:])
        img = g
    return img


def vent_glow(g, fv, faces, sign):
    """Per face of a vent: 0 at its rim, 1 along its middle (distance to the outline in the camera's view)."""
    fc = g[fv[faces]].mean(1)
    u = fc[:, 0]; v = fc[:, 1] * S55 + fc[:, 2] * C55
    poly = np.array([(sign * a, b) for a, b in VENT_LOWER] + [(sign * a, b) for a, b in VENT_UPPER[::-1]])
    d = np.full(len(u), 1e9)
    for (x1, y1), (x2, y2) in zip(poly, np.roll(poly, -1, 0)):
        ex, ey = x2 - x1, y2 - y1
        t = np.clip(((u - x1) * ex + (v - y1) * ey) / max(ex * ex + ey * ey, 1e-12), 0, 1)
        d = np.minimum(d, np.hypot(u - x1 - t * ex, v - y1 - t * ey))
    t = np.clip(d / max(d.max(), 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def material(src_mat, heart_uv, vent_uv, vent_val, directory, size=2048, normal_size=1024, report=None):
    """The supplied atlases at working size, roughness kept legible (0.34-0.86), and an emission mask: the thin bright
    violet seams and the reactor ring (brightness above its own surroundings on dark armour, so broad blue gradients
    stay paint), the reactor's lens glowing softly, and the two vents glowing violet."""
    key = 'approved_eclipse_surface_%d_v1' % size
    mat = src_mat.copy(); mat.name = key
    nt = mat.node_tree; bs = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    os.makedirs(directory, exist_ok=True)
    base = None
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
        saved = bpy.data.images.load(path, check_existing=False); saved.colorspace_settings.name = img.colorspace_settings.name
        saved.pack(); node.image = saved
        bpy.data.images.remove(img)
        if kind == 'base':
            base = saved
    data = np.empty(size * size * 4, dtype=np.float32); base.pixels.foreach_get(data)
    rgb = data.reshape(size, size, 4)[:, :, :3]
    V = rgb.max(-1)
    local = blur(V, 10)
    bluish = np.clip((rgb[..., 2] - np.maximum(rgb[..., 0], rgb[..., 1]) * .9) * 6, 0, 1)
    seams = np.clip((V - local - .07) * 5, 0, 1) * np.clip((V - .45) * 4, 0, 1) * np.clip((.55 - local) * 4, 0, 1) * np.clip(bluish + .5, 0, 1)
    hue = rgb / np.maximum(V[..., None], 1e-3)
    violet = np.array([.62, .5, 1.0])
    col = (hue * .5 + violet * .5) * seams[..., None]
    heart = uv_region(heart_uv, size)
    lens = np.clip(V * 1.0, .15, .65) * heart
    col = np.maximum(col, (hue * .6 + violet * .4) * lens[..., None])
    glow = uv_paint(vent_uv, vent_val + .02, size)
    vents = glow > 0
    vent_col = np.array([.5, .3, 1.0]) * (.12 + .55 * np.clip(glow - .02, 0, 1) ** 1.5)[..., None]
    col = np.where(vents[..., None], np.maximum(col, vent_col), col)
    rgba = np.ones((size, size, 4), dtype=np.float32); rgba[..., :3] = np.clip(col, 0, 1)
    emit = bpy.data.images.new(key + '_emission', width=size, height=size, alpha=False)
    # sRGB, as glTF reads an emissive texture (the game decodes it so), so Blender previews match the game.
    emit.colorspace_settings.name = 'sRGB'; emit.pixels.foreach_set(rgba.ravel()); emit.pack()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = emit
    nt.links.new(tex.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 2.4
    lit = col.max(-1)
    if report is not None:
        report.update(glow_mask_fraction=float((lit > .1).mean()), glow_mask_mean=float(lit.mean()),
                      seam_fraction=float((seams > .1).mean()), lens_texels=int(heart.sum()), vent_texels=int(vents.sum()))
    # A texel for the caps under the collar: the darkest, flattest spot of the atlas (black armour, plain normal).
    dark = blur(V, 6) + np.where(heart | vents, 9, 0)
    i, j = np.unravel_index(np.argmin(dark[64:-64, 64:-64]), dark[64:-64, 64:-64].shape)
    cap_uv = ((j + 64 + .5) / size, (i + 64 + .5) / size)
    return mat, cap_uv


def mesh_arrays(me):
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    return co, fv


def collar_seat(pieces, cap_uv, mats, iterations=4000):
    """The seat a run of neighbouring collar shutters leaves in the hull: their own (reduced) surface with every inner
    vertex lowered onto a smooth membrane (harmonic heights) spanning the run's rim (the reactor ring, the trough and
    the two cut ends), so it closes the hull exactly where they stood. Returns the seat object and, per piece, its
    vertices' membrane heights (for the piece's own underside)."""
    cos, fvs, off = [], [], 0
    for ob in pieces:
        co, fv = mesh_arrays(ob.data); cos.append(co); fvs.append(fv + off); off += len(co)
    co = np.concatenate(cos); fv = np.concatenate(fvs)
    _, first, inv = np.unique(np.round(co, 5), axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel(); F = inv[fv]; U = co[first].copy()
    e = np.concatenate([np.sort(F[:, [0, 1]], 1), np.sort(F[:, [1, 2]], 1), np.sort(F[:, [2, 0]], 1)])
    ue, cnt = np.unique(e, axis=0, return_counts=True)
    fixed = np.zeros(len(U), dtype=bool); fixed[ue[cnt == 1].ravel()] = True
    a = np.concatenate([ue[:, 0], ue[:, 1]]); b = np.concatenate([ue[:, 1], ue[:, 0]])
    deg = np.maximum(np.bincount(a, minlength=len(U)), 1)
    z = U[:, 2].copy()
    for _ in range(iterations):
        zn = np.bincount(a, weights=z[b], minlength=len(U)) / deg
        z = np.where(fixed, z, zn)
    S = U.copy(); S[:, 2] = np.where(U[:, 2] - z < 1e-4, U[:, 2], z)
    uv = np.tile(np.array(cap_uv, dtype=np.float32), (len(F), 3, 1))
    me = build_mesh('eclipse_collar_seat', S, F, uv, mats); me.shade_smooth()
    seat = link(bpy.data.objects.new('eclipse_collar_seat', me))
    lows, off = [], 0
    for c in cos:
        lows.append(S[inv[off:off + len(c)], 2]); off += len(c)
    return seat, lows


def underside(ob, low, cap_uv, mats):
    """Close a collar shutter from below: its surface lowered onto the seat membrane (`low` heights, winding reversed),
    plus walls along the cut ends it shares with its neighbours (where the membrane lies under its top edge)."""
    co, fv = mesh_arrays(ob.data)
    n = len(co)
    low = np.where(co[:, 2] - low < 1e-4, co[:, 2], low)     # a hair under the top: the same point
    S = co.copy(); S[:, 2] = low
    P = np.concatenate([co, S])
    faces = [fv[:, ::-1] + n]
    e = np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]], fv[:, [2, 0]]])
    k = np.sort(e, 1)
    u, inv, cnt = np.unique(k, axis=0, return_inverse=True, return_counts=True)
    bnd = e[cnt[inv.ravel()] == 1]                 # boundary edges, face winding order
    gap = (co[:, 2] - low) > 0
    walls = bnd[gap[bnd[:, 0]] | gap[bnd[:, 1]]]
    if len(walls):
        i, j = walls[:, 0], walls[:, 1]
        faces.append(np.c_[j, i, i + n]); faces.append(np.c_[j, i + n, j + n])
    F = np.concatenate(faces)
    keep = np.linalg.norm(np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]]), axis=1) > 1e-9
    F = F[keep]
    used, rem = np.unique(F, return_inverse=True)
    uv = np.tile(np.array(cap_uv, dtype=np.float32), (len(F), 3, 1))
    me = build_mesh(ob.name + '_underside', P[used], rem.reshape(-1, 3), uv, mats)
    for p in me.polygons:
        p.use_smooth = False
    return link(bpy.data.objects.new(ob.name + '_underside', me))


# ----------------------------------------------------------------------------- build
OPEN_DEG = 50            # preview/test opening of the collar shutters (the view sets its own angle)


def clear_scene():
    sc = bpy.context.scene
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def hidden_vertices(ob):
    """Vertices whose faces all face well away from the 55-degree camera (the underside and the rear walls)."""
    me = ob.data
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    pn = np.empty(len(me.polygons) * 3); me.polygons.foreach_get('normal', pn); pn = pn.reshape(-1, 3)
    best = np.full(len(me.vertices), -9.0)
    np.maximum.at(best, fv.ravel(), np.repeat(pn @ TO_EYE, 3))
    return best < -.3


def build(out, preview_dir, label=LABEL):
    t0 = time.time()
    report = dict(source=os.path.basename(SRC), scale=SCALE)
    clear_scene()
    src = load_source(); src_mat = src.data.materials[0]
    co, fv, uv = arrays(src.data)
    co, fv = weld(co, fv)
    horn = {}
    co, fv, uv = fix_horn(co, fv, uv, report=horn)
    report['wing_fix'] = horn
    # float32-exact values, so bmesh round trips (the straight cuts below) weld back bit for bit
    g = to_game(co).astype(np.float32).astype(np.float64)
    px = base_pixels(src_mat)
    rgb = sample(px, uv.mean(1))
    fc = g[fv].mean(1)
    fn = np.cross(g[fv[:, 1]] - g[fv[:, 0]], g[fv[:, 2]] - g[fv[:, 0]]); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-20
    info = reactor(fc, fn, rgb)
    g, fv, uv = straight_cuts(g, fv, uv, (info['cx'], info['cy']), [a for pair in SECTORS for a in pair])
    n_open = open_edge_count(fv)
    report['open_edges_after_cuts'] = n_open
    if n_open:
        raise RuntimeError('THE ECLIPSE surface is not closed after the wing fix and cuts: %d open edges' % n_open)
    rgb = sample(px, uv.mean(1)); del px
    lab = classify(g, fv, rgb, info)
    offset = np.array([0.0, -info['cy'], 2.0 - info['height']])
    G = taubin(g + offset, fv, SMOOTH)
    report['placement'] = dict(rotation='source (x, y, z) -> (x, z, -y)', scale=SCALE, offset=offset.round(4).tolist(),
                               reactor_unplaced=info)
    log('placed', json.dumps(report['placement'], default=plain), '%.1fs' % (time.time() - t0))
    tex_dir = os.path.join(preview_dir, 'textures')
    vents = np.where((lab == 20) | (lab == 21))[0]
    vval = np.zeros(len(vents))
    for side, sign in ((20, 1), (21, -1)):
        m = lab[vents] == side
        vval[m] = vent_glow(g, fv, vents[m], sign)
    mat, cap_uv = material(src_mat, uv[lab == 1], uv[vents], vval, tex_dir, report=report)
    mats = [mat]
    # Full-resolution surface for the shading transfer (not exported).
    hires = part_object('eclipse_hires_reference', G, fv, uv, np.ones(len(fv), dtype=bool), mats)
    hires.hide_render = True
    objects, parts = [], {}
    names = {1: 'eclipse_heart', 20: 'eclipse_pod_left', 21: 'eclipse_pod_right'}
    names.update({10 + k: 'eclipse_heart_shutter_%d' % k for k in range(len(SECTORS))})
    report['source_faces'] = {nm: int((lab == k).sum()) for k, nm in names.items()}
    report['source_faces']['eclipse_hull'] = int((lab == 0).sum())
    # One surface, reduced as a whole (material slot = part), so every part keeps meeting the hull exactly: their
    # seams are shared edges, pinned during reduction, and are only split apart afterwards.
    labels = [0] + list(names)
    lut = np.zeros(max(labels) + 1, dtype=np.int32); lut[labels] = np.arange(len(labels))
    whole = part_object('eclipse_whole', G, fv, uv, np.ones(len(fv), dtype=bool), mats * len(labels))
    whole.data.polygons.foreach_set('material_index', lut[lab])
    del g, fc, fn, rgb
    visible_share = reduce_whole(whole, labels, names)
    report['hull_visible_vertex_share'] = round(visible_share, 3)
    hull = split_part(whole, 0, 'eclipse_hull', mats)
    for k, nm in names.items():
        parts[nm] = split_part(whole, labels.index(k), nm, mats)
    bpy.data.objects.remove(whole, do_unlink=True)
    for ob in [hull] + list(parts.values()):
        transfer_normals(ob, hires)
    log('reduced and split (%.1fs)' % (time.time() - t0))
    seats, hinges = [], {}
    for group in (range(0, 3), range(3, 6)):
        pieces = [parts['eclipse_heart_shutter_%d' % k] for k in group]
        seat, lows = collar_seat(pieces, cap_uv, mats)
        seats.append(seat)
        for sh, low in zip(pieces, lows):
            under = underside(sh, low, cap_uv, mats)
            join(sh, [under])
    for k in range(len(SECTORS)):
        sh = parts['eclipse_heart_shutter_%d' % k]
        # Hinge: the outer foot of the sector (its rim beyond 85% of the collar's reach), tangential; a turn about
        # local +x rolls it outward over that foot, the inner edge lifting off the reactor.
        v = np.array([p.co[:] for p in sh.data.vertices])
        rr = np.hypot(v[:, 0] - info['cx'], v[:, 1])
        foot = v[rr > R_HEART + .85 * (R_COLLAR - R_HEART)]
        hinge = foot.mean(0)
        hinge[2] = np.percentile(foot[:, 2], 25)
        out_dir = Vector((hinge[0] - info['cx'], hinge[1], 0)).normalized()
        phi = math.atan2(out_dir.x, -out_dir.y)
        set_pivot(sh, tuple(hinge), phi)
        hinges[sh.name] = dict(hinge=[round(float(x), 3) for x in hinge], outward=[round(out_dir.x, 3), round(out_dir.y, 3)],
                               phi_deg=round(math.degrees(phi), 2))
    report['shutters'] = hinges
    report['shutter_open_edges'] = {nm: open_edges([parts[nm]]) for nm in hinges}
    log('shutter open edges', report['shutter_open_edges'])
    join(hull, seats)
    report['closed_surface_open_edges'] = open_edges([hull, parts['eclipse_heart'], parts['eclipse_pod_left'], parts['eclipse_pod_right']])
    log('open edges of hull + reactor + vents (shutters lifted away):', report['closed_surface_open_edges'])
    # Pivots of the targets: the reactor centre on the ring's plane; each vent's centre.
    heart = parts['eclipse_heart']
    set_pivot(heart, (info['cx'], 0.0, 2.0))
    for side in ('left', 'right'):
        ob = parts['eclipse_pod_' + side]
        v = np.array([p.co[:] for p in ob.data.vertices])
        set_pivot(ob, tuple(v.mean(0)))
    objects = [hull, heart] + [parts['eclipse_heart_shutter_%d' % k] for k in range(len(SECTORS))]
    objects += [parts['eclipse_pod_left'], parts['eclipse_pod_right']]
    burnt = wreck_material(mat)
    objects += [wreck_copy(heart, burnt, sag=.35, jitter=.04, seed=7), wreck_copy(parts['eclipse_pod_left'], burnt, jitter=.03, seed=8),
                wreck_copy(parts['eclipse_pod_right'], burnt, jitter=.03, seed=9)]
    total = tris(objects)
    report['triangles'] = {o.name: tris([o]) for o in objects}
    report['triangles_total'] = total
    if total > BUDGET:
        raise RuntimeError('THE ECLIPSE over its %d-triangle budget: %d' % (BUDGET, total))
    tag = marker('eclipse_approved_v1', source_file=os.path.basename(SRC), scale=SCALE, horn_cut_source_z=HORN_CUT,
                 placement_offset=offset.round(4).tolist(), triangles=total)
    objects.append(tag)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objects:
        o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out + '.tmp.glb', export_format='GLB', use_selection=True, use_active_scene=True,
                              export_materials='EXPORT', export_image_format='AUTO', export_texcoords=True, export_normals=True,
                              export_yup=True, export_animations=False, export_extras=True, export_cameras=False, export_lights=False,
                              export_copyright='Last Worlds — user-supplied Tripo GLB, adapted in Blender without regeneration')
    os.replace(out + '.tmp.glb', out)
    report['file'] = out; report['bytes'] = os.path.getsize(out)
    log('exported', out, report['bytes'], 'bytes', total, 'triangles', '%.1fs' % (time.time() - t0))
    return dict(report=report, objects=objects, hires=hires, src=src, info=info, offset=offset, mats=mats)


# ----------------------------------------------------------------------------- checks and previews
def world_tris(objects):
    """World-space triangles of mesh objects as (verts, tris) for a BVH."""
    verts, polys = [], []
    for o in objects:
        me = o.data; me.calc_loop_triangles()
        M = o.matrix_world
        base = len(verts)
        verts += [M @ v.co for v in me.vertices]
        polys += [[base + i for i in t.vertices] for t in me.loop_triangles]
    return verts, polys


def visible_surface(target, occluders):
    """Area-weighted share and mean height of a target's faces that the 55-degree camera sees (front-facing and not
    hidden by the occluders), with their mean position."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons(*world_tris(occluders + [target]), all_triangles=True)
    me = target.data; M = target.matrix_world; R = M.to_3x3()
    eye = Vector(TO_EYE)
    seen_area = total = 0.0; acc = Vector()
    for p in me.polygons:
        c = M @ p.center; n = (R @ p.normal).normalized()
        a = p.area; total += a
        if n.dot(eye) <= .05:
            continue
        hit = tree.ray_cast(c + eye * 1e-3, eye, 80)
        if hit[0] is None:
            seen_area += a; acc += c * a
    if seen_area == 0:
        return dict(share=0.0)
    mean = acc / seen_area
    return dict(share=round(seen_area / total, 3), mean=[round(x, 3) for x in mean])


def ray_clear(point, occluders):
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons(*world_tris(occluders), all_triangles=True)
    hit = tree.ray_cast(Vector(point) + Vector(TO_EYE) * 1e-3, Vector(TO_EYE), 80)
    return hit[0] is None, (None if hit[0] is None else [round(x, 3) for x in hit[0]])


def checks(res):
    rep = res['report']
    by = {o.name: o for o in res['objects']}
    hull = by['eclipse_hull']
    shutters = [by['eclipse_heart_shutter_%d' % k] for k in range(len(SECTORS))]
    heart, left, right = by['eclipse_heart'], by['eclipse_pod_left'], by['eclipse_pod_right']
    out = {}
    for pose in ('closed', 'open'):
        for s in shutters:
            s.rotation_euler.x = math.radians(OPEN_DEG) if pose == 'open' else 0
        bpy.context.view_layer.update()
        occ = [hull] + shutters
        out[pose] = dict(heart=visible_surface(heart, occ + [left, right]))
        cx = heart.location.x
        clear = None
        for h in np.arange(1.4, 4.01, .05):
            ok, _ = ray_clear((cx, 0, h), occ)
            if ok:
                clear = round(float(h), 2); break
        out[pose]['heart_centre_ray_clear_from_z'] = clear
        out[pose]['heart_centre_ray_at_z2'] = ray_clear((cx, 0, 2.0), occ)
    for s in shutters:
        s.rotation_euler.x = 0
    bpy.context.view_layer.update()
    occ = [hull] + shutters + [heart]
    for side, ob in (('left', left), ('right', right)):
        v = visible_surface(ob, occ + [right if side == 'left' else left])
        bb = np.array([ob.matrix_world @ Vector(c) for c in ob.bound_box])
        v.update(pivot=[round(x, 3) for x in ob.location], x=[round(bb[:, 0].min(), 2), round(bb[:, 0].max(), 2)],
                 y=[round(bb[:, 1].min(), 2), round(bb[:, 1].max(), 2)], z=[round(bb[:, 2].min(), 2), round(bb[:, 2].max(), 2)],
                 centre_ray_clear=ray_clear(ob.location, occ)[0])
        out['vent_' + side] = v
    hb = np.array([hull.matrix_world @ Vector(c) for c in hull.bound_box])
    out['hull_bounds'] = [hb.min(0).round(3).tolist(), hb.max(0).round(3).tolist()]
    out['heart_pivot'] = [round(x, 3) for x in heart.location]
    rep['checks'] = out
    log('checks', json.dumps(out, default=plain))
    return out


def preview_setup(sc):
    for o in list(sc.objects):
        if o.name.startswith('eclipse_preview'):
            bpy.data.objects.remove(o, do_unlink=True)
    world = bpy.data.worlds.get('eclipse_preview_world') or bpy.data.worlds.new('eclipse_preview_world')
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (.022, .02, .035, 1); bg.inputs['Strength'].default_value = 1.0
    sc.world = world
    sun = bpy.data.lights.new('eclipse_preview_sun', 'SUN'); sun.energy = 3.6; sun.color = (.9, .93, 1.0); sun.angle = math.radians(3)
    so = link(bpy.data.objects.new('eclipse_preview_sun', sun))
    so.rotation_euler = Vector((-.55, -.55, .63)).to_track_quat('Z', 'Y').to_euler()
    for name, loc, power, size, colr in (('eclipse_preview_soft', (2, -10, 16), 2600, 22, (.92, .94, 1.0)),
                                         ('eclipse_preview_rim', (-4, 16, 7), 1400, 14, (.62, .48, 1.0))):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = power; L.shape = 'DISK'; L.size = size; L.color = colr
        o = link(bpy.data.objects.new(name, L)); o.location = loc
        o.rotation_euler = (Vector((0, 2, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    try:
        sc.eevee.taa_render_samples = 48
        sc.eevee.use_raytracing = True
    except AttributeError:
        pass
    sc.render.film_transparent = False
    try:
        sc.view_settings.view_transform = 'Khronos PBR Neutral'   # the game's NeutralToneMapping
    except TypeError:
        sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'


def shoot(sc, view, centre, size, path, res=1400):
    import boss_remodel as br
    direction, rotation = br.CAMERAS[view]
    cd = bpy.data.cameras.new('eclipse_preview_cam'); cd.type = 'ORTHO'; cd.ortho_scale = size; cd.clip_end = 300
    cam = link(bpy.data.objects.new('eclipse_preview_cam', cd))
    cam.location = Vector(centre) + Vector(direction) * 80
    cam.rotation_euler = [math.radians(a) for a in rotation]
    sc.camera = cam
    sc.render.resolution_x = sc.render.resolution_y = res; sc.render.resolution_percentage = 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    return path


def side_by_side(paths, out, gap=8):
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p, check_existing=False)
        w, h = im.size; a = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(a); imgs.append(a.reshape(h, w, 4))
        bpy.data.images.remove(im); os.remove(p)
    h = max(i.shape[0] for i in imgs)
    sep = np.ones((h, gap, 4), dtype=np.float32)
    row = []
    for i, im in enumerate(imgs):
        row.append(im)
        if i < len(imgs) - 1:
            row.append(sep)
    sheet = np.concatenate(row, 1)
    o = bpy.data.images.new('eclipse_sheet', sheet.shape[1], sheet.shape[0]); o.pixels.foreach_set(sheet.ravel())
    o.filepath_raw = out; o.file_format = 'PNG'; o.save(); bpy.data.images.remove(o)
    return out


def previews(res, directory):
    sc = bpy.context.scene
    preview_setup(sc)
    objs = res['objects']
    by = {o.name: o for o in objs}
    for o in sc.objects:
        if o.type == 'MESH':
            o.hide_render = o not in objs or o.name.endswith('_wreck')
    shutters = [by['eclipse_heart_shutter_%d' % k] for k in range(len(SECTORS))]
    d = directory
    shots = [shoot(sc, 'game', (0, 2.6, 0), 23, os.path.join(d, 'eclipse-game.png')),
             shoot(sc, 'top', (0, 2.6, 0), 23, os.path.join(d, 'eclipse-top.png')),
             shoot(sc, 'front', (0, 0, .4), 23, os.path.join(d, 'eclipse-front.png')),
             shoot(sc, 'three_quarter', (0, 2.6, 0), 24, os.path.join(d, 'eclipse-three-quarter.png'))]
    a = shoot(sc, 'game', (0, .2, 2), 8, os.path.join(d, '_closed.png'), 1000)
    for s in shutters:
        s.rotation_euler.x = math.radians(OPEN_DEG)
    b = shoot(sc, 'game', (0, .2, 2), 8, os.path.join(d, '_open.png'), 1000)
    shots.append(side_by_side([a, b], os.path.join(d, 'eclipse-reactor-closed-open.png')))
    shots.append(shoot(sc, 'game', (0, 2.6, 0), 23, os.path.join(d, 'eclipse-game-open.png')))
    for s in shutters:
        s.rotation_euler.x = 0
    # The mended wing: the supplied model (same placement) beside the adapted hull.
    src = res['src']
    src.rotation_mode = 'XYZ'; src.rotation_euler = (-math.pi / 2, 0, 0); src.scale = (SCALE,) * 3
    src.location = tuple(res['offset'])
    pairs = []
    import boss_remodel as br
    q = Vector((-.62, -.38, .69)).normalized()
    br.CAMERAS['wing_quarter'] = (tuple(q), tuple(math.degrees(a) for a in q.to_track_quat('Z', 'Y').to_euler()))
    for view, centre, size in (('game', (-8.6, 6.2, 0), 7.5), ('top', (-8.6, 6.2, 0), 7.5), ('wing_quarter', (-8.6, 6.0, 0), 8)):
        for show_src in (True, False):
            for o in sc.objects:
                if o.type == 'MESH':
                    o.hide_render = (o is not src) if show_src else (o not in objs or o.name.endswith('_wreck'))
            pairs.append(shoot(sc, view, centre, size, os.path.join(d, '_w_%s_%d.png' % (view, show_src)), 900))
    shots.append(side_by_side(pairs[0:2], os.path.join(d, 'eclipse-wingfix-game.png')))
    shots.append(side_by_side(pairs[2:4], os.path.join(d, 'eclipse-wingfix-top.png')))
    shots.append(side_by_side(pairs[4:6], os.path.join(d, 'eclipse-wingfix-quarter.png')))
    src.hide_render = True
    return shots


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = lambda k, d: argv[argv.index(k) + 1] if k in argv else d
    out = opt('--out', os.path.join(ROOT, 'public', 'assets', 'umbra', 'the-eclipse-%s.glb' % LABEL))
    pdir = opt('--preview-dir', os.path.join(ROOT, 'lookdev', 'umbra', 'eclipse'))
    os.makedirs(pdir, exist_ok=True)
    res = build(out, pdir)
    checks(res)
    if '--no-previews' not in argv:
        res['report']['previews'] = previews(res, pdir)
    with open(os.path.join(pdir, 'eclipse-report.json'), 'w') as f:
        json.dump(res['report'], f, indent=1, default=plain)
    log('DONE', json.dumps(res['report'], default=plain))


if __name__ == '__main__':
    main()
