"""Khepri infrastructure kit generator for Last Worlds (docs/13 section 3b).

Builds the modelled outpost pieces from code: landing pad, refinery, relay mast,
three tracked cargo haulers and a seamlessly tiling track segment. Graphite foundry
machinery with broad bevels, plate seams, pipes, vents, weathered ochre/rust paint
and amber work lights. Vertex colours carry baked AO, edge wear and ochre dust;
UVs are box-projected at 1 UV unit = 1 unit like the terrain kit.

Deterministic: fixed seed, per-piece random.Random streams, no time-based values.
Shares small helpers with khepri_kit.py (same folder) without writing bytecode.

Run headless from WSL (pass Windows/UNC paths from ``wslpath -w``)::

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/khepri_infra.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/khepri/khepri-infra.glb)" \\
        --preview-dir "$(wslpath -w $R/art/khepri-infra)" \\
        --textures "$(wslpath -w $R/art/source/polyhaven)" \\
        --terrain-kit "$(wslpath -w $R/public/assets/khepri/khepri-kit.glb)"
"""

import argparse
import math
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import khepri_kit as kit  # noqa: E402

INFRA_SEED = "khepri-infra-v1"
MAT_INFRA = "khepri_infra"
MAT_LIGHT = "khepri_light"
COLOR_ATTR = "Col"
SINK = -0.05            # pieces extend this far below y = 0 (track: flush)

# Contract (docs/13 section 3b): footprint (x, z) in glTF terms (Blender x, y), exact.
INFRA = {
    "infra_landing_pad": dict(foot=(5.4, 6.2), top_max=0.3, budget=1500),
    "infra_refinery": dict(foot=(4.1, 5.1), top=1.6, budget=4000),
    "infra_relay": dict(foot=(0.85, 1.0), top=1.6, budget=1200),
    "infra_cargo_0": dict(foot=(1.05, 1.75), top_max=0.65, budget=900),
    "infra_cargo_1": dict(foot=(1.05, 1.75), top_max=0.65, budget=900),
    "infra_cargo_2": dict(foot=(1.05, 1.75), top_max=0.65, budget=900),
    "infra_track_segment": dict(foot=(1.35, 2.0), top_max=0.05, budget=200, flush=True, tile=2.0),
}

# Paints (sRGB) and how strongly their edges wear to bare metal.
PAINTS = {
    "graphite": ("#343537", 0.35),
    "graphite_dk": ("#232426", 0.25),
    "steel": ("#5e5d5a", 0.45),
    "ochre": ("#c48a2c", 0.6),
    "rust": ("#8e4524", 0.4),
    "ochre_w": ("#94703e", 0.75),      # weathered hauler ochre: desaturated, heavily worn
    "rust_w": ("#6e3f26", 0.6),
    "hazard": ("#1f1e1d", 0.2),
    "ivory": ("#bdb4a0", 0.45),
    "visor": ("#16191b", 0.1),
    "ore": ("#3c2f28", 0.15),
    "bed": ("#3a3029", 0.1),
}
WEAR = kit.hex_linear("#948d81")
DUST = kit.hex_linear("#b27a4a")
DUST_LOW = kit.hex_linear("#9c5f36")
LIGHT = kit.hex_linear("#ffb04a")


# ----------------------------------------------------------------------------
# Hard-surface builder
# ----------------------------------------------------------------------------

