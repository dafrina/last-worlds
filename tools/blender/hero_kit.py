"""Modular hero ships for Last Worlds (docs/31-hero-ships.md): per chassis, four part slots (hull, wings, engines,
cockpit) in three designs each, mixed and matched within that chassis.

Every design of a chassis is authored in place around that chassis's shared anchors (cockpit seat, wing roots, engine
mounts, the hit-region centre at the origin), so any hull, wings, engines and cockpit of one chassis assemble without
runtime transforms: the game merges the chosen part nodes into one mesh. Parts are cosmetic only (docs/04 section 9):
the central hit region, handling and gun origins never change.

Node names: hero_<chassis>_<slot>_<design>, slot in hull | wings | engines | cockpit, design a | b | c. Each engines
design carries its own exhaust empties hero_<chassis>_engines_<design>_plume_<i> (the engine glow sockets).

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
              olive=('#4f5a36', .2, '#7d8a5a'), steel=('#33383d', .3, '#6b747c'), hazard=('#b58a1c', .2, '#e2b84a'),
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
BUDGET = dict(hull=760, wings=640, engines=1400, cockpit=360)


def solid(h, points, z, height, paint, mat=PLATE):
    """A chamfered-free planar plate in Blender x/y, `height` thick from z (the Scrapper's hard-surface plates)."""
    lo = [h.v((x, y, z)) for x, y in points]
    hi = [h.v((x, y, z + height)) for x, y in points]
    h.face(tuple(hi), paint, 'main', mat, outward=(0, 0, 1))
    h.face(tuple(reversed(lo)), paint, 'main', mat, outward=(0, 0, -1))
    for i in range(len(points)):
        j = (i + 1) % len(points)
        a, b = points[i], points[j]
        h.face((lo[i], lo[j], hi[j], hi[i]), paint, 'edge', mat, outward=(b[1] - a[1], a[0] - b[0], 0))


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


# ============================================================================= Ironclad (armoured fighter)
# A heavy armoured fighter: thick layered olive armour on dark steel, hazard-stripe accents, amber glow; blocky and
# broad (about 1.4 wide). Anchors: the hit region at the origin; the cockpit seat (0, 0.2, 0.16); wing roots under the
# hull at x +-0.25, out to x +-0.7; the engines at the tail, y -0.55 back to the nozzles near y -0.85.
IRONCLAD_PLUMES = dict(a=[(-.2, -.86, 0), (.2, -.86, 0)], b=[(-.26, -.84, 0), (0, -.88, .02), (.26, -.84, 0)],
                       c=[(-.42, -.78, -.02), (-.24, -.82, .02), (.24, -.82, .02), (.42, -.78, -.02)])


def ironclad_hull(h, design):
    if design == 'a':   # The bulwark: a thick octagonal slab under a second, smaller armour layer; steel side skirts.
        oct_ = [(-.22, -.6), (.22, -.6), (.3, -.35), (.3, .3), (.18, .62), (-.18, .62), (-.3, .3), (-.3, -.35)]
        solid(h, oct_, -.12, .2, 'steel', FRAME)
        solid(h, [(-.18, -.45), (.18, -.45), (.22, .2), (.12, .5), (-.12, .5), (-.22, .2)], .08, .07, 'olive')
        for side in (-1, 1):
            box_plate(h, side * .31, -.1, -.1, .025, .32, .14, 'olive')
        for y in (-.4, -.32):
            box_plate(h, 0, y, .15, .16, .025, .015, 'hazard')
    elif design == 'b':   # The wedge: an armoured prow narrowing to a blade, olive top plates, a hazard chevron.
        solid(h, [(-.28, -.6), (.28, -.6), (.3, .0), (.12, .55), (0, .72), (-.12, .55), (-.3, .0)], -.11, .18, 'steel', FRAME)
        solid(h, [(-.2, -.5), (.2, -.5), (.22, .0), (0, .55), (-.22, .0)], .07, .06, 'olive')
        for side in (-1, 1):
            solid(h, mirrored([(.0, .3), (.16, .1), (.16, .04), (.0, .24)], side), .13, .015, 'hazard')
    else:   # The citadel: a boxy hull with twin raised armour ridges and bolted-on side armour boxes.
        solid(h, [(-.26, -.6), (.26, -.6), (.26, .45), (.16, .6), (-.16, .6), (-.26, .45)], -.12, .19, 'steel', FRAME)
        for side in (-1, 1):
            box_plate(h, side * .12, -.05, .07, .045, .5, .1, 'olive')
            for y in (-.35, .05, .35):
                h.box((side * .3, y, -.02), (.08, .16, .14), .01, 'olive', PLATE)
        box_plate(h, 0, .5, .07, .1, .06, .03, 'hazard')


def ironclad_wings(h, design):
    for side in (-1, 1):
        if design == 'a':   # Stub slabs: short, thick armoured trapezoids, a heavy cannon under each.
            solid(h, mirrored([(.25, .2), (.62, .1), (.66, -.3), (.25, -.36)], side), -.07, .1, 'olive')
            h.cyl((side * .48, .42, -.1), (0, -1, 0), .045, .5, 10, .004, 'steel', mat=FRAME, smooth=True)
            box_plate(h, side * .58, -.1, .03, .05, .14, .02, 'hazard')
        elif design == 'b':   # Swept heavy wings with a thick armoured leading edge.
            solid(h, mirrored([(.25, .22), (.72, -.2), (.7, -.36), (.25, -.24)], side), -.05, .06, 'olive')
            solid(h, mirrored([(.25, .26), (.73, -.17), (.72, -.22), (.25, .2)], side), -.06, .1, 'steel', FRAME)
            h.box((side * .66, -.27, .0), (.04, .1, .12), .006, 'hazard', PLATE)
        else:   # Sponsons: no wings, but side pods with missile racks.
            h.box((side * .46, -.05, -.02), (.24, .66, .16), .014, 'olive', PLATE)
            for k in range(3):
                h.cyl((side * (.4 + k * .06), .34, .08), (0, -1, 0), .022, .3, 8, .002, 'steel', mat=FRAME, smooth=True)
                h.box((side * (.4 + k * .06), .345, .08), (.02, .01, .02), .0, 'lamp', GLOW)
            box_plate(h, side * .32, -.05, .0, .07, .1, .05, 'steel', FRAME)


def ironclad_engines(h, design):
    if design == 'a':   # Twin heavy box engines with glowing grilles.
        for side in (-1, 1):
            h.box((side * .2, -.68, .0), (.24, .38, .18), .012, 'steel', FRAME)
            for k in range(3):
                h.box((side * .2, -.875, -.05 + k * .05), (.18, .012, .02), .0, 'lamp', GLOW)
    elif design == 'b':   # A tri-drive: a big centre cylinder between two smaller ones.
        for x, r, z in ((-.26, .08, 0), (0, .11, .02), (.26, .08, 0)):
            h.cyl((x, -.5, z), (0, -1, 0), r, .34, 12, .008, 'steel', mat=FRAME, smooth=True)
            h.cyl((x, -.84, z), (0, -1, 0), r * .7, .02, 10, .0, 'lamp', mat=GLOW, smooth=True)
        h.box((0, -.6, .0), (.5, .1, .08), .008, 'olive', PLATE)
    else:   # Quad sponson cans, staggered.
        for x, z in ((-.42, -.02), (-.24, .02), (.24, .02), (.42, -.02)):
            h.cyl((x, -.45, z), (0, -1, 0), .07, .36, 12, .006, 'olive', mat=PLATE, smooth=True)
            h.cyl((x, -.81, z), (0, -1, 0), .05, .012, 10, .0, 'lamp', mat=GLOW, smooth=True)
        for side in (-1, 1):
            h.box((side * .33, -.55, .0), (.2, .12, .08), .008, 'steel', FRAME)


def ironclad_cockpit(h, design):
    if design == 'a':   # An armoured hood with a single glowing slit.
        solid(h, [(-.13, .05), (.13, .05), (.1, .36), (-.1, .36)], .14, .1, 'olive')
        h.box((0, .35, .2), (.16, .02, .02), .0, 'lamp', GLOW)
    elif design == 'b':   # A blister turret: a low dome with a twin gun.
        h.cyl((0, .2, .15), (0, 0, 1), .13, .06, 14, .008, 'steel', mat=FRAME, r1=.09, smooth=True)
        h.cyl((0, .2, .21), (0, 0, 1), .08, .04, 12, .006, 'black', mat=FRAME, r1=.04, smooth=True)
        for x in (-.04, .04):
            h.box((x, .38, .22), (.02, .22, .02), .002, 'steel', FRAME)
    else:   # A sunken bridge: low dark glass behind armour louvres.
        solid(h, [(-.15, .0), (.15, .0), (.12, .32), (-.12, .32)], .14, .04, 'black', FRAME)
        for y in (.06, .14, .22):
            box_plate(h, 0, y, .18, .14, .015, .02, 'olive')


# ============================================================================= Interceptor (assault interceptor)
# A narrow split-boom interceptor (docs/04): pearl white and cobalt, blue glow; long and narrow (about 1.35 wide, 1.6
# long). Anchors: the hit region at the origin; a narrow fuselage (|x| < 0.13) from y -0.45 to a long nose; wing roots
# under it at x +-0.1; the booms (the engines slot) at x +-0.36 from y 0.2 back to y -0.8; the cockpit seat (0, 0.3, 0.1).
INTERCEPTOR_PLUMES = dict(a=[(-.36, -.82, 0), (.36, -.82, 0)], b=[(-.36, -.8, 0), (.36, -.8, 0)],
                          c=[(-.36, -.78, 0), (.36, -.78, 0), (0, -.6, 0)])


def interceptor_hull(h, design):
    if design == 'a':   # The lance: a long needle nose, cobalt spine stripe.
        solid(h, [(-.12, -.45), (.12, -.45), (.13, .3), (.05, .7), (0, .86), (-.05, .7), (-.13, .3)], -.07, .13, 'pearl')
        solid(h, [(-.03, -.4), (.03, -.4), (.03, .7), (-.03, .7)], .06, .01, 'cobalt')
    elif design == 'b':   # The shark: a wider chined body with side intakes.
        solid(h, [(-.12, -.45), (.12, -.45), (.17, .1), (.1, .55), (0, .72), (-.1, .55), (-.17, .1)], -.06, .12, 'pearl')
        for side in (-1, 1):
            h.box((side * .15, .05, -.01), (.06, .2, .07), .006, 'navy', FRAME)
            solid(h, mirrored([(.1, .55), (.17, .1), (.2, .05), (.12, .55)], side), -.02, .02, 'cobalt')
    else:   # The arrow: an arrowhead nose with small canards.
        solid(h, [(-.11, -.45), (.11, -.45), (.12, .35), (.18, .45), (0, .8), (-.18, .45), (-.12, .35)], -.065, .12, 'pearl')
        for side in (-1, 1):
            solid(h, mirrored([(.1, .5), (.28, .42), (.28, .38), (.1, .4)], side), .0, .02, 'cobalt')


def interceptor_wings(h, design):
    for side in (-1, 1):
        if design == 'a':   # Forward-swept, the interceptor's signature.
            solid(h, mirrored([(.1, -.1), (.62, .18), (.66, .1), (.1, -.3)], side), -.03, .04, 'pearl')
            solid(h, mirrored([(.5, .12), (.64, .2), (.66, .12), (.52, .05)], side), .01, .01, 'cobalt')
        elif design == 'b':   # A clean delta joining the booms.
            solid(h, mirrored([(.1, .3), (.6, -.4), (.1, -.42)], side), -.03, .035, 'pearl')
            solid(h, mirrored([(.1, .3), (.6, -.4), (.55, -.4), (.1, .22)], side), .005, .01, 'cobalt')
        else:   # Long, thin swept-back wings with tip fins.
            solid(h, mirrored([(.1, .08), (.7, -.2), (.7, -.28), (.1, -.14)], side), -.025, .03, 'pearl')
            solid(h, mirrored([(.68, -.12), (.72, -.12), (.72, -.32), (.68, -.32)], side), -.08, .18, 'cobalt')


def interceptor_engines(h, design):
    for side in (-1, 1):
        x = side * .36
        if design == 'a':   # Twin booms with angled tail fins (the split boom).
            h.cyl((x, .2, .0), (0, -1, 0), .065, .98, 12, .006, 'pearl', mat=PLATE, smooth=True)
            h.cyl((x, -.78, .0), (0, -1, 0), .05, .02, 10, .0, 'lamp', mat=GLOW, smooth=True)
            solid(h, mirrored([(.34, -.5), (.46, -.72), (.46, -.78), (.34, -.74)], side), .04, .015, 'cobalt')
        elif design == 'b':   # Twin booms joined by a tailplane.
            h.cyl((x, .15, .0), (0, -1, 0), .07, .93, 12, .006, 'pearl', mat=PLATE, smooth=True)
            h.cyl((x, -.78, .0), (0, -1, 0), .055, .02, 10, .0, 'lamp', mat=GLOW, smooth=True)
            if side > 0:
                box_plate(h, 0, -.68, .02, .38, .05, .02, 'cobalt')
        else:   # Booms with ring nacelles, and a small centre booster.
            h.cyl((x, .1, .0), (0, -1, 0), .05, .7, 10, .005, 'pearl', mat=PLATE, smooth=True)
            h.cyl((x, -.6, .0), (0, -1, 0), .1, .16, 14, .008, 'cobalt', mat=PLATE, smooth=True)
            h.cyl((x, -.77, .0), (0, -1, 0), .07, .015, 12, .0, 'lamp', mat=GLOW, smooth=True)
            if side > 0:
                h.cyl((0, -.4, .0), (0, -1, 0), .05, .2, 10, .004, 'navy', mat=FRAME, smooth=True)
                h.cyl((0, -.6, .0), (0, -1, 0), .035, .01, 8, .0, 'lamp', mat=GLOW, smooth=True)


def interceptor_cockpit(h, design):
    if design == 'a':   # A long teardrop canopy.
        h.cyl((0, .45, .06), (0, -1, 0), .07, .34, 12, .006, 'navy', mat=FRAME, r1=.04, smooth=True)
    elif design == 'b':   # A tandem canopy: two seats under one frame.
        for y in (.48, .3):
            h.cyl((0, y, .07), (0, -1, 0), .065, .14, 10, .005, 'navy', mat=FRAME, smooth=True)
        h.box((0, .39, .13), (.015, .36, .015), .002, 'pearl', PLATE)
    else:   # A flush faceted visor.
        solid(h, [(-.08, .25), (.08, .25), (.05, .55), (0, .6), (-.05, .55)], .06, .03, 'navy', FRAME)
        h.box((0, .5, .095), (.06, .01, .01), .0, 'lamp', GLOW)


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
                  plumes=IRONCLAD_PLUMES, mats=('ironclad_plate', 'ironclad_frame', 'ironclad_glow'), glow='#ffb04a'),
    interceptor=dict(hull=interceptor_hull, wings=interceptor_wings, engines=interceptor_engines, cockpit=interceptor_cockpit,
                     plumes=INTERCEPTOR_PLUMES, mats=('interceptor_plate', 'interceptor_frame', 'interceptor_glow'), glow='#5aa8ff'),
    spectre=dict(hull=spectre_hull, wings=spectre_wings, engines=spectre_engines, cockpit=spectre_cockpit,
                 plumes=SPECTRE_PLUMES, mats=('spectre_plate', 'spectre_frame', 'spectre_glow'), glow='#b46cff'),
)


