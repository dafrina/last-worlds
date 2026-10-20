"""19 October boss sheets. Execute build(name) through the live Blender MCP.

Original meshes; references guide silhouettes, not textures. Existing target pivots,
hinges, track UVs and moving parts are preserved. All new geometry uses design space:
x right, y towards the player, z up. nf.finish converts to Blender before export.
"""
import os, sys, math, random
import bpy
from mathutils import Vector
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(__file__))
import cinematic_assets as ca
import nacre_fleet as nf
import vesper_common as vc
import bastion as ba
import helion_ark as ar
import warden as wa
import the_veil as ve

def mesh(seed): return vc.HS(random.Random('reference-20261019-'+seed))
def line(h, pts, r=.025, paint='steel', mat=1, sides=6):
    nf.tube(h, pts, r, paint, mat, seg=sides)

def box(h,c,s,paint,mat=0,ch=.035): h.box(c,s,ch,paint,mat,bottom=True)

def plate(h,pts,paint,mat=0,thick=.12):
    """Chamfered raised, planar armour plate with a recessed black perimeter."""
    p=[Vector(v) for v in pts]; n=nf.newell(p).normalized()
    if n.z<0: n=-n
    c=sum(p,Vector())/len(p)
    a=[h.v(v-n*thick*.5) for v in p]
    b=[h.v(c+(v-c)*.975+n*thick*.5) for v in p]
    h.face(tuple(b),paint,'main',mat,outward=n)
    h.face(tuple(reversed(a)),paint,'main',mat,outward=-n)
    for k in range(len(p)):
        j=(k+1)%len(p)
        h.face((a[k],a[j],b[j],b[k]),paint,'edge',mat,outward=(p[k]+p[j])*.5-c)

def grille(h,c,w,l,paint='steel',mat=1,count=8):
    x,y,z=c; box(h,c,(w,l,.05),'char',mat,.015)
    for k in range(count): box(h,(x,y-l*.44+l*.88*k/(count-1),z+.045),(w*.87,l/count*.35,.05),paint,mat,.004)

def bolts(h,pts,paint='steel',mat=1,r=.025):
    for x,y,z in pts: h.cyl((x,y,z),(0,0,1),r,.025,6,0,paint,mat=mat)

def cannon(h,x,y,z,scale=1,paint='steel',glow=2):
    h.cyl((x,y,z),(0,0,1),.27*scale,.17*scale,12,.015,paint,mat=1)
    box(h,(x,y,z+.24*scale),(.56*scale,.72*scale,.34*scale),paint,0,.06*scale)
    for dx in [-.14,.14]:
        h.cyl((x+dx*scale,y+.25*scale,z+.26*scale),(0,1,0),.065*scale,1.05*scale,10,.01,paint,mat=1)
        h.cyl((x+dx*scale,y+1.28*scale,z+.26*scale),(0,1,0),.078*scale,.09*scale,10,.005,paint,mat=1)
        h.cyl((x+dx*scale,y+1.375*scale,z+.26*scale),(0,1,0),.04*scale,.005,8,0,'lamp',mat=glow)

def weather_panels(h,pts,paint='ochre',trim='graphite',mat=0,rows=4,cols=3):
    """Subdivided armour, gaps and sparse corner fasteners instead of flat oversized faces."""
    a,b,c,d=map(Vector,pts)
    def q(u,v): return nf.lerp(nf.lerp(a,b,u),nf.lerp(d,c,u),v)
    for j in range(rows):
        for i in range(cols):
            u0=(i+.025)/cols;u1=(i+.975)/cols;v0=(j+.025)/rows;v1=(j+.975)/rows
            p=[q(u0,v0),q(u1,v0),q(u1,v1),q(u0,v1)]
            plate(h,p,trim if (i+2*j)%7==0 else paint,mat,.045)
            if (i+j)%2==0: bolts(h,[p[0]+Vector((0,0,.035)),p[2]+Vector((0,0,.035))],trim,1,.018)