class HS:
    """Vertices + faces with material, paint, tag ('main', 'edge', 'smooth') per face."""

    def __init__(self, rng):
        self.rng = rng
        self.verts = []
        self.faces = []
        self.fmat = []
        self.fpaint = []
        self.ftag = []

    def v(self, p):
        self.verts.append([p[0], p[1], p[2]])
        return len(self.verts) - 1

    def face(self, idx, paint, tag="main", mat=0, center=None, outward=None):
        """Add a face; orient it away from `center` (convex parts) or along `outward`."""
        n = kit.face_normal(self.verts, idx)
        if outward is not None:
            ref = Vector(outward)
        else:
            c = Vector((0.0, 0.0, 0.0))
            for i in idx:
                c += Vector(self.verts[i])
            c /= len(idx)
            ref = c - Vector(center)
        if n.dot(ref) < 0:
            idx = tuple(reversed(idx))
        self.faces.append(tuple(idx))
        self.fmat.append(mat)
        self.fpaint.append(paint)
        self.ftag.append(tag)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def bounds(self):
        xs = [v[0] for v in self.verts]
        ys = [v[1] for v in self.verts]
        zs = [v[2] for v in self.verts]
        return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)

    # -- chamfered box ---------------------------------------------------------
    def box(self, center, size, ch, paint, mat=0, bottom=False, ends=(True, True)):
        """Axis-aligned box with all edges chamfered by ch.

        bottom=False drops the bottom face and its chamfers (piece rests on something);
        ends=(False, False) drops the -y/+y faces (open ends for tiling strips).
        """
        cx, cy, cz = center
        hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
        ch = min(ch, hx * 0.45, hy * 0.45, hz * 0.45)
        idx = {}
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    # Faces run flush (no chamfer inset) toward an open side, so open bottoms
                    # reach the ground and open ends tile without gaps.
                    open_y = (sy < 0 and not ends[0]) or (sy > 0 and not ends[1])
                    open_z = sz < 0 and not bottom
                    iy = hy if open_y else hy - ch
                    iz = hz if open_z else hz - ch
                    idx[(sx, sy, sz, 0)] = self.v((cx + sx * hx, cy + sy * iy, cz + sz * iz))
                    idx[(sx, sy, sz, 1)] = self.v((cx + sx * (hx - ch), cy + sy * hy, cz + sz * iz))
                    idx[(sx, sy, sz, 2)] = self.v((cx + sx * (hx - ch), cy + sy * iy, cz + sz * hz))

        def keep(signs_axes):
            for axis, sign in signs_axes:
                if axis == 2 and sign < 0 and not bottom:
                    return False
                if axis == 1 and ((sign < 0 and not ends[0]) or (sign > 0 and not ends[1])):
                    return False
            return True

        cen = (cx, cy, cz)
        # main faces
        for axis in range(3):
            for s in (-1, 1):
                if not keep([(axis, s)]):
                    continue
                quad = []
                o = [a for a in range(3) if a != axis]
                for a_s, b_s in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    signs = [0, 0, 0]
                    signs[axis] = s
                    signs[o[0]] = a_s
                    signs[o[1]] = b_s
                    quad.append(idx[(signs[0], signs[1], signs[2], axis)])
                self.face(quad, paint, "main", mat, cen)
        if ch <= 1e-6:
            return
        # edge chamfers
        for a in range(3):
            for b in range(a + 1, 3):
                c = 3 - a - b
                for sa in (-1, 1):
                    for sb in (-1, 1):
                        if not keep([(a, sa), (b, sb)]):
                            continue
                        quad = []
                        for sc, which in ((-1, a), (1, a), (1, b), (-1, b)):
                            signs = [0, 0, 0]
                            signs[a] = sa
                            signs[b] = sb
                            signs[c] = sc
                            quad.append(idx[(signs[0], signs[1], signs[2], which)])
                        self.face(quad, paint, "edge", mat, cen)
        # corner triangles
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    if not keep([(0, sx), (1, sy), (2, sz)]):
                        continue
                    self.face((idx[(sx, sy, sz, 0)], idx[(sx, sy, sz, 1)], idx[(sx, sy, sz, 2)]), paint, "edge", mat, cen)

    # -- chamfered cylinder / cone ---------------------------------------------
    def cyl(self, p0, axis, r, length, seg, ch, paint, mat=0, cap0=True, cap1=True, r1=None, rot=0.0,
            smooth=True):
        """Cylinder (or frustum when r1 is given) from p0 along axis; chamfered caps."""
        a = Vector(axis).normalized()
        t1 = a.orthogonal().normalized()
        t2 = a.cross(t1).normalized()
        b = Vector(p0)
        r1 = r if r1 is None else r1
        ch = min(ch, r * 0.4, r1 * 0.4, length * 0.3)

        def ring(z, rad):
            out = []
            for k in range(seg):
                ang = rot + 2.0 * math.pi * k / seg
                out.append(self.v(b + a * z + (t1 * math.cos(ang) + t2 * math.sin(ang)) * rad))
            return out

        cen = tuple(b + a * (length * 0.5))
        side_tag = "smooth" if smooth else "main"
        if cap0 and ch > 0:
            c0 = ring(0.0, r - ch)
            o0 = ring(ch, r)
            self.face(c0, paint, "main", mat, cen)
            for k in range(seg):
                j = (k + 1) % seg
                self.face((c0[k], c0[j], o0[j], o0[k]), paint, "edge", mat, cen)
        else:
            o0 = ring(0.0, r)
            if cap0:
                self.face(o0, paint, "main", mat, cen)
        if cap1 and ch > 0:
            o1 = ring(length - ch, r1)
            c1 = ring(length, r1 - ch)
        else:
            o1 = ring(length, r1)
            c1 = None
        for k in range(seg):
            j = (k + 1) % seg
            self.face((o0[k], o0[j], o1[j], o1[k]), paint, side_tag, mat, cen)
        if c1 is not None:
            for k in range(seg):
                j = (k + 1) % seg
                self.face((o1[k], o1[j], c1[j], c1[k]), paint, "edge", mat, cen)
            self.face(c1, paint, "main", mat, cen)
        elif cap1:
            self.face(o1, paint, "main", mat, cen)

    def dome(self, p0, axis, r, height, seg, paint, mat=0, bands=3):
        """Shallow dome cap (stacked frustums) closing a cylinder of radius r."""
        a = Vector(axis).normalized()
        prev_r, prev_z = r, 0.0
        for k in range(1, bands + 1):
            t = k / bands
            z = height * math.sin(t * math.pi * 0.5)
            rad = r * math.cos(t * math.pi * 0.5)
            if k == bands:
                rad = r * 0.18
            self.cyl(Vector(p0) + a * prev_z, axis, prev_r, z - prev_z, seg, 0.0, paint, mat,
                     cap0=False, cap1=(k == bands), r1=rad)
            prev_r, prev_z = rad, z

    # -- chamfered polygon prism ------------------------------------------------
    def prism(self, poly, z0, z1, ch, paint, mat=0, bottom=False):
        n = len(poly)
        if kit.poly_area(poly) < 0:
            poly = list(reversed(poly))
        inner = kit.inset_poly(poly, [ch] * n) if ch > 0 else None
        cx = sum(p[0] for p in poly) / n
        cy = sum(p[1] for p in poly) / n
        cen = (cx, cy, (z0 + z1) * 0.5)
        b = [self.v((x, y, z0)) for x, y in poly]
        if bottom:
            self.face(b, paint, "main", mat, cen)
        if inner is not None:
            t = [self.v((x, y, z1 - ch)) for x, y in poly]
            c = [self.v((x, y, z1)) for x, y in inner]
        else:
            t = [self.v((x, y, z1)) for x, y in poly]
            c = None
        for k in range(n):
            j = (k + 1) % n
            self.face((b[k], b[j], t[j], t[k]), paint, "main", mat, cen)
        if c is not None:
            for k in range(n):
                j = (k + 1) % n
                self.face((t[k], t[j], c[j], c[k]), paint, "edge", mat, cen)
            self.face(c, paint, "main", mat, cen)
        else:
            self.face(t, paint, "main", mat, cen)

    # -- flat ring (painted markings) ------------------------------------------
    def flat_ring(self, cx, cy, z, r0, r1, seg, paint, a0=0.0, a1=2 * math.pi, mat=0):
        for k in range(seg):
            t0 = a0 + (a1 - a0) * k / seg
            t1 = a0 + (a1 - a0) * (k + 1) / seg
            q = [self.v((cx + math.cos(t) * r, cy + math.sin(t) * r, z)) for t, r in
                 ((t0, r0), (t1, r0), (t1, r1), (t0, r1))]
            self.face(q, paint, "main", mat, outward=(0, 0, 1))

    def decal(self, center, size, paint, rot=0.0):
        """Painted marking: one up-facing quad just above a surface."""
        cx, cy, cz = center
        hx, hy = size[0] * 0.5, size[1] * 0.5
        c, s_ = math.cos(rot), math.sin(rot)
        q = [self.v((cx + x * c - y * s_, cy + x * s_ + y * c, cz)) for x, y in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))]
        self.face(q, paint, "main", 0, outward=(0, 0, 1))

    def light(self, p, r=0.045, h=0.06, seg=6):
        """Amber lamp: plain dark housing block plus a faceted emissive lens."""
        self.box((p[0], p[1], p[2] + h * 0.2), (r * 2.4, r * 2.4, h * 0.4), 0.0, "graphite_dk")
        self.cyl((p[0], p[1], p[2] + h * 0.4), (0, 0, 1), r, h * 0.6, seg, 0.0, "lamp", mat=1, cap0=False,
                 smooth=False)


def pipe_run(hs, pts, r, paint, seg=8, fitting="steel"):
    """Pipe along a polyline with block fittings at the bends and flanges at the ends."""
    for k in range(len(pts) - 1):
        a, b = Vector(pts[k]), Vector(pts[k + 1])
        d = b - a
        hs.cyl(a, d, r, d.length, seg, 0.0, paint, cap0=False, cap1=False)
    for k, p in enumerate(pts):
        s = r * 2.6
        if 0 < k < len(pts) - 1:
            hs.box(p, (s, s, s), 0.0, fitting, bottom=True)
    for end, nxt in ((pts[0], pts[1]), (pts[-1], pts[-2])):
        d = (Vector(end) - Vector(nxt)).normalized()
        hs.cyl(Vector(end) - d * 0.04, d, r * 1.5, 0.05, seg, 0.0, fitting, smooth=False)


def vents(hs, x0, x1, y, z0, z1, n, depth, paint="graphite_dk", axis="x"):
    """A row of horizontal louvre slats on a vertical face (face plane at y, facing -y)."""
    for k in range(n):
        z = z0 + (z1 - z0) * (k + 0.5) / n
        hs.box(((x0 + x1) * 0.5, y - depth * 0.5, z), (x1 - x0, depth, (z1 - z0) / n * 0.45), 0.0, paint,
               bottom=True)


# ----------------------------------------------------------------------------
# Pieces (Blender space: x lateral, y forward = glTF -Z, z up)
# ----------------------------------------------------------------------------

