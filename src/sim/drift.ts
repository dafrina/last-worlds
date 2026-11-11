import { DRIFT, ENEMIES, FAIRNESS, GROUND_KINDS } from '../content/balance';
import type { FormationTemplate } from '../content/formations';
import { VIEW, type Enemy, type RunState } from '../shared/contracts';
import { ANCHOR_LIMIT, shiftClear } from './airspace';
import { approach, clamp } from './geometry';
import { enemyClockRate, formationTemplate, keyframeAt, pathComplete, pathTime, positionAfter } from './motion';
import { ATTACK_FLOOR, canAttack } from './view';

/*
 * The squadron pull (docs/10 §4; user, 11 November: "lets try 1 but keep it to a limit, there should be possibilities to
 * retreat but there should always be 1-2 enemies on screen"). A squadron anchors where the camera was when it spawned and
 * keeps that world x, and craft attack only from inside the view, so crossing to the other screen as a wave arrived left
 * it with nothing to shoot from for its whole life.
 *
 * Now, when no hostile air craft in view can attack (fewer than DRIFT.floor), the nearest air squadron with members beside
 * the view (level with it, in their firing life) slides sideways toward it: its anchor takes an offset, so its shape and
 * authored path are unchanged. The slide goes on until DRIFT.engaged craft can attack, then brakes, so typically a
 * squadron's edge members come in and the bulk stays out: the pilot can still retreat from most of a wave, never from all
 * of it. With one craft engaged and no slide under way, nothing is pulled ("1-2 enemies on screen").
 *
 * Telegraphs stay honest: a squadron never moves while one of its members winds up, holds a beam lane or warps (a Wraith),
 * or while one of its airframes could reach the ship's row within the fairness horizon (the director's contact forecast),
 * so every footprint the director has admitted stays where it was forecast. Its slide also keeps the airspace rule with the
 * other squadrons over the admission horizon (the admissions made so far predicted it where it was), and only one squadron
 * moves at a time. Ground batteries, strike sites and other world-anchored placements, boss launches, aces and craft
 * leaving never move. The ship is never clamped and no edge is made safe: the anchor stays within ANCHOR_LIMIT, the bound a
 * view anchor has at spawn.
 */

/** Hostile air craft in view that may start an attack now: squadron members, aces and Wraiths. Ground targets do not count. */
export function engagedCount(state: RunState): number {
  let count = 0;
  for (const enemy of state.enemies) if (!enemy.bossPart && !enemy.leaving && !GROUND_KINDS.has(enemy.kind) && canAttack(state, enemy)) count++;
  return count;
}

/** How far a craft lies beside the view where it could attack (0 when it is level with it laterally). */
const lateralGap = (state: RunState, enemy: Enemy) => Math.max(0, Math.abs(enemy.x - state.cameraX) - (VIEW.width / 2 - enemy.radius - 0.2));

/** Level with the attack band: above the attack floor and below the view's top, wherever it is laterally. */
const inBand = (enemy: Enemy) => enemy.s > ATTACK_FLOOR && enemy.s <= VIEW.maxS - enemy.radius - 0.2;

/** Contact reach at the ship's row, as the director's contact forecast (src/sim/fairness.ts), plus a tenth of slack. */
const rowReach = (radius: number) => VIEW.playerRadius + radius + 0.05 + 0.1;

/**
 * The lowest row a template's members can reach while it may still be pulled and for a fairness horizon after (a fighting
 * squadron is inside its firing window; paths run at most about 1.5 times real time): memoized per template. Most
 * templates hold their rows far above the ship; only dives need the sampled forecast.
 */
const floors = new Map<string, number>();
function pathFloor(template: FormationTemplate): number {
  let floor = floors.get(template.id);
  if (floor !== undefined) return floor;
  const until = template.fireUntil + FAIRNESS.horizon * 1.5 + Math.max(0, ...template.slots.map(slot => slot.lag ?? 0));
  floor = Math.min(...template.path.filter(key => key[0] <= until).map(key => key[2]), keyframeAt(template.path, until).s);
  floor += Math.min(0, ...template.slots.map(slot => slot.ds ?? 0)) - (template.sway?.axis === 's' ? template.sway.amp : 0);
  floor -= Math.max(...template.slots.map(slot => rowReach(ENEMIES[slot.kind].radius)));
  floors.set(template.id, floor);
  return floor;
}

/** Whether an airframe could reach the ship's row within the fairness horizon (as the director's contact forecast). */
function nearsRow(state: RunState, enemy: Enemy): boolean {
  if (!enemy.pull && pathFloor(formationTemplate(enemy.formation!)) > 0) return false;
  const reach = rowReach(enemy.radius), rate = enemyClockRate(state, enemy);
  for (let t = 0; t <= FAIRNESS.horizon + 1e-9; t += FAIRNESS.slice) if (Math.abs(t === 0 ? enemy.s : positionAfter(enemy, t, rate).s) <= reach) return true;
  return false;
}

/**
 * Whether a squadron may move at all: a view-anchored air squadron in flight (not a boss launch, not world-anchored), none of
 * whose members is leaving, winding up, holding a beam lane, warping, or nearing the ship's row.
 */
