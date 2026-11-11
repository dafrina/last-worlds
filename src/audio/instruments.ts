import { cents, drive, finish, midi, OnePole, Pulse, Rotor, Saw, seedOf, Svf, TAU, Unison, noiseSource } from './dsp';

/**
 * Music instrument patches (10 November revision): band-limited analogue-style oscillators, moving filters, unison,
 * saturation and modal partials replace the earlier sine/FM tones, for a darker, cinematic electronic sound.
 * Every patch is one cached mono sample at 32 kHz, pitched by playback rate from its base note, exactly as before.
 *
 * Level patches keep their names, lengths, base notes and the loudness of the patch they replace (`rms` over `window`,
 * measured on the 20 October samples), so the authored scores keep their balance. Boss patches play only in the boss stem.
 */
export type LevelInstrument = 'kick' | 'snare' | 'hat' | 'bass' | 'glass'
  | 'bloom-pad' | 'foundry-bass' | 'saw-lead' | 'piano' | 'round-bass' | 'brush'
  | 'breath-pad' | 'nerve' | 'bio-bass' | 'heart' | 'bone' | 'void-bass' | 'void-tick'
  | WorldInstrument | CoronaInstrument | UmbraInstrument;
/** Voices added when Luna, Khepri, Nacre, Vesper and Amnion were reworked (11 November, phase 4), and the snappy kick
 * they share. `kick` is now Umbra's alone: its score is frozen, sample for sample. */
export type WorldInstrument = 'snap-kick' | 'signal' | 'forge-kick' | 'anvil' | 'steam' | 'pearl' | 'frost' | 'crack'
  | 'chitter' | 'night-click';
/** Corona's own voices (its score was recomposed on 10 November; see score.ts), with a darbuka's doum and tek. */
export type CoronaInstrument = 'harp' | 'harp-high' | 'solar' | 'bowed' | 'ember' | 'doum' | 'tek';
/** Umbra's reversed and inharmonic voices (its score was recomposed on 10 November; see score.ts). */
export type UmbraInstrument = 'inhale' | 'glint' | 'obsidian';
export type BossInstrument = 'boom' | 'riser' | 'crash' | 'braam' | 'stab' | 'tom' | 'taiko' | 'boss-kick' | 'timpani' | 'spiccato' | 'drive-bass' | 'growl' | 'strings';
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
/**
 * Every bass (11 November: "too sawy and dirty"): clean and round. A sine fundamental carries the weight; a second and
 * third harmonic fade faster (a gently filtered edge a phone speaker can reproduce); a soft felted onset. No saw, no
 * distortion. `bend` gives a slight pitch settle at the start (Amnion's organic bass).
 */
function roundBass(out: Float32Array, rate: number, noise: () => number, o: { decay: number; second: number; third: number; thump?: number; bend?: number }) {
  const f = midi(36), knock = new OnePole(260, rate);
  let p = 0;
  each(out, rate, t => {
    p += TAU * f * (1 + (o.bend ?? 0) * Math.exp(-t * 25)) / rate;
    const body = Math.sin(p) + o.second * Math.sin(2 * p) * Math.exp(-t * 4) + o.third * Math.sin(3 * p) * Math.exp(-t * 9);
    return (body + knock.run(noise()) * (o.thump ?? .12) * Math.exp(-t * 60)) * Math.min(1, t / .004) * Math.exp(-t * o.decay);
  });
}

const each = (out: Float32Array, rate: number, sample: (t: number, i: number) => number) => {
  for (let i = 0; i < out.length; i++) out[i] = sample(i / rate, i);
};

/**
 * A snappy kick (phase 4, user: "i need snappier kicks"): a beater click and a slap of noise in the first milliseconds,
 * a body that drops fast from `from` to `to` Hz and dies quickly, saturated so its knock reads in the midrange of a
 * phone speaker, and a short resonant knock around 190 Hz.
 */
