"""HELION STRONGHOLD, Vesper's boss, from the user's fortress GLB (17 November 2026; docs/43 §8-10, docs/17 §5).

The user's specification: "a gigantic stationary mountain fortress", "two enormous heavy artillery cannon barrels extending
out of armored openings in the cliff", the two cannon assemblies the existing destructible modules and the central bunker
the core. It replaces the flying HELION ARK's model (tools/blender/boss_ark.py, removed; git history keeps it); the boss
keeps its id `ark` and its combat values (src/content/ark.ts), and the model is placed and scaled to them.

Adapted like THE HELIOPHAGE and THE ECLIPSE (boss_heliophage.py, boss_eclipse.py, whose helpers this imports): the supplied
mesh, UVs and painted atlases are kept and reduced; nothing of the shape is regenerated. Only the reactor chamber behind the
blast doors is built here (the supplied model has nothing behind its door). Headless (art/bosses/README.md):

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/run_build.py)" -- boss_stronghold [--no-export] [--no-preview]

About a minute; deterministic. Writes public/assets/vesper/helion-stronghold.glb, previews and
`lookdev/boss-overhaul/stronghold/stronghold-report.json` (placement, parts, triangle counts, the ray checks).

Source: art/source/bosses/stronghold-original.glb (one mesh, 1,953,711 triangles, 4K atlases, normalized coordinates).
It already stands the game's way up (z up, its front toward -y), so it is only scaled and placed:
game = ((x - AXIS_X) * SCALE, y * SCALE + TY, z * SCALE + TZ). Model z 0 is the sea (the renderer seats it at Vesper's
sea level), so the plinth's foot stands just under the opaque water. The scale (12.79) puts the two barrels' breeches where
the release lens, centred, sees the radiator targets at the guns' height (x ±3.32 there, the targets' ±2.98 on the flight
plane); TY puts the core's aim point (seventy per cent up the blast door) on the bridge's orthographic ray, so the rig
contract's rays (`ray_y`, art/bosses/README.md) meet the cannons and, with the doors open, the reactor. The renderer seats the
model by the lens (src/world/terrain-vesper.ts STRONGHOLD_AT, the report's `seat`), and each gun then moves along s onto its
own line of sight (the report's `gun_move`, about 0.15). The whole structure is grown GROW times (user, 17 November: "the
stronghold needs to be slightly bigger") about a point on the bridge's line of sight at the breeches' height, and each cannon
assembly is re-seated where its breech was (the report's `reseat`, about 0.5 inward), so no target moves; the boss's row
is 9 since that day ("the stronghold should move down a bit too").

Left out: the two floating backdrop rock sketches, the flag, the round rock and the small mountain at the left, the plinth's
cut sides (|x| > CUT_X) and the rock behind the roof (y > CUT_BACK): the rock round the fortress is Vesper's terrain cliff
(src/world/terrain-vesper.ts, the stronghold's massif), which buries the cut edges. Faces wholly under the sea are dropped.

Parts (nodes the view drives, src/render/stronghold-view.ts):
- stronghold_hull: everything static (the bunker, terrace and its small gun batteries, pipes, vents, tanks, the plinth);
- stronghold_cannon_left/right: each cannon's armoured octagonal housing (the first-pair targets), with its gun as a child,
  stronghold_gun_left/right: the barrel and breech, turned straight toward the player about its breech (the supplied
  barrels point 31 degrees outward; the lane lasers fall straight down their own columns), its origin the recoil pivot,
  and a marker stronghold_muzzle_left/right at the muzzle;
- stronghold_cannon_left/right_wreck: the housing crumpled and dark, with stronghold_gun_left/right_wreck, the barrel
  snapped off two thirds along (the view lets it sag);
- stronghold_door_a/b: the main blast door's two leaves (they slide apart along -x/+x by DOOR_SLIDE);
- stronghold_chamber: the reactor chamber behind the door (built here); stronghold_core: the reactor in it (the core
  target), stronghold_core_wreck;
- stronghold_radar: the dish (the view turns it);
- markers: stronghold_bay_left/right (the hatches either side of the door, the Needles' launch points), stronghold_vent_0..
  (steam), stronghold_approved_v1 (the identifier the view looks for).
One material on the supplied atlases at 2K (roughness kept legible), plus an emission mask of the painted orange glows; the
chamber and reactor are vertex coloured.
"""
import bpy, bmesh, os, sys, math, json, time, random
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import boss_eclipse as ae
import lib_solids as br

