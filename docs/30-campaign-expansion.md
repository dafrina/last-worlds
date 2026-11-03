# Campaign progression — ship collection and weapon tiers

> **3 November 2026 update (user):** the shop takes credits and parts, each weapon's flown level is selected in the hangar,
> ships cost 4 parts instead of mission-clear pieces, the Seeker Rack (homing missiles) is the free starting special in both
> modes, and each world's run pays a set income. See [§ Shop, levels and income](#shop-levels-and-income-3-november-2026).

> **30 October 2026 update:** Chassis perks now apply in both modes. Scrapper: 40% wider pickup attraction; Ironclad: +1 starting life; Interceptor: double-tap steering barrel roll; Spectre: shielded near-miss reflection. This replaces the old kill-charge/overdrive bonuses and cosmetic-only endless chassis rule. See [global ship perks](34-global-ship-perks.md). Modular parts/paint remain cosmetic; endless equipment still resets.

28 October 2026. Approved user decisions supersede the earlier expansion proposal and old reactor/Flux/rank-three descriptions elsewhere. Runtime sources: `src/content/equipment.ts`, `weapon-tiers.ts`, `src/campaign/profile.ts`.

## Current increment

Four loadout slots: main weapon, special weapon, shield array, ship chassis. No handling upgrades, hidden hull health, fifth slot or new spendable currency. All chassis use the existing Scrapper GLB for now, explicitly requested by the user. Future distinct authored models replace that art without changing the central hit region or handling.

### Main weapons — four upgrades, five tiers

**3 November 2026 clarification:** Endless still loses one weapon tier and clears banked upgrade cells on a surviving hull loss; shield-only hits do neither. Tiers 4 and 5 each require two pickups. A partial pickup announces `POWER 1/2 · NEXT TIER 5`, for example, while the equipped weapon remains tier 4; only the completed upgrade announces `WEAPON TIER 5`. The pause loadout always shows the equipped tier. Tier changes invalidate the firing sequence while preserving its remaining cooldown, so recovery uses the new tier's pattern. Campaign damage behavior is unchanged.

> **31 October 2026 (user):** "lets introduce 2 new crazier levels for each weapon", then "i want faster shots instead of
> much more. maybe 2 more projectiles each weapon on max level but other than that quicker shots". Tiers 4 and 5 were added
> on that basis: tier 4 fires tier 3's volley about 1.35 times as often; tier 5 adds two projectiles to the volley and fires
> about 1.6–1.7 times as often as tier 3. Every family keeps its pattern (invariant 2).

Projectile damage remains fixed (Pulse 6, Fan 5, Seeker 12, Rail 32). More projectiles and a faster rate increase total damage. Each volley/sequence step still requires a valid target and emits from the current hero position. Pausing freezes sequence progress. No queued projectile is parked at an old muzzle; projectile pool pressure delays a whole step.

| Weapon | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
| --- | --- | --- | --- | --- | --- |
| Twin Pulse | Twin straight bolts every .125 s | Twins every 1/12 s | Four alternating straight bolts, one tick apart, then 1/12 s rest | The same burst, a new one every 6 ticks (8 at tier 3); bolts 10% faster | Two outer streams at ±0.55 join it: six bolts a burst, every 5 ticks; bolts 20% faster |
| Fan Cannon | Five fixed pellets every 1/3 s | Nine pellets over the same ±12° arc | Nine pellets every 2/9 s | Nine pellets every 1/6 s; pellets 10% faster | Eleven pellets over the same ±12°, 8 and 9 ticks apart in turn; pellets 20% faster |
| Seeker Array | One missile every .24 s, alternating left/right | Paired missiles every .32 s | Four alternating missiles .08 s apart, then .24 s rest | The four, 4 ticks apart, then 10 (22 ticks a burst, 30 at tier 3) | Six: the four plus a wider pair (±0.45, ±12°), 2 ticks apart, then 8 (18 ticks a burst) |
| Rail Driver | One slug every 0.5 s | Every 1/3 s | Twin slugs (±0.3) every 0.45 s | Twin slugs every 1/3 s | Four slugs side by side (±0.3, ±0.9) every 16 ticks (0.27 s) |

Intervals are quantized to the fixed 60 Hz simulation. The alternating Seeker baseline preserves roughly the old paired weapon's throughput; its new tiers increase volume. Main missiles retain their existing hunter-shield resistance penalty; every Rail slug still pierces and breaks hunter shields at 1.5×. Special weapons are unchanged.

Projectiles a second (damage a second if every one hits), measured in the simulation (`tests/sim/weapon-progression.test.ts` checks the ratios):

