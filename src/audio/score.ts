import type { PlanetId } from '../shared/contracts';
import { BASE_PITCH, INSTRUMENT_SECONDS, type Instrument } from './instruments';

/** One scheduled sample. `offset` delays it within its sixteenth; the boss stem (src/audio/boss-score.ts) also uses
 * `skip` (seconds into the sample: a riser trimmed to land on a downbeat), `priority` within its own voice pool and
 * `bed` (the level bed's level from this note on). `bend` slides into the note from `from` semitones away over
 * `seconds`; `duck` marks a kick that keys the sidechain (leads and basses dip by `depth`, recovering over `release`
 * seconds); `part` names a monophonic line (the melody): its next note damps the one still ringing. The mixer adds the
 * player's small timing and velocity variations. */
export interface Note {
  instrument: Instrument; pitch: number; gain: number; pan: number; wet: number;
  offset?: number; skip?: number; priority?: number; bed?: number;
  bend?: { from: number; seconds: number }; duck?: { depth: number; release: number }; part?: string;
}
interface Theme {
  title: string; bpm: number; root: number; chords: readonly (readonly number[])[];
  bass: readonly number[]; melody: readonly number[]; kick: readonly number[]; hats: readonly number[];
  /** The mode under each chord (pitch classes 0-11, fractional for authored microtones): a melody written as intervals
   * over the chord's root is held to it, and the boss stem may sound only these and the chord's own tones. */
  scales: readonly (readonly number[])[];
}
/** Seven authored 32-bar arrangements. Offsets are semitones; -1 means rest, never a random note. v5 (phase 5, user:
 * "just relax the amount of notes, simpler melodies"): fewer, longer lead notes, mostly stepwise, no ornaments. */
