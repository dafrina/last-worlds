"""Shared pipeline for the Vesper (Glass Frontier) Blender scripts.

Builds on the hard-surface builder of khepri_infra.py and the helpers of khepri_kit.py:
vertex-colour bake (paint, edge wear, frost/snow, ray-cast AO, scorch), object creation
with node origins (sockets), box UVs, glTF export to a temporary file, contract
verification of the exported GLB, and Vesper preview lighting/materials.

Conventions (same as the Khepri kits): glTF +Y up, 1 unit = 1 game unit, front +Z.
Geometry is authored in Blender space (x, y = -glTF z, z = glTF y).
"""

import json
import math
import os
import random
import struct
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import khepri_kit as kit  # noqa: E402
import khepri_infra as infra  # noqa: E402
from khepri_infra import HS, merge_hs, xform, strut, loft, octagon  # noqa: E402,F401

COLOR_ATTR = "Col"
GLOW_HEX = "#ff7a26"

# Paint table: name -> (albedo hex, edge-wear amount, wear hex). Vesper faction: black ceramic,
# pale ceramic, orange glow. Never Khepri graphite/ochre.
PAINTS = {
    "ceramic": ("#15181b", 0.55, "#47505a"),
    "ceramic_dk": ("#0d0f11", 0.45, "#353c43"),
    "ceramic_grey": ("#2b3138", 0.5, "#56606a"),
    "steel": ("#454c54", 0.5, "#808a94"),
    "pale": ("#d3dae1", 0.4, "#8f9ba6"),
    "pale_dk": ("#a5b0ba", 0.4, "#6f7b86"),
    "visor": ("#0a1824", 0.15, "#1e3a50"),
    "orange": ("#b9531d", 0.45, "#4a2412"),
    "char": ("#121314", 0.25, "#2a2c2e"),
    "burnt": ("#2c1f19", 0.3, "#4d3a30"),
}
FROST = kit.hex_linear("#dfe8ef")
SOOT = kit.hex_linear("#0c0d0e")


def B(gx, gy, gz):
    """glTF (x, y up, z toward the player) -> Blender (x, y, z up)."""
    return (gx, -gz, gy)


def lamp(hs, p, r=0.04, h=0.06, glow=1, housing_mat=0, housing="ceramic_dk"):
    hs.box((p[0], p[1], p[2] + h * 0.2), (r * 2.4, r * 2.4, h * 0.4), 0.0, housing, housing_mat)
    hs.cyl((p[0], p[1], p[2] + h * 0.4), (0, 0, 1), r, h * 0.6, 6, 0.0, "lamp", mat=glow, cap0=False, smooth=False)


def glow_box(hs, c, size, glow=1, rot=None):
    if rot is None:
        hs.box(c, size, 0.0, "lamp", glow, bottom=True)
    else:
        g = HS(hs.rng)
        g.box((0.0, 0.0, 0.0), size, 0.0, "lamp", glow, bottom=True)
        merge_hs(hs, g, xform(c, rot))


def hex_poly(r, rot=0.0, cx=0.0, cy=0.0):
    return [(cx + math.cos(rot + k * math.pi / 3) * r, cy + math.sin(rot + k * math.pi / 3) * r) for k in range(6)]


def loft_y(hs, secs, prof, paint, mat, tag="main"):
    """Loft along Blender y. secs: (y, sx, sz, cx, cz); sx == 0 makes an apex point.
    prof: CCW (x, z) unit profile. Faces are oriented away from the local axis."""
    rings = []
    for y, sx, sz, cx, cz in secs:
        if sx == 0.0:
            rings.append(("apex", hs.v((cx, y, cz)), (cx, y, cz)))
        else:
            rings.append(("ring", [hs.v((cx + px * sx, y, cz + pz * sz)) for px, pz in prof], (cx, y, cz)))
    n = len(prof)
    for (ka, ra, ca), (kb, rb, cb) in zip(rings, rings[1:]):
        mid = Vector(((ca[0] + cb[0]) * 0.5, (ca[1] + cb[1]) * 0.5, (ca[2] + cb[2]) * 0.5))
        for k in range(n):
            j = (k + 1) % n
            if ka == "apex":
                q = (ra, rb[j], rb[k])
            elif kb == "apex":
                q = (ra[k], ra[j], rb)
            else:
                q = (ra[k], ra[j], rb[j], rb[k])
            c = Vector((0.0, 0.0, 0.0))
            for i in q:
                c += Vector(hs.verts[i])
            c /= len(q)
            out = c - mid
            out.y = 0.0
            hs.face(q, paint, tag, mat, outward=tuple(out) if out.length > 1e-6 else (0, 1, 0))
    for (kind, r, c), (_k2, _r2, c2) in ((rings[0], rings[1]), (rings[-1], rings[-2])):
        if kind == "ring":
            hs.face(tuple(r), paint, "edge", mat, outward=(0, 1.0 if c[1] > c2[1] else -1.0, 0))


