"""HELION STRONGHOLD remodel (19 November 2026): a clean hard-surface model built over the adapted Tripo fortress.

The user: "lets rebuild the boss model how we did it for the other bosses, use it as a stencil for your own optimized model
that you build in blender. This way we get a clean model. Keep the current version so we can easily switch back."

As BASTION-9's remodel (boss_bastion_hull.py) and the hero remodels (hero_parts.py): boss_stronghold.build() places the
user's fortress GLB in the game frame and cuts its rig parts (the stencil: never exported from here). Each part above the
terrace is modelled as clean solids (lib_solids.Solids) at the same origins, under the same node names, to the stencil's
measured sections (solid-shaded orthographic renders and cut sections, 19 November: the V core block, the housings
lofted through five sections, the gate, the roof's tiers); the stencil's own base colour and roughness/metal are baked onto
them (selected to active; no normals, so its sculpt noise stays out). Below the terrace's top the base is the stencil's own
(tripo_base). The renderer's snow/metal classification (src/render/stronghold-view.ts) reads both. Writes
public/assets/vesper/helion-stronghold-remodel.glb beside helion-stronghold.glb (the adapted model, kept: STRONGHOLD_MODEL in
src/render/boss-assets.ts switches between them).

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/run_build.py)" -- boss_stronghold_remodel [--no-export] [--no-preview]

`stencil()` alone (`-- boss_stronghold_remodel_stencil`) saves the placed stencil to lookdev/boss-overhaul/
stronghold-remodel/stencil.blend for measuring and look-dev in a live Blender.
"""
import bpy, os, sys, math, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_solids as br
import boss_stronghold as tripo

ROOT = br.ROOT
OUT = os.path.join(ROOT, 'public', 'assets', 'vesper', 'helion-stronghold-remodel.glb')
LOOK = os.path.join(ROOT, 'lookdev', 'boss-overhaul', 'stronghold-remodel')
P = tripo.P


def stencil():
    """The adapted fortress, placed and cut into its rig parts (boss_stronghold.build without export or previews)."""
    objs, result = tripo.build(export=False, preview=False)
    os.makedirs(LOOK, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(LOOK, 'stencil.blend'))
    return objs, result


