"""Khepri terrain kit generator for Last Worlds.

Builds every Khepri kit mesh from code (no imported or third-party geometry),
bakes vertex colours (dusty tops, dark warm basalt sides, ray-cast ambient
occlusion), assigns the two kit materials, and exports one glTF binary.
Optionally renders a contact sheet and a small diorama for art review.

Deterministic: one fixed seed, per-piece ``random.Random`` streams derived
from the piece name, no time-based values. Two runs produce identical GLBs.

Asset contract: docs/13-khepri-world.md section 3.

Run headless from WSL (Blender on the Windows host cannot read /home paths, so
pass Windows/UNC paths produced by ``wslpath -w``)::

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \
        --background --factory-startup \
        --python "$(wslpath -w /path/to/repo/tools/blender/khepri_kit.py)" -- \
        --glb "$(wslpath -w /path/to/repo/public/assets/khepri/khepri-kit.glb)" \
        --preview-dir "$(wslpath -w /path/to/repo/art/khepri-kit)"

Arguments after ``--``:
    --glb PATH          output GLB path (required)
    --preview-dir DIR   write preview-kit.png and preview-diorama.png here
    --engine NAME       EEVEE (default) or WORKBENCH for previews
    --samples N         EEVEE render samples (default 48)
"""

import argparse
import math
import os
import random
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

KIT_SEED = "khepri-kit-v1"
BASE_Z = -0.12          # every piece extends this far below ground (contract 0.10-0.15)
CHAMFER = 0.018         # top-edge chamfer of basalt columns

CLUMP_TRI_BUDGET = 450
COLUMN_TRI_BUDGET = 80
ROCK_TRI_BUDGET = 60
CRYSTAL_TRI_BUDGET = 160

MAT_BASALT = "khepri_basalt"
MAT_MINERAL = "khepri_mineral"
COLOR_ATTR = "Col"


# ----------------------------------------------------------------------------
# Small math helpers
# ----------------------------------------------------------------------------

