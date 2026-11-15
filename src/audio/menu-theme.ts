import { INSTRUMENT_SECONDS, type Instrument } from './instruments';
import { landingNote, LANDING_STEPS, type Note } from './score';

/**
 * "Last Worlds", the title theme (15 November, user: "a very recognizable, catchy and fitting to the style menu music";
 * then, of the first take: "too happy or melancholic, it should sound more heroic and mysterious").
 * D minor, modal, at 100 BPM with half-time weight; 32 bars that loop without a seam: intro (4 bars), hook (8),
 * B section (8), the hook again, bigger (8), turnaround (4).
 *
 * Heroic: the hook is a call, a rising fourth into the downbeat and then a fifth and a fourth up to the octave
 * (A3, then D4, A4, D5), on a dotted rhythm (dotted quarter, eighth, half) that the bass, the kick and the brass hit
 * with it. It is answered E–F–D, called again from F over B♭ and answered G–F–D, which hangs on D over C: the
 * second time through, the answer lands on E♭ over E♭ instead, a Phrygian turn that never resolves within the hook.
 * The B section is the call slowed to half speed and climbing, from D, E♭, F and G.
 *
 * Mysterious: the chords are open fifths, no thirds under the hook (D5 D5 B♭5 C5, D5 D5 B♭5 E♭5); the ♭II (E♭)
 * colours the intro, the hook's end and the B section; a reversed swell (Umbra's inhaled pad) breathes into bar lines,
 * a high glass shimmer and a wordless choir (Nahara's) sit in the intro, the B section and the turnaround, and the
 * glass calls the motif from afar before the hook.
 *
 * The voices are the game's own: the anthem lead (synth brass) doubled an octave down by brass stabs and, in the last
 * hook, low strings; the boss strings as the pad; spiccato strings driving in eighths and then sixteenths (grouped
 * 3-3-2, the game's rhythm); the round bass, the snappy kick keying the sidechain, taiko, a half-time snare, timpani,
 * braams, risers, crash and boom.
 */
export const MENU_THEME = { title: 'Last Worlds', bpm: 100, root: 50, bars: 32 } as const;
/** The theme's fader level: a backdrop a little under the worlds' music (balanced for the defaults, music 75 % and
 * effects 55 %). */
export const MENU_LEVEL = .66;
const STEPS = MENU_THEME.bars * 16;

// The chords, one a bar, voiced as open fifths (root, fifth, octave) from D3: no thirds under the hook.
const D5 = [0, 7, 12], Bb5 = [-4, 3, 8], C5 = [-2, 5, 10], Eb5 = [1, 8, 13], G5 = [-7, 0, 5], Asus = [-5, 0, 7], A5 = [-5, 2, 7];
const HOOK_CHORDS = [D5, D5, Bb5, C5, D5, D5, Bb5, Eb5];
const CHORDS: readonly (readonly number[])[] = [
  D5, D5, Eb5, D5, ...HOOK_CHORDS, G5, G5, Eb5, Eb5, Bb5, Bb5, Asus, A5, ...HOOK_CHORDS, D5, D5, Bb5, C5,
];
/** D aeolian (pitch classes); over the ♭II, E♭ without D or A. */
const AEOLIAN = [2, 4, 5, 7, 9, 10, 0], FLAT_TWO = [3, 5, 7, 10, 0];

type Section = 'intro' | 'hook' | 'b' | 'hook2' | 'turn';
function sectionOf(bar: number): Section {
  return bar < 4 ? 'intro' : bar < 12 ? 'hook' : bar < 20 ? 'b' : bar < 28 ? 'hook2' : 'turn';
}
const wrap = (step: number) => ((step % STEPS) + STEPS) % STEPS;

/** The chord at a sixteenth: its tones (MIDI), root and mode. */
export function menuChord(step: number) {
  const chord = CHORDS[Math.floor(wrap(step) / 16)];
  return { tones: chord.map(c => MENU_THEME.root + c), root: MENU_THEME.root + chord[0], scale: chord === Eb5 ? FLAT_TWO : AEOLIAN };
}

type Entry = readonly [sixteenth: number, pitch: number];
/** The hook, eight bars: the call and its answer, twice. A note on sixteenth 14 is the pickup into the next bar. */
const HOOK: readonly (readonly Entry[])[] = [
  [[0, 62], [6, 69], [8, 74]],
  [[0, 76], [6, 77], [8, 74], [14, 60]],
  [[0, 65], [6, 72], [8, 77]],
  [[0, 79], [6, 77], [8, 74], [14, 57]],
  [[0, 62], [6, 69], [8, 74]],
  [[0, 76], [6, 77], [8, 74], [14, 60]],
  [[0, 65], [6, 72], [8, 77]],
  [[0, 79], [6, 77], [8, 75]],
];
/** The B section: the call at half speed, climbing from D, E♭, F and G; its last note E, then the pickup into the hook. */
const B_LINE: readonly (readonly Entry[])[] = [
  [[0, 62], [12, 69]], [[0, 74]],
  [[0, 63], [12, 70]], [[0, 75]],
  [[0, 65], [12, 72]], [[0, 77]],
  [[0, 67], [12, 74]], [[0, 76], [14, 57]],
];
/** The glass calling the motif from afar (intro and turnaround). */
const TEASE: readonly Entry[] = [[0, 74], [6, 81], [8, 86]];

