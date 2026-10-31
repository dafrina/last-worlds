/** Shared prototype contract. Integrator owns this file; propose changes before editing. */
export type Mode = 'campaign' | 'endless';
export type Difficulty = 'relaxed' | 'standard' | 'veteran';
export type GraphicsQuality = 'high' | 'low';
export type WeaponId = 'pulse' | 'fan' | 'seeker' | 'rail';
/** Campaign equipment slots besides the main weapon (docs/02 §3–4, src/content/equipment.ts). */
export type SpecialId = 'shockwave' | 'seeker-rack' | 'siege-lance' | 'gravity-well';
export type ShieldTechId = 'standard' | 'bulwark' | 'aegis';
export type ShipId = 'scrapper' | 'ironclad' | 'interceptor' | 'spectre';
export type MissionId = 'training' | 'bastion' | 'deep-bloom' | 'cold-vector' | 'brood-strike' | 'final-horizon';
/** Planets the world generator can build (docs/17 §2); missions select one, endless stays on Khepri. */
export type PlanetId = 'khepri' | 'vesper' | 'luna' | 'nacre' | 'amnion' | 'umbra';
/**
 * Boss modules. Bastion-9: batteries and core. Helion Ark: radiators (left/right) and bridge (core). `prow` is an optional
 * third first-phase module that only THE ECLIPSE has (its prow vent, user, 31 October); every other boss has none.
 */
export type BossPart = 'left' | 'right' | 'core' | 'prow';
export type BossId = 'bastion' | 'ark' | 'warden' | 'veil' | 'cradle' | 'eclipse';
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
/** Strike sites (docs/33): optional side-route targets, one model each with a finish per world. */
export const SITE_IDS = ['crash-site', 'airfield', 'salvage-yard', 'shield-depot', 'relay-station', 'freight-terminal',
  'dark-spaceport', 'prism-reactor', 'sealed-vault', 'gate-ring', 'brood-hive', 'spawning-pool'] as const;
export type SiteId = (typeof SITE_IDS)[number];
export type EnemyKind = 'dart' | 'weaver' | 'turret' | 'lancer' | 'needle' | 'diamond' | 'missile' | 'fuel' | 'pulsar' | 'wraith';
export interface InputFrame { horizontal: -1 | 0 | 1; specialPressed: boolean; pausePressed: boolean; dashPressed?: -1 | 1 }
/**
 * A run's setup. The campaign loadout (weapon, special, shield, ship, rank of the main weapon) applies only to the
 * campaign; createRun gives endless starter equipment and the selected chassis perk.
 */
