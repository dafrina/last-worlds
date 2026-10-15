"""Vesper (Glass Frontier) infrastructure kit for Last Worlds (docs/17 section 3).

Black ceramic with glowing orange radiator fins and slits, snow-dusted on upward faces:
a tiling radiator field array, missile and cannon emplacements on stepped hex plinths
(as in the right panel of art/concepts/01-worlds-direction.png), a cryo dome, two habitat
pods, a tiling harbour pier segment and a crane, a comm needle mast, a tracked ice-hauler
crawler, and an icebreaker ship (background traffic in the water).

Two materials: vesper_ceramic (vertex-colour albedo) and vesper_glow (orange emissive).
Conventions: glTF +Y up, 1 unit = 1 game unit, front toward +Z, base-centre pivots; land
pieces extend 0.05 below y = 0; water pieces (pier, icebreaker) have the WATERLINE at y = 0.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/vesper_infra.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/vesper/vesper-infra.glb)" \\
        --preview-dir "$(wslpath -w $R/art/vesper-infra)"
"""

import argparse
import math
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import khepri_kit as kit  # noqa: E402
import vesper_common as vc  # noqa: E402
from vesper_common import HS, merge_hs, xform, strut, glow_box, hex_poly, loft_y  # noqa: E402

SEED = "vesper-infra-v1"
CER, GLOW = 0, 1
MAT_NAMES = ("vesper_ceramic", "vesper_glow")
SINK = -0.05


def plate(hs, poly, z0, z1, paint, ch=0.02, bottom=True):
    hs.prism(poly, z0, z1, ch, paint, CER, bottom=bottom)


def hex_plinth(hs, r0, levels=((0.0, 0.16), (0.16, 0.3)), ramp=True):
    """Stepped hexagonal plinth with glowing slits and an access ramp at the front (Blender -y)."""
    r = r0
    for k, (z0, z1) in enumerate(levels):
        plate(hs, hex_poly(r, math.pi / 6), SINK if k == 0 else z0, z1, "ceramic" if k == 0 else "ceramic_grey",
              ch=0.03)
        for i in range(6):
            a = math.pi / 6 + i * math.pi / 3 + math.pi / 6
            d = r * math.cos(math.pi / 6) + 0.002
            glow_box(hs, (math.cos(a) * d, math.sin(a) * d, (z0 + z1) * 0.5), (r * 0.5, 0.012, 0.025), GLOW,
                     rot=(0.0, 0.0, a + math.pi / 2))
        r *= 0.8
    if ramp:
        rp = HS(hs.rng)
        rp.box((0.0, 0.0, 0.0), (0.36, 0.5, 0.05), 0.012, "ceramic_grey", CER, bottom=True)
        merge_hs(hs, rp, xform((0.0, -r0 * 0.95, 0.07), (math.radians(14.0), 0.0, 0.0)))
    return levels[-1][1]


def build_radiator_array(rng):
    """Tiles every 2.0 along glTF x: two open-ended rails, eight black fins with orange cores."""
    hs = HS(rng)
    for y in (-0.28, 0.28):
        rail = HS(rng)
        rail.box((0.0, 0.0, 0.0), (0.1, 2.0, 0.1), 0.012, "ceramic_dk", CER, bottom=False, ends=(False, False))
        merge_hs(hs, rail, xform((0.0, y, 0.0), (0.0, 0.0, math.pi / 2)))
    for k in range(8):
        x = -0.875 + k * 0.25
        hs.box((x, 0.0, 0.42), (0.05, 0.72, 0.74), 0.012, "ceramic", CER, bottom=False)
        if k < 7:
            glow_box(hs, (x + 0.125, 0.0, 0.42), (0.04, 0.6, 0.56), GLOW)
        hs.box((x, 0.0, 0.8), (0.07, 0.76, 0.03), 0.0, "pale_dk", CER)
    return hs


