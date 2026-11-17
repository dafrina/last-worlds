# Balance measurement

How balance is measured without human playtests: the scripted pilots, the weapon level each mission expects, the suites
and reports, and the latest results. The tuning itself is in [campaign difficulty](11-campaign-difficulty.md). The pilots
live in `tests/sim/pilots.ts`; the measurement setup in `tests/sim/balance-setup.ts`.

## Three questions, kept apart

| Question | Suites | Pilot and equipment |
|---|---|---|
| **Hazard fairness:** can every attack be dodged? | `fairness.test.ts` (formations), `fairness-campaign`, `fairness-endless-early`, `fairness-endless-late` (hazard unions) | perfect, idle, dodger and pacifist; Level 1 Twin Pulse, independent of damage |
| **Campaign completion:** can a skilled pilot finish a mission with the equipment expected there? | `campaign-completion.test.ts` (fast), `balance-report.test.ts` (extended) | the perfect pilot at `EXPECTED_RANK`; no specials, no pickups |
| **Endless progression:** how far does a pilot get from the starter, earning tiers from real pickups? | `endless-progression.test.ts` (fast), `balance-report.test.ts` (extended) | the perfect pilot collecting reachable pickups (`pickupSeeker`) |

## Expected weapon level

`EXPECTED_RANK` in `tests/sim/balance-setup.ts`, set by the user on 13 November ("luna is lvl 1, khepri and vesper 2,
nacre and amnion 3, corona 4 and nahara umbra 5"; players replay missions to afford upgrades): Level 1 on Luna, 2 on
Khepri and Vesper, 3 on Nacre and Amnion, 4 on Corona, 5 on Nahara and Umbra. These are balancing expectations; nothing in
the game enforces them, and Relaxed and Veteran use the same ones.

## The pilots

- **Perfect:** the exact safe-gap solver on what it saw 0.2 s ago, with the ship's real acceleration, braking and top
  speed. It never teleports, never reads future random events and is never immune. It treats a closed Relic Shield as a
  resistant target and shoots something softer meanwhile. With `pickupSeeker` it steers for a power cell, or a shield cell
  when its shields are not full, but only one it can still intercept safely.
- **Pacifist** (fairness): the perfect pilot with every friendly shot removed (`fly` with `noFire`), so every pattern is
  flown in full. Its hits measure the pilot, not the content: they are reported, not asserted.
- **Skilled** (`skilledPilot`, measurement only): the same planner with human limits (a slower reaction, a shorter look
  ahead, less frequent replanning, a small margin). It separates missions and levels where the perfect pilot cannot.
- **Hunter** (`beamAwareHunterPilot`): dodges the nearest bullet and marked lanes, no solver. It loses every mission at
  every level, so it only brackets the game from below.

`fly` logs shield hits, kills, damage dealt, hostile shots and lanes met, the boss's phase times and the tier history.

The perfect pilot proves that a surviving path exists; it is too precise to measure difficulty by survival. The skilled
pilot's hits per mission are the yardstick for pressure.

## Latest results

**Campaign, skilled pilot, measured 13–14 November** after the campaign pressure was tuned with the user
(40 runs a cell, Standard, mean hits a mission):

| Mission | At Level 4 | At the expected level | Boss fight at Level 4 |
|---|---|---|---|
| Luna | 0.17 | 0.38 | 23 s |
| Khepri | 0.33 | 0.42 | 32 s |
| Vesper | 0.38 | 0.42 | 42 s |
| Nacre | 0.57 | 0.95 | 48 s |
| Amnion | 0.80 | 0.90 | 68 s |
| Corona | 1.77 | 1.77 | 80 s |
| Nahara | 1.90 | 0.85 (Level 5) | 111 s |
| Umbra | 2.88 | 2.30 (Level 5) | 133 s |

- At a fixed level, pressure rises at every step of the campaign (the user: "we need both, by level but also by fixed
  level. Every upgrade should be noticeable, but not overpower the level youre on").
- The upgrade to the expected level cuts hits by about 25–55%; Nahara's step to Level 5 still halves them, which the user
  left for playtesting (14 November).
- The perfect pilot completes every mission at its expected level. Under-levelled Umbra is very hard (Level 1 completes 7 of
  40, Level 3 31 of 40).
- Measured before Luna's repeat interval went back to 1.25 and Deep Bloom settled at 0.92 / 0.85 at the 14 November gate.

**Boss phases, skilled pilot at Level 4, 6 seeds, after the 40/25/35 split** (`BOSS_PHASES` in
`src/content/boss-phases.ts`, 14 November), seconds per phase:

| Mission | First | Core | Final | Total |
|---|---|---|---|---|
| Training | 7.0 | 3.9 | 7.7 | 18.6 |
| Rolling Thunder | 9.9 | 6.7 | 7.3 | 23.8 |
| Cold Vector | 11.5 | 11.0 | 16.9 | 39.3 |
| Deep Bloom | 14.0 | 8.5 | 20.7 | 43.2 |
| Brood Strike | 26.1 | 18.0 | 21.1 | 65.2 |
| Dying Star | 25.0 | 17.0 | 24.8 | 66.7 |
| Silent Empire | 38.7 | 22.0 | 29.1 | 89.8 |
| Final Horizon | 45.7 | 26.4 | 40.5 | 112.6 |

**Endless, perfect pilot with real pickups, measured 13 November** (8 seeds to sector 31): every run reached sector 31 at
Level 5 with no life lost; median first time at Level 2, 3, 4 and 5: 157, 229, 394 and 640 s (about sector 8). The perfect
pilot collects every cell and never loses a tier, so real players progress more slowly.

**Hazard fairness:** all formation cases pass with the pacifist unhit; the hazard unions pass every rule on all branches.
The pacifist alone is not held to the view-relative seal heuristic: on Dying Star, Relaxed, seed 21, its own drift moved
the view onto a strike-site dart's dive after the director had admitted a volley in the earlier view (it was never hit).

## History

The first measurement (13 November, before any change) found that strong weapons removed the late missions' threats before
they fired: at Level 4 Umbra and Nahara met less fire than Nacre at Level 2, and their bosses fell faster than the
mid-campaign ones. That led to the campaign-only `MISSION_PRESSURE` and the per-mission `MISSION_CADENCE`
([docs/11](11-campaign-difficulty.md#5-per-world-intensity-and-mission-pressure)); endless was left as it was.

## Commands

```
# fast (part of npm test)
npx vitest run tests/sim/campaign-completion.test.ts tests/sim/endless-progression.test.ts tests/sim/fairness*.test.ts
# extended (one target per process; append to a JSONL, then summarise)
BALANCE_REPORT=out.jsonl BALANCE_TARGET=campaign BALANCE_PILOT=skilled BALANCE_WEAPONS=all BALANCE_RANKS=0-4 BALANCE_SEEDS=1-5 npx vitest run tests/sim/balance-report.test.ts
BALANCE_REPORT=out.jsonl BALANCE_TARGET=campaign BALANCE_RANKS=expected BALANCE_DIFFICULTIES=relaxed,veteran BALANCE_SEEDS=1-5 npx vitest run tests/sim/balance-report.test.ts
BALANCE_REPORT=out.jsonl BALANCE_TARGET=endless BALANCE_SEEDS=1-8 BALANCE_LAST_SECTOR=31 npx vitest run tests/sim/balance-report.test.ts
BALANCE_REPORT=out.jsonl BALANCE_TARGET=isolated BALANCE_SECTORS=10,20,30 BALANCE_LEVELS=1-5 BALANCE_SEEDS=1-3 npx vitest run tests/sim/balance-report.test.ts
node tools/sim/balance-report.mjs out.jsonl
```

To watch a pilot fly, or record one to video: [docs/41](41-autopilot-and-recording.md).

## Open

- **The pilot's gap:** fast aimed ground shots met while steering toward their battery (the pacifist's hits); probably
  the pending-attack footprint misses where the shot actually lands. Not confirmed.
- **Director rejections** (`retryDelay` retries) are not counted per mission yet.
- **Endless with the skilled pilot:** natural progression with life losses and tier drops is not measured.
- **Endless progression pace:** Level 5 by about sector 8 for a perfect collector; a sector-scaled cell rate was proposed
  but not decided.
- No phone or human playtest data.
