# Balance measurement: pilots, expected tiers, progression

13 November 2026. The user's "Perfect Pilot & progressive difficulty" spec (addressed to Codex; the user assigned it to this
session). Tests and reports only: **no gameplay constant changed.** The one source edit is a type annotation
(`planEvasion`'s `margin: number`).

## Three questions, kept apart

| Question | Where | Pilot and equipment |
|---|---|---|
| **Hazard fairness:** can every attack be dodged? | `fairness.test.ts` (formations), `fairness-campaign`, `fairness-endless-early/late` (hazard unions) | perfect, idle, dodger, and the new **pacifist** (perfect evasion, every friendly shot removed: nothing dies before it attacks). Level 1 Twin Pulse; independent of damage. |
| **Campaign completion:** can a skilled pilot finish a mission with the equipment expected there? | `campaign-completion.test.ts` (fast), `balance-report.test.ts` (extended) | perfect pilot at `EXPECTED_RANK`; no specials, no pickups |
| **Endless progression:** how far does a pilot get from the starter, earning tiers from real pickups? | `endless-progression.test.ts` (fast), `balance-report.test.ts` (extended) | perfect pilot collecting reachable pickups (`pickupSeeker`) |

## Expected weapon tier (Standard; `tests/sim/balance-setup.ts` `EXPECTED_RANK`)

| Mission | id | Expected |
|---|---|---|
| Luna, Training | `training` | Level 1 (rank 0) |
| Khepri, Rolling Thunder | `bastion` | Level 1 |
| Vesper, Cold Vector | `cold-vector` | Level 2 |
| Nacre, Deep Bloom | `deep-bloom` | Level 2 |
| Amnion, Brood Strike | `brood-strike` | Level 3 |
| Corona, Dying Star | `dying-star` | Level 3 |
| Nahara, The Silent Empire | `silent-empire` | Level 4 |
| Umbra, Final Horizon | `final-horizon` | Level 4 |

These are balancing expectations; nothing in the game enforces them. Relaxed and Veteran use the same expectations.

## The pilots

- **Perfect** (unchanged at its core): the exact safe-gap solver on what it saw 0.2 s ago, the ship's real acceleration,
  braking and top speed; it never teleports, never reads future random events and is never immune.
- **New in the perfect pilot:**
  - a closed Relic Shield (a quarter of the damage, until it opens or breaks) is a resistant target: it shoots something
    softer meanwhile;
  - `pickupSeeker`: when pickups are on, it steers for a power cell, or a shield cell when its shields are not full, but
    only one it can still intercept; the evasion planner owns every move, so a pickup is never taken through danger.
- **Pacifist** (fairness branch): the perfect pilot with every friendly shot removed (`fly` `noFire`), so every pattern is
  flown in full.
- **Skilled** (`skilledPilot`, measurement only): the same planner with human limits: 0.3 s reaction, a 1.2 s look ahead,
  a replan every 9 ticks, a 0.05 margin. It separates missions and tiers where the perfect pilot cannot.
- **Hunter** (existing `beamAwareHunterPilot`): dodges the nearest bullet and marked lanes, no solver. It loses every
  mission at every level, even Luna at Level 5, so it brackets the game from below and is no use for balance.
- `fly` now logs shield hits, kills, damage dealt, hostile shots and lanes met, the boss's phase times and the tier history.

## Results (Standard, 5 seeds × 4 weapons × 5 levels; raw lines and full tables reproducible with the commands below)

### Perfect pilot

- **Completion:** 100% of 800 flights. Every mission at every level with every weapon, almost no hits (Final Horizon at
  Level 1 Twin Pulse: 0 lives lost).
- **Relaxed and Veteran** at the expected level: 160/160 each; Veteran 40 hits, no lives lost.
- **Conclusion:** the solver is too precise to measure difficulty by survival. What the tiers change is time and pressure:

| Mission | Shots met per minute, Level 1 / expected / Level 5 | Boss fight s (Twin Pulse), Level 1 / expected / Level 5 |
|---|---|---|
| Luna | 99 / 99 / 34 | 54 / 54 / 10 |
| Khepri | 118 / 118 / 47 | 71 / 71 / 13 |
| Vesper | 99 / 88 / 46 | 145 / 86 / 25 |
| Nacre | 274 / 241 / 85 | 158 / 97 / 29 |
| Amnion | 244 / 202 / 102 | 127 / 67 / 24 |
| Corona | 253 / 198 / 109 | 167 / 85 / 39 |
| Nahara | 233 / 152 / 89 | 140 / 48 / 22 |
| Umbra | 247 / 162 / 103 | 160 / 61 / 31 |

### Skilled pilot (completion, mean lives lost, mean hits per mission; 20 flights per cell)

| Mission | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| Luna | 100%, 0, 0.25 | 100%, 0, 0.20 | 100%, 0, 0.15 | 100%, 0, 0.10 | 100%, 0, 0.00 |
| Khepri | 100%, 0, 0.65 | 100%, 0, 0.30 | 100%, 0, 0.20 | 100%, 0, 0.35 | 100%, 0, 0.10 |
| Vesper | 100%, 0, 0.35 | 100%, 0, 0.65 | 100%, 0, 0.90 | 100%, 0, 0.85 | 100%, 0, 0.10 |
| Nacre | 90%, 0.50, 2.40 | 100%, 0.15, 1.45 | 100%, 0.15, 1.50 | 100%, 0.05, 0.60 | 100%, 0, 0.05 |
| Amnion | 100%, 0, 1.55 | 100%, 0, 0.95 | 100%, 0, 0.45 | 100%, 0, 0.65 | 100%, 0, 0.15 |
| Corona | 95%, 0.70, 3.25 | 100%, 0, 1.85 | 95%, 0.20, 1.45 | 100%, 0, 0.80 | 100%, 0, 0.20 |
| Nahara | 100%, 0.20, 2.05 | 100%, 0.05, 1.25 | 100%, 0, 1.20 | 100%, 0.15, 1.40 | 100%, 0, 0.30 |
| Umbra | 90%, 0.80, 3.30 | 100%, 0.30, 2.50 | 100%, 0.05, 1.35 | 100%, 0, 0.70 | 100%, 0, 0.55 |

- **At the expected tier,** every weapon family completes every mission (Corona with the Seeker Array 4/5). Mean hits stay
  between 0 and 1.8 per mission; the Fan Cannon's boss fights run longest (up to 106 s on Khepri).
- **Veteran** at the expected tier: 90–100% completion, 0.6–2.45 mean hits. **Relaxed:** 100%, at most 0.75.

### Endless, natural progression (perfect pilot, real pickups, 8 seeds to sector 31)

- **Every run** reached sector 31 at Level 5, with 0 lives lost, 10 bosses down and 6 power gains (1 + 1 + 2 + 2 cells).
- **First time at each level** (median run seconds): Level 2 at 157, Level 3 at 229, Level 4 at 394, Level 5 at 640
  (about sector 8).
- **Checkpoints:**
  - Sector 5: Level 3–5, median 3.5.
  - Sectors 10, 15, 20 and 30: Level 5 in every run.
- **Isolated sectors** (mode C, artificial equipment, 180 s, 3 seeds): no lives lost at any level in sectors 10, 20 or
  30. Kills scale with the tier (sector 20 Twin Pulse: 11 at Level 1, 52 at Level 4, 99 at Level 5). Only Level 5 brought
  a boss down inside the window (sector 10).
- The spec's initial hypothesis (Level 4 by sectors 14–19) is far behind the measured progression: the perfect pilot
  collects every cell and never loses a tier.

### Hazard fairness with the pacifist

- **Formations:** all 171 cases pass, the pacifist hit 0 times in every one.
- **Hazard unions:** all 39 runs pass every rule on all four branches, with one exception: the pacifist is not held to
  the view-relative seal heuristic. On Dying Star, Relaxed, seed 21, at 60.9 s, its own drift moved the view onto a
  strike-site scramble dart's authored dive after the director had admitted a turret volley in the earlier view. The dart
  grazes the left strip by 0.05; the pacifist was never hit there (nor anywhere on Dying Star over 9 runs).
- **Pacifist hits** in long unions (Endless stretches with a boss it never kills, Brood Strike) are pilot misjudgements,
  not unfair attacks: the trace finds no rule broken. Example: Brood Strike, Standard, 52.6 s. A ground battery's fast
  shot was seen 0.18 s before impact while the pilot steered toward the battery to aim; its windup was warned in time.
  They are reported, not asserted.

## Difficulty bottlenecks (the spec's A–G)

- **G, strong weapons remove threats before they act (main cause):**
  - at the expected Level 4, the late missions meet 34–38% fewer hostile shots than at Level 1 (Umbra 247 → 162 a minute,
    Nahara 233 → 152);
  - Umbra and Nahara at Level 4 meet less fire than Nacre at its expected Level 2 (241 a minute).
- **A, enemies die too quickly:**
  - the late missions' kill rates are the highest: Umbra 22.4, Nahara 19.7 a minute, against 12.8 on Luna;
  - the bosses at Level 4 fall in 48–61 s, faster than the mid-campaign bosses at their expected levels (Nacre 97 s,
    Corona 85 s).
- **D, the dangerous phases:** they are reached, but briefly. THE ECLIPSE's overload lasts 11.8 s at Level 4.
- **C and F, formation pressure and suppression:** not measured yet; the director's rejections (`retryDelay` retries)
  should be counted next.
- **B and E, predictability and windups:** no evidence: the skilled pilot's hits rise across the campaign at Level 1, so
  the late patterns do pressure a pilot who meets them.

## Proposal (not implemented; for the user's decision)

Limited to Nahara and Umbra, one at a time, each re-measured with the skilled pilot (target: about 2 mean hits per
mission at Level 4, still 100% completion for the perfect pilot):

1. **Earlier fire, not more hit points:** shorten the late squadrons' first-attack delay (`fireFrom` on their formations)
   by about 20%. Each threat then fires at least once before a Level 4 weapon removes it. Expected: shots met at Level 4
   back to about Level 2 Nacre's level (~240 a minute).
2. **More simultaneous squadrons:** one more concurrent squadron in the late decks' middle stretches. The director keeps
   them fair.
3. **Longer dangerous phases, not a bigger pool:** raise THE ECLIPSE's and THE CITADEL's overload share (the fall at a
   higher fraction) so more of the fight is the hardest phase, and keep the total hit points.
4. **Endless progression** (separate decision; the spec forbids changing pickup rates without justification): Level 5 by
   sector 8 is early. A cell drop rate scaled by sector would hold Level 4 to sectors 14–19, as the spec hypothesised.

## Commands

```
# fast CI (also in npm test)
npx vitest run tests/sim/campaign-completion.test.ts tests/sim/endless-progression.test.ts tests/sim/fairness*.test.ts
# extended (one target per process; append to a JSONL, then summarise)
BALANCE_REPORT=out.jsonl BALANCE_TARGET=campaign BALANCE_PILOT=skilled BALANCE_WEAPONS=all BALANCE_RANKS=0-4 BALANCE_SEEDS=1-5 npx vitest run tests/sim/balance-report.test.ts
BALANCE_REPORT=out.jsonl BALANCE_TARGET=campaign BALANCE_RANKS=expected BALANCE_DIFFICULTIES=relaxed,veteran BALANCE_SEEDS=1-5 npx vitest run tests/sim/balance-report.test.ts
BALANCE_REPORT=out.jsonl BALANCE_TARGET=endless BALANCE_SEEDS=1-8 BALANCE_LAST_SECTOR=31 npx vitest run tests/sim/balance-report.test.ts
BALANCE_REPORT=out.jsonl BALANCE_TARGET=isolated BALANCE_SECTORS=10,20,30 BALANCE_LEVELS=1-5 BALANCE_SEEDS=1-3 npx vitest run tests/sim/balance-report.test.ts
node tools/balance-report.mjs out.jsonl
```

## Remaining

- **The pilot's open gap:** fast aimed ground shots met while steering toward their battery (the pacifist's hits).
  Probably the pending-attack footprint (at the attack's aim point) misses where the shot actually lands; not yet
  confirmed.
- **Director rejections:** count them per mission (bottleneck F).
- **Endless with the skilled pilot:** natural progression with life losses and tier drops.
- **No phone or human playtest data.**

## 13 November, later: the user's progression and the campaign pressure

- **Expected weapon levels**, per the user ("luna is lvl 1, khepri and vesper 2, nacre and amnion 3, corona 4 and nahara
  umbra 5"; players replay missions to afford them): Level 1, 2, 2, 3, 3, 4, 5, 5. Luna stays gentle onboarding.
- **Campaign-only pressure** (`MISSION_PRESSURE`, `MISSION_CADENCE` in src/content/balance.ts; Endless untouched), as
  tuned with the user on 13 and 14 November:

| Mission | Repeats | First attack | Reinforce | Windup | Flight | Flocks | Boss health |
|---|---|---|---|---|---|---|---|
| Luna | 1.25 (unchanged) | — | — | — | — | — | ×1.4 |
| Khepri | 0.75 | 0.9 | 0.45 | — | — | — | ×1.3 |
| Vesper | 0.85 | 0.9 | 0.35 | — | — | — | — |
| Nacre | 0.92 | 0.85 | 0.2 | — | — | — | — |
| Amnion | 0.66 | 0.8 | 0.7 | 0.9 | 1.1 | — | ×1.5 |
| Corona | 0.72 | 0.75 | 0.45 | 0.9 | 1.06 | Veteran, budget 18 | ×1.6 |
| Nahara | 0.52 | 0.5 | 1.7 | 0.8 | 1.2 | Veteran, budget 22 | ×2.75 |
| Umbra | 0.52 | 0.5 | 1.7 | 0.8 | 1.2 | Veteran, budget 22 | ×2.7 |

  - **Repeats:** the enemy repeat-attack interval.
  - **Reinforce:** a mirrored copy of an air squadron 2 s later; above 1 a second copy, 2 s after that. Never beam
    squadrons, lone ships, or squadrons whose path dives through the ship's row. The director admits each like any cue.
  - **Windup:** shot telegraphs, never under the 0.65 s floor; beams keep theirs.
  - **Flight:** air squadrons' path speed.
  - **Flocks:** the formations' authored Veteran members.
  - **Boss health:** campaign only (the user: harder boss fights for the late worlds, at most ×3).
- **Two yardsticks** (the user: "we need both, by level but also by fixed level. Every upgrade should be noticeable, but
  not overpower the level youre on"). Skilled pilot, 40 runs a cell, mean hits a mission:
  - **At Level 4:** Luna 0.17, Khepri 0.33, Vesper 0.38, Nacre 0.57, Amnion 0.80, Corona 1.77, Nahara 1.90, Umbra 2.88.
    It rises at every step. Boss fights: 23, 32, 42, 48, 68, 80, 111, 133 s.
  - **At the expected level:** 0.38, 0.42, 0.42, 0.95, 0.90, 1.77, 0.85 (Nahara at Level 5), 2.30.
  - **The upgrade to the expected level** cuts hits by about 25-55%. Nahara's Level 5 jump still halves it; the user
    left that for playtesting (14 November).
  - **The perfect pilot** completes every mission at its expected level.
  - **Under-levelled Umbra** is very hard: Level 1 completes 7 of 40, Level 3 31 of 40.
- **Fairness kept strict:** the campaign unions found two seal cases from the quicker repeats (Deep Bloom Standard,
  Dying Star Veteran). Their factors were eased (0.8 → 0.86, 0.66 → 0.72); the check was not weakened.
- **At the deploy gate (14 November):** Luna's quicker repeats (1.1) broke the formation fairness check (a Veteran turret
  site of three) and went back to 1.25: Luna's extra challenge is its boss alone (×1.4). Deep Bloom settled at repeats
  0.92 and first attack 0.85, which pass all of its fairness unions. The grid above was measured before these two.
- The fixed-seed no-hit tests moved: Rolling Thunder 10, Deep Bloom 1/9/4, Brood Strike 6, Final Horizon 5.

