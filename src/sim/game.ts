import { BALANCE, BEAM_KINDS, DIFFICULTIES, ENEMIES, FAIRNESS, FUEL_BLAST, PULSAR_BURST, WORLD_INTENSITY, GROUND_KINDS, MISSION_CADENCE, PACE, THREAT_COST, WEAPONS, difficultyScales, kinematics, type DifficultyScale } from '../content/balance';
import { ALERT_LEAD, campaignPlaylist, cueAlert, cueRoster, endlessPlaylist, type EncounterCue, type FormationPlacement } from '../content/encounters';
import { STEP, VIEW, type Enemy, type InputFrame, type MissionId, type Projectile, type RunConfig, type RunState, type WeaponId } from '../shared/contracts';
import { approach, clamp, segmentCircleHit } from './geometry';
import { BOSSES, missionBoss } from '../content/bosses';
import { ENDLESS_CYCLE, endlessSectorPlan, isBossSector, paceInSector } from '../content/endless';
import { runPlanet } from '../content/missions';
import { REACTOR_IDS, SHIELD_IDS, SHIELD_TECH, SPECIALS, SPECIAL_IDS, STARTER, WEAPON_IDS, MAX_RANK, rankFireRate } from '../content/equipment';
import { updateEndless } from './endless';
import { arenaScroll, resolveBossPhase, startBoss, updateBoss } from './bastion';
import { spawnMembers } from './spawn';
import { FORMATIONS } from '../content/formations';
import { airspaceClear, airspaceConflict, liveGroups, plannedMembers, resolveAnchor } from './airspace';
import { DIAMOND_VOLLEY, SHOT_TTL, aimAtPlayer, beamSpec, diamondSide, enemyShots, pulsarBurst, type BulletKind } from './attacks';
import { admitAttack, playerKinematics } from './fairness';
import { BEAM_LOCK_RELEASE, advanceEnemy, aimOffset, enemyClockRate, inFiringWindow, pathComplete, positionAfter } from './motion';
import { projectGround } from './ground';
import { HUNTERS, absorbHunterShield, updateHunters } from './hunters';
import { updateWraith } from './wraith';

const DEG = Math.PI / 180;
const MUZZLE = 0.55;

export function createRun(config: RunConfig): RunState {
  // A canonical config prevents campaign menu choices from leaking into an endless replay.
  // Endless always flies the canonical starter; the campaign takes its loadout, falling back to the starter per slot.
  const pick = <T,>(value: T | undefined, allowed: readonly T[], fallback: T) => value !== undefined && allowed.includes(value) ? value : fallback;
  const normalized: RunConfig = config.mode === 'endless'
    ? { mode: 'endless', seed: config.seed >>> 0, difficulty: 'standard', ...STARTER, rank: 0 }
    : { mode: 'campaign', seed: config.seed >>> 0, difficulty: config.difficulty ?? 'standard', mission: config.mission ?? 'training',
      weapon: pick(config.weapon, WEAPON_IDS, STARTER.weapon), special: pick(config.special, SPECIAL_IDS, STARTER.special),
      shield: pick(config.shield, SHIELD_IDS, STARTER.shield), reactor: pick(config.reactor, REACTOR_IDS, STARTER.reactor),
      rank: Math.max(0, Math.min(MAX_RANK, Math.floor(config.rank ?? 0))) };
  const shieldTech = SHIELD_TECH[normalized.shield!];
  const pace = normalized.mode === 'endless' ? paceInSector(1, 0) : PACE.campaign;
  return {
    config: normalized, phase: 'playing', tick: 0, time: 0, distance: 0, sector: 1, cameraX: 0,
    pace, scrollSpeed: kinematics(pace).scroll, planet: runPlanet(normalized), jump: null, sectorStartedAt: 0,
    player: {
      x: 0, vx: 0, lives: normalized.mode === 'endless' ? 3 : DIFFICULTIES[normalized.difficulty!].lives,
      shields: shieldTech.charges, maxShields: shieldTech.charges,
      specialCharge: 1, invulnerableUntil: 0, lastHitAt: -100,
      weapon: normalized.weapon!, power: 0,
    },
    enemies: [], projectiles: [], hazards: [], pickups: [], effects: [],
    score: 0, kills: 0, credits: 0, livesLost: 0, specialsUsed: 0,
    nextId: 1, nextVolleyAt: 0, nextEncounterAt: 2, encounterIndex: 0,
    lootRng: ((config.seed >>> 0) ^ 0x9e3779b9) >>> 0,
    chargeKillTimes: [], boss: null, lance: null, shockwave: null,
    message: normalized.mode === 'endless' ? 'SECTOR 01 · LUNA' : MISSION_TITLES[normalized.mission ?? 'training'], messageUntil: 3,
  };
}

/** Simulation mutates only the supplied run. Call at fixed 60Hz, independent of rendering. */
export function stepRun(state: RunState, input: InputFrame, dt = STEP): void {
  if (state.phase !== 'playing') return;
  if (input.pausePressed) { state.phase = 'paused'; return; }
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05) throw new RangeError('Simulation step must be in (0, 0.05] seconds');
  const previousPlayerX = state.player.x;
  const previousTime = state.time;
  state.tick += 1;
  state.time += dt;
  updatePace(state, dt);
  movePlayer(state, input.horizontal, dt);
  updateDirector(state);
  updateShieldSupplies(state, previousTime);
  updateHunters(state, dt);
  updateEnemies(state, dt);
  updateBoss(state, dt);
  if (state.phase !== 'playing') return;
  if (input.specialPressed && state.player.specialCharge >= 1 - 1e-8) useSpecial(state);
  fireMain(state);
  updateLance(state, dt);
  updateShockwave(state);
  updateProjectiles(state, previousPlayerX, dt);
  resolveBossPhase(state);
  updateHazards(state, previousPlayerX, dt);
  updateContact(state, previousPlayerX);
  updatePickups(state, dt);
  updateResources(state, dt);
  state.enemies = state.enemies.filter(enemy => enemy.bossPart
    // A beam ship whose lane is still live stays until the beam ends, so the lane never outlives its source.
    || (enemy.hp > 0 && enemy.s > VIEW.minS - 2 && !(pathComplete(enemy) && !isVisible(state, enemy.x, enemy.s, -1) && !(enemy.lock && enemy.lock.hold > 0))));
  // Shooting a beam ship down ends its lane.
  if (state.hazards.some(hazard => hazard.source !== undefined)) {
    const alive = new Set(state.enemies.map(enemy => enemy.id));
    state.hazards = state.hazards.filter(hazard => hazard.source === undefined || alive.has(hazard.source));
  }
  state.effects = state.effects.filter(effect => (effect.ttl -= dt) > 0);
  // Boss missions end with extraction after the kill; the training sortie ends on time.
  if (state.phase === 'playing' && state.config.mode === 'campaign' && !missionBoss(state.config.mission) && state.time + 1e-8 >= BALANCE.campaignDuration) {
    state.phase = 'complete';
    state.message = 'MISSION COMPLETE';
    state.projectiles = [];
    state.hazards = [];
  }
}