function movable(state: RunState, members: readonly Enemy[]): boolean {
  const first = members[0].formation!, entry = formationTemplate(first).entry;
  if (first.pinned || (entry !== 'top' && entry !== 'side' && entry !== 'both')) return false;
  for (const enemy of members) {
    if (enemy.leaving || enemy.hunter || GROUND_KINDS.has(enemy.kind) || enemy.warning > 0 || enemy.lock) return false;
    if (enemy.blink && (Number.isFinite(enemy.blink.startedAt) || enemy.blink.destination)) return false;
  }
  for (const hazard of state.hazards) if (hazard.source !== undefined && members.some(enemy => enemy.id === hazard.source)) return false;
  return !members.some(enemy => nearsRow(state, enemy));
}

/** Whether a squadron is in its fighting life: some live member has entered and is still inside its firing window. */
function fighting(members: readonly Enemy[]): boolean {
  return members.some(enemy => {
    const t = pathTime(enemy.formation!, enemy.age);
    return t >= 0 && t <= formationTemplate(enemy.formation!).fireUntil && !pathComplete(enemy);
  });
}

/**
 * Airspace checked ahead for the moving squadron: its anchor offsets from `from` to `to` were found clear at `time` (each
 * end with the prediction margin, which covers the few hundredths a member can come closer between them), and no squadron
 * newer than `newest` has spawned since. A slide is rechecked every APPROVAL seconds instead of every step; an approval
 * never outlives that by more than a step, and any other squadron's move replaces it.
 */
interface Approval { group: number; from: number; to: number; newest: number; time: number }
const approvals = new WeakMap<RunState, Approval>();
const APPROVAL = 0.1;

/** Whether the squadron may slide its anchor offset from `from` to `to` without breaking the airspace rule. */
function airspaceAllows(state: RunState, group: number, from: number, to: number, newest: number, reach: number): boolean {
  const known = approvals.get(state);
  if (known && known.group === group && known.newest === newest && state.time - known.time <= APPROVAL + 1e-9
    && Math.min(known.from, known.to) <= to + 1e-12 && to <= Math.max(known.from, known.to) + 1e-12) return true;
  const ahead = from + reach, time = state.time;
  if (Math.abs(ahead - from) > Math.abs(to - from) && shiftClear(state, group, ahead - from)) { approvals.set(state, { group, from, to: ahead, newest, time }); return true; }
  if (shiftClear(state, group, to - from)) { approvals.set(state, { group, from, to, newest, time }); return true; }
  approvals.delete(state);
  return false;
}

/** One fixed step of the squadron pull. Runs before the enemies advance, so they move to the shifted path this step. */
export function updateDrift(state: RunState, dt: number): void {
  if (state.jump) return;
  let slidingGroup: number | null = null, newest = -Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.formation || enemy.hp <= 0) continue;
    newest = Math.max(newest, enemy.formation.group);
    if (enemy.formation.drift?.vx) slidingGroup = enemy.formation.group;
  }
  // A pull starts when no craft in view can attack and, once under way, fills the view up to DRIFT.engaged ("1-2 enemies").
  const engaged = engagedCount(state);
  const pulling = engaged < DRIFT.floor || (engaged < DRIFT.engaged && slidingGroup !== null);
  // Nothing to decide unless a squadron is sliding or a pull is due.
  if (!pulling && slidingGroup === null) return;
  const groups = new Map<number, Enemy[]>();
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || !enemy.formation || enemy.bossPart) continue;
    const list = groups.get(enemy.formation.group);
    if (list) list.push(enemy); else groups.set(enemy.formation.group, [enemy]);
  }
  // The squadron to pull: the nearest one with a member beside the view, level with the attack band, that may move. Only one
  // squadron moves at a time: another still braking finishes first.
  let chosen: { group: number; gap: number; direction: number } | null = null;
  if (pulling) for (const [group, members] of groups) {
    let gap = Infinity, direction = 0;
    for (const enemy of members) {
      const g = lateralGap(state, enemy);
      if (g > 0 && inBand(enemy) && g < gap) { gap = g; direction = Math.sign(state.cameraX - enemy.x); }
    }
    if (!Number.isFinite(gap) || (chosen && gap >= chosen.gap) || !fighting(members) || !movable(state, members)) continue;
    chosen = { group, gap, direction };
  }
  if (chosen && slidingGroup !== null && slidingGroup !== chosen.group) chosen = null;
  const group = chosen?.group ?? slidingGroup;
  if (group === null) return;
  const members = groups.get(group)!, first = members[0].formation!, drift = first.drift ?? { x: 0, vx: 0 };
  const { speed, acceleration, braking } = DRIFT.squadron;
  const goal = chosen ? chosen.direction * speed * state.pace : 0;
  let vx = 0, x = drift.x;
  // A squadron that may not move stops dead: what the director forecast for it stays exact.
  if (movable(state, members)) {
    const speeding = goal !== 0 && (drift.vx === 0 || Math.sign(goal) === Math.sign(drift.vx));
    vx = approach(drift.vx, goal, (speeding ? acceleration : braking) * dt);
    const anchor = first.anchorX + drift.x, next = clamp(anchor + vx * dt, -ANCHOR_LIMIT, ANCHOR_LIMIT);
    if (next !== anchor + vx * dt) vx = 0;
    if (next !== anchor && airspaceAllows(state, group, drift.x, next - first.anchorX, newest, Math.sign(next - anchor) * speed * state.pace * APPROVAL)) x = next - first.anchorX;
    else vx = 0;
  }
  for (const enemy of members) enemy.formation!.drift = { x, vx };
}
