import { createRun } from '../../src/sim/game';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
import { ENEMIES } from '../../src/content/balance';
import type { EnemyKind, MissionId } from '../../src/shared/contracts';
const q = new URLSearchParams(location.search);
const state = createRun({ mode: 'campaign', mission: (q.get('mission') ?? 'final-horizon') as MissionId, seed: 8833 });
state.distance = 350; state.time = 10; state.tick = 600; state.enemies = []; state.hazards = [];
const ui = createUi(document.querySelector<HTMLElement>('#app')!, { start() {}, pause() {}, resume() {}, quit() {}, setMuted() {}, setQuality(quality) { renderer.setQuality(quality); } });
const renderer = createRenderer(ui.canvas);
renderer.setQuality(q.get('quality') === 'low' ? 'low' : 'high');
new ResizeObserver(() => { const box = ui.canvas.getBoundingClientRect(); renderer.resize(box.width, box.height); }).observe(ui.canvas);
await renderer.prepare(state.planet);
const setup = (mode: string) => {
  renderer.launchWarp(mode === 'warp' ? 'cruise' : 'off');
  state.hazards = []; state.enemies = [];
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
  ship(x: number) { state.player.x = x; } } });
setup(q.get('stage') ?? 'beams');
function frame() { renderer.render(state, 0); ui.update(state); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
