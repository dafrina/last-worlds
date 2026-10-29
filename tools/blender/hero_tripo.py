"""Hero ship parts from the user's Tripo models (docs/31-hero-ships.md; user, 29 October 2026: "split them, clean them
up, simplify them a bit", and put every part "on one plane more or less").

Sources: art/source/hero/<chassis>-<n>.glb, Tripo image-to-3D from art/concepts/hero-modular (one complete ship each,
about two million triangles, 4096 px base colour / normal / roughness-metal maps). They are never edited.

This is the reference stage: the runtime parts are clean remodels built over its levelled, scaled parts
(tools/blender/hero_remodel.py; user, 29 October: cut Tripo parts "will be a mess once we start mixing"). Run on its
own, it writes cut-and-simplified study files to lookdev/hero-tripo/cut/<chassis>-<design>.glb, design a-e for sources
1-5, never runtime assets.

Per design:
1. Load (Tripo already has the nose at +Y and the ship on z = 0), and pre-simplify to about 250,000 triangles.
2. Cut along the authored part outlines (SPECS: convex outlines in |x| and y, seen from above, plus height limits) and
   sort every face by its centre: cockpit, then propulsion, then wings, the rest is the hull. Each cut is capped flat.
3. Level: Tripo read the concepts' three-quarter view partly as depth, so some ships climb toward the nose and their
   engines sit below the hull. A shear takes out the hull's climb; then the hull (with its cockpit), the wings (at their
   roots) and the propulsion are centred on one plane.
4. Scale the chassis to its size class, drop specks, simplify each part to its budget and shade it by angle.
5. Measure the joints (anchors) and the nozzles, and export the four part nodes with the design's own textures (base
   colour, roughness-metal, normal; 1024 px) and a glow mask.

Node names: hero_<chassis>_<slot>_<design>; engine sockets hero_<chassis>_engines_<design>_engine_<i> (plumes). Every
part carries glTF extras: `joint` (its own mounting point) and, on the hull, `anchors` (where that design's own wings,
propulsion and cockpit sat). The game moves a part of another design from its joint to the hull's anchor, so the
designs mix; a part of the hull's own design does not move. Cosmetic only: hit region, handling and gun origins are
unchanged.

Conventions as hero_kit.py: Blender x right, y forward (the nose; glTF -z), z up; 1 unit = 1 game unit before
HERO_SCALE; the design's centre (its bounding box in x and y, its hull's mid-plane in z) at the origin.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
        --python "$(wslpath -w tools/blender/hero_tripo.py)" -- --designs scrapper-1,scrapper-2 [--debug-dir DIR]
"""

import argparse
import json
import math
import os
import sys

sys.dont_write_bytecode = True

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE = os.path.join(ROOT, 'art', 'source', 'hero')
OUT = os.path.join(ROOT, 'lookdev', 'hero-tripo', 'cut')
TEXTURES = os.path.join(ROOT, 'lookdev', 'hero-tripo', 'textures')
DESIGNS = 'abcde'
SLOTS = ('hull', 'wings', 'engines', 'cockpit')
# The chassis's longest side in game units (the earlier kits' sizes) and its glow (HERO_DEFAULT_PAINT).
CHASSIS = dict(scrapper=dict(size=1.6, glow='#78f9f1'), ironclad=dict(size=1.8, glow='#ff4a24'),
               interceptor=dict(size=1.75, glow='#5aa8ff'), spectre=dict(size=1.85, glow='#b46cff'))
# Triangles per part after simplifying: a whole ship near 30,000 (the approved bosses run 70,000 to 100,000), one draw per
# design used.
BUDGET = dict(hull=12000, wings=8000, engines=8000, cockpit=3000)
TEXTURE_SIZE = 1024