/** The lead's note starting at a sixteenth, if any. */
export function menuMelody(step: number): number | null {
  const s = wrap(step), bar = Math.floor(s / 16), beat = s % 16, section = sectionOf(bar);
  const table = section === 'hook' ? HOOK[bar - 4] : section === 'hook2' ? HOOK[bar - 20] : section === 'b' ? B_LINE[bar - 12]
    : bar === 3 ? [[14, 57]] as const : [];
  return table.find(([sixteenth]) => sixteenth === beat)?.[1] ?? null;
}

/** Every voice the theme plays: it starts only once all of them are made (never synthesized in a tap). */
export const MENU_INSTRUMENTS: readonly Instrument[] = ['strings', 'choir', 'braam', 'inhale', 'round-bass', 'snap-kick', 'taiko', 'snare',
  'timpani', 'riser', 'crash', 'boom', 'spiccato', 'anthem', 'stab', 'glass'];

/** The spiccato's 3-3-2 grouping over a bar of sixteenths (which tone of the open fifth), and its accents. */
const GROUP = [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2], ACCENTS = new Set([0, 3, 6, 8, 11, 14]);
/** Bars whose downbeat a reversed swell breathes into, and bars the choir holds. */
const SWELLS = new Set([0, 2, 12, 16, 28]), CHOIR = new Set([0, 2, 12, 14, 16, 18, 20, 24, 28, 30]);