ROOT = br.ROOT
SRC = os.path.join(ROOT, 'art', 'source', 'bosses', 'stronghold-original.glb')
OUT = os.path.join(ROOT, 'public', 'assets', 'vesper', 'helion-stronghold.glb')
PREVIEW = os.path.join(ROOT, 'lookdev', 'boss-overhaul', 'stronghold')
P = 'stronghold_'
SOURCE_FACES = 1953711
BUDGET = 80000
REF = 12.0                    # the regions below are in the source's units times REF (measured on grid sheets at that scale)
AXIS_X = .045                 # the source's symmetry axis (midway between the two breeches)
# The release camera (src/shared/lens.ts at LENS_FOV 25, centred): its eye and the arena (the Ark's row, Vesper's sea). The
# guns stand where the lens's lines of sight through the radiator targets meet them with the camera centred (the boss stays
# at x 0 and the camera rests in its dead zone through most of a fight), so their lanes leave from their muzzles; that sets
# the scale. The renderer seats the model so the core's aim point sits on the line of sight through the bridge target.
EYE_Y, EYE_S, FLIGHT = 43.214, -20.823, 3.8
ROW, SEA = 9.0, -3.6
# The structure grown about the core's aim point (user, 17 November: "the stronghold needs to be slightly bigger"); each
# cannon assembly (housing and gun, grown with it) is then re-seated so its breech stays where the lens sees its target.
GROW = 1.15
TZ = -.3                      # the plinth's foot this far under the sea
# The combat targets (src/content/ark.ts): radiators at x ±2.98, s 2.97; bridge (the core) at s 1.6; target plane 1.6.
RADIATOR = (2.98, 2.97)
CORE_S = 1.6
TARGET_HEIGHT = 1.6
COT = 1 / math.tan(math.radians(55))
TO_EYE = np.array((0.0, -math.cos(math.radians(55)), math.sin(math.radians(55))))
# Cuts and regions in reference units (x from the axis, y and z the source's * REF).
CUT_X = 5.25
CUT_BACK = 2.95
# The door: the main blast door between the two legs, under the lintel.
DOOR = dict(x=.66, z=(.98, 1.92), y=(-1.95, -1.3))
# Each cannon's housing: the octagonal armour frame round the gun (x mirrored), under the roof slab.
HOUSING = dict(x=(1.66, 4.16), z=(2.42, 3.71), y=(-1.85, -.25))
# The radar dish above its pedestal, and the flag beside it (left out).
RADAR = dict(x=(-3.3, -2.15), y=(.55, 1.95), z=4.56)
FLAG = dict(x=(-2.52, -1.98), y=(1.45, 4.2), z=4.2)
# Steam vents (unplaced game units): the two reactor tanks' tops, and the roof over each cannon.
VENTS = [(-.62, 1.1, 4.85), (.67, 1.2, 4.9), (-2.0, 1.4, 4.2), (2.05, 1.4, 4.2)]
DOOR_SLIDE = .62              # how far each leaf slides open (the view's value)
BREECH_Y = -1.08              # where each barrel leaves its breech block (unplaced y, measured on the source's side view)
DROP_FLOATING_ABOVE = .3      # loose pieces wholly above this source z are the backdrop sketches


def log(*a):
    print('STRONGHOLD', *a, flush=True)


def apply_modifier(ob, mod):
    """Apply one modifier with a context override (boss_eclipse's version walks every view-layer object)."""
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


ae.apply_modifier = apply_modifier


def load_source():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SRC)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if len(meshes) != 1 or len(meshes[0].data.polygons) != SOURCE_FACES:
        raise RuntimeError('Stronghold source changed: %s' % [(o.name, len(o.data.polygons)) for o in meshes])
    return meshes[0]


def components(fv, nv):
    """Edge-connected piece of every face (vertex label propagation over the welded mesh)."""
    lab = np.arange(nv)
    edges = np.concatenate([fv[:, [0, 1]], fv[:, [1, 2]], fv[:, [2, 0]]])
    for _ in range(400):
        m = np.minimum(lab[edges[:, 0]], lab[edges[:, 1]])
        new = lab.copy(); np.minimum.at(new, edges[:, 0], m); np.minimum.at(new, edges[:, 1], m)
        new = new[new]
        if np.array_equal(new, lab):
            break
        lab = new
    return lab[fv[:, 0]]