def triangulate_nonplanar(hs, tol=1e-4):
    """Split polygons whose corners are not coplanar into a fan of triangles, so per-face box UVs
    and shading agree with the triangles the exporter writes."""
    faces, mats, paints, tags = [], [], [], []
    for f, m, p, t in zip(hs.faces, hs.fmat, hs.fpaint, hs.ftag):
        if len(f) > 3:
            pts = [Vector(hs.verts[i]) for i in f]
            n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
            if n.length > 1e-12:
                n.normalize()
                if max(abs((q - pts[0]).dot(n)) for q in pts[3:]) > tol:
                    for k in range(1, len(f) - 1):
                        faces.append((f[0], f[k], f[k + 1]))
                        mats.append(m)
                        paints.append(p)
                        tags.append(t)
                    continue
        faces.append(f)
        mats.append(m)
        paints.append(p)
        tags.append(t)
    hs.faces, hs.fmat, hs.fpaint, hs.ftag = faces, mats, paints, tags


# ----------------------------------------------------------------------------
# Bake
# ----------------------------------------------------------------------------

AO_DIRS = kit.hemisphere_dirs(40)


def bake(hs, name, opts, context=()):
    """Per-corner linear RGBA.

    opts: glow (set of material indices drawn white), paints (dict), ao (max distance),
    ground (z of an occluding ground plane or None), frost (amount on upward faces),
    frost_low (amount in a band near the ground), colour_fn (optional callable
    (paint, p, n, ao, fi) -> rgb or None to fall back to the paint table).
    """
    paints = {k: (kit.hex_linear(v[0]), v[1], kit.hex_linear(v[2])) for k, v in opts.get("paints", PAINTS).items()}
    glow = opts.get("glow", {1})
    max_dist = opts.get("ao", 0.35)
    ground = opts.get("ground", 0.0)
    frost_up = opts.get("frost", 0.0)
    frost_low = opts.get("frost_low", 0.0)
    colour_fn = opts.get("colour_fn")
    tile = opts.get("tile")                      # (axis 'x' | 'y' in Blender space, period) for tiling pieces
    verts = [Vector(v) for v in hs.verts]
    all_v = list(verts)
    polys = list(hs.faces)
    if tile:
        ax = 0 if tile[0] == "x" else 1
        for off in (-tile[1], tile[1]):
            shift = Vector((off, 0.0, 0.0)) if ax == 0 else Vector((0.0, off, 0.0))
            base = len(all_v)
            all_v += [v + shift for v in verts]
            polys += [tuple(base + i for i in f) for f in hs.faces]
    for cv, cf in context:
        base = len(all_v)
        all_v += cv
        polys += [tuple(base + i for i in f) for f in cf]
    bvh = BVHTree.FromPolygons(all_v, polys, all_triangles=False, epsilon=0.0)
    rng = random.Random(f"vesper:colour:{name}")
    top = max(v.z for v in verts)
    out = []
    for fi, f in enumerate(hs.faces):
        if hs.fmat[fi] in glow:
            out += [(1.0, 1.0, 1.0, 1.0)] * len(f)
            continue
        n = kit.face_normal(hs.verts, f)
        cen = Vector((0.0, 0.0, 0.0))
        for i in f:
            cen += verts[i]
        cen /= len(f)
        paint = hs.fpaint[fi]
        jitter = 1.0 if tile else rng.uniform(0.94, 1.05)
        for i in f:
            p = verts[i]
            shiftv = (cen - p) * 0.08
            if tile and abs(abs(p[ax]) - tile[1] * 0.5) < 1e-6:
                # seam vertex: no shift along the tiling axis; the + end samples its - end twin
                shiftv[ax] = 0.0
                if p[ax] > 0:
                    p = p.copy()
                    p[ax] -= tile[1]
            sample = p + shiftv + n * 0.0015
            t1 = n.orthogonal().normalized()
            t2 = n.cross(t1)
            hits = 0
            for dx, dy, dz in AO_DIRS:
                d = t1 * dx + t2 * dy + n * dz
                if ground is not None and d.z < -1e-6 and sample.z > ground and (ground - sample.z) / d.z < max_dist:
                    hits += 1
                    continue
                if bvh.ray_cast(sample, d, max_dist)[0] is not None:
                    hits += 1
            ao = 1.0 - hits / len(AO_DIRS)
            col = colour_fn(paint, p, n, ao, fi) if colour_fn else None
            if col is None:
                base, wear, wear_col = paints[paint]
                col = base
                if hs.ftag[fi] == "edge":
                    col = kit.mix3(col, wear_col, wear)
                col = kit.mul3(col, jitter)
                if frost_up or frost_low:
                    fr = frost_up * kit.smoothstep(0.6, 0.95, n.z)
                    if ground is not None and n.z < 0.6:
                        fr = max(fr, frost_low * kit.clamp(1.0 - (p.z - ground) / 0.18, 0.0, 1.0))
                    fr *= 1.0 - 0.35 * kit.clamp(p.z / max(top, 0.05), 0.0, 1.0)
                    col = kit.mix3(col, FROST, kit.clamp(fr, 0.0, 0.8))
                col = kit.mul3(col, kit.lerp(0.25, 1.0, ao ** 1.2))
            for sc, sr in getattr(hs, "scorch", ()):
                k = kit.clamp(1.0 - (p - Vector(sc)).length / sr, 0.0, 1.0)
                if k > 0.0:
                    col = kit.mix3(col, SOOT, 0.8 * k * k)
            out.append((col[0], col[1], col[2], 1.0))
    return out


