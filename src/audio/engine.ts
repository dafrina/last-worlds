import type { PlanetId, RunState } from '../shared/contracts';
import { readJson, writeJson } from '../shared/storage';
import { SoundObserver } from './events';
import { BossArranger, bossStage } from './boss-score';
import { AudioMixer, type AudioSettings } from './mixer';
import { FROZEN, scoreStep, ScoreClock, THEMES } from './score';
import { MENU_INSTRUMENTS, MENU_LEVEL, MENU_THEME, menuStep } from './menu-theme';
import type { UiSound } from './samples';

/** The title theme fades in over this many seconds, and out over a launch's warp in this many. */
const MENU_FADE_IN = 3, MENU_FADE_OUT = .9;
/** After a run ends, the title theme returns once the result's stinger has played. */
const MENU_AFTER_RESULT = 3.2;

export const AUDIO_STORAGE_KEY = 'last-worlds.audio.v1';
/** Defaults (user, 15 November: effects 55, music 75; were music 55, effects 80). Saved only once a slider moves. */
export const DEFAULT_AUDIO: Readonly<AudioSettings> = { muted: false, music: .75, effects: .55 };
export function sanitizeSettings(value: unknown): AudioSettings {
  const data = value && typeof value === 'object' ? value as Partial<AudioSettings> : {};
  const volume = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  return { muted: typeof data.muted === 'boolean' ? data.muted : false, music: volume(data.music, DEFAULT_AUDIO.music), effects: volume(data.effects, DEFAULT_AUDIO.effects) };
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
  /** The title theme (menu-theme.ts): wanted while a menu shows, playing once its samples are made and the device runs. */
  let menuWanted = false, menuPlaying = false, menuAfterMute = false;
  let menuTimer: ReturnType<typeof setInterval> | undefined, menuStop: ReturnType<typeof setTimeout> | undefined;
  let resultTimer: ReturnType<typeof setTimeout> | undefined;
  const menuClock = new ScoreClock();
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
    scheduleSuspend();
  }
  /** Suspend the device in 2 s unless a flight or the title theme has started by then. */
  function scheduleSuspend() {
    clearSuspend();
    suspendTimer = setTimeout(() => { if ((!active || settings.muted) && !menuWanted && context?.state === 'running') void context.suspend().catch(() => {}); }, 2000);
  }
  /** The title theme's scheduler, on its own clock (the world music's is untouched). It starts only once every voice it
   * plays is made: nothing is ever synthesized in a tap. */
  function menuSchedule() {
    if (!menuWanted || !mixer || context?.state !== 'running' || settings.muted) return;
    if (!menuPlaying) {
      if (!MENU_INSTRUMENTS.every(id => mixer!.ready(id))) return;
      menuPlaying = true; clearSuspend(); clearTimeout(menuStop); menuStop = undefined;
      mixer.stopGroup('menu'); mixer.setActive(true);
      mixer.setMenuMix(0, 0); mixer.setMenuMix(MENU_LEVEL, MENU_FADE_IN);
      menuClock.reset(context.currentTime + .05);
    }
    for (const slot of menuClock.takeAt(context.currentTime, MENU_THEME.bpm)) {
      for (const note of menuStep(slot.step)) mixer.note(note, slot.at, false, slot.step, false, true);
    }
  }
  function startMenu() {
    if (disposed) return;
    if (settings.muted) { menuAfterMute = true; return; }
    if (menuWanted) return;
    menuWanted = true;
    if (!menuTimer) menuTimer = setInterval(menuSchedule, 40);
    menuSchedule();
  }
  /** The title theme fades out over `fade` seconds (a launch's warp), then its voices stop. */
  function stopMenu(fade: number) {
    menuWanted = false; menuAfterMute = false; clearTimeout(resultTimer); resultTimer = undefined;
    clearInterval(menuTimer); menuTimer = undefined;
    if (!menuPlaying || !mixer) return;
    menuPlaying = false;
    mixer.setMenuMix(0, fade);
    clearTimeout(menuStop);
    menuStop = setTimeout(() => { if (!menuPlaying) mixer?.stopGroup('menu'); }, fade * 1000 + 60);
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
    if (ensure() && context?.state === 'running') wake();
  }
  /** The device and the mixer, made (inside a gesture) and resumed. False where audio is unavailable. */
  function ensure() {
    if (disposed) return false;
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
      if (context.state !== 'running') void context.resume().then(() => { wake(); menuSchedule(); }).catch(() => {});
      return true;
    } catch {
      // A partially initialized device must not poison later user-gesture retries.
      mixer?.dispose(); mixer = undefined;
      void context?.close().catch(() => {}); context = undefined;
      return false;
    }
  }
  function setSettings(next: Partial<AudioSettings>) {
    settings = sanitizeSettings({ ...settings, ...next });
    writeJson(AUDIO_STORAGE_KEY, settings); // refused: memory-only preferences
    mixer?.setSettings(settings);
    if (settings.muted) { const wanted = menuWanted || menuAfterMute; stopMenu(0); menuAfterMute = wanted; halt(); }
    else {
      unlock();
      if (menuAfterMute) { menuAfterMute = false; ensure(); startMenu(); }
    }
  }
  return {
    unlock,
    settings: () => ({ ...settings }),
    setSettings,
    start(state: RunState) {
      stopMenu(0); mixer?.stop(); observer.reset(state);
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
          // The title theme returns once the result's stinger has played (it fades in under the results).
          clearTimeout(resultTimer);
          resultTimer = setTimeout(() => { resultTimer = undefined; if (terminal) startMenu(); }, MENU_AFTER_RESULT * 1000);
        }
      }
    },
    /**
     * The launch warp's whoosh, in the tap that starts a flight (main.ts), a fifth up so it peaks as the shortest warp
     * breaks out (1 s). Only if its sample is already made: nothing is ever synthesized in that tap.
     */
    launch() {
      // The title theme fades out over the warp; the world's music starts as the flight does (start).
      stopMenu(MENU_FADE_OUT);
      if (settings.muted || !mixer || !context || disposed || !mixer.ready('whoosh')) return;
      clearSuspend(); mixer.setActive(true);
      mixer.cue({ sound: 'whoosh', pan: 0, gain: .8, variant: 0, transpose: 7 });
    },
    /** The title theme: on the first interaction with the menu (main.ts), on leaving a flight, and after a run's result
     * (observe). It fades in, and keeps playing through the menus until a launch. */
    menu() { if (!disposed && (settings.muted || ensure())) startMenu(); },
    /** A menu sound (ui-sounds.ts), only if it is already made; it plays outside the master gate, so a paused flight's
     * menu sounds too. */
    ui(sound: UiSound, transpose = 0) {
      if (settings.muted || settings.effects === 0 || disposed || !ensure() || !mixer?.ready(sound)) return;
      mixer.uiCue(sound, transpose);
      if (!active && !menuWanted) scheduleSuspend();
    },
    pause() { stopMenu(.2); active = false; halt(); },
    resume() { active = true; unlock(); },
    quit() {
      active = false; terminal = false; boss.reset(); mixer?.setBossMix(0, 0);
      // Leaving a flight: its music stops; the title theme, if it already plays (after a result), plays on.
      if (menuWanted) { clearInterval(timer); timer = undefined; mixer?.stopGroup('music'); } else halt();
    },
    diagnostics() {
      let rms = 0;
      if (mixer && context?.state === 'running') {
        const samples = new Float32Array(mixer.analyser.fftSize);
        mixer.analyser.getFloatTimeDomainData(samples);
        for (const n of samples) rms += n * n;
        rms = Math.sqrt(rms / samples.length);
      }
      return { state: context?.state ?? 'locked', active, planet, terminal, menuWanted, menuPlaying, menuStep: menuClock.step,
        bossStage: boss.target, playingStage: boss.stageAt(clock.step), switchAt: boss.pending(clock.step)?.at ?? null,
        scoreStep: clock.step, nextBeatAt: clock.nextAt, ...settings, rms, ...mixer?.diagnostics() };
    },
    dispose() {
      disposed = true; active = false;
      clearInterval(timer); clearInterval(menuTimer); clearTimeout(menuStop); clearTimeout(resultTimer); clearSuspend();
      mixer?.dispose(); void context?.close();
    },
  };
}
export type GameAudio = ReturnType<typeof createGameAudio>;
