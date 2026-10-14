# Campaign difficulty levels

Design v0.2. Selectable campaign difficulty is a confirmed user requirement. The names, numbers, reward multipliers, and unlock policy below are proposed tuning defaults. Endless retains one standardized gameplay ruleset and does not inherit the campaign setting.

## 1. Three choices before launch

| Setting | Purpose | Starting lives | Enemy HP | Hostile shot speed | Warning time | Repeatable credit multiplier |
| --- | --- | --- | --- | --- | --- | --- |
| Relaxed | Learn routes, enjoy the campaign, try builds | 5 | ×0.85 | ×0.85 | Base +0.25 s | ×0.85 |
| Standard | Intended baseline experience | 3 | ×1.00 | ×1.00 | Authored baseline | ×1.00 |
| Veteran | Master timing and positioning | 3 | ×1.20 | ×1.15 | Same minimum as Standard | ×1.20 |

All difficulties are available for an unlocked mission from the start. Select in mission preparation; persist the preferred campaign difficulty separately from endless. Lock it for an attempt. Changing it in the menu applies to the next launch and never mutates a paused run.

Shield technology, discrete hit costs, main/special rules, camera behavior, and reactor handling are unchanged by difficulty. There is no hidden aim assistance, extra currency, gear restriction, permanent penalty, or altered side-mission logic. Extra Relaxed lives simply use more of the same small ship icons.

## 2. Challenge and fairness

Use the same mission structure and route identities initially. Difficulty scales the specified values only; any later harder formation must be a separately authored and validated variant. Do not arbitrarily stack waves or add untelegraphed attacks. Veteran keeps readable warnings and reachable paths with every campaign reactor, including Precision's lower top speed.

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
