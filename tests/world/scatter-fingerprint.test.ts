import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLANETS, generateTerrainSection, routeOf, type KitInstance, type PlanetId, type PlanetProfile, type RouteSchedule, type TerrainArena, type TerrainInput } from '../../src/world/terrain';

/*
 * Scatter fingerprints (docs/38 W1): every world's scatter output, exactly as recorded. The planet profiles' `scatter` is
 * wrapped to capture what each call returns (every KitInstance field as float64 bits, pieces and fields in order) and how many times it
 * yields (the off-frame prefetch slices its work at those points). Recorded on 17 November 2026 before the shared scatter
 * sink (src/world/scatter-sink.ts) replaced the per-world copies; a refactor must leave every entry untouched. A
 * deliberate change to a world's dressing or ground re-records that world's entries (the failure prints the new table).
 */

const crypto: { createHash(kind: string): { update(data: string | Uint8Array): void; digest(encoding: string): string } } = await import(['node', 'crypto'].join(':'));

const PLANET_IDS: readonly PlanetId[] = ['khepri', 'luna', 'vesper', 'nacre', 'amnion', 'corona', 'umbra', 'nahara'];
/**
 * The campaign missions' arenas as of 17 November 2026 (src/render/scene.ts missionArena), fixed here so a balance change
 * elsewhere never moves them: the sections they span, and Nahara's also the section before (THE CITADEL's canyon floor).
 */
const ARENAS: Readonly<Record<PlanetId, { arena: TerrainArena; sections: readonly number[] }>> = {
  luna: { arena: { fromS: 704, toS: 735 }, sections: [19, 20] },
  khepri: { arena: { fromS: 767.25, toS: 802.25 }, sections: [21, 22] },
  nacre: { arena: { fromS: 1049, toS: 1092 }, sections: [29, 30] },
  vesper: { arena: { fromS: 1066.25, toS: 1110.25 }, sections: [29, 30] },
  amnion: { arena: { fromS: 1049, toS: 1092 }, sections: [29, 30] },
  corona: { arena: { fromS: 1049, toS: 1094 }, sections: [29, 30] },
  umbra: { arena: { fromS: 1049, toS: 1094 }, sections: [29, 30] },
  nahara: { arena: { fromS: 1049, toS: 1094 }, sections: [28, 29, 30] },
};
/**
 * A route through all eight worlds, each about a section and a half long, switching mid-section at odd distances: a split
 * section scatters each world over its own span (startS and size off the section grid), as endless does around a jump.
 */
const CHAIN: readonly PlanetId[] = ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'corona', 'umbra', 'nahara'];
const SWITCHES = [40.5, 95.25, 151.625, 203.75, 262.125, 313.5, 371.875];
const CHAIN_SCHEDULE: RouteSchedule = {
  stretches: (from, to) => CHAIN.map((planet, k) => ({ planet, from: k ? SWITCHES[k - 1] : -1e9, to: k < SWITCHES.length ? SWITCHES[k] : 1e9 }))
    .filter(stretch => stretch.to > from && stretch.from < to),
  arenas: () => [],
};

