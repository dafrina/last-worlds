import type { PlanetId } from '../shared/contracts';
import { BASE_PITCH, INSTRUMENT_SECONDS, type Instrument } from './instruments';

/** One scheduled sample. `offset` delays it within its sixteenth; the boss stem (src/audio/boss-score.ts) also uses
 * `skip` (seconds into the sample: a riser trimmed to land on a downbeat), `priority` within its own voice pool and
 * `bed` (the level bed's level from this note on). The mixer adds the player's small timing and velocity variations. */
export interface Note {
  instrument: Instrument; pitch: number; gain: number; pan: number; wet: number;
  offset?: number; skip?: number; priority?: number; bed?: number;
}
interface Theme {
  title: string; bpm: number; root: number; chords: readonly (readonly number[])[];
  bass: readonly number[]; melody: readonly number[]; kick: readonly number[]; hats: readonly number[];
}
/** Seven authored 32-bar arrangements. Offsets are semitones; -1 means rest, never a random note. */
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
    // 11 November: four notes a bar, each left to ring (the old sixteenth line ran without a breath).
    bass: [0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 7, -1, -1, 10, -1],
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
  // Vesper, 11 November: more ambient than musical. Three glass notes every second bar with room to ring, two bass
  // notes a bar, one soft kick, no backbeat or hats; the pads carry the space.
  vesper: {
    title: 'Below the Ice Line', bpm: 88, root: 47,
    chords: [[0, 7, 14, 15], [-3, 4, 11, 14], [-5, 2, 9, 12], [-2, 5, 12, 14]],
    bass: [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 7, -1, -1, -1, -1, -1],
    melody: [19, -1, -1, -1, -1, -1, 14, -1, -1, -1, -1, -1, 12, -1, -1, -1],
    kick: [0], hats: [],
  },
  amnion: {
    title: 'Something Beneath the Skin', bpm: 92, root: 43,
    chords: [[0, 7, 13], [1, 8, 12], [-5, 2, 8], [-2, 5, 12]],
    bass: [0, -1, 0, -1, -1, -1, -1, 7, -1, -1, 0, -1, -1, 12, -1, -1],
    melody: [12, -1, -1, 13, -1, -1, -1, 18, -1, -1, 13, -1, -1, 12, -1, -1],
    kick: [0, 2, 9, 11], hats: [3, 7, 10, 14],
  },
  // Corona (docs/37), recomposed 10 November (the first score was a placeholder on default instruments): a hymn for a
  // dying star. E Phrygian at 110 BPM, i, ♭II, ♭VI and the major V (Em, F, C, B), two bars each. A low harp rises and
  // falls slowly through each chord, three ringing notes a bar (11 November: no longer a running ostinato), under a
  // lament whose ♭6 sinks back to the fifth; a solar drone swells like heat under sparse, heavy drums, ember crackle and
  // a bowed-metal shriek at the phrase marks.
  corona: {
    title: 'Hymn for a Swollen Sun', bpm: 110, root: 40,
    chords: [[0, 7, 12, 15], [1, 8, 13, 17], [-4, 3, 8, 12], [-5, 2, 7, 11]],
    bass: [0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 7, -1, 12, -1],
    melody: [12, -1, -1, -1, -1, -1, 8, -1, -1, -1, -1, -1, 7, -1, -1, -1],
    kick: [0, 6, 12], hats: [3, 9, 11, 15],
  },
  // Umbra (docs/28), recomposed 10 November: where the light goes backwards. F# at 84 BPM, chords F#, G, C and F (a
  // semitone up, the tritone, the semitone under the root), each carrying one harmonic-series tone off the twelve-note
  // grid: the 11th harmonic (+5.51), the 7th (+9.69), a pure major third (5/4, +3.86) and a pure minor third (6/5, +3.16).
  // Pitches may be fractional: the mixer plays them by rate.
  umbra: {
    title: 'Where the Light Goes Backwards', bpm: 84, root: 42,
    chords: [[0, 7, 12, 17.51], [1, 8, 13, 22.69], [-6, 1, 6, 9.86], [-1, 6, 11, 14.16]],
    bass: [0, -1, -1, -1, 0, -1, -1, 0, 0, -1, -1, -1, 0, -1, 12, -1],
    // Octave, a three-quarter-tone step above it, fifth, then the quarter-tone-flat fifth: alien steps, not semitones
    // grinding on the root (11 November: the ♭9 that stood second read as a clash).
    melody: [12, -1, -1, -1, -1, -1, 14.5, -1, -1, -1, 7, -1, -1, -1, 6.5, -1],
    kick: [0, 8], hats: [2, 6, 10, 14],
  },
};

