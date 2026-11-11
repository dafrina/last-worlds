import { describe, expect, it } from 'vitest';
import { audit } from '../../src/audio/harmony-audit';
import { clash, consonantWith } from '../../src/audio/harmony';
import { THEMES } from '../../src/audio/score';
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
    // The melodies keep their own intervals against the accompaniment: Amnion's tritones and minor ninths over its
    // uneasy chords are its character. Luna's one and Khepri's two are the melody's last note ringing across a chord
    // change onto the new root, as written. Corona's Hijaz ♭2 (C over the B major dominant) passes over the held
    // drone, which the audit counts as the melody's own motion.
    const approved: Partial<Record<PlanetId, number>> = { luna: 1, khepri: 2, amnion: 55 };
    for (const planet of PLANETS) expect(audit(planet, 0).length, planet).toBe(approved[planet] ?? 0);
  });
  it('moves a stem tone off a clash with the melody\'s passing note, or leaves it out', () => {
    // Corona, step 134: the lament reaches its ♭6 (C over Em); a B under it would grind, an E sits with it.
    expect(consonantWith('corona', 134, 59)).not.toBe(59);
    expect(clash(60, consonantWith('corona', 134, 59) ?? 60)).toBe(0);
    expect(consonantWith('corona', 134, 52)).toBe(52);
  });
});
