import { BALANCE, ENEMIES, FAIRNESS, difficultyScales } from '../content/balance';
import { VIEW, type Enemy, type RunState } from '../shared/contracts';
import { BOSS_BEAM, LANCER_BEAM, bossShots, enemyShots, type ShotSpec } from './attacks';
import { clamp, approach } from './geometry';
import { positionAfter } from './motion';

/**
 * Hazard union at the player's fixed row (docs/03 §7). A footprint is the physical lateral extent of one
 * hazard where it crosses the row, and the absolute time interval in which it can touch a player there.
 * Gaps are measured between physical edges; the player collider and comfort margins are part of the
 * 1.4-unit requirement, not added on top of it.
 */
export interface Footprint { x0: number; x1: number; t0: number; t1: number }

const R = VIEW.playerRadius;
const WORLD_LIMIT = VIEW.worldWidth / 2 - R;

export function shotFootprint(start: number, shot: ShotSpec, ttl = Infinity): Footprint | null {
  if (shot.vs >= -1e-6) return null;
  const reach = R + shot.radius;
  const speed = Math.hypot(shot.vx, shot.vs);
  const crossing = shot.s / -shot.vs;
  const window = reach / -shot.vs + 1 / 60;
  if (crossing + window < 0 || crossing - window > ttl) return null;
  const x = shot.x + shot.vx * crossing;
  // Every player center within reach * speed / |vs| of the crossing is hit; subtract R for the physical edge.
  const half = reach * speed / -shot.vs - R;
  return { x0: x - half, x1: x + half, t0: start + Math.max(0, crossing - window), t1: start + crossing + window };
}

function shotSpeedScale(state: RunState): number {
  return difficultyScales(state.config.mode, state.config.difficulty ?? 'standard', state.sector).shotSpeed;
}

/** Footprints of the attack an enemy will release after `warning` seconds, aimed at `aimX`. */
export function pendingAttackFootprints(state: RunState, enemy: Enemy, aimX: number, warning: number): Footprint[] {
  const release = state.time + warning;
  if (enemy.bossPart) {
    const attack = state.boss?.attack;
    if (!attack) return [];
    if (attack === 'beam') {
      const t0 = release + BOSS_BEAM.warning;
      return [{ x0: aimX - BOSS_BEAM.width / 2, x1: aimX + BOSS_BEAM.width / 2, t0, t1: t0 + BOSS_BEAM.active }];
    }
    const scale = difficultyScales('campaign', state.config.difficulty ?? 'standard', 1).shotSpeed;
    return bossShots(attack, enemy.x, enemy.s, aimX, scale)
      .map(shot => shotFootprint(release, shot)).filter((f): f is Footprint => f !== null);
  }
  if (enemy.kind === 'lancer') {
    const t0 = release + LANCER_BEAM.warning;
    return [{ x0: aimX - LANCER_BEAM.width / 2, x1: aimX + LANCER_BEAM.width / 2, t0, t1: t0 + LANCER_BEAM.active }];
  }
  const at = positionAfter(enemy, warning);
  const speed = ENEMIES[enemy.kind].shotSpeed * shotSpeedScale(state);
  return enemyShots(enemy.kind, at.x, at.s, aimX, speed)
    .map(shot => shotFootprint(release, shot)).filter((f): f is Footprint => f !== null);
}

/** Airframes that will cross the player row inside the horizon are contact hazards. */
function contactFootprints(state: RunState, enemy: Enemy, horizon: number, out: Footprint[]): void {
  if (enemy.hp <= 0 || enemy.kind === 'turret' || enemy.bossPart) return;
  const reach = R + enemy.radius + 0.05;
  const step = FAIRNESS.slice;
  let open: Footprint | null = null;
  for (let t = 0; t <= horizon + 1e-9; t += step) {
    const p = t === 0 ? { x: enemy.x, s: enemy.s } : positionAfter(enemy, t);
    if (Math.abs(p.s) <= reach) {
      if (!open) { open = { x0: p.x - enemy.radius, x1: p.x + enemy.radius, t0: state.time + t - step, t1: state.time + t + step }; out.push(open); }
      else { open.x0 = Math.min(open.x0, p.x - enemy.radius); open.x1 = Math.max(open.x1, p.x + enemy.radius); open.t1 = state.time + t + step; }
    } else open = null;
  }
}