function punchKick(out: Float32Array, rate: number, noise: () => number,
  o: { from: number; to: number; drop: number; decay: number; click: number; clickHz: number; knock: number; drive: number }) {
  const click = new Svf(rate, o.clickHz, .8), knock = new Svf(rate, 190, 1.6);
  let phase = 0;
  each(out, rate, t => {
    phase += TAU * (o.to + (o.from - o.to) * Math.exp(-t * o.drop)) / rate;
    const n = noise(); click.run(n); knock.run(n);
    const body = Math.sin(phase) * Math.exp(-t * o.decay) * Math.min(1, t / .0008);
    return drive(body * 1.2, o.drive) + click.band * Math.exp(-t * 550) * o.click
      + Math.sin(TAU * o.clickHz * .45 * t) * Math.exp(-t * 800) * o.click * .4 + knock.band * Math.exp(-t * 40) * o.knock;
  });
}

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
  harp: { seconds: 2.2, base: 48, rms: .25, window: .4, limit: true, render(out, rate, noise) { harp(out, rate, noise, 48, 2.4, 2600, [190, 430]); } },
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
  // The darbuka's doum: a deep, resonant goblet-drum stroke, its head settling in pitch, a soft palm slap.
  doum: { seconds: .6, base: 36, rms: .4, window: .15, render(out, rate, noise) {
    punchKick(out, rate, noise, { from: 128, to: 84, drop: 22, decay: 5.5, click: .5, clickHz: 1400, knock: .3, drive: 1.5 });
  } },
  // Its tek: the rim struck sharply with the fingers, three short shell modes and a crack.
  tek: { seconds: .2, base: 60, rms: .1, window: .1, render(out, rate, noise) {
    const shell = [[820, 38, .5], [1460, 55, .3], [2630, 80, .15]], rotors = shell.map(([hz], k) => new Rotor(hz, rate, k)), crack = new Svf(rate, 4200, 1.1);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < shell.length; k++) v += rotors[k].next() * shell[k][2] * Math.exp(-t * shell[k][1]);
      crack.run(noise());
      return v * .8 + crack.band * Math.exp(-t * 260) * .9;
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

const LEVEL: Record<Exclude<LevelInstrument, WorldInstrument | CoronaInstrument | UmbraInstrument>, Patch> = {
  // Umbra's kick, frozen with its score: a fast pitch drop, a short beater click and saturation that puts its knock in
  // the midrange.
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
  // A soft brushed backbeat: a band-passed swish with a slower onset over a dull low body.
  brush: { seconds: .22, base: 60, rms: .05, window: .22, render(out, rate, noise) {
    const swish = new Svf(rate, 3000, .55), body = new OnePole(650, rate);
    each(out, rate, t => {
      const n = noise(); swish.run(n);
      return swish.band * .5 * Math.min(1, t / .005) * Math.exp(-t * 22) + body.run(n) * 1.6 * Math.exp(-t * 32);
    });
  } },
  // Vesper/Corona bass: the darkest, most sub-weighted of the round basses.
  bass: { seconds: .8, base: 36, rms: .27, window: .4, render(out, rate, noise) { roundBass(out, rate, noise, { decay: 3.2, second: .24, third: .05 }); } },
  // Luna and Nacre: warm and round.
  'round-bass': { seconds: .8, base: 36, rms: .285, window: .4, render(out, rate, noise) { roundBass(out, rate, noise, { decay: 3.6, second: .34, third: .1 }); } },
  // Khepri (the name stays; the timbre is clean now): round, with a little more edge and a firmer onset for weight.
  'foundry-bass': { seconds: .8, base: 36, rms: .265, window: .4, render(out, rate, noise) { roundBass(out, rate, noise, { decay: 3, second: .38, third: .14, thump: .18 }); } },
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
  // Vesper's bell, clean and icy like a triangle (phase 4): five sparse partials of a struck steel rod (1, 2.01, 2.76,
  // 5.4, 8.93), each beating slowly against a twin 1.6 cents away (the shimmer), the high ones dying first, a faint
  // strike and nothing low or muddy. It is played an octave above the written melody.
  glass: { seconds: 4, base: 60, rms: .22, window: .6, limit: true, render(out, rate, noise) {
    const f = midi(60), partials = [[1, .5, .6], [2.01, .16, 1.1], [2.76, .2, 1.4], [5.4, .09, 2.4], [8.93, .035, 4]];
    const rotors = partials.map(([r], k) => new Rotor(f * r, rate, k * .9)), twins = partials.map(([r], k) => new Rotor(f * r * cents(1.6), rate, k * 1.7));
    const strike = new Svf(rate, 7000, .9), smooth = new OnePole(11000, rate);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < partials.length; k++) v += (rotors[k].next() + twins[k].next() * .45) * partials[k][1] * Math.exp(-t * partials[k][2]);
      strike.run(noise());
      return smooth.run(v + strike.band * Math.exp(-t * 650) * .12) * Math.min(1, t / .0015) * Math.min(1, (4 - t) / 1.2);
    });
  } },
  // Nacre's slow bloom: soft detuned sine voices with a gentle pitch drift, a saw layer whose filter opens with the swell,
  // and the original breathing. Phase 4: thinned below 200 Hz, so it no longer covers the drums.
  'bloom-pad': { seconds: 8.5, base: 48, rms: .26, window: 8.5, render(out, rate, noise) {
    const f = midi(48), saws = new Unison(rate, 2, 10, 43), filter = new Svf(rate, 300, .7), air = new OnePole(2400, rate), thin = new OnePole(200, rate);
    const detunes = [cents(-6), cents(-2), cents(3), cents(7)], phases = [0, 1.3, 2.1, 4.4];
    each(out, rate, (t, i) => {
      const bloom = Math.min(1, t / 1.1) ** 1.4 * Math.min(1, (8.5 - t) / 3.6);
      if (i % 32 === 0) filter.set(300 + 1100 * bloom * (.8 + .2 * Math.sin(TAU * .13 * t)), .7);
      const drift = TAU * f * (1 + .0012 * Math.sin(TAU * .12 * t)) / rate;
      let soft = 0;
      for (let k = 0; k < 4; k++) { phases[k] += drift * detunes[k]; soft += Math.sin(phases[k]) + Math.sin(phases[k] * 2) * .09; }
      const breathe = .84 + .16 * Math.sin(TAU * .19 * t - .7), n = noise();
      // Gentle saturation rounds the peaks where the detuned voices align, as an analogue pad would.
      const v = (drive((soft * .28 + filter.run(saws.next(f)) * .22) * .75, 1.35) + (n - air.run(n)) * .012) * bloom * breathe;
      return v - thin.run(v);
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
  // Amnion: round, with a slight organic pitch settle at the start.
  'bio-bass': { seconds: .8, base: 36, rms: .265, window: .4, render(out, rate, noise) { roundBass(out, rate, noise, { decay: 3.4, second: .3, third: .1, bend: .04 }); } },
  // Heartbeat: a deep pitch-dropping thump with a wet low squish; phase 4 gives it a faster drop and a soft snap, so it
  // lands like a kick.
  heart: { seconds: .32, base: 36, rms: .17, window: .32, render(out, rate, noise) {
    const squish = new OnePole(300, rate), snap = new Svf(rate, 1900, .9); let phase = 0;
    each(out, rate, t => {
      phase += TAU * (48 + 60 * Math.exp(-t * 48)) / rate;
      const n = noise(); snap.run(n);
      return drive(Math.sin(phase) * .95 + squish.run(n) * 1.3 * Math.exp(-t * 34), 1.8) * Math.min(1, t / .0015) * Math.exp(-t * 19)
        + snap.band * Math.exp(-t * 300) * .3;
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
  // Umbra's controlled deep pulse: the purest of the round basses.
  'void-bass': { seconds: .9, base: 36, rms: .28, window: .4, render(out, rate, noise) { roundBass(out, rate, noise, { decay: 2.6, second: .2, third: .05, thump: .06 }); } },
  // Precise tick: a short FM blip and a band-passed sliver of noise.
  'void-tick': { seconds: .12, base: 60, rms: .086, window: .12, render(out, rate, noise) {
    const air = new Svf(rate, 5200, 1.2);
    each(out, rate, t => {
      air.run(noise());
      return Math.sin(TAU * 2200 * t + .35 * Math.sin(TAU * 3300 * t) * Math.exp(-t * 60)) * Math.exp(-t * 105) * .62 + air.band * Math.exp(-t * 160) * .16;
    });
  } },
};

/** Voices of the reworked Luna, Khepri, Nacre, Vesper and Amnion (11 November, phase 4). */
const WORLDS: Record<WorldInstrument, Patch> = {
  // The snappy kick of Luna, Nacre and Vesper.
  'snap-kick': { seconds: .38, base: 36, rms: .4, window: .12, render(out, rate, noise) {
    punchKick(out, rate, noise, { from: 170, to: 50, drop: 38, decay: 9, click: 1.6, clickHz: 3600, knock: .35, drive: 2 });
  } },
  // Luna's far-side signal: a distant beacon, a pure sine with a brief FM sparkle and a slow vibrato.
  signal: { seconds: 1.5, base: 72, rms: .18, window: .5, render(out, rate) {
    const f = midi(72); let p = 0;
    each(out, rate, t => {
      p += TAU * f * (1 + .002 * Math.sin(TAU * 5.5 * t) * Math.min(1, t / .4)) / rate;
      return Math.sin(p + Math.sin(p * 2) * .35 * Math.exp(-t * 14)) * Math.min(1, t / .008) * Math.exp(-t * 2.4);
    });
  } },
  // Khepri's kick: harder and shorter, a bright steel click.
  'forge-kick': { seconds: .36, base: 36, rms: .45, window: .12, render(out, rate, noise) {
    punchKick(out, rate, noise, { from: 230, to: 54, drop: 52, decay: 10.5, click: 2, clickHz: 4800, knock: .5, drive: 2.6 });
  } },
  // A tuned anvil: struck steel with a clear fundamental over inharmonic modes, ringing a little.
  anvil: { seconds: 1.1, base: 60, rms: .16, window: .3, render(out, rate, noise) {
    const f = midi(60), modes = [[1, .55, 3.2], [2.06, .26, 5.5], [3.17, .2, 8], [4.62, .12, 12], [6.13, .07, 17]];
    const rotors = modes.map(([r], k) => new Rotor(f * r, rate, k * 1.4)), strike = new Svf(rate, 3200, 1.2);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < modes.length; k++) v += rotors[k].next() * modes[k][1] * Math.exp(-t * modes[k][2]);
      strike.run(noise());
      return drive(v + strike.band * Math.exp(-t * 90) * .45, 1.3) * Math.min(1, (1.1 - t) / .3);
    });
  } },
  // Steam let out of a press: a hiss whose band climbs as the pressure opens, then dies away.
  steam: { seconds: 1.3, base: 60, rms: .07, window: 1.3, render(out, rate, noise) {
    const hiss = new Svf(rate, 2000, 1.3), air = new OnePole(9000, rate);
    each(out, rate, (t, i) => {
      if (i % 32 === 0) hiss.set(1800 + 4200 * Math.min(1, t / .5), 1.3);
      hiss.run(noise());
      return air.run(hiss.band + hiss.high * .25) * Math.min(1, t / .06) * Math.exp(-t * 2.6);
    });
  } },
  // Nacre's pearl: a soft-mallet vibraphone bar (partials 1, 3.98, 9.6) with its motor's slow tremolo, dreamy.
  pearl: { seconds: 2.8, base: 60, rms: .25, window: .5, limit: true, render(out, rate, noise) {
    const f = midi(60), bars = [[1, .7, 1.1], [3.98, .18, 3.2], [9.6, .05, 7]], rotors = bars.map(([r], k) => new Rotor(f * r, rate, k)), mallet = new OnePole(900, rate);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < bars.length; k++) v += rotors[k].next() * bars[k][1] * Math.exp(-t * bars[k][2]);
      const motor = 1 - .3 * (.5 + .5 * Math.sin(TAU * 4.6 * t - 1.6)) * Math.min(1, t / .25);
      return (v * motor + mallet.run(noise()) * Math.exp(-t * 120) * .25) * Math.min(1, t / .003) * Math.min(1, (2.8 - t) / .6);
    });
  } },
  // Vesper's frost: a cold pad of detuned sines with a trace of odd harmonics (no saw warmth), over thin, drifting wind.
  frost: { seconds: 5.6, base: 48, rms: .2, window: 5.6, render(out, rate, noise) {
    const f = midi(48), detunes = [-7, -2, 3, 8].map(c => cents(c)), phases = [0, 1.1, 2.3, 3.7], wind = new Svf(rate, 5200, 1.4);
    each(out, rate, (t, i) => {
      if (i % 64 === 0) wind.set(4200 + 2200 * (.5 + .5 * Math.sin(TAU * .09 * t)), 1.4);
      let v = 0;
      for (let k = 0; k < 4; k++) { phases[k] += TAU * f * detunes[k] / rate; v += Math.sin(phases[k]) + Math.sin(phases[k] * 3) * .08 + Math.sin(phases[k] * 2) * .05; }
      wind.run(noise());
      const shimmer = .8 + .2 * Math.sin(TAU * .23 * t + 1);
      return (v * .22 * shimmer + wind.band * .05 * (.5 + .5 * Math.sin(TAU * .13 * t))) * Math.min(1, t / 1.6) ** 1.3 * Math.min(1, (5.6 - t) / 2.2);
    });
  } },
  // Ice under strain: the dispersive "pew" of a frozen sheet (high frequencies arrive first, sweeping down), twice.
  crack: { seconds: .5, base: 60, rms: .08, window: .5, render(out, rate, noise) {
    const snap = new Svf(rate, 5500, 1); let p = 0, q = 0;
    each(out, rate, t => {
      p += TAU * (300 + 3600 * Math.exp(-t * 22)) / rate;
      const u = Math.max(0, t - .07);
      if (t >= .07) q += TAU * (260 + 2800 * Math.exp(-u * 26)) / rate;
      snap.run(noise());
      return Math.sin(p) * Math.exp(-t * 9) * Math.min(1, t / .002) * .6 + (t >= .07 ? Math.sin(q) * Math.exp(-u * 11) * .3 : 0)
        + snap.band * Math.exp(-t * 500) * .5;
    });
  } },
  // Amnion's night: a creature's chitter, eleven chitinous clicks that speed up and then stall, each a tiny resonant
  // ping with a scratch of noise. Played at different rates it is different creatures.
  chitter: { seconds: .7, base: 60, rms: .07, window: .7, render(out, rate, noise) {
    const rhythm = noiseSource(613), clicks: [number, number][] = [];
    let at = .004;
    for (let k = 0; k < 11; k++) {
      clicks.push([at, 2600 * (1 + .14 * rhythm())]);
      at += k < 7 ? .022 - k * .0018 : .05 + .02 * Math.abs(rhythm());
    }
    const band = new Svf(rate, 3400, 2.2);
    each(out, rate, t => {
      band.run(noise());
      let v = 0;
      for (const [start, hz] of clicks) if (t >= start && t < start + .02) {
        const u = t - start;
        v += Math.sin(TAU * hz * u) * Math.exp(-u * 420) + band.band * Math.exp(-u * 1500) * .6;
      }
      return v * (.6 + .4 * Math.sin(Math.PI * Math.min(1, t / .55)));
    });
  } },
  // A single clicking call in the dark: three quick chitin ticks, low, high, middle.
  'night-click': { seconds: .14, base: 60, rms: .08, window: .14, render(out, rate, noise) {
    const band = new Svf(rate, 2800, 1.8), ticks = [[0, 1700, 1], [.027, 3900, .6], [.041, 2300, .45]];
    each(out, rate, t => {
      band.run(noise());
      let v = 0;
      for (const [start, hz, g] of ticks) if (t >= start) {
        const u = t - start;
        v += (Math.sin(TAU * hz * u) * Math.exp(-u * 300) + band.band * Math.exp(-u * 1100) * .5) * g;
      }
      return v;
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
  // Brass for accents and stingers: five unison saws through a low-pass that blooms open over 40 ms and settles, a
  // soft attack, no grit; a chord is three of these.
  stab: { seconds: .7, base: 48, rms: .22, window: .3, render(out, rate) {
    const f = midi(48), stack = new Unison(rate, 5, 10, 79), filter = new Svf(rate, 600, .9);
    each(out, rate, (t, i) => {
      if (i % 16 === 0) filter.set(800 + 1700 * Math.min(1, t / .04) * Math.exp(-t * 4), .9);
      return filter.run(stack.next(f)) * Math.min(1, t / .02) * Math.exp(-t * 3.2);
    });
  } },
  // An ensemble drum (taiko-like): a stick's click, a deep skin falling fast in pitch, its second mode, the slap of the
  // head. Phase 4: snappier, a quicker drop and a firmer, saturated body.
  taiko: { seconds: .9, base: 36, rms: .28, window: .3, render(out, rate, noise) {
    const slap = new Svf(rate, 520, .9), stick = new Svf(rate, 2600, 1); let p = 0, q = 0;
    each(out, rate, t => {
      const f = 54 + 60 * Math.exp(-t * 26);
      p += TAU * f / rate; q += TAU * f * 1.58 / rate;
      const n = noise(); slap.run(n); stick.run(n);
      return (drive(Math.sin(p) * Math.exp(-t * 5) + Math.sin(q) * .3 * Math.exp(-t * 10), 1.4) + slap.band * .9 * Math.exp(-t * 32)
        + stick.band * .5 * Math.exp(-t * 380)) * Math.min(1, t / .0005);
    });
  } },
  // The fights' kick, under the big drum on its strongest strokes: a deep, punchy body with a sub tail and a click.
  'boss-kick': { seconds: .55, base: 36, rms: .42, window: .15, render(out, rate, noise) {
    punchKick(out, rate, noise, { from: 160, to: 43, drop: 30, decay: 6, click: 1.8, clickHz: 3000, knock: .45, drive: 2.2 });
  } },
  // Tuned timpani: the principal tone and the drum's inharmonic overtones (1.5, 1.98, 2.44), a felt strike.
  timpani: { seconds: 1.5, base: 36, rms: .2, window: .5, render(out, rate, noise) {
    const f = midi(36), modes = [[1, 2.4, .7], [1.5, 3.2, .35], [1.98, 4.2, .22], [2.44, 5.5, .12]];
    const rotors = modes.map(([r], k) => new Rotor(f * r, rate, k)), strike = new OnePole(400, rate);
    each(out, rate, t => {
      let v = 0;
      for (let k = 0; k < modes.length; k++) v += rotors[k].next() * modes[k][2] * Math.exp(-t * modes[k][1]);
      return (v + strike.run(noise()) * .5 * Math.exp(-t * 50)) * Math.min(1, t / .003);
    });
  } },
  // Spiccato strings for the ostinatos: a short bowed stroke, four detuned saws through a soft low-pass with a quick
  // bloom, a little rosin; no buzz at the top.
  spiccato: { seconds: .3, base: 48, rms: .2, window: .2, render(out, rate, noise) {
    const f = midi(48), stack = new Unison(rate, 4, 12, 131), filter = new Svf(rate, 1500, .8), rosin = new Svf(rate, 3000, 1.2);
    each(out, rate, (t, i) => {
      if (i % 16 === 0) filter.set(900 + 1500 * Math.exp(-t * 18), .8);
      rosin.run(noise());
      return (filter.run(stack.next(f)) + rosin.band * .06 * Math.exp(-t * 40)) * Math.min(1, t / .006) * Math.exp(-t * 10);
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
  // The boss basses are round too; their drive comes from rhythm and articulation: core's eighths are plucked and short,
  // overload's shorter and firmer.
  // Phase 4: fuller (longer, more second harmonic) so the fights have weight.
  'drive-bass': { seconds: .55, base: 36, rms: .26, window: .3, render(out, rate, noise) { roundBass(out, rate, noise, { decay: 4.2, second: .5, third: .18, thump: .2 }); } },
  growl: { seconds: .45, base: 36, rms: .26, window: .25, render(out, rate, noise) { roundBass(out, rate, noise, { decay: 6, second: .55, third: .22, thump: .25 }); } },
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

const PATCHES: Record<Instrument, Patch> = { ...LEVEL, ...WORLDS, ...CORONA, ...UMBRA, ...BOSS };
/** Voices added for the recomposed and reworked scores; the older level voices keep their 20 October base notes. */
export const RECOMPOSED_INSTRUMENTS = [...Object.keys(WORLDS), ...Object.keys(CORONA), ...Object.keys(UMBRA)] as (WorldInstrument | CoronaInstrument | UmbraInstrument)[];
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
