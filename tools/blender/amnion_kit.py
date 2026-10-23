"""Amnion (Brood Wastes) terrain kit for Last Worlds (docs/27, art/amnion-kit).

After the user's brood-wastes concept (a reference only, never a runtime asset): clutches of amber eggs glowing from
within on sinew mounds; curved bone horns and spires; ribbed bone nests arching over a glowing yolk pool; small bone
shards. Dry, hot and calcified (Nacre is the wet, cool organic world).

Three materials. COLOR_0 carries the linear colour of every face, also for the glowing ones:
    amnion_bone  (roughness 0.85)  bone, horn and crust
    amnion_flesh (roughness 0.5)   sinew and flesh
    amnion_glow  (emissive)        egg cores and yolk: the runtime emits each face's own COLOR_0 (glow weight = its
                                   brightest channel), so colour sets the glow.

Conventions: glTF +Y up, 1 unit = 1 game unit, pivots at the base centre. Pieces marked `top` are scaled so their top
is exactly 1.0 (the runtime scales y by the instance height). Deterministic.

    R=/home/davidfarina/Projects/alien-skies
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/amnion_kit.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/amnion/amnion-kit.glb)" --preview-dir "$(wslpath -w $R/art/amnion-kit)"
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
from vesper_common import HS  # noqa: E402
from nacre_kit import hull, centre_xy, fit_top, glow_material  # noqa: E402

SEED = "amnion-kit-v1"
BONE, FLESH, GLOW = 0, 1, 2
MAT_NAMES = ("amnion_bone", "amnion_flesh", "amnion_glow")
TAU = 2.0 * math.pi
SINK = -0.1

C = {k: kit.hex_linear(v) for k, v in dict(
    bone_dark="#b3a58c", bone="#ddd3bf", bone_lit="#f3ece0", stain="#b49a74",
    flesh_dark="#3a0e0d", flesh="#6a2420", sinew="#9c4c40",
    egg_shell="#b07a38", egg_lit="#e8b25a", egg_core="#ffd45a", yolk="#ffbe3a", yolk_hot="#fff0a0",
    shell_shade="#b89a70", shell="#e2cfa6", shell_lit="#f6ead0",
).items()}


def mix(a, b, t):
    return kit.mix3(a, b, kit.clamp(t, 0.0, 1.0))


# ----------------------------------------------------------------------------
# Geometry helpers (Blender space: x right, y away from the camera = glTF -Z, z up)
# ----------------------------------------------------------------------------

def egg(hs, rng, x, y, r, tilt=(0.0, 0.0), sides=8, lit=False):
    """A low-poly egg (convex hull of rings on a prolate ellipsoid), its narrow end up and leaning a little. Most are matte
    cream shells; a `lit` one glows gold from within (after the concept: only some eggs glow)."""
    pts = []
    h = r * rng.uniform(1.25, 1.45)
    for k, t in enumerate((-.85, -.4, .15, .6)):
        rr = r * math.sqrt(max(0.0, 1 - t * t)) * (1.0 if t < 0 else 1 - .18 * t)
        z = h * (1 + t)
        for i in range(sides):
            a = (i + .5 * (k % 2)) * TAU / sides
            pts.append((x + rr * math.cos(a) + tilt[0] * z, y + rr * math.sin(a) + tilt[1] * z, z + SINK * .4))
    pts.append((x + tilt[0] * 2 * h, y + tilt[1] * 2 * h, 2 * h * .98 + SINK * .4))
    hull(hs, pts, ("glow", "egg") if lit else "shell", GLOW if lit else BONE)


def mound(hs, rng, x, y, rx, ry, h, paint="flesh", mat=FLESH, n=9):
    """A low irregular mound (sinew bed under a clutch, a bone foot under a horn)."""
    pts = []
    for i in range(n):
        a = i * TAU / n + rng.uniform(-.2, .2)
        pts.append((x + rx * math.cos(a) * rng.uniform(.8, 1.1), y + ry * math.sin(a) * rng.uniform(.8, 1.1), SINK))
        pts.append((x + rx * .6 * math.cos(a), y + ry * .6 * math.sin(a), h * rng.uniform(.6, 1.0)))
    hull(hs, pts, paint, mat)


def horn(hs, rng, x, y, h, r, bend, heading, sides=5, rings=6, paint="horn"):
    """A curved, tapering bone horn: rings along a quadratic bend toward `heading`, closing to a sharp tip."""
    ca, sa = math.cos(heading), math.sin(heading)
    loops = []
    for k in range(rings):
        t = k / (rings - 1)
        z = SINK + (h - SINK) * t
        off = bend * h * t * t
        rr = r * (1 - .9 * t ** 1.15)
        cx, cy = x + ca * off, y + sa * off
        loops.append([hs.v((cx + rr * math.cos(i * TAU / sides), cy + rr * math.sin(i * TAU / sides), z)) for i in range(sides)])
    for lo, hi in zip(loops, loops[1:]):
        for i in range(sides):
            a = (i + .5) * TAU / sides
            hs.face((lo[i], lo[(i + 1) % sides], hi[(i + 1) % sides], hi[i]), paint, "main", BONE, outward=(math.cos(a), math.sin(a), 0.0))
    tip = hs.v((x + ca * bend * h * 1.08, y + sa * bend * h * 1.08, h * 1.04))
    for i in range(sides):
        hs.face((loops[-1][i], loops[-1][(i + 1) % sides], tip), paint, "top", BONE, outward=(0.0, 0.0, 1.0))


def rib(hs, x0, y0, x1, y1, h, r, paint="bone", segs=4):
    """A bone rib arching from the ground at (x0, y0) up and over toward (x1, y1) (square section, tapering)."""
    pts = []
    for k in range(segs + 1):
        t = k / segs
        px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        pz = SINK + r + (h - SINK - r) * math.sin(t * math.pi * .62) / math.sin(math.pi * .62)
        pts.append((px, py, pz, r * (1 - .55 * t)))
    for (ax, ay, az, ar), (bx, by, bz, br) in zip(pts, pts[1:]):
        hull(hs, [(ax + dx * ar, ay + dy * ar, az + dz * ar) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
             + [(bx + dx * br, by + dy * br, bz + dz * br) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)], paint, BONE)


# ----------------------------------------------------------------------------
# Pieces
# ----------------------------------------------------------------------------

def build_eggs(rng, idx):
    """A clutch: four to eight eggs of mixed size on a sinew mound, the biggest near the middle."""
    hs = HS(rng)
    mound(hs, rng, 0, 0, .55, .45, .1)
    count = 4 + idx * 2 if idx < 2 else 6
    placed = []
    for k in range(count):
        r = rng.uniform(.13, .2) if k else .24
        for _ in range(20):
            a, d = rng.uniform(0, TAU), (0 if k == 0 else rng.uniform(.2, .5))
            x, y = math.cos(a) * d, math.sin(a) * d * .85
            if all(math.hypot(x - px, y - py) > (r + pr) * .82 for px, py, pr in placed):
                break
        placed.append((x, y, r))
        egg(hs, rng, x, y, r, tilt=(x * .25, y * .25), lit=(k % 3 == 1))
    return hs


def build_spire(rng, idx):
    """Bone horns from a bone foot: one tall curved horn (variant 0), a pair, or a crooked trio."""
    hs = HS(rng)
    mound(hs, rng, 0, 0, .32, .28, .12, paint="bonefoot", mat=BONE)
    horns = (1, 2, 3)[idx]
    for k in range(horns):
        a = rng.uniform(0, TAU)
        d = 0 if horns == 1 else rng.uniform(.08, .18)
        h = (1.0 if k == 0 else rng.uniform(.55, .8))
        horn(hs, rng, math.cos(a) * d, math.sin(a) * d, h, rng.uniform(.2, .27) * (1 if k == 0 else .8),
             bend=rng.uniform(.12, .28), heading=a + rng.uniform(-.5, .5))
    return hs


def build_nest(rng, idx):
    """A brood nest: a ring of bone ribs arching inward over a glowing yolk pool, eggs in the pool, a flesh rim."""
    hs = HS(rng)
    ribs = 7 + idx
    # The pool: a shallow glowing disc inside a low flesh rim.
    rim = [hs.v((math.cos(i * TAU / 10) * .78, math.sin(i * TAU / 10) * .78, .06)) for i in range(10)]
    centre = hs.v((0.0, 0.0, .03))
    for i in range(10):
        hs.face((rim[i], rim[(i + 1) % 10], centre), ("glow", "yolk"), "pool", GLOW, outward=(0.0, 0.0, 1.0))
    for i in range(10):
        a0, a1 = i * TAU / 10, (i + 1) * TAU / 10
        pts = [(math.cos(a) * rr, math.sin(a) * rr, z) for a in (a0, a1) for rr, z in ((.76, .02), (.98, .02), (.86, .16))] + \
              [(math.cos(a) * rr, math.sin(a) * rr, SINK) for a in (a0, a1) for rr in (.76, .98)]
        hull(hs, pts, "flesh", FLESH)
    for k in range(ribs):
        a = k * TAU / ribs + rng.uniform(-.12, .12)
        rib(hs, math.cos(a) * .95, math.sin(a) * .95, math.cos(a + .25) * .3, math.sin(a + .25) * .3, rng.uniform(.85, 1.0), rng.uniform(.045, .06))
    for k in range(3):
        a = k * TAU / 3 + rng.uniform(-.3, .3)
        egg(hs, rng, math.cos(a) * .3, math.sin(a) * .3, rng.uniform(.12, .16), lit=True)
    return hs


def build_shards(rng, idx):
    """Two to four small bone shards and knobs, half sunk in the crust."""
    hs = HS(rng)
    for k in range(2 + idx):
        x, y, s = rng.uniform(-.35, .35), rng.uniform(-.3, .3), rng.uniform(.08, .16)
        pts = [(x + rng.uniform(-s, s), y + rng.uniform(-s, s) * .7, SINK + rng.uniform(0, .05)) for _ in range(4)]
        pts += [(x + rng.uniform(-s, s) * .6, y + rng.uniform(-s, s) * .5, s * rng.uniform(.8, 2.0)) for _ in range(3)]
        hull(hs, pts, "bone", BONE)
    return hs


def sac(hs, rng, x, y, z0, r, h, sides=8):
    """A glowing heart sac: a tall ovoid hull, brightest at its crown (the nest's core)."""
    pts = []
    for k, t in enumerate((0.0, .25, .55, .82)):
        rr = r * (.75, 1.0, .92, .55)[k]
        for i in range(sides):
            a = (i + .5 * (k % 2)) * TAU / sides
            pts.append((x + rr * math.cos(a), y + rr * math.sin(a), z0 + h * t))
    pts.append((x, y, z0 + h))
    hull(hs, pts, ("glow", "sac"), GLOW)


def build_broodnest(rng, idx):
    """A landmark brood nest (replaces buildings on Amnion: user, 23 October, "go all out on making them big and
    high"): a crown of tall bone horns rising from a flesh-and-bone ring and curving inward over a glowing heart sac on
    a yolk pool, eggs piled at the foot. Authored about 1 unit across; the runtime scales it to 4–5 units and 2.5–3 high."""
    hs = HS(rng)
    # The pool and its fleshy rim.
    rim = [hs.v((math.cos(i * TAU / 12) * .38, math.sin(i * TAU / 12) * .38, .05)) for i in range(12)]
    centre = hs.v((0.0, 0.0, .03))
    for i in range(12):
        hs.face((rim[i], rim[(i + 1) % 12], centre), ("glow", "dimyolk"), "pool", GLOW, outward=(0.0, 0.0, 1.0))
    for i in range(12):
        a0, a1 = i * TAU / 12, (i + 1) * TAU / 12
        pts = [(math.cos(a) * rr, math.sin(a) * rr, z) for a in (a0, a1) for rr, z in ((.36, .03), (.68, .03), (.52, .18))] + \
              [(math.cos(a) * rr, math.sin(a) * rr, SINK) for a in (a0, a1) for rr in (.36, .68)]
        hull(hs, pts, "flesh", FLESH)
    sac(hs, rng, 0.0, 0.0, .02, .16, .5 + idx * .1)
    # The crown: tall horns from the rim, leaning out then curving back in over the sac.
    horns = 9 + idx
    for k in range(horns):
        a = k * TAU / horns + rng.uniform(-.1, .1)
        x, y = math.cos(a) * .62, math.sin(a) * .62
        h = rng.uniform(.88, 1.0) if k % 2 == 0 else rng.uniform(.62, .8)
        horn(hs, rng, x, y, h, rng.uniform(.1, .135), bend=-rng.uniform(.18, .3), heading=a, sides=5, rings=7)
    # Eggs piled at the foot, outside the rim.
    for k in range(8):
        a = rng.uniform(0, TAU)
        egg(hs, rng, math.cos(a) * rng.uniform(.72, .9), math.sin(a) * rng.uniform(.72, .9), rng.uniform(.07, .11), lit=(k % 3 == 0))
    return hs


def build_hive(rng, idx):
    """A landmark hive spire: a tall cluster of ribbed bone horns around glowing pods, like a cathedral of bone (after
    the concept's spires with lit cores). About 1 unit across before scaling."""
    hs = HS(rng)
    mound(hs, rng, 0, 0, .45, .4, .12, paint="bonefoot", mat=BONE)
    for k in range(3):
        a = k * TAU / 3 + rng.uniform(-.3, .3)
        sac(hs, rng, math.cos(a) * .12, math.sin(a) * .12, .05, .1, rng.uniform(.3, .45))
    tall = 7 + idx
    for k in range(tall):
        a = k * TAU / tall + rng.uniform(-.15, .15)
        d = rng.uniform(.18, .34)
        h = 1.0 if k == 0 else rng.uniform(.5, .92)
        horn(hs, rng, math.cos(a) * d, math.sin(a) * d, h, rng.uniform(.1, .15), bend=rng.uniform(-.15, .12), heading=a, sides=5, rings=7)
    return hs


def strand(hs, x0, z0, x1, z1, sag, r, y=0.0, segs=8, sides=4):
    """A sinew strand hanging between (x0, z0) and (x1, z1), sagging `sag` at its middle, tapering toward its middle."""
    loops = []
    for k in range(segs + 1):
        t = k / segs
        x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t - sag * 4 * t * (1 - t)
        rr = r * (1 - .45 * math.sin(t * math.pi))
        loops.append([hs.v((x, y + rr * math.cos(i * TAU / sides), z + rr * math.sin(i * TAU / sides))) for i in range(sides)])
    for lo, hi in zip(loops, loops[1:]):
        for i in range(sides):
            a = (i + .5) * TAU / sides
            hs.face((lo[i], hi[i], hi[(i + 1) % sides], lo[(i + 1) % sides]), "sinew", "main", FLESH, outward=(0.0, math.cos(a), math.sin(a)))


def build_web(rng, idx):
    """Sinew strands spanning a crevasse (user, 23 October: "fleshy strings ... hanging between the cliffs so the glow
    shimmers between them"): three to six strands across x −1 … +1, anchored near the top, sagging into the gap at
    different depths and a little apart along y. The runtime scales x to the crevasse's width."""
    hs = HS(rng)
    for k in range(4 + idx):
        y = rng.uniform(-.4, .4)
        z0, z1 = rng.uniform(-.05, .0), rng.uniform(-.25, .0)
        strand(hs, -1.0, z0, 1.0, z1, rng.uniform(.2, .8), rng.uniform(.04, .07), y=y)
    return hs


def colour_fn_for(hs, name):
    zs = [v[2] for v in hs.verts]
    zhi = max(zs)
    rng = random.Random(f"{SEED}:shade:{name}")
    jit = [rng.uniform(0.0, 1.0) for _ in hs.faces]

    def fn(paint, p, n, ao, fi):
        kind = paint if isinstance(paint, str) else paint[0]
        j = jit[fi]
        if kind == "glow":
            if paint[1] == "egg":
                # Amber shells, brighter toward the crown and where they face up (the core shows through).
                return mix(mix(C["egg_shell"], C["egg_lit"], kit.smoothstep(-.2, .9, n.z) * .7 + j * .2), C["egg_core"], kit.smoothstep(.75, 1.0, n.z) * .5)
            if paint[1] == "dimyolk":
                return mix(kit.hex_linear("#7a3c0c"), C["yolk"], (1 - kit.clamp(math.hypot(p.x, p.y) / .38, 0, 1)) * .5)
            if paint[1] == "sac":
                return mix(C["egg_lit"], C["yolk_hot"], kit.smoothstep(.2, 1.0, p.z / max(zhi, 1e-3)) * .8 + kit.clamp(n.z, 0, 1) * .2)
            return mix(C["yolk"], C["yolk_hot"], (1 - kit.clamp(math.hypot(p.x, p.y) / .78, 0, 1)) * .6 + j * .15)
        if kind == "shell":
            return kit.mul3(mix(C["shell_shade"], mix(C["shell"], C["shell_lit"], kit.clamp(n.z, 0, 1)), kit.smoothstep(-.6, .4, n.z) + j * .1), kit.lerp(.6, 1.0, ao))
        if kind == "sinew":
            return mix(mix(C["flesh"], C["sinew"], .6), kit.hex_linear("#c8806c"), kit.clamp(n.z, 0, 1) * .5 + j * .15)
        if kind in ("flesh",):
            return kit.mul3(mix(C["flesh_dark"], C["flesh"], kit.smoothstep(-.1, .2, p.z) * .7 + j * .3), kit.lerp(.5, 1.0, ao))
        # Bone: pale along its length (it is seen from above), a little stained low, palest where it faces up.
        t = kit.clamp(p.z / max(zhi, 1e-3), 0, 1)
        col = mix(C["bone_dark"], C["bone"], .55 + t * .45 + kit.clamp(n.z, 0, 1) * .3)
        col = mix(col, C["bone_lit"], kit.smoothstep(.7, 1.0, t) * .5 * max(0.0, n.z * .5 + .5))
        if kind == "bonefoot":
            col = mix(col, C["stain"], .45)
        return kit.mul3(col, kit.lerp(.5, 1.0, ao) * (.92 + .16 * j))
    return fn


# name prefix -> (builder, variants, footprint half, top (exact 1.0) or None, y_max when not exact, budget)
PIECES = {
    "amn_eggs": (build_eggs, 3, 0.7, False, 0.85, 700),
    "amn_spire": (build_spire, 3, 0.55, True, None, 420),
    "amn_nest": (build_nest, 2, 1.1, True, None, 1200),
    "amn_shards": (build_shards, 3, 0.55, False, 0.45, 160),
    # Landmarks (Amnion's buildings) and the crevasse webs; the landmarks top out at exactly 1 (scaled in the game).
    "amn_broodnest": (build_broodnest, 2, 1.0, True, None, 2600),
    "amn_hive": (build_hive, 2, 0.6, True, None, 1800),
    "amn_web": (build_web, 3, 1.05, False, 0.1, 800),
}


def node_list():
    out = []
    for prefix, (fn, variants, half, top, ymax, budget) in PIECES.items():
        for i in range(variants):
            # Webs hang from their anchor (rim height) down into the crevasse; every other piece stands on its base.
            rule = dict(budget=budget, x=(-half, half), z=(-half, half), y_min=-1.0 if prefix == "amn_web" else -0.15, mats=MAT_NAMES)
            if top:
                rule["y_max_exact"] = 1.0
            else:
                rule["y_max"] = ymax
            out.append((f"{prefix}_{i}", prefix, fn, i, rule))
    return out


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="amnion_kit.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = [vc.make_material("amnion_bone", "vc", rough=0.85), vc.make_material("amnion_flesh", "vc", rough=0.5), glow_material("amnion_glow")]
    objs, nodes = {}, {}
    for name, prefix, fn, idx, rule in node_list():
        hs = fn(random.Random(f"{SEED}:{name}"), idx)
        vc.triangulate_nonplanar(hs)
        centre_xy(hs)
        cols = vc.bake(hs, name, dict(glow=set(), ao=0.35, ground=0.0, colour_fn=colour_fn_for(hs, name)))
        authored = max(v[2] for v in hs.verts)
        if "y_max_exact" in rule:
            fit_top(hs, 1.0)
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        nodes[name] = rule
        print(f"AKIT {name:14s} tris={hs.tris():5d} authored_height={authored:.3f}")
    vc.publish(args.glb, "amnion_kit.py", dict(materials=MAT_NAMES, nodes=nodes, max_bytes=1_500_000), "AKIT")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        pm = glow_material("amnion_glow_preview", preview=True)
        for o in objs.values():
            for k, slot in enumerate(o.data.materials):
                if slot and slot.name == "amnion_glow":
                    o.data.materials[k] = pm
        render_sheet(objs, args)


def render_sheet(objs, args):
    """All pieces in rows from the game's camera under a warm desert light (preview only)."""
    import boss_remodel as br
    scene = bpy.context.scene
    names = list(objs)
    for i, name in enumerate(names):
        objs[name].location = ((i % 6 - 2.5) * 2.4, (i // 6) * 2.6, 0.0)
    br.game_view(scene, (0.0, 1.3, 0.4), 15.0, os.path.join(args.preview_dir, "amnion-kit.png"), res=1400,
                 objects=list(objs.values()), light="desert")


if __name__ == "__main__":
    main()
