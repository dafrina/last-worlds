# Game design

Version 0.3 · proposed design · 13 October 2026

## 1. High concept

**Last Worlds** is a portrait arcade shooter in which a strike fighter races over hostile alien planets. The world streams downward while the ship faces upward. The player controls lateral movement and special attacks. The main weapon opens fire as enemies enter its firing path.

The signature moment is cutting through an air formation, shifting across a telegraphed cannon salvo, and stripping weapons off a massive tracked fortress below the flight deck. Craft and terrain are 3D, but the player reads and solves combat as a clean horizontal dodging game.

The fiction is light: a lone expedition pilot disables automated war foundries across three worlds. Each sortie opens the route to the next planet. No dialogue tree, walkable hub, voice acting, or branching narrative is needed.

## 2. Design pillars

| Pillar | What it means in play | What would violate it |
| --- | --- | --- |
| Line up, commit, escape | Move into a firing path, deal damage, leave before retaliation | Weapons aim freely across the screen regardless of position |
| Read danger before impact | Distinct shot shapes, honest hit regions, adequate warnings | Decorative flashes resemble bullets; attacks emerge from behind UI |
| Large scale, simple control | Huge ground machines with readable weakpoints below the fighter | Altitude selection, separate ground-fire mode, hidden physical obstruction |
| Two kinds of progression | Planned campaign builds and volatile endless runs | Campaign upgrades create stronger endless starting ships |
| Restrained spectacle | Short punchy effects, crisp silhouettes, satisfying destruction | Opaque explosions or bloom conceal the next threat |

## 3. Core loop and pacing

**Every few seconds:** identify a threat → move to align → automatic fire confirms a target → dodge a warned retaliation → collect a reachable reward.

**Every 15–30 seconds:** complete an authored encounter phrase → take a short recovery interval → meet a different formation or ground threat.

**Campaign session:** choose mission → select main, special, shield tech, and reactor tech; optionally choose a contract → fly for 3–5 minutes → bank credits → make one understandable purchase or configuration decision → replay or advance.

**Endless session:** start from standard equipment → get the first weapon opportunity within 30 seconds → choose a run upgrade after each sector → defeat bosses and switch planets → eventually lose the last life → record score and restart. Target first-run duration is 4–8 minutes; practiced runs 10–20 minutes. These are tuning goals, not hard time limits.

## 4. Controls, confirmed by the user

Portrait is the primary orientation. The ship occupies a fixed forward coordinate, around 76% of the playable viewport height. The ship never follows the finger vertically.

| Input | Action |
| --- | --- |
| Hold left half of play surface | Move left continuously |
| Hold right half of play surface | Move right continuously |
| Release movement touch | Brake quickly to a stop |
| Tap dedicated special button | Activate equipped special if its charge and cooldown allow |
| Valid target enters main firing path | Fire automatically at weapon cadence |
| A/D or left/right arrow keys | Same horizontal movement on desktop |
| Space | Special on desktop |
| Escape or pause UI | Pause |

The two half-screen steering areas are invisible during normal play, with a subtle onboarding hint. There are no permanent arrow-button panels and no virtual joystick. The special button is a plain flat circle at bottom center with an ivory glyph and a few recharge ticks. No metal housing, bevel, neon rim, gradient, or extra energy meter. Left/right hints blink gently for the first three active seconds of each new flight, then disappear; reduced-motion uses a static hint for that time.

### Touch ownership

