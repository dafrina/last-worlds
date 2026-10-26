import { SPECIALS } from '../content/equipment';

/** Original, deterministic sound sources. No downloads, runtime oscillators or gameplay RNG. */
export const SAMPLE_RATE = 32_000;
export type Sound =
  | 'pulse' | 'fan' | 'seeker' | 'enemy' | 'impact' | 'explosion' | 'heavy'
  | 'shield' | 'shield-break' | 'life' | 'pickup' | 'upgrade' | 'ready'
  | 'shockwave' | 'seeker-rack' | 'siege-lance' | 'warning' | 'beam'
  | 'boss-arrival' | 'boss-phase' | 'boss-death' | 'warp' | 'win' | 'loss';
export type Instrument = 'kick' | 'snare' | 'hat' | 'metal' | 'bass' | 'keys' | 'glass' | 'pad'
  | 'bloom-pad' | 'saw-bass' | 'saw-lead' | 'piano' | 'round-bass' | 'brush'
  | 'breath-pad' | 'nerve' | 'bio-bass' | 'heart' | 'bone' | 'void-air' | 'needle' | 'void-bass' | 'void-tick';
export type SampleId = Sound | Instrument;
const TAU = Math.PI * 2;
const sin = Math.sin;
const exp = Math.exp;
const durations: Record<SampleId, number> = {
  pulse: .18, fan: .24, seeker: .34, enemy: .2, impact: .13, explosion: .85, heavy: 1.6,
  shield: .48, 'shield-break': .95, life: 1.6, pickup: .28, upgrade: .78, ready: .65,
  shockwave: 1.65, 'seeker-rack': .8, 'siege-lance': SPECIALS['siege-lance'].duration, warning: .65, beam: .85,
  'boss-arrival': 2.8, 'boss-phase': 1.1, 'boss-death': 3.6, warp: 3.1, win: 2.1, loss: 2.1,
  kick: .42, snare: .24, hat: .09, metal: .33, bass: .48, keys: 2.4, glass: 3.1, pad: 7.5,
  'bloom-pad': 8.5, 'saw-bass': .65, 'saw-lead': 1.1, piano: 2.8, 'round-bass': .65, brush: .22,
  'breath-pad': 4.4, nerve: 1.15, 'bio-bass': .65, heart: .32, bone: .16,
  'void-air': 3.2, needle: 2.2, 'void-bass': .75, 'void-tick': .12,
};
export const SAMPLE_IDS = Object.keys(durations) as SampleId[];
export const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Small xorshift stream, private to audio. Identical previews across builds. */
export function noiseSource(seed: number) {
  let state = seed || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2147483648 - 1; };
}

