# Reference-sheet studies — archived 20 October 2026

The user subsequently supplied approved GLBs for THE VEIL, BASTION-9 and HELION ARK. Those imports supersede these three procedural studies. **Do not use this builder to replace their approved designs.** Current assets, source masters, budgets and rollback instructions are in [approved bosses](../approved-bosses/README.md).

WARDEN-1 is the only current model from `tools/blender/boss_references.py`. It has no supplied replacement GLB. Its rectangular platform, broad shoulders, twin-barrel turrets, recessed command spine, antenna masts and engine bells retain the established combat sockets, yaw and hatch animations.

| Archived/current asset | Triangles | Bytes | Status |
| --- | ---: | ---: | --- |
| `nacre/the-veil-v3-study.glb` | 47,142 | 4,112,068 | Superseded; known degenerate-apex export warning after the final smoothing experiment |
| `khepri/bastion-9-v3-study.glb` | 20,012 | 1,874,548 | Superseded |
| `vesper/helion-ark-v3-study.glb` | 18,322 | 1,823,524 | Superseded |
| `luna/warden-v3-study.glb` | 10,220 | 1,094,968 | Selected runtime Warden |

The PNGs here are historical Blender authoring renders, not current screenshots of the approved alien bosses. In particular, the archived Veil was edited after its preview; it is retained for recovery, not marked as a stable rollback. Use the last-published `v2` filenames for rollback.

The studies embed 512² surface images with authored palette/AO vertex colours. Their 338 unit tests and 26 browser cases passed before the last Veil smoothing experiment. The approved-import release runs its own expanded suite and records the result in `docs/build-status.md`.

## Warden rebuild

Run only through Blender MCP, with the project's UNC `tools/blender` path on `sys.path`:

```python
import importlib, boss_references
bosses = importlib.reload(boss_references)
bosses.build('warden')
bosses.preview('warden')
```

This writes the unversioned working Warden GLB. After validation, copy it to a new versioned filename and update `src/render/boss-assets.ts`; do not overwrite an archived release. Never run the legacy builders' `main()` functions, which clear the whole Blender file.
