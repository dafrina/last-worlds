import { BALANCE } from '../content/balance';
import { missionBoss } from '../content/bosses';
import type { EncounterCue } from '../content/encounters';
import { WEAPON_IDS } from '../content/equipment';
import { SHIELD_FALLBACK_CREDITS, SITES, SITE_SCORE, siteMessage } from '../content/sites';
import type { Enemy, Pickup, RunState, WeaponId } from '../shared/contracts';

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
