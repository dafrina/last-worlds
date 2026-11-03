import { GROUND_KINDS } from '../content/balance';
import { BOSSES } from '../content/bosses';
import type { Enemy, KillCause, RunEvent, RunState, WeaponId } from '../shared/contracts';
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
  state.events.push(event);
}
