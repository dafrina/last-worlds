"""Bastion-9 production boss model for Last Worlds (docs/15-bastion-slice.md, production contract).

A massive Khepri tracked mobile fortress: two tread belts, an armoured scarab-like hull
around a large circular glowing core, and two elevated weapon housings with four-barrel
guns. Separate nodes for every runtime state: housings, guns (pivoted for yaw), wrecked
housings, battery shutters, the core, and two sliding core-shutter halves.

Geometry, vertex colours (AO, edge wear, ochre dust, scorch) and UVs are generated from
code; deterministic (fixed seed, no time-based values). Shares the hard-surface helpers
of khepri_infra.py / khepri_kit.py (same folder) without writing bytecode.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/bastion.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/khepri/bastion-9.glb)" \\
        --preview-dir "$(wslpath -w $R/art/bastion-9)" \\
        --textures "$(wslpath -w $R/art/source/polyhaven)" \\
        --terrain-kit "$(wslpath -w $R/public/assets/khepri/khepri-kit.glb)"

Coordinates: geometry is authored in Blender space (x right, y = -glTF z, z up), so the
fortress front (glTF +z, toward the player) is Blender -y.
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
import khepri_infra as infra  # noqa: E402
from khepri_infra import HS, merge_hs, xform, strut, loft, octagon  # noqa: E402

SEED = "bastion-9-v1"
MATS = ("bastion_armor", "bastion_trim", "bastion_glow")
ARMOR, TRIM, GLOW = 0, 1, 2
COLOR_ATTR = "Col"
BASE = -0.1
TOP_MAX = 2.2                    # top <= 2.3 above the base at -0.1 (revision 2b)
TRI_RANGE = (15000, 24000)
FOOTPRINT = (7.6, 6.6)           # x x z
GLOW_HEX = "#ff7a26"

PAINTS = dict(infra.PAINTS)
PAINTS.update({"belt": ("#252220", 0.3), "plate": ("#2f3032", 0.4)})


def B(gx, gy, gz):
    """glTF (x, y up, z toward the player) -> Blender (x, y, z up)."""
    return (gx, -gz, gy)


# Node origins (glTF): the contract sockets and pivots.
SOCKETS = {
    "bastion_hull": (0.0, 0.0, 0.0),
    "bastion_tread_left": (-2.85, 0.0, -0.4),
    "bastion_tread_right": (2.85, 0.0, -0.4),
    "bastion_battery_left": (-2.2, 1.45, 0.0),
    "bastion_battery_right": (2.2, 1.45, 0.0),
    "bastion_gun_left": (-2.2, 1.55, 0.2),
    "bastion_gun_right": (2.2, 1.55, 0.2),
    "bastion_battery_left_wreck": (-2.2, 1.45, 0.0),
    "bastion_battery_right_wreck": (2.2, 1.45, 0.0),
    "bastion_shutter_left": (-2.2, 1.6, -0.5),
    "bastion_shutter_right": (2.2, 1.6, -0.5),
    "bastion_core": (0.0, 1.45, -1.35),
    "bastion_core_shutter_a": (-0.62, 1.72, -1.35),
    "bastion_core_shutter_b": (0.62, 1.72, -1.35),
}
NODES = list(SOCKETS)
TREADS = ("bastion_tread_left", "bastion_tread_right")
DEFAULT_STATE = ["bastion_hull", "bastion_tread_left", "bastion_tread_right", "bastion_battery_left",
                 "bastion_battery_right", "bastion_gun_left", "bastion_gun_right", "bastion_shutter_left",
                 "bastion_shutter_right", "bastion_core", "bastion_core_shutter_a", "bastion_core_shutter_b"]
WRECK_STATE = ["bastion_hull", "bastion_tread_left", "bastion_tread_right", "bastion_battery_left_wreck",
               "bastion_battery_right_wreck", "bastion_core", "bastion_core_shutter_a", "bastion_core_shutter_b"]

# Tread loop (Blender): pods at x = +-2.85, belt along y from -2.8 (front) to 3.6 (rear); the loop
# centre stays at y = 0.4 (the tread node socket, glTF z = -0.4). Revision 3: the belt is smooth (no
# geometric grousers; the runtime scrolls a link texture along v) and split into two strips by a
# central guide gap in which the sprocket and idler teeth run and show above the belt.
TREAD_X, BELT_W, BELT_T, GROUSER = 2.85, 1.2, 0.09, 0.0
GUIDE_GAP = 0.24
LOOP_R = 0.64
LOOP_ZC = BASE + LOOP_R + GROUSER
LOOP_Y0, LOOP_Y1 = -2.8 + LOOP_R + GROUSER, 3.6 - LOOP_R - GROUSER

# Rotating wheels (revision 3): pivot at the axle centre, rotation about local x.
SPROCKET_TIP, SPROCKET_TEETH = 0.69, 14     # rear drive sprocket (teeth stand 0.05 above the belt)
IDLER_TIP, IDLER_TEETH = 0.67, 10           # front idler
BELT_INNER_R = LOOP_R - BELT_T              # rolling radius of sprocket and idler (belt inner surface)
DRIVE_RAISE = 0.06                          # sprocket/idler axles sit this far above the belt arc centre
ROADWHEEL_R = 0.30
ROADWHEEL_Z = LOOP_ZC - LOOP_R + BELT_T + ROADWHEEL_R
ROADWHEEL_Y = [LOOP_Y0 + 0.55 + (LOOP_Y1 - LOOP_Y0 - 1.1) * k / 5 for k in range(6)]   # Blender y, front first
WHEELS = {}
for _sx, _nm in ((-1, "left"), (1, "right")):
    WHEELS[f"bastion_sprocket_{_nm}"] = dict(t=(_sx * TREAD_X, LOOP_ZC + DRIVE_RAISE, -LOOP_Y1), kind="sprocket", side=_sx,
                                            radius=BELT_INNER_R, outer=SPROCKET_TIP)
    WHEELS[f"bastion_idler_{_nm}"] = dict(t=(_sx * TREAD_X, LOOP_ZC + DRIVE_RAISE, -LOOP_Y0), kind="idler", side=_sx,
                                          radius=BELT_INNER_R, outer=IDLER_TIP)
    for _k, _y in enumerate(ROADWHEEL_Y):
        WHEELS[f"bastion_roadwheel_{_nm}_{_k}"] = dict(t=(_sx * TREAD_X, ROADWHEEL_Z, -_y), kind="road", side=_sx,
                                                      radius=ROADWHEEL_R, outer=ROADWHEEL_R)
for _name, _w in WHEELS.items():
    SOCKETS[_name] = tuple(round(c, 6) for c in _w["t"])
NODES = list(SOCKETS)
DEFAULT_STATE += list(WHEELS)
WRECK_STATE += list(WHEELS)


def lamp(hs, p, r=0.04, h=0.06):
    """Hot orange lamp: dark housing block plus a faceted glowing lens."""
    hs.box((p[0], p[1], p[2] + h * 0.2), (r * 2.4, r * 2.4, h * 0.4), 0.0, "graphite_dk", ARMOR)
    hs.cyl((p[0], p[1], p[2] + h * 0.4), (0, 0, 1), r, h * 0.6, 6, 0.0, "lamp", mat=GLOW, cap0=False, smooth=False)


def glow_strip(hs, c, size):
    hs.box(c, size, 0.0, "lamp", GLOW, bottom=True)


def gear(hs, c, axis_x, r, width, teeth, paint):
    """Toothed sprocket prism around an axis parallel to x."""
    pts = []
    for k in range(teeth * 2):
        a = math.pi * k / teeth
        rr = r if k % 2 == 0 else r * 0.84
        pts.append((math.cos(a) * rr, math.sin(a) * rr))
    n = len(pts)
    x0, x1 = c[0] - width * 0.5, c[0] + width * 0.5
    r0 = [hs.v((x0, c[1] + py, c[2] + pz)) for py, pz in pts]
    r1 = [hs.v((x1, c[1] + py, c[2] + pz)) for py, pz in pts]
    cen = c
    for k in range(n):
        j = (k + 1) % n
        hs.face((r0[k], r0[j], r1[j], r1[k]), paint, "edge" if k % 2 == 0 else "main", ARMOR, cen)
    hs.face(tuple(r0), paint, "main", ARMOR, outward=(-1, 0, 0))
    hs.face(tuple(r1), paint, "main", ARMOR, outward=(1, 0, 0))


# ----------------------------------------------------------------------------
# Treads: belt loops with v along the belt
# ----------------------------------------------------------------------------

def belt_loop():
    """Outer loop points (y, z), outward normals and arc length, closed (first point repeated)."""
    pts = []
    nrun, narc = 16, 12
    for k in range(nrun):                                 # bottom run, front -> rear
        pts.append((LOOP_Y0 + (LOOP_Y1 - LOOP_Y0) * k / nrun, LOOP_ZC - LOOP_R, 0.0, -1.0))
    for k in range(narc):                                 # rear wheel, bottom -> top
        a = -math.pi / 2 + math.pi * k / narc
        pts.append((LOOP_Y1 + math.cos(a) * LOOP_R, LOOP_ZC + math.sin(a) * LOOP_R, math.cos(a), math.sin(a)))
    for k in range(nrun):                                 # top run, rear -> front
        pts.append((LOOP_Y1 - (LOOP_Y1 - LOOP_Y0) * k / nrun, LOOP_ZC + LOOP_R, 0.0, 1.0))
    for k in range(narc):                                 # front wheel, top -> bottom
        a = math.pi / 2 + math.pi * k / narc
        pts.append((LOOP_Y0 + math.cos(a) * LOOP_R, LOOP_ZC + math.sin(a) * LOOP_R, math.cos(a), math.sin(a)))
    pts.append(pts[0])
    out, s = [], 0.0
    for k, (y, z, ny, nz) in enumerate(pts):
        if k:
            s += math.hypot(y - pts[k - 1][0], z - pts[k - 1][1])
        out.append((y, z, ny, nz, s))
    return out


def build_tread(side):
    """Belt only (outer, inner and edge faces). Returns hs and per-corner (u, v) in glTF terms:
    u across the belt, v = arc length along the loop, so the runtime scrolls v."""
    hs = Recorder(random.Random(f"{SEED}:tread{side}"))
    loop = belt_loop()
    xc = side * TREAD_X
    xa, xb = xc - BELT_W * 0.5, xc + BELT_W * 0.5
    strips = [(xa, xc - GUIDE_GAP * 0.5), (xc + GUIDE_GAP * 0.5, xb)]   # two belt strips, guide gap between
    rings = []
    for y, z, ny, nz, sv in loop:
        outer = [hs.v((x, y, z)) for st in strips for x in st]
        inner = [hs.v((x, y - ny * BELT_T, z - nz * BELT_T)) for st in strips for x in st]
        rings.append((outer, inner, sv, ny, nz))
    uv = []
    for a_, b_ in zip(rings, rings[1:]):
        o0, i0, s0, ny0, nz0 = a_
        o1, i1, s1, ny1, nz1 = b_
        nrm = Vector((0.0, (ny0 + ny1) * 0.5, (nz0 + nz1) * 0.5))
        for k in (0, 2):                                  # each strip: outer, inner and two edge faces
            ua, ub = (strips[0] if k == 0 else strips[1])
            u0, u1 = ua - xc, ub - xc
            hs.face((o0[k], o0[k + 1], o1[k + 1], o1[k]), "belt", "main", ARMOR, outward=tuple(nrm))
            uv.append([(u0, s0), (u1, s0), (u1, s1), (u0, s1)])
            hs.face((i0[k], i1[k], i1[k + 1], i0[k + 1]), "belt", "main", ARMOR, outward=tuple(-nrm))
            uv.append([(u0, s0), (u0, s1), (u1, s1), (u1, s0)])
            hs.face((o0[k], o1[k], i1[k], i0[k]), "belt", "edge", ARMOR, outward=(-1, 0, 0))
            uv.append([(0.0, s0), (0.0, s1), (BELT_T, s1), (BELT_T, s0)])
            hs.face((o0[k + 1], i0[k + 1], i1[k + 1], o1[k + 1]), "belt", "edge", ARMOR, outward=(1, 0, 0))
            uv.append([(0.0, s0), (BELT_T, s0), (BELT_T, s1), (0.0, s1)])
    # face() may have reversed a face to orient it; keep UVs paired with final vertex order
    fixed = []
    for f, orig, corner_uv in zip(hs.faces, hs._raw, uv):
        fixed.append(corner_uv if tuple(f) == tuple(orig) else list(reversed(corner_uv)))
    hs.belt_uv = fixed
    return hs


LINK_COUNT = 48                                       # links per belt loop (texture repeats seamlessly)


def link_pitch():
    """Belt link pitch in v units: the loop length divided by LINK_COUNT."""
    return belt_loop()[-1][4] / LINK_COUNT


def loop_point(loop, s):
    """Point and outward normal (y, z, ny, nz) at arc length s along the sampled loop."""
    for a, b in zip(loop, loop[1:]):
        if a[4] <= s <= b[4]:
            t = (s - a[4]) / max(b[4] - a[4], 1e-9)
            ny, nz = a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t
            ln = math.hypot(ny, nz) or 1.0
            return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ny / ln, nz / ln
    y, z, ny, nz, _s = loop[-1]
    return y, z, ny, nz


# ----------------------------------------------------------------------------
# Hull
# ----------------------------------------------------------------------------

def hull_profile_loft(hs, x0, x1, profile, zoff, paint, mat=ARMOR):
    loft(hs, [(x0, 1.0, 1.0, zoff), (x1, 1.0, 1.0, zoff)], [(y, z - zoff) for y, z in profile], paint,
         cap_paint=paint, cap_tag="main", mat=mat)


def core_turret(hs, rng):
    """Blend the round core housing into the hull: a sloped octagonal glacis ring stepping down to
    the deck, a stepped collar, a ring wall seating the core shutters, and a recessed glowing groove."""
    cx, cy = 0.0, 1.35
    hs.cyl((cx, cy, 0.98), (0, 0, 1), 2.0, 0.22, 8, 0.0, "graphite", ARMOR, cap0=False, cap1=False, r1=1.72,
           rot=math.pi / 8, smooth=False)
    for k in range(8):                                     # corner ribs down the glacis ring
        a = math.pi / 8 + k * math.pi / 4
        strut(hs, (cx + math.cos(a) * 2.0, cy + math.sin(a) * 2.0, 0.99),
              (cx + math.cos(a) * 1.72, cy + math.sin(a) * 1.72, 1.21), 0.03, 4, "steel")
    octa = [(cx + math.cos(a) * 1.74, cy + math.sin(a) * 1.74) for a in [math.pi / 8 + k * math.pi / 4 for k in range(8)]]
    hs.prism(octa, 1.18, 1.3, 0.03, "graphite_dk")
    n = 32
    angs = [2 * math.pi * k / n for k in range(n)]

    def ring(r, z):
        return [hs.v((cx + math.cos(a) * r, cy + math.sin(a) * r, z)) for a in angs]

    r_out, r_in, z_top = 1.64, 1.5, 1.46
    ob, ot, oc = ring(r_out, 1.29), ring(r_out, z_top - 0.03), ring(r_out - 0.03, z_top)
    ic, ib = ring(r_in + 0.02, z_top), ring(r_in, 1.2)
    gb = ring(1.24, 1.2)
    for k in range(n):
        j = (k + 1) % n
        a = (angs[k] + angs[j]) * 0.5 if j else (angs[k] + 2 * math.pi) * 0.5
        out = (math.cos(a), math.sin(a), 0.0)
        hs.face((ob[k], ob[j], ot[j], ot[k]), "graphite", "main", ARMOR, outward=out)
        hs.face((ot[k], ot[j], oc[j], oc[k]), "graphite", "edge", ARMOR, outward=(out[0], out[1], 1.0))
        hs.face((oc[k], oc[j], ic[j], ic[k]), "steel", "main", ARMOR, outward=(0, 0, 1))
        hs.face((ic[k], ic[j], ib[j], ib[k]), "graphite_dk", "main", ARMOR, outward=(-out[0], -out[1], 0.0))
        hs.face((ib[k], ib[j], gb[j], gb[k]), "graphite_dk", "main", ARMOR, outward=(0, 0, 1))
    for k in range(12):                                    # glowing slits in the recessed groove
        a = 2 * math.pi * (k + 0.5) / 12
        sl = HS(rng)
        sl.box((0.0, 0.0, 0.0), (0.18, 0.05, 0.02), 0.0, "lamp", GLOW, bottom=True)
        merge_hs(hs, sl, xform((cx + math.cos(a) * 1.4, cy + math.sin(a) * 1.4, 1.205), (0.0, 0.0, a + math.pi / 2)))
    for k in range(8):                                     # armoured lugs on the rim
        a = 2 * math.pi * (k + 0.5) / 8
        lug = HS(rng)
        lug.box((0.0, 0.0, 0.0), (0.18, 0.13, 0.06), 0.015, "ochre_w" if k % 2 else "rust_w", TRIM)
        merge_hs(hs, lug, xform((cx + math.cos(a) * 1.57, cy + math.sin(a) * 1.57, z_top + 0.03),
                                (0.0, 0.0, a + math.pi / 2)))
    for k in range(6):                                     # window strips on the front of the ring wall
        a = -math.pi / 2 + (k - 2.5) * 0.36
        win = HS(rng)
        win.box((0.0, 0.0, 0.0), (0.2, 0.012, 0.045), 0.0, "lamp", GLOW, bottom=True)
        merge_hs(hs, win, xform((cx + math.cos(a) * (r_out + 0.004), cy + math.sin(a) * (r_out + 0.004), 1.37),
                                (0.0, 0.0, a + math.pi / 2)))


def deck_turret(hs, rng, x, y, z, yaw):
    """Small secondary twin-gun turret (barrels toward Blender -y, i.e. the front, before yaw)."""
    t = HS(rng)
    t.cyl((0.0, 0.0, 0.0), (0, 0, 1), 0.2, 0.05, 12, 0.01, "steel", ARMOR, cap0=False)
    t.box((0.0, 0.03, 0.14), (0.34, 0.38, 0.16), 0.045, "graphite", ARMOR)
    t.box((0.0, -0.16, 0.14), (0.26, 0.06, 0.11), 0.015, "ochre_w", TRIM)
    for bx in (-0.065, 0.065):
        t.cyl((bx, -0.19, 0.14), (0, -1, 0), 0.028, 0.36, 8, 0.0, "graphite_dk", ARMOR, cap0=False)
    glow_strip(t, (0.0, 0.225, 0.16), (0.18, 0.01, 0.025))
    merge_hs(hs, t, xform((x, y, z), (0.0, 0.0, yaw)))


def bolt_ring(hs, c, sx, r, n, size, paint="steel"):
    """Bolt heads / lugs on a wheel face facing +sx (rotation reads from them)."""
    for k in range(n):
        a = 2 * math.pi * k / n
        hs.box((c[0], c[1] + math.cos(a) * r, c[2] + math.sin(a) * r), (size, size, size), 0.0, paint, ARMOR)


def build_wheel(name):
    """Sprocket, idler or road wheel around its axle (Blender coordinates, axle along x)."""
    w = WHEELS[name]
    sx = w["side"]
    rng = random.Random(f"{SEED}:{name}")
    hs = HS(rng)
    cx, cy, cz = B(*w["t"])
    gap = GUIDE_GAP * 0.5
    if w["kind"] in ("sprocket", "idler"):
        teeth = SPROCKET_TEETH if w["kind"] == "sprocket" else IDLER_TEETH
        gear(hs, (cx, cy, cz), True, w["outer"], GUIDE_GAP - 0.04, teeth, "steel")          # teeth in the gap
        side_r = BELT_INNER_R - DRIVE_RAISE - 0.03          # clears the belt's inner surface
        for sgn in (-1, 1):                                                                  # discs under the belt
            hs.cyl((cx + sgn * gap, cy, cz), (sgn, 0, 0), side_r, 0.5 - gap, 16, 0.02,
                   "graphite_dk" if w["kind"] == "sprocket" else "graphite", ARMOR, cap0=False)
        hs.cyl((cx + sx * 0.5, cy, cz), (sx, 0, 0), 0.25, 0.1, 14, 0.02, "rust_w", TRIM, cap0=False)  # hub
        hs.cyl((cx + sx * 0.6, cy, cz), (sx, 0, 0), 0.09, 0.05, 8, 0.0, "steel", ARMOR, cap0=False, smooth=False)
        bolt_ring(hs, (cx + sx * 0.615, cy, cz), sx, 0.17, 6, 0.04)
        for k in range(6):                                                                   # spoke ribs on the disc
            a = 2 * math.pi * (k + 0.5) / 6
            rib = HS(rng)
            rib.box((0.0, 0.0, 0.0), (0.03, 0.05, side_r - 0.28), 0.0, "steel", ARMOR)
            merge_hs(hs, rib, xform((cx + sx * 0.515, cy + math.cos(a) * (side_r + 0.26) * 0.5,
                                     cz + math.sin(a) * (side_r + 0.26) * 0.5), (a - math.pi / 2, 0.0, 0.0)))
    else:
        r = w["outer"]
        for sgn in (-1, 1):                                                                  # double road wheel
            hs.cyl((cx + sgn * gap, cy, cz), (sgn, 0, 0), r, 0.56 - gap, 12, 0.03, "graphite_dk", ARMOR, cap0=False)
        hs.cyl((cx + sx * 0.56, cy, cz), (sx, 0, 0), 0.11, 0.05, 8, 0.012, "rust_w", TRIM, cap0=False)
        bolt_ring(hs, (cx + sx * 0.575, cy, cz), sx, 0.18, 6, 0.04)
        for k in range(6):                                                                   # spokes
            a = 2 * math.pi * k / 6
            rib = HS(rng)
            rib.box((0.0, 0.0, 0.0), (0.025, 0.04, 0.12), 0.0, "steel", ARMOR)
            merge_hs(hs, rib, xform((cx + sx * 0.572, cy + math.cos(a) * 0.17, cz + math.sin(a) * 0.17),
                                    (a - math.pi / 2, 0.0, 0.0)))
    return hs


def tread_gear(hs, rng, sx):
    xc = sx * TREAD_X
    ys = ROADWHEEL_Y          # the sprockets, idlers and road wheels are separate rotating nodes
    # Outboard armoured skirt: an upper band of plates with ribs, hanging tabs between the wheels
    # (the cut-outs expose the wheels), a top rim, and glow strips.
    xo = xc + sx * (BELT_W * 0.5 + 0.1)
    y0, y1 = LOOP_Y0 + 0.3, LOOP_Y1 - 0.3
    nplates = 4
    for k in range(nplates):
        a = y0 + (y1 - y0) * k / nplates
        b = y0 + (y1 - y0) * (k + 1) / nplates
        paint, mat = (("ochre_w", TRIM) if k in (1, 2) else ("graphite", ARMOR))
        hs.box((xo, (a + b) * 0.5, 0.98), (0.08, b - a - 0.035, 0.48), 0.02, paint, mat)
        for j in range(3):
            yy = a + (b - a) * (j + 0.5) / 3
            hs.box((xo + sx * 0.05, yy, 0.98), (0.03, 0.06, 0.4), 0.0, "steel", ARMOR)
        glow_strip(hs, (xo + sx * 0.042, (a + b) * 0.5, 1.12), (0.012, (b - a) * 0.5, 0.03))
    for k in range(len(ys) - 1):
        ym = (ys[k] + ys[k + 1]) * 0.5
        hs.box((xo, ym, 0.6), (0.08, 0.28, 0.36), 0.02, "graphite", ARMOR)
    hs.box((xo - sx * 0.02, (y0 + y1) * 0.5, 1.24), (0.14, y1 - y0, 0.04), 0.012, "graphite_dk", ARMOR)
    # Rear guard sloping over the drive sprocket (casts a shadow on the links).
    guard = HS(rng)
    guard.box((0.0, 0.0, 0.0), (BELT_W + 0.22, 0.72, 0.07), 0.025, "graphite", ARMOR, bottom=True)
    guard.box((0.0, -0.1, 0.045), (BELT_W, 0.18, 0.02), 0.0, "ochre_w", TRIM)
    merge_hs(hs, guard, xform((xc, LOOP_Y1 + 0.12, LOOP_ZC + LOOP_R + GROUSER + 0.17), (-0.32, 0.0, 0.0)))
    lamp(hs, (xc - sx * 0.35, LOOP_Y1 - 0.05, LOOP_ZC + LOOP_R + GROUSER + 0.22), r=0.035, h=0.05)


def build_hull(rng):
    hs = HS(rng)
    # Lower hull between the treads: glacis front (Blender -y), deck, sloped rear.
    hull_profile_loft(hs, -2.24, 2.24, [(-2.1, 0.12), (-2.34, 0.42), (-1.78, 0.98), (2.55, 0.98), (2.95, 0.62),
                                        (2.82, 0.12)], 0.55, "graphite_dk")
    # Glacis armour: three plates laid on the slope, the centre one weathered ochre.
    slope = math.atan2(0.98 - 0.42, 2.34 - 1.78)
    for x, w, paint, mat in ((-1.55, 1.3, "graphite", ARMOR), (0.0, 1.5, "ochre_w", TRIM), (1.55, 1.3, "graphite", ARMOR)):
        pl = HS(rng)
        pl.box((0.0, 0.0, 0.0), (w, 0.72, 0.07), 0.025, paint, mat, bottom=True)
        merge_hs(hs, pl, xform((x, -2.07, 0.73), (slope, 0.0, 0.0)))
        if paint == "graphite":                              # heavy ribbing on the outer glacis plates
            for k in range(3):
                rib = HS(rng)
                rib.box((0.0, 0.0, 0.0), (w - 0.16, 0.06, 0.05), 0.012, "steel", ARMOR, bottom=False)
                merge_hs(hs, rib, xform((x, -2.07, 0.73), (slope, 0.0, 0.0)) @ xform((0.0, -0.22 + k * 0.22, 0.06)))
    for x in (-0.55, 0.55):                                  # headlamp housings and slit lights
        hs.box((x, -2.28, 0.62), (0.32, 0.14, 0.14), 0.03, "graphite_dk", ARMOR)
        glow_strip(hs, (x, -2.355, 0.62), (0.22, 0.012, 0.05))
    glow_strip(hs, (0.0, -2.33, 0.36), (1.6, 0.012, 0.035))
    # Scarab mandibles: two angled armour horns at the lower front corners.
    for sx in (-1, 1):
        horn = HS(rng)
        loft(horn, [(0.0, 1.0, 1.0, 0.0), (0.26, 0.45, 0.55, -0.02)],
             [(-0.12, -0.1), (0.12, -0.1), (0.1, 0.08), (-0.1, 0.08)], "rust_w", mat=TRIM, cap_tag="main",
             cap_paint="rust_w")
        merge_hs(hs, horn, xform((sx * 1.95, -2.18, 0.3), (0.0, 0.0, -math.pi / 2 + sx * 0.25)))
    # Ram teeth along the lower front edge and hazard stripes on the centre glacis plate.
    for k in range(7):
        tooth = HS(rng)
        loft(tooth, [(0.0, 1.0, 1.0, 0.0), (0.2, 0.3, 0.4, -0.01)], [(-0.07, -0.05), (0.07, -0.05), (0.05, 0.05),
                                                                     (-0.05, 0.05)], "steel", cap_tag="main",
             cap_paint="steel")
        merge_hs(hs, tooth, xform((-1.2 + k * 0.4, -2.26, 0.22), (0.0, 0.0, -math.pi / 2)))
    for k in range(6):
        st = HS(rng)
        st.box((0.0, 0.0, 0.0), (0.08, 0.5, 0.012), 0.0, "graphite_dk", ARMOR, bottom=True)
        merge_hs(hs, st, xform((-0.55 + k * 0.22, -2.04, 0.78), (slope, 0.0, 0.5)))
    for x in (-1.45, 1.45):
        lamp(hs, (x, -2.0, 0.84), r=0.035, h=0.05)
    # Deck plating with seams around the core collar.
    for (x, y, w, d, paint, mat) in ((-1.55, -1.35, 1.3, 0.75, "graphite", ARMOR), (1.55, -1.35, 1.3, 0.75, "graphite", ARMOR),
                                     (0.0, -1.42, 1.5, 0.62, "steel", ARMOR), (-1.8, 0.0, 0.7, 1.2, "plate", ARMOR),
                                     (1.8, 0.0, 0.7, 1.2, "plate", ARMOR), (-1.95, 1.55, 0.55, 1.6, "ochre_w", TRIM),
                                     (1.95, 1.55, 0.55, 1.6, "ochre_w", TRIM), (-0.95, -0.55, 0.75, 0.6, "graphite", ARMOR),
                                     (0.95, -0.55, 0.75, 0.6, "graphite", ARMOR)):
        hs.box((x, y, 1.0), (w, d, 0.06), 0.02, paint, mat)
    core_turret(hs, rng)
    # Battery sponsons: a shelf bridging hull and tread pod carries each housing; the belt runs beneath.
    for sx in (-1, 1):
        hs.box((sx * 1.86, 0.0, 1.095), (0.72, 1.6, 0.23), 0.03, "graphite_dk", ARMOR)
        hs.box((sx * 2.24, 0.0, 1.245), (1.48, 1.75, 0.07), 0.02, "graphite", ARMOR)
        glow_strip(hs, (sx * 2.24, -0.885, 1.245), (1.1, 0.012, 0.025))
        for y in (-0.6, 0.6):
            hs.box((sx * 2.9, y, 1.2), (0.1, 0.12, 0.12), 0.015, "rust_w", TRIM)
    # Rear: exhaust stacks with glowing throats, radiator fins, antennas.
    for sx in (-1, 1):
        for y in (2.35, 2.7):
            hs.cyl((sx * 1.85, y, 0.98), (0, 0, 1), 0.12, 0.42, 10, 0.0, "graphite_dk", ARMOR, cap0=False, cap1=False)
            hs.cyl((sx * 1.85, y, 1.4), (0, 0, 1), 0.14, 0.05, 10, 0.0, "rust_w", TRIM, cap0=False)
            hs.cyl((sx * 1.85, y, 1.36), (0, 0, 1), 0.085, 0.09, 8, 0.0, "lamp", GLOW, cap0=False, smooth=False)
        strut(hs, (sx * 2.05, 2.85, 0.98), (sx * 2.05, 2.85, 1.7), 0.015, 4, "steel")
        lamp(hs, (sx * 2.05, 2.85, 1.7), r=0.025, h=0.04)
    for k in range(9):
        hs.box((-0.8 + k * 0.2, 2.86, 0.72), (0.05, 0.22, 0.3), 0.0, "steel", ARMOR)
    hs.box((0.0, 2.8, 0.58), (1.9, 0.12, 0.05), 0.0, "graphite_dk", ARMOR)
    # Deck pipework and hatches.
    infra.pipe_run(hs, [(-1.4, -0.9, 1.06), (-1.4, 0.2, 1.06), (-1.62, 0.2, 1.06)], 0.045, "rust_w")
    infra.pipe_run(hs, [(1.4, -0.9, 1.06), (1.4, 0.2, 1.06), (1.62, 0.2, 1.06)], 0.045, "rust_w")
    for x, y in ((-0.95, -0.55), (0.95, -0.55)):
        hs.cyl((x, y, 1.03), (0, 0, 1), 0.16, 0.04, 10, 0.01, "steel", ARMOR, cap0=False)
    for sx in (-1, 1):                                       # deck edge rails
        for k in range(6):
            hs.box((sx * 1.6, -1.65 + k * 0.33, 1.1), (0.02, 0.02, 0.16), 0.0, "steel", ARMOR)
        hs.box((sx * 1.6, -0.82, 1.18), (0.02, 1.68, 0.02), 0.0, "steel", ARMOR)
        lamp(hs, (sx * 2.08, -1.75, 0.98), r=0.035, h=0.05)
    # Secondary twin-gun turrets on the deck corners.
    for sx in (-1, 1):
        deck_turret(hs, rng, sx * 1.28, -1.35, 1.03, sx * 0.25)
        deck_turret(hs, rng, sx * 1.95, 1.65, 1.03, sx * math.pi * 0.3)
    # Command block at the front: raised armoured wedge with a glowing visor and sensor domes.
    hull_profile_loft(hs, -0.92, 0.92, [(-1.72, 0.98), (-1.72, 1.12), (-1.35, 1.36), (-0.42, 1.36), (-0.35, 1.28),
                                        (-0.35, 0.98)], 1.15, "graphite")
    glow_strip(hs, (0.0, -1.585, 1.255), (1.5, 0.012, 0.045))
    for x in (-0.6, -0.2, 0.2, 0.6):
        glow_strip(hs, (x, -1.735, 1.06), (0.18, 0.012, 0.04))
    hs.box((0.0, -0.9, 1.38), (1.3, 0.75, 0.05), 0.02, "ochre_w", TRIM)
    for x in (-0.45, 0.45):
        hs.cyl((x, -0.75, 1.4), (0, 0, 1), 0.13, 0.05, 12, 0.0, "steel", ARMOR, cap0=False)
        hs.dome((x, -0.75, 1.45), (0, 0, 1), 0.13, 0.08, 12, "graphite_dk", bands=2)
    hs.box((0.0, -1.2, 1.4), (0.5, 0.2, 0.06), 0.015, "graphite_dk", ARMOR)
    lamp(hs, (0.0, -1.2, 1.43), r=0.03, h=0.05)
    # Radiator banks either side of the core collar, rear.
    for sx in (-1, 1):
        hs.box((sx * 2.0, 2.25, 1.03), (0.5, 0.5, 0.1), 0.02, "graphite_dk", ARMOR)
        for k in range(6):
            hs.box((sx * 2.0, 2.04 + k * 0.084, 1.11), (0.44, 0.025, 0.07), 0.0, "steel", ARMOR)
        glow_strip(hs, (sx * 2.0, 2.25, 1.085), (0.4, 0.42, 0.004))
    # Tread pods (static parts): drive sprockets, idlers, heavy road wheels, armoured outboard skirts
    # with cut-outs over the wheels, and a rear guard over each drive sprocket.
    for sx in (-1, 1):
        tread_gear(hs, rng, sx)
    return hs


# ----------------------------------------------------------------------------
# Batteries, guns, wrecks, shutters
# ----------------------------------------------------------------------------

HOUSING_PROFILE = [(-0.8, 1.02), (-0.8, 1.28), (-0.46, 1.52), (0.7, 1.52), (0.8, 1.4), (0.8, 1.02)]


def housing_body(hs, xc, rng, paint="graphite", cut=None):
    prof = HOUSING_PROFILE
    hull_profile_loft(hs, xc - 0.66, xc + 0.66, prof, 1.3, paint)


def build_battery(side, rng):
    hs = HS(rng)
    xc = side * 2.2
    housing_body(hs, xc, rng)
    out = side
    for y, w in ((-0.3, 0.62), (0.42, 0.6)):             # outer armour plates, weathered ochre
        hs.box((xc + out * 0.68, y, 1.27), (0.05, w, 0.4), 0.015, "ochre_w", TRIM)
    hs.box((xc - out * 0.68, 0.1, 1.26), (0.05, 1.0, 0.36), 0.015, "graphite", ARMOR)
    for y in (-0.3, 0.42):                                 # skirt plates down to the deck
        hs.box((xc + out * 0.72, y, 1.08), (0.04, 0.55, 0.12), 0.01, "graphite_dk", ARMOR)
    hs.box((xc, 0.12, 1.53), (1.1, 0.95, 0.03), 0.01, "graphite_dk", ARMOR)          # roof cap
    for k in range(4):                                     # glowing vent slits on the inboard face
        glow_strip(hs, (xc - out * 0.71, -0.35 + k * 0.22, 1.2), (0.012, 0.12, 0.04))
    for sx in (-1, 1):
        hs.box((xc + sx * 0.5, -0.66, 1.36), (0.14, 0.2, 0.08), 0.015, "steel", ARMOR)
    hs.cyl((xc, -0.15, 1.52), (0, 0, 1), 0.36, 0.03, 16, 0.0, "steel", ARMOR, cap0=False)        # gun race
    hs.cyl((xc, 0.4, 1.545), (0, 0, 1), 0.26, 0.02, 12, 0.0, "graphite_dk", ARMOR, cap0=False)     # vent ring
    hs.cyl((xc, 0.4, 1.547), (0, 0, 1), 0.2, 0.02, 12, 0.0, "lamp", GLOW, cap0=False, smooth=False)  # target vent
    for sx in (-1, 1):                                     # hand rails along the roof edge
        hs.box((xc + sx * 0.6, 0.12, 1.6), (0.02, 0.9, 0.02), 0.0, "steel", ARMOR)
        for y in (-0.3, 0.55):
            hs.box((xc + sx * 0.6, y, 1.57), (0.02, 0.02, 0.06), 0.0, "steel", ARMOR)
    hs.box((xc, 0.81, 1.15), (0.5, 0.03, 0.22), 0.01, "ochre_w", TRIM, bottom=True)          # rear hatch
    hs.cyl((xc - 0.42, 0.86, 1.3), (1, 0, 0), 0.13, 0.84, 12, 0.015, "rust_w", TRIM)              # ammo drum
    for y in (-0.05, 0.2, 0.45):
        glow_strip(hs, (xc + out * 0.665, y, 1.18), (0.012, 0.14, 0.03))
    lamp(hs, (xc + out * 0.45, 0.68, 1.52), r=0.03, h=0.05)
    return hs


def build_gun(side, rng):
    """Four-barrel gun on a yaw ring; pivot = SOCKETS gun position."""
    hs = HS(rng)
    px, py, pz = B(*SOCKETS[f"bastion_gun_{'left' if side < 0 else 'right'}"])
    hs.cyl((px, py, pz), (0, 0, 1), 0.34, 0.05, 16, 0.01, "steel", ARMOR, cap0=False)
    hs.box((px, py - 0.02, pz + 0.135), (0.72, 0.6, 0.17), 0.045, "graphite", ARMOR)
    hs.box((px, py - 0.36, pz + 0.13), (0.62, 0.08, 0.16), 0.025, "ochre_w", TRIM)
    for sx in (-1, 1):
        hs.box((px + sx * 0.38, py + 0.05, pz + 0.12), (0.06, 0.4, 0.13), 0.015, "graphite_dk", ARMOR)
    for bx in (-0.16, 0.0, 0.16):
        for bz in (0.08, 0.18):
            hs.cyl((px + bx, py - 0.4, pz + bz), (0, -1, 0), 0.045, 1.15, 10, 0.0, "graphite_dk", ARMOR,
                   cap0=False, cap1=False)
            hs.cyl((px + bx, py - 1.42, pz + bz), (0, -1, 0), 0.058, 0.16, 10, 0.0, "steel", ARMOR, cap0=False)
            hs.cyl((px + bx, py - 1.58, pz + bz), (0, -1, 0), 0.03, 0.005, 6, 0.0, "lamp", GLOW, cap0=False,
                   smooth=False)
    for y in (-0.72, -1.08):
        hs.box((px, py + y, pz + 0.13), (0.5, 0.06, 0.2), 0.015, "steel", ARMOR)
    hs.box((px, py + 0.24, pz + 0.12), (0.4, 0.14, 0.1), 0.02, "graphite_dk", ARMOR)
    glow_strip(hs, (px, py + 0.315, pz + 0.12), (0.26, 0.01, 0.03))
    return hs


def build_wreck(side, rng):
    """Scorched, broken housing with bent barrels drooping onto the hull."""
    hs = HS(rng)
    xc = side * 2.2
    rear = HS(rng)
    hull_profile_loft(rear, xc - 0.62, xc + 0.62, [(-0.05, 1.06), (-0.05, 1.42), (0.66, 1.42), (0.75, 1.34), (0.75, 1.06)],
                      1.25, "char")
    merge_hs(hs, rear, xform((0.0, 0.0, 0.0), (0.0, 0.0, 0.0)))
    front = HS(rng)
    hull_profile_loft(front, -0.6, 0.6, [(-0.4, -0.2), (-0.4, 0.02), (-0.15, 0.2), (0.3, 0.2), (0.3, -0.2)], 0.0, "burnt")
    merge_hs(hs, front, xform((xc - side * 0.08, -0.3, 1.18), (math.radians(-14.0), math.radians(side * 9.0),
                                                              math.radians(side * 6.0))))
    for k in range(5):                                     # torn plates
        pl = HS(rng)
        pl.box((0.0, 0.0, 0.0), (rng.uniform(0.18, 0.34), rng.uniform(0.1, 0.22), 0.03), 0.0,
               rng.choice(("char", "burnt", "ochre_w")), TRIM, bottom=True)
        merge_hs(hs, pl, xform((xc + rng.uniform(-0.6, 0.6), rng.uniform(-0.7, 0.8), 1.05 + rng.uniform(0.0, 0.25)),
                               (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(0, math.pi))))
    # Bent barrels: three segments each, kinked down and sideways.
    for k, (bx, bz) in enumerate(((-0.1, 1.4), (0.1, 1.42), (0.05, 1.3))):
        p = Vector((xc + bx, -0.45, bz))
        d = Vector((side * 0.05 * (k - 1), -1.0, 0.0)).normalized()
        for seg in range(3):
            ln = (0.45, 0.35, 0.3)[seg]
            strut(hs, p, p + d * ln, 0.045, 8, "char")
            p = p + d * ln
            d = (d + Vector((side * rng.uniform(-0.25, 0.25), 0.0, -rng.uniform(0.25, 0.5)))).normalized()
    hs.cyl((xc, -0.15, 1.3), (0.1 * side, 0.2, 1.0), 0.33, 0.04, 14, 0.0, "char", ARMOR, cap0=False)  # cracked race
    for k in range(6):                                      # torn armour shards sticking up from the rim
        sh = HS(rng)
        sh.box((0.0, 0.0, 0.0), (rng.uniform(0.14, 0.26), 0.035, rng.uniform(0.16, 0.26)), 0.012,
               rng.choice(("char", "burnt", "graphite")), ARMOR, bottom=True)
        a = k / 6.0 * 2 * math.pi
        merge_hs(hs, sh, xform((xc + math.cos(a) * 0.5, 0.35 + math.sin(a) * 0.32, 1.4),
                               (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), a + math.pi / 2)))
    mant = HS(rng)                                          # toppled gun mantlet
    mant.box((0.0, 0.0, 0.0), (0.6, 0.5, 0.17), 0.04, "char", ARMOR)
    merge_hs(hs, mant, xform((xc + side * 0.35, -0.55, 1.12), (math.radians(-35.0), math.radians(side * 20.0), 0.4)))
    for k in range(3):                                      # three more bent barrels from the toppled mantlet
        p = Vector((xc + side * 0.35 + (k - 1) * 0.14, -0.75, 1.05))
        d = Vector((side * 0.1, -0.8, -0.4)).normalized()
        for seg in range(2):
            strut(hs, p, p + d * 0.32, 0.042, 8, "char")
            p = p + d * 0.32
            d = (d + Vector((side * 0.3, 0.0, -0.3))).normalized()
    for _k in range(6):
        pl = HS(rng)
        pl.box((0.0, 0.0, 0.0), (rng.uniform(0.1, 0.22), rng.uniform(0.08, 0.16), 0.025), 0.0, "char", ARMOR,
               bottom=True)
        merge_hs(hs, pl, xform((xc + rng.uniform(-0.65, 0.65), rng.uniform(-0.8, 0.8), 1.0 + rng.uniform(0.0, 0.1)),
                               (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, math.pi))))
    for y, z in ((0.2, 1.43), (-0.05, 1.3), (0.5, 1.38), (-0.4, 1.1)):  # smouldering embers
        hs.cyl((xc + side * 0.2, y, z), (0, 0, 1), 0.04, 0.02, 6, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    hs.scorch = [((xc, 0.0, 1.35), 0.9), ((xc - side * 0.3, -0.5, 1.2), 0.6)]
    return hs


def build_battery_shutter(side, rng):
    """Armoured lid over the housing top (behind the gun), closed while the battery is protected."""
    hs = HS(rng)
    cx, cy, cz = B(*SOCKETS[f"bastion_shutter_{'left' if side < 0 else 'right'}"])
    hs.box((cx, cy, cz), (1.22, 0.6, 0.1), 0.035, "graphite", ARMOR, bottom=True)
    hs.box((cx, cy, cz + 0.06), (0.92, 0.44, 0.04), 0.015, "ochre_w", TRIM)
    for sx in (-1, 1):
        hs.box((cx + sx * 0.52, cy + 0.24, cz + 0.02), (0.12, 0.14, 0.1), 0.015, "steel", ARMOR)
    for k in range(3):
        hs.box((cx, cy - 0.15 + k * 0.15, cz + 0.09), (0.8, 0.035, 0.02), 0.0, "graphite_dk", ARMOR)
    for sx in (-1, 1):                                     # hinge arms and side cheeks
        hs.box((cx + sx * 0.58, cy + 0.1, cz - 0.03), (0.05, 0.4, 0.07), 0.012, "steel", ARMOR)
        hs.box((cx + sx * 0.64, cy - 0.05, cz), (0.04, 0.5, 0.12), 0.012, "graphite", ARMOR)
    for k in range(4):
        hs.box((cx - 0.3 + k * 0.2, cy - 0.31, cz - 0.01), (0.12, 0.02, 0.06), 0.0, "graphite_dk", ARMOR)
    return hs


# ----------------------------------------------------------------------------
# Core and core shutters
# ----------------------------------------------------------------------------

CORE_C = B(*SOCKETS["bastion_core"])


def build_core(rng):
    hs = HS(rng)
    cx, cy, cz = CORE_C                                   # (0, 1.35, 1.45)
    hs.cyl((cx, cy, 1.16), (0, 0, 1), 1.22, 0.05, 24, 0.0, "graphite_dk", ARMOR, cap0=False, smooth=False)
    # Ring chamber wall: armoured segments with glowing gaps between them.
    nseg = 24
    for k in range(nseg):
        a = 2 * math.pi * k / nseg
        seg = HS(rng)
        paint, mat = ("ochre_w", TRIM) if k % 4 == 0 else ("graphite", ARMOR)
        seg.box((0.0, 0.0, 0.0), (0.2, 0.36, 0.4), 0.03, paint, mat, bottom=False)
        merge_hs(hs, seg, xform((cx + math.cos(a) * 1.2, cy + math.sin(a) * 1.2, 1.38), (0.0, 0.0, a + math.pi / 2)))
    for k in range(nseg):                                   # glow fins in the gaps
        a = 2 * math.pi * (k + 0.5) / nseg
        fin = HS(rng)
        fin.box((0.0, 0.0, 0.0), (0.04, 0.3, 0.34), 0.0, "lamp", GLOW, bottom=False)
        merge_hs(hs, fin, xform((cx + math.cos(a) * 1.18, cy + math.sin(a) * 1.18, 1.35), (0.0, 0.0, a + math.pi / 2)))
    # Glowing floor ring and the heart: a broad hot dome.
    infra_ring = HS(rng)
    infra_ring.flat_ring(cx, cy, 1.215, 0.66, 1.02, 36, "lamp", mat=GLOW)
    merge_hs(hs, infra_ring, xform((0, 0, 0)))
    hs.cyl((cx, cy, 1.2), (0, 0, 1), 0.66, 0.06, 20, 0.0, "graphite_dk", ARMOR, cap0=False, cap1=False)
    hs.dome((cx, cy, 1.26), (0, 0, 1), 0.6, 0.3, 28, "lamp", mat=GLOW, bands=4)
    for k in range(12):                                     # radial vanes across the glowing floor ring
        a = 2 * math.pi * (k + 0.25) / 12
        vane = HS(rng)
        vane.box((0.0, 0.0, 0.0), (0.03, 0.3, 0.05), 0.0, "graphite_dk", ARMOR, bottom=True)
        merge_hs(hs, vane, xform((cx + math.cos(a) * 0.84, cy + math.sin(a) * 0.84, 1.215), (0.0, 0.0, a + math.pi / 2)))
    for r0 in (0.76, 0.9):                                  # thin armoured rings inside the glow
        hs.cyl((cx, cy, 1.215), (0, 0, 1), r0, 0.03, 36, 0.0, "graphite_dk", ARMOR, cap0=False, cap1=False)
    # Armoured braces over the heart to a central hub.
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        br = HS(rng)
        br.box((0.0, 0.0, 0.0), (0.09, 0.8, 0.06), 0.015, "rust_w", TRIM)
        merge_hs(hs, br, xform((cx + math.cos(a) * 0.62, cy + math.sin(a) * 0.62, 1.56),
                               (math.radians(-12.0), 0.0, a - math.pi / 2)))
    hs.cyl((cx, cy, 1.53), (0, 0, 1), 0.17, 0.09, 12, 0.02, "steel", ARMOR, cap0=False)
    hs.cyl((cx, cy, 1.62), (0, 0, 1), 0.08, 0.02, 8, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    return hs


def build_core_shutter(side, rng):
    """Half-disc armoured iris plate; side -1 = 'a' (x < 0), +1 = 'b' (x > 0)."""
    hs = HS(rng)
    cx, cy, _cz = CORE_C
    R, z0, z1 = 1.44, 1.66, 1.765
    for k in range(3):                                      # three petal plates per half with seams
        a0, a1 = math.pi * k / 3 + 0.012, math.pi * (k + 1) / 3 - 0.012
        petal = [(cx + side * 0.03, cy)] + [(cx + side * math.sin(a0 + (a1 - a0) * j / 6) * R,
                                              cy - math.cos(a0 + (a1 - a0) * j / 6) * R) for j in range(7)]
        hs.prism(petal, z0, z1, 0.03, "graphite" if k != 1 else "plate", ARMOR, bottom=True)
    hs.box((cx + side * 0.05, cy, z1 + 0.012), (0.1, 2.7, 0.025), 0.008, "ochre_w", TRIM)        # meeting lip
    for k in range(3):
        a = -math.pi / 3 + k * math.pi / 3
        rib = HS(rng)
        rib.box((0.0, 0.0, 0.0), (0.95, 0.07, 0.03), 0.01, "rust_w", TRIM, bottom=True)
        merge_hs(hs, rib, xform((cx + side * math.cos(a) * 0.72, cy + math.sin(a) * 0.72, z1),
                                (0.0, 0.0, a if side > 0 else -a)))
    for k in range(5):
        a = -math.pi / 2 + math.pi * (k + 0.5) / 5
        hs.box((cx + side * math.cos(a) * 1.28, cy + math.sin(a) * 1.28, z1 + 0.01), (0.07, 0.07, 0.02), 0.0,
               "steel", ARMOR, bottom=True)
    return hs


# ----------------------------------------------------------------------------
# Bake, objects, export, verification
# ----------------------------------------------------------------------------

AO_DIRS = kit.hemisphere_dirs(40)
WEAR = infra.WEAR
DUST, DUST_LOW, SOOT = infra.DUST, infra.DUST_LOW, infra.SOOT


def bake(hs, name, context_bvh_parts, max_dist=0.45):
    verts = [Vector(v) for v in hs.verts]
    all_v = list(verts)
    polys = list(hs.faces)
    for cv, cf in context_bvh_parts:
        base = len(all_v)
        all_v += cv
        polys += [tuple(base + i for i in f) for f in cf]
    bvh = BVHTree.FromPolygons(all_v, polys, all_triangles=False, epsilon=0.0)
    rng = random.Random(f"{SEED}:colour:{name}")
    paints = {k: (kit.hex_linear(h), w) for k, (h, w) in PAINTS.items()}
    out = []
    for fi, f in enumerate(hs.faces):
        if hs.fmat[fi] == GLOW:
            out += [(1.0, 1.0, 1.0, 1.0)] * len(f)
            continue
        n = kit.face_normal(hs.verts, f)
        cen = Vector((0.0, 0.0, 0.0))
        for i in f:
            cen += verts[i]
        cen /= len(f)
        base, wear_amt = paints[hs.fpaint[fi]]
        jitter = rng.uniform(0.93, 1.06)
        if name in TREADS:
            jitter = 1.0
        for i in f:
            p = verts[i]
            sample = p + (cen - p) * 0.08 + n * 0.0015
            hits = 0
            if sample.z > BASE:
                t1 = n.orthogonal().normalized()
                t2 = n.cross(t1)
                for dx, dy, dz in AO_DIRS:
                    d = t1 * dx + t2 * dy + n * dz
                    if d.z < -1e-6 and -(sample.z - 0.0) / d.z < max_dist and sample.z > 0.0:
                        hits += 1
                        continue
                    if bvh.ray_cast(sample, d, max_dist)[0] is not None:
                        hits += 1
                ao = 1.0 - hits / len(AO_DIRS)
            else:
                ao = 0.2
            col = base
            if hs.ftag[fi] == "edge":
                col = kit.mix3(col, WEAR, wear_amt)
            col = kit.mul3(col, jitter)
            up = n.z
            dust = 0.22 * kit.smoothstep(0.55, 0.95, up)
            dust = max(dust, 0.55 * kit.clamp(1.0 - p.z / 0.3, 0.0, 1.0) if up < 0.55 else 0.0)
            dust += 0.35 * (1.0 - ao) * max(up, 0.0)
            dust *= 1.0 - 0.3 * kit.clamp(p.z / 1.8, 0.0, 1.0)
            dcol = kit.mix3(DUST, DUST_LOW, kit.clamp(1.0 - p.z / 0.5, 0.0, 1.0))
            col = kit.mix3(col, dcol, kit.clamp(dust, 0.0, 0.75))
            col = kit.mul3(col, kit.lerp(0.22, 1.0, ao ** 1.2))
            for sc, sr in getattr(hs, "scorch", ()):
                k = kit.clamp(1.0 - (p - Vector(sc)).length / sr, 0.0, 1.0)
                if k > 0.0:
                    col = kit.mix3(col, SOOT, 0.8 * k * k)
            out.append((col[0], col[1], col[2], 1.0))
    return out


def make_materials():
    out = []
    for name, rough, metal in (("bastion_armor", 0.55, 0.35), ("bastion_trim", 0.62, 0.2), ("bastion_glow", 0.4, 0.0)):
        m = bpy.data.materials.new(name)
        try:
            m.use_nodes = True
        except Exception:
            pass
        bsdf = [n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0]
        m.use_backface_culling = True
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        if name == "bastion_glow":
            c = kit.hex_linear(GLOW_HEX)
            bsdf.inputs["Base Color"].default_value = (*c, 1.0)
            bsdf.inputs["Emission Color"].default_value = (*c, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.0
            m.diffuse_color = (*c, 1.0)
        else:
            bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
            vc = m.node_tree.nodes.new("ShaderNodeVertexColor")
            vc.layer_name = COLOR_ATTR
            m.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        out.append(m)
    return out


def make_object(name, hs, mats, context):
    colours = bake(hs, name, context)
    ox, oy, oz = B(*SOCKETS[name])
    local = [(v[0] - ox, v[1] - oy, v[2] - oz) for v in hs.verts]
    me = bpy.data.meshes.new(name)
    me.from_pydata(local, [], list(hs.faces))
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
    if name in TREADS:
        for corner_uv in hs.belt_uv:
            for u, v in corner_uv:
                uvs += [u, 1.0 - v]                       # exporter writes v_gltf = 1 - v_blender
    else:
        for f in hs.faces:
            n = kit.face_normal(local, f)
            for i in f:
                x, y, z = local[i]
                u, v = kit.box_uv(x, z, -y, n.x, n.z, -n.y)
                uvs += [u, 1.0 - v]
    me.uv_layers.new(name="UVMap").data.foreach_set("uv", uvs)
    attr = me.color_attributes.new(name=COLOR_ATTR, type="FLOAT_COLOR", domain="CORNER")
    attr.data.foreach_set("color", [c for rgba in colours for c in rgba])
    me.color_attributes.active_color = attr
    obj = bpy.data.objects.new(name, me)
    obj.location = (ox, oy, oz)
    bpy.context.scene.collection.objects.link(obj)
    return obj


class Recorder(HS):
    """HS that remembers each face's vertex order as passed in (before orientation fixes)."""

    def __init__(self, rng):
        super().__init__(rng)
        self._raw = []

    def face(self, idx, *a, **k):
        self._raw.append(tuple(idx))
        super().face(idx, *a, **k)