/**
 * Pace and terrain scroll. Endless eases its pace up by sector; campaign flies pace 1. Rolling Thunder brings
 * the terrain to a stop for the Bastion-9 arena and resumes it for extraction (closed form, deterministic).
 */
function updatePace(state: RunState, dt: number): void {
  if (state.config.mode === 'endless') {
    // Endless: sector progression, closed-form scroll, bosses and the hyperdrive jump (docs/18).
    updateEndless(state, beginSector);
  } else if (missionBoss(state.config.mission)) {
    const destroyedAt = state.boss?.phase === 'destroyed' ? state.boss.phaseStartedAt : null;
    const scroll = arenaScroll(state.time, destroyedAt, missionBoss(state.config.mission)!.arena);
    state.pace = PACE.campaign;
    state.scrollSpeed = scroll.speed;
    state.distance = scroll.distance;
  } else {
    state.pace = PACE.campaign;
    state.scrollSpeed = kinematics(state.pace).scroll;
    state.distance += state.scrollSpeed * dt;
  }
}

function movePlayer(state: RunState, horizontal: -1 | 0 | 1, dt: number): void {
  const player = state.player;
  // Campaign handling follows the equipped reactor (campaign pace is 1); endless flies the Balanced Drive at its pace.
  const movement = playerKinematics(state);
  player.vx = approach(player.vx, horizontal * movement.speed, (horizontal === 0 ? movement.braking : movement.acceleration) * dt);
  const limit = VIEW.worldWidth / 2 - VIEW.playerRadius;
  player.x = clamp(player.x + player.vx * dt, -limit, limit);
  if (Math.abs(player.x) >= limit && Math.sign(player.vx) === Math.sign(player.x)) player.vx = 0;
  const offset = player.x - state.cameraX;
  let target = state.cameraX;
  if (Math.abs(offset) > BALANCE.camera.deadZone) target = player.x - Math.sign(offset) * BALANCE.camera.deadZone;
  const cameraLimit = (VIEW.worldWidth - VIEW.width) / 2;
  state.cameraX = approach(state.cameraX, clamp(target, -cameraLimit, cameraLimit), movement.camera * dt);
}

/** Starts an endless sector's playlist (called by the cycle driver when a sector begins). */
function beginSector(state: RunState): void {
  state.encounterIndex = 0;
  state.nextEncounterAt = state.sectorStartedAt + 2;
  setMessage(state, `SECTOR ${String(state.sector).padStart(2, '0')} · ${state.planet.toUpperCase()}`, 3);
}

const MISSION_TITLES: Readonly<Record<MissionId, string>> = {
  training: 'TRAINING · LUNA', bastion: 'ROLLING THUNDER · KHEPRI', 'deep-bloom': 'DEEP BLOOM · NACRE', 'cold-vector': 'COLD VECTOR · VESPER', 'brood-strike': 'BROOD STRIKE · AMNION',
  'final-horizon': 'FINAL HORIZON · UMBRA',
};

function updateDirector(state: RunState): void {
  const boss = state.config.mode === 'campaign' ? missionBoss(state.config.mission) : null;
  if (boss) {
    if (state.time + 1e-8 >= boss.arrivesAt) { startBoss(state); return; }
    if (state.time + 1e-8 >= boss.approachEndsAt || state.nextEncounterAt >= boss.approachEndsAt) {
      if (state.time >= boss.approachEndsAt && !state.boss && state.message !== boss.messages.approach) setMessage(state, boss.messages.approach, 6);
      return;
    }
  }
  const endless = state.config.mode === 'endless';
  // Endless boss sectors admit no ordinary cue once the approach ends, during the fight or the jump. A cue
  // the airspace or budget held back past the approach is dropped, exactly as in the campaign.
  if (endless && (state.boss || state.jump)) return;
  if (endless && isBossSector(state.sector)) {
    const def = BOSSES[endlessSectorPlan(state.sector).boss!];
    const approachEndsAt = state.sectorStartedAt + ENDLESS_CYCLE.bossSector.approachEndsAt;
    if (state.time + 1e-8 >= approachEndsAt || state.nextEncounterAt >= approachEndsAt) {
      if (state.time >= approachEndsAt && state.message !== def.messages.approach) setMessage(state, def.messages.approach, 6);
      return;
    }
  }
  const cues = endless ? endlessPlaylist(state.sector) : campaignPlaylist(state.config.mission ?? 'training');
  const start = endless ? state.sectorStartedAt : 0;
  const cue = cues[state.encounterIndex];
  if (cue) leadGround(state, cue);
  if (!cue || state.time + 1e-8 < state.nextEncounterAt) return;
  // Two-flank entries are announced first; a stale or overwritten alert is shown again in full.
  const alert = cueAlert(cue);
  if (alert && !(state.message === alert && state.time < state.messageUntil)) {
    setMessage(state, alert, ALERT_LEAD + 1.6);
    state.nextEncounterAt = state.time + ALERT_LEAD;
    return;
  }
  // Admit a complete authored group; never silently trim its composition. Surviving enemies count against
  // the live threat budget and the entity ceiling, so a late group waits instead of stacking.
  const scale = scales(state);
  // A cue whose ground formations already spawned ahead (leadGround) admits and spawns the rest of it now.
  const led = state.groundLead?.sector === state.sector && state.groundLead.index === state.encounterIndex;
  const rest: EncounterCue = led ? { ...cue, formations: cue.formations.filter(placement => !isGround(placement)) } : cue;
  if (!admits(state, rest, scale)) return;
  spawnCue(state, rest, scale);
  state.encounterIndex += 1;
  state.nextEncounterAt = cues[state.encounterIndex] ? start + cues[state.encounterIndex].at : Infinity;
}

