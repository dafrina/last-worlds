import { cents, drive, finish, midi, OnePole, Pulse, Rotor, Saw, seedOf, Svf, TAU, Unison, noiseSource } from './dsp';

/**
 * Music instrument patches (10 November revision): band-limited analogue-style oscillators, moving filters, unison,
 * saturation and modal partials replace the earlier sine/FM tones, for a darker, cinematic electronic sound.
 * Every patch is one cached mono sample at 32 kHz, pitched by playback rate from its base note, exactly as before.
 *
 * Level patches keep their names, lengths, base notes and the loudness of the patch they replace (`rms` over `window`,
 * measured on the 20 October samples), so the authored scores keep their balance. Boss patches play only in the boss stem.
 */
export type LevelInstrument = 'kick' | 'snare' | 'hat' | 'metal' | 'bass' | 'glass' | 'pad'
  | 'bloom-pad' | 'saw-bass' | 'saw-lead' | 'piano' | 'round-bass' | 'brush'
  | 'breath-pad' | 'nerve' | 'bio-bass' | 'heart' | 'bone' | 'void-bass' | 'void-tick'
  | CoronaInstrument | UmbraInstrument;
/** Corona's own voices (its score was recomposed on 10 November; see score.ts). */
export type CoronaInstrument = 'harp' | 'harp-high' | 'solar' | 'bowed' | 'ember';
/** Umbra's reversed and inharmonic voices (its score was recomposed on 10 November; see score.ts). */
export type UmbraInstrument = 'inhale' | 'glint' | 'obsidian';
export type BossInstrument = 'boom' | 'riser' | 'crash' | 'braam' | 'stab' | 'tom' | 'clap' | 'drive-bass' | 'growl' | 'arp' | 'strings';
export type Instrument = LevelInstrument | BossInstrument;

interface Patch {
  /** Sample length in seconds and the note it sounds at playback rate 1. */
  seconds: number; base: number;
  /** Target RMS over the first `window` seconds; `limit` reaches it through a soft knee (see dsp.ts finish). */
  rms: number; window: number; limit?: boolean;
  render(out: Float32Array, rate: number, noise: () => number): void;
}

/** Exponential decay kept as a running product: one multiply per sample instead of Math.exp. */
const decay = (perSecond: number, rate: number) => Math.exp(-perSecond / rate);
const each = (out: Float32Array, rate: number, sample: (t: number, i: number) => number) => {
  for (let i = 0; i < out.length; i++) out[i] = sample(i / rate, i);
};

/**
 * Karplus–Strong string, added into `out`: a burst of noise circulating in a tuned, slightly lossy delay line (two-point
 * average plus an allpass for the fractional period). `ring` is the fundamental's 60 dB decay in seconds, `tone` the
 * pluck's softness (a low-pass on the burst), and `position` notches the harmonics a pluck at that point would miss.
 */
function pluck(out: Float32Array, rate: number, noise: () => number, hz: number, ring: number, tone: number, gain: number, position = .18) {
  const period = rate / hz, n = Math.floor(period - .5), d = period - n - .5, c = (1 - d) / (1 + d);
  const burst = new Float32Array(n), line = new Float32Array(n), soft = new OnePole(tone, rate), notch = Math.max(1, Math.round(n * position));
  for (let i = 0; i < n; i++) burst[i] = soft.run(noise());
  let mean = 0;
  for (let i = 0; i < n; i++) { line[i] = burst[i] - burst[(i + n - notch) % n] * .7; mean += line[i]; }
  for (let i = 0; i < n; i++) line[i] -= mean / n;
  const loss = Math.pow(.001, 1 / (ring * hz));
  let index = 0, last = 0, allIn = 0, allOut = 0;
  for (let i = 0; i < out.length; i++) {
    const current = line[index], averaged = loss * .5 * (current + last);
    last = current;
    allOut = c * averaged + allIn - c * allOut; allIn = averaged;
    line[index] = allOut; index = index + 1 === n ? 0 : index + 1;
    out[i] += current * gain;
  }
}

/** Corona's harp: two plucked strings a few cents apart (a slow, uneasy beating) in a dark resonant body, with a
 * decaying fundamental for weight and light saturation so the low register still reads on a phone speaker. */
function harp(out: Float32Array, rate: number, noise: () => number, note: number, ring: number, tone: number, body: [number, number]) {
  const f = midi(note);
  pluck(out, rate, noise, f * cents(-3), ring, tone, .6);
  pluck(out, rate, noise, f * cents(3.5), ring * .85, tone * .7, .5, .23);
  const low = new Svf(rate, body[0], 3), box = new Svf(rate, body[1], 2.5), sub = new Rotor(f, rate);
  each(out, rate, (t, i) => {
    const v = out[i]; low.run(v); box.run(v);
    return drive(v + low.band * .5 + box.band * .3 + sub.next() * .25 * Math.exp(-t * 3), 1.4);
  });
}

