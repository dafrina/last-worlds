import type { EncounterCue, FormationPlacement } from './encounters';
import { THREAT_COST } from './balance';
import { FORMATIONS, siteCoreFormation, slotFlies, type FormationId } from './formations';
import type { Mode, PlanetId, SiteId } from '../shared/contracts';

/**
 * Strike sites (docs/33 § 3): optional side routes, each with an authored guard and a core target whose death drops
 * loot. The single runtime source for the twelve sites: worlds, draw weights, guards per world, cores and loot.
 * Workstream A draws sites from `sitePool` for side slots and places them with `siteCue`; src/sim/sites.ts runs them.
 *
 * Rules (docs/33 § 3): a site is optional (never needed to survive, invariant 5); its guard flies only kinds that already
 * fly on its world (turrets and darts on Luna and Khepri, missile batteries and Needles on Vesper, both on the far
 * worlds), heavier for parts sites, light for shield sites; the core never attacks and is a ground target with an
 * explicit proxy (invariant 4). Loot is the campaign's; endless never earns progression (invariants 6 and 13), so its
 * parts sites drop a power cell and a score bonus instead.
 */
export type SiteLootKind = 'part' | 'shield' | 'credit';
export interface SiteDefinition {
  readonly id: SiteId;
  readonly name: string;
  readonly worlds: readonly PlanetId[];
  /** Relative draw weight in a side slot (rare sites lower). */
  readonly weight: number;
  /**
   * Authored guard per world, placed relative to the site: `x` is the offset outward from its centre (toward the map's
   * edge), and the west site is the mirror image of the east one.
   */
  readonly guard: Readonly<Partial<Record<PlanetId, readonly FormationPlacement[]>>>;
  /**
   * The core target (`site-core-<site>` in src/content/formations.ts: one core at the site's centre, or the sealed
   * vault's three seals): the hit points (before the difficulty's or endless ramp's hp scale) and collision radius of
   * each. The loot drops when the last one breaks.
   */
  readonly core: { readonly hp: number; readonly radius: number };
  /**
   * Campaign loot: `value` parts or credits, or one shield cell. Campaign weapons and tiers are bought, never picked up
   * (docs/30), so the weapon and power sites pay credits there.
   */
  readonly loot: { readonly kind: SiteLootKind; readonly value: number };
  /** Endless loot: a power cell (parts sites, plus `score`), a shield cell, a weapon, or `score` alone. */
  readonly endless: { readonly kind: 'power' | 'shield' | 'weapon' | 'score'; readonly score: number };
}

/** How far out a site sits from the map's centre line (docs/33 § 3: "about 7.5 units out"). */
export const SITE_X = 7.5;
/**
 * The ground every site model fits around its centre (the core's ground point; workstream C, 30 October): |x| ≤ `x`,
 * s from `s[0]` to `s[1]`. The seat search (src/sim/sites.ts) finds flat dry ground for it, and the guards' ring spots
 * (content/formations.ts RING_*) stand outside it. src/render/site-models.ts asserts every model inside it.
 */
export const SITE_FOOTPRINT = { x: 3.0, s: [-3.2, 3.3] } as const;
/**
 * Each site's core height over its ground: the target's centre, where the model draws it (a tower's cab, a floating
 * crystal, a hook's load). The simulation anchors the core with it (its `groundHeight`). One entry per line:
 * tools/blender/strike_sites.py parses them.
 */
export const SITE_CORE_HEIGHT: Readonly<Record<SiteId, number>> = {
  'crash-site': 1.05,
  'airfield': 1.85,
  'salvage-yard': 1.6,
  'shield-depot': .85,
  'relay-station': 1.9,
  'freight-terminal': .85,
  'dark-spaceport': 1.9,
  'prism-reactor': 1.95,
  'sealed-vault': 1.45,
  'gate-ring': 1.55,
  'brood-hive': .85,
  'spawning-pool': 1.45,
};
/** Score for destroying a site's core, in both modes. */
export const SITE_SCORE = 500;
/** Endless score bonus per part a parts site would have dropped in the campaign. */
export const ENDLESS_PART_SCORE = 1000;
/** Credits instead of a shield cell when a shield site finds no budgeted supply left to take (src/sim/sites.ts). */
export const SHIELD_FALLBACK_CREDITS = 10;

