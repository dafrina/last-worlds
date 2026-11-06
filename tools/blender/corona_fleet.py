"""Corona's fleet, third pass (docs/37): the enemy craft of the Dying Star, after art/concepts/corona/03-craft.webp.

The user, 6 November 2026: "the enemies suck they look really cheaply made. Like toy insects", then "Rebuild in Blender".
The first two passes (tools/blender/corona_craft.py) were boxes and beetle shells with thin floating arcs and little legs.
This pass builds on the Umbral fleet's surfaces (tools/blender/umbra_craft.py, which the user approved): every hull is
lofted from smooth sections meeting at knife edges, glowing lines are grooves cut into the same surfaces, silhouettes
end in hard points. Corona's own identity, after the concept sheet:
    - dark scorched-bronze armour (pale plates washed out over the bright plasma), its knife edges a bright gold, so a
      craft reads as a dark shape with a lit rim over the plasma and over the basalt alike;
    - molten gold glow lines and white-gold cores (the plasma's colours);
    - heavier, more mechanical masses than Umbra's blades: engine nacelles, cannon barrels, armoured cowls, crescents
      only where the concept has them (the artillery ring and the Wraith's scythes), never thin floating hoops.

Nodes (public/assets/corona/corona-craft.glb; src/render/scene.ts CORONA_CRAFT maps the game's kinds onto them):
    corona_interceptor  dart, needle    concept 2: a lance hull with a long spike nose, a glowing spine, raked side fins
    corona_fighter      weaver          concept 1: an arrow body, wings swept back then hooked forward, two nacelles
    corona_hunter       lancer          concept 5: a long armoured hull round a glowing core, twin cannons, side pods
    corona_carrier      diamond         concept 3: the broad heavy, three glowing cannons in its prow, stub wings
    corona_artillery    pulsar          concept 4: an open ring of two crescents round a glowing core, a barrel forward
    corona_drone        boss pods       a small pointed dart with a glowing eye
    corona_turret       turret, missile ground battery (base pivot, lowest point -0.05): an armoured drum, three buttress
                                        blades, a cowled head with a glowing eye and a barrel spike
    corona_wraith       the Wraith      concept 6: a reactor hub between two great crescent scythes, a spiked prow
Frame (as umbra_craft.py): design x right, y forward (the nose, toward the player), z up; glTF +Y up, noses +Z. Air craft
pivot at their mid-plane. Sockets: <node>_engine_N (the game's plumes), <node>_muzzle_N, <node>_core.

Materials (the runtime loader, src/render/models.ts loadCraftNodes, classes them by name; COLOR_0 carries the colour):
    corona_plate      the armour: dark scorched bronze, lighter on top, bright gold knife edges (metal 0.35, roughness
                      0.45 at runtime)
    corona_glow       molten gold lines (emissive)
    corona_glow_hot   white-gold cores and nozzles (emissive)

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/corona_fleet.py)" -- --glb "$(wslpath -w public/assets/corona/corona-craft.glb)" \\
        [--preview-dir "$(wslpath -w lookdev/corona/fleet)"] [--only corona_fighter] [--wip]
"""
import argparse, math, os, random, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import umbra_craft as uc  # noqa: E402
from umbra_craft import (P, E, EK, Mesh, append, blade, blade_sec, body_sec, eye, hull, lens_t, mirrored, halves,  # noqa: E402
                         centre_crest, revolve, seam, surface_z, symmetric, taper, tip_edge, tube)
import khepri_kit as kit  # noqa: E402
import nacre_fleet as nf  # noqa: E402
import vesper_common as vc  # noqa: E402

SEED = "corona-fleet-v3"
OBS, GLOW, HOT = uc.OBS, uc.GLOW, uc.HOT
MAT_NAMES = ("corona_plate", "corona_glow", "corona_glow_hot")
GLOW_HEX, HOT_HEX = "#ffa62e", "#fff1c8"
TAU = 2.0 * math.pi

# The bake's palette (umbra_craft.bake reads uc.C): scorched bronze armour, lifted where it faces up, bright bronze-gold on
# the knife edges, the plasma's orange next to every glow.
uc.C = {k: kit.hex_linear(v) for k, v in dict(
    deep="#0d0907", lit="#2c2119", edge="#a06a36", edge_hi="#ffc070", bounce="#ff8a2e",
    glow=GLOW_HEX, hot=HOT_HEX,
).items()}


