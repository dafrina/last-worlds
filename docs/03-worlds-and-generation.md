# Worlds, enemies, bosses, and generation

## 1. Three planets with mechanical identities

| Planet | Visual identity | Combat emphasis | Ground life | Boss |
| --- | --- | --- | --- | --- |
| **Khepri — Rust Expanse** | Ochre basalt, turquoise mineral fractures, graphite foundry machinery, dusty soft shadows | Learn alignment, aimed shots, alternating lanes | Cargo crawlers, relay stations, ground batteries, distant drilling rigs | Bastion-9, a tracked mobile fortress |
| **Nacre — Luminous Mire** | Indigo water, teal bioluminescent reeds, violet vegetation, dark monoliths | Sine-flight formations, delayed volleys, overlapping rhythms | Pump platforms, amphibious machines, dormant alien ruins | Mire Crown, a walking refinery platform |
| **Vesper — Glass Frontier** | Pale ice, deep blue ocean, black ceramic structures, orange radiator fins | Precise burst windows, narrow telegraphed beams, coordinated heavy escorts | Ice haulers, radiator fields, missile emplacements | Helion Ark, a hovering industrial carrier |

The environment never changes the basic collision plane. Water, cliffs, fog, and ice are scenic. Environmental danger must be a marked combat hazard with the same fair rules as an enemy attack. Avoid wind that steals lateral control or snow that obscures shots. Each planet adds a combat idea, not just a palette swap.

Within each planet use three terrain families: open traversal, industrial concentration, and dramatic landmark. Every family has quiet flight regions and richer detail outside active combat. The viewport is a moving 12-unit-wide slice of initially 36-unit-wide terrain; do not build a permanently screen-bounded canyon. Author left/center/right optional routes as described in [wide map and camera](10-wide-map-and-camera.md). Distant ground traffic may move, but only targets with the faction silhouette and aim markers are shootable.

## 2. Enemy behavior catalog

| Archetype | Shape language | Movement and attack | Counterplay | Scope |
| --- | --- | --- | --- | --- |
| Dart | Narrow triangular fighter | Enters from top; one aimed burst after 0.65 s warning | Move after aim commits; align on its approach | Slice |
| Weaver | Crescent wings | Bounded sine movement; two slow parallel shots | Predict its crossing; use open lane between pairs | Slice |
| Skirmisher | Twin-tail interceptor | Crosses upper screen, pauses, fires a three-shot fan | Follow its pause without chasing into warning | MVP |
| Bomber | Broad heavy wings | Slow descent; launches two visible drifting mines that burst in defined lanes | Destroy early or leave marked lane | MVP |
| Bulwark | Wide armored central body | Occupies upper row; alternating left/right volleys | Move with rhythm; destroy exposed core | Full |
| Lancer | Long needle hull | Marks a narrow lane, locks aim, then emits a brief beam | Exit warned strip; shoot during recovery | Full |
| Spike Battery | Triangular ground base with tall barrel | Stationary relative to terrain; one aimed three-round burst | Same alignment rules as air targets | Slice |
| Crawler | Low tracked chassis, paired pods | Moves slowly laterally on ground; alternating pod fire | Pick a pod to reduce pressure | Slice |

Starting HP: Dart 55, Weaver 75, Skirmisher 80, Bomber 150, Bulwark 220, Lancer 120, Spike Battery 110, Crawler 160. Crawler's MVP version is one damageable entity; split pods are boss tech, not required for every enemy. Dart, Weaver, Lancer and Spike Battery HP rose on 14 October 2026 so that squadrons survive long enough to fire; Twin Pulse still kills a Dart in 0.57 s and a Weaver in 0.78 s, inside the light-enemy goal in [combat](02-combat-and-progression.md#8-validation). Runtime values live in `src/content/balance.ts`.

Enemies entering from a side cannot attack until fully visible and warned. Airframes that travel below the player line stop firing and leave quickly. Never spawn behind the player. Enemies may pass harmlessly out of view if missed; missing a kill costs score and rewards, not unavoidable collision damage.

