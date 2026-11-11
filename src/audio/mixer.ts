import type { Cue } from './events';
import type { Note } from './score';
import { BASE_PITCH, type Instrument } from './instruments';
import { noiseSource, SAMPLE_IDS, SAMPLE_RATE, type SampleId, type Sound } from './samples';
import { takeSample } from './sample-bank';

export interface AudioSettings { muted: boolean; music: number; effects: number }
/** The level score, the additive boss stem (its own pool, so it can never thin the score) and combat effects. */
type Group = 'music' | 'boss' | 'effects';
interface Voice { id: SampleId; source: AudioBufferSourceNode; gain: GainNode; pan?: StereoPannerNode; send?: GainNode; group: Group; priority: number; start: number; end: number }
const LEVELS: Record<Sound, number> = {
  pulse: .23, fan: .25, seeker: .24, rail: .3, enemy: .10, impact: .13, explosion: .37, heavy: .43,
  shield: .4, 'shield-break': .48, life: .48, pickup: .19, upgrade: .28, ready: .25,
  shockwave: .5, 'seeker-rack': .4, 'siege-lance': .35, 'gravity-well': .42, warning: .25, beam: .28,
  'boss-arrival': .36, 'boss-phase': .33, 'boss-death': .57, warp: .39, win: .28, loss: .27,
};
const PRIORITY: Partial<Record<Sound, number>> = {
  impact: 0, enemy: 0, explosion: 1, heavy: 2, pulse: 2, fan: 2, seeker: 2, rail: 3,
  shield: 4, 'shield-break': 5, life: 5, 'boss-death': 5,
};
const COOLDOWN: Partial<Record<Sound, number>> = { impact: .055, enemy: .12, explosion: .045, heavy: .1, warning: .3, beam: .14 };
export const VOICE_LIMITS = { music: 36, boss: 24, effects: 20 } as const;
const PADS = new Set<Instrument>(['pad', 'bloom-pad', 'breath-pad', 'solar', 'inhale']);
/** Sustained voices that also feed the stereo ensemble. */
const ENSEMBLE = new Set<Instrument>(['pad', 'bloom-pad', 'breath-pad', 'solar', 'inhale', 'strings']);
/** Basses play one note at a time, as a player's would: a new note in the same part damps the one still ringing. */
const MONO = new Set<Instrument>(['bass', 'round-bass', 'foundry-bass', 'bio-bass', 'void-bass', 'drive-bass', 'growl']);
/** Drums and basses sit tight on the grid; everything else may lean a little behind it. */
const TIGHT = new Set<Instrument>(['kick', 'snare', 'hat', 'brush', 'metal', 'bone', 'void-tick', 'ember', 'heart', 'taiko', 'timpani',
  'tom', 'boom', 'crash', ...MONO]);
/** Voices whose timing is part of the writing: reversed notes stop exactly on a grid line, a riser peaks on one. */
const EXACT = new Set<Instrument>(['inhale', 'glint', 'riser']);

