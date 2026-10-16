# Campaign progression

16 October 2026 · user request: "build progression etc into campaign". This implements the design in [combat and progression](02-combat-and-progression.md) §3–5 and [campaign difficulty](11-campaign-difficulty.md) §3–4, and the Campaign hub planned in [flight command UI](16-flight-command-ui.md). Numbers remain starting values to tune from play.

## 1. What a pilot sees

- **Missions unlock in order:** Training → Rolling Thunder → Cold Vector → Deep Bloom. Clearing a mission on any difficulty opens the next one.
  - A locked mission shows a dimmed globe, "LOCKED · CLEAR … TO UNLOCK" and a disabled launch.
  - A cleared mission shows its best time and the hardest difficulty it was cleared on.
  - The campaign page opens on the furthest unlocked mission, or on a mission just unlocked.
- **Credits** are the one campaign currency, shown at the top of the Campaign and Hangar pages.
- **Loadout:** the Campaign page summarises the four equipped slots. Tapping it opens the **Hangar**.
- **Hangar:** a slot selector (Main, Special, Shield, Reactor) and one card per item.
  - An equipped item glows. An owned item offers EQUIP (free). An item not yet owned shows its price; the button is disabled while unaffordable. Buying an item also equips it.
  - Owned main weapons show rank pips and the next rank upgrade.
- **Results** (campaign): the payout breakdown, the credits earned, the new balance and any mission just unlocked.
- **Pause** shows the real special, shield and reactor. The special button's glyph matches the equipped special.

## 2. Equipment (runtime source: `src/content/equipment.ts`)

| Slot | Item | Price | Effect |
| --- | --- | --- | --- |
| Main | Twin Pulse | starter | unchanged |
| Main | Fan Cannon | 250 | unchanged |
| Main | Seeker Array | 450 | unchanged |
| Main rank | ranks 1 / 2 / 3, per weapon | 150 / 300 / 500 | rate of fire ×1.33 / ×1.67 / ×2 (double at rank 3), campaign only; until the user's 16 October revision, +8% damage per rank |
| Special | Shockwave | starter | 45 s recharge; a ring expands from the ship at 26 units/s across the view at activation: 180 damage to each target and clears each hostile shot as it arrives; 1 s invulnerability |
| Special | Seeker Rack | 300 | 35 s recharge; eight Blender-modelled missiles leave the rack fanned to both sides at 5 units/s, accelerate (34 u/s²) to 21 and turn hard (4.5 rad/s) onto the nearest visible targets ahead (armed first), retargeting if theirs falls; 40 damage each; smoke trails; no clear, no invulnerability |
| Special | Siege Lance | 400 | 40 s recharge; a 0.9-wide piercing beam straight ahead from the ship for 2.4 s at 360 damage/s (was 0.8 s at 450/s); the ship steers it |
| Shield | Standard Array | starter | 3 charges, a cell restores 1 |
| Shield | Bulwark Array | 250 | 4 charges, a cell restores 1 |
| Shield | Flux Array | 250 | 2 charges, a cell restores both |
| Reactor | Balanced Drive | starter | speed 12, acceleration 90, braking 125 |
| Reactor | Vector Drive | 250 | 14 / 75 / 105 |
| Reactor | Precision Drive | 250 | 11 / 115 / 170 |

Every special still charges 3% per main-weapon kill. Seeker Rack and Siege Lance kills never charge it. No shield technology regenerates passively. All standard patterns remain survivable on the slowest drive: campaign attack admission (the fairness director) assumes Precision Drive's top speed whatever is equipped, and the perfect pilot clears all four missions on Precision Drive with zero hits (`tests/sim/loadout.test.ts`).

**Endless isolation:** `createRun` gives every endless run the canonical starter (Twin Pulse rank 0, Shockwave, Standard Array, Balanced Drive), whatever the config says. Endless never reads or writes the campaign profile.

## 3. Economy

With C = credits collected in the attempt, B = 60 if the boss fell, M = ×0.85 / ×1 / ×1.2 (Relaxed / Standard / Veteran), and every payout halved (user, 16 October: "the payout is way too much"):

- success: floor(0.5 × M × (C + B + 80)), plus 75 on a mission's first clear (once per mission, across difficulties);
- failure or abandon (leaving mid-flight via Return to Menu or a new launch): floor(0.5 × M × 0.5 × C);
- a refresh or crash mid-flight banks nothing.

Credit pickups (4 / 8 / 16 / 10 by enemy class, 6 per fuel skid), salvage caches and full-shield cells (+5) count toward C. Before halving, the perfect pilot banked about 380–420 per first clear and 230–270 per repeat on Standard; after halving and the longer sorties, measured (perfect pilot collecting drops, Standard, seed 5): first clear 213 / 208 / 229 / 238 and repeat 138 / 133 / 154 / 163 credits for Training / Rolling Thunder / Cold Vector / Deep Bloom (missions now last about 3:00 / 3:25 / 4:50 / 5:15). A rank-3 weapon or a second special now takes several clears.

## 4. Save (`src/campaign/profile.ts`)

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

## 6. Not yet built

Contracts and career milestones (docs/09) and their rewards; Rail Lance; per-difficulty record filters in Statistics; an import/export of the save.
