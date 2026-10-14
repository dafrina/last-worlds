import { FAIRNESS } from '../../src/content/balance';
import { STEP, VIEW, type RunState } from '../../src/shared/contracts';

/**
 * Independent fairness observer for the validator. It does not reuse the director's prediction code: it
 * watches what the simulation actually does (windup starts, releases, beams, row crossings and airframe
 * contact) and checks the documented floors and the gap/seal rules on the real union of hazards.
 */
export interface Violation { rule: 'gap' | 'seal' | 'warning' | 'beam-warning' | 'lock' | 'offscreen' | 'unwarned'; time: number; detail: string }

interface Span { x0: number; x1: number; t0: number; t1: number }

const R = VIEW.playerRadius;
const TICK = STEP + 1e-6;

function largestGap(spans: readonly Span[], left: number, right: number): number {
  const cuts = spans.map(s => [s.x0, s.x1] as const).sort((a, b) => a[0] - b[0]);
  let cursor = left;
  let best = 0;
  for (const [a, b] of cuts) {
    if (b <= cursor) continue;
    if (a >= right) break;
    best = Math.max(best, a - cursor);
    cursor = Math.max(cursor, b);
  }
  return Math.max(best, right - cursor);
}

function sealed(spans: readonly Span[], left: number, right: number): boolean {
  const strip = FAIRNESS.sealStrip;
  const center = (left + right) / 2;
  const touches = (a: number, b: number) => spans.some(s => s.x1 > a && s.x0 < b);
  return touches(left, left + strip) && touches(right - strip, right) && touches(center - strip / 2, center + strip / 2);
}

export class FairnessTrace {
  readonly violations: Violation[] = [];
  minGap = Infinity;
  minWarning = Infinity;
  minBeamWarning = Infinity;
  minLock = Infinity;
  windups = 0;
  releases = 0;
  beams = 0;
  hostileShots = 0;
  private readonly started = new Map<number, number>();
  private readonly previousWarning = new Map<number, number>();
  private readonly last = new Map<number, { kind: string; x: number; s: number; aimX: number; warning: number }>();
  private readonly seenShots = new Set<number>();
  private readonly seenHazards = new Set<number>();
  private spans: Span[] = [];
  private readonly cameras: { t: number; x: number }[] = [];
  private evaluatedUntil = -Infinity;

  constructor(private readonly lag = 0.6) {}

  private fail(rule: Violation['rule'], time: number, detail: string) {
    if (this.violations.length < 50) this.violations.push({ rule, time, detail });
  }

