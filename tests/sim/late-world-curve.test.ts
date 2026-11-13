import { expect, it } from 'vitest';
import { DIFFICULTIES, ENEMIES, FAIRNESS, MISSION_CADENCE, MISSION_PRESSURE, difficultyScales } from '../../src/content/balance';
import { MISSION_PLANET } from '../../src/content/missions';
import { FORMATIONS } from '../../src/content/formations';
import { EMPTY_INPUT, STEP } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { spawnMembers } from '../../src/sim/spawn';

const cases = [
  ['deep-bloom', 1, 1, .50], ['brood-strike', 1.10, .90, .46],
  ['dying-star', 1.15, .85, .43], ['final-horizon', 1.20, .80, .40],
] as const;

for (const mode of ['campaign', 'endless'] as const) {
  it.each(cases)(mode + ' applies the %s curve to the first windup and the next volley', (mission, hp, first, repeat) => {
    const state = createRun({ mode, mission, difficulty: 'standard', seed: 1 });
    state.planet = MISSION_PLANET[mission];
    state.sector = 6;
    state.nextEncounterAt = state.nextVolleyAt = Infinity;
    const scale = mode === 'campaign' ? DIFFICULTIES.standard : difficultyScales(mode, 'standard', state.sector);
    spawnMembers(state, 'arrow-3', 0, 1);
    const dart = state.enemies[0];
    state.enemies = [dart];
    expect(dart.maxHp).toBeCloseTo(ENEMIES.dart.hp * scale.hp * hp);
    // The campaign's late missions bring the first windup forward again and shorten it (MISSION_PRESSURE, docs/40).
    const pressure = mode === 'campaign' ? MISSION_PRESSURE[mission] : undefined;
    expect(dart.nextAttack).toBeCloseTo(FORMATIONS['arrow-3'].fireFrom * scale.firstAttack * scale.airFirstShot * first * (pressure?.firstAttack ?? 1));
    let windup = 0;
    for (let tick = 0; tick < 5 / STEP && !dart.volleys; tick++) {
      stepRun(state, EMPTY_INPUT);
      windup = Math.max(windup, dart.warning);
    }
    expect(windup).toBeCloseTo(Math.max(FAIRNESS.warningFloor, ENEMIES.dart.warning * (pressure?.windup ?? 1)));
    expect(dart.volleys).toBe(1);
    const missionFactor = mode === 'campaign' ? MISSION_CADENCE[mission] : 1;
    expect(dart.nextAttack - dart.age).toBeCloseTo(ENEMIES.dart.attackEvery * scale.cadence * missionFactor * repeat);
  });
}
