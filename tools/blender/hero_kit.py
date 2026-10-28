"""Modular hero ships for Last Worlds (docs/31-hero-ships.md): per chassis, four part slots (hull, wings, engines,
cockpit) in three designs each, mixed and matched within that chassis.

Every design of a chassis is authored in place around that chassis's shared anchors (cockpit seat, wing roots, engine
mounts, the hit-region centre at the origin), so any hull, wings, engines and cockpit of one chassis assemble without
runtime transforms: the game merges the chosen part nodes into one mesh. Parts are cosmetic only (docs/04 section 9):
the central hit region, handling and gun origins never change.

Node names: hero_<chassis>_<slot>_<design>, slot in hull | wings | engines | cockpit, design a | b | c. Each engines
design carries its own exhaust empties hero_<chassis>_engines_<design>_engine_<i> (the engine glow sockets, named as the
game's craft loader expects: src/render/models.ts loadCraftNodes).

Conventions as the Scrapper before it (tools/blender/cinematic_assets.py): Blender x right, y forward (the nose, glTF
-z, up the screen), z up; 1 unit = 1 game unit before the game's HERO_SCALE; centred on the hit region.

    R=/home/davidfarina/Projects/alien-skies-ships
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/hero_kit.py)" -- --chassis scrapper \\
        --glb "$(wslpath -w $R/public/assets/shared/hero-scrapper-kit.glb)" --preview-dir "$(wslpath -w $R/art/hero-kit)"
"""

import argparse
import math
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import vesper_common as vc  # noqa: E402

PLATE, FRAME, GLOW = 0, 1, 2
PAINTS = dict(vc.PAINTS, ivory=('#c8c9bd', .2, '#ece7d5'), rust=('#78442f', .25, '#b17852'),
              ochre=('#88673e', .25, '#baa17d'), metal=('#454e58', .35, '#9baab4'), black=('#10171e', .15, '#455564'),
              # Ironclad: olive armour on dark steel, hazard-stripe accents.
              olive=('#3d4528', .2, '#69744a'), steel=('#2a2e33', .3, '#5d666e'), hazard=('#b58a1c', .2, '#e2b84a'),
              # Interceptor: pearl and cobalt.
              pearl=('#d9dde2', .15, '#f4f6f8'), cobalt=('#1f4f9a', .2, '#4c80cc'), navy=('#141c2c', .2, '#34445e'),
              # Spectre: obsidian with pale silver.
              obsidian=('#17141e', .25, '#3e3650'), silver=('#a9adb8', .2, '#dfe2ea'))
SLOTS = ('hull', 'wings', 'engines', 'cockpit')
# Paint roles for recolouring (user, 28 October: "we should be able to recolor at some point too"): each face's role is
# stored in its vertex colour's alpha, the baked colour keeping the default scheme and all the shading and wear. A
# recolour tints a role's faces at runtime, keeping their baked lightness: primary paint, secondary paint; metal,
# glass and anything else stay as baked (alpha 1). Glow is its own material and tints separately.
ROLE_ALPHA = dict(ivory=.75, rust=.5, ochre=.5, olive=.75, hazard=.5, pearl=.75, cobalt=.5, obsidian=.75, silver=.5)
DESIGNS = ('a', 'b', 'c')
# A whole ship stays near 2,500 triangles; the Scrapper's original barrel engines (about 1,400) are the heaviest part.
# The bevelled finish (refine) roughly triples a part; a whole ship now runs about 2,000 to 6,000 triangles, still a single
# draw (user, 28 October: "make them more sophisticated").
BUDGET = dict(hull=3400, wings=3200, engines=4600, cockpit=1400)


def inset(points, d):
    """The outline offset inward by d (mitred, capped at 2.5 d on sharp corners), whichever way it winds."""
    area = sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points)))
    turn = 1 if area > 0 else -1
    out = []
    for i, (px, py) in enumerate(points):
        ax, ay = points[i - 1]
        bx, by = points[(i + 1) % len(points)]
        n = []
        for (ux, uy), (vx, vy) in (((ax, ay), (px, py)), ((px, py), (bx, by))):
            l = math.hypot(vx - ux, vy - uy) or 1
            n.append((-(vy - uy) / l * turn, (vx - ux) / l * turn))
        mx, my = n[0][0] + n[1][0], n[0][1] + n[1][1]
        ml = math.hypot(mx, my) or 1
        cos_half = max(.4, (mx * n[0][0] + my * n[0][1]) / ml)
        out.append((px + mx / ml * d / cos_half, py + my / ml * d / cos_half))
    return out


def area_of(points):
    return .5 * sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points)))


def panel_of(points, depth):
    """The outline inset by `depth` if it stays a clean, same-way-round, non-crossing outline with every edge kept;
    else None."""
    inner = inset(points, depth)
    a0, a1 = area_of(points), area_of(inner)
    if a0 * a1 <= 0 or abs(a1) < abs(a0) * .25:
        return None
    for i in range(len(points)):
        j = (i + 1) % len(points)
        ox, oy = points[j][0] - points[i][0], points[j][1] - points[i][1]
        ix, iy = inner[j][0] - inner[i][0], inner[j][1] - inner[i][1]
        if ox * ix + oy * iy <= 0:
            return None
    return inner


def solid(h, points, z, height, paint, mat=PLATE, panel=True):
    """A planar plate in Blender x/y, `height` thick from z: straight sides for its lower part, then a chamfered band up to
    a slightly inset top (user, 28 October: the parts "look blocky"; machined armour panels catch the light on their edges)."""
    d = min(.035, height * .45)
    if d < .006:
        top_ring, mid = points, height
    else:
        top_ring, mid = inset(points, d), height - d * .8
    lo = [h.v((x, y, z)) for x, y in points]
    md = [h.v((x, y, z + mid)) for x, y in points]
    hi = [h.v((x, y, z + height)) for x, y in top_ring]
    h.face(tuple(hi), paint, 'main', mat, outward=(0, 0, 1))
    h.face(tuple(reversed(lo)), paint, 'main', mat, outward=(0, 0, -1))
    for i in range(len(points)):
        j = (i + 1) % len(points)
        a, b = points[i], points[j]
        side = (b[1] - a[1], a[0] - b[0], 0)
        h.face((lo[i], lo[j], md[j], md[i]), paint, 'edge', mat, outward=side)
        if mid < height:
            h.face((md[i], md[j], hi[j], hi[i]), paint, 'edge', mat, outward=(side[0], side[1], math.hypot(*side[:2])))
    # Panelling: a large plate carries a slightly raised inner panel with its own chamfer, so its broad face breaks into
    # machined sections (same paint: a recolour reaches it).
    size = math.sqrt(abs(area_of(top_ring)))
    if panel and mat == PLATE and size > .2 and height > .025:
        inner = panel_of(top_ring, max(.035, size * .16))
        if inner:
            solid(h, inner, z + height, .012, paint, mat, panel=False)


