"""THE VEIL v6: a clean faceted remodel traced over the user's supplied crescent carrier GLB.

v6 (24 October 2026; user: "remove its two tentacles in its front those were actually also sketches of its pods"): the
pods hanging under the bow, their hoods and the arms carrying them are gone; the source's floating crystals in front were
the concept sheet's pod sketches, not parts of the ship. The launched pod (veil_flight_pod) stays; pods now drop from
under the bow at the gameplay bays (x +-1.7, s -2.6), where the view flashes each launch.

Outlines, heights and depths come from boss_remodel.trace / height maps over the supplied model
(art/source/approved-bosses/futuristic-spacecraft-original.glb) at the v4 placement
(x12.5, offset (0, .9, .15)); every number below is a final game unit, measured, then rounded,
symmetrised and simplified. Nothing of the source mesh is exported.

The masses, in the source's layout:
- two crescent wings (domed carapace with a sharp outer rim, a hooked lower arm sweeping forward,
  an open hangar in the front face holding three pods, horns curling in toward the crown);
- the centre: a keeled thorax on a cross axle, two big scythe mandibles, a collar, a tall bud of
  four petals over the heart, small fins beside it, and a crown egg hovering above;
- (v5 only) pods hanging under the bow on arms, read from the sketches; removed in v6.

Combat sockets are unchanged. Each flank weak point is the innermost hangar pod, set at the mouth
where the 55-degree camera ray through its fixed target (x +-3.1, s -0.4, height 2.2) meets it.
The heart sits on the ray through (0, 1.8, 2.2) inside the bud; the petals hinge about their local
x axis (glTF yaw = azimuth) and flip outward when the view opens them by 105 degrees.

Concept sheet notes (20 October) folded in where the source allows: darker raised rim with a cyan
seam under it, a glowing seam down the bud, a dark collar with cyan lights, dark framework with
small lights between wings and heart, cyan slits on the hangar pods, drop pods as eggs with petal
seams, a cyan slit and an engine glow under a pointed bottom. Flat role materials only
(veil_shell/panel/metal/steel/glow); the shared texture bake adds the cracked-cell surface.

The game camera looks from the front at 55 degrees: backs, undersides and rear-facing ends are
never seen, so they stay plain (user note, 20 October).

Blender axes: x right, y away from the player (glTF -z), z up. Mire surface at z = 0.
"""
import math, os
from mathutils import Vector, Matrix
import boss_remodel as br
from boss_remodel import join

LABEL = 'v6-remodel'
TAN = math.tan(math.radians(35))  # the camera ray loses TAN of y per unit of height
TARGET_Z = 2.2                    # VEIL.targetHeight
POD_X, POD_S, HEART_S = 3.1, -0.4, 1.8
SHUTTER_PHI = [math.radians(45 + 90 * k) for k in range(4)]  # glTF yaw (azimuth from +Z toward +X)
# Sampled from the supplied atlas: deep indigo/violet carapace, near-black frame, pale violet-grey
# blades, cyan-teal light.
PALETTE = dict(
    shell=('#3e3762', .38, .5, None), panel=('#241c42', .5, .45, None), metal=('#110e16', .46, .7, None),
    steel=('#6d6c73', .32, .7, None), glow=('#06201c', .45, .1, '#3ff2d8'),
)
# Legacy empties of the rig (the_veil.py EMPTIES, glTF (x, up, toward player) -> Blender).
EMPTIES = {'veil_bay_left': (-1.7, 1.8, 2.6), 'veil_bay_right': (1.7, 1.8, 2.6), 'veil_engine_0': (0.0, 1.2, -10.1),
           'veil_engine_1': (-0.85, 1.3, -10.1), 'veil_engine_2': (0.85, 1.3, -10.1)}


def materials():
    return {key: br.material('veil_' + key, c, r, m, e, 2.0 if e else 0) for key, (c, r, m, e) in PALETTE.items()}


def ray_y(z, target_y):
    """y where the camera ray through a fixed combat target (height 2.2) reaches height z."""
    return target_y - (z - TARGET_Z) * TAN


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))


def mx(points, s):
    """Mirror 3D points to side s (x -> s * x)."""
    return [(s * p[0], p[1], p[2]) for p in points]


# ----------------------------------------------------------------------------- solid helpers
def loft(h, rings, mats, caps=('', '')):
    """Loft closed rings of equal length; a ring of one point is an apex (triangle fan).
    mats: one material or one per ring edge j (the band between points j and j+1).
    caps: materials of the first and last ring's cap ('' leaves it open)."""
    n = max(len(r) for r in rings)
    if isinstance(mats, str):
        mats = [mats] * n
    idx = [h._m(m) for m in mats]
    bm = h.bm
    vs = [[bm.verts.new(Vector(p)) for p in ring] for ring in rings]
    for a, b in zip(vs, vs[1:]):
        if len(a) == 1 or len(b) == 1:
            apex, ring = (a[0], b) if len(a) == 1 else (b[0], a)
            for j in range(n):
                f = bm.faces.new((ring[j], ring[(j + 1) % n], apex))
                f.material_index = idx[j]
            continue
        for j in range(n):
            f = bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
            f.material_index = idx[j]
    for ring, m in ((vs[0], caps[0]), (vs[-1], caps[1])):
        if m and len(ring) > 2:
            f = bm.faces.new(ring)
            f.material_index = h._m(m)
    return h


def plate(h, plan, top, thick, mat, side=None):
    """Plan polygon (x, y) with a height-field roof top(x, y), `thick` deep."""
    loft(h, [[(x, y, top(x, y) - thick) for x, y in plan], [(x, y, top(x, y)) for x, y in plan]], side or mat, (mat, mat))


