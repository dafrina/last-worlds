"""The Umbral fleet: Umbra's enemy craft for Last Worlds (docs/28, the final planet).

After the SHIP CLASSES panel of art/concepts/umbra/02-umbra-faction-and-eclipse.png (INTERCEPTOR, HEAVY FIGHTER, DRONE
CARRIER, ELITE HUNTER, ARTILLERY SHIP, seen from above with their silhouettes) and the DEFENSE TURRET of
art/concepts/umbra/01-umbra-world-and-infrastructure.png. The concepts are references only; all geometry is original.
The user, 24 October: "the alien ships too which should be deep black shiney and smooth surfaced". So: deep black glossy
hulls with smooth curved surfaces (no faceted plates), blade-like swept forms ending in long sharp prongs, violet glowing
cores and thin glowing lines; silhouettes sharp, pointed and clean.

Nodes (design: x right, y forward = toward the player, z up; exported glTF +Y up, noses / muzzles +Z):
    umbra_interceptor  small fast craft: a knife-chined spine, three forward prongs, swept crescent wings, a glowing V
    umbra_fighter      heavy fighter: armoured body, two inner blades with glowing inner edges, two broad scimitar wings
    umbra_hunter       elite hunter: two long mandible blades round a compact body with a glowing eye, inner horns
    umbra_carrier      drone carrier (the big heavy): a broad layered hood with the glowing core, a trailing engine body
                       with long glowing lines, two docked drones
    umbra_artillery    artillery ship: a round heavy body with a large glowing lens, a long barrel spine, claw blades
    umbra_turret       ground battery (base pivot, lowest point y = -0.05): the concept's DEFENSE TURRET, a low glossy saucer
                       with four claw blades, a slender flared stem and a knife-rimmed lens cap with a hot ring (its eye),
                       carrying a barrel spike pointed at the player between two shorter prongs
    umbra_drone        the final boss's launched swarm drone: very small, simple, pointed
Air craft pivot at their mid-plane (y = 0 is the plane of their blades). Socket empties are children of each node:
<node>_engine_N (plume sockets), <node>_muzzle_N, <node>_core (the glowing eye / core centre).

Surfaces: every hull piece is lofted from smooth closed sections that meet at two knife edges, with shared vertices
(smooth normals, so the gloss runs in long clean highlights) and duplicated vertices only along the knife edges and at
the tips (crisp creases). Glowing lines are thin grooves cut into the same surfaces (their own faces, no decals).

Materials (COLOR_0 carries every face's linear colour, as in the Umbra terrain kit, tools/blender/umbra_kit.py):
    umbra_obsidian   (roughness 0.12, metal 0) deep black glass hull; COLOR_0 near-black with a faint lighter
                     violet-grey on the knife edges (brightest toward the tips), AO; vertex alpha 0 = glossy
    umbra_glow       (#7b5cff emissive) thin glowing lines; COLOR_0 = the glow colour, alpha 1
    umbra_glow_hot   (#c9b8ff emissive) eyes, cores and engine slits; COLOR_0 = the hot colour, alpha 1
The runtime craft loader (src/render/models.ts loadCraftNodes) classes materials by name: both glows match /glow/.

Previews (look-dev only; --preview-dir): umbra-craft-top (top-down line-up, noses up as in the concept, soft overhead
studio light), umbra-craft-game (the game camera, 55 degrees from the front, Umbra's light), umbra-craft-runtime (the same
with the current craft loader's material values), umbra-craft-silhouettes (concept columns over our shaded top views and
flat silhouettes; needs --concepts), umbra-craft-insitu (the game's 12-unit portrait view over a plateau and a fogged
canyon), hero-<class> close-ups. RULES checks (budget, footprint, heights, sockets, materials, box UVs) run on export.

    R=/home/davidfarina/Projects/alien-skies
    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\
        --python "$(wslpath -w $R/tools/blender/umbra_craft.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/umbra/umbra-craft.glb)" \\
        --preview-dir "$(wslpath -w $R/lookdev/umbra/craft)" [--concepts "$(wslpath -w $R/art/concepts/umbra)"]
"""

import argparse
import math
import os
import random
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import khepri_kit as kit  # noqa: E402
import vesper_common as vc  # noqa: E402
import nacre_fleet as nf  # noqa: E402
from vesper_common import HS  # noqa: E402

SEED = "umbra-craft-v1"
OBS, GLOW, HOT = 0, 1, 2
MAT_NAMES = ("umbra_obsidian", "umbra_glow", "umbra_glow_hot")
GLOW_HEX, HOT_HEX = "#7b5cff", "#c9b8ff"
TAU = 2.0 * math.pi

# Hull colours (sRGB -> linear). Near-black glass; only the knife edges catch a cold violet-grey.
C = {k: kit.hex_linear(v) for k, v in dict(
    deep="#0a0910", lit="#17141f", edge="#3b3558", edge_hi="#857bb4", bounce="#2a1d66",
    glow=GLOW_HEX, hot=HOT_HEX,
).items()}


def P(x, y, z=0.0):
    return Vector((x, y, z))


def val(v, t, k=0):
    if callable(v):
        return v(t)
    if isinstance(v, (list, tuple)):
        return v[k]
    return v


def vec_at(v, t, k=0):
    """A direction: a vector, a list of vectors (per station) or a callable of t."""
    if callable(v):
        return Vector(v(t))
    if isinstance(v, (list, tuple)) and v and isinstance(v[0], (list, tuple, Vector)):
        return Vector(v[k])
    return Vector(v)


def curve(ctrl, n):
    return nf.bez_pts([Vector(c) for c in ctrl], n)


# ----------------------------------------------------------------------------
# Mesh: HS with a per-vertex edge weight (knife edges and tips are drawn lighter)
# ----------------------------------------------------------------------------

class Mesh(HS):
    def __init__(self, rng=None):
        super().__init__(rng)
        self.vedge = []

    def v(self, p, e=0.0):
        self.vedge.append(float(e))
        return super().v(p)

    def add(self, idx, mat, tag="smooth"):
        """Append a face as wound (no re-orientation); drop repeated corners and degenerate faces."""
        out = []
        for i in idx:
            if out and (out[-1] == i or (Vector(self.verts[out[-1]]) - Vector(self.verts[i])).length < 1e-9):
                continue
            out.append(i)
        while len(out) > 2 and (out[0] == out[-1] or (Vector(self.verts[out[0]]) - Vector(self.verts[out[-1]])).length < 1e-9):
            out.pop()
        if len(out) < 3 or nf.newell([Vector(self.verts[i]) for i in out]).length < 1e-10:
            return
        self.faces.append(tuple(out))
        self.fmat.append(mat)
        self.fpaint.append(MAT_NAMES[mat])
        self.ftag.append(tag)


def append(dst, src, mtx=None):
    base = len(dst.verts)
    flip = mtx is not None and mtx.to_3x3().determinant() < 0
    for v, e in zip(src.verts, src.vedge):
        p = mtx @ Vector(v) if mtx is not None else Vector(v)
        dst.verts.append([p.x, p.y, p.z])
        dst.vedge.append(e)
    for f, mt, pa, tg in zip(src.faces, src.fmat, src.fpaint, src.ftag):
        dst.faces.append(tuple(base + i for i in (reversed(f) if flip else f)))
        dst.fmat.append(mt)
        dst.fpaint.append(pa)
        dst.ftag.append(tg)


MIRROR_X = Matrix.Scale(-1.0, 4, Vector((1.0, 0.0, 0.0)))


def symmetric(m, half):
    append(m, half)
    append(m, half, MIRROR_X)


def place(m, src, loc, rot_z=0.0, scale=1.0):
    append(m, src, Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Scale(scale, 4))


# ----------------------------------------------------------------------------
# Sections: a top and a bottom arc meeting at two knife edges (u = +1 and u = -1)
# ----------------------------------------------------------------------------

def seam(arc, u, hw, spans):
    """A thin glowing groove at section position u (on the top or bottom arc), half-width hw (fraction of the
    half-width), along the loft where spans [(t0, t1, ramp, mat)] say; its ends taper to points over `ramp`."""
    return dict(arc=arc, u=u, hw=hw, spans=spans)


class Section:
    """Closed cross-section of a top arc and a bottom arc meeting at two knife edges (u = +1, u = -1). Height profile
    h = ((1 - x^q) + k x (1 - x))^r with x = |u'|, u' skewed so the crest sits at u = ridge:
      dome    q = 2, k = 0: a smooth rounded crest;
      blade   q = 1, k ~ 0.45, crest=True: a crisp crest crease (its own vertex column) between smooth flanks, hollow-ground
              toward knife edges when r > 1 (sword-like: smooth surfaces, sharp lines).
    r > 1 draws the edges out into thin concave flanges. Seams on the crest keep the crease (their points are creases)."""

    def __init__(self, n=6, nb=None, q=2.0, r=1.0, ridge=0.0, seams=(), k=0.0, crest=False):
        self.q, self.r, self.k, self.ridge, self.seams = q, r, k, ridge, list(seams)
        nb = nb or n
        top = [("top", math.cos(math.pi * j / n), None) for j in range(n + 1)]
        bot = [("bot", math.cos(math.pi + math.pi * j / nb), None) for j in range(1, nb)]
        crest_seam = set()
        for si, sm in enumerate(self.seams):
            arc, uc, hw = sm["arc"], sm["u"], sm["hw"]
            lst = top if arc == "top" else bot
            lst[:] = [e for e in lst if e[2] is not None or abs(e[1]) > 0.999 or abs(e[1] - uc) > hw * 1.5 + 0.03]
            lst += [(arc, uc + hw, (si, 1)), (arc, uc - hw, (si, -1))]
            if crest and arc == "top" and abs(uc - ridge) < 0.02:
                crest_seam.add(si)
        if crest and not crest_seam:
            top[:] = [e for e in top if e[2] is not None or abs(e[1]) > 0.999 or abs(e[1] - ridge) > 0.05]
            top.append(("top", ridge, "crest"))
        top.sort(key=lambda e: -e[1])
        bot.sort(key=lambda e: e[1])
        self.entries = top + bot
        # Crease weights: knife edges 1, the crest line lighter.
        self.sharp = {0: 1.0, len(top) - 1: 1.0}
        self.seam_strip = {}
        for i, e in enumerate(self.entries):
            if e[2] == "crest":
                self.sharp[i] = 0.55
            elif e[2] is not None:
                si, sign = e[2]
                first = 1 if self.seams[si]["arc"] == "top" else -1
                if sign == first:
                    self.seam_strip[i] = si
                if si in crest_seam:
                    self.sharp[i] = 0.55

    def h(self, u):
        c = self.ridge
        x = (u - c) / (1.0 - c) if u >= c else (u - c) / (1.0 + c)
        x = min(1.0, abs(x))
        return max(0.0, (1.0 - x ** self.q) + self.k * x * (1.0 - x)) ** self.r


    def seam_f(self, t):
        """Opening (0..1) and material of every seam at loft parameter t."""
        out = []
        for sm in self.seams:
            f, mat = 0.0, GLOW
            for t0, t1, ramp, mt in sm["spans"]:
                g = kit.clamp(min((t - t0) / max(ramp, 1e-6), (t1 - t) / max(ramp, 1e-6)), 0.0, 1.0) if t0 <= t <= t1 else 0.0
                if g > f:
                    f, mat = g, mt
            out.append((f, mat))
        return out

    def ring(self, c, s, up, top, bot, f):
        """c: centre, s: half-width vector (toward u = +1), up: unit normal of the section plane's crest side."""
        pts = []
        for arc, u, ref in self.entries:
            if isinstance(ref, tuple):
                si, sign = ref
                u = self.seams[si]["u"] + sign * self.seams[si]["hw"] * f[si][0]
            z = top * self.h(u) if arc == "top" else -bot * self.h(u)
            pts.append(c + s * u + up * z)
        return pts

    def strip_mat(self, fs, mat):
        def fn(i, k):
            si = self.seam_strip.get(i)
            if si is None:
                return mat
            a = fs[max(k, 0)][si]
            b = fs[min(k + 1, len(fs) - 1)][si]
            if a[0] > 0.0 or b[0] > 0.0:
                return a[1] if a[0] >= b[0] else b[1]
            return mat
        return fn


