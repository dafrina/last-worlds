# Specials and chassis perks

The four special weapons and the four chassis perks: what each does, why it is shaped that way, and where it lives in the
code. The current set was decided with the user on 14–15 November after playtesting (docs/08) and built on 15 November.
Prices and the shop are in [campaign progression](30-campaign-progression.md).

## Specials: one role each

One special is equipped. It owns the bottom-centre button, never steers (invariant 3), and charges over time plus
`BALANCE.special.killCharge` per main-weapon kill (at most three kills a second count; special and reflected kills never
charge). A replacement life starts it at `BALANCE.respawn.specialCharge`. Data: `SPECIALS` in `src/content/equipment.ts`;
behaviour: `useSpecial` and the `update*` functions in `src/sim/game.ts`.

| Special | Role | Recharge, price |
| --- | --- | --- |
| Seeker Rack | starter: kill some shooters | 40 s; free campaign starter |
| Siege Lance | cut a lane: the enemies and shots in its beam | 40 s; 250 credits + 1 part |
| Shockwave | clear the shots around you | 45 s; 450 + 1; the endless starter |
| Orbital Strike | wipe every enemy on the map, not their shots | 60 s; 600 + 2 |

The user, 14 November: "not such a fan of the specials like the gravity well. Its too similar to shockwave." Each special
now has a distinct answer to a crowded screen.

### Seeker Rack

Eight missiles fan out to both sides, then accelerate and turn hard onto the nearest visible targets ahead (armed first),
retargeting if theirs falls; 40 damage each (`launchSeekerRack`). No shot clearing, no invulnerability.

### Siege Lance

A piercing beam straight ahead from the ship for `duration` s at `dps`, `width` wide; the ship steers it (`updateLance`).
Since 14 November it also burns every hostile shot in its lane for the beam's whole length, over the full view (the
user: "the opposite [of the Shockwave], focused but obliterating as far as it goes"). Its damage stays as it was, so
ordinary enemies die in a fraction of a second while a boss loses roughly a tenth of a late core per use.

### Shockwave

A ring bursts out from the ship at `speed` to `reach` (`updateShockwave`): each target it reaches takes up to
`BALANCE.special.damage` once, full within `full` and fading to `minShare` at `reach`, on screen or not (user, 15 November).
It clears hostile shots within `clear` of the ship and gives `BALANCE.special.invulnerability` s of invulnerability.

### Orbital Strike

The user: "a orbital strike that demolishes everything on screen instakill, but not projectiles", "it should look like a
barrage of explosions from the side". It replaced the Gravity Well on 14 November.

- **Sweep** (`src/sim/orbital.ts`, `updateOrbital`): one front across the whole map in `sweep` s, from the map edge nearer
  the view to the other (user, 15 November: "make it always from the closer side towards the other"). Every enemy the
  front reaches is destroyed, Relic Shields included, on screen or not.
- **Shots stay:** enemy shots already in the air are not touched, so the volley still has to be dodged. That is what sets
  it apart from the Shockwave.
- **Bosses:** each open boss target takes `bossShare` of its current stage's pool (`src/sim/boss.ts`), never a kill.
- **Look** (render only): a white flash and a camera jolt when called, then a rumble; shells streak in from above and
  the far side, landing as the front reaches each column; impacts of varied size (white-hot flash, shock ring,
  fireballs, dark smoke, debris) under a dark grey band that trails the front (`src/render/fx-particles.ts`, the pall in
  `src/render/post-pipeline.ts`, the jolt in `src/render/scene.ts`). Impacts are drawn only near the view and use the
  bounded effect pools.
- Full-map kills pay every drop at once, so it is also the best money special. Side missions only observe its kills.

## Chassis perks

Each chassis has one named perk, shown in the hangar, that applies in campaign and endless (user, 30 October; invariants 6
and 14). Chassis share handling and the central hit region; there are no hidden stats and no extra HUD meter. Data:
`SHIPS` in `src/content/equipment.ts` and `SHIP_PERKS` in `src/content/ship-perks.ts`; behaviour: `src/sim/ship-perks.ts`.

