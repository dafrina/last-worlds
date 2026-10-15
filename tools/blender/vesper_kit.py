"""Vesper (Glass Frontier) ice terrain kit for Last Worlds (docs/17 sections 1 and 3).

Ice cliff segments (faceted vertical walls, fractured strata, undercut at the waterline),
seracs, ice spires, icebergs and floes (waterline at y = 0 of the piece, mass below),
pressure-ridge slabs, snow drifts, snow-capped dark rock outcrops and frozen vent stacks.

Three materials: vesper_ice (deep translucent-reading blue gradients in COLOR_0),
vesper_snow (white snow on upward faces and ledges) and vesper_rock (charcoal rock).
Conventions: glTF +Y up, 1 unit = 1 game unit, front (seaward face) toward +Z,
pivots at the base centre. Deterministic; contract self-checked after export.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/vesper_kit.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/vesper/vesper-kit.glb)" \\
        --preview-dir "$(wslpath -w $R/art/vesper-kit)"
"""

import argparse
import math
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import khepri_kit as kit  # noqa: E402
import vesper_common as vc  # noqa: E402
from vesper_common import HS, merge_hs, xform  # noqa: E402

SEED = "vesper-kit-v1"
ICE, SNOW, ROCK = 0, 1, 2
MAT_NAMES = ("vesper_ice", "vesper_snow", "vesper_rock")
PAINT_MAT = {"ice": ICE, "snow": SNOW, "rock": ROCK}

C = {k: kit.hex_linear(v) for k, v in dict(
    snow="#e9eef3", snow_shade="#b9c8d8", ice_top="#bfe0f5", ice="#72b4e6", ice_mid="#3a87c8",
    ice_deep="#1d5d98", ice_abyss="#0f3a66", rock="#2a2d31", rock_edge="#4a4f56").items()}


# ----------------------------------------------------------------------------
# Builders
# ----------------------------------------------------------------------------

def outward_normal(a, b):
    ex, ey = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(ex, ey) or 1.0
    return ey / ln, -ex / ln


def ice_block(hs, poly, base, top, slope=0.0, slope_ang=0.0, undercut=0.0, strata=(), chamfer=0.03):
    """Faceted ice block. poly: CCW (x, y). The front edges (outward normal toward Blender -y,
    i.e. glTF +Z) get an undercut notch from `base` to the waterline. strata: z levels where the
    walls step in by a few cm, leaving snowy ledges. Top plane highest point is exactly `top`."""
    if kit.poly_area(poly) < 0:
        poly = list(reversed(poly))
    n = len(poly)
    front = [outward_normal(poly[i], poly[(i + 1) % n])[1] < -0.45 for i in range(n)]
    dx, dy = math.cos(slope_ang), math.sin(slope_ang)
    m = max(x * dx + y * dy for x, y in poly)

    def top_fn(x, y):
        return top + slope * ((x * dx + y * dy) - m)

    def ring(pts, z):
        return [hs.v((x, y, z if not callable(z) else z(x, y))) for x, y in pts]

    def wall(lo, hi, pts, paint="ice", tag="main", down=False):
        for i in range(n):
            j = (i + 1) % n
            nx, ny = outward_normal(pts[i], pts[j])
            out = (nx, ny, -0.8 if down else 0.0)
            hs.face((lo[i], lo[j], hi[j], hi[i]), paint, tag, PAINT_MAT[paint], outward=out)

    cur = poly
    if undercut > 0.0:
        notch = kit.inset_poly(poly, [undercut if f else 0.0 for f in front]) or poly
        r0 = ring(notch, base)
        r1 = ring(notch, 0.08)
        wall(r0, r1, notch)
        r2 = ring(poly, 0.18)
        wall(r1, r2, poly, down=True)
        low = r2
    else:
        low = ring(poly, base)
    for zs in strata:
        hi = ring(cur, zs)
        wall(low, hi, cur)
        ins = kit.inset_poly(cur, [0.035 + 0.02 * ((i * 7) % 3) for i in range(n)])
        if ins is None:
            low = hi
            continue
        led = ring(ins, zs)
        for i in range(n):
            j = (i + 1) % n
            hs.face((hi[i], hi[j], led[j], led[i]), "snow", "ledge", SNOW, outward=(0, 0, 1))
        low, cur = led, ins
    inner = kit.inset_poly(cur, [chamfer] * n) or cur
    rt = ring(cur, lambda x, y: top_fn(x, y) - chamfer)
    wall(low, rt, cur)
    ri = ring(inner, top_fn)
    for i in range(n):
        j = (i + 1) % n
        nx, ny = outward_normal(cur[i], cur[j])
        hs.face((rt[i], rt[j], ri[j], ri[i]), "snow", "edge", SNOW, outward=(nx, ny, 1.0))
    hs.face(tuple(ri), "snow", "main", SNOW, outward=(0, 0, 1))


def hull_hs(hs, points, paint, auto_snow=0.0):
    """Convex hull appended to hs; faces with up-normal > auto_snow (if set) become snow."""
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bm.verts.ensure_lookup_table()
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
        idx = tuple(base + v.index for v in f.verts)
        nz = f.normal.z
        pnt = "snow" if (auto_snow and nz > auto_snow) else paint
        hs.face(idx, pnt, "main", PAINT_MAT[pnt], outward=tuple(f.normal))
    bm.free()


