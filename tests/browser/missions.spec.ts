import { expect, test, type Page } from '@playwright/test';
import { seedCampaign, veteranPilot } from './campaign-save';
import { flying } from './launch';
import { CAMPAIGN_KEY } from '../../src/campaign/profile';

/*
 * World missions in the browser (docs/35): the campaign page's board, the in-flight note and the results list. A seeded
 * Luna board from before the long missions (4 November): Groundbreaker (retired) and Specialist done, five other cards
 * showing, Lunar Saboteur half way across runs, a last run's progress shown.
 * MISSION_SHOTS=<directory> also saves the three screens (the review sheet, docs/screenshots/missions.jpg).
 */
const SHOTS = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.MISSION_SHOTS;
type Dev = { __LAST_WORLDS__: { special(): void; end(phase: 'over' | 'complete'): void } };

async function seeded(page: Page) {
  await seedCampaign(page, profile => {
    veteranPilot(profile);
    profile.missionBoard = { version: 1, worlds: { training: {
      revealed: ['luna.groundbreaker', 'luna.specialist', 'luna.old-school', 'luna.untouchable', 'luna.collector', 'luna.air-superiority', 'luna.demolition'],
      claimed: ['luna.groundbreaker', 'luna.specialist'], achieved: [], career: { 'luna.lunar-saboteur': 1 },
      last: { attempt: 'seeded', progress: { 'luna.collector': 38, 'luna.air-superiority': 9, 'luna.demolition': 5 } },
    } } };
  });
}

test('the campaign page shows a world\'s five missions, their progress, minimum difficulty and reward, and its history', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await seeded(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Training', exact: true }).click();
  const board = page.locator('.mission-board');
  await board.scrollIntoViewIfNeeded();
  await expect(board.locator('.board-head')).toContainText('MISSIONS · LUNA');
  await expect(board.locator('.board-count')).toHaveText('1 / 12 DONE');
  // The long mission comes up at once as the fifth card; Demolition, revealed last, goes back to the hidden queue.
  await expect(board.locator('.board-item b')).toHaveText(['Old School', 'Untouchable', 'Collector', 'Air Superiority', 'Sky Patrol']);
  await expect(board.locator('.board-item').nth(4).locator('.board-value')).toHaveText('0/100');
  await expect(board.locator('.board-item').nth(4).locator('.board-scope')).toHaveText('ACROSS RUNS');
  await expect(board.locator('.board-item').nth(1).locator('.board-tag')).toHaveText('STANDARD+');
  await expect(board.locator('.board-item').nth(0).locator('.board-tag')).toHaveText('ANY');
  await expect(board.locator('.board-item').nth(2).locator('.board-value')).toHaveText('38/70');
  await expect(board.locator('.board-item').nth(2).locator('.board-scope')).toHaveText('LAST RUN');
  await expect(board.locator('.board-item').nth(1).locator('.board-reward')).toHaveAttribute('aria-label', 'Reward 50 credits and 1 part');
  // Done missions stay as cards with a check, most recent first; the retired Groundbreaker no longer shows (its payment stays).
  await expect(board.locator('.board-sub')).toHaveText('COMPLETED · 1');
  await expect(board.locator('.board-done b')).toHaveText(['Specialist']);
  await expect(board.locator('.board-done .board-check')).toHaveCount(1);
  // No horizontal overflow on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-board.png` });
  // Another world has its own board, untouched.
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Rolling Thunder', exact: true }).click();
  await expect(board.locator('.board-head')).toContainText('MISSIONS · KHEPRI');
  await expect(board.locator('.board-count')).toHaveText('0 / 12 DONE');
  await expect(board.locator('.board-item b')).toHaveText(['Specialist', 'Old School', 'Collector', 'Untouchable', 'Scorched Earth']);
  expect(errors).toEqual([]);
});

test('a flight shows a small mission note, and the results list the missions it paid', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  // A fresh board: Specialist, Old School, Untouchable, Collector and the long mission, Sky Patrol, are visible.
  await seedCampaign(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Training', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Campaign difficulty' }).getByRole('radio', { name: 'Standard', exact: true }).click();
  await page.getByRole('button', { name: /LAUNCH MISSION/ }).click();
  await flying(page);
  // Firing the special: Specialist 1/5 shows briefly under the lives and shields (Old School is failed, quietly).
  // Evidence only: software WebGL can take longer to capture a frame than the note stays, so the shot holds it at full.
  if (SHOTS) await page.addStyleTag({ content: '.mission-note { animation: none !important; opacity: .92 !important; }' });
  await page.evaluate(() => (window as unknown as Dev).__LAST_WORLDS__.special());
  const note = page.locator('.mission-note.is-on');
  await expect(note).toHaveText('SPECIALIST 1/5', { timeout: 5_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-flight-note.png` });
  // The pause panel lists the visible missions with this run's progress.
  await page.locator('.pause-button').click();
  await expect(page.locator('.pause-missions li').nth(0)).toHaveText(/Specialist\s*1\/5/);
  await page.locator('[data-action="resume"]').click();
  await flying(page);
  await page.evaluate(() => (window as unknown as Dev).__LAST_WORLDS__.end('complete'));
  await expect(page.locator('.results-panel')).toBeVisible({ timeout: 10_000 });
  // Untouchable (no hit, Standard) is paid; Old School is not (a special was fired).
  await expect(page.locator('.result-missions li')).toHaveText([/Untouchable/]);
  await page.locator('.flight-overlay.is-settled').waitFor({ timeout: 10_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-results.png` });
  // Paid once into the save; the board shows it done.
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), CAMPAIGN_KEY);
  expect(saved.awards).toEqual(['mission:luna.untouchable']);
  expect(saved.missionBoard.worlds.training.claimed).toEqual(['luna.untouchable']);
  await page.getByRole('button', { name: 'RETURN TO MENU' }).click();
  await page.getByRole('button', { name: 'CAMPAIGN FLIGHT' }).click();
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Training', exact: true }).click();
  // Done since the board was last drawn: its card's check pops in once.
  await expect(page.locator('.mission-board .board-done.is-fresh b')).toHaveText(['Untouchable']);
  expect(errors).toEqual([]);
});
