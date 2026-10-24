"""Umbra (the final planet: an eclipse world) terrain kit for Last Worlds (art/umbra-kit).

After the user's Umbra concepts (references only, never runtime assets): art/concepts/umbra/01-umbra-world-and-infrastructure.png
(TERRAIN and INFRASTRUCTURE panels) and 02-umbra-faction-and-eclipse.png (WORLD panel). The user, 24 October: "obsidian
black shiny surfaces and floating cliffs etc vanishing into a purple glowy fog"; everything above the plateau "very pointy
spikey"; "I like the infrastructures in these concepts too". So: faceted black glass, sharp highlights, thin violet seams
used sparingly, and the concept's monolith towers, shield pylon, eclipse gate, arc reactor, obelisks and pads.

Three materials. COLOR_0 carries the linear colour of every face, also for the glowing ones:
    umbra_obsidian (roughness 0.12)  natural black glass: spikes, shards, floating cliffs
    umbra_alloy    (roughness 0.2)   the builders' black structures (machined, chamfered edges catch the light)
    umbra_glow     (emissive)        seams, slits, halo rings, the reactor's core and the gate's beam: the runtime emits
                                     each face's own COLOR_0 (glow weight = its brightest channel), so colour sets the glow.
Gloss: vertex alpha < 1 marks glossy faces (the runtime reads 1 - alpha as gloss: smooth surface and a sharp sun glint).
Every obsidian and alloy face is written with alpha 0 (full gloss); glow faces keep alpha 1.

Shape rule (user, 24 October, about a first wall draft that read as stairs: "i want sharp edges and spikey mountains",
"not sharp and pointy jagged but like steps"): every natural form is a knife-edged shard ending in a point, its cutting
edges a narrow bevel facet (tag 'edge') coloured lighter so only the edges catch light; no flat caps or ledges.

Conventions: glTF +Y up, 1 unit = 1 game unit, pivots at the base centre (x/z centred on the bounding box). Pieces
marked `top` are scaled so their top is exactly 1.0 (the runtime scales y by the instance height). The floating pieces
(umb_float, umb_dock) follow the same rule (integrator, 24 October): y = 0 at the lowest hanging spike tip, the float's
flat top (the dock's spire tip) at exactly 1. Deterministic (seeded per node name). The canyon walls' shapes live here
too (build_void_wall); tools/blender/cliff_kit.py --world umbra builds and publishes them.

    R=/home/davidfarina/Projects/alien-skies
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/umbra_kit.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/umbra/umbra-kit.glb)" --preview-dir "$(wslpath -w $R/art/umbra-kit)" \\
        [--lookdev-dir "$(wslpath -w $R/lookdev/umbra/kit)"] [--focus umb_spire,umb_float]
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
from vesper_common import HS  # noqa: E402
from nacre_kit import hull, centre_xy, fit_top, glow_material  # noqa: E402

SEED = "umbra-kit-v1"
OBS, ALLOY, GLOW = 0, 1, 2
MAT_NAMES = ("umbra_obsidian", "umbra_alloy", "umbra_glow")
TAU = 2.0 * math.pi
SINK = -0.1

# Darker than first drafted (integrator, 24 October: the walls "glow almost white under the game's violet light"):
# the glass itself stays near black; light lives on its bevelled edges, in its gloss and in the seams.
C = {k: kit.hex_linear(v) for k, v in dict(
    deep="#07060b", lit="#15121d", edge="#2f2a44", edge_hi="#5f5880", sheen="#24202f", bounce="#2a1d66", crack="#040307",
    alloy="#121019", alloy_lit="#1e1b29", alloy_edge="#3a3550",
    glow="#7b5cff", glow_hot="#b7a4ff",
).items()}


def mix(a, b, t):
    return kit.mix3(a, b, kit.clamp(t, 0.0, 1.0))


# ----------------------------------------------------------------------------
# Geometry helpers (Blender space: x right, y away from the camera = glTF -Z, z up)
# ----------------------------------------------------------------------------

def _centroid(pts):
    n = len(pts)
    return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n, sum(p[2] for p in pts) / n)


def shaft(hs, path, angles, radial, squash, rot, paint, mat, top=None, bottom=None, cap_top=False, tag="main", wobble=None, twists=None):
    """A faceted shaft through rings along `path` [(cx, cy, z, r)], bottom to top. Every ring shares the same corner
    angles and radial factors, so its ridges run straight down its length (cut glass, not a lumpy hull). `top` / `bottom`
    close it with an apex point; `cap_top` with a flat face. Returns the rings' points (for seams)."""
    ca, sa = math.cos(rot), math.sin(rot)
    rings, idx = [], []
    for k, (cx, cy, z, r) in enumerate(path):
        pts = []
        for i, (a, f) in enumerate(zip(angles, radial)):
            w = wobble[k][i] if wobble else 1.0
            a += twists[k] if twists else 0.0
            u, v = math.cos(a) * r * f * w, math.sin(a) * r * f * w * squash
            pts.append((cx + u * ca - v * sa, cy + u * sa + v * ca, z))
        rings.append(pts)
        idx.append([hs.v(p) for p in pts])
    n = len(angles)
    cents = [(cx, cy, z) for cx, cy, z, _ in path]

    def axis_at(z):
        # The shaft's axis point at height z (faces orient away from it).
        if top is not None:
            cs = cents + [tuple(top)]
        else:
            cs = list(cents)
        if bottom is not None:
            cs = [tuple(bottom)] + cs
        cs.sort(key=lambda c: c[2])
        if z <= cs[0][2]:
            return cs[0]
        for a, b in zip(cs, cs[1:]):
            if a[2] <= z <= b[2]:
                t = (z - a[2]) / max(b[2] - a[2], 1e-9)
                return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z)
        return cs[-1]

    def add(face):
        c = _centroid([hs.verts[i] for i in face])
        hs.face(face, paint, tag, mat, center=axis_at(c[2]))

    for k in range(len(idx) - 1):
        for i in range(n):
            j = (i + 1) % n
            add((idx[k][i], idx[k][j], idx[k + 1][j], idx[k + 1][i]))
    if top is not None:
        t = hs.v(top)
        for i in range(n):
            add((idx[-1][i], idx[-1][(i + 1) % n], t))
    elif cap_top:
        hs.face(tuple(idx[-1]), paint, "top", mat, outward=(0.0, 0.0, 1.0))
    if bottom is not None:
        b = hs.v(bottom)
        for i in range(n):
            add((idx[0][(i + 1) % n], idx[0][i], b))
    return rings


def seam(hs, rng, rings, apex, fi, span, w, paint=("glow", "seam"), lift=0.0035):
    """A thin glowing crack along facet `fi` of a shaft (between corners fi and fi+1), from ring span[0] to span[1]
    (len(rings) = the apex), wandering a little across the facet and tapering to a point at its upper end."""
    n = len(rings[0])
    j = (fi + 1) % n
    k0, k1 = span
    pts = []
    for k in range(k0, k1 + 1):
        if k >= len(rings):
            a = b = Vector(apex)
        else:
            a, b = Vector(rings[k][fi]), Vector(rings[k][j])
        pts.append((a, b))
    # Facet normal from the first quad (outward: away from the facet's opposite corner centroid).
    a0, b0 = pts[0]
    a1, b1 = pts[1]
    nrm = (b0 - a0).cross(a1 - a0)
    if nrm.length < 1e-9:
        return
    nrm.normalize()
    ring_c = Vector(_centroid(rings[k0]))
    if nrm.dot((a0 + b0) * 0.5 - ring_c) < 0:
        nrm = -nrm
    strip = []
    last = len(pts) - 1
    for k, (a, b) in enumerate(pts):
        edge = (b - a).length
        t = 0.5 + rng.uniform(-0.16, 0.16)
        ww = w * (1.0 - 0.85 * (k / max(last, 1)) ** 1.5)
        if k == last:
            ww = 0.0
        d = ww * 0.5 / max(edge, 1e-6)
        p0 = a.lerp(b, kit.clamp(t - d, 0.05, 0.95)) + nrm * lift
        p1 = a.lerp(b, kit.clamp(t + d, 0.05, 0.95)) + nrm * lift
        strip.append((hs.v(tuple(p0)), hs.v(tuple(p1)) if ww > 0 else None))
    for (l0, r0), (l1, r1) in zip(strip, strip[1:]):
        if r1 is None:
            hs.face((l0, r0, l1), paint, "main", GLOW, outward=tuple(nrm))
        else:
            hs.face((l0, r0, r1, l1), paint, "main", GLOW, outward=tuple(nrm))


def step_disc(hs, cx, cy, r, z0, z1, seg=28, ch=0.012, paint="alloy", mat=ALLOY, sy=1.0, rot=0.0, smooth=False):
    """A round (or with sy != 1 elliptical) stepped plinth: a short shaft with a chamfered top edge."""
    angles = [rot + i * TAU / seg for i in range(seg)]
    ring = lambda rr, z: [hs.v((cx + math.cos(a) * rr, cy + math.sin(a) * rr * sy, z)) for a in angles]  # noqa: E731
    lo, hi, cap = ring(r, z0), ring(r, z1 - ch), ring(r - ch, z1)
    for i in range(seg):
        j = (i + 1) % seg
        a = (angles[i] + angles[j]) * 0.5
        out = (math.cos(a), math.sin(a) * (1.0 / sy if sy else 1.0), 0.0)
        hs.face((lo[i], lo[j], hi[j], hi[i]), paint, "smooth" if smooth else "main", mat, outward=out)
        hs.face((hi[i], hi[j], cap[j], cap[i]), paint, "edge", mat, outward=(out[0], out[1], 1.0))
    hs.face(tuple(cap), paint, "top", mat, outward=(0.0, 0.0, 1.0))


def glow_arc(hs, cx, cy, z, r0, r1, a0, a1, seg, paint=("glow", "seam"), sy=1.0):
    """A flat glowing arc lying on a surface at height z (a groove line on a plinth or pad)."""
    for k in range(seg):
        t0 = a0 + (a1 - a0) * k / seg
        t1 = a0 + (a1 - a0) * (k + 1) / seg
        q = [hs.v((cx + math.cos(t) * r, cy + math.sin(t) * r * sy, z)) for t, r in ((t0, r0), (t1, r0), (t1, r1), (t0, r1))]
        hs.face(q, paint, "main", GLOW, outward=(0.0, 0.0, 1.0))


def glow_slab(hs, x, y, z0, z1, w, d, rot=0.0, paint=("glow", "seam"), taper=0.4):
    """A thin glowing slab standing upright (light showing in a gap between towers), narrowing toward its top."""
    ca, sa = math.cos(rot), math.sin(rot)
    pts = []
    for z, s in ((z0, 1.0), (z1, taper)):
        for u, v in ((-w, -d), (w, -d), (w, d), (-w, d)):
            u, v = u * s, v
            pts.append((x + u * ca - v * sa, y + u * sa + v * ca, z))
    hull(hs, pts, paint, GLOW)


def halo(hs, cx, cy, z, r, w, th, seg=36, tilt=(0.0, 0.0), paint=("glow", "hot")):
    """A thin glowing halo ring floating round a spire (the concept's shield pylon): flat band, top and outer edge."""
    def p(a, rr, dz):
        x, y = math.cos(a) * rr, math.sin(a) * rr
        return (cx + x, cy + y, z + dz + x * tilt[0] + y * tilt[1])
    for k in range(seg):
        a0, a1 = k * TAU / seg, (k + 1) * TAU / seg
        am = (a0 + a1) * 0.5
        o0, o1 = hs.v(p(a0, r + w, th)), hs.v(p(a1, r + w, th))
        i0, i1 = hs.v(p(a0, r - w, th)), hs.v(p(a1, r - w, th))
        b0, b1 = hs.v(p(a0, r + w, 0.0)), hs.v(p(a1, r + w, 0.0))
        c0, c1 = hs.v(p(a0, r - w, 0.0)), hs.v(p(a1, r - w, 0.0))
        hs.face((i0, i1, o1, o0), paint, "main", GLOW, outward=(0.0, 0.0, 1.0))
        hs.face((b0, b1, o1, o0), paint, "main", GLOW, outward=(math.cos(am), math.sin(am), 0.0))
        hs.face((c0, c1, b1, b0), paint, "main", GLOW, outward=(0.0, 0.0, -1.0))
        hs.face((c0, c1, i1, i0), paint, "main", GLOW, outward=(-math.cos(am), -math.sin(am), 0.0))


