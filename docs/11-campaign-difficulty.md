# Campaign difficulty levels

Design v0.2. Selectable campaign difficulty is a confirmed user requirement. The names, numbers, reward multipliers, and unlock policy below are proposed tuning defaults. Endless retains one standardized gameplay ruleset and does not inherit the campaign setting.

## 1. Three choices before launch

| Setting | Purpose | Starting lives | Enemy HP | Hostile shot speed | Warning time | Repeatable credit multiplier |
| --- | --- | --- | --- | --- | --- | --- |
| Relaxed | Learn routes, enjoy the campaign, try builds | 5 | ×0.85 | ×0.85 | Base +0.25 s | ×0.85 |
| Standard | Intended baseline experience: a real challenge | 3 | ×1.00 | ×1.00 | Authored baseline | ×1.00 |
| Veteran | Master timing and positioning | 3 | ×1.20 | ×1.05 | Same minimum as Standard | ×1.20 |

The prototype also scales attack pressure (runtime source: `DIFFICULTIES` in `src/content/balance.ts`, revised 15 October 2026):

| Setting | Repeat-attack interval | Simultaneous windups / beam lanes | Squadron variant | Live threat budget | Shield cells (Training · Rolling Thunder) |
| --- | --- | --- | --- | --- | --- |
| Relaxed | ×2.00 | 3 / 1 | Base | 14 | 40 s, 85 s · 40 s, 105 s |
| Standard | ×1.00 | 5 / 1 | Base | 16 | 40 s, 85 s · 40 s, 105 s |
| Veteran | ×0.75 | 7 / 2 | Base plus authored Veteran wingmen | 20 | 65 s · 105 s |

Budgets were lowered on 15 October (from 18 / 24 / 32) together with the rule that squadrons never overlap. Later the same day base repeat intervals were cut by about 17%, Relaxed's multiplier was widened from ×1.7 to ×2.0, and the Training sortie gained a mission factor of ×1.25 on repeat intervals (`MISSION_CADENCE`), so Rolling Thunder carries the full pressure. In practice one air squadron flies at a time, with ground batteries beneath it, and difficulty comes from the faster repeat volleys instead of more enemies. Campaign always flies pace 1.

All difficulties are available for an unlocked mission from the start. Select in mission preparation; persist the preferred campaign difficulty separately from endless. Lock it for an attempt. Changing it in the menu applies to the next launch and never mutates a paused run.

Shield technology, discrete hit costs, main/special rules, camera behavior, and reactor handling are unchanged by difficulty. There is no hidden aim assistance, extra currency, gear restriction, permanent penalty, or altered side-mission logic. Extra Relaxed lives simply use more of the same small ship icons. On every setting shields are one pool for the whole attempt: losing a life does not refill them, and only shield cells add charges. Standard and Veteran therefore absorb 6 accepted hits per attempt and Relaxed 8, plus whatever cells are collected.

## 2. Challenge and fairness

Use the same mission structure and route identities initially. Difficulty scales the specified values only; any later harder formation must be a separately authored and validated variant. Do not arbitrarily stack waves or add untelegraphed attacks. Veteran keeps readable warnings and reachable paths with every campaign reactor, including Precision's lower top speed.

All three settings fly the same authored squadrons, cues and timings. Veteran adds the extra wingmen marked as its variant in each squadron template; those members are part of the authored and validated template, not random additions. The fairness floors, the 1.74-unit gap (1.4 before the 0.42 collider) and the director's exclusion windows apply identically on every setting ([fairness](03-worlds-and-generation.md#7-fairness-for-leftright-only-movement)).

Scripted calibration, 15 October 2026 (`tests/sim/difficulty.test.ts`). These are deterministic bot results, not human playtests. A mid-skill pilot aligns under targets and dodges only the nearest bullet it saw 0.2 s ago; medians are over five start positions.

| Training sortie | Relaxed | Standard | Veteran |
| --- | --- | --- | --- |
| Hostile shots per minute faced by that pilot (13 Oct → 14 Oct → 15 Oct) | 11 → 73 → 51 | 16 → 98 → 65 | 17 → 115 → 90 |
| Its outcome at extraction (15 Oct, final) | clears 4 of 5 runs, median 3 of 5 lives lost | fails all 5 runs, median game over at 84 s | fails all 5 runs, median game over at 97 s |
| Hits it takes per minute (Training · Rolling Thunder approach, 9 starts, lives to spare) | 3.7 · 3.7 | 4.7 · 5.7 | 4.5 · 5.8 |
| Fire faced by the perfect pilot, shots per minute (15 Oct) | 47 | 67 | 92 |

