"""Shared pipeline for the Nacre enemy craft (nacre_craft.py) and THE VEIL (the_veil.py).

Builds on vesper_common.py (HS hard-surface builder, box UVs, glTF export) and adds what the Nacre
design language needs: swept blades with sharp lens sections, crescents, organic honeycomb lattices
with real cut-outs, framed polyhedra, segmented rings, and an iridescent nacre bake into COLOR_0.

Geometry is authored in DESIGN space: x right, y forward (toward the player, glTF +Z), z up
(glTF +Y). `to_blender` converts a finished piece to Blender space (x, -y, z), reversing faces.
Sockets are given in glTF coordinates (x, y up, z toward the player).
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
from mathutils import Euler, Matrix, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import khepri_kit as kit  # noqa: E402
import vesper_common as vc  # noqa: E402
from vesper_common import HS, merge_hs, xform, B  # noqa: E402,F401

SHELL, BLADE, FRAME, BRONZE, TEAL, AMBER = range(6)
MAT_NAMES = ("nacre_shell", "nacre_blade", "nacre_frame", "nacre_bronze", "nacre_glow_teal", "nacre_glow_amber")
TEAL_HEX = "#3ff2d8"
AMBER_HEX = "#ffa040"
GLOWS = {TEAL, AMBER}

# Flat paints: name -> (albedo sRGB hex, edge-wear amount, wear hex).
PAINTS = {
    "frame": ("#0e0f15", 0.55, "#2e3448"),        # black chitin; edges catch a cold violet sheen
    "frame_dk": ("#08090d", 0.4, "#1d2130"),
    "frame_teal": ("#0b1519", 0.55, "#1f4a50"),   # chitin near the glows
    "bronze": ("#5e4329", 0.6, "#b48a58"),
    "bronze_dk": ("#3a2a1c", 0.5, "#8a6640"),
    "char": ("#121115", 0.25, "#2b2830"),
    "burnt": ("#2a1d27", 0.3, "#4b3a48"),
}
# Iridescent ramps (sRGB), sampled by a hue parameter that follows the surface normal and position.
RAMPS = {
    # violet -> blue -> teal -> blue-violet -> faint pink: the nacre shell plates
    "shell": [(0.0, "#463a8e"), (0.17, "#5747b0"), (0.34, "#3f5cb6"), (0.5, "#3b86a8"), (0.62, "#4a6abb"),
              (0.78, "#7556b2"), (0.9, "#a47bb6"), (1.0, "#463a8e")],
    # deep version for undersides, recesses and wrecks
    "shell_dk": [(0.0, "#2a2358"), (0.3, "#262f66"), (0.55, "#22485a"), (0.8, "#3e2f66"), (1.0, "#2a2358")],
    # pale pearl: lilac, ice blue, mint, peach, pink (shard plates, pearl panes)
    "pearl": [(0.0, "#b7a6e0"), (0.22, "#a3c0ea"), (0.42, "#a6dacd"), (0.6, "#e2c1a6"), (0.8, "#d9acd6"),
              (1.0, "#b7a6e0")],
    # pale silver-lilac blades with a faint rainbow sheen
    "blade": [(0.0, "#b9b2d6"), (0.28, "#a9b8d8"), (0.52, "#b1c9cc"), (0.76, "#c8b6d2"), (1.0, "#b9b2d6")],
    "blade_dk": [(0.0, "#8b86a8"), (0.4, "#7f8aa6"), (0.7, "#8a97a0"), (1.0, "#8b86a8")],
}


def ramp(stops, h):
    h = h % 1.0
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t0 <= h <= t1:
            k = (h - t0) / (t1 - t0) if t1 > t0 else 0.0
            a, b = kit.hex_linear(c0), kit.hex_linear(c1)
            return kit.mix3(a, b, k)
    return kit.hex_linear(stops[-1][1])


# ----------------------------------------------------------------------------
# Small vector helpers
# ----------------------------------------------------------------------------

def V(*a):
    if len(a) == 1:
        return Vector(a[0])
    return Vector(a)


def lerp(a, b, t):
    return a + (b - a) * t


def bez(ctrl, t):
    """Bezier point (cubic for 4 control points, quadratic for 3)."""
    u = 1.0 - t
    if len(ctrl) == 3:
        return ctrl[0] * (u * u) + ctrl[1] * (2 * u * t) + ctrl[2] * (t * t)
    return ctrl[0] * (u * u * u) + ctrl[1] * (3 * u * u * t) + ctrl[2] * (3 * u * t * t) + ctrl[3] * (t * t * t)


def bez_pts(ctrl, n):
    ctrl = [Vector(c) for c in ctrl]
    return [bez(ctrl, k / (n - 1)) for k in range(n)]


def newell(pts):
    n = Vector((0.0, 0.0, 0.0))
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


def raw_face(hs, idx, paint, tag, mat):
    """Append a face with its winding as given (no re-orientation); drop repeated corners."""
    out = []
    for i in idx:
        p = hs.verts[i]
        if out and (Vector(hs.verts[out[-1]]) - Vector(p)).length < 1e-9:
            continue
        out.append(i)
    if len(out) > 2 and (Vector(hs.verts[out[0]]) - Vector(hs.verts[out[-1]])).length < 1e-9:
        out.pop()
    if len(out) < 3:
        return
    if newell([Vector(hs.verts[i]) for i in out]).length < 1e-12:
        return
    hs.faces.append(tuple(out))
    hs.fmat.append(mat)
    hs.fpaint.append(paint)
    hs.ftag.append(tag)


def per_strip(val, n, k):
    return val[k] if isinstance(val, (list, tuple)) else val


# ----------------------------------------------------------------------------
# Sweep: closed sections lofted along a path (rings or apex points)
# ----------------------------------------------------------------------------

def sweep(hs, rings, paint, mat, tags="main", cap0=True, cap1=True, closed=False, cap_tag="edge"):
    """rings: list of rings (lists of Vectors with the same count n) or single Vectors (apex points).

    Each section strip (point k to k+1) gets its own vertices, so 'smooth' strips blend along the sweep
    but corners across the section stay sharp. Rings are re-ordered (all together) to wind around the
    sweep direction; faces then point outward by winding. paint / mat / tags may be per-strip lists.
    """
    rings = [[Vector(p) for p in r] if isinstance(r, (list, tuple)) and not isinstance(r[0], (int, float))
             else Vector(r) for r in rings]
    m = len(rings)
    n = max(len(r) for r in rings if isinstance(r, list))
    cen = [sum(r, Vector()) / len(r) if isinstance(r, list) else r for r in rings]
    best, bw = 0, -1.0
    for i, r in enumerate(rings):
        if isinstance(r, list):
            w = newell(r).length
            if w > bw:
                bw, best = w, i
    if closed:
        t = cen[(best + 1) % m] - cen[(best - 1) % m]
    else:
        t = cen[min(best + 1, m - 1)] - cen[max(best - 1, 0)]
    paints = [per_strip(paint, n, k) for k in range(n)]
    mats = [per_strip(mat, n, k) for k in range(n)]
    tgs = [per_strip(tags, n, k) for k in range(n)]
    if newell(rings[best]).dot(t) < 0:
        rings = [list(reversed(r)) if isinstance(r, list) else r for r in rings]
        # new strip j joins new points j, j+1 = old points n-1-j, n-2-j = old strip n-2-j
        remap = [(n - 2 - j) % n for j in range(n)]
        paints = [paints[i] for i in remap]
        mats = [mats[i] for i in remap]
        tgs = [tgs[i] for i in remap]
    pairs = [(i, i + 1) for i in range(m - 1)] + ([(m - 1, 0)] if closed else [])
    for k in range(n):
        j = (k + 1) % n
        col = []
        for r in rings:
            if isinstance(r, list):
                col.append((hs.v(r[k]), hs.v(r[j])))
            else:
                col.append((hs.v(r),))
        for a, b in pairs:
            A, Bc = col[a], col[b]
            if len(A) == 2 and len(Bc) == 2:
                idx = (A[0], A[1], Bc[1], Bc[0])
            elif len(A) == 2:
                idx = (A[0], A[1], Bc[0])
            elif len(Bc) == 2:
                idx = (A[0], Bc[1], Bc[0])
            else:
                continue
            raw_face(hs, idx, paints[k], tgs[k], mats[k])
    if not closed:
        cp = paints[0]
        cm = mats[0]
        if cap0 and isinstance(rings[0], list):
            raw_face(hs, tuple(hs.v(p) for p in reversed(rings[0])), cp, cap_tag, cm)
        if cap1 and isinstance(rings[-1], list):
            raw_face(hs, tuple(hs.v(p) for p in rings[-1]), cp, cap_tag, cm)


def frames_along(pts, up_hint=(0.0, 0.0, 1.0)):
    """Rotation-minimising-ish frames along a polyline: (tangent, side, up) per point."""
    out = []
    upv = Vector(up_hint)
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        t = (b - a).normalized()
        side = t.cross(upv)
        if side.length < 1e-6:
            side = t.orthogonal()
        side.normalize()
        up = side.cross(t).normalized()
        out.append((t, side, up))
        upv = up
    return out


def tube(hs, pts, radii, paint, mat, seg=6, tags="main", up_hint=(0.0, 0.0, 1.0), apex_end=False,
         apex_start=False, squash=1.0, rot=0.0, cap0=True, cap1=True):
    """Polygonal tube along a polyline; radii per point (or one value). apex_end tapers to a point."""
    pts = [Vector(p) for p in pts]
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(pts)
    fr = frames_along(pts, up_hint)
    rings = []
    for i, (p, r, (t, s, u)) in enumerate(zip(pts, radii, fr)):
        if (apex_end and i == len(pts) - 1) or (apex_start and i == 0) or r <= 0.0:
            rings.append(p)
            continue
        rings.append([p + s * (math.cos(rot + 2 * math.pi * k / seg) * r) +
                      u * (math.sin(rot + 2 * math.pi * k / seg) * r * squash) for k in range(seg)])
    sweep(hs, rings, paint, mat, tags=tags, cap0=cap0, cap1=cap1)


def section_sweep(hs, pts, section_fn, paint, mat, tags="main", up_hint=(0.0, 0.0, 1.0), ups=None, cap0=True,
                  cap1=True, closed=False):
    """Sweep along a polyline; section_fn(i, t) returns a list of (side, up) offsets or None (apex)."""
    pts = [Vector(p) for p in pts]
    fr = frames_along(pts, up_hint)
    rings = []
    m = len(pts)
    for i, p in enumerate(pts):
        t, s, u = fr[i]
        if ups is not None:
            u = Vector(ups[i]).normalized()
            s = t.cross(u).normalized()
            u = s.cross(t).normalized()
        sec = section_fn(i, i / (m - 1) if m > 1 else 0.0)
        if sec is None:
            rings.append(p)
        else:
            rings.append([p + s * a + u * b for a, b in sec])
    sweep(hs, rings, paint, mat, tags=tags, cap0=cap0, cap1=cap1, closed=closed)


# ----------------------------------------------------------------------------
# Blades
# ----------------------------------------------------------------------------

def band(hs, edge_a, edge_b, thick, ups, paint, mat, ridge=0.5, under=0.55, tags="smooth", edge_tag="edge",
         apex_tip=True, cap0=True, facets=False):
    """Blade band between two edge curves (same point count, root -> tip).

    Section: edge_a, top ridge, edge_b, bottom ridge (a sharp lens). With facets=True the top gets two
    extra shoulders for a faceted, machined look. When the last points of both edges coincide the tip is
    an apex. thick: per-point ridge thickness (list) or callable(t).
    """
    m = len(edge_a)
    rings = []
    for i in range(m):
        t = i / (m - 1)
        a, b = Vector(edge_a[i]), Vector(edge_b[i])
        th = thick(t) if callable(thick) else (thick[i] if isinstance(thick, (list, tuple)) else thick)
        up = Vector(ups[i] if isinstance(ups, (list, tuple)) and not isinstance(ups[0], (int, float)) else ups)
        up.normalize()
        if (a - b).length < 1e-6 and i == m - 1 and apex_tip:
            rings.append(a)
            continue
        r = lerp(a, b, ridge)
        if facets:
            s1 = lerp(a, b, ridge * 0.45) + up * (th * 0.7)
            s2 = lerp(a, b, ridge + (1 - ridge) * 0.55) + up * (th * 0.7)
            rings.append([a, s1, r + up * th, s2, b, r - up * (th * under)])
        else:
            rings.append([a, r + up * th, b, r - up * (th * under)])
    if facets:
        tg = [edge_tag, tags, tags, edge_tag, tags, tags]
    else:
        tg = [tags, tags, tags, tags]
    sweep(hs, rings, paint, mat, tags=tg, cap0=cap0, cap1=True)


def crescent(hs, outer_ctrl, inner_ctrl, n, thick, up, paint, mat, ridge=0.42, facets=True, lift=None,
             tags="smooth"):
    """Crescent blade from two Bezier edges sharing the tip. lift(t) adds height along the blade."""
    oa = bez_pts(outer_ctrl, n)
    ia = bez_pts(inner_ctrl, n)
    if lift is not None:
        for k in range(n):
            dz = lift(k / (n - 1))
            oa[k] = oa[k] + Vector((0, 0, dz))
            ia[k] = ia[k] + Vector((0, 0, dz))
    band(hs, oa, ia, thick, up, paint, mat, ridge=ridge, facets=facets, tags=tags)
    return oa, ia


def shard_plate(hs, outline, ridge_up, ridge_dn, paint, mat, centre=None, tag="main"):
    """Crystal plate: razor edges on the outline, a raised centre on top and a lowered one beneath.
    outline: list of 3D points (roughly planar, CCW seen from above)."""
    pts = [Vector(p) for p in outline]
    c = Vector(centre) if centre is not None else sum(pts, Vector()) / len(pts)
    nrm = newell(pts).normalized()
    if nrm.z < 0:
        nrm = -nrm
    top, bot = c + nrm * ridge_up, c - nrm * ridge_dn
    n = len(pts)
    for k in range(n):
        a, b = pts[k], pts[(k + 1) % n]
        hs.face((hs.v(a), hs.v(b), hs.v(top)), paint, tag, mat, outward=tuple(nrm))
        hs.face((hs.v(b), hs.v(a), hs.v(bot)), paint, tag, mat, outward=tuple(-nrm))


def glow_line(hs, pts, ups, w, h, mat, paint="lamp"):
    """Thin glowing strip along a polyline, standing h above the surface (flat rectangular section)."""
    def sec(i, t):
        return [(-w * 0.5, -h * 0.4), (w * 0.5, -h * 0.4), (w * 0.5, h), (-w * 0.5, h)]
    section_sweep(hs, pts, sec, paint, mat, tags="main", ups=ups)


# ----------------------------------------------------------------------------
# Open crescent: outer band, lattice window, inner band
# ----------------------------------------------------------------------------

def window(t, ta, tb, power=0.7):
    if t <= ta or t >= tb:
        return 0.0
    return math.sin(math.pi * (t - ta) / (tb - ta)) ** power


def open_crescent(hs, rng, outer_ctrl, inner_ctrl, n, thick_o, thick_i, ta, tb, hw, lift, paints, cells, lat_th,
                  vc_=0.48, glow_rim=None):
    """Crescent blade with an open lattice window between an outer and an inner band.
    paints: (outer paint, outer mat, inner paint, inner mat). Returns (outer edge, inner edge) samples."""
    O = bez_pts(outer_ctrl, n)
    I = bez_pts(inner_ctrl, n)
    for k in range(n):
        dz = lift(k / (n - 1))
        O[k] += Vector((0, 0, dz))
        I[k] += Vector((0, 0, dz))
    ts = [k / (n - 1) for k in range(n)]
    v0 = [vc_ - hw * window(t, ta, tb) for t in ts]
    v1 = [vc_ + hw * window(t, ta, tb) for t in ts]
    # beyond the window the outer band widens to cover the whole blade
    for k, t in enumerate(ts):
        if t >= tb:
            v0[k] = vc_ + (1.0 - vc_) * min(1.0, (t - tb) / max(1e-6, (1.0 - tb) * 0.5))
    M1 = [lerp(O[k], I[k], v0[k]) for k in range(n)]
    M2 = [lerp(O[k], I[k], v1[k]) for k in range(n)]
    ups = []
    for k in range(n):
        a = O[min(k + 1, n - 1)] - O[max(k - 1, 0)]
        b = I[k] - O[k]
        u = a.cross(b) if b.length > 1e-6 else Vector((0, 0, 1))
        if u.length < 1e-9:
            u = Vector((0, 0, 1))
        u.normalize()
        if u.z < 0:
            u = -u
        ups.append(u)
    band(hs, O, M1, lambda t: thick_o * (1.0 - t) ** 0.7 + 0.002, ups, paints[0], paints[1], ridge=0.4,
         facets=True)
    kb = max(k for k, t in enumerate(ts) if t <= tb)
    band(hs, M2[:kb + 1], I[:kb + 1], [thick_i] * (kb + 1), ups[:kb + 1], paints[2], paints[3], ridge=0.55,
         facets=False, apex_tip=False)
    # lattice web in the window
    ka = min(k for k, t in enumerate(ts) if t >= ta)
    A = M1[ka:kb + 1]
    Bc = M2[ka:kb + 1]
    if len(A) >= 2:
        surf = patch_between(A, Bc)
        lattice(hs, surf, cells[0], cells[1], lat_th, "frame", FRAME, hole=0.62, rng=rng)
    if glow_rim:
        pts = [lerp(M2[k], I[k], 0.45) + ups[k] * (thick_i * 0.75) for k in range(ka, kb + 1)]
        glow_line(hs, pts, ups[ka:kb + 1], glow_rim, 0.003, TEAL)
    return O, I


# ----------------------------------------------------------------------------
# Lattice: organic honeycomb with real cut-outs on a parametric patch
# ----------------------------------------------------------------------------

def patch_between(curve_a, curve_b, up=(0.0, 0.0, 1.0)):
    """surf(u, v) between two sampled curves (lists of Vectors, same count). Returns (point, normal)."""
    A = [Vector(p) for p in curve_a]
    Bv = [Vector(p) for p in curve_b]
    n = len(A)
    upv = Vector(up)

    def at(lst, u):
        x = u * (n - 1)
        i = min(int(x), n - 2)
        f = x - i
        return lerp(lst[i], lst[i + 1], f)

    def surf(u, v):
        a, b = at(A, u), at(Bv, u)
        p = lerp(a, b, v)
        du = (at(A, min(u + 0.01, 1.0)) - at(A, max(u - 0.01, 0.0))) + (at(Bv, min(u + 0.01, 1.0)) - at(Bv, max(u - 0.01, 0.0)))
        dv = b - a
        nrm = du.cross(dv)
        if nrm.length < 1e-9:
            nrm = upv.copy()
        nrm.normalize()
        if nrm.dot(upv) < 0:
            nrm = -nrm
        return p, nrm
    return surf


def lattice(hs, surf, nu, nv, thick, paint, mat, hole=0.6, vmin=None, vmax=None, sag=0.35, aspect=1.0,
            solid_rim=False, glow_holes=None, rng=None):
    """Honeycomb web on surf(u, v) (u, v in [0, 1]); nu cells along u, nv rows along v.

    vmin(u)/vmax(u) optionally pinch the patch (cells are clamped into [vmin, vmax]). Web nodes sit at the
    cell corners; each hole is rotated toward the edge midpoints, so webs are thick at nodes and thin
    between (bone-like). Builds the top surface and the hole walls only (the underside is not seen from
    the game camera). glow_holes: optional (mat, fraction) to fill some holes with a recessed glow pane.
    """
    sq3 = math.sqrt(3.0)
    W = nu * sq3
    H = max(nv - 1, 1) * 1.5
    corners = [(math.cos(math.radians(30 + 60 * k)), math.sin(math.radians(30 + 60 * k))) for k in range(6)]

    def uv_of(X, Y):
        u = min(max(X / W, 0.0), 1.0)
        v = min(max(Y / H, 0.0), 1.0)
        lo = vmin(u) if vmin else 0.0
        hi = vmax(u) if vmax else 1.0
        return u, lo + (hi - lo) * v

    for j in range(nv):
        for i in range(-1, nu + 1):
            cx = (i + 0.5 + (0.5 if j % 2 else 0.0)) * sq3
            cy = j * 1.5
            if cx + sq3 * 0.5 < 0 or cx - sq3 * 0.5 > W:
                continue
            uvs = []
            for (dx, dy) in corners:
                uv = uv_of(cx + dx, cy + dy)
                if not uvs or abs(uv[0] - uvs[-1][0]) + abs(uv[1] - uvs[-1][1]) > 1e-6:
                    uvs.append(uv)
            if len(uvs) > 2 and abs(uvs[0][0] - uvs[-1][0]) + abs(uvs[0][1] - uvs[-1][1]) < 1e-6:
                uvs.pop()
            if len(uvs) < 3:
                continue
            P = [surf(u, v) for u, v in uvs]
            pts = [p for p, _n in P]
            cpt = sum(pts, Vector()) / len(pts)
            nrm = sum((nn for _p, nn in P), Vector()).normalized()
            area = newell(pts).length * 0.5
            m = len(pts)
            # mean edge length vs area: skip holes in slivers
            per = sum((pts[(k + 1) % m] - pts[k]).length for k in range(m))
            has_hole = m >= 4 and area > 0 and (4 * math.pi * area / (per * per)) > 0.45
            topn = [p + nn * (thick * 0.5) for p, nn in P]
            if not has_hole:
                hs.face(tuple(hs.v(p) for p in topn), paint, "main", mat, outward=tuple(nrm))
                continue
            mids = [lerp(pts[k], pts[(k + 1) % m], 0.5) for k in range(m)]
            hole_top = [cpt + (mp - cpt) * hole + nrm * (thick * (0.5 - sag)) for mp in mids]
            hole_bot = [cpt + (mp - cpt) * hole - nrm * (thick * 0.5) for mp in mids]
            for k in range(m):
                k1 = (k + 1) % m
                hs.face((hs.v(topn[k]), hs.v(topn[k1]), hs.v(hole_top[k])), paint, "main", mat, outward=tuple(nrm))
                hs.face((hs.v(topn[k1]), hs.v(hole_top[k1]), hs.v(hole_top[k])), paint, "main", mat,
                        outward=tuple(nrm))
                wm = (hole_top[k] + hole_top[k1] + hole_bot[k] + hole_bot[k1]) * 0.25
                hs.face((hs.v(hole_top[k]), hs.v(hole_top[k1]), hs.v(hole_bot[k1]), hs.v(hole_bot[k])), paint,
                        "edge", mat, outward=tuple(cpt - wm))
            if glow_holes and rng is not None and rng.random() < glow_holes[1]:
                pane = [cpt + (mp - cpt) * hole * 1.02 - nrm * (thick * 0.3) for mp in mids]
                hs.face(tuple(hs.v(p) for p in pane), "lamp", "main", glow_holes[0], outward=tuple(nrm))


# ----------------------------------------------------------------------------
# Polyhedra and rings
# ----------------------------------------------------------------------------

def icosahedron():
    t = (1.0 + math.sqrt(5.0)) / 2.0
    vs = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
          (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    vs = [Vector(v).normalized() for v in vs]
    fs = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6),
          (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10),
          (8, 6, 7), (9, 8, 1)]
    return vs, fs


def bipyramid(n, h_top, h_bot):
    vs = [Vector((math.cos(2 * math.pi * k / n), math.sin(2 * math.pi * k / n), 0.0)) for k in range(n)]
    vs += [Vector((0, 0, h_top)), Vector((0, 0, -h_bot))]
    fs = [(k, (k + 1) % n, n) for k in range(n)] + [((k + 1) % n, k, n + 1) for k in range(n)]
    return vs, fs


def framed_poly(hs, verts, faces, m, inset, depth, frame_paint, frame_mat, pane_paint, pane_mat,
                pane_choice=None):
    """Polyhedron with a raised black frame along every edge and recessed panes (glow or pearl).
    verts are transformed by the 4x4 matrix m. pane_choice(fi) -> (paint, mat) overrides the pane."""
    P = [m @ Vector(v) for v in verts]
    centre = sum(P, Vector()) / len(P)
    for fi, f in enumerate(faces):
        O = [P[i] for i in f]
        c = sum(O, Vector()) / len(O)
        nrm = newell(O).normalized()
        if nrm.dot(c - centre) < 0:
            nrm = -nrm
        I = [c + (o - c) * (1.0 - inset) for o in O]
        Ip = [p - nrm * depth for p in I]
        k_n = len(O)
        for k in range(k_n):
            k1 = (k + 1) % k_n
            hs.face((hs.v(O[k]), hs.v(O[k1]), hs.v(I[k1]), hs.v(I[k])), frame_paint, "edge", frame_mat,
                    outward=tuple(nrm))
            wm = (I[k] + I[k1] + Ip[k] + Ip[k1]) * 0.25
            hs.face((hs.v(I[k]), hs.v(I[k1]), hs.v(Ip[k1]), hs.v(Ip[k])), frame_paint, "main", frame_mat,
                    outward=tuple(c - wm))
        pp, pmat = pane_choice(fi) if pane_choice else (pane_paint, pane_mat)
        hs.face(tuple(hs.v(p) for p in Ip), pp, "main", pmat, outward=tuple(nrm))


def poly_solid(hs, verts, faces, m, paint, mat, tag="main"):
    P = [m @ Vector(v) for v in verts]
    centre = sum(P, Vector()) / len(P)
    for f in faces:
        O = [P[i] for i in f]
        c = sum(O, Vector()) / len(O)
        hs.face(tuple(hs.v(p) for p in O), paint, tag, mat, outward=tuple(c - centre))


def arc_band(hs, r, w, h, a0, a1, seg, paint, mat, ch=0.012, m=None, tags=None, r_out=None, full=False):
    """Ring segment (arc a0..a1 radians, about z) with a rectangular section of radial width w and height h,
    top edges chamfered by ch (all edges with full=True); smooth along the arc. Transformed by matrix m."""
    m = m or Matrix.Identity(4)
    hw, hh = w * 0.5, h * 0.5
    ch = min(ch, hw * 0.4, hh * 0.4)
    if ch <= 0:
        sec = [(hw, -hh), (hw, hh), (-hw, hh), (-hw, -hh)]
        tg = ["smooth"] * 4
    elif full:
        sec = [(hw, -hh + ch), (hw, hh - ch), (hw - ch, hh), (-hw + ch, hh), (-hw, hh - ch), (-hw, -hh + ch),
               (-hw + ch, -hh), (hw - ch, -hh)]
        tg = ["smooth", "edge", "smooth", "edge", "smooth", "edge", "smooth", "edge"]
    else:
        sec = [(hw, -hh), (hw, hh - ch), (hw - ch, hh), (-hw + ch, hh), (-hw, hh - ch), (-hw, -hh)]
        tg = ["smooth", "edge", "smooth", "edge", "smooth", "smooth"]
    if tags is not None:
        tg = tags
    closed = abs((a1 - a0) - 2 * math.pi) < 1e-9
    rings = []
    steps = seg if closed else seg + 1
    for k in range(steps):
        a = a0 + (a1 - a0) * k / seg
        rr = r if r_out is None else lerp(r, r_out, k / seg)
        d = Vector((math.cos(a), math.sin(a), 0.0))
        rings.append([m @ (d * (rr + s_) + Vector((0, 0, z))) for s_, z in sec])
    sweep(hs, rings, paint, mat, tags=tg, closed=closed)


def disc(hs, c, axis, r, seg, paint, mat, r_in=0.0):
    """Flat disc or annulus facing axis."""
    a = Vector(axis).normalized()
    t1 = a.orthogonal().normalized()
    t2 = a.cross(t1)
    c = Vector(c)
    outer = [c + (t1 * math.cos(2 * math.pi * k / seg) + t2 * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)]
    if r_in <= 0:
        hs.face(tuple(hs.v(p) for p in outer), paint, "main", mat, outward=tuple(a))
        return
    inner = [c + (p - c) * (r_in / r) for p in outer]
    for k in range(seg):
        j = (k + 1) % seg
        hs.face((hs.v(outer[k]), hs.v(outer[j]), hs.v(inner[j]), hs.v(inner[k])), paint, "main", mat,
                outward=tuple(a))


def transformed(src, m):
    out = HS(src.rng)
    merge_hs(out, src, m)
    return out


def mirror_x(src):
    """Mirror a piece across x = 0 (faces reversed to stay outward)."""
    out = HS(src.rng)
    for v in src.verts:
        out.verts.append([-v[0], v[1], v[2]])
    out.faces = [tuple(reversed(f)) for f in src.faces]
    out.fmat, out.fpaint, out.ftag = list(src.fmat), list(src.fpaint), list(src.ftag)
    return out


def flipped(src):
    """Same piece with every face reversed (inward-facing walls, e.g. the inside of an opening)."""
    out = HS(src.rng)
    out.verts = [list(v) for v in src.verts]
    out.faces = [tuple(reversed(f)) for f in src.faces]
    out.fmat, out.fpaint, out.ftag = list(src.fmat), list(src.fpaint), list(src.ftag)
    return out


def append(dst, src):
    merge_hs(dst, src, Matrix.Identity(4))


def to_blender(hs):
    """Design space (x, y forward, z up) -> Blender (x, -y, z); faces reversed (reflection)."""
    for v in hs.verts:
        v[1] = -v[1]
    hs.faces = [tuple(reversed(f)) for f in hs.faces]
    if hasattr(hs, "scorch"):
        hs.scorch = [((c[0], -c[1], c[2]), r) for c, r in hs.scorch]
    return hs


def D(gx, gy, gz):
    """glTF (x, y up, z toward the player) -> design (x, forward, up)."""
    return Vector((gx, gz, gy))


# ----------------------------------------------------------------------------
# Bake: AO, edge wear and the iridescent nacre sheen into linear COLOR_0
# ----------------------------------------------------------------------------

AO_DIRS = kit.hemisphere_dirs(40)


def bake(hs, name, glow=GLOWS, ao_dist=0.3, ground=None, context=(), scale=1.0, sheen=1.0, paints=None, dust=None):
    """Per-corner linear RGBA (hs in Blender space). Iridescent paints 'shell', 'pearl', 'blade' (and _dk),
    optionally with a ':seed' suffix per plate, follow a hue parameter driven by the (smoothed) normal and
    position; flat paints come from PAINTS. scale: spatial frequency of the hue drift (1 for ~1 unit craft)."""
    verts = [Vector(v) for v in hs.verts]
    all_v, polys = list(verts), list(hs.faces)
    for cv, cf in context:
        base = len(all_v)
        all_v += cv
        polys += [tuple(base + i for i in f) for f in cf]
    bvh = BVHTree.FromPolygons(all_v, polys, all_triangles=False, epsilon=0.0)
    flat = {k: (kit.hex_linear(v[0]), v[1], kit.hex_linear(v[2])) for k, v in (paints or PAINTS).items()}
    # dust: (hex, z_full, z_none, amount) - mix toward a dust colour near the ground (Blender z), fading upward
    dust_col = kit.hex_linear(dust[0]) if dust else None
    rng = random.Random(f"nacre:colour:{name}")
    fnorm = [kit.face_normal(hs.verts, f) for f in hs.faces]
    # smoothed normals for 'smooth' faces, keyed by vertex index (sweeps share vertices along a strip)
    vn = {}
    for fi, f in enumerate(hs.faces):
        if hs.ftag[fi] == "smooth" and hs.fmat[fi] not in glow:
            for i in f:
                k = (round(hs.verts[i][0], 4), round(hs.verts[i][1], 4), round(hs.verts[i][2], 4), hs.fpaint[fi])
                vn[k] = vn.get(k, Vector()) + fnorm[fi]
    out = []
    for fi, f in enumerate(hs.faces):
        if hs.fmat[fi] in glow:
            out += [(1.0, 1.0, 1.0, 1.0)] * len(f)
            continue
        n = fnorm[fi]
        cen = sum((verts[i] for i in f), Vector()) / len(f)
        paint = hs.fpaint[fi]
        base_name, _, seed = paint.partition(":")
        jitter = rng.uniform(0.95, 1.04)
        edge = hs.ftag[fi] == "edge"
        for i in f:
            p = verts[i]
            sample = p + (cen - p) * 0.08 + n * 0.0015
            t1 = n.orthogonal().normalized()
            t2 = n.cross(t1)
            hits = 0
            for dx, dy, dz in AO_DIRS:
                d = t1 * dx + t2 * dy + n * dz
                if ground is not None and d.z < -1e-6 and sample.z > ground and (ground - sample.z) / d.z < ao_dist:
                    hits += 1
                    continue
                if bvh.ray_cast(sample, d, ao_dist)[0] is not None:
                    hits += 1
            ao = 1.0 - hits / len(AO_DIRS)
            occ = kit.lerp(0.28, 1.0, ao ** 1.2)
            if base_name in RAMPS:
                key = (round(hs.verts[i][0], 4), round(hs.verts[i][1], 4), round(hs.verts[i][2], 4), paint)
                nn = vn[key].normalized() if (hs.ftag[fi] == "smooth" and key in vn and vn[key].length > 1e-9) else n
                s = (int(seed) * 0.17) if seed else 0.0
                h = (s + 0.26 * nn.x + 0.16 * nn.y + 0.14 * nn.z
                     + scale * (0.55 * p.x + 0.35 * p.y + 0.25 * p.z)
                     + 0.05 * math.sin(scale * (4.1 * p.x + 2.7 * p.y)))
                col = ramp(RAMPS[base_name], h)
                up = kit.smoothstep(0.45, 1.0, nn.z)
                hi = kit.hex_linear("#e4e0f4")
                col = kit.mix3(col, hi, 0.16 * sheen * up * up)
                if edge:
                    col = kit.mix3(col, hi, 0.22)
                col = kit.mul3(col, occ)
            else:
                b, wear, wear_col = flat[base_name]
                col = kit.mix3(b, wear_col, wear) if edge else b
                if dust_col is not None:
                    k = kit.clamp((dust[2] - p.z) / max(1e-6, dust[2] - dust[1]), 0.0, 1.0)
                    up = kit.smoothstep(0.5, 1.0, n.z)
                    col = kit.mix3(col, dust_col, dust[3] * max(k * k, 0.35 * up * k))
                col = kit.mul3(col, jitter * occ)
            for sc, sr in getattr(hs, "scorch", ()):
                k = kit.clamp(1.0 - (p - Vector(sc)).length / sr, 0.0, 1.0)
                if k > 0.0:
                    col = kit.mix3(col, kit.hex_linear("#0b0a0e"), 0.8 * k * k)
            out.append((col[0], col[1], col[2], 1.0))
    return out


# ----------------------------------------------------------------------------
# Materials, objects, sockets
# ----------------------------------------------------------------------------

def make_materials():
    return [vc.make_material("nacre_shell", "vc", rough=0.26, metal=0.25),
            vc.make_material("nacre_blade", "vc", rough=0.3, metal=0.35),
            vc.make_material("nacre_frame", "vc", rough=0.38, metal=0.3),
            vc.make_material("nacre_bronze", "vc", rough=0.42, metal=0.45),
            vc.make_material("nacre_glow_teal", "glow", colour=TEAL_HEX),
            vc.make_material("nacre_glow_amber", "glow", colour=AMBER_HEX)]


def make_object(name, hs, mats, origin, colours, yaw=0.0):
    """Mesh object at glTF point `origin`, optionally yawed about glTF +Y by `yaw` radians (the local frame
    is then rotated; vertices are stored in it). Box UVs in the local frame."""
    ox, oy, oz = B(*origin)
    rot = Matrix.Rotation(yaw, 3, "Z")
    inv = rot.transposed()
    local = [tuple(inv @ Vector((v[0] - ox, v[1] - oy, v[2] - oz))) for v in hs.verts]
    me = bpy.data.meshes.new(name)
    me.from_pydata(local, [], list(hs.faces))
    me.update()
    if len(me.polygons) != len(hs.faces):
        raise RuntimeError(f"{name}: polygon count changed")
    used = sorted(set(hs.fmat))
    for mi in used:
        me.materials.append(mats[mi])
    remap = {mi: i for i, mi in enumerate(used)}
    me.polygons.foreach_set("material_index", [remap[mi] for mi in hs.fmat])
    me.polygons.foreach_set("use_smooth", [t == "smooth" for t in hs.ftag])
    uvs = []
    for f in hs.faces:
        n = kit.face_normal(local, f)
        for i in f:
            x, y, z = local[i]
            u, v = kit.box_uv(x, z, -y, n.x, n.z, -n.y)
            uvs += [u, 1.0 - v]
    me.uv_layers.new(name="UVMap").data.foreach_set("uv", uvs)
    attr = me.color_attributes.new(name=vc.COLOR_ATTR, type="FLOAT_COLOR", domain="CORNER")
    attr.data.foreach_set("color", [c for rgba in colours for c in rgba])
    me.color_attributes.active_color = attr
    obj = bpy.data.objects.new(name, me)
    obj.location = (ox, oy, oz)
    obj.rotation_euler = (0.0, 0.0, yaw)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_socket(name, parent, gpos):
    """Empty at glTF model position gpos, parented to `parent` (located at the origin, unrotated)."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.05
    bpy.context.scene.collection.objects.link(e)
    if parent is not None:
        e.parent = parent
        e.location = Vector(B(*gpos)) - Vector(parent.location)
    else:
        e.location = B(*gpos)
    return e