def build_missile_site(rng):
    hs = HS(rng)
    top = hex_plinth(hs, 1.0, ((0.0, 0.18), (0.18, 0.34), (0.34, 0.46)))
    hs.cyl((0.0, 0.0, top), (0, 0, 1), 0.36, 0.06, 12, 0.012, "steel", CER, cap0=False)
    hs.box((0.0, 0.08, top + 0.2), (0.62, 0.62, 0.3), 0.04, "ceramic", CER)
    for sx in (-1, 1):
        hs.box((sx * 0.33, 0.06, top + 0.24), (0.06, 0.5, 0.26), 0.015, "pale", CER)
    pitch = math.radians(58.0)
    pack = HS(rng)
    for bx in (-0.17, 0.0, 0.17):
        pack.cyl((bx, 0.0, 0.0), (0, -1, 0), 0.075, 0.9, 8, 0.0, "ceramic_dk", CER, cap0=False, cap1=False,
                 smooth=False)
        pack.cyl((bx, -0.9, 0.0), (0, -1, 0), 0.085, 0.06, 8, 0.0, "steel", CER, cap0=False)
        pack.cyl((bx, -0.961, 0.0), (0, -1, 0), 0.05, 0.004, 8, 0.0, "lamp", GLOW, cap0=False, smooth=False)
        pack.box((bx, -0.45, 0.074), (0.025, 0.6, 0.01), 0.0, "lamp", GLOW, bottom=True)
    pack.box((0.0, -0.2, -0.09), (0.5, 0.3, 0.1), 0.02, "ceramic_grey", CER)
    merge_hs(hs, pack, xform((0.0, 0.18, top + 0.42), (-pitch, 0.0, 0.0)))
    vc.lamp(hs, (0.24, 0.32, top + 0.35), r=0.03, h=0.05, glow=GLOW)
    return hs


def build_cannon_site(rng):
    hs = HS(rng)
    top = hex_plinth(hs, 0.95, ((0.0, 0.2), (0.2, 0.36)))
    hs.cyl((0.0, 0.0, top), (0, 0, 1), 0.38, 0.07, 14, 0.015, "steel", CER, cap0=False)
    turret = HS(rng)
    turret.box((0.0, 0.05, 0.16), (0.7, 0.75, 0.32), 0.05, "ceramic", CER)
    turret.box((0.0, -0.36, 0.17), (0.5, 0.06, 0.2), 0.02, "pale", CER)
    for sx in (-1, 1):
        turret.cyl((sx * 0.13, -0.35, 0.2), (0, -1, 0.12), 0.06, 1.0, 8, 0.0, "ceramic_dk", CER, cap0=False,
                   cap1=False, smooth=False)
        turret.cyl((sx * 0.13, -1.34, 0.32), (0, -1, 0.12), 0.075, 0.12, 8, 0.0, "steel", CER, cap0=False)
        turret.cyl((sx * 0.13, -1.46, 0.335), (0, -1, 0.12), 0.042, 0.004, 8, 0.0, "lamp", GLOW, cap0=False,
                   smooth=False)
        turret.box((sx * 0.13, -0.8, 0.27), (0.02, 0.6, 0.012), 0.0, "lamp", GLOW, bottom=True)
    turret.box((0.0, 0.35, 0.34), (0.3, 0.2, 0.06), 0.015, "ceramic_dk", CER)
    glow_box(turret, (0.0, 0.35, 0.371), (0.22, 0.12, 0.01), GLOW)
    merge_hs(hs, turret, xform((0.0, 0.0, top + 0.07)))
    return hs


