"""Helion Ark, the Vesper sea-carrier boss for Last Worlds (docs/17 section 5).

A long armoured carrier riding on the water: black ceramic hull with pale ceramic armour,
outrigger sponsons carrying two radiator weapon housings (targets), radiator wing panels
(scenery), a stepped superstructure behind a glowing bridge (core target), deck launch bays
with sliding doors, wrecked radiator variants, bridge shutters and a stern wake anchor.

Conventions: glTF +Y up, 1 unit = 1 game unit, front (bow) toward +Z. y = 0 is the
WATERLINE: the hull continues below it to the keel. Every node's translation is its socket.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/helion_ark.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/vesper/helion-ark.glb)" \\
        --preview-dir "$(wslpath -w $R/art/vesper-ark)"
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

import khepri_kit as kit  # noqa: E402
import vesper_common as vc  # noqa: E402
from vesper_common import HS, merge_hs, xform, strut, loft, glow_box, loft_y, B  # noqa: E402

SEED = "helion-ark-v1"
ARMOR, TRIM, GLOW = 0, 1, 2
MAT_NAMES = ("ark_armor", "ark_trim", "ark_glow")
DECK = 1.0
KEEL = -0.45
TOP_MAX = 3.2

SOCKETS = {
    "ark_hull": (0.0, 0.0, 0.0),
    "ark_radiator_left": (-2.4, 1.6, 0.5),
    "ark_radiator_right": (2.4, 1.6, 0.5),
    "ark_radiator_left_wreck": (-2.4, 1.6, 0.5),
    "ark_radiator_right_wreck": (2.4, 1.6, 0.5),
    "ark_bridge": (0.0, 1.6, -1.6),
    "ark_bridge_shutter_a": (-0.47, 1.712, -1.242),
    "ark_bridge_shutter_b": (0.47, 1.712, -1.242),
    "ark_bay_left": (-0.75, 1.0, 2.0),
    "ark_bay_right": (0.75, 1.0, 2.0),
    "ark_bay_left_door": (-0.75, 1.06, 2.0),
    "ark_bay_right_door": (0.75, 1.06, 2.0),
    "ark_wake_anchor": (0.0, 0.0, -7.45),
}
DEFAULT_STATE = ["ark_hull", "ark_radiator_left", "ark_radiator_right", "ark_bridge", "ark_bridge_shutter_a",
                 "ark_bridge_shutter_b", "ark_bay_left", "ark_bay_right", "ark_bay_left_door", "ark_bay_right_door"]
EXPOSED_STATE = ["ark_hull", "ark_radiator_left_wreck", "ark_radiator_right_wreck", "ark_bridge",
                 "ark_bridge_shutter_a", "ark_bridge_shutter_b", "ark_bay_left", "ark_bay_right",
                 "ark_bay_left_door", "ark_bay_right_door"]

# Revision 2 (15 October): a long armoured warship, 7.6 wide x 12 long, bow +Z (Blender -y).
# Hull cross-section (x, z) as a fraction of the waterline half-beam: tumblehome topsides (the deck
# is narrower than the waterline, so the sloped sides face the 55 degree camera), a vertical armour
# belt at the waterline, chined bilge and keel.
HULL_PROFILE = [(0.8, DECK), (-0.8, DECK), (-1.0, 0.36), (-1.0, -0.02), (-0.6, -0.32), (-0.22, KEEL), (0.22, KEEL),
                (0.6, -0.32), (1.0, -0.02), (1.0, 0.36)]
HULL_STATIONS = [(-4.4, 0.0), (-4.15, 0.26), (-3.9, 0.5), (-3.5, 0.84), (-3.1, 1.15), (-2.75, 1.4), (-2.4, 1.6),
                 (-1.6, 1.75), (2.0, 1.75), (5.5, 1.75), (6.6, 1.6), (7.45, 1.4)]
BOW_APEX_Z = 0.82


def half_beam(y):
    """Waterline half-beam of the hull at Blender y (linear between stations)."""
    st = HULL_STATIONS
    if y <= st[0][0]:
        return 0.0
    for (y0, b0), (y1, b1) in zip(st, st[1:]):
        if y0 <= y <= y1:
            return b0 + (b1 - b0) * (y - y0) / (y1 - y0)
    return st[-1][1]


def hull_loft(hs, paint):
    secs = []
    for y, hb in HULL_STATIONS:
        if hb == 0.0:
            secs.append((y, 0.0, 0.0, 0.0, BOW_APEX_Z))
        else:
            secs.append((y, hb, 1.0, 0.0, 0.0))
    loft_y(hs, secs, HULL_PROFILE, paint, ARMOR)


def trapezoid_block(hs, y0, y1, hw_bottom, hw_top, z0, z1, paint, mat=ARMOR):
    """Superstructure tier with tumblehome sides (the sides lean in, so they face the camera)."""
    cz = (z0 + z1) * 0.5
    h = (z1 - z0) * 0.5
    prof = [(hw_top, h), (-hw_top, h), (-hw_bottom, -h), (hw_bottom, -h)]
    loft_y(hs, [(y0, 1.0, 1.0, 0.0, cz), (y1, 1.0, 1.0, 0.0, cz)], prof, paint, mat)


def slot(hs, p, size, normal_xz):
    """Glowing vent slot lying on a sloped side face with outward normal (nx, nz)."""
    nx, nz = normal_xz
    ang = math.atan2(nx, nz)                     # rotate local +z onto the face normal (about y)
    glow_box(hs, p, size, GLOW, rot=(0.0, ang, 0.0))


def side_normal(hw_bottom, hw_top, height):
    dx = hw_bottom - hw_top
    ln = math.hypot(dx, height)
    return height / ln, dx / ln                   # (nx, nz) for the +x side


def twin_turret(hs, rng, x, y, z, yaw, scale=1.0):
    t = HS(rng)
    t.cyl((0.0, 0.0, 0.0), (0, 0, 1), 0.3 * scale, 0.08, 18, 0.015, "steel", ARMOR, cap0=False)
    t.box((0.0, 0.05 * scale, 0.19 * scale), (0.52 * scale, 0.6 * scale, 0.24 * scale), 0.05, "ceramic", ARMOR)
    t.box((0.0, -0.27 * scale, 0.2 * scale), (0.4 * scale, 0.08 * scale, 0.18 * scale), 0.02, "pale", TRIM)
    for bx in (-0.1, 0.1):
        t.cyl((bx * scale, -0.3 * scale, 0.21 * scale), (0, -1, 0.05), 0.04 * scale, 0.62 * scale, 8, 0.0,
              "ceramic_dk", ARMOR, cap0=False, cap1=False, smooth=False)
        t.cyl((bx * scale, -0.92 * scale, 0.24 * scale), (0, -1, 0.05), 0.052 * scale, 0.08 * scale, 8, 0.0,
              "steel", ARMOR, cap0=False)
    glow_box(t, (0.0, 0.36 * scale, 0.22 * scale), (0.3 * scale, 0.012, 0.05 * scale), GLOW)
    merge_hs(hs, t, xform((x, y, z), (0.0, 0.0, yaw)))


def build_hull(rng):
    hs = HS(rng)
    hull_loft(hs, "ceramic")
    # --- Armour belt at the waterline: thick segmented plates with a top ledge (casts a shadow line).
    for sx in (-1, 1):
        y = -2.9
        k = 0
        while y < 7.2:
            ln = min(1.05, 7.3 - y)
            yc = y + ln / 2
            hb = half_beam(yc)
            paint, mat = ("pale", TRIM) if k % 3 == 1 else ("ceramic_grey", ARMOR)
            hs.box((sx * (hb + 0.06), yc, 0.17), (0.14, ln - 0.06, 0.44), 0.025, paint, mat)
            y += ln
            k += 1
    # --- Vent slot rows on the tumblehome topsides (tall orange slots, like the concept).
    for sx in (-1, 1):
        for k in range(16):
            y = -2.2 + k * 0.52
            hb = half_beam(y)
            nx, nz = side_normal(hb, hb * 0.8, DECK - 0.36)
            xs = hb * 0.9 + 0.012 * nx
            slot(hs, (sx * xs, y, 0.68), (0.42, 0.09, 0.012), (sx * nx, nz))
    # --- Sharp angular bow: chined pale armour planes along both bow facets and a raked stem plate.
    for sx in (-1, 1):
        for (y0, y1) in ((-4.15, -3.35), (-3.3, -2.5)):
            yc = (y0 + y1) * 0.5
            hb0, hb1 = half_beam(y0), half_beam(y1)
            a = math.atan2(hb1 - hb0, y1 - y0)
            pl = HS(rng)
            pl.box((0.0, 0.0, 0.0), (0.06, (y1 - y0) / math.cos(a) - 0.04, 0.5), 0.015, "pale", TRIM)
            merge_hs(hs, pl, xform((sx * (half_beam(yc) * 0.92 + 0.03), yc, 0.62), (0.0, sx * -0.2, sx * -a)))
        slot(hs, (sx * (half_beam(-3.0) * 0.92 + 0.07), -3.0, 0.9), (0.05, 0.5, 0.012), (sx * 1.0, 0.0))
    hs.box((0.0, -4.0, DECK - 0.04), (0.42, 0.7, 0.1), 0.02, "ceramic_dk", ARMOR)      # stem cap
    # --- Forecastle: bow turret on a raised barbette, bow missile cells.
    hs.cyl((0.0, -3.15, DECK - 0.02), (0, 0, 1), 0.42, 0.14, 14, 0.02, "ceramic_grey", ARMOR, cap0=False)
    twin_turret(hs, rng, 0.0, -3.15, DECK + 0.12, 0.0, 1.1)
    hs.box((0.0, -2.62, DECK + 0.05), (0.7, 0.3, 0.1), 0.02, "ceramic_dk", ARMOR)
    for i in range(5):
        hs.box((-0.24 + i * 0.12, -2.62, DECK + 0.103), (0.09, 0.22, 0.01), 0.0, "pale", TRIM, bottom=True)
    # --- Armoured flight-deck section around the launch bays: overhanging deck edges with coamings.
    for sx in (-1, 1):
        hs.box((sx * 1.47, -1.9, DECK - 0.04), (0.3, 2.3, 0.08), 0.02, "ceramic_grey", ARMOR)   # overhang
        hs.box((sx * 1.58, -1.9, DECK + 0.05), (0.08, 2.3, 0.14), 0.02, "ceramic", ARMOR)       # coaming
        for k in range(4):
            glow_box(hs, (sx * 1.58, -2.75 + k * 0.56, DECK + 0.121), (0.04, 0.22, 0.008), GLOW)
    hs.box((0.0, -2.95, DECK + 0.05), (1.8, 0.08, 0.12), 0.02, "ceramic", ARMOR)              # front coaming
    for x in (-0.75, 0.75):                                                                    # catapult rails
        glow_box(hs, (x, -2.82, DECK + 0.004), (0.05, 0.36, 0.006), GLOW)
    hs.box((0.0, -2.0, DECK + 0.004), (0.05, 1.3, 0.006), 0.0, "orange", TRIM, bottom=True)  # deck centre line
    for k in range(5):                                                                         # lane markings
        hs.box((0.0, -1.0 + k * 0.42, DECK + 0.004), (0.36, 0.06, 0.006), 0.0, "pale", TRIM, bottom=True)
    for sx in (-1, 1):                                                                         # hawse recesses
        y = -3.6
        hb = half_beam(y)
        nx, nz = side_normal(hb, hb * 0.8, DECK - 0.36)
        hs.box((sx * (hb * 0.93 + 0.02), y, 0.62), (0.08, 0.2, 0.16), 0.02, "ceramic_dk", ARMOR)
    # --- Deck plating with panel lines (amidships and aft decks).
    for (y0, y1, w) in ((-0.8, 0.9, 2.6), (5.4, 7.1, 2.2)):
        n = 4
        for k in range(n):
            a_ = y0 + (y1 - y0) * k / n
            b_ = y0 + (y1 - y0) * (k + 1) / n
            hb = min(half_beam(a_), half_beam(b_)) * 0.8
            ww = min(w, hb * 2 - 0.12)
            hs.box((0.0, (a_ + b_) * 0.5, DECK + 0.015), (ww, b_ - a_ - 0.05, 0.03), 0.01,
                   "ceramic_grey" if k % 2 else "ceramic", ARMOR)
    # --- Outrigger sponsons carrying the radiator weapons, with heavy finned radiator wings.
    for sx in (-1, 1):
        hs.box((sx * 2.2, -0.35, 0.74), (1.7, 2.5, 0.8), 0.07, "ceramic", ARMOR)              # sponson body
        hs.box((sx * 2.2, -0.35, 0.3), (1.4, 2.2, 0.12), 0.04, "ceramic_dk", ARMOR)           # under-hull (overhang)
        hs.box((sx * 2.2, -1.62, 0.86), (1.5, 0.08, 0.34), 0.02, "pale", TRIM)               # front armour lip
        for k in range(4):
            glow_box(hs, (sx * (1.7 + k * 0.33), -1.665, 0.86), (0.05, 0.012, 0.24), GLOW)
        # heavy finned radiator wing: six thick fins with glowing gaps
        for k in range(7):
            x = sx * (3.1 + k * 0.1)
            h = 0.86 - k * 0.06
            hs.box((x, -0.35, 0.62 + h * 0.5), (0.055, 2.3 - k * 0.1, h), 0.012,
                   "ceramic" if k % 2 else "ceramic_grey", ARMOR)
            if k < 6:
                glow_box(hs, (x + sx * 0.05, -0.35, 0.62 + (h - 0.12) * 0.5), (0.045, 2.1 - k * 0.1, h - 0.12), GLOW)
        hs.box((sx * 3.74, -0.35, 0.9), (0.05, 2.0, 0.5), 0.012, "pale", TRIM)               # outer edge rail
        hs.box((sx * 3.05, -0.35, 0.6), (0.2, 2.4, 0.5), 0.03, "ceramic_dk", ARMOR)          # fin root block
        for k in range(3):
            hs.box((sx * 3.4, -1.45 + k * 1.1, 0.5), (0.7, 0.06, 0.16), 0.012, "steel", ARMOR)   # fin braces
    # --- Stepped superstructure behind the bridge (tumblehome tiers) and a command tower.
    trapezoid_block(hs, 0.9, 5.4, 1.28, 1.15, DECK, 1.44, "ceramic", ARMOR)                  # tier 1
    trapezoid_block(hs, 2.1, 5.0, 1.02, 0.86, 1.44, 2.0, "ceramic_grey", ARMOR)               # tier 2
    trapezoid_block(hs, 2.6, 4.4, 0.72, 0.6, 2.0, 2.45, "ceramic", ARMOR)                     # tier 3
    trapezoid_block(hs, 2.9, 3.7, 0.44, 0.36, 2.45, 2.82, "pale", TRIM)                        # command tower
    for sx in (-1, 1):
        for (hwb, hwt, z0, z1, y0, y1, n) in ((1.28, 1.15, DECK, 1.44, 2.2, 5.2, 9), (1.02, 0.86, 1.44, 2.0, 2.3, 4.8, 7),
                                              (0.72, 0.6, 2.0, 2.45, 2.75, 4.2, 4)):
            nx, nz = side_normal(hwb, hwt, z1 - z0)
            for k in range(n):
                y = y0 + (y1 - y0) * (k + 0.5) / n
                xm = (hwb + hwt) * 0.5 + 0.012
                slot(hs, (sx * xm, y, (z0 + z1) * 0.5), ((z1 - z0) * 0.62, 0.07, 0.012), (sx * nx, nz))
        hs.box((sx * 1.2, 1.0, 1.47), (0.12, 0.16, 0.06), 0.0, "pale", TRIM)
    for (y0, y1, hw, z) in ((0.9, 5.4, 1.15, 1.44), (2.1, 5.0, 0.86, 2.0), (2.6, 4.4, 0.6, 2.45)):  # edge trims
        hs.box((0.0, y0 + 0.04, z + 0.015), (hw * 2 - 0.04, 0.08, 0.03), 0.008, "pale", TRIM)
        for sx in (-1, 1):
            hs.box((sx * (hw - 0.04), (y0 + y1) * 0.5, z + 0.015), (0.08, y1 - y0 - 0.1, 0.03), 0.008, "pale", TRIM)
    for (x, y) in ((-0.7, 4.75), (0.7, 2.35), (-0.7, 2.35)):                                  # roof vent housings
        hs.box((x, y, 2.07), (0.26, 0.3, 0.14), 0.02, "ceramic_dk", ARMOR)
        glow_box(hs, (x, y, 2.141), (0.18, 0.22, 0.006), GLOW)
    for sx in (-1, 1):                                                                         # amidships turrets
        twin_turret(hs, rng, sx * 1.0, 0.45, DECK + 0.02, sx * 0.35, 0.72)
        for y in (3.0, 4.45):                                                                  # gun galleries
            hs.box((sx * 1.52, y, 1.16), (0.52, 0.72, 0.32), 0.04, "ceramic", ARMOR)
            hs.box((sx * 1.52, y - 0.37, 1.16), (0.44, 0.02, 0.08), 0.0, "lamp", GLOW)
            hs.box((sx * 1.52, y, 1.33), (0.56, 0.76, 0.03), 0.01, "pale", TRIM)
            twin_turret(hs, rng, sx * 1.55, y, 1.345, sx * 0.9, 0.55)
    hs.box((0.0, 7.0, DECK + 0.06), (0.9, 0.5, 0.12), 0.03, "ceramic_dk", ARMOR)            # stern hangar hatch
    glow_box(hs, (0.0, 7.0, DECK + 0.121), (0.7, 0.3, 0.006), GLOW)
    for k in range(7):                                                                        # tier-2 front slots
        glow_box(hs, (-0.75 + k * 0.25, 2.094, 1.72), (0.06, 0.012, 0.36), GLOW)
    for k in range(5):                                                                        # tier-3 front slots
        glow_box(hs, (-0.48 + k * 0.24, 2.594, 2.22), (0.06, 0.012, 0.3), GLOW)
    glow_box(hs, (0.0, 2.894, 2.66), (0.6, 0.012, 0.08), GLOW)                                 # tower windows
    for k in range(6):                                                                        # tier-1 aft slots
        glow_box(hs, (-0.95 + k * 0.38, 5.406, 1.22), (0.06, 0.012, 0.3), GLOW)
    # Funnels with glowing throats.
    for sx in (-1, 1):
        hs.cyl((sx * 0.62, 4.65, 2.0), (0, 0, 1), 0.2, 0.62, 16, 0.0, "ceramic_dk", ARMOR, cap0=False, cap1=False,
               r1=0.17)
        for z in (2.2, 2.42):
            hs.cyl((sx * 0.62, 4.65, z), (0, 0, 1), 0.205 - (z - 2.0) * 0.05, 0.04, 16, 0.0, "pale", TRIM, cap0=False,
                   cap1=False)
        hs.cyl((sx * 0.62, 4.65, 2.62), (0, 0, 1), 0.19, 0.05, 12, 0.0, "pale", TRIM, cap0=False)
        hs.cyl((sx * 0.62, 4.65, 2.58), (0, 0, 1), 0.12, 0.07, 10, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    # Masts, sensor dish, searchlights and beacon (all under the 3.2 cap).
    strut(hs, (0.0, 3.4, 2.82), (0.0, 3.4, 3.12), 0.035, 6, "steel")
    hs.box((0.0, 3.4, 3.0), (0.9, 0.04, 0.04), 0.0, "steel", ARMOR)
    for sx in (-1, 1):
        strut(hs, (sx * 0.42, 3.4, 3.0), (sx * 0.42, 3.4, 2.82), 0.015, 4, "steel")
        strut(hs, (sx * 0.5, 4.2, 2.45), (sx * 0.5, 4.2, 2.95), 0.02, 4, "steel")
        sl = HS(rng)                                                                          # searchlights
        sl.cyl((0.0, 0.0, 0.0), (0, -1, 0.3), 0.07, 0.12, 10, 0.012, "ceramic_dk", ARMOR)
        sl.cyl((0.0, -0.12, 0.036), (0, -1, 0.3), 0.055, 0.008, 10, 0.0, "lamp", GLOW, cap0=False, smooth=False)
        merge_hs(hs, sl, xform((sx * 0.3, 2.92, 2.88)))
    dish = HS(rng)
    dish.cyl((0.0, 0.0, 0.0), (0, -1, 0.45), 0.06, 0.08, 18, 0.0, "pale", TRIM, cap0=False, cap1=True, r1=0.42)
    dish.cyl((0.0, 0.0, -0.05), (0, 0, 1), 0.03, 0.05, 6, 0.0, "steel", ARMOR, cap0=False, smooth=False)
    merge_hs(hs, dish, xform((0.0, 3.95, 2.62)))
    vc.lamp(hs, (0.0, 3.4, 3.1), r=0.03, h=0.05, glow=GLOW)
    # --- Aft: two secondary turrets, missile cells, stern crane, stern light row.
    twin_turret(hs, rng, 0.0, 6.25, DECK + 0.04, math.pi, 1.0)
    twin_turret(hs, rng, 0.0, 5.05, 1.44, math.pi, 0.95)                                     # superfiring
    for sx in (-1, 1):
        hs.box((sx * 0.85, 6.4, DECK + 0.05), (0.36, 0.7, 0.1), 0.02, "ceramic_dk", ARMOR)
        for i in range(2):
            for j in range(3):
                hs.box((sx * 0.85 - 0.08 + i * 0.16, 6.2 + j * 0.2, DECK + 0.103), (0.12, 0.15, 0.01), 0.0, "pale",
                       TRIM, bottom=True)
    for x in (-0.7, -0.25, 0.25, 0.7):
        glow_box(hs, (x, 7.455, 0.6), (0.14, 0.012, 0.3), GLOW)
    # --- Point-defence turrets on the sponson front corners.
    for sx in (-1, 1):
        pd = HS(rng)
        pd.cyl((0.0, 0.0, 0.0), (0, 0, 1), 0.14, 0.05, 10, 0.0, "steel", ARMOR, cap0=False)
        pd.box((0.0, 0.02, 0.1), (0.22, 0.24, 0.1), 0.025, "ceramic", ARMOR)
        for bx in (-0.045, 0.045):
            pd.cyl((bx, -0.1, 0.11), (0, -1, 0), 0.02, 0.26, 6, 0.0, "ceramic_dk", ARMOR, cap0=False, smooth=False)
        merge_hs(hs, pd, xform((sx * 2.75, -1.3, 1.14), (0.0, 0.0, sx * 0.3)))
    return hs


def build_radiator(side, rng, wreck=False):
    """Radiator weapon housing on the sponson: base, stacked fins with glowing gaps, front emitter."""
    hs = HS(rng)
    cx, cy, _cz = B(*SOCKETS["ark_radiator_left" if side < 0 else "ark_radiator_right"])
    base_paint = "char" if wreck else "ceramic"
    hs.box((cx, cy + 0.05, 1.32), (1.1, 1.4, 0.36), 0.05, base_paint, ARMOR)
    hs.box((cx, cy - 0.66, 1.3), (0.9, 0.06, 0.24), 0.015, "burnt" if wreck else "pale", TRIM)
    if not wreck:
        for k in range(6):
            x = cx - 0.4 + k * 0.16
            paint, mat = ("pale", TRIM) if k % 2 else ("ceramic_grey", ARMOR)
            hs.box((x, cy + 0.1, 1.79), (0.05, 0.95, 0.58), 0.012, paint, mat)
            if k < 5:
                glow_box(hs, (x + 0.08, cy + 0.1, 1.5), (0.09, 0.85, 0.36), GLOW)
        hs.cyl((cx, cy - 0.6, 1.42), (0, -1, 0), 0.17, 0.32, 12, 0.02, "ceramic_dk", ARMOR)
        hs.cyl((cx, cy - 0.93, 1.42), (0, -1, 0), 0.12, 0.01, 12, 0.0, "lamp", GLOW, cap0=False, smooth=False)
        for sx in (-1, 1):
            hs.box((cx + sx * 0.5, cy - 0.45, 1.6), (0.08, 0.3, 0.18), 0.015, "pale", TRIM)
    else:
        for k in range(6):                                 # broken, leaning fins
            x = cx - 0.4 + k * 0.16
            fin = HS(rng)
            h = rng.uniform(0.18, 0.5)
            fin.box((0.0, 0.0, h * 0.5), (0.05, rng.uniform(0.5, 0.95), h), 0.012, rng.choice(("char", "burnt")), ARMOR)
            merge_hs(hs, fin, xform((x, cy + 0.1 + rng.uniform(-0.15, 0.15), 1.48),
                                   (rng.uniform(-0.5, 0.5), rng.uniform(-0.6, 0.6), rng.uniform(-0.2, 0.2))))
        em = HS(rng)
        em.cyl((0.0, 0.0, 0.0), (0, -1, 0), 0.17, 0.3, 12, 0.02, "char", ARMOR)
        merge_hs(hs, em, xform((cx + side * 0.1, cy - 0.6, 1.3), (math.radians(-25.0), 0.0, side * 0.3)))
        for _k in range(5):
            pl = HS(rng)
            pl.box((0.0, 0.0, 0.0), (rng.uniform(0.12, 0.28), rng.uniform(0.1, 0.2), 0.03), 0.0, "char", ARMOR,
                   bottom=True)
            merge_hs(hs, pl, xform((cx + rng.uniform(-0.6, 0.6), cy + rng.uniform(-0.7, 0.7), 1.5 + rng.uniform(0, 0.1)),
                                   (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, math.pi))))
        for (x, y, z) in ((0.15, 0.2, 1.51), (-0.2, -0.1, 1.51), (0.0, 0.45, 1.51)):
            hs.cyl((cx + x, cy + y, z), (0, 0, 1), 0.05, 0.02, 6, 0.0, "lamp", GLOW, cap0=False, smooth=False)
        hs.scorch = [((cx, cy, 1.5), 0.9)]
    return hs


BRIDGE_PROFILE = [(1.15, 1.44), (1.15, 1.5), (1.4, 1.88), (2.05, 1.92), (2.1, 1.44)]
SLOPE = (1.15, 1.5, 1.4, 1.88)


def slope_frame():
    y0, z0, y1, z1 = SLOPE
    d = Vector((0.0, y1 - y0, z1 - z0)).normalized()
    n = Vector((0.0, -(z1 - z0), y1 - y0)).normalized()
    mid = Vector((0.0, (y0 + y1) * 0.5, (z0 + z1) * 0.5))
    theta = math.atan2(-n.y, n.z)
    return mid, d, n, theta


def build_bridge(rng):
    hs = HS(rng)
    body = HS(rng)                                         # loft about its own centre (loft orients faces from y = 0)
    loft(body, [(-0.95, 1.0, 1.0, 0.0), (0.95, 1.0, 1.0, 0.0)], [(y - 1.6, z - 1.68) for y, z in BRIDGE_PROFILE],
         "ceramic_grey", cap_paint="ceramic_grey", cap_tag="main", mat=ARMOR)
    merge_hs(hs, body, xform((0.0, 1.6, 1.68)))
    mid, d, n, theta = slope_frame()
    # Glowing window band across the sloped front and the bridge core lens in the middle.
    win = HS(rng)
    win.box((0.0, 0.0, 0.0), (1.7, 0.12, 0.012), 0.0, "lamp", GLOW, bottom=True)
    merge_hs(hs, win, xform(tuple(mid + d * 0.13 + n * 0.004), (theta, 0.0, 0.0)))
    ring = HS(rng)
    ring.cyl((0.0, 0.0, 0.0), (0, 0, 1), 0.27, 0.04, 16, 0.01, "ceramic_dk", ARMOR, cap0=False, cap1=False)
    ring.cyl((0.0, 0.0, 0.0), (0, 0, 1), 0.21, 0.035, 16, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    merge_hs(hs, ring, xform(tuple(mid - d * 0.05 + n * 0.005), (theta, 0.0, 0.0)))
    for sx in (-1, 1):
        hs.box((sx * 0.97, 1.6, 1.68), (0.06, 0.95, 0.42), 0.015, "pale", TRIM)
        hs.box((sx * 0.6, 1.85, 1.94), (0.4, 0.3, 0.05), 0.015, "ceramic_dk", ARMOR)
    return hs


def build_bridge_shutter(side, rng):
    hs = HS(rng)
    gx, gy, gz = SOCKETS["ark_bridge_shutter_a" if side < 0 else "ark_bridge_shutter_b"]
    c = Vector(B(gx, gy, gz))
    _mid, _d, _n, theta = slope_frame()
    pl = HS(rng)
    pl.box((0.0, 0.0, 0.0), (0.93, 0.5, 0.05), 0.015, "ceramic", ARMOR)
    pl.box((side * -0.38, 0.0, 0.03), (0.08, 0.46, 0.02), 0.0, "pale", TRIM)
    for k in range(3):
        pl.box((0.0, -0.15 + k * 0.15, 0.03), (0.7, 0.03, 0.015), 0.0, "ceramic_dk", ARMOR)
    merge_hs(hs, pl, xform(tuple(c), (theta, 0.0, 0.0)))
    return hs


def build_bay(side, rng):
    hs = HS(rng)
    cx, cy, cz = B(*SOCKETS["ark_bay_left" if side < 0 else "ark_bay_right"])
    w, d = 0.9, 1.15
    for (x, y, sw, sd) in ((cx, cy - d / 2, w + 0.1, 0.08), (cx, cy + d / 2, w + 0.1, 0.08),
                           (cx - w / 2, cy, 0.08, d), (cx + w / 2, cy, 0.08, d)):
        hs.box((x, y, cz + 0.055), (sw, sd, 0.09), 0.015, "ceramic_dk", ARMOR)
    hs.box((cx, cy, cz + 0.05), (w - 0.06, d - 0.06, 0.012), 0.0, "ceramic_dk", ARMOR, bottom=True)
    for k in range(3):
        glow_box(hs, (cx, cy - 0.35 + k * 0.35, cz + 0.056), (w - 0.2, 0.05, 0.006), GLOW)
    for sx in (-1, 1):
        hs.box((cx + sx * (w / 2 + 0.05), cy - d / 2 - 0.02, cz + 0.08), (0.06, 0.06, 0.06), 0.0, "lamp", GLOW)
    return hs


def build_bay_door(side, rng):
    hs = HS(rng)
    cx, cy, cz = B(*SOCKETS["ark_bay_left_door" if side < 0 else "ark_bay_right_door"])
    hs.box((cx, cy, cz + 0.02), (0.86, 1.08, 0.04), 0.015, "pale", TRIM)
    for k in range(4):
        hs.box((cx, cy - 0.39 + k * 0.26, cz + 0.045), (0.76, 0.03, 0.01), 0.0, "ceramic_dk", ARMOR, bottom=True)
    hs.box((cx + side * 0.36, cy, cz + 0.045), (0.06, 0.9, 0.012), 0.0, "orange", TRIM, bottom=True)
    return hs


def node_rules():
    rules = {}
    for name, t in SOCKETS.items():
        r = dict(t=t, x=(-3.8, 3.8), z=(-7.5, 4.5), y_max=TOP_MAX)
        rules[name] = r
    rules["ark_wake_anchor"] = dict(t=SOCKETS["ark_wake_anchor"], empty=True)
    return rules


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="helion_ark.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = [vc.make_material("ark_armor", "vc", rough=0.32, metal=0.15),
            vc.make_material("ark_trim", "vc", rough=0.38, metal=0.0),
            vc.make_material("ark_glow", "glow")]

    def r(tag):
        return random.Random(f"{SEED}:{tag}")
    pieces = {"ark_hull": build_hull(r("hull"))}
    for side, nm in ((-1, "left"), (1, "right")):
        pieces[f"ark_radiator_{nm}"] = build_radiator(side, r(f"rad{nm}"))
        pieces[f"ark_radiator_{nm}_wreck"] = build_radiator(side, r(f"wreck{nm}"), wreck=True)
        pieces[f"ark_bay_{nm}"] = build_bay(side, r(f"bay{nm}"))
        pieces[f"ark_bay_{nm}_door"] = build_bay_door(side, r(f"door{nm}"))
    pieces["ark_bridge"] = build_bridge(r("bridge"))
    pieces["ark_bridge_shutter_a"] = build_bridge_shutter(-1, r("shutterA"))
    pieces["ark_bridge_shutter_b"] = build_bridge_shutter(1, r("shutterB"))
    total = sum(hs.tris() for hs in pieces.values())
    print(f"ARK total triangles {total}")
    if total > 26000:
        raise SystemExit("Ark over budget")
    static = ["ark_hull", "ark_radiator_left", "ark_radiator_right", "ark_bridge"]
    objs = {}
    for hs in pieces.values():
        vc.triangulate_nonplanar(hs)
    for name, hs in pieces.items():
        context = [([Vector(v) for v in pieces[c].verts], pieces[c].faces) for c in static if c != name]
        cols = vc.bake(hs, name, dict(glow={GLOW}, ao=0.45, ground=None), context)
        objs[name] = vc.make_object(name, hs, mats, SOCKETS[name], cols)
    vc.make_empty("ark_wake_anchor", SOCKETS["ark_wake_anchor"])
    vc.publish(args.glb, "helion_ark.py", dict(materials=MAT_NAMES, nodes=node_rules(), total=(0, 26000),
                                               max_bytes=2_000_000), "ARK")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        render_previews(objs, args)


def place(objs, names, offset, extra=None):
    for name in names:
        src = objs[name]
        o = bpy.data.objects.new(f"p_{name}", src.data)
        o.location = Vector(src.location) + Vector(offset) + Vector((extra or {}).get(name, (0, 0, 0)))
        bpy.context.scene.collection.objects.link(o)


def render_previews(objs, args):
    scene = bpy.context.scene
    pm = vc.preview_materials()
    for o in objs.values():
        o.hide_render = True
    keep = set(objs) | {"ark_wake_anchor"}
    for exposed, fname in ((False, "preview-ark.png"), (True, "preview-ark-exposed.png")):
        extra = {"ark_bridge_shutter_a": (-1.0, 0, 0), "ark_bridge_shutter_b": (1.0, 0, 0),
                 "ark_bay_left_door": (-0.9, 0, 0), "ark_bay_right_door": (0.9, 0, 0)} if exposed else None
        place(objs, EXPOSED_STATE if exposed else DEFAULT_STATE, (0.0, 11.0, 0.0), extra)
        vc.plane("ocean", -30, 30, -20, 40, 0.0, pm["ocean"])
        vc.preview_world(scene)
        kit.add_ortho_camera((0.0, 10.0, 0.5), 55.0, 12.5 * 1600.0 / 900.0)
        vc.setup_render(scene, args.engine, args.samples, 900, 1600)
        kit.render(os.path.join(args.preview_dir, fname))
        kit.clear_preview(keep)
    # 3/4 hero view
    place(objs, DEFAULT_STATE, (0.0, 0.0, 0.0))
    vc.plane("ocean", -40, 40, -40, 40, 0.0, pm["ocean"])
    vc.preview_world(scene)
    cam = bpy.data.cameras.new("hero")
    cam.lens = 34.0
    ob = bpy.data.objects.new("hero", cam)
    ob.location = (11.5, -11.0, 6.2)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (Vector((0.0, 0.3, 1.0)) - Vector(ob.location)).to_track_quat("-Z", "Y")
    scene.collection.objects.link(ob)
    scene.camera = ob
    vc.setup_render(scene, args.engine, args.samples, 1600, 1000)
    kit.render(os.path.join(args.preview_dir, "preview-ark-hero.png"))


if __name__ == "__main__":
    main()