def bastion_hull():
    h=mesh('bastion')
    box(h,(0,-.35,.62),(4.7,6,.8),'graphite_dk',1,.13)
    # Raised rear command tower and layered glacis; front centre remains low for core exposure.
    for side in [-1,1]:
        for y in [-2.8,-1.9,-1.0,.0,.9,1.8]:
            box(h,(side*1.56,y,1.04),(.55,.62,.22),'steel',1,.04)
            h.cyl((side*1.62,y,.7),(side,0,0),.12,.7,10,.01,'steel',mat=1)
        # Track shoulders are behind the firing sockets; front track arcs stay visible.
        weather_panels(h,[(side*2,-3.25,1.55),(side*3.48,-3.05,1.28),(side*3.48,-.75,1.38),(side*2,-.86,1.9)],rows=4,cols=2)
        grille(h,(side*2.65,-2.65,1.78),.7,.75,'steel',count=9)
        # Angular front cheek plates stop short of the glowing batteries.
        weather_panels(h,[(side*.44,1.55,1.25),(side*1.34,.25,1.68),(side*1.72,1.35,1.37),(side*.55,2.72,.85)],rows=3,cols=2)
        weather_panels(h,[(side*2.7,.72,1.4),(side*3.55,.2,1.28),(side*3.62,1.64,1.02),(side*3.04,2.12,1.06)],rows=2,cols=2)
        box(h,(side*3.48,-1.2,1.3),(.06,1.0,.065),'lamp',2,.005)
        # Long exposed pistons, suspension bridges, smaller shoulder artillery.
        for y in [-2.2,-.9,.6]:
            line(h,[(side*1.6,y,.8),(side*2.5,y,.95)],.09,'steel')
        cannon(h,side*2.65,-2.5,1.85,.72,'graphite')
        for yy in [-2.75,-2.1]:
            h.cyl((side*1.18,yy,1.2),(0,0,1),.07,1.25 if yy==-2.75 else .7,8,.005,'steel',mat=1)
        # Orange power conduits sit inside dark mechanical channels.
        box(h,(side*1.45,-.3,1.5),(.14,.58,.12),'graphite_dk',1,.02)
        box(h,(side*1.45,-.3,1.57),(.055,.48,.02),'lamp',2,.003)
    # Tall tower behind the playable central core, with a three-lobed power stack.
    h.cyl((0,-2.64,1.03),(0,0,1),.98,.32,20,.04,'steel',mat=1)
    box(h,(0,-2.7,2.12),(.94,1.12,1.8),'graphite',0,.13)
    for side in [-1,1]:
        box(h,(side*.68,-2.72,2.04),(.4,.8,1.48),'ochre',0,.08)
        box(h,(side*.68,-2.29,2.04),(.075,.035,1.13),'lamp',2,.004)
    box(h,(0,-2.12,2.08),(.54,.09,1.35),'ochre',0,.06)
    box(h,(0,-2.06,1.94),(.065,.02,.82),'lamp',2,.002)
    box(h,(0,-2.7,3.05),(.68,.84,.1),'ochre',0,.04)
    for side in [-1,1]: line(h,[(side*.29,-2.94,3.07),(side*.29,-2.94,3.5)],.022,'steel')
    # Front armoured prow and engine grille.
    box(h,(0,2.0,.85),(.44,1.55,.5),'graphite',0,.08)
    box(h,(0,2.78,.86),(.11,.035,.32),'lamp',2,.004)
    nf.finish(h)
    return h

def bastion():
    ba.PAINTS['ochre']=('#aa6537',.55);ba.PAINTS['ochre_w']=('#ae7951',.5)
    ca.scene('BASTION reference fortress');pieces=ba.build_all();pieces['bastion_hull']=bastion_hull()
    for side,nm in [(-1,'a'),(1,'b')]:
        h=mesh('bastion-core-armour'+nm)
        weather_panels(h,[(side*.025,-2.52,1.9),(side*1.28,-1.67,1.92),(side*.95,-.52,1.94),(side*.025,-.06,1.7)],rows=3,cols=2)
        box(h,(side*.095,-1.03,2.0),(.085,1.35,.045),'lamp',2,.005)
        nf.finish(h);pieces['bastion_core_shutter_'+nm]=h
    mats=ba.make_materials();objects=[]
    for name,h in pieces.items():
        if name not in ba.TREADS: vc.triangulate_nonplanar(h)
        context=[]
        objects.append(ba.make_object(name,h,mats,context))
    publish('khepri/bastion-9.glb',objects)

