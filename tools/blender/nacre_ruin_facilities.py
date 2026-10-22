"""Nacre facility v4: the scattered ruin builders' architecture, through live Blender MCP.

Stepped dark plinths, tapered slabs, split crowns, recessed ember seams and turquoise
conduits replace the industrial halls and cylindrical pumps. Existing module names,
footprints and gun-court contracts remain intact. v3 is retained for rollback.
"""
from pathlib import Path
import math
import sys
import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/blender'))
import boss_remodel as br
import facility_kit as fk
import remodel_facilities as rf
from remodel_facilities import B, cyl

SCENE = 'Nacre facility ruins v4'
OUT = ROOT / 'art/nacre-facility-ruins'
PALETTE = dict(
    paint=('#303643', .73, .12, None),
    accent=('#424b5d', .64, .16, None),
    metal=('#141923', .69, .18, None),
    steel=('#626e82', .52, .22, None),
    deck=('#272e39', .82, .05, None),
    glow=('#06201e', .5, .15, '#40c5bf'),
    glow_ember=('#241305', .5, .1, '#ff9c42'),
    glow_pool=('#051a1b', .38, .02, '#185b64'),
)


def octagon(x, y, hx, hy, cut=.16):
    c = min(cut, hx * .65, hy * .65)
    return [(x-hx+c,y-hy),(x+hx-c,y-hy),(x+hx,y-hy+c),(x+hx,y+hy-c),
            (x+hx-c,y+hy),(x-hx+c,y+hy),(x-hx,y+hy-c),(x-hx,y-hy+c)]


def slab(h, x, y, hx, hy, z0, z1, material='paint', taper=.85, lean=(0,0), cut=.16):
    a = octagon(x,y,hx,hy,cut)
    b = octagon(x+lean[0],y+lean[1],hx*taper,hy*taper,cut*taper)
    h.loft([[(px,py,z0) for px,py in a],[(px,py,z1) for px,py in b]],material)


def base(h, hx, hy, below=.55):
    slab(h,0,0,hx,hy,-below,.06,'metal',taper=.98,cut=.22)
    slab(h,0,0,hx*.93,hy*.93,.06,.16,'accent',taper=.93,cut=.2)
    slab(h,0,0,hx*.82,hy*.82,.16,.26,'paint',taper=.98,cut=.16)


def slit(h,x,y,z0,z1,width=.045,side=False):
    # Light sits inside a visibly wider dark well, not on the outside of a panel.
    if side:
        B(h,x-.01,x+.018,y-width*1.8,y+width*1.8,z0-.06,z1+.06,'metal')
        B(h,x+.018,x+.026,y-width*.5,y+width*.5,z0,z1,'glow_ember')
    else:
        B(h,x-width*1.8,x+width*1.8,y-.018,y+.018,z0-.06,z1+.06,'metal')
        B(h,x-width*.5,x+width*.5,y-.026,y-.018,z0,z1,'glow_ember')


def blade(h,x,y,hx,hy,z0,height,lean=(0,0),material='paint'):
    # A broad faceted slab tapering to an offset ridge, with an actual sharp silhouette.
    loops=[]
    for t,w in ((0,1),(.56,.82),(.88,.34),(1,.035)):
        loops.append([(px,py,z0+height*t) for px,py in
                      octagon(x+lean[0]*t,y+lean[1]*t,hx*w,hy*max(.15,w),min(hx,hy)*.3)])
    h.loft(loops,material)


def hall(h,hy,top):
    base(h,.92,hy-.03)
    slab(h,0,0,.59,hy*.79,.26,1.45,'paint',taper=.79,lean=(0,.08))
    slab(h,0,0,.61,hy*.81,.26,.38,'accent',taper=.98)
    # Paired tapering side buttresses leave recessed galleries between them.
    ys=(-hy*.57,0,hy*.57) if hy>1 else (-hy*.48,hy*.48)
    for i,y in enumerate(ys):
        for side in (-1,1):
            height=1.25+(i%2)*.22
            blade(h,side*.72,y,.17,.20,.22,height,lean=(-side*.17,.10),material='accent')
            if side>0: slit(h,.79,y,.42,.95,width=.028,side=True)
    # The roof is a split monolith crown, rather than a vent box or a tank.
    blade(h,-.20,hy*.15,.22,hy*.49,1.23,top-1.23,lean=(.03,.12))
    blade(h,.22,hy*.11,.19,hy*.43,1.23,top-1.41,lean=(-.02,.10),material='accent')
    B(h,-.025,.025,-hy*.40,hy*.54,1.46,1.48,'glow')
    slit(h,0,-hy*.795,.46,1.18,width=.048)
    for x in (-.37,.37):
        slab(h,x,-hy*.71,.055,.07,.36,1.45,'steel',taper=.7)
    # Short carved relief courses connect the hall to the terrain tower's ledges.
    for z in (.77,1.12):
        B(h,-.38,.38,-hy*.81,-hy*.78,z,z+.025,'accent')


