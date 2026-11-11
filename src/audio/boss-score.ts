import type { BossState, PlanetId } from '../shared/contracts';
import { INSTRUMENT_SECONDS, type Instrument } from './instruments';
import { consonantWith, REVERSED, soundingSteps, steady, UNPITCHED } from './harmony';
import { kickDuck, LANDING_STEPS, landingNote, SIDECHAIN, THEMES, type Note } from './score';

/**
 * Boss music (11 November revision: cinematic, not a drum machine). The level score plays on, unchanged, on its own
 * sixteenth-note clock; an additive stem on that same clock and harmony changes arrangement with the fight. Its voices
 * are a synthesized orchestra: ensemble drums, tuned timpani, spiccato strings, brass, sustained strings and clean,
 * round basses. No kick on every beat, no hi-hats or claps, and nothing pumps the score.
 *   0 flight    the level score alone
 *   1 modules   (arrival and batteries) entrance stinger; a few heavy drum hits, a low spiccato pulse on the beat, the
 *               bass on the half bar, timpani on each chord, low strings for tension, a quiet braam on each phrase
 *   2 core      a sixteenth spiccato ostinato through the chord with 3-3-2 accents, the bass in eighths, a fuller drum
 *               pattern, a brass chord and timpani on each chord change, sustained strings, snare rolls only as fills
 *   3 overload  the ostinato doubled an octave up over low sixteenths, the bass in short eighths, driving drums in 3-3-2,
 *               syncopated brass, braam, boom and crash on the phrases, timpani rolls and a riser into each phrase; its
 *               own phase-change stinger
 * Every change lands on the grid (bar, beat or half bar) and the score is never restarted.
 */
export type BossStage = 0 | 1 | 2 | 3;
export const BOSS_STAGES = ['flight', 'modules', 'core', 'overload'] as const;
export function bossStage(phase: BossState['phase'] | null | undefined): BossStage {
  return phase === 'arrival' || phase === 'batteries' ? 1 : phase === 'core' ? 2 : phase === 'overload' ? 3 : 0;
}

