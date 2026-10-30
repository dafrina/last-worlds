import { WARDEN } from '../../src/content/warden';
import { SPECIALS } from '../../src/content/equipment';
import { describe, expect, it } from 'vitest';
import { BALANCE, ENDLESS_RAMP, difficultyScales } from '../../src/content/balance';
import { resolvePlaylist } from '../../src/content/encounter-deck';
import { EMPTY_INPUT, STEP, VIEW, type Enemy, type RunState } from '../../src/shared/contracts';
import { acquireTarget, createRun, hitPlayer, stepRun } from '../../src/sim/game';
import { segmentCircleHit } from '../../src/sim/geometry';

const PLAYER_LIMIT = VIEW.worldWidth / 2 - VIEW.playerRadius;
const CAMERA_LIMIT = (VIEW.worldWidth - VIEW.width) / 2;

function quietRun(): RunState {
  const state = createRun({ mode: 'campaign', seed: 17 });
  state.encounterIndex = resolvePlaylist(state.config, 1, state.config.seed).length;
  state.nextEncounterAt = Infinity;
  return state;
}

function target(state: RunState, x = 0, s = 10, kind: Enemy['kind'] = 'dart'): Enemy {
  const enemy: Enemy = {
    id: state.nextId++, kind, x, s, originX: x, hp: 500, maxHp: 500,
    radius: 0.45, age: 0, nextAttack: Infinity, warning: 0, aimX: x,
    groundHeight: kind === 'turret' ? 0.85 : 3,
  };
  state.enemies.push(enemy);
  return enemy;
}

function advance(state: RunState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) stepRun(state, EMPTY_INPUT);
}

describe('weapon families and target acquisition', () => {
  it('does not emit into empty sky or at unseen, behind, or misaligned targets', () => {
    const state = quietRun();
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).toHaveLength(0);
    target(state, 7, 10);
    target(state, 0, -1);
    target(state, 3, 10);
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).toHaveLength(0);
  });

  it('keeps Pulse bolts straight even when the target is slightly offset', () => {
    const state = quietRun();
    target(state, 0.4);
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).toHaveLength(2);
    expect(state.projectiles.every(shot => shot.vx === 0 && shot.homingTargetId === undefined)).toBe(true);
    expect(state.projectiles.map(shot => shot.previousX)).toEqual([-0.2, 0.2]);
  });

  it('uses a fixed five-pellet fan and accepts only actual pellet paths', () => {
    const state = quietRun();
    state.player.weapon = 'fan';
    target(state, 1.8, 10);
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).toHaveLength(5);
    const angles = state.projectiles.map(shot => Math.atan2(shot.vx, shot.vs) * 180 / Math.PI);
    expect(angles.map(angle => Math.round(angle))).toEqual([-12, -6, 0, 6, 12]);
    expect(state.projectiles.every(shot => shot.homingTargetId === undefined)).toBe(true);
  });

  it('reserves wider acquisition and steering for the seeker family', () => {
    const state = quietRun();
    const enemy = target(state, 3, 12);
    expect(acquireTarget(state, 'pulse')).toBeUndefined();
    expect(acquireTarget(state, 'seeker')?.id).toBe(enemy.id);
    state.player.weapon = 'seeker';
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles.every(shot => shot.homingTargetId === enemy.id)).toBe(true);
    advance(state, 0.2);
    expect(state.projectiles.every(shot => shot.vx > 0)).toBe(true);
  });

  it('targets a ground proxy by the same logical geometry', () => {
    const state = quietRun();
    const turret = target(state, 0, 8, 'turret');
    expect(acquireTarget(state)?.id).toBe(turret.id);
    advance(state, 0.4);
    expect(turret.hp).toBeLessThan(turret.maxHp);
  });

  it('sweeps fast projectiles and hits the nearest blocking target', () => {
    const state = quietRun();
    state.nextVolleyAt = Infinity;
    const far = target(state, 0, 10);
    const near = target(state, 0, 5);
    state.projectiles.push({ id: state.nextId++, x: 0, s: 1, previousX: 0, previousS: 1, vx: 0, vs: 900, friendly: true, damage: 10, radius: 0.1, ttl: 1 });
    stepRun(state, EMPTY_INPUT);
    expect(near.hp).toBe(490);
    expect(far.hp).toBe(500);
    expect(state.projectiles).toHaveLength(0);
  });

  it('does not extend projectile range through the rest of a step after expiry', () => {
    const state = quietRun();
    state.nextVolleyAt = Infinity;
    const enemy = target(state, 0, 5);
    state.projectiles.push({ id: state.nextId++, x: 0, s: 1, previousX: 0, previousS: 1, vx: 0, vs: 900, friendly: true, damage: 10, radius: 0.1, ttl: 0.002 });
    stepRun(state, EMPTY_INPUT);
    expect(enemy.hp).toBe(500);
    expect(state.projectiles).toHaveLength(0);
  });
});

