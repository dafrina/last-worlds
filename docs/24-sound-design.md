# Last Worlds — sound design

Implemented 20 October 2026. This is an independent presentation pass; models, terrain, encounters, rewards, combat rules and saves are unchanged.

## Direction and original sources

Crisp, slightly arcade electronic weapons over atmospheric, rhythmically evolving planet scores. Impact is carried by a short upper-frequency transient and an audible midrange body, not only sub-bass. The soundtrack stays underneath combat. Shield breaks, life loss, specials and boss events take precedence over small impacts.

All samples, instrument patches, melodies, chord progressions, percussion patterns and arrangements were authored for this project in `src/audio/`. There are no third-party recordings, downloaded loops, imitation artist prompts, external audio services or additional licensing dependencies. The editable source is TypeScript; WAV review exports are derived from that source. Do not mistake previews for additional runtime assets.

## What plays

| Event | Treatment |
| --- | --- |
| Twin Pulse | Fast FM laser fall, short bright snap, lower body; one sound per twin volley |
| Fan Cannon | Wider, lower-frequency burst with a noise layer; one sound for the five-shot fan |
| Seeker | Longer bending electronic tail, distinct from both straight weapons |
| Enemy volley | Quieter, lower-register shot; visible enemies only |
| Weapon impact | Very short metallic tick, with a per-family cooldown |
| Enemy / fuel explosion | Crack, saturated midrange body, falling pressure wave and scattered debris |
| Shield hit / break | Resonant ring; final charge adds a descending broken/noisy tail |
| Life loss | Heavier explosion, music ducking; no duplicate player explosion |
| Pickups / upgrade / special ready | Brief ascending intervals with different lengths and priority |
| Shockwave | Broad pressure impulse and falling energy body |
| Seeker Rack | Closely spaced launch transients |
| Siege Lance | Sustained energy texture; duration reads the actual special's content definition |
| Beam warning / release | Distinct pulsed warning and firing texture; visual warnings remain authoritative |
| Boss arrival / phase / destruction | Low harmonic signal, phase accent and prolonged layered destruction |
| Planet jump / results | Rising warp texture and short completion/loss motifs |

Only accepted shots and actual gameplay events produce combat sounds. Holding a direction or having no target produces no automatic laser sound. Terminal effects are read from the real run, not the animated afterglow copy. Pause, rewind, retry and debug fast-forward do not replay old events.

## Music

| Planet | Track | Tempo | Character |
| --- | --- | ---: | --- |
| Luna | Far Side Signal | 94 BPM | Warm felt-piano synthesis, rounded plucked bass, dry brushed backbeats and gentle human timing |
| Khepri | Foundry Afterimage | 118 BPM | Heavy saw bass, gritty saw stabs/lead, mechanical percussion and darker semitone movement |
| Nacre | Dreams Beneath the Bloom | 106 BPM | Slow, soft blooming pads, a quieter rounded bass and restrained percussion; no glass-bell lead |
| Vesper | Below the Ice Line | 88 BPM | Sparse glacial bells, long pads and a restrained low pulse |
| Amnion | Something Beneath the Skin | 92 BPM | Breathing formant membranes, uneasy nerve tones, low organic bass, paired heartbeats and dry bone clicks |
| Corona | Hymn for a Swollen Sun (10 November) | 110 BPM | A low harp ostinato in 3-3-2, a Phrygian lament on a higher harp, a solar drone that swells like heat, sparse heavy drums, ember crackle, bowed metal |
| Umbra | Where the Light Goes Backwards (10 November) | 84 BPM | Reversed, inhaled chords and reversed glass that stop dead on the grid, a dark inharmonic obsidian bell, harmonic-series tones off the twelve-note grid, a precise void pulse |

Each score has an authored 32-bar cycle: opening, developed phrase, breakdown, return. Chord movement and answering melodies prevent a single short phrase from repeating unchanged. Endless changes the score at the actual planet switch; the outgoing notes fade while the new tonal centre enters.

## 10 November revision: instruments, boss states, Corona and Umbra