# ----------------------------------------------------------------------------
# Materials, objects, export
# ----------------------------------------------------------------------------

def make_material(name, kind, rough=0.6, metal=0.0, colour=None, emission=1.0):
    """kind 'vc' (albedo from COLOR_0) or 'glow' (emissive colour)."""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = [n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0]
    m.use_backface_culling = True
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if kind == "glow":
        c = kit.hex_linear(colour or GLOW_HEX)
        bsdf.inputs["Base Color"].default_value = (*c, 1.0)
        bsdf.inputs["Emission Color"].default_value = (*c, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
        m.diffuse_color = (*c, 1.0)
    else:
        bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        vc = m.node_tree.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = COLOR_ATTR
        m.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def make_object(name, hs, mats, origin, colours, face_uvs=None):
    """Mesh object whose origin is the glTF point `origin`; box UVs unless face_uvs given."""
    ox, oy, oz = B(*origin)
    local = [(v[0] - ox, v[1] - oy, v[2] - oz) for v in hs.verts]
    me = bpy.data.meshes.new(name)
    me.from_pydata(local, [], list(hs.faces))
    me.update()
    if len(me.polygons) != len(hs.faces):
        raise RuntimeError(f"{name}: polygon count changed")
    used = sorted(set(hs.fmat))
    for m in used:
        me.materials.append(mats[m])
    remap = {m: i for i, m in enumerate(used)}
    me.polygons.foreach_set("material_index", [remap[m] for m in hs.fmat])
    me.polygons.foreach_set("use_smooth", [t == "smooth" for t in hs.ftag])
    uvs = []
    if face_uvs is not None:
        for corner_uv in face_uvs:
            for u, v in corner_uv:
                uvs += [u, 1.0 - v]
    else:
        for f in hs.faces:
            n = kit.face_normal(local, f)
            for i in f:
                x, y, z = local[i]
                u, v = kit.box_uv(x, z, -y, n.x, n.z, -n.y)
                uvs += [u, 1.0 - v]
    me.uv_layers.new(name="UVMap").data.foreach_set("uv", uvs)
    attr = me.color_attributes.new(name=COLOR_ATTR, type="FLOAT_COLOR", domain="CORNER")
    attr.data.foreach_set("color", [c for rgba in colours for c in rgba])
    me.color_attributes.active_color = attr
    obj = bpy.data.objects.new(name, me)
    obj.location = (ox, oy, oz)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_empty(name, origin):
    obj = bpy.data.objects.new(name, None)
    obj.location = B(*origin)
    obj.empty_display_type = "PLAIN_AXES"
    bpy.context.scene.collection.objects.link(obj)
    return obj


def export_glb(path, source):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, check_existing=False, export_format="GLB",
        export_copyright=f"Last Worlds - original procedural geometry (tools/blender/{source})",
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
        export_image_format="NONE", export_vertex_color="ACTIVE", export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True, export_attributes=False, export_cameras=False,
        export_lights=False, export_animations=False, export_skins=False, export_morph=False, export_yup=True,
        export_apply=False, export_extras=False, export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False, use_selection=False)


