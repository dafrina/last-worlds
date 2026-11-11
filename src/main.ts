import { createRun, stepRun } from './sim/game';
import { createRenderer } from './render/scene';
import { createUi } from './ui/game-ui';
import { createPerfOverlay } from './ui/perf-overlay';
import { createPerfLog, exportPerfLog } from './ui/perf-log';
import { createFramePacer } from './shared/frame-pacing';
import { createTiltSource, readSteeringMode } from './input/tilt';
import { createInput } from './input/controls';
import { STEP, VIEW, type RunConfig, type RunState } from './shared/contracts';
import { WARP, warpSpeed } from './content/departure';
import { createGameAudio } from './audio/engine';
import { prefetchSamples } from './audio/sample-bank';
import { mountAudioSettings } from './audio/settings';
import { installDevHooks, type Bench } from './dev-hooks';
import { safeStorage } from './shared/storage';

const root = document.querySelector<HTMLElement>('#app')!;
let run: RunState | null = null;
let accumulator = 0;
let lastTime = performance.now();
let pendingSpecial = false;
let pendingDash: -1 | 1 | undefined;
const audio = createGameAudio();
// Sound samples are made in a worker from boot, never inside the first launch's tap (src/audio/sample-bank.ts).
prefetchSamples();
let lastPauseReason = '';
let maxFrameMs = 0;
let warmupFrames = 2;
let launchId = 0, startPaused = false, waitingForWorld = false;
let loadingRun: RunState | null = null;
/** The launch warp runs at least this long (ms); past SLOW_LOADING_MS the loading panel shows over it. */
const MIN_LOADING_MS = 1000, SLOW_LOADING_MS = 8000;
/**
 * Ending afterglow (presentation only). The real run is over and is never stepped again; a throwaway copy keeps the
 * world moving while the results fade in, and nothing in the copy can reach the log, score or results.
 * - Lost: the copy keeps flying in slow motion (the hero is gone, its explosion plays out).
 * - Complete: the hero cruises on, accelerates and jumps to hyperdrive like an endless planet jump; the results
 *   arrive just after the jump's flash.
 */
const AFTERGLOW_SECONDS = 2.6, VICTORY_SECONDS = 4.4;
/**
 * Victory warp: the same sequence as an endless planet jump (src/content/departure.ts). The run completes as the
 * departure ends, so the warp starts at once, from the departure's speed; its flash lands at the midpoint.
 */
let afterglow: { source: RunState; state: RunState; left: number; accumulator: number; lastId: number; victory: boolean; warpFrom: number } | null = null;
function updateAfterglow(frameSeconds: number) {
  if ((run?.phase === 'over' || run?.phase === 'complete') && afterglow?.source !== run) {
    try {
      const state = structuredClone(run), victory = run.phase === 'complete';
      state.phase = 'playing'; state.player.invulnerableUntil = victory ? -1 : Infinity;
      if (victory) {
        state.projectiles = []; state.hazards = [];
        state.jump = { startedAt: state.time, duration: WARP.duration, from: state.planet, to: state.planet };
      }
      afterglow = { source: run, state, left: victory ? VICTORY_SECONDS : AFTERGLOW_SECONDS, accumulator: 0, lastId: state.nextId, victory, warpFrom: Math.max(VIEW.scrollSpeed, state.scrollSpeed) };
    } catch { afterglow = null; }
  }
  if (!afterglow || afterglow.source !== run) return null;
  if (afterglow.left <= 0) return afterglow.state;
  afterglow.left -= frameSeconds;
  const state = afterglow.state;
  if (afterglow.victory) {
    // No simulation: time and the terrain scroll advance, surging through the warp (the hero stays in its row).
    const jump = state.jump!;
    const q = Math.min(1, Math.max(0, (state.time - jump.startedAt) / jump.duration));
    state.scrollSpeed = warpSpeed(q, afterglow.warpFrom, VIEW.scrollSpeed, WARP.peak);
    state.time += frameSeconds; state.distance += state.scrollSpeed * frameSeconds;
    // The boss wreck is anchored to the ground: it falls behind with the terrain instead of riding along with the
    // ship into the warp.
    if (state.boss) {
      const fall = state.scrollSpeed * frameSeconds;
      state.boss.s -= fall;
      for (const enemy of state.enemies) if (enemy.bossPart) enemy.s -= fall;
    }
    state.player.vx = 0;
    return state;
  }
  // Eases from deep slow motion (0.25×) toward a gentle drift (0.7×) as the results panel arrives.
  afterglow.accumulator += frameSeconds * (0.25 + 0.45 * (1 - afterglow.left / AFTERGLOW_SECONDS));
  try {
    while (afterglow.accumulator >= STEP && state.phase === 'playing') {
      stepRun(state, { horizontal: 0, specialPressed: false, pausePressed: false }, STEP);
      // The ship is gone: drop any shot the copy fires after the moment of death.
      const lastId = afterglow.lastId;
      state.projectiles = state.projectiles.filter(shot => !shot.friendly || shot.id < lastId);
      afterglow.accumulator -= STEP;
    }
  } catch { afterglow.left = 0; }
  return state;
}

