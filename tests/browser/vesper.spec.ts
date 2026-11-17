import { expect, test } from '@playwright/test';
import { seedCampaign } from './campaign-save';
import { flying, snapshot } from './launch';

test('campaign offers Cold Vector on Vesper and launches it without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await seedCampaign(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'CAMPAIGN', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Cold Vector', exact: true }).click();
  await expect(page.locator('.mission-description')).toContainText('HELION STRONGHOLD');
  await page.getByRole('button', { name: /LAUNCH MISSION/ }).click();
  // Launch now waits for the planet's assets ("Preparing flight"), which can exceed the default 5 s under load.
  await expect.poll(async () => (await snapshot(page))?.phase, { timeout: 30_000 }).toBe('playing');
  expect((await snapshot(page)).config.mission).toBe('cold-vector');
  await expect(page.locator('canvas.flight-canvas')).toHaveAttribute('data-render-stats', /"calls":/);
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await expect(page.locator('.pause-description')).toContainText('Cold Vector');
  expect(errors).toEqual([]);
});

/** The renderer's HELION STRONGHOLD stats (src/render/stronghold-view.ts, under the boss's id `ark`). */
const stronghold = (page: import('@playwright/test').Page) => page.locator('canvas.flight-canvas').getAttribute('data-render-stats')
  .then(text => (JSON.parse(text ?? '{}') as { ark?: { visible: boolean; model: string } }).ark);

test('HELION STRONGHOLD stands in its cliff, fights through its phases without moving and leaves its wreck as Cold Vector completes', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => window.__LAST_WORLDS__!.launch({ mode: 'campaign', mission: 'cold-vector', seed: 7, difficulty: 'standard', weapon: 'pulse' }));
  await flying(page);
  const hooks = (fn: string, arg?: number) => page.evaluate(([f, a]) => { const L = window.__LAST_WORLDS__!; if (f === 'advance') L.advance(a!); else (L as unknown as Record<string, () => void>)[f](); }, [fn, arg] as const);
  // The arena scrolls in: the fortress already stands in its cliff before its fight (no glide-in).
  await hooks('advance', 188);
  await expect.poll(async () => (await stronghold(page))?.visible, { timeout: 20_000 }).toBe(true);
  expect((await stronghold(page))?.model).toBe('glb');
  expect((await snapshot(page)).boss).toBeNull();
  await hooks('advance', 9);
  let state = await snapshot(page);
  expect(state.boss).toMatchObject({ id: 'ark', phase: 'batteries', x: 0, s: 11.5 });
  for (const [move, phase] of [['killFlanks', 'core'], ['bossOverload', 'overload'], ['killBoss', 'destroyed']] as const) {
    await hooks(move); await hooks('advance', 1.5);
    state = await snapshot(page);
    expect(state.boss).toMatchObject({ phase, x: 0 });
    await expect.poll(async () => (await stronghold(page))?.visible, { timeout: 10_000 }).toBe(true);
  }
  // The wreck stays; the scroll carries it away and the mission completes on the usual schedule.
  await hooks('advance', 8);
  expect((await snapshot(page)).phase).toBe('complete');
  expect(errors).toEqual([]);
});
