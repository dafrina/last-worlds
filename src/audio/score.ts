import type { PlanetId } from '../shared/contracts';
import type { Instrument } from './samples';

export interface Note { instrument: Instrument; pitch: number; gain: number; pan: number; wet: number; offset?: number }
interface Theme {
  title: string; bpm: number; root: number; chords: readonly (readonly number[])[];
  bass: readonly number[]; melody: readonly number[]; kick: readonly number[]; hats: readonly number[];
}
/** Four authored 32-bar arrangements. Offsets are semitones; -1 means rest, never a random note. */
export const THEMES: Record<PlanetId, Theme> = {
  luna: {
    title: 'Far Side Signal', bpm: 94, root: 50,
    chords: [[0, 7, 14, 17], [-2, 5, 12, 16], [-5, 2, 9, 12], [0, 5, 9, 14]],
    bass: [0, -1, -1, 0, -1, -1, 7, -1, 0, -1, -1, 12, -1, -1, 7, -1],
    melody: [14, -1, -1, 19, -1, -1, 17, -1, 12, -1, 9, -1, -1, -1, 7, -1],
    kick: [0, 7, 10], hats: [2, 6, 10, 14],
  },
  khepri: {
    title: 'Foundry Afterimage', bpm: 118, root: 45,
    chords: [[0, 7, 12, 15], [-1, 6, 11, 14], [-5, 2, 7, 10], [-2, 5, 10, 14]],
    bass: [0, -1, 0, 12, -1, 7, 0, -1, 0, 12, -1, 0, -1, 7, 10, 7],
    melody: [12, -1, 15, -1, 19, -1, -1, 15, -1, 12, -1, 10, -1, 7, -1, 10],
    kick: [0, 6, 8, 11], hats: [0, 2, 4, 6, 8, 10, 12, 14, 15],
  },
  nacre: {
    title: 'Dreams Beneath the Bloom', bpm: 106, root: 48,
    chords: [[0, 7, 14, 17], [3, 10, 17, 21], [5, 12, 19, 22], [2, 9, 16, 19]],
    bass: [0, -1, -1, 12, -1, -1, 7, -1, -1, 0, -1, 7, -1, 12, -1, -1],
    melody: [12, -1, -1, 19, -1, 14, -1, -1, 21, -1, -1, 19, -1, 17, 14, -1],
    kick: [0, 7, 10], hats: [2, 5, 8, 11, 14],
  },
  vesper: {
    title: 'Below the Ice Line', bpm: 88, root: 47,
    chords: [[0, 7, 14, 15], [-3, 4, 11, 14], [-5, 2, 9, 12], [-2, 5, 12, 14]],
    bass: [0, -1, -1, -1, -1, -1, 7, -1, 0, -1, -1, -1, 12, -1, -1, -1],
    melody: [19, -1, -1, -1, 14, -1, -1, 12, -1, -1, 15, -1, -1, -1, 7, -1],
    kick: [0, 10], hats: [2, 6, 14],
  },
};