def build_cryo_dome(rng):
    hs = HS(rng)
    top = hex_plinth(hs, 0.9, ((0.0, 0.16),), ramp=False)
    hs.cyl((0.0, 0.0, top), (0, 0, 1), 0.7, 0.14, 18, 0.0, "ceramic", CER, cap0=False, cap1=False)
    hs.cyl((0.0, 0.0, top + 0.14), (0, 0, 1), 0.72, 0.04, 18, 0.0, "lamp", GLOW, cap0=False, cap1=False)
    hs.dome((0.0, 0.0, top + 0.18), (0, 0, 1), 0.7, 0.55, 18, "pale", mat=CER, bands=4)
    for k in range(6):                                    # ribs over the dome
        a = 2 * math.pi * k / 6
        for j in range(3):
            t0, t1 = j / 3, (j + 1) / 3
            p0 = (math.cos(a) * 0.71 * math.cos(t0 * math.pi / 2), math.sin(a) * 0.71 * math.cos(t0 * math.pi / 2),
                  top + 0.18 + 0.56 * math.sin(t0 * math.pi / 2))
            p1 = (math.cos(a) * 0.71 * math.cos(t1 * math.pi / 2), math.sin(a) * 0.71 * math.cos(t1 * math.pi / 2),
                  top + 0.18 + 0.56 * math.sin(t1 * math.pi / 2))
            strut(hs, p0, p1, 0.03, 4, "ceramic_dk")
    hs.box((0.0, -0.78, top + 0.14), (0.34, 0.24, 0.28), 0.03, "ceramic", CER)                 # airlock
    glow_box(hs, (0.0, -0.905, top + 0.16), (0.18, 0.012, 0.16), GLOW)
    vc.lamp(hs, (0.0, 0.0, top + 0.73), r=0.035, h=0.05, glow=GLOW)
    return hs


def build_habitat(rng, idx):
    hs = HS(rng)
    if idx == 0:                                          # three capsule pods on a skid deck
        hs.box((0.0, 0.0, 0.03), (1.4, 1.0, 0.16), 0.03, "ceramic_dk", CER)
        for k, (x, y, ln) in enumerate(((-0.35, -0.2, 0.9), (0.38, 0.0, 0.8), (-0.1, 0.32, 0.7))):
            r = 0.2
            hs.cyl((x, y - ln / 2, 0.33), (0, 1, 0), r, ln, 12, 0.0, "ceramic", CER, cap0=False, cap1=False)
            hs.dome((x, y + ln / 2, 0.33), (0, 1, 0), r, 0.12, 12, "ceramic", mat=CER, bands=2)
            hs.dome((x, y - ln / 2, 0.33), (0, -1, 0), r, 0.12, 12, "pale", mat=CER, bands=2)
            glow_box(hs, (x + 0.2, y, 0.38), (0.012, ln * 0.6, 0.05), GLOW)
            glow_box(hs, (x - 0.2, y, 0.38), (0.012, ln * 0.6, 0.05), GLOW)
        hs.box((0.0, -0.1, 0.33), (0.6, 0.14, 0.14), 0.02, "ceramic_grey", CER)
        strut(hs, (0.38, 0.0, 0.52), (0.38, 0.0, 0.85), 0.012, 4, "steel")
        vc.lamp(hs, (0.38, 0.0, 0.85), r=0.02, h=0.04, glow=GLOW)
    else:                                                  # stacked hexagonal modules
        plate(hs, hex_poly(0.55, 0.0), SINK, 0.35, "ceramic", ch=0.04)
        plate(hs, hex_poly(0.42, math.pi / 6, 0.12, 0.06), 0.35, 0.62, "pale", ch=0.035)
        for i in range(6):
            a = i * math.pi / 3 + math.pi / 6
            d = 0.55 * math.cos(math.pi / 6) + 0.002
            glow_box(hs, (math.cos(a) * d, math.sin(a) * d, 0.2), (0.24, 0.012, 0.05), GLOW, rot=(0.0, 0.0, a + math.pi / 2))
        for i in range(3):
            a = i * 2 * math.pi / 3 + math.pi / 2
            d = 0.42 * math.cos(math.pi / 6) + 0.002
            glow_box(hs, (0.12 + math.cos(a) * d, 0.06 + math.sin(a) * d, 0.5), (0.18, 0.012, 0.04), GLOW,
                     rot=(0.0, 0.0, a + math.pi / 2))
        hs.cyl((0.12, 0.06, 0.62), (0, 0, 1), 0.16, 0.08, 10, 0.015, "ceramic_dk", CER, cap0=False)
        strut(hs, (-0.3, 0.2, 0.35), (-0.3, 0.2, 0.75), 0.012, 4, "steel")
        vc.lamp(hs, (-0.3, 0.2, 0.75), r=0.02, h=0.04, glow=GLOW)
    return hs