def clamp(x, a, b):
    return a if x < a else b if x > b else x


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def mix3(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def mul3(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


# Palette (sRGB hex from docs/13-khepri-world.md, converted to linear).
BASALT_DARK = hex_linear("#3c2f28")
BASALT_LIGHT = hex_linear("#5c4433")
DUST_DARK = hex_linear("#a8683c")
DUST_LIGHT = hex_linear("#c88a54")
DUST_BASE = hex_linear("#7a3f22")
MINERAL_EMISSION = 1.0   # core glTF emissiveFactor (no extension); runtime ACES keeps it saturated
MINERAL = hex_linear("#2fe0d4")


# ----------------------------------------------------------------------------
# 2D convex polygon helpers (CCW tuples)
# ----------------------------------------------------------------------------

def poly_area(p):
    s = 0.0
    n = len(p)
    for i in range(n):
        x1, y1 = p[i]
        x2, y2 = p[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return 0.5 * s


def poly_centroid(p):
    a = poly_area(p)
    cx = cy = 0.0
    n = len(p)
    for i in range(n):
        x1, y1 = p[i]
        x2, y2 = p[(i + 1) % n]
        k = x1 * y2 - x2 * y1
        cx += (x1 + x2) * k
        cy += (y1 + y2) * k
    return (cx / (6.0 * a), cy / (6.0 * a))


def dist2(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def tri_area(a, b, c):
    return abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) * 0.5


def clip_halfplane(poly, nx, ny, d):
    """Keep the part of a convex polygon where nx*x + ny*y <= d."""
    out = []
    n = len(poly)
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        da = nx * a[0] + ny * a[1] - d
        db = nx * b[0] + ny * b[1] - d
        if da <= 0.0:
            out.append(a)
        if (da < 0.0 < db) or (db < 0.0 < da):
            t = da / (da - db)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def corner_angle(p, i):
    a = p[i - 1]
    b = p[i]
    c = p[(i + 1) % len(p)]
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    l1 = math.hypot(*v1)
    l2 = math.hypot(*v2)
    return math.acos(clamp((v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2), -1.0, 1.0))


def simplify_poly(poly, nmin, nmax, min_edge):
    """Reduce/increase a convex polygon's vertex count into [nmin, nmax].

    Vertex removal keeps the polygon inside the original (hull of a subset);
    corner cuts also stay inside, so neighbouring columns never overlap.
    """
    p = list(poly)
    guard = 0
    while guard < 64:
        guard += 1
        changed = False
        n = len(p)
        if n > 3:
            for i in range(n):
                a = p[i]
                b = p[(i + 1) % n]
                if dist2(a, b) < min_edge:
                    ia, ib = i, (i + 1) % n
                    la = tri_area(p[ia - 1], p[ia], p[(ia + 1) % n])
                    lb = tri_area(p[ib - 1], p[ib], p[(ib + 1) % n])
                    del p[ia if la <= lb else ib]
                    changed = True
                    break
        if not changed:
            if len(p) > nmax:
                areas = [tri_area(p[i - 1], p[i], p[(i + 1) % len(p)]) for i in range(len(p))]
                del p[areas.index(min(areas))]
                changed = True
            elif len(p) < nmin:
                angles = [corner_angle(p, i) for i in range(len(p))]
                i = angles.index(min(angles))
                a, b, c = p[i - 1], p[i], p[(i + 1) % len(p)]
                la = dist2(a, b)
                lc = dist2(b, c)
                cut = max(min_edge * 1.1, 0.24 * min(la, lc))
                cut = min(cut, 0.42 * min(la, lc))
                pa = (b[0] + (a[0] - b[0]) * cut / la, b[1] + (a[1] - b[1]) * cut / la)
                pc = (b[0] + (c[0] - b[0]) * cut / lc, b[1] + (c[1] - b[1]) * cut / lc)
                p[i:i + 1] = [pa, pc]
                changed = True
        if not changed:
            break
    return p


def inset_poly(poly, dists):
    """Offset each edge of a convex CCW polygon inward by dists[i].

    Returns None when an edge would collapse or flip.
    """
    n = len(poly)
    lines = []
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        ex, ey = b[0] - a[0], b[1] - a[1]
        length = math.hypot(ex, ey)
        if length < 1e-6:
            return None
        ux, uy = ex / length, ey / length
        nx, ny = -uy, ux  # inward normal for CCW
        d = dists[i]
        lines.append(((a[0] + nx * d, a[1] + ny * d), (ux, uy)))
    out = []
    for i in range(n):
        (p1, d1) = lines[i - 1]
        (p2, d2) = lines[i]
        cross = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(cross) < 1e-9:
            return None
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / cross
        out.append((p1[0] + d1[0] * t, p1[1] + d1[1] * t))
    for i in range(n):
        a = out[i]
        b = out[(i + 1) % n]
        ex, ey = b[0] - a[0], b[1] - a[1]
        if ex * lines[i][1][0] + ey * lines[i][1][1] <= 0.004:
            return None
    return out


def point_in_convex(poly, pt):
    n = len(poly)
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        if (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]) < 0.0:
            return False
    return True


def jittered_ngon(rng, cx, cy, radius, n):
    rot = rng.uniform(0.0, 2.0 * math.pi)
    pts = []
    for i in range(n):
        ang = rot + (i + rng.uniform(-0.18, 0.18)) * 2.0 * math.pi / n
        r = radius * rng.uniform(0.9, 1.08)
        pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
    return pts


# ----------------------------------------------------------------------------
# Mesh builder
# ----------------------------------------------------------------------------

class MeshBuilder:
    """Accumulates vertices and faces plus per-face metadata for colouring."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.fmat = []      # 0 basalt, 1 mineral
        self.ftag = []      # 'side', 'ledge', 'chamfer', 'cap', 'seam', 'rock', 'shard'
        self.fgrp = []      # group id (column / chunk / shard index)
        self.groups = []    # per-group dict (colours, top height ...)

    def new_group(self, **info):
        self.groups.append(dict(info))
        return len(self.groups) - 1

    def v(self, x, y, z):
        self.verts.append([x, y, z])
        return len(self.verts) - 1

    def f(self, idx, mat=0, tag="side", grp=0):
        self.faces.append(tuple(idx))
        self.fmat.append(mat)
        self.ftag.append(tag)
        self.fgrp.append(grp)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def bounds(self):
        xs = [v[0] for v in self.verts]
        ys = [v[1] for v in self.verts]
        zs = [v[2] for v in self.verts]
        return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def prism_tris(n, joints=0):
    """Triangle cost of an open-bottom chamfered prism with ledged joints."""
    return 2 * n * (1 + joints) + 2 * n * joints + 2 * n + (n - 2)


def add_prism(mb, poly, z0, top_fn, chamfer, joints, grp, seam_edges=()):
    """Open-bottom vertical prism with ledged joints and a chamfered top.

    poly: CCW 2D polygon. z0: base height (scalar or per-vertex list).
    top_fn(x, y) -> top plane height. joints: list of (z, per-edge inset list)
    in ascending z; each adds a small dusty ledge. seam_edges: wall edges whose
    side faces use the mineral material (glowing crack faces).
    """
    n = len(poly)
    zs = z0 if isinstance(z0, (list, tuple)) else [z0] * n
    ring = [mb.v(x, y, zs[i]) for i, (x, y) in enumerate(poly)]
    cur = poly

    def wall(lo, hi, i, j):
        if i in seam_edges:
            mb.f((lo[i], lo[j], hi[j], hi[i]), 1, "seam", grp)
        else:
            mb.f((lo[i], lo[j], hi[j], hi[i]), 0, "side", grp)

    for zj, ins in joints:
        upper = inset_poly(cur, ins)
        if upper is None:
            continue
        rj = [mb.v(x, y, zj) for x, y in cur]
        for i in range(n):
            wall(ring, rj, i, (i + 1) % n)
        ru = [mb.v(x, y, zj) for x, y in upper]
        for i in range(n):
            j = (i + 1) % n
            mb.f((rj[i], rj[j], ru[j], ru[i]), 0, "ledge", grp)
        ring = ru
        cur = upper
    inner = inset_poly(cur, [chamfer] * n)
    if inner is None:
        inner = inset_poly(cur, [chamfer * 0.5] * n)
    rt = [mb.v(x, y, top_fn(x, y) - chamfer) for x, y in cur]
    for i in range(n):
        wall(ring, rt, i, (i + 1) % n)
    ri = [mb.v(x, y, top_fn(x, y)) for x, y in inner]
    for i in range(n):
        j = (i + 1) % n
        mb.f((rt[i], rt[j], ri[j], ri[i]), 0, "chamfer", grp)
    mb.f(tuple(ri), 0, "cap", grp)


def plane_top(poly, h, slope, ang):
    """Top-plane function whose highest point over poly is exactly h."""
    dx, dy = math.cos(ang), math.sin(ang)
    m = max(x * dx + y * dy for x, y in poly)

    def fn(x, y):
        return h + slope * ((x * dx + y * dy) - m)
    return fn


# ----------------------------------------------------------------------------
# Basalt column planning
# ----------------------------------------------------------------------------

class ColumnSpec:
    def __init__(self, poly, height, style, rng):
        self.poly = poly
        self.height = height
        self.style = style          # 'flat', 'tilt', 'broken'
        self.slope = 0.0
        self.slope_ang = 0.0
        self.low = height
        self.stub = None
        self.stub_slope = 0.0
        self.stub_ang = 0.0
        self.joints = []
        self.crust = None           # per-vertex heights of a mineral band at the base
        self.crust_edges = set()    # band faces that glow (a contiguous run)
        self.seam_edges = set()     # wall edges that are glowing crack faces
        n = len(poly)
        if style == "tilt":
            self.slope = rng.uniform(0.18, 0.5)
            self.slope_ang = rng.uniform(0.0, 2.0 * math.pi)
        elif style == "broken":
            ang = rng.uniform(0.0, 2.0 * math.pi)
            nx, ny = math.cos(ang), math.sin(ang)
            proj = [x * nx + y * ny for x, y in poly]
            d = lerp(min(proj), max(proj), rng.uniform(0.42, 0.62))
            stub = clip_halfplane(poly, nx, ny, d)
            stub = simplify_poly(stub, 4, 6, 0.05)
            if len(stub) >= 3 and poly_area(stub) > 0.012:
                self.stub = stub
                self.low = height - rng.uniform(0.12, 0.28)
                self.stub_slope = rng.uniform(0.0, 0.25)
                self.stub_ang = rng.uniform(0.0, 2.0 * math.pi)
            else:
                self.style = "flat"
        self.n = n

    def top_min(self):
        if self.style == "broken":
            return self.low
        fn = plane_top(self.poly, self.height, self.slope, self.slope_ang)
        return min(fn(x, y) for x, y in self.poly)

    def tri_cost(self):
        c = prism_tris(self.n, len(self.joints))
        if self.stub is not None:
            k = len(self.stub)
            c += 2 * k + 2 * k + (k - 2)
        if self.crust is not None:
            c += 2 * self.n
        return c

    def try_add_joint(self, rng):
        top = self.top_min()
        if top < 0.55:
            return False
        lo = 0.3 * top
        if self.crust is not None:
            lo = max(lo, max(self.crust) + 0.12)
        hi = 0.68 * top
        if hi <= lo:
            return False
        zj = rng.uniform(lo, hi)
        if self.joints and abs(self.joints[0][0] - zj) < 0.18:
            return False
        ins = [rng.uniform(0.002, 0.008) if rng.random() < 0.6 else rng.uniform(0.012, 0.022)
               for _ in range(self.n)]
        if inset_poly(self.poly, [i + CHAMFER + 0.01 for i in ins]) is None:
            return False
        self.joints.append((zj, ins))
        self.joints.sort(key=lambda j: j[0])
        return True

    def build(self, mb, grp):
        z0 = BASE_Z
        if self.crust is not None:
            # Jagged glowing band at the column base (mineral pooled at the cliff foot).
            n = self.n
            ring = [mb.v(x, y, BASE_Z) for x, y in self.poly]
            rc = [mb.v(x, y, self.crust[i]) for i, (x, y) in enumerate(self.poly)]
            for i in range(n):
                j = (i + 1) % n
                glow = i in self.crust_edges
                mb.f((ring[i], ring[j], rc[j], rc[i]), 1 if glow else 0, "seam" if glow else "side", grp)
            z0 = list(self.crust)
        if self.style == "broken":
            add_prism(mb, self.poly, z0, lambda x, y: self.low, CHAMFER, self.joints, grp, self.seam_edges)
            fn = plane_top(self.stub, self.height, self.stub_slope, self.stub_ang)
            add_prism(mb, self.stub, self.low - CHAMFER, fn, CHAMFER * 0.8, [], grp)
        else:
            fn = plane_top(self.poly, self.height, self.slope, self.slope_ang)
            add_prism(mb, self.poly, z0, fn, CHAMFER, self.joints, grp, self.seam_edges)


# ----------------------------------------------------------------------------
# Clumps
# ----------------------------------------------------------------------------

SQ3 = math.sqrt(3.0)

CLUMP_SPECS = [
    # 0: compact rosette with a tail; plateau-edge tops, mostly flat.
    dict(cells=[(0, 0), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1), (2, -1)],
         spacing=0.34, rscale=1.0, profile="plateau", p_tilt=0.12, p_broken=0.1, mineral=0),
    # 1: three-row wall segment stepped down toward one side; glowing cracks + crust.
    dict(cells=[(-1, 0), (0, 0), (1, 0), (-2, 1), (-1, 1), (0, 1), (1, 1), (-2, 2), (-1, 2)],
         spacing=0.33, rscale=1.0, profile="step", p_tilt=0.15, p_broken=0.12, mineral=2),
    # 2: chunky cluster of five fat columns (diameters near the 0.55 limit).
    dict(cells=[(0, 0), (1, 0), (0, 1), (1, -1), (-1, 1)],
         spacing=0.4, rscale=0.99, profile="ragged", p_tilt=0.2, p_broken=0.15, mineral=0),
    # 3: big nine-column cluster, ragged stepped ruin.
    dict(cells=[(0, 0), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1), (2, -1), (-1, 2)],
         spacing=0.32, rscale=1.0, profile="step", p_tilt=0.15, p_broken=0.12, mineral=0),
    # 4: L-shaped cluster with broken/tilted tops; glowing cracks + crust.
    dict(cells=[(0, 0), (1, 0), (-1, 0), (0, 1), (-1, 1), (1, -1), (-1, 2)],
         spacing=0.35, rscale=1.0, profile="ragged", p_tilt=0.18, p_broken=0.18, mineral=2),
    # 5: spiral staircase: heights descend around the cluster.
    dict(cells=[(0, 0), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)],
         spacing=0.34, rscale=1.02, profile="spiral", p_tilt=0.15, p_broken=0.12, mineral=0),
]


def clump_heights(rng, centers, profile):
    """Terraced tops: columns snap to two or three shared levels so neighbouring tops
    merge into larger flat blocks (mesa-like), with a stepped, broken edge on one side."""
    n = len(centers)
    ang = rng.uniform(0.0, 2.0 * math.pi)
    dx, dy = math.cos(ang), math.sin(ang)
    proj = [x * dx + y * dy for x, y in centers]
    lo, hi = min(proj), max(proj)
    rel = [(p - lo) / max(hi - lo, 1e-6) for p in proj]   # 0 = back (mesa side), 1 = front edge
    levels = [1.0, rng.uniform(0.78, 0.86), rng.uniform(0.56, 0.66)]
    if profile == "plateau":
        lv = [0] * n
        order = sorted(range(n), key=lambda i: -rel[i])
        for k, i in enumerate(order[:rng.choice((1, 2))]):
            lv[i] = 1 if k else rng.choice((1, 2))
    elif profile == "step":
        lv = [0 if r < 0.45 else (1 if r < 0.85 else 2) for r in rel]
    elif profile == "spiral":
        order = sorted(range(n), key=lambda i: math.atan2(centers[i][1], centers[i][0] + 1e-3))
        start = rng.randrange(n)
        hs = [0.0] * n
        for k in range(n):
            hs[order[(start + k) % n]] = 1.0 - 0.45 * k / max(n - 1, 1)
        hs[order[start]] = 1.0
        return hs
    elif profile.startswith("spire_") or profile.startswith("wall_"):
        return formation_heights(rng, centers, profile)
    else:  # ragged
        lv = [0 if r < 0.55 else (1 if r < 0.85 else 2) for r in (rng.random() for _ in range(n))]
    lv[min(range(n), key=lambda i: rel[i])] = 0
    hs = [clamp(levels[l] + (rng.uniform(-0.006, 0.006) if l else 0.0), 0.5, 1.0) for l in lv]
    return hs


def formation_heights(rng, centers, profile):
    """Height profiles for spires (tall narrow towers) and walls (long stepped bands).

    Walls run along x; +y (Blender) is the back row, -y the front row (glTF +Z), so
    tops step down toward glTF +Z.
    """
    n = len(centers)
    xs = [c[0] for c in centers]
    ys = [c[1] for c in centers]
    xl, xh = min(xs), max(xs)
    yl, yh = min(ys), max(ys)
    tx = [(x - xl) / max(xh - xl, 1e-6) for x in xs]
    ty = [(y - yl) / max(yh - yl, 1e-6) for y in ys]   # 1 = back row
    if profile == "spire_stair":
        order = sorted(range(n), key=lambda i: math.atan2(ys[i], xs[i] + 1e-3))
        start = rng.randrange(n)
        steps = [1.0, 0.84, 0.7, 0.58, 0.48, 0.42]
        hs = [0.0] * n
        for k in range(n):
            hs[order[(start + k) % n]] = steps[k] + (rng.uniform(-0.02, 0.02) if k else 0.0)
    elif profile == "spire_twin":
        # two tall neighbouring shafts, the rest broken low
        a = max(range(n), key=lambda i: ty[i] + 0.01 * i)
        b = min((i for i in range(n) if i != a), key=lambda i: dist2(centers[i], centers[a]))
        hs = [rng.uniform(0.42, 0.6) for _ in range(n)]
        hs[a] = 1.0
        hs[b] = rng.uniform(0.86, 0.93)
    elif profile == "spire_hoodoo":
        core = min(range(n), key=lambda i: math.hypot(*centers[i]))
        hs = [rng.uniform(0.5, 0.78) for _ in range(n)]
        ring = sorted((i for i in range(n) if i != core), key=lambda i: -hs[i])
        hs[ring[0]] = rng.uniform(0.84, 0.9)
        hs[core] = 1.0
    elif profile == "wall_band":
        cuts = sorted(rng.uniform(0.2, 0.8) for _ in range(2))
        levels = [rng.choice((1.0, 0.92, 0.84)) for _ in range(3)]
        levels[rng.randrange(3)] = 1.0
        hs = []
        for i in range(n):
            seg = 0 if tx[i] < cuts[0] else (1 if tx[i] < cuts[1] else 2)
            h = levels[seg]
            hs.append(h if ty[i] > 0.5 else h * rng.uniform(0.66, 0.78))
        for i in rng.sample(range(n), 2):          # notches in the skyline
            hs[i] = rng.uniform(0.5, 0.62)
    elif profile == "wall_terrace":
        hs = []
        for i in range(n):
            if ty[i] > 0.66:
                hs.append(1.0 if rng.random() < 0.7 else 0.95)
            elif ty[i] > 0.33:
                hs.append(rng.uniform(0.76, 0.84))
            else:
                hs.append(rng.uniform(0.55, 0.64))
        backs = [i for i in range(n) if ty[i] > 0.66]
        hs[rng.choice(backs)] = rng.uniform(0.66, 0.72)  # notch in the top tier
    else:  # wall_ramp: descends along x in four steps, front row lower
        hs = []
        for i in range(n):
            h = 1.0 - 0.15 * min(3, int(tx[i] * 4.0))
            hs.append(h if ty[i] > 0.5 else h - rng.uniform(0.1, 0.16))
        hs[rng.randrange(n)] *= 0.7
    top = max(range(n), key=lambda i: hs[i])
    hs[top] = 1.0
    return [clamp(h, 0.4, 1.0) for h in hs]


def hex_band(rows, cols):
    """Axial hex-lattice cells for a band `rows` deep and `cols` wide, centred along x."""
    cells = []
    for r in range(rows):
        lo = -(cols // 2) - r // 2
        for q in range(lo, lo + cols):
            cells.append((q, r))
    return cells


def build_clump(name, spec):
    rng = random.Random(f"{KIT_SEED}:{name}")
    s = spec["spacing"]
    centers = []
    for q, r in spec["cells"]:
        x = s * (q + r * 0.5) + rng.uniform(-0.11, 0.11) * s
        y = s * (r * SQ3 * 0.5) + rng.uniform(-0.11, 0.11) * s
        centers.append((x, y))
    cx = sum(c[0] for c in centers) / len(centers)
    cy = sum(c[1] for c in centers) / len(centers)
    centers = [(x - cx, y - cy) for x, y in centers]
    n = len(centers)
    radii = [s * 0.6 * spec["rscale"] * rng.uniform(0.88, 1.16) for _ in range(n)]

    polys = []
    for i in range(n):
        sides = rng.choice((5, 6, 6, 7))
        polys.append(jittered_ngon(rng, centers[i][0], centers[i][1], radii[i], sides))

    # Power-diagram bisectors with a narrow crevice between neighbours.
    pairs = []
    for i in range(n):
        for j in range(i + 1, n):
            ci, cj = centers[i], centers[j]
            d = dist2(ci, cj)
            if d > (radii[i] + radii[j]) * 1.15:
                continue
            ux, uy = (cj[0] - ci[0]) / d, (cj[1] - ci[1]) / d
            xi = (d * d + radii[i] ** 2 - radii[j] ** 2) / (2.0 * d)
            k = ci[0] * ux + ci[1] * uy + xi
            pairs.append([i, j, ux, uy, k, rng.uniform(0.012, 0.026)])
    # Mineral clumps: widen a couple of outer cracks; their faces will glow.
    seam_pairs = []
    if spec["mineral"]:
        outer = sorted(pairs, key=lambda q: -math.hypot(*[(centers[q[0]][t] + centers[q[1]][t]) * 0.5
                                                           for t in (0, 1)]))[:5]
        rng.shuffle(outer)
        seam_pairs = outer[:spec["mineral"]]
        for q in seam_pairs:
            q[5] = 0.05
    for i, j, ux, uy, k, gap in pairs:
        polys[i] = clip_halfplane(polys[i], ux, uy, k - gap * 0.5)
        polys[j] = clip_halfplane(polys[j], -ux, -uy, -(k + gap * 0.5))

    cols = []
    for i in range(n):
        p = simplify_poly(polys[i], 5, 7, 0.07)
        if poly_area(p) < 0:
            p.reverse()
        cols.append(p)

    seam_edges = [set() for _ in range(n)]
    for i, j, ux, uy, k, gap in seam_pairs:
        for c, line in ((i, k - gap * 0.5), (j, k + gap * 0.5)):
            p = cols[c]
            for e in range(len(p)):
                a, b = p[e], p[(e + 1) % len(p)]
                if (abs(a[0] * ux + a[1] * uy - line) < 0.006 and abs(b[0] * ux + b[1] * uy - line) < 0.006
                        and dist2(a, b) > 0.06):
                    seam_edges[c].add(e)

    # Fit the footprint (default 1.6 x 1.6 with a small margin), centred.
    xs = [x for p in cols for x, _ in p]
    ys = [y for p in cols for _, y in p]
    ox, oy = (min(xs) + max(xs)) * 0.5, (min(ys) + max(ys)) * 0.5
    fit = min(1.0, spec.get("fit_x", 1.56) / (max(xs) - min(xs)), spec.get("fit_y", 1.56) / (max(ys) - min(ys)))
    cols = [[((x - ox) * fit, (y - oy) * fit) for x, y in p] for p in cols]
    centers = [poly_centroid(p) for p in cols]

    heights = clump_heights(rng, centers, spec["profile"])
    specs = []
    for i in range(n):
        roll = rng.random()
        style = "flat"
        if heights[i] < 0.999 or roll < 0.5:
            if roll < spec["p_tilt"]:
                style = "tilt"
            elif roll < spec["p_tilt"] + spec["p_broken"]:
                style = "broken"
        cs = ColumnSpec(cols[i], heights[i], style, rng)
        if cs.style == "tilt":
            cx_, cy_ = centers[i]
            cs.slope_ang = math.atan2(cy_, cx_) + math.pi + rng.uniform(-0.7, 0.7)
        specs.append(cs)

    for i in range(n):
        specs[i].seam_edges = seam_edges[i]

    # Mineral crust: a jagged glowing band at the foot of exterior columns next to the cracks.
    if spec["mineral"]:
        exterior = []
        for i, cs in enumerate(specs):
            p = cs.poly
            for e in range(len(p)):
                a, b = p[e], p[(e + 1) % len(p)]
                mx, my = (a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5
                ex, ey = b[0] - a[0], b[1] - a[1]
                el = math.hypot(ex, ey)
                probe = (mx + ey / el * 0.1, my - ex / el * 0.1)  # outward probe
                if not any(point_in_convex(q.poly, probe) for k, q in enumerate(specs) if k != i):
                    exterior.append(i)
                    break
        seam_cols = [c for q in seam_pairs for c in q[:2] if c in exterior]
        others = [c for c in exterior if c not in seam_cols]
        rng.shuffle(others)
        chosen = []
        for c in seam_cols + others:
            if c not in chosen:
                chosen.append(c)
        for c in chosen[:spec["mineral"]]:
            cs = specs[c]
            cs.crust = [rng.uniform(0.1, 0.3) for _ in range(cs.n)]
            p = cs.poly
            ext = []
            for e in range(len(p)):
                a, b = p[e], p[(e + 1) % len(p)]
                mx, my = (a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5
                ex, ey = b[0] - a[0], b[1] - a[1]
                el = math.hypot(ex, ey)
                probe = (mx + ey / el * 0.1, my - ex / el * 0.1)
                if not any(point_in_convex(q.poly, probe) for k, q in enumerate(specs) if k != c):
                    ext.append(e)
            first = rng.choice(ext)
            cs.crust_edges = {(first + k) % cs.n for k in range(3)} | set(cs.seam_edges)

    # Joints while the triangle budget allows.
    budget = spec.get("budget", CLUMP_TRI_BUDGET) - 4
    for _pass in range(spec.get("joint_tries", 1)):
        order = list(range(n))
        rng.shuffle(order)
        for i in order:
            if rng.random() < spec.get("joint_p", 0.55):
                if specs[i].try_add_joint(rng):
                    if sum(c.tri_cost() for c in specs) > budget:
                        specs[i].joints.pop()

    mb = MeshBuilder()
    for i, cs in enumerate(specs):
        g = mb.new_group(kind="column", seed=rng.random(), top=cs.height)
        cs.build(mb, g)
    # Column diameters (corner-to-corner width) for the 0.28-0.55 contract check.
    mb.column_widths = [max(dist2(a, b) for a in cs.poly for b in cs.poly) for cs in specs]
    return mb


# ----------------------------------------------------------------------------
# Single columns
# ----------------------------------------------------------------------------

COLUMN_SPECS = [
    dict(sides=6, radius=0.25, style="flat", joints=1),
    dict(sides=5, radius=0.27, style="broken", joints=1),
    dict(sides=7, radius=0.23, style="tilt", joints=2),
]


def build_column(name, spec):
    rng = random.Random(f"{KIT_SEED}:{name}")
    poly = jittered_ngon(rng, 0.0, 0.0, spec["radius"], spec["sides"])
    if poly_area(poly) < 0:
        poly.reverse()
    poly = simplify_poly(poly, spec["sides"], spec["sides"], 0.07)
    cs = ColumnSpec(poly, 1.0, spec["style"], rng)
    tries = 0
    while len(cs.joints) < spec["joints"] and tries < 20:
        tries += 1
        cs.try_add_joint(rng)
        if cs.tri_cost() > COLUMN_TRI_BUDGET:
            cs.joints.pop()
            break
    mb = MeshBuilder()
    g = mb.new_group(kind="column", seed=rng.random(), top=1.0)
    cs.build(mb, g)
    return mb


# ----------------------------------------------------------------------------
# Rocks (convex hulls of authored point sets)
# ----------------------------------------------------------------------------

def hull_into(mb, points, grp, tag="rock", mat=0):
    """Convex hull of 3D points appended to mb (triangles, outward winding)."""
    import bmesh
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bm.verts.ensure_lookup_table()
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:], use_existing_faces=False)
    junk = list(dict.fromkeys(g for g in res["geom_interior"] + res["geom_unused"]
                              if isinstance(g, bmesh.types.BMVert)))
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    base = len(mb.verts)
    # Deterministic vertex order: as stored in bmesh.
    for v in bm.verts:
        mb.v(v.co.x, v.co.y, v.co.z)
    for f in bm.faces:
        mb.f(tuple(base + v.index for v in f.verts), mat, tag, grp)
    bm.free()


def rotate_pts(pts, rx, ry, rz):
    from mathutils import Euler
    m = Euler((rx, ry, rz), "XYZ").to_matrix()
    return [tuple(m @ Vector(p)) for p in pts]


def seat(points, base_z=BASE_Z):
    """Translate points so footprint centre is at origin and lowest z is base_z."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    ox = (min(xs) + max(xs)) * 0.5
    oy = (min(ys) + max(ys)) * 0.5
    oz = min(zs) - base_z
    return [(p[0] - ox, p[1] - oy, p[2] - oz) for p in points]


def prism_points(rng, sides, radius, length, cut=0.0):
    """Points of a jittered polygonal prism along +z with an oblique end cut."""
    poly = jittered_ngon(rng, 0.0, 0.0, radius, sides)
    ang = rng.uniform(0, 2 * math.pi)
    pts = []
    for x, y in poly:
        pts.append((x, y, 0.0))
        pts.append((x, y, length + cut * (x * math.cos(ang) + y * math.sin(ang)) / radius))
    return pts


def block_points(rng, sx, sy, sz, cuts):
    """Box corners with some corners sliced off (angular fractured chunk)."""
    corners = [(x * sx, y * sy, z * sz) for x in (-0.5, 0.5) for y in (-0.5, 0.5) for z in (0.0, 1.0)]
    pts = []
    sliced = set(rng.sample(range(8), cuts))
    for i, c in enumerate(corners):
        if i in sliced:
            # replace the corner with three points pulled along its edges
            for axis in range(3):
                k = rng.uniform(0.18, 0.42)
                q = list(c)
                if axis < 2:
                    q[axis] = c[axis] * (1.0 - 2.0 * k)
                else:
                    q[axis] = c[2] - sz * k if c[2] > 0 else sz * k
                pts.append(tuple(q))
        else:
            pts.append((c[0] * rng.uniform(0.92, 1.05), c[1] * rng.uniform(0.92, 1.05), c[2]))
    return pts


def build_rock(name, idx):
    rng = random.Random(f"{KIT_SEED}:{name}")
    mb = MeshBuilder()
    if idx == 0:
        # big angular boulder
        pts = block_points(rng, 0.62, 0.5, 0.5, 4)
        pts = rotate_pts(pts, rng.uniform(-0.25, 0.25), rng.uniform(-0.3, 0.3), rng.uniform(0, math.pi))
        g = mb.new_group(kind="rock", seed=rng.random())
        hull_into(mb, seat(pts), g)
    elif idx == 1:
        # fallen column segment lying on its side, oblique break
        pts = prism_points(rng, 6, 0.2, 0.5, cut=0.12)
        pts = rotate_pts(pts, math.pi / 2 + rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(0, math.pi))
        g = mb.new_group(kind="rock", seed=rng.random())
        hull_into(mb, seat(pts), g)
    elif idx == 2:
        # medium chunk: short column stump, tilted
        pts = prism_points(rng, 5, 0.2, 0.42, cut=0.14)
        pts = rotate_pts(pts, rng.uniform(0.25, 0.5), rng.uniform(-0.3, 0.3), rng.uniform(0, math.pi))
        g = mb.new_group(kind="rock", seed=rng.random())
        hull_into(mb, seat(pts), g)
    elif idx == 3:
        # flat slab
        pts = prism_points(rng, 5, 0.27, 0.2, cut=0.08)
        pts = rotate_pts(pts, rng.uniform(0.12, 0.3), rng.uniform(-0.15, 0.15), rng.uniform(0, math.pi))
        g = mb.new_group(kind="rock", seed=rng.random())
        hull_into(mb, seat(pts), g)
    else:
        # talus pile (4) / pebble scatter (5): several small chunks in one mesh
        if idx == 4:
            sizes = [0.28, 0.21, 0.17, 0.13]
            spread = 0.24
        else:
            sizes = [0.2, 0.17, 0.14, 0.12]
            spread = 0.3
        chunks = []
        placed = []
        for k, sz in enumerate(sizes):
            for _attempt in range(30):
                px, py = rng.uniform(-spread, spread), rng.uniform(-spread, spread)
                if all(math.hypot(px - qx, py - qy) > (sz + qs) * 0.55 for qx, qy, qs in placed):
                    break
            placed.append((px, py, sz))
            # Pebbles stay cheap: a box with at most one sliced corner (<= 16 tris)
            # or a four-sided stump (12 tris), so the pile fits the 60-tri budget.
            if rng.random() < 0.55:
                pts = block_points(rng, sz, sz * rng.uniform(0.7, 1.0), sz * rng.uniform(0.6, 0.9),
                                   1 if k < 2 else 0)
            else:
                pts = prism_points(rng, 4, sz * 0.62, sz * rng.uniform(0.6, 1.0), cut=sz * 0.3)
            pts = rotate_pts(pts, rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, math.pi))
            zs = min(p[2] for p in pts)
            sink = BASE_Z + rng.uniform(0.0, 0.03)
            pts = [(p[0] + px, p[1] + py, p[2] - zs + sink) for p in pts]
            chunks.append(pts)
        allp = [p for c in chunks for p in c]
        xs = [p[0] for p in allp]
        ys = [p[1] for p in allp]
        ox, oy = (min(xs) + max(xs)) * 0.5, (min(ys) + max(ys)) * 0.5
        zmin = min(p[2] for p in allp)
        for pts in chunks:
            g = mb.new_group(kind="rock", seed=rng.random())
            hull_into(mb, [(p[0] - ox, p[1] - oy, p[2] - zmin + BASE_Z) for p in pts], g)
    return mb


# ----------------------------------------------------------------------------
# Formations added for elevation variety: spires, walls, fallen columns, boulders
# ----------------------------------------------------------------------------

SPIRE_SPECS = [
    # 0: five-column tower whose tops spiral down like a staircase.
    dict(cells=[(0, 0), (1, 0), (0, 1), (-1, 1), (0, -1)], spacing=0.31, rscale=1.0,
         profile="spire_stair", p_tilt=0.2, p_broken=0.2, mineral=0,
         fit_x=0.96, fit_y=0.96, joint_p=0.9, joint_tries=2),
    # 1: twin shafts with broken low stubs at their feet.
    dict(cells=[(0, 0), (1, 0), (0, 1), (1, -1)], spacing=0.33, rscale=1.0,
         profile="spire_twin", p_tilt=0.25, p_broken=0.3, mineral=0,
         fit_x=0.96, fit_y=0.96, joint_p=0.9, joint_tries=2),
    # 2: hoodoo: tall core ringed by lower columns.
    dict(cells=[(0, 0), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1)], spacing=0.3, rscale=1.0,
         profile="spire_hoodoo", p_tilt=0.25, p_broken=0.25, mineral=0,
         fit_x=0.96, fit_y=0.96, joint_p=0.9, joint_tries=2),
]

