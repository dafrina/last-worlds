# Sound design

How the game sounds and how the audio code is built: the sound effects and what triggers them, the synthesized
instruments, the mix, the eight world scores, the boss music, the title theme and the menu sounds, the settings and
the mobile lifecycle, and how to preview and test it all. Everything lives in `src/audio/`, plus the menu-sound wiring
in `src/ui/ui-sounds.ts`.

## 1. Direction and sources

- **Direction:** crisp, slightly arcade electronic weapons over atmospheric, rhythmically evolving world scores. Impact
  comes from a short upper-frequency transient and an audible midrange body, not only sub-bass, so it reads on a phone
  speaker. The music stays under the combat. Shield and life alarms, specials and boss events win over small impacts.
- **Everything is synthesized in code.** Every effect, instrument patch, melody, chord progression, drum pattern and
  arrangement is TypeScript in `src/audio/`. There are no recordings, downloaded loops, sample libraries, external audio
  services or licences, and nothing audio is fetched at runtime. Samples are rendered once per page from that code
  (section 3).
- **Deterministic.** Noise comes from a private seeded generator (`noiseSource` in `src/audio/dsp.ts`); the irregular
  touches in the scores come from hashes of the sixteenth (`scatter` in `score.ts`, `nuance` in `mixer.ts`). Audio never
  calls `Math.random()`, never draws from the game's random streams and never changes `RunState`. Every render of a
  passage is identical.
- **Previews are not assets.** The WAV files the preview tools write (section 13) go to the git-ignored `lookdev/`
  folder for listening; the game never loads them.