/** Every hazard already committed: shots in flight, marked beams, windups in progress and airframe paths. */
export function committedFootprints(state: RunState, horizon: number = FAIRNESS.horizon): Footprint[] {
  const out: Footprint[] = [];
  for (const shot of state.projectiles) {
    if (shot.friendly || shot.ttl <= 0) continue;
    const footprint = shotFootprint(state.time, shot, shot.ttl);
    if (footprint && footprint.t0 <= state.time + horizon) out.push(footprint);
  }
  for (const hazard of state.hazards) {
    if (hazard.active <= 0) continue;
    const t0 = state.time + hazard.warning;
    out.push({ x0: hazard.x - hazard.width / 2, x1: hazard.x + hazard.width / 2, t0, t1: t0 + hazard.active });
  }
  for (const enemy of state.enemies) {
    if (enemy.hp > 0 && enemy.warning > 0) out.push(...pendingAttackFootprints(state, enemy, enemy.aimX, enemy.warning));
    contactFootprints(state, enemy, horizon, out);
  }
  return out;
}

export interface SafetyReport {
  /** Smallest (over time slices) of the largest physical clear gap inside the view. */
  minGap: number;
  /** Both view-edge strips and the center strip blocked inside one simultaneity window. */
  sealed: boolean;
  /** A conservative player model can stay clear of every footprint from its current state. */
  reachable: boolean;
}

interface Interval { a: number; b: number }

function subtract(base: Interval, cuts: Interval[]): Interval[] {
  cuts.sort((p, q) => p.a - q.a);
  const out: Interval[] = [];
  let cursor = base.a;
  for (const cut of cuts) {
    if (cut.b <= cursor) continue;
    if (cut.a >= base.b) break;
    if (cut.a > cursor) out.push({ a: cursor, b: cut.a });
    cursor = Math.max(cursor, cut.b);
  }
  if (cursor < base.b) out.push({ a: cursor, b: base.b });
  return out;
}

/** Largest physical gap between footprints (and view edges) within [left, right]. */
export function largestGap(footprints: readonly Footprint[], left: number, right: number): number {
  const free = subtract({ a: left, b: right }, footprints.map(f => ({ a: f.x0, b: f.x1 })));
  return free.reduce((best, interval) => Math.max(best, interval.b - interval.a), 0);
}

export function sealsEdgesAndCenter(footprints: readonly Footprint[], left: number, right: number): boolean {
  const center = (left + right) / 2;
  const strip = FAIRNESS.sealStrip;
  const touches = (a: number, b: number) => footprints.some(f => f.x1 > a && f.x0 < b);
  return touches(left, left + strip) && touches(right - strip, right) && touches(center - strip / 2, center + strip / 2);
}

export function viewBounds(state: RunState): { left: number; right: number } {
  return { left: state.cameraX - VIEW.width / 2, right: state.cameraX + VIEW.width / 2 };
}

/**
 * Content-level checks (gap and seal) over simultaneity windows, plus a conservative reachability sweep:
 * after the reaction delay and a maneuver delay the player expands its reachable interval set at a reduced
 * lateral speed and must always keep a non-empty set of positions clear of every footprint plus margins.
 */
