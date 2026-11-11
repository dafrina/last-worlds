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
| Khepri | Foundry Afterimage | 118 BPM | A clean, round foundry bass in four ringing notes a bar (11 November), gritty saw stabs/lead, mechanical percussion and darker semitone movement |
| Nacre | Dreams Beneath the Bloom | 106 BPM | Slow, soft blooming pads, a quieter rounded bass and restrained percussion; no glass-bell lead |
| Vesper | Below the Ice Line | 88 BPM | Ambient (11 November): three calm, cold glass notes every second bar over long pads, two bass notes a bar and one soft kick; no backbeat or hats |
| Amnion | Something Beneath the Skin | 92 BPM | Breathing formant membranes, uneasy nerve tones, low organic bass, paired heartbeats and dry bone clicks |
| Corona | Hymn for a Swollen Sun (10 November) | 110 BPM | A slow low harp, three ringing notes a bar (11 November), a Phrygian lament on a higher harp, a solar drone that swells like heat, sparse heavy drums, ember crackle, bowed metal |
| Umbra | Where the Light Goes Backwards (10 November) | 84 BPM | Reversed, inhaled chords and reversed glass that stop dead on the grid, a dark inharmonic obsidian bell, harmonic-series tones off the twelve-note grid, a precise void pulse |

Each score has an authored 32-bar cycle: opening, developed phrase, breakdown, return. Chord movement and answering melodies prevent a single short phrase from repeating unchanged. Endless changes the score at the actual planet switch; the outgoing notes fade while the new tonal centre enters.

## 10 November revision: instruments, boss states, Corona and Umbra

User brief: the compositions are good and must not be rewritten; the instruments sounded too 8-bit; the boss music did not change dramatically enough, core and overload sharing one setting. Later the same day: Corona's music was a copy (it had no instruments of its own and Khepri-like patterns) and needed new music ("ominous harp sounds or something"); Umbra should be "very ominous too, with reversed instruments and alien harmonics". These two are the only rewritten compositions.

### What did not change

- The level scores of Luna, Khepri, Nacre, Vesper and Amnion: every note, gain, pan, send and timing over the 32-bar cycle matches its 5af93ef fingerprint (`tests/audio/boss-music.test.ts`). Tempos, harmonies and arrangements are the same; Amnion's score function was split out without changing its output. (On 11 November the user asked for Khepri's bass and Vesper's arrangement to change; see the 11 November revision below.)
- Every combat and event sound (weapons, impacts, explosions, shields, specials, boss cues, warp, results) is byte-identical: its synthesis code is untouched; only music instruments moved.
- The scheduler (120 ms lookahead, 40 ms checks, missed beats skipped), the sample worker, the gesture/pause/mute lifecycle, the Music and Effects sliders and the master chain (high-pass, compressor, limiter, gate).

### Instruments (`src/audio/instruments.ts`, `src/audio/dsp.ts`)

Each instrument is still one cached mono 32 kHz sample, pitched by playback rate. The synthesis is new: PolyBLEP band-limited saws and pulses, detuned unison stacks, a topology-preserving state-variable filter whose cutoff moves (filter envelopes, slow sweeps), rotor partials for modal and additive tones, Karplus–Strong strings, and gentle saturation that puts the low instruments' harmonics where a phone speaker can reproduce them. Every replaced patch keeps its name, length and base note and is matched to the loudness of the 20 October patch (RMS over the same window), so the scores' authored note gains keep their balance; sharp attacks reach it through a soft knee rather than a lower level. Peaks stay at or below 0.85.

