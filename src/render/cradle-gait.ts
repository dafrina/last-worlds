/**
 * THE CRADLE's walk (docs/27 §5, docs/43 §5-7): pure, deterministic leg maths for the walking brood hive, with no Three.js
 * and no randomness. Render-only: it reads the boss's seat each frame and never feeds back into the simulation (targets,
 * shots and collisions stay where the boss's state puts them).
 *
 * Frames: the rig frame is the boss view's root (x right, y up, z toward the player; the body's rest pose); the ground
 * frame is the same axes anchored to the terrain (the view passes where the rig's origin is in it each frame), so a
 * planted foot stays put on the ground while the body walks over it and the world scrolls.
 *
 * - **Gait:** alternating tetrapods (left 1, right 2, left 3, right 4, then the other four). A group lifts when its feet
 *   have fallen behind where the body wants them; the next group waits until it has replanted, so four feet always stand.
 *   A swing lifts each foot on an arc and plants it ahead of the body's motion, on the ground's height there. Standing
 *   still, stragglers replant after a pause (weight shifting).
 * - **Body:** a heavy bob as each group lifts, a roll and pitch into the motion; looser and staggering when wounded.
 * - **Legs:** the claw (tarsus) kept near vertical over its foot, a fixed coxa turned toward the foot, and a two-bone IK for
 *   femur and tibia with the knee arching up (or giving way outward as the leg buckles).
 * - **Death:** walking stops, the legs buckle one after another, the body falls between them and settles on the ground.
 */

export type Vec3 = readonly [number, number, number];
type V = [number, number, number];

/** A leg's rest joints in the rig frame: hip, coxa end, knee, ankle, claw tip (the GLB's rest pose). */
export interface LegRest { joints: readonly [Vec3, Vec3, Vec3, Vec3, Vec3] }
export interface GaitTuning {
  /** Feet stand this share of the way from the rest pose's reach toward the hip (pulled in under the body). */
  stance: number;
  /** Seconds a swing takes when walking slowly, and at the fastest walk. */
  swing: number; swingFast: number;
  /** How far a foot may fall behind its home (units) before its group steps. */
  reach: number;
  /** Arc height of a lifted foot. */
  lift: number;
}
// (Crouched since 17 November: its feet plant at about the rest pose's reach, wide, the knees arching over the low body.)
export const GAIT: GaitTuning = { stance: .05, swing: .62, swingFast: .3, reach: 1.15, lift: 1 };
/** Death: legs buckle one after another from BUCKLE.start, the body falls from FALL.start and strikes the ground at FALL.impact. */
// (The crouched body falls its last 1.6 flat onto the ground: user, 17 November, "when it crashes it will be finally laying
// on the ground".)
export const BUCKLE = { start: .5, stagger: .13, duration: .55, slide: 1.4 } as const;
export const FALL = { start: 1.15, impact: 1.85, settle: 2.3, drop: 1.6, pitch: .08, roll: -.04, rebound: .08 } as const;
/** Leg order of the buckling (a front leg, a back one across, ...), and the two tetrapod groups (indices 0-3 left, 4-7 right). */
const BUCKLE_ORDER = [1, 6, 4, 3, 0, 7, 5, 2] as const;
export const GROUPS = [[0, 5, 2, 7], [4, 1, 6, 3]] as const;

export type GaitMode = 'arrival' | 'fight' | 'core' | 'overload' | 'dying';
export interface GaitInput {
  /** Run clock (state.time); the gait measures its own steps from it. */
  time: number;
  /** Where the rig's origin is in the ground frame now. */
  origin: Vec3;
  mode: GaitMode;
  /** Seconds since the boss died (mode 'dying'). */
  deathAge?: number;
}
export interface Pose {
  /** Body offset (rig frame) and its pitch (x, front down positive) and roll (z). */
  body: V; pitch: number; roll: number;
  /** Per leg: hip, coxa end, knee, ankle, foot (rig frame, the body's motion applied). */
  legs: [V, V, V, V, V][];
  /** Feet that planted this frame (ground frame), for the step dust. */
  planted: V[];
  /** Body impact this frame (death). */
  impact: boolean;
}

const add = (a: Vec3, b: Vec3): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
const norm = (a: Vec3): V => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: Vec3, b: Vec3, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
/** A deterministic tremble: a sum of incommensurate sines (no random stream). */
const tremble = (t: number, seed: number) => Math.sin(t * 13.1 + seed * 1.7) * .5 + Math.sin(t * 21.7 + seed * 3.1) * .3 + Math.sin(t * 7.3 + seed) * .2;