describe('lives, shield charges, and special', () => {
  it('breaking the last shield never spills into a life, and invulnerability prevents duplicate hits', () => {
    const state = quietRun();
    state.player.shields = 1;
    hitPlayer(state, 2);
    expect(state.player.shields).toBe(0);
    expect(state.player.lives).toBe(3);
    hitPlayer(state, 2);
    expect(state.player.lives).toBe(3);
    state.time = 1;
    hitPlayer(state, 1);
    expect(state.player.lives).toBe(2);
    // Shields are one pool for the run: the replacement life does not get them back.
    expect(state.player.shields).toBe(0);
    expect(state.player.specialCharge).toBe(0.5);
    expect(state.livesLost).toBe(1);
    // After the respawn protection, the very next hit costs another life.
    state.time = 3.5;
    hitPlayer(state, 1);
    expect(state.player.lives).toBe(1);
  });

  it('only a shield cell restores charges after a life is lost', () => {
    const state = quietRun();
    state.player.shields = 0;
    hitPlayer(state, 1);
    expect(state.player.shields).toBe(0);
    state.pickups.push({ id: state.nextId++, kind: 'shield', x: 0, s: 0.1, value: 1, ttl: 12 });
    stepRun(state, EMPTY_INPUT);
    expect(state.player.shields).toBe(1);
  });

  it('never restores shields merely by waiting without taking damage', () => {
    const state = quietRun();
    hitPlayer(state, 1);
    advance(state, 30);
    expect(state.player.shields).toBe(2);
  });

  it('ends on the final unshielded hit and cannot advance afterwards', () => {
    const state = quietRun();
    state.player.lives = 1;
    state.player.shields = 0;
    hitPlayer(state, 1);
    expect(state.phase).toBe('over');
    const before = structuredClone(state);
    stepRun(state, EMPTY_INPUT);
    expect(state).toEqual(before);
  });

  it('respawns in the current map region and loses endless power only', () => {
    const state = createRun({ mode: 'endless', seed: 1 });
    state.player.x = 11;
    state.cameraX = 8.5;
    state.player.shields = 0;
    state.player.weapon = 'fan';
    state.player.power = 2;
    hitPlayer(state, 1);
    expect(state.player.x).toBe(11);
    expect(state.cameraX).toBe(8.5);
    expect(state.player.power).toBe(1);
    expect(state.player.weapon).toBe('fan');
  });

  it('special affects only the activation viewport, and its kills grant no action recharge', () => {
    const state = quietRun();
    const visible = target(state, 0, 10);
    const unseen = target(state, 8, 10);
    visible.hp = 50;
    unseen.hp = 50;
    stepRun(state, { ...EMPTY_INPUT, specialPressed: true });
    // The ring expands from the ship; the camera moving meanwhile does not widen its footprint.
    state.cameraX = 8;
    for (let i = 0; i < 70; i++) stepRun(state, EMPTY_INPUT);
    expect(state.shockwave).toBeNull();
    expect(visible.hp).toBeLessThanOrEqual(0);
    expect(unseen.hp).toBe(50);
    expect(state.player.specialCharge).toBeCloseTo(71 * STEP / SPECIALS.shockwave.recharge);
    expect(state.specialsUsed).toBe(1);
    stepRun(state, { ...EMPTY_INPUT, specialPressed: true });
    expect(unseen.hp).toBe(50);
    expect(state.specialsUsed).toBe(1);
  });

  it('caps main-kill special recharge at nine percent within an active second', () => {
    const state = quietRun();
    state.player.specialCharge = 0;
    state.nextVolleyAt = Infinity;
    for (let i = 0; i < 5; i += 1) {
      target(state, -4 + i * 2, 8).hp = 1;
      state.projectiles.push({ id: state.nextId++, x: -4 + i * 2, s: 7, previousX: -4 + i * 2, previousS: 7, vx: 0, vs: 100, friendly: true, damage: 10, radius: 0.1, ttl: 1 });
    }
    stepRun(state, EMPTY_INPUT);
    expect(state.kills).toBe(5);
    expect(state.player.specialCharge).toBeCloseTo(0.09 + STEP / SPECIALS.shockwave.recharge);
  });
});

