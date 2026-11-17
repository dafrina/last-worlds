# Campaign progression

How the campaign builds a pilot's hangar: the four loadout slots, the shop in credits and parts, weapon levels, collectible
ships, mission income, unlocks and the save. Endless keeps its own standardized start (§ Endless).

Runtime sources: `src/content/equipment.ts` (slots, prices, `REWARDS`, `CREDIT_SCALE`, `CAMPAIGN_ORDER`),
`src/content/weapon-tiers.ts` (the five tiers), `src/content/hero-parts.ts` (ship designs and paint),
`src/campaign/profile.ts` (the save, purchases, payouts), `src/ui/hangar.ts` and `src/ui/game-ui.ts` (the pages). The
combat rules behind the gear are in [combat and progression](02-combat-and-progression.md); specials and chassis perks in
[docs/42](42-specials-and-perks.md); the Rail Driver in [docs/32](32-rail-driver.md).

## Four slots

Main weapon, special weapon, shield array and ship chassis (AGENTS.md invariant 6; user, 28 October). There is no
handling upgrade, hidden hull health or fifth slot. Every chassis carries every weapon and special; all owned combinations
are legal, and changing owned gear is free.

| Slot | Items (`src/content/equipment.ts`) | Starter |
| --- | --- | --- |
| Main weapon | `WEAPON_IDS`: Twin Pulse, Fan Cannon, Seeker Array, Rail Driver, each with five levels | Twin Pulse |
| Special | `SPECIALS`: Seeker Rack, Siege Lance, Shockwave, Orbital Strike | Seeker Rack (campaign) |
| Shield array | `SHIELD_TECH`: Standard (3 charges), Bulwark (4), Aegis (5) | Standard |
| Ship | `SHIPS`: Scrapper, Ironclad, Interceptor, Spectre, each with a named perk | Scrapper |

`STARTER` is a fresh profile's loadout. The Seeker Rack is the campaign's free starting special (user, 3 November);
endless keeps the Shockwave (`ENDLESS_LOADOUT`).

## Main weapons: five levels

Each family keeps its pattern at every level (invariant 2): straight bolts, one fixed fan, alternating homing missiles,
parallel piercing slugs. A level adds projectiles and rate, never damage per projectile (`WEAPONS[…].damage` in
`src/content/balance.ts`: Pulse 6, Fan 5, Seeker 12, Rail 32). Levels 4 and 5 were added at the user's request on
31 October ("faster shots instead of much more. maybe 2 more projectiles each weapon on max level"): level 4 fires level 3's
volley about 1.35 times as often, level 5 adds two projectiles and fires about 1.6–1.7 times as often as level 3.

| Weapon | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
| --- | --- | --- | --- | --- | --- |
| Twin Pulse | Twin straight bolts every 0.125 s | Twins every 1/12 s | Four alternating bolts one tick apart, then a 1/12 s rest | The same burst every 6 ticks; bolts 10% faster | Two outer streams at ±0.55 join: six bolts every 5 ticks; bolts 20% faster |
| Fan Cannon | Five pellets over ±12° every 1/3 s | Nine pellets over the same arc | Nine every 2/9 s | Nine every 10 ticks; 10% faster | Eleven over ±12°, 8 and 9 ticks apart in turn; 20% faster |
| Seeker Array | One missile every 0.24 s, alternating sides | Paired missiles every 0.32 s | Four alternating missiles 0.08 s apart, then 0.24 s | The four 4 ticks apart, then 10 | Six (a wider pair at ±0.45, ±12°) 2 ticks apart, then 8 |
| Rail Driver | One slug every 0.5 s | Every 1/3 s | Twin slugs (±0.3) every 0.45 s | Twin slugs every 20 ticks | Four slugs (±0.3, ±0.9) every 16 ticks |

The patterns are `patterns` in `src/content/weapon-tiers.ts`; waits are whole 60 Hz ticks. The hangar's level names are
`WEAPON_TIERS`. Every step still needs a valid target and emits at the live hero muzzle; pausing freezes the sequence; a
full projectile pool (`BALANCE.maxProjectiles`) delays a whole step rather than parking shots. Tier changes drop the
cached sequence and keep its remaining cooldown.

Projectiles a second (damage a second if all hit), derived from the patterns; `tests/sim/weapon-progression.test.ts`
checks the ratios:

| Weapon | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
| --- | --- | --- | --- | --- | --- |
| Twin Pulse | 15 (90) | 24 (144) | 30 (180) | 40 (240) | 72 (432) |
| Fan Cannon | 15 (75) | 27 (135) | 38.6 (193) | 54 (270) | 77.6 (388) |
| Seeker Array | 4 (48) | 6 (72) | 8 (96) | 10.9 (131) | 20 (240) |
| Rail Driver | 2 (64) | 3 (96) | 4.4 (142) | 6 (192) | 15 (480) |

