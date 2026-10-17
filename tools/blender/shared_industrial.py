"""Shared cross-planet industrial kit for Last Worlds (docs/14-shared-industrial-kit.md).

Tiling pipes (two diameter classes on a 2-unit grid, centreline 0.35), elbows, tees,
an inline valve, a pipe support, vertical/spherical/horizontal tanks and containers.
Planet-neutral: COLOR_0 is a mask set (R = baked AO, G = edge wear, B = dust/grime)
and three materials (shared_metal, shared_paint, shared_light) let the runtime theme
every planet. Previews compose the masks in the Khepri palette plus an icy swatch.

Pipe ends are identical half-flange rings on the cell edges, so pieces snap without
gaps or doubled flanges; seam vertices take their AO from one canonical straight-pipe
scene, so masks match across every joint.

Deterministic: fixed seed, no time-based values. Shares helpers with khepri_kit.py and
khepri_infra.py (same folder) without writing bytecode.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/shared_industrial.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/shared/industrial-kit.glb)" \\
        --preview-dir "$(wslpath -w $R/art/shared-industrial)" \\
        --textures "$(wslpath -w $R/art/source/polyhaven)"
"""

import argparse
import math
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import khepri_kit as kit  # noqa: E402
import khepri_infra as infra  # noqa: E402

SEED = "shared-industrial-v1"
MAT_NAMES = ("shared_metal", "shared_paint", "shared_light")
METAL, PAINT, LIGHT = 0, 1, 2
COLOR_ATTR = "Col"
CL = 0.35                     # pipe centreline height
PIPE = {
    "s": dict(r=0.08, rf=0.115, t=0.035, seg=10, bend=0.3),
    "l": dict(r=0.16, rf=0.215, t=0.045, seg=12, bend=0.42),
}

# Contract (docs/14 section 3), glTF x/z footprint as Blender x/y.
RULES = {
    "pipe_s_straight": dict(budget=120, cls="s"), "pipe_l_straight": dict(budget=160, cls="l"),
    "pipe_s_elbow": dict(budget=300, cls="s"), "pipe_l_elbow": dict(budget=300, cls="l"),
    "pipe_s_tee": dict(budget=360, cls="s"), "pipe_l_tee": dict(budget=360, cls="l"),
    "pipe_valve": dict(budget=400, cls="l", top_max=0.8, ground=True),
    "pipe_support": dict(budget=150, foot=(0.7, 0.3), ground=True),
    "tank_vertical_0": dict(budget=900, radius=0.6, top_range=(1.0, 1.5), ground=True),
    "tank_vertical_1": dict(budget=900, radius=0.6, top_range=(1.0, 1.5), ground=True),
    "tank_sphere": dict(budget=900, radius=0.55, top_max=1.5, ground=True),
    "tank_horizontal": dict(budget=700, foot=(2.0, 0.8), top_max=0.9, ground=True),
    "container_0": dict(budget=300, foot=(1.2, 0.7), top_max=0.6, ground=True),
    "container_1": dict(budget=300, foot=(1.2, 0.7), top_max=0.6, ground=True),
    # A processing facility (17 October 2026): the shared mid-size building for outposts and battery emplacements.
    "facility": dict(budget=1600, foot=(2.8, 2.2), top_range=(1.6, 1.95), ground=True),
}
NODE_ORDER = list(RULES)


# ----------------------------------------------------------------------------
# Pipe sweeps with explicit, mirror-symmetric ring frames
# ----------------------------------------------------------------------------

UP = Vector((0.0, 0.0, 1.0))


def ring(hs, c, u, r, seg):
    """Ring of seg vertices around centre c in the plane spanned by u (horizontal) and UP.
    Angles (k + 0.5) * 2pi / seg with even seg make the ring mirror-symmetric in u and UP."""
    return [hs.v(c + (u * math.cos((k + 0.5) * 2 * math.pi / seg) + UP * math.sin((k + 0.5) * 2 * math.pi / seg)) * r)
            for k in range(seg)]


def connect(hs, a, b, mat, tag, axis_pts):
    """Quads between two rings; oriented away from the local axis (outer surface)."""
    seg = len(a)
    for k in range(seg):
        j = (k + 1) % seg
        q = (a[k], a[j], b[j], b[k])
        cen = Vector((0.0, 0.0, 0.0))
        for i in q:
            cen += Vector(hs.verts[i])
        cen /= 4
        # nearest axis point among the two ring centres
        ax = min(axis_pts, key=lambda p: (p - cen).length)
        hs.face(q, "metal", tag, mat, outward=tuple(cen - ax))


def annulus(hs, a, b, mat, tag, normal):
    seg = len(a)
    for k in range(seg):
        j = (k + 1) % seg
        hs.face((a[k], a[j], b[j], b[k]), "metal", tag, mat, outward=tuple(normal))


def pipe_end(hs, cls, d, u):
    """Half-flange at the cell edge (outward direction d); returns the inner body ring."""
    p = PIPE[cls]
    c = Vector((d.x, d.y, CL))
    inner = c - d * p["t"]
    ra = ring(hs, c, u, p["rf"], p["seg"])
    rb = ring(hs, inner, u, p["rf"], p["seg"])
    rc = ring(hs, inner, u, p["r"], p["seg"])
    hs.face(tuple(ra), "metal", "main", PAINT, outward=tuple(d))          # end face (back-to-back when joined)
    connect(hs, ra, rb, PAINT, "edge", [c, inner])                         # worn flange rim
    annulus(hs, rb, rc, PAINT, "rim", -d)                                   # flange step
    return rc, inner


def body(hs, rings_and_centres):
    for (ra, ca), (rb, cb) in zip(rings_and_centres, rings_and_centres[1:]):
        connect(hs, ra, rb, METAL, "smooth", [ca, cb])


def build_straight(cls, rng):
    hs = infra.HS(rng)
    u = Vector((1.0, 0.0, 0.0))
    r0, c0 = pipe_end(hs, cls, Vector((0.0, 1.0, 0.0)), u)
    r1, c1 = pipe_end(hs, cls, Vector((0.0, -1.0, 0.0)), u)
    body(hs, [(r0, c0), (r1, c1)])
    return hs, [Vector((0.0, 1.0, 0.0)), Vector((0.0, -1.0, 0.0))]


