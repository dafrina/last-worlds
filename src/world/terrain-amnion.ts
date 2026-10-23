import { NEUTRAL_MOOD, clamp, crispStep, mix, noise, routeCalm, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import type { KitInstance, ScatterField } from './terrain-scatter';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import { arenaAt } from './terrain-arena';

/**
 * Amnion, the Brood Wastes (docs/27, user 23 October 2026, after art/concepts/amnion-brood-wastes): pale plateaus of
 * bone crust, cracked into plates and dimpled with egg hollows, split by deep sheer-walled canyons whose dark flesh-red
 * floors carry a glowing yolk river and pools. Dry, hot and calcified, where Nacre is wet and cool. The canyons wind
 * along the flight, with narrower side cracks; bone mountains with sharp ridged crests rise from the plateau interiors
 * (user, 23 October: "definitely also add mountains not only mesa canyons"). Hostile shots are violet here
 * (src/render/scene.ts) so they never hide in the warm glow. Pure functions of seed and world coordinates.
 *
 * Milestone 1 is the ground and its light only: the bone-and-sinew cliff walls, egg clutches, spires, nests and bridges
 * come from a Blender kit next (no scatter until then).
 */
/** Plateau tiers, the canyon floor and the highest crest (world height; the terrain's own cap is 2.4). */
const PLATEAU = 0.3, TIER = 0.5, FLOOR = -3.3, PEAK = 2.4;
/** The plateau's base level (the boss stands on it). */
export const AMNION_PLATEAU = PLATEAU;
/** Scenery cap: the same clearance under the flight plane (3.8) as Vesper's and Nacre's. */
export const AMNION_SCENERY_MAX = 3.0;
const NEUTRAL: MoodParams = NEUTRAL_MOOD;

/* ---------------------------------------------------------------- masks */

const ridged = (value: number) => { const r = 1 - Math.abs(2 * value - 1); return r * r; };

export interface AmnionMasks {
  /** 0 canyon … 1 plateau (crisp at the canyon lip). */ plateau: number;
  /** Yolk river along a canyon's centre, 0 … 1. */ yolk: number;
  /** Upper plateau tier, 0 … 1. */ tier: number;
  /** Egg hollow on the plateau, 0 … 1 (shallow pits where clutches sit). */ hollow: number;
  /** Distance to the nearest canyon centre in its noise units over its half-width (0 centre, 1 lip). */ across: number;
  /** Bone massif (mountains) weight, 0 … 1: only in plateau interiors, well back from the canyon lips. */ massif: number;
}
/** Amnion's masks at a point (landform, colour and, next, scatter). An arena weight flattens the plateau around the boss. */
export function amnionMasks(seed: number, x: number, s: number, platform = 0): AmnionMasks {
  const calm = routeCalm(seed, x, s);
  const qx = x + (noise(seed ^ 0xa1a1, x * 0.045, s * 0.04) - 0.5) * 9, qs = s + (noise(seed ^ 0xa1a2, x * 0.045 + 5.1, s * 0.04) - 0.5) * 9;
  // The main canyons: winding along s (low frequency in s), 5–9 units wide where they run.
  const main = Math.abs(noise(seed ^ 0xa1a3, qx * 0.045, qs * 0.02) - 0.5), mainWidth = 0.1 + 0.05 * noise(seed ^ 0xa1a4, x * 0.03, s * 0.025);
  // Side cracks: narrower, shorter, at an angle (present only in patches).
  const sideField = smoothRange(0.45, 0.65, noise(seed ^ 0xa1a5, x * 0.05 + 1.3, s * 0.05));
  const side = Math.abs(noise(seed ^ 0xa1a6, qx * 0.09 + qs * 0.04, qs * 0.07 - qx * 0.03) - 0.5), sideWidth = 0.022 * sideField;
  const across = Math.min(main / mainWidth, sideWidth > 0.001 ? side / sideWidth : 99);
  // Sheer lips (crispStep), and no canyon inside the boss clearing.
  const plateau = Math.max(crispStep((across - 0.82) / 0.36 + 0.5), platform);
  // The yolk: a ribbon down the canyon's middle (a third of its width), pools along it.
  const yolk = (1 - smoothRange(0.12, 0.34, main / mainWidth)) * (1 - platform);
  const tier = smoothRange(0.56, 0.6, noise(seed ^ 0xa1a7, qx * 0.06, qs * 0.055)) * (1 - calm * 0.5) * (1 - platform);
  const pit = noise(seed ^ 0xa1a8, x * 0.32, s * 0.3), field = smoothRange(0.5, 0.7, noise(seed ^ 0xa1a9, x * 0.06, s * 0.06));
  const hollow = smoothRange(0.68, 0.86, pit) * field * smoothRange(0.85, 1, plateau) * (1 - platform);
  // Mountains: broad massifs in their own regions, set well back from any canyon lip (the canyons keep their clean shape).
  const back = smoothRange(1.15, 1.7, across);
  const massif = smoothRange(0.4, 0.62, noise(seed ^ 0xa1c1, qx * 0.04, qs * 0.035)) * back * (1 - calm * 0.4) * (1 - platform);
  return { plateau, yolk, tier, hollow: hollow * (1 - massif), across, massif };
}

/**
 * Brood ground: plateaus of bone crust in two tiers (gently domed, a little rolling, egg hollows sunk into them), sheer
 * canyon walls down to a dark flesh floor that sags toward its glowing yolk river. `pool` carries the yolk (the ground
 * shader's glowing crackle network), `tone` the crust patches.
 */
export function amnionLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const m = amnionMasks(seed, x, s, arenaAt(row.arena, seed, x, s));
  const dome = (noise(seed ^ 0xa1b1, x * 0.11, s * 0.1) - 0.5) * 0.35 + (noise(seed ^ 0xa1b2, x * 0.5, s * 0.46) - 0.5) * 0.06;
  // Mountains: sharp ridged crests (two octaves) on the massifs, up to the cap.
  const crest = ridged(noise(seed ^ 0xa1c2, x * 0.22, s * 0.19)) * 0.7 + ridged(noise(seed ^ 0xa1c3, x * 0.52, s * 0.47)) * 0.3;
  const mountain = Math.pow(m.massif, 0.7) * (0.3 + 2.1 * crest);
  const top = Math.min(PEAK, PLATEAU + m.tier * TIER + dome - m.hollow * 0.35 + mountain);
  const floor = FLOOR - m.yolk * 0.25 + (noise(seed ^ 0xa1b3, x * 0.4, s * 0.36) - 0.5) * 0.25;
  const crust = noise(seed ^ 0xa1b4, x * 0.18, s * 0.16);
  return {
    // `channel` carries the massif weight (the terrain grid keeps only its known fields; Amnion's colour reads it).
    height: clamp(mix(floor, top, m.plateau), -4, 2.4), elevation: m.plateau, channel: m.massif,
    pool: m.yolk * (1 - m.plateau), vein: 99, vein2: 99, veins: 0, tone: crust,
  };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Brood palette, linear RGB (concept: pale bone crust, ochre stains, sinew-pink lips, dark flesh walls and floors). */
export const AMNION_PALETTE = {
  bone: linear(0xe4dccd), boneShade: linear(0xc6baa4), stain: linear(0xb09878), sinew: linear(0x9a5a4c),
  flesh: linear(0x5a1d1a), floor: linear(0x34100f), hollow: linear(0x8a6a50),
} as const;

function amnionColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, slope: number, rim: number, out: [number, number, number]) {
  const P = AMNION_PALETTE, { seed, s } = row;
  const fine = noise(seed ^ 0x52c1, x * 1.3, s * 1.3), crust = point.tone ?? 0.5;
  const lip = smoothRange(0.75, 1, point.elevation) * (1 - smoothRange(0.98, 1, point.elevation)), steep = smoothRange(1, 2.2, slope);
  const hollow = smoothRange(0.2, 0.5, (PLATEAU + 0.1 - point.height) * point.elevation) * smoothRange(0.95, 1, point.elevation);
  // Canyon walls are flesh (below the plateau lip); mountain flanks are darker, stained bone, their crests pale.
  const canyon = 1 - smoothRange(0.85, 0.98, point.elevation), flank = steep * (1 - canyon) * smoothRange(0.1, 0.4, point.channel);
  for (let c = 0; c < 3; c++) {
    let value = mix(P.bone[c], P.boneShade[c], smoothRange(0.35, 0.7, crust) * 0.6);
    value = mix(value, P.stain[c], smoothRange(0.62, 0.82, crust) * 0.45);
    value = mix(value, P.hollow[c], hollow * 0.7);
    // Sinew at the canyon lip, flesh down the walls, a dark floor.
    value = mix(value, P.sinew[c], Math.max(lip * 0.3, rim * 0.15));
    value = mix(value, P.stain[c] * 0.82, flank * 0.7);
    // Mountains shade by height: darker stained folds between the peaks, pale crests.
    value *= mix(1, mix(0.68, 1.08, smoothRange(PLATEAU + 0.2, PEAK - 0.1, point.height)), smoothRange(0.1, 0.5, point.channel));
    value = mix(value, mix(P.floor[c], P.flesh[c], point.elevation), Math.max(steep * canyon, 1 - smoothRange(0.2, 0.6, point.elevation)));
    out[c] = value * (0.9 + fine * 0.2);
  }
  return out;
}

/* ---------------------------------------------------------------- profile */

/** No scatter until the brood kit exists (milestone 2): the ground reads on its own. */
function* amnionScatterSteps(_seed: number, _startS: number, _size: number, _terrain: ScatterField): Work<KitInstance[]> {
  return [];
}

export const AMNION: PlanetProfile = {
  id: 'amnion', seaLevel: null,
  mood: () => 'brood', params: () => NEUTRAL, local: () => null,
  landform: amnionLandform,
  // The boss clearing is shaped in the landform (no canyon there, one plateau level); the clearing core stays flat.
  arena(_row, _x, point, weight) { point.height = mix(point.height, PLATEAU, weight * 0.85); },
  color: amnionColor,
  shadowTint: [0.86, 0.66, 0.6],
  sceneryMax: AMNION_SCENERY_MAX,
  settlement: () => null,
  scatter: amnionScatterSteps,
  floes: function* () { return []; },
  industrial: new Set(), quiet: new Set(), networks: false,
};
