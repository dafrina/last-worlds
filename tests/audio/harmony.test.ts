import { describe, expect, it } from 'vitest';
import { audit } from '../../src/audio/harmony-audit';
import { BossArranger, bossStep } from '../../src/audio/boss-score';
import { clash, consonantWith, heardWindow, LEAD, modeAt, pitchClass, REVERSED, soundingSteps, UNPITCHED } from '../../src/audio/harmony';
import { INSTRUMENT_SECONDS } from '../../src/audio/instruments';
import { scoreStep, THEMES, type Note } from '../../src/audio/score';
import type { PlanetId } from '../../src/shared/contracts';

const PLANETS = Object.keys(THEMES) as PlanetId[];

describe('harmonic audit', () => {
  it('flags minor seconds, major sevenths and tritones, not Umbra\'s quarter tones', () => {
    expect([1, 6, 11, 13, 2, 7].map(i => clash(60 + i, 60))).toEqual([1, 6, 11, 1, 0, 0]);
    expect(clash(66.5, 60)).toBe(0);
    expect(clash(60.5, 71.51)).toBe(1);
  });
  it('finds no boss-stem note against the melody, its harmony or another stem note, in any world or stage', () => {
    for (const planet of PLANETS) for (const stage of [1, 2, 3] as const) {
      const found = audit(planet, stage).filter(c => c.kind !== 'lead-harmony');
      expect(found.slice(0, 3), `${planet} stage ${stage}`).toEqual([]);
    }
  });
  it('finds no clash in the recomposed scores, and leaves the approved ones exactly as written', () => {
    // The melodies keep their own intervals against the accompaniment: Amnion's tritone over its uneasy chords and
    // bass is its character (55 before its melody was simplified in phase 5). Corona's and Umbra's quarter tones are
    // not clashes.
    const approved: Partial<Record<PlanetId, number>> = { amnion: 20 };
    for (const planet of PLANETS) expect(audit(planet, 0).length, planet).toBe(approved[planet] ?? 0);
  });
  it('keeps every pitched boss-stem note in its chord or mode, in every chord it is heard in, stingers and risers too', () => {
    // User, phase 5: the fights "seem like they drift into false notes". A tone that is still heard after a chord
    // change must belong to both chords; a reversed voice belongs to the chord it lands on; a riser's climbing tone
    // ends on the landing chord's root. Corona's and Umbra's authored quarter tones are in their modes (THEMES scales).
    for (const planet of PLANETS) {
      const off: string[] = [];
      const check = (n: Note, step: number) => {
        if (n.instrument === 'riser') {
          const landing = step + Math.round(((n.offset ?? 0) + (INSTRUMENT_SECONDS.riser - (n.skip ?? 0)) / 2 ** ((n.pitch - 60) / 12)) * THEMES[planet].bpm / 15);
          if (!modeAt(planet, landing).has(pitchClass(n.pitch))) off.push(`${step} riser ${n.pitch}`);
          return;
        }
        if (UNPITCHED.has(n.instrument)) return;
        if (REVERSED.has(n.instrument)) {
          if (!modeAt(planet, heardWindow(planet, n, step).chordStep!).has(pitchClass(n.pitch))) off.push(`${step} ${n.instrument} ${n.pitch}`);
          return;
        }
        for (let s = step; s < step + soundingSteps(planet, n); s++) {
          if (!modeAt(planet, s).has(pitchClass(n.pitch))) { off.push(`${step}+${s - step} ${n.instrument} ${n.pitch}`); return; }
        }
      };
      for (const stage of [1, 2, 3] as const) for (let step = 0; step < 512; step++) for (const n of bossStep(planet, step, stage)) check(n, step);
      for (let from = 3; from < 512; from += 23) {
        const boss = new BossArranger();
        boss.request(1, from); boss.request(2, from + 40); boss.request(3, from + 90);
        for (let step = from; step < from + 140; step++) for (const n of boss.notes(planet, step)) if (n.priority === 3) check(n, step);
      }
      expect(off.slice(0, 5), planet).toEqual([]);
    }
  });
  it('holds every reworked world\'s melody to its mode (Umbra\'s frozen score aside)', () => {
    for (const planet of PLANETS.filter(p => p !== 'umbra')) {
      const off = Array.from({ length: 512 }, (_, step) => scoreStep(planet, step).filter(n => LEAD[planet].includes(n.instrument)
        && !modeAt(planet, step).has(pitchClass(n.pitch))).map(n => `${step} ${n.pitch}`)).flat();
      expect(off, planet).toEqual([]);
    }
  });
  it('moves a stem tone off a clash with the melody\'s passing note, or leaves it out', () => {
    // Corona, step 200: over the ♭2 colour the lament reaches Saba's A♭; a G under it would grind, an E sits with it.
    expect(consonantWith('corona', 200, 67)).not.toBe(67);
    expect(clash(68, consonantWith('corona', 200, 67) ?? 68)).toBe(0);
    expect(consonantWith('corona', 200, 64)).toBe(64);
  });
});