function pause(reason = 'manual') {
  if (loadingRun) startPaused = true;
  audio.pause();
  if (run?.phase !== 'playing') return;
  run.phase = 'paused';
  lastPauseReason = reason;
  input.clear();
  pendingSpecial = false; pendingDash = undefined;
  accumulator = 0;
  ui.update(run);
}

async function start(config: RunConfig) {
  const id = ++launchId, candidate = createRun(config);
  // World missions (docs/35) observe a campaign run's events, which game-ui drains each frame. Endless is never observed.
  if (candidate.config.mode === 'campaign') candidate.events = [];
  run = null; afterglow = null; loadingRun = candidate; startPaused = false;
  candidate.phase = 'paused';
  // Unlock on the initiating gesture; music starts only after loading finishes.
  audio.quit(); audio.unlock(); audio.launch(); input.clear();
  // The launch warp plays while the world is prepared (user, 21 October): opaque deep space with the ship cruising; endless,
  // with more to load, simply warps longer. A slow load shows the panel over it, with its way back to the menu.
  // The flight's ship starts loading before the warp shows it cruising (the renderer hides it until it is the right one).
  const heroReady = renderer?.prepareHero?.(candidate.config);
  ui.showLoading(true); ui.setLoadingWarp(true); renderer?.launchWarp('cruise');
  // The warp is on screen before the flight is built (user, 29 October: the tap "hangs" before even the warp appears):
  // preparation ends no earlier than two frames from now, the first of them a cruise-only frame.
  const shown = new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const shownAt = performance.now();
  let panel = false;
  const slow = setTimeout(() => { if (id === launchId) { panel = true; ui.setLoadingWarp(false); } }, SLOW_LOADING_MS);
  try {
    // The world and the ship the flight shows (its chassis and look) load together under the warp.
    await Promise.all([renderer?.prepare(candidate.planet), heroReady, shown]);
    if (id !== launchId) return;
    // Build, compile and upload the actual destination under the warp, before its clock starts (a held warp frame).
    renderer?.launchWarp('ready');
    renderer?.render(candidate, 0);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (id !== launchId) return;
    // The warp runs at least MIN_LOADING_MS (user, 21 October: the loading screen was "so abrupt"), then breaks out: the
    // flight starts at the flash and the veil lifts onto the world.
    const hold = MIN_LOADING_MS - (performance.now() - shownAt);
    if (hold > 0) await new Promise<void>(resolve => setTimeout(resolve, hold));
    if (id !== launchId) return;
    clearTimeout(slow);
    if (panel) { await ui.fadeLoading(); if (id !== launchId) return; }
    const flash = renderer?.launchWarp('arrive') ?? 0;
    if (flash > 0) await new Promise<void>(resolve => setTimeout(resolve, flash * 1000));
    if (id !== launchId) return;
    run = candidate; loadingRun = null;
    perfLog?.begin(run);
    run.phase = startPaused || document.hidden || sideways?.matches ? 'paused' : 'playing';
    audio.start(run); if (run.phase === 'paused') audio.pause();
    pendingSpecial = false; pendingDash = undefined; accumulator = 0; lastTime = performance.now();
    warmupFrames = 2; maxFrameMs = 0; lastPauseReason = startPaused ? 'loading-blur' : '';
    ui.showLoading(false); ui.update(run);
  } catch (error) {
    clearTimeout(slow); renderer?.launchWarp('off');
    if (id !== launchId) return;
    loadingRun = null; console.error('Flight preparation failed', error);
    ui.showError('The flight could not be prepared. Reload to try again.');
  }
}

