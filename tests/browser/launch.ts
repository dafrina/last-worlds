import { expect, type Page } from '@playwright/test';
import type { RunState } from '../../src/shared/contracts';

/**
 * Waits for a launched flight to play. A launch warps at least a second while its world is prepared (the launch warp,
 * 21 October), and preparation itself can take several seconds under load, so this allows more than the default 5 s.
 */
export async function flying(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__LAST_WORLDS__!.snapshot()?.phase ?? null),
    { timeout: 30_000 }).toBe('playing');
}

/**
 * The live flight's state from the development hooks (src/dev-hooks.ts). Typed as a flight for brevity: it is null before
 * one starts, so specs that poll then read it with `?.`.
 */
export const snapshot = (page: Page) => page.evaluate(() => window.__LAST_WORLDS__!.snapshot()) as Promise<RunState>;
