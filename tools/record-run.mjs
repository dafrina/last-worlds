#!/usr/bin/env node
/*
 * Records a flight to video (docs/41; the user, 13 November: "record a perfect play", "we could do it for failed runs so
 * we can see what happens. Make sure to build a reusable script for it").
 *
 *   npm run record -- --mission silent-empire --rank 4 --weapon pulse                 the perfect pilot's whole run
 *   npm run record -- --mission final-horizon --rank 3 --pilot skilled --find life \
 *     --seeds 1-30 --clip                                                             a clip round each life it loses
 *   npm run record -- --replay run.json --check                                       is the replay exact?
 *
 * Options:
 *   --mission <id> --weapon pulse|fan|seeker|rail --rank 0-4 (Level 1-5) --difficulty relaxed|standard|veteran
 *   --pilot perfect|skilled|hunter|pacifist   --seeds a-b (or --seed n)
 *   --find none|hit|life|fail   the first seed whose flight has it (with --seeds)
 *   --clip                      only clips round each found event (`--find life`: each life lost; else each hit)
 *   --before 8 --after 3        a clip's seconds before and after its event
 *   --from 60 --to 120          only that stretch of the run (run seconds)
 *   --out <file.webm>           default recordings/<mission>-<pilot>-L<level>-s<seed>[-clip<n>].webm
 *   --fps 60|30   --tail 4 (seconds after the end of a whole run)
 *   --scale 1|2 (device pixels per CSS pixel; 420 × 760 at 1)   --quality low|high (high: the post pass; several times slower)
 *   --url <dev server>          default: its own private server (no hot reload) on --port 4199 or the next free one
 *   --replay <file.json>        skip step 1 and use a recorded flight   --check (replay at full speed, compare, no video)
 *
 * Step 1 flies the run in Node (tests/sim/record-inputs.test.ts) and keeps its steering a tick at a time. Step 2 replays
 * it in the dev build (src/dev-hooks.ts Bench.replay) one frame at a time and pipes each captured frame as JPEG into
 * Playwright's own ffmpeg (VP9 WebM), so the video is smooth whatever the machine's speed. The replay is checked against
 * the recording's end (time, kills, the ship's x). Needs Playwright's Chromium.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback; };
const flag = name => argv.includes(`--${name}`);
const fps = Number(opt('fps', 60)), tail = Number(opt('tail', 4));
const before = Number(opt('before', 8)), after = Number(opt('after', 3)), check = flag('check'), clip = flag('clip');
const find = opt('find', 'none');

// Step 1: the flight's steering.
let file = opt('replay');
if (!file) {
  file = join(tmpdir(), `last-worlds-run-${process.pid}.json`);
  const env = { ...process.env, REPLAY_OUT: file, REPLAY_MISSION: opt('mission', 'silent-empire'), REPLAY_WEAPON: opt('weapon', 'pulse'),
    REPLAY_RANK: opt('rank', '4'), REPLAY_DIFFICULTY: opt('difficulty', 'standard'), REPLAY_PILOT: opt('pilot', 'perfect'),
    REPLAY_SEEDS: opt('seeds', opt('seed', '1')), REPLAY_FIND: find };
  console.log(`flying ${env.REPLAY_MISSION} L${Number(env.REPLAY_RANK) + 1} ${env.REPLAY_WEAPON} (${env.REPLAY_PILOT}, seeds ${env.REPLAY_SEEDS}${find !== 'none' ? `, looking for: ${find}` : ''})…`);
  const result = spawnSync('npx', ['vitest', 'run', 'tests/sim/record-inputs.test.ts', '--silent=false'], { env, encoding: 'utf8' });
  for (const line of (result.stdout ?? '').split('\n')) if (/^seed \d+:/.test(line.trim())) console.log(' ', line.trim());
  if (result.status !== 0) { console.error(result.stdout?.split('\n').filter(l => /Error|No seed/.test(l)).join('\n') || result.stderr); process.exit(1); }
}
const run = JSON.parse(readFileSync(file, 'utf8'));
const level = (run.config.rank ?? 0) + 1;
console.log(`seed ${run.config.seed}: ${run.end.phase}, ${run.end.hits} hits${run.hits?.length ? ` at ${run.hits.join(', ')} s` : ''}, ${run.end.livesLost} lives lost`);

// The clips (or the whole run): [start, end] in run seconds.
const events = find === 'life' ? run.livesLostAt ?? [] : run.hits ?? [];
const window_ = opt('from') !== undefined || opt('to') !== undefined ? [Number(opt('from', 0)), Number(opt('to', Infinity))] : null;
const segments = clip && events.length ? events.map(t => [Math.max(0, t - before), t + after]) : [window_ ?? [0, Infinity]];
const base = `recordings/${run.config.mission}-${run.pilot ?? 'perfect'}-L${level}-s${run.config.seed}`;

const cache = join(homedir(), '.cache', 'ms-playwright');
const ffdir = readdirSync(cache).filter(d => d.startsWith('ffmpeg-')).sort().pop();
if (!check && !ffdir) throw new Error('No Playwright ffmpeg found (npx playwright install ffmpeg)');
const ticksPerFrame = Math.max(1, Math.round(60 / fps));

// Its own dev server unless --url names one: no hot reload and no file watching, so editing the game while a recording
// runs can neither reload the page nor change the rules under the replay; its own port and cache, so a dev server you
// have open is untouched.
let server = null, url = opt('url');
if (!url) {
  const { createServer } = await import('vite');
  server = await createServer({ logLevel: 'error', cacheDir: 'node_modules/.vite-record', server: { host: '127.0.0.1', port: Number(opt('port', 4199)), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  url = server.resolvedUrls.local[0];
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: Number(opt('scale', 1)) });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`${url}?dev`);
await page.waitForFunction(() => !!window.__LAST_WORLDS__, null, { timeout: 60000 });
// The replay bench first (no tick runs until the recorder asks), then the flight.
await page.evaluate(([inputs, noFire]) => window.__LAST_WORLDS__.replay(inputs, noFire), [run.inputs, !!run.noFire]);
await page.evaluate(config => window.__LAST_WORLDS__.launch(config), run.config);
// The software renderer draws a high-quality frame in seconds: low quality (no post pass) by default; --quality high for a trailer.
await page.evaluate(q => window.__LAST_WORLDS__.setQuality(q), opt('quality', 'low'));
await page.waitForFunction(() => window.__LAST_WORLDS__.status()?.phase === 'playing', null, { timeout: 120000 });
// Let the first frames settle (assets, shaders) before anything is captured.
await page.waitForTimeout(4000);

const status = () => page.evaluate(() => window.__LAST_WORLDS__.status());
const nextFrame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
/** Queues up to `limit` ticks (never past the recording's last: its end is the fingerprint) and waits for them drawn. */
const tick = async limit => {
  const at = (await status())?.tick ?? 0, n = Math.max(0, Math.min(limit, run.ticks - at));
  if (n) await page.evaluate(k => window.__LAST_WORLDS__.tick(k), n);
  await nextFrame();
};
/** Steps at full speed (nothing captured) to run time `t`. */
const fastForward = async t => {
  for (;;) {
    const s = await status();
    if (!s || s.phase !== 'playing' || s.time >= t - 1e-6 || s.tick >= run.ticks) return;
    await tick(Math.max(1, Math.min(240, Math.round((t - s.time) * 60))));
  }
};

