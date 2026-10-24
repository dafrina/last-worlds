"""HELION ARK from the user's new Tripo GLB (24 October 2026; "do this one next ... thats the ark"; "lets raise the max to
the veils 80k"; "forget the front diamonds that are pod sketches").

Adapted like THE CRADLE (tools/blender/approved_cradle.py) and the earlier approved bosses: the supplied mesh is kept,
reduced to at most 80k triangles; nothing is regenerated. The shipped model is `build_clean()` (user, 24 October: "clean
it up, the surfaces look way too mushy, rebuild the hull panels yourself"): every part is planarized into flat plates with
hard creases, and the large light plates are re-plated (one even tone per plate from the supplied paint, generated plates
and seams); machinery, turrets, domes and the painted orange stripes and glows keep the supplied paint; all of it baked
onto one fresh atlas. `build()` is the plain adaptation it replaced. Run through Blender MCP:

    import sys, importlib
    sys.path.insert(0, r'\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\tools\\blender')
    import approved_ark; importlib.reload(approved_ark).build_clean()

The source is one solid piece plus the two diamond pod sketches in front (dropped). Parts are cut by position (source
units x 10 below), on the rig contract of src/render/ark-view.ts:
- ark_bridge_shutter_a/b: the central tower's pointed front armour, split down the middle; the view slides the halves
  apart along -x/+x by 1.0 to open the bridge;
- ark_bridge: the Blender-built bridge lens (helion_ark.build_bridge), inside the armour, revealed when it opens;
- ark_radiator_left/right (+ _wreck): the two side deck superstructures, the flank targets;
- ark_turret_left/right: the deck turrets on them, which the view swings to aim;
- ark_hull: everything else; markers for the bays and the wake.
Placement: x 9.5, the hull sunk 0.9 so it rides the sea (model z 0 is the waterline), shifted 0.79 forward so the bridge
projects onto its combat socket (src/content/ark.ts: bridgeS 1.6 on the 1.6 target plane); the radiators then sit at
x +-2.98, s 2.97, which the content follows.
"""
import bpy, os, math, json, random
import numpy as np
from mathutils import Vector, Matrix
import approved_bosses as ab
import boss_remodel as br

SRC = os.path.join(br.ROOT, 'art', 'source', 'approved-bosses', 'ark-tripo-original.glb')
SCALE, OFFSET = 9.5, Vector((0, .79, -.9))
LABEL = 'v6-approved'
BUDGET = 80000
LENS = (0.0, .82, 2.71)   # game coordinates: inside the closed armour, on the camera ray through the bridge socket


def source():
    key = 'approved_source_ark6'
    if key not in bpy.data.objects:
        sc = bpy.data.scenes.new('Last Worlds — Approved source ark v6')
        bpy.context.window.scene = sc
        bpy.ops.import_scene.gltf(filepath=SRC)
        meshes = [o for o in sc.objects if o.type == 'MESH']
        if len(meshes) != 1:
            raise RuntimeError('Approved source mesh count changed')
        meshes[0].name = key
    return bpy.data.objects[key]


def classify(ob):
    """0 hull, 1 armour, 2 radiators, 3 turrets, 9 the diamond pod sketches (dropped)."""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get('vertices', fv); fv = fv.reshape(-1, 3)
    # The two pod sketches are separate pieces low in front: everything below z 0.085 and in front of y -0.26.
    fc = co[fv].mean(1) * 10
    x, y, z = fc.T; ax = np.abs(x)
    cls = np.zeros(len(fc), dtype=np.int64)
    cls[(z < .85) & (y < -2.6) & (ax > .9) & (ax < 1.8)] = 9
    main = cls == 0
    cls[main & (np.abs(ax - 3.05) < .5) & (np.abs(y - 1.9) < .55) & (z > 3.75)] = 3
    cls[main & (cls == 0) & (ax > 2.15) & (ax < 3.95) & (y > .75) & (y < 2.75) & (z > 2.85)] = 2
    cls[main & (cls == 0) & (ax < .9) & (y > -.85) & (y < 1.25) & (z > 2.05) & (z < 4.75)] = 1   # with the tower's front ridge
    return cls, fc / 10