def ark_hull():
    h=mesh('ark')
    # Twin forward outriggers and a narrower centre keel form the reference's open trimaran.
    for side in [-1,1]:
        x=side*4.0
        outline=[(x-side*.7,-4.8),(x+side*.9,-4.1),(x+side*1.55,2.5),(x+side*.2,4.15),(x-side*1.15,2.6)]
        ca.solid(h,outline,-.48,1.25,'ceramic',1)
        weather_panels(h,[(x-side*.7,-4.5,1.2),(x+side*.8,-4,1.3),(x+side*1.1,2.1,1.3),(x-side*.85,2.1,1.6)],'pale','pale_dk',rows=8,cols=2)
        plate(h,[(x-side*.85,2.1,1.6),(x+side*1.1,2.1,1.3),(x+side*.2,4.15,.35)],'pale',thick=.14)
        # Vertical front armour and a recessed orange cut through each prow.
        for dx in [-.32,.32]:
            plate(h,[(x+side*(.2+dx),4.11,.15),(x+side*(.2+dx),4.11,1.05),(x+side*(dx+.8),3.24,1.2),(x+side*(dx+.8),3.24,.05)],'pale',thick=.08)
        box(h,(x+side*.18,4.12,.56),(.065,.03,.85),'lamp',2,.003)
        # Exposed black machinery in three distinct horizontal decks.
        for z in [.65,1.15,1.75]:
            box(h,(side*2.7,-2.85,z),(3.0,2.15,.13),'ceramic_grey',1,.025)
            for y in [-3.6,-3,-2.4]:
                box(h,(side*2.95,y,z+.15),(1.35,.22,.16),'steel',1,.02)
                box(h,(side*2.4,y,z+.24),(.32,.07,.035),'lamp',2,.003)
        for y in [-3.7,-2.3]:
            line(h,[(side*1.1,y,.5),(side*4.5,y,2.05)],.085,'steel')
        for j in range(7):
            y=-3.8+j*.38
            for z in [.82,1.32,1.85]:
                box(h,(side*2.75,y,z),(1.6,.2,.19),'ceramic_grey',1,.025)
                h.cyl((side*2.02,y,z),(side,0,0),.075,1.3,8,.008,'steel',mat=1)
                if j%2==0:box(h,(side*2.13,y,z+.11),(.14,.08,.025),'lamp',2,.002)
        # Large upper shoulder bridge and its actual supporting trusses.
        weather_panels(h,[(side*.82,-3.9,2.48),(side*4.9,-3.55,2.05),(side*4.85,-2.55,2.05),(side*.82,-2.65,2.48)],'pale','pale_dk',rows=2,cols=6)
        cannon(h,side*3.55,-3.15,2.22,.75,'pale')
        cannon(h,side*4.0,1.15,1.58,.62,'pale')
        # Slots, cooling assemblies and service trenches on the long side hull.
        for y in [-1.7,-.9,0,.8]:
            grille(h,(side*4.58,y,1.51),.4,.48,'steel',count=5)
            box(h,(side*5.05,y,.82),(.03,.42,.045),'lamp',2,.003)
            box(h,(side*3.12,y,.76),(.2,.62,.56),'ceramic_grey',1,.04)
            line(h,[(side*3.05,y-.21,.51),(side*3.05,y-.21,1.35),(side*3.55,y-.21,1.55)],.045,'steel')
        for z in [1.2,1.7,2.2]:
            box(h,(side*.85,-4.45,z),(.35,.6,.14),'steel',1,.02)
        # Two antennae and pale radar domes on the upper platform.
        for y,height in [(-3.5,3.65),(-4.5,3.9)]: line(h,[(side*1.5,y,2.45),(side*1.5,y,height)],.022,'steel')
        h.cyl((side*1.75,-3.75,2.48),(0,0,1),.23,.28,16,.05,'pale',mat=0,smooth=True)
    # Centre keel doesn't cover the bay doors or bridge's animated target.
    box(h,(0,-2,.2),(1.4,9,.55),'ceramic',1,.12)
    for y in [-5.4,-4.8,-4.2]:
        box(h,(0,y,1.3),(1.25,.36,1.7),'ceramic_grey',1,.04)
        for side in [-1,1]:box(h,(side*.5,y,2.18),(.11,.25,.035),'lamp',2,.002)
    for side in [-1,1]:
        plate(h,[(side*.12,-6.0,2.45),(side*.92,-3.3,2.65),(side*.8,-2.3,2.6),(side*.06,-2.05,2.45)],'pale',thick=.12)
        plate(h,[(side*.05,-6.15,4.8),(side*.75,-3.65,2.7),(side*.15,-3.1,2.5)],'pale',thick=.12)
        line(h,[(side*.12,-5.8,4.35),(side*.12,-3.4,2.7)],.025,'lamp',2)
    box(h,(0,-4.9,1.58),(.5,2.4,2.4),'ceramic',1,.03)
    # Small forward spear between doors, with a dark break beneath the bridge target.
    plate(h,[(0,3.9,.6),(-.33,1.1,.78),(.33,1.1,.78)],'pale',thick=.12)
    nf.finish(h);return h

def ark():
    ca.scene('HELION ARK reference trimaran');pieces={'ark_hull':ark_hull()};r=lambda n:random.Random('ark-sheet-'+n)
    for side,nm in [(-1,'left'),(1,'right')]:
        pieces['ark_radiator_'+nm]=ar.build_radiator(side,r(nm))
        pieces['ark_radiator_'+nm+'_wreck']=ar.build_radiator(side,r(nm+'wreck'),wreck=True)
        pieces['ark_bay_'+nm]=ar.build_bay(side,r(nm+'bay'))
        pieces['ark_bay_'+nm+'_door']=ar.build_bay_door(side,r(nm+'door'))
    pieces['ark_bridge']=ar.build_bridge(r('bridge'))
    for side,n in [(-1,'a'),(1,'b')]:pieces['ark_bridge_shutter_'+n]=ar.build_bridge_shutter(side,r(n))
    mats=[vc.make_material('ark_armor','vc',rough=.36,metal=.58),vc.make_material('ark_trim','vc',rough=.37,metal=.7),vc.make_material('ark_glow','glow')]
    objects=[]
    for name,h in pieces.items():
        vc.triangulate_nonplanar(h);cols=vc.bake(h,name,dict(glow={2},ao=.45,ground=None))
        objects.append(vc.make_object(name,h,mats,ar.SOCKETS[name],cols))
    objects.append(vc.make_empty('ark_wake_anchor',ar.SOCKETS['ark_wake_anchor']))
    publish('vesper/helion-ark.glb',objects)

