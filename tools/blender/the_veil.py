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

SEED = "the-veil-v2"
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
ENGINE_C = (0.0, 1.2, -10.1)
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
    "veil_engine_1": (-0.85, 1.3, -10.1), "veil_engine_2": (0.85, 1.3, -10.1),
}

# ----------------------------------------------------------------------------
# Hull
# ----------------------------------------------------------------------------

HULL = [  # (y, half-width W, crest T, chine C, keel B), design y descending (bow -> stern). The blades make it wide.
    (6.9, 0.3, 1.5, 1.15, 0.85),
    (5.6, 0.75, 1.75, 1.2, 0.55),
    (3.8, 1.2, 1.92, 1.2, 0.3),
    (1.6, 1.5, 2.0, 1.2, 0.15),
    (-1.0, 1.6, 1.97, 1.2, 0.1),
    (-3.0, 1.6, 1.97, 1.2, 0.1),
    (-5.6, 1.5, 1.95, 1.18, 0.15),
    (-8.2, 1.25, 1.82, 1.1, 0.35),
    (-10.0, 1.0, 1.66, 1.02, 0.5),
]
PROW = (0.0, 7.9, 1.3)
STERN = HULL[-1][0]


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
    """Deck height at x = xf * W: a flat crest falling in one facet to the chine."""
    W, T, C, B = hull_at(y)
    xf = min(abs(xf), 1.0)
    return T - 0.06 * min(xf / 0.5, 1.0) - (T - 0.06 - C) * max(0.0, (xf - 0.5) / 0.5)


def deck_point(xf, y, lift=0.0):
    W = hull_at(y)[0]
    return P(xf * W, y, deck_z(xf, y) + lift)


def hull_section(y):
    W, T, C, B = hull_at(y)
    right = [(0.0, T), (0.5 * W, T - 0.06), (W, C), (0.62 * W, B + 0.2), (0.0, B)]
    left = [(-x, z) for x, z in reversed(right[1:-1])]
    return [P(x, y, z) for x, z in right + left]


def ribbon_samples(outer, inner, n, lift):
    O = bez_pts(outer, n)
    I = bez_pts(inner, n)
    for k in range(n):
        dz = lift(k / (n - 1))
        O[k] += Vector((0, 0, dz))
        I[k] += Vector((0, 0, dz))
    return O, I


# Angular blades (right side; mirrored). Bezier edges root -> tip, nearly straight: knife-like, not wing-like.
# Wide (17 October 2026, user: "make it wide"): the main blades span about 25 units, past both edges of the view.
CANARD = ([P(0.75, 5.6, 1.5), P(2.6, 5.2, 1.42), P(4.8, 4.4, 1.36), P(6.3, 3.6, 1.38)],
          [P(1.05, 4.2, 1.5), P(2.6, 3.9, 1.44), P(4.6, 3.6, 1.38), P(6.3, 3.6, 1.38)])
MAIN = ([P(1.5, 1.4, 1.15), P(6.0, 0.4, 1.1), P(10.4, -1.9, 1.05), P(12.6, -5.4, 1.15)],
        [P(1.55, -5.0, 1.15), P(5.0, -5.2, 1.1), P(9.0, -5.4, 1.08), P(12.6, -5.4, 1.15)])
AFT = ([P(1.35, -6.4, 1.25), P(4.0, -7.1, 1.2), P(7.0, -8.5, 1.18), P(8.7, -10.4, 1.25)],
       [P(1.1, -9.2, 1.28), P(3.2, -9.6, 1.24), P(6.0, -10.1, 1.2), P(8.7, -10.4, 1.25)])


def tip_lift(t):
    return 0.22 * t ** 3


