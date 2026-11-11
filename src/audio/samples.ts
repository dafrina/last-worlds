import { SPECIALS } from '../content/equipment';
import { midi, noiseSource, OnePole, Svf } from './dsp';
import { BOSS_INSTRUMENTS, isInstrument, LEVEL_INSTRUMENTS, synthesizeInstrument, type Instrument } from './instruments';

export { midi, noiseSource } from './dsp';
export type { Instrument } from './instruments';

/** Original, deterministic sound sources. No downloads, runtime oscillators or gameplay RNG. */
export const SAMPLE_RATE = 32_000;
export type Sound =
  | 'pulse' | 'fan' | 'seeker' | 'rail' | 'enemy' | 'impact' | 'explosion' | 'heavy'
  | 'shield' | 'shield-break' | 'life' | 'pickup' | 'part' | 'upgrade' | 'ready' | 'whoosh'
  | 'shockwave' | 'seeker-rack' | 'siege-lance' | 'gravity-well' | 'warning' | 'beam'
  | 'boss-arrival' | 'boss-phase' | 'boss-death' | 'warp' | 'win' | 'loss';
export type SampleId = Sound | Instrument;
const TAU = Math.PI * 2;
const sin = Math.sin;
const exp = Math.exp;
/** Combat and event sounds. Music instruments are patches in src/audio/instruments.ts. */
const durations: Record<Sound, number> = {
  // First: the launch warp plays it in the tap that starts a flight, only if it is already made (engine.ts launch).
  whoosh: 3,
  pulse: .07, fan: .08, seeker: .14, rail: .16, enemy: .2, impact: .13, explosion: .85, heavy: 1.6,
  shield: .23, 'shield-break': .5, life: 1, pickup: .28, part: .75, upgrade: .75, ready: .65,
  shockwave: 1.65, 'seeker-rack': .8, 'siege-lance': SPECIALS['siege-lance'].duration, 'gravity-well': 1.6, warning: .65, beam: .85,
  'boss-arrival': 2.8, 'boss-phase': 1.1, 'boss-death': 3.6, warp: 3.1, win: 2.8, loss: 2.1,
};
const LATE: Sound[] = ['boss-arrival', 'boss-phase', 'boss-death', 'warp', 'win', 'loss'];
/** Made in this order at boot (src/audio/sample-worker.ts): what a flight plays first, then the level score,
 * then what only a boss fight, a planet jump or the results need. */
export const SAMPLE_IDS: SampleId[] = [
  ...(Object.keys(durations) as Sound[]).filter(id => !LATE.includes(id)), ...LEVEL_INSTRUMENTS, ...BOSS_INSTRUMENTS, ...LATE,
];

/**
 * The effects reworked on 11 November (user: the shot "should be a very short one, i like the cadence but its a bit too
 * much and too loud, it should sound sharper"; the hit's "pitched down gong sound just sounds wrong. Maybe a short alarm
 * sound would be cool?"; "the success sound is a bit too cheesy"; "a loading sound for the warp too like a swish or
 * whoosh"; "picking up a part should make a clank, while others like upgrade should be like the shield but upwards
 * melody"). Each is made here on its own; every other effect is made, byte for byte as before, by the loop below.
 */