def arc_horn(hs, rng, pts, widths, depth, paint="alloy", mat=ALLOY, plane_y=0.0, sides=6, inner_sharp=0.55, centre=(0.0, 0.5)):
    """A curved blade swept along a path of (x, z) points in a vertical plane at y = plane_y (bottom to top), its
    cross-section a flattened hexagon: `widths` across the curve, `depth` (factor of the width) through the plane, the
    edge facing `centre` (x, z: the inside of the curve) drawn out sharp like a blade. Ends in an apex."""
    path = [Vector((px, plane_y, pz)) for px, pz in pts]
    rings = []
    for k, c in enumerate(path):
        a = path[max(k - 1, 0)]
        b = path[min(k + 1, len(path) - 1)]
        t = (b - a).normalized()
        nrm = Vector((t.z, 0.0, -t.x))  # in-plane normal, turned toward the inside of the curve
        if nrm.dot(Vector((centre[0], plane_y, centre[1])) - c) < 0:
            nrm = -nrm
        bi = Vector((0.0, 1.0, 0.0))
        w = widths[k]
        d = w * depth
        prof = [(1.0 + inner_sharp * 0.6, 0.0), (0.45, 1.0), (-0.45, 1.0), (-1.0, 0.0), (-0.45, -1.0), (0.45, -1.0)] if sides == 6 else \
            [(1.0 + inner_sharp * 0.6, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0)]
        rings.append([tuple(c + nrm * (u * w) + bi * (v * d)) for u, v in prof])
    idx = [[hs.v(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for k in range(len(idx) - 1):
        cen = (path[k] + path[k + 1]) * 0.5
        for i in range(n):
            j = (i + 1) % n
            hs.face((idx[k][i], idx[k][j], idx[k + 1][j], idx[k + 1][i]), paint, "main", mat, center=tuple(cen))
    a, b = path[-2], path[-1]
    apex = b + (b - a).normalized() * widths[-1] * 3.0
    t = hs.v(tuple(apex))
    for i in range(n):
        j = (i + 1) % n
        hs.face((idx[-1][i], idx[-1][j], t), paint, "main", mat, center=tuple(path[-1]))
    return rings, tuple(apex)


# ----------------------------------------------------------------------------
# Natural pieces: spikes, shard clutter, floating cliffs. The rule (user, 24 October: "i want sharp edges and spikey
# mountains", "not sharp and pointy jagged but like steps" about a first draft): every natural form is a knife-edged
# shard ending in a point; no flat caps, ledges or stacked slabs anywhere but the floating cliffs' required flat top.
# ----------------------------------------------------------------------------

def knife(hs, rng, x, y, h, r, z0=SINK, lean=(0.0, 0.0), bend=(0.0, 0.0), rot=None, flank=1, squash=1.0, thick=(.45, .75),
          prof=((0.0, 1.0), (0.3, 0.84), (0.6, 0.6), (0.86, 0.3)), tip=0.0, paint="obs", mat=OBS, seams=(), down=False,
          seam_span=(0, 2), seam_w=0.016, twist=0.0, bevel=0.11):
    """A knife-edged obsidian blade: its cross-section a lens drawn out to two cutting edges along the `rot` axis (each
    edge a narrow bevel facet that catches the light like a real glass edge: tag 'edge'), `flank` corners on each side
    pulled in to `thick` of the radius. Tapers through `prof` to a sharp apex `tip` (−1 … 1) along the long axis.
    Seams take facet indices of the flanks: 1 … flank + 1 on one side, flank + 3 … 2 flank + 3 on the other."""
    rot = rng.uniform(0.0, TAU) if rot is None else rot
    angles, radial = [-bevel, bevel], [rng.uniform(1.0, 1.08)] * 2
    for k in range(flank):
        angles.append(bevel + (k + 1) / (flank + 1) * (math.pi - 2 * bevel) + rng.uniform(-.2, .2))
        radial.append(rng.uniform(*thick))
    angles += [math.pi - bevel, math.pi + bevel]
    radial += [rng.uniform(.9, 1.05)] * 2
    edges = {0, flank + 2}   # facet i joins corners i and i + 1: the two bevels
    for k in range(flank):
        angles.append(math.pi + bevel + (k + 1) / (flank + 1) * (math.pi - 2 * bevel) + rng.uniform(-.2, .2))
        radial.append(rng.uniform(*thick))
    L = abs(h - z0)
    sgn = -1.0 if down else 1.0

    def centre(t):
        return (x + (lean[0] * t + bend[0] * t * t) * L, y + (lean[1] * t + bend[1] * t * t) * L, z0 + sgn * t * L)

    path = [(*centre(t), r * s) for t, s in prof]
    twists = [twist * t for t, _ in prof]
    cx, cy, cz = centre(1.0)
    long_r = r * prof[-1][1] * 0.9
    apex = (cx + math.cos(rot) * long_r * tip, cy + math.sin(rot) * long_r * tip, cz)
    first = len(hs.faces)
    if down:
        rings = shaft(hs, list(reversed(path)), angles, radial, squash, rot, paint, mat, bottom=apex, twists=list(reversed(twists)))
        rings = list(reversed(rings))
    else:
        rings = shaft(hs, path, angles, radial, squash, rot, paint, mat, top=apex, twists=twists)
    # Bevel facets: the edge tag (shaft writes facets ring by ring, corner by corner, then the apex fan).
    n = len(angles)
    for fi in range(first, len(hs.faces)):
        if (fi - first) % n in edges:
            hs.ftag[fi] = "edge"
    for fi in seams:
        seam(hs, rng, rings, apex, fi % n, seam_span, seam_w)
    return rings, apex


def build_spire(rng, idx):
    """Spikes of black glass (the concept's black-glass spires and shattered-field shards): one dominant, stocky knife of
    glass, lesser ones of very different size crowding it, mostly upright, all rooted in a jagged foot of broken
    shards, so a cluster reads as a spiky rock formation (not a tuft); never a ring, never stepped."""
    hs = HS(rng)
    H = rng.uniform(0, TAU)
    BIG = ((0.0, 1.0), (0.25, 0.84), (0.55, 0.56), (0.85, 0.22))

    def at(d, a):
        return d * math.cos(H + a), d * math.sin(H + a)

    def spike(d, a, h, r, ln, flank=2, thick=(.6, .9), **kw):
        x, y = at(d, a)
        out = H + a if d > 0 else H
        return knife(hs, rng, x, y, h, r, lean=(math.cos(out) * ln, math.sin(out) * ln), flank=flank, thick=thick,
                     tip=kw.pop("tip", rng.uniform(-.6, .6)), twist=kw.pop("twist", rng.uniform(-.35, .35)), **kw)

    def foot(count, dmin, dmax, arc=(0, TAU)):
        # The jagged foot: squat broken shards leaning out from the formation's base.
        for _ in range(count):
            a = rng.uniform(*arc)
            spike(rng.uniform(dmin, dmax), a, rng.uniform(.1, .22), rng.uniform(.06, .11), rng.uniform(.25, .6), flank=1,
                  thick=(.5, .8), prof=((0.0, 1.0), (.45, .6), (.8, .25)))

    if idx == 0:
        # The lone fang: one tall, heavy knife with a forked blade grown against it, a broken entourage on one side.
        spike(0, 0, 1.0, .19, .05, prof=BIG, tip=.45, twist=.3, seams=(2,), seam_span=(0, 3))
        spike(.07, 2.0, .66, .12, .12, prof=BIG, tip=-.4)
        spike(.19, 2.6, .42, .1, .2)
        spike(.21, 3.6, .3, .085, .26)
        foot(6, .14, .3)
    elif idx == 1:
        # Twin fangs from one root, leaning a little apart, a third lower between them.
        spike(.07, math.pi, 1.0, .16, .1, prof=BIG, bend=(-math.cos(H) * .04, -math.sin(H) * .04), tip=-.3)
        spike(.08, 0, .82, .15, .14, prof=BIG, tip=.5, seams=(1,), seam_span=(0, 3))
        spike(.1, 1.6, .55, .11, .18, prof=BIG)
        spike(.17, -1.7, .36, .09, .24)
        foot(6, .15, .32)
    elif idx == 2:
        # Shattered field: great slabs of black glass thrust out of the ground at a slant, all leaning one way.
        for d, a, h, r, ln in ((0, 0, 1.0, .19, .32), (.24, 2.0, .72, .15, .38), (.27, -1.9, .52, .14, .44), (.3, 3.0, .34, .11, .5),
                               (.2, -.8, .26, .09, .48)):
            x, y = at(d, a)
            j = rng.uniform(-.2, .2)
            knife(hs, rng, x, y, h, r, lean=(math.cos(H + j) * ln, math.sin(H + j) * ln), flank=2, thick=(.3, .5), rot=H + j,
                  tip=rng.uniform(.6, .95), prof=((0.0, 1.0), (.5, .84), (.85, .45)), seams=(1,) if d == 0 else (), seam_span=(0, 2),
                  twist=rng.uniform(-.15, .15))
        foot(5, .16, .36, arc=(-.8, .8))
    else:
        # A crowd of black-glass spikes of graded size (after the WORLD panel's crystal clusters), lit from the gaps.
        pos = [(0.0, 0.0)]
        heights = [1.0, .8, .66, .56, .46, .38, .3, .24]
        for k in range(1, len(heights)):
            for _ in range(60):
                a, d = rng.uniform(0, TAU), rng.uniform(.1, .2)
                px, py = pos[rng.randrange(len(pos))]
                x, y = px + math.cos(a) * d, py + math.sin(a) * d
                if math.hypot(x, y) < .32 and all(math.hypot(x - qx, y - qy) > .1 for qx, qy in pos):
                    pos.append((x, y))
                    break
        for k, ((x, y), h) in enumerate(zip(pos, heights)):
            out = math.atan2(y, x) if k else H
            ln = .04 if k == 0 else rng.uniform(.08, .28)
            knife(hs, rng, x, y, h, .17 * (.45 + .55 * h), lean=(math.cos(out) * ln, math.sin(out) * ln), flank=2 if h > .5 else 1,
                  thick=(.55, .85), tip=rng.uniform(-.5, .5), twist=rng.uniform(-.35, .35), prof=BIG if h > .5 else ((0.0, 1.0), (.45, .7), (.8, .3)),
                  seams=(1,) if k in (0, 3) else (), seam_span=(0, 2))
        foot(4, .2, .36)
        # Light welling up between the spikes: two short glowing shards low in the crowd.
        for k in (1, 2):
            x, y = (pos[0][0] + pos[k][0]) * .5, (pos[0][1] + pos[k][1]) * .5
            knife(hs, rng, x, y, .2, .028, flank=1, paint=("glow", "hot"), mat=GLOW, prof=((0.0, 1.0), (.6, .6)))
    return hs


def crag(hs, rng, pts, bevel_w=.018, seam=False, tries_pts=None, dissolve=12.0, facets=False):
    """One broken rock mass of black glass: the convex hull of `pts` (big flat facets, hard edges, sharp corners), every
    edge bevelled by bevel_w (the narrow chamfers, tag 'edge', are what catches the light). With `seam`, a thin violet
    crack runs down its biggest steep facet. `facets` (the hills): each facet is written as its own fan of triangles
    painted ("obs", facet id), so a facet shades and colours as one clean plane, never as triangle noise."""
    import bmesh
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:], use_existing_faces=False)
    junk = list(dict.fromkeys(g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)))
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # The hull is all triangles: merge the near-coplanar ones into the rock's real facets first, so only true edges
    # (not triangulation diagonals) get a bevel.
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(dissolve), verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bev = bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel_w, offset_type="OFFSET", segments=1, profile=.5,
                          affect="EDGES", clamp_overlap=True)
    chamfers = set(bev["faces"])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    base = len(hs.verts)
    for v in bm.verts:
        hs.v((v.co.x, v.co.y, v.co.z))
    best = None
    for f in bm.faces:
        n = f.normal
        if facets:
            ids = [base + v.index for v in f.verts]
            gid = len(hs.faces)
            for k in range(1, len(ids) - 1):   # every facet is convex (hull facets, bevel strips and corners)
                hs.face((ids[0], ids[k], ids[k + 1]), ("obs", gid), "edge" if f in chamfers else "main", OBS, outward=tuple(n))
        else:
            hs.face(tuple(base + v.index for v in f.verts), "obs", "edge" if f in chamfers else "main", OBS, outward=tuple(n))
        if seam and f not in chamfers and abs(n.z) < .55 and n.y < .2:
            area = f.calc_area()
            if best is None or area > best[0]:
                best = (area, [v.co.copy() for v in f.verts], n.copy(), f.calc_center_median())
    bm.free()
    if best:
        # A crack down the facet: from near its highest corner toward the far side of its lowest edge, wandering.
        _, corners, n, c = best
        top = max(corners, key=lambda q: q.z)
        low = min(corners, key=lambda q: q.z)
        start, end = top.lerp(c, .3), low.lerp(c, .25)
        steps = 5
        prev = None
        side = n.cross(Vector((0.0, 0.0, 1.0)))
        side = side.normalized() if side.length > 1e-6 else Vector((1.0, 0.0, 0.0))
        for k in range(steps + 1):
            t = k / steps
            p = start.lerp(end, t) + side * rng.uniform(-.03, .03) * math.sin(math.pi * t) + n * .004
            w = .009 * math.sin(math.pi * min(1.0, t * 1.2 + .1))
            l, r = hs.v(tuple(p - side * w)), hs.v(tuple(p + side * w))
            if prev is not None:
                hs.face((prev[0], prev[1], r, l), ("glow", "seam"), "main", GLOW, outward=tuple(n))
            prev = (l, r)


def rock_points(rng, x, y, w, d, h, rot, top="point", lean=(0.0, 0.0), sides=None, shoulder=(.3, .6)):
    """Points for one rock mass: an irregular buried base (w x d), a ring of shoulders pulled in and leaning, and a top
    that is a short point, a broken ridge or a slanted break (never level)."""
    ca, sa = math.cos(rot), math.sin(rot)
    pts = []

    def put(u, v, z):
        lu, lv = lean[0] * max(z, 0.0), lean[1] * max(z, 0.0)
        pts.append((x + (u * ca - v * sa) + lu, y + (u * sa + v * ca) + lv, z))

    n = sides or rng.choice((5, 6, 7))
    a0 = rng.uniform(0, TAU)
    for i in range(n):
        a = a0 + (i + rng.uniform(-.3, .3)) * TAU / n
        r = rng.uniform(.8, 1.05)
        put(math.cos(a) * w * r, math.sin(a) * d * r, SINK)
    m = rng.choice((3, 4, 5))
    for i in range(m):
        a = a0 + (i + rng.uniform(-.35, .35)) * TAU / m + .4
        r = rng.uniform(.55, .9)
        put(math.cos(a) * w * r, math.sin(a) * d * r, h * rng.uniform(*shoulder))
    if top == "point":
        put(rng.uniform(-.25, .25) * w, rng.uniform(-.25, .25) * d, h)
    elif top == "ridge":
        put(-w * rng.uniform(.15, .4), rng.uniform(-.15, .15) * d, h)
        put(w * rng.uniform(.15, .4), rng.uniform(-.15, .15) * d, h * rng.uniform(.72, .88))
    else:  # slant: a broken top, steep enough never to read as a ledge
        put(-w * .3, rng.uniform(-.2, .2) * d, h)
        put(w * .35, d * .3, h * rng.uniform(.6, .7))
        put(w * .2, -d * .35, h * rng.uniform(.55, .68))
    return pts


def steep_enough(pts, stretch=1.6):
    """No facet above the ground that faces nearly straight up (a ledge) once the piece is stretched in height as
    placed in game."""
    import bmesh
    bm = bmesh.new()
    for p in pts:
        bm.verts.new((p[0], p[1], p[2] * stretch))
    bmesh.ops.convex_hull(bm, input=bm.verts[:], use_existing_faces=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ok = all(not (f.normal.z > .8 and f.calc_center_median().z > .05) for f in bm.faces)
    bm.free()
    return ok


def build_peak(rng, idx):
    """Sharp rocks (user, 24 October, about a forest of blade peaks: "the spikes are too small and pointy, should more look
    like sharp rocks"; after the concept's black jagged rock formations, top-left world panel and abyssal ridges): crags
    of black glass fused from a few broad, heavy rock masses, each a convex break of big flat glossy facets and hard
    edges, high-shouldered with a short point or a broken crest, no needles, no ledges, no smooth faces; a broken block
    or two at the foot. Narrow bevels on every true edge are all that catches the light; at most one thin violet crack.
    Authored about 1.8 wide and 1 high: placed with its height 0.8-1.2 times its width (1.5-2.2 x the footprint
    scale). Variants: a great crag with buttresses, twin horns, a heap of broken blocks, a long ridge crag."""
    hs = HS(rng)
    H = rng.uniform(0, TAU)

    def mass(x, y, w, d, h, rot=None, top="point", lean=(0.0, 0.0), seam=False, shoulder=(.45, .72)):
        rot = rng.uniform(0, TAU) if rot is None else rot
        for _ in range(40):
            pts = rock_points(rng, x, y, w, d, h, rot, top, lean, shoulder=shoulder)
            if steep_enough(pts):
                break
        crag(hs, rng, pts, bevel_w=max(.006, .014 * min(w, h)), seam=seam)

    def blocks(count, rmin, rmax):
        a0 = rng.uniform(0, TAU)
        for k in range(count):
            a = a0 + (k + rng.uniform(-.3, .3)) * TAU / count
            d = rng.uniform(rmin, rmax)
            s_ = rng.uniform(.18, .26)
            mass(math.cos(a) * d, math.sin(a) * d * .85, s_, s_ * rng.uniform(.75, 1.0), s_ * rng.uniform(.9, 1.3),
                 top=rng.choice(("point", "slant", "ridge")), lean=(math.cos(a) * .1, math.sin(a) * .1), shoulder=(.4, .65))

    def out(a, k):
        return (math.cos(H + a) * k, math.sin(H + a) * k)

    if idx == 0:
        # A great crag: one heavy, high-shouldered mass rising to a short off-centre point, two buttresses against it.
        mass(0.0, 0.0, .62, .54, 1.0, rot=H, top="point", lean=out(0, .06), seam=True)
        mass(*out(2.2, .5), .42, .38, .62, top="slant", lean=out(2.2, .1))
        mass(*out(-2.5, .48), .38, .34, .5, top="ridge", lean=out(-2.5, .1))
        mass(*out(.9, .5), .3, .28, .38, top="slant", lean=out(.9, .12))
        blocks(2, .72, .82)
    elif idx == 1:
        # Twin horns: two heavy masses leaning a little apart, their points at different heights, a block between.
        mass(-.38, 0.0, .48, .46, 1.0, rot=H, top="point", lean=(-.08, .0), seam=True)
        mass(.4, .04, .46, .42, .82, top="point", lean=(.1, .02))
        mass(0.02, -.2, .36, .3, .45, top="slant")
        mass(.06, .26, .32, .28, .4, top="ridge")
        blocks(2, .72, .84)
    elif idx == 2:
        # A heap of broken blocks: big angular masses piled, the tallest snapped off on a steep slant.
        mass(.05, .05, .5, .46, 1.0, top="slant", seam=True)
        mass(*out(1.0, .5), .42, .38, .64, top="ridge")
        mass(*out(3.4, .52), .4, .36, .56, top="point")
        mass(*out(-1.5, .48), .34, .32, .42, top="slant")
        blocks(1, .74, .8)
    else:
        # A long ridge crag: a heavy ridge along x with a broken crest, a lower mass and fragments at its flanks.
        mass(-.22, 0.0, .66, .44, 1.0, rot=0.0, top="ridge", seam=True)
        mass(.5, .06, .42, .38, .72, rot=rng.uniform(-.3, .3), top="point", lean=(.08, 0.0))
        mass(-.74, -.08, .3, .3, .46, top="slant", lean=(-.1, 0.0))
        blocks(2, .62, .82)
    return hs


def cut_solid(hs, rng, planes, box=(-1.75, 1.75, -1.55, 1.55, SINK, 1.4), bevel_w=.005, seam=False, shift=(0.0, 0.0, 0.0),
              cracks=(), bottom=SINK, bevel_front=None):
    """A convex landform cut from a block by planes [(point, outward normal)]: every cut leaves one large, exactly
    planar facet, the cuts meet in hard straight edges (a thin flat bevel on each, tag 'edge', catches the light by
    its orientation). Facets are written as fans painted ("obs", facet id): each shades and colours as one plane.
    `cracks` [(point, normal, glow)]: faces lying on those planes are fracture faces (dark, tag 'crack'; or a faint violet
    glow); `shift` moves the finished piece (a slab broken off and shifted along its fracture)."""
    import bmesh
    x0, x1, y0, y1, z0, z1 = box
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((x0 + (v.co.x + .5) * (x1 - x0), y0 + (v.co.y + .5) * (y1 - y0), z0 + (v.co.z + .5) * (z1 - z0)))
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vector(co), plane_no=Vector(no).normalized(),
                               clear_outer=True)
        bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
        if len(bm.verts) < 4:
            bm.free()
            return
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.0), verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    chamfers = set()
    if bevel_w > 0:
        edges = bm.edges[:]
        if bevel_front is not None:
            # Only the sharp edges on the side that faces the canyon (cheaper: the back is never seen).
            edges = [e for e in edges if len(e.link_faces) == 2 and (e.verts[0].co.y + e.verts[1].co.y) * .5 < bevel_front and
                     e.link_faces[0].normal.angle(e.link_faces[1].normal) > math.radians(20)]
        if edges:
            vs = list({v for e in edges for v in e.verts})
            bev = bmesh.ops.bevel(bm, geom=edges + vs, offset=bevel_w, offset_type="OFFSET", segments=1, profile=.5,
                                  affect="EDGES", clamp_overlap=True)
            chamfers = set(bev["faces"])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    base = len(hs.verts)
    sh = Vector(shift)
    for v in bm.verts:
        hs.v(tuple(v.co + sh))
    best = None
    for f in bm.faces:
        n = f.normal
        c = f.calc_center_median()
        if n.z < -.99 and c.z < bottom + 1e-4:
            continue   # the buried bottom
        ids = [base + v.index for v in f.verts]
        gid = len(hs.faces)
        crack = None
        for co, no, glow in cracks:
            nv = Vector(no).normalized()
            if f not in chamfers and abs((c - Vector(co)).dot(nv)) < 1e-4 and abs(n.dot(nv)) > .999:
                crack = glow
        for k in range(1, len(ids) - 1):
            tri = (ids[0], ids[k], ids[k + 1])
            pa, pb, pc = (Vector(hs.verts[i]) for i in tri)
            cr = (pb - pa).cross(pc - pa)
            if cr.length < 1e-6 or abs(cr.normalized().dot(n)) < .9:
                continue   # cuts leave collinear corners on some facets: their fan slivers have (next to) no area
            if crack is True:
                hs.face(tri, ("glow", "faint"), "main", GLOW, outward=tuple(n))
            elif crack is False:
                hs.face(tri, ("obs", gid), "crack", OBS, outward=tuple(n))
            else:
                hs.face(tri, ("obs", gid), "edge" if f in chamfers else "main", OBS, outward=tuple(n))
        if crack is not None:
            continue
        if seam and f not in chamfers and .25 < n.z < .8 and n.y < .1:
            area = f.calc_area()
            if best is None or area > best[0]:
                best = (area, [v.co + sh for v in f.verts], n.copy(), f.calc_center_median() + sh)
    bm.free()
    if best:
        # A fault crack of light across the biggest facet that looks toward the camera.
        _, corners, n, c = best
        top = max(corners, key=lambda q: q.z)
        low = min(corners, key=lambda q: q.z)
        start, end = top.lerp(c, .35), low.lerp(c, .35)
        side = n.cross(Vector((0.0, 0.0, 1.0)))
        side = side.normalized() if side.length > 1e-6 else Vector((1.0, 0.0, 0.0))
        prev = None
        for k in range(7):
            t = k / 6
            p = start.lerp(end, t) + side * rng.uniform(-.05, .05) * math.sin(math.pi * t) + n * .004
            w = .008 * math.sin(math.pi * min(1.0, t * 1.15 + .08))
            l, r = hs.v(tuple(p - side * w)), hs.v(tuple(p + side * w))
            if prev is not None:
                hs.face((prev[0], prev[1], r, l), ("glow", "seam"), "main", GLOW, outward=tuple(n))
            prev = (l, r)


