# Combat, equipment, and progression

Design v0.4 · 14 October 2026. Runtime values in `src/content/balance.ts` govern the playable prototype; unimplemented equipment below remains provisional. These proposals incorporate the user's simplified resources, four campaign equipment slots, minimal icon HUD, and complete separation of campaign from endless. Numbers remain untested starting values.

## 1. Lives and shield charges

The player has **lives and shields**, an unlimited-ammunition main weapon, and one rechargeable special. There is no player hull-health system, repair resource, fuel, heat, shared energy pool, passive-module inventory, or equipment power budget.

| Resource | Proposed baseline | Display |
| --- | --- | --- |
| Lives | Three total in Standard/Veteran campaign and endless; five proposed for Relaxed, including the current ship | One small ship silhouette per remaining life; one disappears on loss |
| Shields | Three discrete shield charges with Standard tech | Three simple shield glyphs; filled means available, outline means depleted |
| Main ammunition | Unlimited | No ammunition indicator |
| Special | One activation, initially ready | Recharge marks on the plain special button only |

A normal accepted hit consumes one shield charge; a heavy hit or airframe collision consumes two. If any shield remains before the hit, it protects the current life even if the hit empties all remaining charges. There is no overflow into life damage. The next accepted hit with no shield removes exactly one life. Enemy HP remains numerical internally; player protection uses discrete charges to match the icon display.

The ship's collision radius is 0.42 for every airframe in the prototype (15 October 2026, user request: the size planned for the Dominion tier, about 1.7 units wide; it was 0.25). Hit regions stay central and honest; the hero models are scaled to match. An accepted hit gives 0.65 seconds invulnerability. Resolve at most one hit per tick/invulnerability interval, choosing the largest eligible incoming hit, and consume colliding non-piercing hostile bullets. Continuous beams obey the same rule. Windups already warned when a hit lands continue; no new windup starts until 0.3 s before the invulnerability ends. Only a respawn cancels windups in progress (implemented 14 October 2026; earlier builds cancelled every windup on any hit, which made sustained pressure impossible). **Shields never regenerate passively.** Recovery during a life requires collecting a rare shield cell; each Standard Array cell restores one charge. Waiting, kills, special use, sector transitions, and pausing do not refill shields.

If lives remain after a loss: preserve equipment and enemy/boss damage, respawn safely near the current world x rather than teleporting to the middle of the wider map, refill shield, set special charge to 50%, clear standard hostile shots near the respawn viewport, and give two seconds invulnerability with new attacks delayed. Resolve a persistent hazard before choosing the safe respawn location. Campaign weapon rank is retained; endless loses one weapon-power pip, minimum zero. A life loss does not fail a campaign mission until the last life is lost.

Endless and Standard/Veteran campaign start with three lives; Relaxed campaign proposes five. No unused campaign life carries to the next mission. Life count, hit cost, and supply placement are tuning values; pickup-only shield recovery is confirmed. Do not add hidden hull HP behind the icon UI.

## 2. Main weapons

Main fire is automatic only with a valid firing path. A target must be alive, damageable, in the current camera view, ahead of the ship, in range, and intersect the weapon's actual acquisition envelope. Ground targets use projected combat proxies. Test shapes and pellet paths, not only target centers. Select the nearest valid forward target, with stable-ID tie-breaking. Aiming does not change for a side mission.

| Main | Role | Base tuning | Campaign price |
| --- | --- | --- | --- |
| Twin Pulse | Narrow reliable fire | Two bolts × 6 damage, 8 volleys/s, speed 30, range 22, half-width 0.55 | Starter |
| Fan Cannon | Wide close/mid-range coverage | Five pellets × 5 damage, 3 volleys/s; angles −12°, −6°, 0°, 6°, 12°; speed 26, range 18 | 250 credits |
| Rail Lance | Precision and piercing | Instant trace, 72 damage, 1.5 shots/s, three targets total with ×0.7 retention per next target; range 24, half-width 0.35 | 450 credits |
| Seeker Pods | Homing fire | Consistent paired launches; acquire visible forward targets within a bounded cone and steer after launch; starting values are now in runtime content | Proposed 450 credits |

