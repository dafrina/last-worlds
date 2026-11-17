"""Headless entry for the builders with a `build(export, preview)` function: boss_warden, boss_veil, boss_bastion_hull
(which writes only the hull; boss_bastion.py builds the shipped BASTION-9) and kit_facilities (art/boss-remodel/README.md).

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/run_build.py)" -- boss_warden [--no-export] [--no-preview] [--compare]
"""
import sys, os, importlib, time
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
started = time.time()
module = importlib.import_module(args[0])
objects, result = module.build(export='--no-export' not in args, preview='--no-preview' not in args)
if '--compare' in args and hasattr(module, 'compare'):
    module.compare(objects)
print('BUILD DONE', args[0], result, '%.1fs' % (time.time() - started))
