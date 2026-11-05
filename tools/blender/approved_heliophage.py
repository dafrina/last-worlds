"""THE HELIOPHAGE, Corona's boss, from the user's Tripo GLB (5 November 2026; docs/37).

The user: "the boss concept and its glb file you can find in my downloads folder. Again same workflow, rebuild using the
glb reference as a ref for shape and dimensions etc as well as textures"; "Make it 16 units wide, the eclipse is the final
boss"; the laid-flat, squashed placement "is about what it should look like in game".

Adapted like THE ECLIPSE (approved_eclipse.py, whose helpers this imports): the supplied mesh, UVs and painted atlases are
kept and reduced; nothing of the shape is regenerated. Headless:

    R=/home/davidfarina/Projects/alien-skies
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/approved_heliophage.py)" -- \\
        --out "$(wslpath -w $R/public/assets/corona/the-heliophage-v1-approved.glb)" --preview-dir "$(wslpath -w $R/lookdev/corona/heliophage)"

Source: art/source/approved-bosses/heliophage-tripo-original.glb (one piece, 1,909,385 triangles, 4K atlases). It stands
upright in the GLB (a station: a disc deck on top, a crown of spires, a caged molten core at its front between two
armoured blocks, hooked claw-arms below). Laid flat like THE ECLIPSE, so the concept's front faces the camera: source
(x, y, z) -> game (x, z, -y * DEPTH) * SCALE (0.98 wide -> 16 units; the depth squashed to DEPTH so the whole boss
stays between the arena's plateau and the flight plane), the spires away from the player, the claws toward them.
Origin: x 0 on the symmetry axis, y 0 at the core's centre, z 0 at the station's mid-plane.

Parts (by position and the painted glow):
- heliophage_heart: the molten core (the sphere's glowing faces round the core's centre), the core target;
- heliophage_pod_left/right: the two armoured blocks' vent grilles (the first pair);
- heliophage_prow: the central tower's glowing column (the third first-phase target, as THE ECLIPSE's prow vent);
- heliophage_hull: everything else. Each target has a dark crumpled _wreck.
One material: the supplied atlases at 2K (roughness kept legible), plus an emission mask: the painted orange-gold glow
strips and the core (saturated warm paint brighter than the armour).
"""
import bpy, os, sys, math, json, time
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import approved_eclipse as ae

ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, 'art', 'source', 'approved-bosses', 'heliophage-tripo-original.glb')
WIDTH, DEPTH = 16.0, .35
BUDGET = 80000
LABEL = 'v1-approved'
P = 'heliophage_'
# Target regions (game units, relative to the core's centre; measured on lookdev/corona/heliophage/grid-top.png).
HEART_R = 1.85                                             # the molten sphere (r ~1.7) inside its cage
POD = dict(x=(4.0, 6.0), y=(.2, 1.3))                      # each armoured block's vent grille (x mirrored)
PROW = dict(x=(-.6, .6), y=(3.7, 5.5))                     # the central tower's glowing column
# The core (sphere, cage and hood) tilts its front 10 degrees further toward the player (user, 5 November: "The core of
# heliophage should point more down, like that front side more towards down by maybe 10 degrees"): a rotation about the
# x axis through the core's centre, full inside CORE_BOX and fading out over CORE_FALL, so the mesh bends, never tears.
CORE_TILT, CORE_BOX, CORE_FALL = math.radians(30), dict(x=2.6, y=(-2.7, 1.6)), 1.4


def log(*a):
    print('HELIO', *a, flush=True)


def apply_modifier(ob, mod):
    """Apply one modifier with a context override (approved_eclipse's version walks every view-layer object)."""
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


ae.apply_modifier = apply_modifier


def load_source():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SRC)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if len(meshes) != 1 or len(meshes[0].data.polygons) != 1909385:
        raise RuntimeError('Heliophage source changed: %s' % [(o.name, len(o.data.polygons)) for o in meshes])
    return meshes[0]


def glowing(rgb):
    """0..1: saturated warm paint brighter than the armour (the glow strips, the molten core)."""
    V = rgb.max(-1)
    sat = (rgb[..., 0] - rgb[..., 2]) / np.maximum(V, 1e-3)
    return np.clip((V - .62) / .2, 0, 1) * np.clip((sat - .45) / .25, 0, 1) * np.clip((rgb[..., 1] - .28) / .15, 0, 1)