/** Each world's boss voices. Its identity carries into the fight through these and the level score above them. */
interface Kit {
  /** The ensemble drum (Amnion's is its heartbeat) and its sixteenths in modules, core and overload. */
  drum: Instrument;
  hits: readonly [readonly number[], readonly number[], readonly number[]];
  /** The fills' drum: brushes for the played and the soft worlds, a snare elsewhere. */
  snare: Instrument;
  /** Bass voices for modules (long notes), core (plucked eighths) and overload (short eighths); all clean and round. */
  dark: Instrument; drive: Instrument; growl: Instrument;
  /** Signature percussion and its sixteenths in modules, core and overload. */
  colour?: { instrument: Instrument; steps: readonly [readonly number[], readonly number[], readonly number[]] };
  /** Spacious worlds (Vesper, Umbra): the modules pulse in half notes and the core ostinato in eighths. */
  half?: boolean;
  /** Luna's played timing and velocity. */
  human?: boolean;
  /** Drum weight. */
  weight: number;
  /** The whole stem's level. */
  level?: number;
  /** The ostinato's register above the chord root: an octave, or two for the icy and the precise worlds. */
  lift: 12 | 24;
  /** Umbra: inhaled chords that stop dead on the stem's chord changes (modules), every bar line (core), and in overload
   * also reversed glass sucking into every beat through the chord's harmonic-series tone. */
  reversed?: boolean;
}
const KITS: Record<PlanetId, Kit> = {
  // Played warmth: brushes for the fills, a rounded bass throughout.
  luna: { drum: 'taiko', hits: [[0, 10], [0, 6, 8, 14], [0, 3, 6, 8, 11, 14]], snare: 'brush',
    dark: 'round-bass', drive: 'drive-bass', growl: 'drive-bass', human: true, weight: .85, lift: 12 },
  // The foundry: its tuned anvil on the off-beats, the heaviest drums.
  khepri: { drum: 'taiko', hits: [[0, 7, 10], [0, 3, 6, 8, 11], [0, 3, 6, 8, 10, 11, 14]], snare: 'snare',
    dark: 'foundry-bass', drive: 'drive-bass', growl: 'growl',
    colour: { instrument: 'anvil', steps: [[11], [7, 15], [3, 11]] }, weight: 1.1, lift: 12 },
  // Soft bloom: brushes, the round bass, light drums.
  nacre: { drum: 'taiko', hits: [[0, 11], [0, 6, 8, 11], [0, 3, 6, 8, 11, 14]], snare: 'brush',
    dark: 'round-bass', drive: 'round-bass', growl: 'drive-bass', weight: .7, lift: 12 },
  // Ice: a spacious half-time pulse until overload breaks into sixteenths; a high, glassy ostinato.
  vesper: { drum: 'taiko', hits: [[0], [0, 10], [0, 3, 6, 8, 11, 14]], snare: 'snare',
    dark: 'bass', drive: 'drive-bass', growl: 'growl', half: true, weight: .95, lift: 24 },
  // Flesh: paired heartbeats that race in overload, bone ticks.
  amnion: { drum: 'heart', hits: [[0, 2, 9, 11], [0, 2, 6, 9, 11, 14], [0, 1, 6, 7, 11, 12]], snare: 'snare',
    dark: 'bio-bass', drive: 'bio-bass', growl: 'growl',
    colour: { instrument: 'bone', steps: [[7, 14], [3, 7, 10, 14], [2, 3, 7, 10, 14, 15]] }, weight: 1, lift: 12 },
  // The dying star: the score's darbuka, doum strokes where the maqsum puts them and its tek between.
  corona: { drum: 'doum', hits: [[0, 8], [0, 8, 10], [0, 3, 8, 10, 14]], snare: 'snare',
    dark: 'bass', drive: 'drive-bass', growl: 'growl',
    colour: { instrument: 'tek', steps: [[12], [2, 6, 12], [2, 6, 12, 13, 15]] }, weight: 1.05, lift: 12 },
  // The void: precise ticks, the void bass, a half-time pulse, a high exact ostinato, and reversed swells that suck
  // into the grid (see `reversed`).
  umbra: { drum: 'taiko', hits: [[0, 8], [0, 6, 8, 14], [0, 3, 6, 8, 10, 12, 14]], snare: 'snare',
    dark: 'void-bass', drive: 'void-bass', growl: 'drive-bass',
    colour: { instrument: 'void-tick', steps: [[4, 12], [4, 12], [4, 8, 12]] }, half: true, weight: .9, lift: 24, reversed: true },
};

/** Priorities inside the boss voice pool: stingers, then drums and bass, sustained strings, the ostinato, ticks. */
const P = { tick: -1, pulse: 0, strings: 1, core: 2, stinger: 3 } as const;
/** The level score's level under each stage: it steps back a little as the stem takes the weight, so the fight grows
 * without growing much louder. Applied on each bar line and on each stinger's hit. */
export const BED = [1, 1, .94, .84] as const;
/** The ostinato: chord-tone indices in groups of 3, 3 and 2 sixteenths, twice a bar, each group from the root. */
const OSTINATO = [0, 1, 2, 0, 1, 2, 0, 2, 0, 1, 2, 0, 1, 3, 2, 1] as const;
const ACCENTS = [0, 3, 6, 8, 11, 14];

/** The chord in force at a sixteenth, as the level score plays it. */
function harmony(planet: PlanetId, step: number) {
  const theme = THEMES[planet], chord = theme.chords[Math.floor(step / 32) % 4];
  const root = theme.root + chord[0], tones = chord.map(c => c - chord[0]);
  // The chord's first tone that is not an octave of its root: usually the fifth; Umbra's fourth or tritone.
  const colour = tones.find(t => t % 12 !== 0)! % 12;
  // Three-note chords (Amnion) take their second tone an octave up as the fourth.
  const tone = (k: number) => tones[k] ?? tones[k - 2] + 12;
  return { theme, chord, root, bass: root - 12, tones, tone, colour, tom: 36 + ((root % 12) + 12) % 12 };
}

