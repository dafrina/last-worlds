// CPU-side frame-work bench (polish pass, 30 October 2026; mobile performance pass, 3 November: peak-moment scenarios,
// heap after forced GC, allocation sampling). Run a dev server first (any port), then:
//   node tools/perf-bench.mjs <out.json> [base=http://127.0.0.1:4194] [scenarios=all] [qualities=high,low] [throttle=4] [frames=600]
// Each scenario launches a fixed flight (same seed, same scripted weave, exactly `steps` simulation ticks per rendered
// frame; src/main.ts `bench`), so every run does identical simulation and render work whatever the machine's speed. It
// records per-frame JS work (simulation + render() + UI), long tasks, a CDP CPU profile (self time by function, GC) under
// CPU throttling, the renderer's own stats, and the JS heap after a forced GC at the end. `PERF_ALLOC=1` replaces the CPU
// profile with V8's sampling heap profiler (minor- and major-GC'd objects included): bytes allocated per frame and by
// function, a load-independent count. Headless Chromium draws with SwiftShader: GPU time is not measured.
// Scenarios (docs/36-mobile-performance.md): each world in flight, a strike site's destruction, Vesper's lasers, a dense
// wave, a boss's phase changes, rapid scrolling (three ticks a frame) and an endless planet jump (departure, warp, switch).
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const [out = 'perf.json', base = 'http://127.0.0.1:4194', which = 'all', qualityArg = 'high,low', throttleArg = '4', framesArg = '600'] = process.argv.slice(2);
const campaign = (mission, difficulty = 'standard') => ({ mode: 'campaign', mission, seed: 4242, difficulty });
/**
 * `skip` seconds flown unrendered first, or `boss` (until the boss fights), or `until` (a page-side test, checked every
 * 0.25 s). `steps` ticks per frame; `steer` a held x instead of the weave ('site': the site core's side); `actions`
 * [frame, hook] run as the measured frame count reaches them; `segments` split the frame stats by a frame predicate.
 */
const SCENARIOS = {
  luna: { config: campaign('training'), skip: 25 },
  khepri: { config: campaign('bastion'), skip: 25 },
  vesper: { config: campaign('cold-vector'), skip: 25 },
  nacre: { config: campaign('deep-bloom'), skip: 25 },
  amnion: { config: campaign('brood-strike'), skip: 25 },
  umbra: { config: campaign('final-horizon'), skip: 25 },
  'khepri-boss': { config: campaign('bastion'), boss: true },
  'nacre-boss': { config: campaign('deep-bloom'), boss: true },
  // Peak moments.
  site: { config: campaign('bastion'), skip: 66.5, steer: 'site', actions: [[60, 'killSites']], frames: 420,
    segments: { 'kill+2s': f => f.index >= 60 && f.index < 180 } },
  lasers: { config: campaign('cold-vector', 'veteran'), skip: 26, frames: 1200 },
  dense: { config: campaign('final-horizon', 'veteran'), skip: 28, frames: 720 },
  'boss-phases': { config: campaign('bastion'), boss: true, actions: [[90, 'killFlanks'], [330, 'bossOverload'], [570, 'killBoss']], frames: 840,
    segments: { flanks: f => f.index >= 90 && f.index < 150, overload: f => f.index >= 330 && f.index < 390, death: f => f.index >= 570 && f.index < 690 } },
  rapid: { config: campaign('bastion'), skip: 25, steps: 3 },
  jump: { config: { mode: 'endless', seed: 4242 }, jump: true, frames: 420,
    segments: { 'fast scroll': f => f.speed > 8, warp: f => f.warp } },
};
const names = which === 'all' ? Object.keys(SCENARIOS) : which.split(',');
const qualities = qualityArg.split(','), throttle = Number(throttleArg), WARM = 90, ALLOC = !!process.env.PERF_ALLOC;

const stats = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length, at = p => sorted[Math.min(n - 1, Math.floor(p * (n - 1)))] ?? 0;
  return { n, mean: +(values.reduce((a, b) => a + b, 0) / Math.max(1, n)).toFixed(3), p50: +at(.5).toFixed(3), p95: +at(.95).toFixed(3), p99: +at(.99).toFixed(3), max: +at(1).toFixed(3) };
};
const frameStats = frames => ({ ...stats(frames.map(f => f.total)), over16: frames.filter(f => f.total > 16.7).length, over33: frames.filter(f => f.total > 33.3).length,
  over100: frames.filter(f => f.total > 100).length });