History: on 11 November a trial with recorded instrument samples was built and rejected by the user ("still sound
cheap"), then removed entirely: no recordings, no decoder, no extra downloads. The synthesized instruments were improved
instead.

## 2. What plays

`SoundObserver` (`src/audio/events.ts`) reads the run state after each frame and turns changes into cues; it never
writes to the simulation. The cues name a `Sound` (`src/audio/samples.ts`); the mixer plays it at its level in `LEVELS`
(`mixer.ts`).

| Event | Sound | What it is |
| --- | --- | --- |
| Main weapon volley (Twin Pulse, Fan Cannon, Seeker Array, Rail Driver) | `pulse`, `fan`, `seeker`, `rail` (the `WEAPON_IDS`) | One sound per volley. Twin Pulse: a click and a chirp falling fast through the upper mids, nothing under about 700 Hz. Fan Cannon: two detuned chirps and a short spray. Seeker Array: a rocket leaving the rack, a low thump, an ignition hiss whose band climbs, sparks. Rail Driver: a crack, a falling zap and a short metallic ring. Each 0.07 to 0.16 s long. |
| Interceptor's Shred spinning up | the weapon's own sound | As the guns spin up (`player.spin` against `SHIP_PERKS.shredCap`), each shot plays up to a major third higher and 35 % quieter, centred, so the faster stream rises into a whine instead of getting louder ([docs/42](42-specials-and-perks.md)). |
| Enemy shot appears | `enemy` | A quieter, lower FM shot; only the first new visible enemy shot of a frame. |
| Hit on an enemy | `impact` | A very short metallic tick; at most two a frame. |
| Enemy destroyed / heavy blast | `explosion`, `heavy` | A crack, a saturated midrange body, a falling pressure wave and scattered debris; `heavy` is the bigger version. At most three a frame, visible ones only. |
| Shield charge lost | `shield`; `shield-break` for the last one | The field thud: a punchy low thud (90 falling to 45 Hz) under an electric whine falling away, with a noise click, 0.35 s. The last charge plays the same sound but keeps its own event, so the music ducks for it. |
| Life lost | `life` | The deny buzzer: two short harsh square pulses on a grinding minor second (G3 against G♯3), driven, 0.32 s. The ship's own explosion is not played on top. |
| Pickups | `part`, `upgrade`, `pickup` | A part: a heavy clank of struck steel whose middle modes ring on, then two clinks rising, 0.75 s. A shield cell that adds a charge, a power cell or a new weapon: the shield's bell (partials 1, 1.498, 2.71) rising E, B, E. Credits, or a shield cell at full shields: two brief blips. |
| Special charged | `ready` | Three quick rising FM blips (D, A, D). |
| Special fired | the special's id | Seeker Rack (`seeker-rack`): four launch transients 65 ms apart. Siege Lance (`siege-lance`): a sustained energy texture as long as the beam (`SPECIALS['siege-lance'].duration`). Shockwave (`shockwave`): a broad pressure impulse and a falling energy body. Orbital Strike (`orbital-strike`): a rolling barrage, nine heavy thumps 0.14 s apart walking past under a low rumble, 1.6 s; it came with the Orbital Strike on 14 November and replaced the Gravity Well's hum. |
| Hazard | `warning`, `beam` | A pulsed warning tone when a visible hazard starts its warning, an energy texture when it fires. The visual warning is always the authority. |
| Boss | `boss-arrival`, `boss-phase`, `heavy`, `boss-death` | A low pulsing harmonic signal on arrival and a shorter one on each phase change. The kill plays `heavy` as the module explosions start; the death roar (`boss-death`, a layered boom with a late sub) waits for the final big bang (the `bossBlast` effect). |
| Launch warp | `whoosh`, a fifth up | Noise through two bands climbing from 220 Hz to 7 kHz; transposed so it peaks as the shortest warp breaks out (1 s). Played only if its sample is already made (section 11). |
| Endless planet jump | `warp` and `whoosh` | A rising tone, and the whoosh peaking on the jump's flash (1.5 s), then passing. |
| Mission complete | `win` | A short ring: a bright open chord (C, G, D and a high G; no third, no fanfare) rung like a bell, eighteen strokes a second for half a second, then ringing out; 1.4 s, transposed into the world's key (`successKey` in `engine.ts`). |
| Run over | `loss` | A short falling motif (C, G, D). |

The sounds avoid each other's families on purpose: bells are pickups, chirps are shots, booms are explosions, so the
two hit alarms (a thud and a buzzer) each read as a hit. The user chose them on 12 November from four candidates each,
after the 11 November klaxons and, before that, a pitched-down bell ("the gong").

Rules that keep the mix readable:

- **Real events only.** A volley sound plays when the weapon actually fires (`nextVolleyAt` advances); holding a
  direction or having no target makes no sound. Terminal cues come from the real run, not the afterglow copy that
  animates the ending.
- **Visible space only.** Enemy shots, impacts, explosions and hazards play only inside the view; offscreen battles are
  silent.
- **Quotas and cooldowns.** Per frame: one enemy shot, two impacts, three explosions, one plain pickup. Per sound: a
  repeat closer than its `COOLDOWN` (`mixer.ts`; 25 ms by default) is dropped. The Seeker Array's 50 ms keeps each
  rocket a launch at the highest tiers.
- **No replay.** A paused frame plays nothing, and a time jump (a retry, a debug fast-forward) resets the observer
  instead of replaying a backlog.
- **Pan and pitch.** Cues pan with their x against the camera, within ±0.65. Untuned sounds vary up to ±3.6 % in pitch
  by a fixed variant; tuned sounds and alarms play at their own pitch.

## 3. Samples: synthesis, cache and memory

- **One cached mono sample per sound and per instrument,** at `SAMPLE_RATE` (32 kHz), pitched by playback rate. No
  oscillators are created per note.
- **Effects** (`synthesize` in `samples.ts`): the sounds reworked since 11 November are written one by one in
  `REWORKED` (each scaled to its own peak); the older effects come from one shared loop, peak-limited to 0.85. Every
  sample gets anti-click edges and DC removal.
- **Instruments** (`src/audio/instruments.ts`): each patch in `PATCHES` has a length, the note it sounds at rate 1
  (`BASE_PITCH`), and a loudness target (RMS over a window) that `finish` in `dsp.ts` matches, through a soft knee for
  sharp attacks, with peaks at or below 0.85. Matching loudness keeps the scores' written note gains in balance when a
  patch is rebuilt.
- **The synthesis kit** (`src/audio/dsp.ts`): PolyBLEP band-limited saws and pulses (`Saw`, `Pulse`), detuned unison
  stacks (`Unison`), rotation sines for many-partial tones (`Rotor`), a topology-preserving state-variable filter that
  stays stable while its cutoff moves (`Svf`), a one-pole filter (`OnePole`), soft saturation (`drive`) and the seeded
  noise. Plucked strings are Karplus–Strong (`pluck` in `instruments.ts`).
- **Made at boot, off the main thread.** `prefetchSamples` (`sample-bank.ts`) starts a module worker
  (`sample-worker.ts`) that synthesizes every sample in `SAMPLE_IDS` order and hands each over as it is made. The order
  is: the menu sounds and the whoosh first (they play in taps), then the flight's effects, the world instruments
  (`LEVEL_INSTRUMENTS`, the title theme's lead among them), the boss instruments (`BOSS_INSTRUMENTS`), and last what
  only a boss fight, a planet jump or the results need. The mixer takes a sample into an `AudioBuffer` the first time it
  plays it (`takeSample`); a sample not made yet is made on the spot. Without a worker, samples are made one per 16 ms
  task on the main thread. Synthesizing everything inside the first launch tap used to hold it about two seconds
  (29 October), which is why this exists.
- **Memory:** 92 samples, 15,627,520 bytes of PCM (14.9 MiB; measured 17 November). The budget is 15 MiB, asserted as
  `15 * 1024 * 1024` in `tests/audio/audio.test.ts`, `tests/audio/boss-music.test.ts` and `tests/browser/audio.spec.ts`;
  about 100 KB are left. The hall's impulse and the Web Audio nodes come on top.

## 4. Instruments

The patches in `src/audio/instruments.ts`, by family (the types name them):

| Family | Voices | Played by |
| --- | --- | --- |
| Level voices | `kick` (Umbra's own), `snare`, `hat`, `brush`; the round basses `bass`, `round-bass`, `foundry-bass`, `bio-bass`, `void-bass`; `saw-lead`, `piano`, `glass`, `bloom-pad`, `breath-pad`, `nerve`, `heart`, `bone`, `void-tick` | the world scores |
| World voices (`WorldInstrument`) | `snap-kick`, `forge-kick`, `signal`, `anvil`, `steam`, `pearl`, `frost`, `crack`, `chitter`, `night-click` | Luna, Khepri, Nacre, Vesper, Amnion |
| Corona (`CoronaInstrument`) | `harp`, `harp-high`, `solar`, `bowed`, `ember`, `doum`, `tek` | Corona |
| Nahara (`NaharaInstrument`) | `horn`, `choir`, `stone-drum`, `rattle`, `conduit` | Nahara |
| Umbra (`UmbraInstrument`) | `inhale`, `glint`, `obsidian` | Umbra |
| Boss voices (`BossInstrument`) | `boom`, `riser`, `crash`, `braam`, `stab`, `tom`, `taiko`, `boss-kick`, `timpani`, `spiccato`, `drive-bass`, `growl`, `strings` | the boss stems and the title theme |
| Title theme (`MenuInstrument`) | `anthem` | the title theme's lead |

What shapes them:

- **Kicks** (`punchKick`): a beater click and a slap of noise in the first milliseconds, a body that drops fast in pitch
  and dies quickly, saturation so the knock reads in a phone's midrange, and a short knock around 190 Hz. `snap-kick`
  (Luna, Nacre, Vesper, the title theme), `forge-kick` (Khepri, harder), `boss-kick` (the fights) and Corona's `doum` are
  built this way. Umbra keeps its own older `kick`, frozen with its score.
- **Basses** (`roundBass`): clean and round in every world and fight, a sine fundamental with faster-fading second and
  third harmonics and a soft felted onset; no saw, no saturation (user, 11 November: "too sawy and dirty"). They differ
  by decay and harmonics; the fight basses (`drive-bass`, `growl`) get their drive from rhythm and length.
- **Leads:** Khepri's five-voice unison saw lead; Luna's felt piano (paired detuned strings, stretched partials, a
  two-stage decay); Vesper's bell, clean and icy like a triangle (five sparse steel-rod partials, each beating against a
  twin 1.6 cents away); Nacre's pearl, a soft-mallet vibraphone with its motor's tremolo; Amnion's beating nerve tone;
  Corona's two-string Karplus–Strong harps in a dark body; Nahara's ancient horn (three saws through a filter that blares
  open on the attack).
- **Pads and drones:** Vesper's frost (detuned sines over thin wind), Nacre's bloom (thinned below 200 Hz so it stays
  above the drums), Amnion's membrane (formant filters), Corona's solar drone (a unison saw stack whose filter swells like
  heat, with a plasma roar), Nahara's wordless choir (an open "ah" through three formant bands).
- **Umbra's "reversed" voices** are synthesized backwards, never reversed recordings: `inhale` (an inhaled chord swelling
  under an opening filter, cut at its end), `glint` (bell partials growing toward the end), and the forward `obsidian`, a
  dark ring-modulated bell with non-integer partials.
- **The orchestra for the fights:** a taiko-like ensemble drum, tuned timpani (principal tone and the inharmonic 1.5,
  1.98 and 2.44 modes), spiccato strings, a sustained string ensemble, brass stabs, braam, boom, crash and riser. Pitched
  boss voices keep their unison within ±6 cents and the strings' vibrato within ±3.5 cents (user, 11 November: the fights
  "seem like they drift into false notes"); inharmonic partials are kept to the drums, crash and timpani.