function writer(planet: PlanetId, step: number, notes: Note[]) {
  const { human, level = 1 } = KITS[planet], beat = step % 16;
  return (instrument: Instrument, written: number, gain: number, pan = 0, extra: Partial<Note> = {}) => {
    // Never against the melody: a tone that would make a minor second, major seventh or tritone with the melody note
    // heard now becomes the nearest chord tone that does not, or is left out (harmony.ts).
    // The melody heard as it strikes, and any passing note arriving in the next two sixteenths while it is still loud;
    // a passing note arriving later over a held stem chord tone is the melody's own motion over the harmony.
    const ahead = Math.min(2, soundingSteps(planet, { instrument, pitch: written - 12, gain, pan, wet: 0, ...extra }) - 1);
    const consonant = UNPITCHED.has(instrument) ? written : consonantWith(planet, step, written, ahead);
    if (consonant === null) return;
    // And never a wrong note as the chord changes under it: a tone still heard after the change belongs to both chords
    // (a reversed voice belongs to the chord it lands on, and is placed by its own writer).
    const pitch = UNPITCHED.has(instrument) || REVERSED.has(instrument) ? consonant
      : steady(planet, step, consonant, soundingSteps(planet, { instrument, pitch: consonant, gain, pan, wet: 0, ...extra }));
    // A tone moved for the chord change must still sit with the melody, or it is left out.
    if (pitch === null || (pitch !== consonant && consonantWith(planet, step, pitch, ahead) !== pitch)) return;
    // Luna keeps the score's played timing and velocity in the stem too.
    const offset = human ? (beat % 2 ? .014 + .003 * Math.sin(step) : .003 * (1 + Math.sin(step * 1.7))) : 0;
    const velocity = (human ? .93 + .07 * Math.sin(step * 2.3 + pitch) : 1) * level;
    notes.push({ instrument, pitch, gain: gain * velocity, pan, wet: 0, offset, ...extra });
  };
}

/** The stem's notes for one sixteenth in a stage (no stingers; see BossArranger). */
export function bossStep(planet: PlanetId, step: number, stage: BossStage): Note[] {
  if (stage === 0) return [];
  const notes = stageStep(planet, step, stage);
  if (KITS[planet].reversed) notes.push(...reversedStep(planet, step, stage));
  if (step % 16 === 0 && notes.length) notes[0].bed = BED[stage];
  return notes;
}

/** Umbra's reversed boss voices, emitted ahead so that each stops exactly on its landing sixteenth. */
function reversedStep(planet: PlanetId, step: number, stage: 1 | 2 | 3): Note[] {
  const notes: Note[] = [], bpm = THEMES[planet].bpm;
  for (let ahead = 1; ahead <= LANDING_STEPS; ahead++) {
    const landing = step + ahead, beat = landing % 16;
    const { theme, chord, root } = harmony(planet, landing);
    const candidates: Omit<Note, 'offset'>[] = [];
    if (beat === 0 && (stage > 1 || landing % 32 === 0)) {
      // An octave under the score's own inhaled chords: darker, slower, longer.
      [root, root + 7, theme.root + chord[3] - 12].forEach((pitch, i) => candidates.push({ instrument: 'inhale', pitch, gain: .07 + .015 * stage, pan: (i - 1) * .4, wet: .3, priority: P.strings }));
    }
    if (stage === 3 && beat % 4 === 0) {
      const tone = [0, 7, 12, chord[3] - chord[0]][beat / 4];
      candidates.push({ instrument: 'glint', pitch: root + 12 + tone, gain: .09, pan: (beat / 4 - 1.5) * .3, wet: .3, priority: P.pulse });
    }
    for (const note of candidates) {
      const pitch = consonantWith(planet, landing, note.pitch, 1, 2);
      const landed = pitch === null ? null : landingNote({ ...note, pitch }, landing, step, bpm);
      if (landed) notes.push(landed);
    }
  }
  return notes;
}

