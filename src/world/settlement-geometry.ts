import type { DistrictPolicy } from './settlement-grammars';

/*
 * Settlement shapes shared by the outposts (terrain-settlements.ts) and the districts (terrain-districts.ts): a leaf
 * module, so neither of the two imports the other for its types or pad geometry.
 */

export type Archetype = 'refinery' | 'mining' | 'plant' | 'landing' | 'comm' | 'pumping' | 'wreck' | 'abandoned'
  // Vesper (docs/17 §4).
  | 'radiator' | 'missile' | 'cryo' | 'harbour' | 'exchanger' | 'reactor';
/** Settlement cells along s, one candidate per side per cell. */
export const SETTLEMENT_CELL = 30;

export type ModuleKind = 'infra' | 'shared' | 'kit';
/** A module in world space; kit modules name a kit kind (rock, boulder, crystal…) instead of a node. */
export interface PlacedModule {
  id: string; kind: ModuleKind; node: string; x: number; s: number; yaw: number;
  /** Kit modules only: uniform scale and variant pick. */
  scale: number; pick: number;
  /** A fixed base height (e.g. a quay at sea level) instead of the pad level. */
  base?: number;
  /** Detail the low graphics tier may skip (district lights, parked vehicles, crates); never a silhouette. */
  cosmetic?: boolean;
}
/** The district a lot belongs to (on its Settlement). */
export interface DistrictTag { id: string; role: 'hub' | 'lot'; minS: number; maxS: number; policy: DistrictPolicy }
export interface Settlement {
  id: string; cell: number; side: number; archetype: Archetype;
  x: number; s: number; turns: number; mirror: number;
  /** Pad level (snapped) and world-space half extents after rotation. */
  level: number; hx: number; hs: number;
  /** 0 = natural ground (wrecks), 1 = fully flattened pad. */
  flatten: number;
  modules: PlacedModule[];
  /** District lots only (docs/23): the district, the hub's road gates, and the structure cap of its pieces. */
  district?: DistrictTag;
  gates?: readonly { x: number; s: number }[];
  cap?: number;
}

/** Rounded-rectangle distance to a settlement pad (negative inside). */
export function padDistance(site: Settlement, x: number, s: number): number {
  const corner = 1.4, qx = Math.abs(x - site.x) - (site.hx - corner), qs = Math.abs(s - site.s) - (site.hs - corner);
  return Math.hypot(Math.max(qx, 0), Math.max(qs, 0)) + Math.min(Math.max(qx, qs), 0) - corner;
}
