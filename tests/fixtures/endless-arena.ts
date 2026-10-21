/** Development-only, deterministic boss/jump fixture using the real endless schedule and renderer. */
import { BOSSES } from '../../src/content/bosses';
import { ENDLESS_CYCLE, endlessScroll, endlessSectorPlan, sectorPace } from '../../src/content/endless';
import { createRun, stepRun } from '../../src/sim/game';
import { bossTarget, resolveBossPhase, startBoss } from '../../src/sim/bastion';
import { EMPTY_INPUT } from '../../src/shared/contracts';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';

const query = new URLSearchParams(location.search), sector = Number(query.get('sector') ?? 1);
const plan = endlessSectorPlan(sector);
if (!plan.boss) throw new Error('This fixture needs an endless boss sector.');
const state = createRun({ mode: 'endless', seed: Number(query.get('seed') ?? 8831) });
state.sector = sector; state.planet = plan.planet; state.pace = sectorPace(sector);
state.time = ENDLESS_CYCLE.bossSector.arrivesAt;
const scroll = endlessScroll(plan, state.time, null);
state.distance = scroll.distance; state.scrollSpeed = scroll.speed;
state.cameraX = state.player.x = Number(query.get('x') ?? 0);
state.nextEncounterAt = state.nextVolleyAt = Infinity;
state.player.invulnerableUntil = Infinity;
startBoss(state, BOSSES[plan.boss]);
const step = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) stepRun(state, EMPTY_INPUT); };
step(BOSSES[plan.boss].arrivalDuration + 1 / 60);
if (['core','overload'].includes(query.get('phase') ?? '')) {
  bossTarget(state,'left')!.hp = bossTarget(state,'right')!.hp = 0;
  resolveBossPhase(state);
  if (query.get('phase') === 'overload') { bossTarget(state,'core')!.hp *= .39; resolveBossPhase(state); }
}
// Advance the real finite deployment schedule before freezing a launch inspection.
if (query.has('launch')) {
  // The launch director correctly defers waves during respawn protection.
  state.player.invulnerableUntil = 0;
  step(Number(query.get('launch')));
  state.player.invulnerableUntil = Infinity;
}
if (query.get('phase') === 'departure') {
  for (const part of ['left','right','core'] as const) bossTarget(state,part)!.hp = 0;
  resolveBossPhase(state); step(Number(query.get('t') ?? 0));
}
const ui = createUi(document.querySelector<HTMLElement>('#app')!, {
  start() {}, pause() {}, resume() {}, quit() {}, setMuted() {}, setQuality(q) { renderer.setQuality(q); },
});
const renderer = createRenderer(ui.canvas);
// Render-only controls for the tread regression: keep the encounter/targets fixed.
if (query.has('tracks')) {
  state.scrollSpeed = 2; state.boss!.vs = 0;
  Object.assign(window, { __TRACK_QA__: {
    stop() { state.scrollSpeed = 0; state.boss!.vs = 0; },
    destroy() {
      state.scrollSpeed = 2;
      for (const part of ['left','right','core'] as const) bossTarget(state, part)!.hp = 0;
      resolveBossPhase(state);
    },
  } });
}
renderer.setQuality(query.get('quality') === 'low' ? 'low' : 'high');
const observer = new ResizeObserver(() => { const rect=ui.canvas.getBoundingClientRect(); renderer.resize(rect.width,rect.height); });
observer.observe(ui.canvas);
let frames=0;
function frame() {
  if (query.has('inspect')) state.tick += 60;
  // Pose inspection advances only presentation time, keeping the chosen battle phase in place.
  if (query.has('pose')) state.time += 1 / 60;
  renderer.render(state,0); ui.update(state);
  ui.canvas.dataset.encounterState=JSON.stringify({ sector:state.sector,planet:state.planet,boss:state.boss?.id,phase:state.boss?.phase,
    distance:state.distance,switchDistance:plan.jump!.switchDistance,jump:!!state.jump,frames:++frames });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
