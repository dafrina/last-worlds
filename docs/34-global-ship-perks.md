# Global ship perks

> 14 November 2026: the Interceptor's and the Spectre's perks were replaced (docs/42). The table shows the current ones.

User decision, 30 October 2026. These perks apply to the selected chassis in **campaign and endless**. This explicitly replaces the earlier campaign-only perks/cosmetic-only endless chassis rule. Endless retains its starter main, special, shield array and weapon tier; it now keeps the equipped chassis and its perk. Part variants and paint remain cosmetic. Acquisition rules are unchanged.

| Chassis | Perk | Behavior |
| --- | --- | --- |
| Scrapper | Salvage Rig | 40% wider pickup attraction. Weapon-swap pickups retain their intentional touch-to-select behavior. |
| Ironclad | Reserve Life | One extra starting life above the mode/difficulty baseline. No extra shield or life restoration during play. |
| Interceptor | Shred | Since 15 November (docs/42; it replaced the Barrel Roll, which fired by accident on fast taps): every main-weapon hit, on any enemy, spins the guns up 5% fire rate, up to +40%. Getting hit (a shield or a life) stops them, and so does a 0.5 s pause in firing; misses cost nothing. Damage per shot unchanged. Kills when spun up shatter, and the shots glow hotter and sound higher (render and audio only). |
| Spectre | Gravity Slingshot | Since 14 November (docs/42; it replaced Gravitic Shield): with or without shields, a hostile shot whose closest approach passes within 0.5 outside the hit circle is caught, swung half round the ship in 0.32 s and flung back at the enemy that fired it (the nearest in view if that one is gone) as a homing shot of 25 damage. 0.4 s between catches. No protection: hits still count. |

The Interceptor replaces the old special kill-charge bonus. Spectre replaces special-triggered firing overdrive. Neither new perk requires firing a special. There are no new HUD meters; the hangar selector and ship preview state each perk and its controls.

Reflection uses swept relative motion, after normal direct-hit collision. A grazing bullet must pass closest approach outside the hit radius plus a 0.025-unit margin, within a further 0.5 units. It cannot intercept an incoming direct hit in advance. Lasers/beam hazards are excluded. Losing the last shield dissipates any still-orbiting shot; an already-released shot continues. Returned bullets deal six damage, cannot charge the special through kills, do not home, and occupy the existing bounded projectile pool. The violet arc uses eight short segments in the existing effects batch. Tuning is centralized in `src/content/ship-perks.ts`; the behaviour is `src/sim/ship-perks.ts`.

Barrel-roll requests (`InputFrame.dashPressed`) are one-shot input events, separate from steering. Held keys, repeat events, crossing the screen center, simultaneous fingers and the special button do not trigger a roll. Blur/pause/cancel clear pending gestures. Pause freezes all perk clocks. Ordinary input and seeded simulation remain independent of rendering.

## Validation and preview

Focused simulation tests: `tests/sim/ship-perks.test.ts`; gesture tests: `tests/input/roll.test.ts`; browser coverage: `tests/browser/ship-perks.spec.ts`. Updated mode-boundary tests verify cosmetic part swaps still have no effect while each chassis's named perk applies globally.

Development preview: `/tests/fixtures/ship-perks.html`. Choose a ship, inject a near miss/direct hit, and play/hold. Interceptor uses the real steering controls. This fixture is excluded from production builds. Phone hardware testing and long-session balance remain separate from desktop browser validation.
