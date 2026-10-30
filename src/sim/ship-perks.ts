import { VIEW, type InputFrame, type Projectile, type RunState } from '../shared/contracts';

/** Shared tuning for input, simulation and the matching animation. No extra HUD resource. */
export const SHIP_PERKS = {
  doubleTapMs: 280,
  /**
   * Interceptor Barrel Roll (user, 30 October: "a quick sideswipe to evade quickly"; "the roll is just visual for the side
   * dash"): a dash this far sideways, fast off the mark and easing out over `dashDuration`, drawn as a barrel roll. It
   * moves the ship only, with no invulnerability: hits along the way still count.
   */
  dashDistance: 2.8,
  dashDuration: .16,
  dashCooldown: 3,
  reflectCooldown: 1.2,
  reflectDuration: .32,
  grazeWidth: .5,
  reflectedDamage: 6,
} as const;

/** Starts a requested sidestep at the start of this step (`dt` before `state.time`), so it moves the ship this step. */
export function updateShipPerk(state: RunState, input: InputFrame, dt: number): void {
  const p = state.player;
  if (state.config.ship !== 'interceptor' || !input.dashPressed || state.time < (p.dashReadyAt ?? 0)) return;
  p.dash = { startedAt: state.time - dt, direction: input.dashPressed, fromX: p.x };
  p.dashReadyAt = p.dash.startedAt + SHIP_PERKS.dashCooldown;
}

/** The share of a sidestep's distance covered `elapsed` seconds in (0 … 1). */
export function dashProgress(elapsed: number): number {
  const t = Math.min(1, Math.max(0, elapsed / SHIP_PERKS.dashDuration));
  return 1 - (1 - t) * (1 - t);
}

/** This step's sidestep movement, and whether the dash ends with it; null outside a sidestep (ordinary steering). */
export function sidestep(state: RunState, dt: number): { dx: number; direction: -1 | 1; done: boolean } | null {
  const dash = state.player.dash;
  if (!dash) return null;
  const from = state.time - dt - dash.startedAt, to = state.time - dash.startedAt;
  if (from >= SHIP_PERKS.dashDuration - 1e-9) return null;
  return { dx: dash.direction * SHIP_PERKS.dashDistance * (dashProgress(to) - dashProgress(from)), direction: dash.direction, done: to >= SHIP_PERKS.dashDuration - 1e-9 };
}

/** Called only after the ordinary swept hit test. Catch at closest approach, never on approach to a direct hit. */
export function catchNearMiss(state: RunState, shot: Projectile, previousPlayerX: number): void {
  if (state.config.ship !== 'spectre' || state.player.shields <= 0 || shot.friendly || shot.ttl <= 0
    || state.time < (state.player.reflectReadyAt ?? 0) || state.projectiles.some(p => p.orbit)) return;
  const ax = shot.previousX - previousPlayerX, as = shot.previousS;
  const bx = shot.x - state.player.x, bs = shot.s;
  const dx = bx - ax, ds = bs - as, length2 = dx * dx + ds * ds;
  if (length2 < 1e-10) return;
  const t = -(ax * dx + as * ds) / length2;
  if (t < 0 || t > 1) return;
  const x = ax + dx * t, s = as + ds * t, radius = Math.hypot(x, s);
  const hitRadius = VIEW.playerRadius + shot.radius;
  if (radius <= hitRadius + .025 || radius > hitRadius + SHIP_PERKS.grazeWidth) return;
  shot.friendly = true;
  shot.reflected = true;
  shot.damage = SHIP_PERKS.reflectedDamage;
  shot.source = undefined; shot.track = false; shot.homingTargetId = undefined;
  shot.ttl = 3;
  shot.orbit = { angle: Math.atan2(s, x), radius, direction: x >= 0 ? -1 : 1, elapsed: 0 };
  shot.x = state.player.x + x; shot.s = s;
  state.player.reflectReadyAt = state.time + SHIP_PERKS.reflectCooldown;
}

/** A captured shot makes a half turn around the shield, then aims once and flies normally. */
export function orbitReflectedShot(state: RunState, shot: Projectile, dt: number): boolean {
  const orbit = shot.orbit;
  if (!orbit) return false;
  // Empty shields cannot sustain the field; dissipate without an attack or refund.
  if (state.player.shields <= 0) { shot.ttl = 0; shot.orbit = undefined; return true; }
  orbit.elapsed = Math.min(SHIP_PERKS.reflectDuration, orbit.elapsed + dt);
  const angle = orbit.angle + orbit.direction * Math.PI * orbit.elapsed / SHIP_PERKS.reflectDuration;
  shot.x = state.player.x + Math.cos(angle) * orbit.radius;
  shot.s = Math.sin(angle) * orbit.radius;
  shot.vx = (shot.x - shot.previousX) / dt; shot.vs = (shot.s - shot.previousS) / dt;
  if (orbit.elapsed >= SHIP_PERKS.reflectDuration) {
    let target: RunState['enemies'][number] | undefined, nearest = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || enemy.damageable === false || enemy.s <= .5 || enemy.s > VIEW.maxS
        || Math.abs(enemy.x - state.cameraX) > VIEW.width / 2 - enemy.radius) continue;
      const distance = Math.hypot(enemy.x - shot.x, enemy.s - shot.s);
      if (distance < nearest) { target = enemy; nearest = distance; }
    }
    const dx = target ? target.x - shot.x : 0, ds = target ? target.s - shot.s : 1;
    const length = Math.hypot(dx, ds);
    shot.vx = dx / length * 26; shot.vs = ds / length * 26;
    shot.orbit = undefined;
  }
  return true;
}