def build_landing_pad(rng):
    hs = HS(rng)
    hx, hy = 2.7, 3.1
    cut = 0.55
    octa = [(-hx + cut, -hy), (hx - cut, -hy), (hx, -hy + cut), (hx, hy - cut), (hx - cut, hy), (-hx + cut, hy),
            (-hx, hy - cut), (-hx, -hy + cut)]
    hs.prism(octa, SINK, 0.15, 0.05, "graphite_dk")
    # Deck: 3 x 4 heavy plates with seams between them.
    nx, ny = 3, 4
    x0, x1, y0, y1 = -2.25, 2.25, -2.62, 2.62
    for i in range(nx):
        for j in range(ny):
            ax = x0 + (x1 - x0) * i / nx
            bx = x0 + (x1 - x0) * (i + 1) / nx
            ay = y0 + (y1 - y0) * j / ny
            by = y0 + (y1 - y0) * (j + 1) / ny
            shade = rng.choice(("graphite", "graphite", "steel"))
            hs.box(((ax + bx) * 0.5, (ay + by) * 0.5, 0.17), (bx - ax - 0.035, by - ay - 0.035, 0.05), 0.014, shade)
    # Markings (decals just above the deck): landing ring, centre cross, corner chevrons.
    zt = 0.1955
    hs.flat_ring(0.0, 0.0, zt, 1.38, 1.5, 28, "ochre")
    hs.decal((0.0, 0.0, zt), (0.9, 0.12), "ivory")
    hs.decal((0.0, 0.0, zt + 0.0005), (0.12, 0.9), "ivory")
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k in range(3):
                hs.decal((sx * (1.85 - k * 0.24), sy * 2.3, zt), (0.13, 0.32), "ochre", rot=sx * sy * 0.5)
    # Hazard stripes along the front and back edges of the deck.
    for sy in (-1, 1):
        for k in range(9):
            hs.decal((-1.9 + k * 0.475, sy * 2.5, zt), (0.2, 0.16), "ochre", rot=0.6)
    # Perimeter lamps on low plinths.
    for x, y in ((-1.6, -2.98), (1.6, -2.98), (-1.6, 2.98), (1.6, 2.98), (-2.58, -1.25), (2.58, -1.25),
                 (-2.58, 1.25), (2.58, 1.25)):
        hs.box((x, y, 0.17), (0.13, 0.13, 0.05), 0.0, "graphite_dk")
        hs.light((x, y, 0.195), r=0.04, h=0.075)
    # Service edge: fuel coupler, hose reel, conduit with clamps, and a low blast deflector.
    hs.box((2.42, 0.2, 0.2), (0.34, 0.7, 0.14), 0.03, "ochre")
    hs.box((2.42, 0.5, 0.275), (0.2, 0.14, 0.03), 0.0, "graphite_dk")
    hs.cyl((2.36, -0.42, 0.2), (1, 0, 0), 0.075, 0.13, 10, 0.0, "rust")
    pipe_run(hs, [(-2.46, -2.25, 0.21), (-2.46, 2.25, 0.21)], 0.035, "steel")
    for y in (-1.3, 0.0, 1.3):
        hs.box((-2.46, y, 0.2), (0.11, 0.06, 0.1), 0.0, "graphite_dk")
    hs.box((0.0, 2.9, 0.2), (1.6, 0.12, 0.1), 0.03, "steel")
    return hs


def build_refinery(rng):
    hs = HS(rng)
    hx, hy = 2.05, 2.55
    slab = [(-hx, -hy), (hx, -hy), (hx, hy - 0.5), (hx - 0.5, hy), (-hx + 0.35, hy), (-hx, hy - 0.35)]
    hs.prism(slab, SINK, 0.1, 0.04, "graphite_dk")
    for k in range(9):
        hs.decal((-1.75 + k * 0.4, -hy + 0.12, 0.1005), (0.17, 0.14), "ochre", rot=0.6)
    # Distillation columns (back left) with domes, stiffener bands, a riser and a top lamp.
    for (x, y, h, r) in ((-1.25, 1.55, 1.3, 0.3), (-0.45, 1.85, 1.08, 0.26)):
        hs.cyl((x, y, 0.1), (0, 0, 1), r, h, 16, 0.0, "graphite", cap0=False, cap1=False)
        hs.dome((x, y, 0.1 + h), (0, 0, 1), r, r * 0.45, 16, "graphite", bands=2)
        for z, paint in ((0.32, "steel"), (0.62, "ochre"), (0.95, "steel")):
            if z < h:
                hs.cyl((x, y, 0.1 + z), (0, 0, 1), r + 0.025, 0.05, 16, 0.0, paint, cap0=False)
        hs.box((x + r + 0.04, y - 0.05, 0.1 + h * 0.5), (0.07, 0.14, h * 0.95), 0.012, "steel", bottom=True)
        hs.light((x, y, 0.1 + h + r * 0.45 - 0.01), r=0.035, h=0.06)
    # Processing hall with ochre service panel, louvres, roof units and corner lamps.
    bx, by = 1.0, 0.35
    hs.box((bx, by, 0.5), (1.6, 1.9, 0.8), 0.06, "graphite")
    hs.box((bx - 0.81, by - 0.2, 0.48), (0.04, 0.9, 0.5), 0.012, "ochre", bottom=True)
    hs.box((bx - 0.82, by + 0.55, 0.36), (0.04, 0.32, 0.5), 0.0, "graphite_dk", bottom=True)
    vents(hs, bx - 0.55, bx + 0.55, by - 0.95, 0.42, 0.8, 4, 0.03)
    hs.box((bx + 0.25, by + 0.3, 0.95), (0.6, 0.7, 0.12), 0.03, "steel")
    for k in range(3):
        hs.box((bx - 0.45, by - 0.55 + k * 0.38, 0.93), (0.42, 0.26, 0.08), 0.015, "graphite_dk")
    hs.light((bx + 0.76, by - 0.9, 0.9), r=0.035, h=0.05)
    hs.light((bx - 0.76, by + 0.9, 0.9), r=0.035, h=0.05)
    # Smokestack with rust bands; the warning lamp tops out at exactly 1.6.
    sx, sy = 1.55, 1.85
    hs.cyl((sx, sy, 0.1), (0, 0, 1), 0.2, 0.12, 12, 0.02, "graphite_dk", cap0=False)
    hs.cyl((sx, sy, 0.22), (0, 0, 1), 0.13, 1.25, 12, 0.0, "graphite", r1=0.11, cap0=False, cap1=False)
    for z in (0.55, 1.05, 1.38):
        hs.cyl((sx, sy, z), (0, 0, 1), 0.135 - (z - 0.22) * 0.016 + 0.012, 0.06, 12, 0.0, "rust", cap0=False)
    hs.cyl((sx, sy, 1.47), (0, 0, 1), 0.07, 0.065, 8, 0.0, "graphite_dk", cap0=False)
    hs.cyl((sx, sy, 1.535), (0, 0, 1), 0.05, 0.065, 8, 0.012, "lamp", mat=1, cap0=False)
    # Horizontal separator drum on saddles with domed heads and banding.
    dx, dy, dz, dr, dl = -1.0, -0.55, 0.56, 0.36, 1.6
    hs.cyl((dx, dy - dl * 0.5, dz), (0, 1, 0), dr, dl, 16, 0.0, "graphite", cap0=False, cap1=False)
    hs.dome((dx, dy + dl * 0.5, dz), (0, 1, 0), dr, 0.16, 16, "graphite", bands=2)
    hs.dome((dx, dy - dl * 0.5, dz), (0, -1, 0), dr, 0.16, 16, "graphite", bands=2)
    for y, paint in ((dy - 0.45, "ochre"), (dy + 0.45, "ochre"), (dy, "steel")):
        hs.cyl((dx, y - 0.04, dz), (0, 1, 0), dr + 0.022, 0.08, 16, 0.0, paint, cap0=False, cap1=False)
    for y in (dy - 0.5, dy + 0.5):
        hs.box((dx, y, 0.2), (0.62, 0.16, 0.2), 0.03, "graphite_dk")
    hs.cyl((dx, dy + 0.1, dz + dr - 0.02), (0, 0, 1), 0.09, 0.08, 10, 0.015, "steel", cap0=False)
    # Front tank pair.
    for (x, y, h, r) in ((1.35, -1.75, 0.55, 0.3), (0.62, -1.95, 0.42, 0.24)):
        hs.cyl((x, y, 0.1), (0, 0, 1), r, h, 14, 0.0, "graphite", cap0=False, cap1=False)
        hs.dome((x, y, 0.1 + h), (0, 0, 1), r, r * 0.4, 14, "graphite", bands=2)
        hs.cyl((x, y, 0.1 + h * 0.6), (0, 0, 1), r + 0.02, 0.07, 14, 0.0, "ochre", cap0=False)
        hs.light((x, y, 0.1 + h + r * 0.4 - 0.01), r=0.03, h=0.05)
    # Control hut.
    hs.box((-1.55, -2.0, 0.32), (0.62, 0.5, 0.44), 0.04, "steel")
    hs.box((-1.55, -2.26, 0.35), (0.42, 0.03, 0.08), 0.0, "visor", bottom=True)
    hs.box((-1.2, -2.0, 0.42), (0.04, 0.24, 0.3), 0.0, "ochre", bottom=True)
    hs.box((-1.55, -1.95, 0.58), (0.3, 0.24, 0.08), 0.02, "graphite_dk")
    # Pipework.
    pipe_run(hs, [(-1.25, 1.2, 0.35), (-1.25, 0.3, 0.35), (-1.0, 0.3, 0.35), (-1.0, 0.25, 0.75)], 0.05, "steel")
    pipe_run(hs, [(-0.45, 1.55, 0.5), (-0.45, 0.9, 0.5), (0.2, 0.9, 0.5)], 0.045, "rust")
    pipe_run(hs, [(-0.64, -0.55, 0.3), (0.2, -0.55, 0.3)], 0.05, "steel")
    pipe_run(hs, [(1.8, 0.9, 0.3), (1.8, 1.85, 0.3), (1.69, 1.85, 0.3)], 0.045, "steel")
    pipe_run(hs, [(1.35, -1.45, 0.4), (1.35, -0.6, 0.4)], 0.04, "rust")
    for x, y in ((-1.25, 0.75), (-0.1, -0.55), (1.8, 1.4)):
        hs.box((x, y, 0.2), (0.14, 0.08, 0.2), 0.0, "graphite_dk")     # pipe stands
    return hs


