"""Helpers for adapting the user's Tripo boss GLBs (art/source/bosses): copy faces into rig parts, add markers and wrecks.

The supplied mesh is never regenerated: `extract` copies exact triangles, UVs and split normals into a new part object,
changing only its rigid placement (and optionally decimating the copy). Used by boss_cradle.py (and boss_ark.py, removed 17 November).
These came from the first adaptation of the user's GLBs (20 October 2026, approved_bosses.py, since removed).
"""
import bpy


def extract(ob, indices, name, scale=1, offset=(0, 0, 0), pivot=(0, 0, 0), ratio=1):
    """Copy exact triangles, UVs and split normals, changing only rigid placement.
    pivot is Blender space; offset is applied before subtracting it. No remeshing.
    """
    import numpy as np
    me=ob.data;indices=list(indices);used={};verts=[];faces=[];loops=[];materials=[]
    transform=ob.matrix_world
    for pi in indices:
        p=me.polygons[pi];face=[]
        for vi in p.vertices:
            if vi not in used:
                used[vi]=len(verts);v=transform@me.vertices[vi].co
                verts.append(tuple(v[k]*scale+offset[k]-pivot[k] for k in range(3)))
            face.append(used[vi])
        faces.append(face);loops.extend(p.loop_indices);materials.append(p.material_index)
    out=bpy.data.meshes.new(name);out.from_pydata(verts,[],faces);out.update()
    for mat in me.materials:out.materials.append(mat)
    out.polygons.foreach_set('material_index',materials)
    out.polygons.foreach_set('use_smooth',[me.polygons[i].use_smooth for i in indices])
    for uv in me.uv_layers:
        coords=np.empty(len(me.loops)*2,dtype=np.float32);uv.data.foreach_get('uv',coords)
        out.uv_layers.new(name=uv.name).data.foreach_set('uv',coords.reshape(-1,2)[loops].ravel())
    normals=np.empty(len(me.loops)*3,dtype=np.float32);me.corner_normals.foreach_get('vector',normals)
    out.normals_split_custom_set(normals.reshape(-1,3)[loops].tolist())
    obj=bpy.data.objects.new(name,out);bpy.context.scene.collection.objects.link(obj);obj.location=pivot
    if ratio<1:
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        mod=obj.modifiers.new('Approved source reduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
    return obj

def marker(name,at=(0,0,0)):
    o=bpy.data.objects.new(name,None);o.location=at;bpy.context.scene.collection.objects.link(o);return o

def wreck_copy(obj):
    wreck=obj.copy();wreck.data=obj.data.copy();wreck.name=obj.name+'_wreck'
    bpy.context.scene.collection.objects.link(wreck);return wreck
