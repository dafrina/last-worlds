import { BALANCE, ENDLESS_PROLOGUE_SECTORS, PACE, endlessRampSector } from './balance';
import { BOSSES, missionBoss } from './bosses';
import { runPlanet } from './missions';
import { VIEW, type BossId, type PlanetId, type RunConfig } from '../shared/contracts';

/**
 * Endless planet cycle (docs/18): three sectors per planet, the last ending with that planet's boss, then a
 * hyperdrive jump to the next planet. Everything here is fixed content computed from sector numbers alone.
 *
 * Distances are exact because the scroll is a closed form of time: the pace ramp within each sector, a
 * smoothstep stop for the boss arena, a smoothstep resume once the boss is destroyed, and a
 * smooth hyperdrive surge. The fight's length moves only *time*: while the terrain is stopped no distance
 * passes, so every planet stretch, arena and jump window is a fixed world distance.
 */
export const ENDLESS_CYCLE = {
  /** Before the cycle: one Luna sector ending with WARDEN-1, then the jump to Khepri (docs/19). */
  prologue: 'luna' as const satisfies PlanetId,
  planets: ['khepri', 'vesper'] as const satisfies readonly PlanetId[],
  sectorsPerPlanet: 3,
  boss: { luna: 'warden', khepri: 'bastion', vesper: 'ark' } as const satisfies Readonly<Partial<Record<PlanetId, BossId>>>,
  /** Boss sector timeline in seconds from the sector's start. */
  bossSector: {
    /** No ordinary cue is admitted at or after this time. */
    approachEndsAt: 70,
    decelStart: 77,
    decelDuration: 6,
    /** Three seconds into the stop, as in the campaign arenas. */
    arrivesAt: 80,
  },
  /** After the kill: the scroll eases back up, then the hyperdrive jump. */
  resumeDuration: 2,
  jumpDuration: 3,
  /** The jump ends this far past the planet switch, so the next planet fills the whole view (−minS + 2). */
  jumpClearance: -VIEW.minS + 2,
  /** Pace eases from the previous sector's target over this many seconds (PACE.endless.easeSeconds). */
  easeSeconds: PACE.endless.easeSeconds,
} as const;

/** Target endless pace of a sector (docs/03 §8). */
export function sectorPace(sector: number): number {
  const ramp = PACE.endless;
  return Math.min(ramp.start + ramp.perSector * Math.max(0, endlessRampSector(sector) - 1), ramp.cap);
}

/** Pace τ seconds into a sector: a smoothstep ease from the previous sector's pace. */
export function paceInSector(sector: number, tau: number): number {
  const from = sectorPace(Math.max(1, sector - 1));
  const u = Math.max(0, Math.min(1, tau / ENDLESS_CYCLE.easeSeconds));
  return from + (sectorPace(sector) - from) * u * u * (3 - 2 * u);
}

/** Terrain scroll for a pace: linear in pace (4 at 0.8, 5 at 1.0, 5.5 at 1.1, matching the PACE anchors). */
export function scrollForPace(pace: number): number {
  return VIEW.scrollSpeed * pace;
}

/** Distance covered in the first τ seconds of a sector's pace ramp (closed form). */
function rampDistance(sector: number, tau: number): number {
  const from = sectorPace(Math.max(1, sector - 1));
  const delta = sectorPace(sector) - from;
  const ease = ENDLESS_CYCLE.easeSeconds;
  const t = Math.max(0, tau);
  const u = Math.min(1, t / ease);
  return scrollForPace(from) * t + scrollForPace(delta) * (ease * (u ** 3 - u ** 4 / 2) + Math.max(0, t - ease));
}

export interface EndlessBossStop {
  boss: BossId;
  /** World distance at which the terrain stops for the arena. */
  stopDistance: number;
  /** World-distance range the arena platform must cover (open water on Vesper). */
  platform: { from: number; to: number };
}