def build_elbow(cls, rng):
    """Enters at glTF z = -1 (Blender y = +1) along the pipe, bends 90 degrees, exits at x = +1."""
    hs = infra.HS(rng)
    p = PIPE[cls]
    R = p["bend"]
    seq = []
    r0, c0 = pipe_end(hs, cls, Vector((0.0, 1.0, 0.0)), Vector((1.0, 0.0, 0.0)))
    seq.append((r0, c0))
    steps = 5
    for k in range(steps + 1):
        a = (math.pi * 0.5) * k / steps                       # 0 at (0, R), pi/2 at (R, 0)
        centre = Vector((R - R * math.cos(a), R - R * math.sin(a), CL))
        tau = Vector((math.sin(a), -math.cos(a), 0.0))      # travel direction
        u = Vector((-tau.y, tau.x, 0.0))                     # continuous frame along the sweep
        seq.append((ring(hs, centre, u, p["r"], p["seg"]), centre))
    r1, c1 = pipe_end(hs, cls, Vector((1.0, 0.0, 0.0)), Vector((0.0, 1.0, 0.0)))
    seq.append((r1, c1))
    body(hs, seq)
    return hs, [Vector((0.0, 1.0, 0.0)), Vector((1.0, 0.0, 0.0))]


def build_tee(cls, rng):
    """Straight along glTF z (Blender y) with a branch exiting at x = +1 and a tee fitting block."""
    hs = infra.HS(rng)
    p = PIPE[cls]
    u = Vector((1.0, 0.0, 0.0))
    r0, c0 = pipe_end(hs, cls, Vector((0.0, 1.0, 0.0)), u)
    r1, c1 = pipe_end(hs, cls, Vector((0.0, -1.0, 0.0)), u)
    body(hs, [(r0, c0), (r1, c1)])
    start = Vector((p["r"] * 0.5, 0.0, CL))
    rs = ring(hs, start, Vector((0.0, 1.0, 0.0)), p["r"], p["seg"])
    r2, c2 = pipe_end(hs, cls, Vector((1.0, 0.0, 0.0)), Vector((0.0, 1.0, 0.0)))
    body(hs, [(rs, start), (r2, c2)])
    s = p["r"] * 2.7
    hs.box((s * 0.12, 0.0, CL), (s, s, s), p["r"] * 0.25, "metal", mat=PAINT, bottom=True)
    return hs, [Vector((0.0, 1.0, 0.0)), Vector((0.0, -1.0, 0.0)), Vector((1.0, 0.0, 0.0))]


def build_valve(rng):
    """Inline gate valve with handwheel and actuator on a large straight; pedestal to the ground."""
    hs, ends = build_straight("l", rng)
    hs.box((0.0, 0.0, 0.06), (0.32, 0.3, 0.12), 0.0, "metal", mat=METAL)               # pedestal
    hs.box((0.0, 0.0, 0.355), (0.52, 0.48, 0.46), 0.05, "metal", mat=PAINT)            # valve body
    hs.cyl((0.0, 0.0, 0.585), (0, 0, 1), 0.13, 0.08, 10, 0.015, "metal", mat=METAL, cap0=False)  # bonnet
    hs.cyl((0.0, 0.0, 0.665), (0, 0, 1), 0.025, 0.08, 6, 0.0, "metal", mat=METAL, cap0=False, smooth=False)
    hs.cyl((0.0, 0.0, 0.74), (0, 0, 1), 0.2, 0.04, 16, 0.0, "metal", mat=PAINT, smooth=False)  # handwheel
    hs.box((0.36, 0.0, 0.42), (0.2, 0.26, 0.24), 0.03, "metal", mat=METAL)             # actuator
    hs.cyl((0.36, 0.0, 0.54), (0, 0, 1), 0.03, 0.05, 6, 0.0, "lamp", mat=LIGHT, cap0=False, smooth=False)
    return hs, ends


def build_support(rng):
    """Rack: two posts, a cross beam under a large pipe, saddles for two small pipes, top tie."""
    hs = infra.HS(rng)
    for sx in (-1, 1):
        hs.box((sx * 0.32, 0.0, 0.31), (0.06, 0.08, 0.62), 0.012, "metal", mat=METAL)
        hs.box((sx * 0.32, 0.0, 0.015), (0.06, 0.3, 0.03), 0.0, "metal", mat=METAL)       # feet
        hs.box((sx * 0.18, 0.0, 0.25), (0.07, 0.1, 0.04), 0.0, "metal", mat=PAINT)        # small-pipe saddles
    hs.box((0.0, 0.0, 0.17), (0.7, 0.1, 0.04), 0.0, "metal", mat=PAINT)                  # beam: large pipe sits on it
    hs.box((0.0, 0.0, 0.6), (0.7, 0.08, 0.04), 0.0, "metal", mat=METAL)                  # top tie
    return hs, []


# ----------------------------------------------------------------------------
# Tanks and containers
# ----------------------------------------------------------------------------

def ladder(hs, x, y0, y1, z0, z1, rungs, axis="y"):
    for side in (-1, 1):
        hs.box((x, (y0 + y1) * 0.5 + side * (y1 - y0) * 0.5, (z0 + z1) * 0.5), (0.02, 0.02, z1 - z0), 0.0, "metal")
    for k in range(rungs):
        z = z0 + (z1 - z0) * (k + 0.5) / rungs
        hs.box((x, (y0 + y1) * 0.5, z), (0.015, y1 - y0, 0.015), 0.0, "metal")


