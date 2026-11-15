import { AudioMixer } from '../../src/audio/mixer';
import type { Sound, UiSound } from '../../src/audio/samples';
import { MENU_LEVEL, MENU_THEME, menuStep } from '../../src/audio/menu-theme';
import { createGameAudio, DEFAULT_AUDIO } from '../../src/audio/engine';
import { BossArranger, bossStage } from '../../src/audio/boss-score';
import { FROZEN, THEMES, scoreStep } from '../../src/audio/score';
import { createRun } from '../../src/sim/game';
import { startBoss } from '../../src/sim/boss';
import type { PlanetId } from '../../src/shared/contracts';
import { LOOKAHEAD, measure, previewCues, START, wav, type PreviewJob } from './audio-render';

/**
 * Offline evidence, rendered through the same samples, arrangement, arranger and buses used in play. Boss phases are
 * applied the way the engine applies them: observed at a moment, they act from the first sixteenth the 120 ms
 * lookahead has not scheduled yet.
 */
export async function renderTimeline(job: PreviewJob) {
  const planet = job.planet as PlanetId, rate = 44_100, bpm = THEMES[planet].bpm;
  const stepTime = 15 / bpm, barTime = stepTime * 16, seconds = START + job.bars * barTime + 1.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const mixer = new AudioMixer(ctx, { muted: false, effects: .8, music: .55 });
  mixer.warm(); mixer.setActive(true);
  const arranger = new BossArranger(), start = job.startStep ?? 0;
  const events: { at: number; run: () => void }[] = [];
  const stages: { at: number; step: number; stage: number; switchAt: number | null }[] = [];
  for (const change of job.phases ?? []) {
    const at = change.immediate ? 0 : START + change.bar * barTime;
    events.push({ at, run: () => {
      const stage = bossStage(change.phase);
      if (stage === arranger.target) return;
      const next = change.immediate ? start : start + Math.floor((at + LOOKAHEAD - START) / stepTime) + 1;
      if (stage) mixer.setBossMix(1, change.immediate ? 0 : .03, at);
      else mixer.setBossMix(0, barTime, at);
      arranger.request(stage, next, change.immediate);
      const switchAt = arranger.pending(next - 1)?.at ?? null;
      stages.push({ at, step: next, stage, switchAt: switchAt === null ? null : START + (switchAt - start) * stepTime });
    } });
  }
  for (const cue of [...previewCues(job, barTime, seconds), ...(job.extra ?? [])]) {
    const transpose = 'transpose' in cue ? cue.transpose : undefined;
    events.push({ at: cue.at, run: () => mixer.cue({ sound: cue.sound as Sound, pan: cue.pan, gain: cue.gain, variant: Math.round(cue.at * 10), ...(transpose === undefined ? {} : { transpose }) }, cue.at) });
  }
  for (let i = 0; i < job.bars * 16; i++) {
    const at = START + i * stepTime, step = start + i;
    events.push({ at: Math.max(1e-6, at - LOOKAHEAD), run: () => {
      if (!job.stemOnly) scoreStep(planet, step).forEach(n => mixer.note(n, at, false, step, FROZEN.has(planet)));
      if (mixer.bossActiveAt(at)) arranger.notes(planet, step).forEach(n => mixer.note(n, at, true, step));
    } });
  }
  // Monotonic scheduling preserves the real-time voice allocation semantics.
  events.sort((a, b) => a.at - b.at).forEach(e => e.run());
  const result = await ctx.startRendering();
  const metrics = { ...measure(result), ...mixer.diagnostics(), bpm, barSeconds: barTime, stages };
  mixer.dispose();
  return { wav: wav(result), metrics };
}

/**
 * The title theme offline, through the game's mixer as the engine plays it (menu-theme.ts, engine.ts): its own group and
 * fader, fading in over 3 s when `fadeIn`; menu sounds at their times; and a launch at `launchAt`: the theme fades out
 * over the warp (0.9 s) under the launch whoosh, and the `world`'s music starts at the warp's flash (1.3 s later).
 */
export async function renderMenu(job: { seconds: number; theme?: boolean; fadeIn?: boolean; ui?: { at: number; sound: UiSound; transpose?: number }[];
  launchAt?: number; world?: PlanetId }) {
  // At the game's default volumes (music 75 %, effects 55 % since 15 November).
  const rate = 44_100, ctx = new OfflineAudioContext(2, Math.ceil(job.seconds * rate), rate);
  const mixer = new AudioMixer(ctx, { ...DEFAULT_AUDIO });
  mixer.warm(); mixer.setActive(true);
  mixer.setMenuMix(job.fadeIn ? 0 : MENU_LEVEL, 0);
  if (job.fadeIn) mixer.setMenuMix(MENU_LEVEL, 3, START);
  const events: { at: number; run: () => void }[] = [], step = 15 / MENU_THEME.bpm, until = job.theme === false ? 0 : job.launchAt ?? job.seconds;
  for (let i = 0; START + i * step < until; i++) {
    const at = START + i * step;
    events.push({ at: Math.max(1e-6, at - LOOKAHEAD), run: () => menuStep(i).forEach(n => mixer.note(n, at, false, i, false, true)) });
  }
  for (const cue of job.ui ?? []) events.push({ at: cue.at, run: () => { mixer.uiCue(cue.sound, cue.transpose ?? 0, cue.at); } });
  if (job.launchAt !== undefined) {
    const launch = job.launchAt;
    events.push({ at: launch, run: () => { mixer.setMenuMix(0, .9, launch); mixer.cue({ sound: 'whoosh', pan: 0, gain: .8, variant: 0, transpose: 7 }, launch); } });
    if (job.world) {
      const world = job.world, from = launch + 1.3, beat = 15 / THEMES[world].bpm;
      for (let i = 0; from + i * beat < job.seconds; i++) {
        const at = from + i * beat;
        events.push({ at: Math.max(1e-6, at - LOOKAHEAD), run: () => scoreStep(world, i).forEach(n => mixer.note(n, at, false, i, FROZEN.has(world))) });
      }
    }
  }
  events.sort((a, b) => a.at - b.at).forEach(e => e.run());
  const result = await ctx.startRendering();
  const metrics = { ...measure(result), ...mixer.diagnostics(), bpm: MENU_THEME.bpm };
  mixer.dispose();
  return { wav: wav(result), metrics };
}

const live = createGameAudio(), run = createRun({ mode: 'campaign', mission: 'deep-bloom', seed: 1 });
document.querySelector('#start')!.addEventListener('click', () => { run.boss = null; live.start(run); });
document.querySelector('#stop')!.addEventListener('click', () => live.pause());
document.querySelector('#boss')!.addEventListener('click', () => { startBoss(run); live.observe(run); });
for (const phase of ['core', 'overload'] as const) document.querySelector(`#${phase}`)!.addEventListener('click', () => {
  if (run.boss) { run.boss.phase = phase; live.observe(run); }
});
document.querySelector('#level')!.addEventListener('click', () => {
  if (run.boss) run.boss.phase = 'destroyed';
  live.observe(run);
});
Object.assign(window, { __AUDIO_LAB__: { renderTimeline, renderMenu, live, run, startBoss, AudioMixer, BossArranger, THEMES } });
