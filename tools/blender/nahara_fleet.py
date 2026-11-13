"""Nahara's fleet (docs/39): the enemy craft of the Silent Empire, after the user's concept sheet (13 November 2026,
"NAHARA ENEMY FLEET": Skimmer, Relic Shield, Obelisk, Quarry Battery, Dune Hunter, Sunspike).

Built on the approved fleet toolkit (tools/blender/umbra_craft.py, as tools/blender/corona_fleet.py): hulls lofted from
smooth sections meeting at knife edges, glowing lines cut into the same surfaces as grooves, silhouettes ending in hard
points. Nahara's own identity, after the sheet: armour of weathered sandstone-bronze plates (light where it faces the sky,
worn pale on its edges), dark undersides, turquoise light in grooves, eyes and nozzles; forked prongs and spires. The
concept is a reference only: every shape is original and built here.

Nodes (public/assets/nahara/nahara-craft.glb; src/render/scene.ts NAHARA_CRAFT maps the game's kinds onto them):
    nahara_skimmer    skimmer             the fast splitter: a lance between two forward prongs, an engine on each
    nahara_hunter     dart, needle, weaver the Dune Hunter: an arrow body, swept wings, twin cannons, twin engines
    nahara_obelisk    pulsar              the lane controller: a four-sided spire laid toward the player, a lit rune
                                          down its back, four fins splayed at its base
    nahara_sunspike   wraith              the elite heavy (Nahara's Wraith; no diamond flies here): a broad armoured body, a great central spike between two
                                          prongs, engine pods, a crest of swept fins
    nahara_relic      relic               the armoured defender: a domed core ringed with a turquoise band, six heavy
                                          shield plates standing round it, an eye on its crown
    nahara_battery    turret, missile     the Quarry Battery (ground; base pivot, lowest point -0.05): a chamfered
                                          stone plinth with a lit band, a cowled rack of three launch tubes
    nahara_drone      boss pods           a small stone dart with a turquoise eye
Frame (as umbra_craft.py): design x right, y forward (the nose, toward the player), z up; glTF +Y up, noses +Z. Air craft
pivot at their mid-plane. Sockets: <node>_engine_N (the game's plumes), <node>_muzzle_N, <node>_core.

Materials (src/render/models.ts craftFromScene classes them by name; COLOR_0 carries the colour):
    nahara_stone      the armour: sandstone-bronze, lighter on top, pale worn edges, turquoise bounce by the glows
    nahara_glow       turquoise lines (emissive)
    nahara_glow_hot   pale turquoise cores and nozzles (emissive)

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python '\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\tools\\blender\\nahara_fleet.py' -- \\
        --glb '\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\public\\assets\\nahara\\nahara-craft.glb' \\
        [--preview-dir '\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\lookdev\\nahara\\fleet'] [--only nahara_skimmer] [--wip]
"""
import argparse, math, os, random, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

import umbra_craft as uc  # noqa: E402
from umbra_craft import (P, E, Mesh, append, blade, blade_sec, body_sec, eye, hull, revolve, seam, surface_z,  # noqa: E402
                         symmetric, taper, tip_edge, tube)
import khepri_kit as kit  # noqa: E402
import nacre_fleet as nf  # noqa: E402
import vesper_common as vc  # noqa: E402

SEED = "nahara-fleet-v1"
OBS, GLOW, HOT = uc.OBS, uc.GLOW, uc.HOT
MAT_NAMES = ("nahara_stone", "nahara_glow", "nahara_glow_hot")
GLOW_HEX, HOT_HEX = "#2fe0cc", "#c4fff4"
TAU = 2.0 * math.pi

# The bake's palette (umbra_craft.bake reads uc.C): sandstone-bronze armour, dark below and sand-light where it faces up,
# worn pale edges, turquoise next to every glow.
def palette(**v):
    return {k: kit.hex_linear(c) for k, c in dict(v, glow=GLOW_HEX, hot=HOT_HEX).items()}


# The bake's palettes (umbra_craft.bake reads uc.C): the armour plates in weathered sandstone-bronze (sand-light where they
# face up, worn pale on their edges), the frames under them in dark gunmetal; turquoise next to every glow.
# (13 November: a deeper bronze than the terrain's sand, so a craft over the tablelands still stands out.)
STONE_C = palette(deep="#45301a", lit="#ad8450", edge="#d8b47a", edge_hi="#f2dcae", bounce="#2fd6c4")
FRAME_C = palette(deep="#0e0c0b", lit="#3b342d", edge="#6c5c4a", edge_hi="#a08a6c", bounce="#2fd6c4")
uc.C = STONE_C


def plate(m, rng, at, size, yaw=0.0, pitch=0.0, roll=0.0, ch=0.018):
    """A chamfered armour plate (a flat-faced stone slab) centred at `at`, turned by yaw (about z), pitch (about x) and
    roll (about y), in degrees."""
    s = Mesh(rng)
    s.box((0.0, 0.0, 0.0), size, ch, None, mat=OBS, bottom=True)
    mtx = (Matrix.Translation(at) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Rotation(math.radians(pitch), 4, "X")
           @ Matrix.Rotation(math.radians(roll), 4, "Y"))
    append(m, s, mtx)


def shaped(m, rng, poly, thick, at=(0.0, 0.0, 0.0), yaw=0.0, pitch=0.0, ch=0.016):
    """A shaped armour plate: outline `poly` (x, y) in the plate's own plane, `thick` deep, its top edge chamfered (the
    worn pale lip), centred on `at` and turned by yaw (about z) and pitch (about x), in degrees."""
    s = Mesh(rng)
    s.prism(poly, -thick / 2, thick / 2, ch, None, mat=OBS, bottom=True)
    append(m, s, Matrix.Translation(at) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Rotation(math.radians(pitch), 4, "X"))