def build_pier(rng):
    """Harbour pier: tiles every 2.0 along glTF z. Deck top at y = 0.4; pilings to y = -0.6."""
    hs = HS(rng)
    deck = HS(rng)
    deck.box((0.0, 0.0, 0.0), (1.4, 2.0, 0.12), 0.015, "ceramic_grey", CER, bottom=True, ends=(False, False))
    merge_hs(hs, deck, xform((0.0, 0.0, 0.34)))
    for sx in (-1, 1):
        rail = HS(rng)
        rail.box((0.0, 0.0, 0.0), (0.06, 2.0, 0.06), 0.0, "ceramic_dk", CER, ends=(False, False))
        merge_hs(hs, rail, xform((sx * 0.66, 0.0, 0.61)))
        for y in (-0.5, 0.5):
            hs.box((sx * 0.66, y, 0.5), (0.05, 0.05, 0.18), 0.0, "ceramic_dk", CER)
            hs.cyl((sx * 0.5, y, -0.6), (0, 0, 1), 0.09, 0.88, 8, 0.0, "ceramic", CER, cap0=False, cap1=False,
                   smooth=False)
        hs.cyl((sx * 0.52, 0.0, 0.4), (0, 0, 1), 0.06, 0.1, 8, 0.012, "steel", CER, cap0=False)    # bollard
        glow_box(hs, (sx * 0.69, 0.0, 0.36), (0.012, 1.4, 0.03), GLOW)
    vc.lamp(hs, (0.6, 0.6, 0.4), r=0.025, h=0.05, glow=GLOW)
    return hs


def build_crane(rng):
    hs = HS(rng)
    for sx in (-1, 1):                                     # portal legs on rails
        for sy in (-1, 1):
            strut(hs, (sx * 0.55, sy * 0.45, 0.0), (sx * 0.4, sy * 0.3, 1.2), 0.05, 6, "ceramic")
        hs.box((sx * 0.55, 0.0, 0.0), (0.16, 1.1, 0.1), 0.02, "ceramic_dk", CER)
    hs.box((0.0, 0.0, 1.25), (1.0, 0.8, 0.14), 0.03, "ceramic", CER)
    hs.cyl((0.0, 0.0, 1.32), (0, 0, 1), 0.28, 0.08, 12, 0.015, "steel", CER, cap0=False)
    hs.box((0.0, 0.1, 1.55), (0.5, 0.5, 0.4), 0.04, "pale", CER)
    glow_box(hs, (0.0, -0.152, 1.6), (0.36, 0.012, 0.08), GLOW)
    jib = HS(rng)
    jib.box((0.0, -0.9, 0.0), (0.16, 1.9, 0.14), 0.02, "ceramic", CER)
    jib.box((0.0, 0.25, 0.0), (0.3, 0.5, 0.22), 0.03, "ceramic_dk", CER)
    glow_box(jib, (0.0, -0.9, 0.075), (0.04, 1.6, 0.01), GLOW)
    merge_hs(hs, jib, xform((0.0, 0.1, 1.82), (math.radians(14.0), 0.0, 0.3)))
    strut(hs, (0.3, -1.62, 2.1), (0.3, -1.62, 1.25), 0.008, 4, "steel")
    hs.box((0.3, -1.62, 1.22), (0.12, 0.12, 0.08), 0.015, "orange", CER)
    return hs


