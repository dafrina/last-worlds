import { expect, test, type Page } from '@playwright/test';
import type { GameAudio } from '../../src/audio/engine';
import type { AudioMixer } from '../../src/audio/mixer';
import type { renderTimeline } from '../fixtures/audio-lab';
import type { PlanetId, RunState } from '../../src/shared/contracts';
import type { startBoss } from '../../src/sim/boss';

type Diagnostics = ReturnType<GameAudio['diagnostics']>;
const status = (page: Page): Promise<Diagnostics> => page.evaluate(() =>
  window.__LAST_WORLDS__!.audio());
type Lab = { renderTimeline: typeof renderTimeline; live: GameAudio; run: RunState; startBoss: typeof startBoss; AudioMixer: typeof AudioMixer };

test.beforeEach(async ({ page }) => {
  // Concurrent art/preview writes must not reload a live AudioContext halfway through a fade.
  await page.routeWebSocket('**/*', socket => socket.close());
});

test('audio unlocks on launch, pauses silently, resumes, and remembers separate mix settings', async ({ page }, info) => {
  test.setTimeout(70_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  expect((await status(page)).state).toBe('locked');
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Graphics quality' }).getByRole('radio', { name: 'Low' }).click();
  await page.getByRole('slider', { name: 'Music volume' }).fill('40');
  await page.getByRole('slider', { name: 'Effects volume' }).fill('75');
  await page.screenshot({ path: info.outputPath('audio-settings-phone.png') });
  await page.locator('[data-settings-back]').click();
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await expect.poll(async () => (await status(page)).state).toBe('running');
  await expect.poll(async () => (await status(page)).rms).toBeGreaterThan(.001);
  expect(await status(page)).toMatchObject({ music: .4, effects: .75, planet: 'luna' });
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await expect.poll(async () => (await status(page)).rms).toBeLessThan(.0001);
  expect(await status(page)).toMatchObject({ active: false, voices: 0 });
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect.poll(async () => (await status(page)).active, { timeout: 8000 }).toBe(true);
  await expect.poll(async () => (await status(page)).rms).toBeGreaterThan(.001);
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Sound', exact: true }).getByRole('radio', { name: 'Off', exact: true }).click();
  expect((await status(page)).muted).toBe(true);
  await page.reload();
  expect(await status(page)).toMatchObject({ state: 'locked', muted: true, music: .4, effects: .75 });
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Music volume' })).toHaveValue('40');
  await expect(page.getByRole('radiogroup', { name: 'Sound', exact: true }).getByRole('radio', { name: 'Off', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});


const WORLDS: PlanetId[] = ['luna', 'khepri', 'nacre', 'vesper', 'amnion', 'corona', 'umbra'];
type Metrics = Awaited<ReturnType<typeof renderTimeline>>['metrics'];
const sound = (m: Metrics, name: string) => {
  expect(m.peak, name).toBeLessThan(.98);
  expect(m.clipped, name).toBe(0);
  expect(m.nonFinite, name).toBe(0);
  expect(m.monoRms / m.rms, name).toBeGreaterThan(.85);
  expect(m.peakVoices, name).toBeLessThanOrEqual(VOICES);
};
const VOICES = 36 + 24 + 20;

test('seven real offline mixes and a crowded combat mix have headroom and survive mono playback', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/tests/fixtures/audio-lab.html');
  await page.waitForFunction(() => '__AUDIO_LAB__' in window);
  const signatures = [];
  for (const planet of WORLDS) {
    const metrics = await page.evaluate(async planet =>
      (await (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__.renderTimeline({ planet, bars: 6, startStep: 128, combat: planet === 'nacre' })).metrics, planet);
    sound(metrics, planet);
    expect(metrics.rms, planet).toBeGreaterThan(.015);
    expect(metrics.sampleBytes, planet).toBeLessThan(14 * 1024 * 1024);
    signatures.push(metrics.rms);
  }
  expect(new Set(signatures).size).toBe(WORLDS.length);
});

test('submix silence and hard voice limits are enforced in the actual Web Audio graph', async ({ page }) => {
  await page.goto('/tests/fixtures/audio-lab.html');
  await page.waitForFunction(() => '__AUDIO_LAB__' in window);
  const results = await page.evaluate(async () => {
    const { AudioMixer } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
    const checks = [];
    for (const muted of [true, false]) {
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      const mixer = new AudioMixer(ctx, { muted, music: 0, effects: muted ? 1 : 0 });
      mixer.setActive(true);
      mixer.setBossMix(1, 0);
      for (let i = 0; i < 100; i++) {
        mixer.note({ instrument: 'frost', pitch: 48 + i % 12, gain: .2, wet: .5, pan: .1 }, .01);
        mixer.note({ instrument: 'growl', pitch: 36, gain: .3, wet: .2, pan: 0 }, .01, true);
        mixer.cue({ sound: 'life', pan: 0, gain: 1, variant: i }, .01);
      }
      const output = await ctx.startRendering();
      checks.push({ peak: Math.max(...output.getChannelData(0)), voices: mixer.diagnostics().peakVoices });
      mixer.dispose();
    }
    const ctx = new OfflineAudioContext(2, 44100, 44100), mixer = new AudioMixer(ctx, { muted: false, music: 1, effects: 1 });
    mixer.setActive(true); mixer.setBossMix(1, 0);
    for (let i = 0; i < 300; i++) mixer.note({ instrument: 'frost', pitch: 48 + i % 12, gain: .04, wet: .2, pan: .1 }, .01);
    for (let i = 0; i < 300; i++) mixer.note({ instrument: i % 2 ? 'strings' : 'braam', pitch: 40 + i % 12, gain: .04, wet: .2, pan: -.1, priority: i % 4 }, .01, true);
    for (let i = 0; i < 70; i++) mixer.cue({ sound: 'boss-death', pan: 0, gain: .2, variant: i }, .02 + i * .026);
    const bounded = mixer.diagnostics();
    const output = await ctx.startRendering();
    const peak = Math.max(...output.getChannelData(0).map(Math.abs));
    mixer.dispose();
    return { checks, bounded, peak };
  });
  expect(results.checks).toEqual([{ peak: 0, voices: 0 }, { peak: 0, voices: 0 }]);
  expect(results.bounded.musicVoices).toBeLessThanOrEqual(36);
  expect(results.bounded.bossVoices).toBeLessThanOrEqual(24);
  expect(results.bounded.effectsVoices).toBeLessThanOrEqual(20);
  expect(results.bounded.peakVoices).toBeLessThanOrEqual(VOICES);
  expect(results.peak).toBeLessThan(.98);
});

test('a kick dips the keyed basses and leads in the actual Web Audio graph, and never the pads', async ({ page }) => {
  await page.goto('/tests/fixtures/audio-lab.html');
  await page.waitForFunction(() => '__AUDIO_LAB__' in window);
  const dips = await page.evaluate(async () => {
    const { AudioMixer } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
    // A held voice, and a near-silent kick at 0.5 s that keys the sidechain (or not); RMS just after the kick (the
    // master compressor and limiter delay the output by about 12 ms), and once it has recovered, against the same
    // render without the key.
    const render = async (instrument: 'bass' | 'frost', keyed: boolean) => {
      const ctx = new OfflineAudioContext(1, 44100, 44100), mixer = new AudioMixer(ctx, { muted: false, music: 1, effects: 0 });
      mixer.setActive(true);
      mixer.note({ instrument, pitch: instrument === 'bass' ? 36 : 48, gain: .3, wet: 0, pan: 0 }, .3);
      mixer.note({ instrument: 'snap-kick', pitch: 36, gain: 1e-4, wet: 0, pan: 0, ...(keyed ? { duck: { depth: .5, release: .1 } } : {}) }, .5);
      const out = (await ctx.startRendering()).getChannelData(0);
      const rms = (from: number, to: number) => Math.sqrt(out.subarray(from * 44100, to * 44100).reduce((s, v) => s + v * v, 0) / ((to - from) * 44100));
      mixer.dispose();
      return { dip: rms(.52, .535), after: rms(.75, .8) };
    };
    const ratio = async (instrument: 'bass' | 'frost') => {
      const [plain, keyed] = [await render(instrument, false), await render(instrument, true)];
      return { dip: keyed.dip / plain.dip, after: keyed.after / plain.after };
    };
    return { bass: await ratio('bass'), pad: await ratio('frost') };
  });
  // A depth of 0.5 dips the bass to about half (measured 0.48), recovering within about a tenth of a second.
  expect(dips.bass.dip).toBeLessThan(.6);
  expect(dips.bass.after).toBeGreaterThan(.95);
  expect(dips.pad.dip).toBeCloseTo(1, 2);
});

test('boss phases change the arrangement on the running score\'s grid, survive pause, and clear for the next run', async ({ page }) => {
  await page.goto('/tests/fixtures/audio-lab.html');
  await page.getByRole('button', { name: 'Play Nacre', exact: true }).click();
  const liveStatus = () => page.evaluate(() => (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__.live.diagnostics());
  await expect.poll(async () => (await liveStatus()).scoreStep).toBeGreaterThan(3);
  // Each phase is observed while the score runs: the clock never moves, the change lands on its grid line ahead.
  const observe = (phase: 'arrival' | 'core' | 'overload' | 'destroyed') => page.evaluate(phase => {
    const { live, run, startBoss } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
    const before = live.diagnostics();
    if (phase === 'arrival') startBoss(run); else run.boss!.phase = phase;
    live.observe(run);
    return { before, after: live.diagnostics() };
  }, phase);
  const grid = { arrival: [16, 6], core: [4, 2], overload: [8, 4] } as const;
  for (const [phase, stage] of [['arrival', 1], ['core', 2], ['overload', 3]] as const) {
    const { before, after } = await observe(phase);
    expect(after.scoreStep, phase).toBe(before.scoreStep);
    expect(after.nextBeatAt, phase).toBe(before.nextBeatAt);
    expect(after.bossStage, phase).toBe(stage);
    expect(after.bossTarget, phase).toBe(1);
    const [every, room] = grid[phase];
    expect(after.switchAt! % every, phase).toBe(0);
    expect(after.switchAt! - after.scoreStep, phase).toBeGreaterThanOrEqual(room);
    expect(after.switchAt! - after.scoreStep, phase).toBeLessThan(room + every);
    await expect.poll(async () => (await liveStatus()).playingStage, { timeout: 8000 }).toBe(stage);
  }
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await liveStatus()).rms).toBeLessThan(.0001);
  await page.evaluate(() => (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__.live.resume());
  await expect.poll(async () => (await liveStatus()).rms).toBeGreaterThan(.001);
  expect(await liveStatus()).toMatchObject({ bossTarget: 1, bossStage: 3 });
  const defeat = await observe('destroyed');
  expect(defeat.after.scoreStep).toBe(defeat.before.scoreStep);
  expect(defeat.after.nextBeatAt).toBe(defeat.before.nextBeatAt);
  expect(defeat.after.bossStage).toBe(0);
  expect(defeat.after.bossMix).toBeGreaterThan(.9);
  await expect.poll(async () => page.evaluate(() => { const { live, run } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__; live.observe(run); return live.diagnostics().bossMix; })).toBe(0);
  await page.getByRole('button', { name: 'Enter boss fight' }).click();
  await page.getByRole('button', { name: 'Play Nacre', exact: true }).click();
  expect(await liveStatus()).toMatchObject({ bossStage: 0, playingStage: 0, bossTarget: 0, bossMix: 0 });
});

test('every world\'s boss stages grow in the rendered stem, and the level score is untouched before and after a fight', async ({ page }) => {
  // 35 offline renders; slow under SwiftShader and a loaded machine.
  test.setTimeout(600_000);
  await page.goto('/tests/fixtures/audio-lab.html');
  await page.waitForFunction(() => '__AUDIO_LAB__' in window);
  for (const planet of WORLDS) {
    const mixes = await page.evaluate(async planet => {
      const { renderTimeline } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
      const steady = (phase: 'batteries' | 'core' | 'overload', stemOnly: boolean) =>
        renderTimeline({ planet, bars: 8, startStep: 128, stemOnly, phases: [{ bar: 0, phase, immediate: true }] }).then(r => r.metrics);
      const stems = [await steady('batteries', true), await steady('core', true), await steady('overload', true)];
      const full = [await steady('batteries', false), await steady('core', false), await steady('overload', false)];
      const level = (await renderTimeline({ planet, bars: 24, startStep: 64 })).metrics;
      const fight = (await renderTimeline({ planet, bars: 24, startStep: 64, cues: false, phases: [{ bar: 2.2, phase: 'arrival' },
        { bar: 4.2, phase: 'batteries' }, { bar: 6.6, phase: 'core' }, { bar: 9.3, phase: 'overload' }, { bar: 12.1, phase: 'destroyed' },
        { bar: 13.1, phase: null }] })).metrics;
      return { stems, full, level, fight };
    }, planet);
    for (const m of [...mixes.full, mixes.fight]) sound(m, planet);
    // The 24-voice boss pool is a hard cap at each new note, even for notes scheduled ahead out of time order.
    expect(mixes.fight.peakBossVoices, planet).toBeLessThanOrEqual(24);
    // Measured after the first two seconds of each steady excerpt.
    const band = (m: Metrics, k: 'midRms' | 'highRms') => 10 * Math.log10(m.windows.slice(2, -2).reduce((s, w) => s + w[k] ** 2, 0) / (m.windows.length - 4));
    for (const k of ['midRms', 'highRms'] as const) {
      const [modules, core, overload] = mixes.stems.map(m => band(m, k));
      expect(core - modules, `${planet} ${k} modules → core`).toBeGreaterThan(.5);
      expect(overload - core, `${planet} ${k} core → overload`).toBeGreaterThan(.5);
    }
    // Power mostly from arrangement: the full mix grows by a few dB at most from modules to overload (5.5 since phase 4
    // gave the fights more low end; Vesper's spacious modules grow the most).
    const rms = (m: Metrics) => 20 * Math.log10(m.windows.slice(2, -2).reduce((s, w) => s + w.rms, 0) / (m.windows.length - 4));
    expect(rms(mixes.full[2]) - rms(mixes.full[0]), planet).toBeLessThan(5.5);
    // The level score is the exact same timeline before the boss arrives and once the stem has faded out.
    const bar = mixes.level.barSeconds, before = Math.floor(2.2 * bar) - 1, after = Math.ceil(19 * bar);
    for (let second = 0; second < before; second++) {
      expect(mixes.fight.windows[second].rms, `${planet} ${second}`).toBeCloseTo(mixes.level.windows[second].rms, 6);
    }
    for (let second = after; second < mixes.level.windows.length - 1; second++) {
      expect(mixes.fight.windows[second].rms, `${planet} ${second}`).toBeCloseTo(mixes.level.windows[second].rms, 4);
    }
  }
});

test('unavailable audio or storage cannot prevent a flight', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('No audio device'); } } });
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause flight' })).toBeVisible();
  expect((await status(page)).state).toBe('locked');
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await expect(page.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
});