def warden_hull():
    h=mesh('warden')
    box(h,(0,-.25,.65),(5.3,3.4,.72),'black',1,.12)
    for side in [-1,1]:
        # Broad slab shoulders, spaced from the command core and turret sweep.
        box(h,(side*2.03,1.3,1.03),(1.8,1.4,1.15),'grey_dk',1,.11)
        box(h,(side*2.03,1.36,1.56),(1.57,1.31,.22),'white',0,.085)
        box(h,(side*2.03,2.04,1.08),(1.61,.16,.79),'white',0,.095)
        box(h,(side*3.02,.75,.85),(.38,2.7,.91),'white_dk',0,.08)
        # Raised central shoulder blocks leave the command crown exposed.
        for yy in [-1.25,-.52]:
            box(h,(side*.89,yy,1.23),(.66,.65,.6),'white_dk',0,.065)
            box(h,(side*.89,yy,1.55),(.46,.47,.07),'white',0,.025)
            box(h,(side*.89,yy+.33,1.32),(.22,.035,.06),'black',1,.008)
        for y in [-1.4,-.6,.2,1.1]:
            line(h,[(side*1.1,y,.72),(side*2.8,y,.72)],.07,'silver')
            box(h,(side*1.25,y,.98),(.28,.31,.3),'grey',1,.025)
            box(h,(side*2.86,y,1.25),(.17,.3,.23),'grey_dk',1,.02)
        for j in range(4):
            y=.2+j*.38
            box(h,(side*.97,y,1.1),(.3,.24,.17),'grey',1,.025)
            line(h,[(side*.88,y,.85),(side*.88,y,1.24),(side*1.31,y,1.24)],.035,'silver')
        # Vents, bold panel splits, bolts and little amber navigation windows.
        grille(h,(side*2.03,.83,1.7),.75,.38,'silver',count=5)
        for dx in [-.65,.65]:
            bolts(h,[(side*2.03+dx,y,1.7) for y in [.89,1.75]],'grey',1,.025)
        box(h,(side*2.45,2.13,1.2),(.25,.025,.06),'lamp',4,.002)
        box(h,(side*1.25,.8,.65),(.45,1.3,.56),'grey',1,.04)
        # Big downward engine bells and external plumbing.
        h.cyl((side*2.1,1.25,.05),(0,0,1),.47,.55,20,.045,'grey',mat=1)
        h.cyl((side*2.1,1.25,.03),(0,0,1),.32,.025,20,0,'silver',mat=1)
        for a in range(8):
            ang=a*math.tau/8
            box(h,(side*2.1+.43*math.cos(ang),1.25+.43*math.sin(ang),.31),(.06,.06,.35),'black',1,.008)
        # Twin tall antenna masts behind the command block.
        x=side*.72;y=-1.7
        box(h,(x,y,1.57),(.25,.35,.55),'grey',1,.025)
        line(h,[(x,y,1.75),(x,y,3.6)],.025,'silver')
        for zz in [2.0,2.35]:h.cyl((x,y,zz),(0,0,1),.07,.3,8,.012,'white_dk',mat=0)
        box(h,(x,y,3.57),(.045,.045,.09),'lamp',4,.002)
    # Rear raised command visor, clear of the sliding core hatches.
    box(h,(0,-1.95,1.75),(1,.55,.66),'white',0,.08)
    box(h,(0,-1.64,1.83),(.66,.04,.26),'black',1,.025)
    box(h,(0,-1.61,1.79),(.34,.02,.035),'lamp',4,.002)
    # Long front command armour, split around an amber recessed slot.
    for side in [-1,1]:
        plate(h,[(side*.13,-.1,1.33),(side*.48,-.1,1.37),(side*.45,1.8,.88),(side*.16,2.15,.74)],'white',thick=.13)
    box(h,(0,1.13,1.02),(.09,1.54,.07),'lamp',4,.004)
    for x,y in wa.ENGINES:
        h.cyl((x,y,.14),(0,0,1),.25,.35,16,.025,'grey',mat=1)
    return h

def warden_pod(side):
    h=mesh('warden-pod'+str(side));x=side*2.1
    h.cyl((x,0,1.03),(0,0,1),.63,.23,16,.035,'grey',mat=1)
    box(h,(x,0,1.48),(1.16,1.11,.65),'grey_dk',1,.08)
    box(h,(x,-.08,1.76),(1.08,1.0,.16),'white',0,.06)
    for dx in [-.49,.49]:
        box(h,(x+dx,.03,1.49),(.16,.96,.55),'white',0,.05)
        bolts(h,[(x+dx,-.3,1.85),(x+dx,.3,1.85)],'grey',1,.022)
    for dx in [-.24,.24]:
        a=Vector((x+dx,.38,1.9));axis=Vector((side*.45,1,0)).normalized()
        h.cyl(a,axis,.105,1.8,12,.012,'grey',mat=1)
        for d in [.15,.95,1.7]:h.cyl(a+axis*d,axis,.13,.1,12,.008,'silver',mat=1)
        h.cyl(a+axis*1.81,axis,.072,.012,12,0,'lamp',mat=4)
    box(h,(x,.06,1.87),(.12,.38,.025),'lamp',4,.003)
    return h

