# Game design

What Last Worlds is and how it plays: the concept, the pillars, the controls, the two modes and the scope. The rules behind
each part are in the topic docs linked below; the user's decisions are in [docs/08](08-decisions-and-sources.md).

## 1. High concept

**Last Worlds** is a portrait arcade shooter for phone browsers. A strike fighter races over hostile alien planets: the
world streams downward while the ship faces upward. The player steers left and right and fires the special; the main
weapon opens fire by itself whenever an enemy enters its firing path.

The signature moment is cutting through an air formation, slipping across a telegraphed salvo, and stripping the weapons
off a huge machine below the flight path. Craft and terrain are real 3D, but combat is read and solved as a clean
horizontal dodging game on one plane.

The fiction is light: a lone pilot fights across eight worlds, from Luna, Khepri's moon, to Umbra, the final planet. Each
mission opens the route to the next. There is no dialogue, hub, voice acting or branching story.

## 2. Design pillars

| Pillar | What it means in play | What would violate it |
| --- | --- | --- |
| Line up, commit, escape | Move into a firing path, deal damage, leave before retaliation | Weapons aim freely across the screen regardless of position |
| Read danger before impact | Distinct shot shapes, honest hit regions, adequate warnings | Decorative flashes resemble bullets; attacks emerge from behind UI |
| Large scale, simple control | Huge ground machines with readable weak points below the fighter | Altitude selection, a separate ground-fire mode, hidden obstruction |
| Two kinds of progression | Planned campaign builds and volatile endless runs | Campaign upgrades create stronger endless starting ships |
| Restrained spectacle | Short punchy effects, crisp silhouettes, satisfying destruction | Explosions or bloom conceal the next threat |

## 3. Core loop and pacing

**Every few seconds:** spot a threat, move to align, the gun confirms a target, dodge a warned retaliation, collect a
reachable reward.

**Every 15–30 seconds:** finish an authored encounter phrase, take a short breather, meet a different formation or ground
threat ([docs/33](33-strike-sites-and-encounter-deck.md) describes the encounter deck).

**Campaign session:** choose a mission and difficulty, set the loadout in the hangar, fly a few minutes ending in a boss,
bank credits and parts, buy or reconfigure, then replay or advance.

**Endless session:** start from the standard loadout, pick up weapons and power in flight, beat each world's boss, jump
to the next world, and play until the last life is lost; then record the score and restart.

## 4. Controls

Portrait is the only orientation: a phone turned sideways shows a rotate notice and pauses the flight (`src/main.ts`). The
ship sits at a fixed forward row and never follows a finger vertically. There is no forward, backward or altitude control
(invariant 1).

| Input | Action |
| --- | --- |
| Hold the left or right half of the play surface | Move that way continuously (the default, "Halves") |
| Release | Brake quickly to a stop |
| Tap the special button | Fire the equipped special when charged |
| A valid target in the main weapon's path | The main weapon fires automatically |
| A/D or the arrow keys | Move on desktop |
| Space | Special on desktop |
| Escape or the pause control | Pause |

**Steering modes** (Settings → Steering; `SteeringMode` in `src/input/tilt.ts`, saved under `last-worlds.steering`):

- **Halves** (default; user, 21 October): hold a half to move that way. A held finger that slides across the middle
  switches direction, with a dead band of 3% of the width around the centre line.
- **Drag** (user, 15 November): the ship heads for its position at touch-down plus the finger's sideways travel
  (`DRAG_GAIN`, `DRAG_RESPONSE`, `DRAG_DEAD` in `src/input/controls.ts`), at its normal speed. There is no absolute
  drag-to-position steering.
- **Tilt** (user, 6 November): the phone's sideways lean steers proportionally (`TILT_DEAD`, `TILT_FULL`); held halves
  and keys still work and win over the lean.

The ship accelerates and brakes quickly rather than teleporting (`BALANCE.movement`, scaled by the pace).

### Touch ownership

- Each pointer gets one role at pointer-down: left, right, drag or special. Only steering roles may switch mid-touch; the
  special button's pointer never steers (invariant 3).
- Holding both halves is neutral; the special works alongside either. Releasing one side resumes the other.
- Pointer cancel, lost capture, window blur and pause clear held input, so steering never sticks.
- Touches on the special button, the pause control or menus never steer.

The steering hints ("HOLD", "DRAG" or "TILT") blink gently for the first three seconds of a flight, then disappear;
reduced motion shows them static.

### Viewport, HUD and the wider map

The view shows 12 world units across (`VIEW.width`); the world is 24 wide (`VIEW.worldWidth`, two screens; user,
21 October). The camera follows the ship's lateral travel beyond a central dead zone, so screen edges are not walls and
side routes and optional fights lie off to the sides ([docs/10](10-wide-map-and-camera.md)). Phones fill their viewport
height; the camera never rotates or zooms while steering.

