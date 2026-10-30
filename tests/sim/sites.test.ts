import { describe, expect, it } from 'vitest';
import { BALANCE, DIFFICULTIES, FUEL_BLAST, GROUND_KINDS, THREAT_COST } from '../../src/content/balance';
import { cueRoster, type EncounterCue } from '../../src/content/encounters';
import { authoredKinds } from '../../src/content/encounter-deck';
import { FORMATIONS, siteCoreFormation } from '../../src/content/formations';
import { ENDLESS_PART_SCORE, SHIELD_FALLBACK_CREDITS, SITES, SITE_FOOTPRINT, SITE_SCORE, SITE_X, siteCue, sitePool } from '../../src/content/sites';
import { fromFlightPlane } from '../../src/shared/lens';
import { EMPTY_INPUT, SITE_IDS, VIEW, type EnemyKind, type PlanetId, type RunConfig, type RunState, type SiteId } from '../../src/shared/contracts';
import { createRun, spawnFormation, stepRun } from '../../src/sim/game';
import { enterSector } from './pilots';

const PLANETS: readonly PlanetId[] = ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'umbra'];
/** Every enemy kind the authored playlists already fly on a world (campaign missions and endless sectors). */
const worldKinds = new Map<PlanetId, Set<EnemyKind>>(PLANETS.map(planet => [planet, authoredKinds(planet)]));
const threat = (cue: EncounterCue) => cueRoster(cue, 'veteran').reduce((sum, kind) => sum + THREAT_COST[kind], 0);

/** A run with an empty sky: no authored cue will spawn (src/sim/game.ts updateDirector waits for nextEncounterAt). */
function quiet(config: RunConfig, sector = 1): RunState {
  const state = enterSector(createRun(config), sector);
  state.nextEncounterAt = Infinity;
  return state;
}
/** Spawns a site's whole cue (guard and core) as the director would. */
function spawnSite(state: RunState, id: SiteId, side: -1 | 1 = 1) {
  const cue = siteCue(id, side, state.time, state.planet);
  for (const placement of cue.formations) spawnFormation(state, placement);
  return cue;
}
const cores = (state: RunState) => state.enemies.filter(enemy => enemy.site && enemy.hp > 0);
/** Destroys every live core of the run's sites with one heavy friendly shot each (through the normal hit path). */
function breakCores(state: RunState) {
  for (const core of cores(state)) {
    core.age = Math.max(core.age, 0); delete core.damageable;
    state.projectiles.push({ id: state.nextId++, x: core.x, s: core.s - 0.3, previousX: core.x, previousS: core.s - 0.3, vx: 0, vs: 30, friendly: true, damage: 1e4, radius: 0.1, ttl: 1 });
  }
  stepRun(state, EMPTY_INPUT);
}
const drops = (state: RunState, kind: string) => state.pickups.filter(pickup => pickup.kind === kind);

describe('strike site content (docs/33 § 3)', () => {
  it('has the twelve sites, each with an authored guard on every one of its worlds that flies only that world\'s kinds', () => {
    expect(Object.keys(SITES).sort()).toEqual([...SITE_IDS].sort());
    for (const site of Object.values(SITES)) {
      for (const planet of site.worlds) {
        const guard = site.guard[planet];
        expect(guard?.length, `${site.id} on ${planet}`).toBeGreaterThan(0);
        for (const placement of guard!) for (const slot of FORMATIONS[placement.formation].slots) {
          expect(worldKinds.get(planet)!.has(slot.kind), `${site.id} on ${planet}: ${slot.kind}`).toBe(true);
        }
      }
    }
  });

  it('guards parts sites heavier than shield sites, and every site cue fits the lightest threat budget', () => {
    for (const planet of PLANETS) {
      const pool = sitePool(planet), cue = (id: SiteId) => siteCue(id, 1, 0, planet);
      const parts = pool.filter(site => site.loot.kind === 'part'), shields = pool.filter(site => site.loot.kind === 'shield');
      expect(parts.length, `${planet} has a parts site`).toBeGreaterThan(0);
      for (const site of pool) expect(threat(cue(site.id)), `${site.id} on ${planet}`).toBeLessThanOrEqual(DIFFICULTIES.relaxed.threatBudget);
      for (const heavy of parts) for (const light of shields) expect(threat(cue(heavy.id))).toBeGreaterThan(threat(cue(light.id)));
    }
    // The rare sites drop three parts and are drawn less often.
    for (const id of ['salvage-yard', 'sealed-vault'] as const) expect(SITES[id]).toMatchObject({ loot: { kind: 'part', value: 3 } });
    expect(SITES['salvage-yard'].weight).toBeLessThan(SITES.airfield.weight);
  });

  it('builds a complete cue: the guard and core world-anchored on the drawn side, and the site\'s own message', () => {
    const west = siteCue('airfield', -1, 41, 'khepri'), east = siteCue('airfield', 1, 41, 'khepri');
    expect(west).toMatchObject({ at: 41, phase: 'recovery', site: { id: 'airfield', side: -1 }, message: 'AIRFIELD · WEST · PARTS' });
    expect(east.message).toBe('AIRFIELD · EAST · PARTS');
    expect(siteCue('shield-depot', 1, 0, 'luna').message).toBe('SHIELD DEPOT · EAST · SHIELD · PARTS?'); // its part roll (user, 30 October)
    for (const cue of [west, east]) {
      expect(cue.formations.every(placement => placement.anchor === 'world')).toBe(true);
      const core = cue.formations.find(placement => placement.formation === siteCoreFormation('airfield'));
      expect(core?.x).toBe(cue.site!.side * SITE_X);
      // The airfield's flourish: it scrambles a dart pair.
      expect(cue.formations.some(placement => placement.formation === 'site-scramble')).toBe(true);
    }
    // Every member stays where the ship can line it up (inside the camera's reach, off the world edge).
    for (const site of Object.values(SITES)) for (const planet of site.worlds) for (const placement of siteCue(site.id, 1, 0, planet).formations) {
      for (const slot of FORMATIONS[placement.formation].slots) expect(Math.abs(placement.x! + slot.dx), `${site.id} ${placement.formation}`).toBeLessThanOrEqual(10.6);
    }
  });
});