- Drums: a punchy pitch-dropping kick with a beater click and midrange knock; a snare of two tuned shell modes and a band-passed rattle with its top rolled off; six-square metallic hats band-passed around 8 kHz; modal foundry metal; a softer brushed swish.
- Basses (replaced on 11 November, below): clean and round in every world, no saw or saturation.
- Leads: Khepri's five-voice unison saw lead with a falling filter and delayed vibrato (kept low: it plays up to 2.5 times faster than its sample); Luna's felt piano with paired detuned strings, stretched partials and a two-stage decay; Vesper's glass (made calmer and colder on 11 November, below); Amnion's beating nerve tone.
- Pads: Vesper's six drifting unison saws under a breathing filter; Nacre's slow bloom with a filter that opens with the swell; Amnion's membrane through two moving formant filters.
- Boss voices (the 11 November orchestral set): boom (sub drop), riser, dark crash, braam (low brass blast), brass stab, tuned tom, ensemble drum (taiko), tuned timpani, spiccato strings, two round basses (plucked and short), string ensemble.
- Corona: a two-string Karplus–Strong harp (3 cents either side, a slow uneasy beating) in a dark resonant body, in two registers; a solar drone (unison saws whose filter swells open and closed twice per note, a shimmer at the peaks, a band of plasma roar); bowed metal (inharmonic plate partials blooming in as the bow digs in); ember crackle.
- Umbra: "reversed" means synthesized backwards envelopes, never reversed recordings. The inhale (an inhaled chord: unison saws and an inharmonic 2.41 partial growing under an opening filter, with backward air, cut at its end), glint (bell partials 1, 2.76, 5.4, 8.93 growing toward the end, smeared by a rising hiss) and obsidian (a dark ring-modulated bell, partials 1, 2.12, 3.47, 4.73, 6.18 with beating twins). The old void-air and needle patches are gone.

### Mix (`src/audio/mixer.ts`)

- The level score's voices pass through a bed node. In core and overload it rests 0.5 and 1.5 dB lower (`BED` in boss-score.ts), moving smoothly on bar lines and stinger hits, so the stem gains weight without the fight simply getting louder. It returns to 1 as the boss fades. (Until 11 November it also dipped under every boss kick; that pumping is gone.)
- The boss stem has its own 24-voice pool beside the score's 36 and the effects' 20, so it can never thin the level score, with priorities inside it (stingers, then drums and bass, strings, the ostinato, ticks). A gentle bus compressor (11 November: −10 dB threshold, 1.8:1, 15 ms attack, 250 ms release) only rounds off its peaks before the music fader, so it does not push the shared master compressor that the combat sounds pass through.
- Pads, drones and strings feed a stereo ensemble: two short delays, one per side, slowly modulated at different rates (no phase-inverted widening; mono RMS stays above 85 %).
- One hall (11 November) replaces the room and the ping-pong echo: see the 11 November revision below.

### Boss music: four states (`src/audio/boss-score.ts`)

The level score always plays on, untouched, on its own sixteenth-note clock. An additive stem on the same clock and harmony changes arrangement with the simulation's boss phase (read-only, via `bossStage`):

| State | Phases | Percussion | Bass | Pulses and harmony | Stinger into it |
| --- | --- | --- | --- | --- | --- |
| Flight | none, destroyed | the level score's own | | | |
| Modules | arrival, batteries | two or three heavy ensemble-drum hits a bar, timpani on each chord, a tom fill into each phrase | long round notes on the half bar, on the riff where it lands on a beat | a low spiccato pulse on the beat (half notes on Vesper and Umbra); low strings on root and fifth; a quiet braam on each phrase | entrance: a riser timed to peak on the next bar line, toms climbing in the last beat, then boom, braam on root and fifth, crash, drum, timpani, a deep tom |
| Core | core | a fuller drum pattern, timpani on each chord change, a snare pickup every fourth bar and a fill into each phrase | plucked eighths on the riff, the root otherwise, the octave at the end of each half bar | a sixteenth spiccato ostinato through the chord in 3-3-2 accents (eighths on Vesper and Umbra); a brass chord on each change; strings on the chord | on the next beat: a snare pickup, then crash, drum, timpani, boom and a brass chord |
| Overload | overload | driving drums in 3-3-2, a timpani roll and a riser into each phrase, snare and tom fills | short eighths with octave leaps and the chord's colour tone | the ostinato doubled an octave up over low spiccato sixteenths; brass on each change and syncopated on 3, 6 and 10; boom per chord, crash and braam per phrase; brighter strings | on the next half bar: a riser, a thirty-second snare roll and spiccato rushing up the chord, one sixteenth of silence in the stem, then the biggest boom, braam in octaves, a four-voice brass chord, timpani and two drum strokes |

