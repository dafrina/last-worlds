/**
 * Development-only, frozen real-game scene over Rolling Thunder's Khepri terrain for district reviews (docs/23).
 * Query: seed, distance, x (camera), quality=low, battery=<world x>,<world s> (one ground battery seated there),
 * fly=<from>,<to>,<units per second> (streams the terrain through that stretch in wall-clock time, then sets
 * body[data-done]; render stats carry the terrain work timings), legacy=1 (rollback switches on). Nothing here touches
 * the simulation's rules.
 */
import { createRun } from '../../src/sim/game';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
import { spawnMembers } from '../../src/sim/spawn';
import { anchorGround } from '../../src/sim/ground';
import { PLANETS, ROAD_ENDS } from '../../src/world/terrain';

const q = new URLSearchParams(location.search);
// legacy=1: the same build with both rollback switches set (no districts, square road ends: terrain version 10),
// for before/after captures of one view.
if (q.get('legacy') === '1') { PLANETS.khepri.districts = null; ROAD_ENDS.taper = 0; }
const state = createRun({ mode: 'campaign', mission: 'bastion', seed: Number(q.get('seed') ?? 11) });
const fly = q.get('fly')?.split(',').map(Number);
state.distance = fly ? fly[0] : Number(q.get('distance') ?? 520);
state.time = state.distance / 5;
state.tick = Math.round(state.time * 60);
state.cameraX = Number(q.get('x') ?? 0); state.player.x = state.cameraX;
state.message = ''; state.messageUntil = 0;
const battery = q.get('battery')?.split(',').map(Number);
if (battery) {
  spawnMembers(state, 'battery-3', battery[0], 1, battery[1] - state.distance);
  state.enemies = state.enemies.slice(1, 2);
  state.enemies[0].x = battery[0]; state.enemies[0].s = battery[1] - state.distance;
  // Re-anchor the battery on the terrain at its new spot (ground enemies stand at a lens anchor, src/sim/ground.ts).
  state.enemies[0].ground = undefined; anchorGround(state, state.enemies[0]);
}
const ui = createUi(document.querySelector<HTMLElement>('#app')!, {
  start() {}, pause() {}, resume() {}, quit() {}, setMuted() {}, setQuality(quality) { renderer.setQuality(quality); },
});
const renderer = createRenderer(ui.canvas);
renderer.setQuality(q.get('quality') === 'low' ? 'low' : 'high');
const observer = new ResizeObserver(() => { const rect = ui.canvas.getBoundingClientRect(); renderer.resize(rect.width, rect.height); });
observer.observe(ui.canvas);
let last = performance.now(), warmup = fly ? 90 : 0;
if (fly) state.tick = 0;
function frame() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  // A flight first settles its start-up sections with the tick at 0, so the terrain work timings count the flight only.
  if (warmup > 0) warmup--; else state.tick += 1;
  if (fly && !warmup && state.distance < fly[1]) {
    state.distance = Math.min(fly[1], state.distance + fly[2] * dt); state.time = state.distance / 5;
    if (state.distance >= fly[1]) document.body.dataset.done = '1';
  }
  renderer.render(state, 0); ui.update(state); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
