import { expect, test, type Page } from '@playwright/test';

const stats = async (page: Page) => JSON.parse(await page.locator('canvas.flight-canvas').getAttribute('data-render-stats') ?? '{}');
const qa = (page: Page, call: string) => page.evaluate(call);

// docs/33 § 6 (user, 3 November): a destroyed strike site goes up in its own sequence where it stood, and nothing in it
// (the effect layers, the ruin's cooling materials) compiles a program mid-flight.
test('a strike site\'s destruction plays where the site stood and compiles nothing mid-flight', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/site-destruction.html?mission=bastion&site=airfield&side=1&x=9&row=10');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120_000 });
  // The site's first frames (anything they compile is not the destruction's).
  await qa(page, '__SITE_QA__.advance(.1)');
  const late = await page.evaluate(() => ((window as any).__lateShaders as string[] ?? []).length);
  await qa(page, '__SITE_QA__.kill()');
  // The world flies on under it: a second of scroll.
  await qa(page, '__SITE_QA__.advance(1.1, true)');
  const after = await stats(page);
  expect(after.sites.destroyed).toBe(1);
  expect(after.particles).toBeGreaterThan(40);
  await page.screenshot({ path: info.outputPath('site-destruction.png') });
  expect(await page.evaluate(from => ((window as any).__lateShaders as string[] ?? []).slice(from), late)).toEqual([]);
  expect(errors).toEqual([]);
});
