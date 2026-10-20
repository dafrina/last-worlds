"""Clean hard-surface remodels of the three bosses, traced over the user's supplied GLBs.

The supplied models (art/source/approved-bosses, Tripo sculpts of ~500k triangles with the
detail painted into 4k atlases) are references only: proportions, masses and part layout.
Nothing of their mesh is exported. Each boss is rebuilt from simple faceted solids with
flat paints, baked AO vertex colours and emissive trim, at about 16k triangles, keeping the
existing rig contract (node names, pivots, combat sockets) so the game drives it unchanged.

Run through Blender MCP (UNC workspace path) or headless; see art/boss-remodel/README.md.
"""
import bpy, os, math, json
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCES = {'veil': 'futuristic-spacecraft-original.glb', 'bastion': 'futuristic-tank-original.glb', 'ark': 'futuristic-starship-original.glb'}
# Placement of each source in game space (Blender axes: x right, y = -glTF z, z up), as used by
# the v4 adaptation the game was tuned against: game = source * scale + offset.
PLACEMENT = {'veil': (12.5, (0, .9, .15)), 'bastion': (9.6, (0, -.12, .03)), 'ark': (9.5, (0, .2, -.18))}  # Bastion: 20% larger than v4 (user, 20 Oct)
LOOKDEV = os.path.join(ROOT, 'lookdev', 'boss-remodel')


def scene(name):
    """A fresh scene of this name. Headless (no window): the startup scene, emptied."""
    if bpy.context.window is None:
        sc = bpy.context.scene
        for o in list(sc.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        sc.name = name
        return sc
    old = bpy.data.scenes.get(name)
    if old:
        for o in list(old.objects):
            if o.users <= 1 or o.name.startswith(('ref_', 'remodel_')):
                bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(old)
    sc = bpy.data.scenes.new(name)
    bpy.context.window.scene = sc
    return sc


def source_mesh(boss):
    """The supplied mesh, imported once per Blender session (never modified or exported)."""
    key = 'remodel_source_' + boss
    if key in bpy.data.meshes:
        return bpy.data.meshes[key]
    # Reuse an import already in this session (approved_bosses.py names it this way).
    earlier = bpy.data.objects.get('approved_source_' + {'veil': 'spacecraft', 'bastion': 'tank', 'ark': 'starship'}[boss])
    if earlier and earlier.type == 'MESH' and len(earlier.data.polygons) > 100000:
        return earlier.data
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'art', 'source', 'approved-bosses', SOURCES[boss]))
    added = set(bpy.data.objects) - before
    meshes = [o for o in added if o.type == 'MESH']
    if len(meshes) != 1:
        raise RuntimeError('Expected one source mesh for ' + boss)
    mesh = meshes[0].data
    mesh.name = key
    for o in added:
        bpy.data.objects.remove(o, do_unlink=True)
    return mesh


def reference(boss, sc=None):
    """The source placed in game space as a non-exported reference object."""
    sc = sc or bpy.context.scene
    name = 'ref_' + boss
    ob = bpy.data.objects.get(name)
    if not ob:
        ob = bpy.data.objects.new(name, source_mesh(boss))
    if name not in sc.objects:
        sc.collection.objects.link(ob)
    scale, offset = PLACEMENT[boss]
    ob.scale = (scale,) * 3
    ob.location = offset
    return ob


