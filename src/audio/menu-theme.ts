import { INSTRUMENT_SECONDS, type Instrument } from './instruments';
import type { Note } from './score';

/**
 * "Last Worlds", the title theme (15 November, user: "a very recognizable, catchy and fitting to the style menu music").
 * D minor at 100 BPM, 32 bars that loop without a seam: intro (4 bars), hook (8), B section (8), the hook again, bigger
 * (8), turnaround (4).
 *
 * The hook is D, A, F, G on the game's own 3-3-2 rhythm (the lilt of Corona's drums and the fights' ostinatos): a rising
 * fifth, a falling third, a step up, then held. It is answered F–D, stated again over F and answered E–D. Under it the
 * epic minor loop i–VI–III–VII (Dm, B♭, F, C); the B section climbs over Gm, B♭, C and A, its last note the leading
 * tone C♯ falling back into the hook. The voices are the game's own: the boss strings as the pad, the round bass on the
 * hook's rhythm, the snappy kick keying the sidechain, a backbeat, Vesper's triangle bell teasing the motif in the intro
 * and the turnaround, and one voice of its own for the hook, `anthem`, a warm, dark synth brass.
 */
export const MENU_THEME = { title: 'Last Worlds', bpm: 100, root: 50, bars: 32 } as const;
const STEPS = MENU_THEME.bars * 16;

// The chords, one a bar, as offsets from D3.
const Dm = [0, 7, 12, 15], Bb = [-4, 3, 8, 12], F = [-9, -2, 3, 7], C = [-2, 5, 10, 14], Gm = [-7, 0, 5, 8], A = [-5, 2, 7, 11];
const HOOK_CHORDS = [Dm, Bb, F, C], B_CHORDS = [Gm, Bb, C, A];
/** D aeolian; over the A major chord, D harmonic minor (its C♯). Pitch classes. */
const AEOLIAN = [2, 4, 5, 7, 9, 10, 0], HARMONIC = [2, 4, 5, 7, 9, 10, 1];

type Section = 'intro' | 'hook' | 'b' | 'hook2' | 'turn';
function sectionOf(bar: number): Section {
  return bar < 4 ? 'intro' : bar < 12 ? 'hook' : bar < 20 ? 'b' : bar < 28 ? 'hook2' : 'turn';
}
const wrap = (step: number) => ((step % STEPS) + STEPS) % STEPS;

/** The chord at a sixteenth: its tones (MIDI), root and mode. */
export function menuChord(step: number) {
  const bar = Math.floor(wrap(step) / 16), chord = sectionOf(bar) === 'b' ? B_CHORDS[(bar - 12) % 4] : HOOK_CHORDS[bar % 4];
  return { tones: chord.map(c => MENU_THEME.root + c), root: MENU_THEME.root + chord[0], scale: chord === A ? HARMONIC : AEOLIAN };
}

type Entry = readonly [bar: number, sixteenth: number, pitch: number];
/** The hook, four bars. */
const HOOK: readonly Entry[] = [
  [0, 0, 62], [0, 3, 69], [0, 6, 65], [0, 8, 67],
  [1, 0, 65], [1, 6, 62],
  [2, 0, 62], [2, 3, 69], [2, 6, 65], [2, 8, 67],
  [3, 0, 64], [3, 6, 62],
];
/** Its last bar the second time through the first hook: lifting to G into the B section instead of coming home. */
const LIFT: readonly Entry[] = [[3, 0, 64], [3, 6, 67]];
/** The B section's line: eight bars of long notes, the last the leading tone over A. */
const B_LINE: readonly Entry[] = [
  [0, 0, 70], [0, 8, 69], [0, 12, 67],
  [1, 0, 65], [1, 12, 62],
  [2, 0, 64], [2, 8, 67],
  [3, 0, 69],
  [4, 0, 74],
  [5, 0, 72], [5, 8, 70],
  [6, 0, 67],
  [7, 0, 64], [7, 8, 73],
];
/** The motif teased on the bell in the intro and the turnaround (over F, an octave up). */
const TEASE: readonly Entry[] = [[0, 0, 74], [0, 3, 81], [0, 6, 77], [0, 8, 79]];

/** The lead's note starting at a sixteenth, if any. */
export function menuMelody(step: number): number | null {
  const s = wrap(step), bar = Math.floor(s / 16), beat = s % 16, section = sectionOf(bar);
  const find = (table: readonly Entry[], at: number) => table.find(([b, sixteenth]) => b === at && sixteenth === beat)?.[2] ?? null;
  if (section === 'hook' || section === 'hook2') {
    const within = bar - (section === 'hook' ? 4 : 20);
    return find(section === 'hook' && within === 7 ? LIFT : HOOK, within % 4);
  }
  return section === 'b' ? find(B_LINE, bar - 12) : null;
}

