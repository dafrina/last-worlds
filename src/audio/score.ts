import type { PlanetId } from '../shared/contracts';
import { BASE_PITCH, INSTRUMENT_SECONDS, type Instrument } from './instruments';

/** One scheduled sample. `offset` delays it within its sixteenth; the boss stem (src/audio/boss-score.ts) also uses
 * `skip` (seconds into the sample: a riser trimmed to land on a downbeat), `priority` within its own voice pool and
 * `bed` (the level bed's level from this note on). `bend` slides into the note from `from` semitones away over
 * `seconds`; `duck` marks a kick that keys the sidechain (leads and basses dip by `depth`, recovering over `release`
 * seconds). The mixer adds the player's small timing and velocity variations. */
export interface Note {
  instrument: Instrument; pitch: number; gain: number; pan: number; wet: number;
  offset?: number; skip?: number; priority?: number; bed?: number;
  bend?: { from: number; seconds: number }; duck?: { depth: number; release: number };
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
  // dying star. E Phrygian (maqam Kurd) at 110 BPM, i, ♭II, ♭VI and the major V (Em, F, C, B), two bars each. Phase 4
  // gives it an Arabic colour: the lament in Kurd and, over the dominant, in Hijaz on B (CORONA_LAMENT); the harp on a
  // ten-sixteenth cycle drifting across the bar; a darbuka playing maqsum and baladi; a solar drone, ember crackle and a
  // bowed-metal shriek at the phrase marks. `melody` is the lament's first bar over Em, relative to the chord root.
  corona: {
    title: 'Hymn for a Swollen Sun', bpm: 110, root: 40,
    chords: [[0, 7, 12, 15], [1, 8, 13, 17], [-4, 3, 8, 12], [-5, 2, 7, 11]],
    bass: [0, -1, -1, -1, -1, -1, -1, -1, 12, -1, -1, -1, -1, -1, 7, -1],
    melody: [19, -1, -1, -1, -1, -1, 20, -1, -1, 19, -1, -1, 15, -1, -1, -1],
    kick: [0, 8], hats: [3, 9, 11, 15],
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
  umbra: { level: 0, boss: [.1, .2, .25] },
};
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
/** A minor second, major seventh or tritone between two pitches (as harmony.ts `clash`, which imports this module). */
const harsh = (a: number, b: number) => [1, 6, 11].some(bad => Math.abs((((a - b) % 12) + 12) % 12 - bad) < .25);
/** The nearest pitch above `pitch` whose pitch class is in `scale`: the tone a grace note leans in from. */
function above(pitch: number, scale: readonly number[]) {
  let p = Math.round(pitch) + 1;
  while (!scale.includes(((p % 12) + 12) % 12)) p++;
  return p;
}

/** Where a sixteenth sits in the shared 32-bar form: opening, developed phrase, breakdown, return. */
function form(planet: PlanetId, step: number) {
  const theme = THEMES[planet], bar = Math.floor(step / 16) % 32, beat = step % 16, phrase = Math.floor(bar / 8);
  return { theme, bar, beat, phrase, breakdown: phrase === 2, chord: theme.chords[Math.floor(bar / 2) % 4], root: theme.root };
}
/** The melody's sixteenth: the motif, and in the second half of each four bars its mirror image (an answer, not a
 * repeat). */
const melodyAt = (theme: Theme, bar: number, beat: number) => theme.melody[bar % 4 >= 2 ? (16 - beat) % 16 : beat];
function voices(notes: Note[]) {
  return (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, extra: Partial<Note> = {}) => {
    notes.push({ instrument, pitch, gain, pan, wet, ...extra });
  };
}

/** A score step is a sixteenth note. Every world has its own arrangement of the shared 32-bar form. */
export function scoreStep(planet: PlanetId, step: number): Note[] {
  switch (planet) {
    case 'luna': return lunaStep(step);
    case 'khepri': return khepriStep(step);
    case 'nacre': return nacreStep(step);
    case 'vesper': return vesperStep(step);
    case 'amnion': return amnionStep(step);
    case 'corona': return coronaStep(step);
    case 'umbra': return umbraStep(step);
  }
}

/** D mixolydian with Luna's lydian F# (pitch classes): the scale its grace notes lean from. */
const LUNA_SCALE = [2, 4, 6, 7, 9, 11, 0];
/** Luna, Far Side Signal (reworked 11 November, phase 4): lonely and human. Rolled felt-piano chords, the melody leaning
 * into its downbeats from the note above in the developed phrases, brushes and a soft snappy kick, and the far-side
 * signal itself: a distant beacon of three pings at the end of every four bars of the opening and the breakdown, and
 * once in eight bars in the return. */
function lunaStep(step: number): Note[] {
  const { theme, bar, beat, phrase, breakdown, chord, root } = form('luna', step), notes: Note[] = [];
  // Its played timing and velocity (since 20 October), plus any written delay.
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = .1, late = 0, extra: Partial<Note> = {}) => notes.push({
    instrument, pitch, gain: gain * (.93 + .07 * Math.sin(step * 2.3 + pitch)), pan, wet,
    offset: (beat % 2 ? .014 + .003 * Math.sin(step) : .003 * (1 + Math.sin(step * 1.7))) + late, ...extra });
  // The chord rolled upward, a hand spreading it, and in the developed phrases its top two tones again, later and softer.
  if (step % 32 === 0) chord.forEach((interval, i) => add('piano', root + interval, .11, (i - 1.5) * .12, .16, i * .03));
  if (step % 32 === 24 && (phrase === 1 || phrase === 3)) [chord[2], chord[3]].forEach((interval, i) => add('piano', root + interval, .06, i ? .2 : -.1, .18, i * .11));
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add('round-bass', root - 12 + chord[0] + bass, .28);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('snap-kick', 36, .38, 0, .04, 0, { duck: kickDuck('luna', SIDECHAIN.luna.level) });
  if ((beat === 4 || beat === 12) && !breakdown && bar > 1) add('brush', 60, .12, 0, .04);
  if (theme.hats.includes(beat) && !breakdown) add('hat', 60 + (beat % 4 === 2 ? 2 : 0), (beat % 4 === 2 ? .09 : .045) * .7, beat % 4 < 2 ? -.24 : .24, .035);
  const melody = melodyAt(theme, bar, beat);
  if (melody >= 0 && (bar % 2 === 0 || phrase === 1)) {
    const pitch = root + melody + chord[0] + (phrase === 3 ? 12 : 0), pan = Math.sin(step * .51) * .38;
    const grace = beat === 0 && (phrase === 1 || phrase === 3);
    if (grace) add('piano', above(pitch, LUNA_SCALE), .05, pan, .13);
    add('piano', pitch, breakdown ? .105 : .14, pan, .13, grace ? .05 : 0);
  }
  if (beat === 10 && bar % 2 === 1) add('piano', root + chord[1] + 12, .10, -.15, .14);
  const lonely = phrase === 0 || breakdown ? bar % 4 === 3 : phrase === 3 && bar % 8 === 7 && beat === 0;
  const ping = [0, 3, 6].indexOf(beat);
  if (lonely && ping >= 0) add('signal', root + [chord[1], chord[2], chord[1]][ping] + 24, [.06, .05, .07][ping], [-.45, .45, -.2][ping], .75);
  return notes;
}