def bvh(objects):
    """One BVH over the given meshes in world space."""
    verts, polys = [], []
    for o in objects:
        if o.type != 'MESH':
            continue
        mw = o.matrix_world
        base = len(verts)
        verts += [tuple(mw @ v.co) for v in o.data.vertices]
        polys += [[base + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def height_map(objects, x0, x1, y0, y1, cell=.25, top=12.0):
    """The highest surface over a grid (world x, y), by rays straight down: rows from the back (high y) to the front."""
    tree = bvh(objects)
    xs = np.arange(x0, x1 + 1e-6, cell); ys = np.arange(y1, y0 - 1e-6, -cell)
    out = np.full((len(ys), len(xs)), np.nan)
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            hit = tree.ray_cast(Vector((x, y, top)), Vector((0, 0, -1)), 40)
            if hit[0] is not None:
                out[j, i] = hit[0].z
    return xs, ys, out


def print_height_map(objects, x0, x1, y0, y1, cell=.25):
    xs, ys, h = height_map(objects, x0, x1, y0, y1, cell)
    print('      ' + ''.join('%6.2f' % x for x in xs))
    for j, y in enumerate(ys):
        print('%6.2f' % y + ''.join('     .' if np.isnan(v) else '%6.2f' % v for v in h[j]))


# ----------------------------------------------------------------------------- the remodel
# Model frame (boss_stronghold.build): x right, y away from the player (the front toward -y), z up, the sea at z 0.
# Measured on the stencil (height maps, 19 November): the front terrace at 1.2 across the full width with its gun
# batteries; the cannon deck at 3.85 behind it, the housings on it; the central bunker over the blast door at 2.15, its
# buttress arms and the emblem column between the housings; the roof block at the back at 4.4, its central spine at 4.83
# and its two stacks; the radar's pedestal on the left, the antenna mast on the right; the rock plinth down to the sea.
S, G = 'surface', 'glow'


def mirror(points):
    return [(-x, y) for x, y in reversed(points)]


# The terrace's front, measured on the stencil (z over 0.9, 19 November): angled back toward the outer ends, further back on
# the left than on the right (user: "keep the shapes of the terraces angled etc like the original"). From the bunker out.
FRONT_LEFT = [(-1.25, 1.0), (-1.8, 1.0), (-3.6, 1.05), (-4.6, 1.35), (-5.8, 1.65), (-6.4, 2.2)]
FRONT_RIGHT = [(1.25, .9), (1.8, .78), (2.6, .55), (4.4, .45), (5.4, .42), (6.6, .25)]


def offset_line(points, dy):
    return [(x, y + dy) for x, y in points]


def hull_solids():
    s = br.Solids([S, G])
    # (Under the terrace's top the base is the Tripo model's own, tripo_base: its rock, snow slopes and terrace slab. Built
    # rock, crags and two layouts of Vesper's ice-wall kit before it were rejected, 19 November: "the base looks shit ...
    # make it like the tripo model".)
    for sign, front in ((-1, FRONT_LEFT), (1, FRONT_RIGHT)):
        line = front
        # Gun batteries on the terrace, along its front (each on its pad: a base, a turret and two barrels toward the player).
        # (Bigger and at the terrace's edge, at the Tripo's positions, user, 19 November: "make the gun batteries a bit bigger
        # and further towards the edge like the models".)
        edge = lambda bx: next(ay + (by - ay) * (bx - ax) / (bx2 - ax) for (ax, ay), (bx2, by) in zip(line, line[1:]) if min(ax, bx2) <= bx <= max(ax, bx2))
        # (Three each side, the Tripo's left ones: four stood too close in line along the left's angled front.)
        batteries = (-5.35, -4.3, -2.6) if sign < 0 else (2.5, 3.9, 5.2)
        for x in batteries:
            by = edge(x) + .4
            # (Fanned out: the inner one nearly straight, the middle 22 degrees, the outer one further out; user, "the inner
            # ones straighter the two outer ones slightly more outside".)
            rank = sorted(batteries, key=abs).index(x)
            s.box((x - .43, by - .43, 1.2), (x + .43, by + .43, 1.3), S, chamfer=.05)
            s.box((x - .3, by - .3, 1.3), (x + .3, by + .3, 1.46), S, chamfer=.08)
            # (The turret and its barrels turned outward, as the Tripo's are, about 22 degrees: user, "the battery cannons
            # are slightly turned outwards in the original model, keep that too".)
            yaw = sign * math.radians((8, 22, 34)[rank])
            dx_, dy_ = math.sin(yaw), -math.cos(yaw)                         # the barrels' direction (toward the player, out)
            px_, py_ = -dy_, dx_                                             # across them
            body = [(-.22, -.2), (.22, -.2), (.22, .26), (-.22, .26)]
            ring = [(x + px_ * u - dx_ * v, by + py_ * u - dy_ * v) for u, v in body]
            s.loft([[(rx, ry, 1.46) for rx, ry in ring], [(rx, ry, 1.64) for rx, ry in ring]], S)
            for off in (-.08, .08):
                ox, oy = x + px_ * off, by + py_ * off
                rings = []
                for t in (.14, .72):
                    cx, cy = ox + dx_ * t, oy + dy_ * t
                    rings.append([(cx + px_ * .045 * math.cos(2 * math.pi * i / 8), cy + py_ * .045 * math.cos(2 * math.pi * i / 8),
                                   1.57 + .045 * math.sin(2 * math.pi * i / 8)) for i in range(8)])
                s.loft(rings, S)
        # The deck under each housing, from the gate's pillar out (measured, 19 November: the stencil's sections).
        deck = [(1.6, 2.2), (4.2, 2.0), (4.75, 2.45), (4.95, 3.5), (1.6, 3.5)]
        s.wedge([(sign * x, y) for x, y in deck] if sign > 0 else [(sign * x, y) for x, y in reversed(deck)], 1.2, 2.3, S)
        for k in range(9):
            rx = sign * (1.85 + k * .3)
            s.box((rx - .05, 2.1, 1.25), (rx + .05, 2.2, 2.25), S)
        # Launch hatches beside the gate (the Needles' bays): a dark frame and a lit slot.
        s.box((sign * 1.85 - .18, 1.1, .5), (sign * 1.85 + .18, 1.18, .86), S)
        s.box((sign * 1.85 - .12, 1.08, .62), (sign * 1.85 + .12, 1.11, .7), G)
        # The gate's pillar (measured: its front at y 1.13 up to 1.2, cut back 45 degrees to 2.15 at y 1.68; its top falls
        # toward its outer side, the front section a trapezoid wider at its foot).
        inner = [(1.13, .0), (1.13, 1.2), (1.68, 2.13), (2.3, 2.15), (2.3, .0)]
        outer = [(1.05, .0), (1.05, .95), (1.45, 1.25), (2.3, 1.85), (2.3, .0)]
        loops = [[(sign * .8, y, z) for y, z in inner], [(sign * 1.85, y, z) for y, z in outer]]
        s.loft(loops if sign > 0 else list(reversed(loops)), S)
    # The gate's floor where the Tripo base is cut out for it (tripo_base GATE), under the reactor chamber's floor.
    s.box((-1.9, 1.05, -.6), (1.9, 3.5, .33), S)
    # The bunker over the door between the pillars: the lintel (its window), its roof over the chamber, the threshold.
    s.box((-.8, 1.6, 1.64), (.8, 1.86, 2.15), S)
    s.box((-.2, 1.57, 1.84), (.2, 1.6, 1.95), S)
    s.box((-.8, 1.86, 1.70), (.8, 2.8, 2.17), S)
    s.box((-.8, 1.4, .2), (.8, 1.86, .44), S)
    # The core block above the gate: the V (measured: in plan its front has two prongs at x 1.05, its middle set back to y
    # 2.7; its front top edge cut back 45 degrees from 3.08 to 3.6 and its sides cut in to shoulders; user, 19 November:
    # "keep the V in the center above the core").
    foot = [(-1.45, 2.4), (-1.05, 2.28), (-.55, 2.7), (.55, 2.7), (1.05, 2.28), (1.45, 2.4), (1.45, 4.6), (-1.45, 4.6)]
    s.wedge(foot, 2.15, 3.08, S)
    cut = [(-1.15, 2.8), (-.95, 2.68), (-.5, 3.05), (.5, 3.05), (.95, 2.68), (1.15, 2.8), (1.15, 4.6), (-1.15, 4.6)]
    s.wedge(foot, 3.08, 3.62, S, top=cut)
    s.wedge([(x * .95, y) for x, y in cut], 3.62, 3.75, S)
    # Its column, the emblem on it (a disc with arms, lit), and the ramp from its top up to the roof's tower.
    s.box((-.45, 2.72, 2.15), (.45, 3.92, 4.12), S, chamfer=.1)
    s.cylinder((0, 0, 2.72), 'y', .27, 2.62, 2.74, S, seg=16)
    s.cylinder((0, 0, 2.72), 'y', .16, 2.59, 2.62, G, seg=16)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * .28, sx * .7))
        s.box((x0, 2.64, 2.64), (x1, 2.74, 2.8), S)
        s.box((sx * .5 - .03, 2.62, 2.66), (sx * .5 + .03, 2.64, 2.78), G)
    s.box((-.05, 2.69, 3.0), (.05, 2.72, 3.9), G)
    s.prism([(3.9, 4.12), (4.8, 4.72), (4.8, 4.12)], 'x', -.45, .45, S)
    s.box((-.55, 4.8, 4.12), (.55, 5.85, 5.11), S, chamfer=.08)
    # The main block (measured plans): its lower tier to 3.95, wide at its front and narrowing back, its right back corner
    # rounded; its top tier to 4.4, reaching forward to y 3.4 behind each housing, the core set into its middle. The top
    # tier's front edges lean back (a vertical step there read as a dark stripe).
    lower = [(-4.93, 3.5), (4.95, 3.5), (3.74, 5.8), (3.78, 6.3), (3.6, 6.8), (3.3, 7.05), (2.79, 7.17), (-4.53, 7.17), (-4.53, 5.3), (-4.18, 5.1)]
    s.wedge(lower, 1.2, 3.95, S)
    top = [(-2.9, 3.4), (-1.35, 3.4), (-1.15, 4.6), (1.15, 4.6), (1.35, 3.4), (2.79, 3.4), (3.53, 4.38), (3.53, 5.54), (3.75, 6.2),
           (3.5, 6.8), (3.1, 7.08), (2.48, 7.15), (-3.43, 7.15), (-3.43, 5.86), (-3.87, 5.65), (-3.87, 5.0), (-2.9, 4.49)]
    lean = [(x, y + (.35 if y < 3.5 else 0)) for x, y in top]
    s.wedge(top, 3.95, 4.4, S, top=lean)
    # The right flank: an armoured embankment from the block's side down to the terrace.
    s.wedge([(4.95, 3.5), (5.6, 3.7), (4.2, 7.1), (3.3, 7.05), (3.6, 6.8), (3.78, 6.3), (3.74, 5.8)], 1.2, 2.4,
            S, top=[(4.95, 3.5), (5.05, 3.7), (3.75, 7.1), (3.3, 7.05), (3.6, 6.8), (3.78, 6.3), (3.74, 5.8)])
    # The spine behind the tower, its two rails, the two stacks with their lit bands, the radar's pedestal, the antenna mast.
    s.box((-1.25, 5.85, 4.4), (1.4, 7.05, 4.83), S, chamfer=.15)
    s.box((-.75, 4.85, 4.4), (-.55, 6.6, 5.15), S, chamfer=.06)
    s.box((.55, 4.85, 4.4), (.85, 6.6, 5.39), S, chamfer=.08)
    for x in (-1.1, 1.1):
        s.cylinder((x, 4.95, 0), 'z', .3, 4.4, 4.75, S, seg=14)
        s.cylinder((x, 4.95, 0), 'z', .31, 4.75, 4.85, G, seg=14)
        s.cylinder((x, 4.95, 0), 'z', .33, 4.85, 4.97, S, seg=14)
    s.box((-3.65, 4.75, 4.4), (-3.0, 5.7, 4.95), S, chamfer=.1)
    s.box((3.0, 4.85, 4.4), (3.5, 5.35, 4.7), S, chamfer=.05)
    s.loft([[(3.25 + dx * r, 5.1 + dy * r, z) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))] for r, z in ((.1, 4.7), (.03, 6.35))], S)
    s.box((3.05, 4.9, 5.55), (3.45, 5.3, 5.6), S)
    s.box((3.22, 5.07, 6.35), (3.28, 5.13, 6.45), G)
    s.cylinder((2.2, 5.3, 0), 'z', .04, 4.4, 5.05, S, seg=6)
    s.box((2.17, 5.27, 5.05), (2.23, 5.33, 5.14), G)
    s.cylinder((-3.95, 6.6, 0), 'z', .03, 3.95, 4.75, S, seg=6)
    # Its roof plated: raised panels with gaps between (their edges catch the light as the roof's panel lines).
    for (x0, x1, nx), (y0, y1, ny), base in (((-3.35, -1.4, 3), (4.7, 7.0, 3), 4.4), ((1.55, 3.45, 2), (4.6, 6.9, 3), 4.4),
                                              ((-4.5, -3.0, 2), (3.6, 4.9, 1), 3.95), ((3.0, 4.4, 2), (3.6, 4.6, 1), 3.95)):
        for i in range(nx):
            for j in range(ny):
                u0 = x0 + (x1 - x0) * i / nx + .05; u1 = x0 + (x1 - x0) * (i + 1) / nx - .05
                v0 = y0 + (y1 - y0) * j / ny + .05; v1 = y0 + (y1 - y0) * (j + 1) / ny - .05
                s.box((u0, v0, base), (u1, v1, base + .04 + .04 * ((i * 3 + j * 5) % 3)), S)
    # Pipes along the top tier's front; vents; hatches and boxes.
    for x0, x1 in ((-2.85, -1.45), (1.45, 2.75)):
        for k, z in enumerate((4.52, 4.64)):
            s.cylinder((0, 3.95 + k * .16, z), 'x', .06, x0, x1, S, seg=8)
    for x, y in ((-3.3, 6.6), (2.5, 6.0)):
        s.box((x - .22, y - .3, 4.44), (x + .22, y + .3, 4.66), S, chamfer=.05)
    for x, y, z in ((-3.5, 6.75, 4.4), (3.1, 5.9, 4.4), (-4.2, 4.2, 3.95), (4.2, 4.0, 3.95)):
        s.cylinder((x, y, 0), 'z', .16, z, z + .12, S, seg=10)
    s.box((-2.6, 5.4, 4.4), (-1.8, 6.6, 4.58), S, chamfer=.05)
    return s


