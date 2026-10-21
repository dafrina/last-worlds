import { expect, test, type Page } from '@playwright/test';
import { seedCampaign, veteranPilot } from './campaign-save';
import type { RunState } from '../../src/shared/contracts';
import { flying } from './launch';

const snapshot = (page: Page): Promise<RunState> => page.evaluate(() => (window as unknown as { __LAST_WORLDS__: { snapshot(): RunState } }).__LAST_WORLDS__.snapshot());

test('home stays compact on phones and campaign setup has its own page', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport); await page.goto('/');
    await expect(page.getByRole('heading', { name: /LAST/ })).toBeVisible();
    expect(await page.locator('.flight-overlay').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    expect(await page.locator('#game-title').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`menu-${viewport.width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await expect(page.getByRole('heading', { name: 'CAMPAIGN', exact: true })).toBeVisible();
  await expect(page.locator('.menu-panel')).toBeHidden();
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Training', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Campaign difficulty' }).getByRole('radio', { name: 'Veteran', exact: true }).click();
  await page.screenshot({ path: info.outputPath('campaign-phone.png') });
  // Hangar: Fan Cannon costs credits a fresh pilot does not have.
  await page.getByRole('button', { name: /Open the hangar/ }).click();
  await expect(page.getByRole('heading', { name: 'HANGAR' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'BUY · 250 CR' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('hangar-phone.png') });
  await page.getByRole('button', { name: 'BACK' }).click();
  await page.getByRole('button', { name: 'BACK' }).click();
  await expect(page.getByRole('button', { name: 'CAMPAIGN FLIGHT' })).toBeFocused();
  await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Campaign difficulty' }).getByRole('radio', { name: 'Veteran', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-loadout="weapon"]')).toHaveText('Twin Pulse');
  expect(errors).toEqual([]);
});

test('the hangar buys, equips and ranks up campaign gear, and the launch flies it', async ({ page }, info) => {
  await seedCampaign(page, profile => { profile.credits = 700; });
  await page.goto('/'); await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await expect(page.locator('.credit-balance').first()).toContainText('700');
  await page.getByRole('button', { name: /Open the hangar/ }).click();
  await page.getByRole('button', { name: 'BUY · 250 CR' }).first().click();
  await expect(page.locator('.hangar-item.is-equipped h3')).toHaveText('Fan Cannon');
  await page.locator('.hangar-item', { hasText: 'Fan Cannon' }).getByRole('button', { name: 'UPGRADE · 150 CR' }).click();
  await page.getByRole('radiogroup', { name: 'Equipment slot' }).getByRole('radio', { name: 'Shield', exact: true }).click();
  await page.getByRole('button', { name: 'BUY · 250 CR' }).first().click();
  await expect(page.locator('.credit-balance').first()).toContainText('50');
  await page.screenshot({ path: info.outputPath('hangar-bought.png') });
  await page.getByRole('button', { name: 'BACK' }).click();
  await expect(page.locator('[data-loadout="weapon"]')).toHaveText('Fan Cannon');
  await expect(page.locator('[data-loadout="shield"]')).toHaveText('Bulwark Array');
  await page.getByRole('button', { name: /LAUNCH MISSION/ }).click();
  await flying(page);
  const state = await snapshot(page);
  expect(state.config).toMatchObject({ mode: 'campaign', weapon: 'fan', rank: 1, shield: 'bulwark' });
  expect(state.player.maxShields).toBe(4);
});

test('pause settings preserve the frozen flight and statistics persist without duplication', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await flying(page);
  await page.getByRole('button', { name: /Activate shockwave/ }).click();
  await expect.poll(async () => (await snapshot(page)).specialsUsed).toBe(1);
  await page.getByRole('button', { name: 'Pause flight' }).click();
  const paused = await snapshot(page);
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Graphics quality' }).getByRole('radio', { name: 'Low', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Sound' }).getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('button', { name: /HOW TO PLAY/ }).click();
  await expect(page.getByRole('heading', { name: 'HOLD YOUR LINE.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'SETTINGS' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
  expect((await snapshot(page)).tick).toBe(paused.tick);
  await page.getByRole('button', { name: 'RETURN TO MENU', exact: true }).click();
  await page.getByRole('button', { name: 'STATISTICS' }).click();
  await expect(page.locator('[data-stat="flights"]')).toHaveText('1');
  await expect(page.locator('[data-stat="specials"]')).toHaveText('1');
  await expect(page.locator('.statistics-history')).toContainText('Retired');
  await page.getByRole('tab', { name: 'CAMPAIGN' }).click();
  await expect(page.locator('[data-stat="flights"]')).toHaveText('0');
  await expect(page.locator('.statistics-empty')).toBeVisible();
  await page.getByRole('tab', { name: 'CAMPAIGN' }).press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'ENDLESS' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: info.outputPath('statistics-phone.png') });
  await page.reload(); await page.getByRole('button', { name: 'STATISTICS' }).click();
  await expect(page.locator('[data-stat="flights"]')).toHaveText('1');
  await expect(page.locator('[data-stat="specials"]')).toHaveText('1');
});

test('campaign observations stay separate and record the chosen difficulty', async ({ page }) => {
  await seedCampaign(page, profile => { veteranPilot(profile); profile.loadout.weapon = 'seeker'; });
  await page.goto('/'); await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Training', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Campaign difficulty' }).getByRole('radio', { name: 'Relaxed', exact: true }).click();
  await page.getByRole('button', { name: /LAUNCH MISSION/ }).click();
  await flying(page);
  expect((await snapshot(page)).config).toMatchObject({ mode: 'campaign', mission: 'training', difficulty: 'relaxed', weapon: 'seeker' });
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await page.getByRole('button', { name: 'RETURN TO MENU', exact: true }).click();
  await page.getByRole('button', { name: 'STATISTICS' }).click();
  await expect(page.locator('[data-stat="flights"]')).toHaveText('0');
  await page.getByRole('tab', { name: 'CAMPAIGN' }).click();
  await expect(page.locator('[data-stat="flights"]')).toHaveText('1');
  await expect(page.locator('.statistics-history')).toContainText('Relaxed · Retired');
});

test('unavailable storage leaves a usable session log and menu', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage disabled'); }; });
  await page.goto('/'); await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await flying(page);
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await page.getByRole('button', { name: 'RETURN TO MENU', exact: true }).click();
  await page.getByRole('button', { name: 'STATISTICS' }).click();
  await expect(page.locator('[data-stat="flights"]')).toHaveText('1');
  await expect(page.locator('.statistics-note')).toContainText('Stats last for this session');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'STATISTICS' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'SETTINGS', exact: true })).toBeFocused();
});

test('small-screen subpages keep back navigation and the launch action reachable', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto('/');
  await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  const back = await page.getByRole('button', { name: 'BACK' }).boundingBox();
  const overlay = await page.locator('.flight-overlay').boundingBox();
  expect(back!.y).toBeGreaterThanOrEqual(overlay!.y);
  await page.getByRole('button', { name: /LAUNCH MISSION/ }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: /LAUNCH MISSION/ })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('campaign-small-phone.png') });
  await page.keyboard.press('Escape');
  expect(await page.locator('.flight-overlay').evaluate(element => element.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'STATISTICS' }).click();
  await page.getByRole('button', { name: 'BACK' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('tab', { name: 'ENDLESS' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'BACK' })).toBeFocused();
});
