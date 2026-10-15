import { BALANCE } from '../content/balance';
import { BOSSES } from '../content/bosses';
import { ENDLESS_CYCLE, endlessPlanet, endlessScroll, endlessSectorPlan, paceInSector } from '../content/endless';
import type { RunState } from '../shared/contracts';
import { startBoss } from './bastion';

/** Seconds into the current sector at which its boss was destroyed, or null while it lives. */
function bossEnd(state: RunState): number | null {
  const boss = state.boss;
  return boss && boss.phase === 'destroyed' ? boss.phaseStartedAt - state.sectorStartedAt : null;
}

/**
 * Endless planet cycle (docs/18). Drives sector progression, pace, the closed-form scroll (ramp, arena stop,
 * resume, hyperdrive jump), the boss of every third sector, the jump and the run's planet. A boss sector has no
 * time limit: the run continues only once its boss is destroyed (user decision, docs/18 §2). `onNewSector`
 * lets the director restart its playlist when a sector begins.
 */
export function updateEndless(state: RunState, onNewSector: (state: RunState) => void): void {
  let plan = endlessSectorPlan(state.sector);
  let tau = state.time - state.sectorStartedAt;
  let scroll = endlessScroll(plan, tau, bossEnd(state));
  if (scroll.phase === 'next') {
    const length = plan.boss ? bossEnd(state)! + ENDLESS_CYCLE.resumeDuration + ENDLESS_CYCLE.jumpDuration : BALANCE.sectorDuration;
    state.sectorStartedAt += length;
    state.sector += 1;
    state.boss = null;
    state.jump = null;
    state.enemies = state.enemies.filter(enemy => !enemy.bossPart);
    state.planet = endlessPlanet(state.sector);
    onNewSector(state);
    plan = endlessSectorPlan(state.sector);
    tau = state.time - state.sectorStartedAt;
    scroll = endlessScroll(plan, tau, null);
  }
  state.pace = paceInSector(plan.sector, tau);
  state.scrollSpeed = scroll.speed;
  state.distance = scroll.distance;
  if (plan.boss && !state.boss && tau + 1e-8 >= ENDLESS_CYCLE.bossSector.arrivesAt) startBoss(state, BOSSES[plan.boss]);
  if (scroll.phase === 'jump' && plan.jump) {
    if (!state.jump) {
      const startedAt = state.sectorStartedAt + bossEnd(state)! + ENDLESS_CYCLE.resumeDuration;
      state.jump = { startedAt, duration: ENDLESS_CYCLE.jumpDuration, from: plan.jump.from, to: plan.jump.to };
      // No combat during the jump: nothing hostile remains, and the player is protected until after it.
      state.enemies = state.enemies.filter(enemy => enemy.bossPart);
      state.projectiles = state.projectiles.filter(shot => shot.friendly);
      state.hazards = [];
      state.player.invulnerableUntil = Math.max(state.player.invulnerableUntil, startedAt + ENDLESS_CYCLE.jumpDuration + 0.5);
    }
    // The look and the run's planet switch at the flash, halfway through the jump. The wreck has fallen
    // behind the view by then and is removed with the old planet.
    if (state.planet !== state.jump.to && state.time + 1e-8 >= state.jump.startedAt + state.jump.duration / 2) {
      state.planet = state.jump.to;
      state.enemies = state.enemies.filter(enemy => !enemy.bossPart);
    }
  }
}