describe('rare shield-supply quotas', () => {
  function recordSupplies(state: RunState, seconds: number): { id: number; time: number; x: number }[] {
    const seen = new Set<number>();
    const supplies: { id: number; time: number; x: number }[] = [];
    state.player.invulnerableUntil = Infinity;
    state.nextVolleyAt = Infinity;
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
      stepRun(state, EMPTY_INPUT);
      for (const pickup of state.pickups) {
        if (pickup.kind !== 'shield' || seen.has(pickup.id)) continue;
        seen.add(pickup.id);
        supplies.push({ id: pickup.id, time: state.time, x: pickup.x });
      }
    }
    return supplies;
  }

  it.each(['relaxed', 'standard'] as const)('offers exactly two cells at 40s and 95s in %s training', difficulty => {
    const state = createRun({ mode: 'campaign', seed: 10, difficulty });
    const cells = recordSupplies(state, 120);
    expect(cells).toHaveLength(2);
    expect(cells[0].time).toBeCloseTo(40);
    expect(cells[1].time).toBeCloseTo(95);
  });

  it('offers exactly one Veteran training cell at 75s', () => {
    const cells = recordSupplies(createRun({ mode: 'campaign', seed: 10, difficulty: 'veteran' }), 120);
    expect(cells).toHaveLength(1);
    expect(cells[0].time).toBeCloseTo(75);
  });

  it('offers one endless cell per sector independently of campaign settings and seed', () => {
    const first = createRun({ mode: 'endless', seed: 10, difficulty: 'relaxed', weapon: 'fan' });
    const second = createRun({ mode: 'endless', seed: 99, difficulty: 'veteran', weapon: 'seeker' });
    const firstCells = recordSupplies(first, 400);
    const secondCells = recordSupplies(second, 400);
    expect(firstCells).toEqual(secondCells);
    // One cell 55 s into each sector. This pilot never fires, so it stays in the WARDEN-1 fight that closes the
    // Luna prologue (endless continues only after the kill), and the long fight earns no extra cell.
    expect(firstCells.map(cell => Math.round(cell.time))).toEqual([55]);
  });

  it('collecting a cell restores one charge, never a whole shield', () => {
    const state = quietRun();
    state.player.shields = 0;
    state.pickups.push({ id: state.nextId++, kind: 'shield', x: 0, s: 0.1, value: 1, ttl: 12 });
    stepRun(state, EMPTY_INPUT);
    expect(state.player.shields).toBe(1);
    advance(state, 10);
    expect(state.player.shields).toBe(1);
  });

  it('does not generate extra cells from enemy kills', () => {
    const state = quietRun();
    state.nextVolleyAt = Infinity;
    for (let i = 0; i < 100; i += 1) {
      target(state, 0, 8).hp = 1;
      state.projectiles.push({ id: state.nextId++, x: 0, s: 7, previousX: 0, previousS: 7, vx: 0, vs: 100, friendly: true, damage: 10, radius: 0.1, ttl: 1 });
      stepRun(state, EMPTY_INPUT);
    }
    expect(state.kills).toBe(100);
    expect(state.pickups.some(pickup => pickup.kind === 'shield')).toBe(false);
  });

  it('does not replay a supply after a respawn or resume at the supply timestamp', () => {
    const state = quietRun();
    state.time = 40 - STEP;
    stepRun(state, EMPTY_INPUT);
    const firstId = state.pickups.find(pickup => pickup.kind === 'shield')!.id;
    state.player.shields = 0;
    hitPlayer(state, 1);
    expect(state.player.lives).toBe(2);
    expect(state.player.shields).toBe(0);
    state.phase = 'paused';
    advance(state, 10);
    expect(state.time).toBeCloseTo(40);
    state.phase = 'playing';
    advance(state, 0.5);
    expect(state.pickups.filter(pickup => pickup.kind === 'shield').map(pickup => pickup.id)).toEqual([firstId]);
    const later = recordSupplies(state, 79.5).filter(cell => cell.id !== firstId);
    expect(later).toHaveLength(1);
    expect(later[0].time).toBeCloseTo(95);
  });

  it('places supplies ahead within the current view at both world edges', () => {
    for (const side of [-1, 1]) {
      const state = quietRun();
      state.player.x = side * PLAYER_LIMIT;
      state.cameraX = side * CAMERA_LIMIT;
      state.time = 40 - STEP;
      stepRun(state, EMPTY_INPUT);
      const cell = state.pickups.find(pickup => pickup.kind === 'shield')!;
      expect(Math.abs(cell.x - state.cameraX)).toBeLessThanOrEqual(5);
      expect(Math.abs(cell.x - state.player.x)).toBeLessThan(1);
      expect(cell.s).toBeGreaterThan(11.9);
    }
  });

  it('reserves pickup capacity for the scheduled opportunity', () => {
    const state = quietRun();
    state.time = 40 - STEP;
    for (let i = 0; i < BALANCE.maxPickups - 1; i += 1) {
      state.pickups.push({ id: state.nextId++, kind: 'credit', x: 8, s: 15, value: 4, ttl: 12 });
    }
    stepRun(state, EMPTY_INPUT);
    expect(state.pickups).toHaveLength(BALANCE.maxPickups);
    expect(state.pickups.filter(pickup => pickup.kind === 'shield')).toHaveLength(1);
  });
});

