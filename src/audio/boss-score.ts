import type { BossState, PlanetId } from '../shared/contracts';
import { INSTRUMENT_SECONDS, type Instrument } from './instruments';
import { consonantWith, soundingSteps, UNPITCHED } from './harmony';
import { LANDING_STEPS, landingNote, THEMES, type Note } from './score';

/**
 * Boss music (10 November revision). The level score plays on, unchanged, on its own sixteenth-note clock; an additive
 * stem on that same clock and harmony changes arrangement with the fight:
 *   0 flight    the level score alone
 *   1 modules   (arrival and batteries) entrance stinger, heavy half-time drums and toms, a darker eighth-note bass,
 *               low strings for tension
 *   2 core      full backbeat, driving synth bass in eighths, an arpeggiated pulse, strings on the chord, fills
 *   3 overload  aggressive sixteenth bass, sixteenth hats and arpeggio, an alarm pulse, stab-and-boom accents,
 *               ghost notes, rolls and a riser into each phrase; its own phase-change stinger
 * Every change lands on the grid (bar, beat or half bar) and the score is never restarted.
 */
export type BossStage = 0 | 1 | 2 | 3;
export const BOSS_STAGES = ['flight', 'modules', 'core', 'overload'] as const;
export function bossStage(phase: BossState['phase'] | null | undefined): BossStage {
  return phase === 'arrival' || phase === 'batteries' ? 1 : phase === 'core' ? 2 : phase === 'overload' ? 3 : 0;
}

/** Each world's boss voices. Its identity carries into the fight through these and the level score above them. */
interface Kit {
  kick: Instrument; snare: Instrument; hat: Instrument;
  /** How much clap layers onto the snare in core and overload. */
  clap: number;
  /** Bass voices for modules (darker), core (driving) and overload (aggressive), and the pulse voice. */
  dark: Instrument; drive: Instrument; growl: Instrument; pulse: Instrument;
  /** Kick sixteenths in modules, core and overload. */
  kicks: readonly [readonly number[], readonly number[], readonly number[]];
  /** Signature percussion and its sixteenths in modules, core and overload. */
  colour?: { instrument: Instrument; steps: readonly [readonly number[], readonly number[], readonly number[]] };
  /** Half-time backbeat before overload (Vesper's spacious pulse, Umbra's precise line). */
  half?: boolean;
  /** Luna's played timing and velocity. */
  human?: boolean;
  /** Percussion weight, and how far the level bed dips under a boss kick. */
  weight: number; pump: number;
  /** The whole stem's level: lower where the level score is already dense and loud (Corona), so the master compressor
   * is not what decides how the fight sounds. */
  level?: number;
  /** The pulse's register above the chord root: an octave, or two for the icy and the precise worlds. */
  lift: 12 | 24;
  /** Umbra: inhaled chords that stop dead on the stem's chord changes (modules), every bar line (core), and in overload
   * also reversed glass sucking into every beat through the chord's harmonic-series tone. */
  reversed?: boolean;
}
const KITS: Record<PlanetId, Kit> = {
  // Played warmth: brushes under the claps, toms, a rounded bass that only turns to a driven one late.
  luna: { kick: 'kick', snare: 'brush', hat: 'hat', clap: .5, dark: 'round-bass', drive: 'drive-bass', growl: 'drive-bass', pulse: 'arp',
    kicks: [[0, 10], [0, 6, 8, 14], [0, 4, 6, 8, 12, 14]], human: true, weight: .85, pump: .1, lift: 12 },
  // The foundry: mechanical sixteenths, struck metal, saw bass into a growl.
  khepri: { kick: 'kick', snare: 'snare', hat: 'hat', clap: .8, dark: 'saw-bass', drive: 'drive-bass', growl: 'growl', pulse: 'arp',
    kicks: [[0, 7, 10], [0, 4, 8, 12, 14], [0, 3, 4, 8, 11, 12, 14]],
    colour: { instrument: 'metal', steps: [[3, 11], [3, 7, 11, 15], [3, 7, 11, 13, 15]] }, weight: 1.1, pump: .2, lift: 12 },
  // Soft bloom: brushes, rolling round bass, light kick and only a small dip of the pads.
  nacre: { kick: 'kick', snare: 'brush', hat: 'hat', clap: .4, dark: 'round-bass', drive: 'round-bass', growl: 'drive-bass', pulse: 'arp',
    kicks: [[0, 11], [0, 6, 8, 11, 14], [0, 4, 6, 8, 11, 12, 14]], weight: .7, pump: .08, lift: 12 },
  // Ice: a half-time pulse until overload breaks into double time; a high, glassy arpeggio.
  vesper: { kick: 'kick', snare: 'snare', hat: 'hat', clap: .6, dark: 'bass', drive: 'drive-bass', growl: 'growl', pulse: 'arp',
    kicks: [[0, 10], [0, 3, 8, 14], [0, 4, 7, 8, 12, 14]], half: true, weight: .95, pump: .12, lift: 24 },
  // Flesh: paired heartbeats that race in overload, bone ticks, a fleshy clap, nerve-tone pulses.
  amnion: { kick: 'heart', snare: 'clap', hat: 'bone', clap: 0, dark: 'bio-bass', drive: 'bio-bass', growl: 'growl', pulse: 'nerve',
    kicks: [[0, 2, 9, 11], [0, 2, 6, 9, 11, 14], [0, 1, 4, 5, 8, 9, 12, 13]], weight: 1, pump: .15, lift: 12 },
  // The dying star: its harp carries the pulses, ember crackle for hats, kicks in the score's 3-3-2, the deepest dip.
  corona: { kick: 'kick', snare: 'snare', hat: 'ember', clap: .8, dark: 'bass', drive: 'drive-bass', growl: 'growl', pulse: 'harp',
    kicks: [[0, 6, 12], [0, 3, 6, 8, 12], [0, 3, 6, 8, 11, 12, 14]], weight: 1.05, pump: .2, lift: 12 },
  // The void: precise ticks, the void bass, a half-time line, a high exact arpeggio, and reversed swells that suck
  // into the grid (see `reversed`).
  umbra: { kick: 'kick', snare: 'snare', hat: 'void-tick', clap: .5, dark: 'void-bass', drive: 'void-bass', growl: 'drive-bass', pulse: 'arp',
    kicks: [[0, 8], [0, 4, 8, 12], [0, 4, 8, 10, 12, 14]], half: true, weight: .9, pump: .12, lift: 24, reversed: true },
};