def publish(path, source, spec, label):
    """Export to a temporary file, verify, then move it into place (a failing build never
    overwrites the published file)."""
    tmp = path + ".tmp.glb"
    export_glb(tmp, source)
    problems = verify_glb(tmp, spec, label)
    if problems:
        os.remove(tmp)
        raise SystemExit(f"{label}: exported GLB failed verification")
    os.replace(tmp, path)
    print(f"{label} published {path} ({os.path.getsize(path)} bytes)")


# ----------------------------------------------------------------------------
# Verification of the exported GLB
# ----------------------------------------------------------------------------

def read_glb(path):
    data = open(path, "rb").read()
    jlen, = struct.unpack_from("<I", data, 12)
    gl = json.loads(data[20:20 + jlen])
    blen, = struct.unpack_from("<I", data, 20 + jlen)
    return data, gl, data[28 + jlen:28 + jlen + blen]


def verify_glb(path, spec, label):
    """spec: dict(materials=[...], max_bytes, total=(lo, hi) or None, nodes={name: rule}).

    rule keys: t (translation, default origin), budget, empty (bool), mats (allowed set),
    x / z (lo, hi) world ranges (inclusive), y_min_exact, y_max_exact, y_max, y_min,
    foot (fx, fz) centred-within footprint about the translation, uv ('box' | 'custom'),
    tile (axis 'x' | 'z', period) - seam vertices must match across the period.
    """
    data, gl, binc = read_glb(path)
    problems = []
    for key in ("textures", "images", "samplers", "cameras", "animations", "skins", "extensionsUsed"):
        if gl.get(key):
            problems.append(f"unexpected {key}")
    mats = [m["name"] for m in gl.get("materials", [])]
    if sorted(mats) != sorted(spec["materials"]):
        problems.append(f"materials {mats}")
    nodes = {gl["nodes"][i]["name"]: gl["nodes"][i] for i in gl["scenes"][0]["nodes"]}
    if sorted(nodes) != sorted(spec["nodes"]):
        problems.append(f"node names differ: extra {sorted(set(nodes) - set(spec['nodes']))}, "
                        f"missing {sorted(set(spec['nodes']) - set(nodes))}")

    def acc(i):
        a = gl["accessors"][i]
        bv = gl["bufferViews"][a["bufferView"]]
        comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        fmt = {5126: "f", 5123: "H", 5125: "I", 5121: "B"}[a["componentType"]]
        size = struct.calcsize(fmt)
        stride = bv.get("byteStride", size * comps)
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        vals = [struct.unpack_from("<" + fmt * comps, binc, off + k * stride) for k in range(a["count"])]
        if a.get("normalized") and fmt == "H":
            vals = [tuple(c / 65535.0 for c in v) for v in vals]
        return vals

    total = 0
    rows = []
    for name, node in sorted(nodes.items()):
        rule = spec["nodes"].get(name, {})
        t = node.get("translation", [0.0, 0.0, 0.0])
        want = rule.get("t", (0.0, 0.0, 0.0))
        if any(k in node for k in ("rotation", "scale", "matrix", "children")):
            problems.append(f"{name}: node has rotation/scale/children")
        if any(abs(a - b) > 1e-5 for a, b in zip(t, want)):
            problems.append(f"{name}: translation {t} != {want}")
        if rule.get("empty"):
            if "mesh" in node:
                problems.append(f"{name}: expected an empty")
            rows.append((name, 0, 0, t, None))
            continue
        if "mesh" not in node:
            problems.append(f"{name}: no mesh")
            continue
        pts, tris, pmats = [], 0, set()
        seam = {}
        for prim in gl["meshes"][node["mesh"]]["primitives"]:
            at = prim["attributes"]
            for key in ("COLOR_0", "TEXCOORD_0", "NORMAL"):
                if key not in at:
                    problems.append(f"{name}: missing {key}")
            pos, uv, nrm, col = acc(at["POSITION"]), acc(at["TEXCOORD_0"]), acc(at["NORMAL"]), acc(at["COLOR_0"])
            ind = [i[0] for i in acc(prim["indices"])]
            tris += len(ind) // 3
            pmats.add(gl["materials"][prim["material"]]["name"])
            pts += [(p[0] + t[0], p[1] + t[1], p[2] + t[2]) for p in pos]
            if rule.get("uv", "box") == "box":
                bad = 0
                for k in range(0, len(ind), 3):
                    a, b, c = (Vector(pos[ind[k + j]]) for j in range(3))
                    fn = (b - a).cross(c - a)
                    if fn.length < 1e-12:
                        continue
                    fn.normalize()
                    srt = sorted((abs(fn.x), abs(fn.y), abs(fn.z)))
                    if srt[2] - srt[1] < 0.02:
                        continue
                    for j in range(3):
                        vi = ind[k + j]
                        eu, ev = kit.box_uv(*pos[vi], fn.x, fn.y, fn.z)
                        if abs(eu - uv[vi][0]) > 2e-4 or abs(ev - uv[vi][1]) > 2e-4:
                            bad += 1
                            if bad <= 3:
                                print(f"{label} UVDEBUG {name} p={tuple(round(c, 3) for c in pos[vi])} "
                                      f"n={tuple(round(c, 3) for c in fn)} uv={uv[vi]} want={(eu, ev)}")
                if bad:
                    problems.append(f"{name}: {bad} UVs off the box projection")
            if "tile" in rule:
                axis, period = rule["tile"]
                ti = 0 if axis == "x" else 2
                oa, ob = [k for k in range(3) if k != ti]
                for vi, p in enumerate(pos):
                    if abs(abs(p[ti]) - period * 0.5) < 1e-5:
                        key = (round(p[oa], 5), round(p[ob], 5), tuple(round(c, 4) for c in nrm[vi]),
                               tuple(round(c, 3) for c in col[vi][:3]))
                        seam.setdefault(key, set()).add(1 if p[ti] > 0 else -1)
        total += tris
        xs, ys, zs = [p[0] for p in pts], [p[1] for p in pts], [p[2] for p in pts]
        if tris > rule.get("budget", 10 ** 9):
            problems.append(f"{name}: {tris} tris > {rule['budget']}")
        if "mats" in rule and not pmats <= set(rule["mats"]):
            problems.append(f"{name}: materials {sorted(pmats)} not in {sorted(rule['mats'])}")
        for key, vals in (("x", xs), ("z", zs)):
            if key in rule:
                lo, hi = rule[key]
                if min(vals) < lo - 1e-5 or max(vals) > hi + 1e-5:
                    problems.append(f"{name}: {key} [{min(vals):.3f},{max(vals):.3f}] outside [{lo},{hi}]")
        if "foot" in rule:
            fx, fz = rule["foot"]
            if max(abs(min(xs) - t[0]), abs(max(xs) - t[0])) > fx / 2 + 1e-5 or \
                    max(abs(min(zs) - t[2]), abs(max(zs) - t[2])) > fz / 2 + 1e-5:
                problems.append(f"{name}: footprint exceeds {fx} x {fz}")
        if "y_min_exact" in rule and abs(min(ys) - rule["y_min_exact"]) > 1e-5:
            problems.append(f"{name}: lowest y {min(ys):.5f} != {rule['y_min_exact']}")
        if "y_max_exact" in rule and abs(max(ys) - rule["y_max_exact"]) > 1e-5:
            problems.append(f"{name}: top y {max(ys):.5f} != {rule['y_max_exact']}")
        if "y_max" in rule and max(ys) > rule["y_max"] + 1e-5:
            problems.append(f"{name}: top y {max(ys):.4f} > {rule['y_max']}")
        if "y_min" in rule and min(ys) < rule["y_min"] - 1e-5:
            problems.append(f"{name}: lowest y {min(ys):.4f} < {rule['y_min']}")
        if "tile" in rule:
            unmatched = [k for k, v in seam.items() if v != {-1, 1}]
            if unmatched or not seam:
                problems.append(f"{name}: tiling seam mismatch ({len(unmatched)} of {len(seam)})")
        rows.append((name, tris, rule.get("budget", 0), t, (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))))
    print(f"{label} VERIFY node                           tris/budget  translation            x[min,max]       y[min,max]       z[min,max]")
    for name, tris, budget, t, b in rows:
        if b is None:
            print(f"{label} VERIFY {name:30s} (empty)       ({t[0]:+.2f},{t[1]:+.2f},{t[2]:+.2f})")
            continue
        print(f"{label} VERIFY {name:30s} {tris:5d}/{budget:<5d}  ({t[0]:+.2f},{t[1]:+.2f},{t[2]:+.2f})  "
              f"[{b[0]:+.2f},{b[1]:+.2f}]  [{b[2]:+.2f},{b[3]:+.2f}]  [{b[4]:+.2f},{b[5]:+.2f}]")
    if spec.get("total") and not spec["total"][0] <= total <= spec["total"][1]:
        problems.append(f"total tris {total} outside {spec['total']}")
    if len(data) > spec.get("max_bytes", 2_000_000):
        problems.append(f"file size {len(data)} > {spec.get('max_bytes', 2_000_000)}")
    print(f"{label} VERIFY total {total} tris, size={len(data)} bytes, materials={mats}, problems={len(problems)}")
    for p in problems:
        print(f"{label} VERIFY PROBLEM {p}")
    return problems