def catmull(seq, sub=2):
    """Catmull-Rom resampling of a sequence of equal-length number tuples (or point lists):
    `sub` samples per span, ends clamped, the last item kept."""
    def flat(v):
        return [c for p in v for c in p] if isinstance(v[0], (tuple, list)) else list(v)
    shape = [len(p) for p in seq[0]] if isinstance(seq[0][0], (tuple, list)) else None
    data = [flat(v) for v in seq]
    out = []
    for i in range(len(data) - 1):
        p0, p1, p2, p3 = data[max(i - 1, 0)], data[i], data[i + 1], data[min(i + 2, len(data) - 1)]
        for j in range(sub):
            t = j / sub
            v = [.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
                 for a, b, c, d in zip(p0, p1, p2, p3)]
            out.append(v)
    out.append(data[-1])
    if shape:
        res = []
        for v in out:
            pts, k = [], 0
            for n in shape:
                pts.append(tuple(v[k:k + n]))
                k += n
            res.append(pts)
        return res
    return [tuple(v) for v in out]


def frame_at(path, i):
    """Horizontal normal (left of travel) at path point i."""
    a, b = Vector(path[max(i - 1, 0)]), Vector(path[min(i + 1, len(path) - 1)])
    t = b - a
    t.z = 0
    t.normalize()
    return Vector((-t.y, t.x, 0))


def sweep(h, path, sections, mats, caps=('', '')):
    """Cross-sections along a path: each section a list of (u, v) offsets (u along the horizontal
    normal, v up) or None for an apex at the path point."""
    rings = []
    for i, (c, sec) in enumerate(zip(path, sections)):
        if sec is None:
            rings.append([tuple(c)])
            continue
        u = frame_at(path, i)
        rings.append([tuple(Vector(c) + u * a + Vector((0, 0, b))) for a, b in sec])
    return loft(h, rings, mats, caps)


def egg(h, centre, profile, seg, mat, sx=1.0, sy=1.0, phase=None, mats=None):
    """Lathe around a vertical axis: profile [(dz, r)] bottom to top; r = 0 is an apex point."""
    phase = math.pi / seg if phase is None else phase
    rings = []
    for dz, r in profile:
        if r <= 0:
            rings.append([(centre[0], centre[1], centre[2] + dz)])
        else:
            rings.append([(centre[0] + sx * r * math.cos(phase + 2 * math.pi * k / seg),
                           centre[1] + sy * r * math.sin(phase + 2 * math.pi * k / seg), centre[2] + dz) for k in range(seg)])
    return loft(h, rings, mats or mat, (mat, mat))