There is no kick on the beat, no hi-hat or clap and no side-chain pumping (11 November); the snare only fills. Note density grows by stage (about 8–15, 23–38 and 73–88 stem notes per bar); nearly every off-beat sixteenth sounds in overload. Destroyed fades the stem out over one bar, still playing its last state, then the level score is alone again.

Synchronization: when the engine observes a new stage it calls `BossArranger.request(stage, clock.step)` with the first sixteenth the lookahead has not scheduled. The change lands on the next bar line at least six sixteenths ahead (an entrance, room for its riser), the next half bar at least four ahead (overload) or the next beat at least two ahead (otherwise). Stingers fill the steps from the request to the switch. A change asked for before the previous one lands takes over that grid line. The clock is never reset; a resumed or stalled clock skips stingers it jumped past instead of playing a backlog.

Identity per world: Luna keeps the score's played timing and brushes; Khepri adds struck metal on the off-beats and the heaviest drums; Nacre stays softest (brushes, the round bass, light drums); Vesper keeps a spacious pulse and an ostinato two octaves up until overload breaks into sixteenths; Amnion's drum is its heartbeat, paired beats racing unevenly in overload, with bone ticks; Corona's drums keep the score's 3-3-2 under ember crackle; Umbra keeps a precise half-time pulse with void ticks and adds inhaled chords that stop dead on the stem's chord changes (modules) and bar lines (core), and in overload reversed glass that sucks into every beat through the chord's harmonic-series tone. Every stem tone is checked against the melody (see the harmonic audit below).

### Corona: Hymn for a Swollen Sun

- 110 BPM, E Phrygian. Chords, two bars each: Em, F (♭II), C (♭VI), B major (V); the 32-bar form of every world.
- The low harp (C3 sample) rises slowly through each chord and falls back: root, octave and top over the chord's first bar, fifth, top and octave over its second, three notes a bar on the score's 3-3-2 in eighths, each left to ring (11 November; it was a running sixteenth ostinato). Only each bar's first note in the opening's first four bars and in the breakdown.
- The lament on the higher harp: octave, ♭6, fifth over each chord's first bar; ♭7, ♭6, fifth over its second (11 November: the passing notes left out, for space). It enters in the opening's second half, plays throughout phrases two and four, and is doubled an octave down in the return.
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
- Music and effects have separate faders. The music hall's return passes through its fader, so setting music to zero also silences it.
- One stereo convolution hall and one stereo ensemble serve the score (11 November; see below). Combat stays comparatively dry and precise. No per-shot reverb instances or per-note oscillators; the ensemble's two slow modulation oscillators are created once with the mixer.
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
| `src/audio/harmony.ts`, `harmony-audit.ts` | Clash detection, the stem's consonant tone choice, and the audit of every score and stage |
| `src/audio/events.ts` | Read-only RunState observer, event coalescing, bounded ID tracking |
| `src/audio/mixer.ts` | Cached AudioBuffers, buses, spatialization, hall, playback humanizing, voice limits and ducking |
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

These are rendered-signal checks. The arrangement and the levels of the 10 November pass were set from these measurements and from music theory, without listening.

## 11 November revision: performance, space and an orchestral boss stem

The user listened to the 10 November pass. It still sounded cheap, "not just the instruments". A trial with recorded instrument samples was built and rejected ("still sound cheap"), then removed entirely: no recordings, no decoder, no extra downloads. The user then approved three changes to the synthesized music (A, B and C below) and asked for some score and timbre tuning. They also said not to over-optimize: get it musically right, then stop.

