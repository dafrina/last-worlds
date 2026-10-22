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

Each score has an authored 32-bar cycle: opening, developed phrase, breakdown, return. Chord movement and answering melodies prevent a single short phrase from repeating unchanged. Endless changes the score at the actual planet switch; the outgoing notes fade while the new tonal centre enters.

Boss revision (23 October): the approved level score now plays **unchanged** throughout a fight, including its melody, chord progression, rests, breakdown, tempo and phrase position. A separate bass/percussion stem follows that same sixteenth-note clock. Arrival fades this stem from silence to 85% over one bar (2.03–2.73 seconds depending on the planet); core/overload lifts it to 100% over one bar. Destruction fades it out over one bar. There is no second copy of the lead/pad bed, no track restart, and no independent audio clock that can drift. These are two arrangements of the same song, implemented as shared base plus an additive stem rather than two full streamed recordings.

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
- One stereo convolution room and one damped delay serve the score. Combat stays comparatively dry and precise. No per-shot reverb instances or continuous oscillator creation.
- Conservative panning and no phase-inverted widening preserve mono playback. A high-pass, compressor, limiter and output headroom control combined levels.
- Shield break, life loss, shockwave and major boss cues temporarily lower the music.
- Nominal caps: 36 musical voices, 20 effects voices. Voice stealing fades out over 18 ms; those short retiring fades can briefly overlap the capped active set. Important cues may replace low-priority voices. Quiet impacts cannot replace critical cues.
- Visible-space filtering, volley grouping, per-frame impact quotas and cooldowns prevent offscreen battles and large formations from flooding the mix.

## Code boundaries

| File | Responsibility |
| --- | --- |
| `src/audio/samples.ts` | Deterministic 32 kHz source samples and instrument patches, anti-click edges and headroom |
| `src/audio/score.ts` | Planet arrangements, authored notes and bounded lookahead clock |
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

The preview tool writes four 28-second planet excerpts, four 34-second boss arrangements, four 34-second level→boss→level transitions, a combat mix, a 37-second effects reel, a playable Sound room (`lookdev/audio/index.html`) and numerical measurements to `lookdev/audio/`. Each planet card offers original, boss and transition versions; switching preserves the playback position for comparison. Transition timings appear on each card. Open the Sound room through `http://localhost:4173/lookdev/audio/index.html`. The reel order follows the list in `tests/fixtures/audio-lab.ts`. All exports use the same mixer and sample sources as the game, rendered with Chromium's OfflineAudioContext at 44.1 kHz stereo. The development-only `/tests/fixtures/audio-lab.html` also offers direct Nacre playback and live boss/defeat controls **through the Vite server**; opening its TypeScript module as a `file://` document cannot execute it.

Automated coverage includes state immutability, real volleys, delayed enemy bursts, final shield/life loss, no replay, offscreen filtering, distinct arrangements, scheduler stalls, finite samples, invalid preferences, actual browser gesture unlock, pause/resume, persistence, no-audio fallback, silent submixes, voice-limit stress, mono compatibility and output headroom. The production build and existing gameplay/menu browser flows are part of the integration gate.

The revised previews peak below 0.36 at default volumes with no clipped samples; mono RMS retains over 98% of stereo RMS. The expanded palette uses 7,412,480 bytes (7.07 MiB) of cached PCM, within the 9 MiB budget, plus the small stereo room impulse and node overhead. Final revision measurements are saved in `docs/screenshots/audio/metrics.json`. These are rendered-signal checks, **not** an assertion of subjective listening quality on every device.

The 23 October boss arrangements peak at 0.417 (Luna), 0.458 (Khepri), 0.333 (Nacre) and 0.374 (Vesper) at default volumes, with no clipping or dropped voices in the review excerpts. Peak music voices are 29/36, mono RMS retention is over 99%, and cached PCM remains 7,412,480 bytes: no additional sample downloads or synthesis are needed. New evidence is `docs/screenshots/audio/boss-metrics.json` and `boss-sound-room.png`. Browser checks cover live arrival/core/defeat fades without resetting score time, pause/resume, retry, silent submixes, low-band energy, and the unchanged musical timeline before and after the fade. A comparison against shipped `2d08b81` confirmed all 2,048 original score steps are identical (four planets × 32 bars).

Actual iOS Safari, Android hardware, phone speaker balance, Bluetooth latency, hardware mute behavior and OS interruptions still require listening/device validation. The first implementation deliberately offers separate mix sliders for that final taste/room/device adjustment. See `docs/build-status.md` for the exact final test results and revision.
