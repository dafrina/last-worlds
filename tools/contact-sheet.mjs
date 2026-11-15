// Contact sheets and crops for look-dev reviews (no image library in the toolchain: Chromium lays the images out).
// Usage:
//   node tools/contact-sheet.mjs sheet <out.png> <columns> <title> <label=path>...   a labelled grid of images
//   node tools/contact-sheet.mjs crop <in.png> <out.png> <x> <y> <width> <height> [zoom=2]   a region, enlarged (pixelated)
import { readFileSync } from 'node:fs';
import { launchGameBrowser } from './browser.mjs';

const [mode, ...args] = process.argv.slice(2);
const dataUrl = path => `data:image/png;base64,${readFileSync(path).toString('base64')}`;
const browser = await launchGameBrowser();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  if (mode === 'crop') {
    const [input, out, x, y, width, height, zoomArg = '2'] = args, zoom = Number(zoomArg);
    await page.setViewportSize({ width: Number(width) * zoom, height: Number(height) * zoom });
    await page.setContent(`<body style="margin:0;overflow:hidden;background:#000"><div style="width:${width}px;height:${height}px;overflow:hidden;transform:scale(${zoom});transform-origin:0 0">
      <img src="${dataUrl(input)}" style="display:block;margin:${-y}px 0 0 ${-x}px;image-rendering:pixelated"></div></body>`);
    await page.waitForLoadState('load');
    await page.screenshot({ path: out });
  } else {
    const [out, columnsArg, title, ...items] = args, columns = Number(columnsArg);
    const cells = items.map(item => { const at = item.indexOf('='); return { label: item.slice(0, at), path: item.slice(at + 1) }; });
    await page.setViewportSize({ width: 300 * columns + 24, height: 800 });
    await page.setContent(`<body style="margin:0;padding:12px;background:#1b1916;color:#e8dcc8;font:14px/1.3 system-ui,sans-serif">
      <div style="font-size:18px;font-weight:600;margin:0 0 10px">${title}</div>
      <div style="display:grid;grid-template-columns:repeat(${columns},290px);gap:10px">
      ${cells.map(cell => `<figure style="margin:0"><img src="${dataUrl(cell.path)}" style="width:290px;display:block;border-radius:3px">
        <figcaption style="margin-top:4px;font-size:12px;color:#cdbfa8">${cell.label}</figcaption></figure>`).join('')}
      </div></body>`);
    await page.waitForLoadState('load');
    await page.screenshot({ path: out, fullPage: true });
  }
} finally { await browser.close(); }
