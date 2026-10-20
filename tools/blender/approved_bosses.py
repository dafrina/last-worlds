"""Adapt the user's approved GLBs, never regenerate their silhouettes.

Run through Blender MCP. Original files in art/source/approved-bosses stay untouched.
Only working copies may be segmented, rigged or decimated after visual comparison.
"""
import bpy, os, json, math, random
from mathutils import Vector, Matrix
import cinematic_assets as ca

SOURCES={'veil':'futuristic-spacecraft-original.glb','bastion':'futuristic-tank-original.glb','ark':'futuristic-starship-original.glb'}
SCENES={'veil':'spacecraft','bastion':'tank','ark':'starship'}

def source(name):
    key='approved_source_'+SCENES[name]
    if key not in bpy.data.objects:
        sc=bpy.data.scenes.new('Last Worlds — Approved source '+SCENES[name])
        bpy.context.window.scene=sc
        bpy.ops.import_scene.gltf(filepath=os.path.join(ca.ROOT,'art','source','approved-bosses',SOURCES[name]))
        meshes=[o for o in sc.objects if o.type=='MESH']
        if len(meshes)!=1:raise RuntimeError('Approved source mesh count changed')
        meshes[0].name=key
    return bpy.data.objects[key]

def components(name):
    """Geometric islands including UV seam duplicates, without modifying source mesh."""
    ob=source(name);me=ob.data;parents=list(range(len(me.vertices)))
    def root(v):
        while parents[v]!=v:
            parents[v]=parents[parents[v]];v=parents[v]
        return v
    def union(a,b):
        a=root(a);b=root(b)
        if a!=b:parents[b]=a
    same={}
    for v in me.vertices:
        key=tuple(round(c,6) for c in v.co)
        if key in same:union(v.index,same[key])
        else:same[key]=v.index
    for p in me.polygons:
        v=p.vertices
        for j in range(1,len(v)):union(v[0],v[j])
    groups={}
    for p in me.polygons:groups.setdefault(root(p.vertices[0]),[]).append(p.index)
    rows=[]
    for ids in groups.values():
        coords=[me.vertices[i].co for pi in ids for i in me.polygons[pi].vertices]
        lo=[min(v[k] for v in coords) for k in range(3)];hi=[max(v[k] for v in coords) for k in range(3)]
        rows.append(dict(polygons=ids,count=len(ids),lo=lo,hi=hi,center=[(a+b)/2 for a,b in zip(lo,hi)]))
    rows.sort(key=lambda r:-r['count'])
    os.makedirs(os.path.join(ca.ROOT,'lookdev','approved-bosses'),exist_ok=True)
    with open(os.path.join(ca.ROOT,'lookdev','approved-bosses',name+'-components.json'),'w') as f:json.dump(rows,f)
    print(json.dumps([dict(id=i,**{k:v for k,v in r.items() if k!='polygons'}) for i,r in enumerate(rows[:30])]))
    return rows

def extract(ob,indices,name,scale=1,offset=(0,0,0),pivot=(0,0,0),ratio=1):
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

def hidden_soles(ob,ids,height):
    """Cull only low, downward faces occluded by STATIC armour in all sampled poses.
    Upper rear decks and every articulated part are excluded. Rays include the game
    camera, destruction listing margin and light directions; open cavities stay intact.
    """
    from mathutils.bvhtree import BVHTree
    me=ob.data;ids=list(ids)
    tree=BVHTree.FromPolygons([v.co for v in me.vertices],[list(me.polygons[i].vertices) for i in ids],all_triangles=True)
    directions=[Vector((x,y,z)).normalized() for x,y,z in [(0,-.7,1),(-.3,-.7,1),(.3,-.7,1),(0,-1,.7),(0,-.4,1),(1,0,.5),(-1,0,.5),(0,1,.5)]]
    kept=[];removed=0
    for i in ids:
        p=me.polygons[i]
        if p.normal.z>-.92 or max(me.vertices[v].co.z for v in p.vertices)>height:kept.append(i);continue
        samples=[p.center]+[p.center.lerp(me.vertices[v].co,.7) for v in p.vertices]
        visible=any(tree.ray_cast(point+d*4,-d,3.99998)[0] is None for point in samples for d in directions)
        if visible:kept.append(i)
        else:removed+=1
    print('Hidden static underside triangles removed:',removed)
    return kept

