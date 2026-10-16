"""Nacre (Luminous Mire) terrain kit for Last Worlds (docs/20, art/nacre-kit/README.md).

After the middle panel of art/concepts/01-worlds-direction.png (a reference only, never a runtime asset):
jagged black faceted rock with cold blue-lit tops and mossy, speckled feet; glowing cyan lotus caps (wide
ribbed translucent discs with a bright heart on trumpet stems); clusters of glassy tubes with flared mouths;
violet goblet flowers; teal lily-pad rafts; moss tufts with glowing speckles; and the ruins of the mire's
builders: stepped monolith towers with vertical orange light strips, a stepped fortress, ring platforms with
a glowing cyan inlay and central dais, elevated conduit bridges with lit panels, broken pillars and rubble.

Four materials. COLOR_0 carries the linear colour of every face, also for the glowing ones:
    nacre_rock  (roughness 0.9)  rock and moss
    nacre_flora (roughness 0.7)  non-glowing plant parts (lily pads)
    nacre_ruin  (roughness 0.6)  ruin stone
    nacre_glow  (emissive)       bioluminescent flora and ruin lights; the runtime emits each face's own
                                 COLOR_0 (glow weight = its brightest channel), so colour sets the glow.

Conventions: glTF +Y up, 1 unit = 1 game unit, front (camera-facing light strips) toward +Z, pivots at the
base centre. Pieces marked `top` are authored at their real size, baked, then scaled so their top is exactly
1.0 (the runtime scales y by the instance height; README lists each node's authored height). Deterministic.

    R=/home/davidfarina/Projects/alien-skies
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/nacre_kit.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/nacre/nacre-kit.glb)" --preview-dir "$(wslpath -w $R/art/nacre-kit)"
"""

import argparse
import math
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import khepri_kit as kit  # noqa: E402
import vesper_common as vc  # noqa: E402
from vesper_common import HS, merge_hs, xform  # noqa: E402

SEED = "nacre-kit-v1"
ROCK, FLORA, RUIN, GLOW = 0, 1, 2, 3
MAT_NAMES = ("nacre_rock", "nacre_flora", "nacre_ruin", "nacre_glow")
TAU = 2.0 * math.pi
SINK = -0.12

C = {k: kit.hex_linear(v) for k, v in dict(
    rock_dark="#1e2231", rock="#2c3245", rock_mid="#3b445b", rock_lit="#7486b0", rock_rim="#a2b8e8",
    moss="#18362f", moss_lit="#2e6650", moss_violet="#34285a", mud="#17142a",
    speck="#62f4e4", speck_violet="#b48aff",
    cap_core="#e8fffb", cap_inner="#34b8c6", cap_rib="#38b0c2", cap_valley="#11606e", cap_rim="#6cecee",
    stem_lo="#0b3a44", stem_hi="#24a8b6",
    tube_lo="#0a3a48", tube_mid="#1a8fa6", tube_mouth="#4ee6ea", tube_inner="#06303a",
    gob_stem="#2c1f52", gob_lo="#4a2f92", gob_hi="#8d62e8", gob_mouth="#d2adff", gob_inner="#f6e6ff",
    pad="#24604f", pad_rim="#4a9a7c", pad_vein="#174a3e", pad_bud="#86ffe6",
    stone_dark="#16181f", stone="#23262f", stone_lit="#343a48", edge="#555e74", recess="#08090d",
    orange="#ff8a2a", orange_dim="#c9561a", amber="#ffb455", cyan="#40f2ee", cyan_dim="#159aa4", panel="#4ea8ff",
).items()}


def mix(a, b, t):
    return kit.mix3(a, b, kit.clamp(t, 0.0, 1.0))


def mul(a, s):
    return kit.mul3(a, s)


# ----------------------------------------------------------------------------
# Geometry helpers (Blender space: x right, y away from the camera = glTF -Z, z up)
# ----------------------------------------------------------------------------

def hull(hs, pts, paint, mat=ROCK, tag="main"):
    """Convex hull of `pts` appended to hs (faceted, flat-shaded)."""
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bm.verts.ensure_lookup_table()
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:], use_existing_faces=False)
    junk = list(dict.fromkeys(g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)))
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    base = len(hs.verts)
    for v in bm.verts:
        hs.v((v.co.x, v.co.y, v.co.z))
    for f in bm.faces:
        hs.face(tuple(base + v.index for v in f.verts), paint, tag, mat, outward=tuple(f.normal))
    bm.free()


def blade(hs, rng, x, y, h, r, lean=(0.0, 0.0), sides=5, taper=0.22, squash=1.0, rot=None, paint="rock", tip=True, chip=0.18):
    """Faceted, irregular rock shard (convex hull of strongly jittered rings, flattened by `squash` across its
    `rot` axis so it reads as a broken slab), base below the ground, pointed or with a slanted broken top."""
    rot = rng.uniform(0.0, TAU) if rot is None else rot
    ca, sa = math.cos(rot), math.sin(rot)
    pts = []
    levels = (SINK, h * rng.uniform(0.22, 0.38), h * rng.uniform(0.55, 0.72), h * rng.uniform(0.82, 0.92))
    for k, z in enumerate(levels):
        t = max(0.0, z) / h
        rr = r * (1.0 - (1.0 - taper) * t ** 0.85)
        ox, oy = x + lean[0] * t * h, y + lean[1] * t * h
        for i in range(sides):
            a = (i + rng.uniform(-0.3, 0.3)) * TAU / sides
            u, v = math.cos(a) * rr * rng.uniform(0.7, 1.2), math.sin(a) * rr * squash * rng.uniform(0.7, 1.2)
            pts.append((ox + u * ca - v * sa, oy + u * sa + v * ca, z + (rng.uniform(-chip, chip) * h * 0.4 if k else 0.0)))
    if tip:
        pts.append((x + lean[0] * h + rng.uniform(-0.1, 0.1) * r, y + lean[1] * h + rng.uniform(-0.1, 0.1) * r, h))
    else:  # broken, slanted top
        a = rng.uniform(0.0, TAU)
        for i in range(3):
            b = a + i * TAU / 3
            pts.append((x + lean[0] * h + math.cos(b) * r * taper * 1.2, y + lean[1] * h + math.sin(b) * r * taper * 1.2 * squash,
                        h - (rng.uniform(0.08, 0.2) * h if i else 0.0)))
    hull(hs, pts, paint, ROCK)


def pinnacle(hs, rng, x, y, h, r, lean=(0.0, 0.0), chunks=4, squash=0.8, sharp=True, paint="rock"):
    """Jagged rock pinnacle built as a stack of fractured chunks (each an irregular convex hull), shrinking and
    wandering upward, so the silhouette has ledges, overhangs and a broken or pointed top like weathered black rock."""
    z = SINK
    rot = rng.uniform(0.0, TAU)
    ca, sa = math.cos(rot), math.sin(rot)
    step = (h - SINK) / chunks
    cx, cy = x, y
    for k in range(chunks):
        t = k / max(1, chunks - 1)
        rc = r * (1.0 - 0.45 * t) * rng.uniform(0.85, 1.12)
        hc = step * rng.uniform(1.05, 1.35)
        top = min(h, z + hc) if k < chunks - 1 else h
        cx += lean[0] * step + rng.uniform(-0.06, 0.06) * r
        cy += lean[1] * step + rng.uniform(-0.06, 0.06) * r
        pts = []
        for i in range(9):
            a = (i + rng.uniform(-0.35, 0.35)) * TAU / 9
            u, v = math.cos(a) * rc * rng.uniform(0.65, 1.15), math.sin(a) * rc * squash * rng.uniform(0.65, 1.15)
            zz = z + (top - z) * (0.0 if i % 3 == 0 else rng.uniform(0.05, 0.75))
            pts.append((cx + u * ca - v * sa, cy + u * sa + v * ca, zz))
        if k == chunks - 1 and sharp:
            pts.append((cx + rng.uniform(-0.1, 0.1) * rc, cy + rng.uniform(-0.1, 0.1) * rc, top))
            for i in range(2):
                a = rng.uniform(0.0, TAU)
                pts.append((cx + math.cos(a) * rc * 0.45, cy + math.sin(a) * rc * 0.45, top - (top - z) * rng.uniform(0.15, 0.4)))
        else:
            for i in range(3):
                a = rng.uniform(0.0, TAU)
                pts.append((cx + math.cos(a) * rc * rng.uniform(0.2, 0.7), cy + math.sin(a) * rc * rng.uniform(0.2, 0.7) * squash,
                            top - (top - z) * rng.uniform(0.0, 0.25)))
        hull(hs, pts, paint, ROCK)
        z = z + (top - z) * rng.uniform(0.62, 0.8)