describe('a site core in the simulation', () => {
  it('spawns as a harmless ground target with an explicit proxy, beyond the top edge, and never attacks', () => {
    const state = quiet({ mode: 'campaign', mission: 'bastion', difficulty: 'veteran', seed: 4 });
    spawnSite(state, 'crash-site');
    const [core] = cores(state);
    expect(core).toMatchObject({ site: 'crash-site', kind: 'fuel', radius: SITES['crash-site'].core.radius, hp: SITES['crash-site'].core.hp * DIFFICULTIES.veteran.hp });
    expect(GROUND_KINDS.has(core.kind) && core.ground).toBeTruthy();
    // Its layout (and the model drawn around it) scrolls in from beyond the top edge: the near edge of its footprint, on
    // its floor, is still past where the top edge's line of sight meets that floor (a seat on rough ground may stand up to
    // 7 nearer the camera than authored, src/sim/sites.ts SEAT_WIDE).
    const top = fromFlightPlane(state.cameraX, core.ground!.x, VIEW.maxS, core.ground!.base);
    expect(core.ground!.s + SITE_FOOTPRINT.s[0]).toBeGreaterThan(top.s);
    expect(core.s).toBeGreaterThan(VIEW.maxS + 3);
    let seen = false;
    for (let i = 0; i < 60 * 9 && cores(state).length; i++) {
      stepRun(state, EMPTY_INPUT);
      if (state.phase !== 'playing') break;
      seen ||= core.s < VIEW.maxS;
      expect(core.warning).toBe(0);
    }
    expect(seen).toBe(true);
    expect(state.projectiles.every(shot => shot.friendly || shot.source !== core.id)).toBe(true);
  });

  it('a campaign parts site drops its parts, which are counted for the attempt; nothing bursts like a fuel skid', () => {
    const state = quiet({ mode: 'campaign', mission: 'training', seed: 3 });
    spawnSite(state, 'salvage-yard', -1);
    for (let i = 0; i < 60 * 3; i++) stepRun(state, { ...EMPTY_INPUT });
    // A battery right beside the core (inside a fuel skid's blast) survives the core.
    const [core] = cores(state), score = state.score;
    const beside = { ...state.enemies.find(enemy => enemy.kind === 'turret')!, id: state.nextId++, x: core.x + 1, s: core.s, hp: 1000, ground: undefined, formation: undefined };
    state.enemies.push(beside);
    breakCores(state);
    expect(drops(state, 'part')).toHaveLength(3);
    expect(drops(state, 'part').every(pickup => pickup.value === 1)).toBe(true);
    expect(drops(state, 'credit')).toHaveLength(0);
    expect(state.sites).toMatchObject({ destroyed: 1 });
    expect(state.score - score).toBe(SITE_SCORE + 50);
    expect(Math.hypot(beside.x - core.x, beside.s - core.s)).toBeLessThan(FUEL_BLAST.radius);
    expect(beside.hp).toBe(1000);
    // Collected, they count for the attempt.
    for (const pickup of state.pickups) { pickup.x = state.player.x; pickup.s = 0.1; }
    stepRun(state, EMPTY_INPUT);
    expect(state.parts).toBe(3);
  });

  it('in endless a parts site drops a power cell and a score bonus instead, never a part', () => {
    const state = quiet({ mode: 'endless', seed: 3 }, 2);
    spawnSite(state, 'airfield');
    for (let i = 0; i < 60 * 3; i++) stepRun(state, EMPTY_INPUT);
    const score = state.score;
    breakCores(state);
    expect(drops(state, 'part')).toHaveLength(0);
    expect(drops(state, 'power')).toHaveLength(1);
    expect(state.score - score).toBe(SITE_SCORE + 50 + ENDLESS_PART_SCORE);
    for (const pickup of state.pickups) { pickup.x = state.player.x; pickup.s = 0.1; }
    stepRun(state, EMPTY_INPUT);
    expect(state.parts ?? 0).toBe(0);
    expect(state.player.power).toBe(1);
  });

  it('pays credits or a weapon per site and mode; the sealed vault opens only with its last seal', () => {
    const relay = quiet({ mode: 'campaign', mission: 'brood-strike', seed: 3 });
    spawnSite(relay, 'relay-station'); for (let i = 0; i < 180; i++) stepRun(relay, EMPTY_INPUT); breakCores(relay);
    expect(drops(relay, 'credit').map(pickup => pickup.value)).toEqual([SITES['relay-station'].loot.value]);
    const freight = quiet({ mode: 'endless', seed: 3 }, 2);
    spawnSite(freight, 'freight-terminal'); for (let i = 0; i < 180; i++) stepRun(freight, EMPTY_INPUT); breakCores(freight);
    expect(drops(freight, 'weapon').map(pickup => pickup.weapon)).toEqual(['fan']);
    const vault = quiet({ mode: 'campaign', mission: 'final-horizon', seed: 3 });
    spawnSite(vault, 'sealed-vault'); for (let i = 0; i < 180; i++) stepRun(vault, EMPTY_INPUT);
    const seals = cores(vault);
    expect(seals).toHaveLength(3);
    const last = seals.pop()!;
    for (const seal of seals) seal.hp = 0;
    const others = vault.enemies.filter(enemy => enemy !== last);
    vault.enemies = [last, ...others.filter(enemy => !enemy.site)];
    breakCores(vault);
    expect(drops(vault, 'part')).toHaveLength(3);
    expect(vault.sites?.destroyed).toBe(1);
  });
});

