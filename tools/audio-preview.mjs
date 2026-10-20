// npm run dev must be running. No external audio tools/assets required.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve(process.argv[2] ?? 'lookdev/audio');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  // The other art session may trigger Vite reloads while a long offline render is underway.
  await page.route('**/@vite/client', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto(`${process.env.AUDIO_PREVIEW_URL ?? 'http://127.0.0.1:4173'}/tests/fixtures/audio-lab.html`);
  await page.waitForFunction(() => window.__AUDIO_LAB__);
  const metrics = {};
  for (const theme of ['luna', 'khepri', 'nacre', 'vesper', 'effects', 'combat']) {
    const result = await page.evaluate(async theme =>
      window.__AUDIO_LAB__.renderPreview(theme === 'combat' ? 'nacre' : theme, theme === 'effects' ? 37 : 28, theme === 'combat'), theme);
    await writeFile(path.join(output, `${theme}.wav`), Buffer.from(result.wav, 'base64'));
    metrics[theme] = result.metrics;
    console.log(theme, JSON.stringify(result.metrics));
  }
  await writeFile(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  const tracks = [
    ['luna', 'LUNA', 'Far Side Signal', 'Warm piano, rounded bass and brushed rhythm · 94 BPM'],
    ['khepri', 'KHEPRI', 'Foundry Afterimage', 'Gritty saw synths and heavy bass · 118 BPM'],
    ['nacre', 'NACRE', 'Dreams Beneath the Bloom', 'Soft drifting pads and a gentle pulse · 106 BPM'],
    ['vesper', 'VESPER', 'Below the Ice Line', 'Glacial bells and space between the beats · 88 BPM'],
    ['effects', 'COMBAT SOUNDS', 'Weapons, impacts & explosions', 'Lasers, shields, specials, bosses and warp'],
    ['combat', 'IN THE MIX', 'Nacre under fire', 'Music with repeated volleys, explosions and a shield break'],
  ];
  await writeFile(path.join(output, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Last Worlds · Sound room</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#081321;color:#dfebf4;font:16px/1.5 system-ui,sans-serif}
main{max-width:940px;margin:auto;padding:48px 24px}header{margin-bottom:32px}h1{font-size:clamp(32px,6vw,54px);letter-spacing:-2px;margin:4px 0 8px}
.eyebrow{color:#8bb6d2;font:11px monospace;letter-spacing:3px}header p{color:#9eb4c8;max-width:620px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}
article{border:1px solid #294052;background:#0d1c2c;padding:24px}h2{font-size:20px;margin:10px 0}
article p{color:#9eb4c8;font-size:13px;min-height:40px}audio{width:100%;height:40px;color-scheme:dark}
footer{color:#819bad;font-size:12px;margin-top:28px}
</style><main><header><span class="eyebrow">LAST WORLDS / AUDIO</span><h1>Sound room</h1>
<p>Four original planet scores and the new combat sounds. These excerpts use the game's actual audio mixer. Play one at a time to hear the intended balance.</p></header>
<section class="grid">${tracks.map(([id, planet, title, detail]) => `<article><span class="eyebrow">${planet}</span><h2>${title}</h2><p>${detail}</p><audio controls preload="none" aria-label="${title}" src="${id}.wav"></audio></article>`).join('')}</section>
<footer>In the game, change Music and Effects in Settings. Music gains intensity during boss fights. Original synthesis and arrangements; no downloaded loops.</footer></main>
<script>document.addEventListener('play', event => { for (const player of document.querySelectorAll('audio')) if (player !== event.target) player.pause(); }, true);</script></html>`);
} finally { await browser.close(); }