The 0.42 collider and the run-wide shield pool dominate the 15 October changes. The mid-skill pilot still clears Training on Relaxed but fails it on Standard. Its hits come mostly from squadrons' first volleys rather than repeat volleys: a sweep of Training-only interval factors from ×1.0 to ×1.75 moved its Standard game-over time between 57 s and 84 s without producing clears. The ×1.25 factor was kept because it gave the longest Standard survival while Relaxed still clears. Veteran is not easier than Standard for this bot (hit rates are within 5%). Its denser fire is partly offset by tougher squadrons holding the airspace longer, so Veteran's edge shows in the fire a strong pilot faces, its single shield cell and its enemy HP. Human playtests should judge whether Standard Training is too punishing. The remaining levers are fewer squadrons in Training's first pressure phase, later first volleys, or more Standard lives; restoring the shield refill is excluded by the user's decision.

Veteran's shot-speed multiplier dropped from ×1.15 to ×1.05 in the 14 October pacing pass, which raised every base shot speed by about 10%. Veteran bullets therefore keep roughly their previous absolute speed (Dart 8.3 units/s), while Veteran keeps more shooters, shorter repeat intervals, more HP, two beam lanes and one fewer shield cell. Scripted pilots were also hit less by faster bullets, so speed alone was not making Veteran harder.

A solver pilot with perfect use of the visible warnings clears Training and Rolling Thunder on all three settings with all three main weapons, without hits, the special or pickups.

Difficulty is fixed, not adaptive to purchases, service rank, objective selection, deaths, or historical performance. All mains must defeat mandatory targets on every setting. The player should be able to choose difficulty independently of preferred equipment.

M1 establishes Standard feel. M3 adds Relaxed and Veteran with per-mission playtests; M6 applies the same gates to all later missions. Revisit HP, speed, and payouts from observed completion times, life losses, and satisfaction, not formulas alone.

## 3. Shared campaign progression; labeled mastery

Completing a mission on any setting unlocks the same next campaign mission. Equipment purchases and campaign credits are shared across campaign difficulties. Career counters accumulate eligible campaign activity from all three. Optional contract availability is based on mission compatibility, not artificial difficulty-exclusive unlocks.

Store clears, best successful time, and contract badges per mission and difficulty, plus highest difficulty cleared. Do not compare Relaxed and Veteran clear times as one unlabeled record. Career milestones are still once per campaign profile, not once per difficulty. First-clear reward is once per mission across all difficulties; switching settings cannot claim it again.

## 4. Credit calculation

The difficulty multiplier applies only to repeatable combat/mission income, not career awards, contract bonuses, or the first-clear bonus. Let C = collected credits, B = 60 if the required boss was destroyed on a successful mission (otherwise 0), M = difficulty multiplier.

- Success: floor(M × (C + 80 + B)) + first-clear reward if entitled + completed selected-contract reward + newly earned career rewards.
- Failure/abandon: floor(M × 0.5 × C) + newly earned cumulative career rewards. No mission-clear, boss-completion, first-clear, or contract payout.

First clear remains 150. Contract amounts and career rewards are specified in the objectives document. Round only at the stated stage, then bank once under the attempt transaction. Persist difficulty in the attempt before launch and in its result receipt. Reopening results or changing the menu selection cannot recalculate a historical payout.

These small multipliers recognize the challenge without making harder difficulty a required grind route. If time-to-clear makes one setting disproportionately profitable, tune from measured credits/minute. Campaign economy has no effect on endless fairness.

## 5. Statistics and verification

Campaign statistics support All / Relaxed / Standard / Veteran filters. Mode-level totals are the sum of disjoint difficulty-tagged attempt records; never count an attempt twice when changing filters. Show difficulty on every recent result. Records from older ruleset versions stay labeled.

Test difficulty initialization, five-versus-three life icons, unchanged shield/handling rules, safe warnings on Veteran, shared story unlocks, first-clear deduplication across settings, exact rounding, fixed contract semantics, and mode isolation. With the same endless seed/version/input, changing the selected campaign difficulty must produce no difference in endless state, loot, camera, or score.
