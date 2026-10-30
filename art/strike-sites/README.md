# Strike-site review sheets

In-game captures of the strike-site models (docs/33 § 6) from the playground's Sites lab (`playground.html`, Sites tab),
High tier at 430 × 860, SwiftShader. Each sheet shows every world finish of one site from the game camera, each cell
labelled with its world and state: intact, then destroyed (core gone; the blast over the site: scorch splash, pale ash
streaks, thrown debris, embers; the structure darkened, its lamps out). 30 October 2026, after the user's phase-1 review,
phase 2 and the integrator's review.

| Sheet | Site | Finishes |
| --- | --- | --- |
| `crash-site.jpg` | Crash site | Luna, Khepri, Vesper, Nacre, Amnion, Umbra |
| `airfield.jpg` | Airfield | Luna, Khepri, Vesper |
| `salvage-yard.jpg` | Salvage yard | Luna, Khepri, Vesper |
| `shield-depot.jpg` | Shield depot | Luna, Khepri, Vesper |
| `relay-station.jpg` | Relay station | Luna, Khepri, Vesper, Amnion (overrun) |
| `freight-terminal.jpg` | Freight terminal | Luna, Khepri, Vesper, Amnion (overrun) |
| `dark-spaceport.jpg` | Dark spaceport | Umbra, Nacre (ruin) |
| `prism-reactor.jpg` | Prism reactor | Umbra, Nacre (ruin) |
| `sealed-vault.jpg` | Sealed vault | Umbra, Nacre (ruin) |
| `gate-ring.jpg` | Gate ring | Umbra, Nacre (ruin), Amnion (brood-crusted) |
| `brood-hive.jpg` | Brood hive | Amnion, Nacre |
| `spawning-pool.jpg` | Spawning pool | Amnion, Nacre |
| `in-flight.jpg` | Crash site (Khepri), airfield (Luna, west), freight terminal (Vesper), prism reactor (Umbra), sealed vault (Nacre, west), brood hive (Amnion) | the real site cue on its side route with the world running and the guards firing, three frames each, the core destroyed after the first |

Stills: the real site cue (its authored guard and core, `siteCue`) placed on the east side route with its core at row 12
and the world held, so each site stands where the seat search put it, on the levelled pad, with its guard batteries
round it; the lab moves on 60 units of ground between sites (`siteLab.skip`), seed 8831. The models are Blender-built
(`tools/blender/strike_sites.py`), never the concept art (`art/concepts/strike-sites/`).