def build_comm_needle(rng):
    hs = HS(rng)
    plate(hs, hex_poly(0.34, 0.0), SINK, 0.12, "ceramic", ch=0.02)
    stations = [(0.12, 0.13), (0.9, 0.09), (1.7, 0.05), (2.15, 0.0)]
    for (z0, r0), (z1, r1) in zip(stations, stations[1:]):
        if r1 == 0.0:
            hs.cyl((0.0, 0.0, z0), (0, 0, 1), r0, z1 - z0, 6, 0.0, "pale", CER, cap0=False, cap1=False, r1=0.004,
                   smooth=False)
        else:
            hs.cyl((0.0, 0.0, z0), (0, 0, 1), r0, z1 - z0, 6, 0.0, "ceramic" if z0 < 1.0 else "pale", CER,
                   cap0=False, cap1=False, r1=r1, smooth=False)
    for z in (0.55, 1.15, 1.6):
        hs.cyl((0.0, 0.0, z), (0, 0, 1), 0.14 - z * 0.05, 0.04, 6, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    for a in (0.0, 2.1, 4.2):                              # three swept blade fins at the base
        fin = HS(rng)
        fin.prism([(0.0, 0.0), (0.3, 0.0), (0.02, 0.6)], -0.012, 0.012, 0.004, "pale", CER, bottom=True)
        merge_hs(hs, fin, xform((math.cos(a) * 0.1, math.sin(a) * 0.1, 0.12), (math.pi / 2, 0.0, a)))
    vc.lamp(hs, (0.0, 0.0, 2.12), r=0.025, h=0.04, glow=GLOW)
    return hs


def build_hauler(rng):
    """Tracked ice-hauler: two track pods, black ceramic hull, cab facing +z, snow-dusted."""
    hs = HS(rng)
    for sx in (-1, 1):
        hs.box((sx * 0.4, 0.0, 0.085), (0.26, 1.85, 0.27), 0.08, "ceramic_dk", CER, bottom=False)
        for y in (-0.6, -0.2, 0.2, 0.6):
            hs.cyl((sx * 0.535, y, 0.07), (sx, 0, 0), 0.08, 0.012, 8, 0.0, "steel", CER, cap0=False, smooth=False)
        glow_box(hs, (sx * 0.54, 0.0, 0.2), (0.012, 1.2, 0.025), GLOW)
    hs.box((0.0, 0.1, 0.27), (0.6, 1.5, 0.18), 0.03, "ceramic", CER)
    hs.box((0.0, -0.62, 0.45), (0.56, 0.42, 0.24), 0.05, "pale", CER)                          # cab (front)
    hs.box((0.0, -0.835, 0.47), (0.44, 0.02, 0.08), 0.0, "visor", CER, bottom=True)
    glow_box(hs, (0.0, -0.84, 0.36), (0.4, 0.012, 0.03), GLOW)
    for k in range(2):                                     # insulated cargo pods
        hs.cyl((-0.2 + k * 0.4, 0.0, 0.48), (0, 1, 0), 0.15, 0.95, 10, 0.0, "ceramic", CER, cap0=False, cap1=False)
        hs.dome((-0.2 + k * 0.4, 0.95, 0.48), (0, 1, 0), 0.15, 0.08, 10, "ceramic", mat=CER, bands=2)
        hs.dome((-0.2 + k * 0.4, 0.0, 0.48), (0, -1, 0), 0.15, 0.08, 10, "ceramic", mat=CER, bands=2)
        hs.cyl((-0.2 + k * 0.4, 0.45, 0.48), (0, 1, 0), 0.158, 0.05, 10, 0.0, "orange", CER, cap0=False, cap1=False)
    vc.lamp(hs, (0.15, -0.62, 0.57), r=0.022, h=0.04, glow=GLOW)
    return hs


def build_icebreaker(rng):
    """Background icebreaker: waterline at z = 0 (glTF y), bow toward glTF +z."""
    hs = HS(rng)
    prof = [(1.0, 0.45), (-1.0, 0.45), (-1.0, 0.1), (-0.7, -0.25), (0.7, -0.25), (1.0, 0.1)]
    secs = [(-1.72, 0.0, 0.0, 0.0, 0.2), (-1.3, 0.32, 1.0, 0.0, 0.0), (-0.6, 0.5, 1.0, 0.0, 0.0),
            (1.2, 0.5, 1.0, 0.0, 0.0), (1.6, 0.44, 1.0, 0.0, 0.0)]
    loft_y(hs, secs, prof, "ceramic", CER)
    for sx in (-1, 1):                                     # orange ice belt at the waterline
        glow_box(hs, (sx * 0.505, 0.0, 0.18), (0.012, 2.4, 0.04), GLOW)
        hs.box((sx * 0.51, 0.1, 0.02), (0.02, 2.6, 0.1), 0.0, "orange", CER)
    hs.box((0.0, 0.55, 0.62), (0.7, 0.9, 0.34), 0.04, "pale", CER)
    hs.box((0.0, 0.5, 0.92), (0.5, 0.5, 0.26), 0.035, "pale", CER)
    glow_box(hs, (0.0, 0.245, 0.95), (0.4, 0.012, 0.06), GLOW)
    hs.cyl((0.0, 0.85, 0.79), (0, 0, 1), 0.1, 0.42, 8, 0.0, "ceramic_dk", CER, cap0=False)
    strut(hs, (0.0, 0.5, 1.05), (0.0, 0.5, 1.36), 0.015, 4, "steel")
    vc.lamp(hs, (0.0, 0.5, 1.33), r=0.02, h=0.04, glow=GLOW)
    hs.box((0.0, -0.8, 0.49), (0.6, 0.6, 0.08), 0.02, "ceramic_grey", CER)
    return hs


NODES = {
    "vesper_radiator_array": dict(budget=600, x=(-1.0, 1.0), foot=(2.0, 1.2), y_min_exact=SINK, y_max=1.0,
                                  tile=("x", 2.0)),
    "vesper_missile_site": dict(budget=3000, foot=(2.2, 2.2), y_min_exact=SINK, y_max=1.8),
    "vesper_cannon_site": dict(budget=3000, foot=(2.2, 3.2), y_min_exact=SINK, y_max=1.4),
    "vesper_cryo_dome": dict(budget=3000, foot=(2.0, 2.0), y_min_exact=SINK, y_max=1.1),
    "vesper_habitat_0": dict(budget=3000, foot=(1.6, 1.6), y_min_exact=SINK, y_max=1.0),
    "vesper_habitat_1": dict(budget=3000, foot=(1.4, 1.4), y_min_exact=SINK, y_max=1.0),
    "vesper_pier_segment": dict(budget=3000, foot=(1.6, 2.0), z=(-1.0, 1.0), y_min=-0.65, y_max=0.75,
                                tile=("z", 2.0)),
    "vesper_crane": dict(budget=3000, foot=(1.6, 3.6), y_min_exact=SINK, y_max=2.6),
    "vesper_comm_needle": dict(budget=3000, foot=(0.9, 0.9), y_min_exact=SINK, y_max=2.3),
    "vesper_ice_hauler": dict(budget=3000, foot=(1.2, 2.0), y_min_exact=SINK, y_max=0.8),
    "vesper_icebreaker": dict(budget=3000, foot=(1.2, 3.5), y_min=-0.3, y_max=1.45),
}
WATER = {"vesper_pier_segment", "vesper_icebreaker"}


def seat(hs, name):
    """Land pieces: lowest point exactly at SINK, centred footprint. Water pieces keep z (waterline 0)."""
    xs = [v[0] for v in hs.verts]
    ys = [v[1] for v in hs.verts]
    ox = (min(xs) + max(xs)) * 0.5 if name != "vesper_radiator_array" else 0.0
    oy = (min(ys) + max(ys)) * 0.5 if name not in ("vesper_pier_segment",) else 0.0
    oz = 0.0 if name in WATER else (min(v[2] for v in hs.verts) - SINK)
    for v in hs.verts:
        v[0] -= ox
        v[1] -= oy
        v[2] -= oz


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="vesper_infra.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = [vc.make_material("vesper_ceramic", "vc", rough=0.45, metal=0.05), vc.make_material("vesper_glow", "glow")]
    builders = [("vesper_radiator_array", build_radiator_array), ("vesper_missile_site", build_missile_site),
                ("vesper_cannon_site", build_cannon_site), ("vesper_cryo_dome", build_cryo_dome),
                ("vesper_habitat_0", lambda r: build_habitat(r, 0)), ("vesper_habitat_1", lambda r: build_habitat(r, 1)),
                ("vesper_pier_segment", build_pier), ("vesper_crane", build_crane),
                ("vesper_comm_needle", build_comm_needle), ("vesper_ice_hauler", build_hauler),
                ("vesper_icebreaker", build_icebreaker)]
    objs = {}
    for name, fn in builders:
        hs = fn(random.Random(f"{SEED}:{name}"))
        seat(hs, name)
        tile = NODES[name].get("tile")
        opts = dict(glow={GLOW}, ao=0.3, ground=None if name in WATER else 0.0,
                    frost=0.1 if name in WATER else 0.15, frost_low=0.0 if name in WATER else 0.2)
        if tile:
            opts["tile"] = ("x", 2.0) if tile[0] == "x" else ("y", 2.0)
        cols = vc.bake(hs, name, opts)
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        print(f"VINFRA {name:24s} tris={hs.tris()}")
    vc.publish(args.glb, "vesper_infra.py", dict(materials=MAT_NAMES, nodes=NODES, max_bytes=2_000_000), "VINFRA")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        render_sheet(objs, args)


def render_sheet(objs, args):
    scene = bpy.context.scene
    pm = vc.preview_materials()
    for o in objs.values():
        o.hide_render = True
    land = [("vesper_missile_site", -5.0, 4.6), ("vesper_cannon_site", -2.4, 4.6), ("vesper_cryo_dome", 0.2, 4.6),
            ("vesper_comm_needle", 2.4, 4.8), ("vesper_crane", 4.6, 4.4),
            ("vesper_habitat_0", -5.0, 1.4), ("vesper_habitat_1", -3.0, 1.4), ("vesper_ice_hauler", -1.2, 1.4)]
    for name, x, y in land:
        kit.instance("sheet_" + name, objs[name], (x, y, 0.0))
        kit.text_label(name, (x, y - 1.25, 0.012), 0.13, pm["label_dark"])
    for k in range(3):
        kit.instance(f"sheet_rad{k}", objs["vesper_radiator_array"], (1.3 + 2.0 * k, 1.4, 0.0))
    kit.text_label("vesper_radiator_array (x3 tiled)", (3.3, 0.4, 0.012), 0.13, pm["label_dark"])
    kit.prism_obj("shelf", [(-12, -0.6), (12, -0.6), (12, 12), (-12, 12)], -3.0, 0.0, pm["sheet_snow"], pm["sheet_snow"])
    for k in range(3):                                     # pier from the shelf edge into the water
        kit.instance(f"pier{k}", objs["vesper_pier_segment"], (-3.0, -1.6 - 2.0 * k, -0.4))
    kit.text_label("vesper_pier_segment (x3)", (-3.0, -7.9, -0.395), 0.13, pm["label"])
    kit.instance("ib", objs["vesper_icebreaker"], (1.5, -4.0, -0.4))
    kit.text_label("vesper_icebreaker", (1.5, -6.2, -0.395), 0.13, pm["label"])
    vc.plane("ocean", -20, 20, -20, 20, -0.4, pm["ocean"])
    vc.preview_world(scene)
    kit.add_ortho_camera((0.0, 0.0, 0.3), 55.0, 14.0)
    vc.setup_render(scene, args.engine, args.samples, 1800, 1700)
    kit.render(os.path.join(args.preview_dir, "preview-infra.png"))


if __name__ == "__main__":
    main()