def warden():
    ca.scene('WARDEN reference platform');r=lambda n:random.Random('warden-sheet-'+n)
    pieces={'warden_hull':warden_hull(),'warden_core':wa.build_core(r('core')),'warden_core_wreck':wa.build_core_wreck(r('wreck'))}
    for side,nm in [(-1,'left'),(1,'right')]:
        pieces['warden_pod_'+nm]=warden_pod(side)
        pieces['warden_pod_'+nm+'_wreck']=wa.build_pod(side,r(nm),wreck=True)
    for i,side in enumerate([-1,1]):
        h=mesh('warden-hatch'+str(i));x=side*.33
        box(h,(x,-.9,1.69),(.62,.96,.21),'white',0,.055)
        box(h,(x,-.9,1.805),(.35,.68,.035),'white_dk',0,.015)
        bolts(h,[(x,-1.2,1.83),(x,-.6,1.83)],'grey',1,.022)
        pieces['warden_core_hatch_'+str(i)]=h
    mats=wa.make_materials();objects=[]
    for name,h in pieces.items():
        nf.finish(h);cols=nf.bake(h,name,glow={4},ao_dist=.38,ground=None,paints=wa.PAINTS)
        objects.append(nf.make_object(name,h,mats,wa.SOCKETS[name],cols))
    for name,t in wa.EMPTIES.items():objects.append(vc.make_empty(name,t))
    publish('luna/warden.glb',objects)

def publish(path,objects):
    texture_materials(objects)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    target=os.path.join(ca.ROOT,'public','assets',path)
    bpy.ops.export_scene.gltf(filepath=target+'.tmp.glb',export_format='GLB',use_selection=True,use_active_scene=True,
        export_materials='EXPORT',export_vertex_color='ACTIVE',export_all_vertex_colors=False,
        export_texcoords=True,export_normals=True,export_yup=True,export_animations=False,
        export_cameras=False,export_lights=False,export_image_format='AUTO',
        export_copyright='Last Worlds — original Blender geometry and surface textures, boss_references.py')
    os.replace(target+'.tmp.glb',target)
    tris=0
    for o in objects:
        if o.type=='MESH':o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
    print('REFERENCE',path,tris,'triangles',os.path.getsize(target),'bytes')
    for o in objects:
        if '_wreck' in o.name:o.hide_render=True;o.hide_set(True)

def texture_materials(objects):
    """Blender-authored, tileable paint weathering. Packed in GLB; only armour uses it.

    An opaque colour tile modulates the baked vertex palette; no extra geometry,
    transparency, runtime noise evaluation or additional draw call is required.
    """
    import numpy as np
    # Periodic layered value noise gives broad oxidised patches and fine scratches.
    size=512;yy,xx=np.mgrid[0:size,0:size];rng=np.random.default_rng(191019)
    def layer(grid):
        a=rng.random((grid,grid));x=xx/size*grid;y=yy/size*grid
        i=x.astype(int);j=y.astype(int);u=x-i;v=y-j;u=u*u*(3-2*u);v=v*v*(3-2*v)
        return (a[j%grid,i%grid]*(1-u)+a[j%grid,(i+1)%grid]*u)*(1-v)+(a[(j+1)%grid,i%grid]*(1-u)+a[(j+1)%grid,(i+1)%grid]*u)*v
    broad=layer(8)*.55+layer(23)*.3+layer(61)*.15
    grain=rng.random((size,size));scratch=(np.sin(xx*.74+layer(9)*5)>.992)*(grain>.6)
    for kind in ['armour','nacre']:
        name='boss_reference_'+kind
        # Shared image datablocks must remain valid in the other generated boss scenes.
        image=bpy.data.images.get(name) or bpy.data.images.new(name,width=size,height=size,alpha=True)
        if kind=='armour':
            chip=np.clip((broad-.65)*8,0,1)
            rgb=np.ones((size,size,3))*(.76+broad[:,:,None]*.24)
            rgb*=1-chip[:,:,None]*np.array([.26,.25,.22])
            rgb-=scratch[:,:,None]*.1
        else:
            # Warped cellular veins, deliberately subtle under the violet vertex colour.
            veins=np.abs(np.sin(xx*math.tau/64+layer(5)*5)*np.sin(yy*math.tau/83+layer(7)*3))
            seam=np.clip((.035-veins)*18,0,.52)
            rgb=np.ones((size,size,3))*(.72+broad[:,:,None]*.28)
            rgb-=seam[:,:,None]*np.array([.32,.4,.44])
        rgba=np.concatenate([np.clip(rgb,0,1),np.ones((size,size,1))],axis=2).astype(np.float32)
        image.pixels.foreach_set(rgba.ravel());image.pack()
        mats={m for o in objects if o.type=='MESH' for m in o.data.materials if ('shell' in m.name if kind=='nacre' else any(t in m.name for t in ['bastion_armor','ark_armor','warden_hull','warden_paint']))}
        for m in mats:
            nt=m.node_tree;bs=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED')
            tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT'
            # glTF multiplies baseColor texture by COLOR_0 at runtime; Blender preview needs the same product.
            vcnode=next((n for n in nt.nodes if n.type=='VERTEX_COLOR'),None)
            mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
            if vcnode:nt.links.new(vcnode.outputs['Color'],mix.inputs[1])
            nt.links.new(tex.outputs['Color'],mix.inputs[2]);nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
            bs.inputs['Metallic'].default_value=.55 if kind=='nacre' else .48
            bs.inputs['Roughness'].default_value=.34 if kind=='nacre' else .43

