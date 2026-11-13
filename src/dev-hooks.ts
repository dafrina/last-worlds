import { stepRun } from './sim/game';
import { bossTarget, resolveBossPhase } from './sim/boss';
import { destroySiteCore } from './sim/sites';
import { BOSSES, bossParts, phaseOneParts } from './content/bosses';
import { STEP, type RunConfig, type RunState } from './shared/contracts';
import type { GameAudio } from './audio/engine';

/**
 * Development-only hooks on `window.__LAST_WORLDS__` (main.ts installs them under `import.meta.env.DEV`; production
 * builds drop this module). Read-only snapshots let browser tests inspect real gameplay; the rest is look-dev and the
 * perf bench (tools/perf-bench.mjs).
 */

/** One measured frame of the perf bench: its JS work (ms), the run clock and the scroll speed. */
export interface BenchFrame { sim: number; render: number; total: number; time: number; speed: number }
/**
 * Development-only perf bench (tools/perf-bench.mjs): every rendered frame steps exactly `steps` ticks with a scripted
 * weave, so a measured flight repeats tick for tick whatever the machine's speed; it records each frame's JS work (ms).
 */
export interface Bench {
  steps: number; lives: number; frames: BenchFrame[]; steerTo?: number;
  /**
   * A recorded flight replayed tick by tick (tools/record-run.mjs): the steering of each tick ('l', '.', 'r'), from
   * tick 0. The loop then steps only the ticks `queue` asks for (the recorder's clock), not `steps`.
   */
  replay?: string; queue?: number;
  /** A pacifist replay (docs/41): the ship's shots are removed before they can land, as the recording flew it. */
  noFire?: boolean;
}

/** What the hooks reach in main.ts: its live flight, audio, launcher, renderer quality and bench. */
export interface DevHooksHost {
  run(): RunState | null;
  audio: Pick<GameAudio, 'diagnostics'>;
  start(config: RunConfig): Promise<void>;
  setQuality(quality: 'high' | 'low'): void;
  bench(): Bench | null;
  setBench(bench: Bench | null): void;
  /** Development-only autopilot (docs/41): a test pilot flies the live run, or null hands it back. */
  setAutopilot(name: string | null): Promise<void>;
}