def mirrored(points, side):
    """A right-hand outline mirrored to `side`, its winding kept outward."""
    pts = [(side * x, y) for x, y in points]
    return pts if side > 0 else list(reversed(pts))


# ============================================================================= Scrapper (starter, basic)
# A cheap rusty salvage fighter (docs/04): patched metal, faded ivory paint, exposed but serviceable engines. Each slot's
# three designs differ in silhouette and paint, not just detail (user, 28 October: "make them a bit more different").
# Anchors, shared by every design: the hit region at the origin; the cockpit seat on the hull's spine (0, 0.14, 0.1);
# wing roots under the hull at x +-0.15, the wings drawing the outer silhouette out to x +-0.6 ... 0.72; the engines at
# the hull's flanks and tail (twin at x +-0.29, quad at x +-0.24 and +-0.37, or one central thruster behind the tail),
# their plumes at the nozzles. About 1.25 to 1.45 wide: still the smallest chassis.
SCRAPPER_PLUMES = dict(a=[(-.29, -.52, 0), (.29, -.52, 0)],
                       b=[(-.24, -.48, -.03), (-.37, -.48, .02), (.24, -.48, -.03), (.37, -.48, .02)],
                       c=[(0, -.8, 0), (-.24, -.43, 0), (.24, -.43, 0)])


def bent_tip(h, outline, x0, droop, paint):
    """A wingtip panel whose outer part bends down by `droop` per unit of span past x0."""
    lo = [h.v((x, y, -.03 - (abs(x) - x0) * droop)) for x, y in outline]
    hi = [h.v((x, y, .015 - (abs(x) - x0) * droop)) for x, y in outline]
    h.face(tuple(hi), paint, 'main', PLATE, outward=(0, 0, 1))
    h.face(tuple(reversed(lo)), paint, 'main', PLATE, outward=(0, 0, -1))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        a, b = outline[i], outline[j]
        h.face((lo[i], lo[j], hi[j], hi[i]), paint, 'edge', PLATE, outward=(b[1] - a[1], a[0] - b[0], 0))


def scrapper_hull(h, design):
    if design == 'a':   # The tug: the original hexagonal rust fuselage, an ivory stripe.
        solid(h, [(-.14, -.47), (.14, -.47), (.19, .24), (.1, .6), (-.1, .6), (-.19, .24)], -.09, .18, 'rust')
        solid(h, [(-.1, .15), (.1, .15), (.105, .39), (0, .61), (-.105, .39)], .09, .035, 'ivory')
        h.box((-.08, -.3, .105), (.09, .16, .028), .005, 'ivory', PLATE)
        h.box((.07, .44, .15), (.055, .07, .015), .003, 'rust', PLATE)
    elif design == 'b':   # The flat-iron: a broad, short, flat delta in ivory, rust edges, a black nose cap.
        solid(h, [(-.31, -.46), (.31, -.46), (.24, .0), (.08, .5), (-.08, .5), (-.24, .0)], -.07, .13, 'ivory')
        solid(h, [(-.08, .5), (.08, .5), (.03, .62), (-.03, .62)], -.05, .09, 'black', FRAME)
        for side in (-1, 1):
            solid(h, mirrored([(.2, -.46), (.31, -.46), (.24, -.05), (.17, -.05)], side), .06, .02, 'rust')
        for x, y in ((-.12, -.25), (.14, -.1)):
            h.box((x, y, .07), (.09, .1, .015), .003, 'ochre', PLATE)
    else:   # The needle: a long dark-metal keel ending in a forked twin-prong nose, lamps at the prong tips.
        solid(h, [(-.1, -.5), (.1, -.5), (.12, .25), (.06, .42), (-.06, .42), (-.12, .25)], -.07, .15, 'metal', FRAME)
        for x in (-.06, .06):
            h.box((x, .6, .0), (.045, .38, .07), .006, 'black', FRAME)
            h.box((x, .795, .0), (.03, .012, .04), .0, 'lamp', GLOW)
        solid(h, [(-.07, -.2), (.07, -.2), (.06, .3), (-.06, .3)], .08, .02, 'rust')
        for y in (-.36, -.2):
            h.box((0, y, .02), (.26, .03, .14), .004, 'rust', PLATE)


def scrapper_wings(h, design):
    for side in (-1, 1):
        if design == 'a':   # Swept salvage wings with a gun rail and patch plates (the original), rooted under the hull.
            solid(h, mirrored([(.15, .22), (.66, -.14), (.62, -.31), (.15, -.2)], side), -.04, .055, 'ivory')
            h.box((side * .46, -.24, .0), (.26, .06, .06), .008, 'metal', FRAME)
            for x, y in ((side * .44, -.1), (side * .56, -.2)):
                h.box((x, y, .025), (.025, .025, .012), .002, 'metal', FRAME)
            solid(h, mirrored([(.5, -.05), (.6, -.15), (.58, -.22), (.48, -.12)], side), .015, .012, 'rust')
        elif design == 'b':   # The biplane: two stacked straight panels, the upper one forward, joined by end plates.
            solid(h, mirrored([(.15, .0), (.58, -.02), (.58, -.22), (.15, -.22)], side), -.09, .04, 'ivory')
            solid(h, mirrored([(.15, .1), (.62, .08), (.62, -.12), (.15, -.12)], side), .1, .04, 'ivory')
            solid(h, mirrored([(.58, .1), (.64, .1), (.64, -.24), (.58, -.24)], side), -.1, .26, 'rust')
            for y in (-.15, .02):
                h.box((side * .4, y, .04), (.02, .02, .2), .002, 'metal', FRAME)
        else:   # The gull: big forward-swept wings, tips bent down, a gun pod on each tip.
            solid(h, mirrored([(.15, -.08), (.6, .24), (.68, .14), (.15, -.3)], side), -.03, .045, 'ivory')
            bent_tip(h, mirrored([(.6, .24), (.72, .17), (.76, .04), (.68, .14)], side), .6, .9, 'rust')
            h.cyl((side * .7, .38, -.08), (0, -1, 0), .035, .34, 8, .004, 'metal', mat=FRAME, smooth=True)
            h.box((side * .7, .39, -.08), (.03, .012, .03), .0, 'lamp', GLOW)
            h.box((side * .4, -.02, .02), (.12, .05, .012), .002, 'metal', FRAME)