/**
 * Admit a complete authored group: the live threat budget, the entity ceiling and a clear airspace. `timing` predicts
 * a cue whose ground formations spawn ahead (leadGround) as it will actually fly.
 */
function admits(state: RunState, cue: EncounterCue, scale: DifficultyScale, timing?: (placement: FormationPlacement) => { age: number; delay: number }): boolean {
  const roster = cueRoster(cue, scale.rank);
  // Hunters fly outside the authored encounters: they hold back no cue (their attacks still pass the fairness check).
  const alive = state.enemies.filter(enemy => enemy.hp > 0 && !enemy.bossPart && !enemy.hunter);
  const liveThreat = alive.reduce((sum, enemy) => sum + THREAT_COST[enemy.kind], 0);
  const cueThreat = roster.reduce((sum, kind) => sum + THREAT_COST[kind], 0);
  if (alive.length + roster.length > BALANCE.maxEnemies || liveThreat + cueThreat > scale.threatBudget) return false;
  // Squadrons never overlap: the cue waits until its airspace is clear.
  return airspaceClear(state, plannedMembers(state, cue.formations, scale.rank, timing));
}

/**
 * Ground formations spawn ahead (22 October): up to GROUND_LEAD units further along their own track than their authored
 * entry, so under the release lens a battery and its compound come into view from beyond the top edge instead of
 * appearing inside it. Their starting age puts them exactly at the authored entry at the cue's time, so everything on
 * screen keeps the authored timing; they cannot fire earlier (their firing windows are in the same age). The whole cue
 * is admitted now; the rest of it spawns at its time. A cue with an entry alert, one that is already due, or one that
 * is not admitted now spawns as before.
 */
const GROUND_LEAD = 7;
const isGround = (placement: FormationPlacement) => FORMATIONS[placement.formation].entry === 'ground';
function leadGround(state: RunState, cue: EncounterCue): void {
  if (state.groundLead?.sector === state.sector && state.groundLead.index === state.encounterIndex) return;
  const ground = cue.formations.filter(isGround);
  if (!ground.length || cueAlert(cue) || state.scrollSpeed <= 0.5) return;
  const early = state.nextEncounterAt - state.time;
  if (early <= 1e-8 || early > GROUND_LEAD / state.scrollSpeed) return;
  // The clock ground members run on: the scroll's share of the nominal speed (src/sim/motion.ts, enemyClockRate).
  const age = -early * state.scrollSpeed / VIEW.scrollSpeed, scale = scales(state);
  // The whole cue must be admitted as it will fly: the ground formations from now, further along their track, and the
  // rest of it from its time.
  if (!admits(state, cue, scale, placement => isGround(placement) ? { age, delay: 0 } : { age: 0, delay: early })) return;
  for (const placement of ground) spawnMembers(state, placement.formation, resolveAnchor(state, placement), placement.mirror ? -1 : 1, undefined, scale, age);
  state.groundLead = { sector: state.sector, index: state.encounterIndex };
}

function spawnCue(state: RunState, cue: EncounterCue, scale: DifficultyScale): void {
  for (const placement of cue.formations) spawnFormation(state, placement, scale);
  // Reserve one slot for the fixed shield-supply opportunity; never evict an existing drop.
  if (cue.pickup && state.pickups.length < BALANCE.maxPickups - 1) {
    state.pickups.push({ id: state.nextId++, ...cue.pickup, ttl: 12 });
  }
  if (cue.message) setMessage(state, cue.message, 3.5);
}

/** Spawns every member flying at this rank. View anchors resolve to the camera, clamped inside the map. */
export function spawnFormation(state: RunState, placement: FormationPlacement, scale: DifficultyScale = scales(state)): void {
  spawnMembers(state, placement.formation, resolveAnchor(state, placement), placement.mirror ? -1 : 1, undefined, scale);
}

function updateShieldSupplies(state: RunState, previousTime: number): void {
  const supplies = BALANCE.shieldSupplies;
  const times: readonly number[] = state.config.mode === 'campaign'
    ? (missionBoss(state.config.mission)?.shieldSupplies ?? supplies.campaign)[state.config.difficulty ?? 'standard']
    : [state.sectorStartedAt + supplies.endlessAt];
  for (const at of times) {
    // Match the director's floating-point tolerance on both sides of the crossing.
    // Active time never rewinds on respawn or resume, so no separate receipt is needed.
    if (previousTime + 1e-8 >= at || state.time + 1e-8 < at) continue;
    const halfView = VIEW.width / 2 - supplies.viewMargin;
    const left = state.cameraX - halfView;
    const right = state.cameraX + halfView;
    const candidates = [0, -2, 2, -4, 4].map(offset => clamp(state.player.x + offset, left, right));
    const marked = (x: number) => state.hazards.some(hazard => Math.abs(hazard.x - x) < hazard.width / 2 + 0.8)
      || state.enemies.some(enemy => enemy.hp > 0 && enemy.warning > 0 && Math.abs(enemy.aimX - x) < 1);
    const x = candidates.find(candidate => !marked(candidate)) ?? candidates[0];
    if (state.pickups.length < BALANCE.maxPickups) {
      state.pickups.push({ id: state.nextId++, kind: 'shield', x, s: supplies.forward, value: 1, ttl: 12 });
      setMessage(state, 'SHIELD CELL AHEAD', 2.5);
    }
  }
}

function missionCadence(state: RunState): number {
  return (state.config.mode === 'campaign' ? MISSION_CADENCE[state.config.mission ?? 'training'] : 1) * WORLD_INTENSITY[state.planet].cadence;
}

