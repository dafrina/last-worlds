/** Shared prototype contract. Integrator owns this file; propose changes before editing. */
export type Mode = 'campaign' | 'endless';
export type Difficulty = 'relaxed' | 'standard' | 'veteran';
export type GraphicsQuality = 'high' | 'low';
export type WeaponId = 'pulse' | 'fan' | 'seeker';
/** Campaign equipment slots besides the main weapon (docs/02 §3–4, src/content/equipment.ts). */
export type SpecialId = 'shockwave' | 'seeker-rack' | 'siege-lance';
export type ShieldTechId = 'standard' | 'bulwark' | 'flux';
export type ReactorId = 'balanced' | 'vector' | 'precision';
export type MissionId = 'training' | 'bastion' | 'deep-bloom' | 'cold-vector';
/** Planets the world generator can build (docs/17 §2); missions select one, endless stays on Khepri. */
export type PlanetId = 'khepri' | 'vesper' | 'luna' | 'nacre';
/** Boss modules. Bastion-9: batteries and core. Helion Ark: radiators (left/right) and bridge (core). */
export type BossPart = 'left' | 'right' | 'core';
export type BossId = 'bastion' | 'ark' | 'warden' | 'veil';
export interface BossState {
  /** World distance at the wreck's last update: it falls behind by the distance flown since (destroyed phase). */
  wreckDistance?: number;
  phase: 'arrival' | 'batteries' | 'core' | 'overload' | 'destroyed';
  x: number; originX: number; s: number; startedAt: number; phaseStartedAt: number;
  nextAttackAt: number; attackIndex: number; attack: 'burst' | 'fan' | 'beam' | 'spiral' | null;
  attackerId: number | null; deathEffectAt: number;
  /** Combat-plane velocity (units/s; s is relative to the player row). Ground-relative forward speed is vs + RunState.scrollSpeed. */
  vx: number; vs: number;
  /**
   * Which boss this is. Phases are shared: 'batteries' is the first module pair (Ark: radiators), 'core' the
   * main target (Ark: bridge), 'overload' its lane phase. `launchesLeft`/`nextLaunchAt` count the Ark's finite
   * Needle launches (zero and Infinity for Bastion-9).
   */
  id: BossId; launchesLeft: number; nextLaunchAt: number;
  /** The boss holds its sway while its own lanes charge and fire, so every lane stays under the part that fired it. */
  holdUntil?: number; heldFor?: number;
}
export type RunPhase = 'playing' | 'paused' | 'over' | 'complete';
/** Khepri: dart, weaver, turret (ground), lancer. Vesper: needle, diamond, missile (ground battery). */
/** `fuel` is a harmless ground loot target (a fuel-tank skid): it never attacks and drops what a ship drops. */
/** `pulsar` (Nacre, 17 October 2026) fires a rapid burst stream down one committed line. */
export type EnemyKind = 'dart' | 'weaver' | 'turret' | 'lancer' | 'needle' | 'diamond' | 'missile' | 'fuel' | 'pulsar';
export interface InputFrame { horizontal: -1 | 0 | 1; specialPressed: boolean; pausePressed: boolean }
/**
 * A run's setup. The campaign loadout (weapon, special, shield, reactor, rank of the main weapon) applies only to the
 * campaign; createRun gives every endless run the canonical starter.
 */