def scrapper_engines(h, design):
    if design == 'c':   # One big central thruster jutting out behind the tail, small side vents.
        h.cyl((0, -.3, .0), (0, -1, 0), .15, .46, 16, .012, 'ochre', mat=PLATE, smooth=True)
        for y in (-.42, -.6):
            h.cyl((0, y, .0), (0, -1, 0), .155, .025, 16, .003, 'metal', mat=FRAME, smooth=True)
        h.cyl((0, -.76, .0), (0, -1, 0), .13, .04, 16, .004, 'black', mat=FRAME, smooth=True)
        h.cyl((0, -.8, .0), (0, -1, 0), .1, .012, 12, .0, 'lamp', mat=GLOW, smooth=True)
        for side in (-1, 1):
            h.box((side * .24, -.36, .0), (.08, .14, .06), .006, 'rust', PLATE)
            h.box((side * .24, -.43, .0), (.06, .012, .03), .0, 'lamp', GLOW)
        return
    for side in (-1, 1):
        if design == 'a':   # Twin barrels: long rusted cylinders with clamp rings and a black nozzle.
            x = side * .29
            h.cyl((x, .15, .0), (0, -1, 0), .092, .59, 16, .009, 'rust', mat=PLATE, smooth=True)
            h.cyl((x, -.435, .0), (0, -1, 0), .095, .07, 16, .006, 'black', mat=FRAME, smooth=True)
            h.cyl((x, -.505, .0), (0, -1, 0), .06, .012, 12, .0, 'lamp', mat=GLOW, smooth=True)
            for y in (-.27, -.06, .13):
                h.cyl((x, y, .0), (0, 1, 0), .096, .022, 16, .003, 'metal', mat=FRAME, smooth=True)
        else:   # Quad: two small thrusters a side, staggered in height, on a shared clamp.
            for x, z in ((side * .24, -.03), (side * .37, .02)):
                h.cyl((x, .05, z), (0, -1, 0), .065, .48, 12, .006, 'rust', mat=PLATE, smooth=True)
                h.cyl((x, -.43, z), (0, -1, 0), .068, .04, 12, .004, 'black', mat=FRAME, smooth=True)
                h.cyl((x, -.47, z), (0, -1, 0), .045, .01, 10, .0, 'lamp', mat=GLOW, smooth=True)
            h.box((side * .305, -.1, .0), (.2, .06, .1), .006, 'metal', FRAME)


def scrapper_cockpit(h, design):
    if design == 'a':   # A dark glass slab in a metal frame (the original).
        solid(h, [(-.102, .02), (.102, .02), (.078, .27), (-.078, .27)], .11, .07, 'black', FRAME)
        for x in (-.1, .1):
            h.box((x, .14, .15), (.012, .26, .012), .002, 'metal', FRAME)
    elif design == 'b':   # A tall bubble canopy with a radar mast behind it.
        h.cyl((0, .16, .1), (0, 0, 1), .12, .03, 14, .004, 'metal', mat=FRAME, smooth=True)
        h.cyl((0, .16, .13), (0, 0, 1), .11, .12, 14, .01, 'black', mat=FRAME, r1=.04, smooth=True)
        h.box((0, -.02, .22), (.02, .02, .24), .002, 'metal', FRAME)
        h.cyl((0, -.02, .34), (0, 1, .4), .07, .015, 10, .002, 'ivory', mat=PLATE, smooth=True)
    else:   # An armoured hood with twin glowing visor slits and a small turret ring on top.
        solid(h, [(-.12, .0), (.12, .0), (.1, .3), (-.1, .3)], .1, .09, 'ochre')
        for z in (.15, .175):
            h.box((0, .29, z), (.15, .02, .012), .0, 'lamp', GLOW)
        h.cyl((0, .1, .19), (0, 0, 1), .065, .04, 12, .004, 'metal', mat=FRAME, smooth=True)
        h.box((0, .2, .21), (.02, .2, .02), .002, 'black', FRAME)


def box_plate(h, cx, cy, z, hx, hy, height, paint, mat=PLATE):
    solid(h, [(cx - hx, cy - hy), (cx + hx, cy - hy), (cx + hx, cy + hy), (cx - hx, cy + hy)], z, height, paint, mat)


def spike(h, base, direction, length, r, paint, mat=PLATE, sides=4):
    """A four-sided spike from `base` along `direction`."""
    h.cyl(base, direction, r, length, sides, .0, paint, mat=mat, r1=.0001, smooth=False)


# ============================================================================= Ironclad (armoured fighter)
# A heavy armoured fighter (user, 28 October: "more bulky and aggressive, more fear inducing"): massive stepped armour,
# rams, tusks and spikes, dark olive on gunmetal with hazard stripes, glowing red eye slits and red exhausts; about 1.5
# wide. Anchors: the hit region at the origin; the cockpit seat (0, 0.2, 0.2); wing roots under the hull at x +-0.25, out
# to x +-0.75; the engines at the tail, y -0.55 back to the nozzles near y -0.9.
IRONCLAD_PLUMES = dict(a=[(-.2, -.88, 0), (.2, -.88, 0)], b=[(-.28, -.9, 0), (0, -.94, .03), (.28, -.9, 0)],
                       c=[(-.44, -.84, -.02), (-.24, -.88, .02), (.24, -.88, .02), (.44, -.84, -.02)])


def red_eyes(h, y, z, x0=.08):
    for side in (-1, 1):
        h.box((side * x0, y, z), (.07, .012, .022), .0, 'lamp', GLOW)


