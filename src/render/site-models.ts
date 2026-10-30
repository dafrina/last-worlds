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
 * core's centre stands SITE_CORE_HEIGHT above the pivot. Foundations reach `below` under the pivot for uneven ground.
 *
 * Phase 1 (29 October) models one site per family; the other eight follow after the user's review. A site without a
 * model here shows its core enemy's own model.
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

/** The ground targets' core height (GROUND_HEIGHT in src/sim/motion.ts): every site's core is centred there. */
export const SITE_CORE_HEIGHT = 0.85;
/** docs/25 rule 3: roofs stay 0.45 under the flight plane; a site on high ground is squashed about its core to keep that. */
export const SITE_ROOF_CLEARANCE = 0.45;

export const SITE_MODELS: Readonly<Partial<Record<SiteId, SiteModel>>> = {
  'crash-site': { finishes: ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'umbra'], x: [-2.95, 3.0], s: [-2.1, 2.3], top: 1.3, below: .7 },
  'airfield': { finishes: ['luna', 'khepri', 'vesper'], x: [-2.7, 3.0], s: [-3.2, 3.25], top: 2.05, below: 1.3 },
  'prism-reactor': { finishes: ['umbra', 'nacre'], x: [-2.8, 2.8], s: [-2.45, 2.75], top: 2.95, below: 1.15, spin: .45 },
  'brood-hive': { finishes: ['amnion', 'nacre'], x: [-2.6, 2.6], s: [-1.7, 2.95], top: 2.35, below: 1.05 },
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