def blade_sec(n=5, ridge=0.0, seams=(), k=0.45, r=1.25, nb=None):
    return Section(n=n, nb=nb, q=1.0, r=r, k=k, ridge=ridge, seams=seams, crest=True)


def body_sec(n=6, seams=(), k=0.75, r=1.1, nb=None):
    return Section(n=n, nb=nb, q=1.0, r=r, k=k, ridge=0.0, seams=seams, crest=True)


# ----------------------------------------------------------------------------
# Loft
# ----------------------------------------------------------------------------

def loft(m, rings, sharp, strip_mat, ts=None, start=None, end=None, cap0=False, cap1=False, closed=False, edge=None,
         flip=None):
    """Smooth loft through rings (lists of n points). Points share vertices along and across the loft (smooth normals)
    except the `sharp` section indices (knife edges: one vertex per side). start / end: apex points closing the ends
    (one apex vertex per arc between knife edges); cap0 / cap1: flat caps. strip_mat(i, k) -> material of strip i
    (point i to i+1) between rings k and k+1 (k = -1 / len-1 for the end fans). edge(t) -> edge weight of the knife
    edge vertices at loft parameter t."""
    nr, n = len(rings), len(rings[0])
    sw = dict(sharp) if isinstance(sharp, dict) else {i: 1.0 for i in sharp}
    sharp = sorted(sw)
    ts = ts or [k / max(nr - 1, 1) for k in range(nr)]
    ew = edge or (lambda t: 1.0)
    if flip is None:
        cents = [sum(r, Vector()) / n for r in rings]
        best = max(range(nr), key=lambda k: nf.newell(rings[k]).length)
        if closed:
            tan = cents[(best + 1) % nr] - cents[(best - 1) % nr]
        else:
            nxt = cents[best + 1] if best + 1 < nr else (Vector(end) if end is not None else cents[best])
            prv = cents[best - 1] if best > 0 else (Vector(start) if start is not None else cents[best])
            tan = nxt - prv
        flip = nf.newell(rings[best]).dot(tan) < 0
    V = []
    for k, r in enumerate(rings):
        row = []
        for i, p in enumerate(r):
            if i in sw:
                e = ew(ts[k]) * sw[i]
                row.append((m.v(p, e), m.v(p, e)))
            elif i > 0 and (i - 1) not in sw and (p - r[i - 1]).length < 1e-9:
                row.append(row[-1])
            else:
                idx = m.v(p)
                row.append((idx, idx))
        V.append(row)

    def face(idx, mat, tag="smooth"):
        m.add(tuple(reversed(idx)) if flip else tuple(idx), mat, tag)

    pairs = [(k, k + 1) for k in range(nr - 1)] + ([(nr - 1, 0)] if closed else [])
    for k0, k1 in pairs:
        for i in range(n):
            j = (i + 1) % n
            face((V[k0][i][1], V[k0][j][0], V[k1][j][0], V[k1][i][1]), strip_mat(i, k0))

    def arc_of(i):
        if not sharp:
            return 0
        below = [s for s in sharp if s <= i]
        return below[-1] if below else sharp[-1]

    if end is not None:
        apex = {}
        for i in range(n):
            a = arc_of(i)
            if a not in apex:
                apex[a] = m.v(Vector(end), ew(1.0) if sharp else 0.0)
            face((V[-1][i][1], V[-1][(i + 1) % n][0], apex[a]), strip_mat(i, nr - 1))
    elif cap1:
        face([m.v(p) for p in rings[-1]], strip_mat(-1, nr - 1), "main")
    if start is not None:
        apex = {}
        for i in range(n):
            a = arc_of(i)
            if a not in apex:
                apex[a] = m.v(Vector(start), ew(0.0) if sharp else 0.0)
            face((V[0][(i + 1) % n][0], V[0][i][1], apex[a]), strip_mat(i, -1))
    elif cap0:
        face(list(reversed([m.v(p) for p in rings[0]])), strip_mat(-1, -1), "main")
    return V


def band_frames(A, B, up):
    """Per station: centre, half-width vector (toward A), crest normal (s x tangent, turned toward `up`)."""
    n = len(A)
    cs = [(A[k] + B[k]) * 0.5 for k in range(n)]
    out = []
    for k in range(n):
        s = (A[k] - B[k]) * 0.5
        tan = cs[min(k + 1, n - 1)] - cs[max(k - 1, 0)]
        hint = vec_at(up, k / (n - 1), k)
        nrm = s.cross(tan)
        if nrm.length < 1e-9:
            nrm = hint.copy()
        nrm.normalize()
        if nrm.dot(hint) < 0:
            nrm = -nrm
        if s.length > 1e-9:
            sh = s.normalized()
            nrm = (nrm - sh * nrm.dot(sh)).normalized()
        out.append((cs[k], s, nrm))
    return out


def blade(m, A, B, top, bot, sec, up=(0.0, 0.0, 1.0), mat=OBS, start="cap", end="apex", edge=None):
    """Blade between edge curves A (u = +1) and B (u = -1), sampled root -> tip (same count). start / end: 'apex'
    (both edges meet there), 'cap' or None. top / bot: crest heights (numbers, lists or callables of t)."""
    A = [Vector(p) for p in A]
    B = [Vector(p) for p in B]
    n = len(A)
    fr = band_frames(A, B, up)
    k0 = 1 if start == "apex" else 0
    k1 = n - 1 if end == "apex" else n
    rings, fs, ts = [], [], []
    for k in range(k0, k1):
        t = k / (n - 1)
        c, s, nrm = fr[k]
        f = sec.seam_f(t)
        rings.append(sec.ring(c, s, nrm, val(top, t, k), val(bot, t, k), f))
        fs.append(f)
        ts.append(t)
    return loft(m, rings, sec.sharp, sec.strip_mat(fs, mat), ts=ts, start=(A[0] + B[0]) * 0.5 if start == "apex" else None,
                end=(A[-1] + B[-1]) * 0.5 if end == "apex" else None, cap0=start == "cap", cap1=end == "cap", edge=edge)


def hull(m, stations, sec, nose=None, tail=None, up=(0.0, 0.0, 1.0), mat=OBS, x=0.0, edge=None, cap_tail=True,
         cap_nose=True):
    """Body along +y through stations (y, half-width, top, bottom, z centre), closed by apex points nose / tail
    (or a flat tail cap). Seams use the station parameter t (0 at the tail station, 1 at the nose station)."""
    pts = [P(x, s[0], s[4] if len(s) > 4 else 0.0) for s in stations]
    n = len(pts)
    rings, fs, ts = [], [], []
    upv = Vector(up)
    for k, c in enumerate(pts):
        t = k / (n - 1)
        tan = (pts[min(k + 1, n - 1)] - pts[max(k - 1, 0)]).normalized()
        sh = tan.cross(upv).normalized()
        nrm = sh.cross(tan).normalized()
        f = sec.seam_f(t)
        rings.append(sec.ring(c, sh * stations[k][1], nrm, stations[k][2], stations[k][3], f))
        fs.append(f)
        ts.append(t)
    return loft(m, rings, sec.sharp, sec.strip_mat(fs, mat), ts=ts, start=tail, end=nose,
                cap0=tail is None and cap_tail, cap1=nose is None and cap_nose, edge=edge)


