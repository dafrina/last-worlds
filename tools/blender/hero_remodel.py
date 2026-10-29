"""Clean hero ship remodels over the user's Tripo models (docs/31-hero-ships.md; user, 29 October 2026: "remodel them all
ourself, just using the model as a style and size reference to get it really clean ... with one model only first as a
concept").

The Tripo meshes fuse every part into one lumpy shell, so cut parts only meet where they were cut: mixed with another
design's parts they float, gap and clash. A remodel is built from clean hard-surface pieces measured off the levelled,
scaled Tripo model (hero_tripo.py: art/source/hero, cut, levelled to one plane, scaled to the chassis), and every design
of a chassis is built to the chassis's standard joints (JOINTS), so any hull, wings, propulsion and cockpit of that
chassis meet the same way without moving. The Tripo model's paint, wear and fine surface detail are then baked onto the
clean parts (base colour, roughness-metal, normal), so the remodel keeps the realistic finish.

Conventions as hero_kit.py and hero_tripo.py: Blender x right, y forward (the nose; glTF -z), z up, the ship's mid-plane
at z = 0; 1 unit = 1 game unit before HERO_SCALE. Node names hero_<chassis>_<slot>_<design>, engine sockets
hero_<chassis>_engines_<design>_engine_<i>. Output: public/assets/shared/hero/<chassis>-<design>.glb, one per design,
its four parts sharing one material and one texture set.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
        --python "$(wslpath -w tools/blender/hero_remodel.py)" -- --design scrapper-1 [--preview-dir DIR]
"""

import argparse
import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import hero_tripo as tripo  # noqa: E402

ROOT = tripo.ROOT
TEXTURES = os.path.join(ROOT, 'lookdev', 'hero-remodel', 'textures')
OUT = os.path.join(ROOT, 'public', 'assets', 'shared', 'hero')
BAKE_SIZE = 2048
# Runtime texture sizes: the ship is about 130 px wide in flight and 192 px on the hangar turntable, so 1024 px keeps
# every panel line while one design costs about 11 MB of GPU memory instead of 64.
TEXTURE_SIZE = dict(base=1024, normal=1024, rm=512)
# Bake reach (cage extrusion, ray distance) where a remodel sits further from its Tripo surface than usual.
REACH = {'ironclad-4': (.2, .6), 'spectre-2': (.2, .6)}

# The standard joints of each chassis: every design is built to them, so a part of one design attaches to the hull of
# another without moving (user, 29 October: parts may intersect when mixed, but nothing may float, and mixes should
# still look good).
#   wing_mount: a mounting plate on each hull side, its outer face at |x| = x from y0 to y1 and z0 to z1. Every wing's
#     root reaches in to x - .02 over that span; a narrow hull carries the plate out on a stub.
#   bulkhead: every hull reaches back to y within |x| <= w; every propulsion reaches forward to it (a yoke block or
#     struts, hidden inside a longer hull).
#   seat: the deck height z where cockpits stand; every cockpit's skirt reaches down to z = 0 so it never hovers over a
#     lower deck.
JOINTS = dict(
    scrapper=dict(wing_mount=dict(x=.245, y0=-.09, y1=.07, z0=-.07, z1=.05),
                  bulkhead=dict(y=-.25, w=.1, z0=-.11, z1=.05),
                  seat=dict(z=.11)),
    # The Ironclads' wing roots sit anywhere from the shoulders to the tail, so their plate is long; on the broad hulls it
    # lies inside the armour, on the narrow ones it reads as a pylon.
    ironclad=dict(wing_mount=dict(x=.28, y0=-.3, y1=.1, z0=-.07, z1=.07),
                  bulkhead=dict(y=-.45, w=.1, z0=-.12, z1=.08),
                  seat=dict(z=.2)),
    # Slim spear hulls; the two boom axes (|x| near .2) belong to propulsion and sit over the wing roots.
    interceptor=dict(wing_mount=dict(x=.14, y0=-.2, y1=.1, z0=-.05, z1=.04),
                     bulkhead=dict(y=-.5, w=.07, z0=-.08, z1=.06),
                     seat=dict(z=.1)),
    # Flying wings round a slim core: the wings join at a side rail; all drives sit in the rear cassette.
    spectre=dict(wing_mount=dict(x=.18, y0=-.25, y1=-.05, z0=-.05, z1=.05),
                 bulkhead=dict(y=-.5, w=.1, z0=-.1, z1=.08),
                 seat=dict(z=.12)),
)