const CORONA: Record<CoronaInstrument, Patch> = {
  // The low ostinato harp, C3: long, dark ring.
  harp: { seconds: 1.4, base: 48, rms: .25, window: .4, limit: true, render(out, rate, noise) { harp(out, rate, noise, 48, 1.5, 2600, [190, 430]); } },
  // The lament's harp, C4: a little brighter and longer, for the melody.
  'harp-high': { seconds: 1.8, base: 60, rms: .27, window: .4, limit: true, render(out, rate, noise) { harp(out, rate, noise, 60, 2, 3400, [300, 720]); } },
  // The solar drone: a unison saw stack whose filter swells open and closed like heat, a faint shimmer at the peaks,
  // a band of plasma roar and a sine sub.
  solar: { seconds: 5.4, base: 36, rms: .2, window: 5.4, render(out, rate, noise) {
    const f = midi(36), stack = new Unison(rate, 5, 14, 103), sub = new Rotor(f, rate), filter = new Svf(rate, 300, 1.2), roar = new Svf(rate, 520, .8);
    each(out, rate, (t, i) => {
      const swell = .25 + .75 * (.5 - .5 * Math.cos(TAU * t / 3));
      if (i % 32 === 0) filter.set(170 + 950 * swell * (.85 + .15 * Math.sin(TAU * .7 * t)), 1.2);
      roar.run(noise());
      const tone = filter.run(stack.next(f)) * (1 + .06 * Math.sin(TAU * 6.3 * t) * swell) + sub.next() * .35 + roar.band * .18 * swell;
      return drive(tone, 1.3) * Math.min(1, t / 1.4) * Math.min(1, (5.4 - t) / 1.8);
    });
  } },
  // Bowed metal: inharmonic plate partials, each beating against a copy 7 cents away, the higher ones blooming later
  // as the bow digs in, over a thread of bow hiss.
  bowed: { seconds: 2.6, base: 60, rms: .12, window: 2.6, render(out, rate, noise) {
    const f = midi(60), ratios = [1, 1.47, 2.09, 2.56, 3.42, 4.17, 5.21];
    const rotors = ratios.map((r, k) => new Rotor(f * r, rate, k * 1.3)), beats = ratios.map((r, k) => new Rotor(f * r * cents(7), rate, k));
    const hiss = new Svf(rate, 3000, 1.5);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < ratios.length; k++) v += (rotors[k].next() + beats[k].next() * .6) * Math.min(1, t / (.25 + k * .18)) / (1 + k * .5);
      hiss.run(noise());
      return (v * .25 + hiss.band * .2) * Math.min(1, t / .5) * Math.min(1, (2.6 - t) / 1.2);
    });
  } },
  // Ember crackle in place of a hi-hat: a few seeded sparks and a short hiss.
  ember: { seconds: .14, base: 60, rms: .06, window: .14, render(out, rate, noise) {
    const crack = new Svf(rate, 4800, 1.4), sparks = noiseSource(331);
    const starts = [0, .011, .034, .07].map((s, k) => s + (k ? .012 * (.5 + .5 * sparks()) : 0));
    each(out, rate, t => {
      let envelope = Math.exp(-t * 40) * .25;
      starts.forEach((start, k) => { if (t >= start) envelope += Math.exp(-(t - start) * 900) * (1 - k * .2); });
      crack.run(noise());
      return (crack.band + crack.high * .3) * envelope;
    });
  } },
};

/**
 * Umbra's voices. "Reversed" is synthesized, never a reversed recording: envelopes that grow toward the end and stop,
 * filters that open as the sound arrives, and smeared noise that thickens like a reverb tail running backwards.
 * "Alien" is the partials: non-integer ratios, each beating against a detuned twin.
 */