def fractured(hs, rng, planes, fracs, glow=(), **kw):
    """A solid (cut_solid's planes) broken along fracture planes `fracs` [(point, normal, gap, drop, slide)]: every piece
    on the far side of a fracture is shifted off it by `gap`, sunk by `drop` and slid along it by `slide` (broken off
    and shifted), so each crack shows as a dark groove between sharp edges; fractures listed in `glow` glow faintly."""
    k = len(fracs)
    cracks = [(co, no, i in glow) for i, (co, no, *_rest) in enumerate(fracs)]
    for mask in range(2 ** k):
        extra, shift = [], Vector((0.0, 0.0, 0.0))
        for i, (co, no, gap, drop, slide) in enumerate(fracs):
            nv = Vector(no).normalized()
            if mask >> i & 1:
                extra.append((co, tuple(-nv)))
                along = nv.cross(Vector((0.0, 0.0, 1.0)))
                along = along.normalized() if along.length > 1e-6 else Vector((1.0, 0.0, 0.0))
                shift += nv * gap + Vector((0.0, 0.0, -drop)) + along * slide
            else:
                extra.append((co, tuple(nv)))
        shift.z = max(shift.z, -.05)   # (a piece beyond two cracks sinks no deeper than one: base −0.1 − 0.05)
        cut_solid(hs, rng, list(planes) + extra, shift=tuple(shift), cracks=cracks, **kw)


def frac(az, slope, through, gap=.02, drop=.0, slide=.0):
    """A fracture plane for `fractured` (az/slope as face_plane: slope 90 is a vertical crack)."""
    co, no = face_plane(az, slope, through)
    return (co, no, gap, min(drop, .05), slide)   # (a sunk piece never passes the contract's base: −0.1 − 0.05)


def face_plane(az, slope, through):
    """A cutting plane through `through` whose kept side faces outward toward azimuth `az` (degrees, Blender x = 0,
    +y = 90: away from the camera) and slopes `slope` degrees from horizontal (90: a sheer wall; over 90 overhangs)."""
    a, t = math.radians(az), math.radians(slope)
    return (through, (math.cos(a) * math.sin(t), math.sin(a) * math.sin(t), math.cos(t)))


def build_hill(rng, idx):
    """Obsidian hills (integrator, 24 October: heightfield hills read rounded and "so many triangles"; the user wants them
    "sharp", "more varied", and "less spikey as a vibe and more cracked and sharp"): large FRACTURED massifs of black
    glass. Each is one to three convex solids cut from a block by a handful of planes (every face one large clean
    plane, hard straight edges, a thin flat bevel on each edge catching the light by its orientation), then broken
    along steep fracture planes into slabs shifted against each other: each crack a dark groove between razor edges, a
    few glowing faintly violet. No needles, no spikes, no rounding, no triangle noise. Eight forms: a fractured peak
    with a long shoulder, a cracked knife ridge, a split mesa with a tilted top beside a broken butte, fused summits, a
    slab broken loose and lifted at one edge, a low cracked shield with one sharp crest, a stepped double ridge, a
    massif split by a deep notch. Authored about 3 wide (x) by 2.6 deep and 1 high; placed at scale 2-4, height
    1.5-4.2. Satin gloss on the big faces (the edges stay glossy)."""
    hs = HS(rng)
    J = lambda d: rng.uniform(-d, d)  # noqa: E731

    def summit(cx, cy, h, slopes, azs, foot):
        # The planes of a summit: faces all round through points just below it, each its own slope, a sheer foot ring
        # limiting the spread, a chip off one edge (no perfect pyramid).
        planes = []
        for az, sl in zip(azs, slopes):
            d = rng.uniform(0, .06)
            planes.append(face_plane(az, sl, (cx + math.cos(math.radians(az)) * d, cy + math.sin(math.radians(az)) * d, h)))
        for k in range(6):
            az = k * 60 + J(12)
            planes.append(face_plane(az, 82, (cx + math.cos(math.radians(az)) * foot, cy + math.sin(math.radians(az)) * foot * .9, 0.0)))
        az = azs[rng.randrange(len(azs))] + rng.choice((-1, 1)) * rng.uniform(25, 40)
        planes.append(face_plane(az, rng.uniform(32, 42), (cx + math.cos(math.radians(az)) * .32, cy + math.sin(math.radians(az)) * .32, h * .62)))
        return planes

    def crack(cx, cy, az, slope=None, gap=None, drop=None, slide=None):
        g = gap if gap is not None else rng.uniform(.012, .03)
        return frac(az, slope if slope is not None else rng.uniform(64, 86), (cx, cy, .5), g * 1.6 + .006,
                    drop if drop is not None else rng.uniform(.0, .05), slide if slide is not None else J(.025))

    if idx == 0:
        # A fractured peak, a long cracked shoulder sloping away along +x.
        fractured(hs, rng, summit(-.45, .02, 1.0, (52, 58, 47, 61, 44), (95 + J(10), 160 + J(10), 215 + J(10), 280 + J(10), 345 + J(10)), 1.1),
                  [crack(-.32, -.05, -65 + J(10), gap=.03, drop=.06), crack(-.7, .2, 160 + J(10), gap=.016)], glow=(0,))
        fractured(hs, rng, [face_plane(-90 + J(6), 48, (.4, -.02, .5)), face_plane(90 + J(6), 52, (.4, .04, .5)),
                            face_plane(0, 21, (-.2, 0.0, .62)), face_plane(-35, 40, (1.0, -.3, .12)), face_plane(35, 42, (1.0, .3, .12)),
                            face_plane(0, 70, (1.45, 0.0, 0.0))],
                  [crack(.55, 0.0, 15 + J(15), gap=.022, drop=.04), crack(.2, .1, 100 + J(15), gap=.014, drop=.02)])
    elif idx == 1:
        # A knife ridge along x, broken across into three blocks that have slipped against each other.
        fractured(hs, rng, [face_plane(-90, 58, (0.0, -.02, 1.0)), face_plane(90, 63, (0.0, .02, 1.0)),
                            face_plane(0, 24, (.12, 0.0, 1.0)), face_plane(180, 30, (-.08, 0.0, 1.0)),
                            face_plane(-12, 9, (.7, 0.0, .78)), face_plane(195, 14, (-.75, 0.0, .8)),
                            face_plane(0, 66, (1.4, 0.0, 0.0)), face_plane(180, 62, (-1.4, 0.0, 0.0)),
                            face_plane(-60, 55, (.9, -.4, .3)), face_plane(125, 50, (-.9, .45, .32))],
                  [crack(.38, 0.0, 8 + J(10), slope=78, gap=.028, drop=.07), crack(-.5, 0.0, 172 + J(10), slope=72, gap=.02, drop=.03)])
    elif idx == 2:
        # A mesa with one big tilted top, split through by a crack (the far block sunk a little); a broken butte beside.
        walls = [face_plane(k * 51.4 + J(10), rng.uniform(72, 80), (-.3 + math.cos(math.radians(k * 51.4)) * .95,
                                                                     .05 + math.sin(math.radians(k * 51.4)) * .88, 0.0)) for k in range(7)]
        fractured(hs, rng, walls + [face_plane(200, 9, (-.3, .05, .92))], [crack(-.15, .05, 20 + J(10), slope=84, gap=.03, drop=.08)], glow=(0,))
        fractured(hs, rng, [face_plane(k * 72 + J(10), 76, (.95 + math.cos(math.radians(k * 72)) * .3, -.45 + math.sin(math.radians(k * 72)) * .26, 0.0))
                            for k in range(5)] + [face_plane(160, 12, (.95, -.45, .5))], [crack(.95, -.45, 100 + J(20), gap=.018, drop=.05)])
    elif idx == 3:
        # Fused summits of three heights, the tallest cracked through.
        fractured(hs, rng, summit(-.5, .15, 1.0, (55, 50, 60, 47), (40 + J(10), 135 + J(10), 220 + J(10), 310 + J(10)), .95),
                  [crack(-.45, .1, -40 + J(10), gap=.025, drop=.05), crack(-.65, .3, 120 + J(10), gap=.014)], glow=(1,))
        fractured(hs, rng, summit(.5, -.2, .8, (52, 57, 46, 55), (10 + J(10), 100 + J(10), 200 + J(10), 280 + J(10)), .85),
                  [crack(.55, -.25, 75 + J(15), gap=.016)])
        fractured(hs, rng, summit(.15, .62, .6, (50, 45, 55), (60 + J(10), 170 + J(10), 300 + J(10)), .7), [])
    elif idx == 4:
        # A slab of glass broken loose and lifted at one edge, itself cracked across, its raised edge a broken overhang.
        fractured(hs, rng, [face_plane(180, 26, (0.0, 0.0, .5)), face_plane(0, 180 - 26, (0.0, 0.0, .5 - .34)),
                            face_plane(-90, 84, (0.0, -1.05, 0.0)), face_plane(90, 80, (0.0, 1.0, 0.0)),
                            face_plane(8, 104, (1.02, .3, .7)), face_plane(-14, 98, (1.0, -.45, .7)),
                            face_plane(180, 70, (-1.5, 0.0, 0.0))],
                  [crack(.25, .0, 12 + J(10), slope=70, gap=.03, drop=.06), crack(-.4, .25, 105 + J(10), slope=80, gap=.018, drop=.02)], glow=(1,))
        fractured(hs, rng, [face_plane(k * 90 + J(15), 70, (1.15 + math.cos(math.radians(k * 90)) * .25, .55 + math.sin(math.radians(k * 90)) * .22, 0.0))
                            for k in range(4)] + [face_plane(150, 35, (1.15, .55, .32))], [])
    elif idx == 5:
        # A low, wide shield of broad shallow facets cracked into plates, one sharp crest rising out of it.
        fractured(hs, rng, [face_plane(k * 45 + J(10), rng.uniform(17, 25), (0.0, 0.0, .52)) for k in range(8)] +
                  [face_plane(k * 60 + J(10), 80, (math.cos(math.radians(k * 60)) * 1.45, math.sin(math.radians(k * 60)) * 1.25, 0.0)) for k in range(6)],
                  [crack(-.35, -.2, -30 + J(10), gap=.02, drop=.03), crack(.5, .3, 60 + J(10), gap=.016, drop=.02), crack(.1, -.6, -110 + J(10), gap=.014)],
                  glow=(2,))
        fractured(hs, rng, [face_plane(-80, 57, (.05, -.02, 1.0)), face_plane(100, 60, (.05, .02, 1.0)),
                            face_plane(10, 38, (.35, 0.0, 1.0)), face_plane(190, 33, (-.3, 0.0, 1.0)),
                            face_plane(0, 75, (.9, 0.0, 0.0)), face_plane(180, 75, (-.85, 0.0, 0.0))], [])
    elif idx == 6:
        # A stepped double ridge, both ridges cracked across at different places.
        fractured(hs, rng, [face_plane(-90, 52, (0.0, -.55, .6)), face_plane(90, 64, (0.0, -.5, .6)),
                            face_plane(5, 18, (.0, -.5, .6)), face_plane(185, 22, (-.1, -.5, .6)),
                            face_plane(0, 62, (1.35, 0.0, 0.0)), face_plane(180, 62, (-1.35, 0.0, 0.0))],
                  [crack(.3, -.5, 5 + J(10), gap=.024, drop=.05), crack(-.6, -.5, 170 + J(10), gap=.016, drop=.03)])
        fractured(hs, rng, [face_plane(-90, 50, (0.0, .35, 1.0)), face_plane(90, 60, (0.0, .4, 1.0)),
                            face_plane(-8, 26, (.25, .38, 1.0)), face_plane(175, 18, (.1, .38, 1.0)),
                            face_plane(0, 60, (1.3, .4, 0.0)), face_plane(180, 64, (-1.3, .4, 0.0))],
                  [crack(-.45, .4, 170 + J(10), gap=.028, drop=.06), crack(.7, .4, 12 + J(10), gap=.016)], glow=(0,))
    else:
        # A massif split by a deep notch, each half cracked again.
        fractured(hs, rng, [face_plane(-10, 66, (-.12, 0.0, .36)), face_plane(150, 45, (-.75, .05, .92)), face_plane(215, 52, (-.75, .05, .92)),
                            face_plane(75, 58, (-.7, .05, .92)), face_plane(-75, 50, (-.7, .05, .92)), face_plane(180, 80, (-1.45, 0.0, 0.0))],
                  [crack(-.85, .0, 200 + J(10), gap=.024, drop=.05), crack(-.5, -.3, -70 + J(10), gap=.016, drop=.02)])
        fractured(hs, rng, [face_plane(190, 64, (.12, 0.0, .34)), face_plane(30, 47, (.8, .1, 1.0)), face_plane(-35, 55, (.8, .1, 1.0)),
                            face_plane(105, 60, (.78, .1, 1.0)), face_plane(-100, 52, (.78, .1, 1.0)), face_plane(0, 80, (1.45, 0.0, 0.0))],
                  [crack(.6, -.1, -50 + J(10), gap=.02, drop=.04)], glow=(0,))
    return hs


def build_shards(rng, idx):
    """Small obsidian shard clutter: two to five slivers of black glass at real size, leaning every way."""
    hs = HS(rng)
    count = (3, 4, 6)[idx]
    placed = []
    for k in range(count):
        for _ in range(30):
            x, y = rng.uniform(-.26, .26), rng.uniform(-.22, .22)
            if all(math.hypot(x - qx, y - qy) > .09 for qx, qy in placed):
                break
        placed.append((x, y))
        h = rng.uniform(.12, .32) if k else .36
        a = rng.uniform(0, TAU)
        ln = rng.uniform(.2, .75)
        knife(hs, rng, x, y, h, rng.uniform(.035, .06), lean=(math.cos(a) * ln, math.sin(a) * ln), flank=1,
              tip=rng.uniform(-.7, .7), prof=((0.0, 1.0), (.55, .62)), twist=rng.uniform(-.3, .3))
    if idx == 2:
        x, y = placed[0][0] + .05, placed[0][1] - .04
        knife(hs, rng, x, y, .12, .02, flank=1, paint=("glow", "hot"), mat=GLOW, prof=((0.0, 1.0), (.6, .6)))
    return hs


def split_polygon(poly, cuts):
    """The polygon (x, y) cut into plates by straight lines (point, direction): each plate a list of points."""
    import bmesh
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0.0)) for x, y in poly]
    bm.faces.new(vs)
    for (px, py), (dx, dy) in cuts:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(px, py, 0.0), plane_no=(-dy, dx, 0.0))
    plates = [[(v.co.x, v.co.y) for v in f.verts] for f in bm.faces]
    bm.free()
    return plates