export function assessSafety(state: RunState, footprints: readonly Footprint[]): SafetyReport {
  const { left, right } = viewBounds(state);
  const now = state.time;
  const { slice, horizon, window, comfortMargin, reaction, maneuverDelay, effectiveSpeed } = FAIRNESS;
  const lo = Math.max(-WORLD_LIMIT, left + R);
  const hi = Math.min(WORLD_LIMIT, right - R);
  const start = now + reaction + maneuverDelay;
  let reach: Interval[] = [];
  const p0 = clamp(state.player.x + state.player.vx * reaction, lo, hi);
  let minGap = right - left;
  let sealed = false;
  let reachable = true;
  let started = false;
  for (let t = now; t <= now + horizon + 1e-9; t += slice) {
    const simultaneous = footprints.filter(f => f.t0 <= t + window / 2 && f.t1 >= t - window / 2);
    if (simultaneous.length > 0) {
      minGap = Math.min(minGap, largestGap(simultaneous, left, right));
      sealed ||= sealsEdgesAndCenter(simultaneous, left, right);
    }
    if (!reachable || t < start) continue;
    const cuts = footprints.filter(f => f.t0 <= t + slice / 2 && f.t1 >= t - slice / 2)
      .map(f => ({ a: f.x0 - R - comfortMargin, b: f.x1 + R + comfortMargin }));
    // The sweep starts from a small interval around the predicted position (a zero-width interval would be
    // discarded by subtraction), then grows at the conservative lateral speed every slice.
    const grown = started
      ? reach.map(i => ({ a: Math.max(lo, i.a - effectiveSpeed * slice), b: Math.min(hi, i.b + effectiveSpeed * slice) }))
      : [{ a: Math.max(lo, p0 - 0.02), b: Math.min(hi, p0 + 0.02) }];
    started = true;
    const next: Interval[] = [];
    for (const interval of grown) {
      for (const free of subtract({ ...interval }, cuts.map(c => ({ ...c })))) {
        const last = next[next.length - 1];
        if (last && free.a <= last.b) last.b = Math.max(last.b, free.b); else next.push(free);
      }
    }
    // Merge overlaps introduced by growth.
    next.sort((p, q) => p.a - q.a);
    reach = [];
    for (const interval of next) {
      const last = reach[reach.length - 1];
      if (last && interval.a <= last.b) last.b = Math.max(last.b, interval.b); else reach.push({ ...interval });
    }
    if (reach.length === 0) reachable = false;
  }
  return { minGap, sealed, reachable };
}

export function isSafe(report: SafetyReport): boolean {
  return report.reachable && !report.sealed && report.minGap >= FAIRNESS.minGap - 1e-9;
}

const cache = new WeakMap<RunState, { tick: number; footprints: Footprint[]; baseline?: SafetyReport }>();

function cached(state: RunState) {
  let entry = cache.get(state);
  if (!entry || entry.tick !== state.tick) {
    entry = { tick: state.tick, footprints: committedFootprints(state) };
    cache.set(state, entry);
  }
  return entry;
}

/**
 * Director exclusion check for a new windup. The pattern is admitted only if the union of everything already
 * committed plus this attack keeps a 1.4-unit gap, never seals both edges and the center, and leaves the
 * player a reachable surviving path. If the player is already committed to an unavoidable hit, only the
 * content-level gap and seal rules apply, so the director neither stalls forever nor eases off secretly.
 */
export function admitAttack(state: RunState, enemy: Enemy, aimX: number, warning: number): boolean {
  const entry = cached(state);
  const extra = pendingAttackFootprints(state, enemy, aimX, warning);
  const combined = entry.footprints.concat(extra);
  const report = assessSafety(state, combined);
  let admitted = isSafe(report);
  if (!admitted && !report.reachable && !report.sealed && report.minGap >= FAIRNESS.minGap) {
    entry.baseline ??= assessSafety(state, entry.footprints);
    admitted = !entry.baseline.reachable;
  }
  if (admitted) {
    entry.footprints = combined;
    entry.baseline = undefined;
  }
  return admitted;
}

/* ------------------------------------------------------------------------------------------------------ */
/* Safe-gap solver: exact player kinematics against a footprint set. Used by the validation pilot.          */
/* ------------------------------------------------------------------------------------------------------ */

export interface EvasionPlan { input: -1 | 0 | 1; target: number; clearFor: number }