def glowing(rgb):
    """0..1: the painted orange glows (hot saturated orange, brighter than the gunmetal; snow and steel stay 0)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return np.clip((r - .42) / .2, 0, 1) * np.clip((r - b - .3) / .2, 0, 1) * np.clip((g - b * .9 - .02) / .12, 0, 1) * np.clip((r - g * 1.25) / .12, 0, 1)


def material(src_mat, directory, size=2048, normal_size=1024):
    """The supplied atlases at working size (base and roughness/metal 2K JPEG, normal 1K PNG) and an emission mask of the
    painted glows (as boss_heliophage.material)."""
    key = 'stronghold_surface_%d_v1' % size
    mat = src_mat.copy(); mat.name = key
    nt = mat.node_tree; bs = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    os.makedirs(directory, exist_ok=True)
    base = None
    for node in [nd for nd in nt.nodes if nd.type == 'TEX_IMAGE']:
        nm = node.image.name
        kind = 'base' if 'basecolor' in nm else 'rm' if '_rm.' in nm else 'normal'
        s = normal_size if kind == 'normal' else size
        img = node.image.copy(); img.name = key + '_' + kind; img.scale(s, s)
        if kind == 'rm':
            data = np.empty(s * s * 4, dtype=np.float32); img.pixels.foreach_get(data); rgba = data.reshape(-1, 4)
            # Roughness kept legible; metal damped (Vesper's bright ice sky turned fully metallic paint near white on the Ark).
            rgba[:, 1] = np.clip(rgba[:, 1], .38, .88)
            rgba[:, 2] *= .6
            img.pixels.foreach_set(data)
        path = os.path.join(directory, key + '_' + kind + ('.png' if kind == 'normal' else '.jpg'))
        img.filepath_raw = path; img.file_format = 'PNG' if kind == 'normal' else 'JPEG'; img.save()
        saved = bpy.data.images.load(path, check_existing=False); saved.colorspace_settings.name = img.colorspace_settings.name
        saved.pack(); node.image = saved
        bpy.data.images.remove(img)
        if kind == 'base':
            base = saved
    data = np.empty(size * size * 4, dtype=np.float32); base.pixels.foreach_get(data)
    rgb = data.reshape(size, size, 4)[:, :, :3]
    mask = ae.blur(glowing(rgb), 1)
    col = np.clip(rgb * mask[..., None] * 1.15, 0, 1)
    rgba = np.ones((size, size, 4), dtype=np.float32); rgba[..., :3] = col
    path = os.path.join(directory, key + '_emission.jpg')
    emit = bpy.data.images.new(key + '_emission', width=size, height=size, alpha=False)
    emit.colorspace_settings.name = 'sRGB'; emit.pixels.foreach_set(rgba.ravel())
    emit.filepath_raw = path; emit.file_format = 'JPEG'; emit.save()
    saved = bpy.data.images.load(path, check_existing=False); saved.colorspace_settings.name = 'sRGB'; saved.pack()
    bpy.data.images.remove(emit)
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = saved
    nt.links.new(tex.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 2.2
    return mat, float((mask > .1).mean())


def barrel_axes(u, fv, fc, lab_comp, muzzle_comp):
    """Each barrel's axis (unplaced game units), from two centroids of the long cylinder in front of its housing: its muzzle
    end and a slice near its root (a fit over the whole region leaned toward the housing's faces). The pivot is the axis
    point at the breech face (BREECH_Y), where the barrel leaves its breech block."""
    out = {}
    x, y, z = fc[:, 0], fc[:, 1], fc[:, 2]
    for side, sign in (('left', -1), ('right', 1)):
        box = (sign * x > 2.6) & (sign * x < 4.95) & (y < -1.15) & (y > -4.1) & (z > 2.45) & (z < 3.6)
        front = box & (y < y[box].min() + .35)
        muzzle = fc[front].mean(0)
        guess = np.array((sign * 3.0, -.9, muzzle[2]))
        line = (muzzle - guess) / np.linalg.norm(muzzle - guess)
        q = fc - guess
        near = np.linalg.norm(q - np.outer(q @ line, line), axis=1) < .4
        root = fc[box & near & (y > -1.45) & (y < -1.15)].mean(0)
        axis = (muzzle - root) / np.linalg.norm(muzzle - root)
        pivot = root + axis * ((BREECH_Y - root[1]) / axis[1])
        length = float(np.linalg.norm(muzzle - pivot)) + .12
        out[side] = dict(axis=axis, pivot=pivot, muzzle=pivot + axis * length, length=length,
                         yaw=float(math.atan2(-axis[0], -axis[1])), pitch=float(math.asin(max(-1, min(1, axis[2])))))
    return out


def classify(u, fv, fc, fn, comp, keep_comp, muzzle_comp, axes):
    """Labels: -1 dropped, 0 hull, 1/2 cannon housing left/right, 3/4 gun left/right, 5/6 door leaf a/b, 7 radar."""
    lab = np.zeros(len(fv), dtype=np.int32)
    x, y, z = fc[:, 0], fc[:, 1], fc[:, 2]
    lab[~np.isin(comp, keep_comp)] = -1
    lab[(np.abs(x) > CUT_X) | (y > CUT_BACK)] = -1
    lab[(x < -3.62) & (y > .05) & (z > .6)] = -1                                                         # the round rock
    lab[(x > FLAG['x'][0]) & (x < FLAG['x'][1]) & (y > FLAG['y'][0]) & (y < FLAG['y'][1]) & (z > FLAG['z'])] = -1
    live = lab == 0
    # Guns: the barrel (within its radius of the axis, from the breech end forward) and the breech block behind it.
    for side, k in (('left', 3), ('right', 4)):
        a = axes[side]; q = fc - a['pivot']; t = q @ a['axis']; d = np.linalg.norm(q - np.outer(t, a['axis']), axis=1)
        barrel = (t > -.02) & (t < a['length'] + .3) & (d < .34)
        block = (t <= -.02) & (t > -.6) & (d < .33) & (z > a['pivot'][2] - .3)
        lab[live & (barrel | block)] = k
        if side == 'left':
            lab[comp == muzzle_comp] = k
    live = lab == 0
    for side, k, sign in (('left', 1, -1), ('right', 2, 1)):
        h = HOUSING
        m = (sign * x > h['x'][0]) & (sign * x < h['x'][1]) & (z > h['z'][0]) & (z < h['z'][1]) & (y > h['y'][0]) & (y < h['y'][1])
        lab[live & m] = k
    live = lab == 0
    d = DOOR
    door = live & (np.abs(x) < d['x']) & (z > d['z'][0]) & (z < d['z'][1]) & (y > d['y'][0]) & (y < d['y'][1])
    lab[door & (x < 0)] = 5; lab[door & (x >= 0)] = 6
    r = RADAR
    lab[live & (x > r['x'][0]) & (x < r['x'][1]) & (y > r['y'][0]) & (y < r['y'][1]) & (z > r['z'])] = 7
    # Each part one connected piece (its largest component); strays go back to the hull.
    for k in range(1, 8):
        idx = np.where(lab == k)[0]
        if len(idx) == 0:
            continue
        keep = ae.largest_component(fv, idx) if k not in (3,) else idx
        lab[np.setdiff1d(idx, keep)] = 0
    return lab


def compact(co, fv, uv):
    used, inv = np.unique(fv.ravel(), return_inverse=True)
    return co[used], inv.reshape(-1, 3), uv


def hidden_weights(me):
    """1 on vertices whose faces all turn well away from the 55-degree camera (rear walls, undersides), else 0."""
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    pn = np.empty(len(me.polygons) * 3); me.polygons.foreach_get('normal', pn); pn = pn.reshape(-1, 3)
    best = np.full(len(me.vertices), -9.0)
    np.maximum.at(best, fv.ravel(), np.repeat(pn @ TO_EYE, 3))
    return (best < -.25).astype(np.float64)


def set_origin(ob, pivot):
    ob.data.transform(Matrix.Translation(-Vector(pivot)))
    ob.location = Vector(pivot)


def chamber(door_y, door_x, z0, z1, depth=1.5):
    """The reactor chamber behind the door (inward-facing walls, dark steel with orange light strips) and the reactor in it
    (a glowing column in clamps). Blender space. Returns (chamber hs, reactor hs, reactor centre)."""
    import lib_hardsurface as vc
    from kit_khepri_infra import HS
    rng = random.Random('stronghold-chamber')
    hs = HS(rng)
    x0, x1, y0, y1 = -door_x - .06, door_x + .06, door_y + .02, door_y + depth
    zb, zt = z0 - .05, z1 + .05
    inside = Vector((0, (y0 + y1) / 2, (zb + zt) / 2))
    V = hs.v
    def quad(a, b, c, d, paint, mat=0):
        idx = (V(a), V(b), V(c), V(d))
        hs.face(idx, paint, 'main', mat, outward=tuple(inside - (Vector(a) + Vector(b) + Vector(c) + Vector(d)) / 4))
    quad((x0, y1, zb), (x1, y1, zb), (x1, y1, zt), (x0, y1, zt), 'ceramic_dk')        # back wall
    quad((x0, y0, zb), (x0, y1, zb), (x0, y1, zt), (x0, y0, zt), 'ceramic')           # left
    quad((x1, y0, zb), (x1, y1, zb), (x1, y1, zt), (x1, y0, zt), 'ceramic')           # right
    quad((x0, y0, zb), (x1, y0, zb), (x1, y1, zb), (x0, y1, zb), 'ceramic_grey')      # floor
    quad((x0, y0, zt), (x1, y0, zt), (x1, y1, zt), (x0, y1, zt), 'ceramic_dk')        # ceiling
    # Light strips down the side walls and across the back, just off the walls.
    for sx in (x0 + .012, x1 - .012):
        hs.box((sx, (y0 + y1) / 2, zt - .14), (.02, depth * .8, .05), 0.0, 'lamp', 1)
    hs.box((0, y1 - .012, zb + .12), (x1 - x0 - .2, .02, .05), 0.0, 'lamp', 1)
    # The reactor: a column of glowing rings between dark clamps, on a plinth.
    rx = HS(rng)
    cy, r = door_y + depth * .5, min(.36, door_x * .55)
    height = (zt - zb) * .82
    rx.cyl((0, cy, zb), (0, 0, 1), r * 1.25, .12, 16, .02, 'ceramic_dk', 0)
    rx.cyl((0, cy, zb + .12), (0, 0, 1), r, height - .24, 16, 0.0, 'lamp', 1, cap0=False, cap1=False)
    for k in range(4):
        rx.cyl((0, cy, zb + .2 + k * (height - .36) / 3), (0, 0, 1), r * 1.12, .07, 16, .01, 'steel', 0)
    rx.cyl((0, cy, zb + height - .12), (0, 0, 1), r * 1.2, .12, 16, .02, 'ceramic_dk', 0)
    return hs, rx, Vector((0, cy, zb + height * .5))


def vc_object(name, hs, mats, glow, ao=.4):
    import lib_hardsurface as vc
    vc.triangulate_nonplanar(hs)
    cols = vc.bake(hs, name, dict(glow=glow, ao=ao, ground=None))
    ob = vc.make_object(name, hs, mats, (0, 0, 0), cols)
    return ob


def ray_first(objects, origin, direction, dist=80):
    """The first object a ray meets (name, distance, point), over evaluated meshes in world space."""
    best = (None, math.inf, None)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objects:
        if o.type != 'MESH' or not o.visible_get():
            continue
        mw = o.matrix_world; inv = mw.inverted()
        lo = inv @ Vector(origin); ld = (inv.to_3x3() @ Vector(direction)).normalized()
        ok, loc, nrm, idx = o.evaluated_get(dg).ray_cast(lo, ld, distance=dist)
        if ok:
            w = mw @ loc; dd = (w - Vector(origin)).length
            if dd < best[1]:
                best = (o.name, dd, tuple(round(c, 3) for c in w))
    return best


def target_ray(x, s):
    """The game camera's ray through a combat target on the target plane: from high above it, down along the view."""
    point = Vector((x, s, TARGET_HEIGHT))
    eye = Vector(TO_EYE)
    return point + eye * 30, -eye


def build(export=True, preview=True, ty=None):
    t0 = time.time()
    report = dict(source=os.path.basename(SRC), axis_x=AXIS_X, tz=TZ)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = load_source()
    src_mat = src.data.materials[0]
    co, fv, uv = ae.arrays(src.data)
    co, fv = ae.weld(co, fv)
    comp = components(fv, len(co))
    ids, inverse, counts = np.unique(comp, return_inverse=True, return_counts=True)
    fz = co[fv][:, :, 2].min(1)
    zmin = np.full(len(ids), np.inf); np.minimum.at(zmin, inverse, fz)
    keep_comp = ids[zmin < DROP_FLOATING_ABOVE]
    # The left barrel's muzzle ring is a loose piece of its own (source x -0.36..-0.31, y -0.33..-0.29, z 0.23..0.27).
    fcs = co[fv].mean(1)
    near = np.linalg.norm(fcs - np.array((-.3355, -.311, .25)), axis=1) < .03
    muzzle_comp = int(np.bincount(inverse[near]).argmax()) if near.any() else -1
    muzzle_comp = int(ids[muzzle_comp]) if muzzle_comp >= 0 and counts[muzzle_comp] < 20000 else -1
    big = np.argsort(-counts)[:8]
    report['components'] = dict(count=int(len(ids)), largest=[dict(faces=int(counts[k]), zmin=float(zmin[k]), kept=bool(zmin[k] < DROP_FLOATING_ABOVE)) for k in big],
                                muzzle=muzzle_comp, dropped_faces=int(counts[zmin >= DROP_FLOATING_ABOVE].sum()))
    log('components', json.dumps(report['components']))
    # Reference units (source * REF), in which the regions are given.
    u = np.c_[(co[:, 0] - AXIS_X) * REF, co[:, 1] * REF, co[:, 2] * REF]
    fc = u[fv].mean(1)
    fn = np.cross(u[fv[:, 1]] - u[fv[:, 0]], u[fv[:, 2]] - u[fv[:, 0]]); fn /= np.maximum(np.linalg.norm(fn, axis=1)[:, None], 1e-12)
    axes = barrel_axes(u, fv, fc, comp, muzzle_comp)
    report['barrels'] = {k: dict(pivot=v['pivot'].tolist(), muzzle=v['muzzle'].tolist(), length=v['length'], yaw_deg=math.degrees(v['yaw']),
                                 pitch_deg=math.degrees(v['pitch'])) for k, v in axes.items()}
    log('barrels', json.dumps(report['barrels']))
    # Scale: the breeches where the centred lens sees the radiator targets at the guns' height.
    bx = np.mean([abs(axes[s]['pivot'][0]) for s in axes]); bz = np.mean([axes[s]['pivot'][2] for s in axes])
    SCALE = REF
    for _ in range(4):
        t = (EYE_Y - (SEA + bz * SCALE / REF + TZ)) / (EYE_Y - FLIGHT)
        SCALE = REF * RADIATOR[0] * t / bx
    k = SCALE / REF
    report['scale'] = SCALE
    lab = classify(u, fv, fc, fn, comp, keep_comp, muzzle_comp, axes)
    for a in axes.values():
        a['pivot'] = a['pivot'] * k + np.array((0, 0, TZ)); a['muzzle'] = a['muzzle'] * k + np.array((0, 0, TZ)); a['length'] *= k
    g = u * k + np.array((0, 0, TZ))
    # Faces wholly under the sea are never seen (the water is opaque).
    under = g[fv][:, :, 2].max(1) < -.03
    lab[under] = -1
    names = [P + 'hull', P + 'cannon_left', P + 'cannon_right', P + 'gun_left', P + 'gun_right', P + 'door_a', P + 'door_b', P + 'radar']
    report['part_faces_source'] = {names[n]: int((lab == n).sum()) for n in range(8)}
    report['dropped_faces'] = int((lab < 0).sum())
    log('parts', report['part_faces_source'], 'dropped', report['dropped_faces'])
    keep = lab >= 0
    fv, uv, lab = fv[keep], uv[keep], lab[keep]
    g, fv, uv = compact(g, fv, uv)
    # The snowy plinth under the terrace is a noisy sculpt that reduction turned into spikes: smoothed first (Taubin, no
    # shrinking), fading out up to the terrace so the fortress keeps its edges; the parts are never smoothed.
    sm = ae.taubin(g, fv, 12)
    w = np.clip((1.2 * k - g[:, 2]) / (.5 * k), 0, 1)
    w[np.unique(fv[lab > 0])] = 0
    g = g + (sm - g) * w[:, None]
    fcg = g[fv].mean(1)
    # The door's front plane and extent, and the core's aim point on it (seventy per cent up the door: the lens sees the
    # cannons and the door from slightly different angles at the top of the view, and the split is even there).
    door = np.isin(lab, (5, 6))
    door_y = float(np.percentile(fcg[door, 1], 20)); door_x = float(np.abs(fcg[door, 0]).max())
    door_z = (float(fcg[door, 2].min()), float(fcg[door, 2].max()))
    aim_z = door_z[0] + .7 * (door_z[1] - door_z[0])
    # The model's frame (the rig contract's orthographic rays, tests/world/cinematic-assets.test.ts): the aim point on the
    # bridge's ray; z 0 is the sea.
    TY = CORE_S - (aim_z - TARGET_HEIGHT) * COT - door_y if ty is None else ty
    g[:, 1] += TY; fcg[:, 1] += TY; door_y += TY
    for a in axes.values():
        a['pivot'][1] += TY; a['muzzle'][1] += TY
    report['ty'] = TY
    # Grown about a point on the bridge's line of sight at the breeches' height: the aim point moves along that line (it
    # stays on it), and the cannon assemblies, re-seated after the split where their breeches were before the growth, move
    # only across (the structure grows round and behind them, and no gap opens over or under them).
    zg = float(np.mean([a['pivot'][2] for a in axes.values()]))
    about = np.array((0.0, door_y - (zg - aim_z) * COT, zg))
    grow = lambda p: about + (np.asarray(p) - about) * GROW
    pivots0 = {side: a['pivot'].copy() for side, a in axes.items()}
    g = grow(g); fcg = grow(fcg)
    for a in axes.values():
        a['pivot'] = grow(a['pivot']); a['muzzle'] = grow(a['muzzle']); a['length'] *= GROW
    door_x *= GROW; door_z = tuple(about[2] + (z - about[2]) * GROW for z in door_z)
    door_y = float(about[1] + (door_y - about[1]) * GROW); aim_z = float(about[2] + (aim_z - about[2]) * GROW)
    report['grow'] = dict(factor=GROW, about=about.tolist())
    report['door'] = dict(y=door_y, half_width=door_x, z=door_z, aim_z=aim_z)
    log('scale %.3f, TY %.3f, door y %.3f z %.3f..%.3f' % (SCALE, TY, door_y, door_z[0], door_z[1]))
    mat, glow_fraction = material(src_mat, os.path.join(PREVIEW, 'textures'))
    report['glow_fraction'] = glow_fraction
    bpy.data.objects.remove(src, do_unlink=True)
    hires = ae.link(bpy.data.objects.new('stronghold_hires', ae.build_mesh('stronghold_hires', g, fv, uv)))
    work = ae.link(bpy.data.objects.new('stronghold_work', ae.build_mesh('stronghold_work', g, fv, uv, [mat] * 8)))
    work.data.polygons.foreach_set('material_index', lab)
    work.data.update()
    # Reduction: what the camera never sees first, then everything evenly; the seams between parts pinned throughout.
    me = work.data
    seam = ae.seam_vertices(me)
    hidden = hidden_weights(me) * ~seam
    fvw, _ = ae.face_labels(me)
    hidden_faces = int((hidden[fvw] > 0).all(1).sum())
    ae.decimate_weighted(work, (len(fvw) - hidden_faces * .85) / len(fvw), hidden)
    # Exported triangles: the parts, plus the housing and gun wrecks (a gun wreck keeps two thirds), plus the chamber.
    def exported():
        _, mi = ae.face_labels(work.data)
        count = lambda k: int((mi == k).sum())
        return len(mi) + int((count(1) + count(2)) * .45) + int((count(3) + count(4)) * .7 * .45) + 900
    ratios = []
    while exported() > BUDGET - 800:
        ratio = min(.97, (BUDGET - 800) / exported())
        ratios.append(round(ratio, 4))
        ae.decimate_weighted(work, ratio, np.where(ae.seam_vertices(work.data), 0.0, 1.0))
    log('reduction: hidden faces %d, then %s -> %d faces (%d exported)' % (hidden_faces, ratios, len(work.data.polygons), exported()))
    report['reduction'] = dict(hidden_faces=hidden_faces, ratios=ratios, faces=len(work.data.polygons))
    mod = work.modifiers.new('tri', 'TRIANGULATE'); ae.apply_modifier(work, mod)
    parts = [ae.split_part(work, k, names[k], [mat]) for k in range(8)]
    bpy.data.objects.remove(work, do_unlink=True)
    for p in parts:
        ae.transfer_normals(p, hires)
    bpy.data.objects.remove(hires, do_unlink=True)
    hull, can_l, can_r, gun_l, gun_r, door_a, door_b, radar = parts
    # Guns: origin at the breech end; turned straight toward the player (-y) about it, keeping their slight pitch.
    muzzles = {}
    for side, gun in (('left', gun_l), ('right', gun_r)):
        a = axes[side]
        set_origin(gun, a['pivot'])
        gun.data.transform(Matrix.Rotation(a['yaw'], 4, 'Z'))
        gun.data.update()
        muzzles[side] = Vector((0, -a['length'], a['length'] * math.tan(a['pitch'])))
    # Housings: origin at their gun's pivot; the gun a child of its housing (the view moves and hides them together).
    for side, can, gun in (('left', can_l, gun_l), ('right', can_r, gun_r)):
        set_origin(can, axes[side]['pivot'])
        gun.parent = can; gun.location = (0, 0, 0)
        # Re-seated: the grown assembly's breech back where it was before the growth.
        can.location = Vector(pivots0[side]); axes[side]['pivot'] = pivots0[side].copy()
        report.setdefault('reseat', {})[side] = (pivots0[side] - grow(pivots0[side])).tolist()
    # Where the renderer seats the model: its origin's s past the player's row at the stop (the aim point on the lens's line
    # of sight through the bridge target; src/world/terrain-vesper.ts STRONGHOLD_AT adds the 9 from the arena's start to the
    # stop). Each gun then moves along s onto its own line of sight (a few tenths: the breech blocks sit deep in the housings).
    ta = (EYE_Y - (SEA + aim_z)) / (EYE_Y - FLIGHT)
    seat = EYE_S + (ROW + CORE_S - EYE_S) * ta - door_y
    for side, gun in (('left', gun_l), ('right', gun_r)):
        a = axes[side]; tg = (EYE_Y - (SEA + a['pivot'][2])) / (EYE_Y - FLIGHT)
        dy = (EYE_S + (ROW + RADIATOR[1] - EYE_S) * tg - seat) - a['pivot'][1]
        gun.location.y += dy
        report.setdefault('gun_move', {})[side] = dict(dy=float(dy), x_error=float(abs(a['pivot'][0]) - RADIATOR[0] * tg))
    # Door leaves: origins at their centres (they slide along x).
    for leaf in (door_a, door_b):
        c = np.array([v.co[:] for v in leaf.data.vertices]).mean(0); set_origin(leaf, c); leaf['slide'] = DOOR_SLIDE * k * GROW
    rc = np.array([v.co[:] for v in radar.data.vertices]); set_origin(radar, (rc[:, 0].mean(), rc[:, 1].mean(), rc[:, 2].min()))
    # Wrecks: the housings crumpled and dark; the guns snapped two thirds along, dark.
    wmat = ae.wreck_material(mat); wmat.name = 'stronghold_wreck'
    wrecks = []
    for side, can, gun in (('left', can_l, gun_l), ('right', can_r, gun_r)):
        cw = ae.wreck_copy(can, wmat, sag=.12, jitter=.05, seed=3 if side == 'left' else 4)
        cw.location = can.location
        gw = ae.wreck_copy(gun, wmat, sag=0, jitter=.035, seed=5 if side == 'left' else 6)
        bm = bmesh.new(); bm.from_mesh(gw.data)
        cut = -axes[side]['length'] * .64
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < cut], context='FACES')
        bm.to_mesh(gw.data); bm.free(); gw.data.update()
        gw.parent = cw; gw.location = gun.location.copy()
        wrecks += [cw, gw]
    # (Dark and broken, the wrecks keep less than half their triangles.)
    for w in wrecks:
        mod = w.modifiers.new('wreck reduction', 'DECIMATE'); mod.ratio = .45; mod.use_collapse_triangulate = True; apply_modifier(w, mod)
    # The chamber and the reactor behind the door (vertex coloured), and the reactor's wreck.
    import lib_hardsurface as vc
    cmats = [vc.make_material('stronghold_chamber_steel', 'vc', rough=.55, metal=.45), vc.make_material('stronghold_chamber_glow', 'glow', colour='#ff7a26', emission=2.0)]
    rmats = [vc.make_material('stronghold_reactor_steel', 'vc', rough=.45, metal=.55), vc.make_material('stronghold_reactor_glow', 'glow', colour='#ff8a30', emission=2.6)]
    chs, rhs, rcen = chamber(door_y, door_x, door_z[0], door_z[1])
    cham = vc_object(P + 'chamber', chs, cmats, {1})
    core = vc_object(P + 'core', rhs, rmats, {1})
    set_origin(core, rcen)
    corew = core.copy(); corew.data = core.data.copy(); corew.name = P + 'core_wreck'; ae.link(corew)
    corew.data.materials.clear(); dead = vc.make_material('stronghold_reactor_dead', 'vc', rough=.9, metal=.2); corew.data.materials.append(dead)
    cols = corew.data.color_attributes['Col']; rgba = np.empty(len(cols.data) * 4, dtype=np.float32); cols.data.foreach_get('color', rgba)
    rgba = rgba.reshape(-1, 4); rgba[:, :3] *= .16; cols.data.foreach_set('color', rgba.ravel())
    corew.scale = (1.08, 1.08, .6); corew.location.z -= (door_z[1] - door_z[0]) * .16
    # Markers.
    markers = []
    for side, gun in (('left', gun_l), ('right', gun_r)):
        m = ae.marker(P + 'muzzle_' + side); m.location = muzzles[side]; m.parent = gun; markers.append(m)
    for side, sign in (('left', -1), ('right', 1)):
        m = ae.marker(P + 'bay_' + side); m.location = (sign * (door_x + .45), door_y - .25, door_z[0] + .12); markers.append(m)
    for n, at in enumerate(VENTS):
        m = ae.marker(P + 'vent_%d' % n); m.location = Vector(grow((at[0] * k, at[1] * k + TY, at[2] * k + TZ))); markers.append(m)
    aim = Vector((0, door_y, aim_z))
    m = ae.marker(P + 'core_aim'); m.location = aim; markers.append(m)
    report['seat'] = dict(origin_s=seat, stronghold_at=seat + 9, aim=list(aim))
    log('seat', json.dumps(report['seat']), 'gun moves', json.dumps(report['gun_move']))
    tag = ae.marker(P + 'approved_v1', source_file=os.path.basename(SRC), scale=SCALE, grow=GROW, ty=TY, tz=TZ, door_slide=DOOR_SLIDE * k * GROW)
    objs = parts + wrecks + [cham, core, corew] + markers + [tag]
    bpy.context.view_layer.update()
    report['triangles'] = ae.tris(objs)
    report['part_triangles'] = {o.name: ae.tris([o]) for o in objs if o.type == 'MESH'}
    log('triangles %d' % report['triangles'], json.dumps(report['part_triangles']))
    if report['triangles'] > BUDGET:
        raise RuntimeError('HELION STRONGHOLD over its %d-triangle budget: %d' % (BUDGET, report['triangles']))
    report['checks'] = checks(objs, wrecks, door_a, door_b, core, can_l, can_r)
    log('checks', json.dumps(report['checks']))
    bounds = np.array([o.matrix_world @ Vector(c) for o in parts + [cham] for c in o.bound_box])
    report['bounds'] = dict(min=bounds.min(0).tolist(), max=bounds.max(0).tolist())
    if export:
        report['export'] = br.export(OUT, objs, "Last Worlds HELION STRONGHOLD (tools/blender/boss_stronghold.py, from the user's fortress GLB)")
        log('exported', report['export'])
    if preview:
        report['previews'] = previews(objs)
    report['seconds'] = round(time.time() - t0, 1)
    os.makedirs(PREVIEW, exist_ok=True)
    with open(os.path.join(PREVIEW, 'stronghold-report.json'), 'w') as f:
        json.dump(report, f, indent=1, default=ae.plain)
    return objs, dict(triangles=report['triangles'], checks=report['checks'], ty=TY, seconds=report['seconds'])


