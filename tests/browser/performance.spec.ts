import { expect, test, type Page } from '@playwright/test';
import { flying } from './launch';

type Api = {
  launch(config: object): void; snapshot(): { time: number; phase: string; planet: string; jump?: { startedAt: number; duration: number }; boss?: { phase: string; phaseStartedAt: number } } | null;
  advance(seconds: number, exposed?: boolean): void; setLives(lives: number): void; killBoss(): void;
  bench(steps?: number, lives?: number): void; benchFrames(): number; benchStop(): unknown[];
};
const api = (page: Page, call: (api: Api) => unknown) => page.evaluate(`(${call.toString()})(window.__LAST_WORLDS__)`);
const textures = async (page: Page) => JSON.parse(await page.locator('canvas.flight-canvas').getAttribute('data-render-stats') ?? '{}').textures as number;
/** Renders `frames` frames of one tick each (the bench), long enough for a fresh stats sample (every 60 ticks). */
async function fly(page: Page, frames: number) {
  await api(page, a => a.bench(1, 99));
  await page.waitForFunction(n => (window as unknown as { __LAST_WORLDS__: Api }).__LAST_WORLDS__.benchFrames() >= n, frames, { timeout: 120_000, polling: 100 });
  await api(page, a => a.bench(0, 99));
}

// docs/36 (mobile performance pass): 8 s into an endless boss sector the next world's kits load for its jump; their atlases
// (Khepri's facility kit: three 2048² textures) uploaded in one frame of the flight (0.54 s in the bench). They now upload
// under the jump's flash, where the next world is warmed anyway.
test('an endless run uploads the next world\'s atlases under the jump\'s flash, not mid-flight', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await api(page, a => { a.bench(0, 99); a.launch({ mode: 'endless', seed: 4242 }); });
  await flying(page);
  await api(page, a => a.advance(6, true));
  await fly(page, 90);
  const before = await textures(page);
  // Past the preload: the next world's facility kit has arrived (its materials are in the scene, hidden).
  await api(page, a => a.advance(3, true));
  await expect.poll(() => page.evaluate(() => {
    let found = false;
    (window as unknown as { __probeScene: { traverse(f: (o: { material?: { name?: string } }) => void): void } }).__probeScene
      .traverse(object => { if (object.material?.name?.startsWith('fk_khepri')) found = true; });
    return found;
  }), { timeout: 60_000 }).toBe(true);
  await fly(page, 120);
  expect(await textures(page)).toBe(before);
  // To the boss, its death and the jump's flash: the warm-up there uploads them.
  await api(page, a => {
    for (let i = 0; i < 4000; i++) {
      const s = a.snapshot();
      if (!s || s.phase !== 'playing') return;
      if (s.jump && s.time > s.jump.startedAt + s.jump.duration * .5) return;
      if (s.boss && s.boss.phase !== 'arrival' && s.boss.phase !== 'destroyed' && s.time - s.boss.phaseStartedAt > 2) a.killBoss();
      a.setLives(99); a.advance(.1, true);
    }
  });
  await fly(page, 120);
  expect(await textures(page)).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});
