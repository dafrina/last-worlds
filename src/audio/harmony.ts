import type { PlanetId } from '../shared/contracts';
import { BASE_PITCH, INSTRUMENT_SECONDS, type Instrument } from './instruments';
import { scoreStep, THEMES, type Note } from './score';

/**
 * Harmony model shared by the boss arranger (it picks tones that do not clash with the melody) and the harmonic audit
 * (tests/audio/harmony.test.ts). A clash is a minor second, major seventh or tritone between two pitch classes
 * (within a quarter tone, so Umbra's deliberate quarter tones and harmonic-series tones are not mistaken for one),
 * unless both notes are tones of the chord in force: the chord is the composition's own harmony.
 */
export const UNPITCHED = new Set<Instrument>(['kick', 'snap-kick', 'forge-kick', 'boss-kick', 'doum', 'tek', 'snare', 'hat', 'taiko',
  'brush', 'crash', 'riser', 'bone', 'void-tick', 'ember', 'heart', 'bowed', 'tom', 'boom', 'steam', 'crack', 'chitter', 'night-click']);
/** The melody's instruments in each world's level score (Luna's piano and Khepri's lead also play its chords). */
export const LEAD: Record<PlanetId, readonly Instrument[]> = {
  luna: ['piano'], khepri: ['saw-lead'], nacre: ['pearl'], vesper: ['glass'], amnion: ['nerve'], corona: ['harp-high'], umbra: ['glint', 'obsidian'],
};
const SUSTAINED = new Set<Instrument>(['frost', 'bloom-pad', 'breath-pad', 'solar', 'inhale', 'strings', 'braam']);
const RINGING = new Set<Instrument>(['piano', 'glass', 'harp', 'harp-high', 'nerve', 'saw-lead', 'obsidian', 'glint', 'pearl', 'signal', 'anvil']);

export const pitchClass = (pitch: number) => Math.round((((pitch % 12) + 12) % 12) * 1000) / 1000 % 12;
/** The clash between two pitches (1 minor second, 11 major seventh, 6 tritone), or 0 if they sit together. */
export function clash(a: number, b: number) {
  const interval = ((((a - b) % 12) + 12) % 12);
  for (const bad of [1, 6, 11]) if (Math.abs(interval - bad) < .25) return bad;
  return 0;
}
export function chordAt(planet: PlanetId, step: number) {
  const theme = THEMES[planet], chord = theme.chords[Math.floor(step / 32) % 4];
  return { chord, tones: new Set(chord.map(c => pitchClass(theme.root + c))) };
}

/** How many sixteenths a note is heard for: held voices for their length, ringing ones until they have faded a lot,
 * plucked basses and short notes briefly. */
export function soundingSteps(planet: PlanetId, note: Note) {
  const seconds = INSTRUMENT_SECONDS[note.instrument] / 2 ** ((note.pitch - BASE_PITCH[note.instrument]) / 12) - (note.skip ?? 0);
  const factor = SUSTAINED.has(note.instrument) ? 1 : RINGING.has(note.instrument) ? .4 : .3;
  return Math.max(1, Math.min(32, Math.round(seconds * factor * THEMES[planet].bpm / 15)));
}

export const REVERSED = new Set<Instrument>(['inhale', 'glint']);
/** The sixteenths a note struck (emitted) on `step` is heard in, and the step whose chord it belongs to: a reversed
 * note belongs to the chord it lands on and is loud only just before it. */
export function heardWindow(planet: PlanetId, note: Note, step: number) {
  if (!REVERSED.has(note.instrument)) return { start: step, end: step + soundingSteps(planet, note), chordStep: undefined };
  const seconds = INSTRUMENT_SECONDS[note.instrument] / 2 ** ((note.pitch - BASE_PITCH[note.instrument]) / 12);
  const landing = step + Math.round(((note.offset ?? 0) + seconds) * THEMES[planet].bpm / 15);
  return { start: landing - 2, end: landing + 1, chordStep: landing };
}

export interface Sounding { note: Note; start: number; end: number }
const scoreCache = new Map<string, Note[]>();
/** scoreStep, remembered (it is pure): the melody model reads each sixteenth many times. */
function scoreAt(planet: PlanetId, step: number) {
  const key = `${planet}:${step}`;
  let notes = scoreCache.get(key);
  if (!notes) {
    if (scoreCache.size > 2048) scoreCache.clear();
    notes = scoreStep(planet, step); scoreCache.set(key, notes);
  }
  return notes;
}
const leadCache = new Map<string, Sounding[]>();
/** The melody's notes heard at a sixteenth (started up to two bars earlier and still sounding). */
export function leadAt(planet: PlanetId, step: number): Sounding[] {
  const key = `${planet}:${step}`;
  let found = leadCache.get(key);
  if (found) return found;
  found = [];
  for (let from = Math.max(0, step - 32); from <= step; from++) {
    for (const note of scoreAt(planet, from)) {
      if (!LEAD[planet].includes(note.instrument)) continue;
      const { start, end } = heardWindow(planet, note, from);
      if (start <= step && end > step) found.push({ note, start, end });
    }
  }
  if (leadCache.size > 4096) leadCache.clear();
  leadCache.set(key, found);
  return found;
}

/**
 * The tone the boss stem should play instead of `pitch` at a sixteenth: itself if it sits with the melody heard there,
 * otherwise the nearest tone of the chord (within an octave) that does, or null to leave the note out.
 * Melody notes that are tones of the chord never clash with chord tones by this rule; the check is for its passing and
 * neighbour notes (Corona's ♭6, Luna's sixths and ninths over a changing bass).
 */
export function consonantWith(planet: PlanetId, step: number, pitch: number, ahead = 0, behind = 0): number | null {
  const { tones } = chordAt(planet, step);
  // The melody heard now and while this note still rings: a passing tone starting a sixteenth later clashes too.
  // (`behind` widens the window back, for a reversed note swelling up to its landing on `step`.)
  const melody: number[] = [];
  for (let s = step - behind; s <= step + ahead; s++) {
    const here = chordAt(planet, s).tones;
    for (const heard of leadAt(planet, s)) if (!here.has(pitchClass(heard.note.pitch))) melody.push(heard.note.pitch);
  }
  if (!melody.some(m => clash(m, pitch))) return pitch;
  const options: number[] = [];
  for (const tone of tones) for (let octave = -2; octave <= 2; octave++) {
    const candidate = Math.floor(pitch / 12) * 12 + octave * 12 + tone;
    if (Math.abs(candidate - pitch) <= 12) options.push(candidate);
  }
  options.sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch) || a - b);
  return options.find(o => !melody.some(m => clash(m, o))) ?? null;
}
