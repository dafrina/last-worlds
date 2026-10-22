/**
 * Light playground (playground.html; user, 22 October: "a playground where I can play on static versions of the levels
 * with fog and light ... so I can give you the settings I like best for each"). The real renderer, terrain, infrastructure
 * and kits of each campaign level, frozen: no enemies, no combat, no simulation steps. A panel tunes each level's look
 * live (lights, grade, bloom, fog); settings persist in the browser, the dev server also writes them to
 * lookdev/playground-looks.json, and "Copy settings" puts them on the clipboard. Presentation only.
 */
import { createRun } from '../sim/game';
import { createRenderer, type PlanetLook } from '../render/scene';
import type { GraphicsQuality, PlanetId, RunConfig, RunState } from '../shared/contracts';
import { VIEW } from '../shared/contracts';
import './playground.css';

type Mission = NonNullable<RunConfig['mission']>;
const LEVELS: readonly { mission: Mission; name: string; planet: PlanetId }[] = [
  { mission: 'training', name: 'Training · Luna', planet: 'luna' },
  { mission: 'bastion', name: 'Rolling Thunder · Khepri', planet: 'khepri' },
  { mission: 'cold-vector', name: 'Cold Vector · Vesper', planet: 'vesper' },
  { mission: 'deep-bloom', name: 'Deep Bloom · Nacre', planet: 'nacre' },
];
const STORE = 'last-worlds.playground.looks', VIEW_STORE = 'last-worlds.playground.view';

/** One panel control: a path into the look, its kind and range. */
type Control = { path: string; label: string } & ({ kind: 'color' } | { kind: 'range'; min: number; max: number; step: number });
const range = (path: string, label: string, min: number, max: number, step: number): Control => ({ path, label, kind: 'range', min, max, step });
const color = (path: string, label: string): Control => ({ path, label, kind: 'color' });
const GROUPS: readonly { title: string; controls: readonly Control[] }[] = [
  { title: 'Sun and sky', controls: [
    range('sunElevation', 'Sun elevation (°)', 10, 85, 1), color('sun.0', 'Sun colour'), range('sun.1', 'Sun intensity', 0, 8, .05),
    color('hemisphere.0', 'Sky fill colour'), color('hemisphere.1', 'Ground fill colour'), range('hemisphere.2', 'Sky fill intensity', 0, 3, .01),
    color('bounce.0', 'Bounce colour'), range('bounce.1', 'Bounce intensity', 0, 3, .01),
    range('shadowIntensity', 'Shadow strength', 0, 1, .01), color('blobShadow', 'Low-tier shadow colour'), color('background', 'Background'),
  ] },
  { title: 'Fog', controls: [
    color('post.fog.color', 'Fog colour'), range('post.fog.energy', 'Fog brightness', 0, 2, .01),
    range('post.fog.height.0', 'Fog top (clear above)', -10, 4, .05), range('post.fog.height.1', 'Fog full at', -10, 4, .05),
    range('post.fog.height.2', 'Low fog amount', 0, 1, .01),
    range('post.fog.distance.0', 'Haze start distance', 20, 90, .5), range('post.fog.distance.1', 'Haze density', 0, .2, .001),
    range('post.fog.distance.2', 'Haze amount (in the low layer)', 0, 1, .01),
    range('post.haze.3', 'Top-of-screen haze', 0, .3, .005),
  ] },
  { title: 'Exposure and bloom (High)', controls: [
    range('post.exposure', 'Exposure', .4, 2.2, .01), range('post.threshold', 'Bloom threshold', .3, 3, .01), range('post.knee', 'Bloom knee', 0, 1, .01),
    range('post.strength', 'Bloom strength', 0, 2, .01), range('lowExposure', 'Exposure (Low tier)', .4, 2.2, .01),
  ] },
  { title: 'Grade', controls: [
    range('post.saturation', 'Saturation', 0, 1.6, .01), range('post.contrast', 'Contrast', .7, 1.5, .01), range('post.vignette', 'Vignette', 0, .6, .01),
    range('post.lift.0', 'Shadow lift red', 0, .03, .0005), range('post.lift.1', 'Shadow lift green', 0, .03, .0005), range('post.lift.2', 'Shadow lift blue', 0, .03, .0005),
  ] },
];

const get = (look: PlanetLook, path: string): number => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], look) as number;
function set(look: PlanetLook, path: string, value: number) {
  const keys = path.split('.'), last = keys.pop()!;
  const parent = keys.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], look) as Record<string, number>;
  parent[last] = value;
}
const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
const load = <T>(key: string): T | null => { try { const text = localStorage.getItem(key); return text ? JSON.parse(text) as T : null; } catch { return null; } };
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep going */ } };