function stageStep(planet: PlanetId, step: number, stage: 1 | 2 | 3): Note[] {
  const kit = KITS[planet], { theme, chord, root, bass, tone, colour, tom } = harmony(planet, step);
  const bar = Math.floor(step / 16), beat = step % 16, w = kit.weight;
  const breakdown = Math.floor(bar / 8) % 4 === 2, chordStart = step % 32 === 0, phraseEnd = bar % 8 === 7;
  const riff = theme.bass[beat], notes: Note[] = [], add = writer(planet, step, notes);
  // Where the level kick already lands, the boss drum layers under it instead of doubling its level.
  const layered = theme.kick.includes(beat) && !breakdown ? .75 : 1;
  const lift = theme.root < 46 ? 12 : 0, accent = ACCENTS.includes(beat);
  const strings = (voicing: readonly number[], gain: number) => voicing.forEach((pitch, i) =>
    add('strings', pitch, gain, (i - (voicing.length - 1) / 2) * .3, { wet: .35, priority: P.strings }));
  const sidechain = SIDECHAIN[planet].boss[stage - 1];
  const drum = (hits: readonly number[], gain: number) => {
    if (!hits.includes(beat)) return;
    // The strongest strokes (each half bar's first, and in overload the 3-3-2 accents) carry the fights' kick under
    // them (phase 4: "snappier kicks, especially for the boss fights"), and it keys the sidechain; a lighter stroke
    // keys it less.
    const strong = beat % 8 === 0 || (stage === 3 && ACCENTS.includes(beat));
    add(kit.drum, 36, (beat === 0 ? gain * 1.15 : gain) * w * layered, beat % 8 < 4 ? -.08 : .08,
      { wet: .18, priority: P.core, ...(strong ? {} : { duck: kickDuck(planet, sidechain * .6) }) });
    if (strong) add('boss-kick', 36, (beat === 0 ? .44 : .38) * w * layered, 0, { wet: .06, priority: P.core, duck: kickDuck(planet, sidechain) });
  };
  const ticks = (steps: readonly number[] | undefined, gain: number) => {
    if (!kit.colour || !steps?.includes(beat)) return;
    // A tuned colour (Khepri's anvil) strikes chord tones two octaves up; the others are unpitched.
    const pitched = !UNPITCHED.has(kit.colour.instrument);
    add(kit.colour.instrument, pitched ? root + 24 + tone(steps.indexOf(beat) % 3) : 55 + chord[0], gain, beat < 8 ? -.3 : .3,
      { wet: pitched ? .22 : .12, priority: P.tick });
  };
  const timpani = (gain: number) => add('timpani', tom, gain * w, 0, { wet: .25, priority: P.core });
  // The ostinato's sixteenth: the chord tone of its 3-3-2 group, swinging gently across the stereo field.
  const ostinato = (octave: number, gain: number, pan: number) => add('spiccato', root + kit.lift + tone(OSTINATO[beat]) + octave,
    (accent ? 1.4 : 1) * gain, pan, { wet: .16, priority: P.pulse });
  const fill = (gain: number) => {
    // Into each phrase: toms down the chord, and a snare swelling to the bar line under them on the off-beats (phase 5:
    // one stroke a sixteenth, no thirty-second doubling).
    if (!phraseEnd || beat < 12) return;
    add('tom', tom + [colour + 12, 12, colour, 0][beat - 12], gain + .03 * (beat - 12), (beat - 13.5) * .2, { wet: .12, priority: P.core });
    if (beat % 2) add(kit.snare, 60, (.05 + .025 * (beat - 12)) * w, 0, { wet: .15, priority: P.pulse });
  };

  if (stage === 1) {
    // Long bass notes on the half bar (and where the riff lands on a beat), under the score's own bass.
    if (beat === 0 || beat === 8 || (riff >= 0 && beat % 4 === 0)) add(kit.dark, bass + (riff >= 0 ? riff : 0), beat === 0 ? .32 : .26, 0, { priority: P.core });
    drum(kit.hits[0], .34);
    // The low spiccato pulse on the beat (half notes in the spacious worlds), the root under the chord.
    if (kit.half ? beat % 8 === 0 : beat % 4 === 0) add('spiccato', root + lift, beat === 0 ? .13 : .1, beat % 8 ? .2 : -.2, { wet: .2, priority: P.pulse });
    ticks(kit.colour?.steps[0], .06);
    if (chordStart) {
      timpani(.3);
      // Low strings hold the root and its colour tone under the chord: tension, not melody.
      strings([root + lift, root + lift + colour], .07);
    }
    if (bar % 8 === 0 && beat === 0) add('braam', bass, .06, 0, { wet: .35, priority: P.strings });
    fill(.14);
    return notes;
  }

  if (stage === 2) {
    // The bass in plucked eighths on the riff, the root otherwise, the octave at the end of each half bar.
    if (beat % 2 === 0 || riff >= 0) add(kit.drive, bass + (riff >= 0 ? riff : beat % 8 === 6 ? 12 : 0), beat % 4 === 0 ? .32 : .26, 0, { priority: P.core });
    drum(kit.hits[breakdown ? 0 : 1], .36);
    if (!kit.half || beat % 2 === 0) ostinato(0, .09, ACCENTS.indexOf(beat) % 2 ? .25 : -.25);
    ticks(kit.colour?.steps[1], .065);
    if (chordStart) {
      // A brass chord and the timpani on each chord change, sustained strings under the ostinato.
      [0, colour, 12].forEach((t, i) => add('stab', root + 12 + t, .1, (i - 1) * .35, { wet: .22, priority: P.core }));
      timpani(.32);
      strings(chord.slice(0, 3).map(c => theme.root + c + lift), .075);
    }
    // A short snare pickup every fourth bar, a full fill into each phrase.
    if (bar % 4 === 3 && !phraseEnd && beat >= 14) add(kit.snare, 60, (.05 + (beat - 14) * .025) * w, 0, { wet: .15, priority: P.pulse });
    fill(.15);
    return notes;
  }

  // Overload. The bass in short eighths: the riff, root, octave leaps and the chord's colour tone.
  if (beat % 2 === 0 || riff >= 0) {
    const leap = [0, 0, 12, 0, 0, colour, 12, 0][Math.floor(beat / 2)];
    add(kit.growl, bass + (riff >= 0 ? riff : leap), beat % 4 === 0 ? .33 : .28, 0, { priority: P.core });
  }
  drum(kit.hits[2], .38);
  // The ostinato doubled an octave up, over low spiccato sixteenths on the root.
  ostinato(0, .085, -.22);
  ostinato(12, .05, .3);
  add('spiccato', root + lift, accent ? .11 : .07, 0, { wet: .12, priority: P.pulse });
  ticks(kit.colour?.steps[2], .07);
  // Heavier accents: brass, boom and timpani on every chord change, syncopated brass, a crash and a braam on each phrase.
  const stab = (gain: number) => [0, colour, 12].forEach((t, i) => add('stab', root + 12 + t, gain, (i - 1) * .35, { wet: .22, priority: P.core }));
  if (chordStart) { stab(.13); add('boom', bass, .2, 0, { wet: .2, priority: P.core }); timpani(.34); }
  if (bar % 2 === 0 && (beat === 3 || beat === 6 || beat === 10)) stab(.09);
  if (bar % 8 === 0 && beat === 0) {
    add('crash', 60, .11, 0, { wet: .2, priority: P.strings });
    add('braam', bass, .1, 0, { wet: .3, priority: P.strings });
  }
  // Brighter strings: the chord with its top voice an octave up.
  if (chordStart) strings(chord.slice(0, 3).map((c, i) => theme.root + c + lift + (i === 2 ? 12 : 0)), .075);
  // A timpani roll building through the last half bar of each phrase, a riser landing on its downbeat.
  if (phraseEnd && beat >= 8) timpani(.12 + .025 * (beat - 8));
  if (phraseEnd && beat === 0) notes.push(riser(theme.bpm, 16, .14, harmony(planet, step + 16).root));
  fill(.16);
  return notes;
}

