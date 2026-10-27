"""Reference-led Wraith revision. Run through live Blender MCP; retain v1 and all user scenes."""
from pathlib import Path
ROOT = Path(r'\\wsl.localhost\Ubuntu\home\davidfarina\Projects\alien-skies')
# Reuse only the authored mesh helpers; stop before either old craft is constructed.
exec((ROOT/'tools/blender/phase_predators.py').read_text().split("wraith=root('umbra_wraith')")[0])
scene.name = 'Codex Wraith v2 swept void fighter'
craft = root('Wraith v2 review')
obsidian = material('wraith_v2_black_titanium', (.025,.023,.035), .29, .78)
edge = material('wraith_v2_chipped_plate_edges', (.065,.057,.085), .34, .7)
void = material('wraith_v2_recesses', (.003,.002,.006), .48, .45)
violet = material('wraith_v2_glow', (.24,.008,.65), .24, .3, 2.6)

def shell(name, outline, peak, mat, side=1):
    """Raised panel with an explicit ridge and a flat closed underside; crisp boundary, smooth crown."""
    ring=[(side*x,y,z) for x,y,z in outline]
    centre=(side*peak[0],peak[1],peak[2]); n=len(ring)
    vertices=[centre]+ring+[(x,y-.035,z) for x,y,z in ring]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces.append((0,1+i,1+j)); faces.append((1+i,1+n+i,1+n+j,1+j))
    faces.append(tuple(range(1+n,1+2*n)))
    if side<0: faces=[tuple(reversed(f)) for f in faces]
    o=mesh(name,vertices,faces,mat,craft,False,variation=.13)
    bevel=o.modifiers.new('tiny machined edge','BEVEL');bevel.width=.009;bevel.segments=2
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
    return o

def ribbon(name, a, b, c, d, width, mat):
    points=[a,b,c,d]; verts=[];faces=[];steps=28
    for j in range(steps+1):
        t=j/steps;p=bezier(points,t); tangent=(bezier(points,min(1,t+.002))-bezier(points,max(0,t-.002))).normalized()
        across=Vector((-tangent.z,0,tangent.x)).normalized()*width*(.25+.75*math.sin(math.pi*t))
        verts.extend([tuple(p-across),tuple(p+across)])
    for j in range(steps):faces.append((j*2,j*2+1,j*2+3,j*2+2))
    return mesh(name,verts,faces,mat,craft)

