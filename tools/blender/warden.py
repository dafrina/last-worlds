"""WARDEN-1, Luna's small boss for Last Worlds (docs/19-luna-training.md section 2).

A decommissioned HUMAN lunar defence lander, clearly human-built: an octagonal white-grey deck with
panel seams and a yellow / black hazard band, four splayed landing legs with shock struts and
footpads (one carries a ladder), four descent engine bells, blue solar wings on a rear boom, an
antenna mast with a dish and a red beacon, orange fuel tanks, RCS thruster quads, handrails and
stencil marks. Two turret pods with twin barrels on outriggers (first targets) flank a command
module with a heat-glowing window band (core target) under two sliding roof hatches.

Conventions: glTF +Y up, 1 unit = 1 game unit, front toward +Z (toward the player). Base pivot on the
ground: the footpads' undersides are the lowest point (y = -0.05). Every node is top-level and its
translation is its socket.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/warden.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/luna/warden.glb)" \\
        --preview-dir "$(wslpath -w $R/art/warden)"
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
import vesper_common as vc  # noqa: E402
import nacre_fleet as nf  # noqa: E402
from nacre_fleet import HS, tube, arc_band, disc, merge_hs, xform, append, mirror_x, flipped, raw_face, lerp  # noqa: E402

SEED = "warden-1-v1"
HULL, FRAME, PAINT, SOLAR, GLOW = range(5)
MAT_NAMES = ("warden_hull", "warden_frame", "warden_paint", "warden_solar", "warden_glow")
GLOW_HEX = "#ff5a28"
TARGET_Y = 1.3
DY = -0.25                      # deck centre (design y = glTF z)
DECK_R = 2.0                    # octagon vertex radius
DECK_Z0, DECK_Z1 = 0.5, 0.8

PAINTS = {
    "white": ("#d7dadd", 0.35, "#f2f3f4"),
    "white_dk": ("#a6abb1", 0.35, "#cfd3d8"),
    "grey": ("#4a4f56", 0.45, "#808891"),
    "grey_dk": ("#2b2f34", 0.35, "#575e66"),
    "silver": ("#9aa3ad", 0.4, "#d4d9de"),
    "orange": ("#d8692a", 0.4, "#f0a070"),
    "hazard": ("#e8a91e", 0.3, "#f6d27a"),
    "black": ("#17181a", 0.2, "#3a3c40"),
    "solar": ("#21477e", 0.2, "#4a6a90"),
    "solar_lt": ("#2b5796", 0.2, "#5a7aa0"),
    "char": ("#1c1b1a", 0.25, "#3a3735"),
    "burnt": ("#3b3532", 0.3, "#5a524d"),
}
DUST = ("#8d8a84", 0.0, 0.7, 0.55)        # regolith dust near the ground

# Gameplay sockets (glTF: x, y up, z toward the player).
POD_L = (-2.1, TARGET_Y, 0.0)
POD_R = (2.1, TARGET_Y, 0.0)
CORE = (0.0, TARGET_Y, -0.9)
HATCH_0 = (-0.33, TARGET_Y, -0.9)
HATCH_1 = (0.33, TARGET_Y, -0.9)
SOCKETS = {
    "warden_hull": (0.0, 0.0, 0.0),
    "warden_pod_left": POD_L, "warden_pod_right": POD_R,
    "warden_pod_left_wreck": POD_L, "warden_pod_right_wreck": POD_R,
    "warden_core": CORE, "warden_core_wreck": CORE,
    "warden_core_hatch_0": HATCH_0, "warden_core_hatch_1": HATCH_1,
}
ENGINES = [(sx * 0.85, DY + sy * 0.78) for sy in (1, -1) for sx in (-1, 1)]
BEACON = (-1.12, 2.3, 0.82)
EMPTIES = {"warden_beacon": BEACON}
for i, (ex, ey) in enumerate(ENGINES):
    EMPTIES[f"warden_thruster_{i}"] = (ex, 0.14, ey)


def P(x, y, z):
    """Design space: x right, y forward (glTF +Z), z up (glTF +Y)."""
    return Vector((x, y, z))


def octagon(r, cx=0.0, cy=0.0, rot=math.pi / 8):
    return [(cx + math.cos(rot + k * math.pi / 4) * r, cy + math.sin(rot + k * math.pi / 4) * r) for k in range(8)]


def quad(hs, pts, paint, mat, tag="main"):
    """Append a quad / polygon wound so its normal follows the given order (counter-clockwise = facing you)."""
    raw_face(hs, tuple(hs.v(p) for p in pts), paint, tag, mat)


def stripe_band(hs, a, b, nrm, z0, z1, count, slant=0.35, off=0.006, paints=(("hazard", PAINT), ("black", FRAME))):
    """Slanted hazard stripes on a vertical face from a to b (2D points), facing nrm (2D outward)."""
    a, b = Vector((a[0], a[1], 0.0)), Vector((b[0], b[1], 0.0))
    o = Vector((nrm[0], nrm[1], 0.0)) * off
    for i in range(count):
        s0, s1 = i / count, (i + 1) / count
        t0, t1 = min(1.0, s0 + slant / count * 2), min(1.0, s1 + slant / count * 2)
        p00 = lerp(a, b, s0) + o + Vector((0, 0, z0))
        p10 = lerp(a, b, s1) + o + Vector((0, 0, z0))
        p11 = lerp(a, b, t1) + o + Vector((0, 0, z1))
        p01 = lerp(a, b, t0) + o + Vector((0, 0, z1))
        pts = [p00, p10, p11, p01]
        n = nf.newell(pts)
        if n.dot(Vector((nrm[0], nrm[1], 0.0))) < 0:
            pts.reverse()
        paint, mat = paints[i % 2]
        quad(hs, pts, paint, mat)


def box(hs, c, size, paint, mat, ch=0.02, bottom=True, rot=None):
    if rot is None:
        hs.box(tuple(c), tuple(size), ch, paint, mat, bottom=bottom)
    else:
        g = HS(hs.rng)
        g.box((0.0, 0.0, 0.0), tuple(size), ch, paint, mat, bottom=bottom)
        merge_hs(hs, g, xform(tuple(c), rot))


def rcs_quad(hs, c, facing):
    """RCS thruster quad: a small block with four nozzles (sideways, forward/back and up)."""
    f = Vector(facing).normalized()
    side = Vector((-f.y, f.x, 0.0))
    box(hs, c, (0.16, 0.16, 0.14), "white_dk", HULL, ch=0.015)
    for d in (side, -side, Vector((0, 0, 1)), f):
        p0 = c + d * 0.07
        tube(hs, [p0, p0 + d * 0.07], [0.022, 0.04], "grey_dk", FRAME, seg=6, cap0=False)


def rail(hs, pts, r=0.018):
    tube(hs, pts, r, "silver", FRAME, seg=4)
    for p in pts:
        tube(hs, [p - Vector((0, 0, 0.16)), p], r * 0.9, "silver", FRAME, seg=4)


# ----------------------------------------------------------------------------
# Static hull
# ----------------------------------------------------------------------------

def build_hull(rng):
    hs = HS(rng)
    oct_ = octagon(DECK_R, 0.0, DY)
    # --- Deck: white-grey octagon with raised plating and seams; dark lower frame ring.
    hs.prism(oct_, DECK_Z0, DECK_Z1, 0.05, "white", HULL, bottom=True)
    hs.prism(octagon(1.72, 0.0, DY), 0.26, DECK_Z0, 0.03, "grey", FRAME, bottom=True)
    for (cx, cy, w, d) in ((-0.95, 0.85, 1.1, 0.9), (0.95, 0.85, 1.1, 0.9), (-1.2, -0.25, 0.7, 1.2),
                           (1.2, -0.25, 0.7, 1.2), (0.0, 1.25, 0.66, 0.5)):
        box(hs, P(cx, DY + cy, DECK_Z1 + 0.012), (w, d, 0.024), "white_dk", HULL, ch=0.008)
    # stencil marks and a chevron
    for (cx, cy, w, d, paint, mat) in ((0.95, 1.12, 0.5, 0.08, "black", FRAME), (0.95, 0.98, 0.3, 0.05, "black", FRAME),
                                       (-0.7, 0.5, 0.4, 0.08, "orange", PAINT)):
        box(hs, P(cx, DY + cy, DECK_Z1 + 0.026), (w, d, 0.004), paint, mat, ch=0.0)
    for sx in (-1, 1):
        box(hs, P(sx * 0.12, DY + 1.42, DECK_Z1 + 0.026), (0.32, 0.07, 0.004), "hazard", PAINT, ch=0.0,
            rot=(0.0, 0.0, sx * 0.6))
    # --- Hazard band around the deck rim (slanted yellow / black stripes on every side).
    for k in range(8):
        a, b = oct_[k], oct_[(k + 1) % 8]
        mid = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5 - DY)
        ln = math.hypot(*mid)
        stripe_band(hs, a, b, (mid[0] / ln, mid[1] / ln), DECK_Z0 + 0.06, DECK_Z1 - 0.07, 9)
    # --- Descent engine bells under the deck (thruster sockets at their exits).
    for (ex, ey) in ENGINES:
        box(hs, P(ex, ey, 0.36), (0.36, 0.36, 0.12), "grey", FRAME, ch=0.02)
        hs.cyl((ex, ey, 0.3), (0, 0, -1), 0.11, 0.16, 10, 0.0, "grey_dk", FRAME, cap0=False, cap1=False, r1=0.2)
        disc(hs, P(ex, ey, 0.2), (0, 0, 1), 0.1, 8, "black", FRAME)
    # --- Four landing legs: shock strut, secondary braces, footpads (one leg carries a ladder).
    feet = []
    for k, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        top = P(sx * 1.25, DY + sy * 1.05, 0.42)
        foot = P(sx * 2.33, DY + sy * 1.9, 0.08)
        knee = lerp(top, foot, 0.45)
        tube(hs, [top, foot], 0.065, "grey", FRAME, seg=6)
        tube(hs, [top + (foot - top) * 0.08, knee], 0.095, "white", HULL, seg=8)           # shock sleeve
        tube(hs, [lerp(top, foot, 0.36), lerp(top, foot, 0.42)], 0.1, "orange", PAINT, seg=8)
        for (ax, ay) in ((sx * 1.72, DY + sy * 0.32), (sx * 0.5, DY + sy * 1.72)):        # braces from the deck sides
            a_ = P(ax, ay, 0.42)
            b_ = lerp(top, foot, 0.62)
            tube(hs, [a_, b_], 0.04, "grey", FRAME, seg=5)
        hs.cyl((foot.x, foot.y, -0.05), (0, 0, 1), 0.36, 0.12, 12, 0.02, "white_dk", HULL, r1=0.3)
        box(hs, P(foot.x, foot.y, 0.11), (0.14, 0.14, 0.1), "orange", PAINT, ch=0.015)
        feet.append(foot)
        if k == 1:                                                                         # ladder on the front-left leg
            d = (foot - top).normalized()
            side = d.cross(Vector((0, 0, 1))).normalized()
            for sgn in (-1, 1):
                tube(hs, [top + side * sgn * 0.13 + Vector((0, 0.06, 0)), lerp(top, foot, 0.9) + side * sgn * 0.13
                          + Vector((0, 0.06, 0))], 0.016, "silver", FRAME, seg=4)
            for i in range(6):
                c = lerp(top, foot, 0.12 + i * 0.13) + Vector((0, 0.06, 0))
                tube(hs, [c - side * 0.13, c + side * 0.13], 0.014, "silver", FRAME, seg=4)
    # --- Pod outriggers (sponsons) under the turret pods.
    for sx in (-1, 1):
        box(hs, P(sx * 2.07, 0.0, 0.64), (0.98, 0.98, 0.17), "grey", FRAME, ch=0.03)
        box(hs, P(sx * 2.07, 0.0, 0.735), (0.9, 0.9, 0.025), "white_dk", HULL, ch=0.008)
        stripe_band(hs, (sx * 2.565, -0.45 * sx), (sx * 2.565, 0.45 * sx), (sx, 0.0), 0.58, 0.7, 5, slant=0.4)
        tube(hs, [P(sx * 2.4, 0.0, 0.56), P(sx * 1.55, 0.0, 0.3)], 0.05, "grey", FRAME, seg=5)
        for sy in (-1, 1):
            tube(hs, [P(sx * 2.4, sy * 0.4, 0.57), P(sx * 1.7, sy * 0.55 + DY * 0.3, 0.4)], 0.035, "grey", FRAME, seg=5)
    # --- Solar wings on a rear boom, tilted toward the front; A-frame supports.
    boom_y, boom_z = -2.18, 1.52
    tube(hs, [P(-2.95, boom_y, boom_z), P(2.95, boom_y, boom_z)], 0.045, "grey", FRAME, seg=6)
    for sx in (-1, 1):
        for x in (0.45, 1.6):
            tube(hs, [P(sx * x, -1.62, DECK_Z1), P(sx * x, boom_y, boom_z)], 0.035, "grey", FRAME, seg=5)
        tube(hs, [P(sx * 0.45, -1.62, DECK_Z1), P(sx * 1.6, boom_y, boom_z)], 0.025, "grey", FRAME, seg=4)
        tilt = math.radians(28.0)
        panel = HS(rng)
        w, dpt = 2.35, 0.72
        panel.box((0.0, 0.0, -0.012), (w + 0.04, dpt + 0.04, 0.024), 0.0, "silver", FRAME, bottom=True)
        nu, nv = 6, 2
        for i in range(nu):
            for j in range(nv):
                cx = -w / 2 + (i + 0.5) * w / nu
                cy = -dpt / 2 + (j + 0.5) * dpt / nv
                panel.box((cx, cy, 0.003), (w / nu - 0.035, dpt / nv - 0.035, 0.008), 0.0,
                          "solar" if (i + j) % 2 else "solar_lt", SOLAR, bottom=False)
        merge_hs(hs, panel, xform((sx * (0.55 + w / 2), boom_y + 0.02, boom_z + 0.02), (tilt, 0.0, 0.0)))
        box(hs, P(sx * 0.42, boom_y, boom_z), (0.14, 0.14, 0.14), "white_dk", HULL, ch=0.02)            # drive hub
    # --- Antenna mast with a dish and a beacon (beacon socket at the top).
    bx, bz, by = BEACON[0], BEACON[1], BEACON[2]
    tube(hs, [P(bx, by, DECK_Z1), P(bx, by, bz - 0.1)], [0.05, 0.035], "silver", FRAME, seg=6)
    hs.cyl((bx, by, bz - 0.12), (0, 0, 1), 0.05, 0.06, 8, 0.0, "grey", FRAME)
    hs.cyl((bx, by, bz - 0.06), (0, 0, 1), 0.04, 0.07, 8, 0.0, "lamp", GLOW, cap0=False)
    dish = HS(rng)
    dish.cyl((0.0, 0.0, 0.0), (0, 0, -1), 0.4, 0.14, 16, 0.0, "white", HULL, cap0=True, cap1=True, r1=0.06)
    tube(dish, [P(0, 0, 0.0), P(0, 0, 0.3)], 0.012, "silver", FRAME, seg=4)
    dish.cyl((0.0, 0.0, 0.3), (0, 0, 1), 0.035, 0.05, 6, 0.0, "grey", FRAME)
    merge_hs(dish, HS(rng), Matrix.Identity(4))
    merge_hs(hs, dish, xform((bx, by, 1.75), (math.radians(-35.0), 0.0, math.radians(20.0))))
    tube(hs, [P(bx, by, 1.6), P(bx + 0.02, by + 0.05, 1.72)], 0.03, "grey", FRAME, seg=5)
    # --- Orange fuel tanks on cradles at the rear deck corners.
    for sx in (-1, 1):
        x = sx * 1.27
        ys = [-1.12, -1.18, -1.32, -1.78, -1.92, -1.98]
        tube(hs, [P(x, y, 1.05) for y in ys], [0.08, 0.17, 0.235, 0.235, 0.17, 0.08], "orange", PAINT, seg=12,
             tags="smooth")
        for y in (-1.4, -1.7):
            tube(hs, [P(x, y - 0.025, 1.05), P(x, y + 0.025, 1.05)], 0.245, "white", HULL, seg=12)
            box(hs, P(x, y, 0.86), (0.36, 0.1, 0.12), "grey", FRAME, ch=0.015)
        box(hs, P(x, -1.55, 1.27), (0.08, 0.06, 0.04), "black", FRAME, ch=0.0)
    # --- Forward instrument pod: a camera turret, indicator lights, a bumper with hazard stripes.
    box(hs, P(0.0, DY + 1.55, 0.93), (0.62, 0.36, 0.26), "white", HULL, ch=0.03)
    hs.cyl((0.0, DY + 1.73, 0.95), (0, 1, 0), 0.085, 0.1, 10, 0.012, "grey_dk", FRAME)
    disc(hs, P(0.0, DY + 1.832, 0.95), (0, 1, 0), 0.06, 10, "black", FRAME)
    for sx in (-1, 1):
        box(hs, P(sx * 0.24, DY + 1.735, 1.02), (0.06, 0.02, 0.04), "lamp", GLOW, ch=0.0)
    # --- RCS quads on the deck corners, handrails along the front rim.
    for k in (1, 2, 5, 6):
        if True:
            ang = math.pi / 8 + k * math.pi / 4
            c = P(math.cos(ang) * (DECK_R - 0.12), DY + math.sin(ang) * (DECK_R - 0.12), DECK_Z1 + 0.07)
            rcs_quad(hs, c, (math.cos(ang), math.sin(ang), 0.0))
    for sx in (-1, 1):
        a_ = octagon(DECK_R - 0.2, 0.0, DY)[1 if sx > 0 else 2]
        b_ = octagon(DECK_R - 0.2, 0.0, DY)[0 if sx > 0 else 3]
        rail(hs, [P(a_[0] * 0.75 + b_[0] * 0.25, a_[1] * 0.75 + b_[1] * 0.25, DECK_Z1 + 0.18),
                  P(a_[0] * 0.42 + b_[0] * 0.58, a_[1] * 0.42 + b_[1] * 0.58, DECK_Z1 + 0.18)])
    # --- Command-module seat: a raised grey ring on the deck under the core.
    arc_band(hs, 1.07, 0.16, 0.06, 0.0, 2 * math.pi, 16, "grey", FRAME, ch=0.015,
             m=Matrix.Translation(P(0.0, -0.9, DECK_Z1 + 0.03)))
    return hs


# ----------------------------------------------------------------------------
# Command module (core), hatches, wreck
# ----------------------------------------------------------------------------

CX, CY = 0.0, -0.9
DRUM_R = 1.0
DRUM_Z0, DRUM_Z1 = DECK_Z1 + 0.06, 1.22
ROOF_Z = 1.28


def build_core(rng):
    hs = HS(rng)
    seg = 16
    hs.cyl((CX, CY, DRUM_Z0), (0, 0, 1), DRUM_R, DRUM_Z1 - DRUM_Z0, seg, 0.03, "white", HULL, cap0=False, cap1=False,
           rot=math.pi / seg, smooth=False)
    # orange band at the base and a dark roof ring with the hatch well
    arc_band(hs, DRUM_R + 0.01, 0.04, 0.07, 0.0, 2 * math.pi, seg, "orange", PAINT, ch=0.0,
             m=Matrix.Translation(P(CX, CY, DRUM_Z0 + 0.06)))
    arc_band(hs, 0.81, 0.4, 0.06, 0.0, 2 * math.pi, seg, "grey", FRAME, ch=0.015,
             m=Matrix.Translation(P(CX, CY, ROOF_Z - 0.03)))
    well = HS(rng)
    tube(well, [P(CX, CY, ROOF_Z + 0.001), P(CX, CY, ROOF_Z - 0.16)], 0.61, "grey_dk", FRAME, seg=seg, cap0=False,
         cap1=False)
    append(hs, flipped(well))
    disc(hs, P(CX, CY, ROOF_Z - 0.16), (0, 0, 1), 0.55, seg, "lamp", GLOW)                 # exposed reactor glow
    for k in range(6):                                                                      # reactor grille
        a = k * math.pi / 6
        d = Vector((math.cos(a), math.sin(a), 0.0))
        tube(hs, [P(CX, CY, ROOF_Z - 0.13) - d * 0.55, P(CX, CY, ROOF_Z - 0.13) + d * 0.55], 0.02, "grey_dk", FRAME,
             seg=4)
    # heat-glow window band: 16 panes between white mullions
    zw0, zw1 = 1.0, 1.13
    for k in range(seg):
        a0 = math.pi / seg + 2 * math.pi * k / seg
        a1 = a0 + 2 * math.pi / seg
        ap = (a0 + a1) * 0.5
        hw = (a1 - a0) * 0.33
        r = DRUM_R * math.cos(math.pi / seg) + 0.006
        pts = []
        for (a, z) in ((ap - hw, zw0), (ap + hw, zw0), (ap + hw, zw1), (ap - hw, zw1)):
            # point on the facet plane at angle a
            t = math.tan(a - ap) * r
            fx, fy = math.cos(ap), math.sin(ap)
            pts.append(P(CX + fx * r - fy * t, CY + fy * r + fx * t, z))
        quad(hs, pts, "lamp", GLOW)
        # dark frame lip under each pane
        if k % 4 == 0:
            c = P(CX + math.cos(ap) * (r + 0.02), CY + math.sin(ap) * (r + 0.02), 0.92)
            box(hs, c, (0.18, 0.06, 0.08), "grey", FRAME, ch=0.01, rot=(0.0, 0.0, ap + math.pi / 2))
    # vertical panel seams below the band, RCS quads and handrails on the roof
    for k in range(8):
        ap = math.pi / seg + 2 * math.pi * (2 * k) / seg
        r = DRUM_R * math.cos(math.pi / seg) + 0.004
        c = P(CX + math.cos(ap) * r, CY + math.sin(ap) * r, 0.92)
        box(hs, c, (0.012, 0.02, 0.12), "grey_dk", FRAME, ch=0.0, rot=(0.0, 0.0, ap))
    for k, ap in enumerate((0.0, math.pi / 2, math.pi, 3 * math.pi / 2)):
        if k == 3:
            continue
        c = P(CX + math.cos(ap) * (DRUM_R + 0.07), CY + math.sin(ap) * (DRUM_R + 0.07), 0.93)
        rcs_quad(hs, c, (math.cos(ap), math.sin(ap), 0.0))
    # hatch rails across the roof
    for sy in (-1, 1):
        box(hs, P(CX, CY + sy * 0.68, ROOF_Z + 0.012), (2.1, 0.06, 0.024), "silver", FRAME, ch=0.006)
    # stencil and a docking target on the front
    box(hs, P(CX, CY + DRUM_R * math.cos(math.pi / seg) + 0.006, 0.9), (0.34, 0.006, 0.06), "black", FRAME, ch=0.0)
    return hs


def build_hatch(side, rng):
    hs = HS(rng)
    cx = side * 0.33
    z = ROOF_Z + 0.06
    box(hs, P(cx, CY, z), (0.64, 1.28, 0.06), "white", HULL, ch=0.02)
    for dy in (-0.4, 0.0, 0.4):
        box(hs, P(cx + side * 0.06, CY + dy, z + 0.035), (0.42, 0.06, 0.014), "white_dk", HULL, ch=0.004)
    # hazard stripes along the meeting seam (top face), handle bar on the outer half
    stripe = HS(rng)
    n = 7
    for i in range(n):
        y0 = -0.62 + 1.24 * i / n
        y1 = -0.62 + 1.24 * (i + 1) / n
        paint, mat = (("hazard", PAINT), ("black", FRAME))[i % 2]
        pts = [P(0.0, y0, 0.0), P(0.0, y1, 0.0), P(side * 0.11, y1 + 0.08, 0.0), P(side * 0.11, y0 + 0.08, 0.0)]
        if nf.newell(pts).z < 0:
            pts.reverse()
        pts = [Vector((min(max(p.x, -0.11), 0.11), min(max(p.y, -0.62), 0.62), p.z)) for p in pts]
        quad(stripe, pts, paint, mat)
    merge_hs(hs, stripe, xform((side * 0.012, CY, z + 0.031)))
    tube(hs, [P(cx + side * 0.18, CY - 0.2, z + 0.03), P(cx + side * 0.18, CY - 0.2, z + 0.08),
              P(cx + side * 0.18, CY + 0.2, z + 0.08), P(cx + side * 0.18, CY + 0.2, z + 0.03)], 0.015, "silver",
         FRAME, seg=4)
    return hs


def build_core_wreck(rng):
    hs = HS(rng)
    hs.cyl((CX, CY, DRUM_Z0), (0, 0, 1), DRUM_R, 0.16, 16, 0.02, "char", HULL, cap0=False, cap1=True,
           rot=math.pi / 16, smooth=False)
    # torn wall plates leaning outward, a dark window band, a tossed roof segment and embers
    for k in range(11):
        a = 2 * math.pi * k / 11 + rng.uniform(-0.1, 0.1)
        d = Vector((math.cos(a), math.sin(a), 0.0))
        tvec = Vector((-d.y, d.x, 0.0))
        base = P(CX, CY, DRUM_Z0 + 0.14) + d * (DRUM_R - 0.02)
        hgt = rng.uniform(0.12, 0.34)
        lean = rng.uniform(0.25, 0.7)
        top = base + d * (hgt * math.sin(lean)) + Vector((0, 0, hgt * math.cos(lean)))
        wdt = rng.uniform(0.18, 0.26)
        pts = [base - tvec * wdt, base + tvec * wdt, top + tvec * wdt * rng.uniform(0.3, 0.8),
               top - tvec * wdt * rng.uniform(0.2, 0.9)]
        if nf.newell(pts).dot(d) < 0:
            pts.reverse()
        quad(hs, pts, rng.choice(("burnt", "char", "white_dk")), HULL)
        quad(hs, list(reversed([p - d * 0.03 for p in pts])), "char", HULL)
    box(hs, P(CX + 0.75, CY + 0.55, 1.12), (0.7, 0.5, 0.05), "burnt", HULL, ch=0.01, rot=(0.5, -0.4, 0.6))
    box(hs, P(CX - 0.3, CY - 0.2, 1.06), (0.5, 0.36, 0.06), "char", HULL, ch=0.01, rot=(-0.3, 0.5, 0.2))
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        disc(hs, P(CX + math.cos(a) * 0.45, CY + math.sin(a) * 0.45, DRUM_Z0 + 0.165), (0, 0, 1), 0.09, 6, "lamp",
             GLOW)
    hs.scorch = [((CX, CY, 1.1), 1.6)]
    return hs


# ----------------------------------------------------------------------------
# Turret pods
# ----------------------------------------------------------------------------

def build_pod(side, rng, wreck=False):
    hs = HS(rng)
    cx, cy = side * 2.1, 0.0
    hs.cyl((cx, cy, 0.745), (0, 0, 1), 0.24, 0.14, 8, 0.02, "char" if wreck else "grey", FRAME, cap0=False)
    if wreck:
        hs.cyl((cx, cy, 0.88), (0, 0, 1), 0.33, 0.05, 10, 0.0, "char", FRAME, cap0=False)
        t = HS(rng)
        t.box((0.0, -0.05, 0.0), (0.88, 0.8, 0.32), 0.04, "burnt", HULL, bottom=True)
        t.box((0.0, -0.05, 0.08), (0.9, 0.82, 0.05), 0.0, "char", PAINT, bottom=True)
        tube(t, [P(-0.17, 0.38, 0.0), P(-0.17, 0.75, -0.02), P(-0.1, 1.0, -0.22)], 0.05, "char", FRAME, seg=6)
        tube(t, [P(0.17, 0.38, 0.0), P(0.17, 0.62, 0.0)], 0.05, "char", FRAME, seg=6)
        merge_hs(hs, t, xform((cx + side * 0.08, cy - 0.04, 1.03), (0.32, -side * 0.38, side * 0.25)))
        for _k in range(4):
            box(hs, P(cx + rng.uniform(-0.45, 0.45), cy + rng.uniform(-0.45, 0.45), 0.77), (rng.uniform(0.1, 0.22),
                rng.uniform(0.08, 0.18), 0.025), "char", HULL, ch=0.0,
                rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, math.pi)))
        for (dx, dy) in ((0.15, -0.2), (-0.2, 0.1)):
            disc(hs, P(cx + dx, cy + dy, 0.9), (0, 0, 1), 0.06, 6, "lamp", GLOW)
        hs.scorch = [((cx, cy, 1.0), 0.9)]
        return hs
    hs.cyl((cx, cy, 0.885), (0, 0, 1), 0.34, 0.06, 12, 0.012, "grey_dk", FRAME, cap0=False)
    # armoured turret box with a sloped mantlet, orange band and a heat vent (glow slats)
    box(hs, P(cx, cy - 0.06, 1.12), (0.88, 0.8, 0.34), "white", HULL, ch=0.04)
    box(hs, P(cx, cy - 0.06, 1.2), (0.9, 0.82, 0.055), "orange", PAINT, ch=0.0, bottom=True)
    m = HS(rng)
    m.prism([(-0.3, 0.0), (0.3, 0.0), (0.3, 0.16), (-0.3, 0.16)], -0.13, 0.13, 0.02, "grey", FRAME, bottom=True)
    merge_hs(hs, m, xform((cx, cy + 0.34, 1.1), (math.radians(-90.0), 0.0, 0.0)) @ Matrix.Rotation(math.pi, 4, "X"))
    box(hs, P(cx, cy - 0.1, 1.3), (0.44, 0.38, 0.03), "grey_dk", FRAME, ch=0.006)
    for i in range(4):
        box(hs, P(cx, cy - 0.23 + i * 0.087, 1.316), (0.36, 0.04, 0.008), "lamp", GLOW, ch=0.0)
    # twin barrels toward +Z with shrouds and muzzle brakes
    for bx in (-0.17, 0.17):
        hs.cyl((cx + bx, cy + 0.44, 1.11), (0, 1, 0), 0.075, 0.24, 8, 0.012, "grey", FRAME)
        hs.cyl((cx + bx, cy + 0.68, 1.11), (0, 1, 0), 0.048, 0.5, 8, 0.0, "grey_dk", FRAME, cap0=False)
        hs.cyl((cx + bx, cy + 1.12, 1.11), (0, 1, 0), 0.068, 0.1, 8, 0.012, "grey", FRAME)
        disc(hs, P(cx + bx, cy + 1.221, 1.11), (0, 1, 0), 0.032, 8, "black", FRAME)
    # sensor box on the outer flank, a whip antenna, a cable to the pylon
    box(hs, P(cx + side * 0.5, cy + 0.12, 1.14), (0.12, 0.26, 0.16), "white_dk", HULL, ch=0.015)
    disc(hs, P(cx + side * 0.5, cy + 0.252, 1.15), (0, 1, 0), 0.045, 8, "black", FRAME)
    tube(hs, [P(cx - side * 0.3, cy - 0.32, 1.29), P(cx - side * 0.32, cy - 0.36, 1.62)], [0.012, 0.006], "silver", FRAME,
         seg=4)
    tube(hs, [P(cx - side * 0.2, cy - 0.46, 1.0), P(cx - side * 0.24, cy - 0.38, 0.86)], 0.03, "grey_dk", FRAME, seg=5)
    return hs


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def node_rules():
    rules = {}
    for name, t in SOCKETS.items():
        rules[name] = dict(t=t, x=(-3.0, 3.0), z=(-2.6, 2.6), y_max=2.5, y_min=-0.05)
    rules["warden_hull"]["y_min_exact"] = -0.05
    for name, t in EMPTIES.items():
        rules[name] = dict(t=t, empty=True)
    return rules


def make_materials():
    return [vc.make_material("warden_hull", "vc", rough=0.5, metal=0.25),
            vc.make_material("warden_frame", "vc", rough=0.55, metal=0.5),
            vc.make_material("warden_paint", "vc", rough=0.55, metal=0.15),
            vc.make_material("warden_solar", "vc", rough=0.22, metal=0.55),
            vc.make_material("warden_glow", "glow", colour=GLOW_HEX)]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="warden.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--wip", action="store_true")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()

    def r(tag):
        return random.Random(f"{SEED}:{tag}")
    pieces = {"warden_hull": build_hull(r("hull"))}
    for side, nm in ((-1, "left"), (1, "right")):
        pieces[f"warden_pod_{nm}"] = build_pod(side, r(f"pod{nm}"))
        pieces[f"warden_pod_{nm}_wreck"] = build_pod(side, r(f"podwreck{nm}"), wreck=True)
    pieces["warden_core"] = build_core(r("core"))
    pieces["warden_core_hatch_0"] = build_hatch(-1, r("hatch0"))
    pieces["warden_core_hatch_1"] = build_hatch(1, r("hatch1"))
    pieces["warden_core_wreck"] = build_core_wreck(r("corewreck"))
    for hs in pieces.values():
        nf.finish(hs)
    total = sum(hs.tris() for hs in pieces.values())
    for name, hs in pieces.items():
        print(f"WARDEN {name:24s} tris={hs.tris()}")
    print(f"WARDEN total triangles {total}")
    static = ["warden_hull", "warden_pod_left", "warden_pod_right", "warden_core"]
    objs = {}
    for name, hs in pieces.items():
        context = [([Vector(v) for v in pieces[c].verts], pieces[c].faces) for c in static if c != name]
        cols = nf.bake(hs, name, glow={GLOW}, ao_dist=0.45, ground=-0.05, context=context, paints=PAINTS, dust=DUST)
        objs[name] = nf.make_object(name, hs, mats, SOCKETS[name], cols)
    for name, t in EMPTIES.items():
        nf.make_socket(name, None, t)
    used = sorted({m.name for o in objs.values() for m in o.data.materials})
    if not args.wip:
        nf.publish(args.glb, "warden.py", dict(materials=used, nodes=node_rules(), total=(0, 14000),
                                               max_bytes=2_000_000), "WARDEN")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        render_previews(objs, args)


LIVE = ["warden_hull", "warden_pod_left", "warden_pod_right", "warden_core", "warden_core_hatch_0",
        "warden_core_hatch_1"]
EXPOSED = ["warden_hull", "warden_pod_left_wreck", "warden_pod_right_wreck", "warden_core", "warden_core_hatch_0",
           "warden_core_hatch_1"]
DESTROYED = ["warden_hull", "warden_pod_left_wreck", "warden_pod_right_wreck", "warden_core_wreck"]


def place_set(objs, names, offset, hatch_open=0.0):
    for name in names:
        src = objs[name]
        o = bpy.data.objects.new(f"p_{name}", src.data)
        extra = Vector((0, 0, 0))
        if name == "warden_core_hatch_0":
            extra = Vector((-hatch_open, 0, 0))
        elif name == "warden_core_hatch_1":
            extra = Vector((hatch_open, 0, 0))
        o.location = Vector(src.location) + Vector(offset) + extra
        bpy.context.scene.collection.objects.link(o)


def luna_world():
    kit.add_sun((0.5, 0.6, -0.62), strength=4.2, color=(1.0, 0.98, 0.95), angle_deg=1.0)
    kit.add_sun((-0.4, -0.6, -0.4), strength=0.6, color=(0.7, 0.78, 0.9), angle_deg=8.0)
    kit.setup_world(bpy.context.scene, (0.06, 0.07, 0.09), 1.0)


def render_previews(objs, args):
    scene = bpy.context.scene
    regolith = vc.noise_material("pv_regolith", "#5b5955", "#7d7a74", 1.3, 0.95, bump=0.15)
    for o in list(scene.objects):
        o.hide_render = True
    keep = {o.name for o in scene.objects}
    sfx = "-wip" if args.wip else ""
    shots = [("preview-warden", LIVE, 0.0), ("preview-warden-exposed", EXPOSED, 0.82),
             ("preview-warden-destroyed", DESTROYED, 0.0)]
    for fname, names, hatch in shots:
        place_set(objs, names, (0.0, 6.0, 0.0), hatch)
        kit.plane_obj("pv_ground", -40, 40, -30, 50, -0.02, regolith)
        luna_world()
        kit.add_ortho_camera((0.0, 5.0, 0.8), 55.0, 12.5 * 1600.0 / 900.0)
        nf.setup_render(args.engine, args.samples, 900, 1600)
        kit.render(os.path.join(args.preview_dir, f"{fname}{sfx}.png"))
        kit.clear_preview(keep)
    # close-up at the game angle and a 3/4 hero view
    place_set(objs, LIVE, (0.0, 0.0, 0.0))
    kit.plane_obj("pv_ground", -40, 40, -40, 40, -0.02, regolith)
    luna_world()
    kit.add_ortho_camera((0.0, -0.2, 0.9), 55.0, 7.6)
    nf.setup_render(args.engine, args.samples, 1500, 1000)
    kit.render(os.path.join(args.preview_dir, f"preview-warden-close{sfx}.png"))
    kit.clear_preview(keep)
    place_set(objs, LIVE, (0.0, 0.0, 0.0))
    kit.plane_obj("pv_ground", -40, 40, -40, 40, -0.02, regolith)
    luna_world()
    nf.perspective_camera((6.2, -7.4, 4.6), (0.0, -0.2, 0.8), lens=40.0)
    nf.setup_render(args.engine, args.samples, 1600, 1000)
    kit.render(os.path.join(args.preview_dir, f"preview-warden-hero{sfx}.png"))
    kit.clear_preview(keep)


if __name__ == "__main__":
    main()
