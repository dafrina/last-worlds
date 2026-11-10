import { expect, it } from 'vitest';
import { createHeroTrail, HERO_TRAIL_STRIPS } from '../../src/render/hero-trail';

it.each([30, 60, 120])('the wake follows a reversal and reaches its full extent at %i fps', fps => {
  const trail = createHeroTrail(), engines: [number, number][] = [[0, 0]];
  const pieces: number[][] = [];
  for (let i = 0; i <= 2 * fps; i++) {
    const t = i / fps;
    pieces.length = 0;
    trail.draw(t, 6 * t, Math.min(t, 2 - t) * 5, 0, 1, engines, 1, 23, (...piece) => pieces.push(piece));
  }
  expect(pieces[0].slice(0, 2)).toEqual([0, -0]);
  expect(pieces[0][2]).toBeGreaterThan(0);
  expect(Math.max(...pieces.map(p => p[2]))).toBeCloseTo(5, 1);
  expect(-pieces.at(-1)![3]).toBeCloseTo(11.5, 6);
  expect(pieces.length * 4).toBeLessThanOrEqual(HERO_TRAIL_STRIPS);
  const paused: number[][] = [];
  trail.draw(2, 12, 0, 0, 1, engines, 1, 23, (...piece) => paused.push(piece));
  expect(paused).toEqual(pieces);
});

it('ends halfway from each nozzle to the screen boundary with the arena stopped', () => {
  const trail = createHeroTrail(), engines: [number, number][] = [[-1, 1], [1, 2]];
  const ends = new Map<number, number>();
  for (let i = 0; i <= 120; i++) {
    ends.clear();
    trail.draw(i / 60, 0, 0, 0, 1, engines, 1, 11, (x, _s, _nx, ns) => ends.set(x, -ns));
  }
  expect(ends.get(-1)).toBe(6);
  expect(ends.get(1)).toBe(6.5);
});
