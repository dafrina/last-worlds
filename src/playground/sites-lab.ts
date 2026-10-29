/**
 * The playground's strike-site lab (docs/33 § 6, workstream C): fake site cores over the level's real map, so the site
 * models can be seen, flown past and destroyed on every world before the simulation spawns real sites. A core is a
 * harmless ground target (a fuel skid's track and anchor) with `site` set; the renderer draws the site around it.
 * Presentation testing only: the campaign never runs this.
 */
import { spawnMembers } from '../sim/spawn';
import { VIEW, type RunState, type SiteId } from '../shared/contracts';

/** Where a lab site's core lands: on the map's side route (docs/33: about 7.5 out) or in front of the ship. */
export type SiteSpot = -1 | 0 | 1;
/** The ground track starts at row 22 and scrolls 5 a second (content/formations.ts GROUND). */
const TRACK_TOP = 22;

/**
 * Places a site core at `row` (gameplay s, mid-screen by default), west, east or straight ahead. Returns its id.
 * Durable (the lab's ship cannot shoot it by accident) and never attacks.
 */
export function placeSite(state: RunState, site: SiteId, spot: SiteSpot, row = 11): number | null {
  const first = state.nextId, x = spot === 0 ? state.cameraX : spot * 7.5;
  // The skid pair's first member stands 1.3 west of the anchor; its partner is dropped.
  spawnMembers(state, 'fuel-pair', x + 1.3, 1, undefined, undefined, Math.max(0, (TRACK_TOP - row) / VIEW.scrollSpeed));
  const members = state.enemies.filter(enemy => enemy.id >= first);
  const core = members[0];
  if (!core) return null;
  state.enemies = state.enemies.filter(enemy => enemy.id < first || enemy === core);
  core.site = site; core.hp = core.maxHp = 600; core.damageable = true; core.nextAttack = Infinity;
  return core.id;
}

/** Kills every site core as the simulation does: no hit points left and its kill explosion. */
export function destroySites(state: RunState) {
  for (const enemy of state.enemies) if (enemy.site && enemy.hp > 0) {
    enemy.hp = 0;
    state.effects.push({ id: state.nextId++, kind: 'explosion', x: enemy.x, s: enemy.s, ttl: .5, duration: .5 });
  }
}

/** A site core takes a hit (the core's glow flashes). */
export function hitSites(state: RunState) {
  for (const enemy of state.enemies) if (enemy.site && enemy.hp > 1) enemy.hp -= 1;
}