describe('shield sites inside the shield-supply budget (invariant 11)', () => {
  /** Shield cells a run produced: site drops and budgeted supplies, counted as they appear. */
  function flyCounting(state: RunState, until: number, onTick?: (state: RunState) => void) {
    const seen = new Set<number>();
    let cells = 0;
    while (state.time < until && state.phase === 'playing') {
      onTick?.(state);
      stepRun(state, EMPTY_INPUT);
      state.player.invulnerableUntil = Infinity;
      for (const pickup of state.pickups) if (pickup.kind === 'shield' && !seen.has(pickup.id)) { seen.add(pickup.id); cells += 1; }
    }
    return cells;
  }

  it('campaign: each shield site takes the next budgeted supply, and once the budget is spent it pays credits', () => {
    const budget = BALANCE.shieldSupplies.campaign.standard; // Training: [40, 95] (WARDEN-1's schedule)
    const state = quiet({ mode: 'campaign', mission: 'training', difficulty: 'standard', seed: 8 });
    const at = [10, 50, 100], credits: number[] = [];
    let next = 0;
    const cells = flyCounting(state, 110, s => {
      if (next < at.length && s.time >= at[next]) {
        spawnSite(s, 'shield-depot');
        for (let i = 0; i < 120; i++) stepRun(s, EMPTY_INPUT);
        breakCores(s);
        credits.push(drops(s, 'credit').filter(pickup => pickup.value === SHIELD_FALLBACK_CREDITS).length);
        s.pickups = s.pickups.filter(pickup => pickup.kind === 'shield');
        next += 1;
      }
    });
    expect(next).toBe(3);
    expect(cells).toBe(budget.length);
    expect(state.sites?.shieldClaims).toEqual(['1:0', '1:1']);
    expect(credits).toEqual([0, 0, 1]);
  });

  it('endless: a shield site after its sector\'s supply takes the next sector\'s, which is then skipped', () => {
    const state = quiet({ mode: 'endless', seed: 8 }, 2);
    const start = state.sectorStartedAt;
    // After this sector's supply (sector start + 55 s).
    let cells = flyCounting(state, start + BALANCE.shieldSupplies.endlessAt + 2);
    expect(cells).toBe(1);
    state.pickups = [];
    spawnSite(state, 'shield-depot');
    for (let i = 0; i < 120; i++) stepRun(state, EMPTY_INPUT);
    breakCores(state);
    expect(drops(state, 'shield')).toHaveLength(1);
    expect(state.sites?.shieldClaims).toEqual([`${state.sector + 1}:0`]);
    // The next sector's supply never comes.
    const sector = state.sector;
    state.pickups = [];
    cells = flyCounting(state, start + BALANCE.sectorDuration + BALANCE.shieldSupplies.endlessAt + 2);
    expect(state.sector).toBe(sector + 1);
    expect(cells).toBe(0);
  });
});
