// CPU-side frame-work bench (polish pass, 30 October 2026). Run a dev server first (any port), then:
//   node tools/perf-bench.mjs <out.json> [base=http://127.0.0.1:4194] [scenarios=all] [qualities=high,low] [throttle=4] [frames=900]
// Each scenario launches a fixed flight (same seed, same scripted weave, exactly one simulation tick per rendered frame;
// src/main.ts `bench`), so every run does identical simulation and render work whatever the machine's speed. It records
// per-frame JS work (simulation + render() + UI), long tasks, a CDP CPU profile (self time by function, GC) under CPU
// throttling, and the renderer's own stats. Headless Chromium draws with SwiftShader: GPU time is not measured.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const [out = 'perf.json', base = 'http://127.0.0.1:4194', which = 'all', qualityArg = 'high,low', throttleArg = '4', framesArg = '900'] = process.argv.slice(2);
const SCENARIOS = {
  khepri: { config: { mode: 'campaign', mission: 'bastion', seed: 4242, difficulty: 'standard' }, skip: 25 },
  vesper: { config: { mode: 'campaign', mission: 'cold-vector', seed: 4242, difficulty: 'standard' }, skip: 25 },
  nacre: { config: { mode: 'campaign', mission: 'deep-bloom', seed: 4242, difficulty: 'standard' }, skip: 25 },
  umbra: { config: { mode: 'campaign', mission: 'final-horizon', seed: 4242, difficulty: 'standard' }, skip: 25 },
  'khepri-boss': { config: { mode: 'campaign', mission: 'bastion', seed: 4242, difficulty: 'standard' }, boss: true },
  'nacre-boss': { config: { mode: 'campaign', mission: 'deep-bloom', seed: 4242, difficulty: 'standard' }, boss: true },
};
const names = which === 'all' ? Object.keys(SCENARIOS) : which.split(',');
const qualities = qualityArg.split(','), throttle = Number(throttleArg), FRAMES = Number(framesArg), WARM = 90;

