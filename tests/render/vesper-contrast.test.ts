import { describe, expect, it } from 'vitest';
import { WORLD_PAINT, setWorldPaint, worldPaintUniforms } from '../../src/render/world-paint';

describe('Vesper enemy contrast (world paint, 3 November 2026)', () => {
  it("gives Vesper's craft their own darker ramp and an edge shade; buildings, compounds, other worlds and the hero keep theirs", () => {
    const craft = worldPaintUniforms(), building = worldPaintUniforms();
    setWorldPaint(craft, 'vesper', 'craft'); setWorldPaint(building, 'vesper', 'building');
    expect(craft.worldEdge.value).toBeGreaterThan(0);
    // The craft ramp is darker at both ends than the buildings' (which keep the shipped ramp exactly).
    expect(craft.worldLight.value.getHex()).not.toBe(building.worldLight.value.getHex());
    expect(WORLD_PAINT.vesper.light).toBe(0xf2f6fa); expect(WORLD_PAINT.vesper.dark).toBe(0x56616d);
    expect(building.worldEdge.value).toBe(0);
    setWorldPaint(building, 'vesper', 'facility'); expect(building.worldEdge.value).toBe(0);
    for (const planet of ['khepri', 'luna', 'nacre', 'amnion', 'umbra'] as const) { setWorldPaint(craft, planet, 'craft'); expect(craft.worldEdge.value, planet).toBe(0); }
    setWorldPaint(craft, null, 'craft'); expect(craft.worldEdge.value).toBe(0);
  });
});