- **User decision (14 October):** a held steering touch that slides across the middle switches direction, so there is no need to lift and retouch. A dead band of 3% of the width around the centre line prevents flicker. This replaces the earlier provisional "initial side owns until release" rule.
- Each active pointer is assigned one role on pointer-down: left, right, special, or another UI control. Only steering roles may switch between left and right mid-touch; special and UI pointers never become steering.
- Holding both left and right yields neutral steering; special can operate concurrently with either. Releasing one side resumes the remaining side.
- Pointer cancellation, lost capture, window blur, and pause clear the affected held inputs. No stuck steering.
- Touches on the special button, pause control, menu, or outside the fitted game rectangle never steer.
- Use rapid acceleration and braking, not instant teleportation. Starting values: top speed 12 units/s, acceleration 90 units/s², braking 125 units/s² at campaign pace (raised from 10/70/100 on 14 October). Endless starts at the old 10/70/100 and ramps by sector to 1.1 times the campaign values; see [worlds and generation](03-worlds-and-generation.md#8-endless-difficulty-and-seeds). The ship's collision radius is 0.42 (the planned Dominion tier width), giving an honest, sizeable hit region.
- A one-thumb player can steer, release briefly, and tap the centered special. Two thumbs allow simultaneous steering and special. The button is centered so either hand can reach it.

A tap in the main viewport starts movement; it does not select an enemy. Ordinary targets cannot demand precise finger aiming. Main-fire controls and dragging are not alternative defaults in this plan.

### Orientation, HUD, and wider map

Fit a consistent 9:16 viewport showing 12 world units horizontally. This is a window into a 30-unit-wide world (2.5 screens; narrowed from 36 on 15 October), not a movement boundary. Terrain sections 30 wide and 36 long connect forward; the camera begins over the middle slice and follows lateral travel after the ship leaves a central dead zone. The player can find side routes, caches, and optional fights while forward scrolling continues. See [wide map and camera](10-wide-map-and-camera.md).

Different phone shapes fit the same tactical viewport without revealing extra world width. True outer world limits remain visible and distinct from screen edges. No camera rotation or zoom while steering.

Top-left HUD: small ship silhouettes for lives and matching simple shield icons for remaining shield charges. Endless adds a small score readout; campaign credits and objectives live in pause/results. No player hull, ammo, energy, reactor, or permanent combo bars. Bottom center: one plain special button, at least 64 CSS pixels, above the safe-area inset. No permanent arrows or minimap. Keep lower gameplay quiet for thumbs.

## 5. Combat readability and target-gated fire

The main weapon checks a forward firing envelope. A target must be alive, damageable, inside the current camera viewport, ahead of the player, within range, and inside the weapon's authored alignment rule. Ground targets qualify through explicit combat proxies. There is no scenery raycast or hidden altitude test.

An illuminated muzzle/reticle and a tiny alignment sound make acquiring a target legible. Shoot on the first eligible simulation tick when the weapon is ready. Fire stops if no valid target remains; empty sky does not consume or produce main shots. Existing projectiles keep moving after their target dies or exits. A special is an explicit player action and does not require automatic target acquisition unless its own rule says so.

Narrow guns reward precision; spread guns accept a wider firing envelope. A homing main family may steer its own projectiles toward targets within its documented forward acquisition envelope. Pulse stays straight and Fan keeps fixed pellet angles. Movement still controls dodging, visibility, range, and initial acquisition. Ship banking, engine motion, and camera shake are visual only. Side missions never modify automatic targeting or damage rules.

## 6. Campaign

Nine missions across three worlds at full scope; three on the first planet for MVP. Authored encounters live across wider terrain with optional routes. Select exactly four pieces of equipment: main, special, shield tech, reactor tech. Credits buy alternatives and capped main-weapon ranks. All combinations of owned equipment are legal; there is no reactor budget or passive-module system.

Start each Standard/Veteran mission with three lives and full shield; Relaxed proposes five. Select campaign difficulty before launch and lock it for the attempt; see [campaign difficulty](11-campaign-difficulty.md). Shield charges absorb hits; an accepted hit with no shield costs one life. Losing the final life fails the attempt. Campaign drops are credits and one-charge shield cells. No random weapon swap, repair/ammo resource, or extra-life drop. Equipment is retained on failure; retry costs nothing.

Campaign advancement combines story clears, purchased builds, cumulative career milestones such as destroying 100 aircraft, and one optional mission contract per attempt. Contracts and milestones pay campaign credits only. They observe normal gameplay; they never change firing, collateral, spawns, loot, or controls. Only offer a preservation challenge where existing content makes it feasible. See [objectives and statistics](09-objectives-and-statistics.md).

Success banks eligible rewards; failure keeps half collected credits plus newly earned cumulative career rewards, with no clear/contract bonus. Apply results once per attempt. Main progression must not demand repeated grinding or a particular optional contract.

The hero progresses through fundamentally different Scrapper, Razor, and Dominion chassis. The rusty utility starter is visibly smaller in gameplay than the later interceptor and assault fighter. These are campaign appearance milestones, not extra combat stats beyond selected equipment. A free test range makes equipment comparisons easy.

## 7. Endless

Start every run from the same Pulse tier I, ready Shockwave, Standard shield, Balanced handling, and three lives. The starter appearance is identical for everyone. Campaign purchases, objectives, coins, service rank, and cosmetics cannot affect the run, drop pools, routes, choices, or scores. Endless activity cannot advance campaign tasks.

Difficulty ramps each sector through stronger formations, more coordinated pressure, capped enemy HP/speed increases, and bosses every third sector. Play 90-second sectors with short boundary choices. Campaign difficulty never changes this ramp. Discover lateral routes and choose optional engagements at the cost of missed rewards elsewhere. Run-only main/special swaps and weapon power are available from the first run regardless of campaign unlocks. Shield/reactor remain the baseline technologies in this release.

Death with lives remaining refills shield safely near the current region, gives temporary invulnerability, sets special charge to 50%, and removes one main-power pip. Equipment family remains. Last-life loss ends the run. Score-based extra-life milestones are limited and identical for all players.

Records and statistics are independent from campaign. Local scoreboard categories separate ruleset versions and gameplay-changing assists. Same starter means progression fairness; different random seeds still have luck variation. A later shared-seed/public scoreboard requires its own verification design.

## 8. Review of the initial idea

**Procedural world generation is core MVP scope.** Generate terrain, scenery, and connected world layout, especially for endless. Author enemy models, encounter compositions, combat sequences, and attacks. Do not randomly arrange battles. Procedural hero design remains a later experiment.

**One plane is a strength.** Keep ground turrets and a fortress, but explain their shootable points through visual target markers and screen-aligned collision. Do not make players learn which weapons can secretly reach different heights.

**Left/right control creates a real constraint.** At the fixed player row, every barrage becomes moving intervals of danger. A broad wall without a gap is unavoidable. If testing shows insufficient skill expression, improve attack timing, alignment, and special choices first. Adding vertical movement would be a major change to the user's requested control scheme.

**Two modes are worthwhile if they reuse combat.** Their reward policies and build pacing differ, not their physics, weapons, or collision implementation. Separate engines or duplicated content would make a small project expensive to maintain.

**Keep the UI spare.** Lives are ship icons; shield charges are shield icons; special recharge belongs on its button. Unlimited main ammo needs no meter. Avoid hidden hull HP, fuel, heat, stamina, extra energy, and multiple currencies.

**Modern stylized art needs coherent authored shapes.** Procedural material accents and approved modular attachment swaps can help later. Algorithmically inventing every silhouette is unlikely to create a recognizable enemy roster.

## 9. Scope exclusions and unresolved experiments

No multiplayer, accounts, global leaderboard, native store packaging, ship crafting, inventory grid, mission escort AI, branching story, monetization, or runtime AI-generated assets in the planned release.

The user-confirmed controls and two-mode premise are fixed. The wider map, lateral camera follow, minimalist icon HUD, four-slot campaign build, observational campaign objectives, and mode-separated statistics are also confirmed. Camera pitch, exact map width, shield-charge timing, target-envelope widths, acceleration, economy numbers, and content quantity remain testable proposals. M1 must settle the control feel and ground-target readability before any content expansion.
