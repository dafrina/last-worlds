# Endless planet cycle: bosses and hyperdrive jumps

Design v0.7 · 15 October 2026. The user asked how endless should cycle between worlds and wants the bosses in endless too. Agreed approach: a short hyperdrive jump between planets (not a gradual morph), and a boss closing each planet's stint, as docs/03 §8 already prescribed ("every third sector ends with a boss").

## 1. The cycle

| Sectors | Planet | Ends with |
| --- | --- | --- |
| 1–3 | Khepri | Bastion-9 (end of sector 3) |
| jump | Khepri → Vesper | |
| 4–6 | Vesper | Helion Ark (end of sector 6) |
| jump | Vesper → Khepri | |
| 7–9 | Khepri | Bastion-9 |
| … | repeats | difficulty keeps ramping and caps per docs/03 §8 |

Nacre joins the cycle when it exists. The cycle, its bosses and its timings are fixed content; there is no randomness in which planet or boss comes next.

## 2. Rules (simulation)

- **Bosses:** a boss sector stops adding ordinary squadrons before the boss enters, and the scroll eases to a stop for an arena exactly as in the campaign. Boss stats and attack cadence follow the endless difficulty ramp at that sector; endless warnings never scale. The boss may extend the sector by up to 60 s. If time expires, the boss retreats with no kill reward and the run continues (docs/03 §8). The player is never killed for low damage output.
- **Jump:** after the boss sector, whether the boss was destroyed or retreated, comes the jump: about 3 s with no combat, no hazards and the player invulnerable. During the jump the run's planet switches, the scroll resumes, and the next sector starts on the new planet with its own enemy roster: Khepri kinds on Khepri, Vesper kinds on Vesper.
- **Deterministic schedule:** sector boundaries, boss stops, arena ranges, jump windows and the planet for every stretch of distance must be computable from the run config alone (seed, mode, and the fixed pace ramp of docs/03 §8), never from combat state. That is why the scroll stays a closed-form function of time (the pace ramp, boss stops and jump). Export one pure schedule function from `src/content/` (e.g. `endlessSchedule(config)`: planet stretches by world distance, arenas, jump windows) that world and render both use.
- **Campaign:** campaign missions are unchanged and keep their single planet.

## 3. World

- `terrain.update(seed, distance, world)` takes the planet for the current stretch plus any arena from the schedule.
- Sections ahead of a planet switch are prefetched with the next planet's profile, so the jump never triggers a synchronous rebuild.
- Each endless boss stop gets its planet's arena: a flat platform on Khepri, open water on Vesper.

## 4. Look

- **Hyperdrive jump:** stars and streaks race past, a bright flash, then the new planet streams in. Under reduced motion it's a simple fade. The look rig (light, grade, water, craft models) switches at the flash.
- **Loading:** the next planet's assets load during the boss fight and are never fetched mid-jump. If they aren't ready, the jump lingers briefly rather than popping.
- **HUD and messages:** name the sector and planet, e.g. "SECTOR 4 · VESPER".