# ============================================================================= build, verify, preview
def build_part(chassis, slot, design, mats):
    h = vc.HS(random.Random('hero-kit:%s:%s:%s' % (chassis, slot, design)))
    CHASSIS[chassis][slot](h, design)
    vc.triangulate_nonplanar(h)
    name = 'hero_%s_%s_%s' % (chassis, slot, design)
    colours = vc.bake(h, name, dict(glow={GLOW}, paints=PAINTS, ao=.12, ground=None))
    corner = 0
    for f, paint in zip(h.faces, h.fpaint):
        a = ROLE_ALPHA.get(paint if isinstance(paint, str) else paint[0], 1.0)
        for c in range(corner, corner + len(f)):
            colours[c] = (colours[c][0], colours[c][1], colours[c][2], a)
        corner += len(f)
    ob = vc.make_object(name, h, mats, (0.0, 0.0, 0.0), colours)
    print('HKIT %-28s tris=%4d' % (name, h.tris()))
    return ob


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
            nodes[ob.name] = dict(budget=BUDGET[slot], mats=names, x=(-.95, .95), z=(-.95, .95))
    for design in DESIGNS:
        for i, p in enumerate(spec['plumes'][design]):
            name = 'hero_%s_engines_%s_plume_%d' % (args.chassis, design, i)
            vc.make_empty(name, (p[0], p[2], -p[1]))
            nodes[name] = dict(empty=True, t=(p[0], p[2], -p[1]))
    vc.publish(args.glb, 'hero_kit.py', dict(materials=names, nodes=nodes, max_bytes=600_000), 'HKIT')
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


if __name__ == '__main__':
    main()