/** Khepri, Foundry Afterimage (reworked phase 4): the foundry. A hard forge kick and mechanical sixteenths, the saw
 * lead and its stabs, a round bass of four ringing notes a bar, and the forge itself: a tuned anvil struck every six
 * sixteenths, turning against the bar (it meets the downbeat again every three bars), and steam let out of the press
 * at the end of every four bars. */
function khepriStep(step: number): Note[] {
  const { theme, bar, beat, phrase, breakdown, chord, root } = form('khepri', step), notes: Note[] = [], add = voices(notes);
  if (step % 32 === 0) [0, 7, 12].forEach((interval, i) => add('saw-lead', root + chord[0] + interval, .07, (i - 1) * .16, .08));
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add('foundry-bass', root - 12 + chord[0] + bass, .42, 0, .1);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('forge-kick', 36, .42, 0, .05, { duck: kickDuck('khepri', SIDECHAIN.khepri.level) });
  if ((beat === 4 || beat === 12) && !breakdown && bar > 1) add('snare', 60, .2, 0, .13);
  if (theme.hats.includes(beat) && !breakdown) add('hat', 60 + (beat % 4 === 2 ? 2 : 0), beat % 4 === 2 ? .09 : .045, beat % 4 < 2 ? -.24 : .24, .1);
  const melody = melodyAt(theme, bar, beat);
  if (melody >= 0 && (bar % 2 === 0 || phrase === 1)) add('saw-lead', root + melody + chord[0] + (phrase === 3 ? 12 : 0), .12, Math.sin(step * .51) * .38, .12);
  // The anvil: root, fifth and octave in turn, two octaves up; every other stroke in the breakdown.
  const s = step % 512, cycle = Math.floor(s / 6);
  if (s % 6 === 3 && bar >= 2 && !(breakdown && cycle % 2)) add('anvil', root + chord[0] + 24 + [0, 7, 12][cycle % 3], breakdown ? .06 : .075, cycle % 2 ? .3 : -.3, .24);
  if (bar % 4 === 3 && beat === 8 && bar >= 4) add('steam', 60, .09, bar % 8 === 3 ? -.5 : .5, .35);
  return notes;
}

