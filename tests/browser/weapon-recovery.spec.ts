import { expect, test } from '@playwright/test';
import type { RunState } from '../../src/shared/contracts';

declare global {
  interface Window { weaponRecovery: { hit(): void; pickup(): void; advance(frames: number): void; snapshot(): RunState } }
}

test('Endless hull loss and two-cell recovery agree with flight text, pause tier and real firing', async ({ page }, info) => {
  test.setTimeout(90_000); // Software WebGL startup plus four real three-second resume countdowns.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/weapon-recovery.html');
  await page.waitForFunction(() => !!window.weaponRecovery);
  const tier = async (value: number) => {
    await page.getByRole('button', { name: 'Pause flight' }).click();
    await expect(page.locator('.pause-weapon')).toHaveText(`Twin Pulse · TIER ${value}`);
    await page.locator('[data-action="resume"]').click();
    await expect.poll(() => page.evaluate(() => window.weaponRecovery.snapshot().phase)).toBe('playing');
  };
  await tier(5);
  await page.evaluate(() => window.weaponRecovery.hit());
  await expect(page.locator('.flight-message')).toContainText('FIGHTER RESTORED · WEAPON TIER 4');
  await tier(4);
  await page.evaluate(() => window.weaponRecovery.pickup());
  await expect(page.locator('.flight-message')).toContainText('POWER 1/2 · NEXT TIER 5');
  await tier(4);
  await page.evaluate(() => window.weaponRecovery.pickup());
  await expect(page.locator('.flight-message')).toContainText('WEAPON TIER 5');
  await tier(5);
  const streams = await page.evaluate(() => {
    window.weaponRecovery.advance(30);
    return [...new Set(window.weaponRecovery.snapshot().projectiles.filter(p => p.friendly).map(p => p.x))].sort();
  });
  expect(streams).toEqual([-.2, -.55, .2, .55].sort());
  await expect(page.locator('canvas.flight-canvas')).toHaveAttribute('data-render-stats', /"calls":/);
  await page.screenshot({ path: info.outputPath('restored-tier-5.png') });
  expect(errors).toEqual([]);
});