def build_all():
    def rng(tag):
        return random.Random(f"{SEED}:{tag}")
    pieces = {}
    pieces["bastion_hull"] = build_hull(rng("hull"))
    pieces["bastion_tread_left"] = build_tread(-1)
    pieces["bastion_tread_right"] = build_tread(1)
    for side, nm in ((-1, "left"), (1, "right")):
        pieces[f"bastion_battery_{nm}"] = build_battery(side, rng(f"battery{nm}"))
        pieces[f"bastion_gun_{nm}"] = build_gun(side, rng(f"gun{nm}"))
        pieces[f"bastion_battery_{nm}_wreck"] = build_wreck(side, rng(f"wreck{nm}"))
        pieces[f"bastion_shutter_{nm}"] = build_battery_shutter(side, rng(f"shutter{nm}"))
    pieces["bastion_core"] = build_core(rng("core"))
    pieces["bastion_core_shutter_a"] = build_core_shutter(-1, rng("coreA"))
    pieces["bastion_core_shutter_b"] = build_core_shutter(1, rng("coreB"))
    for name in WHEELS:
        pieces[name] = build_wheel(name)
    return pieces


def check(pieces):
    problems = []
    total = sum(hs.tris() for hs in pieces.values())
    for name in NODES:
        hs = pieces[name]
        x0, x1, y0, y1, z0, z1 = hs.bounds()
        print(f"BASTION {name:28s} tris={hs.tris():5d} x=[{x0:+.3f},{x1:+.3f}] z=[{-y1:+.3f},{-y0:+.3f}] "
              f"y=[{z0:+.3f},{z1:+.3f}]")
    for state, names in (("default", DEFAULT_STATE), ("wrecked", WRECK_STATE)):
        b = [pieces[n].bounds() for n in names]
        x0, x1 = min(v[0] for v in b), max(v[1] for v in b)
        y0, y1 = min(v[2] for v in b), max(v[3] for v in b)
        z0, z1 = min(v[4] for v in b), max(v[5] for v in b)
        print(f"BASTION state {state}: x [{x0:+.3f},{x1:+.3f}] ({x1 - x0:.3f}) z [{-y1:+.3f},{-y0:+.3f}] "
              f"({y1 - y0:.3f}) y [{z0:+.3f},{z1:+.3f}]")
        if x1 - x0 > FOOTPRINT[0] + 1e-6 or y1 - y0 > FOOTPRINT[1] + 1e-6:
            problems.append(f"{state}: footprint {x1 - x0:.3f} x {y1 - y0:.3f}")
        if abs(z0 - BASE) > 1e-6:
            problems.append(f"{state}: base {z0:.4f}")
        if z1 > TOP_MAX + 1e-6:
            problems.append(f"{state}: top {z1:.4f} > {TOP_MAX}")
    print(f"BASTION total triangles {total}")
    print(f"BASTION belt loop length {belt_loop()[-1][4]:.4f}, {LINK_COUNT} links, pitch {link_pitch():.5f}")
    if not TRI_RANGE[0] <= total <= TRI_RANGE[1]:
        problems.append(f"total triangles {total} outside {TRI_RANGE}")
    return problems


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, check_existing=False, export_format="GLB",
        export_copyright="Last Worlds - original procedural geometry (tools/blender/bastion.py)",
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
        export_image_format="NONE", export_vertex_color="ACTIVE", export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True, export_attributes=False, export_cameras=False,
        export_lights=False, export_animations=False, export_skins=False, export_morph=False, export_yup=True,
        export_apply=False, export_extras=False, export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False, use_selection=False)