/**
 * The walk-in (render-only): it starts wholly out of sight, its cast shadow too, as far out as the view needs (the view
 * measures it with its camera: carrier-view.ts `walkInClearance`, plus `margin`), and walks to its post at a heavy pace:
 * a heavy start, a steady walk and a long slowing, never faster than `speed` (units a second), done `end` seconds into
 * its arrival. With the view on its post that is 16 to 18 units, longer than its arrival allows at that pace, so it may
 * set out up to `lead` seconds before it arrives, on its terrace as that scrolls in, and waits out of sight until it must
 * (user, 18 November: "on mobile the cradle pops in when half on screen already"; it started at most 7 units out, half
 * in view). The lead covers the farthest start (`tests/render/cradle-walk-in.test.ts`).
 */
export const WALK_IN = { speed: 2.5, accelerate: .7, settle: 1.1, end: 3.7, lead: 4.5, margin: .4 } as const;
/** A walk-in on the run clock: from `distance` out at `start` to its post at `end`. */
export interface WalkIn { distance: number; start: number; end: number }
/** Seconds the walk takes over `distance` at its heavy pace. */
export const walkInDuration = (distance: number) => distance / WALK_IN.speed + (WALK_IN.accelerate + WALK_IN.settle) / 2;
/**
 * Its schedule: at its post by `end`, setting out as late as its pace allows (it waits out of sight until then), and never
 * before `now`, its first frame. Planned late (a frame or a model arriving after it should have set out), it squeezes the
 * same walk into the time left rather than appear part-way in.
 */
export function planWalkIn(distance: number, now: number, end: number): WalkIn {
  return { distance, start: Math.max(now, end - walkInDuration(distance)), end };
}
/** How far it still is from its post at `time`: its distance until it sets out, 0 from its end (a trapezoid of speed). */
export function walkInLeft(walk: WalkIn, time: number): number {
  const span = walk.end - walk.start;
  if (time >= walk.end || span <= 0) return 0;
  if (time <= walk.start) return walk.distance;
  // The heavy pace's start and slowing as shares of its own duration (kept when squeezed), at most all of it.
  const natural = walkInDuration(walk.distance), sum = Math.max(1, (WALK_IN.accelerate + WALK_IN.settle) / natural);
  const a = WALK_IN.accelerate / natural / sum, d = WALK_IN.settle / natural / sum, u = (time - walk.start) / span;
  const done = u < a ? u * u / (2 * a) : u < 1 - d ? a / 2 + (u - a) : 1 - (a + d) / 2 - (1 - u) ** 2 / (2 * d);
  return walk.distance * (1 - done / (1 - (a + d) / 2));
}

/** Rotate a rig-frame point about the body's pivot by pitch (about x) then roll (about z). */
function tilt(p: Vec3, pivot: Vec3, pitch: number, roll: number): V {
  let [x, y, z] = sub(p, pivot);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  const cr = Math.cos(roll), sr = Math.sin(roll);
  [x, y] = [x * cr - y * sr, x * sr + y * cr];
  return [x + pivot[0], y + pivot[1], z + pivot[2]];
}

/**
 * The leg's chain for a hip and a foot: claw near vertical over the foot (leaning `claw` radians outward), coxa turned
 * toward the foot at its rest elevation, femur and tibia by two-bone IK, the knee bending toward `bend` (up for a standing
 * leg, outward as it buckles). Segment lengths are the rest pose's, so the segments stay joined.
 */