def nacelle(m, x, y0, y1, r, z=0.0, glow_line=True):
    """An engine nacelle along y at x: a rounded armoured pod, a white-gold nozzle ring at its tail, a gold line on top."""
    seams = [seam("top", 0.0, 0.16, [(0.3, 0.85, 0.12, GLOW)])] if glow_line else []
    seams.append(seam("bot", 0.0, 0.9, [(0.0, 0.1, 0.04, HOT)]))
    sec = body_sec(n=6, r=1.05, k=0.9, seams=seams)
    st = [(y0, r * 0.82, r * 0.8, r * 0.8, z), (y0 + (y1 - y0) * 0.18, r, r * 0.95, r * 0.9, z),
          (y0 + (y1 - y0) * 0.7, r * 0.95, r * 0.9, r * 0.85, z), (y1, r * 0.5, r * 0.5, r * 0.45, z)]
    hull(m, st, sec, nose=P(x, y1 + r * 0.3, z), tail=None, x=x, edge=lambda t: 0.7)


def barrel(m, x, y0, y1, r, z, hot_tip=True):
    """A cannon barrel along y: a tapered tube, a gold line along its crest, a white-gold muzzle."""
    sec = blade_sec(n=5, r=1.0, k=0.9, seams=[seam("top", 0.0, 0.3, [(0.1, 0.8, 0.1, GLOW)])] +
                    ([seam("top", 0.0, 0.9, [(0.86, 1.0, 0.02, HOT)])] if hot_tip else []))
    tube(m, [P(x, y0, z), P(x, (y0 + y1) / 2, z), P(x, y1, z)], [r, r * 0.85, r * 0.7], [r, r * 0.85, r * 0.7],
         [r * 0.8, r * 0.7, r * 0.6], sec, cap0=True, cap1=True, edge=lambda t: 0.6 + 0.4 * t)


def crescent(m, centre, r_out, r_in, a0, a1, z, top, bot, sec, n=19, tip_in=0.0):
    """A thick crescent blade round `centre` from angle a0 to a1: outer edge on r_out, inner on r_in, meeting in points."""
    cx, cy = centre
    A, B = [], []
    for k in range(n):
        t = k / (n - 1)
        a = a0 + (a1 - a0) * t
        w = math.sin(math.pi * t) ** 0.6
        ro = r_in + (r_out - r_in) * (0.08 + 0.92 * w)
        A.append(P(cx + math.cos(a) * ro, cy + math.sin(a) * ro, z - 0.03 * (1 - w)))
        B.append(P(cx + math.cos(a) * (r_in - tip_in * (1 - w)), cy + math.sin(a) * (r_in - tip_in * (1 - w)), z - 0.03 * (1 - w)))
    blade(m, A, B, top, bot, sec, start="apex", end="apex", edge=lambda t: 0.6 + 0.7 * abs(2 * t - 1))


# ----------------------------------------------------------------------------- corona_interceptor (dart, needle)
def build_interceptor(rng):
    m = Mesh(rng)
    # The lance: an armoured spine, a glowing core line down its back, a white-gold heart, a long spike nose.
    sec = body_sec(n=7, r=1.15, k=0.8, seams=[seam("top", 0.0, 0.2, [(0.38, 0.95, 0.1, GLOW)]),
                                              seam("top", 0.0, 0.32, [(0.16, 0.34, 0.08, HOT)])])
    st = [(-0.5, 0.07, 0.045, 0.03), (-0.38, 0.12, 0.085, 0.045), (-0.2, 0.14, 0.1, 0.05), (0.0, 0.135, 0.1, 0.05),
          (0.18, 0.11, 0.085, 0.042), (0.32, 0.075, 0.06, 0.03), (0.44, 0.04, 0.036, 0.02)]
    hull(m, st, sec, nose=P(0.0, 0.62, 0.008), tail=P(0.0, -0.58, 0.0), edge=lambda t: 0.8)
    half = Mesh(rng)
    # Raked side fins (the concept's angled gold panels): swept forward from the rear flank, a gold groove along each.
    fsec = blade_sec(n=5, r=1.2, ridge=0.25, seams=[seam("top", 0.1, 0.34, [(0.15, 0.8, 0.12, GLOW)])])
    blade(half, E([(0.12, 0.02, 0.02), (0.24, 0.02, 0.01), (0.33, 0.08, -0.004), (0.39, 0.18, -0.02)], 10),
          E([(0.12, -0.36, 0.01), (0.24, -0.34, 0.0), (0.34, -0.14, -0.01), (0.39, 0.18, -0.02)], 10),
          taper(0.06, 0.8), taper(0.028, 1.0, 0.002), fsec, start="cap", end="apex", edge=tip_edge(0.55, 1.3))
    # Twin engine pods tight to the tail.
    nacelle(half, 0.13, -0.6, -0.2, 0.06, z=0.0, glow_line=False)
    symmetric(m, half)
    return m


