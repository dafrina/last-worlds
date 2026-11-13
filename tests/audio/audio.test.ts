import { describe, expect, it } from 'vitest';
import { SoundObserver } from '../../src/audio/events';
import { sanitizeSettings, successKey } from '../../src/audio/engine';
import { synthesize, SAMPLE_IDS } from '../../src/audio/samples';
import { ScoreClock, scoreStep, THEMES } from '../../src/audio/score';
import { bossStep } from '../../src/audio/boss-score';
import { createRun, hitPlayer, stepRun } from '../../src/sim/game';
import { EMPTY_INPUT, STEP, type PlanetId } from '../../src/shared/contracts';

describe('the effects reworked on 11 November', () => {
  const pcm = (id: string) => {
    const bytes = new Uint8Array(synthesize(id as never).buffer);
    let h = 2166136261;
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  it('pins every effect sample: seventeen unchanged since 20 October, eleven made on 11 November', () => {
    // User, 11 November: the shots, the hit gong, the success sound; a whoosh for the warp; a clank for a part; upgrades
    // as the shield's bell rising; in rounds 2 and 3 gritty klaxons for the alarms, rockets for the Seeker Array.
    // 12 November: the alarms replaced again: the field thud for a shield hit (twice for the last charge), the deny
    // buzzer for a life lost. 13 November: the success sound a short ring ("like a rrrrring").
    // Every other effect is byte for byte what it was.
    const unchanged = {
      enemy: '36a0d0cf', impact: 'a604939b', explosion: '8200421a', heavy: '3a14ddae', pickup: 'afcdf1a8', ready: '55b0aa29', shockwave: '7e19744a', 'seeker-rack': '609dc1d1', 'siege-lance': 'd2f2673a', 'gravity-well': '32151ad0', warning: '5229a0ca', beam: '0309b3b2', 'boss-arrival': '665ca708', 'boss-phase': '58db8d53', 'boss-death': '5b11baec', warp: 'df2ea95d', loss: 'f64d1595',
    };
    const reworked = {
      whoosh: '5e156c36', pulse: '3bdb43b5', fan: 'f3441840', seeker: 'cf789869', rail: '2cac85e0', shield: '951fdde4', 'shield-break': 'de47a98f', life: 'cc117f50', part: '4f76939e', upgrade: '140e99dc', win: 'fa554d4e',
    };
    for (const [id, hash] of Object.entries({ ...unchanged, ...reworked })) expect(pcm(id), id).toBe(hash);
  });
  it('makes the player\'s shots short and sharp: gone within a fraction of a second, their energy up front', () => {
    for (const id of ['pulse', 'fan', 'seeker', 'rail'] as const) {
      const samples = synthesize(id), early = Math.round(.03 * 32000);
      let first = 0, total = 0;
      samples.forEach((v, i) => { total += v * v; if (i < early) first += v * v; });
      // The Seeker Array launches rockets (round 2): a little longer, an ignition hiss after its thump.
      expect(samples.length / 32000, id).toBeLessThanOrEqual(id === 'rail' || id === 'seeker' ? .16 : .09);
      expect(first / total, id).toBeGreaterThan(id === 'rail' ? .6 : id === 'seeker' ? .5 : .75);
    }
  });
  it('plays a part as a clank, credits as the plain pickup, and the planet jump with its whoosh', () => {
    const state = createRun({ mode: 'campaign', mission: 'training', seed: 3 }), observer = new SoundObserver();
    observer.reset(state);
    const pickup = () => state.effects.push({ id: state.nextId++, kind: 'pickup', x: state.player.x, s: 0, ttl: .3, duration: .3 });
    state.time += .02; state.parts = (state.parts ?? 0) + 1; pickup();
    expect(observer.read(state).map(e => e.sound)).toEqual(['part']);
    state.time += .02; pickup();
    expect(observer.read(state).map(e => e.sound)).toEqual(['pickup']);
    state.time += .02; state.player.shields -= 1; observer.reset(state); state.time += .02; state.player.shields += 1; pickup();
    expect(observer.read(state).map(e => e.sound)).toEqual(['upgrade']);
    state.time += .02; state.jump = { startedAt: state.time, duration: 3, from: 'khepri', to: 'vesper' };
    expect(observer.read(state).map(e => e.sound)).toEqual(['warp', 'whoosh']);
  });
  it('resolves a mission in its world\'s key', () => {
    // Nahara's own score is in D (docs/39, 13 November).
    expect((Object.keys(THEMES) as PlanetId[]).map(successKey)).toEqual([2, -3, 0, -1, -5, 4, -6, 2]);
  });
});

describe('combat audio observes real gameplay', () => {
  it('does not fire at empty sky, changes no state, and never replays an observed event', () => {
    const state = createRun({ mode: 'endless', seed: 7 }), observer = new SoundObserver();
    observer.reset(state);
    const seen = new Set<string>();
    for (let i = 0; i < 1200 && state.phase === 'playing'; i++) {
      const volley = state.nextVolleyAt;
      stepRun(state, EMPTY_INPUT, STEP);
      const before = structuredClone(state);
      const events = observer.read(state);
      expect(state).toEqual(before);
      expect(events.filter(e => e.sound === state.player.weapon)).toHaveLength(state.nextVolleyAt > volley ? 1 : 0);
      for (const event of events) seen.add(event.sound);
      expect(observer.read(state)).toEqual([]);
    }
    expect(seen.has('pulse')).toBe(true);
  });
  it('coalesces a fan volley and delayed enemy burst without confusing them with special missiles', () => {
    const state = createRun({ mode: 'campaign', mission: 'training', seed: 9, weapon: 'fan' }), observer = new SoundObserver();
    observer.reset(state);
    state.nextVolleyAt = .3;
    const shot = { x: 0, s: 8, previousX: 0, previousS: 8, vx: 0, vs: -5, friendly: false, damage: 1, radius: .1, ttl: 3 };
    state.projectiles = [{ ...shot, id: state.nextId++ }, { ...shot, id: state.nextId++, delay: .1 }];
    expect(observer.read(state).map(e => e.sound)).toEqual(['fan', 'enemy']);
    expect(observer.read(state)).toEqual([]);
    state.projectiles[1].delay = 0;
    expect(observer.read(state).map(e => e.sound)).toEqual(['enemy']);
  });
  it('keeps shield break and life loss distinct, including the final frame', () => {
    const state = createRun({ mode: 'endless', seed: 1 }), observer = new SoundObserver();
    observer.reset(state);
    state.time = .1; state.player.invulnerableUntil = -1; hitPlayer(state, 9);
    expect(observer.read(state).map(e => e.sound)).toContain('shield-break');
    state.player.lives = 1; state.player.invulnerableUntil = -1;
    observer.reset(state); state.time += .1; hitPlayer(state, 1);
    const events = observer.read(state).map(e => e.sound);
    expect(events).toContain('life'); expect(events).toContain('loss');
    expect(events.filter(e => e === 'explosion')).toHaveLength(0);
    expect(observer.read(state)).toEqual([]);
  });
  it('suppresses offscreen battles, pause events, and a debug fast-forward backlog', () => {
    const state = createRun({ mode: 'endless', seed: 1 }), observer = new SoundObserver(); observer.reset(state);
    state.effects.push({ id: state.nextId++, kind: 'explosion', x: 14, s: 8, ttl: .5, duration: .5 });
    expect(observer.read(state)).toEqual([]);
    state.phase = 'paused'; expect(observer.read(state)).toEqual([]);
    state.phase = 'playing'; state.time += 9; state.nextVolleyAt += 9;
    expect(observer.read(state)).toEqual([]);
    observer.reset(createRun({ mode: 'endless', seed: 1 }));
    expect(observer.read(createRun({ mode: 'endless', seed: 1 }))).toEqual([]);
  });
});

describe('authored music and bounded scheduler', () => {
  it('has distinct scores, coherent phrase variation, and stronger boss arrangements', () => {
    const signatures = [];
    for (const planet of Object.keys(THEMES) as PlanetId[]) {
      const normal = Array.from({ length: 512 }, (_, s) => scoreStep(planet, s));
      const stem = Array.from({ length: 512 }, (_, s) => bossStep(planet, s, 2));
      expect(stem.flat().length).toBeGreaterThan(400);
      expect(stem.flat().every(n => !['pad', 'bloom-pad', 'piano', 'glass', 'saw-lead', 'harp-high', 'solar'].includes(n.instrument))).toBe(true);
      expect(normal.slice(0, 128)).not.toEqual(normal.slice(128, 256));
      expect(normal.slice(256, 384).flat().length).toBeLessThan(normal.slice(128, 256).flat().length);
      expect(normal.flat().every(n => Number.isFinite(n.pitch) && n.gain > 0 && n.gain <= .5)).toBe(true);
      signatures.push(JSON.stringify(normal));
    }
    // Every world's own score is distinct (Nahara's own since 13 November, docs/39).
    expect(new Set(signatures).size).toBe(Object.keys(THEMES).length);
  });
  // Boss stem harmony, stages and transitions: tests/audio/boss-music.test.ts.
  it('schedules ahead, never duplicates notes, and drops missed beats after a stall', () => {
    const clock = new ScoreClock(); clock.reset(.035);
    expect(clock.take(0, 'nacre').map(x => x.step)).toEqual([0]);
    expect(clock.take(0, 'nacre')).toEqual([]);
    const after = clock.take(30, 'nacre');
    expect(after.length).toBeLessThanOrEqual(2);
    expect(after[0].step).toBeGreaterThan(200);
    expect(after.every(slot => slot.at > 30)).toBe(true);
    // Repeated slow frames advance the score; they must not restart a pad chord on every frame.
    const slow = Array.from({ length: 20 }, (_, i) => clock.take(30.3 + i * .3, 'nacre')).flat();
    expect(slow.filter(slot => slot.step % 32 === 0).length).toBeLessThan(3);
  });
});

it('validates independently stored audio preferences without touching a campaign save', () => {
  expect(sanitizeSettings({ music: Infinity, effects: -3, muted: 'yes' })).toEqual({ music: .55, effects: 0, muted: false });
  expect(sanitizeSettings(null)).toEqual({ music: .55, effects: .8, muted: false });
});

it('all original samples are finite, have headroom and click-free edges', () => {
  let bytes = 0;
  for (const id of SAMPLE_IDS) {
    const pcm = synthesize(id); bytes += pcm.byteLength;
    let peak = 0, sum = 0, squares = 0;
    for (const value of pcm) { peak = Math.max(peak, Math.abs(value)); sum += value; squares += value * value; }
    expect(peak, id).toBeGreaterThan(.05);
    expect(peak, id).toBeLessThanOrEqual(.851);
    expect(Math.abs(sum / pcm.length), id).toBeLessThan(.002);
    expect(Math.sqrt(squares / pcm.length), id).toBeGreaterThan(.005);
    expect(Math.abs(pcm[0]) + Math.abs(pcm.at(-1)!), id).toBeLessThan(.003);
  }
  // 8.9 MiB before the 10 November boss and recomposed-world instruments; 12.3 MiB with the 11 November orchestral voices;
  // 13.4 MiB with the reworked worlds' voices (phase 4); 14.3 MiB with Nahara's own (13 November).
  expect(bytes).toBeLessThan(15 * 1024 * 1024);
});