def armour_plate(hs, y0, length, xf0, out, lift, k):
    """A big angular iridescent shard plate floating over the flank, swept back to a point beyond the chine."""
    W0, W1 = hull_at(y0)[0], hull_at(y0 - length)[0]
    p_if = deck_point(xf0, y0, lift)
    p_of = deck_point(0.92, y0 - length * 0.22, lift + 0.02)
    tip = P(W1 + out, y0 - length, deck_z(1.0, y0 - length) + lift - 0.05)
    p_ir = deck_point(xf0, y0 - length * 0.72, lift)
    shard_plate(hs, [p_if, p_of, tip, p_ir], 0.13, 0.03, f"shell:{k % 9 + 1}", SHELL)
    # a teal seam where the plate's trailing edge meets the deck
    glow_line(hs, [lerp(p_ir, tip, f) + Vector((0, 0, -0.03)) for f in (0.08, 0.5, 0.86)], [(0.2, 0, 1)] * 3, 0.05, 0.015, TEAL)


def build_hull(rng):
    hs = HS(rng)
    # --- Core: a long faceted black chitin hull (crisp facets, no rounding) closing to a ram prow.
    rings = [hull_section(y) for y, *_ in HULL]
    rings.insert(0, P(*PROW))
    sweep(hs, rings, "frame", FRAME, tags="main", cap0=False, cap1=True)
    half = HS(rng)
    # --- Layered armour: overlapping iridescent shard plates down each flank (clear of the heart and the bays).
    for k, (y0, ln, out) in enumerate(((6.2, 1.9, 0.35), (4.9, 2.0, 0.45), (1.3, 2.2, 0.55), (-3.9, 2.2, 0.6),
                                       (-5.6, 2.0, 0.55), (-7.2, 1.8, 0.45), (-8.6, 1.5, 0.35))):
        armour_plate(half, y0, ln, 0.12, out, 0.05 + 0.05 * (k % 2), k)
    # --- Flank honeycomb lattice over a teal under-glow (cut-outs, as on the fighters).
    for (ya, yb) in ((3.4, 0.0), (-4.2, -8.6)):
        n = 8
        A, Bc = [], []
        for i in range(n):
            y = ya + (yb - ya) * i / (n - 1)
            W, T, C, B = hull_at(y)
            A.append(P(W + 0.05, y, C - 0.02))
            Bc.append(P(0.66 * W + 0.05, y, B + 0.28))
        glow_line(half, [P(0.86 * hull_at(a.y)[0], a.y, hull_at(a.y)[2] - 0.38) for a in A], [(1.0, 0, -0.4)] * n,
                  0.14, 0.02, TEAL)
        lattice(half, patch_between(A, Bc, up=(1.0, 0.0, -0.5)), 7, 2, 0.08, "frame_dk", FRAME, hole=0.62,
                vmin=lambda u: 0.0, vmax=lambda u: 1.0, rng=rng)
        tube(half, A, 0.05, "blade_dk", BLADE, seg=4)
    # --- Blades: silver canards, main blades with open lattice windows, aft blades; violet inner bands.
    Oc, Ic = ribbon_samples(CANARD[0], CANARD[1], 10, tip_lift)
    band(half, Oc, Ic, lambda t: 0.1 * (1 - t) ** 0.6 + 0.01, (0, 0, 1), "blade", BLADE, ridge=0.4, facets=True)
    # Main blades: solid knife blades (silver leading band, violet inner band, black slotted spar, teal edge line).
    O1, I1 = ribbon_samples(MAIN[0], MAIN[1], 20, tip_lift)
    E1 = [lerp(o, i, 0.4) for o, i in zip(O1, I1)]
    E1[-1] = O1[-1]
    band(half, O1, E1, lambda t: 0.16 * (1 - t) ** 0.6 + 0.012, (0, 0, 1), "blade", BLADE, ridge=0.38, facets=True)
    band(half, E1, I1, lambda t: 0.12 * (1 - t) ** 0.5 + 0.01, (0, 0, 1), "shell_dk:5", SHELL, ridge=0.5, facets=True)
    glow_line(half, [lerp(o, i, 0.4) + Vector((0, 0, 0.15 * (1 - k / 19) ** 0.5)) for k, (o, i) in
                     enumerate(zip(O1, I1)) if 2 <= k <= 15], [(0, 0, 1)] * 14, 0.06, 0.02, TEAL)
    for k in range(3, 16, 3):
        a_, b_ = lerp(O1[k], I1[k], 0.55), lerp(O1[k], I1[k], 0.92)
        lift_ = Vector((0, 0, 0.12 * (1 - k / 19) ** 0.5 + 0.02))
        tube(half, [a_ + lift_, b_ + lift_ * 0.7], 0.05, "frame", FRAME, seg=4)
    O3, I3 = ribbon_samples(AFT[0], AFT[1], 16, tip_lift)
    E3 = [lerp(o, i, 0.45) for o, i in zip(O3, I3)]
    E3[-1] = O3[-1]
    band(half, O3, E3, lambda t: 0.13 * (1 - t) ** 0.6 + 0.01, (0, 0, 1), "blade", BLADE, ridge=0.4, facets=True)
    band(half, E3, I3, lambda t: 0.1 * (1 - t) ** 0.5 + 0.01, (0, 0, 1), "shell:7", SHELL, ridge=0.5, facets=False)
    glow_line(half, [lerp(o, i, 0.45) + Vector((0, 0, 0.11 * (1 - k / 15) ** 0.5)) for k, (o, i) in
                     enumerate(zip(O3, I3)) if 2 <= k <= 12], [(0, 0, 1)] * 11, 0.05, 0.02, TEAL)
    # Armour grooves across the main blade and black root collars into the hull.
    for k in (9, 12, 15, 18):
        t = k / 21
        a_ = O1[k] + Vector((0, 0, 0.012))
        b_ = lerp(O1[k], I1[k], 0.25) + Vector((0, 0, 0.2 * (1 - t) ** 0.65 + 0.02))
        tube(half, [a_, lerp(a_, b_, 0.5) + Vector((0, 0, 0.01)), b_], 0.03, "frame", FRAME, seg=4)
    for (O, I) in ((Oc, Ic), (O1, I1), (O3, I3)):
        tube(half, [lerp(O[0], I[0], f) + Vector((0.04, 0, -0.03)) for f in (0.0, 0.33, 0.66, 1.0)], 0.14, "frame_dk",
             FRAME, seg=5)
    # --- Pod pylon: an angular outrigger from the hull to the pod mount.
    pc = Dg(POD_R)
    tube(half, [P(1.45, pc.y + 0.5, 1.3), P(2.3, pc.y + 0.25, 1.36), P(pc.x - 0.35, pc.y, 1.4)], [0.2, 0.16, 0.14],
         "frame", FRAME, seg=6)
    tube(half, [P(1.45, pc.y - 0.6, 1.25), P(pc.x - 0.4, pc.y - 0.2, 1.36)], 0.1, "frame_dk", FRAME, seg=5)
    arc_band(half, 0.62, 0.16, 0.12, 0.0, 2 * math.pi, 6, "blade_dk", BLADE, ch=0.03,
             m=Matrix.Translation(P(pc.x, pc.y, 1.44)) @ Matrix.Rotation(math.pi / 6, 4, "Z"))
    # --- Pod launch bay cowl with petal doors at the bay socket.
    bc = Dg(BAY_R)
    tube(half, [P(bc.x - 0.1, bc.y - 0.2, 1.3), P(bc.x, bc.y - 0.06, 1.56), P(bc.x, bc.y, bc.z - 0.04)],
         [0.56, 0.52, 0.48], "frame", FRAME, seg=8, cap1=False)
    arc_band(half, 0.5, 0.12, 0.1, 0.0, 2 * math.pi, 8, "blade", BLADE, ch=0.03,
             m=Matrix.Translation(P(bc.x, bc.y, bc.z)) @ Matrix.Rotation(math.pi / 8, 4, "Z"))
    well = HS(rng)
    tube(well, [P(bc.x, bc.y, bc.z + 0.04), P(bc.x, bc.y, bc.z - 0.2), P(bc.x, bc.y, bc.z - 0.42)], [0.43, 0.38, 0.28],
         "frame_teal", FRAME, seg=8, cap0=False, cap1=False)
    append(half, flipped(well))
    disc(half, P(bc.x, bc.y, bc.z - 0.42), (0, 0, 1), 0.28, 8, "lamp", TEAL)
    for k in range(4):
        a = 2 * math.pi * k / 4 + math.pi / 4
        d = Vector((math.cos(a), math.sin(a), 0.0))
        tvec = Vector((-d.y, d.x, 0.0))
        root = P(bc.x, bc.y, bc.z + 0.03) + d * 0.46
        tipp = root + d * 0.3 + Vector((0, 0, 0.34))
        shard_plate(half, [root - tvec * 0.24, tipp, root + tvec * 0.24], 0.04, 0.02, f"shell:{k + 6}", SHELL)
    # --- Teal veins along the chine.
    pts = [P(hull_at(y)[0] + 0.01, y, hull_at(y)[2] + 0.02) for y in [6.0 - 15.6 * i / 15 for i in range(16)]]
    glow_line(half, pts, [(1.0, 0, 0.3)] * len(pts), 0.05, 0.02, TEAL)
    # --- Prow mandibles: two short silver blades flanking the ram.
    crescent(half, [P(0.35, 5.9, 1.45), P(0.85, 6.3, 1.4), P(0.95, 7.2, 1.36), P(0.55, 8.2, 1.34)],
             [P(0.3, 6.7, 1.48), P(0.5, 7.1, 1.44), P(0.6, 7.6, 1.4), P(0.55, 8.2, 1.34)], 8,
             lambda t: 0.07 * (1 - t) + 0.01, (0, 0, 1), "blade", BLADE)
    # --- Stern engine block: a faceted housing with three teal slots (engine sockets).
    for ex, er in ((0.0, 0.42), (0.85, 0.3)):
        c = P(ex, STERN - 0.05, 1.2 if ex else 1.3)
        tube(half, [c + Vector((0, 0.9, 0)), c + Vector((0, 0.15, 0)), c], [er + 0.12, er + 0.16, er + 0.12], "frame_dk",
             FRAME, seg=6)
        disc(half, c - Vector((0, 0.01, 0)), (0, -1, 0), er, 6, "lamp", TEAL)
    append(hs, half)
    append(hs, mirror_x(half))
    # --- Dorsal blade spine with vertebra shards and a teal slit (broken by the heart iris).
    for (ya, yb) in ((6.4, 0.3), (-3.7, -9.6)):
        n = max(3, int(abs(ya - yb) / 1.0) + 1)
        st = []
        for i in range(n):
            y = ya + (yb - ya) * i / (n - 1)
            T = hull_at(y)[1]
            h = 0.48 if 0 < i < n - 1 else 0.12
            st.append([P(0.13, y, T - 0.02), P(0.0, y, T + h), P(-0.13, y, T - 0.02)])
        sweep(hs, st, "frame", FRAME, tags="main")
        for i in range(n - 1):
            y = ya + (yb - ya) * (i + 0.5) / (n - 1)
            T = hull_at(y)[1]
            ln = 0.4
            shard_plate(hs, [P(0.0, y + ln, T + 0.44), P(-0.42, y - ln * 0.7, T + 0.06), P(0.0, y - ln * 0.3, T + 0.3),
                             P(0.42, y - ln * 0.7, T + 0.06)], 0.08, 0.02, "blade_dk", BLADE)
        glow_line(hs, [P(0.0, ya - 0.3 * math.copysign(1, ya - yb), hull_at(ya)[1] + 0.12),
                       P(0.0, yb + 0.3 * math.copysign(1, ya - yb), hull_at(yb)[1] + 0.12)], [(0, 0, 1)] * 2, 0.04, 0.015,
                  TEAL)
    # --- Heart socket collar: an octagonal iris housing on the deck.
    hc = Dg(HEART)
    arc_band(hs, 1.3, 0.3, 0.6, 0.0, 2 * math.pi, 8, "frame", FRAME, ch=0.06,
             m=Matrix.Translation(P(hc.x, hc.y, 1.76)) @ Matrix.Rotation(math.pi / 8, 4, "Z"), full=True)
    arc_band(hs, 1.13, 0.07, 0.06, 0.0, 2 * math.pi, 8, "lamp", TEAL, ch=0.0,
             m=Matrix.Translation(P(hc.x, hc.y, 2.09)) @ Matrix.Rotation(math.pi / 8, 4, "Z"))
    for k in range(8):
        a = 2 * math.pi * k / 8
        d = Vector((math.cos(a), math.sin(a), 0.0))
        root = P(hc.x, hc.y, 1.95) + d * 1.4
        tube(hs, [root, root + d * 0.25 + Vector((0, 0, 0.1)), root + d * 0.55 + Vector((0, 0, 0.14))],
             [0.09, 0.06, 0.0], "frame", FRAME, seg=4, apex_end=True)
    return hs