# Forward is positive game Z: long central spear with black inset sensor, no human cockpit.
horn('central spear',[(0,-.02,-.85),(0,.24,-.35),(0,.19,1.35),(0,-.02,1.95)], .32,.16,obsidian,craft,38,16,.7)
horn('black sensory recess',[(0,.195,.25),(0,.29,.6),(0,.16,1.17),(0,.035,1.64)], .14,.025,void,craft,30,12,.8)
for side in [-1,1]:
    # A continuous curved membrane with a scalloped trailing edge and blade-like outer tip.
    verts=[];faces=[];rows=30;cols=14
    for j in range(rows+1):
        u=j/rows;x=.27+u*1.27
        front=.55+.50*u-.30*math.sin(math.pi*u)
        back=-.92+1.90*u-1.2*math.sin(math.pi*u)
        for k in range(cols+1):
            v=k/cols;z=back+(front-back)*v
            y=.015+.16*math.sin(math.pi*u)+.13*math.sin(math.pi*v)*(1-u)
            verts.append((side*x,y,z))
    for j in range(rows):
        for k in range(cols):
            n=j*(cols+1)+k;face=(n,n+1,n+cols+2,n+cols+1)
            faces.append(tuple(reversed(face)) if side<0 else face)
    wing=mesh('swept scalloped wing',verts,faces,obsidian,craft,True,variation=.12)
    solid=wing.modifiers.new('wing shell underside','SOLIDIFY');solid.thickness=.045
    bpy.context.view_layer.objects.active=wing;bpy.ops.object.modifier_apply(modifier=solid.name)
    # Raised roots and long dorsal fins define the reference's two engine shoulders.
    ellipsoid('buried engine barrel',(side*.65,.11,-.68),(.22,.19,.40),void,craft,14,24)
    for i in range(4):
        z=-.81+i*.095
        ribbon('engine energized collar',(side*.48,.16,z),(side*.5,.35,z),(side*.79,.35,z),(side*.82,.15,z),.018,violet if i==1 else edge)
    shell('shoulder shell',[(.38,.19,-.78),(.47,.23,.38),(.79,.22,.24),(.91,.17,-.59),(.78,.18,-1.04)],(.65,.36,-.24),obsidian,side)
    shell('dorsal blade',[(.61,.30,-.85),(.64,.83,-1.04),(.68,.37,-.2),(.67,.25,.1)],(.665,.46,-.57),edge,side)
    # Segmented leading armor, with physical gaps exposing violet recessed channels.
    for i in range(4):
        u=i/4; x=.34+u*.93; z=.35+.19*u
        shell('overlapping wing armor',[(x,.14,z),(x+.29,.15,z+.18),(x+.22,.17,z-.23),(x+.04,.14,z-.49)],(x+.13,.19,z-.10),obsidian,side)
    ribbon('outer rim recess',(side*.43,.205,.45),(side*.77,.19,.31),(side*1.22,.105,.7),(side*1.53,.025,1.045),.023,void)
    ribbon('outer violet filament',(side*.43,.208,.45),(side*.77,.195,.31),(side*1.22,.11,.7),(side*1.53,.03,1.045),.008,violet)
    ribbon('nose filament',(side*.07,.065,1.73),(side*.20,.19,1.15),(side*.26,.25,.55),(side*.26,.23,.24),.009,violet)
    horn('rear crescent hook',[(side*.77,.16,-.54),(side*1.02,.20,-.25),(side*1.34,.07,.38),(side*1.54,.02,1.05)],.15,.055,obsidian,craft,28,12)
    ribbon('crescent underside glow',(side*.81,.12,-.58),(side*1.02,.13,-.29),(side*1.37,.02,.44),(side*1.53,.018,1.03),.012,violet)
    # Sparse nonemissive panel seams instead of noisy micro-geometry over every surface.
    for i in range(7):
        z=-.52+i*.27
        ribbon('hull panel join',(side*.05,.245,z),(side*.16,.24,z+.03),(side*.28,.18,z+.04),(side*.32,.125,z+.15),.006,void)

# Centre, preserve authored materials, export only this versioned asset.
for o in bpy.context.selected_objects:o.select_set(False)
for o in [craft]+list(craft.children_recursive):o.select_set(True)
bpy.context.view_layer.objects.active=craft
out=ROOT/'public/assets/umbra/wraith-v2.glb'
previous=bpy.data.objects.get('umbra_wraith')
if previous: previous.name='umbra_wraith_retained'
craft.name='umbra_wraith'
bpy.ops.export_scene.gltf(filepath=str(out),use_selection=True,use_active_scene=True,export_apply=True,export_extras=True,export_animations=False,export_vertex_color='ACTIVE')
craft.name='Wraith v2 review'
if previous: previous.name='umbra_wraith'
tris=0
for o in craft.children_recursive:
    if o.type=='MESH':o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
OUT=ROOT/'lookdev/phase-predators';OUT.mkdir(exist_ok=True,parents=True)
(OUT/'wraith-v2.json').write_text(json.dumps({'triangles':tris,'bytes':out.stat().st_size,'source':'user reference 221b3d95, 26 October 2026','previous':'wraith-v1.glb'},indent=2))
scene.world=bpy.data.worlds.new('Wraith v2 studio');scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.065,.075,.11,1)
for name,loc,power,col,size in [('key',(1,-3,5),900,(.75,.82,1),5),('rim',(-3,2,3),1100,(.5,.3,1),3)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Wraith review');o=bpy.data.objects.new('Wraith review',d);scene.collection.objects.link(o)
o.location=(2,-4,6);o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=4.4;scene.camera=o
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'wraith-v2.png');bpy.ops.render.render(write_still=True)
print(json.dumps({'triangles':tris,'bytes':out.stat().st_size}))
