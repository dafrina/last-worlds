import type { PlanetId } from '../shared/contracts';
import { rowPoint, terrainRow } from '../world/terrain-ground';

/**
 * Mission-select planet preview: a slowly spinning globe painted from the level's own terrain (its landform and
 * palette, sampled once at a coarse scale), lit from the upper left like the flight. A plain 2D canvas, so the menu
 * never opens a second WebGL context on phones. Presentation only.
 */
const TEXTURE_W = 240, TEXTURE_H = 120, BLEND = 24, SPACING = 0.6, SEED = 93;
const SIZE = 200;
/** Atmosphere glow at the limb (CSS colour) per world; airless Luna gets only a faint grey edge. */
const ATMOSPHERE: Readonly<Record<PlanetId, string>> = { khepri: '232, 138, 80', vesper: '150, 205, 255', luna: '190, 190, 195', nacre: '170, 120, 255' };
const ATMOSPHERE_STRENGTH: Readonly<Record<PlanetId, number>> = { khepri: 0.55, vesper: 0.6, luna: 0.18, nacre: 0.7 };

type Texture = Uint8ClampedArray;
const textures = new Map<PlanetId, Texture>();
const pending = new Map<PlanetId, Generator<void, Texture, void>>();
/** Flat base tone (sRGB) shown while a world's texture is still baking. */
const PLACEHOLDER: Readonly<Record<PlanetId, readonly [number, number, number]>> = { khepri: [176, 92, 50], vesper: [205, 218, 230], luna: [150, 148, 144], nacre: [70, 50, 120] };

/** Advances a world's bake for about `budget` ms; true once its texture exists. */
function advance(planet: PlanetId, budget: number): boolean {
  if (textures.has(planet)) return true;
  let work = pending.get(planet);
  if (!work) { work = bake(planet); pending.set(planet, work); }
  const until = performance.now() + budget;
  let step = work.next();
  while (!step.done && performance.now() < until) step = work.next();
  if (step.done) { textures.set(planet, step.value); pending.delete(planet); return true; }
  return false;
}
/** Bakes every world in idle time (in small slices) so the mission selector opens with its globes ready. */
export function prebakePlanets(planets: readonly PlanetId[]): void {
  const queue = [...planets];
  const idle = (callback: () => void) => typeof requestIdleCallback === 'function' ? requestIdleCallback(callback, { timeout: 500 }) : setTimeout(callback, 50);
  const slice = () => {
    while (queue.length && advance(queue[0], 0)) queue.shift();
    if (!queue.length) return;
    advance(queue[0], 8);
    idle(slice);
  };
  idle(slice);
}

const srgb = (linear: number) => 255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055);

/** Bakes a planet's equirectangular texture in row steps (forward distance → longitude, lateral x → latitude). */
function* bake(planet: PlanetId): Generator<void, Texture, void> {
  const width = TEXTURE_W + BLEND, heights = new Float32Array(width * TEXTURE_H), colors = new Float32Array(width * TEXTURE_H * 3);
  const world = { planet }, out: [number, number, number] = [0, 0, 0];
  for (let u = 0; u < width; u++) {
    const s = 40 + u * SPACING, row = terrainRow(SEED, s, world);
    for (let v = 0; v < TEXTURE_H; v++) heights[v * width + u] = rowPoint(row, (v - TEXTURE_H / 2) * SPACING).height;
    yield;
  }
  for (let u = 0; u < width; u++) {
    const s = 40 + u * SPACING, row = terrainRow(SEED, s, world);
    for (let v = 0; v < TEXTURE_H; v++) {
      const at = (du: number, dv: number) => heights[Math.min(TEXTURE_H - 1, Math.max(0, v + dv)) * width + Math.min(width - 1, Math.max(0, u + du))];
      const gx = (at(0, 1) - at(0, -1)) / (2 * SPACING), gs = (at(1, 0) - at(-1, 0)) / (2 * SPACING), slope = Math.hypot(gx, gs);
      const point = rowPoint(row, (v - TEXTURE_H / 2) * SPACING);
      row.world.planet.color(row, (v - TEXTURE_H / 2) * SPACING, point, slope, 0, out);
      // Relief from the same upper-left sun as the flight: faces toward it brighten, away from it darken.
      const relief = Math.max(0.4, Math.min(1.45, 1 + (-gx * 0.7 + gs * 0.7) * 0.55));
      const i = (v * width + u) * 3;
      colors[i] = out[0] * relief; colors[i + 1] = out[1] * relief; colors[i + 2] = out[2] * relief;
    }
    yield;
  }
  // Wrap seamlessly: the first BLEND columns cross-fade from the overshoot (which continues the last column) back
  // into the texture's own start.
  const texture = new Uint8ClampedArray(TEXTURE_W * TEXTURE_H * 3);
  for (let v = 0; v < TEXTURE_H; v++) for (let u = 0; u < TEXTURE_W; u++) {
    const t = u < BLEND ? u / BLEND : 1, a = (v * width + u) * 3, b = (v * width + TEXTURE_W + Math.min(u, BLEND - 1)) * 3, o = (v * TEXTURE_W + u) * 3;
    for (let c = 0; c < 3; c++) texture[o + c] = srgb(colors[b + c] + (colors[a + c] - colors[b + c]) * t);
  }
  return texture;
}