def finish(hs):
    """Triangulate non-planar polygons and convert to Blender space."""
    to_blender(hs)
    vc.triangulate_nonplanar(hs)
    return hs


# ----------------------------------------------------------------------------
# Verification of the exported GLB (top-level nodes, optional socket children)
# ----------------------------------------------------------------------------

def verify_glb(path, spec, label):
    """spec: materials (list), nodes {name: rule}, total (lo, hi), max_bytes.

    rule: t (translation), yaw (radians about +Y, default 0), budget, empty, x/z (lo, hi) world ranges,
    y_min/y_max, y_min_exact, foot (fx, fz) about the translation, children {name: glTF local translation}.
    """
    data, gl, binc = vc.read_glb(path)
    problems = []
    for key in ("textures", "images", "samplers", "cameras", "animations", "skins", "extensionsUsed"):
        if gl.get(key):
            problems.append(f"unexpected {key}")
    mats = [m["name"] for m in gl.get("materials", [])]
    if sorted(mats) != sorted(spec["materials"]):
        problems.append(f"materials {mats} != {sorted(spec['materials'])}")
    for m in gl.get("materials", []):
        if "emissiveTexture" in m or "baseColorTexture" in m.get("pbrMetallicRoughness", {}):
            problems.append(f"material {m['name']} has a texture")
    top = {gl["nodes"][i]["name"]: gl["nodes"][i] for i in gl["scenes"][0]["nodes"]}
    if sorted(top) != sorted(spec["nodes"]):
        problems.append(f"node names differ: extra {sorted(set(top) - set(spec['nodes']))}, "
                        f"missing {sorted(set(spec['nodes']) - set(top))}")

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
    for name, node in sorted(top.items()):
        rule = spec["nodes"].get(name, {})
        t = node.get("translation", [0.0, 0.0, 0.0])
        want = rule.get("t", (0.0, 0.0, 0.0))
        if any(abs(a - b) > 1e-5 for a, b in zip(t, want)):
            problems.append(f"{name}: translation {t} != {want}")
        if "scale" in node or "matrix" in node:
            problems.append(f"{name}: node has scale/matrix")
        q = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
        yaw = rule.get("yaw", 0.0)
        wq = (0.0, math.sin(yaw / 2), 0.0, math.cos(yaw / 2))
        if not (all(abs(a - b) < 1e-5 for a, b in zip(q, wq)) or all(abs(a + b) < 1e-5 for a, b in zip(q, wq))):
            problems.append(f"{name}: rotation {q} != yaw {yaw:.4f}")
        kids = {gl["nodes"][c]["name"]: gl["nodes"][c] for c in node.get("children", [])}
        want_kids = rule.get("children", {})
        if sorted(kids) != sorted(want_kids):
            problems.append(f"{name}: children {sorted(kids)} != {sorted(want_kids)}")
        for kn, kd in kids.items():
            if "mesh" in kd or "children" in kd or "rotation" in kd or "scale" in kd:
                problems.append(f"{name}/{kn}: socket must be a plain empty")
            kt = kd.get("translation", [0.0, 0.0, 0.0])
            if kn in want_kids and any(abs(a - b) > 1e-5 for a, b in zip(kt, want_kids[kn])):
                problems.append(f"{name}/{kn}: translation {kt} != {want_kids[kn]}")
        if rule.get("empty"):
            if "mesh" in node:
                problems.append(f"{name}: expected an empty")
            rows.append((name, 0, 0, t, None))
            continue
        if "mesh" not in node:
            problems.append(f"{name}: no mesh")
            continue
        rq = Matrix.Rotation(yaw, 3, "Y")
        pts, tris, pmats = [], 0, set()
        for prim in gl["meshes"][node["mesh"]]["primitives"]:
            at = prim["attributes"]
            for key in ("COLOR_0", "TEXCOORD_0", "NORMAL"):
                if key not in at:
                    problems.append(f"{name}: missing {key}")
            pos, uv = acc(at["POSITION"]), acc(at["TEXCOORD_0"])
            ind = [i[0] for i in acc(prim["indices"])]
            tris += len(ind) // 3
            pmats.add(gl["materials"][prim["material"]]["name"])
            for p in pos:
                w = rq @ Vector(p)
                pts.append((w.x + t[0], w.y + t[1], w.z + t[2]))
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
            if bad:
                problems.append(f"{name}: {bad} UVs off the box projection")
        total += tris
        xs, ys, zs = [p[0] for p in pts], [p[1] for p in pts], [p[2] for p in pts]
        if tris > rule.get("budget", 10 ** 9):
            problems.append(f"{name}: {tris} tris > {rule['budget']}")
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
        if "y_max" in rule and max(ys) > rule["y_max"] + 1e-5:
            problems.append(f"{name}: top y {max(ys):.4f} > {rule['y_max']}")
        if "y_min" in rule and min(ys) < rule["y_min"] - 1e-5:
            problems.append(f"{name}: lowest y {min(ys):.4f} < {rule['y_min']}")
        rows.append((name, tris, rule.get("budget", 0), t, (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)),
                     sorted(pmats), {kn: kd.get("translation", [0, 0, 0]) for kn, kd in kids.items()}))
    print(f"{label} VERIFY node                          tris/budget  translation          x[min,max]       "
          f"y[min,max]       z[min,max]")
    for row in rows:
        name, tris, budget, t, b = row[:5]
        if b is None:
            print(f"{label} VERIFY {name:29s} (empty)       ({t[0]:+.3f},{t[1]:+.3f},{t[2]:+.3f})")
            continue
        print(f"{label} VERIFY {name:29s} {tris:5d}/{budget:<6d} ({t[0]:+.3f},{t[1]:+.3f},{t[2]:+.3f})  "
              f"[{b[0]:+.3f},{b[1]:+.3f}]  [{b[2]:+.3f},{b[3]:+.3f}]  [{b[4]:+.3f},{b[5]:+.3f}]  {','.join(row[5])}")
        for kn, kt in sorted(row[6].items()):
            print(f"{label} VERIFY     socket {kn:30s} ({kt[0]:+.3f},{kt[1]:+.3f},{kt[2]:+.3f})")
    if spec.get("total") and not spec["total"][0] <= total <= spec["total"][1]:
        problems.append(f"total tris {total} outside {spec['total']}")
    if len(data) > spec.get("max_bytes", 2_000_000):
        problems.append(f"file size {len(data)} > {spec.get('max_bytes', 2_000_000)}")
    print(f"{label} VERIFY total {total} tris, size={len(data)} bytes, materials={mats}, problems={len(problems)}")
    for p in problems:
        print(f"{label} VERIFY PROBLEM {p}")
    return problems


