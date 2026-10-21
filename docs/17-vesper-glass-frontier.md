# Vesper — Glass Frontier: planet, kits and the "Cold Vector" mission

Design v0.6 · 15 October 2026. The user approved this plan: a new campaign mission on the ice planet from the right panel of `art/concepts/01-worlds-direction.png`, with the Vesper craft from `art/concepts/05-alien-factions.png`. The mission ends with the Helion Ark boss **in the water**, so the open ocean becomes the flat boss arena. Vesper must look clearly different from Khepri; the systems are shared, but the identity is not.

## 1. Visual identity (what makes it not Khepri)

- **Ocean is the base.** A deep blue animated water plane fills everything below sea level. It has gentle swell normals, sun glints and depth-tinted colour, with white foam where it meets ice. Khepri has no water.
- **Ice shelves instead of basalt mesas:** broad snowy plateaus ending in sheer, fractured blue-white ice cliffs with overhangs and undercuts at the waterline.
- **Pack ice instead of canyons:** broken floes and small icebergs in the open water between shelves, drifting slowly. The drift is presentation-only, derived from seed and time.
- **Crevasse fields** across shelves (narrow, deep blue cracks), plus pressure ridges, snow drifts and a few dark rock outcrops poking through the snow. Small stones (the outcrop pieces at 0.45–1.0 scale, squat) lie scattered across the flat snow alone or in loose groups, thicker in stony patches and thinner along the routes, after `lookdev/cliff-study/vesper.png` (21 October).
- **Light:** high, pale, slightly cool sun; blue shadows; white-blue distance haze; ice sparkle glints. No falling snow or weather that could hide shots (docs/03 §1).
- **Palette:**
  - snow `#e9eef3`, shaded snow `#b9c8d8`;
  - ice-cliff blue `#8fc3e6` → deep `#2e6f9e`;
  - ocean `#0d3557` → shallows `#1f6a8f`;
  - rock charcoal `#2a2d31`;
  - faction black ceramic `#15181b`, radiator orange glow `#ff7a26`.
- **Moods along the route:** shelf coast, open pack-ice sea, crevasse plateau, radiator plains.

## 2. Planet abstraction (shared code, per-planet data)

A planet is data, not a code fork:
- **Missions select a planet.** `MissionId` gains `'cold-vector'`, and a mission → planet table lives in `src/content/`. Endless stays on Khepri for now.
- **The world generator takes a planet profile:** landform parameters, moods, palette, sea level, scatter tables, settlement archetypes and the kit node table. Without one, Khepri output must stay byte-identical (same rule as the arena).
- **Render loads per-planet assets:** terrain kit, infrastructure kit, enemy craft and boss, plus the material palette for the shared kit's masks, the lighting rig, the water plane and haze.

## 3. Blender assets (seeded scripts in `tools/blender/`, previews and provenance in `art/vesper-*/`)

Same conventions as the Khepri kits: +Y up, game units, base-centre pivots, `COLOR_0`, box UVs, deterministic builds, contract self-checks.

| File | Contents |
| --- | --- |
| `public/assets/vesper/vesper-kit.glb` | Ice cliff segments (faceted, vertical, with undercut waterline), seracs, ice spires, icebergs and floes (floating, with the waterline at y = 0 of the piece), pressure-ridge slabs, snow drifts, snow-capped dark rock outcrops, frozen vent stacks |
| `public/assets/vesper/vesper-infra.glb` | Black ceramic and orange radiator fins: radiator field arrays (tiling), missile and cannon emplacements on hex plinths (visual for ground targets), cryo domes, habitat pods, harbour piers and cranes for the shelf edge, comm needle masts, an ice-hauler crawler, an icebreaker ship (background traffic in the water) |
| `public/assets/vesper/vesper-craft.glb` | Needle interceptor (pale ceramic blade, offset fins), Diamond heavy (fractured diamond frame, radiator wings), missile battery turret, all after the faction board |
| `public/assets/vesper/helion-ark.glb` | The Helion Ark sea carrier (§5), with separate nodes for its targets, wreck states, shutters and launch bays |