/** Every voice the theme plays: it starts only once all of them are made (never synthesized in a tap). */
export const MENU_INSTRUMENTS: readonly Instrument[] = ['strings', 'round-bass', 'snap-kick', 'snare', 'hat', 'taiko', 'spiccato',
  'riser', 'crash', 'boom', 'timpani', 'braam', 'anthem', 'glass'];

/** The theme's notes for one sixteenth (it loops every 32 bars). Pure, like the level scores. */
export function menuStep(step: number): Note[] {
  const s = wrap(step), bar = Math.floor(s / 16), beat = s % 16, section = sectionOf(bar);
  const { tones, root } = menuChord(s), notes: Note[] = [];
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, extra: Partial<Note> = {}) =>
    notes.push({ instrument, pitch, gain, pan, wet, ...extra });
  const big = section === 'hook2', hook = section === 'hook' || big, sparse = (section === 'intro' && bar >= 2) || section === 'turn';
  // The pad: the strings hold each bar's chord, a little fuller in the B section.
  if (beat === 0) tones.forEach((p, i) => add('strings', p, section === 'b' ? .07 : hook ? .06 : .05, (i - 1.5) * .25, .4));
  // The bass, between A1 and G#2: the hook's rhythm (root, root, fifth on 0, 6 and 10), long notes in the B section, the
  // root on each downbeat in the intro's second half and the turnaround.
  const bass = 33 + ((root % 12) - 9 + 12) % 12;
  if (hook && [0, 6, 10].includes(beat)) add('round-bass', beat === 10 ? bass + 7 : bass, beat === 0 ? .3 : .24);
  else if (section === 'b' && (beat === 0 || beat === 8)) add('round-bass', bass, .28);
  else if (sparse && beat === 0) add('round-bass', bass, .26);
  // The drums. In the hooks a snappy kick on the same 3-3-2, a backbeat and soft off-beat hats; half time in the B section
  // with a taiko every second bar; a kick a bar in the intro's second half and the turnaround. Each kick keys the
  // sidechain on the bass (deeper in the last hook).
  const duck = { depth: big ? .35 : .28, release: .15 };
  if (hook) {
    if ([0, 6, 10].includes(beat)) add('snap-kick', 36, beat === 0 ? .38 : .32, 0, .05, { duck });
    if (beat === 4 || beat === 12) add('snare', 60, .15, 0, .14);
    if (beat % 4 === 2) add('hat', 62, .05, beat < 8 ? -.2 : .2, .08);
  } else if (section === 'b') {
    if (beat === 0) add('snap-kick', 36, .36, 0, .05, { duck });
    if (beat === 8) add('snare', 60, .15, 0, .2);
    if (beat === 0 && bar % 2 === 0) add('taiko', 36, .26, 0, .2);
  } else if (sparse && beat === 0) add('snap-kick', 36, .3, 0, .06, { duck });
  // The B section's pulse: spiccato eighths on the chord's root and fifth.
  if (section === 'b' && beat % 2 === 0) add('spiccato', root + 12 + (beat % 4 === 2 ? 7 : 0), beat % 8 === 0 ? .07 : .05, beat % 4 ? .25 : -.25, .16);
  // Arrivals: a riser into each hook (its tone landing on D), then crash, boom and timpani on the hook's downbeat; a soft
  // braam opening the B section.
  if ((bar === 3 || bar === 19) && beat === 0) notes.push(riser(62, .12));
  if ((bar === 4 || bar === 20) && beat === 0) {
    add('crash', 60, .1, 0, .2); add('boom', bass, .22, 0, .2); add('timpani', 36 + root % 12, .26, 0, .25);
  }
  if (bar === 12 && beat === 0) add('braam', bass, .07, 0, .3);
  // The lead: the hook and the B section's line, one note at a time. In the last hook's second half the bell doubles the
  // motif an octave up; the intro and the turnaround tease the motif on the bell alone.
  const line = menuMelody(s);
  if (line !== null) add('anthem', line, big ? .17 : .15, 0, .25, { part: 'lead' });
  if (big && bar >= 24 && bar % 2 === 0 && line !== null && beat < 8) add('glass', line + 12, .035, .2, .5);
  const tease = (bar === 2 || bar === 30) ? TEASE.find(([, sixteenth]) => sixteenth === beat)?.[2] : undefined;
  if (tease !== undefined) add('glass', tease, .06, .15, .6);
  return notes;
}
/** A riser whose climbing tone lands on `pitch` exactly 16 sixteenths later (as the boss stems' risers do). */
function riser(pitch: number, gain: number): Note {
  const rate = 2 ** ((pitch - 60) / 12), span = 16 * 15 / MENU_THEME.bpm, length = INSTRUMENT_SECONDS.riser / rate;
  return { instrument: 'riser', pitch, gain, pan: 0, wet: .25, offset: Math.max(0, span - length), skip: Math.max(0, length - span) * rate };
}
