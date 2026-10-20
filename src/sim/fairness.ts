import { BEAM_KINDS, ENEMIES, FAIRNESS, GROUND_KINDS, WORLD_INTENSITY, difficultyScales, kinematics, PULSAR_BURST, type Kinematics } from '../content/balance';
import { REACTORS } from '../content/equipment';

/** Top lateral speed of the slowest campaign drive (Precision): campaign attack admission assumes it. */
const SLOWEST_DRIVE = Math.min(...Object.values(REACTORS).map(reactor => reactor.speed));
/** The ship's actual handling: the equipped reactor in the campaign (pace 1), the Balanced Drive at the pace in endless. */
export function playerKinematics(state: Pick<RunState, 'pace' | 'config'>): Kinematics {
  const base = kinematics(state.pace), reactor = REACTORS[state.config.reactor ?? 'balanced'];
  return state.config.mode === 'campaign' ? { ...base, speed: reactor.speed, acceleration: reactor.acceleration, braking: reactor.braking } : base;
}
import { BOSSES } from '../content/bosses';
import { VIEW, type Enemy, type RunState } from '../shared/contracts';
import { aimAtPlayer, beamSpec, bossShots, diamondSide, enemyShots, pulsarBurst, type BulletKind, type ShotSpec } from './attacks';
import { clamp, approach } from './geometry';
import { bossPartOffset, bossPose, enemyClockRate, positionAfter } from './motion';
import { bossShotScale } from './spawn';

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
  return difficultyScales(state.config.mode, state.config.difficulty ?? 'standard', state.sector).shotSpeed * kinematics(state.pace).shot * WORLD_INTENSITY[state.planet].shot;
}

/** Footprints of the attack an enemy will release after `warning` seconds, aimed at `aimX`. */
export function pendingAttackFootprints(state: RunState, enemy: Enemy, aimX: number, warning: number): Footprint[] {
  const release = state.time + warning;
  if (enemy.bossPart) {
    const attack = state.boss?.attack;
    // Overload lanes already exist as marked hazards from the start of their windup.
    if (!attack || attack === 'beam') return [];
    const scale = bossShotScale(state);
    // The hull keeps maneuvering through the windup: predict from its pose at release.
    // A spiral holds the hull still from the start of its windup, so it leaves from where the boss is now.
    const pose = state.boss!.phase === 'destroyed' || attack === 'spiral' ? { x: state.boss!.x, s: state.boss!.s } : bossPose(state.boss!, release);
    const offset = bossPartOffset(enemy.bossPart, state.boss!.id);
    return bossShots(BOSSES[state.boss!.id], attack, pose.x + offset.x, pose.s + offset.s, aimX, scale, enemy.bossPart === 'core')
      .map(shot => shotFootprint(release + (shot.delay ?? 0), shot)).filter((f): f is Footprint => f !== null);
  }
  if (enemy.kind === 'pulsar') {
    // Its stream will chase the ship: predicted down the line to where the ship is now (re-predicted every step).
    const at = positionAfter(enemy, warning, enemyClockRate(state, enemy));
    return pulsarBurst(at.x, at.s, state.player.x, ENEMIES.pulsar.shotSpeed * shotSpeedScale(state), PULSAR_BURST.shots, PULSAR_BURST.interval)
      .map(shot => shotFootprint(release + shot.delay, shot)).filter((f): f is Footprint => f !== null);
  }
  if (BEAM_KINDS.has(enemy.kind)) {
    const beam = beamSpec(enemy.kind);
    const t0 = release + beam.warning;
    return [{ x0: aimX - beam.width / 2, x1: aimX + beam.width / 2, t0, t1: t0 + beam.active }];
  }
  const at = positionAfter(enemy, warning, enemyClockRate(state, enemy));
  const speed = ENEMIES[enemy.kind].shotSpeed * shotSpeedScale(state);
  const side = enemy.kind === 'diamond' ? diamondSide(enemy) : 0;
  return enemyShots(enemy.kind as BulletKind, at.x, at.s, aimX, speed, side)
    .map(shot => shotFootprint(release, shot)).filter((f): f is Footprint => f !== null);
}