def ironclad_hull(h, design):
    if design == 'a':   # The juggernaut: three stepped armour layers, a ram spike on the prow, red eye slits.
        solid(h, [(-.24, -.62), (.24, -.62), (.32, -.35), (.32, .28), (.2, .6), (-.2, .6), (-.32, .28), (-.32, -.35)], -.14, .2, 'steel', FRAME)
        solid(h, [(-.22, -.5), (.22, -.5), (.27, .2), (.15, .52), (-.15, .52), (-.27, .2)], .06, .08, 'olive')
        solid(h, [(-.15, -.35), (.15, -.35), (.18, .1), (.09, .38), (-.09, .38), (-.18, .1)], .14, .07, 'olive')
        spike(h, (0, .58, -.02), (0, 1, 0), .32, .07, 'steel', FRAME)
        red_eyes(h, .6, .02)
        for side in (-1, 1):
            spike(h, (side * .3, .22, .0), (side * .5, .7, .2), .22, .045, 'steel', FRAME)
            box_plate(h, side * .32, -.15, -.12, .03, .36, .16, 'olive')
        for y in (-.42, -.34):
            box_plate(h, 0, y, .21, .14, .022, .015, 'hazard')
    elif design == 'b':   # The warhammer: a wide hammerhead prow with twin forward tusks.
        solid(h, [(-.26, -.62), (.26, -.62), (.28, .2), (.42, .38), (.42, .58), (-.42, .58), (-.42, .38), (-.28, .2)], -.13, .2, 'steel', FRAME)
        solid(h, [(-.2, -.5), (.2, -.5), (.22, .2), (.36, .38), (.36, .5), (-.36, .5), (-.36, .38), (-.22, .2)], .07, .07, 'olive')
        for side in (-1, 1):
            spike(h, (side * .32, .56, -.02), (side * .12, 1, 0), .34, .06, 'steel', FRAME)
            solid(h, mirrored([(.05, .5), (.32, .5), (.3, .44), (.05, .44)], side), .14, .015, 'hazard')
        red_eyes(h, .585, .03, .18)
    else:   # The bastion: a spiked armour collar, dorsal armour fins, bolted side armour.
        solid(h, [(-.28, -.62), (.28, -.62), (.3, .42), (.18, .62), (-.18, .62), (-.3, .42)], -.14, .21, 'steel', FRAME)
        for side in (-1, 1):
            box_plate(h, side * .13, -.08, .07, .05, .5, .12, 'olive')
            solid(h, [(side * .11, -.45), (side * .15, -.45), (side * .15, .25), (side * .11, .25)], .19, .12, 'olive')
            for y in (-.38, .02, .36):
                h.box((side * .32, y, -.03), (.09, .17, .16), .01, 'olive', PLATE)
            for k in range(3):
                spike(h, (side * (.18 + k * .06), .58 - k * .05, .02), (side * .4, 1, .3), .18, .035, 'steel', FRAME)
        red_eyes(h, .62, .0, .07)
        box_plate(h, 0, .48, .07, .1, .06, .03, 'hazard')


def ironclad_wings(h, design):
    for side in (-1, 1):
        if design == 'a':   # Cannon slabs: short, very thick armour with a heavy twin cannon and a spike.
            solid(h, mirrored([(.25, .22), (.66, .12), (.7, -.32), (.25, -.38)], side), -.09, .13, 'olive')
            for dz in (-.13, -.05):
                h.cyl((side * .5, .55, dz), (0, -1, 0), .045, .62, 10, .004, 'steel', mat=FRAME, smooth=True)
            spike(h, (side * .68, -.1, .0), (side, -.2, 0), .2, .05, 'steel', FRAME)
            box_plate(h, side * .6, -.12, .04, .05, .14, .02, 'hazard')
        elif design == 'b':   # Serrated swept wings: a heavy armoured leading edge broken into teeth.
            solid(h, mirrored([(.25, .24), (.78, -.22), (.74, -.4), (.25, -.26)], side), -.06, .07, 'olive')
            solid(h, mirrored([(.25, .28), (.79, -.19), (.77, -.24), (.25, .22)], side), -.07, .11, 'steel', FRAME)
            for k in range(4):
                t = .2 + k * .2
                x, y = .25 + (.79 - .25) * t, .28 + (-.19 - .28) * t
                spike(h, (side * x, y, .0), (side * .5, 1, 0), .12, .03, 'steel', FRAME)
            h.box((side * .7, -.3, .0), (.05, .1, .14), .006, 'hazard', PLATE)
        else:   # Sponsons: armoured side pods with spiked missile racks.
            h.box((side * .48, -.05, -.02), (.26, .7, .18), .014, 'olive', PLATE)
            for k in range(3):
                h.cyl((side * (.41 + k * .065), .38, .09), (0, -1, 0), .024, .32, 8, .002, 'steel', mat=FRAME, smooth=True)
                h.box((side * (.41 + k * .065), .385, .09), (.02, .01, .02), .0, 'lamp', GLOW)
            spike(h, (side * .6, .2, .0), (side, .4, 0), .2, .05, 'steel', FRAME)
            spike(h, (side * .6, -.25, .0), (side, -.2, 0), .18, .045, 'steel', FRAME)
            box_plate(h, side * .32, -.05, .0, .07, .1, .05, 'steel', FRAME)


def ironclad_engines(h, design):
    if design == 'a':   # Twin heavy box engines with big red grilles and exhaust fins.
        for side in (-1, 1):
            h.box((side * .2, -.68, .0), (.27, .38, .22), .014, 'steel', FRAME)
            for k in range(4):
                h.box((side * .2, -.875, -.075 + k * .05), (.21, .012, .022), .0, 'lamp', GLOW)
            spike(h, (side * .32, -.76, .08), (side * .3, -1, .3), .14, .03, 'steel', FRAME)
    elif design == 'b':   # A tri-drive: a huge centre cylinder between two big ones, armoured collars.
        for x, r, z in ((-.28, .1, 0), (0, .14, .03), (.28, .1, 0)):
            h.cyl((x, -.5, z), (0, -1, 0), r, .4, 14, .01, 'steel', mat=FRAME, smooth=True)
            h.cyl((x, -.56, z), (0, -1, 0), r * 1.08, .06, 14, .004, 'olive', mat=PLATE, smooth=True)
            h.cyl((x, -.905, z), (0, -1, 0), r * .75, .02, 12, .0, 'lamp', mat=GLOW, smooth=True)
        h.box((0, -.6, .0), (.6, .12, .1), .008, 'olive', PLATE)
    else:   # Quad armoured cans, staggered, with flared nozzles.
        for x, z in ((-.44, -.02), (-.24, .02), (.24, .02), (.44, -.02)):
            h.cyl((x, -.45, z), (0, -1, 0), .08, .4, 12, .006, 'olive', mat=PLATE, smooth=True)
            h.cyl((x, -.84, z), (0, -1, 0), .08, .04, 12, .004, 'steel', mat=FRAME, r1=.1, smooth=True)
            h.cyl((x, -.885, z), (0, -1, 0), .07, .012, 10, .0, 'lamp', mat=GLOW, smooth=True)
        for side in (-1, 1):
            h.box((side * .34, -.55, .0), (.22, .14, .1), .008, 'steel', FRAME)