# The gate's footprint, where the remodel's own pillars, door and threshold stand (and the reactor's line of sight runs).
GATE = dict(x=1.7, y=1.1)


def tripo_base(stencil):
    """The Tripo model's own base (user, 19 November, after hand-built rock and two layouts of Vesper's ice-wall kit: "it
    still looks shit", "make it like the tripo model"): the stencil's faces under the terrace's top edge, its rock crags,
    snow slopes and the terrace slab with its block front, posts and ladders, outside the gate's footprint, reduced and
    keeping the stencil's own atlas (the renderer's snow/metal classification reads it as the adapted model's)."""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(stencil.data); bm.transform(stencil.matrix_world)
    drop = []
    for f in bm.faces:
        c = f.calc_center_median()
        top = max(v.co.z for v in f.verts)
        # (Cut at the terrace's surface: cut higher, the stubs of the Tripo's own batteries stood beside the remodel's,
        # "overlapping battery canons ... looks a bit too stacked", 19 November.)
        if top > 1.28 or (abs(c.x) < GATE['x'] and c.y > GATE['y']):
            drop.append(f)
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    me = bpy.data.meshes.new(P + 'base'); bm.to_mesh(me); bm.free()
    for m in stencil.data.materials:
        me.materials.append(m)
    ob = bpy.data.objects.new(P + 'base', me); bpy.context.scene.collection.objects.link(ob)
    if len(me.polygons) > 9000:
        mod = ob.modifiers.new('reduce', 'DECIMATE'); mod.ratio = 9000 / len(me.polygons); mod.use_collapse_triangulate = True
        bpy.context.view_layer.update()
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); baked = bpy.data.meshes.new_from_object(ev)
        ob.modifiers.clear(); old = ob.data; ob.data = baked; bpy.data.meshes.remove(old); baked.name = P + 'base'
    log('tripo base', len(ob.data.polygons), 'faces')
    return ob


