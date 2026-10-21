import { expect, type Page } from '@playwright/test';

/**
 * Waits for a launched flight to play. A launch warps at least a second while its world is prepared (the launch warp,
 * 21 October), and preparation itself can take several seconds under load, so this allows more than the default 5 s.
 */
export async function flying(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __LAST_WORLDS__: { snapshot(): { phase: string } | null } }).__LAST_WORLDS__.snapshot()?.phase ?? null),
    { timeout: 30_000 }).toBe('playing');
}