def band_poly(rng, x0, x1, depth, segments):
    """Cliff band split into slabs along x with slanted cuts and faceted fronts."""
    step = (x1 - x0) / segments
    cuts = [x0] + [x0 + step * k + rng.uniform(-0.12, 0.12) * step for k in range(1, segments)] + [x1]
    slabs = []
    for a, b in zip(cuts, cuts[1:]):
        g = 0.025
        sa, sb = rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12)
        fy = -depth * 0.5 - rng.uniform(0.0, 0.08)
        mid = (a + b) * 0.5 + rng.uniform(-0.1, 0.1)
        poly = [(a + g + sa, depth * 0.5), (a + g - sa, fy + rng.uniform(0.0, 0.06)), (mid, fy - rng.uniform(0.03, 0.08)),
                (b - g - sb, fy + rng.uniform(0.0, 0.08)), (b - g + sb, depth * 0.5)]
        slabs.append(list(reversed(poly)))
    return slabs


def build_cliff(rng, idx):
    hs = HS(rng)
    slabs = band_poly(rng, -1.2, 1.2, 0.85, (5, 4, 5)[idx])
    tops = [rng.uniform(0.78, 0.98) for _ in slabs]
    tops[rng.randrange(len(tops))] = 1.0
    if idx == 1:                                   # broken, stepped segment
        tops = [t * (0.72 if k % 2 else 1.0) for k, t in enumerate(tops)]
        tops[0] = 1.0
    for poly, t in zip(slabs, tops):
        tilt = rng.uniform(0.0, 0.12) if t < 1.0 else 0.0
        strata = [t * rng.uniform(0.42, 0.6)] + ([t * rng.uniform(0.72, 0.82)] if rng.random() < 0.5 else [])
        ice_block(hs, poly, -0.15, t, slope=tilt, slope_ang=rng.uniform(0, 2 * math.pi), undercut=0.14,
                  strata=strata)
    return hs


def build_serac(rng, idx):
    hs = HS(rng)
    n = (3, 2, 4)[idx]
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-0.3, 0.3)
        r = 0.0 if n == 1 else rng.uniform(0.12, 0.26)
        cx, cy = math.cos(a) * r, math.sin(a) * r
        rad = rng.uniform(0.18, 0.26)
        sides = rng.choice((4, 5, 5, 6))
        poly = kit.jittered_ngon(rng, cx, cy, rad, sides)
        top = 1.0 if k == 0 else rng.uniform(0.55, 0.9)
        ice_block(hs, poly, -0.12, top, slope=rng.uniform(0.2, 0.6), slope_ang=rng.uniform(0, 2 * math.pi),
                  strata=[top * rng.uniform(0.35, 0.55)])
    return hs


def build_spire(rng, idx):
    """Tapering faceted ice spire with a slight lean; snow only on its small steps."""
    hs = HS(rng)
    sides = (5, 6)[idx]
    r0 = (0.3, 0.26)[idx]
    lean = Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), 0.0))
    levels = [(-0.12, 1.0), (0.3, 0.82), (0.32, 0.7), (0.62, 0.48), (0.64, 0.38), (0.86, 0.16)]
    base_poly = kit.jittered_ngon(rng, 0.0, 0.0, r0, sides)
    rings = []
    for z, s in levels:
        off = lean * max(z, 0.0)
        rings.append([hs.v((x * s + off.x, y * s + off.y, z)) for x, y in base_poly])
    for k, (lo, hi) in enumerate(zip(rings, rings[1:])):
        ledge = k in (1, 3)
        for i in range(sides):
            j = (i + 1) % sides
            a = Vector(hs.verts[lo[i]])
            b = Vector(hs.verts[lo[j]])
            mid = (a + b) * 0.5
            out = (mid.x, mid.y, 1.0 if ledge else 0.15)
            paint = "snow" if ledge else "ice"
            hs.face((lo[i], lo[j], hi[j], hi[i]), paint, "ledge" if ledge else "main", PAINT_MAT[paint], outward=out)
    tip = hs.v((lean.x * 1.0, lean.y * 1.0, 1.0))
    last = rings[-1]
    for i in range(sides):
        j = (i + 1) % sides
        hs.face((last[i], last[j], tip), "ice", "main", ICE, outward=(0, 0, 1))
    return hs


def angular_poly(rng, rad, k, sx=1.1, sy=0.9):
    """Broken, angular outline: few vertices, strong radial jitter, convex hull kept."""
    rot = rng.uniform(0, 2 * math.pi)
    pts = []
    for i in range(k):
        a = rot + 2 * math.pi * (i + rng.uniform(-0.25, 0.25)) / k
        r = rad * rng.uniform(0.72, 1.08)
        pts.append((math.cos(a) * r * sx, math.sin(a) * r * sy))
    return pts


def build_iceberg(rng, idx):
    """Tabular berg: faceted vertical walls with an undercut at the waterline (y = 0), snow top,
    submerged mass below; berg 2 carries a second, taller block (pinnacle)."""
    hs = HS(rng)
    above = (0.62, 0.45, 0.78)[idx]
    rad = (0.66, 0.74, 0.5)[idx]
    poly = angular_poly(rng, rad, (6, 7, 5)[idx])
    ice_block(hs, poly, -0.55, above * (0.75 if idx == 2 else 1.0), slope=rng.uniform(0.0, 0.18),
              slope_ang=rng.uniform(0, 2 * math.pi), undercut=0.1, strata=[above * 0.45], chamfer=0.04)
    if idx == 2:
        cx, cy = rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15)
        ice_block(hs, kit.jittered_ngon(rng, cx, cy, 0.22, 5), above * 0.5, above, slope=0.3,
                  slope_ang=rng.uniform(0, 2 * math.pi))
    return hs