WALL_SPECS = [
    # 0: two-deep band of 14, skyline in three segments with two notches.
    dict(cells=hex_band(2, 7), spacing=0.36, rscale=1.0, profile="wall_band",
         p_tilt=0.15, p_broken=0.15, mineral=0, fit_x=2.56, fit_y=1.16, budget=700, joint_p=0.6),
    # 1: three-deep terraced band (14 columns), stepping down to the front; glowing crack.
    dict(cells=hex_band(3, 5)[:-1], spacing=0.35, rscale=1.0, profile="wall_terrace",
         p_tilt=0.15, p_broken=0.15, mineral=1, fit_x=2.56, fit_y=1.16, budget=700, joint_p=0.6),
    # 2: two-deep band of 12 descending along x like a staircase.
    dict(cells=hex_band(2, 6), spacing=0.38, rscale=1.0, profile="wall_ramp",
         p_tilt=0.2, p_broken=0.15, mineral=0, fit_x=2.56, fit_y=1.16, budget=700, joint_p=0.6),
]


def add_log(mb, poly, length, grp, chamfer0=CHAMFER, chamfer1=CHAMFER, cut=None):
    """Closed polygonal column segment along local +z (0..length).

    Ends are chamfered (old column joints) or, with chamfer 0, sharp fresh breaks;
    cut=(slope, angle) tilts the far end into an oblique break.
    """
    n = len(poly)
    if cut:
        dx, dy = math.cos(cut[1]), math.sin(cut[1])
        m = max(x * dx + y * dy for x, y in poly)

        def zf(x, y):
            return length + cut[0] * (x * dx + y * dy - m)
    else:
        def zf(x, y):
            return length

    def ring(pts, zfun):
        return [mb.v(x, y, zfun(x, y)) for x, y in pts]

    if chamfer0 > 0:
        c0 = ring(inset_poly(poly, [chamfer0] * n), lambda x, y: 0.0)
        o0 = ring(poly, lambda x, y: chamfer0)
        mb.f(tuple(reversed(c0)), 0, "side", grp)
        for i in range(n):
            j = (i + 1) % n
            mb.f((o0[j], o0[i], c0[i], c0[j]), 0, "side", grp)
    else:
        o0 = ring(poly, lambda x, y: 0.0)
        mb.f(tuple(reversed(o0)), 0, "side", grp)
    if chamfer1 > 0:
        o1 = ring(poly, lambda x, y: zf(x, y) - chamfer1)
        c1 = ring(inset_poly(poly, [chamfer1] * n), zf)
    else:
        o1 = ring(poly, zf)
        c1 = None
    for i in range(n):
        j = (i + 1) % n
        mb.f((o0[i], o0[j], o1[j], o1[i]), 0, "side", grp)
    if c1 is not None:
        for i in range(n):
            j = (i + 1) % n
            mb.f((o1[i], o1[j], c1[j], c1[i]), 0, "side", grp)
        mb.f(tuple(c1), 0, "side", grp)
    else:
        mb.f(tuple(o1), 0, "side", grp)


def log_matrix(start, yaw, tilt, roll):
    """Local +z along (yaw, tilt); local -x points as far down as possible, then roll."""
    from mathutils import Matrix
    d = Vector((math.cos(yaw) * math.cos(tilt), math.sin(yaw) * math.cos(tilt), math.sin(tilt)))
    q = d.to_track_quat("Z", "X")
    return Matrix.Translation(start) @ q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, "Z")


def bottom_roll(poly, edge):
    """Roll that turns `edge` of poly into the face lying on the ground (normal to local -x)."""
    a, b = poly[edge], poly[(edge + 1) % len(poly)]
    phi = math.atan2(-(b[0] - a[0]), b[1] - a[1])
    return math.pi - phi


def apothem(poly, edge):
    a, b = poly[edge], poly[(edge + 1) % len(poly)]
    ex, ey = b[0] - a[0], b[1] - a[1]
    return abs(a[0] * ey - a[1] * ex) / math.hypot(ex, ey)


def merge_transformed(dst, src, matrix):
    base = len(dst.verts)
    for v in src.verts:
        p = matrix @ Vector(v)
        dst.v(p.x, p.y, p.z)
    gmap = {gi: dst.new_group(**g) for gi, g in enumerate(src.groups)}
    for f, m, t, g in zip(src.faces, src.fmat, src.ftag, src.fgrp):
        dst.f(tuple(base + i for i in f), m, t, gmap[g])


def lying_log(mb, rng, poly, length, x0, y0, yaw, tilt=0.0, chamfer0=CHAMFER, chamfer1=CHAMFER, cut=None):
    """A column segment lying on one face, near end centred at (x0, y0), bottom at -0.10."""
    edge = rng.randrange(len(poly))
    sub = MeshBuilder()
    g = sub.new_group(kind="log", seed=rng.random())
    add_log(sub, poly, length, g, chamfer0, chamfer1, cut)
    merge_transformed(mb, sub, log_matrix((x0, y0, apothem(poly, edge) - 0.10), yaw, tilt, bottom_roll(poly, edge)))


