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


DESIGNS = {'scrapper-1': scrapper_1, 'scrapper-2': scrapper_2, 'scrapper-3': scrapper_3, 'scrapper-4': scrapper_4,
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


def bake(targets, sources, src_mat, key):
    """Bake the reference's base colour, roughness-metal and normal onto the targets' shared UV atlas."""
    sc = bpy.context.scene
    for o in targets + sources:
        o.hide_render = False   # the Tripo previews hid the targets
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 4
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = .1
    sc.render.bake.max_ray_distance = .3
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
    images = bake(targets, sources, src_mat, key)
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
