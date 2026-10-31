import { expect, test, type Page } from '@playwright/test';
import { seedCampaign, veteranPilot } from './campaign-save';
import type { RunState } from '../../src/shared/contracts';
import { flying } from './launch';

const snapshot = (page: Page): Promise<RunState> => page.evaluate(() => (window as unknown as { __LAST_WORLDS__: { snapshot(): RunState } }).__LAST_WORLDS__.snapshot());

test('home stays compact on phones and campaign setup has its own page', async ({ page }, info) => {
  // Three viewports, the campaign page (its planet preview) and the hangar: about 30 s under software WebGL.
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport); await page.goto('/');
    await expect(page.getByRole('heading', { name: /LAST/ })).toBeVisible();
    expect(await page.locator('.flight-overlay').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    expect(await page.locator('#game-title').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: /^HANGAR/ })).toBeInViewport({ ratio: 1 });
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

test('the front screen opens the hangar, which says what flies where, and back returns to its opener', async ({ page }, info) => {
  // Two hangar visits on the Ships tab (each draws the ship's picture): about 20 s under software WebGL.
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await seedCampaign(page);
  await page.goto('/');
  const entry = page.getByRole('button', { name: /^HANGAR/ });
  await expect(entry).toContainText('SCRAPPER · SALVAGE RIG');
  // Keyboard order: the two modes, the hangar, then statistics.
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(entry).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'STATISTICS' })).toBeFocused();
  await entry.click();
  await expect(page.getByRole('heading', { name: 'HANGAR' })).toBeVisible();
  await expect(page.locator('.menu-panel')).toBeHidden();
  await expect(page.locator('.hangar-scope')).toHaveText('CAMPAIGN ONLY · ENDLESS USES STARTER GEAR');
  await page.getByRole('radio', { name: 'Ships', exact: true }).click();
  await expect(page.locator('.hangar-scope')).toHaveText('CAMPAIGN AND ENDLESS · SHIP, PERK AND LOOKS');
  await page.locator('.hangar-item', { has: page.getByRole('heading', { name: 'Ironclad', exact: true }) }).getByRole('button', { name: 'EQUIP' }).click();
  await expect(page.locator('.shipyard')).toContainText('IRONCLAD · YOUR BUILD');
  await page.getByRole('button', { name: 'BACK' }).click();
  await expect(page.locator('.menu-panel')).toBeVisible();
  await expect(entry).toBeFocused();
  await expect(entry).toContainText('IRONCLAD · RESERVE LIFE');
  await page.screenshot({ path: info.outputPath('front-hangar-entry.png') });
  // Reopened by keyboard on the Ships tab, the shipyard shows again; Escape returns to the front screen too.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'HANGAR' })).toBeVisible();
  await expect(page.locator('.shipyard')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(entry).toBeFocused();
  // Opened from the campaign page's loadout summary, back returns to the campaign page.
  await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await page.getByRole('button', { name: /Open the hangar/ }).click();
  await page.getByRole('button', { name: 'BACK' }).click();
  await expect(page.getByRole('heading', { name: 'CAMPAIGN', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open the hangar/ })).toBeFocused();
  await expect(page.locator('[data-loadout="ship"]')).toHaveText('Ironclad');
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
  expect(state.player.maxShields).toBe(5);
  expect(state.player.shields).toBe(4);
});

