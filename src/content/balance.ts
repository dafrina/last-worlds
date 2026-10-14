import type { Difficulty, EnemyKind, WeaponId } from '../shared/contracts';

/** Authoritative tuning for the flight prototype. Full-release docs remain proposals. */
export const BALANCE = {
  campaignDuration: 120,
  sectorDuration: 90,
  maxEnemies: 24,
  maxProjectiles: 520,
  maxPickups: 40,
  maxEffects: 70,
  movement: { speed: 10, acceleration: 70, braking: 100 },
  camera: { deadZone: 2.5, speed: 14 },
  shield: { charges: 3, hitInvulnerability: 0.65 },
  shieldSupplies: {
    campaign: { relaxed: [40, 85], standard: [40, 85], veteran: [65] },
    endlessAt: 55,
    forward: 12,
    viewMargin: 1,
  },
  respawn: { invulnerability: 2, specialCharge: 0.5 },
  special: { rechargeTime: 45, killCharge: 0.03, damage: 180, invulnerability: 1 },
  pickup: { radius: 0.65, magnetRadius: 1.6, speed: 4 },
  power: [1, 1.15, 1.35, 1.55, 1.8],
} as const;

export const DIFFICULTIES: Record<Difficulty, { lives: number; hp: number; shotSpeed: number; warning: number }> = {
  relaxed: { lives: 5, hp: 0.85, shotSpeed: 0.85, warning: 0.25 },
  standard: { lives: 3, hp: 1, shotSpeed: 1, warning: 0 },
  veteran: { lives: 3, hp: 1.2, shotSpeed: 1.15, warning: 0 },
};

export const WEAPONS: Record<WeaponId, {
  label: string; cadence: number; speed: number; range: number;
  damage: number; radius: number; angles: readonly number[]; offsets: readonly number[];
}> = {
  pulse: { label: 'Twin Pulse', cadence: 0.125, speed: 30, range: 22, damage: 6, radius: 0.095, angles: [0, 0], offsets: [-0.2, 0.2] },
  fan: { label: 'Fan Cannon', cadence: 1 / 3, speed: 26, range: 18, damage: 5, radius: 0.11, angles: [-12, -6, 0, 6, 12], offsets: [0, 0, 0, 0, 0] },
  seeker: { label: 'Seeker Array', cadence: 0.48, speed: 19, range: 19, damage: 18, radius: 0.13, angles: [-5, 5], offsets: [-0.23, 0.23] },
};

export const ENEMIES: Record<EnemyKind, {
  hp: number; radius: number; speed: number; shotSpeed: number; attackEvery: number;
  warning: number; score: number; credits: number;
}> = {
  dart: { hp: 45, radius: 0.45, speed: 2.1, shotSpeed: 6.5, attackEvery: 3.2, warning: 0.85, score: 100, credits: 4 },
  weaver: { hp: 65, radius: 0.58, speed: 1.65, shotSpeed: 5.8, attackEvery: 3.6, warning: 0.9, score: 200, credits: 8 },
  turret: { hp: 90, radius: 0.62, speed: 4, shotSpeed: 6.2, attackEvery: 2.8, warning: 0.95, score: 250, credits: 10 },
  lancer: { hp: 100, radius: 0.46, speed: 1.25, shotSpeed: 6, attackEvery: 4.4, warning: 1.2, score: 400, credits: 16 },
};

export function difficultyScales(mode: 'campaign' | 'endless', difficulty: Difficulty, sector: number) {
  if (mode === 'campaign') return DIFFICULTIES[difficulty];
  return {
    lives: 3,
    hp: Math.min(1 + 0.06 * (sector - 1), 1.6),
    shotSpeed: Math.min(1 + 0.025 * (sector - 1), 1.25),
    warning: 0,
  };
}
