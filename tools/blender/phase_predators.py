"""Amnion brood heavy and Umbra Wraith, authored through live Blender MCP.
Run in an isolated scene: never clear the user's existing scenes or overwrite their assets.
Design coordinates are game x/up/z-forward; converted to Blender x/-y/z-up on creation.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(r'\\wsl.localhost\Ubuntu\home\davidfarina\Projects\alien-skies')
OUT = ROOT / 'lookdev' / 'phase-predators'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('Codex phase predators')
bpy.context.window.scene = scene

def xyz(p): return Vector((p[0], -p[2], p[1]))

def material(name, color, rough=.32, metal=0, glow=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = (*color, 1)
    n.inputs['Roughness'].default_value = rough; n.inputs['Metallic'].default_value = metal
    n.inputs['Coat Weight'].default_value = .3 if rough < .2 else .08
    if glow:
        n.inputs['Emission Color'].default_value = (*color, 1); n.inputs['Emission Strength'].default_value = glow
    return m

obsidian = material('wraith_obsidian', (.006, .005, .012), .12)
edge = material('wraith_obsidian_ridges', (.014, .012, .022), .17)
void = material('wraith_frame', (.002, .001, .004), .42)
violet = material('wraith_glow_violet', (.14, .035, .38), .3, glow=1.5)
bone = material('brood_shell', (.57, .49, .34), .35)
ivory = material('brood_blade_ivory', (.78, .71, .55), .28)
flesh = material('brood_flesh', (.075, .008, .017), .24)
gum = material('brood_gum', (.16, .012, .019), .18)
pit = material('brood_frame', (.004, .001, .002), .5)
red = material('brood_glow_blood', (.55, .012, .008), .3, glow=1.4)

def root(name):
    o = bpy.data.objects.new(name, None); scene.collection.objects.link(o); return o

def mesh(name, verts, faces, mat, parent, smooth=True, variation=0):
    data = bpy.data.meshes.new(name); data.from_pydata([xyz(p) for p in verts], [], faces); data.update()
    o = bpy.data.objects.new(name, data); scene.collection.objects.link(o); o.parent = parent; data.materials.append(mat)
    for p in data.polygons: p.use_smooth = smooth
    if variation:
        colors = data.color_attributes.new(name='weathering', type='FLOAT_COLOR', domain='POINT')
        for i, v in enumerate(verts):
            n = .5 + .25 * math.sin(v[0]*43 + v[2]*29) + .25 * math.sin(v[1]*81-v[2]*53)
            c = 1 - variation * n; colors.data[i].color = (c, c, c, 1)
    return o

def ellipsoid(name, centre, radii, mat, parent, rings=16, segments=32):
    verts=[]; faces=[]
    for j in range(rings+1):
        p=math.pi*(j+.001)/(rings+.002)
        for i in range(segments):
            a=2*math.pi*i/segments
            verts.append((centre[0]+radii[0]*math.sin(p)*math.cos(a), centre[1]+radii[1]*math.cos(p), centre[2]+radii[2]*math.sin(p)*math.sin(a)))
    for j in range(rings):
        for i in range(segments):
            a=j*segments+i; b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces.extend([tuple(reversed(range(segments))), tuple(rings*segments+i for i in range(segments))])
    return mesh(name,verts,faces,mat,parent,variation=.11 if mat in [bone,ivory,flesh] else 0)

def bezier(points, t):
    a,b,c,d=[Vector(p) for p in points]; return a*(1-t)**3+b*3*(1-t)**2*t+c*3*(1-t)*t*t+d*t**3

def horn(name, points, width, depth, mat, parent, steps=16, sides=10, power=1.25):
    verts=[]; faces=[]
    for j in range(steps+1):
        t=j/steps; p=bezier(points,t); q=bezier(points,min(1,t+.001))-bezier(points,max(0,t-.001)); q.normalize()
        axis=q.cross(Vector((0,1,0)))
        if axis.length < .01: axis=q.cross(Vector((1,0,0)))
        axis.normalize(); up=q.cross(axis).normalized()
        r=max(.002,(1-t)**power)*(1+.15*math.sin(t*math.pi))
        for k in range(sides):
            a=2*math.pi*k/sides; v=p+axis*math.cos(a)*width*r+up*math.sin(a)*depth*r; verts.append(tuple(v))
    for j in range(steps):
        for k in range(sides):
            a=j*sides+k;b=j*sides+(k+1)%sides; faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(steps*sides+i for i in range(sides))])
    return mesh(name,verts,faces,mat,parent)

def ring(name, r, tube, height, mat, parent, segments=40, sides=8, stretch=1):
    verts=[];faces=[]
    for j in range(segments):
        a=j*2*math.pi/segments
        for k in range(sides):
            b=k*2*math.pi/sides; rr=r+tube*math.cos(b)
            verts.append((rr*math.cos(a),height+tube*math.sin(b),rr*math.sin(a)*stretch))
    for j in range(segments):
        for k in range(sides): faces.append((j*sides+k,((j+1)%segments)*sides+k,((j+1)%segments)*sides+(k+1)%sides,j*sides+(k+1)%sides))
    return mesh(name,verts,faces,mat,parent)

wraith=root('umbra_wraith')
# Seamless faceless carapace; long hooked spines grow from it, never mechanical wings or a cockpit.
ellipsoid('silent_carapace',(0,.04,0),(.35,.25,.79),obsidian,wraith,20,40)
ellipsoid('faceless_crown',(0,.14,.40),(.265,.20,.48),obsidian,wraith,16,32)
for side in [-1,1]:
    for i in range(4):
        z=.43-i*.32
        tipx=(.98+.18*math.sin(i*1.2))*side
        tipz=.90-i*.74
        horn('swept_living_spine',[(side*.22,.04,z),(side*.62,.25,z+.12),(tipx,.26,tipz+.26),(tipx,.02,tipz)], .145-i*.014,.06,obsidian,wraith,20,10)
        horn('spinal_highlight',[(side*.25,.13,z),(side*.57,.26,z+.12),(tipx*.87,.25,tipz+.1),(tipx*.96,.09,tipz+.03)], .035,.018,edge,wraith,14,8)
    horn('mandible',[(side*.16,-.02,.57),(side*.34,-.12,.9),(side*.24,-.16,1.18),(side*.08,-.12,1.30)],.08,.06,obsidian,wraith,16,10)
    horn('rear_tendril',[(side*.13,0,-.55),(side*.34,.02,-.9),(side*.27,.2,-1.35),(side*.08,.24,-1.65)],.09,.045,obsidian,wraith,20,10)
    ellipsoid('sealed_sensory_slit',(side*.185,.19,.45),(.018,.016,.17),violet,wraith,6,12)
    for i in range(3):
        ellipsoid('vent_black',(side*.20,.14,-.18-i*.12),(.065,.015,.029),void,wraith,6,12)
        ellipsoid('vent_ember',(side*.20,.153,-.18-i*.12),(.036,.007,.009),violet,wraith,6,10)
horn('dorsal_needle',[(0,.20,-.25),(0,.5,-.4),(0,.6,-.85),(0,.3,-1.2)],.08,.11,obsidian,wraith,18,10)

brood=root('amnion_brood_heavy')
body=ellipsoid('living_mass',(0,-.08,0),(.75,.42,.84),flesh,brood,18,36)
# A real open mouth: remove the dome under the iris so teeth overhang a dark cavity.
import bmesh
bm=bmesh.new();bm.from_mesh(body.data)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z > .23],context='VERTS')
bm.to_mesh(body.data);bm.free()
# Unequal overlapping bone petals leave a dark, deep, toothed aperture exposed to the game camera.
for k in range(9):
    angle=2*math.pi*k/9; width=.28+.045*math.sin(k*2.4); extent=1.02+.12*math.sin(k*3.1)
    verts=[];faces=[];rows=13;cols=9
    for j in range(rows):
        t=j/(rows-1); r=.39+(extent-.39)*t
        for i in range(cols):
            v=(i/(cols-1)*2-1); a=angle+width*v*(.72+.28*math.sin(t*math.pi))
            y=.37+.22*math.sin(t*math.pi)-.46*t*t-.045*v*v
            rr=r+.018*math.sin(t*29+k)*abs(v)**4
            verts.append((rr*math.cos(a),y,rr*math.sin(a)))
    for j in range(rows-1):
        for i in range(cols-1):
            a=j*cols+i; faces.append((a,a+1,a+cols+1,a+cols))
    o=mesh('calcified_iris_plate',verts,faces,bone if k%3 else ivory,brood,variation=.20)
    # Thin real underside closes the shell rather than exporting a two-sided transparent surface.
    mod=o.modifiers.new('bone_thickness','SOLIDIFY'); mod.thickness=.035
    bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    direction=(math.cos(angle),math.sin(angle))
    horn('peripheral_tusk',[(direction[0]*.75,.02,direction[1]*.75),(direction[0]*1.04,.08,direction[1]*1.04),(direction[0]*1.22,.15,direction[1]*1.22),(direction[0]*1.30,.30,direction[1]*1.30)],.07,.055,bone,brood,12,8)
ring('wet_gums',.355,.058,.27,gum,brood)
ring('buried_inner_rim',.23,.03,.1,flesh,brood)
ellipsoid('depth_of_mouth',(0,-.015,0),(.34,.08,.36),pit,brood,12,32)
ellipsoid('subsurface_heart',(0,.07,-.02),(.07,.04,.09),red,brood,10,16)
for k in range(15):
    a=k*2*math.pi/15; c=math.cos(a); s=math.sin(a); length=.14+.07*math.sin(k*2.1)**2
    horn('inward_tooth',[(c*.34,.30,s*.34),(c*.29,.33,s*.29),(c*.20,.21,s*.20),(c*length,.08,s*length)],.035,.025,ivory,brood,9,7)
for k in range(11):
    a=k*2*math.pi/11;c=math.cos(a);s=math.sin(a)
    horn('hanging_sinew',[(c*.50,-.12,s*.52),(c*.80,-.35,s*.69),(c*.66,-.65,s*.83),(c*.83,-.78,s*1.02)],.045,.036,flesh,brood,16,7)
    if k%3 == 0: ellipsoid('brood_nodule',(c*.59,-.25,s*.61),(.12,.14,.12),bone,brood,10,14)

def descendants(parent): return [parent]+list(parent.children_recursive)
def export(parent, relative):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in descendants(parent): o.select_set(True)
    bpy.context.view_layer.objects.active=parent
    path=ROOT/relative;path.parent.mkdir(parents=True,exist_ok=True)
    # The add-on's export-format enum is dynamic (empty RNA items before invocation).
    # Use its default binary format for the .glb destination.
    bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,use_active_scene=True,export_apply=True,export_extras=True,export_animations=False,export_vertex_color='ACTIVE')
    tris=0
    for o in descendants(parent):
        if o.type=='MESH': o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
    return {'file':relative,'triangles':tris,'bytes':path.stat().st_size}

manifest=[export(brood,'public/assets/amnion/brood-heavy-v1.glb'),export(wraith,'public/assets/umbra/wraith-v1.glb')]
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))

# A real Blender preview with grazing highlights so black surfaces remain black yet legible.
world=bpy.data.worlds.new('Phase studio');world.use_nodes=True
next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs[0].default_value=(.075,.09,.12,1)
scene.world=world
for name,location,power,color,size in [('key',(3,-4,5),950,(.75,.83,1),4),('edge',(-3,1,3),1200,(.44,.38,1),3),('fill',(2,3,2),650,(1,.70,.45),3)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=location;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('Phase review');camera=bpy.data.objects.new('Phase review',camera_data);scene.collection.objects.link(camera)
camera.location=(2.8,-4.8,6.5);camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=3.6;scene.camera=camera
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
for target,name in [(brood,'amnion-brood-heavy'),(wraith,'umbra-wraith')]:
    for p in [brood,wraith]:
        for o in descendants(p):o.hide_render=p!=target
    scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
for p in [brood,wraith]:
    for o in descendants(p): o.hide_render=False
brood.location.x=-1.9;wraith.location.x=1.9
print(json.dumps(manifest))