| Weapon | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
| --- | --- | --- | --- | --- | --- |
| Twin Pulse | 15 (90) | 24 (144) | 30 (180) | 40 (240) | 72 (432) |
| Fan Cannon | 15 (75) | 27 (135) | 38.6 (193) | 54 (270) | 77.6 (388) |
| Seeker Array | 4 (48) | 6 (72) | 8 (96) | 10.9 (131) | 20 (240) |
| Rail Driver | 2 (64) | 3 (96) | 4.4 (142) | 6 (192) | 15 (480) |

Tiers 4 and 5 also draw hotter: the bolts are a little larger and HDR-bright over dark ground (bloom on High), the Rail slug's streak and the muzzle flash grow (render only, `shotHeat` in src/render/fx-particles.ts). They stay slim and cyan-white, apart from the warm, round hostile shots.

Campaign purchases each weapon's four upgrades; since 3 November 2026 for 250, 500 + 3 parts, 750 + 5 and 1,000 + 10 (§ Shop,
levels and income), and the pilot selects which bought level flies. Until then they cost 150, 300, 500 and 800 credits. **Why 500 and 800 (31 October):** measured at tier 3 (Twin Pulse, perfect pilot collecting drops, seeds 1–12), a repeat clear banks 229 (Training) to 333 (Final Horizon) credits on Standard and 256–376 on Veteran, and a first campaign's six first clears bank about 2,200 (Standard) to 2,450 (Veteran). Tier 4 is about 1.5 repeat clears of a late mission and tier 5 about 2.5; a whole weapon (1,750) is about four fifths of a first campaign, so tier 5 is a late-campaign or replay goal for one weapon, not a default. No new currency; parts are not involved. Saves need no migration: ranks 0–2 load unchanged and ranks 3 and 4 are now valid (a rank above 4 is an unreadable save, never overwritten).

