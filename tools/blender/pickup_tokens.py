"""3D drop tokens for Last Worlds (user, 7 November 2026: "lets do it. But every item should have the embossed icon. Make
sure the credit coin is the simplest as that will be rendering most"; "keep the coin shape like now ... with its quad
shape").

Each drop is a chunky bevelled slab in the outline of its icon's frame (src/render/pickup-icons.ts), so the painted icon
lies exactly on its face: the runtime maps the icon texture onto the front and back faces (embossed with a bump map from
the same art) and samples the frame's border colour on the rim.

Nodes (one per shape; the four weapon drops share tok_weapon):
- tok_credit: the diamond (4 sides, the credit icon's quad): the simplest, about 28 triangles.
- tok_power:  a taller diamond (4 sides).
- tok_shield: a hexagon (6 sides, a vertex up).
- tok_part:   an octagon (8 sides).
- tok_weapon: a rounded rectangle.

Conventions: glTF +Y up, 1 unit = 1 game unit, the face toward +Z (the camera after the runtime's tilt), pivot at the
centre. The icon plane was PICKUP_ICON_SIZE = 1.15 units for its 256 px canvas, so a frame radius r px is r / 256 * 1.15
units, and a face point (x, y) maps to UV (0.5 + x / 1.15, 0.5 - y / 1.15) (v mirrored for the flipped canvas upload; the
back face mirrored in u so its icon reads the right way round). Rim faces sample one point on the frame's top border.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" \\
        --background --factory-startup --python "$(wslpath -w $R/tools/blender/pickup_tokens.py)" -- \\
        --glb "$(wslpath -w $R/public/assets/shared/pickup-tokens.glb)"
"""

import argparse
import math
import sys

import bmesh
import bpy

ICON = 1.15  # world size of the 256 px icon canvas
PX = ICON / 256
THICK = 0.13  # slab thickness
BEVEL = 0.035  # bevel width at both faces


def outline(name):
    """The token's outline (x, y up) in units, and the UV of its rim colour (the frame's top border)."""
    def poly(sides, radius_px, rotation):
        # Canvas angles run clockwise with y down; flip y for up.
        return [(math.cos(rotation + i / sides * math.tau) * radius_px * PX, -math.sin(rotation + i / sides * math.tau) * radius_px * PX) for i in range(sides)]
    if name == "tok_credit":
        return poly(4, 100, -math.pi / 2), 100
    if name == "tok_power":
        return poly(4, 108, -math.pi / 2), 108
    if name == "tok_shield":
        return poly(6, 98, math.pi / 6), 98
    if name == "tok_part":
        return poly(8, 102, math.pi / 8), 102 * math.cos(math.pi / 8)
    # A rounded rectangle 196 x 150 px, corner radius 30 px, three segments a corner.
    w, h, r, pts = 196 / 2 * PX, 150 / 2 * PX, 30 * PX, []
    for cx, cy, a0 in ((w - r, h - r, 0), (-(w - r), h - r, 90), (-(w - r), -(h - r), 180), (w - r, -(h - r), 270)):
        for k in range(4):
            a = math.radians(a0 + k * 30)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts, 75


def inset(points, d):
    """The outline moved inward by d along each vertex's bisector (convex outlines)."""
    n, out = len(points), []
    for i in range(n):
        p, a, b = points[i], points[i - 1], points[(i + 1) % n]
        e1 = (p[0] - a[0], p[1] - a[1]); e2 = (b[0] - p[0], b[1] - p[1])
        l1 = math.hypot(*e1) or 1; l2 = math.hypot(*e2) or 1
        n1 = (-e1[1] / l1, e1[0] / l1); n2 = (-e2[1] / l2, e2[0] / l2)  # left normals (inward for counter-clockwise)
        bis = (n1[0] + n2[0], n1[1] + n2[1]); lb = math.hypot(*bis) or 1
        cos = max(0.3, (bis[0] * n1[0] + bis[1] * n1[1]) / lb)
        out.append((p[0] + bis[0] / lb * d / cos, p[1] + bis[1] / lb * d / cos))
    return out


def build(name):
    pts, rim_px = outline(name)
    # Counter-clockwise (seen from the front, +glTF Z = Blender -Y): ensure positive area.
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if area < 0:
        pts = pts[::-1]
    inner = inset(pts, BEVEL)
    half = THICK / 2
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    # Blender: x right, z up, the face toward -Y (glTF +Z).
    def v(x, y, depth):
        return bm.verts.new((x, depth, y))
    front = [v(x, y, -half) for x, y in inner]
    ring_f = [v(x, y, -half + BEVEL) for x, y in pts]
    ring_b = [v(x, y, half - BEVEL) for x, y in pts]
    back = [v(x, y, half) for x, y in inner]
    n = len(pts)
    # The icon canvases are uploaded flipped (CanvasTexture flipY) while glTF UVs run top-down: v is mirrored here.
    rim_uv = (0.5, 0.5 - rim_px / 256)

    def face(verts, uvs):
        f = bm.faces.new(verts)
        for loop, coord in zip(f.loops, uvs):
            loop[uv].uv = coord
        return f

    face(front[::-1], [(0.5 + p.co.x / ICON, 0.5 - p.co.z / ICON) for p in front[::-1]])
    face(back, [(0.5 - p.co.x / ICON, 0.5 - p.co.z / ICON) for p in back])
    for i in range(n):
        j = (i + 1) % n
        face([front[i], front[j], ring_f[j], ring_f[i]], [rim_uv] * 4)
        face([ring_f[i], ring_f[j], ring_b[j], ring_b[i]], [rim_uv] * 4)
        face([ring_b[i], ring_b[j], back[j], back[i]], [rim_uv] * 4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(mesh); bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj, len(mesh.polygons)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(); parser.add_argument("--glb", required=True)
    args = parser.parse_args(argv)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for name in ("tok_credit", "tok_power", "tok_shield", "tok_part", "tok_weapon"):
        obj, tris = build(name)
        print(f"TOKEN {name} {tris} triangles")
    bpy.ops.export_scene.gltf(filepath=args.glb, export_format="GLB", export_yup=True, export_normals=True,
                              export_materials="NONE", export_apply=True)
    print("EXPORTED", args.glb)


main()
