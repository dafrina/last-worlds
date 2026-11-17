# Campaign difficulty

How hard the game is and why: the three campaign settings, the per-world intensity, the campaign-only mission pressure,
and the separate endless ramp (invariant 15). All values are in `src/content/balance.ts`; how they are measured is in
[balance measurement](40-balance-measurement.md).

## 1. Three settings, chosen per attempt

Relaxed, Standard or Veteran is chosen on the campaign page before launch and locked for that attempt; a change applies
to the next launch and never to a paused run. Every setting is available for every unlocked mission. Endless never reads
it.

`DIFFICULTIES` holds each setting's `DifficultyScale`:

| Field | What it does | Relaxed / Standard / Veteran |
| --- | --- | --- |
| `lives` | Starting lives (Ironclad adds one) | 5 / 3 / 3 |
| `hp` | Enemy hit points | ×0.85 / ×1 / ×1.2 |
| `shotSpeed` | Hostile shot speed | ×0.85 / ×1 / ×1.05 |
| `warning` | Seconds added to every windup (never below Standard's) | +0.25 / 0 / 0 |
| `cadence` | Enemy repeat-attack interval (lower fires more often) | ×2 / ×1 / ×0.75 |
| `firstAttack` | A squadron's first windup (its template's `fireFrom`) | ×1 / ×0.75 / ×0.5 |
| `airFirstShot` | Air craft open fire this much sooner on top | ×0.75 / ×0.75 / ×1 |
| `maxWindups`, `maxBeams` | Simultaneous windups and beam lanes | 3, 1 / 5, 1 / 7, 2 |
| `rank` | Which authored formation variant flies | standard / standard / veteran (extra wingmen) |
| `threatBudget` | Ceiling on the live threat cost ([docs/03 § 6](03-worlds-and-generation.md)) | 14 / 16 / 20 |
| `beamRest` | Needle beam rest (§ 2) | 5 s run, 4 s rest / 7 s, 3 s / none |

Shield arrays, hit costs, weapon and special rules, the camera and handling are the same on every setting. There is no
hidden aim assistance, gear restriction or altered side-mission logic. Shields are one pool for the attempt on every
setting: losing a life never refills them.

**Earlier first attacks** (user, 4 and 6 November: "they are dead before they even started shooting", "25% quicker enemies
shooting after arrival"): `firstAttack` and `airFirstShot` bring a squadron's first windup forward. Members keep their
authored stagger, so a squadron never fires as one sealing wall; no windup starts before an enemy is fully in view
(`FIRST_WINDUP_ROW`); every windup keeps its full warning. Aces and Wraiths take the same factor on their own timers.
Ground batteries keep the difficulty's timing.

## 2. Challenge and fairness

All three settings fly the same authored squadrons, cues and timings; Veteran adds the wingmen marked as its variant in
each formation template (`src/content/formations.ts`), which are authored and validated, not random additions. The
fairness floors (`FAIRNESS`), the minimum gap and the director's exclusion windows apply identically on every setting
([docs/03 § 7](03-worlds-and-generation.md)). Difficulty is fixed, never adaptive to purchases, deaths or history.

- **Needle beam rests** (user, 15 October: nonstop beam barrages in endless): once Needle beams have run for `beamRest.run`
  seconds without a pause of 2.5 s, Needle windups not yet fired are called off and none starts for `beamRest.rest`
  seconds. Endless uses Standard's rest; campaign Veteran has none.
- **Vesper line cap:** outside campaign Veteran, at most `VESPER_LINE_CAP` warning lines (windups plus live beam lanes) at
  once on Vesper (user, 31 October and 6 November).

## 3. Shared progression, labelled mastery

Clearing a mission on any setting unlocks the next one; purchases and balances are shared across settings. Clears and
best times are stored per mission and per difficulty, with the hardest setting cleared shown on the mission card
(`MissionRecord` in `src/campaign/profile.ts`). The first-clear reward is paid once per mission across all settings.

## 4. Credits

The repeatable payout scales with `CREDIT_MULTIPLIER` (×0.85 / ×1 / ×1.2); the first-clear reward and side-mission rewards
do not. The full formula, with the per-world scale, is in [docs/30](30-campaign-progression.md#currencies-and-income).
These small multipliers recognize the challenge without making the hard setting a required grind.

## 5. Per-world intensity and mission pressure

Pressure rises across the worlds in both modes, and further in the campaign.

- **`WORLD_INTENSITY`** (both modes; user, 16 October: "training moon pretty chill, then gradually ramp up"): per world,
  `flight` scales air enemies' flight clock, `shot` their shot speeds (bosses too), `cadence` their repeat intervals, `hp`
  formation enemies' and aces' hit points, `firstAttack` their first windup. Luna is the baseline; the late worlds step up
  past Nacre (late-world curve, 10 November).
- **`MISSION_CADENCE`** (campaign only): a per-mission factor on repeat intervals on top of the difficulty. Training stays
  gentle; the later missions repeat sooner.
- **`MISSION_PRESSURE`** (campaign only; user, 13–14 November: the late missions were too easy at their expected weapon
  level): per mission, `firstAttack` (earlier first windups), `reinforce` (the share of air squadrons in the pressure and
  climax stretches followed by a mirrored copy two seconds later; above 1 a third), `windup` (shorter shot telegraphs, never
  under `FAIRNESS.warningFloor`; beams keep theirs), `flight` (faster air paths), `rank` and `threatBudget` (the Veteran
  flocks at every difficulty, with room to admit them) and `bossHp` (the boss's health, at most about ×3). Reinforcements
  are never beam squadrons, lone ships or squadrons whose path dives through the ship's row, and the director admits each
  like any cue.

The pressure was tuned with the user on 13–14 November. Luna's extra challenge is its boss's health alone: quicker repeats there
broke a formation fairness check and were reverted.

Every boss splits its health 40/25/35 over its three phases (`BOSS_PHASES` in `src/content/boss-phases.ts`; user,
14 November), so the final phase is no longer the shortest; `bossHp` scales every part alike.

## 6. Endless ramp

Endless has its own standardized ramp by sector, independent of every campaign setting (`ENDLESS_RAMP`): enemy health,
shot speed and repeat interval rise per sector to caps; the threat budget grows to a cap; more simultaneous windups and
two beam lanes, and the Veteran formations, from sector 3. The pace ramps too (`PACE.endless`: from a slower start to a
cap, eased in at each sector start), scaling the ship, enemies and camera together. After the caps, warnings, gaps and
entity limits never scale. Endless also flies each world's `WORLD_INTENSITY`, but never `MISSION_CADENCE` or
`MISSION_PRESSURE`. The cycle itself is in [docs/18](18-endless-planet-cycle.md).

The campaign's own pace is `PACE.campaign` (user, 6 November: "15% quicker pace").

## 7. Checks

- `tests/sim/difficulty.test.ts`, `difficulty-pressure.test.ts`: per-setting start values, pressure and the scripted
  calibration.
- `tests/sim/fairness*.test.ts`: every setting keeps a fair path; no factor may be loosened to make content fit.
- `tests/sim/late-world-curve.test.ts`: the late worlds step up.
- `tests/sim/campaign-completion.test.ts`: the perfect pilot completes every mission at its expected level.
- `tests/campaign/profile.test.ts`: first clears across settings, multipliers and rounding.