const UMBRA: Record<UmbraInstrument, Patch> = {
  // An inhaled pad: unison saws and an inharmonic 2.41 partial swell in under an opening filter, with backward air,
  // then cut at the very end, which the score lands on a bar line.
  inhale: { seconds: 2.4, base: 48, rms: .2, window: 2.4, render(out, rate, noise) {
    const f = midi(48), stack = new Unison(rate, 4, 18, 107), alien = new Rotor(f * 2.41, rate), twin = new Rotor(f * 2.41 * cents(9), rate, 1);
    const filter = new Svf(rate, 300, 1.4), air = new Svf(rate, 2200, .7);
    each(out, rate, (t, i) => {
      const q = t / 2.4, swell = q ** 2.6;
      if (i % 32 === 0) filter.set(220 + 2600 * q ** 2, 1.4);
      air.run(noise());
      return drive(filter.run(stack.next(f)) + (alien.next() + twin.next()) * .22 * q + air.band * .35 * q ** 3, 1.2) * swell;
    });
  } },
  // A struck bell run backwards: bell partials (1, 2.76, 5.4, 8.93) that grow toward the end, smeared by a rising hiss,
  // then cut; the score ends it on the note's own sixteenth.
  glint: { seconds: 1.2, base: 60, rms: .16, window: 1.2, render(out, rate, noise) {
    const f = midi(60), ratios = [1, 2.76, 5.4, 8.93], rotors = ratios.map((r, k) => new Rotor(f * r, rate, k)), twins = ratios.map((r, k) => new Rotor(f * r * cents(-6), rate, k + 2));
    const smear = new Svf(rate, 3000, .8), smooth = new OnePole(7000, rate);
    each(out, rate, t => {
      const left = 1.2 - t;
      let v = 0;
      for (let k = 0; k < 4; k++) v += (rotors[k].next() + twins[k].next() * .5) * Math.exp(-left * (2.2 + k * 2.6)) / (1 + k);
      smear.run(noise());
      return smooth.run(v * .5 + smear.band * .12 * Math.exp(-left * 2.5));
    });
  } },
  // Struck obsidian: a dark ring-modulated tone, partials at 1, 2.12, 3.47, 4.73 and 6.18 with beating twins, the
  // higher ones gone first; the forward answer to the reversed voices.
  obsidian: { seconds: 2.6, base: 60, rms: .2, window: .5, render(out, rate, noise) {
    const f = midi(60), ratios = [1, 2.12, 3.47, 4.73, 6.18];
    const rotors = ratios.map((r, k) => new Rotor(f * r, rate, k * .7)), twins = ratios.map((r, k) => new Rotor(f * r * cents(4 + k * 3), rate, k));
    const strike = new Svf(rate, 1800, 1.2), ring = new Rotor(f * 1.414, rate);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < ratios.length; k++) v += (rotors[k].next() + twins[k].next() * .7) * Math.exp(-t * (1.3 + k * 1.9)) / (1 + k * .6);
      strike.run(noise());
      return drive(v * .3 * (1 + .35 * ring.next()) + strike.band * Math.exp(-t * 80) * .3, 1.3) * Math.min(1, t / .002);
    });
  } },
};