User brief: the compositions are good and must not be rewritten; the instruments sounded too 8-bit; the boss music did not change dramatically enough, core and overload sharing one setting. Later the same day: Corona's music was a copy (it had no instruments of its own and Khepri-like patterns) and needed new music ("ominous harp sounds or something"); Umbra should be "very ominous too, with reversed instruments and alien harmonics". These two are the only rewritten compositions.

### What did not change

- The level scores of Luna, Khepri, Nacre, Vesper and Amnion: every note, gain, pan, send and timing over the 32-bar cycle matches its 5af93ef fingerprint (`tests/audio/boss-music.test.ts`). Tempos, harmonies and arrangements are the same; Amnion's score function was split out without changing its output.
- Every combat and event sound (weapons, impacts, explosions, shields, specials, boss cues, warp, results) is byte-identical: its synthesis code is untouched; only music instruments moved.
- The scheduler (120 ms lookahead, 40 ms checks, missed beats skipped), the sample worker, the gesture/pause/mute lifecycle, the Music and Effects sliders and the master chain (high-pass, compressor, limiter, gate).

### Instruments (`src/audio/instruments.ts`, `src/audio/dsp.ts`)

Each instrument is still one cached mono 32 kHz sample, pitched by playback rate. The synthesis is new: PolyBLEP band-limited saws and pulses, detuned unison stacks, a topology-preserving state-variable filter whose cutoff moves (filter envelopes, slow sweeps), rotor partials for modal and additive tones, Karplus–Strong strings, and gentle saturation that puts the low instruments' harmonics where a phone speaker can reproduce them. Every replaced patch keeps its name, length and base note and is matched to the loudness of the 20 October patch (RMS over the same window), so the scores' authored note gains keep their balance; sharp attacks reach it through a soft knee rather than a lower level. Peaks stay at or below 0.85.

- Drums: a punchy pitch-dropping kick with a beater click and midrange knock; a snare of two tuned shell modes and a band-passed rattle with its top rolled off; six-square metallic hats band-passed around 8 kHz; modal foundry metal; a softer brushed swish.
- Basses: two-saw Vesper bass through a closing resonant filter over a sine sub; Luna/Nacre's rounded pluck; Khepri's three-saw driven foundry bass with a sub-octave; organic and void basses with saturated harmonics for phones.
- Leads: Khepri's five-voice unison saw lead with a falling filter and delayed vibrato (kept low: it plays up to 2.5 times faster than its sample); Luna's felt piano with paired detuned strings, stretched partials and a two-stage decay; Vesper's glass, now a soft inharmonic shimmer fading into a warm body, far less upper FM energy; Amnion's beating nerve tone.
- Pads: Vesper's six drifting unison saws under a breathing filter; Nacre's slow bloom with a filter that opens with the swell; Amnion's membrane through two moving formant filters.
- Boss voices: boom (sub drop), riser, dark crash, braam (low brass blast), stab, tuned tom, layered clap, driving bass, growl bass, arpeggio pluck, string ensemble.
- Corona: a two-string Karplus–Strong harp (3 cents either side, a slow uneasy beating) in a dark resonant body, in two registers; a solar drone (unison saws whose filter swells open and closed twice per note, a shimmer at the peaks, a band of plasma roar); bowed metal (inharmonic plate partials blooming in as the bow digs in); ember crackle.
- Umbra: "reversed" means synthesized backwards envelopes, never reversed recordings. The inhale (an inhaled chord: unison saws and an inharmonic 2.41 partial growing under an opening filter, with backward air, cut at its end), glint (bell partials 1, 2.76, 5.4, 8.93 growing toward the end, smeared by a rising hiss) and obsidian (a dark ring-modulated bell, partials 1, 2.12, 3.47, 4.73, 6.18 with beating twins). The old void-air and needle patches are gone.

### Mix (`src/audio/mixer.ts`)