def ironclad_cockpit(h, design):
    if design == 'a':   # A sloped armoured hood with a single red slit.
        solid(h, [(-.14, .05), (.14, .05), (.1, .38), (-.1, .38)], .2, .1, 'olive')
        h.box((0, .37, .26), (.17, .02, .022), .0, 'lamp', GLOW)
        spike(h, (0, .1, .3), (0, -.3, 1), .14, .03, 'steel', FRAME)
    elif design == 'b':   # A gun turret: a low armoured dome with a heavy twin gun.
        h.cyl((0, .18, .2), (0, 0, 1), .15, .07, 14, .008, 'steel', mat=FRAME, r1=.1, smooth=True)
        h.cyl((0, .18, .27), (0, 0, 1), .09, .04, 12, .006, 'olive', mat=PLATE, r1=.05, smooth=True)
        for x in (-.045, .045):
            h.box((x, .4, .28), (.03, .3, .03), .003, 'steel', FRAME)
        h.box((0, .3, .26), (.12, .012, .015), .0, 'lamp', GLOW)
    else:   # A sunken bridge behind armour louvres, a red visor line.
        solid(h, [(-.16, .0), (.16, .0), (.13, .34), (-.13, .34)], .2, .04, 'black', FRAME)
        for y in (.06, .14, .22):
            box_plate(h, 0, y, .24, .15, .016, .02, 'olive')
        h.box((0, .33, .23), (.2, .012, .015), .0, 'lamp', GLOW)


# ============================================================================= Interceptor (assault interceptor)
# A sleek, very aggressive split-boom fighter (docs/04; user, 28 October: "sleek and very aggressive fighter like"): knife
# noses, sharp chines and canards, long pointed wings, spear-tipped booms with canted fins; pearl and cobalt with black
# accents, blue glow; about 1.4 wide, 1.7 long. Anchors: the hit region at the origin; a narrow fuselage (|x| < 0.14)
# from y -0.45 to a long nose; wing roots under it at x +-0.1; the booms (the engines slot) at x +-0.36 from y 0.35
# back to y -0.82; the cockpit seat (0, 0.32, 0.08).
INTERCEPTOR_PLUMES = dict(a=[(-.36, -.84, 0), (.36, -.84, 0)], b=[(-.36, -.82, 0), (.36, -.82, 0)],
                          c=[(-.36, -.8, 0), (.36, -.8, 0), (0, -.62, 0)])


def interceptor_hull(h, design):
    if design == 'a':   # The viper: a knife nose, sharp chines widening to the wing roots, a black spine.
        solid(h, [(-.13, -.45), (.13, -.45), (.17, .05), (.06, .62), (0, .95), (-.06, .62), (-.17, .05)], -.06, .11, 'pearl')
        solid(h, [(-.025, -.4), (.025, -.4), (.02, .78), (-.02, .78)], .05, .012, 'black', FRAME)
        for side in (-1, 1):
            solid(h, mirrored([(.06, .62), (.2, .0), (.22, -.05), (.08, .62)], side), -.02, .015, 'cobalt')
    elif design == 'b':   # The hornet: raked angular intakes and small canards behind a short sharp nose.
        solid(h, [(-.12, -.45), (.12, -.45), (.14, .3), (.05, .65), (0, .82), (-.05, .65), (-.14, .3)], -.06, .11, 'pearl')
        for side in (-1, 1):
            solid(h, mirrored([(.12, -.1), (.2, .0), (.2, .32), (.12, .26)], side), -.05, .09, 'black', FRAME)
            solid(h, mirrored([(.12, .45), (.3, .38), (.31, .35), (.12, .38)], side), .02, .015, 'cobalt')
    else:   # The talon: an arrowhead nose with forward-swept canards and a dorsal blade.
        solid(h, [(-.11, -.45), (.11, -.45), (.12, .3), (.2, .4), (0, .9), (-.2, .4), (-.12, .3)], -.06, .11, 'pearl')
        for side in (-1, 1):
            solid(h, mirrored([(.1, .48), (.27, .56), (.29, .52), (.1, .4)], side), .0, .015, 'cobalt')
        solid(h, [(-.012, -.3), (.012, -.3), (.012, .2), (-.012, .2)], .05, .1, 'black', FRAME)


def interceptor_wings(h, design):
    for side in (-1, 1):
        if design == 'a':   # Long forward-swept wings, needle tips, a black stripe.
            solid(h, mirrored([(.1, .02), (.72, .3), (.76, .22), (.6, .02), (.1, -.36)], side), -.025, .035, 'pearl')
            solid(h, mirrored([(.42, .16), (.74, .29), (.75, .25), (.44, .11)], side), .012, .008, 'black', FRAME)
        elif design == 'b':   # A cranked arrow delta with sharp tips.
            solid(h, mirrored([(.1, .32), (.3, .0), (.7, -.42), (.62, -.42), (.1, -.4)], side), -.025, .03, 'pearl')
            solid(h, mirrored([(.1, .32), (.3, .0), (.7, -.42), (.66, -.42), (.28, -.02), (.1, .26)], side), .005, .01, 'cobalt')
        else:   # Long, thin swept-back blades with canted tip fins.
            solid(h, mirrored([(.1, .2), (.76, -.26), (.74, -.34), (.4, -.24), (.1, -.24)], side), -.022, .028, 'pearl')
            solid(h, mirrored([(.1, .2), (.76, -.26), (.75, -.29), (.1, .15)], side), .008, .008, 'black', FRAME)
            fin = mirrored([(.72, -.16), (.75, -.16), (.75, -.36), (.72, -.36)], side)
            lo = [h.v((x, y, -.02)) for x, y in fin]
            hi = [h.v((x + side * .06, y, .16)) for x, y in fin]
            h.face(tuple(hi), 'cobalt', 'main', PLATE, outward=(side * -.9, 0, .4))
            h.face(tuple(reversed(lo)), 'cobalt', 'main', PLATE, outward=(0, 0, -1))
            for i in range(4):
                j = (i + 1) % 4
                a, b = fin[i], fin[j]
                h.face((lo[i], lo[j], hi[j], hi[i]), 'cobalt', 'edge', PLATE, outward=(b[1] - a[1], a[0] - b[0], 0))