def build_floe(rng, idx):
    """Broken floe: thin angular slab, snow top, ice edges; waterline y = 0."""
    hs = HS(rng)
    rad = (0.55, 0.72, 0.8, 0.45)[idx]
    poly = angular_poly(rng, rad, (6, 7, 6, 5)[idx])
    top = rng.uniform(0.07, 0.12)
    ice_block(hs, poly, -0.15, top, slope=rng.uniform(0.0, 0.05), slope_ang=rng.uniform(0, 2 * math.pi),
              chamfer=0.035)
    if idx in (1, 2):                               # a small pressure ridge of tilted slabs on the bigger floes
        x0 = rng.uniform(-0.3, 0.1)
        for k in range(3):
            slab = HS(rng)
            slab.box((0.0, 0.0, 0.0), (rng.uniform(0.18, 0.26), rng.uniform(0.2, 0.28), 0.05), 0.01, "ice", ICE)
            merge_hs(hs, slab, xform((x0 + k * 0.17, rng.uniform(-0.08, 0.08), top + 0.04),
                                     (rng.uniform(-0.5, 0.5), rng.uniform(-0.4, 0.4), rng.uniform(-0.6, 0.6))))
        for fi, f in enumerate(hs.faces):
            if hs.fpaint[fi] == "ice" and kit.face_normal(hs.verts, f).z > 0.7:
                hs.fpaint[fi], hs.fmat[fi] = "snow", SNOW
    return hs


def build_ridge(rng, idx):
    hs = HS(rng)
    count = (6, 8)[idx]
    for k in range(count):
        x = -1.0 + 2.0 * (k + 0.5) / count + rng.uniform(-0.08, 0.08)
        slab = HS(rng)
        w, d, t = rng.uniform(0.32, 0.5), rng.uniform(0.35, 0.55), rng.uniform(0.07, 0.11)
        slab.box((0.0, 0.0, 0.0), (w, d, t), 0.015, "ice", ICE)
        merge_hs(hs, slab, xform((x, rng.uniform(-0.12, 0.12), rng.uniform(0.08, 0.18)),
                                 (rng.uniform(-0.5, 0.5), rng.uniform(-0.35, 0.35), rng.uniform(-0.5, 0.5))))
    vc.infra.bury(hs, -0.12)                         # slabs sink into the snow
    for fi, f in enumerate(hs.faces):                # snow settles on the upward faces of the slabs
        if kit.face_normal(hs.verts, f).z > 0.7:
            hs.fpaint[fi], hs.fmat[fi] = "snow", SNOW
    return hs


def build_drift(rng, idx):
    """Smooth wind-sculpted snow mound (elliptic, asymmetric crest)."""
    hs = HS(rng)
    rx, ry, h = ((0.85, 0.5, 0.32), (0.7, 0.45, 0.24))[idx]
    seg, rings_n = 16, 6
    crest = rng.uniform(-0.3, 0.3)
    grid = []
    for r in range(rings_n + 1):
        t = r / rings_n
        row = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            x = math.cos(a) * rx * (1.0 - t) * (1.0 + 0.08 * math.sin(3 * a))
            y = math.sin(a) * ry * (1.0 - t)
            z = -0.12 + (h + 0.12) * math.sin(t * math.pi * 0.5) ** 0.8 + crest * 0.1 * x * t
            row.append(hs.v((x + crest * 0.2 * t, y, z)))
        grid.append(row)
    top = hs.v((crest * 0.2, 0.0, h + crest * 0.0))
    for r in range(rings_n):
        for k in range(seg):
            j = (k + 1) % seg
            hs.face((grid[r][k], grid[r][j], grid[r + 1][j], grid[r + 1][k]), "snow", "smooth", SNOW, outward=(0, 0, 1))
    for k in range(seg):
        j = (k + 1) % seg
        hs.face((grid[-1][k], grid[-1][j], top), "snow", "smooth", SNOW, outward=(0, 0, 1))
    return hs


def build_outcrop(rng, idx):
    hs = HS(rng)
    specs = ((3, 0.8), (2, 0.6), (4, 0.5))[idx]
    for k in range(specs[0]):
        a = 2 * math.pi * k / specs[0] + rng.uniform(-0.4, 0.4)
        cx, cy = (math.cos(a) * 0.22, math.sin(a) * 0.2) if specs[0] > 1 else (0.0, 0.0)
        h = specs[1] * (1.0 if k == 0 else rng.uniform(0.45, 0.8))
        pts = []
        for z, s in ((-0.12, 1.0), (h * 0.5, 0.85), (h, 0.45)):
            for i in range(6):
                ang = rng.uniform(0, 2 * math.pi)
                r = rng.uniform(0.14, 0.24) * s
                pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r, z if z > 0 else -0.12))
        hull_hs(hs, pts, "rock", auto_snow=0.62)
    return hs


def build_vent(rng, idx):
    """Frozen vent stack: rock chimney(s) wrapped in ice collars, frost on the rims."""
    hs = HS(rng)
    stacks = ((0.0, 0.0, 0.95, 0.2),) if idx == 0 else ((-0.15, 0.05, 0.75, 0.15), (0.18, -0.08, 0.55, 0.13),
                                                        (0.02, 0.2, 0.42, 0.11))
    for x, y, h, r in stacks:
        hs.cyl((x, y, -0.12), (0, 0, 1), r * 1.5, h + 0.12, 7, 0.0, "rock", ROCK, cap0=False, cap1=False, r1=r,
               smooth=False)
        rim = HS(rng)
        rim.cyl((0.0, 0.0, 0.0), (0, 0, 1), r * 1.15, 0.06, 7, 0.02, "snow", SNOW, cap0=False)
        merge_hs(hs, rim, xform((x, y, h - 0.04)))
        hs.cyl((x, y, h + 0.015), (0, 0, 1), r * 0.7, 0.01, 7, 0.0, "rock", ROCK, cap0=False, smooth=False)
        for z in (h * 0.3, h * 0.62):
            rr = r * 1.5 - (r * 0.5) * (z + 0.12) / (h + 0.12) + 0.05
            hs.cyl((x, y, z), (0, 0, 1), rr, 0.07, 9, 0.02, "ice", ICE, cap0=False, smooth=False)
    return hs


