/** Development-only fixture: real model loaders, game lighting and authoritative teleport timing. */
import { createRun, stepRun } from '../../src/sim/game';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
import { EMPTY_INPUT, STEP, type Enemy } from '../../src/shared/contracts';
const q = new URLSearchParams(location.search), amnion = q.get('planet') === 'amnion';
const state = createRun({ mode: 'campaign', mission: amnion ? 'brood-strike' : 'final-horizon', seed: 8831 });
state.nextEncounterAt = state.nextVolleyAt = Infinity; state.distance = 160;
state.message = ''; state.messageUntil = 0;
const enemy: Enemy = { id: state.nextId++, kind: amnion ? 'diamond' : 'wraith', x: 0, s: 12, originX: 0,
  hp: 1000, maxHp: 1000, radius: .58, age: 0, nextAttack: Infinity, warning: 0, aimX: 0, groundHeight: 3 };
state.enemies.push(enemy);
if (!amnion && q.has('hunter')) enemy.hunter = { key: 5, shield: 120, perCharge: 40, vx: 0, vs: 0, tx: 0, ts: 12, retarget: 100, waypoint: 0 };
const ui = createUi(document.querySelector<HTMLElement>('#app')!, { start() {}, pause() {}, resume() {}, quit() {}, setMuted() {}, setQuality(quality) { renderer.setQuality(quality); } });
const renderer = createRenderer(ui.canvas);
renderer.setQuality(q.get('quality') === 'low' ? 'low' : 'high');
new ResizeObserver(() => { const r = ui.canvas.getBoundingClientRect(); renderer.resize(r.width, r.height); }).observe(ui.canvas);
await renderer.prepare(state.planet);
Object.assign(window, { __PREDATOR_QA__: {
  advance(seconds: number) { for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(state, EMPTY_INPUT); },
  snapshot: () => ({ enemy: structuredClone(enemy), time: state.time, projectiles: state.projectiles.length }),
} });
const controls = document.createElement('div');
controls.style.cssText = 'position:fixed;z-index:30;left:50%;top:80px;transform:translateX(-50%);display:flex;gap:8px';
let running = q.has('live'), previous = performance.now(), accumulator = 0;
const toggle = document.createElement('button'); toggle.textContent = running ? 'Pause preview' : 'Run attack';
toggle.onclick = () => { running = !running; toggle.textContent = running ? 'Pause preview' : 'Run attack'; };
const replay = document.createElement('button'); replay.textContent = 'Replay'; replay.onclick = () => location.reload();
controls.append(toggle, replay); document.body.append(controls);
function frame(now: number) {
  const dt = Math.min(.1, (now - previous) / 1000); previous = now;
  if (running && state.phase === 'playing') {
    accumulator += dt;
    while (accumulator >= STEP) { stepRun(state, EMPTY_INPUT); accumulator -= STEP; }
  }
  state.tick += 60; renderer.render(state, 0); ui.update(state); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