# Part outlines in the source's own units (about ±0.49, nose at +Y), read off top and side views with a
# grid. Each slot is a list of regions; a region is a convex outline in (|x|, y) and optionally height limits (`z`: (low,
# high), each raised by `slope` × y on a ship that climbs). The first slot that holds a face's centre takes it, in
# `order` (default cockpit, engines, wings); everything else is hull. Optional: `turn` (x rotation in degrees before the
# cut, the views then taken again; for a ship Tripo stood on its tail), `pitch` (x rotation in degrees after the cut, for
# a ship that climbs steeply), `shear` (a fixed climb instead of the measured one), `align` (slots left at their height).
def box(x0, x1, y0, y1, z=None, slope=0):
    return poly((x0, y0), (x1, y0), (x1, y1), (x0, y1), z=z, slope=slope)


def poly(*points, z=None, slope=0):
    region = dict(outline=list(points))
    if z:
        region['z'] = z
        region['slope'] = slope
    return region


SPECS = {
    # Tug: a hexagonal cargo-box hull, a tall work cabin, straight stub wings with gun rails, two barrel pods.
    'scrapper-1': dict(cockpit=[box(0, .085, .12, .40, z=(.28, 9))], engines=[box(.105, .6, -.6, -.065)],
                       wings=[box(.14, .6, -.065, .34)]),
    # Flat-iron: a long wedge hull, a flush visor, forward-swept drooped wings on the hull's slanted sides, one cassette.
    'scrapper-2': dict(cockpit=[box(0, .075, -.02, .14, z=(.215, 9))], engines=[box(0, .6, -.6, -.33)],
                       wings=[poly((.13, .13), (.6, .13), (.6, -.33), (.215, -.33))]),
    # Hauler: an open truss round a cargo vessel, a raised octagonal cabin with a mast, biplane wings, four cans.
    'scrapper-3': dict(cockpit=[box(0, .11, .06, .27, z=(.30, 9))], engines=[box(.1, .6, -.6, -.32)],
                       wings=[box(.12, .6, -.1, .26)]),
    # Prospector: a riveted pressure-vessel hull with a drill nose, a caged dome, swept fins with end plates, a bell.
    'scrapper-4': dict(cockpit=[box(0, .085, .01, .19, z=(.215, 9))], engines=[box(0, .3, -.6, -.265)],
                       wings=[box(.155, .6, -.265, .16), box(.3, .6, -.6, -.265)]),
    # Courier: a slim diamond hull with a knife nose, a long two-pane canopy, narrow wings with lamps, finned pods.
    'scrapper-5': dict(cockpit=[box(0, .065, -.04, .29, z=(.265, 9))], engines=[box(.07, .6, -.6, -.14)],
                       wings=[box(.1, .6, -.14, .05)]),
    # Juggernaut: a terraced citadel with a ram prow, a bunker hood, slab sponsons with twin cannons, two engine boxes.
    'ironclad-1': dict(cockpit=[box(0, .065, .15, .34, z=(.255, 9))], engines=[box(.05, .255, -.6, -.27)],
                       wings=[box(.235, .6, -.6, .4)]),
    # Warhammer: a hammerhead with tusks, a domed command turret, scythe wings with gun clusters, three turbines.
    'ironclad-2': dict(cockpit=[box(0, .07, -.07, .09, z=(.245, 9))], engines=[box(0, .2, -.6, -.33)],
                       wings=[box(.13, .6, -.6, .06), box(.255, .6, .06, .2)]),
    # Bastion: an octagonal fortress collar, a sunken shuttered bridge, braced missile pods, four flared cans.
    'ironclad-3': dict(cockpit=[box(0, .085, -.01, .2, z=(.2, 9))], engines=[box(.055, .3, -.6, -.16)],
                       wings=[box(.265, .6, -.15, .3)]),
    # Breaker: a split wedge with jaws round a cannon, a periscope tower, blunt delta wings, two annular thrusters.
    'ironclad-4': dict(cockpit=[box(0, .065, -.26, .03, z=(.22, 9))], engines=[box(.045, .215, -.6, -.27)],
                       wings=[box(.16, .6, -.6, .13)]),
    # Siege: a slab spine with railgun rails, a heavy-framed canopy, canted blade sponsons, a five-slot drive block.
    'ironclad-5': dict(cockpit=[box(0, .07, -.13, .05, z=(.255, 9))], engines=[box(0, .6, -.6, -.355)],
                       wings=[box(.175, .6, -.355, .05)]),
    # Viper: a knife core, a teardrop canopy, forward-swept saber wings, spear booms with canted fins. Climbs about 14°.
    'interceptor-1': dict(cockpit=[box(0, .045, 0, .21, z=(.205, 9), slope=.26)], pitch=-14,
                          engines=[box(.085, .17, -.6, -.03), box(0, .23, -.6, -.21)], wings=[box(.11, .6, -.6, .16)]),
    # Hornet: a twin-prong arrowhead with canards, a tandem canopy, cranked deltas, box booms joined by a tailplane.
    'interceptor-2': dict(cockpit=[box(0, .055, -.11, .24, z=(.255, 9))],
                          engines=[box(0, .2, -.6, -.29), box(.055, .2, -.29, -.16)], wings=[box(.165, .6, -.24, .2)]),
    # Talon: a keel core with a dorsal blade, a flush visor, swept falcon wings, caged ring booms with long gun rails.
    'interceptor-3': dict(cockpit=[box(0, .05, -.06, .19, z=(.2, 9))], order=('cockpit', 'wings', 'engines'),
                          wings=[box(.2, .6, -.6, 0), box(.075, .2, -.17, 0)], engines=[box(.075, .2, -.6, .4)]),
    # Lance: a needle core with a probe, a bubble canopy, clipped wings with pylons, long booms with twin fins.
    'interceptor-4': dict(cockpit=[box(0, .05, 0, .29, z=(.17, 9))], engines=[box(.05, .2, -.6, -.12)],
                          wings=[box(.115, .6, -.17, .1)]),
    # Kestrel: a shovel nose with side cannons, a wraparound canopy, gull wings, flat booms with vectoring vanes.
    'interceptor-5': dict(cockpit=[box(0, .08, -.08, .14, z=(.2, 9))], engines=[box(.045, .2, -.6, -.17)],
                          wings=[box(.1, .6, -.6, .06)]),
    # Manta: a lens core with a beak, an eye slit under a lid, broad manta wings, a triangle of drive rings. Climbs ~18°.
    'spectre-1': dict(cockpit=[box(0, .05, .27, .44, z=(.385 - .33 * .3, 9), slope=.33)], pitch=-18,
                      engines=[box(0, .22, -.6, -.27)], wings=[box(.12, .6, -.27, .3)]),
    # Crescent: a forked core, a caged crystal, knife wings on rail arms, two ring drives. Tripo stood it up ~50°.
    'spectre-2': dict(turn=-50, cockpit=[box(0, .055, .05, .32, z=(.195, 9))], engines=[box(0, .3, -.6, -.2)],
                      wings=[box(.14, .6, -.6, .6)]),
    # Wedge: a pentagonal stealth core, a narrow polygonal canopy, broken-delta wings, four drive slots.
    'spectre-3': dict(cockpit=[box(0, .05, -.03, .28, z=(.2, 9))], engines=[box(0, .13, -.6, -.37)],
                      wings=[box(.15, .6, -.6, .12)]),
    # Veil: an armoured spine, a teardrop canopy, feathered wing plates, one wide slit drive.
    'spectre-4': dict(cockpit=[box(0, .065, .08, .33, z=(.24, 9))], engines=[box(0, .155, -.6, -.29)],
                      wings=[box(.1, .6, -.6, .2)]),
    # Orrery: a drum core in collars, a round lens, a near-complete ring of crescent wings, four small drive rings.
    'spectre-5': dict(cockpit=[box(0, .06, .04, .16, z=(.235, 9))], engines=[box(0, .185, -.6, -.24)],
                      wings=[box(.185, .6, -.6, .6)]),
}