def tube(m, path, w, top, bot, sec, up=(0.0, 0.0, 1.0), mat=OBS, start=None, end=None, cap0=True, cap1=False, edge=None):
    """Like hull, along any path: w / top / bot per point (numbers, lists or callables of t)."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    rings, fs, ts = [], [], []
    for k, c in enumerate(pts):
        t = k / (n - 1)
        tan = (pts[min(k + 1, n - 1)] - pts[max(k - 1, 0)]).normalized()
        upv = vec_at(up, t, k)
        sh = tan.cross(upv).normalized()
        nrm = sh.cross(tan).normalized()
        f = sec.seam_f(t)
        rings.append(sec.ring(c, sh * val(w, t, k), nrm, val(top, t, k), val(bot, t, k), f))
        fs.append(f)
        ts.append(t)
    return loft(m, rings, sec.sharp, sec.strip_mat(fs, mat), ts=ts, start=start, end=end,
                cap0=start is None and cap0, cap1=end is None and cap1, edge=edge)


def revolve(m, prof, seg, mat_fn=None, centre=(0.0, 0.0), rot=0.0, start=None, end=None, cap1=False):
    """Surface of revolution about z through profile points (r, z), traversed so the outside is on the left
    (outward normal (dz, -dr)); smooth along and around. mat_fn(i, k) -> material of angular strip i, profile step k."""
    cx, cy = centre
    rings = [[P(cx + math.cos(rot + TAU * i / seg) * r, cy + math.sin(rot + TAU * i / seg) * r, z) for i in range(seg)]
             for r, z in prof]
    return loft(m, rings, (), mat_fn or (lambda i, k: OBS), start=start, end=end, cap1=cap1, flip=False)


def eye(m, c, nrm, fwd, rx, ry, h, rim_w, rim_h, hot_frac=0.62, seg=16, sink=0.012):
    """A glowing eye: a shallow elliptical dome (a violet outer band round a hot centre) in a raised obsidian rim
    (an eyelid: steep inside, sloping out into the hull). rx along `fwd`, ry across. The base sinks `sink` below c."""
    nrm = Vector(nrm).normalized()
    fx = (Vector(fwd) - nrm * Vector(fwd).dot(nrm)).normalized()
    fy = nrm.cross(fx)
    base = Vector(c) - nrm * sink
    rings = []
    rhos = (1.0, 0.82, hot_frac, 0.42, 0.22)
    for rho in rhos:
        z = h * (1.0 - rho * rho) + sink * 0.6
        rings.append([base + fx * (math.cos(TAU * i / seg) * rx * rho) + fy * (math.sin(TAU * i / seg) * ry * rho) + nrm * z
                      for i in range(seg)])
    # Band k runs from rhos[k] inward to rhos[k + 1] (the last one is the fan to the apex): violet outside hot_frac.
    loft(m, rings, (), lambda i, k: GLOW if k + 1 < len(rhos) and rhos[k + 1] >= hot_frac - 1e-6 else HOT,
         end=base + nrm * (h + sink * 0.6), flip=None)
    # Rim: a closed loft round the eye, its section a wedge from the dome edge out into the hull.
    sec = Section(n=3, nb=2, q=1.6, r=1.6, ridge=-0.55)
    rim = []
    for i in range(seg):
        a = TAU * i / seg
        d = fx * (math.cos(a) * rx) + fy * (math.sin(a) * ry)
        dn = (fx * (math.cos(a) / rx) + fy * (math.sin(a) / ry)).normalized()
        cc = base + d + dn * (rim_w * 0.5) + nrm * sink * 0.4
        rim.append(sec.ring(cc, dn * (rim_w * 0.5), nrm, rim_h + sink, sink * 1.2, sec.seam_f(0.0)))
    loft(m, rim, sec.sharp, lambda i, k: OBS, closed=True, edge=lambda t: 0.55)


def surface_z(m, x, y, z0=2.0):
    """Height of the mesh built so far under (x, y) (design space), by a ray cast straight down."""
    bvh = BVHTree.FromPolygons([Vector(v) for v in m.verts], m.faces, all_triangles=False, epsilon=0.0)
    hit = bvh.ray_cast(Vector((x, y, z0)), Vector((0.0, 0.0, -1.0)), 10.0)
    return hit[0].z if hit[0] is not None else 0.0


def surface_hit(m, origin, direction):
    bvh = BVHTree.FromPolygons([Vector(v) for v in m.verts], m.faces, all_triangles=False, epsilon=0.0)
    loc, nrm, _i, _d = bvh.ray_cast(Vector(origin), Vector(direction).normalized(), 10.0)
    return loc, nrm


def tip_edge(lo=0.55, hi=1.25):
    return lambda t: lo + (hi - lo) * t


# ----------------------------------------------------------------------------
# Edge curves: Catmull-Rom splines through points measured off the concept, resampled by arc length
# ----------------------------------------------------------------------------

def spline(points, n=80):
    pts = [Vector(p) for p in points]
    seg = len(pts) - 1
    out = []
    for k in range(n):
        u = k / (n - 1) * seg
        i = min(int(u), seg - 1)
        t = u - i
        p1, p2 = pts[i], pts[i + 1]
        p0 = pts[i - 1] if i > 0 else p1 * 2 - p2
        p3 = pts[i + 2] if i + 2 <= seg else p2 * 2 - p1
        out.append(0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * (t * t)
                          + (3 * p1 - p0 - 3 * p2 + p3) * (t * t * t)))
    return out


def resample(pts, n):
    d = [0.0]
    for a, b in zip(pts, pts[1:]):
        d.append(d[-1] + (b - a).length)
    out, j = [], 0
    for k in range(n):
        s_ = d[-1] * k / (n - 1)
        while j < len(d) - 2 and d[j + 1] < s_:
            j += 1
        t = (s_ - d[j]) / max(d[j + 1] - d[j], 1e-12)
        out.append(pts[j].lerp(pts[j + 1], min(max(t, 0.0), 1.0)))
    return out


def E(points, n):
    """Edge curve through (x, y, z) points (design space), n samples evenly spaced along it."""
    return resample(spline([P(*p) for p in points]), n)


def EK(segments, n):
    """Edge curve through several spline segments that meet at sharp corners (each corner kept as a sample)."""
    curves = [spline([P(*p) for p in seg], 60) for seg in segments]
    lens = [sum((b - a).length for a, b in zip(c, c[1:])) for c in curves]
    total = sum(lens)
    counts = [max(2, round((n - 1) * L / total)) for L in lens]
    counts[-1] = (n - 1) - sum(counts[:-1])
    out = []
    for c, k in zip(curves, counts):
        pts = resample(c, k + 1)
        out += pts if not out else pts[1:]
    return out


def lens_t(peak, base=0.002, power=0.7, at=0.5):
    """Crest height along a blade with points at both ends, thickest at t = `at`."""
    g = math.log(0.5) / math.log(at)
    return lambda t: peak * math.sin(math.pi * max(t, 0.0) ** g) ** power + base


def taper(peak, power=0.75, base=0.003):
    """Crest height along a blade from its root to a point."""
    return lambda t: peak * (1.0 - t) ** power + base


# ----------------------------------------------------------------------------
# umbra_interceptor
# ----------------------------------------------------------------------------

def build_interceptor(rng):
    m = Mesh(rng)
    # Spine: a knife-chined lens body; a glowing line runs up the spine into the long centre prong, and two hot lines
    # converge on the tail (the concept's glowing V).
    sec = body_sec(n=6, r=1.3, seams=[seam("top", 0.0, 0.18, [(0.48, 0.97, 0.12, GLOW)]),
                                            seam("top", 0.56, 0.14, [(0.0, 0.4, 0.16, HOT)]),
                                            seam("top", -0.56, 0.14, [(0.0, 0.4, 0.16, HOT)])])
    st = [(-0.5, 0.045, 0.024, 0.016), (-0.4, 0.075, 0.05, 0.03), (-0.26, 0.095, 0.07, 0.04), (-0.08, 0.102, 0.08, 0.045),
          (0.1, 0.092, 0.076, 0.042), (0.26, 0.07, 0.062, 0.034), (0.4, 0.046, 0.046, 0.025), (0.5, 0.028, 0.03, 0.016)]
    hull(m, st, sec, nose=P(0.0, 0.64, 0.006), tail=P(0.0, -0.62, 0.0), edge=lambda t: 0.75)
    half = Mesh(rng)
    # Two side prongs flanking the nose (with the spine's own point, the three forward prongs).
    psec = blade_sec(n=4, r=1.15)
    blade(half, E([(0.105, 0.0, 0.004), (0.125, 0.22, 0.008), (0.1, 0.5, 0.004)], 9),
          E([(0.05, 0.06, 0.008), (0.078, 0.26, 0.01), (0.1, 0.5, 0.004)], 9),
          taper(0.045, 0.7), taper(0.02, 1.0, 0.002), psec, edge=tip_edge(0.6, 1.2))
    # Swept crescent wings, crest toward the leading edge, tips drooping a little.
    wsec = blade_sec(n=5, r=1.2, ridge=0.3)
    blade(half, E([(0.07, 0.2, 0.01), (0.17, 0.16, 0.004), (0.27, 0.07, -0.01), (0.33, -0.03, -0.025), (0.37, -0.16, -0.045)], 12),
          E([(0.07, -0.13, 0.0), (0.2, -0.1, -0.008), (0.3, -0.11, -0.022), (0.37, -0.16, -0.045)], 12),
          taper(0.05, 0.8), taper(0.018, 1.0, 0.002), wsec, edge=tip_edge(0.55, 1.3))
    # Short tail prongs either side of the glowing V.
    rsec = blade_sec(n=4, r=1.1)
    blade(half, E([(0.095, -0.16, 0.0), (0.125, -0.3, -0.004), (0.125, -0.46, -0.012)], 8),
          E([(0.05, -0.22, 0.004), (0.085, -0.33, 0.0), (0.125, -0.46, -0.012)], 8),
          taper(0.035, 1.0), taper(0.015, 1.0, 0.002), rsec, edge=tip_edge(0.6, 1.2))
    symmetric(m, half)
    return m


def interceptor_sockets():
    return {"umbra_interceptor_muzzle_0": (0.0, 0.006, 0.64),
            "umbra_interceptor_engine_0": (-0.045, 0.0, -0.5), "umbra_interceptor_engine_1": (0.045, 0.0, -0.5)}


# ----------------------------------------------------------------------------
# umbra_fighter
# ----------------------------------------------------------------------------

def build_fighter(rng):
    m = Mesh(rng)
    # Armoured body: a broad domed lens, a hot engine slit at the rear.
    sec = body_sec(n=7, r=1.25, seams=[seam("top", 0.0, 0.14, [(0.06, 0.4, 0.12, HOT)])])
    st = [(-0.56, 0.05, 0.035, 0.02), (-0.45, 0.1, 0.08, 0.04), (-0.28, 0.13, 0.115, 0.055), (-0.08, 0.135, 0.13, 0.06),
          (0.1, 0.115, 0.12, 0.055), (0.24, 0.075, 0.09, 0.04), (0.33, 0.04, 0.055, 0.025)]
    hull(m, st, sec, nose=P(0.0, 0.43, 0.01), tail=P(0.0, -0.66, 0.0), edge=lambda t: 0.75)
    half = Mesh(rng)
    # Inner blades: long forward spikes beside the body, glowing along their inner edges.
    isec = blade_sec(n=5, r=1.2, ridge=0.25, seams=[seam("top", -0.52, 0.22, [(0.06, 0.86, 0.12, GLOW)])])
    blade(half, E([(0.205, -0.36, 0.03), (0.228, -0.05, 0.05), (0.205, 0.35, 0.06), (0.136, 0.74, 0.04)], 13),
          E([(0.1, -0.32, 0.03), (0.14, -0.05, 0.05), (0.15, 0.35, 0.06), (0.136, 0.74, 0.04)], 13),
          taper(0.055, 0.7), taper(0.025, 1.0, 0.002), isec, edge=tip_edge(0.6, 1.25))
    # Broad scimitar wings (the concept's armoured outer blades): widest over the rear half, a spike at the rear outer
    # corner and a long point forward beside the inner blade; the outer edge lower (they arch over); a short glowing
    # line on the inner edge of the rear half.
    osec = blade_sec(n=6, r=1.35, k=0.25, ridge=0.35, seams=[seam("top", -0.6, 0.16, [(0.14, 0.42, 0.1, GLOW)])])
    A = EK([[(0.72, -0.8, -0.06), (0.715, -0.6, -0.05), (0.7, -0.42, -0.045)],
            [(0.7, -0.42, -0.045), (0.62, -0.15, -0.035), (0.53, 0.11, -0.025), (0.42, 0.38, -0.016), (0.29, 0.64, -0.01)]], 17)
    B = EK([[(0.72, -0.8, -0.06), (0.57, -0.62, -0.012), (0.44, -0.44, 0.012)],
            [(0.44, -0.44, 0.012), (0.36, -0.2, 0.02), (0.3, 0.05, 0.02), (0.26, 0.3, 0.015), (0.25, 0.48, 0.008),
             (0.29, 0.64, -0.01)]], 17)
    blade(half, A, B, lens_t(0.046, power=0.55, at=0.4), lens_t(0.022, at=0.4), osec, start="apex", end="apex",
          edge=lambda t: 0.7 + 0.6 * abs(2 * t - 1))
    # Armour plate under the inner blade, from the body flank into the wing, its front edge swept back.
    wsec = blade_sec(n=4, r=1.2)
    blade(half, E([(0.06, 0.22, 0.0), (0.2, 0.15, -0.002), (0.36, 0.03, -0.008)], 6),
          E([(0.06, -0.42, 0.0), (0.25, -0.4, -0.004), (0.45, -0.36, -0.012)], 6), lambda t: 0.045 - 0.025 * t, 0.02, wsec,
          start="cap", end="cap")
    # Rear prongs, glowing on their inner edges.
    rsec = blade_sec(n=4, r=1.1, seams=[seam("top", -0.5, 0.2, [(0.0, 0.7, 0.15, GLOW)])])
    blade(half, E([(0.1, -0.42, 0.0), (0.125, -0.56, -0.005), (0.1, -0.75, -0.015)], 8),
          E([(0.05, -0.46, 0.005), (0.072, -0.58, 0.0), (0.1, -0.75, -0.015)], 8),
          taper(0.035, 1.0), taper(0.016, 1.0, 0.002), rsec, edge=tip_edge(0.6, 1.2))
    symmetric(m, half)
    return m


def fighter_sockets():
    return {"umbra_fighter_muzzle_0": (-0.136, 0.04, 0.74), "umbra_fighter_muzzle_1": (0.136, 0.04, 0.74),
            "umbra_fighter_engine_0": (-0.05, 0.0, -0.56), "umbra_fighter_engine_1": (0.05, 0.0, -0.56)}


# ----------------------------------------------------------------------------
# umbra_hunter
# ----------------------------------------------------------------------------

def build_hunter(rng):
    m = Mesh(rng)
    # Compact body, its nose the beam emitter, a glowing eye on its brow.
    sec = body_sec(n=6, r=1.2)
    st = [(-0.52, 0.05, 0.035, 0.02), (-0.42, 0.1, 0.08, 0.04), (-0.26, 0.13, 0.11, 0.05), (-0.06, 0.14, 0.125, 0.055),
          (0.12, 0.12, 0.115, 0.05), (0.26, 0.08, 0.085, 0.036), (0.34, 0.045, 0.05, 0.022)]
    hull(m, st, sec, nose=P(0.0, 0.45, 0.006), tail=P(0.0, -0.6, 0.0), edge=lambda t: 0.75)
    z = surface_z(m, 0.0, 0.14)
    eye(m, P(0.0, 0.14, z), (0.0, 0.2, 1.0), (0.0, 1.0, 0.0), 0.095, 0.04, 0.018, 0.032, 0.024)
    half = Mesh(rng)
    # Mandibles: long blades from a rear point, bowed outward, closing to long sharp tips in front; glowing inner edges.
    msec = blade_sec(n=6, r=1.3, ridge=0.25, seams=[seam("top", -0.58, 0.2, [(0.3, 0.9, 0.12, GLOW)])])
    A = E([(0.306, -0.782, -0.04), (0.408, -0.578, -0.03), (0.493, -0.374, -0.02), (0.515, -0.17, -0.015), (0.465, 0.034, -0.01),
           (0.365, 0.272, 0.0), (0.228, 0.544, 0.01), (0.092, 0.79, 0.015)], 19)
    B = E([(0.306, -0.782, -0.04), (0.33, -0.46, 0.0), (0.35, -0.204, 0.02), (0.33, 0.034, 0.025), (0.25, 0.272, 0.025),
           (0.145, 0.578, 0.02), (0.092, 0.79, 0.015)], 19)
    blade(half, A, B, lens_t(0.056, power=0.6), lens_t(0.024), msec, start="apex", end="apex",
          edge=lambda t: 0.6 + 0.65 * abs(2 * t - 1))
    # Inner horns curling forward-outward from the shoulders.
    hsec = blade_sec(n=4, r=1.2)
    blade(half, E([(0.15, -0.04, 0.03), (0.25, 0.1, 0.04), (0.29, 0.27, 0.045), (0.255, 0.45, 0.04)], 10),
          E([(0.08, 0.08, 0.04), (0.16, 0.17, 0.05), (0.22, 0.3, 0.05), (0.255, 0.45, 0.04)], 10),
          taper(0.045, 0.7), taper(0.02, 1.0, 0.002), hsec, edge=tip_edge(0.6, 1.25))
    # Rear yoke joining the body to each mandible (the pincers stand free in front of it), its front edge swept back.
    wsec = blade_sec(n=4, r=1.2)
    blade(half, E([(0.07, -0.26, 0.0), (0.2, -0.35, -0.002), (0.355, -0.44, -0.006)], 6),
          E([(0.07, -0.5, 0.0), (0.2, -0.56, -0.002), (0.33, -0.6, -0.006)], 6), lambda t: 0.045 - 0.022 * t, 0.02, wsec,
          start="cap", end="cap")
    # Rear legs, glowing on their inner edges.
    rsec = blade_sec(n=4, r=1.1, seams=[seam("top", -0.5, 0.2, [(0.0, 0.7, 0.15, GLOW)])])
    blade(half, E([(0.09, -0.38, 0.0), (0.115, -0.52, -0.005), (0.1, -0.7, -0.012)], 8),
          E([(0.04, -0.42, 0.005), (0.065, -0.54, 0.0), (0.1, -0.7, -0.012)], 8),
          taper(0.034, 1.0), taper(0.015, 1.0, 0.002), rsec, edge=tip_edge(0.6, 1.2))
    symmetric(m, half)
    return m


def hunter_sockets():
    return {"umbra_hunter_muzzle_0": (0.0, 0.006, 0.45), "umbra_hunter_core": (0.0, 0.12, 0.14),
            "umbra_hunter_engine_0": (-0.045, 0.0, -0.5), "umbra_hunter_engine_1": (0.045, 0.0, -0.5)}


# ----------------------------------------------------------------------------
# umbra_drone (also docked on the carrier)
# ----------------------------------------------------------------------------

def build_drone(rng):
    m = Mesh(rng)
    sec = body_sec(n=5, r=1.25, seams=[seam("top", 0.0, 0.22, [(0.42, 0.95, 0.12, GLOW), (0.0, 0.3, 0.12, HOT)])])
    st = [(-0.24, 0.035, 0.022, 0.014), (-0.14, 0.058, 0.045, 0.025), (0.0, 0.064, 0.052, 0.028), (0.12, 0.05, 0.046, 0.024),
          (0.22, 0.028, 0.028, 0.015)]
    hull(m, st, sec, nose=P(0.0, 0.31, 0.004), tail=P(0.0, -0.31, 0.0), edge=lambda t: 0.8)
    half = Mesh(rng)
    wsec = blade_sec(n=4, r=1.2, ridge=0.3)
    blade(half, E([(0.04, 0.15, 0.006), (0.14, 0.11, 0.0), (0.21, 0.01, -0.012), (0.25, -0.18, -0.028)], 10),
          E([(0.04, -0.1, 0.0), (0.12, -0.08, -0.005), (0.2, -0.1, -0.015), (0.25, -0.18, -0.028)], 10),
          taper(0.032, 0.8), taper(0.013, 1.0, 0.002), wsec, edge=tip_edge(0.6, 1.3))
    symmetric(m, half)
    return m


def drone_sockets():
    return {"umbra_drone_muzzle_0": (0.0, 0.004, 0.31), "umbra_drone_engine_0": (0.0, 0.0, -0.27)}


# ----------------------------------------------------------------------------
# umbra_carrier
# ----------------------------------------------------------------------------

def mirrored(right):
    """Points across x = 0 from the right half (centre -> tip): left tip -> centre -> right tip."""
    left = [(-p[0], p[1], p[2]) for p in reversed(right)]
    return left + list(right[1:])


def halves(right):
    """Two spline segments meeting in a sharp point on x = 0 (left tip -> centre, centre -> right tip)."""
    left = [(-p[0], p[1], p[2]) for p in reversed(right)]
    return [left, list(right)]


def centre_crest(n, peak, power=1.6, base=0.003):
    nh = (n - 1) / 2
    return [peak * (1 - (abs(k - nh) / nh) ** power) ** 0.9 + base for k in range(n)]


def build_carrier(rng):
    m = Mesh(rng)
    # Trailing engine body under the hood, three long glowing engine lines, a pointed tail.
    bsec = body_sec(n=6, r=1.2, seams=[seam("top", 0.0, 0.1, [(0.04, 0.8, 0.16, GLOW)]),
                                             seam("top", 0.5, 0.09, [(0.08, 0.72, 0.16, GLOW)]),
                                             seam("top", -0.5, 0.09, [(0.08, 0.72, 0.16, GLOW)])])
    st = [(-0.76, 0.05, 0.035, 0.03), (-0.62, 0.115, 0.075, 0.055), (-0.4, 0.155, 0.1, 0.07), (-0.14, 0.17, 0.115, 0.08),
          (0.1, 0.16, 0.12, 0.08), (0.3, 0.12, 0.11, 0.065)]
    hull(m, st, bsec, tail=P(0.0, -0.88, 0.0), nose=None)
    # Main hood: a broad crescent arched over the body, its tips swept back; a glowing line follows its leading edge
    # either side of the crown, where the core sits.
    hsec = blade_sec(n=6, r=1.35, ridge=0.15, seams=[seam("top", 0.6, 0.13, [(0.1, 0.38, 0.08, GLOW), (0.62, 0.9, 0.08, GLOW)])])
    A = EK(halves([(0.0, 0.66, 0.06), (0.3, 0.47, 0.045), (0.55, 0.27, 0.015), (0.71, 0.07, -0.025), (0.8, -0.13, -0.07)]), 17)
    B = E(mirrored([(0.0, 0.0, 0.06), (0.22, 0.05, 0.05), (0.45, 0.06, 0.02), (0.64, 0.0, -0.02), (0.8, -0.13, -0.07)]), 17)
    th = centre_crest(len(A), 0.09)
    blade(m, A, B, th, [x * 0.45 for x in th], hsec, start="apex", end="apex", edge=lambda t: 0.6 + 0.6 * abs(2 * t - 1))
    # Upper hood: a smaller crescent layered over the front.
    usec = blade_sec(n=5, r=1.3, ridge=0.2)
    A = EK(halves([(0.0, 0.9, 0.13), (0.18, 0.71, 0.12), (0.33, 0.54, 0.095), (0.48, 0.34, 0.06)]), 13)
    B = E(mirrored([(0.0, 0.36, 0.15), (0.16, 0.41, 0.14), (0.32, 0.43, 0.105), (0.48, 0.34, 0.06)]), 13)
    th = centre_crest(len(A), 0.07)
    blade(m, A, B, th, [x * 0.5 for x in th], usec, start="apex", end="apex", edge=lambda t: 0.6 + 0.6 * abs(2 * t - 1))
    # Nose spike rising out of the hoods.
    nsec = blade_sec(n=4, r=1.2)
    tube(m, [P(0.0, 0.5, 0.12), P(0.0, 0.7, 0.16), P(0.0, 0.86, 0.15)], [0.05, 0.04, 0.022], [0.06, 0.05, 0.03],
         [0.03, 0.025, 0.015], nsec, end=P(0.0, 0.97, 0.13), cap0=True, edge=lambda t: 0.6 + 0.6 * t)
    # The core.
    z = surface_z(m, 0.0, 0.22)
    eye(m, P(0.0, 0.22, z), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.12, 0.12, 0.05, 0.05, 0.035, hot_frac=0.6, seg=16)
    half = Mesh(rng)
    # Two docked drones under the hood's wings, on short pylons.
    place(half, build_drone(random.Random(f"{SEED}:docked")), (0.42, -0.4, -0.04), 0.0, 1.0)
    psec = blade_sec(n=3, r=1.0)
    blade(half, [P(0.12, -0.48, -0.02), P(0.26, -0.48, -0.03), P(0.4, -0.48, -0.04)],
          [P(0.12, -0.28, -0.02), P(0.26, -0.3, -0.03), P(0.4, -0.32, -0.04)], 0.022, 0.018, psec, start="cap", end="cap")
    # Rear prongs.
    rsec = blade_sec(n=4, r=1.1)
    blade(half, E([(0.15, -0.58, 0.0), (0.19, -0.74, -0.01), (0.2, -0.9, -0.02)], 8),
          E([(0.08, -0.64, 0.005), (0.125, -0.77, 0.0), (0.2, -0.9, -0.02)], 8),
          taper(0.04, 1.0), taper(0.018, 1.0, 0.002), rsec, edge=tip_edge(0.6, 1.2))
    symmetric(m, half)
    return m


def carrier_sockets():
    return {"umbra_carrier_core": (0.0, 0.1, 0.22), "umbra_carrier_muzzle_0": (0.0, 0.13, 0.97),
            "umbra_carrier_bay_0": (-0.42, -0.04, -0.4), "umbra_carrier_bay_1": (0.42, -0.04, -0.4),
            "umbra_carrier_engine_0": (-0.08, 0.0, -0.72), "umbra_carrier_engine_1": (0.0, 0.0, -0.8),
            "umbra_carrier_engine_2": (0.08, 0.0, -0.72)}


# ----------------------------------------------------------------------------
# umbra_artillery
# ----------------------------------------------------------------------------

def build_artillery(rng):
    m = Mesh(rng)
    # Round heavy body with a knife chine, glowing side lines; the tail closes on a hot V.
    sec = body_sec(n=8, r=1.05, k=0.85, seams=[seam("top", 0.62, 0.09, [(0.22, 0.75, 0.14, GLOW)]),
                                            seam("top", -0.62, 0.09, [(0.22, 0.75, 0.14, GLOW)]),
                                            seam("top", 0.0, 0.12, [(0.0, 0.24, 0.1, HOT)])])
    st = [(-0.66, 0.07, 0.05, 0.03), (-0.56, 0.17, 0.11, 0.065), (-0.4, 0.26, 0.17, 0.09), (-0.18, 0.31, 0.2, 0.105),
          (0.04, 0.3, 0.195, 0.105), (0.24, 0.23, 0.16, 0.085), (0.4, 0.13, 0.115, 0.055)]
    hull(m, st, sec, tail=P(0.0, -0.8, 0.0), nose=None, edge=lambda t: 0.8)
    # Barrel spine: a long tapering prong forward, a glowing line along its crest.
    bsec = blade_sec(n=5, r=1.15, seams=[seam("top", 0.0, 0.22, [(0.05, 0.95, 0.12, GLOW)])])
    tube(m, [P(0.0, 0.3, 0.07), P(0.0, 0.5, 0.065), P(0.0, 0.66, 0.05), P(0.0, 0.78, 0.035)],
         [0.095, 0.075, 0.055, 0.03], [0.08, 0.065, 0.048, 0.03], [0.05, 0.04, 0.03, 0.016], bsec,
         end=P(0.0, 0.88, 0.02), cap0=True, edge=lambda t: 0.6 + 0.6 * t)
    # The lens.
    z = surface_z(m, 0.0, -0.08)
    eye(m, P(0.0, -0.08, z), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.13, 0.13, 0.055, 0.055, 0.04, hot_frac=0.58, seg=20)
    half = Mesh(rng)
    # Claws: from the shoulders out and back to sharp tips beside the tail.
    csec = blade_sec(n=6, r=1.3, ridge=0.25, seams=[seam("top", -0.58, 0.16, [(0.35, 0.82, 0.12, GLOW)])])
    blade(half, E([(0.12, 0.3, 0.03), (0.42, 0.27, 0.025), (0.6, 0.1, 0.01), (0.68, -0.15, -0.01), (0.64, -0.42, -0.03),
                   (0.5, -0.74, -0.05)], 17),
          E([(0.14, 0.06, 0.03), (0.36, -0.02, 0.025), (0.45, -0.22, 0.01), (0.5, -0.45, -0.02), (0.5, -0.74, -0.05)], 17),
          taper(0.058, 0.7), taper(0.024, 1.0, 0.002), csec, edge=tip_edge(0.6, 1.3))
    # Hooked fins behind the barrel root.
    fsec = blade_sec(n=4, r=1.2, ridge=0.2)
    blade(half, E([(0.06, 0.54, 0.07), (0.24, 0.53, 0.06), (0.38, 0.45, 0.035), (0.48, 0.27, 0.01)], 10),
          E([(0.08, 0.38, 0.09), (0.22, 0.41, 0.07), (0.35, 0.38, 0.045), (0.48, 0.27, 0.01)], 10),
          taper(0.045, 0.8), taper(0.02, 1.0, 0.002), fsec, edge=tip_edge(0.6, 1.25))
    # Tail prongs.
    rsec = blade_sec(n=4, r=1.1)
    blade(half, E([(0.12, -0.52, 0.0), (0.16, -0.66, -0.005), (0.15, -0.84, -0.015)], 8),
          E([(0.06, -0.58, 0.005), (0.1, -0.7, 0.0), (0.15, -0.84, -0.015)], 8),
          taper(0.036, 1.0), taper(0.016, 1.0, 0.002), rsec, edge=tip_edge(0.6, 1.2))
    symmetric(m, half)
    return m


def artillery_sockets():
    return {"umbra_artillery_muzzle_0": (0.0, 0.02, 0.88), "umbra_artillery_core": (0.0, 0.21, -0.08),
            "umbra_artillery_engine_0": (-0.06, 0.0, -0.66), "umbra_artillery_engine_1": (0.06, 0.0, -0.66)}


# ----------------------------------------------------------------------------
# umbra_turret (ground battery, base pivot)
# ----------------------------------------------------------------------------

TURRET_HEAD_Z = 0.56


def build_turret(rng):
    m = Mesh(rng)
    base_z = -0.05
    seg = 28
    rot = -TAU / seg / 2.0      # angular strip i is centred on TAU * i / seg (strip 7 faces the player, +y)

    def arcs(i):
        # Glowing arcs between the claws (claws on the diagonals).
        a = (math.degrees(TAU * i / seg) + 360.0) % 360.0
        return any(abs(((a - c + 180.0) % 360.0) - 180.0) <= 22.0 for c in (0.0, 90.0, 180.0, 270.0))

    # A low glossy saucer with a knife rim (the concept's DEFENSE TURRET), flaring up into a slender stem.
    revolve(m, [(0.32, base_z), (0.44, -0.016)], seg, rot=rot, start=P(0.0, 0.0, base_z))
    prof = [(0.44, -0.016), (0.38, 0.008), (0.3, 0.028), (0.272, 0.035), (0.258, 0.039), (0.2, 0.052), (0.13, 0.08),
            (0.088, 0.13), (0.068, 0.2), (0.058, 0.28), (0.056, 0.36), (0.06, 0.42), (0.07, 0.47), (0.075, 0.5)]

    def mat(i, k):
        if k == 3 and arcs(i):
            return GLOW
        if 7 <= k <= 11 and i == seg // 4:
            return GLOW
        return OBS
    revolve(m, prof, seg, mat, end=P(0.0, 0.0, 0.5), rot=rot)
    # Four claw blades gripping the ground on the diagonals, reaching past the rim.
    claw = Mesh(rng)
    blade(claw, E([(0.16, 0.07, 0.07), (0.34, 0.08, 0.045), (0.5, 0.04, 0.0), (0.64, -0.08, -0.04)], 10),
          E([(0.16, -0.07, 0.07), (0.32, -0.05, 0.045), (0.48, -0.05, 0.0), (0.64, -0.08, -0.04)], 10),
          taper(0.045, 0.8), taper(0.02, 1.0, 0.002), blade_sec(n=4, ridge=0.15), edge=tip_edge(0.6, 1.25))
    for k in range(4):
        append(m, claw, Matrix.Rotation(math.radians(45 + 90 * k), 4, "Z"))
    # Head: the concept's lens cap, a knife-rimmed glossy disc with a hot ring, carrying a long barrel spike pointed
    # at the player between two shorter prongs (the fleet's three-prong signature).
    hz = TURRET_HEAD_Z
    hseg = 24

    def head_mat(i, k):
        return HOT if k == 2 else OBS
    revolve(m, [(0.06, hz - 0.075), (0.15, hz - 0.035), (0.21, hz)], hseg, rot=rot, start=P(0.0, 0.0, hz - 0.085))
    revolve(m, [(0.21, hz), (0.165, hz + 0.034), (0.128, hz + 0.052), (0.112, hz + 0.058), (0.07, hz + 0.072)], hseg, head_mat,
            rot=rot, end=P(0.0, 0.0, hz + 0.08))
    bsec = blade_sec(n=4, seams=[seam("top", 0.0, 0.24, [(0.15, 0.9, 0.12, GLOW)])], k=0.6, r=1.15)
    tube(m, [P(0.0, 0.02, hz + 0.03), P(0.0, 0.18, hz + 0.028), P(0.0, 0.32, hz + 0.02), P(0.0, 0.42, hz + 0.012)],
         [0.05, 0.04, 0.028, 0.016], [0.04, 0.035, 0.026, 0.016], [0.03, 0.026, 0.02, 0.012], bsec, end=P(0.0, 0.52, hz + 0.006),
         cap0=True, edge=lambda t: 0.6 + 0.6 * t)
    half = Mesh(rng)
    blade(half, E([(0.13, 0.04, hz + 0.004), (0.14, 0.2, hz + 0.004), (0.1, 0.38, hz)], 9),
          E([(0.07, 0.1, hz + 0.02), (0.085, 0.24, hz + 0.012), (0.1, 0.38, hz)], 9),
          taper(0.03, 0.8), taper(0.016, 1.0, 0.002), blade_sec(n=4), edge=tip_edge(0.6, 1.25))
    symmetric(m, half)
    return m


def turret_sockets():
    return {"umbra_turret_muzzle_0": (0.0, TURRET_HEAD_Z + 0.006, 0.52), "umbra_turret_core": (0.0, TURRET_HEAD_Z + 0.06, 0.0)}


# ----------------------------------------------------------------------------
# Bake
# ----------------------------------------------------------------------------

AO_DIRS = kit.hemisphere_dirs(40)


def bake(m, name, ground=None, ao_dist=0.25):
    """Per-corner linear RGBA (Blender space). Obsidian: near-black, a touch lifted where it faces up, its knife edges
    a faint lighter violet-grey (edge_hi toward the tips), AO, a violet bounce next to glows; alpha 0 (glossy).
    Glow faces: their own colour, alpha 1."""
    verts = [Vector(v) for v in m.verts]
    bvh = BVHTree.FromPolygons(verts, m.faces, all_triangles=False, epsilon=0.0)
    fn = [kit.face_normal(m.verts, f) for f in m.faces]
    vn = [Vector((0.0, 0.0, 0.0)) for _ in verts]
    for f, n in zip(m.faces, fn):
        for i in f:
            vn[i] += n
    sources = []
    for f, mt in zip(m.faces, m.fmat):
        if mt != OBS:
            pts = [verts[i] for i in f]
            c = sum(pts, Vector()) / len(pts)
            area = (pts[1] - pts[0]).cross(pts[2] - pts[0]).length * 0.5
            sources.append((c, min(area * 900.0, 1.0) * (1.4 if mt == HOT else 1.0)))

    def bounce(p):
        b = 0.0
        for c, w in sources:
            d = (p - c).length
            if d < 0.09:
                b += w * (1.0 - d / 0.09) ** 2
        return kit.clamp(b, 0.0, 1.0)

    out = []
    for fi, f in enumerate(m.faces):
        mt = m.fmat[fi]
        if mt != OBS:
            c = C["glow"] if mt == GLOW else C["hot"]
            out += [(c[0], c[1], c[2], 1.0)] * len(f)
            continue
        smooth = m.ftag[fi] == "smooth"
        cen = sum((verts[i] for i in f), Vector()) / len(f)
        for i in f:
            p = verts[i]
            n = vn[i].normalized() if smooth and vn[i].length > 1e-9 else fn[fi]
            sample = p + (cen - p) * 0.1 + n * 0.0015
            t1 = n.orthogonal().normalized()
            t2 = n.cross(t1)
            hits = 0
            for dx, dy, dz in AO_DIRS:
                d = t1 * dx + t2 * dy + n * dz
                if ground is not None and d.z < -1e-6 and (ground - sample.z) / d.z < ao_dist:
                    hits += 1
                    continue
                if bvh.ray_cast(sample, d, ao_dist)[0] is not None:
                    hits += 1
            ao = 1.0 - hits / len(AO_DIRS)
            e = m.vedge[i]
            col = kit.mix3(C["deep"], C["lit"], 0.35 + 0.65 * kit.smoothstep(0.1, 0.95, n.z))
            if e > 0.0:
                col = kit.mix3(col, C["edge"], min(e, 1.0))
                if e > 1.0:
                    col = kit.mix3(col, C["edge_hi"], min(e - 1.0, 1.0) * 1.6)
            col = kit.mix3(col, C["bounce"], bounce(p) * 0.55)
            col = kit.mul3(col, kit.lerp(0.5, 1.0, ao ** 1.3))
            out.append((col[0], col[1], col[2], 0.0))
    return out


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

BUILDERS = {"umbra_interceptor": (build_interceptor, interceptor_sockets),
            "umbra_fighter": (build_fighter, fighter_sockets),
            "umbra_hunter": (build_hunter, hunter_sockets),
            "umbra_carrier": (build_carrier, carrier_sockets),
            "umbra_artillery": (build_artillery, artillery_sockets),
            "umbra_turret": (build_turret, turret_sockets),
            "umbra_drone": (build_drone, drone_sockets)}
# Footprints (x, z glTF) and heights: the same overall size per role as the Nacre fleet (nacre_craft.py RULES).
RULES = {
    "umbra_interceptor": dict(budget=2500, foot=(0.8, 1.32), y_min=-0.1, y_max=0.12),
    "umbra_fighter": dict(budget=2500, foot=(1.5, 1.64), y_min=-0.12, y_max=0.18),
    "umbra_hunter": dict(budget=2500, foot=(1.1, 1.62), y_min=-0.12, y_max=0.2),
    "umbra_carrier": dict(budget=2500, foot=(1.66, 1.98), y_min=-0.15, y_max=0.26),
    "umbra_artillery": dict(budget=2500, foot=(1.42, 1.8), y_min=-0.15, y_max=0.3),
    "umbra_turret": dict(budget=2500, foot=(1.1, 1.1), y_min_exact=-0.05, y_max=0.7),
    "umbra_drone": dict(budget=1000, foot=(0.54, 0.66), y_min=-0.06, y_max=0.08),
}
ORDER = ["umbra_interceptor", "umbra_fighter", "umbra_carrier", "umbra_hunter", "umbra_artillery", "umbra_drone", "umbra_turret"]


def make_materials():
    return [vc.make_material("umbra_obsidian", "vc", rough=0.12, metal=0.0),
            vc.make_material("umbra_glow", "glow", colour=GLOW_HEX),
            vc.make_material("umbra_glow_hot", "glow", colour=HOT_HEX)]


def build(names):
    mats = make_materials()
    objs, sockets, stats = {}, {}, {}
    for name in names:
        fn, sk = BUILDERS[name]
        m = fn(random.Random(f"{SEED}:{name}"))
        nf.finish(m)
        cols = bake(m, name, ground=-0.05 if name == "umbra_turret" else None)
        objs[name] = nf.make_object(name, m, mats, (0.0, 0.0, 0.0), cols)
        sockets[name] = sk()
        for sname, pos in sockets[name].items():
            nf.make_socket(sname, objs[name], pos)
        x0, x1, y0, y1, z0, z1 = m.bounds()
        stats[name] = dict(tris=m.tris(), x=(x0, x1), z=(-y1, -y0), y=(z0, z1))
        print(f"UCRAFT {name:18s} tris={m.tris():5d} glTF x={x0:+.3f}..{x1:+.3f} z={-y1:+.3f}..{-y0:+.3f} "
              f"y={z0:+.3f}..{z1:+.3f}  size {x1 - x0:.2f} x {y1 - y0:.2f}")
    return mats, objs, sockets, stats


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="umbra_craft.py")
    ap.add_argument("--glb", required=True)
    ap.add_argument("--preview-dir", default=None)
    ap.add_argument("--concepts", default=None, help="art/concepts/umbra (for the silhouette sheet)")
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--only", default=None, help="comma-separated nodes (preview iteration; no publish)")
    ap.add_argument("--wip", action="store_true", help="skip publishing; previews get a -wip suffix")
    ap.add_argument("--views", default="all", help="comma-separated: top,game,hero,silhouette,insitu,runtime")
    args = ap.parse_args(argv)
    args.wip = args.wip or bool(args.only)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    names = ORDER if not args.only else args.only.split(",")
    mats, objs, sockets, stats = build(names)
    total = sum(s["tris"] for s in stats.values())
    print(f"UCRAFT total {total} triangles in {len(stats)} nodes")
    if not args.wip:
        spec_nodes = {}
        for name in names:
            r = dict(RULES[name])
            r["children"] = {k: tuple(v) for k, v in sockets[name].items()}
            spec_nodes[name] = r
        nf.publish(args.glb, "umbra_craft.py", dict(materials=list(MAT_NAMES), nodes=spec_nodes, max_bytes=2_500_000), "UCRAFT")
    if args.preview_dir:
        os.makedirs(args.preview_dir, exist_ok=True)
        render_previews(objs, args)


# ----------------------------------------------------------------------------
# Previews (look-dev only, never runtime assets): near-black obsidian under a violet haze, the eclipse sky in the gloss
# ----------------------------------------------------------------------------

import umbra_kit as uk  # noqa: E402  (preview world, bloom, fog and the kit's preview materials)

LABELS = {"umbra_interceptor": "INTERCEPTOR", "umbra_fighter": "HEAVY FIGHTER", "umbra_carrier": "DRONE CARRIER",
          "umbra_hunter": "ELITE HUNTER", "umbra_artillery": "ARTILLERY SHIP", "umbra_drone": "DRONE", "umbra_turret": "TURRET"}
FLIGHT_Z = 0.75          # line-up height of the air craft over the preview ground
CONCEPT_BG = "#0e1520"   # the concept sheet's panel colour (silhouette tiles)
SILHOUETTE = "#8b8f98"   # the concept's silhouette grey


def keep_names(objs):
    out = set()
    for o in objs.values():
        out.add(o.name)
        out |= {c.name for c in o.children}
    return out


def reset(objs):
    keep = keep_names(objs)
    for o in list(bpy.context.scene.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in objs.values():
        o.hide_render = True
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)


def flat(name, hexcol, rough=0.5, emit=None, strength=1.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*kit.hex_linear(hexcol), 1.0)
    b.inputs["Roughness"].default_value = rough
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.04
    if emit:
        b.inputs["Emission Color"].default_value = (*kit.hex_linear(emit), 1.0)
        b.inputs["Emission Strength"].default_value = strength
    return m


def emission(name, hexcol, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*kit.hex_linear(hexcol), 1.0)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def runtime_like(objs):
    """The obsidian as the current craft loader would draw it (unknown material names fall into the 'shell' class:
    roughness 0.26, metalness 0.35), no clear coat: a check that the craft still read without the glossy upgrade."""
    pm = uk.preview_materials(vc.COLOR_ATTR)
    ob = pm["umbra_obsidian"]
    b = next(n for n in ob.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = 0.26
    b.inputs["Metallic"].default_value = 0.35
    b.inputs["Coat Weight"].default_value = 0.0
    for o in objs.values():
        for k, slot in enumerate(o.data.materials):
            for key, mt in pm.items():
                if slot.name.startswith(key):
                    o.data.materials[k] = mt


def eclipse_world(scene):
    """The runtime's Umbra reflection sky (src/render/models.ts createVoidEnvironment): a black zenith, the corona's
    violet band round the horizon, a dim violet below and a broad violet halo round the eclipsed sun."""
    world = bpy.data.worlds.new("pv_eclipse")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = -1.0, 1.0
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    zen, hor, gnd = (0.02, 0.018, 0.035), (0.3, 0.27, 0.5), (0.05, 0.04, 0.09)
    stops = []
    for y in (-1.0, -0.5, -0.1, 0.0, 0.12, 0.3, 0.6, 1.0):
        if y >= 0.0:
            w = y ** 0.6
            c = tuple(h * (1 - w) + z * w for h, z in zip(hor, zen))
        else:
            w = (-y) ** 0.5
            c = tuple(h * 0.45 * (1 - w) + g * w for h, g in zip(hor, gnd))
        stops.append(((y + 1.0) / 2.0, c))
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1.0)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1.0)
    for pos, c in stops[1:-1]:
        e = els.new(pos)
        e.color = (*c, 1.0)
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    sun = (-Vector(kit.SUN_DIR)).normalized()
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = tuple(sun)
    nt.links.new(tc.outputs["Generated"], dot.inputs[0])
    mx = nt.nodes.new("ShaderNodeMath")
    mx.operation = "MAXIMUM"
    mx.inputs[1].default_value = 0.0
    nt.links.new(dot.outputs["Value"], mx.inputs[0])
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = 12.0
    nt.links.new(mx.outputs["Value"], pw.inputs[0])
    halo = nt.nodes.new("ShaderNodeVectorMath")
    halo.operation = "SCALE"
    halo.inputs[0].default_value = (0.5, 0.4, 0.85)
    nt.links.new(pw.outputs["Value"], halo.inputs["Scale"])
    add = nt.nodes.new("ShaderNodeVectorMath")
    add.operation = "ADD"
    nt.links.new(ramp.outputs["Color"], add.inputs[0])
    nt.links.new(halo.outputs["Vector"], add.inputs[1])
    nt.links.new(add.outputs["Vector"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    return world


def look(res, samples, fill=1.6):
    """Umbra's light (src/render/scene.ts LOOKS.umbra): no sun, a cold violet-white rim light low (30 degrees) from the
    upper left beyond the scene, a violet bounce from the camera side, the eclipse sky in every gloss, bloom; the
    runtime's exposure (1.12) under ACES."""
    scene = bpy.context.scene
    eclipse_world(scene)
    kit.add_sun(kit.SUN_DIR, strength=4.4, color=kit.hex_linear("#e2dcff"), angle_deg=1.0)
    f = kit.add_sun((-0.3, 0.85, -0.45), strength=fill, color=kit.hex_linear("#6a5ab0"), angle_deg=8.0)
    f.name = "preview_fill"
    kit.setup_render(scene, "EEVEE", samples, *res)
    scene.view_settings.exposure = math.log2(1.12 / 0.6)
    ee = scene.eevee
    for attr, v in (("volumetric_tile_size", "4"), ("volumetric_samples", 96), ("volumetric_end", 200.0)):
        try:
            setattr(ee, attr, v)
        except Exception:
            pass
    uk.glare(scene)
    return scene


