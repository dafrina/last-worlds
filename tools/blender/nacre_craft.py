"""Nacre enemy craft for Last Worlds (docs/20-nacre-luminous-mire.md).

Nodes: nacre_shard (fast fighter), nacre_veil (crescent fighter), nacre_orrery (heavy ring machine),
nacre_spore (ground battery) and nacre_pod (THE VEIL's launched pod craft), after the ORRERY / SHARD /
VEIL designs of art/concepts/06-exotic-aliens.png and the NACRE column of 05-alien-factions.png:
sharp sweeping crescent blades, layered iridescent shell plates, black chitin lattice with real
cut-outs, teal and amber glow. The concepts are references only; all geometry is original.

Conventions: glTF +Y up, 1 unit = 1 game unit, noses / muzzles toward +Z (toward the player),
exhausts toward -Z. Air craft pivot at their centre (y = 0 is the mid-plane); the spore battery
pivots at its base centre (lowest point y = -0.05). Socket empties are children of each node.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/nacre_craft.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/nacre/nacre-craft.glb)" \\
        --preview-dir "$(wslpath -w $R/art/nacre-craft)"
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
from nacre_fleet import (HS, V, SHELL, BLADE, FRAME, BRONZE, TEAL, AMBER, band, crescent, shard_plate,  # noqa: E402
                         glow_line, lattice, patch_between, sweep, tube, bez_pts, lerp, framed_poly, icosahedron,
                         arc_band, disc, merge_hs, xform, append, mirror_x, transformed, open_crescent)

SEED = "nacre-craft-v1"


def P(x, y, z):
    """Design space point: x right, y forward (glTF +Z), z up (glTF +Y)."""
    return Vector((x, y, z))


def section_ring(y, sec, w, h, z0=0.0, x0=0.0):
    return [P(x0 + a * w, y, z0 + b * h) for a, b in sec]


SEC6 = [(1.0, 0.0), (0.5, 0.62), (0.0, 1.0), (-0.5, 0.62), (-1.0, 0.0), (-0.42, -0.5), (0.42, -0.5)]
SEC8 = [(1.0, 0.0), (0.78, 0.42), (0.42, 0.86), (0.0, 1.0), (-0.42, 0.86), (-0.78, 0.42), (-1.0, 0.0), (0.0, -0.55)]
LENS = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -0.7)]


def loft(hs, stations, sec, paint, mat, apex=None, tags="main", x0=0.0):
    rings = [section_ring(y, sec, w, h, z0, x0) for (y, w, h, z0) in stations]
    if apex is not None:
        rings.append(P(*apex))
    sweep(hs, rings, paint, mat, tags=tags)


# ----------------------------------------------------------------------------
# nacre_shard: black spined core, floating iridescent shard plates, amber seams
# ----------------------------------------------------------------------------

def build_shard(rng):
    hs = HS(rng)
    # Long jagged black spine (narrow) ending in the beam emitter at the nose.
    spine = [(-0.64, 0.028, 0.026, 0.0), (-0.56, 0.05, 0.045, 0.0), (-0.4, 0.062, 0.06, 0.0), (-0.16, 0.066, 0.068, 0.0),
             (0.1, 0.056, 0.06, 0.0), (0.32, 0.04, 0.045, 0.0), (0.5, 0.022, 0.026, 0.0)]
    loft(hs, spine, SEC6, "frame", FRAME, apex=(0.0, 0.66, 0.0))

    def spine_w(y):
        pts = [(s_[0], s_[1], s_[2]) for s_ in spine] + [(0.66, 0.0, 0.0)]
        for (y0, w0, h0), (y1, w1, h1) in zip(pts, pts[1:]):
            if y0 <= y <= y1:
                k = (y - y0) / (y1 - y0)
                return w0 + (w1 - w0) * k, h0 + (h1 - h0) * k
        return pts[0][1], pts[0][2]

    # Layered black vertebra chevrons along the crest.
    for k, y in enumerate((-0.44, -0.27, -0.1, 0.07, 0.24)):
        w, h = spine_w(y)
        ln = 0.075
        z = h + 0.003
        outline = [P(0.0, y + ln, z), P(-w * 1.5, y - ln * 0.7, z - 0.014), P(-w * 0.3, y - ln * 0.25, z),
                   P(0.0, y - ln * 0.5, z), P(w * 0.3, y - ln * 0.25, z), P(w * 1.5, y - ln * 0.7, z - 0.014)]
        shard_plate(hs, outline, 0.024, 0.006, "frame_dk", FRAME)
    # Amber emitter slit near the nose and glow pods on the spine.
    glow_line(hs, [P(0.0, 0.34, 0.046), P(0.0, 0.5, 0.03)], [(0, 0, 1)] * 2, 0.014, 0.004, AMBER)
    # Black thorns jutting back from the spine (asymmetric).
    for (x, y, dx, dy, dz, ln) in ((0.05, -0.02, 0.5, -0.85, 0.12, 0.17), (-0.055, -0.33, -0.45, -0.88, 0.08, 0.2)):
        d = Vector((dx, dy, dz)).normalized()
        a = P(x, y, 0.02)
        tube(hs, [a, a + d * ln * 0.5, a + d * ln], [0.018, 0.011, 0.0], "frame", FRAME, seg=4, apex_end=True)
    # Floating pearl shard plates: long forward-pointing kites offset along the spine in a slight spiral
    # (right side further forward, left side further back), closer in at the nose, wider at the tail.
    plates = [
        # tip (front), outer shoulder, rear point, inner shoulder (x, y, z)
        ([P(0.075, 0.5, 0.06), P(0.17, 0.2, 0.035), P(0.15, 0.06, 0.04), P(0.085, 0.14, 0.065)], 0.016),
        ([P(0.13, 0.12, 0.035), P(0.3, -0.16, -0.005), P(0.27, -0.32, 0.0), P(0.13, -0.18, 0.04)], 0.022),
        ([P(0.21, -0.26, 0.01), P(0.41, -0.52, -0.035), P(0.36, -0.64, -0.03), P(0.2, -0.5, 0.015)], 0.022),
        ([P(-0.08, 0.36, 0.07), P(-0.19, 0.07, 0.085), P(-0.16, -0.04, 0.08), P(-0.09, 0.02, 0.07)], 0.016),
        ([P(-0.15, -0.02, 0.05), P(-0.33, -0.3, 0.085), P(-0.29, -0.46, 0.08), P(-0.14, -0.34, 0.05)], 0.022),
        ([P(-0.12, -0.42, 0.03), P(-0.24, -0.56, 0.05), P(-0.2, -0.66, 0.045), P(-0.11, -0.6, 0.03)], 0.014),
    ]
    for k, (outline, ridge) in enumerate(plates):
        shard_plate(hs, outline, ridge, ridge * 0.45, f"pearl:{k + 2}", SHELL)
        # field joint: a clamp node on the inner shoulder, an amber line to a glowing socket on the spine
        c = lerp(outline[3], outline[0], 0.25)
        w, h = spine_w(c.y)
        sx = 1 if c.x > 0 else -1
        root = P(sx * w * 0.8, c.y - 0.02, h * 0.45)
        tube(hs, [c, root], 0.0055, "lamp", AMBER, seg=3)
        nf.poly_solid(hs, *nf.bipyramid(4, 1.0, 1.0), xform(tuple(c + Vector((0, 0, 0.006))), (0, 0, 0.6)) @
                      Matrix.Diagonal((0.02, 0.02, 0.018, 1.0)), "frame", FRAME)
        disc(hs, c + Vector((0, 0, 0.025)), (0, 0, 1), 0.009, 6, "lamp", AMBER)
        disc(hs, root + Vector((sx * 0.004, 0, 0.0)), (sx, 0, 0.4), 0.014, 6, "lamp", AMBER)
    # A thin vertical shard above the tail (reads in 3/4, a hairline from the game camera).
    shard_plate(hs, [P(0.0, 0.02, 0.07), P(0.0, -0.44, 0.06), P(0.0, -0.34, 0.2)], 0.012, 0.012, "pearl:9", SHELL)
    # Amber seams between the vertebrae along the spine flanks.
    for sx in (-1, 1):
        for (ya, yb) in ((0.3, 0.12), (-0.05, -0.22), (-0.38, -0.52)):
            pts = [P(sx * spine_w(y)[0] * 0.75, y, spine_w(y)[1] * 0.45) for y in (ya, (ya + yb) * 0.5, yb)]
            glow_line(hs, pts, [(sx * 0.8, 0, 0.6)] * 3, 0.011, 0.004, AMBER)
    # Twin rear engines with amber nozzles.
    for sx in (-1, 1):
        tube(hs, [P(sx * 0.05, -0.46, -0.005), P(sx * 0.062, -0.6, -0.005), P(sx * 0.062, -0.665, -0.005)],
             [0.024, 0.028, 0.026], "frame_dk", FRAME, seg=6)
        disc(hs, P(sx * 0.062, -0.667, -0.005), (0, -1, 0), 0.02, 6, "lamp", AMBER)
    return hs


SHARD_SOCKETS = {"nacre_shard_muzzle_0": (0.0, 0.0, 0.6), "nacre_shard_engine_0": (-0.062, -0.005, -0.67),
                 "nacre_shard_engine_1": (0.062, -0.005, -0.67)}


# ----------------------------------------------------------------------------
# nacre_veil: crescent fighter after VEIL
# ----------------------------------------------------------------------------

def build_veil_fighter(rng):
    hs = HS(rng)
    # Seed hull: violet shell with a sharp dorsal crest (smooth along, crisp across).
    loft(hs, [(-0.52, 0.07, 0.05, 0.0), (-0.42, 0.13, 0.09, 0.0), (-0.22, 0.165, 0.12, 0.0), (0.02, 0.16, 0.12, 0.0),
              (0.24, 0.115, 0.09, 0.0), (0.42, 0.065, 0.055, 0.0)], SEC8, "shell:1", SHELL, apex=(0.0, 0.66, 0.0),
         tags="smooth")
    # Black chitin under-frame, wider than the shell, shows along the flanks.
    loft(hs, [(-0.62, 0.05, 0.03, -0.02), (-0.46, 0.2, 0.05, -0.02), (-0.15, 0.215, 0.06, -0.02),
              (0.15, 0.165, 0.05, -0.02), (0.4, 0.07, 0.035, -0.02)], LENS, "frame", FRAME, apex=(0.0, 0.56, -0.02))
    # Dorsal black keel plate with a teal slit.
    shard_plate(hs, [P(0.0, 0.4, 0.122), P(-0.05, 0.05, 0.13), P(-0.04, -0.3, 0.1), P(0.0, -0.36, 0.09),
                     P(0.04, -0.3, 0.1), P(0.05, 0.05, 0.13)], 0.018, 0.004, "frame", FRAME)
    glow_line(hs, [P(0.0, 0.3, 0.142), P(0.0, 0.05, 0.149), P(0.0, -0.22, 0.12)], [(0, 0, 1)] * 3, 0.014, 0.004,
              TEAL)
    half = HS(rng)
    # Main silver crescents sweeping forward to sharp tips, with open lattice windows.
    open_crescent(half, rng,
                  [P(0.13, -0.52, 0.0), P(0.64, -0.6, 0.02), P(0.86, 0.06, 0.05), P(0.47, 0.75, 0.03)],
                  [P(0.17, -0.04, 0.0), P(0.3, 0.0, 0.02), P(0.4, 0.34, 0.05), P(0.47, 0.75, 0.03)],
                  16, 0.036, 0.03, 0.12, 0.46, 0.15, lambda t: 0.045 * math.sin(math.pi * t) - 0.008 * t,
                  ("blade", BLADE, "blade", BLADE), (3, 2), 0.018, vc_=0.42, glow_rim=0.012)
    # Layered violet cheek shells over the blade roots, sharp forward tips (the seed hull's armour).
    O = bez_pts([P(0.15, -0.47, 0.03), P(0.38, -0.36, 0.05), P(0.35, 0.1, 0.065), P(0.1, 0.5, 0.05)], 12)
    I = bez_pts([P(0.09, -0.4, 0.085), P(0.15, -0.2, 0.115), P(0.14, 0.14, 0.105), P(0.1, 0.5, 0.05)], 12)
    band(half, I, O, lambda t: 0.03 * (1 - t) ** 0.5 + 0.002, (0, 0, 1), "shell:4", SHELL, ridge=0.38, facets=True)
    # Forward barbs beside the nose.
    crescent(half, [P(0.07, 0.16, 0.03), P(0.19, 0.22, 0.035), P(0.24, 0.42, 0.035), P(0.17, 0.62, 0.025)],
             [P(0.06, 0.32, 0.04), P(0.11, 0.38, 0.04), P(0.15, 0.5, 0.035), P(0.17, 0.62, 0.025)], 9,
             lambda t: 0.02 * (1 - t) + 0.002, (0, 0, 1), "blade", BLADE)
    # Swept tail blades.
    crescent(half, [P(0.06, -0.36, 0.0), P(0.2, -0.46, 0.0), P(0.3, -0.6, -0.005), P(0.34, -0.76, -0.02)],
             [P(0.05, -0.5, 0.0), P(0.12, -0.55, 0.0), P(0.22, -0.64, -0.01), P(0.34, -0.76, -0.02)], 9,
             lambda t: 0.02 * (1 - t) + 0.002, (0, 0, 1), "blade", BLADE)
    # Teal vein along the hull flank.
    glow_line(half, [P(0.2, -0.36, 0.083), P(0.24, -0.16, 0.098), P(0.22, 0.06, 0.098), P(0.16, 0.26, 0.082)],
              [(0.25, 0, 1.0)] * 4, 0.014, 0.004, TEAL)
    # Gun spines at the blade roots, teal tips (muzzles).
    tube(half, [P(0.2, -0.08, 0.0), P(0.21, 0.06, 0.0), P(0.21, 0.15, 0.0)], [0.026, 0.022, 0.016], "frame_dk", FRAME,
         seg=6)
    disc(half, P(0.21, 0.151, 0.0), (0, 1, 0), 0.013, 6, "lamp", TEAL)
    append(hs, half)
    append(hs, mirror_x(half))
    # Teal engine ring at the rear, tilted to face back and up.
    m = xform((0.0, -0.57, 0.035), (math.radians(38.0), 0.0, 0.0))
    arc_band(hs, 0.115, 0.05, 0.05, 0.0, 2 * math.pi, 16, "frame", FRAME, ch=0.01, m=m)
    arc_band(hs, 0.082, 0.02, 0.03, 0.0, 2 * math.pi, 16, "lamp", TEAL, ch=0.0, m=m @ xform((0, 0, 0.012)))
    disc(hs, m @ Vector((0, 0, -0.01)), m.to_3x3() @ Vector((0, 0, 1)), 0.07, 12, "lamp", TEAL)
    tube(hs, [m @ Vector((0, 0, -0.03)), m @ Vector((0, 0, 0.03))], 0.02, "frame_dk", FRAME, seg=6)
    return hs


VEIL_SOCKETS = {"nacre_veil_muzzle_0": (-0.21, 0.0, 0.15), "nacre_veil_muzzle_1": (0.21, 0.0, 0.15),
                "nacre_veil_engine_0": (0.0, 0.035, -0.6)}


# ----------------------------------------------------------------------------
# nacre_orrery: nested bronze rings, faceted amber core, spike gun pods
# ----------------------------------------------------------------------------

ORRERY_RINGS = [  # (radius, radial width, height, segments, tilt axis, tilt degrees)
    (0.735, 0.14, 0.105, 7, "X", -8.0),
    (0.555, 0.1, 0.125, 5, "Y", 17.0),
    (0.39, 0.085, 0.1, 4, "X", 25.0),
]


def ring_matrix(axis, deg):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def build_orrery(rng):
    hs = HS(rng)
    pivots = []
    for ri, (r, w, h, nseg, axis, deg) in enumerate(ORRERY_RINGS):
        m = ring_matrix(axis, deg)
        gap = 0.075
        off = 0.35 + ri * 0.45
        for k in range(nseg):
            a0 = off + 2 * math.pi * k / nseg + gap / 2
            a1 = off + 2 * math.pi * (k + 1) / nseg - gap / 2
            paint = "bronze" if (k + ri) % 3 else "bronze_dk"
            arc_band(hs, r, w, h, a0, a1, 4, paint, BRONZE, ch=0.018 if ri < 2 else 0.0, m=m)
            # broad raised cap plate on alternate segments (layered ring sections)
            if (k + ri) % 2 == 1 and ri < 2:
                arc_band(hs, r + w * 0.08, w * 0.55, 0.018, a0 + 0.06, a1 - 0.06, 3, "bronze_dk", BRONZE, ch=0.006,
                         m=m @ xform((0, 0, h * 0.5 + 0.009)))
            else:
                # sparse glyph inlays: an amber slit and a tick
                am = (a0 + a1) * 0.5
                ln = (a1 - a0) * 0.42
                arc_band(hs, r - w * 0.1, w * 0.13, 0.008, am - ln / 2, am + ln / 2, 2, "lamp", AMBER, ch=0.0,
                         m=m @ xform((0, 0, h * 0.5 + 0.002)))
            # black joint clamps across each gap
            ag = a1 + gap / 2
            j = HS(rng)
            j.box((0, 0, 0), (w * 1.16, gap + 0.045, h * 1.18), 0.0, "frame", FRAME, bottom=True)
            merge_hs(hs, j, m @ xform((math.cos(ag) * r, math.sin(ag) * r, 0.0), (0, 0, ag)))
        pivots.append(m)
    # Faceted amber core: icosahedron with a raised black frame and recessed glowing panes.
    verts, faces = icosahedron()
    framed_poly(hs, verts, faces, Matrix.Diagonal((0.2, 0.2, 0.2, 1.0)) @ Matrix.Rotation(0.3, 4, "Z"), 0.26,
                0.024, "frame", FRAME, "lamp", AMBER)
    # Gimbal struts: core -> inner ring (along y), inner -> middle (along x), middle -> outer (along y).
    m_o, m_m, m_i = pivots

    def on(m, r, ang):
        return m @ Vector((math.cos(ang) * r, math.sin(ang) * r, 0.0))
    links = [
        (Vector((0, 0.18, 0)), on(m_i, 0.35, math.pi / 2)), (Vector((0, -0.18, 0)), on(m_i, 0.35, -math.pi / 2)),
        (on(m_i, 0.43, 0.0), on(m_m, 0.505, 0.0)), (on(m_i, 0.43, math.pi), on(m_m, 0.505, math.pi)),
        (on(m_m, 0.605, math.pi / 2), on(m_o, 0.665, math.pi / 2)),
        (on(m_m, 0.605, -math.pi / 2), on(m_o, 0.665, -math.pi / 2)),
    ]
    for a, b in links:
        tube(hs, [a, b], 0.018, "frame", FRAME, seg=4)
        for p in (a, b):
            nf.poly_solid(hs, *nf.bipyramid(4, 1.0, 1.0), xform(tuple(p)) @ Matrix.Diagonal((0.032, 0.032, 0.03, 1.0)),
                          "bronze_dk", BRONZE)
    # Tapered emitter arms on the outer ring: two forward volley guns, two lateral emitters.
    def emitter(base, tip, r0, amber_rings):
        d = (tip - base).normalized()
        tube(hs, [base - d * 0.06, base + d * 0.02, base + d * 0.07], [0.04, 0.05, 0.042], "bronze_dk", BRONZE, seg=5)
        tube(hs, [base + d * 0.06, lerp(base, tip, 0.45), lerp(base, tip, 0.8), tip], [0.032, 0.025, 0.017, 0.0],
             "frame", FRAME, seg=6, apex_end=True)
        for f in amber_rings:
            c = lerp(base, tip, f)
            rr = 0.033 - 0.016 * f
            tube(hs, [c - d * 0.009, c + d * 0.009], rr, "lamp", AMBER, seg=6)
    for s in (-1, 1):
        ang = math.atan2(0.62, s * 0.4)
        base = on(m_o, 0.735, ang) + Vector((0, 0, 0.06))
        emitter(base, Vector((s * 0.4, 0.87, base.z)), 0.03, (0.4, 0.75))
    for s in (-1, 1):
        ang = 0.0 if s > 0 else math.pi
        base = on(m_o, 0.79, ang)
        d = Vector((math.cos(ang), math.sin(ang), 0.0))
        emitter(base + d * 0.02, base + d * 0.12, 0.025, (0.5,))
    return hs


ORRERY_SOCKETS = {"nacre_orrery_muzzle_0": None, "nacre_orrery_muzzle_1": None, "nacre_orrery_core": (0.0, 0.0, 0.0)}


# ----------------------------------------------------------------------------
# nacre_spore: organic ground battery
# ----------------------------------------------------------------------------

def polar(r, a, z):
    return P(math.cos(a) * r, math.sin(a) * r, z)


def build_spore(rng):
    hs = HS(rng)
    base_z = -0.05
    # Black chitin plinth.
    hs.prism([(math.cos(2 * math.pi * k / 12) * 0.34, math.sin(2 * math.pi * k / 12) * 0.34) for k in range(12)],
             base_z, 0.07, 0.025, "frame", FRAME, bottom=True)
    hs.prism([(math.cos(2 * math.pi * k / 12 + 0.26) * 0.25, math.sin(2 * math.pi * k / 12 + 0.26) * 0.25)
              for k in range(12)], 0.07, 0.14, 0.02, "frame_dk", FRAME)
    # Six outer petal blades radiating out (silver), sickle tips.
    for k in range(6):
        a = math.radians(30 + 60 * k)
        rot = Matrix.Rotation(a, 4, "Z")
        petal = HS(rng)
        crescent(petal, [P(0.15, -0.09, 0.02), P(0.34, -0.12, 0.05), P(0.48, -0.06, 0.09), P(0.55, 0.07, 0.14)],
                 [P(0.15, 0.08, 0.05), P(0.3, 0.06, 0.07), P(0.43, 0.05, 0.1), P(0.55, 0.07, 0.14)], 10,
                 lambda t: 0.045 * (1 - t) ** 0.7 + 0.002, (0, 0, 1), "blade", BLADE)
        glow_line(petal, [P(0.22, -0.005, 0.085), P(0.33, -0.01, 0.1), P(0.43, 0.01, 0.12)], [(0, 0, 1)] * 3, 0.012,
                  0.003, TEAL)
        merge_hs(hs, petal, rot)
    # Black lattice collar (cone around the core base).
    ring_lo = [polar(0.27, 2 * math.pi * k / 24, 0.13) for k in range(25)]
    ring_hi = [polar(0.17, 2 * math.pi * k / 24, 0.36) for k in range(25)]
    lattice(hs, patch_between(ring_lo, ring_hi, up=(0, 0, 1)), 8, 2, 0.022, "frame", FRAME, hole=0.6, rng=rng)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.25
        tube(hs, [polar(0.28, a, 0.12), polar(0.21, a, 0.3), polar(0.15, a, 0.44)], [0.02, 0.017, 0.012], "frame",
             FRAME, seg=4)
    # Teal core sac (target): faceted, framed, around z = 0.55.
    verts, faces = icosahedron()
    framed_poly(hs, verts, faces, xform((0.0, 0.0, 0.55), (0.0, 0.0, 0.4)) @ Matrix.Diagonal((0.15, 0.15, 0.2, 1.0)),
                0.26, 0.018, "frame", FRAME, "lamp", TEAL)
    # Five inner violet petals cupping the sac (gap at the front for the launcher).
    for k in range(5):
        a = math.radians(126 + 72 * k)
        rot = Matrix.Rotation(a - math.pi / 2, 4, "Z")      # local +y = radial outward... see points below
        petal = HS(rng)
        # local frame: x tangential, y radial outward, z up
        O = bez_pts([P(-0.075, 0.16, 0.22), P(-0.085, 0.3, 0.42), P(-0.045, 0.33, 0.64), P(0.015, 0.25, 0.86)], 10)
        I = bez_pts([P(0.075, 0.15, 0.22), P(0.065, 0.25, 0.42), P(0.04, 0.27, 0.64), P(0.015, 0.25, 0.86)], 10)
        ups = []
        for i in range(10):
            ups.append(Vector((0.0, 1.0, -0.35 + 0.5 * i / 9)).normalized())
        band(petal, O, I, lambda t: 0.035 * (1 - t) ** 0.6 + 0.002, ups, f"shell:{k + 1}", SHELL, ridge=0.5,
             facets=True)
        glow_line(petal, [P(0.0, 0.205, 0.3), P(-0.005, 0.27, 0.45), P(-0.002, 0.285, 0.6)],
                  [(0, 1, 0)] * 3, 0.012, 0.004, TEAL)
        merge_hs(hs, petal, rot)
    # Launcher spine toward +y, pitched up 20 degrees.
    pitch = math.radians(20.0)
    d = Vector((0.0, math.cos(pitch), math.sin(pitch)))
    root = P(0.0, 0.1, 0.5)
    tip = root + d * 0.46
    tube(hs, [root, root + d * 0.12, root + d * 0.3, tip], [0.055, 0.05, 0.036, 0.022], "frame", FRAME, seg=6)
    for f in (0.3, 0.62):
        c = root + d * (0.46 * f)
        tube(hs, [c - d * 0.01, c + d * 0.01], 0.056 - 0.024 * f, "lamp", TEAL, seg=6)
    disc(hs, tip + d * 0.001, d, 0.018, 8, "lamp", TEAL)
    for s in (-1, 1):  # cradle blades holding the spine
        shard_plate(hs, [P(s * 0.03, 0.06, 0.42), P(s * 0.13, 0.3, 0.5), P(s * 0.05, 0.26, 0.56)], 0.012, 0.012,
                    "blade_dk", BLADE)
    return hs


SPORE_TIP = None  # computed in main from the pitch


# ----------------------------------------------------------------------------
# nacre_pod: seed-pod / blade capsule launched by THE VEIL
# ----------------------------------------------------------------------------

def build_pod(rng):
    hs = HS(rng)
    core = [(-0.4, 0.045, 0.035, 0.0), (-0.3, 0.09, 0.058, 0.0), (-0.1, 0.115, 0.07, 0.0), (0.12, 0.1, 0.064, 0.0),
            (0.3, 0.06, 0.04, 0.0)]
    loft(hs, core, SEC6, "frame", FRAME, apex=(0.0, 0.47, 0.0))

    def core_w(y):
        pts = [(c[0], c[1], c[2]) for c in core] + [(0.47, 0.0, 0.0)]
        for (y0, w0, h0), (y1, w1, h1) in zip(pts, pts[1:]):
            if y0 <= y <= y1:
                k = (y - y0) / (y1 - y0)
                return w0 + (w1 - w0) * k, h0 + (h1 - h0) * k
        return pts[0][1], pts[0][2]

    half = HS(rng)
    # Husk shell wrapping the flank: from the top near the centreline to below the chine.
    ys = [0.4 - 0.72 * k / 13 for k in range(14)]
    A, Bc, ups = [], [], []
    for k, y in enumerate(ys):
        w, h = core_w(y)
        t = k / 13
        flare = 0.03 * math.sin(math.pi * t) + 0.05 * t * t
        A.append(P(0.028, y, h + 0.012))
        A[-1] = A[-1] + Vector((0.035, 0.0, -0.004))
        Bc.append(P(w + 0.06 + flare, y - 0.03 * t, -0.012 - 0.02 * t))
        ups.append(Vector((0.4, 0.0, 0.92)).normalized())
    A[0] = Bc[0] = P(0.03, 0.44, 0.02)
    band(half, list(reversed(A)), list(reversed(Bc)), lambda t: 0.018 * (0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.1)))
         + 0.003, list(reversed(ups)), "shell:3", SHELL, ridge=0.32, facets=True)
    # Teal slit along the flank, between husk and keel.
    glow_line(half, [P(core_w(y)[0] + 0.012, y, -0.01) for y in (0.24, 0.1, -0.05, -0.2)], [(1, 0, 0)] * 4, 0.012,
              0.004, TEAL)
    # Swept tail fin.
    crescent(half, [P(0.07, -0.12, 0.0), P(0.28, -0.24, -0.01), P(0.38, -0.36, -0.02), P(0.375, -0.46, -0.035)],
             [P(0.07, -0.32, 0.0), P(0.17, -0.36, -0.01), P(0.29, -0.42, -0.02), P(0.375, -0.46, -0.035)], 9,
             lambda t: 0.022 * (1 - t) + 0.002, (0, 0, 1), "blade", BLADE)
    append(hs, half)
    append(hs, mirror_x(half))
    # Teal slit along the spine between the husks.
    glow_line(hs, [P(0.0, 0.32, core_w(0.32)[1] + 0.002), P(0.0, 0.1, core_w(0.1)[1] + 0.004),
                   P(0.0, -0.12, core_w(-0.12)[1] + 0.004), P(0.0, -0.3, core_w(-0.3)[1] + 0.002)],
              [(0, 0, 1)] * 4, 0.016, 0.004, TEAL)
    # Dorsal fin (vertical blade).
    lead = bez_pts([P(0.0, -0.1, 0.09), P(0.0, -0.22, 0.13), P(0.0, -0.36, 0.2), P(0.0, -0.47, 0.25)], 8)
    trail = bez_pts([P(0.0, -0.3, 0.07), P(0.0, -0.36, 0.1), P(0.0, -0.42, 0.17), P(0.0, -0.47, 0.25)], 8)
    band(hs, lead, trail, lambda t: 0.018 * (1 - t) + 0.002, (1, 0, 0), "blade", BLADE, ridge=0.4)
    # Rear glow.
    disc(hs, P(0.0, -0.402, 0.0), (0, -1, 0), 0.035, 6, "lamp", TEAL)
    return hs


POD_SOCKETS = {"nacre_pod_engine_0": (0.0, 0.0, -0.41)}


# ----------------------------------------------------------------------------
# nacre_pulsar: radial pulse organism (17 Oct 2026) that charges and releases a shockwave ring
# ----------------------------------------------------------------------------

def build_pulsar(rng):
    """A flattened radial organism: a faceted teal emitter heart in a black frame cage, a crown of eight
    iridescent petals with silver crescent blades between them, two concentric emitter rings with teal slits
    (they flare as it charges) and short trailing tendrils. Radially symmetric, so it reads from any side."""
    hs = HS(rng)
    verts, faces = icosahedron()
    framed_poly(hs, verts, faces, Matrix.Diagonal((0.17, 0.17, 0.15, 1.0)), 0.3, 0.022, "frame", FRAME, "lamp", TEAL)
    # Inner emitter ring (teal slits between black segments) and the outer bronze ring.
    for k in range(8):
        a0, a1 = 2 * math.pi * k / 8 + 0.05, 2 * math.pi * (k + 1) / 8 - 0.05
        arc_band(hs, 0.27, 0.06, 0.05, a0, a1, 3, "frame", FRAME, ch=0.01)
        am = (a0 + a1) / 2
        arc_band(hs, 0.27, 0.024, 0.012, am - 0.22, am + 0.22, 2, "lamp", TEAL, ch=0.0, m=xform((0, 0, 0.03)))
    for k in range(12):
        a0, a1 = 2 * math.pi * k / 12 + 0.04, 2 * math.pi * (k + 1) / 12 - 0.04
        arc_band(hs, 0.52, 0.07, 0.045, a0, a1, 3, "bronze" if k % 2 else "bronze_dk", BRONZE, ch=0.012, m=xform((0, 0, -0.01)))
    # Petal crown: iridescent shard plates radiating out over the rings.
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        d, n = Vector((math.cos(a), math.sin(a), 0.0)), Vector((-math.sin(a), math.cos(a), 0.0))
        base, tip = d * 0.22 + Vector((0, 0, 0.04)), d * 0.66 + Vector((0, 0, -0.02))
        mid = d * 0.42 + Vector((0, 0, 0.06))
        shard_plate(hs, [base + n * 0.03, mid + n * 0.1, tip, mid - n * 0.1, base - n * 0.03], 0.03, 0.01,
                    f"shell:{k % 4 + 1}", SHELL)
        glow_line(hs, [base + Vector((0, 0, 0.02)), mid + Vector((0, 0, 0.05)), lerp(mid, tip, 0.6) + Vector((0, 0, 0.02))],
                  [(0, 0, 1)] * 3, 0.012, 0.004, TEAL)
    # Silver crescent blades between the petals, curling outward to sharp tips.
    for k in range(8):
        a = 2 * math.pi * k / 8
        r = Matrix.Rotation(a, 4, "Z")
        o = [r @ P(0.3, 0.04, 0.0), r @ P(0.5, 0.1, 0.0), r @ P(0.7, 0.06, -0.01), r @ P(0.8, -0.06, -0.02)]
        i = [r @ P(0.32, -0.02, 0.0), r @ P(0.5, 0.0, 0.0), r @ P(0.66, -0.02, -0.01), r @ P(0.8, -0.06, -0.02)]
        crescent(hs, o, i, 7, lambda t: 0.016 * (1 - t) + 0.002, (0, 0, 1), "blade", BLADE)
    # Trailing tendrils beneath (they hang toward the ground).
    for k in range(6):
        a = 2 * math.pi * (k + 0.25) / 6
        d = Vector((math.cos(a), math.sin(a), 0.0))
        tube(hs, [d * 0.18 + Vector((0, 0, -0.05)), d * 0.28 + Vector((0, 0, -0.16)), d * 0.24 + Vector((0, 0, -0.27))],
             [0.022, 0.014, 0.0], "frame_dk", FRAME, seg=5, apex_end=True)
    return hs


PULSAR_SOCKETS = {"nacre_pulsar_core": (0.0, 0.0, 0.0)}


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

BUILDERS = {"nacre_shard": build_shard, "nacre_veil": build_veil_fighter, "nacre_orrery": build_orrery,
            "nacre_spore": build_spore, "nacre_pod": build_pod, "nacre_pulsar": build_pulsar}
RULES = {
    "nacre_shard": dict(budget=2500, foot=(0.86, 1.36), y_min=-0.2, y_max=0.25),
    "nacre_veil": dict(budget=2500, foot=(1.56, 1.56), y_min=-0.2, y_max=0.25),
    "nacre_orrery": dict(budget=2500, foot=(1.84, 1.76), y_min=-0.3, y_max=0.3),
    "nacre_spore": dict(budget=2500, foot=(1.16, 1.16), y_min_exact=-0.05, y_max=1.0),
    "nacre_pod": dict(budget=2500, foot=(0.8, 0.96), y_min=-0.2, y_max=0.3),
    "nacre_pulsar": dict(budget=2500, foot=(1.7, 1.7), y_min=-0.32, y_max=0.25),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="nacre_craft.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--only", default=None, help="comma-separated nodes (preview iteration; no publish)")
    ap.add_argument("--wip", action="store_true", help="skip publishing; previews get a -wip suffix")
    args = ap.parse_args(argv)
    args.wip = args.wip or bool(args.only)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = nf.make_materials()
    objs = {}
    sockets = {}
    names = list(BUILDERS) if not args.only else args.only.split(",")
    for name in names:
        hs = BUILDERS[name](random.Random(f"{SEED}:{name}"))
        nf.finish(hs)
        ground = -0.05 if name == "nacre_spore" else None
        cols = nf.bake(hs, name, ao_dist=0.22, ground=ground, scale=1.6)
        objs[name] = nf.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        print(f"CRAFT {name:16s} tris={hs.tris()}")
    sk = {"nacre_shard": SHARD_SOCKETS, "nacre_veil": VEIL_SOCKETS, "nacre_pod": POD_SOCKETS, "nacre_pulsar": PULSAR_SOCKETS}
    m_o = ring_matrix("X", ORRERY_RINGS[0][5])
    orr = {}
    for i, s in enumerate((-1, 1)):
        ang = math.atan2(0.62, s * 0.4)
        base = m_o @ Vector((math.cos(ang) * 0.735, math.sin(ang) * 0.735, 0.0))
        z = base.z + 0.06
        orr[f"nacre_orrery_muzzle_{i}"] = (round(s * 0.4, 4), round(z, 4), 0.87)
    orr["nacre_orrery_core"] = (0.0, 0.0, 0.0)
    sk["nacre_orrery"] = orr
    pitch = math.radians(20.0)
    tip = Vector((0.0, 0.1, 0.5)) + Vector((0.0, math.cos(pitch), math.sin(pitch))) * 0.46
    sk["nacre_spore"] = {"nacre_spore_muzzle_0": (0.0, round(tip.z, 4), round(tip.y, 4)),
                         "nacre_spore_core": (0.0, 0.55, 0.0)}
    for name in names:
        for sname, pos in sk[name].items():
            nf.make_socket(sname, objs[name], pos)
    spec_nodes = {}
    for name in names:
        r = dict(RULES[name])
        r["children"] = {k: tuple(v) for k, v in sk[name].items()}
        spec_nodes[name] = r
    used = sorted({mats[i].name for name in names for i in range(len(mats))
                   if mats[i].name in [m.name for m in objs[name].data.materials]})
    if not args.wip:
        nf.publish(args.glb, "nacre_craft.py", dict(materials=used, nodes=spec_nodes, max_bytes=2_000_000), "CRAFT")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        render_previews(objs, args)


LAYOUT = [("nacre_shard", -3.3, 0.0), ("nacre_veil", -1.5, 0.0), ("nacre_orrery", 0.55, 0.0),
          ("nacre_spore", 2.55, 0.0), ("nacre_pod", 4.1, 0.0), ("nacre_pulsar", 5.8, 0.0)]


def render_previews(objs, args):
    scene = bpy.context.scene
    pm = nf.preview_ground_materials()
    for o in list(scene.objects):
        o.hide_render = True
    keep = {o.name for o in scene.objects}
    sfx = "" if not args.wip else "-wip"
    # 1. Close-up board at the 55 degree game angle over dark slate.
    for name, x, y in LAYOUT:
        if name not in objs:
            continue
        z = 0.05 if name == "nacre_spore" else 0.55
        nf.place(objs[name], (x, y, z))
        kit.text_label(name, (x, y - 1.25, 0.012), 0.15, pm["label"])
    nf.flat_material  # noqa
    kit.plane_obj("pv_ground", -30, 30, -30, 30, 0.0, pm["slate"])
    nf.preview_lights()
    kit.add_ortho_camera((0.4, 0.0, 0.3), 55.0, 9.4)
    nf.setup_render(args.engine, args.samples, 2000, 1000)
    kit.render(os.path.join(args.preview_dir, f"preview-craft{sfx}.png"))
    kit.clear_preview(keep)
    # 2. Hero 3/4 views, one per craft.
    for name, _x, _y in LAYOUT:
        if name not in objs:
            continue
        z = 0.05 if name == "nacre_spore" else 0.55
        nf.place(objs[name], (0.0, 0.0, z))
        kit.plane_obj("pv_ground", -40, 40, -40, 40, 0.0, pm["slate"])
        nf.preview_lights()
        dist = 1.0 if name in ("nacre_shard", "nacre_pod") else (1.25 if name != "nacre_spore" else 1.15)
        nf.perspective_camera((1.6 * dist, -2.1 * dist, 1.55 * dist + z * 0.5), (0.0, 0.05, z * 0.85), lens=50.0)
        nf.setup_render(args.engine, args.samples, 900, 700)
        kit.render(os.path.join(args.preview_dir, f"preview-hero-{name.split('_')[1]}{sfx}.png"))
        kit.clear_preview(keep)
    if args.only:
        return
    # 3. Game camera: squadrons over the mire (12.5 units wide, portrait).
    flight = 3.8
    rng = random.Random(f"{SEED}:scene")
    for k, (x, y) in enumerate(((-2.5, 18.0), (-1.6, 19.0), (-3.4, 19.0))):
        nf.place(objs["nacre_shard"], (x, y, flight), name=f"g_sh{k}")
    for k, (x, y) in enumerate(((2.2, 15.5), (3.6, 16.6))):
        nf.place(objs["nacre_veil"], (x, y, flight), name=f"g_ve{k}")
    nf.place(objs["nacre_orrery"], (0.2, 21.5, flight), name="g_or")
    for k, (x, y) in enumerate(((-0.8, 11.0), (0.4, 10.4), (1.5, 11.2))):
        nf.place(objs["nacre_pod"], (x, y, flight), name=f"g_po{k}")
    kit.plane_obj("pv_mire", -20, 20, -10, 50, -1.2, pm["mire"])
    for k, y in enumerate((5.0, 13.0, 25.0)):
        kit.prism_obj(f"pv_isle{k}", [(-6.4, y - 1.2), (-3.0, y - 1.3), (-2.6, y + 1.3), (-6.2, y + 1.4)], -1.3, -0.95,
                      pm["slate"], pm["slate"])
        nf.place(objs["nacre_spore"], (-4.3 + rng.uniform(-0.4, 0.4), y, -0.95), name=f"g_sp{k}")
    nf.preview_lights()
    kit.add_ortho_camera((0.0, 13.0, 0.5), 55.0, 12.5 * 1600.0 / 900.0)
    nf.setup_render(args.engine, args.samples, 900, 1600)
    kit.render(os.path.join(args.preview_dir, f"preview-game{sfx}.png"))


if __name__ == "__main__":
    main()
