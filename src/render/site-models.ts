import type { PlanetId, SiteId } from '../shared/contracts';

/**
 * Strike-site models (docs/33 § 3 and § 6): one Blender GLB per site and finish (the world it stands on),
 * `public/assets/shared/sites/<site>-<finish>.glb`, so a world loads only its own finishes. Pure data, no three.js: the single source for the view, the asset tests and the Blender
 * builder (tools/blender/strike_sites.py parses the entries below and asserts every node against them, so keep each entry
 * on one line in this exact form).
 *
 * Nodes per finish: `site_<id>_<finish>_body` (the site), `_core` (the target, hidden once destroyed) and `_ruin` (the
 * broken core, shown once destroyed); `<id>` with underscores. Frame: the pivot is the core target's ground point, so a
 * site anchors to its core enemy; x lateral, s away from the camera (glTF −z), the detailed front facing the camera; the
 * core's centre stands its site's SITE_CORE_HEIGHT (src/content/sites.ts) above the pivot, and every model fits inside
 * SITE_FOOTPRINT there. The sealed vault's `_core` and `_ruin` are one seal, drawn at each seal's own anchor. Foundations reach `below` under the pivot for uneven ground.
 *
 * Every site has a model on every world it appears on (phase 2, 30 October); a finish that fails to load leaves its
 * cores their own model.
 */
export interface SiteModel {
  finishes: readonly PlanetId[];
  /** Local bounds of every finish, body and ruin included: x (lateral) and s (away from the camera). */
  x: readonly [number, number];
  s: readonly [number, number];
  /** Highest point and foundation depth relative to the pivot. */
  top: number;
  below: number;
  /** The core turns about its upright at this rate (rad/s): a floating crystal. */
  spin?: number;
}

/** docs/25 rule 3: roofs stay 0.45 under the flight plane; a site on high ground is squashed about its core to keep that. */
export const SITE_ROOF_CLEARANCE = 0.45;

export const SITE_MODELS: Readonly<Partial<Record<SiteId, SiteModel>>> = {
  'crash-site': { finishes: ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'umbra'], x: [-2.95, 2.9], s: [-2.5, 2.7], top: 1.55, below: .7 },
  'airfield': { finishes: ['luna', 'khepri', 'vesper'], x: [-2.7, 3.0], s: [-3.2, 3.3], top: 2.95, below: 1.3 },
  'salvage-yard': { finishes: ['luna', 'khepri', 'vesper'], x: [-3.0, 3.0], s: [-2.9, 3.3], top: 2.9, below: 1.0 },
  'shield-depot': { finishes: ['luna', 'khepri', 'vesper'], x: [-2.7, 2.7], s: [-2.6, 3.05], top: 2.1, below: 1.0 },
  'relay-station': { finishes: ['luna', 'khepri', 'vesper', 'amnion'], x: [-2.9, 3.0], s: [-2.75, 3.1], top: 3.1, below: 1.0 },
  'freight-terminal': { finishes: ['luna', 'khepri', 'vesper', 'amnion'], x: [-3.0, 3.0], s: [-3.05, 3.3], top: 2.2, below: 1.0 },
  'dark-spaceport': { finishes: ['umbra', 'nacre'], x: [-3.0, 3.0], s: [-3.05, 3.15], top: 3.2, below: 1.1 },
  'prism-reactor': { finishes: ['umbra', 'nacre'], x: [-2.8, 2.8], s: [-2.45, 2.75], top: 2.9, below: 1.1, spin: .45 },
  'sealed-vault': { finishes: ['umbra', 'nacre'], x: [-2.75, 2.8], s: [-2.55, 3.2], top: 2.6, below: 1.1 },
  'gate-ring': { finishes: ['umbra', 'nacre', 'amnion'], x: [-2.75, 2.7], s: [-2.85, 2.75], top: 2.95, below: 1.1 },
  'brood-hive': { finishes: ['amnion', 'nacre'], x: [-2.6, 2.6], s: [-1.95, 2.95], top: 2.3, below: 1.05 },
  'spawning-pool': { finishes: ['amnion', 'nacre'], x: [-2.6, 2.45], s: [-2.5, 2.85], top: 2.5, below: .95 },
};

export type SitePart = 'body' | 'core' | 'ruin';
export const SITE_PARTS: readonly SitePart[] = ['body', 'core', 'ruin'];
export const siteNode = (id: SiteId, finish: PlanetId, part: SitePart) => `site_${id.replace(/-/g, '_')}_${finish}_${part}`;
/** The finish a site wears on a world, or null when it has no model there. */
export const siteFinish = (id: SiteId, planet: PlanetId): PlanetId | null =>
  SITE_MODELS[id]?.finishes.includes(planet) ? planet : null;
/** The file of a site's finish, under `assets/`. */
export const siteFile = (id: SiteId, finish: PlanetId) => `shared/sites/${id}-${finish}.glb`;
/** The sites a world has models for. */
export const sitesWithModels = (planet: PlanetId): SiteId[] =>
  (Object.keys(SITE_MODELS) as SiteId[]).filter(id => SITE_MODELS[id]!.finishes.includes(planet));