def arrow(w, l, shoulder=0.1):
    """A plate outline pointing forward (+y): a straight back, flanks, a point."""
    return [(-w / 2, -l / 2), (w / 2, -l / 2), (w / 2, l * shoulder), (0.0, l / 2), (-w / 2, l * shoulder)]


def taper_poly(w, l, front=0.4):
    """A plate outline narrowing toward the front (+y)."""
    return [(-w / 2, -l / 2), (w / 2, -l / 2), (w * front / 2, l / 2), (-w * front / 2, l / 2)]


def mirrored_plate(m, rng, at, size, yaw=0.0, pitch=0.0, roll=0.0, ch=0.018):
    plate(m, rng, at, size, yaw, pitch, roll, ch)
    plate(m, rng, (-at[0], at[1], at[2]), size, -yaw, pitch, -roll, ch)


def nacelle(m, x, y0, y1, r, z=0.0, glow_line=True):
    """An engine pod along y at x: a rounded armoured pod, a turquoise nozzle at its tail, a lit line on top."""
    seams = [seam("top", 0.0, 0.16, [(0.3, 0.85, 0.12, GLOW)])] if glow_line else []
    seams.append(seam("bot", 0.0, 0.9, [(0.0, 0.1, 0.04, HOT)]))
    sec = body_sec(n=6, r=1.05, k=0.9, seams=seams)
    st = [(y0, r * 0.82, r * 0.8, r * 0.8, z), (y0 + (y1 - y0) * 0.18, r, r * 0.95, r * 0.9, z),
          (y0 + (y1 - y0) * 0.7, r * 0.95, r * 0.9, r * 0.85, z), (y1, r * 0.5, r * 0.5, r * 0.45, z)]
    hull(m, st, sec, nose=P(x, y1 + r * 0.3, z), tail=None, x=x, edge=lambda t: 0.7)


def barrel(m, x, y0, y1, r, z):
    """A cannon along y: a tapered tube, a lit line along its crest, a pale turquoise muzzle."""
    sec = blade_sec(n=5, r=1.0, k=0.9, seams=[seam("top", 0.0, 0.3, [(0.1, 0.8, 0.1, GLOW)]),
                                              seam("top", 0.0, 0.9, [(0.86, 1.0, 0.02, HOT)])])
    tube(m, [P(x, y0, z), P(x, (y0 + y1) / 2, z), P(x, y1, z)], [r, r * 0.85, r * 0.7], [r, r * 0.85, r * 0.7],
         [r * 0.8, r * 0.7, r * 0.6], sec, cap0=True, cap1=True, edge=lambda t: 0.6 + 0.4 * t)


def slab(rng, cx, cy, cz, sx, sy, sz, ch=0.02):
    """A chamfered stone slab (flat-faced: weathered block faces under the knife-edged hulls)."""
    s = Mesh(rng)
    s.box((cx, cy, cz), (sx, sy, sz), ch, None, mat=OBS, bottom=True)
    return s


def fin_x(rng):
    """A swept fin in the z = 0 plane reaching out toward +x and back, a lit groove along it (rotated into place)."""
    f = Mesh(rng)
    fsec = blade_sec(n=5, r=1.2, ridge=0.2, seams=[seam("top", 0.1, 0.3, [(0.15, 0.8, 0.12, GLOW)])])
    blade(f, E([(0.1, -0.2, 0.0), (0.3, -0.36, 0.0), (0.5, -0.66, 0.0)], 10),
          E([(0.08, -0.52, 0.0), (0.28, -0.6, 0.0), (0.5, -0.66, 0.0)], 10),
          taper(0.05, 0.8), taper(0.03, 1.0, 0.002), fsec, start="cap", end="apex", edge=tip_edge(0.55, 1.3))
    return f


# ----------------------------------------------------------------------------- mechanical parts (second pass)
# User, 13 November: "more detailing and more mechanical like the pillars": armour of rounded stone blocks with pale worn
# edges (the ruin kit's own construction, tools/blender/nahara_kit.py rblock), over dark frames carrying the machinery:
# hinges, pistons, vents, lit slits.

def rprism(m, poly, z0, z1, r, mat=OBS, edge=1.0):
    """A rounded block: outline `poly` (x, y) from z0 to z1, every edge cut back by about r (an inset loop at top and foot),
    its rims marked as worn edges (the bake lightens them)."""
    if kit.poly_area(poly) < 0:
        poly = list(reversed(poly))
    r = min(r, (z1 - z0) * 0.45)
    inner = kit.inset_poly(poly, [r * 0.8] * len(poly))
    n = len(poly)
    cen = (sum(p[0] for p in poly) / n, sum(p[1] for p in poly) / n, (z0 + z1) / 2)
    loops = [[m.v((x, y, z0), 0.0) for x, y in inner], [m.v((x, y, z0 + r), edge * 0.6) for x, y in poly],
             [m.v((x, y, z1 - r), edge) for x, y in poly], [m.v((x, y, z1), edge * 0.35) for x, y in inner]]
    for lo, hi in zip(loops, loops[1:]):
        for k in range(n):
            j = (k + 1) % n
            m.face((lo[k], lo[j], hi[j], hi[k]), None, "main", mat, cen)
    m.face(loops[0], None, "main", mat, cen)
    m.face(loops[-1], None, "main", mat, cen)


GLYPHS = (
    # A step fret, a stepped pyramid, a cross in a frame: carved into the plates (the concept's engravings).
    ((0, 0, 1, .16), (.84, 0, 1, .72), (.3, .56, 1, .72), (.3, .28, .46, .72)),
    ((0, 0, 1, .16), (.14, .16, .86, .32), (.28, .32, .72, .48), (.42, .48, .58, .78)),
    ((0, 0, 1, .14), (0, .86, 1, 1), (0, 0, .14, 1), (.86, 0, 1, 1), (.43, .25, .57, .75), (.25, .43, .75, .57)),
)


