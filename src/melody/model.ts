import type { PlanetId } from '../shared/contracts';
import type { Instrument } from '../audio/instruments';
import { THEMES, scoreStep, FROZEN, type Note } from '../audio/score';
import { MENU_THEME, fitted, menuChord, menuStep } from '../audio/menu-theme';

/**
 * The melody editor's model (melody.html; user, 20 November 2026: "a midi score tool in the browser where i can fix some
 * of the main melodies of the songs played ... So i can adjust and you incorporate it"). Pure: no audio, no DOM.
 *
 * A song's lead is read from the real score: every sixteenth of its 32 bars, the notes the score marks as its melody
 * (`part: 'lead'`; Vesper's bells, which carry no part). The notes that move with the lead (Corona's octave doubling in the
 * return, the title theme's strings, brass stabs and glass) are its companions: they follow an edited note's pitch. The rest
 * is the accompaniment, played unchanged. With the line unedited, `notesAt` gives exactly the score's notes.
 * Umbra is left out: its lead is reversed swells scheduled ahead of where they land, and its score is frozen.
 */
export type SongId = 'title' | Exclude<PlanetId, 'umbra'>;
export const SONG_IDS: readonly SongId[] = ['title', 'luna', 'khepri', 'vesper', 'nacre', 'amnion', 'corona', 'nahara'];
export const STEPS = 512;
const WORLDS: Record<Exclude<SongId, 'title'>, string> = {
  luna: 'Luna', khepri: 'Khepri', vesper: 'Vesper', nacre: 'Nacre', amnion: 'Amnion', corona: 'Corona', nahara: 'Nahara',
};

/** One note of the lead: where it starts (a sixteenth of the 32 bars), its pitch (MIDI, fractional for microtones), its
 * level, and the score note it plays as (instrument, pan, room and the rest). */
export interface LineNote { step: number; pitch: number; gain: number; template: Note }
interface Companion { note: Note; offset: number }
export interface Song {
  id: SongId; title: string; world: string; bpm: number;
  /** The title theme plays on the menu's bus. */
  menu: boolean;
  /** Played with the frozen touch (mixer.ts humanize `legacy`). */
  legacy: boolean;
  /** The lead's instrument. */
  instrument: Instrument;
  original: LineNote[];
  accompaniment: Note[][];
  companions: Companion[][];
}

const raw = (id: SongId, step: number): Note[] => (id === 'title' ? menuStep(step) : scoreStep(id, step));
const isLead = (id: SongId, note: Note) => note.part === 'lead' || (id === 'vesper' && note.instrument === 'glass');
function isCompanion(id: SongId, note: Note, step: number, lead: Note) {
  if (id === 'corona') return note.instrument === 'harp-high' && !note.part;
  if (id !== 'title') return false;
  const bar = Math.floor(step / 16), beat = step % 16;
  if (note.lead && (note.instrument === 'stab' || note.instrument === 'strings')) return true;
  return note.instrument === 'glass' && bar >= 24 && bar <= 26 && (beat === 0 || beat === 8) && note.pitch === lead.pitch + 12;
}

const cache = new Map<SongId, Song>();
export function song(id: SongId): Song {
  const known = cache.get(id);
  if (known) return known;
  const original: LineNote[] = [], accompaniment: Note[][] = [], companions: Companion[][] = [];
  for (let step = 0; step < STEPS; step++) {
    const notes = raw(id, step), leads = notes.filter(note => isLead(id, note)), lead = leads[0];
    for (const note of leads) original.push({ step, pitch: note.pitch, gain: note.gain, template: note });
    const moving = lead ? notes.filter(note => !isLead(id, note) && isCompanion(id, note, step, lead)) : [];
    companions.push(moving.map(note => ({ note, offset: note.pitch - lead!.pitch })));
    accompaniment.push(notes.filter(note => !isLead(id, note) && !moving.includes(note)));
  }
  const made: Song = {
    id, original, accompaniment, companions,
    title: id === 'title' ? MENU_THEME.title : THEMES[id].title, world: id === 'title' ? 'Title' : WORLDS[id],
    bpm: id === 'title' ? MENU_THEME.bpm : THEMES[id].bpm, menu: id === 'title', legacy: id !== 'title' && FROZEN.has(id),
    instrument: original[0]?.template.instrument ?? 'piano',
  };
  cache.set(id, made);
  return made;
}

/** Sixteenths from a lead note to the next one (wrapping round the 32 bars), at most 32: how long the title theme's
 * strings hold under it, as menu-theme.ts counts. */
function gapAfter(line: readonly LineNote[], step: number) {
  let next = 32;
  for (const other of line) {
    const gap = ((other.step - step) % STEPS + STEPS) % STEPS;
    if (gap > 0 && gap < next) next = gap;
  }
  return next;
}

/** Everything the song plays at a sixteenth with `line` as its lead. `parts` leaves out the accompaniment or the lead. */
export function notesAt(target: Song, step: number, line: readonly LineNote[], parts: { accompaniment?: boolean; lead?: boolean } = {}): Note[] {
  const s = ((step % STEPS) + STEPS) % STEPS, out: Note[] = [];
  if (parts.accompaniment !== false) out.push(...target.accompaniment[s]);
  if (parts.lead === false) return out;
  // The title theme releases each pitched note before a chord it would grind against (menu-theme.ts `fitted`), from the
  // note as written: so a moved note is fitted again at its new pitch (the template's hold was fitted to the old one).
  const play = (note: Note) => {
    if (!target.menu) { out.push(note); return; }
    const made = fitted(note, s);
    if (made) out.push(made);
  };
  for (const note of line) {
    if (note.step !== s) continue;
    const { hold: _hold, ...written } = note.template;
    play({ ...(target.menu ? written : note.template), pitch: note.pitch, gain: note.gain });
    for (const { note: companion, offset } of target.companions[s]) {
      const { hold: _companionHold, ...base } = companion;
      // The strings hold under the line until its next note (menu-theme.ts), then are fitted like any note.
      const hold = companion.instrument === 'strings' ? { hold: gapAfter(line, s) * (15 / MENU_THEME.bpm) - .2 } : {};
      play({ ...(target.menu ? base : companion), ...hold, pitch: note.pitch + offset });
    }
  }
  return out;
}