def interceptor_sockets():
    return {"corona_interceptor_muzzle_0": (0.0, 0.008, 0.66), "corona_interceptor_core": (0.0, 0.08, 0.04),
            "corona_interceptor_engine_0": (-0.13, 0.0, -0.6), "corona_interceptor_engine_1": (0.13, 0.0, -0.6)}


# ----------------------------------------------------------------------------- corona_fighter (weaver)
def build_fighter(rng):
    m = Mesh(rng)
    # Arrow body: a chined armoured hull, a white-gold cockpit slit, a gold line forward, a spike nose.
    sec = body_sec(n=7, r=1.2, k=0.8, seams=[seam("top", 0.0, 0.22, [(0.5, 0.92, 0.1, GLOW)]),
                                             seam("top", 0.0, 0.34, [(0.3, 0.46, 0.08, HOT)])])
    st = [(-0.56, 0.1, 0.06, 0.04), (-0.42, 0.16, 0.12, 0.06), (-0.22, 0.2, 0.145, 0.07), (0.0, 0.19, 0.15, 0.07),
          (0.2, 0.15, 0.125, 0.06), (0.36, 0.1, 0.09, 0.04), (0.48, 0.055, 0.05, 0.024)]
    hull(m, st, sec, nose=P(0.0, 0.74, 0.01), tail=P(0.0, -0.64, 0.0), edge=lambda t: 0.8)
    half = Mesh(rng)
    # Wings (concept 1): swept back from the shoulder, then hooking forward to a hard tip; two gold grooves (the
    # honeycomb panels) along the inner wing, the crest toward the leading edge.
    wsec = blade_sec(n=6, r=1.3, k=0.3, ridge=0.3, seams=[seam("top", -0.15, 0.13, [(0.08, 0.62, 0.1, GLOW)]),
                                                         seam("top", -0.55, 0.11, [(0.12, 0.5, 0.1, GLOW)])])
    A = EK([[(0.12, 0.26, 0.02), (0.3, 0.12, 0.01), (0.48, -0.06, -0.01), (0.6, -0.12, -0.02)],
            [(0.6, -0.12, -0.02), (0.68, -0.06, -0.025), (0.74, 0.1, -0.03)]], 15)
    B = EK([[(0.12, -0.36, 0.01), (0.32, -0.38, 0.0), (0.5, -0.36, -0.015), (0.64, -0.3, -0.025)],
            [(0.64, -0.3, -0.025), (0.7, -0.16, -0.028), (0.74, 0.1, -0.03)]], 15)
    blade(half, A, B, lambda t: 0.06 * (1 - t) ** 0.8 + 0.006, lambda t: 0.028 * (1 - t) + 0.003, wsec, start="cap", end="apex",
          edge=tip_edge(0.55, 1.35))
    # Engine nacelles on the wing roots.
    nacelle(half, 0.26, -0.78, -0.14, 0.085)
    symmetric(m, half)
    return m


def fighter_sockets():
    return {"corona_fighter_muzzle_0": (0.0, 0.01, 0.8), "corona_fighter_core": (0.0, 0.12, 0.06),
            "corona_fighter_engine_0": (-0.26, 0.0, -0.78), "corona_fighter_engine_1": (0.26, 0.0, -0.78)}


# ----------------------------------------------------------------------------- corona_hunter (lancer)
def build_hunter(rng):
    m = Mesh(rng)
    # A long armoured hull round its glowing plasma core (concept 5): the core an elongated white-gold eye on the back,
    # gold lines running fore and aft of it.
    sec = body_sec(n=8, r=1.1, k=0.85, seams=[seam("top", 0.0, 0.14, [(0.62, 0.92, 0.08, GLOW), (0.04, 0.26, 0.08, GLOW)])])
    st = [(-0.62, 0.11, 0.07, 0.045), (-0.46, 0.18, 0.13, 0.065), (-0.22, 0.21, 0.16, 0.075), (0.04, 0.21, 0.165, 0.075),
          (0.28, 0.17, 0.14, 0.065), (0.44, 0.11, 0.1, 0.045)]
    hull(m, st, sec, nose=P(0.0, 0.58, 0.02), tail=P(0.0, -0.74, 0.0), edge=lambda t: 0.8)
    z = surface_z(m, 0.0, -0.08)
    eye(m, P(0.0, -0.08, z), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.2, 0.07, 0.03, 0.03, 0.026, hot_frac=0.55, seg=18)
    half = Mesh(rng)
    # Twin cannons reaching past the nose (the beam emitters).
    barrel(half, 0.15, 0.1, 0.8, 0.05, 0.03)
    # Side pods with short angled wings (the concept's flanking engines and gold panels).
    nacelle(half, 0.36, -0.66, -0.02, 0.085)
    wsec = blade_sec(n=5, r=1.2, ridge=0.25, seams=[seam("top", -0.1, 0.3, [(0.15, 0.75, 0.12, GLOW)])])
    blade(half, E([(0.42, -0.08, 0.0), (0.48, -0.02, -0.01), (0.54, 0.06, -0.025)], 8),
          E([(0.42, -0.44, 0.0), (0.5, -0.36, -0.012), (0.54, 0.06, -0.025)], 8),
          taper(0.04, 0.8), taper(0.018, 1.0, 0.002), wsec, start="cap", end="apex", edge=tip_edge(0.55, 1.3))
    # Pylons joining the pods to the hull.
    ysec = blade_sec(n=4, r=1.1)
    blade(half, E([(0.16, -0.06, 0.02), (0.24, -0.08, 0.01), (0.32, -0.1, 0.0)], 5),
          E([(0.16, -0.44, 0.02), (0.24, -0.44, 0.01), (0.32, -0.44, 0.0)], 5), 0.045, 0.03, ysec, start="cap", end="cap")
    symmetric(m, half)
    return m