- **`anthem`**, the title theme's lead: a horn section of three players, each a band-limited saw through a lip filter
  that brightens with that player's loudness, with its own entry (0, 8, 14 ms), tuning (−4, 0, +4 cents), drift and late
  vibrato; breath and a short lip buzz on the attack, no click; a slight overshoot, a settle, then a bloom.

## 5. The mix

One `AudioMixer` (`src/audio/mixer.ts`) serves the game and every offline preview, so previews use the real mix.

**Signal flow:**

```
level score ── (keyed voices: sidechain) ── bed ─────────┐
boss stem ── (keyed voices: sidechain) ── fader ── glue ─┤
title theme ── lead, accompaniment, drum buses ── fader ─┼── music fader ── duck ──┐
hall return, ensemble ───────────────────────────────────┘                         │
effects ── effects fader ──────────────────────────────────────────────────────────┴── master chain ── gate ── out
menu sounds ── ui fader ────────────────────────────────────────────────────────────────────────────────────── out
```

- **Faders:** music is the Music setting × 0.72; effects the Effects setting; the menu sounds the Effects setting × 0.85.
  The hall and ensemble return into the music fader, so music at zero silences them too.
- **Master chain:** a 32 Hz high-pass, a compressor (−10 dB, 4:1, 4 ms attack, 170 ms release), a fast limiter at −2 dB
  and the gate, which opens only while a flight or the title theme plays. The menu sounds bypass the chain and the gate,
  so a paused flight's panels still sound.
- **Voice pools** (`VOICE_LIMITS`): the level score, the boss stem, the effects, the title theme and the menu sounds each
  have their own capped pool, so the boss stem can never thin the score and combat can never thin either. When a pool is
  full, the new voice replaces the lowest-priority voice ending soonest (fading it over a few milliseconds), or is dropped
  if every voice outranks it. Effect priorities are in `PRIORITY`: impacts and enemy shots lowest, alarms and the boss's
  death highest; in the boss stem, stingers outrank drums and bass, then strings, the ostinato and ticks.
- **The player's touch** (`humanize`): a fixed timing and velocity per note, from a hash, never written into the score.
  One timing per sixteenth and part, so a chord's tones strike together and a part never smears against itself: drums and
  basses (`TIGHT`) within ±2 ms, other parts 2 ms early to 4 ms late, velocity ±6 %. Reversed voices and risers
  (`EXACT`) keep exact time. Umbra's frozen score keeps the older per-note touch it was approved with (`legacy`).
- **One note at a time:** a bass (`MONO`) damps its previous note as the next starts (silent within 60 ms), and a melody
  marked with a `part` does the same within 120 ms (80 ms in the title theme), so lines never ring over themselves.
- **Space:** one stereo convolution hall for all music: 18 ms pre-delay, seven early reflections that differ between the
  sides, a 2.3 s tail whose highs die first; its return is high-passed at 170 Hz so it never thickens the bass. Pads,
  drones, strings and the choir (`ENSEMBLE`) also feed a stereo ensemble: two short delays, one per side, slowly
  modulated. No phase-inverted widening, so mono playback keeps its level. Combat effects stay dry.
- **Sidechain:** a kick note carries a key (`duck` on the `Note`). Only the keyed voices dip, within 3 ms, recovering
  over about a quarter of a beat: the basses, the synth leads (`saw-lead`, `nerve`), the spiccato and the brass stabs
  (`KEYED`), in the score, the stem and the title theme. Pads, acoustic leads, reverb returns and effects never dip. Two
  kicks within 30 ms (the score's and the stem's) make one dip, the deeper. Depths per world, for the level score and
  each boss stage, are in `SIDECHAIN` (`score.ts`): gentle in the ambient worlds, deeper in the fights and deepest in
  overload, none in Umbra's level score.
