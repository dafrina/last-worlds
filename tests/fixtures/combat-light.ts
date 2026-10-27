import { createRun, stepRun } from '../../src/sim/game';
import { attackNow, holdDirector, spawnFormation } from '../../src/playground/lab';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
import { ENEMIES } from '../../src/content/balance';
import type { EnemyKind, MissionId } from '../../src/shared/contracts';
import type { FormationId } from '../../src/content/formations';
const q = new URLSearchParams(location.search);
const state = createRun({ mode: 'campaign', mission: (q.get('mission') ?? 'final-horizon') as MissionId, seed: 8833 });
state.distance = 350; state.time = 10; state.tick = 600; state.enemies = []; state.hazards = [];
const ui = createUi(document.querySelector<HTMLElement>('#app')!, { start() {}, pause() {}, resume() {}, quit() {}, setMuted() {}, setQuality(quality) { renderer.setQuality(quality); } });
const renderer = createRenderer(ui.canvas);
renderer.setQuality(q.get('quality') === 'low' ? 'low' : 'high');
new ResizeObserver(() => { const box = ui.canvas.getBoundingClientRect(); renderer.resize(box.width, box.height); }).observe(ui.canvas);
await renderer.prepare(state.planet);
let live = false;
const setup = (mode: string) => {
  renderer.launchWarp(mode === 'warp' ? 'cruise' : 'off');
  state.hazards = []; state.enemies = []; live = false;
  // Ground batteries winding up and firing while the ship sweeps from side to side (the camera's parallax moves them across
  // the view): the real simulation, one tick per frame.
  if (mode === 'battery') {
    live = true; state.distance = Number(q.get('distance') ?? 220); state.projectiles = [];
    holdDirector(state);
    for (const formation of (q.get('spawn') ?? 'missile-3,battery-4').split(',')) spawnFormation(state, formation as FormationId);
  }
  if (mode === 'beams' || mode === 'charge') for (const [i, x] of [-3, 2].entries()) {
    state.enemies.push({ id: i + 1, kind: 'needle', x, s: 13, originX: x, hp: 100, maxHp: 100, radius: .3, age: 0, nextAttack: Infinity, warning: 0, aimX: x, groundHeight: 3 });
    state.hazards.push({ id: i + 10, x, width: i ? 2.4 : .4, warning: mode === 'charge' ? .3 : 0, active: 1, ttl: 10 });
  }
  // Aim rays of winding-up shooters, half charged: an aimed dart, a pulsar on the ship and a diamond's wing.
  if (mode === 'aim') for (const [i, [kind, x, s]] of ([['dart', -3, 12], ['pulsar', 3.2, 14], ['diamond', 0, 16.5]] as [EnemyKind, number, number][]).entries()) {
    const base = ENEMIES[kind];
    state.enemies.push({ id: i + 1, kind, x, s, originX: x, hp: base.hp, maxHp: base.hp, radius: base.radius, age: 0, nextAttack: Infinity, warning: base.warning * .5, aimX: x * -.3, groundHeight: 3 });
  }
  state.tick += 60;
};
Object.assign(window, { __LIGHT_QA__: { setup, move(distance: number, x: number) { state.distance = distance; state.cameraX = x; state.player.x = x; state.tick += 60; },
  ship(x: number) { state.player.x = x; }, get state() { return state; } } });
setup(q.get('stage') ?? 'beams');
const tick = () => {
  const sweep = Math.sin(state.time * 1.3);
  stepRun(state, { horizontal: Math.abs(sweep) < .2 ? 0 : sweep > 0 ? 1 : -1, specialPressed: false, pausePressed: false });
  holdDirector(state); state.player.lives = 3; state.player.shields = state.player.maxShields;
  if (state.enemies.every(enemy => enemy.warning <= 0) && state.tick % 90 === 0) attackNow(state);
};
// `from`: fast-forward unrendered to that tick (the renderer must still see a windup to draw its rounds from the battery);
// `until`: hold at that tick.
if (live) while (state.tick < Number(q.get('from') ?? 0)) tick();
function frame() {
  if (live && state.tick < Number(q.get('until') ?? Infinity)) tick();
  renderer.render(state, 0); ui.update(state); requestAnimationFrame(frame);
  if (live) document.body.dataset.tick = String(state.tick);
}
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