Levels 4 and 5 also draw hotter (larger, HDR-bright bolts; a longer Rail streak and muzzle flash): render only, `shotHeat`
in `src/render/fx-particles.ts`.

### Bought and selected levels

The save keeps, per weapon, the highest level bought (`ranks`) and the level selected to fly (`selected`, from level 1 up to
the bought one). In Hangar → Main an owned weapon shows five numbered level buttons: any bought level can be selected,
free, without losing the bought one; buying a level also selects it. The campaign page shows the flown level
(`Twin Pulse · LV 2`).

A campaign run flies exactly the selected level (`campaignConfig` → `createRun`). Ship changes, reloads, hits and respawns
never change it: campaign runs ignore power cells and weapon drops, and a lost life costs a tier only in endless
(`tests/sim/weapon-recovery.test.ts`, `weapon-progression.test.ts`).

## Shields

Every ship in both modes can hold up to `MAX_SHIELDS` (5) charges. A rare shield pickup adds one; there is no passive,
per-kill or respawn refill (invariant 11). The shield array sets the starting reserve: Standard 3, Bulwark 4, Aegis 5.
Aegis can be bought only after Bulwark. Endless starts with Standard and fills through its budgeted supplies.

## Ships

Four chassis share handling and the central hit region; each flies its own modular model ([docs/31](31-hero-ships.md)) and
has a named perk that applies in campaign and endless (user, 30 October; [docs/42](42-specials-and-perks.md#chassis-perks)):

| Chassis | Perk | Price |
| --- | --- | --- |
| Scrapper | Salvage Rig: 40% wider pickup attraction | starter |
| Ironclad | Reserve Life: one extra starting life | 4 parts |
| Interceptor | Shred: steady hits spin the guns up to +30% fire rate | 4 parts |
| Spectre | Gravity Slingshot: near-miss shots are flung back at their shooter | 4 parts |

A ship costs 4 parts, one per section (user, 3 November: "lets make it 4 since its 4 parts of a ship"), bought in Hangar →
Ships and then equipped freely. Its part designs B–E and its paint are cosmetic (docs/31).

## The shop

A purchase needs enough credits **and** parts and takes both in one saved transaction. Nothing is bought twice, no balance
goes below zero, and upgrades consume their parts. Prices (user, 3 November; specials 14 November):

| Item | Credits | Parts | Source |
| --- | --- | --- | --- |
| Fan Cannon, Seeker Array, Rail Driver | 250 each | 0 | `WEAPON_PRICES` |
| Weapon level 1 → 2, 2 → 3, 3 → 4, 4 → 5 | 250, 500, 750, 1,000 | 0, 3, 5, 10 | `RANK_PRICES`, `RANK_PARTS` |
| Siege Lance, Shockwave, Orbital Strike | 250, 450, 600 | 1, 1, 2 | `SPECIALS[…].price`, `.parts` |
| Bulwark Array, then Aegis Array | 250, then 400 | 0 | `SHIELD_TECH[…].price` |
| Ironclad, Interceptor, Spectre | 0 | 4 each | `SHIPS[…].price`, `.parts` |
| A ship part design B–E | 50 | 1 | `HERO_DESIGN_PRICES`, `HERO_DESIGN_PARTS` |
| Paint | free | | |

A whole weapon (levels 2–5) costs 2,500 credits and 18 parts.

## Currencies and income

**Credits** are the main currency. **Parts** are the rare second one: they come only from strike sites in the campaign
([docs/33](33-strike-sites-and-encounter-deck.md) § 3), one pickup per part, counted in `RunState.parts`; endless never
drops one. No other currency exists (invariant 7).

A run's payout (`REWARDS`, `CREDIT_SCALE`, `CREDIT_MULTIPLIER`; `payout` in `src/campaign/profile.ts`), with C the
collected credits (enemy drops, strike-site loot, full-shield cells), B the boss reward if the boss fell, M the difficulty
multiplier and S the mission's credit scale:

- success: floor(S × M × (C + B + `REWARDS.success`)), plus `REWARDS.firstClear` once per mission across difficulties;
- failure or abandon (leaving mid-flight through Return to Menu or a new launch): floor(S × M × `REWARDS.failureShare` × C);
- a refresh or crash mid-flight banks nothing.

Parts are banked in full with any outcome. The per-world scale sets what a repeat run pays; the user set its targets on
3 November (about 80 / 100 / 150 / 200 / 250–270 credits a Standard repeat on Luna / Khepri / Vesper / Nacre / the late
worlds), lowered all scales to 80% on 7 November, and made the last worlds pay in campaign order on 10 November. The HUD's
live counter uses the same scale. Side-mission rewards ([docs/35](35-missions.md)) are paid separately, at most once each
(`awardOnce`).

To measure what a world pays: `TIER_REPORT=<file> TIER_TARGET=mission:<id> TIER_RANK=0 TIER_SEEDS=1-12 npx vitest run
tests/sim/weapon-tier-report.test.ts` (perfect pilot collecting drops). Not measured: real pilots who miss drops.

## Missions and unlocks

`CAMPAIGN_ORDER` lists the eight missions: Training, Rolling Thunder, Cold Vector, Deep Bloom, Brood Strike, Dying Star,
Silent Empire, Final Horizon. Clearing one on any difficulty opens the next. A locked mission shows a dimmed globe and a
disabled launch; a cleared one shows its best time and the hardest difficulty cleared. The campaign page opens on the
furthest unlocked mission, or on one just unlocked. Difficulty is chosen per attempt ([docs/11](11-campaign-difficulty.md)).

## Endless

Endless never reads campaign purchases and never writes the profile. `endlessConfig` takes only the equipped ship, its
perk and its look; every run starts with `ENDLESS_LOADOUT` (Twin Pulse level 1, Shockwave, Standard Array).

It uses the same five tiers, earned in flight through power cells, a power site, an endless ace's drop, or a pickup of
another weapon (`givePower` and `offeredWeapon` in `src/sim/game.ts`):

- `ENDLESS_TIER_CELLS`: levels 2 and 3 take one cell each, levels 4 and 5 two each (user, 31 October: "Two cells per
  tier"); a banked cell shows `POWER 1/2 · NEXT TIER 4`.
- A weapon drop never offers the flown weapon (it becomes the next in `WEAPON_IDS`); switching family keeps the tier and
  any banked cell.
- At level 5 a cell scores `MAX_TIER_BONUS` (`MAX TIER · +1000`).
- A lost life drops one tier and clears banked cells (`FIGHTER RESTORED · WEAPON TIER n`); a shield hit does neither.

## The save

One local profile (`CAMPAIGN_KEY`, `last-worlds.campaign.v1`, in localStorage; schema `PROFILE_VERSION` 6). It holds the
credit and parts balances, owned items per slot, bought and selected levels, the loadout, per-mission clears and best
times per difficulty, the first-clear receipts, the last 200 attempt receipts (`receipts[].parts` included), bought ship
designs and looks, one-time award receipts (`awards`), the mission board's own state (`missionBoard`, carried unchanged
through every load and migration) and `opened` (missions a migration kept open).

- **Writes:** every change re-reads storage, applies itself and writes the whole profile.
- **Banking** is idempotent by attempt ID: reopening results, retrying or settling twice never pays twice.
- **Unreadable saves** (malformed, or a newer unknown version) are never overwritten; the profile then runs in memory for
  the session and says so.
- **Migration:** an older version is migrated on load. The exact original text is first kept under its version's backup
  key; if that write fails, the original stays untouched and the migrated profile runs for the session only.

| Version | Since | What changed | Backup key |
| --- | --- | --- | --- |
| 2 | 28 October | Ship slot replaces reactors (refunded), Aegis replaces Flux (refunded), shared tiers | `last-worlds.campaign.v1.backup` |
| 3 | 29 October | Parts balance | `last-worlds.campaign.v2.backup` |
| 4 | 3 November | Shop in both currencies, selected levels, the Seeker Rack starter; ships whose three old mission pieces were all collected become owned | `last-worlds.campaign.v3.backup` |
| 5 | 12 November | Silent Empire inserted before Final Horizon; `opened` keeps a mission open that the new order would close | `last-worlds.campaign.v4.backup` |
| 6 | 14 November | The Gravity Well becomes the Orbital Strike, owned and equipped (nothing refunded) | `last-worlds.campaign.v5.backup` |

A weapon added after a save was written (the Rail Driver) loads at level 1 (`LATER_WEAPONS`).

The flight log ([docs/09](09-objectives-and-statistics.md)) stays separate and observational; it is not the wallet.

## Validation

- `tests/campaign/profile.test.ts`: payouts, first clears, idempotent banking, failure and abandon shares, unlocks,
  purchases in both currencies, levels, every migration, unreadable saves left untouched.
- `tests/sim/loadout.test.ts`: endless isolation, shield reserves and cells, per-special recharge, campaign gear in flight.
- `tests/sim/weapon-progression.test.ts`, `weapon-recovery.test.ts`: the tiers, endless cells and life loss.
- `tests/browser/menu.spec.ts`: a fresh profile, purchases and levels the launch then flies.

## Open

Distinct ship handling or more chassis would need a design decision; perks have not been playtested against each other on
the late missions ([docs/42](42-specials-and-perks.md)). No import/export of the save.
