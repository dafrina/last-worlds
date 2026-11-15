// Renders the title theme and the menu's sounds offline through the game's own mixer, in headless Chromium, with a
// listening page: the full loop, a 60 s cut as first heard (fading in), every menu sound alone, and a click through
// the menus over the theme ending in a launch (the theme fading over the warp into a world's music).
//   AUDIO_PREVIEW_URL=http://127.0.0.1:4192 node tools/menu-preview.mjs [output directory]
import { chromium } from '@playwright/test';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? 'lookdev/audio-previews/menu');
const UI = [
  ['ui-press', 'Press: a confirm, opening a panel'],
  ['ui-back', 'Back: closing a panel, returning to the menu'],
  ['ui-select', 'Select: radio groups, tabs, mission dots and arrows, tiers'],
  ['ui-tick', 'Slider tick (volume), pitched by the value'],
  ['ui-purchase', 'Purchase: credits spent in the hangar'],
  ['ui-equip', 'Equip: fitting an owned item or design'],
  ['ui-deny', 'Deny: not enough credits, a locked item'],
];
// A click through the menus: open the campaign, browse missions, the hangar (a refusal, a purchase, an equip, a tier),
// back out, the settings (a volume slider dragged up, a radio), back, and launch: the theme fades over the warp into
// Luna's music.
const drag = Array.from({ length: 10 }, (_, k) => ({ at: 14.6 + k * .07, sound: 'ui-tick', transpose: -6 + k }));
const DEMO = [
  { at: .1, sound: 'ui-press' }, { at: 1.6, sound: 'ui-select' }, { at: 2.3, sound: 'ui-select' }, { at: 3, sound: 'ui-select' },
  { at: 4.2, sound: 'ui-press' }, { at: 5.4, sound: 'ui-select' }, { at: 6.4, sound: 'ui-deny' }, { at: 7.6, sound: 'ui-purchase' },
  { at: 9, sound: 'ui-equip' }, { at: 10.2, sound: 'ui-select' }, { at: 11.4, sound: 'ui-back' }, { at: 12.6, sound: 'ui-back' },
  { at: 13.8, sound: 'ui-press' }, ...drag, { at: 16.4, sound: 'ui-select' }, { at: 17.4, sound: 'ui-back' }, { at: 18.6, sound: 'ui-press' },
];
const JOBS = [
  ['theme-loop', { seconds: 79.8 }],
  ['theme-60s', { seconds: 60, fadeIn: true }],
  ...UI.map(([sound]) => [sound, { seconds: 1, theme: false, ui: [{ at: .05, sound }] }]),
  ['demo', { seconds: 30, fadeIn: true, ui: DEMO, launchAt: 20, world: 'luna' }],
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const metrics = {};
try {
  const tab = await browser.newPage();
  await tab.route('**/@vite/client', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await tab.goto(`${process.env.AUDIO_PREVIEW_URL ?? 'http://127.0.0.1:4173'}/tests/fixtures/audio-lab.html`);
  await tab.waitForFunction(() => window.__AUDIO_LAB__?.renderMenu);
  for (const [name, job] of JOBS) {
    const result = await tab.evaluate(async job => window.__AUDIO_LAB__.renderMenu(job), job);
    await writeFile(path.join(output, `${name}.wav`), Buffer.from(result.wav, 'base64'));
    const m = result.metrics, loudest = Math.max(...m.windows.map(w => w.rms));
    metrics[name] = { peak: m.peak, rms: m.rms, loudest, clipped: m.clipped, nonFinite: m.nonFinite, peakVoices: m.peakVoices, dropped: m.dropped };
    console.log(name.padEnd(12), `peak ${m.peak.toFixed(3)}  rms ${(20 * Math.log10(Math.max(m.rms, 1e-9))).toFixed(1)} dBFS  loudest ${(20 * Math.log10(Math.max(loudest, 1e-9))).toFixed(1)} dBFS  clipped ${m.clipped}  voices ${m.peakVoices}  dropped ${m.dropped}`);
  }
} finally { await browser.close(); }
await writeFile(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

const db = x => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
// Earlier takes kept beside this one (their own renders in subfolders), so they can be compared.
const TAKES = [['take4', 'Fourth take (deployed 15 November): before the drums were refined'],
  ['take3', 'Third take (deployed 15 November): the polish, before the familiar melody and the horn section'],
  ['take2', 'Second take (deployed 15 November): heroic and mysterious, before the polish'], ['take1', 'First take (rejected: "too happy or melancholic")']];
const earlier = [];
for (const [dir, label] of TAKES) {
  try { await access(path.join(output, dir, 'theme-loop.wav')); earlier.push([dir, label]); } catch { /* Not kept. */ }
}
await writeFile(path.join(output, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Last Worlds title theme</title>
<style>
:root{--bg:#081321;--panel:#0d1c2c;--line:#294052;--text:#dfebf4;--muted:#9eb4c8;--accent:#7fd3ff}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f3f6f9;--panel:#fff;--line:#c9d5df;--text:#10202e;--muted:#4b6072;--accent:#0b6aa0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:auto;padding:32px 16px}h1{margin:0 0 8px}h2{font-size:20px;margin:28px 0 8px}p,li{color:var(--muted)}
article{border:1px solid var(--line);background:var(--panel);padding:16px;margin-bottom:16px}audio{width:100%}
.sounds{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.sounds button{display:block;width:100%;text-align:left;padding:12px 14px;border:1px solid var(--line);background:var(--panel);color:var(--text);font:inherit;cursor:pointer}
.sounds button:hover{border-color:var(--accent)}.sounds small{display:block;color:var(--muted)}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}
</style><main><h1>“Last Worlds” — title theme and menu sounds</h1>
<p>Offline renders through the game's own mixer at the game's default volumes (music 75 %, effects 55 %). The fifth take, its drums refined (a tight kick, a snare with body and crack, ensemble taiko in a room, timpani rolls and cymbals on the arrivals, building across the form): D minor, 100 BPM, 32 bars (76.8 s) that loop. A familiar heroic melody in D natural minor on the call's dotted rhythm: the call 1-5-8 (A3, then D, A, D), the answer F, E, D, rising to the question on E, the call again, the climax F, G, A, and home on A, C, D. Over open fifths (D5 D5 B♭sus2 C5, D5 D5 B♭sus2 D5). The lead is a horn section of three players with horn resonances, in tune from the first moment, doubled by a string section an octave down.</p>
<h2>The theme</h2>
<article><p>As first heard: it fades in on the first tap in the menu (60 s).</p><audio controls preload="none" src="theme-60s.wav"></audio></article>
<article><p>The full loop, at full level (intro, hook, B section, hook again, turnaround; the end runs straight into the start).</p><audio controls preload="none" src="theme-loop.wav"></audio></article>
${earlier.length ? `<h2>Earlier takes</h2>${earlier.map(([dir, label]) => `<article><p>${label}. The full loop.</p><audio controls preload="none" src="${dir}/theme-loop.wav"></audio></article>`).join('')}` : ''}
<h2>Menu sounds</h2>
<section class="sounds">${UI.map(([sound, label]) => `<button type="button" data-src="${sound}.wav"><b>${sound}</b><small>${label}</small></button>`).join('')}</section>
<h2>Clicking through the menus</h2>
<article><p>Over the theme: open the campaign, browse missions, the hangar (a refusal, a purchase, an equip, a tier), back out, the settings (a volume slider dragged, a radio), back, and launch at 20 s: the theme fades over the warp under the launch whoosh, and Luna's music starts at the flash.</p><audio controls preload="none" src="demo.wav"></audio></article>
<h2>Levels</h2>
<table><tr><th>File</th><th>Peak</th><th>Loudest second (dBFS)</th><th>Clipped</th></tr>${Object.entries(metrics).map(([name, m]) => `<tr><td>${name}</td><td>${m.peak.toFixed(3)}</td><td>${db(m.loudest)}</td><td>${m.clipped}</td></tr>`).join('')}</table>
</main>
<script>
const shared = new Audio();
for (const button of document.querySelectorAll('[data-src]')) button.addEventListener('click', () => { shared.src = button.dataset.src; shared.play().catch(() => {}); });
document.addEventListener('play', event => { for (const p of document.querySelectorAll('audio')) if (p !== event.target) p.pause(); }, true);
</script></html>
`);
