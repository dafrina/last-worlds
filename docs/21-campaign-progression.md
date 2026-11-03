# Campaign progression

**3 November 2026 update (user):** the shop now prices in credits and parts, each weapon's flown level is selected in the hangar, ships cost 4 parts, the Seeker Rack is the free starting special in the campaign (endless keeps the Shockwave; user, 3 November: "Keep Shockwave") and each world's run pays a set income; save version 4. Current prices, levels, income and migration: [campaign expansion § Shop, levels and income](30-campaign-expansion.md#shop-levels-and-income-3-november-2026). § 3, § 4 and § 7 below note what changed.

**28 October update:** [Ship collection and shared weapon tiers](30-campaign-expansion.md) supersedes the reactor loadout, Flux shield and three-rank weapon system below. Four slots are main, special, shield and ship; the six-mission campaign has three-tier weapons (five tiers since 31 October), collectible chassis and universal five-charge shield capacity. The rest of this document records the original implementation.

16 October 2026 · user request: "build progression etc into campaign". This implements the design in [combat and progression](02-combat-and-progression.md) §3–5 and [campaign difficulty](11-campaign-difficulty.md) §3–4, and the Campaign hub planned in [flight command UI](16-flight-command-ui.md). Numbers remain starting values to tune from play.

## 1. What a pilot sees

- **Missions unlock in order:** Training → Rolling Thunder → Cold Vector → Deep Bloom. Clearing a mission on any difficulty opens the next one.
  - A locked mission shows a dimmed globe, "LOCKED · CLEAR … TO UNLOCK" and a disabled launch.
  - A cleared mission shows its best time and the hardest difficulty it was cleared on.
  - The campaign page opens on the furthest unlocked mission, or on a mission just unlocked.
- **Credits** are the main campaign currency, shown at the top of the Campaign and Hangar pages; **parts** (since 29 October, § 7) are the rare second one, beside them.
- **Loadout:** the Campaign page summarises the four equipped slots. Tapping it opens the **Hangar**, which since 31 October also opens from the front screen ([flight command UI](16-flight-command-ui.md)).
- **Hangar:** a slot selector (Main, Special, Shield, Ships since 28 October) and one card per item.
  - An equipped item glows. An owned item offers EQUIP (free). An item not yet owned shows its price (in credits and parts since 3 November, `BUY · 350 CR + 1 P`); the button is disabled until both balances cover it. Buying an item also equips it.
  - Owned main weapons show rank pips and the next rank upgrade; since 3 November, five numbered level buttons: any bought level can be selected to fly, free (docs/30).
- **Results** (campaign): the payout breakdown, the credits earned, the new balance and any mission just unlocked.
- **Pause** shows the real special, shield and reactor. The special button's glyph matches the equipped special.

## 2. Equipment (runtime source: `src/content/equipment.ts`)

| Slot | Item | Price | Effect |
| --- | --- | --- | --- |
| Main | Twin Pulse | starter | unchanged |
| Main | Fan Cannon | 250 | unchanged |
| Main | Seeker Array | 450 | unchanged |
| Main rank | ranks 1 / 2 / 3, per weapon | 150 / 300 / 500 | rate of fire ×1.33 / ×1.67 / ×2 (double at rank 3), campaign only; until the user's 16 October revision, +8% damage per rank |
| Special | Shockwave | starter | 45 s recharge; a ring expands from the ship at 26 units/s: up to 180 damage per target (full within 3 units, fading to 20% at its 20-unit reach), clears hostile shots within 8 units; 1 s invulnerability |
| Special | Seeker Rack | 300 | 35 s recharge; eight Blender-modelled missiles leave the rack fanned to both sides at 5 units/s, accelerate (34 u/s²) to 21 and turn hard (4.5 rad/s) onto the nearest visible targets ahead (armed first), retargeting if theirs falls; 40 damage each; smoke trails; no clear, no invulnerability |
| Special | Siege Lance | 400 | 40 s recharge; a 0.9-wide piercing beam straight ahead from the ship for 2.4 s at 360 damage/s (was 0.8 s at 450/s); the ship steers it |
| Shield | Standard Array | starter | 3 charges, a cell restores 1 |
| Shield | Bulwark Array | 250 | 4 charges, a cell restores 1 |
| Shield | Flux Array | 250 | 2 charges, a cell restores both |
| Reactor | Balanced Drive | starter | speed 12, acceleration 90, braking 125 |
| Reactor | Vector Drive | 250 | 14 / 75 / 105 |
| Reactor | Precision Drive | 250 | 11 / 115 / 170 |

Every special still charges 3% per main-weapon kill. Seeker Rack and Siege Lance kills never charge it. No shield technology regenerates passively. All standard patterns remain survivable on the slowest drive: campaign attack admission (the fairness director) assumes Precision Drive's top speed whatever is equipped, and the perfect pilot clears all four missions on Precision Drive with zero hits (`tests/sim/loadout.test.ts`).

**Endless isolation:** `createRun` gives every endless run the canonical starter (Twin Pulse rank 0, Shockwave, Standard Array, Balanced Drive), whatever the config says. Endless never writes the campaign profile; since 29 October it reads only the equipped ship's chassis and look, shown as cosmetics (§ 7, docs/31).

## 3. Economy

With C = credits collected in the attempt, B = 60 if the boss fell, M = ×0.85 / ×1 / ×1.2 (Relaxed / Standard / Veteran), and every payout halved (user, 16 October: "the payout is way too much"):

- success: floor(0.5 × M × (C + B + 80)), plus 75 on a mission's first clear (once per mission, across difficulties);
- failure or abandon (leaving mid-flight via Return to Menu or a new launch): floor(0.5 × M × 0.5 × C);
- a refresh or crash mid-flight banks nothing.

**Since 3 November 2026** the single ×0.5 is a per-world scale (`CREDIT_SCALE`: Luna 0.24, Khepri 0.28, Vesper 0.30, Nacre 0.48, Amnion 0.60, Umbra 0.55) so that a repeat Standard clear pays on average about 80 / 100 / 150 / 200 / 260 / 260 credits, and the first-clear bonus is a flat 75 (docs/30 § Income, with the measurement). The paragraph below records the 16 October figures.

Credit pickups (4 / 8 / 16 / 10 by enemy class, 6 per fuel skid), salvage caches and full-shield cells (+5) count toward C. Before halving, the perfect pilot banked about 380–420 per first clear and 230–270 per repeat on Standard; after halving and the longer sorties, measured (perfect pilot collecting drops, Standard, seed 5): first clear 213 / 208 / 229 / 238 and repeat 138 / 133 / 154 / 163 credits for Training / Rolling Thunder / Cold Vector / Deep Bloom (missions now last about 3:00 / 3:25 / 4:50 / 5:15). A rank-3 weapon or a second special now takes several clears.

## 4. Save (`src/campaign/profile.ts`)

- **Since 3 November 2026: schema version 4** (bought and selected weapon levels, the Seeker Rack starter, ships bought with parts; migration and backup `last-worlds.campaign.v3.backup` in docs/30 § Save migration). Versions 3, 2 and 1 migrate on load, each backed up first under its own key.
- **Key:** `last-worlds.campaign.v1` in localStorage, schema version 1. It holds credits, owned items per slot, ranks per weapon, the loadout, per-mission clears and best times per difficulty, the first-clear receipt, and the last 200 attempt receipts.
- **Writes:** every change re-reads the stored profile, applies itself and writes the whole profile back.
- **Banking** an attempt is idempotent by its attempt ID. Reopening results, retrying from results, or settling twice never pays twice.
- **Unreadable saves:** an unreadable or unknown save is never overwritten. The profile then runs in memory for the session.
- **Separation:** the flight log (statistics) stays separate and observational. It is not the wallet.

## 5. Validation (16 October 2026)

- **Unit tests:** `tests/campaign/profile.test.ts` covers:
  - payout formula, first clear and idempotent banking;
  - failure and abandon shares;
  - unlocks, purchases, ranks and equip rules;
  - persistence, and unreadable saves left untouched.
- **Simulation tests:** `tests/sim/loadout.test.ts` covers:
  - endless isolation;
  - shield reserve and cell refill;
  - reactor speeds;
  - rank damage;
  - per-special recharge;
  - Seeker Rack and Siege Lance behaviour;
  - the Precision Drive survivability check.
- **Browser:** the specs cover a fresh profile (Training only, Rolling Thunder locked), a Hangar purchase, equip and upgrade that the launch then flies, and seeded veteran profiles for the existing flows.
- **Screens inspected:** campaign page, hangar, results payout and unlock, and Siege Lance and Seeker Rack in flight.

## 7. Parts, the second currency (29 October 2026, docs/33)

- **Parts** come only from strike sites in the campaign (docs/33 § 3.1), one pickup per part. A run counts them in
  `RunState.parts`; endless never drops one.
- **Banking:** the attempt's parts are banked in full with any outcome (complete, failed or abandoned), in the same
  idempotent transaction as its credits: the attempt receipt records them (`receipts[].parts`), so settling again or
  reopening results never pays twice. The results screen shows `+N PARTS · M IN THE HANGAR`.
- **Prices:** ship designs B–E cost parts plus credits (`HERO_DESIGN_PARTS` and `HERO_DESIGN_PRICES`,
  src/content/hero-parts.ts): B 1 + 80, C 1 + 160, D 2 + 240, E 3 + 320 until 3 November 2026, since then 1 part + 50
  credits each. Buying needs both. Designs already owned stay owned. Since 3 November parts also buy ships (4 each),
  weapon levels 3–5 (3, 5 and 10) and the Siege Lance, Shockwave and Gravity Well (1 each): docs/30 § Shop.
- **Hangar:** the campaign and hangar pages show the parts balance beside the credits; a design button shows both costs
  (`B 50·1P` since 3 November; `B 1P 80` before).
- **Mission-system rewards** (3 November): `awardOnce(profile, id, credits, parts)` pays a one-time reward in both
  currencies at most once per receipt id (`awards`, unbounded, apart from the attempt receipts); the mission system keeps
  its own state in `missionBoard`, carried through every load and migration unchanged.
- **Save, schema version 3:** the profile gains `parts` (a whole number ≥ 0). A version-2 save is migrated on load with
  no parts; the exact original is first kept under `last-worlds.campaign.v2.backup` (version 1 keeps its own
  `last-worlds.campaign.v1.backup`), and if that backup cannot be written the original is left untouched and the profile
  runs for the session. A save with a broken parts balance, or a newer unknown version, is unreadable and never
  overwritten. An older build reading a version-3 save treats it the same way: it never overwrites it.
- **Endless** reads only the equipped ship's chassis and look from the profile, as cosmetics (`endlessConfig`; docs/31);
  it never writes the profile.
- **Measured** parts per mission: docs/33 § 3.1 (about 0.5–1 on Standard).

## 6. Not yet built

Contracts and career milestones (docs/09) and their rewards; Rail Lance; per-difficulty record filters in Statistics; an import/export of the save.
