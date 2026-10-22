import { expect, test, type Page } from '@playwright/test';
import type { GameAudio } from '../../src/audio/engine';
import type { AudioMixer } from '../../src/audio/mixer';
import type { renderPreview } from '../fixtures/audio-lab';
import type { PlanetId, RunState } from '../../src/shared/contracts';
import type { startBoss } from '../../src/sim/bastion';

type Diagnostics = ReturnType<GameAudio['diagnostics']>;
const status = (page: Page): Promise<Diagnostics> => page.evaluate(() =>
  (window as unknown as { __LAST_WORLDS__: { audio(): Diagnostics } }).__LAST_WORLDS__.audio());
type Lab = { renderPreview: typeof renderPreview; live: GameAudio; run: RunState; startBoss: typeof startBoss; AudioMixer: typeof AudioMixer };

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

test('four real offline mixes and a crowded combat mix have headroom and survive mono playback', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/tests/fixtures/audio-lab.html');
  await page.waitForFunction(() => '__AUDIO_LAB__' in window);
  const signatures = [];
  for (const planet of ['luna', 'khepri', 'nacre', 'vesper'] as PlanetId[]) {
    const metrics = await page.evaluate(async planet => {
      const lab = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
      return (await lab.renderPreview(planet, 12, planet === 'nacre')).metrics;
    }, planet);
    expect(metrics.peak).toBeLessThan(.98);
    expect(metrics.rms).toBeGreaterThan(.015);
    expect(metrics.clipped).toBe(0);
    expect(metrics.monoRms / metrics.rms).toBeGreaterThan(.85);
    expect(metrics.sampleBytes).toBeLessThan(9 * 1024 * 1024);
    expect(metrics.peakVoices).toBeLessThanOrEqual(56);
    signatures.push(metrics.rms);
  }
  expect(new Set(signatures).size).toBe(4);
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
      mixer.setBossIntensity(2, 0);
      for (let i = 0; i < 100; i++) {
        mixer.note({ instrument: 'pad', pitch: 48 + i % 12, gain: .2, wet: .5, pan: .1 }, .01);
        mixer.note({ instrument: 'round-bass', pitch: 36, gain: .3, wet: 0, pan: 0 }, .01, true);
        mixer.cue({ sound: 'life', pan: 0, gain: 1, variant: i }, .01);
      }
      const output = await ctx.startRendering();
      checks.push({ peak: Math.max(...output.getChannelData(0)), voices: mixer.diagnostics().peakVoices });
      mixer.dispose();
    }
    const ctx = new OfflineAudioContext(2, 44100, 44100), mixer = new AudioMixer(ctx, { muted: false, music: 1, effects: 1 });
    mixer.setActive(true);
    for (let i = 0; i < 300; i++) mixer.note({ instrument: 'pad', pitch: 48 + i % 12, gain: .04, wet: .2, pan: .1 }, .01);
    for (let i = 0; i < 70; i++) mixer.cue({ sound: 'boss-death', pan: 0, gain: .2, variant: i }, .02 + i * .026);
    const bounded = mixer.diagnostics();
    const output = await ctx.startRendering();
    const peak = Math.max(...output.getChannelData(0).map(Math.abs));
    mixer.dispose();
    return { checks, bounded, peak };
  });
  expect(results.checks).toEqual([{ peak: 0, voices: 0 }, { peak: 0, voices: 0 }]);
  expect(results.bounded.musicVoices).toBeLessThanOrEqual(36);
  expect(results.bounded.effectsVoices).toBeLessThanOrEqual(20);
  expect(results.bounded.peakVoices).toBeLessThanOrEqual(56);
  expect(results.peak).toBeLessThan(.98);
});