- The level score's dry voices pass through a bed node. Under a boss kick it dips briefly (a sidechain-style pump, deepest on Corona and Khepri, lightest on Nacre); in core and overload it rests 0.5 and 1.5 dB lower (`BED` in boss-score.ts), so the stem gains weight without the fight simply getting louder. It returns to 1 as the boss fades.
- The boss stem has its own 24-voice pool beside the score's 36 and the effects' 20, so it can never thin the level score, with priorities inside it (stingers, then drums and bass, strings, pulses, hats). A gentle bus compressor glues it before the music fader, so it does not push the shared master compressor that the combat sounds pass through.
- Pads, drones and strings feed a stereo ensemble: two short delays, one per side, slowly modulated at different rates (no phase-inverted widening; mono RMS stays above 85 %).
- The room is darker and a little larger: 12 ms pre-delay, early reflections, a 1.8 s tail whose highs die first, at the 20 October room's wet energy. The echo is now a damped ping-pong on the score's dotted eighths (`setTempo`), its send summed to mono first.

### Boss music: four states (`src/audio/boss-score.ts`)

The level score always plays on, untouched, on its own sixteenth-note clock. An additive stem on the same clock and harmony changes arrangement with the simulation's boss phase (read-only, via `bossStage`):

| State | Phases | Percussion | Bass | Pulses and harmony | Stinger into it |
| --- | --- | --- | --- | --- | --- |
| Flight | none, destroyed | the level score's own | | | |
| Modules | arrival, batteries | heavy half-time kick and backbeat in a big room, a tom ostinato tuned to the chord root, off-beat ticks | darker quarter notes on the root under the riff, no octave leaps | low strings on root and fifth: tension, not melody | entrance: a riser timed to peak on the next bar line, toms climbing in the last beat, then boom, braam on root and fifth, crash, a deep tom |
| Core | core | full backbeat with clap, eighth hats with sixteenth ghosts, driving kicks, two-bar pickups and phrase fills | driving synth bass in eighths on the riff, filling with root and octave | an eighth-note arpeggio through the chord; strings on the chord | on the next beat: a snare pickup, then crash, boom and a stab chord |
| Overload | overload | double-time backbeat everywhere, ghost snares, sixteenth hats and open hats, dense kicks, rolls every two bars, thirty-second rolls and a riser into each phrase | aggressive growl bass in sixteenths with octave leaps and the chord's fifth | a sixteenth arpeggio and an alarm pulse two octaves up; stab chords on each change and syncopated on 3, 6 and 10; boom per chord, crash and braam per phrase; brighter strings | on the next half bar: a riser, a thirty-second snare roll and a rising arpeggio, one sixteenth of silence in the stem, then the biggest boom, braam in octaves, a four-voice stab and a clap |

Note density roughly doubles at each step (about 20, 45 and 85 stem notes per bar); every off-beat sixteenth sounds in overload. Destroyed fades the stem out over one bar, still playing its last state, then the level score is alone again.

Synchronization: when the engine observes a new stage it calls `BossArranger.request(stage, clock.step)` with the first sixteenth the lookahead has not scheduled. The change lands on the next bar line at least six sixteenths ahead (an entrance, room for its riser), the next half bar at least four ahead (overload) or the next beat at least two ahead (otherwise). Stingers fill the steps from the request to the switch. A change asked for before the previous one lands takes over that grid line. The clock is never reset; a resumed or stalled clock skips stingers it jumped past instead of playing a backlog.

Identity per world: Luna keeps the score's played timing and brushes, and its bass only turns driven in overload; Khepri adds struck metal and mechanical sixteenths; Nacre stays softest (brushes, rolling round bass, the lightest dip); Vesper keeps a half-time pulse until overload breaks into double time, with an arpeggio two octaves up; Amnion's kick is its heartbeat, paired beats racing (two per beat) in overload, with bone ticks and nerve-tone pulses; Corona's harp carries the pulses over ember-crackle hats and 3-3-2 kicks; Umbra adds inhaled chords that stop dead on the stem's chord changes (modules) and bar lines (core), and in overload reversed glass that sucks into every beat through the chord's harmonic-series tone.

### Corona: Hymn for a Swollen Sun

- 110 BPM, E Phrygian. Chords, two bars each: Em, F (♭II), C (♭VI), B major (V); the 32-bar form of every world.
- The low harp (C3 sample) climbs each chord from its root in groups of 3, 3 and 2 sixteenths, twice a bar; only each group's first note in the opening's first four bars and in the breakdown.
- The lament on the higher harp: octave, ♭6, fifth, fourth, fifth over each chord's first bar; fifth, ♭7, ♭6, fifth over its second. It enters in the opening's second half, plays throughout phrases two and four, and is doubled an octave down on strings in the return.
- The solar drone holds root and fifth under each chord (the octave too in the breakdown); bass on root and fifth in the 3-3-2 pulse; kicks in 3-3-2 in phrases two and four, a downbeat elsewhere; a deep tom on beat three; ember crackle off the beat; bowed metal every four bars.