def housing_solids(sign):
    """A cannon's armoured housing, in its local frame (origin at the gun's pivot; +x toward the fortress's middle for the
    left one, so `sign` -1 there mirrors x). Lofted through the stencil's measured sections (19 November): narrow at its
    front round the barrel, widening toward its back; its top slightly arched; its inner top corner cut 45 degrees toward
    the core (one side of the V); its outer shoulder a slanted facet growing toward its back (user: "pointed outward and
    not be so rounded", "they do have a slight arch but not that much")."""
    s = br.Solids([S, G])
    m = lambda x: -sign * x
    sections = (
        (-.45, ((-.5, -.62), (1.25, -.62), (1.25, .2), (.85, .85), (.1, .9), (-.35, .85), (-.5, .5))),
        (.175, ((-.44, -.62), (1.62, -.62), (1.62, .2), (1.14, .91), (.2, .94), (-.3, .91), (-.44, .6))),
        (.575, ((-.94, -.62), (1.83, -.62), (1.83, .22), (1.38, .9), (.2, .95), (-.77, .87), (-.94, .68))),
        (1.075, ((-1.17, -.62), (1.81, -.62), (1.81, .22), (1.36, .95), (.2, .99), (-.7, .87), (-1.17, .21))),
        (1.28, ((-1.17, -.62), (1.81, -.62), (1.81, .22), (1.36, .95), (.2, .99), (-.7, .87), (-1.17, .21))),
    )
    loops = [[(m(x), y, z) for x, z in sec] for y, sec in sections]
    if sign > 0:
        loops = [list(reversed(l)) for l in loops]
    s.loft(loops, S)
    # The frame round the barrel's opening at its front, and the opening's lit edges.
    s.cylinder((0, 0, .05), 'y', .6, -.75, -.42, S, seg=8, phase=math.pi / 8)
    s.cylinder((0, 0, .05), 'y', .48, -.8, -.75, S, seg=16)
    for dx in (-.5, .5):
        s.box((dx - .04, -.83, -.28), (dx + .04, -.79, .38), G)
    return s


