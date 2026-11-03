// Long-session memory and pacing (mobile performance pass, 3 November 2026). Run a dev server first, then:
//   node tools/perf-soak.mjs endless <out.json> [base=http://127.0.0.1:4194] [quality=high] [sectors=8] [steps=4]
//   node tools/perf-soak.mjs restarts <out.json> [base=http://127.0.0.1:4194] [quality=high] [cycles=6]
// endless: one endless run (seed 4242) flown by the bench's scripted weave at `steps` ticks a rendered frame, every boss
// killed once it fights (src/main.ts dev hooks), through its planet jumps to sector `sectors`. At every sector or planet
// change, and at the end, it records the JS heap after two forced GCs and the renderer's geometries, textures and
// programs; frame work at one tick a frame is measured in a window at the start and at the end.
// restarts: launch a campaign mission (all six worlds in turn), fly 6 s, return to the menu; the heap after GC and the
// renderer's memory at the menu after each cycle. Headless Chromium draws with SwiftShader: GPU memory is not measured.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const [mode = 'endless', out = 'soak.json', base = 'http://127.0.0.1:4194', quality = 'high', countArg, stepsArg = '4'] = process.argv.slice(2);
const load = () => { try { return readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' '); } catch { return '?'; } };
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length, at = p => sorted[Math.min(n - 1, Math.floor(p * (n - 1)))] ?? 0;
  return { n, mean: +(values.reduce((a, b) => a + b, 0) / Math.max(1, n)).toFixed(3), p95: +at(.95).toFixed(3), p99: +at(.99).toFixed(3), max: +at(1).toFixed(3),
    over16: values.filter(v => v > 16.7).length, over33: values.filter(v => v > 33.3).length };
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const cdp = await context.newCDPSession(page);
await cdp.send('HeapProfiler.enable');
const heap = async () => {
  await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage');
  return +((await cdp.send('Runtime.getHeapUsage')).usedSize / 1e6).toFixed(2);
};
const renderer = async () => page.evaluate(() => {
  try { const r = JSON.parse(document.querySelector('canvas')?.dataset.renderStats ?? '{}'); return { geometries: r.geometries, textures: r.textures, programs: r.programs, calls: r.calls, triangles: r.triangles, particles: r.particles, objects: r.graph?.objects }; }
  catch { return {}; }
});
const result = { mode, quality, base, startedLoad: load(), samples: [], windows: {}, errors };
try {
  await page.goto(`${base}/`);
  await page.waitForFunction(() => !!window.__LAST_WORLDS__, null, { timeout: 60_000 });
  await page.evaluate(q => window.__LAST_WORLDS__.setQuality(q), quality);
  if (mode === 'restarts') {
    const missions = ['training', 'bastion', 'cold-vector', 'deep-bloom', 'brood-strike', 'final-horizon'];
    const cycles = Number(countArg ?? 6);
    await page.waitForTimeout(1500);
    result.samples.push({ cycle: 0, at: 'menu (boot)', heapMB: await heap(), ...(await renderer()), load: load() });
    for (let cycle = 1; cycle <= cycles; cycle++) {
      const mission = missions[(cycle - 1) % missions.length];
      await page.evaluate(config => window.__LAST_WORLDS__.launch(config), { mode: 'campaign', mission, seed: 4242 + cycle, difficulty: 'standard' });
      await page.waitForFunction(() => window.__LAST_WORLDS__.snapshot()?.phase === 'playing', null, { timeout: 120_000 });
      await page.evaluate(() => window.__LAST_WORLDS__.bench(1, 99));
      await page.waitForFunction(() => window.__LAST_WORLDS__.benchFrames() >= 360, null, { timeout: 300_000, polling: 500 });
      const frames = await page.evaluate(() => window.__LAST_WORLDS__.benchStop());
      const inFlight = { heapMB: await heap(), ...(await renderer()) };
      // Back to the menu through the pause panel's own button.
      await page.evaluate(() => document.querySelector('[data-action="quit"]')?.click());
      await page.waitForTimeout(1500);
      result.samples.push({ cycle, mission, flight: inFlight, frames: stats(frames.map(f => f.total)), at: 'menu', heapMB: await heap(), ...(await renderer()), load: load() });
      console.log(`cycle ${cycle} ${mission}: flight heap ${inFlight.heapMB} MB geo/tex/prog ${inFlight.geometries}/${inFlight.textures}/${inFlight.programs} · menu heap ${result.samples.at(-1).heapMB} MB · load ${load()}`);
      writeFileSync(out, JSON.stringify(result, null, 1));
    }
  } else {
    const sectors = Number(countArg ?? 8), steps = Number(stepsArg);
    await page.evaluate(() => window.__LAST_WORLDS__.launch({ mode: 'endless', seed: 4242 }));
    await page.waitForFunction(() => window.__LAST_WORLDS__.snapshot()?.phase === 'playing', null, { timeout: 120_000 });
    const state = () => page.evaluate(() => { const s = window.__LAST_WORLDS__.snapshot(); return s && { time: s.time, sector: s.sector, planet: s.planet, phase: s.phase, boss: s.boss?.phase ?? null, bossAge: s.boss ? s.time - s.boss.phaseStartedAt : 0, jump: !!s.jump, enemies: s.enemies.length }; });
    /** One tick a frame for `count` frames: the frame-work window. */
    const window_ = async label => {
      await page.evaluate(() => window.__LAST_WORLDS__.bench(1, 99));
      await page.waitForFunction(() => window.__LAST_WORLDS__.benchFrames() >= 600, null, { timeout: 600_000, polling: 500 });
      const frames = await page.evaluate(() => window.__LAST_WORLDS__.benchStop());
      result.windows[label] = { ...stats(frames.map(f => f.total)), at: await state(), load: load() };
      console.log(`window ${label}: ${JSON.stringify(result.windows[label])}`);
    };
    await window_('start');
    let last = await state(), frames = [], startedAt = Date.now();
    result.samples.push({ ...last, heapMB: await heap(), ...(await renderer()), wall: 0, load: load() });
    await page.evaluate(s => window.__LAST_WORLDS__.bench(s, 99), steps);
    for (;;) {
      await page.waitForTimeout(1000);
      const now = await state();
      if (!now || now.phase === 'over' || now.phase === 'complete') break;
      if (now.boss && now.boss !== 'arrival' && now.boss !== 'destroyed' && now.bossAge > 2) await page.evaluate(() => window.__LAST_WORLDS__.killBoss());
      // The bench's frame log is emptied every second (it would otherwise grow the heap being measured).
      frames.push(...(await page.evaluate(s => { const f = window.__LAST_WORLDS__.benchStop(); window.__LAST_WORLDS__.bench(s, 99); return f.map(x => x.total); }, steps)));
      if (now.sector !== last.sector || now.planet !== last.planet) {
        await page.evaluate(() => window.__LAST_WORLDS__.benchStop());
        await page.waitForTimeout(300);
        const sample = { ...now, heapMB: await heap(), ...(await renderer()), wall: (Date.now() - startedAt) / 1000, framesAt4: stats(frames), load: load() };
        result.samples.push(sample); frames = [];
        console.log(`t ${now.time.toFixed(0)} s sector ${now.sector} ${now.planet}: heap ${sample.heapMB} MB geo/tex/prog ${sample.geometries}/${sample.textures}/${sample.programs} objects ${sample.objects} · load ${sample.load}`);
        writeFileSync(out, JSON.stringify(result, null, 1));
        await page.evaluate(s => window.__LAST_WORLDS__.bench(s, 99), steps);
        if (now.sector >= sectors) break;
      }
      last = now;
      if (Date.now() - startedAt > Number(process.env.PERF_SOAK_MINUTES ?? 40) * 60_000) break;
    }
    await page.evaluate(() => window.__LAST_WORLDS__.benchStop());
    await window_('end');
    const end = await state();
    result.samples.push({ ...end, at: 'end', heapMB: await heap(), ...(await renderer()), wall: (Date.now() - startedAt) / 1000, load: load() });
  }
} finally {
  result.endedLoad = load();
  writeFileSync(out, JSON.stringify(result, null, 1));
  await browser.close();
}