export interface EndlessJump {
  from: PlanetId;
  to: PlanetId;
  /** Scroll speed on resume and at the jump's ends (the boss sector's pace). */
  cruise: number;
  /** Peak hyperdrive speed (units/s) at the middle of the jump. */
  peak: number;
  startDistance: number;
  /** Where the look switches (the flash, at the middle of the jump in time). */
  flashDistance: number;
  /** Terrain beyond this distance belongs to the next planet: past the far end of the arena platform. */
  switchDistance: number;
  endDistance: number;
}

export interface EndlessSectorPlan {
  sector: number;
  planet: PlanetId;
  boss: BossId | null;
  startDistance: number;
  /** Next sector's start distance. */
  endDistance: number;
  stop: EndlessBossStop | null;
  jump: EndlessJump | null;
}

/** Planets endless visits: the Luna prologue, then the cycle. */
export type EndlessPlanet = typeof ENDLESS_CYCLE.prologue | (typeof ENDLESS_CYCLE.planets)[number];

/** Whether a sector is the Luna prologue (sector 1). */
export const isPrologue = (sector: number) => sector <= ENDLESS_PROLOGUE_SECTORS;
/** A sector's position in the planet cycle (1 = Khepri's first sector); the prologue has none. */
export const cycleSector = (sector: number) => sector - ENDLESS_PROLOGUE_SECTORS;

export function endlessPlanet(sector: number): EndlessPlanet {
  if (isPrologue(sector)) return ENDLESS_CYCLE.prologue;
  const stint = Math.floor((cycleSector(sector) - 1) / ENDLESS_CYCLE.sectorsPerPlanet);
  return ENDLESS_CYCLE.planets[stint % ENDLESS_CYCLE.planets.length];
}

/** The prologue's one sector ends with WARDEN-1; in the cycle every third sector ends with its planet's boss. */
export function isBossSector(sector: number): boolean {
  return isPrologue(sector) || cycleSector(sector) % ENDLESS_CYCLE.sectorsPerPlanet === 0;
}
/** The boss sector after `sector` (boss sectors: 1, 4, 7, …). */
const nextBossSector = (sector: number) => { let n = sector + 1; while (!isBossSector(n)) n += 1; return n; };
const FIRST_BOSS_SECTOR = 1;

/** Whether this is the planet's first stint (sectors 2-4 Khepri, 5-7 Vesper) rather than a later visit. */
export function isFirstVisit(sector: number): boolean {
  return isPrologue(sector) || Math.floor((cycleSector(sector) - 1) / ENDLESS_CYCLE.sectorsPerPlanet) < ENDLESS_CYCLE.planets.length;
}

const plans: EndlessSectorPlan[] = [];

/** The fixed plan of an endless sector. Pure and deterministic; computed in order and cached. */
export function endlessSectorPlan(sector: number): EndlessSectorPlan {
  if (!Number.isInteger(sector) || sector < 1) throw new RangeError(`Endless sector must be a positive integer: ${sector}`);
  while (plans.length < sector) {
    const n = plans.length + 1;
    const startDistance = n === 1 ? 0 : plans[n - 2].endDistance;
    const planet = endlessPlanet(n);
    if (!isBossSector(n)) {
      plans.push({ sector: n, planet, boss: null, startDistance, endDistance: startDistance + rampDistance(n, BALANCE.sectorDuration), stop: null, jump: null });
      continue;
    }
    const boss = ENDLESS_CYCLE.boss[planet];
    const timeline = ENDLESS_CYCLE.bossSector;
    const cruise = scrollForPace(sectorPace(n));
    const stopDistance = startDistance + rampDistance(n, timeline.decelStart) + cruise * timeline.decelDuration / 2;
    const platform = BOSSES[boss].arena.platform;
    const switchDistance = stopDistance + platform.to;
    const startJump = stopDistance + cruise * ENDLESS_CYCLE.resumeDuration / 2;
    const endDistance = switchDistance + ENDLESS_CYCLE.jumpClearance;
    const duration = ENDLESS_CYCLE.jumpDuration;
    // Jump speed: cruise + (peak − cruise)·sin(π q) over the jump, covering exactly endDistance − startJump.
    const peak = cruise + (endDistance - startJump - cruise * duration) * Math.PI / (2 * duration);
    const flashDistance = startJump + cruise * duration / 2 + (peak - cruise) * duration / Math.PI;
    plans.push({
      sector: n, planet, boss, startDistance, endDistance,
      stop: { boss, stopDistance, platform: { from: stopDistance + platform.from, to: stopDistance + platform.to } },
      jump: { from: planet, to: endlessPlanet(n + 1), cruise, peak, startDistance: startJump, flashDistance, switchDistance, endDistance },
    });
  }
  return plans[sector - 1];
}