# ----------------------------------------------------------------------------
# Preview helpers (not part of any runtime asset)
# ----------------------------------------------------------------------------

VESPER_SUN = (0.55, -0.38, -0.82)      # high, pale sun from the upper left, slightly behind


def preview_world(scene, sun_strength=3.4):
    kit.add_sun(VESPER_SUN, strength=sun_strength, color=(0.97, 0.98, 1.0), angle_deg=2.0)
    kit.setup_world(scene, (0.5, 0.64, 0.84), 1.0)        # cool sky: blue shadows


def setup_render(scene, engine, samples, w, h, exposure=0.35):
    kit.setup_render(scene, engine, samples, w, h)
    scene.view_settings.exposure = exposure


def noise_material(name, c0, c1, scale, rough, bump=0.0, metal=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 5.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (*kit.hex_linear(c0), 1.0)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (*kit.hex_linear(c1), 1.0)
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if bump:
        bn = nt.nodes.new("ShaderNodeBump")
        bn.inputs["Strength"].default_value = bump
        tex2 = nt.nodes.new("ShaderNodeTexNoise")
        tex2.inputs["Scale"].default_value = scale * 6.0
        nt.links.new(tex2.outputs["Fac"], bn.inputs["Height"])
        nt.links.new(bn.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def preview_materials():
    pm = kit.preview_materials()
    pm["snow"] = noise_material("preview_snow", "#b9c8d8", "#e9eef3", 1.6, 0.8, bump=0.08)
    pm["ocean"] = noise_material("preview_ocean", "#0d3557", "#1f6a8f", 0.6, 0.08, bump=0.25)
    pm["seabed"] = noise_material("preview_seabed", "#06182a", "#0d3557", 0.5, 0.9)
    pm["sheet_snow"] = noise_material("preview_sheet_snow", "#c7d3df", "#dfe7ee", 1.2, 0.85)
    lab = bpy.data.materials.new("preview_label_dark")
    lab.diffuse_color = (0.05, 0.07, 0.1, 1.0)
    try:
        lab.use_nodes = True
    except Exception:
        pass
    bsdf = [n for n in lab.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0]
    bsdf.inputs["Base Color"].default_value = (0.03, 0.05, 0.08, 1.0)
    pm["label_dark"] = lab
    return pm


def plane(name, x0, x1, y0, y1, z, mat):
    return kit.plane_obj(name, x0, x1, y0, y1, z, mat)


def contact_sheet(objs, layout, pm, path, engine, samples, ground="sheet_snow", water=None, cam=(0.0, 0.0, 0.4),
                  ortho=14.0, res=(1800, 1500), label_size=0.13):
    """layout: list of (name, x, y, label_dy). Ground plane at z = 0 (snow) or ocean at water z."""
    scene = bpy.context.scene
    for name, x, y, dy in layout:
        kit.instance("sheet_" + name, objs[name], (x, y, 0.0))
        kit.text_label(name, (x, y - dy, 0.012), label_size, pm["label"])
    if water is not None:
        plane("sheet_ocean", -30, 30, -30, 30, water, pm["ocean"])
    else:
        plane("sheet_ground", -30, 30, -30, 30, 0.0, pm[ground])
    preview_world(scene)
    kit.add_ortho_camera(cam, 55.0, ortho)
    setup_render(scene, engine, samples, *res)
    kit.render(path)
