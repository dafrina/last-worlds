import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { VIEW } from '../../src/shared/contracts';
import { missionArena } from '../../src/render/scene';
import { createFallbackKit, extractKitNode } from '../../src/render/terrain-kit';
import { NACRE_SCENERY_MAX, NACRE_SEA_LEVEL, nacreMasks } from '../../src/world/terrain-nacre';
import { KIT, NACRE_KIT_KINDS, generateTerrainSection, kitNodeName, terrainHeight, type KitKind } from '../../src/world/terrain';

const NACRE = { planet: 'nacre' as const }, SEA = NACRE_SEA_LEVEL, HALF = VIEW.worldWidth / 2;
const KIT_FILE = 'public/assets/nacre/nacre-kit.glb';
// Node built-ins without @types/node: a non-literal specifier keeps the typecheck dependency-free.
const fs: { existsSync(path: string): boolean; readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));

function expectContract(kind: KitKind, geometry: BufferGeometry) {
  for (const name of ['position', 'normal', 'color', 'glow']) expect(geometry.getAttribute(name)).toBeDefined();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!, spec = KIT[kind];
  if (spec.exactTop) expect(box.max.y).toBeCloseTo(spec.height, 4);
  else expect(box.max.y).toBeLessThanOrEqual(spec.height + 1e-6);
  expect(box.min.y).toBeGreaterThan(-0.2);
  expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(spec.halfX + 1e-6);
  expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(spec.halfZ + 1e-6);
}

