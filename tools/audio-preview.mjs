// Renders the listening previews offline through the game's own mixer, in headless Chromium.
// A Vite dev server must be running: AUDIO_PREVIEW_URL (default http://127.0.0.1:4173) serves the audio lab fixture.
//   node tools/audio-preview.mjs [output directory] [planet ...]
// AUDIO_PREVIEW_BEFORE names a folder rendered the same way from older code (default: a before/ folder beside or inside
// the output); the Sound room then offers both builds. AUDIO_PREVIEW_BUILDS ("Label=folder,Label=folder", folders beside
// the output, the output among them) instead writes the room one level up, offering every listed build.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? 'lookdev/audio');
const PLANETS = ['luna', 'khepri', 'nacre', 'vesper', 'amnion', 'corona', 'umbra'];
const planets = process.argv.length > 3 ? process.argv.slice(3) : PLANETS;
const page = process.env.AUDIO_PREVIEW_PAGE ?? '/tests/fixtures/audio-lab.html';

// Bars of each world's own tempo. The developed second phrase (step 128) is the common starting point.
const VERSIONS = {
  normal: { label: 'Normal flight', bars: 10, startStep: 128 },
  'boss-modules': { label: 'Boss arrival and modules (entrance stinger)', bars: 10, startStep: 128, cues: true,
    phases: [{ bar: .4, phase: 'arrival' }, { bar: 2.4, phase: 'batteries' }] },
  'boss-core': { label: 'Boss core', bars: 10, startStep: 128, phases: [{ bar: 0, phase: 'core', immediate: true }] },
  'boss-overload': { label: 'Boss overload', bars: 10, startStep: 128, phases: [{ bar: 0, phase: 'overload', immediate: true }] },
  'modules-to-core': { label: 'Modules → core (phase change mid-bar)', bars: 10, startStep: 128, cues: true,
    phases: [{ bar: 0, phase: 'batteries', immediate: true }, { bar: 4.37, phase: 'core' }] },
  'core-to-overload': { label: 'Core → overload (phase change mid-bar)', bars: 10, startStep: 128, cues: true,
    phases: [{ bar: 0, phase: 'core', immediate: true }, { bar: 4.37, phase: 'overload' }] },
  'full-fight': { label: 'Whole fight: level → arrival → core → overload → kill → level', bars: 26, startStep: 64, cues: true,
    phases: [{ bar: 2.2, phase: 'arrival' }, { bar: 4.2, phase: 'batteries' }, { bar: 9.6, phase: 'core' },
      { bar: 15.3, phase: 'overload' }, { bar: 21.1, phase: 'destroyed' }, { bar: 23.6, phase: null }] },
};
// Music under fire: volleys, explosions and a shield break over a boss stage.
const COMBAT = { luna: 'boss-core', corona: 'boss-overload', umbra: 'boss-overload' };

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const metrics = {};
try {
  const tab = await browser.newPage();
  // Another session may trigger Vite reloads while a long offline render is underway.
  await tab.route('**/@vite/client', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await tab.goto(`${process.env.AUDIO_PREVIEW_URL ?? 'http://127.0.0.1:4173'}${page}`);
  await tab.waitForFunction(() => window.__AUDIO_LAB__?.renderTimeline || window.__AUDIO_AB__);
  const jobs = [];
  for (const planet of planets) {
    for (const [version, job] of Object.entries(VERSIONS)) jobs.push([`${planet}-${version}`, { planet, ...job }]);
    if (COMBAT[planet]) jobs.push([`${planet}-${COMBAT[planet]}-combat`, { planet, ...VERSIONS[COMBAT[planet]], combat: true }]);
  }
  for (const [name, job] of jobs) {
    const started = Date.now();
    const result = await tab.evaluate(async job => (window.__AUDIO_LAB__ ?? window.__AUDIO_AB__).renderTimeline(job), job);
    await writeFile(path.join(output, `${name}.wav`), Buffer.from(result.wav, 'base64'));
    metrics[name] = result.metrics;
    const m = result.metrics;
    console.log(name.padEnd(34), `peak ${m.peak.toFixed(3)}  rms ${m.rms.toFixed(4)}  clipped ${m.clipped}  nonFinite ${m.nonFinite}`,
      `voices ${m.peakVoices}  dropped ${m.dropped}  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
} finally { await browser.close(); }
await writeFile(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

// A small Sound room: every world with its versions, and Before/After when a before/ render sits beside this one.
const listed = (process.env.AUDIO_PREVIEW_BUILDS ?? '').split(',').filter(Boolean).map(pair => pair.split('='));
let room = output, builds;
if (listed.length) {
  room = path.dirname(output);
  builds = listed.map(([label, folder]) => ({ label, link: `${folder}/`, chosen: folder === path.basename(output) }));
} else {
  const beforeDir = process.env.AUDIO_PREVIEW_BEFORE ? path.resolve(process.env.AUDIO_PREVIEW_BEFORE)
    : path.basename(output) === 'after' ? path.join(output, '..', 'before') : path.join(output, 'before');
  const before = await readFile(path.join(beforeDir, 'metrics.json'), 'utf8').then(JSON.parse).catch(() => null);
  builds = before ? [{ label: 'After (upgraded)', link: '', chosen: true }, { label: 'Before', link: path.relative(output, beforeDir).split(path.sep).join('/') + '/' }] : [];
}
const chosen = builds.find(b => b.chosen)?.link ?? '';
const rows = planets.map(planet => {
  const options = Object.entries(VERSIONS).map(([version, { label }]) => `<option value="${planet}-${version}.wav">${label}</option>`).join('')
    + (COMBAT[planet] ? `<option value="${planet}-${COMBAT[planet]}-combat.wav">Under fire (${COMBAT[planet].replace('boss-', '')})</option>` : '');
  const buildOptions = builds.map(b => `<option value="${b.link}"${b.chosen ? ' selected' : ''}>${b.label}</option>`).join('');
  return `<article><h2>${planet[0].toUpperCase()}${planet.slice(1)}</h2>
  <label>Version <select data-version>${options}</select></label>
  ${builds.length ? `<label>Build <select data-build>${buildOptions}</select></label>` : ''}
  <audio controls preload="none" src="${chosen}${planet}-normal.wav"></audio></article>`;
}).join('');
await writeFile(path.join(room, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Last Worlds sound room</title>
<style>
:root{--bg:#081321;--panel:#0d1c2c;--line:#294052;--text:#dfebf4;--muted:#9eb4c8}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f3f6f9;--panel:#fff;--line:#c9d5df;--text:#10202e;--muted:#4b6072}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:auto;padding:32px 16px}h1{margin:0 0 8px}p{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
article{border:1px solid var(--line);background:var(--panel);padding:16px}h2{margin:0 0 8px;font-size:20px}
label{display:block;color:var(--muted);font-size:13px;margin-bottom:8px}select{width:100%;margin-top:4px;padding:6px;font:inherit}
audio{width:100%}
</style><main><h1>Sound room</h1>
<p>Offline renders through the game's own mixer at default volumes (music 55 %, effects 80 %). Switching version or build keeps the playback position.</p>
<section class="grid">${rows}</section></main>
<script>
for (const card of document.querySelectorAll('article')) {
  const player = card.querySelector('audio');
  const update = () => {
    const at = player.currentTime, playing = !player.paused;
    player.src = (card.querySelector('[data-build]')?.value ?? '') + card.querySelector('[data-version]').value;
    player.addEventListener('loadedmetadata', () => { player.currentTime = Math.min(at, player.duration - .1); if (playing) player.play().catch(() => {}); }, { once: true });
    player.load();
  };
  card.addEventListener('change', update);
}
document.addEventListener('play', event => { for (const p of document.querySelectorAll('audio')) if (p !== event.target) p.pause(); }, true);
</script></html>
`);