def working_material(name,size=2048):
    """Keep the approved atlas/UVs; working copies trim texture memory, not painted detail.
    Clamp mirror-like roughness to expose the existing panels under game lighting.
    The emission mask follows cyan/orange paint already present in the supplied atlas.
    """
    import numpy as np
    key='approved_'+name+'_surface_'+str(size)+'_v3'
    if key in bpy.data.materials:return bpy.data.materials[key]
    mat=source(name).data.materials[0].copy();mat.name=key
    nt=mat.node_tree;bs=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED')
    base=next(l.from_node for l in nt.links if l.to_node==bs and l.to_socket.name=='Base Color')
    for node in [n for n in nt.nodes if n.type=='TEX_IMAGE']:
        img=node.image.copy();img.name=key+'_'+node.image.name
        img.scale(size,size)
        if '_rm.' in node.image.name:
            data=np.empty(size*size*4,dtype=np.float32);img.pixels.foreach_get(data);rgba=data.reshape(-1,4)
            rgba[:,1]=np.clip(rgba[:,1],.34,.86)
            img.pixels.foreach_set(data)
        # Keep photographic atlases JPEG; normals stay lossless PNG. Merely packing
        # a resized image defaults to PNG and triples the original download size.
        directory=os.path.join(ca.ROOT,'lookdev','approved-bosses','textures');os.makedirs(directory,exist_ok=True)
        jpeg=('_basecolor.' in node.image.name or '_rm.' in node.image.name)
        path=os.path.join(directory,key+'_'+('base' if node==base else 'rm' if '_rm.' in node.image.name else 'normal')+('.jpg' if jpeg else '.png'))
        img.filepath_raw=path;img.file_format='JPEG' if jpeg else 'PNG';img.save()
        saved=bpy.data.images.load(path,check_existing=False);saved.colorspace_settings.name=img.colorspace_settings.name;saved.pack();node.image=saved
    data=np.empty(size*size*4,dtype=np.float32);base.image.pixels.foreach_get(data);rgb=data.reshape(-1,4)[:,:3]
    r,g,b=rgb.T
    if name=='veil':weight=np.clip((g-r*1.18)*7,0,1)*np.clip((b-r)*8,0,1);tint=(.16,1,.8)
    else:weight=np.clip((r-.68)*4,0,1)*np.clip((r-g*1.9)*4,0,1)*np.clip((g-b*1.2)*8,0,1);tint=(1,.2,.018)
    rgba=np.ones((size*size,4),dtype=np.float32);rgba[:,:3]=weight[:,None]*np.array(tint)
    emit=bpy.data.images.new(key+'_emission',width=size,height=size,alpha=False)
    emit.colorspace_settings.name='Non-Color';emit.pixels.foreach_set(rgba.ravel());emit.pack()
    tex=nt.nodes.new('ShaderNodeTexImage');tex.image=emit
    nt.links.new(tex.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=2.5
    return mat

def export(name,objects,label):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.hide_set(False);o.select_set(True)
    path=os.path.join(ca.ROOT,'public','assets',{'veil':'nacre','bastion':'khepri','ark':'vesper'}[name],{'veil':'the-veil','bastion':'bastion-9','ark':'helion-ark'}[name]+'-'+label+'.glb')
    bpy.ops.export_scene.gltf(filepath=path+'.tmp.glb',export_format='GLB',use_selection=True,use_active_scene=True,
        export_materials='EXPORT',export_image_format='AUTO',export_texcoords=True,export_normals=True,
        export_yup=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False,
        export_copyright='Last Worlds — user-approved GLB, adapted in Blender without silhouette regeneration')
    os.replace(path+'.tmp.glb',path)
    tris=0
    for o in objects:
        if o.type=='MESH':o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
        if o.name.endswith('_wreck'):o.hide_render=True;o.hide_set(True)
    print(json.dumps(dict(file=path,triangles=tris,bytes=os.path.getsize(path),nodes=[o.name for o in objects])))

def veil(ratio=.18,label='v4-approved',texture_size=2048):
    """Preserve both full crescent wings and layered centre. Rig loose source pods.
    The 12.5-unit uniform scale matches the approved proportions to the combat camera.
    """
    import nacre_fleet as nf, the_veil as old, vesper_common as vc
    ob=source('veil');me=ob.data
    cache=os.path.join(ca.ROOT,'lookdev','approved-bosses','veil-components.json')
    rows=json.load(open(cache)) if os.path.exists(cache) else components('veil')
    ca.scene('Approved VEIL working')
    scale=12.5;offset=Vector((0,.9,.15));objects=[]
    parts={'veil_hull':[]};pivots={}
    # Original wing geometry is retained. The forward lip of each open hangar
    # becomes a hinged bay door; separating triangles does not alter the closed shape.
    for wing in [0,1]:
        side=1 if wing==0 else -1;nm='right' if side==1 else 'left'
        door='veil_bay_door_'+nm;parts[door]=[]
        pivots[door]=Vector((side*4.15,-1.0,3.6))
        for pi in rows[wing]['polygons']:
            c=me.polygons[pi].center
            if .27<abs(c.x)<.445 and -.222<c.y<-.13 and .225<c.z<.28:parts[door].append(pi)
            else:parts['veil_hull'].append(pi)
    # The central shell is divided into four fitted armour petals, preserving all UVs.
    for k in range(4):parts['veil_heart_shutter_'+str(k)]=[]
    for pi in rows[2]['polygons']:
        c=me.polygons[pi].center
        if abs(c.x)<.061 and -.16<c.y<.025 and c.z>.333:
            k=(0 if c.x>=0 else 3) if c.y<-.078 else (1 if c.x>=0 else 2)
            parts['veil_heart_shutter_'+str(k)].append(pi)
        else:parts['veil_hull'].append(pi)
    parts['veil_hull']+=rows[3]['polygons'] # original separate crown egg
    parts['veil_hull']=hidden_soles(ob,parts['veil_hull'],.25)
    for name,ids in parts.items():
        if not ids:continue
        if name.startswith('veil_heart_shutter_'):
            k=int(name[-1]);phi=old.SHUTTER_PHI[k]
            pivot=Vector((.66*math.sin(phi),.9-.078*scale+.9*math.cos(phi),.333*scale+.15))
        else:pivot=pivots.get(name,Vector())
        o=extract(ob,ids,name,scale,offset,pivot,ratio)
        # Local hinge X is tangential to the egg, as in the existing animation rig.
        if name.startswith('veil_heart_shutter_'):
            rot=Matrix.Rotation(-phi,4,'Z');o.data.transform(rot.inverted());o.rotation_euler.z=-phi
        objects.append(o)
    for side,i in [(-1,7),(1,8)]:
        name='veil_pod_'+('left' if side<0 else 'right');pivot=Vector((side*3.1,-.4,2.0))
        # Bring the target pod in front of the wing along the 55-degree camera ray.
        # Its pivot and screen-space combat row stay fixed.
        center=Vector(rows[i]['center']);move=pivot-center*scale+Vector((0,-1.0,math.tan(math.radians(55))))
        o=extract(ob,rows[i]['polygons'],name,scale,move,pivot,ratio);objects.append(o)
        wreck=o.copy();wreck.data=o.data.copy();wreck.name=name+'_wreck';bpy.context.scene.collection.objects.link(wreck)
        burnt=me.materials[0].copy();burnt.name='veil_approved_burnt'
        bs=next(n for n in burnt.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Roughness'].default_value=.95
        wreck.data.materials.clear();wreck.data.materials.append(burnt);objects.append(wreck)
    for j,i in enumerate([4,5,6,9]):
        center=Vector(rows[i]['center']);side=-1 if center.x<0 else 1
        # Loose original pods dock under the source's wing bays, clear of the mire.
        pivot=Vector((side*(3.8+(j%2)*.65),-1.25,3.1))
        o=extract(ob,rows[i]['polygons'],'veil_drop_pod_'+str(j),scale,pivot-center*scale,pivot,ratio)
        objects.append(o)
    # Functional interior is hidden by the approved shell until the core phase.
    # Reuse the established heart, fitted under that shell, instead of inventing new exterior geometry.
    mats=nf.make_materials()
    for wreck in [False,True]:
        name='veil_heart'+('_wreck' if wreck else '')
        h=(old.build_heart_wreck if wreck else old.build_heart)(random.Random('approved-interior'))
        nf.finish(h)
        for v in h.verts:
            v[0]*=.6;v[1]=.0+(v[1]-1.8)*.6;v[2]=4.55+(v[2]-2)*.6
        cols=nf.bake(h,name,ground=None)
        objects.append(nf.make_object(name,h,mats,old.SOCKETS[name],cols))
    # A flight-ready copy uses the very same source pod, centered on its combat proxy.
    i=7;center=Vector(rows[i]['center']);flight_scale=7.5
    objects.append(extract(ob,rows[i]['polygons'],'veil_flight_pod',flight_scale,-center*flight_scale,ratio=ratio))
    for name,g in old.EMPTIES.items():objects.append(vc.make_empty(name,g))
    mat=working_material('veil',texture_size)
    for obj in objects:
        if obj.type!='MESH' or obj.name.startswith('veil_heart') and not 'shutter' in obj.name:continue
        obj.data.materials.clear();obj.data.materials.append(mat)
        if obj.name.endswith('_wreck'):
            burnt=mat.copy();burnt.name='approved_veil_wreck'
            bs=next(n for n in burnt.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            bs.inputs['Emission Strength'].default_value=0
            obj.data.materials[0]=burnt
    tag=marker('veil_approved_v4');tag['source_file']=SOURCES['veil'];tag['reduction_ratio']=ratio;objects.append(tag)
    export('veil',objects,label)
    bpy.data.objects['veil_flight_pod'].hide_render=True

def preview(name,path):
    import vesper_common as vc
    sc=bpy.context.scene
    for o in list(sc.objects):
        if o.type in ['CAMERA','LIGHT']:bpy.data.objects.remove(o,do_unlink=True)
    vc.preview_world(sc,sun_strength=2.6)
    vc.kit.setup_world(sc,(.11,.14,.2),.9)
    for name,location,power,size in [('Approved softbox',(4,-6,11),1800,8),('Approved rim',(-6,2,8),2200,7)]:
        light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
        obj=bpy.data.objects.new(name,light);sc.collection.objects.link(obj);obj.location=location
        obj.rotation_euler=(Vector((0,0,3))-obj.location).to_track_quat('-Z','Y').to_euler()
    vc.kit.add_ortho_camera((0,0,3),55,16)
    vc.setup_render(sc,'EEVEE',32,1200,1200,exposure=.25)
    vc.kit.render(os.path.join(ca.ROOT,path))

def approved_parts(name,parts,pivots,scale,offset,ratio):
    ob=source(name);objects=[];mat=working_material(name)
    for nm,ids in parts.items():
        if not ids:raise RuntimeError('Empty required part '+nm)
        if nm.endswith('_hull'):ids=hidden_soles(ob,ids,.06 if name=='bastion' else .025)
        o=extract(ob,ids,nm,scale,offset,pivots.get(nm,(0,0,0)),ratio)
        o.data.materials.clear();o.data.materials.append(mat);objects.append(o)
    return objects

def wreck_copy(obj):
    wreck=obj.copy();wreck.data=obj.data.copy();wreck.name=obj.name+'_wreck'
    bpy.context.scene.collection.objects.link(wreck);return wreck

def bastion(ratio=.18,label='v4-approved'):
    """Segment the supplied tracked fortress; never replace its tracks or armour."""
    import bastion as old
    ob=source('bastion');ca.scene('Approved BASTION working')
    scale=8;offset=Vector((0,-.1,.025));parts={'bastion_hull':[]};pivots={}
    for side,nm in [(-1,'left'),(1,'right')]:
        for component in ['battery','gun','forward_cannon']:
            key='bastion_'+component+'_'+nm;parts[key]=[]
        pivots['bastion_battery_'+nm]=(side*2.2,0,1.45)
        pivots['bastion_gun_'+nm]=(side*.275*scale,-.08*scale-.1,.28*scale+.025)
        pivots['bastion_forward_cannon_'+nm]=(side*.105*scale,-.215*scale-.1,.21*scale+.025)
    for nm in ['a','b']:
        key='bastion_core_shutter_'+nm;parts[key]=[];pivots[key]=((-1 if nm=='a' else 1)*.6,.7,2.4)
    for p in ob.data.polygons:
        c=p.center;ax=abs(c.x);side='left' if c.x<0 else 'right';dest='bastion_hull'
        if .19<ax<.34 and -.12<c.y<.1 and c.z>.27:
            dest='bastion_gun_'+side if c.z>.31 else 'bastion_battery_'+side
        elif .055<ax<.157 and c.y<-.215 and .13<c.z<.32:dest='bastion_forward_cannon_'+side
        elif ax<.14 and -.025<c.y<.17 and c.z>.26:dest='bastion_core_shutter_'+('a' if c.x<0 else 'b')
        parts[dest].append(p.index)
    objects=approved_parts('bastion',parts,pivots,scale,offset,ratio)
    for nm in ['left','right']:
        # Duplicate the original battery + turret for a darkened disabled assembly.
        targets=[o for o in objects if o.name in ['bastion_battery_'+nm,'bastion_gun_'+nm,'bastion_forward_cannon_'+nm]]
        copies=[wreck_copy(o) for o in targets]
        bpy.ops.object.select_all(action='DESELECT')
        for o in copies:o.select_set(True)
        bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();copies[0].name='bastion_battery_'+nm+'_wreck';objects.append(copies[0])
    # Existing reactor sits inside the opened source armour; its screen-space target is unchanged.
    h=old.build_core(random.Random('approved-reactor'))
    for v in h.verts:v[1]-=.665;v[2]+=.95
    objects.append(old.make_object('bastion_core',h,old.make_materials(),[]))
    tag=marker('bastion_approved_v4');tag['source_file']=SOURCES['bastion'];tag['reduction_ratio']=ratio;objects.append(tag)
    export('bastion',objects,label)

def ark(ratio=.18,label='v4-approved'):
    """Keep the approved trimaran on its original waterline, with articulated guns."""
    import helion_ark as old, vesper_common as vc
    ob=source('ark');ca.scene('Approved ARK working')
    scale=9.5;offset=Vector((0,.2,-.18));parts={'ark_hull':[]};pivots={}
    for side,nm in [(-1,'left'),(1,'right')]:
        for component in ['radiator','turret','bay_door']:
            key='ark_'+component+'_'+nm;parts[key]=[]
        pivots['ark_radiator_'+nm]=(side*2.4,-.5,1.6)
        pivots['ark_turret_'+nm]=(side*.325*scale,.18*scale+.2,.29*scale-.18)
        pivots['ark_bay_door_'+nm]=(side*.5,-1,1)
    for nm in ['a','b']:
        key='ark_bridge_shutter_'+nm;parts[key]=[];pivots[key]=((-1 if nm=='a' else 1)*.47,.64,3)
    for p in ob.data.polygons:
        c=p.center;ax=abs(c.x);side='left' if c.x<0 else 'right';dest='ark_hull'
        if .22<ax<.39 and .1<c.y<.25 and c.z>.29:dest='ark_turret_'+side
        elif .22<ax<.36 and -.19<c.y<-.02 and c.z>.16:dest='ark_radiator_'+side
        elif .014<ax<.062 and -.07<c.y<.02 and c.z<.16:dest='ark_bay_door_'+side
        elif ax<.08 and -.05<c.y<.13 and .22<c.z<.46:dest='ark_bridge_shutter_'+('a' if c.x<0 else 'b')
        parts[dest].append(p.index)
    objects=approved_parts('ark',parts,pivots,scale,offset,ratio)
    for nm in ['left','right']:
        objects.append(wreck_copy(next(o for o in objects if o.name=='ark_radiator_'+nm)))
        door=next(o for o in objects if o.name=='ark_bay_door_'+nm);door.name='ark_bay_'+nm+'_door'
        objects.append(marker('ark_bay_'+nm,(-.75 if nm=='left' else .75,-2,1)))
    h=old.build_bridge(random.Random('approved-bridge'))
    # The old hidden lens moves along the camera ray, retaining its combat proxy.
    for v in h.verts:
        v[0]*=.45;v[1]=.935+(v[1]-1.6)*.45;v[2]=2.55+(v[2]-1.6)*.45
    mats=[vc.make_material('ark_interior','vc',rough=.45,metal=.5),vc.make_material('ark_interior_trim','vc',rough=.5,metal=.7),vc.make_material('ark_interior_glow','glow')]
    vc.triangulate_nonplanar(h);cols=vc.bake(h,'ark_bridge',dict(glow={2},ao=.45,ground=None))
    objects.append(vc.make_object('ark_bridge',h,mats,old.SOCKETS['ark_bridge'],cols))
    objects.append(marker('ark_wake_anchor',(0,4,0)))
    tag=marker('ark_approved_v4');tag['source_file']=SOURCES['ark'];tag['reduction_ratio']=ratio;objects.append(tag)
    export('ark',objects,label)