def glyph(m, rng, at, size, kind=0, yaw=0.0, pitch=0.0, mat=OBS):
    """A carved glyph `size` across, lying in the plane of its frame (turned by yaw about z, pitch about x, degrees):
    thin raised strokes, dark when cut into the frame mesh, turquoise with mat GLOW."""
    s = Mesh(rng)
    for x0, y0, x1, y1 in GLYPHS[kind]:
        s.box(((x0 + x1) / 2 * size - size / 2, (y0 + y1) / 2 * size - size / 2, .003), ((x1 - x0) * size, (y1 - y0) * size, .012),
              .0, None, mat=mat, bottom=False)
    place(m, s, at, yaw, pitch)


def rect(w, l):
    return [(-w / 2, -l / 2), (w / 2, -l / 2), (w / 2, l / 2), (-w / 2, l / 2)]


def place(m, part, at=(0.0, 0.0, 0.0), yaw=0.0, pitch=0.0, roll=0.0):
    append(m, part, Matrix.Translation(at) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Rotation(math.radians(pitch), 4, "X")
           @ Matrix.Rotation(math.radians(roll), 4, "Y"))


def block(m, rng, poly, thick, at=(0.0, 0.0, 0.0), yaw=0.0, pitch=0.0, roll=0.0, r=0.018, mat=OBS):
    """A rounded stone block of outline `poly`, `thick` deep, centred on `at`, turned (degrees)."""
    s = Mesh(rng)
    rprism(s, poly, -thick / 2, thick / 2, r, mat)
    place(m, s, at, yaw, pitch, roll)


def slit(m, rng, at, w, l, yaw=0.0, pitch=0.0, h=0.012):
    """A lit slit: a thin turquoise bar sunk into a surface."""
    s = Mesh(rng)
    s.box((0.0, 0.0, 0.0), (w, l, h), min(w, l) * 0.2, None, mat=GLOW, bottom=True)
    place(m, s, at, yaw, pitch)


def vent(m, f, rng, at, w, l, slats=3, yaw=0.0, pitch=0.0):
    """A vent: a dark recess with stone slats across it, lit faintly at the back."""
    s, d = Mesh(rng), Mesh(rng)
    d.box((0.0, 0.0, -0.006), (w, l, 0.02), 0.004, None, mat=OBS, bottom=True)
    s.box((0.0, 0.0, -0.012), (w * 0.8, l * 0.8, 0.008), 0.002, None, mat=GLOW, bottom=True)
    for k in range(slats):
        y = -l / 2 + l * (k + 0.5) / slats
        s.box((0.0, y, 0.006), (w * 0.94, l / slats * 0.42, 0.014), 0.003, None, mat=OBS, bottom=True)
    place(f, d, at, yaw, pitch)
    place(m, s, at, yaw, pitch)


def rod(f, a, b, r, collars=True):
    """A piston or strut between points a and b: a dark rod, a thicker cylinder over its first half, collars at the ends."""
    a, b = P(*a), P(*b)
    mid = a.lerp(b, 0.5)
    sec = body_sec(n=6, r=1.0, k=0.9)
    tube(f, [a, a.lerp(b, 0.25), mid], r * 1.5, r * 1.5, r * 1.5, sec, cap0=True, cap1=True, edge=lambda t: 0.5)
    tube(f, [mid, mid.lerp(b, 0.5), b], r, r, r, sec, cap0=False, cap1=True, edge=lambda t: 0.4)
    if collars:
        tube(f, [b.lerp(a, 0.06), b, b.lerp(a, -0.06)], r * 1.9, r * 1.9, r * 1.9, sec, cap0=True, cap1=True, edge=lambda t: 0.6)


def hinge(f, at, r, length, axis="x"):
    """A hinge drum along x (or y): a dark cylinder with collared ends."""
    x, y, z = at
    d = P(length / 2, 0.0, 0.0) if axis == "x" else P(0.0, length / 2, 0.0)
    c = P(x, y, z)
    sec = body_sec(n=8, r=1.0, k=0.95)
    up = (0.0, 0.0, 1.0)
    tube(f, [c - d, c, c + d], r, r, r, sec, up=up, cap0=True, cap1=True, edge=lambda t: 0.5)
    for s in (-1, 1):
        e = c + d * s
        tube(f, [e - d * 0.12, e, e + d * 0.04], r * 1.35, r * 1.35, r * 1.35, sec, up=up, cap0=True, cap1=True, edge=lambda t: 0.7)


def engine(m, f, rng, x, y0, y1, r, z=0.0):
    """An engine: a dark pod, a stone collar block round its middle, a vent on top, a lit nozzle ring at its tail."""
    nacelle(f, x, y0, y1, r, z, glow_line=False)
    mid = y0 + (y1 - y0) * 0.45
    block(m, rng, [(-r * 1.25, -0.06), (r * 1.25, -0.06), (r * 1.1, 0.06), (-r * 1.1, 0.06)], r * 2.3, (x, mid, z), pitch=90, r=0.012)
    vent(m, f, rng, (x, y0 + (y1 - y0) * 0.75, z + r * 0.95), r * 1.0, (y1 - y0) * 0.22, slats=2)


