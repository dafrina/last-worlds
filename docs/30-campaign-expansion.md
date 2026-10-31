# Campaign progression — ship collection and weapon tiers

> **30 October 2026 update:** Chassis perks now apply in both modes. Scrapper: 40% wider pickup attraction; Ironclad: +1 starting life; Interceptor: double-tap steering barrel roll; Spectre: shielded near-miss reflection. This replaces the old kill-charge/overdrive bonuses and cosmetic-only endless chassis rule. See [global ship perks](34-global-ship-perks.md). Modular parts/paint remain cosmetic; endless equipment still resets.

28 October 2026. Approved user decisions supersede the earlier expansion proposal and old reactor/Flux/rank-three descriptions elsewhere. Runtime sources: `src/content/equipment.ts`, `weapon-tiers.ts`, `src/campaign/profile.ts`.

## Current increment

Four loadout slots: main weapon, special weapon, shield array, ship chassis. No handling upgrades, hidden hull health, fifth slot or new spendable currency. All chassis use the existing Scrapper GLB for now, explicitly requested by the user. Future distinct authored models replace that art without changing the central hit region or handling.

### Main weapons — four upgrades, five tiers

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

Campaign purchases each weapon's four upgrades for 150, 300, 500 and 800 credits. **Why 500 and 800:** measured at tier 3 (Twin Pulse, perfect pilot collecting drops, seeds 1–12), a repeat clear banks 229 (Training) to 333 (Final Horizon) credits on Standard and 256–376 on Veteran, and a first campaign's six first clears bank about 2,200 (Standard) to 2,450 (Veteran). Tier 4 is about 1.5 repeat clears of a late mission and tier 5 about 2.5; a whole weapon (1,750) is about four fifths of a first campaign, so tier 5 is a late-campaign or replay goal for one weapon, not a default. No new currency; parts are not involved. Saves need no migration: ranks 0–2 load unchanged and ranks 3 and 4 are now valid (a rank above 4 is an unreadable save, never overwritten).

Endless uses the **identical** five firing tiers, earned through dedicated upgrade pickups (power cells, a power site, an endless ace's power drop) or another pickup of the equipped weapon. Changing weapon type resets to tier 1, even when returning to a previously used weapon. A capped upgrade (at tier 5) gives the existing 1,000 score bonus; life loss still removes one tier. Endless always starts with tier-1 Pulse and the same canonical equipment; campaign progression has no effect.

**Measured, 31 October** (perfect pilot; `tests/sim/weapon-tier-report.test.ts` reproduces every number):

- **Endless, sectors 1–8, pickups on, seeds 1–24:** every run reaches tier 4 (median at 157 s, earliest 50 s) and tier 5 (median 232 s, earliest 116 s, latest 477 s); 41% of the flight is at tier 5 (with three tiers, 71% was at tier 3). Hits 10 in all (13 with three tiers), no life lost. Median boss fights: Warden 24.6 s (24.6 before), Bastion-9 21.5 s (40.5), Helion Ark 43.8 s (91.8). Endless enemies and their ramp are unchanged (invariant 15): the run is easier from about sector 3 on.
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

Every chassis supports every main and special weapon. Their one named perk applies only to campaign. Identical normal movement and collision radius; all use the same visual model until the art phase.

| Chassis | Perk | Frame | Propulsion | Core |
| --- | --- | --- | --- | --- |
| Scrapper (starter) | 40% wider pickup attraction | Starter | Starter | Starter |
| Ironclad | One extra starting life over the selected difficulty baseline | Training | Rolling Thunder | Cold Vector |
| Interceptor | 50% more special charge from main-weapon kills (same three-kills/second cap; no special-kill charge) | Rolling Thunder | Cold Vector | Deep Bloom |
| Spectre | Activating a special boosts main firing cadence 25% for three active seconds | Deep Bloom | Brood Strike | Final Horizon |

A clear on any difficulty grants its named parts once. Parts derive from persisted mission-clear records, so existing clears count and no duplicate fragments accumulate. Failed/abandoned attempts give no parts. After all three pieces are present, assemble for free in Hangar → Ships, then equip freely. Parts and their source missions are visible there; results name newly recovered parts. First-release collection is deliberately deterministic, not randomized drops or repeated farming. Optional contract routes can be added later without changing combat.

## Save migration

The existing storage key is retained; schema is now version 2. Before replacing any version-1 profile, preserve its exact raw text under `last-worlds.campaign.v1.backup`. Invalid/unknown profiles are never overwritten. If backup or migration writing fails, use the migrated profile only in memory for that session.

- Credits, weapons, specials, mission records and attempt receipts survive.
- Weapon ranks 0/1/2 retain their purchased level. Old rank 3 (version 1's ×2 rate, not today's tier 4) becomes rank 2 with a 500-credit refund per affected weapon.
- Each retired Vector or Precision reactor purchase refunds 250 credits; the selected chassis becomes Scrapper.
- Flux refunds 250 credits. If equipped, select owned Bulwark or Standard. Standard/Bulwark purchases remain owned; Aegis is the new second upgrade.
- Version 2 prevents repeat migration/refunds on reload. Existing mission clears immediately count toward ship assembly, without fabricating credit awards.

## Follow-up work

Distinct ship models and hangar model previews; additional chassis once the first perks are playtested; observational campaign career/side missions with alternate part sources; more authored sorties. These are not included in this increment. Terrain, enemy attacks and score music remain unchanged.

Validation evidence and any limitations are recorded in `build-status.md`. Browser phone dimensions do not replace actual hardware playtesting or establish perk/economy balance.
