/** Development-only visual fixture; this HTML is not a Vite production entry. */
import { createRun, stepRun } from '../../src/sim/game';
import { arenaScroll, startBastion, bossTarget, resolveBastionPhase } from '../../src/sim/bastion';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
import { createInput } from '../../src/input/controls';
import { STEP, EMPTY_INPUT, VIEW, type RunConfig } from '../../src/shared/contracts';
import { BASTION } from '../../src/content/bastion';
import { HELION_ARK } from '../../src/content/ark';

const query = new URLSearchParams(location.search);
// `boss=ark` previews Cold Vector's Helion Ark on Vesper's open-water arena; without it this is Rolling Thunder's Bastion-9.
const ark = query.get('boss') === 'ark';
let state = createRun({ mode: 'campaign', mission: ark ? 'cold-vector' : 'bastion', seed: Number(query.get('seed') ?? 8831) });
function prepare() {
  if (ark) return prepareArk();
  state.time = BASTION.arrivesAt;
  // The arena scroll is a closed form of time: the terrain is decelerating toward its stop as the fortress rolls in.
  const scroll = arenaScroll(state.time, null); state.distance = scroll.distance; state.scrollSpeed = scroll.speed; startBastion(state);
  for (let i = 0; i < 181; i++) stepRun(state, EMPTY_INPUT);
  if (['core', 'overload', 'destroyed'].includes(query.get('phase') ?? '')) {
    bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0; resolveBastionPhase(state);
  }
  if (query.get('phase') === 'overload') { bossTarget(state, 'core')!.hp *= .39; resolveBastionPhase(state); }
  if (query.get('phase') === 'destroyed') { bossTarget(state, 'core')!.hp = 0; resolveBastionPhase(state); }
}
/**
 * Helion Ark phases: `arrival` (1.2 s into the glide-in, or `t`), `batteries`, `core`, `launch` (bridge phase just
 * before the first Needle launch, bay doors opening), `overload`, `destroyed` (`t` seconds into the sequence);
 * `approach` previews the mission before the boss.
 */
function prepareArk() {
  const phase = query.get('phase') ?? 'batteries', at = Number(query.get('t') ?? (phase === 'arrival' ? 1.2 : 0));
  const step = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) stepRun(state, EMPTY_INPUT); };
  // `phase=approach&t=N`: Cold Vector itself, N seconds after launch (Needles, Diamonds, missile batteries).
  if (phase === 'approach') { step(at); return; }
  state.time = HELION_ARK.arrivesAt;
  const scroll = arenaScroll(state.time, null, HELION_ARK.arena); state.distance = scroll.distance; state.scrollSpeed = scroll.speed; startBastion(state);
  if (phase === 'arrival') { step(at); return; }
  step(HELION_ARK.arrivalDuration + 1 / 60);
  if (phase === 'batteries') return;
  bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0; resolveBastionPhase(state);
  if (phase === 'launch') { step(Math.max(0, state.boss!.nextLaunchAt - state.time - .35)); return; }
  if (phase === 'overload') { bossTarget(state, 'core')!.hp *= .39; resolveBastionPhase(state); }
  if (phase === 'destroyed') { bossTarget(state, 'core')!.hp = 0; resolveBastionPhase(state); step(at); }
}
prepare();
const ui = createUi(document.querySelector<HTMLElement>('#app')!, {
  start(config: RunConfig) { state = createRun(config); },
  pause() { state.phase = 'paused'; input.clear(); },
  resume() { state.phase = 'playing'; }, quit() { state.phase = 'paused'; ui.showMenu(); },
  setMuted() {}, setQuality(quality) { renderer.setQuality(quality); },
});
const input = createInput(ui.surface, ui.specialButton);
const renderer = createRenderer(ui.canvas);
const observer = new ResizeObserver(() => { const rect = ui.canvas.getBoundingClientRect(); renderer.resize(rect.width, rect.height); });
observer.observe(ui.canvas);
let previous = performance.now(), accumulator = 0;
// `hold=N` keeps the simulation still for N seconds so models load before a timed sequence (e.g. destruction) plays.
const holdUntil = performance.now() + Number(query.get('hold') ?? 0) * 1000;
function frame(now: number) {
  const elapsed = (now - previous) / 1000; previous = now;
  const controls = input.sample();
  if (!query.has('still') && now >= holdUntil) {
    accumulator += elapsed > .25 ? 0 : Math.min(elapsed, STEP * 5);
    let special = controls.specialPressed;
    while (accumulator >= STEP) { stepRun(state, { ...controls, specialPressed: special }); special = false; accumulator -= STEP; }
  }
  renderer.render(state, 0); ui.update(state);
  ui.canvas.dataset.encounterState = JSON.stringify({ phase: state.phase, boss: state.boss?.phase, lives: state.player.lives, time: state.time });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