class Mesh:
    """One part under construction: bmesh pieces with a material slot each (0 skin, 1 glow)."""

    def __init__(self):
        self.bm = bmesh.new()

    def _add(self, other, mat=0):
        for f in other.faces:
            f.material_index = mat
        me = bpy.data.meshes.new('tmp')
        other.to_mesh(me)
        other.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    def loft(self, sections, mat=0, caps=True, mirror_x=False):
        """Rings of (x, z) points at stations y, joined in order; each ring the same count, wound the same way."""
        bm = bmesh.new()
        rings = []
        for y, pts in sections:
            rings.append([bm.verts.new((x, y, z)) for x, z in pts])
        n = len(rings[0])
        for a, b in zip(rings, rings[1:]):
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((a[i], a[j], b[j], b[i]))
        if caps:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self._add(bm, mat)

    def box(self, x0, x1, y0, y1, z0, z1, bevel=.008, mat=0, mirror=False):
        for s in ((1, -1) if mirror else (1,)):
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1)
            xa, xb = sorted((x0 * s, x1 * s))
            for v in bm.verts:
                v.co = Vector(((xa + xb) / 2 + v.co.x * (xb - xa), (y0 + y1) / 2 + v.co.y * (y1 - y0),
                               (z0 + z1) / 2 + v.co.z * (z1 - z0)))
            if bevel:
                bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=1, affect='EDGES', profile=.5)
            self._add(bm, mat)

    def prism(self, outline, z0, z1, chamfer=.012, mat=0, mirror=False):
        """A plate from its top outline (x, y; counter-clockwise), z0 to z1, the top edge chamfered."""
        for s in ((1, -1) if mirror else (1,)):
            pts = [(x * s, y) for x, y in outline]
            if s < 0:
                pts.reverse()
            bm = bmesh.new()
            lo = [bm.verts.new((x, y, z0)) for x, y in pts]
            mid = [bm.verts.new((x, y, z1 - chamfer)) for x, y in pts]
            cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
            hi = []
            for x, y in pts:
                d = math.hypot(x - cx, y - cy) or 1
                hi.append(bm.verts.new((x - (x - cx) / d * chamfer, y - (y - cy) / d * chamfer, z1)))
            n = len(pts)
            bm.faces.new(list(reversed(lo)))
            bm.faces.new(hi)
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((lo[i], lo[j], mid[j], mid[i]))
                bm.faces.new((mid[i], mid[j], hi[j], hi[i]))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            self._add(bm, mat)

    def lathe(self, cx, cz, profile, segments=24, mat=0, mirror=False, caps=True):
        """A body of revolution along y: profile [(radius, y)], front to back, round the axis at (cx, cz)."""
        for s in ((1, -1) if mirror else (1,)):
            bm = bmesh.new()
            rings = []
            for r, y in profile:
                rings.append([bm.verts.new((cx * s + r * math.cos(a), y, cz + r * math.sin(a)))
                              for a in (2 * math.pi * k / segments for k in range(segments))])
            for a, b in zip(rings, rings[1:]):
                for i in range(segments):
                    j = (i + 1) % segments
                    bm.faces.new((a[i], a[j], b[j], b[i]))
            if caps:
                bm.faces.new(rings[0])
                bm.faces.new(list(reversed(rings[-1])))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            self._add(bm, mat)

    def stack(self, cx, cy, profile, segments=8, mat=0, turn=None):
        """A body of revolution round a vertical axis at (cx, cy): profile [(radius, z)] bottom to top; 8 segments make an
        octagon (flat face forward)."""
        bm = bmesh.new()
        turn = math.pi / segments if turn is None else turn
        rings = [[bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z))
                  for a in (turn + 2 * math.pi * k / segments for k in range(segments))] for r, z in profile]
        for a, b in zip(rings, rings[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                bm.faces.new((a[i], a[j], b[j], b[i]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self._add(bm, mat)

    def rod(self, p0, p1, r, segments=8, mat=0, mirror=False):
        for s in ((1, -1) if mirror else (1,)):
            a, b = Vector((p0[0] * s, p0[1], p0[2])), Vector((p1[0] * s, p1[1], p1[2]))
            bm = bmesh.new()
            axis = (b - a)
            bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=axis.length)
            rot = axis.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
            bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=bm.verts[:])
            self._add(bm, mat)

    def disc(self, cx, y, cz, r, segments=24, mat=1, mirror=False, facing=-1):
        """A flat disc facing along ±y (the glow at the back of a nozzle)."""
        for s in ((1, -1) if mirror else (1,)):
            bm = bmesh.new()
            ring = [bm.verts.new((cx * s + r * math.cos(a), y, cz + r * math.sin(a)))
                    for a in (2 * math.pi * k / segments for k in range(segments))]
            f = bm.faces.new(ring)
            f.normal_update()
            if f.normal.y * facing < 0:
                f.normal_flip()
            self._add(bm, mat)

    def tilt(self, x0, degrees):
        """Rotate everything about the line x = x0, z = 0 (along y): positive raises the outer end (dihedral)."""
        bmesh.ops.rotate(self.bm, verts=self.bm.verts[:], cent=(x0, 0, 0),
                         matrix=Matrix.Rotation(math.radians(-degrees), 3, 'Y'))
        return self

    def pitch(self, cy, cz, degrees):
        """Rotate everything about the line y = cy, z = cz (along x): positive tips the front up."""
        bmesh.ops.rotate(self.bm, verts=self.bm.verts[:], cent=(0, cy, cz), matrix=Matrix.Rotation(math.radians(degrees), 3, 'X'))
        return self

    def move(self, dx, dy, dz):
        bmesh.ops.translate(self.bm, verts=self.bm.verts[:], vec=(dx, dy, dz))
        return self

    def merge(self, other):
        me = bpy.data.meshes.new('tmp')
        other.bm.to_mesh(me)
        other.bm.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return self

    def mirror(self):
        """Add a copy mirrored to the other side (x to -x)."""
        copy = self.bm.copy()
        bmesh.ops.scale(copy, vec=(-1, 1, 1), verts=copy.verts[:])
        bmesh.ops.reverse_faces(copy, faces=copy.faces[:])
        me = bpy.data.meshes.new('tmp')
        copy.to_mesh(me)
        copy.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return self

    def object(self, name):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts[:], dist=1e-5)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o


def shifted(points, dx):
    return [(x + dx, z) for x, z in points]


def section(ws, wb, wt, zb, zl, zu, zt):
    """A symmetric chamfered-box section, counter-clockwise from the bottom right: bottom, sides, top."""
    return [(wb, zb), (ws, zl), (ws, zu), (wt, zt), (-wt, zt), (-ws, zu), (-ws, zl), (-wb, zb)]


# ---------------------------------------------------------------------------------------------------------------------
# Scrapper 1, Tug: a hexagonal cargo-box hull with a narrow nose module, a tall flat-fronted work cabin, straight slab
# wings with open trailing braces and twin guns, two long barrel pods with clamp rings on a rear yoke.
# Measured off the levelled reference (lookdev/hero-tripo/scrapper-1-ref.blend): ship 1.6 x 1.6, mid-plane z = 0.

def scrapper_1():
    J = JOINTS['scrapper']
    m, s = J['wing_mount'], J['seat']
    b = J['bulkhead']
    parts = {}

    hull = Mesh()
    nose = section(.12, .1, .1, -.14, -.1, .06, s['z'])
    body = section(.2, .18, .16, -.19, -.15, .07, s['z'])
    rear = section(b['w'], .09, .085, b['z0'], -.08, b['z1'] - .01, b['z1'])
    hull.loft([(b['y'], rear), (-.205, section(.14, .12, .11, -.15, -.12, .06, .1)),
               (-.1, body), (.24, body), (.31, section(.14, .12, .11, -.15, -.11, .06, s['z'])),
               (.34, nose), (.6, nose), (.64, section(.1, .07, .07, -.1, -.07, .04, .08)),
               (.665, section(.07, .05, .04, -.07, -.05, .03, .05))])
    # Wing mounting plates out to the standard joint, and the rail of pipes along each side.
    hull.box(.185, m['x'], m['y0'], .27, m['z0'], m['z1'], mirror=True)
    hull.rod((.212, -.11, -.03), (.212, .27, -.03), .016, mirror=True)
    hull.rod((.212, -.11, .025), (.212, .23, .025), .011, mirror=True)
    # Forward gun pair on each shoulder, and the two sensor masts on the nose.
    hull.box(.13, .2, .25, .37, -.075, .015, mirror=True)
    for x in (.148, .183):
        hull.rod((x, .3, -.03), (x, .55, -.03), .012, mirror=True)
        hull.rod((x, .53, -.03), (x, .56, -.03), .017, mirror=True)
    hull.box(.05, .1, .6, .665, .04, .1, mirror=True)
    hull.rod((.075, .62, .08), (.075, .8, .08), .009, segments=6, mirror=True)
    hull.rod((.075, .7, .08), (.075, .73, .08), .015, segments=6, mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.box(-.1, .1, .2, .62, 0, s['z'] + .02, bevel=.006)   # base collar, its skirt down to the mid-plane
    cab = lambda w, zt: [(w, s['z'] + .015), (w, s['z'] + .075), (w * .72, zt), (-w * .72, zt), (-w, s['z'] + .075),
                         (-w, s['z'] + .015)]
    cockpit.loft([(.195, cab(.085, .16)), (.25, cab(.1, .23)), (.46, cab(.1, .235)), (.585, cab(.09, .15)),
                  (.615, cab(.07, .125))])
    cockpit.box(-.012, .012, .25, .46, .225, .245, bevel=.004)   # roof spine
    parts['cockpit'] = cockpit

    # The right wing, mirrored. Root block and hinge drum level on the mounting plate; the slab and everything on it
    # rise from the root at the reference's 12 degrees of dihedral.
    wings = Mesh()
    wings.box(m['x'] - .02, .31, m['y0'], .26, -.05, .04)                             # root block on the mounting plate
    wings.rod((.275, -.02, .03), (.275, .27, .03), .03, segments=12)                   # hinge drum
    for y in (.0, .23):
        wings.rod((.275, y, .03), (.275, y + .03, .03), .037, segments=12)
    slab = Mesh()
    slab.prism([(.3, -.1), (.36, -.1), (.43, -.025), (.775, 0), (.8, .025), (.8, .28), (.78, .3), (.3, .3)], -.045, .05)
    slab.box(.755, .81, -.005, .305, -.055, .06, bevel=.02)                            # rounded tip cap
    slab.box(.31, .385, .03, .25, .045, .066, bevel=.005)                              # dark inboard panel
    slab.box(.43, .74, .06, .27, .045, .058, bevel=.004)                               # raised outer plate
    slab.rod((.315, .31, .035), (.56, .31, .035), .013)                                # leading-edge pipe
    slab.box(.545, .635, .06, .215, .05, .125)                                         # gun housing
    slab.box(.565, .615, .215, .275, .06, .11)
    slab.box(.625, .67, .26, .315, .05, .1)                                            # bracket
    for x, tip in ((.575, .55), (.612, .52)):
        slab.rod((x, .2, .118), (x, .3, .118), .02)
        slab.rod((x, .3, .118), (x, tip, .118), .011)
        slab.rod((x, tip - .035, .118), (x, tip, .118), .016)
    # The open trailing braces under the slab's rear edge.
    for p0, p1 in (((.33, -.095), (.72, -.035)), ((.45, -.025), (.45, -.08)), ((.55, -.01), (.55, -.065)),
                   ((.4, -.03), (.47, -.075)), ((.47, -.04), (.71, -.03)), ((.71, -.03), (.745, .005))):
        slab.rod((p0[0], p0[1], -.035), (p1[0], p1[1], -.035), .009, segments=6)
    wings.merge(slab.tilt(.3, 12)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-b['w'], b['w'], -.36, b['y'], b['z0'] + .01, b['z1'] - .01)      # yoke block on the bulkhead
    engines.rod((.09, -.3, -.04), (.21, -.3, -.04), .035, segments=12, mirror=True)
    engines.rod((.09, -.3, -.04), (.2, -.17, -.06), .012, mirror=True)               # fuel lines
    px, pz = .31, -.035
    ring = lambda y: [(.116, y - .005), (.127, y), (.127, y - .025), (.116, y - .03)]
    profile = [(.06, -.115), (.095, -.125), (.113, -.15)] + ring(-.19) + ring(-.39) + ring(-.6) + \
        [(.116, -.7), (.122, -.71), (.122, -.79), (.112, -.82), (.085, -.82), (.07, -.78)]
    engines.lathe(px, pz, profile, mirror=True)
    engines.lathe(px, pz, [(.085, -.82), (.06, -.8)], mirror=True, caps=False)   # nozzle throat
    engines.disc(px, -.795, pz, .062, mirror=True)
    for dx in (-.133, .133):
        engines.rod((px + dx, -.17, pz), (px + dx, -.67, pz), .012, mirror=True)
    for y in (-.3, -.5):
        engines.box(px + .11, px + .15, y - .03, y + .03, pz - .03, pz + .03, mirror=True)
        engines.box(px - .15, px - .11, y - .03, y + .03, pz - .03, pz + .03, mirror=True)
    parts['engines'] = engines
    sockets = [(-px, -.82, pz), (px, -.82, pz)]
    return parts, sockets


# Scrapper 2, Flat-iron: a long, low wedge hull with a raised spine and bolt-on twin guns, a low visor under a brow,
# thin swept wings drooping slightly with dark tip plates turned down, one wide cassette with three exhaust slots.
def scrapper_2():
    J = JOINTS['scrapper']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, section(w, w * .4, w * .6, zb, -.035, .035, zt))
    hull.loft([st(-.56, .19, .07, -.1), st(-.52, .27, .085, -.13), st(-.45, .3, .1, -.15), st(-.3, .29, .108, -.16),
               st(-.1, .255, .112, -.16), st(.1, .215, .11, -.14), st(.3, .18, .1, -.11), st(.5, .14, .075, -.07),
               st(.7, .085, .04, -.035), st(.8, .045, .015, -.015)])
    hull.box(-.035, .035, .25, .72, .03, .095, bevel=.01)                          # raised spine
    hull.box(.17, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)         # wing mounting plates
    hull.box(.165, .275, .09, .25, -.045, .055, mirror=True)                       # gun housings
    for x, tip in ((.2, .5), (.238, .43)):
        hull.rod((x, .1, .0), (x, tip, .0), .012, mirror=True)
        hull.rod((x, tip - .03, .0), (x, tip, .0), .017, mirror=True)
    hull.rod((.25, -.2, -.04), (.25, .1, -.04), .014, mirror=True)                 # side feed pipe
    parts['hull'] = hull

    cockpit = Mesh()
    visor = lambda w, zt: [(w, 0), (w, .1), (w * .7, zt), (-w * .7, zt), (-w, .1), (-w, 0)]
    cockpit.loft([(-.01, visor(.075, .125)), (.03, visor(.09, .185)), (.14, visor(.085, .19)), (.205, visor(.065, .15)),
                  (.245, visor(.045, .115))])
    cockpit.box(-.07, .07, .15, .21, .17, .2, bevel=.008)                          # brow
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .03, .275, m['y0'], m['y1'], -.05, .035)                     # root block on the mounting plate
    panel = Mesh()
    panel.prism([(.21, .2), (.21, -.48), (.36, -.5), (.645, -.43), (.645, -.235), (.28, .2)], -.02, .025, chamfer=.008)
    panel.rod((.37, .03, .035), (.37, -.27, .035), .016)                           # gun pipe on top
    panel.rod((.37, -.2, .035), (.37, -.29, .035), .021)
    panel.rod((.405, -.2, .03), (.405, -.27, .03), .012)
    panel.box(.27, .4, -.32, -.04, -.1, -.02)                                       # box under the root
    tip = Mesh()
    tip.prism([(.635, -.235), (.83, -.33), (.82, -.62), (.635, -.5)], -.03, .03, chamfer=.01)
    tip.rod((.75, -.3, .035), (.75, -.06, .035), .008, segments=6)                 # antenna
    panel.merge(tip.tilt(.635, -33))
    wings.merge(panel.tilt(.23, -10)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.08, .08, -.32, b['y'], -.06, .03)                                 # yoke block on the bulkhead
    for x in (-.06, .06):
        engines.rod((x, -.3, -.02), (x, -.6, -.02), .025, segments=10)            # struts to the cassette
    engines.box(-.3, .3, -.8, -.585, -.075, .075, bevel=.012)                       # cassette
    engines.box(.295, .39, -.79, -.6, -.07, .07, bevel=.025, mirror=True)           # rounded side boxes
    engines.box(-.25, .25, -.6, -.555, .02, .07, bevel=.01)                         # top header
    for x in (-.17, .17):
        engines.rod((x, -.5, -.01), (x, -.6, -.01), .022, segments=10)            # visible struts behind the hull
    for x0, x1 in ((-.3, -.12), (-.1, .1), (.12, .3)):
        engines.box(x0, x1, -.81, -.79, -.06, .065, bevel=.006)                     # slot frames
    for x0, x1 in ((-.28, -.15), (-.07, .07), (.15, .28)):
        engines.box(x0, x1, -.815, -.805, -.02, .03, bevel=0, mat=1)                # glow
    parts['engines'] = engines
    return parts, [(-.215, -.82, .005), (0, -.82, .005), (.215, -.82, .005)]


