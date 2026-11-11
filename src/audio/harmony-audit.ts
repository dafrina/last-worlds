import type { PlanetId } from '../shared/contracts';
import { bossStep, type BossStage } from './boss-score';
import { chordAt, clash, heardWindow, LEAD, pitchClass, UNPITCHED } from './harmony';
import { scoreStep, type Note } from './score';

/**
 * Harmonic audit: over a world's whole 32-bar cycle in one stage, every pair of pitched notes heard together whose
 * pitch classes form a minor second, major seventh or tritone (harmony.ts `clash`), unless both are tones of the chords
 * they belong to. `lead-stem` and `stem-stem` pairs are the boss stem's own doing; `lead-harmony` and `harmony-stem`
 * pairs involve the level score's accompaniment.
 */
export type ClashKind = 'lead-stem' | 'stem-stem' | 'lead-harmony' | 'harmony-stem';
export interface Clash { planet: PlanetId; stage: BossStage; step: number; kind: ClashKind; a: string; b: string; interval: number }

interface Heard { note: Note; layer: 'lead' | 'harmony' | 'stem'; start: number; end: number; chordStep?: number }
export function audit(planet: PlanetId, stage: BossStage): Clash[] {
  const heard: Heard[] = [];
  const take = (note: Note, step: number, layer: Heard['layer']) => {
    if (UNPITCHED.has(note.instrument)) return;
    heard.push({ note, layer, ...heardWindow(planet, note, step) });
  };
  for (let step = 0; step < 512; step++) {
    for (const note of scoreStep(planet, step)) take(note, step, LEAD[planet].includes(note.instrument) ? 'lead' : 'harmony');
    if (stage) for (const note of bossStep(planet, step, stage)) take(note, step, 'stem');
  }
  const clashes: Clash[] = [];
  for (let step = 0; step < 512; step++) {
    const now = heard.filter(h => h.start <= step && h.end > step);
    // A note is part of the harmony if it is a tone of the chord in force now, or of the chord it was struck in (a tail
    // decaying across a chord change is voice leading, not a clash); a reversed one belongs to the chord it lands on.
    const harmonic = (h: Heard) => h.chordStep !== undefined ? chordAt(planet, h.chordStep).tones.has(pitchClass(h.note.pitch))
      : chordAt(planet, step).tones.has(pitchClass(h.note.pitch)) || chordAt(planet, h.start).tones.has(pitchClass(h.note.pitch));
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
        : layers === 'harmony-lead' ? 'lead-harmony' : layers === 'harmony-stem' ? 'harmony-stem' : null;
      if (!kind) continue;
      clashes.push({ planet, stage, step, kind, interval, a: `${a.note.instrument} ${a.note.pitch}`, b: `${b.note.instrument} ${b.note.pitch}` });
    }
  }
  return clashes;
}