The shared industrial kit (pipes, tanks, containers) is reused through its palette masks: black ceramic metal, orange paint, frost instead of dust, and orange heat bands so pipelines read as heated lines. Roads become packed-snow tracks with tread marks. Khepri's own buildings are not reused.

## 4. World generation (Vesper profile)

- **Sea level:** about −1.2. Shelves reach 0.6–2.0, ice cliffs drop to the water, and the seabed below the water is darkened and hazed.
- **Landforms:** large shelf masses broken by open leads (water channels), crevasse fields on the shelves, pack-ice seas with floes, and pressure ridges.
- **Variety:** route variety follows the same rules as Khepri (moods, no repeated rhythm, calm combat lanes, budgets, seams, determinism, incremental generation).
- **Settlements** sit on shelves: radiator fields, missile sites, harbours at shelf edges, cryo stations. Snow-track roads and heated pipelines connect them; pipelines may cross leads on trestles.
- **Boss arena:** the arena range for Cold Vector is **open water**. No shelves or floes inside the platform range; the shelf edge recedes to frame it, with a few distant icebergs.

## 5. Mission "Cold Vector" and the Helion Ark

**Length:** about 4–5 min. **Combat emphasis** (docs/03): precise burst windows, narrow telegraphed beams, coordinated heavy escorts.

**Mission arc:**
1. high-contrast introduction over the shelf coast;
2. Needle squadrons with narrow beam lanes;
3. missile batteries on the ice cliffs;
4. heavy escort convoy;
5. relief;
6. the scroll eases to a stop over open ocean for the Helion Ark.

**Enemies:**
- **Needle:** a fast interceptor whose attack is a very narrow, telegraphed, locked beam (a Lancer-family pattern with its own timing).
- **Diamond heavy:** an escort with alternating left/right volleys (Bulwark family) and a central core.
- **Missile battery:** a ground target firing straight, non-tracking missiles in telegraphed lanes. Any tracking weapon would need its own distinct look and rule (docs/03 §2).

All of them follow the fairness rules and the validator, and the perfect pilot must clear every weapon × difficulty combination.

**Helion Ark:** a hovering industrial carrier riding just above the water.
- **Scale and height:** its targets use the combat-plane contract; its wings are scenery, not a hidden collision box. It is long and low; its top stays below the flight plane (`VIEW.flightHeight` 3.8).
- **Phases:**
  1. two radiator weapons (alternating lane lasers);
  2. the bridge, which launches a finite number of fighters (Needles) from the deck bays;
  3. bridge overload, with lanes over its own hit columns, as on Bastion-9.
- **Health:** total effective HP is about 3,000, scaled by difficulty.
- **Presentation:** wake and spray, radiator glow driven by damage, then a destruction sequence of explosions, listing and sinking with steam.

## As implemented: world and look (wave 1, 15 October)

- **Planet profiles:** `src/world/terrain-planet.ts` and `terrain-vesper.ts`. `runPlanet(config)` in `src/content/missions.ts` maps missions to planets, and `terrain.update(seed, distance, { planet, arena })` takes the result. Khepri's output is byte-identical (fingerprint tests). `TERRAIN_VERSION` is 10.
- **Land and water:** about 70% land, 30% water (user request; mean 0.71 over test seeds, tested to 0.65–0.75). Pack-ice seas are rare (about 6% of the route); shelves, crevasse plateaus and radiator plains dominate.
- **Ice and pack ice:** continuous faceted ice-cliff faces with undercuts and calved blocks. Pack ice fields have domain-warped ragged edges, mixed plate sizes and cracked plates.
- **Pipelines:** they cross water only on trestles of up to 6 cells, and lines that can't reach their goal are not built.
- **Look:** a per-planet light and grade table in `scene.ts`; Khepri is pixel-identical. The Vesper side:
  - **Light:** a high, pale, cool sun with blue shadows; bloom threshold 1.2, so snow never blooms.
  - **Water** (`src/render/water.ts`): one opaque draw per strip, with analytic swell, depth tint, shoreline foam, and instanced foam collars and wakes around floes.
  - **Materials:** ice, snow and rock shading derived from the kit's vertex colours; black ceramic infrastructure with orange radiator glow.
  - **Enemies:** Vesper craft models.