def build_relay(rng):
    hs = HS(rng)
    hx, hy = 0.425, 0.5
    plinth = [(-hx + 0.12, -hy), (hx - 0.12, -hy), (hx, -hy + 0.12), (hx, hy - 0.12), (hx - 0.12, hy),
              (-hx + 0.12, hy), (-hx, hy - 0.12), (-hx, -hy + 0.12)]
    hs.prism(plinth, SINK, 0.12, 0.03, "graphite_dk")
    for k in range(4):
        hs.decal((-0.27 + k * 0.18, -hy + 0.07, 0.1205), (0.08, 0.07), "ochre", rot=0.6)
    # Equipment cabinet: ochre door, louvres, roof plate, status lamp.
    hs.box((0.0, -0.17, 0.33), (0.5, 0.4, 0.42), 0.035, "graphite")
    hs.box((-0.08, -0.375, 0.32), (0.26, 0.025, 0.32), 0.006, "ochre", bottom=True)
    vents(hs, 0.08, 0.2, -0.37, 0.2, 0.46, 4, 0.02)
    hs.box((0.0, -0.17, 0.565), (0.42, 0.32, 0.05), 0.012, "steel")
    hs.light((0.16, -0.28, 0.59), r=0.022, h=0.04)
    # Mast with collars, sector antennas, a dish, guy struts and the beacon at exactly 1.6.
    mx, my = 0.0, 0.2
    hs.cyl((mx, my, 0.12), (0, 0, 1), 0.11, 0.1, 8, 0.02, "steel", cap0=False, smooth=False)
    hs.cyl((mx, my, 0.22), (0, 0, 1), 0.075, 1.2, 8, 0.0, "graphite", r1=0.048, rot=math.pi / 8, smooth=False,
           cap0=False, cap1=False)
    for z in (0.5, 0.88, 1.22):
        rr = 0.075 - (z - 0.22) / 1.2 * 0.027
        hs.cyl((mx, my, z), (0, 0, 1), rr + 0.018, 0.04, 8, 0.0, "steel", rot=math.pi / 8, smooth=False, cap0=False)
    for sx in (-1, 1):
        hs.box((mx + sx * 0.1, my, 1.08), (0.04, 0.17, 0.32), 0.012, "ivory", bottom=True)
        hs.box((mx + sx * 0.07, my, 1.08), (0.04, 0.05, 0.06), 0.0, "graphite_dk", bottom=True)
    arm = Vector((0.0, -1.0, 0.25)).normalized()
    hs.cyl((mx, my - 0.06, 0.74), arm, 0.018, 0.12, 6, 0.0, "steel", cap0=False, cap1=False)
    dish_c = Vector((mx, my - 0.06, 0.74)) + arm * 0.12
    hs.cyl(dish_c, arm, 0.03, 0.05, 12, 0.0, "graphite_dk", cap0=False, cap1=True, r1=0.15)
    hs.cyl(dish_c + arm * 0.05, arm, 0.15, 0.015, 12, 0.0, "ivory", cap0=False)
    hs.cyl((mx, my, 1.42), (0, 0, 1), 0.06, 0.07, 8, 0.0, "graphite_dk", cap0=False, smooth=False)
    hs.cyl((mx, my, 1.49), (0, 0, 1), 0.045, 0.11, 8, 0.014, "lamp", mat=1, cap0=False, smooth=False)
    for gx, gy in ((-0.3, 0.4), (0.3, 0.4), (0.0, -0.42)):
        a = Vector((gx, gy, 0.12))
        b = Vector((mx, my, 0.82))
        d = b - a
        hs.cyl(a, d, 0.012, d.length, 5, 0.0, "steel", cap0=False, cap1=False, smooth=False)
        hs.box(tuple(a), (0.05, 0.05, 0.03), 0.0, "steel")
    return hs


