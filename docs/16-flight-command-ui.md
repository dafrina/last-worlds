# Flight command UI

15 October 2026 · isolated menu/statistics increment, on top of the World session's gameplay work.

## Implemented navigation

- **Home:** Campaign Flight, Endless, then the Hangar (since 31 October, below), Statistics, Settings; How to Play is a quiet footer link.
- **Campaign:** dedicated preparation page with mission, difficulty and the existing main-weapon selector. Special, shield and reactor show the actual fixed prototype equipment. Launch starts the same simulation configuration as before.
- **Endless:** one-tap launch using the existing canonical starter. Menu selections and flight-log data cannot change its config.
- **Statistics:** separate Endless and Campaign tabs, lifetime counts, recent flights, best finalized endless score/sector, and campaign clear count/rate.
- **Settings:** sound and graphics, plus the control guide. Available from Home and Pause. Back returns to the calling page; browsing settings never resumes a paused flight.
- **Pause/results:** retain their gameplay actions with shorter text. Resume still uses the existing three-second countdown.

Back/Escape returns one level. Keyboard focus returns to the originating navigation button. Statistics tabs support arrow keys and Home/End; only the selected tab participates in Tab navigation. Pages scroll on small screens, while Home fits without scrolling at the checked phone sizes.

## Visual direction

Deep navy (`#081426`), cool off-white, pale blue action buttons, restrained rules and a small original SVG orbital illustration. Keep the existing strong wordmark and plain arcade button language. No animated nebula, glossy panels, neon trim, or new in-flight meters. Protection glyphs, centered special button, steering areas and HUD positions retain their existing behavior.

Home contains navigation, not a manual. Move controls into How to Play, settings into their own screen, and mission/equipment information into Campaign. Avoid adding feature explanations or status paragraphs back to the title screen.

## Where the full campaign will fit

**Built 16 October 2026:** Missions (with unlocks), the Loadout summary and the Hangar (store and equip) now live inside Campaign; see [campaign progression](21-campaign-progression.md). Assignments remain future work.

**The Hangar moves to Home, 31 October 2026** (user: "move the hanger to the front screen, so we have endless, campaign and a section below for hangar since its not only for campaign anymore"). Since 30 October the chassis, its perk and its looks fly in endless too ([global ship perks](34-global-ship-perks.md)), so the Hangar is no longer a campaign-only destination. This replaces "keep these campaign destinations inside Campaign" below for the Hangar only.
- **Home:** below Campaign Flight and Endless, one plain Hangar entry that names the equipped ship and its perk (`SCRAPPER · SALVAGE RIG`). Focus order: Campaign Flight, Endless, Hangar, Statistics, Settings, How to Play. Home still fits unscrolled at 320 × 568 (a smaller orbit drawing below 620 px of height).
- **Campaign:** the loadout summary keeps its shortcut to the Hangar, for changing gear before a launch.
- **Back / Escape** returns to whichever page opened the Hangar, with focus on the button that opened it.
- **Which mode:** under the slot selector, one line says where the open slot flies. Main, Special and Shield: `CAMPAIGN ONLY · ENDLESS USES STARTER GEAR`. Ships: `CAMPAIGN AND ENDLESS · SHIP, PERK AND LOOKS`. Credits, parts, purchases and ship unlocks stay campaign economy, and endless still never writes the profile (`endlessConfig`).

When those systems exist, Campaign becomes the campaign hub, with **Missions**, **Loadout**, **Store**, and **Assignments** below its heading. Keep these campaign destinations inside Campaign, rather than adding all of them to Home. Do not add dead Store or purchase buttons before the economy exists.

| Future destination | Contents | Entry/return behavior |
| --- | --- | --- |
| Missions | Planet/mission selection, difficulty, launch | Current Campaign setup evolves into this view |
| Loadout | Main, special, shield tech, handling reactor | Current four-slot summary opens the full editor; return preserves mission selection |
| Store | Owned/purchasable equipment and one campaign credit balance | Accessible from Campaign or a loadout slot; returning restores the selected slot |
| Assignments | Observational contracts and career milestones | Campaign rewards only; no changes to combat mechanics |
| Statistics | Mode-specific history, later difficulty filters and mission records | Remains a top-level destination, without a combined progression total |

No store, credit wallet, new equipment behavior, side missions, or campaign unlocks were implemented in this pass. The UI depends only on the existing `UiActions`/`RunState` contracts. Future purchase/save logic belongs in the campaign progression system, not in these menu handlers.

## Current flight-log contract

`src/ui/flight-log.ts` observes run counters and never mutates simulation, spawns, input, scores, rewards or configuration. Data uses `last-worlds.flight-log.v1` in localStorage, with schema/version identification and ruleset `prototype-2026-10-15`.

- Counts begin with this build; there is no fabricated history or reconstruction of previous play.
- Active time, hostiles down, lives lost and specials used checkpoint every ten simulation seconds, at pause, and on page hide/disposal. Counts use deltas; reopening pause/results cannot count a run twice.
- Lost and completed flights finalize automatically; returning to Home/retrying finalizes an unfinished flight as retired. Refresh/crash leaves the last known checkpoint labeled interrupted. Unexpected process termination can lose up to ten seconds of observation.
- Interrupted runs contribute known cumulative activity but never best score/sector, longest finalized flight, a clear, or the campaign clear-rate denominator. Failed and intentionally retired campaign attempts count in that denominator.
- Aggregate counters remain separate by mode. Keep the last 50 summaries overall; display the latest three for the selected mode. Campaign records include the chosen difficulty. No campaign currency or progression is stored here.
- Best scores are local personal records, not an online or tamper-resistant leaderboard. This is the initial prototype ruleset; a future incompatible ruleset requires explicit migration/archiving instead of mixing scores.
- Unreadable/unknown saves are retained byte-for-byte. New observations remain session-only with a visible explanation. Blocked writes also fall back to session-only statistics.
- Late-attached visual fixtures are excluded. Unit tests use injected memory storage; browser tests use isolated browser contexts.

The full statistics design in `09-objectives-and-statistics.md` is still broader: difficulty filters, mission best times, aircraft/ground/boss classification, objective receipts, top-ten history, import/export and reliable campaign economy transactions remain later work. This observer must not become the reward ledger.

## Validation

See the UI section in `build-status.md` for completed automated checks and screenshot evidence. Desktop Chromium phone-sized viewports do not establish actual iPhone/Android ergonomics or performance. No independent deployment is part of this isolated pass.

**Responsive layout update, 16 October 2026:** the phone frame now fills the live viewport height instead of letterboxing to 9:16. Safe-area padding protects the HUD, special button and menu pages. Desktop stays centered and portrait; side rails yield space in narrower windows. Camera projection expands the foreground without stretching ships or changing the approaching-enemy view; see docs/10 and the latest build-status entry.
