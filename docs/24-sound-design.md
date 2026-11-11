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
| Luna | Far Side Signal | 94 BPM | Felt piano, a three-note melody over chords struck together, a round bass, brushes, a snappy kick, gentle human timing, and a distant beacon at the ends of phrases (phase 5) |
| Khepri | Foundry Afterimage | 118 BPM | A hard forge kick and mechanical eighths, a round bass in four ringing notes a bar, the saw lead (four notes a bar) and stabs, a tuned anvil only where nothing else strikes, steam from the press (phase 5) |
| Nacre | Dreams Beneath the Bloom | 106 BPM | A soft-mallet vibraphone (the pearl), three notes a bar, over thinned blooming pads, a round bass, and drums you can hear (phase 5) |
| Vesper | Below the Ice Line | 88 BPM | Ambient: two triangle-clean bells every second bar, a cold frost pad, two bass notes a bar, one soft kick, and ice cracking far off (phase 5) |
| Amnion | Something Beneath the Skin | 92 BPM | Breathing formant membranes, a three-note nerve-tone melody, low organic bass, paired heartbeats, dry bone clicks, and a lone creature calling in the night now and then (phase 5) |
| Corona | Hymn for a Swollen Sun (10 November) | 110 BPM | Modal over an E–B drone (no chord progression): a sparse lament in Bayati and Saba with half-flat seconds and slow slides, a harp once per ten-sixteenth cycle, a darbuka in maqsum and baladi, a solar drone, ember crackle, bowed metal (phase 5) |
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

- 110 BPM, E. Until phase 5, E Phrygian (maqam Kurd) over Em, F (♭II), C (♭VI) and B major (V). Since phase 5 there is no progression: an open E–B drone, its third section adding the ♭2 (F) as a colour (see phase 5 below).
- The low harp (C3 sample) plucks once per ten-sixteenth cycle, drifting across the bar and walking the drone, never near a lament note (phase 5). Phase 4 had tremolos and graces, v3 three notes a bar, and before 11 November it was a running sixteenth ostinato.
- The lament on the higher harp (`CORONA_LAMENT`) is a few long notes in Bayati, with Saba over the ♭2 (phase 5; phase 4 had Kurd and Hijaz over chords). It enters in the opening's second half (first bars only) and plays throughout phrases two and four. In the return its tonic is doubled an octave down.
- The rest of the texture:
  - the solar drone holds root and octave under each chord, with the higher octave too in the breakdown;
  - the bass plays on the doum strokes;
  - a darbuka plays maqsum in phrase two and baladi in the return;
  - ember crackle off the beat;
  - bowed metal every four bars.

### Umbra: Where the Light Goes Backwards

- 84 BPM on F#. Chords, two bars each: F#, G (a semitone up), C (the tritone) and F (the semitone under the root). Each adds one harmonic-series tone off the twelve-note grid: the 11th harmonic (+5.51 semitones), the 7th (+9.69), a pure major third (+3.86) and a pure minor third (+3.16). Pitches may be fractional; the mixer plays them by rate.
- Every bar line is breathed in: root, fifth and the chord's alien tone, inhaled and stopping dead on the downbeat. A reversed note is emitted from an earlier step and delayed within it so its hard ending falls exactly on its grid line (`landingNote`, up to 32 sixteenths ahead).
- The lament on reversed glass: octave, a three-quarter-tone step above it, fifth, then a quarter-tone-flat fifth (11 November; the minor ninth that stood second read as a clash), each arriving out of its own backward ring onto a soft obsidian strike an octave down. The answer in the second bar is the forward obsidian bell: a neutral third (between minor and major), then the semitone above the root.
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
- One stereo convolution hall and one stereo ensemble serve the score (11 November; see below). Kicks key a sidechain on the basses and synth leads only (phase 4). Combat stays comparatively dry and precise. No per-shot reverb instances or per-note oscillators; the ensemble's two slow modulation oscillators are created once with the mixer.
- Conservative panning and no phase-inverted widening preserve mono playback. A high-pass, compressor, limiter and output headroom control combined levels.
- Shield break, life loss, shockwave and major boss cues temporarily lower the music.
- Nominal caps: 36 level-score voices, 24 boss-stem voices (10 November) and 20 effects voices. Voice stealing fades out over 18 ms; those short retiring fades can briefly overlap the capped active set. Important cues may replace low-priority voices. Quiet impacts cannot replace critical cues.
- Visible-space filtering, volley grouping, per-frame impact quotas and cooldowns prevent offscreen battles and large formations from flooding the mix.

