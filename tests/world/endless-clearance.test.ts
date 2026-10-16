import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ENDLESS_CYCLE, endlessSchedule, endlessScroll, endlessSectorPlan } from '../../src/content/endless';
import { VIEW } from '../../src/shared/contracts';
import { configureCamera } from '../../src/render/scene';
import { TERRAIN_MIN_HEIGHT } from '../../src/world/terrain';

// Derive the actual visible ground slab from the production camera, including deep valleys beyond the arena.
const camera = new THREE.OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, VIEW.width * 16 / 18, -VIEW.width * 16 / 18, .1, 100);
configureCamera(camera, 0);
const atHeight = (ny: number, height: number) => {
  const origin = new THREE.Vector3(0, ny, -1).unproject(camera);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  return -origin.addScaledVector(direction, (height - origin.y) / direction.y).z;
};
const near = atHeight(-1, VIEW.flightHeight), far = atHeight(1, TERRAIN_MIN_HEIGHT);
const schedule = endlessSchedule({ mode: 'endless' });

describe('endless boss terrain clearance', () => {
  it.each([1, 4, 7, 10, 13, 16, 19])('keeps the full camera view on the outgoing world through the fight and departure in sector %i', sector => {
    const plan = endlessSectorPlan(sector), stop = plan.stop!, jump = plan.jump!;
    const killedAt = ENDLESS_CYCLE.bossSector.decelStart + ENDLESS_CYCLE.bossSector.decelDuration + 30;
    // Whole boss fight, both seconds of scroll resume, and the jump's fade-in (maximum veil by q=.38).
    for (const sinceKill of [-30, -1, 0, 1, ENDLESS_CYCLE.resumeDuration, ENDLESS_CYCLE.resumeDuration + ENDLESS_CYCLE.jumpDuration * .38]) {
      const scroll = endlessScroll(plan, killedAt + sinceKill, sinceKill < 0 ? null : killedAt);
      expect(scroll.distance + far, `sector ${sector}, after kill ${sinceKill}s`).toBeLessThan(jump.switchDistance);
      expect(schedule.planetAt(scroll.distance + far)).toBe(plan.planet);
    }
    expect(jump.switchDistance).toBeGreaterThan(stop.platform.to);
    // The complete view is on the destination when the jump ends, with no outgoing terrain left at the bottom.
    expect(schedule.planetAt(jump.endDistance + near)).toBe(jump.to);
    expect(schedule.planetAt(jump.endDistance + far)).toBe(jump.to);
    const finish = endlessScroll(plan, killedAt + ENDLESS_CYCLE.resumeDuration + ENDLESS_CYCLE.jumpDuration, killedAt);
    expect(finish.phase).toBe('next');
    expect(finish.distance).toBe(endlessSectorPlan(sector + 1).startDistance);
  });
});
