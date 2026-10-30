import { BALANCE } from '../content/balance';
import { missionBoss } from '../content/bosses';
import type { EncounterCue } from '../content/encounters';
import { WEAPON_IDS } from '../content/equipment';
import { SHIELD_FALLBACK_CREDITS, SITES, SITE_FOOTPRINT, SITE_SCORE, siteMessage, sitePartChance } from '../content/sites';
import { SITE_IDS, VIEW, type Enemy, type Pickup, type RunState, type SiteId, type WeaponId } from '../shared/contracts';
import { fromFlightPlane, lensEye } from '../shared/lens';
import { groundSeat, runRoute } from '../world/run-route';
import { worldAt } from '../world/terrain';
import { coreSite, FORMATIONS } from '../content/formations';
import { MATCH_ROW, lineOfSightGround, projectGround } from './ground';
import { groundHeight, memberPosition } from './motion';

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
  // Campaign: every site rolls for one part (content/sites.ts sitePartChance), besides its own loot.
  const chance = campaign ? sitePartChance(id, state.planet) : null;
  if (chance !== null && partRoll(state, id, record.destroyed) < chance) drop('part', 1, 0.8);
  switch (kind) {
    case 'part':
      // The salvage yard and the sealed vault: their guaranteed parts, one pickup each, side by side. The parts sites'
      // single part is the roll above.
      if (definition.loot.value > 1) for (let i = 0; i < definition.loot.value; i++) drop('part', 1, (i - (definition.loot.value - 1) / 2) * 0.8);
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

/**
 * A destroyed site's part roll in [0, 1): its own stream (never the loot or combat streams, never Math.random), keyed by the
 * run seed, the sector, the site and how many sites the run had destroyed before it.
 */
function partRoll(state: RunState, id: SiteId, destroyed: number): number {
  let h = 0x70617274; // "part"
  for (const v of [state.config.seed, state.sector, SITE_IDS.indexOf(id), destroyed]) { h = Math.imul(h ^ (v >>> 0), 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; }
  return (h >>> 0) / 4294967296;
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
 * A site stands on the most even dry ground near its authored place. As a site's core spawns, the seat search (pure: the
 * run's terrain and the camera of that tick, never randomness) picks the centre whose footprint (SITE_FOOTPRINT) is
 * flattest, dry, low enough and close to the side route, and the floor level the site is built at. The core's track is
 * shifted so its line of sight lands there and the core rests on the site's floor (not the raw terrain under its centre),
 * so the model built around it and its gameplay position stay one point. The guard batteries keep exactly their authored
 * places and timing (the cue's fairness is untouched); the search only takes seats whose footprint stays clear of every
 * guard. The renderer stands the site on that floor and fills any drop under it with foundations (src/render/site-view.ts).
 */
/**
 * Search window around the authored centre on the ground: up to `inward` toward the map's centre or `outward` toward
 * its edge (never past `maxX`), and `back` toward the camera or `ahead` away from it. The window is small on purpose: the
 * core stays inside its guards' ring and near its authored time, so the guards defend it as authored and its loot falls
 * where the site's economy was measured (tests/sim/site-economy.test.ts; always searching wider let the core run ahead of
 * its guards and its part fall under their fire). The ring's inner and rear guards bound it anyway. Over heavy relief
 * SEAT_WIDE takes over. Seats that keep every guard battery of the cue GUARD_CLEARANCE outside the footprint are taken
 * first; any unevenness left is levelled by the render's site pad. Only side-route sites (|x| >= `side`) are moved.
 */
export const SEAT_SEARCH = { inward: .5, outward: 0, back: 3, ahead: .5, maxX: 9, side: 5 } as const;
/**
 * Only when the best seat in SEAT_SEARCH would straddle a cliff, a trench or a pit (`seatRough`; integrator, 30 October:
 * "moving out of the window is better than foundations spanning a canyon"): this wider window, 2 in and 7 back, taken if
 * it costs at least `gain` less. The core then stands nearer the camera than its guards' ring, so it comes into view
 * earlier; the guards keep their authored places and timing.
 */
export const SEAT_WIDE = { inward: 2, outward: 0, back: 7, ahead: .5, gain: .5 } as const;
type SeatWindow = { readonly inward: number; readonly outward: number; readonly back: number; readonly ahead: number };
/** A footprint over heavy relief: a large height spread, a deep drop under the floor or ground rising through it. */
export const seatRough = (seat: SiteSeat) => seat.spread > 1.5 || seat.drop > 2.5 || seat.above > .8;
/** Guard batteries stand at least this far outside a site's footprint (their own plinth, and a little ground between). */
export const GUARD_CLEARANCE = .3;
/** The core height the authored centre is solved with (the batteries' own). */
const SEAT_AIM = .85;
/** Sites prefer ground no higher than this (a tall site's core and roof must stay under the flight plane). */
const SEAT_HIGH = .8;
/**
 * …and a tall site lower still: its roof stands about 1.1 over its core, and stays CORE_CLEARANCE under the flight plane
 * there (the renderer must otherwise squash it, or sink a floating crystal's crown; integrator, 30 October: the prism
 * reactor's crown and crystal must read). The prism reactor (core 1.95) prefers ground under 0.3, the airfield 0.4.
 */
export const seatHigh = (core: number) => Math.min(SEAT_HIGH, VIEW.flightHeight - CORE_CLEARANCE - core - 1.1);
/** …and never higher than this unless nothing nearby is lower: the tallest core (1.95) must stay 0.45 under the flight plane. */
export const SEAT_LIMIT = 1.4;
/**
 * Each unit a seat moves the core toward the camera costs this much: a core moved ahead of its guards' ring is killed
 * before they stop firing, and its part falls under their fire (30 October: the airfield's part was lost in 6 of 10
 * Training runs, against 1 of 10 with the core where it was authored; with this cost, and the wide window kept for heavy
 * relief, 2 of 10).
 */
export const SEAT_BACK_COST = .5;
/** A site core's centre stays at least this far under the flight plane (docs/25 rule 3's roof clearance). */
export const CORE_CLEARANCE = .45;
/** The deepest drop under a site's floor its foundations fill (src/render/site-view.ts); the search keeps seats within it. */
export const SITE_DROP_MAX = 7;
export interface SiteSeat {
  /** The site's centre on the ground (world x, world s) and its floor level. */
  x: number; s: number; base: number;
  /** The footprint under it: ground spread (10th to 90th percentile), the most ground above the floor, the deepest drop
   * under it, the mean drop (the foundations' fill), and the share over open water. */
  spread: number; above: number; drop: number; fill: number; wet: number;
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
  const base = at(.95), fill = heights.reduce((sum, h) => sum + Math.max(0, base - h), 0) / heights.length;
  return { x, s, base, spread: at(.9) - at(.1), above: heights[heights.length - 1] - base, drop: base - heights[0], fill, wet: wet / heights.length };
}
function seatCost(state: RunState, seat: SiteSeat, dx: number, ds: number, high = SEAT_HIGH): number {
  const wet = WET_WORLDS.has(worldAt(runRoute(state.config), seat.s).planet.id) ? 0 : seat.wet;
  return seat.spread + 4 * seat.above + .25 * seat.drop + 2 * Math.max(0, seat.drop - (SITE_DROP_MAX - 2)) + 1.5 * seat.fill + 6 * wet + 3 * Math.max(0, seat.base - high)
    + 20 * Math.max(0, seat.base - SEAT_LIMIT) + .06 * Math.abs(dx) + .02 * Math.abs(ds) + SEAT_BACK_COST * Math.max(0, -ds);
}
/** Ground points (world x, s) a site must keep clear of: its cue's guard batteries. */
export type GuardSpot = { x: number; s: number };
/** How far guards stand inside a site's footprint grown by GUARD_CLEARANCE, centred at (x, s): 0 when all are clear. */
export function guardIntrusion(guards: readonly GuardSpot[], x: number, s: number): number {
  let sum = 0;
  for (const guard of guards) {
    const inX = SITE_FOOTPRINT.x + GUARD_CLEARANCE - Math.abs(guard.x - x);
    const inS = Math.min(guard.s - s - (SITE_FOOTPRINT.s[0] - GUARD_CLEARANCE), SITE_FOOTPRINT.s[1] + GUARD_CLEARANCE - (guard.s - s));
    if (inX > 0 && inS > 0) sum += Math.min(inX, inS);
  }
  return sum;
}
/** Whether a site centred at (x, s) keeps every guard GUARD_CLEARANCE outside its footprint. */
export const guardsClear = (guards: readonly GuardSpot[], x: number, s: number) => guardIntrusion(guards, x, s) <= 1e-9;
/** A guard on the footprint costs far more than any unevenness: the search takes a clear seat whenever one exists. */
const INTRUSION_COST = 40;
/**
 * Where the guard batteries of a site's cue will stand (world x, s): every ground slot of the site's guard on this world
 * (content/sites.ts), anchored as anchorGround anchors it. The core of a cue spawns with its guards (same anchor side, same
 * age), so `anchorX`, `mirror` and `age` are the core's.
 */
export function guardSpots(state: RunState, site: SiteId, anchorX: number, mirror: 1 | -1, age: number): GuardSpot[] {
  const side = Math.sign(anchorX) || 1, out: GuardSpot[] = [];
  for (const placement of SITES[site].guard[state.planet] ?? []) {
    const template = FORMATIONS[placement.formation];
    if (template.entry !== 'ground' || coreSite(template.id)) continue;
    const guardX = anchorX + side * (placement.x ?? 0), guardMirror = placement.mirror ? -mirror as 1 | -1 : mirror;
    template.slots.forEach((slot, index) => {
      const at = memberPosition({ template: template.id, slot: index, anchorX: guardX, mirror: guardMirror, group: 0 }, age);
      const ahead = at.s - MATCH_ROW, hit = lineOfSightGround(state, at.x, ahead, groundHeight(slot.kind));
      out.push({ x: hit.at.x, s: state.distance + ahead + hit.at.s });
    });
  }
  return out;
}
const seats = new WeakMap<RunState, { tick: number; key: string; seat: SiteSeat }>();
/**
 * The seat for a site whose centre is authored at gameplay `anchorX` on a ground track now at row `trackS`, clear of
 * `guards`, for a core `core` over the floor. The same inputs in the same tick give the same seat (cached: the sealed vault's seals share one).
 */
export function siteSeat(state: RunState, anchorX: number, trackS: number, guards: readonly GuardSpot[] = [], core = SEAT_AIM): SiteSeat {
  const key = `${anchorX.toFixed(4)}:${trackS.toFixed(4)}:${state.distance}:${state.cameraX}:${guards.length}:${core}`, cached = seats.get(state), high = seatHigh(core);
  if (cached && cached.tick === state.tick && cached.key === key) return cached.seat;
  const ahead = trackS - MATCH_ROW, nominal = lineOfSightGround(state, anchorX, ahead, SEAT_AIM);
  const x0 = nominal.at.x, s0 = state.distance + ahead + nominal.at.s, out = Math.sign(x0) || 1;
  // A camera far to the other side spreads the authored spot outward: the window then starts at maxX.
  const cx = out * Math.min(Math.abs(x0), SEAT_SEARCH.maxX);
  const cost = (seat: SiteSeat) => seatCost(state, seat, seat.x - x0, seat.s - s0, high) + INTRUSION_COST * guardIntrusion(guards, seat.x, seat.s);
  const search = (window: SeatWindow) => {
    const allowed = (x: number) => Math.abs(x) <= SEAT_SEARCH.maxX + 1e-9 && out * (x - cx) >= -window.inward - 1e-9 && out * (x - cx) <= window.outward + 1e-9;
    // Coarse: a 0.5 grid with a 5 × 6 footprint sample; fine: around the best, the full sample.
    let best = { cost: Infinity, x: cx, s: s0 };
    for (let dx = -window.inward; dx <= window.outward + 1e-9; dx += .5) for (let ds = -window.back; ds <= window.ahead + 1e-9; ds += .5) {
      const x = cx + out * dx, s = s0 + ds;
      if (!allowed(x)) continue;
      const c = cost(footprintGround(state, x, s, 5, 6));
      if (c < best.cost) best = { cost: c, x, s };
    }
    let seat = footprintGround(state, best.x, best.s), bestCost = Infinity;
    for (const fx of [-.25, 0, .25]) for (const fs of [-.25, 0, .25]) {
      const x = best.x + fx, s = Math.min(s0 + window.ahead, Math.max(s0 - window.back, best.s + fs));
      if (!allowed(x)) continue;
      const candidate = footprintGround(state, x, s), c = cost(candidate);
      if (c < bestCost) { bestCost = c; seat = candidate; }
    }
    return { seat, cost: bestCost };
  };
  let found = search(SEAT_SEARCH);
  // A seat that would straddle a cliff, a trench or a pit: the wider window, if it finds clearly better ground.
  if (seatRough(found.seat)) {
    const wide = search(SEAT_WIDE);
    if (wide.cost < found.cost - SEAT_WIDE.gain) found = wide;
  }
  seats.set(state, { tick: state.tick, key, seat: found.seat });
  return found.seat;
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
  // On ground higher than SEAT_LIMIT (nothing lower in reach) a tall site sinks into it: its core stays CORE_CLEARANCE
  // under the flight plane.
  const base = Math.min(seat.base, VIEW.flightHeight - CORE_CLEARANCE - core.groundHeight);
  const at = fromFlightPlane(state.cameraX, core.x, MATCH_ROW, base + core.groundHeight), dx = at.x - core.x, ds = at.s - MATCH_ROW;
  core.ground = { dx, ds, x: core.x + dx, s: core.s + ds, base, afloat: false, cameraX: state.cameraX };
  projectGround(state, core);
}