const root = document.getElementById('playground')!;
root.innerHTML = `
  <div class="pg-stage"><canvas class="pg-canvas"></canvas><div class="pg-hud"></div></div>
  <button class="pg-toggle" type="button">Settings</button>
  <aside class="pg-panel">
    <header><strong>Light playground</strong><span class="pg-sync"></span></header>
    <section class="pg-scene"></section>
    <div class="pg-groups"></div>
    <footer>
      <button type="button" data-act="copy">Copy settings</button>
      <button type="button" data-act="reset">Reset this level</button>
      <button type="button" data-act="reset-all">Reset all</button>
    </footer>
  </aside>`;
const canvas = root.querySelector<HTMLCanvasElement>('.pg-canvas')!, stage = root.querySelector<HTMLElement>('.pg-stage')!;
const hud = root.querySelector<HTMLElement>('.pg-hud')!, panel = root.querySelector<HTMLElement>('.pg-panel')!, sync = root.querySelector<HTMLElement>('.pg-sync')!;
root.querySelector('.pg-toggle')!.addEventListener('click', () => panel.classList.toggle('is-open'));

const renderer = createRenderer(canvas);
const defaults = Object.fromEntries(LEVELS.map(level => [level.planet, renderer.lookOf!(level.planet) as PlanetLook])) as Record<PlanetId, PlanetLook>;
/** The tuned looks (only levels that differ from their shipped look are saved). */
const looks = Object.fromEntries(LEVELS.map(level => [level.planet, structuredClone(defaults[level.planet])])) as Record<PlanetId, PlanetLook>;

interface ViewSettings { mission: Mission; distance: number; x: number; fly: boolean; speed: number; quality: GraphicsQuality; ship: boolean; seed: number }
const view: ViewSettings = { mission: 'bastion', distance: 120, x: 0, fly: false, speed: 5, quality: 'high', ship: true, seed: 8831, ...load<Partial<ViewSettings>>(VIEW_STORE) };
const level = () => LEVELS.find(entry => entry.mission === view.mission) ?? LEVELS[1];

let state: RunState = makeState();
function makeState(): RunState {
  const run = createRun({ mode: 'campaign', mission: view.mission, difficulty: 'standard', seed: view.seed });
  run.enemies = []; run.projectiles = []; run.hazards = []; run.pickups = []; run.nextEncounterAt = Infinity; run.nextVolleyAt = Infinity;
  run.player.invulnerableUntil = -1; run.message = ''; run.messageUntil = 0;
  return run;
}

// ── Saving: the browser, the dev server's file (lookdev/playground-looks.json) and the clipboard. ──
function exported() {
  const changed: Record<string, { look: PlanetLook; changes: Record<string, [number, number]> }> = {};
  for (const { planet, name } of LEVELS) {
    const changes: Record<string, [number, number]> = {};
    for (const group of GROUPS) for (const control of group.controls) {
      const was = get(defaults[planet], control.path), now = get(looks[planet], control.path);
      if (Math.abs(was - now) > 1e-9) changes[control.path] = [was, now];
    }
    if (Object.keys(changes).length) changed[planet] = { look: looks[planet], changes };
    void name;
  }
  return { version: 1, savedAt: new Date().toISOString(), levels: changed };
}
let saveTimer = 0;
function persist() {
  const data = exported();
  save(STORE, data);
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    try {
      const response = await fetch('./__playground/looks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data, null, 2) });
      sync.textContent = response.ok ? 'saved to lookdev/playground-looks.json' : 'saved in this browser';
    } catch { sync.textContent = 'saved in this browser'; }
  }, 400);
}
function restore(data: ReturnType<typeof exported> | null) {
  if (!data?.levels) return;
  for (const [planet, entry] of Object.entries(data.levels)) if (planet in looks) looks[planet as PlanetId] = { ...structuredClone(defaults[planet as PlanetId]), ...structuredClone(entry.look) };
}

// ── Panel ──
const scene = root.querySelector<HTMLElement>('.pg-scene')!;
scene.innerHTML = `
  <label>Level <select data-view="mission">${LEVELS.map(entry => `<option value="${entry.mission}">${entry.name}</option>`).join('')}</select></label>
  <label>Position along the level <input data-view="distance" type="range" min="0" max="1600" step="1"><output></output></label>
  <label>Ship x <input data-view="x" type="range" min="-11" max="11" step=".1"><output></output></label>
  <label class="pg-row"><input data-view="fly" type="checkbox"> Fly forward</label>
  <label>Flight speed <input data-view="speed" type="range" min="1" max="30" step="1"><output></output></label>
  <label>Quality <select data-view="quality"><option value="high">High</option><option value="low">Low</option></select></label>
  <label class="pg-row"><input data-view="ship" type="checkbox"> Show the ship</label>
  <label>Terrain seed <input data-view="seed" type="number" min="1" step="1"></label>
  <div class="pg-row"><button type="button" data-act="boom">Explosion</button><button type="button" data-act="blast">Fuel blast</button></div>`;