- **Live features:** `terrain.features` exposes floes and vents, for foam collars and steam.
- **Preview:** `?planet=vesper` is a hidden preview switch, not offered in any menu, that shows Vesper in any run until Cold Vector ships.

### As built: combat (15 October 2026)

Runtime sources:
- `src/content/ark.ts` (Helion Ark);
- `src/content/bosses.ts` (shared boss definition);
- `src/content/formations.ts` and `encounters.ts` (`COLD_VECTOR`);
- `src/content/balance.ts` (enemy stats);
- `src/sim/bastion.ts` (generic boss simulation, still exporting the Bastion names).

**Enemy kinds (`EnemyKind`):**

| Kind | Role | Radius | HP | Score / credits | Threat | Attack |
| --- | --- | --- | --- | --- | --- | --- |
| `needle` | Fast interceptor | 0.30 | 50 | 150 / 6 | 2 | Narrow 0.4 lane locked on the player: 0.75 s windup + 0.2 s flash, 0.15 s beam, costs **one** shield charge (Lancer beams cost two). Repeats every 1.3 s. Narrow lanes do not count against the wide-beam lane cap |
| `diamond` | Heavy escort (Bulwark family) | 0.60, its whole pale body | 130 (was 220 on a 0.30 core until 15 October; Scatter could not kill one in a pass) | 400 / 16 | 4 | Alternating left/right wing volleys: three tight rounds from the wing, aimed 1.2 to that side of the committed position. Repeats every 1.0 s |
| `missile` | Ground battery | 0.55 | 120 | 250 / 10 | 2 | One straight, non-tracking missile (radius 0.2, speed 9.5) down its own marked column; 1.0 s windup, repeats every 1.1 s. Moves with the terrain; no contact damage |

**Squadrons:**
- `needle-solo`, `needle-line-3` (stepped narrow lanes), `needle-column-5` (sweeping column, mirrorable);
- `diamond-solo`, `diamond-convoy` (2 Diamonds + 2 Needle escorts, +1 Diamond on Veteran);
- `missile-2`, `missile-3`;
- `ark-launch` (boss-only, from the deck bays).

All follow the airspace rule (one air squadron in a stretch of airspace at a time) and the director's exclusion check. Cold Vector uses the same harder cadence as Rolling Thunder (`MISSION_CADENCE['cold-vector'] = 1`).

**Mission timeline (`COLD_VECTOR`, about 4–5 min):**

| Time | Stage |
| --- | --- |
| 2–13 s | Introduction: a Needle, a Diamond and a missile pair, each with a teaching message |
| 17–41 s | Needle squadrons with narrow beam lanes |
| 48–53 s | Relief: an optional cliff battery west, a lone interceptor east |
| 58–84 s | Missile batteries on the ice cliffs |
| 89–147 s | Heavy Diamond escort convoy |
| 160 s | Relief |
| 170 s | Approach ends |
| 181–187 s | The scroll eases to a stop |
| 190 s | The Helion Ark arrives (since 16 October: a 28 s fuel-barge stretch, cues close at 190 s) |

Shield cells:
- 50, 115 and 172 s on Relaxed and Standard;
- 115 and 172 s on Veteran.