function scales(state: RunState) {
  return difficultyScales(state.config.mode, state.config.difficulty ?? 'standard', state.sector);
}

export function isVisible(state: RunState, x: number, s: number, margin = 0): boolean {
  return Math.abs(x - state.cameraX) <= VIEW.width / 2 - margin && s >= VIEW.minS + margin && s <= VIEW.maxS - margin;
}

/** Fully visible and above the attack floor. Windups that lose visibility are cancelled and restart in full. */
function canAttack(state: RunState, enemy: Enemy): boolean {
  return enemy.hp > 0 && enemy.s > 3.5 && isVisible(state, enemy.x, enemy.s, enemy.radius + 0.2);
}

function updateEnemies(state: RunState, dt: number): void {
  const scale = scales(state);
  let windups = state.enemies.reduce((count, enemy) => count + (enemy.hp > 0 && enemy.warning > 0 && !enemy.bossPart ? 1 : 0), 0);
  const resting = updateBeamRest(state, scale);
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || enemy.bossPart) continue;
    const stats = ENEMIES[enemy.kind];
    advanceEnemy(enemy, dt, enemyClockRate(state, enemy));
    if (enemy.kind === 'wraith') { windups += updateWraith(state, enemy, dt, scale, windups); continue; }
    // A ground enemy's anchor rides the terrain; its gameplay position is the anchor seen through the lens.
    projectGround(state, enemy);
    // A ground formation spawned ahead (leadGround) becomes a target at its authored entry.
    if (enemy.damageable === false && enemy.age > -1e-6) delete enemy.damageable;
    // Fuel skids are harmless loot: they ride the terrain and never wind up.
    if (enemy.kind === 'fuel') continue;
    if (!canAttack(state, enemy)) {
      if (enemy.warning > 0) { enemy.nextAttack = enemy.age + 0.6; windups -= 1; if (enemy.lock) enemy.lock.hold = 0; if (enemy.ground) enemy.ground.muzzle = undefined; }
      enemy.warning = 0;
      continue;
    }
    if (enemy.warning > 0) {
      enemy.warning = Math.max(0, enemy.warning - dt);
      if (enemy.warning === 0) {
        emitAttack(state, enemy, scale);
        // Hunters keep their own steady pace: the difficulty's, never the world's or mission's quickening (on Nacre, where
        // everything fires twice as often, a hunter on top of the Pulsar streams was too much).
        enemy.nextAttack = enemy.age + stats.attackEvery * scale.cadence * (enemy.hunter ? HUNTERS.cadence : missionCadence(state));
        windups -= 1;
      }
    } else if (enemy.age >= enemy.nextAttack && inFiringWindow(enemy) && state.time >= state.player.invulnerableUntil - 0.3) {
      // Readability caps: a bounded number of simultaneous windups and of marked beam lanes.
      if (windups >= scale.maxWindups) continue;
      // Hunters never wind up together: one hunter's attack at a time.
      if (enemy.hunter && state.enemies.some(other => other !== enemy && other.hunter && other.warning > 0)) { enemy.nextAttack = enemy.age + 0.4; continue; }
      // Needle beam rest: no new beam until the rest is over.
      if (resting && enemy.kind === 'needle') { enemy.nextAttack = enemy.age + 0.25; continue; }
      // Needle beams are narrow (0.4) and do not count against the wide-beam lane cap.
      if (enemy.kind === 'lancer' && state.hazards.filter(hazard => hazard.width >= beamSpec('lancer').width).length + state.enemies.filter(other => other.kind === 'lancer' && other.warning > 0).length >= scale.maxBeams) continue;
      // The aim commits now and never tracks afterwards: the player's x plus the authored bracket offset (a
      // Diamond adds its alternating wing side), or, for a missile battery, its own column. A Pulsar commits to the
      // player's x for fairness; its stream then tracks the player shot by shot (Projectile.track).
      const aimX = enemy.kind === 'missile' ? enemy.x : enemy.kind === 'pulsar' ? state.player.x
        : state.player.x + aimOffset(enemy) + (enemy.kind === 'diamond' ? diamondSide(enemy) * DIAMOND_VOLLEY.side : 0);
      const warning = stats.warning + scale.warning;
      // Director exclusion window: an attack that would break the hazard-union rules waits; it is never edited.
      if (!admitAttack(state, enemy, aimX, warning)) { enemy.nextAttack = enemy.age + FAIRNESS.retryDelay; continue; }
      // A beam ship swings over to its lane before firing: it waits while that swing would crowd another squadron.
      if (BEAM_KINDS.has(enemy.kind) && swingCrowds(state, enemy, aimX)) { enemy.nextAttack = enemy.age + FAIRNESS.retryDelay; continue; }
      enemy.aimX = aimX;
      enemy.warning = warning;
      // A ground enemy's attack leaves from the point the director forecast for it (src/sim/ground.ts).
      if (enemy.ground) enemy.ground.muzzle = positionAfter(enemy, warning, enemyClockRate(state, enemy));
      // Beam ships swing over their lane and fire straight down from it (see applyBeamLock).
      if (BEAM_KINDS.has(enemy.kind)) { const beam = beamSpec(enemy.kind); enemy.lock = { total: warning, hold: beam.warning + beam.active, release: BEAM_LOCK_RELEASE }; }
      windups += 1;
    }
  }
}

/**
 * Whether a beam ship's swing to its lane at `aimX` would break the airspace rules (separation or shared rows) with
 * another squadron: its squadron is tested with the ship over the lane, against every other live squadron.
 */
function swingCrowds(state: RunState, enemy: Enemy, aimX: number): boolean {
  const group = enemy.formation?.group;
  if (group === undefined) return false;
  const x = enemy.x;
  enemy.x = aimX;
  const groups = liveGroups(state);
  enemy.x = x;
  const mine = groups.get(group);
  return !!mine && [...groups].some(([id, other]) => id !== group && airspaceConflict(mine, other, 0.3));
}

