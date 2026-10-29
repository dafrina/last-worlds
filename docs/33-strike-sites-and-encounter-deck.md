# 33 · Strike sites and the encounter deck

Status: planned 29 October 2026; three parallel workstreams (§ 5). Decisions: docs/08, 29 October (strike sites, parts,
encounter deck, endless cosmetics).

## 1. Why

User, 29 October:
- "rework the events and random (or not so random) messages that currently always say 'something west or lone
  interceptor east'";
- "special locations can pop up. Like an airfield on khepri/moon/vesper or a spaceport on the more exotic planets. I want a
  dozen or so of these special buildings/infrastructure locations that can be attacked for parts. Parts will be like the
  coins but much rarer and we buy ship parts with them";
- "Do you think it could make sense not to hardcode script the sequence? Every play would be a little different".

Today every mission and endless stage is one fixed cue list (src/content/encounters.ts): the same squadrons at the same
times, and the same two or three side routes (`… · WEST`, `… · EAST`) with the same messages. Endless replays its three
stage lists on every planet visit.

## 2. Decisions (user, 29 October)

- **Parts** are a second currency, **campaign only**. Ship designs B–E cost **parts plus credits**; credits still buy
  weapons, specials, shields and chassis. Parts are banked with the attempt, a failed one included, as credits are.
- **Strike sites** appear in both modes, as optional side routes. In endless a parts site drops a power cell and a score
  bonus instead (no progression in endless, AGENTS.md invariants 6 and 13).
- **Endless flies the ship's cosmetics** (user: "we can take on the cosmetics of the ship for endless, but the weapons will
  be default tier"): the campaign's equipped chassis model, designs and paint. Endless keeps its own starter loadout and
  handling: default weapons, no chassis perks, the same hit region. This replaces "endless always flies the default
  Scrapper" (AGENTS.md invariant 14).
