import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Effect, Enemy, RunState, SiteId } from '../../src/shared/contracts';
import { VIEW } from '../../src/shared/contracts';
import { SITE_MODELS } from '../../src/render/site-models';
import { SITE_CORE_HEIGHT } from '../../src/content/sites';

// The view's GLB loading is replaced by a box per node (geometry only: the view logic is what is tested here).
vi.mock('../../src/render/models', () => ({
  loadTexturedNodes: async (_url: string, names: readonly string[]) => new Map(names.map(name => [name, [{
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial({ name: name.endsWith('_core') ? 'site_core_glow' : 'site_paint', emissive: 0xffffff }),
  }]])),
}));
const { createSiteView, SITE_PAD_BLEND, SITE_PAD_KEEP } = await import('../../src/render/site-view');
const { sitePadGround, sitePadWeight } = await import('../../src/render/terrain-kit');

const view = { minX: -20, maxX: 20, minS: VIEW.minS - 3, maxS: VIEW.maxS + 6 };
function core(id: number, x: number, s: number, base: number, site: SiteId = 'crash-site', slot = 0, group = 1): Enemy {
  return { id, kind: 'fuel', x, s, originX: x, hp: 40, maxHp: 40, radius: .7, age: 0, nextAttack: Infinity, warning: 0, aimX: x, groundHeight: SITE_CORE_HEIGHT[site],
    site, formation: { template: `site-core-${site}`, slot, anchorX: x, mirror: 1, group }, ground: { dx: 0, ds: 0, x, s, base, afloat: false, cameraX: 0 } } as Enemy;
}
const CONFIG = { mode: 'campaign', seed: 1 } as RunState['config'];
function run(enemies: Enemy[], distance = 100, effects: Effect[] = [], tick = 1): RunState {
  return { config: CONFIG, tick, time: tick, distance, enemies, effects } as unknown as RunState;
}
const boom = (x: number, s: number): Effect => ({ id: 99, kind: 'explosion', x, s, ttl: .5, duration: .5 });
const shown = (scene: THREE.Scene, site: SiteId) => scene.children.filter(child => child.name === `site ${site} khepri` && child.visible);