def organic_panel(h,outer,inner,seed=0,bulge=.25,steps=24):
    """Crowned compound-curved nacre surface, with curved fitted plates and fine metal seams.

    The whole underside is black. Each top panel is a smooth tessellated patch; gaps
    reveal the frame instead of drawing rectangular strips over the armour.
    """
    oa=nf.bez_pts(outer,steps+1);ia=nf.bez_pts(inner,steps+1)
    def surf(t,u):
        p=nf.lerp(nf.bez([Vector(v) for v in outer],t),nf.bez([Vector(v) for v in inner],t),u)
        p.z+=bulge*math.sin(math.pi*u)*math.sin(math.pi*t)**.4
        return p
    underside=len(h.verts)
    nf.band(h,oa,ia,.06,(0,0,1),'frame',2,ridge=.5,facets=False)
    for v in h.verts[underside:]:v[2]-=.11
    # Two staggered courses of fitted curved plates (not a box grid).
    for row in range(2):
        for k in range(5):
            start=k/5+.0015;end=(k+1)/5-.0015
            grid=[]
            for i in range(7):
                t=start+(end-start)*i/6
                u0=row*.5+.002;u1=(row+1)*.5-.002
                # Seams bend organically across the wing surface.
                skew=.075*math.sin(math.pi*t*2)*math.sin(math.pi*t)
                grid.append([h.v(surf(t,u+skew*math.sin(math.pi*u))+Vector((0,0,.022))) for u in [u0+(u1-u0)*j/4 for j in range(5)]])
            for i in range(6):
                for j in range(4):h.face((grid[i][j],grid[i+1][j],grid[i+1][j+1],grid[i][j+1]),f'shell:{seed+row*5+k}','smooth',0,outward=(0,0,1))
            if k in [1,3]:
                pts=[surf(start,u)+Vector((0,0,.033)) for u in [.04,.17,.3,.43]]
                line(h,pts,.012,'bronze_dk',3,4)
    # Silver bevel perimeter, restrained teal inner rim, black spine beneath.
    line(h,[v+Vector((0,0,.027)) for v in oa],.024,'blade_dk',1,6)
    line(h,[v+Vector((0,0,.027)) for v in ia],.022,'blade_dk',1,6)
    seam=[surf(k/32,.5)+Vector((0,0,.028)) for k in range(1,32)]
    line(h,seam,.016,'bronze_dk',3,5)
    line(h,[v-Vector((0,0,.065)) for v in ia[4:-3]],.027,'lamp',4,5)
    return oa,ia

def egg(h,c,r,seed=0,mat=0):
    """Eight separated curved armour gores on an egg, with a real black interior."""
    cx,cy,cz=c;rx,ry,rz=r
    for k in range(8):
        rings=[]
        for i in range(10):
            t=.04+(math.pi-.08)*i/9
            ring=[]
            for j in range(5):
                a=math.tau*(k+(j/4)*.94+.03)/8
                ring.append(Vector((cx+rx*math.sin(t)*math.cos(a),cy+ry*math.cos(t),cz+rz*math.sin(t)*math.sin(a))))
            rings.append(ring)
        for i in range(9):
            for j in range(4):
                pts=[rings[i][j],rings[i+1][j],rings[i+1][j+1],rings[i][j+1]]
                cen=sum(pts,Vector())/4-Vector(c)
                h.face(tuple(h.v(p) for p in pts),f'shell:{seed+k}','smooth',mat,outward=cen)
        if k in [1,2,5,6]:line(h,[rings[i][0] for i in range(1,9)],.014,'blade_dk',1,5)
    line(h,[(cx,cy-ry*.8,cz+rz*.48),(cx,cy,cz+rz),(cx,cy+ry*.83,cz+rz*.48)],.022,'lamp',4,6)