### Umbra: Where the Light Goes Backwards

- 84 BPM on F#. Chords, two bars each: F#, G (a semitone up), C (the tritone) and F (the semitone under the root). Each adds one harmonic-series tone off the twelve-note grid: the 11th harmonic (+5.51 semitones), the 7th (+9.69), a pure major third (+3.86) and a pure minor third (+3.16). Pitches may be fractional; the mixer plays them by rate.
- Every bar line is breathed in: root, fifth and the chord's alien tone, inhaled and stopping dead on the downbeat. A reversed note is emitted from an earlier step and delayed within it so its hard ending falls exactly on its grid line (`landingNote`, up to 32 sixteenths ahead).
- The lament on reversed glass: octave, minor ninth, fifth, then a quarter-tone-flat fifth, each arriving out of its own backward ring onto a soft obsidian strike an octave down. The answer in the second bar is the forward obsidian bell: a neutral third (between minor and major), then the semitone above the root.
- The pulse: void bass on beats and a syncopated pickup, a precise kick on one and three, off-beat ticks (sixteenths in the return). The breakdown is a line through silence: breath, one tick per bar and a distant toll.

Boss revision (23 October; its two-level fader is superseded by the four boss states of 10 November, below): the approved level score now plays **unchanged** throughout a fight, including its melody, chord progression, rests, breakdown, tempo and phrase position. A separate bass/percussion stem follows that same sixteenth-note clock. Arrival fades this stem from silence to 85% over one bar (2.03–2.73 seconds depending on the planet); core/overload lifts it to 100% over one bar. Destruction fades it out over one bar. There is no second copy of the lead/pad bed, no track restart, and no independent audio clock that can drift. These are two arrangements of the same song, implemented as shared base plus an additive stem rather than two full streamed recordings.

The boss bass reinforces the original riff and fills rests with the current root/octave. Luna retains played timing and a brushed backbeat, Khepri adds driving saw bass and mechanical subdivisions, Nacre gains a rolling rounded-bass groove beneath its soft pads, and Vesper keeps its glacial melody over a heavier half-time pulse. The added low end stays centred and dry. Its voices share the 36-voice music budget and have lower priority than the original score, so they cannot steal its sustained pads or lead. Muting, music volume, pause and quit govern both layers; a new run or world switch clears the boss fader. Existing combat-event sounds and ducking remain unchanged.

Listening revision: the user liked the first pass but found the instrumentation too similar. The Moon now uses hammer/string-inspired piano patches and a small deterministic timing/velocity variation, giving it a familiar human character. Khepri uses finite-harmonic saw synthesis and a stronger bass balance. Nacre is led by slow-attack pads with only a sparse upper melody. Vesper's approved arrangement and instrument settings are retained. These are distinct patches, not merely different transpositions of one lead.

The score clock schedules 120 ms ahead, checks every 40 ms, and skips missed notes after an interruption. It never plays a burst of overdue beats. A resumed score enters at a chord boundary. Normal music is original synthesis, not a recording streamed over the network.

## Mix, controls and mobile lifecycle

