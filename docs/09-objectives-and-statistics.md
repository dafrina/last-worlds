# Campaign advancement, side missions, statistics, and score fairness

Design v0.2 · 13 October 2026. Side missions reward campaign coins/credits only. They observe existing mechanics; they never modify those mechanics. Sparing infrastructure was the user's example, not a requirement to add infrastructure destruction.

## 1. Two simple advancement tracks

**Career milestones** accumulate across finalized campaign attempts: destroy 100 enemy ships, complete five sorties, defeat three bosses. Each named tier awards credits once. No equipping a counter and no new currency.

**Mission contracts** are optional goals chosen before launch, at most one per campaign attempt. They require completing the mission as well as the condition. They may pay again on a genuinely new successful attempt. Main progression never requires a particular contract.

Both systems are absent from endless. An aircraft counter at 99/100 stays there after endless kills. Endless cannot award campaign credits, complete campaign goals, or unlock campaign equipment. Campaign progression cannot influence endless combat, drops, choices, or score.

## 2. Observation only

Objective evaluators receive authoritative events but cannot issue commands to movement, camera, targeting, weapons, damage, spawns, loot, or scoring. Given the same mission, loadout, seed, and tick inputs, selecting a contract must leave combat events and RNG state identical. Only observations and campaign result rewards differ.

No protected-target flags, automatic cease-fire, altered splash damage, selective special immunity, easier enemies, bonus drops, or target filters for a side mission. Normal auto-fire stays active. If a normal spread shot, chain, or special destroys a relevant object, the objective records that destruction normally.

Offer only objectives compatible with existing missions. A no-ground-kills challenge cannot accompany a mandatory ground-fortress kill. Do not silently exempt the boss or replace its mechanics. A preservation challenge may be interesting where precise positioning and leaving optional enemies alive are naturally possible; if it is frustrating or impractical with auto-fire, omit it from that mission's pool.

Infrastructure/obstacle preservation is a later candidate only if those destructible categories independently exist in the core game. Non-destructible scenery never counts. Lateral exploration goals can observe visits to authored optional areas without moving the camera, placing extra rewards, or forcing a route for the contract.

## 3. Proposed career milestones

| ID | Campaign goal | One-time credits |
| --- | --- | --- |
| air_100 | Destroy 100 enemy aircraft | 100 |
| air_500 | Destroy 500 enemy aircraft | 250 |
| air_2000 | Destroy 2,000 enemy aircraft | 500 |
| clear_5 | Complete five sorties; repeats count | 150 |
| clear_20 | Complete twenty sorties | 300 |
| clean_3 | Complete three sorties without losing a life | 150 |
| special_50 | Destroy 50 eligible enemies with specials | 150 |
| boss_3 | Defeat three campaign bosses; repeats count | 200 |

All thresholds read cumulative totals from the start. Claiming air_100 does not reset the counter. Eligible events from failed/abandoned attempts may advance cumulative goals when finalized; a clear-only goal cannot advance on failure. Debug, test-range, replay, duplicate-collider, and unbounded ineligible-summon events never count. Process-interrupted attempts commit only known checkpoint progress, marked incomplete.

Optional campaign service titles summarize milestone completion: Cadet initially, Pilot at one milestone, Veteran at three, Ace at six. They unlock campaign badges or liveries, not stats or equipment access. No XP bar, daily expiry, streak pressure, task rerolls, or second spendable currency.

## 4. Proposed mission contracts

| Contract | Condition, in addition to clearing the mission | Repeat credits | Eligibility |
| --- | --- | --- | --- |
| Clean Flight | Lose no life; shield hits allowed | 80 | Ordinary missions |
| Air Sweep | Destroy at least 90% of authored eligible aircraft, rounded up | 80 | At least ten finite aircraft with known schedule |
| Special Delivery | Destroy eight eligible targets with specials | 60 | Enough targets/recharge time under normal mechanics |
| Ground Restraint | Zero player-attributed ground-enemy destructions | 120 | No mandatory ground kill; manually validate with unchanged auto-fire |

These are a pool to validate, not a requirement to bend missions around every example. Add an exploration contract only when a base mission already contains reachable optional landmarks. A cumulative 100-ship goal must not force 100 ships into a short mission.

Air Sweep uses the authored eligible schedule locked at launch as its denominator, including missed/despawned aircraft. It excludes unbounded summons. Avoid route objectives whose denominator counts mutually exclusive route branches; either publish a route-specific count or omit the objective.

No-life-loss fails on a life loss, not shield damage. A destruction restriction fails when the player destroys that category, including supported secondary explosions or chains attributed to the original damage owner. Damage without destruction does not fail a destruction-only condition. The evaluator must observe actual entity tags, not model color or whether an object visually sits on the ground.

Failure of a contract never ends the main mission. Record it quietly; normal success rewards remain available. Evaluate after all final-tick damage/destruction events so a last-tick violation cannot slip through.