type Voice = (t: number, n: number) => number;
/** `count` samples of `voice`, scaled so the loudest is `peak` (anti-click edges and DC removal as for every effect). */
function made(id: Sound, rate: number, peak: number, voice: (rate: number) => Voice, fade = .012) {
  const duration = durations[id], count = Math.ceil(duration * rate), samples = new Float32Array(count);
  const noise = noiseSource([...id].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261)), play = voice(rate);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    samples[i] = play(t, noise()) * Math.min(1, t / .0006) * Math.min(1, (duration - t) / fade);
  }
  let dc = 0; for (const value of samples) dc += value; dc /= count;
  let loudest = 0;
  for (let i = 0; i < count; i++) { samples[i] -= dc * Math.min(1, i / 48, (count - i - 1) / 48); loudest = Math.max(loudest, Math.abs(samples[i])); }
  for (let i = 0; i < count; i++) samples[i] *= peak / Math.max(loudest, 1e-9);
  return samples;
}
/**
 * The alarms' voice: a hazard klaxon in a damaged hull (round 2: "an alarm horn ... maybe a lower tone"; round 3: "more
 * dirt, its too clean and too comic like"). Three reeds about 11 cents apart, beating against each other, each a
 * band-limited saw (ten harmonics); overdriven; a bit-crushed edge (held every third sample, 4-bit steps); played
 * through a cheap damaged speaker (no lows, a hard resonance around 1.4 kHz, its cone rattling at 47 Hz); and noise
 * riding the signal like a grille buzzing against it. `hz` stays put: no slides.
 */
function klaxon(rate: number) {
  const tunings = [1, 1.0066, .9937], phases = [0, 0, 0];
  const cone = new Svf(rate, 1400, 2.4), lows = new OnePole(380, rate), grille = new Svf(rate, 3300, 3);
  let held = 0, i = 0, t = 0;
  return (hz: number, n: number) => {
    let v = 0;
    for (let k = 0; k < 3; k++) {
      phases[k] += TAU * hz * tunings[k] / rate;
      for (let h = 1; h <= 10; h++) v += sin(h * phases[k]) / h;
    }
    v = Math.tanh(v * 1.8);
    if (i++ % 3 === 0) held = Math.round(v * 8) / 8;
    v = v * .6 + held * .4;
    cone.run(v); grille.run(n * Math.abs(v));
    t += 1 / rate;
    const rattle = sin(TAU * 47 * t) > .6 ? .8 : 1;
    return Math.tanh((cone.band * 1.2 + (v - lows.run(v)) * .5 + grille.band * .7) * 1.5) * rattle;
  };
}
/** A note in a sequence: its age `t - at`, or -1 before it starts. */
const age = (t: number, at: number) => t >= at ? t - at : -1;

