# 32 · Rail Driver and Gravity Well

Status: approved by the user on 28 October 2026 ("i love that, implement it. i also like the gravity well idea"), and
**implemented on 28 October** (§7 lists what was built and measured). Numbers are tuned against the scripted pilot only.
They have not been tuned in human play.

Ownership: **Claude Code implements all of this** (sim, data, hangar, tests, render, VFX and audio), but only **after
Codex's campaign batch (docs/30) is finished and integrated** (user, 28 October 2026). Until then, equipment, contracts,
sim and hangar stay Codex's; build on its four-slot loadout and shared weapon tiers once they have landed.

---

## 1. Rail Driver (main weapon, straight family)

A heavy, slow weapon that pierces. One very fast slug hits **every** enemy along its line. It rewards lining up columns:
weaker than Pulse on a lone target, much stronger on a line.

It fits invariant 2 as a **straight** family weapon: fixed angle 0, automatic, and it fires only with a valid target in
its envelope. It never aims and never homes.

### 1.1 Data (`WEAPONS.rail` in `src/content/balance.ts`)

| Field | Value | Note |
| --- | --- | --- |
| `label` | Rail Driver | |
| `cadence` | 0.5 s | Tier 1. Quantised to 30 ticks. |
| `speed` | 90 u/s | Near-instant. Collision is already swept per tick (`segmentCircleHit`), so 1.5 u per tick does not tunnel. |
| `range` | 21 | About to the top of the view (`VIEW.maxS` 19.8 from `MUZZLE`). Pulse's is 22. |
| `damage` | 32 | Per target, per slug. Fixed across tiers (docs/30). The first draft had 40; see §1.7. |
| `radius` | 0.12 | |
| `angles` / `offsets` | `[0]` / `[0]` | |

Single-target damage: 64/s. Pulse tier 1 does 96/s, Fan 75/s and Seeker 50/s, so Rail is among the weakest on a lone
target and gains with every enemy lined up behind it.

### 1.2 Tiers (`weapon-tiers.ts`, docs/30 rule: more shots, never more damage per shot)

| Tier | Pattern | Lone target | Pulse, for comparison |
| --- | --- | --- | --- |
| 1 | one slug every 0.5 s (30 ticks) | 64/s | 96/s |
| 2 | one slug every 1/3 s (20 ticks) | 96/s | 144/s |
| 3 | two parallel slugs at offsets ±0.3, every 0.45 s (27 ticks) | about 142/s when both slugs touch | about 180/s |
| 4 (31 October) | the twin slugs every 1/3 s (20 ticks) | about 192/s when both touch | 240/s |
| 5 (31 October) | four slugs side by side at ±0.3 and ±0.9, every 16 ticks | up to 480/s when all four touch | up to 432/s |

