import type { PlanetId } from '../shared/contracts';
import { bossStep, type BossStage } from './boss-score';
import { chordAt, clash, heardWindow, heardWindowAt, LEAD, pitchClass, UNPITCHED } from './harmony';
import { MENU_THEME, menuChord, menuStep } from './menu-theme';
import { scoreStep, type Note } from './score';

/**
 * Harmonic audit: over a world's whole 32-bar cycle in one stage, every pair of pitched notes heard together whose
 * pitch classes form a minor second, major seventh or tritone (harmony.ts `clash`), unless both are tones of the chords
 * they belong to. `lead-stem` and `stem-stem` pairs are the boss stem's own doing; `lead-harmony` and `harmony-stem`
 * pairs involve the level score's accompaniment.
 */
export type ClashKind = 'lead-stem' | 'stem-stem' | 'lead-harmony' | 'harmony-stem' | 'harmony-harmony';
export interface Clash { planet: PlanetId | 'menu'; stage: BossStage; step: number; kind: ClashKind; a: string; b: string; interval: number }

type Layer = 'lead' | 'harmony' | 'stem';
interface Heard { note: Note; layer: Layer; start: number; end: number; chordStep?: number }
/** What the audit reads: a cycle's notes by layer, the chord tones (pitch classes) at a sixteenth, and how long a note is heard. */
interface Source {
  steps: number; notes(step: number): { note: Note; layer: Layer }[]; tones(step: number): Set<number>;
  heard(note: Note, step: number): { start: number; end: number; chordStep?: number };
}
export function audit(planet: PlanetId, stage: BossStage): Clash[] {
  return auditSource(planet, stage, false, {
    steps: 512, tones: step => chordAt(planet, step).tones, heard: (note, step) => heardWindow(planet, note, step),
    notes: step => [
      ...scoreStep(planet, step).map(note => ({ note, layer: (LEAD[planet].includes(note.instrument) ? 'lead' : 'harmony') as Layer })),
      ...(stage ? bossStep(planet, step, stage).map(note => ({ note, layer: 'stem' as Layer })) : []),
    ],
  });
}
/** The title theme's whole 32-bar cycle (menu-theme.ts): the lead against everything, and, stricter than the worlds'
 * audit, the accompaniment against itself too. */
export function auditMenu(): Clash[] {
  return auditSource('menu', 0, true, {
    steps: MENU_THEME.bars * 16, tones: step => new Set(menuChord(step).tones.map(pitchClass)),
    heard: (note, step) => heardWindowAt(MENU_THEME.bpm, note, step),
    notes: step => menuStep(step).map(note => ({ note, layer: (note.instrument === 'anthem' ? 'lead' : 'harmony') as Layer })),
  });
}
function auditSource(planet: PlanetId | 'menu', stage: BossStage, all: boolean, source: Source): Clash[] {
  const heard: Heard[] = [];
  for (let step = 0; step < source.steps; step++) {
    for (const { note, layer } of source.notes(step)) if (!UNPITCHED.has(note.instrument)) heard.push({ note, layer, ...source.heard(note, step) });
  }
  const clashes: Clash[] = [];
  for (let step = 0; step < source.steps; step++) {
    const now = heard.filter(h => h.start <= step && h.end > step);
    // A note is part of the harmony if it is a tone of the chord in force now, or of the chord it was struck in (a tail
    // decaying across a chord change is voice leading, not a clash); a reversed one belongs to the chord it lands on.
    const harmonic = (h: Heard) => h.chordStep !== undefined ? source.tones(h.chordStep).has(pitchClass(h.note.pitch))
      : source.tones(step).has(pitchClass(h.note.pitch)) || source.tones(h.start).has(pitchClass(h.note.pitch));
    for (let i = 0; i < now.length; i++) for (let j = i + 1; j < now.length; j++) {
      const a = now[i], b = now[j];
      if (a.start !== step && b.start !== step) continue;
      if (harmonic(a) && harmonic(b)) continue;
      // The note struck now answers for the clash. A melody note passing over a chord tone already held (struck at
      // least two sixteenths before) is the melody's own motion over the harmony, as over the level's pads.
      const [struck, held] = a.start === step ? [a, b] : [b, a];
      if (held.start < step - 2 && struck.layer === 'lead' && harmonic(held)) continue;
      const interval = clash(a.note.pitch, b.note.pitch);
      if (!interval) continue;
      const layers = [a.layer, b.layer].sort().join('-');
      const kind: ClashKind | null = layers === 'lead-stem' ? 'lead-stem' : layers === 'stem-stem' ? 'stem-stem'
        : layers === 'harmony-lead' ? 'lead-harmony' : layers === 'harmony-stem' ? 'harmony-stem'
          : layers === 'harmony-harmony' && all ? 'harmony-harmony' : null;
      if (!kind) continue;
      clashes.push({ planet, stage, step, kind, interval, a: `${a.note.instrument} ${a.note.pitch}`, b: `${b.note.instrument} ${b.note.pitch}` });
    }
  }
  return clashes;
}
