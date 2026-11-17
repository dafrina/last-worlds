import { describe, expect, it } from 'vitest';
import { MeshPhysicalMaterial, ShaderLib, type WebGLRenderer } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { CAMPAIGN_SCROLL, PACE } from '../../src/content/balance';
import { scrollForPace } from '../../src/content/endless';
import { VIEW, type RunConfig } from '../../src/shared/contracts';
import { missionArena } from '../../src/render/scene';
import { createTerrainMaterials, extractKitNode } from '../../src/render/terrain-kit';
import { CITADEL_AT, naharaLandform } from '../../src/world/terrain-nahara';
import type { PlanetRow } from '../../src/world/terrain-planet';
import { UMBRA_SCENERY_MAX } from '../../src/world/terrain-umbra';
import { KIT, MESH_HALF, NAHARA_CLIFF_KINDS, NAHARA_KIT_KINDS, TERRAIN_STEP, createTerrainStream, generateTerrainSection, kitNodeName, terrainSample,
  type KitKind } from '../../src/world/terrain';
import { ARCH_PIERS, NAHARA_PLANS, SAND_SHELTER_REACH, groundAt, groundPlans, sandRipples, sandShelters } from '../../src/world/sand-shelter';

// Node built-ins without @types/node: a non-literal specifier keeps the typecheck dependency-free.
const fs: { existsSync(path: string): boolean; readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));
const NAHARA = { planet: 'nahara' as const }, HALF = VIEW.worldWidth / 2;
/** The canyon floor's own pieces (src/world/terrain-nahara.ts canyonFloor; tumbled blocks are shared with other dressing). */
const FLOOR = new Set<KitKind>(['nahDrums', 'nahStub', 'nahFooting', 'nahDebris', 'nahRelic']);

