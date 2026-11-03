/** Development-only fixture: real simulation, flight UI and renderer, deterministic stepping. */
import { createRun, hitPlayer, stepRun } from '../../src/sim/game';
import { EMPTY_INPUT } from '../../src/shared/contracts';
import { createUi } from '../../src/ui/game-ui';
import { createRenderer } from '../../src/render/scene';

const state = createRun({ mode: 'endless', seed: 17 });
state.player.power = 4; state.player.shields = 0; state.player.invulnerableUntil = 0;
state.nextEncounterAt = Infinity;
state.enemies.push({ id: state.nextId++, kind: 'turret', x: 0, s: 16, originX: 0, hp: 1e9, maxHp: 1e9,
  radius: 2, age: 0, nextAttack: Infinity, warning: 0, aimX: 0, groundHeight: 0 });
const ui = createUi(document.querySelector<HTMLElement>('#app')!, {
  start() {}, pause() { state.phase = 'paused'; }, resume() { state.phase = 'playing'; },
  quit() {}, setMuted() {}, setQuality(quality) { renderer.setQuality(quality); },
});
const renderer = createRenderer(ui.canvas);
new ResizeObserver(() => { const rect = ui.canvas.getBoundingClientRect(); renderer.resize(rect.width, rect.height); }).observe(ui.canvas);
function advance(frames: number) {
  for (let i = 0; i < frames; i++) { state.enemies[0].s = 16; stepRun(state, EMPTY_INPUT); }
}
Object.assign(window, { weaponRecovery: {
  hit() { hitPlayer(state, 1); },
  pickup() {
    state.pickups.push({ id: state.nextId++, kind: 'power', x: state.player.x, s: .1, value: 1, ttl: 5 });
    advance(1);
  },
  advance,
  snapshot() { return structuredClone(state); },
} });
advance(5);
function frame() { renderer.render(state, 0); ui.update(state); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
