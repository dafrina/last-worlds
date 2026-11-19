// Bakes the mission selector's globe textures (src/ui/planet-preview.ts bakePlanetTexture) into
// public/assets/previews/<planet>.jpg and their source hashes into public/assets/previews/manifest.json, which
// tests/ui/planet-previews.test.ts holds to the terrain. Run after a planet's terrain or palette changes:
//
//     node tools/dev/bake-planet-previews.mjs
//
// The bake runs in Node through Vite's module loader (its own cache directory, so a running dev server is untouched); the
// JPEG encoding in a headless Chromium (Playwright), the same encoder the browser decodes with.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'public', 'assets', 'previews');
const PLANETS = ['luna', 'khepri', 'nacre', 'vesper', 'amnion', 'corona', 'nahara', 'umbra'];

const server = await createServer({ root, configFile: false, cacheDir: join(root, 'node_modules', '.vite-previews'), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const { bakePlanetTexture, PLANET_TEXTURE_SIZE: size } = await server.ssrLoadModule('/src/ui/planet-preview.ts');
const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync(out, { recursive: true });
const manifest = {};
for (const planet of PLANETS) {
  const started = Date.now(), texture = bakePlanetTexture(planet);
  manifest[planet] = createHash('sha256').update(texture).digest('hex').slice(0, 16);
  const rgb = Array.from(texture);
  const jpeg = await page.evaluate(({ rgb, width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'), image = context.createImageData(width, height);
    for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) { image.data[i] = rgb[j]; image.data[i + 1] = rgb[j + 1]; image.data[i + 2] = rgb[j + 2]; image.data[i + 3] = 255; }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, { rgb, width: size.width, height: size.height });
  const bytes = Buffer.from(jpeg, 'base64');
  writeFileSync(join(out, `${planet}.jpg`), bytes);
  console.log(`${planet}: ${bytes.length} bytes, ${Date.now() - started} ms`);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
await browser.close();
await server.close();