def mesh_object():
    return next(o for o in bpy.context.scene.objects if o.type == 'MESH')


def load(name, spec):
    """The source as one mesh object (nose at +Y), simplified to about 250,000 triangles."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SOURCE, name + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    ob.data.transform(Matrix.Rotation(math.radians(spec.get('turn', 0)), 4, 'X') @ ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    if spec.get('turn'):
        a = coords(ob)
        ob.data.transform(Matrix.Translation((0, -(a[:, 1].min() + a[:, 1].max()) / 2, -a[:, 2].min())))
    for o in list(bpy.context.scene.objects):
        if o != ob:
            bpy.data.objects.remove(o)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris > 260000:
        mod = ob.modifiers.new('pre', 'DECIMATE')
        mod.ratio = 250000 / tris
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def planes(spec):
    """Every cut plane (point, normal) of the authored outlines, mirrored to both sides."""
    out = []
    for slot in ('cockpit', 'engines', 'wings'):
        for region in spec.get(slot, []):
            pts = region['outline']
            for i, (ax, ay) in enumerate(pts):
                bx, by = pts[(i + 1) % len(pts)]
                if abs(ax) > .55 and abs(bx) > .55 or abs(ay) > .55 and abs(by) > .55 and abs(ay - by) < 1e-9:
                    continue  # an outline's edge out past the ship
                n = Vector((by - ay, ax - bx, 0)).normalized()
                for side in (1, -1):
                    if side < 0 and abs(ax) < 1e-9 and abs(bx) < 1e-9:
                        continue
                    out.append((Vector((side * ax, ay, 0)), Vector((side * n.x, n.y, 0))))
            for z in region.get('z', ()):
                if abs(z) < 5:
                    out.append((Vector((0, 0, z)), Vector((0, -region['slope'], 1)).normalized()))
    return out


def inside(region, ax, y, z):
    zr = region.get('z')
    if zr and not (zr[0] <= z - region['slope'] * y <= zr[1]):
        return False
    pts = region['outline']
    sign = 0
    for i, (px, py) in enumerate(pts):
        qx, qy = pts[(i + 1) % len(pts)]
        cross = (qx - px) * (y - py) - (qy - py) * (ax - px)
        if abs(cross) < 1e-12:
            continue
        s = 1 if cross > 0 else -1
        if sign and s != sign:
            return False
        sign = s
    return True


def slot_of(spec, c):
    for slot in spec.get('order', ('cockpit', 'engines', 'wings')):
        if any(inside(r, abs(c.x), c.y, c.z) for r in spec.get(slot, [])):
            return slot
    return 'hull'


def dark_uv(image):
    """A UV on a dark, neutral texel of the base colour: the colour of the flat caps at the cuts."""
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    rgb = px.reshape(h, w, 4)[::16, ::16, :3]
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    score = np.abs(lum - .1) + sat * 2
    j, i = np.unravel_index(np.argmin(score), score.shape)
    return ((i * 16 + 8) / w, (j * 16 + 8) / h)


def split(ob, spec, cap_uv):
    """Cut the mesh along the outlines and return one object per slot, each cut capped flat."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for co, no in planes(spec):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=co, plane_no=no)
    bm.faces.ensure_lookup_table()
    slots = [slot_of(spec, f.calc_center_median()) for f in bm.faces]
    parts = {}
    for slot in SLOTS:
        part = bm.copy()
        part.faces.ensure_lookup_table()
        bmesh.ops.delete(part, geom=[f for f, s in zip(part.faces, slots) if s != slot], context='FACES')
        bmesh.ops.delete(part, geom=[v for v in part.verts if not v.link_faces], context='VERTS')
        if not part.faces:
            raise RuntimeError(f'{slot}: no faces')
        bmesh.ops.remove_doubles(part, verts=part.verts[:], dist=1e-6)
        boundary = [e for e in part.edges if e.is_boundary]
        made = bmesh.ops.holes_fill(part, edges=boundary, sides=0)['faces']
        if made:
            tri = bmesh.ops.triangulate(part, faces=made)['faces']
            uv = part.loops.layers.uv.active
            for f in tri:
                f.smooth = False
                for loop in f.loops:
                    loop[uv].uv = cap_uv
        me = bpy.data.meshes.new(slot)
        part.to_mesh(me)
        part.free()
        for mat in ob.data.materials:
            me.materials.append(mat)
        o = bpy.data.objects.new(slot, me)
        bpy.context.scene.collection.objects.link(o)
        parts[slot] = o
    bm.free()
    bpy.data.objects.remove(ob)
    return parts


