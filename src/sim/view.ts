import { VIEW, type Enemy, type RunState } from '../shared/contracts';

/** The row an attacker must be above to start a windup (docs/03 §6, the windup gate). */
export const ATTACK_FLOOR = 3.5;

/** Inside the simulation's view of the world (the camera's slice), `margin` units in from every edge. */
export function isVisible(state: Pick<RunState, 'cameraX'>, x: number, s: number, margin = 0): boolean {
  return Math.abs(x - state.cameraX) <= VIEW.width / 2 - margin && s >= VIEW.minS + margin && s <= VIEW.maxS - margin;
}

/** Fully visible and above the attack floor. Windups that lose visibility are cancelled and restart in full. */
export function canAttack(state: Pick<RunState, 'cameraX'>, enemy: Enemy): boolean {
  return enemy.hp > 0 && enemy.s > ATTACK_FLOOR && isVisible(state, enemy.x, enemy.s, enemy.radius + 0.2);
}