# ----------------------------------------------------------------------------- nahara_skimmer (skimmer)
def build_skimmer(rng):
    m, f = Mesh(rng), Mesh(rng)
    # The spine: a dark keel, a turquoise line along its belly, a spike nose; three stacked stone blocks along its back
    # stepping down to the nose, lit slits between them.
    sec = body_sec(n=5, r=1.0, k=0.5, seams=[seam("bot", 0.0, 0.25, [(0.2, 0.9, 0.1, GLOW)])])
    hull(f, [(-0.48, 0.06, 0.04, 0.035), (-0.3, 0.09, 0.06, 0.045), (0.0, 0.09, 0.06, 0.045), (0.3, 0.06, 0.045, 0.03),
             (0.46, 0.035, 0.03, 0.02)], sec, nose=P(0.0, 0.78, 0.0), tail=P(0.0, -0.56, 0.0), edge=lambda t: 0.7)
    for y, w, l, z, th in ((-0.3, 0.17, 0.24, 0.07, 0.07), (-0.04, 0.14, 0.22, 0.065, 0.06), (0.2, 0.1, 0.2, 0.05, 0.05)):
        block(m, rng, [(-w / 2, -l / 2), (w / 2, -l / 2), (w * 0.38, l / 2), (-w * 0.38, l / 2)], th, (0.0, y, z), r=0.014)
    slit(m, rng, (0.0, -0.16, 0.08), 0.08, 0.018)
    slit(m, rng, (0.0, 0.08, 0.07), 0.06, 0.016)
    half, hf = Mesh(rng), Mesh(rng)
    # Each prong: a stone blade tip forward, and behind it a chain of three rounded blocks along the prong (its segmented
    # armour), braced to the keel by a dark piston and hinged at the root.
    psec = blade_sec(n=4, r=1.0, k=0.25, ridge=0.15, seams=[seam("top", 0.0, 0.2, [(0.25, 0.7, 0.12, GLOW)])])
    blade(half, E([(0.38, 0.18, 0.0), (0.39, 0.4, -0.005), (0.36, 0.66, -0.02)], 9),
          E([(0.3, 0.18, 0.0), (0.31, 0.4, -0.005), (0.36, 0.66, -0.02)], 9),
          taper(0.05, 0.6), taper(0.03, 1.0, 0.003), psec, start="cap", end="apex", edge=tip_edge(0.6, 1.35))
    for x, y, w, l, th, yaw in ((0.34, 0.06, 0.11, 0.18, 0.08, -3), (0.33, -0.14, 0.13, 0.18, 0.09, -8), (0.27, -0.33, 0.14, 0.17, 0.09, -32)):
        block(half, rng, [(-w / 2, -l / 2), (w / 2, -l / 2), (w * 0.4, l / 2), (-w * 0.4, l / 2)], th, (x, y, 0.0), yaw=yaw, r=0.016)
    slit(half, rng, (0.335, -0.04, 0.046), 0.05, 0.014, yaw=-5)
    rod(hf, (0.08, -0.06, -0.01), (0.3, -0.06, -0.02), 0.013)
    hinge(hf, (0.18, -0.42, 0.0), 0.03, 0.12)
    engine(half, hf, rng, 0.25, -0.62, -0.32, 0.06)
    symmetric(m, half)
    symmetric(f, hf)
    return m, f


def skimmer_sockets():
    return {"nahara_skimmer_muzzle_0": (0.0, 0.0, 0.8), "nahara_skimmer_core": (0.0, 0.1, 0.0),
            "nahara_skimmer_engine_0": (-0.25, 0.0, -0.62), "nahara_skimmer_engine_1": (0.25, 0.0, -0.62)}


# ----------------------------------------------------------------------------- nahara_hunter (dart, needle, weaver)
def build_hunter(rng):
    m, f = Mesh(rng), Mesh(rng)
    # The Dune Hunter: a dark fuselage, stone blocks stacked over it in two tiers, a lit cockpit slit between them.
    sec = body_sec(n=5, r=1.0, k=0.5, seams=[seam("bot", 0.0, 0.25, [(0.3, 0.9, 0.1, GLOW)])])
    hull(f, [(-0.54, 0.09, 0.05, 0.04), (-0.34, 0.13, 0.08, 0.06), (-0.1, 0.14, 0.09, 0.065), (0.12, 0.12, 0.08, 0.055),
             (0.3, 0.08, 0.055, 0.04), (0.44, 0.045, 0.035, 0.02)], sec, nose=P(0.0, 0.68, 0.0), tail=P(0.0, -0.62, 0.0),
         edge=lambda t: 0.7)
    block(m, rng, arrow(0.26, 0.36, 0.15), 0.07, (0.0, -0.3, 0.07), r=0.018)
    block(m, rng, arrow(0.17, 0.24, 0.1), 0.05, (0.0, -0.3, 0.125), r=0.014)
    glyph(f, rng, (0.0, -0.34, 0.151), 0.08, kind=2)
    block(m, rng, arrow(0.13, 0.3, -0.1), 0.06, (0.0, 0.3, 0.05), r=0.014)
    slit(m, rng, (0.0, 0.06, 0.075), 0.07, 0.07)
    half, hf = Mesh(rng), Mesh(rng)
    # Swept wings: a stone blade, a rounded block on its root, hinged to the fuselage on a dark drum, a lit groove along it.
    wsec = blade_sec(n=4, r=1.0, k=0.2, ridge=0.3, seams=[seam("top", -0.2, 0.12, [(0.1, 0.62, 0.1, GLOW)])])
    blade(half, E([(0.14, 0.14, 0.0), (0.3, 0.0, -0.005), (0.48, -0.16, -0.015), (0.64, -0.36, -0.03)], 13),
          E([(0.14, -0.36, 0.0), (0.3, -0.4, -0.005), (0.48, -0.39, -0.015), (0.64, -0.36, -0.03)], 13),
          lambda t: 0.045 * (1 - t) ** 0.7 + 0.006, lambda t: 0.024 * (1 - t) + 0.003, wsec, start="cap", end="apex",
          edge=tip_edge(0.55, 1.35))
    block(half, rng, [(0.16, 0.06), (0.34, -0.1), (0.34, -0.32), (0.16, -0.32)], 0.06, (0.0, 0.0, 0.03), r=0.014)
    hinge(hf, (0.15, -0.14, 0.0), 0.03, 0.3, axis="y")
    # Twin cannons: dark barrels in stone shrouds, the muzzles lit.
    barrel(hf, 0.12, 0.0, 0.6, 0.03, 0.0)
    block(half, rng, rect(0.08, 0.22), 0.07, (0.12, 0.2, 0.0), r=0.014)
    # Twin engines under stone collars, vents on top.
    engine(half, hf, rng, 0.2, -0.68, -0.26, 0.065)
    symmetric(m, half)
    symmetric(f, hf)
    return m, f