/** A score step is a sixteenth note. Sparse openings, evolving phrases, a breakdown, then return. */
export function scoreStep(planet: PlanetId, step: number): Note[] {
  if (planet === 'amnion') return amnionStep(step);
  if (planet === 'corona') return coronaStep(step);
  if (planet === 'umbra') return umbraStep(step);
  const theme = THEMES[planet], bar = Math.floor(step / 16), beat = step % 16;
  const phrase = Math.floor(bar / 8) % 4, chordIndex = Math.floor(bar / 2) % 4;
  const chord = theme.chords[chordIndex], root = theme.root;
  const notes: Note[] = [], breakdown = phrase === 2;
  const human = planet === 'luna', bloom = planet === 'nacre', foundry = planet === 'khepri', ice = planet === 'vesper';
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
        bloom ? .18 : ice ? .12 : .105, (i - 1.5) * .16, bloom ? .6 : ice ? .55 : .45));
    }
  }
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add(foundry ? 'foundry-bass' : human || bloom ? 'round-bass' : 'bass',
    root - 12 + chord[0] + bass, foundry ? .42 : bloom ? .21 : human ? .28 : .30);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('kick', 36, bloom ? .27 : human ? .34 : ice ? .28 : .41);
  if ((beat === 4 || beat === 12) && !ice) {
    if (!breakdown && bar > 1) add(human || bloom ? 'brush' : 'snare',
      60, foundry ? .20 : bloom ? .075 : .13, 0, human ? .04 : .13);
  }
  if (theme.hats.includes(beat) && !breakdown) {
    add('hat', 60 + (beat % 4 === 2 ? 2 : 0), (beat % 4 === 2 ? .09 : .045) * (bloom ? .42 : human ? .7 : 1),
      beat % 4 < 2 ? -.24 : .24, human ? .035 : .1);
  }
  // Second half of each phrase answers the lead one octave down, without a constantly repeating top line.
  const index = bar % 4 >= 2 ? (16 - beat) % 16 : beat;
  const melody = theme.melody[index];
  if (melody >= 0 && (bar % 2 === 0 || (phrase === 1 && !ice)) && (!bloom || beat % 4 === 0)) {
    const transposition = chord[0] + (phrase === 3 ? 12 : 0);
    add(human ? 'piano' : foundry ? 'saw-lead' : bloom ? 'bloom-pad' : 'glass',
      root + melody + transposition, bloom ? .17 : foundry ? .12 : breakdown ? .105 : .14,
      Math.sin(step * .51) * .38, human ? .13 : foundry ? .12 : bloom ? .65 : ice ? .5 : .38);
  }
  if (planet === 'khepri' && beat % 6 === 3 && !breakdown) add('metal', 56 + chordIndex * 2, .075, -.3, .24);
  if (human && beat === 10 && bar % 2 === 1) add('piano', root + chord[1] + 12, .10, -.15, .14);
  return notes;
}

/** Amnion has its own instrumentation, phrasing and rhythm (its boss stem is in boss-score.ts). */
function amnionStep(step: number): Note[] {
  const theme = THEMES.amnion, bar = Math.floor(step / 16) % 32, beat = step % 16;
  const phrase = Math.floor(bar / 8), breakdown = phrase === 2;
  const chord = theme.chords[Math.floor(bar / 2) % 4], root = theme.root + chord[0];
  const notes: Note[] = [];
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, offset = 0) =>
    notes.push({ instrument, pitch, gain, pan, wet, offset });
  const bass = theme.bass[beat];
  // Open fifth plus one uneasy colour.
  if (beat === 0 && bar % 2 === 0) chord.forEach((interval, i) => add('breath-pad', theme.root + interval, .18, (i - 1) * .22, .28));
  if (bass >= 0 && (!breakdown || beat === 0)) add('bio-bass', root - 12 + bass, .27);
  // Paired, uneven heartbeats.
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('heart', 36, beat === 2 || beat === 11 ? .19 : .32);
  if (theme.hats.includes(beat) && !breakdown && (bar > 1 || beat === 6)) {
    add('bone', 60 + bar % 3, .075, beat < 8 ? -.2 : .2, .08, beat % 2 ? .018 : 0);
  }
  // The motif speaks, then leaves a bar of space. Phrase two answers it; the third strips back to a distant call.
  const index = phrase === 1 && bar % 2 ? (beat + 6) % 16 : beat;
  const melody = theme.melody[index];
  if (melody >= 0 && (bar % 2 === 0 || phrase === 1) && (!breakdown || beat === 0)) {
    add('nerve', root + melody + (phrase === 3 ? -12 : 0), .12, Math.sin(bar * 1.7 + beat) * .28, .24);
  }
  if (phrase === 3 && beat === 12 && bar % 2) add('nerve', root + 13, .08, -.2, .4);
  return notes;
}