export const THEMES: Record<PlanetId, Theme> = {
  // D mixolydian with a lydian F# over the C chord.
  luna: {
    title: 'Far Side Signal', bpm: 94, root: 50,
    chords: [[0, 7, 14, 17], [-2, 5, 12, 16], [-5, 2, 9, 12], [0, 5, 9, 14]],
    bass: [0, -1, -1, -1, -1, -1, 7, -1, 0, -1, -1, -1, -1, -1, 7, -1],
    // The rising fourth that opens it, then a step down; its mirror answers rising.
    melody: [14, -1, -1, -1, 19, -1, -1, -1, -1, -1, 17, -1, -1, -1, -1, -1],
    kick: [0, 7, 10], hats: [2, 6, 10, 14],
    scales: [[2, 4, 6, 7, 9, 11, 0], [2, 4, 6, 7, 9, 11, 0], [2, 4, 6, 7, 9, 11, 0], [2, 4, 6, 7, 9, 11, 0]],
  },
  // A minor and its dark semitone shifts: A aeolian, G# aeolian, E aeolian, G mixolydian.
  khepri: {
    title: 'Foundry Afterimage', bpm: 118, root: 45,
    chords: [[0, 7, 12, 15], [-1, 6, 11, 14], [-5, 2, 7, 10], [-2, 5, 10, 14]],
    // Root, root, fifth, octave (phase 5: the ♭7 that ended it made a tritone under the melody's major third over G).
    bass: [0, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, 7, -1, -1, 12, -1],
    // Root, third, fifth, third: the foundry's outline, four notes a bar.
    melody: [12, -1, -1, 15, -1, -1, 19, -1, -1, -1, 15, -1, -1, -1, -1, -1],
    kick: [0, 6, 8, 11], hats: [0, 2, 4, 6, 8, 10, 12, 14],
    scales: [[9, 11, 0, 2, 4, 5, 7], [8, 10, 11, 1, 3, 4, 6], [4, 6, 7, 9, 11, 0, 2], [7, 9, 11, 0, 2, 4, 5]],
  },
  // B♭ major's modes over C, E♭ and F, then C major's D dorian.
  nacre: {
    title: 'Dreams Beneath the Bloom', bpm: 106, root: 48,
    chords: [[0, 7, 14, 17], [3, 10, 17, 21], [5, 12, 19, 22], [2, 9, 16, 19]],
    bass: [0, -1, -1, -1, -1, -1, 7, -1, -1, -1, -1, 12, -1, -1, -1, -1],
    // Root, the fifth above, a step down; its mirror rises root, fourth, fifth.
    melody: [12, -1, -1, -1, 19, -1, -1, -1, -1, -1, 17, -1, -1, -1, -1, -1],
    kick: [0, 7, 10], hats: [2, 5, 8, 11, 14],
    scales: [[0, 2, 3, 5, 7, 9, 10], [10, 0, 2, 3, 5, 7, 9], [5, 7, 9, 10, 0, 2, 3], [0, 2, 4, 5, 7, 9, 11]],
  },
  // Vesper: ambient. Two bell notes every second bar; B dorian, G# aeolian, F# mixolydian, A major.
  vesper: {
    title: 'Below the Ice Line', bpm: 88, root: 47,
    chords: [[0, 7, 14, 15], [-3, 4, 11, 14], [-5, 2, 9, 12], [-2, 5, 12, 14]],
    bass: [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 7, -1, -1, -1, -1, -1],
    melody: [19, -1, -1, -1, -1, -1, -1, -1, 14, -1, -1, -1, -1, -1, -1, -1],
    kick: [0], hats: [],
    scales: [[11, 1, 2, 4, 6, 8, 9], [8, 10, 11, 1, 3, 4, 6], [6, 8, 10, 11, 1, 3, 4], [9, 11, 1, 2, 4, 6, 8]],
  },
  // Phrygian and uneasy: each mode also holds the melody's authored ♭2 and tritone over its chord root.
  amnion: {
    title: 'Something Beneath the Skin', bpm: 92, root: 43,
    chords: [[0, 7, 13], [1, 8, 12], [-5, 2, 8], [-2, 5, 12]],
    bass: [0, -1, -1, -1, -1, -1, -1, 7, -1, -1, 0, -1, -1, -1, -1, -1],
    // The root creeping up a semitone, then the tritone's fourth above it: three notes a bar.
    melody: [12, -1, -1, -1, 13, -1, -1, -1, -1, 18, -1, -1, -1, -1, -1, -1],
    kick: [0, 2, 9, 11], hats: [3, 7, 10, 14],
    scales: [[7, 8, 10, 0, 2, 3, 5, 1], [8, 10, 0, 1, 3, 5, 7, 9, 2], [2, 3, 5, 7, 9, 10, 0, 8], [5, 7, 8, 10, 0, 2, 3, 6, 11]],
  },
  // Corona (docs/37), recomposed 10 November: a hymn for a dying star. Phase 5 (user: "make it more mysterious arabic
  // inspired not so happy at times"): no chord progression any more, a drone. E and B, an open fifth with no third,
  // barely moving; its third section adds the ♭2 (F) as a colour. The lament carries the maqam: Bayati on E (E, F
  // half-sharp, G, A, B, C, D) and, over the ♭2 colour, Saba (its A♭, the diminished fourth). `melody` is the
  // lament's first bar over the drone root.
  corona: {
    title: 'Hymn for a Swollen Sun', bpm: 110, root: 40,
    chords: [[0, 7, 12, 19], [0, 7, 12, 19], [0, 7, 13, 19], [0, 7, 12, 19]],
    bass: [0, -1, -1, -1, -1, -1, -1, -1, 12, -1, -1, -1, -1, -1, 7, -1],
    melody: [24, -1, -1, -1, -1, -1, -1, -1, -1, -1, 25.5, -1, -1, -1, -1, -1],
    kick: [0, 8], hats: [3, 11],
    scales: [[4, 5.5, 7, 9, 11, 0, 2], [4, 5.5, 7, 9, 11, 0, 2], [4, 5.5, 7, 8, 11, 0, 2], [4, 5.5, 7, 9, 11, 0, 2]],
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
    // The chord tones with their harmonic-series tones, and the melody's and the bell's authored quarter-tone steps
    // over each chord root (2.5, 3.5, 6.5, 9.5).
    scales: [[6, 1, 11.51, 8.5, 0.5, 9.5, 3.5], [7, 2, 4.69, 9.5, 1.5, 10.5, 4.5], [0, 7, 3.86, 2.5, 6.5, 3.5, 9.5], [5, 0, 8.16, 7.5, 11.5, 8.5, 2.5]],
  },
  // Nahara (docs/39; user, 13 November: "now the music for this level", then "a bit too happy or melancholic. I want
  // more mystery"): The Silent Empire, a procession through ruins nobody remembers. D at 90 BPM, no progression that
  // resolves: D minor with its ninth pressed against the third (E against F), a B♭ augmented triad (whole-tone, no
  // ground under it), a chromatic leap to F♯ minor, and A suspended, the fourth never falling to the third. The horn's
  // line is written out per chord (naharaHorn), its every note a tone of the chord.
  nahara: {
    title: 'The Silent Empire', bpm: 90, root: 50,
    chords: [[0, 7, 14, 15], [-4, 0, 4, 8], [-8, -1, 7, 16], [-5, 2, 7, 12]],
    bass: [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 7, -1, -1, -1, -1, -1],
    melody: [19, -1, -1, -1, -1, -1, -1, -1, -1, -1, 14, -1, -1, -1, -1, -1],
    kick: [0, 6, 10], hats: [4, 12],
    // D aeolian; the whole-tone scale through the augmented chord; F♯ aeolian; A phrygian (its B♭ the shadow of the
    // second chord).
    scales: [[2, 4, 5, 7, 9, 10, 0], [10, 0, 2, 4, 6, 8], [6, 8, 9, 11, 1, 2, 4], [9, 10, 0, 2, 4, 5, 7]],
  },

};

