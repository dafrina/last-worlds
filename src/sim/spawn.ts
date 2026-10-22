import { ENEMIES, WORLD_INTENSITY, difficultyScales, kinematics, type DifficultyScale } from '../content/balance';
import { FORMATIONS, slotFlies, type FormationId } from '../content/formations';
import type { FormationMember, RunState } from '../shared/contracts';
import { groundHeight, memberPosition } from './motion';
import { anchorGround } from './ground';

export function runScale(state: RunState): DifficultyScale {
  return difficultyScales(state.config.mode, state.config.difficulty ?? 'standard', state.sector);
}

/**
 * Boss shot speed: the campaign difficulty, or the endless ramp at this sector times the pace's shot factor.
 * The boss simulation and the fairness prediction both use it, so predictions match the fired pattern.
 */
export function bossShotScale(state: RunState): number {
  return runScale(state).shotSpeed * (state.config.mode === 'endless' ? kinematics(state.pace).shot : 1) * WORLD_INTENSITY[state.planet].shot;
}

/**
 * Spawns every member of a squadron template that flies at the scale's rank, as one group. `anchorS` shifts
 * the template's forward keyframes (launches from a moving boss bay).
 */
export function spawnMembers(state: RunState, formation: FormationId, anchorX: number, mirror: 1 | -1, anchorS?: number, scale: DifficultyScale = runScale(state),
  /** Starting age: negative for a ground formation spawned ahead of its authored time (further along its track). */
  age = 0): void {
  const template = FORMATIONS[formation];
  const group = state.nextId;
  template.slots.forEach((slot, index) => {
    if (!slotFlies(slot, scale.rank)) return;
    const member: FormationMember = { template: template.id, slot: index, anchorX, mirror, group, ...(anchorS !== undefined ? { anchorS } : {}) };
    const at = memberPosition(member, age);
    const hp = ENEMIES[slot.kind].hp * scale.hp;
    const enemy = {
      id: state.nextId++, kind: slot.kind, x: at.x, s: at.s, originX: anchorX, hp, maxHp: hp,
      radius: ENEMIES[slot.kind].radius, age, nextAttack: (slot.lag ?? 0) + template.fireFrom + slot.fire,
      warning: 0, aimX: at.x, groundHeight: groundHeight(slot.kind), formation: member,
      // Spawned ahead of its time it is still beyond the top edge: shots cannot hit it until its authored entry.
      ...(age < 0 ? { damageable: false } : {}),
    };
    // Ground enemies stand on the terrain, seen through the release lens (src/sim/ground.ts).
    anchorGround(state, enemy);
    state.enemies.push(enemy);
  });
}