/** Corona's harp: chord-tone indices (-1 rests) over each chord's two bars, three notes a bar on the score's 3-3-2 in
 * eighths. It rises from the root through the octave to the chord's top, then falls back, every note left to ring. */
const CORONA_HARP = [
  [0, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, 3, -1, -1, -1],
  [1, -1, -1, -1, -1, -1, 3, -1, -1, -1, -1, -1, 2, -1, -1, -1],
] as const;
/** The lament's answer in each chord's second bar: the ♭7 sinking through the ♭6 back to the fifth. */
const CORONA_ANSWER = [-1, -1, -1, -1, 10, -1, -1, -1, -1, -1, 8, -1, -1, -1, 7, -1];

/** Corona, Hymn for a Swollen Sun: the same 32-bar form as every world, built from its own material. The opening grows
 * from single harp notes, the second phrase brings the drums and the lament, the breakdown thins to the drone and one
 * harp note a bar, the return doubles the lament an octave down. */
/** The lament's note starting at a sixteenth (the motif over each chord's first bar, its answer over the second), if any. */
function coronaLament(step: number) {
  if (step < 0) return null;
  const bar = Math.floor(step / 16) % 32, beat = step % 16, phrase = Math.floor(bar / 8), full = phrase === 1 || phrase === 3;
  const line = bar % 2 === 0 ? THEMES.corona.melody[beat] : CORONA_ANSWER[beat];
  if (line < 0 || !(full || (phrase === 0 && bar >= 4 && bar % 2 === 0))) return null;
  return THEMES.corona.root + THEMES.corona.chords[Math.floor(bar / 2) % 4][0] + 12 + line;
}
/** The accompaniment gives way to the lament: while it holds a note outside the chord (its ♭6, ♭7 and fourth), a
 * tone that would grind against it (a minor second, major seventh or tritone) moves to the nearest chord tone that
 * does not. The lament's dissonance stays its own, against the harmony, not against its own harp. */
function coronaYield(step: number, pitch: number, tones: number[], root: number) {
  // The lament notes heard while this note rings: started up to twelve sixteenths before it (its octave-down double
  // in the return rings that long), or up to three after.
  const lines: number[] = [];
  for (let s = step - 12; s <= step + 3; s++) { const line = coronaLament(s); if (line !== null) lines.push(line); }
  return yieldTo(lines, pitch, tones, root);
}
/** `pitch`, or the nearest chord tone (within a fifth) that makes no minor second, major seventh or tritone with any of
 * `lines` that lie outside the chord; null if there is none. Shared by Corona's and Umbra's accompaniments. */
function yieldTo(lines: number[], pitch: number, tones: number[], root: number) {
  const interval = (a: number, b: number) => ((a - b) % 12 + 12) % 12;
  const near = (x: number, y: number) => Math.abs(x - y) < .25 || Math.abs(x - y) > 11.75;
  const outside = lines.filter(l => !tones.some(t => near(interval(l, root + t), 0)));
  const grinds = (p: number) => outside.some(l => [1, 6, 11].some(bad => Math.abs(interval(l, p) - bad) < .25));
  if (!grinds(pitch)) return pitch;
  const options = tones.flatMap(t => [-24, -12, 0, 12, 24].map(o => root + t + o)).filter(p => Math.abs(p - pitch) <= 7 && !grinds(p));
  options.sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch) || a - b);
  return options[0] ?? null;
}

