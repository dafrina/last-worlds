import { describe, expect, it } from 'vitest';
import { retain } from '../../src/shared/retain';

describe('retain', () => {
  it('keeps what filter keeps, in order, in the same array', () => {
    const items = [5, 1, 8, 2, 9, 3, 7], expected = items.filter(n => n > 4);
    const same = items;
    retain(items, n => n > 4);
    expect(items).toBe(same);
    expect(items).toEqual(expected);
  });
  it('asks about each item once, in order, so a predicate with side effects behaves as with filter', () => {
    const effects = [{ ttl: .5 }, { ttl: .01 }, { ttl: 2 }], seen: number[] = [];
    retain(effects, effect => { seen.push(effect.ttl); return (effect.ttl -= .1) > 0; });
    expect(seen).toEqual([.5, .01, 2]);
    expect(effects.map(effect => effect.ttl)).toEqual([.4, 1.9]);
  });
  it('empties and keeps everything', () => {
    const all = [1, 2, 3], none = [1, 2, 3];
    retain(all, () => true); retain(none, () => false);
    expect(all).toEqual([1, 2, 3]);
    expect(none).toEqual([]);
  });
});