# Scrapper 3, Hauler: an open truss round a ribbed cargo cylinder, a front block with forked tow prongs and twin chin
# guns, a raised octagonal cabin with a sensor mast, braced biplane wings with a twin gun on top, and four cans in two
# stacked pairs on a rear frame.
def scrapper_3():
    J = JOINTS['scrapper']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    ribs = [(.085, -.7), (.1, -.68)]
    for y in (-.6, -.45, -.3, -.15):
        ribs += [(.1, y - .015), (.108, y - .01), (.108, y + .01), (.1, y + .015)]
    hull.lathe(0, 0, ribs + [(.1, .02)])                                            # cargo cylinder
    for x in (-.165, .165):                                                         # truss rails
        for z in (-.125, .125):
            hull.rod((x, -.72, z), (x, .04, z), .016)
    for y in (-.7, -.55, -.4, -.25, -.1):                                          # frames and X braces
        hull.rod((-.165, y, .125), (.165, y, .125), .012)
        hull.rod((-.165, y, -.125), (.165, y, -.125), .012)
        for x in (-.165, .165):
            hull.rod((x, y, -.125), (x, y, .125), .012)
            if y < -.1:
                hull.rod((x, y, -.125), (x, y + .15, .125), .009, segments=6)
                hull.rod((x, y, .125), (x, y + .15, -.125), .009, segments=6)
        if y < -.1:
            hull.rod((-.165, y, .125), (.165, y + .15, .125), .009, segments=6)
            hull.rod((.165, y, .125), (-.165, y + .15, .125), .009, segments=6)
    hull.box(.165, .215, -.32, -.2, -.06, .06, mirror=True)                       # side tanks on the truss
    hull.box(-.06, .06, -.82, -.68, -.08, .06)                                      # tail block
    hull.prism([(.2, .02), (.2, .3), (.12, .38), (-.12, .38), (-.2, .3), (-.2, .02)], -.15, s['z'] + .06, chamfer=.02)
    hull.box(.15, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)          # wing mounting plates
    for x in (-.065, .065):                                                         # forked tow prongs
        hull.rod((x, .3, .2), (x * 1.3, .76, .225), .017)
        hull.box(x * 1.3 - .02, x * 1.3 + .02, .7, .8, .2, .25, bevel=.008)
    for z in (-.05, -.13):                                                          # chin guns
        hull.rod((.1, .3, z), (.1, .5, z), .011, mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.stack(0, .25, [(.14, 0), (.15, s['z'] + .1), (.152, s['z'] + .12), (.11, s['z'] + .2), (.1, s['z'] + .21)])
    cockpit.box(-.04, .04, .21, .29, s['z'] + .2, s['z'] + .23, bevel=.006)        # mast base
    cockpit.rod((0, .24, s['z'] + .2), (0, .24, .45), .009, segments=6)
    cockpit.rod((0, .24, .38), (0, .24, .41), .02, segments=8)
    cockpit.rod((.025, .26, s['z'] + .2), (.025, .26, .4), .005, segments=5)
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .03, .29, m['y0'], .09, -.12, .17)                           # root block carrying both wings
    plan = [(.2, .1), (.27, .19), (.45, .2), (.75, .16), (.775, .14), (.775, .0), (.42, -.11), (.25, -.15), (.2, -.15)]
    upper, lower = Mesh(), Mesh()
    upper.prism(plan, .125, .16, chamfer=.008)
    upper.box(.37, .44, -.0, .2, .155, .2, bevel=.006)                            # gun housing
    for x in (.395, .415):
        upper.rod((x, .15, .185), (x, .39, .185), .011)
    upper.rod((.765, .0, .14), (.765, .24, .14), .013)                              # end rails
    lower.prism(plan, -.115, -.08, chamfer=.008)
    lower.rod((.765, -.02, -.1), (.765, .14, -.1), .013)
    wings.merge(upper.tilt(.2, 6)).merge(lower)
    for x, top in ((.38, .17), (.755, .21)):                                        # posts
        wings.rod((x, .02, -.09), (x, .02, top), .012)
    wings.rod((.4, .02, -.08), (.7, .02, .19), .01, segments=6)                    # X braces
    wings.rod((.4, .02, .165), (.7, .02, -.08), .01, segments=6)
    wings.mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.08, .08, -.32, b['y'], -.06, .03)                                 # yoke block on the bulkhead
    for x in (-.06, .06):
        engines.rod((x, -.3, -.02), (x, -.68, -.02), .022, segments=10)
    can = [(.06, -.54), (.085, -.545), (.09, -.56), (.09, -.6), (.1, -.605), (.1, -.62), (.09, -.625), (.09, -.73),
           (.096, -.735), (.096, -.75), (.08, -.755), (.078, -.82), (.06, -.82), (.05, -.8)]
    for z in (.14, -.14):
        engines.lathe(.3, z, can, mirror=True, caps=False)
        engines.disc(.3, -.8, z, .05, mirror=True)
    engines.box(.06, .22, -.72, -.66, -.03, .03, mirror=True)                       # rear frame bar
    for z in (.14, -.14):
        engines.rod((.16, -.69, 0), (.23, -.66, z * .8), .012, mirror=True)
    parts['engines'] = engines
    return parts, [(x, -.82, z) for x in (-.3, .3) for z in (.14, -.14)]


# Scrapper 4, Prospector: a riveted round pressure-vessel hull with a stepped mining drill on the nose and side guns,
# a caged glass dome, swept fins with perforated end plates canted outward, a central ribbed bell with two small
# thrusters on a yoke bar.
def scrapper_4():
    J = JOINTS['scrapper']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    body = [(.06, -.42), (.1, -.38), (.14, -.32), (.18, -.22), (.195, -.12), (.2, .0), (.2, .12), (.195, .24),
            (.185, .3), (.17, .42), (.14, .52), (.1, .59), (.082, .6), (.082, .65), (.06, .65), (.06, .69), (.047, .69),
            (.045, .72), (.034, .72), (.03, .75), (.02, .75), (.008, .79)]
    hull.lathe(0, -.005, body, segments=24)
    for y in (-.2, .0, .2, .4):                                                    # riveted bands
        hull.lathe(0, -.005, [(.0, y), (.2 if -.15 < y < .3 else .18, y - .012), (.205 if -.15 < y < .3 else .186, y - .012),
                              (.205 if -.15 < y < .3 else .186, y + .012), (.0, y + .012)], segments=24, caps=False)
    hull.box(.16, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)          # wing mounting plates
    hull.box(.125, .175, .3, .4, -.03, .05, mirror=True)                            # gun housings
    hull.rod((.15, .38, .01), (.15, .66, .01), .011, mirror=True)
    hull.rod((.15, .62, .01), (.15, .67, .01), .016, mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.stack(0, .21, [(.1, 0), (.1, .15), (.106, .15), (.106, .18), (.088, .18), (.085, .215), (.068, .248),
                           (.04, .268), (.0, .275)], segments=16, turn=0)
    for a in (0, math.pi / 2, math.pi / 4, -math.pi / 4):                           # cage ribs over the dome
        c, d = math.cos(a), math.sin(a)
        cockpit.rod((-.09 * c, .21 - .09 * d, .185), (0, .21, .277), .006, segments=5)
        cockpit.rod((.09 * c, .21 + .09 * d, .185), (0, .21, .277), .006, segments=5)
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .03, .295, -.28, .24, -.08, .08)                             # root strip on the mounting plate
    panel = Mesh()
    panel.prism([(.28, .235), (.28, -.29), (.645, -.37), (.645, -.11)], -.03, .03, chamfer=.008)
    plate = Mesh()
    plate.prism([(.645, -.14), (.69, -.14), (.69, -.47), (.645, -.43)], -.03, .03, chamfer=.006)
    plate.rod((.68, -.14, .02), (.68, .0, .02), .008, segments=6)                  # antenna
    panel.merge(plate.tilt(.645, 50))
    wings.merge(panel.tilt(.28, -8)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.08, .08, -.32, b['y'], -.06, .03)                                 # yoke block on the bulkhead
    engines.box(-.3, .3, -.475, -.435, -.02, .04, bevel=.01)                       # yoke bar
    engines.rod((0, -.3, 0), (0, -.46, 0), .05, segments=12)
    bell = [(.1, -.46), (.12, -.5), (.135, -.56), (.15, -.6), (.17, -.65), (.172, -.7), (.15, -.7), (.15, -.79),
            (.135, -.8), (.1, -.8), (.07, -.76)]
    engines.lathe(0, 0, bell, segments=24, caps=False)
    for y in (-.62, -.66, -.69):
        engines.lathe(0, 0, [(.0, y), (.175, y), (.175, y - .012), (.0, y - .012)], segments=24, caps=False)
    engines.disc(0, -.765, 0, .075)
    thruster = [(.03, -.44), (.05, -.45), (.05, -.5), (.058, -.505), (.058, -.58), (.045, -.585), (.035, -.57)]
    engines.lathe(.24, 0, thruster, segments=12, mirror=True, caps=False)
    engines.disc(.24, -.57, 0, .03, mirror=True)
    for x in (-.15, .15):
        engines.rod((x, -.47, .0), (x * 1.15, -.7, .0), .012)                      # struts to the shroud
    parts['engines'] = engines
    return parts, [(0, -.8, 0), (-.24, -.585, 0), (.24, -.585, 0)]


# Scrapper 5, Courier: a slim diamond hull with nose guns along exposed rails, a long two-pane canopy on a collar,
# gull wings rising steeply at the root then running down to tip lamps, two finned box pods with tall slot nozzles.
def scrapper_5():
    J = JOINTS['scrapper']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    dia = lambda y, w, zt, zb: (y, [(0, zb), (w, -.01), (w * .55, zt * .8), (0, zt), (-w * .55, zt * .8), (-w, -.01)])
    hull.loft([dia(-.56, .04, .06, -.06), dia(-.45, .075, .1, -.11), dia(-.3, .105, .13, -.13), dia(-.15, .14, .13, -.15),
               dia(.0, .152, .125, -.15), dia(.15, .132, .12, -.12), dia(.35, .1, .1, -.08), dia(.55, .062, .065, -.045),
               dia(.7, .032, .03, -.02), dia(.8, .006, .006, -.004)])
    hull.box(.13, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)          # wing mounting plates
    hull.rod((.095, -.4, -.04), (.095, .35, -.04), .011, mirror=True)               # exposed chassis rails
    hull.box(.07, .125, .3, .42, -.05, .03, mirror=True)                            # gun housings
    hull.rod((.098, .4, -.01), (.098, .74, -.01), .01, mirror=True)
    hull.rod((.098, .7, -.01), (.098, .745, -.01), .015, mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    can = lambda w, zt: [(w, 0), (w, .11), (w * .55, zt), (-w * .55, zt), (-w, .11), (-w, 0)]
    cockpit.loft([(-.07, can(.05, .13)), (-.04, can(.065, .19)), (.12, can(.06, .2)), (.25, can(.045, .16)),
                  (.33, can(.03, .12))])
    cockpit.box(-.008, .008, -.04, .26, .185, .205, bevel=.003)                    # canopy frame spine
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .03, .29, m['y0'], m['y1'], -.05, .05)                       # root block on the mounting plate
    wings.rod((.22, -.05, .02), (.335, -.05, .125), .03, segments=10)              # rising root arm
    wings.box(.31, .36, -.2, .04, .09, .15, bevel=.012)                            # knee hinge
    panel = Mesh()
    panel.prism([(.34, .05), (.34, -.22), (.72, -.2), (.72, -.07)], -.016, .016, chamfer=.006)
    panel.box(.715, .75, -.22, -.05, -.03, .03, bevel=.008)                        # tip lamp housing
    panel.box(.745, .755, -.2, -.08, -.015, .02, bevel=0, mat=1)                   # lamp
    panel.rod((.735, -.13, .0), (.735, -.13, .1), .007, segments=5)                # tip fin rod
    wings.merge(panel.tilt(.34, -33).move(0, 0, .12)).mirror()                      # the panel hangs from the knee
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.08, .08, -.32, b['y'], -.06, .03)                                 # yoke block on the bulkhead
    for x in (-.06, .06):
        engines.rod((x, -.3, -.02), (x, -.45, -.02), .02, segments=10)
    engines.box(.04, .13, -.52, -.44, -.05, .03, mirror=True)                       # struts to the pods
    pod = lambda y, w, h: (y, [(w, -h), (w, h * .7), (w * .7, h), (-w * .7, h), (-w, h * .7), (-w, -h * .7),
                                (-w * .7, -h), (w * .7, -h)])
    for sgn in (1, -1):
        sec = lambda y, w, h: (y, [(.19 * sgn + px, z) for px, z in pod(y, w, h)[1]])
        engines.loft([sec(-.22, .045, .06), sec(-.3, .07, .13), sec(-.74, .075, .14), sec(-.8, .06, .11)])
        for k in range(12):                                                         # cooling fins
            y = -.34 - k * .024
            x0, x1 = sorted((.26 * sgn, .315 * sgn))
            engines.box(x0, x1, y - .006, y + .006, -.09, .09, bevel=0)
    engines.box(.155, .225, -.815, -.795, -.02, .115, bevel=0, mat=1, mirror=True)   # tall slot glow
    parts['engines'] = engines
    return parts, [(-.19, -.82, .05), (.19, -.82, .05)]


