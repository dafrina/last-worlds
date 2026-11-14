import { BALANCE } from '../../src/content/balance';
import { createRun } from '../../src/sim/game';
import type { Difficulty, MissionId, RunState, WeaponId } from '../../src/shared/contracts';
import { beamAwareHunterPilot, enterSector, fly, perfectPilot, pickupSeeker, skilledPilot, type FlightLog, type Pilot } from './pilots';

/*
 * Balance measurement (docs/40, the user's "Perfect Pilot & progressive difficulty" spec, 13 November 2026): the
 * expected equipment per campaign mission, and the flights the completion tests and the extended report share.
 *
 * Three questions, kept apart:
 * - hazard fairness: can every attack be dodged? (fairness-*.test.ts, with a pacifist branch that kills nothing);
 * - campaign completion: can a skilled pilot finish each mission with the weapon tier expected there?
 * - endless progression: how far does a skilled pilot get from the starter, earning tiers from real pickups?
 */

/**
 * The weapon rank a player is expected to bring to each mission on Standard (rank 0 = Level 1 … rank 4 = Level 5), in
 * campaign order. Balancing expectations only: nothing in the game enforces them, and weaker weapons stay allowed.
 */
// (User, 13 November: "luna is lvl 1, khepri and vesper 2, nacre and amnion 3, corona 4 and nahara umbra 5"; players
// replay missions to afford them. Was Level 1, 1, 2, 2, 3, 3, 4, 4 per the spec.)
export const EXPECTED_RANK: Readonly<Record<MissionId, number>> = {
  training: 0, // Luna
  bastion: 1, // Khepri, Rolling Thunder
  'cold-vector': 1, // Vesper
  'deep-bloom': 2, // Nacre
  'brood-strike': 2, // Amnion
  'dying-star': 3, // Corona
  'silent-empire': 4, // Nahara
  'final-horizon': 4, // Umbra
};
export const CAMPAIGN_ORDER = Object.keys(EXPECTED_RANK) as MissionId[];
export const WEAPONS: readonly WeaponId[] = ['pulse', 'fan', 'seeker', 'rail'];
/** A mission's flight limit: every mission and its boss end well inside it at the expected tier, and Level 1 still ends
 *  against the late bosses' mission toughness (MISSION_PRESSURE.bossHp, up to ×2.75). */
export const MISSION_SECONDS = 1200;

/**
 * The pilots a flight can use: `perfect` (the exact safe-gap solver, 0.2 s late: it measures whether a mission can be done),
 * and `hunter` (the beam-aware hunter: dodges the nearest bullet and lanes it saw 0.2 s ago and aims at the nearest target,
 * without the solver: a proxy for a good human, whose hits and lives lost show where the pressure is).
 */
export type PilotId = 'perfect' | 'skilled' | 'hunter';
export const PILOTS: Record<PilotId, () => Pilot> = { perfect: () => perfectPilot(), skilled: () => skilledPilot(), hunter: beamAwareHunterPilot };

export interface MissionResult {
  kind: 'campaign'; pilot: PilotId; mission: MissionId; weapon: WeaponId; rank: number; level: number; difficulty: Difficulty; seed: number;
  expected: boolean; completed: boolean; time: number; livesLost: number; hits: number; shieldHits: number;
  kills: number; damage: number; shots: number; hazards: number; bossId: string | null;
  bossArrives: number | null; bossDown: number | null; bossFight: number | null; stages: Record<string, number>;
}

/**
 * One campaign mission flown by the perfect pilot with a weapon at a rank: no specials (pilots never press the special),
 * no pickups (the controlled baseline: nothing recovers shields, nothing changes the weapon).
 */
export function flyMission(mission: MissionId, weapon: WeaponId, rank: number, difficulty: Difficulty, seed: number, pilot: PilotId = 'perfect'): MissionResult {
  const state = createRun({ mode: 'campaign', mission, difficulty, weapon, rank, seed });
  const log = fly(state, PILOTS[pilot](), MISSION_SECONDS, { noPickups: true });
  const at = log.bossPhases, arrives = at.batteries ?? at.arrival ?? null, down = at.destroyed ?? null;
  // Each stage's length: from its first tick to the next stage's.
  const order = Object.entries(at).sort((a, b) => a[1] - b[1]), stages: Record<string, number> = {};
  order.forEach(([phase, t], i) => { const next = order[i + 1]?.[1] ?? log.time; stages[phase] = +(next - t).toFixed(2); });
  return { kind: 'campaign', pilot, mission, weapon, rank, level: rank + 1, difficulty, seed, expected: rank === EXPECTED_RANK[mission],
    completed: log.phase === 'complete', time: +log.time.toFixed(2), livesLost: log.livesLost, hits: log.hits, shieldHits: log.shieldHits,
    kills: log.kills, damage: Math.round(log.damage), shots: log.shots, hazards: log.hazards, bossId: log.bossId,
    bossArrives: arrives !== null ? +arrives.toFixed(2) : null, bossDown: down !== null ? +down.toFixed(2) : null,
    bossFight: arrives !== null && down !== null ? +(down - arrives).toFixed(2) : null, stages };
}

