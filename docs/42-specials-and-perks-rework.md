# Specials and chassis perks rework

Design v0.2 · 14-15 November 2026. Decisions taken with the user in conversation. **Built on 15 November** (§ Built).

## Why

The user, after playtesting:
- **Perks:** "the perks for the ships are unfair. The interceptor and the exotic one are rather underwhelming. The extra
  life on the heavy and the coin bonus on the scrapper are much more useful especially later stage." The Barrel Roll
  also fires by accident: "i sometimes execute it without wanting to just by clicking fast". The Spectre's slingshot
  "is just weak".
- **Specials:** "not such a fan of the specials like the gravity well. Its too similar to shockwave."

## Specials: one role each

| Special | Role | Price | Recharge | Status |
|---|---|---|---|---|
| Seeker Rack | starter: kill some shooters | free | 40 s | unchanged |
| Siege Lance | cut a lane: shots and enemies in its beam | 250 | 40 s | **locked: it also destroys enemy shots** |
| Shockwave | clear the shots around you | 450 | 45 s | unchanged |
| Orbital Strike | wipe every enemy on screen, not the shots | **600** | **60 s** | **locked; replaces the Gravity Well** |

### Siege Lance burns shots (locked)

The user: "Definitely make the siege lance also kill projectiles. I want it as a similar to the shockwave but instead
broad kills and less damage towards further away its the opposite, focused but obliterating as far as it goes".
- Hostile shots inside its lane are destroyed for the beam's whole length, over the full view, while it lasts (2.4 s).
- Its damage is unchanged:
  - 360 a second to every target touching the lane, so ordinary enemies die in 0.1–0.7 s;
  - about 860 a use against a boss, roughly 10% of a late core;
  - it stays that way, so boss fights are not cut short.

### Orbital Strike (locked)

The user: "a orbital strike that demolishes everything on screen instakill, but not projectiles", "it should look like a
barrage of explosions from the side".
- **Kills every enemy in view, Relic Shields included.** Enemy shots already in the air stay, so the volley still has to
  be dodged. That is what sets it apart from the Shockwave.
- **Price:** 600 credits, the most expensive special.
- **Recharge:** 60 s (user, 14 November).
- **Sweep:** across the view in 1.2 s, from the side away from the ship ("1.2s sweep why not").
- **Bosses:** each open target takes 15% of its current stage's pool, never a kill.
- **Parts:** 2 ("2 parts is fine").
- **Look (15 November, after "looks a bit underwhelming", the user chose incoming shells, heavier impacts, an opening flash
  and a jolt):**
  - The call: a white flash over the whole view, and a hard camera jolt, then a rumble while it sweeps.
  - Shells streak in from above and the far side, each landing as the front reaches its column.
  - Each impact is a white-hot flash, a shock ring, fireballs cooling to deep red, dark smoke and debris: four rows, a
    column every 1.3 units.
  - A dark gray band trails the front ("not red make it dark gray").
  - Earlier notes:
  - A line of artillery impacts walks across the screen, as if from ships out of frame.
  - Ground targets break where they stand, and air craft burst in place.
  - A rumble of camera shake goes with it.
  - The blasts are ground-level and short, drawn under enemy shots, so the shots stay readable. They use the bounded
    effect pools, which keeps them affordable on phones.
- **Notes:**
  - Full-screen kills pay out every drop at once, so this is also the best money special.
  - Side missions only observe its kills.

### Removed

- **Gravity Well:** too close to the Shockwave.
- **Decoy:** proposed and rejected as too weak.
- **Save migration (decided: "Gravity well convert it"):** a save that owned or flew the Gravity Well owns and flies the
  Orbital Strike. Nothing is refunded, and the original is backed up first (save version 6).

## Chassis perks

| Chassis | Perk | Status |
|---|---|---|
| Scrapper | Salvage Rig: pickups pulled in from 40% farther | unchanged |
| Ironclad | Reserve Life: one extra life | unchanged |
| Interceptor | Shred: every hit spins the guns up 5% fire rate, up to +40%; a hit on the ship stops them | **locked** |
| Spectre | Gravity Slingshot | **locked** |

### Spectre: Gravity Slingshot (locked)

The user liked the slingshot idea ("I like the slingshot for the exotic") but found it weak. It replaces Gravitic Shield:
- Works with or without shields; the old perk switched off once the shields were gone.
- Every hostile shot that passes close to the ship without hitting it is flung back at the enemy that fired it, as a
  homing shot of about 25 damage (the old one did 6).
- Cooldown 0.4 s (was 1.2 s), so several can be slung in one volley.
- Hits still count: it gives no protection. Lives and shields stay the only protection resources (AGENTS.md
  invariant 11).

### Interceptor: Shred (locked, 15 November)