def haze_ground_material(name, haze=1.0):
    """Near-black glossy obsidian under a wispy violet haze (noise-masked emission; no volume, so no banding)."""
    m = flat(name, "#08070d", rough=0.42)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Specular IOR Level"].default_value = 0.22
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.32
    noise.inputs["Detail"].default_value = 4.0
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.38, (0.1, 0.1, 0.1, 1.0)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.72, (1.0, 1.0, 1.0, 1.0)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.03 * haze, 0.018 * haze, 0.085 * haze, 1.0)
    nt.links.new(ramp.outputs["Color"], em.inputs["Strength"])
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(b.outputs["BSDF"], add.inputs[0])
    nt.links.new(em.outputs["Emission"], add.inputs[1])
    nt.links.new(add.outputs["Shader"], out.inputs["Surface"])
    return m


def obsidian_ground(x0, x1, y0, y1, z=0.0, haze=1.0):
    return kit.plane_obj("pv_ground", x0, x1, y0, y1, z, haze_ground_material("pv_obsidian", haze))


def show(o, loc, rot_z=0.0, scale=1.0):
    inst = bpy.data.objects.new(f"pv_{o.name}_{len(bpy.data.objects)}", o.data)
    inst.location = loc
    inst.rotation_euler = (0.0, 0.0, rot_z)
    inst.scale = (scale, scale, scale)
    bpy.context.scene.collection.objects.link(inst)
    return inst