def rubble(mb, rng, x, y, size):
    pts = block_points(rng, size, size * rng.uniform(0.7, 1.0), size * rng.uniform(0.55, 0.85), 1)
    pts = rotate_pts(pts, rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, math.pi))
    zmin = min(p[2] for p in pts)
    g = mb.new_group(kind="rock", seed=rng.random())
    hull_into(mb, [(p[0] + x, p[1] + y, p[2] - zmin + BASE_Z + rng.uniform(0.0, 0.03)) for p in pts], g)


def log_poly(rng, radius, sides):
    poly = jittered_ngon(rng, 0.0, 0.0, radius, sides)
    if poly_area(poly) < 0:
        poly.reverse()
    return simplify_poly(poly, sides, sides, 0.07)


def build_fallen(name, idx):
    rng = random.Random(f"{KIT_SEED}:{name}")
    mb = MeshBuilder()
    if idx == 0:
        # A toppled column broken in two; the pieces drifted apart, rubble at the break.
        poly = log_poly(rng, 0.22, 6)
        lying_log(mb, rng, poly, 0.74, -0.74, -0.02, rng.uniform(-0.05, 0.05),
                  chamfer1=0.0, cut=(0.5, rng.uniform(0, 2 * math.pi)))
        lying_log(mb, rng, poly, 0.56, 0.72, 0.04, math.pi + rng.uniform(0.12, 0.2),
                  chamfer1=0.0, cut=(0.4, rng.uniform(0, 2 * math.pi)))
        for x, y, sz in ((0.07, -0.16, 0.13), (0.1, 0.17, 0.1), (-0.05, 0.12, 0.08), (0.62, -0.2, 0.09)):
            rubble(mb, rng, x, y, sz)
    else:
        # A long pentagonal column leaning on a rubble block, with a broken-off drum.
        poly = log_poly(rng, 0.18, 5)
        lying_log(mb, rng, poly, 1.02, -0.5, 0.0, rng.uniform(-0.04, 0.04), tilt=math.radians(7.0),
                  chamfer1=0.0, cut=(0.6, rng.uniform(0, 2 * math.pi)))
        rubble(mb, rng, 0.36, 0.02, 0.2)
        lying_log(mb, rng, poly, 0.26, -0.68, 0.08, math.pi + rng.uniform(0.35, 0.5),
                  chamfer0=0.0, chamfer1=0.0, cut=(0.35, rng.uniform(0, 2 * math.pi)))
        for x, y, sz in ((0.12, -0.17, 0.09), (0.6, 0.16, 0.1), (-0.25, 0.17, 0.08)):
            rubble(mb, rng, x, y, sz)
    return mb


def build_boulder(name, idx):
    rng = random.Random(f"{KIT_SEED}:{name}")
    mb = MeshBuilder()
    if idx == 0:
        # A short, thick column drum tipped onto its shoulder, a wedge split off its flank.
        poly = log_poly(rng, 0.44, 6)
        sub = MeshBuilder()
        g = sub.new_group(kind="log", seed=rng.random())
        add_log(sub, poly, 0.5, g, 0.03, 0.03, cut=(0.22, rng.uniform(0, 2 * math.pi)))
        merge_transformed(mb, sub, log_matrix((0.0, 0.0, -0.32), rng.uniform(0, 2 * math.pi),
                                              math.radians(72.0), rng.uniform(0, 2 * math.pi)))
        wedge = block_points(rng, 0.36, 0.22, 0.34, 2)
        wedge = rotate_pts(wedge, rng.uniform(-0.3, 0.3), 0.5, rng.uniform(0, math.pi))
        zmin = min(p[2] for p in wedge)
        g = mb.new_group(kind="rock", seed=rng.random())
        hull_into(mb, [(p[0] + 0.42, p[1] - 0.22, p[2] - zmin + BASE_Z) for p in wedge], g)
        rubble(mb, rng, -0.38, 0.36, 0.11)
    else:
        # A big fractured block split along a crack, the halves leaning apart.
        sx, sy, sz = 1.06, 0.9, 0.6
        for half, sign in ((0, -1.0), (1, 1.0)):
            pts = block_points(rng, sx * 0.5, sy * rng.uniform(0.85, 1.0), sz * rng.uniform(0.8, 1.0), 5)
            pts = [(p[0] + sign * (sx * 0.25 + 0.03), p[1], p[2]) for p in pts]
            pts = rotate_pts(pts, rng.uniform(-0.08, 0.08), sign * math.radians(9.0), rng.uniform(-0.12, 0.12))
            zmin = min(p[2] for p in pts)
            g = mb.new_group(kind="rock", seed=rng.random())
            hull_into(mb, [(p[0], p[1], p[2] - zmin + BASE_Z) for p in pts], g)
        rubble(mb, rng, 0.05, -0.48, 0.12)
    return mb


# ----------------------------------------------------------------------------
# Alien landmarks: crystal spires, basalt rosette, hoodoos
# ----------------------------------------------------------------------------

def stub(mb, rng, cx, cy, radius, sides, height, kind="column", side_mix=0.0):
    """Short chamfered basalt column stub standing on the ground (open buried bottom)."""
    poly = jittered_ngon(rng, cx, cy, radius, sides)
    if poly_area(poly) < 0:
        poly.reverse()
    poly = simplify_poly(poly, sides, sides, 0.05)
    g = mb.new_group(kind=kind, seed=rng.random(), side_mix=side_mix)
    add_prism(mb, poly, BASE_Z, lambda x, y: height, CHAMFER, [], g)


def build_crystal_spire(name, idx):
    """Large turquoise crystal growth breaking out of a basalt base."""
    rng = random.Random(f"{KIT_SEED}:{name}")
    mb = MeshBuilder()
    if idx == 0:
        # Broken column stubs split apart by one dominant prism and its satellites.
        for cx, cy, r, h in ((-0.2, -0.12, 0.2, 0.32), (0.18, -0.2, 0.17, 0.22), (0.05, 0.24, 0.19, 0.27)):
            stub(mb, rng, cx, cy, r, 6, h)
        rubble(mb, rng, 0.36, 0.18, 0.16)
        shards = [((0.0, 0.0, 0.02), 0.1, 0.0, 0.16, 1.0),
                  ((0.1, 0.05, 0.08), 0.55, 0.6, 0.1, 0.66), ((-0.12, 0.08, 0.1), 0.5, 2.6, 0.09, 0.6),
                  ((0.02, -0.12, 0.08), 0.62, 4.4, 0.08, 0.5), ((-0.05, 0.14, 0.15), 0.85, 1.7, 0.06, 0.38),
                  ((0.16, -0.06, 0.12), 0.9, 5.6, 0.05, 0.3)]
    else:
        # A boulder cracked open by two leaning co-dominant prisms.
        pts = block_points(rng, 0.78, 0.66, 0.42, 4)
        pts = rotate_pts(pts, rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), rng.uniform(0, math.pi))
        zmin = min(p[2] for p in pts)
        g = mb.new_group(kind="rock", seed=rng.random())
        hull_into(mb, [(p[0], p[1], p[2] - zmin + BASE_Z) for p in pts], g)
        shards = [((-0.05, 0.02, 0.18), 0.28, 2.2, 0.14, 1.06), ((0.12, -0.05, 0.16), 0.42, 5.5, 0.12, 0.84),
                  ((0.0, 0.16, 0.2), 0.7, 1.2, 0.07, 0.45), ((-0.18, -0.1, 0.18), 0.78, 3.6, 0.07, 0.42),
                  ((0.22, 0.12, 0.15), 0.95, 0.3, 0.05, 0.3), ((-0.06, -0.2, 0.2), 0.9, 4.6, 0.05, 0.32)]
    for (bx, by, bz), tilt, az, radius, length in shards:
        axis = (math.sin(tilt) * math.cos(az), math.sin(tilt) * math.sin(az), math.cos(tilt))
        g = mb.new_group(kind="shard", seed=rng.random(), length=length, base_z=bz)
        add_shard(mb, (bx, by, bz), axis, radius, length, g, rng)
    return mb


def build_rosette(name):
    """Fan-shaped rosette: hexagonal columns radiating from a buried focus."""
    rng = random.Random(f"{KIT_SEED}:{name}")
    mb = MeshBuilder()
    focus = (0.0, 0.0, -0.36)
    rings = [(1, 2.0, 1.3), (6, 28.0, 1.18), (9, 54.0, 0.94)]
    for count, tilt_deg, length in rings:
        off = rng.uniform(0, 2 * math.pi)
        for k in range(count):
            az = off + 2.0 * math.pi * (k + rng.uniform(-0.15, 0.15)) / count
            tilt = math.radians(tilt_deg + rng.uniform(-5.0, 5.0))
            r = rng.uniform(0.115, 0.14)
            poly = log_poly(rng, r, 6)
            sub = MeshBuilder()
            g = sub.new_group(kind="log", seed=rng.random())
            ln = length * rng.uniform(0.92, 1.05)
            add_log(sub, poly, ln, g, chamfer0=0.0, chamfer1=CHAMFER,
                    cut=(rng.uniform(0.15, 0.35), rng.uniform(0, 2 * math.pi)) if rng.random() < 0.3 else None)
            merge_transformed(mb, sub, log_matrix(focus, az, math.pi * 0.5 - tilt, rng.uniform(0, 2 * math.pi)))
    for k in range(3):
        a = rng.uniform(0, 2 * math.pi)
        rubble(mb, rng, math.cos(a) * 0.62, math.sin(a) * 0.62, rng.uniform(0.09, 0.13))
    return mb


def build_hoodoo(name, idx):
    """Eroded, banded shaft of stacked drums narrowing to a neck, with a balanced basalt cap."""
    rng = random.Random(f"{KIT_SEED}:{name}")
    mb = MeshBuilder()

    def shaft(cx, cy, drums, sides):
        for k, (r, z0, z1) in enumerate(drums):
            ox, oy = cx + rng.uniform(-0.025, 0.025), cy + rng.uniform(-0.025, 0.025)
            poly = jittered_ngon(rng, ox, oy, r, sides)
            if poly_area(poly) < 0:
                poly.reverse()
            poly = simplify_poly(poly, sides, sides, 0.04)
            g = mb.new_group(kind="column", seed=rng.random(), side_mix=0.42 + 0.14 * (k % 2))
            add_prism(mb, poly, z0, lambda x, y, z1=z1: z1, CHAMFER, [], g)

    def cap(cx, cy, z, r, thick, sides):
        poly = log_poly(rng, r, sides)
        sub = MeshBuilder()
        g = sub.new_group(kind="log", seed=rng.random())
        add_log(sub, poly, thick, g, 0.025, 0.025)
        merge_transformed(mb, sub, log_matrix((cx, cy, z), rng.uniform(0, 2 * math.pi),
                                              math.pi * 0.5 - math.radians(rng.uniform(4.0, 9.0)),
                                              rng.uniform(0, 2 * math.pi)))

    if idx == 0:
        shaft(0.0, 0.0, [(0.36, BASE_Z, 0.22), (0.27, 0.2, 0.44), (0.2, 0.42, 0.6), (0.13, 0.58, 0.74)], 7)
        cap(0.02, -0.02, 0.71, 0.33, 0.26, 6)
        rubble(mb, rng, 0.36, -0.22, 0.12)
        rubble(mb, rng, -0.3, 0.3, 0.1)
    else:
        shaft(-0.12, 0.05, [(0.3, BASE_Z, 0.26), (0.22, 0.24, 0.5), (0.16, 0.48, 0.66), (0.11, 0.64, 0.78)], 6)
        cap(-0.05, 0.08, 0.75, 0.3, 0.22, 6)
        shaft(0.28, -0.22, [(0.15, BASE_Z, 0.3)], 6)
        cap(0.28, -0.22, 0.28, 0.17, 0.11, 5)
    return mb


# ----------------------------------------------------------------------------
# Crystals
# ----------------------------------------------------------------------------

CRYSTAL_SPECS = [
    dict(count=8, tall=0.66, spread=0.42, tilt=(0.2, 0.7), main_r=0.095, r=(0.045, 0.075)),
    dict(count=7, tall=0.5, spread=0.5, tilt=(0.35, 0.85), main_r=0.085, r=(0.045, 0.07)),
    dict(count=6, tall=0.4, spread=0.34, tilt=(0.2, 0.75), main_r=0.075, r=(0.04, 0.06)),
]


def add_shard(mb, base, axis, radius, length, grp, rng):
    """Hexagonal shard with a pointed tip: 18 triangles, open (buried) bottom."""
    a = Vector(axis).normalized()
    t1 = a.orthogonal().normalized()
    t2 = a.cross(t1).normalized()
    b = Vector(base)
    body = length * rng.uniform(0.62, 0.74)
    rot = rng.uniform(0, math.pi)
    radii = [radius * rng.uniform(0.85, 1.1) for _ in range(6)]
    bot = []
    top = []
    for i in range(6):
        ang = rot + i * math.pi / 3.0
        d = t1 * math.cos(ang) + t2 * math.sin(ang)
        bot.append(mb.v(*(b + d * radii[i])))
        top.append(mb.v(*(b + a * body + d * radii[i] * 0.88)))
    tip = mb.v(*(b + a * length))
    for i in range(6):
        j = (i + 1) % 6
        mb.f((bot[i], bot[j], top[j], top[i]), 1, "shard", grp)
        mb.f((top[i], top[j], tip), 1, "shard", grp)


def build_crystal(name, spec):
    rng = random.Random(f"{KIT_SEED}:{name}")
    mb = MeshBuilder()
    n = spec["count"]
    for k in range(n):
        main = k == 0
        az = (k / n) * 2.0 * math.pi + rng.uniform(-0.35, 0.35)
        if main:
            tilt = rng.uniform(0.0, 0.12)
            r_off = 0.0
            length = spec["tall"] + 0.1
            radius = spec["main_r"]
        else:
            tilt = rng.uniform(*spec["tilt"])
            r_off = rng.uniform(0.3, 1.0) * spec["spread"] * 0.5
            length = (spec["tall"] + 0.1) * rng.uniform(0.4, 0.82)
            radius = rng.uniform(*spec["r"])
        axis = (math.sin(tilt) * math.cos(az), math.sin(tilt) * math.sin(az), math.cos(tilt))
        base = (math.cos(az) * r_off, math.sin(az) * r_off, -0.1)
        g = mb.new_group(kind="shard", seed=rng.random(), length=length, base_z=-0.1)
        add_shard(mb, base, axis, radius, length, g, rng)
    return mb


