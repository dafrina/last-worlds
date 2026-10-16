/** Development-only, frozen real-game scene for repeatable environment art reviews. */
import { createRun } from '../../src/sim/game';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
const q = new URLSearchParams(location.search);
const state = createRun({ mode: 'campaign', mission: 'deep-bloom', seed: Number(q.get('seed') ?? 8831) });
state.distance = Number(q.get('distance') ?? 100);
state.time = state.distance / 5;
state.tick = Math.round(state.time * 60);
state.cameraX = Number(q.get('x') ?? 0); state.player.x = state.cameraX;
state.message = ''; state.messageUntil = 0;
const ui = createUi(document.querySelector<HTMLElement>('#app')!, {
  start() {}, pause() {}, resume() {}, quit() {}, setMuted() {}, setQuality(quality) { renderer.setQuality(quality); },
});
const renderer = createRenderer(ui.canvas);
renderer.setQuality(q.get('quality') === 'low' ? 'low' : 'high');
const observer = new ResizeObserver(() => { const rect = ui.canvas.getBoundingClientRect(); renderer.resize(rect.width, rect.height); });
observer.observe(ui.canvas);
function frame() { renderer.render(state, 0); ui.update(state); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