/** A riser started now that peaks exactly `steps` sixteenths later: delayed or trimmed to fit. */
function riser(bpm: number, steps: number, gain: number, landingRoot: number): Note {
  // Its tone climbs an octave and lands on the root of the chord it lands in (phase 5: it used to land on C in every
  // key), played between F#3 and F4; the playback rate stretches it, so its length is the sample's over that rate.
  const pitch = 54 + ((landingRoot - 54) % 12 + 12) % 12, rate = 2 ** ((pitch - 60) / 12);
  const span = steps * 15 / bpm, length = INSTRUMENT_SECONDS.riser / rate;
  // `skip` is in the sample's own seconds.
  return { instrument: 'riser', pitch, gain, pan: 0, wet: .25, offset: Math.max(0, span - length), skip: Math.max(0, length - span) * rate, priority: P.stinger };
}

interface Change {
  /** First sixteenth not yet scheduled when the change was asked for, and the sixteenth it takes effect on. */
  from: number; at: number; stage: BossStage; previous: BossStage;
  /** Put in place without a stinger (a steady-state preview, or the end of a fight). */
  quiet: boolean;
}

/** Where a change lands: the next bar line for an entrance (room for its riser), the next half bar for the overload
 * stinger, the next beat otherwise; always after the sixteenths already scheduled. */
