import { ENEMIES, endlessRampSector } from '../content/balance';
import { VIEW, type Enemy, type EnemyKind, type PlanetId, type RunState } from '../shared/contracts';
import { approach, clamp } from './geometry';
import { airClockRate } from './motion';
import { runScale } from './spawn';

/**
 * Hunters (aces; user, 22 October 2026): a world's strongest craft under a glowing spherical shield. They fly no
 * authored path and never leave: they roam above the fight, and when the ship retreats to a side of the map, away from
 * the chaotic centre, they follow it there. They stay until shot down, into a boss fight too.
 *
 * The director gives them a chance every `interval` seconds (a seeded roll, no `Math.random`): never more than one or
 * two alive at once and a few per level, one at most while a boss fights. They stand outside the authored encounters:
 * they count against no threat budget or airspace, but every attack they start passes the same fairness admission as any
 * other, so a reachable safe path always remains. They hold still through their windups, so an admitted attack leaves
 * from exactly where it was checked.
 */
export const HUNTERS = {
  /** Seconds between spawn chances, the chance of each, and the quiet start of a level or endless sector. */
  interval: 15, chance: 0.6, firstAfter: 10,
  /**
   * The kind each world sends: a strong craft it already flies. Never the Pulsar: its stream tracks the ship, and a
   * tracking stream from a craft that follows the ship to the world edge left no way out (validation pilots were hit).
   */
  kinds: { luna: 'weaver', khepri: 'lancer', vesper: 'diamond', nacre: 'diamond' } as Readonly<Record<PlanetId, EnemyKind>>,
  /** Shield charges, each absorbing this share of the kind's hull (scaled with the hull): about twice the hull in all. */
  shield: { charges: 3, share: 0.35 },
  /** Score and credits over the base kind. */
  reward: 3,
  /** Roaming band (s ahead of the player row) and cruise speed and acceleration at pace 1. */
  row: { min: 10.5, max: 15 }, speed: 3.6, accel: 7,
  /**
   * The ship counts as retreating to a side beyond this |x|; a hunter then closes to `chaseS` ahead, right over it (an
   * offset to one side would back away whenever the ship moved under it to shoot, so the fixed guns could never line up).
   * It is much slower than the ship, so it trails a weaving ship and the ship can line up under it.
   */
  side: 4.5, chaseS: 10,
  /**
   * Multiplier on the kind's repeat-attack interval (with the difficulty's, but not the world's or mission's quickening):
   * hunters come on top of the authored waves, so they fire a little less often.
   */
  cadence: 1.3,
  /** Hunters keep this far apart. */
  spacing: 3,
  /** Seconds of age before the first windup (it is still diving in). */
  firstAttack: 2.2,
} as const;

/** Hunters alive at once and per level (endless: per sector). */
export function hunterLimits(state: RunState): { live: number; total: number } {
  if (state.config.mode === 'endless') {
    const sector = endlessRampSector(state.sector);
    return sector <= 2 ? { live: 1, total: 3 } : sector <= 5 ? { live: 2, total: 4 } : { live: 2, total: 5 };
  }
  if (state.config.mission === 'training') return { live: 1, total: 3 };
  return { relaxed: { live: 1, total: 3 }, standard: { live: 2, total: 4 }, veteran: { live: 2, total: 5 } }[state.config.difficulty ?? 'standard'];
}

/**
 * A unit roll in [0, 1) for (a, b, c): its own stream, independent of loot and content, and of the world seed, so every
 * run of a level (and every endless run, a standardized challenge) meets the same hunters at the same times.
 */