# ----------------------------------------------------------------------------
# Pods (live / wreck): an angular crystal crown on a hexagonal mount
# ----------------------------------------------------------------------------

def build_pod(side, rng, wreck=False):
    hs = HS(rng)
    c = Dg(POD_L if side < 0 else POD_R)
    base_z = 1.47
    arc_band(hs, 0.42, 0.3, 0.26, 0.0, 2 * math.pi, 6, "char" if wreck else "frame", FRAME, ch=0.04,
             m=Matrix.Translation(P(c.x, c.y, base_z + 0.1)), full=True)
    if not wreck:
        verts, faces = icosahedron()
        framed_poly(hs, verts, faces, xform((c.x, c.y, 1.92), (0.0, 0.0, 0.3)) @ Matrix.Diagonal((0.38, 0.38, 0.34, 1.0)),
                    0.24, 0.035, "frame", FRAME, "lamp", TEAL)
    else:
        for k in range(6):
            a = 2 * math.pi * k / 6 + rng.uniform(-0.2, 0.2)
            d = Vector((math.cos(a), math.sin(a), rng.uniform(0.2, 0.9))).normalized()
            p0 = P(c.x, c.y, 1.76) + d * 0.08
            tube(hs, [p0, p0 + d * rng.uniform(0.2, 0.34)], [0.09, 0.0], "shell_dk", SHELL, seg=4, apex_end=True)
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.5
            disc(hs, P(c.x + math.cos(a) * 0.16, c.y + math.sin(a) * 0.16, 1.73), (0, 0, 1), 0.06, 5, "lamp", TEAL)
        hs.scorch = [((c.x, c.y, 1.7), 1.1)]
    # Four tall angular shard fins standing around the core (two kept, broken, on the wreck).
    for k in range(4):
        if wreck and k % 2:
            continue
        a = math.pi / 4 + k * math.pi / 2
        d = Vector((math.cos(a), math.sin(a), 0.0))
        tvec = Vector((-d.y, d.x, 0.0))
        root = P(c.x, c.y, base_z + 0.22) + d * 0.5
        top = root + d * 0.12 + Vector((0, 0, 0.9 if not wreck else 0.45))
        outline = [root - tvec * 0.2, root + d * 0.22 + Vector((0, 0, 0.35)), top, root + tvec * 0.2]
        shard_plate(hs, outline, 0.06, 0.02, "burnt" if wreck else ("blade" if k % 2 else f"shell:{k + 2}"),
                    BLADE if (wreck or k % 2) else SHELL)
        if not wreck:
            glow_line(hs, [root + d * 0.06 + Vector((0, 0, 0.15)), lerp(root, top, 0.6) + d * 0.04], [d] * 2, 0.04, 0.02, TEAL)
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
        rules[name] = dict(t=t, x=(-13.0, 13.0), z=(-10.8, 8.3), y_max=TOP_MAX, y_min=-0.6)
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
    cam = kit.add_ortho_camera((0.0, 1.2, 0.0), 90.0, 28.0)
    nf.setup_render(args.engine, args.samples, 1400, 1100)
    kit.render(os.path.join(args.preview_dir, f"preview-veil-top{sfx}.png"))
    kit.clear_preview(keep)
    # 3. Hero 3/4 perspective.
    place_set(objs, LIVE, (0.0, 0.0, 0.0))
    kit.plane_obj("pv_mire", -60, 60, -60, 60, -0.02, pm["mire"])
    nf.preview_lights()
    nf.perspective_camera((20.0, -22.0, 14.0), (0.0, -1.5, 0.8), lens=30.0)
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