/** A score step is a sixteenth note. Sparse openings, evolving phrases, a breakdown, then return. */
export function scoreStep(planet: PlanetId, step: number, tension: number): Note[] {
  const theme = THEMES[planet], bar = Math.floor(step / 16), beat = step % 16;
  const phrase = Math.floor(bar / 8) % 4, chordIndex = Math.floor(bar / 2) % 4;
  const chord = theme.chords[chordIndex], root = theme.root;
  const notes: Note[] = [], breakdown = phrase === 2 && tension === 0;
  const human = planet === 'luna', bloom = planet === 'nacre', foundry = planet === 'khepri';
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = .1) => {
    // Small, authored-feeling timing/velocity inflections, private to music; Vesper retains its approved mix.
    if (human) notes.push({ instrument, pitch, gain: gain * (.93 + .07 * Math.sin(step * 2.3 + pitch)),
      pan, wet, offset: beat % 2 ? .014 + .003 * Math.sin(step) : .003 * (1 + Math.sin(step * 1.7)) });
    else notes.push({ instrument, pitch, gain, pan, wet });
  };
  if (step % 32 === 0) {
    if (human) {
      // A small piano voicing replaces the same sustained synth chord used on alien worlds.
      chord.forEach((interval, i) => add('piano', root + interval, .12, (i - 1.5) * .1, .14));
    } else if (foundry) {
      // Keep space for the bass riff: short, dark saw stabs instead of a bed of glass/pads.
      [0, 7, 12].forEach((interval, i) => add('saw-lead', root + chord[0] + interval, .07, (i - 1) * .16, .08));
    } else {
      chord.forEach((interval, i) => add(bloom ? 'bloom-pad' : 'pad', root + interval,
        bloom ? .18 : .105, (i - 1.5) * .16, bloom ? .6 : .45));
    }
  }
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add(foundry ? 'saw-bass' : human || bloom ? 'round-bass' : 'bass',
    root - 12 + chord[0] + bass, (foundry ? .42 : bloom ? .21 : human ? .28 : .30) + tension * .035);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('kick', 36, bloom ? .27 : human ? .34 : .41);
  if (beat === 4 || beat === 12) {
    if (!breakdown && (bar > 1 || tension > 0)) add(human || bloom ? 'brush' : 'snare',
      60, foundry ? .20 : bloom ? .075 : .13, 0, human ? .04 : .13);
  }
  if (theme.hats.includes(beat) && !breakdown) {
    add('hat', 60 + (beat % 4 === 2 ? 2 : 0), (beat % 4 === 2 ? .09 : .045) * (bloom ? .42 : human ? .7 : 1),
      beat % 4 < 2 ? -.24 : .24, human ? .035 : .1);
  }
  // Second half of each phrase answers the lead one octave down, without a constantly repeating top line.
  const index = bar % 4 >= 2 ? (16 - beat) % 16 : beat;
  const melody = theme.melody[index];
  if (melody >= 0 && (bar % 2 === 0 || phrase === 1 || tension > 0) && (!bloom || beat % 4 === 0)) {
    const transposition = chord[0] + (phrase === 3 ? 12 : 0);
    add(human ? 'piano' : foundry ? 'saw-lead' : bloom ? 'bloom-pad' : 'glass',
      root + melody + transposition, bloom ? .17 : foundry ? .12 : breakdown ? .105 : .14,
      Math.sin(step * .51) * .38, human ? .13 : foundry ? .12 : bloom ? .65 : .38);
  }
  if (planet === 'khepri' && beat % 6 === 3 && !breakdown) add('metal', 56 + chordIndex * 2, .075, -.3, .24);
  if (human && beat === 10 && bar % 2 === 1) add('piano', root + chord[1] + 12, .10, -.15, .14);
  // Boss pressure adds a low ostinato and denser percussion, preserving the planet's harmonic identity.
  if (tension > 0 && beat % (tension > 1 ? 2 : 4) === 0) {
    add(human ? 'brush' : bloom ? 'round-bass' : 'metal', 40 + chord[0],
      .055 + tension * .015, beat % 4 === 0 ? -.2 : .2, human ? .04 : .18);
    if (!theme.kick.includes(beat) && beat % 4 === 0) add('kick', 36, .23);
  }
  return notes;
}

export class ScoreClock {
  step = 0;
  nextAt = 0;
  reset(at: number, keepPhrase = false) {
    if (!keepPhrase) this.step = 0;
    else this.step = Math.ceil(this.step / 32) * 32;
    this.nextAt = at;
  }
  take(now: number, planet: PlanetId): { step: number; at: number }[] {
    const duration = 60 / THEMES[planet].bpm / 4;
    // Never pour missed notes into a frame after a blocked main thread or OS audio interruption.
    // Skip along the existing timeline: restarting a chord on every slow frame would pile up pads.
    if (now - this.nextAt > .15) {
      const missed = Math.ceil((now + .015 - this.nextAt) / duration);
      this.step += missed; this.nextAt += missed * duration;
    }
    const result: { step: number; at: number }[] = [];
    while (this.nextAt < now + .12 && result.length < 8) {
      result.push({ step: this.step++, at: this.nextAt });
      this.nextAt += duration;
    }
    return result;
  }
}