function roll(a: number, b: number, c = 0): number {
  let h = 0x68756e74;
  for (const v of [a, b, c]) { h = Math.imul(h ^ (v >>> 0), 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; }
  return (h >>> 0) / 4294967296;
}

/** Shield charges a hunter has left (for the renderer and tests). */
export const hunterCharges = (enemy: Enemy) => enemy.hunter ? Math.max(0, Math.ceil(enemy.hunter.shield / enemy.hunter.perCharge - 1e-9)) : 0;

/** Takes a hit on a hunter's shield first; returns the damage that reaches the hull. */
export function absorbHunterShield(enemy: Enemy, damage: number): number {
  const shield = enemy.hunter;
  if (!shield || shield.shield <= 0) return damage;
  const absorbed = Math.min(shield.shield, damage);
  shield.shield -= absorbed;
  return damage - absorbed;
}

/** The director's chances and the hunters' own flight. Call every step before the enemies update. */
export function updateHunters(state: RunState, dt: number): void {
  spawnHunters(state);
  const hunters = state.enemies.filter(enemy => enemy.hunter && enemy.hp > 0);
  // One hunter chases at a time (the oldest); two stacked over a ship pinned at the world edge left no way out.
  const chaser = hunters.find(enemy => enemy.s <= VIEW.maxS);
  for (const hunter of hunters) steer(state, hunter, hunters, hunter === chaser, dt);
}

/** The level's key for its rolls: the endless sector, or the campaign mission. */
const MISSION_KEYS: Readonly<Record<string, number>> = { training: 101, bastion: 102, 'cold-vector': 103, 'deep-bloom': 104 };
const levelKey = (state: RunState) => state.config.mode === 'endless' ? state.sector : MISSION_KEYS[state.config.mission ?? 'training'];

function spawnHunters(state: RunState): void {
  const boss = state.boss;
  if (state.jump || boss?.phase === 'arrival' || boss?.phase === 'destroyed') return;
  const start = state.config.mode === 'endless' ? state.sectorStartedAt : 0;
  if (!state.hunters || state.hunters.sector !== state.sector) state.hunters = { sector: state.sector, spawned: 0, window: 0 };
  const book = state.hunters, elapsed = state.time - start - HUNTERS.firstAfter;
  if (elapsed < 0) return;
  // One chance per window, used up whether or not a hunter comes.
  const window = Math.floor(elapsed / HUNTERS.interval) + 1;
  if (window <= book.window) return;
  book.window = window;
  const limits = hunterLimits(state), live = state.enemies.filter(enemy => enemy.hunter && enemy.hp > 0).length;
  if (live >= (boss ? 1 : limits.live) || book.spawned >= limits.total) return;
  if (roll(levelKey(state), window) >= HUNTERS.chance) return;
  book.spawned += 1;
  const kind = HUNTERS.kinds[state.planet], base = ENEMIES[kind], hp = base.hp * runScale(state).hp;
  // It dives in on the side of the view away from the ship.
  const perCharge = hp * HUNTERS.shield.share, side = state.player.x > state.cameraX ? -1 : 1;
  const x = clamp(state.cameraX + side * 3, -VIEW.worldWidth / 2 + 1, VIEW.worldWidth / 2 - 1);
  state.enemies.push({
    id: state.nextId++, kind, x, s: VIEW.maxS + 3, originX: x, hp, maxHp: hp, radius: base.radius, age: 0,
    nextAttack: HUNTERS.firstAttack, warning: 0, aimX: x, groundHeight: VIEW.flightHeight,
    // Keyed by level and spawn number, never by entity id (ids shift with unrelated effects and pickups).
    hunter: { key: levelKey(state) * 64 + book.spawned, shield: perCharge * HUNTERS.shield.charges, perCharge, vx: 0, vs: 0, tx: x, ts: HUNTERS.row.max, retarget: 0, waypoint: 0 },
  });
  // Announced only over no other message: overwriting an entry alert would make the director show it again and delay
  // its cue (src/sim/game.ts), and boss messages carry their phase.
  if (state.time >= state.messageUntil) { state.message = 'ACE INBOUND · SHIELDED'; state.messageUntil = state.time + 2.5; }
}

/**
 * A hunter's flight: it roams between seeded waypoints over the map's centre (within the view), and when the ship
 * retreats to a side the oldest hunter closes in over it. It holds still while winding up or firing.
 */
function steer(state: RunState, enemy: Enemy, hunters: readonly Enemy[], chasing: boolean, dt: number): void {
  const hunter = enemy.hunter!;
  if (enemy.warning > 0 || enemy.lock) { hunter.vx = 0; hunter.vs = 0; return; }
  const half = VIEW.width / 2 - 1, rate = airClockRate(state);
  let tx: number, ts: number;
  if (chasing && Math.abs(state.player.x) > HUNTERS.side) {
    tx = state.player.x; ts = HUNTERS.chaseS;
  } else {
    if (enemy.age >= hunter.retarget || Math.hypot(hunter.tx - enemy.x, hunter.ts - enemy.s) < 0.3) {
      hunter.waypoint += 1;
      const u = roll(hunter.key, hunter.waypoint, 1), v = roll(hunter.key, hunter.waypoint, 2);
      // Roaming keeps to the map's centre, the chaotic middle (waypoints around the camera drew a ship that followed
      // its hunter out to the world edge, step by step).
      hunter.tx = (u * 2 - 1) * HUNTERS.side;
      hunter.ts = HUNTERS.row.min + v * (HUNTERS.row.max - HUNTERS.row.min);
      hunter.retarget = enemy.age + 2.5 + roll(hunter.key, hunter.waypoint, 3) * 2;
    }
    tx = hunter.tx; ts = hunter.ts;
  }
  // Hunters keep apart: the later one gives way sideways, inward when the edge of the view or world is in the way.
  const lo = Math.max(-VIEW.worldWidth / 2 + 1, state.cameraX - half), hi = Math.min(VIEW.worldWidth / 2 - 1, state.cameraX + half);
  tx = clamp(tx, lo, hi);
  for (const other of hunters) {
    if (other === enemy || other.id > enemy.id || Math.abs(other.s - ts) > 2.5) continue;
    const gap = tx - other.x;
    if (Math.abs(gap) >= HUNTERS.spacing) continue;
    const away = other.x + (gap >= 0 ? 1 : -1) * HUNTERS.spacing, back = other.x - (gap >= 0 ? 1 : -1) * HUNTERS.spacing;
    tx = away >= lo && away <= hi ? away : clamp(back, lo, hi);
  }
  // Diving in from above the view it flies faster.
  const speed = HUNTERS.speed * rate * (enemy.s > VIEW.maxS ? 2 : 1), accel = HUNTERS.accel * rate;
  const want = (d: number) => Math.sign(d) * Math.min(speed, Math.sqrt(2 * accel * Math.abs(d)));
  hunter.vx = approach(hunter.vx, want(tx - enemy.x), accel * dt);
  hunter.vs = approach(hunter.vs, want(ts - enemy.s), accel * dt);
  enemy.x += hunter.vx * dt; enemy.s += hunter.vs * dt;
}
