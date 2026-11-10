/** Store recent steering history for each engine wake. */
export const TRAIL_SECONDS = 1.2;
const SAMPLE_INTERVAL = 1 / 30;
// Half of the distance from this nozzle to the original near-bottom tip.
const VISIBLE_FRACTION = .5;
const CAPACITY = Math.ceil(TRAIL_SECONDS / SAMPLE_INTERVAL) + 2;
// Four nozzles on the largest authored engine kit. One pooled strip per history segment.
export const HERO_TRAIL_STRIPS = CAPACITY * 4;
type Segment = (x0: number, s0: number, x1: number, s1: number, width: number, energy: number) => void;

/** Store nozzle poses in flight time so turning leaves exhaust behind at its original x.
 * Distance is accumulated at emission: changing scroll speed never stretches old segments.
 */
export function createHeroTrail() {
  const times = new Float64Array(CAPACITY), xs = new Float64Array(CAPACITY);
  const banks = new Float64Array(CAPACITY), origins = new Float64Array(CAPACITY);
  let head = 0, count = 0, flow = 0, lastTime = -Infinity, lastDistance = 0;
  function clear() { head = count = flow = 0; lastTime = -Infinity; }
  return {
    clear,
    draw(time: number, distance: number, x: number, z: number, bankCos: number, engines: readonly [number, number][], scale: number, endZ: number, segment: Segment) {
      const dt = time - lastTime;
      if (dt < 0 || dt > TRAIL_SECONDS || distance < lastDistance) clear();
      let front = z;
      for (let i = 0; i < engines.length; i++) front = Math.min(front, z + engines[i][1] * scale);
      // The exhaust keeps flowing with the ground stopped. Allow sampling headroom so
      // the oldest point crosses the desired screen edge even at a low render rate.
      const drift = VISIBLE_FRACTION * Math.max(0, endZ - front) / (TRAIL_SECONDS * .85);
      if (lastTime !== -Infinity) flow += Math.max(distance - lastDistance, drift * dt);
      lastTime = time; lastDistance = distance;
      const newest = (head + CAPACITY - 1) % CAPACITY;
      if (!count || time - times[newest] + 1e-8 >= SAMPLE_INTERVAL) {
        times[head] = time; xs[head] = x; banks[head] = bankCos; origins[head] = z - flow;
        head = (head + 1) % CAPACITY; count = Math.min(count + 1, CAPACITY);
      }
      const width = .19 * scale * Math.sqrt(2 / Math.max(2, engines.length));
      for (let e = 0; e < engines.length; e++) {
        const [ex, ez] = engines[e];
        const nozzleZ = z + ez * scale, span = (endZ - nozzleZ) * VISIBLE_FRACTION;
        const tipZ = nozzleZ + span;
        if (span <= 0) continue;
        let px = x + ex * scale * bankCos, ps = -nozzleZ;
        for (let k = 0; k < count; k++) {
          const i = (head + CAPACITY - 1 - k) % CAPACITY, age = time - times[i];
          if (age > TRAIL_SECONDS) break;
          if (age <= 1e-8) continue;
          let nx = xs[i] + ex * scale * banks[i], ns = -(origins[i] + flow + ez * scale);
          const atEnd = -ns >= tipZ;
          if (atEnd) {
            nx = px + (nx - px) * (-tipZ - ps) / (ns - ps);
            ns = -tipZ;
          }
          // Keep a readable filament throughout the wake. Only the last 14% dissolves.
          const along = Math.max(0, (-(ps + ns) * .5 - nozzleZ) / span);
          const tip = Math.min(1, (1 - along) / .14);
          segment(px, ps, nx, ns, width * (1 - .7 * along) * Math.sqrt(tip), 2.4 * (1 - .45 * along) * tip);
          if (atEnd) break;
          px = nx; ps = ns;
        }
      }
    },
  };
}