def interceptor_engines(h, design):
    for side in (-1, 1):
        x = side * .36
        if design == 'a':   # Spear booms: a pointed front, canted tail fins (the split boom).
            h.cyl((x, .35, .0), (0, -1, 0), .0001, .22, 10, .0, 'black', mat=FRAME, r1=.06, smooth=True)
            h.cyl((x, .13, .0), (0, -1, 0), .06, .93, 10, .005, 'pearl', mat=PLATE, smooth=True)
            h.cyl((x, -.8, .0), (0, -1, 0), .045, .02, 10, .0, 'lamp', mat=GLOW, smooth=True)
            solid(h, mirrored([(.34, -.48), (.5, -.74), (.5, -.8), (.34, -.74)], side), .03, .012, 'cobalt')
        elif design == 'b':   # Booms joined by a sharp tailplane, black intake tips.
            h.cyl((x, .3, .0), (0, -1, 0), .0001, .16, 10, .0, 'cobalt', mat=PLATE, r1=.065, smooth=True)
            h.cyl((x, .14, .0), (0, -1, 0), .065, .94, 10, .005, 'pearl', mat=PLATE, smooth=True)
            h.cyl((x, -.8, .0), (0, -1, 0), .05, .02, 10, .0, 'lamp', mat=GLOW, smooth=True)
            for lean in (-1, 1):   # Canted twin fins on each boom: a root along the boom, a swept tip leaning out.
                points = ((x + lean * .03, -.5, .03), (x + lean * .03, -.78, .03), (x + lean * .13, -.8, .19), (x + lean * .13, -.66, .19))
                for face_out in ((-lean, 0, .3), (lean, 0, -.3)):   # Both sides, each with its own vertices.
                    h.face(tuple(h.v(p) for p in points), 'black', 'main', FRAME, outward=face_out)
        else:   # Booms with ring nacelles, and a small centre booster.
            h.cyl((x, .3, .0), (0, -1, 0), .0001, .16, 10, .0, 'black', mat=FRAME, r1=.05, smooth=True)
            h.cyl((x, .14, .0), (0, -1, 0), .05, .72, 10, .005, 'pearl', mat=PLATE, smooth=True)
            h.cyl((x, -.6, .0), (0, -1, 0), .1, .18, 14, .008, 'cobalt', mat=PLATE, r1=.08, smooth=True)
            h.cyl((x, -.79, .0), (0, -1, 0), .065, .015, 12, .0, 'lamp', mat=GLOW, smooth=True)
            if side > 0:
                h.cyl((0, -.42, .0), (0, -1, 0), .05, .2, 10, .004, 'black', mat=FRAME, smooth=True)
                h.cyl((0, -.62, .0), (0, -1, 0), .035, .01, 8, .0, 'lamp', mat=GLOW, smooth=True)


def interceptor_cockpit(h, design):
    if design == 'a':   # A long, low teardrop canopy.
        h.cyl((0, .55, .05), (0, -1, 0), .06, .4, 12, .006, 'navy', mat=FRAME, r1=.03, smooth=True)
    elif design == 'b':   # A tandem canopy under one sharp frame.
        for y in (.52, .34):
            h.cyl((0, y, .06), (0, -1, 0), .058, .16, 10, .005, 'navy', mat=FRAME, r1=.045, smooth=True)
        h.box((0, .42, .115), (.012, .38, .012), .002, 'pearl', PLATE)
    else:   # A flush faceted visor, a blue line across it.
        solid(h, [(-.08, .25), (.08, .25), (.05, .58), (0, .66), (-.05, .58)], .05, .03, 'navy', FRAME)
        h.box((0, .5, .085), (.07, .01, .01), .0, 'lamp', GLOW)


# ============================================================================= Spectre (exotic)
# An alien-touched flying wing (docs/04's broad apex): obsidian with pale silver, violet glow lines; about 1.7 wide.
# Silver leading edges and violet trims keep its outline readable over dark worlds (Umbra, Nacre).
# Anchors: the hit region at the origin; a central body (|x| < 0.2) from y -0.5 to 0.6; the wings (the flying wing)
# out to x +-0.85; the drives along the trailing edge or at the centre; the cockpit a glowing eye or crystal at
# (0, 0.2, 0.1).
SPECTRE_PLUMES = dict(a=[(-.35, -.48, 0), (0, -.55, 0), (.35, -.48, 0)], b=[(-.3, -.6, 0), (.3, -.6, 0)], c=[(0, -.7, 0)])


def spectre_hull(h, design):
    if design == 'a':   # The manta: a smooth lens body.
        solid(h, [(-.15, -.5), (.15, -.5), (.2, -.1), (.16, .35), (0, .6), (-.16, .35), (-.2, -.1)], -.06, .12, 'obsidian')
        solid(h, [(-.04, -.4), (.04, -.4), (.03, .45), (-.03, .45)], .06, .01, 'silver')
        for side in (-1, 1):
            solid(h, mirrored([(.16, .35), (0, .6), (0, .55), (.13, .32)], side), .05, .015, 'silver')
    elif design == 'b':   # The crescent: forward horns curving round the nose.
        solid(h, [(-.18, -.5), (.18, -.5), (.2, .2), (.06, .38), (-.06, .38), (-.2, .2)], -.06, .12, 'obsidian')
        for side in (-1, 1):
            solid(h, mirrored([(.06, .38), (.2, .2), (.22, .45), (.12, .7), (.1, .55)], side), -.03, .07, 'silver')
    else:   # The shard: a crystalline faceted core, stepped facets.
        solid(h, [(-.16, -.5), (.16, -.5), (.2, .0), (.0, .62), (-.2, .0)], -.06, .1, 'obsidian')
        solid(h, [(-.1, -.35), (.1, -.35), (.12, .0), (.0, .45), (-.12, .0)], .04, .05, 'obsidian')
        solid(h, [(-.04, -.2), (.04, -.2), (.05, .0), (.0, .25), (-.05, .0)], .09, .04, 'silver')