/** Nacre, Dreams Beneath the Bloom (reworked phase 4): the pearl, a soft vibraphone with its motor's tremolo, sings the
 * melody over a bloom pad that now sits above the drums (its lowest tone an octave up, its low end thinned in the
 * patch), with a gentle snappy kick, brushes and hats you can hear; in the developed phrases the pearl rises through
 * the chord like bubbles at the end of every second bar. */
function nacreStep(step: number): Note[] {
  const { theme, bar, beat, phrase, breakdown, chord, root } = form('nacre', step), notes: Note[] = [], add = voices(notes);
  if (step % 32 === 0) chord.forEach((interval, i) => add('bloom-pad', root + interval + (i ? 0 : 12), .11, (i - 1.5) * .16, .6));
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add('round-bass', root - 12 + chord[0] + bass, .24, 0, .1);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('snap-kick', 36, .36, 0, .06, { duck: kickDuck('nacre', SIDECHAIN.nacre.level) });
  if ((beat === 4 || beat === 12) && !breakdown && bar > 1) add('brush', 60, .13, 0, .1);
  if (theme.hats.includes(beat) && !breakdown) add('hat', 60 + (beat % 4 === 2 ? 2 : 0), (beat % 4 === 2 ? .09 : .045) * .7, beat % 4 < 2 ? -.24 : .24, .1);
  const melody = melodyAt(theme, bar, beat);
  if (melody >= 0 && (bar % 2 === 0 || phrase === 1) && (phrase > 0 || beat % 4 === 0)) {
    add('pearl', root + melody + chord[0] + (phrase === 3 ? 12 : 0), breakdown ? .12 : .15, Math.sin(step * .51) * .38, .5);
  }
  if ((phrase === 1 || phrase === 3) && bar % 2 === 1 && beat >= 8 && beat % 2 === 0) {
    const k = (beat - 8) / 2;
    add('pearl', root + chord[k] + 12, .045, -.4 + k * .27, .6);
  }
  return notes;
}