def material(ob, size=2048, normal_size=1024):
    """The atlases at working size, roughness kept legible, the painted orange glows emitting (approved_bosses rule)."""
    key = 'approved_ark6_surface_%d_m55' % size
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    mat = ob.data.materials[0].copy(); mat.name = key
    nt = mat.node_tree; bs = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    directory = os.path.join(br.ROOT, 'lookdev', 'approved-bosses', 'textures'); os.makedirs(directory, exist_ok=True)
    base = None
    for node in [nd for nd in nt.nodes if nd.type == 'TEX_IMAGE']:
        nm = node.image.name
        kind = 'base' if 'basecolor' in nm else 'rm' if '_rm.' in nm else 'normal'
        s = normal_size if kind == 'normal' else size
        img = node.image.copy(); img.name = key + '_' + kind; img.scale(s, s)
        if kind == 'rm':
            data = np.empty(s * s * 4, dtype=np.float32); img.pixels.foreach_get(data); rgba = data.reshape(-1, 4)
            rgba[:, 1] = np.clip(rgba[:, 1], .34, .86)
            # Metal damped: Vesper's bright ice sky turned the fully metallic paint near white in game.
            rgba[:, 2] *= .55
            img.pixels.foreach_set(data)
        path = os.path.join(directory, key + '_' + kind + ('.png' if kind == 'normal' else '.jpg'))
        img.filepath_raw = path; img.file_format = 'PNG' if kind == 'normal' else 'JPEG'; img.save()
        saved = bpy.data.images.load(path, check_existing=False); saved.colorspace_settings.name = img.colorspace_settings.name; saved.pack(); node.image = saved
        if kind == 'base':
            base = saved
    data = np.empty(size * size * 4, dtype=np.float32); base.pixels.foreach_get(data); rgb = data.reshape(-1, 4)[:, :3]
    r, g, b = rgb.T
    weight = np.clip((r - .55) * 4, 0, 1) * np.clip((r - g * 1.7) * 4, 0, 1) * np.clip((g - b * 1.05) * 6, 0, 1)
    rgba = np.ones((size * size, 4), dtype=np.float32); rgba[:, :3] = weight[:, None] * np.array((1, .32, .06))
    emit = bpy.data.images.new(key + '_emission', width=size, height=size, alpha=False)
    emit.colorspace_settings.name = 'Non-Color'; emit.pixels.foreach_set(rgba.ravel()); emit.pack()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = emit
    nt.links.new(tex.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 2.4
    return mat


def planarize(ob, angle=14.0, crease=24.0, min_area=.12, stiffness=.04):
    """Crisp hull panels from a sculpted mesh (user, 24 October: "the surfaces look way too mushy, rebuild the hull panels"):
    faces are grown into panels (neighbours whose normals stay within `angle` of the panel's, never across a crease sharper
    than `crease`); every panel larger than `min_area` gets its best-fit plane, and each vertex moves to the least-squares
    meeting point of its panels' planes (one plane: onto it; two: their crease line; three: the corner), held near where it
    was by `stiffness`. Small details keep their shape. UVs are untouched, so the paint follows."""
    import bmesh, heapq
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    nf = len(bm.faces)
    normal = np.array([f.normal[:] for f in bm.faces]); area = np.array([f.calc_area() for f in bm.faces])
    centre = np.array([f.calc_center_median()[:] for f in bm.faces])
    cos_a, cos_c = math.cos(math.radians(angle)), math.cos(math.radians(crease))
    region = np.full(nf, -1)
    panels = []
    for seed in np.argsort(-area):
        if region[seed] >= 0:
            continue
        rid = len(panels)
        region[seed] = rid
        acc = normal[seed] * area[seed]; tot = area[seed]
        todo = [seed]
        members = [seed]
        while todo:
            f = bm.faces[todo.pop()]
            mean = acc / (np.linalg.norm(acc) or 1)
            for e in f.edges:
                for g in e.link_faces:
                    gi = g.index
                    if region[gi] >= 0 or normal[gi] @ normal[f.index] < cos_c or normal[gi] @ mean < cos_a:
                        continue
                    region[gi] = rid; acc = acc + normal[gi] * area[gi]; tot += area[gi]
                    todo.append(gi); members.append(gi)
        panels.append((np.array(members), tot))
    planes = {}
    for rid, (members, tot) in enumerate(panels):
        if tot < min_area or len(members) < 3:
            continue
        w = area[members]
        c = (centre[members] * w[:, None]).sum(0) / w.sum()
        n = (normal[members] * w[:, None]).sum(0); n /= np.linalg.norm(n) or 1
        planes[rid] = (n, n @ c)
    moved = 0
    for v in bm.verts:
        rids = {region[f.index] for f in v.link_faces} & planes.keys()
        if not rids:
            continue
        x0 = np.array(v.co[:])
        A = np.eye(3) * stiffness; b = x0 * stiffness
        for rid in rids:
            n, d = planes[rid]
            A += np.outer(n, n); b += n * d
        v.co = np.linalg.solve(A, b).tolist(); moved += 1
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.5), use_dissolve_boundaries=False, verts=bm.verts, edges=bm.edges, delimit={'UV'})
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(28))
    return dict(panels=len(planes), regions=len(panels), moved=moved, faces=len(me.polygons))


