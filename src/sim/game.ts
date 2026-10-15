import { BALANCE, BEAM_KINDS, DIFFICULTIES, ENEMIES, FAIRNESS, GROUND_KINDS, MISSION_CADENCE, PACE, THREAT_COST, WEAPONS, difficultyScales, kinematics, type DifficultyScale } from '../content/balance';
import { ALERT_LEAD, campaignPlaylist, cueAlert, cueRoster, endlessPlaylist, type EncounterCue, type FormationPlacement } from '../content/encounters';
import { STEP, VIEW, type Enemy, type InputFrame, type MissionId, type Projectile, type RunConfig, type RunState } from '../shared/contracts';
import { approach, clamp, segmentCircleHit } from './geometry';
import { BOSSES, missionBoss } from '../content/bosses';
import { ENDLESS_CYCLE, endlessSectorPlan, isBossSector, paceInSector } from '../content/endless';
import { runPlanet } from '../content/missions';
import { updateEndless } from './endless';
import { arenaScroll, resolveBossPhase, startBoss, updateBoss } from './bastion';
import { spawnMembers } from './spawn';
import { airspaceClear, plannedMembers, resolveAnchor } from './airspace';
import { DIAMOND_VOLLEY, SHOT_TTL, beamSpec, diamondSide, enemyShots, type BulletKind } from './attacks';
import { admitAttack } from './fairness';
import { advanceEnemy, aimOffset, enemyClockRate, inFiringWindow, pathComplete } from './motion';

const DEG = Math.PI / 180;
const MUZZLE = 0.55;