def build_tank_vertical(rng, idx):
    hs = infra.HS(rng)
    if idx == 0:
        r, h = 0.55, 1.0
        hs.cyl((0, 0, 0), (0, 0, 1), 0.58, 0.06, 20, 0.015, "metal", mat=METAL, cap0=False)
        hs.cyl((0, 0, 0.06), (0, 0, 1), r, h, 20, 0.0, "metal", mat=METAL, cap0=False, cap1=False)
        hs.cyl((0, 0, 0.06 + h), (0, 0, 1), r + 0.01, 0.18, 20, 0.0, "metal", mat=METAL, cap0=False, r1=0.09)
        for z in (0.36, 0.72):
            hs.cyl((0, 0, z), (0, 0, 1), r + 0.015, 0.07, 20, 0.0, "metal", mat=PAINT, cap0=False)
        hs.cyl((0, 0, 0.06 + h + 0.18), (0, 0, 1), 0.06, 0.06, 8, 0.0, "metal", mat=METAL, cap0=False)
        hs.cyl((0, 0, 1.36), (0, 0, 1), 0.035, 0.05, 6, 0.0, "lamp", mat=LIGHT, cap0=False, smooth=False)
        ladder(hs, 0.575, -0.09, 0.09, 0.06, 1.06, 6)
        hs.cyl((0.0, -r + 0.01, 0.2), (0, -1, 0), 0.06, 0.025, 8, 0.0, "metal", mat=METAL, cap0=False)  # nozzle
        hs.cyl((0.0, -r - 0.012, 0.2), (0, -1, 0), 0.08, 0.02, 10, 0.0, "metal", mat=PAINT, smooth=False)
        hs.cyl((-0.3, -0.4, 0.42), (-0.6, -0.8, 0), 0.1, 0.04, 10, 0.0, "metal", mat=PAINT, smooth=False)  # manway
    else:
        r, h = 0.42, 1.18
        hs.cyl((0, 0, 0), (0, 0, 1), 0.45, 0.06, 16, 0.015, "metal", mat=METAL, cap0=False)
        hs.cyl((0, 0, 0.06), (0, 0, 1), r, h, 16, 0.0, "metal", mat=METAL, cap0=False, cap1=False)
        hs.dome((0, 0, 0.06 + h), (0, 0, 1), r, 0.17, 16, "metal", mat=METAL, bands=2)
        for z in (0.3, 0.62, 0.94):
            hs.cyl((0, 0, z), (0, 0, 1), r + 0.015, 0.06, 16, 0.0, "metal", mat=PAINT, cap0=False)
        hs.cyl((0, 0, 0.06 + h - 0.02), (0, 0, 1), 0.52, 0.03, 16, 0.0, "metal", mat=METAL, smooth=False)  # platform
        for k in range(6):
            a = 2 * math.pi * (k + 0.5) / 6
            hs.box((math.cos(a) * 0.5, math.sin(a) * 0.5, 1.29), (0.02, 0.02, 0.1), 0.0, "metal")
        hs.cyl((0, 0, 1.37), (0, 0, 1), 0.035, 0.05, 6, 0.0, "lamp", mat=LIGHT, cap0=False, smooth=False)
        ladder(hs, 0.445, -0.08, 0.08, 0.06, 1.22, 7)
        hs.cyl((0.0, -r + 0.01, 0.18), (0, -1, 0), 0.05, 0.05, 8, 0.0, "metal", mat=METAL, cap0=False)
        hs.cyl((0.0, -r - 0.035, 0.18), (0, -1, 0), 0.075, 0.02, 10, 0.0, "metal", mat=PAINT, smooth=False)
    return hs, []


def build_tank_sphere(rng):
    hs = infra.HS(rng)
    R, zc, seg, rings_n = 0.535, 0.86, 16, 8
    rings = []
    for i in range(1, rings_n):
        a = -math.pi * 0.5 + math.pi * i / rings_n
        rings.append(([hs.v((math.cos(2 * math.pi * k / seg) * R * math.cos(a),
                              math.sin(2 * math.pi * k / seg) * R * math.cos(a), zc + R * math.sin(a)))
                       for k in range(seg)], zc + R * math.sin(a)))
    bottom = hs.v((0, 0, zc - R))
    top = hs.v((0, 0, zc + R))
    cen = (0.0, 0.0, zc)
    for (ra, _), (rb, _) in zip(rings, rings[1:]):
        for k in range(seg):
            j = (k + 1) % seg
            hs.face((ra[k], ra[j], rb[j], rb[k]), "metal", "smooth", METAL, cen)
    for k in range(seg):
        j = (k + 1) % seg
        hs.face((bottom, rings[0][0][j], rings[0][0][k]), "metal", "smooth", METAL, cen)
        hs.face((top, rings[-1][0][k], rings[-1][0][j]), "metal", "smooth", METAL, cen)
    hs.cyl((0, 0, zc - 0.035), (0, 0, 1), 0.55, 0.07, 16, 0.0, "metal", mat=PAINT, cap0=False, cap1=False)
    for k in range(6):
        a = 2 * math.pi * k / 6
        x, y = math.cos(a) * 0.46, math.sin(a) * 0.46
        hs.cyl((x, y, 0.0), (0, 0, 1), 0.035, zc, 6, 0.0, "metal", mat=METAL, cap0=False, smooth=False)
        hs.box((x, y, 0.015), (0.09, 0.09, 0.03), 0.0, "metal", mat=METAL)
        b = 2 * math.pi * (k + 1) / 6
        p0 = Vector((x, y, 0.08))
        p1 = Vector((math.cos(b) * 0.46, math.sin(b) * 0.46, 0.55))
        hs.cyl(p0, p1 - p0, 0.012, (p1 - p0).length, 4, 0.0, "metal", mat=METAL, cap0=False, cap1=False,
               smooth=False)
    hs.cyl((0, 0, zc + R - 0.03), (0, 0, 1), 0.07, 0.07, 8, 0.0, "metal", mat=PAINT, cap0=False)
    hs.cyl((0, 0, zc + R + 0.04), (0, 0, 1), 0.03, 0.045, 6, 0.0, "lamp", mat=LIGHT, cap0=False, smooth=False)
    hs.cyl((0, 0, 0.0), (0, 0, 1), 0.04, zc - R + 0.03, 6, 0.0, "metal", mat=METAL, cap0=False, cap1=False,
           smooth=False)
    return hs, []


def build_tank_horizontal(rng):
    hs = infra.HS(rng)
    r, zc, half = 0.36, 0.47, 0.8
    hs.cyl((-half, 0, zc), (1, 0, 0), r, 2 * half, 16, 0.0, "metal", mat=METAL, cap0=False, cap1=False)
    hs.dome((half, 0, zc), (1, 0, 0), r, 0.2, 16, "metal", mat=METAL, bands=2)
    hs.dome((-half, 0, zc), (-1, 0, 0), r, 0.2, 16, "metal", mat=METAL, bands=2)
    for x in (-0.55, 0.0, 0.55):
        hs.cyl((x - 0.035, 0, zc), (1, 0, 0), r + 0.014, 0.07, 16, 0.0, "metal", mat=PAINT, cap0=False, cap1=False)
    for x in (-0.5, 0.5):
        hs.box((x, 0.0, 0.16), (0.2, 0.62, 0.32), 0.03, "metal", mat=METAL)
    hs.cyl((0.25, 0, zc + r - 0.03), (0, 0, 1), 0.1, 0.06, 10, 0.012, "metal", mat=PAINT, cap0=False)
    hs.cyl((-0.25, 0, zc + r - 0.02), (0, 0, 1), 0.04, 0.05, 6, 0.0, "metal", mat=METAL, cap0=False, smooth=False)
    hs.cyl((-0.25, 0, zc + r + 0.03), (0, 0, 1), 0.028, 0.03, 6, 0.0, "lamp", mat=LIGHT, cap0=False, smooth=False)
    hs.cyl((0.0, -r + 0.01, zc - 0.1), (0, -1, 0), 0.05, 0.03, 8, 0.0, "metal", mat=METAL, cap0=False)
    return hs, []


