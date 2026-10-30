/**
 * The playground's strike-site lab (docs/33 § 6, workstream C): sites over the level's real map, so the site models
 * can be seen, flown past and destroyed on every world. West and east place the real site (its authored guard and core
 * from src/content/sites.ts `siteCue`, on the side route); "ahead" places a lone core in front of the ship for a close
 * look. The renderer draws the site around the core. Presentation testing only: the campaign never runs this.
 */
import { spawnMembers } from '../sim/spawn';
import { SITE_LEAD, FORMATIONS } from '../content/formations';
import { siteCue } from '../content/sites';
import { VIEW, type PlanetId, type RunState, type SiteId } from '../shared/contracts';

/** Where a lab site's core lands: on the map's side route (docs/33: about 7.5 out) or in front of the ship. */
export type SiteSpot = -1 | 0 | 1;
/** The site track starts at row 22 + SITE_LEAD and scrolls 5 a second (content/formations.ts SITE_TRACK). */
const TRACK_TOP = 22 + SITE_LEAD;

/**
 * Places a site with its core at `row` (gameplay s; mid-screen by default). Returns the core's id. A lab core is
 * durable (the lab's ship cannot break it by accident); guards fire as authored.
 */
export function placeSite(state: RunState, planet: PlanetId, site: SiteId, spot: SiteSpot, row = 11): number | null {
  const first = state.nextId, age = Math.max(0, (TRACK_TOP - row) / VIEW.scrollSpeed);
  const placements = spot === 0
    ? [{ formation: `site-core-${site}` as const, x: state.cameraX, mirror: false }]
    : siteCue(site, spot, state.time, planet).formations.map(placement => ({ formation: placement.formation, x: placement.x ?? 0, mirror: !!placement.mirror }));
  for (const placement of placements) {
    // Air flourishes (the airfield's scramble) fly from the top as authored; ground formations start at the row.
    const ground = FORMATIONS[placement.formation].entry === 'ground';
    spawnMembers(state, placement.formation, placement.x, placement.mirror ? -1 : 1, undefined, undefined, ground ? age : 0);
  }
  const cores = state.enemies.filter(enemy => enemy.id >= first && enemy.site);
  for (const core of cores) { core.hp = core.maxHp = 600; core.damageable = true; }
  return cores[0]?.id ?? null;
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