All mains can defeat mandatory enemies. Pulse stays straight and Fan preserves its fixed spread even when acquiring different targets. Seeker projectiles explicitly home; this is a weapon-family property, never a universal aiming correction. Burst sub-shots re-check eligibility; already emitted projectiles continue independently. Seeker acquires only visible forward targets at launch and continues its committed flight when the camera moves; do not acquire unseen replacements. The current viewport, not the entire wide map, limits acquisition. Side missions cannot filter targets or protect collateral.

The homing family replaces the earlier Arc proposal in the four-family MVP plan. Chaining Arc remains a possible later weapon. The first prototype implements Pulse, Fan, and Seeker; Rail is later milestone content.

## 3. Special weapons

Campaign equips one special. Endless begins with Shockwave; later run-only swaps are available regardless of campaign unlocks. One full recharge equals one activation; pressing spends it completely. No spare-charge inventory or numeric energy meter. Holding does not repeat; use edge-trigger input and a 0.5-second input debounce.

| Special | Time-only full recharge | Effect | Campaign price |
| --- | --- | --- | --- |
| Shockwave | 45 active seconds | Clear standard hostile projectiles and deal 180 once per damageable target in its activation footprint; one second invulnerability | Starter |
| Seeker Rack | 35 active seconds | Eight missiles × 40 damage, eligible forward targets; no clear/invulnerability | 300 credits |
| Siege Lance | 40 active seconds | Forward beam width 0.9 for 0.8 seconds at 450 damage/s, piercing, ship may move | 400 credits |

Starting recharge proposal: passive time plus 3 percentage points per eligible main-weapon kill, capped at 9 percentage points in a rolling active second. Special kills add zero. No gain from scenery, repeated ineligible summons, objectives, or campaign progression. Passive charging ensures an avoidance-oriented playstyle still gets specials. Compare this with time-only recharge in M1.

Internally store a normalized charge fraction; show it with a few plain ticks on the button. Pause charge in menus, drafts, countdowns, respawn delay, and noncombat transitions. Swapping a special preserves its fraction. Shield/reactor technologies do not modify special charging.

On the wider map, Shockwave's footprint is the canonical viewport rectangle at activation, frozen in world coordinates. It cannot sweep across the map by following a moving camera. Missiles acquire visible forward targets at launch; do not lock unseen enemies. Existing shots persist when the camera moves, with the offscreen-threat safeguards in the camera design. Special behavior is identical with or without a contract.

## 4. Exactly four campaign equipment slots

**Main weapon + special weapon + shield technology + reactor technology.** Every owned combination is legal. No reactor point budget, passive-module slots, equipment weight, or added in-flight meter. Changing owned equipment is free.

| Shield technology | Charges | Cell recovery | Role / price |
| --- | --- | --- | --- |
| Standard Array | 3 | +1 charge | Balanced; implemented starter |
| Bulwark Array | 4 | +1 charge | Larger reserve; proposed 250 credits |
| Flux Array | 2 | Restore both charges | Smaller reserve, efficient rare cells; proposed 250 credits |

Only Standard exists in the prototype. Bulwark/Flux are future sidegrade proposals to test, and neither may passively regenerate.

| Reactor technology | Top lateral speed | Acceleration | Braking | Role / price |
| --- | --- | --- | --- | --- |
| Balanced Drive | 12 | 90 | 125 | Baseline; starter |
| Vector Drive | 14 | 75 | 105 | Fast traversal, more stopping anticipation; 250 credits |
| Precision Drive | 11 | 115 | 170 | Lower top speed, responsive start/stop; 250 credits |