const steeringStorage = safeStorage();
const tilt = createTiltSource(readSteeringMode(steeringStorage));
const ui = createUi(root, {
  start, pause,
  resume() {
    if (run?.phase !== 'paused') return;
    input.clear();
    pendingSpecial = false; pendingDash = undefined;
    accumulator = 0;
    lastTime = performance.now();
    warmupFrames = 1;
    run.phase = 'playing';
    audio.resume();
    ui.update(run);
  },
  quit() {
    ++launchId; loadingRun = null; waitingForWorld = false; renderer?.launchWarp('off');
    audio.quit();
    input.clear();
    run = null;
    pendingSpecial = false; pendingDash = undefined;
    accumulator = 0;
    ui.showMenu();
  },
  setMuted(value) { audio.setSettings({ muted: value }); },
  setQuality(value) { renderer?.setQuality(value); },
  setSteering: mode => tilt.setMode(mode),
  heroPreview: (ship, look, width, height) => renderer?.heroPreview?.(ship, look, width, height) ?? Promise.resolve(null),
  preloadHero: (ship, look) => renderer?.preloadHero?.(ship, look),
});
const disposeAudioSettings = mountAudioSettings(root, audio);
const input = createInput(ui.surface, ui.specialButton, tilt);
let renderer: ReturnType<typeof createRenderer> | undefined;
try {
  renderer = createRenderer(ui.canvas);
} catch (error) {
  console.error('3D renderer initialization failed', error);
  ui.showError('This flight needs WebGL 2. Try a current browser with hardware graphics enabled.');
}

const preview = createRun({ mode: 'endless', seed: 137 });
preview.phase = 'paused';
const observer = new ResizeObserver(() => {
  input.clear();
  const rect = ui.canvas.getBoundingClientRect();
  renderer?.resize(rect.width, rect.height);
});
observer.observe(ui.canvas);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause('hidden'); });
// Portrait only: a phone turned sideways pauses the flight under the rotate notice (styles.css). Where the browser
// allows it (Android, installed app), also ask for a portrait lock on the first touch.
const sideways = typeof matchMedia === 'function' ? matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 600px)') : null;
sideways?.addEventListener('change', event => { if (event.matches) { input.clear(); pause('rotate'); } });
window.addEventListener('pointerdown', () => {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (kind: string) => Promise<void> };
  orientation?.lock?.('portrait').catch(() => { /* Not supported outside fullscreen or on iOS: the notice covers it. */ });
}, { once: true });
// Resume clicks start a countdown; unlock synchronously on the gesture, before that delayed callback.
window.addEventListener('pointerdown', () => { if (run) audio.unlock(); });
window.addEventListener('keydown', () => { if (run) audio.unlock(); });
window.addEventListener('blur', () => { input.clear(); pause('blur'); });
ui.canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  pause();
  ui.showError('Graphics were interrupted. Reload to restart this prototype flight.');
});

/** `?perf`: the diagnostic frame-time overlay (src/ui/perf-overlay.ts), for measuring flights on phones. */
const perf = new URLSearchParams(location.search).has('perf') ? createPerfOverlay(document.body, ui.canvas) : null;
/**
 * `?perf`: the flight's frame log (src/ui/perf-log.ts) and an export button on the results screen, so a phone run can be
 * read without a screen recording (user, 6 November).
 */
const perfLog = perf ? createPerfLog() : null;
if (perfLog) {
  const results = document.querySelector('.results-panel'), retry = results?.querySelector('[data-action="retry"]');
  if (results && retry) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'arcade-button secondary'; button.dataset.action = 'perf-export';
    button.textContent = 'EXPORT PERF LOG';
    button.addEventListener('click', () => { void exportPerfLog(perfLog).catch(error => console.warn('Perf log export failed', error)); });
    results.insertBefore(button, retry);
  }
}
let perfLast = performance.now(), simStart = 0;
/** Development-only perf bench (src/dev-hooks.ts, tools/perf-bench.mjs). */
let bench: Bench | null = null;
/** The bench's scripted weave, or (`steerTo`) a hold near one x (a scenario watching a site on one side). */
const benchSteer = (tick: number, x: number): -1 | 0 | 1 => {
  if (bench?.steerTo !== undefined) { const gap = bench.steerTo - x; return Math.abs(gap) < .3 ? 0 : gap > 0 ? 1 : -1; }
  const phase = tick % 420; return phase < 150 ? 1 : phase < 210 ? 0 : phase < 360 ? -1 : 0;
};

const pacing = createFramePacer();