describe('Nacre, the Luminous Mire (docs/20)', () => {
  it('generates the same sections for the same seed', () => {
    for (const [seed, index] of [[8831, 3], [93, 7], [4242, 12]] as const) {
      expect(generateTerrainSection(seed, index, NACRE)).toEqual(generateTerrainSection(seed, index, NACRE));
    }
    expect(generateTerrainSection(8831, 3, NACRE).instances).not.toEqual(generateTerrainSection(93, 3, NACRE).instances);
  });

  it('keeps its terrain exactly as it was: terrain versions 13 and 14 (docs/26) change Khepri, Vesper and Luna only', async () => {
    // sha256 over a section's mesh, pieces, roads, floes and shore, recorded from version 12 (20 October 2026).
    const crypto: { createHash(kind: string): { update(data: string | Uint8Array): void; digest(encoding: string): string } } = await import(['node', 'crypto'].join(':'));
    const fingerprint = (section: ReturnType<typeof generateTerrainSection>) => {
      const hash = crypto.createHash('sha256');
      for (const key of ['positions', 'colors', 'normals', 'glow', 'edges', 'rock', 'indices'] as const) hash.update(new Uint8Array(section[key].buffer));
      for (const array of [section.roads.positions, section.roads.uvs, section.roads.alpha, section.roads.shade, section.roads.indices]) hash.update(new Uint8Array(array.buffer));
      hash.update(JSON.stringify([section.strips, section.props, section.instances, section.industry, section.roadPaths.map(r => [r.id, [...r.x], [...r.s], [...r.y]])]));
      if (section.floes) hash.update(JSON.stringify(section.floes));
      if (section.water) hash.update(new Uint8Array(section.water.shore.buffer));
      return hash.digest('hex').slice(0, 16);
    };
    for (const [seed, index, value] of [[93, 2, 'c3464267cebdfd55'], [8831, 5, '8cfbbbcba0c67a88'], [11, 9, '2f05e3b2e0bcb07b']] as const) {
      expect(fingerprint(generateTerrainSection(seed, index, NACRE)), `${seed}:${index}`).toBe(value);
    }
  });

  it('keeps every piece within the world, the terrain range and under the scenery cap', () => {
    for (const seed of [8831, 93]) for (let index = 0; index < 10; index++) {
      const section = generateTerrainSection(seed, index, NACRE);
      for (let i = 1; i < section.positions.length; i += 3) { expect(section.positions[i]).toBeGreaterThanOrEqual(-4); expect(section.positions[i]).toBeLessThanOrEqual(2); }
      for (const piece of section.instances) {
        const spec = KIT[piece.kind];
        expect(NACRE_KIT_KINDS).toContain(piece.kind);
        expect(piece.variant).toBeLessThan(spec.variants);
        expect(piece.y + piece.height * spec.height).toBeLessThanOrEqual(NACRE_SCENERY_MAX + 1e-9);
        expect(Math.abs(piece.x) + spec.radius * piece.scale).toBeLessThanOrEqual(HALF + 1e-9);
        expect(piece.s).toBeGreaterThanOrEqual(section.startS);
        expect(piece.s).toBeLessThan(section.startS + section.size);
        expect(piece.scale).toBeGreaterThan(0); expect(piece.scale).toBeLessThanOrEqual(1.2);
        // Lily rafts float at the waterline.
        if (piece.kind === 'lilyRaft') expect(piece.y).toBe(SEA);
      }
    }
  });

  it('is about half land, with jagged rock massifs on the islands', () => {
    let land = 0, rock = 0, samples = 0;
    for (const seed of [8831, 93, 4242]) for (let s = 0; s < 400; s += 2) for (let x = -HALF; x <= HALF; x += 1) {
      samples++;
      if (terrainHeight(seed, x, s, NACRE) > SEA) land++;
      if (nacreMasks(seed, x, s).rock > 0.3) rock++;
    }
    expect(land / samples).toBeGreaterThan(0.35); expect(land / samples).toBeLessThan(0.65);
    expect(rock / samples).toBeGreaterThan(0.05);
  });

  it('dresses the mire with rock, glowing jungle and the builders\' ruins', () => {
    const counts = new Map<KitKind, number>();
    for (const seed of [8831, 93, 4242]) for (let index = 1; index < 10; index++) {
      for (const piece of generateTerrainSection(seed, index, NACRE).instances) counts.set(piece.kind, (counts.get(piece.kind) ?? 0) + 1);
    }
    const sections = 27, per = (kind: KitKind) => (counts.get(kind) ?? 0) / sections;
    // Rock massifs and outcrops.
    expect(per('mireCrag')).toBeGreaterThan(10); expect(per('mireRock')).toBeGreaterThan(10);
    // Glowing jungle and shallows.
    for (const kind of ['lotus', 'lotusGrove', 'glassTube', 'goblet', 'lilyRaft', 'mossTuft'] as const) expect(per(kind)).toBeGreaterThan(2);
    // Ruins appear regularly: towers in most sections, with forts, ring platforms, bridges, pillars and rubble somewhere.
    expect(per('ruinTower')).toBeGreaterThan(1.5);
    for (const kind of ['ruinFort', 'ruinRing', 'ruinBridge', 'ruinPillars', 'ruinRubble'] as const) expect(counts.get(kind) ?? 0).toBeGreaterThan(0);
  });

  it('opens the Deep Bloom arena: open mire with nothing standing on the platform', () => {
    const config = { mode: 'campaign', mission: 'deep-bloom', seed: 93 } as Parameters<typeof missionArena>[0];
    const arena = missionArena(config)!, world = { planet: 'nacre' as const, arena };
    expect(arena).toBeDefined();
    for (const seed of [93, 8831]) {
      for (let s = arena.fromS + 10; s <= arena.toS - 10; s += 1) for (let x = -HALF; x <= HALF; x += 0.5) expect(terrainHeight(seed, x, s, world)).toBeLessThan(SEA - 0.2);
      for (let index = Math.floor(arena.fromS / VIEW.sectionLength); index <= Math.floor(arena.toS / VIEW.sectionLength); index++) {
        for (const piece of generateTerrainSection(seed, index, world).instances) expect(piece.s > arena.fromS + 2 && piece.s < arena.toS - 2).toBe(false);
      }
    }
  });

  it('provides a light code-built stand-in for every Nacre node within the kit bounds', () => {
    const kit = createFallbackKit();
    for (const kind of NACRE_KIT_KINDS) for (let variant = 0; variant < KIT[kind].variants; variant++) {
      const geometry = kit.get(kitNodeName(kind, variant));
      expect(geometry, kitNodeName(kind, variant)).toBeDefined();
      expectContract(kind, geometry!);
      expect(geometry!.getAttribute('position').count / 3).toBeLessThanOrEqual(500);
    }
  });

  it.skipIf(!fs.existsSync(KIT_FILE))('extracts every Nacre node from the Blender kit, with glowing faces carrying their own colour', async () => {
    const bytes = fs.readFileSync(KIT_FILE);
    const gltf = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(bytes.slice().buffer, '', resolve, reject));
    const budget: Record<string, number> = { mireRock: 420, mireCrag: 700, lotus: 600, lotusGrove: 1100, glassTube: 420, goblet: 420, lilyRaft: 330, mossTuft: 180,
      ruinTower: 900, ruinFort: 1600, ruinRing: 720, ruinBridge: 520, ruinPillars: 340, ruinRubble: 400 };
    let total = 0;
    for (const kind of NACRE_KIT_KINDS) for (let variant = 0; variant < KIT[kind].variants; variant++) {
      const name = kitNodeName(kind, variant), node = gltf.scene.getObjectByName(name);
      expect(node, name).toBeDefined();
      const geometry = extractKitNode(node!, kind, /glow/i)!;
      expect(geometry, name).not.toBeNull();
      expectContract(kind, geometry);
      const triangles = geometry.getAttribute('position').count / 3;
      expect(triangles, name).toBeLessThanOrEqual(budget[kind]);
      total += triangles;
      // Every piece has glowing faces (speckles, caps, light strips), and they glow with a coloured COLOR_0.
      const glow = geometry.getAttribute('glow'), color = geometry.getAttribute('color');
      let lit = 0;
      for (let i = 0; i < glow.count; i++) if (glow.getX(i) > 0) { lit++; expect(glow.getX(i)).toBeCloseTo(Math.max(color.getX(i), color.getY(i), color.getZ(i)), 5); }
      if (kind !== 'lilyRaft' || variant === 1) expect(lit, name).toBeGreaterThan(0);
    }
    expect(total).toBeLessThan(16000);
  });
});