/** Longest pause (s) that still counts as one continuous Needle barrage. */
const BEAM_GAP = 2.5;
/**
 * Needle beam rest: tracks Needle beam activity (windups and live narrow lanes; pauses under BEAM_GAP join one
 * barrage) and, once a barrage lasts `scale.beamRest.run` seconds, calls off pending Needle windups and holds new
 * ones for `rest` seconds.
 * Returns whether a rest is on.
 */
function updateBeamRest(state: RunState, scale: DifficultyScale): boolean {
  const rule = scale.beamRest;
  if (!rule) return false;
  const run = state.beamRun ??= { since: -1, last: -Infinity, restUntil: -Infinity };
  const needleWidth = beamSpec('needle').width;
  const beaming = state.enemies.some(enemy => enemy.kind === 'needle' && enemy.hp > 0 && enemy.warning > 0)
    || state.hazards.some(hazard => hazard.width <= needleWidth + 1e-9);
  if (beaming) {
    if (run.since < 0 || state.time - run.last > BEAM_GAP) run.since = state.time;
    run.last = state.time;
    if (state.time >= run.restUntil && state.time - run.since >= rule.run) {
      run.restUntil = state.time + rule.rest; run.since = -1;
      // Windups not yet fired are called off (as when an attacker loses its window), so the rest is a real pause.
      for (const enemy of state.enemies) if (enemy.kind === 'needle' && enemy.warning > 0) { enemy.warning = 0; enemy.nextAttack = enemy.age + rule.rest; if (enemy.lock) enemy.lock.hold = 0; }
    }
  }
  return state.time < run.restUntil;
}

function emitAttack(state: RunState, enemy: Enemy, scale: DifficultyScale): void {
  if (enemy.kind === 'pulsar') {
    // A rapid burst stream (emitted at once; each shot waits its turn at the muzzle, then aims at the player).
    const speed = ENEMIES.pulsar.shotSpeed * scale.shotSpeed * kinematics(state.pace).shot * WORLD_INTENSITY[state.planet].shot;
    const shots = pulsarBurst(enemy.x, enemy.s, state.player.x, speed, PULSAR_BURST.shots, PULSAR_BURST.interval);
    if (state.projectiles.length + shots.length > BALANCE.maxProjectiles) return;
    for (const shot of shots) state.projectiles.push({ ...projectile(state, shot.x, shot.s, shot.vx, shot.vs, false, 1, shot.radius, SHOT_TTL), delay: shot.delay, track: true, source: enemy.id });
    return;
  }
  if (BEAM_KINDS.has(enemy.kind)) {
    const beam = beamSpec(enemy.kind);
    state.hazards.push({ id: state.nextId++, x: enemy.aimX, width: beam.width, warning: beam.warning, active: beam.active, ttl: beam.warning + beam.active, source: enemy.id, ...(beam.cost ? { cost: beam.cost } : {}) });
    return;
  }
  const side = enemy.kind === 'diamond' ? diamondSide(enemy) : 0;
  enemy.volleys = (enemy.volleys ?? 0) + 1;
  const muzzle = enemy.ground?.muzzle ?? enemy;
  if (enemy.ground) enemy.ground.muzzle = undefined;
  const shots = enemyShots(enemy.kind as BulletKind, muzzle.x, muzzle.s, enemy.aimX, ENEMIES[enemy.kind].shotSpeed * scale.shotSpeed * kinematics(state.pace).shot * WORLD_INTENSITY[state.planet].shot, side);
  // A full projectile pool skips the whole volley; a fixed pattern is never trimmed bullet by bullet.
  if (state.projectiles.length + shots.length > BALANCE.maxProjectiles) return;
  for (const shot of shots) state.projectiles.push(projectile(state, shot.x, shot.s, shot.vx, shot.vs, false, 1, shot.radius, SHOT_TTL));
}

/** Uses emitted pellet paths for fixed guns; only the seeker has a cone and guidance. */
export function acquireTarget(state: RunState, weaponId = state.player.weapon): Enemy | undefined {
  const weapon = WEAPONS[weaponId];
  let best: Enemy | undefined;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || enemy.damageable === false || enemy.s <= MUZZLE || enemy.s - enemy.radius > weapon.range || !isVisible(state, enemy.x, enemy.s, enemy.radius)) continue;
    let eligible = false;
    if (weaponId === 'seeker') {
      eligible = Math.abs(enemy.x - state.player.x) <= Math.min(5.5, 0.5 + enemy.s * 0.3) + enemy.radius;
    } else {
      eligible = weapon.angles.some((angle, index) => {
        const x = state.player.x + weapon.offsets[index];
        return segmentCircleHit(x, MUZZLE, x + Math.sin(angle * DEG) * weapon.range, MUZZLE + Math.cos(angle * DEG) * weapon.range,
          enemy.x, enemy.s, enemy.radius + weapon.radius) !== null;
      });
    }
    // Armed enemies come first; a harmless fuel skid is targeted only when nothing armed is in the envelope.
    const rank = enemy.kind === 'fuel' ? 1 : 0, bestRank = best?.kind === 'fuel' ? 1 : 0;
    if (eligible && (!best || rank < bestRank || (rank === bestRank && (enemy.s < best.s || (enemy.s === best.s && enemy.id < best.id))))) best = enemy;
  }
  return best;
}

function fireMain(state: RunState): void {
  if (state.time + 1e-8 < state.nextVolleyAt) return;
  const target = acquireTarget(state);
  if (!target) return;
  const weapon = WEAPONS[state.player.weapon];
  if (state.projectiles.length + weapon.angles.length > BALANCE.maxProjectiles) return;
  const power = BALANCE.power[clamp(state.player.power, 0, BALANCE.power.length - 1)];
  weapon.angles.forEach((angle, index) => {
    const shot = projectile(state, state.player.x + weapon.offsets[index], MUZZLE,
      Math.sin(angle * DEG) * weapon.speed, Math.cos(angle * DEG) * weapon.speed,
      true, weapon.damage * power, weapon.radius, weapon.range / weapon.speed);
    shot.weapon = state.player.weapon;
    if (state.player.weapon === 'seeker') shot.homingTargetId = target.id;
    state.projectiles.push(shot);
  });
  // Campaign ranks raise the rate of fire (rank 3 doubles it).
  state.nextVolleyAt = state.time + weapon.cadence / (state.config.mode === 'campaign' ? rankFireRate(state.config.rank ?? 0) : 1);
}