const groups = root.querySelector<HTMLElement>('.pg-groups')!;
function buildControls() {
  const look = looks[level().planet];
  groups.innerHTML = GROUPS.map(group => `<details open><summary>${group.title}</summary>${group.controls.map(control => {
    const value = get(look, control.path), changed = Math.abs(value - get(defaults[level().planet], control.path)) > 1e-9 ? ' is-changed' : '';
    return control.kind === 'color'
      ? `<label class="pg-color${changed}">${control.label} <input data-path="${control.path}" type="color" value="${hex(value)}"></label>`
      : `<label class="${changed}">${control.label} <input data-path="${control.path}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}"><output>${value}</output></label>`;
  }).join('')}</details>`).join('');
}
groups.addEventListener('input', event => {
  const input = event.target as HTMLInputElement, path = input.dataset.path;
  if (!path) return;
  const look = looks[level().planet], value = input.type === 'color' ? parseInt(input.value.slice(1), 16) : Number(input.value);
  set(look, path, value);
  const output = input.parentElement?.querySelector('output'); if (output) output.textContent = String(value);
  input.parentElement?.classList.toggle('is-changed', Math.abs(value - get(defaults[level().planet], path)) > 1e-9);
  renderer.tuneLook!(level().planet, look);
  persist();
});
function syncView() {
  for (const input of scene.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-view]')) {
    const key = input.dataset.view as keyof ViewSettings, value = view[key];
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = value as boolean; else input.value = String(value);
    const output = input.parentElement?.querySelector('output'); if (output) output.textContent = String(value);
  }
}
scene.addEventListener('input', event => {
  const input = event.target as HTMLInputElement, key = input.dataset.view as keyof ViewSettings | undefined;
  if (!key) return;
  const value = input.type === 'checkbox' ? input.checked : input.type === 'range' || input.type === 'number' ? Number(input.value) : input.value;
  const previous = { mission: view.mission, seed: view.seed, quality: view.quality };
  (view as unknown as Record<string, unknown>)[key] = value;
  const output = input.parentElement?.querySelector('output'); if (output) output.textContent = String(value);
  save(VIEW_STORE, view);
  if (view.quality !== previous.quality) renderer.setQuality(view.quality);
  if (view.mission !== previous.mission || view.seed !== previous.seed) void switchLevel();
});
root.addEventListener('click', async event => {
  const act = (event.target as HTMLElement).dataset?.act;
  if (!act) return;
  if (act === 'copy') {
    const text = JSON.stringify(exported(), null, 2);
    try { await navigator.clipboard.writeText(text); sync.textContent = 'settings copied'; }
    catch { const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); sync.textContent = 'settings copied'; }
  } else if (act === 'reset' || act === 'reset-all') {
    for (const { planet } of act === 'reset' ? [level()] : LEVELS) { looks[planet] = structuredClone(defaults[planet]); renderer.tuneLook!(planet, looks[planet]); }
    buildControls(); persist();
  } else if (act === 'boom' || act === 'blast') {
    // A presentation effect a few rows ahead of the ship; nothing is simulated.
    state.effects.push({ id: state.nextId++, kind: act === 'boom' ? 'explosion' : 'blast', x: state.player.x + (act === 'boom' ? -1.5 : 2), s: act === 'boom' ? 8 : 12, ttl: 1, duration: 1 });
  }
});

async function switchLevel() {
  state = makeState();
  hud.textContent = `Loading ${level().name}…`;
  await renderer.prepare(level().planet);
  renderer.tuneLook!(level().planet, looks[level().planet]);
  hud.textContent = '';
  buildControls();
}

function resize() {
  const rect = stage.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
}
new ResizeObserver(resize).observe(stage);

let last = performance.now(), frames = 0, fpsAt = last;
function frame(now: number) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (view.fly) { view.distance += view.speed * dt; if (view.distance > 1600) view.distance = 0; }
  state.time += dt; state.tick += 1;
  state.distance = view.distance; state.scrollSpeed = view.fly ? view.speed : 0;
  state.player.x = view.x; state.cameraX = Math.max(-(VIEW.worldWidth - VIEW.width) / 2, Math.min((VIEW.worldWidth - VIEW.width) / 2, view.x));
  state.player.lives = view.ship ? 3 : 0;
  renderer.render(state, 0);
  frames++;
  if (now - fpsAt > 1000) {
    const distance = scene.querySelector<HTMLInputElement>('[data-view="distance"]');
    if (view.fly && distance) { distance.value = String(Math.round(view.distance)); distance.parentElement!.querySelector('output')!.textContent = String(Math.round(view.distance)); }
    if (!hud.textContent?.startsWith('Loading')) hud.textContent = `${level().name} · ${Math.round(frames * 1000 / (now - fpsAt))} fps`;
    frames = 0; fpsAt = now;
  }
  requestAnimationFrame(frame);
}

// Settings from the dev server's file first (so a suggestion written there shows up on reload), else this browser.
const fromFile = await fetch('./__playground/looks').then(response => response.ok ? response.json() : null).catch(() => null) as ReturnType<typeof exported> | null;
restore(fromFile ?? load(STORE));
for (const { planet } of LEVELS) renderer.tuneLook!(planet, looks[planet]);
renderer.setQuality(view.quality);
syncView();
await switchLevel();
resize();
requestAnimationFrame(frame);