def coords(o):
    a = np.empty(len(o.data.vertices) * 3, dtype=np.float32)
    o.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def move(o, fn):
    a = coords(o)
    fn(a)
    o.data.vertices.foreach_set('co', a.ravel())
    o.data.update()


def mid(z):
    return float((np.percentile(z, 5) + np.percentile(z, 95)) / 2)


def climb(hull):
    """The hull's climb along y: a line through the mid-heights of its slices, weighted by their vertex counts."""
    a = coords(hull)
    y0, y1 = np.percentile(a[:, 1], 3), np.percentile(a[:, 1], 97)
    ys, zs, ws = [], [], []
    for lo in np.linspace(y0, y1, 16, endpoint=False):
        s = a[(a[:, 1] >= lo) & (a[:, 1] < lo + (y1 - y0) / 16)]
        if len(s) > 50:
            ys.append(s[:, 1].mean())
            zs.append(mid(s[:, 2]))
            ws.append(len(s))
    return float(np.polyfit(ys, zs, 1, w=np.sqrt(ws))[0])


def level(parts, spec):
    """Pitch the ship down if it climbs steeply, shear out the hull's remaining climb, then centre hull (with cockpit),
    wing roots and propulsion on z = 0."""
    if spec.get('pitch'):
        r = np.array(Matrix.Rotation(math.radians(spec['pitch']), 3, 'X'))
        for o in parts.values():
            move(o, lambda a: a.__setitem__(slice(None), a @ r.T))
    k = spec.get('shear', climb(parts['hull']))
    yc = float(coords(parts['hull'])[:, 1].mean())

    def shear(a):
        a[:, 2] -= k * (a[:, 1] - yc)
    for o in parts.values():
        move(o, shear)
    keep = spec.get('align', ())
    offsets = dict(hull=-mid(coords(parts['hull'])[:, 2]))
    offsets['cockpit'] = offsets['hull']
    w = coords(parts['wings'])
    root = np.abs(w[:, 0]).min()
    offsets['wings'] = 0 if 'wings' in keep else -mid(w[np.abs(w[:, 0]) < root + .04][:, 2])
    offsets['engines'] = 0 if 'engines' in keep else -mid(coords(parts['engines'])[:, 2])
    for slot, o in parts.items():
        dz = offsets[slot]
        move(o, lambda a, dz=dz: a.__setitem__((slice(None), 2), a[:, 2] + dz))
    return dict(shear=round(k, 4), **{s: round(v, 4) for s, v in offsets.items()})