def hunter_sockets():
    return {"corona_hunter_muzzle_0": (-0.15, 0.03, 0.8), "corona_hunter_muzzle_1": (0.15, 0.03, 0.8),
            "corona_hunter_core": (0.0, 0.16, -0.08),
            "corona_hunter_engine_0": (-0.36, 0.0, -0.66), "corona_hunter_engine_1": (0.36, 0.0, -0.66)}


# ----------------------------------------------------------------------------- corona_carrier (diamond)
def build_carrier(rng):
    m = Mesh(rng)
    # The broad heavy (concept 3): a wide armoured body, its back stepped in two layers of plate, gold lines along the
    # upper plate; three glowing cannons in the prow.
    sec = body_sec(n=8, r=1.0, k=0.9, seams=[seam("top", 0.45, 0.08, [(0.2, 0.8, 0.12, GLOW)]),
                                             seam("top", -0.45, 0.08, [(0.2, 0.8, 0.12, GLOW)])])
    st = [(-0.84, 0.2, 0.08, 0.05), (-0.66, 0.34, 0.15, 0.08), (-0.36, 0.4, 0.19, 0.1), (0.0, 0.4, 0.2, 0.1),
          (0.3, 0.36, 0.18, 0.09), (0.5, 0.28, 0.13, 0.07), (0.6, 0.2, 0.08, 0.05)]
    hull(m, st, sec, nose=None, tail=P(0.0, -0.94, 0.0), edge=lambda t: 0.75)
    usec = body_sec(n=6, r=1.1, k=0.85, seams=[seam("top", 0.0, 0.18, [(0.1, 0.75, 0.1, GLOW)]),
                                               seam("top", 0.0, 0.3, [(0.78, 0.95, 0.04, HOT)])])
    ust = [(-0.62, 0.1, 0.24, 0.14), (-0.4, 0.2, 0.28, 0.15), (-0.06, 0.22, 0.285, 0.15), (0.24, 0.18, 0.26, 0.14),
           (0.36, 0.12, 0.23, 0.13)]
    hull(m, [(y, w, top - 0.12, 0.0, 0.12) for y, w, top, _ in ust], usec, nose=P(0.0, 0.44, 0.17), tail=P(0.0, -0.72, 0.12),
         edge=lambda t: 0.8)
    barrel(m, 0.0, 0.4, 0.86, 0.085, 0.06)
    half = Mesh(rng)
    barrel(half, 0.22, 0.34, 0.78, 0.075, 0.04)
    # Stub wings with gold panels, a hard point aft.
    wsec = blade_sec(n=6, r=1.25, k=0.3, ridge=0.3, seams=[seam("top", -0.25, 0.22, [(0.12, 0.72, 0.1, GLOW)])])
    blade(half, E([(0.36, 0.1, 0.02), (0.56, 0.0, 0.0), (0.74, -0.14, -0.02), (0.82, -0.34, -0.04)], 11),
          E([(0.36, -0.5, 0.02), (0.56, -0.5, 0.0), (0.72, -0.46, -0.02), (0.82, -0.34, -0.04)], 11),
          taper(0.07, 0.8), taper(0.03, 1.0, 0.003), wsec, start="cap", end="apex", edge=tip_edge(0.55, 1.3))
    # Four engines: two inner nacelles and two on the wing roots.
    nacelle(half, 0.15, -0.98, -0.46, 0.105)
    nacelle(half, 0.44, -0.86, -0.4, 0.09)
    symmetric(m, half)
    return m


