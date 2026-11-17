# Combat and progression

The player's side of combat: lives and shields, the main weapons and how they acquire targets, the special, the four
campaign slots, pickups and score, and how endless stays separate from the campaign. Runtime values live in
`src/content/balance.ts` (`BALANCE`, `WEAPONS`, `ENEMIES`) and `src/content/equipment.ts`; behaviour in `src/sim/game.ts`.
Details: [campaign progression](30-campaign-progression.md), [specials and perks](42-specials-and-perks.md),
[Rail Driver](32-rail-driver.md), [campaign difficulty](11-campaign-difficulty.md).

## 1. Lives and shield charges

The player has **lives and shields**, an unlimited main weapon and one rechargeable special. There is no hull health,
repair, fuel, heat, energy pool or equipment budget (invariants 7 and 11).

| Resource | Baseline | Display |
| --- | --- | --- |
| Lives | `DIFFICULTIES[…].lives` in the campaign (Relaxed 5, Standard and Veteran 3), 3 in endless; Ironclad adds one | A small ship silhouette per life |
| Shields | The shield array's starting charges (Standard 3), up to `MAX_SHIELDS` (5) from pickups | Shield glyphs, filled or outlined |
| Main ammunition | Unlimited | None |
| Special | One activation per full recharge | Recharge marks on the special button only |

**Hits** (`hitPlayer`): a hostile shot costs its damage in shield charges (normally 1), a beam or a collision costs 2. If any
shield remains, it protects the current life even if the hit empties all charges; there is no overflow. The next hit with
no shields removes one life. An accepted hit gives `BALANCE.shield.hitInvulnerability` s of invulnerability; at most one hit
resolves per interval. Windups already warned continue; no new windup starts until 0.3 s before the invulnerability ends.

**Shields are one pool for the whole run** (user, 15 October): hits spend shields first, then lives, and a replacement
life keeps whatever charges remain, normally none. Only shield cells add charges; waiting, kills, specials, sectors and
pausing never refill them.

**After a life is lost** (lives remaining): the ship stays where it is, equipment and enemy and boss damage are kept, the
special restarts at `BALANCE.respawn.specialCharge`, visible hostile shots and hazards are cleared, and
`BALANCE.respawn.invulnerability` s of invulnerability delay every enemy's next attack. Campaign keeps the weapon level;
endless drops one tier. A campaign mission fails only when the last life is lost; unused lives do not carry over.

**The hit region** is central and the same for every chassis: `VIEW.playerRadius` (0.42) for steering and lane spacing,
`PLAYER_HIT_RADIUS` (5% larger) for damage, in `src/shared/contracts.ts`. The user chose the larger radius on 14–15 October
because the small one made dodging too easy; the hero models keep their size (invariant 14).

## 2. Main weapons

Main fire is automatic and only with a valid target in the weapon's own envelope (invariant 2). `acquireTarget` accepts an
enemy that is alive, damageable, ahead of the muzzle, in range and visible in the current view, and whose circle meets one
of the weapon's actual pellet paths at its current level (widened by the weapon's `slack`). The Seeker Array uses a
bounded forward cone instead. Armed enemies come before fuel skids, then the nearest, then the lower ID. Side missions
never change targeting (invariant 13).

| Main | Family | Role | Price |
| --- | --- | --- | --- |
| Twin Pulse | straight | Narrow, quick and reliable | starter |
| Fan Cannon | fixed fan (±12°) | Wide close coverage | 250 |
| Seeker Array | homing | Alternating missiles on targets ahead | 250 |
| Rail Driver | straight, piercing | A slow slug through every enemy in its line ([docs/32](32-rail-driver.md)) | 250 |

