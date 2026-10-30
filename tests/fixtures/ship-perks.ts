import { createRenderer } from '../../src/render/scene';
import { createRun, stepRun } from '../../src/sim/game';
import { createInput } from '../../src/input/controls';
import { EMPTY_INPUT, STEP, type ShipId } from '../../src/shared/contracts';
import { SHIPS } from '../../src/content/equipment';
const surface = document.querySelector<HTMLElement>('#surface')!;
const renderer = createRenderer(document.querySelector('canvas')!);
renderer.setQuality('low');
const input = createInput(surface, document.querySelector<HTMLButtonElement>('#special')!);
let state = createRun({ mode: 'endless', seed: 41, heroShip: 'spectre' }), live = false;
async function reset(ship: ShipId) {
  state = createRun({ mode: 'endless', seed: 41, heroShip: ship });
  state.time = 10; state.tick = 600; state.nextEncounterAt = state.nextVolleyAt = Infinity;
  state.enemies.push({ id: state.nextId++, kind: 'dart', x: 2, s: 10, originX: 2, hp: 1000, maxHp: 1000, radius: .5, age: 0, nextAttack: Infinity, warning: 0, aimX: 2, groundHeight: 3 });
  input.clear(); await renderer.prepareHero?.(state.config);
  document.querySelector('#status')!.textContent = `${SHIPS[ship].perk} · ${SHIPS[ship].blurb}`;
  renderer.render(state, 0);
}
function shot(x: number) {
  state.projectiles.push({ id: state.nextId++, x: state.player.x + x, s: .1, previousX: state.player.x + x, previousS: .1, vx: 0, vs: -18, friendly: false, damage: 1, radius: .1, ttl: 4 });
}
function advance(frames: number) { for (let i = 0; i < frames; i++) stepRun(state, EMPTY_INPUT); renderer.render(state, 0); }
document.querySelector('#graze')!.addEventListener('click', () => { shot(.8); live = true; });
document.querySelector('#hit')!.addEventListener('click', () => { shot(0); live = true; });
document.querySelector('#play')!.addEventListener('click', () => { live = !live; });
document.querySelector('#ship')!.addEventListener('change', event => { live = false; void reset((event.target as HTMLSelectElement).value as ShipId); });
new ResizeObserver(() => { const rect = surface.getBoundingClientRect(); renderer.resize(rect.width, rect.height); }).observe(surface);
await renderer.prepare(state.planet); await reset('spectre');
Object.assign(window, { __PERK_QA__: { reset, shot, advance, get state() { return state; } } });
let before = performance.now(), lag = 0;
function frame(now: number) {
  const controls = input.sample();
  if (live || controls.horizontal || controls.dashPressed || controls.specialPressed) {
    lag += Math.min((now - before) / 1000, .1);
    let first = true;
    while (lag >= STEP) { stepRun(state, first ? controls : { ...controls, dashPressed: undefined, specialPressed: false }); first = false; lag -= STEP; }
  } else lag = 0;
  before = now; renderer.render(state, 0); requestAnimationFrame(frame);
}
document.body.dataset.ready = '1'; requestAnimationFrame(frame);
