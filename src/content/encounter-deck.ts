import { DIFFICULTIES, THREAT_COST } from './balance';
import { cycleSector, ENDLESS_CYCLE, endlessPlanet, isFirstVisit, isPrologue } from './endless';
import { cueRoster, f, type EncounterCue, type FormationPlacement, type PacingPhase } from './encounters';
import { FORMATIONS, slotFlies, type FormationId } from './formations';
import { MISSION_PLANET } from './missions';
import { siteCue, sitePool } from './sites';
import type { EnemyKind, MissionId, PlanetId, RunConfig, SiteId } from '../shared/contracts';

/**
 * The encounter deck (docs/33 § 4; user, 29 October 2026: "Every play would be a little different"). Each campaign mission
 * and each endless stage keeps an authored arc of slots; `resolvePlaylist` turns it into the concrete cue list the
 * director flies (src/sim/game.ts `updateDirector`), with a seeded roll per attempt (endless: per sector):
 *
 * - **fixed** slots fly as written: intros, every cue with a message (teaching steps, set pieces, weapon and power
 *   opportunities), reliefs;
 * - **pool** slots (`pressure`, `climax`) draw an authored wave from their world's pool for that phase: the same role as
 *   the slot's nominal wave (air squadron or ground battery) and the same attack character (`waveCharacter`), a threat
 *   cost near the nominal's, flown as authored or as its validated mirror image. The nominal is what the arc flew before
 *   the deck and what a slot falls back to when no pool wave fits;
 * - **side** slots draw a strike site (docs/33 § 3) from the world's site pool by its weight, on a side drawn by the roll.
 *
 * Waves and attacks stay authored, never assembled from parts (AGENTS.md invariant 8 as narrowed in docs/08, 29
 * October): only their order and their variations are drawn. Every drawn cue still passes the director's admission
 * (threat budget, entity ceiling, airspace) and the fairness checks unchanged.
 *
 * Guard rails: each slot keeps its attack character, so Pulsars and the Wraith fly only where the arc put them; no wave
 * twice in a row (nor the same site twice in a row), and where the pool allows not the same wave as the last one of its
 * role either; a per-slot threat band; consecutive cues within
 * PAIR_WINDOW seconds may together cost no more than the arc put there (at least PAIR_FLOOR), so two heavy waves never
 * stack; the wave after a strike site fits the Standard threat budget together with the site's guard where the pool
 * allows; on teaching arcs (every campaign mission, the Luna prologue and the opening sector of each world's first endless
 * visit) a slot whose nominal introduces a formation flies it as authored, and draws use only formations already
 * introduced, so a world's squadrons appear in their authored order.
 */

type CuePickup = EncounterCue['pickup'];
export type DeckPhase = Extract<PacingPhase, 'pressure' | 'climax'>;
export type WaveRole = 'air' | 'ground';

export type DeckSlot =
  | { readonly kind: 'fixed'; readonly cue: EncounterCue }
  /**
   * `site` (campaign only): the slot is the arc's `site`-th strike site place when the attempt's site count reaches it
   * (SITE_COUNT); the site then stands in for the slot's ground battery, otherwise the slot draws as usual.
   */
  | { readonly kind: 'pool'; readonly at: number; readonly id: string; readonly phase: DeckPhase; readonly nominal: readonly FormationPlacement[]; readonly pickup?: CuePickup; readonly site?: number }
  /**
   * A strike site's side route. `pickup` (optional) is placed on the drawn side (its x mirrored). `rank` (campaign only):
   * the slot flies its site when the attempt's site count reaches it, otherwise it is an empty relief.
   */
  | { readonly kind: 'side'; readonly at: number; readonly id: string; readonly pickup?: CuePickup; readonly rank?: number };

export interface DeckTemplate {
  readonly id: string;
  /** The world whose wave pools the pool slots draw from and whose site pool the side slots draw from. */
  readonly world: PlanetId;
  /** A teaching arc: introductions fly as authored and draws use only formations already introduced. */
  readonly teach: boolean;
  /** A campaign arc: it draws its strike-site count (SITE_COUNT) and flies that many of its ranked site places. */
  readonly campaign?: boolean;
  readonly slots: readonly DeckSlot[];
}

/** An authored wave a pool slot may draw: one air squadron or ground battery (with optional ground companions). */
export interface DeckWave {
  readonly id: string;
  /** View-anchored placements. One air formation at most: two air squadrons in one cue could never share the airspace. */
  readonly formations: readonly FormationPlacement[];
  /** Lateral offsets the roll may add to every placement (validated in tests/sim/encounter-deck.test.ts). */
  readonly offsets: readonly number[];
  /** Whether the roll may fly the validated mirror image. */
  readonly mirror: boolean;
  /** Relative draw weight. */
  readonly weight: number;
}

/** Seconds within which two consecutive cues count as one stretch for the pair budget. */
export const PAIR_WINDOW = 5;
/** The pair budget never falls below this, so light stretches can still vary. */
export const PAIR_FLOOR = 10;
/**
 * A slot draws waves costing between `low` and `high` times its nominal's threat cost, at the Standard rank and, for the
 * upper bound, at the Veteran rank too: a draw never asks more of the pilot than the wave the arc authored there (30
 * October; up to 1.5 times measured harder than the fixed lists on Rolling Thunder Veteran and endless).
 */
export const BAND = { low: 0.65, high: 1 } as const;
/** The threat band a pool slot draws from, for a nominal cost. */
export const band = (nominal: number) => ({ min: BAND.low * nominal - 1e-9, max: BAND.high * nominal + 1e-9 });
/**
 * Strike sites per campaign attempt (user, 30 October: "keep sites 1-4, with 2 being most probable"): the count's draw
 * weights. An arc offers four site places in order (DeckSlot `rank` / `site`); the attempt flies the first `count`.
 */
export const SITE_COUNT: readonly { readonly count: number; readonly weight: number }[] = [
  { count: 1, weight: 0.2 }, { count: 2, weight: 0.45 }, { count: 3, weight: 0.25 }, { count: 4, weight: 0.1 },
];
/** Seconds after a side slot within which the next pool wave and the site's guard should fit the Standard budget. */
export const SIDE_WINDOW = 6;
/** Seconds within which a second strike site stands on the other side of the first. */
export const SITE_CALM = 15;
/**
 * Squadrons whose late members may still lock a beam lane as their path ends (src/sim/motion.ts applyBeamLock pulls a
 * beam ship onto its lane), which the airspace prediction cannot foresee when it admits the next squadron. The next air
 * cue after one is admitted just as it leaves: a draw makes it no Needle squadron (they dive straight into the column's
 * band), nor a strike site with an air guard, where the pool allows.
 */
export const LINGERING: readonly FormationId[] = ['needle-column-5'];
/**
 * Kinds whose stretch flies exactly as the arc authored it: a Pulsar's tracking stream and a Wraith's arrival are the
 * hardest things to read (docs/27, docs/29), and the arcs pair them deliberately (a Pulsar pair after a Needle column,
 * missile batteries beside it, never aimed turrets). So no draw adds one (the pools carry none), and their slot and every
 * slot within PAIR_WINDOW of it fly their nominal (30 October: a third missile battery drawn beside Final Horizon's
 * artillery ship, a mirrored Pulsar pair or a Needle line instead of the column before it in endless sector 9 each pushed
 * the pilot to the world edge, where the stream caught it).
 */
export const SCARCE: readonly EnemyKind[] = ['pulsar', 'wraith'];
const NEEDLES: ReadonlySet<FormationId> = new Set(['needle-solo', 'needle-line-3', 'needle-column-5']);

const isGroundFormation = (formation: FormationId) => FORMATIONS[formation].entry === 'ground';
/**
 * A wave's attack character: what its armed members do. The arcs pair characters deliberately (a Pulsar's tracking stream
 * beside missile batteries that fire down their own columns, never beside aimed turrets; Needle beams between weaver
 * flights), so a pool slot draws only waves of its nominal's character: fighters (darts and weavers), beams (Needles and
 * Lancers), heavies (Diamonds), Pulsars, the Wraith; aimed turret batteries or missile batteries on the ground.
 */
export type WaveCharacter = 'fighter' | 'beam' | 'heavy' | 'pulsar' | 'wraith' | 'turret' | 'missile' | 'none';
export function waveCharacter(placements: readonly FormationPlacement[]): WaveCharacter {
  const kinds = new Set(placements.filter(p => !FORMATIONS[p.formation].harmless).flatMap(p => FORMATIONS[p.formation].slots.map(slot => slot.kind)));
  return kinds.has('pulsar') ? 'pulsar' : kinds.has('wraith') ? 'wraith' : kinds.has('diamond') ? 'heavy' : kinds.has('needle') || kinds.has('lancer') ? 'beam'
    : kinds.has('missile') ? 'missile' : kinds.has('turret') ? 'turret' : kinds.size ? 'fighter' : 'none';
}
const flies = (placements: readonly FormationPlacement[], kinds: readonly EnemyKind[]) => placements.some(p => FORMATIONS[p.formation].slots.some(slot => kinds.includes(slot.kind)));
/** Threat cost of placements at a rank (Standard by default; balance.ts THREAT_COST). */
export function placementCost(placements: readonly FormationPlacement[], rank: 'standard' | 'veteran' = 'standard'): number {
  return placements.reduce((sum, placement) => sum + FORMATIONS[placement.formation].slots
    .filter(slot => slotFlies(slot, rank)).reduce((total, slot) => total + THREAT_COST[slot.kind], 0), 0);
}
/** Air if any placement flies, ground if all are ground batteries and skids. */
export const placementRole = (placements: readonly FormationPlacement[]): WaveRole => placements.some(p => !isGroundFormation(p.formation)) ? 'air' : 'ground';
/** A wave's identity for the no-repeat rule: its formations, whatever their variation. */
const waveKey = (placements: readonly FormationPlacement[]) => placements.map(p => p.formation).sort().join('+');

/*
 * Variations: the validated mirror image only. Lateral offsets (±1–1.5 on narrow squadrons and batteries) were tried and
 * dropped (30 October): a wave shifted toward the world edge while the ship was out there closed it in, and those edge
 * hits outweighed the ones a shift toward the centre spared. A wave may still opt in with `offsets` (tested in view).
 */