## Code boundaries

| File | Responsibility |
| --- | --- |
| `src/audio/samples.ts` | Deterministic 32 kHz combat and event sounds, the sample list and its boot order |
| `src/audio/instruments.ts`, `dsp.ts` | Music instrument patches and the offline synthesis kit, loudness matching, anti-click edges and headroom |
| `src/audio/score.ts` | Planet arrangements, authored notes, the sidechain depth table, reversed-note landing and bounded lookahead clock |
| `src/audio/boss-score.ts` | Boss stages, per-world boss kits, stingers and the arranger that lands changes on the score's grid |
| `src/audio/harmony.ts`, `harmony-audit.ts` | Clash detection, the stem's consonant tone choice, and the audit of every score and stage |
| `src/audio/events.ts` | Read-only RunState observer, event coalescing, bounded ID tracking |
| `src/audio/mixer.ts` | Cached AudioBuffers, buses, spatialization, hall, playback humanizing, slides, the kick-keyed sidechain, voice limits and ducking |
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

## 11 November, phase 4: snappier kicks, weight in the fights, every world reworked

The user listened to the third pass and replied:

> i need snappier kicks, especially for the boss fights. The boss fights are better now but they are too little bass-y, especially nacre pads seem very loud and the drums arent audible, vesper bells can be a bit cleaner and icyer like triangle, amnion could use some clicking noises with a lot of reverb here and there, like alien noises in the night, btw i love love love the umbra sound you made, also the corona music is good but the harps are too regularly placed on the rhythm, maybe take inspiration from arabian music. Can you rework the other sounds so it still fits the vibe they have, but in the quality of umbra and corona?

Then: "you could sidechain the lead synths and basses on the kicks for some more pop."

### Kicks (`punchKick` in `src/audio/instruments.ts`)

- **One design for every new kick:**
  - a beater click and a slap of noise in the first milliseconds;
  - a body that drops fast in pitch and dies quickly;
  - saturation, so its knock reads in a phone speaker's midrange;
  - a short knock around 190 Hz.
- **Four kicks use it:**
  - `snap-kick`: Luna, Nacre and Vesper;
  - `forge-kick`: Khepri, harder and brighter;
  - `boss-kick`: the fights;
  - `doum`: Corona's darbuka.
- **Against the old kick:** 3 to 5 dB more click in the first 10 ms, and about 2 dB more body over the first 80 ms. Their written gains are higher too. The old kick is now Umbra's alone.
- **Amnion's heartbeat** drops faster and has a soft snap.
- **The fights' taiko** has a stick click, a quicker pitch drop and a firmer body.

### Weight in the fights (`src/audio/boss-score.ts`)

- **The fights' kick:** it sits under the big drum's strongest strokes, which are each half bar's first and, in overload, the 3-3-2 accents. It is also under every stinger's hit.
- **Fuller boss basses:** longer notes (0.55 s and 0.45 s), more second harmonic, and written about 2 dB louder in every stage.
- **Timpani:** about 2 dB louder.
- **Booms:** bigger on the stingers.
- **Corona:** its stem drums are the darbuka's doum where the maqsum puts them, with the tek between.
- **Khepri:** its colour is the tuned anvil, striking chord tones.