def bounds(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


VIEWS = {  # camera direction (towards the eye), up vector, image axes (world axis for +u, +v)
    'top': ((0, 0, 1), (0, 1, 0), (0, 1)),
    'side': ((1, 0, 0), (0, 0, 1), (1, 2)),     # right side: u = world y (rear to the right), v = z
    'front': ((0, -1, 0), (0, 0, 1), (0, 2)),   # from the player: u = x, v = z
}


ROTATIONS = {'top': (0, 0, 0), 'front': (90, 0, 0), 'side': (90, 0, 90)}


def ortho_camera(sc, view, centre, size, distance=60):
    """Top: image right +x, up +y. Front (from the player at -y): right +x, up +z.
    Side (from +x): right +y (rear), up +z."""
    direction, _, _ = VIEWS[view]
    cam_data = bpy.data.cameras.new('remodel_cam_' + view)
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size
    cam_data.clip_end = distance * 3
    cam = bpy.data.objects.new('remodel_cam_' + view, cam_data)
    sc.collection.objects.link(cam)
    cam.location = Vector(centre) + Vector(direction) * distance
    cam.rotation_euler = [math.radians(a) for a in ROTATIONS[view]]
    sc.camera = cam
    return cam


def workbench(sc, res, colour='TEXTURE'):
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = colour
    sh.show_shadows = False
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sc.display_settings.display_device = 'sRGB'
    sc.view_settings.view_transform = 'Standard'


def grid_sheet(boss, view, objects, path, centre, size, res=1600, step=.25, major=1.0, colour='TEXTURE'):
    """Orthographic render with a world grid burnt in (minor every `step`, major every `major`,
    the axes in red/green). Returns the pixel->world mapping for reading measurements."""
    sc = bpy.context.scene
    for o in sc.objects:
        o.hide_render = o not in objects and o.type == 'MESH'
    workbench(sc, res, colour)
    cam = ortho_camera(sc, view, centre, size)
    out = path
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    img = bpy.data.images.load(out, check_existing=False)
    px = np.empty(res * res * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(res, res, 4)  # rows bottom-up
    _, _, (ua, va) = VIEWS[view]
    # pixel centre (i column, j row from bottom) -> world (u, v)
    cu, cv = centre[ua], centre[va]
    sign_u = 1
    def world(i, j):
        return cu + sign_u * ((i + .5) / res - .5) * size, cv + ((j + .5) / res - .5) * size
    bg = np.array([.16, .17, .19, 1], dtype=np.float32)
    alpha = px[:, :, 3:4]
    px = px * alpha + bg * (1 - alpha)
    for k in range(-40, 41):
        for value, axis in [(k * step, 'u'), (k * step, 'v')]:
            centre_val = cu if axis == 'u' else cv
            if axis == 'u':
                pos = ((value - cu) * sign_u / size + .5) * res
            else:
                pos = ((value - cv) / size + .5) * res
            p = int(round(pos))
            if p < 0 or p >= res:
                continue
            is_major = abs(value / major - round(value / major)) < 1e-6
            is_axis = abs(value) < 1e-9
            col = np.array([.95, .25, .2, 1]) if is_axis and axis == 'u' else np.array([.3, .9, .35, 1]) if is_axis else np.array([1, 1, 1, 1])
            w = .9 if is_axis else .55 if is_major else .22
            if axis == 'u':
                px[:, p, :] = px[:, p, :] * (1 - w) + col * w
            else:
                px[p, :, :] = px[p, :, :] * (1 - w) + col * w
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    return dict(view=view, centre=list(centre), size=size, res=res, step=step, major=major)


# ----------------------------------------------------------------------------- modelling kit
import bmesh
from mathutils.bvhtree import BVHTree


def srgb(hexcode):
    """'#rrggbb' -> linear RGBA (glTF base colours are linear)."""
    h = hexcode.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4)
    return (*out, 1.0)


def material(name, colour, rough=.55, metal=.35, emit=None, strength=1.0):
    """A plain PBR paint. Emissive ones carry 'glow' in the name: the game animates them
    as damage heat (per part) and lamps (hull)."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = srgb(colour)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    if emit:
        bs.inputs['Emission Color'].default_value = srgb(emit)
        bs.inputs['Emission Strength'].default_value = strength
    else:
        bs.inputs['Emission Strength'].default_value = 0.0
    return mat


class Solids:
    """Faceted closed solids accumulated into one bmesh. Profiles are closed loops; every
    solid is a loft between loops of equal length, capped at both ends."""

    def __init__(self, materials):
        self.bm = bmesh.new()
        self.materials = list(materials)

    def _m(self, name):
        if name not in self.materials:
            self.materials.append(name)
        return self.materials.index(name)

    def loft(self, loops, mat, caps=True):
        m = self._m(mat)
        vs = [[self.bm.verts.new(Vector(p)) for p in loop] for loop in loops]
        n = len(loops[0])
        for a, b in zip(vs, vs[1:]):
            for i in range(n):
                f = self.bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
                f.material_index = m
        if caps:
            for ring in (vs[0], vs[-1]):
                f = self.bm.faces.new(ring)
                f.material_index = m
        return self

    @staticmethod
    def place(axis, at, p):
        """2D profile point p in the plane normal to `axis`, at coordinate `at` along it.
        x-axis profiles are (y, z); y-axis (x, z); z-axis (x, y)."""
        if axis == 'x':
            return (at, p[0], p[1])
        if axis == 'y':
            return (p[0], at, p[1])
        return (p[0], p[1], at)

    def prism(self, profile, axis, a, b, mat, profile_b=None):
        """Extrude a 2D profile from a to b along an axis (optionally into a second profile)."""
        pb = profile_b or profile
        return self.loft([[self.place(axis, a, p) for p in profile], [self.place(axis, b, p) for p in pb]], mat)

    def box(self, lo, hi, mat, chamfer=0.0):
        """Axis-aligned box; `chamfer` cuts its vertical edges (an octagonal plan)."""
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        c = chamfer
        plan = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)] if not c else [
            (x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]
        return self.prism(plan, 'z', z0, z1, mat)

    def wedge(self, plan, z0, z1, mat, top=None):
        """A plan polygon (x, y) extruded up; `top` (same count) gives a tapered roof."""
        return self.prism(plan, 'z', z0, z1, mat, top)

    def cylinder(self, centre, axis, r, a, b, mat, seg=12, r2=None, phase=0.0):
        cu, cv = {'x': (1, 2), 'y': (0, 2), 'z': (0, 1)}[axis]
        ring = lambda rad: [(centre[cu] + rad * math.cos(phase + 2 * math.pi * i / seg), centre[cv] + rad * math.sin(phase + 2 * math.pi * i / seg)) for i in range(seg)]
        return self.prism(ring(r), axis, a, b, mat, ring(r if r2 is None else r2))

    def gear(self, centre, axis, r, depth, teeth, a, b, mat):
        """A toothed wheel: alternating outer and root radius around the rim."""
        cu, cv = {'x': (1, 2), 'y': (0, 2), 'z': (0, 1)}[axis]
        pts = []
        for i in range(teeth * 2):
            rad = r if i % 2 == 0 else r - depth
            for k in (-.22, .22):
                ang = 2 * math.pi * (i + .5 + k) / (teeth * 2)
                pts.append((centre[cu] + rad * math.cos(ang), centre[cv] + rad * math.sin(ang)))
        return self.prism(pts, axis, a, b, mat)

    def object(self, name, materials, pivot=(0, 0, 0), sc=None, bevel=0.035, sharp=40):
        """Finish into an object: consistent normals, crisp single-segment chamfers on the
        hard edges, smooth shading split at `sharp` degrees; origin at `pivot`."""
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for n in self.materials:
            me.materials.append(materials[n])
        me.transform(Matrix.Translation(-Vector(pivot)))
        ob = bpy.data.objects.new(name, me)
        ob.location = pivot
        (sc or bpy.context.scene).collection.objects.link(ob)
        if bevel:
            mod = ob.modifiers.new('chamfer', 'BEVEL')
            mod.width = bevel
            mod.segments = 1
            mod.limit_method = 'ANGLE'
            mod.angle_limit = math.radians(35)
            mod.miter_outer = 'MITER_ARC'
            bpy.context.view_layer.update()
            evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
            baked = bpy.data.meshes.new_from_object(evaluated)
            ob.modifiers.clear()
            ob.data = baked
            bpy.data.meshes.remove(me)
            baked.name = name
            me = baked
        for p in me.polygons:
            p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(sharp))
        return ob


def mirrored(build):
    """Run a side builder for the left (-1) and right (+1)."""
    for s in (-1, 1):
        build(s)


# ----------------------------------------------------------------------------- baked AO
def hemisphere(n=32):
    """Deterministic cosine-weighted directions about +z (Fibonacci spiral)."""
    out = []
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        u = (i + .5) / n
        r = math.sqrt(u)
        a = golden * i
        out.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(1 - u))))
    return out


def bake_ao(objects, occluders, strength=.85, reach=2.5, ground=0.0, rays=32):
    """Per-corner ambient occlusion into the 'Color' attribute (grey, multiplies the paint
    in glTF). Rays test every occluder plus the ground plane at z = `ground`."""
    verts, polys = [], []
    for o in occluders:
        me = o.data
        mw = o.matrix_world
        base = len(verts)
        verts.extend(mw @ v.co for v in me.vertices)
        polys.extend([base + i for i in p.vertices] for p in me.polygons)
    tree = BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)
    dirs = hemisphere(rays)
    for o in objects:
        me = o.data
        mw = o.matrix_world
        rot = mw.to_3x3().normalized()
        attr = me.color_attributes.get('Color') or me.color_attributes.new('Color', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
        cache = {}
        values = [1.0] * len(me.loops)
        for p in me.polygons:
            n = (rot @ p.normal).normalized()
            basis = n.to_track_quat('Z', 'Y').to_matrix()
            for li, vi in zip(p.loop_indices, p.vertices):
                key = (vi, round(n.x, 2), round(n.y, 2), round(n.z, 2))
                if key not in cache:
                    origin = (mw @ me.vertices[vi].co).lerp(mw @ p.center, .08) + n * .012
                    hit = 0.0
                    for d in dirs:
                        w = basis @ d
                        loc = tree.ray_cast(origin, w, reach)[0]
                        if loc is not None:
                            hit += 1 - (loc - origin).length / reach * .5
                        elif w.z < -1e-3 and (origin.z - ground) / -w.z < reach:
                            hit += .6
                    cache[key] = max(.18, 1 - strength * hit / len(dirs))
                values[li] = cache[key]
        attr.data.foreach_set('color', [c for v in values for c in (v, v, v, 1.0)])


# ----------------------------------------------------------------------------- export and views
def marker(name, at=(0, 0, 0), sc=None, **props):
    o = bpy.data.objects.new(name, None)
    o.location = at
    (sc or bpy.context.scene).collection.objects.link(o)
    for k, v in props.items():
        o[k] = v
    return o


def triangles(objects):
    total = 0
    for o in objects:
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            total += len(o.data.loop_triangles)
    return total


def export(path, objects, note):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.hide_set(False)
        o.select_set(True)
    tmp = path + '.tmp.glb'
    bpy.ops.export_scene.gltf(filepath=tmp, export_format='GLB', use_selection=True, use_active_scene=True,
                              export_materials='EXPORT', export_vertex_color='ACTIVE', export_texcoords=True, export_image_format='AUTO',
                              export_normals=True, export_yup=True, export_animations=False, export_extras=True,
                              export_cameras=False, export_lights=False, export_apply=False, export_copyright=note)
    os.replace(tmp, path)
    return dict(file=os.path.relpath(path, ROOT), triangles=triangles(objects), bytes=os.path.getsize(path))


CAMERAS = {  # view -> (eye direction from the centre, camera rotation in degrees)
    'game': ((0, -math.cos(math.radians(55)), math.sin(math.radians(55))), (35, 0, 0)),
    'top': ((0, 0, 1), (0, 0, 0)),
    'side': ((1, 0, 0), (90, 0, 90)),
    'front': ((0, -1, 0), (90, 0, 0)),
}


def render_view(sc, view, centre, size, path, res=1200, objects=None, light='desert', engine='BLENDER_EEVEE'):
    """Orthographic preview from a named view, with a warm sun and soft sky fill."""
    for o in list(sc.objects):
        if o.name.startswith('remodel_light') or o.name.startswith('remodel_cam'):
            bpy.data.objects.remove(o, do_unlink=True)
    if objects is not None:
        for o in sc.objects:
            if o.type == 'MESH':
                o.hide_render = o not in objects
    direction, rotation = CAMERAS[view]
    cam_data = bpy.data.cameras.new('remodel_cam_' + view)
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size
    cam_data.clip_end = 200
    cam = bpy.data.objects.new('remodel_cam_' + view, cam_data)
    sc.collection.objects.link(cam)
    cam.location = Vector(centre) + Vector(direction) * 60
    cam.rotation_euler = [math.radians(a) for a in rotation]
    sc.camera = cam
    sun_data = bpy.data.lights.new('remodel_light_sun', 'SUN')
    sun_data.energy = 3.4
    sun_data.color = (1, .92, .8) if light == 'desert' else (.88, .94, 1)
    sun_data.angle = math.radians(3)
    sun = bpy.data.objects.new('remodel_light_sun', sun_data)
    sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(38), math.radians(-28), math.radians(-35))
    world = bpy.data.worlds.get('remodel_world') or bpy.data.worlds.new('remodel_world')
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (.3, .25, .22, 1) if light == 'desert' else (.24, .28, .34, 1)
    bg.inputs['Strength'].default_value = .85
    sc.world = world
    try:
        sc.render.engine = engine
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def game_view(sc, centre, size, path, res=1200, objects=None, light='desert'):
    return render_view(sc, 'game', centre, size, path, res, objects, light)


def compose(rows, path):
    """Paste equally sized PNGs into one sheet (rows of columns)."""
    grid = []
    for row in rows:
        tiles = []
        for p in row:
            img = bpy.data.images.load(p, check_existing=False)
            w, h = img.size
            px = np.empty(w * h * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            tiles.append(px.reshape(h, w, 4))
            bpy.data.images.remove(img)
            os.remove(p)
        grid.append(np.concatenate(tiles, axis=1))
    sheet = np.concatenate(grid[::-1], axis=0)  # image rows are bottom-up
    h, w = sheet.shape[:2]
    out = bpy.data.images.new('remodel_sheet', w, h)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    return path


def compare(boss, objects, path, centre, size, res=640, views=('game', 'top', 'side', 'front'), light='desert'):
    """Reference (left) against the remodel (right) from each view, one sheet."""
    sc = bpy.context.scene
    ref = reference(boss, sc)
    bpy.context.view_layer.update()
    meshes = [o for o in objects if o.type == 'MESH' and not o.hide_render]
    rows = []
    for view in views:
        row = []
        for k, subject in enumerate(([ref], meshes)):
            p = os.path.join(LOOKDEV, '_cmp_%s_%s_%d.png' % (boss, view, k))
            render_view(sc, view, centre, size, p, res, subject, light)
            row.append(p)
        rows.append(row)
    sc.collection.objects.unlink(ref)
    return compose(rows, path)


# ----------------------------------------------------------------------------- tracing paper
_POINTS = {}


def source_points(boss):
    """Dense surface samples of the placed source (vertices and triangle centroids), game space."""
    if boss in _POINTS:
        return _POINTS[boss]
    me = source_mesh(boss)
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    me.calc_loop_triangles()
    tri = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get('vertices', tri)
    tri = tri.reshape(-1, 3)
    centroids = co[tri].mean(axis=1)
    mids = (co[tri[:, 0]] + co[tri[:, 1]]) / 2
    scale, offset = PLACEMENT[boss]
    pts = np.concatenate([co, centroids, mids]) * scale + np.array(offset)
    _POINTS[boss] = pts
    return pts


AXES = {'top': (0, 1, 2), 'side': (1, 2, 0), 'front': (0, 2, 1)}  # (u, v, depth) world axes


def _rdp(points, tol):
    if len(points) < 3:
        return points
    a, b = np.array(points[0]), np.array(points[-1])
    ab = b - a
    norm = np.linalg.norm(ab)
    pts = np.array(points)
    if norm < 1e-12:
        d = np.linalg.norm(pts - a, axis=1)
    else:
        d = np.abs(np.cross(ab, pts - a)) / norm
    i = int(np.argmax(d))
    if d[i] > tol:
        return _rdp(points[:i + 1], tol)[:-1] + _rdp(points[i:], tol)
    return [points[0], points[-1]]


def _simplify_loop(loop, tol):
    pts = np.array(loop)
    far = int(np.argmax(np.linalg.norm(pts - pts[0], axis=1)))
    first = _rdp(loop[:far + 1], tol)
    second = _rdp(loop[far:] + [loop[0]], tol)
    return first[:-1] + second[:-1]


def trace(boss, lo, hi, view='top', cell=.04, tol=.07, close=1, min_area=.05):
    """Outline of the source inside box [lo, hi] seen from a view: closed loops of (u, v),
    outer boundaries counter-clockwise, simplified to `tol`. u, v: top (x, y), side (y, z),
    front (x, z)."""
    pts = source_points(boss)
    m = np.all((pts >= np.array(lo)) & (pts <= np.array(hi)), axis=1)
    pts = pts[m]
    ua, va, _ = AXES[view]
    u0, v0 = lo[ua], lo[va]
    nu = int(math.ceil((hi[ua] - u0) / cell)) + 2
    nv = int(math.ceil((hi[va] - v0) / cell)) + 2
    grid = np.zeros((nu, nv), dtype=bool)
    iu = np.clip(((pts[:, ua] - u0) / cell).astype(int) + 1, 0, nu - 1)
    iv = np.clip(((pts[:, va] - v0) / cell).astype(int) + 1, 0, nv - 1)
    grid[iu, iv] = True
    for _ in range(close):  # morphological closing fills sampling gaps
        g = grid.copy()
        g[1:, :] |= grid[:-1, :]; g[:-1, :] |= grid[1:, :]; g[:, 1:] |= grid[:, :-1]; g[:, :-1] |= grid[:, 1:]
        grid = g
    for _ in range(close):
        g = grid.copy()
        g[1:, :] &= grid[:-1, :]; g[:-1, :] &= grid[1:, :]; g[:, 1:] &= grid[:, :-1]; g[:, :-1] &= grid[:, 1:]
        grid = g
    # Directed boundary edges (counter-clockwise around filled cells), chained into loops.
    edges = {}
    filled = np.argwhere(grid)
    occ = set(map(tuple, filled))
    for i, j in filled:
        if (i, j - 1) not in occ: edges[(i, j)] = (i + 1, j)
        if (i + 1, j) not in occ: edges[(i + 1, j)] = (i + 1, j + 1)
        if (i, j + 1) not in occ: edges[(i + 1, j + 1)] = (i, j + 1)
        if (i - 1, j) not in occ: edges[(i, j + 1)] = (i, j)
    loops = []
    while edges:
        start, nxt = edges.popitem()
        loop = [start]
        cur = nxt
        guard = 0
        while cur != start and cur in edges and guard < 200000:
            loop.append(cur)
            cur = edges.pop(cur)
            guard += 1
        world = [(u0 + (p[0] - 1) * cell, v0 + (p[1] - 1) * cell) for p in loop]
        area = .5 * sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(world, world[1:] + world[:1]))
        if abs(area) >= min_area:
            loops.append((area, [(round(u, 3), round(v, 3)) for u, v in _simplify_loop(world, tol)]))
    loops.sort(key=lambda t: -abs(t[0]))
    return [l for _, l in loops]


def extent(boss, lo, hi):
    """Bounding box of the source surface inside a box (for quick measurements)."""
    pts = source_points(boss)
    m = np.all((pts >= np.array(lo)) & (pts <= np.array(hi)), axis=1)
    p = pts[m]
    if not len(p):
        return None
    return [round(float(v), 3) for v in p.min(0)], [round(float(v), 3) for v in p.max(0)], int(m.sum())


def height_map(boss, lo, hi, cell=.25):
    """Top surface height per cell (z max), for reading roof slopes. Rows from rear to front."""
    pts = source_points(boss)
    m = np.all((pts >= np.array(lo)) & (pts <= np.array(hi)), axis=1)
    p = pts[m]
    nx = int(math.ceil((hi[0] - lo[0]) / cell)); ny = int(math.ceil((hi[1] - lo[1]) / cell))
    z = np.full((nx, ny), -np.inf)
    ix = np.clip(((p[:, 0] - lo[0]) / cell).astype(int), 0, nx - 1)
    iy = np.clip(((p[:, 1] - lo[1]) / cell).astype(int), 0, ny - 1)
    np.maximum.at(z, (ix, iy), p[:, 2])
    z[np.isinf(z)] = np.nan
    return z


def print_height_map(boss, lo, hi, cell=.3):
    """Roof heights as text: columns x (left to right), rows y from rear (top) to front."""
    z = height_map(boss, lo, hi, cell)
    xs = [lo[0] + (i + .5) * cell for i in range(z.shape[0])]
    print('     y\\x ' + ' '.join('%5.1f' % x for x in xs))
    for j in range(z.shape[1] - 1, -1, -1):
        y = lo[1] + (j + .5) * cell
        print('%8.2f ' % y + ' '.join('  .  ' if math.isnan(v) else '%5.2f' % v for v in z[:, j]))



# ----------------------------------------------------------------------------- shared shape helpers
CAMERA_TAN = math.tan(math.radians(35))  # the 55-degree game camera's ray loses this much y per unit of height


def ray_y(z, target_y, target_z):
    """y where the camera ray through a fixed combat target reaches height z."""
    return target_y - (z - target_z) * CAMERA_TAN


def mirror_plan(plan, s):
    """A right-side (x > 0) plan for side s, keeping the winding consistent."""
    pts = [(s * x, y) for x, y in plan]
    return pts if s > 0 else pts[::-1]


def slab(h, plan, top, floor, mat):
    """Plan polygon with a height-field roof `top(x, y)` and a flat floor."""
    h.loft([[(x, y, floor) for x, y in plan], [(x, y, top(x, y)) for x, y in plan]], mat)


def join(objects, name, pivot):
    """Merge objects (world shapes kept) into one node with its origin at `pivot`."""
    bpy.context.view_layer.update()
    bm = bmesh.new()
    mats = []
    for ob in objects:
        me = ob.data.copy()
        me.transform(ob.matrix_world)
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        for p in me.polygons:
            p.material_index = remap[p.material_index]
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    sc = objects[0].users_scene[0]
    for ob in objects:
        bpy.data.objects.remove(ob, do_unlink=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    me.transform(Matrix.Translation(-Vector(pivot)))
    ob = bpy.data.objects.new(name, me)
    ob.location = pivot
    sc.collection.objects.link(ob)
    return ob


# ----------------------------------------------------------------------------- baked surface textures
PLATE = os.path.join(ROOT, 'art', 'source', 'polyhaven', 'metal_plate_02', 'metal_plate_02_%s_1k.jpg')
# Weathering per world: dust on the roofs, streaks down the walls, worn bare metal on the edges.
STYLES = {
    'khepri': dict(tile=2.2, detail=.35, panel=1.0, seed=7, seam_dark=.22, dust='#9c7448', dust_amount=.24,
                   streak='#3a1a0e', streak_amount=.3, wear='#b49c86', wear_amount=.7, grime=.22),
    'vesper': dict(tile=2.6, detail=.1, panel=1.1, seed=11, seam_dark=.45, dust='#eef3f7', dust_amount=.22,
                   streak='#5a5660', streak_amount=.1, wear='#e2e4ea', wear_amount=.4, grime=.06),
    'nacre': dict(tile=2.8, detail=.2, cells=1.6, seed=13, seam_dark=.35, dust='#5d4f8c', dust_amount=.15,
                  streak='#120c1e', streak_amount=.2, wear='#9e98c8', wear_amount=.5, grime=.2),
    'luna': dict(tile=2.4, detail=.2, panel=.85, seed=17, seam_dark=.45, dust='#a19e98', dust_amount=.18,
                 streak='#5f5d59', streak_amount=.16, wear='#f2f1ec', wear_amount=.45, grime=.14),
}


def panel_image(name, seed, size=1024, units=4.0, seam=.05, smallest=.32):
    """A tileable hard-surface panel map (Non-Color): R = 1 on plates, 0 in seams; G = per-plate
    tone around .5; B = height (plates raised, bevelled into the seams; hatches, vents, rivets).
    Built from a seeded recursive split of the tile into armour plates."""
    import random
    rng = random.Random(seed)
    per = size / units
    seam_px = max(2, int(round(seam * per)))
    R = np.ones((size, size), dtype=np.float32)
    G = np.full((size, size), .5, dtype=np.float32)
    B = np.full((size, size), .62, dtype=np.float32)
    rects = []

    def split(x0, y0, x1, y1, depth):
        w, h = x1 - x0, y1 - y0
        if (w < 2 * smallest and h < 2 * smallest) or (depth > 2 and max(w, h) < 1.7 and rng.random() < .28):
            rects.append((x0, y0, x1, y1))
            return
        vertical = w > h if abs(w - h) > .25 else rng.random() < .5
        if vertical and w >= 2 * smallest:
            t = round(rng.uniform(smallest, w - smallest) / .08) * .08
            split(x0, y0, x0 + t, y1, depth + 1); split(x0 + t, y0, x1, y1, depth + 1)
        elif h >= 2 * smallest:
            t = round(rng.uniform(smallest, h - smallest) / .08) * .08
            split(x0, y0, x1, y0 + t, depth + 1); split(x0, y0 + t, x1, y1, depth + 1)
        else:
            rects.append((x0, y0, x1, y1))
    split(0, 0, units, units, 0)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)

    def box(a0, b0, a1, b1, inset_px, R_val=None, B_val=None):
        i0, j0, i1, j1 = int(a0 * per) + inset_px, int(b0 * per) + inset_px, int(a1 * per) - inset_px, int(b1 * per) - inset_px
        return slice(max(0, j0), min(size, j1)), slice(max(0, i0), min(size, i1))
    half = seam_px // 2
    for (x0, y0, x1, y1) in rects:
        tone = rng.uniform(.4, .6)
        sl = box(x0, y0, x1, y1, 0)
        G[sl] = tone
        # Seams on the plate border; a 3 px bevel ramp up to the plate face.
        sub_y, sub_x = yy[sl], xx[sl]
        d = np.minimum.reduce([sub_x - int(x0 * per), int(x1 * per) - 1 - sub_x, sub_y - int(y0 * per), int(y1 * per) - 1 - sub_y])
        R[sl] = np.where(d < half, 0, 1)
        B[sl] = np.clip(.25 + (d - half) / 4 * .37, .25, .62)
        w, h = x1 - x0, y1 - y0
        roll = rng.random()
        if roll < .22 and w > .5 and h > .5:  # access hatch: inner seam
            ins = .1
            hs = box(x0 + ins, y0 + ins, x1 - ins, y1 - ins, 0)
            hy, hx = yy[hs], xx[hs]
            hd = np.minimum.reduce([hx - hs[1].start, hs[1].stop - 1 - hx, hy - hs[0].start, hs[0].stop - 1 - hy])
            R[hs] = np.where(hd < max(1, half // 2), 0, R[hs])
            B[hs] = np.where(hd < max(1, half // 2), .38, .58)
        elif roll < .38 and w > .45 and h > .3:  # vent slots
            n = rng.randint(3, 6)
            for k in range(n):
                vx0 = x0 + .1 + k * (w - .2) / n
                vs = box(vx0 + .02, y0 + .1, vx0 + (w - .2) / n - .04, y1 - .1, 0)
                R[vs] = 0
                B[vs] = .2
        if rng.random() < .35:  # rivets along the long edges
            step = .14
            for edge_y in (y0 + .07, y1 - .07):
                t = x0 + .1
                while t < x1 - .1:
                    cx, cy = t * per, edge_y * per
                    r = max(1.5, .018 * per)
                    j0, j1, i0, i1 = int(cy - r - 1), int(cy + r + 2), int(cx - r - 1), int(cx + r + 2)
                    if j0 >= 0 and i0 >= 0 and j1 < size and i1 < size:
                        m = (yy[j0:j1, i0:i1] - cy) ** 2 + (xx[j0:j1, i0:i1] - cx) ** 2 <= r * r
                        B[j0:j1, i0:i1] = np.where(m, .85, B[j0:j1, i0:i1])
                        R[j0:j1, i0:i1] = np.where(m, .6, R[j0:j1, i0:i1])
                    t += step
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.stack([R, G, B, np.ones_like(R)], -1).ravel())
    img.pack()
    return img


def unwrap(meshes, back_scale=.3):
    """One shared UV atlas for all meshes (smart projection), with faces the game camera never
    sees (rear-facing, undersides) shrunk before the final pack so the visible ones get the texels."""
    vl = bpy.context.view_layer
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
    vl.objects.active = meshes[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in meshes:  # shrink hidden islands (rear- or down-facing) in place
        me = o.data
        uv = me.uv_layers.active.data
        rot = o.matrix_world.to_3x3()
        parent = list(range(len(me.polygons)))

        def root(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        edge_faces = {}
        for p in me.polygons:
            for li in p.loop_indices:
                v = me.loops[li].vertex_index
                key_uv = tuple(round(c, 5) for c in uv[li].uv)
                edge_faces.setdefault((v, key_uv), []).append(p.index)
        for faces in edge_faces.values():
            for f in faces[1:]:
                a, b = root(faces[0]), root(f)
                if a != b:
                    parent[b] = a
        islands = {}
        for p in me.polygons:
            islands.setdefault(root(p.index), []).append(p)
        for faces in islands.values():
            n = Vector()
            for p in faces:
                n += (rot @ p.normal) * p.area
            if n.length == 0:
                continue
            n.normalize()
            if n.y > .55 or n.z < -.55:
                loops = [li for p in faces for li in p.loop_indices]
                c = sum((uv[li].uv for li in loops), Vector((0, 0))) / len(loops)
                for li in loops:
                    uv[li].uv = c + (uv[li].uv - c) * back_scale
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=.004)
    bpy.ops.object.mode_set(mode='OBJECT')


def _image(name, size, colour_space, fill):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = colour_space
    img.generated_color = fill
    return img


def _bake_tree(mat, style, target):
    """A bake-only copy of a role material: paint x plate detail + weathering. Returns the copy and
    a function that wires its output for a pass: 'color', 'rm' (0, roughness, metallic), 'normal'."""
    src = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    colour = Vector(src.inputs['Base Color'].default_value[:3])
    rough, metal = src.inputs['Roughness'].default_value, src.inputs['Metallic'].default_value
    glow = 'glow' in mat.name
    bake = mat.copy()
    bake.name = mat.name + '__bake'
    nt = bake.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new
    out = N('ShaderNodeOutputMaterial')
    coord = N('ShaderNodeTexCoord')
    mapping = N('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (1 / style['tile'],) * 3
    L(coord.outputs['Object'], mapping.inputs['Vector'])

    def plate(kind, colour_space='Non-Color'):
        t = N('ShaderNodeTexImage')
        t.image = bpy.data.images.load(PLATE % kind, check_existing=True)
        t.image.colorspace_settings.name = colour_space
        t.projection = 'BOX'
        t.projection_blend = .2
        L(mapping.outputs['Vector'], t.inputs['Vector'])
        return t
    diffuse, roughmap, height = plate('Diffuse', 'sRGB'), plate('Rough'), plate('Displacement')
    geo = N('ShaderNodeNewGeometry')

    def math_node(op, a, b=None, clamp=False):
        m = N('ShaderNodeMath')
        m.operation = op
        m.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                L(v, m.inputs[i])
        return m.outputs[0]

    def remap(v, a, b, c=0.0, d=1.0):
        m = N('ShaderNodeMapRange')
        L(v, m.inputs['Value'])
        m.inputs['From Min'].default_value, m.inputs['From Max'].default_value = a, b
        m.inputs['To Min'].default_value, m.inputs['To Max'].default_value = c, d
        return m.outputs['Result']

    def noise(scale, detail=4.0, stretch=None):
        t = N('ShaderNodeTexNoise')
        t.inputs['Scale'].default_value = scale
        t.inputs['Detail'].default_value = detail
        if stretch:
            mp = N('ShaderNodeMapping')
            mp.inputs['Scale'].default_value = stretch
            L(coord.outputs['Object'], mp.inputs['Vector'])
            L(mp.outputs['Vector'], t.inputs['Vector'])
        else:
            L(coord.outputs['Object'], t.inputs['Vector'])
        return t.outputs['Fac']

    def mix(fac, a, b):
        m = N('ShaderNodeMix')
        m.data_type = 'RGBA'
        L(fac, m.inputs['Factor']) if not isinstance(fac, float) else None
        if isinstance(fac, float):
            m.inputs['Factor'].default_value = fac
        for slot, v in (('A', a), ('B', b)):
            if isinstance(v, (tuple, list, Vector)):
                m.inputs[slot].default_value = (*v[:3], 1)
            else:
                L(v, m.inputs[slot])
        return m.outputs['Result']

    lum = N('ShaderNodeRGBToBW')
    L(diffuse.outputs['Color'], lum.inputs['Color'])
    detail = remap(lum.outputs['Val'], .1, .5, 1 - style['detail'], 1 + style['detail'] * .4)
    # Panel layer: generated armour plating (box-projected), or organic chitin cells (nacre).
    if style.get('cells'):
        cells = N('ShaderNodeTexVoronoi')
        cells.feature = 'DISTANCE_TO_EDGE'
        cells.inputs['Scale'].default_value = style['cells']
        L(coord.outputs['Object'], cells.inputs['Vector'])
        seam = remap(cells.outputs['Distance'], .0, .045)
        plate_tone = remap(noise(3.0, 2), .3, .7, .42, .58)
        panel_height = remap(cells.outputs['Distance'], .0, .12, .25, .62)
    else:
        pmap = N('ShaderNodeMapping')
        pmap.inputs['Scale'].default_value = (1 / (4.0 * style['panel']),) * 3  # one tile = 4 units of plating
        L(coord.outputs['Object'], pmap.inputs['Vector'])
        ptex = N('ShaderNodeTexImage')
        ptex.image = panel_image('remodel_panels_' + str(style['seed']), style['seed'], units=4.0)
        ptex.projection = 'BOX'
        ptex.projection_blend = .08
        ptex.interpolation = 'Linear'
        L(pmap.outputs['Vector'], ptex.inputs['Vector'])
        psep = N('ShaderNodeSeparateColor')
        L(ptex.outputs['Color'], psep.inputs['Color'])
        seam, plate_tone, panel_height = psep.outputs['Red'], psep.outputs['Green'], psep.outputs['Blue']
    panel_factor = math_node('MULTIPLY', remap(seam, 0, 1, style['seam_dark'], 1), remap(plate_tone, .4, .6, .8, 1.2))
    detail = math_node('MULTIPLY', detail, panel_factor)
    tint = N('ShaderNodeMix')
    tint.data_type = 'RGBA'
    tint.blend_type = 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1
    tint.inputs['A'].default_value = (*colour, 1)
    comb = N('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        L(detail, comb.inputs[ch])
    L(comb.outputs['Color'], tint.inputs['B'])
    albedo = tint.outputs['Result']
    # Grime breakup, then streaks down the walls (strongest on vertical faces).
    sep = N('ShaderNodeSeparateXYZ')
    L(geo.outputs['Normal'], sep.inputs['Vector'])
    up = sep.outputs['Z']
    grime = math_node('MULTIPLY', remap(noise(2.4, 6), .48, .72), style['grime'], clamp=True)
    albedo = mix(grime, albedo, tuple(colour * .45))
    wall = remap(math_node('ABSOLUTE', up), .2, .7, 1, 0)
    streaks = math_node('MULTIPLY', remap(noise(1.6, 5, (5, 5, .35)), .52, .72), wall, clamp=True)
    albedo = mix(math_node('MULTIPLY', streaks, style['streak_amount'], clamp=True), albedo, srgb(style['streak'])[:3])
    # Worn edges: the bevelled shading normal departs from the true one near hard edges.
    bevel = N('ShaderNodeBevel')
    bevel.samples = 8
    bevel.inputs['Radius'].default_value = .022
    dot = N('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    L(bevel.outputs['Normal'], dot.inputs[0])
    L(geo.outputs['Normal'], dot.inputs[1])
    edge = remap(dot.outputs['Value'], .99, .85)
    wear = math_node('MULTIPLY', math_node('MULTIPLY', edge, remap(noise(6, 3), .35, .6)), style['wear_amount'], clamp=True)
    if not glow:
        albedo = mix(wear, albedo, srgb(style['wear'])[:3])
    # Dust or frost settles on roofs.
    dust = math_node('MULTIPLY', math_node('MULTIPLY', remap(up, .6, .95), remap(noise(3.2, 6), .45, .75)), style['dust_amount'], clamp=True)
    albedo = mix(dust, albedo, srgb(style['dust'])[:3])
    if glow:
        albedo_out = mix(0.0, (*colour,), (*colour,))
    else:
        albedo_out = albedo
    # Roughness and metallic: plate variation, dust is rough and dull, worn edges shine.
    rvar = remap(roughmap.outputs['Color'], .2, .9, .8, 1.2)
    r = math_node('ADD', math_node('MULTIPLY', rvar, rough), math_node('MULTIPLY', dust, .35))
    r = math_node('ADD', r, math_node('MULTIPLY', math_node('SUBTRACT', 1.0, seam), .25))
    r = math_node('SUBTRACT', r, math_node('MULTIPLY', wear, .25), clamp=True)
    m = math_node('ADD', math_node('MULTIPLY', math_node('SUBTRACT', 1.0, dust), metal), math_node('MULTIPLY', wear, .4), clamp=True)
    rm = N('ShaderNodeCombineColor')
    L(r, rm.inputs['Green'])
    L(m, rm.inputs['Blue'])
    # Relief for the normal pass: plate seams and pitting.
    bump = N('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .7
    bump.inputs['Distance'].default_value = .03
    relief = math_node('ADD', math_node('MULTIPLY', panel_height, .8), math_node('MULTIPLY', height.outputs['Color'], .12))
    L(relief, bump.inputs['Height'])
    bsdf = N('ShaderNodeBsdfPrincipled')
    L(bump.outputs['Normal'], bsdf.inputs['Normal'])
    emit = N('ShaderNodeEmission')
    target_node = N('ShaderNodeTexImage')
    target_node.image = target
    nt.nodes.active = target_node

    def wire(kind, image):
        target_node.image = image
        nt.nodes.active = target_node
        for l in list(out.inputs['Surface'].links):
            nt.links.remove(l)
        for l in list(emit.inputs['Color'].links):
            nt.links.remove(l)
        if kind == 'normal':
            L(bsdf.outputs['BSDF'], out.inputs['Surface'])
        else:
            L(albedo_out if kind == 'color' else rm.outputs['Color'], emit.inputs['Color'])
            L(emit.outputs['Emission'], out.inputs['Surface'])
    return bake, wire


def texture_bake(objects, prefix, style, size=2048, samples=8):
    """Bake one surface atlas (colour, roughness/metallic, normal) for every non-glow material
    of these meshes, then give them a single textured `<prefix>_surface` material. Glow stays
    untextured and emissive (the game animates it). Returns the saved image paths."""
    sc = bpy.context.scene
    meshes = [o for o in objects if o.type == 'MESH']
    unwrap(meshes)
    images = dict(color=_image(prefix + '_atlas_color', size, 'sRGB', (.5, .5, .5, 1)),
                  rm=_image(prefix + '_atlas_rm', size, 'Non-Color', (0, .6, .4, 1)),
                  normal=_image(prefix + '_atlas_normal', size, 'Non-Color', (.5, .5, 1, 1)))
    originals = {}
    wires = []
    for o in meshes:
        for slot in o.material_slots:
            m = slot.material
            if m.name not in originals:
                originals[m.name] = _bake_tree(m, STYLES[style], images['color'])
            slot.material = originals[m.name][0]
    try:
        sc.render.engine = 'CYCLES'
    except TypeError:
        raise RuntimeError('Cycles is needed for the texture bake')
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.render.bake.margin = 6
    sc.render.bake.margin_type = 'EXTEND'
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    for kind in ('color', 'rm', 'normal'):
        for bake, wire in originals.values():
            wire(kind, images[kind])
        if kind == 'normal':
            sc.render.bake.normal_space = 'TANGENT'
            bpy.ops.object.bake(type='NORMAL', use_clear=True, margin=6)
        else:
            bpy.ops.object.bake(type='EMIT', use_clear=True, margin=6)
    paths = {}
    tex_dir = os.path.join(LOOKDEV, 'textures')
    os.makedirs(tex_dir, exist_ok=True)
    for kind, img in images.items():
        path = os.path.join(tex_dir, '%s_%s.jpg' % (prefix, kind))
        img.filepath_raw = path
        img.file_format = 'JPEG'
        sc.render.image_settings.quality = 90
        img.save(filepath=path, quality=92)
        saved = bpy.data.images.load(path, check_existing=False)
        saved.colorspace_settings.name = img.colorspace_settings.name
        saved.pack()
        images[kind] = saved
        paths[kind] = path
    # The single textured surface (glTF: baseColor, metallicRoughness G/B, tangent normal).
    surf = bpy.data.materials.get(prefix + '_surface') or bpy.data.materials.new(prefix + '_surface')
    surf.use_nodes = True
    nt = surf.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = images['color']
    nt.links.new(tc.outputs['Color'], bs.inputs['Base Color'])
    trm = nt.nodes.new('ShaderNodeTexImage'); trm.image = images['rm']
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(trm.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bs.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bs.inputs['Metallic'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = images['normal']
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    for o in meshes:
        for slot in o.material_slots:
            name = slot.material.name.replace('__bake', '')
            slot.material = bpy.data.materials[name] if 'glow' in name or name.endswith('_jet') else surf
        merge_slots(o)
    for bake, _ in originals.values():
        bpy.data.materials.remove(bake)
    return paths


def merge_slots(ob):
    """One slot per distinct material: the glTF exporter writes a primitive (a draw call) per slot."""
    me = ob.data
    unique, remap = [], []
    for m in me.materials:
        if m not in unique:
            unique.append(m)
        remap.append(unique.index(m))
    if len(unique) == len(me.materials):
        return
    indices = [remap[p.material_index] for p in me.polygons]
    me.materials.clear()
    for m in unique:
        me.materials.append(m)
    me.polygons.foreach_set('material_index', indices)
    me.update()
