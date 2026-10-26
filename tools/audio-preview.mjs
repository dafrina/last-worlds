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
  for (const theme of ['luna', 'khepri', 'nacre', 'vesper', 'amnion', 'umbra', 'effects', 'combat']) {
    const result = await page.evaluate(async theme =>
      window.__AUDIO_LAB__.renderPreview(theme === 'combat' ? 'nacre' : theme, theme === 'effects' ? 37 : 28, theme === 'combat'), theme);
    await writeFile(path.join(output, `${theme}.wav`), Buffer.from(result.wav, 'base64'));
    metrics[theme] = result.metrics;
    console.log(theme, JSON.stringify({ peak: result.metrics.peak, rms: result.metrics.rms, clipped: result.metrics.clipped }));
  }
  for (const theme of ['luna', 'khepri', 'nacre', 'vesper', 'amnion', 'umbra']) {
    for (const version of ['boss', 'transition']) {
      const result = await page.evaluate(async ({ theme, version }) =>
        window.__AUDIO_LAB__.renderPreview(theme, 34, false, version), { theme, version });
      await writeFile(path.join(output, `${theme}-${version}.wav`), Buffer.from(result.wav, 'base64'));
      metrics[`${theme}-${version}`] = result.metrics;
      console.log(`${theme}-${version}`, JSON.stringify({ peak: result.metrics.peak, rms: result.metrics.rms, clipped: result.metrics.clipped }));
    }
  }
  await writeFile(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  const tracks = [
    ['luna', 'LUNA', 'Far Side Signal', 'Warm piano, rounded bass and brushed rhythm · 94 BPM'],
    ['khepri', 'KHEPRI', 'Foundry Afterimage', 'Gritty saw synths and heavy bass · 118 BPM'],
    ['nacre', 'NACRE', 'Dreams Beneath the Bloom', 'Soft drifting pads and a gentle pulse · 106 BPM'],
    ['vesper', 'VESPER', 'Below the Ice Line', 'Glacial bells and space between the beats · 88 BPM'],
    ['amnion', 'AMNION', 'Something Beneath the Skin', 'Breathing membranes, uneasy nerve tones and paired heartbeats · 92 BPM'],
    ['umbra', 'UMBRA', 'A Line Through Silence', 'Clean glass needles, distant air and a precise deep pulse · 90 BPM'],
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
label{display:block;color:#9eb4c8;font-size:12px;margin-bottom:12px}select{margin-left:8px;background:#14293c;color:#dfebf4;border:1px solid #38536b;padding:8px;font:inherit}
footer{color:#819bad;font-size:12px;margin-top:28px}
</style><main><header><span class="eyebrow">LAST WORLDS / AUDIO</span><h1>Sound room</h1>
<p>Six planet scores, each with its own voice. Amnion breathes; Umbra cuts through the silence. The transition previews begin in level mode, build into the boss fight, then return to the original music.</p></header>
<section class="grid">${tracks.map(([id, planet, title, detail]) => {
  const stem = !['effects', 'combat'].includes(id);
  const changes = stem ? metrics[`${id}-transition`].transitions : [];
  const timing = stem ? `<p>Transition preview: boss at ${changes[0].at.toFixed(1)}s · final phase at ${changes[1].at.toFixed(1)}s · fades back at ${changes[2].at.toFixed(1)}s.</p>` : '';
  return `<article><span class="eyebrow">${planet}</span><h2>${title}</h2><p>${detail}</p>
  ${stem ? `<label>Listen<select aria-label="${planet} version"><option value="${id}-transition.wav">Level → boss → level</option><option value="${id}.wav">Original level</option><option value="${id}-boss.wav">Boss version</option></select></label>` : ''}
  <audio controls preload="none" aria-label="${title}" src="${id}${stem ? '-transition' : ''}.wav"></audio>${timing}</article>`;
}).join('')}</section>
<footer>These excerpts use the game's actual mixer. In game, boss bass and rhythm fade over one bar; the original score continues on the same clock. Change Music and Effects in Settings.</footer></main>
<script>
document.addEventListener('play', event => { for (const player of document.querySelectorAll('audio')) if (player !== event.target) player.pause(); }, true);
document.addEventListener('change', event => { if (event.target.tagName !== 'SELECT') return; const player=event.target.closest('article').querySelector('audio'); const at=player.currentTime, playing=!player.paused; player.preload='metadata'; player.src=event.target.value; player.addEventListener('loadedmetadata',()=>{player.currentTime=Math.min(at,player.duration-.1);if(playing)player.play().catch(()=>{});},{once:true}); player.load(); });
</script></html>`);
} finally { await browser.close(); }