- Defaults: music 55%, effects 80%, Sound on. Independent sliders in the existing Settings page; the existing Sound on/off control mutes everything.
- Preferences use `last-worlds.audio.v1`, separate from campaign progression and statistics. Invalid or unavailable storage falls back to session settings.
- AudioContext is created/resumed from an input gesture. The first gesture builds the reusable sample cache. Failures cannot stop a flight.
- The resume-button gesture unlocks audio before the UI's three-second countdown completes, including a context suspended during a pause.
- Pause, hidden tab, window blur and rotate pause close the master gate and stop queued voices. Returning requires the game's normal resume. Muting also cancels queued voices. The device suspends after wet tails decay behind the closed gate.
- Flight endings stop music, let the final cue finish, and suspend audio. The menu stays quiet.
- Music and effects have separate faders. Music reverb/echo returns pass through its fader, so setting music to zero also silences its effects.
- One stereo convolution room, one tempo-synced ping-pong echo and one stereo ensemble serve the score (10 November; see above). Combat stays comparatively dry and precise. No per-shot reverb instances or per-note oscillators; the ensemble's two slow modulation oscillators are created once with the mixer.
- Conservative panning and no phase-inverted widening preserve mono playback. A high-pass, compressor, limiter and output headroom control combined levels.
- Shield break, life loss, shockwave and major boss cues temporarily lower the music.
- Nominal caps: 36 level-score voices, 24 boss-stem voices (10 November) and 20 effects voices. Voice stealing fades out over 18 ms; those short retiring fades can briefly overlap the capped active set. Important cues may replace low-priority voices. Quiet impacts cannot replace critical cues.
- Visible-space filtering, volley grouping, per-frame impact quotas and cooldowns prevent offscreen battles and large formations from flooding the mix.

## Code boundaries

| File | Responsibility |
| --- | --- |
| `src/audio/samples.ts` | Deterministic 32 kHz combat and event sounds, the sample list and its boot order |
| `src/audio/instruments.ts`, `dsp.ts` | Music instrument patches and the offline synthesis kit, loudness matching, anti-click edges and headroom |
| `src/audio/score.ts` | Planet arrangements, authored notes, reversed-note landing and bounded lookahead clock |
| `src/audio/boss-score.ts` | Boss stages, per-world boss kits, stingers and the arranger that lands changes on the score's grid |
| `src/audio/events.ts` | Read-only RunState observer, event coalescing, bounded ID tracking |
| `src/audio/mixer.ts` | Cached AudioBuffers, buses, spatialization, room, delay, voice limits and ducking |
| `src/audio/engine.ts` | Gesture/device lifecycle, playback state, preferences and score transitions |
| `src/audio/settings.ts`, `settings.css` | Isolated accessible sliders added to the existing settings panel |
| `src/main.ts` | Thin start/observe/pause/resume/quit hooks, replacing the old triangle tones |

The simulation imports no audio code. Audio never consumes the game's random stream or modifies RunState. A private seeded noise generator is used only to build sounds. The development snapshot exposes read-only audio diagnostics; production has no audio debug API.

## Review and validation

Run `npm run dev`, then:

```sh
node tools/audio-preview.mjs
npx vitest run tests/audio
npx playwright test tests/browser/audio.spec.ts
```

Since 10 November, the preview tool writes each world's normal, boss-stage, transition, whole-fight and under-fire excerpts (see the measurements below). It also writes `metrics.json` and a Sound room (`index.html`) to its output folder, `lookdev/audio/` by default. Switching version or build preserves the playback position. Open the Sound room through the dev server, for example `http://localhost:4173/lookdev/audio/index.html`. (Before 10 November it wrote six planet excerpts, boss and transition versions, a combat mix and a 37-second effects reel.) All exports use the same mixer and sample sources as the game, rendered with Chromium's OfflineAudioContext at 44.1 kHz stereo. The development-only `/tests/fixtures/audio-lab.html` also offers direct Nacre playback and live boss/defeat controls **through the Vite server**; opening its TypeScript module as a `file://` document cannot execute it.

Automated coverage includes state immutability, real volleys, delayed enemy bursts, final shield/life loss, no replay, offscreen filtering, distinct arrangements, scheduler stalls, finite samples, invalid preferences, actual browser gesture unlock, pause/resume, persistence, no-audio fallback, silent submixes, voice-limit stress, mono compatibility and output headroom. The production build and existing gameplay/menu browser flows are part of the integration gate.

The 20 October previews peak below 0.36 at default volumes with no clipped samples; mono RMS retains over 98% of stereo RMS. That palette used 7,412,480 bytes (7.07 MiB) of cached PCM. Its measurements remain in `docs/screenshots/audio/metrics.json`. These are rendered-signal checks, **not** an assertion of subjective listening quality on every device.