describe('Nahara canyon floor (docs/39, 15 November)', () => {
  it('lies on the canyon\'s ledges and slopes: never down in the haze, on a stream, over the scenery cap or outside the world', () => {
    const kinds = new Set<string>();
    let count = 0, cosmetic = 0;
    for (const seed of [93, 8831, 11]) for (let index = 1; index < 9; index++) {
      for (const piece of generateTerrainSection(seed, index, NAHARA).instances) {
        if (!FLOOR.has(piece.kind)) continue;
        const spec = KIT[piece.kind], sample = terrainSample(seed, piece.x, piece.s, NAHARA), at = `${piece.kind} seed ${seed} at ${piece.x.toFixed(2)},${piece.s.toFixed(2)}`;
        kinds.add(piece.kind); count++; if (piece.cosmetic) cosmetic++;
        // On the ledges (the cleft's floor is lost in the haze and holds the teal streams) or a rim, never on a stream.
        expect(sample.height, at).toBeGreaterThan(-6.2);
        expect(naharaLandform(seed, piece.x, piece.s, { seed, s: piece.s } as PlanetRow).pool, at).toBe(0);
        // Low: far under the flight plane, under the scenery cap; sunk from the lowest ground under it, never floating.
        expect(piece.y + piece.height * spec.height, at).toBeLessThanOrEqual(Math.min(UMBRA_SCENERY_MAX, sample.height + 2.4));
        expect(piece.y, at).toBeLessThanOrEqual(sample.height + 1e-6);
        expect(Math.abs(piece.x) + spec.radius * piece.scale * 0.6, at).toBeLessThanOrEqual(HALF + 1e-9);
        // Rubble is cosmetic (the Low tier skips it); foundations, stumps and relics always stand.
        if (piece.kind === 'nahDebris') expect(piece.cosmetic).toBe(true);
        if (piece.kind === 'nahFooting' || piece.kind === 'nahStub' || piece.kind === 'nahRelic') expect(piece.cosmetic).toBe(false);
      }
    }
    // Dressed, not filtered away: every piece of the fallen city shows, a few hundred over 24 sections.
    expect(kinds).toEqual(FLOOR);
    expect(count).toBeGreaterThan(250);
    expect(cosmetic / count).toBeGreaterThan(0.3);
  });

  it('leaves THE CITADEL\'s canyon to its own authored ruins', () => {
    const config = { mode: 'campaign', mission: 'silent-empire', seed: 93 } as RunConfig, arena = missionArena(config)!;
    const temple = arena.fromS + CITADEL_AT, world = { planet: 'nahara' as const, arena };
    let elsewhere = 0;
    for (let index = Math.floor((temple - 80) / VIEW.sectionLength); index <= Math.floor((temple + 40) / VIEW.sectionLength); index++) {
      for (const piece of generateTerrainSection(93, index, world).instances) {
        if (!FLOOR.has(piece.kind)) continue;
        expect(piece.s > temple - 42 && piece.s < temple + 36, `${piece.kind} at ${piece.s}`).toBe(false);
        elsewhere++;
      }
    }
    expect(elsewhere).toBeGreaterThan(0);
  });

  it('prefetches the added dressing without synchronous fallbacks at the fastest scroll', () => {
    const stream = createTerrainStream(8831, NAHARA);
    for (let frame = 0; frame < 60 * 45; frame++) {
      const distance = frame * Math.max(CAMPAIGN_SCROLL, scrollForPace(PACE.endless.cap)) / 60;
      const sections = stream.update(distance);
      let budget = 30; stream.prefetch(distance, () => budget-- > 0);
      if (frame % 900 === 0) for (const section of sections) expect(section).toEqual(generateTerrainSection(8831, section.index, NAHARA));
    }
    expect(stream.stats.fallbacks).toBe(0);
  }, 120_000);

  it('ships every Nahara kit node in nahara-kit.glb within its contract bounds', async () => {
    const file = 'public/assets/nahara/nahara-kit.glb';
    expect(fs.existsSync(file)).toBe(true);
    const gltf = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(fs.readFileSync(file).slice().buffer, '', resolve, reject));
    for (const kind of [...NAHARA_KIT_KINDS, ...NAHARA_CLIFF_KINDS]) for (let v = 0; v < KIT[kind].variants; v++) {
      const node = gltf.scene.getObjectByName(kitNodeName(kind, v));
      expect(node, kitNodeName(kind, v)).toBeDefined();
      const geometry = extractKitNode(node!, kind, /glow/i)!;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!, spec = KIT[kind];
      if (spec.exactTop) expect(box.max.y).toBeCloseTo(spec.height, 4);
      else expect(box.max.y).toBeLessThanOrEqual(spec.height + 1e-6);
      expect(Math.max(-box.min.x, box.max.x), kitNodeName(kind, v)).toBeLessThanOrEqual(spec.halfX + 1e-6);
      expect(Math.max(-box.min.z, box.max.z), kitNodeName(kind, v)).toBeLessThanOrEqual(spec.halfZ + 1e-6);
      // The plan the sand's shelter takes (src/world/sand-shelter.ts): the node's own, rounded out to the hundredth.
      const plan = NAHARA_PLANS[kind]![v], measured = [box.min.x, box.max.x, box.min.z, box.max.z];
      for (let k = 0; k < 4; k++) {
        expect(plan[k] * (k % 2 ? 1 : -1), `${kitNodeName(kind, v)} plan ${k}`).toBeGreaterThanOrEqual(measured[k] * (k % 2 ? 1 : -1) - 1e-6);
        expect(Math.abs(plan[k] - measured[k]), `${kitNodeName(kind, v)} plan ${k}`).toBeLessThan(0.011);
      }
      // A standing arch's piers: the lowest course's blocks (the span springs from them).
      const piers = ARCH_PIERS[kind];
      if (piers) {
        const position = geometry.getAttribute('position'), course = box.min.y + 0.15 * (box.max.y - box.min.y);
        for (let i = 0; i < position.count; i++) {
          if (position.getY(i) > course) continue;
          const x = position.getX(i), z = position.getZ(i);
          expect(piers.some(([x0, x1, z0, z1]) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && z >= z0 - 1e-6 && z <= z1 + 1e-6), `${kitNodeName(kind, v)} pier ${x},${z}`).toBe(true);
        }
      }
      geometry.dispose();
    }
  });
});