function projectile(state: RunState, x: number, s: number, vx: number, vs: number, friendly: boolean, damage: number, radius: number, ttl: number): Projectile {
  return { id: state.nextId++, x, s, previousX: x, previousS: s, vx, vs, friendly, damage, radius, ttl };
}

function updateProjectiles(state: RunState, previousPlayerX: number, dt: number): void {
  for (const shot of state.projectiles) {
    if (shot.ttl <= 0) continue;
    shot.previousX = shot.x;
    shot.previousS = shot.s;
    // A burst shot waiting its turn at the muzzle neither moves nor hits.
    if (shot.delay && shot.delay > 0) {
      shot.delay = Math.max(0, shot.delay - dt);
      if (shot.delay === 0 && shot.track) aimAtPlayer(shot, state.player.x);
      continue;
    }
    const activeDt = Math.min(dt, shot.ttl);
    if (shot.special) steerMissile(state, shot, activeDt);
    else if (shot.homingTargetId !== undefined) {
      const target = state.enemies.find(enemy => enemy.id === shot.homingTargetId && enemy.hp > 0 && enemy.damageable !== false);
      if (target && isVisible(state, target.x, target.s, target.radius)) {
        const current = Math.atan2(shot.vx, shot.vs);
        const desired = Math.atan2(target.x - shot.x, target.s - shot.s);
        const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
        const next = current + clamp(delta, -2.8 * activeDt, 2.8 * activeDt);
        const speed = Math.hypot(shot.vx, shot.vs);
        shot.vx = Math.sin(next) * speed;
        shot.vs = Math.cos(next) * speed;
      }
    }
    shot.x += shot.vx * activeDt;
    shot.s += shot.vs * activeDt;
    shot.ttl -= dt;
    if (shot.friendly) {
      let target: Enemy | undefined;
      let first = Infinity;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || enemy.damageable === false) continue;
        const t = segmentCircleHit(shot.previousX, shot.previousS, shot.x, shot.s, enemy.x, enemy.s, enemy.radius + shot.radius);
        if (t !== null && (t < first || (t === first && enemy.id < (target?.id ?? Infinity)))) { target = enemy; first = t; }
      }
      if (target) {
        shot.ttl = 0;
        damageEnemy(state, target, shot.damage, !shot.special, shot.special ? undefined : shot.weapon);
        // Core destruction clears danger before later bullets in this same tick can hit.
        if (target.bossPart === 'core' && target.hp <= 0) resolveBossPhase(state);
      }
    } else if (segmentCircleHit(shot.previousX - previousPlayerX, shot.previousS,
      shot.x - (previousPlayerX + (state.player.x - previousPlayerX) * activeDt / dt), shot.s, 0, 0, VIEW.playerRadius + shot.radius) !== null) {
      shot.ttl = 0;
      hitPlayer(state, shot.damage);
    }
  }
  state.projectiles = state.projectiles.filter(shot => shot.ttl > 0 && Math.abs(shot.x) < VIEW.worldWidth / 2 + 10 && shot.s > VIEW.minS - 5 && shot.s < 35);
}

function updateHazards(state: RunState, previousPlayerX: number, dt: number): void {
  for (const hazard of state.hazards) {
    const warningBefore = hazard.warning;
    hazard.warning = Math.max(0, hazard.warning - dt);
    const activeTime = Math.max(0, dt - warningBefore);
    if (hazard.warning === 0 && hazard.active > 0 && activeTime > 0) {
      const radius = hazard.width / 2 + VIEW.playerRadius;
      if (Math.min(previousPlayerX, state.player.x) <= hazard.x + radius && Math.max(previousPlayerX, state.player.x) >= hazard.x - radius) hitPlayer(state, hazard.cost ?? 2);
      hazard.active = Math.max(0, hazard.active - activeTime);
    }
    hazard.ttl -= dt;
  }
  state.hazards = state.hazards.filter(hazard => hazard.ttl > 0 && (hazard.warning > 0 || hazard.active > 0));
}

function updateContact(state: RunState, previousPlayerX: number): void {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || GROUND_KINDS.has(enemy.kind)) continue;
    if (segmentCircleHit(previousPlayerX, 0, state.player.x, 0, enemy.x, enemy.s, enemy.radius + VIEW.playerRadius) !== null) hitPlayer(state, 2);
  }
}

export function hitPlayer(state: RunState, shieldCost: number): void {
  const player = state.player;
  if (state.phase !== 'playing' || state.time < player.invulnerableUntil) return;
  player.lastHitAt = state.time;
  if (player.shields > 0) {
    player.shields = Math.max(0, player.shields - shieldCost);
    player.invulnerableUntil = state.time + BALANCE.shield.hitInvulnerability;
    addEffect(state, 'shield', player.x, 0, 0.35);
    return;
  }
  player.lives -= 1;
  state.livesLost += 1;
  addEffect(state, 'explosion', player.x, 0, 0.6);
  if (player.lives <= 0) { state.phase = 'over'; state.message = 'FLIGHT LOST'; return; }
  // Shields are one pool for the whole run: a replacement life keeps whatever charges remain (normally none).
  // Only shield cells add charges.
  player.specialCharge = BALANCE.respawn.specialCharge;
  player.invulnerableUntil = state.time + BALANCE.respawn.invulnerability;
  state.projectiles = state.projectiles.filter(shot => shot.friendly || !isVisible(state, shot.x, shot.s));
  state.hazards = [];
  for (const enemy of state.enemies) { enemy.warning = 0; enemy.nextAttack = Math.max(enemy.nextAttack, enemy.age + BALANCE.respawn.invulnerability); }
  if (state.boss) {
    state.boss.attack = null; state.boss.attackerId = null; state.boss.nextAttackAt = state.time + BALANCE.respawn.invulnerability;
    state.boss.nextLaunchAt = Math.max(state.boss.nextLaunchAt, state.time + BALANCE.respawn.invulnerability);
  }
  if (state.config.mode === 'endless') player.power = Math.max(0, player.power - 1);
  setMessage(state, 'FIGHTER RESTORED', 2);
}

