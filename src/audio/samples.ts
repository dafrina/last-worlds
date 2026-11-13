import { SPECIALS } from '../content/equipment';
import { drive, midi, noiseSource, OnePole, Svf } from './dsp';
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
  shield: .35, 'shield-break': .35, life: .32, pickup: .28, part: .75, upgrade: .75, ready: .65,
  shockwave: 1.65, 'seeker-rack': .8, 'siege-lance': SPECIALS['siege-lance'].duration, 'gravity-well': 1.6, warning: .65, beam: .85,
  'boss-arrival': 2.8, 'boss-phase': 1.1, 'boss-death': 3.6, warp: 3.1, win: 1.4, loss: 2.1,
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
/** A band-limited square wave (odd harmonics up to the ninth) at phase `p`. */
const square = (p: number) => { let v = 0; for (let k = 1; k <= 9; k += 2) v += sin(k * p) / k; return v; };
/**
 * The shield hit (user, 12 November): a punchy low thud (90 Hz falling to 45 Hz, gone in about 0.1 s) under an electric
 * whine, 720 Hz wobbled by 90 Hz FM and falling away, and a short noise click on the impact. 0.35 s.
 */
function fieldThud(rate: number): Voice {
  let p = 0, m = 0;
  return (t, n) => {
    m += TAU * 90 / rate; p += TAU * (720 + 260 * sin(m)) * exp(-t * 4) / rate;
    const thud = sin(TAU * (90 * exp(-t * 18) + 45) * t) * exp(-t * 22);
    return drive(thud * 1.2 + sin(p) * .6 * exp(-t * 7) + n * .25 * exp(-t * 40), 2);
  };
}
/** A note in a sequence: its age `t - at`, or -1 before it starts. */
const age = (t: number, at: number) => t >= at ? t - at : -1;

/** `fade`: the closing anti-click ramp in seconds (12 ms unless a sound is cut harder). */
/** `cut` (s): made at full length and level, then truncated there behind a `fade`-long ramp (a hard cut without a click). */
const REWORKED: Partial<Record<Sound, { peak: number; voice: (rate: number) => Voice; fade?: number; cut?: number }>> = {
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
  // The hit alarms (user, 12 November, after the klaxons: "i really dont like the new life and shield hit sounds ...
  // distinct form other sounds but still fitting and noticeably hostile"; picked from four candidates each: "the field
  // thud for shield hit and the deny buzzer for life hit"). No bells (pickups), chirps (shots) or booms (explosions).
  // A hit on the shield with charges left: the field thud, a punchy low hit with an electric whine falling out of it.
  shield: { peak: .65, voice: rate => fieldThud(rate) },
  // The last shield charge gone: the same single thud (user, 12 November: "last shield can be same as normal shield hit
  // no double"). It keeps its own event so the mixer can still treat it as the bigger moment (music ducking).
  'shield-break': { peak: .65, voice: rate => fieldThud(rate) },
  // Mission complete, in C (the engine transposes it to the world's key): a short ring (user, 13 November: "make it
  // shorter the success sound, like a rrrrring"). A bright open chord (C, G, D and a high G; no major third, no fanfare)
  // rung like a bell, eighteen strokes a second for half a second, then ringing out.
  win: { peak: .6, voice: () => t => {
    const bell = (f: number, a: number, decay: number) =>
      (sin(TAU * f * a) + .25 * sin(TAU * f * 2 * a) * exp(-a * 6) + .12 * sin(TAU * f * 3.01 * a) * exp(-a * 9)) * exp(-a * decay);
    let v = 0;
    for (let k = 0; k < 9; k++) {
      const a = age(t, k / 18);
      if (a < 0) break;
      const stroke = (k === 0 ? 1 : .55) * (1 - k / 9 * .4);
      v += (bell(523.25, a, 6) + bell(783.99, a, 6.5) * .8 + bell(1174.66, a, 7) * .6 + bell(1567.98, a, 9) * .3) * stroke * Math.min(1, a / .003);
    }
    return v * .2;
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
  // A life lost: the deny buzzer, two short harsh pulses on a grinding minor second (G3 against G#3), like "access
  // denied" (user, 12 November; it replaces the klaxon blast).
  life: { peak: .7, voice: rate => {
    let p = 0, q = 0;
    return t => {
      p += TAU * 196 / rate; q += TAU * 207.65 / rate;
      const pulse = t < .11 ? t : t > .16 && t < .29 ? t - .16 : -1;
      return pulse < 0 ? 0 : drive((square(p) + square(q)) * .6, 2.5) * Math.min(1, pulse / .004);
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
  if (reworked) {
    const samples = made(id, rate, reworked.peak, reworked.voice, reworked.fade);
    if (reworked.cut === undefined) return samples;
    // The ramp reaches zero on the last sample; then the same edge-tapered DC removal every effect gets.
    const fade = reworked.fade ?? .012, cut = samples.slice(0, Math.ceil(reworked.cut * rate)), count = cut.length;
    for (let i = 0; i < count; i++) cut[i] *= Math.min(1, Math.max(0, (count - 1 - i) / rate / fade));
    let dc = 0; for (const value of cut) dc += value; dc /= count;
    for (let i = 0; i < count; i++) cut[i] -= dc * Math.min(1, i / 48, (count - i - 1) / 48);
    return cut;
  }
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