- **The level bed:** in a fight the level score steps back slightly as the stem takes the weight (`BED` in
  `boss-score.ts`: about −0.5 dB in core and −1.5 dB in overload), moving on bar lines and stinger hits, back to full when
  the fight ends.
- **Ducking:** a life lost, the last shield charge, a boss arrival, a boss's death and the Shockwave lower the music by
  about 7 dB for a fraction of a second.
- **Boss stem bus:** a gentle glue compressor (−10 dB, 1.8:1, 15 ms, 250 ms) rounds off its drum and brass peaks before
  the music fader, so they never push the master compressor that the combat sounds share.
- **Title theme bus** (section 9): its own lead, accompaniment and drum paths under one fader whose hall sends fade with
  it.

## 6. The world scores

`src/audio/score.ts`. Each world has its own authored 32-bar cycle (`THEMES`, one arrangement function per world called
by `scoreStep`). A step is a sixteenth; the clock (`ScoreClock`) schedules 120 ms ahead every 40 ms and, after a stall,
skips missed sixteenths instead of playing a burst. All share one form: an opening (bars 1–8), a developed phrase
(9–16), a breakdown (17–24) and a return (25–32); the chords change every two bars through four chords. No phrase
repeats unchanged: in Luna, Khepri, Nacre and Vesper the melody's motif plays in the first two bars of each four and its
mirror image answers in the next two, and those melodies, written as intervals over the chord root, are held to each
chord's mode (`inMode`, the modes in `THEMES` `scales`); Amnion, Corona, Nahara and Umbra write their lines out per
phrase or per chord.

| World | Title | Tempo | Centre | Character |
| --- | --- | ---: | --- | --- |
| Luna | Far Side Signal | 94 | D, mixolydian with a lydian F♯ over C | Lonely and human: felt-piano chords struck together, a three-note melody, a four-note round bass, brushes, a soft snappy kick, Luna's own written played timing, and a distant beacon pinging twice at the end of every four bars in the opening and breakdown, once in the return's last bar |
| Khepri | Foundry Afterimage | 118 | A minor and its dark semitone shifts | The foundry: a hard forge kick, mechanical eighth hats and a backbeat snare, the saw lead four notes a bar (root, third, fifth, third) with chord stabs, a round bass in four ringing notes, a tuned anvil every six sixteenths only where nothing else strikes, steam let out of the press every four bars |
| Nacre | Dreams Beneath the Bloom | 106 | C; B♭ major's modes over C, E♭ and F, then D dorian | Dreamy: the pearl sings three notes a bar over a thinned bloom pad, with a three-note bass, a snappy kick, brushes and hats you can hear |
| Vesper | Below the Ice Line | 88 | B | Ambient: two icy bells every second bar, an octave above the written melody, left to ring; a frost pad, two bass notes a bar, one soft kick, and now and then the ice cracking far off |
| Amnion | Something Beneath the Skin | 92 | G, Phrygian and uneasy | The night: a breathing membrane pad, an organic bass, paired heartbeats that land like a kick, dry bone clicks, a three-note nerve melody (a semitone creep, then the tritone), and now and then a lone creature calling far off in the hall, never on the heartbeat or near the melody, placed by `scatter` |
| Corona | Hymn for a Swollen Sun | 110 | E, modal over a drone | No chord progression: an open E–B fifth, its third section adding the ♭2 (F) as a colour. A lament of a few long notes on the higher harp (`CORONA_LAMENT`) in maqam Bayati with its half-flat second, Saba over the ♭2, with slow slides; the low harp plucks once per ten-sixteenth cycle (a sama'i thaqil's 10/8), drifting across the bar and meeting it again every five bars; a darbuka in maqsum, then baladi in the return (`MAQSUM`, `BALADI`); the solar drone, ember crackle, bowed metal every four bars |
| Nahara | Silent Empire | 90 | D, nothing resolves | A procession through ruins: D minor with its ninth against the third, a B♭ augmented triad, a chromatic step to F♯ minor, A suspended. A wordless choir on each chord, the stone processional drum, a sistrum on the backbeat, the conduits' crystal arpeggios, and the ancient horn's three long notes over each chord (`NAHARA_HORN`) |
| Umbra | Where the Light Goes Backwards | 84 | F♯ | Chords a semitone, a tritone and a semitone away (F♯, G, C, F), each with one harmonic-series tone off the twelve-note grid. Every bar line is breathed in by an inhaled chord that stops dead on it; the lament on reversed glass (octave, a three-quarter-tone step above it, fifth, a quarter-tone-flat fifth) lands on obsidian strikes; the forward obsidian bell answers with a neutral third and a quarter-tone-flat seventh (`UMBRA_ANSWER`); a precise void pulse (void bass, a kick on one and three, off-beat ticks). The breakdown is a line through silence: breath, one tick a bar, a distant toll |

Notes on the table:

- **Tempo and centre** come from `THEMES` (`bpm`, `root`; the tempos are pinned in `tests/audio/boss-music.test.ts`). The
  success ring transposes to the same centre (`successKey`).
- **Corona and Umbra yield:** their accompaniments give way to the lament. A tone that would grind against a lament note
  outside the chord moves to the nearest chord tone that does not, or is left out (`yieldTo`).
- **Umbra's reversed notes** are scheduled from an earlier sixteenth and delayed within it, so their hard ending falls
  exactly on the grid (`landingNote`, up to `LANDING_STEPS` ahead). Pitches may be fractional; the mixer plays them by
  rate.
- **Umbra is frozen.** The user loved it (11 November: "i love love love the umbra sound"), so its 32-bar cycle and the
  samples it plays are pinned note for note and sample for sample (`FROZEN`; `tests/audio/boss-music.test.ts`). Nothing in
  its level score keys the sidechain.
- **Every cycle is pinned.** Each world's whole cycle is fingerprinted in `tests/audio/boss-music.test.ts`: a change there
  is a change to the composition, never a side effect of sound design.