def checks(objs, wrecks, door_a, door_b, core, can_l, can_r):
    """The rig contract (tests/world/cinematic-assets.test.ts): each cannon ray meets its cannon before any other part;
    with the doors slid open the bridge ray meets the reactor first. Wrecks hidden."""
    out = {}
    for w in wrecks:
        w.hide_set(True)
    for o in objs:
        if o.name.endswith('_wreck'):
            o.hide_set(True)
    bpy.context.view_layer.update()
    meshes = [o for o in objs if o.type == 'MESH' and not o.name.endswith('_wreck')]
    for side, sign in (('left', -1), ('right', 1)):
        origin, d = target_ray(sign * RADIATOR[0], RADIATOR[1])
        out['cannon_' + side] = ray_first(meshes, origin, d)
    origin, d = target_ray(0, CORE_S)
    out['core_closed'] = ray_first(meshes, origin, d)
    a0, b0 = door_a.location.copy(), door_b.location.copy()
    slide = door_a['slide']
    door_a.location.x -= slide; door_b.location.x += slide
    bpy.context.view_layer.update()
    out['core_open'] = ray_first(meshes, origin, d)
    for dx in (-.4, .4):
        o2, d2 = target_ray(dx, CORE_S)
        out['core_open_%+.1f' % dx] = ray_first(meshes, o2, d2)
    door_a.location, door_b.location = a0, b0
    for o in objs:
        o.hide_set(False)
    bpy.context.view_layer.update()
    return out


def previews(objs):
    sc = bpy.context.scene
    shown = [o for o in objs if o.type == 'MESH' and not o.name.endswith('_wreck')]
    os.makedirs(PREVIEW, exist_ok=True)
    paths = []
    for view, centre, size in (('game', (0, 2.5, 1.5), 15), ('top', (0, 2, 2), 14), ('side', (0, 2, 2.4), 12), ('front', (0, 0, 2.6), 13),
                               ('three_quarter', (0, 2, 2), 15)):
        paths.append(br.render_view(sc, view, centre, size, os.path.join(PREVIEW, 'stronghold-model-%s.png' % view), res=1100, objects=shown, light='ice'))
    return paths
