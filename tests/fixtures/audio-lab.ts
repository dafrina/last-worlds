import { AudioMixer } from '../../src/audio/mixer';
import { createGameAudio } from '../../src/audio/engine';
import { THEMES, bossStep, scoreStep } from '../../src/audio/score';
import { type Sound } from '../../src/audio/samples';
import { createRun } from '../../src/sim/game';
import { startBoss } from '../../src/sim/bastion';
import type { PlanetId } from '../../src/shared/contracts';

/** Offline evidence is rendered through the same samples, arrangement and buses used in play. */
export async function renderPreview(theme: PlanetId | 'effects', seconds = 28, combat = false, version: 'level' | 'boss' | 'transition' = 'level') {
  const rate = 44_100, ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const mixer = new AudioMixer(ctx, { muted: false, effects: .8, music: .55 });
  mixer.warm(); mixer.setActive(true);
  // Monotonic scheduling preserves the real-time voice allocation semantics.
  const events: { at: number; run: () => void }[] = [];
  const transitions: { at: number; intensity: number; fade: number }[] = [];
  if (theme !== 'effects') {
    const stepTime = 60 / THEMES[theme].bpm / 4;
    const barTime = stepTime * 16;
    if (version === 'boss') transitions.push({ at: 0, intensity: 2, fade: 0 });
    else if (version === 'transition') {
      // Enter mid-phrase, then return to the original bed without losing any score time.
      transitions.push({ at: .05 + barTime * 2, intensity: 1, fade: barTime },
        { at: .05 + barTime * 5, intensity: 2, fade: barTime },
        { at: .05 + barTime * 8, intensity: 0, fade: barTime });
    } else if (combat) transitions.push({ at: seconds / 2, intensity: 2, fade: barTime });
    for (const change of transitions) events.push({ at: change.at,
      run: () => mixer.setBossIntensity(change.intensity, change.fade, change.at) });
    for (let step = 0; step * stepTime < seconds - 2; step++) {
      const at = .05 + step * stepTime;
      events.push({ at, run: () => {
        scoreStep(theme, step).forEach(n => mixer.note(n, at));
        if (mixer.bossActiveAt(at)) bossStep(theme, step).forEach(n => mixer.note(n, at, true));
      } });
    }
  }
  if (theme === 'effects') {
    const sounds: Sound[] = ['pulse', 'pulse', 'fan', 'seeker', 'impact', 'explosion', 'heavy', 'shield', 'shield-break', 'pickup', 'upgrade', 'ready', 'shockwave', 'seeker-rack', 'siege-lance', 'boss-arrival', 'boss-phase', 'boss-death', 'warp'];
    sounds.forEach((sound, i) => {
      const at = .2 + i * 1.8;
      events.push({ at, run: () => mixer.cue({ sound, pan: 0, gain: 1, variant: i }, at) });
    });
  } else if (combat) {
    for (let i = 0; i < 75; i++) {
      const at = .3 + i * .26;
      events.push({ at, run: () => mixer.cue({ sound: i % 7 === 6 ? 'explosion' : 'pulse', pan: Math.sin(i) * .3, gain: 1, variant: i }, at) });
    }
    events.push({ at: 11, run: () => mixer.cue({ sound: 'shield-break', pan: 0, gain: 1, variant: 0 }, 11) });
  }
  events.sort((a, b) => a.at - b.at).forEach(e => e.run());
  const result = await ctx.startRendering(), left = result.getChannelData(0), right = result.getChannelData(1);
  let peak = 0, sum = 0, mono = 0, clipped = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    sum += left[i] ** 2 + right[i] ** 2;
    mono += ((left[i] + right[i]) / 2) ** 2;
    if (Math.abs(left[i]) >= 1 || Math.abs(right[i]) >= 1) clipped++;
  }
  // Stereo PCM16 WAV for local review; these previews are not runtime downloads.
  const bytes = new Uint8Array(44 + result.length * 4), view = new DataView(bytes.buffer);
  const str = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, result.length * 4, true);
  for (let i = 0; i < result.length; i++) {
    view.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), true);
    view.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  // One-second low-band and full-band measurements make level/boss A-B checks reproducible.
  const windows: { rms: number; bassRms: number }[] = [];
  let low = 0;
  const alpha = 1 - Math.exp(-2 * Math.PI * 180 / rate);
  for (let start = 0; start < left.length; start += rate) {
    let full = 0, bass = 0;
    const end = Math.min(start + rate, left.length);
    for (let i = start; i < end; i++) {
      const mono = (left[i] + right[i]) / 2;
      low += alpha * (mono - low); full += mono * mono; bass += low * low;
    }
    windows.push({ rms: Math.sqrt(full / (end - start)), bassRms: Math.sqrt(bass / (end - start)) });
  }
  const metrics = { peak, rms: Math.sqrt(sum / result.length / 2), monoRms: Math.sqrt(mono / result.length),
    clipped, windows, transitions, ...mixer.diagnostics() };
  mixer.dispose();
  return { wav: btoa(binary), metrics };
}

const live = createGameAudio(), run = createRun({ mode: 'campaign', mission: 'deep-bloom', seed: 1 });
document.querySelector('#start')!.addEventListener('click', () => { run.boss = null; live.start(run); });
document.querySelector('#stop')!.addEventListener('click', () => live.pause());
document.querySelector('#boss')!.addEventListener('click', () => { startBoss(run); live.observe(run); });
document.querySelector('#level')!.addEventListener('click', () => {
  if (run.boss) run.boss.phase = 'destroyed';
  live.observe(run);
});
Object.assign(window, { __AUDIO_LAB__: { renderPreview, live, run, startBoss, AudioMixer } });
