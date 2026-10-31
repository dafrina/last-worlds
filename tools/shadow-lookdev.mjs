// node tools/shadow-lookdev.mjs <outDir> <port> <label> — frozen flight frames with several enemy craft in view, per world and tier.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [out, port, label, only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const missions = { khepri: 'bastion', vesper: 'cold-vector', nacre: 'deep-bloom' };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [world, mission] of Object.entries(missions)) for (const quality of ['high', 'low']) {
  if (only && !only.split(',').includes(world)) continue;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => !!window.__LAST_WORLDS__);
  await page.evaluate(q => window.__LAST_WORLDS__.setQuality(q), quality);
  await page.evaluate(m => window.__LAST_WORLDS__.launch({ mode: 'campaign', mission: m, seed: 4242, difficulty: 'standard' }), mission);
  await page.waitForFunction(() => window.__LAST_WORLDS__.snapshot()?.phase === 'playing', null, { timeout: 120000 });
  const found = await page.evaluate(() => {
    const api = window.__LAST_WORLDS__; api.setLives(99); api.advance(12, true);
    for (let i = 0; i < 400; i++) {
      const s = api.snapshot();
      const flying = s.enemies.filter(e => !['turret', 'missile', 'fuel'].includes(e.kind) && !e.bossPart && Math.abs(e.x - s.cameraX) < 5 && e.s > 3 && e.s < 15).length;
      if (flying >= 3) { api.bench(0); return { time: s.time, flying }; }
      api.setLives(99); api.advance(.25, true);
    }
    api.bench(0); return null;
  });
  await page.waitForTimeout(2500);
  const path = `${out}/${label}-${world}-${quality}.png`;
  await page.screenshot({ path });
  console.log(path, JSON.stringify(found));
  await page.close();
}
await browser.close();
