/**
 * `?perf` run log (user, 6 November: "add a button on the success/died screen on ?perf mode that can export a log of the
 * run. this way we dont need to record or dissect a video"). Diagnostic only: it reads frame timings, the renderer's
 * counters and the run's public state, never feeds anything back.
 *
 * Every frame of a flight is kept (timings and counters, plain numbers); events are inferred from what changed since the
 * previous frame (a shader program compiled, geometries or textures uploaded, a terrain section generated on the spot,
 * the boss's phase, a jump, a life lost). The export is one JSON file: device and run, a summary, every slow frame with
 * its own and the previous frame's events, a per-second timeline and the event list.
 */
import type { RunState } from '../shared/contracts';

/** A frame slower than this is listed with its context (60 Hz is 16.7 ms; one missed vsync lands near 33). */
const SLOW_MS = 20;
const LONG_MS = 50;

/** The renderer's per-frame counters (GameRenderer.perfSample). */
export interface PerfSample {
  calls: number; triangles: number; programs: number; geometries: number; textures: number;
  /** Terrain update + animation + prefetch time this frame (ms). */ terrainMs: number;
  /** Terrain stream counters: sections taken from prefetch, generated synchronously after start, at startup. */
  prefetched: number; fallbacks: number; startup: number;
  particles: number; planet: string; quality: string; pixelRatio: number;
}

interface Frame {
  t: number; interval: number; sim: number; render: number; terrain: number; calls: number; tris: number;
  enemies: number; shots: number; particles: number; time: number; distance: number; events: string[];
}

export interface PerfLog {
  /** A new flight: clears the log. */
  begin(state: RunState): void;
  frame(intervalMs: number, simMs: number, renderMs: number, sample: PerfSample | undefined, state: RunState | null): void;
  /** The JSON export of the flight so far. */
  report(): Record<string, unknown>;
  readonly frames: number;
}