function coronaStep(step: number): Note[] {
  const theme = THEMES.corona, bar = Math.floor(step / 16) % 32, beat = step % 16;
  const phrase = Math.floor(bar / 8), breakdown = phrase === 2, full = phrase === 1 || phrase === 3;
  const chord = theme.chords[Math.floor(bar / 2) % 4], root = theme.root + chord[0], tones = chord.map(c => c - chord[0]);
  const notes: Note[] = [];
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0) => notes.push({ instrument, pitch, gain, pan, wet });
  const yielding = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0) => {
    const moved = coronaYield(step, pitch, tones, root);
    if (moved !== null) add(instrument, moved, gain, pan, wet);
  };
  // The solar drone: root and octave swelling under each chord (the lament sings its sixths and fifths above it);
  // the breakdown adds the higher octave as the heat rises.
  if (step % 32 === 0) {
    add('solar', root, .2, -.15, .35); add('solar', root + 12, .11, .2, .35);
    if (breakdown) add('solar', root + 24, .07, 0, .45);
  }
  // The slow harp. The opening's first bars and the breakdown keep only each bar's first note.
  const harp = CORONA_HARP[bar % 2][beat];
  if (harp >= 0 && (beat === 0 || !(breakdown || (phrase === 0 && bar < 4)))) {
    yielding('harp', root + 12 + tones[harp], beat === 0 ? .17 : .13, (harp - 1.5) * .2, .3);
  }
  const riff = theme.bass[beat];
  if (riff >= 0 && (full || (phrase === 0 && bar >= 4) || beat === 0)) yielding('bass', root - 12 + riff, .24);
  // Sparse, heavy drums: the 3-3-2 pulse in the full phrases, a downbeat elsewhere, and a deep tom for the backbeat.
  if (theme.kick.includes(beat) && bar >= 2 && (full || beat === 0)) add('kick', 36, beat === 0 ? .38 : .3);
  if (full && (beat === 8 || (phrase === 3 && beat === 14))) add('tom', 36 + ((root % 12) + 12) % 12, beat === 8 ? .2 : .13, 0, .25);
  if (theme.hats.includes(beat) && bar >= 2 && !breakdown) add('ember', 60 + (beat % 2), beat === 11 ? .065 : .045, beat < 8 ? -.3 : .3, .1);
  // The bowed-metal shriek marks each phrase and its middle.
  if (beat === 0 && bar % 4 === 0) add('bowed', root + 31, .09, bar % 8 ? .35 : -.35, .5);
  // The lament on the higher harp: the motif over each chord's first bar, its answer over the second; the return
  // doubles it an octave down (on the harp, not held strings, so its passing notes never hang over the ostinato).
  const line = coronaLament(step);
  if (line !== null) {
    add('harp-high', line, .2, Math.sin(step * .37) * .3, .35);
    // Only its chord tones are doubled: a low passing note would ring on into the next chord's drone.
    if (phrase === 3 && tones.some(t => ((line - root - t) % 12 + 12) % 12 === 0)) add('harp-high', line - 12, .12, -Math.sin(step * .37) * .3, .3);
  }
  return notes;
}

/**
 * A reversed note that must stop on sixteenth `landing`: emitted from the step `lead` sixteenths earlier, delayed within
 * it so its hard ending falls exactly on that grid line. Null on every other step. Pure, like the rest of the score.
 */
export function landingNote(note: Omit<Note, 'offset'>, landing: number, step: number, bpm: number): Note | null {
  const seconds = INSTRUMENT_SECONDS[note.instrument] / 2 ** ((note.pitch - BASE_PITCH[note.instrument]) / 12), sixteenth = 15 / bpm;
  const lead = Math.ceil(seconds / sixteenth - 1e-9);
  return landing - step === lead ? { ...note, offset: lead * sixteenth - seconds } : null;
}
/** Furthest a landing note can be scheduled ahead: the longest reversed sample (the boss stem's low inhale, about
 * 4.8 s) at Umbra's tempo. */
export const LANDING_STEPS = 32;

/** The lament's answer in each chord's second bar on the forward obsidian bell: a neutral third (a quarter tone between
 * minor and major), then a seventh a quarter tone flat of the minor seventh. */
const UMBRA_ANSWER = [3.5, -1, -1, -1, -1, -1, -1, -1, 9.5, -1, -1, -1, -1, -1, -1, -1];

/** Umbra's lament notes starting at a sixteenth: the reversed glass and the strike under it, or the bell's answer. */
function umbraLine(step: number): number[] {
  if (step < 0) return [];
  const theme = THEMES.umbra, bar = Math.floor(step / 16) % 32, beat = step % 16, phrase = Math.floor(bar / 8);
  const full = phrase === 1 || phrase === 3, root = theme.root + theme.chords[Math.floor(bar / 2) % 4][0], out: number[] = [];
  const melody = theme.melody[beat], answer = UMBRA_ANSWER[beat];
  if (bar % 2 === 0 && melody >= 0 && (full || (phrase === 0 && bar >= 4))) out.push(root + 12 + melody, root + melody);
  if (bar % 2 === 1 && answer >= 0 && (full || (phrase === 2 && beat === 0))) out.push(root + 12 + answer);
  return out;
}