export function synthesize(id: SampleId, rate = SAMPLE_RATE): Float32Array {
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
    } else if (['shockwave', 'seeker-rack', 'siege-lance', 'beam', 'warp'].includes(id)) {
      if (id === 'seeker-rack') {
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
    } else if (id === 'kick') {
      phase += TAU * (48 + 112 * exp(-t * 43)) / rate;
      v = sin(phase) * exp(-t * 12) + high * exp(-t * 300) * .2;
    } else if (id === 'snare') {
      v = high * exp(-t * 23) * .7 + low * exp(-t * 33) + sin(TAU * 186 * t) * exp(-t * 36) * .45;
    } else if (id === 'hat') {
      v = (high * .6 + sin(TAU * 6731 * t) * sin(TAU * 4347 * t) * .15) * exp(-t * 68);
    } else if (id === 'metal') {
      v = (sin(TAU * 643 * t) * .5 + sin(TAU * 1039 * t) * .3 + sin(TAU * 1769 * t) * .2 + high * .15) * exp(-t * 18);
    } else if (id === 'brush') {
      // A soft, dry brushed backbeat for the human score, without the electronic snare's pitch.
      v = high * .24 * exp(-t * 25) + low * .75 * exp(-t * 33);
    } else if (id === 'saw-bass' || id === 'saw-lead') {
      const bass = id === 'saw-bass', f = midi(bass ? 36 : 60), p = TAU * f * t;
      const cutoff = (bass ? 2.2 : 3.4) + (bass ? 9 : 6) * exp(-t * (bass ? 15 : 7));
      let saw = 0;
      // Finite additive saws avoid discontinuous-wave aliasing; the harmonic ceiling survives transposition.
      for (let h = 1; h <= (bass ? 14 : 8); h++) {
        const rolloff = exp(-h / cutoff) / h;
        saw += (sin(p * h) + sin(p * h * 1.004 + .23) * .42) * rolloff;
      }
      const body = bass ? sin(p * .5) * .43 + sin(p) * .25 : sin(p * .998) * .12;
      v = (Math.tanh(saw * 1.5) * .6 + body) * exp(-t * (bass ? 5.5 : 4.3));
    } else if (id === 'round-bass') {
      const p = TAU * midi(36) * t;
      v = (sin(p) + sin(p * 2) * .18 * exp(-t * 16) + sin(p * 3.002) * .06 * exp(-t * 25)) * exp(-t * 5.6);
    } else if (id === 'piano') {
      const f = midi(60), p = TAU * f * t;
      // Hammer transient and slightly inharmonic string partials: warm felt-piano character.
      for (let h = 1; h <= 8; h++) {
        const partial = p * h * Math.sqrt(1 + .00016 * h * h);
        const amplitude = h === 1 ? .65 : .46 / h ** 1.35;
        v += (sin(partial) + .22 * sin(partial * 1.0018)) * amplitude * exp(-t * (1.65 + h * .63));
      }
      v += low * exp(-t * 110) * .35;
    } else if (id === 'bloom-pad') {
      const p = TAU * midi(48) * t;
      const bloom = Math.min(1, t / 1.1) ** 1.4 * Math.min(1, (duration - t) / 3.6);
      const breathe = .84 + .16 * sin(TAU * .19 * t - .7);
      v = (sin(p + .25 * sin(TAU * .12 * t)) * .6 + sin(p * 1.003) * .32
        + sin(p * .996) * .28 + sin(p * 2.001) * .11 * (.65 + .35 * sin(TAU * .23 * t))
        + sin(p * 3.002) * .035 + slow * .06) * bloom * breathe;
    } else if (id === 'breath-pad') {
      // Formant-like harmonic clusters slowly open and close: an inhaling, almost vocal membrane, not Nacre's pad.
      const p = TAU * midi(48) * t, breath = sin(Math.PI * q) ** 1.4;
      const throat = 3.6 + 1.8 * sin(Math.PI * q), flutter = .035 * sin(TAU * 5.3 * t);
      for (let h = 1; h <= 9; h++) {
        const formant = exp(-(((h - throat) / 1.5) ** 2));
        v += sin(p * h + flutter * h) * (.10 / h + .20 * formant / Math.sqrt(h));
      }
      v = (v + sin(p * .997) * .10 + low * .28 * (.5 + .5 * sin(TAU * .71 * t))) * breath;
    } else if (id === 'nerve') {
      const p = TAU * midi(60) * t;
      const envelope = Math.min(1, t * 28) * exp(-t * 4);
      v = (sin(p + sin(p * 1.013) * (1.2 + .3 * sin(TAU * 7 * t))) * .45
        + sin(p * 2.012) * .16 + low * .18) * envelope;
    } else if (id === 'bio-bass') {
      const p = TAU * midi(36) * t;
      v = (sin(p + .55 * sin(p * 2) * exp(-t * 10)) * .7
        + sin(p * 3) * .15 * exp(-t * 8) + low * .18 * exp(-t * 25)) * exp(-t * 5.8);
    } else if (id === 'heart') {
      phase += TAU * (52 + 38 * exp(-t * 36)) / rate;
      v = (sin(phase) * .8 + low * .34 + sin(phase * 2) * .16) * exp(-t * 18);
    } else if (id === 'bone') {
      v = (sin(TAU * 790 * t) * .55 + sin(TAU * 1391 * t) * .23 + high * .25) * exp(-t * 52);
    } else if (id === 'void-air') {
      const p = TAU * midi(48) * t, envelope = sin(Math.PI * q) ** 1.8;
      // Stable, almost pure intervals and a tiny breath of air; no detuned chorus or horror wobble.
      v = (sin(p) * .5 + sin(p * 2) * .18 + sin(p * 4) * .035 + slow * .025) * envelope;
    } else if (id === 'needle') {
      const p = TAU * midi(60) * t;
      // Crisp struck-glass edge followed by a very clean sine tail, distinct from Vesper's chiming FM bell.
      v = sin(p) * exp(-t * 2.7) * .65 + sin(p * 4.17) * exp(-t * 31) * .25
        + sin(p * 6.31) * exp(-t * 55) * .1;
    } else if (id === 'void-bass') {
      const p = TAU * midi(36) * t;
      v = (sin(p) * .8 + sin(p * 2) * .19 * exp(-t * 5)) * Math.min(1, t * 160) * exp(-t * 5);
    } else if (id === 'void-tick') {
      v = (sin(TAU * 2200 * t) * .65 + high * .17) * exp(-t * 100);
    } else if (id === 'bass') {
      const f = midi(36), p = TAU * f * t, filter = exp(-t * 14);
      v = (sin(p) + sin(p * 2) * .32 + sin(p * 3) * .23 * filter + sin(p * 5) * .12 * filter) * exp(-t * 6);
    } else if (id === 'keys' || id === 'glass') {
      const f = midi(60), p = TAU * f * t, glass = id === 'glass';
      v = sin(p + sin(p * (glass ? 3.004 : 2)) * (glass ? 1.7 : .8) * exp(-t * 3))
        * exp(-t * (glass ? 2 : 3)) * .6;
      v += sin(p * 1.003) * exp(-t * 4) * .18;
    } else if (id === 'pad') {
      const f = midi(48), p = TAU * f * t;
      const envelope = Math.min(1, t / .65) * Math.min(1, (duration - t) / 2.8);
      v = (sin(p + sin(TAU * .17 * t) * .4) + sin(p * 1.004) * .6 + sin(p * .997) * .5
        + sin(p * 2.002) * .23 + sin(p * 3) * .08 + slow * .1) * envelope * .32;
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