/** `fade`: the closing anti-click ramp in seconds (12 ms unless a sound is cut harder). */
const REWORKED: Partial<Record<Sound, { peak: number; voice: (rate: number) => Voice; fade?: number }>> = {
  // Main weapon shots: a click and a chirp falling fast through the upper mids, gone in about 50 ms. No body, no tail,
  // nothing under 700 Hz; each family keeps its colour (pulse a clean tick, fan a spray, seeker a warble, rail a crack).
  pulse: { peak: .6, voice: rate => {
    let p = 0; const air = new OnePole(5000, rate);
    return (t, n) => {
      p += TAU * (900 + 2600 * exp(-t * 90)) / rate;
      return (sin(p) + .35 * sin(2.01 * p) * exp(-t * 60)) * exp(-t * 70) * .7 + air.high(n) * exp(-t * 900) * .55;
    };
  } },
  fan: { peak: .55, voice: rate => {
    let p = 0, q = 0; const spray = new Svf(rate, 5200, 1.1);
    return (t, n) => {
      const f = 750 + 2150 * exp(-t * 80);
      p += TAU * f / rate; q += TAU * f * 1.06 / rate; spray.run(n);
      return (sin(p) + sin(q)) * .38 * exp(-t * 60) + spray.band * exp(-t * 120) * .9;
    };
  } },
  // The Seeker Array fires rockets (user: "a bit more substantial ... its fucking rockets"): a low thump as each one
  // leaves the rack, an ignition hiss whose band climbs as it goes, a spit of sparks. Still short (0.14 s).
  seeker: { peak: .65, voice: rate => {
    const hiss = new Svf(rate, 1500, .9), spark = new OnePole(6000, rate); let p = 0, i = 0;
    return (t, n) => {
      if (i++ % 16 === 0) hiss.set(1500 + 3500 * Math.min(1, t / .08), .9);
      hiss.run(n);
      p += TAU * (55 + 75 * exp(-t * 40)) / rate;
      return sin(p) * exp(-t * 30) * .7 + (hiss.band * 1.2 + hiss.high * .3) * Math.min(1, t / .004) * exp(-t * 22) + spark.high(n) * exp(-t * 400) * .4;
    };
  } },
  rail: { peak: .7, voice: rate => {
    let p = 0; const crack = new OnePole(2500, rate);
    return (t, n) => {
      p += TAU * (600 + 3600 * exp(-t * 55)) / rate;
      const ring = (sin(TAU * 1873 * t) * .6 + sin(TAU * 2931 * t) * .4) * exp(-t * 28) * .18;
      return crack.high(n) * exp(-t * 200) * .9 + sin(p) * exp(-t * 40) * .5 + ring;
    };
  } },
  // The alarms are klaxons (round 2: horns, lower; round 3: gritty). A hit on the shield with charges left: the
  // shield's call once, A4 then E4 (round 3, user: "can be lowered to the same as the last shield, just single").
  shield: { peak: .65, voice: rate => {
    const sound = klaxon(rate);
    return (t, n) => sound(t < .09 ? 440 : 329.63, n) * (t < .21 ? Math.min(1, t / .003) * Math.min(1, (.21 - t) / .015) : 0);
  } },
  // The last shield charge gone: the same call twice. Unmistakably not the single call.
  'shield-break': { peak: .65, voice: rate => {
    const sound = klaxon(rate);
    return (t, n) => {
      const call = t % .25, env = t < .46 && call < .21 ? Math.min(1, call / .003) * Math.min(1, (.21 - call) / .015) : 0;
      return sound(call < .09 ? 440 : 329.63, n) * env;
    };
  } },
  // Mission complete, in C (the engine transposes it to the world's key): a low open fifth swelling up, then a clean
  // sus2 chord (C, G, D) struck softly together with a faint G above. No fanfare, no major third.
  win: { peak: .55, voice: () => t => {
    const swell = Math.min(1, t / .5) ** 2 * (t < .6 ? 1 : exp(-(t - .6) * 1.1));
    const low = (sin(TAU * 130.81 * t) + sin(TAU * 130.81 * 1.0017 * t) + (sin(TAU * 196 * t) + sin(TAU * 196 * .9983 * t)) * .7) * .25 * swell;
    const a = age(t, .5);
    if (a < 0) return low;
    const bell = (f: number, decay: number) => (sin(TAU * f * a) + .2 * sin(TAU * f * 2 * a) * exp(-a * 3)) * exp(-a * decay);
    return low + (bell(261.63, 1.2) + bell(392, 1.3) * .8 + bell(587.33, 1.5) * .6 + bell(783.99, 2.2) * .25) * Math.min(1, a / .015) * .35;
  } },
  // Upgrades (a shield cell, a power cell, a weapon): the shield's bell, partials 1, 1.498 and 2.71, rising E, B, E.
  upgrade: { peak: .6, voice: () => t => {
    let v = 0;
    [659.26, 987.77, 1318.51].forEach((f, k) => {
      const a = age(t, k * .085);
      if (a >= 0) v += (sin(TAU * f * a) + sin(TAU * f * 1.498 * a) * .45 + sin(TAU * f * 2.71 * a) * .22) * exp(-a * (k === 2 ? 5 : 9)) * Math.min(1, a / .002);
    });
    return v * .3;
  } },
  // A part, something valuable (round 2, user: "longer like the shield cell, like a substantial pickup"): a heavy
  // clank of struck steel whose middle modes ring on, and two clinks rising after it, a confirmation. 0.75 s.
  part: { peak: .6, voice: rate => {
    const strike = new Svf(rate, 2200, 1.1), clank = [[330, 9, .5], [880, 6, .4], [1560, 4.5, .3], [2490, 8, .15], [3720, 14, .08]];
    return (t, n) => {
      strike.run(n);
      let v = strike.band * exp(-t * 180) * .6;
      for (const [f, decay, amp] of clank) v += sin(TAU * f * t) * amp * exp(-t * decay);
      for (const [at, ratio, gain] of [[.24, 1.26, .35], [.36, 1.5, .4]]) {
        const a = age(t, at);
        if (a >= 0) v += (sin(TAU * 1560 * ratio * a) + sin(TAU * 1560 * ratio * 2.76 * a) * .2) * gain * exp(-a * 9) * Math.min(1, a / .001);
      }
      return v;
    };
  } },
  // A life lost (round 2, user: "replace the life lost with a horn alarm sound"; round 3: "just one longer sound but
  // pitching up like an alert horn ... dirty it up too"): one blast of the ship's klaxon winding up like an air-raid
  // horn, from A2 to G3 over its first 0.85 s (fastest at the start), with its octave below for weight: the most
  // serious of the three alarms.
  // Cut hard at exactly 1 s (user: "it should play for exactly only the first second ... just hard cut after 1
  // second"): a 4 ms ramp, abrupt to the ear, without the click of a zero-length cut.
  life: { peak: .75, fade: .004, voice: rate => {
    const sound = klaxon(rate), under = klaxon(rate);
    return (t, n) => {
      const f = 110 * (196 / 110) ** (Math.min(1, t / .85) ** .7);
      const env = Math.min(1, t / .03) * Math.min(1, (1.2 - t) / .15);
      return (sound(f, n) + under(f / 2, n) * .55) * env;
    };
  } },
  // The warp's whoosh: noise through two bands climbing from 220 Hz to 7 kHz by its peak at 1.5 s (the planet jump's
  // flash; the launch plays it a fifth up, peaking at 1 s), then passing on and away, over a low rumble.
  whoosh: { peak: .7, voice: rate => {
    const band = new Svf(rate, 220, 1.6), upper = new Svf(rate, 350, 2.2), rumble = new OnePole(140, rate);
    return (t, n) => {
      const rise = Math.min(t, 1.5) / 1.5, fc = 220 * 2 ** (rise * 5) * 2 ** (Math.max(0, t - 1.5) * .4);
      if (Math.round(t * rate) % 32 === 0) { band.set(fc, 1.6); upper.set(fc * 1.6, 2.2); }
      band.run(n); upper.run(n);
      const level = t < 1.5 ? rise ** 2 : exp(-(t - 1.5) * 2.8);
      return (band.band + upper.band * .6) * level + rumble.run(n) * 1.4 * level * (t < 1.5 ? 1 : exp(-(t - 1.5) * 2));
    };
  } },
};

