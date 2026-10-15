import { createRun, stepRun } from './sim/game';
import { createRenderer } from './render/scene';
import { createUi } from './ui/game-ui';
import { createInput } from './input/controls';
import { STEP, type RunConfig, type RunState } from './shared/contracts';

const root = document.querySelector<HTMLElement>('#app')!;
let run: RunState | null = null;
let accumulator = 0;
let lastTime = performance.now();
let pendingSpecial = false;
let muted = false;
let audioContext: AudioContext | undefined;
let lastSoundAt = 0;
let lastEffectId = 0;
let lastPauseReason = '';
let maxFrameMs = 0;
let warmupFrames = 2;
/**
 * Death afterglow (presentation only): when the last life is lost, a throwaway copy of the run keeps flying in
 * slow motion for a moment, so the explosion plays out and the world drifts on while the results fade in. The real
 * run is already over and is never stepped again; nothing in the copy can reach the log, score or results.
 */
const AFTERGLOW_SECONDS = 2.6;
let afterglow: { source: RunState; state: RunState; left: number; accumulator: number; lastId: number } | null = null;
function updateAfterglow(frameSeconds: number) {
  if (run?.phase === 'over' && afterglow?.source !== run) {
    try {
      const state = structuredClone(run);
      state.phase = 'playing'; state.player.invulnerableUntil = Infinity;
      afterglow = { source: run, state, left: AFTERGLOW_SECONDS, accumulator: 0, lastId: state.nextId };
    } catch { afterglow = null; }
  }
  if (!afterglow || afterglow.source !== run) return null;
  if (afterglow.left <= 0) return afterglow.state;
  afterglow.left -= frameSeconds;
  // Eases from deep slow motion (0.25×) toward a gentle drift (0.7×) as the results panel arrives.
  afterglow.accumulator += frameSeconds * (0.25 + 0.45 * (1 - afterglow.left / AFTERGLOW_SECONDS));
  try {
    while (afterglow.accumulator >= STEP && afterglow.state.phase === 'playing') {
      stepRun(afterglow.state, { horizontal: 0, specialPressed: false, pausePressed: false }, STEP);
      // The ship is gone: drop any shot the copy fires after the moment of death.
      const lastId = afterglow.lastId;
      afterglow.state.projectiles = afterglow.state.projectiles.filter(shot => !shot.friendly || shot.id < lastId);
      afterglow.accumulator -= STEP;
    }
  } catch { afterglow.left = 0; }
  return afterglow.state;
}

function unlockAudio() {
  if (muted) return;
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume().catch(() => undefined);
  } catch { /* Sound is optional; blocked audio never interrupts the flight. */ }
}

// Bastion-9 audio cues: phase changes and module kills (presentation only; reads state, never writes it).
let bossKey = '';
function bossCues(state: RunState) {
  const boss = state.boss;
  const parts = state.enemies.filter(enemy => enemy.bossPart).map(enemy => `${enemy.bossPart}${enemy.hp > 0 ? 1 : 0}`).sort().join();
  const key = boss ? `${boss.startedAt}|${boss.phase}|${parts}` : '';
  if (key === bossKey) return;
  const [previousStart, previousPhase, previousParts = ''] = bossKey.split('|');
  bossKey = key;
  if (!boss) return;
  if (previousStart !== String(boss.startedAt)) { tone(55, 1.4, 0.07); tone(82, 1.1, 0.04); return; }
  if (boss.phase !== previousPhase) {
    if (boss.phase === 'batteries') tone(330, 0.25, 0.04);
    if (boss.phase === 'core') { tone(260, 0.5, 0.05); tone(520, 0.35, 0.03); }
    if (boss.phase === 'overload') tone(180, 0.7, 0.05);
    if (boss.phase === 'destroyed') { tone(48, 2.2, 0.09); tone(70, 1.6, 0.06); }
  } else if (parts !== previousParts) tone(64, 0.6, 0.08);
}