def spectre_wings(h, design):
    for side in (-1, 1):
        if design == 'a':   # The manta wing: a broad sweep, a silver leading edge, a violet seam along the trailing edge.
            solid(h, mirrored([(.15, .3), (.85, -.3), (.8, -.42), (.15, -.45)], side), -.025, .035, 'obsidian')
            solid(h, mirrored([(.15, .3), (.86, -.29), (.84, -.33), (.15, .24)], side), -.02, .04, 'silver')
            solid(h, mirrored([(.18, -.42), (.8, -.39), (.78, -.42), (.18, -.45)], side), .01, .008, 'lamp', GLOW)
            solid(h, mirrored([(.4, -.05), (.62, -.24), (.6, -.27), (.38, -.08)], side), .01, .008, 'silver')
        elif design == 'b':   # Crescent wings: a moon-shaped blade, its outer edge curving back then forward to a point.
            outer = [(.15 + .7 * math.sin(t * math.pi * .55), .05 - .32 * math.sin(t * math.pi) + .35 * t * t) for t in [k / 7 for k in range(8)]]
            inner = [(.15 + .5 * math.sin(t * math.pi * .55), -.22 - .1 * math.sin(t * math.pi) + .3 * t * t) for t in [k / 7 for k in range(7, -1, -1)]]
            solid(h, mirrored(outer + inner[1:-1] + [(.15, -.22)], side), -.025, .035, 'obsidian')
            solid(h, mirrored([outer[k] for k in range(2, 8)] + [(p[0] - .02, p[1] - .04) for p in reversed([outer[k] for k in range(2, 8)])], side), -.02, .04, 'silver')
            tip = outer[-1]
            h.box((side * tip[0], tip[1], .02), (.03, .03, .02), .0, 'lamp', GLOW)
        else:   # Split blades: three separate fins fanning out from each side.
            for k, (ang, ln) in enumerate(((.25, .7), (-.05, .78), (-.35, .62))):
                ca, sa = math.cos(ang), math.sin(ang)
                root = (.15, .1 - k * .2)
                tip = (root[0] + ca * ln, root[1] + sa * ln)
                n = (-sa * .05, ca * .05)
                blade = [(root[0] + n[0], root[1] + n[1]), (tip[0], tip[1]), (root[0] - n[0], root[1] - n[1])]
                solid(h, mirrored(blade, side), -.02, .03, 'obsidian')
                solid(h, mirrored([(root[0] + (tip[0] - root[0]) * .7 + n[0] * .2, root[1] + (tip[1] - root[1]) * .7 + n[1] * .2), (tip[0], tip[1]),
                                    (root[0] + (tip[0] - root[0]) * .7 - n[0] * .2, root[1] + (tip[1] - root[1]) * .7 - n[1] * .2)], side), .01, .008, 'lamp', GLOW)


def spectre_engines(h, design):
    if design == 'a':   # Trailing-edge slits: wide violet glow bars.
        for x, w in ((-.35, .16), (0, .2), (.35, .16)):
            h.box((x, -.47, .0), (w * 1.2, .08, .06), .006, 'obsidian', PLATE)
            h.box((x, -.515, .0), (w, .012, .03), .0, 'lamp', GLOW)
    elif design == 'b':   # Twin ring drives: vertical rings with glowing cores.
        for side in (-1, 1):
            h.cyl((side * .3, -.42, .0), (0, -1, 0), .16, .16, 18, .01, 'silver', mat=PLATE, smooth=True)
            h.cyl((side * .3, -.585, .0), (0, -1, 0), .12, .012, 16, .0, 'lamp', mat=GLOW, smooth=True)
            h.cyl((side * .3, -.41, .0), (0, 1, 0), .11, .012, 16, .0, 'lamp', mat=GLOW, smooth=True)
            h.box((side * .2, -.42, .0), (.12, .08, .05), .006, 'obsidian', PLATE)
    else:   # A singularity drive: a glowing orb held in a silver cradle behind the body.
        h.cyl((0, -.62, -.1), (0, 0, 1), .0001, .1, 14, .0, 'lamp', mat=GLOW, r1=.1, smooth=True)
        h.cyl((0, -.62, .0), (0, 0, 1), .1, .1, 14, .0, 'lamp', mat=GLOW, r1=.0001, smooth=True)
        for side in (-1, 1):
            solid(h, mirrored([(.06, -.45), (.16, -.5), (.16, -.72), (.12, -.74), (.1, -.55)], side), -.03, .06, 'silver')


def spectre_cockpit(h, design):
    if design == 'a':   # A glowing eye under a dark lid.
        h.cyl((0, .22, .06), (0, 0, 1), .07, .05, 12, .0, 'lamp', mat=GLOW, r1=.03, smooth=True)
        solid(h, [(-.1, .3), (.1, .3), (.06, .36), (-.06, .36)], .06, .06, 'obsidian')
    elif design == 'b':   # A crystal spire: a tall faceted prism of light.
        h.cyl((0, .18, .06), (0, 0, 1), .06, .2, 6, .0, 'lamp', mat=GLOW, r1=.0001, smooth=False)
        h.cyl((0, .18, .05), (0, 0, 1), .08, .03, 6, .004, 'silver', mat=PLATE, smooth=False)
    else:   # A dark visor band with a violet line.
        solid(h, [(-.13, .1), (.13, .1), (.1, .32), (-.1, .32)], .06, .04, 'black', FRAME)
        h.box((0, .3, .095), (.16, .012, .01), .0, 'lamp', GLOW)


CHASSIS = dict(
    scrapper=dict(hull=scrapper_hull, wings=scrapper_wings, engines=scrapper_engines, cockpit=scrapper_cockpit,
                  plumes=SCRAPPER_PLUMES, mats=('scrapper_plate', 'scrapper_frame', 'scrapper_glow'), glow='#78f9f1'),
    ironclad=dict(hull=ironclad_hull, wings=ironclad_wings, engines=ironclad_engines, cockpit=ironclad_cockpit,
                  plumes=IRONCLAD_PLUMES, mats=('ironclad_plate', 'ironclad_frame', 'ironclad_glow'), glow='#ff4a24'),
    interceptor=dict(hull=interceptor_hull, wings=interceptor_wings, engines=interceptor_engines, cockpit=interceptor_cockpit,
                     plumes=INTERCEPTOR_PLUMES, mats=('interceptor_plate', 'interceptor_frame', 'interceptor_glow'), glow='#5aa8ff'),
    spectre=dict(hull=spectre_hull, wings=spectre_wings, engines=spectre_engines, cockpit=spectre_cockpit,
                 plumes=SPECTRE_PLUMES, mats=('spectre_plate', 'spectre_frame', 'spectre_glow'), glow='#b46cff'),
)


# ============================================================================= build, verify, preview
def build_part(chassis, slot, design, mats):
    h = vc.HS(random.Random('hero-kit:%s:%s:%s' % (chassis, slot, design)))
    # Rounder cylinders (engines, barrels, booms): half as many sides again; four- and six-sided spikes stay sharp.
    cyl = h.cyl
    h.cyl = lambda p0, axis, r, length, seg, *a, **k: cyl(p0, axis, r, length, seg if seg <= 6 else max(seg, round(seg * 1.5)), *a, **k)
    CHASSIS[chassis][slot](h, design)
    vc.triangulate_nonplanar(h)
    name = 'hero_%s_%s_%s' % (chassis, slot, design)
    colours = vc.bake(h, name, dict(glow={GLOW}, paints=PAINTS, ao=.2, ground=None))
    corner = 0
    for f, paint in zip(h.faces, h.fpaint):
        a = ROLE_ALPHA.get(paint if isinstance(paint, str) else paint[0], 1.0)
        for c in range(corner, corner + len(f)):
            colours[c] = (colours[c][0], colours[c][1], colours[c][2], a)
        corner += len(f)
    ob = vc.make_object(name, h, mats, (0.0, 0.0, 0.0), colours)
    refine(ob)
    print('HKIT %-28s tris=%4d (before bevel %d)' % (name, sum(len(p.vertices) - 2 for p in ob.data.polygons), h.tris()))
    return ob