/** Modular hero ships (docs/31): four visual part slots, three designs each, mixed within one chassis. */
export type HeroSlot = 'hull' | 'wings' | 'engines' | 'cockpit';
export type HeroDesign = 'a' | 'b' | 'c' | 'd' | 'e';
/** How the player built a chassis: one design per slot, and optional paint (sRGB hex). Cosmetic only. */
export interface HeroLook { parts: Record<HeroSlot, HeroDesign>; paint?: { primary?: number; secondary?: number; glow?: number } }
export interface RunConfig {
  mode: Mode; seed: number; difficulty?: Difficulty; weapon?: WeaponId; mission?: MissionId;
  special?: SpecialId; shield?: ShieldTechId; ship?: ShipId; rank?: number;
  /**
   * The ship's look (cosmetic: the simulation never reads it): the campaign chassis's in the campaign; in endless the
   * equipped chassis's modular parts and paint. Parts/paint are cosmetic; chassis perks work in both modes.
   */
  hero?: HeroLook;
  /**
   * Endless launch chassis (from the equipped ship). createRun copies it to `ship` for its global perk;
   * main/special/shield equipment and weapon tier still use the canonical starter.
   */
  heroShip?: ShipId;
}
export interface Player {
  /** The Interceptor's last sidestep (src/sim/ship-perks.ts): when and which way, from where. */
  dash?: { startedAt: number; direction: -1 | 1; fromX: number };
  dashReadyAt?: number;
  reflectReadyAt?: number;
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
  /** A strike site's core target (docs/33): its death drops the site's loot. */
  site?: SiteId;
  /**
   * A ground enemy's anchor on the terrain (src/shared/lens.ts; 21 October): fixed in the world, it scrolls with the
   * ground, and its gameplay position (x, s) is where the lens's line of sight through its core crosses the flight plane.
   * `dx`/`ds` offset the anchor from the formation track (set once at spawn); `x`/`s` are the anchor now (s from the
   * player row); `base` is the ground or pontoon deck under it.
   */
  ground?: {
    dx: number; ds: number; x: number; s: number; base: number; afloat: boolean; cameraX: number;
    /**
     * The gameplay point a committed attack leaves from, fixed when the windup starts (the forecast the director admitted),
     * so a camera move during the windup cannot shift a shot away from what was checked. Cleared once it fires.
     */
    muzzle?: { x: number; s: number };
  };
  /** Volleys released so far (the Diamond alternates its wing each volley). */
  volleys?: number;
  /** Umbra Wraith: one shared active-time clock for teleport, two attacks/exit (or unlimited hunter attacks). */
  blink?: { fromX: number; fromS: number; startedAt: number; readyAt: number; attacks: number; exitAt?: number;
    /** Planned destination during the feint; cleared when the warp actually starts. */
    destination?: { x: number; s: number } };
  /**
   * Beam lock (Needle, Lancer): the ship swings over its committed lane during the windup, fires straight down from
   * it, holds while the beam is live, then eases back onto its path. Seconds: total windup, hold left, release left.
   */
  lock?: { total: number; hold: number; release: number };
  /**
   * Broke off when a boss arrived (src/sim/bastion.ts `leave`): it never attacks again. A craft flies out of frame toward
   * `side`; a ground battery stays on its ground, quiet, until it scrolls out. Nothing just vanishes.
   */
  leaving?: { at: number; side: -1 | 1 };
  /**
   * A hunter (ace, src/sim/hunters.ts): no authored path; it roams and follows the ship to the sides. `shield` is what is
   * left of its shield (charges × `perCharge`, taken before the hull); `vx`/`vs` its velocity; `tx`/`ts` its waypoint,
   * re-picked at age `retarget` (`waypoint` counts the picks, for its rolls, keyed by `key`: its level and spawn number).
   */
  hunter?: { key: number; shield: number; perCharge: number; vx: number; vs: number; tx: number; ts: number; retarget: number; waypoint: number };
  /** Displacement a Gravity Well dragged this craft off its authored path (docs/32 §2.2); kept after the well ends. */
  pull?: { x: number; s: number };
}
export interface Projectile {
  /** Gravitic Shield return fire; not a main/special missile and never grants special kill charge. */
  reflected?: boolean;
  orbit?: { angle: number; radius: number; direction: -1 | 1; elapsed: number };
  id: number; x: number; s: number; previousX: number; previousS: number;
  vx: number; vs: number; friendly: boolean; damage: number; radius: number;
  ttl: number; homingTargetId?: number;
  /** Main weapon at launch, retained through pickups and lost locks; special missiles do not set this. */
  weapon?: WeaponId;
  /** Fired by a special (Seeker Rack): its kills never charge the special. */
  special?: boolean;
  /** Initial outward flight before a special missile can steer. */
  spreadRemaining?: number;
  /** Seconds it waits at its muzzle before flying (a Pulsar burst is emitted at once and streams out). */
  delay?: number;
  /** Re-aims at the player's position, at the same speed, the moment its delay ends (a Pulsar stream). */
  track?: boolean;
  /** The enemy that fired it, for a burst still waiting at its muzzle: those shots never leave once it is shot down. */
  source?: number;
  /** A piercing Rail Driver slug (docs/32 §1.4): the enemies it already damaged. It flies on through all but boss parts. */
  pierced?: number[];
}
/** `cost` is the shield charges an accepted hit takes (2, a heavy hit, when absent; a Needle's narrow beam costs 1). */
/** `source`: the enemy firing a ship beam; its lane ends when that ship goes down (boss lanes have none). */
export interface Hazard { id: number; x: number; width: number; warning: number; active: number; ttl: number; cost?: number; source?: number }
export interface Pickup { id: number; kind: 'shield' | 'power' | 'weapon' | 'credit' | 'part'; x: number; s: number; value: number; weapon?: WeaponId; ttl: number }
/** `bossBlast`: a destroyed boss's last detonation (render only, like every effect). */
export interface Effect { id: number; kind: 'hit' | 'explosion' | 'special' | 'shield' | 'pickup' | 'blast' | 'bossBlast'; x: number; s: number; ttl: number; duration: number }
/** A hyperdrive jump between planets: about 3 s; the look switches at its midpoint (`startedAt + duration / 2`). */
export interface JumpState { startedAt: number; duration: number; from: PlanetId; to: PlanetId }
export interface RunState {
  config: RunConfig; phase: RunPhase; tick: number; time: number; distance: number;
  sector: number; cameraX: number; player: Player; enemies: Enemy[];
  projectiles: Projectile[]; hazards: Hazard[]; pickups: Pickup[]; effects: Effect[];
  score: number; kills: number; credits: number; livesLost: number; specialsUsed: number;
  mainSequence?: { weapon: WeaponId; rank: number; index: number };
  nextId: number; nextVolleyAt: number; nextEncounterAt: number; encounterIndex: number;
  /** The cue (sector, index) whose ground formations already spawned ahead of its time (src/sim/game.ts, leadGround). */
  groundLead?: { sector: number; index: number } | null;
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
  /**
   * Gravity Well in progress (docs/32 §2): a singularity fixed in the world at (x, s), pulling from `armedAt` until
   * `until`, when it collapses. `swallowed` counts hostile shots it took (render and audio read it).
   */
  well?: { x: number; s: number; startedAt: number; armedAt: number; until: number; swallowed: number } | null;
  /** Hunter bookkeeping for the current level or endless sector: hunters spawned and the last spawn window used. */
  hunters?: { sector: number; spawned: number; window: number; shieldDrops?: number };
  /** Parts collected this attempt (docs/33; campaign only, banked with the attempt like credits). */
  parts?: number;
  /**
   * Strike sites (docs/33, src/sim/sites.ts): sites destroyed this run, and the budgeted shield supplies a shield site's
   * cell has already taken (`sector:index` of the supply; that supply is then skipped, invariant 11).
   */
  sites?: { destroyed: number; shieldClaims: string[] };
}
export const VIEW = { width: 12, worldWidth: 24, sectionLength: 36, elevation: 55, flightHeight: 3.8, minS: -6.25, maxS: 19.8, playerRadius: 0.42, scrollSpeed: 5 } as const;
export const STEP = 1 / 60;
export const EMPTY_INPUT: InputFrame = { horizontal: 0, specialPressed: false, pausePressed: false };
export interface GameRenderer {
  /** Load the whole destination, including its boss, before a flight/warp exposes it. */
  prepare(planet: PlanetId): Promise<void>;
  isReady(planet: PlanetId): boolean;
  /**
   * The launch warp over a flight's preparation: 'cruise' while its world loads (only the warp is drawn, over the last
   * frame's world), 'ready' once it is loaded (the next frame builds and warms the flight under the warp), 'arrive' to
   * break out onto it (returns the seconds to the flash, when the flight starts), 'off' for a cancelled launch. Render only.
   */
  launchWarp(mode: 'cruise' | 'ready' | 'arrive' | 'off'): number;
  render(state: RunState, alpha: number): void;
  /** Playground only (playground.html): a level's shipped look, and a live replacement for it (render/scene.ts PlanetLook). */
  lookOf?(planet: PlanetId): unknown;
  tuneLook?(planet: PlanetId, look: unknown): void;
  resize(width: number, height: number): void;
  setQuality(quality: GraphicsQuality): void;
  /** Loads the ship a flight shows (its chassis and look; endless always the default Scrapper) before it is exposed. */
  prepareHero?(config: RunConfig): Promise<void>;
  /** Starts downloading a look's ship files ahead of a launch (the campaign screen). */
  preloadHero?(ship: ShipId, look: HeroLook): void;
  /** The hangar's picture of a ship's look: one still of `width` × `height` pixels (UiActions.heroPreview). */
  heroPreview?(ship: ShipId, look: HeroLook, width: number, height: number): Promise<HTMLCanvasElement | null>;
  dispose(): void;
}
export interface GameInput {
  sample(): InputFrame; clear(): void; dispose(): void;
}
export interface UiActions {
  start(config: RunConfig): void; pause(): void; resume(): void; quit(): void;
  setMuted(muted: boolean): void;
  setQuality(quality: GraphicsQuality): void;
  /**
   * A picture of a ship's look for the hangar, drawn by the game's own renderer (menus never open a second WebGL
   * context): one still of `width` × `height` pixels, or null without a renderer.
   */
  heroPreview?(ship: ShipId, look: HeroLook, width: number, height: number): Promise<HTMLCanvasElement | null>;
  /** Starts downloading the ship a campaign launch will fly (GameRenderer.preloadHero). */
  preloadHero?(ship: ShipId, look: HeroLook): void;
}
export interface GameUi {
  canvas: HTMLCanvasElement; surface: HTMLElement; specialButton: HTMLButtonElement;
  update(state: RunState | null): void; showMenu(): void; showError(message: string): void;
  showLoading(active: boolean): void;
  /** Fades the loading overlay out; resolves once it is gone. */
  fadeLoading(): Promise<void>;
  /** While loading: true shows the launch warp alone (the panel hidden, the overlay clear); false shows the panel. */
  setLoadingWarp(warp: boolean): void;
  dispose(): void;
}
