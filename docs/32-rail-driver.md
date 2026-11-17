# Rail Driver

The Rail Driver is the fourth main weapon: a heavy, slow slug that pierces every enemy along its line. It is weaker than
the Twin Pulse on a lone target and much stronger on a column, so it rewards lining enemies up. The user approved it on
28 October ("i love that, implement it"). Its sim and data sources are cited below; tiers and prices are in
[campaign progression](30-campaign-progression.md).

## 1. Rules

It is a **straight**-family weapon (invariant 2): fixed angle 0, automatic, firing only with a valid target in its
envelope. It never aims and never homes.

### 1.1 Data

`WEAPONS.rail` in `src/content/balance.ts`: label, `cadence` (level 1), `speed` (near-instant; collision is swept per tick
with `segmentCircleHit`, so it never tunnels), `range` (about the top of the view), `damage` 32 per target per slug,
`radius`, a single centred barrel, and `slack` (the firing-envelope tolerance that keeps small steering corrections from
stopping the gun; docs/42).

On a lone target level 1 does 64 damage a second against the Twin Pulse's 90. The first draft had 40 damage, which beat the
Pulse on bosses because the centred slug never misses where the Pulse's offset twins partly do (§ 1.7).

### 1.2 Levels

The five levels are in `src/content/weapon-tiers.ts` (`patterns.rail`) and follow the shared rule: more slugs and a faster
rate, never more damage per slug. Level 1 fires one slug every 0.5 s, level 3 twin slugs at ±0.3, level 5 four slugs side
by side at ±0.3 and ±0.9. The full table is in [docs/30](30-campaign-progression.md#main-weapons-five-levels).

### 1.3 Firing envelope

The existing straight-weapon check in `acquireTarget` (segment against circle along each slug's path) with the same target
order: armed enemies before fuel skids, then the nearest.

### 1.4 Piercing

`railHits` in `src/sim/game.ts`. A slug carries `pierced` (the IDs it has already damaged, `Projectile.pierced` in
`src/shared/contracts.ts`).

- Each tick it collects every enemy its swept segment touches, in order along the path (then by ID), skipping those already
  hit. Each takes the damage once.
- **A boss part stops the slug:** the first part it touches takes the damage and the slug ends, so one slug never strikes
  several parts of a boss. A core kill resolves the phase at once.
- Ground targets are hit through their proxies like any straight shot, and the slug carries on; a fuel skid's blast and
  chain are unchanged. Scenery never blocks it (invariant 4).

### 1.5 Hunter shields

The Rail Driver is the counter to aces' shields: `HUNTERS.shield.railDamage` (1.5) in `src/content/hunters.ts`. Only the
damage spent breaking the shield is scaled (`absorbHunterShield`, `src/sim/hunters.ts`); a shielded hunter does not stop
the slug. Main-weapon Seeker missiles are the opposite (`seekerDamage` 0.2; [docs/02](02-combat-and-progression.md)).

### 1.6 Progression and modes

- **Campaign:** bought for 250 credits like the other guns (`WEAPON_PRICES`), then the shared level upgrades.
- **Endless:** in the weapon pickup pool under the shared rules. The encounter deck places two fixed Rail drops
  (`e3-west`, `ev2-west` in `src/content/encounter-deck.ts`), and any weapon drop that would offer the flown gun offers the
  next one in `WEAPON_IDS` instead, so every weapon drops.
- Identical opportunity pools across modes (invariant 6).

### 1.7 Fairness and balance

- No run may need piercing to survive (invariant 5): the perfect-pilot suites fly every world's encounters with every
  weapon.
- The kill-charge cap already stops a column wipe from farming special charge.
- **Measured, 28 October** (perfect pilot, Standard, level 1): at 32 damage the Rail Driver's boss time is slower than the
  Pulse's (Cold Vector 140 s against 117 s, Deep Bloom 142 s against 129 s), while it gets about 1.5–2× the kills on lined-up
  waves. Watch in play whether that kill rate, and the credits from it, make it the default choice.

## 2. Tests

`tests/sim/rail-and-specials.test.ts`: one slug damages a column once each and never twice across ticks; it stops at the
first boss part; the hunter-shield multiplier applies only to the part that breaks the shield; the level intervals; no
target, no fire. `tests/sim/weapon-progression.test.ts` covers it with the other weapons, and
`tests/campaign/profile.test.ts` loads a save written before it existed (`LATER_WEAPONS`, level 1).

## 3. Presentation

Render only; the simulation decides every hit (`src/render/scene.ts`, the Rail Driver slugs block).

- **Slug:** a short white-hot streak at the head, with a halo in the hero's glow colour. Never red and never a lingering
  beam, so it can't be mistaken for an enemy laser.
- **Trail:** a tapered line from the muzzle to the head, fading out after the slug is gone.
- **Muzzle:** a flash and a small recoil kick of the hero model (the hit region does not move).
- **Pickup icon:** a slug piercing three rings (`src/render/pickup-icons.ts`).

## 4. Audio

A heavy, dry crack (`rail` in `src/audio/samples.ts`; its level in `src/audio/mixer.ts`). See [sound design](24-sound-design.md).