- **Fewer notes:** the melodies are sparse and mostly stepwise (user, 11 November: "just relax the amount of notes,
  simpler melodies").
- **Endless** switches the score at the planet switch: the old score's voices stop with a short fade and the new score
  starts from its first bar 70 ms later, so no beat doubles.

## 7. Boss music

`src/audio/boss-score.ts`. The level score plays on unchanged through a fight, on its own clock, with its melody, rests,
breakdown and phrase position. An additive stem on the same clock and harmony changes arrangement with the boss's phase
(read only, through `bossStage`). There is never a second copy of the lead or pads, a restart, or a second clock that
could drift.

| Stage | Boss phases | What the stem adds | Stinger into it |
| --- | --- | --- | --- |
| Flight | none, destroyed | nothing: the level score alone | |
| Modules | arrival, batteries | a few heavy drum hits a bar; long bass notes on the half bar; a low spiccato pulse on the beat (half notes in the spacious worlds); timpani and low strings (root and colour tone) on each chord; a quiet braam on each phrase; toms and snare filling into each phrase | Entrance, on the next bar line: a riser peaking on the hit, toms climbing in the last beat, then crash, drum, kick, timpani, boom, braam on root and colour tone, a deep tom |
| Core | core | a fuller drum pattern; the bass in plucked eighths; a sixteenth spiccato ostinato through the chord in 3-3-2 accents (eighths in the spacious worlds); a brass chord and timpani on each chord change; sustained strings; a snare pickup every fourth bar and a fill into each phrase | On the next beat: a snare pickup, then crash, drum, kick and timpani with a boom and a brass chord (a step back down gets the pickup and the plain hit) |
| Overload | overload | driving drums in 3-3-2; the bass in short eighths with octave leaps; the ostinato doubled an octave up over low sixteenths; brass on each change and syncopated; boom on each chord, crash and braam on each phrase; brighter strings; a timpani roll and a riser into each phrase | On the next half bar: a riser, a thirty-second snare roll and spiccato rushing up the chord, one sixteenth of silence, then the biggest boom, braam in octaves, a four-voice brass chord, timpani and two drum strokes |

- **Growth by arrangement, not level:** each stage is denser than the last (the test asks core for more than 1.3 times
  the modules' notes, overload for more than 1.4 times core's, and nearly every off-beat sixteenth sounding in overload).
  The bed steps back as the stem grows (`BED`), so a fight builds by density, register and voices rather than loudness.
- **An orchestra, not a drum machine:** no four-on-the-floor, no hats or claps, and the snare only fills into phrases.
  The fights' kick (`boss-kick`) sits under the big drum's strongest strokes (each half bar's first, and in overload the
  3-3-2 accents) and under every stinger's hit, and keys the sidechain at the stage's depth; lighter drum strokes key it
  at 0.6 of that.
- **Each world stays recognisable** through its kit (`KITS`): Luna keeps its played timing and brushes; Khepri has the
  heaviest drums and its anvil striking chord tones two octaves up; Nacre is the softest (brushes, light drums); Vesper
  and Umbra keep a spacious half-time pulse and an ostinato two octaves up; Amnion's drum is its heartbeat, racing
  unevenly in overload, with bone ticks; Corona's drums are the darbuka (doum where the maqsum puts it, tek between);
  Nahara's are the stone drum and the sistrum; Umbra adds inhaled chords that stop dead on the stem's chord changes
  (modules) and bar lines (core and overload), and in overload reversed glass sucking into every beat.
- **Synchronization:** when the engine sees a new stage it calls `BossArranger.request` with the first sixteenth the
  lookahead has not scheduled. The change lands on the grid after it (`switchStep`): the next bar line at least six
  sixteenths ahead for an entrance (room for its riser), the next half bar at least four ahead for overload, the next
  beat at least two ahead otherwise. Stingers fill the sixteenths up to the switch. A change asked for before the previous
  one lands takes over its grid line. A resumed or stalled clock skips stingers it jumped past.
- **Fader:** the stem's fader opens at once when a fight starts; when it ends (the boss destroyed), the stem plays its
  last stage for one more bar while the fader closes over that bar, then the level score is alone again. A new run or a
  planet switch clears it.

## 8. Harmony and its audit

`src/audio/harmony.ts` and `src/audio/harmony-audit.ts`.

- **A clash** (`clash`) is a minor second, major seventh or tritone between two notes heard together, checked within a
  quarter tone so Umbra's microtones are not mistaken for one. It is not a clash if both notes are tones of the chord in
  force.
- **The stem yields to the melody:** each pitched stem tone is checked against the melody heard as it strikes and any
  passing note in the next two sixteenths (`consonantWith`); a clashing tone moves to the nearest chord tone that does
  not clash, or is left out.
- **A tone still heard after a chord change belongs to both chords** (`steady`), or moves to the nearest tone that does.
  Stinger lead-ins rush up the chord sounding at the time, and risers climb to the landing chord's root.
- **How long a note is heard** (`soundingSteps`, `heardWindow`): held voices for their length, ringing ones until they
  have faded a lot, short ones briefly; a reversed note belongs to the chord it lands on.
- **The audit** (`audit`, `auditMenu`) replays a whole cycle per world and stage and lists every clash between the
  melody, the score's harmony and the stem. `tests/audio/harmony.test.ts` asserts:
  - no boss-stem note clashes with the melody, the harmony or another stem note, in any world or stage;
  - no clash in any level score except Amnion's, whose tritones over its uneasy chords are its character (the count is
    pinned in the test);
  - every pitched stem note, stingers and risers included, stays in its chord or mode for its whole heard length;
  - every melody but Umbra's stays in its mode.

## 9. The title theme "Last Worlds"

