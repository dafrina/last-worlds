import { describe, expect, it } from 'vitest';
import { MIRE_PERIOD, MIRE_SIZE, MIRE_TAPS, createMireDetail } from '../../src/render/mire-water';

describe("Nacre's mire water (3 November 2026)", () => {
  it('wraps its texture frame without a seam: every along-scroll scale is a whole number of tiles per period', () => {
    for (const [name, { m }] of Object.entries(MIRE_TAPS)) for (const along of [m[1], m[3]]) {
      const tiles = along * MIRE_PERIOD;
      expect(Math.abs(tiles - Math.round(tiles)), `${name}: ${along} × ${MIRE_PERIOD}`).toBeLessThan(1e-9);
    }
  });

  it('builds its detail texture in slices, tileable, with neutral slopes and mid fields on average', () => {
    const detail = createMireDetail();
    expect(detail.ready).toBe(false);
    let slices = 1;
    while (!detail.step()) slices++;
    expect(detail.ready).toBe(true);
    // Several slices (never one long block), each a bounded share of the work.
    expect(slices).toBeGreaterThan(8);
    const { data } = detail, size = MIRE_SIZE, at = (x: number, y: number, c: number) => data[(y * size + x) * 4 + c];
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let i = 0; i < size * size; i++) sum += data[i * 4 + c];
      expect(Math.abs(sum / (size * size) - 127.5), `channel ${c} mean`).toBeLessThan(10);
      // Tileable: across the wrap (last column to first, last row to first) the step is no larger than inside the tile.
      let inside = 0, wrap = 0;
      for (let y = 0; y < size; y++) { inside = Math.max(inside, Math.abs(at(size / 2, y, c) - at(size / 2 - 1, y, c))); wrap = Math.max(wrap, Math.abs(at(0, y, c) - at(size - 1, y, c))); }
      expect(wrap, `channel ${c} across x`).toBeLessThanOrEqual(inside * 1.5 + 2);
      inside = 0; wrap = 0;
      for (let x = 0; x < size; x++) { inside = Math.max(inside, Math.abs(at(x, size / 2, c) - at(x, size / 2 - 1, c))); wrap = Math.max(wrap, Math.abs(at(x, 0, c) - at(x, size - 1, c))); }
      expect(wrap, `channel ${c} across y`).toBeLessThanOrEqual(inside * 1.5 + 2);
    }
    detail.texture.dispose();
  });
});