/** One fixed step of the simulation's own lateral kinematics. */
export function stepLateral(x: number, vx: number, horizontal: -1 | 0 | 1, dt: number): { x: number; vx: number } {
  const movement = BALANCE.movement;
  let v = approach(vx, horizontal * movement.speed, (horizontal === 0 ? movement.braking : movement.acceleration) * dt);
  const next = clamp(x + v * dt, -WORLD_LIMIT, WORLD_LIMIT);
  if (Math.abs(next) >= WORLD_LIMIT && Math.sign(v) === Math.sign(next)) v = 0;
  return { x: next, vx: v };
}

/** Move-to-and-hold controller: releases early enough to brake to a stop on the target. */
export function steerTo(x: number, vx: number, target: number): -1 | 0 | 1 {
  const dx = target - x;
  const stopping = vx * vx / (2 * BALANCE.movement.braking);
  if (Math.abs(dx) < 0.06) return 0;
  if (Math.sign(vx) === Math.sign(dx) && Math.abs(dx) <= stopping + 0.04) return 0;
  return dx < 0 ? -1 : 1;
}

/**
 * Chooses a move-and-hold target that stays clear of every footprint (plus `margin` beyond the collider and
 * a small time margin) for as long as possible, preferring `preferX` (usually the target to align with)
 * among safe choices. Candidates sit on a world-aligned grid; `previous` keeps a plan stable across replans.
 */
export function planEvasion(state: RunState, footprints: readonly Footprint[], preferX: number, previous: number | null = null, margin = 0.08, horizon = 3.2): EvasionPlan {
  const now = state.time;
  const dt = 1 / 60;
  const steps = Math.round(horizon / dt);
  const lead = 0.1;
  // Danger for the player's center: physical extent plus collider and margin, padded slightly in time.
  const danger = footprints.map(f => ({ a: f.x0 - R - margin, b: f.x1 + R + margin, from: f.t0 - lead - now, to: f.t1 + lead / 2 - now }));
  // Bucket footprints per simulation step for fast lookup while moving.
  const buckets: Interval[][] = Array.from({ length: steps + 1 }, () => []);
  for (const d of danger) {
    const from = Math.max(0, Math.floor(d.from / dt));
    const to = Math.min(steps, Math.ceil(d.to / dt));
    for (let k = from; k <= to; k += 1) buckets[k].push(d);
  }
  const { left, right } = viewBounds(state);
  const spacing = 0.3;
  const lo = Math.ceil(Math.max(-WORLD_LIMIT, left - 1.5) / spacing) * spacing;
  const hi = Math.min(WORLD_LIMIT, right + 1.5);
  const candidates = [state.player.x];
  if (previous !== null) candidates.push(previous);
  for (let x = lo; x <= hi + 1e-9; x += spacing) candidates.push(x);
  let best: { target: number; clear: number; cost: number } | null = null;
  const commit = 1.6;
  for (const target of candidates) {
    let x = state.player.x;
    let vx = state.player.vx;
    let clear = horizon;
    for (let k = 1; k <= steps; k += 1) {
      const input = steerTo(x, vx, target);
      const next = stepLateral(x, vx, input, dt);
      x = next.x; vx = next.vx;
      if (buckets[k].some(i => x > i.a && x < i.b)) { clear = k * dt; break; }
      if (vx === 0 && steerTo(x, vx, target) === 0) {
        // Settled: the ship now holds x, so the first later danger covering x ends the clear interval.
        const t = k * dt;
        for (const d of danger) if (x > d.a && x < d.b && d.to >= t) clear = Math.min(clear, Math.max(t, d.from));
        break;
      }
    }
    const cost = Math.abs(target - preferX) + 0.15 * Math.abs(target - state.player.x)
      + 0.1 * Math.max(0, Math.abs(target - state.cameraX) - 3) + (horizon - clear) * 3
      - (previous !== null && target === previous ? 0.3 : 0);
    const better = !best
      || (Math.min(clear, commit) > Math.min(best.clear, commit) + 1e-9)
      || (Math.min(clear, commit) >= Math.min(best.clear, commit) - 1e-9 && cost < best.cost);
    if (better) best = { target, clear, cost };
  }
  return { input: steerTo(state.player.x, state.player.vx, best!.target), target: best!.target, clearFor: best!.clear };
}