test('boss music fades on the running score, survives pause, and clears for the next run', async ({ page }) => {
  await page.goto('/tests/fixtures/audio-lab.html');
  await page.getByRole('button', { name: 'Play Nacre', exact: true }).click();
  const liveStatus = () => page.evaluate(() => (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__.live.diagnostics());
  await expect.poll(async () => (await liveStatus()).scoreStep).toBeGreaterThan(3);
  const arrival = await page.evaluate(() => {
    const { live, run, startBoss } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
    const before = live.diagnostics(); startBoss(run); live.observe(run);
    return { before, after: live.diagnostics() };
  });
  expect(arrival.after.scoreStep).toBe(arrival.before.scoreStep);
  expect(arrival.after.nextBeatAt).toBe(arrival.before.nextBeatAt);
  expect(arrival.after.bossTarget).toBe(.85);
  expect(arrival.after.bossMix).toBeLessThan(.05);
  await expect.poll(async () => (await liveStatus()).bossMix).toBeCloseTo(.85, 2);
  await page.evaluate(() => {
    const { live, run } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
    run.boss!.phase = 'core'; live.observe(run);
  });
  await expect.poll(async () => (await liveStatus()).bossMix).toBeCloseTo(1, 2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await liveStatus()).rms).toBeLessThan(.0001);
  await page.evaluate(() => (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__.live.resume());
  await expect.poll(async () => (await liveStatus()).rms).toBeGreaterThan(.001);
  expect((await liveStatus()).bossTarget).toBe(1);
  const defeat = await page.evaluate(() => {
    const { live, run } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
    const before = live.diagnostics(); run.boss!.phase = 'destroyed'; live.observe(run);
    return { before, after: live.diagnostics() };
  });
  expect(defeat.after.scoreStep).toBe(defeat.before.scoreStep);
  expect(defeat.after.nextBeatAt).toBe(defeat.before.nextBeatAt);
  expect(defeat.after.bossMix).toBeGreaterThan(.9);
  await expect.poll(async () => page.evaluate(() => {
    const { live, run } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
    live.observe(run); return live.diagnostics().bossMix;
  })).toBe(0);
  await page.getByRole('button', { name: 'Enter boss fight' }).click();
  await page.getByRole('button', { name: 'Play Nacre', exact: true }).click();
  expect(await liveStatus()).toMatchObject({ tension: 0, bossTarget: 0, bossMix: 0 });
});

test('all boss stems add low-end energy, preserve the level before/after fades, and keep headroom', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/tests/fixtures/audio-lab.html');
  await page.waitForFunction(() => '__AUDIO_LAB__' in window);
  for (const planet of ['luna', 'khepri', 'nacre', 'vesper'] as PlanetId[]) {
    const mixes = await page.evaluate(async planet => {
      const { renderPreview } = (window as unknown as { __AUDIO_LAB__: Lab }).__AUDIO_LAB__;
      const level = (await renderPreview(planet, 34)).metrics;
      const boss = (await renderPreview(planet, 34, false, 'boss')).metrics;
      const transition = (await renderPreview(planet, 34, false, 'transition')).metrics;
      return { level, boss, transition };
    }, planet);
    for (const m of [mixes.boss, mixes.transition]) {
      expect(m.peak, planet).toBeLessThan(.98);
      expect(m.clipped, planet).toBe(0);
      expect(m.monoRms / m.rms, planet).toBeGreaterThan(.85);
      expect(m.peakVoices, planet).toBeLessThanOrEqual(36);
    }
    const bassEnergy = (m: typeof mixes.level) => m.windows.slice(2, 30).reduce((s, w) => s + w.bassRms ** 2, 0);
    expect(bassEnergy(mixes.boss) / bassEnergy(mixes.level), planet).toBeGreaterThan(1.25);
    // The shared level music is still the exact original timeline, before arrival and after defeat.
    // Separate OfflineAudioContexts can differ by tiny floating-point filter/convolver rounding.
    for (let second = 0; second < 4; second++) {
      expect(mixes.transition.windows[second].rms, planet).toBeCloseTo(mixes.level.windows[second].rms, 6);
      expect(mixes.transition.windows[second].bassRms, planet).toBeCloseTo(mixes.level.windows[second].bassRms, 6);
    }
    expect(mixes.transition.windows[30].rms, planet).toBeCloseTo(mixes.level.windows[30].rms, 4);
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