/**
 * Sidechain depths (phase 4, user: "sidechain the lead synths and basses on the kicks for some more pop"): how far a
 * kick dips the keyed leads and basses (mixer.ts KEYED), in the level score and in the boss stem's modules, core and
 * overload. Clear in the fights and the driving worlds, gentle in the ambient ones, none in Umbra's frozen score.
 */
export const SIDECHAIN: Record<PlanetId, { level: number; boss: readonly [number, number, number] }> = {
  luna: { level: .25, boss: [.3, .45, .55] },
  khepri: { level: .4, boss: [.4, .5, .6] },
  nacre: { level: .12, boss: [.25, .4, .5] },
  vesper: { level: .1, boss: [.25, .4, .5] },
  amnion: { level: .2, boss: [.3, .45, .55] },
  corona: { level: .2, boss: [.3, .45, .55] },
  umbra: { level: 0, boss: [.1, .2, .25] }, nahara: { level: .2, boss: [.3, .45, .55] },
};
/** Worlds whose level score is frozen as the user approved it (11 November: "i love love love the umbra sound"): its
 * notes, its samples and the touch it is played with (mixer.ts humanize `legacy`) stay exactly as they were. */
export const FROZEN = new Set<PlanetId>(['umbra']);
/** A kick's sidechain key: `depth`, recovering over a quarter of a beat (80 to 150 ms). */
export function kickDuck(planet: PlanetId, depth: number): Note['duck'] {
  return depth > 0 ? { depth, release: Math.min(.15, Math.max(.08, 15 / THEMES[planet].bpm)) } : undefined;
}

/** A fixed value in [0, 1) for a sixteenth of the 32-bar cycle: where a score scatters something irregularly (Amnion's
 * night, Vesper's ice), it does so identically on every pass. Never a random stream. */
function scatter(step: number, salt: number) {
  let h = Math.imul((step % 512) + salt * 7919, 0x9e3779b1) ^ salt;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Where a sixteenth sits in the shared 32-bar form: opening, developed phrase, breakdown, return. */
function form(planet: PlanetId, step: number) {
  const theme = THEMES[planet], bar = Math.floor(step / 16) % 32, beat = step % 16, phrase = Math.floor(bar / 8), chordIndex = Math.floor(bar / 2) % 4;
  const chord = theme.chords[chordIndex];
  return { theme, bar, beat, phrase, breakdown: phrase === 2, chord, chordIndex, root: theme.root, scale: theme.scales[chordIndex],
    chordTones: chord.map(c => theme.root + c) };
}
/** The melody's sixteenth: the motif, and in the second half of each four bars its mirror image (an answer, not a
 * repeat). */
const melodyAt = (theme: Theme, bar: number, beat: number) => theme.melody[bar % 4 >= 2 ? (16 - beat) % 16 : beat];
/** `pitch` held to the chord's mode: itself if it is a tone of the mode or the chord, otherwise the nearest one a
 * semitone or a tone away, a chord tone first. A melody written as intervals over each chord's root then never
 * plays a fixed interval that is wrong for the chord (a minor third over a major chord). */
function inMode(pitch: number, scale: readonly number[], chordTones: readonly number[]) {
  const pc = (p: number) => ((p % 12) + 12) % 12;
  const member = (set: readonly number[], p: number) => set.some(x => Math.abs(pc(p) - pc(x)) < .01);
  if (member(scale, pitch) || member(chordTones, pitch)) return pitch;
  for (const d of [1, 2]) {
    const options = [pitch + d, pitch - d];
    const found = options.find(p => member(chordTones, p)) ?? options.find(p => member(scale, p));
    if (found !== undefined) return found;
  }
  return pitch;
}
function voices(notes: Note[]) {
  return (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, extra: Partial<Note> = {}) => {
    notes.push({ instrument, pitch, gain, pan, wet, ...extra });
  };
}
/** The melody is one part: the mixer damps its previous note as the next one starts (phase 5: no notes ringing over
 * each other). */
const MELODY_PART = { part: 'lead' } as const;

/** A score step is a sixteenth note. Every world has its own arrangement of the shared 32-bar form. */
export function scoreStep(planet: PlanetId, step: number): Note[] {
  switch (planet) {
    case 'luna': return lunaStep(step);
    case 'khepri': return khepriStep(step);
    case 'nacre': return nacreStep(step);
    case 'vesper': return vesperStep(step);
    case 'amnion': return amnionStep(step);
    case 'corona': return coronaStep(step);
    case 'nahara': return naharaStep(step);
    case 'umbra': return umbraStep(step);
  }
}

/** Luna, Far Side Signal: lonely and human. Felt-piano chords struck together, a three-note melody (the rising fourth
 * that opens it, then a step down; its mirror answers rising), brushes and a soft snappy kick, and the far-side
 * signal: a distant beacon, two pings at the end of every four bars of the opening and the breakdown, once in eight
 * bars in the return. */
function lunaStep(step: number): Note[] {
  const { theme, bar, beat, phrase, breakdown, chord, root, scale, chordTones } = form('luna', step), notes: Note[] = [];
  // Its played timing and velocity (since 20 October): every note of a step moves together.
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = .1, extra: Partial<Note> = {}) => notes.push({
    instrument, pitch, gain: gain * (.93 + .07 * Math.sin(step * 2.3 + pitch)), pan, wet,
    offset: beat % 2 ? .014 + .003 * Math.sin(step) : .003 * (1 + Math.sin(step * 1.7)), ...extra });
  if (step % 32 === 0) chord.forEach((interval, i) => add('piano', root + interval, .1, (i - 1.5) * .12, .16));
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add('round-bass', root - 12 + chord[0] + bass, .28);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('snap-kick', 36, .38, 0, .04, { duck: kickDuck('luna', SIDECHAIN.luna.level) });
  if ((beat === 4 || beat === 12) && !breakdown && bar > 1) add('brush', 60, .12, 0, .04);
  if (theme.hats.includes(beat) && !breakdown) add('hat', 60 + (beat % 4 === 2 ? 2 : 0), (beat % 4 === 2 ? .09 : .045) * .7, beat % 4 < 2 ? -.24 : .24, .035);
  const melody = melodyAt(theme, bar, beat);
  if (melody >= 0 && (bar % 2 === 0 || phrase === 1)) {
    add('piano', inMode(root + melody + chord[0] + (phrase === 3 ? 12 : 0), scale, chordTones), breakdown ? .105 : .14, Math.sin(step * .51) * .38, .13, MELODY_PART);
  }
  const lonely = phrase === 0 || breakdown ? bar % 4 === 3 : phrase === 3 && bar % 8 === 7 && beat === 0;
  if (lonely && (beat === 0 || beat === 6)) add('signal', root + (beat ? chord[2] : chord[1]) + 24, beat ? .05 : .06, beat ? .45 : -.45, .75);
  return notes;
}

