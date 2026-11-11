import { AudioMixer } from '../../src/audio/mixer';
import { createGameAudio } from '../../src/audio/engine';
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
  for (const cue of previewCues(job, barTime, seconds)) {
    events.push({ at: cue.at, run: () => mixer.cue({ sound: cue.sound, pan: cue.pan, gain: cue.gain, variant: Math.round(cue.at * 10) }, cue.at) });
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
Object.assign(window, { __AUDIO_LAB__: { renderTimeline, live, run, startBoss, AudioMixer, BossArranger, THEMES } });
