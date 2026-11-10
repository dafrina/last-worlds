import { SPECIALS } from '../content/equipment';
import { midi, noiseSource } from './dsp';
import { BOSS_INSTRUMENTS, isInstrument, LEVEL_INSTRUMENTS, synthesizeInstrument, type Instrument } from './instruments';

export { midi, noiseSource } from './dsp';
export type { Instrument } from './instruments';

/** Original, deterministic sound sources. No downloads, runtime oscillators or gameplay RNG. */
export const SAMPLE_RATE = 32_000;
export type Sound =
  | 'pulse' | 'fan' | 'seeker' | 'rail' | 'enemy' | 'impact' | 'explosion' | 'heavy'
  | 'shield' | 'shield-break' | 'life' | 'pickup' | 'upgrade' | 'ready'
  | 'shockwave' | 'seeker-rack' | 'siege-lance' | 'gravity-well' | 'warning' | 'beam'
  | 'boss-arrival' | 'boss-phase' | 'boss-death' | 'warp' | 'win' | 'loss';
export type SampleId = Sound | Instrument;
const TAU = Math.PI * 2;
const sin = Math.sin;
const exp = Math.exp;
/** Combat and event sounds. Music instruments are patches in src/audio/instruments.ts. */
const durations: Record<Sound, number> = {
  pulse: .18, fan: .24, seeker: .34, rail: .42, enemy: .2, impact: .13, explosion: .85, heavy: 1.6,
  shield: .48, 'shield-break': .95, life: 1.6, pickup: .28, upgrade: .78, ready: .65,
  shockwave: 1.65, 'seeker-rack': .8, 'siege-lance': SPECIALS['siege-lance'].duration, 'gravity-well': 1.6, warning: .65, beam: .85,
  'boss-arrival': 2.8, 'boss-phase': 1.1, 'boss-death': 3.6, warp: 3.1, win: 2.1, loss: 2.1,
};
const LATE: Sound[] = ['boss-arrival', 'boss-phase', 'boss-death', 'warp', 'win', 'loss'];
/** Made in this order at boot (src/audio/sample-worker.ts): what a flight plays first, then the level score,
 * then what only a boss fight, a planet jump or the results need. */
export const SAMPLE_IDS: SampleId[] = [
  ...(Object.keys(durations) as Sound[]).filter(id => !LATE.includes(id)), ...LEVEL_INSTRUMENTS, ...BOSS_INSTRUMENTS, ...LATE,
];