const started = Date.now();
let total = 0;
if (!check) for (const [index, [from, to]] of segments.entries()) {
  await fastForward(from);
  const named = opt('out');
  const target = named ? (segments.length > 1 ? named.replace(/\.webm$/, `-${index + 1}.webm`) : named) : clip ? `${base}-clip${index + 1}.webm` : window_ ? `${base}-${from}-${to}s.webm` : `${base}.webm`;
  mkdirSync(dirname(target), { recursive: true });
  // Frames stream through a named pipe: Playwright's ffmpeg build has no pipe: or fd: protocol, and a child's stdin under
  // Node is a socket, which /dev/stdin cannot open.
  const fifo = join(tmpdir(), `last-worlds-frames-${process.pid}-${index}`);
  rmSync(fifo, { force: true });
  if (spawnSync('mkfifo', [fifo]).status !== 0) throw new Error('mkfifo failed');
  const ffmpeg = spawn(join(cache, ffdir, 'ffmpeg-linux'), ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(60 / ticksPerFrame), '-c:v', 'mjpeg',
    '-i', fifo, '-c:v', 'libvpx-vp9', '-b:v', '6M', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', target], { stdio: ['ignore', 'inherit', 'inherit'] });
  let failed = null;
  const closed = new Promise(resolve => ffmpeg.on('close', code => { if (code) failed = new Error(`ffmpeg exited with ${code}`); resolve(); }));
  const sink = createWriteStream(fifo);
  const write = buffer => new Promise((resolve, reject) => {
    if (failed) return reject(failed);
    if (sink.write(buffer)) resolve(); else sink.once('drain', resolve);
  });
  let frames = 0, tailFrames = 0;
  for (;;) {
    const s = await status();
    const playing = s && s.phase === 'playing' && s.tick < run.ticks && s.time < to;
    if (!playing && (to !== Infinity || tailFrames >= tail * 60 / ticksPerFrame)) break;
    if (playing) await tick(ticksPerFrame); else { await nextFrame(); tailFrames += 1; }
    await write(await page.screenshot({ type: 'jpeg', quality: 88 }));
    frames += 1;
    if (frames % 300 === 0) console.log(`  ${target}: frame ${frames}, t ${s?.time.toFixed(1) ?? '—'} s (${((Date.now() - started) / (total + frames)).toFixed(0)} ms a frame)`);
  }
  await new Promise(resolve => sink.end(resolve));
  await closed;
  rmSync(fifo, { force: true });
  if (failed) throw failed;
  total += frames;
  console.log(`wrote ${target}: ${frames} frames (${(frames * ticksPerFrame / 60).toFixed(1)} s)`);
}
// The rest of the flight unrecorded, then its end against the recording's.
await fastForward(Infinity);
const end = await page.evaluate(() => { const s = window.__LAST_WORLDS__.snapshot(); return s && { time: +s.time.toFixed(4), kills: s.kills, x: +s.player.x.toFixed(5) }; });
const exact = !!end && end.time === run.end.time && end.kills === run.end.kills && end.x === run.end.x;
console.log(`replay ${exact ? 'exact' : 'DIVERGED'}: recorded ${JSON.stringify({ time: run.end.time, kills: run.end.kills, x: run.end.x })}, replayed ${JSON.stringify(end)}`);
await browser.close();
await server?.close();
console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)} s`);
process.exit(exact ? 0 : 2);
