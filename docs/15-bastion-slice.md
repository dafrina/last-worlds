# M2: Rolling Thunder and Bastion-9

14 October 2026. Mechanics increment following the playable feel prototype. The user assigned terrain to another session; this increment owns the boss simulation, its self-contained presentation, and mission selection. It does not complete every M2 art/device gate.

## Playable flow

Campaign preparation now offers **Rolling Thunder** (default) and the existing **Training** flight. Both use the selected difficulty and main weapon. Training retains its 120-second extraction. Rolling Thunder uses the existing authored approach through 94 seconds, a relief interval, then Bastion-9 at 115 seconds. Victory requires destroying the core and completing eight active seconds of safe extraction; waiting does not defeat the boss. Retry recreates the complete mission.

The ideal scripted Standard clears take approximately 156 seconds with Pulse, 214 with Fan, and 160 with Seeker. These are simulation feasibility measurements, not expected human clear times or phone performance. The mission targets roughly 3–4 minutes in play. No arbitrary timeout, health reset, mandatory special, or support pickup is required.

## Authoritative behavior

Runtime tuning lives in `src/content/bastion.ts`; phases live in `src/sim/bastion.ts` and use the existing combat collision/weapon implementation.

| Phase | Targets | Attacks / exit |
| --- | --- | --- |
| Arrival | All protected | Three seconds of harmless arrival; shutters then open on both batteries |
| Batteries | Left and right, 400 base HP each | Alternate committed three-bolt bursts; 1.15-second warning and 1.4-second recovery. Removing a battery cancels its warning and future attacks |
| Core | Central core, 1,600 base HP | Five fixed fan trajectories; both batteries stay destroyed |
| Overload | Same core below 40% HP | Alternate narrow fixed lanes left/right of center, 1.4-second warning. No HP refill |
| Destroyed | None | Clear hostile shots/hazards, brief internal explosions and chassis tilt, eight seconds of extraction, results |

HP and hostile speed use existing campaign difficulty scaling. Relaxed retains its extra warning time. Phase transitions clear incompatible threats and wait 1.25 seconds before starting a new warning. No escorts are spawned in this first functional boss encounter.

Core protection applies consistently to automatic acquisition, ordinary projectile collision, seeker guidance, and Shockwave. Damage is resolved by the existing simulation; render meshes cannot apply damage. The exposed core has a broad 1.55-unit collision radius so all three weapon patterns remain useful. Its target bracket communicates this region.

The boss spawns near the current camera, then has a small authored lateral sway. The world remains wide and the camera remains free. Offscreen modules cannot start attacks; a windup leaving view cancels and must begin again when visible. A temporary return-left/right message helps a player who has left the encounter. No invisible arena wall is introduced.

Life loss preserves every destroyed module and the remaining core HP. It gives the normal replacement-life shields, clears nearby hostile bullets and current hazards, and delays fresh attacks for the respawn protection interval. No supply budget resets.

Shield opportunities for this entire longer mission: Relaxed/Standard at 40 and 105 seconds; Veteran at 105 seconds. Each restores one charge. There are no further cells during an extended boss fight. Training remains 40/85 or 65 seconds; endless remains one cell at second 55 of each 90-second sector.

The 60-credit boss reward is run-local and awarded once when the core dies. There is still no saved campaign wallet or hangar. Endless ignores the campaign mission and all campaign loadout choices, and does not spawn this campaign boss.

## Rendering and future Blender asset

`src/render/bastion-view.ts` is a functional authored 3D model, not the final production fortress asset. It has a shared hull, separate battery states, core shutters, target brackets, damage-dependent glow, and a simple destruction pose. `scene.ts` only creates/updates it and excludes its targets from the ordinary turret renderer. Terrain modules and terrain assets remain separate.

All three target centers sit at local height 1.45. Batteries are at x ±2.2; the core is 1.35 units forward of their logical row. The renderer uses one terrain-aware ground placement for the chassis; target centers project exactly onto their logical combat coordinates. A faint chassis silhouette and visible brackets aid reading over deep relief. Broad uneven terrain can still produce imperfect physical seating beneath this large functional hull; production movement/asset seating needs review with the terrain owner.

For a later Blender replacement, export independent hull, left battery, right battery, core and shutter nodes. Preserve target socket coordinates and the documented hit regions. Approximate current silhouette is 6.7 units wide by 5.7 long. Author materials and damage states; do not randomize geometry or change weapon patterns to match art. Scrapper/Razor/Dominion hero production assets are a separate art task using the already accepted concept boards and fixed player collider.

## Verification and handoff

- `tests/sim/bastion.test.ts` covers arrival/protection, removal of guns, phase changes, respawn, offscreen windup cancellation, extraction/pause, one-time rewards, supply budgets, and mode isolation.
- A scripted pilot clears all nine main-weapon × campaign-difficulty combinations with starting lives, no pickups and no special use. This is evidence that the authored encounter is survivable; human readability and touch comfort still require playtesting.
- `tests/browser/bastion.spec.ts` covers mission selection and actual renderer snapshots of batteries/core/overload. The isolated development fixture is `/tests/fixtures/bastion.html`; `?phase=core&still=1` freezes a chosen art-review state. It is not a Vite production entry and is not emitted into `dist/`.
- No terrain code or assets are owned by this increment. If the full suite flags a terrain-network assertion during parallel work, report it to the terrain session rather than altering its expectations here.

Next: playtest the complete encounter and refine weakpoint feedback/fortress art. Then M3 adds the four-slot campaign hangar, saved credits, K1–K3, observational goals and statistics. M4 expands endless choices and local records. Do not treat the existing test sortie or this boss increment as completed campaign progression.
