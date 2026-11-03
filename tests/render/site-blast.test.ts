import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFx, type SiteBlast } from '../../src/render/fx-particles';
import { createRun } from '../../src/sim/game';
import { HERO_STENCIL } from '../../src/render/hero-stencil';
import type { PlanetId, RunState } from '../../src/shared/contracts';

/** A destroyed airfield-sized site 7.5 out on the east route, its core 10 ahead, its floor at 0.3 (world frame). */
const blast = (finish: PlanetId, effect?: number): SiteBlast => ({
  kind: 'site', finish, effects: effect === undefined ? [] : [effect], floor: .3, accent: 0x18ffd4, seed: 41,
  core: { x: 7.5, y: 2.15, z: -10 }, centre: { x: 7.65, z: -10.05 }, half: { x: 2.85, z: 3.25 },
  masses: [{ x: 9.9, y: .9, z: -7.6 }, { x: 5.8, y: .7, z: -12.9 }, { x: 9, y: .6, z: -12.7 }, { x: 10, y: .5, z: -10.7 }],
});
const layer = (scene: THREE.Scene, name: string) => scene.getObjectByName(name) as THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
/** Plays a site's destruction for `seconds` at 30 frames a second; the peak live particles of each pool. */
function play(fx: ReturnType<typeof createFx>, state: RunState, seconds: number) {
  const peak = { wreckGlow: 0, wreckSmoke: 0, ground: 0, glow: 0, smoke: 0 };
  for (let t = 0; t <= seconds + 1e-9; t += 1 / 30) {
    state.time += 1 / 30; state.tick += 2;
    fx.update(state, []);
    for (const name of Object.keys(peak) as (keyof typeof peak)[]) peak[name] = Math.max(peak[name], fx.pools[name].live);
  }
  return peak;
}

describe('strike-site destruction (render only, docs/33 § 6)', () => {
  it('replaces the core\'s kill explosion with one anchored sequence around the hero, within half the wreck pools, gone after about three seconds', () => {
    const scene = new THREE.Scene(), fx = createFx(scene), state = createRun({ mode: 'campaign', mission: 'bastion', seed: 3 });
    const kill = state.nextId++;
    state.effects.push({ id: kill, kind: 'explosion', x: 6.9, s: 8.4, ttl: .5, duration: .5 });
    fx.siteBlast(blast('khepri', kill));
    fx.update(state, []);
    // The kill explosion is left out (no flight-plane fireball); the sequence burns in the wreck pair, which draws around the hero.
    expect(fx.pools.glow.live).toBe(0);
    expect(fx.pools.smoke.live).toBe(0);
    const glow = layer(scene, 'fx wreck glow');
    expect(glow.count).toBeGreaterThan(50);
    expect(glow.material.stencilFunc).toBe(THREE.NotEqualStencilFunc);
    expect(glow.material.stencilRef).toBe(HERO_STENCIL);
    // Anchored: the world scrolls 6 units and lurches 3 to the side, and every particle moves with the ground (never with the camera).
    const smoke = layer(scene, 'fx wreck smoke'), before = new THREE.Matrix4(), after = new THREE.Matrix4();
    smoke.getMatrixAt(0, before);
    state.distance += 6; state.cameraX += 3; state.tick++;
    fx.update(state, []);
    smoke.getMatrixAt(0, after);
    expect(after.elements[14] - before.elements[14]).toBeCloseTo(6, 4);
    expect(after.elements[12]).toBeCloseTo(before.elements[12], 4);
    // Emitted once: later frames only age it, and it has burned out by 3.5 s.
    const peak = play(fx, state, 3.5);
    expect(peak.wreckGlow).toBeLessThanOrEqual(fx.pools.wreckGlow.capacity / 2);
    expect(peak.wreckSmoke).toBeLessThanOrEqual(fx.pools.wreckSmoke.capacity / 2);
    expect(peak.ground).toBeLessThanOrEqual(8);
    expect(fx.pools.wreckGlow.live + fx.pools.wreckSmoke.live + fx.pools.ground.live).toBe(0);
    fx.dispose();
  });

  it('settles its embers and fragments on the site\'s floor', () => {
    const scene = new THREE.Scene(), fx = createFx(scene), state = createRun({ mode: 'campaign', mission: 'bastion', seed: 3 });
    fx.siteBlast(blast('khepri'));
    play(fx, state, 1.4);
    const glow = layer(scene, 'fx wreck glow'), smoke = layer(scene, 'fx wreck smoke'), at = new THREE.Matrix4();
    let lowest = Infinity;
    for (const mesh of [glow, smoke]) for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, at); lowest = Math.min(lowest, at.elements[13]); }
    expect(lowest).toBeGreaterThanOrEqual(.3);
    expect(lowest).toBeLessThan(.4);
    fx.dispose();
  });

  it('keeps the whole sequence on every world, smaller on Low; a vault seal is one blast', () => {
    const peaks: Record<string, { high: number; low: number; seal: number }> = {};
    for (const finish of ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'umbra'] as const) {
      const run = (quality: 'high' | 'low', kind: SiteBlast['kind'] = 'site') => {
        const scene = new THREE.Scene(), fx = createFx(scene), state = createRun({ mode: 'campaign', mission: 'bastion', seed: 3 });
        fx.setQuality(quality); fx.siteBlast({ ...blast(finish), kind }); fx.update(state, []);
        const peak = play(fx, state, 3.5), total = peak.wreckGlow + peak.wreckSmoke + peak.ground;
        fx.dispose();
        return total;
      };
      peaks[finish] = { high: run('high'), low: run('low'), seal: run('high', 'seal') };
      expect(peaks[finish].low).toBeLessThan(peaks[finish].high / 2);
      expect(peaks[finish].seal).toBeLessThan(peaks[finish].high / 3);
    }
    // Amnion's ichor splashes (three layers each) cost a few more than fire puffs.
    expect(peaks.amnion.high).toBeGreaterThan(peaks.khepri.high);
  });
});