def gun_solids():
    """A barrel, in its local frame: origin at the breech, the barrel toward -y."""
    s = br.Solids([S])
    s.box((-.38, -.1, -.33), (.38, .55, .43), S, chamfer=.08)
    s.cylinder((0, 0, .05), 'y', .36, -.95, -.05, S, seg=16)
    s.cylinder((0, 0, .05), 'y', .27, -3.0, -.95, S, seg=16)
    for y0 in (-1.6, -2.3):
        s.cylinder((0, 0, .05), 'y', .31, y0, y0 + .1, S, seg=16)
    s.cylinder((0, 0, .05), 'y', .32, -3.98, -3.0, S, seg=16)
    s.cylinder((0, 0, .05), 'y', .29, -4.02, -3.98, S, seg=16)
    return s


def leaf_solids(sign):
    """A blast-door leaf about its centre: a heavy plate with ribs and two lit slits."""
    s = br.Solids([S, G])
    s.box((-.42, -.14, -.6), (.42, .14, .6), S)
    for dx in (-.25, .05, .3):
        s.box((dx - .04, -.18, -.55), (dx + .04, -.14, .55), S)
    for dx in (-.1, .18):
        s.box((dx - .03, -.17, -.4), (dx + .03, -.15, .4), G)
    return s


def radar_solids():
    import bmesh
    s = br.Solids([S])
    s.box((-.08, -.08, 0), (.08, .08, .32), S)
    s.loft([[(r * math.cos(2 * math.pi * i / 16), y, .45 + r * math.sin(2 * math.pi * i / 16)) for i in range(16)] for r, y in ((.1, .06), (.48, -.1), (.5, -.14))], S)
    rot = __import__('mathutils').Matrix.Rotation(math.radians(-35), 3, 'X')
    bmesh.ops.rotate(s.bm, verts=s.bm.verts, cent=(0, 0, .3), matrix=rot)
    return s


