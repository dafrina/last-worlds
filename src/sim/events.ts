import { GROUND_KINDS } from '../content/balance';
import { BOSSES } from '../content/bosses';
import { VIEW, type Enemy, type KillCause, type RunEvent, type RunState, type WeaponId } from '../shared/contracts';
import { runRoute } from '../world/run-route';
import { terrainHeight, worldAt } from '../world/terrain';

/*
 * The run's observation hook (docs/35): what happened, appended to `RunState.events` when an observer attached that list
 * (the campaign's missions, src/campaign/missions.ts). Append-only and write-only: nothing in the simulation reads it,
 * so an observed run plays out exactly as an unobserved one (tests/sim/run-events.test.ts). Without an observer every
 * call returns at once and nothing is built.
 */

/** Records one event, if an observer is attached. */
export function observe(state: RunState, event: RunEvent): void {
  state.events?.push(event);
}

/**
 * Whether the terrain directly under a flight-plane point (x, s ahead of the ship's row) is open water: a world with a sea,
 * and its surface there at or below sea level.
 */
export function overWater(state: RunState, x: number, s: number): boolean {
  const route = runRoute(state.config), world = state.distance + s, sea = worldAt(route, world).planet.seaLevel;
  return sea !== null && terrainHeight(state.config.seed, x, world, route) <= sea;
}

/** Records an enemy's destruction and what caused it (`weapon`: the main weapon of a 'main' kill). */
export function observeKill(state: RunState, enemy: Enemy, cause: KillCause, weapon?: WeaponId): void {
  if (!state.events) return;
  const boss = state.boss, launches = boss ? BOSSES[boss.id].launches : null;
  const event: RunEvent = {
    type: 'kill', time: state.time, kind: enemy.kind, cause, ground: GROUND_KINDS.has(enemy.kind) && !enemy.bossPart,
    x: enemy.x, s: enemy.s, water: overWater(state, enemy.x, enemy.s), hunter: !!enemy.hunter,
  };
  if (cause === 'main' && weapon) event.weapon = weapon;
  if (cause === 'special') event.special = state.config.special ?? 'shockwave';
  if (enemy.site) event.site = enemy.site;
  if (enemy.bossPart) event.bossPart = enemy.bossPart;
  if (boss && launches && enemy.formation?.template === launches.template) event.launchedBy = boss.id;
  if (enemy.kind === 'relic') event.armourOpen = state.time < (enemy.openUntil ?? -Infinity);
  if (enemy.kind === 'skimmer') event.echoInFlight = enemy.echoShot !== undefined && state.projectiles.some(shot => shot.id === enemy.echoShot && shot.ttl > 0);
  state.events.push(event);
}

/** Each observed run's split halves that have crossed the ship's row, waiting for their partner (outside the run state). */
const crossings = new WeakMap<RunState, Map<number, { x: number; time: number }>>();
/**
 * Split Runner (docs/39; user, 13 November: "fly through the split 3 times in a run"): when both halves of a Skimmer's
 * Echo Split have crossed the ship's row, and the ship was between them clear of both (and unhit since the split), a
 * `thread` event. Observation only: its bookkeeping lives outside the run state and nothing in play reads it.
 */
export function observeThreads(state: RunState): void {
  if (!state.events) return;
  let open = crossings.get(state);
  for (const shot of state.projectiles) {
    if (shot.friendly || shot.echo === undefined || (shot.delay ?? 0) > 0 || shot.ttl <= 0 || !(shot.previousS > 0 && shot.s <= 0)) continue;
    const x = shot.previousX + (shot.x - shot.previousX) * shot.previousS / (shot.previousS - shot.s);
    if (!open) { open = new Map(); crossings.set(state, open); }
    const other = open.get(shot.echo);
    if (!other) { open.set(shot.echo, { x, time: state.time }); continue; }
    open.delete(shot.echo);
    const lo = Math.min(x, other.x) + shot.radius, hi = Math.max(x, other.x) - shot.radius, px = state.player.x;
    if (px - VIEW.playerRadius > lo && px + VIEW.playerRadius < hi && state.player.lastHitAt < other.time - 1) observe(state, { type: 'thread', time: state.time });
  }
  if (open) for (const [id, entry] of open) if (state.time - entry.time > 1.5) open.delete(id);
}

