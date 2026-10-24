"""BASTION-9 v7 (24 October 2026), headless: rebuild the remodel, then extract the tread links.

The user asked for the silver tubes on the back to go ("replace that with some greebles or
turrets"). remodel_bastion.py now builds the rear deck with turret mounts and greebles; every
rig node, pivot and combat socket is the v5/v6 one. This runner:
1. builds the hull and parts with remodel_bastion.build() (Cycles atlas bake, AO) into an
   intermediate GLB (git-ignored lookdev/bastion-rear/bastion-9-v7-hull.glb);
2. clears the session and runs repair_bastion_treads.run() on it, which extracts the four
   instanced link templates and the bastion_treads_v6 marker exactly as for v6;
3. writes public/assets/khepri/bastion-9-v7.glb.

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/bastion_v7.py)" [-- --hull <hull.glb> --out <out.glb> --preview]

Paths given after -- must be Windows/UNC paths (wslpath -w).
"""
import os, sys, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import boss_remodel as br
import remodel_bastion
import repair_bastion_treads

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def option(name, default):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


HULL = option('--hull', os.path.join(br.ROOT, 'lookdev', 'bastion-rear', 'bastion-9-v7-hull.glb'))
OUT = option('--out', os.path.join(br.ROOT, 'public', 'assets', 'khepri', 'bastion-9-v7.glb'))


def clear_session():
    """Drop everything the build made, so the extraction imports under the original names."""
    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images,
                       bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for block in list(collection):
            collection.remove(block)


if __name__ == '__main__':
    started = time.time()
    os.makedirs(os.path.dirname(HULL), exist_ok=True)
    _, result = remodel_bastion.build(export=True, preview='--preview' in ARGS, path=HULL)
    print('BASTION v7 hull', result)
    clear_session()
    repair_bastion_treads.run(HULL, OUT)
    print('BASTION v7 DONE', OUT, os.path.getsize(OUT), 'bytes', '%.1fs' % (time.time() - started))
