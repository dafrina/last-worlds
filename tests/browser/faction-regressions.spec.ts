import { expect, test, type Page } from '@playwright/test';
const ids = ['bastion', 'ark', 'warden', 'veil', 'cradle', 'eclipse'];
const stats = async (page: Page) => JSON.parse(await page.locator('canvas').first().getAttribute('data-render-stats') ?? '{}');
const visible = async (page: Page) => { const s = await stats(page); return ids.filter(id => s[id]?.visible); };

test('playground never retains a previous boss, its particles or its carrier pods', async ({ page }, info) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1100, height: 900 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('last-worlds.playground.view', JSON.stringify({ mission: 'bastion', boss: true, quality: 'low', tab: 'level' })));
  await page.goto('/playground.html');
  await expect.poll(() => visible(page), { timeout: 60000 }).toEqual(['bastion']);
  for (const [mission, id] of [['cold-vector', 'ark'], ['training', 'warden'], ['brood-strike', 'cradle'], ['final-horizon', 'eclipse'], ['deep-bloom', 'veil']]) {
    await page.locator('[data-view="mission"]').selectOption(mission);
    await expect.poll(() => visible(page), { timeout: 60000 }).toEqual([id]);
    const s = await stats(page);
    expect(s[id].model).toBe('glb');
    for (const other of ids.filter(other => other !== id)) {
      expect(s[other].particles, `${other} particles over ${id}`).toBe(0);
      expect(s[other].deployedPods ?? 0, `${other} pods over ${id}`).toBe(0);
    }
  }
  // All three carrier models are now loaded. Only THE VEIL may draw its launched pods.
  await expect(page.locator('.pg-hud')).toContainText('VEIL batteries', { timeout: 45000 });
  // The boss controls live on the playground's Boss tab, the level picker on its Level tab.
  await page.locator('[data-tab="boss"]').click();
  await page.locator('[data-boss="flanks"]').click();
  await expect.poll(async () => (await stats(page)).veil?.deployedPods, { timeout: 60000 }).toBeGreaterThan(0);
  const pods = await stats(page);
  expect(pods.cradle.deployedPods).toBe(0); expect(pods.eclipse.deployedPods).toBe(0);
  await page.screenshot({ path: info.outputPath('veil-only-pods.png') });
  await page.locator('[data-view="boss"]').uncheck();
  await expect.poll(() => visible(page)).toEqual([]);
  const clear = await stats(page);
  for (const id of ids) { expect(clear[id].particles).toBe(0); expect(clear[id].deployedPods ?? 0).toBe(0); }
  await page.locator('[data-tab="level"]').click();
  await page.locator('[data-view="mission"]').selectOption('bastion');
  await page.locator('[data-tab="boss"]').click();
  await page.locator('[data-view="boss"]').check();
  await expect.poll(() => visible(page), { timeout: 60000 }).toEqual(['bastion']);
  await page.screenshot({ path: info.outputPath('bastion-after-world-cycle.png') });
  expect(errors).toEqual([]);
});

for (const planet of ['amnion', 'umbra']) test(`${planet} dedicated predator loads and renders on both quality tiers`, async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const name = planet === 'amnion' ? 'amnion_brood_heavy' : 'umbra_wraith';
  for (const quality of ['low', 'high']) {
    await page.goto(`/tests/fixtures/phase-predators.html?planet=${planet}&quality=${quality}`);
    await expect.poll(async () => (await stats(page)).predators?.[name], { timeout: 45000 }).toBe(1);
    await page.screenshot({ path: info.outputPath(`${planet}-${quality}.png`) });
    if (planet === 'umbra') {
      await page.evaluate(() => (window as any).__PREDATOR_QA__.advance(2.25));
      await expect.poll(async () => page.evaluate(() => (window as any).__PREDATOR_QA__.snapshot().enemy.damageable)).toBe(false);
      await page.screenshot({ path: info.outputPath(`umbra-teleport-${quality}.png`) });
      await page.evaluate(() => (window as any).__PREDATOR_QA__.advance(.45));
      expect(await page.evaluate(() => (window as any).__PREDATOR_QA__.snapshot().projectiles)).toBe(3);
    }
  }
  expect(errors).toEqual([]);
});
