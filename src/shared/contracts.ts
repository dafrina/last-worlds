/** Shared prototype contract. Integrator owns this file; propose changes before editing. */
export type Mode = 'campaign' | 'endless';
export type Difficulty = 'relaxed' | 'standard' | 'veteran';
export type GraphicsQuality = 'high' | 'low';
export type WeaponId = 'pulse' | 'fan' | 'seeker';
export type MissionId = 'training' | 'bastion' | 'cold-vector';
/** Planets the world generator can build (docs/17 §2); missions select one, endless stays on Khepri. */
export type PlanetId = 'khepri' | 'vesper';
export type BossPart = 'left' | 'right' | 'core';
export interface BossState {
  phase: 'arrival' | 'batteries' | 'core' | 'overload' | 'destroyed';
  x: number; originX: number; s: number; startedAt: number; phaseStartedAt: number;
  nextAttackAt: number; attackIndex: number; attack: 'burst' | 'fan' | 'beam' | null;
  attackerId: number | null; deathEffectAt: number;
  /** Combat-plane velocity (units/s; s is relative to the player row). Ground-relative forward speed is vs + RunState.scrollSpeed. */
  vx: number; vs: number;
}
export type RunPhase = 'playing' | 'paused' | 'over' | 'complete';
export type EnemyKind = 'dart' | 'weaver' | 'turret' | 'lancer';
export interface InputFrame { horizontal: -1 | 0 | 1; specialPressed: boolean; pausePressed: boolean }
export interface RunConfig { mode: Mode; seed: number; difficulty?: Difficulty; weapon?: WeaponId; mission?: MissionId }
export interface Player {
  x: number; vx: number; lives: number; shields: number; maxShields: number;
  specialCharge: number; invulnerableUntil: number; lastHitAt: number;
  weapon: WeaponId; power: number;
}
/** Authored squadron membership. Motion and fire timing derive from the content template. */
export interface FormationMember { template: string; slot: number; anchorX: number; mirror: 1 | -1; group: number }
export interface Enemy {
  id: number; kind: EnemyKind; x: number; s: number; originX: number;
  hp: number; maxHp: number; radius: number; age: number; nextAttack: number;
  warning: number; aimX: number; groundHeight: number;
  bossPart?: BossPart; damageable?: boolean; formation?: FormationMember;
}
export interface Projectile {
  id: number; x: number; s: number; previousX: number; previousS: number;
  vx: number; vs: number; friendly: boolean; damage: number; radius: number;
  ttl: number; homingTargetId?: number;
}
export interface Hazard { id: number; x: number; width: number; warning: number; active: number; ttl: number }
export interface Pickup { id: number; kind: 'shield' | 'power' | 'weapon' | 'credit'; x: number; s: number; value: number; weapon?: WeaponId; ttl: number }
export interface Effect { id: number; kind: 'hit' | 'explosion' | 'special' | 'shield' | 'pickup'; x: number; s: number; ttl: number; duration: number }
export interface RunState {
  config: RunConfig; phase: RunPhase; tick: number; time: number; distance: number;
  sector: number; cameraX: number; player: Player; enemies: Enemy[];
  projectiles: Projectile[]; hazards: Hazard[]; pickups: Pickup[]; effects: Effect[];
  score: number; kills: number; credits: number; livesLost: number; specialsUsed: number;
  nextId: number; nextVolleyAt: number; nextEncounterAt: number; encounterIndex: number;
  lootRng: number; chargeKillTimes: number[]; message: string; messageUntil: number;
  boss: BossState | null;
  /** Current forward scroll of the terrain (units/s). Render and terrain streaming read this, not VIEW.scrollSpeed. */
  scrollSpeed: number;
  /** Kinematic pace: 1 is the campaign pace; endless ramps it by sector. Scales ship, enemy and camera motion. */
  pace: number;
}
export const VIEW = { width: 12, worldWidth: 30, sectionLength: 36, elevation: 55, flightHeight: 3.8, minS: -6.25, maxS: 19.8, playerRadius: 0.42, scrollSpeed: 5 } as const;
export const STEP = 1 / 60;
export const EMPTY_INPUT: InputFrame = { horizontal: 0, specialPressed: false, pausePressed: false };
export interface GameRenderer {
  render(state: RunState, alpha: number): void;
  resize(width: number, height: number): void;
  setQuality(quality: GraphicsQuality): void;
  dispose(): void;
}
export interface GameInput {
  sample(): InputFrame; clear(): void; dispose(): void;
}
export interface UiActions {
  start(config: RunConfig): void; pause(): void; resume(): void; quit(): void;
  setMuted(muted: boolean): void;
  setQuality(quality: GraphicsQuality): void;
}
export interface GameUi {
  canvas: HTMLCanvasElement; surface: HTMLElement; specialButton: HTMLButtonElement;
  update(state: RunState | null): void; showMenu(): void; showError(message: string): void;
  dispose(): void;
}