/** An authored pool wave: formation ids (view-anchored at the slot's centre) or explicit placements. */
function w(formations: FormationId | readonly (FormationId | FormationPlacement)[], options: { weight?: number; mirror?: boolean; offsets?: readonly number[] } = {}): DeckWave {
  const placements = (typeof formations === 'string' ? [formations] : formations).map(entry => typeof entry === 'string' ? f(entry) : entry);
  return {
    id: placements.map(p => p.formation + (p.x ? `@${p.x}` : '')).join('+'),
    formations: placements,
    offsets: options.offsets ?? [0],
    mirror: options.mirror ?? true,
    weight: options.weight ?? 1,
  };
}

/*
 * ---- Wave pools per world and phase ----
 * Only kinds and formations each world already flies (tested against the nominal arcs). To add a wave, append `w(...)`
 * to its world's phase: one air squadron, or ground batteries, optionally with harmless skids. It is drawn wherever its
 * role and threat cost suit a slot; tests/sim/encounter-deck.test.ts checks its variations stay in view and that it is
 * admitted into an empty sky.
 */
const LUNA_PRESSURE: readonly DeckWave[] = [
  w('arrow-3'), w('line-dart-4'), w('echelon-4'), w('dive-pair'), w(['dive-pair', 'fuel-pair']), w('line-weaver-4'), w('snake-weaver-5'),
  w(['echelon-4', 'fuel-depot']), w(['arrow-3', 'fuel-pair']), w('solo-lancer'),
  w('battery-2'), w('battery-3'), w('depot-2'),
];
const LUNA_CLIMAX: readonly DeckWave[] = [
  w('arrow-3'), w('arrow-5'), w('line-dart-4'), w('echelon-4'), w('pincer-4'), w('diamond-lancer'), w('snake-weaver-5'), w('line-weaver-4'),
  w('battery-2'), w('battery-3'), w('depot-2'),
];
const KHEPRI_PRESSURE: readonly DeckWave[] = [
  w('arrow-3'), w('arrow-5'), w('line-dart-4'), w('echelon-4'), w(['echelon-4', 'fuel-depot']), w('dive-pair'), w('line-weaver-4'), w('snake-weaver-5'),
  w('diamond-lancer'), w('pincer-4'),
  w('battery-2'), w('battery-3'), w('battery-4'), w('depot-2'), w('depot-3'),
];
const KHEPRI_CLIMAX: readonly DeckWave[] = [
  w('arrow-5'), w('line-dart-4'), w('echelon-4'), w('pincer-4'), w('diamond-lancer'), w('snake-weaver-5'), w('line-weaver-4'),
  w('battery-2'), w('battery-3'), w('battery-4'), w('depot-3'),
];
const VESPER_PRESSURE_POOL: readonly DeckWave[] = [
  w('needle-solo'), w('needle-line-3'), w('needle-column-5'), w('diamond-solo'), w('diamond-convoy'),
  w('missile-2'), w('missile-3'), w('depot-missile'),
];
const VESPER_CLIMAX: readonly DeckWave[] = [
  w('needle-line-3'), w('needle-column-5'), w('diamond-solo'), w('diamond-convoy'),
  w('missile-2'), w('missile-3'), w('depot-missile'),
];
const NACRE_PRESSURE_POOL: readonly DeckWave[] = [
  w('line-weaver-4'), w(['line-weaver-4', 'fuel-pair']), w('snake-weaver-5'), w('needle-solo'), w('needle-line-3'), w('needle-column-5'),
  w('diamond-solo'),
  w('battery-2'), w('battery-3'), w('depot-2'), w('depot-3'), w('missile-2'), w('missile-3'), w('depot-missile'),
];
const NACRE_CLIMAX: readonly DeckWave[] = [
  w('line-weaver-4'), w('snake-weaver-5'), w('needle-line-3'), w('needle-column-5'), w('diamond-solo'), w('diamond-convoy'),
  w('battery-3'), w('depot-3'), w('missile-2'), w('missile-3'), w('depot-missile'),
];
/** Amnion's brood (docs/27): drone flights, nest spires, spore mortars, egg sacs, heavies (its two Pulsars fly in their arc slots). */
const AMNION_PRESSURE: readonly DeckWave[] = [
  w('arrow-3'), w('line-dart-4'), w('line-weaver-4'), w(['line-weaver-4', 'fuel-pair']), w('snake-weaver-5'), w('needle-line-3'), w('needle-column-5'),
  w('diamond-solo'), w('diamond-lancer'),
  w('battery-2'), w('battery-3'), w('depot-2'), w('depot-3'), w('missile-2'), w('missile-3'), w('depot-missile'),
];
const AMNION_CLIMAX: readonly DeckWave[] = [
  w('arrow-5'), w('line-weaver-4'), w('snake-weaver-5'), w('needle-line-3'), w('needle-column-5'), w('diamond-lancer'), w('diamond-convoy'),
  w('battery-3'), w('depot-3'), w('missile-2'), w('missile-3'), w('depot-missile'),
];
/** Umbra's fleet (docs/28): Amnion's mix of craft (its Wraiths and artillery ships fly in their arc slots). */
const UMBRA_PRESSURE: readonly DeckWave[] = AMNION_PRESSURE;
const UMBRA_CLIMAX: readonly DeckWave[] = AMNION_CLIMAX;

export const DECK_POOLS: Readonly<Record<PlanetId, Readonly<Record<DeckPhase, readonly DeckWave[]>>>> = {
  luna: { pressure: LUNA_PRESSURE, climax: LUNA_CLIMAX },
  khepri: { pressure: KHEPRI_PRESSURE, climax: KHEPRI_CLIMAX },
  vesper: { pressure: VESPER_PRESSURE_POOL, climax: VESPER_CLIMAX },
  nacre: { pressure: NACRE_PRESSURE_POOL, climax: NACRE_CLIMAX },
  amnion: { pressure: AMNION_PRESSURE, climax: AMNION_CLIMAX },
  umbra: { pressure: UMBRA_PRESSURE, climax: UMBRA_CLIMAX },
};

/* ---- Template building ---- */
const fix = (cue: EncounterCue): DeckSlot => ({ kind: 'fixed', cue });
/** A pool slot; `site` makes it the arc's `site`-th strike site place (a stand-in for its ground battery). */
function draw(cue: EncounterCue, site?: number): DeckSlot {
  if (cue.phase !== 'pressure' && cue.phase !== 'climax') throw new Error(`pool slot ${cue.id} must be pressure or climax`);
  return { kind: 'pool', at: cue.at, id: cue.id, phase: cue.phase, nominal: cue.formations, ...(cue.pickup ? { pickup: cue.pickup } : {}), ...(site ? { site } : {}) };
}
const side = (slot: { at: number; id: string; pickup?: CuePickup; rank?: number }): DeckSlot => ({ kind: 'side', ...slot });
/** A slot's time. */
export const slotAt = (slot: DeckSlot) => slot.kind === 'fixed' ? slot.cue.at : slot.at;
/** The slot moved by `dt` seconds (and renamed with `prefix`). */
function moved(slot: DeckSlot, dt: number, prefix = ''): DeckSlot {
  return slot.kind === 'fixed' ? { kind: 'fixed', cue: { ...slot.cue, at: slot.cue.at + dt, id: prefix + slot.cue.id } } : { ...slot, at: slot.at + dt, id: prefix + slot.id };
}
const relief = (at: number, id: string): DeckSlot => fix({ at, id, phase: 'recovery', formations: [] });

/**
 * Training sortie over Luna. Teaches each squadron, then the same arc at pressure, then WARDEN-1 lands at 113 s
 * (its approach closes at 105 s). Its climax keeps lighter batteries and a three-dart finale; Rolling Thunder and
 * endless carry the heaviest phrases. Its teaching steps fly as authored (a teaching arc).
 */