/**
 * Scroll inside a sector, τ seconds after it began. `bossEnd` is when the boss was destroyed
 * (seconds after the sector's start), or null while it lives. `phase` tells the simulation what the terrain
 * is doing; 'next' means the sector is over.
 */
export function endlessScroll(plan: EndlessSectorPlan, tau: number, bossEnd: number | null): {
  distance: number; speed: number; phase: 'cruise' | 'stopping' | 'stopped' | 'resuming' | 'jump' | 'next';
} {
  const n = plan.sector;
  if (!plan.stop || !plan.jump) {
    if (tau >= BALANCE.sectorDuration) return { distance: plan.endDistance, speed: scrollForPace(sectorPace(n)), phase: 'next' };
    return { distance: plan.startDistance + rampDistance(n, tau), speed: scrollForPace(paceInSector(n, tau)), phase: 'cruise' };
  }
  const timeline = ENDLESS_CYCLE.bossSector;
  const cruise = plan.jump.cruise;
  if (tau < timeline.decelStart) return { distance: plan.startDistance + rampDistance(n, tau), speed: scrollForPace(paceInSector(n, tau)), phase: 'cruise' };
  const span = timeline.decelDuration;
  const decelFrom = plan.startDistance + rampDistance(n, timeline.decelStart);
  if (tau < timeline.decelStart + span) {
    const u = (tau - timeline.decelStart) / span;
    return { distance: decelFrom + cruise * span * (u - u ** 3 + u ** 4 / 2), speed: cruise * (1 - u * u * (3 - 2 * u)), phase: 'stopping' };
  }
  const stop = plan.stop.stopDistance;
  if (bossEnd === null || tau <= bossEnd) return { distance: stop, speed: 0, phase: 'stopped' };
  const resume = ENDLESS_CYCLE.resumeDuration;
  const since = tau - bossEnd;
  if (since < resume) {
    const w = since / resume;
    return { distance: stop + cruise * resume * (w ** 3 - w ** 4 / 2), speed: cruise * w * w * (3 - 2 * w), phase: 'resuming' };
  }
  const duration = ENDLESS_CYCLE.jumpDuration;
  const q = (since - resume) / duration;
  if (q < 1) {
    const extra = plan.jump.peak - cruise;
    return {
      distance: plan.jump.startDistance + cruise * duration * q + extra * duration / Math.PI * (1 - Math.cos(Math.PI * q)),
      speed: cruise + extra * Math.sin(Math.PI * q),
      phase: 'jump',
    };
  }
  return { distance: plan.endDistance, speed: cruise, phase: 'next' };
}

/* ------------------------------------------------------------------------------------------------------ */
/* World-facing schedule (docs/18 §2-3): planet stretches, arenas and jump windows by world distance.       */
/* ------------------------------------------------------------------------------------------------------ */

export interface PlanetStretch { planet: PlanetId; from: number; to: number }
export interface ArenaSpan { boss: BossId; planet: PlanetId; stopDistance: number; from: number; to: number }
/** A hyperdrive jump window by world distance (with its cruise and peak scroll speeds). */
export type JumpWindow = EndlessJump;