/** The boot splash (index.html) fades out once the first frame is drawn, then leaves the page. */
let booting = true;
function finishBoot() {
  booting = false;
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 600);
}
function frame(now: number) {
  const frameStart = performance.now();
  // Scene creation and initial shader compilation are loading, not active flight time.
  const elapsed = warmupFrames > 0 ? pacing.reset() : Math.max(0, pacing.paced(now - lastTime) / 1000);
  if (warmupFrames > 0) warmupFrames--;
  maxFrameMs = Math.max(maxFrameMs, elapsed * 1000);
  lastTime = now;
  const controls = input.sample();
  if (controls.pausePressed) pause();
  // A foreground rendering hitch drops its backlog without opening a pause menu.
  // Actual background/blur events pause explicitly; neither path simulates unseen time.
  const frameSeconds = elapsed > 0.25 ? 0 : Math.min(elapsed, STEP * 5);
  if (elapsed > 0.25) accumulator = 0;
  // If an unusually slow connection outlasts the sector's prefetch, hold before the warp
  // switches worlds. No combat ticks, inputs, or unseen flight time are consumed while waiting.
  const destinationPending = () => !!(run?.jump && run.time + STEP >= run.jump.startedAt + run.jump.duration * .48
    && renderer && !renderer.isReady(run.jump.to));
  if (run?.jump) void renderer?.prepare(run.jump.to);
  const pendingWorld = destinationPending();
  if (pendingWorld !== waitingForWorld) {
    waitingForWorld = pendingWorld; input.clear(); pendingSpecial = false; pendingDash = undefined; accumulator = 0;
    if (pendingWorld) audio.pause(); else if (run?.phase === 'playing') audio.resume();
  }
  ui.showLoading(!!loadingRun || waitingForWorld);
  const benching = !!bench && run?.phase === 'playing' && !waitingForWorld;
  if (run?.phase === 'playing' && !waitingForWorld) {
    pendingSpecial ||= controls.specialPressed;
    pendingDash ??= controls.dashPressed;
    if (bench) { accumulator = bench.steps * STEP + 1e-9; run.player.lives = Math.max(run.player.lives, bench.lives); } else accumulator += frameSeconds;
    simStart = performance.now();
    while (accumulator >= STEP && run.phase === 'playing' && !destinationPending()) {
      stepRun(run, { horizontal: bench ? benchSteer(run.tick, run.player.x) : controls.horizontal, specialPressed: pendingSpecial, pausePressed: false, dashPressed: pendingDash }, STEP);
      pendingSpecial = false; pendingDash = undefined;
      accumulator -= STEP;
    }
  }
  if (run) audio.observe(run);
  const simMs = simStart > 0 ? performance.now() - simStart : 0;
  const dying = updateAfterglow(frameSeconds);
  const renderStart = performance.now();
  renderer?.render(loadingRun ?? dying ?? run ?? preview, dying ? (afterglow!.victory ? 0 : afterglow!.accumulator / STEP) : accumulator / STEP);
  const renderMs = performance.now() - renderStart;
  // The menu's first frame is on screen (or the WebGL error panel, without a renderer): drop the boot splash.
  if (booting) finishBoot();
  perf?.frame(now - perfLast, simMs, renderMs);
  const uiStart = performance.now();
  ui.update(run);
  if (perfLog && run) perfLog.frame(now - perfLast, simMs, renderMs, renderer?.perfSample?.(), run,
    { paced: elapsed * 1000, ui: performance.now() - uiStart, js: performance.now() - frameStart });
  perfLast = now; simStart = 0;
  if (bench && benching) bench.frames.push({ sim: simMs, render: renderMs, total: performance.now() - frameStart, time: run?.time ?? 0, speed: run?.scrollSpeed ?? 0 });
  if (import.meta.env.DEV) ui.canvas.dataset.frameState = JSON.stringify({ phase: run?.phase, time: run?.time, maxFrameMs, lastPauseReason });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only development snapshots let browser tests inspect real gameplay (src/dev-hooks.ts).
if (import.meta.env.DEV) installDevHooks({
  run: () => run, audio, start, setQuality: quality => renderer?.setQuality(quality),
  bench: () => bench, setBench: value => { bench = value; },
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    observer.disconnect(); input.dispose(); ui.dispose(); renderer?.dispose();
    disposeAudioSettings(); audio.dispose();
    // A full page refresh prevents duplicate loops/listeners after module edits.
    location.reload();
  });
}