def boulder(hs, rng, x, y, z, sx, sy, sz, paint="rock", n=11):
    pts = []
    for _ in range(n):
        a = rng.uniform(0.0, TAU)
        e = rng.uniform(-0.9, 1.0)
        c = math.sqrt(max(0.0, 1.0 - e * e))
        pts.append((x + math.cos(a) * c * sx * rng.uniform(0.85, 1.1), y + math.sin(a) * c * sy * rng.uniform(0.85, 1.1),
                    max(SINK, z + e * sz)))
    pts.append((x, y, SINK))
    hull(hs, pts, paint, ROCK)


def speckles(hs, rng, cx, cy, rmin, rmax, n, zfn=None, size=(0.025, 0.05), violet=0.15, glow_z=0.0):
    """Tiny glowing three-sided pyramids (bioluminescent speckles on moss)."""
    for _ in range(n):
        a = rng.uniform(0.0, TAU)
        d = rng.uniform(rmin, rmax)
        px, py = cx + math.cos(a) * d, cy + math.sin(a) * d
        pz = zfn(px, py) if zfn else glow_z
        s = rng.uniform(*size)
        rot = rng.uniform(0.0, TAU)
        base = [hs.v((px + math.cos(rot + k * TAU / 3) * s, py + math.sin(rot + k * TAU / 3) * s, pz - s * 0.4)) for k in range(3)]
        top = hs.v((px, py, pz + s * 1.1))
        paint = ("glow", C["speck_violet"] if rng.random() < violet else C["speck"])
        for k in range(3):
            j = (k + 1) % 3
            hs.face((base[k], base[j], top), paint, "main", GLOW, center=(px, py, pz - s))