export function createPerfLog(): PerfLog {
  let frames: Frame[] = [], events: { t: number; time: number; event: string }[] = [];
  let run: Record<string, unknown> = {}, started = performance.now(), prev: PerfSample | undefined, prevState: { boss?: string; phase?: string; sector?: number; lives?: number; shields?: number; planet?: string } = {};
  let meta: Record<string, unknown> = {};

  const note = (list: string[], t: number, time: number, event: string) => { list.push(event); events.push({ t, time: +time.toFixed(2), event }); };

  return {
    get frames() { return frames.length; },
    begin(state) {
      frames = []; events = []; prev = undefined; prevState = {}; started = performance.now();
      const c = state.config;
      run = { mode: c.mode, mission: c.mission ?? null, difficulty: c.difficulty ?? null, seed: c.seed, weapon: c.weapon ?? null, ship: c.ship ?? null, special: c.special ?? null };
    },
    frame(intervalMs, simMs, renderMs, sample, state) {
      // Flight frames only (and the one where the flight ends), not the pause menu or the results screen idling.
      if (!state || (state.phase !== 'playing' && prevState.phase !== 'playing')) return;
      const t = +(performance.now() - started).toFixed(1), time = state.time, list: string[] = [];
      if (sample && prev) {
        if (sample.programs > prev.programs) note(list, t, time, `shader programs +${sample.programs - prev.programs} (${sample.programs})`);
        if (sample.geometries - prev.geometries >= 3) note(list, t, time, `geometries +${sample.geometries - prev.geometries} (${sample.geometries})`);
        if (sample.textures > prev.textures) note(list, t, time, `textures +${sample.textures - prev.textures} (${sample.textures})`);
        if (sample.fallbacks > prev.fallbacks) note(list, t, time, `terrain section generated on the spot (fallback ${sample.fallbacks})`);
        if (sample.prefetched > prev.prefetched) note(list, t, time, `terrain section attached from prefetch (${sample.prefetched})`);
        if (sample.planet !== prev.planet) note(list, t, time, `planet ${prev.planet} → ${sample.planet}`);
        if (sample.quality !== prev.quality) note(list, t, time, `quality ${prev.quality} → ${sample.quality}`);
      }
      const now = { boss: state.boss ? `${state.boss.id}:${state.boss.phase}` : undefined, phase: state.phase, sector: state.sector, lives: state.player.lives, shields: state.player.shields };
      if (now.boss !== prevState.boss && now.boss) note(list, t, time, `boss ${now.boss}`);
      if (now.phase !== prevState.phase && prevState.phase) note(list, t, time, `run ${prevState.phase} → ${now.phase}`);
      if (prevState.sector !== undefined && now.sector !== prevState.sector) note(list, t, time, `sector ${now.sector}`);
      if (prevState.lives !== undefined && now.lives < prevState.lives) note(list, t, time, 'life lost');
      else if (prevState.shields !== undefined && now.shields < prevState.shields) note(list, t, time, 'shield hit');
      if (state.jump && !(prevState as { jump?: boolean }).jump) note(list, t, time, `jump to ${state.jump.to}`);
      prevState = { ...now, ...(state.jump ? { jump: true } : {}) } as typeof prevState;
      if (sample) {
        prev = sample;
        if (!meta.quality) meta = { quality: sample.quality, pixelRatio: sample.pixelRatio };
      }
      frames.push({
        t, interval: +intervalMs.toFixed(1), sim: +simMs.toFixed(2), render: +renderMs.toFixed(2), terrain: +(sample?.terrainMs ?? 0).toFixed(2),
        calls: sample?.calls ?? 0, tris: Math.round((sample?.triangles ?? 0) / 100) / 10, enemies: state.enemies.length, shots: state.projectiles.length,
        particles: sample?.particles ?? 0, time: +time.toFixed(2), distance: +state.distance.toFixed(1), events: list,
      });
    },
    report() {
      const n = frames.length, sorted = frames.map(f => f.interval).sort((a, b) => a - b);
      const pct = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))] ?? 0;
      const avg = (key: 'sim' | 'render' | 'terrain') => +(frames.reduce((sum, f) => sum + f[key], 0) / Math.max(1, n)).toFixed(2);
      const max = (key: 'sim' | 'render' | 'terrain') => frames.reduce((m, f) => Math.max(m, f[key]), 0);
      // Skip the first frames of a flight (its build and first shader compiles are loading).
      const slow = frames.map((f, i) => ({ f, i })).filter(({ f, i }) => i > 30 && f.interval > SLOW_MS).map(({ f, i }) => ({
        ...f, previousEvents: frames[i - 1]?.events ?? [], previousInterval: frames[i - 1]?.interval ?? null,
      }));
      // Per second of flight time: frame-time average and max, the slowest frame's work, counts.
      const seconds: Record<string, unknown>[] = [];
      let bucket: Frame[] = [], second = 0;
      const flush = () => {
        if (!bucket.length) return;
        const worst = bucket.reduce((a, b) => (b.interval > a.interval ? b : a));
        seconds.push({ second, frames: bucket.length, avgMs: +(bucket.reduce((s, f) => s + f.interval, 0) / bucket.length).toFixed(1), maxMs: worst.interval,
          slow: bucket.filter(f => f.interval > SLOW_MS).length, sim: +(bucket.reduce((s, f) => s + f.sim, 0) / bucket.length).toFixed(2),
          render: +(bucket.reduce((s, f) => s + f.render, 0) / bucket.length).toFixed(2), terrain: +(bucket.reduce((s, f) => s + f.terrain, 0) / bucket.length).toFixed(2),
          calls: worst.calls, ktris: worst.tris, enemies: worst.enemies, shots: worst.shots, particles: worst.particles, distance: worst.distance });
      };
      for (const f of frames) { const s = Math.floor(f.t / 1000); if (s !== second) { flush(); bucket = []; second = s; } bucket.push(f); }
      flush();
      return {
        kind: 'last-worlds-perf-log', version: 1, exportedAt: new Date().toISOString(),
        device: { userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio, screen: [screen.width, screen.height], viewport: [innerWidth, innerHeight],
          hardwareConcurrency: navigator.hardwareConcurrency ?? null, ...meta },
        build: (document.querySelector('script[type="module"]') as HTMLScriptElement | null)?.src ?? null,
        run,
        summary: {
          frames: n, seconds: Math.round((frames.at(-1)?.t ?? 0) / 1000), p50: pct(.5), p95: pct(.95), p99: pct(.99), max: sorted[n - 1] ?? 0,
          slowOver20ms: slow.length, longOver50ms: frames.filter((f, i) => i > 30 && f.interval > LONG_MS).length,
          simAvg: avg('sim'), simMax: max('sim'), renderAvg: avg('render'), renderMax: max('render'), terrainAvg: avg('terrain'), terrainMax: max('terrain'),
        },
        slowFrames: slow, timeline: seconds, events,
      };
    },
  };
}

/** Hands the log to the phone's share sheet (iOS/Android), else downloads it. */
export async function exportPerfLog(log: PerfLog): Promise<void> {
  const report = log.report(), run = report.run as { mission?: string | null; mode?: string };
  const name = `last-worlds-perf-${run.mission ?? run.mode ?? 'run'}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const text = JSON.stringify(report, null, 1), file = new File([text], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: name }); return; } catch (error) { if ((error as Error).name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
