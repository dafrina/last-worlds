import { ENEMIES } from '../content/balance';
import { FORMATIONS, type FormationTemplate, type Keyframe } from '../content/formations';
import { VIEW, type Enemy, type FormationMember } from '../shared/contracts';

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
  return { x: member.anchorX + side * (point.x + slot.dx + swayX), s: point.s + (slot.ds ?? 0) + swayS };
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
 * Deterministic position `ahead` seconds from now. Formation members follow their template; the legacy
 * single-enemy motion (straight descent, weaver sine) remains for raw test fixtures.
 */
export function positionAfter(enemy: Enemy, ahead: number): { x: number; s: number } {
  if (enemy.bossPart) return { x: enemy.x, s: enemy.s };
  if (enemy.formation) return memberPosition(enemy.formation, enemy.age + ahead);
  const x = enemy.kind === 'weaver' ? enemy.originX + Math.sin((enemy.age + ahead) * 1.6) * 1.2 : enemy.x;
  return { x, s: enemy.s - ENEMIES[enemy.kind].speed * ahead };
}

export function advanceEnemy(enemy: Enemy, dt: number): void {
  const next = positionAfter(enemy, dt);
  enemy.age += dt;
  enemy.x = next.x;
  enemy.s = next.s;
}

export const GROUND_HEIGHT = 0.85;
export function groundHeight(kind: Enemy['kind']): number {
  return kind === 'turret' ? GROUND_HEIGHT : VIEW.flightHeight;
}
