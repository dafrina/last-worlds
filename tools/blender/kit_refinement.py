"""The shipped terrain kits of Khepri, Vesper and Nacre: each kit's own pieces with the 18-19 October refinement.

Run through Blender MCP (it switches the window's scene, so not headless):

    import sys, importlib
    sys.path.insert(0, r'\\\\wsl.localhost\\Ubuntu\\home\\davidfarina\\Projects\\alien-skies\\tools\\blender')
    import kit_refinement; importlib.reload(kit_refinement).terrain()

terrain() builds every piece with nacre_kit.py, vesper_kit.py and khepri_kit.py and exports
public/assets/{nacre,vesper,khepri}/<world>-kit.glb with the refinement: Nacre's membranes darker (light in the hearts and
ribs) on blue-grey rock with angular talus splinters at the crags; Vesper's ridges and cliffs with leaned pressure slabs;
Khepri's basalt with sharper chamfers. Running one of those kit scripts on its own exports the kit before the refinement.
This was the `terrain` step of cinematic_assets.py (the 18 October reference refinement). Its other steps built models that
were retired, and that script was removed on 17 November.
"""
import bpy, os, sys, random, json
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(__file__))
import vesper_common as vc
import khepri_kit as kit

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
        export_copyright='Last Worlds — original Blender geometry, kit_refinement.py')
    os.replace(target+'.tmp.glb', target)
    tri=0
    for o in objects:
        if o.type=='MESH': o.data.calc_loop_triangles(); tri+=len(o.data.loop_triangles)
    print(json.dumps(dict(path=path, triangles=tri, bytes=os.path.getsize(target), nodes=[o.name for o in objects])))

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
