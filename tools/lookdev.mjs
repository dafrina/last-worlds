// Fixed-seed look-dev captures of the running dev server for art review (not a test).
// Usage: node tools/lookdev.mjs [label] [seed] [query]   → lookdev/<label>-seed<seed>-{center,left,right}.png
// query is appended to the URL, e.g. 'camera=perspective'.
// Requires `npm run dev` on http://127.0.0.1:4173. Output goes to the git-ignored lookdev/ folder.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const label = process.argv[2] ?? 'capture';
const seed = Number(process.argv[3] ?? 8831) >>> 0;
const query = process.argv[4] ? `?${process.argv[4]}` : '';
mkdirSync('lookdev', { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// The menu draws run seeds from crypto; pin single-value draws so every capture shows the same world.
await page.addInitScript(fixed => {
  const original = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = array => (array instanceof Uint32Array && array.length === 1 ? (array[0] = fixed, array) : original(array));
}, seed);
await page.goto(`http://127.0.0.1:4173/${query}`);
await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
const stats = () => page.locator('canvas.flight-canvas').getAttribute('data-render-stats');
const shot = async name => {
  await page.screenshot({ path: `lookdev/${label}-seed${seed}-${name}.png` });
  console.log(name, await stats());
};
await page.waitForTimeout(8000); await shot('center');
await page.keyboard.down('a'); await page.waitForTimeout(4500); await page.keyboard.up('a'); await page.waitForTimeout(600); await shot('left');
await page.keyboard.down('d'); await page.waitForTimeout(8000); await page.keyboard.up('d'); await page.waitForTimeout(600); await shot('right');
console.log('frame', await page.locator('canvas.flight-canvas').getAttribute('data-frame-state'));
if (errors.length) console.log('page errors', errors);
await browser.close();