def verify_glb(path):
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
    if sorted(mats) != sorted(MATS):
        problems.append(f"materials {mats}")
    nodes = {gl["nodes"][i]["name"]: gl["nodes"][i] for i in gl["scenes"][0]["nodes"]}
    if sorted(nodes) != sorted(NODES):
        problems.append(f"node names {sorted(nodes)}")

    def acc(i):
        a = gl["accessors"][i]
        bv = gl["bufferViews"][a["bufferView"]]
        comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        fmt = {5126: "f", 5123: "H", 5125: "I", 5121: "B"}[a["componentType"]]
        size = struct.calcsize(fmt)
        stride = bv.get("byteStride", size * comps)
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        return [struct.unpack_from("<" + fmt * comps, binc, off + k * stride) for k in range(a["count"])]

    world = {}
    total = 0
    for name, node in nodes.items():
        t = node.get("translation", [0.0, 0.0, 0.0])
        if any(k in node for k in ("rotation", "scale", "matrix", "children")):
            problems.append(f"{name}: node has rotation/scale/children")
        if any(abs(a - b) > 1e-6 for a, b in zip(t, SOCKETS[name])):
            problems.append(f"{name}: translation {t} != socket {SOCKETS[name]}")
        pts = []
        tris = 0
        for prim in gl["meshes"][node["mesh"]]["primitives"]:
            at = prim["attributes"]
            for key in ("COLOR_0", "TEXCOORD_0", "NORMAL"):
                if key not in at:
                    problems.append(f"{name}: missing {key}")
            pos, uv = acc(at["POSITION"]), acc(at["TEXCOORD_0"])
            ind = [i[0] for i in acc(prim["indices"])]
            tris += len(ind) // 3
            pts += [(p[0] + t[0], p[1] + t[1], p[2] + t[2]) for p in pos]
            if name in TREADS:
                vs = [q[1] for q in uv]
                if max(vs) - min(vs) < 10.0:
                    problems.append(f"{name}: belt v range {max(vs) - min(vs):.2f} (expected the loop length)")
                continue
            bad = 0
            for k in range(0, len(ind), 3):
                a, b, c = (Vector(pos[ind[k + j]]) for j in range(3))
                fn = (b - a).cross(c - a)
                if fn.length < 1e-12:
                    continue
                fn.normalize()
                srt = sorted((abs(fn.x), abs(fn.y), abs(fn.z)))
                if srt[2] - srt[1] < 0.02:
                    continue
                for j in range(3):
                    vi = ind[k + j]
                    eu, ev = kit.box_uv(*pos[vi], fn.x, fn.y, fn.z)
                    if abs(eu - uv[vi][0]) > 2e-4 or abs(ev - uv[vi][1]) > 2e-4:
                        bad += 1
            if bad:
                problems.append(f"{name}: {bad} UVs off the box projection")
        world[name] = pts
        total += tris
        xs, ys, zs = [p[0] for p in pts], [p[1] for p in pts], [p[2] for p in pts]
        print(f"VERIFY {name:28s} {tris:5d} tris  t=({t[0]:+.2f},{t[1]:+.2f},{t[2]:+.2f})  "
              f"x[{min(xs):+.2f},{max(xs):+.2f}] y[{min(ys):+.2f},{max(ys):+.2f}] z[{min(zs):+.2f},{max(zs):+.2f}]")
    for state, names in (("default", DEFAULT_STATE), ("wrecked", WRECK_STATE)):
        pts = [p for n in names for p in world.get(n, [])]
        xs, ys, zs = [p[0] for p in pts], [p[1] for p in pts], [p[2] for p in pts]
        print(f"VERIFY state {state}: {max(xs) - min(xs):.3f} x {max(zs) - min(zs):.3f} footprint, "
              f"y [{min(ys):+.3f},{max(ys):+.3f}]")
        if max(xs) - min(xs) > FOOTPRINT[0] + 1e-5 or max(zs) - min(zs) > FOOTPRINT[1] + 1e-5:
            problems.append(f"{state}: footprint")
        if abs(min(ys) - BASE) > 1e-5 or max(ys) > TOP_MAX + 1e-5:
            problems.append(f"{state}: height range [{min(ys)}, {max(ys)}]")
    if not TRI_RANGE[0] <= total <= TRI_RANGE[1]:
        problems.append(f"total tris {total}")
    print(f"VERIFY total {total} tris, size={len(data)} bytes, materials={mats}, problems={len(problems)}")
    if len(data) > 2_000_000:
        print("VERIFY note: file is above the 2 MB target")
    for p in problems:
        print("VERIFY PROBLEM", p)
    return problems


