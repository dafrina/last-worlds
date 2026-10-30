import { BALANCE } from '../content/balance';
import { missionBoss } from '../content/bosses';
import type { EncounterCue } from '../content/encounters';
import { WEAPON_IDS } from '../content/equipment';
import { SHIELD_FALLBACK_CREDITS, SITES, SITE_FOOTPRINT, SITE_SCORE, siteMessage } from '../content/sites';
import { VIEW, type Enemy, type Pickup, type RunState, type WeaponId } from '../shared/contracts';
import { fromFlightPlane, lensEye } from '../shared/lens';
import { groundSeat, runRoute } from '../world/run-route';
import { worldAt } from '../world/terrain';
import { MATCH_ROW, lineOfSightGround, projectGround } from './ground';

/**
 * Strike sites in the simulation (docs/33 § 3). A site's guard and core are ordinary formations of its cue (content/
 * sites.ts `siteCue`), so admission, airspace, spawning ahead and fairness treat them like any other; spawnMembers gives
 * a core its site, hit points and radius (src/sim/spawn.ts). Here: the site's message for the run's mode, and its loot when
 * its last core breaks. Pure and deterministic: no randomness at all.
 *
 * Shield budget (invariant 11): a shield site's cell is a budgeted shield supply delivered early, never an extra one. It
 * takes the next supply still to come in the mission (endless: in this sector, else the next sector's), which is then
 * skipped (updateShieldSupplies asks `supplyClaimed`). With none left to take, the site pays credits (campaign) or score
 * (endless) instead, so the cells a run can collect never exceed its supply schedule.
 */

const sites = (state: RunState) => state.sites ??= { destroyed: 0, shieldClaims: [] };

/** The message a site cue shows: its own, with what it drops in this run's mode (e.g. `AIRFIELD · WEST · PARTS`). */
export function siteCueMessage(state: RunState, cue: EncounterCue): string | undefined {
  return cue.site ? siteMessage(cue.site.id, cue.site.side, state.config.mode) : cue.message;
}

/** The run's budgeted shield supplies still to come (their claim keys), soonest first. */
function suppliesAhead(state: RunState): string[] {
  const supplies = BALANCE.shieldSupplies;
  if (state.config.mode === 'endless') {
    const at = state.sectorStartedAt + supplies.endlessAt;
    return [...(state.time + 1e-8 < at ? [supplyKey(state.sector, 0)] : []), supplyKey(state.sector + 1, 0)];
  }
  const times = (missionBoss(state.config.mission)?.shieldSupplies ?? supplies.campaign)[state.config.difficulty ?? 'standard'];
  return times.flatMap((at, index) => state.time + 1e-8 < at ? [supplyKey(state.sector, index)] : []);
}
const supplyKey = (sector: number, index: number) => `${sector}:${index}`;
/** Whether a shield site already took this supply (the `index`-th of the sector's or mission's schedule). */
export const supplyClaimed = (state: RunState, index: number) => !!state.sites?.shieldClaims.includes(supplyKey(state.sector, index));

/**
 * A site core was destroyed (damageEnemy). The site falls with its last core (the sealed vault has three): it counts as
 * destroyed, scores, and drops its loot where that core stood.
 */
export function destroySiteCore(state: RunState, core: Enemy): void {
  const id = core.site!;
  if (state.enemies.some(other => other !== core && other.site === id && other.hp > 0 && other.formation?.group === core.formation?.group)) return;
  const definition = SITES[id], campaign = state.config.mode === 'campaign', record = sites(state);
  record.destroyed += 1;
  state.score += SITE_SCORE;
  const drop = (kind: Pickup['kind'], value: number, dx = 0, weapon?: WeaponId) => pushLoot(state, { id: state.nextId++, kind, x: core.x + dx, s: core.s, value, ttl: 12, ...(weapon ? { weapon } : {}) });
  const kind = campaign ? definition.loot.kind : definition.endless.kind;
  if (!campaign) state.score += definition.endless.score;
  switch (kind) {
    case 'part':
      // One pickup per part, side by side.
      for (let i = 0; i < definition.loot.value; i++) drop('part', 1, (i - (definition.loot.value - 1) / 2) * 0.8);
      break;
    case 'credit': drop('credit', definition.loot.value); break;
    case 'power': drop('power', 1); break;
    // The next gun in the pool's order (endless only: campaign weapons and tiers are bought, docs/30).
    case 'weapon': drop('weapon', 1, 0, WEAPON_IDS[(WEAPON_IDS.indexOf(state.player.weapon) + 1) % WEAPON_IDS.length]); break;
    case 'shield': {
      const claim = suppliesAhead(state).find(key => !record.shieldClaims.includes(key));
      if (claim) { record.shieldClaims.push(claim); drop('shield', 1); }
      else if (campaign) drop('credit', SHIELD_FALLBACK_CREDITS);
      else state.score += SITE_SCORE;
      break;
    }
    case 'score': break;
  }
}