# ----------------------------------------------------------------------------
# Jagged pack-ice floes (revision 2, 15 October): non-convex outlines, raised snow rims, cracked sets
# ----------------------------------------------------------------------------

def jagged_outline(rng, rad, k):
    """Star-shaped, non-convex outline in polar form: (angle, radius) samples with notches and bays."""
    rot = rng.uniform(0, 2 * math.pi)
    angs = sorted(rot + 2 * math.pi * (i + rng.uniform(-0.3, 0.3)) / k for i in range(k))
    rads = [rad * rng.uniform(0.82, 1.0) for _ in range(k)]
    for i in range(k):                                    # sharp notches
        if rng.random() < 0.22:
            rads[i] *= rng.uniform(0.55, 0.72)
    b = rng.randrange(k)                                  # a broad bay over two or three samples
    for j in range(rng.choice((2, 3))):
        rads[(b + j) % k] *= rng.uniform(0.66, 0.78)
    return list(zip(angs, rads))


def radius_at(polar, theta):
    k = len(polar)
    for i in range(k):
        a0, r0 = polar[i]
        a1, r1 = polar[(i + 1) % k]
        if i == k - 1:
            a1 += 2 * math.pi
        t = theta
        while t < a0:
            t += 2 * math.pi
        if a0 <= t <= a1:
            return r0 + (r1 - r0) * (t - a0) / (a1 - a0)
    return polar[0][1]


def crack_polyline(rng, polar, theta, n=4):
    """Jagged crack from the centre to the rim at angle theta (centre excluded, rim included)."""
    rr = radius_at(polar, theta)
    ux, uy = math.cos(theta), math.sin(theta)
    pts = []
    for j in range(1, n + 1):
        t = j / (n + 1)
        lat = rng.uniform(-1.0, 1.0) * 0.09 * rr * 4.0 * t * (1.0 - t)
        pts.append((ux * rr * t - uy * lat, uy * rr * t + ux * lat))
    pts.append((ux * rr, uy * rr))
    return pts


def arc_points(polar, th0, th1):
    """Outline points strictly inside the angular interval (th0, th1), in order."""
    out = []
    for a, r in polar:
        t = a
        while t <= th0:
            t += 2 * math.pi
        if t < th1:
            out.append((t, r))
    out.sort()
    return [(math.cos(t) * r, math.sin(t) * r) for t, r in out]


def floe_slab(hs, poly, size):
    """Floe slab from a (possibly concave) CCW outline: submerged base, blue waterline band,
    snow rim slightly raised around a flat snow skin. Waterline at z = 0."""
    if kit.poly_area(poly) < 0:
        poly = list(reversed(poly))
    n = len(poly)
    cx = sum(p[0] for p in poly) / n
    cy = sum(p[1] for p in poly) / n
    top = 0.09 if size > 0.3 else 0.07
    rim_in = min(0.035, size * 0.08)
    dip_in = min(0.09, size * 0.2)
    base = [(cx + (x - cx) * 0.9, cy + (y - cy) * 0.9) for x, y in poly]
    rim = kit.inset_poly(poly, [rim_in] * n) or [(cx + (x - cx) * 0.95, cy + (y - cy) * 0.95) for x, y in poly]
    dip = kit.inset_poly(poly, [dip_in] * n) or [(cx + (x - cx) * 0.85, cy + (y - cy) * 0.85) for x, y in poly]
    r0 = [hs.v((x, y, -0.15)) for x, y in base]
    r1 = [hs.v((x, y, -0.02)) for x, y in poly]
    r2 = [hs.v((x, y, top - 0.03)) for x, y in poly]
    r3 = [hs.v((x, y, top)) for x, y in rim]
    r4 = [hs.v((x, y, top - 0.018)) for x, y in dip]
    for i in range(n):
        j = (i + 1) % n
        nx, ny = outward_normal(poly[i], poly[j])
        hs.face((r0[i], r0[j], r1[j], r1[i]), "ice", "main", ICE, outward=(nx, ny, -0.3))
        hs.face((r1[i], r1[j], r2[j], r2[i]), "ice", "main", ICE, outward=(nx, ny, 0.0))
        hs.face((r2[i], r2[j], r3[j], r3[i]), "snow", "edge", SNOW, outward=(nx, ny, 1.0))
        hs.face((r3[i], r3[j], r4[j], r4[i]), "snow", "ledge", SNOW, outward=(-nx, -ny, 3.0))
    hs.face(tuple(r4), "snow", "main", SNOW, outward=(0, 0, 1))


FLOE_SINGLES = {"floe_4": (0.2, 9), "floe_5": (0.22, 9), "floe_6": (0.5, 13), "floe_7": (0.55, 14),
                "floe_8": (0.95, 17), "floe_9": (1.15, 18)}
