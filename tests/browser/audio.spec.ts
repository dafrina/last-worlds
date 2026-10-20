import { expect, test, type Page } from '@playwright/test';
import type { GameAudio } from '../../src/audio/engine';
import type { AudioMixer } from '../../src/audio/mixer';
import type { renderPreview } from '../fixtures/audio-lab';
import type { PlanetId } from '../../src/shared/contracts';

type Diagnostics = ReturnType<GameAudio['diagnostics']>;
const status = (page: Page): Promise<Diagnostics> => page.evaluate(() =>
  (window as unknown as { __LAST_WORLDS__: { audio(): Diagnostics } }).__LAST_WORLDS__.audio());
type Lab = { renderPreview: typeof renderPreview; live: GameAudio; AudioMixer: typeof AudioMixer };

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
      for (let i = 0; i < 100; i++) {
        mixer.note({ instrument: 'pad', pitch: 48 + i % 12, gain: .2, wet: .5, pan: .1 }, .01);
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
