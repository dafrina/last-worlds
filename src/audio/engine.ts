import type { PlanetId, RunState } from '../shared/contracts';
import { readJson, writeJson } from '../shared/storage';
import { SoundObserver } from './events';
import { BossArranger, bossStage } from './boss-score';
import { AudioMixer, type AudioSettings } from './mixer';
import { FROZEN, scoreStep, ScoreClock, THEMES } from './score';

export const AUDIO_STORAGE_KEY = 'last-worlds.audio.v1';
export const DEFAULT_AUDIO: Readonly<AudioSettings> = { muted: false, music: .55, effects: .8 };
export function sanitizeSettings(value: unknown): AudioSettings {
  const data = value && typeof value === 'object' ? value as Partial<AudioSettings> : {};
  const volume = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  return { muted: typeof data.muted === 'boolean' ? data.muted : false, music: volume(data.music, .55), effects: volume(data.effects, .8) };
}

/** The semitones that move the success resolve (written in C) to a world's key, within a tritone either way. */
export const successKey = (planet: PlanetId) => ((THEMES[planet].root % 12) + 6) % 12 - 6;

export function createGameAudio() {
  // Unavailable or unreadable storage: session defaults.
  let settings: AudioSettings = readJson(AUDIO_STORAGE_KEY, sanitizeSettings) ?? { ...DEFAULT_AUDIO };
  let context: AudioContext | undefined, mixer: AudioMixer | undefined, timer: ReturnType<typeof setInterval> | undefined;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false, planet: PlanetId = 'luna', disposed = false;
  let terminal = false;
  const observer = new SoundObserver(), clock = new ScoreClock(), boss = new BossArranger();
  function clearSuspend() { clearTimeout(suspendTimer); suspendTimer = undefined; }
  function schedule() {
    if (!active || !mixer || context?.state !== 'running' || settings.muted || terminal) return;
    for (const slot of clock.take(context.currentTime, planet)) {
      // Umbra's score is frozen as the user loved it, with the touch it was heard with (mixer.ts humanize).
      for (const note of scoreStep(planet, slot.step)) mixer.note(note, slot.at, false, slot.step, FROZEN.has(planet));
      if (mixer.bossActiveAt(slot.at)) for (const note of boss.notes(planet, slot.step)) mixer.note(note, slot.at, true, slot.step);
    }
  }
  /** A new score (a run, a planet jump): no boss stem, and the echo follows the new tempo. */
  function newScore(next: PlanetId) {
    planet = next; boss.reset();
    mixer?.setBossMix(0, 0);
  }
  function halt() {
    clearInterval(timer); timer = undefined;
    mixer?.setActive(false); clearSuspend();
    // Let the room/delay decay behind the closed master gate before suspending the device.
    suspendTimer = setTimeout(() => { if ((!active || settings.muted) && context?.state === 'running') void context.suspend().catch(() => {}); }, 2000);
  }
  function wake() {
    if (!context || !mixer || !active || settings.muted || disposed) return;
    clearSuspend(); mixer.setActive(true);
    if (!timer) {
      clock.reset(context.currentTime + .035, true);
      timer = setInterval(schedule, 40); schedule();
    }
  }
  /** Called synchronously inside a gesture. Browsers without usable audio still run the game. */
  function unlock() {
    if (settings.muted || disposed || terminal) return;
    try {
      if (!context) {
        context = new AudioContext({ latencyHint: 'interactive' });
        // Buffers come from the samples made at boot (sample-bank.ts), never synthesized all at once in the tap.
        mixer = new AudioMixer(context, settings);
        context.addEventListener('statechange', () => {
          if (context?.state === 'running') {
            // wake resets a stopped clock. A late initial statechange must not double the opening beat.
            wake();
          } else {
            clearInterval(timer); timer = undefined;
            mixer?.stop();
          }
        });
      }
      if (context.state !== 'running') void context.resume().then(wake).catch(() => {});
      else wake();
    } catch {
      // A partially initialized device must not poison later user-gesture retries.
      mixer?.dispose(); mixer = undefined;
      void context?.close().catch(() => {}); context = undefined;
    }
  }
  function setSettings(next: Partial<AudioSettings>) {
    settings = sanitizeSettings({ ...settings, ...next });
    writeJson(AUDIO_STORAGE_KEY, settings); // refused: memory-only preferences
    mixer?.setSettings(settings);
    if (settings.muted) halt();
    else unlock();
  }
  return {
    unlock,
    settings: () => ({ ...settings }),
    setSettings,
    start(state: RunState) {
      mixer?.stop(); observer.reset(state);
      newScore(state.planet); terminal = false; active = true;
      clearInterval(timer); timer = undefined; clock.reset((context?.currentTime ?? 0) + .035);
      unlock();
    },
    observe(state: RunState) {
      const cues = observer.read(state);
      if (!active || settings.muted || context?.state !== 'running' || !mixer) return;
      if (planet !== state.planet) {
        // Fade existing notes; new tonal centre enters after the jump flash without a doubled beat.
        mixer.stopGroup('music'); clock.reset(context.currentTime + .07);
        newScore(state.planet);
      }
      // Read-only: the boss phase picks the stem's arrangement. Neither the score position nor the level fader moves;
      // the change lands on the stem's grid from the first sixteenth not yet scheduled.
      const stage = bossStage(state.boss?.phase);
      if (stage !== boss.target) {
        if (stage) mixer.setBossMix(1, .03);
        else mixer.setBossMix(0, 240 / THEMES[planet].bpm);
        boss.request(stage, clock.step);
      }
      // The success resolve is written in C: it plays in the world's key.
      for (const cue of cues) mixer.cue(cue.sound === 'win' ? { ...cue, transpose: successKey(planet) } : cue);
      if (state.phase === 'over' || state.phase === 'complete') {
        if (!terminal) {
          terminal = true; mixer.stopGroup('music');
          clearInterval(timer); timer = undefined; clearSuspend();
          suspendTimer = setTimeout(() => {
            if (terminal) { mixer?.setActive(false); void context?.suspend().catch(() => {}); }
          }, 4500);
        }
      }
    },
    /**
     * The launch warp's whoosh, in the tap that starts a flight (main.ts), a fifth up so it peaks as the shortest warp
     * breaks out (1 s). Only if its sample is already made: nothing is ever synthesized in that tap.
     */
    launch() {
      if (settings.muted || !mixer || !context || disposed || !mixer.ready('whoosh')) return;
      clearSuspend(); mixer.setActive(true);
      mixer.cue({ sound: 'whoosh', pan: 0, gain: .8, variant: 0, transpose: 7 });
    },
    pause() { active = false; halt(); },
    resume() { active = true; unlock(); },
    quit() { active = false; terminal = false; boss.reset(); mixer?.setBossMix(0, 0); halt(); },
    diagnostics() {
      let rms = 0;
      if (mixer && context?.state === 'running') {
        const samples = new Float32Array(mixer.analyser.fftSize);
        mixer.analyser.getFloatTimeDomainData(samples);
        for (const n of samples) rms += n * n;
        rms = Math.sqrt(rms / samples.length);
      }
      return { state: context?.state ?? 'locked', active, planet, terminal,
        bossStage: boss.target, playingStage: boss.stageAt(clock.step), switchAt: boss.pending(clock.step)?.at ?? null,
        scoreStep: clock.step, nextBeatAt: clock.nextAt, ...settings, rms, ...mixer?.diagnostics() };
    },
    dispose() {
      disposed = true; active = false;
      clearInterval(timer); clearSuspend(); mixer?.dispose(); void context?.close();
    },
  };
}
export type GameAudio = ReturnType<typeof createGameAudio>;