def hauler_chassis(hs, rng):
    """Tracked chassis: two track pods, hull deck, front cab facing +y (glTF -Z, forward)."""
    hx = 0.525
    for sx in (-1, 1):
        px = sx * (hx - 0.12)
        hs.box((px, 0.0, 0.085), (0.24, 1.75, 0.27), 0.07, "graphite_dk", bottom=False)
        for y in (-0.56, -0.19, 0.19, 0.56):
            hs.cyl((sx * hx - sx * 0.012, y, 0.07), (sx, 0, 0), 0.075, 0.012, 8, 0.0, "steel", cap0=False,
                   smooth=False)
        hs.box((px, 0.0, 0.215), (0.2, 1.5, 0.03), 0.0, "graphite")    # fender
        hs.decal((px, 0.62, 0.2305), (0.16, 0.3), "ochre_w")            # worn accent plate
    hs.box((0.0, -0.05, 0.25), (0.62, 1.6, 0.16), 0.03, "graphite")
    hs.box((0.0, 0.62, 0.43), (0.58, 0.38, 0.22), 0.05, "graphite")
    hs.box((0.0, 0.81, 0.46), (0.46, 0.02, 0.07), 0.0, "visor", bottom=True)
    hs.box((0.0, 0.62, 0.55), (0.34, 0.24, 0.035), 0.01, "steel")
    hs.light((0.12, 0.62, 0.567), r=0.025, h=0.045)
    for sx in (-1, 1):
        hs.box((sx * 0.2, 0.84, 0.27), (0.08, 0.04, 0.04), 0.0, "lamp", mat=1)
        hs.box((sx * 0.26, 0.47, 0.42), (0.03, 0.12, 0.16), 0.0, "ochre_w", bottom=True)
        hs.box((sx * 0.27, -0.35, 0.3), (0.03, 0.34, 0.08), 0.0, "graphite_dk", bottom=True)   # side lockers
    hs.cyl((-0.22, 0.4, 0.33), (0, 0, 1), 0.03, 0.3, 6, 0.0, "graphite_dk", cap0=False, smooth=False)  # exhaust
    hs.cyl((-0.22, 0.4, 0.63), (0, 0, 1), 0.037, 0.02, 6, 0.0, "rust", cap0=False, smooth=False)
    hs.box((0.0, -0.86, 0.26), (0.36, 0.02, 0.03), 0.0, "lamp", mat=1)                       # rear light bar


def build_cargo(rng, idx):
    hs = HS(rng)
    hauler_chassis(hs, rng)
    if idx == 0:
        # Ore hopper: ochre bin walls with dark rims, basalt ore heaped inside.
        y0, y1 = -0.82, 0.38
        cy = (y0 + y1) * 0.5
        for sx in (-1, 1):
            hs.box((sx * 0.29, cy, 0.48), (0.04, y1 - y0, 0.24), 0.012, "ochre_w")
        for y in (y0 + 0.02, y1 - 0.02):
            hs.box((0.0, y, 0.48), (0.62, 0.04, 0.24), 0.012, "graphite")
        for y in (cy - 0.25, cy + 0.25):
            hs.box((0.0, y, 0.6), (0.62, 0.035, 0.03), 0.0, "graphite_dk")
        for _k in range(8):
            sz = rng.uniform(0.11, 0.17)
            hs.box((rng.uniform(-0.17, 0.17), rng.uniform(y0 + 0.12, y1 - 0.12), rng.uniform(0.44, 0.52)),
                   (sz, sz * rng.uniform(0.8, 1.1), sz * 0.7), 0.025, "ore")
    elif idx == 1:
        # Tanker: horizontal tank with domed heads and bands, saddles and a rear outlet.
        tr, tl, tz = 0.165, 0.92, 0.47
        y0 = -0.82
        hs.cyl((0.0, y0 + 0.12, tz), (0, 1, 0), tr, tl, 12, 0.0, "graphite", cap0=False, cap1=False)
        hs.dome((0.0, y0 + 0.12 + tl, tz), (0, 1, 0), tr, 0.07, 12, "graphite", bands=2)
        hs.dome((0.0, y0 + 0.12, tz), (0, -1, 0), tr, 0.07, 12, "graphite", bands=2)
        for y, paint in ((y0 + 0.3, "ochre_w"), (y0 + 0.82, "ochre_w"), (y0 + 0.56, "steel")):
            hs.cyl((0.0, y - 0.035, tz), (0, 1, 0), tr + 0.012, 0.07, 12, 0.0, paint, cap0=False, cap1=False)
        for y in (y0 + 0.25, y0 + 0.85):
            hs.box((0.0, y, 0.35), (0.36, 0.1, 0.06), 0.015, "graphite_dk")
        pipe_run(hs, [(0.1, y0 + 0.14, 0.38), (0.1, y0 - 0.02, 0.38)], 0.025, "steel")
        hs.light((-0.2, y0 + 0.02, 0.36), r=0.02, h=0.035)
    else:
        # Container carrier: flat bed with two ribbed containers and tie-down straps.
        hs.box((0.0, -0.22, 0.355), (0.64, 1.2, 0.05), 0.015, "steel")
        for (y, ln, paint) in ((-0.5, 0.56, "ochre_w"), (0.07, 0.5, "rust_w")):
            hs.box((0.0, y, 0.48), (0.56, ln, 0.2), 0.02, paint)
            for k in range(4):
                yy = y - ln * 0.5 + ln * (k + 0.5) / 4
                for sx in (-1, 1):
                    hs.box((sx * 0.285, yy, 0.48), (0.015, 0.03, 0.17), 0.0, "graphite_dk", bottom=True)
            hs.decal((0.0, y, 0.5805), (0.58, 0.035), "graphite_dk")
        hs.light((-0.22, -0.78, 0.38), r=0.02, h=0.035)
    return hs


def build_track(rng):
    """Crawler roadway: 1.35 wide, tiles every 2.0 along y (glTF z); flush with the ground."""
    hs = HS(rng)
    hx = 0.675
    open_ends = (False, False)
    hs.box((0.0, 0.0, 0.01), (1.35, 2.0, 0.02), 0.006, "bed", ends=open_ends)
    for sx in (-1, 1):
        hs.box((sx * (hx - 0.07), 0.0, 0.0275), (0.12, 2.0, 0.015), 0.005, "steel", ends=open_ends)
        hs.box((sx * 0.34, 0.0, 0.035), (0.09, 2.0, 0.03), 0.008, "steel", ends=open_ends)
    for y in (-0.75, -0.25, 0.25, 0.75):
        hs.box((0.0, y, 0.026), (0.56, 0.12, 0.012), 0.0, "graphite_dk")
        for sx in (-1, 1):
            hs.box((sx * 0.48, y, 0.026), (0.16, 0.12, 0.012), 0.0, "graphite_dk")
    return hs


# ----------------------------------------------------------------------------
# Colour bake, objects, export
# ----------------------------------------------------------------------------

AO_DIRS = kit.hemisphere_dirs(48)


DUST_SCALE = {"infra_cargo_0": 1.5, "infra_cargo_1": 1.5, "infra_cargo_2": 1.5}


