# M2: Rolling Thunder and Bastion-9

14 October 2026. Mechanics increment following the playable feel prototype. The user assigned terrain to another session; this increment owns the boss simulation, its self-contained presentation, and mission selection. It does not complete every M2 art/device gate.

## Playable flow

Campaign preparation now offers **Rolling Thunder** (default) and the existing **Training** flight. Both use the selected difficulty and main weapon. Training retains its 120-second extraction. Rolling Thunder has its own authored approach with squadron formations: the last spawn at 90 seconds, a relief cue at 98 seconds and no new cues after 103 seconds (`BASTION.approachEndsAt`). Bastion-9 then arrives at 115 seconds. Victory requires destroying the core and completing eight active seconds of safe extraction; waiting does not defeat the boss. Retry recreates the complete mission.

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

## Production asset contract (World session, 14 October)

The user asked the World session to finish this increment after the Codex session ran out of tokens. The fortress is now modelled in Blender.

**Files.** Source: `tools/blender/bastion.py` (seeded, deterministic). Runtime: `public/assets/khepri/bastion-9.glb`. Previews and provenance: `art/bastion-9/`.

**Coordinates and shading.** +Y up, 1 unit = 1 game unit, front facing +z (toward the player; the guns point +z). Pivot at the hull's ground center, base at −0.1. Materials:
- `bastion_armor` and `bastion_trim`: graphite and weathered ochre/rust, with `COLOR_0` for AO, edge wear and dust;
- `bastion_glow`: hot orange core and lamps;
- box UVs at 1 unit = 1 UV, except tread belts, which carry `TEXCOORD_0` with v running along the belt for runtime scrolling.

The style follows the tracked fortress in `art/concepts/02-portrait-combat.png` and `03-minimal-hud.png`: massive tread pods, a central armored hull around a large circular core, and two elevated weapon housings with multi-barrel guns. It is Khepri industrial/scarab-like, credible and never toy-like.

| Node | Socket / placement (local) | Notes |
| --- | --- | --- |
| `bastion_hull` | origin | chassis, armor, superstructure; ≤ 6.8 × 5.8 footprint (x × z), top ≤ 1.9 |
| `bastion_tread_left`, `bastion_tread_right` | tread pods at about x ±2.85 | belts with along-belt UVs |
| `bastion_battery_left`, `bastion_battery_right` | target center (∓2.2, 1.45, 0) | housing; its gun is separate |
| `bastion_gun_left`, `bastion_gun_right` | pivot on the housing, barrels toward +z | yaws toward the aim point during warnings |
| `bastion_battery_left_wreck`, `bastion_battery_right_wreck` | same as the housings | destroyed state |
| `bastion_shutter_left`, `bastion_shutter_right` | over each battery target | armored covers while protected |
| `bastion_core` | target center (0, 1.45, −1.35) | ring chamber, glowing heart |
| `bastion_core_shutter_a`, `bastion_core_shutter_b` | two halves over the core | slide apart along ±x when the core is exposed |

Hit regions are unchanged: batteries radius 0.7, core 1.55, all at local height 1.45. Total budget is 15–25k triangles.

**Runtime behavior** (`src/render/bastion-view.ts`, render-only):
- **Arrival:** the fortress rolls in with treads scrolling and dust; shutters open on activation.
- **Combat:** guns track during warnings. Destroyed batteries swap to their wreck variants with sparks. The core glow is driven by damage.
- **Destruction:** module sparks → internal flashes → chassis tilt/collapse → expanding shock ring → reduced smoke.
- **Arena:** while the boss is present, terrain scenery overlapping its footprint is hidden.
- **Fallback:** if the GLB is missing, the functional box model remains.