FLOE_SETS = {"floe_pair_a": (1.1, 18, 2), "floe_pair_b": (0.55, 14, 2), "floe_triple_c": (1.15, 18, 3)}
CRACK_GAP = 0.05
SET_OFFSETS = {}                  # piece name -> (x, z) offset from the set origin (glTF), filled by main()
_SET_CACHE = {}


def build_jagged_floe(rng, name):
    rad, k = FLOE_SINGLES[name]
    hs = HS(rng)
    polar = jagged_outline(rng, rad, k)
    floe_slab(hs, [(math.cos(a) * r, math.sin(a) * r) for a, r in polar], rad * 2)
    return hs


def build_floe_set(set_name):
    """Split one jagged parent floe along radial cracks into 2 or 3 pieces that fit together with
    narrow gaps. Returns {piece name: hs} in the set frame (set origin = parent centre)."""
    if set_name in _SET_CACHE:
        return _SET_CACHE[set_name]
    rad, k, parts = FLOE_SETS[set_name]
    rng = random.Random(f"{SEED}:{set_name}")
    polar = jagged_outline(rng, rad, k)
    th0 = rng.uniform(0, 2 * math.pi)
    if parts == 2:
        cuts = [th0, th0 + math.pi + rng.uniform(-0.25, 0.25)]
    else:
        cuts = [th0, th0 + 2 * math.pi / 3 + rng.uniform(-0.3, 0.3), th0 + 4 * math.pi / 3 + rng.uniform(-0.3, 0.3)]
    cracks = [crack_polyline(rng, polar, c) for c in cuts]
    pieces = {}
    for p in range(parts):
        a0 = cuts[p]
        a1 = cuts[(p + 1) % parts] + (2 * math.pi if p == parts - 1 else 0.0)
        poly = list(cracks[p])                                    # centre -> rim along crack p (rim incl.)
        poly += arc_points(polar, a0, a1)
        poly += list(reversed(cracks[(p + 1) % parts]))            # rim -> centre along the next crack
        poly.append((0.0, 0.0))
        mid = (a0 + a1) * 0.5
        d = CRACK_GAP * (0.5 if parts == 2 else 0.6)
        poly = [(x + math.cos(mid) * d, y + math.sin(mid) * d) for x, y in poly]
        hs = HS(random.Random(f"{SEED}:{set_name}:{p}"))
        floe_slab(hs, poly, rad)
        pieces[f"{set_name}_{p}"] = hs
    _SET_CACHE[set_name] = pieces
    return pieces


# ----------------------------------------------------------------------------
# Node table (contract) and colours
# ----------------------------------------------------------------------------

NODES = {}
for i in range(3):
    NODES[f"ice_cliff_{i}"] = dict(budget=600, foot=(2.6, 1.2), y_min_exact=-0.15, y_max_exact=1.0)
    NODES[f"serac_{i}"] = dict(budget=600, foot=(1.2, 1.2), y_min_exact=-0.12, y_max_exact=1.0)
    NODES[f"iceberg_{i}"] = dict(budget=600, foot=(1.9, 1.9), y_min_exact=-0.55, y_max=0.8)
    NODES[f"rock_outcrop_{i}"] = dict(budget=600, foot=(1.2, 1.2), y_min_exact=-0.12, y_max=0.85)
for i in range(2):
    NODES[f"ice_spire_{i}"] = dict(budget=600, foot=(0.8, 0.8), y_min_exact=-0.12, y_max_exact=1.0)
    NODES[f"pressure_ridge_{i}"] = dict(budget=600, foot=(2.4, 1.0), y_min=-0.12, y_max=0.5)
    NODES[f"snow_drift_{i}"] = dict(budget=600, foot=(1.8, 1.2), y_min_exact=-0.12, y_max=0.35)
    NODES[f"vent_stack_{i}"] = dict(budget=600, foot=(0.9, 0.9), y_min_exact=-0.12, y_max=1.0)
for i in range(4):
    NODES[f"floe_{i}"] = dict(budget=600, foot=(2.0, 2.0), y_min_exact=-0.15, y_max=0.3)
for _name, (_rad, _k) in FLOE_SINGLES.items():
    NODES[_name] = dict(budget=200, foot=(_rad * 2.3, _rad * 2.3), y_min_exact=-0.15, y_max=0.1)
for _set, (_rad, _k, _parts) in FLOE_SETS.items():
    for _p in range(_parts):
        NODES[f"{_set}_{_p}"] = dict(budget=200, foot=(_rad * 2.3, _rad * 2.3), y_min_exact=-0.15, y_max=0.1)


def kit_colour_fn(hs, floating):
    zs = [v[2] for v in hs.verts]
    zlo, zhi = min(zs), max(zs)
    rng = random.Random(f"{SEED}:shade:{len(zs)}")
    face_jit = [rng.uniform(0.9, 1.08) for _ in hs.faces]

    def fn(paint, p, n, ao, fi):
        if paint == "snow":
            col = kit.mix3(C["snow_shade"], C["snow"], kit.clamp(ao ** 0.8 * (0.75 + 0.25 * n.z), 0.0, 1.0))
            return col
        if paint == "rock":
            col = kit.mix3(C["rock"], C["rock_edge"], 0.6 if hs.ftag[fi] == "edge" else 0.0)
            return kit.mul3(col, kit.lerp(0.4, 1.0, ao) * face_jit[fi])
        lo = 0.0 if floating else zlo
        t = kit.clamp((p.z - lo) / max(zhi - lo, 0.05), 0.0, 1.0)
        # saturated blue that deepens toward the base (revision 2: the concept's deep blue cliff feet)
        col = kit.mix3(C["ice_deep"], C["ice_mid"], kit.smoothstep(0.15, 0.6, t))
        col = kit.mix3(col, C["ice"], kit.smoothstep(0.5, 0.9, t))
        col = kit.mix3(col, C["ice_top"], kit.smoothstep(0.9, 1.0, t) * 0.5)
        if p.z < 0.0 and floating:
            col = kit.mix3(col, C["ice_abyss"], kit.clamp(-p.z / 0.4, 0.0, 1.0))
        if hs.ftag[fi] == "main" and n.z < -0.2:   # undercut / overhang underside: deep blue
            col = kit.mix3(col, C["ice_deep"], 0.6)
        col = kit.mul3(col, face_jit[fi])
        return kit.mix3(C["ice_abyss"], col, kit.lerp(0.45, 1.0, ao))
    return fn