/** Vesper, Below the Ice Line (ambient since 11 November, reworked in phase 4): triangle-clean bells an octave above the
 * written melody every second bar, each answered three sixteenths later by its own faint reflection in the developed
 * phrases; a cold frost pad, two bass notes a bar, one soft kick, and now and then the ice itself cracking somewhere
 * in the dark. */
function vesperStep(step: number): Note[] {
  const { theme, bar, beat, phrase, breakdown, chord, root } = form('vesper', step), notes: Note[] = [], add = voices(notes);
  if (step % 32 === 0) chord.forEach((interval, i) => add('frost', root + interval, .145, (i - 1.5) * .16, .6));
  const bass = theme.bass[beat];
  if (bass >= 0 && (!breakdown || beat === 0)) add('bass', root - 12 + chord[0] + bass, .3, 0, .1);
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) add('snap-kick', 36, .26, 0, .1, { duck: kickDuck('vesper', SIDECHAIN.vesper.level) });
  const bell = (s: number) => {
    if (s < 0) return null;
    const b = Math.floor(s / 16) % 32, written = melodyAt(theme, b, s % 16);
    return written >= 0 && b % 2 === 0 ? root + written + theme.chords[Math.floor(b / 2) % 4][0] + 12 : null;
  };
  const pitch = bell(step), echo = bell(step - 3);
  if (pitch !== null) add('glass', pitch, breakdown ? .125 : .15, Math.sin(step * .51) * .38, .55);
  if (echo !== null && (phrase === 1 || phrase === 3)) add('glass', echo, .045, -Math.sin((step - 3) * .51) * .5, .9);
  if (bar >= 2 && beat % 2 === 1 && scatter(step, 7) < .03) {
    add('crack', 60 + Math.round(scatter(step, 8) * 8 - 4), .05 + .03 * scatter(step, 9), (scatter(step, 10) * 2 - 1) * .7, .75);
  }
  return notes;
}

/** Amnion, Something Beneath the Skin: its own instrumentation, phrasing and rhythm (its boss stem is in
 * boss-score.ts). Phase 4: the heartbeat lands like a kick, the nerve tone slides into its notes like something alive,
 * and now and then, never on a beat you could count, something clicks and chitters out in the dark, far off in the
 * hall, sometimes answered from the other side. */
function amnionStep(step: number): Note[] {
  const theme = THEMES.amnion, bar = Math.floor(step / 16) % 32, beat = step % 16;
  const phrase = Math.floor(bar / 8), breakdown = phrase === 2;
  const chord = theme.chords[Math.floor(bar / 2) % 4], root = theme.root + chord[0];
  const notes: Note[] = [];
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, offset = 0, extra: Partial<Note> = {}) =>
    notes.push({ instrument, pitch, gain, pan, wet, offset, ...extra });
  const bass = theme.bass[beat];
  // Open fifth plus one uneasy colour.
  if (beat === 0 && bar % 2 === 0) chord.forEach((interval, i) => add('breath-pad', theme.root + interval, .18, (i - 1) * .22, .28));
  if (bass >= 0 && (!breakdown || beat === 0)) add('bio-bass', root - 12 + bass, .27);
  // Paired, uneven heartbeats; the strong beat of each pair keys the sidechain.
  if (theme.kick.includes(beat) && (!breakdown || beat === 0)) {
    const weak = beat === 2 || beat === 11;
    add('heart', 36, weak ? .19 : .32, 0, 0, 0, weak ? {} : { duck: kickDuck('amnion', SIDECHAIN.amnion.level) });
  }
  if (theme.hats.includes(beat) && !breakdown && (bar > 1 || beat === 6)) {
    add('bone', 60 + bar % 3, .075, beat < 8 ? -.2 : .2, .08, beat % 2 ? .018 : 0);
  }
  // The motif speaks, then leaves a bar of space. Phrase two answers it; the third strips back to a distant call.
  const index = phrase === 1 && bar % 2 ? (beat + 6) % 16 : beat;
  const melody = theme.melody[index], slide = { bend: { from: bar % 2 ? -1 : -.5, seconds: .09 } };
  if (melody >= 0 && (bar % 2 === 0 || phrase === 1) && (!breakdown || beat === 0)) {
    add('nerve', root + melody + (phrase === 3 ? -12 : 0), .12, Math.sin(bar * 1.7 + beat) * .28, .24, 0, slide);
  }
  if (phrase === 3 && beat === 12 && bar % 2) add('nerve', root + 13, .08, -.2, .4, 0, slide);
  // The night.
  const call = nightCall(step), heard = nightCall(step - 3);
  if (call) add(call.instrument, call.pitch, call.gain, call.pan, .9);
  if (heard && scatter(step - 3, 8) < .4) add(heard.instrument, heard.pitch + 2, heard.gain * .7, -heard.pan, .92);
  return notes;
}
/** A call in Amnion's night at this sixteenth, if any: about one in three bars (twice as many in the breakdown), never
 * on the heartbeat, a chitter or a click, pitched for different creatures and placed anywhere across the field. */