def top_camera(target, ortho, nose_up=True):
    cam = bpy.data.cameras.new("pv_top")
    cam.type = "ORTHO"
    cam.ortho_scale = ortho
    cam.clip_end = 200.0
    ob = bpy.data.objects.new("pv_top", cam)
    ob.location = (target[0], target[1], 40.0)
    ob.rotation_euler = (0.0, 0.0, math.pi if nose_up else 0.0)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    return ob


def label(text, loc, size, rot_z=0.0):
    mat = bpy.data.materials.get("pv_label") or emission("pv_label", "#bdb6d6", 0.9)
    o = kit.text_label(text, loc, size, mat)
    o.rotation_euler = (0.0, 0.0, rot_z)
    return o


def studio_light(energy=600.0):
    """A broad soft panel overhead (top-down comparison views only: from straight above the gloss would otherwise mirror
    only the black zenith); the game-angle views keep the game's light."""
    light = bpy.data.lights.new("pv_studio", "AREA")
    light.shape = "RECTANGLE"
    light.size, light.size_y = 16.0, 6.0
    light.energy = energy
    light.color = (0.8, 0.78, 1.0)
    ob = bpy.data.objects.new("pv_studio", light)
    ob.location = (0.0, 0.0, 9.0)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def is_ground(name):
    return name == "umbra_turret"