# ----------------------------------------------------------------------------
# Normalisation: pivot at base centre, exact heights, footprint fit
# ----------------------------------------------------------------------------

def normalise(mb, footprint, top=None, max_top=None, max_height=None):
    x0, x1, y0, y1, z0, z1 = mb.bounds()
    ox, oy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    fx, fy = (footprint, footprint) if isinstance(footprint, (int, float)) else footprint
    fit = min(1.0, (fx * 0.5 - 0.005) / ((x1 - x0) * 0.5), (fy * 0.5 - 0.005) / ((y1 - y0) * 0.5))
    for v in mb.verts:
        v[0] = (v[0] - ox) * fit
        v[1] = (v[1] - oy) * fit
    if hasattr(mb, "column_widths"):
        mb.column_widths = [w * fit for w in mb.column_widths]
    # Seat: lowest point at BASE_Z (kept within 0.10-0.15 below ground).
    if abs(z0 - BASE_Z) > 0.03:
        for v in mb.verts:
            v[2] += BASE_Z - z0
    x0, x1, y0, y1, z0, z1 = mb.bounds()
    target = None
    if top is not None:
        target = top
    elif max_top is not None and z1 > max_top:
        target = max_top
    if max_height is not None and (z1 - z0) > max_height:
        target = min(target if target is not None else z1, z0 + max_height)
    if target is not None and z1 > 0:
        k = target / z1
        for v in mb.verts:
            if v[2] > 0:
                v[2] *= k
        for v in mb.verts:
            if abs(v[2] - target) < 1e-6:
                v[2] = target
    for g in mb.groups:
        if "top" in g:
            g["top"] = None
    # recompute per-group top heights for colouring
    tops = {}
    for f, grp in zip(mb.faces, mb.fgrp):
        for i in f:
            tops[grp] = max(tops.get(grp, -9.0), mb.verts[i][2])
    for gi, g in enumerate(mb.groups):
        g["top"] = tops.get(gi, 1.0)


# ----------------------------------------------------------------------------
# Vertex colours (dust, basalt, ray-cast AO)
# ----------------------------------------------------------------------------

def hemisphere_dirs(count):
    golden = math.pi * (3.0 - math.sqrt(5.0))
    dirs = []
    for k in range(count):
        u = (k + 0.5) / count
        r = math.sqrt(u)
        phi = k * golden
        dirs.append((r * math.cos(phi), r * math.sin(phi), math.sqrt(max(0.0, 1.0 - u))))
    return dirs


AO_DIRS = hemisphere_dirs(64)


def face_normal(verts, f):
    nx = ny = nz = 0.0
    n = len(f)
    for i in range(n):
        a = verts[f[i]]
        b = verts[f[(i + 1) % n]]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return Vector((nx / length, ny / length, nz / length))


def box_uv(gx, gy, gz, nx, ny, nz):
    """World-scale box projection in glTF space (+Y up), 1 UV unit = 1 unit.

    Axis chosen per face by the dominant normal component (ties: Y, then X, then Z):
      |nY| dominant: (u, v) = (X, Z)
      |nX| dominant: (u, v) = (-sign(nX) * Z, -Y)
      |nZ| dominant: (u, v) = ( sign(nZ) * X, -Y)
    Walls are upright (v grows downward, glTF convention) and not mirrored.
    """
    ax, ay, az = abs(nx), abs(ny), abs(nz)
    if ay >= ax and ay >= az:
        return gx, gz
    if ax >= az:
        return (-gz if nx > 0 else gz), -gy
    return (gx if nz > 0 else -gx), -gy


def ambient_occlusion(bvh, origin, normal, max_dist):
    t1 = normal.orthogonal().normalized()
    t2 = normal.cross(t1)
    hits = 0
    for dx, dy, dz in AO_DIRS:
        d = t1 * dx + t2 * dy + normal * dz
        if d.z < -1e-6 and origin.z > 0.0:
            if -origin.z / d.z < max_dist:
                hits += 1
                continue
        loc, _n, _i, _d = bvh.ray_cast(origin, d, max_dist)
        if loc is not None:
            hits += 1
    return 1.0 - hits / len(AO_DIRS)


def bake_colours(mb, kind):
    """Per-corner linear RGBA colours for the mesh in face order."""
    verts = [Vector(v) for v in mb.verts]
    bvh = BVHTree.FromPolygons(verts, mb.faces, all_triangles=False, epsilon=0.0)
    rng = random.Random(f"{KIT_SEED}:colour:{kind}:{len(mb.faces)}")
    piece_dust = rng.uniform(0.3, 0.7)     # one dust tone per piece; columns vary only slightly
    group_cols = []
    for g in mb.groups:
        grng = random.Random(f"{KIT_SEED}:group:{g.get('seed', 0.0):.9f}")
        side = mix3(BASALT_DARK, BASALT_LIGHT, grng.uniform(0.0, 1.0) ** 1.5)
        warm = grng.uniform(-0.04, 0.06)
        side = (side[0] * (1.0 + warm), side[1], side[2] * (1.0 - warm))
        dust = mix3(DUST_DARK, DUST_LIGHT, clamp(piece_dust + grng.uniform(-0.12, 0.12), 0.0, 1.0))
        if g.get("side_mix"):
            side = mix3(side, DUST_DARK, g["side_mix"])     # banded, eroded hoodoo shafts
        group_cols.append((side, dust))

    out = []
    for fi, f in enumerate(mb.faces):
        tag = mb.ftag[fi]
        grp = mb.fgrp[fi]
        nrm = face_normal(mb.verts, f)
        cen = Vector((0.0, 0.0, 0.0))
        for i in f:
            cen += verts[i]
        cen /= len(f)
        jitter = rng.uniform(0.82, 1.12)
        if mb.fmat[fi] == 1:
            # Mineral faces: neutral white so the material colour shows unchanged;
            # crystal shards fade slightly darker toward their buried base.
            g = mb.groups[grp]
            for i in f:
                if tag == "shard":
                    L = g.get("length", 0.6)
                    h = clamp((verts[i].z - g.get("base_z", -0.1)) / L, 0.0, 1.0)
                    v = lerp(0.55, 1.0, h)
                else:
                    v = 1.0
                out.append((v, v, v, 1.0))
            continue
        side, dust = group_cols[grp]
        top_z = mb.groups[grp].get("top", 1.0)
        rock = mb.groups[grp].get("kind") == "rock"
        up = nrm.z
        # Vertical streaking: each wall face gets its own value, with a lighter and
        # a darker top corner so streaks run down the column faces.
        streak = rng.uniform(0.85, 1.12)
        for ci_, i in enumerate(f):
            p = verts[i]
            sample = p + (cen - p) * 0.1 + nrm * 0.002
            if sample.z <= 0.0:
                ao = 0.1
            else:
                ao = ambient_occlusion(bvh, sample, nrm, 0.42)
            w = smoothstep(0.42, 0.92, up)
            col_scale = 1.0
            if tag == "chamfer":
                w = 1.0
                col_scale = 0.9
            if tag == "ledge":
                w = max(w, 0.6)
            if rock:
                w *= 0.7
            if up < 0.42:
                rel = clamp((p.z - (top_z - 0.22)) / 0.22, 0.0, 1.0)
                w = max(w, 0.16 * rel * rel)
            base_w = 0.28 * clamp(1.0 - p.z / 0.12, 0.0, 1.0) if up < 0.42 else 0.0
            col = mix3(side, dust, w)
            if tag == "chamfer":
                col = mul3(col, col_scale)
            col = mix3(col, DUST_BASE, base_w)
            if up < 0.42:
                col = mul3(col, jitter * (streak if (ci_ % 2) else 1.0))
            else:
                col = mul3(col, lerp(jitter, 1.0, 0.6) * rng.uniform(0.9, 1.06))
            occl = lerp(0.14, 1.0, ao ** 1.3)
            col = mul3(col, occl)
            out.append((col[0], col[1], col[2], 1.0))
    return out


# ----------------------------------------------------------------------------
# Blender objects, materials, export
# ----------------------------------------------------------------------------

def make_materials():
    def principled(mat):
        try:
            mat.use_nodes = True
        except Exception:
            pass
        nt = mat.node_tree
        bsdf = None
        for node in nt.nodes:
            if node.type == "BSDF_PRINCIPLED":
                bsdf = node
        if bsdf is None:
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        return nt, bsdf

    basalt = bpy.data.materials.new(MAT_BASALT)
    nt, bsdf = principled(basalt)
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)  # exported as baseColorFactor
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = COLOR_ATTR
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Metallic"].default_value = 0.0
    basalt.diffuse_color = (0.12, 0.08, 0.06, 1.0)
    basalt.use_backface_culling = True  # single-sided in glTF

    mineral = bpy.data.materials.new(MAT_MINERAL)
    nt, bsdf = principled(mineral)
    bsdf.inputs["Base Color"].default_value = (*MINERAL, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Emission Color"].default_value = (*MINERAL, 1.0)
    bsdf.inputs["Emission Strength"].default_value = MINERAL_EMISSION
    mineral.diffuse_color = (*MINERAL, 1.0)
    mineral.use_backface_culling = True
    return basalt, mineral


def make_object(name, mb, mats, kind):
    colours = bake_colours(mb, kind)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in mb.verts], [], list(mb.faces))
    me.validate(clean_customdata=False)
    me.update()
    if len(me.polygons) != len(mb.faces):
        raise RuntimeError(f"{name}: polygon count changed during validation")
    used = sorted(set(mb.fmat))
    for m in used:
        me.materials.append(mats[m])
    remap = {m: i for i, m in enumerate(used)}
    me.polygons.foreach_set("material_index", [remap[m] for m in mb.fmat])
    try:
        me.shade_flat()
    except AttributeError:
        for p in me.polygons:
            p.use_smooth = False
    # TEXCOORD_0: per-face box projection at world scale (see box_uv). Blender stores
    # UVs with v flipped relative to glTF, and the exporter writes v_gltf = 1 - v_blender.
    uvs = []
    for f in mb.faces:
        n = face_normal(mb.verts, f)          # Blender space (Z up)
        gnx, gny, gnz = n.x, n.z, -n.y        # glTF space (Y up)
        for i in f:
            x, y, z = mb.verts[i]
            u, v = box_uv(x, z, -y, gnx, gny, gnz)
            uvs += [u, 1.0 - v]
    uv_layer = me.uv_layers.new(name="UVMap")
    uv_layer.data.foreach_set("uv", uvs)
    attr = me.color_attributes.new(name=COLOR_ATTR, type="FLOAT_COLOR", domain="CORNER")
    flat = [c for rgba in colours for c in rgba]
    if len(flat) != len(me.loops) * 4:
        raise RuntimeError(f"{name}: colour count mismatch")
    attr.data.foreach_set("color", flat)
    me.color_attributes.active_color = attr
    try:
        me.color_attributes.render_color_index = me.color_attributes.active_color_index
    except Exception:
        pass
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_kit():
    pieces = []
    for i, spec in enumerate(CLUMP_SPECS):
        name = f"basalt_clump_{i}"
        mb = build_clump(name, spec)
        normalise(mb, 1.6, top=1.0)
        pieces.append((name, mb, "clump"))
    for i, spec in enumerate(COLUMN_SPECS):
        name = f"basalt_column_{i}"
        mb = build_column(name, spec)
        normalise(mb, 0.6, top=1.0)
        pieces.append((name, mb, "column"))
    for i in range(6):
        name = f"rock_{i}"
        mb = build_rock(name, i)
        normalise(mb, 1.0, max_top=0.58, max_height=0.7)
        pieces.append((name, mb, "rock"))
    for i, spec in enumerate(CRYSTAL_SPECS):
        name = f"crystal_{i}"
        mb = build_crystal(name, spec)
        normalise(mb, 1.0, max_top=0.66, max_height=0.8)
        pieces.append((name, mb, "crystal"))
    for i, spec in enumerate(SPIRE_SPECS):
        name = f"basalt_spire_{i}"
        mb = build_clump(name, spec)
        normalise(mb, KINDS["spire"]["foot"], top=1.0)
        pieces.append((name, mb, "spire"))
    for i, spec in enumerate(WALL_SPECS):
        name = f"basalt_wall_{i}"
        mb = build_clump(name, spec)
        normalise(mb, KINDS["wall"]["foot"], top=1.0)
        pieces.append((name, mb, "wall"))
    for i in range(2):
        name = f"basalt_fallen_{i}"
        mb = build_fallen(name, i)
        normalise(mb, KINDS["fallen"]["foot"], max_height=0.5)
        pieces.append((name, mb, "fallen"))
    for i in range(2):
        name = f"boulder_{i}"
        mb = build_boulder(name, i)
        normalise(mb, KINDS["boulder"]["foot"], max_height=0.9)
        pieces.append((name, mb, "boulder"))
    for i in range(2):
        name = f"crystal_spire_{i}"
        mb = build_crystal_spire(name, i)
        normalise(mb, KINDS["crystal_spire"]["foot"], top=1.0)
        pieces.append((name, mb, "crystal_spire"))
    mb = build_rosette("basalt_rosette_0")
    normalise(mb, KINDS["rosette"]["foot"], top=1.0)
    pieces.append(("basalt_rosette_0", mb, "rosette"))
    for i in range(2):
        name = f"hoodoo_{i}"
        mb = build_hoodoo(name, i)
        normalise(mb, KINDS["hoodoo"]["foot"], top=1.0)
        pieces.append((name, mb, "hoodoo"))
    return pieces


# Contract (docs/13 section 3). foot = (x, z) footprint in glTF terms (Blender x, y).
# 'top': highest vertex exactly this; 'height': max total vertical extent (incl. buried part).
KINDS = {
    "clump": dict(budget=450, foot=(1.6, 1.6), top=1.0, cols=(4, 9)),
    "column": dict(budget=80, foot=(0.6, 0.6), top=1.0),
    "rock": dict(budget=60, foot=(1.0, 1.0), height=0.7),
    "crystal": dict(budget=160, foot=(1.0, 1.0), height=0.8),
    "spire": dict(budget=450, foot=(1.0, 1.0), top=1.0, cols=(3, 6)),
    "wall": dict(budget=700, foot=(2.6, 1.2), top=1.0, cols=(6, 14)),
    "fallen": dict(budget=200, foot=(1.6, 0.6), height=0.5),
    "boulder": dict(budget=120, foot=(1.2, 1.2), height=0.9),
    "crystal_spire": dict(budget=300, foot=(1.2, 1.2), top=1.0),
    "rosette": dict(budget=600, foot=(1.8, 1.8), top=1.0),
    "hoodoo": dict(budget=250, foot=(1.0, 1.0), top=1.0),
}
BUDGETS = {k: v["budget"] for k, v in KINDS.items()}


