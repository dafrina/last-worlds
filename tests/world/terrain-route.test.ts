import { describe, expect, it } from 'vitest';
import { VIEW, type RunConfig } from '../../src/shared/contracts';
import { ENDLESS_CYCLE, endlessSchedule, endlessScroll, endlessSectorPlan } from '../../src/content/endless';
import { runPlanet } from '../../src/content/missions';
import { missionArena } from '../../src/render/scene';
import { runRoute } from '../../src/render/terrain-route';
import { NACRE_SEA_LEVEL } from '../../src/world/terrain-nacre';
import {
  ARENA_LEVEL, SEAM_CLEARANCE, inArenaCore, TERRAIN_STEP, VESPER_SEA_LEVEL, createTerrainStream, generateTerrainSection, sectionSource, sectionSteps, terrainHeight,
  type RouteSwap, type TerrainSection,
} from '../../src/world/terrain';

const SEA = VESPER_SEA_LEVEL, HALF = VIEW.worldWidth / 2, L = VIEW.sectionLength, SEED = 93;
const ENDLESS = { mode: 'endless', seed: SEED } as RunConfig;
const route = runRoute(ENDLESS), schedule = endlessSchedule(ENDLESS);
/**
 * The first four planet switches: Luna → Khepri after WARDEN-1 (the prologue), Khepri → Vesper after Bastion-9,
 * Vesper → Nacre after the Ark, then Nacre → Khepri after THE VEIL.
 */
const jumps = [1, 4, 7, 10].map(sector => endlessSectorPlan(sector)).map(plan => ({ plan, jump: plan.jump!, arena: plan.stop!.platform }));
const rowY = (section: TerrainSection, row: number) => Array.from({ length: section.across }, (_, c) => section.positions[(row * section.across + c) * 3 + 1]);

