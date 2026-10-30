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

### 3.1 As built (workstream B, 29 October 2026)

Runtime sources: `src/content/sites.ts` (the table below; `sitePool`, `siteCue`), the site formations in the
"Strike sites" block of `src/content/formations.ts`, `src/sim/sites.ts` (message, loot, shield budget), the core hook in
`src/sim/spawn.ts`, and `damageEnemy` / `updatePickups` / `updateShieldSupplies` in `src/sim/game.ts`.

**Layout.** A site sits `SITE_X` = 7.5 units out on its side (world-anchored; the west site mirrors the east one). It
rides its own ground track (`SITE_TRACK`), `SITE_LEAD` = 9 units further out than a battery's, so the whole site scrolls in
from beyond the top edge even when its cue spawns at its time; the director's `leadGround` can lead it further, as any
ground formation. Guards sit in rings around the core at least 2.55 units away (the airspace separation plus its margin,
they are other squadrons), within x ±10.5 so every member can be lined up. Each guard's first windup waits until it is
fully in view. All site formations pass the formation fairness tests (`tests/sim/fairness.test.ts`, every scale, both
mirrors).

**The core** is formation `site-core-<site>`: a harmless ground target of kind `fuel` (an explicit proxy that never
attacks, ranked after armed targets, threat cost 0) that spawnMembers marks with `Enemy.site`, the site's hit points
(× the difficulty's or endless ramp's hp scale) and radius 0.7. It never bursts like a fuel skid and drops no credits of
its own: its death scores 500 and drops the site's loot where it stood. The sealed vault has three seals (55 hp, radius
0.5); its loot drops with the last one. **Render (workstream C):** a site core is drawn as the site, not as a fuel skid
or fuel wreck; skip `enemy.site` in the enemy batches and wrecks.

| Site | Worlds: guard (threat) | Core hp | Campaign loot | Endless loot |
| --- | --- | --- | --- | --- |
| Crash site | Luna, Khepri: turret trio + weaver (8); Vesper: missile trio + Needle (8); Nacre, Amnion, Umbra: two turrets and a missile battery + weaver (8) | 80 | 1 part | power cell + 1,000 |
| Airfield | Luna, Khepri: turret trio + **a scrambled dart pair** (8); Vesper: missile trio + Needle (8) | 80 | 1 part | power cell + 1,000 |
| Salvage yard (rare, weight 0.3) | Luna, Khepri: turret ring of four + three-dart arrowhead (11); Vesper: missile trio + Diamond (10) | 150 | 3 parts | power cell + 3,000 |
| Shield depot | Luna, Khepri: turret pair (4); Vesper: missile pair (4) | 80 | shield cell (budgeted) | shield cell (budgeted) |
| Relay station | Luna, Khepri: turret pair + dart (5); Vesper: missile pair (4); Amnion: turret and missile battery + dart (5) | 80 | 30 credits | 1,500 score |
| Freight terminal | Luna, Khepri: turret trio (6); Vesper: missile trio (6); Amnion: mixed trio (6) | 80 | 40 credits | a weapon (the next in Pulse → Fan → Seeker → Rail) |
| Dark spaceport | Umbra, Nacre: mixed trio + Needle (8) | 80 | 1 part | power cell + 1,000 |
| Prism reactor | Umbra, Nacre: turret and missile battery (4) | 80 | shield cell (budgeted) | shield cell (budgeted) |
| Sealed vault (rare, weight 0.3) | Umbra, Nacre: wide ring of two turrets and a missile battery + Diamond (10); **three seals** | 3 × 55 | 3 parts | power cell + 3,000 |
| Gate ring | Umbra, Nacre, Amnion: turret and missile battery + weaver (6) | 80 | shield cell (budgeted) | power cell |
| Brood hive | Amnion, Nacre: mixed trio + weaver (8) | 80 | 1 part | power cell + 1,000 |
| Spawning pool | Amnion, Nacre: turret and missile battery (4) | 80 | shield cell (budgeted) | shield cell (budgeted) |