def veil_hull():
    h=mesh('veil')
    # Open centre cradle. The heart itself and its four shell quarters are separate moving nodes.
    for r,z in [(1.17,1.72),(1.35,1.48)]:
        pts=[(r*math.cos(a),-1.8+r*math.sin(a),z) for a in [i*math.tau/48 for i in range(49)]]
        line(h,pts,.095,'frame',2,8)
    for side in [-1,1]:
        def p(x,y,z):return (side*x,y,z)
        # Outer hooked wings. Sweep back high, flare wide, then curl into long forward tips.
        oa,ia=organic_panel(h,[p(1.75,-5.8,3.45),p(6.75,-4.25,3.4),p(10.1,2.65,1.6),p(5.9,6.1,.95)],
                            [p(1.75,-5.8,3.45),p(2.9,-2.6,2.45),p(7.1,.7,1.65),p(5.9,6.1,.95)],11,bulge=.42)
        # The second layered blade exposes a deep mechanical valley against the outer wing.
        ob,ib=organic_panel(h,[p(1.6,-5.05,3.15),p(3.8,-3.5,3.2),p(6.5,-1.1,2.8),p(3.95,3.5,1.0)],
                            [p(1.6,-5.05,3.15),p(2.3,-2.8,2.25),p(5.1,-.5,2.6),p(3.95,3.5,1.0)],31,bulge=.36)
        # Inner overlapping pointed petals: narrow waist around the exposed flank targets.
        organic_panel(h,[p(.9,-3.55,2.75),p(4.0,-2.4,3.15),p(3.15,.3,2.5),p(.78,4.15,1.2)],
                        [p(.9,-3.55,2.75),p(1.0,-1.65,2.05),p(.85,2.45,1.85),p(.78,4.15,1.2)],51,bulge=.35)
        # Repeating curved load-bearing ribs bridge the dark open valleys.
        for k in range(4,19):
            t=k/24;a=ia[k];b=ob[k]
            c=(a+b)*.5-Vector((0,0,.34))
            line(h,[a-Vector((0,0,.15)),c,b-Vector((0,0,.17))],.065,'frame',2,6)
            if k%3==0:line(h,[a-Vector((0,0,.08)),c+Vector((0,0,.1))],.02,'lamp',4,5)
        # A dense irregular black load frame with short cylinders, ribs and conduits.
        # Everything joins the wing spars; retain the clear sight lane at x=+/-3.1, y=.4.
        for j in range(8):
            y=-3.25+j*.56;x=side*(2.55+j*.33)
            line(h,[(x,y,1.6),(x+side*.72,y+.2,1.7),(x+side*1.02,y-.14,2.2)],.11,'frame',2,8)
            line(h,[(x,y,1.7),(x+side*.72,y+.2,1.8)],.024,'lamp',4,5)
            h.cyl((x,y,1.65),(side,0,0),.17,.58,12,.02,'frame',mat=2,smooth=True)
            h.cyl((x+side*.2,y,1.65),(side,0,0),.19,.055,12,.012,'blade_dk',mat=1)
            line(h,[(x+side*.1,y-.2,1.75),(x+side*.4,y-.32,2.2),(x+side*.8,y,2.15)],.06,'frame',2,7)
        # Layered asymmetric small petal plates over the inner structural shoulders.
        for j in range(3):
            y=-3.4+j*.85
            organic_panel(h,[p(1.5,y-.4,2.45),p(2.9,y,2.7),p(2.75,y+.75,2.4),p(1.65,y+1.05,1.85)],
                            [p(1.5,y-.4,2.45),p(1.9,y+.1,2.1),p(2.1,y+.75,2.1),p(1.65,y+1.05,1.85)],150+j*10,bulge=.14,steps=16)
        # Three recessed egg berths beneath each shoulder, matching the sheet's open hangars.
        hangar=[]
        for j in range(3):
            x=side*(4.65+j*.78);y=2.1-j*.36;z=1.2
            egg(h,(x,y,z),(.32,.7,.34),70+j*8)
            # Paired rails and U-shaped cradles. No opaque roof obscures the parked pods.
            for dx in [-.39,.39]:
                line(h,[(x+dx,y-.66,1.4),(x+dx,y+.25,.78),(x+dx,y+.88,.67)],.055,'frame',2,7)
            line(h,[(x,y-.7,.92),(x,y+.85,.6)],.022,'lamp',4,5)
            hangar.append(Vector((x,y+.88,.67)))
        line(h,hangar,.085,'blade_dk',1,8)
        # Interior plumbing: angled spars and overlapping shoulder mechanisms.
        for j in range(5):
            y=-2.6+j*.63
            line(h,[p(1.1,y,1.5),p(2.05,y-.15,1.6),p(3.8,y+.24,1.25)],.07,'frame',2,7)
            line(h,[p(1.3,y,1.63),p(2.0,y-.15,1.73)],.025,'lamp',4,5)
        # Solid central keel and swept wishbones connect the carrier; open bays are framed, not floating.
        line(h,[p(1.2,-1.3,1.5),p(1.12,.7,1.2),p(.7,2.5,1.08),p(0,4,1.2)],.18,'frame',2,8)
        for j in range(5):
            y=-.35+j*.48
            line(h,[p(.15,y,1.16),p(.85,y-.15,1.24),p(1.28,y-.6,1.5)],.075,'blade_dk',1,6)
            line(h,[p(.24,y+.08,1.19),p(.78,y-.04,1.3)],.022,'lamp',4,5)
        # Arched hangar floor / lip behind the three egg berths, with staggered braces.
        lip=[p(4.15,3.0,.6),p(5.2,2.75,.55),p(6.2,2.26,.6),p(7,1.67,.83)]
        line(h,lip,.12,'frame',2,8)
        line(h,[(x,y,z+.1) for x,y,z in lip],.024,'lamp',4,5)
        for j in range(6):
            x=4.25+j*.44;y=2.9-j*.21
            line(h,[p(x,y,.62),p(x,y-.65,.4),p(x,y-1.15,1.15)],.065,'blade_dk',1,6)
        # Hanging escorts remain part of the carrier art; gameplay launches at the original bay sockets.
        for x,y in [(1.7,2.4),(2.5,1.7)]:
            egg(h,p(x,y,.82),(.29,.7,.31),90+int(x*10))
            line(h,[p(x,y-.5,.9),p(x,y-.75,1.5)],.06,'frame',2)
    # Rear detached-looking crown egg, central front prow and visible spine conduit.
    egg(h,(0,-5.25,3.08),(.65,1.47,.73),110)
    line(h,[(0,-4.1,2.55),(0,-3.45,2.55)],.04,'lamp',4)
    egg(h,(0,3.38,1.45),(.29,1.15,.4),120)
    line(h,[(0,2.2,1.46),(0,.45,1.45)],.065,'lamp',4)
    return h