Aim at the player's current horizontal position only at a documented commit point. Once a projectile launches, standard shots do not track. A locked beam does not move with the player. If a tracking special enemy is added later, it needs its own unmistakable appearance and rule.

In the prototype the commit point is the start of the windup: the warning line is drawn to the committed point and the shot is released when the warning ends. A squadron member may add an authored lateral **aim offset** to the committed player x (bracketing). The offset is part of the template, is committed at the same moment, is shown by the same warning line, and never tracks afterwards. Each archetype keeps its own attack shape: Dart one aimed shot, Weaver two parallel aimed shots 1 unit apart, Spike Battery an aimed three-round fan, Lancer a 0.8-unit beam lane.

### Authored squadrons

Squadrons are authored templates in `src/content/formations.ts`: a leader path as keyframes relative to an anchor, a slot offset per member, an optional time lag along the path (columns), an optional flipped path (pincers), a staggered first windup per member, and an optional aim offset. Members marked as the Veteran variant fly only on Veteran campaign difficulty and from endless sector 3. A placement may fly the template's mirror image or shift it laterally by up to 2 units; both are validated variants, never random.

| Template | Members (Veteran adds) | Path | Fire pattern | Counterplay |
| --- | --- | --- | --- | --- |
| `arrow-5` | 5 darts in a V (+2 wingmen) | Dive in, hold a row with slow sway, climb out | One windup every 0.5 s; leader and inner wings aim at the player, outer wings bracket ±1.6 | Move decisively or slip inside the bracket |
| `arrow-3` | 3 darts | Dive in, steady hold | Leader aims at the player, wings bracket ±1.5 | Introduction: the leader dies in your lane |
| `line-dart-4` | 4 darts abreast (+2) | Hold with sway | Ripple volley 0.35 s apart, aims stepping from −2.1 to +2.1: a sweep | Read the sweep, go behind it |
| `line-weaver-4` | 4 weavers abreast | Hold with sway | Staggered 0.7 s; inner pair brackets ±1.2 | Use the lanes between parallel pairs |
| `echelon-4` and mirror | 4 darts on a diagonal (+1) | Strafes across while descending, exits to the side | Staggered 0.5 s, alternating brackets | Keep moving against the strafe |
| `snake-weaver-5` and mirror | 4 weavers in a column (+1) | Enters from one side; a sine column crossing the view | Each member fires as it passes, 1.2 s apart | Predict the crossing |
| `pincer-4` | 2 darts per flank (+1 per flank) | Readable alert 1.4 s before entry; enters from both sides, holds, withdraws | Flanks alternate 0.6 s apart; outer pair brackets | Stay central, break one flank |
| `diamond-lancer` | Lancer leading 3 darts | Hold with sway | Beam lane plus bracketing darts | Leave the lane away from the bracket |
| `dive-pair` | 2 darts | Dives straight through the player row at ±2.3 | One shot each | The dive lanes are contact hazards |
| `battery-2/3/4` | 2–4 Spike Batteries | Fixed to the scrolling ground | Staggered fans 0.7–1 s apart | Destroy one to remove its layer |
| `solo-*` | One dart, weaver, lancer or battery | As above | As above | Teaching and recovery |

Squadrons dive in or climb out in 1.4 s, sweep and strafe about 25% faster than the first squadron pass, hold their row for 4–8.5 s and repeat their volleys while they hold. Base repeat intervals are Dart 1.85 s, Weaver 2.2 s, Spike Battery 1.85 s and Lancer 3.2 s, scaled by difficulty. Base shot speeds are Dart 7.9, Weaver 6.6 and Spike Battery 7.3 units/s. Ground batteries move with the terrain scroll (`VIEW.scrollSpeed`, 5 units/s since 14 October 2026). Within one squadron no two windups start less than 0.3 s apart, so a squadron never fires as one wall. Held rows keep every member inside the view while it may fire. No member spawns inside the view or behind the player; every path ends outside the view.

Biome variants retain recognizable silhouettes and base mechanics. Material, exhaust, wing attachments, volley timing, and formation may vary within validated limits. A fast variant must be labeled visually; a recolor alone must not secretly triple bullet speed.