export function synthesize(id: SampleId, rate = SAMPLE_RATE): Float32Array {
  if (isInstrument(id)) return synthesizeInstrument(id, rate);
  const duration = durations[id], count = Math.ceil(duration * rate);
  const samples = new Float32Array(count);
  const seed = [...id].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261);
  const noise = noiseSource(seed);
  let low = 0, slow = 0, phase = 0;
  const laser = ['pulse', 'fan', 'seeker', 'enemy'].includes(id);
  const boom = ['explosion', 'heavy', 'life', 'boss-death'].includes(id);
  for (let i = 0; i < count; i++) {
    const t = i / rate, q = t / duration, n = noise();
    low += (n - low) * .11;
    slow += (n - slow) * .012;
    const high = n - low;
    let v = 0;
    if (laser) {
      const start = id === 'pulse' ? 1950 : id === 'fan' ? 1200 : id === 'seeker' ? 960 : 700;
      const end = id === 'fan' ? 140 : 250;
      phase += TAU * (end + start * exp(-t * (id === 'seeker' ? 9 : 29))) / rate;
      const snap = high * exp(-t * 230) * .3;
      const core = sin(phase + .65 * sin(phase * 1.91) * exp(-t * 25));
      v = snap + core * exp(-t * 30) * .7 + sin(phase * .501) * exp(-t * 19) * .23;
      if (id === 'fan') v += low * exp(-t * 22) * 1.1;
      if (id === 'seeker') v += sin(phase * 1.003 + 2 * sin(TAU * 12 * t)) * exp(-t * 11) * .3;
    } else if (boom) {
      const large = id !== 'explosion', decay = large ? 2.8 : 5.5;
      phase += TAU * (36 + (large ? 88 : 155) * exp(-t * 22)) / rate;
      // A bright crack, mid-body crunch (audible on phones), low pressure and scattered debris.
      const crack = high * exp(-t * 75) * .8;
      const body = Math.tanh(low * 4) * exp(-t * decay * 1.9) * .75;
      const pressure = (sin(phase) * .45 + slow * 4) * exp(-t * decay);
      const debris = high * Math.max(0, sin(t * 83) * sin(t * 137)) ** 8 * exp(-t * 4) * .4;
      v = crack + body + pressure + debris;
      if (id === 'boss-death') {
        const after = Math.max(0, t - .62);
        v += (sin(TAU * 47 * after) * .3 + low * 1.5) * exp(-after * 1.8) * Math.min(1, after * 70);
      }
    } else if (id === 'rail') {
      // Rail Driver (docs/32 §4): a heavy dry crack, a falling zap, a low kick and a short inharmonic metal ring.
      phase += TAU * (180 + 2600 * exp(-t * 60)) / rate;
      const crack = high * exp(-t * 140) * .9;
      const zap = sin(phase) * exp(-t * 34) * .45;
      const kick = sin(TAU * (52 * t + 9 * (1 - exp(-t * 40)))) * exp(-t * 16) * .55;
      const ring = (sin(TAU * 1873 * t) * .5 + sin(TAU * 2931 * t) * .3 + sin(TAU * 4410 * t) * .2) * exp(-t * 11) * .22;
      v = crack + zap + kick + ring;
    } else if (id === 'impact') {
      v = high * exp(-t * 90) * .7 + sin(TAU * 1380 * t + sin(TAU * 2200 * t)) * exp(-t * 65) * .25;
    } else if (id === 'shield' || id === 'shield-break') {
      const broken = id === 'shield-break';
      const bend = broken ? 1 - q * .36 : 1;
      phase += TAU * 740 * bend / rate;
      v = (sin(phase) + sin(phase * 1.498) * .45 + sin(phase * 2.71) * .22) * exp(-t * 8) * .5;
      v += high * exp(-t * (broken ? 8 : 55)) * (broken ? .3 : .12);
      if (broken) v += sin(TAU * (160 * t - 40 * t * t)) * exp(-t * 6) * .3;
    } else if (['pickup', 'upgrade', 'ready', 'win', 'loss'].includes(id)) {
      const notes = id === 'loss' ? [60, 55, 50] : id === 'win' ? [62, 69, 74, 78, 81] : id === 'pickup' ? [86, 93] : [74, 81, 86];
      const spacing = id === 'win' || id === 'loss' ? .14 : .055;
      for (let j = 0; j < notes.length; j++) {
        const a = t - j * spacing;
        if (a < 0) continue;
        const f = midi(notes[j]), attack = Math.min(1, a * 500);
        v += sin(TAU * f * a + .7 * sin(TAU * f * 2 * a) * exp(-a * 20)) * exp(-a * (id === 'pickup' ? 28 : 5)) * attack * .3;
      }
    } else if (['shockwave', 'seeker-rack', 'siege-lance', 'gravity-well', 'beam', 'warp'].includes(id)) {
      if (id === 'gravity-well') {
        // A low hum rising as the singularity opens, with a breathy inward suck (the collapse plays the heavy blast).
        phase += TAU * (48 + 46 * q * q) / rate;
        const swell = Math.min(1, t * 6) * (1 - q) ** .7;
        v = (sin(phase + sin(phase * .5) * 1.4) * .55 + Math.tanh(slow * 6) * .5 + low * .9 * (.3 + .7 * q)) * swell;
      } else if (id === 'seeker-rack') {
        for (let j = 0; j < 4; j++) {
          const a = t - j * .065;
          if (a > 0) v += (low * 2 + sin(TAU * (230 * a + 240 * a * a)) * .4) * exp(-a * 15);
        }
      } else if (id === 'shockwave') {
        phase += TAU * (42 + 180 * exp(-t * 8)) / rate;
        v = (sin(phase) * .7 + Math.tanh(low * 3) * .6) * exp(-t * 3.5) + high * exp(-t * 60) * .5;
      } else {
        const warp = id === 'warp';
        const f = warp ? 90 * 2 ** (q * 4) : 120 + 26 * sin(TAU * t * 2);
        phase += TAU * f / rate;
        const swell = warp ? Math.sin(Math.PI * q) ** 1.4 : Math.min(1, t * 55) * (1 - q) ** 1.5;
        v = (sin(phase + sin(phase * 2.007) * 2) * .3 + low * 1.3 + high * .1) * swell;
      }
    } else if (['warning', 'boss-arrival', 'boss-phase'].includes(id)) {
      const f = id === 'warning' ? 570 : 73.42;
      const pulse = .5 + .5 * sin(TAU * t * (id === 'warning' ? 6 : 2));
      v = (sin(TAU * f * t) * .5 + sin(TAU * f * 1.498 * t) * .25 + sin(TAU * f * 2.01 * t) * .18)
        * Math.min(1, t * 30) * (1 - q) ** 1.5 * (.5 + .5 * pulse);
    }
    // Anti-click edges are part of each sample, including percussion.
    samples[i] = v * Math.min(1, t / .0015) * Math.min(1, (duration - t) / .025);
  }
  let dc = 0; for (const value of samples) dc += value; dc /= count;
  let peak = 0;
  for (let i = 0; i < count; i++) {
    samples[i] -= dc * Math.min(1, i / 48, (count - i - 1) / 48);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const scale = .85 / Math.max(.85, peak);
  for (let i = 0; i < count; i++) samples[i] *= scale;
  return samples;
}