### A: performance (`humanize` in `src/audio/mixer.ts`)

- **Timing and velocity:** each scheduled note gets a fixed touch at playback, taken from a hash of its sixteenth, voice and pitch (no random stream).
  - Drums and basses move within ±4 ms of the grid. Other voices move from 4 ms early to 10 ms late.
  - Velocity varies by ±8 %.
  - Reversed notes and risers keep exact timing, because they must stop or peak on a grid line.
  - Every render of a passage is identical, and the scores themselves are unchanged.
- **One bass note at a time:** a new note in the same part (the level score or the stem) damps the previous one over about 40 ms. Notes end where the next one begins instead of piling up.

### B: space (`src/audio/mixer.ts`)

- **Hall:** one hall replaces the room and the ping-pong echo.
  - Shape: 18 ms pre-delay, seven early reflections that differ between the sides, then a dense 2.3 s tail whose highs die first.
  - Its return is high-passed at 170 Hz, so it never thickens the bass.
  - It is set a fifth above the old room's wet energy, to make up for the removed echo.
- **No pumping:** the level bed no longer dips under boss kicks. It only steps back by stage (`BED`).
- **Gentler stem compressor:** −10 dB threshold, 1.8:1, 15 ms attack, 250 ms release. It was −12 dB, 2.5:1, 6 ms and 140 ms.
- **Unchanged:** the master chain and every combat sound. All 26 effect samples are byte-identical to the original build.

### C: an orchestral boss stem (`src/audio/boss-score.ts`)

The four stages, the stingers, the grid and the harmony rules are unchanged (see the table above). The drum machine is gone. In its place:

- **Drums:** a taiko-like ensemble drum (Amnion keeps its heartbeat), and tuned timpani on chord changes and in rolls. There is no kick on the beat and no hats or claps; the snare only fills into phrases.
- **Strings:** spiccato strings for the pulse and the 3-3-2 ostinatos, plus sustained strings.
- **Accents:** brass chords, braam, boom, crash and risers.

The new voices are synthesized like the rest:

- the drum: a falling skin with its second mode and the slap of the head;
- the timpani: its principal tone and the inharmonic 1.5, 1.98 and 2.44 modes, struck with felt;
- the spiccato: four detuned saws through a quickly closing low-pass, with a little rosin;
- the brass stab: it now opens over 40 ms, with no saturation.

### Score and timbre tuning (11 November)

- **Basses, every world:** the user found the basses "too sawy and dirty", most of all Khepri's, "since it runs continuously". All seven bass voices, level and boss, now share one clean design:
  - a sine fundamental;
  - second and third harmonics that fade faster, a gently filtered edge a phone speaker can still reproduce;
  - a soft felted onset;
  - no saw and no saturation.

  Each keeps its sample length and loudness target. The boss basses differ by length, 0.45 s plucked eighths in core and 0.35 s short eighths in overload, so their drive comes from rhythm and articulation. `saw-bass` is renamed `foundry-bass`.
- **Khepri:** the bass ran in sixteenths, 12 notes a bar. It now plays four ringing notes a bar: root, root, fifth, ♭7. The lead, stabs and drums are as before.
- **Vesper:** the user asked for glass that is "a bit more calm and cold", and music "more ambient than musical".
  - The glass is purer and darker: a slower 25 ms attack, an octave partial that fades early, a faint cold 2.76 partial, a low-pass at 2.6 kHz, a 3.1 s ring.
  - The score has three glass notes every second bar, two bass notes a bar and one soft kick. There is no backbeat and no hats; the pads are a little louder and wetter.
- **Corona:** the user asked for "some more space between the notes, not just a quick jingle that runs".
  - The low harp rises and falls through each chord, three notes a bar, each left to ring.
  - The lament keeps its octave, ♭6 and fifth, and the answer ♭7, ♭6 and fifth, without the passing notes.

