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
if (query.get('phase') === 'departure') {
  for (const part of ['left','right','core'] as const) bossTarget(state,part)!.hp = 0;
  resolveBossPhase(state); step(Number(query.get('t') ?? 0));
}
const ui = createUi(document.querySelector<HTMLElement>('#app')!, {
  start() {}, pause() {}, resume() {}, quit() {}, setMuted() {}, setQuality(q) { renderer.setQuality(q); },
});
const renderer = createRenderer(ui.canvas);
renderer.setQuality(query.get('quality') === 'low' ? 'low' : 'high');
const observer = new ResizeObserver(() => { const rect=ui.canvas.getBoundingClientRect(); renderer.resize(rect.width,rect.height); });
observer.observe(ui.canvas);
let frames=0;
function frame() {
  renderer.render(state,0); ui.update(state);
  ui.canvas.dataset.encounterState=JSON.stringify({ sector:state.sector,planet:state.planet,boss:state.boss?.id,phase:state.boss?.phase,
    distance:state.distance,switchDistance:plan.jump!.switchDistance,jump:!!state.jump,frames:++frames });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