def finish(ob, bevel=.035, sharp=40, cutters=()):
    """Boolean cuts, then a crisp single-segment chamfer on the hard edges, smooth shading split
    at `sharp` degrees (as boss_remodel.Solids.object)."""
    import bpy
    for c in cutters:
        mod = ob.modifiers.new('cut', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = c
        try:
            mod.solver = 'EXACT'
        except TypeError:
            pass
        try:
            mod.material_mode = 'TRANSFER'
        except (TypeError, AttributeError):
            pass
    if bevel:
        mod = ob.modifiers.new('chamfer', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(35)
        mod.miter_outer = 'MITER_ARC'
    if ob.modifiers:
        bpy.context.view_layer.update()
        evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        baked = bpy.data.meshes.new_from_object(evaluated)
        ob.modifiers.clear()
        old = ob.data
        ob.data = baked
        name = old.name
        bpy.data.meshes.remove(old)
        baked.name = name
    for c in cutters:
        me = c.data
        bpy.data.objects.remove(c, do_unlink=True)
        bpy.data.meshes.remove(me)
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(sharp))
    return ob


def solid(build, name, mats, sc, pivot=(0, 0, 0), bevel=.035, cutters=()):
    h = br.Solids([])  # material slots in first-use order, none unused
    build(h)
    ob = h.object(name, mats, pivot, sc, bevel=0 if cutters else bevel)
    if cutters:
        finish(ob, bevel, cutters=[c(mats, sc) for c in cutters])
    return ob


# ----------------------------------------------------------------------------- wings
# Stations front to rear: inner edge (x, y), outer edge (x, y) and the cross-section heights
# [inner bottom, inner top, ridge (t .3), field (t .62), shoulder (t .86), rim (t 1), under-rim (t .92),
#  belly (t .45)] read from the source height maps (zmax / zmin) along each station line.
WING_T = [0, 0, .3, .62, .86, 1, .92, .45]
WING = [
    ((2.35, -1.85), (5.6, -0.65), [3.1, 4.72, 4.8, 4.85, 4.55, 3.95, 3.15, 3.05]),   # front face (hangar)
    ((2.55, -0.95), (6.0, -0.25), [3.15, 4.76, 4.88, 4.8, 4.3, 3.8, 3.3, 3.12]),
    ((2.8, 0.0), (6.1, 0.55), [3.0, 4.95, 5.0, 4.86, 4.42, 3.95, 3.45, 2.95]),
    ((2.7, 0.95), (6.0, 1.5), [2.95, 5.15, 5.14, 4.88, 4.45, 3.95, 3.42, 2.88]),
    ((2.15, 1.6), (5.7, 2.25), [3.05, 5.3, 5.22, 4.95, 4.6, 4.0, 3.5, 2.85]),
    ((2.0, 2.55), (5.15, 2.95), [3.0, 5.38, 5.24, 5.0, 4.7, 4.1, 3.55, 2.9]),
    ((2.15, 3.4), (4.5, 3.62), [3.15, 5.37, 5.2, 4.95, 4.66, 4.2, 3.7, 3.1]),
    ((2.55, 3.95), (3.6, 4.12), [3.9, 5.15, 4.95, 4.72, 4.55, 4.3, 4.05, 3.9]),   # tapered rear end
]
# The crescent rim: a raised blade along the outer edge from the rear, around the side and forward
# into the hook below the hangar. Outer edge point (x, y) on the traced outline, width inward,
# bottom and top heights.
CRESCENT = [
    ((3.55, 4.2), .3, 4.08, 4.55), ((4.4, 3.82), .46, 3.88, 4.58), ((5.25, 3.1), .56, 3.62, 4.55),
    ((5.88, 2.15), .64, 3.42, 4.48), ((6.18, 1.05), .68, 3.3, 4.42), ((6.18, 0.1), .7, 3.18, 4.3),
    ((6.0, -0.75), .7, 3.05, 4.12), ((5.5, -1.5), .6, 3.0, 3.92), ((4.85, -2.12), .44, 3.08, 3.76),
    ((4.35, -2.45), .26, 3.14, 3.56), ((3.98, -2.56), 0, 3.3, 3.3),
]
WING_MATS = ['panel', 'shell', 'shell', 'shell', 'shell', 'shell', 'metal', 'metal']
FRONT_A, FRONT_B = WING[0][0], WING[0][1]
MOUTH_AXIS = (Vector(FRONT_B) - Vector(FRONT_A)).normalized()         # along the front face, inward to outward
MOUTH_BACK = Vector((-MOUTH_AXIS.y, MOUTH_AXIS.x))                     # into the wing
MOUTH = dict(s0=.3, s1=3.0, floor=3.35, lid_in=4.48, lid_out=4.22, back=.62)


def mouth_point(s, d, z):
    """Hangar coordinates of the right wing: s along the front face from its inner tip, d behind it."""
    p = Vector(FRONT_A) + MOUTH_AXIS * s + MOUTH_BACK * d
    return (p.x, p.y, z)


def wing_ring(k, s=1):
    inner, outer, zs = WING[k]
    return [(s * lerp(inner, outer, t)[0], lerp(inner, outer, t)[1], z) for t, z in zip(WING_T, zs)]


def roof(k, t):
    """Top surface point of station k at parameter t (inner 0 .. rim 1), right side."""
    inner, outer, zs = WING[k]
    ts, z = WING_T[1:6], zs[1:6]
    for (t0, z0), (t1, z1) in zip(zip(ts, z), zip(ts[1:], z[1:])):
        if t <= t1:
            f = (t - t0) / (t1 - t0)
            break
    p = lerp(inner, outer, t)
    return (p[0], p[1], z0 + (z1 - z0) * f)


def roof_band(h, s, ks, t0, t1, lift, mat, depth=.12, inset=0.0):
    """A raised plate following the carapace between parameters t0..t1 over stations ks."""
    rows = []
    for i, k in enumerate(ks):
        a, b = t0, t1
        if inset and i in (0, len(ks) - 1):
            a, b = t0 + inset, t1 - inset
        rows.append([roof(k, a + (b - a) * f) for f in (0, .5, 1)])
    top = [[(s * x, y, z + lift) for x, y, z in r] for r in rows]
    bot = [[(s * x, y, z - depth) for x, y, z in r] for r in rows]
    rings = [t + b[::-1] for t, b in zip(top, bot)]
    loft(h, rings, mat, (mat, mat))


def mouth_cutter(s):
    """Prism removing the hangar mouth from the front face (its walls take the frame paint)."""
    def make(mats, sc):
        m = MOUTH
        c = .2
        prof = [(m['s0'], m['floor'] + c), (m['s0'] + c, m['floor']), (m['s1'] - c, m['floor']), (m['s1'], m['floor'] + c),
                (m['s1'], m['lid_out'] - c), (m['s1'] - c, m['lid_out']), (m['s0'] + c, m['lid_in']), (m['s0'], m['lid_in'] - c)]
        h = br.Solids([])
        rings = [[mouth_point(u, d, z) for u, z in prof] for d in (-1.2, m['back'])]
        loft(h, [mx(r, s) for r in rings], 'metal', ('metal', 'metal'))
        return h.object('veil_cut_mouth', mats, (0, 0, 0), sc, bevel=0)
    return make


def crescent(h, s):
    """The raised crescent rim, sharp on the outside, ending in the forward hook."""
    path, secs = [], []
    # Smooth the traced points into a continuous arc (the tip stays sharp).
    pts = catmull([(x, y, w, z0, z1) for (x, y), w, z0, z1 in CRESCENT[:-1]], 2) + [(*CRESCENT[-1][0], 0, CRESCENT[-1][2], CRESCENT[-1][3])]
    for k, (x, y, w, z0, z1) in enumerate(pts):
        path.append((s * x, y, 0))
        # u is the horizontal normal left of travel: outward on the right wing, inward on the left.
        i = -s * w
        secs.append(None if k == len(pts) - 1 else [(0, (z0 + z1) / 2 + .06), (i * .35, z1), (i, z1 - .1), (i, z0 + .12), (i * .45, z0)])
    path[-1] = (path[-1][0], path[-1][1], CRESCENT[-1][2])
    sweep(h, path, secs, ['panel', 'panel', 'shell', 'metal', 'metal'])
    # Cyan seam just under the rim's outer edge.
    seam = []
    for x, y, w, z0, z1 in pts[:-3]:
        zm = (z0 + z1) / 2 - .06
        seam.append([(s * .03, zm), (s * .03, zm - .08), (-s * .1, zm - .08), (-s * .1, zm)])
    sweep(h, path[:-3], seam, 'glow', ('glow', 'glow'))


def horns(h, s):
    """Rear horn sheet and mid horn curling in toward the crown, and the small fin beside the bud."""
    rear = [(2.1, 3.25), (2.75, 3.98), (1.7, 3.97), (.85, 4.13), (.42, 4.08), (1.05, 3.62)]
    plan = [(s * x, y) for x, y in rear]
    plate(h, plan if s > 0 else plan[::-1], lambda x, y: 5.2 + (2.4 - abs(x)) * .19, .24, 'shell')
    path = [(2.2, 2.25, 4.8), (1.7, 2.32, 5.12), (1.2, 2.52, 5.45), (.62, 2.82, 5.74)]
    dims = [(.62, 1.05), (.46, .68), (.3, .4), None]
    secs = [None if d is None else [(0, d[1] / 2), (d[0] / 2, 0), (0, -d[1] / 2), (-d[0] / 2, 0)] for d in dims]
    sweep(h, mx(path, s), secs, ['shell', 'shell', 'panel', 'steel'])
    # Fin beside the bud: a tilted leaf on a web rising from the mandible root.
    fin = [(.9, -.74), (1.2, -.42), (1.74, .25), (1.86, 1.2), (1.56, 1.52), (1.2, 1.1), (1.05, .35)]
    plan = [(s * x, y) for x, y in fin]
    plate(h, plan if s > 0 else plan[::-1], lambda x, y: 5.62 + .18 * y - .4 * max(0, abs(x) - 1.2), .18, 'shell',
          side=['steel', 'steel', 'shell', 'shell', 'shell', 'shell', 'steel'] if s > 0 else ['steel', 'shell', 'shell', 'shell', 'shell', 'steel', 'steel'])
    web = [(1.78, .35), (1.92, .35), (1.98, 1.2), (1.84, 1.2)]
    plan = [(s * x, y) for x, y in web]
    loft(h, [[(x, y, 4.55) for x, y in plan], [(x, y, 5.42) for x, y in plan]], 'panel', ('panel', 'panel'))


def wing(s, mats, sc):
    def body(h):
        rings = [wing_ring(k, s) for k in range(len(WING))]
        loft(h, rings, WING_MATS, ('shell', 'shell'))
        # Layered carapace: a pale band along the inner ridge and a dark plate over the field.
        roof_band(h, s, [1, 2, 3, 4, 5, 6], .06, .27, .05, 'steel', inset=.04)
        roof_band(h, s, [1, 2, 3, 4, 5], .4, .8, .05, 'shell', inset=.08)
        roof_band(h, s, [2, 3, 4], .5, .7, .09, 'panel', inset=.05)
    return solid(body, 'veil_wing_' + ('left' if s < 0 else 'right'), mats, sc, bevel=.04, cutters=[mouth_cutter(s)])


def wing_parts(s, mats, sc):
    def build(h):
        crescent(h, s)
        horns(h, s)
        # Pale frame lips along the top and bottom of the hangar mouth.
        m = MOUTH
        for z0, z1, ua, ub in [(m['lid_in'] - .03, m['lid_in'] + .09, m['s0'] + .2, m['s1'] - .2), (m['floor'] - .1, m['floor'] + .02, m['s0'] + .2, m['s1'] - .2)]:
            lid = lambda u: (m['lid_out'] - m['lid_in']) * (u - ua) / (ub - ua) if z0 > 4 else 0
            ring = lambda d: [mouth_point(ua, d, z0 + lid(ua)), mouth_point(ub, d, z0 + lid(ub)), mouth_point(ub, d, z1 + lid(ub)), mouth_point(ua, d, z1 + lid(ua))]
            loft(h, [mx(ring(-.07), s), mx(ring(.03), s)], 'steel', ('steel', 'steel'))
        for z0, z1, ua, ub in [(m['lid_in'] - .1, m['lid_in'] - .04, m['s0'] + .3, m['s1'] - .3), (m['floor'] - .22, m['floor'] - .15, m['s0'] + .3, m['s1'] - .3)]:
            lid = lambda u: (m['lid_out'] - m['lid_in']) * (u - ua) / (ub - ua) if z0 > 4 else 0
            ring = lambda d: [mouth_point(ua, d, z0 + lid(ua)), mouth_point(ub, d, z0 + lid(ub)), mouth_point(ub, d, z1 + lid(ub)), mouth_point(ua, d, z1 + lid(ua))]
            loft(h, [mx(ring(-.05), s), mx(ring(.05), s)], 'glow', ('glow', 'glow'))
        # Teal light along the back of the hangar floor, under the pods.
        m = MOUTH
        strip = [mouth_point(u, d, z) for u, d, z in [(m['s0'] + .1, m['back'] - .04, m['floor']), (m['s1'] - .1, m['back'] - .04, m['floor']),
                                                        (m['s1'] - .1, m['back'] - .04, m['floor'] + .12), (m['s0'] + .1, m['back'] - .04, m['floor'] + .12)]]
        back = [mouth_point(u, d + .06, z) for u, d, z in [(m['s0'] + .1, m['back'] - .04, m['floor']), (m['s1'] - .1, m['back'] - .04, m['floor']),
                                                            (m['s1'] - .1, m['back'] - .04, m['floor'] + .12), (m['s0'] + .1, m['back'] - .04, m['floor'] + .12)]]
        loft(h, [mx(strip, s), mx(back, s)], 'glow', ('glow', 'glow'))
        # A faint glowing back wall silhouettes the pods (the concept's lit bays).
        wall = [mouth_point(u, m['back'] - .03, z) for u, z in [(m['s0'] + .15, m['floor'] + .08), (m['s1'] - .15, m['floor'] + .08),
                                                                 (m['s1'] - .15, m['lid_out'] - .12), (m['s0'] + .15, m['lid_in'] - .12)]]
        wall_back = [(x, y + .04, z) for x, y, z in wall]
        loft(h, [mx(wall, s), mx(wall_back, s)], 'glow', ('glow', 'glow'))
        # The concept's three pods abreast in each bay: the weak point (the innermost, a node of
        # its own) and two stored pods beside it at the mouth, the same size and look.
        first = Vector((POD_X, ray_y(POD_Z, POD_S))) - Vector(FRONT_A)
        u0, d0 = first.dot(MOUTH_AXIS), first.dot(MOUTH_BACK)
        for k in (1, 2):
            u = u0 + k * (2.6 - u0) / 2
            c = mouth_point(u, d0, POD_Z)
            hangar_pod(h, (s * c[0], c[1], c[2]))
    return solid(build, 'veil_wing_parts_' + ('left' if s < 0 else 'right'), mats, sc, bevel=.03)


# ----------------------------------------------------------------------------- centre
MANDIBLE = [  # inner edge (x, y), outer edge (x, y), (inner top, inner bottom, mid top, mid bottom, outer top, outer bottom)
    ((2.18, 1.18), (2.5, 1.08), (4.95, 4.55, 5.0, 4.45, 4.82, 4.52)),
    ((1.88, .1), (2.47, 0.0), (5.28, 4.95, 5.32, 4.42, 5.05, 4.36)),
    ((1.2, -.9), (2.2, -.85), (5.26, 5.04, 5.36, 4.3, 4.86, 4.28)),
    ((.72, -1.62), (1.76, -1.6), (4.72, 4.6, 5.03, 4.16, 4.84, 4.34)),
    ((.38, -2.18), (.8, -2.2), (4.3, 4.2, 4.38, 3.86, 4.3, 3.92)),
]
MANDIBLE_TIP = (.33, -2.46, 4.02)


def mandible(h, s):
    """A scythe blade: thin raised inner edge, thick back; stations smoothed into a curve."""
    rings = []
    for inner, outer, (it, ib, mt, mb, ot, ob) in MANDIBLE:
        mid = lerp(inner, outer, .45)
        rings.append(mx([(inner[0], inner[1], it), (mid[0], mid[1], mt), (outer[0], outer[1], ot),
                         (outer[0], outer[1], ob), (mid[0], mid[1], mb), (inner[0], inner[1], ib)], s))
    rings = catmull(rings, 2)
    rings.append([(s * MANDIBLE_TIP[0], MANDIBLE_TIP[1], MANDIBLE_TIP[2])])
    loft(h, rings, ['shell', 'shell', 'steel', 'metal', 'metal', 'steel'], ('panel', ''))


THORAX = [  # side profile (y, z) at the keel (x = 0) and at the flanks (x = +-.85)
    [(-.78, 2.1), (-.8, 3.45), (-.95, 3.75), (-.8, 4.1), (-.45, 4.18), (.7, 4.18), (1.15, 4.0), (1.35, 3.5), (1.25, 3.1), (.9, 2.6), (.3, 2.35), (-.4, 2.2)],
    [(-.7, 3.1), (-.75, 3.45), (-.88, 3.75), (-.75, 4.05), (-.4, 4.12), (.65, 4.12), (1.05, 3.95), (1.25, 3.5), (1.15, 3.15), (.9, 3.0), (.3, 3.0), (-.4, 3.05)],
]
BUD = dict(c=(0.0, .08, 4.24), r=.74)        # petal hinge ring (centre, radius)
HEART = (0.0, ray_y(4.78, HEART_S), 4.78)    # on the ray through the core target


def thorax(h):
    rings = [[(x, y, z) for y, z in THORAX[1 if x else 0]] for x in (-.85, 0, .85)]
    loft(h, rings, 'panel', ('panel', 'panel'))
    # Keel slit and the cross axle that carries the wings.
    loft(h, [[(-.05, -.82, 2.35), (.05, -.82, 2.35), (.05, -.82, 3.3), (-.05, -.82, 3.3)],
             [(-.05, -.7, 2.35), (.05, -.7, 2.35), (.05, -.7, 3.3), (-.05, -.7, 3.3)]], 'glow', ('glow', 'glow'))
    h.cylinder((0, 0, 3.66), 'x', .3, -2.6, 2.6, 'metal', seg=8, phase=math.pi / 8)
    for s in (-1, 1):  # dark ribbed framework with small lights between the wings and the heart
        for x in (1.0, 1.6, 2.2):
            h.cylinder((0, 0, 3.66), 'x', .37, s * (x - .07), s * (x + .07), 'metal', seg=8, phase=math.pi / 8)
            h.box((min(s * (x - .04), s * (x + .04)), -.4, 3.62), (max(s * (x - .04), s * (x + .04)), -.36, 3.7), 'glow')
    # Collar: dark half-rings with cyan seams in front of the bud, the well rim and its lights.
    cx, cy = BUD['c'][0], BUD['c'][1]
    for r0, r1, z0, z1, mat in [(.84, 1.02, 3.78, 4.06, 'metal'), (.8, .86, 4.0, 4.1, 'glow'), (.72, .88, 4.04, 4.24, 'metal'), (1.0, 1.04, 3.86, 3.96, 'glow')]:
        arc = [math.pi * (1 + k / 8) for k in range(9)]
        outer = [(cx + r1 * math.cos(a), cy + r1 * math.sin(a) * .95) for a in arc]
        inner = [(cx + r0 * math.cos(a), cy + r0 * math.sin(a) * .95) for a in arc][::-1]
        plan = outer + inner
        loft(h, [[(x, y, z0) for x, y in plan], [(x, y, z1) for x, y in plan]], mat, (mat, mat))
    h.cylinder((cx, cy, 0), 'z', BUD['r'] + .02, 4.1, 4.22, 'metal', seg=16, phase=math.pi / 16)
    for k in range(8):  # collar lights around the heart's waist
        a = math.pi / 8 + k * math.pi / 4
        p = (cx + math.cos(a) * (BUD['r'] + .03), cy + math.sin(a) * (BUD['r'] + .03))
        h.box((p[0] - .05, p[1] - .05, 4.13), (p[0] + .05, p[1] + .05, 4.2), 'glow')


def legs(h):
    """Pylons from the axle to the pod brackets, and the arms that carry the bow pods."""
    for s in (-1, 1):
        x = s * 1.32
        h.box((x - .14, -.14, 2.95), (x + .14, .14, 3.5), 'metal', chamfer=.05)
        h.box((x - .26, -.42, 2.8), (x + .26, .16, 3.12), 'panel', chamfer=.08)
        h.box((x - .27, -.3, 2.9), (x + .27, -.24, 3.02), 'glow')
        h.cylinder((x, -.14, 0), 'z', .07, 2.6, 2.82, 'metal', seg=6)
        # Arm forward to the hood hinge above the bow pod.
        arm = [(-.3, 2.86), (-1.9, 2.95), (-2.06, 3.06), (-1.9, 3.17), (-.3, 3.08)]
        h.prism(arm, 'x', s * 1.28, s * 1.44, 'metal')


def crown(h):
    """The crown egg hovering over the bud: beaked front, rear fin, a teal eye slit."""
    rings = []
    for y, rx, rz, zc in [(-.16, .0, .0, 6.92), (.05, .16, .12, 6.95), (.4, .4, .36, 6.92), (.8, .57, .6, 6.9),
                          (1.25, .56, .62, 6.92), (1.6, .38, .44, 6.92), (1.78, .0, .0, 6.92)]:
        if rx == 0:
            rings.append([(0, y, zc)])
            continue
        rings.append([(rx * math.cos(a), y, zc + rz * math.sin(a)) for a in [2 * math.pi * k / 10 + math.pi / 2 for k in range(10)]])
    loft(h, rings, 'shell')
    h.prism([(1.45, 6.4), (2.24, 6.33), (2.24, 7.35), (1.55, 7.45), (1.3, 7.3)], 'x', -.07, .07, 'steel')
    loft(h, [[(-.3, .28, 6.82), (.3, .28, 6.82), (.3, .28, 6.9), (-.3, .28, 6.9)],
             [(-.34, .42, 6.8), (.34, .42, 6.8), (.34, .42, 6.94), (-.34, .42, 6.94)]], 'glow', ('glow', 'glow'))
    # Beak ridge.
    h.prism([(-.12, 7.0), (.5, 7.32), (.9, 7.5), (.9, 7.56), (.4, 7.42), (-.2, 7.06)], 'x', -.05, .05, 'steel')


def centre_parts(mats, sc):
    def build(h):
        thorax(h)
        crown(h)
        for s in (-1, 1):
            mandible(h, s)
    return solid(build, 'veil_centre', mats, sc, bevel=.03)


# ----------------------------------------------------------------------------- pods
DROP_PROFILE = [(0, .0), (.1, .32), (.28, .76), (.5, 1.0), (.72, .96), (.88, .72), (.97, .38), (1.0, .0)]   # egg, pointed bottom
ROUND_PROFILE = [(0, .0), (.04, .55), (.16, .92), (.42, 1.0), (.7, .86), (.9, .5), (1.0, .0)]


def radius_at(prof, f):
    for (f0, k0), (f1, k1) in zip(prof, prof[1:]):
        if f <= f1:
            return k0 + (k1 - k0) * (f - f0) / (f1 - f0)
    return prof[-1][1]


def rib(h, base, r, height, prof, a, f0, f1, w, out, mat):
    """A strip following a pod's profile at azimuth a (dark petal seams, glowing slits)."""
    n, t = Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0))
    rings = []
    for f in [f0 + (f1 - f0) * i / 4 for i in range(5)]:
        p = Vector(base) + n * radius_at(prof, f) * r * .93 + Vector((0, 0, f * height))
        rings.append([tuple(p + t * w - n * .02), tuple(p + n * out), tuple(p - t * w - n * .02), tuple(p - n * .06)])
    loft(h, rings, mat, (mat, mat))