# Ironclad 1, Juggernaut: a broad terraced citadel with a ram prow and nose guns, a sloped bunker hood with a red visor
# slit, slab armour sponsons with twin cannons, two squared engine boxes with red louvres.
def ironclad_1():
    J = JOINTS['ironclad']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, section(w, w * .5, w * .72, zb, zb * .55, zt * .55, zt))
    hull.loft([st(b['y'], .2, .17, -.18), st(-.4, .3, .2, -.22), st(-.25, .4, .21, -.27), st(.32, .37, .21, -.26),
               st(.47, .27, .2, -.22), st(.56, .155, .17, -.15), st(.78, .15, .13, -.1), st(.84, .1, .11, -.07),
               st(.875, .06, .09, -.05)])
    hull.box(-.08, .08, -.78, b['y'], -.15, .1)                                     # rear spine between the engines
    hull.box(-.1, .1, -.4, .55, .2, .235, bevel=.01)                               # raised centre deck
    hull.box(.3, .385, -.35, .3, .2, .225, bevel=.008, mirror=True)                # terraced side decks
    hull.box(.2, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)          # wing mounting plates (inside)
    for x, y0, tip in ((.2, .52, .86), (.125, .6, .79)):                            # nose guns
        hull.rod((x, y0, .04), (x, tip, .04), .015, mirror=True)
        hull.rod((x, tip - .04, .04), (x, tip, .04), .021, mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    hood = lambda w, zt: [(w, 0), (w, s['z'] + .02), (w * .7, zt), (-w * .7, zt), (-w, s['z'] + .02), (-w, 0)]
    cockpit.loft([(.235, hood(.085, .25)), (.29, hood(.09, .295)), (.42, hood(.085, .295)), (.47, hood(.07, .245))])
    cockpit.box(-.05, .05, .44, .462, .248, .266, bevel=0, mat=1)                  # red visor slit
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .45, -.12, .2, -.08, .08)                              # root bracket to the sponson
    wings.prism([(.43, -.62), (.6, -.67), (.8, -.5), (.8, .26), (.64, .42), (.43, .4)], -.14, .12, chamfer=.03)
    wings.box(.5, .69, .0, .3, .1, .2, bevel=.012)                                  # cannon housing
    for x in (.55, .635):
        wings.rod((x, .25, .165), (x, .57, .165), .015)
        wings.rod((x, .52, .165), (x, .575, .165), .021)
    wings.box(.74, .81, -.45, .2, -.08, .06, bevel=.01)                             # outer armour strake
    wings.mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.12, .12, -.5, b['y'], b['z0'], b['z1'] - .02)                       # yoke plate on the bulkhead
    box = section(.16, .12, .12, -.2, -.13, .1, .17)
    for sgn in (1, -1):
        engines.loft([(-.45, shifted(box, .26 * sgn)), (-.85, shifted(box, .26 * sgn)),
                      (-.875, shifted(section(.14, .1, .1, -.17, -.11, .08, .14), .26 * sgn))])
    for z in (-.09, -.045, .0, .045, .09):                                          # red louvres
        engines.box(.18, .34, -.885, -.874, z - .01, z + .01, bevel=0, mat=1, mirror=True)
    parts['engines'] = engines
    return parts, [(-.26, -.88, .0), (.26, -.88, .0)]


# Ironclad 2, Warhammer: a hammerhead ram with two tusks on a narrow mechanical waist, a domed command turret, swept
# scythe wings drooping outward with gun clusters, three round turbines on a rear bridge.
def ironclad_2():
    J = JOINTS['ironclad']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    hull.prism([(.42, .27), (.46, .33), (.46, .48), (.4, .55), (.12, .58), (-.12, .58), (-.4, .55), (-.46, .48), (-.46, .33),
                (-.42, .27)], -.05, .11, chamfer=.025)                              # hammerhead
    for x in (-.44, .44):                                                           # tusks
        hull.lathe(x, .03, [(.0, .74), (.012, .7), (.03, .52), (.03, .45)], segments=10)
    st = lambda y, w, zt, zb: (y, section(w, w * .7, w * .7, zb, zb * .5, zt * .5, zt))
    hull.loft([st(-.62, .34, .08, -.08), st(-.55, .3, .1, -.12), st(-.48, .16, .12, -.15), st(.3, .135, .13, -.15),
               st(.6, .09, .1, -.06), st(.76, .06, .06, -.03)])
    for x in (.035, .075):                                                          # nose guns
        hull.rod((x, .6, .03), (x, .88 - x, .03), .013, mirror=True)
    hull.lathe(.175, -.02, [(.04, -.08), (.05, -.1), (.05, -.43), (.04, -.45)], segments=12, mirror=True)
    hull.box(.16, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)          # wing mounting plates
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.stack(0, .0, [(.105, 0), (.112, .14), (.112, .165), (.1, .19), (.08, .225), (.045, .245), (0, .25)],
                  segments=16, turn=0)
    for x in (-.03, .03):                                                           # periscope eyes
        cockpit.box(x - .012, x + .012, .07, .1, .2, .225, bevel=.003, mat=1)
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .34, -.3, .08, -.05, .05)                              # root block on the mounting plate
    blade = Mesh()
    blade.prism([(.26, .06), (.55, .03), (.68, -.05), (.75, -.15), (.78, -.35), (.76, -.55), (.66, -.88), (.6, -.74),
                 (.5, -.6), (.38, -.53), (.26, -.5)], -.025, .035, chamfer=.01)
    blade.box(.47, .59, -.06, .12, .02, .09, bevel=.01)                             # gun cluster housing
    for x in (.49, .53, .57):
        blade.rod((x, .05, .06), (x, .35, .06), .012)
    wings.merge(blade.tilt(.26, -22)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.1, .1, -.6, b['y'], -.08, .06)                                    # yoke to the bulkhead
    engines.box(-.37, .37, -.66, -.58, -.08, .08, bevel=.015)                       # engine bridge
    turbine = [(.08, -.58), (.115, -.6), (.115, -.64), (.125, -.645), (.125, -.67), (.11, -.675), (.11, -.82),
               (.122, -.83), (.122, -.87), (.1, -.88), (.07, -.86)]
    for x, z in ((-.235, 0), (0, .02), (.235, 0)):
        engines.lathe(x, z, turbine, segments=20, caps=False)
        engines.disc(x, -.855, z, .065)
    parts['engines'] = engines
    return parts, [(-.235, -.89, 0), (0, -.89, .02), (.235, -.89, 0)]


# Ironclad 3, Bastion: an octagonal fortress with a raised collar round a sunken shuttered bridge, missile-rack pods on
# open triangular braces, four armoured cans in two pairs with flared bells.
def ironclad_3():
    J = JOINTS['ironclad']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    hull.prism([(.32, -.2), (.42, -.08), (.42, .52), (.3, .68), (.17, .73), (-.17, .73), (-.3, .68), (-.42, .52),
                (-.42, -.08), (-.32, -.2)], -.28, .24, chamfer=.05)                 # fortress block
    hull.box(.17, .3, .0, .62, .2, .33, bevel=.015, mirror=True)                    # collar walls round the bridge
    hull.box(-.3, .3, .55, .66, .2, .32, bevel=.015)
    hull.box(-.3, .3, -.08, .02, .2, .3, bevel=.015)
    hull.box(-.22, .22, b['y'], -.15, -.2, .15, bevel=.02)                          # rear section
    for x in (-.03, .03):
        hull.rod((x, .7, .25), (x, .88, .25), .008, segments=6)                     # antennas
    hull.box(.3, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)           # wing mounting plates (inside)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.box(-.135, .135, .12, .53, 0, s['z'] + .06, bevel=.01)                  # sunken bridge
    for y in (.28, .36, .44):                                                       # shutter slats
        cockpit.box(-.12, .12, y - .025, y + .025, s['z'] + .06, s['z'] + .085, bevel=.006)
    cockpit.box(-.08, .08, .47, .5, s['z'] + .03, s['z'] + .055, bevel=0, mat=1)
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .44, -.12, .2, -.06, .06)                              # root block on the mounting plate
    wings.rod((.4, .17, .0), (.66, .1, .0), .028, segments=10)                     # triangular braces
    wings.rod((.4, -.1, .0), (.66, .0, .0), .028, segments=10)
    wings.rod((.45, .15, .0), (.6, .02, .0), .018, segments=8)
    wings.box(.63, .87, -.2, .45, -.17, .13, bevel=.03)                             # missile pod
    for x in (.7, .78):
        for z in (-.07, .05):
            wings.rod((x, .44, z), (x, .47, z), .03, segments=10)                   # tube mouths
    for x in (.67, .71):
        wings.rod((x, -.2, -.1), (x, -.25, -.1), .01, segments=6)
    wings.mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.08, .08, -.47, b['y'], -.08, .06)                                  # yoke on the bulkhead
    def can(y0):
        return [(.07, y0), (.1, y0 - .02), (.1, -.62), (.112, -.625), (.112, -.65), (.1, -.655), (.1, -.7), (.115, -.75),
                (.125, -.85), (.11, -.86), (.075, -.8)]
    for x, y0 in ((.37, -.3), (.145, -.45)):
        engines.lathe(x, 0, can(y0), segments=18, mirror=True, caps=False)
        engines.disc(x, -.8, 0, .07, mirror=True)
    engines.box(.15, .3, -.45, -.35, -.06, .06, mirror=True)                       # frame between the pairs
    parts['engines'] = engines
    return parts, [(x, -.86, 0) for x in (-.37, -.145, .145, .37)]


