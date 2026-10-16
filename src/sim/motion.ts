import { ENEMIES, GROUND_KINDS, WORLD_INTENSITY } from '../content/balance';
import { BOSSES } from '../content/bosses';
import { FORMATIONS, type FormationTemplate, type Keyframe } from '../content/formations';
import { VIEW, type BossId, type BossState, type Enemy, type FormationMember, type RunState } from '../shared/contracts';

/** Linear keyframe interpolation; past the last keyframe the final segment continues (the exit). */
export function keyframeAt(path: readonly Keyframe[], t: number): { x: number; s: number } {
  if (t <= path[0][0]) return { x: path[0][1], s: path[0][2] };
  let i = 1;
  while (i < path.length - 1 && t > path[i][0]) i += 1;
  const [t0, x0, s0] = path[i - 1];
  const [t1, x1, s1] = path[i];
  const u = (t - t0) / (t1 - t0);
  return { x: x0 + (x1 - x0) * u, s: s0 + (s1 - s0) * u };
}

export function formationTemplate(member: FormationMember): FormationTemplate {
  const template = (FORMATIONS as Record<string, FormationTemplate>)[member.template];
  if (!template) throw new Error(`Unknown formation template ${member.template}`);
  return template;
}

/** Time along the leader path for a member of the given age. Negative while a lagged member waits to enter. */
export function pathTime(member: FormationMember, age: number): number {
  return age - (formationTemplate(member).slots[member.slot].lag ?? 0);
}

export function memberPosition(member: FormationMember, age: number): { x: number; s: number } {
  const template = formationTemplate(member);
  const slot = template.slots[member.slot];
  const t = age - (slot.lag ?? 0);
  const side = member.mirror * (slot.flip ? -1 : 1);
  const point = keyframeAt(template.path, t);
  let swayX = 0;
  let swayS = 0;
  if (template.sway && t > 0) {
    const offset = template.sway.amp * Math.sin(2 * Math.PI * t / template.sway.period);
    if (template.sway.axis === 'x') swayX = offset; else swayS = offset;
  }
  return { x: member.anchorX + side * (point.x + slot.dx + swayX), s: point.s + (slot.ds ?? 0) + swayS + (member.anchorS ?? 0) };
}

/** Authored aim offset in world x for a member: mirrored with its placement and flip. */
export function aimOffset(enemy: Enemy): number {
  if (!enemy.formation) return 0;
  const slot = formationTemplate(enemy.formation).slots[enemy.formation.slot];
  return (slot.aim ?? 0) * enemy.formation.mirror * (slot.flip ? -1 : 1);
}

export function inFiringWindow(enemy: Enemy): boolean {
  if (!enemy.formation) return true;
  const template = formationTemplate(enemy.formation);
  const t = pathTime(enemy.formation, enemy.age);
  return t >= template.fireFrom && t <= template.fireUntil;
}

/** True once a member has flown its whole authored path (it is then removed when out of view). */
export function pathComplete(enemy: Enemy): boolean {
  if (!enemy.formation) return false;
  const path = formationTemplate(enemy.formation).path;
  return pathTime(enemy.formation, enemy.age) >= path[path.length - 1][0];
}

/**
 * Rate of an enemy's clock relative to active time. Airframes run at the pace; ground targets are fixed to the
 * terrain and move with its scroll, so they stop when the terrain stops. Paths, fire offsets and repeat
 * intervals are measured on this clock; warnings always count real seconds.
 */
export function enemyClockRate(state: Pick<RunState, 'pace' | 'scrollSpeed' | 'planet'>, enemy: Enemy): number {
  return GROUND_KINDS.has(enemy.kind) ? state.scrollSpeed / VIEW.scrollSpeed : airClockRate(state);
}
/** Air enemies' flight clock: the pace times the world's flight intensity (WORLD_INTENSITY). */
export const airClockRate = (state: Pick<RunState, 'pace' | 'planet'>) => state.pace * WORLD_INTENSITY[state.planet ?? 'luna'].flight;

/**
 * Deterministic position `ahead` real seconds from now at clock `rate`. Formation members follow their
 * template; the legacy single-enemy motion (straight descent, weaver sine) remains for raw test fixtures.
 */
export function positionAfter(enemy: Enemy, ahead: number, rate = 1): { x: number; s: number } {
  if (enemy.bossPart) return { x: enemy.x, s: enemy.s };
  const clock = ahead * rate;
  if (enemy.formation) return memberPosition(enemy.formation, enemy.age + clock);
  const x = enemy.kind === 'weaver' ? enemy.originX + Math.sin((enemy.age + clock) * 1.6) * 1.2 : enemy.x;
  return { x, s: enemy.s - ENEMIES[enemy.kind].speed * clock };
}

export function advanceEnemy(enemy: Enemy, dt: number, rate = 1): void {
  const next = positionAfter(enemy, dt, rate);
  enemy.age += dt * rate;
  enemy.x = next.x;
  enemy.s = next.s;
  applyBeamLock(enemy, dt);
}

/** Seconds a beam ship takes to swing back onto its path after its beam. */
const LOCK_RELEASE = 0.45;
/**
 * Beam lock: blends a beam ship's path position toward its committed lane, reaching it within the first 0.45 s of
 * the windup (or 60% of a shorter one), holding it while the beam is live, then easing back. Render and hit
 * position follow; the lane itself never moves.
 */
function applyBeamLock(enemy: Enemy, dt: number): void {
  const lock = enemy.lock;
  if (!lock) return;
  let f: number;
  if (enemy.warning > 0) f = Math.min(1, (lock.total - enemy.warning) / Math.min(0.45, lock.total * 0.6));
  else if (lock.hold > 0) { lock.hold -= dt; f = 1; }
  else if (lock.release > 0) { lock.release -= dt; f = Math.max(0, lock.release / LOCK_RELEASE); }
  else { enemy.lock = undefined; return; }
  f = f * f * (3 - 2 * f);
  enemy.x += (enemy.aimX - enemy.x) * f;
}
export const BEAM_LOCK_RELEASE = LOCK_RELEASE;

/**
 * A boss's authored maneuver on its static arena at an active time: it arrives (Bastion-9 rolls in, the Helion
 * Ark glides in on the water), then sways laterally and surges forward/back within bounds.
 */
export function bossPose(boss: Pick<BossState, 'originX' | 'startedAt' | 'id' | 'heldFor'>, time: number): { x: number; s: number } {
  const def = BOSSES[boss.id];
  const age = time - boss.startedAt;
  const arena = def.arena;
  // Time spent holding still for its own lanes does not advance the manoeuvre.
  const fight = Math.max(0, age - def.arrivalDuration - (boss.heldFor ?? 0));
  const s = age < def.arrivalDuration
    ? def.entryS + (def.row - def.entryS) * Math.max(0, age) / def.arrivalDuration
    : def.row + Math.sin(fight * arena.surgeRate) * arena.surge;
  return { x: boss.originX + Math.sin(fight * arena.swayRate) * arena.sway, s };
}

/** Logical position of a boss module relative to the boss pivot. */
export function bossPartOffset(part: NonNullable<Enemy['bossPart']>, id: BossId = 'bastion'): { x: number; s: number } {
  const offset = BOSSES[id].parts[part];
  return { x: offset.x, s: offset.s };
}

export const GROUND_HEIGHT = 0.85;
export function groundHeight(kind: Enemy['kind']): number {
  return GROUND_KINDS.has(kind) ? GROUND_HEIGHT : VIEW.flightHeight;
}