def carrier_sockets():
    return {"corona_carrier_muzzle_0": (0.0, 0.06, 0.86), "corona_carrier_core": (0.0, 0.29, 0.0),
            "corona_carrier_engine_0": (-0.44, 0.0, -0.86), "corona_carrier_engine_1": (-0.15, 0.0, -0.98),
            "corona_carrier_engine_2": (0.15, 0.0, -0.98), "corona_carrier_engine_3": (0.44, 0.0, -0.86)}


# ----------------------------------------------------------------------------- corona_artillery (pulsar)
def build_artillery(rng):
    m = Mesh(rng)
    # A central reactor with a great glowing core (concept 4), an open ring of two thick crescents round it on spokes,
    # a short barrel forward, an engine block aft.
    sec = body_sec(n=8, r=1.0, k=0.9, seams=[seam("top", 0.0, 0.12, [(0.0, 0.18, 0.06, HOT)])])
    st = [(-0.3, 0.12, 0.08, 0.06), (-0.2, 0.22, 0.15, 0.09), (0.0, 0.26, 0.18, 0.1), (0.2, 0.22, 0.15, 0.09), (0.3, 0.12, 0.08, 0.06)]
    hull(m, st, sec, nose=P(0.0, 0.38, 0.02), tail=P(0.0, -0.38, 0.0), edge=lambda t: 0.75)
    z = surface_z(m, 0.0, 0.0)
    eye(m, P(0.0, 0.0, z), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.16, 0.16, 0.06, 0.05, 0.04, hot_frac=0.62, seg=22)
    barrel(m, 0.0, 0.3, 0.86, 0.08, 0.05)
    nacelle(m, 0.0, -0.86, -0.3, 0.12)
    half = Mesh(rng)
    # The ring: a crescent each side, open front and back, gold grooves along its crest.
    csec = blade_sec(n=6, r=1.3, ridge=0.2, seams=[seam("top", 0.0, 0.18, [(0.18, 0.82, 0.1, GLOW)])])
    crescent(half, (0.0, 0.0), 0.71, 0.5, math.radians(62), math.radians(-62), 0.0, lens_t(0.075, power=0.6),
             lens_t(0.035), csec, n=19)
    # Spokes from the reactor to the ring.
    ssec = blade_sec(n=4, r=1.1, seams=[seam("top", 0.0, 0.3, [(0.2, 0.8, 0.1, GLOW)])])
    for a in (math.radians(35), math.radians(-35)):
        c, s = math.cos(a), math.sin(a)
        blade(half, [P(c * 0.22 - s * 0.065, s * 0.22 + c * 0.065, 0.02), P(c * 0.38 - s * 0.055, s * 0.38 + c * 0.055, 0.01),
                     P(c * 0.54 - s * 0.05, s * 0.54 + c * 0.05, 0.0)],
              [P(c * 0.22 + s * 0.065, s * 0.22 - c * 0.065, 0.02), P(c * 0.38 + s * 0.055, s * 0.38 - c * 0.055, 0.01),
               P(c * 0.54 + s * 0.05, s * 0.54 - c * 0.05, 0.0)], 0.05, 0.035, ssec, start="cap", end="cap")
    symmetric(m, half)
    return m


def artillery_sockets():
    return {"corona_artillery_muzzle_0": (0.0, 0.05, 0.88), "corona_artillery_core": (0.0, 0.2, 0.0),
            "corona_artillery_engine_0": (0.0, 0.0, -0.86)}


# ----------------------------------------------------------------------------- corona_drone
def build_drone(rng):
    m = Mesh(rng)
    sec = body_sec(n=6, r=1.15, seams=[seam("top", 0.0, 0.22, [(0.45, 0.92, 0.1, GLOW)])])
    st = [(-0.24, 0.04, 0.026, 0.016), (-0.14, 0.064, 0.05, 0.028), (0.0, 0.07, 0.058, 0.03), (0.12, 0.055, 0.05, 0.026),
          (0.22, 0.03, 0.03, 0.016)]
    hull(m, st, sec, nose=P(0.0, 0.32, 0.004), tail=P(0.0, -0.3, 0.0), edge=lambda t: 0.8)
    z = surface_z(m, 0.0, -0.04)
    eye(m, P(0.0, -0.04, z), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.04, 0.05, 0.016, 0.014, 0.012, hot_frac=0.6, seg=12)
    half = Mesh(rng)
    wsec = blade_sec(n=4, r=1.2, ridge=0.3)
    blade(half, E([(0.05, 0.08, 0.006), (0.15, 0.02, 0.0), (0.22, -0.08, -0.012), (0.26, -0.22, -0.026)], 10),
          E([(0.05, -0.16, 0.0), (0.14, -0.16, -0.005), (0.21, -0.18, -0.015), (0.26, -0.22, -0.026)], 10),
          taper(0.032, 0.8), taper(0.014, 1.0, 0.002), wsec, start="cap", end="apex", edge=tip_edge(0.6, 1.3))
    symmetric(m, half)
    return m