# Ironclad 4, Breaker: a split wedge of two long armoured jaws round a recessed cannon, a raised periscope tower, broad
# blunt delta wings with forward hardpoints and tip posts, two huge annular thrusters.
def ironclad_4():
    J = JOINTS['ironclad']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    hull.prism([(.06, .1), (.3, .05), (.3, .15), (.13, .88), (.075, .88), (.06, .8)], -.06, .1, chamfer=.015, mirror=True)
    hull.rod((0, .05, .02), (0, .74, .02), .03, segments=12)                        # recessed cannon
    hull.rod((0, .7, .02), (0, .76, .02), .042, segments=12)
    st = lambda y, w, zt, zb: (y, section(w, w * .7, w * .7, zb, zb * .5, zt * .5, zt))
    hull.loft([st(-.5, .14, .12, -.15), st(-.3, .17, .15, -.18), st(.05, .17, .15, -.18), st(.15, .12, .1, -.1)])
    hull.box(.14, .22, -.3, -.05, -.1, .08, bevel=.012, mirror=True)               # side units
    hull.box(.16, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)          # wing mounting plates
    parts['hull'] = hull

    cockpit = Mesh()
    tw = lambda w, zt: [(w, 0), (w, zt - .04), (w * .75, zt), (-w * .75, zt), (-w, zt - .04), (-w, 0)]
    cockpit.loft([(-.26, tw(.06, .19)), (-.21, tw(.075, .27)), (.0, tw(.07, .27)), (.04, tw(.05, .19))])
    for y in (-.16, -.08):                                                         # periscope windows
        cockpit.box(.073, .078, y - .025, y + .025, .21, .245, bevel=0, mat=1, mirror=True)
    for x in (-.04, .04):
        cockpit.rod((x, -.1, .26), (x, -.1, .33), .006, segments=5)
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .32, m['y0'], m['y1'], -.05, .05)                       # root block on the mounting plate
    delta = Mesh()
    delta.prism([(.27, .15), (.38, .17), (.8, -.07), (.82, -.12), (.82, -.5), (.64, -.66), (.42, -.64), (.27, -.58)],
                -.025, .035, chamfer=.012)
    for x in (.46, .5, .54):                                                       # hardpoint tubes
        delta.rod((x, .03, .05), (x, .21, .05), .019, segments=10)
    delta.rod((.82, -.25, -.06), (.82, -.25, .08), .009, segments=6)                # tip post
    wings.merge(delta.tilt(.27, -16)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.1, .1, -.5, b['y'], -.08, .06)                                    # yoke on the bulkhead
    ring = [(.1, -.42), (.13, -.45), (.16, -.52), (.17, -.6), (.17, -.82), (.155, -.9), (.12, -.9), (.105, -.86)]
    engines.lathe(.23, 0, ring, segments=24, mirror=True, caps=False)
    for y in (-.66, -.74):
        engines.lathe(.23, 0, [(.0, y), (.177, y), (.177, y - .015), (.0, y - .015)], segments=24, mirror=True, caps=False)
    engines.disc(.23, -.86, 0, .1, mirror=True)
    parts['engines'] = engines
    return parts, [(-.23, -.9, 0), (.23, -.9, 0)]


# Ironclad 5, Siege: a long slab spine with railgun rails to the nose and stepped shoulders, a heavy-framed canopy,
# canted blade sponsons on joint arms with ventral fins and long guns, a wide drive block with five rectangular exhausts.
def ironclad_5():
    J = JOINTS['ironclad']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, section(w, w * .85, w * .85, zb, zb * .6, zt * .6, zt))
    hull.loft([st(-.62, .24, .1, -.18), st(.3, .24, .13, -.2), st(.45, .2, .12, -.17), st(.56, .17, .11, -.14),
               st(.7, .13, .1, -.1), st(.8, .1, .08, -.07), st(.86, .05, .06, -.04)])
    for x in (-.025, .025):                                                         # railgun rails
        hull.box(x - .012, x + .012, -.5, .86, .12, .16, bevel=.004)
    hull.rod((0, .8, .14), (0, .92, .14), .014, segments=8)
    hull.rod((.12, .5, .1), (.12, .85, .1), .012, mirror=True)                       # shoulder guns
    hull.box(.2, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)          # wing mounting plates
    parts['hull'] = hull

    cockpit = Mesh()
    can = lambda w, zt: [(w, 0), (w, s['z'] - .02), (w * .7, zt), (-w * .7, zt), (-w, s['z'] - .02), (-w, 0)]
    cockpit.loft([(-.17, can(.06, .2)), (-.12, can(.075, .265)), (.03, can(.075, .27)), (.09, can(.05, .2))])
    cockpit.box(-.008, .008, -.13, .06, .26, .28, bevel=.003)                      # frame spine
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .34, -.3, -.2, -.05, .05)                               # root block on the mounting plate
    wings.rod((.24, -.26, 0), (.47, -.26, 0), .045, segments=12)                   # joint arm
    blade = Mesh()
    blade.prism([(.45, -.12), (.55, -.06), (.68, -.3), (.68, -.6), (.6, -.72), (.46, -.65)], -.035, .035, chamfer=.01)
    blade.box(.6, .645, -.65, -.3, -.26, .0, bevel=.008)                            # ventral fin
    blade.box(.47, .54, -.4, -.15, .03, .08, bevel=.008)                            # gun mount
    blade.rod((.505, -.35, .065), (.505, .07, .065), .014)
    blade.rod((.505, .03, .065), (.505, .075, .065), .02)
    wings.merge(blade.tilt(.45, -8)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.1, .1, -.62, b['y'], -.08, .06)                                    # yoke to the bulkhead
    engines.box(-.36, .36, -.9, -.6, -.18, .08, bevel=.02)                          # drive block
    for k in range(5):
        x = -.26 + k * .13
        engines.box(x - .055, x + .055, -.91, -.895, -.1, .06, bevel=.006)          # exhaust frames
        engines.box(x - .035, x + .035, -.915, -.905, -.07, .035, bevel=0, mat=1)   # glow
    parts['engines'] = engines
    return parts, [(-.26 + k * .13, -.92, -.02) for k in range(5)]


def canopy(y0, y1, w, z0, z1, mid=.4):
    """A long low canopy with its skirt down to the mid-plane: rings from y0 to y1, widest at `mid` of its length."""
    ring = lambda k, h: [(w * k, 0), (w * k, z0), (w * k * .6, z0 + (z1 - z0) * h), (-w * k * .6, z0 + (z1 - z0) * h),
                         (-w * k, z0), (-w * k, 0)]
    ym = y0 + (y1 - y0) * mid
    return [(y0, ring(.6, .5)), (y0 + (ym - y0) * .4, ring(.95, .9)), (ym, ring(1, 1)),
            (ym + (y1 - ym) * .6, ring(.75, .75)), (y1, ring(.25, .3))]


def spear(x, y0, y1, r, tip):
    """A spear-pointed boom along y: radius r from y0 (rear) to y1, then a point out to `tip`."""
    return x, [(r * .8, y0), (r, y0 + .03), (r, y1), (r * .5, y1 + (tip - y1) * .6), (.004, tip)]


# Interceptor 1, Viper: a knife core with chines and nose gun pods, a teardrop canopy, long swept blade wings with a
# root fin, two spear booms with canted tail fins.
def interceptor_1():
    J = JOINTS['interceptor']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, [(0, zb), (w * .6, zb * .6), (w, 0), (w * .6, zt * .7), (0, zt), (-w * .6, zt * .7), (-w, 0),
                                    (-w * .6, zb * .6)])
    hull.loft([st(b['y'] - .07, .05, .05, -.05), st(b['y'], .07, .07, -.08), st(-.2, .1, .1, -.12), st(.15, .11, .11, -.12),
               st(.45, .08, .08, -.08), st(.7, .04, .05, -.04), st(.9, .004, .01, -.004)])
    for x, y0, y1, tip in ((.1, .25, .58, .8), (.058, .5, .62, .72)):              # nose gun pods
        cx, prof = spear(x, y0, y1, .022, tip)
        hull.lathe(cx, -.01, prof, segments=10, mirror=True)
    hull.box(.09, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)          # wing mounting plates
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.loft(canopy(.0, .4, .05, s['z'], s['z'] + .085, .45))
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .2, m['y0'], m['y1'], -.04, .03)
    blade = Mesh()
    blade.prism([(.17, .28), (.24, .25), (.88, -.66), (.84, -.66), (.36, -.2), (.17, -.2)], -.012, .012, chamfer=.004)
    blade.prism([(.2, .3), (.26, .26), (.26, .0), (.2, .02)], .0, .015, chamfer=.004)
    wings.merge(blade)
    fin = Mesh()
    fin.prism([(.23, .3), (.25, .3), (.25, .05), (.23, .05)], .0, .14, chamfer=.004)   # root fin, canted outward
    wings.merge(fin.tilt(.24, 70)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.06, .06, -.6, b['y'], -.06, .04)                                  # yoke to the bulkhead
    engines.box(.05, .16, -.42, -.34, -.04, .02, mirror=True)                       # boom struts
    boom = [(.035, -.89), (.055, -.86), (.055, -.6), (.05, -.3), (.045, -.15), (.025, -.05), (.004, .0)]
    engines.lathe(.2, -.01, boom, segments=14, mirror=True)
    engines.disc(.2, -.885, -.01, .035, mirror=True)
    fins = Mesh()
    for zsgn in (1, -1):                                                            # canted tail fins, mirrored below
        fin = Mesh()
        fin.prism([(.2, -.62), (.2, -.8), (.33, -.86), (.33, -.78)], -.006, .006, chamfer=.002)
        fins.merge(fin.tilt(.2, 35 * zsgn).move(0, 0, -.01))
    engines.merge(fins.mirror())
    parts['engines'] = engines
    return parts, [(-.2, -.9, -.01), (.2, -.9, -.01)]


# Interceptor 2, Hornet: a twin-prong nose with canards and broad intake shoulders, a stepped tandem canopy, cranked
# deltas with drooped tip forks and outer guns, two box booms joined by a tailplane, square nozzles.
def interceptor_2():
    J = JOINTS['interceptor']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, section(w, w * .8, w * .7, zb, zb * .5, zt * .5, zt))
    hull.loft([st(b['y'] - .08, .06, .06, -.06), st(b['y'], .09, .09, -.1), st(-.2, .13, .11, -.13),
               st(.05, .2, .12, -.13), st(.22, .18, .12, -.12), st(.4, .1, .11, -.09), st(.62, .08, .09, -.07)])
    for x in (-.035, .035):                                                         # nose prongs
        hull.loft([(.6, shifted(section(.03, .025, .025, -.06, -.03, .04, .07), x)),
                   (.88, shifted(section(.012, .01, .01, -.02, -.01, .01, .02), x))])
    hull.prism([(.08, .56), (.24, .6), (.24, .63), (.08, .66)], -.01, .01, chamfer=.003, mirror=True)  # canards
    hull.box(.12, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.loft(canopy(-.05, .48, .065, s['z'], s['z'] + .1, .3))
    cockpit.box(-.07, .07, .2, .24, s['z'] + .02, s['z'] + .1, bevel=.006)          # frame between the seats
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .22, m['y0'], m['y1'], -.04, .03)
    plan = Mesh()
    plan.prism([(.18, .17), (.36, .14), (.78, .0), (.78, -.2), (.62, -.16), (.42, -.32), (.18, -.32)], -.014, .014, chamfer=.004)
    plan.box(.68, .72, -.15, .08, .0, .04, bevel=.006)                               # gun housing
    plan.rod((.7, .05, .02), (.7, .33, .02), .009, segments=6)
    fork = Mesh()
    fork.prism([(.78, .15), (.82, .15), (.82, -.42), (.78, -.3)], -.008, .008, chamfer=.003)
    plan.merge(fork.tilt(.78, -60))
    wings.merge(plan.tilt(.18, -10)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.06, .06, -.62, b['y'], -.06, .04)
    boxs = section(.055, .045, .045, -.11, -.07, .1, .14)
    for sgn in (1, -1):
        engines.loft([(-.28, shifted(section(.04, .03, .03, -.06, -.04, .05, .08), .21 * sgn)), (-.36, shifted(boxs, .21 * sgn)),
                      (-.88, shifted(boxs, .21 * sgn))])
    engines.box(-.2, .2, -.78, -.68, -.02, .03, bevel=.008)                          # tailplane
    engines.box(.17, .25, -.885, -.875, -.06, .09, bevel=0, mat=1, mirror=True)
    parts['engines'] = engines
    return parts, [(-.21, -.89, .015), (.21, -.89, .015)]