/** Loot is never lost to the pickup ceiling: when it is full, the oldest credit drop makes room. */
function pushLoot(state: RunState, pickup: Pickup): void {
  if (state.pickups.length >= BALANCE.maxPickups) {
    const oldest = state.pickups.findIndex(other => other.kind === 'credit');
    if (oldest < 0) return;
    state.pickups.splice(oldest, 1);
  }
  state.pickups.push(pickup);
}

/*
 * ---- Seats (workstream C, 30 October; user: "make sure none of these cross heavy cliffs") ----
 * A site stands on the most even dry ground near its authored place. Before a site's ground formations spawn, the seat
 * search (pure: the run's terrain and the camera of that tick, never randomness) picks the centre whose footprint
 * (SITE_FOOTPRINT) is flattest, dry, low enough and close to the side route, and the floor level the site is built at.
 * Every member's track is shifted so its line of sight lands there; the core then rests on the site's floor (not the raw
 * terrain under its centre), so the model built around it and its gameplay position stay one point. Guard batteries
 * keep their own ground around it. The renderer stands the site on that floor and fills any drop under it with
 * foundations (src/render/site-view.ts).
 */
/**
 * Search window around the authored centre on the ground: at most `inward` toward the map's centre (never outward: the
 * guards' outer ring stays where the ship can line it up) and `ds` forward or back (about 1.6 s of the cue's timing),
 * so the main battle's safe path and the guards' firing rows are kept. Only side-route sites (|x| ≥ `side`) are moved.
 */
export const SEAT_SEARCH = { inward: 1.5, ds: 8, maxX: 9, side: 5 } as const;
/** The core height the guards' tracks aim with (the batteries' own). */
const SEAT_AIM = .85;
/** Sites never stand higher than this (their tallest core must stay well under the flight plane). */
const SEAT_HIGH = 1.4;
export interface SiteSeat {
  /** The site's centre on the ground (world x, world s) and its floor level. */
  x: number; s: number; base: number;
  /** The footprint under it: ground spread (10th to 90th percentile), the most ground above the floor, the deepest drop
   * under it, and the share over open water. */
  spread: number; above: number; drop: number; wet: number;
}
/** A world whose sites are built for shallow water (Nacre's mire). */
const WET_WORLDS: ReadonlySet<string> = new Set(['nacre']);
/** The footprint's ground under a centre (world x, s), sampled on an nx × ns grid. */
export function footprintGround(state: RunState, x: number, s: number, nx = 6, ns = 7): SiteSeat {
  const route = runRoute(state.config), seed = state.config.seed, heights: number[] = [];
  let wet = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ns; j++) {
    const seat = groundSeat(seed, route, x + SITE_FOOTPRINT.x * (2 * i / (nx - 1) - 1), s + SITE_FOOTPRINT.s[0] + (SITE_FOOTPRINT.s[1] - SITE_FOOTPRINT.s[0]) * j / (ns - 1));
    if (seat.afloat) wet++;
    heights.push(seat.base);
  }
  heights.sort((a, b) => a - b);
  const at = (f: number) => heights[Math.min(heights.length - 1, Math.floor(heights.length * f))];
  // The floor: high enough that hardly any ground pokes through it; any drop under it is foundation (site-view.ts).
  const base = at(.92);
  return { x, s, base, spread: at(.9) - at(.1), above: heights[heights.length - 1] - base, drop: base - heights[0], wet: wet / heights.length };
}
function seatCost(state: RunState, seat: SiteSeat, dx: number, ds: number): number {
  const wet = WET_WORLDS.has(worldAt(runRoute(state.config), seat.s).planet.id) ? 0 : seat.wet;
  return seat.spread + 2 * seat.above + .25 * Math.min(seat.drop, 4) + 6 * wet + 2 * Math.max(0, seat.base - SEAT_HIGH) + .06 * Math.abs(dx) + .02 * Math.abs(ds);
}
const seats = new WeakMap<RunState, { tick: number; key: string; seat: SiteSeat }>();
/**
 * The seat for a site whose centre is authored at gameplay `anchorX` on a ground track now at row `trackS`. The same
 * inputs in the same tick give the same seat (cached: the guard and the core of a cue spawn together).
 */
