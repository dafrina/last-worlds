import type { EncounterCue, FormationPlacement } from './encounters';
import type { PlanetId, SiteId } from '../shared/contracts';

/**
 * Strike sites (docs/33 § 3): optional side routes with an authored guard and a core target whose death drops loot.
 * Placeholder contract: workstream B fills in the guards, cores and loot; workstream A draws sites from `sitePool` for
 * side slots and places them with `siteCue`.
 */
export interface SiteDefinition {
  readonly id: SiteId;
  readonly name: string;
  readonly worlds: readonly PlanetId[];
  /** Relative draw weight in a side slot (rare sites lower). */
  readonly weight: number;
  /** Authored guard, placed relative to the site (world-anchored on its side). */
  readonly guard: readonly FormationPlacement[];
  readonly loot: { readonly kind: 'part' | 'shield' | 'credit' | 'weapon' | 'power'; readonly value: number };
}

const site = (id: SiteId, name: string, worlds: readonly PlanetId[], loot: SiteDefinition['loot'], weight = 1): SiteDefinition =>
  ({ id, name, worlds, weight, guard: [], loot });
const FRONTIER: readonly PlanetId[] = ['luna', 'khepri', 'vesper'];
const UMBRAL: readonly PlanetId[] = ['umbra', 'nacre'];
const BROOD: readonly PlanetId[] = ['amnion', 'nacre'];
/** Frontier and Umbral sites the brood has overrun on Amnion (user, 29 October: "theres also not a lot for amnion"). */
const OVERRUN: readonly PlanetId[] = [...FRONTIER, 'amnion'];

export const SITES: Readonly<Record<SiteId, SiteDefinition>> = {
  'crash-site': site('crash-site', 'CRASH SITE', ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'umbra'], { kind: 'part', value: 1 }),
  airfield: site('airfield', 'AIRFIELD', FRONTIER, { kind: 'part', value: 1 }),
  'salvage-yard': site('salvage-yard', 'SALVAGE YARD', FRONTIER, { kind: 'part', value: 3 }, .3),
  'shield-depot': site('shield-depot', 'SHIELD DEPOT', FRONTIER, { kind: 'shield', value: 1 }),
  'relay-station': site('relay-station', 'RELAY STATION', OVERRUN, { kind: 'credit', value: 25 }),
  'freight-terminal': site('freight-terminal', 'FREIGHT TERMINAL', OVERRUN, { kind: 'weapon', value: 1 }),
  'dark-spaceport': site('dark-spaceport', 'DARK SPACEPORT', UMBRAL, { kind: 'part', value: 1 }),
  'prism-reactor': site('prism-reactor', 'PRISM REACTOR', UMBRAL, { kind: 'shield', value: 1 }),
  'sealed-vault': site('sealed-vault', 'SEALED VAULT', UMBRAL, { kind: 'part', value: 3 }, .3),
  'gate-ring': site('gate-ring', 'GATE RING', [...UMBRAL, 'amnion'], { kind: 'power', value: 1 }),
  'brood-hive': site('brood-hive', 'BROOD HIVE', BROOD, { kind: 'part', value: 1 }),
  'spawning-pool': site('spawning-pool', 'SPAWNING POOL', BROOD, { kind: 'shield', value: 1 }),
};

/** The sites a world can show, in SITE_IDS order. */
export function sitePool(planet: PlanetId): SiteDefinition[] {
  return Object.values(SITES).filter(definition => definition.worlds.includes(planet));
}

/** A site's side-route cue at `at` seconds, `side` −1 west or 1 east (placeholder: its guard and message only). */
export function siteCue(id: SiteId, side: -1 | 1, at: number, planet: PlanetId): EncounterCue {
  const definition = SITES[id];
  return {
    at, id: `site-${id}-${planet}-${at}`, phase: 'recovery', site: { id, side },
    message: `${definition.name} · ${side < 0 ? 'WEST' : 'EAST'}`,
    formations: definition.guard.map(placement => ({ ...placement, anchor: 'world', x: side * 7.5 + (placement.x ?? 0) })),
  };
}
