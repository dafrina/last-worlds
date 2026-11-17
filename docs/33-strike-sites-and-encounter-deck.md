# Strike sites and the encounter deck

Strike sites are optional side-route targets, each with an authored guard and a core whose death drops loot (in the
campaign, often a part); the encounter deck turns each authored mission and endless arc into a slightly different cue
list per attempt. This doc covers both: the decisions behind them, the fifteen sites and their loot, the deck's slots,
pools and guard rails, how they are validated, and the site models and their rendering. The director that flies the cues is
[docs/03 §6](03-worlds-and-generation.md#6-encounter-deck-and-director).

## 1. Overview

The user asked for both on 29 October: "rework the events and random (or not so random) messages that currently always
say 'something west or lone interceptor east'"; "special locations can pop up. Like an airfield on khepri/moon/vesper or a
spaceport on the more exotic planets. I want a dozen or so of these special buildings/infrastructure locations that can
be attacked for parts. Parts will be like the coins but much rarer and we buy ship parts with them"; and "Do you think it
could make sense not to hardcode script the sequence? Every play would be a little different". Before, every mission and
endless stage was one fixed cue list with the same side routes and messages on every flight.

- **Strike sites** (§3) replace the fixed side routes: each world has a pool of sites with its own guards, models,
  messages and loot.
- **Parts** are the rare second currency they drop in the campaign.
- **The encounter deck** (§4) keeps every arc authored but draws, per attempt, which authored wave flies in a pool slot,
  its mirror image, and which strike site stands where.

## 2. Decisions

The user's decisions of 29 and 30 October ([docs/08](08-decisions-and-sources.md), 29 and 30 October):

- **Parts are a second currency, campaign only** (the design decision invariant 7 asks for). Parts, alone or with
  credits, buy ships, ship designs, weapon levels and specials; the prices are in
  [docs/30](30-campaign-progression.md#the-shop). Parts are banked with the attempt in full, whatever its outcome. World
  missions pay parts too ([docs/35](35-missions.md)).
- **Strike sites appear in both modes** as optional side routes. In endless, where nothing is earned for the campaign, a
  parts site drops a power cell and a score bonus instead (invariants 6 and 13).
- **Endless flies the ship's cosmetics** (user: "we can take on the cosmetics of the ship for endless, but the weapons will
  be default tier"): the campaign's equipped chassis, its part designs and paint (`endlessConfig` in
  `src/campaign/profile.ts`), while weapons, special and shields start from `ENDLESS_LOADOUT`. Since 30 October the
  chassis perk applies in endless too ([docs/42](42-specials-and-perks.md)).
- **The sites are modelled by hand in Blender** (user: "just model them yourself. They dont need to be amazing and the
  existing infra is good inspiration"). The user's concept sheet `art/concepts/strike-sites/00-all-sites.png` shows each
  site on one world; the other finishes are derived from it.
- **An encounter deck, not a fixed script** ("Work on both"): the arcs stay authored; only which authored wave flies in a
  slot, its variation and the sites are drawn. This narrows invariant 8: waves and attacks are never assembled from parts.
- **Sites per mission** (30 October: "keep sites 1-4, with 2 being most probable"), **a part roll on every site**
  ("Every site rolls"; lowered on 31 October: "parts drop a bit too much, lower it to 0.2-0.6") and **a deck no harder than
  the fixed lists** ("Tune those down").

## 3. Strike sites

### 3.1 The sites

`SITES` in `src/content/sites.ts` is the single source: worlds, draw weights, guards per world, cores and loot. The ids are
`SITE_IDS` in `src/shared/contracts.ts`.

| Site | Worlds | Target | Guard | Campaign loot | Endless loot |
| --- | --- | --- | --- | --- | --- |
| Crash site | every world | the freighter's reactor in the break | turret trio and a weaver (Luna, Khepri); missile trio and a Needle (Vesper); mixed trio and a weaver (the others) | part roll | power cell + score |
| Airfield | Luna, Khepri, Vesper, Corona | the control tower's glazed cab | turret trio and a **scrambled dart pair** (Luna, Khepri); missile trio and a Needle (Vesper); mixed trio and the scramble (Corona) | part roll | power cell + score |
| Salvage yard (rare) | Luna, Khepri, Vesper | the pod on the gantry's hook | turret ring of four and a dart arrowhead (Luna, Khepri); missile trio and a Diamond (Vesper) | 3 parts | power cell + triple score |
| Shield depot | Luna, Khepri, Vesper | the generator drum under the field dome | turret pair (Luna, Khepri); missile pair (Vesper) | shield cell, part roll | shield cell |
| Relay station | Luna, Khepri, Vesper, Amnion | the dish's feed horn | turret pair and a dart (Luna, Khepri); missile pair (Vesper); turret and missile battery and a dart (Amnion) | credits, part roll | score |
| Freight terminal | Luna, Khepri, Vesper, Amnion | the lit weapons container | turret trio (Luna, Khepri); missile trio (Vesper); mixed trio (Amnion) | credits, part roll | the next main weapon |
| Dark spaceport | Nacre, Umbra | the crystal in the spire's face | mixed trio and a Needle | part roll | power cell + score |
| Prism reactor | Nacre, Nahara, Umbra | the floating crystal (it turns) | turret and missile battery | shield cell, part roll | shield cell |
| Sealed vault (rare) | Nacre, Nahara, Umbra | three seal crystals | a wide ring of two turrets and a missile battery, and a Diamond (a Relic Shield on Nahara) | 3 parts | power cell + triple score |
| Gate ring | Nacre, Amnion, Nahara, Umbra | the membrane in the ring | turret and missile battery and a weaver | shield cell, part roll | power cell |
| Brood hive | Nacre, Amnion | the heart-sac under the ribcage | mixed trio and a weaver | part roll | power cell + score |
| Spawning pool | Nacre, Amnion | the pod on the stalk | turret and missile battery | shield cell, part roll | shield cell |
| Star Extractor | Corona | the plasma chamber over the bore | mixed trio and a Needle | part roll | power cell + score |
| Star Cage | Corona | the captured star | turret and missile battery | shield cell, part roll | shield cell |
| Step Temple | Nahara | the crystal eye over the summit | mixed trio and a weaver | part roll | power cell + score |

A mixed trio is two turret batteries and a missile battery (`site-mixed-3`); the guard formations are the "Strike sites"
block of `src/content/formations.ts`.

Each world's pool (`sitePool`): Luna, Khepri and Vesper fly the six frontier sites; Nacre the crash site and the six
ancient and brood sites; Amnion the crash site, the overrun relay station and freight terminal, the gate ring, the brood
hive and the spawning pool (user: "theres also not a lot for amnion"); Corona the crash site, the airfield and its own
two ([docs/37](37-corona-dying-star.md)); Nahara the crash site, the prism reactor, the sealed vault, the gate ring and
the Step Temple ([docs/39](39-nahara-silent-empire.md)); Umbra the crash site and the four ancient sites. The draw weights
(`SiteDefinition.weight`) make the salvage yard and the sealed vault rare, and the Star Extractor and the Step Temple the
most likely on their worlds.

### 3.2 Rules

- **Optional.** A site is a side route off the main battle, world-anchored `SITE_X` units out on a drawn side. It is never
  needed to survive (invariant 5), and the main battle keeps its safe path.
- **Authored defence.** Each site has its own authored guard of kinds its world already flies (tested), heavier for parts
  sites, light for shield sites, with one flourish each: the airfield scrambles a dart pair from its runway
  (`site-scramble`), the salvage yard calls in a dart arrowhead or a Diamond, the sealed vault a heavy, others a fighter or
  an interceptor.
- **The core** is the site's target, formation `site-core-<site>`: a harmless ground target of kind `fuel` with an explicit
  proxy that never attacks, ranks after armed targets and costs no threat. `spawnMembers` (`src/sim/spawn.ts`) gives it the
  site's id (`Enemy.site`), hit points (`SiteDefinition.core`, times the difficulty's or endless ramp's hp scale), radius
  and core height. It never bursts like a fuel skid and drops no credits of its own. The sealed vault has three seals; its
  loot drops with the last one. Scenery round a core never blocks shots (invariant 4).
- **Readable at phone size:** a bold silhouette inside `SITE_FOOTPRINT`, roofs under the flight plane, the core in sight
  of the 55° camera ([docs/25](25-modular-facilities.md)'s line-of-sight and height rules).

### 3.3 Layout and seats

- **The track.** A site rides its own ground track (`SITE_TRACK` in `src/content/formations.ts`), `SITE_LEAD` units further
  out than a battery's, so the whole site scrolls in from beyond the top edge; the director can lead it further like any
  ground formation. Guards stand on rings round the core (`RING_2`, `RING_3`, `RING_4`, `RING_VAULT`), outside every
  site's footprint and at least the airspace separation from the core, within reach of the ship. Each guard's first
  windup waits until it is fully in view.
- **The seat** (`siteSeat` in `src/sim/sites.ts`). As a site's core spawns, a pure search (the run's terrain and that tick's
  camera, never randomness) picks the most even dry ground near the authored place: a small window (`SEAT_SEARCH`) and,
  only if the best seat there would straddle a cliff, a trench or a pit (`seatRough`), a wider one (`SEAT_WIDE`) if it is
  clearly better. It takes only seats whose footprint keeps every guard battery `GUARD_CLEARANCE` outside it
  (`guardSpots`). Moving the core toward the camera costs extra (`SEAT_BACK_COST`): a core run ahead of its guards' ring
  was killed while they still fired, and its part fell under their fire. Tall sites prefer lower ground (`seatHigh`,
  `SEAT_LIMIT`); foundations fill drops down to `siteDropMax` (deeper on Corona, down to the plasma). On Nacre's mire a
  site may stand in the shallows (`WET_WORLDS`).
- **The floor** is the footprint's 95th-percentile height; the core rests on it (`seatCore`), so its gameplay position is
  where its model draws it. The guards keep their authored places and timing, so the cue is exactly as fair as authored.
  What unevenness remains, the render's site pad levels (§6).
- **Fairness.** Every site cue passes the formation fairness tests at every scale and mirror. The offline validator
  (`tests/sim/fairness-trace.ts`) treats a site's core and its own guard ring as one authored layout, so it does not
  require airspace separation between them (under the release lens, ground seats near the bottom of the view come up to
  a unit closer than authored); the guard keeps the rule against every other squadron.

### 3.4 Loot and parts

When a site's last core falls (`destroySiteCore` in `src/sim/sites.ts`) the site counts as destroyed, scores `SITE_SCORE`,
and drops its loot where that core stood:

- **Part roll** (campaign only): every site rolls for one part (`sitePartChance`), with a chance linear in its guard's
  threat on that world between `PART_CHANCE.min` (threat `minThreat`, the lightly guarded shield sites) and
  `PART_CHANCE.max` (threat `maxThreat` and above, the parts sites). The part drops beside the core. The salvage yard and
  the sealed vault roll nothing and drop their guaranteed parts (`loot.value`) side by side. The roll is its own hash
  (`partRoll`: run seed, sector, site and how many sites the run had destroyed), never `Math.random` and never the loot
  stream.
- **Parts** are one pickup each (`Pickup.kind` `'part'`, an orange octagon with a cog), counted in `RunState.parts` and
  banked with the attempt (docs/30). Endless never drops one.
- **Shield cells** stay inside the shield-supply budget (invariant 11): a shield site's cell is a budgeted supply
  delivered early, never an extra one. It claims the next supply still to come in the mission (`shieldSupplies` of the
  mission's boss for the difficulty; endless: this sector's, else the next sector's), and that supply is then skipped
  (`RunState.sites.shieldClaims`, `supplyClaimed`). With none left to take, the site pays `SHIELD_FALLBACK_CREDITS` in the
  campaign or `SITE_SCORE` in endless.
- **Credits and weapons:** campaign weapons and levels are bought, never picked up ([docs/30](30-campaign-progression.md)),
  so the relay station and the freight terminal pay credits and the gate ring a budgeted shield cell (user: "Credits on
  campaign instead of power is fine but you can also drop shields"). In endless the freight terminal drops the next main
  weapon in `WEAPON_IDS` order and parts sites a power cell plus `ENDLESS_PART_SCORE` per part.
- Loot is never lost to the pickup ceiling: when it is full, the oldest credit drop makes room.

### 3.5 Messages and statistics

- **Messages** are the site's own (`siteMessage`), naming the side and what it drops in the run's mode, with `PARTS` added
  in the campaign when the site rolls for a part: `AIRFIELD · WEST · PARTS`, `SHIELD DEPOT · EAST · SHIELD · PARTS`,
  `RELAY STATION · EAST · BONUS` (endless). The HUD colours the loot words in their pickup icons' tints
  (`src/content/pickup-tints.ts`).
- **Announcement:** a site is announced only when it is the next cue and would be admitted now, a short lead before its
  ground entry (`SITE_NOTICE_LEAD` in `src/sim/game.ts`; user, 14 November: "it tells me theres a site but then nothing
  follows").
- **Statistics** (observation only, invariant 13): the flight log counts sites destroyed per mode (`FlightTotals.sites`,
  `FlightRecord.sites` in `src/ui/flight-log.ts`), and side missions see a `site` event.

## 4. Encounter deck

`src/content/encounter-deck.ts` holds every arc and its pools; `src/content/encounters.ts` keeps the shared types
(`EncounterCue`, `FormationPlacement`, `PacingPhase`), `f()`, `cueRoster` and `cueAlert`. The director asks for the run's
list every tick (`resolvePlaylist(config, sector, seed)`, memoized in a small bounded cache outside the run state) and
admits its cues in order ([docs/03 §6](03-worlds-and-generation.md#6-encounter-deck-and-director)).

- **Arcs** are authored lists of slots following the pacing arc (introduction, pressure, recovery, pressure, climax,
  recovery):
  - `fix(cue)` flies as written: every introduction, every cue with a message (teaching steps, set pieces, power-cell and
    weapon opportunities) and every relief;
  - `draw(cue, rank?)` is a pool slot: its cue's formations are the slot's nominal wave, which fixes its role (an air
    squadron or ground batteries), its attack character and its threat cost; its pickup stays with the slot;
  - `side({ at, id, pickup?, rank? })` is a strike-site place.
- **Pools** (`DECK_POOLS[world][phase]`) are authored waves (`w(...)`) per world and phase: one air squadron, or ground
  batteries with optional harmless skids, built only from formations and kinds the world already flies.
- **Resolve:** `resolveDeck` walks the arc with its own seeded roll, keeping fixed cues, drawing a fitting pool wave for
  each pool slot and a site for each site place. The same seed always gives the same list; endless resolves each sector
  anew, so a later visit to a stage differs.
- **Reinforcements:** in campaign missions with `MISSION_PRESSURE.reinforce`, `reinforced` follows a share of the pressure
  and climax air squadrons with the same squadron mirrored two seconds later (above 1, a third as authored two seconds
  after that). Lone squadrons (a Pulsar, a Wraith), diving formations, beam craft and site cues are never reinforced. The
  director admits each follower on its own ([docs/11](11-campaign-difficulty.md), [docs/40](40-balance-measurement.md)).

### 4.1 The deck as built

**Templates.** `CAMPAIGN_DECKS` holds the eight missions' arcs, each lengthened by an authored sortie stretch (`extend`).
`ENDLESS_DECKS` holds the Luna prologue and each world's opening, pressure and peak stages (`endlessTemplate` picks one by
sector: opening and pressure on a world's first stint, peak on later visits). The late worlds' stages are cut from their
mission arcs (`lateStages`). Every campaign arc, the prologue and each world's opening are **teaching arcs**: a pool slot
whose nominal introduces a formation flies it as authored, and draws use only formations already introduced, so
squadrons appear in their authored order and Training's teaching sequence is the same on every seed.

**Strike sites per run.** In the campaign the attempt first draws its site count (`SITE_COUNT`: one to four, two the most
likely) and flies the first that many of the arc's four ranked site places. A place is a **side** slot (an empty relief
when unused) or a **stand-in**: a pool slot whose ground battery the site replaces when used, so the arc's pressure stays
as authored; unused, it draws as usual. A site standing in for a battery that introduced a formation moves that
introduction to the battery's next slot. The places, with times after the sortie stretch (from `CAMPAIGN_DECKS`, checked 17
November):

| Mission | Rank 1 | Rank 2 | Rank 3 | Rank 4 |
| --- | --- | --- | --- | --- |
| Training | 39 s side (teaches the side route) | 63 s for `battery-3` | 85 s for `battery-3` | 44 s side |
| Rolling Thunder | 64 s for `battery-3` | 84 s for `depot-3` | 16 s for `battery-3` | 106 s for `battery-4` |
| Cold Vector | 48 s side | 75 s for `missile-3` | 101 s for `missile-3` | 53 s side |
| Deep Bloom, Brood Strike, Dying Star, Silent Empire, Final Horizon | 51 s side | 74 s for `depot-missile` | 95 s for `missile-2` | 142 s for `missile-3` |

Rolling Thunder's 41 s recovery keeps the old salvage route's credits but no site: an airfield there, with its scrambled
darts, sealed the lanes together with the fixed fuel depot just after it. The late arcs hold one side place in their
recovery, not two: two sites back to back held the threat budget until the next pressure block arrived on top of them,
the pilot still out at a site. Two sites within `SITE_CALM` seconds stand on opposite sides (two on one side ran into each
other's ground). Endless flies one site per stage, with two in the Luna prologue (Training's two side places).
Khepri's stages stand it in for a turret battery (`endlessSite`): a side-route site there, with Khepri's Lancer ace
following the ship to the side, pinned the pilot at the world edge. Vesper's stages use a side place, as do each late
world's opening and peak; its pressure stage has none (that stretch has no recovery to hold one).

**Pools and variations.** A wave flies at its slot's centre or as its validated mirror image. Lateral offsets were
measured and dropped (30 October): a wave shifted toward the world edge while the ship was out there closed it in;
`w(…, { offsets })` still lets a wave opt in. The pools carry no Pulsar or Wraith wave.

**Guard rails** (`resolveDeck`):

- a draw has the nominal's role and **attack character** (`waveCharacter`: fighters, beams, heavies, Pulsar, Wraith; turret
  or missile batteries on the ground). The arcs pair characters deliberately, a Pulsar's tracking stream beside missile
  batteries and never beside aimed turrets, so the deck varies the formation and its mirror, never what a stretch asks of
  the pilot;
- it costs between `BAND.low` and `BAND.high` times the nominal, at the Standard rank and, for the upper bound, at the
  Veteran rank too: a draw never asks more than the wave the arc authored there;
- it uses only formations its own arc flies (teaching arcs: only those already introduced);
- no wave twice in a row, nor the same as the next fixed cue, and where the pool allows not the same as the last wave of
  its role; no site twice in a row;
- cues within `PAIR_WINDOW` seconds cost together no more than the arc's nominal pair (at least `PAIR_FLOOR`), so two heavy
  waves never stack beyond what the arc authored;
- the wave after a strike site fits the Standard threat budget beside the site's guard where the pool allows
  (`SIDE_WINDOW`);
- a Pulsar's or a Wraith's stretch (`SCARCE`) flies exactly as authored: their own slots and every slot within
  `PAIR_WINDOW` of one fly their nominal (a third missile battery or a mirrored Pulsar pair drawn there pushed the pilot to
  the world edge, where the stream caught it);
- after a Needle column (`LINGERING`), the next air cue is no Needle squadron and the next site has no air guard: the
  column's last members lock their beam lanes as their path ends, which the airspace prediction cannot foresee;
- on Vesper a draw keeps its slot's side of the alternation between laser flocks and laser-free squadrons
  ([docs/17 §5](17-vesper-glass-frontier.md#5-cold-vector-and-the-helion-ark));
- a slot with no fitting wave flies its nominal; where the nominal would repeat the previous wave, it draws a wave of its
  role and band of another character instead, never one with a scarce kind.

**The roll** is its own stream: mulberry32 over a hash of the run seed, the template id and, in endless, the sector
(`deckSeed`), used by nothing else; never `Math.random`. Reinforcements and site part rolls use their own hashes.

**Adding a wave:** append `w('formation')` (or `w(['formation', 'fuel-pair'])`, with `weight`, `mirror`, `offsets`) to a
world's phase in `DECK_POOLS`. It is drawn wherever its role, character and cost suit a slot. A wave that is fair can
still pin the perfect pilot at the world edge, so measure it with the seed sweep (§5) before shipping.

## 5. Validation

- `tests/sim/encounter-deck.test.ts`: determinism and per-sector resolution; the authored arc kept (slot times, phases,
  fixed cues, mission lengths, boss cutoffs); the guard rails over many seeds (no repeats, the band and pair budget, the
  world's pool, teaching order, scarce kinds); roster faithfulness; every pool wave admitted into an empty sky at every
  rank and in view at its windups; one to four sites per campaign attempt and one per endless stage; sites on opposite
  sides within `SITE_CALM`; draws by weight; Vesper's laser alternation.
- `tests/sim/deck-balance.test.ts`: the six missions and nine endless sectors the deck first replaced complete without a
  lost life, their threat and credits within a band of the fixed lists' (baselines of 29 October).
- `tests/sim/sites.test.ts`: every site's guard on every world flies only that world's kinds; parts sites guarded heavier
  than shield sites; the cue, the core, the loot per mode, the sealed vault's last seal; shield sites inside the supply
  budget in both modes; the announcement before the guards enter.
- `tests/sim/site-seats.test.ts`: the seat search on every world (footprint spread, guards clear, the core on its floor
  under the flight plane, Corona mostly on rock) and its determinism.
- `tests/sim/site-economy.test.ts`: the perfect pilot clears Training with two parts sites; with `SITE_ECONOMY=<file>`, the
  economy sweep per site and mission.
- `tests/sim/fairness.test.ts`: every site formation in isolation at every scale and mirror; the campaign and endless
  fairness suites fly the resolved lists.
- `tests/sim/deck-report.test.ts`: the long seed sweep, off by default, one target per process:

  ```
  DECK_REPORT=<file> DECK_TARGET=mission:<id>|sector:<n> DECK_SEEDS=1-48 [DECK_PILOT=perfect|weaver|sites] \
    npx vitest run tests/sim/deck-report.test.ts
  ```

**Measured 30 October** (the six missions and nine endless sectors of the time, seeds 1–48, the perfect pilot with the three
main weapons): every mission, difficulty and endless sector stayed within the band of the fixed lists it replaced (their
hits plus 25% or plus one hit per 16 flights, whichever is larger); a pilot steering only for the main battle took as many
hits on the deck as on the fixed lists (47 against 47 over nine cells), so the sites add no danger to the main battle's
path. A site-hunting pilot banked about one part per mission at weapon level 1 and up
to 1.6 at level 3 (with the part chance then at its first, higher range); one who ignored the sites, a part every four to
ten missions. Current balance results are in [docs/40](40-balance-measurement.md).

## 6. Site models and render

### Models

`tools/blender/sites_strike.py` builds every site by hand from the boss and facility toolkit's faceted solids
(`lib_solids.py`, `lib_facility.py`): flat paints, ambient occlusion baked into the vertex colours, glow materials named
`*glow*`, shape over texture for the 55° camera. One GLB per site and finish (the world it stands on),
`public/assets/shared/sites/<site>-<finish>.glb`, so a world loads only its own.

| Finishes | Look |
| --- | --- |
| Luna, Khepri, Vesper (frontier) | White panels with amber (Luna); bone and rust with the concept's teal reactor (Khepri); white and graphite with blue glow, snow on roofs and aprons (Vesper). |
| Amnion (overrun) | The frontier sites under one shared set of brood growths (`brood_growths`: bone arches, chitin crusts, resin pools, egg clutches, spikes); the gate ring crusted the same way; the brood hive and spawning pool its own. |
| Nacre (ruin) | The ancient sites as pale overgrown ruins with teal crystals: missing and sunken blocks, snapped blades, moss, fronds, mire puddles. |
| Umbra | Glossy obsidian with violet seams, lifted off the dark ground. |
| Corona | Ancient machinery: carved stone with glyph grooves, ring gears, ribbed pumps, dark iron and oxidised bronze, texture-baked (`lib_solids.STYLES['corona']`; [docs/37 §5](37-corona-dying-star.md#5-strike-sites)). The airfield is the frontier model recoloured. |
| Nahara | Weathered sandstone with turquoise, texture-baked (`lib_solids.STYLES['nahara']`; [docs/39 §6](39-nahara-silent-empire.md#6-strike-sites)). |

The crystal cores (prism reactor, dark spaceport, sealed vault) are faceted `prism_glow` with a bright heart; the shield
depot's dome is a lit `field_glow` lattice; the relay station's dish is turned three-quarters to the camera so the bowl
reads (user, 30 October). A site costs less than one facility plant; only the Corona and Nahara finishes carry textures.

**Nodes and frame.** Each GLB holds `site_<id>_<finish>_body` (the site), `_core` (the target, hidden once destroyed) and
`_ruin` (the broken core with its scorch and debris, shown once destroyed), `<id>` with underscores. The pivot is the
core's ground point (the vault's centre between its seals); x lateral, s away from the camera, the detailed front toward
the camera; the core's centre stands `SITE_CORE_HEIGHT[site]` over the pivot (`src/content/sites.ts`; the simulation
anchors the core with it). The sealed vault's `_core` and `_ruin` are one seal, drawn at each seal.
`src/render/site-models.ts` (`SITE_MODELS`) is the single source of finishes and bounds: the builder parses it and checks
every node against it, and `tests/world/site-models.test.ts` checks the GLBs.

**Rules the builder and the tests keep:** inside `SITE_FOOTPRINT` and under the roof limit; rays from every core and from
the guard batteries' spots toward the camera never meet the site; nothing stands on a guard battery's spot (`RING_*`,
parsed from `src/content/formations.ts`); foundations reach below the pivot for uneven ground; visible coplanar faces are
separated (`separate_coplanar`). Every ruin carries the blast (`devastate`): a jagged scorch over the aprons, pale ash
streaks blasted out from the core, chunky debris and embers.

**Rebuild** (Windows Blender, headless; every path Blender sees is a Windows path):

```
cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
  --python '\\wsl.localhost\Ubuntu\home\davidfarina\Projects\alien-skies\tools\blender\sites_strike.py' -- [--site=airfield] [--finish=nahara] [--no-export] [--preview]
```

`--preview` renders every finish, intact and destroyed, from the game camera into `lookdev/strike-sites/`.

### Render

`src/render/site-view.ts` (render only; hooked into `src/render/scene.ts` before the enemies are drawn, and for the site
pads after):

- **Placement.** Every live enemy with `site` set and a ground anchor gets its site in the current world's finish, at its
  seat's floor, scrolling with the ground. The site draws the core, so `scene.ts` leaves out the core's own craft model,
  ghost silhouette, plinth and pontoon (`hidesCore`); a core never seats a compound or leaves a wreck. A finish that fails
  to load leaves its cores their own model.
- **Site pads** (`src/render/terrain-kit.ts`): the ground shader levels the terrain over each nearby site's rectangle to its
  floor, easing back across `SITE_PAD_BLEND`; the ground within `SITE_PAD_KEEP` of a guard battery stays as it is, so no
  battery floats or sinks. Over water or plasma the seabed fills only to just under the surface, so the site stands in the
  shallows. At most `SITE_PADS` pads and `SITE_PAD_KEEPS` kept batteries at once. Never terrain data or targeting.
- **Foundations** fill what the pad leaves under the floor, in the world's ground tone.
- **High ground:** a site whose top would still come too close to the flight plane is squashed about its core
  (`SITE_ROOF_CLEARANCE`, at most to `SQUASH_MIN`); a floating crystal keeps its shape.
- **Destroyed:** a core that vanishes with the simulation's kill explosion leaves its site destroyed (core hidden, ruin
  shown, the structure in darkened twin materials, `SITE_RUIN_SHADE`, lamps out, embers smouldering) until it scrolls out
  of view; a core that leaves without one leaves the site intact. A hit on a core flashes its glow.
- **Destruction** (user, 3 November: "a memorable destruction effect comparable in style to boss explosions, but scaled
  appropriately"; render only). In the frame the last core falls, the view hands `src/render/fx-particles.ts` the site's
  sequence in world space (`siteBlast`: its core, floor, footprint and main masses, `siteMasses`), replacing the core's
  kill explosion; the simulation's effect, sound and loot are untouched. About three seconds: a white-hot flash in the
  core's colour, a fireball over dark smoke, shock rings past the site's edges, thrown shards and embers; secondary blasts
  walking over the main masses; a smoke column leaning with the wind; embers settling on the site's floor. Colours per
  world (`SITE_FIRE`; ichor splashes on Amnion). It rests on the ground through scrolling and camera follow and burns in
  the wreck layers that draw around the hero (`AROUND_HERO`). The site swaps to its ruin under the flash, and the ruin
  cools from the blast over `SITE_HEAT` seconds on clones of its destroyed materials (no new programs), its blast marks
  spreading out with the shock ring. A vault seal broken before the last gets one blast of its own. It stays within half
  the wreck particle pools, so two sites at once fit.
- **Clearings:** each site's rectangle and pad band are terrain clearings (sites first) and are reserved from battery
  compounds, so no scenery or plant stands in them.
- **Loading:** `prepare(planet)` loads the world's site finishes with the rest of the planet; one hidden instance per finish
  joins the shader warm-up, so nothing compiles mid-flight. A world's sites are released after it is left (endless
  revisits reload them), their textures included.
- **QA:** the canvas's `data-render-stats` carries `sites` (loaded, count, destroyed, drawn, foundations, files, and per
  site its key, finish, cores, destroyed state, base and squash).
- **Tests:** `tests/render/site-view.test.ts` (placement, hidden core, pads, foundations, squash, the vault's seals, the
  hand-over to the effects, cooling, masses), `tests/render/site-blast.test.ts` (the sequence replaces the kill explosion,
  anchored, around the hero, within the pools, on every world and on Low), `tests/render/site-textures.test.ts` (textures
  freed with a left world), `tests/browser/site-destruction.spec.ts` (the real renderer plays it and compiles nothing
  mid-flight; frames from the fixture `tests/fixtures/site-destruction.html`).

**Lab:** the playground's Sites tab (`playground.html`, `src/playground/sites-lab.ts`): West and East place the real site
(its guard and core from `siteCue`) on the side route, Ahead a lone core in front of the ship; the world can be held still;
cores can be hit and destroyed. Development builds expose `window.siteLab` for look-dev automation.

## 7. Open

- Roads and pipelines are not cleared under a pad: a road through one keeps its own height.
- On Amnion's pitted plains many seats still straddle a pit, which the pad levels; searching wider always would need the
  guards to move with the site, a fairness change.
- A tall site on a high plateau with nothing lower in reach is still squashed.
- The pads' shader cost on phones is unmeasured (a few rectangles and points per ground vertex, only while a site is near).