const FRONTIER: readonly PlanetId[] = ['luna', 'khepri', 'vesper'];
const UMBRAL: readonly PlanetId[] = ['umbra', 'nacre'];
const BROOD: readonly PlanetId[] = ['amnion', 'nacre'];
/** Frontier sites the brood has overrun on Amnion (user, 29 October: "theres also not a lot for amnion"). */
const OVERRUN: readonly PlanetId[] = [...FRONTIER, 'amnion'];

const g = (formation: FormationId, x = 0): FormationPlacement => ({ formation, x });
/** One guard for several worlds. */
const on = (worlds: readonly PlanetId[], guard: readonly FormationPlacement[]) => Object.fromEntries(worlds.map(world => [world, guard]));
const CORE = { hp: 80, radius: 0.7 } as const;
const partSite = (value: number) => ({ loot: { kind: 'part', value }, endless: { kind: 'power', score: ENDLESS_PART_SCORE * value } }) as const;
const shieldSite = { loot: { kind: 'shield', value: 1 }, endless: { kind: 'shield', score: 0 } } as const;

/*
 * Guards by threat cost (balance.ts THREAT_COST): parts sites 8–11, the rare ones heaviest; shield sites 4; credit and
 * weapon sites 4–6. The authored flourishes: the airfield scrambles a dart pair, the salvage yard and sealed vault call in
 * a heavy, the crash site draws a scavenger, the brood hive a drone and the dark spaceport an interceptor. Core hit
 * points (provisional, 29 October): about 0.8 s of a tier-1 Twin Pulse, so one committed pass breaks one.
 */
export const SITES: Readonly<Record<SiteId, SiteDefinition>> = {
  'crash-site': {
    id: 'crash-site', name: 'CRASH SITE', worlds: ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'umbra'], weight: 1, core: CORE, ...partSite(1),
    guard: { ...on(['luna', 'khepri'], [g('site-turrets-3'), g('solo-weaver', -1.5)]), vesper: [g('site-missiles-3'), g('needle-solo', -1.5)],
      ...on(['nacre', 'amnion', 'umbra'], [g('site-mixed-3'), g('solo-weaver', -1.5)]) },
  },
  airfield: {
    id: 'airfield', name: 'AIRFIELD', worlds: FRONTIER, weight: 1, core: CORE, ...partSite(1),
    guard: { ...on(['luna', 'khepri'], [g('site-turrets-3'), g('site-scramble', -1)]), vesper: [g('site-missiles-3'), g('needle-solo', -1.5)] },
  },
  'salvage-yard': {
    id: 'salvage-yard', name: 'SALVAGE YARD', worlds: FRONTIER, weight: 0.3, core: { ...CORE, hp: 150 }, ...partSite(3),
    guard: { ...on(['luna', 'khepri'], [g('site-turrets-4'), g('arrow-3', -1.5)]), vesper: [g('site-missiles-3'), g('diamond-solo', -1.5)] },
  },
  'shield-depot': {
    id: 'shield-depot', name: 'SHIELD DEPOT', worlds: FRONTIER, weight: 1, core: CORE, ...shieldSite,
    guard: { ...on(['luna', 'khepri'], [g('site-turrets-2')]), vesper: [g('site-missiles-2')] },
  },
  'relay-station': {
    id: 'relay-station', name: 'RELAY STATION', worlds: OVERRUN, weight: 1, core: CORE,
    loot: { kind: 'credit', value: 30 }, endless: { kind: 'score', score: 1500 },
    guard: { ...on(['luna', 'khepri'], [g('site-turrets-2'), g('solo-dart', -1.5)]), vesper: [g('site-missiles-2')], amnion: [g('site-mixed-2'), g('solo-dart', -1.5)] },
  },
  'freight-terminal': {
    id: 'freight-terminal', name: 'FREIGHT TERMINAL', worlds: OVERRUN, weight: 1, core: CORE,
    loot: { kind: 'credit', value: 40 }, endless: { kind: 'weapon', score: 0 },
    guard: { ...on(['luna', 'khepri'], [g('site-turrets-3')]), vesper: [g('site-missiles-3')], amnion: [g('site-mixed-3')] },
  },
  'dark-spaceport': {
    id: 'dark-spaceport', name: 'DARK SPACEPORT', worlds: UMBRAL, weight: 1, core: CORE, ...partSite(1),
    guard: on(UMBRAL, [g('site-mixed-3'), g('needle-solo', -1.5)]),
  },
  'prism-reactor': {
    id: 'prism-reactor', name: 'PRISM REACTOR', worlds: UMBRAL, weight: 1, core: CORE, ...shieldSite,
    guard: on(UMBRAL, [g('site-mixed-2')]),
  },
  'sealed-vault': {
    id: 'sealed-vault', name: 'SEALED VAULT', worlds: UMBRAL, weight: 0.3, core: { hp: 55, radius: 0.5 }, ...partSite(3),
    guard: on(UMBRAL, [g('site-vault-guard'), g('diamond-solo', -1.5)]),
  },
  'gate-ring': {
    id: 'gate-ring', name: 'GATE RING', worlds: [...UMBRAL, 'amnion'], weight: 1, core: CORE,
    // Campaign: a budgeted shield cell (user, 29 October: "Credits on campaign instead of power is fine but you can also
    // drop shields"); endless: a power cell.
    loot: { kind: 'shield', value: 1 }, endless: { kind: 'power', score: 0 },
    guard: on([...UMBRAL, 'amnion'], [g('site-mixed-2'), g('solo-weaver', -1.5)]),
  },
  'brood-hive': {
    id: 'brood-hive', name: 'BROOD HIVE', worlds: BROOD, weight: 1, core: CORE, ...partSite(1),
    guard: on(BROOD, [g('site-mixed-3'), g('solo-weaver', -1.5)]),
  },
  'spawning-pool': {
    id: 'spawning-pool', name: 'SPAWNING POOL', worlds: BROOD, weight: 1, core: CORE, ...shieldSite,
    guard: on(BROOD, [g('site-mixed-2')]),
  },
};