export function switchStep(previous: BossStage, stage: BossStage, next: number) {
  const [grid, room] = previous === 0 ? [16, 6] : stage === 3 ? [8, 4] : [4, 2];
  return Math.ceil((next + room) / grid) * grid;
}

/**
 * Follows the boss phases on the score's own clock. `request` is called when the observed stage changes, with the first
 * sixteenth the clock has not scheduled yet; `notes` gives the stem and any stinger for each scheduled sixteenth.
 * It never moves the clock or the level score, and it keeps no state the simulation can see.
 */
export class BossArranger {
  /** The stage most recently asked for. */
  target: BossStage = 0;
  private changes: Change[] = [];
  reset() { this.target = 0; this.changes = []; }
  request(stage: BossStage, next: number, immediate = false) {
    if (stage === this.target) return;
    const previous = this.target;
    this.target = stage;
    // Keep the change in force and any still to come; older ones can no longer matter.
    const current = this.changes.filter(c => c.at <= next).at(-1);
    this.changes = this.changes.filter(c => c === current || c.at > next);
    // The end of a fight: the stem plays on for the bar its fader takes to close, then rests.
    if (stage === 0) { this.changes.push({ from: next, at: next + 16, stage: 0, previous, quiet: true }); return; }
    // A fight resuming inside that closing bar cancels the close.
    if (this.changes.at(-1)?.stage === 0 && this.changes.at(-1)!.at > next) this.changes.pop();
    const at = immediate ? next : switchStep(previous, stage, next), pending = this.changes.at(-1);
    // A change asked for before the previous one lands takes its place on that grid line, keeping that stinger's
    // lead-in (an entrance riser already sounding) and hitting into the newer stage.
    if (pending && pending.at > next && at <= pending.at) { pending.stage = stage; return; }
    this.changes.push({ from: next, at, stage, previous, quiet: immediate });
  }
  stageAt(step: number): BossStage {
    let stage: BossStage = 0;
    for (const change of this.changes) if (change.at <= step) stage = change.stage;
    return stage;
  }
  /** The next change still to land, if any (diagnostics and tests). */
  pending(step: number) { return this.changes.find(c => c.at > step); }
  notes(planet: PlanetId, step: number): Note[] {
    const out: Note[] = [];
    // The overload stinger's drop: one sixteenth of silence in the stem before its hit.
    const drop = this.changes.some(c => !c.quiet && c.stage === 3 && step === c.at - 1 && c.at - c.from > 1);
    if (!drop) out.push(...bossStep(planet, step, this.stageAt(step)));
    for (const change of this.changes) if (!change.quiet && step >= change.from && step <= change.at) out.push(...stinger(planet, change, step));
    return out;
  }
}

