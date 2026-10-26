/**
 * Development-only, frozen real-game scene for terrain relief reviews (docs/26): any planet at any seed and distance.
 * Query: world (khepri | vesper | luna | nacre; picks the campaign mission flown over it, with its arena; not `planet`,
 * which is the renderer's own preview switch and would pin every later view to one planet), seed,
 * distance, x (camera), quality=low, battery=<world x>,<world s> (one ground battery seated there), fly=<from>,<to>,<units
 * per second> (streams the terrain through that stretch in wall-clock time, then sets body[data-done]).
 * `window.reliefView({ planet, seed, distance, x, battery })` re-frames the scene without reloading (kits stay loaded),
 * and sets body[data-view] to a counter once the new frame is up. Nothing here touches the simulation's rules.
 */
import { createRun } from '../../src/sim/game';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
import { spawnMembers } from '../../src/sim/spawn';
import { anchorGround } from '../../src/sim/ground';
import type { MissionId, RunState } from '../../src/shared/contracts';

const q = new URLSearchParams(location.search);
const MISSION: Readonly<Record<string, MissionId>> = { khepri: 'bastion', vesper: 'cold-vector', luna: 'training', nacre: 'deep-bloom', amnion: 'brood-strike', umbra: 'final-horizon' };
interface View { planet?: string; seed?: number; distance?: number; x?: number; battery?: string | null }
function make(view: View): RunState {
  const state = createRun({ mode: 'campaign', mission: MISSION[view.planet ?? 'khepri'] ?? 'bastion', seed: view.seed ?? 93 });
  state.distance = view.distance ?? 200;
  state.time = state.distance / 5;
  state.tick = Math.round(state.time * 60);
  state.cameraX = view.x ?? 0; state.player.x = state.cameraX;
  state.message = ''; state.messageUntil = 0;
  state.enemies = [];
  const battery = view.battery?.split(',').map(Number);
  if (battery) {
    spawnMembers(state, 'battery-3', battery[0], 1, battery[1] - state.distance);
    state.enemies = state.enemies.slice(-1);
    state.enemies[0].x = battery[0]; state.enemies[0].s = battery[1] - state.distance;
    // Re-anchor the battery on the terrain at its new spot (ground enemies stand at a lens anchor, src/sim/ground.ts).
    state.enemies[0].ground = undefined; anchorGround(state, state.enemies[0]);
  }
  return state;
}
const fly = q.get('fly')?.split(',').map(Number);
let state = make({ planet: q.get('world') ?? 'khepri', seed: Number(q.get('seed') ?? 93), distance: fly ? fly[0] : Number(q.get('distance') ?? 200),
  x: Number(q.get('x') ?? 0), battery: q.get('battery') });
let views = 0, settle = 0;
(window as unknown as { reliefView(view: View): void }).reliefView = view => { state = make(view); settle = 3; };
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
  if (warmup > 0) warmup--; else state.tick += 1;
  if (fly && !warmup && state.distance < fly[1]) {
    state.distance = Math.min(fly[1], state.distance + fly[2] * dt); state.time = state.distance / 5;
    if (state.distance >= fly[1]) document.body.dataset.done = '1';
  }
  renderer.render(state, 0); ui.update(state);
  if (settle > 0 && --settle === 0) document.body.dataset.view = String(++views);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