def obelisk(h):
    base(h,1.16,.66)
    slab(h,0,0,.83,.46,.26,.64,'paint',taper=.86)
    slab(h,-.23,.03,.42,.34,.64,2.62,'paint',taper=.70,lean=(.08,.04))
    slab(h,-.23,.03,.45,.36,2.52,2.65,'accent',taper=.9)
    blade(h,-.32,.05,.14,.20,2.65,.53,lean=(.09,.04),material='steel')
    blade(h,.50,.03,.27,.28,.42,2.18,lean=(-.13,.10))
    slit(h,-.21,-.32,.88,2.30,.055)
    slit(h,.52,-.225,.65,1.75,.032)
    # Thin lateral fins and raised footing echo the existing ruin tower.
    for side in (-1,1):
        blade(h,side*.89,.05,.17,.25,.24,1.08,lean=(-side*.16,.08),material='accent')
    B(h,-.58,.56,-.47,-.45,.46,.49,'glow')


def pump(h):
    base(h,.64,.64)
    fk.annulus(h,0,0,.33,.52,.25,.34,'accent',seg=12)
    cyl(h,0,0,.32,.27,.30,'glow_pool',seg=12)
    for side in (-1,1):
        blade(h,side*.34,.10,.18,.29,.26,2.79 if side<0 else 2.40,
              lean=(-side*.19,.10),material='paint' if side<0 else 'accent')
        slit(h,side*.34,-.19,.49,1.55 if side<0 else 1.30,.035)
    # Open slot between the two monoliths; no solid cylindrical pump body.
    blade(h,0,.14,.075,.11,.45,.70,material='steel')
    B(h,-.018,.018,-.12,.07,.35,.37,'glow')


def basin(h,r,top):
    base(h,r,r)
    fk.annulus(h,0,0,r*.53,r*.89,.26,.43,'paint',seg=12)
    fk.annulus(h,0,0,r*.55,r*.60,.43,.45,'glow',seg=12)
    cyl(h,0,0,r*.54,.28,.30,'glow_pool',seg=12)
    for a,hh in ((.25,top), (2.25,top*.78), (3.75,top*.60)):
        x,y=math.cos(a)*r*.72,math.sin(a)*r*.72
        blade(h,x,y,r*.14,r*.18,.30,hh-.30,lean=(-x*.2,-y*.2),material='accent')


def arc(h):
    R,cy,half=2.2,-2.2,math.radians(21)
    a0,a1=math.pi/2-half,math.pi/2+half
    fk.arc_wall(h,0,cy,R-.20,R+.20,a0,a1,-.38,.18,'metal')
    # Low broken curtain with tall, asymmetric triangular fins.
    fk.arc_wall(h,0,cy,R-.13,R+.13,a0,a1,.18,.88,'paint')
    for x,z in ((-.58,1.5),(-.23,2.27),(.19,1.90),(.58,1.28)):
        y=math.sqrt(R*R-x*x)+cy
        blade(h,x,y,.14,.105,.18,z-.18,lean=(-x*.2,.02),material='accent' if x>0 else 'paint')
    fk.arc_wall(h,0,cy,R-.145,R-.13,a0+.035,a1-.035,.31,.335,'glow')
    slit(h,-.23,-.17,.48,1.37,.025)


def pillar(h):
    base(h,.24,.24,below=.38)
    slab(h,0,0,.17,.17,.26,2.12,'paint',taper=.72)
    slit(h,0,-.17,.43,1.75,.025)
    blade(h,-.06,0,.08,.13,2.10,.34,lean=(.025,.035),material='accent')
    blade(h,.085,0,.045,.10,2.10,.20)


def stones(h):
    slab(h,0,0,.43,.43,-.28,.09,'metal')
    for x,y,hx,hy,hh in ((-.20,.12,.13,.18,1.18),(.22,.12,.16,.12,.74),(.05,-.23,.18,.11,.35)):
        blade(h,x,y,hx,hy,.08,hh-.08,lean=(.035,-.02),material='accent')
    slit(h,-.2,-.065,.24,.70,.022)


def pool(h):
    fk.annulus(h,0,0,1.03,1.93,-.28,.055,'paint',seg=24)
    fk.annulus(h,0,0,1.17,1.76,.055,.065,'glow_pool',seg=24)
    fk.annulus(h,0,0,1.14,1.17,.055,.085,'glow',seg=24)
    for k in range(12):
        a=k*math.pi/6
        slab(h,math.cos(a)*1.84,math.sin(a)*1.84,.055,.055,.055,.095,'accent',cut=.015)


