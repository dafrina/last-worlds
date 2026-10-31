import { createRun, stepRun } from '../../src/sim/game';
import { attackNow, holdDirector, labClock, spawnFormation } from '../../src/playground/lab';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
import { EMPTY_INPUT, type MissionId, type WeaponId } from '../../src/shared/contracts';
import type { FormationId } from '../../src/content/formations';

/**
 * Weapon tiers side by side (docs/30, tiers 4 and 5 of 31 October): the hero's main weapon at one tier, firing at a
 * formation over a level's real map while the formation fires back. Deterministic: the same tick shows the same shots
 * however fast the machine draws, so captures of different tiers compare. The targets are toughened (presentation only)
 * so every tier is still firing at the capture tick.
 *
 *   /tests/fixtures/weapon-tiers.html?weapon=rail&rank=4&mission=bastion&quality=high&until=150
 *
 * `rank` 0-4 (tier 1-5); `spawn` formations (comma list); `attack` the tick the formation opens fire; `until` the tick it holds
 * at (rendered tick by tick from `from`, the earlier ticks unrendered). `body[data-tick]` reports the tick.
 */
const q = new URLSearchParams(location.search);
const mission = (q.get('mission') ?? 'bastion') as MissionId;
const state = createRun({ mode: 'campaign', mission, seed: 8831, weapon: (q.get('weapon') ?? 'pulse') as WeaponId, rank: Number(q.get('rank') ?? 2) });
state.enemies = []; state.projectiles = []; state.hazards = []; state.pickups = [];
state.time = labClock(mission, Number(q.get('distance') ?? 260)).time; state.message = ''; state.messageUntil = 0;
holdDirector(state);
const ui = createUi(document.querySelector<HTMLElement>('#app')!, { start() {}, pause() {}, resume() {}, quit() {}, setMuted() {}, setQuality(quality) { renderer.setQuality(quality); } });
const renderer = createRenderer(ui.canvas);
renderer.setQuality(q.get('quality') === 'low' ? 'low' : 'high');
new ResizeObserver(() => { const box = ui.canvas.getBoundingClientRect(); renderer.resize(box.width, box.height); }).observe(ui.canvas);
await renderer.prepare(state.planet);

const start = state.tick, attackAt = start + Number(q.get('attack') ?? 60), hp = Number(q.get('hp') ?? 4000);
for (const formation of (q.get('spawn') ?? 'line-weaver-4,arrow-5').split(',')) spawnFormation(state, formation as FormationId);
for (const enemy of state.enemies) { enemy.hp = hp; enemy.maxHp = hp; }
const tick = () => {
  // The lab's rules (playground Weapons tab): no playlist, the guns live, the ship holding its place and never lost.
  const volley = state.nextVolleyAt;
  holdDirector(state);
  state.nextVolleyAt = Number.isFinite(volley) ? volley : state.time;
  if (state.tick === attackAt) attackNow(state);
  stepRun(state, EMPTY_INPUT);
  state.player.x = 0; state.player.vx = 0; state.player.lives = 3; state.player.shields = state.player.maxShields;
};
const until = start + Number(q.get('until') ?? 150), from = start + Number(q.get('from') ?? 90);
while (state.tick < from) tick();
function frame() {
  if (state.tick < until) tick();
  renderer.render(state, 0); ui.update(state);
  document.body.dataset.tick = String(state.tick - start);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
