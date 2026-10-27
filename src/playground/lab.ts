/**
 * The playground's enemy lab (user, 27 October: "make me able to simulate its attacks ... placed in the playground on
 * the real map"): enemies spawned into the live simulation over the level's real terrain, flying their real formations
 * and attacks; the campaign's playlist, hunters and boss stay out of it.
 */
import { spawnMembers, runScale } from '../sim/spawn';
import { HUNTERS } from '../sim/hunters';
import { missionBoss } from '../content/bosses';
import { ENEMIES } from '../content/balance';
import type { FormationId } from '../content/formations';
import { VIEW, type EnemyKind, type MissionId, type RunState } from '../shared/contracts';

/**
 * The run's clock for a map position: before the boss arena's slowdown a mission scrolls at a constant speed from
 * distance 0 (src/sim/bastion.ts, `arenaScroll`), so the lab starts its clock there and the world flies on from that spot.
 * It stays clear of the boss's approach.
 */
export function labClock(mission: MissionId, distance: number): { time: number; limit: number } {
  const limit = (missionBoss(mission)?.approachEndsAt ?? Infinity) - 6;
  return { time: Math.max(0, Math.min(distance / VIEW.scrollSpeed, limit - 30)), limit };
}

/** Keeps the campaign's own spawning out: no playlist, no ambient volleys, no hunters. */
export function holdDirector(state: RunState) {
  state.nextEncounterAt = Infinity; state.nextVolleyAt = Infinity;
  state.hunters = { sector: state.sector, spawned: 999, window: 1e9 };
}

/** A formation of the roster, centred on the view. */
export function spawnFormation(state: RunState, formation: FormationId) {
  spawnMembers(state, formation, state.cameraX, 1);
}

/** A hunter of any kind: the shielded ace the world's hunters are, diving in on the side away from the ship. */
export function spawnHunter(state: RunState, kind: EnemyKind) {
  const base = ENEMIES[kind], hp = base.hp * runScale(state).hp, perCharge = hp * HUNTERS.shield.share;
  const side = state.player.x > state.cameraX ? -1 : 1, x = Math.max(-VIEW.worldWidth / 2 + 1, Math.min(VIEW.worldWidth / 2 - 1, state.cameraX + side * 3));
  state.enemies.push({
    id: state.nextId++, kind, x, s: VIEW.maxS + 3, originX: x, hp, maxHp: hp, radius: base.radius, age: 0,
    nextAttack: HUNTERS.firstAttack, warning: 0, aimX: x, groundHeight: VIEW.flightHeight,
    hunter: { key: 9000 + state.nextId, shield: perCharge * HUNTERS.shield.charges, perCharge, vx: 0, vs: 0, tx: x, ts: HUNTERS.row.max, retarget: 0, waypoint: 0 },
  });
}

/** Every enemy not already winding up attacks as soon as it is in its firing window. */
export function attackNow(state: RunState) {
  for (const enemy of state.enemies) if (!enemy.bossPart && enemy.hp > 0 && enemy.warning <= 0) enemy.nextAttack = enemy.age;
}