/** Per-pixel sphere geometry, fixed for the canvas: latitude row, base longitude and light per covered pixel. */
const sphere = (() => {
  const pixels: number[] = [], rows: number[] = [], columns: number[] = [], light: number[] = [];
  const sun = [-0.55, 0.5, 0.67], length = Math.hypot(...sun);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const nx = (x + 0.5) / SIZE * 2 - 1, ny = 1 - (y + 0.5) / SIZE * 2, r2 = nx * nx + ny * ny;
    if (r2 >= 1) continue;
    const nz = Math.sqrt(1 - r2);
    pixels.push(y * SIZE + x);
    rows.push(Math.min(TEXTURE_H - 1.001, Math.max(0, (0.5 - Math.asin(ny) / Math.PI) * TEXTURE_H - 0.5)));
    columns.push((Math.atan2(nx, nz) / (2 * Math.PI) + 0.5) * TEXTURE_W);
    const lambert = Math.max(0, (nx * sun[0] + ny * sun[1] + nz * sun[2]) / length);
    light.push(0.16 + 0.95 * Math.pow(lambert, 0.85));
  }
  return { pixels, rows, columns, light };
})();

export interface PlanetPreview { show(planet: PlanetId): void; stop(): void }

export function createPlanetPreview(canvas: HTMLCanvasElement): PlanetPreview {
  canvas.width = SIZE; canvas.height = SIZE;
  const context = canvas.getContext('2d');
  const buffer = document.createElement('canvas'); buffer.width = buffer.height = SIZE;
  const bufferContext = buffer.getContext('2d');
  const image = bufferContext?.createImageData(SIZE, SIZE);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let planet: PlanetId = 'luna', frame = 0, started = 0;

  function draw(now: number) {
    frame = 0;
    if (!context || !bufferContext || !image) return;
    // Bake a slice each frame if needed (about 10 ms), so the menu stays responsive on phones.
    advance(planet, 10);
    const texture = textures.get(planet), base = PLACEHOLDER[planet];
    context.clearRect(0, 0, SIZE, SIZE);
    const data = image.data;
    data.fill(0);
    // One turn every 48 s; westward like a world seen from orbit.
    const turn = reduced ? 0.15 : ((now - started) / 48000) % 1, offset = turn * TEXTURE_W;
    const { pixels, rows, columns, light } = sphere;
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i] * 4, l = light[i];
      if (texture) {
        // Bilinear sampling, wrapping in longitude.
        const uf = columns[i] + offset, u0 = Math.floor(uf), fu = uf - u0, a = u0 % TEXTURE_W, b = (a + 1) % TEXTURE_W;
        const vf = rows[i], v0 = Math.floor(vf), fv = vf - v0, r0 = v0 * TEXTURE_W, r1 = Math.min(TEXTURE_H - 1, v0 + 1) * TEXTURE_W;
        for (let c = 0; c < 3; c++) {
          const top = texture[(r0 + a) * 3 + c] * (1 - fu) + texture[(r0 + b) * 3 + c] * fu;
          const bottom = texture[(r1 + a) * 3 + c] * (1 - fu) + texture[(r1 + b) * 3 + c] * fu;
          data[p + c] = (top + (bottom - top) * fv) * l;
        }
      } else {
        data[p] = base[0] * l; data[p + 1] = base[1] * l; data[p + 2] = base[2] * l;
      }
      data[p + 3] = 255;
    }
    bufferContext.putImageData(image, 0, 0);
    context.drawImage(buffer, 0, 0);
    // Atmosphere: a soft limb glow brightest on the sunlit side.
    const glow = context.createRadialGradient(SIZE * 0.47, SIZE * 0.47, SIZE * 0.36, SIZE / 2, SIZE / 2, SIZE / 2);
    glow.addColorStop(0, `rgba(${ATMOSPHERE[planet]}, 0)`);
    glow.addColorStop(0.82, `rgba(${ATMOSPHERE[planet]}, ${ATMOSPHERE_STRENGTH[planet] * 0.35})`);
    glow.addColorStop(1, `rgba(${ATMOSPHERE[planet]}, 0)`);
    context.fillStyle = glow; context.fillRect(0, 0, SIZE, SIZE);
    if (!canvas.closest('[hidden]') && !document.hidden) frame = requestAnimationFrame(draw);
  }

  return {
    show(next) {
      planet = next;
      if (!started) started = performance.now();
      if (!frame) frame = requestAnimationFrame(draw);
    },
    stop() { if (frame) cancelAnimationFrame(frame); frame = 0; },
  };
}