export function createDevHooks(host: DevHooksHost) {
  return {
    snapshot: (): RunState | null => { const run = host.run(); return run ? structuredClone(run) : null; },
    audio: () => host.audio.diagnostics(),
    // Look-dev only: ends the current flight as lost or complete, to capture the ending sequences.
    // Look-dev only: fast-forward the flight (invulnerable) and destroy the boss, to capture boss endings.
    // `exposed` (look-dev captures of enemy fire) keeps the ship vulnerable: enemies hold fire on an invulnerable ship.
    advance: (seconds: number, exposed = false) => { const run = host.run(); if (!run) return; const until = run.time + seconds; run.player.invulnerableUntil = exposed ? Math.min(run.player.invulnerableUntil, run.time) : Infinity; while (run.time < until && run.phase === 'playing') stepRun(run, { horizontal: 0, specialPressed: false, pausePressed: false }, STEP); },
    // Look-dev only: launch a flight with any config (a campaign loadout without a save), and fire the special.
    launch: (config: RunConfig) => { void host.start(config); },
    special: () => { const run = host.run(); if (run?.phase === 'playing') { run.player.specialCharge = 1; stepRun(run, { horizontal: 0, specialPressed: true, pausePressed: false }, STEP); } },
    // Look-dev only: the lives left (the last-life alarm shows at one).
    setLives: (lives: number) => { const run = host.run(); if (run) run.player.lives = lives; },
    // The flank weak points only (look-dev captures of a boss's core phase).
    killFlanks: () => { const run = host.run(); if (!run?.boss) return; for (const part of phaseOneParts(BOSSES[run.boss.id])) { const target = bossTarget(run, part); if (target) target.hp = 0; } resolveBossPhase(run); },
    // Look-dev: the flanks down and the core into its overload (a boss's beam lanes).
    bossOverload: () => { const run = host.run(); if (!run?.boss) return; for (const part of phaseOneParts(BOSSES[run.boss.id])) { const target = bossTarget(run, part); if (target) target.hp = 0; } resolveBossPhase(run); const core = bossTarget(run, 'core'); if (core) core.hp = core.maxHp * .35; resolveBossPhase(run); },
    killBoss: () => { const run = host.run(); if (!run?.boss) return; for (const part of bossParts(BOSSES[run.boss.id])) { const target = bossTarget(run, part); if (target) target.hp = 0; } resolveBossPhase(run); },
    // Look-dev only: sets off an explosion effect at a flight-plane point (presentation; no damage).
    boom: (kind: 'explosion' | 'blast' | 'hit', x: number, s: number) => { const run = host.run(); if (run) run.effects.push({ id: run.nextId++, kind, x, s, ttl: .6, duration: .6 }); },
    // Perf bench (tools/perf-bench.mjs): fixed ticks per frame and a scripted weave; `benchStop` returns the frame timings.
    bench: (steps = 1, lives = 5, steerTo?: number) => { host.setBench({ steps, lives, frames: [], ...(steerTo === undefined ? {} : { steerTo }) }); },
    // Perf bench: every live strike-site core falls as damageEnemy kills one (its kill explosion, its site's loot).
    killSites: () => {
      const run = host.run();
      if (!run) return 0;
      const cores = run.enemies.filter(enemy => enemy.site && enemy.hp > 0);
      for (const core of cores) { core.hp = 0; run.effects.push({ id: run.nextId++, kind: 'explosion', x: core.x, s: core.s, ttl: .5, duration: .5 }); destroySiteCore(run, core); }
      run.enemies = run.enemies.filter(enemy => !enemy.site || enemy.hp > 0);
      return cores.length;
    },
    benchFrames: () => host.bench()?.frames.length ?? -1,
    // Replay recorder: queue ticks for the next frame (a bench with `replay` steps only these).
    tick: (ticks = 1) => { const bench = host.bench(); if (bench) bench.queue = (bench.queue ?? 0) + ticks; },
    // Replay recorder: arm the bench with a recorded flight's steering (set before launching it, so no tick runs unasked).
    replay: (inputs: string, noFire = false) => { host.setBench({ steps: 0, lives: 0, frames: [], replay: inputs, queue: 0, noFire }); },
    // The autopilot (docs/41): 'perfect', 'skilled', 'hunter' or 'pacifist' flies the live run; null hands it back.
    autopilot: (name: string | null) => host.setAutopilot(name),
    // A cheap look at the flight (no state clone): its phase, tick and clock.
    status: () => { const run = host.run(); return run ? { phase: run.phase, tick: run.tick, time: run.time } : null; },
    benchStop: () => { const frames = host.bench()?.frames ?? []; host.setBench(null); return frames; },
    setQuality: (quality: 'high' | 'low') => host.setQuality(quality),
    end: (phase: 'over' | 'complete') => { const run = host.run(); if (run?.phase === 'playing') { run.phase = phase; run.message = phase === 'complete' ? 'MISSION COMPLETE' : 'FLIGHT LOST'; if (phase === 'over') run.player.lives = 0; } },
  };
}

export type DevHooks = ReturnType<typeof createDevHooks>;

/** Defines `window.__LAST_WORLDS__` (development builds only: main.ts calls this under `import.meta.env.DEV`). */
export function installDevHooks(host: DevHooksHost): void {
  Object.defineProperty(window, '__LAST_WORLDS__', { value: createDevHooks(host), configurable: true });
}

declare global {
  interface Window {
    /** Development builds only (src/dev-hooks.ts); undefined in production. */
    __LAST_WORLDS__?: DevHooks;
  }
}