def hunter_sockets():
    return {"nahara_hunter_muzzle_0": (-0.12, 0.0, 0.6), "nahara_hunter_muzzle_1": (0.12, 0.0, 0.6),
            "nahara_hunter_core": (0.0, 0.1, 0.06),
            "nahara_hunter_engine_0": (-0.2, 0.0, -0.68), "nahara_hunter_engine_1": (0.2, 0.0, -0.68)}


# ----------------------------------------------------------------------------- nahara_obelisk (pulsar)
def build_obelisk(rng):
    m, f = Mesh(rng), Mesh(rng)
    # The spire, laid toward the player: courses of rounded stone blocks tapering to a point (the ruins' own pillars),
    # dark joint rings between them, a lit rune slit down the courses' backs.
    y = -0.44
    for k, (l, s) in enumerate(((0.2, 0.34), (0.2, 0.29), (0.18, 0.24), (0.16, 0.19), (0.14, 0.15))):
        block(m, rng, rect(s, s), l, (0.0, y + l / 2, 0.0), pitch=90, r=0.022)
        slit(m, rng, (0.0, y + l / 2, s / 2 + 0.002), 0.03, l * 0.6)
        if k:
            hull(f, [(y - 0.02, s * 0.44, s * 0.44, s * 0.44), (y + 0.02, s * 0.44, s * 0.44, s * 0.44)], body_sec(n=8, r=1.0, k=0.95),
                 nose=None, tail=None)
        y += l + 0.012
    tip = body_sec(n=4, r=1.0, k=0.2, seams=[seam("top", 0.0, 0.18, [(0.0, 0.6, 0.1, GLOW)])])
    hull(m, [(y, 0.07, 0.07, 0.07), (y + 0.12, 0.05, 0.05, 0.05)], tip, nose=P(0.0, y + 0.36, 0.0), tail=None, edge=lambda t: 0.9)
    eye(m, P(0.0, -0.2, 0.17), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.08, 0.07, 0.025, 0.02, 0.016, hot_frac=0.6, seg=14)
    # The base: a dark mechanical socket, four fins in an X on hinged pistons.
    hull(f, [(-0.66, 0.1, 0.1, 0.1), (-0.56, 0.15, 0.15, 0.15), (-0.46, 0.15, 0.15, 0.15)], body_sec(n=8, r=1.0, k=0.95,
         seams=[seam("bot", 0.0, 0.9, [(0.0, 0.3, 0.05, HOT)])]), nose=None, tail=None)
    fin = fin_x(rng)
    piston = Mesh(rng)
    rod(piston, (0.08, -0.36, 0.0), (0.3, -0.5, 0.0), 0.014)
    for a in (35.0, 145.0, 215.0, 325.0):
        append(m, fin, Matrix.Rotation(math.radians(a), 4, "Y"))
        append(f, piston, Matrix.Rotation(math.radians(a), 4, "Y"))
    return m, f


def obelisk_sockets():
    return {"nahara_obelisk_muzzle_0": (0.0, 0.0, 0.92), "nahara_obelisk_core": (0.0, 0.17, -0.2),
            "nahara_obelisk_engine_0": (0.0, 0.0, -0.66)}


