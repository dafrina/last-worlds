/** Development-only visual fixture; this HTML is not a Vite production entry. */
import { createRun, stepRun } from '../../src/sim/game';
import { arenaScroll, startBastion, bossTarget, resolveBastionPhase } from '../../src/sim/bastion';
import { createRenderer } from '../../src/render/scene';
import { createUi } from '../../src/ui/game-ui';
import { createInput } from '../../src/input/controls';
import { STEP, EMPTY_INPUT, VIEW, type RunConfig } from '../../src/shared/contracts';
import { BASTION } from '../../src/content/bastion';
import { HELION_ARK } from '../../src/content/ark';
import { WARDEN } from '../../src/content/warden';
import { VEIL } from '../../src/content/veil';

const query = new URLSearchParams(location.search);
// `boss=ark` previews Cold Vector's Helion Ark on Vesper's open-water arena; without it this is Rolling Thunder's Bastion-9.
const ark = query.get('boss') === 'ark', warden = query.get('boss') === 'warden', veil = query.get('boss') === 'veil';
let state = createRun({ mode: 'campaign', mission: ark ? 'cold-vector' : warden ? 'training' : veil ? 'deep-bloom' : 'bastion', seed: Number(query.get('seed') ?? 8831) });
function prepare() {
  if (query.get('mode') === 'jump') return prepareJump();
  if (ark) return prepareArk();
  if (warden) return prepareWarden();
  if (veil) return prepareVeil();
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
/** THE VEIL over Nacre's mire (`boss=veil`), same phases as WARDEN-1; `phase=approach&t=N` previews Deep Bloom itself. */
function prepareVeil() {
  const phase = query.get('phase') ?? 'batteries', at = Number(query.get('t') ?? (phase === 'arrival' ? 1.5 : 0));
  const step = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) stepRun(state, EMPTY_INPUT); };
  if (phase === 'approach') { step(at); return; }
  state.time = VEIL.arrivesAt;
  const scroll = arenaScroll(state.time, null, VEIL.arena); state.distance = scroll.distance; state.scrollSpeed = scroll.speed; startBastion(state);
  if (phase === 'arrival') { step(at); return; }
  step(VEIL.arrivalDuration + 1 / 60);
  if (phase === 'batteries') return;
  bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0; resolveBastionPhase(state);
  if (phase === 'overload') { bossTarget(state, 'core')!.hp *= .39; resolveBastionPhase(state); }
  if (phase === 'destroyed') { bossTarget(state, 'core')!.hp = 0; resolveBastionPhase(state); step(at); }
}
/** WARDEN-1 on Luna (`boss=warden`): `arrival` (`t` seconds into the descent), `batteries`, `core`, `overload`, `destroyed`. */
function prepareWarden() {
  const phase = query.get('phase') ?? 'batteries', at = Number(query.get('t') ?? (phase === 'arrival' ? 1.2 : 0));
  const step = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) stepRun(state, EMPTY_INPUT); };
  state.time = WARDEN.arrivesAt;
  const scroll = arenaScroll(state.time, null, WARDEN.arena); state.distance = scroll.distance; state.scrollSpeed = scroll.speed; startBastion(state);
  if (phase === 'arrival') { step(at); return; }
  step(WARDEN.arrivalDuration + 1 / 60);
  if (phase === 'batteries') return;
  bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0; resolveBastionPhase(state);
  if (phase === 'overload') { bossTarget(state, 'core')!.hp *= .3; resolveBastionPhase(state); }
  if (phase === 'destroyed') { bossTarget(state, 'core')!.hp = 0; resolveBastionPhase(state); step(at); }
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
/**
 * Endless hyperdrive jump (docs/18): `mode=jump&n=1|2&t=N` flies an endless run (invulnerable, no input) to the
 * n-th boss sector (1: Bastion-9 then Khepri → Vesper; 2: the Helion Ark then Vesper → Khepri), destroys the boss
 * as soon as it is targetable, then steps N seconds: the jump runs from about 2 to 5 s, its flash at 3.5 s.
 */
function prepareJump() {
  state = createRun({ mode: 'endless', seed: Number(query.get('seed') ?? 8831) });
  const target = Number(query.get('n') ?? 1) * 3, at = Number(query.get('t') ?? 0);
  const tick = () => { state.player.invulnerableUntil = Infinity; stepRun(state, EMPTY_INPUT); };
  for (let guard = 0; guard < 60 * 1200 && !(state.sector === target && state.boss && state.boss.phase === 'batteries'); guard++) tick();
  if (state.boss) { for (const part of ['left', 'right', 'core'] as const) bossTarget(state, part)!.hp = 0; resolveBastionPhase(state); }
  for (let i = 0; i < Math.round(at * 60); i++) tick();
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