def build_container(rng, idx):
    hs = infra.HS(rng)
    if idx == 0:
        lx, ly, lz = 1.16, 0.6, 0.52
        hs.box((0, 0, lz * 0.5), (lx, ly, lz), 0.02, "metal", mat=PAINT)
        for side in (-1, 1):
            for k in range(6):
                x = -lx * 0.5 + 0.12 + k * (lx - 0.24) / 5
                hs.box((x, side * (ly * 0.5 + 0.006), lz * 0.5), (0.05, 0.012, lz - 0.08), 0.0, "metal", mat=PAINT)
        for sy in (-0.1, 0.1):
            hs.box((lx * 0.5 + 0.006, sy, lz * 0.5), (0.012, 0.025, lz - 0.08), 0.0, "metal", mat=METAL)
        for sx in (-1, 1):
            for sy in (-1, 1):
                hs.box((sx * (lx * 0.5 - 0.03), sy * (ly * 0.5 - 0.03), lz - 0.03), (0.07, 0.07, 0.06), 0.0,
                       "metal", mat=METAL, bottom=True)
    else:
        hs.box((0.0, 0.0, 0.02), (1.1, 0.64, 0.04), 0.0, "metal", mat=METAL)              # pallet
        for x in (-0.28, 0.28):
            hs.box((x, 0.0, 0.18), (0.5, 0.6, 0.28), 0.025, "metal", mat=PAINT)
        hs.box((-0.12, 0.02, 0.45), (0.5, 0.5, 0.26), 0.025, "metal", mat=PAINT)
        for x in (-0.28, 0.28):
            hs.box((x, 0.0, 0.322), (0.06, 0.62, 0.006), 0.0, "metal", mat=METAL, bottom=True)
        hs.box((-0.12, 0.02, 0.581), (0.06, 0.52, 0.006), 0.0, "metal", mat=METAL, bottom=True)
    return hs, []


def build_facility(rng):
    """Processing facility: a long hall on a plinth with a lit window band, a roller door, a low annex, an external
    stair, roof units, a vent and an exhaust stack with a beacon. Front (doors) toward -Y (glTF +Z)."""
    hs = infra.HS(rng)
    hs.box((0.0, 0.0, 0.05), (2.7, 2.1, 0.1), 0.02, "metal", mat=METAL)                      # plinth
    hs.box((-0.25, 0.15, 0.62), (1.9, 1.5, 1.04), 0.03, "metal", mat=PAINT)                   # hall
    hs.box((-0.25, 0.15, 1.17), (1.98, 1.58, 0.07), 0.015, "metal", mat=METAL)                # roof edge
    for z in (0.32, 0.86):                                                                     # panel seams
        hs.box((-0.25, 0.15, z), (1.92, 1.52, 0.025), 0.0, "metal", mat=METAL)
    for k in range(5):                                                                          # pilasters
        x = -1.2 + k * 0.475
        hs.box((x, -0.6 - 0.012, 0.62), (0.06, 0.03, 1.04), 0.0, "metal", mat=METAL)
    hs.box((-0.25, -0.6 - 0.02, 0.98), (1.7, 0.012, 0.09), 0.0, "lamp", mat=LIGHT)            # lit window band
    hs.box((0.35, -0.6 - 0.018, 0.4), (0.5, 0.02, 0.62), 0.0, "metal", mat=METAL)             # roller door
    for k in range(6):
        hs.box((0.35, -0.6 - 0.03, 0.15 + k * 0.1), (0.48, 0.01, 0.02), 0.0, "metal", mat=PAINT)
    hs.box((0.35, -0.6 - 0.035, 0.76), (0.56, 0.05, 0.05), 0.0, "metal", mat=PAINT)           # door header
    hs.box((-0.8, -0.6 - 0.018, 0.33), (0.24, 0.02, 0.44), 0.0, "metal", mat=METAL)           # personnel door
    hs.box((-0.8, -0.6 - 0.03, 0.6), (0.06, 0.02, 0.04), 0.0, "lamp", mat=LIGHT)              # door lamp
    # Annex: a lower block on the right with its own roof band and a lit window.
    hs.box((1.05, -0.2, 0.42), (0.6, 0.9, 0.64), 0.03, "metal", mat=METAL)
    hs.box((1.05, -0.2, 0.77), (0.66, 0.96, 0.06), 0.012, "metal", mat=PAINT)
    hs.box((1.05, -0.66, 0.48), (0.34, 0.012, 0.12), 0.0, "lamp", mat=LIGHT)
    # External stair up the left gable to the roof.
    for k in range(7):
        hs.box((-1.28, 0.62 - k * 0.14, 0.14 + k * 0.15), (0.16, 0.13, 0.03), 0.0, "metal", mat=METAL)
    hs.box((-1.36, 0.2, 0.62), (0.02, 0.98, 0.02), 0.0, "metal", mat=METAL)                   # rail
    # Roof units, a vent and the exhaust stack with its beacon.
    for x, y in ((-0.85, 0.45), (-0.35, 0.45)):
        hs.box((x, y, 1.3), (0.34, 0.3, 0.2), 0.02, "metal", mat=METAL)
        hs.cyl((x, y, 1.405), (0, 0, 1), 0.1, 0.02, 10, 0.0, "metal", mat=PAINT, cap0=False, smooth=False)
    hs.box((0.2, -0.15, 1.27), (0.6, 0.22, 0.14), 0.015, "metal", mat=METAL)
    hs.cyl((0.45, 0.55, 1.2), (0, 0, 1), 0.11, 0.55, 12, 0.0, "metal", mat=METAL, cap0=False)
    for z in (1.42, 1.62):
        hs.cyl((0.45, 0.55, z), (0, 0, 1), 0.125, 0.05, 12, 0.0, "metal", mat=PAINT, cap0=False, cap1=False)
    hs.cyl((0.45, 0.55, 1.75), (0, 0, 1), 0.035, 0.05, 6, 0.0, "lamp", mat=LIGHT, cap0=False, smooth=False)
    # A pipe run from the annex into the hall wall, with a valve wheel: ties it to the pipelines.
    hs.cyl((1.05, 0.25, 0.3), (0, 1, 0), 0.06, 0.6, 8, 0.0, "metal", mat=METAL, cap0=False)
    hs.cyl((1.05, 0.52, 0.3), (0, 1, 0), 0.085, 0.04, 10, 0.0, "metal", mat=PAINT, smooth=False)
    return hs, []