def pod(h, base, r, height, prof=DROP_PROFILE, slit=True, ribs=True, engine=False, seg=8, shell='shell', seams='metal'):
    """An egg pod: violet shell in four petal segments (dark seams), a cyan slit on its face,
    optionally an engine glow under its pointed bottom. base is the bottom point."""
    egg(h, base, [(f * height, k * r) for f, k in prof], seg, shell)
    if ribs:
        for k in range(4):
            rib(h, base, r, height, prof, math.pi / 4 + k * math.pi / 2, .14, .93, .025, .03, seams)
    if slit:
        rib(h, base, r, height, prof, -math.pi / 2, .3, .78, .035, .035, 'glow')
    if engine:
        egg(h, (base[0], base[1], base[2] - .16 * r / .38), [(0, .0), (.1 * r / .38, .11 * r / .38), (.2 * r / .38, .0)], 6, 'glow', phase=0)


def drop_pod(h, centre, scale=1.0):
    """A docked or launched pod (concept: purple egg, petal segments, cyan slit, pointed bottom, engine glow)."""
    r, height = .38 * scale, 1.7 * scale
    pod(h, (centre[0], centre[1], centre[2] - height * .5), r, height, engine=True)


POD_R, POD_H, POD_Z = .42, .95, 3.8   # hangar pod size and centre height (the weak point's)