The 23 October boss arrangements peak at 0.417 (Luna), 0.458 (Khepri), 0.333 (Nacre) and 0.374 (Vesper) at default volumes, with no clipping or dropped voices in the review excerpts. Peak music voices are 29/36, mono RMS retention is over 99%, and cached PCM remains 7,412,480 bytes: no additional sample downloads or synthesis are needed. New evidence is `docs/screenshots/audio/boss-metrics.json` and `boss-sound-room.png`. Browser checks cover live arrival/core/defeat fades without resetting score time, pause/resume, retry, silent submixes, low-band energy, and the unchanged musical timeline before and after the fade. A comparison against shipped `2d08b81` confirmed all 2,048 original score steps are identical (four planets × 32 bars).

25 October: the Amnion and Umbra placeholders are replaced with original 32-bar arrangements and nine short cached instrument patches. Amnion's irregular paired heartbeat and formant breathing differ from Nacre's soft pad bed. Umbra's stable pure-tone layers, brief inharmonic attack and deliberate silence differ from Vesper's FM bells. Their dry bass/percussion boss layers use the same transport, chords and phrase positions as their level score. The four earlier scores and combat sound sources are unchanged.

Six-world browser checks pass for level/boss/transition headroom, increased boss low-band energy, mono compatibility and unchanged score before/after fades. Amnion level/boss peaks are 0.209/0.414; Umbra 0.166/0.336, with zero clipped samples. All cached PCM now totals **9,070,080 bytes (8.65 MiB)**, still below the existing 9 MiB limit; the room impulse and Web Audio node overhead are additional. Evidence: `docs/screenshots/audio/final-world-metrics.json`. No runtime audio downloads were added.

### 10 November measurements

- **Previews:** `node tools/audio-preview.mjs <output> [planet ...]`, with `AUDIO_PREVIEW_URL` naming the dev server. It renders seven worlds through the real mixer: normal flight, the three boss stages, modules → core and core → overload changes (asked for mid-bar), a whole fight and three music-under-fire mixes. That is 52 WAVs, 44.1 kHz stereo, at default volumes. With a `before/` render of older code beside it (a harness for the old two-level fader), the Sound room switches builds at the same playback position. Corona and Umbra's before files are their old scores.
- **Headroom:** the 52 renders peak at most 0.453, with zero clipped or non-finite samples and mono RMS at least 96.7 % of stereo. They use at most 53 voices at once and drop no notes. The boss pool peaks at 25 against its cap of 24, because a riser scheduled ahead can overlap the cap by one.
- **Normal-flight level** is within 1 dB of the 20 October build on the five unchanged worlds (for example Luna −30.4 against −30.5 dBFS RMS). The phone band (300 Hz–4 kHz) is equal or stronger, up to +4 dB on Khepri.
- **Boss stages, full mix:** RMS changes by at most a few dB from modules to overload, while the phone band and the top (above 6 kHz) rise through the stages. In the old build, core and overload were bit-identical.
- **Boss stages, stem alone:** both bands rise by at least 1 dB at each step on every world, typically 2 to 6 dB from core to overload.
- **Cost:** 65 samples instead of 49, and 12,435,200 bytes of cached PCM (11.86 MiB) against 9,328,640 (8.90 MiB). Synthesis in Node takes 0.42 to 0.51 s warm for all of them, against 0.59 to 0.61 s for the old 49. Samples are made in the order they are needed (flight sounds, the level score, then boss voices), so the boss voices never delay the first flight.
- **Voices:** Corona's new score peaks at 30 level voices; its placeholder peaked at 37, over the 36 cap.
- **Automated checks:** `tests/audio/boss-music.test.ts` covers the frozen scores, the stages, harmony, transitions and the reversed landings. `tests/browser/audio.spec.ts` covers rendered mixes, voice pools, live phase changes on the running clock, the rendered stem growing, and the untouched level timeline before and after a fight.

These are rendered-signal checks of a mix nobody here has listened to. The arrangement and the levels were set from these measurements and from music theory, without listening. Final balance (pulse and arpeggio levels, the bed dip, stinger loudness) needs the user's ears. A phone speaker needs checking too.

Actual iOS Safari, Android hardware, phone speaker balance, Bluetooth latency, hardware mute behavior and OS interruptions still require listening/device validation. The first implementation deliberately offers separate mix sliders for that final taste/room/device adjustment. See `docs/build-status.md` for the exact final test results and revision.