def drone_sockets():
    return {"corona_drone_muzzle_0": (0.0, 0.004, 0.32), "corona_drone_engine_0": (0.0, 0.0, -0.28)}


# ----------------------------------------------------------------------------- corona_turret (ground battery)
TURRET_HEAD_Z = 0.5


def build_turret(rng):
    m = Mesh(rng)
    base_z, seg = -0.05, 24
    rot = -TAU / seg / 2.0

    def ring(i, k):
        return GLOW if k == 2 and (i % 3) != 0 else OBS
    # An armoured drum: a broad footing, a glowing ring of vents, the body narrowing to a neck.
    revolve(m, [(0.34, base_z), (0.44, -0.02)], seg, rot=rot, start=P(0.0, 0.0, base_z))
    revolve(m, [(0.44, -0.02), (0.42, 0.04), (0.36, 0.08), (0.33, 0.1), (0.3, 0.16), (0.24, 0.24), (0.16, 0.32),
                (0.12, 0.38), (0.11, 0.44)], seg, ring, rot=rot, end=P(0.0, 0.0, 0.44))
    # Three buttress blades bracing the drum.
    claw = Mesh(rng)
    blade(claw, E([(0.12, 0.06, 0.34), (0.3, 0.07, 0.2), (0.44, 0.05, 0.06), (0.54, 0.0, -0.04)], 10),
          E([(0.12, -0.06, 0.34), (0.3, -0.06, 0.2), (0.44, -0.05, 0.06), (0.54, 0.0, -0.04)], 10),
          taper(0.05, 0.7), taper(0.02, 1.0, 0.002), blade_sec(n=4, ridge=0.2), edge=tip_edge(0.55, 1.25))
    for k in range(3):
        append(m, claw, Matrix.Rotation(math.radians(90 + 120 * k + 60), 4, "Z"))
    # The cowled head: a faceted cap, a white-gold eye toward the player, a barrel spike between two short prongs.
    hz = TURRET_HEAD_Z
    revolve(m, [(0.08, hz - 0.08), (0.17, hz - 0.04), (0.2, hz)], 16, rot=rot, start=P(0.0, 0.0, hz - 0.09))
    revolve(m, [(0.2, hz), (0.16, hz + 0.04), (0.1, hz + 0.065), (0.05, hz + 0.075)], 16, rot=rot, end=P(0.0, 0.0, hz + 0.08))
    eye(m, P(0.0, 0.14, hz + 0.05), (0.0, 0.45, 1.0), (0.0, 1.0, 0.0), 0.05, 0.045, 0.02, 0.018, 0.014, hot_frac=0.6, seg=12)
    barrel(m, 0.0, 0.1, 0.5, 0.04, hz + 0.02)
    half = Mesh(rng)
    blade(half, E([(0.12, 0.06, hz), (0.13, 0.2, hz), (0.09, 0.36, hz - 0.004)], 9),
          E([(0.07, 0.12, hz + 0.015), (0.08, 0.24, hz + 0.01), (0.09, 0.36, hz - 0.004)], 9),
          taper(0.03, 0.8), taper(0.016, 1.0, 0.002), blade_sec(n=4), edge=tip_edge(0.6, 1.25))
    symmetric(m, half)
    return m


def turret_sockets():
    return {"corona_turret_muzzle_0": (0.0, TURRET_HEAD_Z + 0.02, 0.5), "corona_turret_core": (0.0, TURRET_HEAD_Z + 0.06, 0.14)}


