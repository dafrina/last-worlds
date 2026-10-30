# Global ship perks

User decision, 30 October 2026. These perks apply to the selected chassis in **campaign and endless**. This explicitly replaces the earlier campaign-only perks/cosmetic-only endless chassis rule. Endless retains its starter main, special, shield array and weapon tier; it now keeps the equipped chassis and its perk. Part variants and paint remain cosmetic. Acquisition rules are unchanged.

| Chassis | Perk | Behavior |
| --- | --- | --- |
| Scrapper | Salvage Rig | 40% wider pickup attraction. Weapon-swap pickups retain their intentional touch-to-select behavior. |
| Ironclad | Reserve Life | One extra starting life above the mode/difficulty baseline. No extra shield or life restoration during play. |
| Interceptor | Barrel Roll | Double-tap the same steering half or direction key within 280 ms: the ship dashes 2.8 units that way in 0.16 s (fast off the mark, easing out), drawn as one barrel roll over 0.3 s with speed streaks, then carries on at full steering speed (held) or brakes. 3 s between starts. It only moves the ship: no invulnerability, and the swept hit test still catches fire along the dash. Hit region unchanged. (User, 30 October: "a quick sideswipe to evade quickly"; "the roll is just visual for the side dash". It was a 0.42 s invulnerable roll in place.) |
| Spectre | Gravitic Shield | With shields remaining, catch one ordinary hostile bullet after a genuine near miss. It curves around the shield for 0.32 s, then flies toward the nearest visible forward enemy (straight ahead if none). 1.2 s between captures; no shield cost. |

The Interceptor replaces the old special kill-charge bonus. Spectre replaces special-triggered firing overdrive. Neither new perk requires firing a special. There are no new HUD meters; the hangar selector and ship preview state each perk and its controls.

Reflection uses swept relative motion, after normal direct-hit collision. A grazing bullet must pass closest approach outside the hit radius plus a 0.025-unit margin, within a further 0.5 units. It cannot intercept an incoming direct hit in advance. Lasers/beam hazards are excluded. Losing the last shield dissipates any still-orbiting shot; an already-released shot continues. Returned bullets deal six damage, cannot charge the special through kills, do not home, and occupy the existing bounded projectile pool. The violet arc uses eight short segments in the existing effects batch. Tuning is centralized in `src/sim/ship-perks.ts`.

Barrel-roll requests (`InputFrame.dashPressed`) are one-shot input events, separate from steering. Held keys, repeat events, crossing the screen center, simultaneous fingers and the special button do not trigger a roll. Blur/pause/cancel clear pending gestures. Pause freezes all perk clocks. Ordinary input and seeded simulation remain independent of rendering.

## Validation and preview

Focused simulation tests: `tests/sim/ship-perks.test.ts`; gesture tests: `tests/input/roll.test.ts`; browser coverage: `tests/browser/ship-perks.spec.ts`. Updated mode-boundary tests verify cosmetic part swaps still have no effect while each chassis's named perk applies globally.

Development preview: `/tests/fixtures/ship-perks.html`. Choose a ship, inject a near miss/direct hit, and play/hold. Interceptor uses the real steering controls. This fixture is excluded from production builds. Phone hardware testing and long-session balance remain separate from desktop browser validation.