def place(parts, chassis):
    """Scale to the chassis's size class and centre the design in x and y."""
    s = CHASSIS[chassis]['size'] / .98
    allv = np.concatenate([coords(o) for o in parts.values()])
    cx = (allv[:, 0].min() + allv[:, 0].max()) / 2
    cy = (allv[:, 1].min() + allv[:, 1].max()) / 2
    for o in parts.values():
        move(o, lambda a: a.__setitem__(slice(None), (a - [cx, cy, 0]) * s))


def specks(o, size):
    """Delete loose islands smaller than `size` across (Tripo flecks and slivers left by the cuts)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    seen, drop = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, island = [v], []
        seen.add(v.index)
        while stack:
            u = stack.pop()
            island.append(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w.index not in seen:
                    seen.add(w.index)
                    stack.append(w)
        cs = np.array([u.co for u in island])
        if np.linalg.norm(cs.max(axis=0) - cs.min(axis=0)) < size:
            drop.extend(island)
    if drop:
        bmesh.ops.delete(bm, geom=drop, context='VERTS')
    bm.to_mesh(o.data)
    bm.free()
    return len(drop)


def simplify(o, target):
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    if tris > target:
        mod = o.modifiers.new('budget', 'DECIMATE')
        mod.ratio = target / tris
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def source_images(mat):
    """The source material's base colour, roughness-metal and normal images."""
    images = [n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
    pick = lambda key: next(i for i in images if key in i.name.lower())
    return pick('basecolor'), pick('_rm'), pick('normal')


def glow_mask(base, glow, size):
    """Where the base colour shows the chassis's glow: bright, saturated and near its hue (a grey mask; the game tints it)."""
    img = base.copy()
    img.scale(size, size)
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape(-1, 4)[:, :3]
    g = np.array([int(glow[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    g = g / np.linalg.norm(g)
    norm = np.linalg.norm(rgb, axis=1) + 1e-6
    hue = (rgb @ g) / norm
    sat = rgb.max(axis=1) - rgb.min(axis=1)
    mask = np.clip((hue - .93) * 20, 0, 1) * np.clip((sat - .18) * 5, 0, 1) * np.clip((rgb.max(axis=1) - .35) * 4, 0, 1)
    out = np.ones((size * size, 4), dtype=np.float32)
    out[:, :3] = mask[:, None]
    bpy.data.images.remove(img)
    return out, mask.reshape(size, size)


def material(key, chassis, src):
    """The design's runtime material: its own maps at TEXTURE_SIZE, and the glow mask as emission."""
    os.makedirs(TEXTURES, exist_ok=True)
    base, rm, normal = source_images(src)
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')

    def texture(image, label, colour):
        img = image.copy()
        img.scale(TEXTURE_SIZE, TEXTURE_SIZE)
        path = os.path.join(TEXTURES, f'{key}_{label}.jpg')
        img.filepath_raw = path
        img.file_format = 'JPEG'
        bpy.context.scene.render.image_settings.quality = 90
        img.save()
        bpy.data.images.remove(img)
        saved = bpy.data.images.load(path, check_existing=False)
        saved.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
        saved.pack()
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = saved
        return node
    nt.links.new(texture(base, 'base', True).outputs['Color'], bs.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(texture(rm, 'rm', False).outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bs.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bs.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(texture(normal, 'normal', False).outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    pixels, mask = glow_mask(base, CHASSIS[chassis]['glow'], TEXTURE_SIZE // 2)
    glow = bpy.data.images.new(f'{key}_glow', TEXTURE_SIZE // 2, TEXTURE_SIZE // 2, alpha=False)
    glow.pixels.foreach_set(pixels.ravel())
    glow.filepath_raw = os.path.join(TEXTURES, f'{key}_glow.jpg')
    glow.file_format = 'JPEG'
    glow.save()
    glow.pack()
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = glow
    nt.links.new(tex.outputs['Color'], bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value = 1.0
    return mat, mask


def sockets(o, mask):
    """The nozzles: glowing faces of the propulsion that face backward, grouped across x (Blender coordinates)."""
    me = o.data
    uv = me.uv_layers.active.data
    n = mask.shape[0]
    points = []
    for p in me.polygons:
        u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total
        v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
        if mask[min(n - 1, max(0, int(v * n))), min(n - 1, max(0, int(u * n)))] > .5:
            points.append((p.center.copy(), p.normal.y, p.area))
    back = [q for q in points if q[1] < -.3] or points
    if not back:
        return []
    back.sort(key=lambda q: q[0].x)
    groups, last = [], None
    for q in back:
        if last is None or q[0].x - last > .06:
            groups.append([])
        groups[-1].append(q)
        last = q[0].x
    out = []
    for g in groups:
        w = sum(q[2] for q in g) or 1
        out.append(Vector((sum(q[0].x * q[2] for q in g) / w, min(q[0].y for q in g), sum(q[0].z * q[2] for q in g) / w)))
    return out


def gltf(v):
    """Blender (x, y, z) as glTF (x, z, -y), rounded."""
    return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]


def joints(parts):
    """Each part's mounting point (Blender coordinates): wings and propulsion at their inner edge (0 when they cross the
    centre line) and their front or root centre; the cockpit at its centre and underside."""
    w = coords(parts['wings'])
    root = float(np.abs(w[:, 0]).min())
    near = w[np.abs(w[:, 0]) < root + .06]
    e = coords(parts['engines'])
    inner = float(np.abs(e[:, 0]).min())
    c = coords(parts['cockpit'])
    return dict(
        wings=(root if root > .03 else 0, float(near[:, 1].mean()), mid(near[:, 2])),
        engines=(inner if inner > .03 else 0, float(np.percentile(e[:, 1], 98)), mid(e[:, 2])),
        cockpit=(0, float((c[:, 1].min() + c[:, 1].max()) / 2), float(np.percentile(c[:, 2], 3))),
    )


def render(path, objects, view, colour):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = colour
    sh.show_cavity = True
    sc.render.resolution_x = sc.render.resolution_y = 700
    if not sc.world:
        sc.world = bpy.data.worlds.new('w')
    sc.world.color = (.25, .25, .27)
    cam = sc.camera
    if not cam:
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        sc.collection.objects.link(cam)
        sc.camera = cam
    for o in sc.objects:
        if o.type == 'MESH':
            o.hide_render = o not in objects
    size = max(max(abs(c) for c in v) for o in objects for v in o.bound_box) * 2.15
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = size
    cam.data.clip_end = 100
    if view == 'top':
        cam.location, cam.rotation_euler = (0, 0, 20), (0, 0, 0)
    elif view == 'side':
        cam.location, cam.rotation_euler = (20, 0, 0), (math.pi / 2, 0, math.pi / 2)
    else:  # three-quarter from front-right above, as the hangar
        cam.data.type = 'PERSP'
        cam.data.lens = 50
        d = Vector((1.1, 1.6, 1.4)).normalized() * size * 2.1
        cam.location = d
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def build(name, spec, args):
    chassis, n = name.split('-')
    design = DESIGNS[int(n) - 1]
    ob = load(name, spec)
    src = ob.data.materials[0]
    base = source_images(src)[0]
    parts = split(ob, spec, dark_uv(base))
    colours = dict(hull=(.85, .8, .7, 1), wings=(.3, .6, .95, 1), engines=(.95, .45, .2, 1), cockpit=(.4, .9, .4, 1))
    for slot, o in parts.items():
        o.color = colours[slot]
    debug = args.debug_dir
    if debug:
        for view in ('top', 'side'):
            render(os.path.join(debug, f'{name}-cut-{view}.png'), list(parts.values()), view, 'OBJECT')
    levelled = level(parts, spec)
    place(parts, chassis)
    report = dict(design=name, level=levelled, parts={})
    key = f'hero_{chassis}_{design}'
    mat, mask = material(key + '_skin', chassis, src)
    for slot, o in parts.items():
        dropped = specks(o, .02)
        tris = simplify(o, BUDGET[slot])
        o.data.materials.clear()
        o.data.materials.append(mat)
        node = f'hero_{chassis}_{slot}_{design}'
        o.name = o.data.name = node
        report['parts'][slot] = dict(triangles=tris, specks=dropped)
    j = joints(parts)
    for slot, o in parts.items():
        if slot == 'hull':
            o['anchors'] = json.dumps({s: gltf(v) for s, v in j.items()})
        else:
            o['joint'] = json.dumps(gltf(j[slot]))
    engines = parts['engines']
    found = sockets(engines, mask)
    for i, p in enumerate(found):
        e = bpy.data.objects.new(f'{engines.name}_engine_{i}', None)
        e.location = p
        bpy.context.scene.collection.objects.link(e)
    report['sockets'] = [gltf(p) for p in found]
    report['joints'] = {s: gltf(v) for s, v in j.items()}
    allv = np.concatenate([coords(o) for o in parts.values()])
    report['size'] = [round(float(allv[:, k].max() - allv[:, k].min()), 3) for k in range(3)]
    if debug:
        for view in ('top', 'side'):
            render(os.path.join(debug, f'{name}-level-{view}.png'), list(parts.values()), view, 'OBJECT')
        for view in ('top', 'side', 'three'):
            render(os.path.join(debug, f'{name}-final-{view}.png'), list(parts.values()), view, 'TEXTURE')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{chassis}-{design}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type in ('MESH', 'EMPTY'):
            o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_materials='EXPORT',
                              export_image_format='AUTO', export_texcoords=True, export_normals=True, export_yup=True,
                              export_extras=True, export_animations=False, export_cameras=False, export_lights=False,
                              export_apply=True)
    report['bytes'] = os.path.getsize(path)
    print('HERO ' + json.dumps(report))


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--designs', default=','.join(SPECS))
    ap.add_argument('--debug-dir')
    args = ap.parse_args(argv)
    for name in args.designs.split(','):
        build(name, SPECS[name], args)
