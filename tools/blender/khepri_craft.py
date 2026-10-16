"""Khepri enemy craft for Last Worlds (docs/13, docs/15; user: Blender models only, 15 Oct 2026).

Nodes: khepri_dart (chevron fighter), khepri_lancer (long beam ship), khepri_weaver (scarab shield-wing),
khepri_turret (ground battery on an octagonal plinth), after the KHEPRI column of
art/concepts/05-alien-factions.png: weathered ochre/gold plates with gaps over a graphite frame, amber glow.

Conventions (same as vesper_craft.py): glTF +Y up, 1 unit = 1 game unit, noses / muzzles toward +Z (toward the
player). Air craft pivot at their centre (y = 0 is the mid-plane); the turret pivots at its base centre on the
ground (lowest point y = -0.05). Engine and muzzle sockets are listed in SOCKETS (and art/khepri-craft/README.md);
the runtime table KHEPRI_CRAFT in src/render/scene.ts copies the engine sockets.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/khepri_craft.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/khepri/khepri-craft.glb)" \\
        --preview-dir "$(wslpath -w $R/art/khepri-craft)"
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
from vesper_common import HS, merge_hs, xform, glow_box, loft_y  # noqa: E402

SEED = "khepri-craft-v2"
PLATE, FRAME, GLOW = 0, 1, 2
MAT_NAMES = ("khepri_plate", "khepri_frame", "khepri_glow")
AMBER = "#ffa040"

# Paint table: name -> (albedo hex, edge-wear amount, wear hex). Khepri: weathered ochre/gold over graphite.
PAINTS = {
    "gold": ("#c08f3e", 0.55, "#e8cd90"),
    "gold_dk": ("#93682a", 0.5, "#cfa868"),
    "ochre": ("#a8702e", 0.5, "#d9a764"),
    "rust": ("#7a4524", 0.45, "#b9874e"),
    "graphite": ("#26282b", 0.5, "#5f6267"),
    "graphite_dk": ("#161719", 0.45, "#45484d"),
    "steel": ("#4f5256", 0.5, "#8d9095"),
    "visor": ("#0c1720", 0.15, "#24425a"),
    "char": ("#121314", 0.25, "#2a2c2e"),
    "burnt": ("#2c1f19", 0.3, "#4d3a30"),
}
HEXP = [(1.0, 0.0), (0.55, 0.85), (-0.55, 0.85), (-1.0, 0.0), (-0.55, -0.7), (0.55, -0.7)]
DIAMOND = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -0.8)]


def plate(hs, poly, z0, z1, paint, mat, ch=0.012):
    hs.prism(poly, z0, z1, ch, paint, mat, bottom=True)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def segmented(hs, rng, quad, n, z0, z1, gap=0.018, paints=("gold", "gold_dk", "ochre"), mat=PLATE):
    """Splits a quad (root-front, root-back, tip-back, tip-front) into n armour plates along its span, with gaps
    (seams) and slightly varied heights and tones, like the concept's segmented plating."""
    rf, rb, tb, tf = quad
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        a, b = lerp(rf, tf, t0), lerp(rb, tb, t0)
        c, d = lerp(rb, tb, t1), lerp(rf, tf, t1)
        cx = (a[0] + b[0] + c[0] + d[0]) / 4
        cy = (a[1] + b[1] + c[1] + d[1]) / 4
        shrink = lambda p: (cx + (p[0] - cx) * (1 - gap * 6), cy + (p[1] - cy) * (1 - gap * 3))  # noqa: E731
        lift = rng.uniform(0.0, 0.012)
        tone = "rust" if rng.random() < 0.18 else rng.choice(paints)      # the odd weathered, rust-streaked plate
        plate(hs, [shrink(a), shrink(b), shrink(c), shrink(d)], z0, z1 + lift, tone, mat, ch=0.008)
        if k < n - 1:
            # A raised graphite rib along the seam to the next plate.
            s0, s1 = lerp(rf, tf, t1), lerp(rb, tb, t1)
            mx, my = (s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2
            length = math.hypot(s1[0] - s0[0], s1[1] - s0[1])
            rib = HS(rng)
            rib.box((0.0, 0.0, 0.0), (0.014, length * 0.95, 0.018), 0.0, "graphite_dk", FRAME)
            merge_hs(hs, rib, xform((mx, my, z1 + 0.004), (0.0, 0.0, -math.atan2(s1[0] - s0[0], s1[1] - s0[1]))))


def engine(hs, x, y, z, r, length, glow_r=None):
    """A graphite nozzle along +y (Blender; glTF -z, the exhaust) with an amber glowing throat."""
    hs.cyl((x, y, z), (0, 1, 0), r, length, 8, 0.0, "graphite_dk", FRAME, cap0=False, cap1=False, smooth=False)
    hs.cyl((x, y + length, z), (0, 1, 0), glow_r or r * 0.75, 0.012, 8, 0.0, "lamp", GLOW, cap0=False, smooth=False)


def build_dart(rng):
    hs = HS(rng)
    # Graphite fuselage with a long point (nose toward Blender -y = glTF +z).
    loft_y(hs, [(-0.52, 0.0, 0.0, 0.0, 0.0), (-0.3, 0.06, 0.045, 0.0, 0.0), (-0.05, 0.1, 0.065, 0.0, 0.0),
                (0.25, 0.11, 0.065, 0.0, 0.0), (0.42, 0.08, 0.05, 0.0, 0.0)], HEXP, "graphite", FRAME)
    # Ochre spine plates with seams and an amber slit, a dark visor ahead of them.
    for k, (y0, y1) in enumerate(((-0.36, -0.2), (-0.17, 0.02), (0.05, 0.25), (0.28, 0.38))):
        w0, w1 = 0.035 + k * 0.012, 0.05 + k * 0.01
        plate(hs, [(w0, y0), (w1, y1), (-w1, y1), (-w0, y0)], 0.05, 0.08 + rng.uniform(0, 0.01), "gold" if k % 2 else "gold_dk", PLATE, ch=0.008)
    glow_box(hs, (0.0, -0.05, 0.088), (0.012, 0.3, 0.006), GLOW)
    plate(hs, [(0.0, -0.46), (0.03, -0.38), (-0.03, -0.38)], 0.03, 0.06, "visor", FRAME, ch=0.004)
    for sx in (-1, 1):
        # Swept-back chevron wing: graphite base, three ochre plates, an amber wingtip engine at the trailing tip.
        base = [(sx * 0.09, -0.12), (sx * 0.1, 0.22), (sx * 0.42, 0.44), (sx * 0.47, 0.32)]
        plate(hs, base, -0.02, 0.02, "graphite", FRAME, ch=0.01)
        segmented(hs, rng, [(sx * 0.1, -0.08), (sx * 0.11, 0.18), (sx * 0.43, 0.4), (sx * 0.45, 0.31)], 3, 0.02, 0.04)
        hs.cyl((sx * 0.45, 0.22, 0.0), (0, 1, 0), 0.03, 0.2, 6, 0.0, "graphite_dk", FRAME, cap0=True, cap1=False, smooth=False)
        hs.cyl((sx * 0.45, 0.42, 0.0), (0, 1, 0), 0.022, 0.012, 6, 0.0, "lamp", GLOW, cap0=False, smooth=False)
        glow_box(hs, (sx * 0.44, 0.31, 0.034), (0.012, 0.14, 0.006), GLOW)                 # wingtip running light
        glow_box(hs, (sx * 0.27, 0.33, 0.045), (0.12, 0.012, 0.006), GLOW, rot=(0.0, 0.0, sx * -0.6))  # trailing-edge vent
        hs.box((sx * 0.12, 0.3, 0.06), (0.05, 0.08, 0.04), 0.008, "steel", FRAME)                        # intake block
        # Canard and a small gun under the wing root.
        plate(hs, [(sx * 0.07, -0.3), (sx * 0.07, -0.2), (sx * 0.2, -0.16)], -0.01, 0.01, "gold_dk", PLATE, ch=0.004)
        hs.cyl((sx * 0.13, -0.05, -0.035), (0, -1, 0), 0.016, 0.24, 6, 0.0, "steel", FRAME, cap0=False, smooth=False)
    engine(hs, 0.0, 0.42, 0.0, 0.05, 0.06)
    return hs


def build_lancer(rng):
    hs = HS(rng)
    # Long lance fuselage: a beam emitter needle forward, a heavier armoured body behind.
    loft_y(hs, [(-0.7, 0.0, 0.0, 0.0, 0.0), (-0.5, 0.035, 0.03, 0.0, 0.0), (-0.25, 0.07, 0.05, 0.0, 0.0),
                (0.1, 0.11, 0.07, 0.0, 0.0), (0.45, 0.1, 0.065, 0.0, 0.0), (0.58, 0.07, 0.05, 0.0, 0.0)], HEXP,
           "graphite", FRAME)
    # Emitter: a glowing crystal ring and tip on the needle nose.
    hs.cyl((0.0, -0.48, 0.0), (0, -1, 0), 0.04, 0.03, 8, 0.0, "lamp", GLOW, cap0=False, cap1=False, smooth=False)
    hs.cyl((0.0, -0.66, 0.0), (0, -1, 0), 0.014, 0.05, 6, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    for k, (y0, y1) in enumerate(((-0.3, -0.12), (-0.09, 0.12), (0.15, 0.36), (0.39, 0.52))):
        w = 0.05 + min(k, 2) * 0.02
        plate(hs, [(w * 0.8, y0), (w, y1), (-w, y1), (-w * 0.8, y0)], 0.055, 0.085 + rng.uniform(0, 0.01), "gold" if k % 2 == 0 else "ochre", PLATE, ch=0.008)
    glow_box(hs, (0.0, 0.12, 0.092), (0.012, 0.42, 0.006), GLOW)
    for k in range(5):
        hs.box((0.0, -0.4 + k * 0.05, 0.035), (0.09 - k * 0.006, 0.012, 0.02), 0.0, "gold_dk", PLATE)       # emitter collar rings
    for sx in (-1, 1):
        # Side nacelles (capacitor pods) with amber ribs, small swept wings and rear fins.
        hs.cyl((sx * 0.17, -0.18, -0.01), (0, 1, 0), 0.05, 0.62, 8, 0.008, "graphite", FRAME, smooth=False)
        for k in range(4):
            glow_box(hs, (sx * 0.17, -0.08 + k * 0.12, 0.045), (0.05, 0.016, 0.006), GLOW)
        plate(hs, [(sx * 0.12, -0.24), (sx * 0.12, -0.1), (sx * 0.17, -0.12)], 0.035, 0.06, "gold_dk", PLATE, ch=0.004)
        wing = [(sx * 0.1, 0.12), (sx * 0.12, 0.38), (sx * 0.34, 0.52), (sx * 0.36, 0.4)]
        plate(hs, wing, -0.02, 0.015, "graphite", FRAME, ch=0.008)
        segmented(hs, rng, [(sx * 0.21, 0.2), (sx * 0.22, 0.4), (sx * 0.34, 0.49), (sx * 0.35, 0.4)], 2, 0.015, 0.032)
        engine(hs, sx * 0.17, 0.44, -0.01, 0.045, 0.06)
    return hs


def build_weaver(rng):
    hs = HS(rng)
    # Scarab body: a broad graphite carapace with two layered rows of gold shield plates.
    loft_y(hs, [(-0.42, 0.0, 0.0, 0.0, 0.0), (-0.28, 0.1, 0.05, 0.0, 0.0), (-0.05, 0.16, 0.075, 0.0, 0.0),
                (0.22, 0.15, 0.07, 0.0, 0.0), (0.4, 0.1, 0.05, 0.0, 0.0)], HEXP, "graphite", FRAME)
    plate(hs, [(0.0, -0.34), (0.1, -0.2), (0.12, 0.05), (0.0, 0.12), (-0.12, 0.05), (-0.1, -0.2)], 0.06, 0.1, "gold", PLATE, ch=0.012)
    plate(hs, [(0.0, 0.16), (0.1, 0.1), (0.11, 0.32), (0.0, 0.38), (-0.11, 0.32), (-0.1, 0.1)], 0.055, 0.09, "gold_dk", PLATE, ch=0.012)
    glow_box(hs, (0.0, -0.12, 0.105), (0.012, 0.18, 0.006), GLOW)
    glow_box(hs, (0.0, 0.24, 0.095), (0.012, 0.12, 0.006), GLOW)
    plate(hs, [(0.0, -0.4), (0.04, -0.33), (-0.04, -0.33)], 0.03, 0.06, "visor", FRAME, ch=0.004)
    for sx in (-1, 1):
        # Wide shield wings (the elytra): a graphite frame, two rows of segmented plates, spined trailing edge.
        frame = [(sx * 0.12, -0.26), (sx * 0.5, -0.22), (sx * 0.68, 0.06), (sx * 0.62, 0.36), (sx * 0.34, 0.32), (sx * 0.14, 0.18)]
        plate(hs, frame, -0.03, 0.025, "graphite", FRAME, ch=0.012)
        segmented(hs, rng, [(sx * 0.15, -0.22), (sx * 0.16, 0.0), (sx * 0.62, 0.06), (sx * 0.5, -0.18)], 4, 0.025, 0.05)
        segmented(hs, rng, [(sx * 0.16, 0.04), (sx * 0.16, 0.16), (sx * 0.6, 0.32), (sx * 0.63, 0.1)], 3, 0.025, 0.045,
                  paints=("ochre", "gold_dk"))
        for k in range(3):
            plate(hs, [(sx * (0.36 + k * 0.1), 0.3 + k * 0.01), (sx * (0.42 + k * 0.1), 0.31 + k * 0.01), (sx * (0.4 + k * 0.1), 0.42)],
                  -0.015, 0.015, "gold_dk", PLATE, ch=0.004)
        glow_box(hs, (sx * 0.56, 0.2, 0.03), (0.012, 0.16, 0.006), GLOW, rot=(0.0, 0.0, sx * 0.4))
        glow_box(hs, (sx * 0.4, 0.33, 0.03), (0.16, 0.012, 0.006), GLOW, rot=(0.0, 0.0, sx * -0.12))     # trailing-edge vents
        lamp_tip = (sx * 0.66, 0.08, 0.03)
        glow_box(hs, lamp_tip, (0.03, 0.05, 0.012), GLOW)                                                   # wingtip lamp
        hs.box((sx * 0.22, -0.02, 0.08), (0.06, 0.1, 0.03), 0.006, "steel", FRAME)                       # sensor blister
        # Twin side guns under the wings, muzzles toward glTF +z.
        hs.box((sx * 0.3, -0.12, -0.05), (0.08, 0.2, 0.05), 0.012, "graphite_dk", FRAME)
        hs.cyl((sx * 0.3, -0.22, -0.05), (0, -1, 0), 0.018, 0.2, 6, 0.0, "steel", FRAME, cap0=False, smooth=False)
        engine(hs, sx * 0.09, 0.38, -0.01, 0.045, 0.06)
    return hs


def build_turret(rng):
    """Ground battery: an octagonal graphite plinth with ochre bands, a yaw ring, an armoured ochre turret with
    twin cannons toward glTF +z, amber muzzles and a glowing core vent on the rear deck."""
    hs = HS(rng)
    oct8 = lambda r: [(math.cos(k * math.pi / 4 + math.pi / 8) * r, math.sin(k * math.pi / 4 + math.pi / 8) * r) for k in range(8)]  # noqa: E731
    plate(hs, oct8(0.6), -0.05, 0.12, "graphite", FRAME, ch=0.03)
    plate(hs, oct8(0.5), 0.12, 0.22, "graphite_dk", FRAME, ch=0.025)
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8 + math.pi / 8
        hs.box((math.cos(a) * 0.53, math.sin(a) * 0.53, 0.06), (0.16, 0.03, 0.05), 0.0, "gold_dk" if k % 2 else "rust", PLATE,
               bottom=True)
    hs.cyl((0.0, 0.0, 0.22), (0, 0, 1), 0.34, 0.06, 12, 0.012, "steel", FRAME, cap0=False)
    # Turret body: stepped armour, ochre cheek plates.
    hs.box((0.0, 0.05, 0.42), (0.5, 0.5, 0.26), 0.04, "graphite", FRAME)
    for sx in (-1, 1):
        hs.box((sx * 0.27, 0.0, 0.44), (0.06, 0.52, 0.24), 0.02, "gold", PLATE)
        hs.box((sx * 0.27, -0.2, 0.6), (0.05, 0.14, 0.06), 0.01, "gold_dk", PLATE)
    hs.box((0.0, 0.0, 0.6), (0.4, 0.42, 0.1), 0.03, "ochre", PLATE)
    # Core vent (the target) on the rear deck.
    hs.box((0.0, 0.17, 0.66), (0.2, 0.14, 0.05), 0.012, "graphite_dk", FRAME)
    glow_box(hs, (0.0, 0.17, 0.69), (0.14, 0.09, 0.012), GLOW)
    # Twin cannons, slightly pitched up, with amber muzzles.
    gun = HS(rng)
    for bx in (-0.1, 0.1):
        gun.box((bx, -0.08, 0.0), (0.1, 0.22, 0.11), 0.015, "graphite_dk", FRAME)
        gun.cyl((bx, -0.18, 0.0), (0, -1, 0), 0.035, 0.42, 8, 0.0, "steel", FRAME, cap0=False, cap1=False, smooth=False)
        gun.cyl((bx, -0.6, 0.0), (0, -1, 0), 0.042, 0.05, 8, 0.0, "graphite_dk", FRAME, cap0=False, cap1=False, smooth=False)
        gun.cyl((bx, -0.65, 0.0), (0, -1, 0), 0.026, 0.006, 8, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    merge_hs(hs, gun, xform((0.0, -0.18, 0.5), (-math.radians(10.0), 0.0, 0.0)))
    return hs


NODES = {
    "khepri_dart": dict(t=(0.0, 0.0, 0.0), budget=2500, foot=(1.05, 1.1)),
    "khepri_lancer": dict(t=(0.0, 0.0, 0.0), budget=2500, foot=(0.85, 1.45)),
    "khepri_weaver": dict(t=(0.0, 0.0, 0.0), budget=2500, foot=(1.45, 0.95)),
    "khepri_turret": dict(t=(0.0, 0.0, 0.0), budget=2500, foot=(1.25, 1.7), y_min_exact=-0.05, y_max=0.95),
}
# Sockets (glTF: x, y up, z toward the player) for plumes and muzzles.
SOCKETS = {
    "khepri_dart": [("engine_0", (-0.45, 0.0, -0.43)), ("engine_1", (0.45, 0.0, -0.43)), ("engine_2", (0.0, 0.0, -0.49)),
                    ("muzzle_0", (-0.13, -0.035, 0.29)), ("muzzle_1", (0.13, -0.035, 0.29))],
    "khepri_lancer": [("engine_0", (-0.17, -0.01, -0.51)), ("engine_1", (0.17, -0.01, -0.51)), ("muzzle_0", (0.0, 0.0, 0.71))],
    "khepri_weaver": [("engine_0", (-0.09, -0.01, -0.45)), ("engine_1", (0.09, -0.01, -0.45)),
                      ("muzzle_0", (-0.3, -0.05, 0.42)), ("muzzle_1", (0.3, -0.05, 0.42))],
    "khepri_turret": [("muzzle_0", (-0.1, 0.62, 0.84)), ("muzzle_1", (0.1, 0.62, 0.84))],
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="khepri_craft.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = [vc.make_material("khepri_plate", "vc", rough=0.45, metal=0.35),
            vc.make_material("khepri_frame", "vc", rough=0.4, metal=0.45),
            vc.make_material("khepri_glow", "glow", colour=AMBER)]
    builders = {"khepri_dart": build_dart, "khepri_lancer": build_lancer, "khepri_weaver": build_weaver,
                "khepri_turret": build_turret}
    objs = {}
    for name, fn in builders.items():
        hs = fn(random.Random(f"{SEED}:{name}"))
        ground = 0.0 if name == "khepri_turret" else None
        cols = vc.bake(hs, name, dict(glow={GLOW}, ao=0.25, ground=ground, paints=PAINTS))
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        print(f"CRAFT {name:16s} tris={hs.tris()}")
    vc.publish(args.glb, "khepri_craft.py", dict(materials=MAT_NAMES, nodes=NODES, max_bytes=2_000_000), "CRAFT")

    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        render_previews(objs, args)


def render_previews(objs, args):
    scene = bpy.context.scene
    pm = vc.preview_materials()
    sand = vc.noise_material("sheet_sand", "#8a5230", "#a8683c", 6.0, 0.9)
    for o in objs.values():
        o.hide_render = True
    keep = set(objs)
    for name, x in (("khepri_dart", -3.0), ("khepri_lancer", -1.0), ("khepri_weaver", 1.1), ("khepri_turret", 3.2)):
        z = 0.0 if name == "khepri_turret" else 0.6
        kit.instance("board_" + name, objs[name], (x, 0.0, z))
        kit.text_label(name, (x, -1.3, 0.012), 0.16, pm["label"])
    vc.plane("board_ground", -20, 20, -20, 20, 0.0, sand)
    vc.preview_world(scene)
    kit.add_ortho_camera((0.0, 0.0, 0.3), 55.0, 8.4)
    vc.setup_render(scene, args.engine, args.samples, 1800, 1000)
    kit.render(os.path.join(args.preview_dir, "preview-craft.png"))
    kit.clear_preview(keep)
    # Game camera: an arrowhead of darts, a scarab line, a lancer, batteries on the sand.
    flight = 3.8
    for k, (x, y) in enumerate(((0.0, 17.0), (-0.9, 17.8), (0.9, 17.8))):
        kit.instance(f"d{k}", objs["khepri_dart"], (x, y, flight))
    for k, x in enumerate((-3.0, -1.6)):
        kit.instance(f"w{k}", objs["khepri_weaver"], (x, 13.0, flight))
    kit.instance("l0", objs["khepri_lancer"], (3.0, 15.0, flight))
    for k, (x, y) in enumerate(((-3.5, 6.0), (3.2, 9.0))):
        kit.instance(f"t{k}", objs["khepri_turret"], (x, y, 0.0))
    vc.plane("sand", -20, 20, -10, 40, 0.0, sand)
    vc.preview_world(scene)
    kit.add_ortho_camera((0.0, 11.0, 0.5), 55.0, 12.5 * 1600.0 / 900.0)
    vc.setup_render(scene, args.engine, args.samples, 900, 1600)
    kit.render(os.path.join(args.preview_dir, "preview-game.png"))


if __name__ == "__main__":
    main()