## 3. Boss design

Bosses are authored state machines with targetable modules and readable phase transitions. No random geometry or improvised attacks. Boss damage windows cannot require a particular gun or special. Cap fight length through accessible targets and exposure, not forced damage races.

### Bastion-9: the vertical-slice centerpiece

Occupies the upper third of the view while terrain moves underneath. Its body is visibly below the aircraft, with two elevated weapon housings and a central core. The large ground silhouette communicates scale; projected combat targets communicate where to shoot.

| Phase | Targets / starting HP | Pattern | Tactical decision |
| --- | --- | --- | --- |
| Arrival, 3 s | None damageable until markers activate | Fortress rolls in, dust trails, shutters open; no incoming attack | Read the layout |
| 1: artillery | Left and right battery, 400 HP each | Alternate aimed bursts; 0.8 s warning and 0.3 s locked interval included within warning | Choose which gun to remove first |
| 2: core | Core, 1,600 HP after both batteries break | Slow fans with wide safe gaps; at most two Dart escorts at once | Stay aligned while timing lateral dodges |
| 3: overload | Same core at below 40% remaining HP | Alternate fixed beam lanes with at least one broad reachable safe lane; larger warning glow | Commit damage during recovery windows |

Phase 3 is a pattern transition, not restored HP. The minimal HUD communicates boss damage through visible weakpoints rather than a default extra bar. Removed guns remain destroyed and cannot keep shooting. Escorts are finite per sequence and yield no special-charge or drop farming if repeatedly summoned. Transition waits at least 0.75 s before introducing new threats; remove incompatible lingering hazards.

Boss destruction is a sequence: module sparks → internal flashes → chassis collapse → short expanding shock ring → reduced smoke. The reward summary starts only after dangerous entities are cleared. The scene should stay responsive to pause throughout.

### Mire Crown

Broad refinery on four articulated legs. Two side condensers expose alternating cores. Slow pressure waves cross the player row as separated danger intervals, never full-screen rings that require vertical movement. Breaking a condenser removes one rhythmic layer. Final core periodically opens for sustained alignment. Target total effective HP around 2,600 before mission-specific tuning.

### Helion Ark

Carrier moving above ice can visually sit higher than ordinary ground machinery; its targets still use the same combat-plane contract. Destroy two radiator weapons, then the bridge. Alternating lane lasers and finite fighter launches test learned patterns. Large wings are scenery, not an enormous hidden collision box. Target total effective HP around 3,000; ordinary starter weapons still need useful core exposure.

For each boss document the active targets, damageable flags, attack schedule, incoming-projectile limits, phase exits, death handling, and behavior if a player respawns. Never use a phase timer to silently restore health.

## 4. Campaign mission plan

| Mission | Length target | Authored arc | New emphasis |
| --- | --- | --- | --- |
| K1: First Contact | 3 min | Low-pressure approach → air patrol → turrets → extraction | Steering, auto acquisition, special, drops |
| K2: Foundry Run | 3–4 min | Formation pairs → ground convoy → mixed defenses → heavy convoy finale | Prioritization and build choice |
| K3: Rolling Thunder | 3–4 min | Mixed approach → recovery → Bastion-9 | Ground weakpoints and boss phases |
| N1: Marshlight | 3–4 min | Open water → weaver formations → pump complex | Tracking movement without tracking bullets |
| N2: Undertow | 4 min | Delayed bursts → bomber groups → recovery lanes | Timing multiple rhythms |
| N3: Crownfall | 4–5 min | Refinery approach → Mire Crown | Removing attack layers |
| V1: Cold Vector | 4 min | High-contrast introduction → lancer lanes → heavy escorts | Precise commitment windows |
| V2: Radiator Field | 4 min | Heavy columns → offset beams → bomber recovery | Maintaining a reachable route |
| V3: Last Foundry | 4–5 min | Reprise of prior lessons → Helion Ark | Mastery with any legal build |

Unfinished planets do not appear as clickable empty content in the MVP. Display the first planet as a complete chapter; expand the map when the later chapters are actually built.