# Interceptor 3, Talon: a keel core with a dorsal blade, a flush faceted visor, long swept falcon wings with upright tip
# knives, skeletal cage booms round ring nozzles with long forward cannons.
def interceptor_3():
    J = JOINTS['interceptor']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, [(0, zb), (w * .7, zb * .5), (w, 0), (w * .6, zt * .7), (0, zt), (-w * .6, zt * .7), (-w, 0),
                                    (-w * .7, zb * .5)])
    hull.loft([st(-.72, .03, .04, -.04), st(b['y'] - .05, .08, .07, -.09), st(-.1, .13, .11, -.13), st(.2, .12, .11, -.12),
               st(.5, .07, .07, -.07), st(.75, .03, .04, -.03), st(.88, .003, .01, -.003)])
    hull.prism([(.0, -.35), (.01, -.35), (.01, .2), (.0, .25)], .09, .16, chamfer=.003, mirror=True)  # dorsal blade
    hull.box(.1, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.loft(canopy(.02, .38, .055, s['z'], s['z'] + .06, .4))
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .2, m['y0'], .04, -.04, .03)
    plan = Mesh()
    plan.prism([(.15, .04), (.3, .0), (.72, -.32), (.74, -.55), (.52, -.47), (.32, -.38), (.15, -.3)], -.012, .012, chamfer=.004)
    knife = Mesh()
    knife.prism([(.72, -.08), (.76, -.12), (.76, -.8), (.72, -.6)], .0, .02, chamfer=.004)
    plan.merge(knife.tilt(.74, 80))
    wings.merge(plan.tilt(.15, -6)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.06, .06, -.62, b['y'], -.06, .04)
    engines.box(.05, .14, -.4, -.32, -.04, .02, mirror=True)
    for y in (-.32, -.5, -.68, -.84):                                               # cage rings
        engines.lathe(.2, 0, [(.0, y), (.1, y), (.1, y - .03), (.0, y - .03)], segments=16, mirror=True, caps=False)
    for k in range(6):                                                              # cage ribs
        a = 2 * math.pi * k / 6
        engines.rod((.2 + .095 * math.cos(a), -.32, .095 * math.sin(a)), (.2 + .095 * math.cos(a), -.87, .095 * math.sin(a)),
                    .006, segments=5, mirror=True)
    engines.lathe(.2, 0, [(.03, -.3), (.06, -.4), (.06, -.8), (.07, -.86), (.05, -.87)], segments=14, mirror=True, caps=False)
    engines.disc(.2, -.86, 0, .05, mirror=True)
    for x in (.18,):                                                                 # long forward cannons
        engines.rod((x, -.3, .06), (x, .66, .06), .012, mirror=True)
        engines.rod((x, .6, .06), (x, .67, .06), .018, mirror=True)
    engines.lathe(0, 0, [(.02, -.72), (.03, -.74), (.03, -.8), (.02, -.82)], segments=10)   # centre booster
    parts['engines'] = engines
    return parts, [(-.2, -.88, 0), (.2, -.88, 0), (0, -.82, 0)]


# Interceptor 4, Lance: a needle core with a sensor probe, a raised bubble canopy, clipped trapezoid wings with pylons
# and tip rails, two long armoured booms with twin vertical stabilisers and buried round nozzles.
def interceptor_4():
    J = JOINTS['interceptor']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, section(w, w * .7, w * .6, zb, zb * .5, zt * .5, zt))
    hull.loft([st(-.8, .05, .05, -.06), st(-.6, .08, .08, -.1), st(-.1, .1, .1, -.12), st(.3, .085, .09, -.09),
               st(.6, .05, .06, -.05), st(.82, .015, .02, -.015)])
    hull.rod((0, .8, 0), (0, .95, 0), .006, segments=6)                              # sensor probe
    hull.box(.08, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.loft(canopy(.05, .48, .05, s['z'], s['z'] + .1, .4))
    cockpit.box(-.055, .055, .2, .23, s['z'], s['z'] + .1, bevel=.005)               # bubble frame
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .2, m['y0'], m['y1'], -.04, .03)
    plan = Mesh()
    plan.prism([(.13, .08), (.55, -.03), (.58, -.07), (.58, -.18), (.13, -.18)], -.012, .012, chamfer=.004)
    for x in (.38, .44):                                                            # pylons and stores
        plan.box(x - .01, x + .01, -.18, -.06, -.06, -.01, bevel=.003)
        plan.rod((x, -.24, -.065), (x, -.05, -.065), .015, segments=8)
    plan.rod((.58, -.2, .0), (.58, .1, .0), .01, segments=8)                         # tip rail
    wings.merge(plan.tilt(.13, -4)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.06, .06, -.6, b['y'], -.06, .04)
    boom = section(.05, .045, .04, -.07, -.04, .05, .08)
    for sgn in (1, -1):
        engines.loft([(-.2, shifted(section(.03, .025, .02, -.04, -.02, .03, .05), .17 * sgn)), (-.3, shifted(boom, .17 * sgn)),
                      (-.86, shifted(boom, .17 * sgn)), (-.9, shifted(section(.04, .035, .03, -.055, -.03, .04, .06), .17 * sgn))])
    engines.disc(.17, -.905, 0, .035, mirror=True)
    engines.prism([(.21, -.62), (.23, -.62), (.23, -.82), (.21, -.8)], .04, .33, chamfer=.004, mirror=True)   # stabilisers
    engines.prism([(.21, -.66), (.23, -.66), (.23, -.82), (.21, -.8)], -.15, -.04, chamfer=.004, mirror=True)
    parts['engines'] = engines
    return parts, [(-.17, -.91, 0), (.17, -.91, 0)]


# Interceptor 5, Kestrel: a flat shovel nose with recessed nose cannons, a wraparound three-pane canopy, gull wings swept
# forward to tip plates, two broad flattened booms with wide vectoring nozzles.
def interceptor_5():
    J = JOINTS['interceptor']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, section(w, w * .85, w * .8, zb, zb * .5, zt * .5, zt))
    hull.loft([st(-.6, .1, .08, -.1), st(-.3, .14, .1, -.13), st(.2, .2, .1, -.12), st(.45, .19, .08, -.1),
               st(.7, .16, .05, -.07), st(.86, .14, .03, -.04)])
    for x in (.065, .1):                                                            # nose cannons
        hull.box(x - .018, x + .018, .5, .66, .02, .05, bevel=.004, mirror=True)
        hull.rod((x, .62, .035), (x, .74, .035), .01, segments=8, mirror=True)
    hull.box(.14, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.loft(canopy(-.15, .3, .11, s['z'], s['z'] + .12, .35))
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .26, m['y0'], m['y1'], -.04, .03)
    inner, outer = Mesh(), Mesh()
    inner.prism([(.22, -.08), (.36, -.03), (.36, -.33), (.22, -.42)], -.012, .012, chamfer=.004)
    outer.prism([(.36, -.03), (.72, .1), (.76, .08), (.76, -.06), (.45, -.25), (.36, -.33)], -.012, .012, chamfer=.004)
    outer.prism([(.75, .12), (.79, .12), (.79, -.12), (.75, -.1)], -.06, .08, chamfer=.004)   # tip plate
    wings.merge(inner.tilt(.22, 14)).merge(outer.move(0, 0, .035).tilt(.36, 5)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.06, .06, -.62, b['y'], -.06, .04)
    flat = section(.065, .055, .05, -.12, -.07, .1, .14)
    for sgn in (1, -1):
        engines.loft([(-.3, shifted(section(.05, .04, .035, -.07, -.04, .06, .09), .21 * sgn)), (-.38, shifted(flat, .21 * sgn)),
                      (-.86, shifted(flat, .21 * sgn)), (-.9, shifted(section(.06, .05, .045, -.1, -.06, .08, .12), .21 * sgn))])
    for z in (-.05, .0, .05):                                                        # vectoring vanes
        engines.box(.165, .255, -.91, -.9, z - .006, z + .006, bevel=0, mirror=True)
    engines.box(.165, .255, -.905, -.895, -.08, .1, bevel=0, mat=1, mirror=True)
    parts['engines'] = engines
    return parts, [(-.21, -.91, .01), (.21, -.91, .01)]