export interface RunConfig {
  mode: Mode; seed: number; difficulty?: Difficulty; weapon?: WeaponId; mission?: MissionId;
  special?: SpecialId; shield?: ShieldTechId; reactor?: ReactorId; rank?: number;
}
export interface Player {
  x: number; vx: number; lives: number; shields: number; maxShields: number;
  specialCharge: number; invulnerableUntil: number; lastHitAt: number;
  weapon: WeaponId; power: number;
}
/** Authored squadron membership. Motion and fire timing derive from the content template. */
/** `anchorS` shifts the template's forward keyframes (launches from a moving boss bay); zero when absent. */
export interface FormationMember { template: string; slot: number; anchorX: number; mirror: 1 | -1; group: number; anchorS?: number }
export interface Enemy {
  id: number; kind: EnemyKind; x: number; s: number; originX: number;
  hp: number; maxHp: number; radius: number; age: number; nextAttack: number;
  warning: number; aimX: number; groundHeight: number;
  bossPart?: BossPart; damageable?: boolean; formation?: FormationMember;
  /** Volleys released so far (the Diamond alternates its wing each volley). */
  volleys?: number;
  /**
   * Beam lock (Needle, Lancer): the ship swings over its committed lane during the windup, fires straight down from
   * it, holds while the beam is live, then eases back onto its path. Seconds: total windup, hold left, release left.
   */
  lock?: { total: number; hold: number; release: number };
}
export interface Projectile {
  id: number; x: number; s: number; previousX: number; previousS: number;
  vx: number; vs: number; friendly: boolean; damage: number; radius: number;
  ttl: number; homingTargetId?: number;
  /** Fired by a special (Seeker Rack): its kills never charge the special. */
  special?: boolean;
  /** Seconds it waits at its muzzle before flying (a Pulsar burst is emitted at once and streams out). */
  delay?: number;
}
/** `cost` is the shield charges an accepted hit takes (2, a heavy hit, when absent; a Needle's narrow beam costs 1). */
/** `source`: the enemy firing a ship beam; its lane ends when that ship goes down (boss lanes have none). */
export interface Hazard { id: number; x: number; width: number; warning: number; active: number; ttl: number; cost?: number; source?: number }
export interface Pickup { id: number; kind: 'shield' | 'power' | 'weapon' | 'credit'; x: number; s: number; value: number; weapon?: WeaponId; ttl: number }
export interface Effect { id: number; kind: 'hit' | 'explosion' | 'special' | 'shield' | 'pickup' | 'blast'; x: number; s: number; ttl: number; duration: number }
/** A hyperdrive jump between planets: about 3 s; the look switches at its midpoint (`startedAt + duration / 2`). */
export interface JumpState { startedAt: number; duration: number; from: PlanetId; to: PlanetId }
export interface RunState {
  config: RunConfig; phase: RunPhase; tick: number; time: number; distance: number;
  sector: number; cameraX: number; player: Player; enemies: Enemy[];
  projectiles: Projectile[]; hazards: Hazard[]; pickups: Pickup[]; effects: Effect[];
  score: number; kills: number; credits: number; livesLost: number; specialsUsed: number;
  nextId: number; nextVolleyAt: number; nextEncounterAt: number; encounterIndex: number;
  lootRng: number; chargeKillTimes: number[]; message: string; messageUntil: number;
  boss: BossState | null;
  /** Needle beam rest bookkeeping (difficulty `beamRest`): start of the current continuous beam run, last beam moment, rest end. */
  beamRun?: { since: number; last: number; restUntil: number };
  /** Current forward scroll of the terrain (units/s). Render and terrain streaming read this, not VIEW.scrollSpeed. */
  scrollSpeed: number;
  /** Kinematic pace: 1 is the campaign pace; endless ramps it by sector. Scales ship, enemy and camera motion. */
  pace: number;
  /** The planet the run is over now (endless cycles Khepri → Vesper → …; docs/18). Switches at the jump flash. */
  planet: PlanetId;
  /** The hyperdrive jump in progress, or null: no combat or hazards, the player invulnerable. */
  jump: JumpState | null;
  /** Active time at which the current endless sector began (0 in the campaign). */
  sectorStartedAt: number;
  /** Siege Lance in progress: its beam fires straight ahead from the ship until this active time. */
  lance?: { until: number } | null;
  /** Shockwave in progress: a ring expanding from where the ship fired it; `hit` lists targets it already struck. */
  shockwave?: { x: number; s: number; startedAt: number; hit: number[]; cameraX: number } | null;
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
  /** Where the hero ship is across the play surface (0 = left edge, 1 = right edge): steering is relative to it. */
  setAnchor?(fraction: number): void;
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
