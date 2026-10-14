/** Shared prototype contract. Integrator owns this file; propose changes before editing. */
export type Mode = 'campaign' | 'endless';
export type Difficulty = 'relaxed' | 'standard' | 'veteran';
export type GraphicsQuality = 'high' | 'low';
export type WeaponId = 'pulse' | 'fan' | 'seeker';
export type RunPhase = 'playing' | 'paused' | 'over' | 'complete';
export type EnemyKind = 'dart' | 'weaver' | 'turret' | 'lancer';
export interface InputFrame { horizontal: -1 | 0 | 1; specialPressed: boolean; pausePressed: boolean }
export interface RunConfig { mode: Mode; seed: number; difficulty?: Difficulty; weapon?: WeaponId }
export interface Player {
  x: number; vx: number; lives: number; shields: number; maxShields: number;
  specialCharge: number; invulnerableUntil: number; lastHitAt: number;
  weapon: WeaponId; power: number;
}
export interface Enemy {
  id: number; kind: EnemyKind; x: number; s: number; originX: number;
  hp: number; maxHp: number; radius: number; age: number; nextAttack: number;
  warning: number; aimX: number; groundHeight: number;
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
}
export const VIEW = { width: 12, worldWidth: 36, sectionLength: 36, elevation: 55, flightHeight: 3, minS: -6.25, maxS: 19.8, playerRadius: 0.25, scrollSpeed: 4 } as const;
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