  observe(state: RunState): void {
    const now = state.time;
    this.cameras.push({ t: now, x: state.cameraX });
    const released: { id: number; kind: string; x: number; s: number; aimX: number }[] = [];
    // An enemy can release and be destroyed in the same tick; it then vanishes before this observer runs.
    const present = new Set(state.enemies.map(enemy => enemy.id));
    for (const [id, last] of this.last) {
      if (present.has(id)) continue;
      if (last.warning > 0 && last.warning <= 1.5 * STEP) released.push({ id, kind: last.kind, x: last.x, s: last.s, aimX: last.aimX });
      this.last.delete(id);
    }
    for (const enemy of state.enemies) {
      this.last.set(enemy.id, { kind: enemy.kind, x: enemy.x, s: enemy.s, aimX: enemy.aimX, warning: enemy.warning });
      const before = this.previousWarning.get(enemy.id) ?? 0;
      if (enemy.warning > 0 && before === 0) {
        this.windups += 1;
        this.started.set(enemy.id, now);
        const visible = Math.abs(enemy.x - state.cameraX) <= VIEW.width / 2 - enemy.radius + 1e-6 && enemy.s > 3.5 && enemy.s + enemy.radius <= VIEW.maxS + 1e-6;
        if (!visible) this.fail('offscreen', now, `${enemy.kind}#${enemy.id} started a windup at x=${enemy.x.toFixed(2)} s=${enemy.s.toFixed(2)} cam=${state.cameraX.toFixed(2)}`);
      }
      if (before > 0 && enemy.warning === 0) released.push({ id: enemy.id, kind: enemy.kind, x: enemy.x, s: enemy.s, aimX: enemy.aimX });
      this.previousWarning.set(enemy.id, enemy.warning);
    }
    for (const shot of state.projectiles) {
      if (shot.friendly || this.seenShots.has(shot.id)) continue;
      this.seenShots.add(shot.id);
      this.hostileShots += 1;
      // Emission origin: projectiles record where they were before this tick's movement.
      const source = released.find(enemy => Math.abs(shot.previousX - enemy.x) <= 0.6 && Math.abs(shot.previousS - enemy.s) <= 0.35);
      const start = source ? this.started.get(source.id) : undefined;
      if (!source || start === undefined) this.fail('unwarned', now, `hostile shot #${shot.id} at x=${shot.previousX.toFixed(2)} s=${shot.previousS.toFixed(2)} had no completed windup`);
      else {
        const windup = now - start;
        this.minWarning = Math.min(this.minWarning, windup);
        if (windup + TICK < FAIRNESS.warningFloor) this.fail('warning', now, `${source.kind} released after ${windup.toFixed(3)} s`);
        if (shot.vs < 0) {
          const lock = windup + Math.max(0, shot.previousS - (R + shot.radius)) / -shot.vs;
          this.minLock = Math.min(this.minLock, lock);
          if (lock + TICK < FAIRNESS.lockFloor) this.fail('lock', now, `${source.kind} lock-to-impact ${lock.toFixed(3)} s`);
        }
      }
      if (shot.vs < 0) {
        // Shots never steer, so the row crossing is known at release. Record it even if a hit consumes it.
        const crossing = shot.previousS / -shot.vs;
        const x = shot.previousX + shot.vx * crossing;
        const half = shot.radius + Math.abs(shot.vx / shot.vs) * (R + shot.radius);
        const band = (R + shot.radius) / -shot.vs;
        const t = now - STEP + crossing;
        this.spans.push({ x0: x - half, x1: x + half, t0: t - band, t1: t + band });
      }
    }
    for (const hazard of state.hazards) {
      if (this.seenHazards.has(hazard.id) || hazard.active <= 0) continue;
      this.seenHazards.add(hazard.id);
      this.beams += 1;
      const source = released.find(enemy => Math.abs(enemy.aimX - hazard.x) < 1e-6);
      const start = source ? this.started.get(source.id) : undefined;
      if (!source || start === undefined) { this.fail('unwarned', now, `beam #${hazard.id} at x=${hazard.x.toFixed(2)} had no completed windup`); continue; }
      const total = now - start + hazard.warning + STEP;
      this.minBeamWarning = Math.min(this.minBeamWarning, total);
      if (total + TICK < FAIRNESS.beamWarningFloor) this.fail('beam-warning', now, `beam marked for ${total.toFixed(3)} s`);
      const t0 = now + hazard.warning;
      this.spans.push({ x0: hazard.x - hazard.width / 2, x1: hazard.x + hazard.width / 2, t0, t1: t0 + hazard.active });
    }
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || enemy.kind === 'turret' || enemy.bossPart) continue;
      if (Math.abs(enemy.s) <= R + enemy.radius) this.spans.push({ x0: enemy.x - enemy.radius, x1: enemy.x + enemy.radius, t0: now - STEP, t1: now });
    }
    this.evaluate(now - this.lag);
  }

  private cameraAt(t: number): number {
    for (let i = this.cameras.length - 1; i >= 0; i -= 1) if (this.cameras[i].t <= t + 1e-9) return this.cameras[i].x;
    return this.cameras[0]?.x ?? 0;
  }

  private evaluate(until: number): void {
    const half = FAIRNESS.window / 2;
    for (let t = Math.max(this.evaluatedUntil + 3 * STEP, (this.cameras[0]?.t ?? 0)); t <= until; t += 3 * STEP) {
      this.evaluatedUntil = t;
      const active = this.spans.filter(span => span.t0 <= t + half && span.t1 >= t - half);
      if (active.length === 0) continue;
      const camera = this.cameraAt(t);
      const left = camera - VIEW.width / 2;
      const right = camera + VIEW.width / 2;
      const gap = largestGap(active, left, right);
      this.minGap = Math.min(this.minGap, gap);
      if (gap + 1e-9 < FAIRNESS.minGap) this.fail('gap', t, `largest clear gap ${gap.toFixed(2)} in [${left.toFixed(1)}, ${right.toFixed(1)}]`);
      if (sealed(active, left, right)) this.fail('seal', t, 'both edges and the center blocked together');
    }
    const keep = until - 2 * half;
    if (this.spans.length > 400) this.spans = this.spans.filter(span => span.t1 >= keep);
    if (this.cameras.length > 2000) this.cameras.splice(0, this.cameras.length - 1000);
  }

  finish(state: RunState): void {
    this.evaluate(state.time + 10);
  }
}