/** Khepri, Foundry Afterimage: the foundry. A hard forge kick and mechanical eighths, the saw lead (four notes a bar:
 * root, third, fifth, third, in each chord's own mode) and its stabs, a round bass of four ringing notes a bar, a
 * tuned anvil on a six-sixteenth cycle that only strikes where nothing else does, and steam let out of the press at
 * the end of every four bars. */
function khepriStep(step: number): Note[] {
  const { theme, bar, beat, phrase, breakdown, chord, root, scale, chordTones } = form('khepri', step), notes: Note[] = [], add = voices(notes);
  if (step % 32 === 0) [0, 7, 12].forEach((interval, i) => add('saw-lead', root + chord[0] + interval, .07, (i - 1) * .16, .08));
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add('foundry-bass', root - 12 + chord[0] + bass, .42, 0, .1);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('forge-kick', 36, .42, 0, .05, { duck: kickDuck('khepri', SIDECHAIN.khepri.level) });
  if ((beat === 4 || beat === 12) && !breakdown && bar > 1) add('snare', 60, .2, 0, .13);
  if (theme.hats.includes(beat) && !breakdown) add('hat', 60 + (beat % 4 === 2 ? 2 : 0), beat % 4 === 2 ? .09 : .045, beat % 4 < 2 ? -.24 : .24, .1);
  const melody = melodyAt(theme, bar, beat);
  if (melody >= 0 && (bar % 2 === 0 || phrase === 1)) {
    add('saw-lead', inMode(root + melody + chord[0] + (phrase === 3 ? 12 : 0), scale, chordTones), .12, Math.sin(step * .51) * .38, .12, MELODY_PART);
  }
  // The anvil: root, fifth and octave in turn, two octaves up; never on a sixteenth something else strikes, nor in the
  // last beat of a chord (it would ring into the next).
  const s = step % 512, cycle = Math.floor(s / 6);
  if (s % 6 === 3 && bar >= 2 && step % 32 < 28 && !(breakdown && cycle % 2) && !khepriStrikes(step)) {
    add('anvil', root + chord[0] + 24 + [0, 7, 12][cycle % 3], breakdown ? .06 : .075, cycle % 2 ? .3 : -.3, .24);
  }
  if (bar % 4 === 3 && beat === 8 && bar >= 4) add('steam', 60, .09, bar % 8 === 3 ? -.5 : .5, .35);
  return notes;
}
/** Whether Khepri's score strikes something sharp on a sixteenth (kick, snare, hat, lead or stab): the anvil stays off it. */
function khepriStrikes(step: number) {
  const { theme, bar, beat, phrase, breakdown } = form('khepri', step);
  return step % 32 === 0 || (theme.kick.includes(beat) && (!breakdown || beat === 0)) || ((beat === 4 || beat === 12) && !breakdown && bar > 1)
    || (theme.hats.includes(beat) && !breakdown) || (melodyAt(theme, bar, beat) >= 0 && (bar % 2 === 0 || phrase === 1));
}