BUILD = []
for i in range(3):
    BUILD.append((f"ice_cliff_{i}", build_cliff, i, False))
for i in range(3):
    BUILD.append((f"serac_{i}", build_serac, i, False))
for i in range(2):
    BUILD.append((f"ice_spire_{i}", build_spire, i, False))
for i in range(3):
    BUILD.append((f"iceberg_{i}", build_iceberg, i, True))
for i in range(4):
    BUILD.append((f"floe_{i}", build_floe, i, True))
for i in range(2):
    BUILD.append((f"pressure_ridge_{i}", build_ridge, i, False))
for i in range(2):
    BUILD.append((f"snow_drift_{i}", build_drift, i, False))
for i in range(3):
    BUILD.append((f"rock_outcrop_{i}", build_outcrop, i, False))
for i in range(2):
    BUILD.append((f"vent_stack_{i}", build_vent, i, False))


def fit_top(hs, target):
    """Scale heights above 0 so the highest vertex is exactly `target` (the base is untouched)."""
    zmax = max(v[2] for v in hs.verts)
    k = target / zmax
    for v in hs.verts:
        if v[2] > 0.0:
            v[2] *= k
            if abs(v[2] - target) < 1e-6:
                v[2] = target


for _name in FLOE_SINGLES:
    BUILD.append((_name, lambda rng, name: build_jagged_floe(rng, name), _name, True))
for _set, (_rad, _k, _parts) in FLOE_SETS.items():
    for _p in range(_parts):
        BUILD.append((f"{_set}_{_p}", lambda rng, name: build_floe_set(name.rsplit("_", 1)[0])[name],
                      f"{_set}_{_p}", True))


def centre_xy(hs):
    xs = [v[0] for v in hs.verts]
    ys = [v[1] for v in hs.verts]
    ox, oy = (min(xs) + max(xs)) * 0.5, (min(ys) + max(ys)) * 0.5
    for v in hs.verts:
        v[0] -= ox
        v[1] -= oy
    return ox, oy


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="vesper_kit.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--infra", default=None, help="vesper-infra.glb for the diorama")
    ap.add_argument("--ark", default=None, help="helion-ark.glb for the diorama")
    ap.add_argument("--craft", default=None, help="vesper-craft.glb for the diorama")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = [vc.make_material("vesper_ice", "vc", rough=0.12, metal=0.0),
            vc.make_material("vesper_snow", "vc", rough=0.85, metal=0.0),
            vc.make_material("vesper_rock", "vc", rough=0.9, metal=0.0)]
    objs = {}
    for name, fn, i, floating in BUILD:
        hs = fn(random.Random(f"{SEED}:{name}"), i)
        ox, oy = centre_xy(hs)
        if name.startswith(tuple(FLOE_SETS)):
            SET_OFFSETS[name] = (round(ox, 4), round(-oy, 4))          # glTF (x, z) from the set origin
            print(f"KIT set offset {name}: x {ox:+.4f}, z {-oy:+.4f}")
        if "y_max_exact" in NODES[name]:
            fit_top(hs, NODES[name]["y_max_exact"])
        cols = vc.bake(hs, name, dict(glow=set(), ao=0.3, ground=None if floating else 0.0,
                                      colour_fn=kit_colour_fn(hs, floating)))
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        print(f"KIT {name:18s} tris={hs.tris()}")
    vc.publish(args.glb, "vesper_kit.py", dict(materials=MAT_NAMES, nodes=NODES, max_bytes=2_000_000), "VKIT")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        render_sheet(objs, args)
        keep = set(objs)
        kit.clear_preview(keep)
        render_floes(objs, args, keep)
        kit.clear_preview(keep)
        render_pack(objs, args, keep)
        kit.clear_preview(keep)
        render_diorama(objs, args, keep)


def render_sheet(objs, args):
    scene = bpy.context.scene
    pm = vc.preview_materials()
    for o in objs.values():
        o.hide_render = True
    rows = [
        (6.6, 2.9, [f"ice_cliff_{i}" for i in range(3)], 0.0),
        (4.0, 1.7, [f"serac_{i}" for i in range(3)] + [f"ice_spire_{i}" for i in range(2)], 0.0),
        (1.4, 1.9, [f"rock_outcrop_{i}" for i in range(3)] + [f"vent_stack_{i}" for i in range(2)], 0.0),
        (-1.0, 2.6, [f"pressure_ridge_{i}" for i in range(2)] + [f"snow_drift_{i}" for i in range(2)], 0.0),
        (-3.9, 2.1, [f"iceberg_{i}" for i in range(3)] + [f"floe_{i}" for i in range(2)], -1.2),
        (-6.3, 2.1, [f"floe_{i}" for i in range(2, 4)], -1.2),
    ]
    for y, dx, names, water in rows:
        for c, name in enumerate(names):
            x = (c - (len(names) - 1) * 0.5) * dx
            z = water
            kit.instance(f"sheet_{name}", objs[name], (x, y, z))
            kit.text_label(name, (x, y - 1.05, (water if water else 0.0) + 0.012), 0.13,
                           pm["label"] if water else pm["label_dark"])
    kit.prism_obj("shelf", [(-12, -2.3), (12, -2.3), (12, 12), (-12, 12)], -3.0, 0.0, pm["sheet_snow"], pm["sheet_snow"])
    vc.plane("ocean", -20, 20, -20, 20, -1.2, pm["ocean"])
    vc.preview_world(scene)
    kit.add_ortho_camera((0.0, 0.2, 0.0), 55.0, 15.0)
    vc.setup_render(scene, args.engine, args.samples, 1800, 1800)
    kit.render(os.path.join(args.preview_dir, "preview-kit.png"))