def swap(ob, solids, mats, bevel=.03, sharp=40):
    """The part's mesh replaced by the remodel (built in its local frame); name, transform, parent and children kept."""
    tmp = solids.object('tmp_' + ob.name, mats, bevel=bevel, sharp=sharp)
    old = ob.data
    ob.data = tmp.data
    ob.data.name = ob.name
    # (Triangulated, as the exported parts and the wreck helpers expect.)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free()
    bpy.data.objects.remove(tmp, do_unlink=True)
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def keep_stencil(ob):
    """A world-space copy of a stencil part for the bake (never exported)."""
    st = ob.copy(); st.data = ob.data.copy(); st.name = 'stencil_' + ob.name[len(P):]
    st.parent = None; st.matrix_world = ob.matrix_world.copy()
    bpy.context.scene.collection.objects.link(st)
    return st


# ----------------------------------------------------------------------------- the finish
def unwrap_visible(meshes):
    """One shared atlas (smart projection) with the texels on what the 55-degree camera sees: islands facing away from it
    (backs, undersides) and those under the ledge (the terrain buries the plinth's foot) shrunk before the pack."""
    vl = bpy.context.view_layer
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
    vl.objects.active = meshes[0]
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    eye = Vector(tripo.TO_EYE)
    for o in meshes:
        me = o.data; uv = me.uv_layers.active.data; mw = o.matrix_world; rot = mw.to_3x3()
        # Islands: faces sharing a UV-mapped vertex.
        parent = list(range(len(me.polygons)))
        def root(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        seen = {}
        for p in me.polygons:
            for li in p.loop_indices:
                key = (me.loops[li].vertex_index, tuple(round(c, 5) for c in uv[li].uv))
                if key in seen:
                    a, b = root(seen[key]), root(p.index)
                    if a != b:
                        parent[b] = a
                else:
                    seen[key] = p.index
        islands = {}
        for p in me.polygons:
            islands.setdefault(root(p.index), []).append(p)
        for faces in islands.values():
            n = Vector(); z = 0.0; area = 0.0
            for p in faces:
                n += (rot @ p.normal) * p.area; z += (mw @ p.center).z * p.area; area += p.area
            if area == 0:
                continue
            n.normalize(); z /= area
            facing = n.dot(eye)
            scale = .2 if z < .1 else .25 if facing < -.2 else .55 if facing < .25 else 1.0
            if scale < 1:
                loops = [li for p in faces for li in p.loop_indices]
                c = sum((uv[li].uv for li in loops), Vector((0, 0))) / len(loops)
                for li in loops:
                    uv[li].uv = c + (uv[li].uv - c) * scale
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=.003)
    bpy.ops.object.mode_set(mode='OBJECT')


