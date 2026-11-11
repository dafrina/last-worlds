// Renders the sound-effect previews offline through the game's own mixer, in headless Chromium: each changed event
// alone and over a world's music, for an A/B comparison.
//   SFX_BUILD=before|after node tools/sfx-preview.mjs <output root>
// AUDIO_PREVIEW_URL names the dev server (default http://127.0.0.1:4173). The room (index.html) is written to the output
// root and offers every build found there.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'lookdev/audio-previews/sfx');
const build = process.env.SFX_BUILD ?? 'after', after = build === 'after';
const output = path.join(root, build);
// Volleys at a weapon tier's own waits (src/content/weapon-tiers.ts); the mixer's cooldown thins them as in the game.
const volley = (sound, waits, seconds = 1.6) => {
  const cues = [];
  for (let t = .1, i = 0; t < seconds; t += waits[i++ % waits.length]) cues.push({ at: t, sound, gain: 1, pan: 0 });
  return cues;
};
const tick = 1 / 60;
const one = (sound, extra = {}) => [{ at: .1, sound, gain: 1, pan: 0, ...extra }];
// Each event the user asked about: the cues the game plays for it in this build. Khepri is in A: the new success
// resolve is transposed to the world's key (C to A, -3).
const EVENTS = [
  ['pulse-t1', 'Twin Pulse shot, tier 1', volley('pulse', [.125])],
  ['pulse-t5', 'Twin Pulse shot, tier 5', volley('pulse', [tick, tick, tick, 2 * tick])],
  ['fan-t1', 'Fan Cannon shot, tier 1', volley('fan', [1 / 3])],
  ['fan-t5', 'Fan Cannon shot, tier 5', volley('fan', [8 * tick, 9 * tick])],
  ['seeker-t1', 'Seeker Array shot, tier 1', volley('seeker', [.24])],
  ['seeker-t5', 'Seeker Array shot, tier 5', volley('seeker', [2 * tick, 2 * tick, 2 * tick, 2 * tick, 2 * tick, 8 * tick])],
  ['rail-t1', 'Rail Driver shot, tier 1', volley('rail', [.5])],
  ['rail-t5', 'Rail Driver shot, tier 5', volley('rail', [16 * tick])],
  ['shield', 'Hit on the shield (charges left)', one('shield')],
  ['shield-break', 'Last shield charge lost', one('shield-break')],
  ['life', 'Life lost (unchanged)', one('life')],
  ['win', 'Mission complete (in Khepri\'s A)', one('win', after ? { transpose: -3 } : {})],
  ['win-luna', 'Mission complete (in Luna\'s D)', one('win', after ? { transpose: 2 } : {})],
  ['launch', 'Launch warp (no sound before)', after ? one('whoosh', { transpose: 7, gain: .8 }) : []],
  ['jump', 'Endless planet jump', after ? [...one('warp'), ...one('whoosh')] : one('warp')],
  ['part', 'Part pickup', one(after ? 'part' : 'pickup', { gain: .7 })],
  ['upgrade', 'Shield cell, power cell or weapon pickup', one('upgrade')],
  ['credit', 'Credit pickup (unchanged)', one('pickup', { gain: .7 })],
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const metrics = {};
try {
  const tab = await browser.newPage();
  await tab.route('**/@vite/client', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await tab.goto(`${process.env.AUDIO_PREVIEW_URL ?? 'http://127.0.0.1:4173'}/tests/fixtures/audio-lab.html`);
  await tab.waitForFunction(() => window.__AUDIO_LAB__?.renderTimeline);
  for (const [name, , cues] of EVENTS) {
    // Alone (2 bars of silence at Khepri's tempo, about 4 s), then over Khepri's music from the developed phrase.
    for (const [suffix, job] of [['', { planet: 'khepri', bars: 2, stemOnly: true, extra: cues }],
      ['-mix', { planet: 'khepri', bars: 3, startStep: 128, extra: cues.map(c => ({ ...c, at: c.at + .9 })) }]]) {
      const result = await tab.evaluate(async job => window.__AUDIO_LAB__.renderTimeline(job), job);
      await writeFile(path.join(output, `${name}${suffix}.wav`), Buffer.from(result.wav, 'base64'));
      const m = result.metrics;
      metrics[`${name}${suffix}`] = { peak: m.peak, rms: m.rms, clipped: m.clipped, nonFinite: m.nonFinite, windows: m.windows };
      console.log(`${name}${suffix}`.padEnd(22), `peak ${m.peak.toFixed(3)}  rms ${(20 * Math.log10(Math.max(m.rms, 1e-9))).toFixed(1)} dBFS  clipped ${m.clipped}`);
    }
  }
} finally { await browser.close(); }
await writeFile(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

// The A/B room: every build folder under the root that has metrics.
const builds = [];
for (const name of ['before', 'after']) if (await readFile(path.join(root, name, 'metrics.json'), 'utf8').then(() => true, () => false)) builds.push(name);
const rows = EVENTS.map(([name, label]) => `<article><h2>${label}</h2>
  <label>Version <select data-version><option value="${name}.wav">Alone</option><option value="${name}-mix.wav">Over Khepri's music</option></select></label>
  <label>Build <select data-build>${builds.map(b => `<option value="${b}/"${b === 'after' ? ' selected' : ''}>${b === 'before' ? 'A · before' : 'B · after'}</option>`).join('')}</select></label>
  <audio controls preload="none" src="${builds.includes('after') ? 'after' : builds[0]}/${name}.wav"></audio></article>`).join('');
await writeFile(path.join(root, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Last Worlds effects room</title>
<style>
:root{--bg:#081321;--panel:#0d1c2c;--line:#294052;--text:#dfebf4;--muted:#9eb4c8}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f3f6f9;--panel:#fff;--line:#c9d5df;--text:#10202e;--muted:#4b6072}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:auto;padding:32px 16px}h1{margin:0 0 8px}p{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
article{border:1px solid var(--line);background:var(--panel);padding:16px}h2{margin:0 0 8px;font-size:18px}
label{display:block;color:var(--muted);font-size:13px;margin-bottom:8px}select{width:100%;margin-top:4px;padding:6px;font:inherit}
audio{width:100%}
</style><main><h1>Effects room</h1>
<p>Offline renders through the game's own mixer at default volumes (music 55 %, effects 80 %): each event alone, and over Khepri's music. Switching version or build keeps the playback position.</p>
<section class="grid">${rows}</section></main>
<script>
for (const card of document.querySelectorAll('article')) {
  const player = card.querySelector('audio');
  card.addEventListener('change', () => {
    const at = player.currentTime, playing = !player.paused;
    player.src = card.querySelector('[data-build]').value + card.querySelector('[data-version]').value;
    player.addEventListener('loadedmetadata', () => { player.currentTime = Math.min(at, player.duration - .1); if (playing) player.play().catch(() => {}); }, { once: true });
    player.load();
  });
}
document.addEventListener('play', event => { for (const p of document.querySelectorAll('audio')) if (p !== event.target) p.pause(); }, true);
</script></html>
`);
