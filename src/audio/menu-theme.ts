import { clash, pitchClass, UNPITCHED } from './harmony';
import { BASE_PITCH, INSTRUMENT_SECONDS, type Instrument } from './instruments';
import { landingNote, LANDING_STEPS, type Note } from './score';

/**
 * "Last Worlds", the title theme (15 November, user: "a very recognizable, catchy and fitting to the style menu music";
 * of the first take: "too happy or melancholic, it should sound more heroic and mysterious"; of the second: "the
 * instrument sounds a bit cheap ... towards the end of the bars its a bit off"; of the polish: "melody still very
 * unfamiliar in notes ... the instrument still bit artificial"). D minor, modal, at 100 BPM with half-time weight;
 * 32 bars that loop without a seam: intro (4 bars), hook (8), B section (8), the hook again, bigger (8), turnaround (4).
 *
 * Heroic and familiar: the melody is a conventional heroic line in D natural minor, every hook bar on the call's dotted
 * rhythm (dotted quarter, eighth, half), which the bass and the kick hit with it. The call is 1-5-8 (a pickup A3, then
 * D4, A4, D5); the answer 3-2-1 (F, E, D); then rising B♭, C, D and C, D, E to the question on E; the call again; the
 * climax F, G, A; down B♭'s arpeggio (F, D, B♭); home on A, C, D. The B section moves in long notes in two-bar rhymes:
 * up G minor's arpeggio to D, the 5-6-5 turn over E♭ (B♭, C, B♭), up B♭'s arpeggio to D, and down to A, the dominant,
 * into the hook's pickup. Strong beats are tones of the chord sounding; the eighths between them are steps.
 *
 * Mysterious: the harmony carries it, not the melody. Open fifths (and B♭ with its ninth), no thirds in the chords
 * (D5 D5 B♭sus2 C5, D5 D5 B♭sus2 D5); the ♭II (E♭) in the intro, the B section and the turnaround; a reversed swell
 * (Umbra's inhaled pad) on tones common to both chords around a bar line; a cold glass shimmer, Nahara's wordless choir,
 * and the glass calling the motif from afar before the hook.
 *
 * Clean bar lines (the polish): every pitched note that would still ring into a chord it grinds against (a minor
 * second, major seventh or tritone from one of its tones) is released a quarter of a second before that bar line, so
 * its release and the hall's early reflections end on it; a short one that cannot is left out.
 *
 * The voices: the anthem lead (a horn section of three players) doubled an octave down by the string section under
 * its strong notes and soft brass stabs on its downbeats, on the lead's own bus; the boss strings as the pad; spiccato
 * strings driving in eighths and then sixteenths (grouped 3-3-2, the game's rhythm); the round bass, the snappy kick
 * keying the sidechain, taiko, a half-time snare, timpani, braams, risers, crash and boom.
 */
export const MENU_THEME = { title: 'Last Worlds', bpm: 100, root: 50, bars: 32 } as const;
/** The theme's fader level: a backdrop a little under the worlds' music (balanced for the defaults, music 75 % and
 * effects 55 %). */
export const MENU_LEVEL = .5;
const STEPS = MENU_THEME.bars * 16, SIXTEENTH = 15 / MENU_THEME.bpm;