# ----------------------------------------------------------------------------- nahara_sunspike (wraith)
def build_sunspike(rng):
    m, f = Mesh(rng), Mesh(rng)
    # The elite heavy: a broad dark body carrying three tiers of rounded stone plates, a great central spike of stacked
    # blocks, a lit eye between the tiers.
    sec = body_sec(n=6, r=1.0, k=0.6, seams=[seam("top", 0.5, 0.07, [(0.25, 0.75, 0.12, GLOW)]),
                                             seam("top", -0.5, 0.07, [(0.25, 0.75, 0.12, GLOW)])])
    hull(f, [(-0.84, 0.2, 0.09, 0.06), (-0.62, 0.34, 0.14, 0.08), (-0.32, 0.38, 0.17, 0.1), (0.0, 0.36, 0.17, 0.1),
             (0.3, 0.28, 0.13, 0.08), (0.5, 0.16, 0.09, 0.06)], sec, nose=None, tail=P(0.0, -0.94, 0.0), edge=lambda t: 0.7)
    for y, w, l, z, th in ((-0.64, 0.46, 0.3, 0.15, 0.08), (-0.36, 0.64, 0.34, 0.19, 0.09), (0.0, 0.56, 0.32, 0.19, 0.09),
                           (0.28, 0.36, 0.26, 0.15, 0.08)):
        block(m, rng, arrow(w, l, 0.05), th, (0.0, y, z), r=0.022)
    block(m, rng, arrow(0.3, 0.24, 0.05), 0.06, (0.0, -0.4, 0.26), r=0.016)
    for x in (-0.2, 0.2):
        glyph(f, rng, (x, -0.06, 0.236), 0.13, kind=0, yaw=0 if x < 0 else 180)
        glyph(f, rng, (x * 0.85, -0.66, 0.192), 0.11, kind=1)
    glyph(m, rng, (0.0, 0.3, 0.193), 0.1, kind=2, mat=GLOW)
    eye(m, P(0.0, -0.18, 0.245), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.1, 0.07, 0.03, 0.024, 0.02, hot_frac=0.55, seg=16)
    for y, s, l in ((0.5, 0.16, 0.16), (0.66, 0.12, 0.14), (0.8, 0.09, 0.12)):
        block(m, rng, rect(s, s * 0.8), l, (0.0, y, 0.0), pitch=90, r=0.016)
    hull(m, [(0.88, 0.05, 0.04, 0.03), (0.94, 0.04, 0.03, 0.025)], body_sec(n=4, r=1.0, k=0.2, seams=[seam("top", 0.0, 0.2, [(0.0, 0.8, 0.15, GLOW)])]),
         nose=P(0.0, 1.14, 0.0), tail=None, edge=lambda t: 0.9)
    half, hf = Mesh(rng), Mesh(rng)
    # Forward prongs on dark hinged arms, braced by pistons; flank vents; engine pods.
    psec = blade_sec(n=4, r=1.0, k=0.25, ridge=0.15, seams=[seam("top", 0.0, 0.2, [(0.2, 0.7, 0.12, GLOW)])])
    blade(half, E([(0.42, 0.1, 0.0), (0.44, 0.4, -0.01), (0.38, 0.86, -0.02)], 10),
          E([(0.28, 0.2, 0.01), (0.31, 0.48, 0.0), (0.38, 0.86, -0.02)], 10),
          taper(0.064, 0.6), taper(0.035, 1.0, 0.003), psec, start="cap", end="apex", edge=tip_edge(0.6, 1.35))
    block(half, rng, [(0.26, 0.0), (0.46, -0.02), (0.44, 0.2), (0.3, 0.24)], 0.09, (0.0, 0.0, 0.0), r=0.018)
    hinge(hf, (0.36, -0.06, -0.02), 0.035, 0.24)
    rod(hf, (0.14, 0.3, -0.02), (0.32, 0.16, -0.02), 0.014)
    vent(half, hf, rng, (0.26, -0.18, 0.15), 0.1, 0.16, slats=3, yaw=-8)
    engine(half, hf, rng, 0.46, -0.9, -0.3, 0.1)
    symmetric(m, half)
    symmetric(f, hf)
    return m, f


def sunspike_sockets():
    return {"nahara_sunspike_muzzle_0": (0.0, 0.0, 1.14), "nahara_sunspike_core": (0.0, 0.26, -0.18),
            "nahara_sunspike_engine_0": (-0.46, 0.0, -0.9), "nahara_sunspike_engine_1": (0.46, 0.0, -0.9)}


# ----------------------------------------------------------------------------- nahara_relic (relic)
RELIC_BAND = (1, 2, 3)


def build_relic(rng):
    m, f = Mesh(rng), Mesh(rng)
    # The core: a dark drum, a broad turquoise band round its waist (the shield that shows between the plates).
    prof = [(0.32, -0.15), (0.38, -0.1), (0.39, -0.05), (0.39, 0.03), (0.39, 0.1), (0.34, 0.15), (0.2, 0.18), (0.0, 0.19)]
    revolve(f, prof, 18, start=P(0.0, 0.0, -0.16))
    # The band as the concept's honeycomb: two staggered rows of turquoise cells in the dark drum.
    for row in range(3):
        for i in range(20):
            a = (i + 0.5 * (row % 2)) / 20 * TAU
            cell = Mesh(rng)
            cell.box((0.0, 0.0, 0.0), (0.095, 0.014, 0.042), 0.0, None, mat=GLOW, bottom=False)
            append(f, cell, Matrix.Translation((math.cos(a) * 0.392, math.sin(a) * 0.392, -0.06 + row * 0.052)) @ Matrix.Rotation(a - math.pi / 2, 4, "Z"))
    # The crown: a stack of rounded blocks round a lit eye, dark vents between.
    rprism(m, [(math.cos(a) * 0.2, math.sin(a) * 0.2) for a in (k * math.pi / 3 + math.pi / 6 for k in range(6))], 0.15, 0.23, 0.02)
    eye(m, P(0.0, 0.0, 0.235), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.08, 0.08, 0.03, 0.022, 0.02, hot_frac=0.6, seg=16)
    # Six great shield plates round it: each a rounded stone slab with a carved inset and a capstone, leaning out on a
    # dark hinge at its foot and held by a piston from the core (the armour that opens to fire).
    for k in range(6):
        a = math.radians(30 + 60 * k)
        s, sf = Mesh(rng), Mesh(rng)
        rprism(s, rect(0.38, 0.12), -0.16, 0.26, 0.03)
        block(s, rng, rect(0.24, 0.05), 0.24, (0.0, 0.07, 0.04), pitch=0, r=0.012)
        block(s, rng, rect(0.3, 0.16), 0.06, (0.0, -0.01, 0.29), r=0.02)
        slit(s, rng, (0.0, 0.097, 0.04), 0.03, 0.012, pitch=90, h=0.16)
        glyph(sf, rng, (0.0, 0.096, 0.16), 0.13, kind=k % 3, pitch=90)
        hinge(sf, (0.0, -0.04, -0.14), 0.028, 0.3)
        rod(sf, (0.0, -0.3, 0.02), (0.0, -0.06, 0.12), 0.013, collars=False)
        mtx = Matrix.Rotation(a - math.pi / 2, 4, "Z") @ Matrix.Translation((0.0, 0.5, 0.0)) @ Matrix.Rotation(math.radians(-10), 4, "X")
        append(m, s, mtx)
        append(f, sf, mtx)
    return m, f


def relic_sockets():
    return {"nahara_relic_muzzle_0": (0.0, 0.05, 0.55), "nahara_relic_core": (0.0, 0.26, 0.0)}


# ----------------------------------------------------------------------------- nahara_battery (turret, missile)
BATTERY_HEAD_Z = 0.3