describe('wide world, scheduling, and mode boundaries', () => {
  it('travels beyond the viewport, follows the dead zone, and stops at true world bounds', () => {
    const state = quietRun();
    for (let i = 0; i < 180; i += 1) stepRun(state, { ...EMPTY_INPUT, horizontal: 1 });
    expect(state.player.x).toBe(PLAYER_LIMIT);
    expect(state.cameraX).toBe(CAMERA_LIMIT);
    expect(state.player.vx).toBe(0);
    for (let i = 0; i < 300; i += 1) stepRun(state, { ...EMPTY_INPUT, horizontal: -1 });
    expect(state.player.x).toBe(-PLAYER_LIMIT);
    expect(state.cameraX).toBe(-CAMERA_LIMIT);
  });

  it('pauses without advancing simulation or recharge', () => {
    const state = quietRun();
    stepRun(state, { ...EMPTY_INPUT, pausePressed: true });
    expect(state.phase).toBe('paused');
    const before = structuredClone(state);
    advance(state, 2);
    expect(state).toEqual(before);
  });

  it('canonicalizes endless starts independently of campaign settings', () => {
    const first = createRun({ mode: 'endless', seed: 77, difficulty: 'relaxed', weapon: 'seeker' });
    const second = createRun({ mode: 'endless', seed: 77, difficulty: 'veteran', weapon: 'fan' });
    expect(first).toEqual(second);
    for (let i = 0; i < 600; i += 1) {
      const input = { ...EMPTY_INPUT, horizontal: (i % 180 < 90 ? 1 : -1) as -1 | 1 };
      stepRun(first, input);
      stepRun(second, input);
    }
    expect(first).toEqual(second);
    expect(first.credits).toBe(0);
  });

  it('changes campaign lives by difficulty while retaining shared shield rules', () => {
    const relaxed = createRun({ mode: 'campaign', seed: 1, difficulty: 'relaxed' });
    const veteran = createRun({ mode: 'campaign', seed: 1, difficulty: 'veteran' });
    expect(relaxed.player.lives).toBe(5);
    expect(veteran.player.lives).toBe(3);
    expect(relaxed.player.shields).toBe(veteran.player.shields);
  });

  it('uses the same authored battles across world seeds', () => {
    const first = createRun({ mode: 'endless', seed: 1 });
    const second = createRun({ mode: 'endless', seed: 999 });
    first.nextVolleyAt = Infinity;
    second.nextVolleyAt = Infinity;
    advance(first, 12);
    advance(second, 12);
    expect(first.enemies).toEqual(second.enemies);
    expect(first.projectiles).toEqual(second.projectiles);
    expect(first.encounterIndex).toBe(second.encounterIndex);
  });

  it('does not start attacks unseen and requires a fresh warning after panning into view', () => {
    const state = quietRun();
    state.nextVolleyAt = Infinity;
    const enemy = target(state, 9, 18);
    enemy.nextAttack = 0;
    advance(state, 1);
    expect(enemy.warning).toBe(0);
    expect(state.projectiles).toHaveLength(0);
    state.player.x = 9;
    state.cameraX = 9;
    stepRun(state, EMPTY_INPUT);
    expect(enemy.warning).toBeGreaterThan(0.65);
    expect(state.projectiles).toHaveLength(0);
    advance(state, 0.5);
    expect(state.projectiles).toHaveLength(0);
    advance(state, 0.4);
    expect(state.projectiles.some(shot => !shot.friendly)).toBe(true);
  });

  it('retains fired projectiles when the camera moves away', () => {
    const state = quietRun();
    state.projectiles.push({ id: state.nextId++, x: -3, s: 10, previousX: -3, previousS: 10, vx: 0, vs: -5, friendly: false, damage: 1, radius: 0.1, ttl: 3 });
    state.cameraX = CAMERA_LIMIT;
    state.player.x = CAMERA_LIMIT + 2;
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0].s).toBeLessThan(10);
  });

  it('cancels a windup that leaves view and requires a complete fresh warning', () => {
    const state = quietRun();
    state.nextVolleyAt = Infinity;
    const enemy = target(state, 0, 18);
    enemy.nextAttack = 0;
    advance(state, 0.5);
    expect(enemy.warning).toBeGreaterThan(0);
    state.player.x = 12;
    state.cameraX = 10;
    advance(state, 1);
    expect(enemy.warning).toBe(0);
    expect(state.projectiles).toHaveLength(0);
    state.player.x = 0;
    state.cameraX = 0;
    stepRun(state, EMPTY_INPUT);
    expect(enemy.warning).toBeGreaterThan(0.65);
    expect(state.projectiles).toHaveLength(0);
  });

  it('keeps entity storage bounded across ten minutes of active endless combat', () => {
    const state = createRun({ mode: 'endless', seed: 600 });
    // Large test-only life reserve leaves every attack/collision system active for the soak.
    state.player.lives = 10000;
    const maxima = { enemies: 0, projectiles: 0, pickups: 0, effects: 0 };
    for (let i = 0; i < 36000; i += 1) {
      stepRun(state, { ...EMPTY_INPUT, horizontal: (Math.floor(i / 240) % 2 ? -1 : 1), specialPressed: i % 2700 === 0 });
      for (const key of ['enemies', 'projectiles', 'pickups', 'effects'] as const) maxima[key] = Math.max(maxima[key], state[key].length);
    }
    expect(state.phase).toBe('playing');
    // Endless continues only after a boss kill; this weaving ship beats WARDEN-1 but cannot finish Bastion-9, so
    // the soak spends its last minutes in the sector 4 boss fight.
    expect(state.sector).toBe(4);
    expect(state.boss?.id).toBe('bastion');
    expect(maxima.enemies).toBeLessThanOrEqual(BALANCE.maxEnemies);
    expect(maxima.projectiles).toBeLessThanOrEqual(BALANCE.maxProjectiles);
    expect(maxima.pickups).toBeLessThanOrEqual(BALANCE.maxPickups);
    expect(maxima.effects).toBeLessThanOrEqual(BALANCE.maxEffects);
    expect(state.nextId).toBeGreaterThan(300);
  });

  it('ends training with WARDEN-1 instead of a timer, and opens endless on Luna with the same boss', () => {
    const campaign = quietRun();
    advance(campaign, WARDEN.arrivesAt + 1);
    expect(campaign.phase).toBe('playing');
    expect(campaign.boss?.id).toBe('warden');
    const endless = createRun({ mode: 'endless', seed: 1 });
    endless.player.invulnerableUntil = Infinity;
    advance(endless, 180);
    expect(endless.phase).toBe('playing');
    expect(endless.planet).toBe('luna');
    expect(endless.sector).toBe(1);
    expect(endless.boss?.id).toBe('warden');
    // The endless ramp stops at its documented caps; warnings never shrink at any sector.
    expect(difficultyScales('endless', 'veteran', 100)).toMatchObject({
      hp: ENDLESS_RAMP.hp.cap, shotSpeed: ENDLESS_RAMP.shotSpeed.cap, cadence: ENDLESS_RAMP.cadence.floor, warning: 0,
    });
  });
});

describe('swept collision geometry', () => {
  it('handles tunneling, tangency, zero motion, and starting inside a collider', () => {
    expect(segmentCircleHit(0, 0, 0, 20, 0, 10, 1)).toBeCloseTo(0.45);
    expect(segmentCircleHit(0, 0, 0, 20, 1, 10, 1)).toBeCloseTo(0.5);
    expect(segmentCircleHit(0, 0, 0, 0, 0, 10, 1)).toBeNull();
    expect(segmentCircleHit(0, 0, 0, 20, 0, 0, 1)).toBe(0);
    expect(segmentCircleHit(0, 0, 0, 20, 2, 10, 1)).toBeNull();
  });
});