# ----------------------------------------------------------------------------- corona_wraith
def build_wraith(rng):
    m = Mesh(rng)
    # The reactor hub (concept 6): a broad armoured disc body with a great white-gold core, a spine aft to the engines,
    # a long spiked prow forward between two shorter prongs.
    sec = body_sec(n=8, r=1.0, k=0.9, seams=[seam("top", 0.5, 0.08, [(0.2, 0.8, 0.12, GLOW)]),
                                             seam("top", -0.5, 0.08, [(0.2, 0.8, 0.12, GLOW)])])
    st = [(-0.5, 0.18, 0.1, 0.07), (-0.34, 0.32, 0.18, 0.1), (-0.1, 0.38, 0.22, 0.12), (0.14, 0.36, 0.21, 0.11),
          (0.34, 0.26, 0.17, 0.09), (0.48, 0.14, 0.11, 0.06)]
    hull(m, st, sec, nose=None, tail=None, edge=lambda t: 0.75)
    z = surface_z(m, 0.0, -0.02)
    eye(m, P(0.0, -0.02, z), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.24, 0.24, 0.08, 0.07, 0.05, hot_frac=0.6, seg=24)
    psec = body_sec(n=6, r=1.15, k=0.8, seams=[seam("top", 0.0, 0.2, [(0.05, 0.85, 0.1, GLOW)])])
    pst = [(0.44, 0.17, 0.15, 0.08), (0.7, 0.15, 0.13, 0.07), (1.0, 0.12, 0.1, 0.05), (1.3, 0.07, 0.065, 0.032)]
    hull(m, pst, psec, nose=P(0.0, 1.62, 0.02), tail=None, edge=lambda t: 0.8)
    sst = [(-1.3, 0.06, 0.06, 0.04), (-1.1, 0.1, 0.1, 0.06), (-0.8, 0.12, 0.13, 0.07), (-0.46, 0.14, 0.15, 0.08)]
    hull(m, sst, body_sec(n=6, r=1.1, k=0.8, seams=[seam("top", 0.0, 0.18, [(0.2, 0.9, 0.1, GLOW)])]), nose=None,
         tail=P(0.0, -1.42, 0.0), edge=lambda t: 0.75)
    half = Mesh(rng)
    # The great scythes: thick crescents sweeping from beside the prow round to hooked tips aft, gold grooves along them.
    csec = blade_sec(n=7, r=1.35, k=0.3, ridge=0.25, seams=[seam("top", 0.25, 0.12, [(0.15, 0.85, 0.1, GLOW)]),
                                                         seam("top", -0.35, 0.1, [(0.25, 0.75, 0.1, GLOW)])])
    crescent(half, (0.12, -0.05), 1.4, 0.94, math.radians(68), math.radians(-78), 0.0, lens_t(0.12, power=0.55),
             lens_t(0.06), csec, n=23, tip_in=0.12)
    # Arms bracing each scythe to the hub.
    asec = blade_sec(n=5, r=1.15, seams=[seam("top", 0.0, 0.26, [(0.2, 0.8, 0.12, GLOW)])])
    for a, w in ((math.radians(30), 0.07), (math.radians(-30), 0.07)):
        c, s = math.cos(a), math.sin(a)
        blade(half, [P(0.3 * c - w * s, 0.3 * s + w * c, 0.04), P(0.7 * c - w * s, 0.7 * s + w * c, 0.02),
                     P(1.1 * c + 0.15 - w * s * 0.8, 1.1 * s - 0.05 + w * c * 0.8, 0.0)],
              [P(0.3 * c + w * s, 0.3 * s - w * c, 0.04), P(0.7 * c + w * s, 0.7 * s - w * c, 0.02),
               P(1.1 * c + 0.15 + w * s * 0.8, 1.1 * s - 0.05 - w * c * 0.8, 0.0)], 0.06, 0.04, asec, start="cap", end="cap")
    # Prongs either side of the prow.
    rsec = blade_sec(n=4, r=1.1, seams=[seam("top", -0.4, 0.25, [(0.1, 0.7, 0.12, GLOW)])])
    blade(half, E([(0.16, 0.5, 0.02), (0.22, 0.8, 0.015), (0.18, 1.2, 0.0)], 10),
          E([(0.08, 0.56, 0.03), (0.13, 0.84, 0.02), (0.18, 1.2, 0.0)], 10),
          taper(0.05, 0.8), taper(0.02, 1.0, 0.002), rsec, edge=tip_edge(0.6, 1.25))
    # Engines at the end of the spine.
    nacelle(half, 0.2, -1.4, -0.74, 0.12)
    symmetric(m, half)
    return m


def wraith_sockets():
    return {"corona_wraith_muzzle_0": (0.0, 0.02, 1.62), "corona_wraith_core": (0.0, 0.3, -0.02),
            "corona_wraith_engine_0": (-0.2, 0.0, -1.4), "corona_wraith_engine_1": (0.2, 0.0, -1.4)}