describe('Nahara sand (docs/39, 15 November)', () => {
  it('ripples Nahara\'s ground only: High with the fine octave and sparkle, Low with one octave, other worlds off', () => {
    const materials = createTerrainMaterials();
    try {
      const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader } as Parameters<MeshPhysicalMaterial['onBeforeCompile']>[0];
      materials.ground.onBeforeCompile(shader, {} as WebGLRenderer);
      // Every stage found its chunk: the ripples (map), the normal's tilt, the sparkle after the direct light.
      for (const piece of ['float u1 = 6.2831853 * dot( SAND_K1', 'vec3( -sandSlope.x, 0.0, -sandSlope.y )', 'grainFlash']) expect(shader.fragmentShader).toContain(piece);
      const look = (shader.uniforms as Record<string, { value: number }>).sandLook, setPlanet = materials.ground.userData.setPlanet as (planet: string) => void;
      setPlanet('nahara'); expect(look.value).toBe(2);
      materials.setNormalMaps(false); expect(look.value).toBe(1);
      materials.setNormalMaps(true); expect(look.value).toBe(2);
      for (const planet of ['khepri', 'vesper', 'luna', 'nacre', 'amnion', 'umbra', 'corona']) { setPlanet(planet); expect(look.value).toBe(0); }
      // The section joins: every wave vector's z frequency fits the 36-unit section a whole number of times.
      for (const [, , z] of shader.fragmentShader.matchAll(/#define SAND_K\w+ vec2\( (-?[\d.]+), (-?[\d.]+) \)/g)) {
        expect(Math.abs(Number(z) * VIEW.sectionLength - Math.round(Number(z) * VIEW.sectionLength))).toBeLessThan(0.02);
      }
    } finally { materials.dispose(); }
  });
});

it('keeps ripple clearance off cliffs while preserving flat canyon-floor sand across section joins', () => {
  const a = generateTerrainSection(93, 5, NAHARA), b = generateTerrainSection(93, 6, NAHARA);
  const clearance = a.sandClearance!;
  expect(clearance.length).toBe(a.across * a.along);
  let cliff = 0, floor = 0;
  const step = a.positions[3] - a.positions[0], offset = Math.round(1 / step);
  const diagonal = Math.round(offset / Math.SQRT2);
  const probes = [offset, -offset, offset * a.across, -offset * a.across,
    diagonal * (a.across + 1), diagonal * (a.across - 1), -diagonal * (a.across + 1), -diagonal * (a.across - 1)];
  for (let row = offset; row < a.along - offset; row++) for (let col = offset; col < a.across - offset; col++) {
    const index = row * a.across + col, height = a.positions[index * 3 + 1];
    const variation = Math.max(...probes.map(delta => Math.abs(a.positions[(index + delta) * 3 + 1] - height)));
    if (variation > 1.1) { expect(clearance[index]).toBe(0); cliff++; }
    // (Down in the canyon: the ruin districts' terraces and mesa tops over it carry no sand since 17 November.)
    if (height < -3.6 && variation < .1 && a.normals[index * 3 + 1] > .999) {
      expect(clearance[index]).toBeGreaterThan(.95); floor++;
    }
  }
  expect(cliff).toBeGreaterThan(10);
  expect(floor).toBeGreaterThan(10);
  for (let col = 0; col < a.across; col++) {
    expect(clearance[(a.along - 1) * a.across + col]).toBeCloseTo(b.sandClearance![col], 6);
  }
});