def bake(hs, name, max_dist, tile=None):
    """Per-corner linear colours: paint, edge wear on chamfers, dust low/up, ray-cast AO."""
    verts = [Vector(v) for v in hs.verts]
    polys = list(hs.faces)
    all_verts = list(verts)
    if tile:
        # Tiling piece: occlude with copies one period away so seams match exactly.
        for off in (-tile, tile):
            base = len(all_verts)
            all_verts += [v + Vector((0.0, off, 0.0)) for v in verts]
            polys += [tuple(base + i for i in f) for f in hs.faces]
    bvh = BVHTree.FromPolygons(all_verts, polys, all_triangles=False, epsilon=0.0)
    rng = random.Random(f"{INFRA_SEED}:colour:{name}")
    paints = {k: (kit.hex_linear(h), w) for k, (h, w) in PAINTS.items()}
    top = max(v.z for v in verts)
    out = []
    for fi, f in enumerate(hs.faces):
        if hs.fmat[fi] == 1:
            out += [(1.0, 1.0, 1.0, 1.0)] * len(f)
            continue
        n = kit.face_normal(hs.verts, f)
        cen = Vector((0.0, 0.0, 0.0))
        for i in f:
            cen += verts[i]
        cen /= len(f)
        base, wear_amt = paints[hs.fpaint[fi]]
        jitter = 1.0 if tile else rng.uniform(0.93, 1.06)
        tag = hs.ftag[fi]
        for i in f:
            p = verts[i]
            shift = (cen - p) * 0.08
            if tile and abs(abs(p.y) - tile * 0.5) < 1e-6:
                # Seam vertex: no shift along the tiling axis, and the +end samples at its
                # periodic twin on the -end, so both ends bake identical colours.
                shift.y = 0.0
                if p.y > 0:
                    p = p - Vector((0.0, tile, 0.0))
            sample = p + shift + n * 0.0015
            hits = 0
            if sample.z > 0.0:
                t1 = n.orthogonal().normalized()
                t2 = n.cross(t1)
                for dx, dy, dz in AO_DIRS:
                    d = t1 * dx + t2 * dy + n * dz
                    if d.z < -1e-6 and -sample.z / d.z < max_dist:
                        hits += 1
                        continue
                    if bvh.ray_cast(sample, d, max_dist)[0] is not None:
                        hits += 1
                ao = 1.0 - hits / len(AO_DIRS)
            else:
                ao = 0.2
            col = base
            if tag == "edge":
                col = kit.mix3(col, WEAR, wear_amt)
            col = kit.mul3(col, jitter)
            up = n.z
            dust = 0.2 * kit.smoothstep(0.55, 0.95, up)
            dust = max(dust, 0.5 * kit.clamp(1.0 - p.z / 0.14, 0.0, 1.0) if up < 0.55 else 0.0)
            dust += 0.35 * (1.0 - ao) * max(up, 0.0)
            dust *= 1.0 - 0.35 * kit.clamp(p.z / max(top, 0.05), 0.0, 1.0)
            dust *= DUST_SCALE.get(name, 1.0)
            dcol = kit.mix3(DUST, DUST_LOW, kit.clamp(1.0 - p.z / 0.3, 0.0, 1.0))
            col = kit.mix3(col, dcol, kit.clamp(dust, 0.0, 0.75))
            col = kit.mul3(col, kit.lerp(0.22, 1.0, ao ** 1.2))
            out.append((col[0], col[1], col[2], 1.0))
    return out


def make_materials():
    def principled(name):
        m = bpy.data.materials.new(name)
        try:
            m.use_nodes = True
        except Exception:
            pass
        bsdf = [n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0]
        m.use_backface_culling = True
        return m, bsdf

    infra, bsdf = principled(MAT_INFRA)
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    vc = infra.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = COLOR_ATTR
    infra.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.58
    bsdf.inputs["Metallic"].default_value = 0.25
    infra.diffuse_color = (0.05, 0.05, 0.05, 1.0)
    light, bsdf = principled(MAT_LIGHT)
    bsdf.inputs["Base Color"].default_value = (*LIGHT, 1.0)
    bsdf.inputs["Emission Color"].default_value = (*LIGHT, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.4
    bsdf.inputs["Metallic"].default_value = 0.0
    light.diffuse_color = (*LIGHT, 1.0)
    return infra, light


def make_object(name, hs, mats, ao_dist, tile=None):
    colours = bake(hs, name, ao_dist, tile)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in hs.verts], [], list(hs.faces))
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
    for f in hs.faces:
        n = kit.face_normal(hs.verts, f)
        for i in f:
            x, y, z = hs.verts[i]
            u, v = kit.box_uv(x, z, -y, n.x, n.z, -n.y)
            uvs += [u, 1.0 - v]
    me.uv_layers.new(name="UVMap").data.foreach_set("uv", uvs)
    attr = me.color_attributes.new(name=COLOR_ATTR, type="FLOAT_COLOR", domain="CORNER")
    attr.data.foreach_set("color", [c for rgba in colours for c in rgba])
    me.color_attributes.active_color = attr
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def check_piece(name, hs):
    rule = INFRA[name]
    x0, x1, y0, y1, z0, z1 = hs.bounds()
    fx, fy = rule["foot"]
    problems = []
    if hs.tris() > rule["budget"]:
        problems.append(f"tris {hs.tris()} > {rule['budget']}")
    for lo, hi, full, axis in ((x0, x1, fx, "x"), (y0, y1, fy, "z")):
        if abs(lo + full * 0.5) > 1e-5 or abs(hi - full * 0.5) > 1e-5:
            problems.append(f"{axis} extent [{lo:.4f}, {hi:.4f}] != +-{full * 0.5}")
    want_base = 0.0 if rule.get("flush") else SINK
    if abs(z0 - want_base) > 1e-6:
        problems.append(f"base {z0:.4f}")
    if "top" in rule and abs(z1 - rule["top"]) > 1e-6:
        problems.append(f"top {z1:.4f}")
    if "top_max" in rule and z1 > rule["top_max"] + 1e-6:
        problems.append(f"top {z1:.4f} > {rule['top_max']}")
    print(f"INFRA {name:20s} tris={hs.tris():5d} x=[{x0:+.3f},{x1:+.3f}] z=[{y0:+.3f},{y1:+.3f}] "
          f"y=[{z0:+.3f},{z1:+.3f}] {'OK' if not problems else 'FAIL ' + ', '.join(problems)}")
    return problems


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, check_existing=False, export_format="GLB",
        export_copyright="Last Worlds - original procedural geometry (tools/blender/khepri_infra.py)",
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
        export_image_format="NONE", export_vertex_color="ACTIVE", export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True, export_attributes=False, export_cameras=False,
        export_lights=False, export_animations=False, export_skins=False, export_morph=False, export_yup=True,
        export_apply=False, export_extras=False, export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False, use_selection=False)