function nightCall(step: number): { instrument: Instrument; pitch: number; gain: number; pan: number } | null {
  if (step < 0) return null;
  const bar = Math.floor(step / 16) % 32, beat = step % 16;
  if (bar < 2 || THEMES.amnion.kick.includes(beat) || scatter(step, 3) >= (Math.floor(bar / 8) === 2 ? .06 : .03)) return null;
  return {
    instrument: scatter(step, 4) < .6 ? 'chitter' : 'night-click', pitch: 60 + [-5, -2, 0, 3, 7][Math.floor(scatter(step, 6) * 5)],
    gain: .06 + .04 * scatter(step, 7), pan: (scatter(step, 5) * 2 - 1) * .85,
  };
}

/**
 * Corona's lament (phase 4: "take inspiration from arabian music"), written per chord in its maqam: Kurd on E (E F G A
 * B C D) over Em, F and C, and Hijaz on B (B C D# E F# G A, with its augmented second C–D#) over the major dominant.
 * Each entry: [sixteenth within the chord's two bars, pitch, slide in from this many semitones (0: none), qanun
 * tremolo]. The first bar states, the second answers; long notes ring.
 */
type LamentNote = readonly [number, number, number?, boolean?];
const CORONA_LAMENT: readonly (readonly LamentNote[])[] = [
  // Em: up from the fifth to the ♭6 and back, a tremolo on the third, down through the fourth to the tonic.
  [[0, 71, -2], [6, 72], [9, 71], [12, 67, 0, true], [21, 69], [23, 67], [26, 64, -2]],
  // F: the third, up to the fifth and sixth, a tremolo on the third, then sinking to the root.
  [[0, 69, -2], [5, 72], [8, 74], [10, 72], [13, 69, 0, true], [24, 67], [26, 65, -1]],
  // C: the fifth, its neighbour, a tremolo on the third, then a climb back to the fifth.
  [[0, 67, -2], [4, 69], [7, 67], [10, 64, 0, true], [20, 62], [23, 64], [26, 67, -2]],
  // B, Hijaz: up through the ♭2 and the augmented second to the fourth, a tremolo on D#, then the run back down
  // (E, D#, C, B), the augmented second descending.
  [[0, 71, -2], [5, 72], [8, 75], [11, 76], [12, 75, 0, true], [20, 76], [22, 75], [24, 72], [26, 71, -1]],
];
/** The maqam's tones (pitch classes) under each chord: E Kurd, and B Hijaz over the dominant. */
const CORONA_SCALES = [[4, 5, 7, 9, 11, 0, 2], [4, 5, 7, 9, 11, 0, 2], [4, 5, 7, 9, 11, 0, 2], [11, 0, 3, 4, 6, 7, 9]];
/**
 * Corona's harp (phase 4, user: "too regularly placed on the rhythm"): plucked on a ten-sixteenth cycle, like the 10/8
 * of a sama'i thaqil, twice per cycle (at 0 and 6: 3+3, then 2+2), so it drifts across the 4/4 bar and meets the bar
 * line again only every five bars. Its tones walk the chord over four cycles; every third cycle opens with a qanun
 * tremolo, and every fourth leans into its second note with a grace from the maqam tone above.
 */