For the standalone vertical slice, use a 200-second sequence: 15 s control/acquisition tutorial, 45 s air approach, 40 s mixed ground encounter, 15 s relief/pickups, up to 75 s fortress, 10 s extraction. This is a test mission, not a requirement to duplicate the entire K3 script.

## 5. What should be procedural

| Layer | Approach | Reason |
| --- | --- | --- |
| Terrain decoration | Seeded placement in bounded sockets | High visual variety with limited gameplay risk |
| Terrain chunks | Hand-built modular pieces, stitched by connectors | Coherent routes, predictable density and draw cost |
| Encounters and endless battle order | Explicitly authored sequences, cycling through designed difficulty stages | Predictable patterns, readable pressure, progression fairness |
| Enemy formations | Authored complete patterns, including any chosen mirror/offset | Preserve deliberate battle composition |
| Enemy statistics | Small documented modifiers by sector | Difficulty that remains recognizable |
| Hero spaceship appearance | Deferred: possible approved part/material variants | Not required for MVP; enemy designs remain authored |
| Bosses and campaign combat | Authored | Memorable encounters and repeatable mastery |
| Mesh topology, unrestricted attacks, runtime AI generation | Excluded | Large validation and production burden |

No generative AI service is called by the running game. Concept images help art direction; models and shaders are authored and packaged ahead of time.

## 6. Chunk contract and director

A combat chunk lasts 15–25 seconds, has entry/exit tags, spawn events, a threat cost, a cooldown after pressure, and a known safe-path envelope. Terrain pieces can scroll independently beneath it. Every chunk declares its maximum enemies, bullets, active lane exclusions, reward eligibility, and compatibility tags.

For initial authoring, a chunk's threat cost is the sum of the costs of its scheduled enemies. The sector's threat budget is a ceiling per admitted chunk, not a single allowance for the entire 90-second sector. Default boundaries wait until threats clear; a chunk with validated overlap must count surviving prior enemies against the new admission budget and simultaneous entity limits. Recovery time is included in the chunk's duration, with no new spawn in its final recovery interval.

The first content set should contain 12 authored templates: three introductions, three line-alignment challenges, two aimed-shot baits, two mixed air/ground phrases, one recovery, and one miniboss-style heavy convoy. Mirroring and lateral offsets are validated variants, not separate authored content counts. Full release expands to roughly 24 templates with biome-specific variations.

Authored scheduling sequence:

1. Select the documented campaign mission or endless sector stage.
2. Read its authored encounter list in the declared order, including coordinates, timing, and formation choices.
3. Wait for required clearance and reject a content definition that exceeds its budget or entity limits.
4. Delay a scheduled attack when visibility or an existing hazard would make it unreadable; do not substitute a randomly selected battle.
5. Use a documented quiet recovery interval if the authored schedule cannot safely continue. Log the content error for correction.

Seeded world generation runs independently and cannot rewrite enemy composition, placement, or attack timing. Generated terrain is scenic around the authored combat anchors; optional ground targets are placed with sufficient clearance and compatible ground height. World variation is an MVP feature, not a later decoration pass.

Pressure alternates between introduction, pressure, recovery, pressure, climax, recovery. Never stack the hardest two chunks just because budget remains. The director does not secretly aim harder after a player gets a good build or lower rewards after success. Shield supply budgets are explicit and independent of performance or objectives; there is no repeatable shield pity timer.

### As implemented in the prototype (14 October 2026)

Content lives in `src/content/encounters.ts` (cue sequences) and `src/content/formations.ts` (squadron templates, §2); the director is `updateDirector` in `src/sim/game.ts`. There are five authored sequences: Training (120 s), the Rolling Thunder approach (cues to 98 s, then relief before Bastion-9 at 115 s), and three endless playlists: opening (sector 1), pressure (sectors 2–3) and peak (sector 4 onward, repeated at the capped ramp). Each sequence follows the arc exactly once: intro → pressure → recovery → pressure → climax → recovery.