**Arena (for the world agent):**
- **Scroll:** a closed form of active time. Full speed (5 units/s) until t = 181 s (distance 905), then a smoothstep ease to zero over 6 s.
- **Stop:** exactly **distance 935** at t = 190 s; the Ark glides in once the terrain has stopped.
- **During the fight:** static.
- **After the kill:** a 1.5 s hold over the wreck, then a 1 s ease back to 5 units/s for a 4 s extraction.
- **Platform:**
  - The open-water platform must cover **s from −9 to +35** relative to the stop, which is **world distance 911 to 955**.
  - It spans the full world width, x from −15 to +15.
  - The Ark glides in from pivot s 26; its stern is about +7.3 behind the pivot.
  - It then holds pivot s 11.5 ± 0.7, with the bow near s 7.8 and the stern near s 18.8.
  - Its post is the camera x at arrival clamped to ±7, swaying ±1.3.

**Helion Ark state (additive contract fields):**
- `BossState.id` is `'ark'`.
- Phases reuse the shared names:
  - `'arrival'`;
  - `'batteries'` (radiators);
  - `'core'` (bridge);
  - `'overload'` (bridge overload);
  - `'destroyed'`.
- `BossState.launchesLeft` and `nextLaunchAt` track the finite launches (3 waves of 2 Needles).
- `BossState.vx` and `vs` give its velocity on the water.
- Boss targets are `Enemy.bossPart`:
  - `'left'`/`'right'` are the radiators (x ∓2.4, s −0.5, radius 0.75, 600 HP);
  - `'core'` is the bridge (x 0, s +1.6, radius 1.0, 1,800 HP).
  - All are at target height 1.6.
- The deck bays (x ∓0.75, s −2) are launch points, not targets.
- Total HP is 3,000 on Standard, scaled by difficulty.
- Other additive fields:
  - `FormationMember.anchorS` places bay launches relative to the moving hull;
  - `Enemy.volleys` counts the Diamond's wing volleys;
  - `Hazard.cost` gives a hazard's shield cost.

**Evidence (`tests/sim/ark.test.ts`, `fairness.test.ts`):**
- The validator covers every Vesper squadron in isolation and Cold Vector on all three difficulties, on the perfect, idle and dodger branches.
- The perfect pilot clears all nine weapon × difficulty combinations of Cold Vector with **zero hits**, no special and no pickups. A wider sweep from two start positions per combination (18 runs) was also clean.
- Clear times by setting:
  - Relaxed: Pulse 245 s, Fan 303 s, Seeker 238 s;
  - Standard: Pulse 272 s, Fan 335 s, Seeker 243 s;
  - Veteran: Pulse 285 s, Fan 365 s, Seeker 251 s.
- The Fan's Ark fight is long (about 150 s on Standard), the same single-target weakness it shows against Bastion-9.
- Scripted mid-skill pilots fail Cold Vector before the Ark about as often as they fail Rolling Thunder before Bastion-9. With run-wide shields and the harder cadence, human playtests must judge it.

## 6. Ownership and order

1. **Kit agent:** the four GLBs (§3).
2. **World agent:** planet profile plumbing and the Vesper generator (§2, §4).
3. **Graphics agent:** water, the per-planet lighting/palette rig, ice materials, Vesper VFX (snow spray, steam).
4. **Combat agent:** mission content, Vesper enemies, Helion Ark simulation.
5. **Integrator:** boss renderer, mission wiring, menu entry (coordinated with Codex's UI files through `COORDINATION.md`), verification, deploys.

**Deploy waves:**
- first a flyable Vesper flight to judge the look;
- then the full mission with the Helion Ark.


**15 October balance notes:**
- The Diamond takes hits on its whole pale body (radius 0.60) and has 130 HP (was a 0.30 core and 220 HP). With the old values Fan Cannon could not kill one in a whole pass, and shots through the visible plates did nothing.
- Needle barrages rest after 7 s on Standard and in endless, and after 5 s on Relaxed (docs/11, "Needle beam rests").
