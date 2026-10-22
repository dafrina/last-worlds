/**
 * Diagnostic overlay (`?perf`, performance work 22 October): frame pacing and where each frame's time goes, so a flight
 * can be measured on an actual phone. Presentation only: it reads timings and the renderer's QA stats, never game state.
 */
const WINDOW = 240, LONG_MS = 50;

export interface PerfOverlay {
  /** One displayed frame: its interval and the milliseconds spent simulating and rendering it. */
  frame(intervalMs: number, simMs: number, renderMs: number): void;
  dispose(): void;
}

export function createPerfOverlay(parent: HTMLElement, canvas: HTMLElement): PerfOverlay {
  const box = document.createElement('pre');
  box.className = 'perf-overlay';
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed', left: '6px', top: 'calc(env(safe-area-inset-top, 0px) + 44px)', zIndex: '50', margin: '0', padding: '5px 7px',
    font: '10px/1.35 ui-monospace, Menlo, monospace', color: '#d8f3ff', background: '#020a14b8', borderRadius: '4px', pointerEvents: 'none',
    whiteSpace: 'pre',
  });
  parent.appendChild(box);
  const intervals = new Float32Array(WINDOW), sims = new Float32Array(WINDOW), renders = new Float32Array(WINDOW);
  let count = 0, next = 0, lastText = 0, longFrames = 0, worst = 0, frames = 0;
  const percentile = (values: Float32Array, n: number, p: number) => {
    const sorted = Array.from(values.subarray(0, n)).sort((a, b) => a - b);
    return sorted[Math.min(n - 1, Math.floor(p * (n - 1)))] ?? 0;
  };
  const stat = (values: Float32Array, n: number) => {
    let sum = 0, max = 0;
    for (let i = 0; i < n; i++) { sum += values[i]; max = Math.max(max, values[i]); }
    return `${(sum / Math.max(1, n)).toFixed(1)}/${max.toFixed(1)}`;
  };
  return {
    frame(intervalMs, simMs, renderMs) {
      intervals[next] = intervalMs; sims[next] = simMs; renders[next] = renderMs;
      next = (next + 1) % WINDOW; count = Math.min(WINDOW, count + 1); frames++;
      if (frames > 30 && intervalMs > LONG_MS) { longFrames++; worst = Math.max(worst, intervalMs); }
      const now = performance.now();
      if (now - lastText < 500) return;
      lastText = now;
      const p50 = percentile(intervals, count, .5), p95 = percentile(intervals, count, .95), max = percentile(intervals, count, 1);
      let render = '';
      try {
        const stats = JSON.parse(canvas.dataset.renderStats ?? '{}') as { calls?: number; triangles?: number; pixelRatio?: number; tier?: string };
        render = `calls ${stats.calls ?? '?'} · tris ${Math.round((stats.triangles ?? 0) / 1000)}k · dpr ${stats.pixelRatio ?? '?'} · ${stats.tier ?? '?'}`;
      } catch { render = ''; }
      box.textContent = `${Math.round(1000 / Math.max(1, p50))} fps · p50 ${p50.toFixed(1)} p95 ${p95.toFixed(1)} max ${max.toFixed(0)} ms\n`
        + `long >${LONG_MS} ms: ${longFrames} · worst ${worst.toFixed(0)} ms\n`
        + `sim ${stat(sims, count)} · render ${stat(renders, count)} ms (avg/max)\n${render}`;
      canvas.dataset.perf = JSON.stringify({ p50, p95, max, longFrames, worst, frames });
    },
    dispose() { box.remove(); },
  };
}