const LEVEL: Record<Exclude<LevelInstrument, CoronaInstrument | UmbraInstrument>, Patch> = {
  // Punchy electronic kick: a fast pitch drop, a short beater click and saturation that puts its knock in the midrange.
  kick: { seconds: .42, base: 36, rms: .183, window: .4, render(out, rate, noise) {
    const click = new Svf(rate, 3800, .9); let phase = 0;
    each(out, rate, t => {
      phase += TAU * (45 + 118 * Math.exp(-t * 30) + 70 * Math.exp(-t * 160)) / rate;
      const body = Math.sin(phase) * Math.exp(-t * 7.5) * (t < .025 ? 1 : Math.exp(-(t - .025) * 4));
      click.run(noise());
      return drive(body * 1.1, 1.8) + click.band * Math.exp(-t * 280) * .45 + Math.sin(TAU * 1650 * t) * Math.exp(-t * 420) * .12;
    });
  } },
  // Two tuned shell modes and a band-passed rattle, softly saturated; the top is rolled off above 9 kHz.
  snare: { seconds: .24, base: 60, rms: .118, window: .24, render(out, rate, noise) {
    const band = new Svf(rate, 2400, .7), air = new OnePole(9000, rate); let phase = 0;
    each(out, rate, t => {
      phase += TAU * (176 + 70 * Math.exp(-t * 45)) / rate;
      band.run(noise());
      const shell = Math.sin(phase) * Math.exp(-t * 30) * .75 + Math.sin(TAU * 331 * t + .4) * Math.exp(-t * 48) * .3;
      const rattle = (band.band * 1.1 + band.high * .35) * (Math.exp(-t * 16) * .9 + Math.exp(-t * 90) * .5);
      return air.run(drive(shell + rattle, 1.5));
    });
  } },
  // Six detuned square partials (the classic metallic hat recipe) and noise, band-passed around 8 kHz; no harsh top.
  hat: { seconds: .09, base: 60, rms: .088, window: .09, render(out, rate, noise) {
    const ratios = [1, 1.4471, 1.617, 1.9265, 2.5028, 2.6637];
    const metal = ratios.map((_, k) => new Pulse(rate, .5, k * .13));
    const band = new Svf(rate, 8200, 1.1), smooth = new OnePole(11500, rate);
    each(out, rate, t => {
      let m = 0;
      for (let k = 0; k < 6; k++) m += metal[k].next(330 * ratios[k]);
      band.run(m * .16 + noise() * .55);
      return smooth.run(band.band + band.high * .35) * Math.min(1, t / .0004) * Math.exp(-t * 58);
    });
  } },
  // Struck foundry metal: inharmonic plate modes with their own decays and a band-passed strike.
  metal: { seconds: .33, base: 60, rms: .103, window: .33, render(out, rate, noise) {
    const modes = [[643, 14, .5], [1039, 18, .34], [1769, 24, .24], [2417, 33, .14], [3158, 46, .09]];
    const rotors = modes.map(([hz], k) => new Rotor(hz, rate, k)), hit = new Svf(rate, 2100, 1.4);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < modes.length; k++) v += rotors[k].next() * modes[k][2] * Math.exp(-t * modes[k][1]);
      hit.run(noise());
      return drive(v + hit.band * Math.exp(-t * 70) * .5, 1.4);
    });
  } },
  // A soft brushed backbeat: a band-passed swish with a slower onset over a dull low body.
  brush: { seconds: .22, base: 60, rms: .05, window: .22, render(out, rate, noise) {
    const swish = new Svf(rate, 3000, .55), body = new OnePole(650, rate);
    each(out, rate, t => {
      const n = noise(); swish.run(n);
      return swish.band * .5 * Math.min(1, t / .005) * Math.exp(-t * 22) + body.run(n) * 1.6 * Math.exp(-t * 32);
    });
  } },
  // Vesper/Corona bass: two detuned saws through a closing resonant low-pass over a sine sub, saturated for phones.
  bass: { seconds: .48, base: 36, rms: .27, window: .4, limit: true, render(out, rate) {
    const f = midi(36), saws = new Unison(rate, 2, 14, 11), sub = new Rotor(f, rate), filter = new Svf(rate, 1000, .95);
    each(out, rate, (t, i) => {
      if (i % 16 === 0) filter.set(190 + 2100 * Math.exp(-t * 13), .95);
      return drive(filter.run(saws.next(f)) * .8 + sub.next() * .7, 1.6) * Math.min(1, t / .002) * Math.exp(-t * 5.4);
    });
  } },
  // Rounded plucked bass (Luna, Nacre): a sine body, a gently filtered saw edge and a little second harmonic.
  'round-bass': { seconds: .65, base: 36, rms: .285, window: .4, render(out, rate) {
    const f = midi(36), saw = new Saw(rate), sub = new Rotor(f, rate), second = new Rotor(2 * f, rate, .3), filter = new Svf(rate, 400, .7);
    each(out, rate, (t, i) => {
      if (i % 16 === 0) filter.set(150 + 750 * Math.exp(-t * 16), .7);
      const tone = sub.next() + filter.run(saw.next(f)) * .45 + second.next() * .1 * Math.exp(-t * 6);
      return drive(tone, 1.25) * Math.min(1, t / .003) * Math.exp(-t * 5.3);
    });
  } },
  // Khepri's heavy foundry bass: three unison saws, a biting resonant filter and a sub-octave, driven hard.
  'saw-bass': { seconds: .65, base: 36, rms: .265, window: .4, render(out, rate) {
    const f = midi(36), stack = new Unison(rate, 3, 18, 23), sub = new Rotor(f / 2, rate), body = new Rotor(f, rate, 1);
    const filter = new Svf(rate, 1000, 1.25);
    each(out, rate, (t, i) => {
      if (i % 16 === 0) filter.set(230 + 2900 * Math.exp(-t * 11), 1.25);
      const tone = filter.run(stack.next(f)) + sub.next() * .42 + body.next() * .25;
      return drive(tone, 2.3) * Math.min(1, t / .002) * Math.exp(-t * 5.5);
    });
  } },
  // Gritty unison saw lead with a falling filter and a delayed vibrato; the very top is smoothed off.
  'saw-lead': { seconds: 1.1, base: 60, rms: .274, window: .4, render(out, rate) {
    const f = midi(60), stack = new Unison(rate, 5, 22, 37), filter = new Svf(rate, 2000, 1.05), smooth = new OnePole(4200, rate);
    each(out, rate, (t, i) => {
      const vibrato = 1 + .0045 * Math.sin(TAU * 5.3 * t) * Math.min(1, Math.max(0, (t - .16) / .3));
      // The lead is played up to two and a half times faster than this sample, so its filter stays low.
      if (i % 16 === 0) filter.set(850 + 1900 * Math.exp(-t * 7), 1.05);
      return smooth.run(drive(filter.run(stack.next(f * vibrato)), 1.5)) * Math.min(1, t / .005) * Math.exp(-t * 3.9);
    });
  } },
  // Felt piano: paired, slightly detuned strings per partial (gentle beating), stretched partials, a two-stage decay
  // (prompt sound, then aftersound) and a felt hammer; brightness falls with partial number.
  piano: { seconds: 2.8, base: 60, rms: .383, window: .4, limit: true, render(out, rate, noise) {
    const f = midi(60), hammer = new Svf(rate, 1400, .8), board = new OnePole(5200, rate);
    const strings: { rotor: Rotor; amplitude: number; fast: number; slow: number }[] = [];
    for (let h = 1; h <= 10; h++) {
      const stretch = Math.sqrt(1 + .00016 * h * h), amplitude = (h === 1 ? .62 : .48 / h ** 1.3) * Math.exp(-(h - 1) * .12);
      for (const side of [-1, 1]) strings.push({ rotor: new Rotor(f * h * stretch * cents(side * .9), rate, h * .7 + side),
        amplitude: amplitude / 2, fast: decay(2.1 + h * .75, rate), slow: decay(.55 + h * .3, rate) });
    }
    const fast = strings.map(() => .68), slow = strings.map(() => .32);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < strings.length; k++) {
        const s = strings[k];
        v += s.rotor.next() * s.amplitude * (fast[k] + slow[k]);
        fast[k] *= s.fast; slow[k] *= s.slow;
      }
      hammer.run(noise());
      return board.run(v + hammer.band * Math.exp(-t * 90) * .22);
    });
  } },
  // Vesper's glass (also Corona's lead): a soft inharmonic shimmer fading into a warm 2:1 body, doubled 4 cents apart,
  // with a felt mallet; far less upper FM energy than the earlier bell.
  glass: { seconds: 3.1, base: 60, rms: .334, window: .4, render(out, rate, noise) {
    const f = midi(60), mallet = new Svf(rate, 2500, 1), smooth = new OnePole(6500, rate);
    let c1 = 0, c2 = 0, m1 = 0, m2 = 0;
    const d = TAU * f / rate, detune = cents(4);
    each(out, rate, t => {
      c1 += d; c2 += d * detune; m1 += d * 3.5; m2 += d * 2.002;
      const shimmer = Math.sin(c1 + 1.1 * Math.exp(-t * 3.2) * Math.sin(m1)) * .5;
      const body = Math.sin(c2 + .55 * Math.exp(-t * 1.4) * Math.sin(m2)) * .38;
      mallet.run(noise());
      return smooth.run((shimmer + body) * Math.min(1, t / .003) * Math.exp(-t * 1.95) + mallet.band * Math.exp(-t * 160) * .06);
    });
  } },
  // Warm analogue pad: six drifting unison saws through a slowly breathing low-pass, a sine sub and faint air.
  // Its stereo depth comes from the mixer's ensemble send.
  pad: { seconds: 7.5, base: 48, rms: .22, window: 7.5, render(out, rate, noise) {
    const f = midi(48), stack = new Unison(rate, 6, 16, 41), filter = new Svf(rate, 900, .85), air = new Svf(rate, 3200, .6), sub = new Rotor(f, rate);
    each(out, rate, (t, i) => {
      if (i % 32 === 0) filter.set(560 + 380 * (.5 + .5 * Math.sin(TAU * .11 * t - 1.2)) + 260 * Math.min(1, t / 1.6), .85);
      const tone = filter.run(stack.next(f, .85 + .15 * Math.sin(TAU * .07 * t))) + sub.next() * .28;
      air.run(noise());
      const envelope = Math.min(1, t / .65) * Math.min(1, (7.5 - t) / 2.8);
      return (drive(tone, 1.15) + air.band * .03 * (.6 + .4 * Math.sin(TAU * .17 * t))) * envelope;
    });
  } },
  // Nacre's slow bloom: soft detuned sine voices with a gentle pitch drift, a saw layer whose filter opens with the swell,
  // and the original breathing.
  'bloom-pad': { seconds: 8.5, base: 48, rms: .26, window: 8.5, render(out, rate, noise) {
    const f = midi(48), saws = new Unison(rate, 2, 10, 43), filter = new Svf(rate, 300, .7), air = new OnePole(2400, rate);
    const detunes = [cents(-6), cents(-2), cents(3), cents(7)], phases = [0, 1.3, 2.1, 4.4];
    each(out, rate, (t, i) => {
      const bloom = Math.min(1, t / 1.1) ** 1.4 * Math.min(1, (8.5 - t) / 3.6);
      if (i % 32 === 0) filter.set(300 + 1100 * bloom * (.8 + .2 * Math.sin(TAU * .13 * t)), .7);
      const drift = TAU * f * (1 + .0012 * Math.sin(TAU * .12 * t)) / rate;
      let soft = 0;
      for (let k = 0; k < 4; k++) { phases[k] += drift * detunes[k]; soft += Math.sin(phases[k]) + Math.sin(phases[k] * 2) * .09; }
      const breathe = .84 + .16 * Math.sin(TAU * .19 * t - .7), n = noise();
      // Gentle saturation rounds the peaks where the detuned voices align, as an analogue pad would.
      return (drive((soft * .28 + filter.run(saws.next(f)) * .22) * .75, 1.35) + (n - air.run(n)) * .012) * bloom * breathe;
    });
  } },
  // Amnion's membrane: unison saws and breath noise through two moving formant filters, an inhaling vocal colour.
  'breath-pad': { seconds: 4.4, base: 48, rms: .108, window: 4.4, render(out, rate, noise) {
    const f = midi(48), stack = new Unison(rate, 3, 12, 53), f1 = new Svf(rate, 500, 3.5), f2 = new Svf(rate, 1100, 4.5), body = new Rotor(f * cents(-3), rate);
    each(out, rate, (t, i) => {
      const q = t / 4.4, breath = Math.sin(Math.PI * q) ** 1.4;
      if (i % 32 === 0) { f1.set(380 + 260 * Math.sin(Math.PI * q), 3.5); f2.set(950 + 380 * (.5 + .5 * Math.sin(TAU * .31 * t)), 4.5); }
      const source = stack.next(f * (1 + .0012 * Math.sin(TAU * 5.3 * t))) * .7 + noise() * .22 * (.5 + .5 * Math.sin(TAU * .71 * t));
      f1.run(source); f2.run(source);
      return drive((f1.band * .9 + f2.band * .6 + body.next() * .12) * 1.6, 1.3) * breath;
    });
  } },
  // Uneasy nerve tone: beating FM operators with a slow pitch wobble and a nasal band-passed saw.
  nerve: { seconds: 1.15, base: 60, rms: .195, window: .4, render(out, rate) {
    const f = midi(60), saw = new Saw(rate), nasal = new Svf(rate, 1500, 2); let p = 0;
    each(out, rate, t => {
      const wobble = 1 + .0035 * Math.sin(TAU * 5.7 * t + 1);
      p += TAU * f * wobble / rate;
      const fm = Math.sin(p + Math.sin(p * 1.013) * (1.1 + .3 * Math.sin(TAU * 7 * t))) * .45 + Math.sin(p * 2.012) * .14;
      nasal.run(saw.next(f * wobble * 1.003));
      return (fm + nasal.band * .3) * Math.min(1, t * 28) * Math.exp(-t * 4);
    });
  } },
  // Organic bass: a growling self-modulated sine with gristle, saturated and smoothed.
  'bio-bass': { seconds: .65, base: 36, rms: .265, window: .4, render(out, rate, noise) {
    const f = midi(36), low = new OnePole(320, rate), smooth = new OnePole(1400, rate); let p = 0;
    each(out, rate, t => {
      p += TAU * f / rate;
      const v = Math.sin(p + .6 * Math.sin(2 * p) * Math.exp(-t * 10)) * .75 + Math.sin(3 * p) * .15 * Math.exp(-t * 8) + low.run(noise()) * .5 * Math.exp(-t * 25);
      return smooth.run(drive(v, 1.5)) * Math.min(1, t / .002) * Math.exp(-t * 5.8);
    });
  } },
  // Heartbeat: a deep, soft pitch-dropping thump with a wet low squish.
  heart: { seconds: .32, base: 36, rms: .17, window: .32, render(out, rate, noise) {
    const squish = new OnePole(300, rate); let phase = 0;
    each(out, rate, t => {
      phase += TAU * (50 + 42 * Math.exp(-t * 36)) / rate;
      return drive(Math.sin(phase) * .9 + squish.run(noise()) * 1.4 * Math.exp(-t * 30), 1.6) * Math.min(1, t / .002) * Math.exp(-t * 17);
    });
  } },
  // Dry bone click: three short woody modes and a band-passed tick.
  bone: { seconds: .16, base: 60, rms: .103, window: .16, render(out, rate, noise) {
    const modes = [[790, 52, .5], [1391, 68, .26], [2212, 95, .14]], rotors = modes.map(([hz], k) => new Rotor(hz, rate, k * 2)), click = new Svf(rate, 2600, 1.2);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < 3; k++) v += rotors[k].next() * modes[k][2] * Math.exp(-t * modes[k][1]);
      click.run(noise());
      return drive(v + click.band * Math.exp(-t * 150) * .35, 1.3);
    });
  } },
  // Controlled deep pulse: a clean sine with second and third harmonics, lightly saturated so phones hear it.
  'void-bass': { seconds: .75, base: 36, rms: .28, window: .4, render(out, rate) {
    const f = midi(36), r1 = new Rotor(f, rate), r2 = new Rotor(2 * f, rate), r3 = new Rotor(3 * f, rate, .7);
    each(out, rate, t => drive(r1.next() * .8 + r2.next() * .19 * Math.exp(-t * 5) + r3.next() * .05 * Math.exp(-t * 7), 1.25)
      * Math.min(1, t * 160) * Math.exp(-t * 5));
  } },
  // Precise tick: a short FM blip and a band-passed sliver of noise.
  'void-tick': { seconds: .12, base: 60, rms: .086, window: .12, render(out, rate, noise) {
    const air = new Svf(rate, 5200, 1.2);
    each(out, rate, t => {
      air.run(noise());
      return Math.sin(TAU * 2200 * t + .35 * Math.sin(TAU * 3300 * t) * Math.exp(-t * 60)) * Math.exp(-t * 105) * .62 + air.band * Math.exp(-t * 160) * .16;
    });
  } },
};

