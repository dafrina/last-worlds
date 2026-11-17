import { describe, expect, it } from 'vitest';
import { FALL, GROUPS, WALK_IN, createGait, solveLeg, walkInProgress, walkInReach, type LegRest, type Vec3 } from '../../src/render/cradle-gait';
import { CRADLE } from '../../src/content/cradle';

// A walker like THE CRADLE's rest pose (rig frame: x right, y up, z toward the player): hips high on the body, the femur
// reaching out level, the tibia down to an ankle, the claw down to its foot.
const leg = (azimuth: number): LegRest => {
  const dx = Math.sin(azimuth), dz = Math.cos(azimuth), at = (r: number, y: number): Vec3 => [dx * r, y, dz * r];
  return { joints: [at(1.6, 5.7), at(2.4, 5.8), at(4.2, 5.7), at(5.9, 3.6), at(6.1, 0)] };
};
const RESTS = [-140, -100, -70, -35, 140, 100, 70, 35].map(deg => leg(deg * Math.PI / 180));
const FLOOR = -7.5;
const flat = () => FLOOR;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Walks the body along x at `speed` for `seconds`, at 60 frames a second; returns every pose with its frame's origin. */
function walk(gait: ReturnType<typeof createGait>, speed: number, seconds: number, start = 0, mode: 'fight' | 'core' | 'overload' = 'fight') {
  const frames = [];
  for (let i = 0; i <= seconds * 60; i++) {
    const time = 100 + start + i / 60, origin: Vec3 = [speed * (start + i / 60), FLOOR, 0];
    frames.push({ time, origin, pose: gait.step({ time, origin, mode }), feet: gait.feet.map(f => [...f] as Vec3), swinging: gait.swinging });
  }
  return frames;
}

describe('THE CRADLE gait (render-only)', () => {
  it('keeps every leg joined: the solved chain has the rest pose\'s segment lengths', () => {
    for (const rest of RESTS) {
      const hip = rest.joints[0], foot: Vec3 = [rest.joints[4][0] * .8, -.3, rest.joints[4][2] * .8];
      const chain = solveLeg(rest, hip, foot, .06);
      for (let s = 0; s < 4; s++) expect(distance(chain[s], chain[s + 1])).toBeCloseTo(distance(rest.joints[s], rest.joints[s + 1]), 4);
      expect(distance(chain[4], foot)).toBeLessThan(1e-6);
      // The knee arches above the line from the coxa's end to the ankle.
      expect(chain[2][1]).toBeGreaterThan((chain[1][1] + chain[3][1]) / 2);
    }
  });

  it('plants feet on the ground: a standing foot never slides while the body walks over it', () => {
    const gait = createGait(RESTS, { ground: flat, floor: FLOOR });
    const frames = walk(gait, 1.2, 8);
    let standing = 0;
    for (let i = 1; i < frames.length; i++) for (let k = 0; k < 8; k++) {
      const swung = GROUPS[frames[i].swinging]?.includes(k as never) || GROUPS[frames[i - 1].swinging]?.includes(k as never);
      if (swung) continue;
      expect(distance(frames[i].feet[k], frames[i - 1].feet[k])).toBeLessThan(1e-9);
      expect(frames[i].feet[k][1]).toBeCloseTo(FLOOR, 9);
      standing++;
    }
    expect(standing).toBeGreaterThan(8 * frames.length * .5);
    // It kept up with the body: every foot ends near its home beside the body.
    const last = frames.at(-1)!;
    for (let k = 0; k < 8; k++) expect(Math.abs(last.feet[k][0] - last.origin[0] - RESTS[k].joints[4][0] * .9)).toBeLessThan(2.2);
  });

  it('alternates its tetrapods: one group swings at a time, the groups take turns, four feet always stand', () => {
    const gait = createGait(RESTS, { ground: flat, floor: FLOOR });
    const frames = walk(gait, 1.5, 10);
    const swings: number[] = [];
    for (const frame of frames) {
      if (frame.swinging >= 0 && swings.at(-1) !== frame.swinging) swings.push(frame.swinging);
      const lifted = frame.feet.filter(f => f[1] > FLOOR + 1e-6).length;
      expect(lifted).toBeLessThanOrEqual(4);
    }
    expect(swings.length).toBeGreaterThan(6);
    for (let i = 1; i < swings.length; i++) expect(swings[i]).not.toBe(swings[i - 1]);
  });

  it('collapses onto the ground when it dies: walking stops, the legs buckle, the body falls and stays down', () => {
    const gait = createGait(RESTS, { ground: flat, floor: FLOOR });
    walk(gait, 1, 3);
    const origin: Vec3 = [3, FLOOR, 0];
    let impacts = 0, pose = gait.step({ time: 103.02, origin, mode: 'dying', deathAge: 0 });
    for (let i = 1; i <= 4 * 60; i++) {
      pose = gait.step({ time: 103.02 + i / 60, origin, mode: 'dying', deathAge: i / 60 });
      if (pose.impact) impacts++;
      expect(gait.swinging === -1 || i < 20).toBe(true);
    }
    expect(impacts).toBe(1);
    expect(pose.body[1]).toBeCloseTo(-FALL.drop, 1);
    // Every foot is back on the ground, slid outward; every hip came down with the body.
    for (const [k, chain] of pose.legs.entries()) {
      expect(chain[4][1]).toBeCloseTo(0, 6);
      expect(chain[0][1]).toBeLessThan(RESTS[k].joints[0][1] - FALL.drop * .5);
    }
  });

  it('is deterministic: the same frames give the same poses', () => {
    const run = () => { const gait = createGait(RESTS, { ground: (x, z) => FLOOR + Math.sin(x * .7) * .3 + Math.cos(z * .5) * .2, floor: FLOOR }); return walk(gait, -1.1, 6, 0, 'overload').map(f => f.pose); };
    expect(run()).toEqual(run());
  });

  it('walks in heavily: never faster than its top speed, done within its arrival', () => {
    const reach = walkInReach();
    let fastest = 0;
    for (let t = 0; t < 4; t += 1 / 120) fastest = Math.max(fastest, reach * (walkInProgress(t + 1 / 120) - walkInProgress(t)) * 120);
    expect(fastest).toBeLessThanOrEqual(WALK_IN.speed + 1e-6);
    expect(walkInProgress(0)).toBe(0);
    expect(walkInProgress(WALK_IN.duration)).toBeCloseTo(1, 9);
    expect(WALK_IN.duration).toBeLessThan(CRADLE.arrivalDuration);
  });

  it('replants on the terrain\'s height where each foot lands', () => {
    const ground = (x: number) => FLOOR + (x > 2 ? .6 : 0);
    const gait = createGait(RESTS, { ground, floor: FLOOR });
    const frames = walk(gait, 1.4, 6);
    const last = frames.at(-1)!;
    for (const foot of last.feet) if (gait.swinging < 0) expect(foot[1]).toBeCloseTo(ground(foot[0]), 9);
  });
});
