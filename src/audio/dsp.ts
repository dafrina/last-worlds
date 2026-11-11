/** Small offline synthesis kit for the cached music samples (src/audio/instruments.ts). Deterministic, no Web Audio. */
export const TAU = Math.PI * 2;
export const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
export const cents = (value: number) => 2 ** (value / 1200);

/** Small xorshift stream, private to audio. Identical previews across builds. */
export function noiseSource(seed: number) {
  let state = seed || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2147483648 - 1; };
}
export const seedOf = (id: string) => [...id].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261);

/** PolyBLEP correction: removes the step aliasing of a naive sawtooth or pulse. */
function blep(t: number, dt: number) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** Band-limited sawtooth. `next(hz)` advances one sample; the frequency may move every sample. */
export class Saw {
  constructor(private rate: number, public phase = 0) {}
  next(hz: number) {
    const dt = hz / this.rate;
    this.phase += dt; if (this.phase >= 1) this.phase -= 1;
    return 2 * this.phase - 1 - blep(this.phase, dt);
  }
}

/** Band-limited pulse wave from the same correction (width 0.5 is a square). */
export class Pulse {
  constructor(private rate: number, public width = .5, public phase = 0) {}
  next(hz: number) {
    const dt = hz / this.rate;
    this.phase += dt; if (this.phase >= 1) this.phase -= 1;
    const shifted = (this.phase + 1 - this.width) % 1;
    return (this.phase < this.width ? 1 : -1) + blep(this.phase, dt) - blep(shifted, dt);
  }
}

/** A detuned stack of saws: the analogue "unison" that thickens leads, pads and basses. */
export class Unison {
  private voices: Saw[];
  private ratios: number[];
  constructor(rate: number, count: number, spreadCents: number, seed: number) {
    const noise = noiseSource(seed);
    this.voices = Array.from({ length: count }, () => new Saw(rate, .5 + .5 * noise()));
    this.ratios = Array.from({ length: count }, (_, i) => cents(count === 1 ? 0 : spreadCents * (2 * i / (count - 1) - 1)));
  }
  next(hz: number, drift = 1) {
    let sum = 0;
    for (let i = 0; i < this.voices.length; i++) sum += this.voices[i].next(hz * (1 + (this.ratios[i] - 1) * drift));
    return sum / Math.sqrt(this.voices.length);
  }
}

/** A fixed-frequency sine kept by rotation: far cheaper than Math.sin for long, many-partial tones. */
export class Rotor {
  private s: number; private c: number; private ds: number; private dc: number;
  constructor(hz: number, rate: number, phase = 0) {
    this.s = Math.sin(phase); this.c = Math.cos(phase);
    this.ds = Math.sin(TAU * hz / rate); this.dc = Math.cos(TAU * hz / rate);
  }
  next() {
    const s = this.s; this.s = s * this.dc + this.c * this.ds; this.c = this.c * this.dc - s * this.ds;
    return s;
  }
}

/** Topology-preserving state-variable filter (Zavalishin): stable while its cutoff moves. */
export class Svf {
  low = 0; band = 0; high = 0;
  private ic1 = 0; private ic2 = 0; private a1 = 0; private a2 = 0; private a3 = 0; private k = 1;
  constructor(private rate: number, cutoff = 1000, q = .707) { this.set(cutoff, q); }
  set(cutoff: number, q = .707) {
    const g = Math.tan(Math.PI * Math.min(Math.max(cutoff, 10), this.rate * .45) / this.rate);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  run(v: number) {
    const v3 = v - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.low = v2; this.band = v1; this.high = v - this.k * v1 - v2;
    return v2;
  }
}

/** One-pole low-pass smoothing; `high()` gives the complementary high-pass. */
export class OnePole {
  value = 0;
  private a: number;
  constructor(cutoff: number, rate: number) { this.a = 1 - Math.exp(-TAU * cutoff / rate); }
  run(v: number) { return this.value += (v - this.value) * this.a; }
  high(v: number) { return v - this.run(v); }
}

/** Soft clipping: gentle saturation that adds harmonics a phone speaker can reproduce. */
export const drive = (v: number, amount: number) => Math.tanh(v * amount) / Math.tanh(amount);

export interface Finish { seconds: number; rms: number; window: number; limit?: boolean }
/**
 * Anti-click edges, DC removal and loudness. Each music patch is matched to the RMS of the 20 October patch it replaces
 * over the same window, so the score's authored note gains keep their balance; peaks stay at or below 0.85.
 * `limit` patches (sharp attacks) reach that loudness through a soft knee above 0.6 instead of being turned down.
 */
export function finish(samples: Float32Array, rate: number, { seconds, rms, window, limit }: Finish) {
  const count = samples.length;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    samples[i] *= Math.min(1, t / .0015) * Math.min(1, (seconds - t) / .025);
  }
  let dc = 0; for (const value of samples) dc += value; dc /= count;
  let squares = 0, peak = 0;
  const measured = Math.min(count, Math.max(1, Math.round(window * rate)));
  for (let i = 0; i < count; i++) {
    samples[i] -= dc * Math.min(1, i / 48, (count - i - 1) / 48);
    if (!Number.isFinite(samples[i])) samples[i] = 0;
    if (i < measured) squares += samples[i] * samples[i];
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const current = Math.sqrt(squares / measured);
  const scale = current > 0 ? limit ? rms / current : Math.min(rms / current, .85 / Math.max(peak, 1e-9)) : 0;
  const knee = .6, room = .85 - knee;
  for (let i = 0; i < count; i++) {
    const v = samples[i] * scale, size = Math.abs(v);
    samples[i] = limit && size > knee ? Math.sign(v) * (knee + room * Math.tanh((size - knee) / room)) : v;
  }
  return samples;
}