export interface EndlessCheckpoint { sector: number; reached: boolean; time: number | null; tier: number | null; livesLost: number | null; powerGains: number | null }
export interface EndlessResult {
  kind: 'endless'; seed: number; highestSector: number; finalTier: number; maxTier: number; powerGains: number; livesLost: number;
  bossesDefeated: string[]; tierFirstAt: (number | null)[]; checkpoints: EndlessCheckpoint[]; time: number; phase: RunState['phase'];
}
export const ENDLESS_CHECKPOINTS = [5, 10, 15, 20, 30] as const;

/**
 * A natural endless run (mode B): the standard starter at tier 1, real pickups collected when the pilot can reach them
 * safely, life losses costing tiers as in the game. Nothing is injected. It ends when the run is lost, at `lastSector`'s
 * start, or after `seconds`.
 */
export function flyEndlessNatural(seed: number, lastSector = 30, seconds = 30 * BALANCE.sectorDuration + 1200): EndlessResult {
  const state = createRun({ mode: 'endless', seed });
  const checkpoints = new Map<number, EndlessCheckpoint>();
  const bosses: string[] = [];
  let lastPhase: string | null = null, gains = 0, power = state.player.power, cells = 0;
  const log: FlightLog = fly(state, perfectPilot(pickupSeeker()), seconds, {
    onTick: s => {
      if (s.player.power > power || (s.player.power === power && (s.player.powerCells ?? 0) > cells)) gains += 1;
      power = s.player.power; cells = s.player.powerCells ?? 0;
      if (s.boss?.phase === 'destroyed' && lastPhase !== 'destroyed') bosses.push(s.boss.id);
      lastPhase = s.boss?.phase ?? null;
      for (const sector of ENDLESS_CHECKPOINTS) if (s.sector === sector && !checkpoints.has(sector)) {
        checkpoints.set(sector, { sector, reached: true, time: +s.time.toFixed(1), tier: s.player.power + 1, livesLost: s.livesLost, powerGains: gains });
      }
    },
    until: s => s.sector >= lastSector,
  });
  return { kind: 'endless', seed, highestSector: state.sector, finalTier: state.player.power + 1, maxTier: log.maxPower + 1, powerGains: log.powerGains,
    livesLost: log.livesLost, bossesDefeated: bosses, tierFirstAt: log.tierFirstAt.map(t => t === null ? null : +t.toFixed(1)),
    checkpoints: ENDLESS_CHECKPOINTS.map(sector => checkpoints.get(sector) ?? { sector, reached: false, time: null, tier: null, livesLost: null, powerGains: null }),
    time: +log.time.toFixed(1), phase: log.phase };
}

export interface IsolatedResult {
  kind: 'isolated'; artificial: true; sector: number; weapon: WeaponId; level: number; seed: number;
  survivedSeconds: number; livesLost: number; hits: number; kills: number; bossesDefeated: number; phase: RunState['phase'];
}

/**
 * An isolated late sector (mode C, artificial): a fresh endless run placed at a sector's start with the weapon and tier
 * set by the test, pickups removed. Not a natural run result; gameplay initialisation is untouched.
 */
export function flyEndlessIsolated(sector: number, weapon: WeaponId, level: number, seed: number, seconds = BALANCE.sectorDuration * 2): IsolatedResult {
  const state = enterSector(createRun({ mode: 'endless', seed }), sector);
  // (As the game's own setMainTier: a new tier drops the main weapon's firing sequence.)
  state.player.weapon = weapon; state.player.power = level - 1; state.player.powerCells = 0; state.mainSequence = undefined;
  let bosses = 0, lastPhase: string | null = null;
  const log = fly(state, perfectPilot(), seconds, { noPickups: true, onTick: s => {
    if (s.boss?.phase === 'destroyed' && lastPhase !== 'destroyed') bosses += 1;
    lastPhase = s.boss?.phase ?? null;
  } });
  return { kind: 'isolated', artificial: true, sector, weapon, level, seed, survivedSeconds: +(log.time - (sector - 1) * BALANCE.sectorDuration).toFixed(1),
    livesLost: log.livesLost, hits: log.hits, kills: log.kills, bossesDefeated: bosses, phase: log.phase };
}
