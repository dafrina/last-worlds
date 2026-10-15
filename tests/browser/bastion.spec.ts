import { expect, test } from '@playwright/test';

test('campaign exposes the fortress sortie and preserves training as a separate selection', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /CAMPAIGN FLIGHT/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Rolling Thunder', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.mission-description')).toContainText('Bastion-9');
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Training', exact: true }).click();
  await page.getByRole('button', { name: /LAUNCH SORTIE/ }).click();
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await expect(page.locator('.pause-description')).toContainText('Training');
});

test('fortress renders all active phases in the actual game renderer without browser errors', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const phase of ['batteries', 'core', 'overload']) {
    await page.goto(`/tests/fixtures/bastion.html?phase=${phase}&still=1`);
    await expect(page.locator('canvas.flight-canvas')).toHaveAttribute('data-encounter-state', new RegExp(`"boss":"${phase}"`));
    await expect(page.locator('canvas.flight-canvas')).toHaveAttribute('data-render-stats', /"calls":/);
    await page.screenshot({ path: info.outputPath(`bastion-${phase}-phone.png`) });
  }
  expect(errors).toEqual([]);
});

test('boss destruction reaches victory and retry restores the complete encounter', async ({ page }) => {
  await page.goto('/tests/fixtures/bastion.html?phase=destroyed');
  await expect(page.getByRole('heading', { name: 'SORTIE COMPLETE' })).toBeVisible({ timeout: 25000 });
  await expect(page.locator('.result-subtitle')).toContainText('Bastion-9 is down');
  await page.getByRole('button', { name: 'FLY AGAIN', exact: false }).click();
  await expect(page.locator('canvas.flight-canvas')).toHaveAttribute('data-encounter-state', /"phase":"playing"/);
  await expect(page.locator('.results-panel')).toBeHidden();
  const state = JSON.parse((await page.locator('canvas.flight-canvas').getAttribute('data-encounter-state'))!);
  expect(state.boss).toBeUndefined();
  expect(state.time).toBeLessThan(5);
});