const stats = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length, at = p => sorted[Math.min(n - 1, Math.floor(p * (n - 1)))] ?? 0;
  return { mean: +(values.reduce((a, b) => a + b, 0) / Math.max(1, n)).toFixed(3), p50: +at(.5).toFixed(3), p95: +at(.95).toFixed(3), p99: +at(.99).toFixed(3), max: +at(1).toFixed(3) };
};
const load = async () => { try { const { readFileSync } = await import('node:fs'); return readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' '); } catch { return '?'; } };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  for (const name of names) for (const quality of qualities) {
    const scenario = SCENARIOS[name];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__longtasks = [];
      try { new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__longtasks.push([entry.startTime, entry.duration]); }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
    });
    await page.goto(`${base}/`);
    await page.waitForFunction(() => !!window.__LAST_WORLDS__, null, { timeout: 60_000 });
    await page.evaluate(q => window.__LAST_WORLDS__.setQuality(q), quality);
    await page.evaluate(config => window.__LAST_WORLDS__.launch(config), scenario.config);
    await page.waitForFunction(() => window.__LAST_WORLDS__.snapshot()?.phase === 'playing', null, { timeout: 120_000 });
    await page.evaluate(() => window.__LAST_WORLDS__.setLives(99));
    if (scenario.boss) {
      // Fly (unrendered, vulnerable) until the boss has arrived and fights.
      await page.evaluate(() => {
        const api = window.__LAST_WORLDS__;
        for (let i = 0; i < 400; i++) {
          const state = api.snapshot();
          if (!state || state.phase !== 'playing') return;
          if (state.boss && state.boss.phase !== 'arrival' && state.time - state.boss.phaseStartedAt > 3) return;
          api.setLives(99); api.advance(1, true);
        }
      });
    } else if (scenario.skip) await page.evaluate(seconds => { window.__LAST_WORLDS__.advance(seconds, true); }, scenario.skip);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.evaluate(() => window.__LAST_WORLDS__.bench(1, 5));
    await page.waitForFunction(n => window.__LAST_WORLDS__.benchFrames() >= n, WARM, { timeout: 600_000, polling: 500 });
    await page.evaluate(() => { window.__LAST_WORLDS__.benchStop(); window.__longtasks.length = 0; window.__LAST_WORLDS__.bench(1, 5); });
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    const loadBefore = await load();
    const heapBefore = (await cdp.send('Performance.enable'), await cdp.send('Performance.getMetrics')).metrics;
    await cdp.send('Profiler.start');
    const renderSamples = [];
    const startedAt = Date.now();
    for (;;) {
      const [count, raw, state] = await page.evaluate(() => [window.__LAST_WORLDS__.benchFrames(), document.querySelector('canvas')?.dataset.renderStats ?? '{}', (() => { const s = window.__LAST_WORLDS__.snapshot(); return s ? { phase: s.phase, enemies: s.enemies.length, shots: s.projectiles.length, boss: s.boss?.phase ?? null } : null; })()]);
      try { const r = JSON.parse(raw); renderSamples.push({ graph: r.graph, calls: r.calls, triangles: r.triangles, passes: r.passes, programs: r.programs, textures: r.textures, geometries: r.geometries, enemies: r.enemies, particles: r.particles, ...state }); } catch { /* none yet */ }
      if (count >= FRAMES || count < 0 || Date.now() - startedAt > 900_000) break;
      await page.waitForTimeout(1000);
    }
    const { profile } = await cdp.send('Profiler.stop');
    if (process.env.PERF_PROFILES) writeFileSync(`${out.replace(/\.json$/, '')}.${name}.${quality}.cpuprofile`, JSON.stringify(profile));
    const heapAfter = (await cdp.send('Performance.getMetrics')).metrics;
    const frames = await page.evaluate(() => window.__LAST_WORLDS__.benchStop());
    const longtasks = await page.evaluate(() => window.__longtasks);
    const loadAfter = await load();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    // Self time by function (and the GC / idle / program buckets).
    const byNode = new Map(profile.nodes.map(node => [node.id, node]));
    const self = new Map();
    const dt = profile.timeDeltas;
    for (let i = 0; i < profile.samples.length; i++) {
      const node = byNode.get(profile.samples[i]), frame = node.callFrame;
      const key = `${frame.functionName || '(anonymous)'} ${frame.url.replace(/^.*\/(src|node_modules|deps)\//, '$1/').replace(/\?.*$/, '')}:${frame.lineNumber + 1}`;
      self.set(key, (self.get(key) ?? 0) + (dt[i + 1] ?? 0) / 1000);
    }
    const totalMs = [...self.values()].reduce((a, b) => a + b, 0);
    const idle = [...self].filter(([key]) => key.startsWith('(idle)')).reduce((a, [, v]) => a + v, 0);
    const gc = [...self].filter(([key]) => key.startsWith('(garbage collector)')).reduce((a, [, v]) => a + v, 0);
    const top = [...self].filter(([key]) => !key.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([key, ms]) => [key, +ms.toFixed(1)]);
    const metric = (list, name) => list.find(m => m.name === name)?.value ?? 0;
    const pick = key => renderSamples.map(r => r[key]).filter(v => typeof v === 'number');
    const result = {
      name, quality, throttle, frames: frames.length, wallSeconds: (Date.now() - startedAt) / 1000, load: { before: loadBefore, after: loadAfter },
      total: stats(frames.map(f => f.total)), sim: stats(frames.map(f => f.sim)), render: stats(frames.map(f => f.render)),
      over16: frames.filter(f => f.total > 16.7).length, over33: frames.filter(f => f.total > 33.3).length,
      longTasks: longtasks.length, longTaskMs: +longtasks.reduce((a, [, d]) => a + d, 0).toFixed(0), longestTask: +Math.max(0, ...longtasks.map(([, d]) => d)).toFixed(0),
      profile: { busyMs: +(totalMs - idle).toFixed(0), gcMs: +gc.toFixed(1), perFrameBusy: +((totalMs - idle) / Math.max(1, frames.length)).toFixed(3), perFrameGc: +(gc / Math.max(1, frames.length)).toFixed(3) },
      heapMB: { before: +(metric(heapBefore, 'JSHeapUsedSize') / 1e6).toFixed(1), after: +(metric(heapAfter, 'JSHeapUsedSize') / 1e6).toFixed(1) },
      renderer: { calls: stats(pick('calls')), triangles: stats(pick('triangles')), programs: Math.max(0, ...pick('programs')), textures: Math.max(0, ...pick('textures')), geometries: Math.max(0, ...pick('geometries')),
        shadowCalls: stats(renderSamples.map(r => r.passes?.shadow ?? 0)), enemies: stats(pick('enemies')), shots: stats(pick('shots')), particles: stats(pick('particles')) },
      graph: renderSamples.at(-1)?.graph, bossPhases: [...new Set(renderSamples.map(r => r.boss).filter(Boolean))], errors, top,
    };
    results.push(result);
    console.log(`${name}/${quality}: total mean ${result.total.mean} p95 ${result.total.p95} p99 ${result.total.p99} ms · sim ${result.sim.mean} · render ${result.render.mean} · long ${result.longTasks} · gc/frame ${result.profile.perFrameGc} · calls ${result.renderer.calls.mean} · tris ${result.renderer.triangles.mean} · load ${loadBefore} → ${loadAfter}`);
    writeFileSync(out, JSON.stringify(results, null, 1));
    await context.close();
  }
} finally {
  await browser.close();
}
