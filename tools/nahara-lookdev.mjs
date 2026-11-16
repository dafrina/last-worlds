// Frozen Nahara ground captures for art review (docs/39): the terrain-relief fixture (tests/fixtures/terrain-relief.ts) at
// fixed seeds, distances and camera x, on High and Low, with the renderer's stats. Not a test; never a production entry.
// Usage: node tools/nahara-lookdev.mjs <out-dir> [base=http://127.0.0.1:4191] [qualities=high,low] [views=all] [world=nahara]
// A view is `name:seed:distance:x`; `x=canyon` frames the canyon's course at the view's middle row.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchGameBrowser } from './browser.mjs';

const [out = 'lookdev/nahara', base = 'http://127.0.0.1:4191', qualityArg = 'high,low', viewArg = 'all', world = 'nahara'] = process.argv.slice(2);
const VIEWS = {
  nahara: ['canyon-a:93:120:canyon', 'canyon-b:8831:260:canyon', 'canyon-c:11:420:canyon', 'dunes-a:93:200:-6', 'dunes-b:8831:150:6',
    'ruins-a:11:330:canyon+5', 'ledges-a:4242:90:canyon-4'],
  khepri: ['canyon-a:93:200:0', 'canyon-b:8831:140:-4'],
};
const views = (viewArg === 'all' ? VIEWS[world] : viewArg.split(',')).map(spec => { const [name, seed, distance, x] = spec.split(':'); return { name, seed: Number(seed), distance: Number(distance), x }; });
mkdirSync(out, { recursive: true });
const browser = await launchGameBrowser();
const report = [];
try {
  for (const quality of qualityArg.split(',')) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const view of views) {
      let x = Number(view.x);
      if (!Number.isFinite(x)) {
        // The canyon's course at the view's middle row, plus an offset (`canyon+5`).
        const offset = Number(view.x.replace('canyon', '') || 0);
        await page.goto(`${base}/tests/fixtures/terrain-relief.html?world=${world}&seed=${view.seed}&distance=${view.distance}&quality=${quality}`);
        const center = await page.evaluate(async ([seed, s]) => (await import('/src/world/terrain-nahara.ts')).naharaCourse(seed, s).center, [view.seed, view.distance + 7]);
        x = Math.max(-6, Math.min(6, center + offset));
      }
      await page.goto(`${base}/tests/fixtures/terrain-relief.html?world=${world}&seed=${view.seed}&distance=${view.distance}&x=${x}&quality=${quality}`);
      // The kit GLB and the planet's textures load first; then a few frames settle the instanced batches.
      await page.waitForFunction(() => { try { const stats = JSON.parse(document.querySelector('canvas')?.dataset.renderStats ?? '{}'); return stats.terrain?.kit === 'glb'; } catch { return false; } }, null, { timeout: 60_000 });
      await page.waitForTimeout(2500);
      const path = `${out}/${view.name}-${quality}.png`;
      await page.screenshot({ path });
      const stats = JSON.parse(await page.locator('canvas').first().getAttribute('data-render-stats') ?? '{}');
      const row = { view: view.name, quality, seed: view.seed, distance: view.distance, x: +x.toFixed(2), calls: stats.calls, triangles: stats.triangles, terrain: stats.terrain };
      report.push(row); console.log(JSON.stringify(row));
    }
    if (errors.length) console.log('page errors', errors);
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(`${out}/stats.json`, JSON.stringify(report, null, 1));