The HUD is minimal ([docs/16](16-flight-command-ui.md)): small ship silhouettes for lives and shield glyphs for charges at
the top, the endless score or campaign credits, and one plain special button at bottom centre with its recharge ticks.
No hull, ammunition, energy or combo bars, no permanent arrows, no minimap.

## 5. Combat readability and target-gated fire

The main weapon checks its own forward firing envelope: a target must be alive, damageable, in view, ahead, in range and
on one of the weapon's actual shot paths ([docs/02 § 2](02-combat-and-progression.md)). Ground targets qualify through
explicit combat proxies; there is no scenery raycast or hidden altitude test (invariant 4). Empty sky fires nothing; shots
already in flight keep going after their target dies.

Narrow guns reward precision, the fan accepts a wider envelope, and only the Seeker family homes. Movement still decides
dodging, range and acquisition. Ship banking, engine motion and camera shake are visual only.

## 6. Campaign

Eight missions over eight worlds, unlocked in order (`CAMPAIGN_ORDER`): Training (Luna), Rolling Thunder (Khepri), Cold
Vector (Vesper), Deep Bloom (Nacre), Brood Strike (Amnion), Dying Star (Corona), Silent Empire (Nahara) and Final Horizon
(Umbra). Each ends with its world's boss ([docs/03](03-worlds-and-generation.md)).

- **Loadout:** exactly four slots: main weapon, special, shield array and ship chassis
  ([docs/30](30-campaign-progression.md)). Credits and parts buy alternatives, weapon levels and ship designs; every owned
  combination is legal.
- **Difficulty:** Relaxed, Standard or Veteran, locked for the attempt ([docs/11](11-campaign-difficulty.md)).
- **Lives and shields:** shields absorb hits; a hit with no shield costs a life; the last life fails the attempt
  ([docs/02](02-combat-and-progression.md)). Drops are credits, shield cells and parts. Equipment is kept on failure and
  retrying is free.
- **Side missions:** each world has a board of optional goals that pay credits and parts. They only observe play; they
  never change firing, spawns, loot or controls (invariant 13; [docs/35](35-missions.md)).
- **Ships:** four chassis (Scrapper, Ironclad, Interceptor, Spectre), each with its own modular model and a named perk
  ([docs/31](31-hero-ships.md), [docs/42](42-specials-and-perks.md)). Part designs and paint are cosmetic.

## 7. Endless

Every run starts the same: Twin Pulse at level 1, a ready Shockwave, the Standard shield array, three lives, and the
player's chosen chassis with its perk. Campaign purchases, missions, credits and statistics cannot affect the run, its
drops, routes or score, and endless cannot advance campaign goals.

The run opens with a Luna sector and WARDEN-1, then cycles the seven other worlds in campaign order, three sectors each
(`ENDLESS_CYCLE` in `src/content/endless.ts`). Each world's last sector ends with its boss; the run continues only once
the boss is killed (no timeout), then a hyperdrive jump carries it to the next world
([docs/18](18-endless-planet-cycle.md)). Pace, enemy health and pressure rise by sector to capped values, independent of
the campaign difficulty ([docs/11](11-campaign-difficulty.md)).

Weapons grow through in-flight pickups over the same five tiers as the campaign; a lost life drops one tier. Records and
statistics are kept separately from the campaign ([docs/09](09-objectives-and-statistics.md)). Different seeds still
differ in luck.

## 8. Why the design is shaped this way

- **Procedural worlds, authored battles.** Terrain, scenery and world layout are generated from seeds; enemy designs,
  encounters, battle sequences and attacks are authored (invariant 8). Randomly assembled combat would not stay readable
  or fair.
- **One plane is a strength.** Ground turrets and fortresses expose their shootable points through screen-aligned target
  proxies, so players never learn which weapons can secretly reach which heights.
- **Left/right control is a real constraint.** At the fixed player row every barrage becomes moving intervals of danger;
  a wall without a gap is unavoidable. Encounters must always leave a reachable horizontal path (invariant 5), and skill
  expression comes from timing, alignment and special choice, not vertical movement.
- **Two modes, one combat.** Campaign and endless differ in reward policy and build pacing, not in physics, weapons or
  collision.
- **A spare UI.** Lives are ship icons, shields are shield icons, the special's recharge is on its button. No hidden hull
  HP, fuel, heat, stamina or extra currencies (invariant 7).
- **Authored silhouettes.** Every ship, enemy and boss is a Blender model with a recognizable shape; procedural hero
  assembly is deferred (invariant 8).

## 9. Out of scope

No multiplayer, accounts, online leaderboard, native store packaging, inventory grid, escort AI, branching story,
monetization, analytics or runtime AI-generated assets. Native packaging and a public scoreboard would each need their own
design decision.