/** Nacre, Dreams Beneath the Bloom: the pearl, a soft vibraphone with its motor's tremolo, sings three notes a bar over
 * a bloom pad that sits above the drums (its lowest tone an octave up, its low end thinned in the patch), with a
 * gentle snappy kick, brushes and hats you can hear. */
function nacreStep(step: number): Note[] {
  const { theme, bar, beat, phrase, breakdown, chord, root, scale, chordTones } = form('nacre', step), notes: Note[] = [], add = voices(notes);
  if (step % 32 === 0) chord.forEach((interval, i) => add('bloom-pad', root + interval + (i ? 0 : 12), .11, (i - 1.5) * .16, .6));
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add('round-bass', root - 12 + chord[0] + bass, .24, 0, .1);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('snap-kick', 36, .36, 0, .06, { duck: kickDuck('nacre', SIDECHAIN.nacre.level) });
  if ((beat === 4 || beat === 12) && !breakdown && bar > 1) add('brush', 60, .13, 0, .1);
  if (theme.hats.includes(beat) && !breakdown) add('hat', 60 + (beat % 4 === 2 ? 2 : 0), (beat % 4 === 2 ? .09 : .045) * .7, beat % 4 < 2 ? -.24 : .24, .1);
  const melody = melodyAt(theme, bar, beat);
  if (melody >= 0 && (bar % 2 === 0 || phrase === 1) && (phrase > 0 || beat % 4 === 0)) {
    add('pearl', inMode(root + melody + chord[0] + (phrase === 3 ? 12 : 0), scale, chordTones), breakdown ? .12 : .15, Math.sin(step * .51) * .38, .5, MELODY_PART);
  }
  return notes;
}

/** Vesper, Below the Ice Line: ambient. Two triangle-clean bells an octave above the written melody every second bar,
 * left to ring into each other; a cold frost pad, two bass notes a bar, one soft kick, and now and then the ice
 * itself cracking somewhere in the dark. */
function vesperStep(step: number): Note[] {
  const { theme, bar, beat, breakdown, chord, root, scale, chordTones } = form('vesper', step), notes: Note[] = [], add = voices(notes);
  if (step % 32 === 0) chord.forEach((interval, i) => add('frost', root + interval, .145, (i - 1.5) * .16, .6));
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add('bass', root - 12 + chord[0] + bass, .3, 0, .1);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('snap-kick', 36, .26, 0, .1, { duck: kickDuck('vesper', SIDECHAIN.vesper.level) });
  const written = melodyAt(theme, bar, beat);
  if (written >= 0 && bar % 2 === 0) add('glass', inMode(root + written + chord[0] + 12, scale, chordTones), breakdown ? .125 : .15, Math.sin(step * .51) * .38, .55);
  if (bar >= 2 && beat % 2 === 1 && scatter(step, 7) < .03) {
    add('crack', 60 + Math.round(scatter(step, 8) * 8 - 4), .05 + .03 * scatter(step, 9), (scatter(step, 10) * 2 - 1) * .7, .75);
  }
  return notes;
}

/** Amnion, Something Beneath the Skin: its own instrumentation, phrasing and rhythm (its boss stem is in
 * boss-score.ts). The heartbeat lands like a kick; the nerve tone creeps a semitone and leaps to the tritone's fourth,
 * three notes a bar; and now and then, away from the melody and never on the heartbeat, something calls once in the
 * dark, far off in the hall. */
function amnionStep(step: number): Note[] {
  const theme = THEMES.amnion, bar = Math.floor(step / 16) % 32, beat = step % 16;
  const phrase = Math.floor(bar / 8), breakdown = phrase === 2;
  const chord = theme.chords[Math.floor(bar / 2) % 4], root = theme.root + chord[0];
  const notes: Note[] = [];
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, extra: Partial<Note> = {}) =>
    notes.push({ instrument, pitch, gain, pan, wet, ...extra });
  const bass = theme.bass[beat];
  // Open fifth plus one uneasy colour.
  if (beat === 0 && bar % 2 === 0) chord.forEach((interval, i) => add('breath-pad', theme.root + interval, .18, (i - 1) * .22, .28));
  if (bass >= 0 && (!breakdown || beat === 0)) add('bio-bass', root - 12 + bass, .27);
  // Paired, uneven heartbeats; the strong beat of each pair keys the sidechain.
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) {
    const weak = beat === 2 || beat === 11;
    add('heart', 36, weak ? .19 : .32, 0, 0, weak ? {} : { duck: kickDuck('amnion', SIDECHAIN.amnion.level) });
  }
  if (theme.hats.includes(beat) && !breakdown && (bar > 1 || beat === 6)) add('bone', 60 + bar % 3, .075, beat < 8 ? -.2 : .2, .08);
  const melody = amnionMelody(step);
  if (melody !== null) add('nerve', root + melody, .12, Math.sin(bar * 1.7 + beat) * .28, .24, MELODY_PART);
  const call = nightCall(step);
  if (call) add(call.instrument, call.pitch, call.gain, call.pan, .9);
  return notes;
}
/** Amnion's melody note at a sixteenth (over the chord root), if any. The motif speaks, then leaves a bar of space;
 * phrase two answers it; the breakdown keeps only its first note; the return sinks an octave. */