- **Models:** Claude models the sites by hand in Blender ("just model them yourself. They dont need to be amazing and the
  existing infra is good inspiration"). The user may add concepts from art/concepts/strike-sites/PROMPTS.md.
- **Encounter deck, not a fixed script** ("Work on both"): the arc stays authored, each slot draws an authored wave from a
  pool by a seeded roll per attempt (§ 4). This narrows invariant 8: waves and attacks stay authored, never assembled
  from parts; only their order and their variations are drawn.

## 3. Strike sites

Twelve sites in families by builder, each one model with a finish per world.

| # | Id | Site | Worlds | Target | Loot (campaign) |
| --- | --- | --- | --- | --- | --- |
| 1 | `crash-site` | Crash site | all six | the freighter's reactor | parts |
| 2 | `airfield` | Airfield | luna, khepri, vesper | control tower cab | parts |
| 3 | `salvage-yard` | Salvage yard | luna, khepri, vesper | core on the crane hook | parts ×3, rare |
| 4 | `shield-depot` | Shield depot | luna, khepri, vesper | generator under the dome | shield cell |
| 5 | `relay-station` | Relay station | luna, khepri, vesper, amnion (overrun) | the dish's feed horn | credits |
| 6 | `freight-terminal` | Freight terminal | luna, khepri, vesper, amnion (overrun) | weapons container | weapon |
| 7 | `dark-spaceport` | Dark spaceport | umbra, nacre (ruin) | crystal at the spire | parts |
| 8 | `prism-reactor` | Prism reactor | umbra, nacre (ruin) | the floating crystal | shield cell |
| 9 | `sealed-vault` | Sealed vault | umbra, nacre (ruin) | three seal crystals | parts ×3, rare |
| 10 | `gate-ring` | Gate ring | umbra, nacre (ruin), amnion (brood-crusted) | the membrane core | power / weapon |
| 11 | `brood-hive` | Brood hive | amnion, nacre | the heart-sac | parts |
| 12 | `spawning-pool` | Spawning pool | amnion, nacre | the pod on the stalk | shield cell |

**Amnion (user, 29 October: "theres also not a lot for amnion"):** the brood has overrun the relay station, the freight
terminal and a gate ring there. Same models, with one shared set of bone, chitin and resin growths over them.

**Concepts:** `art/concepts/strike-sites/00-all-sites.png` (the user's sheet, one world each; the user: "derive" the other
world finishes from it). Row by row: crash site (Khepri), airfield (Luna), salvage yard (Khepri), shield depot (Vesper);
relay station (Luna), freight terminal (Vesper), dark spaceport (Umbra), prism reactor (Umbra); sealed vault (Nacre ruin),
gate ring (Umbra), brood hive (Amnion), spawning pool (Nacre).

Rules:
- **Optional.** A site is a side route off the mandatory battle, world-anchored about 7.5 units out (west or east, drawn).
  It is never needed to survive (invariant 5), and the main battle keeps its safe path.
- **Authored defence.** Each site has its own authored guard (existing enemy kinds: turrets, missile batteries, darts,
  and so on), heavier for parts sites. One small authored flourish each is welcome (the airfield scrambles a dart pair).
- **The target** is the site's core: a ground target with an explicit proxy, like a battery. Its death drops the loot and
  sets off the site's destruction effect. Scenery around it never blocks shots (invariant 4).
- **Messages** are the site's own (`AIRFIELD · WEST`, `CRASH SITE · EAST · PARTS`), not the generic side-route text.
- **Shield cells** from sites count inside the existing shield-supply budget (invariant 11): a shield site replaces a
  budgeted supply in its stretch rather than adding one.
- **Readable at phone size:** a bold silhouette, roofs under the flight plane (docs/25 rule 3), about 4–6 units across,
  the target visible from the 55° camera (docs/25 rule 2).

Economy (provisional, to be measured with the test pilot): designs cost B 1 part + 80, C 1 + 160, D 2 + 240, E 3 + 320
credits; a parts site drops 1 part, a rare one 3. Report parts per mission (Standard, perfect pilot collecting) before
fixing the numbers.

## 4. Encounter deck

The director (src/sim/game.ts `updateDirector`) keeps consuming a concrete `EncounterCue[]`. What changes is where that
list comes from:

- **Template:** each campaign mission and endless stage is an authored list of **slots**: fixed cues (Training's
  teaching steps, boss approaches, set pieces), and pool slots by phase (`pressure`, `climax`, `recovery`/side).
- **Pools:** authored waves per world family and phase, each with a threat cost and allowed variations (mirror, a
  small lateral offset). Side slots draw strike sites (§ 3) from the world's site pool, weighted by rarity.
- **Resolve:** `resolvePlaylist(config, sector, seed)` expands a template into `EncounterCue[]` with a dedicated seeded
  stream (never `Math.random`, never the combat stream). The same seed always gives the same list. Endless resolves per
  sector.
- **Guard rails:** no wave twice in a row, a per-slot threat budget so two heavy waves never stack, and every pool wave
  passes the existing admission and fairness checks.
- **Balance:** the test pilots (tests/sim/pilots.ts) fly many seeds per mission; difficulty and payouts must stay within
  a band, not match one number.
- Training's teaching order stays fixed.

## 5. Workstreams and file ownership

Three agents, each in its own git worktree, merged by the integrator (Claude Code main session), who owns the release
gate and the deploy. Shared contracts are created first by the integrator (below); a workstream that needs a contract
changed asks the integrator instead of editing it.

| Workstream | Owns |
| --- | --- |
| **A · Deck** | `src/content/encounter-deck.ts` (new), `src/content/encounters.ts`, `updateDirector` and playlist resolution in `src/sim/game.ts`, deck tests and the seed-sweep balance tests |
| **B · Sites (simulation, economy, UI)** | `src/content/sites.ts`, site cores, loot and pickups in the simulation (enemy death and pickup collection in `src/sim/game.ts`, not the director), `src/campaign/profile.ts` (parts balance, save migration, prices), `src/content/hero-parts.ts` prices, hangar and results UI, endless cosmetics (`createRun`, renderer `heroOf`) |
| **C · Sites (models, render)** | `tools/blender/strike_sites.py` (new), `public/assets/shared/sites/` (new), `src/render/site-view.ts` (new), its hook in `src/render/scene.ts`, terrain clearings for sites, art/strike-sites review sheets |

Shared contracts (integrator, before the workstreams start):
- `SiteId` and `SITE_IDS` (src/shared/contracts.ts);
- `Enemy.site?: SiteId`, marking a site's core target;
- `EncounterCue.site?: { id: SiteId; side: -1 | 1 }`;
- `Pickup.kind` gains `'part'`;
- `src/content/sites.ts`: `SiteDefinition`, `SITES`, `sitePool(planet)`, `siteCue(id, side, at, planet)`. It starts as
  placeholders; B fills them in, and A calls them from side slots.