export function solveLeg(rest: LegRest, hip: Vec3, foot: Vec3, claw: number, buckle = 0): [V, V, V, V, V] {
  const [h0, c0, k0, a0, f0] = rest.joints;
  const coxa = sub(c0, h0), lf = len(sub(k0, c0)), lt = len(sub(a0, k0)), lc = len(sub(f0, a0));
  const outward = norm([foot[0] - hip[0], 0, foot[2] - hip[2]]);
  const ankle = add(foot, add(scale([0, 1, 0], lc * Math.cos(claw)), scale(outward, -lc * Math.sin(claw))));
  // The coxa keeps its rest elevation and length, turned to the foot's azimuth.
  const flat = Math.hypot(coxa[0], coxa[2]);
  const c = add(hip, [outward[0] * flat, coxa[1], outward[2] * flat]);
  const toAnkle = sub(ankle, c), d = clamp(len(toAnkle), Math.abs(lf - lt) + 1e-3, (lf + lt) * .999), u = norm(toAnkle);
  const reached = add(c, scale(u, d));
  const cosA = clamp((lf * lf + d * d - lt * lt) / (2 * lf * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const bendTo = norm(lerp([0, 1, 0], [outward[0], -.25, outward[2]], buckle));
  let b = sub(bendTo, scale(u, dot(bendTo, u)));
  if (len(b) < 1e-4) b = sub([0, 1, 0], scale(u, u[1]));
  b = norm(b);
  const knee = add(c, add(scale(u, lf * cosA), scale(b, lf * sinA)));
  // An unreachable ankle (only while dying) is pulled to where the leg reaches; the foot follows the claw.
  const footOut = len(toAnkle) > d + 1e-6 ? sub(reached, sub(ankle, foot)) : [foot[0], foot[1], foot[2]] as V;
  return [[hip[0], hip[1], hip[2]], c, knee, reached, footOut];
}

export interface GaitOptions {
  /** Terrain height under a ground-frame point (sampled once per planted step, never per frame). */
  ground: (x: number, z: number) => number;
  /** Ground height of the rig's origin (the arena floor's level under the body). */
  floor: number;
  tuning?: Partial<GaitTuning>;
}

interface LegState { foot: V; from: V; to: V; swinging: boolean }

/**
 * A walker's gait over time. `step` is deterministic: the same inputs in the same order give the same poses (it keeps the
 * planted feet between frames). `reset` replants every foot at home (a new encounter, a jump in the clock).
 */
export function createGait(rests: readonly LegRest[], options: GaitOptions) {
  const tune: GaitTuning = { ...GAIT, ...options.tuning };
  // Home: each foot pulled in toward its hip by `stance`, on the rig's floor.
  const homes: V[] = rests.map(rest => {
    const hip = rest.joints[0], foot = rest.joints[4];
    return [foot[0] + (hip[0] - foot[0]) * tune.stance, 0, foot[2] + (hip[2] - foot[2]) * tune.stance];
  });
  const restClaw = rests.map(rest => {
    const a = rest.joints[3], f = rest.joints[4], out = norm([f[0] - rest.joints[0][0], 0, f[2] - rest.joints[0][2]]);
    return Math.atan2(-(dot(sub(a, f), out)), a[1] - f[1]);
  });
  const legs: LegState[] = homes.map(() => ({ foot: [0, 0, 0], from: [0, 0, 0], to: [0, 0, 0], swinging: false }));
  let group = -1, groupAt = 0, swingTime = tune.swing, lastGroup = 1, stillSince = 0, lastOrigin: V | null = null, velocity: V = [0, 0, 0];
  let lastTime = -Infinity, impacted = false;
  const groundAt = (x: number, z: number) => options.ground(x, z);

  function home(i: number, origin: Vec3, lead: Vec3 = [0, 0, 0]): V {
    const p = add(add(homes[i], origin), lead);
    return [p[0], groundAt(p[0], p[2]), p[2]];
  }
  function reset(origin: Vec3) {
    legs.forEach((leg, i) => { leg.foot = home(i, origin); leg.swinging = false; });
    group = -1; lastOrigin = [origin[0], origin[1], origin[2]]; velocity = [0, 0, 0]; stillSince = 0; impacted = false;
  }

  function step(input: GaitInput): Pose {
    const { time, origin, mode } = input;
    const fresh = lastOrigin === null || time < lastTime || time - lastTime > 1;
    if (fresh) reset(origin);
    // The body's velocity over the clock's own step since the last pose (a slow frame is a longer step, not a faster walk).
    const dt = fresh ? 0 : Math.max(0, time - lastTime);
    lastTime = time;
    const moved = sub(origin, lastOrigin!); lastOrigin = [origin[0], origin[1], origin[2]];
    if (dt > 0) velocity = lerp(velocity, [moved[0] / dt, 0, moved[2] / dt], clamp(dt * 4, 0, 1));
    const speed = Math.hypot(velocity[0], velocity[2]);
    const planted: V[] = [];
    const dying = mode === 'dying';
    const age = input.deathAge ?? 0;
    // Swings: finish the one in flight (quickly once dying), then pick the next group.
    if (group >= 0) {
      const u = (time - groupAt) / (dying ? Math.min(swingTime, .25) : swingTime);
      for (const i of GROUPS[group]) {
        const leg = legs[i];
        if (u >= 1) { leg.foot = leg.to; leg.swinging = false; planted.push(leg.to); }
        else {
          const e = smooth(u), arc = Math.sin(Math.PI * clamp(u, 0, 1)) * tune.lift * (dying ? .4 : 1);
          leg.foot = add(lerp(leg.from, leg.to, e), [0, arc, 0]);
        }
      }
      if (u >= 1) { lastGroup = group; group = -1; }
    }
    if (group < 0 && !dying) {
      // The farther group goes; ties go to the one that did not step last.
      const lead = scale(velocity, tune.swing * .6);
      const error = GROUPS.map(g => Math.max(...g.map(i => { const h = home(i, origin, lead); return Math.hypot(legs[i].foot[0] - h[0], legs[i].foot[2] - h[2]); })));
      stillSince = speed > .15 ? time : stillSince;
      const restless = time - stillSince > .5 ? .32 : Infinity;   // standing: replant stragglers after a pause
      const strained = mode === 'overload' ? .8 : mode === 'core' ? .9 : 1;
      const want = error.map(e => e > tune.reach * strained || e > restless);
      let next = -1;
      if (want[0] && want[1]) next = error[0] === error[1] ? 1 - lastGroup : error[0] > error[1] ? 0 : 1;
      else if (want[0]) next = 0; else if (want[1]) next = 1;
      if (next >= 0) {
        group = next; groupAt = time;
        swingTime = tune.swing + (tune.swingFast - tune.swing) * clamp(speed / 4, 0, 1);
        const ahead = scale(velocity, swingTime * .5 + tune.swing * .6);
        for (const i of GROUPS[group]) {
          const leg = legs[i]; leg.swinging = true; leg.from = leg.foot; leg.to = home(i, origin, ahead);
        }
      }
    }
    // Body: a heavy sag as a group lifts, a roll toward the lifted side, a lean into the motion; wounded, a stagger.
    const lifted = group >= 0 ? Math.sin(Math.PI * clamp((time - groupAt) / swingTime, 0, 1)) : 0;
    let bodyY = -.16 * lifted + Math.sin(time * .9) * .05, pitch = clamp(velocity[2] * .012, -.04, .04), roll = (group === 0 ? 1 : -1) * .022 * lifted - clamp(velocity[0] * .01, -.03, .03);
    if (mode === 'core' || mode === 'overload') {
      const k = mode === 'overload' ? 1 : .45;
      bodyY += -.12 * k * Math.max(0, tremble(time * .35, 3)) - .05 * k * Math.abs(Math.sin(time * 2.3));
      roll += .03 * k * tremble(time * .3, 7); pitch += .02 * k * Math.max(0, tremble(time * .27, 11));
    }
    let impact = false;
    if (dying) {
      // The heart destabilises (a shudder), the legs give, the body falls and strikes the ground, a small rebound.
      const fall = clamp((age - FALL.start) / (FALL.impact - FALL.start), 0, 1);
      const rebound = age > FALL.impact ? Math.sin(Math.PI * clamp((age - FALL.impact) / (FALL.settle - FALL.impact), 0, 1)) * FALL.rebound : 0;
      const shudder = age < FALL.start ? .05 * tremble(age * 3, 5) : 0;
      bodyY += -FALL.drop * fall * fall + rebound + shudder;
      pitch += FALL.pitch * smooth(fall); roll += FALL.roll * smooth(fall);
      if (!impacted && age >= FALL.impact) { impacted = true; impact = true; }
    } else impacted = false;
    const body: V = [0, bodyY, 0];
    const pivot = rests[0] ? [0, rests[0].joints[0][1], 0] as V : [0, 0, 0] as V;
    const poses = rests.map((rest, i) => {
      const hip = add(tilt(rest.joints[0], pivot, pitch, roll), body);
      let foot = sub(legs[i].foot, origin), claw = restClaw[i], buckle = 0;
      if (dying) {
        const k = BUCKLE_ORDER.indexOf(i as typeof BUCKLE_ORDER[number]), start = BUCKLE.start + BUCKLE.stagger * k;
        buckle = smooth((age - start) / BUCKLE.duration);
        const out = norm([foot[0] - hip[0], 0, foot[2] - hip[2]]);
        foot = add(foot, scale(out, BUCKLE.slide * buckle));
        claw = restClaw[i] + (1.15 - restClaw[i]) * buckle;
      } else if (mode === 'overload') {
        claw += .05 * tremble(time * 2.2, i);
      }
      return solveLeg(rest, hip, foot, claw, buckle);
    });
    return { body, pitch, roll, legs: poses, planted, impact };
  }
  return { step, reset, get swinging() { return group; }, get feet() { return legs.map(leg => leg.foot); } };
}