### Harmonic audit (`src/audio/harmony.ts`, `harmony-audit.ts`)

- **What counts as a clash:** a minor second, major seventh or tritone between two notes heard together. The check works within a quarter tone, so Umbra's microtones are not mistaken for one. It is not a clash if both notes are tones of the chord in force.
- **The boss stem yields:** each pitched stem tone is checked against the melody heard as it strikes, and against any passing note in the next two sixteenths. A clashing tone moves to the nearest chord tone that does not clash, or is left out (`consonantWith`).
- **Corona and Umbra yield too:** their accompaniments give way to their laments in the same way.
- **Umbra's melody:** the second note is now a three-quarter-tone step above the octave, and the last a quarter-tone-flat fifth. The ♭9 that stood second read as a clash.

`tests/audio/harmony.test.ts` audits every world and stage over the whole 32-bar cycle:

- **Boss stems:** no stem note clashes with the melody, its harmony or another stem note, in any world or stage.
- **Recomposed scores:** Vesper, Corona and Umbra have no clashes.
- **Approved scores:** they keep their own intervals. Luna has 1 and Nacre 1. Khepri has 2, its lead's last note ringing across a chord change onto the new root; it had 4 before its bass was thinned. Amnion has 55: its tritones and minor ninths over uneasy chords are its character.

### 11 November measurements

- **Previews:** 52 renders in `lookdev/audio-previews/after-v3/`, with the same file set as the original (`before/`) and the 10 November pass (`after/`).
  - The Sound room one level up (`lookdev/audio-previews/index.html`, `AUDIO_PREVIEW_BUILDS`) switches between A (original), B (10 November) and C (11 November) at the same playback position.
- **Headroom:**
  - Peak at most 0.520 (Khepri, core to overload), against 0.453 on 10 November.
  - Zero clipped or non-finite samples.
  - Mono RMS at least 96 % of stereo.
- **Level, normal flight:** within 1 dB of the 10 November pass on Luna, Nacre, Amnion, Corona and Umbra. Khepri is 2.2 dB lower (its bass is no longer a saw) and Vesper 1.4 dB lower (now ambient).
- **Level, boss stages:** 0 to 3.5 dB below the 10 November pass (Amnion the most). The stem alone (measured on Luna, Khepri, Amnion and Corona) rises 3 to 4 dB in the phone band from modules to core, and 1.5 to 2.5 dB more into overload. In the full mix the master compressor holds the level, so the stages grow by density, register and voices rather than loudness. Without hats and claps, the top above 6 kHz is up to 7 dB lower in core and overload.
- **Voices:** at most 42 at once. The boss pool now holds its cap of 24 exactly: notes scheduled ahead out of time order (Umbra's reversed voices, risers) used to let it reach 29, and the mixer now steals until there is room. 7 low-priority stem notes were dropped across the 52 renders, all in Umbra's and Corona's densest passages.
- **Cost:** 66 samples, 12,933,120 bytes of cached PCM (12.33 MiB); the budget test is raised from 12 to 13 MiB. Synthesis in Node takes 0.48 to 0.52 s warm for all of them.
- **Checks:** typecheck clean; 1009 unit tests pass (5 skipped); the build passes; `tests/browser/audio.spec.ts` 6/6 (Playwright exit 0). The browser spec also confirms, in all seven worlds, that the rendered stem grows by more than 0.5 dB per stage in both the phone band and the top, and that the level score is identical before and after a fight.

Final balance needs the user's ears: the stem against the level score, the hall's size and the ostinato levels. A phone speaker needs checking too.


Actual iOS Safari, Android hardware, phone speaker balance, Bluetooth latency, hardware mute behavior and OS interruptions still require listening/device validation. The first implementation deliberately offers separate mix sliders for that final taste/room/device adjustment. See `docs/build-status.md` for the exact final test results and revision.