/** The theme's notes for one sixteenth (it loops every 32 bars). Pure, like the level scores. */
export function menuStep(step: number): Note[] {
  const s = wrap(step), bar = Math.floor(s / 16), beat = s % 16, section = sectionOf(bar);
  const { tones: pad } = menuChord(s), notes: Note[] = [];
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, extra: Partial<Note> = {}) =>
    notes.push({ instrument, pitch, gain, pan, wet, ...extra });
  const big = section === 'hook2', hook = section === 'hook' || big, b = section === 'b', turn = section === 'turn';
  const bass = 33 + ((pad[0] % 12) - 9 + 12) % 12, drum = 36 + pad[0] % 12;
  // Reversed swells (Umbra's inhaled pad) on the fifth and octave of the chord they land on, stopping dead on the bar line.
  for (let ahead = 1; ahead <= LANDING_STEPS; ahead++) for (const note of swells(s + ahead)) {
    const landed = landingNote(note, s + ahead, s, MENU_THEME.bpm);
    if (landed) notes.push(landed);
  }
  if (beat === 0) {
    // The pad: open fifths on the boss strings; the wordless choir an octave over its fifth and octave; low braams on
    // the drone and the arrivals.
    pad.forEach((p, i) => add('strings', p, b ? .055 : big ? .06 : hook ? .05 : .045, (i - 1) * .3, .4));
    if (CHOIR.has(bar)) [pad[1], pad[2]].forEach((p, i) => add('choir', p + 12, b ? .05 : hook ? .04 : .045, i ? .3 : -.3, .5));
    const braam = bar === 4 || bar === 20 ? .08 : bar === 12 || bar === 16 ? .065 : bar === 0 || bar === 2 || bar === 28 ? .05 : 0;
    if (braam) add('braam', bass, braam, 0, .3);
  }
  // The bass hits the hook's rhythm (0, 6, 8), driving on in the last hook; half time in the B section.
  if (hook) {
    if (beat === 0 || beat === 6 || beat === 8) add('round-bass', bass, beat === 0 ? .3 : beat === 6 ? .24 : .26);
    if (big && beat === 11) add('round-bass', bass, .2);
    if (big && beat === 14) add('round-bass', bass + 7, .2);
  } else if (b) {
    if (beat === 0 || beat === 8) add('round-bass', bass, beat ? .24 : .28);
    if (bar >= 16 && beat === 6) add('round-bass', bass, .22);
  } else if ((bar === 3 && (beat === 0 || beat === 8)) || (turn && beat === 0)) add('round-bass', bass, .26);
  // The drums: the snappy kick on the hook's rhythm, keying the sidechain on the bass; taiko on the downbeats; a
  // half-time snare. Distant taiko in the intro.
  const duck = { depth: big ? .35 : .28, release: .15 };
  if (hook) {
    if (beat === 0 || beat === 6 || (big && beat === 10)) add('snap-kick', 36, beat === 0 ? .36 : .3, 0, .05, { duck });
    if (beat === 0) add('taiko', 36, .2, 0, .2);
    if (big && beat === 10) add('taiko', 36, .15, 0, .2);
    if (beat === 8) add('snare', 60, .15, 0, .16);
    if ((bar === 11 || bar === 27) && (beat === 12 || beat === 14)) add('taiko', 36, beat === 12 ? .14 : .18, 0, .2);
  } else if (b) {
    if (beat === 0 || (bar >= 16 && beat === 6)) add('snap-kick', 36, beat ? .28 : .34, 0, .05, { duck });
    if (beat === 0 && (bar % 2 === 0 || bar >= 16)) add('taiko', 36, .24, 0, .2);
    if (beat === 8) add('snare', 60, .14, 0, .2);
  } else if (beat === 0) {
    if (bar === 3 || bar === 28) add('snap-kick', 36, bar === 28 ? .32 : .28, 0, .06, { duck });
    if (bar === 0 || bar === 2 || bar === 30) add('taiko', 36, .13, 0, .3);
    if (bar === 28) add('taiko', 36, .2, 0, .2);
  }
  // Arrivals: a riser and a timpani roll into each hook, crash, boom, braam and timpani on its downbeat; timpani opening
  // the B section's halves; crash and boom as the turnaround resolves the ♭II.
  if ((bar === 3 || bar === 19) && beat === 0) notes.push(riser(62, .12));
  if ((bar === 3 || bar === 19) && [8, 11, 13, 14, 15].includes(beat)) add('timpani', drum, .08 + (beat - 8) * .018, 0, .25);
  if ((bar === 4 || bar === 20) && beat === 0) { add('crash', 60, .1, 0, .2); add('boom', bass, .22, 0, .2); add('timpani', drum, .26, 0, .25); }
  if ((bar === 12 || bar === 16) && beat === 0) add('timpani', drum, .22, 0, .25);
  if (bar === 28 && beat === 0) { add('crash', 60, .06, 0, .3); add('boom', bass, .14, 0, .3); add('timpani', drum, .2, 0, .25); }
  // The ostinato on the spiccato strings, in the open fifth's register, grouped 3-3-2: sixteenths building into the
  // hook and in the last hook and the B section's second half, eighths in the first hook, the B section's first half
  // and the turnaround's start.
  const tone = pad[GROUP[beat]], accent = ACCENTS.has(beat), pan = beat % 2 ? .25 : -.25;
  if (big || (b && bar >= 16) || bar === 3) add('spiccato', tone, (accent ? .055 : .032) * (bar === 3 ? (beat + 4) / 20 : 1), pan, .15);
  else if ((section === 'hook' || b || (turn && bar < 30)) && beat % 2 === 0) add('spiccato', tone, (accent ? .05 : .036) * (turn ? .7 : 1), pan, .15);
  // The lead, one note at a time; brass stabs double its strong notes an octave down (and the B section's long ones);
  // in the last hook the low strings double its held notes, and the glass its first three bars' an octave up.
  const line = menuMelody(s);
  if (line !== null) {
    add('anthem', line, big ? .17 : b ? .14 : .15, 0, .25, { part: 'lead' });
    if ((hook && (beat === 0 || beat === 8)) || (b && beat !== 14)) add('stab', line - 12, big ? .07 : .055, 0, .25);
    if (big && beat === 8 && bar !== 27) add('strings', line - 12, .045, 0, .3);
    if (big && bar >= 24 && bar <= 26 && (beat === 0 || beat === 8)) add('glass', line + 12, .028, .2, .5);
  }
  // The glass: the motif called from afar before the hook and in the turnaround, and a cold shimmer on the fifth and
  // octave two octaves up in the intro and turnaround and over the B section's held notes.
  if (bar === 1 || bar === 29) {
    const tease = TEASE.find(([sixteenth]) => sixteenth === beat)?.[1];
    if (tease !== undefined) add('glass', tease, bar === 1 ? .05 : .045, .15, .6);
  }
  const shimmer = section === 'intro' || turn ? bar !== 1 && bar !== 29 : b && bar % 2 === 1 && bar < 19;
  if (shimmer && beat === 2 && !b) add('glass', pad[2] + 24, .022, -.3, .7);
  if (shimmer && beat === 8 && bar !== 2) add('glass', pad[1] + 24, b ? .02 : .022, .3, .7);
  return notes;
}
/** The reversed swells landing on a sixteenth (before their landing offsets). */
function swells(landing: number): Omit<Note, 'offset'>[] {
  const s = wrap(landing), bar = Math.floor(s / 16);
  if (s % 16 !== 0 || !SWELLS.has(bar)) return [];
  const { tones } = menuChord(s);
  return [tones[1], tones[2]].map((pitch, i) => ({ instrument: 'inhale' as const, pitch, gain: .075, pan: i ? .35 : -.35, wet: .5 }));
}
/** A riser whose climbing tone lands on `pitch` exactly 16 sixteenths later (as the boss stems' risers do). */
function riser(pitch: number, gain: number): Note {
  const rate = 2 ** ((pitch - 60) / 12), span = 16 * 15 / MENU_THEME.bpm, length = INSTRUMENT_SECONDS.riser / rate;
  return { instrument: 'riser', pitch, gain, pan: 0, wet: .25, offset: Math.max(0, span - length), skip: Math.max(0, length - span) * rate };
}
