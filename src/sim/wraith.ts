import { AIRSPACE, BALANCE, ENEMIES, FAIRNESS, GROUND_KINDS, WORLD_INTENSITY, kinematics, type DifficultyScale } from '../content/balance';
import { WRAITH } from '../content/wraith';
import { VIEW, type Enemy, type RunState } from '../shared/contracts';
import { enemyShots, SHOT_TTL } from './attacks';
import { admitAttack } from './fairness';
import { clamp } from './geometry';

/** Returns the change in live windups, for the shared director's cap. All timing uses active game seconds. */
export function updateWraith(state: RunState, enemy: Enemy, dt: number, scale: DifficultyScale, windups: number): number {
  const blink = enemy.blink ??= { fromX: enemy.x, fromS: enemy.s, startedAt: -Infinity,
    readyAt: state.time + WRAITH.firstAttack, attacks: 0 };
  const materialized = state.time - blink.startedAt >= WRAITH.teleport;
  enemy.damageable = materialized;
  if (blink.exitAt !== undefined) {
    if (state.time >= blink.exitAt) enemy.s += WRAITH.exitSpeed * dt;
    return 0;
  }
  const visible = Math.abs(enemy.x - state.cameraX) <= VIEW.width / 2 - enemy.radius - .2
    && enemy.s > 3.5 && enemy.s <= VIEW.maxS - enemy.radius - .2;
  if (enemy.warning > 0) {
    if (!visible) { enemy.warning = 0; blink.destination = undefined; blink.readyAt = state.time + .6; return -1; }
    enemy.warning = Math.max(0, enemy.warning - dt);
    // Feint from the old position, then snap to the new firing angle near the end of the warning.
    if (blink.destination && enemy.warning <= WRAITH.teleport + WRAITH.afterArrival) {
      const destination = blink.destination;
      if (Math.abs(destination.x - state.cameraX) > VIEW.width / 2 - enemy.radius - .2 || occupied(state, enemy, destination.x, destination.s)) {
        enemy.warning = 0; blink.destination = undefined; blink.readyAt = state.time + .6; return -1;
      }
      blink.fromX = enemy.x; blink.fromS = enemy.s; blink.startedAt = state.time;
      enemy.x = destination.x; enemy.s = destination.s; blink.destination = undefined; enemy.damageable = false;
    }
    if (enemy.warning > 0) return 0;
    const speed = ENEMIES.wraith.shotSpeed * scale.shotSpeed * kinematics(state.pace).shot * WORLD_INTENSITY[state.planet].shot;
    const shots = enemyShots('wraith', enemy.x, enemy.s, enemy.aimX, speed);
    if (state.projectiles.length + shots.length <= BALANCE.maxProjectiles) {
      for (const shot of shots) state.projectiles.push({ ...shot, id: state.nextId++, previousX: shot.x, previousS: shot.s,
        friendly: false, damage: 1, ttl: SHOT_TTL, source: enemy.id });
      blink.attacks++; enemy.volleys = blink.attacks;
      const end = state.time + WRAITH.interval * (WRAITH.rounds - 1);
      blink.readyAt = end + WRAITH.cooldown;
      if (!enemy.hunter && blink.attacks >= WRAITH.normalAttacks) blink.exitAt = end + WRAITH.departureDelay;
    } else blink.readyAt = state.time + FAIRNESS.retryDelay;
    return -1;
  }
  if (!visible && Number.isFinite(blink.startedAt)) {
    // A camera pan can leave a resting hunter behind. Re-enter quietly before giving the next feint.
    const home = clamp(state.cameraX, -VIEW.worldWidth / 2 + 1.3, VIEW.worldWidth / 2 - 1.3);
    enemy.x += clamp(home - enemy.x, -5 * dt, 5 * dt);
    return 0;
  }
  if (state.time < blink.readyAt || windups >= scale.maxWindups || state.time < state.player.invulnerableUntil - .3) return 0;
  if (enemy.hunter && state.enemies.some(other => other !== enemy && other.hunter && other.warning > 0)) return 0;
  // Alternate sides of the CURRENT visible slice. Never teleport offscreen, on top of the player, or into a squadron.
  const firstSide = enemy.formation?.mirror ?? ((enemy.hunter?.key ?? 0) % 2 ? -1 : 1);
  const side = firstSide * (blink.attacks % 2 ? -1 : 1);
  const x = clamp(state.cameraX + side * WRAITH.side, -VIEW.worldWidth / 2 + 1.3, VIEW.worldWidth / 2 - 1.3);
  const warning = Math.max(FAIRNESS.warningFloor, ENEMIES.wraith.warning + scale.warning);
  for (const s of [WRAITH.row, 16.5, 10.5]) {
    if (occupied(state, enemy, x, s) || !visible) continue;
    // Admission sees the same stationary destination and delayed triplet that will actually fire.
    const candidate = { ...enemy, x, s, blink: { ...blink, destination: { x, s }, startedAt: state.time } };
    const speed = ENEMIES.wraith.shotSpeed * scale.shotSpeed * kinematics(state.pace).shot * WORLD_INTENSITY[state.planet].shot;
    const lead = clamp(state.player.vx * (warning + s / speed), -WRAITH.leadLimit, WRAITH.leadLimit);
    const aim = clamp(state.player.x + lead, -VIEW.worldWidth / 2 + VIEW.playerRadius, VIEW.worldWidth / 2 - VIEW.playerRadius);
    if (!admitAttack(state, candidate, aim, warning)) continue;
    blink.destination = { x, s }; enemy.aimX = aim; enemy.warning = warning;
    return 1;
  }
  blink.readyAt = state.time + FAIRNESS.retryDelay;
  return 0;
}

function occupied(state: RunState, enemy: Enemy, x: number, s: number): boolean {
  return state.enemies.some(other => other !== enemy && other.hp > 0 && !other.bossPart && !GROUND_KINDS.has(other.kind)
    && (Math.hypot(other.x - x, other.s - s) < AIRSPACE.separation
      || (!enemy.hunter && !other.hunter && Math.abs(other.s - s) < other.radius + enemy.radius + AIRSPACE.bandGap)));
}