/** A fixed value in [0, 1) for a note: the same sixteenth, voice and pitch always get the same nuance. */
export function nuance(step: number, id: string, pitch: number, salt = 0) {
  let h = Math.imul((step | 0) + salt * 7919, 0x9e3779b1) ^ Math.round(pitch * 100);
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/**
 * The player's touch, added at playback and never written into the score: a few milliseconds of timing (drums and
 * basses within ±4 ms, other voices from 4 ms early to 10 ms late) and ±8% velocity, both fixed per note so every
 * render of a passage is identical.
 */
export function humanize(note: Note, step: number) {
  const timing = nuance(step, note.instrument, note.pitch), velocity = nuance(step, note.instrument, note.pitch, 1);
  const drift = EXACT.has(note.instrument) ? 0 : TIGHT.has(note.instrument) ? (timing - .5) * .008 : -.004 + timing * .014;
  return { drift, gain: note.gain * (1 + (velocity - .5) * .16) };
}

/** Shared by live playback and OfflineAudioContext previews: those previews use the actual game's mix. */
export class AudioMixer {
  private buffers = new Map<SampleId, AudioBuffer>();
  private voices: Voice[] = [];
  private cooldown = new Map<Sound, number>();
  private music: GainNode;
  /** The level score's voices; it steps back a little as the boss stem takes the weight (see `setBed`). */
  private bed: GainNode;
  private boss: GainNode;
  private bossFade = { from: 0, target: 0, start: 0, end: 0 };
  private effects: GainNode;
  private duck: GainNode;
  private gate: GainNode;
  private reverb: ConvolverNode;
  private ensemble: GainNode;
  private nodes: AudioNode[] = [];
  private lfos: OscillatorNode[] = [];
  private settings: AudioSettings;
  private active = false;
  readonly analyser: AnalyserNode;
  accepted = 0;
  dropped = 0;
  peakVoices = 0;
  peakBossVoices = 0;
  constructor(readonly context: BaseAudioContext, settings: AudioSettings) {
    this.settings = { ...settings };
    const gain = (level: number) => { const node = context.createGain(); node.gain.value = level; this.nodes.push(node); return node; };
    const filter = (type: BiquadFilterType, hz: number, q = .707) => {
      const node = context.createBiquadFilter(); node.type = type; node.frequency.value = hz; node.Q.value = q; this.nodes.push(node); return node;
    };
    this.music = gain(settings.music * .72); this.effects = gain(settings.effects);
    this.bed = gain(1); this.bed.connect(this.music);
    // The boss stem has its own gentle bus compressor: it only rounds off the drum and brass peaks so they do not push
    // the shared master compressor (which would pump the combat sounds). Slow enough to let every hit through first.
    this.boss = gain(0);
    const glue = context.createDynamicsCompressor();
    glue.threshold.value = -10; glue.knee.value = 10; glue.ratio.value = 1.8; glue.attack.value = .015; glue.release.value = .25;
    this.boss.connect(glue).connect(this.music); this.nodes.push(glue);
    this.duck = gain(1); this.gate = gain(0);
    const highpass = filter('highpass', 32, .5);
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -10; compressor.knee.value = 12; compressor.ratio.value = 4;
    compressor.attack.value = .004; compressor.release.value = .17;
    // Final headroom and a second fast limiter catch overlapping explosions without clipping the output.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = .001; limiter.release.value = .08;
    this.analyser = context.createAnalyser(); this.analyser.fftSize = 512;
    this.music.connect(this.duck).connect(highpass);
    this.effects.connect(highpass);
    highpass.connect(compressor).connect(limiter).connect(this.gate).connect(this.analyser).connect(context.destination);
    this.nodes.push(compressor, limiter, this.analyser);
    // One hall for the entire score (11 November): 18 ms pre-delay, a cluster of early reflections that differ between
    // the sides, then a dense 2.3 s tail whose highs die first, as air and walls absorb them. Its return is high-passed,
    // so the hall never thickens the bass. The convolver normalizes by power, so wet level follows the impulse length:
    // the return is scaled from the 20 October room's wet energy, a fifth higher now that the hall replaces the echo.
    this.reverb = context.createConvolver();
    const hallSeconds = 2.3, pre = .018, ir = context.createBuffer(2, Math.ceil(context.sampleRate * hallSeconds), context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c), noise = noiseSource(815 + c * 79), rate = context.sampleRate;
      let low = 0, lower = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / rate, cutoff = 900 + 5200 * Math.exp(-t * 1.7);
        low += (noise() - low) * (1 - Math.exp(-2 * Math.PI * cutoff / rate));
        lower += (low - lower) * (1 - Math.exp(-2 * Math.PI * cutoff * 1.6 / rate));
        data[i] = t < pre ? 0 : lower * Math.exp(-t * 3) * Math.min(1, (t - pre) / .06) ** 1.5;
      }
      const reflections = c ? [.021, .027, .036, .044, .053, .067, .079] : [.019, .031, .038, .049, .058, .071, .083];
      reflections.forEach((at, k) => { data[Math.round(at * rate)] += (.42 - k * .05) * (k % 2 ? -1 : 1); });
    }
    const air = filter('highpass', 170, .6);
    this.reverb.buffer = ir; this.reverb.connect(air).connect(gain(.34 * Math.sqrt(1.45 / hallSeconds) * 1.2)).connect(this.music);
    this.nodes.push(this.reverb);
    // Stereo ensemble for sustained pads and strings: two short delays, one per side, slowly modulated at different
    // rates. It adds width and movement without any phase-inverted widening.
    this.ensemble = gain(.32);
    const sides = context.createChannelMerger(2);
    for (const [side, ms, rate, depth] of [[0, 12.3, .17, 1.7], [1, 17.1, .23, 2.1]] as const) {
      const line = context.createDelay(.05), lfo = context.createOscillator(), amount = gain(depth / 1000);
      line.delayTime.value = ms / 1000; lfo.frequency.value = rate;
      lfo.connect(amount).connect(line.delayTime); lfo.start();
      this.ensemble.connect(line).connect(sides, 0, side);
      this.nodes.push(line, lfo); this.lfos.push(lfo);
    }
    sides.connect(this.music); this.nodes.push(sides);
  }
  private buffer(id: SampleId) {
    let buffer = this.buffers.get(id);
    if (!buffer) {
      const samples = takeSample(id);
      buffer = this.context.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(id, buffer);
    }
    return buffer;
  }
  /** Every buffer now (offline renders). The game takes them as they first play, from samples made at boot. */
  warm() {
    SAMPLE_IDS.forEach(id => this.buffer(id));
  }
  private ramp(param: AudioParam, target: number, seconds = .025, at = this.context.currentTime) {
    param.cancelAndHoldAtTime(at);
    param.setTargetAtTime(target, at, seconds);
  }
  setSettings(settings: AudioSettings) {
    this.settings = { ...settings };
    this.ramp(this.music.gain, settings.music * .72);
    this.ramp(this.effects.gain, settings.effects);
    this.ramp(this.gate.gain, this.active && !settings.muted ? .85 : 0, .008);
    if (settings.muted) this.stop();
    else {
      if (settings.music === 0) this.stopGroup('music');
      if (settings.effects === 0) this.stopGroup('effects');
    }
  }
  setActive(active: boolean) {
    this.active = active;
    this.ramp(this.gate.gain, active && !this.settings.muted ? .85 : 0, active ? .06 : .006);
    if (!active) this.stop();
  }
  bossMixAt(at = this.context.currentTime) {
    const { from, target, start, end } = this.bossFade;
    const progress = end <= start ? 1 : Math.min(1, Math.max(0, (at - start) / (end - start)));
    return from + (target - from) * progress;
  }
  bossActiveAt(at: number) { return this.bossFade.target > 0 || this.bossMixAt(at) > 0; }
  /** The boss stem's fader: 1 while a boss fights (its arrangement, not its level, follows the phases), 0 without. */
  setBossMix(target: number, seconds: number, at = this.context.currentTime) {
    const from = this.bossMixAt(at);
    this.boss.gain.cancelAndHoldAtTime(at);
    if (seconds > 0) this.boss.gain.linearRampToValueAtTime(target, at + seconds);
    else this.boss.gain.setValueAtTime(target, at);
    this.bossFade = { from, target, start: at, end: at + Math.max(0, seconds) };
    if (target === 0) { this.bedLevel = 1; this.ramp(this.bed.gain, 1, Math.max(.05, seconds / 3), at); }
  }
  /** The level bed's level: the boss stages lower it slightly so the stem can step forward (1 outside fights). It
   * moves smoothly on bar lines and stinger hits; nothing dips it under the drums. */
  private bedLevel = 1;
  private setBed(level: number, at: number) {
    this.bedLevel = level;
    this.bed.gain.setTargetAtTime(level, at, .12);
  }
  private release(voice: Voice) {
    const index = this.voices.indexOf(voice);
    if (index >= 0) this.voices.splice(index, 1);
    voice.source.disconnect(); voice.gain.disconnect(); voice.pan?.disconnect(); voice.send?.disconnect();
  }
  private stopVoice(voice: Voice, at = this.context.currentTime) {
    this.ramp(voice.gain.gain, 0, .003, at);
    try { voice.source.stop(at + .018); } catch { /* Already stopped. */ }
    // Disconnect onended; keeping the fade avoids a discontinuity when stealing a voice.
  }
  private play(id: SampleId, at: number, rate: number, volume: number, pan: number, group: Group, priority: number, wet = 0, skip = 0) {
    const fader = group === 'effects' ? this.settings.effects : this.settings.music;
    if (!this.active || this.settings.muted || fader === 0) return false;
    this.voices.filter(v => v.end <= this.context.currentTime).forEach(v => this.release(v));
    // Notes scheduled ahead (Umbra's reversed voices, risers) can arrive out of time order, so a pool may already hold
    // more than its cap at this moment: steal until there is room, lowest priority and earliest end first.
    const pool = this.voices.filter(v => v.group === group && v.end > at);
    while (pool.length >= VOICE_LIMITS[group]) {
      const victim = pool.reduce((a, b) => a.priority < b.priority || (a.priority === b.priority && a.end < b.end) ? a : b);
      if (victim.priority > priority) { this.dropped++; return false; }
      this.stopVoice(victim, at);
      this.voices.splice(this.voices.indexOf(victim), 1);
      pool.splice(pool.indexOf(victim), 1);
    }
    // A centred voice skips its panner (performance, 31 October: most score notes are centred and each node costs):
    // an equal-power panner at 0 sends a mono sample to both channels at √½, which the voice gain applies instead.
    const source = this.context.createBufferSource(), gain = this.context.createGain(), panner = pan === 0 ? undefined : this.context.createStereoPanner();
    source.buffer = this.buffer(id); source.playbackRate.value = rate;
    gain.gain.value = panner ? volume : volume * Math.SQRT1_2;
    if (panner) panner.pan.value = pan;
    const out: AudioNode = panner ? source.connect(gain).connect(panner) : source.connect(gain);
    out.connect(group === 'music' ? this.bed : group === 'boss' ? this.boss : this.effects);
    const voice: Voice = { id, source, gain, pan: panner, group, priority, start: at, end: at + (source.buffer.duration - skip) / rate };
    if (wet > 0 && group !== 'effects') {
      const send = this.context.createGain(); send.gain.value = wet;
      out.connect(send).connect(this.reverb); voice.send = send;
    }
    if (group !== 'effects' && ENSEMBLE.has(id as Instrument)) out.connect(this.ensemble);
    source.onended = () => this.release(voice);
    this.voices.push(voice);
    const live = this.voices.filter(v => v.end > at);
    this.peakVoices = Math.max(this.peakVoices, live.length);
    if (group === 'boss') this.peakBossVoices = Math.max(this.peakBossVoices, live.filter(v => v.group === 'boss').length);
    source.start(at, skip); this.accepted++;
    return true;
  }
  cue(cue: Cue, at = this.context.currentTime) {
    if (at < (this.cooldown.get(cue.sound) ?? -Infinity)) { this.dropped++; return; }
    this.cooldown.set(cue.sound, at + (COOLDOWN[cue.sound] ?? .025));
    const pitch = ['pickup', 'upgrade', 'ready', 'win', 'loss', 'warning', 'siege-lance'].includes(cue.sound) ? 1 : 1 + ((cue.variant % 7) - 3) * .012;
    this.play(cue.sound, at, pitch, LEVELS[cue.sound] * cue.gain, cue.pan, 'effects', PRIORITY[cue.sound] ?? 3);
    if (['life', 'shield-break', 'boss-arrival', 'boss-death', 'shockwave'].includes(cue.sound)) {
      this.duck.gain.cancelScheduledValues(at);
      this.duck.gain.setTargetAtTime(.43, at, .015);
      this.duck.gain.setTargetAtTime(1, at + .22, .26);
    }
  }
  /** Damps the part's previous bass note as a new one starts: a 40 ms release instead of two notes ringing together. */
  private choke(id: SampleId, group: Group, at: number) {
    for (const voice of this.voices) {
      if (voice.id !== id || voice.group !== group || voice.start >= at - .001 || voice.end <= at) continue;
      voice.gain.gain.setTargetAtTime(0, at, .012);
      try { voice.source.stop(at + .06); } catch { /* Already stopped. */ }
      voice.end = at + .06;
    }
  }
  /** A score note, or with `boss` a note of the additive boss stem (its own voice pool, priorities and fader). With the
   * note's sixteenth, it is played with the player's touch (`humanize`). */
  note(note: Note, at: number, boss = false, step?: number) {
    if (boss && !this.bossActiveAt(at)) return;
    const touch = step === undefined ? { drift: 0, gain: note.gain } : humanize(note, step);
    const start = Math.max(this.context.currentTime, at + (note.offset ?? 0) + touch.drift), pad = PADS.has(note.instrument);
    const priority = boss ? note.priority ?? 0 : pad ? 0 : 1, group: Group = boss ? 'boss' : 'music';
    if (MONO.has(note.instrument)) this.choke(note.instrument, group, start);
    const played = this.play(note.instrument, start, 2 ** ((note.pitch - BASE_PITCH[note.instrument]) / 12), touch.gain, note.pan,
      group, priority, note.wet, note.skip ?? 0);
    // Only while a fight is on: the stem's fade-out bar must not lower the level score again after the kill.
    if (played && boss && note.bed !== undefined && this.bossFade.target > 0) this.setBed(note.bed, start);
  }
  stopGroup(group: 'music' | 'effects') {
    const stops = (v: Voice) => v.group === group || (group === 'music' && v.group === 'boss');
    for (const voice of this.voices.filter(stops)) this.stopVoice(voice);
    this.voices = this.voices.filter(v => !stops(v));
    if (group === 'music') { this.bedLevel = 1; this.ramp(this.bed.gain, 1); }
  }
  stop() {
    this.stopGroup('music'); this.stopGroup('effects'); this.cooldown.clear();
    this.ramp(this.duck.gain, 1);
  }
  diagnostics() {
    return {
      voices: this.voices.length, musicVoices: this.voices.filter(v => v.group === 'music').length,
      bossVoices: this.voices.filter(v => v.group === 'boss').length,
      effectsVoices: this.voices.filter(v => v.group === 'effects').length,
      peakVoices: this.peakVoices, peakBossVoices: this.peakBossVoices, accepted: this.accepted, dropped: this.dropped,
      bossMix: this.bossMixAt(), bossTarget: this.bossFade.target,
      sampleBytes: [...this.buffers.values()].reduce((n, b) => n + b.length * 4 * b.numberOfChannels, 0),
    };
  }
  dispose() {
    [...this.voices].forEach(v => { try { v.source.stop(); } catch { /* Ended. */ } this.release(v); });
    this.voices = [];
    this.lfos.forEach(lfo => { try { lfo.stop(); } catch { /* Stopped. */ } });
    this.nodes.forEach(n => n.disconnect()); this.buffers.clear();
  }
}