const BOSS: Record<BossInstrument, Patch> = {
  // Cinematic impact: a sub drop, a dense low punch and a short crack.
  boom: { seconds: 2, base: 36, rms: .2, window: .5, render(out, rate, noise) {
    const f = midi(36), punch = new OnePole(420, rate), crack = new Svf(rate, 1900, .8); let phase = 0;
    each(out, rate, t => {
      phase += TAU * f * (1 + 1.25 * Math.exp(-t * 5.5)) / rate;
      const n = noise(); crack.run(n);
      return drive(Math.sin(phase) * Math.exp(-t * 1.7) + punch.run(n) * 2.2 * Math.exp(-t * 9), 1.8) + crack.band * Math.exp(-t * 45) * .35;
    });
  } },
  // Swell into a downbeat: noise through a rising band-pass and a climbing unison tone, loudest at its very end.
  riser: { seconds: 2.4, base: 60, rms: .12, window: 2.4, render(out, rate, noise) {
    const band = new Svf(rate, 400, 1.8), tone = new Unison(rate, 3, 25, 61), toneFilter = new Svf(rate, 800, 1.2);
    each(out, rate, (t, i) => {
      const q = t / 2.4;
      if (i % 32 === 0) { band.set(320 * 2 ** (q * 4.2), 1.8); toneFilter.set(300 + 3500 * q * q, 1.2); }
      band.run(noise());
      return (band.band * 1.1 + toneFilter.run(tone.next(midi(48) * 2 ** q)) * .35 * q) * q ** 2.2;
    });
  } },
  // Dark crash: inharmonic partials and noise between 3 and 8.5 kHz, a fast front and a long, soft wash.
  crash: { seconds: 2, base: 60, rms: .09, window: .5, render(out, rate, noise) {
    const partialNoise = noiseSource(977);
    const rotors = Array.from({ length: 12 }, (_, k) => new Rotor(3200 + 6600 * (.5 + .5 * partialNoise()), rate, k));
    const low = new OnePole(3000, rate), smooth = new OnePole(8500, rate);
    each(out, rate, t => {
      let m = 0; for (const rotor of rotors) m += rotor.next();
      const v = m * .08 + noise() * .5;
      return smooth.run(v - low.run(v)) * Math.min(1, t / .001) * (Math.exp(-t * 1.6) * .8 + Math.exp(-t * 12) * .4);
    });
  } },
  // The low cinematic brass blast: unison saws and a square through a filter that snaps open and slowly closes, driven.
  braam: { seconds: 2.6, base: 36, rms: .22, window: .8, render(out, rate) {
    const f = midi(36), stack = new Unison(rate, 5, 20, 71), square = new Pulse(rate), sub = new Rotor(f / 2, rate), filter = new Svf(rate, 200, 1.5);
    each(out, rate, (t, i) => {
      if (i % 16 === 0) filter.set(160 + 1350 * Math.min(1, t / .06) * Math.exp(-t * 1.35), 1.5);
      const tone = filter.run(stack.next(f) + square.next(f * 1.002) * .45) + sub.next() * .3;
      return drive(tone, 2.6) * Math.min(1, t / .012) * Math.exp(-t * 1.05) * Math.min(1, (2.6 - t) / .6);
    });
  } },
  // Brassy synth stab for accents: a chord is three of these.
  stab: { seconds: .7, base: 48, rms: .22, window: .3, render(out, rate) {
    const f = midi(48), stack = new Unison(rate, 4, 18, 79), square = new Pulse(rate, .35), filter = new Svf(rate, 2000, 1.25);
    each(out, rate, (t, i) => {
      if (i % 16 === 0) filter.set(650 + 3600 * Math.exp(-t * 9), 1.25);
      return drive(filter.run(stack.next(f) + square.next(f) * .35), 1.8) * Math.min(1, t / .003) * Math.exp(-t * 5.2);
    });
  } },
  // Deep tuned tom: a pitch-dropping body and a band-passed skin.
  tom: { seconds: .5, base: 48, rms: .2, window: .3, render(out, rate, noise) {
    const f = midi(48), skin = new Svf(rate, 950, .9); let phase = 0;
    each(out, rate, t => {
      phase += TAU * f * (1 + .6 * Math.exp(-t * 24)) / rate;
      skin.run(noise());
      return drive(Math.sin(phase) * Math.exp(-t * 7) + skin.band * Math.exp(-t * 38) * .45, 1.5);
    });
  } },
  // Layered clap: three quick noise bursts and a tail, over a little snare body.
  clap: { seconds: .35, base: 60, rms: .12, window: .2, render(out, rate, noise) {
    const band = new Svf(rate, 1350, .9);
    each(out, rate, t => {
      let envelope = t >= .0255 ? Math.exp(-(t - .0255) * 14) : 0;
      for (let k = 0; k < 3; k++) if (t >= k * .0085) envelope += Math.exp(-(t - k * .0085) * 190);
      band.run(noise());
      return drive(band.band * envelope * 1.4 + Math.sin(TAU * 190 * t) * Math.exp(-t * 34) * .25, 1.4);
    });
  } },
  // Driving synth bass for eighths: detuned saws plucked by a resonant filter, a sine sub, heavy saturation.
  'drive-bass': { seconds: .36, base: 36, rms: .26, window: .3, render(out, rate) {
    const f = midi(36), stack = new Unison(rate, 2, 18, 83), sub = new Rotor(f, rate), filter = new Svf(rate, 1000, 1.6);
    each(out, rate, (t, i) => {
      if (i % 16 === 0) filter.set(280 + 1900 * Math.exp(-t * 15), 1.6);
      return drive(filter.run(stack.next(f)) + sub.next() * .55, 2.7) * Math.min(1, t / .002) * Math.exp(-t * 6.5);
    });
  } },
  // Overload bass: a wider saw stack through a fast resonant wobble, driven into a growl.
  growl: { seconds: .32, base: 36, rms: .26, window: .3, render(out, rate) {
    const f = midi(36), stack = new Unison(rate, 3, 26, 89), sub = new Rotor(f, rate), filter = new Svf(rate, 1000, 2.6);
    each(out, rate, (t, i) => {
      if (i % 8 === 0) filter.set(380 + 1700 * (.5 + .5 * Math.sin(TAU * 9 * t - 1.6)) * Math.exp(-t * 2.5), 2.6);
      return drive(filter.run(stack.next(f)) * 1.2 + sub.next() * .5, 3.2) * Math.min(1, t / .002) * Math.exp(-t * 5.5);
    });
  } },
  // Rhythmic pulse: a short saw-and-pulse pluck with a snapping filter, for arpeggios.
  arp: { seconds: .3, base: 60, rms: .2, window: .2, render(out, rate) {
    const f = midi(60), saw = new Saw(rate), pulse = new Pulse(rate, .3), filter = new Svf(rate, 2000, 1.4);
    each(out, rate, (t, i) => {
      if (i % 16 === 0) filter.set(520 + 3400 * Math.exp(-t * 24), 1.4);
      return drive(filter.run(saw.next(f) * .7 + pulse.next(f * 1.003) * .45), 1.3) * Math.min(1, t / .0015) * Math.exp(-t * 9.5);
    });
  } },
  // Dark string ensemble for the supporting harmony: seven unison saws, a delayed vibrato, a mellow low-pass.
  strings: { seconds: 3, base: 48, rms: .2, window: 3, render(out, rate) {
    const f = midi(48), stack = new Unison(rate, 7, 14, 97), filter = new Svf(rate, 1150, .7), low = new OnePole(140, rate);
    each(out, rate, t => {
      const vibrato = 1 + .0035 * Math.sin(TAU * 5.4 * t) * Math.min(1, Math.max(0, (t - .35) / .5));
      const tone = filter.run(stack.next(f * vibrato));
      return drive(tone - low.run(tone), 1.2) * Math.min(1, t / .32) ** 1.5 * Math.min(1, (3 - t) / 1.1);
    });
  } },
};

