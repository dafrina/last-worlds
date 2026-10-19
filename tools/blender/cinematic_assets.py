"""18 October reference refinement. Run through Blender MCP: build('hero'|'facilities'|'veil'|'terrain').

All mesh authoring occurs in Blender. Existing scenes are preserved; exports contain only the new scene.
Uses the established HS pipeline, named combat sockets and baked vertex AO. No downloaded assets.
"""
import bpy, math, os, sys, random, json
from mathutils import Vector, Matrix
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(__file__))
import vesper_common as vc
import khepri_kit as kit
import nacre_fleet as nf
import the_veil as old

def scene(name):
    previous = bpy.data.scenes.get('Last Worlds — ' + name)
    if previous:
        for o in list(previous.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(previous)
    made = bpy.data.scenes.new('Last Worlds — ' + name)
    bpy.context.window.scene = made
    return made

def export(path, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    target = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=target+'.tmp.glb', export_format='GLB', use_selection=True, use_active_scene=True,
        export_materials='EXPORT', export_vertex_color='ACTIVE', export_all_vertex_colors=False,
        export_texcoords=True, export_normals=True, export_yup=True, export_animations=False,
        export_cameras=False, export_lights=False, export_image_format='NONE',
        export_copyright='Last Worlds — original Blender geometry, cinematic_assets.py')
    os.replace(target+'.tmp.glb', target)
    tri=0
    for o in objects:
        if o.type=='MESH': o.data.calc_loop_triangles(); tri+=len(o.data.loop_triangles)
    print(json.dumps(dict(path=path, triangles=tri, bytes=os.path.getsize(target), nodes=[o.name for o in objects])))

PAINTS = dict(vc.PAINTS, ivory=('#c8c9bd',.2,'#ece7d5'), rust=('#78442f',.25,'#b17852'),
             ochre=('#88673e',.25,'#baa17d'), metal=('#454e58',.35,'#9baab4'), black=('#10171e',.15,'#455564'),
             nacre=('#394156',.25,'#7d8aa6'), ice=('#b3c8d8',.25,'#e0ecf2'))

def solid(h, points, z, height, paint, mat=0):
    # Chamfered planar hard-surface plate, authored in Blender x/y with +z up.
    lo=[h.v((x,y,z)) for x,y in points]; hi=[h.v((x,y,z+height)) for x,y in points]
    h.face(tuple(hi),paint,'main',mat,outward=(0,0,1))
    h.face(tuple(reversed(lo)),paint,'main',mat,outward=(0,0,-1))
    for i in range(len(points)):
        j=(i+1)%len(points); a,b=points[i],points[j]
        h.face((lo[i],lo[j],hi[j],hi[i]),paint,'edge',mat,outward=(b[1]-a[1],a[0]-b[0],0))

def obj(name,h,mats,glow={2},ao=.3):
    vc.triangulate_nonplanar(h)
    colors=vc.bake(h,name,dict(glow=glow,paints=PAINTS,ao=ao,ground=None))
    return vc.make_object(name,h,mats,(0,0,0),colors)

def hero():
    scene('Scrapper')
    mats=[vc.make_material('scrapper_plate','vc',rough=.43,metal=.35),vc.make_material('scrapper_frame','vc',rough=.29,metal=.82),
          vc.make_material('scrapper_glow','glow',colour='#78f9f1',emission=3)]
    h=vc.HS(random.Random('scrapper-20261018'))
    solid(h,[(-.14,-.47),(.14,-.47),(.19,.24),(.1,.6),(-.1,.6),(-.19,.24)],-.09,.18,'rust')
    solid(h,[(-.1,.15),(.1,.15),(.105,.39),(0,.61),(-.105,.39)],.10,.035,'ivory')
    solid(h,[(-.102,.02),(.102,.02),(.078,.27),(-.078,.27)],.12,.07,'black',1)
    for side in [-1,1]:
        wing=[(side*.13,.22),(side*.5,-.12),(side*.47,-.29),(side*.14,-.17)]
        if side>0: wing.reverse()
        solid(h,wing,-.04,.055,'ivory')
        h.box((side*.27,-.23,.0),(.3,.065,.065),.008,'metal',1)
        for x in [side*.13,side*.16]: h.box((x,.08,.205),(.012,.28,.012),.002,'metal',1)
        h.cyl((side*.38,.15,.0),(0,-1,0),.102,.59,20,.009,'rust',mat=0,smooth=True)
        h.cyl((side*.38,-.435,.0),(0,-1,0),.105,.07,20,.006,'black',mat=1,smooth=True)
        h.cyl((side*.38,-.505,.0),(0,-1,0),.066,.012,16,.0,'lamp',mat=2,smooth=True)
        for y in [-.27,-.06,.13]: h.cyl((side*.38,y,.0),(0,1,0),.106,.022,20,.003,'metal',mat=1,smooth=True)
        h.box((side*.38,-.14,.102),(.07,.2,.025),.004,'ivory',0)
        for i in range(5): h.box((side*.135,-.08-i*.047,.11),(.055,.018,.022),.002,'black',1)
        h.cyl((side*.223,.38,-.025),(0,1,0),.022,.28,10,.003,'metal',mat=1)
        h.box((side*.24,.35,-.025),(.06,.05,.08),.005,'black',1)
        # A few large repair plates and fasteners are worth pixels on the player, unlike background rivets.
        for x,y in [(side*.29,-.14),(side*.42,-.19),(side*.12,.4)]:
            h.box((x,y,.04 if abs(x)>.2 else .15),(.025,.025,.012),.002,'metal',1)
    h.box((-.08,-.3,.115),(.09,.16,.028),.005,'ivory',0)
    h.box((.07,.44,.16),(.055,.07,.015),.003,'rust',0)
    model=obj('hero_scrapper',h,mats,ao=.12)
    sockets=[vc.make_empty('hero_scrapper_engine_'+str(i),(x,0,.517)) for i,x in enumerate([-.38,.38])]
    export('public/assets/shared/hero-scrapper.glb',[model]+sockets)

def facilities():
    scene('Facility compounds')
    all=[]
    for planet in ['khepri','vesper','nacre']:
        mats=[vc.make_material(planet+'_facility_plate','vc',rough=.48,metal=.45),vc.make_material(planet+'_facility_frame','vc',rough=.36,metal=.78),
              vc.make_material(planet+'_facility_glow','glow',colour='#56cfc8' if planet=='nacre' else '#ef9a52',emission=2)]
        for large in [False,True]:
            h=facility_mesh(planet,large)
            model=obj('facility_'+planet+('_large' if large else ''),h,mats,ao=.42); all.append(model)
    export('public/assets/shared/facility-compounds.glb',all)

def facility_mesh(planet,large):
        h=vc.HS(random.Random('facility-'+planet+str(large))); paint='nacre' if planet=='nacre' else 'ice' if planet=='vesper' else 'ochre'
        dx=.95 if large else 0; dy=1.5 if large else 0
        # Recessed gun court at origin. Rear plant, side turbines, service decks and connecting conduits.
        for side in [-1,1]:
            # Author the two wings locally, then spread/extend the large variant's plant.
            start=len(h.verts)
            h.box((side*2.25,1.4,-.3),(2.1,5.8,.65),.04,'black',1)
            h.box((side*2.25,1.5,.15),(1.8,4.6,.25),.035,'metal',1)
            h.box((side*2.35,2.7,.85),(1.7,2.2,1.4),.055,paint,0)
            h.box((side*2.35,2.7,1.58),(1.5,2,.12),.025,'metal',1)
            for k in range(5):
                h.box((side*2.35,1.9+k*.32,1.66),(1.1,.15,.065),.008,'black',1)
                h.box((side*3.16,2.02+k*.29,.95),(.025,.16,.6),.004,'black',1)
            # Tall, load-bearing support struts descend below uneven ground / into the mire.
            for y in [-1,1,3.8]: h.box((side*2.5,y,-.85),(.45,.5,1.8),.025,'black',1)
            h.cyl((side*2.25,-.2,.3),(0,0,1),.6,1.2,16,.025,paint,mat=0)
            for z in [.4,1.32]: h.cyl((side*2.25,-.2,z),(0,0,1),.63,.08,16,.01,'metal',mat=1)
            # Tank crown, dark service hatches, cap bolts and a rear pipe elbow.
            h.cyl((side*2.25,-.2,1.5),(0,0,1),.41,.10,16,.012,'black',mat=1)
            h.cyl((side*2.25,-.2,1.59),(0,0,1),.23,.07,12,.008,'metal',mat=1)
            for k in range(6):
                a=k*math.tau/6
                h.cyl((side*2.25+.5*math.cos(a),-.2+.5*math.sin(a),1.43),(0,0,1),.045,.09,6,.004,'metal',mat=1)
            h.cyl((side*2.25,.4,.9),(0,1,0),.12,.85,10,.01,'metal',mat=1)
            h.cyl((side*2.25,1.2,.4),(0,0,1),.15,.6,10,.01,'metal',mat=1)
            # Raised roof equipment breaks up the formerly flat slab: turbine, cowling and cooling fins.
            h.box((side*2.35,3.15,1.82),(1.1,.9,.38),.035,paint,0)
            h.cyl((side*2.35,3.15,2.01),(0,0,1),.39,.11,16,.01,'black',mat=1)
            h.cyl((side*2.35,3.15,2.12),(0,0,1),.13,.09,10,.008,'metal',mat=1)
            for k in range(6):
                a=k*math.tau/6
                nf.tube(h,[Vector((side*2.35+.13*math.cos(a),3.15+.13*math.sin(a),2.15)),Vector((side*2.35+.34*math.cos(a+.3),3.15+.34*math.sin(a+.3),2.12))],.035,'metal',1,seg=4)
            for k in range(4):
                h.box((side*2.35,1.86+k*.23,1.83),(1,.09,.3),.006,'metal',1)
                h.box((side*3.21,1.9+k*.4,.8),(.17,.10,1.4),.012,paint,0)
            # Stairs into the court, stair stringers, wall ribs and recessed doors.
            for k in range(5): h.box((side*1.19,-.95+k*.19,.02+k*.06),(.42,.21,.12),.008,'metal',1)
            h.box((side*1.48,2.55,.7),(.035,.7,.95),.005,'black',1)
            h.box((side*1.44,2.55,1.21),(.045,.85,.06),.005,'metal',1)
            for y in [1.65,3.75]: h.box((side*1.44,y,.85),(.16,.14,1.5),.012,'metal',1)
            h.box((side*1.4,1.4,.37),(.18,4.7,.17),.018,'metal',1)
            for k in range(3): h.box((side*1.38,-.65+k*1.4,.5),(.035,.23,.045),.003,'lamp',2)
            # Railings and braces; large facets, no field of tiny repeated boxes.
            for y in [-1,0.7,2.4,4]: h.box((side*3.24,y,.49),(.07,.07,.7),.007,'metal',1)
            h.box((side*3.24,1.5,.83),(.055,5.3,.065),.007,'metal',1)
            if planet=='nacre':
                # Broken crescent monoliths emerging from the facility's two wings.
                for k in range(3):
                    x=side*(2.0+k*.35); y=3.0-k*.3; height=2.65-k*.35
                    solid(h,[(x-.13,y-.38),(x+.13,y-.26),(x+.18,y+.3),(x-.13,y+.42)],.55,height-.55,'nacre',0)
                    h.box((x,y-.36,1.5),(.035,.025,1.5),.003,'lamp',2)
            else:
                # Exhaust stack collars and a protected communications mast.
                for x in [side*2.0,side*2.65]:
                    h.cyl((x,3.65,1.6),(0,0,1),.16,.93,10,.012,'black',mat=1)
                    h.cyl((x,3.65,2.43),(0,0,1),.21,.12,10,.01,'metal',mat=1)
            if large:
                # Additional forward pump bay and longer supporting deck, not a uniformly scaled clone.
                h.box((side*2.25,1.6,-.3),(2.3,8.4,.65),.04,'black',1)
                h.box((side*2.25,-1.8,.44),(1.75,1.4,.65),.04,paint,0)
                for k in range(5): h.box((side*2.25,-2.27+k*.23,.82),(1.35,.09,.13),.006,'metal',1)
                h.cyl((side*2.25,-1.8,.87),(0,0,1),.23,.16,12,.01,'black',mat=1)
                for y in [-2.4,5.4]:h.box((side*2.5,y,-.85),(.5,.55,1.8),.025,'black',1)
                h.box((side*2.35,4.8,.9),(1.7,1.15,1.5),.04,paint,0)
                for k in range(4): h.box((side*2.35,4.4+k*.26,1.75),(1.4,.1,.18),.008,'metal',1)
                # Elevated catwalk joins the rear control plant and side machine halls.
                h.box((side*.95,4.8,1.3),(2.5,.6,.16),.018,'metal',1)
                for x in [side*.3,side*1.6]:h.box((x,5.08,1.65),(.06,.06,.65),.005,'metal',1)
                h.box((side*.95,5.08,1.97),(2.4,.05,.05),.006,'metal',1)
                for vi in range(start,len(h.verts)): h.verts[vi][0]+=side*dx
        # Back plant and its raised command cupola sit beyond the unobstructed central gun court.
        start=len(h.verts)
        h.box((0,3.4,.1),(2.8,1.5,.4),.035,'black',1)
        h.box((0,3.6,1.05),(2.4,1.2,1.6),.045,paint,0)
        h.box((0,2.98,1.1),(1.75,.04,.85),.008,'black',1)
        for i in range(6): h.box((-.73+i*.29,2.95,1.12),(.13,.025,.63),.003,'metal',1)
        h.box((0,2.94,1.62),(1.6,.025,.045),.003,'lamp',2)
        h.box((0,3.6,2.0),(1.5,.95,.3),.03,'metal',1)
        h.box((0,3.55,2.3),(1.0,.65,.4),.025,paint,0)
        h.box((0,3.21,2.3),(.7,.025,.18),.003,'black',1)
        for x in [-.46,.46]:h.box((x,3.22,2.3),(.06,.06,.34),.004,'metal',1)
        if large:
            for vi in range(start,len(h.verts)): h.verts[vi][1]+=dy
            # Twin rear heat exchangers and a transverse pipe manifold give the larger site a distinct silhouette.
            for side in [-1,1]:
                h.cyl((side*1.35,5.1,.25),(0,0,1),.46,2.3,12,.02,paint,mat=0)
                for z in [.4,1.5,2.48]:h.cyl((side*1.35,5.1,z),(0,0,1),.5,.1,12,.01,'metal',mat=1)
                h.cyl((side*1.35,5.1,2.58),(0,0,1),.25,.25,12,.008,'black',mat=1)
                h.cyl((side*.65,5.1,1.8),(side,0,0),.11,2.1,10,.008,'metal',mat=1)
        # Split apron leaves the live gun and its target marker clear.
        for side in [-1,1]: h.box((side*.95,-.25,-.03),(.4,2.7,.16),.015,'metal',1)
        return h

def carrier_hull():
    h=vc.HS(random.Random('veil-carrier-20261018'))
    P=old.P
    # Narrow, black central spine, opening around the heart socket; separate top spear / bow petal.
    nf.tube(h,[P(0,-9.1,2.2),P(0,-5,2.0),P(0,-3.1,1.2)], [.0,.7,.5],'frame',nf.FRAME,seg=10,apex_start=True)
    nf.tube(h,[P(0,-.5,1.3),P(0,2.4,1.8),P(0,6.2,1.2)],[.6,.55,0],'frame',nf.FRAME,seg=10,apex_end=True)
    outlines=[
      # outer crescent — sharp backswept upper tip and hooked forward tip, with a wide open inner void
      ([(2.0,-6.6,1.6),(6.2,-6.4,1.6),(11.8,-1.8,1.3),(8.7,5.6,1.3)],[(2.0,-6.6,1.6),(4.1,-1.5,1.5),(6.2,2.0,1.2),(8.7,5.6,1.3)],.88),
      # middle raised petals crossing into the main crescent
      ([(1.6,-4.8,1.8),(4.9,-5.7,1.8),(6.9,-.1,1.6),(4.5,4.0,1.6)],[(1.6,-4.8,1.8),(2.2,-.9,1.8),(3.9,1.4,1.6),(4.5,4.0,1.6)],.65),
      # inner protective blades, clear of the gameplay heart and the two flank targets
      ([(1.0,-3.7,1.8),(2.6,-2.8,2),(2.0,1.6,1.8),(1.3,3.5,1.6)],[(1.0,-3.7,1.8),(.9,-1.1,1.9),(1.1,1.2,1.8),(1.3,3.5,1.6)],.27)
    ]
    for side in [-1,1]:
      for j,(oa,ia,th) in enumerate(outlines):
        # Longer, narrower crescents, raised into three distinct armour decks around the heart.
        lift=[.55,.95,.5][j]
        O=nf.bez_pts([P(side*x*.9,y*1.1,z+lift) for x,y,z in oa],25)
        I=nf.bez_pts([P(side*x*.9,y*1.1,z+lift) for x,y,z in ia],25)
        # Bow the middle blades outward, keeping the fixed flank cores visible beneath the taller wings.
        if j==1:
          for k in range(25):
            offset=P(side*1.1*math.sin(math.pi*k/24),0,0)
            O[k]+=offset; I[k]+=offset
        # Curved armour has a dozen actual cross-section samples. Shared vertices give broad metallic
        # highlights, with a sharp rim and a separate underside; no paper-flat triangular wing panels.
        for bottom in [False, True]:
          grid=[]; cols=10
          for k,(a,b) in enumerate(zip(O,I)):
            t=k/(len(O)-1); row=[]
            for u in range(cols+1):
              f=u/cols; bulge=math.sin(math.pi*f)**.85 * (th*math.sin(math.pi*t)**.65+.018)
              row.append(h.v(nf.lerp(a,b,f)+P(0,0,(-.45 if bottom else 1)*bulge)))
            grid.append(row)
          for k in range(len(grid)-1):
            for u in range(cols):
              if not bottom and j<2 and u in [4,5,6] and any(n-2<=k<n+1 for n in [7,12,17]): continue
              h.face((grid[k][u],grid[k+1][u],grid[k+1][u+1],grid[k][u+1]),
                     'shell_dk' if bottom else 'shell:'+str(j+3),'smooth',nf.SHELL,outward=(0,0,-1 if bottom else 1))
        # Thin machined rim and black recessed panel channels, tied to actual surface curvature.
        nf.tube(h,O,.035,'blade_dk',nf.BLADE,seg=5,tags='smooth')
        for k in [6,13,19]:
          a,b=O[k],I[k]
          seam=[nf.lerp(a,b,u/12)+P(0,0,math.sin(math.pi*u/12)**.85*(th*math.sin(math.pi*k/24)**.65+.018)+.018) for u in range(1,12)]
          nf.tube(h,seam,.016,'frame_dk',nf.FRAME,seg=4)
        # Long inset boundary follows the curvature, giving each huge plate a machined inner panel.
        seam=[nf.lerp(O[k],I[k],.25)+P(0,0,math.sin(math.pi*.25)**.85*(th*math.sin(math.pi*k/24)**.65+.018)+.018) for k in range(3,22)]
        nf.tube(h,seam,.012,'bronze_dk',nf.BRONZE,seg=4)
        # Teal inlays only inside armour gaps, not every edge.
        pts=[nf.lerp(O[k],I[k],.88)+P(0,0,.04) for k in range(4,20)]
        nf.tube(h,pts,.027,'lamp',nf.TEAL,seg=5,tags='smooth')
        if j<2:
          def surface(k,f,raise_z=0):
            return nf.lerp(O[k],I[k],f)+P(0,0,math.sin(math.pi*f)**.85*(th*math.sin(math.pi*k/24)**.65+.018)+raise_z)
          # Open slots cut into the actual top shell. Dark floors, side walls and ribs sit below the armour.
          for k in [7,12,17]:
            outer=[surface(n,.40,-.25) for n in range(k-2,k+2)]
            inner=[surface(n,.70,-.25) for n in range(k-2,k+2)]
            nf.band(h,outer,inner,.015,(0,0,1),'frame_dk',nf.FRAME,ridge=.5,facets=False)
            border=[surface(n,.4) for n in range(k-2,k+2)]+[surface(n,.7) for n in reversed(range(k-2,k+2))]
            for a,b in zip(border,border[1:]+border[:1]):
              h.face(tuple(h.v(v) for v in [a,b,b-P(0,0,.25),a-P(0,0,.25)]),'frame','main',nf.FRAME,outward=(0,0,1))
            nf.tube(h,border+[border[0]],.025,'blade_dk',nf.BLADE,seg=4)
            for n in range(k-2,k+1):
              nf.tube(h,[surface(n,.43,-.09),surface(n,.67,-.09)],.04,'blade_dk',nf.BLADE,seg=4)
            nf.tube(h,[surface(k-2,.69,-.16),surface(k+1,.69,-.16)],.016,'lamp',nf.TEAL,seg=4)
          # Individual access plates with substantial edge rails, not a flat surface texture.
          for k in [9,15]:
            a=[surface(n,.12,.09) for n in range(k-2,k+2)]
            b=[surface(n,.29,.09) for n in range(k-2,k+2)]
            nf.band(h,a,b,.06,(0,0,1),'shell:4',nf.SHELL,ridge=.1,facets=True)
      # Open lattice spars behind the shell make the crescent cutouts read as constructed machinery.
      for dx in [0,.6]:
        nf.tube(h,[P(side*(1.1+dx),-5.8,.8),P(side*(2.6+dx),-2.8,.6),P(side*(4.1+dx),.2,.5),P(side*(6.7+dx),3.6,.7)],
                [.12,.32,.36,.08],'frame',nf.FRAME,seg=8,tags='smooth')
      # Exposed stacked machinery rises into the void under the wing: conduits, radiators and ribbed shrouds.
      for k in range(4):
        x=side*(4.5+k*.55); y=-1.2+k*1.1; z=1.6
        nf.tube(h,[P(x,y-.65,z),P(x,y+.65,z)],[.25,.22],'frame_dk',nf.FRAME,seg=8)
        for d in [-.45,0,.45]:
          nf.arc_band(h,.28,.045,.06,0,math.tau,12,'blade_dk',nf.BLADE,
              m=Matrix.Translation(P(x,y+d,z)) @ Matrix.Rotation(math.pi/2,4,'X'),full=True)
        nf.tube(h,[P(x-side*.32,y-.45,z+.1),P(x-side*.32,y+.5,z+.1)],.045,'bronze_dk',nf.BRONZE,seg=5)
        nf.tube(h,[P(x+side*.24,y-.35,z+.1),P(x+side*.24,y+.3,z+.1)],.024,'lamp',nf.TEAL,seg=4)
      # Crown fins create true height in the shoulder silhouette; dark feet stay visible below the violet plates.
      for k in range(3):
        x=side*(2.35+k*.72); y=-4.7+k*.55
        nf.tube(h,[P(x,y+.5,1.3),P(x,y,3.4-k*.15),P(x,y-1.1,3.9-k*.2)],[.22,.16,0],'frame',nf.FRAME,seg=6,apex_end=True)
        a=[P(x-side*.13,y+.8,2),P(x-side*.13,y,3.5-k*.15),P(x,y-1.2,4.1-k*.2)]
        b=[P(x+side*.17,y+.8,2),P(x+side*.2,y-.1,3.5-k*.15),P(x,y-1.2,4.1-k*.2)]
        nf.band(h,a,b,.06,(0,0,1),'shell:4',nf.SHELL,ridge=.12,facets=True)
      for k in range(6):
        y=-3.3+k*1.1; x=side*(4.3+math.sin(k/5*math.pi)*1.3)
        nf.tube(h,[P(side*2,y,1.0),P(x,y+.55,1.05),P(side*7.0,y+.2,1.05)],.09,'frame',nf.FRAME,seg=5)
      # Recessed hangars with four parked egg-like pods on each side (reference carrier bays).
      for k in range(4):
        x=side*(4.1+k*.77); y=2.7+k*.12
        h.box((x,y,1.35),(.68,1.5,.16),.035,'frame_dk',nf.FRAME)
        nf.tube(h,[P(x,y-.7,1.5),P(x,y-.12,1.8),P(x,y+.62,1.55)],[0,.33,0],'shell_dk',nf.SHELL,seg=12,tags='smooth',apex_start=True,apex_end=True)
        nf.tube(h,[P(x,y-.25,2.03),P(x,y+.12,1.97)],.026,'lamp',nf.TEAL,seg=5)
        # Three-dimensional hangar mouth, ribs and overhead clamps shelter each parked pod.
        nf.tube(h,[P(x-.36,y+.7,1.1),P(x-.36,y+.7,2.15),P(x,y+.7,2.38),P(x+.36,y+.7,2.15),P(x+.36,y+.7,1.1)],.065,'frame',nf.FRAME,seg=5)
        nf.tube(h,[P(x,y-.6,2.3),P(x,y+.65,2.3)],.075,'blade_dk',nf.BLADE,seg=5)
        for side_rib in [-1,1]:nf.tube(h,[P(x+side_rib*.32,y-.6,1.35),P(x+side_rib*.32,y+.65,1.35)],.06,'frame',nf.FRAME,seg=5)
      nf.tube(h,[P(side*.7,-.1,1.2),P(side*3.1,.4,1.4)],[.24,.2],'frame',nf.FRAME,seg=8)
      # The two functional launch sockets retain a real open throat beneath the forward blades.
      nf.arc_band(h,.42,.09,.13,0,2*math.pi,20,'frame',nf.FRAME,m=Matrix.Translation(P(side*1.7,2.6,1.8)),full=True)
      nf.arc_band(h,.33,.022,.035,0,2*math.pi,20,'lamp',nf.TEAL,m=Matrix.Translation(P(side*1.7,2.6,1.86)),full=True)
      # Cooling rings under the broad shoulder.
      nf.arc_band(h,.65,.14,.14,0,2*math.pi,24,'frame',nf.FRAME,m=Matrix.Translation(P(side*4,-2.5,1.5)),full=True)
    # Layered central lance, split around the heart so its shutter animation remains legible.
    for a,b,width in [(-9.1,-4.1,.9),(-.3,6.2,1.25)]:
      O=nf.bez_pts([P(0,a,2.2),P(-width,a+.8,2.65),P(-width,b-.8,2.65),P(0,b,1.8)],20)
      I=nf.bez_pts([P(0,a,2.2),P(width,a+.8,2.65),P(width,b-.8,2.65),P(0,b,1.8)],20)
      nf.band(h,O,I,lambda t:.27*math.sin(math.pi*t)+.01,(0,0,1),'shell:4',nf.SHELL,ridge=.5,facets=False)
      nf.tube(h,[nf.lerp(O[k],I[k],.5)+P(0,0,.27*math.sin(math.pi*k/19)+.035) for k in range(3,17)],.025,'lamp',nf.TEAL,seg=5)
    return h

def veil():
    scene('VEIL crescent carrier')
    mats=nf.make_materials()
    # Muted violet metal: the reference uses pearlescence selectively, not multicolour candy panels.
    nf.RAMPS['shell']=[(0,'#5b5772'),(.24,'#76708d'),(.48,'#63758e'),(.7,'#827993'),(1,'#5b5772')]
    pieces={'veil_hull':carrier_hull()}
    for side,name in [(-1,'left'),(1,'right')]:
      for wreck in [False,True]: pieces['veil_pod_'+name+('_wreck' if wreck else '')]=old.build_pod(side,random.Random(name+str(wreck)),wreck)
    pieces['veil_heart']=old.build_heart(random.Random('heart'))
    pieces['veil_heart_wreck']=old.build_heart_wreck(random.Random('wreck'))
    for k in range(4): pieces['veil_heart_shutter_'+str(k)]=old.build_shutter(k,random.Random('shutter'+str(k)))
    objects=[]
    for name,h in pieces.items():
      nf.finish(h)
      cols=nf.bake(h,name,ao_dist=.6,ground=None,scale=.16,sheen=.4)
      yaw=old.SHUTTER_PHI[int(name[-1])] if name.startswith('veil_heart_shutter_') else 0
      objects.append(nf.make_object(name,h,mats,old.SOCKETS[name],cols,yaw=yaw))
    for name,p in old.EMPTIES.items():
      if name.startswith('veil_engine'): p=(p[0],p[1],-7.3)
      o=vc.make_empty(name,p); objects.append(o)
    export('public/assets/nacre/the-veil.glb',objects)
    for o in objects:
      if '_wreck' in o.name: o.hide_render=True; o.hide_set(True)

def terrain():
    # Rebuild from the editable authored source, with tighter chamfers and additional major fracture planes.
    import nacre_kit as nk, vesper_kit as vk, importlib
    nk=importlib.reload(nk)
    scene('Nacre fractured terrain')
    # Membranes are translucent-looking teal surfaces, with light concentrated in the heart and fine ribs.
    for key in ['cap_inner','cap_rib','cap_valley','cap_rim','tube_mid','gob_hi']:
        nk.C[key] = tuple(c * .38 for c in nk.C[key])
    for key,colour in dict(rock_dark='#33343c',rock='#434953',rock_mid='#555d6a',rock_lit='#79818e',rock_rim='#9ca6b1').items():
        nk.C[key]=kit.hex_linear(colour)
    mats=[vc.make_material('nacre_rock','vc',rough=.84),vc.make_material('nacre_flora','vc',rough=.66),
          vc.make_material('nacre_ruin','vc',rough=.58,metal=.18),nk.glow_material('nacre_glow')]
    objects=[]
    for name,prefix,fn,idx,rule in nk.node_list():
      h=fn(random.Random(f'{nk.SEED}:{name}'),idx)
      if 'crag' in name:
        # Large angular talus splinters at the feet; added only to landmarks, never every pebble.
        r=random.Random(name+'fracture')
        for k in range(4): nk.blade(h,r,(k-1.5)*.25,-.35,.5+k*.06,.11,lean=(.12,.08),sides=5,squash=.5)
      vc.triangulate_nonplanar(h); nk.centre_xy(h)
      cols=vc.bake(h,name,dict(glow=set(),ao=.4,ground=0,colour_fn=nk.colour_fn_for(h,name)))
      if 'y_max_exact' in rule:nk.fit_top(h,1)
      objects.append(vc.make_object(name,h,mats,(0,0,0),cols))
    export('public/assets/nacre/nacre-kit.glb',objects)
    scene('Vesper fractured terrain')
    mats=[vc.make_material('vesper_ice','vc',rough=.22),vc.make_material('vesper_snow','vc',rough=.88),vc.make_material('vesper_rock','vc',rough=.9)]
    objects=[]
    for name,fn,i,floating in vk.BUILD:
      h=fn(random.Random(f'{vk.SEED}:{name}'),i)
      if 'ridge' in name or 'cliff' in name:
        # Leaned pressure slabs protrude from the major ridges; maintain original height/pivot contracts.
        zmax=max(v[2] for v in h.verts)
        for k in range(3):
          x=(k-1)*.34
          vk.hull_hs(h,[(x-.12,-.2,0),(x+.13,-.2,0),(x+.18,.2,0),(x-.08,.12,zmax*.88),(x+.15,.08,zmax*.74)],'ice',auto_snow=.72)
      vk.centre_xy(h)
      if 'y_max_exact' in vk.NODES[name]:vk.fit_top(h,vk.NODES[name]['y_max_exact'])
      cols=vc.bake(h,name,dict(glow=set(),ao=.34,ground=None if floating else 0,colour_fn=vk.kit_colour_fn(h,floating)))
      objects.append(vc.make_object(name,h,mats,(0,0,0),cols))
    export('public/assets/vesper/vesper-kit.glb',objects)
    scene('Khepri sharp basalt')
    kit.CHAMFER=.009
    mats=kit.make_materials();objects=[]
    for name,mb,kind in kit.build_kit(): objects.append(kit.make_object(name,mb,mats,kind))
    export('public/assets/khepri/khepri-kit.glb',objects)

def build(which):
    {'hero':hero,'facilities':facilities,'veil':veil,'terrain':terrain,'previews':previews}[which]()

def previews():
    """Refresh the seven VEIL authoring previews. Run after build('veil') through Blender MCP."""
    from types import SimpleNamespace
    bpy.context.window.scene=bpy.data.scenes['Last Worlds — VEIL crescent carrier']
    objects={o.name:o for o in bpy.context.scene.objects if o.type=='MESH'}
    setup=nf.setup_render
    def small_preview(engine,samples,w,h,exposure=.25):
        factor=min(1,1100/max(w,h))
        setup(engine,samples,round(w*factor),round(h*factor),exposure)
    nf.setup_render=small_preview
    try:
        old.render_previews(objects,SimpleNamespace(engine=bpy.context.scene.render.engine,samples=32,wip=False,
                            preview_dir=os.path.join(ROOT,'art','the-veil')))
    finally:
        nf.setup_render=setup
        for name,o in objects.items():
            o.hide_render='_wreck' in name
            o.hide_set('_wreck' in name)