`src/audio/menu-theme.ts`. The menu's own music (user, 15 November: "a very recognizable, catchy and fitting to the style
menu music and sounds for button presses"; then "it should sound more heroic and mysterious"). The melody makes it
heroic and familiar; the harmony makes it mysterious.

- **Basics** (`MENU_THEME`): D minor, modal, at 100 BPM with half-time weight; 32 bars (76.8 s) that loop without a
  seam. Form: intro (4 bars), hook (8), B section (8), the hook again, bigger (8), turnaround (4).
- **The melody** (`HOOK`, `B_LINE`), a conventional heroic line in D natural minor, every hook bar on the call's dotted
  rhythm (dotted quarter, eighth, half):
  - the call 1-5-8 (a pickup A3, then D4, A4, D5); the answer 3-2-1 (F, E, D); rising B♭, C, D, then C, D, E, the
    question on E;
  - the call again; the climax F, G, A; down B♭'s arpeggio (F, D, B♭); home on A, C, D;
  - the B section in long notes and two-bar rhymes: up G minor's arpeggio to D, the 5-6-5 turn over E♭ (B♭, C, B♭), up
    B♭'s arpeggio to D, and down to A, the dominant, into the hook's pickup.
  - Strong beats are tones of the chord sounding, the eighths between them steps, never two lead notes at once.
- **The harmony:** open fifths and suspended seconds, no thirds, one chord a bar. Intro D5 D5 E♭5 D5; hook D5 D5 B♭sus2
  C5 | D5 D5 B♭sus2 D5; B section G5 G5 E♭5 E♭5 B♭sus2 B♭sus2 G5 A5 (the A without its C♯: no major cadence);
  turnaround E♭5 E♭5 B♭sus2 C5. The ♭II (E♭) colours the intro, the B section and the turnaround.
- **The arrangement:**
  - **Lead:** `anthem` (section 4), centred, doubled by the string section an octave down under its strong notes (each
    releasing as the next melody note arrives) and by soft brass stabs on the hooks' downbeats; in the last hook the glass
    doubles it an octave up through the second call, the climax and the descent (its fifth to seventh bars).
  - **Pad and choir:** the boss strings play each chord, wide; Nahara's wordless choir holds the fifth and octave over
    it in chosen bars (`CHOIR`); low braams on the drone and the arrivals.
  - **Ostinato:** spiccato strings in the chord's register, grouped 3-3-2 (the game's rhythm): eighths in the first
    hook, the B section's first half and the turnaround's start; sixteenths building into the first hook, in the B
    section's second half and in the last hook.
  - **Bass:** the round bass on the call's rhythm, driving on in the last hook, half time in the B section.
  - **Mystery:** Umbra's reversed swell (`inhale`) breathes into four bar lines (`SWELLS`), carrying only tones both
    chords share; a cold glass shimmer two octaves up in the intro, the turnaround and over the B section's held notes;
    the glass calling the 1-5-8 motif from afar before the first hook (`TEASE`).
- **The drums** (user, 16 November: "refine the drums now of the theme menu song"), all reusing the game's own drum
  samples:
  - kick: the snappy kick, its tail released after 0.2 s so the low end stays the bass's; each kick ducks the bass and
    the ostinato, never the lead;
  - snare: the snare's crack and rattle over a tom tuned to its shell, with a darbuka rim's snap on top;
  - ensemble drums: up to three taiko players 11 and 19 ms apart, slightly detuned, spread left and right, with Nahara's
    stone drum under the biggest hits;
  - timpani rolls in sixteenths into each hook, single strokes opening the B section's halves; a cymbal swell (the riser)
    landing on each hook and softer ones on the B section and the turnaround; two crashes either side on the hooks'
    downbeats, single crashes on the other arrivals.
  - The programming builds across the form: distant drums in the intro; the kick on the call's rhythm, a half-time snare
    and a taiko on each downbeat in the first hook; half time with a roomier snare in the B section; in the last hook a
    third kick, three drummers, the stone drum on the call bars, soft off-beat hats and a ghost snare; short pickups into
    sections, never busy.
- **Clean bar lines:** a pitched note that would still ring into a chord it grinds against is released 0.25 s before that
  bar line, so its release and the hall's early reflections end on it (`holdFor`, the `hold` field of a `Note`); a short
  note that cannot sound before then is left out. Every note starts at its pitch: no scoops or glides (they pulled note
  starts 15 to 74 cents off; measured and removed on 15 November).
- **Its own mix** (`mixer.ts`):
  - the lead and its doublings on one bus, high-passed at 90 Hz, with four early reflections (11 to 29 ms, alternating
    sides) and a hall send pre-delayed 35 ms, so it sits like a section in a room;
  - each lead note gets the horn's two resonances (around 0.5 and 1.2 kHz, `formant`) and a low-pass from 2 to 5.6 kHz
    (`tone`), both stronger the harder the note is played;
  - the accompaniment is dipped 3.5 dB around 2.2 kHz to leave the lead room, and meets the lead in a gentle glue
    compressor;
  - the drums have their own bus outside that glue, so a hit never pumps the lead: a 2 dB dip at 2.5 kHz, a drum glue
    that lets transients through, and a room of eight early reflections (7 to 31 ms) across both sides, high-passed at
    120 Hz;
  - the fader (`MENU_LEVEL` of the music fader) carries the hall sends too, so a fade takes the reverb with it; the
    theme has its own voice pool.
- **Checks** (`tests/audio/menu.test.ts`): the cycle's fingerprint; the hook's call, answers and phrase ends; D natural
  minor only, strong beats on chord tones, about two lead notes a bar; every chord an open fifth or suspended second;
  `auditMenu`, stricter than the worlds' audit because the accompaniment is checked against itself too; a 32nd-by-32nd
  check that no note, tail, release or early reflection sounds against the chord, across the loop's seam too; every voice
  listed in `MENU_INSTRUMENTS`; the `anthem` sample's hash.