def node_kind(name):
    return name.rsplit("_", 1)[0].replace("basalt_", "")


def check_piece(name, mb, kind):
    x0, x1, y0, y1, z0, z1 = mb.bounds()
    tris = mb.tris()
    rule = KINDS[kind]
    problems = []
    if tris > rule["budget"]:
        problems.append(f"tris {tris} > {rule['budget']}")
    if max(-x0, x1) > rule["foot"][0] * 0.5 + 1e-6 or max(-y0, y1) > rule["foot"][1] * 0.5 + 1e-6:
        problems.append("footprint")
    if not (-0.15 - 1e-6 <= z0 <= -0.1 + 1e-6):
        problems.append(f"base {z0:.3f}")
    if "top" in rule and abs(z1 - rule["top"]) > 1e-6:
        problems.append(f"top {z1:.4f}")
    if "height" in rule and (z1 - z0 > rule["height"] + 1e-6):
        problems.append(f"height {z1 - z0:.3f}")
    extra = ""
    if "cols" in rule:
        widths = getattr(mb, "column_widths", [])
        lo, hi = rule["cols"]
        if not lo <= len(widths) <= hi:
            problems.append(f"{len(widths)} columns")
        if widths and not (0.28 <= min(widths) and max(widths) <= 0.55):
            problems.append(f"column diameter {min(widths):.3f}-{max(widths):.3f}")
        extra = f" cols={len(widths)} diam=[{min(widths):.3f},{max(widths):.3f}]"
    print(f"KIT {name:16s} tris={tris:4d} x=[{x0:+.3f},{x1:+.3f}] z=[{y0:+.3f},{y1:+.3f}] "
          f"y=[{z0:+.3f},{z1:+.3f}]{extra} {'OK' if not problems else 'FAIL ' + ', '.join(problems)}")
    return problems


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        check_existing=False,
        export_format="GLB",
        export_copyright="Last Worlds - original procedural geometry (tools/blender/khepri_kit.py)",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
        export_attributes=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_yup=True,
        export_apply=False,
        export_extras=False,
        export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False,
        use_selection=False,
    )


EXPECTED_NODES = ([f"basalt_clump_{i}" for i in range(6)] + [f"basalt_column_{i}" for i in range(3)]
                  + [f"rock_{i}" for i in range(6)] + [f"crystal_{i}" for i in range(3)]
                  + [f"basalt_spire_{i}" for i in range(3)] + [f"basalt_wall_{i}" for i in range(3)]
                  + [f"basalt_fallen_{i}" for i in range(2)] + [f"boulder_{i}" for i in range(2)]
                  + [f"crystal_spire_{i}" for i in range(2)] + ["basalt_rosette_0"]
                  + [f"hoodoo_{i}" for i in range(2)])
MAX_GLB_BYTES = 1_500_000


def verify_glb(path):
    """Re-read the exported GLB (pure Python) and check the docs/13 section 3 contract.

    Bounds are reported in glTF space (+Y up): x/z footprint, y height.
    """
    import json
    import struct
    data = open(path, "rb").read()
    problems = []
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        problems.append("bad GLB header")
    jlen, _jtype = struct.unpack_from("<II", data, 12)
    gl = json.loads(data[20:20 + jlen])
    blen, _btype = struct.unpack_from("<II", data, 20 + jlen)
    bin_chunk = data[28 + jlen:28 + jlen + blen]
    for key in ("textures", "images", "samplers", "cameras", "animations", "skins"):
        if gl.get(key):
            problems.append(f"unexpected {key}")
    allowed_ext = {"KHR_materials_emissive_strength"}
    if set(gl.get("extensionsUsed", [])) - allowed_ext or gl.get("extensionsRequired"):
        problems.append(f"extensions {gl.get('extensionsUsed')} / {gl.get('extensionsRequired')}")
    mat_names = [m["name"] for m in gl.get("materials", [])]
    if sorted(mat_names) != sorted([MAT_BASALT, MAT_MINERAL]):
        problems.append(f"materials {mat_names}")
    scene_nodes = [gl["nodes"][i] for i in gl["scenes"][gl.get("scene", 0)]["nodes"]]
    names = [n.get("name") for n in scene_nodes]
    if sorted(names) != sorted(EXPECTED_NODES):
        problems.append(f"nodes {names}")

    def read_accessor(idx):
        acc = gl["accessors"][idx]
        bv = gl["bufferViews"][acc["bufferView"]]
        comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
        fmt = {5126: "f", 5123: "H", 5125: "I", 5121: "B"}[acc["componentType"]]
        size = struct.calcsize(fmt)
        stride = bv.get("byteStride", size * comps)
        off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        out = []
        for i in range(acc["count"]):
            out.append(struct.unpack_from("<" + fmt * comps, bin_chunk, off + i * stride))
        return out

    rows = []
    for node in scene_nodes:
        name = node.get("name")
        for key in ("translation", "rotation", "scale", "matrix", "children"):
            if key in node:
                problems.append(f"{name}: node has {key}")
        mesh = gl["meshes"][node["mesh"]]
        tris = 0
        xs, ys, zs = [], [], []
        prim_mats = []
        has_color = True
        uv_bad = [0]
        uv_count = [0]
        mineral_tris = 0
        for prim in mesh["primitives"]:
            if prim.get("mode", 4) != 4:
                problems.append(f"{name}: non-triangle primitive")
            pos = read_accessor(prim["attributes"]["POSITION"])
            xs += [p[0] for p in pos]
            ys += [p[1] for p in pos]
            zs += [p[2] for p in pos]
            ptris = gl["accessors"][prim["indices"]]["count"] // 3
            tris += ptris
            prim_mats.append(gl["materials"][prim["material"]]["name"])
            if prim_mats[-1] == MAT_MINERAL:
                mineral_tris += ptris
            if "COLOR_0" not in prim["attributes"]:
                has_color = False
            if "TEXCOORD_0" not in prim["attributes"]:
                problems.append(f"{name}: missing TEXCOORD_0")
            else:
                nrm = read_accessor(prim["attributes"]["NORMAL"])
                uv = read_accessor(prim["attributes"]["TEXCOORD_0"])
                for (gx, gy, gz), (nx, ny, nz), (u, v) in zip(pos, nrm, uv):
                    eu, ev = box_uv(gx, gy, gz, nx, ny, nz)
                    if abs(eu - u) > 2e-4 or abs(ev - v) > 2e-4:
                        a = sorted((abs(nx), abs(ny), abs(nz)))
                        if a[2] - a[1] > 0.02:      # ignore exact dominant-axis ties
                            uv_bad[0] += 1
                uv_count[0] += len(uv)
        kind = node_kind(name)
        rule = KINDS[kind]
        budget = rule["budget"]
        x0, x1, y0, y1, z0, z1 = min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)
        if tris > budget:
            problems.append(f"{name}: {tris} tris > {budget}")
        if max(-x0, x1) > rule["foot"][0] * 0.5 + 1e-5 or max(-z0, z1) > rule["foot"][1] * 0.5 + 1e-5:
            problems.append(f"{name}: footprint exceeds {rule['foot']}")
        if not (-0.15 - 1e-5 <= y0 <= -0.1 + 1e-5):
            problems.append(f"{name}: base y {y0:.4f}")
        if "top" in rule and y1 != rule["top"]:
            problems.append(f"{name}: top y {y1!r} != {rule['top']}")
        if "height" in rule and (y1 - y0 > rule["height"] + 1e-5 or y1 > rule["height"]):
            problems.append(f"{name}: too tall")
        if uv_bad[0]:
            problems.append(f"{name}: {uv_bad[0]}/{uv_count[0]} UVs differ from the box-projection convention")
        if not has_color:
            problems.append(f"{name}: missing COLOR_0")
        if kind == "crystal" and set(prim_mats) != {MAT_MINERAL}:
            problems.append(f"{name}: crystal material {prim_mats}")
        if kind == "crystal_spire" and set(prim_mats) != {MAT_BASALT, MAT_MINERAL}:
            problems.append(f"{name}: crystal spire needs basalt base and mineral prisms, got {prim_mats}")
        if kind in ("column", "rock", "fallen", "boulder", "rosette", "hoodoo") and set(prim_mats) != {MAT_BASALT}:
            problems.append(f"{name}: material {prim_mats}")
        mats_txt = "+".join(sorted(set(prim_mats)))
        if mineral_tris and kind != "crystal":
            mats_txt += f" ({mineral_tris} mineral tris)"
        rows.append((name, tris, budget, x0, x1, z0, z1, y0, y1, mats_txt))
    size = len(data)
    if size > MAX_GLB_BYTES:
        problems.append(f"file size {size} > {MAX_GLB_BYTES}")
    print("VERIFY node              tris/budget  x[min,max]        z[min,max]        y[min,max]       materials")
    for r in rows:
        print(f"VERIFY {r[0]:16s} {r[1]:4d}/{r[2]:<4d}  [{r[3]:+.3f},{r[4]:+.3f}]  [{r[5]:+.3f},{r[6]:+.3f}]  "
              f"[{r[7]:+.3f},{r[8]:+.3f}]  {r[9]}")
    print(f"VERIFY size={size} bytes, materials={mat_names}, problems={len(problems)}")
    for p in problems:
        print("VERIFY PROBLEM", p)
    return problems


# ----------------------------------------------------------------------------
# Preview rendering (not part of the runtime asset)
# ----------------------------------------------------------------------------

def preview_materials():
    def mat(name, color, rough=0.95, emit=None, noise=None):
        m = bpy.data.materials.new(name)
        try:
            m.use_nodes = True
        except Exception:
            pass
        nt = m.node_tree
        bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
        bsdf.inputs["Roughness"].default_value = rough
        if noise is not None:
            # Fine ochre grain and broad darker patches (preview ground only).
            tex = nt.nodes.new("ShaderNodeTexNoise")
            tex.inputs["Scale"].default_value = noise[0]
            tex.inputs["Detail"].default_value = 6.0
            ramp = nt.nodes.new("ShaderNodeValToRGB")
            ramp.color_ramp.elements[0].position = 0.25
            ramp.color_ramp.elements[0].color = (*noise[1], 1.0)
            ramp.color_ramp.elements[1].position = 0.75
            ramp.color_ramp.elements[1].color = (*noise[2], 1.0)
            nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
            tex2 = nt.nodes.new("ShaderNodeTexNoise")
            tex2.inputs["Scale"].default_value = 140.0
            tex2.inputs["Detail"].default_value = 2.0
            mixn = nt.nodes.new("ShaderNodeMix")
            mixn.data_type = "RGBA"
            mixn.blend_type = "MULTIPLY"
            mixn.inputs["Factor"].default_value = 0.2
            nt.links.new(ramp.outputs["Color"], mixn.inputs["A"])
            nt.links.new(tex2.outputs["Color"], mixn.inputs["B"])
            nt.links.new(mixn.outputs["Result"], bsdf.inputs["Base Color"])
        else:
            bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        if emit is not None:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.0
        return m
    ground = mat("preview_ground", None, noise=(1.4, hex_linear("#8a4424"), hex_linear("#c47a44")))
    mesa_top = mat("preview_mesa_top", None, noise=(1.1, hex_linear("#9a5a32"), hex_linear("#c8884e")))
    cliff = mat("preview_cliff", hex_linear("#2a2019"))
    label = mat("preview_label", (0.9, 0.85, 0.75), emit=(0.9, 0.85, 0.75))
    sheet = mat("preview_sheet_ground", hex_linear("#a65a2c"))
    return dict(ground=ground, mesa_top=mesa_top, cliff=cliff, label=label, sheet=sheet)


def setup_render(scene, engine, samples, res_x, res_y):
    if engine == "WORKBENCH":
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "VERTEX"
        scene.display.shading.show_shadows = True
    else:
        scene.render.engine = "BLENDER_EEVEE"
        ee = scene.eevee
        for attr, val in (("taa_render_samples", samples), ("use_shadows", True),
                          ("shadow_ray_count", 2), ("shadow_step_count", 8),
                          ("use_raytracing", False), ("fast_gi_method", "GLOBAL_ILLUMINATION")):
            if hasattr(ee, attr):
                try:
                    setattr(ee, attr, val)
                except Exception:
                    pass
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    vt = scene.view_settings
    for want in ("ACES 1.3", "ACES 2.0", "Filmic", "AgX"):  # runtime uses ACES filmic tone mapping
        try:
            vt.view_transform = want
            break
        except TypeError:
            continue
    vt.look = "None"
    # three.js ACESFilmicToneMapping pre-scales by exposure / 0.6 (runtime exposure 1.05);
    # Blender's ACES view does not, so match it with +log2(1.05 / 0.6) stops.
    vt.exposure = math.log2(1.05 / 0.6)
    vt.gamma = 1.0


def setup_world(scene, color=(0.42, 0.45, 0.48), strength=0.75):
    world = bpy.data.worlds.new("preview_world")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = [n for n in world.node_tree.nodes if n.type == "BACKGROUND"]
    if bg:
        bg[0].inputs["Color"].default_value = (*color, 1.0)
        bg[0].inputs["Strength"].default_value = strength
    world.color = color


SUN_DIR = (0.78, -0.36, -0.5)   # travel direction: from upper-left and slightly beyond the scene


def add_sun(direction, strength=4.2, color=(1.0, 0.86, 0.68), angle_deg=2.5):
    light = bpy.data.lights.new("preview_sun", "SUN")
    light.energy = strength
    light.color = color
    light.angle = math.radians(angle_deg)
    obj = bpy.data.objects.new("preview_sun", light)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector(direction).normalized().to_track_quat("-Z", "Y")
    bpy.context.scene.collection.objects.link(obj)
    return obj