Tiers 4 and 5 and their measured boss times: [campaign expansion](30-campaign-expansion.md#main-weapons--four-upgrades-five-tiers).

```ts
rail: [[shot(0, 0, .5)], [shot(0, 0, 1 / 3)], [{ angles: [0, 0], offsets: [-.3, .3], wait: .45 }]],
```

### 1.3 Firing envelope

Rail uses the existing straight-weapon check in `acquireTarget`: segment against circle along each slug's path. Nothing
new is needed. The same target ordering applies: armed enemies before fuel skids, then the nearest.

### 1.4 Piercing (`updateProjectiles`)

- A rail projectile carries `pierce: true` and `hit: number[]` (enemy IDs already damaged by this slug).
- Each tick, collect **every** enemy the swept segment touches. Process them in order along the path (by `t`, then by
  ID), skipping IDs already in `hit`. Each one takes `damage` once, and its ID is added to `hit`.
- **Boss parts stop the slug.** The first `bossPart` it touches takes the damage and the slug ends (`ttl = 0`). This
  keeps one slug from melting a boss by hitting several parts. A core kill still calls `resolveBossPhase` at once, as
  now.
- **Ground targets** (turrets, missile batteries, fuel) are hit through their existing proxies like any straight shot,
  and the slug carries on. A fuel skid's blast and its chain stay as they are.
- **Scenery never blocks** the slug (invariant 4), same as now.
- `maxProjectiles` pressure delays a whole step, as for other weapons (docs/30).

### 1.5 Hunter shields

Rail is the counter to aces' shields. Missiles are already weak against them (`HUNTERS.shield.seekerDamage` 0.2).

- Add `HUNTERS.shield.railDamage: 1.5`. In `absorbHunterShield`, the rail damage that goes into a shield counts 1.5×.
  As now, only damage spent breaking the shield is scaled; the rest reaches the hull normally.
- A shielded hunter does **not** stop the slug. It pierces on through.

### 1.6 Progression and modes

- Campaign: buy for **600 credits** (Fan costs 250, Seeker 450), plus the shared tier upgrades at 150 and 300. It is
  the skill weapon of the late game.
- Endless: Rail joins the weapon pickup pool under docs/30's rules. Changing weapon resets to tier 1, and picking up the
  equipped weapon again upgrades it.
  - **Risk:** a fourth weapon dilutes the pool. Keep the overall weapon pickup budget unchanged, and check that a
    run can still reach tier 3 of *some* weapon.
- Identical opportunity pools across modes (invariant 6): if Rail drops in endless, it is available in campaign too.

### 1.7 Fairness and balance checks

- The perfect-pilot suite (`tests/sim`) flies every world's encounters with Rail at tiers 1 and 3. A run must never need
  piercing to survive (invariant 5).
- Boss time-to-kill with Rail (each tier) must stay within ±15% of Pulse at the same tier. If it's faster, lower the boss
  damage first; don't touch the general damage.
- The kill-charge cap (three kills a second) already stops a column wipe from farming special charge. Keep it.

### 1.8 Tests (focused, no snapshots)

1. One slug damages three enemies in a column once each, and none of them twice across ticks.
2. A slug stops at the first boss part it touches.
3. The hunter-shield multiplier applies only to the part that breaks the shield.
4. Tiers use the docs/30 intervals (30, 20 and 27 ticks), and changing weapon resets to tier 1.
5. With no target in the column, it does not fire.

---

## 2. Gravity Well (special weapon)

A small singularity launched ahead of the ship. For a few seconds it drags nearby air craft into a knot and swallows
enemy shots. Then it collapses with a damaging burst. It sets up kills (a perfect partner for Rail Driver) and gives a
different kind of defence from Shockwave.

### 2.1 Data (`SPECIALS['gravity-well']` in `src/content/equipment.ts`)

| Field | Value | Note |
| --- | --- | --- |
| `label` | Gravity Well | |
| `blurb` | "A singularity ahead pulls enemies together and swallows their shots, then collapses." | |
| `recharge` | 40 s | Same as Siege Lance. |
| `price` | 450 | |
| `ahead` | 9 | Anchor `s` ahead of the ship. The anchor `x` is the ship's x at activation, fixed in **world** space and not following the camera (docs/02 §3, like Shockwave's footprint). |
| `arm` | 0.35 s | Travel time to the anchor (render only; the sim anchors at once and is active after `arm`). |
| `duration` | 2.6 s | Pull phase. |
| `pullRadius` | 7 | Was 4.5 (user, 28 October: "the radius should be bigger and sucking in ships"). |
| `pullSpeed` | 7 u/s, times 1 − (distance / `pullRadius`)² | Strong through most of the reach (was 4, falling off linearly). |
| `coreRadius` | 2 | Inside it, enemies take `dps` and cannot *start* an attack. |
| `dps` | 40 | |
| `swallowRadius` | 4.5 | Hostile shots that enter it are removed. |
| `collapse` | 200 damage within 3.5, falling to 50% at the edge | Applied once at the end. |

Rough total on a caught enemy: 2.6 × 40 + 200 ≈ 300. For comparison: Shockwave 180 per target close up, Seeker Rack
8 × 40, Siege Lance about 860 on a single column.

### 2.2 Rules (these keep it fair and deterministic)

- **Never redirects a hostile shot.** A shot that enters `swallowRadius` is removed from the sim on that tick. The spiral
  into the well is drawn by the renderer only. A shot bent sideways could curve into the player's lane, so this is a
  hard rule.
- **Pulls only free air craft.** Ground targets, boss parts and the boss never move.
- **Committed attacks stay where they are warned.** An enemy with an active windup, an aim ray, or a beam warning or
  beam is not moved until that attack has finished. A Lancer's warned column must never slide (fairness: a warning is a
  promise).
- **Hunters** (aces) are pulled at half strength and take full damage. Their shield absorbs as usual.
- **Never toward the player.** The anchor is 9 ahead, so pulled enemies always move away from the ship's line at
  `s = 0`. Contact damage (`updateContact`) needs no change.
- **Activation does not steer** (invariant 3) and grants no invulnerability. Lives and shields stay the only protection
  (invariant 11). Campaign overdrive from the chassis perk still applies as for every special.
- **Motion integration:** check `src/sim/motion.ts` first. If an enemy's position is recomputed from its authored path
  each tick, apply the pull as an accumulated offset (`enemy.pull`) that the motion step adds. Do not overwrite the path.
  After the well ends, the offset stays, and the enemy carries on along its path from where it was dragged.

### 2.3 Sim shape

```ts
state.well: { x: number; s: number; armedAt: number; until: number; hit: number[] } | null
```

`updateWell(state, dt)` runs after enemy motion and before projectiles:
- pull eligible enemies;
- apply `dps` inside `coreRadius`;
- remove swallowed shots;
- at `until`, apply `collapse` once per enemy, add the `blast` effect, then clear `state.well`.

Damage goes through `damageEnemy(..., mainWeapon = false)`, so it gives no special charge, like the other specials.

### 2.4 Tests

1. A shot entering `swallowRadius` is removed, and no hostile shot's velocity ever changes.
2. Ground targets, boss parts and enemies mid-windup do not move.
3. A pulled enemy's offset survives, and its authored motion continues after the well ends.
4. The collapse damages each enemy once with the documented falloff.
5. Using the well never changes the player's position, shields or invulnerability.

---

## 3. Presentation (render only; never decides damage)