interface Case { name: string; input: TerrainInput; seeds: readonly number[]; sections: readonly number[] }
const CASES: Case[] = [
  ...PLANET_IDS.map((planet): Case => ({ name: planet, input: { planet }, seeds: [11, 93, 8831], sections: [2, 9] })),
  ...PLANET_IDS.map((planet): Case => ({ name: `${planet}+arena`, input: { planet, arena: ARENAS[planet].arena }, seeds: [93, 8831], sections: ARENAS[planet].sections })),
  { name: 'route', input: routeOf('scatter-fingerprint', CHAIN_SCHEDULE), seeds: [93], sections: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  // High ground where Khepri drops boulders and fallen columns over its scenery cap (they are never trimmed to it).
  { name: 'khepri 11:0', input: { planet: 'khepri' }, seeds: [11], sections: [0] },
];

/**
 * Recorded per case: sha256 (first 16 hex digits) over every scatter call's span and pieces, the pieces placed, the
 * scatter calls and their yields.
 */
const RECORDED: Record<string, readonly [string, number, number, number]> = {
  khepri: ['0809259d4cc51f06', 847, 6, 357], luna: ['b15227357bb9b905', 197, 6, 216], vesper: ['50fac2ee6a65863b', 318, 6, 357],
  nacre: ['f2e03d27f53e344f', 973, 6, 531], amnion: ['a474d5d16e8d05d6', 918, 6, 357], corona: ['c204eed6309ad7b5', 825, 6, 370],
  umbra: ['381b39e54d68a094', 393, 6, 420], nahara: ['1cbf96f0c850b6d6', 538, 6, 384],
  // vesper+arena: HELION STRONGHOLD's arena (17 November: its cliff, then its snowfields and mountains, then its low ground
  // and its grown fortress at row 9; ['698a1fbf25f30d22', 147, 4, 238] before). vesper, vesper+arena and route (which crosses
  // Vesper): the whole Vesper level 1.25 lower (18 November; vesper ['b767c0ee98f8e2d5', 322, 6, 357] and route
  // ['96b9d538ac002f63', 1537, 19, 758] before). vesper+arena: the mountains behind the fortress, its ledge and its works (18
  // November; ['bda008093970d9c7', 405, 4, 238] before). vesper, vesper+arena and route: Vesper 2.5 lower, the fortress
  // moved down on its tiered ledge (18 November; ['03a49fe99275c8d7', 318, 6, 357], ['9ce723d9304a5969', 299, 4, 238] and
  // ['a044aa9c9af70b11', 1533, 19, 758] before).
  'khepri+arena': ['8010429d1a367f29', 626, 4, 238], 'luna+arena': ['3ab75c1157ea1659', 150, 4, 144], 'vesper+arena': ['9e1a9a60936bc28a', 325, 4, 238],
  // amnion+arena: THE CRADLE on its lowered crust terrace (17 November; its emergence canyon ['fd29dba2900c9d70', 405, 4, 238], its
  // brood basin ['920e5993df95c702', 325, 4, 238], then the plain settled plateau ['20a4b9ab47994205', 327, 4, 238] before).
  'nacre+arena': ['459e46b6b9fcdc14', 262, 4, 352], 'amnion+arena': ['973f54c333428511', 323, 4, 238], 'corona+arena': ['8135a9663edb2fff', 457, 4, 239],
  'umbra+arena': ['024b326323e18002', 202, 4, 249], 'nahara+arena': ['1b0e7095f021e896', 447, 6, 382],
  route: ['b4c9297d58d5a7dd', 1536, 19, 758], 'khepri 11:0': ['8a3012c672f9b64a', 164, 1, 59],
};

interface Call { planet: PlanetId; seed: number; startS: number; size: number; pieces: KitInstance[]; yields: number }
const calls: Call[] = [];
const originals = new Map<PlanetId, PlanetProfile['scatter']>();

beforeAll(() => {
  for (const id of PLANET_IDS) {
    const profile = PLANETS[id], original = profile.scatter;
    originals.set(id, original);
    profile.scatter = function* (seed, startS, size, field) {
      const work = original(seed, startS, size, field);
      let yields = 0, step = work.next();
      while (!step.done) { yields++; yield; step = work.next(); }
      calls.push({ planet: id, seed, startS, size, pieces: step.value, yields });
      return step.value;
    };
  }
});
afterAll(() => { for (const [id, original] of originals) PLANETS[id].scatter = original; });

function fingerprint(list: readonly Call[]) {
  const hash = crypto.createHash('sha256');
  let pieces = 0, yields = 0;
  for (const call of list) {
    hash.update(`${call.planet}|${call.seed}|`); hash.update(new Uint8Array(new Float64Array([call.startS, call.size, call.yields]).buffer));
    for (const piece of call.pieces) {
      // The field order too: the section fingerprints elsewhere hash pieces as JSON.
      hash.update(`${Object.keys(piece).join()}|${piece.kind}|`);
      hash.update(new Uint8Array(new Float64Array([piece.variant, piece.x, piece.s, piece.y, piece.scale, piece.height, piece.rotation, piece.shade, piece.cosmetic ? 1 : 0]).buffer));
    }
    pieces += call.pieces.length; yields += call.yields;
  }
  return [hash.digest('hex').slice(0, 16), pieces, list.length, yields] as const;
}

describe('scatter fingerprints (docs/38 W1)', () => {
  it('scatters every world exactly as recorded: plain ground, mission arenas and a route through all eight', () => {
    const actual: Record<string, readonly [string, number, number, number]> = {};
    for (const { name, input, seeds, sections } of CASES) {
      calls.length = 0;
      for (const seed of seeds) for (const index of sections) generateTerrainSection(seed, index, input);
      expect(calls.length, name).toBeGreaterThan(0);
      actual[name] = fingerprint(calls);
    }
    if (JSON.stringify(actual) !== JSON.stringify(RECORDED)) console.log(JSON.stringify(actual, null, 1));
    expect(actual).toEqual(RECORDED);
  }, 120_000);
});