def emit_material(src, kind):
    """A copy of a stencil material that emits one of its images (the bake reads it as EMIT): `base` or `rm`."""
    m = src.copy(); m.name = src.name + '_emit_' + kind
    nt = m.node_tree
    img = None
    for nd in nt.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image and ('_%s.' % kind in nd.image.name or nd.image.name.endswith('_' + kind)):
            img = nd.image
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    if img:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
        nt.links.new(tex.outputs['Color'], em.inputs['Color'])
    return m


def bake_finish(targets, stencils, size=2048):
    """The stencil's own base colour and roughness/metal, baked onto the remodel's shared atlas (selected to active, along
    each surface's normal from just outside it). No normals: the stencil's sculpt noise is what the remodel leaves out."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    meshes = [o for o in targets if o.type == 'MESH']
    unwrap_visible(meshes)
    images = {kind: bpy.data.images.new('stronghold_remodel_' + kind, size, size, alpha=False) for kind in ('base', 'rm')}
    images['rm'].colorspace_settings.name = 'Non-Color'
    surface = bpy.data.materials.new('stronghold_surface_remodel'); surface.use_nodes = True
    holder = bpy.data.materials.new('stronghold_bake_holder'); holder.use_nodes = True
    tex = holder.node_tree.nodes.new('ShaderNodeTexImage'); holder.node_tree.nodes.active = tex
    # Every slot of the targets bakes into the atlas (glow faces too; they keep their glow material afterwards).
    slots = {o.name: [sl.material for sl in o.material_slots] for o in meshes}
    for o in meshes:
        for sl in o.material_slots:
            sl.material = holder
    src_mats = {o.name: [sl.material for sl in o.material_slots] for o in stencils}
    for kind in ('base', 'rm'):
        tex.image = images[kind]
        for o in stencils:
            for k, sl in enumerate(o.material_slots):
                sl.material = emit_material(src_mats[o.name][k], kind)
        for n, o in enumerate(meshes):
            bpy.ops.object.select_all(action='DESELECT')
            for st in stencils:
                st.select_set(True)
            o.select_set(True); bpy.context.view_layer.objects.active = o
            bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=.35, max_ray_distance=1.2,
                                margin=8, use_clear=(n == 0))
        log('baked', kind)
    for o in stencils:
        for k, sl in enumerate(o.material_slots):
            sl.material = src_mats[o.name][k]
    os.makedirs(os.path.join(LOOK, 'textures'), exist_ok=True)
    saved = {}
    for kind, img in images.items():
        path = os.path.join(LOOK, 'textures', 'stronghold_remodel_%s.jpg' % kind)
        img.filepath_raw = path; img.file_format = 'JPEG'; img.save()
        s = bpy.data.images.load(path, check_existing=False); s.colorspace_settings.name = img.colorspace_settings.name; s.pack()
        saved[kind] = s
    nt = surface.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = saved['base']; nt.links.new(tc.outputs['Color'], bs.inputs['Base Color'])
    trm = nt.nodes.new('ShaderNodeTexImage'); trm.image = saved['rm']
    sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(trm.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bs.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], bs.inputs['Metallic'])
    for o in meshes:
        for sl, original in zip(o.material_slots, slots[o.name]):
            sl.material = original if 'glow' in original.name else surface
        br.merge_slots(o)
    bpy.data.materials.remove(holder)
    return surface


def log(*a):
    print('REMODEL', *a, flush=True)


def build(export=True, preview=True):
    import lib_hardsurface as vc
    import boss_eclipse as ae
    objs, _ = tripo.build(export=False, preview=False)
    by = {o.name: o for o in objs}
    parts = [by[P + n] for n in ('hull', 'cannon_left', 'cannon_right', 'gun_left', 'gun_right', 'door_a', 'door_b', 'radar')]
    rest = [o for o in objs if o not in parts and not o.name.endswith(('_left_wreck', '_right_wreck'))]
    stencils = [keep_stencil(o) for o in parts]
    glow = vc.make_material('stronghold_remodel_glow', 'glow', colour='#ff7a26', emission=2.2)
    mats = {S: bpy.data.materials.new('stronghold_remodel_tmp'), G: glow}
    hull, can_l, can_r, gun_l, gun_r, door_a, door_b, radar = parts
    swap(hull, hull_solids(), mats, bevel=.035)
    swap(can_l, housing_solids(-1), mats, sharp=20); swap(can_r, housing_solids(1), mats, sharp=20)
    swap(gun_l, gun_solids(), mats, bevel=.02); swap(gun_r, gun_solids(), mats, bevel=.02)
    swap(door_a, leaf_solids(-1), mats, bevel=.02); swap(door_b, leaf_solids(1), mats, bevel=.02)
    swap(radar, radar_solids(), mats, bevel=.015)
    surface = bake_finish(parts, stencils)
    base = tripo_base(stencils[0])
    for st in stencils:
        bpy.data.objects.remove(st, do_unlink=True)
    # The wrecks rebuilt from the remodel (as boss_stronghold.build: housings crumpled, guns snapped two thirds along).
    for name in ('cannon_left_wreck', 'cannon_right_wreck', 'gun_left_wreck', 'gun_right_wreck'):
        bpy.data.objects.remove(by[P + name], do_unlink=True)
    wmat = ae.wreck_material(surface); wmat.name = 'stronghold_wreck'
    import bmesh
    wrecks = []
    for side, can, gun in (('left', can_l, gun_l), ('right', can_r, gun_r)):
        cw = ae.wreck_copy(can, wmat, sag=.12, jitter=.04, seed=3 if side == 'left' else 4)
        cw.location = can.location
        gw = ae.wreck_copy(gun, wmat, sag=0, jitter=.03, seed=5 if side == 'left' else 6)
        bm = bmesh.new(); bm.from_mesh(gw.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < -4.0 * .64], context='FACES')
        bm.to_mesh(gw.data); bm.free(); gw.data.update()
        gw.parent = cw; gw.location = gun.location.copy()
        wrecks += [cw, gw]
    by[P + 'approved_v1']['remodel'] = 1
    # (The remodel's tag, for the asset contract: tests/world/cinematic-assets.test.ts.)
    tag = ae.marker(P + 'remodel_v6')
    out = parts + [base] + wrecks + rest + [tag]
    bpy.context.view_layer.update()
    report = dict(triangles=ae.tris(out), part_triangles={o.name: ae.tris([o]) for o in out if o.type == 'MESH'})
    report['checks'] = tripo.checks(out, wrecks, door_a, door_b, by[P + 'core'], can_l, can_r)
    log('triangles', report['triangles'], json.dumps(report['part_triangles']))
    log('checks', json.dumps(report['checks']))
    os.makedirs(LOOK, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(LOOK, 'remodel.blend'))
    if export:
        report['export'] = br.export(OUT, out, "Last Worlds HELION STRONGHOLD remodel (tools/blender/boss_stronghold_remodel.py, over the user's fortress GLB)")
        log('exported', report['export'])
    with open(os.path.join(LOOK, 'remodel-report.json'), 'w') as f:
        json.dump(report, f, indent=1, default=ae.plain)
    return out, dict(triangles=report['triangles'], checks=report['checks'])
