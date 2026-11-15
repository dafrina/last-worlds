import { SHIP_PERKS } from '../content/ship-perks';
import { PLAYER_HIT_RADIUS, VIEW, type Enemy, type Projectile, type RunState } from '../shared/contracts';

/**
 * The chassis perks that act in flight (docs/42). Scrapper's Salvage Rig and Ironclad's Reserve Life are plain numbers
 * (content/equipment.ts SHIPS); these two have behaviour.
 */

/** Interceptor Shred: a main-weapon hit spins the guns up one notch (any enemy; other chassis never spin). */
export function spinUp(state: RunState): void {
  if (state.config.ship !== 'interceptor') return;
  state.player.spin = Math.min(SHIP_PERKS.shredCap, (state.player.spin ?? 0) + SHIP_PERKS.shredPerHit);
}
/** The main weapon's fire-rate multiplier from the Shred spin (1 when still). */
export const spinRate = (state: RunState) => 1 + (state.config.ship === 'interceptor' ? state.player.spin ?? 0 : 0);

/**
 * Spectre Gravity Slingshot, called only after the ordinary swept hit test missed: a hostile shot whose closest approach
 * passes within `grazeWidth` outside the hit circle is caught there, never on its way into a direct hit.
 */
export function catchNearMiss(state: RunState, shot: Projectile, previousPlayerX: number): void {
  if (state.config.ship !== 'spectre' || shot.friendly || shot.ttl <= 0 || state.time < (state.player.reflectReadyAt ?? 0)) return;
  const ax = shot.previousX - previousPlayerX, as = shot.previousS;
  const bx = shot.x - state.player.x, bs = shot.s;
  const dx = bx - ax, ds = bs - as, length2 = dx * dx + ds * ds;
  if (length2 < 1e-10) return;
  const t = -(ax * dx + as * ds) / length2;
  if (t < 0 || t > 1) return;
  const x = ax + dx * t, s = as + ds * t, radius = Math.hypot(x, s);
  const hitRadius = PLAYER_HIT_RADIUS + shot.radius;
  if (radius <= hitRadius + .025 || radius > hitRadius + SHIP_PERKS.grazeWidth) return;
  shot.friendly = true;
  shot.reflected = true;
  shot.damage = SHIP_PERKS.reflectedDamage;
  // It goes back to whoever fired it (homingTargetId), chosen when it leaves the swing.
  shot.source = undefined; shot.track = false; shot.homingTargetId = shot.firedBy;
  shot.ttl = 3;
  shot.orbit = { angle: Math.atan2(s, x), radius, direction: x >= 0 ? -1 : 1, elapsed: 0 };
  shot.x = state.player.x + x; shot.s = s;
  state.player.reflectReadyAt = state.time + SHIP_PERKS.reflectCooldown;
}

/** A target a returned shot may fly at: alive, open to damage and in view. */
const returnable = (state: RunState, enemy: Enemy) => enemy.hp > 0 && enemy.damageable !== false && enemy.s > .5 && enemy.s <= VIEW.maxS
  && Math.abs(enemy.x - state.cameraX) <= VIEW.width / 2 - enemy.radius;

/**
 * A caught shot swings half round the ship, then flies back at the enemy that fired it (or, if that one is gone or out
 * of view, the nearest target in view) and homes on it. Returns whether it handled the shot's movement this step.
 */
export function orbitReflectedShot(state: RunState, shot: Projectile, dt: number): boolean {
  if (shot.reflected && !shot.orbit) { steerReturn(state, shot, dt); return false; }
  const orbit = shot.orbit;
  if (!orbit) return false;
  orbit.elapsed = Math.min(SHIP_PERKS.reflectDuration, orbit.elapsed + dt);
  const angle = orbit.angle + orbit.direction * Math.PI * orbit.elapsed / SHIP_PERKS.reflectDuration;
  shot.x = state.player.x + Math.cos(angle) * orbit.radius;
  shot.s = Math.sin(angle) * orbit.radius;
  shot.vx = (shot.x - shot.previousX) / dt; shot.vs = (shot.s - shot.previousS) / dt;
  if (orbit.elapsed >= SHIP_PERKS.reflectDuration) {
    let target = state.enemies.find(enemy => enemy.id === shot.homingTargetId && returnable(state, enemy)), nearest = Infinity;
    if (!target) for (const enemy of state.enemies) {
      if (!returnable(state, enemy)) continue;
      const distance = Math.hypot(enemy.x - shot.x, enemy.s - shot.s);
      if (distance < nearest) { target = enemy; nearest = distance; }
    }
    shot.homingTargetId = target?.id;
    const dx = target ? target.x - shot.x : 0, ds = target ? target.s - shot.s : 1;
    const length = Math.hypot(dx, ds) || 1;
    shot.vx = dx / length * SHIP_PERKS.reflectedSpeed; shot.vs = ds / length * SHIP_PERKS.reflectedSpeed;
    shot.orbit = undefined;
  }
  return true;
}

/** A returned shot turns toward its target while that target lives and stays in view; otherwise it flies straight on. */
function steerReturn(state: RunState, shot: Projectile, dt: number): void {
  const target = state.enemies.find(enemy => enemy.id === shot.homingTargetId && returnable(state, enemy));
  if (!target) return;
  const current = Math.atan2(shot.vx, shot.vs), desired = Math.atan2(target.x - shot.x, target.s - shot.s);
  const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  const turn = SHIP_PERKS.reflectedTurn * dt, next = current + Math.max(-turn, Math.min(turn, delta));
  shot.vx = Math.sin(next) * SHIP_PERKS.reflectedSpeed; shot.vs = Math.cos(next) * SHIP_PERKS.reflectedSpeed;
}
