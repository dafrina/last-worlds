import { BALANCE, kinematics } from '../../src/content/balance';
import { endlessPlanet, endlessSectorPlan, paceInSector } from '../../src/content/endless';
import { EMPTY_INPUT, VIEW, type InputFrame, type RunState } from '../../src/shared/contracts';
import { committedFootprints, planEvasion } from '../../src/sim/fairness';
import { stepRun } from '../../src/sim/game';

/** A deterministic scripted pilot. Pilots never press the special. */
export type Pilot = (state: RunState) => InputFrame;

const REACTION_TICKS = 12; // 0.2 s at 60 Hz

export function idlePilot(): Pilot {
  return () => EMPTY_INPUT;
}

/**
 * Moves away from the nearest incoming hostile bullet it perceived 0.2 s ago; otherwise holds still.
 * It ignores beams, airframes and every other bullet, which is what makes it simple.
 */
export function dodgerPilot(): Pilot {
  const history: { x: number; s: number; vx: number; vs: number }[][] = [];
  return state => {
    history.push(state.projectiles.filter(shot => !shot.friendly).map(({ x, s, vx, vs }) => ({ x, s, vx, vs })));
    if (history.length > REACTION_TICKS + 1) history.shift();
    const seen = history[0];
    const px = state.player.x;
    let nearest: { crossing: number; distance: number } | null = null;
    for (const shot of seen) {
      if (shot.vs >= 0 || shot.s < -0.4) continue;
      const time = shot.s / -shot.vs;
      if (time > 1.4) continue;
      const crossing = shot.x + shot.vx * time;
      const distance = Math.hypot(shot.x - px, shot.s);
      if (Math.abs(crossing - px) < 1.1 && (!nearest || distance < nearest.distance)) nearest = { crossing, distance };
    }
    if (!nearest) return EMPTY_INPUT;
    let direction: -1 | 1 = px >= nearest.crossing ? 1 : -1;
    const limit = VIEW.worldWidth / 2 - 1;
    if (Math.abs(px) > limit && Math.sign(px) === direction) direction = direction === 1 ? -1 : 1;
    return { ...EMPTY_INPUT, horizontal: direction };
  };
}

/**
 * Tuning aid between the dodger and the perfect pilot: when its perceived nearest bullet is not a threat it
 * steers under the nearest target so automatic fire works, otherwise it dodges like the simple dodger.
 */
export function hunterPilot(): Pilot {
  const dodge = dodgerPilot();
  const history: number[] = [];
  return state => {
    const evade = dodge(state);
    history.push(preferredX(state));
    if (history.length > REACTION_TICKS + 1) history.shift();
    if (evade.horizontal !== 0) return evade;
    const dx = history[0] - state.player.x;
    const stopping = state.player.vx * state.player.vx / (2 * kinematics(state.pace).braking);
    const hold = Math.abs(dx) < 0.15 || (Math.sign(state.player.vx) === Math.sign(dx) && Math.abs(dx) <= stopping + 0.05);
    return { ...EMPTY_INPUT, horizontal: hold ? 0 : dx < 0 ? -1 : 1 };
  };
}

/**
 * Reporting aid for beam-heavy content: the hunter that also steps out of any lane it saw marked 0.2 s ago
 * (marked hazards and beam windups), moving to the nearer side. Otherwise it behaves exactly like the hunter.
 */
export function beamAwareHunterPilot(): Pilot {
  const hunt = hunterPilot();
  const history: { x: number; half: number }[][] = [];
  return state => {
    const lanes = state.hazards.map(hazard => ({ x: hazard.x, half: hazard.width / 2 }))
      .concat(state.enemies.filter(enemy => enemy.warning > 0 && (enemy.kind === 'lancer' || enemy.kind === 'needle'))
        .map(enemy => ({ x: enemy.aimX, half: enemy.kind === 'needle' ? 0.2 : 0.4 })));
    history.push(lanes);
    if (history.length > REACTION_TICKS + 1) history.shift();
    const input = hunt(state);
    const inside = history[0].find(lane => Math.abs(state.player.x - lane.x) < lane.half + VIEW.playerRadius + 0.15);
    if (!inside) return input;
    return { ...EMPTY_INPUT, horizontal: state.player.x >= inside.x ? 1 : -1 };
  };
}