- **Cue.** A time, a pacing label, one or more squadron placements, and an optional message and authored pickup. Pressure cues overlap: a new squadron arrives every 3–5 s while earlier ones still hold their rows. Recovery cues carry at most 6 threat and are followed by at least 5 s before the next cue.
- **Placement anchor.** A `view` anchor resolves to the camera center when the cue is admitted, clamped to the camera range, so the mandatory battle follows the player across the wide map. A `world` anchor pins optional side-route content (salvage west, outpost east) to a world x. Both use the same templates; mirrors and lateral offsets of at most 2 units are the only variants.
- **Two-flank alert.** A cue containing a two-sided entry first shows its alert, then admits the members 1.4 s later. If another message overwrites the alert or it goes stale before admission, the alert is shown again with the full lead.
- **Admission.** A cue is admitted whole or not at all. Threat costs are Dart 1, Weaver 2, Spike Battery 2, Lancer 3. Surviving enemies plus the new cue must fit the live threat budget of the current scale ([campaign difficulty](11-campaign-difficulty.md), §8 for endless) and the 24-enemy ceiling; otherwise the cue waits. Every authored cue fits every scale that flies it.
- **Windup gate.** A member may start a windup only inside its template's firing window, while fully visible and above the s = 3.5 attack floor. A cap limits simultaneous windups (3–7 by scale) and marked beam lanes (1–2 by scale).
- **Exclusion windows.** Before committing a windup, the director predicts the row footprints of every committed hazard (shots in flight, marked beams, windups already running, airframe paths through the player row) plus the new attack. It admits the windup only if, in every 0.25 s simultaneity window over the next 4.5 s, a physical clear gap of at least 1.4 units remains in the view, both view edges and the center are never blocked together, and a conservative player model can still reach a clear position: 0.2 s reaction, 0.15 s maneuver delay, then 80% of the drive's top speed (9.6 units/s with Balanced Drive's 12), with the collider plus 0.15 comfort margin on each side of every hazard. A rejected windup waits 0.25 s and is checked again; its pattern is never edited and existing bullets are never moved. If the player is already committed to an unavoidable hit, only the gap and seal rules apply, so the director neither stalls nor quietly eases off.
- **Pool limit.** If a volley would overflow the projectile pool, the whole volley is skipped; a fixed pattern is never trimmed bullet by bullet.

