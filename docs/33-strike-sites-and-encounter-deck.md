# 33 · Strike sites and the encounter deck

> **30 October user override:** The selected chassis perk now applies in endless as well as campaign; only modular parts and paint are cosmetic. Starter weapon/special/shield equipment still resets. See [global ship perks](34-global-ship-perks.md).

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
  slot's role (an air squadron, or ground batteries), its attack character (below) and its threat cost; its pickup stays
  with the slot.
- `side({ at, id, pickup? })`: a strike site (§ 3), drawn from `sitePool(world)` by `SiteDefinition.weight`, west or east
  by the roll, built with `siteCue(id, side, at, world)`; a slot's pickup moves to the drawn side.

Templates: the six missions (`CAMPAIGN_DECKS`) and ten endless stages (`ENDLESS_DECKS`: the Luna prologue, then opening,
pressure and peak stages for Khepri, Vesper and Nacre). Teaching arcs (every mission, the prologue and the opening
stage of each world's first endless visit) fly a slot whose nominal introduces a formation as authored, and draw only
formations already introduced, so squadrons appear in their authored order. Training's teaching sequence is therefore
fixed on every seed, and its two side slots (39 s and 44 s) teach the side route.

**Side slots** (the old `SALVAGE ROUTE · WEST`, `OPTIONAL OUTPOST · EAST`, `LONE TURRET · EAST`, … routes are gone):

| Arc | Side slots (s) | Sites per run |
| --- | --- | --- |
| Training | 39, 44, on opposite sides (they teach the side route) | 2 |
| Rolling Thunder | 41 (where its salvage route was) | 1 |
| Cold Vector | 48, 53, on opposite sides | 2 |
| Deep Bloom, Brood Strike, Final Horizon | 51 (the old east route at 56 s is an empty relief) | 1 |
| Endless Luna prologue | 39, 44, on opposite sides (Training's) | 2 |
| Endless Khepri and Vesper stages | their west route (31–44 s); the old east route after the climax is an empty relief | 1 |
| Endless Nacre opening / pressure / peak | 51 (Deep Bloom's) / none / 52 (the second half 1 s later) | 1 / 0 / 1 |

Only Training and Cold Vector keep **two** sites (30 October, measured; Cold Vector's recovery is followed by missile
batteries, which fire down their own columns). A strike site's guard (threat 8–11 for a parts site) holds that much of
the live threat budget while it scrolls through, and its air guard waits for clear airspace; with the list already running
5–15 s behind its times there, two sites back to back were admitted on top of the next pressure block (the fuel depots,
egg sacs and energy cells: aimed turret batteries) while the pilot was still out at a site near the world edge. With two
sites the perfect pilot took about twice the fixed lists' hits on the last three missions (Brood Strike Standard Fan 7
against 1, Final Horizon Veteran Seeker 9 against 6 over 24 seeds), and Rolling Thunder Veteran most of its extra hits
from the depots after its sites. A second site in the intro, where the list is still on time, was tried too: on Deep
Bloom it drew the pilot to the edge just before the Pulsar lesson. Nacre's pressure stage (Deep Bloom's middle and
climax) has no recovery at all; the site the deck first squeezed in before its climax roughly quadrupled the hits in
endless sector 9, so it flies none, as its fixed list had no side route.

**Pools** (`DECK_POOLS[world][phase]`): authored waves (`w(...)`) built only from formations and kinds the world already
flies (tested against the nominal arcs): one air squadron, or one ground battery, optionally with harmless skids (two
air squadrons in one cue could never share the airspace). Each wave flies at its slot's centre or as its validated mirror
image. Lateral offsets (±1–1.5 on narrow squadrons and batteries, as first planned) were measured and dropped: a wave
shifted toward the world edge while the ship was out there closed it in, and those edge hits outweighed the ones a shift
toward the centre spared; `w(…, { offsets })` still lets a wave opt in (tested in view). New waves over the
fixed lists: Luna `dive-pair + fuel-pair`, `arrow-3 + fuel-pair`, `solo-lancer` in pressure, `line-weaver-4` in the
climax; Khepri `line-weaver-4` in the climax; Vesper `needle-solo` in pressure, `diamond-solo` in
the climax; Nacre `line-weaver-4 + fuel-pair` and `diamond-solo` in the climax; Amnion and Umbra each other's mixes. No
new formations, and no Pulsar or Wraith wave: they fly only in their arc slots.

**Guard rails** (`resolveDeck`):
- the drawn wave has the nominal's role and **attack character** (`waveCharacter`): fighters (darts and weavers), beams
  (Needles and Lancers), heavies (Diamonds), Pulsars or the Wraith in the air; aimed turret batteries or missile batteries
  (which fire down their own columns) on the ground. The arcs pair characters deliberately, a Pulsar's tracking stream
  beside missile batteries and never beside aimed turrets, so the deck varies the formation and its mirror, and never what
  a stretch asks of the pilot. Without this rule (30 October) a turret battery drawn into a missile slot beside
  the Pulsar pair, or a Pulsar drawn into a heavy's slot two cues from it, nearly tripled the perfect pilot's hits on Deep
  Bloom (Veteran Seeker 17 against 6 over 24 seeds);
- it costs between 0.65 and 1.5 times the nominal (at most 3 more): `BAND`; but no more than the nominal within
  `SITE_CALM` (15 s) after a strike site (the main battle resumes while a pilot who took the site is still out by the
  edge);
- no wave twice in a row, nor the same as the next fixed cue; where the pool allows, not the same as the last wave of its
  role either; no site twice in a row, and a second site within `SITE_CALM` of another stands on the other side (two on
  one side ran into each other: the seat search can move a core several units back onto the previous site's ground);
- cues within 5 s of each other (`PAIR_WINDOW`) cost together no more than the arc's nominal pair (at least 10): two
  heavy waves never stack beyond what the arc authored;
- the wave after a strike site fits the Standard threat budget beside the site's guard where the pool allows;
- a Pulsar's or the Wraith's stretch (`SCARCE`) flies exactly as authored: their own slots and every slot within
  `PAIR_WINDOW` of one fly their nominal, and the pools carry no Pulsar or Wraith wave. The arcs pair them deliberately
  (a Pulsar pair after a Needle column, missile batteries beside it); a third missile battery drawn beside Final
  Horizon's artillery ship, a mirrored Pulsar pair or a Needle line instead of the column before it in endless sector 9
  each pushed the pilot to the world edge, where the tracking stream caught it;
- after a Needle column (`LINGERING`), the next air cue is no Needle squadron and the next site has no air guard: the
  column's last members lock their beam lanes as their path ends, which the airspace prediction cannot foresee, and a
  Needle squadron diving in behind it shared its band (found by the cue-sequence union tests);
- a slot with no fitting wave flies its nominal (about 1% of draws); where the nominal would repeat the previous wave, it
  draws a wave of its role and band of another character instead, never one with a scarce kind (with the calm waves after
  a column, about 2% of draws leave their band or character).

The seeded roll is its own stream (mulberry32 over a hash of the run seed, the template and, in endless, the sector),
used by nothing else; no `Math.random`. Endless resolves each sector anew, so a later visit to a stage differs.

**How to add a wave:** append `w('formation')` (or `w(['formation', 'fuel-pair'])`, options `weight`, `mirror`,
`offsets`) to a world's phase in `DECK_POOLS`. It is drawn wherever its role, character and cost suit a slot.
`tests/sim/encounter-deck.test.ts` checks roster faithfulness, that every variation stays in view at its windups and is
admitted into an empty sky at every rank, and the guard rails over 200 seeds; `tests/sim/deck-balance.test.ts` samples
the balance band. Measure a new wave with the seed sweep below before shipping it: a wave that is fair can still pin the
perfect pilot at the world edge.

**Validator note** (tests/sim/fairness-trace.ts): a site's core and its own guard ring are one authored layout; the
airspace observer no longer requires separation between them. Under the release lens (src/sim/ground.ts) ground seats
near the bottom of the view come up to a unit closer than authored, so the ring's 2.55-unit seats read as overlapping
the core. The guard keeps the rule against every other squadron.

**Measured** (30 October, on the final code with workstream C's site seats, 6812ba2). Hits the perfect pilot takes
(`perfectPilot()`, no pickups, no special) over seeds 1–48, the three main weapons together (144 flights per row), against
the fixed lists of 67cdfad on the same seeds. Campaign missions fly whole; endless sectors from their start
(`enterSector`) until the next sector begins, Twin Pulse. Band: the fixed lists' count plus 25 % or plus one hit per 16
flights, whichever is larger.

| Mission | Standard: fixed → deck | Veteran: fixed → deck | Mission (288 flights) |
| --- | --- | --- | --- |
| Training | 0 → 0 | 5 → 9 | 5 → 9 |
| Rolling Thunder | 37 → 31 | 39 → 50 (+28 %, just above the band) | 76 → 81 |
| Cold Vector | 5 → 11 | 14 → 8 | 19 → 19 |
| Deep Bloom | 38 → 34 | 60 → 52 | 98 → 86 |
| Brood Strike | 19 → 25 | 27 → 24 | 46 → 49 |
| Final Horizon | 10 → 9 | 29 → 20 | 39 → 29 |

| Endless sector | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 1–9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fixed → deck (48 flights each) | 0 → 0 | 1 → 1 | 4 → 5 | 2 → 8 | 4 → 1 | 4 → 4 | 1 → 3 | 16 → 12 | 6 → 12 | 38 → 46 |

Every mission and endless 1–9 as a whole sit in the band. No flight loses a life (one did on the fixed lists); the only
completion that moved is the Fan at Veteran, which outlasts its 420 s window against THE CRADLE on 32 of 48 seeds
(against 28) and against THE ECLIPSE on 4 (against 13). Above
it: Rolling Thunder Veteran (its draws: the same perfect pilot steering only for the main battle and ignoring the site
takes 25 hits against 19 over seeds 1–24, so the site is not the cause), endless sectors 4 (Khepri's pressure stage and
Bastion-9) and 9 (Nacre's pressure stage), each a handful of hits at the world edge after a different squadron order. A
pilot that ignores the sites takes 47 hits against 47 over seven checked cells (Training Veteran, Rolling Thunder
Standard and Veteran, Cold Vector Standard, Deep Bloom Veteran, Brood Strike Standard, Final Horizon Veteran; seeds 1–24):
the sites add no danger to the main battle's path.

**Economy** (Standard, Twin Pulse tier 1, pickups collected, seeds 1–24): parts banked per mission by the perfect pilot
(it only takes a site that comes into its view) and by the site-hunting perfect pilot (`perfectPilot(siteSeeker)`), and
the perfect pilot's credits against the fixed lists.

| Mission | Parts, perfect pilot | Parts, site-hunting pilot (sites destroyed) | Credits, perfect pilot: fixed → deck |
| --- | --- | --- | --- |
| Training | 0.17 | 0.42 (1.58) | 276 → 274 |
| Rolling Thunder | 0 | 0.08 (0.58) | 274 → 297 |
| Cold Vector | 0.08 | 0.42 (1.75) | 409 → 449 |
| Deep Bloom | 0 | 0.25 (0.58) | 327 → 351 |
| Brood Strike | 0.21 | 0.33 (0.79) | 313 → 362 |
| Final Horizon | 0.04 | 0.33 (0.83) | 367 → 380 |

So a player who goes for the sites banks about a part every two to four missions at tier 1: slow, as the user wanted, and
slower on the missions with one site. Reproduce a row with `DECK_REPORT=<file> DECK_TARGET=mission:<id>|sector:<n>
DECK_SEEDS=1-48 [DECK_PILOT=perfect|weaver|sites] npx vitest run tests/sim/deck-report.test.ts` (one target per process).

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

## 6. Site models and render (workstream C)

Phase 1 (30 October): the pipeline, the render and one site per family. The user's review ("the airfield on luna looks
floating, and make sure none of these cross heavy cliffs") added the fixes below; phase 2 (30 October) modelled the other
eight. Every site now has a model on every world it appears on.

**Models.** Hand-built in Blender by `tools/blender/strike_sites.py` from the boss/facility toolkit's faceted solids
(user: "just model them yourself … the existing infra is good inspiration"): flat paints, baked AO in the vertex
colours, glow materials named `*glow*`; no textures. Shape over texture, for the 55° camera. The concept sheet
(`art/concepts/strike-sites/00-all-sites.png`) is a reference only.

| Site | Finishes | Core (the target) | Triangles per file | File per finish |
| --- | --- | --- | --- | --- |
| Crash site | luna, khepri, vesper, nacre, amnion, umbra | the freighter's reactor in the break | 4.8–5.7k | 325–388 KB |
| Airfield | luna, khepri, vesper | the control tower's glazed cab | 4.7–4.9k | 311–320 KB |
| Salvage yard | luna, khepri, vesper | the pod on the gantry's hook | 3.7–3.9k | 260–271 KB |
| Shield depot | luna, khepri, vesper | the generator drum under the field dome | 6.1–6.4k | 371–386 KB |
| Relay station | luna, khepri, vesper, amnion (overrun) | the dish's feed horn | 2.7–5.0k | 178–332 KB |
| Freight terminal | luna, khepri, vesper, amnion (overrun) | the lit weapons container | 3.8–6.4k | 265–442 KB |
| Dark spaceport | umbra, nacre (ruin) | the crystal in the spire's face | 2.6–3.4k | 169–228 KB |
| Prism reactor | umbra, nacre (ruin) | the floating crystal (it turns) | 3.8–4.7k | 251–316 KB |
| Sealed vault | umbra, nacre (ruin) | three seal crystals (one node, drawn at each seal) | 2.8–3.6k | 178–236 KB |
| Gate ring | umbra, nacre (ruin), amnion (brood-crusted) | the membrane in the ring | 3.0–4.3k | 213–299 KB |
| Brood hive | amnion, nacre | the heart-sac under the ribcage | 5.9–6.0k | 394–400 KB |
| Spawning pool | amnion, nacre | the pod on the stalk | 4.3k | 284–285 KB |

Triangles per file count the body, one core and one ruin. A facility plant is about 6–10k triangles (Khepri modules
0.4–4k each), so a site costs less than one plant. A world loads its own finishes only: 1.1 MB (Umbra) to 2.1 MB (Amnion) per world, against
4–5.7 MB for a world's facility kit.

**Finishes.** One palette per world (`BASE` and `WORLD` in the builder), derived from the facility kits and world docs.
Frontier sites: Luna white panels with amber, Khepri bone and rust with the concept's teal reactor, Vesper white and
graphite with blue glow, snow on roofs and on the aprons (never spilling past their edges). The Amnion overrun (relay
station, freight terminal; the crash site on Amnion too) is one shared set, `brood_growths`: bone arches, chitin crusts,
resin pools, egg clutches and spikes. Umbral sites are glossy obsidian with violet seams on Umbra (lifted off the dark
ground, 30 October) and pale overgrown ruins with teal crystals on Nacre (missing and sunken blocks, snapped and fallen
blades and stones, moss, fronds, mire puddles); the gate ring is crusted with the brood's growths on Amnion. The crystal
cores (prism reactor, dark spaceport, sealed vault) are faceted `prism_glow` with a bright heart; the shield depot's dome
is a lit `field_glow` lattice.

**Phase-1 fixes (user review, 30 October).**
1. Grounding: sites seat on even ground (below) and the terrain under them is levelled to their floor (site pads).
2. Guards off the footprint: the guard rings (`RING_*` in content/formations.ts) stand outside `SITE_FOOTPRINT`, and the
   seat search keeps every guard battery clear of the site (below).
3. Crash site: a longer, thicker freighter broken in two at the end of a scorched furrow, cargo modules on its spine,
   bright hull and glowing break so it reads on dark Nacre and Umbra ground.
4. Prism reactor: a broken crown of seven sharp blades leaning out (two gaps; the back ones tallest) round a smaller
   dais, and a big faceted crystal floating well above them on a beam, so the gap reads from the game camera: a crown with
   a crystal over it, not a saucer.
5. Airfield: a longer runway, a taller control tower (cab 1.85 up, under the height rule).
6. Destroyed states (and the integrator's review: "the same model, darker"): every ruin carries the blast (`devastate` in
   the builder): a jagged scorch splash draped over the site's aprons and the ground out to its bounds, twelve pale ash
   streaks blasted out from the core, nine chunky debris pieces thrown off it and embers; the ash and the embers keep
   their colour in the wreck, so the blast reads on charcoal and on dark ground. The core's spot is broken or caved in.
7. Sealed vault: one model for the group of three seals (B's `formation.group`); each seal's crystal stands before a tall
   standing stone (the third rests on the vault's first tier, framed in light).
8. Relay station (user, 30 October: "turn the satelite dish of the relay station so its better visible"): the dish is
   turned three-quarters to the camera about its feed horn (38° up, yawed 63° west), so the bowl reads as an ellipse with
   its rim, back shell, struts and horn; the pedestal and yoke follow the hub.

**File layout.** `public/assets/shared/sites/<site>-<finish>.glb`, so a world loads only its own finishes. Each holds
`site_<id>_<finish>_body` (the site), `_core` (the target, hidden once destroyed) and `_ruin` (the broken core with its
scorch and debris, shown once destroyed); `<id>` with underscores. Frame: the pivot is the core's ground anchor (the
vault's centre between its seals); x lateral, s away from the camera (glTF −z), the detailed front toward the camera; the
core's centre stands `SITE_CORE_HEIGHT[site]` over the pivot (content/sites.ts; the simulation anchors the core with it).
`src/render/site-models.ts` (`SITE_MODELS`) is the single source of finishes and bounds: the builder parses it and asserts
every node against it, and `tests/world/site-models.test.ts` checks the GLBs against it.

**Rules the builder and the tests keep.**
- Inside `SITE_FOOTPRINT` (|x| ≤ 3, s −3.2 to 3.3); top ≤ 3.25 (docs/25 rule 3); 4–6 units across.
- Line of sight (docs/25 rule 2): rays from every core, and from the guard batteries' spots, toward the camera never meet
  the site.
- Guards: nothing stands on a guard battery's spot (the rings' spots, `GUARD_SPOTS` in the builder, a check only).
- Foundations: slabs, mounds and blocks reach 0.7–1.3 below the pivot.

**Seats** (`src/sim/sites.ts`, simulation; in their own commits). A side-route site's harmless core spawns on the flattest
dry ground near its authored centre: the search (pure: the run's terrain and the spawn tick's camera, never randomness)
reaches 0.5 in, 3 back and 0.5 ahead, and only takes seats whose footprint keeps every guard battery of the cue (where
`anchorGround` will stand it, `guardSpots`) 0.3 outside it. When the best of those would straddle a cliff, a trench or a
pit (spread over 1.5, a drop over 2.5 or ground 0.8 over the floor), it also tries 2 in and 7 back (`SEAT_WIDE`) and takes
that seat if it is clearly better. Moving the core toward the camera costs 0.5 a unit: a core run ahead of its guards'
ring is killed while they still fire and its part falls under their fire (Training, seeds 5–9 at ranks 0 and 2, the
site-hunting perfect pilot: a destroyed site's part lost in 1 of 10 runs with the cores where authored, 6 of 10 before
this cost, 2 of 10 now). Tall sites prefer lower ground (the prism reactor under 0.3, the airfield 0.4). The floor is the
footprint's 95th-percentile height; the core rests on it, so its gameplay position is where its model draws it. The
guards keep their authored places and timing: the cue is exactly as fair as authored. Measured over 192 seats per world
(`tests/sim/site-seats.test.ts`): median footprint spread 0.5 (Vesper) to 0.7 (Khepri), 1.4 on Umbra's cracked plates and
2.3 on Amnion's pitted plains (authored: 0.8 to 3.5); guards fully clear in 85–98%, at a footprint's rim (at most 0.55 in)
in 0–2%. What unevenness is left the render's site pad levels.

**Render** (`src/render/site-view.ts`, hooked into `src/render/scene.ts` in two places: `update` before the enemies, and
the site pads after it):
- Every live enemy with `site` set and a ground anchor gets its site in the current world's finish, placed at the anchor
  less the core's seat in its group (world x, world s, the floor) and scrolling with the ground. The site draws the core:
  scene.ts leaves the core's own craft model, ghost silhouette, plinth and pontoon out (`hidesCore`), and a site core
  never seats a compound or emplacement or leaves a wreck. A finish that fails to load leaves its cores their own model.
- **Site pads** (render only, `src/render/terrain-kit.ts`): the ground shader levels the terrain over each nearby site's
  rectangle to its floor (cut and fill), easing back to the terrain across a 0.9 band around it; the ground within 1.1 of
  a guard battery stays as it is, so no battery floats or sinks. On a deck over the sea (Nacre's mire, Vesper's sea) the
  seabed fills only to just under the water: the site stands in the shallows. Four pads and eight kept batteries at once.
  Never terrain data or targeting.
- **Foundations** fill what the pad leaves under the floor (beside a kept battery), in the world's ground tone.
- **High ground:** a site whose top would still come within 0.45 of the flight plane is squashed about its core (the core
  stays put; at least to 35%); a floating crystal (the prism reactor's) keeps its own shape.
- **Destroyed:** a core that vanishes with the simulation's kill explosion at its position (or has no hit points left)
  leaves its site destroyed: the core hidden, the ruin shown, the structure in darkened twin materials (16% of its paint
  toward charcoal) with its lamps out and its embers smouldering, until it scrolls out of view. A core that leaves without
  a kill explosion leaves the site intact. A hit on the core flashes its glow.
- **Clearings:** each site's rectangle and its pad band are terrain clearings (sites first; the terrain takes 12) and are
  reserved from battery compounds and emplacements, so neither scenery nor a plant stands in them.
- **Loading:** `renderer.prepare(planet)` loads the world's site finishes with the rest of the planet; one hidden
  instance per finish (live and destroyed materials) joins the warm-up, so nothing compiles mid-flight. A world's sites
  are released after it is left (endless revisits reload them).
- QA: `data-render-stats.sites` = {loaded, count, destroyed, drawn, foundations, files, sites[{key, site, finish, cores,
  destroyed, base, squash}]}.

**Lab:** the playground's Sites tab (`playground.html`, `src/playground/sites-lab.ts`): West and East place the real
site (its authored guard and core from `siteCue`) on the side route; Ahead places a lone core in front of the ship;
"Hold the world still" freezes the simulation (only the clock and effects age); "Hit" and "Destroy" the cores.
Development builds expose `window.siteLab` (`place`, `destroy`, `hit`, `clear`, `calm`, `skip`, `seats`) for lookdev automation.

**Rebuild:**
```
cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
  --python '\\wsl.localhost\Ubuntu\home\davidfarina\Projects\alien-skies\tools\blender\strike_sites.py' -- [--site=airfield] [--no-export] [--preview]
```
About 3 minutes for all twelve sites with previews (Windows Blender 5.2, headless). `--preview` renders every finish,
intact and destroyed, from the game camera into `lookdev/strike-sites/`. Review sheets (in game): `art/strike-sites/`.

**Open:** roads and pipelines are not cleared (a road through a pad keeps its own height); on Amnion many seats still
straddle a pit, which the pad levels (searching wider always would need the guards to move with the site, a fairness
change); a tall site on a high plateau with nothing lower in reach is still squashed (to 35% at most); the pad's shader
cost on phones is unmeasured (four rectangles and eight points per ground vertex, only while a site is near).
