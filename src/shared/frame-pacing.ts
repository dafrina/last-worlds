/**
 * Frame pacing (6 November). A `?perf` log of an iPhone flight showed 59.9 frames a second on screen, yet one frame in
 * twenty-five reported 21-35 ms and its neighbours about 10 ms: Safari's frame timestamps jitter around the display's
 * refresh. Advancing the world by those raw times moved it 23 ms one frame and 10 ms the next (the "slight stutter",
 * more visible at the quicker campaign pace). Each frame now advances a whole number of refresh periods; the remainder
 * carries to the next frame (never more than one period), so time stays in step with the clock. A real dropped frame
 * still advances two periods; long hitches (over 250 ms) keep their raw time for the main loop's backlog rule.
 */
const REFRESH_RATES = [30, 50, 60, 90, 120];

export interface FramePacer {
  /** The paced length (ms) of a frame whose raw timestamp interval was `rawMs`. */
  paced(rawMs: number): number;
  /** Forget the carried remainder (loading, warm-up, resume); returns 0. */
  reset(): number;
  readonly period: number;
}

export function createFramePacer(): FramePacer {
  let period = 1000 / 60, debt = 0;
  const recent: number[] = [];
  return {
    get period() { return period; },
    reset() { debt = 0; return 0; },
    paced(rawMs) {
      if (rawMs > 0 && rawMs < 50) {
        recent.push(rawMs);
        if (recent.length > 120) recent.shift();
        if (recent.length >= 30 && recent.length % 15 === 0) {
          const sorted = [...recent].sort((a, b) => a - b), median = sorted[sorted.length >> 1];
          const rate = REFRESH_RATES.reduce((best, hz) => (Math.abs(1000 / hz - median) < Math.abs(1000 / best - median) ? hz : best), 60);
          // Snap to a common rate when close; an unusual display keeps its measured period.
          period = Math.abs(1000 / rate - median) / median < .12 ? 1000 / rate : median;
        }
      }
      if (rawMs <= 0 || rawMs > 250) { debt = 0; return rawMs; }
      const total = rawMs + debt, periods = Math.max(1, Math.round(total / period)), paced = periods * period;
      debt = Math.max(-period, Math.min(period, total - paced));
      return paced;
    },
  };
}