def verify_glb(path):
    """Re-read the GLB: names, transforms, exact footprints, base/top, budgets, materials,
    COLOR_0, TEXCOORD_0 convention (checked per triangle), and seamless track tiling."""
    import json
    import struct
    data = open(path, "rb").read()
    jlen, = struct.unpack_from("<I", data, 12)
    gl = json.loads(data[20:20 + jlen])
    blen, = struct.unpack_from("<I", data, 20 + jlen)
    binc = data[28 + jlen:28 + jlen + blen]
    problems = []
    for key in ("textures", "images", "samplers", "cameras", "animations", "skins", "extensionsUsed"):
        if gl.get(key):
            problems.append(f"unexpected {key}")
    mats = [m["name"] for m in gl["materials"]]
    if sorted(mats) != sorted([MAT_INFRA, MAT_LIGHT]):
        problems.append(f"materials {mats}")
    nodes = [gl["nodes"][i] for i in gl["scenes"][0]["nodes"]]
    if sorted(n["name"] for n in nodes) != sorted(INFRA):
        problems.append("node names")

    def acc(i):
        a = gl["accessors"][i]
        bv = gl["bufferViews"][a["bufferView"]]
        comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        fmt = {5126: "f", 5123: "H", 5125: "I", 5121: "B"}[a["componentType"]]
        size = struct.calcsize(fmt)
        stride = bv.get("byteStride", size * comps)
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        return [struct.unpack_from("<" + fmt * comps, binc, off + k * stride) for k in range(a["count"])]

    print("VERIFY node                   tris/budget  x[min,max]        z[min,max]        y[min,max]")
    for node in nodes:
        name = node["name"]
        rule = INFRA[name]
        if any(k in node for k in ("translation", "rotation", "scale", "matrix", "children")):
            problems.append(f"{name}: node transform")
        tris = 0
        pts = []
        ends = {}
        for prim in gl["meshes"][node["mesh"]]["primitives"]:
            attrs = prim["attributes"]
            for key in ("COLOR_0", "TEXCOORD_0", "NORMAL"):
                if key not in attrs:
                    problems.append(f"{name}: missing {key}")
            pos = acc(attrs["POSITION"])
            uv = acc(attrs["TEXCOORD_0"])
            col = acc(attrs["COLOR_0"])
            nrm = acc(attrs["NORMAL"])
            ind = [i[0] for i in acc(prim["indices"])]
            tris += len(ind) // 3
            pts += pos
            bad = 0
            for t in range(0, len(ind), 3):
                a, b, c = (Vector(pos[ind[t + k]]) for k in range(3))
                fn = (b - a).cross(c - a)
                if fn.length < 1e-12:
                    continue
                fn.normalize()
                srt = sorted((abs(fn.x), abs(fn.y), abs(fn.z)))
                if srt[2] - srt[1] < 0.02:
                    continue
                for k in range(3):
                    vi = ind[t + k]
                    eu, ev = kit.box_uv(*pos[vi], fn.x, fn.y, fn.z)
                    if abs(eu - uv[vi][0]) > 2e-4 or abs(ev - uv[vi][1]) > 2e-4:
                        bad += 1
            if bad:
                problems.append(f"{name}: {bad} UVs off the box-projection convention")
            if "tile" in rule:
                half = rule["tile"] * 0.5
                for vi, p in enumerate(pos):
                    if abs(abs(p[2]) - half) < 1e-5:
                        key = (round(p[0], 5), round(p[1], 5), tuple(round(c, 4) for c in nrm[vi]),
                               tuple(round(c / 65535.0 if isinstance(c, int) else c, 3) for c in col[vi]))
                        ends.setdefault(key, set()).add(1 if p[2] > 0 else -1)
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        zs = [p[2] for p in pts]
        fx, fz = rule["foot"]
        if abs(min(xs) + fx / 2) > 1e-4 or abs(max(xs) - fx / 2) > 1e-4:
            problems.append(f"{name}: x extent")
        if abs(min(zs) + fz / 2) > 1e-4 or abs(max(zs) - fz / 2) > 1e-4:
            problems.append(f"{name}: z extent")
        if abs(min(ys) - (0.0 if rule.get("flush") else SINK)) > 1e-5:
            problems.append(f"{name}: base {min(ys)}")
        if "top" in rule and abs(max(ys) - rule["top"]) > 1e-5:
            problems.append(f"{name}: top {max(ys)}")
        if "top_max" in rule and max(ys) > rule["top_max"] + 1e-5:
            problems.append(f"{name}: top {max(ys)}")
        if tris > rule["budget"]:
            problems.append(f"{name}: {tris} tris")
        if "tile" in rule:
            unmatched = [k for k, v in ends.items() if v != {-1, 1}]
            print(f"VERIFY {name}: {len(ends)} seam vertex keys, {len(unmatched)} unmatched across z = +-{rule['tile'] / 2}")
            if unmatched or not ends:
                problems.append(f"{name}: track ends do not match ({len(unmatched)} unmatched)")
        print(f"VERIFY {name:22s} {tris:5d}/{rule['budget']:<5d} [{min(xs):+.3f},{max(xs):+.3f}]  "
              f"[{min(zs):+.3f},{max(zs):+.3f}]  [{min(ys):+.3f},{max(ys):+.3f}]")
    print(f"VERIFY size={len(data)} bytes, materials={mats}, problems={len(problems)}")
    for p in problems:
        print("VERIFY PROBLEM", p)
    return problems


def build_all():
    pieces = []
    order = [("infra_landing_pad", build_landing_pad, 0.5), ("infra_refinery", build_refinery, 0.5),
             ("infra_relay", build_relay, 0.3)]
    for name, fn, ao in order:
        pieces.append((name, fn(random.Random(f"{INFRA_SEED}:{name}")), ao, None))
    for i in range(3):
        name = f"infra_cargo_{i}"
        pieces.append((name, build_cargo(random.Random(f"{INFRA_SEED}:{name}"), i), 0.3, None))
    pieces.append(("infra_track_segment", build_track(random.Random(f"{INFRA_SEED}:track")), 0.2, 2.0))
    return pieces


# ----------------------------------------------------------------------------
# Previews
# ----------------------------------------------------------------------------