def add_ortho_camera(target, elevation_deg, ortho_scale, distance=60.0):
    cam = bpy.data.cameras.new("preview_cam")
    cam.type = "ORTHO"
    cam.ortho_scale = ortho_scale
    cam.clip_start = 0.1
    cam.clip_end = 200.0
    obj = bpy.data.objects.new("preview_cam", cam)
    el = math.radians(elevation_deg)
    t = Vector(target)
    obj.location = t + Vector((0.0, -math.cos(el) * distance, math.sin(el) * distance))
    obj.rotation_euler = (math.radians(90.0 - elevation_deg), 0.0, 0.0)  # zero yaw, no roll
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.scene.camera = obj
    return obj


def plane_obj(name, x0, x1, y0, y1, z, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)])
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def instance(name, src, loc, rot_z=0.0, scale=(1.0, 1.0, 1.0)):
    obj = bpy.data.objects.new(name, src.data)
    obj.location = loc
    obj.rotation_euler = (0.0, 0.0, rot_z)
    obj.scale = scale
    bpy.context.scene.collection.objects.link(obj)
    return obj


def text_label(text, loc, size, mat):
    cu = bpy.data.curves.new("label_" + text, "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    obj = bpy.data.objects.new("label_" + text, cu)
    obj.location = loc
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def clear_preview(keep):
    for obj in list(bpy.context.scene.collection.objects):
        if obj.name not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def load_texture(path, non_color=False):
    img = bpy.data.images.load(path, check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def mean_luminance(img):
    """Mean linear luminance (what RGB to BW sees in the shader).

    image.pixels holds display-encoded values for 8-bit sRGB images, so linearise first.
    """
    px = img.pixels[:]
    n = len(px) // 4
    step = max(1, n // 65536)
    srgb = img.colorspace_settings.name.lower().startswith("srgb")
    conv = srgb_to_linear if srgb else (lambda c: c)
    total = 0.0
    count = 0
    for i in range(0, n, step):
        total += (0.2126 * conv(px[4 * i]) + 0.7152 * conv(px[4 * i + 1]) + 0.0722 * conv(px[4 * i + 2]))
        count += 1
    return total / max(count, 1)


def textured_detail(nt, bsdf, base_socket, diffuse, normal, tile, strength, object_coords=False):
    """base colour = base_socket x (texture luminance / mean, blended by strength); plus normal map.

    Mirrors the intended runtime use of the Poly Haven maps: colour stays driven by the
    Khepri palette; the textures add luminance detail and normals. UVs come from UVMap
    (TEXCOORD_0) and are scaled so one texture tile spans `tile` units.
    """
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0 / tile, 1.0 / tile, 1.0)
    if object_coords:   # preview ground plane (no UVs): planar object coordinates
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(tc.outputs["Object"], mapping.inputs["Vector"])
    else:
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = "UVMap"
        nt.links.new(uv.outputs["UV"], mapping.inputs["Vector"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = diffuse
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(tex.outputs["Color"], bw.inputs["Color"])
    norm = nt.nodes.new("ShaderNodeMath")
    norm.operation = "MULTIPLY"
    norm.inputs[1].default_value = 1.0 / max(mean_luminance(diffuse), 1e-3)
    nt.links.new(bw.outputs["Val"], norm.inputs[0])
    blend = nt.nodes.new("ShaderNodeMix")
    blend.data_type = "FLOAT"
    blend.inputs["Factor"].default_value = strength
    blend.inputs["A"].default_value = 1.0
    nt.links.new(norm.outputs["Value"], blend.inputs["B"])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(base_socket, mul.inputs["A"])
    nt.links.new(blend.outputs["Result"], mul.inputs["B"])
    nt.links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    if normal is not None:
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = normal
        nt.links.new(mapping.outputs["Vector"], ntex.inputs["Vector"])
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.8
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])


def apply_texture_preview(mats, pmats, tex_dir):
    """Preview-only: add Poly Haven detail to the basalt and ground materials in this session.

    Called after the GLB export, so nothing here reaches the runtime asset.
    """
    rock_d = load_texture(os.path.join(tex_dir, "rock_face_03", "rock_face_03_Diffuse_1k.jpg"))
    rock_n = load_texture(os.path.join(tex_dir, "rock_face_03", "rock_face_03_nor_gl_1k.jpg"), True)
    gnd_d = load_texture(os.path.join(tex_dir, "dry_ground_rocks", "dry_ground_rocks_Diffuse_1k.jpg"))
    gnd_n = load_texture(os.path.join(tex_dir, "dry_ground_rocks", "dry_ground_rocks_nor_gl_1k.jpg"), True)
    basalt = mats[0]
    nt = basalt.node_tree
    bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    vc = [n for n in nt.nodes if n.type == "VERTEX_COLOR"][0]
    textured_detail(nt, bsdf, vc.outputs["Color"], rock_d, rock_n, 1.35, 0.85)
    ground = pmats["ground"]
    nt = ground.node_tree
    bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    src = bsdf.inputs["Base Color"].links[0].from_socket
    textured_detail(nt, bsdf, src, gnd_d, gnd_n, 4.0, 0.9, object_coords=True)
    nt = pmats["mesa_top"].node_tree
    bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    src = bsdf.inputs["Base Color"].links[0].from_socket
    textured_detail(nt, bsdf, src, gnd_d, gnd_n, 4.0, 0.8, object_coords=True)
    if "relief" in pmats:
        texture_relief(pmats["relief"], rock_d, rock_n, gnd_d, gnd_n)


def render_contact_sheet(kit, pmats, path, engine, samples):
    """Every kit piece as authored, plus clumps and spires at runtime-like y scales."""
    scene = bpy.context.scene
    objs = dict(kit)
    clumps = [f"basalt_clump_{i}" for i in range(6)]
    spires = []
    for i in range(3):
        spires += [(f"basalt_spire_{i}", 1.0), (f"basalt_spire_{i}", 2.2)]
    alien = [("crystal_spire_0", 1.0), ("crystal_spire_0", 1.8), ("crystal_spire_1", 1.0),
             ("basalt_rosette_0", 1.0), ("hoodoo_0", 1.0), ("hoodoo_1", 1.6)]
    rows = [
        (14.4, 2.0, [(n, 1.0) for n in clumps]),
        (11.2, 2.0, [(n, 1.8) for n in clumps]),
        (7.8, 2.0, spires),
        (4.4, 2.1, alien),
        (1.9, 3.6, [(f"basalt_wall_{i}", 1.0) for i in range(3)]),
        (-1.3, 3.6, [(f"basalt_wall_{i}", 2.0) for i in range(3)]),
        (-4.0, 1.8, [(f"basalt_column_{i}", 1.0) for i in range(3)] + [(f"basalt_fallen_{i}", 1.0) for i in range(2)]
         + [(f"boulder_{i}", 1.0) for i in range(2)]),
        (-6.2, 1.4, [(f"rock_{i}", 1.0) for i in range(6)] + [(f"crystal_{i}", 1.0) for i in range(3)]),
    ]
    for r, (y, dx, items) in enumerate(rows):
        for c, (name, sz) in enumerate(items):
            x = (c - (len(items) - 1) * 0.5) * dx
            instance(f"sheet_{r}_{c}", objs[name], (x, y, 0.0), 0.0, (1.0, 1.0, sz))
            label = name if sz == 1.0 else f"{name} (y x{sz:g})"
            text_label(label, (x, y - (1.0 if r < 6 else 0.75), 0.002), 0.13 if r < 6 else 0.11, pmats["label"])
    plane_obj("sheet_ground", -14.0, 14.0, -10.0, 22.0, 0.0, pmats["sheet"])
    add_sun(SUN_DIR, strength=3.9)
    setup_world(scene, (0.42, 0.45, 0.48), 0.8)
    add_ortho_camera((0.0, 4.0, 0.6), 55.0, 20.4)
    setup_render(scene, engine, samples, 1800, 2400)
    render(path)


# Preview landscape (docs/13 section 2, no corridors): basins (x, y, radius, depth, pool?)
BASINS = [(0.9, 10.2, 2.1, 0.75, True), (-2.6, 23.0, 1.5, 0.55, True), (3.4, 1.6, 1.8, 0.45, False),
          (5.2, 18.0, 1.4, 0.35, False)]


def terrain_h(x, y):
    """Rolling plain: domain-warped waves, shallow basins and a diagonal dry wash (-0.9 ... +0.3)."""
    wx = x + 0.9 * math.sin(0.23 * y + 0.5)
    wy = y + 0.9 * math.sin(0.19 * x + 1.3)
    h = 0.14 * math.sin(0.33 * wx + 0.3) * math.cos(0.25 * wy) + 0.07 * math.sin(0.61 * wy + 0.27 * wx)
    h += 0.04 * math.sin(1.3 * wx + 0.7 * wy)
    for cx, cy, r, d, _pool in BASINS:
        h -= d * math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (r * r))
    wash_x = 2.4 - 0.42 * (y - 12.0) + 0.7 * math.sin(0.35 * y)
    h -= 0.22 * math.exp(-((x - wash_x) / 0.55) ** 2)
    return clamp(h, -0.9, 0.3)


def terrain_grid(name, x0, x1, y0, y1, nx, ny, mat):
    verts = []
    for j in range(ny + 1):
        y = lerp(y0, y1, j / ny)
        for i in range(nx + 1):
            x = lerp(x0, x1, i / nx)
            verts.append((x, y, terrain_h(x, y)))
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    try:
        me.shade_smooth()
    except AttributeError:
        pass
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def warped_outline(rng, cx, cy, radius, n=48, gullies=()):
    """Irregular CCW outline: noisy radius plus gully notches at given angles."""
    phases = [rng.uniform(0, 2 * math.pi) for _ in range(3)]
    pts = []
    for k in range(n):
        a = 2.0 * math.pi * k / n
        r = radius * (1.0 + 0.14 * math.sin(2 * a + phases[0]) + 0.09 * math.sin(3 * a + phases[1])
                      + 0.05 * math.sin(7 * a + phases[2]))
        for ga, gd, gw in gullies:
            d = math.atan2(math.sin(a - ga), math.cos(a - ga))
            r -= gd * math.exp(-(d / gw) ** 2)
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def prism_obj(name, poly, z0, z1, mat_top, mat_side):
    n = len(poly)
    verts = [(x, y, z0) for x, y in poly] + [(x, y, z1) for x, y in poly]
    faces = [tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat_top)
    me.materials.append(mat_side)
    me.polygons.foreach_set("material_index", [0] + [1] * n)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# Miniature relief (docs/13 sections 1-2): dendritic canyon network carved into tiered,
# ridged plateaus. Valleys: (polyline, floor half-width, wall reach, floor height).
RELIEF_VALLEYS = [
    ([(-8.0, 32.0), (-5.0, 26.5), (-2.2, 20.5), (-0.8, 14.5), (0.6, 9.0), (3.0, 3.0), (7.5, -5.5)], 1.05, 3.7, -6.0),
    ([(9.0, 23.5), (6.0, 20.0), (3.0, 16.4), (0.0, 12.6)], 0.55, 2.7, -4.6),
    ([(-9.0, 6.5), (-5.6, 7.2), (-2.6, 8.4), (0.2, 9.8)], 0.35, 2.1, -3.0),
]
RELIEF_POOLS = [(0.35, 11.0), (2.3, 4.6)]


def catmull(points, steps=8):
    out = []
    pts = [points[0]] + list(points) + [points[-1]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for k in range(steps):
            t = k / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(points[-1])
    return out


_RELIEF_PATHS = [(catmull(pts), fw, reach, floor) for pts, fw, reach, floor in RELIEF_VALLEYS]


def seg_dist(px, py, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    t = clamp(((px - a[0]) * vx + (py - a[1]) * vy) / max(vx * vx + vy * vy, 1e-9), 0.0, 1.0)
    return math.hypot(px - a[0] - vx * t, py - a[1] - vy * t)


def relief_plateau(x, y):
    """Ridged, domain-warped upland quantised into tiers (1.0 / 1.5 / 2.0, crest 2.2)."""
    wx = x + 1.2 * math.sin(0.21 * y + 0.4)
    wy = y + 1.2 * math.sin(0.17 * x + 1.7)
    ridge = 1.0 - abs(math.sin(0.3 * wx + 0.45 * math.sin(0.16 * wy) + 0.2 * wy * 0.1))
    n = 0.5 * ridge ** 1.5 + 0.3 * (0.5 + 0.5 * math.sin(0.23 * wx) * math.cos(0.19 * wy)) \
        + 0.2 * (0.5 + 0.5 * math.sin(0.61 * wx + 0.47 * wy))
    h = 0.75 + 1.7 * n
    step = 0.5
    k = math.floor(h / step)
    h = step * k + step * smoothstep(0.55, 1.0, h / step - k)
    return min(h, 2.2)


def relief_h(x, y):
    """Plateau minus terraced valley walls (three treads with steep risers) down to the floors."""
    top = relief_plateau(x, y)
    h = top
    for path, fw, reach, floor in _RELIEF_PATHS:
        d = min(seg_dist(x, y, path[i], path[i + 1]) for i in range(len(path) - 1))
        if d >= reach:
            continue
        t = clamp((d - fw) / (reach - fw), 0.0, 1.0)
        s3 = t * 3.0
        k = min(math.floor(s3), 2)
        f = (k + smoothstep(0.2, 0.8, s3 - k)) / 3.0
        fl = floor + 0.12 * math.sin(0.9 * x + 0.4 * y) + 0.06 * math.sin(2.1 * y)
        h = min(h, fl + (top - fl) * f)
    return max(h, -6.3)


def relief_normal_z(x, y, e=0.12):
    dx = (relief_h(x + e, y) - relief_h(x - e, y)) / (2 * e)
    dy = (relief_h(x, y + e) - relief_h(x, y - e)) / (2 * e)
    return 1.0 / math.sqrt(1.0 + dx * dx + dy * dy)


def relief_material(name, haze=True):
    """Slope-driven preview shading: striated dark basalt on steep faces, ochre dust on flats,
    lighter rims, darker valley floors, and a cool teal/violet haze settling with depth."""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
    bsdf.inputs["Roughness"].default_value = 0.95
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
    slope = nt.nodes.new("ShaderNodeMapRange")
    slope.inputs["From Min"].default_value = 0.55
    slope.inputs["From Max"].default_value = 0.82
    nt.links.new(sep.outputs["Z"], slope.inputs["Value"])
    # vertical striation: noise stretched along z
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (7.0, 7.0, 0.35)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    stri = nt.nodes.new("ShaderNodeTexNoise")
    stri.inputs["Scale"].default_value = 3.0
    nt.links.new(mp.outputs["Vector"], stri.inputs["Vector"])
    rock = nt.nodes.new("ShaderNodeValToRGB")
    rock.color_ramp.elements[0].color = (*hex_linear("#2a211c"), 1.0)
    rock.color_ramp.elements[1].color = (*hex_linear("#54402f"), 1.0)
    nt.links.new(stri.outputs["Fac"], rock.inputs["Fac"])
    dn = nt.nodes.new("ShaderNodeTexNoise")
    dn.inputs["Scale"].default_value = 1.2
    dust = nt.nodes.new("ShaderNodeValToRGB")
    dust.color_ramp.elements[0].position = 0.3
    dust.color_ramp.elements[0].color = (*hex_linear("#94502a"), 1.0)
    dust.color_ramp.elements[1].position = 0.75
    dust.color_ramp.elements[1].color = (*hex_linear("#c8864c"), 1.0)
    nt.links.new(dn.outputs["Fac"], dust.inputs["Fac"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    slope.name = "slope"
    nt.links.new(slope.outputs["Result"], mix.inputs["Factor"])
    nt.links.new(rock.outputs["Color"], mix.inputs["A"])
    nt.links.new(dust.outputs["Color"], mix.inputs["B"])
    # darker, redder valley bottoms
    depth = nt.nodes.new("ShaderNodeMapRange")
    depth.inputs["From Min"].default_value = -3.5
    depth.inputs["From Max"].default_value = -6.0
    depth.inputs["To Max"].default_value = 0.45
    sepw = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sepw.inputs["Vector"])
    nt.links.new(sepw.outputs["Z"], depth.inputs["Value"])
    dark = nt.nodes.new("ShaderNodeMix")
    dark.data_type = "RGBA"
    dark.inputs["B"].default_value = (*hex_linear("#5a2c1a"), 1.0)
    nt.links.new(depth.outputs["Result"], dark.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], dark.inputs["A"])
    dark.name = "final"
    nt.links.new(dark.outputs["Result"], bsdf.inputs["Base Color"])
    if haze:
        add_depth_haze(m)
    return m


def add_depth_haze(mat):
    """Preview fog: blend toward a teal (shallow) to violet (deep) emission below y = 0."""
    nt = mat.node_tree
    out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
    if not out.inputs["Surface"].links:
        return
    shader = out.inputs["Surface"].links[0].from_socket
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    depth = nt.nodes.new("ShaderNodeMapRange")      # 0 at y = -0.5, 1 at y = -6.5
    depth.inputs["From Min"].default_value = -0.5
    depth.inputs["From Max"].default_value = -6.5
    nt.links.new(sep.outputs["Z"], depth.inputs["Value"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*hex_linear("#5c8c90"), 1.0)
    ramp.color_ramp.elements[1].color = (*hex_linear("#6a5e98"), 1.0)
    nt.links.new(depth.outputs["Result"], ramp.inputs["Fac"])
    amount = nt.nodes.new("ShaderNodeMath")
    amount.operation = "MULTIPLY"
    amount.inputs[1].default_value = 0.2
    nt.links.new(depth.outputs["Result"], amount.inputs[0])
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 0.45
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(amount.outputs["Value"], mix.inputs["Fac"])
    nt.links.new(shader, mix.inputs[1])
    nt.links.new(emit.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])


def texture_relief(mat, rock_d, rock_n, gnd_d, gnd_n):
    """Textured preview: box-projected rock detail on steep faces, ground detail on flats."""
    nt = mat.node_tree
    bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    final = nt.nodes["final"]
    slope = nt.nodes["slope"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    lum = []
    nrm = []
    for img, nimg, tile in ((rock_d, rock_n, 1.35), (gnd_d, gnd_n, 4.0)):
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1.0 / tile,) * 3
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.projection = "BOX"
        tex.projection_blend = 0.3
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(tex.outputs["Color"], bw.inputs["Color"])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = 1.0 / max(mean_luminance(img), 1e-3)
        nt.links.new(bw.outputs["Val"], mul.inputs[0])
        lum.append(mul)
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = nimg
        ntex.projection = "BOX"
        ntex.projection_blend = 0.3
        nt.links.new(mp.outputs["Vector"], ntex.inputs["Vector"])
        nrm.append(ntex)
    sel = nt.nodes.new("ShaderNodeMix")
    sel.data_type = "FLOAT"
    nt.links.new(slope.outputs["Result"], sel.inputs["Factor"])
    nt.links.new(lum[0].outputs["Value"], sel.inputs["A"])
    nt.links.new(lum[1].outputs["Value"], sel.inputs["B"])
    soft = nt.nodes.new("ShaderNodeMix")
    soft.data_type = "FLOAT"
    soft.inputs["Factor"].default_value = 0.85
    soft.inputs["A"].default_value = 1.0
    nt.links.new(sel.outputs["Result"], soft.inputs["B"])
    mulc = nt.nodes.new("ShaderNodeMix")
    mulc.data_type = "RGBA"
    mulc.blend_type = "MULTIPLY"
    mulc.inputs["Factor"].default_value = 1.0
    nt.links.new(final.outputs["Result"], mulc.inputs["A"])
    nt.links.new(soft.outputs["Result"], mulc.inputs["B"])
    nt.links.new(mulc.outputs["Result"], bsdf.inputs["Base Color"])
    nsel = nt.nodes.new("ShaderNodeMix")
    nsel.data_type = "RGBA"
    nt.links.new(slope.outputs["Result"], nsel.inputs["Factor"])
    nt.links.new(nrm[0].outputs["Color"], nsel.inputs["A"])
    nt.links.new(nrm[1].outputs["Color"], nsel.inputs["B"])
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.8
    nt.links.new(nsel.outputs["Result"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])


def relief_grid(name, x0, x1, y0, y1, step, mat):
    nx, ny = int(round((x1 - x0) / step)), int(round((y1 - y0) / step))
    verts = []
    for j in range(ny + 1):
        y = lerp(y0, y1, j / ny)
        for i in range(nx + 1):
            x = lerp(x0, x1, i / nx)
            verts.append((x, y, relief_h(x, y)))
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    me.shade_smooth()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def render_diorama(kit, pmats, path, engine, samples):
    """Miniature relief at game scale (~12.5 x 27 units): a deep branching canyon (floor
    ~-6) cut into ridged, tiered plateaus (rims up to 2.2). Kit pieces dress rims, ledges
    and scree; the canyon floor carries a crystal spire, a rosette, a hoodoo and a terraced
    mineral pool. Everything except the heightfield and pool surfaces is a kit instance."""
    scene = bpy.context.scene
    objs = dict(kit)
    rng = random.Random(f"{KIT_SEED}:relief")
    clumps = [objs[f"basalt_clump_{i}"] for i in range(6)]
    walls = [objs[f"basalt_wall_{i}"] for i in range(3)]
    spires = [objs[f"basalt_spire_{i}"] for i in range(3)]
    columns = [objs[f"basalt_column_{i}"] for i in range(3)]
    fallen = [objs[f"basalt_fallen_{i}"] for i in range(2)]
    boulders = [objs[f"boulder_{i}"] for i in range(2)]
    rocks = [objs[f"rock_{i}"] for i in range(6)]
    crystals = [objs[f"crystal_{i}"] for i in range(3)]
    cspires = [objs[f"crystal_spire_{i}"] for i in range(2)]
    hoodoos = [objs[f"hoodoo_{i}"] for i in range(2)]
    rosette = objs["basalt_rosette_0"]
    tall = set(clumps + walls + spires + columns + cspires + hoodoos + [rosette])
    if "relief" not in pmats:                      # first relief render in this session
        for mname in (MAT_BASALT, MAT_MINERAL):
            add_depth_haze(bpy.data.materials[mname])
    terrain_mat = pmats.get("relief") or relief_material("preview_relief")
    pmats["relief"] = terrain_mat
    relief_grid("dio_relief", -9.5, 9.5, -8.0, 33.0, 0.12, terrain_mat)
    count = 0

    def put(src, x, y, rot, sxy, sz):
        nonlocal count
        count += 1
        z = relief_h(x, y) - 0.03
        if src in tall:
            sz = min(sz, 2.2 - z)
        return instance(f"dio_{count}", src, (x, y, z), rot, (sxy, sxy, sz))

    def yaw():
        return rng.uniform(0.0, 2.0 * math.pi)

    # Terrain analysis on a jittered grid: rims, ledges, scree.
    for j in range(int(40 / 0.42)):
        for i in range(int(16 / 0.42)):
            x = -8.0 + i * 0.42 + rng.uniform(-0.15, 0.15)
            y = -6.0 + j * 0.42 + rng.uniform(-0.15, 0.15)
            h = relief_h(x, y)
            nz = relief_normal_z(x, y)
            if nz < 0.86:
                continue
            drop = min(relief_h(x + math.cos(a) * 0.75, y + math.sin(a) * 0.75) for a in (0, 1.57, 3.14, 4.71))
            rnd = rng.random()
            if h > 0.7 and h - drop > 0.6:                              # plateau / tier rim
                if rnd < 0.18:
                    src = rng.choice(clumps + clumps + walls + spires[:2])
                    put(src, x, y, yaw(), rng.uniform(0.8, 1.1), rng.uniform(0.35, 0.9))
                elif rnd < 0.24:
                    put(rng.choice(rocks), x, y, yaw(), rng.uniform(0.5, 0.9), rng.uniform(0.5, 0.9))
            elif -5.4 < h <= 0.7 and h - drop > 0.4:                   # ledge rim inside the canyon
                if rnd < 0.2:
                    put(rng.choice(clumps + columns), x, y, yaw(), rng.uniform(0.7, 1.0), rng.uniform(0.3, 0.7))
                elif rnd < 0.3:
                    put(rng.choice(rocks + boulders), x, y, yaw(), rng.uniform(0.5, 0.9), rng.uniform(0.5, 0.9))
            elif h < -5.4:                                              # canyon floor: scree near walls
                wall = max(relief_h(x + math.cos(a) * 0.9, y + math.sin(a) * 0.9) for a in (0, 1.57, 3.14, 4.71))
                if wall - h > 0.8 and rnd < 0.35:
                    src = rng.choice(rocks + rocks + boulders + fallen)
                    sc = rng.uniform(0.5, 1.0)
                    put(src, x, y, yaw(), sc, sc if src in rocks else 1.0)
            elif rnd < 0.03 and h > 0.7:                                # sparse relief on plateau flats
                put(rng.choice(rocks), x, y, yaw(), 0.6, 0.6)

    # Alien landmarks on the canyon floor and on the plateau.
    put(cspires[0], 1.25, 13.6, 0.8, 1.0, 1.25)
    put(cspires[1], -2.0, 22.4, 2.3, 1.0, 1.1)
    put(cspires[0], 3.3, 2.0, 4.1, 0.8, 0.9)
    put(rosette, 1.6, 7.2, 1.1, 1.0, 1.0)
    put(hoodoos[0], -0.5, 17.6, 0.3, 1.0, 1.3)
    put(hoodoos[1], 5.6, 16.6, 2.0, 1.0, 1.1)
    put(hoodoos[0], -4.6, 12.0, 3.9, 0.9, 1.0)
    put(spires[1], -5.2, 4.2, 0.4, 1.0, 1.6)
    put(spires[0], 5.2, 9.4, 2.4, 1.0, 1.4)
    # Terraced mineral pools (preview staging) ringed by crystals.
    mineral = bpy.data.materials[MAT_MINERAL]
    for k, (px, py) in enumerate(RELIEF_POOLS):
        z = relief_h(px, py)
        for step, r in enumerate((0.42, 0.28, 0.16)):
            rim = warped_outline(rng, px + step * 0.12, py - step * 0.1, r, n=18)
            prism_obj(f"dio_pool_{k}_{step}", rim, z - 0.3, z + 0.02 + step * 0.05, mineral, mineral)
        for _c in range(4):
            a = yaw()
            put(rng.choice(crystals), px + math.cos(a) * 0.6, py + math.sin(a) * 0.6, yaw(),
                rng.uniform(0.8, 1.1), rng.uniform(0.8, 1.1))

    add_sun((0.7, -0.33, -0.62), strength=3.9)
    setup_world(scene, (0.42, 0.45, 0.48), 0.8)
    # Phone portrait view: ~12.5 x 27 units at the game's 55 degree ortho camera.
    add_ortho_camera((0.0, 11.0, -1.0), 55.0, 12.5 * 1600.0 / 900.0)
    setup_render(scene, engine, samples, 900, 1600)
    render(path)


def kit_mineral_material():
    return bpy.data.materials[MAT_MINERAL]


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="khepri_kit.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--textures", default=None,
                    help="art/source/polyhaven directory: also render preview-diorama-textured.png")
    return ap.parse_args(argv)


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    pieces = build_kit()
    problems = []
    for name, mb, kind in pieces:
        problems += [f"{name}: {p}" for p in check_piece(name, mb, kind)]
    if problems:
        raise SystemExit("Kit contract violations:\n  " + "\n  ".join(problems))
    kit = []
    for name, mb, kind in pieces:
        kit.append((name, make_object(name, mb, mats, kind)))
    export_glb(args.glb)
    print(f"KIT exported {args.glb} ({os.path.getsize(args.glb)} bytes)")
    if verify_glb(args.glb):
        raise SystemExit("Exported GLB failed verification")

    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        pmats = preview_materials()
        keep = {n for n, _o in kit}
        for _n, o in kit:
            o.hide_render = True  # originals stay at the origin; previews use instances
        render_contact_sheet(kit, pmats, os.path.join(args.preview_dir, "preview-kit.png"), args.engine, args.samples)
        clear_preview(keep)
        render_diorama(kit, pmats, os.path.join(args.preview_dir, "preview-diorama.png"), args.engine, args.samples)
        if args.textures:
            clear_preview(keep)
            apply_texture_preview(mats, pmats, args.textures)
            render_diorama(kit, pmats, os.path.join(args.preview_dir, "preview-diorama-textured.png"),
                           args.engine, args.samples)
        print("KIT previews written")


if __name__ == "__main__":
    main()
