import { describe, expect, it } from 'vitest';
import { SoundObserver } from '../../src/audio/events';
import { sanitizeSettings } from '../../src/audio/engine';
import { synthesize, SAMPLE_IDS } from '../../src/audio/samples';
import { ScoreClock, bossStep, scoreStep, THEMES } from '../../src/audio/score';
import { createRun, hitPlayer, stepRun } from '../../src/sim/game';
import { EMPTY_INPUT, STEP, type PlanetId } from '../../src/shared/contracts';

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
      const stem = Array.from({ length: 512 }, (_, s) => bossStep(planet, s));
      expect(stem.flat().length).toBeGreaterThan(400);
      expect(stem.flat().every(n => n.wet === 0 && !['pad', 'bloom-pad', 'piano', 'glass', 'saw-lead'].includes(n.instrument))).toBe(true);
      expect(normal.slice(0, 128)).not.toEqual(normal.slice(128, 256));
      expect(normal.slice(256, 384).flat().length).toBeLessThan(normal.slice(128, 256).flat().length);
      expect(normal.flat().every(n => Number.isFinite(n.pitch) && n.gain > 0 && n.gain <= .5)).toBe(true);
      signatures.push(JSON.stringify(normal));
    }
    expect(new Set(signatures).size).toBe(4);
  });
  it('keeps added bass on the level riff and harmony across every chord and phrase', () => {
    for (const planet of Object.keys(THEMES) as PlanetId[]) {
      const theme = THEMES[planet];
      for (let step = 0; step < 512; step++) {
        const root = theme.root - 12 + theme.chords[Math.floor(step / 32) % 4][0];
        const riff = theme.bass[step % 16];
        const bass = bossStep(planet, step).filter(n => n.instrument.endsWith('bass'));
        for (const n of bass) {
          expect(n.pitch - root).toBe(riff >= 0 ? riff : step % 4 === 2 ? 12 : 0);
          expect(n.pan).toBe(0);
        }
      }
    }
  });
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
  expect(bytes).toBeLessThan(9 * 1024 * 1024);
});