/** The score note a new lead note at `step` plays as: the original lead note there, else the nearest one (without its
 * slide or trimmed start, which belonged to its own place). */
export function templateAt(target: Song, step: number): Note {
  const same = target.original.find(note => note.step === step);
  if (same) return same.template;
  let best = target.original[0], distance = Infinity;
  for (const note of target.original) {
    const d = Math.min(Math.abs(note.step - step), STEPS - Math.abs(note.step - step));
    if (d < distance) { distance = d; best = note; }
  }
  const { bend: _bend, skip: _skip, ...rest } = best?.template ?? { instrument: target.instrument, pitch: 60, gain: .12, pan: 0, wet: .3 };
  return rest;
}

/** The harmony under a sixteenth: chord tones (MIDI), its root and its mode (pitch classes). */
export function harmonyAt(id: SongId, step: number): { tones: number[]; root: number; scale: readonly number[] } {
  if (id === 'title') return menuChord(step);
  const theme = THEMES[id], bar = Math.floor(step / 16) % 32, index = Math.floor(bar / 2) % 4, chord = theme.chords[index];
  return { tones: chord.map(c => theme.root + c), root: theme.root + chord[0], scale: theme.scales[index] };
}

/** The section a bar opens, if it opens one. */
export function sectionAt(id: SongId, bar: number): string | null {
  if (id === 'title') return ({ 0: 'Intro', 4: 'Hook', 12: 'B section', 20: 'Hook', 28: 'Turnaround' } as Record<number, string>)[bar] ?? null;
  return bar % 8 === 0 ? ['Opening', 'Phrase 2', 'Breakdown', 'Return'][bar / 8] : null;
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
/** A pitch's name (D4), with its cents off the grid for microtones (E4 +50¢). */
export function pitchName(pitch: number): string {
  const base = Math.floor(pitch + 1e-6), cents = Math.round((pitch - base) * 100);
  const name = `${NAMES[((base % 12) + 12) % 12]}${Math.floor(base / 12) - 1}`;
  return cents ? `${name} ${cents > 0 ? '+' : ''}${cents}¢` : name;
}

/** The saved form (lookdev/melody-edits.json): each edited song's line, with where each note sits for reading. */
export interface SavedSong {
  title: string; world: string; bpm: number; instrument: string; comment: string;
  notes: { step: number; bar: number; sixteenth: number; pitch: number; name: string; gain: number }[];
}
export interface SavedEdits { version: 1; saved: string; songs: Partial<Record<SongId, SavedSong>> }

export function saveForm(edits: ReadonlyMap<SongId, { line: readonly LineNote[]; comment: string }>, now = new Date()): SavedEdits {
  const songs: Partial<Record<SongId, SavedSong>> = {};
  for (const [id, { line, comment }] of edits) {
    const target = song(id);
    songs[id] = {
      title: target.title, world: target.world, bpm: target.bpm, instrument: target.instrument, comment,
      notes: [...line].sort((a, b) => a.step - b.step || a.pitch - b.pitch).map(note => ({
        step: note.step, bar: Math.floor(note.step / 16) + 1, sixteenth: note.step % 16, pitch: note.pitch, name: pitchName(note.pitch),
        gain: Math.round(note.gain * 1000) / 1000,
      })),
    };
  }
  return { version: 1, saved: now.toISOString(), songs };
}

/** Reads a saved file back into lines (each note playing as the score note at its place, or the nearest). Unknown songs
 * and malformed notes are skipped. */
export function loadForm(data: unknown): Map<SongId, { line: LineNote[]; comment: string }> {
  const result = new Map<SongId, { line: LineNote[]; comment: string }>();
  const songs = (data as { songs?: Record<string, unknown> } | null)?.songs;
  if (!songs || typeof songs !== 'object') return result;
  for (const [id, value] of Object.entries(songs)) {
    if (!(SONG_IDS as readonly string[]).includes(id)) continue;
    const saved = value as Partial<SavedSong>, target = song(id as SongId), line: LineNote[] = [];
    for (const note of Array.isArray(saved.notes) ? saved.notes : []) {
      const { step, pitch, gain } = note as { step?: unknown; pitch?: unknown; gain?: unknown };
      if (typeof step !== 'number' || typeof pitch !== 'number' || typeof gain !== 'number') continue;
      if (!Number.isInteger(step) || step < 0 || step >= STEPS || !Number.isFinite(pitch) || !(gain >= 0)) continue;
      line.push({ step, pitch, gain, template: templateAt(target, step) });
    }
    result.set(id as SongId, { line, comment: typeof saved.comment === 'string' ? saved.comment : '' });
  }
  return result;
}

/** Whether a line differs from the song's original. */
export function edited(target: Song, line: readonly LineNote[]) {
  const key = (notes: readonly LineNote[]) => notes.map(n => `${n.step}:${n.pitch}:${n.gain}`).sort().join(',');
  return key(line) !== key(target.original);
}