Stats are `WEAPONS` in `src/content/balance.ts`; the five levels per weapon are in
[docs/30](30-campaign-progression.md#main-weapons-five-levels). Each family keeps its pattern even when acquiring different
targets; homing is a property of the Seeker family only, never a universal aim correction. Seeker missiles lock a visible
target at launch and keep their committed flight when the camera moves.

**Firing-envelope slack** (`WEAPONS[…].slack`, 15 November): the Twin Pulse and Rail Driver tolerate a little misalignment,
so small steering corrections no longer stop the gun firing.

**Hunter shields:** an ace's shield (`HUNTERS.shield` in `src/content/hunters.ts`, applied in `absorbHunterShield`) takes
main-weapon Seeker missiles at `seekerDamage` (20%) and Rail slugs at `railDamage` (150%); other weapons and specials hit it
normally. Only the share spent breaking the shield is scaled. Each projectile carries the weapon it was fired from, so
switching weapons or losing a homing lock cannot bypass the resistance. The 20% (25 October) keeps a clear weakness without
making Seeker-only ace fights drag.

**Relic Shields** (Nahara) let only a share of any damage through while their armour is closed (`RELIC_ARMOR` in `src/sim/attacks.ts`;
[docs/39](39-nahara-silent-empire.md)).

## 3. Special weapons

Campaign equips one of four specials; endless always starts with the Shockwave. One full recharge is one activation;
pressing spends it, and holding does not repeat. Charge is time plus `BALANCE.special.killCharge` per main-weapon kill
(at most three kills a second); special kills add nothing. The button shows a few plain ticks, never a number. The four
specials, their roles and rules are in [docs/42](42-specials-and-perks.md).

## 4. Four campaign equipment slots

**Main weapon, special weapon, shield array, ship chassis** (invariant 6; the ship replaced reactor tech on 28 October).
Every owned combination is legal and changing owned gear is free. There is no handling upgrade: all chassis fly with
`BALANCE.movement` (scaled by the pace) and share one hit region. Each chassis has a named perk in both modes
([docs/42](42-specials-and-perks.md#chassis-perks)). Shield arrays only change the starting reserve: Standard 3, Bulwark 4,
Aegis 5 (`SHIELD_TECH`). Items, prices and the save: [docs/30](30-campaign-progression.md).

## 5. Campaign economy

Credits are the main currency (coins are their pickup), parts the rare second one from strike sites. Campaign drops are
credits, shield cells and parts; there is no repair kit, ammunition or extra-life drop, and the chosen equipment lasts the
mission. Enemy credit values are `ENEMIES[…].credits`; campaign aces pay `BALANCE.campaignHunterCredits`. A mission's payout
(success, failure, first clear, the per-world scale and the difficulty multiplier) is settled once per attempt ID in one
transaction ([docs/30](30-campaign-progression.md#currencies-and-income)). Base missions stay clearable with starter
equipment and no support drops; there are no repair bills and no lost equipment.

## 6. Endless growth and isolation

Every endless run starts the same: Twin Pulse at level 1, a ready Shockwave, the Standard array with three charges, three
lives, and the player's chosen chassis with its perk (`ENDLESS_LOADOUT`, `endlessConfig`). Campaign difficulty, purchases,
levels, missions, statistics, credits and completion cannot change the start, drops, routes or scoring, and endless never
advances campaign goals or pays campaign currency (invariant 6).

Weapons grow in the run through power cells, weapon drops and endless aces' drops, over the same five tiers as the campaign
([docs/30](30-campaign-progression.md#endless)). Endless difficulty ramps by sector, independent of the campaign setting
([docs/03 § 8](03-worlds-and-generation.md), [docs/11](11-campaign-difficulty.md)).

## 7. Pickups and score

| Pickup | Effect | Modes |
| --- | --- | --- |
| Credit coin | Campaign: its credits. Endless: 50 score | Both |
| Shield cell | +1 charge; when full, 5 credits (campaign) or 100 score (endless) | Both |
| Part | +1 part, banked with the attempt | Campaign (strike sites) |
| Power cell | Toward the next weapon tier | Endless |
| Weapon capsule | Switches the main weapon; the flown one counts as power | Endless |

Pickups drift toward the player's row and are pulled in once within the magnet radius; a pickup caught by the magnet homes
until collected (`BALANCE.pickup`; the Scrapper's Salvage Rig widens the magnet). Pickups outside the view are never
vacuumed up.

**Shield supplies** are a small explicit budget, never a chance on every kill: each campaign mission schedules its cells per
difficulty (`shieldSupplies` in the mission's content file, e.g. `src/content/bastion.ts`), endless places one at
`BALANCE.shieldSupplies.endlessAt` s of every sector, endless aces may drop at most `HUNTERS.endlessDrop.shieldsPerSector`
more, and strike sites can hold one ([docs/33](33-strike-sites-and-encounter-deck.md)). A missed cell is not replaced.

**Score** (endless): each kill scores `ENEMIES[kind].score` (aces × `HUNTERS.reward`), a boss part 500 and a boss core
5,000; coins, full-shield cells and top-tier power cells add flat score. There is no combo multiplier and no extra-life
award. Scores and records are kept per mode in the local flight log ([docs/09](09-objectives-and-statistics.md)).

## 8. Validation

- **Rules:** `tests/sim/game.test.ts`, `loadout.test.ts`, `weapon-progression.test.ts`, `weapon-recovery.test.ts`,
  `pickup-catch.test.ts`, `ship-perks.test.ts`, `rail-and-specials.test.ts` cover shield loss and recovery, shield-break
  survival, one life per unshielded hit, respawn, special charge, mode isolation and the weapons.
- **Fairness:** every standard encounter must leave a reachable horizontal path without pickups, specials or damage
  (invariant 5); see [docs/03 § 7](03-worlds-and-generation.md).
- **Balance:** the scripted pilots (perfect, skilled, pacifist) and the expected weapon level per mission are described in
  [balance measurement](40-balance-measurement.md). They prove a surviving path exists; phone playtests remain the gate for
  readability and fun.