export interface WorldSchedule {
  /** The planet whose terrain covers this world distance. */
  planetAt(distance: number): PlanetId;
  /** The boss arena whose platform covers this world distance, if any. */
  arenaAt(distance: number): ArenaSpan | null;
  /** The hyperdrive jump whose window contains this world distance, if any. */
  jumpAt(distance: number): JumpWindow | null;
  /** Planet stretches overlapping [from, to). */
  stretches(from: number, to: number): PlanetStretch[];
  /** Every arena whose platform overlaps [from, to). */
  arenas(from: number, to: number): ArenaSpan[];
}

function sectorAtDistance(distance: number): EndlessSectorPlan {
  let n = 1;
  while (endlessSectorPlan(n).endDistance <= distance) n += 1;
  return endlessSectorPlan(n);
}

/** Planet stretches are bounded by the switch distances of the boss sectors. */
function endlessStretchAt(distance: number): PlanetStretch {
  let from = 0;
  for (let n = FIRST_BOSS_SECTOR; ; n = nextBossSector(n)) {
    const plan = endlessSectorPlan(n);
    if (distance < plan.jump!.switchDistance) return { planet: plan.planet, from, to: plan.jump!.switchDistance };
    from = plan.jump!.switchDistance;
  }
}

function arenaOf(plan: EndlessSectorPlan): ArenaSpan {
  return { boss: plan.boss!, planet: plan.planet, stopDistance: plan.stop!.stopDistance, from: plan.stop!.platform.from, to: plan.stop!.platform.to };
}

/**
 * The run's world schedule from its config alone (never from combat state). Endless follows the planet cycle;
 * a campaign mission flies one planet with at most one arena at its fixed stop distance.
 */
export function endlessSchedule(config: Pick<RunConfig, 'mode' | 'mission'>): WorldSchedule {
  if (config.mode !== 'endless') {
    const planet = runPlanet(config);
    const boss = missionBoss(config.mission);
    const arena: ArenaSpan | null = boss ? (() => {
      const stopDistance = VIEW.scrollSpeed * (boss.arena.decelStart + boss.arena.decelDuration / 2);
      return { boss: boss.id, planet, stopDistance, from: stopDistance + boss.arena.platform.from, to: stopDistance + boss.arena.platform.to };
    })() : null;
    return {
      planetAt: () => planet,
      arenaAt: distance => (arena && distance >= arena.from && distance < arena.to ? arena : null),
      jumpAt: () => null,
      stretches: (from, to) => [{ planet, from, to }],
      arenas: (from, to) => (arena && arena.to > from && arena.from < to ? [arena] : []),
    };
  }
  return {
    planetAt: distance => endlessStretchAt(distance).planet,
    arenaAt: distance => {
      for (let n = FIRST_BOSS_SECTOR; ; n = nextBossSector(n)) {
        const plan = endlessSectorPlan(n);
        if (distance < plan.stop!.platform.from) return null;
        if (distance < plan.stop!.platform.to) return arenaOf(plan);
      }
    },
    jumpAt: distance => {
      const plan = sectorAtDistance(distance);
      return plan.jump && distance >= plan.jump.startDistance && distance < plan.jump.endDistance ? { ...plan.jump } : null;
    },
    stretches: (from, to) => {
      const out: PlanetStretch[] = [];
      let at = Math.max(0, from);
      while (at < to) {
        const stretch = endlessStretchAt(at);
        out.push({ planet: stretch.planet, from: Math.max(from, stretch.from), to: Math.min(to, stretch.to) });
        at = stretch.to;
      }
      return out;
    },
    arenas: (from, to) => {
      const out: ArenaSpan[] = [];
      for (let n = FIRST_BOSS_SECTOR; ; n = nextBossSector(n)) {
        const plan = endlessSectorPlan(n);
        if (plan.stop!.platform.from >= to) return out;
        if (plan.stop!.platform.to > from) out.push(arenaOf(plan));
      }
    },
  };
}