function damageEnemy(state: RunState, enemy: Enemy, damage: number, mainWeapon: boolean, weapon?: WeaponId): void {
  if (enemy.hp <= 0 || enemy.damageable === false) return;
  addEffect(state, 'hit', enemy.x, enemy.s, 0.12);
  // A hunter's shield takes the damage first.
  enemy.hp -= absorbHunterShield(enemy, damage, weapon);
  if (enemy.hp > 0) return;
  // A burst still waiting at its muzzle dies with its source (a Pulsar shot down mid-stream stops streaming).
  if (state.projectiles.some(shot => shot.source === enemy.id)) state.projectiles = state.projectiles.filter(shot => shot.source !== enemy.id || !((shot.delay ?? 0) > 0));
  state.kills += 1;
  const reward = enemy.hunter ? HUNTERS.reward : 1;
  state.score += enemy.bossPart ? (enemy.bossPart === 'core' ? 5000 : 500) : ENEMIES[enemy.kind].score * reward;
  addEffect(state, 'explosion', enemy.x, enemy.s, 0.5);
  if (mainWeapon) {
    state.chargeKillTimes = state.chargeKillTimes.filter(time => state.time - time < 1);
    if (state.chargeKillTimes.length < 3) {
      state.player.specialCharge = Math.min(1, state.player.specialCharge + BALANCE.special.killCharge);
      state.chargeKillTimes.push(state.time);
    }
  }
  if (!enemy.bossPart && state.pickups.length < BALANCE.maxPickups - 1) {
    state.pickups.push({ id: state.nextId++, kind: 'credit', x: enemy.x, s: enemy.s, value: ENEMIES[enemy.kind].credits * reward, ttl: 12 });
  }
  if (enemy.kind === 'fuel') {
    // The skid goes up: everything close by takes the blast, and other skids chain.
    addEffect(state, 'blast', enemy.x, enemy.s, 0.9);
    for (const other of state.enemies) {
      if (other === enemy || other.hp <= 0 || other.damageable === false) continue;
      if (Math.hypot(other.x - enemy.x, other.s - enemy.s) <= FUEL_BLAST.radius + other.radius * .5) damageEnemy(state, other, FUEL_BLAST.damage, false);
    }
  }
}

function useSpecial(state: RunState): void {
  state.player.specialCharge = 0;
  state.specialsUsed += 1;
  const special = state.config.special ?? 'shockwave';
  if (special === 'seeker-rack') return launchSeekerRack(state);
  if (special === 'siege-lance') {
    state.lance = { until: state.time + SPECIALS['siege-lance'].duration };
    setMessage(state, 'SIEGE LANCE', 1);
    return;
  }
  state.player.invulnerableUntil = Math.max(state.player.invulnerableUntil, state.time + BALANCE.special.invulnerability);
  // The ring bursts out from the ship (user request, 16 October 2026) and sweeps the view; see updateShockwave.
  state.shockwave = { x: state.player.x, s: 0, startedAt: state.time, hit: [], cameraX: state.cameraX };
  addEffect(state, 'special', state.player.x, 0, 0.6);
  updateShockwave(state);
  setMessage(state, 'SHOCKWAVE', 1);
}

/**
 * Shockwave: its ring grows from the ship at SPECIALS.shockwave.speed. Each target in the activation view takes 180
 * damage once as the ring reaches it, and each hostile shot there it reaches is cleared. It ends past `reach`.
 */
function updateShockwave(state: RunState): void {
  const wave = state.shockwave;
  if (!wave) return;
  const spec = SPECIALS.shockwave, radius = spec.speed * (state.time - wave.startedAt);
  // The footprint stays the view at activation (docs/02 §3): moving the camera never sweeps it across the map.
  const reached = (x: number, s: number, extra: number) => Math.hypot(x - wave.x, s - wave.s) <= radius + extra
    && Math.abs(x - wave.cameraX) <= VIEW.width / 2 && s >= VIEW.minS && s <= VIEW.maxS;
  const near = Math.min(radius, spec.clear);
  state.projectiles = state.projectiles.filter(shot => shot.friendly || Math.hypot(shot.x - wave.x, shot.s - wave.s) > near || !reached(shot.x, shot.s, 0));
  for (const enemy of state.enemies) {
    if (wave.hit.includes(enemy.id) || !reached(enemy.x, enemy.s, enemy.radius)) continue;
    wave.hit.push(enemy.id);
    // Full damage close to the ship, fading with distance.
    const distance = Math.max(0, Math.hypot(enemy.x - wave.x, enemy.s - wave.s) - enemy.radius);
    const share = Math.max(spec.minShare, Math.min(1, 1 - (distance - spec.full) / (spec.reach - spec.full) * (1 - spec.minShare)));
    damageEnemy(state, enemy, BALANCE.special.damage * share, false);
  }
  if (radius > spec.reach) state.shockwave = null;
}

/** Seeker Rack: fan out first, then home on targets distributed across the visible horizontal span. */
function launchSeekerRack(state: RunState): void {
  const rack = SPECIALS['seeker-rack'];
  const candidates = seekerTargets(state);
  // Sample the entire visible horizontal span, not just the nearest cluster.
  const ordered = candidates.sort((a, b) => a.x - b.x || a.s - b.s || a.id - b.id);
  const targets = ordered.length <= rack.missiles ? ordered : Array.from({ length: rack.missiles }, (_, i) => ordered[Math.round(i * (ordered.length - 1) / (rack.missiles - 1))]);
  for (let i = 0; i < rack.missiles; i++) {
    // Fanned out to both sides of the rack (±70°), alternating, so they peel away before turning in.
    const side = i % 2 ? 1 : -1, angle = side * (0.35 + Math.floor(i / 2) * 0.27);
    const shot = projectile(state, state.player.x + side * 0.3, 0.2, Math.sin(angle) * rack.launchSpeed, Math.cos(angle) * rack.launchSpeed, true, rack.damage, 0.18, 3);
    // Pair the leftmost launch with the leftmost target to avoid crossing the rack.
    const lane = side < 0 ? 3 - Math.floor(i / 2) : 4 + Math.floor(i / 2);
    if (targets.length) shot.homingTargetId = targets[Math.min(targets.length - 1, Math.floor(lane * targets.length / rack.missiles))].id;
    shot.spreadRemaining = rack.spreadTime;
    shot.special = true;
    state.projectiles.push(shot);
  }
  setMessage(state, 'SEEKER RACK', 1);
}