function tone(frequency: number, duration: number, volume: number) {
  const context = audioContext;
  if (muted || !context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * 0.35), context.currentTime + duration);
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

function pause(reason = 'manual') {
  if (run?.phase !== 'playing') return;
  run.phase = 'paused';
  lastPauseReason = reason;
  input.clear();
  pendingSpecial = false;
  accumulator = 0;
  ui.update(run);
}

function start(config: RunConfig) {
  unlockAudio();
  run = createRun(config);
  input.clear();
  pendingSpecial = false;
  accumulator = 0;
  lastTime = performance.now();
  warmupFrames = 2;
  maxFrameMs = 0;
  lastPauseReason = '';
  lastEffectId = 0;
  ui.update(run);
}

const ui = createUi(root, {
  start, pause,
  resume() {
    if (run?.phase !== 'paused') return;
    input.clear();
    pendingSpecial = false;
    accumulator = 0;
    lastTime = performance.now();
    warmupFrames = 1;
    run.phase = 'playing';
    unlockAudio();
    ui.update(run);
  },
  quit() {
    input.clear();
    run = null;
    pendingSpecial = false;
    accumulator = 0;
    ui.showMenu();
  },
  setMuted(value) { muted = value; if (!muted) unlockAudio(); },
  setQuality(value) { renderer?.setQuality(value); },
});
const input = createInput(ui.surface, ui.specialButton);
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
window.addEventListener('blur', () => { input.clear(); pause('blur'); });
ui.canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  pause();
  ui.showError('Graphics were interrupted. Reload to restart this prototype flight.');
});

function frame(now: number) {
  // Scene creation and initial shader compilation are loading, not active flight time.
  const elapsed = warmupFrames > 0 ? 0 : Math.max(0, (now - lastTime) / 1000);
  if (warmupFrames > 0) warmupFrames--;
  maxFrameMs = Math.max(maxFrameMs, elapsed * 1000);
  lastTime = now;
  const controls = input.sample();
  if (controls.pausePressed) pause();
  // A foreground rendering hitch drops its backlog without opening a pause menu.
  // Actual background/blur events pause explicitly; neither path simulates unseen time.
  const frameSeconds = elapsed > 0.25 ? 0 : Math.min(elapsed, STEP * 5);
  if (elapsed > 0.25) accumulator = 0;
  if (run?.phase === 'playing') {
    pendingSpecial ||= controls.specialPressed;
    accumulator += frameSeconds;
    while (accumulator >= STEP && run.phase === 'playing') {
      stepRun(run, { horizontal: controls.horizontal, specialPressed: pendingSpecial, pausePressed: false }, STEP);
      pendingSpecial = false;
      accumulator -= STEP;
    }
    for (const effect of run.effects) {
      if (effect.id <= lastEffectId) continue;
      lastEffectId = effect.id;
      if (now - lastSoundAt < 65) continue;
      if (effect.kind === 'explosion') tone(95, 0.18, 0.04);
      if (effect.kind === 'special') tone(220, 0.5, 0.06);
      if (effect.kind === 'shield') tone(420, 0.13, 0.035);
      if (effect.kind === 'pickup') tone(740, 0.09, 0.025);
      lastSoundAt = now;
    }
    bossCues(run);
  }
  const dying = updateAfterglow(frameSeconds);
  renderer?.render(dying ?? run ?? preview, dying ? afterglow!.accumulator / STEP : accumulator / STEP);
  ui.update(run);
  if (import.meta.env.DEV) ui.canvas.dataset.frameState = JSON.stringify({ phase: run?.phase, time: run?.time, maxFrameMs, lastPauseReason });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only development snapshots let browser tests inspect real gameplay.
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__LAST_WORLDS__', {
    value: { snapshot: () => run ? structuredClone(run) : null },
    configurable: true,
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    observer.disconnect(); input.dispose(); ui.dispose(); renderer?.dispose();
    void audioContext?.close();
    // A full page refresh prevents duplicate loops/listeners after module edits.
    location.reload();
  });
}