function amnionMelody(step: number): number | null {
  if (step < 0) return null;
  const bar = Math.floor(step / 16) % 32, beat = step % 16, phrase = Math.floor(bar / 8);
  const melody = THEMES.amnion.melody[phrase === 1 && bar % 2 ? (beat + 6) % 16 : beat];
  if (melody < 0 || !(bar % 2 === 0 || phrase === 1) || (phrase === 2 && beat !== 0)) return null;
  return melody + (phrase === 3 ? -12 : 0);
}
/** A call in Amnion's night at this sixteenth, if any: one every few bars (more in the breakdown), never on the
 * heartbeat, never within a beat of the melody, never within three beats of another call. A single click, or a short
 * chitter of a few spaced clicks, pitched for different creatures and placed anywhere across the field. */
function nightCall(step: number): { instrument: Instrument; pitch: number; gain: number; pan: number } | null {
  const candidate = (s: number) => {
    if (s < 0) return false;
    const bar = Math.floor(s / 16) % 32, beat = s % 16;
    return bar >= 2 && !THEMES.amnion.kick.includes(beat) && scatter(s, 3) < (Math.floor(bar / 8) === 2 ? .12 : .09);
  };
  if (!candidate(step)) return null;
  for (let s = step - 12; s < step; s++) if (candidate(s)) return null;
  for (let s = step - 4; s <= step + 3; s++) if (amnionMelody(s) !== null) return null;
  return {
    instrument: scatter(step, 4) < .5 ? 'chitter' : 'night-click', pitch: 60 + [-5, -2, 0, 3, 7][Math.floor(scatter(step, 6) * 5)],
    gain: .06 + .04 * scatter(step, 7), pan: (scatter(step, 5) * 2 - 1) * .85,
  };
}

/**
 * Corona's lament (phase 5, user: "more mysterious arabic inspired not so happy"): a few long notes over the drone,
 * hovering around the tonic and its half-flat second, rising and falling back without resolving. Bayati on E (E, F
 * half-sharp, G, A, B, C, D); in the third section, over the ♭2 colour, Saba's A♭. Each entry: [sixteenth within the
 * section's two bars, pitch (fractional: the mixer plays it by rate), slow slide in from this many semitones (a tone
 * of the maqam; 0: none)].
 */
type LamentNote = readonly [number, number, number?];
const CORONA_LAMENT: readonly (readonly LamentNote[])[] = [
  // Rising from the tonic through the half-flat second to the third, left open.
  [[0, 64, -2], [10, 65.5], [20, 67]],
  // Falling back past the tonic to the seventh below, unresolved.
  [[4, 65.5], [16, 64], [26, 62]],
  // Over the ♭2: Saba, the third reaching to its diminished fourth and sinking to the half-flat second.
  [[0, 67, -1.5], [8, 68], [18, 67], [26, 65.5]],
  // Hovering: the tonic, then the half-flat second leaning back into the first section.
  [[6, 64], [22, 65.5]],
];
/** The harp, plucked once on each ten-sixteenth cycle (the 10/8 of a sama'i thaqil), drifting across the 4/4 bar and
 * meeting the bar line again only every five bars; it walks the drone's tones and leaves space to ring. */
const CORONA_CYCLE = 10;
const CORONA_HARP = [0, 1, 2, 1] as const;
/** The darbuka's iqa'at: maqsum in the second phrase (doum, tek, -, tek, doum, -, tek, -), baladi in the return. */
const MAQSUM = { doum: [0, 8], tek: [2, 6, 12] }, BALADI = { doum: [0, 2, 8], tek: [6, 12] };

/** The lament's entry starting at a sixteenth, if it plays there: the whole lament in phrases two and four, only each
 * section's first bar in the opening's second half, and none in the breakdown. */
function coronaLamentNote(step: number): LamentNote | null {
  if (step < 0) return null;
  const bar = Math.floor(step / 16) % 32, phrase = Math.floor(bar / 8), within = step % 32;
  if (!(phrase === 1 || phrase === 3 || (phrase === 0 && bar >= 4 && within < 16))) return null;
  return CORONA_LAMENT[Math.floor(bar / 2) % 4].find(n => n[0] === within) ?? null;
}
function coronaLament(step: number) { return coronaLamentNote(step)?.[1] ?? null; }
/** The lament notes heard around a sixteenth: started up to twelve sixteenths before it, or up to three after. */
function coronaLines(step: number) {
  const lines: number[] = [];
  for (let s = step - 12; s <= step + 3; s++) { const line = coronaLament(s); if (line !== null) lines.push(line); }
  return lines;
}
/** The accompaniment gives way to the lament: while it holds a note outside the drone, a tone that would grind
 * against it (a minor second, major seventh or tritone) moves to the nearest drone tone that does not. */