const PATCHES: Record<Instrument, Patch> = { ...LEVEL, ...CORONA, ...UMBRA, ...BOSS };
/** The voices of the two scores recomposed on 10 November; every other level voice plays an unchanged score. */
export const RECOMPOSED_INSTRUMENTS = [...Object.keys(CORONA), ...Object.keys(UMBRA)] as (CoronaInstrument | UmbraInstrument)[];
export const LEVEL_INSTRUMENTS = [...Object.keys(LEVEL), ...RECOMPOSED_INSTRUMENTS] as LevelInstrument[];
export const BOSS_INSTRUMENTS = Object.keys(BOSS) as BossInstrument[];
export const isInstrument = (id: string): id is Instrument => id in PATCHES;
/** Sample lengths in seconds and the note each sample sounds at playback rate 1. */
export const INSTRUMENT_SECONDS = Object.fromEntries(Object.entries(PATCHES).map(([id, p]) => [id, p.seconds])) as Record<Instrument, number>;
export const BASE_PITCH = Object.fromEntries(Object.entries(PATCHES).map(([id, p]) => [id, p.base])) as Record<Instrument, number>;

export function synthesizeInstrument(id: Instrument, rate: number): Float32Array {
  const patch = PATCHES[id], out = new Float32Array(Math.ceil(patch.seconds * rate));
  patch.render(out, rate, noiseSource(seedOf(id)));
  return finish(out, rate, patch);
}
