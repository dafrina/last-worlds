// Frozen in-game environment captures; never a production entry or simulation control.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const label = process.argv[2] ?? 'nacre-world';
const quality = process.argv[3] ?? 'high';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message));
mkdirSync('lookdev', { recursive: true });
for (const [seed, distance, x] of [[8831,100,0], [8831,210,-5], [93,360,4]]) {
  await page.goto(`http://127.0.0.1:4173/tests/fixtures/nacre-world.html?seed=${seed}&distance=${distance}&x=${x}&quality=${quality}`);
  await page.waitForTimeout(6500);
  const path = `lookdev/${label}-${quality}-${seed}-${distance}.png`;
  await page.screenshot({path});
  console.log(path, await page.locator('canvas.flight-canvas').getAttribute('data-render-stats'));
}
console.log('errors', errors); await browser.close();