export function siteSeat(state: RunState, anchorX: number, trackS: number): SiteSeat {
  const key = `${anchorX.toFixed(4)}:${trackS.toFixed(4)}:${state.distance}:${state.cameraX}`, cached = seats.get(state);
  if (cached && cached.tick === state.tick && cached.key === key) return cached.seat;
  const ahead = trackS - MATCH_ROW, nominal = lineOfSightGround(state, anchorX, ahead, SEAT_AIM);
  const x0 = nominal.at.x, s0 = state.distance + ahead + nominal.at.s, out = Math.sign(x0) || 1;
  // A camera far to the other side spreads the authored spot outward: the search then reaches further in, never past maxX.
  const reach = SEAT_SEARCH.inward + Math.max(0, Math.abs(x0) - SEAT_SEARCH.maxX), allowed = (x: number) => Math.abs(x) <= SEAT_SEARCH.maxX + 1e-9;
  // Coarse: a 0.5 × 2 grid with a 3 × 4 footprint sample; fine: around the best, the full sample.
  let best = { cost: Infinity, dx: 0, ds: 0 };
  for (let dx = -reach; dx <= 1e-9; dx += .5) for (let ds = -SEAT_SEARCH.ds; ds <= SEAT_SEARCH.ds + 1e-9; ds += 2) {
    const x = x0 + out * dx;
    if (!allowed(x)) continue;
    const cost = seatCost(state, footprintGround(state, x, s0 + ds, 3, 4), dx, ds);
    if (cost < best.cost) best = { cost, dx, ds };
  }
  let seat = footprintGround(state, Math.sign(x0) * Math.min(Math.abs(x0), SEAT_SEARCH.maxX), s0), bestCost = Infinity;
  for (const fx of [-.25, 0, .25]) for (const fs of [-1, 0, 1]) {
    const dx = Math.min(0, Math.max(-reach, best.dx + fx)), ds = best.ds + fs, x = x0 + out * dx;
    if (!allowed(x)) continue;
    const candidate = footprintGround(state, x, s0 + ds), cost = seatCost(state, candidate, dx, ds);
    if (cost < bestCost) { bestCost = cost; seat = candidate; }
  }
  seats.set(state, { tick: state.tick, key, seat });
  return seat;
}
/**
 * The track that puts a member's line of sight on the seat at the moment it crosses MATCH_ROW: its anchor x, and how much
 * further along its track starts (gameplay s), for a core of height `core` resting at `base`.
 */
export function seatTrack(state: RunState, seat: SiteSeat, trackS: number, core: number, base = seat.base): { anchorX: number; shiftS: number } {
  const eye = lensEye(state.cameraX), t = (eye.y - VIEW.flightHeight) / (eye.y - (base + core));
  const relative = eye.s + (MATCH_ROW - eye.s) / t, ahead = seat.s - state.distance - relative;
  return { anchorX: eye.x + (seat.x - eye.x) * t, shiftS: MATCH_ROW + ahead - trackS };
}
/**
 * A site core rests on its site's floor: its anchor is where the line of sight through its track (at MATCH_ROW, as every
 * ground anchor is solved) meets the floor's height plus its core height. With its track aimed at the seat that is the
 * seat itself; the sealed vault's seals keep their offsets around it.
 */
export function seatCore(state: RunState, core: Enemy, seat: SiteSeat): void {
  const at = fromFlightPlane(state.cameraX, core.x, MATCH_ROW, seat.base + core.groundHeight), dx = at.x - core.x, ds = at.s - MATCH_ROW;
  core.ground = { dx, ds, x: core.x + dx, s: core.s + ds, base: seat.base, afloat: false, cameraX: state.cameraX };
  projectGround(state, core);
}