def build_all():
    out = {}
    for cls in ("s", "l"):
        out[f"pipe_{cls}_straight"] = build_straight(cls, random.Random(f"{SEED}:{cls}:straight"))
        out[f"pipe_{cls}_elbow"] = build_elbow(cls, random.Random(f"{SEED}:{cls}:elbow"))
        out[f"pipe_{cls}_tee"] = build_tee(cls, random.Random(f"{SEED}:{cls}:tee"))
    out["pipe_valve"] = build_valve(random.Random(f"{SEED}:valve"))
    out["pipe_support"] = build_support(random.Random(f"{SEED}:support"))
    for i in range(2):
        out[f"tank_vertical_{i}"] = build_tank_vertical(random.Random(f"{SEED}:tankv{i}"), i)
    out["tank_sphere"] = build_tank_sphere(random.Random(f"{SEED}:sphere"))
    out["tank_horizontal"] = build_tank_horizontal(random.Random(f"{SEED}:tankh"))
    for i in range(2):
        out[f"container_{i}"] = build_container(random.Random(f"{SEED}:container{i}"), i)
    out["facility"] = build_facility(random.Random(f"{SEED}:facility"))
    return out


# ----------------------------------------------------------------------------
# Mask bake: R = AO, G = edge wear, B = dust/grime
# ----------------------------------------------------------------------------

AO_DIRS = kit.hemisphere_dirs(48)
AO_DIST = 0.35


def rot_to(d):
    """Rotation about z mapping horizontal direction d onto +y."""
    return Matrix.Rotation(math.pi * 0.5 - math.atan2(d.y, d.x), 3, "Z")


def scene_bvh(hs, ends, cls):
    """BVH of a piece plus a straight neighbour attached at each open pipe end."""
    verts = [Vector(v) for v in hs.verts]
    polys = list(hs.faces)
    if ends:
        straight, _e = build_straight(cls, random.Random("neighbour"))
        for d in ends:
            m = rot_to(d).inverted()
            off = Vector((d.x * 2.0, d.y * 2.0, 0.0))
            base = len(verts)
            verts += [m @ Vector((v[0], v[1], v[2] - CL)) + Vector((0, 0, CL)) + off for v in straight.verts]
            polys += [tuple(base + i for i in f) for f in straight.faces]
    return BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)


def ao(bvh, sample, n):
    t1 = n.orthogonal().normalized()
    t2 = n.cross(t1)
    hits = 0
    for dx, dy, dz in AO_DIRS:
        d = t1 * dx + t2 * dy + n * dz
        if d.z < -1e-6 and sample.z > 0 and -sample.z / d.z < AO_DIST:
            hits += 1
            continue
        if bvh.ray_cast(sample, d, AO_DIST)[0] is not None:
            hits += 1
    return 1.0 - hits / len(AO_DIRS)


_CANON = {}


def canonical_bvh(cls):
    if cls not in _CANON:
        hs, ends = build_straight(cls, random.Random("canonical"))
        _CANON[cls] = scene_bvh(hs, ends, cls)
    return _CANON[cls]


def bake_masks(hs, ends, cls):
    bvh = scene_bvh(hs, ends, cls)
    verts = [Vector(v) for v in hs.verts]
    # Pipe pieces normalise dust height by the class flange top (not the piece's own top),
    # so seam masks are identical on straights, elbows, tees and the valve.
    top = CL + PIPE[cls]["rf"] if ends else max(v.z for v in verts)
    out = []
    for fi, f in enumerate(hs.faces):
        if hs.fmat[fi] == LIGHT:
            out += [(1.0, 0.0, 0.0, 1.0)] * len(f)
            continue
        n = kit.face_normal(hs.verts, f)
        cen = Vector((0.0, 0.0, 0.0))
        for i in f:
            cen += verts[i]
        cen /= len(f)
        tag = hs.ftag[fi]
        for i in f:
            p = verts[i]
            seam = None
            for d in ends:
                if abs((p - Vector((d.x, d.y, CL))).dot(d)) < 1e-6:
                    seam = d
            if seam is not None:
                # Seam vertex: AO from the canonical straight scene in this end's frame, so every
                # joint between any two pipe pieces carries identical masks.
                m = rot_to(seam)
                pc = m @ (p - Vector((seam.x, seam.y, CL))) + Vector((0.0, 1.0, CL))
                nc = m @ n
                shift = m @ ((cen - p) * 0.08)
                shift.y = 0.0
                occ = ao(canonical_bvh(cls), pc + shift + nc * 0.0015, nc)
            elif p.z <= 0.0:
                occ = 0.25
            else:
                occ = ao(bvh, p + (cen - p) * 0.08 + n * 0.0015, n)
            wear = 1.0 if tag == "edge" else (0.55 if tag == "rim" else 0.0)
            up = n.z
            dust = 0.75 * kit.smoothstep(0.55, 0.95, up)
            dust = max(dust, 0.9 * kit.clamp(1.0 - p.z / 0.14, 0.0, 1.0) if up < 0.55 else 0.0)
            dust += 0.6 * (1.0 - occ) * max(up, 0.0)
            dust *= 1.0 - 0.3 * kit.clamp(p.z / max(top, 0.05), 0.0, 1.0)
            out.append((occ, wear, kit.clamp(dust, 0.0, 1.0), 1.0))
    return out


# ----------------------------------------------------------------------------
# Objects, export, verification
# ----------------------------------------------------------------------------

