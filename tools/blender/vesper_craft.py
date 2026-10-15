"""Vesper enemy craft for Last Worlds (docs/17-vesper-glass-frontier.md section 3 and 5).

Nodes: vesper_needle (interceptor, ~1.0 long), vesper_diamond (heavy escort, ~1.6 wide) and
vesper_missile_battery (ground turret on a hex plinth), after the VESPER column of
art/concepts/05-alien-factions.png: pale ceramic blades, black ceramic cores, orange glow.

Conventions: glTF +Y up, 1 unit = 1 game unit, noses / muzzles toward +Z (toward the player,
like the Khepri enemies). Air craft pivot at their centre (y = 0 is the craft mid-plane);
the missile battery pivots at its base centre on the ground (lowest point y = -0.05).

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/vesper_craft.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/vesper/vesper-craft.glb)" \\
        --preview-dir "$(wslpath -w $R/art/vesper-craft)"
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
from vesper_common import HS, merge_hs, xform, glow_box, hex_poly, loft_y  # noqa: E402

SEED = "vesper-craft-v1"
PALE, CER, GLOW = 0, 1, 2
MAT_NAMES = ("vesper_pale", "vesper_ceramic", "vesper_glow")


def plate(hs, poly, z0, z1, paint, mat, ch=0.012):
    hs.prism(poly, z0, z1, ch, paint, mat, bottom=True)


DIAMOND = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -0.8)]
HEXP = [(1.0, 0.0), (0.55, 0.85), (-0.55, 0.85), (-1.0, 0.0), (-0.55, -0.7), (0.55, -0.7)]


def build_needle(rng):
    hs = HS(rng)
    # Spine: pale ceramic blade-fuselage with a long point (nose toward Blender -y = glTF +z).
    loft_y(hs, [(-0.5, 0.0, 0.0, 0.0, 0.0), (-0.3, 0.055, 0.04, 0.0, 0.0), (-0.05, 0.09, 0.065, 0.0, 0.0),
                (0.25, 0.1, 0.065, 0.0, 0.0), (0.44, 0.07, 0.05, 0.0, 0.0)], HEXP, "pale", PALE)
    # Black ceramic core ridge with an orange slit.
    loft_y(hs, [(-0.26, 0.0, 0.0, 0.0, 0.05), (-0.12, 0.04, 0.03, 0.0, 0.055), (0.28, 0.05, 0.035, 0.0, 0.05),
                (0.4, 0.04, 0.03, 0.0, 0.045)], HEXP, "ceramic", CER)
    glow_box(hs, (0.0, 0.05, 0.088), (0.014, 0.42, 0.008), GLOW)
    # Forward-swept main blades.
    for sx in (-1, 1):
        blade = [(sx * 0.07, 0.3), (sx * 0.07, 0.0), (sx * 0.46, -0.32), (sx * 0.38, -0.12), (sx * 0.22, 0.24)]
        plate(hs, blade, -0.015, 0.015, "pale", PALE)
        inner = [(sx * 0.08, 0.22), (sx * 0.08, 0.04), (sx * 0.24, -0.08), (sx * 0.2, 0.16)]
        plate(hs, inner, 0.015, 0.03, "ceramic", CER, ch=0.006)
        glow_box(hs, (sx * 0.34, -0.2, 0.016), (0.012, 0.12, 0.006), GLOW, rot=(0.0, 0.0, sx * 0.75))
        # rear spikes
        loft_y(hs, [(0.18, 0.025, 0.02, sx * 0.13, -0.01), (0.55, 0.0, 0.0, sx * 0.16, -0.01)], DIAMOND,
               "pale_dk", PALE)
        # engine nacelles with glowing nozzles (exhaust toward glTF -z)
        hs.cyl((sx * 0.065, 0.26, -0.035), (0, 1, 0), 0.034, 0.22, 8, 0.0, "ceramic_dk", CER, cap0=False, cap1=False,
               smooth=False)
        hs.cyl((sx * 0.065, 0.48, -0.035), (0, 1, 0), 0.026, 0.012, 8, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    # Offset fins: dorsal fin canted left near the tail, ventral fin canted right further forward.
    for (x, y, z, roll, length) in ((-0.05, 0.22, 0.05, -0.55, 0.2), (0.05, 0.05, -0.04, math.pi + 0.55, 0.16)):
        fin = HS(rng)
        fin.prism([(0.0, -length * 0.4), (0.0, length * 0.6), (0.11, length * 0.7)], -0.008, 0.008, 0.004, "pale", PALE,
                  bottom=True)
        merge_hs(hs, fin, xform((x, y, z), (0.0, roll + math.pi / 2, 0.0)))
    return hs


def build_diamond(rng):
    hs = HS(rng)
    # Black ceramic diamond core frame.
    core = [(0.0, -0.82), (0.44, -0.06), (0.0, 0.62), (-0.44, -0.06)]
    plate(hs, core, -0.09, 0.07, "ceramic", CER, ch=0.02)
    # Fractured pale ceramic plates over the frame (gaps read as cracks).
    pieces = [
        [(0.0, -0.78), (0.18, -0.46), (0.0, -0.34), (-0.18, -0.46)],
        [(0.03, -0.3), (0.22, -0.45), (0.4, -0.08), (0.06, 0.02)],
        [(-0.03, -0.3), (-0.06, 0.02), (-0.4, -0.08), (-0.22, -0.45)],
        [(0.08, 0.08), (0.38, -0.02), (0.05, 0.56)],
        [(-0.08, 0.08), (-0.05, 0.56), (-0.38, -0.02)],
    ]
    for k, pts in enumerate(pieces):
        cxp = sum(p[0] for p in pts) / len(pts)
        cyp = sum(p[1] for p in pts) / len(pts)
        shrunk = [(cxp + (x - cxp) * 0.9 + rng.uniform(-0.008, 0.008), cyp + (y - cyp) * 0.9) for x, y in pts]
        z0 = 0.07
        plate(hs, shrunk, z0, z0 + 0.05 + rng.uniform(0.0, 0.02), "pale", PALE, ch=0.014)
    # Central core: recessed glowing heart and orange spine slit.
    hs.cyl((0.0, -0.08, 0.07), (0, 0, 1), 0.11, 0.05, 6, 0.0, "ceramic_dk", CER, cap0=False, smooth=False)
    hs.cyl((0.0, -0.08, 0.12), (0, 0, 1), 0.075, 0.03, 6, 0.0, "lamp", GLOW, cap0=False, r1=0.03, smooth=False)
    glow_box(hs, (0.0, -0.48, 0.095), (0.022, 0.26, 0.01), GLOW)
    glow_box(hs, (0.0, 0.3, 0.095), (0.022, 0.24, 0.01), GLOW)
    for sx in (-1, 1):
        # Radiator wing: dark radiator blade with stacked glowing fins under a pale armour blade.
        rad = [(sx * 0.4, 0.12), (sx * 0.5, -0.5), (sx * 0.66, -0.86), (sx * 0.72, -0.3), (sx * 0.64, 0.46),
               (sx * 0.46, 0.4)]
        plate(hs, rad, -0.05, 0.03, "ceramic", CER, ch=0.015)
        for k in range(6):
            y = -0.42 + k * 0.14
            glow_box(hs, (sx * 0.58, y, 0.033), (0.13, 0.026, 0.008), GLOW)
        armour = [(sx * 0.66, -0.86), (sx * 0.8, -0.24), (sx * 0.74, 0.52), (sx * 0.66, 0.46), (sx * 0.7, -0.26)]
        plate(hs, armour, -0.04, 0.07, "pale", PALE, ch=0.012)
        spike = [(sx * 0.46, 0.4), (sx * 0.62, 0.42), (sx * 0.55, 0.8)]
        plate(hs, spike, -0.03, 0.03, "pale_dk", PALE, ch=0.008)
        # Volley guns: dark barrels under the wing roots, muzzles toward glTF +z.
        hs.box((sx * 0.38, -0.3, -0.07), (0.1, 0.24, 0.07), 0.015, "ceramic_dk", CER)
        hs.cyl((sx * 0.38, -0.42, -0.07), (0, -1, 0), 0.026, 0.3, 8, 0.0, "steel", CER, cap0=False, cap1=False,
               smooth=False)
        hs.cyl((sx * 0.38, -0.72, -0.07), (0, -1, 0), 0.02, 0.006, 6, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    for x in (-0.14, 0.0, 0.14):                              # engine nozzles at the tail
        hs.cyl((x, 0.5, -0.02), (0, 1, 0), 0.045, 0.08, 8, 0.0, "ceramic_dk", CER, cap0=False, cap1=False, smooth=False)
        hs.cyl((x, 0.58, -0.02), (0, 1, 0), 0.034, 0.012, 8, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    return hs


def build_missile_battery(rng):
    """Ground target: stepped hex plinth, yaw ring, launcher with four tubes toward glTF +z."""
    hs = HS(rng)
    plate(hs, hex_poly(0.62, math.pi / 6), -0.05, 0.12, "ceramic", CER, ch=0.03)
    plate(hs, hex_poly(0.5, math.pi / 6), 0.12, 0.24, "ceramic_grey", CER, ch=0.03)
    for k in range(6):                                          # glowing slits on the plinth faces
        a = math.pi / 6 + k * math.pi / 3 + math.pi / 6
        glow_box(hs, (math.cos(a) * 0.545, math.sin(a) * 0.545, 0.05), (0.2, 0.012, 0.03), GLOW,
                 rot=(0.0, 0.0, a + math.pi / 2))
    hs.box((0.0, -0.58, 0.04), (0.34, 0.18, 0.1), 0.02, "ceramic_grey", CER)    # front ramp block
    hs.cyl((0.0, 0.0, 0.24), (0, 0, 1), 0.32, 0.06, 12, 0.012, "steel", CER, cap0=False)
    hs.box((0.0, 0.04, 0.42), (0.52, 0.56, 0.24), 0.04, "ceramic", CER)
    for sx in (-1, 1):
        hs.box((sx * 0.28, 0.02, 0.44), (0.05, 0.46, 0.2), 0.015, "pale", PALE)    # pale armour cheeks
    # Core (target): glowing vent box on the turret's rear deck.
    hs.box((0.0, 0.2, 0.56), (0.2, 0.16, 0.06), 0.012, "ceramic_dk", CER)
    glow_box(hs, (0.0, 0.2, 0.59), (0.14, 0.1, 0.012), GLOW)
    # Launcher: 2 x 2 tubes pitched up 22 degrees.
    pitch = math.radians(22.0)
    pack = HS(rng)
    pack.box((0.0, -0.2, 0.0), (0.36, 0.62, 0.3), 0.03, "ceramic", CER)
    for bx in (-0.08, 0.08):
        for bz in (-0.065, 0.065):
            pack.cyl((bx, -0.5, bz), (0, -1, 0), 0.055, 0.06, 8, 0.0, "ceramic_dk", CER, cap0=False, cap1=False,
                     smooth=False)
            pack.cyl((bx, -0.56, bz), (0, -1, 0), 0.04, 0.005, 8, 0.0, "lamp", GLOW, cap0=False, smooth=False)
    pack.box((0.0, -0.2, 0.155), (0.3, 0.4, 0.012), 0.0, "orange", CER)
    for sx in (-1, 1):
        pack.box((sx * 0.185, -0.15, 0.0), (0.012, 0.3, 0.05), 0.0, "lamp", GLOW, bottom=True)
    merge_hs(hs, pack, xform((0.0, 0.0, 0.66), (-pitch, 0.0, 0.0)))
    return hs


NODES = {
    "vesper_needle": dict(t=(0.0, 0.0, 0.0), budget=2500, foot=(1.0, 1.2)),
    "vesper_diamond": dict(t=(0.0, 0.0, 0.0), budget=2500, foot=(1.7, 1.8)),
    "vesper_missile_battery": dict(t=(0.0, 0.0, 0.0), budget=2500, foot=(1.3, 1.4), y_min_exact=-0.05, y_max=1.1),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="vesper_craft.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = [vc.make_material("vesper_pale", "vc", rough=0.35, metal=0.0),
            vc.make_material("vesper_ceramic", "vc", rough=0.3, metal=0.1),
            vc.make_material("vesper_glow", "glow")]
    builders = {"vesper_needle": build_needle, "vesper_diamond": build_diamond,
                "vesper_missile_battery": build_missile_battery}
    objs = {}
    for name, fn in builders.items():
        hs = fn(random.Random(f"{SEED}:{name}"))
        ground = 0.0 if name == "vesper_missile_battery" else None
        cols = vc.bake(hs, name, dict(glow={GLOW}, ao=0.25, ground=ground))
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        print(f"CRAFT {name:24s} tris={hs.tris()}")
    vc.publish(args.glb, "vesper_craft.py", dict(materials=MAT_NAMES, nodes=NODES, max_bytes=2_000_000), "CRAFT")

    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        render_previews(objs, args)


def render_previews(objs, args):
    scene = bpy.context.scene
    pm = vc.preview_materials()
    for o in objs.values():
        o.hide_render = True
    keep = set(objs)
    # Close-up board (like the faction board), hovering over pale snow.
    for name, x in (("vesper_needle", -2.2), ("vesper_diamond", 0.2), ("vesper_missile_battery", 2.7)):
        z = 0.0 if name == "vesper_missile_battery" else 0.6
        kit.instance("board_" + name, objs[name], (x, 0.0, z))
        kit.text_label(name, (x, -1.3, 0.012), 0.16, pm["label"])
    vc.plane("board_ground", -20, 20, -20, 20, 0.0, pm["sheet_snow"])
    vc.preview_world(scene)
    kit.add_ortho_camera((0.3, 0.0, 0.3), 55.0, 7.0)
    vc.setup_render(scene, args.engine, args.samples, 1800, 1100)
    kit.render(os.path.join(args.preview_dir, "preview-craft.png"))
    kit.clear_preview(keep)
    # Game camera: a Needle squadron and a Diamond over the ocean, batteries on a shelf strip.
    rng = random.Random(f"{SEED}:scene")
    flight = 3.8
    for k, (x, y) in enumerate(((-2.0, 16.0), (-1.2, 17.0), (-2.8, 17.0), (2.2, 13.0), (3.0, 14.0))):
        kit.instance(f"n{k}", objs["vesper_needle"], (x, y, flight))
    kit.instance("d0", objs["vesper_diamond"], (0.3, 19.5, flight))
    kit.prism_obj("shelf", [(-9.0, -2.0), (-2.5, -2.0), (-2.5, 30.0), (-9.0, 30.0)], -1.3, 0.8, pm["snow"],
                  pm["snow"])
    vc.plane("ocean", -20, 20, -10, 40, -1.2, pm["ocean"])
    for k, y in enumerate((5.0, 10.0, 22.0)):
        kit.instance(f"mb{k}", objs["vesper_missile_battery"], (-4.0 + rng.uniform(-0.5, 0.5), y, 0.8))
    vc.preview_world(scene)
    kit.add_ortho_camera((0.0, 11.0, 0.5), 55.0, 12.5 * 1600.0 / 900.0)
    vc.setup_render(scene, args.engine, args.samples, 900, 1600)
    kit.render(os.path.join(args.preview_dir, "preview-game.png"))


if __name__ == "__main__":
    main()