# ----------------------------------------------------------------------------
# Previews
# ----------------------------------------------------------------------------

def preview_materials(mats, tex_dir):
    """Preview only: metal_plate_02 detail on armour/trim, belt links from the along-belt UV."""
    if tex_dir:
        d = kit.load_texture(os.path.join(tex_dir, "metal_plate_02", "metal_plate_02_Diffuse_1k.jpg"))
        n = kit.load_texture(os.path.join(tex_dir, "metal_plate_02", "metal_plate_02_nor_gl_1k.jpg"), True)
        for m in mats[:2]:
            nt = m.node_tree
            bsdf = [x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"][0]
            vc = [x for x in nt.nodes if x.type == "VERTEX_COLOR"][0]
            kit.textured_detail(nt, bsdf, vc.outputs["Color"], d, n, 1.0, 0.6)
    belt = bpy.data.materials.new("preview_belt")
    try:
        belt.use_nodes = True
    except Exception:
        pass
    nt = belt.node_tree
    bsdf = [x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"][0]
    bsdf.inputs["Roughness"].default_value = 0.7
    bsdf.inputs["Metallic"].default_value = 0.4
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = COLOR_ATTR
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uvn.outputs["UV"], sep.inputs["Vector"])
    links = nt.nodes.new("ShaderNodeMath")                  # one link every 0.2 units of belt
    links.operation = "MULTIPLY"
    links.inputs[1].default_value = 1.0 / link_pitch()
    nt.links.new(sep.outputs["Y"], links.inputs[0])
    frac = nt.nodes.new("ShaderNodeMath")
    frac.operation = "FRACT"
    nt.links.new(links.outputs["Value"], frac.inputs[0])
    step = nt.nodes.new("ShaderNodeMapRange")
    step.inputs["From Min"].default_value = 0.0
    step.inputs["From Max"].default_value = 0.35
    step.inputs["To Min"].default_value = 0.45
    step.inputs["To Max"].default_value = 1.15
    nt.links.new(frac.outputs["Value"], step.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(vc.outputs["Color"], mul.inputs["A"])
    nt.links.new(step.outputs["Result"], mul.inputs["B"])
    nt.links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    return belt


def place(objs, names, offset, belt_mat, glow_boost=None, extra=None, prefix="p"):
    out = []
    for name in names:
        src = objs[name]
        loc = Vector(src.location) + Vector(offset) + Vector((extra or {}).get(name, (0.0, 0.0, 0.0)))
        o = bpy.data.objects.new(f"{prefix}_{name}", src.data)
        o.location = loc
        bpy.context.scene.collection.objects.link(o)
        if name in TREADS:
            o.material_slots[0].link = "OBJECT"
            o.material_slots[0].material = belt_mat
        out.append(o)
    return out


def ground_plane(pmats, size=30.0, y0=-14.0):
    kit.plane_obj("ground", -size, size, y0, y0 + 2 * size, 0.0, pmats["ground"])


def scatter_rocks(terrain, rng, avoid, count=60):
    for k in range(count):
        x, y = rng.uniform(-6.5, 6.5), rng.uniform(-6.0, 22.0)
        if abs(x - avoid[0]) < 3.8 and abs(y - avoid[1]) < 3.6:
            continue
        name = f"rock_{rng.randrange(6)}"
        if name in terrain:
            sc = rng.uniform(0.4, 0.9)
            kit.instance(f"r{k}", terrain[name], (x, y, 0.0), rng.uniform(0, 6.3), (sc, sc, sc))


def render_kit_sheet(objs, pmats, belt, path, engine, samples):
    scene = bpy.context.scene
    layout = {
        "bastion_hull": (0.0, 3.4), "bastion_tread_left": (-5.6, 3.4), "bastion_tread_right": (5.6, 3.4),
        "bastion_battery_left": (-6.2, -1.4), "bastion_gun_left": (-4.2, -1.0),
        "bastion_battery_left_wreck": (-2.0, -1.4), "bastion_shutter_left": (0.0, -1.4),
        "bastion_core": (3.0, -1.6), "bastion_core_shutter_a": (5.6, -1.6),
        "bastion_battery_right": (-6.2, -5.4), "bastion_gun_right": (-4.2, -5.0),
        "bastion_battery_right_wreck": (-2.0, -5.4), "bastion_shutter_right": (0.0, -5.4),
        "bastion_core_shutter_b": (5.6, -5.2),
    }
    for name, (x, y) in layout.items():
        src = objs[name]
        o = bpy.data.objects.new(f"sheet_{name}", src.data)
        # show each node about its own origin, laid out on a grid (ground-level parts stay grounded)
        lift = 0.0 if src.location.z < 0.5 else 0.15
        o.location = (x, y, lift)
        bpy.context.scene.collection.objects.link(o)
        if name in TREADS:
            o.material_slots[0].link = "OBJECT"
            o.material_slots[0].material = belt
        dy = 3.3 if name in ("bastion_hull", "bastion_tread_left", "bastion_tread_right") else \
            (2.0 if "gun" in name or "wreck" in name else 1.35)
        kit.text_label(name, (x, y - dy, 0.002), 0.16, pmats["label"])
    kit.plane_obj("sheet_ground", -20.0, 20.0, -16.0, 20.0, -0.5, pmats["sheet"])
    kit.add_sun(kit.SUN_DIR, strength=3.9)
    kit.setup_world(scene, (0.42, 0.45, 0.48), 0.8)
    kit.add_ortho_camera((0.0, -0.6, 0.3), 55.0, 17.5)
    kit.setup_render(scene, engine, samples, 1900, 1800)
    kit.render(path)


def render_fortress(objs, pmats, belt, terrain, path, engine, samples, exposed=False):
    scene = bpy.context.scene
    at = (0.0, 9.0, 0.0)
    if exposed:
        names = WRECK_STATE
        extra = {"bastion_core_shutter_a": (-1.1, 0.0, 0.0), "bastion_core_shutter_b": (1.1, 0.0, 0.0)}
    else:
        names = DEFAULT_STATE
        extra = None
    place(objs, names, at, belt, extra=extra)
    ground_plane(pmats)
    scatter_rocks(terrain, random.Random(f"{SEED}:rocks"), (at[0], at[1]))
    kit.add_sun(kit.SUN_DIR, strength=4.4)                    # strong low sun (about 30 degrees)
    kit.setup_world(scene, (0.42, 0.45, 0.48), 0.7)
    kit.add_ortho_camera((0.0, 8.0, 0.6), 55.0, 12.5 * 1600.0 / 900.0)
    kit.setup_render(scene, engine, samples, 900, 1600)
    kit.render(path)


def render_hero(objs, pmats, belt, terrain, path, engine, samples):
    """3/4 front-right hero view (perspective), protected state, strong low sun."""
    scene = bpy.context.scene
    place(objs, DEFAULT_STATE, (0.0, 0.0, 0.0), belt)
    ground_plane(pmats)
    scatter_rocks(terrain, random.Random(f"{SEED}:hero-rocks"), (0.0, 0.0), count=40)
    kit.add_sun(kit.SUN_DIR, strength=4.4)
    kit.setup_world(scene, (0.42, 0.45, 0.48), 0.7)
    cam = bpy.data.cameras.new("hero_cam")
    cam.lens = 38.0
    cam.clip_start = 0.1
    cam.clip_end = 200.0
    ob = bpy.data.objects.new("hero_cam", cam)
    ob.location = (7.8, -9.2, 5.2)
    target = Vector((0.0, 0.2, 0.7))
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (target - Vector(ob.location)).to_track_quat("-Z", "Y")
    scene.collection.objects.link(ob)
    scene.camera = ob
    kit.setup_render(scene, engine, samples, 1600, 1000)
    kit.render(path)


def render_wheels(objs, pmats, path, engine, samples):
    """Contact sheet of the split rotating wheels, seen from the outboard side (faces toward the camera)."""
    scene = bpy.context.scene
    rows = (("right", 1.6, 0.0), ("left", 0.0, math.pi))
    for side, z, rot in rows:
        names = [f"bastion_sprocket_{side}", f"bastion_idler_{side}"] + [f"bastion_roadwheel_{side}_{k}" for k in range(6)]
        for k, name in enumerate(names):
            y = -5.6 + k * 1.6
            o = bpy.data.objects.new(f"wheel_{name}", objs[name].data)
            o.location = (0.0, y, z)
            o.rotation_euler = (0.0, 0.0, rot)
            scene.collection.objects.link(o)
            lab = kit.text_label(name.replace("bastion_", ""), (0.75, y, z - 0.88), 0.13, pmats["label"])
            lab.rotation_euler = (math.pi / 2, 0.0, math.pi / 2)
    kit.plane_obj("wheel_ground", -10.0, 10.0, -10.0, 10.0, -1.05, pmats["sheet"])
    kit.add_sun(kit.SUN_DIR, strength=3.9)
    kit.setup_world(scene, (0.42, 0.45, 0.48), 0.9)
    cam = bpy.data.cameras.new("wheel_cam")
    cam.type = "ORTHO"
    cam.ortho_scale = 13.6
    ob = bpy.data.objects.new("wheel_cam", cam)
    d = Vector((-1.0, 0.0, -0.32)).normalized()
    ob.location = Vector((0.0, 0.0, 0.8)) - d * 20.0
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = d.to_track_quat("-Z", "Y")
    scene.collection.objects.link(ob)
    scene.camera = ob
    kit.setup_render(scene, engine, samples, 1800, 800)
    kit.render(path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="bastion.py")
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
    problems = check(pieces)
    if problems:
        raise SystemExit("Bastion contract violations:\n  " + "\n  ".join(problems))
    static = ["bastion_hull", "bastion_tread_left", "bastion_tread_right", "bastion_battery_left",
              "bastion_battery_right", "bastion_core"]
    objs = {}
    for name in NODES:
        context = [([Vector(v) for v in pieces[c].verts], pieces[c].faces) for c in static if c != name]
        objs[name] = make_object(name, pieces[name], mats, context)
    export_glb(args.glb)
    print(f"BASTION exported {args.glb} ({os.path.getsize(args.glb)} bytes)")
    if verify_glb(args.glb):
        raise SystemExit("Exported GLB failed verification")

    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        pmats = kit.preview_materials()
        belt = preview_materials(mats, args.textures)
        if args.textures:
            gd = kit.load_texture(os.path.join(args.textures, "dry_ground_rocks", "dry_ground_rocks_Diffuse_1k.jpg"))
            gn = kit.load_texture(os.path.join(args.textures, "dry_ground_rocks", "dry_ground_rocks_nor_gl_1k.jpg"),
                                  True)
            nt = pmats["ground"].node_tree
            bsdf = [x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"][0]
            kit.textured_detail(nt, bsdf, bsdf.inputs["Base Color"].links[0].from_socket, gd, gn, 4.0, 0.9,
                                object_coords=True)
        for o in objs.values():
            o.hide_render = True
        keep = set(objs)
        terrain = {}
        if args.terrain_kit:
            before = set(bpy.data.objects.keys())
            bpy.ops.import_scene.gltf(filepath=args.terrain_kit)
            for name in set(bpy.data.objects.keys()) - before:
                ob = bpy.data.objects[name]
                ob.hide_render = True
                terrain[name] = ob
                keep.add(name)
        render_kit_sheet(objs, pmats, belt, os.path.join(args.preview_dir, "preview-kit.png"), args.engine, args.samples)
        kit.clear_preview(keep)
        render_fortress(objs, pmats, belt, terrain, os.path.join(args.preview_dir, "preview-fortress.png"),
                        args.engine, args.samples)
        kit.clear_preview(keep)
        render_fortress(objs, pmats, belt, terrain, os.path.join(args.preview_dir, "preview-core-exposed.png"),
                        args.engine, args.samples, exposed=True)
        kit.clear_preview(keep)
        render_hero(objs, pmats, belt, terrain, os.path.join(args.preview_dir, "preview-hero.png"),
                    args.engine, args.samples)
        kit.clear_preview(keep)
        render_wheels(objs, pmats, os.path.join(args.preview_dir, "preview-wheels.png"), args.engine, args.samples)
        print("BASTION previews written")


if __name__ == "__main__":
    main()
