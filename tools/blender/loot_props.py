"""Destructible fuel tanks and ground wrecks for Last Worlds (user request, 16 Oct 2026; Blender models only).

Nodes:
- loot_fuel: a fuel-tank skid that pilots shoot for loot (it drops what a ship drops). Two hazard-red tanks with
  white bands on a graphite skid, a valve manifold and a glowing amber gauge so it reads apart from the scenery
  tanks of the industrial kit.
- wreck_turret_0, wreck_turret_1: what a destroyed ground battery leaves on its plinth: a scorched, split plinth,
  torn armour plates, a broken barrel and a few embers.
- wreck_fuel: the burst skid left by a destroyed loot_fuel.
- fx_missile: the Seeker Rack missile (special weapon): a slim white body with a red band, four graphite tail fins and
  a glowing nozzle; pivot at its centre, nose toward +Z (the runtime yaws it along its flight).

Conventions (as khepri_craft.py): glTF +Y up, 1 unit = 1 game unit, front toward +Z (toward the player). Every
node pivots at its base centre on the ground (lowest point y = -0.05). Colour is baked into COLOR_0; glow faces use
prop_glow (amber). The runtime loads them through loadCraftNodes (src/render/models.ts) as instanced craft.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/loot_props.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/shared/loot-props.glb)" \\
        --preview-dir "$(wslpath -w $R/art/loot-props)"
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
from vesper_common import HS, merge_hs, xform, glow_box  # noqa: E402

SEED = "loot-props-v1"
PAINT, FRAME, GLOW = 0, 1, 2
MAT_NAMES = ("prop_paint", "prop_frame", "prop_glow")
AMBER = "#ffa040"

# name -> (albedo hex, edge-wear amount, wear hex)
PAINTS = {
    "hazard": ("#b3311d", 0.45, "#e0785a"),
    "hazard_dk": ("#7e2014", 0.4, "#b4553c"),
    "white": ("#d6d2c6", 0.35, "#f2efe6"),
    "graphite": ("#26282b", 0.5, "#5f6267"),
    "graphite_dk": ("#161719", 0.45, "#45484d"),
    "steel": ("#5a5e63", 0.5, "#9a9ea3"),
    "brass": ("#9a7a3a", 0.5, "#d2b06a"),
    "char": ("#121314", 0.25, "#2a2c2e"),
    "burnt": ("#2c1f19", 0.3, "#4d3a30"),
    "soot": ("#1d1b1a", 0.2, "#3a3532"),
    "scorched": ("#3b2a20", 0.35, "#6a4a36"),
}

OCT = lambda r, rot=math.pi / 8: [(math.cos(k * math.pi / 4 + rot) * r, math.sin(k * math.pi / 4 + rot) * r) for k in range(8)]  # noqa: E731


def tank(hs, x, r, length, z, scorched=False):
    """A horizontal tank along Blender Y (front-back), banded, with domed ends."""
    body, band = ("burnt", "soot") if scorched else ("hazard", "white")
    hs.cyl((x, -length / 2, z), (0, 1, 0), r, length, 14, 0.02, body, PAINT, cap0=False, cap1=False)
    for e, ax in ((-length / 2, (0, -1, 0)), (length / 2, (0, 1, 0))):
        hs.dome((x, e, z), ax, r, r * 0.45, 14, body, PAINT, bands=2)
    for y in (-length * 0.28, length * 0.28):
        hs.cyl((x, y - 0.035, z), (0, 1, 0), r + 0.012, 0.07, 14, 0.006, band, PAINT, cap0=False, cap1=False)
    for y in (-length * 0.3, length * 0.3):
        hs.box((x, y, z - r * 0.75), (r * 1.3, 0.06, r * 0.5), 0.01, "graphite", FRAME)       # saddles


def build_fuel(rng):
    hs = HS(rng)
    # Skid: a graphite frame with two runners.
    hs.box((0.0, 0.0, 0.02), (0.98, 1.02, 0.14), 0.02, "graphite", FRAME, bottom=True)
    for sx in (-1, 1):
        hs.box((sx * 0.44, 0.0, -0.01), (0.08, 1.08, 0.08), 0.015, "graphite_dk", FRAME, bottom=True)
    for sy in (-1, 1):
        hs.box((0.0, sy * 0.46, 0.12), (0.98, 0.05, 0.06), 0.01, "hazard_dk", PAINT)
    tank(hs, -0.24, 0.2, 0.78, 0.33)
    tank(hs, 0.24, 0.2, 0.78, 0.33)
    # Valve manifold between the tanks: pipes, a brass valve wheel and the glowing gauge (front, toward the player).
    hs.cyl((0.0, -0.3, 0.55), (0, 1, 0), 0.04, 0.6, 8, 0.0, "steel", FRAME)
    for y in (-0.22, 0.22):
        for sx in (-1, 1):
            hs.cyl((sx * 0.24, y, 0.5), (-sx, 0, 0.3), 0.025, 0.25, 6, 0.0, "steel", FRAME, cap0=False)
    hs.cyl((0.0, 0.1, 0.58), (0, 0, 1), 0.035, 0.12, 8, 0.0, "steel", FRAME)
    hs.cyl((0.0, 0.1, 0.7), (0, 0, 1), 0.09, 0.025, 12, 0.006, "brass", FRAME)
    hs.box((0.0, -0.36, 0.58), (0.16, 0.08, 0.12), 0.015, "graphite_dk", FRAME)
    glow_box(hs, (0.0, -0.405, 0.59), (0.11, 0.012, 0.07), GLOW)
    # Warning lamps on the skid corners.
    for sx in (-1, 1):
        hs.cyl((sx * 0.42, -0.44, 0.09), (0, 0, 1), 0.035, 0.05, 8, 0.0, "graphite_dk", FRAME)
        glow_box(hs, (sx * 0.42, -0.44, 0.15), (0.04, 0.04, 0.02), GLOW)
    return hs


def plinth(hs, rng, split):
    """A scorched octagonal battery plinth, optionally split into two halves."""
    if split:
        for side in (-1, 1):
            half = [p for p in OCT(0.6)]
            pts = [(x, y) for x, y in half if x * side >= -0.02]
            pts = [(side * 0.04, -0.6), *sorted(pts, key=lambda p: math.atan2(p[1], p[0] * side)), (side * 0.04, 0.6)]
            hs.prism([(x + side * 0.05, y) for x, y in pts], -0.05, 0.1 + rng.uniform(0, 0.03), 0.025, "char", FRAME, bottom=True)
    else:
        hs.prism(OCT(0.6), -0.05, 0.12, 0.03, "char", FRAME, bottom=True)
        hs.prism(OCT(0.48), 0.12, 0.18, 0.02, "soot", FRAME)
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 4
        if rng.random() < 0.6:
            hs.box((math.cos(a) * 0.53, math.sin(a) * 0.53, 0.06), (0.16, 0.03, 0.05), 0.0, "scorched", PAINT, bottom=True)


def debris(hs, rng, n, radius, paints=("burnt", "scorched", "char")):
    for _ in range(n):
        a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.15, radius)
        plate = HS(rng)
        plate.box((0, 0, 0), (rng.uniform(0.1, 0.26), rng.uniform(0.06, 0.18), 0.025), 0.005, rng.choice(paints), PAINT)
        merge_hs(hs, plate, xform((math.cos(a) * d, math.sin(a) * d, 0.07), (rng.uniform(-0.3, 0.3), rng.uniform(-0.35, 0.35), rng.uniform(0, math.pi))))


def embers(hs, rng, n, radius, z=0.05):
    for _ in range(n):
        a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.0, radius)
        glow_box(hs, (math.cos(a) * d, math.sin(a) * d, z + rng.uniform(0, 0.08)), (0.035, 0.035, 0.02), GLOW)


def broken_barrel(hs, rng, p, yaw, pitch):
    gun = HS(rng)
    gun.box((0.0, -0.06, 0.0), (0.1, 0.18, 0.1), 0.012, "char", FRAME)
    gun.cyl((0.0, -0.15, 0.0), (0, -1, 0), 0.035, 0.28 + rng.uniform(0, 0.08), 8, 0.0, "burnt", FRAME, cap0=False, smooth=False)
    merge_hs(hs, gun, xform(p, (pitch, 0.0, yaw)))


def build_wreck_turret_0(rng):
    """Intact plinth, the turret body torn off and tilted on its ring, one barrel broken, plates scattered."""
    hs = HS(rng)
    plinth(hs, rng, split=False)
    hs.cyl((0.0, 0.0, 0.18), (0, 0, 1), 0.32, 0.05, 12, 0.01, "soot", FRAME, cap0=False)
    body = HS(rng)
    body.box((0.0, 0.0, 0.12), (0.46, 0.46, 0.22), 0.04, "char", FRAME)
    body.box((0.25, 0.0, 0.12), (0.05, 0.48, 0.2), 0.02, "scorched", PAINT)
    body.box((0.0, 0.0, 0.26), (0.36, 0.38, 0.07), 0.025, "burnt", PAINT)
    glow_box(body, (0.0, 0.12, 0.3), (0.1, 0.07, 0.01), GLOW)
    merge_hs(hs, body, xform((0.06, 0.04, 0.2), (math.radians(14), math.radians(-18), math.radians(25))))
    broken_barrel(hs, rng, (0.05, -0.3, 0.32), math.radians(15), math.radians(-28))
    broken_barrel(hs, rng, (-0.45, -0.42, 0.04), math.radians(70), math.radians(5))
    debris(hs, rng, 7, 0.75)
    embers(hs, rng, 4, 0.4, 0.18)
    return hs


def build_wreck_turret_1(rng):
    """Split plinth with the turret collapsed into the gap, its cannons buckled downward."""
    hs = HS(rng)
    plinth(hs, rng, split=True)
    body = HS(rng)
    body.box((0.0, 0.0, 0.1), (0.44, 0.42, 0.18), 0.04, "char", FRAME)
    body.box((-0.24, 0.0, 0.1), (0.05, 0.44, 0.18), 0.02, "scorched", PAINT)
    merge_hs(hs, body, xform((0.0, 0.06, 0.06), (math.radians(-10), math.radians(22), math.radians(-12))))
    broken_barrel(hs, rng, (-0.08, -0.25, 0.2), math.radians(-10), math.radians(-35))
    broken_barrel(hs, rng, (0.12, -0.24, 0.18), math.radians(12), math.radians(-40))
    debris(hs, rng, 8, 0.8)
    embers(hs, rng, 5, 0.35, 0.1)
    return hs


def build_wreck_fuel(rng):
    """The skid with both tanks burst open: blackened half shells, torn bands, embers in the frame."""
    hs = HS(rng)
    hs.box((0.0, 0.0, 0.02), (0.98, 1.02, 0.12), 0.02, "char", FRAME, bottom=True)
    for sx in (-1, 1):
        hs.box((sx * 0.44, 0.0, -0.01), (0.08, 1.08, 0.08), 0.015, "soot", FRAME, bottom=True)
    for sx, tilt in ((-1, 0.5), (1, -0.6)):
        # Lower half shell of each tank, peeled open.
        shell = HS(rng)
        shell.cyl((0.0, -0.36, 0.0), (0, 1, 0), 0.2, 0.72, 10, 0.0, "burnt", PAINT, cap0=False, cap1=False, r1=0.17)
        merge_hs(hs, shell, xform((sx * 0.25, 0.0, 0.18), (0.0, tilt, 0.0)))
        hs.box((sx * 0.25, 0.3, 0.12), (0.34, 0.05, 0.12), 0.01, "graphite_dk", FRAME)
    debris(hs, rng, 8, 0.65, paints=("burnt", "soot", "hazard_dk"))
    embers(hs, rng, 6, 0.4, 0.12)
    return hs


def build_missile(rng):
    hs = HS(rng)
    # Blender: nose toward -Y (glTF +Z). Body, nose cone, red band, fins, nozzle glow.
    hs.cyl((0.0, 0.2, 0.0), (0, -1, 0), 0.045, 0.34, 10, 0.006, "white", PAINT, cap0=False, cap1=False)
    hs.cyl((0.0, -0.14, 0.0), (0, -1, 0), 0.045, 0.1, 10, 0.0, "white", PAINT, cap0=False, r1=0.008)
    hs.cyl((0.0, -0.06, 0.0), (0, -1, 0), 0.047, 0.05, 10, 0.0, "hazard", PAINT, cap0=False, cap1=False)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        fin = HS(rng)
        fin.box((0.0, 0.0, 0.0), (0.012, 0.09, 0.07), 0.0, "graphite", FRAME)
        merge_hs(hs, fin, xform((math.cos(a) * 0.07, 0.15, math.sin(a) * 0.07), (0.0, a + math.pi / 2, 0.0)))
    hs.cyl((0.0, 0.2, 0.0), (0, 1, 0), 0.032, 0.03, 10, 0.0, "graphite_dk", FRAME, cap1=False)
    glow_box(hs, (0.0, 0.232, 0.0), (0.04, 0.008, 0.04), GLOW)
    return hs


NODES = {
    "loot_fuel": dict(t=(0.0, 0.0, 0.0), budget=2500, foot=(1.15, 1.2), y_min_exact=-0.05, y_max=0.8),
    "wreck_turret_0": dict(t=(0.0, 0.0, 0.0), budget=1600, foot=(1.7, 1.7), y_min_exact=-0.05, y_max=0.75),
    "wreck_turret_1": dict(t=(0.0, 0.0, 0.0), budget=1600, foot=(1.7, 1.7), y_min_exact=-0.05, y_max=0.75),
    "wreck_fuel": dict(t=(0.0, 0.0, 0.0), budget=1600, foot=(1.7, 1.7), y_min_exact=-0.05, y_max=0.6),
    "fx_missile": dict(t=(0.0, 0.0, 0.0), budget=500, foot=(0.3, 0.6)),
}
BUILDERS = {"loot_fuel": build_fuel, "wreck_turret_0": build_wreck_turret_0, "wreck_turret_1": build_wreck_turret_1,
            "wreck_fuel": build_wreck_fuel, "fx_missile": build_missile}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="loot_props.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=48)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = [vc.make_material("prop_paint", "vc", rough=0.5, metal=0.25),
            vc.make_material("prop_frame", "vc", rough=0.45, metal=0.45),
            vc.make_material("prop_glow", "glow", colour=AMBER)]
    objs = {}
    for name, fn in BUILDERS.items():
        hs = fn(random.Random(f"{SEED}:{name}"))
        cols = vc.bake(hs, name, dict(glow={GLOW}, ao=0.25, ground=None if name == "fx_missile" else 0.0, paints=PAINTS))
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        print(f"PROPS {name:16s} tris={hs.tris()}")
    vc.publish(args.glb, "loot_props.py", dict(materials=MAT_NAMES, nodes=NODES, max_bytes=1_000_000), "PROPS")

    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        scene = bpy.context.scene
        pm = vc.preview_materials()
        ground = vc.noise_material("sheet_dust", "#6d5a4a", "#85705c", 6.0, 0.9)
        for o in objs.values():
            o.hide_render = True
        for k, name in enumerate(BUILDERS):
            x = -3.3 + k * 2.2
            kit.instance("board_" + name, objs[name], (x, 0.0, 0.0))
            kit.text_label(name, (x, -1.2, 0.012), 0.15, pm["label"])
        vc.plane("board_ground", -20, 20, -20, 20, 0.0, ground)
        vc.preview_world(scene)
        kit.add_ortho_camera((0.0, 0.0, 0.3), 55.0, 9.0)
        vc.setup_render(scene, args.engine, args.samples, 1800, 900)
        kit.render(os.path.join(args.preview_dir, "preview-props.png"))


if __name__ == "__main__":
    main()