Hit invulnerability (0.65 s) no longer cancels windups in progress; it only blocks new windups until 0.3 s before it ends. Respawn still clears hostile shots in view, cancels all windups and delays new attacks for 2 s, as specified in [combat](02-combat-and-progression.md#1-lives-and-shield-charges).

## 7. Fairness for left/right-only movement

At the player's fixed forward row, threats occupy horizontal world-space intervals over time across the wider map. Camera position and visible warnings constrain which physical escape routes are actually readable. Test the union of projectile, beam, and contact hazards; testing each enemy independently is insufficient.

Initial constraints:

- At least 0.65 s from first readable warning to a threatening shot; beams at least 0.9 s. These are floors, not sufficient by themselves to guarantee dodgeability.
- At least 0.30 s after aim locks before impact is possible. Increase this when required by travel distance and acceleration.
- Safe intervals must include player collider radius, an additional 0.15-unit comfort margin on each side, and movement time. Target a minimum clear gap of 1.4 units; bosses usually give more.
- No spawn or scheduled hazard may overlap the player's body without prior warning. No attack may require a special, pickup, upgraded reactor tech, or destroying an enemy in time to avoid certain damage.
- No simultaneous hazards that seal both screen edges and the center. Decorative occluders cannot cover the playfield or aim indicators.

Validation has two levels. First, offline enumerate authored schedules across difficulty stages and world seeds, and model reachable `(x, velocity, cameraX)` states with acceleration/braking, conservative swept collisions, and reaction delay. Recompute aimed-shot commitments per simulated player branch; a precomputed straight-line bullet script does not validate adaptive attacks. Reject any sequence with no surviving branch. Second, during play the director uses conservative exclusion windows and can delay an unsafe new pattern. Existing bullets are never secretly moved or deleted to save the player.

This algorithm is a guardrail, not a proof that a human finds the pattern fair. Human phone playtests remain a release gate. If a rigorous branch validator is too expensive for M1, use only fixed authored schedules, conservative restrictions, and manual validation; do not ship an unvalidated authored schedule or allow world generation to introduce hidden hazards.

**Implemented validation (prototype).** The runtime half is the exclusion window in §6, constants in `FAIRNESS` (`src/content/balance.ts`). The offline half is `tests/sim/fairness.test.ts`. It runs the real simulation and observes it with an independent trace that does not reuse the director's prediction code. The trace records every windup start, release, beam, row crossing and airframe contact, then checks:

- each release came at least 0.65 s after its windup started, and beams were marked for at least 0.9 s;
- lock to earliest impact was at least 0.30 s;
- no windup started out of view and no shot appeared without a completed windup;
- every 0.25 s window of actual hazards left a 1.4-unit gap in the view and never sealed both edges and the center.

Branches are recomputed by flying several pilots: a perfect pilot (the safe-gap solver with the simulation's exact acceleration, braking and top speed, acting on what it saw 0.2 s earlier, with no special and no pickups), an idle pilot and a simple dodger. Each aimed commitment is therefore resolved against each branch. Coverage:

- every squadron template, both mirrors, all three campaign difficulties and capped endless, from several start positions including one at the world edge;
- every cue sequence at every difficulty: Training, Rolling Thunder including the boss, endless sectors 1–4, and capped sector 9.

The perfect pilot must take no hit in isolated squadrons and lose no life in any sequence. Static checks cover warning floors at every scale, lock floors at the fastest shot speed, entry and exit sides, in-view windups, intra-squadron stagger, pacing arcs, recovery spacing, threat budgets, entity ceilings and placement variants. `tests/sim/fairness-guard.test.ts` proves that the director rejects sealing and last-gap windups and that the validator detects walls, seals, short warnings, unwarned shots and offscreen windups. World seeds do not change combat, so seeds are not enumerated beyond confirming identical battles.

## 8. Endless difficulty and seeds

Sector combat duration is 90 seconds excluding draft pauses. Every third sector ends with a boss; stop adding ordinary chunks before its entry. Boss duration may extend the sector by up to 60 seconds; if time expires, the boss retreats, awards no kill reward, and the run continues. Never kill the player merely for low damage output. Campaign bosses do not retreat.

Difficulty by sector `s >= 1` (runtime source: `ENDLESS_RAMP` in `src/content/balance.ts`; revised 14 October 2026 to start harder and ramp sooner):

```
healthScale         = min(1 + 0.08 * (s - 1), 1.60)    // cap reached in sector 9
bulletSpeedScale    = min(1 + 0.04 * (s - 1), 1.30)    // cap reached in sector 9
attackIntervalScale = max(1 - 0.06 * (s - 1), 0.70)    // repeat volleys; floor reached in sector 6
threatBudget        = min(22 + 3 * (s - 1), 34)        // live threat incl. survivors; cap in sector 5
windups / beam lanes = 5 / 1 in sectors 1-2, 7 / 2 from sector 3
squadron variant    = base in sectors 1-2, Veteran wingmen from sector 3
playlist            = opening (sector 1), pressure (2-3), peak (4+)
```

The previous proposal was `healthScale = min(1 + 0.06(s − 1), 1.60)`, `bulletSpeedScale = min(1 + 0.025(s − 1), 1.25)` and a per-chunk `threatBudget = min(8 + 2(s − 1), 24)`, with no cadence, windup or variant ramp. Sector 1 starts with squadrons from second 2, but the first 20 s stay an introduction: a ship that never moves loses its first life at about 28 s. After those caps, repeat at capped difficulty with new order and biome rotations. Endless means no scripted final stage, not infinitely accelerating bullets. No global timer that eventually makes all patterns impossible. Bullet count, warning time, and safe-path constraints remain hard limits at every sector.

Use stable PRNG streams for loot, terrain, and cosmetics derived from `runSeed + generatorVersion`. Encounter order and parameters come from the authored schedule, without encounter RNG. Log executed chunk IDs and parameters for reproductions. Changing grass density must not change enemy order or drops. Record simulation/content version with a score; exact cross-browser bit-identical replay is not promised for v1.
