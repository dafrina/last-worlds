import { clash, pitchClass, UNPITCHED } from './harmony';
import { BASE_PITCH, INSTRUMENT_SECONDS, type Instrument } from './instruments';
import { landingNote, LANDING_STEPS, type Note } from './score';

/**
 * "Last Worlds", the title theme (15 November, user: "a very recognizable, catchy and fitting to the style menu music";
 * of the first take: "too happy or melancholic, it should sound more heroic and mysterious"; of the second: "i like it,
 * the instrument sounds a bit cheap tho and ... towards the end of the bars its a bit off ... polish it and make it
 * proper high end"). D minor, modal, at 100 BPM with half-time weight; 32 bars that loop without a seam: intro
 * (4 bars), hook (8), B section (8), the hook again, bigger (8), turnaround (4).
 *
 * Heroic: the hook is a call, a rising fourth into the downbeat and then a fifth and a fourth up to the octave
 * (A3, then D4, A4, D5), on a dotted rhythm (dotted quarter, eighth, half) that the bass, the kick and the brass hit
 * with it. It is answered E–F–D, called again from F over B♭ and answered G–F–G over C, open on C's fifth; the second
 * time the answer comes home, G–F–D over D. The B section is the call slowed to half speed and climbing, from D, E♭,
 * F and G. Every phrase ends on the root or fifth of its chord.
 *
 * Mysterious: the harmony carries it, not the melody. Open fifths and suspended seconds, no thirds under the hook
 * (D5 D5 B♭sus2 C5, D5 D5 B♭sus2 D5); the ♭II (E♭) in the intro, the B section and the turnaround; a reversed swell
 * (Umbra's inhaled pad) on tones common to both chords around a bar line; a cold glass shimmer, Nahara's wordless choir,
 * and the glass calling the motif from afar before the hook.
 *
 * Clean bar lines (the polish): every pitched note that would still ring into a chord it grinds against (a minor
 * second, major seventh or tritone from one of its tones) is released a quarter of a second before that bar line, so
 * its release and the hall's early reflections end on it; a short one that cannot is left out.
 *
 * The voices: the anthem lead (a layered synth brass) doubled an octave down by brass stabs and, in the last hook and
 * the B section's long notes, low strings, on the lead's own bus; the boss strings as the pad; spiccato strings driving
 * in eighths and then sixteenths (grouped 3-3-2, the game's rhythm); the round bass, the snappy kick keying the
 * sidechain, taiko, a half-time snare, timpani, braams, risers, crash and boom.
 */
export const MENU_THEME = { title: 'Last Worlds', bpm: 100, root: 50, bars: 32 } as const;
/** The theme's fader level: a backdrop a little under the worlds' music (balanced for the defaults, music 75 % and
 * effects 55 %). */
export const MENU_LEVEL = .5;
const STEPS = MENU_THEME.bars * 16, SIXTEENTH = 15 / MENU_THEME.bpm;