def flat_faces(ob, limit=10.0):
    """Face attribute 'panel' (1/0): faces whose shading is flat, i.e. every corner normal (smoothed across edges softer
    than planarize's 28-degree creases) within `limit` degrees of the face normal. Plates, decks and bevels qualify;
    domes, barrels and rounded machinery do not."""
    me = ob.data
    n = np.empty(len(me.polygons) * 3); me.polygons.foreach_get('normal', n); n = n.reshape(-1, 3)
    cn = np.empty(len(me.loops) * 3); me.corner_normals.foreach_get('vector', cn); cn = cn.reshape(-1, 3)
    ls = np.empty(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_start', ls)
    cos = np.min(np.stack([(cn[ls + c] * n).sum(1) for c in range(3)], 1), 1)
    flat = cos > math.cos(math.radians(limit))
    att = me.attributes.get('panel') or me.attributes.new('panel', 'FLOAT', 'FACE')   # the shader reads floats
    att.data.foreach_set('value', flat.astype(np.float32))
    return flat


def plate_islands(ob, flat, base, min_area=.01, min_lum=.2):
    """Clean plates: flat faces joined across every edge softer than the 28-degree creases form plates; each plate of at
    least `min_area` whose Tripo paint is light (mean luminance over `min_lum`) is re-plated in one even colour, its paint's
    own mean (a little calmer), so neighbouring plates keep the palette's tone steps while the cracks and smears go.
    Face attributes: 'panel' (1 plated / 0 kept) and 'panel_col'."""
    me = ob.data
    nf = len(me.polygons)
    parent = np.arange(nf)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    sharp = np.zeros(len(me.edges), dtype=bool)
    if 'sharp_edge' in me.attributes:
        me.attributes['sharp_edge'].data.foreach_get('value', sharp)
    le = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('edge_index', le)
    lf = np.repeat(np.arange(nf), 3)
    order = np.argsort(le, kind='stable'); se, sf = le[order], lf[order]
    for k in np.where(se[1:] == se[:-1])[0]:
        e, a, b = se[k], sf[k], sf[k + 1]
        if not sharp[e] and flat[a] and flat[b]:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[rb] = ra
    root = np.array([find(f) for f in range(nf)])
    area = np.empty(nf); me.polygons.foreach_get('area', area)
    W, H = base.size
    px = np.empty(W * H * 4, dtype=np.float32); base.pixels.foreach_get(px); px = px.reshape(H, W, 4)[..., :3]
    uv = np.empty(len(me.loops) * 2, dtype=np.float32); me.uv_layers['src'].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    ls = np.arange(nf) * 3
    rng = np.random.default_rng(5)
    col = np.zeros((nf, 3))
    for _ in range(8):   # a few random points per face, not just its centre
        w = rng.dirichlet((1, 1, 1), nf)
        q = sum(uv[ls + c] * w[:, c:c + 1] for c in range(3))
        col += px[np.clip((q[:, 1] % 1) * H, 0, H - 1).astype(int), np.clip((q[:, 0] % 1) * W, 0, W - 1).astype(int)]
    col /= 8
    _, inv = np.unique(root, return_inverse=True)
    tot = np.bincount(inv, area)
    mean = np.stack([np.bincount(inv, col[:, c] * area) for c in range(3)], 1) / np.maximum(tot, 1e-9)[:, None]
    lum = mean @ np.array((.3, .6, .1))
    calm = np.clip((lum[:, None] + (mean - lum[:, None]) * .55) * .74, .05, .8)   # under Vesper's bright sky
    warm = mean[:, 0] - mean[:, 1] > .06
    plated = flat & (tot[inv] >= min_area) & (lum[inv] > min_lum) & ~warm[inv]
    out = np.ones((nf, 4), dtype=np.float32); out[:, :3] = calm[inv]
    for name, kind, data, key in (('panel', 'FLOAT', plated.astype(np.float32), 'value'), ('panel_col', 'FLOAT_COLOR', out.ravel(), 'color')):
        att = me.attributes.get(name) or me.attributes.new(name, kind, 'FACE')
        att.data.foreach_set(key, data)
    return int(plated.sum()), int(len(tot))


def atlas_images(mat):
    """The working atlases of `material`: base, rm, normal and the emission mask."""
    kinds = dict(base='_base', rm='_rm', normal='_normal', emit='_emission')
    imgs = {n.image.name: n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE'}
    return {k: next(img for name, img in imgs.items() if tag in name) for k, tag in kinds.items()}


def clean_tree(src_mat, style):
    """Bake-only material: on panel faces clean plating (the panel colour x generated plates, seams, plate texture, light
    grime; bumped seams), elsewhere the Tripo paint, roughness/metal and normals read through the 'src' UVs. Painted glows
    always keep the Tripo paint. Returns the material and a wire(kind) that routes a pass to its output."""
    imgs = atlas_images(src_mat)
    mat = bpy.data.materials.get('ark6_clean__bake') or bpy.data.materials.new('ark6_clean__bake')
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    out = N('ShaderNodeOutputMaterial')
    uvsrc = N('ShaderNodeUVMap'); uvsrc.uv_map = 'src'
    def tex(img):
        t = N('ShaderNodeTexImage'); t.image = img; t.interpolation = 'Linear'; L(uvsrc.outputs['UV'], t.inputs['Vector']); return t
    t_base, t_rm, t_norm, t_emit = tex(imgs['base']), tex(imgs['rm']), tex(imgs['normal']), tex(imgs['emit'])
    coord = N('ShaderNodeTexCoord')
    def attr(name):
        a = N('ShaderNodeAttribute'); a.attribute_type = 'GEOMETRY'; a.attribute_name = name; return a
    a_panel, a_col = attr('panel'), attr('panel_col')

    def m(op, a, b=None, clamp=False):
        n = N('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for k, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[k].default_value = v
            else:
                L(v, n.inputs[k])
        return n.outputs[0]

    def remap(v, a, b, c=0.0, d=1.0):
        n = N('ShaderNodeMapRange'); L(v, n.inputs['Value'])
        n.inputs['From Min'].default_value, n.inputs['From Max'].default_value = a, b
        n.inputs['To Min'].default_value, n.inputs['To Max'].default_value = c, d
        return n.outputs['Result']

    def mixc(fac, a, b, blend='MIX'):
        n = N('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
        for slot, v in (('Factor', fac), ('A', a), ('B', b)):
            if isinstance(v, (int, float)):
                n.inputs[slot].default_value = v
            elif isinstance(v, tuple):
                n.inputs[slot].default_value = (*v[:3], 1)
            else:
                L(v, n.inputs[slot])
        return n.outputs['Result']

    # Plating mask: a plated face (plate_islands), never on a painted glow or the warm paint around one (the stripes).
    is_panel = m('GREATER_THAN', a_panel.outputs['Fac'], .5)
    glow = N('ShaderNodeRGBToBW'); L(t_emit.outputs['Color'], glow.inputs['Color'])
    bsep = N('ShaderNodeSeparateColor'); L(t_base.outputs['Color'], bsep.inputs['Color'])
    warm = m('MULTIPLY', m('SUBTRACT', m('SUBTRACT', bsep.outputs['Red'], bsep.outputs['Green']), .04), 10.0, clamp=True)
    keep = m('MAXIMUM', m('MULTIPLY', glow.outputs['Val'], 4.0, clamp=True), warm)
    fac = m('MULTIPLY', is_panel, m('SUBTRACT', 1.0, keep), clamp=True)
    # Plates: the remodel toolkit's generated panel map and Poly Haven plate texture, box-projected in object space.
    pmap = N('ShaderNodeMapping'); pmap.inputs['Scale'].default_value = (1 / (4.0 * style['panel'] * 1.45),) * 3   # broad plates, not tiles
    L(coord.outputs['Object'], pmap.inputs['Vector'])
    ptex = N('ShaderNodeTexImage'); ptex.image = br.panel_image('remodel_panels_' + str(style['seed']), style['seed'], units=4.0)
    ptex.projection = 'BOX'; ptex.projection_blend = .08; ptex.interpolation = 'Linear'; L(pmap.outputs['Vector'], ptex.inputs['Vector'])
    psep = N('ShaderNodeSeparateColor'); L(ptex.outputs['Color'], psep.inputs['Color'])
    seam, tone, height = psep.outputs['Red'], psep.outputs['Green'], psep.outputs['Blue']
    tmap = N('ShaderNodeMapping'); tmap.inputs['Scale'].default_value = (1 / style['tile'],) * 3; L(coord.outputs['Object'], tmap.inputs['Vector'])
    def plate(kind, cs='Non-Color'):
        t = N('ShaderNodeTexImage'); t.image = bpy.data.images.load(br.PLATE % kind, check_existing=True)
        t.image.colorspace_settings.name = cs; t.projection = 'BOX'; t.projection_blend = .2; L(tmap.outputs['Vector'], t.inputs['Vector']); return t
    p_diff, p_rough = plate('Diffuse', 'sRGB'), plate('Rough')
    lum = N('ShaderNodeRGBToBW'); L(p_diff.outputs['Color'], lum.inputs['Color'])
    shade = m('MULTIPLY', remap(lum.outputs['Val'], .1, .5, .92, 1.04), m('MULTIPLY', remap(seam, 0, 1, .3, 1), remap(tone, .4, .6, .86, 1.14)))
    noise = N('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 2.4; noise.inputs['Detail'].default_value = 6; L(coord.outputs['Object'], noise.inputs['Vector'])
    grime = m('MULTIPLY', remap(noise.outputs['Fac'], .5, .74), .12, clamp=True)
    sh = N('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        L(shade, sh.inputs[ch])
    clean = mixc(1.0, a_col.outputs['Color'], sh.outputs['Color'], 'MULTIPLY')
    clean = mixc(grime, clean, mixc(1.0, a_col.outputs['Color'], (.45, .45, .45), 'MULTIPLY'))
    albedo = mixc(fac, t_base.outputs['Color'], clean)
    # Roughness / metal: plating is satin metal with the plate texture's breakup; seams rougher.
    rsep = N('ShaderNodeSeparateColor'); L(t_rm.outputs['Color'], rsep.inputs['Color'])
    p_r = m('ADD', remap(p_rough.outputs['Color'], .2, .8, .36, .52), m('MULTIPLY', m('SUBTRACT', 1.0, seam), .25))
    def mixf(f, a, b):
        n = N('ShaderNodeMix'); n.data_type = 'FLOAT'; L(f, n.inputs['Factor'])
        for slot, v in (('A', a), ('B', b)):
            if isinstance(v, (int, float)):
                n.inputs[slot].default_value = v
            else:
                L(v, n.inputs[slot])
        return n.outputs['Result']
    rough = mixf(fac, rsep.outputs['Green'], p_r)
    metal = mixf(fac, rsep.outputs['Blue'], m('MULTIPLY', seam, .38))
    rm = N('ShaderNodeCombineColor'); rm.inputs['Red'].default_value = 0
    L(rough, rm.inputs['Green']); L(metal, rm.inputs['Blue'])
    # Normals: plate height bumped (seams sink), else the Tripo normal map on its own UVs.
    nmap = N('ShaderNodeNormalMap'); nmap.uv_map = 'src'; L(t_norm.outputs['Color'], nmap.inputs['Color']); nmap.inputs['Strength'].default_value = .8
    bump = N('ShaderNodeBump'); bump.inputs['Strength'].default_value = .7; bump.inputs['Distance'].default_value = .02; L(height, bump.inputs['Height'])
    nmix = N('ShaderNodeMix'); nmix.data_type = 'VECTOR'; L(fac, nmix.inputs['Factor'])
    L(nmap.outputs['Normal'], nmix.inputs[4]); L(bump.outputs['Normal'], nmix.inputs[5])
    nnorm = N('ShaderNodeVectorMath'); nnorm.operation = 'NORMALIZE'; L(nmix.outputs[1], nnorm.inputs[0])
    emit_col = mixc(fac, t_emit.outputs['Color'], (0, 0, 0))
    em = N('ShaderNodeEmission'); bsdf = N('ShaderNodeBsdfPrincipled')
    L(nnorm.outputs['Vector'], bsdf.inputs['Normal'])
    sources = dict(color=albedo, rm=rm.outputs['Color'], emit=emit_col)

    def wire(kind):
        for link in list(out.inputs['Surface'].links):
            nt.links.remove(link)
        if kind == 'normal':
            L(bsdf.outputs['BSDF'], out.inputs['Surface'])
        else:
            L(sources[kind], em.inputs['Color']); L(em.outputs['Emission'], out.inputs['Surface'])
    return mat, wire


def clean_bake(meshes, src_mat, prefix='ark6_clean', size=2048, samples=4, style='vesper'):
    """Bake the clean surface (colour, roughness/metal, normal, emission) onto a fresh shared atlas, then give every mesh
    one textured `<prefix>_surface` material on that atlas alone."""
    for o in meshes:
        me = o.data
        me.uv_layers[0].name = 'src'
        bake_uv = me.uv_layers.get('bake') or me.uv_layers.new(name='bake')
        me.uv_layers.active = bake_uv; bake_uv.active_render = True
    br.unwrap(meshes)
    images = {k: br._image(prefix + '_' + k, size, cs, fill) for k, cs, fill in
              (('color', 'sRGB', (.5, .5, .5, 1)), ('rm', 'Non-Color', (0, .6, .4, 1)), ('normal', 'Non-Color', (.5, .5, 1, 1)), ('emit', 'sRGB', (0, 0, 0, 1)))}
    mat, wire = clean_tree(src_mat, br.STYLES[style])
    target = mat.node_tree.nodes.new('ShaderNodeTexImage')
    for o in meshes:
        o.data.materials.clear(); o.data.materials.append(mat)
    sc = bpy.context.scene
    try:
        sc.render.engine = 'CYCLES'
    except TypeError:
        raise RuntimeError('Cycles is needed for the texture bake')
    sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.render.bake.margin = 6; sc.render.bake.margin_type = 'EXTEND'
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    for kind in ('color', 'rm', 'emit', 'normal'):
        target.image = images[kind]
        for nd in mat.node_tree.nodes:
            nd.select = False
        target.select = True; mat.node_tree.nodes.active = target
        wire(kind)
        if kind == 'normal':
            sc.render.bake.normal_space = 'TANGENT'
            bpy.ops.object.bake(type='NORMAL', use_clear=True, margin=6)
        else:
            bpy.ops.object.bake(type='EMIT', use_clear=True, margin=6)
    directory = os.path.join(br.ROOT, 'lookdev', 'approved-bosses', 'textures'); os.makedirs(directory, exist_ok=True)
    saved = {}
    for kind, img in images.items():
        path = os.path.join(directory, '%s_%s.jpg' % (prefix, kind))
        img.filepath_raw = path; img.file_format = 'JPEG'; img.save(filepath=path, quality=92)
        s = bpy.data.images.load(path, check_existing=False); s.colorspace_settings.name = img.colorspace_settings.name; s.pack()
        saved[kind] = s
    surf = bpy.data.materials.get(prefix + '_surface') or bpy.data.materials.new(prefix + '_surface')
    surf.use_nodes = True
    nt = surf.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    outn = N('ShaderNodeOutputMaterial'); bs = N('ShaderNodeBsdfPrincipled'); L(bs.outputs['BSDF'], outn.inputs['Surface'])
    tc = N('ShaderNodeTexImage'); tc.image = saved['color']; L(tc.outputs['Color'], bs.inputs['Base Color'])
    trm = N('ShaderNodeTexImage'); trm.image = saved['rm']; sep = N('ShaderNodeSeparateColor'); L(trm.outputs['Color'], sep.inputs['Color'])
    L(sep.outputs['Green'], bs.inputs['Roughness']); L(sep.outputs['Blue'], bs.inputs['Metallic'])
    tn = N('ShaderNodeTexImage'); tn.image = saved['normal']; nm = N('ShaderNodeNormalMap'); L(tn.outputs['Color'], nm.inputs['Color']); L(nm.outputs['Normal'], bs.inputs['Normal'])
    te = N('ShaderNodeTexImage'); te.image = saved['emit']; L(te.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 2.4
    for o in meshes:
        me = o.data
        me.materials.clear(); me.materials.append(surf)
        me.uv_layers.remove(me.uv_layers['src'])
        for name in ('panel', 'panel_col'):
            if name in me.attributes:
                me.attributes.remove(me.attributes[name])
    bpy.data.materials.remove(mat)
    return surf


def build_clean(label=LABEL, hull_ratio=.025, part_ratio=.09, atlas=2048):   # hull .025: the Ark fight stays under the 250k frame budget
    """The cleaned Ark (user, 24 October: "clean it up, the surfaces look way too mushy, rebuild the hull panels yourself"):
    the parts of `build`, each planarized into crisp flat panels with hard creases; the large panels re-plated with clean
    metal in the Tripo palette (generated plates and seams, Vesper style), the machinery, turrets, domes and painted glows
    keeping the supplied paint; all baked onto one fresh atlas."""
    src = source()
    sc = bpy.data.scenes.get('Last Worlds — HELION ARK v6') or bpy.data.scenes.new('Last Worlds — HELION ARK v6')
    bpy.context.window.scene = sc
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(m)
    cls, fc = classify(src)
    mat = material(src)
    base = atlas_images(mat)['base']
    game = fc * SCALE + np.array(OFFSET)
    objects, meshes, stats = [], [], {}

    def part(name, mask, pivot=(0, 0, 0), r=part_ratio):
        o = ab.extract(src, np.where(mask)[0].tolist(), name, SCALE, OFFSET, pivot, r)
        if 'custom_normal' in o.data.attributes:
            o.data.attributes.remove(o.data.attributes['custom_normal'])
        o.data.uv_layers[0].name = 'src'
        stats[name] = planarize(o, angle=26, crease=38, min_area=.03, stiffness=.01)   # firm: the sculpted plates go flat
        stats[name]['plated'], stats[name]['plates'] = plate_islands(o, flat_faces(o), base)
        objects.append(o); meshes.append(o)
        return o

    part('ark_hull', cls == 0, r=hull_ratio)
    for nm, sg in (('a', -1), ('b', 1)):
        m = (cls == 1) & (np.sign(fc[:, 0]) == sg)
        part('ark_bridge_shutter_' + nm, m, tuple(game[m].mean(0)))
    rads = []
    for side, sg in (('left', -1), ('right', 1)):
        m = (cls == 2) & (np.sign(fc[:, 0]) == sg)
        rads.append(part('ark_radiator_' + side, m, tuple(game[m].mean(0))))
        t = (cls == 3) & (np.sign(fc[:, 0]) == sg)
        b = game[t]; pivot = (b[:, 0].mean(), b[:, 1].mean(), b[:, 2].min())
        part('ark_turret_' + side, t, pivot, .2)
    clean_bake(meshes, mat, size=atlas)
    for o in rads:
        objects.append(ab.wreck_copy(o))
    import helion_ark as old, vesper_common as vc
    h = old.build_bridge(random.Random('approved-bridge'))
    for v in h.verts:
        v[0] *= .45; v[1] = LENS[1] + (v[1] - 1.6) * .45; v[2] = LENS[2] + (v[2] - 1.6) * .45
    mats = [vc.make_material('ark_interior', 'vc', rough=.45, metal=.5), vc.make_material('ark_interior_trim', 'vc', rough=.5, metal=.7), vc.make_material('ark_interior_glow', 'glow')]
    vc.triangulate_nonplanar(h); cols = vc.bake(h, 'ark_bridge', dict(glow={2}, ao=.45, ground=None))
    objects.append(vc.make_object('ark_bridge', h, mats, old.SOCKETS['ark_bridge'], cols))
    for side, sg in (('left', -1), ('right', 1)):
        objects.append(ab.marker('ark_bay_' + side, (sg * .75, -2, 1)))
    objects.append(ab.marker('ark_wake_anchor', (0, 4, 0)))
    total = tris(objects)
    if total > BUDGET:
        raise RuntimeError('HELION ARK over its %d-triangle budget: %d' % (BUDGET, total))
    tag = ab.marker('ark_approved_v6'); tag['source_file'] = os.path.basename(SRC); tag['reduction_ratio'] = hull_ratio; tag['cleaned'] = True
    objects.append(tag)
    path = os.path.join(br.ROOT, 'public', 'assets', 'vesper', 'helion-ark-%s.glb' % label)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path + '.tmp.glb', export_format='GLB', use_selection=True, use_active_scene=True,
                              export_materials='EXPORT', export_image_format='AUTO', export_texcoords=True, export_normals=True,
                              export_yup=True, export_animations=False, export_extras=True, export_cameras=False, export_lights=False,
                              export_copyright='Last Worlds — user-supplied Tripo GLB, panels cleaned and re-plated in Blender')
    os.replace(path + '.tmp.glb', path)
    print(json.dumps(dict(file=path, triangles=total, bytes=os.path.getsize(path), stats=stats, nodes=[o.name for o in objects])))
    return objects


def tris(objects):
    total = 0
    for o in objects:
        if o.type == 'MESH':
            o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
    return total


def build(hull_ratio=.029, part_ratio=.09, label=LABEL):
    src = source()
    sc = bpy.data.scenes.get('Last Worlds — HELION ARK v6') or bpy.data.scenes.new('Last Worlds — HELION ARK v6')
    bpy.context.window.scene = sc
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(m)
    cls, fc = classify(src)
    mat = material(src)
    game = fc * SCALE + np.array(OFFSET)
    objects = []

    def part(name, mask, pivot=(0, 0, 0), r=part_ratio):
        o = ab.extract(src, np.where(mask)[0].tolist(), name, SCALE, OFFSET, pivot, r)
        o.data.materials.clear(); o.data.materials.append(mat); objects.append(o)
        return o

    part('ark_hull', cls == 0, r=hull_ratio)
    for nm, sg in (('a', -1), ('b', 1)):
        m = (cls == 1) & (np.sign(fc[:, 0]) == sg)
        part('ark_bridge_shutter_' + nm, m, tuple(game[m].mean(0)))
    for side, sg in (('left', -1), ('right', 1)):
        m = (cls == 2) & (np.sign(fc[:, 0]) == sg)
        rad = part('ark_radiator_' + side, m, tuple(game[m].mean(0)))
        objects.append(ab.wreck_copy(rad))
        t = (cls == 3) & (np.sign(fc[:, 0]) == sg)
        base = game[t]; pivot = (base[:, 0].mean(), base[:, 1].mean(), base[:, 2].min())
        part('ark_turret_' + side, t, pivot, .2)
    # The bridge lens (Blender-built, as in the v4 adaptation), inside the closed armour.
    import helion_ark as old, vesper_common as vc
    h = old.build_bridge(random.Random('approved-bridge'))
    for v in h.verts:
        v[0] *= .45; v[1] = LENS[1] + (v[1] - 1.6) * .45; v[2] = LENS[2] + (v[2] - 1.6) * .45
    mats = [vc.make_material('ark_interior', 'vc', rough=.45, metal=.5), vc.make_material('ark_interior_trim', 'vc', rough=.5, metal=.7), vc.make_material('ark_interior_glow', 'glow')]
    vc.triangulate_nonplanar(h); cols = vc.bake(h, 'ark_bridge', dict(glow={2}, ao=.45, ground=None))
    objects.append(vc.make_object('ark_bridge', h, mats, old.SOCKETS['ark_bridge'], cols))
    for side, sg in (('left', -1), ('right', 1)):
        objects.append(ab.marker('ark_bay_' + side, (sg * .75, -2, 1)))
    objects.append(ab.marker('ark_wake_anchor', (0, 4, 0)))
    total = tris(objects)
    if total > BUDGET:
        raise RuntimeError('HELION ARK over its %d-triangle budget: %d' % (BUDGET, total))
    tag = ab.marker('ark_approved_v6'); tag['source_file'] = os.path.basename(SRC); tag['reduction_ratio'] = hull_ratio; objects.append(tag)
    path = os.path.join(br.ROOT, 'public', 'assets', 'vesper', 'helion-ark-%s.glb' % label)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path + '.tmp.glb', export_format='GLB', use_selection=True, use_active_scene=True,
                              export_materials='EXPORT', export_image_format='AUTO', export_texcoords=True, export_normals=True,
                              export_yup=True, export_animations=False, export_extras=True, export_cameras=False, export_lights=False,
                              export_copyright='Last Worlds — user-supplied Tripo GLB, adapted in Blender without regeneration')
    os.replace(path + '.tmp.glb', path)
    print(json.dumps(dict(file=path, triangles=total, bytes=os.path.getsize(path), faces={int(k): int((cls == k).sum()) for k in np.unique(cls)},
                          nodes=[o.name for o in objects])))
    return objects