function coronaYield(step: number, pitch: number, tones: number[], root: number) {
  return yieldTo(coronaLines(step), pitch, tones, root);
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

/** Corona, Hymn for a Swollen Sun (phase 5): a drone and a maqam instead of a chord progression. The opening grows
 * from single harp notes and lone doum strokes, the second phrase brings the maqsum and the lament, the breakdown
 * thins to the drone, the drifting harp and a doum every other bar, the return plays baladi and doubles the lament's
 * tonic an octave down. */
function coronaStep(step: number): Note[] {
  const theme = THEMES.corona, bar = Math.floor(step / 16) % 32, beat = step % 16;
  const phrase = Math.floor(bar / 8), breakdown = phrase === 2, full = phrase === 1 || phrase === 3;
  const chord = theme.chords[Math.floor(bar / 2) % 4], root = theme.root + chord[0], tones = chord.map(c => c - chord[0]);
  const notes: Note[] = [];
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, extra: Partial<Note> = {}) =>
    notes.push({ instrument, pitch, gain, pan, wet, ...extra });
  // The solar drone: root and octave swelling under each section; the breakdown adds the higher octave as the heat rises.
  if (step % 32 === 0) {
    add('solar', root, .2, -.15, .35); add('solar', root + 12, .11, .2, .35);
    if (breakdown) add('solar', root + 24, .07, 0, .45);
  }
  // The harp, once per ten-sixteenth cycle (every other cycle in the opening's first bars and the breakdown), never
  // within a sixteenth of a lament note.
  const s = step % 512, cycle = Math.floor(s / CORONA_CYCLE), sparse = breakdown || (phrase === 0 && bar < 4);
  if (s % CORONA_CYCLE === 0 && !(sparse && cycle % 2) && ![step - 1, step, step + 1].some(t => coronaLament(t) !== null)) {
    const k = CORONA_HARP[cycle % 4], pitch = coronaYield(step, root + 12 + tones[k], tones, root);
    if (pitch !== null) add('harp', pitch, k ? .13 : .16, (k - 1) * .25, .32);
  }
  const riff = theme.bass[beat];
  if (riff >= 0 && (full || (phrase === 0 && bar >= 4) || beat === 0)) {
    const moved = coronaYield(step, root - 12 + riff, tones, root);
    if (moved !== null) add('bass', moved, .24);
  }
  // The darbuka: maqsum, then baladi in the return; lone doum strokes in the opening, one every other bar in the
  // breakdown. The doum keys the sidechain.
  const duck = kickDuck('corona', SIDECHAIN.corona.level), iqa = phrase === 3 ? BALADI : MAQSUM;
  if (full) {
    if (iqa.doum.includes(beat)) add('doum', 36, beat === 0 ? .42 : .34, 0, .15, { duck });
    if (iqa.tek.includes(beat)) add('tek', 60, beat === 12 ? .13 : .1, beat < 8 ? -.12 : .12, .15);
  } else if (phrase === 0 && bar >= 2) {
    if (beat === 0 || (bar >= 4 && beat === 8)) add('doum', 36, .36, 0, .15, { duck });
    if (bar >= 4 && beat === 12) add('tek', 60, .08, .12, .15);
  } else if (breakdown && beat === 0 && bar % 2 === 0) add('doum', 36, .3, 0, .25, { duck });
  if (theme.hats.includes(beat) && bar >= 2 && !breakdown) add('ember', 60 + (beat % 2), beat === 11 ? .065 : .045, beat < 8 ? -.3 : .3, .1);
  // The bowed-metal shriek marks each phrase and its middle.
  if (beat === 0 && bar % 4 === 0) add('bowed', root + 31, .09, bar % 8 ? .35 : -.35, .5);
  // The lament on the higher harp, sliding slowly into the notes that ask for it; the return doubles its tonic an
  // octave down.
  const lament = coronaLamentNote(step);
  if (lament) {
    const [, line, slide = 0] = lament, pan = Math.sin(step * .37) * .3;
    add('harp-high', line, .2, pan, .38, { ...MELODY_PART, ...(slide ? { bend: { from: slide, seconds: .3 } } : {}) });
    if (phrase === 3 && ((line - theme.root) % 12 + 12) % 12 === 0) add('harp-high', line - 12, .12, -pan, .32);
  }
  return notes;
}