The first version stacked +10% damage per hit in a row on one target. The user replaced it the same day: "when im locked
in on an enemy and get an accurate barrage it should shred through like a minigun ... being helped when accuracy is on
point", then "fire rate only", "just hits reset it", "Put it at 30% fire rate cap", then "Then put it at 40%".
- **Rule:** while main-weapon hits keep landing, on any enemy, the guns spin up to +40% fire rate over 1.5 s, at every
  weapon and level ("Lets try with 1.5s regardless of level").
  - **Why time, not hits:** the first version counted hits (+5% each, 8 to full), which was full in a fifth of a second
    on a Level 4 Twin Pulse and took 4 s on a Level 1 Rail Driver.
  - **"Keep landing":** each hit comes within 0.6 s of the last, which covers the Rail Driver's slowest gap of 0.5 s.
- **Reset:** getting hit, on a shield or a life, stops them. So does a pause in firing: a volley due for 0.5 s with nothing
  to fire at ("Make it reset also when the weapon is not firing"). Misses and switching targets cost nothing.
- **Damage:** unchanged. The weapon's pattern only fires faster.
- **Look and sound:**
  - the shots grow up to half again as large, and twice as bright, as the guns spin up;
  - a main-weapon kill at a quarter spin or more shatters (a white-hot flash, a fast ring and shards), bigger the faster;
  - each shot plays up to 4 semitones higher and a third quieter, so the faster stream rises into a whine instead of
    getting louder.
- **Rejected or set aside:**
  - Barrel Roll: misfires.
  - Hot Barrels (+12% damage): "too easy of a decision".
  - Wingman: not specific enough.
  - Overcharge (faster special recharge).
  - Execution.
  - Per-target damage stacking (the first Shred).

## Constraints (AGENTS.md)

- Chassis share handling and hit regions; perks are named in the hangar, with no hidden stats.
- Every perk applies in campaign and endless.
- No shield regeneration and no hidden hull points.
- Main weapons keep their own patterns: the slingshot's returned shots are the perk's, not the main weapon's.
- Every effect is simulated deterministically. Visuals never decide damage.

## Validation plan

- **Unit tests:**
  - the Lance clears shots only in its lane;
  - the Orbital Strike kills everything in view and no shot, and takes the fixed boss share;
  - the Slingshot returns shots only after a near-miss, never after a hit;
  - the Interceptor perk's thresholds and stacks;
  - the save migration for the Gravity Well.
- **Measurement:**
  - all four chassis on the late missions, with the skilled pilot at the expected level;
  - no chassis may run away from Reserve Life and Salvage Rig.
- **Fairness:** the unions and formations stay green.
- **Screens:** screenshots of the Orbital Strike and the burning Lance for the user's review.

## Built (15 November 2026)

- **Specials:**
  - `orbital-strike` replaces `gravity-well` (`SpecialId`, content, simulation, sound, button glyph, playground);
  - the Gravity Well's code was removed: the pull offset on paths and the screen-warp lens in the post pipeline.
- **Orbital Strike:**
  - `updateOrbital`, with its front in `src/sim/orbital.ts`;
  - the barrage, a column of fireballs with dark smoke every unit of the front, in `src/render/fx-particles.ts`;
  - a rumble of camera shake while it sweeps.
- **Siege Lance:** `updateLance` burns hostile shots in its lane.
- **Perks** (`src/sim/ship-perks.ts`):
  - Shred (`spinUp` on every main-weapon hit, `spinRate` in `fireMain`, emptied in `hitPlayer`);
  - the Slingshot (`firedBy` on hostile shots names the shooter);
  - the Barrel Roll and its double-tap input are gone.
- **Save version 6:** retired specials are renamed before any version's rules check a save.
- **Also in this batch** (the user, the same day):
  - Firing-envelope slack, so small steering corrections no longer stop the gun firing: Twin Pulse 0.6, Rail Driver 0.35
    (`WEAPONS[…].slack`).
  - Teal streams run on Nahara's canyon floors (docs/39).
- **Fairness:**
  - The new timing found two short seals on Dying Star Standard, seed 21:
    - an airfield site's guns and scrambling Darts, low near the row;
    - a Skimmer's split meeting a Wraith volley.
  - Repeats 0.74 → 0.75 clears both. 0.76 and 0.73 moved the seal elsewhere.
  - **Open risk:** the director admits these combinations; the trace then finds them sealing for about 0.15 s. Where the
    aircraft forecast and the actual flight differ should be found, rather than nudging the factor again.
- **Tests:**
  - `tests/sim/ship-perks.test.ts` and `tests/sim/rail-and-specials.test.ts`: Shred, the Slingshot, the Orbital Strike,
    the Lance burning shots;
  - the save migration (`tests/campaign/profile.test.ts`);
  - the browser perk spec: fast taps only steer.
  - **Not yet measured:** the chassis against each other on the late missions.