def lineup_positions():
    gap = 2.05
    return [(name, (i - (len(ORDER) - 1) / 2) * gap) for i, name in enumerate(ORDER)]


def render_previews(objs, args):
    d = args.preview_dir
    sfx = "-wip" if args.wip else ""
    views = set(args.views.split(",")) if args.views != "all" else {"top", "game", "hero", "silhouette", "insitu", "runtime"}
    uk.apply_preview(objs.values())
    names = [n for n in ORDER if n in objs]
    if "top" in views:
        # 1. Top-down line-up, noses up as in the concept's SHIP CLASSES panel.
        reset(objs)
        look((2600, 900), args.samples)
        for name, x in lineup_positions():
            if name in objs:
                show(objs[name], (-x, 0.0, 0.05 if is_ground(name) else FLIGHT_Z))
                label(LABELS[name], (-x, 1.25, 0.01), 0.17, math.pi)
        obsidian_ground(-30, 30, -20, 20)
        studio_light()
        top_camera((0.0, 0.15, 0.0), 15.2)
        kit.render(os.path.join(d, f"umbra-craft-top{sfx}.png"))
    if "game" in views or "runtime" in views:
        # 2. Game camera line-up: 55 degrees down from the front (noses toward the camera).
        for tag in [t for t in ("game", "runtime") if t in views]:
            reset(objs)
            if tag == "runtime":
                runtime_like(objs)
            look((2600, 1000), args.samples)
            for name, x in lineup_positions():
                if name in objs:
                    show(objs[name], (x, 0.0, 0.05 if is_ground(name) else FLIGHT_Z))
                    label(LABELS[name], (x, -1.3, 0.01), 0.17)
            obsidian_ground(-30, 30, -20, 30)
            kit.add_ortho_camera((0.0, 0.0, 0.45), 55.0, 15.2)
            kit.render(os.path.join(d, f"umbra-craft-{tag}{sfx}.png"))
            if tag == "runtime":
                uk.apply_preview(objs.values())
    if "hero" in views:
        # 3. Close 3/4 views from the front left, one per craft.
        for name in names:
            reset(objs)
            look((1100, 820), args.samples)
            z = 0.05 if is_ground(name) else 0.6
            show(objs[name], (0.0, 0.0, z))
            obsidian_ground(-40, 40, -40, 40)
            size = {"umbra_drone": 0.55, "umbra_interceptor": 0.9, "umbra_turret": 1.0}.get(name, 1.35)
            nf.perspective_camera((-1.5 * size, -2.2 * size, 1.45 * size + z), (0.0, 0.0, z + (0.3 if is_ground(name) else 0.0)),
                                  lens=50.0)
            kit.render(os.path.join(d, f"hero-{name.split('_')[1]}{sfx}.png"))
    if "silhouette" in views and args.concepts:
        silhouette_sheet(objs, args, sfx)
    if "insitu" in views:
        insitu(objs, args, sfx)