### Rail Driver
- **Slug:** a short streak (about 1.2 u) with a white-hot core and a halo in the **hero's glow colour**. Never red and
  never a lingering beam, so it can't be mistaken for an enemy laser (red preview, then a white core with the world's
  glow).
- **Trail:** a thin line along the slug's path that fades in about 0.12 s.
- **Muzzle:** a bright flash and a short **recoil kick**: the hero model moves back about 0.06 u and springs back over
  0.1 s. Render only; the hit region and the sim do not move.
- **Pierce:** a spark burst at each enemy hit, plus a small exit spark. On a kill the slug visibly carries on.
- **Tier 3:** two parallel streaks.
- **Low quality:** streak and flash only, no trail.

### Gravity Well
- **Launch:** a small dark sphere arcs from the nose to the anchor in 0.35 s.
- **Active:** a black core with a bright accretion ring in the hero's glow colour, slowly spinning, with a faint
  pull-radius ring on the ground plane so the area of effect is readable.
  - High quality adds a screen-space lens distortion inside about 2 u.
  - Swallowed shots are drawn spiralling in over about 0.25 s (visual only; the sim has already removed them).
- **Collapse:** an implosion flash, then a ring burst out to radius 3.
- Readable on a phone: the core and ring must read at a glance over every world, Umbra included (a black core over black
  ground needs the bright ring).

## 4. Audio (docs/24)

- **Rail:** a heavy, dry "crack" with a short metallic ring tail. Soft tick layers per pierced target, at most 3 a
  slug, with a voice limit.
- **Well:** a low rising hum while it's active, a sucking whoosh as shots are swallowed (rate-limited), and a deep thump
  at the collapse.

## 5. Hangar copy

- **Rail Driver:** "A heavy slug that pierces every enemy in its line. Slow — line them up."
- **Gravity Well:** see `blurb` above.
- Tier rows follow docs/30's format (for example, "One slug every 0.5 s" / "Every 1/3 s" / "Twin slugs every 0.45 s").

## 6. Open questions

- Does Rail need its own hero model attachment (an under-hull barrel)? The modular hero kits (docs/31) have no weapon
  mounts yet. A small rail pod per chassis could be added to the kits later. Cosmetic.
- Tune `collapse` and `pullSpeed` against Amnion broods, the densest air waves, so the well never wipes a whole wave
  outright.
- Rail in endless: should its pickup weight be lower than the others' at first?

## 7. Implementation record (28 October 2026)

- **Sim:** `WEAPONS.rail` (balance.ts), tiers (weapon-tiers.ts), `railHits` (game.ts), `HUNTERS.shield.railDamage`,
  `SPECIALS['gravity-well']` (equipment.ts), and `updateWell`, `pullable` and `inWellCore` (game.ts). The pull offset is
  `Enemy.pull`, added in `trackAfter` (motion.ts).
- **Campaign:** Rail costs 600 and Gravity Well 450. A version-2 save written before Rail existed loads with Rail at rank
  0 (`LATER_WEAPONS`, profile.ts).
- **Endless:** two late drops now give Rail instead of another gun: the peak sector's `e3-west` (was Fan) and Vesper's
  pressure-sector `ev2-west` (was Seeker). The drop budget is unchanged: three Fan, three Seeker, two Rail.
- **Presentation:**
  - Rail: a muzzle-to-head trail in the hero's cyan, fading over 0.14 s; a white-hot slug streak; a 0.06 recoil kick;
    a pickup icon of a slug piercing three rings; a crack sound.
  - Gravity Well: a black core in a spinning swirl ring, faint pull-radius and core-radius rings, a flight from the nose
    while arming, a flash on each swallow; a hum on launch, with the existing heavy blast at the collapse.
  - Lens (user, 28 October: "actually distort the view underneath"): the frame inside the swallow radius is drawn from
    further out and twisted, so the world underneath looks sucked in. High does it in the post composite
    (post-pipeline.ts, `lensed`). Low copies the drawn frame while a well is out and redraws the disc through the same
    warp. Sized to the swallow radius: any shot whose aim ray it bends is removed there, and the ship's row is never
    warped.
  - Not built: a drawn spiral of swallowed shots.
- **Tests:** tests/sim/rail-and-well.test.ts, Rail in the shared-tier test, and the old-save test in
  tests/campaign/profile.test.ts.

### Survey (§1.7)

The scripted perfect pilot flew every mission with Pulse and Rail at tiers 1 and 3, all on Standard. Every run cleared
without a hit.

Boss time-to-kill with 40 damage per slug averaged 8% faster than Pulse at tier 1. The centred slug never misses where
Pulse's offset twin bolts partly do, so Rail was not weaker on a lone target as intended. At **32**, Rail's boss time
(tier 1) is slower than Pulse's:

| Mission | Pulse | Rail |
| --- | --- | --- |
| Cold Vector | 117 s | 140 s |
| Deep Bloom | 129 s | 142 s |

Rail still gets about 1.5–2× the kills on lined-up waves; this is the intended payoff. A slug speed of 45 instead of 90
changed little. **Watch in play** whether its kill rate (and the credits from it) makes Rail the default choice.