def render_floes(objs, args, keep):
    """Contact sheet of the jagged floes and the assembled cracked sets (sea level at z = 0)."""
    scene = bpy.context.scene
    pm = vc.preview_materials()
    for k, name in enumerate(FLOE_SINGLES):
        x = -6.0 + k * 2.2
        kit.instance("fs_" + name, objs[name], (x, 3.0, 0.0))
        kit.text_label(name, (x, 1.6, 0.012), 0.16, pm["label"])
    for k, set_name in enumerate(FLOE_SETS):
        cx = -4.6 + k * 4.6
        parts = FLOE_SETS[set_name][2]
        for p in range(parts):
            nm = f"{set_name}_{p}"
            ox, oz = SET_OFFSETS[nm]
            kit.instance("fs_" + nm, objs[nm], (cx + ox, -1.6 - oz, 0.0))
        kit.text_label(set_name + " (assembled)", (cx, -3.4, 0.012), 0.16, pm["label"])
    vc.plane("ocean", -30, 30, -30, 30, 0.0, pm["ocean"])
    vc.preview_world(scene)
    kit.add_ortho_camera((0.0, 0.2, 0.0), 55.0, 16.0)
    vc.setup_render(scene, args.engine, args.samples, 1800, 1300)
    kit.render(os.path.join(args.preview_dir, "preview-floes.png"))


def render_pack(objs, args, keep):
    """Pack ice at the game camera: mixed jagged floes, brash and cracked sets drifting slightly apart."""
    scene = bpy.context.scene
    pm = vc.preview_materials()
    rng = random.Random(f"{SEED}:pack")
    singles = list(FLOE_SINGLES)
    placed = []
    for k in range(70):
        for _try in range(30):
            x, y = rng.uniform(-7.0, 7.0), rng.uniform(-6.0, 30.0)
            name = rng.choice(singles + ["floe_4", "floe_5", "floe_4"])
            r = FLOE_SINGLES[name][0]
            if all(math.hypot(x - px, y - py) > r + pr + 0.15 for px, py, pr in placed):
                break
        placed.append((x, y, r))
        put(objs[name], (x, y, SEA), rng.uniform(0, 2 * math.pi))
    for k in range(5):
        set_name = rng.choice(list(FLOE_SETS))
        cx, cy = rng.uniform(-5.0, 5.0), 2.0 + k * 5.5
        yaw = rng.uniform(0, 2 * math.pi)
        drift = rng.uniform(1.0, 2.2)
        for p in range(FLOE_SETS[set_name][2]):
            nm = f"{set_name}_{p}"
            ox, oz = SET_OFFSETS[nm]
            bx, by = ox * drift, -oz * drift                        # pieces drift apart a little
            x = cx + bx * math.cos(yaw) - by * math.sin(yaw)
            y = cy + bx * math.sin(yaw) + by * math.cos(yaw)
            put(objs[nm], (x, y, SEA), yaw)
    vc.plane("ocean", -30, 30, -20, 50, SEA, pm["ocean"])
    vc.preview_world(scene)
    kit.add_ortho_camera((0.0, 10.0, SEA), 55.0, 12.5 * 1600.0 / 900.0)
    vc.setup_render(scene, args.engine, args.samples, 900, 1600)
    kit.render(os.path.join(args.preview_dir, "preview-pack-ice.png"))


SEA = -1.2       # sea level used by the Vesper world profile (docs/17 section 4)
SHELF = 0.8      # shelf top in the diorama (2.0 above the sea)


def import_glb(path, keep):
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=path)
    out = {}
    for name in set(bpy.data.objects.keys()) - before:
        ob = bpy.data.objects[name]
        ob.hide_render = True
        out[name] = ob
        keep.add(name)
    return out


def put(src, loc, rot=0.0, scale=(1.0, 1.0, 1.0), name=None):
    o = bpy.data.objects.new(name or f"d_{src.name}", src.data)
    o.location = loc
    o.rotation_euler = (0.0, 0.0, rot)
    o.scale = scale
    bpy.context.scene.collection.objects.link(o)
    return o