const TRAINING: readonly DeckSlot[] = [
  fix({ at: 2, id: 't-first-contact', phase: 'intro', message: 'LINE UP TO FIRE', formations: [f('solo-dart')] }),
  fix({ at: 7, id: 't-arrow', phase: 'intro', message: 'ARROWHEAD · KEEP MOVING', formations: [f('arrow-3')] }),
  fix({ at: 13, id: 't-weaver', phase: 'intro', message: 'WATCH THE WARNING · THEN EVADE', formations: [f('solo-weaver', -1.5)] }),
  fix({ at: 17, id: 't-ground', phase: 'pressure', message: 'GROUND CORES ARE TARGETS TOO', formations: [f('battery-2')] }),
  fix({ at: 20, id: 't-line', phase: 'pressure', message: 'LINE ABREAST · READ THE SWEEP', formations: [f('line-dart-4')] }),
  draw({ at: 26, id: 't-battery-3', phase: 'pressure', formations: [f('battery-3')] }),
  draw({ at: 29, id: 't-echelon', phase: 'pressure', formations: [f('echelon-4')] }),
  fix({ at: 35, id: 't-dive', phase: 'pressure', message: 'FUEL SKIDS · SHOOT THEM FOR SALVAGE', formations: [f('dive-pair'), f('fuel-pair')] }),
  side({ at: 39, id: 't-west', pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 }, rank: 1 }),
  side({ at: 44, id: 't-east', rank: 4 }),
  draw({ at: 49, id: 't-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] }),
  draw({ at: 53, id: 't-battery', phase: 'pressure', formations: [f('battery-3')] }, 2),
  fix({ at: 56, id: 't-snake', phase: 'pressure', message: 'COLUMN CROSSING', formations: [f('snake-weaver-5')] }),
  fix({ at: 61, id: 't-lancer', phase: 'pressure', message: 'BEAM LOCK · LEAVE THE MARKED LANE', formations: [f('solo-lancer', 1)] }),
  draw({ at: 64, id: 't-battery-2', phase: 'pressure', formations: [f('battery-2')] }),
  draw({ at: 67, id: 't-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true), f('fuel-depot')] }),
  fix({ at: 72, id: 't-arrow-5', phase: 'climax', message: 'SQUADRONS INBOUND', formations: [f('arrow-5')] }),
  draw({ at: 75, id: 't-battery-climax-1', phase: 'climax', formations: [f('battery-3')] }, 3),
  draw({ at: 79, id: 't-pincer', phase: 'climax', formations: [f('pincer-4')] }),
  draw({ at: 84, id: 't-battery-climax', phase: 'climax', formations: [f('battery-2')] }),
  draw({ at: 86, id: 't-diamond', phase: 'climax', formations: [f('diamond-lancer')] }),
  draw({ at: 92, id: 't-snake-climax', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 95, id: 't-battery-late', phase: 'climax', formations: [f('battery-2')] }),
  fix({ at: 97, id: 't-last', phase: 'climax', message: 'LAST PATROL', formations: [f('line-dart-4')] }),
  draw({ at: 101, id: 't-last-ground', phase: 'climax', formations: [f('battery-3')] }),
  draw({ at: 103, id: 't-last-arrow', phase: 'climax', formations: [f('arrow-3')] }),
  fix({ at: 104, id: 't-relief', phase: 'recovery', formations: [] }),
];

/** Rolling Thunder approach. Ends before BASTION.approachEndsAt; relief precedes the fortress. */
const ROLLING_THUNDER: readonly DeckSlot[] = [
  fix({ at: 2, id: 'r-arrow', phase: 'intro', formations: [f('arrow-3')] }),
  fix({ at: 7, id: 'r-ground', phase: 'intro', formations: [f('battery-2')] }),
  draw({ at: 11, id: 'r-line', phase: 'pressure', formations: [f('line-dart-4')] }),
  draw({ at: 16, id: 'r-battery', phase: 'pressure', formations: [f('battery-3')] }, 3),
  draw({ at: 18, id: 'r-echelon', phase: 'pressure', formations: [f('echelon-4')] }),
  draw({ at: 24, id: 'r-snake', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  fix({ at: 27, id: 'r-battery-2', phase: 'pressure', message: 'FUEL DEPOT · ONE SHOT SETS IT OFF', formations: [f('depot-2')] }),
  draw({ at: 30, id: 'r-diamond', phase: 'pressure', formations: [f('diamond-lancer')] }),
  draw({ at: 36, id: 'r-dive', phase: 'pressure', formations: [f('dive-pair')] }),
  // One strike site where the old salvage route was: a second one held the threat budget until the fuel depot after the
  // recovery arrived on top of it, the pilot still out at a site by the world edge (docs/33 § 4.1).
  // No site at 41 s: it stood 6 s before the fixed fuel depot, and an airfield there sealed the lanes with it (seed 53).
  // The old salvage route's credits stay.
  fix({ at: 41, id: 'r-west', phase: 'recovery', formations: [], pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 } }),
  draw({ at: 47, id: 'r-pincer', phase: 'pressure', formations: [f('pincer-4')] }),
  draw({ at: 51, id: 'r-battery-4', phase: 'pressure', formations: [f('battery-4')] }),
  draw({ at: 54, id: 'r-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] }),
  draw({ at: 60, id: 'r-battery-3', phase: 'pressure', formations: [f('depot-3')] }, 2),
  draw({ at: 63, id: 'r-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true), f('fuel-depot')] }),
  fix({ at: 69, id: 'r-arrow-5', phase: 'climax', message: 'FORTRESS ESCORT · BREAK THROUGH', formations: [f('arrow-5')] }),
  draw({ at: 73, id: 'r-battery-climax', phase: 'climax', formations: [f('battery-3')] }),
  draw({ at: 76, id: 'r-diamond-climax', phase: 'climax', formations: [f('diamond-lancer')] }),
  draw({ at: 82, id: 'r-battery-4-climax', phase: 'climax', formations: [f('battery-4')] }, 4),
  draw({ at: 84, id: 'r-snake-climax', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 89, id: 'r-pincer-climax', phase: 'climax', formations: [f('pincer-4')] }),
  draw({ at: 93, id: 'r-last', phase: 'climax', formations: [f('battery-2')] }),
  fix({ at: 98, id: 'r-relief', phase: 'recovery', formations: [] }),
];

/** Endless sector 1 (pace 0.8): formations from the first seconds, then the full pressure arc. */
const SECTOR_OPENING: readonly DeckSlot[] = [
  fix({ at: 2, id: 'e1-contact', phase: 'intro', formations: [f('solo-dart')] }),
  fix({ at: 6, id: 'e1-arrow', phase: 'intro', formations: [f('arrow-3')] }),
  fix({ at: 11, id: 'e1-ground', phase: 'intro', message: 'POWER CELL AHEAD', formations: [f('solo-turret')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } }),
  draw({ at: 16, id: 'e1-line', phase: 'pressure', formations: [f('line-weaver-4')] }),
  fix({ at: 24, id: 'e1-fan', phase: 'pressure', message: 'FAN CANNON AHEAD · COLLECT TO EQUIP', formations: [f('battery-2')], pickup: { kind: 'weapon', x: 2, s: 17, value: 1, weapon: 'fan' } }),
  draw({ at: 26, id: 'e1-echelon', phase: 'pressure', formations: [f('echelon-4')] }),
  draw({ at: 30, id: 'e1-snake', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  draw({ at: 33, id: 'e1-battery-2', phase: 'pressure', formations: [f('battery-2')] }),
  draw({ at: 36, id: 'e1-arrow-5', phase: 'pressure', formations: [f('arrow-5')] }),
  side({ at: 44, id: 'e1-west', pickup: { kind: 'credit', x: -7.5, s: 18, value: 5 } }),
  fix({ at: 50, id: 'e1-diamond', phase: 'pressure', message: 'SEEKER ARRAY AHEAD · COLLECT TO EQUIP', formations: [f('diamond-lancer')], pickup: { kind: 'weapon', x: -2, s: 17, value: 1, weapon: 'seeker' } }),
  draw({ at: 54, id: 'e1-battery', phase: 'pressure', formations: [f('battery-3')] }),
  draw({ at: 58, id: 'e1-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] }),
  draw({ at: 63, id: 'e1-line-dart', phase: 'pressure', formations: [f('line-dart-4')] }),
  draw({ at: 66, id: 'e1-battery-3', phase: 'pressure', formations: [f('battery-2')] }),
  draw({ at: 69, id: 'e1-pincer', phase: 'climax', formations: [f('pincer-4')] }),
  draw({ at: 73, id: 'e1-battery-4', phase: 'climax', formations: [f('battery-4')] }),
  draw({ at: 76, id: 'e1-arrow-climax', phase: 'climax', formations: [f('arrow-5')] }),
  draw({ at: 80, id: 'e1-battery-climax', phase: 'climax', formations: [f('battery-3')] }),
  relief(86, 'e1-relief'),
];

/** Endless sectors 2-3: back-to-back squadrons with batteries beneath them and shorter recoveries. */
const SECTOR_PRESSURE: readonly DeckSlot[] = [
  fix({ at: 2, id: 'e2-arrow', phase: 'intro', formations: [f('arrow-5')] }),
  draw({ at: 5, id: 'e2-ground', phase: 'pressure', formations: [f('battery-3')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } }),
  draw({ at: 9, id: 'e2-echelon', phase: 'pressure', formations: [f('echelon-4')] }),
  draw({ at: 13, id: 'e2-battery-4', phase: 'pressure', formations: [f('battery-4')] }),
  draw({ at: 15, id: 'e2-snake', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 20, id: 'e2-diamond', phase: 'pressure', formations: [f('diamond-lancer')] }),
  draw({ at: 23, id: 'e2-battery-2', phase: 'pressure', formations: [f('battery-2')] }),
  draw({ at: 26, id: 'e2-line', phase: 'pressure', formations: [f('line-dart-4')] }),
  side({ at: 33, id: 'e2-west', pickup: { kind: 'weapon', x: -7, s: 17, value: 1, weapon: 'fan' } }),
  draw({ at: 38, id: 'e2-pincer', phase: 'pressure', formations: [f('pincer-4')] }),
  draw({ at: 41, id: 'e2-battery', phase: 'pressure', formations: [f('battery-3')] }),
  draw({ at: 44, id: 'e2-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] }),
  draw({ at: 49, id: 'e2-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] }),
  draw({ at: 52, id: 'e2-battery-3', phase: 'pressure', formations: [f('battery-2')] }),
  draw({ at: 54, id: 'e2-seeker', phase: 'pressure', formations: [f('dive-pair')], pickup: { kind: 'weapon', x: 0, s: 17, value: 1, weapon: 'seeker' } }),
  draw({ at: 58, id: 'e2-climax-diamond', phase: 'climax', formations: [f('diamond-lancer')] }),
  draw({ at: 61, id: 'e2-climax-battery', phase: 'climax', formations: [f('battery-4')] }),
  draw({ at: 64, id: 'e2-climax-snake', phase: 'climax', formations: [f('snake-weaver-5')] }),
  draw({ at: 68, id: 'e2-climax-arrow', phase: 'climax', formations: [f('arrow-5')] }),
  draw({ at: 71, id: 'e2-climax-battery-3', phase: 'climax', formations: [f('battery-3')] }),
  draw({ at: 74, id: 'e2-climax-pincer', phase: 'climax', formations: [f('pincer-4')] }),
  relief(84, 'e2-relief'),
];

/** Endless sector 4 onward: the capped peak arc, repeated at the capped ramp. */
const SECTOR_PEAK: readonly DeckSlot[] = [
  fix({ at: 2, id: 'e3-line', phase: 'intro', formations: [f('line-dart-4')] }),
  draw({ at: 4, id: 'e3-battery', phase: 'pressure', formations: [f('battery-3')] }),
  draw({ at: 7, id: 'e3-pincer', phase: 'pressure', formations: [f('pincer-4')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } }),
  draw({ at: 10, id: 'e3-battery-4', phase: 'pressure', formations: [f('battery-4')] }),
  draw({ at: 12, id: 'e3-diamond', phase: 'pressure', formations: [f('diamond-lancer')] }),
  draw({ at: 17, id: 'e3-snake', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  draw({ at: 19, id: 'e3-battery-2', phase: 'pressure', formations: [f('battery-2')] }),
  draw({ at: 21, id: 'e3-echelon', phase: 'pressure', formations: [f('echelon-4')] }),
  draw({ at: 25, id: 'e3-arrow', phase: 'pressure', formations: [f('arrow-5')] }),
  side({ at: 31, id: 'e3-west', pickup: { kind: 'weapon', x: -7, s: 17, value: 1, weapon: 'rail' } }),
  draw({ at: 36, id: 'e3-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] }),
  draw({ at: 38, id: 'e3-battery-3', phase: 'pressure', formations: [f('battery-3')] }),
  draw({ at: 41, id: 'e3-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] }),
  draw({ at: 44, id: 'e3-arrow-2', phase: 'pressure', formations: [f('arrow-5')] }),
  draw({ at: 46, id: 'e3-battery-late', phase: 'pressure', formations: [f('battery-4')] }),
  draw({ at: 48, id: 'e3-seeker', phase: 'pressure', formations: [f('diamond-lancer')], pickup: { kind: 'weapon', x: -1, s: 17, value: 1, weapon: 'seeker' } }),
  draw({ at: 53, id: 'e3-climax-pincer', phase: 'climax', formations: [f('pincer-4')] }),
  draw({ at: 55, id: 'e3-climax-battery', phase: 'climax', formations: [f('battery-3')] }),
  draw({ at: 58, id: 'e3-climax-snake', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 61, id: 'e3-climax-arrow', phase: 'climax', formations: [f('arrow-5')] }),
  draw({ at: 63, id: 'e3-climax-battery-4', phase: 'climax', formations: [f('battery-4')] }),
  draw({ at: 66, id: 'e3-climax-line', phase: 'climax', formations: [f('line-dart-4')] }),
  draw({ at: 70, id: 'e3-climax-diamond', phase: 'climax', formations: [f('diamond-lancer')] }),
  draw({ at: 72, id: 'e3-climax-battery-2', phase: 'climax', formations: [f('battery-2')] }),
  draw({ at: 74, id: 'e3-climax-echelon', phase: 'climax', formations: [f('echelon-4')] }),
  relief(84, 'e3-relief'),
];

/** Endless Vesper, first sector of a Vesper stint: the Vesper roster from the first seconds. */
const VESPER_OPENING: readonly DeckSlot[] = [
  fix({ at: 2, id: 'ev1-needle', phase: 'intro', formations: [f('needle-solo')] }),
  fix({ at: 5, id: 'ev1-diamond', phase: 'intro', formations: [f('diamond-solo')] }),
  fix({ at: 9, id: 'ev1-missiles', phase: 'intro', message: 'POWER CELL AHEAD', formations: [f('missile-2')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } }),
  draw({ at: 13, id: 'ev1-line', phase: 'pressure', formations: [f('needle-line-3')] }),
  draw({ at: 18, id: 'ev1-missiles-3', phase: 'pressure', formations: [f('missile-3')] }),
  draw({ at: 21, id: 'ev1-column', phase: 'pressure', formations: [f('needle-column-5')] }),
  draw({ at: 27, id: 'ev1-missiles-2', phase: 'pressure', formations: [f('missile-2')] }),
  draw({ at: 30, id: 'ev1-heavy', phase: 'pressure', formations: [f('diamond-solo')] }),
  side({ at: 36, id: 'ev1-west', pickup: { kind: 'credit', x: -7.5, s: 18, value: 5 } }),
  draw({ at: 42, id: 'ev1-line-2', phase: 'pressure', formations: [f('needle-line-3')] }),
  draw({ at: 46, id: 'ev1-missiles-4', phase: 'pressure', formations: [f('missile-3')] }),
  draw({ at: 49, id: 'ev1-column-left', phase: 'pressure', formations: [f('needle-column-5', 0, true)] }),
  fix({ at: 55, id: 'ev1-convoy', phase: 'climax', message: 'ESCORT CONVOY', formations: [f('diamond-convoy')] }),
  draw({ at: 59, id: 'ev1-convoy-missiles', phase: 'climax', formations: [f('missile-2')] }),
  draw({ at: 62, id: 'ev1-convoy-line', phase: 'climax', formations: [f('needle-line-3', -1)] }),
  draw({ at: 67, id: 'ev1-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] }),
  draw({ at: 72, id: 'ev1-convoy-missiles-2', phase: 'climax', formations: [f('missile-3')] }),
  relief(84, 'ev1-relief'),
];

/** Endless Vesper, later sectors of a first Vesper stint. */
const VESPER_PRESSURE: readonly DeckSlot[] = [
  fix({ at: 2, id: 'ev2-line', phase: 'intro', formations: [f('needle-line-3')] }),
  draw({ at: 5, id: 'ev2-missiles', phase: 'pressure', formations: [f('missile-3')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } }),
  draw({ at: 9, id: 'ev2-heavy', phase: 'pressure', formations: [f('diamond-solo')] }),
  draw({ at: 13, id: 'ev2-column', phase: 'pressure', formations: [f('needle-column-5')] }),
  draw({ at: 17, id: 'ev2-missiles-2', phase: 'pressure', formations: [f('missile-2')] }),
  draw({ at: 20, id: 'ev2-convoy', phase: 'pressure', formations: [f('diamond-convoy')] }),
  draw({ at: 26, id: 'ev2-missiles-3', phase: 'pressure', formations: [f('missile-3')] }),
  side({ at: 32, id: 'ev2-west', pickup: { kind: 'weapon', x: -7, s: 17, value: 1, weapon: 'rail' } }),
  draw({ at: 38, id: 'ev2-line-2', phase: 'pressure', formations: [f('needle-line-3', 1)] }),
  draw({ at: 41, id: 'ev2-missiles-4', phase: 'pressure', formations: [f('missile-2')] }),
  draw({ at: 44, id: 'ev2-column-left', phase: 'pressure', formations: [f('needle-column-5', 0, true)] }),
  draw({ at: 49, id: 'ev2-heavy-2', phase: 'pressure', formations: [f('diamond-solo')] }),
  draw({ at: 53, id: 'ev2-climax-missiles', phase: 'climax', formations: [f('missile-3')] }),
  draw({ at: 56, id: 'ev2-climax-convoy', phase: 'climax', formations: [f('diamond-convoy')] }),
  draw({ at: 61, id: 'ev2-climax-line', phase: 'climax', formations: [f('needle-line-3')] }),
  draw({ at: 65, id: 'ev2-climax-missiles-2', phase: 'climax', formations: [f('missile-2')] }),
  draw({ at: 68, id: 'ev2-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] }),
  relief(84, 'ev2-relief'),
];

/** Endless Vesper on later visits: the capped peak arc. */
const VESPER_PEAK: readonly DeckSlot[] = [
  fix({ at: 2, id: 'ev3-convoy', phase: 'intro', formations: [f('diamond-convoy')] }),
  draw({ at: 4, id: 'ev3-missiles', phase: 'pressure', formations: [f('missile-3')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } }),
  draw({ at: 8, id: 'ev3-column', phase: 'pressure', formations: [f('needle-column-5')] }),
  draw({ at: 11, id: 'ev3-missiles-2', phase: 'pressure', formations: [f('missile-2')] }),
  draw({ at: 13, id: 'ev3-line', phase: 'pressure', formations: [f('needle-line-3')] }),
  draw({ at: 18, id: 'ev3-convoy-2', phase: 'pressure', formations: [f('diamond-convoy')] }),
  draw({ at: 21, id: 'ev3-missiles-3', phase: 'pressure', formations: [f('missile-3')] }),
  draw({ at: 25, id: 'ev3-column-left', phase: 'pressure', formations: [f('needle-column-5', 0, true)] }),
  side({ at: 31, id: 'ev3-west', pickup: { kind: 'weapon', x: -7, s: 17, value: 1, weapon: 'fan' } }),
  draw({ at: 36, id: 'ev3-line-2', phase: 'pressure', formations: [f('needle-line-3', -1)] }),
  draw({ at: 38, id: 'ev3-missiles-4', phase: 'pressure', formations: [f('missile-2')] }),
  draw({ at: 41, id: 'ev3-heavy', phase: 'pressure', formations: [f('diamond-solo')] }),
  draw({ at: 45, id: 'ev3-missiles-5', phase: 'pressure', formations: [f('missile-3')] }),
  draw({ at: 48, id: 'ev3-column-2', phase: 'pressure', formations: [f('needle-column-5')] }),
  draw({ at: 53, id: 'ev3-climax-convoy', phase: 'climax', formations: [f('diamond-convoy')] }),
  draw({ at: 55, id: 'ev3-climax-missiles', phase: 'climax', formations: [f('missile-3')] }),
  draw({ at: 59, id: 'ev3-climax-line', phase: 'climax', formations: [f('needle-line-3', 1)] }),
  draw({ at: 63, id: 'ev3-climax-missiles-2', phase: 'climax', formations: [f('missile-2')] }),
  draw({ at: 66, id: 'ev3-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] }),
  relief(84, 'ev3-relief'),
];

/**
 * Cold Vector (Vesper, docs/17 §5): a high-contrast introduction over the shelf coast, Needle squadrons with
 * narrow beam lanes, relief, missile batteries on the ice cliffs, a heavy Diamond escort convoy, relief, then
 * the scroll eases to a stop over open ocean for the Helion Ark (HELION_ARK.approachEndsAt / arrivesAt).
 */
const COLD_VECTOR: readonly DeckSlot[] = [
  fix({ at: 2, id: 'v-first-needle', phase: 'intro', message: 'COLD VECTOR · NARROW BEAMS · WATCH THE LANE', formations: [f('needle-solo')] }),
  fix({ at: 7, id: 'v-first-diamond', phase: 'intro', message: 'DIAMOND HEAVY · ALTERNATING WINGS', formations: [f('diamond-solo')] }),
  fix({ at: 13, id: 'v-first-missiles', phase: 'intro', message: 'MISSILE BATTERIES FIRE DOWN THEIR OWN COLUMN', formations: [f('missile-2')] }),
  draw({ at: 17, id: 'v-needle-line', phase: 'pressure', formations: [f('needle-line-3')] }),
  draw({ at: 22, id: 'v-missiles', phase: 'pressure', formations: [f('missile-2')] }),
  draw({ at: 25, id: 'v-needle-column', phase: 'pressure', formations: [f('needle-column-5')] }),
  draw({ at: 31, id: 'v-missiles-3', phase: 'pressure', formations: [f('missile-3')] }),
  draw({ at: 34, id: 'v-needle-line-2', phase: 'pressure', formations: [f('needle-line-3', 1)] }),
  draw({ at: 41, id: 'v-needle-column-left', phase: 'pressure', formations: [f('needle-column-5', 0, true)] }),
  side({ at: 48, id: 'v-west', pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 }, rank: 1 }),
  side({ at: 53, id: 'v-east', rank: 4 }),
  fix({ at: 58, id: 'v-cliff-missiles', phase: 'pressure', message: 'MISSILE BATTERIES ON THE CLIFFS', formations: [f('missile-3')] }),
  draw({ at: 61, id: 'v-cliff-needles', phase: 'pressure', formations: [f('needle-line-3')] }),
  draw({ at: 66, id: 'v-cliff-missiles-2', phase: 'pressure', formations: [f('depot-missile')] }),
  draw({ at: 69, id: 'v-cliff-diamond', phase: 'pressure', formations: [f('diamond-solo')] }),
  draw({ at: 75, id: 'v-cliff-missiles-3', phase: 'pressure', formations: [f('missile-3')] }, 2),
  draw({ at: 78, id: 'v-cliff-column', phase: 'pressure', formations: [f('needle-column-5')] }),
  draw({ at: 84, id: 'v-cliff-missiles-4', phase: 'pressure', formations: [f('depot-missile')] }),
  fix({ at: 89, id: 'v-convoy', phase: 'climax', message: 'ESCORT CONVOY · BREAK THE DIAMONDS', formations: [f('diamond-convoy')] }),
  draw({ at: 94, id: 'v-convoy-missiles', phase: 'climax', formations: [f('missile-3')] }),
  draw({ at: 100, id: 'v-convoy-needles', phase: 'climax', formations: [f('needle-line-3')] }),
  draw({ at: 106, id: 'v-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] }),
  draw({ at: 112, id: 'v-convoy-missiles-2', phase: 'climax', formations: [f('missile-2')] }),
  draw({ at: 117, id: 'v-convoy-column', phase: 'climax', formations: [f('needle-column-5', 0, true)] }),
  draw({ at: 123, id: 'v-convoy-3', phase: 'climax', formations: [f('diamond-convoy')] }),
  draw({ at: 129, id: 'v-convoy-missiles-3', phase: 'climax', formations: [f('missile-3')] }),
  draw({ at: 135, id: 'v-convoy-needles-2', phase: 'climax', formations: [f('needle-line-3', -1)] }),
  fix({ at: 141, id: 'v-convoy-4', phase: 'climax', message: 'LAST ESCORT · OPEN WATER AHEAD', formations: [f('diamond-convoy')] }),
  draw({ at: 147, id: 'v-convoy-missiles-4', phase: 'climax', formations: [f('missile-2')] }),
  fix({ at: 160, id: 'v-relief', phase: 'recovery', formations: [] }),
];

/**
 * Deep Bloom (Nacre, docs/20): sine-flight weaver columns over the mire, Needle beams between the islands, ground
 * batteries and missile batteries on the islands and on pontoons, Diamond heavies, overlapping rhythms; relief, then
 * the scroll eases to a stop over open mire for THE VEIL (VEIL.approachEndsAt / arrivesAt). Pressure close to Cold
 * Vector.
 */
const DEEP_BLOOM: readonly DeckSlot[] = [
  fix({ at: 2, id: 'n-first-weavers', phase: 'intro', message: 'DEEP BLOOM · SINE FLIGHTS OVER THE MIRE', formations: [f('line-weaver-4'), f('fuel-pair')] }),
  fix({ at: 8, id: 'n-first-needle', phase: 'intro', formations: [f('needle-solo')] }),
  fix({ at: 12, id: 'n-first-batteries', phase: 'intro', message: 'BATTERIES ON THE ISLANDS', formations: [f('battery-2')] }),
  draw({ at: 16, id: 'n-snake', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  draw({ at: 21, id: 'n-missiles', phase: 'pressure', formations: [f('missile-2')] }),
  draw({ at: 24, id: 'n-needle-line', phase: 'pressure', formations: [f('needle-line-3')] }),
  fix({ at: 27, id: 'n-pulsar', phase: 'pressure', message: 'PULSAR · ITS STREAM FOLLOWS YOU · KEEP MOVING', formations: [f('pulsar-solo')] }),
  draw({ at: 30, id: 'n-battery-3', phase: 'pressure', formations: [f('depot-3')] }),
  fix({ at: 33, id: 'n-diamond', phase: 'pressure', message: 'DIAMOND HEAVY', formations: [f('diamond-solo')] }),
  draw({ at: 40, id: 'n-snake-left', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 45, id: 'n-missiles-3', phase: 'pressure', formations: [f('missile-3')] }),
  // One strike site in the recovery; the old east route is a relief. Two sites back to back held the threat budget
  // until the next pressure block arrived on top of them, while the pilot was still out at a site (docs/33 § 4.1).
  side({ at: 51, id: 'n-west', pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 }, rank: 1 }),
  relief(56, 'n-east'),
  draw({ at: 62, id: 'n-weaver-line', phase: 'pressure', formations: [f('line-weaver-4', 1)] }),
  draw({ at: 66, id: 'n-battery-mid', phase: 'pressure', formations: [f('battery-3')] }),
  draw({ at: 69, id: 'n-needle-column', phase: 'pressure', formations: [f('needle-column-5')] }),
  draw({ at: 72, id: 'n-pulsar-pair', phase: 'pressure', formations: [f('pulsar-pair')] }),
  draw({ at: 75, id: 'n-missiles-mid', phase: 'pressure', formations: [f('missile-2')] }),
  draw({ at: 78, id: 'n-snake-2', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  draw({ at: 84, id: 'n-diamond-2', phase: 'pressure', formations: [f('diamond-solo')] }),
  fix({ at: 90, id: 'n-climax-convoy', phase: 'climax', message: 'OVERLAPPING RHYTHMS', formations: [f('diamond-convoy')] }),
  draw({ at: 95, id: 'n-climax-batteries', phase: 'climax', formations: [f('battery-3')] }),
  draw({ at: 101, id: 'n-climax-weavers', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 106, id: 'n-climax-missiles', phase: 'climax', formations: [f('missile-3')] }, 4),
  draw({ at: 110, id: 'n-climax-needles', phase: 'climax', formations: [f('needle-line-3', -1)] }),
  draw({ at: 113, id: 'n-climax-pulsars', phase: 'climax', formations: [f('pulsar-solo', -1)] }),
  draw({ at: 116, id: 'n-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] }),
  draw({ at: 122, id: 'n-climax-batteries-2', phase: 'climax', formations: [f('depot-3')] }),
  draw({ at: 126, id: 'n-climax-weavers-2', phase: 'climax', formations: [f('line-weaver-4', -1)] }),
  fix({ at: 131, id: 'n-last-needles', phase: 'climax', message: 'LAST SQUADRON · OPEN MIRE AHEAD', formations: [f('needle-column-5', 0, true)] }),
  draw({ at: 137, id: 'n-last-missiles', phase: 'climax', formations: [f('missile-2')] }),
  fix({ at: 142, id: 'n-relief', phase: 'recovery', formations: [] }),
];

/**
 * Brood Strike over Amnion, the brood wastes (docs/27, 23 October 2026): the final campaign mission, on Deep Bloom's
 * proven timing grid (intro, pressure, a recovery pair to the flanks, climax, relief before THE CRADLE) with its own
 * mix: drone flights (weavers and darts) over the canyons, nest spires (batteries) and spore mortars (missile
 * batteries) on the plateaus, egg-sac depots to burst, heavies in the climax, and only two Pulsars (a tracking stream is
 * the hardest thing to read over the glowing canyons). Enemy craft and ground pieces keep their kinds' behaviour.
 */
const BROOD_STRIKE: readonly DeckSlot[] = [
  fix({ at: 2, id: 'b-first-drones', phase: 'intro', message: 'BROOD STRIKE · DRONES OVER THE CANYONS', formations: [f('line-weaver-4'), f('fuel-pair')] }),
  fix({ at: 8, id: 'b-first-darts', phase: 'intro', formations: [f('arrow-3')] }),
  fix({ at: 12, id: 'b-first-spires', phase: 'intro', message: 'NEST SPIRES ON THE PLATEAU', formations: [f('battery-2')] }),
  draw({ at: 16, id: 'b-snake', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  fix({ at: 21, id: 'b-mortars', phase: 'pressure', message: 'SPORE MORTARS · EACH FIRES DOWN ITS OWN COLUMN', formations: [f('missile-2')] }),
  draw({ at: 24, id: 'b-darts', phase: 'pressure', formations: [f('line-dart-4')] }),
  fix({ at: 27, id: 'b-eggs', phase: 'pressure', message: 'EGG SACS · BURST THEM', formations: [f('depot-3')] }),
  draw({ at: 30, id: 'b-needles', phase: 'pressure', formations: [f('needle-line-3')] }),
  fix({ at: 33, id: 'b-heavy', phase: 'pressure', message: 'BROOD HEAVY', formations: [f('diamond-solo')] }),
  draw({ at: 40, id: 'b-snake-left', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 45, id: 'b-mortars-3', phase: 'pressure', formations: [f('missile-3')] }),
  // One strike site in the recovery, as on Deep Bloom.
  side({ at: 51, id: 'b-west', pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 }, rank: 1 }),
  relief(56, 'b-east'),
  draw({ at: 62, id: 'b-drone-line', phase: 'pressure', formations: [f('line-weaver-4', 1)] }),
  draw({ at: 66, id: 'b-spires-mid', phase: 'pressure', formations: [f('battery-3')] }),
  draw({ at: 69, id: 'b-needle-column', phase: 'pressure', formations: [f('needle-column-5')] }),
  fix({ at: 72, id: 'b-pulsar', phase: 'pressure', message: 'PULSAR · ITS STREAM FOLLOWS YOU · KEEP MOVING', formations: [f('pulsar-solo')] }),
  draw({ at: 75, id: 'b-eggs-mid', phase: 'pressure', formations: [f('depot-missile')] }),
  draw({ at: 78, id: 'b-snake-2', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  draw({ at: 84, id: 'b-heavy-2', phase: 'pressure', formations: [f('diamond-lancer')] }),
  fix({ at: 90, id: 'b-climax-convoy', phase: 'climax', message: 'THE BROOD RISES', formations: [f('diamond-convoy')] }),
  draw({ at: 95, id: 'b-climax-spires', phase: 'climax', formations: [f('battery-3')] }),
  draw({ at: 101, id: 'b-climax-drones', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 106, id: 'b-climax-mortars', phase: 'climax', formations: [f('missile-3')] }, 4),
  draw({ at: 110, id: 'b-climax-darts', phase: 'climax', formations: [f('arrow-5')] }),
  draw({ at: 113, id: 'b-climax-pulsar', phase: 'climax', formations: [f('pulsar-solo', -1)] }),
  draw({ at: 116, id: 'b-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] }),
  draw({ at: 122, id: 'b-climax-eggs', phase: 'climax', formations: [f('depot-3')] }),
  draw({ at: 126, id: 'b-climax-drones-2', phase: 'climax', formations: [f('line-weaver-4', -1)] }),
  fix({ at: 131, id: 'b-last-needles', phase: 'climax', message: 'LAST SWARM · THE NEST IS AHEAD', formations: [f('needle-column-5', 0, true)] }),
  draw({ at: 137, id: 'b-last-mortars', phase: 'climax', formations: [f('missile-2')] }),
  fix({ at: 142, id: 'b-relief', phase: 'recovery', formations: [] }),
];

/**
 * Final Horizon over Umbra, the eternal eclipse (docs/28, 24 October 2026): the final campaign mission, on Brood Strike's
 * proven timing grid (intro, pressure, a recovery pair to the flanks, climax, relief before THE ECLIPSE) with the
 * Umbral fleet's mix: interceptor flights (darts and needles) over the shattered plains, heavy fighters (weavers),
 * defense turrets (batteries) and artillery mortars (missile batteries) on the plateaus, energy cells to break (depots),
 * elite hunters with their beams (lancers) and drone carriers (diamonds) in the climax, two artillery ships (Pulsars).
 * Pressure as Brood Strike's: the final planet is not made harder before it has been played.
 */
const FINAL_HORIZON: readonly DeckSlot[] = [
  fix({ at: 2, id: 'u-first-fighters', phase: 'intro', message: 'FINAL HORIZON · THE UMBRAL FLEET', formations: [f('line-weaver-4'), f('fuel-pair')] }),
  fix({ at: 8, id: 'u-first-interceptors', phase: 'intro', formations: [f('arrow-3')] }),
  fix({ at: 12, id: 'u-first-turrets', phase: 'intro', message: 'DEFENSE TURRETS ON THE OBSIDIAN', formations: [f('battery-2')] }),
  fix({ at: 16, id: 'u-phase-contact', phase: 'pressure', message: 'WRAITH · WATCH ITS ARRIVAL POINT', formations: [f('wraith-solo')] }),
  fix({ at: 21, id: 'u-mortars', phase: 'pressure', message: 'ARTILLERY · EACH FIRES DOWN ITS OWN COLUMN', formations: [f('missile-2')] }),
  draw({ at: 24, id: 'u-darts', phase: 'pressure', formations: [f('line-dart-4')] }),
  fix({ at: 27, id: 'u-cells', phase: 'pressure', message: 'ENERGY CELLS · BREAK THEM', formations: [f('depot-3')] }),
  draw({ at: 30, id: 'u-needles', phase: 'pressure', formations: [f('needle-line-3')] }),
  fix({ at: 33, id: 'u-carrier', phase: 'pressure', message: 'DRONE CARRIER', formations: [f('diamond-solo')] }),
  draw({ at: 40, id: 'u-snake-left', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 45, id: 'u-mortars-3', phase: 'pressure', formations: [f('missile-3')] }),
  // One strike site in the recovery, as on Deep Bloom.
  side({ at: 51, id: 'u-west', pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 }, rank: 1 }),
  relief(56, 'u-east'),
  draw({ at: 62, id: 'u-fighter-line', phase: 'pressure', formations: [f('line-weaver-4', 1)] }),
  draw({ at: 66, id: 'u-turrets-mid', phase: 'pressure', formations: [f('battery-3')] }),
  draw({ at: 69, id: 'u-needle-column', phase: 'pressure', formations: [f('needle-column-5')] }),
  fix({ at: 72, id: 'u-artillery', phase: 'pressure', message: 'ARTILLERY SHIP · ITS STREAM FOLLOWS YOU · KEEP MOVING', formations: [f('pulsar-solo')] }),
  draw({ at: 75, id: 'u-cells-mid', phase: 'pressure', formations: [f('depot-missile')] }),
  draw({ at: 78, id: 'u-phase-return', phase: 'pressure', formations: [f('wraith-solo', 0, true)] }),
  draw({ at: 84, id: 'u-hunter', phase: 'pressure', formations: [f('diamond-lancer')] }),
  fix({ at: 90, id: 'u-climax-convoy', phase: 'climax', message: 'THE FLEET CLOSES IN', formations: [f('diamond-convoy')] }),
  draw({ at: 95, id: 'u-climax-turrets', phase: 'climax', formations: [f('battery-3')] }),
  draw({ at: 101, id: 'u-climax-fighters', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 106, id: 'u-climax-mortars', phase: 'climax', formations: [f('missile-3')] }, 4),
  draw({ at: 110, id: 'u-climax-darts', phase: 'climax', formations: [f('arrow-5')] }),
  draw({ at: 113, id: 'u-climax-artillery', phase: 'climax', formations: [f('pulsar-solo', -1)] }),
  draw({ at: 116, id: 'u-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] }),
  draw({ at: 122, id: 'u-climax-cells', phase: 'climax', formations: [f('depot-3')] }),
  draw({ at: 126, id: 'u-climax-wraith', phase: 'climax', formations: [f('wraith-solo')] }),
  fix({ at: 131, id: 'u-last-needles', phase: 'climax', message: 'LAST SQUADRON · THE ABYSS IS AHEAD', formations: [f('needle-column-5', 0, true)] }),
  draw({ at: 137, id: 'u-last-mortars', phase: 'climax', formations: [f('missile-2')] }),
  fix({ at: 142, id: 'u-relief', phase: 'recovery', formations: [] }),
];

/**
 * Inserts an authored block into an arc at `at`: the block's slots start there (their times are relative) and every
 * later slot moves back by `length` seconds.
 */
function extend(base: readonly DeckSlot[], at: number, length: number, block: readonly DeckSlot[]): readonly DeckSlot[] {
  return [...base.filter(slot => slotAt(slot) < at), ...block.map(slot => moved(slot, at)),
    ...base.filter(slot => slotAt(slot) >= at).map(slot => moved(slot, length))];
}
/*
 * Longer campaign missions (user request, 16 October 2026), growing by mission: Training +10 s stays gentle; Rolling
 * Thunder +24 s, Cold Vector +28 s and Deep Bloom +36 s add authored stretches with fuel depots. Endless keeps the base
 * phrases (its sectors have their own length).
 */
const TRAINING_SORTIE = extend(TRAINING, 49, 10, [
  fix({ at: 0, id: 't-depot', phase: 'pressure', message: 'FUEL DEPOT · ONE SHOT SETS IT OFF', formations: [f('depot-2')] }),
  draw({ at: 4, id: 't-depot-arrow', phase: 'pressure', formations: [f('arrow-3')] }),
]);
const ROLLING_THUNDER_SORTIE = extend(ROLLING_THUNDER, 47, 24, [
  fix({ at: 0, id: 'r-x-depot', phase: 'pressure', message: 'FUEL DEPOT · LIGHT IT UP', formations: [f('depot-3')] }),
  draw({ at: 3, id: 'r-x-line', phase: 'pressure', formations: [f('line-dart-4')] }),
  draw({ at: 9, id: 'r-x-depot-2', phase: 'pressure', formations: [f('depot-2')] }),
  draw({ at: 11, id: 'r-x-snake', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] }),
  draw({ at: 17, id: 'r-x-battery', phase: 'pressure', formations: [f('battery-3')] }, 1),
  draw({ at: 19, id: 'r-x-diamond', phase: 'pressure', formations: [f('diamond-lancer')] }),
]);
const COLD_VECTOR_SORTIE = extend(COLD_VECTOR, 89, 28, [
  fix({ at: 0, id: 'v-x-depot', phase: 'pressure', message: 'FUEL BARGES · BLOW THEM', formations: [f('depot-missile')] }),
  draw({ at: 3, id: 'v-x-needles', phase: 'pressure', formations: [f('needle-line-3', -1)] }),
  draw({ at: 9, id: 'v-x-diamond', phase: 'pressure', formations: [f('diamond-solo')] }),
  draw({ at: 12, id: 'v-x-missiles', phase: 'pressure', formations: [f('missile-3')] }, 3),
  draw({ at: 16, id: 'v-x-column', phase: 'pressure', formations: [f('needle-column-5')] }),
  draw({ at: 21, id: 'v-x-depot-2', phase: 'pressure', formations: [f('depot-missile')] }),
  draw({ at: 23, id: 'v-x-diamond-2', phase: 'pressure', formations: [f('diamond-solo')] }),
]);
const BROOD_STRIKE_SORTIE = extend(BROOD_STRIKE, 62, 36, [
  fix({ at: 0, id: 'b-x-eggs', phase: 'pressure', message: 'EGG SACS IN THE BONE FIELD', formations: [f('depot-3')] }),
  draw({ at: 2, id: 'b-x-drones', phase: 'pressure', formations: [f('line-weaver-4', -1)] }),
  draw({ at: 8, id: 'b-x-needles', phase: 'pressure', formations: [f('needle-line-3')] }),
  draw({ at: 12, id: 'b-x-eggs-2', phase: 'pressure', formations: [f('depot-missile')] }, 2),
  draw({ at: 15, id: 'b-x-snake', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  draw({ at: 21, id: 'b-x-heavy', phase: 'pressure', formations: [f('diamond-solo')] }),
  draw({ at: 25, id: 'b-x-eggs-3', phase: 'pressure', formations: [f('depot-2')] }),
  draw({ at: 28, id: 'b-x-column', phase: 'pressure', formations: [f('needle-column-5', 0, true)] }),
  draw({ at: 33, id: 'b-x-mortars', phase: 'pressure', formations: [f('missile-2')] }, 3),
]);
const FINAL_HORIZON_SORTIE = extend(FINAL_HORIZON, 62, 36, [
  fix({ at: 0, id: 'u-x-cells', phase: 'pressure', message: 'ENERGY CELLS ON THE GLASS PLAINS', formations: [f('depot-3')] }),
  draw({ at: 2, id: 'u-x-fighters', phase: 'pressure', formations: [f('line-weaver-4', -1)] }),
  draw({ at: 8, id: 'u-x-needles', phase: 'pressure', formations: [f('needle-line-3')] }),
  draw({ at: 12, id: 'u-x-cells-2', phase: 'pressure', formations: [f('depot-missile')] }, 2),
  draw({ at: 15, id: 'u-x-snake', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  draw({ at: 21, id: 'u-x-carrier', phase: 'pressure', formations: [f('diamond-solo')] }),
  draw({ at: 25, id: 'u-x-cells-3', phase: 'pressure', formations: [f('depot-2')] }),
  draw({ at: 28, id: 'u-x-column', phase: 'pressure', formations: [f('needle-column-5', 0, true)] }),
  draw({ at: 33, id: 'u-x-mortars', phase: 'pressure', formations: [f('missile-2')] }, 3),
]);
const DEEP_BLOOM_SORTIE = extend(DEEP_BLOOM, 62, 36, [
  fix({ at: 0, id: 'n-x-depot', phase: 'pressure', message: 'FUEL DEPOTS IN THE GROVE', formations: [f('depot-3')] }),
  draw({ at: 2, id: 'n-x-weavers', phase: 'pressure', formations: [f('line-weaver-4', -1)] }),
  draw({ at: 8, id: 'n-x-needles', phase: 'pressure', formations: [f('needle-line-3')] }),
  draw({ at: 12, id: 'n-x-depot-2', phase: 'pressure', formations: [f('depot-missile')] }, 2),
  draw({ at: 15, id: 'n-x-snake', phase: 'pressure', formations: [f('snake-weaver-5')] }),
  draw({ at: 21, id: 'n-x-diamond', phase: 'pressure', formations: [f('diamond-solo')] }),
  draw({ at: 25, id: 'n-x-depot-3', phase: 'pressure', formations: [f('depot-2')] }),
  draw({ at: 28, id: 'n-x-column', phase: 'pressure', formations: [f('needle-column-5', 0, true)] }),
  draw({ at: 33, id: 'n-x-missiles', phase: 'pressure', formations: [f('missile-2')] }, 3),
]);

/** Endless prologue over Luna: Training's teaching phrases up to the boss sector's approach cutoff, then WARDEN-1. */
const LUNA_PROLOGUE: readonly DeckSlot[] = TRAINING.filter(slot => slotAt(slot) < ENDLESS_CYCLE.bossSector.approachEndsAt);

/**
 * Endless Nacre: the first stint opens with Deep Bloom's first 88 s (its one strike site), then its middle and climax
 * (shifted to start near 2 s; no strike site: that stretch has no recovery to hold one, and a site squeezed in before the
 * climax roughly quadrupled the perfect pilot's hits in sector 9); later visits fly the climax arc throughout, a strike
 * site in the gap between its two halves. A boss sector's cutoff trims each list.
 */
const NACRE_OPENING: readonly DeckSlot[] = DEEP_BLOOM.filter(slot => slotAt(slot) < 88);
const NACRE_PRESSURE: readonly DeckSlot[] = DEEP_BLOOM.filter(slot => slotAt(slot) >= 62 && slotAt(slot) < 142).map(slot => moved(slot, -60, 'en2-'));
const NACRE_PEAK: readonly DeckSlot[] = [
  ...DEEP_BLOOM.filter(slot => slotAt(slot) >= 90 && slotAt(slot) < 142).map(slot => moved(slot, -88, 'en3-')),
  side({ at: 52, id: 'en3-site' }),
  ...DEEP_BLOOM.filter(slot => slotAt(slot) >= 16 && slotAt(slot) < 50).map(slot => moved(slot, 43, 'en3b-')),
];

const template = (id: string, world: PlanetId, teach: boolean, slots: readonly DeckSlot[], campaign = false): DeckTemplate => ({ id, world, teach, slots, ...(campaign ? { campaign } : {}) });

/** Every campaign mission's arc: a teaching arc over its world. */
export const CAMPAIGN_DECKS: Readonly<Record<MissionId, DeckTemplate>> = {
  training: template('training', MISSION_PLANET.training, true, TRAINING_SORTIE, true),
  bastion: template('rolling-thunder', MISSION_PLANET.bastion, true, ROLLING_THUNDER_SORTIE, true),
  'cold-vector': template('cold-vector', MISSION_PLANET['cold-vector'], true, COLD_VECTOR_SORTIE, true),
  'deep-bloom': template('deep-bloom', MISSION_PLANET['deep-bloom'], true, DEEP_BLOOM_SORTIE, true),
  'brood-strike': template('brood-strike', MISSION_PLANET['brood-strike'], true, BROOD_STRIKE_SORTIE, true),
  'final-horizon': template('final-horizon', MISSION_PLANET['final-horizon'], true, FINAL_HORIZON_SORTIE, true),
};

/**
 * Endless stages (docs/18): the Luna prologue, then each world's opening, pressure and peak stages. The prologue and the
 * opening of each world's first visit are teaching arcs; the later stages draw from the whole world pool.
 */
export const ENDLESS_DECKS = {
  prologue: template('endless-prologue', 'luna', true, LUNA_PROLOGUE),
  khepriOpening: template('endless-khepri-opening', 'khepri', true, SECTOR_OPENING),
  khepriPressure: template('endless-khepri-pressure', 'khepri', false, SECTOR_PRESSURE),
  khepriPeak: template('endless-khepri-peak', 'khepri', false, SECTOR_PEAK),
  vesperOpening: template('endless-vesper-opening', 'vesper', true, VESPER_OPENING),
  vesperPressure: template('endless-vesper-pressure', 'vesper', false, VESPER_PRESSURE),
  vesperPeak: template('endless-vesper-peak', 'vesper', false, VESPER_PEAK),
  nacreOpening: template('endless-nacre-opening', 'nacre', true, NACRE_OPENING),
  nacrePressure: template('endless-nacre-pressure', 'nacre', false, NACRE_PRESSURE),
  nacrePeak: template('endless-nacre-peak', 'nacre', false, NACRE_PEAK),
} as const satisfies Readonly<Record<string, DeckTemplate>>;

/**
 * The arc of an endless sector: the Luna prologue first, then the planet's stages (Khepri kinds on Khepri, Vesper kinds
 * on Vesper, …), opening and pressure stages on the planet's first stint, its peak stage on later visits. A boss sector
 * admits no cue at or after ENDLESS_CYCLE.bossSector.approachEndsAt.
 */
export function endlessTemplate(sector: number): DeckTemplate {
  if (isPrologue(sector)) return ENDLESS_DECKS.prologue;
  const stage = (cycleSector(sector) - 1) % 3, first = isFirstVisit(sector);
  switch (endlessPlanet(sector)) {
    case 'nacre': return first ? (stage === 0 ? ENDLESS_DECKS.nacreOpening : ENDLESS_DECKS.nacrePressure) : ENDLESS_DECKS.nacrePeak;
    case 'vesper': return first ? (stage === 0 ? ENDLESS_DECKS.vesperOpening : ENDLESS_DECKS.vesperPressure) : ENDLESS_DECKS.vesperPeak;
    default: return first ? (stage === 0 ? ENDLESS_DECKS.khepriOpening : ENDLESS_DECKS.khepriPressure) : ENDLESS_DECKS.khepriPeak;
  }
}

/** The arc a run flies in `sector` (campaign: its mission's; endless: the sector's stage). */
export function deckTemplate(config: Pick<RunConfig, 'mode' | 'mission'>, sector: number): DeckTemplate {
  return config.mode === 'endless' ? endlessTemplate(sector) : CAMPAIGN_DECKS[config.mission ?? 'training'];
}

/** Every template, for validation. */
export const DECK_TEMPLATES: readonly DeckTemplate[] = [...Object.values(CAMPAIGN_DECKS), ...Object.values(ENDLESS_DECKS)];

/* ---- The seeded roll ---- */

/** Hash of the run seed, the template and the salt (endless: the sector): the deck's own stream, used by nothing else. */
function deckSeed(seed: number, id: string, salt: number): number {
  let h = 0x6465636b; // "deck": distinct from the loot stream (lootRng) and the hunters' roll
  const text = [...id].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261);
  for (const v of [seed, text, salt]) { h = Math.imul(h ^ (v >>> 0), 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; }
  return h >>> 0;
}
/** Mulberry32: unit rolls in [0, 1). */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weighted<T extends { readonly weight: number }>(items: readonly T[], roll: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = roll() * total;
  for (const item of items) { r -= item.weight; if (r < 0) return item; }
  return items[items.length - 1];
}

/** A resolved cue and what the guard rails need to know about it. */
interface Resolved {
  readonly cue: EncounterCue;
  /** Its threat cost and its slot's nominal cost (fixed cues: their own). */
  readonly cost: number;
  readonly nominal: number;
  readonly role: WaveRole | null;
  readonly key: string;
  readonly site?: SiteId;
  /** A pool slot that found no fitting wave and flew its nominal. */
  readonly fallback?: true;
  /** A draw outside the slot's band and character: the calm wave nearest it after a lingering column (LINGERING). */
  readonly outside?: true;
}

const formationsOf = (slot: DeckSlot) => slot.kind === 'fixed' ? slot.cue.formations : slot.kind === 'pool' ? slot.nominal : [];
const resolvedOf = (cue: EncounterCue, nominal = placementCost(cue.formations)): Resolved => ({
  cue, cost: placementCost(cue.formations), nominal, role: cue.formations.length ? placementRole(cue.formations) : null, key: waveKey(cue.formations),
});

/** The wave's placements flown with a variation: the mirror image (x mirrored too) and a lateral offset. */
export function varied(wave: Pick<DeckWave, 'formations'>, mirror: boolean, offset: number): FormationPlacement[] {
  return wave.formations.map(p => ({ formation: p.formation, x: (mirror ? -(p.x ?? 0) : p.x ?? 0) + offset, mirror: mirror !== !!p.mirror }));
}

/** Resolves a template with its seeded roll, keeping the guard rails' bookkeeping (tests read it). */
export function resolveDeck(template: DeckTemplate, seed: number, salt = 0): Resolved[] {
  const roll = stream(deckSeed(seed, template.id, salt));
  const pools = DECK_POOLS[template.world];
  // Teaching arcs: a pool slot whose nominal introduces a formation flies it as authored (fixed by the arc alone).
  const seen = new Set<FormationId>();
  // The campaign's strike-site count for this attempt (SITE_COUNT): its ranked site places up to it fly their sites.
  const count = template.campaign ? weighted(SITE_COUNT, roll).count : Infinity;
  const standIn = (slot: DeckSlot) => !!template.campaign && slot.kind === 'pool' && slot.site !== undefined && slot.site <= count;
  // A Pulsar's or the Wraith's stretch flies exactly as authored too: its own slot and the slots within PAIR_WINDOW of it
  // (SCARCE). A site standing in for a battery introduces nothing: the battery's next slot does.
  const scarceAt = template.slots.filter(slot => flies(formationsOf(slot), SCARCE)).map(slotAt);
  const locked = template.slots.map(slot => {
    const ids = standIn(slot) ? [] : formationsOf(slot).map(p => p.formation);
    const fresh = template.teach && slot.kind === 'pool' && ids.some(id => !seen.has(id));
    for (const id of ids) seen.add(id);
    return fresh || (slot.kind === 'pool' && scarceAt.some(at => Math.abs(at - slot.at) <= PAIR_WINDOW));
  });
  const introduced = new Set<FormationId>();
  // Every draw flies only formations its own arc flies (teaching arcs: only those already introduced).
  const arcFormations = new Set(template.slots.flatMap(slot => formationsOf(slot).map(p => p.formation)));
  const known = (wave: Pick<DeckWave, 'formations'>) => wave.formations.every(p => (template.teach ? introduced : arcFormations).has(p.formation));
  const out: Resolved[] = [];
  const budget = DIFFICULTIES.standard.threatBudget;
  /** Whether the last air cue so far flew a lingering squadron. */
  const lingering = () => [...out].reverse().find(entry => entry.cue.formations.some(p => !isGroundFormation(p.formation)))
    ?.cue.formations.some(p => LINGERING.includes(p.formation)) ?? false;
  /** A strike site at `at`: drawn from the world's pool by weight, on a side drawn by the roll (SITE_CALM: opposite a site just before). */
  const placeSite = (at: number, phase: PacingPhase, pickup?: CuePickup): Resolved => {
    const pool = sitePool(template.world);
    const lastSite = [...out].reverse().find(entry => entry.site)?.site;
    const fresh = pool.length > 1 ? pool.filter(definition => definition.id !== lastSite) : pool;
    const clear = lingering() ? fresh.filter(definition => (definition.guard[template.world] ?? []).every(p => isGroundFormation(p.formation))) : fresh;
    const site = weighted(clear.length ? clear : fresh, roll);
    // A second site within SITE_CALM of another stands on the other side: two on one side ran into each other's ground.
    const drawn: -1 | 1 = roll() < 0.5 ? -1 : 1;
    const near = [...out].reverse().find(entry => entry.site && at - entry.cue.at <= SITE_CALM)?.cue.site;
    const sideOf: -1 | 1 = near ? (near.side < 0 ? 1 : -1) : drawn;
    const cue: EncounterCue = { ...siteCue(site.id, sideOf, at, template.world), phase };
    const placed: EncounterCue = pickup ? { ...cue, pickup: { ...pickup, x: sideOf * Math.abs(pickup.x) } } : cue;
    return { ...resolvedOf(placed), role: null, key: `site:${site.id}`, site: site.id };
  };
  template.slots.forEach((slot, index) => {
    const previous = out[out.length - 1];
    if (slot.kind === 'fixed') out.push(resolvedOf(slot.cue));
    else if (slot.kind === 'side' && (slot.rank ?? 0) > count) out.push(resolvedOf({ at: slot.at, id: slot.id, phase: 'recovery', formations: [] }));
    else if (slot.kind === 'side') out.push(placeSite(slot.at, 'recovery', slot.pickup));
    else if (slot.kind === 'pool' && standIn(slot)) out.push(placeSite(slot.at, slot.phase, slot.pickup));
    else {
      const nominalCue: EncounterCue = { at: slot.at, id: slot.id, phase: slot.phase, formations: slot.nominal, ...(slot.pickup ? { pickup: slot.pickup } : {}) };
      const nominalCost = placementCost(slot.nominal), nominalVeteran = placementCost(slot.nominal, 'veteran'), role = placementRole(slot.nominal), character = waveCharacter(slot.nominal);
      if (locked[index]) out.push(resolvedOf(nominalCue));
      else {
        const lastOfRole = [...out].reverse().find(entry => entry.role === role);
        const next = template.slots[index + 1];
        // The next slot when it is already decided (fixed, or an introduction) and close enough to share the stretch.
        const decided = next && (next.kind === 'fixed' || locked[index + 1]);
        const ahead = decided && slotAt(next) - slot.at <= PAIR_WINDOW ? placementCost(formationsOf(next)) : null;
        const nextKey = decided && formationsOf(next).length ? waveKey(formationsOf(next)) : null;
        const cap = (other: number) => Math.max(other + nominalCost, PAIR_FLOOR);
        const site = previous?.site && slot.at - previous.cue.at <= SIDE_WINDOW ? previous : null;
        const range = band(nominalCost);
        // Strictly: never the previous cue's wave nor the last wave of the same role. If nothing fits, only never the
        // previous cue's.
        const fitting = (strict: boolean, anyCharacter = false) => pools[slot.phase].filter(wave => {
          const cost = placementCost(wave.formations), key = waveKey(wave.formations);
          return placementRole(wave.formations) === role && (anyCharacter ? !flies(wave.formations, SCARCE) : waveCharacter(wave.formations) === character)
            && cost >= range.min && cost <= range.max && placementCost(wave.formations, 'veteran') <= nominalVeteran + 1e-9 && known(wave)
            && key !== previous?.key && key !== nextKey && (!strict || key !== lastOfRole?.key)
            && (!previous || previous.site || slot.at - previous.cue.at > PAIR_WINDOW || cost + previous.cost <= cap(previous.nominal))
            && (ahead === null || cost + ahead <= cap(ahead));
        });
        const strict = fitting(true), fits = strict.length ? strict : fitting(false);
        // After a lingering column, no Needle squadron (LINGERING).
        const calmWave = (wave: DeckWave) => !wave.formations.some(p => NEEDLES.has(p.formation));
        const linger = role === 'air' && lingering();
        let settled = linger ? fits.filter(calmWave) : fits;
        if (linger && !settled.length) {
          // No calm wave in the band: the calm air wave of the phase nearest the nominal's cost (the lighter on a tie), never
          // one with a scarce kind.
          const nextNominal = next ? waveKey(formationsOf(next)) : null;
          const calm = pools[slot.phase].filter(wave => placementRole(wave.formations) === 'air' && calmWave(wave) && !flies(wave.formations, SCARCE) && waveKey(wave.formations) !== previous?.key
            && waveKey(wave.formations) !== nextNominal && placementCost(wave.formations) <= nominalCost + 1e-9 && known(wave));
          const nearest = Math.min(...calm.map(wave => Math.abs(placementCost(wave.formations) - nominalCost)));
          const near = calm.filter(wave => Math.abs(placementCost(wave.formations) - nominalCost) === nearest);
          const lightest = Math.min(...near.map(wave => placementCost(wave.formations)));
          settled = near.filter(wave => placementCost(wave.formations) === lightest).map(wave => ({ ...wave, outside: true }));
        }
        const calm = settled.length ? settled : fits;
        // After a strike site, prefer a wave that fits the Standard budget beside the site's guard.
        const light = site ? calm.filter(wave => placementCost(wave.formations) + site.cost <= budget) : calm;
        let choices = light.length ? light : calm;
        // Nothing of the slot's character fits: its nominal, unless that would repeat the previous wave; then a wave of
        // another character in the band (never one with a scarce kind).
        if (!choices.length && waveKey(slot.nominal) === previous?.key) choices = fitting(false, true).map(wave => ({ ...wave, outside: true }));
        if (!choices.length) out.push({ ...resolvedOf(nominalCue), fallback: true });
        else {
          const wave = weighted(choices, roll);
          const mirror = wave.mirror && roll() < 0.5;
          const offset = wave.offsets[Math.floor(roll() * wave.offsets.length)];
          const entry = resolvedOf({ ...nominalCue, formations: varied(wave, mirror, offset) }, nominalCost);
          out.push((wave as DeckWave & { outside?: true }).outside ? { ...entry, outside: true } : entry);
        }
      }
    }
    if (!standIn(slot)) for (const p of formationsOf(slot)) introduced.add(p.formation);
  });
  return out;
}

/** A template's concrete cues for a seed (and salt), fresh each call. */
export const resolveTemplate = (template: DeckTemplate, seed: number, salt = 0): EncounterCue[] => resolveDeck(template, seed, salt).map(entry => entry.cue);

/** The arc as authored before the deck: fixed cues and every pool slot's nominal wave; side slots left out. */
export function nominalPlaylist(template: DeckTemplate): EncounterCue[] {
  return template.slots.flatMap(slot => slot.kind === 'fixed' ? [slot.cue]
    : slot.kind === 'pool' ? [{ at: slot.at, id: slot.id, phase: slot.phase, formations: slot.nominal, ...(slot.pickup ? { pickup: slot.pickup } : {}) }] : []);
}

/**
 * Enemy kinds the authored arcs (fixed cues and nominal waves) fly on a world, at any rank: the roster pool waves and site
 * guards must stay within (roster faithfulness, tested).
 */
export function authoredKinds(planet: PlanetId): Set<EnemyKind> {
  return new Set(DECK_TEMPLATES.filter(deck => deck.world === planet).flatMap(deck => nominalPlaylist(deck)).flatMap(cue => cueRoster(cue, 'veteran')));
}

const resolved = new Map<string, readonly EncounterCue[]>();
/**
 * The concrete cue list a run flies: its mission's arc (endless: the sector's stage) resolved with the run's seed
 * (endless: and the sector). Pure and deterministic: the same inputs always give the identical list. Memoized outside
 * the run state (a small bounded cache), so the director can ask every tick.
 */
export function resolvePlaylist(config: Pick<RunConfig, 'mode' | 'mission'>, sector: number, seed: number): readonly EncounterCue[] {
  const deck = deckTemplate(config, sector), salt = config.mode === 'endless' ? sector : 0;
  const key = `${deck.id}|${seed >>> 0}|${salt}`;
  let cues = resolved.get(key);
  if (!cues) {
    if (resolved.size >= 32) resolved.clear();
    cues = Object.freeze(resolveTemplate(deck, seed >>> 0, salt));
    resolved.set(key, cues);
  }
  return cues;
}