/** Target to align with: the nearest damageable enemy in view, so automatic fire can clear content. */
export function preferredX(state: RunState): number {
  let best: { x: number; score: number } | null = null;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || enemy.damageable === false || enemy.s < 1.5 || enemy.s > VIEW.maxS - 0.5) continue;
    if (Math.abs(enemy.x - state.cameraX) > VIEW.width / 2 - 0.3) continue;
    const score = enemy.s + 0.8 * Math.abs(enemy.x - state.player.x);
    if (!best || score < best.score) best = { x: enemy.x, score };
  }
  // Nothing to shoot in view during a boss fight: head back to the boss (the game shows RETURN LEFT/RIGHT).
  if (!best && state.boss && state.boss.phase !== 'destroyed') return state.boss.x;
  return best?.x ?? state.cameraX;
}

/**
 * Uses the safe-gap solver on what it perceived 0.2 s ago (committed shots, marked beams, warned windups and
 * airframe paths), with the simulation's exact acceleration, braking and top speed for its own motion.
 */
/** What the pilot perceives: every field the footprint model reads, copied so later ticks cannot alter it. */
function perceive(state: RunState): RunState {
  return {
    ...state,
    player: { ...state.player },
    enemies: state.enemies.map(enemy => ({ ...enemy })),
    projectiles: state.projectiles.filter(shot => !shot.friendly).map(shot => ({ ...shot })),
    hazards: state.hazards.map(hazard => ({ ...hazard })),
    pickups: [], effects: [], chargeKillTimes: [],
    boss: state.boss ? { ...state.boss } : null,
  };
}

export function perfectPilot(): Pilot {
  const history: RunState[] = [];
  let plan: InputFrame = EMPTY_INPUT;
  let target: number | null = null;
  let direct = false;
  return state => {
    history.push(perceive(state));
    if (history.length > REACTION_TICKS + 1) history.shift();
    if (state.tick % 3 === 0 || target === null) {
      const seen = history[0];
      const footprints = committedFootprints(seen, 3.4);
      const result = planEvasion(state, footprints, preferredX(seen), target);
      target = result.target;
      direct = result.direct === true;
      plan = { ...EMPTY_INPUT, horizontal: result.input };
    } else if (direct) {
      // An exact-search plan is applied as computed until the next replan.
    } else {
      // Between replans keep steering toward the chosen target with the same stopping controller.
      const dx = target - state.player.x;
      const stopping = state.player.vx * state.player.vx / (2 * kinematics(state.pace).braking);
      plan = { ...EMPTY_INPUT, horizontal: Math.abs(dx) < 0.06 || (Math.sign(state.player.vx) === Math.sign(dx) && Math.abs(dx) <= stopping + 0.04) ? 0 : dx < 0 ? -1 : 1 };
    }
    return plan;
  };
}

export interface FlightLog {
  phase: RunState['phase'];
  time: number;
  hits: number;
  livesLost: number;
  firstHitAt: number | null;
  firstLifeLostAt: number | null;
  lifeLostAt: number[];
  specialsUsed: number;
}

export interface FlightOptions {
  /** Delete every pickup each tick so a result cannot depend on recovery or equipment. */
  noPickups?: boolean;
  onTick?: (state: RunState) => void;
}

export function fly(state: RunState, pilot: Pilot, seconds: number, options: FlightOptions = {}): FlightLog {
  const log: FlightLog = { phase: state.phase, time: state.time, hits: 0, livesLost: 0, firstHitAt: null, firstLifeLostAt: null, lifeLostAt: [], specialsUsed: 0 };
  const end = state.time + seconds;
  while (state.phase === 'playing' && state.time < end - 1e-9) {
    const lastHit = state.player.lastHitAt;
    const lives = state.livesLost;
    stepRun(state, pilot(state));
    if (options.noPickups) state.pickups = [];
    if (state.player.lastHitAt !== lastHit) { log.hits += 1; log.firstHitAt ??= state.time; }
    if (state.livesLost !== lives) { log.lifeLostAt.push(state.time); log.firstLifeLostAt ??= state.time; }
    options.onTick?.(state);
  }
  log.phase = state.phase;
  log.time = state.time;
  log.livesLost = state.livesLost;
  log.specialsUsed = state.specialsUsed;
  return log;
}

/**
 * Places a fresh endless run at the start of a sector, as if the earlier sectors had been flown with no boss
 * overtime: the schedule's distance, planet and pace, an empty sky and the sector's playlist from its top.
 */
export function enterSector(state: RunState, sector: number): RunState {
  if (sector <= 1) return state;
  const at = (sector - 1) * BALANCE.sectorDuration;
  state.time = at;
  state.sectorStartedAt = at;
  state.sector = sector;
  state.planet = endlessPlanet(sector);
  state.distance = endlessSectorPlan(sector).startDistance;
  state.pace = paceInSector(sector, 0);
  state.encounterIndex = 0;
  state.nextEncounterAt = at + 2;
  return state;
}