def make_materials():
    mats = []
    for name, base, metal, rough in (("shared_metal", (0.5, 0.5, 0.5), 0.6, 0.5),
                                     ("shared_paint", (0.62, 0.62, 0.62), 0.0, 0.6),
                                     ("shared_light", (1.0, 1.0, 1.0), 0.0, 0.4)):
        m = bpy.data.materials.new(name)
        try:
            m.use_nodes = True
        except Exception:
            pass
        bsdf = [n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0]
        bsdf.inputs["Base Color"].default_value = (*base, 1.0)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        if name == "shared_light":
            bsdf.inputs["Emission Color"].default_value = (1.0, 1.0, 1.0, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.0
        m.use_backface_culling = True
        mats.append(m)
    return mats


def make_object(name, hs, ends, mats):
    cls = RULES[name].get("cls", "l")
    masks = bake_masks(hs, ends, cls)
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
    attr.data.foreach_set("color", [c for rgba in masks for c in rgba])
    me.color_attributes.active_color = attr
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def check_piece(name, hs, ends):
    rule = RULES[name]
    x0, x1, y0, y1, z0, z1 = hs.bounds()
    problems = []
    if hs.tris() > rule["budget"]:
        problems.append(f"tris {hs.tris()} > {rule['budget']}")
    if z1 > 2.0:
        problems.append("taller than 2.0")
    if "cls" in rule:
        rf = PIPE[rule["cls"]]["rf"]
        if min(x0, y0) < -1.0 - 1e-6 or max(x1, y1) > 1.0 + 1e-6:
            problems.append("outside the 2 x 2 cell")
        if name != "pipe_valve" and z0 < CL - rf * 1.01:
            problems.append(f"pipe bottom {z0:.4f} below the flange")
    if rule.get("ground") and abs(z0) > 1e-6:
        problems.append(f"base {z0:.4f} (pieces stand on y = 0)")
    if "foot" in rule:
        fx, fy = rule["foot"]
        if max(-x0, x1) > fx * 0.5 + 1e-6 or max(-y0, y1) > fy * 0.5 + 1e-6:
            problems.append("footprint")
    if "radius" in rule:
        rmax = max(math.hypot(v[0], v[1]) for v in hs.verts)
        if rmax > rule["radius"] + 1e-6:
            problems.append(f"radius {rmax:.3f}")
    if "top_max" in rule and z1 > rule["top_max"] + 1e-6:
        problems.append(f"top {z1:.3f}")
    if "top_range" in rule and not (rule["top_range"][0] - 1e-6 <= z1 <= rule["top_range"][1] + 1e-6):
        problems.append(f"top {z1:.3f}")
    print(f"SHARED {name:16s} tris={hs.tris():4d} x=[{x0:+.3f},{x1:+.3f}] z=[{y0:+.3f},{y1:+.3f}] "
          f"y=[{z0:+.3f},{z1:+.3f}] {'OK' if not problems else 'FAIL ' + ', '.join(problems)}")
    return problems


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, check_existing=False, export_format="GLB",
        export_copyright="Last Worlds - original procedural geometry (tools/blender/shared_industrial.py)",
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
        export_image_format="NONE", export_vertex_color="ACTIVE", export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True, export_attributes=False, export_cameras=False,
        export_lights=False, export_animations=False, export_skins=False, export_morph=False, export_yup=True,
        export_apply=False, export_extras=False, export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False, use_selection=False)


GLTF_ENDS = {   # open pipe ends per piece as glTF outward directions
    "pipe_s_straight": [(0, 0, -1), (0, 0, 1)], "pipe_l_straight": [(0, 0, -1), (0, 0, 1)],
    "pipe_s_elbow": [(0, 0, -1), (1, 0, 0)], "pipe_l_elbow": [(0, 0, -1), (1, 0, 0)],
    "pipe_s_tee": [(0, 0, -1), (0, 0, 1), (1, 0, 0)], "pipe_l_tee": [(0, 0, -1), (0, 0, 1), (1, 0, 0)],
    "pipe_valve": [(0, 0, -1), (0, 0, 1)],
}


def verify_glb(path):
    """Contract checks plus pipe snapping: every open end lies on its cell edge at the
    centreline, and all ends of a class share one profile (positions, normals, masks)."""
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
    if sorted(mats) != sorted(MAT_NAMES):
        problems.append(f"materials {mats}")
    nodes = [gl["nodes"][i] for i in gl["scenes"][0]["nodes"]]
    if sorted(n["name"] for n in nodes) != sorted(NODE_ORDER):
        problems.append("node names")

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

    profiles = {}
    print("VERIFY node              tris/budget  x[min,max]        z[min,max]        y[min,max]")
    for node in nodes:
        name = node["name"]
        rule = RULES[name]
        if any(k in node for k in ("translation", "rotation", "scale", "matrix", "children")):
            problems.append(f"{name}: node transform")
        tris = 0
        allp = []
        endkeys = {tuple(e): set() for e in GLTF_ENDS.get(name, [])}
        for prim in gl["meshes"][node["mesh"]]["primitives"]:
            at = prim["attributes"]
            for key in ("COLOR_0", "TEXCOORD_0", "NORMAL"):
                if key not in at:
                    problems.append(f"{name}: missing {key}")
            pos, nrm, uv, col = acc(at["POSITION"]), acc(at["NORMAL"]), acc(at["TEXCOORD_0"]), acc(at["COLOR_0"])
            ind = [i[0] for i in acc(prim["indices"])]
            tris += len(ind) // 3
            allp += pos
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
                        problems.append(f"{name}: UV off convention")
                        break
            for e in endkeys:
                o = Vector(e)
                lat = o.cross(Vector((0.0, 1.0, 0.0)))     # lateral axis of this end frame
                for vi, p in enumerate(pos):
                    pv = Vector(p)
                    if abs(pv.dot(o) - 1.0) < 1e-5:
                        rel = pv - o
                        nv = Vector(nrm[vi])
                        endkeys[e].add((round(rel.dot(lat), 4), round(pv.y - CL, 4), round(nv.dot(lat), 3),
                                        round(nv.y, 3), round(nv.dot(o), 3), tuple(round(c, 3) for c in col[vi][:3])))
        xs, ys, zs = [p[0] for p in allp], [p[1] for p in allp], [p[2] for p in allp]
        if tris > rule["budget"]:
            problems.append(f"{name}: {tris} tris")
        if max(ys) > 2.0:
            problems.append(f"{name}: taller than 2.0")
        if rule.get("ground") and abs(min(ys)) > 1e-5:
            problems.append(f"{name}: base {min(ys)}")
        if "cls" in rule:
            if min(xs) < -1 - 1e-5 or max(xs) > 1 + 1e-5 or min(zs) < -1 - 1e-5 or max(zs) > 1 + 1e-5:
                problems.append(f"{name}: geometry outside its 2 x 2 cell (doubled flange)")
            rf = PIPE[rule["cls"]]["rf"]
            for e, keys in endkeys.items():
                if not keys:
                    problems.append(f"{name}: no geometry on end {e}")
                    continue
                rad = max(math.hypot(k[0], k[1]) for k in keys)
                if abs(rad - rf) > 2e-4:
                    problems.append(f"{name}: end {e} radius {rad:.4f} != {rf}")
                prof = frozenset(keys)
                profiles.setdefault(rule["cls"], {}).setdefault(prof, []).append(f"{name}{e}")
        print(f"VERIFY {name:16s} {tris:4d}/{rule['budget']:<4d}  [{min(xs):+.3f},{max(xs):+.3f}]  "
              f"[{min(zs):+.3f},{max(zs):+.3f}]  [{min(ys):+.3f},{max(ys):+.3f}]")
    for cls, profs in profiles.items():
        n_ends = sum(len(v) for v in profs.values())
        print(f"VERIFY pipe class {cls}: {n_ends} open ends share {len(profs)} profile(s)")
        if len(profs) != 1:
            for prof, who in profs.items():
                print("VERIFY   profile used by", who)
            problems.append(f"pipe class {cls}: ends differ ({len(profs)} profiles)")
    print(f"VERIFY size={len(data)} bytes, materials={mats}, problems={len(problems)}")
    for p in problems:
        print("VERIFY PROBLEM", p)
    return problems


