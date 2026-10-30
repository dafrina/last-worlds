import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Effect, Enemy, RunState } from '../../src/shared/contracts';
import { VIEW } from '../../src/shared/contracts';
import { SITE_MODELS } from '../../src/render/site-models';

// The view's GLB loading is replaced by a box per node (geometry only: the view logic is what is tested here).
vi.mock('../../src/render/models', () => ({
  loadTexturedNodes: async (_url: string, names: readonly string[]) => new Map(names.map(name => [name, [{
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial({ name: name.endsWith('_core') ? 'site_core_glow' : 'site_paint', emissive: 0xffffff }),
  }]])),
}));
const { createSiteView } = await import('../../src/render/site-view');

const view = { minX: -20, maxX: 20, minS: VIEW.minS - 3, maxS: VIEW.maxS + 6 };
function core(id: number, x: number, s: number, base: number): Enemy {
  return { id, kind: 'fuel', x, s, originX: x, hp: 40, maxHp: 40, radius: .55, age: 0, nextAttack: Infinity, warning: 0, aimX: x, groundHeight: .85,
    site: 'crash-site', ground: { dx: 0, ds: 0, x, s, base, afloat: false, cameraX: 0 } } as Enemy;
}
function run(enemies: Enemy[], distance = 100, effects: Effect[] = []): RunState {
  return { config: CONFIG, tick: 1, time: 1, distance, enemies, effects } as unknown as RunState;
}
const CONFIG = { mode: 'campaign', seed: 1 } as RunState['config'];

describe('site view (render only, docs/33 § 6)', () => {
  it('stands a site at its core, hides the core\'s own model, reserves its rectangle and keeps it destroyed after the kill', async () => {
    const scene = new THREE.Scene(), sites = createSiteView(scene, () => undefined);
    await sites.prepare('khepri');
    expect(sites.isReady('khepri')).toBe(true);
    const target = core(7, 7.5, 10, .2);
    sites.update(run([target]), 'khepri', view);
    expect(sites.hidesCore(7)).toBe(true);
    const model = SITE_MODELS['crash-site']!;
    expect(sites.clearings).toEqual([{ minX: 7.5 + model.x[0], maxX: 7.5 + model.x[1], minS: 110 + model.s[0], maxS: 110 + model.s[1] }]);
    const drawn = scene.children.find(child => child.name === 'site crash-site khepri' && child.visible)!;
    expect(drawn.position.x).toBe(7.5);
    expect(drawn.position.y).toBeCloseTo(.2);
    expect(drawn.position.z).toBeCloseTo(-10);
    // Killed: gone from the simulation with its kill explosion at its position.
    sites.update({ ...run([], 100.1, [{ id: 99, kind: 'explosion', x: 7.5, s: 10, ttl: .5, duration: .5 }]), tick: 2 } as RunState, 'khepri', view);
    expect(sites.stats.destroyed).toBe(1);
    expect(sites.clearings).toHaveLength(1);
    expect(drawn.visible).toBe(true);
    const [body, wreck, coreGroup, ruin] = drawn.children;
    expect([body.visible, wreck.visible, coreGroup.visible, ruin.visible]).toEqual([false, true, false, true]);
    // Its lamps are out and its paint darkened (the destroyed twins).
    const twin = (wreck.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(twin.color.r).toBeLessThan(.3);
    // Scrolled out of view: released.
    sites.update({ ...run([], 100 + 10 - VIEW.minS + model.s[1] + 5), tick: 3 } as RunState, 'khepri', view);
    expect(sites.stats.count).toBe(0);
  });

  it('a core that leaves without a kill explosion leaves the site intact', async () => {
    const sites = createSiteView(new THREE.Scene(), () => undefined);
    await sites.prepare('khepri');
    sites.update(run([core(3, 0, 8, 0)]), 'khepri', view);
    sites.update({ ...run([], 100.1), tick: 2 } as RunState, 'khepri', view);
    expect(sites.stats.destroyed).toBe(0);
    expect(sites.stats.count).toBe(1);
  });

  it('lifts a site onto rising ground (bounded) and squashes it about its core under the flight plane', async () => {
    const scene = new THREE.Scene(), sites = createSiteView(scene, () => undefined);
    await sites.prepare('khepri');
    sites.update(run([core(1, 0, 8, 0), core(2, -7.5, 12, 1.7)]), 'khepri', view, () => 5);
    const [low, high] = sites.stats.sites;
    expect(low.rise).toBeCloseTo(.4);
    expect(low.squash).toBe(1);
    const model = SITE_MODELS['crash-site']!, seat = 1.7 + high.rise;
    expect(high.squash).toBeLessThan(1);
    // The core stays at its seat's core height, the roof under the flight plane less the clearance.
    const group = scene.children.filter(child => child.name === 'site crash-site khepri' && child.visible)[1];
    expect(group.position.y + .85 * group.scale.y).toBeCloseTo(seat + .85);
    expect(group.position.y + model.top * group.scale.y).toBeLessThanOrEqual(VIEW.flightHeight - .45 + 1e-6);
  });

  it('leaves a world without a finish to the core\'s own model', async () => {
    const sites = createSiteView(new THREE.Scene(), () => undefined);
    await sites.prepare('umbra');
    const target = { ...core(5, 0, 8, 0), site: 'airfield' as const };
    sites.update(run([target]), 'umbra', view);
    expect(sites.hidesCore(5)).toBe(false);
    expect(sites.clearings).toHaveLength(0);
  });
});