Endless uses the **identical** five firing tiers, earned through dedicated upgrade pickups (power cells, a power site, an endless ace's power drop) or another pickup of the equipped weapon. Changing weapon type resets to tier 1, even when returning to a previously used weapon. Tiers 4 and 5 each take **two** such pickups in endless (user, 31 October: "Two cells per tier"; `ENDLESS_TIER_CELLS`), the first banked and shown (`POWER 1/2 · NEXT TIER 4`). A capped upgrade (at tier 5) gives the existing 1,000 score bonus and says so, `MAX TIER · +1000` (user, 3 November); life loss still removes one tier and any banked cell, and shows `FIGHTER RESTORED · WEAPON TIER n`. Endless always starts with tier-1 Pulse and the same canonical equipment; campaign progression has no effect.

**Measured, 31 October** (perfect pilot; `tests/sim/weapon-tier-report.test.ts` reproduces every number):

- **Endless, sectors 1–8, pickups on, seeds 1–24:** every run reaches tier 4 (median at 157 s, earliest 50 s) and tier 5 (median 232 s, earliest 116 s, latest 477 s); 41% of the flight is at tier 5 (with three tiers, 71% was at tier 3). Hits 10 in all (13 with three tiers), no life lost. Median boss fights: Warden 24.6 s (24.6 before), Bastion-9 21.5 s (40.5), Helion Ark 43.8 s (91.8). Endless enemies and their ramp are unchanged (invariant 15): the run is easier from about sector 3 on. These figures are for one cell per tier. With two cells each for tiers 4 and 5 (31 October; same seeds): tier 4 at a median 224 s, tier 5 at 324 s (earliest 209 s), 30% of the flight at tier 5, 9 hits, no life lost; median fights Warden 24.6 s, Bastion-9 30.0 s, Helion Ark 45.0 s.
- **Final Horizon, pickups removed, seeds 1–12** — THE ECLIPSE's fight (s) and the mission's hits, tiers 3 / 4 / 5:

| Weapon | Standard fight | Veteran fight | Hits, Standard | Hits, Veteran |
| --- | --- | --- | --- | --- |
| Twin Pulse | 86 / 67 / 40 | 114 / 78 / 48 | 2 / 0 / 0 | 1 / 1 / 0 |
| Fan Cannon | 81 / 75 / 42 | 107 / 80 / 59 | 0 / 0 / 0 | 0 / 0 / 0 |
| Seeker Array | 92 / 68 / 37 | 100 / 81 / 38 | 0 / 0 / 0 | 1 / 0 / 0 |
| Rail Driver | 102 / 72 / 45 | 123 / 104 / 38 | 0 / 0 / 0 | 0 / 0 / 0 |

  The boss arrives at 189 s; it falls at about 275–312 s at tier 3, 256–293 s at tier 4 and 226–248 s at tier 5. Its first phase falls in steps of about 16 s (its targets' windows), so one tier can save a whole step or none: Rail at Veteran needs a fourth window at tier 4 (104 s against Pulse's 78) and saves one at tier 5 (38 against 48). At tier 5 the core and overload phases last only about 6–15 s and 4–8 s, so much of the boss's late attack set never plays. Friendly projectiles alive at once, at most: Pulse 23 / 27 / 44, Fan 27 / 36 / 44, Seeker 8 / 12 / 21, Rail 2 / 2 / 4; all projectiles at most 156, under the 520 pool (no cap raised).

### Shields

All ships in both modes can collect up to **five** charges. Each rare shield pickup adds **one**; no passive recharge, per-kill recharge or refill after life loss. Campaign equipment changes starting reserves: Standard 3 → Bulwark 4 → Aegis 5. Bulwark costs 250 credits; Aegis requires Bulwark and costs another 400. Endless starts with three and can fill to five through its existing budgeted supplies. Supply frequency remains unchanged.

### Collectible ships

Every chassis supports every main and special weapon. Identical normal movement and collision radius; each flies its own modular model (docs/31). Their named perks apply in both modes since 30 October ([docs/34](34-global-ship-perks.md)).

| Chassis | Perk | Price (since 3 November 2026) |
| --- | --- | --- |
| Scrapper (starter) | Salvage Rig: 40% wider pickup attraction | starter |
| Ironclad | Reserve Life: one extra starting life | 4 parts |
| Interceptor | Barrel Roll: a quick sidestep on a double-tap | 4 parts |
| Spectre | Gravitic Shield: shielded near-miss reflection | 4 parts |

**Since 3 November 2026** (user: "lets make it 4 since its 4 parts of a ship"): a ship costs 4 parts and no credits, one part per section (hull, wings, propulsion, cockpit), bought in Hangar → Ships and then equipped freely. This replaces the mission-clear pieces and the free assembly entirely. **Until then:** a clear on any difficulty granted a named frame, propulsion or core (Ironclad: Training, Rolling Thunder, Cold Vector; Interceptor: Rolling Thunder, Cold Vector, Deep Bloom; Spectre: Deep Bloom, Brood Strike, Final Horizon), and three pieces assembled the ship for free. Ships assembled then stay owned, and so does a ship whose three pieces were all collected (the version-4 migration below).

## Save migration

**Version 4 (3 November 2026).** The storage key stays. Before a version-3 save is replaced, its exact raw text is kept under `last-worlds.campaign.v3.backup` (versions 1 and 2 keep their own backup keys and migrate through the same steps); if the backup cannot be written, the original stays untouched and the migrated profile runs for the session only. Nothing a save owns is removed:

- Credits, parts, weapons, bought ranks, specials, shields, ships, designs, looks, mission records, attempt receipts, one-time award receipts and the mission system's state are kept as they were.
- Each weapon's selected level is its bought rank, so every weapon flies exactly as before.
- The Seeker Rack joins the owned specials (the new free starter). The Shockwave, the old starter, stays owned, and the equipped special stays as it was.
- A ship whose three mission pieces were all collected but never assembled becomes owned. Partly collected pieces are not converted into parts.
- Older prices are not refunded or charged: what was bought stays bought.
- A version-4 save with a selected level above its bought one, a missing selection or a malformed award list is unreadable and never overwritten. An older build reading a version-4 save treats it the same way.

**Version 2 (28 October).** The existing storage key is retained; schema is now version 2. Before replacing any version-1 profile, preserve its exact raw text under `last-worlds.campaign.v1.backup`. Invalid/unknown profiles are never overwritten. If backup or migration writing fails, use the migrated profile only in memory for that session.

- Credits, weapons, specials, mission records and attempt receipts survive.
- Weapon ranks 0/1/2 retain their purchased level. Old rank 3 (version 1's ×2 rate, not today's tier 4) becomes rank 2 with a 500-credit refund per affected weapon.
- Each retired Vector or Precision reactor purchase refunds 250 credits; the selected chassis becomes Scrapper.
- Flux refunds 250 credits. If equipped, select owned Bulwark or Standard. Standard/Bulwark purchases remain owned; Aegis is the new second upgrade.
- Version 2 prevents repeat migration/refunds on reload. Existing mission clears immediately count toward ship assembly, without fabricating credit awards.

## Shop, levels and income (3 November 2026)

User decisions of 3 November 2026. Runtime sources: `src/content/equipment.ts` (`WEAPON_PRICES`, `RANK_PRICES`, `RANK_PARTS`, `SPECIALS[].price` and `.parts`, `SHIPS[].price` and `.parts`, `REWARDS`, `CREDIT_SCALE`), `src/content/hero-parts.ts` (`HERO_DESIGN_PRICES`, `HERO_DESIGN_PARTS`), `src/campaign/profile.ts`.

### Prices

| Item | Credits | Parts |
| --- | --- | --- |
| Twin Pulse | starter | — |
| Fan Cannon, Seeker Array, Rail Driver | 250 each | 0 |
| Level 1 → 2 (any main weapon) | 250 | 0 |
| Level 2 → 3 | 500 | 3 |
| Level 3 → 4 | 750 | 5 |
| Level 4 → 5 | 1,000 | 10 |
| Seeker Rack (homing missiles) | starter | — |
| Siege Lance | 250 | 1 |
| Shockwave | 350 | 1 |
| Gravity Well | 350 | 1 |
| Bulwark Array, then Aegis Array | 250, then 400 (unchanged) | 0 |
| Ironclad, Interceptor, Spectre | 0 | 4 each |
| Each ship design B–E | 50 | 1 |
| Paint | free | — |

A whole weapon (levels 2–5) costs 2,500 credits and 18 parts. **Rules:** a purchase needs enough credits AND parts and takes both in the same saved transaction; nothing is bought twice; no balance goes below zero; upgrades consume their parts.

### Bought and selected levels

The save tracks, per weapon, the highest level bought (`ranks`) and the level selected to fly (`selected`, from 1 up to the bought one). In Hangar → Main, an owned weapon shows five numbered level buttons: bought levels can be tapped to fly, free, with no refund and no loss of the bought level; the selected one is lit and named (`LEVEL 2`), with `4 / 5 BOUGHT` beside it, the flown pattern below and the next upgrade's price in both currencies. Buying a level also selects it, as buying an item equips it. The campaign page's loadout shows the main weapon with its selected level (`Twin Pulse · LV 2`).

The selected level is the one level a campaign run flies (`campaignConfig` → `createRun` rank: pattern, rate and damage). Changing ship, reloading the save, taking damage or respawning never changes it: campaign runs ignore power cells and weapon drops, and a lost life costs a tier only in endless (`src/sim/game.ts`; `tests/sim/weapon-recovery.test.ts` and `weapon-progression.test.ts` check it). A pilot who owns level 5 can therefore fly Luna with a level-1 Twin Pulse.

### Income

Each world's run pays a set average, by a per-world credit scale (`CREDIT_SCALE`) on the payout: floor(S × M × (C + B + 80)) for a success and floor(S × M × 0.5 × C) for a failure or abandon, with C the collected credits (enemy drops, strike-site credits, full-shield cells), B the boss's 60, M the difficulty multiplier (×0.85 / ×1 / ×1.2) and S the world's scale. It replaced the single ×0.5 of 16 October. Enemy credit values, site loot and every combat value are unchanged; the HUD's live counter uses the same scale.

The **first clear** of each mission adds a flat 75 credits once (unchanged: it was 150 × 0.5): modest beside a run, and the mission system's rewards (separate) come on top.

Measured on 3 November 2026: Standard, the perfect pilot collecting pickups, tier-1 Twin Pulse and the default loadout, seeds 1–12 per mission, all 72 runs complete (`TIER_REPORT=<file> TIER_TARGET=mission:<id> TIER_RANK=0 TIER_SEEDS=1-12 npx vitest run tests/sim/weapon-tier-report.test.ts`). Average credits a repeat clear banks, with the seed range:

| World (mission) | Target | Before (×0.5) | Scale | After | Range after | First clear after |
| --- | --- | --- | --- | --- | --- | --- |
| Luna (Training) | 80 | 166 | 0.24 | 80 | 69–89 | 155 |
| Khepri (Rolling Thunder) | 100 | 179 | 0.28 | 100 | 76–127 | 175 |
| Vesper (Cold Vector) | 150 | 247 | 0.30 | 148 | 132–176 | 223 |
| Nacre (Deep Bloom) | 200 | 209 | 0.48 | 200 | 132–254 | 275 |
| Amnion (Brood Strike) | 250–270 | 214 | 0.60 | 256 | 176–314 | 331 |
| Umbra (Final Horizon) | 250–270 | 236 | 0.55 | 259 | 206–334 | 334 |
| All six | 1,030–1,070 | 1,251 | | 1,043 | | 1,493 |

The runs collected on average 253 / 279 / 415 / 338 / 348 / 392 credits in flight (boss reward included). The spread between seeds comes from the encounter deck's strike sites and route: Deep Bloom and Amnion vary most. A first campaign (six first clears) pays about 1,490 credits; a weapon's four upgrades about 2.4 loops of repeat clears plus 18 parts.

**Not measured:** Relaxed and Veteran (they scale by ×0.85 and ×1.2), real pilots who miss drops, higher levels (which kill faster and collect slightly more), and parts per run (docs/33 § 3.1: about 0.5–1 on Standard).

## Follow-up work

Distinct ship models and hangar model previews; additional chassis once the first perks are playtested; observational campaign career/side missions with alternate part sources; more authored sorties. These are not included in this increment. Terrain, enemy attacks and score music remain unchanged.

Validation evidence and any limitations are recorded in `build-status.md`. Browser phone dimensions do not replace actual hardware playtesting or establish perk/economy balance.
