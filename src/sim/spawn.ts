import { ENEMIES, difficultyScales, kinematics, type DifficultyScale } from '../content/balance';
import { FORMATIONS, slotFlies, type FormationId } from '../content/formations';
import type { FormationMember, RunState } from '../shared/contracts';
import { groundHeight, memberPosition } from './motion';

export function runScale(state: RunState): DifficultyScale {
  return difficultyScales(state.config.mode, state.config.difficulty ?? 'standard', state.sector);
}

/**
 * Boss shot speed: the campaign difficulty, or the endless ramp at this sector times the pace's shot factor.
 * The boss simulation and the fairness prediction both use it, so predictions match the fired pattern.
 */
export function bossShotScale(state: RunState): number {
  return runScale(state).shotSpeed * (state.config.mode === 'endless' ? kinematics(state.pace).shot : 1);
}

/**
 * Spawns every member of a squadron template that flies at the scale's rank, as one group. `anchorS` shifts
 * the template's forward keyframes (launches from a moving boss bay).
 */
export function spawnMembers(state: RunState, formation: FormationId, anchorX: number, mirror: 1 | -1, anchorS?: number, scale: DifficultyScale = runScale(state)): void {
  const template = FORMATIONS[formation];
  const group = state.nextId;
  template.slots.forEach((slot, index) => {
    if (!slotFlies(slot, scale.rank)) return;
    const member: FormationMember = { template: template.id, slot: index, anchorX, mirror, group, ...(anchorS !== undefined ? { anchorS } : {}) };
    const at = memberPosition(member, 0);
    const hp = ENEMIES[slot.kind].hp * scale.hp;
    state.enemies.push({
      id: state.nextId++, kind: slot.kind, x: at.x, s: at.s, originX: anchorX, hp, maxHp: hp,
      radius: ENEMIES[slot.kind].radius, age: 0, nextAttack: (slot.lag ?? 0) + template.fireFrom + slot.fire,
      warning: 0, aimX: at.x, groundHeight: groundHeight(slot.kind), formation: member,
    });
  });
}