def material(src_mat, directory, size=2048, normal_size=1024):
    key = 'approved_heliophage_surface_%d_v1' % size
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
            rgba[:, 1] = np.clip(rgba[:, 1], .4, .88)
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
    mask = glowing(rgb)
    col = rgb * mask[..., None]
    rgba = np.ones((size, size, 4), dtype=np.float32); rgba[..., :3] = np.clip(col, 0, 1)
    emit = bpy.data.images.new(key + '_emission', width=size, height=size, alpha=False)
    emit.colorspace_settings.name = 'sRGB'; emit.pixels.foreach_set(rgba.ravel()); emit.pack()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = emit
    nt.links.new(tex.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 2.2
    return mat, float((mask > .1).mean())


def tilt_core(g, cz):
    """Turn the core's front toward the player (-y) by CORE_TILT about the x axis through (y 0, z cz), bending out."""
    out = np.maximum.reduce([np.abs(g[:, 0]) - CORE_BOX['x'], CORE_BOX['y'][0] - g[:, 1], g[:, 1] - CORE_BOX['y'][1], np.zeros(len(g))])
    t = np.clip(out / CORE_FALL, 0, 1)
    a = CORE_TILT * (1 - t * t * (3 - 2 * t))
    y, z = g[:, 1].copy(), g[:, 2] - cz
    g[:, 1] = y * np.cos(a) - z * np.sin(a)
    g[:, 2] = cz + y * np.sin(a) + z * np.cos(a)


def build(out, pdir):
    t0 = time.time()
    report = {}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = load_source()
    src_mat = src.data.materials[0] if src.data.materials[0] and src.data.materials[0].node_tree else next(m for m in bpy.data.materials if m.node_tree and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes))
    co, fv, uv = ae.arrays(src.data)
    co, fv = ae.weld(co, fv)
    S = WIDTH / (co[:, 0].max() - co[:, 0].min())
    g = np.c_[co[:, 0], co[:, 2], -co[:, 1] * DEPTH] * S
    g[:, 0] -= (g[:, 0].max() + g[:, 0].min()) / 2
    # Faces: centroids, normals, painted colour at the UV centroid.
    fc = g[fv].mean(1)
    n = np.cross(g[fv[:, 1]] - g[fv[:, 0]], g[fv[:, 2]] - g[fv[:, 0]]); n /= np.maximum(np.linalg.norm(n, axis=1)[:, None], 1e-12)
    rgb = ae.sample(ae.base_pixels(src_mat), uv.mean(1))
    glow = glowing(rgb)
    # The core's centre: the glowing faces of the molten sphere (the brightest, most saturated blob near the middle).
    near = (np.abs(fc[:, 0]) < 2.2) & (fc[:, 1] > 1.5) & (fc[:, 1] < 5.5) & (glow > .5) & (n[:, 2] > .2)
    cy = float(np.median(fc[near, 1])); cz = float(np.percentile(fc[near, 2], 60))
    g[:, 1] -= cy; fc[:, 1] -= cy
    report.update(scale=S, core_centre_raw_y=cy, core_height=cz, source_faces=len(fv))
    log('scale %.3f, core at y %.2f (raw), height %.2f; bounds x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % (
        S, cy, cz, g[:, 0].min(), g[:, 0].max(), g[:, 1].min(), g[:, 1].max(), g[:, 2].min(), g[:, 2].max()))
    # Labels: 0 hull, 1 heart, 2 pod left, 3 pod right, 4 prow.
    lab = np.zeros(len(fv), dtype=np.int32)
    up = n[:, 2] > .15
    r = np.hypot(fc[:, 0], fc[:, 1])
    lab[(r < HEART_R) & up & (glow > .25)] = 1
    for side, k in ((-1, 2), (1, 3)):
        box = (side * fc[:, 0] >= POD['x'][0]) & (side * fc[:, 0] <= POD['x'][1]) & (fc[:, 1] >= POD['y'][0]) & (fc[:, 1] <= POD['y'][1])
        lab[box & up & (fc[:, 2] > 0)] = k
    box = (fc[:, 0] >= PROW['x'][0]) & (fc[:, 0] <= PROW['x'][1]) & (fc[:, 1] >= PROW['y'][0]) & (fc[:, 1] <= PROW['y'][1])
    lab[box & up & (fc[:, 2] > 0)] = 4
    # Keep each target one connected piece (its largest component), the rest back to the hull.
    for k in (1, 2, 3, 4):
        idx = np.where(lab == k)[0]
        keep = ae.largest_component(fv, idx)
        lab[np.setdiff1d(idx, keep)] = 0
    names = [P + 'hull', P + 'heart', P + 'pod_left', P + 'pod_right', P + 'prow']
    tilt_core(g, cz)
    fc = g[fv].mean(1)
    report['part_faces'] = {names[k]: int((lab == k).sum()) for k in range(5)}
    log('parts', report['part_faces'])
    # Centres of the targets (visible faces), for the combat sockets (src/content/heliophage.ts).
    sockets = {}
    for k in (1, 2, 3, 4):
        m = lab == k
        sockets[names[k]] = [float(np.mean(fc[m, 0])), float(np.mean(fc[m, 1])), float(np.percentile(fc[m, 2], 70))]
    report['sockets'] = sockets
    log('sockets', json.dumps(sockets))
    mat, glow_fraction = material(src_mat, os.path.join(pdir, 'textures'))
    report['glow_fraction'] = glow_fraction
    # Full-resolution placed surface (shading source), then the working mesh with the parts as material slots.
    hires = ae.link(bpy.data.objects.new('heliophage_hires', ae.build_mesh('heliophage_hires', g, fv, uv)))
    work = ae.link(bpy.data.objects.new('heliophage_work', ae.build_mesh('heliophage_work', g, fv, uv, [mat] * 5)))
    work.data.polygons.foreach_set('material_index', lab)
    work.data.update()
    bpy.data.objects.remove(src, do_unlink=True)
    # Reduction: the underside (faces turned away from the camera above) first, then everything, seams pinned.
    me = work.data
    seam = ae.seam_vertices(me)
    fvw, _ = ae.face_labels(me)
    hidden_v = np.zeros(len(me.vertices), dtype=bool)
    down = n[:, 2] < -.2
    hidden_v[np.unique(fvw[down].ravel())] = True
    hidden_v[np.unique(fvw[~down].ravel())] = False
    free = hidden_v & ~seam
    hidden_faces = int(free[fvw].all(1).sum())
    first = (len(fvw) - hidden_faces * .8) / len(fvw)
    ae.decimate_weighted(work, first, free.astype(np.float64))
    ratios = []
    wreck_count = lambda: int(sum((ae.face_labels(work.data)[1] == k).sum() for k in (1, 2, 3, 4)))
    while len(work.data.polygons) + wreck_count() > BUDGET - 1000:
        ratio = min(.97, (BUDGET - 1000) / (len(work.data.polygons) + wreck_count()))
        ratios.append(round(ratio, 4))
        ae.decimate_weighted(work, ratio, np.where(ae.seam_vertices(work.data), 0.0, 1.0))
    log('reduction: first %.3f (hidden faces %d), then %s -> %d faces' % (first, hidden_faces, ratios, len(work.data.polygons)))
    # Triangulate for split_part (loops in face order).
    bpy.context.view_layer.objects.active = work
    mod = work.modifiers.new('tri', 'TRIANGULATE'); ae.apply_modifier(work, mod)
    parts = [ae.split_part(work, k, names[k], [mat]) for k in range(5)]
    bpy.data.objects.remove(work, do_unlink=True)
    for p in parts:
        ae.transfer_normals(p, hires)
    bpy.data.objects.remove(hires, do_unlink=True)
    wmat = ae.wreck_material(mat); wmat.name = 'approved_heliophage_wreck'
    wrecks = [ae.wreck_copy(p, wmat, sag=.15, jitter=.05, seed=i + 1) for i, p in enumerate(parts[1:])]
    marker = ae.link(bpy.data.objects.new(P + 'approved_v1', None))
    objs = parts + wrecks + [marker]
    report['triangles'] = ae.tris(objs)
    log('triangles %d' % report['triangles'])
    result = ae.br.export(out, objs, 'Last Worlds THE HELIOPHAGE (tools/blender/approved_heliophage.py, from the user\'s Tripo GLB)') if hasattr(ae, 'br') else None
    if result is None:
        import boss_remodel as br
        result = br.export(out, objs, "Last Worlds THE HELIOPHAGE (tools/blender/approved_heliophage.py, from the user's Tripo GLB)")
    report['export'] = result
    report['seconds'] = round(time.time() - t0, 1)
    return dict(report=report, objs=objs, parts=parts)


def previews(res, pdir):
    import boss_remodel as br
    sc = bpy.context.scene
    shown = [o for o in res['objs'] if o.type == 'MESH' and not o.name.endswith('_wreck')]
    shots = []
    for view, size in (('game', 19), ('top', 18), ('three_quarter', 19)):
        shots.append(br.render_view(sc, view, (0, 2.4, 0), size, os.path.join(pdir, 'heliophage-%s.png' % view), res=1100, objects=shown))
    return shots


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = lambda k, d: argv[argv.index(k) + 1] if k in argv else d
    out = opt('--out', os.path.join(ROOT, 'public', 'assets', 'corona', 'the-heliophage-%s.glb' % LABEL))
    pdir = opt('--preview-dir', os.path.join(ROOT, 'lookdev', 'corona', 'heliophage'))
    os.makedirs(pdir, exist_ok=True)
    res = build(out, pdir)
    if '--no-previews' not in argv:
        res['report']['previews'] = previews(res, pdir)
    with open(os.path.join(pdir, 'heliophage-report.json'), 'w') as f:
        json.dump(res['report'], f, indent=1, default=ae.plain)
    log('DONE')


if __name__ == '__main__':
    main()