/** Airframes that will cross the player row inside the horizon are contact hazards. */
function contactFootprints(state: RunState, enemy: Enemy, horizon: number, out: Footprint[]): void {
  if (enemy.hp <= 0 || GROUND_KINDS.has(enemy.kind) || enemy.bossPart) return;
  const reach = R + enemy.radius + 0.05;
  const step = FAIRNESS.slice;
  let open: Footprint | null = null;
  const rate = enemyClockRate(state, enemy);
  for (let t = 0; t <= horizon + 1e-9; t += step) {
    const p = t === 0 ? { x: enemy.x, s: enemy.s } : positionAfter(enemy, t, rate);
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
    // A tracking shot still at its muzzle will leave toward wherever the ship is then: predict it toward the ship now.
    const path = shot.track && (shot.delay ?? 0) > 0 ? { ...shot } : shot;
    if (path !== shot) aimAtPlayer(path, state.player.x);
    const footprint = shotFootprint(state.time + (shot.delay ?? 0), path, shot.ttl);
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
  const { slice, horizon, window, comfortMargin, reaction, maneuverDelay } = FAIRNESS;
  // Campaign content must stay escapable with the slowest drive (docs/02 §4), whichever reactor is equipped.
  const effectiveSpeed = FAIRNESS.effectiveSpeedRatio * (state.config.mode === 'campaign' ? SLOWEST_DRIVE : kinematics(state.pace).speed);
  const lo = Math.max(-WORLD_LIMIT, left + R);
  const hi = Math.min(WORLD_LIMIT, right - R);
  const start = now + reaction + maneuverDelay;
  let reach: Interval[] = [];
  const p0 = clamp(state.player.x + state.player.vx * reaction, lo, hi);
  let minGap = right - left;
  let sealed = false;
  let reachable = true;
  let started = false;
  // Long patterns (a boss spiral's later streams) are judged to their end, not just over the usual horizon.
  const until = Math.max(now + horizon, ...footprints.map(f => f.t1));
  for (let t = now; t <= until + 1e-9; t += slice) {
    const simultaneous = footprints.filter(f => f.t0 <= t + window / 2 && f.t1 >= t - window / 2);
    if (simultaneous.length > 0) {
      minGap = Math.min(minGap, largestGap(simultaneous, left, right));
      sealed ||= sealsEdgesAndCenter(simultaneous, left, right);
    }
    if (!reachable || t < start) continue;
    // Hazards are padded in time like the validation pilot pads them (0.1 s before, 0.05 s after), so the
    // director never admits a pattern that only a zero-margin pilot could thread.
    const cuts = footprints.filter(f => f.t0 - 0.1 <= t + slice / 2 && f.t1 + 0.05 >= t - slice / 2)
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
  return admitFootprints(state, pendingAttackFootprints(state, enemy, aimX, warning));
}

/** The same exclusion check for an arbitrary new set of footprints (Bastion-9 bursts, fans and lanes). */
export function admitFootprints(state: RunState, extra: readonly Footprint[]): boolean {
  const entry = cached(state);
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

/**
 * `target` is a move-and-hold destination for the stopping controller. When `direct` is set, the plan came
 * from the exact search and `input` should be applied as-is until the next replan.
 */
export interface EvasionPlan { input: -1 | 0 | 1; target: number; clearFor: number; direct?: boolean }

/** One fixed step of the simulation's own lateral kinematics at the given pace. */
export function stepLateral(x: number, vx: number, horizontal: -1 | 0 | 1, dt: number, movement: Kinematics = kinematics(1)): { x: number; vx: number } {
  let v = approach(vx, horizontal * movement.speed, (horizontal === 0 ? movement.braking : movement.acceleration) * dt);
  const next = clamp(x + v * dt, -WORLD_LIMIT, WORLD_LIMIT);
  if (Math.abs(next) >= WORLD_LIMIT && Math.sign(v) === Math.sign(next)) v = 0;
  return { x: next, vx: v };
}

/** Move-to-and-hold controller: releases early enough to brake to a stop on the target. */
export function steerTo(x: number, vx: number, target: number, braking = kinematics(1).braking): -1 | 0 | 1 {
  const dx = target - x;
  const stopping = vx * vx / (2 * braking);
  if (Math.abs(dx) < 0.06) return 0;
  if (Math.sign(vx) === Math.sign(dx) && Math.abs(dx) <= stopping + 0.04) return 0;
  return dx < 0 ? -1 : 1;
}

/**
 * Chooses a move-and-hold target that stays clear of every footprint (plus `margin` beyond the collider and
 * a small time margin) for as long as possible, preferring `preferX` (usually the target to align with)
 * among safe choices and keeping away from the world edges. Candidates sit on a world-aligned grid;
 * `previous` keeps a plan stable across replans. If no single target stays clear, two-leg plans (move to A,
 * then at a switch time to B) are searched as well.
 */
export function planEvasion(state: RunState, footprints: readonly Footprint[], preferX: number, previous: number | null = null, margin = FAIRNESS.comfortMargin, horizon = 3.2): EvasionPlan {
  const now = state.time;
  const dt = 1 / 60;
  const steps = Math.round(horizon / dt);
  const lead = 0.1;
  const movement = playerKinematics(state);
  // Danger for the player's center: physical extent plus collider and margin, padded slightly in time.
  const danger = footprints.map(f => ({ a: f.x0 - R - margin, b: f.x1 + R + margin, from: f.t0 - lead - now, to: f.t1 + lead / 2 - now }));
  // Bucket footprints per simulation step for fast lookup while moving.
  const buckets: Interval[][] = Array.from({ length: steps + 1 }, () => []);
  for (const d of danger) {
    const from = Math.max(0, Math.floor(d.from / dt));
    const to = Math.min(steps, Math.ceil(d.to / dt));
    for (let k = from; k <= to; k += 1) buckets[k].push(d);
  }
  /** Seconds until the first collision of a plan (horizon if none). Legs switch target at `switchAt`. */
  const clearTime = (first: number, switchAt: number, second: number): number => {
    let x = state.player.x;
    let vx = state.player.vx;
    for (let k = 1; k <= steps; k += 1) {
      const target = k * dt < switchAt ? first : second;
      const next = stepLateral(x, vx, steerTo(x, vx, target, movement.braking), dt, movement);
      x = next.x; vx = next.vx;
      if (buckets[k].some(i => x > i.a && x < i.b)) return k * dt;
      if (k * dt >= switchAt && vx === 0 && steerTo(x, vx, second, movement.braking) === 0) {
        // Settled: the ship now holds x, so the first later danger covering x ends the clear interval.
        const t = k * dt;
        let clear = horizon;
        for (const d of danger) if (x > d.a && x < d.b && d.to >= t) clear = Math.min(clear, Math.max(t, d.from));
        return clear;
      }
    }
    return horizon;
  };
  // Corners against a world edge leave only one way out: plans that end there are strongly discouraged.
  const edge = WORLD_LIMIT - 3;
  const cost = (target: number, clear: number) => Math.abs(target - preferX) + 0.15 * Math.abs(target - state.player.x)
    + 0.1 * Math.max(0, Math.abs(target - state.cameraX) - 3) + 2.5 * Math.max(0, Math.abs(target) - edge)
    + (horizon - clear) * 3 - (previous !== null && target === previous ? 0.3 : 0);
  const { left, right } = viewBounds(state);
  const grid = (spacing: number) => {
    const lo = Math.ceil(Math.max(-WORLD_LIMIT, left - 1.5) / spacing) * spacing;
    const hi = Math.min(WORLD_LIMIT, right + 1.5);
    const out: number[] = [];
    for (let x = lo; x <= hi + 1e-9; x += spacing) out.push(x);
    return out;
  };
  const candidates = [state.player.x, ...(previous !== null ? [previous] : []), ...grid(0.3)];
  let best: { target: number; clear: number; cost: number } | null = null;
  const commit = 2.4;
  const consider = (target: number, clear: number, value: number) => {
    const better = !best
      || (Math.min(clear, commit) > Math.min(best.clear, commit) + 1e-9)
      || (Math.min(clear, commit) >= Math.min(best.clear, commit) - 1e-9 && value < best.cost);
    if (better) best = { target, clear, cost: value };
  };
  for (const target of candidates) {
    const clear = clearTime(target, 0, target);
    consider(target, clear, cost(target, clear));
  }
  if (best!.clear < commit) {
    const coarse = grid(0.6);
    for (const first of coarse) for (const switchAt of [0.25, 0.5, 0.8, 1.2]) for (const second of coarse) {
      if (first === second) continue;
      const clear = clearTime(first, switchAt, second);
      if (clear > best!.clear + 1e-9) consider(first, clear, cost(second, clear));
    }
  }
  if (best!.clear < commit) {
    // Exact fallback: a time-expanded search over the ship's real kinematics. Every 3 ticks the ship may
    // steer left, hold or steer right; states are merged on a coarse position/velocity grid.
    const found = searchInputs(state, buckets, movement, steps, dt, preferX, edge);
    if (found && found.clear > best!.clear + 1e-9) {
      return { input: found.input, target: state.player.x, clearFor: found.clear, direct: true };
    }
  }
  return { input: steerTo(state.player.x, state.player.vx, best!.target, movement.braking), target: best!.target, clearFor: best!.clear };
}

interface SearchNode { x: number; vx: number; first: -1 | 0 | 1 }

function searchInputs(state: RunState, buckets: Interval[][], movement: Kinematics, steps: number, dt: number,
  preferX: number, edge: number): { input: -1 | 0 | 1; clear: number } | null {
  const ticks = 3;
  const layers = Math.floor(steps / ticks);
  let frontier: SearchNode[] = [{ x: state.player.x, vx: state.player.vx, first: 0 }];
  let survivors: SearchNode[] = [];
  let depth = 0;
  const key = (x: number, vx: number) => `${Math.round(x / 0.12)}:${Math.round(vx / (movement.speed / 6))}`;
  for (let layer = 0; layer < layers; layer += 1) {
    const next = new Map<string, SearchNode>();
    for (const node of frontier) {
      for (const input of [-1, 0, 1] as const) {
        let x = node.x;
        let vx = node.vx;
        let alive = true;
        for (let t = 1; t <= ticks; t += 1) {
          const k = layer * ticks + t;
          const moved = stepLateral(x, vx, input, dt, movement);
          x = moved.x; vx = moved.vx;
          if (buckets[k].some(i => x > i.a && x < i.b)) { alive = false; break; }
        }
        if (!alive) continue;
        const id = key(x, vx);
        if (!next.has(id)) next.set(id, { x, vx, first: layer === 0 ? input : node.first });
      }
    }
    if (next.size === 0) break;
    frontier = [...next.values()];
    survivors = frontier;
    depth = layer + 1;
  }
  if (survivors.length === 0) return null;
  const score = (node: SearchNode) => Math.abs(node.x - preferX) + 2.5 * Math.max(0, Math.abs(node.x) - edge) + Math.abs(node.vx) * 0.05;
  const chosen = survivors.reduce((a, b) => (score(b) < score(a) ? b : a));
  return { input: chosen.first, clear: depth * ticks * dt };
}