def hangar_pod(h, c, r=POD_R, height=POD_H):
    """A hangar pod as the concept sheet shows them, three abreast per wing: a round violet egg
    with teal gill slits on its face and a glowing crystal crown."""
    base = (c[0], c[1], c[2] - height * .52)
    # Paler shell outlined by glowing petal seams, so each egg reads against the dark bay from above.
    pod(h, base, r, height, ROUND_PROFILE, slit=False, shell='steel', seams='glow')
    for a in (-.45, 0, .45):
        d = Vector((math.sin(a), -math.cos(a), 0))
        p = Vector(c) + d * r * .99
        t = Vector((d.y, -d.x, 0)) * .035
        loft(h, [[tuple(p + t + Vector((0, 0, -.28))), tuple(p - t + Vector((0, 0, -.28))), tuple(p - t + Vector((0, 0, .2))), tuple(p + t + Vector((0, 0, .2)))],
                 [tuple(p + t + d * .05 + Vector((0, 0, -.26))), tuple(p - t + d * .05 + Vector((0, 0, -.26))), tuple(p - t + d * .05 + Vector((0, 0, .18))), tuple(p + t + d * .05 + Vector((0, 0, .18)))]],
             'glow', ('glow', 'glow'))
    egg(h, (c[0], c[1], base[2] + height * .9), [(0, .17), (.08, .14), (.2, .0)], 6, 'glow')
    h.cylinder((c[0], c[1], 0), 'z', .24, base[2] + height * .86, base[2] + height * .93, 'metal', seg=8)