def veil_shutter(k):
    # Quarter egg shell with unchanged hinge pivot and yaw. Opens with the existing local-X rig.
    h=mesh('veil-shutter'+str(k));phi=ve.SHUTTER_PHI[k]
    for j in range(10):
        a0=phi-math.pi/4+.012+j*(math.pi/2-.024)/10;a1=a0+(math.pi/2-.024)/10
        for i in range(14):
            t0=i/14*math.pi/2;t1=(i+1)/14*math.pi/2
            pts=[]
            for t,a in [(t0,a0),(t1,a0),(t1,a1),(t0,a1)]:
                pts.append(Vector((1.04*math.cos(t)*math.sin(a),-1.8+1.46*math.cos(t)*math.cos(a),2.06+1.84*math.sin(t))))
            h.face(tuple(h.v(p) for p in pts),f'shell:{130+k}','smooth',0,outward=(math.sin(phi),math.cos(phi),1))
    # Fine longitudinal meridian, a pair of curved armour seams, and a black hinge.
    for off in [-.72,.72]:
        a=phi+off
        line(h,[(1.045*math.cos(t)*math.sin(a),-1.8+1.465*math.cos(t)*math.cos(a),2.07+1.84*math.sin(t)) for t in [i/16*math.pi/2 for i in range(16)]],.018,'blade_dk',1,6)
    for t in [.35,.78]:
        line(h,[(1.05*math.cos(t)*math.sin(a),-1.8+1.47*math.cos(t)*math.cos(a),2.075+1.84*math.sin(t)) for a in [phi-.7+i*.14 for i in range(11)]],.012,'bronze_dk',3,5)
    # Central slot reads as a teal line down the egg instead of an oversized glowing dome.
    if k in [0,3]:
        line(h,[(.026 if k==0 else -.026,-1.8+1.47*math.cos(t),2.08+1.84*math.sin(t)) for t in [i/16*math.pi/2 for i in range(16)]],.022,'lamp',4,6)
    return h

def veil():
    ca.scene('VEIL crescent carrier');mats=nf.make_materials()
    nf.RAMPS['shell']=[(0,'#514569'),(.25,'#756480'),(.5,'#5c6283'),(.75,'#8b7896'),(1,'#514569')]
    pieces={'veil_hull':veil_hull()}
    for side,nm in [(-1,'left'),(1,'right')]:
        for wreck in [False,True]:pieces['veil_pod_'+nm+('_wreck' if wreck else '')]=ve.build_pod(side,random.Random(nm+str(wreck)),wreck)
    pieces['veil_heart']=ve.build_heart(random.Random('heart'))
    pieces['veil_heart_wreck']=ve.build_heart_wreck(random.Random('heartwreck'))
    for k in range(4):pieces['veil_heart_shutter_'+str(k)]=veil_shutter(k)
    objects=[]
    for name,h in pieces.items():
        # Share coincident smooth shell vertices within each armour panel. The HS
        # primitives deliberately isolate hard faces; curved eggs need continuous normals.
        shared={}
        for fi,face in enumerate(h.faces):
            if h.ftag[fi]!='smooth' or h.fmat[fi]!=0:continue
            idx=[]
            for vi in face:
                key=(h.fpaint[fi],*(round(c,6) for c in h.verts[vi]))
                idx.append(shared.setdefault(key,vi))
            h.faces[fi]=tuple(idx)
        nf.finish(h);cols=nf.bake(h,name,ao_dist=.48,ground=None,scale=.2,sheen=.32)
        yaw=ve.SHUTTER_PHI[int(name[-1])] if name.startswith('veil_heart_shutter_') else 0
        objects.append(nf.make_object(name,h,mats,ve.SOCKETS[name],cols,yaw=yaw))
    for name,p in ve.EMPTIES.items():
        if name.startswith('veil_engine'):p=(p[0],p[1],-6.6)
        objects.append(vc.make_empty(name,p))
    publish('nacre/the-veil.glb',objects)

def preview(name):
    """Authoring evidence at 45 degrees; browser captures verify the game's 55 degree camera."""
    names={'veil':'VEIL crescent carrier','bastion':'BASTION reference fortress','ark':'HELION ARK reference trimaran','warden':'WARDEN reference platform'}
    sc=bpy.data.scenes['Last Worlds — '+names[name]];bpy.context.window.scene=sc
    for o in list(sc.objects):
        if o.type in ['CAMERA','LIGHT']:bpy.data.objects.remove(o,do_unlink=True)
    vc.kit.add_sun((.4,.5,-.7),strength=3,color=(1,.95,.9),angle_deg=7)
    vc.kit.add_sun((-.6,-.3,-.3),strength=1.6,color=(.65,.8,1),angle_deg=8)
    vc.kit.setup_world(sc,(.07,.09,.14),.7)
    size={'veil':19.5,'bastion':9.7,'ark':15.8,'warden':8.7}[name]
    vc.kit.add_ortho_camera((0,0,1.4),45,size)
    vc.setup_render(sc,'EEVEE',32,1200,1100,exposure=.1)
    path=os.path.join(ca.ROOT,'art','boss-references');os.makedirs(path,exist_ok=True)
    vc.kit.render(os.path.join(path,name+'.png'))

def build(name):
    {'bastion':bastion,'ark':ark,'warden':warden,'veil':veil}[name]()