/**
 * A Seeker Rack missile: it leaves the rack slowly, fanned out, then accelerates to full speed and turns hard onto its
 * target. When its target is gone it prefers an unassigned visible target ahead, then distance, or flies straight on.
 */
function steerMissile(state: RunState, shot: Projectile, dt: number): void {
  const rack = SPECIALS['seeker-rack'];
  if ((shot.spreadRemaining ?? 0) > 0) { shot.spreadRemaining = Math.max(0, shot.spreadRemaining! - dt); return; }
  let target = state.enemies.find(enemy => enemy.id === shot.homingTargetId && enemy.hp > 0 && enemy.damageable !== false && isVisible(state, enemy.x, enemy.s, enemy.radius));
  if (!target) {
    target = seekerTargets(state).filter(enemy => enemy.s > shot.s - 1).sort((a, b) => {
      const assigned = (id: number) => state.projectiles.filter(other => other !== shot && other.special && other.ttl > 0 && other.homingTargetId === id).length;
      return assigned(a.id) - assigned(b.id) || Math.hypot(a.x - shot.x, a.s - shot.s) - Math.hypot(b.x - shot.x, b.s - shot.s) || a.id - b.id;
    })[0];
    shot.homingTargetId = target?.id;
  }
  const current = Math.atan2(shot.vx, shot.vs), desired = target ? Math.atan2(target.x - shot.x, target.s - shot.s) : 0;
  const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  const next = current + clamp(delta, -rack.turn * dt, rack.turn * dt), speed = Math.min(rack.speed, Math.hypot(shot.vx, shot.vs) + rack.accel * dt);
  shot.vx = Math.sin(next) * speed; shot.vs = Math.cos(next) * speed;
}
/** Visible damageable targets ahead of the ship, armed ones first, nearest first. */
function seekerTargets(state: RunState): Enemy[] {
  return state.enemies
    .filter(enemy => enemy.hp > 0 && enemy.damageable !== false && enemy.s > MUZZLE && isVisible(state, enemy.x, enemy.s, enemy.radius))
    .sort((a, b) => (a.kind === 'fuel' ? 1 : 0) - (b.kind === 'fuel' ? 1 : 0) || a.s - b.s || a.id - b.id);
}

/** Siege Lance: while active, its beam damages every target ahead whose body touches the lane over the ship. */
function updateLance(state: RunState, dt: number): void {
  if (!state.lance) return;
  if (state.time >= state.lance.until) { state.lance = null; return; }
  const lance = SPECIALS['siege-lance'];
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || enemy.damageable === false || enemy.s <= MUZZLE || !isVisible(state, enemy.x, enemy.s, 0)) continue;
    if (Math.abs(enemy.x - state.player.x) <= lance.width / 2 + enemy.radius) damageEnemy(state, enemy, lance.dps * dt, false);
  }
}

function updatePickups(state: RunState, dt: number): void {
  for (const pickup of state.pickups) {
    pickup.ttl -= dt;
    pickup.s -= BALANCE.pickup.speed * state.pace * dt;
    let distance = Math.hypot(pickup.x - state.player.x, pickup.s);
    if (pickup.kind !== 'weapon' && isVisible(state, pickup.x, pickup.s) && distance < BALANCE.pickup.magnetRadius && distance > 0.001) {
      const pull = Math.min(distance, BALANCE.pickup.magnetSpeed * state.pace * dt);
      pickup.x += (state.player.x - pickup.x) / distance * pull;
      pickup.s += -pickup.s / distance * pull;
      distance = Math.hypot(pickup.x - state.player.x, pickup.s);
    }
    if (distance > BALANCE.pickup.radius) continue;
    pickup.ttl = 0;
    addEffect(state, 'pickup', pickup.x, pickup.s, 0.3);
    switch (pickup.kind) {
      case 'shield':
        // A cell restores the shield technology's amount (Flux restores both of its charges).
        if (state.player.shields < state.player.maxShields) state.player.shields = Math.min(state.player.maxShields, state.player.shields + SHIELD_TECH[state.config.shield ?? 'standard'].cell);
        else if (state.config.mode === 'campaign') state.credits += 5;
        else state.score += 100;
        break;
      case 'credit':
        if (state.config.mode === 'campaign') state.credits += pickup.value;
        else state.score += 50;
        break;
      case 'power':
        if (state.config.mode === 'endless') givePower(state);
        break;
      case 'weapon':
        if (state.config.mode === 'endless' && pickup.weapon) {
          if (state.player.weapon === pickup.weapon) givePower(state);
          else { state.player.weapon = pickup.weapon; setMessage(state, `${WEAPONS[pickup.weapon].label.toUpperCase()} EQUIPPED`, 2.5); }
        }
        break;
    }
  }
  state.pickups = state.pickups.filter(pickup => pickup.ttl > 0 && pickup.s > VIEW.minS - 2);
}

function givePower(state: RunState): void {
  if (state.player.power < BALANCE.power.length - 1) state.player.power += 1;
  else state.score += 1000;
  setMessage(state, `WEAPON POWER ${state.player.power + 1}`, 2);
}

function updateResources(state: RunState, dt: number): void {
  if (state.phase !== 'playing') return;
  state.player.specialCharge = Math.min(1, state.player.specialCharge + dt / SPECIALS[state.config.special ?? 'shockwave'].recharge);
}

function addEffect(state: RunState, kind: RunState['effects'][number]['kind'], x: number, s: number, duration: number): void {
  if (state.effects.length >= BALANCE.maxEffects) state.effects.shift();
  state.effects.push({ id: state.nextId++, kind, x, s, ttl: duration, duration });
}

function setMessage(state: RunState, message: string, duration: number): void {
  state.message = message;
  state.messageUntil = state.time + duration;
}