def flank_pod(s, mats, sc, wreck=False):
    """The weak point: the innermost of the three hangar pods, pulled to the mouth on its target's camera ray."""
    nm = 'veil_pod_' + ('left' if s < 0 else 'right') + ('_wreck' if wreck else '')
    cz = POD_Z
    c = (s * POD_X, ray_y(cz, POD_S), cz)
    r, height = POD_R, POD_H
    base = (c[0], c[1], c[2] - height * .52)

    def build(h):
        if not wreck:
            hangar_pod(h, c)
        else:
            # A split husk: four shell shards splayed open around a burnt stub.
            h.cylinder((c[0], c[1], 0), 'z', .2, base[2], base[2] + .45, 'metal', seg=6, r2=.12)
            for k in range(4):
                a0, a1 = k * math.pi / 2 + .12, (k + 1) * math.pi / 2 - .12
                tilt = Vector((math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0))
                ring = lambda rad, z, out: [tuple(Vector((c[0], c[1], z)) + Vector((math.cos(a), math.sin(a), 0)) * rad + tilt * out)
                                            for a in (a0, (a0 + a1) / 2, a1)]
                outer = [ring(r * .55, base[2] + .02, .02), ring(r, base[2] + .3, .1), ring(r * .9, base[2] + .55, .24)]
                inner = [[tuple(Vector(p) - tilt * .06) for p in rr] for rr in outer]
                rings = [o + i[::-1] for o, i in zip(outer, inner)]
                loft(h, rings, 'shell', ('shell', 'shell'))
    return solid(build, nm, mats, sc, pivot=c, bevel=.015)


