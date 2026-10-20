import type { PlanetId, RunState } from '../shared/contracts';
import { SoundObserver } from './events';
import { AudioMixer, type AudioSettings } from './mixer';
import { scoreStep, ScoreClock } from './score';

export const AUDIO_STORAGE_KEY = 'last-worlds.audio.v1';
export const DEFAULT_AUDIO: Readonly<AudioSettings> = { muted: false, music: .55, effects: .8 };
export function sanitizeSettings(value: unknown): AudioSettings {
  const data = value && typeof value === 'object' ? value as Partial<AudioSettings> : {};
  const volume = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  return { muted: typeof data.muted === 'boolean' ? data.muted : false, music: volume(data.music, .55), effects: volume(data.effects, .8) };
}

export function createGameAudio() {
  let settings: AudioSettings = { ...DEFAULT_AUDIO };
  try { settings = sanitizeSettings(JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) ?? 'null')); } catch { /* Session defaults. */ }
  let context: AudioContext | undefined, mixer: AudioMixer | undefined, timer: ReturnType<typeof setInterval> | undefined;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false, planet: PlanetId = 'luna', tension = 0, disposed = false;
  let terminal = false;
  const observer = new SoundObserver(), clock = new ScoreClock();
  function clearSuspend() { clearTimeout(suspendTimer); suspendTimer = undefined; }
  function schedule() {
    if (!active || !mixer || context?.state !== 'running' || settings.muted || terminal) return;
    for (const slot of clock.take(context.currentTime, planet)) {
      for (const note of scoreStep(planet, slot.step, tension)) mixer.note(note, slot.at);
    }
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
        mixer = new AudioMixer(context, settings);
        mixer.warm();
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
    try { localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Memory-only preferences. */ }
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
      planet = state.planet; tension = 0; terminal = false; active = true;
      clearInterval(timer); timer = undefined; clock.reset((context?.currentTime ?? 0) + .035);
      unlock();
    },
    observe(state: RunState) {
      const cues = observer.read(state);
      if (!active || settings.muted || context?.state !== 'running' || !mixer) return;
      if (planet !== state.planet) {
        planet = state.planet;
        // Fade existing notes; new tonal centre enters after the jump flash without a doubled beat.
        mixer.stopGroup('music'); clock.reset(context.currentTime + .07);
      }
      tension = !state.boss || state.boss.phase === 'destroyed' ? 0
        : state.boss.phase === 'overload' || state.boss.phase === 'core' ? 2 : 1;
      for (const cue of cues) mixer.cue(cue);
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
    pause() { active = false; halt(); },
    resume() { active = true; unlock(); },
    quit() { active = false; terminal = false; halt(); },
    diagnostics() {
      let rms = 0;
      if (mixer && context?.state === 'running') {
        const samples = new Float32Array(mixer.analyser.fftSize);
        mixer.analyser.getFloatTimeDomainData(samples);
        for (const n of samples) rms += n * n;
        rms = Math.sqrt(rms / samples.length);
      }
      return { state: context?.state ?? 'locked', active, planet, tension, terminal, ...settings, rms, ...mixer?.diagnostics() };
    },
    dispose() {
      disposed = true; active = false;
      clearInterval(timer); clearSuspend(); mixer?.dispose(); void context?.close();
    },
  };
}
export type GameAudio = ReturnType<typeof createGameAudio>;