/** The transition into a stage: lead-in notes from the request until the switch, then the hit on it. */
function stinger(planet: PlanetId, change: Change, step: number): Note[] {
  const kit = KITS[planet], { theme, root, bass, colour, tom } = harmony(planet, change.at), w = kit.weight;
  const kind = change.previous === 0 ? 'entrance' : change.stage === 3 ? 'overload' : change.stage > change.previous ? 'rise' : 'fall';
  const left = change.at - step, half = 7.5 / theme.bpm;
  const notes: Note[] = [], add = writer(planet, step, notes);
  if (step < change.at) {
    if (step === change.from && (kind === 'entrance' || kind === 'overload')) notes.push(riser(theme.bpm, change.at - change.from, kind === 'overload' ? .2 : .16, root));
    if (left > 4) return notes;
    const build = (4 - left) / 3;
    // Entrance: toms climbing to the hit. Core: a snare pickup. Overload: a thirty-second snare roll and spiccato
    // strings rushing up the chord.
    if (kind === 'entrance') add('tom', tom + [0, 0, colour, 12][4 - left], (.12 + .1 * build) * w, (build - .5) * .4, { priority: P.stinger });
    else if (kind === 'overload') {
      for (const offset of [0, half]) add(kit.snare, 60, (.07 + .09 * build) * w, 0, { offset, priority: P.stinger });
      // The rush up the chord sounding now, not the one it lands in.
      const now = harmony(planet, step);
      for (const [k, offset] of [0, half].entries()) add('spiccato', now.root + 12 + [0, now.colour, 12, 12 + now.colour][(4 - left)] + k * 12, .07 + .04 * build, (k - .5) * .5, { offset, wet: .15, priority: P.stinger });
    } else add(kit.snare, 60, (.07 + .07 * build) * w, 0, { priority: P.stinger });
    return notes;
  }
  // The hit, on the switch itself; the level bed moves to the new stage's level with it.
  const hit = { priority: P.stinger };
  add('crash', 60, kind === 'overload' ? .15 : .12, 0, { wet: .2, bed: BED[change.stage], ...hit });
  add(kit.drum, 36, .42 * w, 0, { wet: .2, ...hit });
  add('boss-kick', 36, .46 * w, 0, { wet: .08, duck: kickDuck(planet, SIDECHAIN[planet].boss[Math.max(1, change.stage) - 1]), ...hit });
  add('timpani', tom, .34 * w, 0, { wet: .25, ...hit });
  if (kind === 'entrance') {
    // Dark and heavy: a sub boom, a low braam on root and colour tone, a deep tom.
    add('boom', bass, .36, 0, { wet: .25, ...hit });
    add('braam', bass, .2, -.1, { wet: .3, ...hit });
    add('braam', bass + colour, .1, .2, { wet: .3, ...hit });
    add('tom', tom, .24 * w, 0, { wet: .1, ...hit });
  } else if (kind === 'rise') {
    // Into the core: a bright brass chord on the boom.
    add('boom', bass, .24, 0, { wet: .2, ...hit });
    [0, colour, 12].forEach((t, i) => add('stab', root + 12 + t, .09, (i - 1) * .35, { wet: .2, ...hit }));
  } else if (kind === 'overload') {
    // The climax: the biggest boom, braam in octaves, a wide four-voice brass chord and a second drum stroke.
    add('boom', bass, .4, 0, { wet: .25, ...hit });
    add('braam', bass, .2, -.1, { wet: .3, ...hit });
    add('braam', bass + 12, .1, .15, { wet: .3, ...hit });
    [0, colour, 12, 12 + colour].forEach((t, i) => add('stab', root + 12 + t, .1, (i - 1.5) * .3, { wet: .25, ...hit }));
    add(kit.drum, 36, .3 * w, .2, { offset: half, wet: .2, ...hit });
  }
  return notes;
}