def refine(ob):
    """Hard-surface finish (user, 28 October: "make them more sophisticated"): every edge sharper than 35 degrees gets a
    small bevel with hardened normals, so flat panels shade flat and their edges catch the light. Bevel faces
    blend the colours either side; their paint role snaps to the painted side, so a recolour reaches them too."""
    me = ob.data
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.set_sharp_from_angle(angle=math.radians(35))
    bevel = ob.modifiers.new('bevel', 'BEVEL')
    bevel.width, bevel.segments, bevel.limit_method, bevel.angle_limit = .012, 1, 'ANGLE', math.radians(35)
    bevel.harden_normals, bevel.miter_outer = True, 'MITER_ARC'
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    # No zero-area slivers (a bevel meeting a tight corner leaves some; their normals are undefined).
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges[:])
    bm.to_mesh(ob.data)
    bm.free()
    # Triangles now, as the exporter would cut them, so the UVs below are projected per exported face.
    tri = ob.modifiers.new('triangulate', 'TRIANGULATE')
    tri.keep_custom_normals = True
    bpy.ops.object.modifier_apply(modifier=tri.name)
    me = ob.data
    attr = me.color_attributes[vc.COLOR_ATTR]
    colours = [0.0] * (len(attr.data) * 4)
    attr.data.foreach_get('color', colours)
    for k in range(3, len(colours), 4):
        a = colours[k]
        colours[k] = 1.0 if a > .97 else .75 if a > .6 else .5
    # Edge highlights: the bevel's own faces (narrow strips along every hard edge) are lighter, like worn paint on machined
    # edges, so panels and plates read outlined even at the ship's small size in flight. Glow faces stay as they are.
    glow, lit = {i for i, m in enumerate(me.materials) if m and 'glow' in m.name}, 0
    for poly in me.polygons:
        if poly.material_index in glow or poly.area > .0016:
            continue
        verts = [me.vertices[v].co for v in poly.vertices]
        span = max((a - b).length for a in verts for b in verts)
        if span < 1e-6 or poly.area / (span * span) > .08:
            continue
        lit += 1
        for li in poly.loop_indices:
            c = li * 4
            # Toward a pale worn-metal tone: a multiply did nothing on dark armour.
            colours[c:c + 3] = [colours[c + j] + (.42 - colours[c + j]) * .3 for j in range(3)]
    attr.data.foreach_set('color', colours)
    print('HKIT %s edge highlights on %d of %d faces' % (ob.name, lit, len(me.polygons)))
    # One UV for the whole part, in the middle of a plate of the game's panel map (src/render/models.ts
    # createPanelTexture; texel 17, 114, thirteen texels from any seam): on a ship this small the box-projected seams
    # tiled into a brick pattern; the geometric panels above carry the detail. (glTF v is Blender's 1 - v.)
    uv = me.uv_layers['UVMap'].data
    for loop in uv:
        loop.uv = (.1367, 1 - .8945)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser(prog='hero_kit.py')
    ap.add_argument('--chassis', default='scrapper', choices=sorted(CHASSIS))
    ap.add_argument('--glb', required=True)
    ap.add_argument('--preview-dir', default=None)
    args = ap.parse_args(argv)
    spec = CHASSIS[args.chassis]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    names = spec['mats']
    mats = [vc.make_material(names[0], 'vc', rough=.43, metal=.35), vc.make_material(names[1], 'vc', rough=.29, metal=.82),
            vc.make_material(names[2], 'glow', colour=spec['glow'], emission=1)]  # (the game sets the glow's strength)
    parts, nodes = {}, {}
    for slot in SLOTS:
        for design in DESIGNS:
            ob = build_part(args.chassis, slot, design, mats)
            parts[(slot, design)] = ob
            nodes[ob.name] = dict(budget=BUDGET[slot], mats=names, x=(-.95, .95), z=(-.95, .95), uv='flat')
    for design in DESIGNS:
        for i, p in enumerate(spec['plumes'][design]):
            name = 'hero_%s_engines_%s_engine_%d' % (args.chassis, design, i)
            vc.make_empty(name, (p[0], p[2], -p[1]))
            nodes[name] = dict(empty=True, t=(p[0], p[2], -p[1]))
    vc.publish(args.glb, 'hero_kit.py', dict(materials=names, nodes=nodes, max_bytes=3_000_000), 'HKIT')
    if args.preview_dir:
        render_previews(args, parts, mats)


def render_previews(args, parts, mats):
    """Nine assembled ships (the three all-one-design presets and six seeded mixes) from the game camera and from above."""
    import boss_remodel as br
    scene = bpy.context.scene
    rng = random.Random('hero-kit-preview')
    combos = [{s: d for s in SLOTS} for d in DESIGNS] + [{s: rng.choice(DESIGNS) for s in SLOTS} for _ in range(6)]
    shown = []
    for k, combo in enumerate(combos):
        ox, oy = (k % 3 - 1) * 2.0, -(k // 3 - 1) * 2.0
        for slot, design in combo.items():
            src = parts[(slot, design)]
            ob = src.copy()
            scene.collection.objects.link(ob)
            ob.location = (ox, oy, 0)
            shown.append(ob)
        print('HKIT combo %d: %s' % (k, ' '.join('%s-%s' % (s, combo[s]) for s in SLOTS)))
    for src in parts.values():
        src.hide_render = True
    os.makedirs(args.preview_dir, exist_ok=True)
    for view in ('game', 'top'):
        br.render_view(scene, view, (0, 0, 0), 6.6, os.path.join(args.preview_dir, '%s-%s.png' % (args.chassis, view)), res=1200,
                       objects=shown, light='desert')
    # Close-ups of the three presets (top row), to judge the finish.
    for k in range(3):
        br.render_view(scene, 'game', ((k - 1) * 2.0, 2.0, 0), 1.9, os.path.join(args.preview_dir, '%s-close-%s.png' % (args.chassis, DESIGNS[k])), res=700,
                       objects=shown[k * 4:k * 4 + 4], light='desert')


if __name__ == '__main__':
    main()