/**
 * Every site rolls for a part (user, 30 October: "Every site rolls"; campaign only): 25% for a guard of threat 4 (the lightly
 * guarded shield sites) up to 75% for 8 (the old parts sites), linear in the guard's threat on that world. The salvage yard
 * and the sealed vault keep their guaranteed 3 parts and roll nothing (null).
 */
export const PART_CHANCE = { min: 0.25, max: 0.75, minThreat: 4, maxThreat: 8 } as const;
export function sitePartChance(id: SiteId, planet: PlanetId): number | null {
  const definition = SITES[id];
  if (definition.loot.kind === 'part' && definition.loot.value > 1) return null;
  const threat = (definition.guard[planet] ?? []).reduce((sum, placement) => sum + FORMATIONS[placement.formation].slots
    .filter(slot => slotFlies(slot, 'standard')).reduce((total, slot) => total + THREAT_COST[slot.kind], 0), 0);
  const t = Math.min(1, Math.max(0, (threat - PART_CHANCE.minThreat) / (PART_CHANCE.maxThreat - PART_CHANCE.minThreat)));
  return PART_CHANCE.min + t * (PART_CHANCE.max - PART_CHANCE.min);
}

/** The sites a world can show, in SITE_IDS order. */
export function sitePool(planet: PlanetId): SiteDefinition[] {
  return Object.values(SITES).filter(definition => definition.worlds.includes(planet));
}

/** What a site's message promises in a mode: `PARTS`, `SHIELD`, … (endless: what it actually drops there). */
export function siteLootLabel(id: SiteId, mode: Mode): string {
  const definition = SITES[id];
  const kind = mode === 'campaign' ? definition.loot.kind : definition.endless.kind;
  return { part: 'PARTS', shield: 'SHIELD', credit: 'CREDITS', weapon: 'WEAPON', power: 'POWER', score: 'BONUS' }[kind];
}
/** A site's own message (docs/33 § 3), e.g. `AIRFIELD · WEST · PARTS`. */
export const siteMessage = (id: SiteId, side: -1 | 1, mode: Mode) => `${SITES[id].name} · ${side < 0 ? 'WEST' : 'EAST'} · ${siteLootLabel(id, mode)}`;

/**
 * A site's side-route cue at `at` seconds, `side` −1 west or 1 east: its world's guard and its core, world-anchored on
 * that side, and its message (the campaign's; the simulation shows the run's mode's, src/sim/sites.ts). A site on a
 * world it does not belong to keeps its core and flies no guard.
 */
export function siteCue(id: SiteId, side: -1 | 1, at: number, planet: PlanetId): EncounterCue {
  const definition = SITES[id];
  const placements = [...(definition.guard[planet] ?? []), { formation: siteCoreFormation(id) }];
  return {
    at, id: `site-${id}-${planet}-${at}`, phase: 'recovery', site: { id, side },
    message: siteMessage(id, side, 'campaign'),
    formations: placements.map(placement => ({ ...placement, anchor: 'world', x: side * (SITE_X + (placement.x ?? 0)), mirror: side < 0 ? !placement.mirror : !!placement.mirror })),
  };
}