# --- silhouette sheet ---------------------------------------------------------

def np_load(path):
    import numpy as np
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
    bpy.data.images.remove(img)
    return a


def np_resize(a, w, h):
    import numpy as np
    H, W = a.shape[:2]
    ys, xs = np.linspace(0, H - 1, h), np.linspace(0, W - 1, w)
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    y1, x1 = np.minimum(y0 + 1, H - 1), np.minimum(x0 + 1, W - 1)
    wy, wx = (ys - y0)[:, None, None], (xs - x0)[None, :, None]
    top = a[y0][:, x0] * (1 - wx) + a[y0][:, x1] * wx
    bot = a[y1][:, x0] * (1 - wx) + a[y1][:, x1] * wx
    return top * (1 - wy) + bot * wy


def np_save(a, path):
    h, w = a.shape[:2]
    img = bpy.data.images.new("pv_sheet", w, h, alpha=True)
    img.pixels[:] = a[::-1].ravel()
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def fit(a, w, h, bg):
    """Scale a into a w x h tile (aspect kept, centred) over colour bg."""
    import numpy as np
    H, W = a.shape[:2]
    s = min(w / W, h / H)
    b = np_resize(a, max(1, int(W * s)), max(1, int(H * s)))
    out = np.zeros((h, w, 4), dtype=np.float32)
    out[:, :] = bg
    y, x = (h - b.shape[0]) // 2, (w - b.shape[1]) // 2
    out[y:y + b.shape[0], x:x + b.shape[1]] = b
    return out