def build_float(rng, idx):
    """A floating cliff (the concept's floating cliffs and the crescent dock's underside): a flat plate of black glass on
    a rim of vertical blade facets, and under it a hanging mass of long pointed spikes, the deepest at the bottom, the
    outer ones leaning out so they show past the rim from above. Base-centre convention: y = 0 at the lowest spike tip,
    the flat top at exactly 1."""
    hs = HS(rng)
    n = (13, 15, 11)[idx]
    R = (.8, .86, .64)[idx]
    sy = (.78, .7, .9)[idx]
    top, slab = 1.0, (.26, .23, .28)[idx]
    outline = []
    for k in range(n):
        a = k * TAU / n + rng.uniform(-.16, .16)
        rr = R * rng.uniform(.8, 1.04) * (.84 if k % 3 == 1 else 1.0)
        outline.append((math.cos(a) * rr, math.sin(a) * rr * sy))
    # The top: a few plates of black glass, split along straight fractures (each its own depth of black).
    cuts = []
    for k in range((2, 3, 2)[idx]):
        # Chords off the centre (cracks that run across the plate, never a star through its middle).
        a = rng.uniform(0, TAU)
        d = rng.uniform(.18, .42) * R
        tilt = a + math.pi / 2 + rng.uniform(-.5, .5)
        cuts.append(((math.cos(a) * d, math.sin(a) * d * sy), (math.cos(tilt), math.sin(tilt))))
    # Energy faults (the concept's luminous fractures): the plates stand a hair apart along every fracture, over a sheet
    # of dim violet light just under the surface that shows only in those gaps; the top stays exactly flat at 1.
    gap = .009
    for plate in split_polygon(outline, cuts):
        pcx, pcy = sum(p[0] for p in plate) / len(plate), sum(p[1] for p in plate) / len(plate)
        moved = []
        for x, y in plate:
            for (px, py), (dx, dy) in cuts:
                nx, ny = -dy, dx
                if abs((x - px) * nx + (y - py) * ny) < 1e-5:
                    side = 1.0 if (pcx - px) * nx + (pcy - py) * ny > 0 else -1.0
                    x, y = x + nx * side * gap, y + ny * side * gap
            moved.append((x, y))
        hs.face(tuple(hs.v((x, y, top)) for x, y in moved), "obs", "top", OBS, outward=(0.0, 0.0, 1.0))
    hs.face(tuple(hs.v((x * .995, y * .995, top - .012)) for x, y in outline), ("glow", "dim"), "main", GLOW, outward=(0.0, 0.0, 1.0))
    # The rim: blade facets straight down from the plate's edge, each vertex dropping to its own point (a jagged,
    # pointed lower edge: no ledge), closed underneath by a face nobody sees.
    t_idx = [hs.v((x, y, top)) for x, y in outline]
    teeth = []
    for k, (x, y) in enumerate(outline):
        drop = slab * (rng.uniform(1.1, 2.0) if rng.random() < .45 else rng.uniform(.55, .95))
        teeth.append(hs.v((x * .96, y * .96, top - drop)))
    for i in range(n):
        j = (i + 1) % n
        mx, my = (outline[i][0] + outline[j][0]) * .5, (outline[i][1] + outline[j][1]) * .5
        hs.face((t_idx[i], t_idx[j], teeth[j], teeth[i]), "obs", "main", OBS, outward=(mx, my, 0.0))
    under = [hs.v((x * .7, y * .7, top - slab * .9)) for x, y in outline]
    for i in range(n):
        j = (i + 1) % n
        mx, my = (outline[i][0] + outline[j][0]) * .5, (outline[i][1] + outline[j][1]) * .5
        hs.face((teeth[i], teeth[j], under[j], under[i]), "obs", "under", OBS, outward=(mx, my, -1.0))
    hs.face(tuple(reversed(under)), "obs", "under", OBS, outward=(0.0, 0.0, -1.0))
    # The hanging spikes: the great keel reaching the bottom (z 0), long ones round it, shorter ones at the rim.
    z0 = top - slab * .75
    big = (rng.uniform(-.1, .1) * R, rng.uniform(-.1, .1) * R * sy)
    knife(hs, rng, big[0], big[1], 0.0, R * .5, z0=z0, down=True, flank=2, thick=(.6, .85), squash=sy, tip=rng.uniform(-.3, .3),
          lean=(rng.uniform(-.06, .06), rng.uniform(-.06, .06)), prof=((0.0, 1.0), (.25, .62), (.55, .32), (.85, .12)),
          seams=(1, 5), seam_span=(0, 3), twist=.3)
    count = (9, 11, 7)[idx]
    a0 = rng.uniform(0, TAU)
    for k in range(count):
        a = a0 + k * TAU / count + rng.uniform(-.3, .3)
        d = rng.uniform(.32, .6) * R
        x, y = math.cos(a) * d, math.sin(a) * d * sy
        depth = z0 * rng.uniform(.4, .85)
        out = rng.uniform(.05, .22)
        knife(hs, rng, x, y, z0 - depth, R * rng.uniform(.14, .22), z0=z0, down=True, flank=rng.choice((1, 2)),
              tip=rng.uniform(-.5, .5), lean=(math.cos(a) * out, math.sin(a) * out), prof=((0.0, 1.0), (.35, .62), (.7, .26)),
              seams=(1,) if k in (1, 5) else (), twist=rng.uniform(-.3, .3))
    for k in range(n):
        if rng.random() < .8:
            x, y = outline[k][0] * .78, outline[k][1] * .78
            a = math.atan2(y, x)
            out = rng.uniform(.25, .5)
            knife(hs, rng, x, y, top - slab - rng.uniform(.2, .55), R * rng.uniform(.08, .13), z0=top - slab * .6, down=True, flank=1,
                  tip=rng.uniform(-.5, .5), lean=(math.cos(a) * out, math.sin(a) * out), prof=((0.0, 1.0), (.45, .55), (.8, .2)),
                  twist=rng.uniform(-.3, .3))
    return hs


# ----------------------------------------------------------------------------
# Infrastructure (the builders' black structures). Second pass (user, 24 October: "the infra models look kinda flat and
# bland"), after the concept's INFRASTRUCTURE row: stepped round bases in several tiers with light in the riser grooves,
# clusters of chamfered towers and fins of different heights round a tall centre, deep slits of light between them,
# thick bevelled horn arcs, rings with a real cross-section, layered claws, many small sharp secondary spikes.
# ----------------------------------------------------------------------------

def tower(hs, rng, x, y, h, r, rot, flank=2, tip=.6, z0=0.06, seams=(), seam_span=(0, 2), lean=(0.0, 0.0), thick=(.55, .8)):
    """A pointed alloy spire: a tall blade-sectioned prism, nearly straight-sided, ending in a knife point."""
    return knife(hs, rng, x, y, h, r, z0=z0, rot=rot, flank=flank, thick=thick, tip=tip, paint="alloy", mat=ALLOY,
                 prof=((0.0, 1.0), (.5, .9), (.82, .7)), seams=seams, seam_span=seam_span, lean=lean, seam_w=.018,
                 bevel=min(.11, .01 / max(r, .01)))


def bprism(hs, poly, z0, z1, slope=(0.0, 0.0), bev=.007, paint="alloy", mat=ALLOY):
    """A vertical alloy prism over a convex (x, y) polygon, every vertical edge bevelled (a narrow facet, tag 'edge'), its
    top a plane sloping by `slope` (dz per unit x, y from the centre) so no tower top is level."""
    if kit.poly_area(poly) < 0:
        poly = list(reversed(poly))
    n = len(poly)
    cx, cy = sum(p[0] for p in poly) / n, sum(p[1] for p in poly) / n
    pts = []
    for i in range(n):
        p, a, b = Vector(poly[i]), Vector(poly[i - 1]), Vector(poly[(i + 1) % n])
        pts.append(tuple(p + (a - p).normalized() * bev))
        pts.append(tuple(p + (b - p).normalized() * bev))
    m = len(pts)

    def ztop(x, y):
        return z1 + slope[0] * (x - cx) + slope[1] * (y - cy)
    lo = [hs.v((x, y, z0)) for x, y in pts]
    hi = [hs.v((x, y, ztop(x, y))) for x, y in pts]
    for i in range(m):
        j = (i + 1) % m
        mx, my = (pts[i][0] + pts[j][0]) * .5 - cx, (pts[i][1] + pts[j][1]) * .5 - cy
        hs.face((lo[i], lo[j], hi[j], hi[i]), paint, "edge" if i % 2 == 0 else "main", mat, outward=(mx, my, 0.0))
    hs.face(tuple(hi), paint, "top", mat, outward=(0.0, 0.0, 1.0))
    return ztop


def ngon(cx, cy, rx, ry, n, rot=0.0, jitter=0.0, rng=None):
    out = []
    for k in range(n):
        a = rot + k * TAU / n + (rng.uniform(-jitter, jitter) if rng else 0.0)
        out.append((cx + math.cos(a) * rx, cy + math.sin(a) * ry))
    return out


def stepped_tower(hs, rng, x, y, h, w, rot, z0, slit=False, steps=2, n=6):
    """A monolith tower (after the concept's chamfered black towers): bevelled prisms stacked in one or two narrowing
    steps, each topped by a steep slanted cut, a slit of light up its front when `slit`."""
    ca, sa = math.cos(rot), math.sin(rot)
    d = w * rng.uniform(.55, .8)
    zs = [z0] + sorted(rng.uniform(.45, .8) * h for _ in range(steps - 1)) + [h]
    first = None
    for k in range(steps):
        s = 1.0 - .22 * k
        local = ngon(0, 0, w * s, d * s, n, rot=.5, jitter=.12, rng=rng)
        first = first or local
        poly = [(x + (u * ca - v * sa), y + (u * sa + v * ca)) for u, v in local]
        cut = rng.uniform(.5, .9) * rng.choice((-1, 1))
        bprism(hs, poly, zs[k] - (.01 if k else 0), zs[k + 1], slope=(ca * cut * (1 if k == steps - 1 else .35), sa * cut * (1 if k == steps - 1 else .35)),
               bev=min(.008, w * .12))
        # A cut-block joint round the step: a thin dark groove where two blocks are laid one on the other.
        if zs[k + 1] - zs[k] > .12:
            zj = zs[k] + (zs[k + 1] - zs[k]) * rng.uniform(.3, .6)
            pc = (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))
            for i in range(len(poly)):
                (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % len(poly)]
                ex, ey = x1 - x0, y1 - y0
                el = math.hypot(ex, ey) or 1.0
                nx, ny = ey / el, -ex / el
                if nx * ((x0 + x1) * .5 - pc[0]) + ny * ((y0 + y1) * .5 - pc[1]) < 0:
                    nx, ny = -nx, -ny
                o = .0015
                q = [(x0 + nx * o, y0 + ny * o, zj), (x1 + nx * o, y1 + ny * o, zj), (x1 + nx * o, y1 + ny * o, zj + .005), (x0 + nx * o, y0 + ny * o, zj + .005)]
                hs.face(tuple(hs.v(p) for p in q), "alloy", "crack", ALLOY, outward=(nx, ny, 0.0))
    if slit:
        # A slit of light up the facet that looks most outward (local -v), from near the foot to under the first step.
        m = len(first)
        i = min(range(m), key=lambda i: first[i][1] + first[(i + 1) % m][1])
        (u0, v0), (u1, v1) = first[i], first[(i + 1) % m]
        mu, mv = (u0 + u1) * .5, (v0 + v1) * .5
        eu, ev = (u1 - u0), (v1 - v0)
        el = math.hypot(eu, ev) or 1.0
        nu, nv = ev / el, -eu / el
        if nu * mu + nv * mv < 0:
            nu, nv = -nu, -nv
        def wp(u, v):
            return (x + (u * ca - v * sa), y + (u * sa + v * ca))
        top = (zs[1] if steps > 1 else h) * .92
        q = []
        for (du, z) in ((-.006, z0 + .03), (.006, z0 + .03), (.004, top), (-.004, top)):
            px, py = wp(mu + eu / el * du + nu * .002, mv + ev / el * du + nv * .002)
            q.append((px, py, z))
        ox, oy = wp(nu, nv)
        hs.face(tuple(hs.v(p) for p in q), ("glow", "seam"), "main", GLOW, outward=(ox - x, oy - y, 0.0))


def glow_band(hs, cx, cy, r, z0, z1, a0, a1, seg, sy=1.0, paint=("glow", "seam")):
    """A vertical band of light round a riser (the light in the groove at the foot of a tier)."""
    for k in range(seg):
        t0, t1 = a0 + (a1 - a0) * k / seg, a0 + (a1 - a0) * (k + 1) / seg
        q = [(cx + math.cos(t) * r, cy + math.sin(t) * r * sy, z) for t, z in ((t0, z0), (t1, z0), (t1, z1), (t0, z1))]
        tm = (t0 + t1) * .5
        hs.face(tuple(hs.v(p) for p in q), paint, "main", GLOW, outward=(math.cos(tm), math.sin(tm) / sy, 0.0))