### Sidechain (`sidechain` in `mixer.ts`, `SIDECHAIN` in `score.ts`)

- **What dips:** only the keyed voices — every bass, and the synth leads: Khepri's saw lead, Amnion's nerve tone, and the stems' spiccato and brass.
- **What never dips:** pads, acoustic leads (piano, harps, bells, pearl), reverb returns and effects. This is not the v1 pump, which lowered the whole bed.
- **How it works:**
  - Each kick note carries its key.
  - The mixer dips the keyed voices of the score and of the stem within 3 ms, then recovers over a quarter of a beat (80 to 150 ms).
  - Two kicks within 30 ms (the score's and the stem's) make one dip, the deeper of the two.
  - It follows the scheduled kicks exactly and is deterministic.
- **Depths:** each figure is the fraction the keyed voices dip by, with the same dip in dB in brackets. The fights' lighter drum strokes key 0.6 of their stage's depth.

| World | Level score | Modules | Core | Overload |
| --- | ---: | ---: | ---: | ---: |
| Luna | 0.25 (−2.5 dB) | 0.30 | 0.45 | 0.55 (−6.9 dB) |
| Khepri | 0.40 (−4.4 dB) | 0.40 | 0.50 | 0.60 (−8 dB) |
| Nacre | 0.12 (−1.1 dB) | 0.25 | 0.40 | 0.50 |
| Vesper | 0.10 (−0.9 dB) | 0.25 | 0.40 | 0.50 |
| Amnion | 0.20 (−1.9 dB) | 0.30 | 0.45 | 0.55 |
| Corona | 0.20 | 0.30 | 0.45 | 0.55 |
| Umbra | none (frozen) | 0.10 | 0.20 | 0.25 |

### Per world