const load = async () => { try { const { readFileSync } = await import('node:fs'); return readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' '); } catch { return '?'; } };
/** The JS heap after two forced collections (MB): what the page keeps, not what it has yet to collect. */
const heapAfterGc = async cdp => {
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return +(usedSize / 1e6).toFixed(2);
};

/** Pre-roll (unrendered, the ship vulnerable): to a time, to the boss's fight, or to an endless departure. */
async function preRoll(page, scenario) {
  if (scenario.boss) {
    await page.evaluate(() => {
      const api = window.__LAST_WORLDS__;
      for (let i = 0; i < 400; i++) {
        const state = api.snapshot();
        if (!state || state.phase !== 'playing') return;
        if (state.boss && state.boss.phase !== 'arrival' && state.time - state.boss.phaseStartedAt > 3) return;
        api.setLives(99); api.advance(1, true);
      }
    });
  } else if (scenario.jump) {
    // To the first boss's fight, its death, and the departure's first moments (the wreck hold ends, the scroll ramps up).
    await page.evaluate(() => {
      const api = window.__LAST_WORLDS__;
      for (let i = 0; i < 2000; i++) {
        const state = api.snapshot();
        if (!state || state.phase !== 'playing') return;
        if (state.boss && state.boss.phase === 'destroyed' && state.scrollSpeed > .5) return;
        if (state.boss && state.boss.phase !== 'arrival' && state.boss.phase !== 'destroyed' && state.time - state.boss.phaseStartedAt > 2) api.killBoss();
        api.setLives(99); api.advance(state.boss ? .1 : 1, true);
      }
    });
  } else if (scenario.skip) await page.evaluate(seconds => { window.__LAST_WORLDS__.setLives(99); window.__LAST_WORLDS__.advance(seconds, true); }, scenario.skip);
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  for (const name of names) for (const quality of qualities) {
    const scenario = SCENARIOS[name], FRAMES = scenario.frames ?? Number(framesArg), steps = scenario.steps ?? 1;
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
    // Held at zero ticks a frame from the launch on, so the pre-roll starts at the flight's first tick on every run.
    await page.evaluate(() => window.__LAST_WORLDS__.bench(0, 5));
    await page.evaluate(config => window.__LAST_WORLDS__.launch(config), scenario.config);
    await page.waitForFunction(() => window.__LAST_WORLDS__.snapshot()?.phase === 'playing', null, { timeout: 120_000 });
    await page.evaluate(() => window.__LAST_WORLDS__.setLives(99));
    await preRoll(page, scenario);
    // A held x: the site core's side (the camera follows the ship until it shows the site).
    const steer = scenario.steer === 'site'
      ? await page.evaluate(() => { const core = window.__LAST_WORLDS__.snapshot()?.enemies.find(enemy => enemy.site); return core ? Math.max(-10, Math.min(10, core.x * 1.2)) : undefined; })
      : scenario.steer;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.evaluate(([s, x]) => window.__LAST_WORLDS__.bench(s, 5, x ?? undefined), [steps, steer ?? null]);
    await page.waitForFunction(n => window.__LAST_WORLDS__.benchFrames() >= n, WARM, { timeout: 600_000, polling: 500 });
    await page.evaluate(([s, x]) => { window.__LAST_WORLDS__.benchStop(); window.__longtasks.length = 0; window.__LAST_WORLDS__.bench(s, 5, x ?? undefined); }, [steps, steer ?? null]);
    // Scenario actions fire inside the page as the measured frame count reaches them (a requestAnimationFrame watcher).
    if (scenario.actions) await page.evaluate(actions => {
      const api = window.__LAST_WORLDS__, pending = [...actions];
      window.__benchLog = [];
      const watch = () => {
        const count = api.benchFrames();
        if (count < 0) return;
        while (pending.length && count >= pending[0][0]) { const [at, hook] = pending.shift(); window.__benchLog.push([at, count, hook, api[hook]?.()]); }
        if (pending.length) requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    }, scenario.actions);
    if (ALLOC) {
      await cdp.send('HeapProfiler.enable');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    } else { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); }
    const loadBefore = await load();
    await cdp.send('Performance.enable');
    if (!ALLOC) await cdp.send('Profiler.start');
    const renderSamples = [];
    const startedAt = Date.now();
    for (;;) {
      const [count, raw, state] = await page.evaluate(() => [window.__LAST_WORLDS__.benchFrames(), document.querySelector('canvas')?.dataset.renderStats ?? '{}', (() => { const s = window.__LAST_WORLDS__.snapshot(); return s ? { phase: s.phase, planet: s.planet, enemies: s.enemies.length, shots: s.projectiles.length, hazards: s.hazards.length, boss: s.boss?.phase ?? null } : null; })()]);
      try { const r = JSON.parse(raw); renderSamples.push({ graph: r.graph, calls: r.calls, triangles: r.triangles, passes: r.passes, programs: r.programs, textures: r.textures, geometries: r.geometries, drawn: r.enemies, particles: r.particles, stream: r.stream, ...(r.fxCoverage ? { fxCoverage: Object.values(r.fxCoverage).reduce((a, b) => a + b, 0) } : {}), ...(typeof r.laneCoverage === 'number' ? { laneCoverage: r.laneCoverage } : {}), ...state }); } catch { /* none yet */ }
      if (count >= FRAMES || count < 0 || Date.now() - startedAt > 900_000) break;
      await page.waitForTimeout(1000);
    }
    let profile = null, alloc = null;
    if (ALLOC) {
      const { profile: sampled } = await cdp.send('HeapProfiler.stopSampling');
      // Everything allocated, and what the frame callback (src/main.ts `frame`: simulation, render, UI) allocated; the menu
      // globes' idle-time bake (src/ui/planet-preview.ts) and other callbacks fall outside it.
      const bySite = new Map();
      let bytes = 0, inFrame = 0;
      const walk = (node, framed) => {
        const frame = node.callFrame, key = `${frame.functionName || '(anonymous)'} ${frame.url.replace(/^.*\/(src|node_modules|deps)\//, '$1/').replace(/\?.*$/, '')}:${frame.lineNumber + 1}`;
        const within = framed || (frame.functionName === 'frame' && /src\/main\.ts/.test(frame.url));
        bytes += node.selfSize;
        if (within) { inFrame += node.selfSize; bySite.set(key, (bySite.get(key) ?? 0) + node.selfSize); }
        for (const child of node.children) walk(child, within);
      };
      walk(sampled.head, false);
      alloc = { bytes, inFrame, top: [...bySite].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([key, size]) => [key, +(size / 1024).toFixed(0)]) };
    } else profile = (await cdp.send('Profiler.stop')).profile;
    if (profile && process.env.PERF_PROFILES) writeFileSync(`${out.replace(/\.json$/, '')}.${name}.${quality}.cpuprofile`, JSON.stringify(profile));
    const frames = await page.evaluate(() => window.__LAST_WORLDS__.benchStop());
    const longtasks = await page.evaluate(() => window.__longtasks);
    const actionLog = await page.evaluate(() => window.__benchLog ?? []);
    const loadAfter = await load();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const heap = await heapAfterGc(cdp);
    // Self time by function (and the GC / idle / program buckets).
    let profileStats = null, top = [], result_inclusive = null;
    if (profile) {
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
      top = [...self].filter(([key]) => !key.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([key, ms]) => [key, +ms.toFixed(1)]);
      // Inclusive time inside the frame callback (src/main.ts `frame`), per function: where a frame's work goes.
      const parent = new Map();
      for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
      const label = node => `${node.callFrame.functionName || '(anonymous)'} ${node.callFrame.url.replace(/^.*\/(src|node_modules|deps)\//, '$1/').replace(/\?.*$/, '')}:${node.callFrame.lineNumber + 1}`;
      const inclusive = new Map();
      let inFrameMs = 0;
      for (let i = 0; i < profile.samples.length; i++) {
        const keys = [];
        let id = profile.samples[i], framed = false;
        while (id !== undefined) { const node = byNode.get(id); const key = label(node); keys.push(key); if (/^frame src\/main\.ts/.test(key)) framed = true; id = parent.get(id); }
        if (!framed) continue;
        const ms = (dt[i + 1] ?? 0) / 1000; inFrameMs += ms;
        for (const key of new Set(keys)) inclusive.set(key, (inclusive.get(key) ?? 0) + ms);
      }
      result_inclusive = { inFrameMs: +inFrameMs.toFixed(1), top: [...inclusive].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([key, ms]) => [key, +ms.toFixed(1)]) };
      profileStats = { busyMs: +(totalMs - idle).toFixed(0), gcMs: +gc.toFixed(1), perFrameBusy: +((totalMs - idle) / Math.max(1, frames.length)).toFixed(3), perFrameGc: +(gc / Math.max(1, frames.length)).toFixed(3) };
    }
    // Frame indices and the warp window (the planet switch's frames) for the segments.
    const jumpAt = frames.findIndex(f => f.speed > 25);
    frames.forEach((f, index) => { f.index = index; f.warp = jumpAt >= 0 && Math.abs(index - jumpAt) < 120; });
    const segments = Object.fromEntries(Object.entries(scenario.segments ?? {}).map(([key, test]) => [key, frameStats(frames.filter(test))]));
    const pick = key => renderSamples.map(r => r[key]).filter(v => typeof v === 'number');
    const result = {
      name, quality, throttle, steps, frames: frames.length, wallSeconds: (Date.now() - startedAt) / 1000, load: { before: loadBefore, after: loadAfter }, alloc: !!ALLOC,
      total: frameStats(frames), sim: stats(frames.map(f => f.sim)), render: stats(frames.map(f => f.render)), segments,
      longTasks: longtasks.length, longTaskMs: +longtasks.reduce((a, [, d]) => a + d, 0).toFixed(0), longestTask: +Math.max(0, ...longtasks.map(([, d]) => d)).toFixed(0),
      profile: profileStats, heapAfterGcMB: heap,
      allocation: alloc && { totalMB: +(alloc.bytes / 1e6).toFixed(2), perFrameKB: +(alloc.inFrame / 1024 / Math.max(1, frames.length)).toFixed(1),
        allPerFrameKB: +(alloc.bytes / 1024 / Math.max(1, frames.length)).toFixed(1), top: alloc.top },
      renderer: { calls: stats(pick('calls')), triangles: stats(pick('triangles')), programs: Math.max(0, ...pick('programs')), textures: Math.max(0, ...pick('textures')), geometries: Math.max(0, ...pick('geometries')),
        shadowCalls: stats(renderSamples.map(r => r.passes?.shadow ?? 0)), drawn: stats(pick('drawn')), enemies: stats(pick('enemies')), shots: stats(pick('shots')), hazards: stats(pick('hazards')), particles: stats(pick('particles')), fxCoverage: stats(pick('fxCoverage')), laneCoverage: stats(pick('laneCoverage')) },
      // Sections generated (and views built) synchronously mid-flight during the window: each is a long frame.
      stream: (() => { const first = renderSamples.find(r => r.stream)?.stream, last = renderSamples.at(-1)?.stream; return first && last
        ? { fallbacks: last.fallbacks - first.fallbacks, viewFallbacks: last.viewFallbacks - first.viewFallbacks, prefetched: last.prefetched - first.prefetched } : null; })(),
      graph: renderSamples.at(-1)?.graph, planets: [...new Set(renderSamples.map(r => r.planet).filter(Boolean))], bossPhases: [...new Set(renderSamples.map(r => r.boss).filter(Boolean))],
      actions: actionLog, errors, top, inclusive: result_inclusive,
    };
    results.push(result);
    const t = result.total;
    console.log(`${name}/${quality}: ${ALLOC ? `alloc in frame ${result.allocation.perFrameKB} KB/frame (all ${result.allocation.allPerFrameKB}) · ` : ''}mean ${t.mean} p95 ${t.p95} p99 ${t.p99} max ${t.max} ms · >16.7 ${t.over16} >33 ${t.over33} · gc/frame ${profileStats?.perFrameGc ?? '-'} · calls ${result.renderer.calls.mean} · tris ${result.renderer.triangles.mean} · geo/tex/prog ${result.renderer.geometries}/${result.renderer.textures}/${result.renderer.programs} · heap ${heap} MB · load ${loadBefore} → ${loadAfter}`
      + Object.entries(segments).map(([key, s]) => `\n    ${key}: n ${s.n} mean ${s.mean} p95 ${s.p95} max ${s.max} >33 ${s.over33}`).join(''));
    writeFileSync(out, JSON.stringify(results, null, 1));
    await context.close();
  }
} finally {
  await browser.close();
}