def publish(path, source, spec, label):
    tmp = path + ".tmp.glb"
    vc.export_glb(tmp, source)
    problems = verify_glb(tmp, spec, label)
    if problems:
        os.remove(tmp)
        raise SystemExit(f"{label}: exported GLB failed verification")
    os.replace(tmp, path)
    print(f"{label} published {path} ({os.path.getsize(path)} bytes)")


# ----------------------------------------------------------------------------
# Preview helpers (not part of any runtime asset)
# ----------------------------------------------------------------------------

def preview_lights(strength=3.2):
    kit.add_sun((0.45, 0.55, -0.7), strength=strength, color=(1.0, 0.97, 0.93), angle_deg=3.0)   # key, upper left
    kit.add_sun((-0.4, -0.7, -0.35), strength=1.3, color=(0.75, 0.85, 1.0), angle_deg=6.0)       # cool back rim
    kit.setup_world(bpy.context.scene, (0.2, 0.22, 0.3), 1.0)


def flat_material(name, hexcol, rough=0.85, emit=None):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = [n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0]
    bsdf.inputs["Base Color"].default_value = (*kit.hex_linear(hexcol), 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*kit.hex_linear(emit), 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    return m


def preview_ground_materials():
    return dict(
        slate=vc.noise_material("pv_slate", "#1e1f24", "#2c2d33", 2.0, 0.8),
        mire=vc.noise_material("pv_mire", "#0b1d24", "#123039", 0.25, 0.15, bump=0.05),
        label=flat_material("pv_label", "#cfc8b8", emit="#8a857a"),
    )


def perspective_camera(loc, target, lens=50.0):
    scene = bpy.context.scene
    cam = bpy.data.cameras.new("hero")
    cam.lens = lens
    cam.clip_start = 0.05
    cam.clip_end = 500.0
    ob = bpy.data.objects.new("hero", cam)
    ob.location = loc
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y")
    scene.collection.objects.link(ob)
    scene.camera = ob
    return ob


def setup_render(engine, samples, w, h, exposure=0.25):
    scene = bpy.context.scene
    kit.setup_render(scene, engine, samples, w, h)
    scene.view_settings.exposure = exposure


def place(src, loc, rot_z=0.0, name=None):
    o = bpy.data.objects.new(name or f"pv_{src.name}", src.data)
    o.location = loc
    o.rotation_euler = (0.0, 0.0, rot_z + src.rotation_euler.z)
    bpy.context.scene.collection.objects.link(o)
    return o
