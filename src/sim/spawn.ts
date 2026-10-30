import { ENEMIES, WORLD_INTENSITY, difficultyScales, kinematics, type DifficultyScale } from '../content/balance';
import { FORMATIONS, coreSite, slotFlies, type FormationId } from '../content/formations';
import { SITES, SITE_CORE_HEIGHT } from '../content/sites';
import { VIEW, type FormationMember, type RunState } from '../shared/contracts';
import { groundHeight, memberPosition } from './motion';
import { anchorGround } from './ground';
import { SEAT_SEARCH, guardSpots, seatCore, seatTrack, siteSeat, type SiteSeat } from './sites';

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
  // A strike site's core (docs/33): its site, and the site's hit points, radius and core height instead of its kind's.
  const site = coreSite(template.id), core = site ? SITES[site].core : null;
  // A strike site's core (harmless: it never fires) stands on the even dry seat found near its authored place, clear of
  // its cue's guards (src/sim/sites.ts), its track shifted onto it; the site is drawn around it. The guards keep their
  // authored place and timing, so the cue's fairness is exactly as authored.
  let seat: SiteSeat | null = null;
  if (site && template.entry === 'ground' && Math.abs(anchorX) >= SEAT_SEARCH.side) {
    const trackS = memberPosition({ template: template.id, slot: 0, anchorX, mirror, group }, age).s - (template.slots[0].ds ?? 0);
    seat = siteSeat(state, anchorX, trackS, guardSpots(state, site, anchorX, mirror, age), SITE_CORE_HEIGHT[site]);
    const shift = seatTrack(state, seat, trackS, SITE_CORE_HEIGHT[site]);
    anchorX = shift.anchorX; age -= shift.shiftS / VIEW.scrollSpeed;
  }
  template.slots.forEach((slot, index) => {
    if (!slotFlies(slot, scale.rank)) return;
    const member: FormationMember = { template: template.id, slot: index, anchorX, mirror, group, ...(anchorS !== undefined ? { anchorS } : {}) };
    const at = memberPosition(member, age);
    const hp = (core?.hp ?? ENEMIES[slot.kind].hp) * scale.hp;
    const enemy = {
      id: state.nextId++, kind: slot.kind, x: at.x, s: at.s, originX: anchorX, hp, maxHp: hp,
      radius: core?.radius ?? ENEMIES[slot.kind].radius, age, ...(site ? { site } : {}), nextAttack: (slot.lag ?? 0) + template.fireFrom + slot.fire,
      warning: 0, aimX: at.x, groundHeight: site ? SITE_CORE_HEIGHT[site] : groundHeight(slot.kind), formation: member,
      // Spawned ahead of its time it is still beyond the top edge: shots cannot hit it until its authored entry.
      ...(age < 0 ? { damageable: false } : {}),
    };
    // Ground enemies stand on the terrain, seen through the release lens (src/sim/ground.ts).
    // A site's core rests on its site's floor (one with the model built around it); other ground enemies on the terrain.
    if (seat && site) seatCore(state, enemy, seat); else anchorGround(state, enemy);
    state.enemies.push(enemy);
  });
}