export function synthesize(id: SampleId, rate = SAMPLE_RATE): Float32Array {
  if (isInstrument(id)) return synthesizeInstrument(id, rate);
  const reworked = REWORKED[id];
  if (reworked) return made(id, rate, reworked.peak, reworked.voice, reworked.fade);
  const duration = durations[id], count = Math.ceil(duration * rate);
  const samples = new Float32Array(count);
  const seed = [...id].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261);
  const noise = noiseSource(seed);
  let low = 0, slow = 0, phase = 0;
  const laser = id === 'enemy';
  const boom = ['explosion', 'heavy', 'boss-death'].includes(id);
  for (let i = 0; i < count; i++) {
    const t = i / rate, q = t / duration, n = noise();
    low += (n - low) * .11;
    slow += (n - slow) * .012;
    const high = n - low;
    let v = 0;
    if (laser) {
      // An enemy shot (the player's shots were reworked above).
      phase += TAU * (250 + 700 * exp(-t * 29)) / rate;
      const snap = high * exp(-t * 230) * .3;
      const core = sin(phase + .65 * sin(phase * 1.91) * exp(-t * 25));
      v = snap + core * exp(-t * 30) * .7 + sin(phase * .501) * exp(-t * 19) * .23;
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
    } else if (['pickup', 'ready', 'loss'].includes(id)) {
      const notes = id === 'loss' ? [60, 55, 50] : id === 'pickup' ? [86, 93] : [74, 81, 86];
      const spacing = id === 'loss' ? .14 : .055;
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