// The chords, one a bar, voiced from D3: open fifths (root, fifth, octave) and suspended seconds (root, fifth, ninth).
const D5 = [0, 7, 12], BbSus2 = [-4, 3, 10], C5 = [-2, 5, 10], Eb5 = [1, 8, 13], G5 = [-7, 0, 5], A5 = [-5, 2, 7];
const HOOK_CHORDS = [D5, D5, BbSus2, C5, D5, D5, BbSus2, D5];
const CHORDS: readonly (readonly number[])[] = [
  D5, D5, Eb5, D5, ...HOOK_CHORDS, G5, G5, Eb5, Eb5, BbSus2, BbSus2, G5, A5, ...HOOK_CHORDS, Eb5, Eb5, BbSus2, C5,
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
/**
 * The hook, eight bars (15 November, user: "melody still very unfamiliar in notes"): a conventional heroic line in D
 * natural minor, every bar on the call's dotted rhythm (dotted quarter, eighth, half). Strong beats are tones of the
 * chord sounding (D minor, B♭, C), the eighth between them a step. A note on sixteenth 14 is the pickup into the next bar.
 *   call 1-5-8 (A3, then D, A, D) | answer 3-2-1 (F, E, D) | rising B♭, C, D | rising C, D, E (the question, on 2)
 *   call again                    | to the climax, F, G, A    | down B♭'s arpeggio, F, D, B♭ | home: A, C, D (5, 7, 8)
 */
const HOOK: readonly (readonly Entry[])[] = [
  [[0, 62], [6, 69], [8, 74]],
  [[0, 77], [6, 76], [8, 74]],
  [[0, 70], [6, 72], [8, 74]],
  [[0, 72], [6, 74], [8, 76], [14, 57]],
  [[0, 62], [6, 69], [8, 74]],
  [[0, 77], [6, 79], [8, 81]],
  [[0, 77], [6, 74], [8, 70]],
  [[0, 69], [6, 72], [8, 74]],
];
/** The B section: long notes on the hook's rhythm at half speed, in two-bar rhymes: up G minor's arpeggio to D, falling
 * back through B♭ to G; over E♭ up B♭, D to the F on the downbeat and back to D; up B♭'s arpeggio to D and down to B♭;
 * then down to A (the dominant) for the pickup into the hook. The user's own line (20 November 2026, in the melody
 * editor: bars 14-18 of the theme, 1-based). */
const B_LINE: readonly (readonly Entry[])[] = [
  [[0, 67], [12, 70]], [[0, 74], [6, 70], [8, 67]],
  [[0, 70], [12, 74]], [[0, 77], [8, 74]],
  [[0, 65], [12, 70]], [[0, 74], [8, 70]],
  [[0, 74], [12, 70]], [[0, 69], [14, 57]],
];
/** The glass calling the motif from afar before the hook (the call's 1-5-8). */
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
/** Slurred notes: in the hook, the eighth and the half note after it are bound to the note before (the calls, bars 0
 * and 4 of the hook, are tongued). */
const slurred = (bar: number, beat: number) => {
  const section = sectionOf(bar), within = bar - (section === 'hook' ? 4 : 20);
  return (section === 'hook' || section === 'hook2') && within % 4 !== 0 && (beat === 6 || beat === 8);
};
/** How the lead plays a note: how hard (its brightness, its horn resonances and its level follow), and whether it is
 * slurred (it starts past its attack). Every note starts at its pitch: no scoops or glides (they pulled the starts of
 * the notes 15 to 75 cents off). */
function phrasing(s: number, big: boolean, b: boolean): Partial<Note> & { touch: number } {
  const bar = Math.floor(s / 16), beat = s % 16;
  const touch = Math.min(1, (beat === 0 ? .9 : beat === 8 ? .72 : beat >= 12 ? .62 : .5) + (big ? .08 : 0) - (b ? .05 : 0));
  return { touch, tone: Math.round(2000 + 3600 * touch), formant: Math.round(touch * 100) / 100, ...slurred(bar, beat) ? { skip: .03 } : {} };
}

/** Every voice the theme plays: it starts only once all of them are made (never synthesized in a tap). */
export const MENU_INSTRUMENTS: readonly Instrument[] = ['strings', 'choir', 'braam', 'inhale', 'round-bass', 'snap-kick', 'taiko', 'snare',
  'tom', 'tek', 'stone-drum', 'hat', 'timpani', 'riser', 'crash', 'boom', 'spiccato', 'anthem', 'stab', 'glass'];

/** The spiccato's 3-3-2 grouping over a bar of sixteenths (which tone of the chord), and its accents. */
const GROUP = [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2], ACCENTS = new Set([0, 3, 6, 8, 11, 14]);
/** Bars whose downbeat a reversed swell breathes into (on the tones it shares with the chord before), and bars the
 * choir holds. */
const SWELLS = new Set([1, 12, 16, 29]), CHOIR = new Set([0, 2, 12, 14, 16, 18, 20, 24, 28, 30]);

/** The theme's notes for one sixteenth (it loops every 32 bars). Pure, like the level scores. */
/** A note at a sixteenth kept clear of the next chord it would grind against (`holdFor`): released before it, or null if it
 * would be too short to sound. Also the melody editor's (src/melody/model.ts), for a lead note it moves. */
export function fitted(note: Note, step: number): Note | null {
  const fit = UNPITCHED.has(note.instrument) || note.instrument === 'riser' ? undefined : holdFor(note, wrap(step));
  if (fit === null) return null;
  const hold = fit === undefined ? note.hold : note.hold === undefined ? fit : Math.min(fit, note.hold);
  return hold === undefined ? note : { ...note, hold };
}
export function menuStep(step: number): Note[] {
  const s = wrap(step), bar = Math.floor(s / 16), beat = s % 16, section = sectionOf(bar);
  const { tones: pad } = menuChord(s), notes: Note[] = [];
  // Every pitched note keeps clear of the next chord it would grind against (see `holdFor`).
  const add = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = 0, extra: Partial<Note> = {}) => {
    const note = fitted({ instrument, pitch, gain, pan, wet, ...extra }, s);
    if (note) notes.push(note);
    return note !== null;
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
  // The drums (16 November, user: "refine the drums now of the theme menu song"): a kit in its own room (the mixer's
  // kit bus, outside the lead's glue), building across the form: distant ensemble drums in the intro, the full kit in
  // the first hook, half time in the B section, the biggest in the last hook. Each kick keys the sidechain on the bass
  // and the ostinato, never the lead. The players' small timing and velocity variations come from the mixer.
  const kit = (instrument: Instrument, pitch: number, gain: number, pan = 0, wet = .2, extra: Partial<Note> = {}) =>
    add(instrument, pitch, gain, pan, wet, { kit: true, ...extra });
  const duck = { depth: big ? .35 : .3, release: .15 };
  // The kick: the snappy kick, its tail cut short so the low end stays the bass's.
  const kick = (gain: number) => kit('snap-kick', 36, gain, 0, .06, { duck, hold: .2 });
  // The backbeat: the snare's crack and rattle over a tom's body tuned to its shell, a rim's snap on top, in the room.
  const snare = (gain: number, wet = .28) => {
    kit('snare', 60, gain, 0, wet); kit('tom', 53, gain * .55, 0, wet, { hold: .16 }); kit('tek', 62, gain * .35, .1, wet * .8);
  };
  // The ensemble drums: up to three drummers 11 and 19 ms apart, a few cents apart, either side; the great processional
  // drum under the biggest.
  const ensemble = (gain: number, players: number, boom = false) => {
    kit('taiko', 36, gain, -.15, .3);
    if (players > 1) kit('taiko', 35.6, gain * .8, .3, .32, { offset: .011 });
    if (players > 2) kit('taiko', 36.4, gain * .7, -.35, .34, { offset: .019 });
    if (boom) kit('stone-drum', 36, gain * .7, 0, .35);
  };
  if (section === 'intro') {
    if ((bar === 0 || bar === 2) && beat === 0) ensemble(.12, 2);
    if (bar === 3 && beat === 0) kick(.26);
  } else if (hook) {
    if (beat === 0) kick(big ? .37 : .34);
    if (beat === 6) kick(big ? .3 : .27);
    if (big && beat === 10) kick(.27);
    if (beat === 8) snare(big ? .15 : .13);
    if (beat === 0) ensemble(big ? .2 : .17, big ? 3 : bar % 4 === 0 ? 2 : 1, big && bar % 4 === 0);
    if (big && beat === 10) ensemble(.13, 1);
    // The last hook's drive: soft off-beat hats (above the lead), a ghost snare into every other bar.
    if (big && beat % 4 === 2) kit('hat', 62, beat === 10 ? .03 : .024, beat < 8 ? -.25 : .25, .1);
    if (big && beat === 15 && bar % 2 === 1 && bar !== 27) kit('snare', 60, .035, 0, .2);
  } else if (b) {
    if (beat === 0) kick(.32);
    if (bar >= 16 && beat === 6) kick(.25);
    if (beat === 8) snare(.12, .36);
    if (beat === 0 && (bar % 2 === 0 || bar >= 16)) ensemble(.22, 2);
  } else {
    if (bar === 28 && beat === 0) { kick(.32); ensemble(.2, 3, true); }
    if (bar === 30 && beat === 0) ensemble(.12, 2);
  }
  // Fills into sections, never busy: the drummers' pickup into the B section and the turnaround, a softer one into the
  // B section's second half and the last hook's restatement, and the snare building under the roll into the last hook.
  if ((bar === 11 || bar === 27) && (beat === 12 || beat === 14)) ensemble(beat === 12 ? .13 : .17, 2);
  if ((bar === 15 || bar === 23) && beat === 14) ensemble(.11, 2);
  if (bar === 19 && beat >= 12) kit('snare', 60, .04 + (beat - 12) * .025, 0, .3);
  // Timpani: a roll in sixteenths into each hook, rising from nothing on the chord's root (each stroke damped by the
  // next), and single strokes opening the B section's halves.
  if ((bar === 3 || bar === 19) && beat >= 8) kit('timpani', drum, .05 + (beat - 8) * .022, beat % 2 ? .12 : -.12, .3, beat < 15 ? { hold: .2 } : {});
  if ((bar === 12 || bar === 16) && beat === 0) kit('timpani', drum, .22, 0, .3);
  // Cymbals land exactly on the arrivals: a swell into each hook (softer into the B section and the turnaround), two
  // crashes a third apart either side on the hooks' downbeats, single ones on the other arrivals; boom and timpani
  // under the hooks and the turnaround.
  if ((bar === 3 || bar === 19) && beat === 0) notes.push(riser(62, .12));
  if (bar === 11 && beat === 0) notes.push(riser(62, .06));
  if (bar === 27 && beat === 0) notes.push(riser(63, .06));
  if ((bar === 4 || bar === 20) && beat === 0) {
    kit('crash', 60, .1, -.3, .3); kit('crash', 57, .07, .35, .35, { offset: .006 }); kit('boom', bass, .22, 0, .25); kit('timpani', drum, .26, 0, .3);
  }
  if ((bar === 12 || bar === 16 || bar === 24) && beat === 0) kit('crash', 60, bar === 16 ? .035 : .05, bar === 24 ? .3 : -.3, .35);
  if (bar === 28 && beat === 0) {
    kit('crash', 60, .07, -.3, .35); kit('crash', 57, .045, .35, .4, { offset: .006 }); kit('boom', bass, .14, 0, .3); kit('timpani', drum, .2, 0, .3);
  }
  // The ostinato on the spiccato strings, in the chord's register, grouped 3-3-2: sixteenths building into the hook and
  // in the last hook and the B section's second half, eighths in the first hook, the B section's first half and the
  // turnaround's start.
  const tone = pad[GROUP[beat]], accent = ACCENTS.has(beat), pan = beat % 2 ? .3 : -.3;
  if (big || (b && bar >= 16) || bar === 3) add('spiccato', tone, (accent ? .055 : .032) * (bar === 3 ? (beat + 4) / 20 : 1), pan, .15);
  else if ((section === 'hook' || b || (turn && bar < 30)) && beat % 2 === 0) add('spiccato', tone, (accent ? .05 : .036) * (turn ? .7 : 1), pan, .15);
  // The lead, one note at a time, centred, on its own bus with its doublings: the string section an octave down under
  // its strong notes (its own ensemble motion from the theme's ensemble), soft brass stabs an octave down on its
  // downbeats in the hooks; the glass an octave up in the last hook's first three bars.
  const line = menuMelody(s);
  if (line !== null) {
    const { touch, ...play } = phrasing(s, big, b);
    add('anthem', line, (big ? .1 : .09) * (.75 + .3 * touch), 0, .32, { part: 'lead', lead: true, ...play });
    if (hook && beat === 0) add('stab', line - 12, big ? .05 : .04, 0, .25, { lead: true, tone: 2800 });
    // The section follows the line: each note lets go as the next melody note arrives.
    let next = 1;
    while (next < 32 && menuMelody(s + next) === null) next++;
    if ((hook && (beat === 0 || beat === 8)) || (b && beat === 0)) add('strings', line - 12, big ? .055 : b ? .05 : .045, beat === 8 ? .2 : -.2, .35, { lead: true, hold: next * SIXTEENTH - .2 });
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
/** A riser (the cymbal swell) whose climbing tone lands on `pitch` exactly 16 sixteenths later, as the boss stems'
 * risers do; on the drums' bus. */
function riser(pitch: number, gain: number): Note {
  const rate = 2 ** ((pitch - 60) / 12), span = 16 * 15 / MENU_THEME.bpm, length = INSTRUMENT_SECONDS.riser / rate;
  return { instrument: 'riser', pitch, gain, pan: 0, wet: .25, offset: Math.max(0, span - length), skip: Math.max(0, length - span) * rate, kit: true };
}
