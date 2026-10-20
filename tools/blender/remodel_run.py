"""Headless entry for the boss remodels (docs: art/boss-remodel/README.md).

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/remodel_run.py)" -- bastion [--no-export] [--no-preview] [--compare]
"""
import sys, os, importlib, time
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
started = time.time()
here = os.path.dirname(os.path.abspath(__file__))
module = importlib.import_module(('remodel_' if os.path.exists(os.path.join(here, 'remodel_%s.py' % args[0])) else '') + args[0])
objects, result = module.build(export='--no-export' not in args, preview='--no-preview' not in args)
if '--compare' in args and hasattr(module, 'compare'):
    module.compare(objects)
print('REMODEL DONE', args[0], result, '%.1fs' % (time.time() - started))