def moss_mound(hs, rng, x, y, rx, ry, h, n=10, paint="moss"):
    pts = [(x, y, SINK)]
    for i in range(n):
        a = (i + rng.uniform(-0.3, 0.3)) * TAU / n
        pts.append((x + math.cos(a) * rx * rng.uniform(0.75, 1.05), y + math.sin(a) * ry * rng.uniform(0.75, 1.05), rng.uniform(-0.04, 0.02)))
    for i in range(max(3, n // 3)):
        a = rng.uniform(0.0, TAU)
        d = rng.uniform(0.0, 0.55)
        pts.append((x + math.cos(a) * rx * d, y + math.sin(a) * ry * d, h * rng.uniform(0.6, 1.0)))
    hull(hs, pts, paint, ROCK)


def ngon(r, n, rot=0.0, cx=0.0, cy=0.0, jitter=None, rng=None):
    out = []
    for k in range(n):
        a = rot + k * TAU / n
        rr = r * (rng.uniform(1.0 - jitter, 1.0 + jitter) if jitter else 1.0)
        out.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    return out


def column(hs, secs, paint, mat=RUIN, cap=True, cap_paint=None):
    """Vertical loft: secs = [(z or callable(x, y), poly)], polys CCW with equal vertex counts."""
    rings = []
    for z, poly in secs:
        rings.append([hs.v((px, py, z(px, py) if callable(z) else z)) for px, py in poly])
    n = len(secs[0][1])
    for (za, pa), ra, rb in zip(secs, rings, rings[1:]):
        cx = sum(p[0] for p in pa) / n
        cy = sum(p[1] for p in pa) / n
        for k in range(n):
            j = (k + 1) % n
            ox = (pa[k][0] + pa[j][0]) * 0.5 - cx
            oy = (pa[k][1] + pa[j][1]) * 0.5 - cy
            hs.face((ra[k], ra[j], rb[j], rb[k]), paint, "main", mat, outward=(ox, oy, 0.0))
    if cap:
        hs.face(tuple(rings[-1]), cap_paint or paint, "main", mat, outward=(0.0, 0.0, 1.0))
    return rings


def rbox(hs, c, size, rot_z, paint, mat=RUIN, ch=0.0, tilt=(0.0, 0.0), bottom=False):
    """Box rotated about z (and optionally tilted about x and y)."""
    g = HS(hs.rng)
    g.box((0.0, 0.0, 0.0), size, ch, paint, mat, bottom=bottom)
    merge_hs(hs, g, xform(c, (tilt[0], tilt[1], rot_z)))


def octa(hx, hy, cut, cx=0.0, cy=0.0):
    return [(cx + x, cy + y) for x, y in ((-hx + cut, -hy), (hx - cut, -hy), (hx, -hy + cut), (hx, hy - cut), (hx - cut, hy),
                                          (-hx + cut, hy), (-hx, hy - cut), (-hx, -hy + cut))]


def scale_poly(poly, s, cx=0.0, cy=0.0):
    return [(cx + (x - cx) * s, cy + (y - cy) * s) for x, y in poly]


# ----------------------------------------------------------------------------
# Flora
# ----------------------------------------------------------------------------

def lotus(hs, rng, cx, cy, R, H, ribs=10, stem_sides=6):
    """Glowing lotus cap after the concept: a wide, gently pleated translucent disc with bright radial ribs, a
    bright rim and a white heart, on a trumpet stem that flares into the cap."""
    lean = (rng.uniform(-1.0, 1.0) * R * 0.14, rng.uniform(-1.0, 1.0) * R * 0.14)
    rs = max(0.022, R * 0.055)
    secs = ((SINK, rs * 1.3, 0.0), (H * 0.32, rs, 0.3), (H * 0.62, rs * 0.92, 0.62), (H * 0.8, rs * 1.45, 0.86), (H * 0.9, R * 0.24, 1.0))
    rot = rng.uniform(0.0, TAU)
    rings = []
    for z, r, t in secs:
        ox, oy = cx + lean[0] * t, cy + lean[1] * t
        rings.append(([hs.v((ox + math.cos(rot + k * TAU / stem_sides) * r, oy + math.sin(rot + k * TAU / stem_sides) * r, z))
                       for k in range(stem_sides)], (ox, oy)))
    for (ra, ca), (rb, cb) in zip(rings, rings[1:]):
        for k in range(stem_sides):
            j = (k + 1) % stem_sides
            a = rot + (k + 0.5) * TAU / stem_sides
            hs.face((ra[k], ra[j], rb[j], rb[k]), ("stem", H), "smooth", GLOW, outward=(math.cos(a), math.sin(a), 0.0))
    tx, ty = cx + lean[0], cy + lean[1]
    segs = ribs * 2
    paint = ("cap", tx, ty, R, H, rot, ribs)

    def ring(rr, z, amp, droop=0.0):
        out = []
        for i in range(segs):
            a = rot + i * TAU / segs
            rib = i % 2 == 0
            rad = rr * (1.0 + (0.03 if rib else -0.025))
            out.append(hs.v((tx + math.cos(a) * rad, ty + math.sin(a) * rad, z + (amp if rib else -amp) - droop)))
        return out

    centre = hs.v((tx, ty, H + 0.035 * R))
    r1 = ring(R * 0.2, H + 0.012 * R, 0.0)
    r2 = ring(R * 0.66, H - 0.004 * R, 0.016 * R)
    r3 = ring(R, H - 0.05 * R, 0.026 * R)
    r4 = ring(R * 0.95, H - 0.11 * R, 0.022 * R)
    for i in range(segs):
        j = (i + 1) % segs
        hs.face((centre, r1[i], r1[j]), paint, "main", GLOW, outward=(0, 0, 1))
        hs.face((r1[i], r2[i], r2[j], r1[j]), paint, "main", GLOW, outward=(0, 0, 1))
        hs.face((r2[i], r3[i], r3[j], r2[j]), paint, "main", GLOW, outward=(0, 0, 1))
        a = rot + (i + 0.5) * TAU / segs
        hs.face((r3[i], r4[i], r4[j], r3[j]), ("caprim",), "main", GLOW, outward=(math.cos(a), math.sin(a), -0.3))


def tube(hs, rng, cx, cy, r, h, lean=(0.0, 0.0), sides=7):
    """Glassy tube with a flared, brighter mouth and a dark throat."""
    rot = rng.uniform(0.0, TAU)
    secs = ((SINK, r * 1.05, 0.0), (h * 0.72, r * 0.9, 0.72), (h * 0.92, r * 1.22, 0.92), (h, r * 1.7, 1.0))
    rings = []
    for z, rr, t in secs:
        ox, oy = cx + lean[0] * t, cy + lean[1] * t
        rings.append([hs.v((ox + math.cos(rot + k * TAU / sides) * rr, oy + math.sin(rot + k * TAU / sides) * rr, z)) for k in range(sides)])
    for ra, rb in zip(rings, rings[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            a = rot + (k + 0.5) * TAU / sides
            hs.face((ra[k], ra[j], rb[j], rb[k]), ("tube", h), "smooth", GLOW, outward=(math.cos(a), math.sin(a), 0.0))
    ox, oy = cx + lean[0] * 0.8, cy + lean[1] * 0.8
    throat = [hs.v((ox + math.cos(rot + k * TAU / sides) * r * 0.8, oy + math.sin(rot + k * TAU / sides) * r * 0.8, h * 0.8)) for k in range(sides)]
    mouth = rings[-1]
    mx, my = cx + lean[0], cy + lean[1]
    for k in range(sides):
        j = (k + 1) % sides
        a = rot + (k + 0.5) * TAU / sides
        hs.face((mouth[k], mouth[j], throat[j], throat[k]), ("throat", h), "main", GLOW, outward=(-math.cos(a), -math.sin(a), 0.6))
    del mx, my


def goblet(hs, rng, cx, cy, rc, h, sides=7):
    """Violet goblet flower: thin stem, flared cup glowing from inside."""
    rot = rng.uniform(0.0, TAU)
    lean = (rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06))
    secs = ((SINK, 0.022, 0.0, 5), (h * 0.55, 0.018, 0.55, 5))
    st = []
    for z, rr, t, n in secs:
        st.append([hs.v((cx + lean[0] * t + math.cos(rot + k * TAU / 5) * rr, cy + lean[1] * t + math.sin(rot + k * TAU / 5) * rr, z)) for k in range(5)])
    for k in range(5):
        j = (k + 1) % 5
        a = rot + (k + 0.5) * TAU / 5
        hs.face((st[0][k], st[0][j], st[1][j], st[1][k]), ("gobstem",), "smooth", GLOW, outward=(math.cos(a), math.sin(a), 0.0))
    tx, ty = cx + lean[0], cy + lean[1]
    cup_secs = ((h * 0.55, 0.02), (h * 0.72, rc * 0.42), (h * 0.9, rc * 0.82), (h, rc))
    rings = [[hs.v((tx + math.cos(rot + k * TAU / sides) * rr, ty + math.sin(rot + k * TAU / sides) * rr, z)) for k in range(sides)] for z, rr in cup_secs]
    for ra, rb in zip(rings, rings[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            a = rot + (k + 0.5) * TAU / sides
            hs.face((ra[k], ra[j], rb[j], rb[k]), ("goblet", h), "main", GLOW, outward=(math.cos(a), math.sin(a), 0.0))
    heart = hs.v((tx, ty, h * 0.8))
    for k in range(sides):
        j = (k + 1) % sides
        hs.face((rings[-1][k], rings[-1][j], heart), ("gobinner", tx, ty, rc), "main", GLOW, outward=(0, 0, 1))


def lily(hs, rng, cx, cy, r, z=0.012):
    """Floating lily pad with a notch, a lighter upturned rim and dark veins; waterline at z = 0."""
    n = 11
    notch = rng.uniform(0.0, TAU)
    gap = 0.42
    centre = hs.v((cx, cy, z + 0.008))
    inner, outer = [], []
    for i in range(n + 1):
        a = notch + gap * 0.5 + i * (TAU - gap) / n
        rr = r * rng.uniform(0.95, 1.04)
        inner.append(hs.v((cx + math.cos(a) * rr * 0.82, cy + math.sin(a) * rr * 0.82, z + 0.004)))
        outer.append(hs.v((cx + math.cos(a) * rr, cy + math.sin(a) * rr, z + 0.016)))
    paint = ("pad", cx, cy, r)
    for i in range(n):
        hs.face((centre, inner[i], inner[i + 1]), paint, "main", FLORA, outward=(0, 0, 1))
        hs.face((inner[i], outer[i], outer[i + 1], inner[i + 1]), ("padrim",), "main", FLORA, outward=(0, 0, 1))


# ----------------------------------------------------------------------------
# Piece builders (each returns an HS in Blender space, base centre at the origin)
# ----------------------------------------------------------------------------

def build_rock(rng, idx):
    """Low-to-medium heap of fractured black rock (h ~ 1): a pinnacle of stacked chunks among angular blocks, with
    moss and speckles at the foot."""
    hs = HS(rng)
    pinnacle(hs, rng, 0.0, 0.0, 1.0, 0.36, lean=(rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06)), chunks=3, sharp=idx != 2)
    count = (4, 3, 5)[idx]
    for k in range(count):
        a = k * TAU / count + rng.uniform(-0.4, 0.4)
        d = rng.uniform(0.28, 0.44)
        x, y = math.cos(a) * d, math.sin(a) * d
        if k % 2:
            boulder(hs, rng, x, y, 0.1, rng.uniform(0.18, 0.26), rng.uniform(0.16, 0.24), rng.uniform(0.2, 0.34), n=9)
        else:
            pinnacle(hs, rng, x, y, rng.uniform(0.4, 0.7), rng.uniform(0.2, 0.26), lean=(x * 0.15, y * 0.15), chunks=2,
                     sharp=rng.random() < 0.6)
    moss_mound(hs, rng, 0.0, 0.0, 0.62, 0.58, 0.06, n=12)
    speckles(hs, rng, 0.0, 0.0, 0.35, 0.62, 14, glow_z=0.035)
    return hs


def build_crag(rng, idx):
    """Tall jagged outcrop (h ~ 2.6): a broad core of stacked fractured chunks rising to a jagged crest, shoulders
    reaching half to three quarters of its height, angular blocks at the foot and a mossy speckled skirt; variant 2
    is a long broken ridge. Chunky masses with wide facets, like the concept's black rock heaps."""
    hs = HS(rng)
    H = 2.6
    a0 = rng.uniform(0.0, TAU)
    if idx == 2:
        # Ridge: a row of pinnacles along x, tallest off-centre.
        for k, (x, hh, r) in enumerate(((-0.75, 0.55, 0.36), (-0.3, 0.85, 0.44), (0.18, 1.0, 0.46), (0.62, 0.7, 0.4), (0.98, 0.42, 0.3))):
            pinnacle(hs, rng, x, rng.uniform(-0.1, 0.1), H * hh, r, lean=(x * 0.06, 0.0), chunks=4 if hh > 0.6 else 3, squash=0.8,
                     sharp=rng.random() < 0.6)
        for k in range(4):
            boulder(hs, rng, rng.uniform(-1.0, 1.0), rng.choice((-1, 1)) * rng.uniform(0.38, 0.5), 0.08, 0.22, 0.18, rng.uniform(0.18, 0.32), n=9)
        moss_mound(hs, rng, 0.0, 0.0, 1.18, 0.62, 0.08, n=12)
        speckles(hs, rng, 0.0, 0.0, 0.5, 1.1, 12, glow_z=0.05)
        return hs
    pinnacle(hs, rng, 0.0, 0.0, H, 0.56, lean=(rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04)), chunks=5, squash=0.82,
             sharp=idx != 1)
    for k in range(2):
        a = a0 + k * 2.6
        x, y = math.cos(a) * 0.42, math.sin(a) * 0.42
        pinnacle(hs, rng, x, y, H * rng.uniform(0.5, 0.78), 0.42, lean=(x * 0.06, y * 0.06), chunks=4, squash=0.85, sharp=rng.random() < 0.7)
    for k in range(3):
        a = a0 + 1.3 + k * TAU / 3 + rng.uniform(-0.35, 0.35)
        d = rng.uniform(0.6, 0.78)
        x, y = math.cos(a) * d, math.sin(a) * d
        pinnacle(hs, rng, x, y, H * rng.uniform(0.2, 0.38), rng.uniform(0.3, 0.38), lean=(x * 0.1, y * 0.1), chunks=2, sharp=rng.random() < 0.5)
    for k in range(4):
        a = rng.uniform(0.0, TAU)
        d = rng.uniform(0.75, 0.95)
        boulder(hs, rng, math.cos(a) * d, math.sin(a) * d, 0.08, 0.26, 0.22, rng.uniform(0.2, 0.36), n=9)
    moss_mound(hs, rng, 0.0, 0.0, 1.12, 1.08, 0.08, n=12)
    speckles(hs, rng, 0.0, 0.0, 0.7, 1.1, 12, glow_z=0.05)
    return hs


def build_lotus(rng, idx):
    hs = HS(rng)
    if idx == 0:
        lotus(hs, rng, 0.0, 0.0, 0.74, 1.0)
    elif idx == 1:
        lotus(hs, rng, -0.18, 0.08, 0.6, 1.0)
        lotus(hs, rng, 0.45, -0.3, 0.3, 0.55, ribs=8)
    else:
        lotus(hs, rng, 0.05, 0.22, 0.48, 1.0)
        lotus(hs, rng, -0.42, -0.25, 0.32, 0.66, ribs=8)
        lotus(hs, rng, 0.42, -0.32, 0.26, 0.45, ribs=8)
    return hs


def build_grove(rng, idx):
    """Jungle grove: a tall lotus over medium ones, a tube cluster and goblets on a mossy, speckled base."""
    hs = HS(rng)
    lotus(hs, rng, 0.08, 0.15, 0.62, 1.0)
    lotus(hs, rng, -0.5, -0.12, 0.38, 0.62, ribs=8)
    if idx != 1:
        lotus(hs, rng, 0.42, -0.42, 0.3, 0.45, ribs=8)
    for k in range(3 + idx):
        a = 2.2 + k * 0.7
        tube(hs, rng, 0.55 * math.cos(a) * 0.9 + 0.1, 0.6 * math.sin(a), 0.045, rng.uniform(0.32, 0.55))
    if idx != 0:
        for k in range(2):
            goblet(hs, rng, -0.62 + k * 0.22, 0.42 - k * 0.15, 0.09, rng.uniform(0.3, 0.42))
    moss_mound(hs, rng, 0.0, 0.0, 0.9, 0.85, 0.05, n=12)
    speckles(hs, rng, 0.0, 0.0, 0.3, 0.88, 18, glow_z=0.03)
    return hs


def build_tubes(rng, idx):
    hs = HS(rng)
    n = (5, 7, 4)[idx]
    for k in range(n):
        a = k * 2.39996
        d = 0.0 if k == 0 else 0.1 + 0.26 * math.sqrt(k / n)
        x, y = math.cos(a) * d, math.sin(a) * d
        h = 1.0 if k == 0 else rng.uniform(0.45, 0.88)
        tube(hs, rng, x, y, rng.uniform(0.045, 0.065), h, lean=(x * 0.25, y * 0.25))
    speckles(hs, rng, 0.0, 0.0, 0.1, 0.4, 6, glow_z=0.02)
    return hs


def build_goblets(rng, idx):
    hs = HS(rng)
    n = (4, 6)[idx]
    for k in range(n):
        a = k * 2.39996 + 0.5
        d = 0.0 if k == 0 else 0.12 + 0.24 * math.sqrt(k / n)
        h = 1.0 if k == 0 else rng.uniform(0.5, 0.85)
        goblet(hs, rng, math.cos(a) * d, math.sin(a) * d, rng.uniform(0.11, 0.15) * (1.0 if k == 0 else 0.85), h)
    return hs


def build_raft(rng, idx):
    """Raft of floating lily pads of mixed sizes (waterline at y = 0)."""
    hs = HS(rng)
    n = (6, 9, 4)[idx]
    placed = []
    for k in range(n):
        for _ in range(40):
            r = rng.uniform(0.12, 0.3) if k else rng.uniform(0.26, 0.34)
            a = rng.uniform(0.0, TAU)
            d = 0.0 if k == 0 else rng.uniform(0.15, 0.85 - r)
            x, y = math.cos(a) * d, math.sin(a) * d
            if all(math.hypot(x - px, y - py) > (r + pr) * 0.86 for px, py, pr in placed):
                break
        placed.append((x, y, r))
        lily(hs, rng, x, y, r, z=0.01 + 0.004 * (k % 3))
    if idx == 1:  # small glowing buds on two pads
        for x, y, r in placed[1:3]:
            speckles(hs, rng, x, y, 0.0, 0.01, 1, size=(0.045, 0.05), violet=0.0, glow_z=0.03)
    return hs


def build_moss(rng, idx):
    """Low moss tuft with glowing speckles (authored height ~0.22)."""
    hs = HS(rng)
    moss_mound(hs, rng, 0.0, 0.0, 0.42, 0.38, 0.22, n=11, paint="mosstuft")
    for k in range((2, 3, 1)[idx]):
        a = rng.uniform(0.0, TAU)
        moss_mound(hs, rng, math.cos(a) * 0.36, math.sin(a) * 0.32, 0.22, 0.2, 0.14, n=8, paint="mosstuft")
    speckles(hs, rng, 0.0, 0.0, 0.05, 0.55, (10, 13, 8)[idx], zfn=lambda x, y: 0.03 + max(0.0, 0.17 - math.hypot(x, y) * 0.3),
             violet=0.25)
    return hs


# --- ruins -------------------------------------------------------------------------------------------------------

def strip(hs, x, y, z0, z1, w, face="front", depth=0.012, recess=0.05, paint=None):
    """A vertical orange light strip set in a dark recess on a wall at y (front: -y) or x (side: +x)."""
    paint = paint or ("glow", C["orange"])
    if face == "front":
        hs.box((x, y - 0.004, (z0 + z1) * 0.5), (w + recess, 0.02, (z1 - z0) + recess), 0.0, "recess", RUIN)
        hs.box((x, y - 0.014 - depth * 0.5, (z0 + z1) * 0.5), (w, depth, z1 - z0), 0.0, paint, GLOW)
    else:
        hs.box((x + 0.004, y, (z0 + z1) * 0.5), (0.02, w + recess, (z1 - z0) + recess), 0.0, "recess", RUIN)
        hs.box((x + 0.014 + depth * 0.5, y, (z0 + z1) * 0.5), (depth, w, z1 - z0), 0.0, paint, GLOW)


def shaft(hs, z0, z1, hx0, hy0, hx1, hy1, cut=0.08, top=None, cx=0.0, cy=0.0, cap=True):
    secs = [(z0, octa(hx0, hy0, cut, cx, cy)), ((top if top else z1), octa(hx1, hy1, cut * hx1 / hx0, cx, cy))]
    return column(hs, secs, "stone", RUIN, cap=cap)


def build_tower(rng, idx):
    """Stepped monolith tower (authored height ~3.0): stepped plinths, a tapering chamfered shaft framed by lit
    corner pilasters and ledges, a tall orange strip in a dark recessed panel on the front and a shorter one on the
    right flank, buttress fins, and a two-pronged crown. Variant 1 is broken: the shaft ends in a slanted fracture
    and its crown lies in pieces at its foot."""
    hs = HS(rng)
    hs.prism(octa(0.98, 0.98, 0.3), SINK, 0.18, 0.03, "stone", RUIN)
    hs.prism(octa(0.8, 0.8, 0.24), 0.18, 0.36, 0.025, "stone_lit", RUIN)
    hs.prism(octa(0.64, 0.62, 0.16), 0.36, 0.56, 0.02, "stone", RUIN)
    broken = idx == 1
    top = 2.5
    cut = 1.95 if broken else top
    column(hs, [(0.56, octa(0.5, 0.45, 0.1)), (cut, octa(0.4, 0.36, 0.08))], "stone", RUIN, cap=True)
    # Lit corner pilasters on the front, following the taper.
    for side in (-1, 1):
        zt = (2.25 if side > 0 else 2.05) if broken else top - 0.06
        t = (zt - 0.56) / (top - 0.56)
        x0, x1 = side * 0.44, side * (0.44 - 0.09 * t)
        y0, y1 = -0.4, -0.4 + 0.08 * t
        column(hs, [(0.56, [(x0 - 0.06, y0 - 0.06), (x0 + 0.06, y0 - 0.06), (x0 + 0.06, y0 + 0.06), (x0 - 0.06, y0 + 0.06)]),
                    (zt, [(x1 - 0.05, y1 - 0.05), (x1 + 0.05, y1 - 0.05), (x1 + 0.05, y1 + 0.05), (x1 - 0.05, y1 + 0.05)])],
               "edge_stone", RUIN, cap=True)
    # Ledges across the front.
    for z in ((1.25, 1.95) if not broken else (1.25,)):
        t = (z - 0.56) / (top - 0.56)
        hs.box((0.0, -0.45 + 0.09 * t, z), (0.78 - 0.18 * t, 0.06, 0.05), 0.0, "edge_stone", RUIN)
    if not broken:
        hs.prism(octa(0.44, 0.4, 0.1), top, top + 0.1, 0.015, "stone_lit", RUIN)
        hs.prism(octa(0.32, 0.29, 0.08), top + 0.1, top + 0.2, 0.012, "stone", RUIN)
        # Crown: one tall off-centre spike over a stepped cap and a short broken stub (no face-like pair from above).
        column(hs, [(top + 0.2, octa(0.11, 0.12, 0.03, -0.08, 0.04)), (3.0, octa(0.02, 0.025, 0.006, -0.06, 0.05))], "edge_stone", RUIN, cap=True)
        column(hs, [(top + 0.2, octa(0.06, 0.07, 0.02, 0.17, -0.06)), (top + 0.36, octa(0.045, 0.05, 0.012, 0.17, -0.06))], "stone", RUIN, cap=True)
        hs.box((0.0, -0.33, top + 0.06), (0.16, 0.012, 0.025), 0.0, ("glow", C["orange"]), GLOW)
    # Front strip (glTF +Z = Blender -y) in a recessed panel, and a flank strip on +x.
    zt = 2.2 if not broken else 1.75
    hs.box((0.0, -0.405, (0.72 + zt + 0.1) * 0.5), (0.3, 0.02, zt - 0.62), 0.0, "recess", RUIN)
    strip(hs, 0.0, -0.42, 0.8, zt, 0.08)
    strip(hs, 0.47, 0.02, 1.0, zt - 0.4, 0.05, face="side")
    # Base windows and a door slot.
    hs.box((0.0, -0.63, 0.46), (0.24, 0.03, 0.14), 0.0, "recess", RUIN)
    hs.box((0.0, -0.645, 0.46), (0.12, 0.012, 0.08), 0.0, ("glow", C["orange_dim"]), GLOW)
    for k in (-1, 1):
        hs.box((k * 0.34, -0.79, 0.28), (0.08, 0.02, 0.035), 0.0, ("glow", C["amber"]), GLOW)
    # Buttress fins left/right (wedges): a prism in the x-z plane extruded along y.
    for side in (-1, 1):
        g = HS(rng)
        poly = [(0.0, 0.4), (0.28, 0.4), (0.0, 1.55)]
        b0 = [g.v((side * (0.42 + px), -0.12, pz)) for px, pz in poly]
        b1 = [g.v((side * (0.42 + px), 0.12, pz)) for px, pz in poly]
        for k in range(3):
            j = (k + 1) % 3
            g.face((b0[k], b0[j], b1[j], b1[k]), "stone", "main", RUIN, center=(side * 0.5, 0.0, 0.8))
        g.face(tuple(b0), "edge_stone", "main", RUIN, outward=(0, -1, 0))
        g.face(tuple(b1), "stone", "main", RUIN, outward=(0, 1, 0))
        merge_hs(hs, g, xform((0.0, 0.0, 0.0)))
    if broken:
        # Jagged fracture: broken teeth of the shaft wall standing up from the cut, and a fallen block.
        for k, (x, y, hh, w) in enumerate(((-0.28, -0.24, 0.55, 0.16), (0.05, -0.3, 0.3, 0.2), (0.3, -0.18, 0.42, 0.14),
                                           (0.28, 0.2, 0.22, 0.16), (-0.25, 0.22, 0.36, 0.15))):
            column(hs, [(1.9, octa(w, w * 0.8, w * 0.25, x, y)), (1.95 + hh, octa(w * 0.35, w * 0.3, w * 0.1, x + 0.03, y))],
                   "edge_stone" if k % 2 else "stone", RUIN, cap=True)
        rbox(hs, (0.6, -0.7, 0.1), (0.4, 0.32, 0.28), 0.5, "stone", ch=0.02, tilt=(0.25, -0.18))
        rbox(hs, (-0.7, -0.62, 0.05), (0.26, 0.22, 0.2), -0.3, "stone", ch=0.015, tilt=(0.0, 0.3))
        rbox(hs, (0.85, -0.2, 0.0), (0.2, 0.2, 0.16), 1.1, "stone", ch=0.01)
    moss_mound(hs, rng, -0.55, -0.62, 0.42, 0.3, 0.06, n=8)
    moss_mound(hs, rng, 0.62, 0.55, 0.38, 0.3, 0.06, n=8)
    speckles(hs, rng, 0.0, 0.0, 0.62, 0.95, 12, glow_z=0.05)
    return hs


def build_fort(rng, idx):
    """Stepped fortress (authored height ~2.7): a broad octagonal stepped base with buttressed walls, a ring
    platform with a glowing inlay on its front terrace, a keep and twin towers at the back with orange strips,
    and a conduit stub on the right for a bridge. Variant 1 has one tower broken and a breached wall."""
    hs = HS(rng)
    hs.prism(octa(1.45, 1.45, 0.48), SINK, 0.16, 0.03, "stone", RUIN)
    hs.prism(octa(1.28, 1.28, 0.42), 0.16, 0.34, 0.03, "stone", RUIN)
    # Wall segments along the back half and sides (front terrace stays open for the ring).
    for k in range(9):
        a = math.radians(-10 + k * 25)
        if idx == 1 and k == 1:
            continue
        x, y = math.cos(a) * 1.1, math.sin(a) * 1.1
        rbox(hs, (x, y, 0.47), (0.2, 0.42, 0.26), a, "stone", ch=0.02)
        if k % 2 == 0:
            rbox(hs, (math.cos(a) * 1.2, math.sin(a) * 1.2, 0.3), (0.14, 0.14, 0.36), a, "stone", ch=0.015)
    # Front terrace ring platform.
    fy = -0.5
    hs.prism(ngon(0.62, 16, cy=fy), 0.34, 0.4, 0.015, "stone_lit", RUIN)
    flat_ring(hs, 0.0, fy, 0.405, 0.42, 0.5, 16, ("glow", C["cyan"]))
    hs.prism(ngon(0.18, 10, cy=fy), 0.4, 0.47, 0.01, "stone", RUIN)
    disc(hs, 0.0, fy, 0.473, 0.09, 10, ("glow", C["cyan"]))
    # Keep and twin towers.
    hs.prism(octa(0.5, 0.32, 0.08, 0.0, 0.42), 0.34, 1.05, 0.02, "stone", RUIN)
    strip(hs, 0.0, 0.1, 0.5, 0.92, 0.05)
    for side in (-1, 1):
        cx, cy = side * 0.55, 0.55
        broken = idx == 1 and side > 0
        z1 = 2.7 if side < 0 else 2.25
        if broken:
            shaft(hs, 0.34, 1.6, 0.26, 0.24, 0.22, 0.2, cut=0.06, top=lambda x, y: 1.6 + (x - 0.55) * 0.8, cx=cx, cy=cy)
        else:
            shaft(hs, 0.34, z1 - 0.18, 0.26, 0.24, 0.2, 0.19, cut=0.06, cx=cx, cy=cy)
            hs.prism(octa(0.24, 0.22, 0.06, cx, cy), z1 - 0.18, z1 - 0.08, 0.01, "stone", RUIN)
            column(hs, [(z1 - 0.08, octa(0.1, 0.1, 0.03, cx, cy)), (z1, octa(0.015, 0.015, 0.005, cx, cy))], "stone", RUIN)
        strip(hs, cx, cy - 0.24, 0.55, (1.45 if broken else z1 - 0.45), 0.05)
    # Conduit stub to the right (bridge connection) with lit panels.
    hs.box((1.2, -0.05, 0.72), (0.7, 0.34, 0.14), 0.02, "stone", RUIN)
    for k in range(3):
        hs.box((0.98 + k * 0.2, -0.05, 0.795), (0.13, 0.18, 0.012), 0.0, ("glow", C["panel"]), GLOW)
    # Front steps.
    for k in range(3):
        hs.box((0.0, -1.33 - k * 0.07, 0.11 - k * 0.07), (0.6, 0.12, 0.08), 0.0, "stone_lit", RUIN)
    if idx == 1:
        rbox(hs, (1.02, 0.52, 0.12), (0.3, 0.25, 0.22), 0.6, "stone", ch=0.02, tilt=(0.2, 0.3))
        rbox(hs, (1.28, 0.2, 0.06), (0.2, 0.18, 0.14), -0.4, "stone", ch=0.01)
    moss_mound(hs, rng, -1.05, -0.8, 0.4, 0.32, 0.08, n=8)
    moss_mound(hs, rng, 0.95, -0.92, 0.36, 0.28, 0.07, n=8)
    speckles(hs, rng, 0.0, 0.0, 1.1, 1.45, 18, glow_z=0.06)
    return hs


def flat_ring(hs, cx, cy, z, r0, r1, seg, paint):
    for k in range(seg):
        t0, t1 = k * TAU / seg, (k + 1) * TAU / seg
        q = [hs.v((cx + math.cos(t) * r, cy + math.sin(t) * r, z)) for t, r in ((t0, r0), (t1, r0), (t1, r1), (t0, r1))]
        hs.face(q, paint, "main", GLOW, outward=(0, 0, 1))


def disc(hs, cx, cy, z, r, seg, paint):
    c = hs.v((cx, cy, z))
    ring = [hs.v((cx + math.cos(k * TAU / seg) * r, cy + math.sin(k * TAU / seg) * r, z)) for k in range(seg)]
    for k in range(seg):
        hs.face((c, ring[k], ring[(k + 1) % seg]), paint, "main", GLOW, outward=(0, 0, 1))


def build_ring(rng, idx):
    """Ring platform (authored height ~0.45): two stepped 16-sided tiers, a glowing cyan ring inlay, a central
    dais with a glowing heart and four pylons with amber lamps. Variant 1 is half-collapsed."""
    hs = HS(rng)
    seg = 16
    if idx == 0:
        hs.prism(ngon(1.15, seg, rot=0.2), SINK, 0.12, 0.025, "stone", RUIN)
        hs.prism(ngon(0.98, seg, rot=0.2), 0.12, 0.24, 0.02, "stone_lit", RUIN)
        flat_ring(hs, 0.0, 0.0, 0.245, 0.64, 0.74, seg, ("glow", C["cyan"]))
    else:
        # Collapsed: the back third broke off and tilted into the mire; the ring is broken.
        hs.prism(ngon(1.15, seg, rot=0.2), SINK, 0.12, 0.025, "stone", RUIN)
        g = HS(rng)
        arc = [(0.0, 0.0)] + [(math.cos(a) * 0.98, math.sin(a) * 0.98) for a in [math.radians(200 + k * 20) for k in range(12)]]
        g.prism(arc, 0.12, 0.24, 0.02, "stone_lit", RUIN)
        merge_hs(hs, g, xform((0.0, 0.0, 0.0)))
        for k in range(10):
            t0, t1 = math.radians(200 + k * 20), math.radians(220 + k * 20)
            q = [hs.v((math.cos(t) * r, math.sin(t) * r, 0.245)) for t, r in ((t0, 0.64), (t1, 0.64), (t1, 0.74), (t0, 0.74))]
            hs.face(q, ("glow", C["cyan"]), "main", GLOW, outward=(0, 0, 1))
        rbox(hs, (0.15, 0.6, 0.08), (0.9, 0.45, 0.1), 0.2, "stone_lit", ch=0.02, tilt=(-0.35, 0.1))
        rbox(hs, (-0.55, 0.45, 0.05), (0.4, 0.3, 0.1), -0.5, "stone_lit", ch=0.015, tilt=(-0.2, -0.3))
    hs.prism(ngon(0.3, 12), 0.24, 0.34, 0.015, "stone", RUIN)
    disc(hs, 0.0, 0.0, 0.343, 0.14, 12, ("glow", C["cap_core"]))
    flat_ring(hs, 0.0, 0.0, 0.343, 0.18, 0.22, 12, ("glow", C["cyan_dim"]))
    for k in range(4):
        a = math.radians(45 + k * 90)
        if idx == 1 and k == 1:
            continue
        x, y = math.cos(a) * 0.86, math.sin(a) * 0.86
        rbox(hs, (x, y, 0.33), (0.12, 0.12, 0.2), a, "stone", ch=0.012)
        hs.box((x, y, 0.445), (0.07, 0.07, 0.03), 0.0, ("glow", C["amber"]), GLOW)
    moss_mound(hs, rng, 0.7, -0.75, 0.32, 0.22, 0.05, n=7)
    speckles(hs, rng, 0.0, 0.0, 0.95, 1.18, 10, glow_z=0.06)
    return hs


def build_bridge(rng, idx):
    """Elevated conduit bridge (authored height ~0.85, 3.0 long along glTF Z): a deck on two pylons, a raised
    spine with lit blue panels, side conduits. Variant 1 is broken in the middle."""
    hs = HS(rng)
    L = 1.5
    gaps = [(-L, L)] if idx == 0 else [(-L, -0.32), (0.4, L)]
    for y0, y1 in gaps:
        ym, ln = (y0 + y1) * 0.5, y1 - y0
        hs.box((0.0, ym, 0.6), (0.52, ln, 0.14), 0.02, "stone", RUIN, ends=(True, True))
        hs.box((0.0, ym, 0.71), (0.24, ln - 0.04, 0.08), 0.012, "stone_lit", RUIN)
        n = max(1, int(ln / 0.34))
        for k in range(n):
            y = y0 + 0.02 + (k + 0.5) * (ln - 0.04) / n
            hs.box((0.0, y, 0.754), (0.15, (ln - 0.04) / n * 0.72, 0.01), 0.0, ("glow", C["panel"]), GLOW)
        for side in (-1, 1):
            hs.cyl((side * 0.3, y0 + 0.01, 0.6), (0, 1, 0), 0.055, ln - 0.02, 6, 0.0, "edge_stone", RUIN, cap0=True, cap1=True, smooth=False)
    for y in (-0.95, 0.95):
        if idx == 1 and y > 0:
            rbox(hs, (0.08, y, 0.2), (0.22, 0.26, 0.6), 0.25, "stone", ch=0.02, tilt=(0.0, 0.2))
            continue
        column(hs, [(SINK, octa(0.17, 0.2, 0.05, 0.0, y)), (0.53, octa(0.12, 0.15, 0.035, 0.0, y))], "stone", RUIN, cap=True)
        hs.box((0.0, y, 0.0), (0.42, 0.46, 0.12), 0.02, "stone", RUIN)
    if idx == 1:
        rbox(hs, (-0.2, 0.05, 0.05), (0.4, 0.5, 0.12), 0.4, "stone", ch=0.02, tilt=(0.3, 0.2))
    return hs


def build_pillars(rng, idx):
    """Broken pillars rising from the mire (authored height ~1.0): chamfered square shafts with fractured tops,
    one with an orange strip."""
    hs = HS(rng)
    spec = (((0.0, 0.0, 1.0, 0.17), (0.42, 0.22, 0.72, 0.14), (-0.32, 0.28, 0.5, 0.13)),
            ((-0.18, 0.0, 1.0, 0.18), (0.3, -0.12, 0.62, 0.16)))[idx]
    for k, (x, y, h, hw) in enumerate(spec):
        s = rng.uniform(-0.6, 0.6)
        column(hs, [(SINK, octa(hw, hw, hw * 0.25, x, y)),
                    (lambda px, py, h=h, s=s, x=x: h - 0.06 + (px - x) * s * 0.4, octa(hw * 0.92, hw * 0.92, hw * 0.23, x, y))],
               "stone", RUIN, cap=True)
        hs.prism(octa(hw * 1.25, hw * 1.25, hw * 0.3, x, y), SINK, 0.08, 0.01, "stone_lit", RUIN)
        if k == 0:
            strip(hs, x, y - hw * 0.92, 0.18, h - 0.22, 0.04)
    rbox(hs, (0.1, -0.35, 0.02), (0.22, 0.16, 0.12), 0.7, "stone", ch=0.01, tilt=(0.2, 0.1))
    moss_mound(hs, rng, 0.0, 0.05, 0.6, 0.45, 0.05, n=9)
    speckles(hs, rng, 0.0, 0.0, 0.25, 0.6, 8, glow_z=0.04)
    return hs


def build_rubble(rng, idx):
    """Fallen ruin blocks and a broken slab, partly mossed over (authored height ~0.35)."""
    hs = HS(rng)
    n = (7, 9)[idx]
    for k in range(n):
        a = rng.uniform(0.0, TAU)
        d = rng.uniform(0.0, 0.6)
        sx, sy, sz = rng.uniform(0.12, 0.3), rng.uniform(0.1, 0.24), rng.uniform(0.08, 0.2)
        rbox(hs, (math.cos(a) * d, math.sin(a) * d, sz * 0.3), (sx, sy, sz), rng.uniform(0.0, TAU), "stone", ch=0.012,
             tilt=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)))
    rbox(hs, (0.1, 0.1, 0.06), (0.62, 0.32, 0.07), rng.uniform(0.0, TAU), "stone_lit", ch=0.012, tilt=(0.15, 0.25))
    if idx == 1:
        hs.box((-0.3, -0.25, 0.12), (0.03, 0.2, 0.012), 0.0, ("glow", C["orange_dim"]), GLOW)
    moss_mound(hs, rng, 0.0, 0.0, 0.7, 0.6, 0.05, n=10)
    speckles(hs, rng, 0.0, 0.0, 0.2, 0.7, 10, glow_z=0.04)
    return hs


# ----------------------------------------------------------------------------
# Colour
# ----------------------------------------------------------------------------

def colour_fn_for(hs, name):
    zs = [v[2] for v in hs.verts]
    zhi = max(zs)
    rng = random.Random(f"{SEED}:shade:{name}")
    jit = [rng.uniform(0.0, 1.0) for _ in hs.faces]

    def fn(paint, p, n, ao, fi):
        kind = paint if isinstance(paint, str) else paint[0]
        j = jit[fi]
        if kind == "glow":
            return paint[1]
        if kind in ("rock", "moss", "mosstuft"):
            if kind == "rock":
                base = mix(C["rock_dark"], C["rock_mid"], j * 0.8)
                # Cold sky light on upward facets and on faces turned to the sun (upper left, Blender -x/+y).
                lit = max(kit.smoothstep(0.3, 0.92, n.z), 0.55 * kit.smoothstep(0.2, 0.8, -n.x * 0.7 + n.y * 0.3 + n.z * 0.4))
                col = mix(base, mix(C["rock_lit"], C["rock_rim"], kit.smoothstep(0.55, 1.0, p.z / zhi)), lit * 0.9)
                # Faces turned toward the camera (glTF +Z = Blender -y) catch a little cold sky light.
                col = mix(col, C["rock_mid"], kit.clamp(-n.y, 0.0, 1.0) * 0.25 * (1.0 - lit))
                moss = (1.0 - kit.smoothstep(0.0, 0.22, p.z)) * (0.55 + 0.45 * max(0.0, n.z))
                col = mix(col, mix(C["moss"], C["moss_violet"], j), moss * 0.8)
                return mul(col, kit.lerp(0.45, 1.0, ao))
            base = mix(C["moss"], C["moss_lit"], kit.smoothstep(0.2, 1.0, n.z) * 0.7 + j * 0.3)
            if j > 0.72:
                base = mix(base, C["moss_violet"], 0.7)
            if kind == "moss":
                base = mix(base, C["mud"], 1.0 - kit.smoothstep(-0.02, 0.05, p.z))
            return mul(base, kit.lerp(0.45, 1.0, ao))
        if kind in ("stone", "stone_lit", "edge_stone", "recess"):
            if kind == "recess":
                return C["recess"]
            base = mix(C["stone_dark"], C["stone"], 0.35 + j * 0.65)
            if kind == "stone_lit":
                base = mix(base, C["stone_lit"], 0.7)
            if hs.ftag[fi] == "edge" or kind == "edge_stone":
                base = mix(base, C["edge"], 0.75)
            base = mix(base, C["stone_lit"], kit.smoothstep(0.6, 0.98, n.z) * 0.55)
            base = mix(base, C["rock_rim"], kit.smoothstep(0.85, 1.0, n.z) * kit.smoothstep(0.5, 1.0, p.z / zhi) * 0.35)
            moss = (1.0 - kit.smoothstep(0.0, 0.3, p.z)) * (0.4 + 0.6 * max(0.0, n.z))
            if n.z > 0.9 and j > 0.8:
                moss = max(moss, 0.65)
            base = mix(base, mix(C["moss"], C["moss_violet"], j), moss * 0.75)
            return mul(base, kit.lerp(0.3, 1.0, ao ** 1.2))
        if kind == "stem":
            h = paint[1]
            t = kit.clamp(p.z / (h * 0.92), 0.0, 1.0)
            return mix(C["stem_lo"], C["stem_hi"], t ** 1.5)
        if kind == "cap":
            _k, cx, cy, R, H, rot, ribs = paint
            r = math.hypot(p.x - cx, p.y - cy) / R
            a = math.atan2(p.y - cy, p.x - cx) - rot
            rib = 0.5 + 0.5 * math.cos(a * ribs)
            rib = rib ** 2
            valley = mix(C["cap_inner"], C["cap_valley"], kit.smoothstep(0.15, 0.62, r))
            valley = mix(valley, C["cap_rib"], kit.smoothstep(0.8, 1.0, r) * 0.7)
            col = mix(valley, mix(C["cap_rib"], C["cap_rim"], kit.smoothstep(0.75, 1.0, r)), rib)
            return mix(col, C["cap_core"], 1.0 - kit.smoothstep(0.0, 0.2, r))
        if kind == "caprim":
            return C["cap_rim"]
        if kind == "tube":
            t = kit.clamp(p.z / paint[1], 0.0, 1.0)
            col = mix(C["tube_lo"], C["tube_mid"], kit.smoothstep(0.0, 0.7, t))
            return mix(col, C["tube_mouth"], kit.smoothstep(0.82, 1.0, t))
        if kind == "throat":
            t = kit.clamp((p.z / paint[1] - 0.8) / 0.2, 0.0, 1.0)
            return mix(C["tube_inner"], C["tube_mouth"], t ** 2)
        if kind == "gobstem":
            return C["gob_stem"]
        if kind == "goblet":
            t = kit.clamp(p.z / paint[1], 0.0, 1.0)
            col = mix(C["gob_lo"], C["gob_hi"], kit.smoothstep(0.55, 0.95, t))
            return mix(col, C["gob_mouth"], kit.smoothstep(0.95, 1.0, t))
        if kind == "gobinner":
            r = math.hypot(p.x - paint[1], p.y - paint[2]) / paint[3]
            return mix(C["gob_inner"], C["gob_hi"], kit.smoothstep(0.1, 1.0, r))
        if kind == "pad":
            r = math.hypot(p.x - paint[1], p.y - paint[2]) / paint[3]
            col = mix(C["pad_vein"], C["pad"], kit.smoothstep(0.0, 0.5, r))
            return mul(col, 0.9 + 0.2 * j)
        if kind == "padrim":
            return mul(C["pad_rim"], 0.9 + 0.2 * j)
        raise ValueError(f"no colour for paint {paint!r}")
    return fn


# ----------------------------------------------------------------------------
# Contract and build table
# ----------------------------------------------------------------------------

# name prefix -> (builder, variants, footprint half (x, z), top (exact 1.0) or None, y_max when not exact, budget)
PIECES = {
    "nacre_rock": (build_rock, 3, 0.75, True, None, 420),
    "nacre_crag": (build_crag, 3, 1.25, True, None, 700),
    "nacre_lotus": (build_lotus, 3, 0.8, True, None, 600),
    "nacre_grove": (build_grove, 3, 1.0, True, None, 1100),
    "nacre_tubes": (build_tubes, 3, 0.5, True, None, 420),
    "nacre_goblet": (build_goblets, 2, 0.45, True, None, 420),
    "nacre_pads": (build_raft, 3, 0.9, False, 0.1, 330),
    "nacre_moss": (build_moss, 3, 0.7, True, None, 180),
    "nacre_tower": (build_tower, 2, 1.0, True, None, 900),
    "nacre_fort": (build_fort, 2, 1.5, True, None, 1600),
    "nacre_ring": (build_ring, 2, 1.2, False, 0.5, 720),
    "nacre_bridge": (build_bridge, 2, (0.45, 1.6), False, 1.0, 520),
    "nacre_pillars": (build_pillars, 2, 0.7, True, None, 340),
    "nacre_rubble": (build_rubble, 2, 0.8, False, 0.4, 400),
}
FLOATING = {"nacre_pads"}


def node_list():
    out = []
    for prefix, (fn, variants, half, top, ymax, budget) in PIECES.items():
        hx, hz = half if isinstance(half, tuple) else (half, half)
        for i in range(variants):
            rule = dict(budget=budget, x=(-hx, hx), z=(-hz, hz), y_min=-0.15, mats=MAT_NAMES)
            if top:
                rule["y_max_exact"] = 1.0
            else:
                rule["y_max"] = ymax
            out.append((f"{prefix}_{i}", prefix, fn, i, rule))
    return out


def centre_xy(hs):
    xs = [v[0] for v in hs.verts]
    ys = [v[1] for v in hs.verts]
    ox, oy = (min(xs) + max(xs)) * 0.5, (min(ys) + max(ys)) * 0.5
    for v in hs.verts:
        v[0] -= ox
        v[1] -= oy


def fit_top(hs, target):
    zmax = max(v[2] for v in hs.verts)
    k = target / zmax
    for v in hs.verts:
        if v[2] > 0.0:
            v[2] *= k
            if abs(v[2] - target) < 1e-6:
                v[2] = target
    return zmax


def glow_material(name, preview=False):
    """Vertex colour as albedo and emission (runtime reads only the name and COLOR_0)."""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = [n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"][0]
    m.use_backface_culling = True
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    vcn = m.node_tree.nodes.new("ShaderNodeVertexColor")
    vcn.layer_name = vc.COLOR_ATTR
    m.node_tree.links.new(vcn.outputs["Color"], bsdf.inputs["Base Color"])
    if preview:
        m.node_tree.links.new(vcn.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 2.2
    return m


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="nacre_kit.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--engine", default="EEVEE", choices=("EEVEE", "WORKBENCH"))
    ap.add_argument("--samples", type=int, default=32)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = [vc.make_material("nacre_rock", "vc", rough=0.9),
            vc.make_material("nacre_flora", "vc", rough=0.7),
            vc.make_material("nacre_ruin", "vc", rough=0.6),
            glow_material("nacre_glow")]
    objs, nodes, heights = {}, {}, {}
    for name, prefix, fn, idx, rule in node_list():
        hs = fn(random.Random(f"{SEED}:{name}"), idx)
        vc.triangulate_nonplanar(hs)
        centre_xy(hs)
        cols = vc.bake(hs, name, dict(glow=set(), ao=0.35, ground=0.0, colour_fn=colour_fn_for(hs, name)))
        authored = max(v[2] for v in hs.verts)
        if "y_max_exact" in rule:
            fit_top(hs, 1.0)
        heights[name] = authored
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        nodes[name] = rule
        print(f"NKIT {name:18s} tris={hs.tris():5d} authored_height={authored:.3f}")
    vc.publish(args.glb, "nacre_kit.py", dict(materials=MAT_NAMES, nodes=nodes, max_bytes=2_500_000), "NKIT")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        # Preview only: the glow material also emits in Blender.
        pm = glow_material("nacre_glow_preview", preview=True)
        for o in objs.values():
            for k, slot in enumerate(o.data.materials):
                if slot and slot.name == "nacre_glow":
                    o.data.materials[k] = pm
        render_sheet(objs, heights, args)
        kit.clear_preview(set(objs))
        render_closeup(objs, heights, args)
        kit.clear_preview(set(objs))
        render_diorama(objs, heights, args)


# ----------------------------------------------------------------------------
# Previews (not runtime assets)
# ----------------------------------------------------------------------------

def preview_world(scene):
    kit.add_sun((0.55, -0.45, -0.7), strength=4.0, color=(0.85, 0.82, 1.0), angle_deg=3.0)
    kit.setup_world(scene, (0.3, 0.26, 0.6), 1.3)


def water_material():
    m = vc.noise_material("preview_mire", "#1a2468", "#3a2a86", 0.35, 0.12, bump=0.05)
    return m


def put(src, loc, rot=0.0, scale=(1.0, 1.0, 1.0)):
    o = bpy.data.objects.new(f"p_{src.name}", src.data)
    o.location = loc
    o.rotation_euler = (0.0, 0.0, rot)
    o.scale = scale
    bpy.context.scene.collection.objects.link(o)
    return o


def render_sheet(objs, heights, args):
    scene = bpy.context.scene
    for o in objs.values():
        o.hide_render = True
    pmk = kit.preview_materials()
    order = [n for n, *_ in node_list()]
    cols = 6
    for k, name in enumerate(order):
        x = (k % cols - (cols - 1) * 0.5) * 3.2
        y = -(k // cols) * 3.4
        hz = heights[name] if name.rsplit("_", 1)[0] not in ("nacre_pads", "nacre_ring", "nacre_bridge", "nacre_rubble") else 1.0
        put(objs[name], (x, y, 0.0), 0.35, (1.0, 1.0, hz))
        kit.text_label(name, (x, y - 1.45, 0.02), 0.2, pmk["label"])
    kit.plane_obj("sheet_ground", -30, 30, -30, 30, -0.02, water_material())
    preview_world(scene)
    kit.add_ortho_camera((0.0, -7.6, 0.0), 55.0, 21.0)
    vc.setup_render(scene, args.engine, args.samples, 1800, 1500, exposure=0.6)
    kit.render(os.path.join(args.preview_dir, "preview-kit.png"))


def render_closeup(objs, heights, args):
    """Ruins and rock at the game camera (55 degree ortho), close: tower, broken tower, fortress, ring, bridge, crags."""
    scene = bpy.context.scene
    for o in objs.values():
        o.hide_render = True
    kit.plane_obj("mire", -30, 30, -30, 30, -0.05, water_material())
    for name, x, y, h, rot in (("nacre_tower_0", -3.0, 2.2, 3.0, 0.3), ("nacre_tower_1", 0.0, 2.2, 2.6, -0.2), ("nacre_fort_0", 3.4, 2.4, 2.7, -0.3),
                               ("nacre_ring_0", -3.2, -1.6, 1.0, 0.0), ("nacre_bridge_0", -0.8, -1.6, 1.0, math.pi / 2),
                               ("nacre_crag_0", 1.8, -1.4, 2.8, 0.4), ("nacre_crag_2", 4.2, -1.2, 2.4, 1.2), ("nacre_rock_1", 3.0, -3.2, 1.0, 0.0),
                               ("nacre_lotus_1", 0.6, -3.6, 1.3, 0.0), ("nacre_tubes_1", -1.6, -3.8, 1.0, 0.0), ("nacre_goblet_1", -2.6, -3.4, 0.8, 0.0)):
        put(objs[name], (x, y, 0.0), rot, (1.0, 1.0, h))
    preview_world(scene)
    kit.add_ortho_camera((0.5, -0.3, 0.6), 55.0, 10.5)
    vc.setup_render(scene, args.engine, args.samples, 1500, 1200, exposure=0.6)
    kit.render(os.path.join(args.preview_dir, "preview-closeup.png"))


def render_diorama(objs, heights, args):
    """A strip of mire at the game camera: islands of rock, flora and a ruin site over indigo water."""
    scene = bpy.context.scene
    rng = random.Random(f"{SEED}:diorama")
    SEA = 0.0
    isl = kit.warped_outline(rng, -3.0, 6.0, 2.6, n=40)
    kit.prism_obj("isl_a", isl, -1.0, 0.18, vc.noise_material("preview_moss", "#13261f", "#22303c", 1.5, 0.9), vc.noise_material("preview_moss2", "#101a1c", "#1c2230", 1.0, 0.9))
    isl2 = kit.warped_outline(rng, 3.6, 13.0, 2.3, n=40)
    kit.prism_obj("isl_b", isl2, -1.0, 0.18, bpy.data.materials["preview_moss"], bpy.data.materials["preview_moss2"])
    kit.plane_obj("mire", -30, 30, -20, 50, SEA, water_material())

    def P(name, x, y, z=0.18, h=None, s=1.0, rot=None):
        put(objs[name], (x, y, z), rng.uniform(0, TAU) if rot is None else rot, (s, s, h if h is not None else heights[name]))
    P("nacre_crag_0", -3.4, 6.6, h=2.6)
    P("nacre_crag_1", -2.2, 5.2, h=1.8, s=0.8)
    P("nacre_rock_0", -1.8, 7.6, h=0.9)
    P("nacre_grove_0", -4.4, 4.6, h=1.6)
    P("nacre_lotus_0", -1.4, 4.2, h=1.3)
    P("nacre_tubes_1", -2.6, 3.6, h=1.0)
    P("nacre_goblet_1", -4.0, 7.8, h=0.8)
    for k in range(6):
        P(f"nacre_moss_{k % 3}", -3.0 + rng.uniform(-1.6, 1.6), 6.0 + rng.uniform(-2.0, 2.0), h=0.22)
    P("nacre_pads_1", 0.2, 3.0, z=SEA, h=1.0)
    P("nacre_pads_0", -0.6, 8.6, z=SEA, h=1.0)
    P("nacre_fort_0", 3.6, 13.2, h=2.7, rot=-0.35)
    P("nacre_bridge_0", 1.0, 13.0, z=0.18, h=1.0, rot=math.pi / 2)
    P("nacre_tower_0", 3.0, 10.6, h=3.0, rot=0.3)
    P("nacre_ring_0", 4.4, 11.0, h=1.0, rot=0.0)
    P("nacre_pillars_0", 1.8, 6.4, z=SEA, h=1.2, rot=0.2)
    P("nacre_rubble_1", 2.6, 9.2, h=1.0)
    P("nacre_lotus_2", 5.0, 15.0, h=1.4)
    P("nacre_rock_2", 2.2, 15.6, h=1.0)
    preview_world(scene)
    kit.add_ortho_camera((0.0, 8.0, 0.0), 55.0, 12.0 * 1600.0 / 900.0)
    vc.setup_render(scene, args.engine, args.samples, 900, 1600, exposure=0.6)
    kit.render(os.path.join(args.preview_dir, "preview-diorama.png"))


if __name__ == "__main__":
    main()
