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
import { KIT, NAHARA_CLIFF_KINDS, NAHARA_KIT_KINDS, createTerrainStream, generateTerrainSection, kitNodeName, terrainSample, type KitKind } from '../../src/world/terrain';

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
    if (height < -2 && variation < .1 && a.normals[index * 3 + 1] > .999) {
      expect(clearance[index]).toBeGreaterThan(.95); floor++;
    }
  }
  expect(cliff).toBeGreaterThan(10);
  expect(floor).toBeGreaterThan(10);
  for (let col = 0; col < a.across; col++) {
    expect(clearance[(a.along - 1) * a.across + col]).toBeCloseTo(b.sandClearance![col], 6);
  }
});