def build_battery(rng):
    m, f = Mesh(rng), Mesh(rng)
    octagon = lambda r: [(math.cos(math.pi / 8 + k * math.pi / 4) * r, math.sin(math.pi / 8 + k * math.pi / 4) * r) for k in range(8)]
    # The plinth: two courses of rounded octagonal stone, lit vents round the lower one, a dark turntable ring on top.
    rprism(m, octagon(0.5), -0.05, 0.12, 0.03)
    rprism(m, octagon(0.4), 0.12, 0.2, 0.025)
    for x in (-0.22, 0.22):
        glyph(f, rng, (x, -0.3, 0.201), 0.12, kind=0, yaw=0 if x < 0 else 180)
    for k in range(4):
        a = k * 90.0
        c, s = math.cos(math.radians(a + 90)), math.sin(math.radians(a + 90))
        vent(m, f, rng, (c * 0.468, s * 0.468, 0.035), 0.16, 0.06, slats=2, yaw=a, pitch=90)
    revolve(f, [(0.22, 0.2), (0.22, 0.24), (0.19, 0.26)], 16, start=P(0.0, 0.0, 0.2), end=P(0.0, 0.0, 0.26))
    # The launcher: a stone housing over three dark tubes raised toward the player, their mouths lit; elevation pistons
    # behind; side cheek blocks.
    pitch = 26
    housing = Mesh(rng)
    rprism(housing, rect(0.46, 0.44), -0.1, 0.1, 0.028)
    for x in (-0.14, 0.0, 0.14):
        # Each launch tube's mouth on the housing's front: a dark socket, its missile's lit head inside.
        mouth = Mesh(rng)
        mouth.box((0.0, 0.0, 0.0), (0.1, 0.03, 0.1), 0.02, None, mat=OBS, bottom=True)
        append(f, mouth, Matrix.Translation((0.0, 0.06, BATTERY_HEAD_Z + 0.08)) @ Matrix.Rotation(math.radians(pitch), 4, "X")
               @ Matrix.Translation((x, 0.222, 0.0)))
        slit(housing, rng, (x, 0.0, 0.103), 0.022, 0.3)
    place(m, housing, (0.0, 0.06, BATTERY_HEAD_Z + 0.08), pitch=pitch)
    for x in (-0.14, 0.0, 0.14):
        glow = Mesh(rng)
        glow.box((0.0, 0.0, 0.0), (0.06, 0.02, 0.06), 0.012, None, mat=HOT, bottom=True)
        append(m, glow, Matrix.Translation((0.0, 0.06, BATTERY_HEAD_Z + 0.08)) @ Matrix.Rotation(math.radians(pitch), 4, "X")
               @ Matrix.Translation((x, 0.235, 0.0)))
    for x in (-0.27, 0.27):
        block(m, rng, [(-0.04, -0.2), (0.04, -0.2), (0.04, 0.12), (-0.04, 0.2)], 0.24, (x, -0.04, BATTERY_HEAD_Z + 0.02), roll=90, r=0.016)
        rod(f, (x * 0.6, -0.26, 0.24), (x * 0.6, -0.12, BATTERY_HEAD_Z + 0.05), 0.016)
    return m, f


def battery_sockets():
    return {"nahara_battery_muzzle_0": (0.0, BATTERY_HEAD_Z + 0.18, 0.28), "nahara_battery_core": (0.0, BATTERY_HEAD_Z, 0.0)}


# ----------------------------------------------------------------------------- nahara_drone (boss pods, fallback)
def build_drone(rng):
    m, f = Mesh(rng), Mesh(rng)
    hull(f, [(-0.24, 0.06, 0.04, 0.03), (-0.04, 0.08, 0.05, 0.035), (0.14, 0.05, 0.035, 0.025)], body_sec(n=5, r=1.0, k=0.5),
         nose=P(0.0, 0.32, 0.0), tail=P(0.0, -0.3, 0.0), edge=lambda t: 0.7)
    block(m, rng, arrow(0.16, 0.26, 0.1), 0.06, (0.0, -0.06, 0.04), r=0.014)
    eye(m, P(0.0, -0.04, 0.075), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.04, 0.035, 0.016, 0.012, 0.01, hot_frac=0.6, seg=10)
    half = Mesh(rng)
    blade(half, E([(0.08, 0.0, 0.0), (0.18, -0.1, -0.005), (0.26, -0.22, -0.01)], 7),
          E([(0.07, -0.18, 0.0), (0.16, -0.22, -0.005), (0.26, -0.22, -0.01)], 7),
          taper(0.03, 0.8), taper(0.015, 1.0, 0.002), blade_sec(n=4), start="cap", end="apex", edge=tip_edge(0.6, 1.3))
    symmetric(m, half)
    return m, f


def drone_sockets():
    return {"nahara_drone_core": (0.0, 0.075, -0.04), "nahara_drone_engine_0": (0.0, 0.0, -0.3)}


# ----------------------------------------------------------------------------- build and publish
BUILDERS = {
    "nahara_skimmer": (build_skimmer, skimmer_sockets), "nahara_hunter": (build_hunter, hunter_sockets),
    "nahara_obelisk": (build_obelisk, obelisk_sockets), "nahara_sunspike": (build_sunspike, sunspike_sockets),
    "nahara_relic": (build_relic, relic_sockets), "nahara_battery": (build_battery, battery_sockets),
    "nahara_drone": (build_drone, drone_sockets),
}
# Footprints (glTF x, z, measured about the origin) and heights, each role's size in the Corona and Umbra fleets; the
# Skimmer's, the Obelisk's and the Sunspike's points reach further forward.
RULES = {
    "nahara_skimmer": dict(budget=2500, foot=(0.9, 1.6), y_min=-0.1, y_max=0.14),
    "nahara_hunter": dict(budget=2500, foot=(1.3, 1.36), y_min=-0.12, y_max=0.18),
    "nahara_obelisk": dict(budget=3000, foot=(1.1, 1.8), y_min=-0.4, y_max=0.4),
    "nahara_sunspike": dict(budget=4500, foot=(1.3, 2.3), y_min=-0.16, y_max=0.3),
    "nahara_relic": dict(budget=5000, foot=(1.4, 1.4), y_min=-0.2, y_max=0.36),
    "nahara_battery": dict(budget=2500, foot=(1.1, 1.1), y_min_exact=-0.05, y_max=0.7),
    "nahara_drone": dict(budget=1000, foot=(0.54, 0.66), y_min=-0.07, y_max=0.1),
}
ORDER = list(BUILDERS)