/** The reversed notes of Umbra's score that stop on sixteenth `landing`. */
const landingCache = new Map<number, Omit<Note, 'offset'>[]>();
/** Remembered: every sixteenth looks 32 ahead, so each landing would otherwise be worked out 32 times. Callers copy. */
function umbraLandings(landing: number): Omit<Note, 'offset'>[] {
  let found = landingCache.get(landing);
  if (!found) {
    if (landingCache.size > 512) landingCache.clear();
    found = umbraLandingsAt(landing); landingCache.set(landing, found);
  }
  return found;
}
function umbraLandingsAt(landing: number): Omit<Note, 'offset'>[] {
  const theme = THEMES.umbra, bar = Math.floor(landing / 16) % 32, beat = landing % 16, phrase = Math.floor(bar / 8);
  const chord = theme.chords[Math.floor(bar / 2) % 4], root = theme.root + chord[0];
  const out: Omit<Note, 'offset'>[] = [];
  // Every bar line is breathed in: root, fifth and the chord's harmonic-series tone, swelling and stopping dead on it.
  // A voice that would grind against the lament around the bar line gives way (as Corona's accompaniment does).
  if (beat === 0) {
    const gain = phrase === 2 ? .12 : .1, lines: number[] = [];
    for (let s = landing - 10; s <= landing + 1; s++) lines.push(...umbraLine(s));
    const tones = chord.map(c => c - chord[0]);
    [root + 12, root + 19, theme.root + chord[3]].forEach((pitch, i) => {
      const moved = yieldTo(lines, pitch, tones, root);
      if (moved !== null) out.push({ instrument: 'inhale', pitch: moved, gain, pan: (i - 1) * .35, wet: .45 });
    });
  }
  // The lament, on reversed glass: each note arrives out of its own backward ring.
  const melody = theme.melody[beat];
  if (bar % 2 === 0 && melody >= 0 && (phrase === 1 || phrase === 3 || (phrase === 0 && bar >= 4))) {
    out.push({ instrument: 'glint', pitch: root + 12 + melody, gain: .2, pan: Math.sin(landing * .41) * .3, wet: .4 });
  }
  return out;
}

/** Umbra, Where the Light Goes Backwards. Reversed voices land on the grid; the forward obsidian bell, the void bass and
 * the ticks keep a pulse to fly to. The opening breathes in the chords, the second phrase brings the pulse and the
 * lament, the breakdown is a line through silence (breath, one tick, a distant toll), the return adds sixteenth ticks
 * and doubles the lament an octave down. */
function umbraStep(step: number): Note[] {
  const theme = THEMES.umbra, bar = Math.floor(step / 16) % 32, beat = step % 16;
  const phrase = Math.floor(bar / 8), breakdown = phrase === 2, full = phrase === 1 || phrase === 3;
  const chord = theme.chords[Math.floor(bar / 2) % 4], root = theme.root + chord[0];
  const notes: Note[] = [];
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0) => notes.push({ instrument, pitch, gain, pan, wet });
  for (let ahead = 1; ahead <= LANDING_STEPS; ahead++) {
    for (const note of umbraLandings(step + ahead)) {
      const landed = landingNote(note, step + ahead, step, theme.bpm);
      if (landed) notes.push(landed);
    }
  }
  // Where a reversed note lands, the obsidian bell strikes under it: a backward swell into a hit.
  const melody = theme.melody[beat];
  if (bar % 2 === 0 && melody >= 0 && (full || (phrase === 0 && bar >= 4))) add('obsidian', root + melody, .1, 0, .4);
  const answer = UMBRA_ANSWER[beat];
  if (bar % 2 === 1 && answer >= 0 && (full || (breakdown && beat === 0))) {
    add('obsidian', root + 12 + answer, breakdown ? .09 : .14, beat ? .25 : -.25, .45);
    if (phrase === 3) add('obsidian', root + answer, .08, 0, .35);
  }
  // The pulse: void bass on the riff, a precise kick, off-beat ticks; sixteenth ticks in the return.
  const riff = theme.bass[beat];
  if (riff >= 0 && (full || (phrase === 0 && bar >= 2 && beat % 4 === 0) || beat === 0)) {
    const lines: number[] = [];
    for (let s = step - 4; s <= step + 1; s++) lines.push(...umbraLine(s));
    const bass = yieldTo(lines, root - 12 + riff, chord.map(c => c - chord[0]), root);
    if (bass !== null) add('void-bass', bass, beat % 4 === 0 ? .3 : .22);
  }
  if (theme.kick.includes(beat) && (full || (phrase === 0 && bar >= 4) || (breakdown && beat === 0))) add('kick', 36, .3);
  if (theme.hats.includes(beat) && (full || (phrase === 0 && bar >= 2))) add('void-tick', 60, .055, beat < 8 ? -.2 : .2, .12);
  else if (phrase === 3 && beat % 2 === 1) add('void-tick', 67, .025, beat < 8 ? .3 : -.3, .1);
  if (breakdown && beat === 8) add('void-tick', 60, .05, 0, .3);
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