def arc(cx, cy, r, a0, a1, n=8):
    """Points on a circle round (cx, cy) from angle a0 to a1 (degrees, 0 along +x, counter-clockwise)."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n)))
            for k in range(n + 1)]


def ring(x, z, r_in, r_out, y0, y1, segments=24):
    """A ring drive along y: a tube of radii r_in to r_out from y0 (front) to y1 (rear), round the axis (x, z)."""
    return x, z, [(r_in, y0), (r_out, y0), (r_out, y1), (r_in, y1), (r_in, y0)]


# Spectre 1, Manta: a lens core with a beak and nose gun pods, an eye slit under a lid, broad curved manta wings drooping
# at the tips, three gimballed drive rings in a triangle with dark vanes.
def spectre_1():
    J = JOINTS['spectre']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, [(0, zb), (w * .7, zb * .6), (w, 0), (w * .7, zt * .7), (0, zt), (-w * .7, zt * .7), (-w, 0),
                                    (-w * .7, zb * .6)])
    hull.loft([st(b['y'] - .1, .1, .08, -.12), st(b['y'], .14, .1, -.16), st(-.2, .2, .13, -.2), st(.15, .2, .13, -.18),
               st(.5, .13, .1, -.1), st(.75, .06, .06, -.05), st(.86, .01, .02, -.01)])
    for x in (.2, .14):                                                             # nose gun pods
        cx, prof = spear(x, .45 + (.2 - x), .72, .025, .84)
        hull.lathe(cx, .02, prof, segments=10, mirror=True)
    hull.box(.15, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    lid = lambda w, zt: [(w, 0), (w, s['z']), (w * .6, zt), (-w * .6, zt), (-w, s['z']), (-w, 0)]
    cockpit.loft([(.38, lid(.04, .15)), (.45, lid(.08, .19)), (.62, lid(.07, .18)), (.7, lid(.03, .15))])
    cockpit.box(-.05, .05, .6, .63, .135, .155, bevel=0, mat=1)                    # eye slit
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .26, m['y0'], .3, -.04, .04)
    manta = Mesh()
    manta.prism([(.17, .5), (.3, .4), (.45, .3), (.6, .17), (.75, .0), (.84, -.2), (.89, -.42), (.87, -.48), (.75, -.37),
                 (.6, -.3), (.45, -.3), (.34, -.34), (.27, -.45), (.22, -.6), (.17, -.6)], -.022, .022, chamfer=.008)
    wings.merge(manta.tilt(.2, -11)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.1, .1, -.6, b['y'], -.08, .06)
    engines.box(-.22, .22, -.62, -.56, -.12, .16, bevel=.02)                        # cassette frame
    for x, z, ri, ro in ((-.15, .1, .045, .065), (.15, .1, .045, .065), (0, -.03, .065, .095)):
        cx, cz, prof = ring(x, z, ri, ro, -.58, -.82)
        engines.lathe(cx, cz, prof, segments=20, caps=False)
        engines.disc(x, -.7, z, ri)
    engines.prism([(.3, -.55), (.33, -.55), (.33, -.85), (.3, -.8)], -.12, .1, chamfer=.006, mirror=True)  # vanes
    engines.box(.2, .32, -.66, -.6, -.03, .03, mirror=True)
    parts['engines'] = engines
    return parts, [(-.15, -.83, .1), (.15, -.83, .1), (0, -.83, -.03)]


# Spectre 2, Crescent: a forked core of two forward blades round a bridge, a caged violet crystal, long knife wings on
# rail arms pointing forward, two large hollow ring drives with copper spokes.
def spectre_2():
    J = JOINTS['spectre']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, section(w, w * .75, w * .6, zb, zb * .5, zt * .5, zt))
    hull.loft([st(b['y'] - .08, .17, .12, -.14), st(-.35, .17, .13, -.15), st(-.1, .14, .12, -.13), st(.35, .08, .1, -.08),
               st(.6, .04, .06, -.04), st(.72, .01, .02, -.01)])
    # The forked prongs: broad curved blades either side of the cockpit, a raised ridge along each.
    hull.prism([(.09, -.05), (.2, -.02), (.27, .2), (.28, .45), (.24, .7), (.17, .93), (.15, .75), (.12, .45), (.09, .2)],
               -.05, .05, chamfer=.012, mirror=True)
    hull.prism([(.17, .05), (.2, .05), (.22, .5), (.17, .85), (.165, .5)], .05, .075, chamfer=.006, mirror=True)
    hull.box(.1, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.box(-.07, .07, .18, .58, 0, s['z'], bevel=.01)                          # containment base
    gem = lambda w, zt: [(w, s['z']), (w * .5, zt), (-w * .5, zt), (-w, s['z'])]
    cockpit.loft([(.2, gem(.01, s['z'] + .02)), (.3, gem(.065, s['z'] + .13)), (.47, gem(.065, s['z'] + .13)),
                  (.58, gem(.01, s['z'] + .02))], mat=1)
    for y in (.21, .56):
        cockpit.box(-.075, .075, y - .012, y + .012, s['z'], s['z'] + .11, bevel=.004)  # cage frames
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .32, -.29, -.03, -.05, .05)
    wings.box(.3, .74, -.28, -.12, -.035, .035, bevel=.012)                         # rail arm
    wings.rod((.32, -.27, .03), (.6, -.27, .03), .014, segments=8)                  # piston along the arm
    knife = Mesh()
    # A broad curved knife: pointed forward tip, widest across the arm, tapering to a rear point.
    knife.prism([(.38, .8), (.47, .6), (.56, .38), (.66, .14), (.77, -.12), (.87, -.38), (.91, -.56), (.88, -.7),
                 (.8, -.5), (.68, -.26), (.57, -.02), (.48, .24), (.41, .52)], -.03, .03, chamfer=.01)
    knife.prism([(.42, .62), (.5, .42), (.62, .14), (.76, -.18), (.84, -.42), (.8, -.42), (.72, -.18), (.58, .12),
                 (.46, .42), (.4, .6)], .03, .05, chamfer=.006)                     # raised ridge
    wings.merge(knife).mirror()
    parts['wings'] = wings

    engines = Mesh()
    # The reactor: a broad housing from the bulkhead back between the two ring drives, as wide as the hull where they meet.
    rh = lambda y, w, zt, zb: (y, section(w, w * .85, w * .7, zb, zb * .5, zt * .6, zt))
    engines.loft([rh(b['y'] + .05, .16, .12, -.14), rh(-.56, .22, .14, -.17), rh(-.72, .2, .13, -.16), rh(-.88, .12, .1, -.12),
                  rh(-.95, .07, .07, -.08)])
    # The ring drives, tilted like the model's: each face turned back and up about 28 degrees.
    rings = Mesh()
    for x in (-.25, .25):
        torus = [(.14, -.6), (.19, -.61), (.235, -.65), (.26, -.71), (.265, -.77), (.255, -.84), (.22, -.9), (.17, -.92),
                 (.15, -.9), (.15, -.77), (.14, -.63), (.14, -.6)]                  # a deep rounded drum, hollow
        rings.lathe(x, -.02, torus, segments=28, caps=False)
        rings.lathe(x, -.02, [(.135, -.76), (.148, -.76), (.148, -.81), (.135, -.81), (.135, -.76)], segments=28,
                    caps=False, mat=1)                                             # violet rim inside
        rings.lathe(x, -.02, [(.0, -.84), (.045, -.84), (.045, -.78), (.0, -.78)], segments=12, caps=False)   # hub
        for k in range(6):                                                          # copper spokes
            a = 2 * math.pi * k / 6
            rings.rod((x + .145 * math.cos(a), -.81, -.02 + .145 * math.sin(a)), (x, -.81, -.02), .009, segments=5)
        sx = 1 if x > 0 else -1
        rings.box(min(.12 * sx, .2 * sx), max(.12 * sx, .2 * sx), -.72, -.6, -.1, .08, bevel=.015)   # collars into the housing
    engines.merge(rings.pitch(-.76, -.02, -28))
    parts['engines'] = engines
    return parts, [(-.25, -0.901, 0.055), (.25, -0.901, 0.055)]


# Spectre 3, Wedge: a pentagonal stealth core with nose guns, a narrow polygonal canopy, broken-delta wings with pale
# root blades and tip edges, four slim drive slots in a wedge cassette.
def spectre_3():
    J = JOINTS['spectre']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    hull.prism([(0, .76), (.1, .5), (.2, .2), (.26, .0), (.28, -.4), (.2, -.62), (-.2, -.62), (-.28, -.4), (-.26, .0), (-.2, .2),
                (-.1, .5)], -.15, .1, chamfer=.04)
    hull.prism([(0, .6), (.07, .35), (.1, .0), (.1, -.5), (-.1, -.5), (-.1, .0), (-.07, .35)], .08, .15, chamfer=.03)  # roof
    for x in (.03, .07):
        hull.rod((x, .45, .02), (x, .86, .02), .01, mirror=True)
    hull.box(.2, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.loft(canopy(-.02, .48, .05, s['z'], s['z'] + .1, .5))
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .3, -.4, .05, -.04, .04)
    delta = Mesh()
    delta.prism([(.24, .05), (.45, -.02), (.75, -.12), (.85, -.18), (.88, -.4), (.75, -.5), (.6, -.42), (.55, -.55), (.42, -.6),
                 (.35, -.45), (.24, -.45)], -.02, .02, chamfer=.006)
    delta.prism([(.3, .15), (.34, .15), (.36, -.12), (.3, -.1)], .0, .1, chamfer=.006)      # pale root blade
    wings.merge(delta.tilt(.24, -7)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.08, .08, -.62, b['y'], -.08, .06)
    engines.prism([(.2, -.58), (.24, -.7), (.2, -.86), (-.2, -.86), (-.24, -.7), (-.2, -.58)], -.14, .1, chamfer=.03)
    for x in (-.15, -.05, .05, .15):
        engines.box(x - .03, x + .03, -.87, -.858, -.1, .07, bevel=.004)          # slot frames
        engines.box(x - .012, x + .012, -.875, -.865, -.08, .05, bevel=0, mat=1)
    parts['engines'] = engines
    return parts, [(x, -.88, -.015) for x in (-.15, -.05, .05, .15)]


# Spectre 4, Veil: an armoured spine with pale dorsal ribs and side guns, a dark teardrop canopy, layered feather wings
# sweeping back and down, one wide oval slit drive.
def spectre_4():
    J = JOINTS['spectre']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    st = lambda y, w, zt, zb: (y, [(0, zb), (w * .7, zb * .6), (w, 0), (w * .7, zt * .7), (0, zt), (-w * .7, zt * .7), (-w, 0),
                                    (-w * .7, zb * .6)])
    hull.loft([st(-.55, .14, .14, -.14), st(-.4, .1, .12, -.12), st(.2, .1, .12, -.12), st(.5, .07, .1, -.08),
               st(.66, .03, .05, -.03), st(.75, .004, .01, -.004)])
    for y in (-.3, -.2, -.1, 0, .1):                                                # dorsal ribs
        hull.box(-.07, .07, y - .015, y + .015, .09, .13, bevel=.006)
    hull.rod((.22, .08, .0), (.22, .45, .0), .012, mirror=True)                     # side guns
    hull.box(.08, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.loft(canopy(.22, .58, .07, s['z'] - .02, s['z'] + .08, .4))
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .26, -.3, .3, -.05, .05)
    fan = Mesh()
    for k, (yr, tip) in enumerate(((.3, (.9, .0)), (.16, (.9, -.24)), (.02, (.84, -.47)), (-.12, (.73, -.68)), (-.26, (.6, -.8)))):
        tx, ty = tip
        fan.prism([(.22, yr), (.22 + (tx - .22) * .6, yr + (ty - yr) * .45 + .05), (tx, ty), (tx - .08, ty - .03),
                   (.22 + (tx - .22) * .55, yr + (ty - yr) * .6 - .14), (.22, yr - .22)], -.01 - k * .014, .012 - k * .014,
                  chamfer=.005)                                                    # overlapping feather plates
    wings.merge(fan.tilt(.22, -14)).mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.08, .08, -.5, b['y'], -.08, .06)
    oval = [(.27 * math.cos(a), .2 * math.sin(a)) for a in (2 * math.pi * k / 16 for k in range(16))]
    engines.loft([(-.45, [(x * .7, z * .7) for x, z in oval]), (-.55, oval), (-.86, oval), (-.9, [(x * .85, z * .85) for x, z in oval])])
    engines.box(-.14, .14, -.905, -.895, -.025, .025, bevel=0, mat=1)               # slit glow
    engines.rod((.33, -.45, .0), (.33, -.82, .0), .01, mirror=True)
    parts['engines'] = engines
    return parts, [(0, -.91, 0)]


# Spectre 5, Orrery: a drum core in concentric collars with a nose spine and guns, a round violet lens, two crescent wing
# halves forming an almost closed ring on side arms, four small drive rings in paired housings.
def spectre_5():
    J = JOINTS['spectre']
    m, s, b = J['wing_mount'], J['seat'], J['bulkhead']
    parts = {}

    hull = Mesh()
    hull.stack(0, -.1, [(.2, -.22), (.28, -.14), (.3, -.02), (.3, .06), (.24, .12), (.12, .14)], segments=28, turn=0)
    hull.stack(0, -.1, [(.31, -.02), (.33, -.0), (.33, .04), (.31, .06)], segments=28, turn=0)    # collar
    st = lambda y, w, zt, zb: (y, section(w, w * .7, w * .7, zb, zb * .5, zt * .5, zt))
    hull.loft([st(b['y'] - .25, .1, .1, -.12), st(-.3, .1, .1, -.12)])
    hull.loft([st(.15, .1, .12, -.1), st(.6, .07, .1, -.06), st(.86, .03, .06, -.03)])
    for x in (.04, .1):
        hull.rod((x, .55, .05), (x, .88 - x, .05), .01, mirror=True)
    hull.box(.25, m['x'], m['y0'], m['y1'], m['z0'], m['z1'], mirror=True)
    parts['hull'] = hull

    cockpit = Mesh()
    cockpit.stack(0, .26, [(.09, 0), (.09, s['z'] + .02), (.085, s['z'] + .05), (.06, s['z'] + .07)], segments=20, turn=0)
    cockpit.stack(0, .26, [(.055, s['z'] + .065), (.04, s['z'] + .085), (.0, s['z'] + .09)], segments=20, turn=0, mat=1)
    parts['cockpit'] = cockpit

    wings = Mesh()
    wings.box(m['x'] - .02, .66, -.17, -.05, -.035, .035, bevel=.01)                # side arm
    # Each half: thick across the arm, tapering to a sharp forward tip and a blunt rear end; a pale raised outer rim.
    outer = [(.3, .63), (.45, .62), (.6, .56), (.72, .46), (.82, .3), (.87, .1), (.88, -.1), (.86, -.32), (.8, -.52), (.7, -.68),
             (.55, -.8), (.38, -.88)]
    inner = [(.36, -.78), (.48, -.66), (.57, -.48), (.62, -.25), (.62, -.05), (.58, .15), (.52, .3), (.44, .42), (.34, .55)]
    wings.prism((outer + inner)[::-1], -.045, .045, chamfer=.012)
    toward = lambda pts, k: [(x * k, -.1 + (y + .1) * k) for x, y in pts]
    wings.prism((outer[1:-1] + toward(outer[1:-1], .93)[::-1])[::-1], .045, .065, chamfer=.006)   # pale outer rim
    for y in (-.13, -.07):                                                          # struts along the arm
        wings.rod((.3, y, .04), (.64, y, .04), .01, segments=6)
    wings.mirror()
    parts['wings'] = wings

    engines = Mesh()
    engines.box(-.08, .08, -.62, b['y'], -.08, .06)
    for x in (-.13, .13):
        engines.box(x - .085, x + .085, -.85, -.55, -.17, .17, bevel=.025)          # paired housing
        for z in (-.085, .085):
            cx, cz, prof = ring(x, z, .045, .065, -.82, -.87, segments=18)
            engines.lathe(cx, cz, prof, segments=18, caps=False)
            engines.disc(x, -.855, z, .045)
    parts['engines'] = engines
    return parts, [(x, -.88, z) for x in (-.13, .13) for z in (-.085, .085)]


DESIGNS = {'spectre-1': spectre_1, 'spectre-2': spectre_2, 'spectre-3': spectre_3, 'spectre-4': spectre_4,
           'spectre-5': spectre_5,
           'interceptor-1': interceptor_1, 'interceptor-2': interceptor_2, 'interceptor-3': interceptor_3,
           'interceptor-4': interceptor_4, 'interceptor-5': interceptor_5,
           'ironclad-1': ironclad_1, 'ironclad-2': ironclad_2, 'ironclad-3': ironclad_3, 'ironclad-4': ironclad_4,
           'ironclad-5': ironclad_5, 'scrapper-1': scrapper_1, 'scrapper-2': scrapper_2, 'scrapper-3': scrapper_3, 'scrapper-4': scrapper_4,
           'scrapper-5': scrapper_5}


def reference(name):
    """The levelled, scaled Tripo parts (hero_tripo), as bake sources."""
    spec = tripo.SPECS[name]
    ob = tripo.load(name, spec)
    src = ob.data.materials[0]
    parts = tripo.split(ob, spec, tripo.dark_uv(tripo.source_images(src)[0]))
    tripo.level(parts, spec)
    tripo.place(parts, name.split('-')[0])
    for slot, o in parts.items():
        o.name = 'ref_' + slot
    return list(parts.values()), src


def unwrap(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.004, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=.004, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake(targets, sources, src_mat, key, reach=(.1, .3)):
    """Bake the reference's base colour, roughness-metal and normal onto the targets' shared UV atlas."""
    sc = bpy.context.scene
    for o in targets + sources:
        o.hide_render = False   # the Tripo previews hid the targets
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 4
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion, sc.render.bake.max_ray_distance = reach
    sc.render.bake.margin = 6
    sc.render.bake.use_clear = False   # each part bakes into its own islands of the shared atlas
    nt = src_mat.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    base_img, rm_img, _ = tripo.source_images(src_mat)
    node_of = {n.image.name: n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image}
    images = {}
    for label in ('base', 'rm', 'normal'):
        images[label] = bpy.data.images.new(f'{key}_{label}', BAKE_SIZE, BAKE_SIZE, alpha=False)
        images[label].colorspace_settings.name = 'sRGB' if label == 'base' else 'Non-Color'
        images[label].generated_color = dict(base=(.12, .12, .12, 1), rm=(0, .6, .5, 1), normal=(.5, .5, 1, 1))[label]
    # The targets' working material: one image node per map; the active one receives each bake.
    mat = bpy.data.materials.new(key + '_bake')
    mat.use_nodes = True
    tnodes = {}
    for label, img in images.items():
        n = mat.node_tree.nodes.new('ShaderNodeTexImage')
        n.image = img
        tnodes[label] = n
    for o in targets:
        o.data.materials.clear()
        o.data.materials.append(mat)
    for label in ('base', 'rm', 'normal'):
        for link in [l for l in nt.links if l.to_socket == bs.inputs['Emission Color']]:
            nt.links.remove(link)
        if label != 'normal':
            nt.links.new(node_of[(base_img if label == 'base' else rm_img).name].outputs['Color'], bs.inputs['Emission Color'])
            bs.inputs['Emission Strength'].default_value = 1
        mat.node_tree.nodes.active = tnodes[label]
        for t in targets:
            bpy.ops.object.select_all(action='DESELECT')
            for s in sources:
                s.select_set(True)
            t.select_set(True)
            bpy.context.view_layer.objects.active = t
            if label == 'normal':
                bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
            else:
                bpy.ops.object.bake(type='EMIT')
    return images


def paint_of(image):
    """The baked base colour's light paint (bright, low saturation) and its rust (warm, saturated) as sRGB hex, for
    HERO_DEFAULT_PAINT: the recolour finds each paint by its colour."""
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    all_rgb = px.reshape(-1, 4)[:, :3]
    rgb = all_rgb[::7]
    rgb = rgb[np.abs(rgb - all_rgb[0]).sum(axis=1) > .02]   # skip the unbaked background (the corner's colour)
    lum = rgb @ np.array([.2126, .7152, .0722])
    sat = rgb.max(axis=1) - rgb.min(axis=1)
    hexof = lambda c: '#%02x%02x%02x' % tuple(int(round(255 * v)) for v in c)   # byte images hold sRGB values
    light = rgb[(lum > np.percentile(lum, 70)) & (sat < .12)]
    rust = rgb[(sat > .12) & (rgb[:, 0] > rgb[:, 2] * 1.6)]
    return dict(primary=hexof(np.median(light, axis=0)) if len(light) else None,
                secondary=hexof(np.median(rust, axis=0)) if len(rust) else None)


def finish_material(key, chassis, images):
    """The runtime material from the baked maps (saved as JPEG), with the glow mask as emission, as hero_tripo."""
    os.makedirs(TEXTURES, exist_ok=True)
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')

    def saved(img, label, colour):
        img.scale(*(2 * (TEXTURE_SIZE[label],)))
        path = os.path.join(TEXTURES, f'{key}_{label}.jpg')
        img.filepath_raw = path
        img.file_format = 'JPEG'
        img.save()
        out = bpy.data.images.load(path, check_existing=False)
        out.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
        out.pack()
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = out
        return n
    nt.links.new(saved(images['base'], 'base', True).outputs['Color'], bs.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(saved(images['rm'], 'rm', False).outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bs.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bs.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(saved(images['normal'], 'normal', False).outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    return mat


def glow_material(chassis):
    mat = bpy.data.materials.new(f'hero_{chassis}_glow')
    mat.use_nodes = True
    bs = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    g = tripo.CHASSIS[chassis]['glow']
    rgb = [int(g[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Emission Color'].default_value = (*rgb, 1)
    bs.inputs['Emission Strength'].default_value = 3
    return mat


def preview(path, objects, view, size=1.9):
    """A lit EEVEE render (normal maps show) from the game's angle, the hangar's three-quarter, or straight above."""
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x = sc.render.resolution_y = 900
    sc.render.film_transparent = False
    if not sc.world:
        sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (.32, .33, .36, 1)
    bg.inputs['Strength'].default_value = .9
    for o in sc.objects:
        if o.type == 'MESH':
            o.hide_render = o not in objects
    if 'key' not in bpy.data.objects:
        for name, rot, energy in (('key', (math.radians(50), 0, math.radians(30)), 4), ('rim', (math.radians(-60), 0, math.radians(200)), 2)):
            light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
            light.data.energy = energy
            light.rotation_euler = rot
            sc.collection.objects.link(light)
    cam = sc.camera
    if not cam:
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        sc.collection.objects.link(cam)
        sc.camera = cam
    cam.data.clip_end = 100
    if view == 'top':
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = size
        cam.location, cam.rotation_euler = (0, 0, 20), (0, 0, 0)
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = 50
        d = Vector((1.3, 1.9, 1.6) if view == 'front' else (-1.5, -2.0, 1.7) if view == 'rear' else (0, -1.1, 2.4))
        cam.location = d.normalized() * size * 2.3
        cam.rotation_euler = (-cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def build(name, args):
    chassis, n = name.split('-')
    design = tripo.DESIGNS[int(n) - 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sources, src_mat = reference(name)
    pieces, sockets = DESIGNS[name]()
    key = f'hero_{chassis}_{design}'
    glow = glow_material(chassis)
    parts = {}
    for slot in tripo.SLOTS:
        o = pieces[slot].object(f'hero_{chassis}_{slot}_{design}')
        parts[slot] = o
    targets = list(parts.values())
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        for view in ('front', 'game', 'top'):
            preview(os.path.join(args.preview_dir, f'{name}-tripo-{view}.png'), sources, view)
    unwrap(targets)
    images = bake(targets, sources, src_mat, key, REACH.get(name, (.1, .3)))
    report_paint = paint_of(images['base'])
    mat = finish_material(key + '_skin', chassis, images)
    for o in targets:
        glowing = [p.index for p in o.data.polygons if p.material_index == 1]
        o.data.materials.clear()
        o.data.materials.append(mat)
        o.data.materials.append(glow)
        for p in o.data.polygons:
            p.material_index = 1 if p.index in glowing else 0
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    report = dict(design=name, paint=report_paint, triangles={s: sum(len(p.vertices) - 2 for p in o.data.polygons) for s, o in parts.items()})
    engines = parts['engines']
    for i, p in enumerate(sockets):
        e = bpy.data.objects.new(f'{engines.name}_engine_{i}', None)
        e.location = p
        bpy.context.scene.collection.objects.link(e)
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        for view in ('front', 'rear', 'game', 'top'):
            preview(os.path.join(args.preview_dir, f'{name}-remodel-{view}.png'), targets, view)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'lookdev', 'hero-remodel', f'{name}.blend'))
    for o in sources:
        bpy.data.objects.remove(o)
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
    print('REMODEL ' + str(report))


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--design', default='scrapper-1')
    ap.add_argument('--preview-dir')
    args = ap.parse_args(argv)
    build(args.design, args)