**As built** (World session, 14 October):
- **Model:** `bastion-9.glb` has 14 nodes and 15,202 triangles (1.3 MB), built by `tools/blender/bastion.py` with byte-identical rebuilds. Previews are in `art/bastion-9/`.
- **Nodes:** each node's translation is its socket or pivot. Guns yaw about their own origin at (∓2.2, 1.55, 0.2). Core shutter halves slide 1.1 along ∓x; battery lids retract back and down.
- **Treads:** `v` is arc length in game units. The runtime belt texture puts one link every 0.2 units and scrolls at ground speed, because holding a fixed row means reversing over the scrolling ground.
- **Seating:** `bastionPlacement` in `scene.ts` rests the hull on the highest ground under its footprint, so it never sinks into a ridge, and recomputes the forward offset so sockets still project onto their logical rows. A unit test covers three seeds, both camera extremes and several distances.
- **Effects:** two instanced particle layers (dust/smoke, sparks/flashes) and a shock-ring mesh, all presentation-only. Cosmetic randomness is a deterministic hash, never simulation RNG.
- **Audio:** `main.ts` plays tones for arrival, combat start, each module kill, core exposed, overload, and destruction.

### Revision 2b: targeted shaping (user decision, 14 October, supersedes the scale/height items of Revision 2)

The user narrowed the request: the boss "doesn't need a shitload of work". Revision 2b keeps the model and only:
- makes the bulldozer-like treads much more gigantic;
- blends the round core housing into the hull (a chamfered or octagonal collar, sloped armour, a recessed groove) so it no longer reads as a box on a square base;
- adds small secondary turrets, indentations and recessed panels.

Limits: footprint ≤ 7.6 × 6.6, top ≤ 2.3 above base, ≤ 24k triangles. The low boss arena and the tall superstructure below are deferred. Known limit: on high plateaus the hull top can still rise above the flight plane, though nothing but non-depth-tested shots crosses it there.

### Revision 2: an epic fortress (user feedback, 14 October; scale and height items deferred by 2b)

The user found the first production model "super unepic" and asked for the concept's look, and for graphics that read more three-dimensional overall. Changes to the contract:
- **Scale and height:** footprint up to 8.2 × 7.2 (x × z) and top up to 3.6 above base. Sockets, hit regions and target height (1.45) are unchanged; the extra size is superstructure and tread pods built around them.
- **Silhouette after the concept** (`art/concepts/02-portrait-combat.png`, `03-minimal-hud.png`):
  - three massive armoured hull blocks, with long tread pods showing chunky track links, sprockets and road wheels;
  - a stepped superstructure rising to a central command spire, with smokestacks, antenna masts, a radar or sensor dish and searchlights;
  - side sponsons and heavy multi-barrel battery housings raised on armoured towers;
  - glowing orange vents and window strips;
  - deep panel lines, ribbing and plating. Detail must read at phone size; no fine greebles.
- **Budget:** up to 32k triangles. It is the only large model on screen during the fight.
- **Flight-plane rule:** the body stays below the flight plane (`VIEW.flightHeight`, 3.8 since 14 October), so Rolling Thunder gets a low boss arena. From the boss's arrival onward, the world generator turns the terrain into a broad, gently undulating basin with its floor around −2, across the full map width and for the rest of the mission. The terrain stays scenic around this authored anchor and reads only the mission config, never combat state. Seating clamps the hull to that floor.
- **3D read:** the High tier renders real sun shadows. Boss, aircraft and kit pieces cast them; terrain receives them. The Low tier keeps blob shadows.

## Verification and handoff

- `tests/sim/bastion.test.ts` covers arrival/protection, removal of guns, phase changes, respawn, offscreen windup cancellation, extraction/pause, one-time rewards, supply budgets, and mode isolation.
- A scripted pilot clears all nine main-weapon × campaign-difficulty combinations with starting lives, no pickups and no special use. This is evidence that the authored encounter is survivable; human readability and touch comfort still require playtesting.
- `tests/browser/bastion.spec.ts` covers mission selection and actual renderer snapshots of batteries/core/overload. The isolated development fixture is `/tests/fixtures/bastion.html`; `?phase=core&still=1` freezes a chosen art-review state. It is not a Vite production entry and is not emitted into `dist/`.
- No terrain code or assets are owned by this increment. If the full suite flags a terrain-network assertion during parallel work, report it to the terrain session rather than altering its expectations here.

Next: playtest the complete encounter and refine weakpoint feedback/fortress art. Then M3 adds the four-slot campaign hangar, saved credits, K1–K3, observational goals and statistics. M4 expands endless choices and local records. Do not treat the existing test sortie or this boss increment as completed campaign progression.
