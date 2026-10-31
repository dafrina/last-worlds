import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WRECK_HOLD } from '../../src/content/bosses';
import { ENDLESS_CYCLE, endlessScroll, endlessSectorPlan } from '../../src/content/endless';
import { VIEW } from '../../src/shared/contracts';
import { VEIL_LIFT, VEIL_SHUT } from '../../src/render/fx-jump';
import { PERSPECTIVE_FOV, configureCamera, fitFlightViewport } from '../../src/render/scene';
import { viewFootprint } from '../../src/render/view-footprint';
import { runRoute } from '../../src/world/run-route';
import { SWAP_AHEAD, SWAP_BEHIND, arenaReaches, sectionSource, scrollRoute, type TerrainRoute } from '../../src/world/terrain';

/**
 * Planet swaps under the jump's veil (docs/18, 31 October 2026; user: "the terrain in endless is cutoff in front", after
 * the old planet had shown "a clear cut"). The release camera's ground footprint on the reference phone and on the
 * tallest ones the view fits (extra height shows foreground below the canonical 9:16 frame), from the deepest valley to
 * the scenery cap.
 */
const footprints = [[390, 844], [360, 800], [320, 760]].map(([width, height]) => {
  const camera = new THREE.PerspectiveCamera(PERSPECTIVE_FOV, 9 / 16, 1, 260);
  configureCamera(camera, 0); fitFlightViewport(camera, width, height); camera.updateMatrixWorld();
  return viewFootprint(camera);
});
const near = Math.min(...footprints.map(view => view.minS)), far = Math.max(...footprints.map(view => view.maxS));
const route = runRoute({ mode: 'endless' }), L = VIEW.sectionLength;
const { jumpDuration, resumeDuration, bossSector } = ENDLESS_CYCLE;

describe('planet swaps under the jump veil', () => {
  it('keeps both seams out of the real camera view', () => {
    expect(near).toBeLessThan(-8);
    expect(far).toBeGreaterThan(36);
    // From the flash the incoming planet reaches behind the bottom of the screen.
    expect(SWAP_BEHIND).toBeGreaterThan(-near + 2);
    for (const sector of [1, 4, 7, 10]) {
      const plan = endlessSectorPlan(sector), jump = plan.jump!, killedAt = bossSector.decelStart + bossSector.decelDuration + 10;
      // The incoming planet starts past everything the outgoing boss's clearing reaches (it never shapes the new world).
      const swap = route.swaps!(jump.flashDistance, jump.flashDistance + 1)[0], arena = route.worldAt(swap.incoming).arena;
      expect(arena).toEqual({ fromS: plan.stop!.platform.from, toS: plan.stop!.platform.to });
      for (let s = swap.incoming; s < swap.incoming + 40; s += 0.5) expect(arenaReaches(arena, s), `sector ${sector} at ${s}`).toBe(false);
      const shut = endlessScroll(plan, killedAt + WRECK_HOLD + resumeDuration + VEIL_SHUT * jumpDuration, killedAt).distance;
      // Until the veil is opaque the outgoing planet reaches past the top of the screen.
      expect(shut + far, `sector ${sector}`).toBeLessThan(jump.flashDistance + SWAP_AHEAD - 2);
      // The swap happens at the flash, under the opaque veil.
      expect(endlessScroll(plan, killedAt + WRECK_HOLD + resumeDuration + VEIL_LIFT * jumpDuration, killedAt).distance).toBeCloseTo(jump.flashDistance, 6);
    }
  });

  it.each([1, 4, 7, 10, 13, 16, 19])('shows one planet across the whole view at every visible moment of the departure and jump in sector %i', sector => {
    const plan = endlessSectorPlan(sector), jump = plan.jump!, killedAt = bossSector.decelStart + bossSector.decelDuration + 20;
    const start = killedAt + WRECK_HOLD + resumeDuration;
    let before = 0, after = 0;
    for (let tick = 0; ; tick++) {
      const tau = killedAt - 3 + tick / 60, scroll = endlessScroll(plan, tau, killedAt);
      if (scroll.phase === 'next') break;
      const q = (tau - start) / jumpDuration;
      // Under the fully opaque veil anything may show (the swap happens there).
      if (q > VEIL_SHUT && q < VEIL_LIFT) continue;
      const distance = scroll.distance, planet = distance < jump.flashDistance ? jump.from : jump.to;
      if (planet === jump.from) before++; else after++;
      expect(route.lookAt(distance)).toBe(planet);
      // Every visible row, generated from the version of its section the stream holds at this distance.
      for (let s = distance + near; s <= distance + far; s += 0.25) {
        const source = sectionSource(route, Math.floor(s / L), distance) as TerrainRoute;
        expect(source.worldAt(s).planet.id, `sector ${sector}, ${s - distance} from the ship at ${distance}`).toBe(planet);
      }
      // Seating on the shown terrain resolves the same planet.
      expect(scrollRoute(route, distance).worldAt(distance + near).planet.id).toBe(planet);
      expect(scrollRoute(route, distance).worldAt(distance + far).planet.id).toBe(planet);
    }
    expect(before).toBeGreaterThan(200);
    expect(after).toBeGreaterThan(40);
  });

  it('changes only the sections around each jump, and nothing in the campaign', () => {
    let changed = 0;
    for (let index = 0; index * L < 6000; index++) for (const distance of [index * L - 100, index * L + 100]) {
      if (sectionSource(route, index, distance) !== route) changed++;
    }
    // Two or three sections per jump, and only before its flash.
    const jumps = route.swaps!(0, 6000).length;
    expect(jumps).toBeGreaterThanOrEqual(4);
    expect(changed).toBeGreaterThanOrEqual(2 * jumps);
    expect(changed).toBeLessThanOrEqual(3 * jumps);
    for (const mission of ['training', 'bastion', 'cold-vector', 'deep-bloom', 'brood-strike', 'final-horizon'] as const) {
      const campaign = runRoute({ mode: 'campaign', mission });
      expect(campaign.swaps?.(-1000, 10000) ?? []).toEqual([]);
      for (let index = 0; index < 40; index++) expect(sectionSource(campaign, index, 0)).toBe(campaign);
    }
  });
});