export function createRun(config: RunConfig): RunState {
  // A canonical config prevents campaign menu choices from leaking into an endless replay.
  const normalized: RunConfig = config.mode === 'endless'
    ? { mode: 'endless', seed: config.seed >>> 0, difficulty: 'standard', weapon: 'pulse' }
    : { mode: 'campaign', seed: config.seed >>> 0, difficulty: config.difficulty ?? 'standard', weapon: config.weapon ?? 'pulse', mission: config.mission ?? 'training' };
  const pace = normalized.mode === 'endless' ? paceInSector(1, 0) : PACE.campaign;
  return {
    config: normalized, phase: 'playing', tick: 0, time: 0, distance: 0, sector: 1, cameraX: 0,
    pace, scrollSpeed: kinematics(pace).scroll, planet: runPlanet(normalized), jump: null, sectorStartedAt: 0,
    player: {
      x: 0, vx: 0, lives: normalized.mode === 'endless' ? 3 : DIFFICULTIES[normalized.difficulty!].lives,
      shields: BALANCE.shield.charges, maxShields: BALANCE.shield.charges,
      specialCharge: 1, invulnerableUntil: 0, lastHitAt: -100,
      weapon: normalized.weapon!, power: 0,
    },
    enemies: [], projectiles: [], hazards: [], pickups: [], effects: [],
    score: 0, kills: 0, credits: 0, livesLost: 0, specialsUsed: 0,
    nextId: 1, nextVolleyAt: 0, nextEncounterAt: 2, encounterIndex: 0,
    lootRng: ((config.seed >>> 0) ^ 0x9e3779b9) >>> 0,
    chargeKillTimes: [], boss: null,
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
  updateEnemies(state, dt);
  updateBoss(state, dt);
  if (state.phase !== 'playing') return;
  if (input.specialPressed && state.player.specialCharge >= 1 - 1e-8) useSpecial(state);
  fireMain(state);
  updateProjectiles(state, previousPlayerX, dt);
  resolveBossPhase(state);
  updateHazards(state, previousPlayerX, dt);
  updateContact(state, previousPlayerX);
  updatePickups(state, dt);
  updateResources(state, dt);
  state.enemies = state.enemies.filter(enemy => enemy.bossPart
    || (enemy.hp > 0 && enemy.s > VIEW.minS - 2 && !(pathComplete(enemy) && !isVisible(state, enemy.x, enemy.s, -1))));
  state.effects = state.effects.filter(effect => (effect.ttl -= dt) > 0);
  // Boss missions end with extraction after the kill; the training sortie ends on time.
  if (state.phase === 'playing' && state.config.mode === 'campaign' && !missionBoss(state.config.mission) && state.time + 1e-8 >= BALANCE.campaignDuration) {
    state.phase = 'complete';
    state.message = 'SORTIE COMPLETE';
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
  const movement = kinematics(state.pace);
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
  training: 'TRAINING · LUNA', bastion: 'ROLLING THUNDER · KHEPRI', 'cold-vector': 'COLD VECTOR · VESPER',
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
  const roster = cueRoster(cue, scale.rank);
  const alive = state.enemies.filter(enemy => enemy.hp > 0 && !enemy.bossPart);
  const liveThreat = alive.reduce((sum, enemy) => sum + THREAT_COST[enemy.kind], 0);
  const cueThreat = roster.reduce((sum, kind) => sum + THREAT_COST[kind], 0);
  if (alive.length + roster.length > BALANCE.maxEnemies || liveThreat + cueThreat > scale.threatBudget) return;
  // Squadrons never overlap: the cue waits until its airspace is clear.
  if (!airspaceClear(state, plannedMembers(state, cue.formations, scale.rank))) return;
  spawnCue(state, cue, scale);
  state.encounterIndex += 1;
  state.nextEncounterAt = cues[state.encounterIndex] ? start + cues[state.encounterIndex].at : Infinity;
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
  return state.config.mode === 'campaign' ? MISSION_CADENCE[state.config.mission ?? 'training'] : 1;
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
    if (!canAttack(state, enemy)) {
      if (enemy.warning > 0) { enemy.nextAttack = enemy.age + 0.6; windups -= 1; }
      enemy.warning = 0;
      continue;
    }
    if (enemy.warning > 0) {
      enemy.warning = Math.max(0, enemy.warning - dt);
      if (enemy.warning === 0) {
        emitAttack(state, enemy, scale);
        enemy.nextAttack = enemy.age + stats.attackEvery * scale.cadence * missionCadence(state);
        windups -= 1;
      }
    } else if (enemy.age >= enemy.nextAttack && inFiringWindow(enemy) && state.time >= state.player.invulnerableUntil - 0.3) {
      // Readability caps: a bounded number of simultaneous windups and of marked beam lanes.
      if (windups >= scale.maxWindups) continue;
      // Needle beam rest: no new beam until the rest is over.
      if (resting && enemy.kind === 'needle') { enemy.nextAttack = enemy.age + 0.25; continue; }
      // Needle beams are narrow (0.4) and do not count against the wide-beam lane cap.
      if (enemy.kind === 'lancer' && state.hazards.filter(hazard => hazard.width >= beamSpec('lancer').width).length + state.enemies.filter(other => other.kind === 'lancer' && other.warning > 0).length >= scale.maxBeams) continue;
      // The aim commits now and never tracks afterwards: the player's x plus the authored bracket offset (a
      // Diamond adds its alternating wing side), or, for a missile battery, its own column.
      const aimX = enemy.kind === 'missile' ? enemy.x
        : state.player.x + aimOffset(enemy) + (enemy.kind === 'diamond' ? diamondSide(enemy) * DIAMOND_VOLLEY.side : 0);
      const warning = stats.warning + scale.warning;
      // Director exclusion window: an attack that would break the hazard-union rules waits; it is never edited.
      if (!admitAttack(state, enemy, aimX, warning)) { enemy.nextAttack = enemy.age + FAIRNESS.retryDelay; continue; }
      enemy.aimX = aimX;
      enemy.warning = warning;
      windups += 1;
    }
  }
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
      for (const enemy of state.enemies) if (enemy.kind === 'needle' && enemy.warning > 0) { enemy.warning = 0; enemy.nextAttack = enemy.age + rule.rest; }
    }
  }
  return state.time < run.restUntil;
}