describe('Nahara ripples keep to open sand (docs/39, 17 November)', () => {
  // The user: the ripples "run below rocks and buildings/ruins", and should stay on "open stretches of land and canyon floors".
  const sectionsOf = (seed: number) => [3, 4, 5, 6, 7].map(index => generateTerrainSection(seed, index, NAHARA));
  it('calms the sand on and round every piece standing on the ground, its own section\'s and its neighbours\' across a join', () => {
    let checked = 0, pieces = 0;
    for (const seed of [93, 8831, 11]) {
      const sections = sectionsOf(seed);
      for (let k = 1; k < sections.length - 1; k++) {
        const section = sections[k], ripples = sandRipples(section, [sections[k - 1], sections[k + 1]])!, margin = 0.1;
        for (const owner of sections.slice(k - 1, k + 2)) for (const piece of owner.instances) {
          const ground = groundAt(owner, piece.x, piece.s), ax = Math.cos(piece.rotation), as = Math.sin(piece.rotation);
          // Where it meets the ground (its measured plan; a standing arch's piers; nothing under a bay standing clear).
          for (const [x0, x1, z0, z1] of groundPlans(piece, ground)) {
            pieces++;
            // Every vertex within the footprint and a margin round it (local x along (cos, sin), local z (sin, -cos)).
            const size = piece.scale, reach = Math.hypot(Math.max(-x0, x1), Math.max(-z0, z1)) * size + margin;
            for (let row = Math.ceil((piece.s - reach - section.startS) / TERRAIN_STEP); row <= Math.floor((piece.s + reach - section.startS) / TERRAIN_STEP); row++) {
              if (row < 0 || row >= section.along) continue;
              for (let column = Math.ceil((piece.x - reach + MESH_HALF) / TERRAIN_STEP); column <= Math.floor((piece.x + reach + MESH_HALF) / TERRAIN_STEP); column++) {
                if (column < 0 || column >= section.across) continue;
                const dx = -MESH_HALF + column * TERRAIN_STEP - piece.x, ds = section.startS + row * TERRAIN_STEP - piece.s;
                const u = dx * ax + ds * as, w = dx * as - ds * ax;
                if (u < x0 * size - margin || u > x1 * size + margin || w < z0 * size - margin || w > z1 * size + margin) continue;
                expect(ripples[row * section.across + column], `${piece.kind} (seed ${seed}) at ${piece.x.toFixed(2)},${piece.s.toFixed(2)}, section ${section.index}`).toBeLessThan(0.02);
                checked++;
              }
            }
          }
        }
      }
    }
    expect(pieces).toBeGreaterThan(500);
    expect(checked).toBeGreaterThan(20_000);
  });

  it('keeps the ripples on open canyon floor and open natural ground, and none on the ruin districts\' terraces', () => {
    let floor = 0, open = 0, built = 0;
    for (const seed of [93, 8831]) {
      const sections = sectionsOf(seed);
      for (let k = 1; k < sections.length - 1; k++) {
        const section = sections[k], ripples = sandRipples(section, [sections[k - 1], sections[k + 1]])!, bed = section.sandClearance!;
        const shelters = sections.slice(k - 1, k + 2).flatMap(near => sandShelters(near));
        for (let row = 0; row < section.along; row++) for (let column = 20; column < section.across - 20; column++) {
          const v = row * section.across + column, x = section.positions[v * 3], s = section.startS + row * TERRAIN_STEP, height = section.positions[v * 3 + 1];
          // Beyond every piece's calm (its footprint, halo and lee tail) the sand keeps its ripples.
          if (bed[v] > 0.95 && shelters.every(f => Math.hypot(f.x - x, f.s - s) > Math.hypot(f.hx, f.hz) + f.lee + f.outer)) {
            expect(ripples[v]).toBe(bed[v]);
            if (height < -3.6) floor++; else open++;
          }
          // The built terraces, city blocks and fallen buildings' footprints (the ruin districts over the canyon) carry none.
          if (section.strata![v] < 0.02 && height > -2.6) { expect(bed[v]).toBe(0); built++; }
        }
      }
    }
    expect(floor).toBeGreaterThan(100);
    expect(open).toBeGreaterThan(100);
    expect(built).toBeGreaterThan(100);
  });

  it('is deterministic, reaches no further than a join\'s band, and runs on across every join', () => {
    const sections = sectionsOf(8831), reach = Math.ceil(SAND_SHELTER_REACH / TERRAIN_STEP);
    for (const section of sections) for (const shelter of sandShelters(section)) {
      expect(Math.hypot(shelter.hx, shelter.hz) + shelter.lee + shelter.outer).toBeLessThanOrEqual(SAND_SHELTER_REACH);
    }
    for (let k = 1; k < sections.length - 2; k++) {
      const section = sections[k], across = section.across, last = (section.along - 1) * across;
      const a = sandRipples(section, [sections[k - 1], sections[k + 1]])!, b = sandRipples(sections[k + 1], [section, sections[k + 2]])!;
      // A fresh generation of the same sections gives the same mask.
      const again = [-1, 0, 1].map(d => generateTerrainSection(8831, section.index + d, NAHARA));
      expect(sandRipples(again[1], [again[0], again[2]])).toEqual(a);
      // The join's row is one row of the ground: the same in both sections.
      for (let column = 0; column < across; column++) expect(a[last + column]).toBeCloseTo(b[column], 6);
      // Rows beyond a join's band take only the section's own pieces.
      const own = sandRipples(section)!;
      for (let v = (reach + 1) * across; v < (section.along - reach - 1) * across; v++) expect(own[v]).toBe(a[v]);
    }
  });
});