// The chords, one a bar, voiced from D3: open fifths (root, fifth, octave) and suspended seconds (root, fifth, ninth).
const D5 = [0, 7, 12], BbSus2 = [-4, 3, 10], C5 = [-2, 5, 10], Eb5 = [1, 8, 13], GSus2 = [-7, 0, 7], G5 = [-7, 0, 5], A5 = [-5, 2, 7];
const HOOK_CHORDS = [D5, D5, BbSus2, C5, D5, D5, BbSus2, D5];
const CHORDS: readonly (readonly number[])[] = [
  D5, D5, Eb5, D5, ...HOOK_CHORDS, GSus2, GSus2, Eb5, Eb5, BbSus2, BbSus2, G5, A5, ...HOOK_CHORDS, Eb5, Eb5, BbSus2, C5,
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
/** Whether a pitch grinds against the chord at a sixteenth: not one of its tones, and a minor second, major seventh or
 * tritone from one. */
function grinds(pitch: number, step: number) {
  const tones = menuChord(step).tones.map(pitchClass), pc = pitchClass(pitch);
  return !tones.includes(pc) && tones.some(t => clash(pc, t) !== 0);
}
/** A note's release ahead of the first bar line whose chord it would grind against, while it (or its early reflections)
 * would still sound: undefined if it never would, null if it is too short to sound at all before it. */
function holdFor(note: Note, step: number): number | null | undefined {
  const start = note.offset ?? 0, rate = 2 ** ((note.pitch - BASE_PITCH[note.instrument]) / 12);
  const end = start + (INSTRUMENT_SECONDS[note.instrument] - (note.skip ?? 0)) / rate + (note.wet > 0 ? .09 : 0);
  for (let line = 16 - wrap(step) % 16; line * SIXTEENTH < end; line += 16) {
    if (!grinds(note.pitch, step + line)) continue;
    const hold = line * SIXTEENTH - .25 - start;
    return hold < .07 ? null : hold;
  }
  return undefined;
}

type Entry = readonly [sixteenth: number, pitch: number];
/** The hook, eight bars: the call and its answer, twice. A note on sixteenth 14 is the pickup into the next bar. */
const HOOK: readonly (readonly Entry[])[] = [
  [[0, 62], [6, 69], [8, 74]],
  [[0, 76], [6, 77], [8, 74], [14, 60]],
  [[0, 65], [6, 72], [8, 77]],
  [[0, 79], [6, 77], [8, 79], [14, 55]],
  [[0, 62], [6, 69], [8, 74]],
  [[0, 76], [6, 77], [8, 74], [14, 60]],
  [[0, 65], [6, 72], [8, 77]],
  [[0, 79], [6, 77], [8, 74]],
];
/** The B section: the call at half speed, climbing from D, E♭, F and G; its last note E, then the pickup into the hook. */
const B_LINE: readonly (readonly Entry[])[] = [
  [[0, 62], [12, 69]], [[0, 74]],
  [[0, 63], [12, 70]], [[0, 75]],
  [[0, 65], [12, 72]], [[0, 77]],
  [[0, 67], [12, 74]], [[0, 76], [14, 57]],
];
/** The glass calling the motif from afar before the hook. */
const TEASE: readonly Entry[] = [[0, 74], [6, 81], [8, 86]];

function leadTable(bar: number): readonly Entry[] {
  const section = sectionOf(bar);
  return section === 'hook' ? HOOK[bar - 4] : section === 'hook2' ? HOOK[bar - 20] : section === 'b' ? B_LINE[bar - 12] : bar === 3 ? [[14, 57]] : [];
}
/** The lead's note starting at a sixteenth, if any. */
export function menuMelody(step: number): number | null {
  const s = wrap(step);
  return leadTable(Math.floor(s / 16)).find(([sixteenth]) => sixteenth === s % 16)?.[1] ?? null;
}
/** Slurred notes: the answers' eighth and half note are bound to the note before (the calls are tongued). */
const slurred = (bar: number, beat: number) => (sectionOf(bar) === 'hook' || sectionOf(bar) === 'hook2') && bar % 2 === 1 && (beat === 6 || beat === 8);
/** How the lead plays a note: its slur from the note before, its scoop, how hard (its brightness and level follow). */
function phrasing(s: number, pitch: number, big: boolean, b: boolean): Partial<Note> & { touch: number } {
  const bar = Math.floor(s / 16), beat = s % 16;
  let length = 1;
  while (length < 32 && menuMelody(s + length) === null) length++;
  const touch = Math.min(1, (beat === 0 ? .9 : beat === 8 ? .72 : beat >= 12 ? .62 : .5) + (big ? .08 : 0) - (b ? .05 : 0));
  const tone = Math.round(2200 + 4400 * touch);
  if (slurred(bar, beat)) {
    let back = 1;
    while (back < 16 && menuMelody(s - back) === null) back++;
    return { touch, tone, skip: .05, bend: { from: (menuMelody(s - back) ?? pitch) - pitch, seconds: .035 } };
  }
  return { touch, tone, bend: length >= 8 ? { from: -.3, seconds: .09 } : { from: -.12, seconds: .04 } };
}

/** Every voice the theme plays: it starts only once all of them are made (never synthesized in a tap). */
export const MENU_INSTRUMENTS: readonly Instrument[] = ['strings', 'choir', 'braam', 'inhale', 'round-bass', 'snap-kick', 'taiko', 'snare',
  'timpani', 'riser', 'crash', 'boom', 'spiccato', 'anthem', 'stab', 'glass'];

/** The spiccato's 3-3-2 grouping over a bar of sixteenths (which tone of the chord), and its accents. */
const GROUP = [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2], ACCENTS = new Set([0, 3, 6, 8, 11, 14]);
/** Bars whose downbeat a reversed swell breathes into (on the tones it shares with the chord before), and bars the
 * choir holds. */
const SWELLS = new Set([1, 12, 16, 29]), CHOIR = new Set([0, 2, 12, 14, 16, 18, 20, 24, 28, 30]);

/** The theme's notes for one sixteenth (it loops every 32 bars). Pure, like the level scores. */
export function menuStep(step: number): Note[] {
  const s = wrap(step), bar = Math.floor(s / 16), beat = s % 16, section = sectionOf(bar);
  const { tones: pad } = menuChord(s), notes: Note[] = [];
  // Every pitched note keeps clear of the next chord it would grind against (see `holdFor`).
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, extra: Partial<Note> = {}) => {
    const note: Note = { instrument, pitch, gain, pan, wet, ...extra };
    const hold = UNPITCHED.has(instrument) || instrument === 'riser' ? undefined : holdFor(note, s);
    if (hold === null) return false;
    notes.push(hold === undefined ? note : { ...note, hold });
    return true;
  };
  const big = section === 'hook2', hook = section === 'hook' || big, b = section === 'b', turn = section === 'turn';
  const bass = 33 + ((pad[0] % 12) - 9 + 12) % 12, drum = 36 + pad[0] % 12;
  // Reversed swells (Umbra's inhaled pad) stopping dead on the bar line.
  for (let ahead = 1; ahead <= LANDING_STEPS; ahead++) for (const note of swells(s + ahead)) {
    const landed = landingNote(note, s + ahead, s, MENU_THEME.bpm);
    if (landed) notes.push(landed);
  }
  if (beat === 0) {
    // The pad: the boss strings, wide; the wordless choir an octave over its upper two tones; low braams on the drone
    // and the arrivals.
    pad.forEach((p, i) => add('strings', p, b ? .055 : big ? .06 : hook ? .05 : .045, (i - 1) * .45, .4));
    if (CHOIR.has(bar)) [pad[1], pad[2]].forEach((p, i) => add('choir', p + 12, b ? .05 : hook ? .04 : .045, i ? .45 : -.45, .5));
    const braam = bar === 4 || bar === 20 ? .08 : bar === 12 || bar === 16 ? .065 : bar === 0 || bar === 2 || bar === 28 ? .05 : 0;
    if (braam) add('braam', bass, braam, 0, .3);
  }
  // The bass hits the hook's rhythm (0, 6, 8), driving on in the last hook (its last eighth on the fifth, or the root
  // where the fifth would grind against the next chord); half time in the B section.
  if (hook) {
    if (beat === 0 || beat === 6 || beat === 8) add('round-bass', bass, beat === 0 ? .3 : beat === 6 ? .24 : .26);
    if (big && beat === 11) add('round-bass', bass, .2);
    if (big && beat === 14) add('round-bass', bass + 7, .2) || add('round-bass', bass, .2);
  } else if (b) {
    if (beat === 0 || beat === 8) add('round-bass', bass, beat ? .24 : .28);
    if (bar >= 16 && beat === 6) add('round-bass', bass, .22);
  } else if ((bar === 3 && (beat === 0 || beat === 8)) || (turn && beat === 0)) add('round-bass', bass, .26);
  // The drums: the snappy kick on the hook's rhythm, keying the sidechain on the bass; taiko on the downbeats; a
  // half-time snare. Distant taiko in the intro.
  const duck = { depth: big ? .35 : .3, release: .15 };
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
  // the B section's halves; crash and boom as the hook gives way to the turnaround's ♭II.
  if ((bar === 3 || bar === 19) && beat === 0) notes.push(riser(62, .12));
  if ((bar === 3 || bar === 19) && [8, 11, 13, 14, 15].includes(beat)) add('timpani', drum, .08 + (beat - 8) * .018, 0, .25);
  if ((bar === 4 || bar === 20) && beat === 0) { add('crash', 60, .1, 0, .2); add('boom', bass, .22, 0, .2); add('timpani', drum, .26, 0, .25); }
  if ((bar === 12 || bar === 16) && beat === 0) add('timpani', drum, .22, 0, .25);
  if (bar === 28 && beat === 0) { add('crash', 60, .06, 0, .3); add('boom', bass, .14, 0, .3); add('timpani', drum, .2, 0, .25); }
  // The ostinato on the spiccato strings, in the chord's register, grouped 3-3-2: sixteenths building into the hook and
  // in the last hook and the B section's second half, eighths in the first hook, the B section's first half and the
  // turnaround's start.
  const tone = pad[GROUP[beat]], accent = ACCENTS.has(beat), pan = beat % 2 ? .3 : -.3;
  if (big || (b && bar >= 16) || bar === 3) add('spiccato', tone, (accent ? .055 : .032) * (bar === 3 ? (beat + 4) / 20 : 1), pan, .15);
  else if ((section === 'hook' || b || (turn && bar < 30)) && beat % 2 === 0) add('spiccato', tone, (accent ? .05 : .036) * (turn ? .7 : 1), pan, .15);
  // The lead, one note at a time, centred, on its own bus with its doublings: brass stabs an octave down on its strong
  // notes (and the B section's), low strings an octave down under its held notes in the last hook and the B section's
  // long notes; the glass an octave up in the last hook's first three bars.
  const line = menuMelody(s);
  if (line !== null) {
    const { touch, ...play } = phrasing(s, line, big, b);
    add('anthem', line, (big ? .17 : b ? .155 : .155) * (.75 + .3 * touch), 0, .32, { part: 'lead', lead: true, ...play });
    if ((hook && (beat === 0 || beat === 8)) || (b && beat !== 14)) add('stab', line - 12, big ? .065 : .05, 0, .25, { lead: true, tone: 3200 });
    if ((big && beat === 8) || (b && beat === 0 && bar % 2 === 1)) add('strings', line - 12, big ? .045 : .05, 0, .3, { lead: true });
    if (big && bar >= 24 && bar <= 26 && (beat === 0 || beat === 8)) add('glass', line + 12, .028, beat ? .3 : -.3, .5);
  }
  // The glass: the motif called from afar before the hook, and a cold shimmer two octaves up on the chord's upper
  // tones in the intro and turnaround and over the B section's held notes.
  if (bar === 1) {
    const tease = TEASE.find(([sixteenth]) => sixteenth === beat)?.[1];
    if (tease !== undefined) add('glass', tease, .05, .25, .6);
  }
  const shimmer = section === 'intro' || turn ? bar !== 1 : b && bar % 2 === 1 && bar < 19;
  if (shimmer && beat === 2 && !b) add('glass', pad[2] + 24, .022, -.5, .7);
  if (shimmer && beat === 8) add('glass', pad[1] + 24, b ? .02 : .022, .5, .7);
  return notes;
}
/** The reversed swells landing on a sixteenth (before their landing offsets): the landing chord's tones that the chord
 * before it shares, so a swell never rises against the chord it rises through. */
function swells(landing: number): Omit<Note, 'offset'>[] {
  const s = wrap(landing), bar = Math.floor(s / 16);
  if (s % 16 !== 0 || !SWELLS.has(bar)) return [];
  const before = new Set(menuChord(s - 1).tones.map(pitchClass));
  return [...new Set(menuChord(s).tones.filter(t => before.has(pitchClass(t))).map(t => t < 55 ? t + 12 : t))]
    .map((pitch, i) => ({ instrument: 'inhale' as const, pitch, gain: .075, pan: i % 2 ? .4 : -.4, wet: .5 }));
}
/** A riser whose climbing tone lands on `pitch` exactly 16 sixteenths later (as the boss stems' risers do). */
function riser(pitch: number, gain: number): Note {
  const rate = 2 ** ((pitch - 60) / 12), span = 16 * 15 / MENU_THEME.bpm, length = INSTRUMENT_SECONDS.riser / rate;
  return { instrument: 'riser', pitch, gain, pan: 0, wet: .25, offset: Math.max(0, span - length), skip: Math.max(0, length - span) * rate };
}