def render_diorama(objs, args, keep):
    """Shelf edge with ice cliffs into the ocean, floes and bergs, a missile site, radiators, a pier
    with an icebreaker, Needles overhead and the Helion Ark in the water, at the 55 degree camera."""
    scene = bpy.context.scene
    pm = vc.preview_materials()
    infra = import_glb(args.infra, keep) if args.infra else {}
    ark = import_glb(args.ark, keep) if args.ark else {}
    craft = import_glb(args.craft, keep) if args.craft else {}
    rng = random.Random(f"{SEED}:diorama")
    # Shelf polygon (CCW), jagged seaward edge on its right side.
    shelf = [(-9.0, -6.0), (0.6, -6.0), (1.8, -1.5), (0.9, 2.6), (2.6, 6.2), (1.4, 10.4), (-0.6, 13.6),
             (0.8, 17.2), (-1.4, 21.0), (-9.0, 21.0)]
    kit.prism_obj("shelf", shelf, SEA - 0.6, SHELF, pm["snow"], pm["snow"])
    vc.plane("ocean", -30, 30, -20, 50, SEA, pm["ocean"])
    vc.plane("seabed", -30, 30, -20, 50, SEA - 2.5, pm["seabed"])
    # Ice cliffs along every seaward edge (front faces outward, scaled to the shelf height).
    cliffs = [o for k, o in objs.items() if k.startswith("ice_cliff")]
    for a, b in zip(shelf[:-1], shelf[1:]):
        if a[0] < -8.5 and b[0] < -8.5:
            continue
        if abs(a[1] - b[1]) < 1e-6 and a[1] < -5.9:
            continue
        ex, ey = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(ex, ey)
        nx, ny = ey / ln, -ex / ln                       # outward normal
        theta = math.atan2(nx, -ny)
        count = max(1, int(math.ceil(ln / 2.2)))
        for k in range(count):
            t = (k + 0.5) / count
            px, py = a[0] + ex * t + nx * 0.2, a[1] + ey * t + ny * 0.2
            put(rng.choice(cliffs), (px, py, SEA), theta + rng.uniform(-0.06, 0.06),
                (ln / count / 2.3, 1.0, SHELF - SEA))
    # Shelf scatter: seracs and spires near the edge, rocks, drifts, ridges.
    for name, x, y, sz in (("serac_0", 0.2, 3.6, 0.8), ("serac_2", -0.6, 9.2, 0.6), ("ice_spire_0", 0.6, 15.5, 1.1),
                           ("serac_1", -1.4, 19.0, 0.7), ("rock_outcrop_0", -4.8, 2.2, 1.0),
                           ("rock_outcrop_2", -2.6, 12.5, 1.0), ("rock_outcrop_1", -5.4, 17.5, 1.0),
                           ("snow_drift_0", -3.2, -1.0, 1.0), ("snow_drift_1", -5.6, 9.8, 1.0),
                           ("pressure_ridge_0", -2.4, 6.4, 1.0), ("vent_stack_1", -5.2, 13.8, 1.0)):
        sc = sz if name.startswith(("serac", "ice_spire")) else 1.0
        put(objs[name], (x, y, SHELF), rng.uniform(0, 6.3), (1.0, 1.0, sc))
    # Water: floes and bergs in the open sea, thinning toward the Ark.
    for k in range(26):
        x, y = rng.uniform(1.5, 7.0), rng.uniform(-4.0, 15.0)
        name = rng.choice(["floe_0", "floe_1", "floe_2", "floe_3", "floe_3", "iceberg_0", "iceberg_1", "iceberg_2"])
        sc = rng.uniform(0.6, 1.2)
        put(objs[name], (x, y, SEA), rng.uniform(0, 6.3), (sc, sc, 1.0))
    if infra:
        put(infra["vesper_missile_site"], (-1.6, 1.0, SHELF), 0.0)
        put(infra["vesper_missile_site"], (-2.2, 7.8, SHELF), 0.0)
        put(infra["vesper_cannon_site"], (-1.0, 14.2, SHELF), 0.0)
        for k in range(3):
            put(infra["vesper_radiator_array"], (-6.0 + 2.0 * k, 5.0, SHELF), 0.0)
            put(infra["vesper_radiator_array"], (-6.0 + 2.0 * k, 3.9, SHELF), 0.0)
        put(infra["vesper_cryo_dome"], (-5.2, -0.6, SHELF), 0.0)
        put(infra["vesper_comm_needle"], (-3.6, 10.6, SHELF), 0.0)
        put(infra["vesper_habitat_1"], (-4.6, 11.8, SHELF), 0.4)
        put(infra["vesper_ice_hauler"], (-3.6, 15.8, SHELF), 0.3)
        for k in range(3):                               # pier from the shelf into the water
            put(infra["vesper_pier_segment"], (2.0 + 2.0 * k + 1.0, 4.3, SEA), math.pi / 2)
        put(infra["vesper_icebreaker"], (5.3, 2.6, SEA), math.pi / 2)
    if ark:
        for name, ob in ark.items():
            if ob.type == "MESH" and name in ("ark_hull", "ark_radiator_left", "ark_radiator_right", "ark_bridge",
                                              "ark_bridge_shutter_a", "ark_bridge_shutter_b", "ark_bay_left",
                                              "ark_bay_right", "ark_bay_left_door", "ark_bay_right_door"):
                put(ob, tuple(Vector(ob.location) + Vector((3.2, 21.0, SEA))), 0.0)
    if craft:
        for k, (x, y) in enumerate(((-0.6, 13.0), (0.4, 14.0), (-1.6, 14.0))):
            put(craft["vesper_needle"], (x, y, 3.8), 0.0)
        put(craft["vesper_diamond"], (2.2, 9.0, 3.8), 0.0)
    vc.preview_world(scene)
    kit.add_ortho_camera((0.0, 10.0, -0.2), 55.0, 12.5 * 1600.0 / 900.0)
    vc.setup_render(scene, args.engine, args.samples, 900, 1600)
    kit.render(os.path.join(args.preview_dir, "preview-diorama.png"))


if __name__ == "__main__":
    main()
