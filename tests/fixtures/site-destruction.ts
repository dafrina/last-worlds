import { createRun, stepRun } from '../../src/sim/game';
import { CAMPAIGN_SCROLL } from '../../src/content/balance';
import { destroySiteCore } from '../../src/sim/sites';
import { holdDirector, labClock } from '../../src/playground/lab';
import { placeSite } from '../../src/playground/sites-lab';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
import { STEP, VIEW, type InputFrame, type MissionId, type SiteId } from '../../src/shared/contracts';

/**
 * A strike site's destruction frame by frame (docs/33 § 6): the real renderer over a level's real map, one site on its side
 * route as the playground's Sites tab places it (its guard's fire held), its cores killed as the simulation kills them (the
 * kill explosion, the site's loot, gone from the enemies). Deterministic: `__SITE_QA__.advance(seconds)` steps the clock
 * and renders every other tick, so a capture at a given time after the kill always shows the same frame.
 *
 *   /tests/fixtures/site-destruction.html?mission=bastion&site=airfield&side=1&x=5&row=11&quality=high
 *
 * `mission` picks the world, `distance` the map position, `x` where the ship (and the camera following it) holds, `row` the
 * core's row (gameplay s). The world holds still (the Sites tab's "Hold the world still": only the clock and the effects
 * age) unless `advance` is asked to fly: then the simulation runs, the world scrolls and `steer` (-1, 0, 1) moves the ship
 * and the camera sideways. `body[data-ready]` once the site stands; `body[data-time]` the seconds since the kill.
 */
const q = new URLSearchParams(location.search);
const mission = (q.get('mission') ?? 'bastion') as MissionId, site = (q.get('site') ?? 'airfield') as SiteId, side = (Number(q.get('side') ?? 1) < 0 ? -1 : 1) as -1 | 1;
const state = createRun({ mode: 'campaign', mission, difficulty: 'standard', seed: Number(q.get('seed') ?? 8831), weapon: 'pulse', special: 'shockwave' });
state.enemies = []; state.projectiles = []; state.hazards = []; state.pickups = []; state.message = ''; state.messageUntil = 0;
state.time = labClock(mission, Number(q.get('distance') ?? 260)).time; state.distance = state.time * CAMPAIGN_SCROLL;
holdDirector(state);
const x = Number(q.get('x') ?? side * 5), limit = (VIEW.worldWidth - VIEW.width) / 2;
const hold = () => {
  state.player.x = Math.max(-11, Math.min(11, state.player.x)); state.player.lives = 3; state.player.invulnerableUntil = Infinity;
  for (const enemy of state.enemies) { enemy.nextAttack = Infinity; enemy.warning = 0; }
  holdDirector(state);
};
state.player.x = x; state.cameraX = Math.max(-limit, Math.min(limit, x - Math.sign(x) * 2.5)); hold();

const ui = createUi(document.querySelector<HTMLElement>('#app')!, { start() {}, pause() {}, resume() {}, quit() {}, setMuted() {}, setQuality(quality) { renderer.setQuality(quality); } });
const renderer = createRenderer(ui.canvas);
renderer.setQuality(q.get('quality') === 'low' ? 'low' : 'high');
new ResizeObserver(() => { const box = ui.canvas.getBoundingClientRect(); renderer.resize(box.width, box.height); }).observe(ui.canvas);
await renderer.prepare(state.planet);
// The first frame at tick 0 warms every program (the launch's hidden warm-up), the world's site finishes included.
renderer.render(state, 0);
placeSite(state, state.planet, site, side, Number(q.get('row') ?? 11));
for (const enemy of state.enemies) if (enemy.site) { enemy.hp = enemy.maxHp = 80; }
// Let the guards finish deploying out of the ground (the world held still).
const still = () => { state.time += STEP; state.tick++; state.effects = state.effects.filter(effect => (effect.ttl -= STEP) > 0); };
let killedAt: number | null = null;
const frame = () => { renderer.render(state, 0); ui.update(state); document.body.dataset.time = killedAt === null ? '' : (state.time - killedAt).toFixed(3); };
for (let i = 0; i < 90; i++) still();
frame();

const qa = {
  /** Every site core falls as damageEnemy kills it: its kill explosion, its site's loot, and it is gone. */
  kill() {
    for (const core of state.enemies.filter(enemy => enemy.site && enemy.hp > 0)) {
      core.hp = 0;
      state.effects.push({ id: state.nextId++, kind: 'explosion', x: core.x, s: core.s, ttl: .5, duration: .5 });
      destroySiteCore(state, core);
    }
    state.enemies = state.enemies.filter(enemy => !enemy.site || enemy.hp > 0);
    killedAt = state.time; frame();
  },
  /** Moves the clock on by `seconds`, rendering every other tick; `fly` runs the simulation (the world scrolls), `steer` the ship. */
  advance(seconds: number, fly = false, steer: -1 | 0 | 1 = 0) {
    const ticks = Math.round(seconds / STEP), input: InputFrame = { horizontal: steer, specialPressed: false, pausePressed: false };
    for (let i = 1; i <= ticks; i++) {
      if (fly) { stepRun(state, input); hold(); } else still();
      if (i % 2 === 0 || i === ticks) frame();
    }
  },
  quality(quality: 'high' | 'low') { renderer.setQuality(quality); frame(); },
  state: () => ({ time: state.time, distance: state.distance, cameraX: state.cameraX, killedAt, cores: state.enemies.filter(enemy => enemy.site).length }),
};
(window as unknown as { __SITE_QA__: typeof qa }).__SITE_QA__ = qa;
document.body.dataset.ready = '1';