def docked_pods(mats, sc):
    """Pods docked under the bow, on the launch bays' camera rays: 0/1 left, 2/3 right
    (0 and 2 at the front, under the hinged hoods; 1 and 3 on the leg brackets)."""
    out = []
    for i, (s, front) in enumerate([(-1, True), (-1, False), (1, True), (1, False)]):
        c = (s * 1.4, -2.36, 1.95) if front else (s * 1.32, -.14, 2.05)

        def build(h, c=c, front=front):
            drop_pod(h, c, 1.0 if front else .8)
        out.append(solid(build, 'veil_drop_pod_%d' % i, mats, sc, pivot=c, bevel=0))
    return out


def bay_doors(mats, sc):
    """Hoods over the bow pods, hinged on the arm tips; they swing forward and up to release."""
    out = []
    for s in (-1, 1):
        hinge = (s * 1.4, -1.95, 3.1)

        def build(h, s=s, hinge=hinge):
            rings = []
            for k, a in enumerate([0, .33, .66, .99, 1.3]):
                # A curved hood: arcs over the pod's rounded top, from the hinge forward and down.
                y = hinge[1] - math.sin(a) * .8
                z = hinge[2] - (1 - math.cos(a)) * .8 - .02
                w = .2 + .16 * math.sin(a)
                n = Vector((0, -math.sin(a), math.cos(a)))   # outward normal of the arc
                outer = [Vector((hinge[0] + w * q, y, z)) + n * (.06 * (1 - q * q) - .04 * q * q) for q in (-1, -.5, 0, .5, 1)]
                inner = [Vector((hinge[0] + w * .85 * q, y, z)) - n * .05 for q in (1, 0, -1)]
                rings.append([tuple(v) for v in outer + inner])
            loft(h, rings, ['shell', 'shell', 'shell', 'shell', 'panel', 'panel', 'panel', 'panel'], ('panel', 'panel'))
            h.cylinder(hinge, 'x', .06, hinge[0] - .3, hinge[0] + .3, 'metal', seg=6)
        out.append(solid(build, 'veil_bay_door_' + ('left' if s < 0 else 'right'), mats, sc, pivot=hinge, bevel=.015))
    return out


def flight_pod(mats, sc):
    """The launched pod, centred on its own origin (instanced by the view at flight height)."""
    def build(h):
        drop_pod(h, (0, 0, 0), .6)
    return solid(build, 'veil_flight_pod', mats, sc, bevel=0)


# ----------------------------------------------------------------------------- heart and petals
def heart(mats, sc, wreck=False):
    name = 'veil_heart' + ('_wreck' if wreck else '')
    c = HEART

    def build(h):
        h.cylinder((c[0], c[1], 0), 'z', .5, 4.18, 4.32, 'metal', seg=8, phase=math.pi / 8, r2=.44)
        if not wreck:
            egg(h, (c[0], c[1], c[2] - .5), [(0, .0), (.5, .44), (1.0, .0)], 8, 'glow', phase=0)
            for k in range(4):  # satellite crystals
                a = math.pi / 4 + k * math.pi / 2
                p = (c[0] + math.cos(a) * .42, c[1] + math.sin(a) * .42, 4.32)
                egg(h, p, [(0, .0), (.1, .1), (.42, .0)], 5, 'glow', phase=0)
        else:
            for k, (a, r, ht) in enumerate([(.3, .2, .42), (1.9, .25, .34), (3.3, .22, .5), (4.6, .16, .3), (5.7, .26, .38)]):
                p = (c[0] + math.cos(a) * r, c[1] + math.sin(a) * r, 4.3)
                egg(h, p, [(0, .0), (.04, .12), (ht, .0)], 5, 'metal', phase=a)
    return solid(build, name, mats, sc, pivot=c, bevel=.012)


def bud_point(f, a):
    """Closed bud surface: f 0 (hinge ring) .. 1 (apex), azimuth a (Blender: 0 = +x, ccw)."""
    prof = [(0, 1.0), (.22, 1.12), (.45, 1.08), (.68, .82), (.86, .48), (1.0, .0)]
    for (f0, k0), (f1, k1) in zip(prof, prof[1:]):
        if f <= f1:
            k = k0 + (k1 - k0) * (f - f0) / (f1 - f0)
            break
    r = BUD['r'] * k
    lean = .58 * f ** 1.6           # the bud leans back toward its tall rear (source dome apex y ~.75)
    sy = .86                         # slightly narrower front to back
    cx, cy, cz = BUD['c']
    return Vector((cx + r * math.cos(a), cy + lean + r * math.sin(a) * sy, cz + 1.84 * f))