const CORONA_CYCLE = 10;
const CORONA_HARP = [[0, 2], [1, 3], [2, 1], [0, 3]] as const;
/** The darbuka's iqa'at: maqsum in the second phrase (doum, tek, -, tek, doum, -, tek, -), baladi in the return. */
const MAQSUM = { doum: [0, 8], tek: [2, 6, 12] }, BALADI = { doum: [0, 2, 8], tek: [6, 12] };

/** The lament's entry starting at a sixteenth, if it plays there: the whole lament in phrases two and four, only each
 * chord's first bar in the opening's second half, and none in the breakdown. */
function coronaLamentNote(step: number): LamentNote | null {
  if (step < 0) return null;
  const bar = Math.floor(step / 16) % 32, phrase = Math.floor(bar / 8), within = step % 32;
  if (!(phrase === 1 || phrase === 3 || (phrase === 0 && bar >= 4 && within < 16))) return null;
  return CORONA_LAMENT[Math.floor(bar / 2) % 4].find(n => n[0] === within) ?? null;
}
function coronaLament(step: number) { return coronaLamentNote(step)?.[1] ?? null; }
/** The lament notes heard around a sixteenth: started up to twelve sixteenths before it (its octave-down double in
 * the return rings that long), or up to three after. */
function coronaLines(step: number) {
  const lines: number[] = [];
  for (let s = step - 12; s <= step + 3; s++) { const line = coronaLament(s); if (line !== null) lines.push(line); }
  return lines;
}
/** The accompaniment gives way to the lament: while it holds a note outside the chord (its ♭6, ♭2, fourth or
 * seventh), a tone that would grind against it (a minor second, major seventh or tritone) moves to the nearest chord
 * tone that does not. The lament's dissonance stays its own, against the harmony, not against its own harp. */
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

/** Corona, Hymn for a Swollen Sun (phase 4): the same 32-bar form, now with an Arabic colour. The opening grows from
 * single harp notes and lone doum strokes, the second phrase brings the maqsum and the lament, the breakdown thins to
 * the drone, the drifting harp and a doum every other bar, the return plays baladi and doubles the lament an octave
 * down. */