describe('site view (render only, docs/33 § 6)', () => {
  it('stands a site at its core, hides the core\'s own model, reserves its rectangle and keeps it destroyed after the kill', async () => {
    const scene = new THREE.Scene(), sites = createSiteView(scene, () => undefined);
    await sites.prepare('khepri');
    expect(sites.isReady('khepri')).toBe(true);
    sites.update(run([core(7, 7.5, 10, .2)]), 'khepri', view);
    expect(sites.hidesCore(7)).toBe(true);
    const model = SITE_MODELS['crash-site']!;
    // Its rectangle and the pad's blend band around it are cleared of scenery; the ground under it levels to its floor.
    const b = SITE_PAD_BLEND;
    expect(sites.clearings).toEqual([{ minX: 7.5 + model.x[0] - b, maxX: 7.5 + model.x[1] + b, minS: 110 + model.s[0] - b, maxS: 110 + model.s[1] + b }]);
    expect(sites.pads).toEqual([{ minX: 7.5 + model.x[0], maxX: 7.5 + model.x[1], minS: 110 + model.s[0], maxS: 110 + model.s[1], level: .2, blend: b, fill: .2 }]);
    const [drawn] = shown(scene, 'crash-site');
    expect(drawn.position.toArray().map(n => +n.toFixed(3))).toEqual([7.5, .2, -10]);
    // Killed: gone from the simulation with its kill explosion at its position.
    sites.update(run([], 100.1, [boom(7.5, 10)], 2), 'khepri', view);
    expect(sites.stats.destroyed).toBe(1);
    expect(drawn.visible).toBe(true);
    const [body, wreck, coreGroup, ruin] = drawn.children;
    expect([body.visible, wreck.visible, coreGroup.visible, ruin.visible]).toEqual([false, true, false, true]);
    // Its lamps are out and its paint darkened (the destroyed twins).
    expect(((wreck.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.r).toBeLessThan(.3);
    // Scrolled out of view: released.
    sites.update(run([], 100 + 10 - VIEW.minS + model.s[1] + 5, [], 3), 'khepri', view);
    expect(sites.stats.count).toBe(0);
  });

  it('a core that leaves without a kill explosion leaves the site intact', async () => {
    const sites = createSiteView(new THREE.Scene(), () => undefined);
    await sites.prepare('khepri');
    sites.update(run([core(3, 0, 8, 0)]), 'khepri', view);
    sites.update(run([], 100.1, [], 2), 'khepri', view);
    expect(sites.stats.destroyed).toBe(0);
    expect(sites.stats.count).toBe(1);
  });

  it('levels the ground under its floor, keeps a battery\'s ground (foundations fill the drop there), and squashes a site on high ground about its core', async () => {
    const scene = new THREE.Scene(), sites = createSiteView(scene, () => undefined);
    await sites.prepare('khepri');
    // A guard battery right at the airfield's edge: the pad leaves its ground as it is.
    const guard = { ...core(3, 3.2, 8, -1), kind: 'turret', site: undefined, formation: undefined } as Enemy;
    sites.update(run([core(1, 0, 8, 0, 'airfield', 0, 1), core(2, -7.5, 12, 1.0, 'airfield', 0, 2), guard]), 'khepri', view, () => -1);
    expect(sites.pads.map(pad => pad.level).sort()).toEqual([0, 1]);
    expect(sites.keeps).toEqual([{ x: 3.2, s: 108, radius: SITE_PAD_KEEP }]);
    // The battery falls: its wreck keeps its ground while the site is tracked.
    sites.update(run([core(1, 0, 8, 0, 'airfield', 0, 1), core(2, -7.5, 12, 1.0, 'airfield', 0, 2)], 100, [], 2), 'khepri', view, () => -1);
    expect(sites.keeps).toEqual([{ x: 3.2, s: 108, radius: SITE_PAD_KEEP }]);
    // The levelled ground leaves no drop but where the battery keeps its own.
    expect(sites.stats.foundations).toBeGreaterThan(0);
    expect(sites.stats.foundations).toBeLessThan(10);
    const [low, high] = sites.stats.sites;
    expect(low.squash).toBe(1);
    expect(high.squash).toBeLessThan(1);
    const model = SITE_MODELS.airfield!, c = SITE_CORE_HEIGHT.airfield, group = shown(scene, 'airfield')[1];
    // The core stays at its target height, the roof under the flight plane less the clearance.
    expect(group.position.y + c * group.scale.y).toBeCloseTo(1.0 + c);
    expect(group.position.y + model.top * group.scale.y).toBeLessThanOrEqual(VIEW.flightHeight - .45 + 1e-6);
  });

  it('draws the sealed vault once for its three seals, each seal at its own anchor, destroyed when the last falls', async () => {
    const scene = new THREE.Scene(), sites = createSiteView(new THREE.Scene(), () => undefined);
    void scene;
    await sites.prepare('umbra');
    const k = 1.06, seals = [core(11, 6.5, 9.6, 0, 'sealed-vault', 0, 5), core(12, 8.5, 9.6, 0, 'sealed-vault', 1, 5), core(13, 7.5, 11, 0, 'sealed-vault', 2, 5)];
    // Anchors as the lens seats them: the slots' offsets (±1, −0.4; 0, 1) spread on the ground.
    seals[0].ground!.x = 7.5 - k; seals[0].ground!.s = 10 - .4 * k; seals[1].ground!.x = 7.5 + k; seals[1].ground!.s = 10 - .4 * k;
    seals[2].ground!.x = 7.5; seals[2].ground!.s = 10 + k;
    sites.update(run(seals), 'umbra', view);
    expect(sites.stats.count).toBe(1);
    expect(sites.stats.sites[0].cores).toBe(3);
    expect(seals.every(seal => sites.hidesCore(seal.id))).toBe(true);
    expect((sites.clearings[0].minX + sites.clearings[0].maxX) / 2).toBeCloseTo(7.5 + (SITE_MODELS['sealed-vault']!.x[0] + SITE_MODELS['sealed-vault']!.x[1]) / 2, 1);
    sites.update(run(seals.slice(1), 100.1, [boom(6.5, 9.6)], 2), 'umbra', view);
    expect(sites.stats.destroyed).toBe(0);
    sites.update(run([], 100.2, [boom(8.5, 9.6), boom(7.5, 11)], 3), 'umbra', view);
    expect(sites.stats.destroyed).toBe(1);
  });

  it('pads level the ground over the rectangle and ease back across the blend band, never under a kept battery', () => {
    const pad = { minX: 0, maxX: 4, minS: 10, maxS: 16, level: 1, blend: .9, fill: 1 };
    expect(sitePadWeight(pad, 2, 13)).toBe(1);
    expect(sitePadWeight(pad, 4, 13)).toBe(1);
    expect(sitePadWeight(pad, 4.45, 13)).toBeCloseTo(.5);
    expect(sitePadWeight(pad, 4.9, 13)).toBe(0);
    expect(sitePadWeight(pad, 2, 9.5)).toBeGreaterThan(sitePadWeight(pad, 2, 9.3));
    const keep = { x: 4.3, s: 13, radius: 1.1 };
    expect(sitePadWeight(pad, 4.3, 13, [keep])).toBe(0);
    expect(sitePadWeight(pad, 4.3 - .5, 13, [keep])).toBe(0);
    expect(sitePadWeight(pad, 2, 13, [keep])).toBe(1);
    // Cut down and filled up to the floor; over the sea (a deck site) the seabed fills only to under the water.
    expect(sitePadGround(pad, 3, 1)).toBe(1);
    expect(sitePadGround(pad, -2, 1)).toBe(1);
    expect(sitePadGround(pad, -2, .5)).toBeCloseTo(-.5);
    const deck = { ...pad, level: .14, fill: -.05 };
    expect(sitePadGround(deck, -2, 1)).toBeCloseTo(-.05);
    expect(sitePadGround(deck, .05, 1)).toBe(.05);
    expect(sitePadGround(deck, .5, 1)).toBe(.14);
  });
});