## 5. Rewards and persistence

Before launch show one optional contract card and a separate campaign career panel. In flight there is no permanent checklist or extra bar. Show a short safe-boundary notice if helpful; detailed progress lives in pause and results. Results list collected credits, clear/first-clear/boss rewards, contract reward, and new career rewards separately.

One atomic attempt-finalization transaction applies counters, lifetime statistics, allowed credits, objective outcomes, milestone receipts, and attempt status. Career thresholds pay once per profile; contracts at most once per completed attempt. Multiple newly crossed career tiers may each pay once. One real kill can count toward both a career goal and the selected contract, but cannot be duplicated within either.

At Standard difficulty, failure/abandon pays half collected credits, rounded down, plus newly earned cumulative career rewards. Other campaign settings apply their repeatable-income multiplier as specified in [campaign difficulty](11-campaign-difficulty.md). It pays no mission-clear, boss, or contract bonus. Success pays all entitled rewards. Refresh, duplicate finalization, reopening results, and replay imports cannot award again. Import restores/replaces a versioned profile with receipts; never sum raw imported counters or credits into the current profile.

## 6. Statistics screen

Main menu includes Statistics, with independent Campaign and Endless tabs. Campaign adds All / Relaxed / Standard / Veteran filters and difficulty-labeled mission records. No combined progression, currency, kill-to-unlock total, or shared leaderboard. Shared display settings do not merge modes.

| Campaign statistics | Endless statistics |
| --- | --- |
| Attempts, clears, failures, abandons, interrupted attempts | Finished, retired, interrupted, and practice runs |
| Per-mission clears, best clear time, contract badges | Best standard score, top ten eligible runs, furthest sector |
| Aircraft, ground enemies, bosses, and optional caches discovered | Kills, bosses, survival time, discovered regions per run |
| Lives lost, shield hits, specials used | Lives lost, shield hits, specials used |
| Credits earned by source and spent | No campaign currency/objective fields |
| Career milestones and service title | Score history with seed, category, and versions |
| Weapon/tech usage, active playtime | Weapon usage and active playtime |

Campaign clear rate = clears / finalized fully observed launched attempts, including failures and deliberate abandons. Interrupted attempts are displayed separately and excluded from that percentage. Time excludes menus, countdowns, app backgrounding, and pauses. Best clear time needs a fully observed successful attempt. Scoreboard duration and stats use simulation time, not wall clock.

Count one boss kill when the boss dies, not one per collider or detachable gun. Destructible modules can have their own detail counter. Only genuinely eligible entities count for reward-bearing milestones. Discovery fires once per stable region/cache ID in an attempt; panning away and back does not rediscover it for bonuses.

Persist lifetime aggregates, last 50 attempt summaries per mode, and top 10 endless entries. Details show loadout, outcome, time, route/discovery summary, and credits or score; campaign entries also show contract results. No unlimited per-shot history. Incomplete checkpoint records are labeled. This is local game data, not shipped network analytics.

## 7. Endless scoreboard fairness

Construct the endless starter independently: Pulse tier I, ready Shockwave, Standard shield, Balanced reactor, three lives. Do not copy campaign loadout and reset selected fields. All endless weapon/special pools, routes, and biomes are available immediately. No campaign cosmetic unlock should change ranked visibility or hit perception; the endless starting appearance is fixed.

Partition the local MVP scoreboard by ruleset/content/generator version and gameplay category. Ordinary random-seed runs have the same starting conditions but different route/drop luck. A later shared-seed challenge board can compare the same seed and versions, with explicit retry/practice rules; do not conflate it with a random-run board.

Reduced motion, palettes, handedness, audio, and render quality do not affect eligibility or simulation. Any future gameplay-changing assist belongs to a separate category. Debug and interrupted runs are excluded from the standard board but retained as labeled history. Fully observed retirement may be recorded as retired under standard rules.

A public online board is a separate implementation decision beyond the local MVP. It needs verified submissions, immutable ruleset identification, duplicate-submission protection, and defined policies for offline runs and retries. Do not advertise editable client scores as cheat-proof. No backend is being implemented in this planning task.

## 8. Acceptance criteria

- Campaign at 99 aircraft remains at 99 throughout an endless run, with no campaign credit or milestone award.
- Fresh and fully completed profiles produce identical endless snapshots and same-input seeded outcomes, including camera/route rules and reward pools.
- Contract on/off yields identical combat events and RNG state for identical inputs; no target protection or changed special behavior.
- Incompatible mandatory targets reject a contract before launch; optional failure leaves the main mission playable.
- Career rewards, contract payout, and statistics update once under refresh, double finalization, multi-threshold completion, and save import.
- Mode/category/version filters prevent score mixing. Checkpoint recovery cannot fabricate a mission clear, perfect run, or full-data record.