def petal(k, mats, sc):
    """One quarter of the bud, hinged on the ring at azimuth phi_k (glTF yaw), flipping outward."""
    phi = SHUTTER_PHI[k]
    centre_a = math.atan2(-math.cos(phi), math.sin(phi))   # Blender azimuth of the glTF yaw direction
    hinge = Vector(BUD['c']) + Vector((math.cos(centre_a), math.sin(centre_a), 0)) * (BUD['r'] + .04)

    def build(h):
        gap = math.radians(2.5)
        az = [centre_a - math.pi / 4 + gap + (math.pi / 2 - 2 * gap) * j / 4 for j in range(5)]
        fs = [0, .22, .45, .68, .86, .97]
        outer = [[bud_point(f, a) for a in az] for f in fs]
        inner = [[p - (p - Vector((BUD['c'][0], BUD['c'][1] + .58 * f ** 1.6, p.z))).normalized() * .07 for p in row]
                 for f, row in zip(fs, outer)]
        rings = [[tuple(p) for p in o] + [tuple(p) for p in i[::-1]] for o, i in zip(outer, inner)]
        loft(h, rings, ['shell', 'shell', 'shell', 'shell', 'panel', 'panel', 'panel', 'panel', 'panel', 'panel'], ('metal', 'shell'))
        # A dark rib and a teal vein down the middle of the petal.
        mid = [bud_point(f, centre_a) for f in (.05, .3, .55, .8, .93)]
        out = Vector((math.cos(centre_a), math.sin(centre_a), 0))
        tang = Vector((-out.y, out.x, 0))
        ribs = [[tuple(p + tang * w + out * .0), tuple(p + out * .06 + Vector((0, 0, .0))), tuple(p - tang * w)]
                for p, w in zip(mid, (.07, .06, .05, .035, .02))]
        loft(h, [r + [tuple(Vector(r[1]) - out * .1)] for r in ribs], 'metal', ('metal', 'metal'))
        # The bright vertical seam down the front of the bud (concept): the front petals' meeting edges glow.
        for edge, side in ((centre_a - math.pi / 4 + gap, 1), (centre_a + math.pi / 4 - gap, -1)):
            if math.sin(edge) > -.97:
                continue
            seam = []
            for f in (.02, .22, .45, .68, .86, .95):
                p = bud_point(f, edge)
                n = Vector((math.cos(edge), math.sin(edge), 0))
                t = Vector((-math.sin(edge), math.cos(edge), 0)) * -side   # toward the seam
                seam.append([tuple(p + n * .015), tuple(p + n * .015 + t * .045), tuple(p - n * .06 + t * .045), tuple(p - n * .06)])
            loft(h, seam, 'glow', ('glow', 'glow'))
    ob = solid(build, 'veil_heart_shutter_%d' % k, mats, sc, pivot=tuple(hinge), bevel=.012)
    # Local hinge x is tangential: the node yaws by phi (glTF +Y = Blender +Z).
    ob.data.transform(Matrix.Rotation(-phi, 4, 'Z'))
    ob.rotation_euler = (0, 0, phi)
    return ob


# ----------------------------------------------------------------------------- assembly
def compare(objects):
    br.compare('veil', objects, os.path.join(br.LOOKDEV, 'veil-v5-compare.png'), (0, .9, 3.6), 14)


def open_pose(objects, amount=1.0):
    """Petals and bay doors as the game opens them (for previews and ray checks)."""
    for o in objects:
        if o.name.startswith('veil_heart_shutter_'):
            phi = SHUTTER_PHI[int(o.name[-1])]
            o.rotation_euler = (math.radians(105) * amount, 0, phi)
        elif o.name.startswith('veil_bay_door_'):
            o.rotation_euler = (-.9 * amount, 0, 0)


def build(export=True, preview=True):
    import bpy
    sc = br.scene('Last Worlds — Remodel VEIL')
    mats = materials()
    parts = [centre_parts(mats, sc)]
    for s in (-1, 1):
        parts.append(wing(s, mats, sc))
        parts.append(wing_parts(s, mats, sc))
    objects = [join(parts, 'veil_hull', (0, 0, 0))]
    for s in (-1, 1):
        objects.append(flank_pod(s, mats, sc))
        objects.append(flank_pod(s, mats, sc, wreck=True))
    objects.append(heart(mats, sc))
    objects.append(heart(mats, sc, wreck=True))
    objects += [petal(k, mats, sc) for k in range(4)]
    objects.append(flight_pod(mats, sc))   # v6: no docked pods, hoods or arms (they were pod sketches)
    bpy.context.view_layer.update()
    br.texture_bake(objects, 'veil', 'nacre')
    live = [o for o in objects if not o.name.endswith('_wreck') and o.name != 'veil_flight_pod']
    br.bake_ao(objects, live, reach=2.2)
    for name, g in EMPTIES.items():
        objects.append(br.marker(name, (g[0], -g[2], g[1]), sc))
    objects.append(br.marker('veil_remodel_v6', sc=sc, source_file=br.SOURCES['veil'],
                             note='Clean remodel traced over the supplied GLB; no source geometry exported; no pod sketches'))
    result = None
    if export:
        path = os.path.join(br.ROOT, 'public', 'assets', 'nacre', 'the-veil-%s.glb' % LABEL)
        result = br.export(path, objects, 'Last Worlds — THE VEIL remodel traced over the user-supplied GLB')
    for o in objects:
        if o.name.endswith('_wreck') or o.name == 'veil_flight_pod':
            o.hide_render = True
    if preview:
        os.makedirs(br.LOOKDEV, exist_ok=True)
        shown = [o for o in objects if o.type == 'MESH' and not o.hide_render]
        br.game_view(sc, (0, .3, 3.6), 14, os.path.join(br.LOOKDEV, 'veil-%s-game.png' % LABEL), objects=shown, light='nacre')
        open_pose(objects)
        br.game_view(sc, (0, .3, 3.6), 14, os.path.join(br.LOOKDEV, 'veil-%s-game-open.png' % LABEL), objects=shown, light='nacre')
        open_pose(objects, 0)
    return objects, result