function emitAttack(state: RunState, enemy: Enemy, scale: DifficultyScale): void {
  if (BEAM_KINDS.has(enemy.kind)) {
    const beam = beamSpec(enemy.kind);
    state.hazards.push({ id: state.nextId++, x: enemy.aimX, width: beam.width, warning: beam.warning, active: beam.active, ttl: beam.warning + beam.active, ...(beam.cost ? { cost: beam.cost } : {}) });
    return;
  }
  const side = enemy.kind === 'diamond' ? diamondSide(enemy) : 0;
  enemy.volleys = (enemy.volleys ?? 0) + 1;
  const shots = enemyShots(enemy.kind as BulletKind, enemy.x, enemy.s, enemy.aimX, ENEMIES[enemy.kind].shotSpeed * scale.shotSpeed * kinematics(state.pace).shot, side);
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
    if (eligible && (!best || enemy.s < best.s || (enemy.s === best.s && enemy.id < best.id))) best = enemy;
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
    if (state.player.weapon === 'seeker') shot.homingTargetId = target.id;
    state.projectiles.push(shot);
  });
  state.nextVolleyAt = state.time + weapon.cadence;
}

function projectile(state: RunState, x: number, s: number, vx: number, vs: number, friendly: boolean, damage: number, radius: number, ttl: number): Projectile {
  return { id: state.nextId++, x, s, previousX: x, previousS: s, vx, vs, friendly, damage, radius, ttl };
}

function updateProjectiles(state: RunState, previousPlayerX: number, dt: number): void {
  for (const shot of state.projectiles) {
    if (shot.ttl <= 0) continue;
    const activeDt = Math.min(dt, shot.ttl);
    shot.previousX = shot.x;
    shot.previousS = shot.s;
    if (shot.homingTargetId !== undefined) {
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
        damageEnemy(state, target, shot.damage, true);
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

function damageEnemy(state: RunState, enemy: Enemy, damage: number, mainWeapon: boolean): void {
  if (enemy.hp <= 0 || enemy.damageable === false) return;
  enemy.hp -= damage;
  addEffect(state, 'hit', enemy.x, enemy.s, 0.12);
  if (enemy.hp > 0) return;
  state.kills += 1;
  state.score += enemy.bossPart ? (enemy.bossPart === 'core' ? 5000 : 500) : ENEMIES[enemy.kind].score;
  addEffect(state, 'explosion', enemy.x, enemy.s, 0.5);
  if (mainWeapon) {
    state.chargeKillTimes = state.chargeKillTimes.filter(time => state.time - time < 1);
    if (state.chargeKillTimes.length < 3) {
      state.player.specialCharge = Math.min(1, state.player.specialCharge + BALANCE.special.killCharge);
      state.chargeKillTimes.push(state.time);
    }
  }
  if (!enemy.bossPart && state.pickups.length < BALANCE.maxPickups - 1) {
    state.pickups.push({ id: state.nextId++, kind: 'credit', x: enemy.x, s: enemy.s, value: ENEMIES[enemy.kind].credits, ttl: 12 });
  }
}

function useSpecial(state: RunState): void {
  state.player.specialCharge = 0;
  state.player.invulnerableUntil = Math.max(state.player.invulnerableUntil, state.time + BALANCE.special.invulnerability);
  state.specialsUsed += 1;
  const left = state.cameraX - VIEW.width / 2;
  const right = state.cameraX + VIEW.width / 2;
  const inside = (x: number, s: number) => x >= left && x <= right && s >= VIEW.minS && s <= VIEW.maxS;
  state.projectiles = state.projectiles.filter(shot => shot.friendly || !inside(shot.x, shot.s));
  for (const enemy of state.enemies) if (inside(enemy.x, enemy.s)) damageEnemy(state, enemy, BALANCE.special.damage, false);
  // The instantaneous world-space footprint cannot follow later camera movement.
  addEffect(state, 'special', state.cameraX, (VIEW.minS + VIEW.maxS) / 2, 0.6);
  setMessage(state, 'SHOCKWAVE', 1);
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
        if (state.player.shields < state.player.maxShields) state.player.shields += 1;
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
  state.player.specialCharge = Math.min(1, state.player.specialCharge + dt / BALANCE.special.rechargeTime);
}

function addEffect(state: RunState, kind: RunState['effects'][number]['kind'], x: number, s: number, duration: number): void {
  if (state.effects.length >= BALANCE.maxEffects) state.effects.shift();
  state.effects.push({ id: state.nextId++, kind, x, s, ttl: duration, duration });
}

function setMessage(state: RunState, message: string, duration: number): void {
  state.message = message;
  state.messageUntil = state.time + duration;
}