# Concept columns (art/concepts/umbra/02, pixel x ranges of the SHIP CLASSES panel; rows 120..530) and ours.
SHEET = [("umbra_interceptor", (812, 905)), ("umbra_fighter", (905, 1037)), ("umbra_carrier", (1037, 1167)),
         ("umbra_hunter", (1167, 1290)), ("umbra_artillery", (1290, 1428))]


def tile_render(objs, name, path, silhouette, extra=(), res=(360, 470), samples=24):
    """One craft (plus extra (name, (x, y), scale) instances) from straight above, nose up, filling the tile."""
    reset(objs)
    o = objs[name]
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    length, width = max(ys) - min(ys), max(xs) - min(xs)
    cy = (max(ys) + min(ys)) / 2
    span_y = length
    insts = [show(o, (0.0, 0.0, 0.0))]
    for en, (ex, ey), es in extra:
        insts.append(show(objs[en], (ex, ey, 0.0), 0.0, es))
        eo = objs[en]
        eys = [v.co.y * es + ey for v in eo.data.vertices]
        span_y = max(span_y, max(max(ys), max(eys)) - min(min(ys), min(eys)))
        cy = (max(max(ys), max(eys)) + min(min(ys), min(eys))) / 2
    scene = bpy.context.scene
    if silhouette:
        mat = emission("pv_silhouette", SILHOUETTE, 1.0)
        for inst in insts:
            inst.data = inst.data.copy()
            for k in range(len(inst.data.materials)):
                inst.data.materials[k] = mat
        world = bpy.data.worlds.new("pv_flat")
        scene.world = world
        world.use_nodes = True
        bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
        bg.inputs["Color"].default_value = (*kit.hex_linear(CONCEPT_BG), 1.0)
        bg.inputs["Strength"].default_value = 1.0
        kit.setup_render(scene, "EEVEE", 8, *res)
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.exposure = 0.0
        scene.render.use_compositing = False
    else:
        for inst in insts:
            inst.location.z += FLIGHT_Z
        look(res, samples)
        obsidian_ground(-20, 20, -20, 20)
        studio_light(240.0)
    ortho = max(span_y, width * res[1] / res[0]) / 0.86
    top_camera((0.0, cy, 0.0), ortho)
    scene.camera.data.ortho_scale = ortho * max(res) / res[1]
    kit.render(path)
    for inst in insts:
        if silhouette:
            bpy.data.meshes.remove(inst.data, do_unlink=True) if inst.data.users == 1 else None


def silhouette_sheet(objs, args, sfx):
    import numpy as np
    d = args.preview_dir
    tmp = os.path.join(d, "_tiles")
    os.makedirs(tmp, exist_ok=True)
    concept = np_load(os.path.join(args.concepts, "02-umbra-faction-and-eclipse.png"))
    world = np_load(os.path.join(args.concepts, "01-umbra-world-and-infrastructure.png"))
    bg = np.array([*kit.hex_linear(CONCEPT_BG), 1.0], dtype=np.float32) ** (1 / 2.2)
    bg[3] = 1.0
    cw, ch, th = 360, 980, 470
    cols = []
    for name, (x0, x1) in SHEET:
        crop = concept[120:530, x0:x1]
        extra = ()
        if name == "umbra_carrier":
            extra = (("umbra_drone", (-0.5, 1.3), 1.0), ("umbra_drone", (0.5, 1.3), 1.0))
        shaded = os.path.join(tmp, f"{name}-shaded.png")
        sil = os.path.join(tmp, f"{name}-sil.png")
        tile_render(objs, name, shaded, False, samples=args.samples)
        tile_render(objs, name, sil, True, extra=extra)
        col = np.concatenate([fit(crop, cw, ch, bg), fit(np_load(shaded), cw, th, bg), fit(np_load(sil), cw, th, bg)], axis=0)
        cols.append(col)
        cols.append(np.ones((col.shape[0], 6, 4), dtype=np.float32) * np.array([0.25, 0.27, 0.33, 1.0], dtype=np.float32))
    # The turret: the concept's DEFENSE TURRET (01) beside ours at a similar low front view and at the game angle.
    reset(objs)
    look((cw, th), args.samples)
    show(objs["umbra_turret"], (0.0, 0.0, 0.0))
    obsidian_ground(-20, 20, -20, 20)
    nf.perspective_camera((0.0, -1.75, 0.62), (0.0, 0.0, 0.3), lens=50.0)
    kit.render(os.path.join(tmp, "turret-front.png"))
    bpy.context.scene.camera = None
    kit.add_ortho_camera((0.0, 0.0, 0.3), 55.0, 1.5)
    kit.render(os.path.join(tmp, "turret-game.png"))
    crop = world[1250:1395, 425:565]
    col = np.concatenate([fit(crop, cw, ch, bg), fit(np_load(os.path.join(tmp, "turret-front.png")), cw, th, bg),
                          fit(np_load(os.path.join(tmp, "turret-game.png")), cw, th, bg)], axis=0)
    cols.append(col)
    sheet = np.concatenate(cols, axis=1)
    np_save(sheet, os.path.join(d, f"umbra-craft-silhouettes{sfx}.png"))
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)


# --- in-situ: the game's view (12 units wide, portrait, 55 degrees) over an Umbra plateau and canyon ---------------

def insitu(objs, args, sfx):
    reset(objs)
    scene = look((900, 1600), args.samples)
    flight = 3.8
    top = flat("pv_plateau", "#0c0a14", rough=0.22, coat=0.4)
    floor = flat("pv_canyon_floor", "#0a0812", rough=0.5)
    made = [uk.box_obj("plateau_near", -14, 14, -12, 5.0, -3.8, 0.0, top), uk.box_obj("plateau_far", -14, 14, 10.0, 40, -3.8, 0.0, top),
            uk.box_obj("canyon_floor", -14, 14, 4.9, 10.1, -4.2, -3.8, floor),
            uk.box_obj("canyon_fog", -14, 14, 5.0, 10.0, -4.0, -0.4, uk.fog_material("pv_canyon_fog", 0.5, 0.9))]
    kit_path = os.path.join(os.path.dirname(args.glb), "umbra-kit.glb")
    if os.path.exists(kit_path):
        pieces, attr = uk.import_glb(kit_path)
        uk.apply_preview(pieces.values(), attr)
        for name, x, y, s, h, r in (("umb_spire_0", -5.2, 1.5, 1.4, 3.0, 0.3), ("umb_spire_2", -4.0, 3.2, 1.3, 2.4, 2.0),
                                    ("umb_spire_3", 5.0, 2.0, 1.4, 2.6, 1.0), ("umb_shards_1", 3.0, -1.5, 1.6, 1.6, 0.4),
                                    ("umb_spire_1", 5.6, 13.5, 1.4, 3.0, 4.0), ("umb_monolith_0", -4.6, 16.0, 2.6, 3.6, 0.2),
                                    ("umb_obelisk_0", 2.0, 19.0, 1.8, 2.6, 0.4), ("umb_spire_2", -1.0, 22.0, 1.4, 2.8, 1.2),
                                    ("umb_shards_2", -2.5, 12.0, 1.6, 1.6, 2.5)):
            if name in pieces:
                made.append(uk.place(scene, pieces[name], (x, y, -0.05), r, (s, s, h)))
    # Squadrons at flight height (noses toward the player, -y).
    for (x, y) in ((0.0, 16.6), (-0.9, 17.6), (0.9, 17.6), (-1.8, 18.6), (1.8, 18.6)):
        show(objs["umbra_interceptor"], (x, y, flight))
    for (x, y) in ((-3.4, 12.2), (-1.7, 12.9)):
        show(objs["umbra_fighter"], (x, y, flight))
    show(objs["umbra_carrier"], (2.6, 15.0, flight))
    for (x, y) in ((1.7, 13.0), (3.5, 12.6), (2.6, 12.0)):
        show(objs["umbra_drone"], (x, y, flight))
    # Over the canyon's bright fog (dark silhouettes) and over the black plateau (glow and gloss).
    show(objs["umbra_hunter"], (-0.6, 3.9, flight))
    show(objs["umbra_artillery"], (3.3, 4.6, flight))
    for (x, y) in ((-3.6, 4.4), (-2.9, 5.2)):
        show(objs["umbra_interceptor"], (x, y, flight))
    show(objs["umbra_hunter"], (0.8, 9.2, flight))
    for (x, y) in ((-3.6, 2.6), (4.2, 12.4), (-1.2, 18.0)):
        show(objs["umbra_turret"], (x, y, -0.05 + 0.05))
    kit.add_ortho_camera((0.0, 6.8, flight), 55.0, 12.0 * 1600.0 / 900.0)
    kit.render(os.path.join(args.preview_dir, f"umbra-craft-insitu{sfx}.png"))


if __name__ == "__main__":
    main()