Speed is units/s; acceleration/braking units/s², at campaign pace 1. Endless scales them with its pace (0.8 to 1.1; see [endless difficulty](03-worlds-and-generation.md#8-endless-difficulty-and-seeds)). The 14 October 2026 pacing pass raised Balanced Drive from 10 / 70 / 100 together with the forward scroll (4 → 5 units/s); the unimplemented Vector and Precision proposals were scaled by the same proportion. The camera follows at up to 17 units/s, faster than the fastest drive. Reactor tech changes propulsion and maneuverability, not a power budget or ammunition. All standard patterns and optional routes must work with the slowest supported drive; equipment should change feel rather than make a route physically mandatory.

Example builds: Pulse + Shockwave + Standard + Balanced for general use; Rail + Siege Lance + Flux + Precision for deliberate alignment; Scatter + Seekers + Bulwark + Vector for lateral sweeps.

Main weapon ranks are 0–3, each adding 8% of base damage additively, at 150/300/500 credits. Rank 3 = ×1.24. Specials and both tech slots are sidegrades without extra upgrade trees in this release. Main ranks apply only to campaign. All equipment is obtainable through campaign credits without random blueprints or required achievements.

## 5. Campaign economy

Credits are the single campaign currency; coins are its pickup representation. Drops are credits and shield cells only. A cell restores one charge. No repair kit, ammo battery, weapon-swap pickup, or extra-life drop in campaign. The chosen equipment lasts the mission.

| Reward | Initial amount |
| --- | --- |
| Destroy light / medium / heavy / turret | 4 / 8 / 16 / 10 collected credits |
| Boss kill on successful mission | 60 at results |
| Mission success | 80 repeatable |
| First clear | +150 once per mission |
| Selected mission contract | Usually 60–120 on successful completion |
| Career milestone | Usually 100–500 once per named milestone |

Apply the selected campaign difficulty multiplier to collected/repeatable mission/boss income as specified in [campaign difficulty](11-campaign-difficulty.md). At Standard ×1, success banks collected credits plus entitled clear, boss, contract, and career rewards. Failure/abandon banks floor(0.5 × collected credits) plus new cumulative career rewards, with no clear, boss, or contract reward. Committed kills from failed attempts may advance cumulative campaign goals.

Finalize once per attempt ID in a transaction updating credits, statistics, counters, and award receipts. Reopening results cannot duplicate money. A repeatable contract may pay on a genuinely new completed attempt; a career milestone pays once per profile. See [objectives and statistics](09-objectives-and-statistics.md).

Target roughly 300–450 credits for first clears and 160–260 for repeat clears before optional contract/career bonuses; reconcile with actual enemy counts. All base missions must remain clearable with starter equipment and no support drops. No repair bills or loss of equipment.

## 6. Endless growth and strict isolation

Every run starts with Pulse tier I, ready Shockwave, Standard Array at three charges, Balanced Drive, and three lives. Campaign difficulty, purchases, rank, objectives, stats, coins, and completion cannot affect start state, handling, choice pools, drops, routes, biomes, or scoring. Endless never advances campaign goals or grants campaign coins.

Run-only power pips take the main through five tiers: ×1.00, ×1.15, ×1.35, ×1.55, ×1.80. Switching main preserves tier; death loses one pip. Tier III and V add characteristic projectiles/piercing/chain behavior within that total damage budget. No recursive extra-hit multiplication. Show a short acquisition message and pause detail, not a permanent power meter.

Gun capsules require deliberate collection, then pause for Equip or Convert to power. A duplicate becomes power automatically; excess power at tier V becomes 1,000 score. At sector boundaries offer three distinct choices from main family, power, or special swap; always include something useful. Do not offer automatic shield refills at sector boundaries; shield recovery stays pickup-only. No passive modules or tech upgrades: shield/reactor stay Standard/Balanced throughout this version of endless. Guarantee a power opportunity by 20 active seconds and a weapon opportunity by 30 seconds.

Endless difficulty ramps by sector under the formulas and fairness ceilings in [worlds and generation](03-worlds-and-generation.md#8-endless-difficulty-and-seeds). This is independent of campaign difficulty.

All main/special choices are eligible from the first endless run. Campaign unlocks do not gate any of them. Long-term endless advancement is player skill and recorded scores, with no inherited combat power.

## 7. Pickups and score

| Pickup | Effect | Availability |
| --- | --- | --- |
| Credit / salvage diamond | Enemy credit amount / 50 flat score per group | Campaign / endless |
| Shield glyph | Restore one charge | Both |
| Power chevron | +1 main tier pip | Endless |
| Gun capsule | Main swap or power conversion | Endless |
| Extra life | +1 life, five remaining maximum | Endless fixed milestone only |

Shield cells have a small explicit per-level supply budget, never an independent chance on every kill and no repeatable pity timer. The current 120-second training sortie schedules two cells at 40 and 85 active seconds on Relaxed/Standard, or one at 65 seconds on Veteran. Endless schedules one cell at second 55 of every 90-second sector, independent of campaign difficulty. Supplies appear ahead within the current view; they still require collection. Missing one does not create a replacement. Pausing, losing a life, and revisiting terrain cannot reset the budget. Longer authored levels may tune the placement, starting from one or two cells per level. Full-shield cells convert to five campaign credits or 100 endless score; partially useful ones only refill.

Collection radius is 0.65; ordinary pickup magnet radius 1.6. Drift toward the player's forward row at 5 units/s times the pace; the magnet pulls at 7.5 units/s times the pace. Gun capsules do not magnetize. On a wider map, unexplored caches and unseen optional drops are never globally vacuumed into the ship. At a success/sector boundary auto-collect only already revealed ordinary drops in the current viewport. A revealed pickup remains a world object when panning away and expires normally.

Endless extra lives are earned at 50,000 and 150,000 score, once each per run, awarded at the next safe sector boundary. At five-life cap substitute 2,000 score. Consume milestone receipt first; a pending life does not resurrect a player who loses their last life before the boundary.

Base destruction scores: light 100, medium 200, heavy 400, turret 250, boss 5,000. Each ten consecutive kills raises a multiplier one step up to ×5; an accepted hit resets it. After six active seconds without a kill, lose ten streak kills every two seconds. Use the pre-kill multiplier for that kill, then increment. Pickups/conversions remain flat. No separate combo bar. Objectives and campaign advancement never grant endless score.

Store local scoreboard entries by ruleset/content/generator version and gameplay category, with seed, duration, sector, and outcome. Equal progression-independent starts do not remove random-seed luck. A later shared-seed/public ranked board requires its own comparability and score-verification design; editable local records are not cheat-proof.

## 8. Validation

Check discrete shield loss/recovery, shield-break survival, exactly one life lost per accepted unshielded hit, respawning in the current wide-map region, special charge and world-fixed footprint, and mode isolation. Compare all campaign drives against reachable paths under camera movement. No side mission may affect simulation.

Record shield hits, lives lost, specials used, weapon/tech choice, time aligned, route visited, credits, and objectives in local statistics. Enemy time-to-kill starting goals remain 0.4–0.8 seconds for light enemies, 1.5–3 seconds for heavies, and 45–70 seconds for bosses. With the 14 October HP values, Twin Pulse kills a Dart in 0.57 s and a Weaver in 0.78 s.

**Combat difficulty calibration (14 October 2026).** Squadron formations, overlapping cues, repeat volleys and the scaling in [campaign difficulty](11-campaign-difficulty.md) and the [endless ramp](03-worlds-and-generation.md#8-endless-difficulty-and-seeds) replaced the sparse playlists. Deterministic scripted pilots in `tests/sim/difficulty.test.ts` guard the calibration; fairness is validated separately ([fairness](03-worlds-and-generation.md#7-fairness-for-leftright-only-movement)). Standard endless:

| Pilot | Measure | Before (13 Oct) | 14 Oct (squadrons, pacing) | 15 Oct (current) |
| --- | --- | --- | --- | --- |
| Idle (never moves) | First life lost | 28.2 s | 27.4 s | 29.1 s (target 25–40 s) |
| Idle (never moves) | All lives lost | 86.9 s | 53.4 s | 52.0 s |
| Simple dodger, 0.2 s reaction (median of 5 starts) | First life lost | 71 s | 57 s | 30 s (never before 28 s) |
| Simple dodger, 0.2 s reaction (median of 5 starts) | All lives lost | 229 s | 155 s | 109 s |
| Mid-skill hunter (aligns, then dodges the nearest bullet) | First life lost | 158 s | 99 s | 76 s |
| Mid-skill hunter (aligns, then dodges the nearest bullet) | All lives lost | 484 s | 169 s | 131 s |
| Perfect solver pilot (no special, no pickups) | Sectors 1–4 | 0 hits | 0 hits | 0 hits |
| — | Hostile shots per minute (dodger, hunter) | 14 | about 100–110 | about 66–75 |

The 14 October pass added squadrons and a 25% faster pace (scroll 4 → 5, Balanced Drive 12 / 90 / 125, camera 17). The 15 October pass made several changes:

- one air squadron at a time (the airspace rule) with much faster repeat volleys;
- the 0.42 collider;
- the 30-unit map;
- endless starting at the old pace (0.8) and ramping to 1.1.

Fewer bullets now reach the row per minute than on 14 October, but each squadron fires faster and the larger ship is far easier to hit.

The perfect pilot proves that a surviving path exists for a pilot who reads every warning; it is not a model of human play. Phone playtests remain the gate for readability and fun.