def preview_infra_texture(infra_mat, tex_dir):
    d = kit.load_texture(os.path.join(tex_dir, "metal_plate_02", "metal_plate_02_Diffuse_1k.jpg"))
    n = kit.load_texture(os.path.join(tex_dir, "metal_plate_02", "metal_plate_02_nor_gl_1k.jpg"), True)
    nt = infra_mat.node_tree
    bsdf = [x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"][0]
    vc = [x for x in nt.nodes if x.type == "VERTEX_COLOR"][0]
    kit.textured_detail(nt, bsdf, vc.outputs["Color"], d, n, 1.0, 0.7)


def render_sheet(objs, pmats, path, engine, samples):
    scene = bpy.context.scene
    layout = [
        ("infra_landing_pad", (-4.3, 3.6)), ("infra_refinery", (1.4, 3.6)), ("infra_relay", (5.0, 4.6)),
        ("infra_cargo_0", (-4.9, -2.6)), ("infra_cargo_1", (-3.3, -2.6)), ("infra_cargo_2", (-1.7, -2.6)),
    ]
    for name, (x, y) in layout:
        kit.instance("sheet_" + name, objs[name], (x, y, 0.0))
        dy = {"infra_landing_pad": 3.5, "infra_refinery": 2.9}.get(name, 1.1 if "cargo" in name else 0.85)
        kit.text_label(name, (x, y - dy, 0.002), 0.17 if "cargo" not in name else 0.12, pmats["label"])
    for k in range(3):      # tiled track: three segments in a row, plus a 90 degree spur
        kit.instance(f"sheet_track_{k}", objs["infra_track_segment"], (1.2, -5.6 + 2.0 * k, 0.0))
    for k in range(2):
        kit.instance(f"sheet_spur_{k}", objs["infra_track_segment"], (2.875 + 2.0 * k, -2.6, 0.0), math.pi / 2)
    kit.text_label("infra_track_segment (x3 tiled + spur)", (3.2, -7.0, 0.002), 0.14, pmats["label"])
    kit.plane_obj("sheet_ground", -14.0, 14.0, -12.0, 16.0, 0.0, pmats["sheet"])
    kit.add_sun(kit.SUN_DIR, strength=3.9)
    kit.setup_world(scene, (0.42, 0.45, 0.48), 0.8)
    kit.add_ortho_camera((0.3, -0.2, 0.5), 55.0, 14.4)
    kit.setup_render(scene, engine, samples, 1800, 1500)
    kit.render(path)


def outpost_ground(x, y):
    """Flattened district pad blending into rolling plain (preview staging)."""
    d = max(abs(x - 0.0) / 6.5, abs(y - 12.0) / 12.5)
    w = kit.smoothstep(0.85, 1.25, d)
    return kit.lerp(0.0, kit.terrain_h(x * 0.8 + 3.0, y * 0.8 - 2.0) * 0.8, w)


def render_outpost(objs, terrain, pmats, path, engine, samples):
    """docs/13 district layout (terrain.ts, side = +1) at the 55 degree game camera."""
    scene = bpy.context.scene
    verts, faces = [], []
    nx, ny = 70, 120
    for j in range(ny + 1):
        y = kit.lerp(-8.0, 32.0, j / ny)
        for i in range(nx + 1):
            x = kit.lerp(-11.0, 11.0, i / nx)
            verts.append((x, y, outpost_ground(x, y)))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    me = bpy.data.meshes.new("outpost_ground")
    me.from_pydata(verts, [], faces)
    me.materials.append(pmats["ground"])
    me.shade_smooth()
    ground = bpy.data.objects.new("outpost_ground", me)
    scene.collection.objects.link(ground)

    x, s, side = 0.0, 12.0, 1
    put = kit.instance
    put("o_pad", objs["infra_landing_pad"], (x, s - 5.0, 0.0))
    for k in range(11):                                   # spine: 22 units along s
        put(f"o_spine_{k}", objs["infra_track_segment"], (x - 4.5 * side, s - 11.0 + 1.0 + 2.0 * k, 0.01))
    for k in range(3):                                    # spur: 6 units along x
        put(f"o_spur_{k}", objs["infra_track_segment"], (x - 2.0 * side - 2.0 + 2.0 * k, s - 5.0, 0.012), math.pi / 2)
    put("o_refinery", objs["infra_refinery"], (x + 2.1 * side, s + 3.5, 0.0))
    put("o_relay", objs["infra_relay"], (x + 3.9 * side, s - 4.7, 0.0))
    for i in range(3):
        put(f"o_cargo_{i}", objs[f"infra_cargo_{i}"], (x - 1.9 * side, s + 1.5 + i * 2.4, 0.0))
    # Surrounding basalt formations on the open plain (terrain kit instances).
    rng = random.Random(f"{INFRA_SEED}:outpost")
    spots = [(-6.0, 22.0, "basalt_spire_1", 2.0), (5.6, 21.5, "basalt_wall_0", 1.4), (6.0, 2.0, "basalt_clump_3", 1.2),
             (-6.2, 3.0, "basalt_clump_0", 1.0), (-5.8, 12.5, "basalt_spire_2", 1.6), (5.9, 11.0, "basalt_clump_5", 0.8),
             (1.5, 25.5, "basalt_wall_2", 1.5), (-2.5, -1.5, "basalt_clump_2", 0.7), (6.3, 16.0, "boulder_0", 1.0),
             (-6.4, 17.5, "basalt_fallen_0", 1.0), (3.4, -1.0, "boulder_1", 1.0)]
    for k, (px, py, name, sz) in enumerate(spots):
        if name in terrain:
            z = outpost_ground(px, py) - 0.02
            scale = sz if name.startswith(("basalt_spire", "basalt_wall", "basalt_clump")) else 1.0
            put(f"o_t{k}", terrain[name], (px, py, z), rng.uniform(0, 2 * math.pi), (1.0, 1.0, scale))
    for k in range(70):
        px, py = rng.uniform(-6.5, 6.5), rng.uniform(-3.0, 27.0)
        if abs(px) < 5.2 and -1.0 < py < 25.0:
            continue
        name = f"rock_{rng.randrange(6)}"
        if name in terrain:
            sc = rng.uniform(0.4, 0.9)
            put(f"o_r{k}", terrain[name], (px, py, outpost_ground(px, py) - 0.02), rng.uniform(0, 6.3), (sc, sc, sc))
    kit.add_sun(kit.SUN_DIR, strength=3.9)
    kit.setup_world(scene, (0.42, 0.45, 0.48), 0.8)
    kit.add_ortho_camera((0.0, 11.0, 0.3), 55.0, 12.5 * 1600.0 / 900.0)
    kit.setup_render(scene, engine, samples, 900, 1600)
    kit.render(path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="khepri_infra.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--textures", default=None)
    ap.add_argument("--terrain-kit", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    pieces = build_all()
    problems = []
    for name, hs, _ao, _tile in pieces:
        problems += [f"{name}: {p}" for p in check_piece(name, hs)]
    if problems:
        raise SystemExit("Infra contract violations:\n  " + "\n  ".join(problems))
    objs = {}
    for name, hs, ao, tile in pieces:
        objs[name] = make_object(name, hs, mats, ao, tile)
    export_glb(args.glb)
    print(f"INFRA exported {args.glb} ({os.path.getsize(args.glb)} bytes)")
    if verify_glb(args.glb):
        raise SystemExit("Exported GLB failed verification")

    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        pmats = kit.preview_materials()
        for o in objs.values():
            o.hide_render = True
        keep = set(objs)
        if args.textures:
            preview_infra_texture(mats[0], args.textures)
        render_sheet(objs, pmats, os.path.join(args.preview_dir, "preview-infra.png"), args.engine, args.samples)
        kit.clear_preview(keep)
        terrain = {}
        if args.terrain_kit:
            before = set(bpy.data.objects.keys())
            bpy.ops.import_scene.gltf(filepath=args.terrain_kit)
            for name in set(bpy.data.objects.keys()) - before:
                ob = bpy.data.objects[name]
                ob.hide_render = True
                terrain[name] = ob
                keep.add(name)
            if args.textures:
                rock_d = kit.load_texture(os.path.join(args.textures, "rock_face_03", "rock_face_03_Diffuse_1k.jpg"))
                rock_n = kit.load_texture(os.path.join(args.textures, "rock_face_03", "rock_face_03_nor_gl_1k.jpg"), True)
                basalt = bpy.data.materials.get(kit.MAT_BASALT)
                if basalt is not None:
                    nt = basalt.node_tree
                    bsdf = [x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"][0]
                    link = bsdf.inputs["Base Color"].links
                    if link:
                        kit.textured_detail(nt, bsdf, link[0].from_socket, rock_d, rock_n, 1.35, 0.85)
        if args.textures:
            gnd_d = kit.load_texture(os.path.join(args.textures, "dry_ground_rocks", "dry_ground_rocks_Diffuse_1k.jpg"))
            gnd_n = kit.load_texture(os.path.join(args.textures, "dry_ground_rocks", "dry_ground_rocks_nor_gl_1k.jpg"), True)
            nt = pmats["ground"].node_tree
            bsdf = [x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"][0]
            kit.textured_detail(nt, bsdf, bsdf.inputs["Base Color"].links[0].from_socket, gnd_d, gnd_n, 4.0, 0.9,
                                object_coords=True)
        render_outpost(objs, terrain, pmats, os.path.join(args.preview_dir, "preview-outpost.png"),
                       args.engine, args.samples)
        print("INFRA previews written")


if __name__ == "__main__":
    main()