/** Priorities inside the boss voice pool: stingers, then drums and bass, sustained strings, pulses, hats. */
const P = { hat: -1, pulse: 0, strings: 1, core: 2, stinger: 3 } as const;
/** The level score's level under each stage: it steps back a little as the stem takes the weight, so the fight grows
 * without growing much louder. Applied on each bar line and on each stinger's hit. */
export const BED = [1, 1, .94, .84] as const;

/** The chord in force at a sixteenth, as the level score plays it. */
function harmony(planet: PlanetId, step: number) {
  const theme = THEMES[planet], chord = theme.chords[Math.floor(step / 32) % 4];
  const root = theme.root + chord[0], tones = chord.map(c => c - chord[0]);
  // The chord's first tone that is not an octave of its root: usually the fifth; Umbra's fourth or tritone.
  const colour = tones.find(t => t % 12 !== 0)! % 12;
  return { theme, chord, root, bass: root - 12, tones, colour, tom: 36 + ((root % 12) + 12) % 12 };
}

function writer(planet: PlanetId, step: number, notes: Note[]) {
  const { human, level = 1 } = KITS[planet], beat = step % 16;
  return (instrument: Instrument, written: number, gain: number, pan = 0, extra: Partial<Note> = {}) => {
    // Never against the melody: a tone that would make a minor second, major seventh or tritone with the melody note
    // heard now becomes the nearest chord tone that does not, or is left out (harmony.ts).
    // The melody heard as it strikes, and any passing note arriving in the next two sixteenths while it is still loud;
    // a passing note arriving later over a held stem chord tone is the melody's own motion over the harmony.
    const ahead = Math.min(2, soundingSteps(planet, { instrument, pitch: written - 12, gain, pan, wet: 0, ...extra }) - 1);
    const pitch = UNPITCHED.has(instrument) ? written : consonantWith(planet, step, written, ahead);
    if (pitch === null) return;
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
  const kit = KITS[planet], { theme, chord, root, bass, tones, colour, tom } = harmony(planet, step);
  const bar = Math.floor(step / 16), beat = step % 16, w = kit.weight;
  const breakdown = Math.floor(bar / 8) % 4 === 2, chordStart = step % 32 === 0, phraseEnd = bar % 8 === 7;
  const riff = theme.bass[beat], notes: Note[] = [], add = writer(planet, step, notes);
  // Where the level kick already lands, the boss kick layers under it instead of doubling its level.
  const layered = theme.kick.includes(beat) && !breakdown ? .6 : 1;
  const lift = theme.root < 46 ? 12 : 0;
  const strings = (voicing: readonly number[], gain: number) => voicing.forEach((pitch, i) =>
    add('strings', pitch, gain, (i - (voicing.length - 1) / 2) * .3, { wet: .35, priority: P.strings }));

  // The tom ostinato, tuned to the chord root, runs under every stage; modules leans on it hardest.
  if (beat === 6 || beat === 14) add('tom', tom, (stage === 1 ? .2 : .13) * w, -.12, { wet: .1, priority: P.core });
  if (beat === 13 && stage < 3) add('tom', tom + colour, (stage === 1 ? .12 : .08) * w, .2, { wet: .1, priority: P.pulse });

  if (stage === 1) {
    // Darker, heavier quarter notes on the root under the riff; no octave leaps. Core doubles it, overload doubles again.
    if (beat % 4 === 0 || riff >= 0) add(kit.dark, bass + (riff >= 0 ? riff : 0), beat % 4 === 0 ? .25 : .17, 0, { priority: P.core });
    if (kit.kicks[0].includes(beat)) add(kit.kick, 36, .35 * w * layered, 0, { pump: kit.pump * .8, priority: P.core });
    // A heavy half-time backbeat in a big room.
    if (beat === 8) {
      add(kit.snare, 60, .2 * w, 0, { wet: .2, priority: P.core });
      if (kit.clap) add('clap', 60, .1 * w * kit.clap, 0, { wet: .2, priority: P.core });
    }
    if (beat % 4 === 2) add(kit.hat, 60, .04, beat < 8 ? -.25 : .25, { priority: P.hat });
    for (const s of kit.colour?.steps[0] ?? []) if (beat === s) add(kit.colour!.instrument, 55 + chord[0], .06, beat < 8 ? -.3 : .3, { priority: P.pulse });
    // Low strings hold the root and its colour tone under the chord: tension, not melody.
    if (chordStart) strings([root + lift, root + lift + colour], .06);
    if (phraseEnd && beat >= 12) add('tom', tom + [colour + 12, 12, colour, 0][beat - 12], .14 + .03 * (beat - 12), (beat - 13.5) * .2, { priority: P.core });
    return notes;
  }

  if (stage === 2) {
    // Driving synth bass: steady eighths on the riff, filling its rests with root and octave.
    if (beat % 2 === 0 || riff >= 0) add(kit.drive, bass + (riff >= 0 ? riff : beat % 4 === 2 ? 12 : 0), beat % 4 === 0 ? .27 : .21, 0, { priority: P.core });
    if (kit.kicks[breakdown ? 0 : 1].includes(beat)) add(kit.kick, 36, .4 * w * layered, 0, { pump: kit.pump, priority: P.core });
    if (kit.half ? beat === 8 : beat === 4 || beat === 12) {
      add(kit.snare, 60, .2 * w, 0, { wet: .12, priority: P.core });
      if (kit.clap) add('clap', 60, .14 * w * kit.clap, 0, { wet: .12, priority: P.core });
    }
    if (beat % 2 === 0) add(kit.hat, beat % 4 === 2 ? 62 : 60, beat % 4 === 2 ? .075 : .05, beat % 4 === 2 ? .22 : -.22, { priority: P.hat });
    else if (!kit.half && !breakdown) add(kit.hat, 60, .022, .1, { priority: P.hat });
    for (const s of kit.colour?.steps[1] ?? []) if (beat === s) add(kit.colour!.instrument, 55 + chord[0], .065, beat < 8 ? -.3 : .3, { priority: P.pulse });
    // An eighth-note arpeggio through the chord above the bass, alternating sides.
    if (beat % 2 === 0) {
      const tone = [0, tones[1], tones[2], tones[1]][(beat / 2) % 4];
      add(kit.pulse, root + kit.lift + tone, beat % 4 === 0 ? .075 : .062, beat % 4 === 0 ? -.3 : .3, { wet: .12, priority: P.pulse });
    }
    // Supporting harmony: strings on the chord, lifted above the bass on the low-rooted worlds.
    if (chordStart) strings(chord.slice(0, 3).map(c => theme.root + c + lift), .06);
    if (bar % 2 === 1 && beat >= 14) add(kit.snare, 60, .07 + (beat - 14) * .03, (beat - 14.5) * .3, { priority: P.pulse });
    if (phraseEnd && beat >= 12) {
      add('tom', tom + [colour + 12, 12, colour, 0][beat - 12], .15 + .03 * (beat - 12), (beat - 13.5) * .2, { priority: P.core });
      add(kit.snare, 60, .06 + .02 * (beat - 12), 0, { offset: 7.5 / theme.bpm, priority: P.pulse });
    }
    return notes;
  }

  // Overload. Aggressive sixteenth bass: the riff, root, octave leaps and the chord's colour tone.
  const fill = [0, 0, 12, 0, 0, colour, 12, 0][beat % 8];
  add(kit.growl, bass + (riff >= 0 ? riff : fill), beat % 4 === 0 ? .27 : beat % 2 === 0 ? .22 : .18, 0, { priority: P.core });
  if (kit.kicks[2].includes(beat)) add(kit.kick, 36, .4 * w * layered, 0, { pump: kit.pump * 1.35, priority: P.core });
  // Double-time backbeat everywhere, with ghost notes.
  if (beat === 4 || beat === 12) {
    add(kit.snare, 60, .24 * w, 0, { wet: .12, priority: P.core });
    if (kit.clap) add('clap', 60, .2 * w * kit.clap, 0, { wet: .12, priority: P.core });
  }
  if (beat === 7 || beat === 10 || beat === 15) add(kit.snare, 60, .06 * w, beat === 10 ? .15 : -.15, { priority: P.hat });
  // Sixteenth hats with accented off-beats, and a longer, darker open hat on them.
  add(kit.hat, beat % 4 === 2 ? 62 : 60, beat % 4 === 2 ? .09 : beat % 2 === 0 ? .06 : .04, beat % 2 ? .18 : -.18, { priority: P.hat });
  if (beat % 4 === 2) add(kit.hat, 57, .05, .3, { priority: P.hat });
  for (const s of kit.colour?.steps[2] ?? []) if (beat === s) add(kit.colour!.instrument, 55 + chord[0], .07, beat < 8 ? -.3 : .3, { priority: P.pulse });
  // An urgent sixteenth arpeggio and an alarm pulse two octaves up on the off-beats.
  const tone = [0, tones[1], tones[2], 12, tones[2], tones[1], 0, tones[1]][beat % 8];
  add('arp', root + kit.lift + tone, beat % 4 === 0 ? .075 : .06, beat % 2 ? .32 : -.32, { wet: .1, priority: P.pulse });
  if (beat % 4 === 2) add(kit.pulse, root + 24, .065, beat < 8 ? -.4 : .4, { wet: .15, priority: P.pulse });
  // Heavier accents: a stab chord and a boom on every chord change, syncopated stabs, a crash and a braam on each phrase.
  const stab = (gain: number) => [0, colour, 12].forEach((t, i) => add('stab', root + 12 + t, gain, (i - 1) * .35, { wet: .2, priority: P.core }));
  if (chordStart) { stab(.12); add('boom', bass, .17, 0, { wet: .2, priority: P.core }); }
  if (bar % 2 === 0 && (beat === 3 || beat === 6 || beat === 10)) stab(.085);
  if (bar % 8 === 0 && beat === 0) {
    add('crash', 60, .12, 0, { wet: .2, priority: P.strings });
    add('braam', bass, .1, 0, { wet: .3, priority: P.strings });
  }
  // Brighter strings: the chord with its top voice an octave up.
  if (chordStart) strings(chord.slice(0, 3).map((c, i) => theme.root + c + lift + (i === 2 ? 12 : 0)), .06);
  // Rolls: sixteenths every second bar, thirty-seconds into each phrase, with a riser landing on its downbeat.
  if (bar % 2 === 1 && beat >= 12) add(kit.snare, 60, .06 + (beat - 12) * .025, (beat - 13.5) * .2, { priority: P.pulse });
  if (phraseEnd && beat >= 8) add(kit.snare, 60, .05 + (beat - 8) * .015, 0, { offset: 7.5 / theme.bpm, priority: P.pulse });
  if (phraseEnd && beat >= 12) add('tom', tom + [colour + 12, 12, colour, 0][beat - 12], .16 + .03 * (beat - 12), (beat - 13.5) * .2, { priority: P.core });
  if (phraseEnd && beat === 0) notes.push(riser(theme.bpm, 16, .14));
  return notes;
}

/** A riser started now that peaks exactly `steps` sixteenths later: delayed or trimmed to fit. */
function riser(bpm: number, steps: number, gain: number): Note {
  const span = steps * 15 / bpm, length = INSTRUMENT_SECONDS.riser;
  return { instrument: 'riser', pitch: 60, gain, pan: 0, wet: .25, offset: Math.max(0, span - length), skip: Math.max(0, length - span), priority: P.stinger };
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
    if (step === change.from && (kind === 'entrance' || kind === 'overload')) notes.push(riser(theme.bpm, change.at - change.from, kind === 'overload' ? .2 : .16));
    if (left > 4) return notes;
    const build = (4 - left) / 3;
    // Entrance: toms climbing to the hit. Core: a snare pickup. Overload: a thirty-second snare roll and a rising arpeggio.
    if (kind === 'entrance') add('tom', tom + [0, 0, colour, 12][4 - left], (.12 + .1 * build) * w, (build - .5) * .4, { priority: P.stinger });
    else if (kind === 'overload') {
      for (const offset of [0, half]) add(kit.snare, 60, (.07 + .09 * build) * w, 0, { offset, priority: P.stinger });
      for (const [k, offset] of [0, half].entries()) add('arp', root + 12 + [0, colour, 12, 12 + colour][(4 - left)] + k * 12, .05 + .03 * build, (k - .5) * .5, { offset, wet: .15, priority: P.stinger });
    } else add(kit.snare, 60, (.07 + .07 * build) * w, 0, { priority: P.stinger });
    return notes;
  }
  // The hit, on the switch itself; the level bed moves to the new stage's level with it.
  const hit = { priority: P.stinger };
  add('crash', 60, kind === 'overload' ? .15 : .12, 0, { wet: .2, bed: BED[change.stage], ...hit });
  add(kit.kick, 36, .42 * w, 0, { pump: kind === 'fall' ? kit.pump : .35, ...hit });
  if (kind === 'entrance') {
    // Dark and heavy: a sub boom, a low braam on root and colour tone, a deep tom.
    add('boom', bass, .3, 0, { wet: .25, ...hit });
    add('braam', bass, .2, -.1, { wet: .3, ...hit });
    add('braam', bass + colour, .1, .2, { wet: .3, ...hit });
    add('tom', tom, .24 * w, 0, { wet: .1, ...hit });
  } else if (kind === 'rise') {
    // Into the core: a bright stab chord on the boom.
    add('boom', bass, .18, 0, { wet: .2, ...hit });
    [0, colour, 12].forEach((t, i) => add('stab', root + 12 + t, .09, (i - 1) * .35, { wet: .2, ...hit }));
  } else if (kind === 'overload') {
    // The climax: the biggest boom, braam in octaves, a wide four-voice stab and a clap.
    add('boom', bass, .34, 0, { wet: .25, ...hit });
    add('braam', bass, .2, -.1, { wet: .3, ...hit });
    add('braam', bass + 12, .1, .15, { wet: .3, ...hit });
    [0, colour, 12, 12 + colour].forEach((t, i) => add('stab', root + 12 + t, .1, (i - 1.5) * .3, { wet: .25, ...hit }));
    add('clap', 60, .2 * w, 0, { wet: .15, ...hit });
  }
  return notes;
}