# ----------------------------------------------------------------------------- build and publish
BUILDERS = {
    "corona_interceptor": (build_interceptor, interceptor_sockets), "corona_fighter": (build_fighter, fighter_sockets),
    "corona_hunter": (build_hunter, hunter_sockets), "corona_carrier": (build_carrier, carrier_sockets),
    "corona_artillery": (build_artillery, artillery_sockets), "corona_drone": (build_drone, drone_sockets),
    "corona_turret": (build_turret, turret_sockets), "corona_wraith": (build_wraith, wraith_sockets),
}
# Footprints (glTF x, z) and heights: the earlier passes' (corona_craft.py RULES), each role's size in Umbra's fleet.
RULES = {
    "corona_interceptor": dict(budget=2500, foot=(0.8, 1.32), y_min=-0.1, y_max=0.14),
    "corona_fighter": dict(budget=2500, foot=(1.5, 1.64), y_min=-0.12, y_max=0.2),
    "corona_hunter": dict(budget=2500, foot=(1.1, 1.62), y_min=-0.14, y_max=0.22),
    "corona_carrier": dict(budget=3000, foot=(1.66, 1.98), y_min=-0.16, y_max=0.3),
    "corona_artillery": dict(budget=2500, foot=(1.42, 1.8), y_min=-0.16, y_max=0.3),
    "corona_drone": dict(budget=1000, foot=(0.54, 0.66), y_min=-0.07, y_max=0.09),
    "corona_turret": dict(budget=2500, foot=(1.1, 1.1), y_min_exact=-0.05, y_max=0.7),
    "corona_wraith": dict(budget=4500, foot=(3.1, 3.3), y_min=-0.2, y_max=0.5),
}
ORDER = list(BUILDERS)


def make_materials():
    return [vc.make_material("corona_plate", "vc", rough=0.45, metal=0.35),
            vc.make_material("corona_glow", "glow", colour=GLOW_HEX),
            vc.make_material("corona_glow_hot", "glow", colour=HOT_HEX)]


def build(names):
    mats = make_materials()
    objs, sockets = {}, {}
    for name in names:
        fn, sk = BUILDERS[name]
        m = fn(random.Random(f"{SEED}:{name}"))
        nf.finish(m)
        cols = uc.bake(m, name, ground=-0.05 if name == "corona_turret" else None)
        objs[name] = nf.make_object(name, m, mats, (0.0, 0.0, 0.0), cols)
        sockets[name] = sk()
        for sname, pos in sockets[name].items():
            nf.make_socket(sname, objs[name], pos)
        x0, x1, y0, y1, z0, z1 = m.bounds()
        print(f"CFLEET {name:20s} tris={m.tris():5d} size {x1 - x0:.2f} x {y1 - y0:.2f} (foot {RULES[name]['foot']}) "
              f"height {z0:+.3f}..{z1:+.3f}")
    return mats, objs, sockets


def previews(objs, out):
    import boss_remodel as br
    sc = bpy.context.scene
    names = [n for n in ORDER if n in objs]
    xs = {"corona_drone": (-3.2, -1.3), "corona_interceptor": (-2.0, -1.3), "corona_fighter": (-0.6, -1.3), "corona_hunter": (0.9, -1.3),
          "corona_turret": (2.3, -1.3), "corona_carrier": (-2.4, 1.3), "corona_artillery": (-0.6, 1.3), "corona_wraith": (2.0, 1.6)}
    for n in names:
        objs[n].location = (xs[n][0], xs[n][1], 0.0)
    me = bpy.data.meshes.new("fleet_ground")
    me.from_pydata([(-9, -9, -0.6), (9, -9, -0.6), (9, 9, -0.6), (-9, 9, -0.6)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("fleet_ground", me)
    sc.collection.objects.link(ground)
    ground.data.materials.append(br.material("fleet_ground", "#241c18", 0.9, 0))
    shown = [objs[n] for n in names] + [ground]
    for view in ("top", "game", "three_quarter"):
        print("CFLEET preview", br.render_view(sc, view, (0, 0.2, 0), 8.0, os.path.join(out, f"fleet-{view}.png"), res=1600, objects=shown))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="corona_fleet.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--only", default=None)
    ap.add_argument("--wip", action="store_true")
    args = ap.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    names = args.only.split(",") if args.only else ORDER
    mats, objs, sockets = build(names)
    if not (args.wip or args.only):
        spec_nodes = {}
        for name in names:
            r = dict(RULES[name])
            r["children"] = {k: tuple(v) for k, v in sockets[name].items()}
            spec_nodes[name] = r
        nf.publish(args.glb, "corona_fleet.py", dict(materials=list(MAT_NAMES), nodes=spec_nodes, max_bytes=2_500_000), "CFLEET")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        previews(objs, args.preview_dir)
    print("CFLEET DONE")


if __name__ == "__main__":
    main()