test('pause settings preserve the frozen flight and statistics persist without duplication', async ({ page }, info) => {
  // An endless launch, a pause round trip and a reload: 25–30 s under SwiftShader since at least 7278d87, at the default limit.
  test.setTimeout(60000);
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


test('ships assemble from mission parts, persist, and launch with their perk and five starting shields', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await seedCampaign(page, profile => { veteranPilot(profile); profile.owned.ship = ['scrapper']; });
  await page.goto('/'); await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await page.getByRole('button', { name: /Open the hangar/ }).click();
  await page.getByRole('radio', { name: 'Ships', exact: true }).click();
  await expect(page.locator('.hangar-note')).toContainText('cosmetic');
  const ironclad = page.locator('.hangar-item', { has: page.getByRole('heading', { name: 'Ironclad', exact: true }) });
  await expect(ironclad.locator('.ship-parts')).toContainText('✓ Frame');
  const spectre = page.locator('.hangar-item', { has: page.getByRole('heading', { name: 'Spectre', exact: true }) });
  await expect(spectre.getByRole('button', { name: '1 / 3 PARTS' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('ship-collection.png') });
  await ironclad.getByRole('button', { name: 'ASSEMBLE' }).click();
  await expect(ironclad).toContainText('EQUIPPED');
  // The shipyard (docs/31): the equipped ship's look; an unbought B design is tried on first, then bought once with a part
  // and credits (docs/33) and fitted.
  const yard = page.locator('.shipyard');
  await expect(yard).toContainText('IRONCLAD · YOUR BUILD');
  await yard.getByRole('button', { name: /Wings design B, preview; costs 1 part and 80 credits/ }).click();
  await expect(yard.locator('.shipyard-offer')).toContainText('PREVIEW · WINGS B');
  await expect(page.locator('.credit-balance b').first()).toHaveText('5,000');
  await yard.getByRole('button', { name: 'BUY · 1P + 80 CR' }).click();
  await expect(yard.getByRole('button', { name: 'Wings design B' })).toHaveAttribute('aria-pressed', 'true');
  await expect(yard.locator('.shipyard-offer')).toBeHidden();
  await expect(page.locator('.credit-balance b').first()).toHaveText('4,920');
  await expect(page.locator('.parts-balance b').first()).toHaveText('11');
  await page.screenshot({ path: info.outputPath('shipyard.png') });
  await page.getByRole('radio', { name: 'Shield', exact: true }).click();
  await page.locator('.hangar-item', { hasText: 'Aegis Array' }).getByRole('button', { name: 'EQUIP', exact: true }).click();
  await page.getByRole('radio', { name: 'Main', exact: true }).click();
  const pulse = page.locator('.hangar-item', { hasText: 'Twin Pulse' });
  // Five tiers (docs/30): four upgrades at 150, 300, 500 and 800 credits; one pip per tier, lit up to the current one.
  await pulse.getByRole('button', { name: 'UPGRADE · 150 CR' }).click();
  await pulse.getByRole('button', { name: 'UPGRADE · 300 CR' }).click();
  await expect(pulse).toContainText('TIER 3 / 5');
  await expect(pulse).toContainText('Four-shot burst. Next: Rapid four-shot burst');
  await pulse.getByRole('button', { name: 'UPGRADE · 500 CR' }).click();
  await pulse.getByRole('button', { name: 'UPGRADE · 800 CR' }).click();
  await expect(pulse).toContainText('TIER 5 / 5');
  await expect(pulse).toContainText('Four-stream burst. Top tier.');
  await expect(pulse.locator('.rank-pips i')).toHaveCount(5);
  await expect(pulse.locator('.rank-pips i.on')).toHaveCount(5);
  await expect(pulse.getByRole('button', { name: /UPGRADE/ })).toHaveCount(0);
  await expect(page.locator('.credit-balance b').first()).toHaveText('3,170');
  await page.reload(); await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await expect(page.locator('[data-loadout="ship"]')).toHaveText('Ironclad');
  await page.getByRole('radio', { name: 'Training', exact: true }).click();
  await page.getByRole('button', { name: /LAUNCH MISSION/ }).click(); await flying(page);
  const state = await snapshot(page);
  expect(state.config).toMatchObject({ ship: 'ironclad', rank: 4, shield: 'aegis', hero: { parts: { hull: 'a', wings: 'b', engines: 'a', cockpit: 'a' } } });
  expect(state.player).toMatchObject({ lives: 4, shields: 5, maxShields: 5, power: 4 });
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await expect(page.locator('.pause-tech')).toContainText('Ironclad');
  await expect(page.locator('.pause-weapon')).toContainText('TIER 5');
  await page.screenshot({ path: info.outputPath('chassis-flight.png') });
  expect(errors).toEqual([]);
});
