"""THE VEIL, Nacre's giant biomechanical boss for Last Worlds (docs/20-nacre-luminous-mire.md).

After the VEIL design of art/concepts/06-exotic-aliens.png (and the NACRE column of
05-alien-factions.png): a long dark-violet seed hull with layered nacre carapace plates and a black
chitin spine, three pairs of broad silver ribbon blades that loop out of the stern and sweep forward to
sharp tips (open honeycomb lattice in the loops), a concealed aft propulsion ring with teal glow,
trailing tendrils, two gill pods in blade cups (first targets) and a faceted heart in an iris behind
four petal shutters (core target). The concepts are references only; all geometry is original.

Conventions: glTF +Y up, 1 unit = 1 game unit, bow toward +Z (toward the player). y = 0 is the mire
surface (the keel dips below it). Every node is top-level and its translation is its socket; the four
heart shutters also carry a yaw so that each one opens by rotating about its own local +X axis.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/the_veil.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/nacre/the-veil.glb)" \\
        --preview-dir "$(wslpath -w $R/art/the-veil)"
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

import khepri_kit as kit  # noqa: E402
import nacre_fleet as nf  # noqa: E402
from nacre_fleet import (HS, SHELL, BLADE, FRAME, TEAL, band, crescent, shard_plate, glow_line,  # noqa: E402
                         lattice, patch_between, sweep, tube, bez_pts, lerp, framed_poly, icosahedron, arc_band, disc,
                         merge_hs, xform, append, mirror_x, open_crescent, bipyramid, poly_solid, flipped)

SEED = "the-veil-v1"
TARGET_Y = 2.2
TOP_MAX = 3.4

# Gameplay sockets (glTF: x, y up, z toward the player).
HEART = (0.0, 2.0, -1.8)
POD_L = (-3.1, 2.0, 0.4)
POD_R = (3.1, 2.0, 0.4)
BAY_L = (-1.7, 1.8, 2.6)
BAY_R = (1.7, 1.8, 2.6)
SHUTTER_R = 1.05            # hinge radius around the heart axis
SHUTTER_Z = 2.06            # hinge height
SHUTTER_APEX = 2.66         # closed dome apex height
SHUTTER_PHI = [math.radians(45 + 90 * k) for k in range(4)]   # azimuth from +Z toward +X (glTF yaw)
ENGINE_C = (0.0, 1.35, -7.3)
ENGINE_AXIS_TILT = math.radians(45.0)


def P(x, y, z):
    """Design space: x right, y forward (glTF +Z), z up (glTF +Y)."""
    return Vector((x, y, z))


def Dg(g):
    return Vector((g[0], g[2], g[1]))


def shutter_hinge(k):
    phi = SHUTTER_PHI[k]
    return (HEART[0] + SHUTTER_R * math.sin(phi), SHUTTER_Z, HEART[2] + SHUTTER_R * math.cos(phi))


SOCKETS = {
    "veil_hull": (0.0, 0.0, 0.0),
    "veil_pod_left": POD_L, "veil_pod_right": POD_R,
    "veil_pod_left_wreck": POD_L, "veil_pod_right_wreck": POD_R,
    "veil_heart": HEART, "veil_heart_wreck": HEART,
    "veil_heart_shutter_0": shutter_hinge(0), "veil_heart_shutter_1": shutter_hinge(1),
    "veil_heart_shutter_2": shutter_hinge(2), "veil_heart_shutter_3": shutter_hinge(3),
}
EMPTIES = {
    "veil_bay_left": BAY_L, "veil_bay_right": BAY_R,
    "veil_engine_0": ENGINE_C,
    "veil_engine_1": (-1.25, 0.95, -6.95), "veil_engine_2": (1.25, 0.95, -6.95),
}

# ----------------------------------------------------------------------------
# Hull
# ----------------------------------------------------------------------------

HULL = [  # (y, half-width W, crest T, chine C, keel B), design y descending (bow -> stern)
    (7.7, 0.24, 1.3, 0.98, 0.55),
    (6.6, 0.64, 1.5, 1.0, 0.2),
    (5.1, 1.08, 1.68, 1.02, -0.1),
    (3.5, 1.45, 1.82, 1.04, -0.3),
    (1.8, 1.7, 1.92, 1.05, -0.42),
    (0.2, 1.82, 1.96, 1.05, -0.48),
    (-1.8, 1.8, 1.97, 1.05, -0.48),
    (-3.7, 1.6, 1.88, 1.02, -0.42),
    (-5.3, 1.26, 1.74, 0.98, -0.3),
    (-6.5, 0.98, 1.6, 0.96, -0.12),
    (-7.05, 0.8, 1.52, 0.96, 0.0),
]
PROW = (0.0, 8.45, 1.22)
UPPER = [(0.0, 0.0), (0.42, -0.12), (0.78, -0.45), (1.0, None)]       # (x / W, z offset from T; None = chine)


def hull_at(y):
    st = HULL
    if y >= st[0][0]:
        return st[0][1:]
    if y <= st[-1][0]:
        return st[-1][1:]
    for a, b in zip(st, st[1:]):
        if b[0] <= y <= a[0]:
            k = (y - a[0]) / (b[0] - a[0])
            return tuple(a[i] + (b[i] - a[i]) * k for i in range(1, 5))


def deck_z(xf, y):
    W, T, C, B = hull_at(y)
    pts = [(f, T + dz if dz is not None else C) for f, dz in UPPER]
    xf = min(abs(xf), 1.0)
    for (f0, z0), (f1, z1) in zip(pts, pts[1:]):
        if f0 <= xf <= f1:
            return z0 + (z1 - z0) * (xf - f0) / (f1 - f0)
    return C


def deck_point(xf, y, lift=0.0):
    W = hull_at(y)[0]
    return P(xf * W, y, deck_z(xf, y) + lift)


def hull_section(y):
    W, T, C, B = hull_at(y)
    right = [(0.0, T), (0.42 * W, T - 0.12), (0.78 * W, T - 0.45), (W, C), (0.86 * W, C - 0.5),
             (0.42 * W, B + 0.14), (0.0, B)]
    left = [(-x, z) for x, z in reversed(right[1:-1])]
    return [P(x, y, z) for x, z in right + left]


def carapace(hs, y0, y1, xf0, xf1, lift, th, sweep_back, paint, n=4, m=5):
    """Curved shell plate conforming to the hull deck (one side, x > 0), swept back at its outer edge."""
    rings = []
    for i in range(n):
        t = i / (n - 1)
        top, bot = [], []
        for j in range(m):
            f = xf0 + (xf1 - xf0) * j / (m - 1)
            g = j / (m - 1)
            y = y0 + (y1 - y0) * t - sweep_back * g * (0.35 + 0.65 * t)
            # taper: outer corners pinch toward the rear for a blade-like scale
            p = deck_point(f, y, lift)
            top.append(p + Vector((0, 0, th * (1.0 - 0.6 * abs(g - 0.35)))))
            bot.append(p)
        rings.append(top + list(reversed(bot)))
    tg = ["smooth"] * (m - 1) + ["edge"] + ["smooth"] * (m - 1) + ["edge"]
    sweep(hs, rings, paint, SHELL, tags=tg)


def ribbon_samples(outer, inner, n, lift):
    O = bez_pts(outer, n)
    I = bez_pts(inner, n)
    for k in range(n):
        dz = lift(k / (n - 1))
        O[k] += Vector((0, 0, dz))
        I[k] += Vector((0, 0, dz))
    return O, I


def nearest_y(pts, y, front_half=True):
    cand = pts[len(pts) // 4:] if front_half else pts
    return min(cand, key=lambda p: abs(p.y - y))


# Crescent blades (right side; mirrored). Bezier edges root -> tip, z included.
# W1 great wing: out and forward; W2 rear wing: out and back; W3 forward scythe; W4 stern ribbon.
W1 = ([P(1.8, -1.0, 1.15), P(5.6, -2.4, 1.05), P(7.9, 1.4, 1.0), P(7.1, 5.6, 1.3)],
      [P(1.75, 2.4, 1.22), P(4.0, 1.6, 1.12), P(6.0, 2.6, 1.05), P(7.1, 5.6, 1.3)])
W2 = ([P(1.7, -2.2, 0.98), P(5.8, -1.5, 0.9), P(7.7, -5.4, 0.85), P(6.0, -8.1, 1.0)],
      [P(1.45, -5.4, 1.05), P(3.6, -4.8, 0.95), P(5.2, -6.2, 0.9), P(6.0, -8.1, 1.0)])
W3 = ([P(1.35, 3.0, 1.36), P(3.7, 3.1, 1.33), P(5.1, 6.1, 1.3), P(4.25, 8.35, 1.5)],
      [P(1.1, 5.0, 1.42), P(2.4, 5.3, 1.39), P(3.4, 6.9, 1.35), P(4.25, 8.35, 1.5)])
W4 = ([P(1.0, -5.6, 1.3), P(2.6, -6.1, 1.25), P(3.4, -7.4, 1.2), P(3.0, -8.42, 1.3)],
      [P(0.85, -6.5, 1.32), P(1.7, -6.9, 1.28), P(2.5, -7.6, 1.22), P(3.0, -8.42, 1.3)])


def tip_lift(t):
    return 0.3 * t ** 3


def build_hull(rng):
    hs = HS(rng)
    # --- Seed hull: lofted violet shell (smooth along its length, crisp crest / chines / keel).
    rings = [hull_section(y) for y, *_ in HULL]
    rings.insert(0, P(*PROW))
    sweep(hs, rings, "shell:1", SHELL, tags="smooth", cap0=False, cap1=True)
    # --- Layered carapace scales on the deck, two per station (left / right of the black spine).
    half = HS(rng)
    plates = [(7.55, 6.5, 0.1, 0.62, 0.45), (6.95, 5.4, 0.1, 0.8, 0.6), (5.7, 4.0, 0.1, 0.84, 0.7),
              (4.3, 2.9, 0.1, 0.52, 0.5), (3.1, 1.3, 0.1, 0.86, 0.8), (1.6, -0.15, 0.1, 0.86, 0.7),
              (-3.15, -4.5, 0.1, 0.86, 0.75), (-4.25, -5.6, 0.1, 0.84, 0.7), (-5.35, -6.6, 0.1, 0.8, 0.6)]
    for k, (y0, y1, f0, f1, sb) in enumerate(plates):
        lift = 0.05 if k % 2 == 0 else 0.09
        carapace(half, y0, y1, f0, f1, lift, 0.09, sb, f"shell:{k + 3}")
        # teal seam under each plate's trailing edge
        pts = [deck_point(f, y1 - sb * ((f - f0) / (f1 - f0)) * 1.0 + 0.04, 0.03) for f in
               (f0 + 0.05, (f0 + f1) * 0.5, f1 - 0.04)]
        glow_line(half, pts, [(0.2, 0, 1)] * 3, 0.07, 0.02, TEAL)
    # --- Flank lattice panels over a teal under-glow (organic honeycomb).
    for (ya, yb) in ((4.8, 1.2),):
        n = 9
        A, Bc = [], []
        for i in range(n):
            y = ya + (yb - ya) * i / (n - 1)
            W, T, C, B = hull_at(y)
            A.append(P(W + 0.07, y, C + 0.05))
            Bc.append(P(0.9 * W + 0.07, y, C - 0.42))
        glow = [P(0.94 * hull_at(a.y)[0] + 0.025, a.y, hull_at(a.y)[2] - 0.21) for a in A]
        glow_line(half, glow, [(1.0, 0, -0.2)] * n, 0.16, 0.02, TEAL)
        lattice(half, patch_between(A, Bc, up=(1.0, 0.0, -0.35)), 6, 2, 0.1, "frame", FRAME, hole=0.6,
                vmin=lambda u: 0.0, vmax=lambda u: 1.0, rng=rng)
        tube(half, A, 0.06, "frame", FRAME, seg=4)
    # --- Crescent blades. W1 silver with an open lattice window, W2 violet with a silver leading edge and a
    # lattice loop, W3 silver scythe with a violet inner band, W4 stern ribbon. Alternating materials layer.
    O1, I1 = open_crescent(half, rng, W1[0], W1[1], 24, 0.22, 0.16, 0.08, 0.5, 0.27, tip_lift,
                           ("blade", BLADE, "blade_dk", BLADE), (8, 2), 0.1, vc_=0.5, glow_rim=0.07)
    O2, I2 = ribbon_samples(W2[0], W2[1], 22, tip_lift)
    E2 = [lerp(o, i, 0.2) for o, i in zip(O2, I2)]
    E2[-1] = O2[-1]
    band(half, O2, E2, lambda t: 0.12 * (1 - t) ** 0.6 + 0.01, (0, 0, 1), "blade", BLADE, ridge=0.45, facets=False)
    open_crescent(half, rng, [lerp(W2[0][j], W2[1][j], 0.2) for j in range(4)], W2[1], 22, 0.18, 0.13, 0.1, 0.5,
                  0.25, tip_lift, ("shell:2", SHELL, "shell_dk:5", SHELL), (6, 2), 0.09, vc_=0.5, glow_rim=0.06)
    O3, I3 = ribbon_samples(W3[0], W3[1], 18, tip_lift)
    E3 = [lerp(o, i, 0.55) for o, i in zip(O3, I3)]
    E3[-1] = O3[-1]
    band(half, O3, E3, lambda t: 0.15 * (1 - t) ** 0.6 + 0.01, (0, 0, 1), "blade", BLADE, ridge=0.4, facets=True)
    band(half, E3, I3, lambda t: 0.12 * (1 - t) ** 0.5 + 0.01, (0, 0, 1), "shell:7", SHELL, ridge=0.5, facets=False)
    glow_line(half, [lerp(o, i, 0.55) + Vector((0, 0, 0.13 * (1 - k / 17) ** 0.5)) for k, (o, i) in
                     enumerate(zip(O3, I3)) if 2 <= k <= 13], [(0, 0, 1)] * 12, 0.06, 0.02, TEAL)
    O4, I4 = ribbon_samples(W4[0], W4[1], 12, tip_lift)
    band(half, O4, I4, lambda t: 0.1 * (1 - t) ** 0.6 + 0.01, (0, 0, 1), "blade", BLADE, ridge=0.4, facets=True)
    # --- Split armour seams across the silver bands (dark grooves from the edge to the ridge).
    for (O, I, ks, frac, th0, n_) in ((O1, I1, (12, 15, 18), 0.22, 0.22, 24), (O3, I3, (7, 10, 13), 0.24, 0.15, 18),
                                      (O2, I2, (11, 14, 17), 0.1, 0.12, 22)):
        for k in ks:
            t = k / (n_ - 1)
            th = th0 * (1 - t) ** 0.65 + 0.012
            a_ = O[k] + Vector((0, 0, 0.012))
            b_ = lerp(O[k], I[k], frac) + Vector((0, 0, th + 0.012))
            tube(half, [a_, lerp(a_, b_, 0.5) + Vector((0, 0, 0.01)), b_], 0.035, "frame", FRAME, seg=4)
    # --- Black chitin root collars where the blades meet the hull, and spars between the wings.
    for (O, I) in ((O1, I1), (O2, I2), (O3, I3)):
        pts = [lerp(O[0], I[0], f) + Vector((0.05, 0, -0.04)) for f in (0.0, 0.33, 0.66, 1.0)]
        tube(half, pts, 0.17, "frame", FRAME, seg=5)
    # --- Pod cradle on W1 under the gill pod socket, with ribs to the hull.
    pc = Dg(POD_R)
    tube(half, [P(pc.x, pc.y, 1.12), P(pc.x, pc.y, 1.3), P(pc.x, pc.y, 1.47)], [0.5, 0.66, 0.74], "frame", FRAME,
         seg=10, cap1=True)
    arc_band(half, 0.7, 0.14, 0.1, 0.0, 2 * math.pi, 14, "blade_dk", BLADE, ch=0.03,
             m=Matrix.Translation(P(pc.x, pc.y, 1.47)))
    for dy in (-0.45, 0.45):
        W = hull_at(pc.y + dy)[0]
        tube(half, [P(W * 0.95, pc.y + dy, 1.2), P(pc.x - 0.45, pc.y + dy * 0.6, 1.25)], 0.08, "frame", FRAME, seg=5)
    # --- Pod launch bay cowl with petal doors at the bay socket.
    bc = Dg(BAY_R)
    tube(half, [P(bc.x + 0.06, bc.y - 0.2, 1.15), P(bc.x + 0.02, bc.y - 0.06, 1.5), P(bc.x, bc.y, bc.z - 0.04)],
         [0.6, 0.56, 0.5], "frame", FRAME, seg=10, cap1=False)
    arc_band(half, 0.5, 0.12, 0.1, 0.0, 2 * math.pi, 12, "blade", BLADE, ch=0.03,
             m=Matrix.Translation(P(bc.x, bc.y, bc.z)))
    well = HS(rng)
    tube(well, [P(bc.x, bc.y, bc.z + 0.04), P(bc.x, bc.y, bc.z - 0.2), P(bc.x, bc.y, bc.z - 0.42)], [0.45, 0.4, 0.3],
         "frame_teal", FRAME, seg=12, cap0=False, cap1=False)
    append(half, flipped(well))
    disc(half, P(bc.x, bc.y, bc.z - 0.42), (0, 0, 1), 0.3, 12, "lamp", TEAL)
    arc_band(half, 0.36, 0.035, 0.04, 0.0, 2 * math.pi, 12, "lamp", TEAL, ch=0.0,
             m=Matrix.Translation(P(bc.x, bc.y, bc.z - 0.22)))
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        d = Vector((math.cos(a), math.sin(a), 0.0))
        tvec = Vector((-d.y, d.x, 0.0))
        root = P(bc.x, bc.y, bc.z + 0.03) + d * 0.48
        tipp = root + d * 0.34 + Vector((0, 0, 0.3))
        shard_plate(half, [root - tvec * 0.19, tipp + tvec * 0.02, root + tvec * 0.19], 0.035, 0.02,
                    f"shell:{k + 6}", SHELL)
    # --- Teal veins along the upper flank.
    for f, ya, yb in ((0.9, 6.0, -6.2),):
        pts = []
        for i in range(14):
            y = ya + (yb - ya) * i / 13
            W, T, C, B = hull_at(y)
            pts.append(P(f * W + 0.02, y, deck_z(f, y) + 0.02))
        glow_line(half, pts, [(0.7, 0, 0.7)] * len(pts), 0.06, 0.02, TEAL)
    # --- Prow barbs and stern fins.
    crescent(half, [P(0.3, 6.6, 1.44), P(0.95, 6.9, 1.36), P(1.25, 7.7, 1.3), P(0.95, 8.4, 1.36)],
             [P(0.24, 7.3, 1.46), P(0.6, 7.55, 1.4), P(0.85, 8.0, 1.34), P(0.95, 8.4, 1.36)], 9,
             lambda t: 0.08 * (1 - t) + 0.01, (0, 0, 1), "blade", BLADE)
    # --- Trailing tendrils from the stern underside.
    for (x0, x1, z0, sag) in ((0.45, 1.05, 0.45, 0.0), (0.95, 2.1, 0.75, 0.1)):
        pts = [P(x0, -6.5, z0), P(lerp(x0, x1, 0.35), -7.3, z0 * 0.6), P(lerp(x0, x1, 0.75), -7.95, z0 * 0.35 + sag),
               P(x1, -8.45, 0.08 + sag)]
        tube(half, pts, [0.17, 0.13, 0.08, 0.0], "frame", FRAME, seg=6, apex_end=True)
        for f in (0.3, 0.55):
            c = lerp(pts[1], pts[2], f)
            tube(half, [c - Vector((0.0, 0.05, 0.0)), c + Vector((0.0, 0.05, 0.0))], 0.12 - 0.03 * f, "lamp", TEAL,
                 seg=6)
    # --- Side thrusters at the stern quarters (engine sockets 1 / 2).
    e = Dg(EMPTIES["veil_engine_2"])
    tube(half, [e + Vector((0, 0.5, 0)), e + Vector((0, 0.1, 0)), e], [0.2, 0.24, 0.22], "frame_dk", FRAME, seg=8)
    disc(half, e - Vector((0, 0.005, 0)), (0, -1, 0), 0.17, 8, "lamp", TEAL)
    append(hs, half)
    append(hs, mirror_x(half))
    # --- Black chitin spine ridge with vertebrae and a teal slit (bow -> stern, broken by the heart iris).
    for (ya, yb) in ((7.6, -0.3), (-3.3, -6.7)):
        n = max(3, int(abs(ya - yb) / 0.9) + 1)
        st = []
        for i in range(n):
            y = ya + (yb - ya) * i / (n - 1)
            T = hull_at(y)[1]
            w = 0.16 if 0 < i < n - 1 else 0.08
            st.append([P(w, y, T - 0.02), P(0.0, y, T + 0.2), P(-w, y, T - 0.02)])
        sweep(hs, st, "frame", FRAME, tags="main")
        for i in range(n - 1):
            y = ya + (yb - ya) * (i + 0.5) / (n - 1)
            T = hull_at(y)[1]
            ln = 0.36
            shard_plate(hs, [P(0.0, y + ln, T + 0.17), P(-0.34, y - ln * 0.6, T + 0.05), P(0.0, y - ln * 0.25, T + 0.15),
                             P(0.34, y - ln * 0.6, T + 0.05)], 0.09, 0.02, "frame_dk", FRAME)
        glow_line(hs, [P(0.0, ya - 0.3 * math.copysign(1, ya - yb), hull_at(ya)[1] + 0.21),
                       P(0.0, yb + 0.3 * math.copysign(1, ya - yb), hull_at(yb)[1] + 0.21)], [(0, 0, 1)] * 2, 0.05, 0.015,
                  TEAL)
    # --- Heart socket collar (iris housing) on the deck.
    hc = Dg(HEART)
    arc_band(hs, 1.3, 0.3, 0.72, 0.0, 2 * math.pi, 20, "frame", FRAME, ch=0.06, m=Matrix.Translation(P(hc.x, hc.y, 1.72)),
             full=True)
    arc_band(hs, 1.13, 0.07, 0.06, 0.0, 2 * math.pi, 20, "lamp", TEAL, ch=0.0,
             m=Matrix.Translation(P(hc.x, hc.y, 2.09)))
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        d = Vector((math.cos(a), math.sin(a), 0.0))
        root = P(hc.x, hc.y, 1.95) + d * 1.4
        tube(hs, [root, root + d * 0.2 + Vector((0, 0, 0.12)), root + d * 0.42 + Vector((0, 0, 0.18))],
             [0.08, 0.05, 0.0], "frame", FRAME, seg=4, apex_end=True)
    # --- Aft propulsion ring (concealed cavity) with concentric teal rings and vanes.
    ec = Dg(ENGINE_C)
    m = Matrix.Translation(ec) @ Matrix.Rotation(ENGINE_AXIS_TILT, 4, "X")
    # local z (exhaust side) -> pointing back (-y) and up, so the ring reads from the high game camera
    arc_band(hs, 1.1, 0.34, 0.46, 0.0, 2 * math.pi, 20, "frame", FRAME, ch=0.07, m=m, full=True)
    arc_band(hs, 1.12, 0.12, 0.12, 0.0, 2 * math.pi, 20, "blade_dk", BLADE, ch=0.03, m=m @ xform((0, 0, 0.27)))
    arc_band(hs, 0.86, 0.08, 0.1, 0.0, 2 * math.pi, 18, "lamp", TEAL, ch=0.0, m=m @ xform((0, 0, 0.06)))
    arc_band(hs, 0.58, 0.06, 0.08, 0.0, 2 * math.pi, 14, "lamp", TEAL, ch=0.0, m=m @ xform((0, 0, -0.08)))
    disc(hs, m @ Vector((0, 0, -0.2)), m.to_3x3() @ Vector((0, 0, 1)), 0.5, 14, "lamp", TEAL)
    tube(hs, [m @ Vector((0, 0, -0.25)), m @ Vector((0, 0, 0.1)), m @ Vector((0, 0, 0.42))], [0.2, 0.17, 0.0],
         "frame_dk", FRAME, seg=8, apex_end=True)
    for k in range(6):
        a = 2 * math.pi * k / 6
        d = Vector((math.cos(a), math.sin(a), 0.0))
        tvec = Vector((-d.y, d.x, 0.0))
        outline = [m @ (d * 0.22), m @ (d * 0.92 + tvec * 0.12 + Vector((0, 0, 0.05))), m @ (d * 0.92 - tvec * 0.05)]
        shard_plate(hs, outline, 0.03, 0.03, "blade_dk", BLADE)
    return hs


# ----------------------------------------------------------------------------
# Gill pods (live / wreck)
# ----------------------------------------------------------------------------

def build_pod(side, rng, wreck=False):
    hs = HS(rng)
    c = Dg(POD_L if side < 0 else POD_R)
    base_z = 1.47
    # black cup base
    tube(hs, [P(c.x, c.y, base_z - 0.02), P(c.x, c.y, base_z + 0.12), P(c.x, c.y, base_z + 0.24)],
         [0.6, 0.55, 0.36], "char" if wreck else "frame", FRAME, seg=10, cap0=False)
    if not wreck:
        # Faceted teal core with a black frame (gill heart), top near the target plane.
        verts, faces = icosahedron()
        framed_poly(hs, verts, faces, xform((c.x, c.y, 1.92), (0.0, 0.0, 0.3)) @ Matrix.Diagonal((0.4, 0.4, 0.34, 1.0)),
                    0.24, 0.035, "frame", FRAME, "lamp", TEAL)
    else:
        # Shattered core: dark crushed shards, a few embers.
        for k in range(7):
            a = 2 * math.pi * k / 7 + rng.uniform(-0.2, 0.2)
            d = Vector((math.cos(a), math.sin(a), rng.uniform(0.2, 0.9))).normalized()
            p0 = P(c.x, c.y, 1.76) + d * 0.08
            tube(hs, [p0, p0 + d * rng.uniform(0.2, 0.34)], [0.09, 0.0], "shell_dk", SHELL, seg=4, apex_end=True)
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.5
            disc(hs, P(c.x + math.cos(a) * 0.16, c.y + math.sin(a) * 0.16, 1.73), (0, 0, 1), 0.06, 5, "lamp", TEAL)
        hs.scorch = [((c.x, c.y, 1.7), 1.1)]
    # Five sickle blades cupping the core (claw); the wreck keeps three, broken and splayed.
    for k in range(5):
        a = -math.pi / 2 + 2 * math.pi * k / 5          # one blade aft, two flanking the front: mirror-symmetric
        if wreck and k in (1, 3):
            continue
        rot = xform(tuple(P(c.x, c.y, 0.0)), (0.0, 0.0, a - math.pi / 2))
        bl = HS(rng)
        # local: x tangential, y radial outward, z up
        O = bez_pts([P(-0.18, 0.5, base_z + 0.04), P(-0.25, 1.02, 1.74), P(-0.13, 0.92, 2.26), P(0.05, 0.56, 2.56)], 9)
        I = bez_pts([P(0.18, 0.45, base_z + 0.04), P(0.16, 0.8, 1.74), P(0.1, 0.74, 2.16), P(0.05, 0.56, 2.56)], 9)
        if wreck:
            cut = rng.randint(4, 6)
            O, I = O[:cut], I[:cut]
            I[-1] = O[-1] = lerp(O[-1], I[-1], 0.5) + Vector((0, 0.06, -0.05))
        ups = [Vector((0.0, 1.0, -0.3 + 0.9 * i / 8)).normalized() for i in range(len(O))]
        band(bl, O, I, lambda t: 0.1 * (1 - t) ** 0.6 + 0.01, ups, "burnt" if wreck else ("blade" if k % 2 else
             f"shell:{k + 2}"), BLADE if (wreck or k % 2) else SHELL, ridge=0.42, facets=not wreck)
        if not wreck:
            # gill slit on the outer face of each blade
            q = [P(-0.1, 0.9, 1.72), P(-0.02, 0.93, 1.86), P(0.05, 0.86, 2.0)]
            glow_line(bl, q, [(0, 1, 0.2)] * 3, 0.05, 0.03, TEAL)
        m = rot
        if wreck:
            m = rot @ xform((0.0, 0.42, base_z), (rng.uniform(-0.6, -0.3), 0.0, rng.uniform(-0.2, 0.2))) @ \
                xform((0.0, -0.42, -base_z))
        merge_hs(hs, bl, m)
    return hs


# ----------------------------------------------------------------------------
# Heart, shutters, wreck
# ----------------------------------------------------------------------------

def build_heart(rng):
    hs = HS(rng)
    c = Dg(HEART)
    # Faceted pearl / teal core (flattened icosahedron), top near y 2.25.
    verts, faces = icosahedron()
    framed_poly(hs, verts, faces, xform((c.x, c.y, 1.9), (0.0, 0.0, 0.2)) @ Matrix.Diagonal((0.76, 0.76, 0.4, 1.0)),
                0.2, 0.05, "frame", FRAME, "lamp", TEAL,
                pane_choice=lambda fi: ("lamp", TEAL) if fi % 4 else (f"pearl:{fi}", SHELL))
    # Iris: ten curved blades rising around the core, tips leaning in.
    for k in range(10):
        a = 2 * math.pi * k / 10
        bl = HS(rng)
        O = bez_pts([P(-0.17, 1.04, 1.72), P(-0.21, 1.05, 1.88), P(-0.13, 0.95, 1.98), P(0.05, 0.84, 2.02)], 7)
        I = bez_pts([P(0.17, 1.0, 1.72), P(0.14, 0.97, 1.86), P(0.1, 0.9, 1.95), P(0.05, 0.84, 2.02)], 7)
        ups = [Vector((0.0, 1.0, 0.6 + 0.4 * i / 6)).normalized() for i in range(7)]
        band(bl, O, I, lambda t: 0.06 * (1 - t) + 0.006, ups, "blade" if k % 2 else f"shell:{k}", BLADE if k % 2 else
             SHELL, ridge=0.45, facets=False)
        merge_hs(hs, bl, xform(tuple(P(c.x, c.y, 0.0)), (0.0, 0.0, a - math.pi / 2)))
    # Seat ring under the core.
    arc_band(hs, 0.82, 0.22, 0.12, 0.0, 2 * math.pi, 16, "frame_dk", FRAME, ch=0.03,
             m=Matrix.Translation(P(c.x, c.y, 1.68)))
    return hs


def dome_z(r):
    return SHUTTER_Z + (SHUTTER_APEX - SHUTTER_Z) * (1.0 - (r / SHUTTER_R) ** 2)


def build_shutter(k, rng):
    """Petal shutter k, built in a hinge frame (hinge at origin, outward +y, up +z), placed on the rim."""
    hs = HS(rng)
    loc = HS(rng)
    n = 7
    span = math.radians(43.0)
    th = 0.07
    rings = []
    for i in range(n):
        t = i / (n - 1)
        r = SHUTTER_R * (1.0 - t)
        if i == n - 1:
            rings.append(P(0.0, -SHUTTER_R, SHUTTER_APEX - SHUTTER_Z + th))
            break
        a = span * (1.0 - t ** 1.5)
        top, bot = [], []
        for j in range(5):
            s = -a + 2 * a * j / 4
            # point on the dome at radius r and azimuth s (relative to the petal's centre line), hinge frame
            x = math.sin(s) * r
            y = math.cos(s) * r - SHUTTER_R
            z = dome_z(r) - SHUTTER_Z
            ridge = th * (1.0 - abs(j - 2) / 2.0 * 0.85)
            top.append(P(x, y, z + ridge))
            if j in (1, 2, 3):
                bot.append(P(x * 0.97, y, z - 0.02))
        rings.append(top + list(reversed(bot)))
    sweep(loc, rings, f"shell:{k + 11}", SHELL, tags=["edge", "smooth", "smooth", "edge", "smooth", "smooth", "smooth",
                                                      "smooth"], cap0=True)
    # black spine rib and teal seam along the petal centre
    rib = [P(0.0, -SHUTTER_R * f, dome_z(SHUTTER_R * (1 - f)) - SHUTTER_Z + th + 0.01) for f in (0.05, 0.35, 0.65, 0.9)]
    tube(loc, rib, [0.045, 0.04, 0.03, 0.0], "frame", FRAME, seg=4, apex_end=True)
    glow_line(loc, [P(0.0, -SHUTTER_R * f, dome_z(SHUTTER_R * (1 - f)) - SHUTTER_Z + th + 0.035) for f in
                    (0.12, 0.4, 0.62)], [(0, 0.5, 1)] * 3, 0.03, 0.012, TEAL)
    # hinge knuckle at the rim
    tube(loc, [P(-0.3, 0.0, 0.0), P(0.3, 0.0, 0.0)], 0.06, "frame_dk", FRAME, seg=6, up_hint=(0, 1, 0))
    phi = SHUTTER_PHI[k]
    h = Dg(shutter_hinge(k))
    merge_hs(hs, loc, Matrix.Translation(h) @ Matrix.Rotation(-phi, 4, "Z"))
    return hs


def build_heart_wreck(rng):
    hs = HS(rng)
    c = Dg(HEART)
    arc_band(hs, 0.82, 0.22, 0.12, 0.0, 2 * math.pi, 16, "char", FRAME, ch=0.03,
             m=Matrix.Translation(P(c.x, c.y, 1.68)))
    # burst core: dark shards splayed outward, ichor embers
    for k in range(11):
        a = 2 * math.pi * k / 11 + rng.uniform(-0.15, 0.15)
        d = Vector((math.cos(a), math.sin(a), rng.uniform(0.15, 0.8))).normalized()
        p0 = P(c.x, c.y, 1.72) + d * rng.uniform(0.1, 0.3)
        tube(hs, [p0, p0 + d * rng.uniform(0.35, 0.6)], [rng.uniform(0.1, 0.16), 0.0], "shell_dk", SHELL, seg=4,
             apex_end=True)
    for k in range(10):                       # broken iris blades, bent outward
        if k % 3 == 1:
            continue
        a = 2 * math.pi * k / 10
        bl = HS(rng)
        O = bez_pts([P(-0.16, 1.02, 1.74), P(-0.2, 1.06, 1.88), P(-0.12, 1.16, 1.96)], 4)
        I = bez_pts([P(0.16, 0.98, 1.74), P(0.13, 1.04, 1.86), P(-0.12, 1.16, 1.96)], 4)
        band(bl, O, I, 0.05, (0, 1, 0.6), "burnt", BLADE, ridge=0.45)
        merge_hs(hs, bl, xform(tuple(P(c.x, c.y, 0.0)), (0.0, 0.0, a - math.pi / 2 + rng.uniform(-0.1, 0.1))))
    for k in range(4):
        a = 2 * math.pi * k / 4 + 0.4
        disc(hs, P(c.x + math.cos(a) * 0.35, c.y + math.sin(a) * 0.35, 1.75), (0, 0, 1), 0.09, 5, "lamp", TEAL)
    hs.scorch = [((c.x, c.y, 1.8), 1.5)]
    return hs


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def node_rules():
    rules = {}
    for name, t in SOCKETS.items():
        rules[name] = dict(t=t, x=(-7.5, 7.5), z=(-8.5, 8.5), y_max=TOP_MAX, y_min=-0.6)
    for k in range(4):
        rules[f"veil_heart_shutter_{k}"]["yaw"] = SHUTTER_PHI[k]
    for name, t in EMPTIES.items():
        rules[name] = dict(t=t, empty=True)
    return rules


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="the_veil.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--wip", action="store_true")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = nf.make_materials()

    def r(tag):
        return random.Random(f"{SEED}:{tag}")
    pieces = {"veil_hull": build_hull(r("hull"))}
    for side, nm in ((-1, "left"), (1, "right")):
        pieces[f"veil_pod_{nm}"] = build_pod(side, r(f"pod{nm}"))
        pieces[f"veil_pod_{nm}_wreck"] = build_pod(side, r(f"podwreck{nm}"), wreck=True)
    pieces["veil_heart"] = build_heart(r("heart"))
    for k in range(4):
        pieces[f"veil_heart_shutter_{k}"] = build_shutter(k, r(f"shutter{k}"))
    pieces["veil_heart_wreck"] = build_heart_wreck(r("heartwreck"))
    for hs in pieces.values():
        nf.finish(hs)
    total = sum(hs.tris() for hs in pieces.values())
    for name, hs in pieces.items():
        print(f"VEIL {name:24s} tris={hs.tris()}")
    print(f"VEIL total triangles {total}")
    static = ["veil_hull", "veil_pod_left", "veil_pod_right", "veil_heart"]
    objs = {}
    for name, hs in pieces.items():
        context = [([Vector(v) for v in pieces[c].verts], pieces[c].faces) for c in static if c != name]
        cols = nf.bake(hs, name, ao_dist=0.7, ground=-0.05, context=context, scale=0.16)
        yaw = SHUTTER_PHI[int(name[-1])] if name.startswith("veil_heart_shutter_") else 0.0
        objs[name] = nf.make_object(name, hs, mats, SOCKETS[name], cols, yaw=yaw)
    for name, t in EMPTIES.items():
        nf.make_socket(name, None, t)
    used = sorted({m.name for o in objs.values() for m in o.data.materials})
    if not args.wip:
        nf.publish(args.glb, "the_veil.py", dict(materials=used, nodes=node_rules(), total=(0, 16000),
                                                 max_bytes=3_000_000), "VEIL")
    elif total > 16000:
        print("VEIL WARNING over the 16k budget")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        render_previews(objs, args)


LIVE = ["veil_hull", "veil_pod_left", "veil_pod_right", "veil_heart"] + [f"veil_heart_shutter_{k}" for k in range(4)]
EXPOSED = ["veil_hull", "veil_pod_left_wreck", "veil_pod_right_wreck", "veil_heart"] + \
    [f"veil_heart_shutter_{k}" for k in range(4)]


def place_set(objs, names, offset, open_angle=0.0):
    for name in names:
        src = objs[name]
        o = bpy.data.objects.new(f"p_{name}", src.data)
        o.location = Vector(src.location) + Vector(offset)
        o.rotation_mode = "XYZ"
        if name.startswith("veil_heart_shutter_"):
            o.rotation_euler = (open_angle, 0.0, src.rotation_euler.z)
        bpy.context.scene.collection.objects.link(o)


def render_previews(objs, args):
    scene = bpy.context.scene
    pm = nf.preview_ground_materials()
    for o in list(scene.objects):
        o.hide_render = True
    keep = {o.name for o in scene.objects}
    sfx = "-wip" if args.wip else ""
    # 1. Game camera (12.5 units wide, portrait), phase 1, over the mire.
    for exposed, fname in ((False, "preview-veil"), (True, "preview-veil-exposed")):
        place_set(objs, EXPOSED if exposed else LIVE, (0.0, 8.0, 0.0), math.radians(105.0) if exposed else 0.0)
        kit.plane_obj("pv_mire", -40, 40, -30, 50, -0.02, pm["mire"])
        nf.preview_lights()
        kit.add_ortho_camera((0.0, 6.5, 1.0), 55.0, 12.5 * 1600.0 / 900.0)
        nf.setup_render(args.engine, args.samples, 900, 1600)
        kit.render(os.path.join(args.preview_dir, f"{fname}{sfx}.png"))
        kit.clear_preview(keep)
    # 2. Full silhouette, straight down (orthographic top view of the 15 x 17 footprint).
    place_set(objs, LIVE, (0.0, 0.0, 0.0))
    kit.plane_obj("pv_mire", -40, 40, -40, 40, -0.02, pm["mire"])
    nf.preview_lights()
    cam = kit.add_ortho_camera((0.0, 0.0, 0.0), 90.0, 18.5)
    nf.setup_render(args.engine, args.samples, 1400, 1400)
    kit.render(os.path.join(args.preview_dir, f"preview-veil-top{sfx}.png"))
    kit.clear_preview(keep)
    # 3. Hero 3/4 perspective.
    place_set(objs, LIVE, (0.0, 0.0, 0.0))
    kit.plane_obj("pv_mire", -60, 60, -60, 60, -0.02, pm["mire"])
    nf.preview_lights()
    nf.perspective_camera((15.0, -15.5, 10.5), (0.0, 0.5, 0.8), lens=36.0)
    nf.setup_render(args.engine, args.samples, 1800, 1100)
    kit.render(os.path.join(args.preview_dir, f"preview-veil-hero{sfx}.png"))
    kit.clear_preview(keep)
    # 4. Heart / pod states close-up at the game angle: closed (phase 1), open (heart phase, pods wrecked),
    # destroyed (heart wreck).
    states = [
        ("closed", ["veil_hull", "veil_pod_left", "veil_pod_right", "veil_heart"] +
         [f"veil_heart_shutter_{k}" for k in range(4)], 0.0),
        ("open", ["veil_hull", "veil_pod_left_wreck", "veil_pod_right_wreck", "veil_heart"] +
         [f"veil_heart_shutter_{k}" for k in range(4)], math.radians(105.0)),
        ("destroyed", ["veil_hull", "veil_pod_left_wreck", "veil_pod_right_wreck", "veil_heart_wreck"], 0.0),
    ]
    for tag, names, ang in states:
        place_set(objs, names, (0.0, 0.0, 0.0), ang)
        kit.plane_obj("pv_mire", -60, 60, -60, 60, -0.02, pm["mire"])
        nf.preview_lights()
        kit.add_ortho_camera((0.0, -0.4, 2.0), 55.0, 9.0)
        nf.setup_render(args.engine, args.samples, 1200, 800)
        kit.render(os.path.join(args.preview_dir, f"preview-veil-{tag}{sfx}.png"))
        kit.clear_preview(keep)


if __name__ == "__main__":
    main()