Every guard flies only kinds that already fly on its world (tested). **Weapon and power loot in the campaign:** the plan's
"weapon" (freight terminal) and "power / weapon" (gate ring) cannot pay out in the campaign, where weapons and their tiers
are bought, never picked up (docs/30; the campaign ignores weapon and power pickups). In the campaign the freight terminal pays
40 credits and the gate ring a budgeted shield cell (user, 29 October: "Credits on campaign instead of power is fine but
you can also drop shields"). Parts stay slow at the prices above (user: "No parts should be slow").

**Messages** are the site's own, naming what it drops in the run's mode: `AIRFIELD · WEST · PARTS` (campaign),
`AIRFIELD · WEST · POWER` (endless), `SHIELD DEPOT · EAST · SHIELD`, `RELAY STATION · EAST · CREDITS` / `· BONUS`.

**Shield budget (invariant 11).** A shield site's cell is a budgeted shield supply delivered early, never an extra one: it
takes the next supply still to come in the mission (the mission's or boss's `shieldSupplies` for the difficulty; endless:
this sector's, else the next sector's), and that supply is then skipped (`RunState.sites.shieldClaims`,
`supplyClaimed`). With no supply left to take, the site pays 10 credits (campaign) or 500 score (endless). The cells a run
can collect therefore never exceed its supply schedule (`tests/sim/sites.test.ts`).

**Parts** (`Pickup.kind 'part'`, one pickup per part, an orange octagon with a cog) count in `RunState.parts` in the
campaign and are banked with the attempt in full whatever its outcome (docs/21 § 7). Endless never drops one.

**Statistics** (invariant 13, observation only): the flight log counts sites destroyed per mode (`FlightTotals.sites`,
`FlightRecord.sites`; older logs read as 0). It is not shown on the Statistics page yet.

**Measured (29 October; `SITE_ECONOMY=<file> npx vitest run tests/sim/site-economy.test.ts`).** Each mission's authored
side routes (Training 2, Rolling Thunder 1, the others 2) replaced by each of its world's parts sites in turn, Standard,
the perfect pilot steering for site cores and parts (`tests/sim/site-harness.ts`), seeds 5, 6 and 7, no life lost in any
run. Parts banked per site encounter, and the expected parts per mission when the side slots draw from the world's pool
by weight:

| Mission | Tier-1 Twin Pulse: per encounter | expected / mission | Tier-3 Twin Pulse: per encounter | expected / mission | if every part were collected |
| --- | --- | --- | --- | --- | --- |
| Training (Luna) | crash 0.50, airfield 0.67, salvage 0.50 | 0.50 | 0.83, 0.83, 2.00 | 0.86 | 1.09 |
| Rolling Thunder (Khepri) | 0.33, 0.33, 0 | 0.13 | 0.67, 1.00, 2.00 | 0.43 | 0.55 |
| Cold Vector (Vesper) | 0.83, 0.83, 1.50 | 0.80 | 1.00, 1.00, 1.83 | 0.96 | 1.09 |
| Deep Bloom (Nacre) | crash 0.83, spaceport 0.50, vault 0, hive 0.83 | 0.69 | 1.00, 1.00, 1.50, 1.00 | 1.10 | 1.24 |
| Brood Strike (Amnion) | crash 1.00, hive 1.00 | 0.67 | 1.00, 1.00 | 0.67 | 0.67 |
| Final Horizon (Umbra) | crash 0.50, spaceport 0.67, vault 0 | 0.54 | 1.00, 0.83, 1.50 | 1.06 | 1.35 |

So a mission yields about 0.5–1 part (fewer on Rolling Thunder, which has one side slot; the deck's slot count decides).
One chassis's designs cost 28 parts (7 per slot), all four 112: a B design takes one or two missions, a full chassis
dozens. The pilot is cautious under aimed turret fire (it leaves a core's lane whenever a shot is committed there), so the
tier-1 figures on the turret worlds are pessimistic; missile-battery guards (their own columns) leave the lane under the
core open.

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

### 4.1 As built (workstream A, 29–30 October 2026)

Runtime source: `src/content/encounter-deck.ts` (templates, pools, guard rails, `resolvePlaylist`); the director asks it
for the run's list (`resolvePlaylist(state.config, state.sector, state.config.seed)`, memoized in a small bounded cache
outside the run state). `src/content/encounters.ts` keeps the shared types (`EncounterCue`, `FormationPlacement`),
`f()`, `cueRoster` and `cueAlert`; the fixed lists it used to hold are now the templates' slots.

**Templates.** Every arc is the list it was before, slot by slot, at the same times (mission lengths, boss approach
cutoffs and arrivals, the endless sector cycle and pace ramp and the shield-supply schedule are untouched):

- `fix(cue)`: flies as written. Every intro cue, every cue with a message (teaching steps, set pieces, power-cell and
  weapon opportunities) and every relief.
- `draw(cue)`: a pool slot; `cue.formations` is its **nominal** wave (what the arc flew before the deck) and fixes the
  slot's role (an air squadron, or ground batteries) and threat cost; its pickup stays with the slot.
- `side({ at, id, pickup? })`: a strike site (§ 3), drawn from `sitePool(world)` by `SiteDefinition.weight`, west or east
  by the roll, built with `siteCue(id, side, at, world)`; a slot's pickup moves to the drawn side.

Templates: the six missions (`CAMPAIGN_DECKS`) and ten endless stages (`ENDLESS_DECKS`: the Luna prologue, then opening,
pressure and peak stages for Khepri, Vesper and Nacre). Teaching arcs (every mission, the prologue and the opening
stage of each world's first endless visit) fly a slot whose nominal introduces a formation as authored, and draw only
formations already introduced, so squadrons appear in their authored order. Training's teaching sequence is therefore
fixed on every seed, and its two side slots (39 s and 44 s) teach the side route.

**Side slots** (the old `SALVAGE ROUTE · WEST`, `OPTIONAL OUTPOST · EAST`, `LONE TURRET · EAST`, … routes are gone):
two per campaign mission (Rolling Thunder gained one: its dive pair flies at 33 s, the sites at 37 s and 42 s), one per
endless stage (its west route; the old east route after the climax is now an empty relief), two in the Luna prologue
(Training's). Endless Nacre: the opening keeps Deep Bloom's west slot, the pressure stage gains one before its climax
(27 s, later cues 3 s later) and the peak one between its halves (52 s, the second half 1 s later).

**Pools** (`DECK_POOLS[world][phase]`): authored waves (`w(...)`) built only from formations and kinds the world already
flies (tested against the nominal arcs): one air squadron, or one ground battery, optionally with harmless skids (two
air squadrons in one cue could never share the airspace). Each wave allows its validated mirror and the lateral offsets
in `SHIFT` (±1–1.5 for narrow squadrons and batteries, none for wide, side-entry and two-flank ones). New waves over the
fixed lists: Luna `dive-pair + fuel-pair`, `arrow-3 + fuel-pair`, `solo-lancer` in pressure, `line-weaver-4` in the
climax; Khepri `line-weaver-4` in the climax; Vesper `needle-solo` in pressure, `diamond-solo` in
the climax; Nacre `line-weaver-4 + fuel-pair`, `pulsar-pair` and `diamond-solo` in the climax; Amnion and Umbra each
other's mixes (Umbra adds the Wraith). No new formations.

**Guard rails** (`resolveDeck`):
- the drawn wave has the nominal's role and costs between 0.65 and 1.5 times the nominal (at most 3 more): `BAND`;
- no wave twice in a row, nor the same as the next fixed cue; where the pool allows, not the same as the last wave of its
  role either; no site twice in a row;
- cues within 5 s of each other (`PAIR_WINDOW`) cost together no more than the arc's nominal pair (at least 10): two
  heavy waves never stack beyond what the arc authored;
- the wave after a strike site fits the Standard threat budget beside the site's guard where the pool allows;
- a resolved list flies no more Pulsar or Wraith cues than its arc (`SCARCE`);
- after a Needle column (`LINGERING`), the next air cue is no Needle squadron and the next site has no air guard: the
  column's last members lock their beam lanes as their path ends, which the airspace prediction cannot foresee, and a
  Needle squadron diving in behind it shared its band (found by the cue-sequence union tests);
- a slot with no fitting wave flies its nominal (about 1% of draws).

The seeded roll is its own stream (mulberry32 over a hash of the run seed, the template and, in endless, the sector),
used by nothing else; no `Math.random`. Endless resolves each sector anew, so a later visit to a stage differs.

**How to add a wave:** append `w('formation')` (or `w(['formation', 'fuel-pair'])`, options `weight`, `mirror`,
`offsets`) to a world's phase in `DECK_POOLS`, with a `SHIFT` entry for a new formation that tolerates offsets. It is
drawn wherever its role and cost suit a slot. `tests/sim/encounter-deck.test.ts` checks roster faithfulness, that every
variation stays in view at its windups and is admitted into an empty sky at every rank, and the guard rails over 200
seeds; `tests/sim/deck-balance.test.ts` samples the balance band.

**Validator note** (tests/sim/fairness-trace.ts): a site's core and its own guard ring are one authored layout; the
airspace observer no longer requires separation between them. Under the release lens (src/sim/ground.ts) ground seats
near the bottom of the view come up to a unit closer than authored, so the ring's 2.55-unit seats read as overlapping
the core. The guard keeps the rule against every other squadron.

**Measured** (perfect pilot, Standard, starter loadout; `DECK_REPORT=<file> DECK_TARGET=mission:<id>|sector:<n>
DECK_SEEDS=1-30 [DECK_PILOT=perfect|weaver|sites] npx vitest run tests/sim/deck-report.test.ts`): see the table below.

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