def stone_joints(hs, rng, cx, cy, r, z0, z1, seg, rot, sy=1.0, count=None, inner=.62):
    """Cut-block joints on a faceted tier (worked stone, user 24 October: "stoney/sharp/clean not just smooth"): thin
    dark grooves down the riser and across the top at some of its facets, as between laid blocks."""
    count = count or max(3, seg // 3)
    ap = r * math.cos(math.pi / seg)
    for i in sorted(rng.sample(range(seg), min(count, seg))):
        a = rot + (i + .5) * TAU / seg
        ca, sa = math.cos(a), math.sin(a)
        tx, ty = -sa * .0035, ca * .0035 * sy
        ox, oy = cx + ca * (ap + .0015), cy + sa * (ap + .0015) * sy
        q = [(ox - tx, oy - ty, z0 + .002), (ox + tx, oy + ty, z0 + .002), (ox + tx, oy + ty, z1 - .006), (ox - tx, oy - ty, z1 - .006)]
        hs.face(tuple(hs.v(p) for p in q), "alloy", "crack", ALLOY, outward=(ca, sa / sy, 0.0))
        r0, r1 = ap - .008, r * inner
        q = [(cx + ca * r0 - sa * .0035, cy + (sa * r0 + ca * .0035) * sy, z1 + .0012), (cx + ca * r0 + sa * .0035, cy + (sa * r0 - ca * .0035) * sy, z1 + .0012),
             (cx + ca * r1 + sa * .0035, cy + (sa * r1 - ca * .0035) * sy, z1 + .0012), (cx + ca * r1 - sa * .0035, cy + (sa * r1 + ca * .0035) * sy, z1 + .0012)]
        hs.face(tuple(hs.v(p) for p in q), "alloy", "crack", ALLOY, outward=(0.0, 0.0, 1.0))


def tiers(hs, rng, r, levels=(.03, .06, .085, .105), shrink=(1.0, .84, .7, .58), seg=20, sy=1.0, bands=True, cx=0.0, cy=0.0):
    """A stepped round (sy < 1: oval) base in several tiers of faceted stone (flat facets, crisp chamfered edges that
    catch the light, cut-block joints), light showing in broken arcs at the foot of each riser. Returns the top."""
    prev = SINK
    for k, (z, f) in enumerate(zip(levels, shrink)):
        rr = r * f
        step_disc(hs, cx, cy, rr, prev - (0 if k == 0 else .008), z, seg=seg, ch=.007, sy=sy, rot=k * .05)
        nxt = shrink[k + 1] / f if k + 1 < len(shrink) else .3
        stone_joints(hs, rng, cx, cy, rr, max(prev, 0.0), z, seg, k * .05, sy=sy, inner=nxt)
        if bands and k > 0:
            a = rng.uniform(0, TAU)
            for _ in range(rng.choice((2, 3))):
                span = rng.uniform(.7, 1.5)
                glow_band(hs, cx, cy, rr + .0015, prev + .002, prev + .009, a, a + span, max(3, int(span * 8)), sy=sy,
                          paint=("glow", "seam" if k == 1 else "dim"))
                a += span + rng.uniform(.5, 1.2)
        prev = z
    return prev


def fins_round(hs, rng, r, count, z0, hmin, hmax, rmin=.018, rmax=.03, sy=1.0, cx=0.0, cy=0.0, skip=None):
    """Small sharp secondary spikes round a base, irregularly spaced, leaning out."""
    a0 = rng.uniform(0, TAU)
    for k in range(count):
        a = a0 + (k + rng.uniform(-.35, .35)) * TAU / count
        if skip and skip(a):
            continue
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * sy
        # Stubby chiselled stones rather than thorns (less spiky).
        tower(hs, rng, x, y, rng.uniform(hmin, hmax) * .7, rng.uniform(rmin, rmax) * 1.2, a + math.pi / 2, flank=1, tip=rng.uniform(-.6, .6),
              z0=z0, lean=(math.cos(a) * .15, math.sin(a) * .15), thick=(.7, .9))


def torus(hs, cx, cy, z, R, rw, rh, seg=36, tilt=(0.0, 0.0), paint="alloy", mat=ALLOY, inner_glow=None):
    """A ring with a real cross-section (a flattened hexagon, rw across, rh high), tilted by `tilt`; `inner_glow` paints
    the inward faces with light."""
    prof = [(rw, 0.0), (rw * .5, rh), (-rw * .5, rh), (-rw, 0.0), (-rw * .5, -rh), (rw * .5, -rh)]
    rings = []
    for k in range(seg):
        a = k * TAU / seg
        ring = []
        for dr, dz in prof:
            x, y = math.cos(a) * (R + dr), math.sin(a) * (R + dr)
            ring.append(hs.v((cx + x, cy + y, z + dz + x * tilt[0] + y * tilt[1])))
        rings.append(ring)
    for k in range(seg):
        a, b = rings[k], rings[(k + 1) % seg]
        am = (k + .5) * TAU / seg
        for i in range(6):
            j = (i + 1) % 6
            dr = (prof[i][0] + prof[j][0]) * .5
            dz = (prof[i][1] + prof[j][1]) * .5
            out = (math.cos(am) * dr, math.sin(am) * dr, dz)
            glow = inner_glow is not None and dr < -rw * .3
            hs.face((a[i], b[i], b[j], a[j]), inner_glow if glow else paint, "main" if glow or i in (1, 4) else "edge",
                    GLOW if glow else mat, outward=out)


def horn8(hs, rng, pts, widths, depth, plane_y=0.0, centre=(0.0, 0.5), fins=0, studs=0, paint="alloy", mat=ALLOY, grooves_every=True):
    """A thick curved horn swept along (x, z) points in the plane y = plane_y: an eight-cornered section (the inner
    cutting edge and the back's corners bevelled: tag 'edge'), small fins standing off its back and studs of light
    along its face; ends in a point."""
    path = [Vector((px, plane_y, pz)) for px, pz in pts]
    prof = [(1.5, -.1), (1.5, .1), (.45, 1.0), (-.45, 1.0), (-1.0, .45), (-1.0, -.45), (-.45, -1.0), (.45, -1.0)]
    edges = {0, 3, 5, 7}
    rings, frames, pinch = [], [], []
    # Plates: every few sections a V-groove runs round the horn (a joint between laid stone plates).
    grooves = set(range(2, len(path) - 2, 3)) if grooves_every else set()
    for k, c in enumerate(path):
        a, b = path[max(k - 1, 0)], path[min(k + 1, len(path) - 1)]
        t = (b - a).normalized()
        nrm = Vector((t.z, 0.0, -t.x))
        if nrm.dot(Vector((centre[0], plane_y, centre[1])) - c) < 0:
            nrm = -nrm
        bi = Vector((0.0, 1.0, 0.0))
        w = widths[k]
        frames.append((c, nrm, t, w))
        if k in grooves:
            for dc, s_, p_ in ((-.007, 1.0, False), (0.0, .8, True), (.007, 1.0, False)):
                cc = c + t * dc
                rings.append([tuple(cc + nrm * (u * w * s_) + bi * (v * w * depth * s_)) for u, v in prof])
                pinch.append(p_)
        else:
            rings.append([tuple(c + nrm * (u * w) + bi * (v * w * depth)) for u, v in prof])
            pinch.append(False)
    idx = [[hs.v(p) for p in ring] for ring in rings]
    n = len(prof)
    for k in range(len(idx) - 1):
        cen = Vector(_centroid(rings[k] + rings[k + 1]))
        groove = pinch[k] or pinch[k + 1]
        for i in range(n):
            j = (i + 1) % n
            hs.face((idx[k][i], idx[k][j], idx[k + 1][j], idx[k + 1][i]), paint, "crack" if groove else ("edge" if i in edges else "main"), mat,
                    center=tuple(cen))
    a, b = path[-2], path[-1]
    apex = hs.v(tuple(b + (b - a).normalized() * widths[-1] * 3.0))
    for i in range(n):
        hs.face((idx[-1][i], idx[-1][(i + 1) % n], apex), paint, "main", mat, center=tuple(path[-1]))
    # Fins off the back: short knives pointing away from the curve's inside, at irregular places along it.
    upper = list(range(len(path) // 2, len(path) - 2))
    for k in sorted(rng.sample(upper, min(fins, len(upper)))):
        c, nrm, t, w = frames[k]
        base = c - nrm * w * .6
        L = w * rng.uniform(1.1, 1.6)   # short stone fins (user, 24 October: "less spikey as a vibe")
        tip = base - nrm * L + t * L * rng.uniform(.3, .7)
        r = w * .45
        yA, yB = plane_y + w * depth * .45, plane_y - w * depth * .45
        b1, b2 = base + t * r, base - t * r
        hull(hs, [(b1.x, yA, b1.z), (b2.x, yA, b2.z), (b1.x, yB, b1.z), (b2.x, yB, b2.z), tuple(tip)], paint, mat)
    # Studs of light along the face that looks to the camera (-y).
    for k in sorted(rng.sample(range(1, len(path) - 1), min(studs, len(path) - 2))):
        c, nrm, t, w = frames[k]
        p = c + nrm * w * .1
        p = Vector((p.x, plane_y - w * depth - .002, p.z))
        s = w * .25
        q = [p + t * s + nrm * s * .6, p - t * s + nrm * s * .6, p - t * s - nrm * s * .6, p + t * s - nrm * s * .6]
        hs.face(tuple(hs.v(tuple(v)) for v in q), ("glow", "seam"), "main", GLOW, outward=(0.0, -1.0, 0.0))
    return rings


def build_monolith(rng, idx):
    """The concept's MONOLITH TOWER (beacon / command): a crescent of tall chamfered towers of very different height
    round a blazing central slit, stepped and grooved, two small satellite towers at the base, all on a base of four
    tiers with a raised ring wall sweeping round its back and light in the grooves."""
    hs = HS(rng)
    zt = tiers(hs, rng, .5)
    # The ring wall: a raised arc on the lowest tier, round the back and sides, open to the front.
    a0, a1 = math.radians(-20), math.radians(200)
    for k in range(18):
        t0, t1 = a0 + (a1 - a0) * k / 18, a0 + (a1 - a0) * (k + 1) / 18
        poly = [(math.cos(t0) * .44, math.sin(t0) * .44), (math.cos(t1) * .44, math.sin(t1) * .44),
                (math.cos(t1) * .49, math.sin(t1) * .49), (math.cos(t0) * .49, math.sin(t0) * .49)]
        bprism(hs, poly, .02, .07, bev=.004)
    glow_arc(hs, 0, 0, .072, .461, .468, a0 + .2, a0 + 1.4, 6)
    glow_arc(hs, 0, 0, .072, .461, .468, a1 - 1.6, a1 - .3, 6, paint=("glow", "dim"))
    if idx == 0:
        # The crescent of towers: tallest at the back middle, falling away irregularly toward the front corners.
        spec = [(90, .16, 1.0, .088), (60, .17, .9, .078), (120, .18, .86, .076), (36, .22, .7, .07), (144, .22, .74, .07),
                (12, .26, .52, .062), (168, .26, .58, .062), (-10, .3, .36, .055), (190, .3, .4, .055), (90, .3, .66, .06),
                (66, .34, .44, .052), (114, .34, .48, .052)]
        for k, (deg, d, h, w) in enumerate(spec):
            a = math.radians(deg + rng.uniform(-6, 6))
            stepped_tower(hs, rng, math.cos(a) * d, math.sin(a) * d, h, w, a + math.pi / 2, zt - .01, slit=k in (1, 2, 9),
                          steps=2 if h > .5 else 1)
        # The central slit: a blade of light standing in the crescent's mouth, a hot core at its foot.
        glow_slab(hs, 0, .02, zt - .01, .82, .011, .02, paint=("glow", "hot"), taper=.25)
        hull(hs, [(math.cos(k * TAU / 6) * .03, -.04 + math.sin(k * TAU / 6) * .03, zt + dz) for k in range(6) for dz in (0, .06)] + [(0, -.04, zt + .1)],
             ("glow", "hot"), GLOW)
        # Satellite towers on the base, left and right front.
        for side in (-1, 1):
            a = math.radians(-90 + side * rng.uniform(52, 62))
            stepped_tower(hs, rng, math.cos(a) * .4, math.sin(a) * .4, rng.uniform(.26, .34), .04, a + math.pi / 2, .03, slit=True, steps=1)
    else:
        # The split monolith: two great stepped slabs leaning apart over a blazing rift, lesser towers crowding round.
        rot = rng.uniform(-.25, .25)
        ca, sa = math.cos(rot), math.sin(rot)
        for side, h in ((-1, 1.0), (1, .86)):
            stepped_tower(hs, rng, side * .085 * ca, side * .085 * sa, h, .075, rot + math.pi / 2, zt - .01, slit=False, steps=3, n=5)
        glow_slab(hs, 0, 0, zt - .01, .78, .012, .055, rot=rot, paint=("glow", "hot"), taper=.3)
        for deg, d, h, w in ((40, .22, .52, .05), (140, .23, .46, .05), (200, .24, .3, .042), (-25, .23, .34, .042), (95, .25, .4, .045),
                             (250, .2, .24, .04), (300, .26, .28, .04)):
            a = math.radians(deg + rng.uniform(-8, 8))
            stepped_tower(hs, rng, math.cos(a) * d, math.sin(a) * d, h, w, a + math.pi / 2, zt - .01, slit=deg in (40, 140), steps=2 if h > .4 else 1)
    fins_round(hs, rng, .43, 9, .02, .05, .1, skip=lambda a: math.sin(a) > -.3)
    return hs


def build_pylon(rng, idx):
    """The concept's SHIELD PYLON (defensive structure): a tall pointed spire wrapped in a crowd of columns of falling
    height, light in the slits between them, two concentric halo rings of light with a real cross-section, small
    beacon towers round the edge of its tiered base."""
    hs = HS(rng)
    zt = tiers(hs, rng, .36, levels=(.03, .055, .08))
    tower(hs, rng, 0, 0, 1.0, .075, rng.uniform(0, TAU), flank=2, thick=(.85, .95), tip=.0, z0=zt - .01, seams=(1, 5), seam_span=(0, 3))
    a0 = rng.uniform(0, TAU)
    inner = [.74, .64, .7, .56, .6]
    for k, h in enumerate(inner):
        a = a0 + k * TAU / len(inner) + rng.uniform(-.15, .15)
        stepped_tower(hs, rng, math.cos(a) * .1, math.sin(a) * .1, h, .046, a + math.pi / 2, zt - .01, slit=k % 2 == 0, steps=2, n=5)
        b = a + TAU / len(inner) * .5
        glow_slab(hs, math.cos(b) * .085, math.sin(b) * .085, zt, h * .7, .006, .016, rot=b, paint=("glow", "seam"), taper=.3)
    for k, h in enumerate((.42, .34, .46, .3, .38, .32)):
        a = a0 + .3 + k * TAU / 6 + rng.uniform(-.2, .2)
        stepped_tower(hs, rng, math.cos(a) * .2, math.sin(a) * .2, h, .036, a + math.pi / 2, zt - .01, steps=2 if h > .4 else 1, n=5)
    torus(hs, 0, 0, .76, .3, .016, .008, seg=44, tilt=(.04, -.03), paint=("glow", "hot"), mat=GLOW)
    torus(hs, 0, 0, .76, .245, .01, .006, seg=40, tilt=(.04, -.03), paint=("glow", "seam"), mat=GLOW)
    # Beacon towers round the edge, a point of light at each tip.
    for k in range(4):
        a = a0 + .6 + k * TAU / 4 + rng.uniform(-.3, .3)
        x, y = math.cos(a) * .31, math.sin(a) * .31
        h = rng.uniform(.12, .18)
        stepped_tower(hs, rng, x, y, h, .022, a + math.pi / 2, .02, steps=1, n=5)
        hull(hs, [(x + math.cos(i * TAU / 4) * .009, y + math.sin(i * TAU / 4) * .009, h + dz) for i in range(4) for dz in (-.004, .01)],
             ("glow", "hot"), GLOW)
    return hs


def build_gate(rng, idx):
    """The concept's ECLIPSE GATE (planetary interface): on each side three thick bevelled horns layered one behind
    another, curling in toward each other over a beam of light, fins off their backs and studs of light along them,
    small towers standing inside the gate, all on a long tiered plinth."""
    hs = HS(rng)
    zt = tiers(hs, rng, .8, levels=(.03, .055, .075), shrink=(1.0, .86, .72), seg=26, sy=.36)
    for side in (-1, 1):
        for layer, (R, cz, y0, th0, th1, w0, fins, studs) in enumerate((
                (.5, .5, 0.0, 240, 110, .11, 2, 4),
                (.57, .43, .1, 234, 125, .085, 1, 2),
                (.62, .37, .19, 230, 136, .065, 0, 0))):
            pts, widths = [], []
            steps = 13 - layer * 2
            for k in range(steps + 1):
                t = k / steps
                deg = th0 + (th1 - th0) * t if side < 0 else (180 - th0) + ((180 - th1) - (180 - th0)) * t
                th = math.radians(deg)
                rr = R * (1.0 + .07 * math.sin(t * math.pi))
                pts.append((math.cos(th) * rr, max(cz + math.sin(th) * rr - (.03 if k == 0 else 0), w0 * .9 - .1)))
                widths.append(w0 * (1 - .8 * t ** 1.2) + .008)
            horn8(hs, rng, pts, widths, .55, plane_y=y0, centre=(0.0, cz), fins=fins, studs=studs)
    glow_slab(hs, 0, 0, zt, .95, .009, .009, paint=("glow", "hot"), taper=.4)
    for dz, rr in ((0, .05), (.03, .035)):
        step_disc(hs, 0, 0, rr, zt - .01 + dz, zt + .03 + dz, seg=12, ch=.004)
    # Small towers inside the gate and at the horns' feet.
    for x, y, h in ((-.16, .1, .24), (.12, .12, .3), (.24, .08, .16), (-.3, .06, .14), (-.52, -.12, .2), (.5, -.13, .17), (.64, .02, .1), (-.66, .04, .1)):
        stepped_tower(hs, rng, x, y, h, .026, rng.uniform(0, TAU), zt - .01 if abs(x) < .6 else .02, slit=abs(x) < .3, steps=1, n=5)
    return hs


def claw(hs, rng, a, z0, z1, r0, rmid, r1, w, depth=.5, steps=6):
    """One curved claw plate rising from radius r0 at z0, bulging out to rmid, curling back in to r1 at z1."""
    ca, sa = math.cos(a), math.sin(a)
    pts, widths = [], []
    for k in range(steps + 1):
        t = k / steps
        rr = r0 + (rmid - r0) * math.sin(math.pi * min(t * 1.15, 1.0)) + (r1 - r0) * t * t
        pts.append((rr, z0 + (z1 - z0) * t))
        widths.append(w * (1 - .6 * t) + .006)
    # Sweep in a local plane through the axis, then rotate into place.
    local = HS(rng)
    horn8(local, rng, pts, widths, depth, plane_y=0.0, centre=(0.0, (z0 + z1) * .5), grooves_every=False)
    base = len(hs.verts)
    for v in local.verts:
        hs.v((v[0] * ca - v[1] * sa, v[0] * sa + v[1] * ca, v[2]))
    for f, m, p, t in zip(local.faces, local.fmat, local.fpaint, local.ftag):
        hs.faces.append(tuple(base + i for i in f))
        hs.fmat.append(m)
        hs.fpaint.append(p)
        hs.ftag.append(t)


def build_reactor(rng, idx):
    """The concept's ARC REACTOR (energy core): a sphere of light ringed at its equator, cradled in a crown of curved
    claw plates in two layers, a needle with a crown of small spikes above it, a beam below, and on either side a pair
    of tall bevelled crescent blades, on a tiered base."""
    hs = HS(rng)
    zt = tiers(hs, rng, .4, levels=(.03, .055, .08), seg=16)
    zc, rc = .54, .075
    pts = []
    for k, t in enumerate((-.85, -.45, 0.0, .45, .85)):
        rr = rc * math.sqrt(1 - t * t)
        for i in range(10):
            a = (i + .5 * (k % 2)) * TAU / 10
            pts.append((math.cos(a) * rr, math.sin(a) * rr, zc + rc * t))
    pts += [(0, 0, zc + rc), (0, 0, zc - rc)]
    hull(hs, pts, ("glow", "hot"), GLOW, tag="smooth")
    torus(hs, 0, 0, zc, rc + .022, .012, .007, seg=20, paint="alloy", mat=ALLOY, inner_glow=("glow", "seam"))
    glow_slab(hs, 0, 0, zt, zc - rc * .6, .007, .007, paint=("glow", "hot"), taper=.6)
    # The stem and its collar.
    knife(hs, rng, 0, 0, .38, .05, z0=zt - .01, flank=2, thick=(.85, .95), paint="alloy", mat=ALLOY, prof=((0.0, 1.0), (.5, .55), (.9, .85)))
    torus(hs, 0, 0, .37, .07, .02, .012, seg=16)
    # The crown: an outer layer of six tall claws and an inner layer of five short ones, offset.
    a0 = rng.uniform(0, TAU)
    # (A wide crown flaring round the core at its equator, as in the concept: tips out and up, not a closed bud.)
    for k in range(6):
        a = a0 + k * TAU / 6 + rng.uniform(-.08, .08)
        claw(hs, rng, a, .36, rng.uniform(.62, .68), .06, .19, .25, .032, steps=5)
    for k in range(5):
        a = a0 + (k + .5) * TAU / 5 + rng.uniform(-.1, .1)
        claw(hs, rng, a, .4, rng.uniform(.56, .6), .05, .13, .17, .024, steps=4)
    # The needle and its crown of small spikes.
    knife(hs, rng, 0, 0, 1.0, .028, z0=zc + rc * .7, flank=1, thick=(.85, .95), paint="alloy", mat=ALLOY, prof=((0.0, 1.0), (.3, .7), (.7, .4)),
          bevel=.2)
    for k in range(3):
        a = a0 + k * TAU / 3
        tower(hs, rng, math.cos(a) * .02, math.sin(a) * .02, zc + rc + rng.uniform(.05, .09), .012, a, flank=1, z0=zc + rc * .5,
              lean=(math.cos(a) * .3, math.sin(a) * .3))
    # The guards: a pair of tall crescent blades on each side, the inner taller.
    for side in (-1, 1):
        for layer, (x0, h, w, y0) in enumerate(((.36, .86, .05, -.03), (.43, .7, .04, .05))):
            pts2, w2 = [], []
            for k in range(9):
                t = k / 8
                pts2.append((side * (x0 + .05 * math.sin(t * math.pi) - .16 * t * t), -.02 + t * h))
                w2.append(w * (1 - .7 * t) + .006)
            horn8(hs, rng, pts2, w2, .6, plane_y=y0, centre=(0.0, .5), fins=1 if layer == 0 else 0, studs=2 if layer == 0 else 0)
    fins_round(hs, rng, .34, 7, .02, .04, .08)
    return hs


def build_obelisk(rng, idx):
    """The concept's OBELISK: a tall needle of black alloy collared and slit with light, glowing at its foot, standing in
    a crown of small fins on a tiered base; variant 1 is three blades fused into one spire, light in their seams."""
    hs = HS(rng)
    zt = tiers(hs, rng, .22, levels=(.03, .055, .075), seg=12)
    if idx == 0:
        knife(hs, rng, 0, 0, 1.0, .1, z0=zt - .01, flank=1, thick=(.9, 1.0), tip=.0, paint="alloy", mat=ALLOY,
              prof=((0.0, 1.0), (.08, .8), (.6, .46), (.9, .18)), seams=(1, 4), seam_span=(1, 3), seam_w=.018, bevel=.1)
        torus(hs, 0, 0, .2, .085, .016, .01, seg=20, inner_glow=None)
        glow_band(hs, 0, 0, .16 * .84 + .0015, .032, .04, 0, TAU, 16, paint=("glow", "hot"))
    else:
        a = rng.uniform(0, TAU)
        for k, (h, r) in enumerate(((1.0, .075), (.8, .066), (.64, .06))):
            ang = a + k * TAU / 3 + rng.uniform(-.3, .3)
            x, y = math.cos(ang) * .04, math.sin(ang) * .04
            knife(hs, rng, x, y, h, r, z0=zt - .01, rot=ang + math.pi / 2, flank=1, thick=(.4, .6), tip=rng.uniform(-.4, .4), paint="alloy", mat=ALLOY,
                  lean=(-x * .3, -y * .3), prof=((0.0, 1.0), (.5, .72), (.85, .35)), bevel=.12)
        glow_slab(hs, 0, 0, zt, .5, .008, .026, rot=a, paint=("glow", "hot"), taper=.2)
        glow_slab(hs, 0, 0, zt, .38, .008, .026, rot=a + TAU / 3, paint=("glow", "seam"), taper=.2)
        torus(hs, 0, 0, .16, .07, .014, .009, seg=18)
    fins_round(hs, rng, .17, 5, .02, .05, .1, rmin=.014, rmax=.02)
    return hs


def build_pad(rng, idx):
    """Low builders' platforms (the concept's PLATFORM SMALL and LANDING PAD): a round pad in three tiers with light in
    its riser grooves, a small stepped emitter in the middle and fins round the rim; or a chamfered square platform
    with a sunken glowing well, light along its edges and small corner pylons."""
    hs = HS(rng)
    if idx == 0:
        zt = tiers(hs, rng, .7, levels=(.05, .08, .1), shrink=(1.0, .82, .62), seg=22)
        step_disc(hs, 0, 0, .1, zt - .005, zt + .02, seg=16, ch=.005)
        glow_arc(hs, 0, 0, zt + .0215, .035, .052, 0, TAU, 12, paint=("glow", "hot"))
        fins_round(hs, rng, .62, 7, .02, .07, .13, rmin=.02, rmax=.03)
    else:
        poly = [(.55, -.34), (.55, .34), (.34, .55), (-.34, .55), (-.55, .34), (-.55, -.34), (-.34, -.55), (.34, -.55)]
        hs.prism(poly, SINK, .06, .02, "alloy", ALLOY)
        inner = [(x * .8, y * .8) for x, y in poly]
        hs.prism(inner, .05, .1, .014, "alloy", ALLOY)
        well = [(x * .28, y * .28) for x, y in poly]
        hs.prism(well, .05, .085, .008, "alloy", ALLOY)
        glow_arc(hs, 0, 0, .0865, 0, .06, 0, TAU, 12, paint=("glow", "hot"))
        for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            cx, cy = sx * .5, sy * .5
            w, d = (.007, .12) if sx else (.12, .007)
            q = [hs.v((cx + u, cy + v, .062)) for u, v in ((-w, -d), (w, -d), (w, d), (-w, d))]
            hs.face(q, ("glow", "seam"), "main", GLOW, outward=(0.0, 0.0, 1.0))
        for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
            stepped_tower(hs, rng, sx * .38, sy * .38, .13 + rng.uniform(0, .01), .03, math.atan2(sy, sx), .05, steps=1, n=5)
            tower(hs, rng, sx * .46, sy * .3, .1, .016, math.atan2(sy, sx), flank=1, z0=.04, lean=(sx * .3, sy * .2))
    return hs


def build_dock(rng, idx):
    """The concept's CRESCENT DOCK (shipyard / landing): a floating crescent deck of black alloy in two layers, a raised
    rim along its outer edge, light along its inner edge, a cluster of spires on its back with a beam of light falling
    from under the deck, and a hanging mass of pointed spikes beneath. Floats like umb_float: y = 0 at the lowest spike
    tip, the tallest spire's point at exactly 1 (the deck at about 0.46 of the height)."""
    hs = HS(rng)
    deck, th = .46, .08
    a0, a1 = math.radians(-128), math.radians(128)
    n = 24

    def crescent(scale_w, z_top, z_bot, shrink=0.0, paint="alloy"):
        outer, inner = [], []
        for k in range(n + 1):
            t = k / n
            a = a0 + (a1 - a0) * t
            w = .36 * math.sin(math.pi * t) ** .7 * scale_w + .012
            outer.append((math.cos(a) * (.86 - shrink), math.sin(a) * (.86 - shrink)))
            inner.append((math.cos(a) * (.86 - shrink - w), math.sin(a) * (.86 - shrink - w)))
        loop = outer + list(reversed(inner[1:-1]))
        top = [hs.v((x, y, z_top)) for x, y in loop]
        bot = [hs.v((x, y, z_bot)) for x, y in loop]
        hs.face(tuple(top), paint, "top", ALLOY, outward=(0.0, 0.0, 1.0))
        hs.face(tuple(reversed(bot)), paint, "under", ALLOY, outward=(0.0, 0.0, -1.0))
        m = len(loop)
        for i in range(m):
            j = (i + 1) % m
            mx, my = (loop[i][0] + loop[j][0]) * .5, (loop[i][1] + loop[j][1]) * .5
            a = math.atan2(my, mx)
            sign = 1.0 if i < n else -1.0
            hs.face((top[i], top[j], bot[j], bot[i]), paint, "edge" if i < n else "main", ALLOY, outward=(math.cos(a) * sign, math.sin(a) * sign, 0.0))
        return outer, inner
    outer, inner = crescent(1.0, deck, deck - th)
    crescent(.8, deck - th + .005, deck - th - .05, shrink=.05)
    # The raised rim along the outer edge.
    for k in range(2, n - 2):
        t0, t1 = a0 + (a1 - a0) * k / n, a0 + (a1 - a0) * (k + 1) / n
        poly = [(math.cos(t0) * .835, math.sin(t0) * .835), (math.cos(t1) * .835, math.sin(t1) * .835),
                (math.cos(t1) * .858, math.sin(t1) * .858), (math.cos(t0) * .858, math.sin(t0) * .858)]
        bprism(hs, poly, deck - .005, deck + .028, bev=.003)
    # The inner edge's line of light, on its riser.
    for k in range(1, n - 1):
        (x0, y0), (x1, y1) = inner[k], inner[k + 1]
        q = [(x0 * .997, y0 * .997, deck - .02), (x1 * .997, y1 * .997, deck - .02), (x1 * .997, y1 * .997, deck - .008), (x0 * .997, y0 * .997, deck - .008)]
        mx, my = -(x0 + x1), -(y0 + y1)
        hs.face(tuple(hs.v(p) for p in q), ("glow", "seam"), "main", GLOW, outward=(mx, my, 0.0))
    # The spire cluster at the back of the crescent (angle 0), and the beam under the deck.
    sx, sy = .68, 0.0
    tower(hs, rng, sx, sy, 1.0, .08, math.pi / 2, flank=2, thick=(.75, .9), tip=.2, z0=deck - .02, seams=(5,), seam_span=(1, 3))
    for dx, dy, h in ((-.07, .12, .7), (-.04, -.13, .62), (.08, -.05, .58), (.04, .15, .52), (-.1, -.02, .5)):
        stepped_tower(hs, rng, sx + dx, sy + dy, h, .03, math.atan2(dy, dx), deck - .02, slit=h > .6, steps=2 if h > .55 else 1, n=5)
    glow_slab(hs, sx, sy, .06, deck - th - .05, .008, .008, paint=("glow", "hot"), taper=.2)
    # Masts along the deck toward the horns (moorings), shorter toward the tips, a light at the foot of each.
    for deg in (-62, -96, 58, 100):
        a = math.radians(deg + rng.uniform(-6, 6))
        t = (a - a0) / (a1 - a0)
        w = .36 * math.sin(math.pi * t) ** .7 + .012
        rr = .86 - w * .5
        x, y = math.cos(a) * rr, math.sin(a) * rr
        stepped_tower(hs, rng, x, y, deck + rng.uniform(.1, .2) * (1.3 - abs(deg) / 100), .025, a + math.pi / 2, deck - .01, steps=1, n=5)
        glow_arc(hs, x, y, deck + .002, .03, .036, 0, TAU, 8, paint=("glow", "seam"))
    # The hanging spikes: along the crescent's mid-line, longest under its back (one to the bottom), short at the horns.
    count = 13
    for k in range(count):
        t = (k + .5) / count
        a = a0 + (a1 - a0) * t
        w = .36 * math.sin(math.pi * t) ** .7 + .012
        rr = .86 - w * rng.uniform(.3, .7)
        x, y = math.cos(a) * rr, math.sin(a) * rr
        back = math.sin(math.pi * t)
        depth = (deck - th - .05) * (.25 + .7 * back ** 2) * rng.uniform(.8, 1.0)
        tipz = 0.0 if k == count // 2 else deck - th - .05 - depth
        knife(hs, rng, x, y, max(tipz, 0.0), .05 + .07 * back, z0=deck - th - .02, down=True, flank=rng.choice((1, 2)), thick=(.6, .85),
              tip=rng.uniform(-.4, .4), lean=(math.cos(a) * .08, math.sin(a) * .08), prof=((0.0, 1.0), (.4, .6), (.75, .25)),
              twist=rng.uniform(-.3, .3), seams=(1,) if k in (3, 9) else ())
    return hs


# ----------------------------------------------------------------------------
# Canyon walls (cliff-kit.glb, built by tools/blender/cliff_kit.py --world umbra)
# ----------------------------------------------------------------------------

def loft_polys(hs, levels, paint, mat, top=None, bottom=None, cap_top=False, tag="main"):
    """A loft through explicit horizontal polygons [(z, [(x, y), ...])], bottom to top, all with the same corner count;
    closed by a `top` / `bottom` apex or a flat (possibly sloping: give the cap's own z per corner) top cap."""
    rings = [[hs.v((x, y, z if not isinstance(z, (list, tuple)) else z[i])) for i, (x, y) in enumerate(poly)] for z, poly in levels]
    n = len(levels[0][1])
    cents = []
    for (z, poly), ring in zip(levels, rings):
        zz = sum(hs.verts[i][2] for i in ring) / n
        cents.append((sum(p[0] for p in poly) / n, sum(p[1] for p in poly) / n, zz))
    if top is not None:
        cents.append(tuple(top))
    if bottom is not None:
        cents.insert(0, tuple(bottom))

    def axis_at(z):
        if z <= cents[0][2]:
            return cents[0]
        for a, b in zip(cents, cents[1:]):
            if a[2] <= z <= b[2]:
                t = (z - a[2]) / max(b[2] - a[2], 1e-9)
                return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z)
        return cents[-1]

    def add(face):
        c = _centroid([hs.verts[i] for i in face])
        hs.face(face, paint, tag, mat, center=axis_at(c[2]))

    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            add((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    if top is not None:
        t = hs.v(top)
        for i in range(n):
            add((rings[-1][i], rings[-1][(i + 1) % n], t))
    elif cap_top:
        hs.face(tuple(rings[-1]), paint, "top", mat, outward=(0.0, 0.0, 1.0))
    if bottom is not None:
        b = hs.v(bottom)
        for i in range(n):
            add((rings[0][(i + 1) % n], rings[0][i], b))
    return rings


def build_void_wall(rng, idx, half_x, front, back, base):
    """Umbra's canyon walls, third pass (user, 24 October: first "spikey rock cliffs", then about flat caps "not ...
    jagged but like steps", then "less spikey as a vibe and more cracked and sharp"): one segment of broad slabs of
    black glass standing side by side along the lip, each cut by a few planes into big clean facets meeting in hard
    edges (an angled front ridge, angled sides, a top tilted back into the slope behind a sharp chamfered front edge,
    never a level cap or visible tread; now and then a short point), each broken along a steep crack and the broken piece slipped a little
    down and out, so dark cracks run down the face; at most one crack per segment glows faintly violet. Slab widths,
    depths and top heights irregular so neighbouring segments never repeat a rhythm. Blender frame: front (the canyon
    side, toward the camera) is -y; x ±half_x, y front … back, z base … 1."""
    hs = HS(rng)
    J = lambda d: rng.uniform(-d, d)  # noqa: E731
    wall_y = back - .3
    # The dark mass behind, kept under the lip (gaps between slabs read as deep shadow, never as sky).
    q = [(-half_x, wall_y), (half_x, wall_y), (half_x, back), (-half_x, back)]
    lo = [hs.v((x, y, base)) for x, y in q]
    hi = [hs.v((x, y, .72)) for x, y in q]
    for i, out in ((0, (0, -1, 0)), (1, (1, 0, 0)), (3, (-1, 0, 0))):
        j = (i + 1) % 4
        hs.face((lo[i], lo[j], hi[j], hi[i]), "obs", "crack", OBS, outward=out)
    hs.face(tuple(hi), "obs", "crack", OBS, outward=(0, 0, 1))
    # Slabs across the segment.
    cuts, x = [-half_x], -half_x
    while half_x - x > .55:
        x += rng.uniform(.38, .72)
        cuts.append(min(x, half_x - .3))
        x = cuts[-1]
    cuts.append(half_x)
    glow_slab = rng.randrange(len(cuts) - 1) if idx % 2 == 0 else -1
    points = set(rng.sample(range(len(cuts) - 1), 1)) if rng.random() < .6 else set()
    prev_top = None
    for k, (a, b) in enumerate(zip(cuts, cuts[1:])):
        mid, w = (a + b) * .5 + J(.04), b - a
        y0 = front + rng.choice((rng.uniform(.0, .06), rng.uniform(.08, .18)))
        top = 1.0 if rng.random() < .55 else rng.uniform(.84, .97)
        if prev_top is not None and abs(top - prev_top) < .04:
            top = max(.82, top - rng.uniform(.06, .12))
        prev_top = top
        planes = [
            face_plane(180 + J(20), 84 + J(5), (a - .015, 0.0, .5)), face_plane(J(20), 84 + J(5), (b + .015, 0.0, .5)),
            # The front: two facets meeting in a ridge somewhere across it, each leaning back a little.
            face_plane(-90 - rng.uniform(12, 30), 80 + J(6), (mid + J(w * .2), y0, .5)),
            face_plane(-90 + rng.uniform(12, 30), 80 + J(6), (mid + J(w * .2), y0, .5)),
        ]
        if k in points:
            # A short point: two steep top planes meeting in a ridge that peaks at the lip.
            planes += [face_plane(-90 - rng.uniform(25, 45), 48, (mid, y0 + .12, top)), face_plane(-90 + rng.uniform(25, 45), 48, (mid, y0 + .12, top))]
        else:
            # The top tilts back into the slope (hidden behind the lip by the terrain), so the slab's highest line is its
            # sharp front edge, chamfered steeply toward the canyon: a jagged lip line, never a visible tread.
            planes += [face_plane(90 + J(25), rng.uniform(16, 28), (mid, y0 + .06, top)),
                       face_plane(-90 + J(20), rng.uniform(56, 66), (mid, y0 + .02, top - rng.uniform(.05, .09)))]
        # A steep crack down the face, the outer piece slipped down and out a little.
        crack_az = rng.choice((0, 180)) + J(35)
        fr = [frac(crack_az, rng.uniform(62, 80), (mid + J(w * .25), y0 + .1, rng.uniform(.4, .75)), rng.uniform(.012, .022),
                   rng.uniform(.015, .05), J(.015))]
        if w > .55 and rng.random() < .5:
            fr.append(frac(rng.choice((0, 180)) + J(35), rng.uniform(55, 75), (mid + J(w * .3), y0 + .1, rng.uniform(.2, .5)),
                           rng.uniform(.01, .018), rng.uniform(.01, .03), J(.01)))
        # (Bevels only on the canyon side's sharp edges: dozens of segments stand in view, 650 triangles each.)
        # (The slab ends at the lip line, where its top is highest: no level cap behind it to lie flush with the plateau.)
        fractured(hs, rng, planes, fr, glow=(0,) if k == glow_slab else (), box=(a - .06, b + .06, front, back - .3, base, 1.0),
                  bevel_w=.004, bottom=base, bevel_front=front + .26)
    for v in hs.verts:   # pieces slipped along their cracks stay inside the segment and above the base
        v[0] = min(max(v[0], -half_x), half_x)
        v[1] = max(v[1], front)
        v[2] = max(v[2], base)
    vc.triangulate_nonplanar(hs, tol=1e-6)
    return hs


# ----------------------------------------------------------------------------
# Colour
# ----------------------------------------------------------------------------

def glow_sources(hs):
    """Centres of the glowing faces, weighted by size: obsidian next to them takes a violet bounce."""
    out = []
    for f, m, paint in zip(hs.faces, hs.fmat, hs.fpaint):
        if m == GLOW and paint != ("glow", "dim"):   # (the dim sheets and arcs throw no bounce)
            pts = [Vector(hs.verts[i]) for i in f]
            c = sum(pts, Vector((0.0, 0.0, 0.0))) / len(pts)
            area = max((pts[1] - pts[0]).cross(pts[2] - pts[0]).length * .5, 1e-5)
            out.append((c, min(area * 400.0, 1.0)))
    return out


def colour_fn_for(hs, name, sources=None, reach=0.16, rock=False):
    """Black glass: each facet its own depth of black (cut glass), only its bevelled edges lighter (brightest toward the
    tips, where a real glass edge catches the sky), a faint sheen on what faces up, a violet bounce near a seam;
    machined alloy keeps lighter chamfers."""
    zs = [v[2] for v in hs.verts]
    zhi, zlo = max(zs), min(zs)
    rng = random.Random(f"{SEED}:shade:{name}")
    jit = [rng.uniform(0.0, 1.0) for _ in hs.faces]
    sources = glow_sources(hs) if sources is None else sources

    def bounce(p):
        b = 0.0
        for c, w in sources:
            d = (p - c).length
            if d < reach:
                b += w * (1 - d / reach) ** 2
        return kit.clamp(b, 0.0, 1.0)

    groups = {}

    def fn(paint, p, n, ao, fi):
        kind = paint if isinstance(paint, str) else paint[0]
        j = jit[fi]
        if kind == "obs" and not isinstance(paint, str):
            # A hill facet written as several triangles: one depth of black for the whole plane.
            j = groups.setdefault(paint[1], random.Random(f"{SEED}:facet:{name}:{paint[1]}").uniform(0.0, 1.0))
        if kind == "glow":
            if paint[1] == "hot":
                return C["glow_hot"]
            if paint[1] == "dim":
                return kit.mul3(C["glow"], .55)
            if paint[1] == "faint":
                return kit.mul3(C["glow"], .32)
            return C["glow"]
        tag = hs.ftag[fi]
        if tag == "crack":
            return C["crack"]
        up = kit.smoothstep(.2, .95, n.z)
        height = kit.clamp((p.z - zlo) / max(zhi - zlo, 1e-3), 0.0, 1.0)
        if kind == "alloy":
            col = mix(C["alloy"], C["alloy_lit"], j * .7)
            if tag == "edge":
                col = mix(C["alloy_edge"], C["edge_hi"], kit.clamp(n.z, 0, 1) * .5 + height * .3)
            col = mix(col, C["sheen"], up * .5)
        elif tag == "edge" and rock:
            # A rock's bevel catches light only where it turns up or toward the sun (upper left): shadow-side edges stay
            # nearly as dark as the facets (no outline drawn round every face).
            k = kit.clamp(.1 + .6 * max(n.z, 0.0) + .35 * max(-n.x, 0.0) - .25 * max(n.x, 0.0), 0.0, 1.0) * (.55 + .45 * height)
            col = mix(C["lit"], C["edge_hi"], k)
        elif tag == "edge":
            # A bevelled glass edge: the one place the black catches light, brightening toward the tip.
            col = mix(C["edge"], C["edge_hi"], kit.smoothstep(.25, 1.0, height) * .8 + j * .2)
        else:
            # Cut glass: facets alternate between deep black and a lifted black.
            col = mix(C["deep"], C["lit"], j * .8 + kit.clamp(-n.x, 0, 1) * .2)
            col = mix(col, C["sheen"], up * (.6 if tag == "top" else .35))
            if tag == "under" or n.z < -.5:
                col = mix(col, C["deep"], .7)
        col = mix(col, C["bounce"], bounce(p) * .6)
        return kit.mul3(col, kit.lerp(.6, 1.0, ao))
    return fn


def gloss_alpha(hs, cols, gloss=None, broad_up=None, broad=None):
    """Vertex alpha: 0 on every obsidian and alloy face (full gloss), 1 on glow faces. The hills' big facets are satin
    instead (a large glossy plane mirroring the sky flashes white): `broad` on every facet but the edge bevels (which
    stay fully glossy, so only the edges glint), `broad_up` on the facets turned mostly up."""
    corner = 0
    for f, m, t in zip(hs.faces, hs.fmat, hs.ftag):
        a = 1.0 if m == GLOW else (0.0 if gloss is None else gloss)
        if broad is not None and m != GLOW and t != "edge":
            a = broad_up if broad_up is not None and kit.face_normal(hs.verts, f).z > .55 else broad
        for c in range(corner, corner + len(f)):
            cols[c] = (cols[c][0], cols[c][1], cols[c][2], a)
        corner += len(f)
    return cols


# name prefix -> (builder, variants, contract half x, half z (glTF), exact top or real height, triangle budget). The halves
# are the measured envelope of the variants (rounded up): build to them, the runtime rescales anything beyond.
PIECES = {
    "umb_spire": (build_spire, 4, 0.42, 0.42, True, 1000),
    "umb_shards": (build_shards, 3, 0.3, 0.28, 0.37, 200),
    "umb_float": (build_float, 3, 0.84, 0.7, True, 1200),
    "umb_monolith": (build_monolith, 2, 0.5, 0.5, True, 3000),
    "umb_pylon": (build_pylon, 1, 0.36, 0.36, True, 3000),
    "umb_gate": (build_gate, 1, 0.8, 0.29, True, 3000),
    "umb_reactor": (build_reactor, 1, 0.53, 0.41, True, 3000),
    "umb_obelisk": (build_obelisk, 2, 0.22, 0.22, True, 1500),
    "umb_pad": (build_pad, 2, 0.7, 0.7, 0.17, 1500),
    "umb_dock": (build_dock, 1, 0.7, 0.86, True, 3000),
    "umb_peak": (build_peak, 4, 1.0, 0.9, True, 1000),
    "umb_hill": (build_hill, 8, 1.5, 1.3, True, 900),
}


# Pieces that float (no ground under them: base at the lowest hanging tip, AO without a ground plane).
FLOATING = ("umb_float", "umb_dock")


def node_list():
    out = []
    for prefix, (fn, variants, hx, hz, top, budget) in PIECES.items():
        for i in range(variants):
            rule = dict(budget=budget, x=(-hx, hx), z=(-hz, hz), y_min=0.0 if prefix in FLOATING else -0.15, mats=MAT_NAMES)
            if top is True:
                rule["y_max_exact"] = 1.0
            else:
                rule["y_max"] = top
            out.append((f"{prefix}_{i}", prefix, fn, i, rule))
    return out


def build_all(focus=None):
    mats = [vc.make_material("umbra_obsidian", "vc", rough=0.12), vc.make_material("umbra_alloy", "vc", rough=0.2), glow_material("umbra_glow")]
    objs, nodes, stats = {}, {}, {}
    for name, prefix, fn, idx, rule in node_list():
        hs = fn(random.Random(f"{SEED}:{name}"), idx)
        vc.triangulate_nonplanar(hs, tol=1e-6)
        centre_xy(hs)
        if prefix in ("umb_peak", "umb_hill"):
            # Mountains fill their footprint (integrator: about 1.0 x 0.9): an overshooting foot shard shrinks the massif
            # a little in plan (shape kept), never past the contract.
            hx, hz = PIECES[prefix][2], PIECES[prefix][3]
            k = min(1.0, hx / max(abs(v[0]) for v in hs.verts), hz / max(abs(v[1]) for v in hs.verts))
            if k < 1.0:
                k *= 0.999
                for v in hs.verts:
                    v[0] *= k
                    v[1] *= k
        if prefix in FLOATING:
            # Base-centre: the lowest spike tip at 0 (the top is then scaled to exactly 1 by fit_top).
            zlo = min(v[2] for v in hs.verts)
            for v in hs.verts:
                v[2] -= zlo
        authored = max(v[2] for v in hs.verts)
        if "y_max_exact" in rule:
            fit_top(hs, 1.0)
        cols = vc.bake(hs, name, dict(glow=set(), ao=0.3, ground=None if prefix in FLOATING else 0.0,
                                      colour_fn=colour_fn_for(hs, name, rock=prefix in ("umb_peak", "umb_hill"))))
        stone = prefix in ("umb_monolith", "umb_pylon", "umb_gate", "umb_reactor", "umb_obelisk", "umb_pad", "umb_dock")
        gloss_alpha(hs, cols, broad_up=.6 if prefix == "umb_hill" else .45 if stone else None,
                    broad=.3 if prefix == "umb_hill" else .32 if stone else None)
        objs[name] = vc.make_object(name, hs, mats, (0.0, 0.0, 0.0), cols)
        nodes[name] = rule
        x0, x1, y0, y1, z0, z1 = hs.bounds()
        stats[name] = dict(tris=hs.tris(), x=(x0, x1), z=(-y1, -y0), y=(z0, z1))
        print(f"UKIT {name:16s} tris={hs.tris():5d} authored_top={authored:.3f} glTF x={x0:+.3f}..{x1:+.3f} z={-y1:+.3f}..{-y0:+.3f} y={z0:+.3f}..{z1:+.3f}")
    return mats, objs, nodes, stats


# ----------------------------------------------------------------------------
# Preview (look-dev only, never a runtime asset): near-black glass under a violet eclipse sky, fog in the canyons
# ----------------------------------------------------------------------------

FOG = (0.075, 0.045, 0.2)


def _principled(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def preview_materials(attr):
    """Preview stand-ins for the runtime look: glossy obsidian and alloy (vertex colour, sharp reflections) and glow
    (vertex colour emitted, as the runtime does)."""
    out = {}
    for name, rough in (("umbra_obsidian", .12), ("umbra_alloy", .2)):
        m = bpy.data.materials.new(f"preview_{name}_{attr}")
        m.use_nodes = True
        b = _principled(m)
        vcn = m.node_tree.nodes.new("ShaderNodeVertexColor")
        vcn.layer_name = attr
        m.node_tree.links.new(vcn.outputs["Color"], b.inputs["Base Color"])
        # The runtime's gloss: roughness = mix(0.86, rough, 1 - alpha).
        mr = m.node_tree.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 0.0, 1.0
        mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = rough, .86
        m.node_tree.links.new(vcn.outputs["Alpha"], mr.inputs["Value"])
        m.node_tree.links.new(mr.outputs["Result"], b.inputs["Roughness"])
        try:
            b.inputs["Coat Weight"].default_value = .35 if name == "umbra_obsidian" else .15
            b.inputs["Coat Roughness"].default_value = .05
        except KeyError:
            pass
        out[name] = m
    m = bpy.data.materials.new(f"preview_umbra_glow_{attr}")
    m.use_nodes = True
    b = _principled(m)
    vcn = m.node_tree.nodes.new("ShaderNodeVertexColor")
    vcn.layer_name = attr
    m.node_tree.links.new(vcn.outputs["Color"], b.inputs["Base Color"])
    m.node_tree.links.new(vcn.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 6.0
    out["umbra_glow"] = m
    return out


def apply_preview(objs, attr=vc.COLOR_ATTR):
    pm = preview_materials(attr)
    for o in objs:
        for k, slot in enumerate(o.data.materials):
            if slot is None:
                continue
            for key, m in pm.items():
                if slot.name.startswith(key):
                    o.data.materials[k] = m
    return pm


def plain_material(name, colour, rough, emit=None, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = _principled(m)
    b.inputs["Base Color"].default_value = (*colour, 1.0)
    b.inputs["Roughness"].default_value = rough
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = strength
    return m


def ground_material(name, far_y0, far_y1):
    """Near-black glossy glass ground, sinking into the violet fog toward the back (object y far_y0 … far_y1)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = _principled(m)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = .35
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = .35, (*kit.hex_linear("#231d3e"), 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = .7, (*kit.hex_linear("#30284f"), 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = .32
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = far_y0, far_y1
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Y"], mr.inputs["Value"])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*FOG, 1)
    em.inputs["Strength"].default_value = 1.0
    mix_ = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mr.outputs["Result"], mix_.inputs["Fac"])
    nt.links.new(b.outputs["BSDF"], mix_.inputs[1])
    nt.links.new(em.outputs["Emission"], mix_.inputs[2])
    nt.links.new(mix_.outputs["Shader"], out.inputs["Surface"])
    return m


def fog_material(name, density=.5, emit=.6):
    """The canyon fog: violet scattering haze that glows a little of itself (the concept's purple glowy fog)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == "BSDF_PRINCIPLED":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (.35, .25, .9, 1)
    vol.inputs["Density"].default_value = density
    vol.inputs["Emission Color"].default_value = (*FOG, 1)
    vol.inputs["Emission Strength"].default_value = emit
    # Thicker toward the bottom of the canyon.
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 1.0, 0.0
    mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = 0.05, 1.0
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = density
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], mul.inputs[0])
    nt.links.new(mul.outputs["Value"], vol.inputs["Density"])
    mul2 = nt.nodes.new("ShaderNodeMath")
    mul2.operation = "MULTIPLY"
    mul2.inputs[1].default_value = emit
    nt.links.new(mr.outputs["Result"], mul2.inputs[0])
    nt.links.new(mul2.outputs["Value"], vol.inputs["Emission Strength"])
    nt.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    return m


def box_obj(name, x0, x1, y0, y1, z0, z1, mat):
    me = bpy.data.meshes.new(name)
    v = [(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    f = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    me.from_pydata(v, [], f)
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def setup_preview(scene, res=(1600, 1200), samples=64):
    """The eclipse light: a violet sky (lavender overhead, a burning purple horizon), a pale moon low behind the scene
    (highlights run along the top edges and rims of the glass), a faint violet fill from the front."""
    world = bpy.data.worlds.new("umbra_preview_world")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = -1.0, 1.0
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = .3, (.012, .008, .03, 1)
    els[1].position, els[1].color = .5, (.26, .17, .58, 1)
    e = els.new(.62)
    e.color = (.2, .17, .38, 1)
    e = els.new(.95)
    e.color = (.08, .07, .16, 1)
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.4
    # The game's sun direction (khepri_kit.SUN_DIR, terrain-layout: from the upper left, slightly beyond the scene).
    kit.add_sun(kit.SUN_DIR, strength=4.5, color=(.82, .8, 1.0), angle_deg=1.0)
    fill = kit.add_sun((-0.3, 0.85, -0.45), strength=.35, color=(.55, .4, 1.0), angle_deg=8.0)
    fill.name = "preview_fill"
    kit.setup_render(scene, "EEVEE", samples, *res)
    scene.view_settings.exposure += .6
    ee = scene.eevee
    for attr, val in (("volumetric_tile_size", "4"), ("volumetric_samples", 96), ("volumetric_end", 200.0), ("use_volumetric_shadows", True)):
        try:
            setattr(ee, attr, val)
        except Exception:
            pass
    glare(scene)


def glare(scene):
    """A soft bloom on the glows (the runtime blooms them on High). Best effort: the compositor API moves between
    Blender versions; without it the render simply has no bloom."""
    try:
        tree = bpy.data.node_groups.new("umbra_preview_comp", "CompositorNodeTree")
        scene.compositing_node_group = tree
        tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        rl = tree.nodes.new("CompositorNodeRLayers")
        gl = tree.nodes.new("CompositorNodeGlare")
        out = tree.nodes.new("NodeGroupOutput")
        for key, val in (("Type", "Bloom"), ("Threshold", 1.2), ("Strength", .45), ("Size", .6), ("Quality", "High")):
            try:
                gl.inputs[key].default_value = val
            except Exception:
                pass
        tree.links.new(rl.outputs["Image"], gl.inputs["Image"])
        tree.links.new(gl.outputs["Image"], out.inputs[0])
        scene.render.use_compositing = True
    except Exception as exc:  # noqa: BLE001
        print("UKIT preview: no bloom", exc)


def camera(scene, target, ortho, view="game"):
    """`game`: the game's camera (55 degrees down from the front, no yaw); `three_quarter`: from the front left."""
    for o in list(scene.objects):
        if o.name.startswith("preview_cam"):
            bpy.data.objects.remove(o, do_unlink=True)
    if view == "game":
        return kit.add_ortho_camera(target, 55.0, ortho)
    if view == "concept":   # the concept sheet's presentation angle: from the front, low
        return kit.add_ortho_camera(target, 20.0, ortho)
    cam = bpy.data.cameras.new("preview_cam")
    cam.type = "ORTHO"
    cam.ortho_scale = ortho
    cam.clip_end = 300.0
    obj = bpy.data.objects.new("preview_cam", cam)
    d = Vector((-.5, -.74, .45)).normalized()
    obj.location = Vector(target) + d * 80.0
    obj.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)
    scene.camera = obj
    return obj


def render(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("UKIT preview", path)


# Layout of the line-up sheet: rows from the back (tall landmarks) to the front (low pieces).
LINEUP = [
    ["umb_monolith_0", "umb_monolith_1", "umb_gate_0", "umb_reactor_0", "umb_pylon_0"],
    ["umb_spire_0", "umb_spire_1", "umb_spire_2", "umb_spire_3", "umb_obelisk_0", "umb_obelisk_1"],
    ["umb_float_0", "umb_float_1", "umb_float_2", "umb_dock_0"],
    ["umb_pad_0", "umb_pad_1", "umb_shards_0", "umb_shards_1", "umb_shards_2"],
]


def lineup(objs, scene, dirs, focus=None):
    rows = LINEUP if not focus else [[n for n in row if any(n.startswith(f) for f in focus)] for row in LINEUP]
    rows = [r for r in rows if r]
    for o in objs.values():
        o.hide_render = True
    gap, row_gap = 1.95, 2.3
    placed = []
    for ri, row in enumerate(rows):
        for ci, name in enumerate(row):
            o = objs[name]
            o.hide_render = False
            o.location = ((ci - (len(row) - 1) / 2) * gap, (len(rows) - 1 - ri) * row_gap, .3 if name.startswith(FLOATING) else 0.0)
            placed.append(o)
    depth = (len(rows) - 1) * row_gap
    g = kit.plane_obj("preview_ground", -40, 40, -12, 40, 0.0, ground_material("preview_ground_mat", depth + 2.0, depth + 14.0))
    width = max(len(r) for r in rows) * gap
    target = (0.0, depth * .5, .45)
    for view, tag, ortho in (("game", "lineup-game", max(width, depth * 1.45) + .4), ("three_quarter", "lineup-34", max(width, depth * 1.5) + .6)):
        camera(scene, target, ortho, view)
        for d in dirs:
            render(scene, os.path.join(d, f"umbra-kit-{tag}{'-focus' if focus else ''}.png"))
    bpy.data.objects.remove(g, do_unlink=True)
    return placed


def peaks(objs, scene, dirs):
    """The sharp rocks (umb_peak): the four alone, then a loose group of six at the integrator's scales (footprint 1.5-2.5,
    height 0.8-1.2 x the width) on the dark plateau, each from the game camera and from the front left."""
    for o in objs.values():
        o.hide_render = True
    names = [f"umb_peak_{k}" for k in range(4)]
    for k, name in enumerate(names):
        # As placed in game: the height about 0.9 times the width (1.8 x the footprint scale).
        o = objs[name]
        o.hide_render = False
        o.location = ((k - 1.5) * 2.5, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.8)
    g = kit.plane_obj("preview_ground", -60, 60, -30, 60, 0.0, ground_material("preview_ground_peaks", 9.0, 24.0))
    for view, tag, ortho in (("game", "peaks-game", 11.0), ("three_quarter", "peaks-34", 11.0)):
        camera(scene, (0.0, 0.0, .8), ortho, view)
        for d in dirs:
            render(scene, os.path.join(d, f"umbra-kit-{tag}.png"))
    for name in names:
        objs[name].hide_render = True
        objs[name].scale = (1.0, 1.0, 1.0)
    rng = random.Random(f"{SEED}:rocks")
    made = []
    for k, (x, y) in enumerate(((-5.2, 1.4), (-1.6, 3.4), (1.0, .6), (4.2, 2.6), (6.6, -.4), (-3.4, -1.6))):
        s_ = rng.uniform(1.5, 2.5)
        h = 2 * s_ * rng.uniform(.8, 1.2)
        made.append(place(scene, objs[names[k % 4]], (x, y, -.06), rng.uniform(0, TAU), (s_, s_, h)))
    for view, tag, ortho, target in (("game", "rocks-game", 15.0, (.6, 1.0, 1.0)), ("three_quarter", "rocks-34", 17.0, (.6, 1.0, 1.2))):
        camera(scene, target, ortho, view)
        for d in dirs:
            render(scene, os.path.join(d, f"umbra-kit-{tag}.png"))
    for o in made + [g]:
        bpy.data.objects.remove(o, do_unlink=True)


# The infrastructure as the concept presents it (front row: MONOLITH TOWER, CRESCENT DOCK, ECLIPSE GATE, ARC REACTOR,
# SHIELD PYLON), each stretched in height as the in-situ scene places it; the modular pieces behind.
INFRA_ROWS = [
    [("umb_monolith_0", 1.0), ("umb_dock_0", 1.0), ("umb_gate_0", 1.3), ("umb_reactor_0", 1.2), ("umb_pylon_0", 1.3)],
    [("umb_monolith_1", 1.4), ("umb_obelisk_0", 1.4), ("umb_obelisk_1", 1.4), ("umb_pad_0", 1.0), ("umb_pad_1", 1.0)],
]
CONCEPT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "art", "concepts", "umbra",
                       "01-umbra-world-and-infrastructure.png")


def infra_sheet(objs, scene, dirs):
    """The reworked infrastructure from the concept's angle and from the game camera, and a comparison sheet with the
    concept's INFRASTRUCTURE row above the render."""
    import numpy as np
    for o in objs.values():
        o.hide_render = True
    g = kit.plane_obj("preview_ground", -60, 60, -30, 60, 0.0, ground_material("preview_ground_infra", 12.0, 30.0))
    shots = []
    for ri, row in enumerate(INFRA_ROWS):
        for ci, (name, stretch) in enumerate(row):
            o = objs[name]
            o.hide_render = False
            o.location = ((ci - 2) * 2.0, 0.0, .3 if name.startswith(FLOATING) else 0.0)
            o.scale = (1.0, 1.0, stretch)
        part = "infra" if ri == 0 else "modular"
        for view, tag, ortho, target in (("concept", f"{part}-concept-view", 10.2, (0.0, 0.0, .62)), ("game", f"{part}-game", 10.2, (0.0, 0.0, .5))):
            camera(scene, target, ortho, view)
            # A strip like the concept's row (the ortho scale spans the width).
            scene.render.resolution_y = 600 if view == "concept" else 900
            for d in dirs:
                path = os.path.join(d, f"umbra-kit-{tag}.png")
                render(scene, path)
                if view == "concept" and ri == 0:
                    shots.append(path)
        for name, _ in row:
            objs[name].scale = (1.0, 1.0, 1.0)
            objs[name].hide_render = True
    scene.render.resolution_y = 1200
    # A close look at the worked stone (faceted tiers, joints, chamfers, plate grooves): the monolith and the gate.
    for name, loc, stretch in (("umb_monolith_0", (-.65, 0.0, 0.0), 1.0), ("umb_gate_0", (.75, .3, 0.0), 1.3)):
        o = objs[name]
        o.hide_render, o.location, o.scale = False, loc, (1.0, 1.0, stretch)
    for view, tag in (("three_quarter", "infra-closeup-34"), ("game", "infra-closeup-game")):
        camera(scene, (0.05, .15, .45), 2.9, view)
        for d in dirs:
            render(scene, os.path.join(d, f"umbra-kit-{tag}.png"))
    for name in ("umb_monolith_0", "umb_gate_0"):
        objs[name].hide_render, objs[name].scale = True, (1.0, 1.0, 1.0)
    bpy.data.objects.remove(g, do_unlink=True)
    if not os.path.exists(CONCEPT):
        return
    src = bpy.data.images.load(CONCEPT)
    w, h = src.size
    px = np.array(src.pixels[:], dtype=np.float32).reshape(h, w, 4)
    crop = px[h - 1160:h - 925, :]   # the INFRASTRUCTURE row (image rows run bottom-up)
    for shot in shots:
        img = bpy.data.images.load(shot)
        rw, rh = img.size
        ren = np.array(img.pixels[:], dtype=np.float32).reshape(rh, rw, 4)
        ys = (np.arange(int(crop.shape[0] * rw / crop.shape[1])) * crop.shape[1] / rw).astype(int).clip(0, crop.shape[0] - 1)
        xs = (np.arange(rw) * crop.shape[1] / rw).astype(int).clip(0, crop.shape[1] - 1)
        top = crop[ys][:, xs]
        sheet = np.concatenate([ren, top], axis=0)   # bottom-up: the render below, the concept above
        out = bpy.data.images.new("umbra_infra_compare", rw, sheet.shape[0])
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = os.path.join(os.path.dirname(shot), "umbra-kit-infra-vs-concept.png")
        out.file_format = "PNG"
        out.save()
        print("UKIT preview", out.filepath_raw)
        bpy.data.images.remove(out)
        bpy.data.images.remove(img)


def hills(objs, scene, dirs, cliff_path):
    """The obsidian hills (umb_hill): the eight alone, then a range of them overlapping at the integrator's scales (2-4,
    height 1.5-4.2) with a few sharp rocks, on the dark plateau beside the fogged canyon and its walls."""
    for o in objs.values():
        o.hide_render = True
    names = [f"umb_hill_{k}" for k in range(8)]
    for k, name in enumerate(names):
        o = objs[name]
        o.hide_render = False
        o.location = ((k % 4 - 1.5) * 3.4, (k // 4) * 3.2, 0.0)
    g = kit.plane_obj("preview_ground", -60, 60, -30, 60, 0.0, ground_material("preview_ground_hills", 12.0, 30.0))
    for view, tag, ortho in (("game", "hills-game", 14.5), ("three_quarter", "hills-34", 15.0)):
        camera(scene, (0.0, 1.6, .5), ortho, view)
        for d in dirs:
            render(scene, os.path.join(d, f"umbra-kit-{tag}.png"))
    for name in names:
        objs[name].hide_render = True
    bpy.data.objects.remove(g, do_unlink=True)
    if not os.path.exists(cliff_path):
        return
    walls, attr = import_glb(cliff_path)
    apply_preview(walls.values(), attr)
    made = canyon_scene(scene, walls)
    rng = random.Random(f"{SEED}:hillrange")
    # Overlapping hills along the far plateau, a few on the near one; rocks as accents at their feet.
    spots = [(-8.6, 4.2), (-5.4, 2.8), (-2.6, 5.4), (-.4, 2.6), (2.6, 4.6), (5.2, 2.9), (8.0, 4.8), (-6.8, 7.4), (3.6, 7.8), (-3.0, -6.2), (4.4, -6.6)]
    order = [0, 3, 1, 5, 6, 2, 7, 4, 1, 5, 3]
    for (x, y), k in zip(spots, order):
        s_ = rng.uniform(2.0, 3.6)
        h = min(4.2, max(1.5, s_ * rng.uniform(.75, 1.25)))
        made.append(place(scene, objs[names[k]], (x, y, -.08), rng.uniform(-.6, .6) + (math.pi if rng.random() < .3 else 0.0), (s_, s_, h)))
    for x, y in ((-3.9, 1.6), (1.4, 1.5), (6.6, 1.7), (-1.2, -4.6)):
        s_ = rng.uniform(1.4, 2.0)
        made.append(place(scene, objs[f"umb_peak_{rng.randrange(4)}"], (x, y, -.06), rng.uniform(0, TAU), (s_, s_, s_ * rng.uniform(1.6, 2.1))))
    for view, tag, ortho, target in (("game", "hillrange-game", 22.0, (0.0, 2.0, 0.0)), ("three_quarter", "hillrange-34", 22.0, (0.0, 2.0, .5))):
        camera(scene, target, ortho, view)
        for d in dirs:
            render(scene, os.path.join(d, f"umbra-kit-{tag}.png"))
    for o in made:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in walls.values():
        bpy.data.objects.remove(o, do_unlink=True)


def import_glb(path):
    """Import a published kit for the in-situ preview; returns {node name: object} and the colour attribute's name."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    out, attr = {}, None
    for o in new:
        if o.type == "MESH":
            out[o.name] = o
            if attr is None and o.data.color_attributes:
                attr = o.data.color_attributes[0].name
            o.hide_render = True
    return out, attr


def place(scene, src, loc, rot=0.0, scale=(1.0, 1.0, 1.0)):
    o = bpy.data.objects.new(src.name + "_inst", src.data)
    o.location, o.rotation_euler, o.scale = loc, (0.0, 0.0, rot), scale
    scene.collection.objects.link(o)
    return o


DROP = 3.8  # the canyon's depth in game (integrator, 24 October: plateau at −1.8, floors about −5.6)


def canyon_scene(scene, walls):
    """In-situ preview: a plateau of dark violet glass at z 0 with a canyon DROP deep across it (fog in it), the far
    plateau's walls facing the camera, the near lip's walls facing away (hidden, as in game)."""
    mats = {}
    top = ground_material("preview_plateau", 60.0, 61.0)
    deep = plain_material("preview_canyon_floor", kit.hex_linear("#0a0812"), .5)
    mats["fog"] = fog_material("preview_fog", density=.5, emit=.9)
    made = []
    made.append(box_obj("plateau_far", -14, 14, .55, 30, -DROP, 0.0, top))
    made.append(box_obj("plateau_near", -14, 14, -30, -3.4, -DROP, 0.0, top))
    made.append(box_obj("canyon_floor", -14, 14, -3.4, .6, -DROP - .4, -DROP, deep))
    made.append(box_obj("canyon_fog", -14, 14, -3.4, .55, -DROP - .2, -.5, mats["fog"]))
    # A run of walls along the far lip: front toward the camera (-y), top flush with the lip, scaled by the drop.
    names = sorted(walls)
    order = [names[i % len(names)] for i in (0, 2, 1, 3, 0, 1, 3, 2, 1, 0, 2, 3)]
    for k, name in enumerate(order):
        made.append(place(scene, walls[name], (-12.0 + k * 2.1 * 1.25 + .3 * ((k * 7) % 3 - 1) * .1, .5 + .04 * ((k * 5) % 3), -DROP),
                          scale=(1.25, 1.25, DROP)))
    return made


def preview_kit(objs, args):
    """Line-up of every piece from the game camera and from the front left, then (when the published cliff kit is
    there) an in-situ canyon scene: walls, fog, spires and structures at game-like scales."""
    scene = bpy.context.scene
    dirs = [d for d in (args.preview_dir, args.lookdev_dir) if d]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    apply_preview(objs.values())
    setup_preview(scene)
    focus = args.focus.split(",") if args.focus else None
    if not focus or any(f not in ("umb_peak", "infra", "umb_hill") for f in focus):
        lineup(objs, scene, dirs, [f for f in focus if f not in ("infra", "umb_hill")] if focus else None)
    if not focus or "umb_peak" in focus:
        peaks(objs, scene, dirs)
    if not focus or "infra" in focus:
        infra_sheet(objs, scene, dirs)
    if not focus or "umb_hill" in focus:
        hills(objs, scene, dirs, os.path.join(os.path.dirname(args.glb), "cliff-kit.glb"))
    if focus:
        return
    cliff = os.path.join(os.path.dirname(args.glb), "cliff-kit.glb")
    if not os.path.exists(cliff):
        print("UKIT preview: no cliff kit yet, skipping the in-situ scene")
        return
    walls, attr = import_glb(cliff)
    apply_preview(walls.values(), attr)
    for o in objs.values():
        o.hide_render = True
    made = canyon_scene(scene, walls)
    I = objs
    # (instance, x, y, footprint scale, height, rotation) at game-like scales: the far plateau from y 1 back.
    dressing = [
        ("umb_spire_0", -5.4, 1.5, 1.5, 3.4, .3), ("umb_spire_2", -3.6, 1.3, 1.4, 2.6, 2.2), ("umb_spire_3", 4.2, 1.4, 1.5, 2.8, 1.0),
        ("umb_spire_1", 6.4, 2.6, 1.4, 3.2, 4.0), ("umb_shards_2", -2.3, 1.2, 1.8, 1.8, .5), ("umb_shards_1", 2.2, 1.3, 1.7, 1.7, 3.0),
        ("umb_monolith_0", 0.4, 4.4, 3.0, 4.2, 0.2), ("umb_pylon_0", -2.8, 5.6, 2.6, 4.2, .6), ("umb_obelisk_0", 2.8, 2.8, 1.8, 2.6, .4),
        ("umb_obelisk_1", -7.4, 3.6, 1.8, 2.4, 1.3), ("umb_pad_0", -1.2, 2.4, 2.0, 2.0, 0.0), ("umb_gate_0", 5.2, 5.6, 3.4, 3.4, 0.0),
        ("umb_reactor_0", -6.0, 6.0, 2.6, 3.4, .5), ("umb_monolith_1", 8.8, 5.0, 2.6, 3.8, 2.0), ("umb_spire_3", 8.4, 1.8, 1.3, 2.2, 2.6),
        ("umb_pad_1", 1.2, -4.8, 2.0, 2.0, .4), ("umb_spire_2", -4.2, -5.0, 1.3, 2.0, 4.4), ("umb_shards_0", 3.6, -4.4, 1.7, 1.7, 1.0),
        ("umb_spire_1", -8.4, -4.6, 1.3, 2.6, 1.7),
    ]
    for name, x, y, s, h, r in dressing:
        made.append(place(scene, I[name], (x, y, -.05), r, (s, s, h)))
    # Floating cliffs over the canyon (bottom tip at z, scaled by their own height).
    for name, x, y, z, s, h, r in (("umb_float_0", -4.2, -1.4, -1.2, 1.6, 1.8, .4), ("umb_float_1", 2.6, -1.0, -.4, 1.4, 1.5, 2.1),
                                   ("umb_float_2", 7.2, -1.8, -1.8, 1.3, 1.4, 4.0)):
        made.append(place(scene, I[name], (x, y, z), r, (s, s, h)))
    for view, tag, ortho, target in (("game", "insitu-game", 16.0, (0.0, 1.6, -.6)), ("three_quarter", "insitu-34", 17.0, (0.0, 1.5, -.5))):
        camera(scene, target, ortho, view)
        for d in dirs:
            render(scene, os.path.join(d, f"umbra-kit-{tag}.png"))


def cliff_run(objs, out_dir):
    """The cliff kit alone in its canyon (tools/blender/cliff_kit.py --world umbra --preview DIR)."""
    scene = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    apply_preview(objs.values())
    for o in objs.values():
        o.hide_render = True
    setup_preview(scene, res=(1400, 1050))
    canyon_scene(scene, objs)
    camera(scene, (0.0, .5, -1.2), 9.0, "game")
    render(scene, os.path.join(out_dir, "umbra-cliff-run.png"))
    camera(scene, (0.0, .5, -1.2), 10.0, "three_quarter")
    render(scene, os.path.join(out_dir, "umbra-cliff-run-34.png"))
    # Close up without fog: the shards' facets and lit bevels.
    for o in scene.objects:
        if o.name == "canyon_fog":
            o.hide_render = True
    camera(scene, (-8.5, .5, -1.6), 4.5, "game")
    render(scene, os.path.join(out_dir, "umbra-cliff-closeup.png"))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="umbra_kit.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--lookdev-dir", default=None)
    ap.add_argument("--focus", default=None, help="comma-separated name prefixes: a close preview of only those pieces")
    ap.add_argument("--no-publish", action="store_true")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats, objs, nodes, stats = build_all()
    total = sum(s["tris"] for s in stats.values())
    print(f"UKIT total {total} triangles in {len(stats)} nodes")
    if not args.no_publish:
        vc.publish(args.glb, "umbra_kit.py", dict(materials=MAT_NAMES, nodes=nodes, max_bytes=5_000_000), "UKIT")
    if args.preview_dir or args.lookdev_dir:
        preview_kit(objs, args)


if __name__ == "__main__":
    main()
