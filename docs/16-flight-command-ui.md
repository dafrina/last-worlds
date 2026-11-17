# Menus and HUD

The game's screens as they are: the front screen, the campaign page, the hangar, statistics, settings, pause, results and
the in-flight HUD. The look follows the 7 November redesign the user approved (docs/08). Code: `src/ui/` (`game-ui.ts`
wires the pages, `menu-markup.ts` holds the markup, `hangar.ts`, `mission-board.ts`, `flight-log.ts`, `planet-preview.ts`,
`styles.css`), menu sounds in `src/ui/ui-sounds.ts`.

## Style

Deep navy, ivory and amber, with layered cards and cut-corner buttons; the game's own fonts, with a condensed face only on
the big results numbers. Choices are segmented selectors (one lit radio button per choice), never dropdowns. No glossy
panels, neon trim, reward-shop banners or new in-flight meters. The HUD keeps its own minimal language
([docs/04 § 6](04-art-and-experience.md)).

## The screens

- **Front screen:** credit and part capsules; the LAST WORLDS wordmark; CAMPAIGN and ENDLESS, each with a second line (the
  next mission, the best endless sector); the hangar as a showcase card (the equipped ship on its lit pad, its perk, and
  the main weapon with its level, special and shield); one icon row for Statistics, Settings and How to Play. It fits
  without scrolling on small phones.
- **Campaign page:** the mission carousel (a spinning planet preview, arrows and dots) with the world, the mission's name
  and description, a threat rating and the mission record; the difficulty selector; the EQUIPPED tiles (main, special,
  shield, ship), which open the hangar; the world's mission board below ([docs/35](35-missions.md)); and a full-width
  LAUNCH MISSION bar pinned to the bottom. Locked missions show a dimmed planet and a disabled launch.
- **Endless:** one tap launches the standard start; no campaign selection reaches it.
- **Hangar** (from the front screen or the campaign page): EQUIPPED shows the ship on its pad and its perk; four slot tabs
  (Main, Special, Shield, Ships) with the armory below. A scope line says where the open slot flies: ships are CAMPAIGN AND
  ENDLESS (ship, perk and looks); the other slots are CAMPAIGN ONLY (endless flies the Shockwave and the starter gear).
  Items show their price in credits and parts and BUY, EQUIP or EQUIPPED; main weapons show their five numbered levels
  ([docs/30](30-campaign-progression.md)); Ships opens the shipyard with part designs and paint ([docs/31](31-hero-ships.md)).
- **Statistics:** the flight log with Endless and Campaign tabs ([docs/09](09-objectives-and-statistics.md#4-statistics-screen)).
- **Settings:** grouped into Audio (sound on or off, plus the music and effects levels from `src/audio/settings.ts`),
  Display (Graphics High or Low) and Controls (Steering: Halves, Drag or Tilt, shown on touch devices). Reachable from the
  front screen and from pause; browsing settings never resumes a paused flight.
- **How to Play:** the flight manual (steer, line up, break through).
- **Pause:** resume (after a three-second countdown), settings, the visible missions with this run's progress, and quit.
- **Results:** score or credits and parts earned with the payout breakdown, missions completed (a tap on one opens that
  world's board), any mission just unlocked; retry or menu. The results arrive over an ending afterglow: the lost ship's
  explosion in slow motion, or the victorious ship jumping to hyperdrive.

Back and Escape return one level, with focus on the button that opened the page. Selectors and the statistics tabs
support arrow keys; pages scroll on small screens.

## The in-flight HUD

Lives as ship silhouettes and shield glyphs, top left; one line under them for mission notes; the endless score or the
campaign's live credit counter (pulsing when a reward lands) and the pause control, top right; the plain special button
at bottom centre with its recharge ring and the equipped special's glyph; boss names and phase hints (hints only on Luna,
`showsHints` in `src/content/missions.ts`); the boss meter (`src/ui/boss-meter.ts`). Steering hints blink for the first
three seconds. A rotate notice covers a phone turned sideways and pauses the flight.

## Development overlays

`?perf` shows a frame-time overlay (`src/ui/perf-overlay.ts`) and adds a frame-log export to the results screen
(`src/ui/perf-log.ts`), for measuring flights on phones ([docs/36](36-mobile-performance.md)).

## Validation

`tests/browser/menu.spec.ts` (navigation, focus, purchases, levels, settings), `missions.spec.ts`, `viewport.spec.ts`
(phone sizes, safe areas, landscape, desktop fitting), `tests/ui/flight-log.test.ts`, `tests/ui/mission-notes.test.ts`.
Desktop Chromium at phone sizes does not establish real iPhone or Android ergonomics.