- **Umbra: frozen.** The user loved it. Its 32-bar cycle (fingerprint 544dfdfb, 542 notes) and the PCM of all six samples it plays are pinned by `tests/audio/boss-music.test.ts`. Nothing in its score keys the sidechain. Its boss stem has the new kick and a light sidechain (0.10 to 0.25).
- **Corona: Arabic colour, more irregular rhythm.**
  - *The lament* is now written per chord in its maqam (`CORONA_LAMENT`): Kurd on E (E F G A B C D, the Phrygian it already had) over Em, F and C. Over the B major dominant it is Hijaz on B (B C D# E F# G A). The Hijaz phrase climbs B, C, D#, E — the augmented second C to D# — and later runs back down E, D#, C, B. Its long notes slide in from a tone below (a pitch bend, `bend` on a note), and a qanun tremolo (four plucks a thirty-second apart) marks where it holds.
  - *The harp* runs on a ten-sixteenth cycle, like a sama'i thaqil's 10/8, plucking at 0 and 6 (3+3, then 2+2). It drifts across the 4/4 bar and meets the bar line again only every five bars. Its tones walk the chord over four cycles. Every third cycle opens with a tremolo. Every fourth leans into its second note with a grace from the maqam tone just above, but only if that tone sits with the chord and the lament.
  - *The drums* are a darbuka. Doum and tek play maqsum (doum, tek, -, tek, doum, -, tek, -) in the second phrase and baladi in the return. The opening has lone doum strokes, the breakdown one doum every other bar, and a soft ka before every fourth bar line. The deep tom backbeat is gone.
  - *Kept:* the drone, the bowed metal, the ember crackle and the space.
  - *Dissonance:* the Hijaz ♭2 (C over B) passes over the held drone. The audit counts that as the melody's own motion; Corona has no clashes.
- **Luna: lonely and human.**
  - Chords are rolled upward on the felt piano.
  - In the developed phrases, the downbeat melody note leans in from the scale tone above, a pianist's grace.
  - The far-side signal: a distant beacon (a sine with a brief FM sparkle) pings three times at the end of every four bars of the opening and the breakdown, and once in eight bars in the return.
  - A snappy kick, brushes, its round bass and played timing.
- **Khepri: the foundry.**
  - A hard forge kick and the mechanical sixteenths, the saw lead and stabs, and the four-note round bass.
  - A tuned anvil strikes root, fifth and octave every six sixteenths, turning against the bar; it meets the downbeat again every three bars.
  - Steam is let out of the press at the end of every four bars.
- **Nacre: the dreamy bloom, with audible drums.**
  - The pads are thinned below 200 Hz in the patch, their lowest tone is voiced an octave up, and they are written 4 dB quieter. The phone band (the frequencies a phone speaker reproduces well) of a Nacre flight is 3.9 dB lower than in v3.
  - The kick (snap-kick, +4.5 dB), brushes (+4.8 dB) and hats (+4.4 dB) are louder.
  - The melody moves to the pearl, a soft-mallet vibraphone (partials 1, 3.98, 9.6) with its motor's tremolo. In the developed phrases its arpeggio rises through the chord like bubbles.
- **Vesper: cleaner and icier.**
  - The bell is triangle-like: five sparse partials of a struck steel rod (1, 2.01, 2.76, 5.4, 8.93), each beating slowly against a twin 1.6 cents away (the shimmer), with a faint strike and nothing low. It plays an octave above the written melody.
  - In the developed phrases each bell has a faint reflection three sixteenths later.
  - The frost pad (detuned sines with a trace of odd harmonics over thin wind) replaces the warm saw pad.
  - Now and then the ice cracks: the dispersive "pew" of a frozen sheet, high frequencies first, far off in the hall.
  - The v3 ambient arrangement is kept.
- **Amnion: the night.**
  - The heartbeat lands like a kick, and its strong beats key a gentle sidechain.
  - The nerve tone slides into its notes from a quarter or half tone below.
  - Now and then, never on the heartbeat, something calls out in the dark: a chitter (eleven chitinous clicks speeding up, then stalling) or a three-tick click.
  - The calls are pitched for different creatures, placed anywhere across the field, and almost fully sent into the hall. There is about one call in three bars, twice as many in the breakdown, and four in ten are answered from the other side three sixteenths later.
  - The placement comes from a hash of the sixteenth (`scatter`), never a random stream, so every pass is identical.
  - The composition and its 55 deliberate clashes are unchanged.

### Phase 4 measurements

- **Previews:** 52 renders in `lookdev/audio-previews/after-v4/`, with the same file set as the earlier builds.
  - The Sound room (`lookdev/audio-previews/index.html`) switches between A (original), B (10 November), C (v3) and D (phase 4) at the same playback position.
- **Headroom:**
  - Peak at most 0.599 (Khepri's whole fight).
  - Zero clipped or non-finite samples.
  - Mono RMS at least 97.9 % of stereo.
- **Boss stages against v3:**
  - Overall level: −0.6 to +3.1 dB, mean +1.6.
  - Bass band: +0.4 to +3.5 dB, mean +1.9.
  - Phone band: −3.1 to +1.8 dB, mean +0.3.
  - Overload gained the most: Luna +2.9 dB, Khepri +3.0, Nacre +1.3, Vesper +3.1, Amnion +2.1, Corona +2.1, Umbra +1.9.
- **Flight levels against v3:**
  - Umbra: identical (same level and bands).
  - Luna +0.7 dB, Khepri +0.5, Corona −0.3, Amnion −0.1, Vesper −0.5.
  - Nacre −2.2 dB. Its pads are 3.9 dB lower in the phone band; the kick, brushes and hats are written 4.4 to 4.8 dB louder.
- **Sidechain, measured in Chromium:** a depth of 0.5 dips a held bass to 0.48 of its level and recovers within about a tenth of a second. A pad is untouched.
- **Voices:** at most 43 at once, and the boss pool holds its cap of 24. 26 low-priority stem notes were dropped across the 52 renders, 1 to 3 in each overload render that dropped any.
- **Cost:** 77 samples, 14,085,120 bytes of cached PCM (13.43 MiB); the budget test is now 14 MiB. Synthesis in Node takes about 0.52 s warm for all of them.
- **Checks:**
  - typecheck clean;
  - 1011 unit tests pass (5 skipped);
  - the build passes;
  - `tests/browser/audio.spec.ts` 7/7, Playwright exit 0. It now also checks the sidechain in the real Web Audio graph.
  - The audit: no stem note clashes with a melody in any world or stage. Nacre, Vesper, Corona and Umbra have no clashes at all. Luna keeps 1, Khepri 2 and Amnion 55, as written.
  - Effects are byte-identical (26/26), and Umbra is pinned note for note and sample for sample.

Final balance needs the user's ears: kick levels against each world's bass, the sidechain depths (the table above), the night calls' density and the Corona harp cycle. A phone speaker needs checking too.

## 11 November, phase 5 (v5): clean timing, fewer notes, Corona over a drone, the fights in tune

The user's comments on v4:
- Luna, Amnion, Khepri and then Corona "have lots of quick succession notes that sound just weird and overlapping";
- "just relax the amount of notes, simpler melodies for the main plucking instruments";
- Corona's melody "sounds kinda shit, make it more mysterious arabic inspired not so happy at times";
- the boss fights "seem like they drift into false notes sometimes";
- on the plus side, "the instrument choices are much much better tho i like them all pretty much".

So this pass changes notes, timing and Corona's harmony, not the sounds. The only exceptions are two fixes: the chitter's click spacing, and the boss voices' tuning.

### Diagnosis (`lookdev/audio-bench/diag.test.ts`, `stemharm.test.ts`)

Every scheduled onset was replayed as the mixer times it: the written offset plus the humanize drift. Over each world's 32-bar cycle, in the level score and each boss stage, the bench counted:
- **Smears:** two attacks of the same part 2–15 ms apart.
- **Quick pairs:** attacks in the same register 15–80 ms apart.
- **Trains:** the clicks inside a chitter.
- **Ring-overs:** a melodic note struck while the same part's previous note is still within 20 dB of its peak.

| World | v4: smear / quick / train / ring (level; overload) | v5 | Main v4 causes |
| --- | --- | --- | --- |
| Luna | 43 / 117 / 0 / 134; 2061 / 383 / 0 / 134 | 0 / 0 / 0 / 0; 0 / 0 / 0 / 0 | rolled chords (105), leans (12), per-note timing smears, the piano melody ringing over itself (128), piano against the stem's stabs and spiccato |
| Khepri | 128 / 0 / 0 / 142; 2881 / 101 / 0 / 154 | 0 / 0 / 0 / 0; 0 / 0 / 0 / 0 | timing smears, the saw lead ringing over itself (142), thirty-second snare doubling in fills, the overload anvil |
| Amnion | 16 / 0 / 110 / 75; 1686 / 79 / 110 / 75 | 0 / 0 / one chitter / 0, in both | chitter trains (11 clicks 18–22 ms apart), the nerve tone ringing over itself, bone ticks against bone ticks and snares |
| Corona | 32 / 62 / 0 / 27; 2046 / 315 / 0 / 27 | 0 / 0 / 0 / 0; 0 / 0 / 0 / 0 | lament tremolos (30), harp tremolos (18), harp graces (5 to 38), the lament against the stem's spiccato |
| Nacre | 4 / 0 / 0 / 133; 2004 / 90 / 0 / 133 | 0 / 0 / 0 / 0; 0 / 0 / 0 / 0 | the pearl ringing over itself, fills |
| Vesper | 0 / 0 / 0 / 54; 1296 / 3 / 0 / 54 | 0 / 0 / 0 / 0; 0 / 0 / 0 / 0 | bells and their echoes |

In every world the only spread left is up to 6 ms between *different* parts, by design.

Umbra's level score is unchanged: 6 same-part smears and 53 obsidian rings, as approved. In its fights, the level and the stem void-bass double the same riff notes up to a few milliseconds apart; that keeps Umbra's level timing exact.

**Lead notes per bar in the level scores (v4 → v5)** (Luna's and Khepri's counts include their piano chords and saw stabs):

| Luna | Khepri | Nacre | Vesper | Amnion | Corona | Umbra |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 7.13 → 3.88 | 6.50 → 4.00 | 4.75 → 1.75 | 2.25 → 1.00 | 2.75 → 1.63 | 3.72 → 0.94 | 3.38 (frozen) |

**Boss-stem harmony (v4 → v5)**, counting stem notes outside their chord or mode anywhere in their heard length, stingers and risers included:

| World | v4 | v5 |
| --- | ---: | ---: |
| Luna | 0 | 0 |
| Khepri | 29 | 0 |
| Nacre | 0 | 0 |
| Vesper | 48 | 0 |
| Amnion | 18 | 0 |
| Corona | 8 | 0 |
| Umbra | 68 | 0 |

The causes in v4:
- **Stingers:** their lead-in spiccato anticipated the landing chord (76 in all).
- **Risers:** their climbing tone always ended on C, whatever the key (64).
- **Ringing across a chord change:** stinger braams (19), Khepri's overload anvil (8) and Umbra's timpani roll (4) rang into the next chord.

The v4 level melodies also played notes outside their chord's mode: 5 in Luna, 10 in Khepri and 4 in Nacre. Written as fixed intervals over each chord root, they put an F natural over Luna's C(♯11) chord, an A♯ over Khepri's G major, and an A♭ over Nacre's E♭(♯11). Amnion's 34 were its deliberate ♭2 and tritone, which are now listed in its modes.

### Timing (`mixer.ts`)

- **Coherent humanizing:** one timing per sixteenth and part, so a chord's tones strike together and a part never smears against itself.
  - Drums and basses stay within ±2 ms; other parts from 2 ms early to 4 ms late, so parts differ by 6 ms at most.
  - Velocity varies ±6 % per note.
  - Umbra's frozen score keeps its 11 November per-note touch (`FROZEN` in `score.ts`, `legacy` in `humanize`). Its flight render is unchanged.
- **Monophonic melodies:** a note with a `part` (the melody of every world but Vesper and Umbra) damps that part's previous note over about 80 ms. The basses already worked this way.
- **Fills:** the fights' snare plays one stroke a sixteenth, with no thirty-second doubling.

### Scores (`score.ts`)

- **Every melody is held to its chord's mode** (`THEMES.scales`, `inMode`). A melody written as intervals over the chord root now takes the mode's nearest tone, chord tones first.
- **Luna:**
  - chords struck together, not rolled, and no leaning graces;
  - three melody notes a bar — the rising fourth, then a step down, its mirror answering rising;
  - the bass in four notes;
  - two beacon pings instead of three.
- **Khepri:**
  - the lead plays root, third, fifth, third — four notes a bar, in each chord's own mode;
  - the anvil strikes only on sixteenths where nothing else does, and never in a chord's last beat;
  - hats in eighths;
  - the riff's last note is the octave, not the ♭7, which made a tritone under the lead.
- **Nacre:** the pearl plays three notes a bar (root, the fifth above, a step down); the bubbles are gone; the bass is in three notes.
- **Vesper:** two bells every second bar, left to ring into each other; the reflections are gone.
- **Amnion:**
  - three nerve notes a bar: the root creeping up a semitone, then the tritone's fourth above it;
  - no slides and no bone offsets;
  - the night calls are isolated. There are about six per cycle, never on the heartbeat, never within a beat of the melody, never within three beats of each other, and none are answered.
  - The chitter is four clicks 70–120 ms apart instead of a train of eleven.
- **Corona: modal over a drone.**
  - *Harmony:* no chord progression and no major triads. An open E–B fifth with no third, its third section adding the ♭2 (F) as a colour.
  - *Lament:* a few long notes, hovering around the tonic and its half-flat second, rising and falling back unresolved, with slow 0.3 s slides from a tone of the maqam:
    - in Bayati on E (E, F half-sharp, G, A, B, C, D): E–F𝄳–G, then F𝄳–E–D;
    - over the ♭2, Saba (G–A♭–G–F𝄳);
    - then E and F𝄳 hovering.
  - *Harp:* once per ten-sixteenth cycle, walking the drone, never within a sixteenth of a lament note.
  - *Gone:* tremolos, graces and the ka fills.
  - *Kept:* the darbuka's maqsum and baladi, the solar drone, the embers (now two a bar) and the bowed metal.
  - *Audit:* the half-flat seconds and Saba's A♭ are authored tones of its modes, and Corona has no clashes.

### Boss fights in tune (`boss-score.ts`, `harmony.ts`, `instruments.ts`)

- **Every pitched stem tone is checked against both chords:** a tone still heard after a chord change must belong to both (`steady`). Otherwise it takes the nearest tone that does, and is left out if that tone would clash with the melody.
- **Stinger lead-ins:** they rush up the chord sounding at the time, not the one they land in.
- **Risers:** they climb to the landing chord's root (played between F#3 and F4, timed for their rate).
- **Tuning:** pitched boss voices keep their unison within ±6 cents (strings ±5, brass ±4, spiccato ±4, braam ±6, the riser's tone ±6; they were ±10 to ±25), and the strings' vibrato within ±3.5 cents (it was ±6). Inharmonic partials stay only on the drums, the crash and the timpani.
- **Stems:** Khepri's overload anvil strikes twice a bar, and Umbra's stem ticks moved to the backbeat sixteenths its level score leaves empty.
- **Tests:** `tests/audio/harmony.test.ts` asserts, for all seven worlds and stages, stingers and risers included, that every pitched stem note is in its chord or mode over its whole heard length. It also asserts that every reworked world's melody stays in its mode.

### Phase 5 measurements

- **Previews:** 52 renders in `lookdev/audio-previews/after-v5/`. The Sound room (`lookdev/audio-previews/index.html`) switches between A (original), B (v1), C (v3), D (v4) and E (v5) at the same playback position.
- **Headroom:**
  - Peak at most 0.586 (Khepri's whole fight).
  - Zero clipped or non-finite samples.
  - Mono RMS at least 98 % of stereo.
- **Levels against v4:**
  - Flight: Luna −1.5 dB and Amnion −1.0 (fewer notes); Nacre −0.9; Khepri −0.3; Corona −0.4; Vesper 0.
  - Umbra: identical (same level and bands).
  - Boss stages: −1.3 to +0.7 dB, mean −0.3.
- **Voices:** at most 37 at once, and the boss pool holds its 24. 10 low-priority stem notes were dropped across the 52 renders.
- **Checks:**
  - typecheck clean;
  - 1013 unit tests pass (5 skipped);
  - the build passes;
  - `tests/browser/audio.spec.ts` 7/7, Playwright exit 0;
  - effects byte-identical (26/26);
  - Umbra pinned note for note and sample for sample.
- **Remaining spread in Umbra's fights:** its frozen level score keeps the per-note touch, so in overload 13 same-part pairs (the level and stem void-bass doubling a riff note) and 51 cross-part pairs differ by up to about 14 ms.

These are measurements of the schedule, not listening. The user's ears decide whether Luna, Khepri, Amnion and Corona now read clean, and whether Corona sounds mysterious rather than happy.


Actual iOS Safari, Android hardware, phone speaker balance, Bluetooth latency, hardware mute behavior and OS interruptions still require listening/device validation. The first implementation deliberately offers separate mix sliders for that final taste/room/device adjustment. See `docs/build-status.md` for the exact final test results and revision.