def channel(h):
    B(h,-1,1,-.18,.18,-.28,.055,'metal')
    for side in (-1,1):
        B(h,-1,1,side*.11,side*.18,.055,.18,'paint')
    B(h,-1,1,-.095,.095,.055,.065,'glow_pool')
    for x in (-.76,-.26,.26,.76):
        B(h,x-.15,x+.15,-.015,.015,.065,.08,'glow')


def apron(h):
    B(h,-1,1,-1,1,-1.08,0,'metal')
    # Four inset quarried paving slabs, asymmetrically scored.
    for x in (-.5,.5):
        for y in (-.5,.5):
            slab(h,x,y,.486,.486,0,.035,'deck',taper=1,cut=.045)
    B(h,-.56,-.54,-.80,-.36,.035,.039,'accent')
    B(h,.14,.64,.38,.40,.035,.039,'accent')


def ring(h):
    fk.annulus(h,0,0,.84,.97,-.045,.035,'paint',seg=20)
    fk.annulus(h,0,0,.86,.88,.035,.045,'glow_pool',seg=20)


def build_geometry():
    OUT.mkdir(parents=True,exist_ok=True)
    fk.PALETTES['nacre']=PALETTE
    scene=br.scene(SCENE)
    mats=fk.materials('nacre')
    # Dark weathered stone, restrained mineral cracks; no metallic ship panel layout.
    br.STYLES['nacre_ruins']=dict(br.STYLES['nacre'],cells=5.5,tile=2.4,detail=.14,
                                dust='#2c4842',dust_amount=.14,wear='#6a7383',wear_amount=.3,grime=.24)
    makers=dict(hall_l=lambda h:hall(h,1.75,2.29),hall_s=lambda h:hall(h,.9,2.19),
                obelisk=obelisk,pump=pump,basin_l=lambda h:basin(h,.80,1.44),
                basin_s=lambda h:basin(h,.58,1.19),arc=arc,pillar=pillar,stones=stones,
                pool=pool,channel=channel,ring=ring,apron=apron)
    contract=fk.registry()
    objects=[]
    for name,make in makers.items():
        ob,issues=fk.module('nacre',name,make,scene,mats,contract)
        assert not issues, (name,issues)
        objects.append(ob)
    assert br.triangles(objects)<30000
    bpy.context.view_layer.update()
    print('NEW RUIN KIT',br.triangles(objects),'triangles')
    return objects


def finish_export(bake=True):
    scene=bpy.data.scenes[SCENE]
    bpy.context.window.scene=scene
    objects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('fk_nacre_')]
    for o in objects:
        o.hide_render=False
        o.hide_set(False)
    # One atlas shared across the full kit; names/versioned GLB preserve the v3 rollback.
    br.LOOKDEV=str(OUT)
    if bake:
        # A cancelled previous bake can leave unused names which Blender would suffix on retry.
        for material in list(bpy.data.materials):
            if material.name.startswith('fk_nacre_') and '__bake' in material.name and material.users == 0:
                bpy.data.materials.remove(material)
        br.texture_bake(objects,'fk_nacre_ruins_v4','nacre_ruins',size=2048,samples=4)
    for o in objects: br.bake_ao([o],[o],strength=.7,reach=1.2)
    existing=bpy.data.objects.get('facility_kit_v3')
    if existing: existing.name='facility_kit_v3_ruin_export_hold'
    marker=br.marker('facility_kit_v3',sc=scene,note='Ruin architecture v4; original v3 module contract')
    try:
        print(br.export(str(ROOT/'public/assets/nacre/facility-kit-v4-ruins.glb'),objects+[marker],
                        'Last Worlds - Nacre ruin architecture, Blender MCP'))
    finally:
        marker.name='nacre_ruin_facility_contract'
        if existing: existing.name='facility_kit_v3'


def preview():
    scene=bpy.data.scenes[SCENE]
    bpy.context.window.scene=scene
    names=['hall_l','hall_s','obelisk','pump','basin_l','arc','pillar']
    objects=[scene.objects['fk_nacre_'+n] for n in names]
    originals={o:o.location.copy() for o in objects}
    visibility={o:o.hide_render for o in scene.objects if o.type=='MESH'}
    try:
        for o,xy in zip(objects,[(-3.4,-1.4),(-.7,-1.5),(1.7,-1.1),(3.6,-1.1),(-3.2,2.3),(0,2.2),(2.3,2.3)]):
            o.location=(xy[0],xy[1],0)
        br.game_view(scene,(0,.25,1.1),10.5,str(OUT/'nacre-ruin-kit.png'),res=1400,objects=objects,light='ice')
    finally:
        for o,loc in originals.items(): o.location=loc
        for o,hidden in visibility.items(): o.hide_render=hidden


if __name__=='__main__':
    build_geometry()