# ----------------------------------------------------------------------------
# Previews: masks composed into planet palettes
# ----------------------------------------------------------------------------

KHEPRI = dict(metal="#3a3b3d", paint="#a07434", wear="#9a948a", dust="#a8744a", lamp="#ffb04a", ground="sheet")
ICY = dict(metal="#c3ccd4", paint="#3d6fae", wear="#f2f6fa", dust="#e9eff5", lamp="#55b4ff", ground="ice")


def palette_material(name, base_hex, pal, tex=None, emissive=False):
    """Compose final colour from the masks: base -> wear (G) -> dust (B), times AO (R)."""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    if emissive:
        c = kit.hex_linear(pal["lamp"])
        bsdf.inputs["Base Color"].default_value = (*c, 1.0)
        bsdf.inputs["Emission Color"].default_value = (*c, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
        return m
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = COLOR_ATTR
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(vc.outputs["Color"], sep.inputs["Color"])
    wear = nt.nodes.new("ShaderNodeMix")
    wear.data_type = "RGBA"
    wear.inputs["A"].default_value = (*kit.hex_linear(base_hex), 1.0)
    wear.inputs["B"].default_value = (*kit.hex_linear(pal["wear"]), 1.0)
    wf = nt.nodes.new("ShaderNodeMath")
    wf.operation = "MULTIPLY"
    wf.inputs[1].default_value = 0.6
    nt.links.new(sep.outputs["Green"], wf.inputs[0])
    nt.links.new(wf.outputs["Value"], wear.inputs["Factor"])
    dust = nt.nodes.new("ShaderNodeMix")
    dust.data_type = "RGBA"
    dust.inputs["B"].default_value = (*kit.hex_linear(pal["dust"]), 1.0)
    df = nt.nodes.new("ShaderNodeMath")
    df.operation = "MULTIPLY"
    df.inputs[1].default_value = 0.55
    nt.links.new(sep.outputs["Blue"], df.inputs[0])
    nt.links.new(df.outputs["Value"], dust.inputs["Factor"])
    nt.links.new(wear.outputs["Result"], dust.inputs["A"])
    aom = nt.nodes.new("ShaderNodeMapRange")
    aom.inputs["To Min"].default_value = 0.25
    nt.links.new(sep.outputs["Red"], aom.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(dust.outputs["Result"], mul.inputs["A"])
    nt.links.new(aom.outputs["Result"], mul.inputs["B"])
    nt.links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.35 if "metal" in name else 0.0
    bsdf.inputs["Roughness"].default_value = 0.55
    if tex:
        kit.textured_detail(nt, bsdf, mul.outputs["Result"], tex[0], tex[1], 1.0, 0.6)
    return m


def apply_palette(obj, pal_mats):
    """Object-level material override: the same mesh, another planet's palette."""
    for slot in obj.material_slots:
        slot.link = "OBJECT"
    for i, slot in enumerate(obj.data.materials):
        obj.material_slots[i].material = pal_mats[slot.name]


def put(src, loc, rot=0.0, pal=None, name=None):
    o = kit.instance(name or f"p_{src.name}_{loc[0]:.1f}_{loc[1]:.1f}", src, loc, rot)
    if pal:
        apply_palette(o, pal)
    return o


def render_sheet(objs, pmats, pal, path, engine, samples):
    scene = bpy.context.scene
    rows = [
        (6.8, 2.6, ["pipe_s_straight", "pipe_s_elbow", "pipe_s_tee", "pipe_l_straight", "pipe_l_elbow", "pipe_l_tee"]),
        (3.4, 2.4, ["pipe_valve", "pipe_support", "container_0", "container_1", "facility"]),
        (0.0, 2.6, ["tank_vertical_0", "tank_vertical_1", "tank_sphere", "tank_horizontal"]),
    ]
    for y, dx, names in rows:
        dx = min(dx, 2.35)
        for c, name in enumerate(names):
            x = (c - (len(names) - 1) * 0.5) * dx
            put(objs[name], (x, y, 0.0), pal=pal[0], name=f"sheet_{name}")
            kit.text_label(name, (x, y - 1.25, 0.002), 0.15, pmats["label"])
    # Alternate palette swatch: icy metal, blue paint, cool lamps, on a pale slab.
    kit.plane_obj("swatch_ground", -5.2, 5.2, -4.9, -2.3, 0.004, pmats["ice"])
    for c, name in enumerate(["tank_sphere", "tank_vertical_1", "facility", "pipe_valve", "container_0"]):
        put(objs[name], (-4.0 + c * 2.0, -3.6, 0.004), pal=pal[1], name=f"swatch_{name}")
    kit.text_label("alternate palette (icy metal, blue paint, cool lamps)", (0.0, -5.3, 0.002), 0.15, pmats["label"])
    kit.plane_obj("sheet_ground", -14.0, 14.0, -10.0, 16.0, 0.0, pmats["sheet"])
    kit.add_sun(kit.SUN_DIR, strength=3.9)
    kit.setup_world(scene, (0.42, 0.45, 0.48), 0.8)
    kit.add_ortho_camera((0.0, 1.0, 0.5), 55.0, 15.2)
    kit.setup_render(scene, engine, samples, 1800, 1700)
    kit.render(path)


def render_pipeline(objs, pmats, pal, path, engine, samples):
    """A pipeline on the 2-unit grid: straights on supports, a valve, an elbow and a tee
    branching into a tank farm; a parallel pair of small runs; containers. Plus an icy
    swatch at the top to prove the masks re-theme."""
    scene = bpy.context.scene
    K = pal[0]
    rot = {"y": 0.0, "x": math.pi / 2}
    # Large run along +y: x = -2 cells from y = -6 to y = 4.
    put(objs["pipe_l_straight"], (-2.0, -6.0, 0.0), pal=K)
    put(objs["pipe_valve"], (-2.0, -4.0, 0.0), pal=K)
    put(objs["pipe_l_straight"], (-2.0, -2.0, 0.0), pal=K)
    put(objs["pipe_l_tee"], (-2.0, 0.0, 0.0), pal=K)                   # branch toward +x
    put(objs["pipe_l_straight"], (-2.0, 2.0, 0.0), pal=K)
    put(objs["pipe_l_elbow"], (-2.0, 4.0, 0.0), -math.pi / 2, pal=K)   # joins -y edge to +x edge
    put(objs["pipe_l_straight"], (0.0, 4.0, 0.0), rot["x"], pal=K)
    put(objs["pipe_l_straight"], (2.0, 4.0, 0.0), rot["x"], pal=K)
    # Branch from the tee: along +x to an elbow turning +y into the tank farm.
    put(objs["pipe_l_straight"], (0.0, 0.0, 0.0), rot["x"], pal=K)
    put(objs["pipe_l_elbow"], (2.0, 0.0, 0.0), math.pi / 2, pal=K)     # joins -x edge to +y edge
    for x, y, r in ((-2.0, -6.0, 0.0), (-2.0, -2.0, 0.0), (-2.0, 2.0, 0.0), (0.0, 0.0, rot["x"]),
                    (0.0, 4.0, rot["x"]), (2.0, 4.0, rot["x"])):
        put(objs["pipe_support"], (x, y, 0.0), r, pal=K, name=f"sup_{x}_{y}")
    # Tank farm.
    put(objs["tank_vertical_0"], (2.0, 1.75, 0.0), pal=K)
    put(objs["tank_vertical_1"], (3.6, 1.6, 0.0), pal=K)
    put(objs["tank_sphere"], (4.2, 3.2, 0.0), pal=K)
    put(objs["tank_horizontal"], (3.9, -0.6, 0.0), pal=K)
    # Two small runs side by side on the same supports (offset +-0.18 from the grid line).
    for k, y in enumerate((-6.0, -4.0, -2.0)):
        for off in (-0.18, 0.18):
            put(objs["pipe_s_straight"], (1.0 + off, y, 0.0), pal=K, name=f"small_{k}_{off}")
        put(objs["pipe_support"], (1.0, y, 0.0), pal=K, name=f"sup_small_{k}")
    # A single small line: tee with a branch, a straight, and an elbow turning +x.
    put(objs["pipe_s_tee"], (3.0, -6.0, 0.0), pal=K, name="s_tee")
    put(objs["pipe_s_straight"], (5.0, -6.0, 0.0), math.pi / 2, pal=K, name="s_branch")
    put(objs["pipe_s_straight"], (3.0, -4.0, 0.0), pal=K, name="s_mid")
    put(objs["pipe_s_elbow"], (3.0, -2.0, 0.0), -math.pi / 2, pal=K, name="s_elbow")
    put(objs["pipe_s_straight"], (5.0, -2.0, 0.0), math.pi / 2, pal=K, name="s_out")
    # Containers and crate stacks.
    put(objs["container_0"], (-4.2, -4.6, 0.0), 0.1, pal=K)
    put(objs["container_0"], (-4.3, -3.6, 0.0), -0.05, pal=K, name="c0b")
    put(objs["container_1"], (-4.1, -2.2, 0.0), 0.3, pal=K)
    put(objs["container_1"], (-4.0, 1.4, 0.0), 1.2, pal=K, name="c1b")
    # Icy swatch beyond the farm.
    kit.plane_obj("swatch_ground", -5.0, 5.0, 6.4, 9.6, 0.004, pmats["ice"])
    put(objs["pipe_l_straight"], (-3.0, 8.0, 0.004), rot["x"], pal=pal[1], name="ice_a")
    put(objs["pipe_l_tee"], (-1.0, 8.0, 0.004), -math.pi / 2, pal=pal[1], name="ice_b")
    put(objs["tank_sphere"], (1.4, 8.0, 0.004), pal=pal[1], name="ice_c")
    put(objs["tank_vertical_0"], (3.4, 8.0, 0.004), pal=pal[1], name="ice_d")
    put(objs["pipe_support"], (-3.0, 8.0, 0.004), rot["x"], pal=pal[1], name="ice_e")
    kit.plane_obj("ground", -14.0, 14.0, -14.0, 20.0, 0.0, pmats["ground"])
    kit.add_sun(kit.SUN_DIR, strength=3.9)
    kit.setup_world(scene, (0.42, 0.45, 0.48), 0.8)
    kit.add_ortho_camera((0.0, 0.6, 0.3), 55.0, 12.5 * 1600.0 / 900.0)
    kit.setup_render(scene, engine, samples, 900, 1600)
    kit.render(path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="shared_industrial.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--textures", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    pieces = build_all()
    problems = []
    for name in NODE_ORDER:
        hs, ends = pieces[name]
        problems += [f"{name}: {p}" for p in check_piece(name, hs, ends)]
    if problems:
        raise SystemExit("Shared kit contract violations:\n  " + "\n  ".join(problems))
    objs = {name: make_object(name, *pieces[name], mats) for name in NODE_ORDER}
    export_glb(args.glb)
    print(f"SHARED exported {args.glb} ({os.path.getsize(args.glb)} bytes)")
    if verify_glb(args.glb):
        raise SystemExit("Exported GLB failed verification")

    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        pmats = kit.preview_materials()
        pmats["ice"] = bpy.data.materials.new("preview_ice")
        try:
            pmats["ice"].use_nodes = True
        except Exception:
            pass
        [n for n in pmats["ice"].node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0].inputs["Base Color"].default_value = \
            (*kit.hex_linear("#c9d6df"), 1.0)
        tex = None
        if args.textures:
            tex = (kit.load_texture(os.path.join(args.textures, "metal_plate_02", "metal_plate_02_Diffuse_1k.jpg")),
                   kit.load_texture(os.path.join(args.textures, "metal_plate_02", "metal_plate_02_nor_gl_1k.jpg"), True))
        pal = []
        for pname, p in (("khepri", KHEPRI), ("icy", ICY)):
            pal.append({"shared_metal": palette_material(f"{pname}_metal", p["metal"], p, tex),
                        "shared_paint": palette_material(f"{pname}_paint", p["paint"], p, tex),
                        "shared_light": palette_material(f"{pname}_light", p["lamp"], p, emissive=True)})
        for o in objs.values():
            o.hide_render = True
        keep = set(objs)
        render_sheet(objs, pmats, pal, os.path.join(args.preview_dir, "preview-kit.png"), args.engine, args.samples)
        kit.clear_preview(keep)
        if args.textures:
            gd = kit.load_texture(os.path.join(args.textures, "dry_ground_rocks", "dry_ground_rocks_Diffuse_1k.jpg"))
            gn = kit.load_texture(os.path.join(args.textures, "dry_ground_rocks", "dry_ground_rocks_nor_gl_1k.jpg"),
                                  True)
            nt = pmats["ground"].node_tree
            bsdf = [x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"][0]
            kit.textured_detail(nt, bsdf, bsdf.inputs["Base Color"].links[0].from_socket, gd, gn, 4.0, 0.9,
                                object_coords=True)
        render_pipeline(objs, pmats, pal, os.path.join(args.preview_dir, "preview-pipeline.png"),
                        args.engine, args.samples)
        print("SHARED previews written")


if __name__ == "__main__":
    main()