## 10. Menu sounds

One family, crisp and short, in the glassy, metallic world of the pickups and the theme (`UiSound` in `samples.ts`),
wired once for the whole UI by delegated capture listeners in `installUiSounds` (`src/ui/ui-sounds.ts`). They play through
their own path past the master gate, so a paused flight's panels sound too.

| Sound | What it is | Where (`uiSoundOf`) |
| --- | --- | --- |
| `ui-press` | a click and a short bright blip on A6 with its fifth above | any other button: menu buttons, hangar entry, settings, help, resume, pause |
| `ui-back` | the same click, its blip falling an octave to A5 | back buttons, quit, return to menu, cancelling a load |
| `ui-select` | a small glass tick on D7 | radio groups, tabs, mission arrows, tier pips, a tried-on design, a paint colour or a checkbox |
| `ui-tick` | the faintest click on G7, pitched over an octave by the slider's value | the Music and Effects sliders |
| `ui-purchase` | a latch's click, then the upgrade bell rising E6, B6, E7 over a soft shimmer | hangar BUY and UPGRADE, a design bought (`data-sound` set in `src/ui/hangar.ts`) |
| `ui-equip` | a low clunk under a metallic catch | hangar EQUIP, fitting an owned design |
| `ui-deny` | two low, muted knocks (not the flight's buzzer) | a press on a disabled button: not enough credits, a tier not bought, a locked mission (where the browser delivers it; current Chromium does) |

- **Silent buttons:** the special button (gameplay) and the launches (LAUNCH MISSION, ENDLESS, FLY AGAIN), which the
  warp's whoosh covers.
- **Rules:** they follow the Effects volume and Sound off; a repeat closer than 40 ms is not played again (`UI_COOLDOWN`:
  longer for the slider tick, a purchase and a refusal). They are first in the boot order and are skipped, never made in
  the tap, if not ready yet.

## 11. Settings, controls and lifecycle

- **Settings** (`src/audio/settings.ts`, `mountAudioSettings`): Music and Effects sliders (0–100 in steps of 5) added to
  the Audio group of the settings panel ([docs/16](16-flight-command-ui.md)); the panel's own Sound on/off radio mutes
  everything. Defaults are `DEFAULT_AUDIO` in `engine.ts` (user, 15 November: music 75 %, effects 55 %). Preferences are
  stored under `AUDIO_STORAGE_KEY` when a setting changes, apart from the campaign save and statistics; unreadable or
  unavailable storage falls back to the defaults for the session (`sanitizeSettings`).
- **Gesture unlock:** browsers allow sound only after a gesture. The first tap or key creates the `AudioContext` and the
  mixer (`unlock` in a flight, `menu` in the menus; `src/main.ts`). Before that the game is silent. A device that cannot
  play audio, or fails to start it, never stops a flight.
- **Flight start:** a launch tap fades the title theme out over the warp (0.9 s) under the warp's whoosh (`launch`); the
  world's score starts when the flight does, after the warp (`start`), so the two never overlap. Nothing is synthesized
  in that tap: the whoosh plays only if its sample is made.
- **Pause:** pausing, a hidden tab, a window blur, turning the phone sideways and waiting for the next world to load in
  an endless jump all close the master gate and stop queued voices (`pause`). The resume button's tap unlocks audio
  before the three-second countdown ends; the score resumes at the next chord boundary. After two seconds without a
  flight or the theme, the audio device is suspended once the tails have faded behind the gate.
- **Mute and zero:** Sound off stops every voice and the theme; Sound on again in the menu restarts the theme. Music at
  zero stops the music and the theme, Effects at zero the effects and menu sounds.
- **Flight end:** the score stops, the result's sound plays, and the title theme returns 3.2 s later
  (`MENU_AFTER_RESULT`), fading in under the results. Leaving a flight from the pause panel brings it back too.
- **The title theme** starts on the first interaction in the menu, once every voice it plays is made
  (`MENU_INSTRUMENTS`), and fades in over 3 s; it plays on through the menus until a launch. A hidden tab pauses it,
  returning to the menu resumes it, and it follows the Music volume and Sound off.

## 12. Code boundaries

| File | Responsibility |
| --- | --- |
| `src/audio/events.ts` | `SoundObserver`: reads the run state, never changes it; coalesces volleys, applies quotas and visibility |
| `src/audio/samples.ts` | The effect and menu sounds, the `Sound` list, `synthesize` for every sample, the boot order `SAMPLE_IDS` |
| `src/audio/instruments.ts`, `dsp.ts` | The instrument patches and the offline synthesis kit: oscillators, filters, loudness matching, edges and headroom |
| `src/audio/sample-bank.ts`, `sample-worker.ts` | Samples made in a worker at boot, taken on first play, main-thread fallback |
| `src/audio/mixer.ts` | Buffers, buses, voice pools, panning, the hall and ensemble, the player's touch, the sidechain, ducking, the master chain; shared by the game and the previews |
| `src/audio/score.ts` | The eight world scores, their modes, the sidechain depths, reversed-note landing and the lookahead clock |
| `src/audio/boss-score.ts` | Boss stages, per-world kits, stingers and the arranger that lands changes on the score's grid |
| `src/audio/harmony.ts`, `harmony-audit.ts` | Clash detection, the stem's tone choice, and the audit of every score, stage and the title theme |
| `src/audio/menu-theme.ts` | The title theme: harmony, melody, form, arrangement and drums |
| `src/audio/engine.ts` | `createGameAudio`: the device and gesture lifecycle, preferences, score and boss transitions, the title theme's lifecycle and the menu sounds |
| `src/audio/settings.ts`, `settings.css` | The volume sliders in the settings panel |
| `src/ui/ui-sounds.ts` | Which button, selector or slider makes which menu sound |
| `src/main.ts` | Thin hooks: start, observe each frame, pause, resume, quit, launch, menu |

The simulation imports no audio code. In development builds `window.__LAST_WORLDS__.audio()` returns read-only
diagnostics (`diagnostics` in `engine.ts`: device state, stages, voice counts, levels, sample bytes); production has no
audio debug API.

## 13. Previewing and validating

**Tests:**

| File | What it checks |
| --- | --- |
| `tests/audio/audio.test.ts` | The observer (no sound at empty sky, no state change, no replay, volley coalescing, shield break against life loss, offscreen and pause suppression); the hash of every effect sample; short, front-loaded shots; parts, pickups and the jump; the success ring's key per world; the scheduler's lookahead and stall handling; preferences; finite, click-free samples within the memory budget |
| `tests/audio/boss-music.test.ts` | Every world's 32-bar cycle fingerprinted, the tempos, Umbra frozen note for note and sample for sample; the sidechain depths; the reversed landings; the four stages growing by arrangement; no drum machine; each world's identity in its stem; the stem inside the harmony; the bed levels; transitions on the grid and the stingers; instrument headroom and the memory budget |
| `tests/audio/harmony.test.ts` | The harmonic audit (section 8) |
| `tests/audio/menu.test.ts` | The title theme (section 9) and the menu sounds' hashes, lengths, peaks and boot order |
| `tests/browser/audio.spec.ts` | In Chromium: unlock on launch, silent pause, resume, persisted settings; the title theme's lifecycle and the menu sounds, including a refused purchase; seven worlds' offline mixes for headroom, clipping and mono; submix silence and hard voice caps in the real Web Audio graph; the sidechain dipping basses but not pads; boss phases on the running grid, through pause and into the next run; every world's stem growing by stage with the level score untouched; a flight without audio or storage |

Run them with `npx vitest run tests/audio` and `npx playwright test tests/browser/audio.spec.ts` (Playwright starts the
dev server on 4173 or reuses a running one; `npm run test:browser:isolated` uses its own, see the [README](../README.md)).

**Listening previews.** Three tools in `tools/audio/` render offline through the game's own mixer and samples, in
headless Chromium, via the audio lab page (`tests/fixtures/audio-lab.html`, with `audio-lab.ts` and `audio-render.ts`).
They need a running dev server, named by `AUDIO_PREVIEW_URL` (default `http://127.0.0.1:4173`); a second server should
use `npm run dev:isolated -- --port <port>` so the main one keeps working. Each writes WAVs (44.1 kHz stereo), a
`metrics.json` (peak, clipping, mono retention, voices, sample bytes) and a listening page `index.html`, opened through
the dev server (for example `http://localhost:4173/lookdev/audio/index.html`). Switching version or build on the page
keeps the playback position.

- `node tools/audio/music-preview.mjs [output] [world ...]`: per world, normal flight, the three boss stages, the
  modules → core and core → overload changes asked for mid-bar, a whole fight, and music under fire for three worlds.
  Output defaults to `lookdev/audio/`. `AUDIO_PREVIEW_BEFORE` or `AUDIO_PREVIEW_BUILDS` add older renders to the page for
  A/B listening.
- `SFX_BUILD=before|after node tools/audio/sfx-preview.mjs [root]`: each effect alone and over Khepri's music, with an
  A/B page; output defaults to `lookdev/audio-previews/sfx/`.
- `node tools/audio/menu-preview.mjs [output]`: the title theme's full loop, a 60 s cut as first heard, each menu sound,
  and a click through the menus ending in a launch into Luna's music; output defaults to `lookdev/audio-previews/menu/`,
  with earlier takes kept beside it in `take1/` to `take4/` if present.

The audio lab page itself, served by the dev server, also plays Nacre live with buttons for a boss fight, core, overload
and the kill.

**Latest measurements** (offline renders; signal checks, not listening):

- **World music, measured 11 November** (seven worlds, 52 renders, before Nahara existed): peaks at most 0.586, no
  clipped or non-finite samples, mono RMS at least 98 % of stereo, at most 37 voices at once, the boss pool held at its
  cap, 10 low-priority stem notes dropped across all renders, all in the densest overload passages. Nahara's score and
  stem pass the harmonic audit (13 November).
- **Title theme, measured 16 November** (at the default volumes): its loudest second is −26.5 dBFS (peak 0.287), against
  −25.1 dBFS for Luna's music after a launch, so it stays a backdrop. From the intro to the last hook the whole mix rises
  from −36.8 to −28.5 dBFS. The lead and drums rendered together, minus each alone, leave −97 dBFS: the drums never pump
  the lead. Between 1 and 3 kHz the drums sit 12 dB under the lead. At most 28 voices, none dropped; no clicks.
- **Menu sounds, measured 15 November:** peaks from 0.035 (the slider tick) to 0.095 (a purchase) over the theme; no
  clipping.
- **Synthesis cost:** about 0.57–0.69 s in Node for all samples, warm (measured 15 November); the title theme's score
  costs about 15–18 µs per sixteenth (measured 16 November).

## 14. Open

- **Listening on phones:** phone speaker balance, iOS Safari, Android hardware, Bluetooth latency, the hardware mute
  switch and OS interruptions are untested. The separate Music and Effects sliders exist for that final adjustment.
- **Nahara's score** awaits the user's listen (noted in `tests/audio/boss-music.test.ts`).
- **Nahara in the tools:** `music-preview.mjs` renders seven worlds by default (pass `nahara` to include it), and the
  browser spec's offline mixes cover the same seven.
- **Preview levels:** the music and effect previews render at music 55 % and effects 80 % (`renderTimeline` in
  `tests/fixtures/audio-lab.ts`), the defaults before 15 November; the menu previews use the current defaults.
- **Sample memory:** about 100 KB under the 15 MiB budget; a new voice needs the budget raised in the three tests above or
  a voice removed.