/**
 * Nahara, The Silent Empire: a procession through the ruins of a vanished empire. A wordless choir holds each chord;
 * the stone drum walks under it (one, the "and" of two, three; a ghost stroke before the bar), a sistrum shakes on the
 * backbeat; the ancient horn calls three long notes over each chord, up the augmented triad and into the suspension;
 * the conduits' crystal moves through the chord as the turquoise energy, flickering in the breakdown. The opening
 * gathers bar by bar.
 */
/** The horn's line over each chord: (sixteenth within the chord's two bars, pitch), three long notes, every one a tone
 * of its chord: down from the fifth to the ninth and its clash; up the augmented triad; down F♯ minor from its fifth;
 * and A's suspension, the fourth held where the third should be. */
const NAHARA_HORN: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 69], [10, 64], [24, 65]],
  [[0, 66], [12, 70], [24, 74]],
  [[0, 73], [10, 69], [24, 66]],
  [[0, 64], [12, 62], [24, 69]],
];
/** The horn's note on a sixteenth, or null: the whole line in the developed phrase and the return; in the opening from
 * bar 4, only the notes on each bar's downbeat; none in the breakdown but the chord's first note, an octave down. */
function naharaHorn(step: number): number | null {
  const bar = Math.floor(step / 16) % 32, phrase = Math.floor(bar / 8), within = step % 32;
  const note = NAHARA_HORN[Math.floor(bar / 2) % 4].find(([at]) => at === within);
  if (!note) return null;
  if (phrase === 0) return bar >= 4 && within % 16 === 0 ? note[1] : null;
  if (phrase === 2) return within === 0 && bar % 4 === 0 ? note[1] - 12 : null;
  return note[1];
}
function naharaStep(step: number): Note[] {
  const { theme, bar, beat, phrase, breakdown, chord, root } = form('nahara', step), notes: Note[] = [], add = voices(notes);
  const full = phrase === 1 || phrase === 3;
  // The choir on each chord, its lowest tone an octave up so it sits over the drum and the bass.
  if (step % 32 === 0) chord.forEach((interval, i) => add('choir', root + interval + (i ? 0 : 12), breakdown ? .1 : .12, (i - 1.5) * .2, .55));
  const bass = theme.bass[beat];
  // (Its second note is the chord's own tone nearest a fifth: the augmented chord's is the sharpened one.)
  const fifth = chord.map(c => c - chord[0]).reduce((best, c) => Math.abs(c - 7) < Math.abs(best - 7) ? c : best);
  if (bass >= 0 && (bar >= 2 || beat === 0) && (!breakdown || beat === 0)) add('round-bass', root - 12 + chord[0] + (bass ? fifth : 0), .26, 0, .1);
  // The stone drum: the processional from bar 2 of the opening, the whole walk in the full phrases, one stroke every
  // other bar in the breakdown. Its first stroke of the bar keys the sidechain.
  const duck = kickDuck('nahara', SIDECHAIN.nahara.level);
  if (full) {
    if (theme.kick.includes(beat)) add('stone-drum', 36, beat === 0 ? .44 : .34, 0, .14, beat === 0 ? { duck } : {});
    if (beat === 14 && bar % 2 === 1) add('stone-drum', 36, .16, 0, .14);
  } else if (phrase === 0 && bar >= 2) {
    if (beat === 0 || (bar >= 4 && beat === 10)) add('stone-drum', 36, .38, 0, .14, beat === 0 ? { duck } : {});
  } else if (breakdown && beat === 0 && bar % 2 === 0) add('stone-drum', 36, .3, 0, .22, { duck });
  // The sistrum on the backbeat; quieter shakes on the off-eighths in the return.
  if (theme.hats.includes(beat) && (full || (phrase === 0 && bar >= 4))) add('rattle', 60, .1, beat === 4 ? -.25 : .25, .12);
  if (phrase === 3 && beat % 4 === 2) add('rattle', 60, .045, beat < 8 ? .3 : -.3, .12);
  // The conduits: the chord's tones two octaves up, climbing and falling in eighths in the full phrases, a flicker of
  // sixteenths in the breakdown, a few sparks late in the opening.
  const tones = chord.map(c => root + c + 24).sort((a, b) => a - b), cycle = [0, 1, 2, 3, 2, 1, 2, 0];
  const conduit = (k: number, gain: number) => add('conduit', tones[cycle[k % 8]] - 12, gain, Math.sin(step * .7) * .5, .4);
  if (full && beat % (phrase === 3 ? 2 : 4) === 0) conduit(beat / 2, phrase === 3 ? .06 : .05);
  else if (breakdown && scatter(step, 31) < .45) conduit(step, .045);
  else if (phrase === 0 && bar >= 6 && beat % 4 === 2) conduit(beat / 2, .04);
  // The horn.
  const horn = naharaHorn(step);
  if (horn !== null) add('horn', horn, breakdown ? .09 : .13, Math.sin(step * .37) * .25, .38, MELODY_PART);
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