describe('terrain routes from the run schedule (docs/18 §3)', () => {
  it('keeps every campaign mission byte-identical to its single world', () => {
    for (const mission of ['training', 'bastion', 'cold-vector'] as const) {
      const config = { mode: 'campaign', mission, seed: SEED } as RunConfig, world = { planet: runPlanet(config), arena: missionArena(config) };
      for (const index of [0, 15, 16, 25, 26]) expect(generateTerrainSection(SEED, index, runRoute(config))).toEqual(generateTerrainSection(SEED, index, world));
    }
    // Endless opens on Luna, exactly Luna's own world (no arena reaches the first sections).
    for (const index of [0, 1, 4]) expect(generateTerrainSection(SEED, index, route)).toEqual(generateTerrainSection(SEED, index, { planet: 'luna' }));
    // 36 full sections: CI runners need well over the default 30 s (it timed out there on 15 October).
  }, 120_000);

  it('follows the schedule: each distance takes its stretch’s planet and the nearest arena', () => {
    // Around each jump the route moves the schedule's switch to its swap's seams (docs/18, 31 October): the route
    // switches SWAP_BEHIND short of the flash, its outgoing variant SWAP_AHEAD past it.
    const switches = schedule.stretches(0, 6100).slice(1).map(stretch => ({ at: stretch.from, jump: schedule.jumpAt(stretch.from)! }));
    const swaps = route.swaps!(0, 6100);
    expect(swaps.map(swap => swap.flash)).toEqual(switches.map(({ jump }) => jump.flashDistance));
    for (const [variant, seamOf] of [[route, (swap: RouteSwap) => swap.incoming], [route.outgoing!, (swap: RouteSwap) => swap.outgoing]] as const) {
      for (let s = -20; s < 6000; s += 3.7) {
        // Between the schedule's switch and the variant's seam, the planet on the seam's side of s.
        const world = variant.worldAt(s), k = swaps.findIndex((swap, i) => s >= Math.min(switches[i].at, seamOf(swap)) && s < Math.max(switches[i].at, seamOf(swap)));
        const planet = k < 0 ? schedule.planetAt(Math.max(0, s)) : s >= seamOf(swaps[k]) ? switches[k].jump.to : switches[k].jump.from;
        expect(world.planet.id, `${variant.key} at ${s}`).toBe(planet);
        const arena = schedule.arenaAt(s);
        if (arena) expect(world.arena).toEqual({ fromS: arena.from, toS: arena.to });
      }
    }
    // Sections wholly on one planet are generated as that planet (Vesper has water and floes; Khepri none).
    // A section wholly inside one world (one planet, one arena owner) in sector 6 (Vesper) and in sector 3 (Khepri).
    const single = (sector: number) => {
      const plan = endlessSectorPlan(sector);
      for (let i = Math.ceil(plan.startDistance / L); (i + 1) * L <= plan.endDistance; i++) if (route.spans(i * L, (i + 1) * L).length === 1) return i;
      throw new Error(`no single-world section in sector ${sector}`);
    };
    const vi = single(6), ki = single(3);
    const vesper = generateTerrainSection(SEED, vi, route), khepri = generateTerrainSection(SEED, ki, route);
    expect(schedule.planetAt(vi * L)).toBe('vesper'); expect(vesper.water?.level).toBe(SEA); expect(vesper.floes).toBeDefined();
    expect(vesper).toEqual(generateTerrainSection(SEED, vi, { planet: 'vesper', arena: route.worldAt(vi * L).arena }));
    expect(schedule.planetAt(ki * L)).toBe('khepri'); expect(khepri.water).toBeUndefined();
  });

  it('gives every endless boss stop its planet’s arena: levelled Luna, Khepri platform, open mire, Vesper open water', () => {
    const arenas = schedule.arenas(0, 8000);
    expect(arenas.map(arena => arena.boss).slice(0, 5)).toEqual(['warden', 'bastion', 'ark', 'veil', 'bastion']);
    for (const arena of arenas.slice(0, 4)) for (let s = arena.from + 0.5; s < arena.to; s += 1) for (let x = -HALF; x <= HALF; x += 0.5) {
      // The boss clearing (its core oval); the planet's own terrain carries on around it.
      if (!inArenaCore({ fromS: arena.from, toS: arena.to }, x, s)) continue;
      const height = terrainHeight(SEED, x, s, route);
      // Luna's craters level out to a flat floor (height 0).
      if (arena.planet === 'luna') expect(Math.abs(height)).toBeLessThan(0.05);
      // Nacre's islands recede: open mire.
      else if (arena.planet === 'nacre') expect(height).toBeLessThan(NACRE_SEA_LEVEL - 0.2);
      // Khepri's paved floor (as in Rolling Thunder).
      else if (arena.planet === 'khepri') expect(Math.abs(height - ARENA_LEVEL)).toBeLessThan(0.25);
      else expect(height).toBeLessThan(SEA - 0.5);
    }
  });

  it('hands each arena midpoint to the next arena, so spans always advance (endless freeze regression)', () => {
    // The midpoints between endless arenas tie exactly; a segment that ended at its own query froze the game at ~1455.
    const arenas = [...schedule.arenas(0, 12000)].sort((a, b) => a.from - b.from);
    expect(arenas.length).toBeGreaterThan(5);
    for (let i = 0; i + 1 < arenas.length; i++) {
      const mid = (arenas[i].to + arenas[i + 1].from) / 2;
      expect(route.worldAt(mid).arena).toEqual({ fromS: arenas[i + 1].from, toS: arenas[i + 1].to });
      expect(route.worldAt(mid - 1e-6).arena).toEqual({ fromS: arenas[i].from, toS: arenas[i].to });
      const spans = route.spans(mid - 400, mid + 400);
      expect(spans[0].from).toBe(mid - 400); expect(spans[spans.length - 1].to).toBe(mid + 400);
      spans.forEach((span, k) => { expect(span.to).toBeGreaterThan(span.from); if (k) expect(span.from).toBe(spans[k - 1].to); });
    }
    // The terrain view's own window (one section back, 400 ahead) across two full planet cycles.
    for (let d = 0; d < 6000; d += 0.5) if (!route.spans(d - L, d + 400).length) throw new Error(`no spans at ${d}`);
  });

  it('splits the section at a planet switch: a clean hard seam, matching neighbours, nothing near it', () => {
    // Each jump has two seams (docs/18, 31 October): the route's, short of the flash, drawn from the flash on; and its
    // outgoing variant's, past it, drawn until the flash. Both split their section the same clean way.
    const seams = jumps.flatMap(({ jump, arena }) => {
      const swap = route.swaps!(jump.flashDistance, jump.flashDistance + 1)[0];
      expect(swap.flash).toBe(jump.flashDistance);
      return [{ jump, arena, variant: route, switchDistance: swap.incoming }, { jump, arena, variant: route.outgoing!, switchDistance: swap.outgoing }];
    });
    for (const { jump: { from, to }, arena, variant, switchDistance } of seams) {
      const jump = { from, to, switchDistance }, route = variant;
      const index = Math.floor(jump.switchDistance / L), [before, split, after] = [index - 1, index, index + 1].map(i => generateTerrainSection(SEED, i, route));
      // Seams with both neighbours match exactly (heights, colours, normals).
      for (const [a, b] of [[before, split], [split, after]]) {
        const last = (a.along - 1) * a.across;
        for (let c = 0; c < a.across; c++) for (let k = 0; k < 3; k++) {
          if (k !== 2) expect(a.positions[(last + c) * 3 + k]).toBe(b.positions[c * 3 + k]);
          expect(a.colors[(last + c) * 3 + k]).toBe(b.colors[c * 3 + k]);
          expect(a.normals[(last + c) * 3 + k]).toBe(b.normals[c * 3 + k]);
        }
      }
      // Rows before the switch are the old planet's ground, rows from it the new planet's, each with the arena.
      const old = generateTerrainSection(SEED, index, { planet: jump.from, arena: { fromS: arena.from, toS: arena.to } });
      const next = generateTerrainSection(SEED, index, { planet: jump.to, arena: { fromS: arena.from, toS: arena.to } });
      for (let row = 0; row < split.along; row++) {
        const s = split.startS + row * TERRAIN_STEP;
        expect(rowY(split, row)).toEqual(rowY(s < jump.switchDistance ? old : next, row));
      }
      // The sea's rows have water; the dry planet's rows never count as wet (a dry-to-dry seam has no water at all).
      // (One water sheet per section: across a Nacre → Vesper switch it keeps the first sea's level for the rest of that section.)
      const levelOf = (planet: string) => planet === 'vesper' ? SEA : planet === 'nacre' ? NACRE_SEA_LEVEL : null;
      const firstSea = levelOf(jump.from) ?? levelOf(jump.to);
      if (firstSea === null) expect(split.water).toBeUndefined(); else expect(split.water?.level).toBe(firstSea);
      if (split.water) for (let row = 0; row < split.along; row++) {
        const s = split.startS + row * TERRAIN_STEP, wetPlanet = levelOf(s < jump.switchDistance ? jump.from : jump.to) !== null;
        if (!wetPlanet) for (let c = 0; c < split.across; c++) expect(split.water!.shore[row * split.across + c]).toBeLessThanOrEqual(0);
      }
      // Nothing stands, floats or drifts at the seam beyond the arena; pieces keep SEAM_CLEARANCE.
      for (const section of [before, split, after]) {
        const near = (s: number) => Math.abs(s - jump.switchDistance) < SEAM_CLEARANCE;
        for (const piece of section.instances) expect(near(piece.s)).toBe(false);
        for (const prop of section.props) expect(near(prop.s)).toBe(false);
        for (const piece of section.industry) expect(near(piece.s)).toBe(false);
        for (const floe of section.floes ?? []) expect(near(floe.s) || (floe.s >= arena.from && floe.s <= arena.to)).toBe(false);
      }
      // Resumable generation of the split section is identical.
      const work = sectionSteps(SEED, index, route);
      let step = work.next();
      while (!step.done) step = work.next();
      expect(step.value).toEqual(split);
    }
  }, 120_000); // Both seams of every jump since the swap under the veil (31 October): about 7 s here, several times that on a CI runner.

  it('streams through every planet jump at peak hyperdrive speed from prefetched sections, with no fallback, swapping planets at the flash', () => {
    for (const { plan, jump } of jumps) {
      const stream = createTerrainStream(SEED, route);
      // The boss falls a second after the stop: exercise the faster jump over the outgoing terrain buffer too.
      const timeline = ENDLESS_CYCLE.bossSector, bossEnd = timeline.decelStart + timeline.decelDuration + 1;
      let peak = 0, maxSteps = 0, previous = -Infinity;
      const checked: number[] = [];
      for (let tau = timeline.decelStart - 20; tau < bossEnd + ENDLESS_CYCLE.resumeDuration + ENDLESS_CYCLE.jumpDuration + 14; tau += 1 / 60) {
        const scroll = endlessScroll(plan, tau, bossEnd), distance = scroll.phase === 'next' ? jump.endDistance + (tau - bossEnd - 5) * jump.cruise : scroll.distance;
        peak = Math.max(peak, scroll.speed);
        expect(distance).toBeGreaterThanOrEqual(previous - 1e-9);
        const window = stream.update(distance);
        // The last frame before the flash shows the outgoing versions, the first from it the incoming ones (the swap).
        if ((previous < jump.flashDistance) !== (distance < jump.flashDistance) || (distance < jump.flashDistance && distance + 1 / 60 * scroll.speed >= jump.flashDistance)) {
          for (const section of window) expect(section).toEqual(generateTerrainSection(SEED, section.index, sectionSource(route, section.index, distance)));
          checked.push(distance);
        }
        previous = distance;
        // The same slice as the flight tests: thirty resumable steps a frame (about a millisecond).
        let used = 0, left = 30;
        stream.prefetch(distance, () => { const more = left-- > 0; if (more) used++; return more; });
        maxSteps = Math.max(maxSteps, used);
      }
      // `jump.peak` is the speed at mid-warp; the fastest moment is at or just past it.
      expect(peak).toBeGreaterThanOrEqual(jump.peak - 0.05);
      expect(peak).toBeLessThan(jump.peak + 2);
      expect(peak).toBeGreaterThan(11);
      expect(stream.stats.startup).toBe(3);
      expect(stream.stats.fallbacks).toBe(0);
      expect(stream.stats.prefetched).toBeGreaterThanOrEqual(2);
      expect(checked.filter(distance => distance < jump.flashDistance).length).toBeGreaterThan(0);
      expect(checked.filter(distance => distance >= jump.flashDistance).length).toBe(1);
      for (const section of stream.update(previous)) expect(section).toEqual(generateTerrainSection(SEED, section.index, route));
    }
  }, 240_000); // Streams every planet's terrain at jump speed, both route versions since the swap under the veil (31 October): about 14 s here, over 60 s on a CI runner.
});