function coronaStep(step: number): Note[] {
  const theme = THEMES.corona, bar = Math.floor(step / 16) % 32, beat = step % 16;
  const phrase = Math.floor(bar / 8), breakdown = phrase === 2, full = phrase === 1 || phrase === 3;
  const chordIndex = Math.floor(bar / 2) % 4, chord = theme.chords[chordIndex], root = theme.root + chord[0], tones = chord.map(c => c - chord[0]);
  const notes: Note[] = [];
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, offset = 0, extra: Partial<Note> = {}) =>
    notes.push({ instrument, pitch, gain, pan, wet, offset, ...extra });
  const yielding = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0) => {
    const moved = coronaYield(step, pitch, tones, root);
    if (moved !== null) add(instrument, moved, gain, pan, wet);
  };
  const thirtySecond = 7.5 / theme.bpm;
  // The solar drone: root and octave swelling under each chord; the breakdown adds the higher octave as the heat rises.
  if (step % 32 === 0) {
    add('solar', root, .2, -.15, .35); add('solar', root + 12, .11, .2, .35);
    if (breakdown) add('solar', root + 24, .07, 0, .45);
  }
  // The harp on its ten-sixteenth cycle. The opening's first bars and the breakdown keep only each cycle's first pluck.
  const s = step % 512, cycle = Math.floor(s / CORONA_CYCLE), at = s % CORONA_CYCLE, sparse = breakdown || (phrase === 0 && bar < 4);
  if ((at === 0 || (at === 6 && !sparse))) {
    const second = at === 6, k = CORONA_HARP[cycle % 4][second ? 1 : 0], pitch = coronaYield(step, root + 12 + tones[k], tones, root);
    if (pitch !== null) {
      // The grace leans in from the maqam tone just above, if that tone sits with the chord and the lament.
      const gain = second ? .13 : .16, pan = (k - 1.5) * .2, grace = above(pitch, CORONA_SCALES[chordIndex]);
      const graceful = grace - pitch <= 2 && ![...tones.map(t => root + t), ...coronaLines(step)].some(l => harsh(l, grace));
      if (!second && !sparse && cycle % 3 === 0) [1, .6, .5].forEach((g, r) => add('harp', pitch, gain * g, pan, .3, r * thirtySecond));
      else if (second && cycle % 4 === 1 && graceful) {
        add('harp', grace, gain * .45, pan, .3); add('harp', pitch, gain, pan, .3, thirtySecond);
      } else add('harp', pitch, gain, pan, .3);
    }
  }
  const riff = theme.bass[beat];
  if (riff >= 0 && (full || (phrase === 0 && bar >= 4) || beat === 0)) yielding('bass', root - 12 + riff, .24);
  // The darbuka: maqsum, then baladi in the return; lone doum strokes in the opening, one every other bar in the
  // breakdown; a soft ka before every fourth bar line. The doum keys the sidechain.
  const duck = kickDuck('corona', SIDECHAIN.corona.level), iqa = phrase === 3 ? BALADI : MAQSUM;
  if (full) {
    if (iqa.doum.includes(beat)) add('doum', 36, beat === 0 ? .42 : .34, 0, .15, 0, { duck });
    if (iqa.tek.includes(beat)) add('tek', 60, beat === 12 ? .13 : .1, beat < 8 ? -.12 : .12, .15);
    if (bar % 4 === 3 && beat >= 14) add('tek', 62, .06, .2, .15);
  } else if (phrase === 0 && bar >= 2) {
    if (beat === 0 || (bar >= 4 && beat === 8)) add('doum', 36, .36, 0, .15, 0, { duck });
    if (bar >= 4 && beat === 12) add('tek', 60, .08, .12, .15);
  } else if (breakdown && beat === 0 && bar % 2 === 0) add('doum', 36, .3, 0, .25, 0, { duck });
  if (theme.hats.includes(beat) && bar >= 2 && !breakdown) add('ember', 60 + (beat % 2), beat === 11 ? .065 : .045, beat < 8 ? -.3 : .3, .1);
  // The bowed-metal shriek marks each phrase and its middle.
  if (beat === 0 && bar % 4 === 0) add('bowed', root + 31, .09, bar % 8 ? .35 : -.35, .5);
  // The lament on the higher harp, sliding into its long notes, a qanun tremolo where it holds; the return doubles its
  // chord tones an octave down (a passing note low would ring on into the next chord's drone).
  const lament = coronaLamentNote(step);
  if (lament) {
    const [, line, slide = 0, tremolo = false] = lament, pan = Math.sin(step * .37) * .3, bend = slide ? { bend: { from: slide, seconds: .12 } } : {};
    if (tremolo) [1, .62, .5, .42].forEach((g, r) => add('harp-high', line, .2 * g, pan, .35, r * thirtySecond));
    else add('harp-high', line, .2, pan, .35, 0, bend);
    if (returnDouble(phrase, line, root, tones)) add('harp-high', line - 12, .12, -pan, .3);
  }
  return notes;
}
const returnDouble = (phrase: number, line: number, root: number, tones: number[]) =>
  phrase === 3 && tones.some(t => ((line - root - t) % 12 + 12) % 12 === 0);

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