| Chassis | Perk | What it does |
| --- | --- | --- |
| Scrapper | Salvage Rig | Pickups are attracted from 40% farther (`SHIPS.scrapper.pickupReach`). Weapon-swap pickups keep their touch-to-select behaviour. |
| Ironclad | Reserve Life | One extra starting life above the mode and difficulty baseline (`extraLives`). No extra shields, no restoration. |
| Interceptor | Shred | Steady hits spin the guns up to more fire rate. |
| Spectre | Gravity Slingshot | Near-miss shots are flung back at their shooter. |

### Interceptor: Shred

The user, 15 November: "when im locked in on an enemy and get an accurate barrage it should shred through like a minigun
... being helped when accuracy is on point", "fire rate only", "the cap should be 30%".

- **Rule:** while main-weapon hits keep landing, on any enemy, the guns spin up to `shredCap` more fire rate over
  `shredWindUp` s, at every weapon and level (`spinUp`, `updateSpin`, `spinRate`). Hits keep landing while each comes
  within `shredWindow` of the last, which covers the Rail Driver's slowest gap.
- **Reset:** getting hit (a shield or a life) stops the spin, and so does `shredIdle` s with a volley due and nothing to fire
  at. Misses and switching targets cost nothing.
- **Damage per shot is unchanged;** the weapon's own pattern only fires faster.
- **Why time, not hits:** counting hits filled the spin in a fifth of a second on a Level 4 Twin Pulse and took 4 s on a
  Level 1 Rail Driver.
- **Look and sound:** the shots grow and brighten as the guns spin up; a main-weapon kill at a quarter spin or more
  shatters (bigger the faster); each shot plays higher and quieter, so the faster stream rises into a whine instead of
  getting louder (`src/audio/events.ts`).

### Spectre: Gravity Slingshot

- **Rule** (`catchNearMiss`): after the ordinary swept hit test misses, a hostile shot whose closest approach passes just
  outside the hit circle (beyond a 0.025 margin, within `grazeWidth`) is caught. It never intercepts a shot on its way into
  a direct hit. Works with or without shields; one catch every `reflectCooldown`.
- **Return** (`orbitReflectedShot`): the shot swings half round the ship over `reflectDuration`, then flies back at the
  enemy that fired it (`firedBy`; the nearest enemy in view if that one is gone) as a homing shot of `reflectedDamage` at
  `reflectedSpeed`.
- **No protection:** direct hits still count. Lives and shields stay the only protection resources (invariant 11).
  Returned shots are the perk's, not the main weapon's, so they never charge the special.

## Constraints

- Chassis share handling and hit regions; perks are named in the hangar.
- Every perk applies in both modes; part designs and paint stay cosmetic.
- No shield regeneration and no hidden hull points.
- Main weapons keep their own patterns.
- Every effect is simulated deterministically; visuals never decide damage.

## Removed

- **Gravity Well** (special, 28 October to 14 November): a singularity that pulled air craft together and swallowed
  shots. Too close to the Shockwave. A save that owned or equipped it owns and flies the Orbital Strike (save version 6,
  nothing refunded; [docs/30](30-campaign-progression.md#the-save)).
- **Barrel Roll** (Interceptor): a double-tap sidestep that fired by accident on fast taps ("i sometimes execute it
  without wanting to just by clicking fast"). Its input is gone; fast taps only steer.
- **Gravitic Shield** (Spectre): a shielded near-miss reflection, replaced by the stronger Gravity Slingshot.
- Rejected proposals: a Decoy special, Hot Barrels, Wingman, Overcharge, Execution, and per-target damage stacking (the
  first Shred).

## Validation

- `tests/sim/ship-perks.test.ts`: Shred's wind-up, cap and resets; the Slingshot returns shots only after a near miss,
  never after a hit.
- `tests/sim/rail-and-specials.test.ts`: the Orbital Strike's price, sweep, direction, boss share and shots left in the
  air; the Siege Lance burning shots only in its lane.
- `tests/campaign/profile.test.ts`: the Gravity Well save migration.
- `tests/browser/ship-perks.spec.ts`: fast taps on the Interceptor only steer.
- Development preview: `tests/fixtures/ship-perks.html` (choose a ship, inject a near miss or a direct hit).

## Open

- The four chassis have not been measured against each other on the late missions.
- Fairness: the 15 November timing found two short seals on Dying Star Standard, seed 21, cleared by a repeat-rate nudge
  (`MISSION_CADENCE`). The director admits those combinations and the trace then finds them sealing for about 0.15 s;
  where the aircraft forecast and the actual flight differ should be found rather than nudging the factor again.