def make_materials():
    return [vc.make_material("nahara_stone", "vc", rough=0.62, metal=0.12),
            vc.make_material("nahara_glow", "glow", colour=GLOW_HEX),
            vc.make_material("nahara_glow_hot", "glow", colour=HOT_HEX)]


def weather(m, cols):
    """Mottles the stone: each corner's colour scaled by a smooth noise of its position (blotches about a fifth of a unit
    across), so the blocks read as weathered sandstone, never one flat paint. Glow faces stay as they are."""
    def hashf(i, j, k):
        n = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791)
        n = (n ^ (n >> 13)) * 1274126177 & 0xffffffff
        return (n & 0xffff) / 65535.0

    def noise(x, y, z):
        i, j, k = math.floor(x), math.floor(y), math.floor(z)
        fx, fy, fz = x - i, y - j, z - k
        sx, sy, sz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
        lerp = lambda a, b, t: a + (b - a) * t
        c = [[[hashf(i + a, j + b, k + d) for d in (0, 1)] for b in (0, 1)] for a in (0, 1)]
        return lerp(lerp(lerp(c[0][0][0], c[0][0][1], sz), lerp(c[0][1][0], c[0][1][1], sz), sy),
                    lerp(lerp(c[1][0][0], c[1][0][1], sz), lerp(c[1][1][0], c[1][1][1], sz), sy), sx)

    out, n = [], 0
    for fi, face in enumerate(m.faces):
        for i in face:
            r, g, b, a = cols[n]
            n += 1
            if m.fmat[fi] != OBS:
                out.append((r, g, b, a))
                continue
            x, y, z = m.verts[i]
            w = 0.74 + 0.42 * noise(x * 5.0, y * 5.0, z * 5.0) + 0.14 * (noise(x * 17.0 + 3.1, y * 17.0, z * 17.0) - 0.5)
            out.append((r * w, g * w * 0.99, b * w * 0.97, a))
    return out


def build(names):
    mats = make_materials()
    objs, sockets = {}, {}
    for name in names:
        fn, sk = BUILDERS[name]
        m, f = fn(random.Random(f"{SEED}:{name}"))
        ground = -0.05 if name == "nahara_battery" else None
        # Two bakes, one per palette (each part's AO from its own part), joined into one mesh.
        nf.finish(m)
        uc.C = STONE_C
        cols = weather(m, uc.bake(m, name, ground=ground))
        if f.faces:
            nf.finish(f)
            uc.C = FRAME_C
            cols += uc.bake(f, name, ground=ground)
            append(m, f)
        uc.C = STONE_C
        objs[name] = nf.make_object(name, m, mats, (0.0, 0.0, 0.0), cols)
        sockets[name] = sk()
        for sname, pos in sockets[name].items():
            nf.make_socket(sname, objs[name], pos)
        x0, x1, y0, y1, z0, z1 = m.bounds()
        print(f"NFLEET {name:18s} tris={m.tris():5d} size {x1 - x0:.2f} x {y1 - y0:.2f} (foot {RULES[name]['foot']}) "
              f"height {z0:+.3f}..{z1:+.3f}")
    return mats, objs, sockets


def previews(objs, out):
    import boss_remodel as br
    sc = bpy.context.scene
    names = [n for n in ORDER if n in objs]
    xs = {"nahara_skimmer": (-2.4, -1.3), "nahara_hunter": (-0.8, -1.3), "nahara_drone": (0.5, -1.3), "nahara_battery": (1.9, -1.3),
          "nahara_obelisk": (-2.4, 1.2), "nahara_relic": (-0.6, 1.2), "nahara_sunspike": (1.6, 1.3)}
    for n in names:
        objs[n].location = (xs[n][0], xs[n][1], 0.0)
    me = bpy.data.meshes.new("fleet_ground")
    me.from_pydata([(-9, -9, -0.6), (9, -9, -0.6), (9, 9, -0.6), (-9, 9, -0.6)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("fleet_ground", me)
    sc.collection.objects.link(ground)
    ground.data.materials.append(br.material("fleet_ground", "#3a2e24", 0.9, 0))
    shown = [objs[n] for n in names] + [ground]
    for view in ("top", "game", "three_quarter"):
        print("NFLEET preview", br.render_view(sc, view, (0, 0.0, 0), 7.0, os.path.join(out, f"fleet-{view}.png"), res=1600, objects=shown))
    # Close-ups: each craft alone from the game camera and three-quarter.
    for n in names:
        x, y = xs[n]
        for view in ("game", "three_quarter"):
            br.render_view(sc, view, (x, y, 0), 2.6, os.path.join(out, f"close-{n}-{view}.png"), res=700, objects=[objs[n], ground])


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="nahara_fleet.py")
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
        nf.publish(args.glb, "nahara_fleet.py", dict(materials=list(MAT_NAMES), nodes=spec_nodes, max_bytes=2_500_000), "NFLEET")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        previews(objs, args.preview_dir)
    print("NFLEET DONE")


if __name__ == "__main__":
    main()
