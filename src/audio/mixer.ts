import type { Cue } from './events';
import type { Note } from './score';
import { noiseSource, SAMPLE_IDS, SAMPLE_RATE, type SampleId, type Sound } from './samples';
import { takeSample } from './sample-bank';

export interface AudioSettings { muted: boolean; music: number; effects: number }
type Group = 'music' | 'effects';
interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan?: StereoPannerNode; send?: GainNode; group: Group; priority: number; end: number }
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
export const VOICE_LIMITS = { music: 36, effects: 20 } as const;

/** Shared by live playback and OfflineAudioContext previews: those previews use the actual game's mix. */
export class AudioMixer {
  private buffers = new Map<SampleId, AudioBuffer>();
  private voices: Voice[] = [];
  private cooldown = new Map<Sound, number>();
  private music: GainNode;
  private boss: GainNode;
  private bossFade = { from: 0, target: 0, start: 0, end: 0 };
  private effects: GainNode;
  private duck: GainNode;
  private gate: GainNode;
  private reverb: ConvolverNode;
  private delay: GainNode;
  private nodes: AudioNode[] = [];
  private settings: AudioSettings;
  private active = false;
  readonly analyser: AnalyserNode;
  accepted = 0;
  dropped = 0;
  peakVoices = 0;
  constructor(readonly context: BaseAudioContext, settings: AudioSettings) {
    this.settings = { ...settings };
    const gain = (level: number) => { const node = context.createGain(); node.gain.value = level; this.nodes.push(node); return node; };
    this.music = gain(settings.music * .72); this.effects = gain(settings.effects);
    this.boss = gain(0); this.boss.connect(this.music);
    this.duck = gain(1); this.gate = gain(0);
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass'; highpass.frequency.value = 32; highpass.Q.value = .5;
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
    this.nodes.push(highpass, compressor, limiter, this.analyser);
    // One short stereo room for the entire score. All wet returns pass through the music fader.
    this.reverb = context.createConvolver();
    const ir = context.createBuffer(2, Math.ceil(context.sampleRate * 1.45), context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c), noise = noiseSource(815 + c * 79);
      let low = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / context.sampleRate; low += (noise() - low) * .4;
        data[i] = low * Math.exp(-t * 5.5) * Math.min(1, t * 80);
      }
    }
    this.reverb.buffer = ir; this.reverb.connect(gain(.34)).connect(this.music);
    this.delay = gain(.24);
    const echo = context.createDelay(1), damp = context.createBiquadFilter(), feedback = gain(.29);
    echo.delayTime.value = .283; damp.type = 'lowpass'; damp.frequency.value = 2600;
    this.delay.connect(echo).connect(damp).connect(this.music);
    damp.connect(feedback).connect(echo);
    this.nodes.push(this.reverb, echo, damp);
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
  setBossIntensity(intensity: number, seconds: number, at = this.context.currentTime) {
    const from = this.bossMixAt(at), target = intensity >= 2 ? 1 : intensity > 0 ? .85 : 0;
    this.boss.gain.cancelAndHoldAtTime(at);
    if (seconds > 0) this.boss.gain.linearRampToValueAtTime(target, at + seconds);
    else this.boss.gain.setValueAtTime(target, at);
    this.bossFade = { from, target, start: at, end: at + Math.max(0, seconds) };
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
  private play(id: SampleId, at: number, rate: number, volume: number, pan: number, group: Group, priority: number, wet = 0, boss = false) {
    if (!this.active || this.settings.muted || this.settings[group] === 0) return;
    this.voices.filter(v => v.end <= this.context.currentTime).forEach(v => this.release(v));
    const pool = this.voices.filter(v => v.group === group && v.end > at);
    if (pool.length >= VOICE_LIMITS[group]) {
      const victim = pool.reduce((a, b) => a.priority < b.priority || (a.priority === b.priority && a.end < b.end) ? a : b);
      if (victim.priority > priority) { this.dropped++; return; }
      this.stopVoice(victim, at);
      this.voices.splice(this.voices.indexOf(victim), 1);
    }
    // A centred voice skips its panner (performance, 31 October: most score notes are centred and each node costs):
    // an equal-power panner at 0 sends a mono sample to both channels at √½, which the voice gain applies instead.
    const source = this.context.createBufferSource(), gain = this.context.createGain(), panner = pan === 0 ? undefined : this.context.createStereoPanner();
    source.buffer = this.buffer(id); source.playbackRate.value = rate;
    gain.gain.value = panner ? volume : volume * Math.SQRT1_2;
    if (panner) panner.pan.value = pan;
    const out: AudioNode = panner ? source.connect(gain).connect(panner) : source.connect(gain);
    out.connect(group === 'music' ? boss ? this.boss : this.music : this.effects);
    const voice: Voice = { source, gain, pan: panner, group, priority, end: at + source.buffer.duration / rate };
    if (wet > 0 && group === 'music' && !boss) {
      const send = this.context.createGain(); send.gain.value = wet;
      out.connect(send); send.connect(this.reverb); send.connect(this.delay); voice.send = send;
    }
    source.onended = () => this.release(voice);
    this.voices.push(voice); this.peakVoices = Math.max(this.peakVoices, this.voices.filter(v => v.end > at).length);
    source.start(at); this.accepted++;
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
  note(note: Note, at: number, boss = false) {
    if (boss && !this.bossActiveAt(at)) return;
    const pad = ['pad', 'bloom-pad', 'breath-pad', 'void-air'].includes(note.instrument);
    const bass = note.instrument.endsWith('bass') || note.instrument === 'kick' || note.instrument === 'heart';
    const base = bass ? 36 : pad ? 48 : 60;
    // Added rhythm may be thinned under pressure; it must never steal the level's lead or sustained pads.
    this.play(note.instrument, at + (note.offset ?? 0), 2 ** ((note.pitch - base) / 12), note.gain, note.pan, 'music', boss ? -1 : pad ? 0 : 1, note.wet, boss);
  }
  stopGroup(group: Group) {
    for (const voice of this.voices.filter(v => v.group === group)) this.stopVoice(voice);
    this.voices = this.voices.filter(v => v.group !== group);
  }
  stop() {
    this.stopGroup('music'); this.stopGroup('effects'); this.cooldown.clear();
    this.ramp(this.duck.gain, 1);
  }
  diagnostics() {
    return {
      voices: this.voices.length, musicVoices: this.voices.filter(v => v.group === 'music').length,
      effectsVoices: this.voices.filter(v => v.group === 'effects').length,
      peakVoices: this.peakVoices, accepted: this.accepted, dropped: this.dropped,
      bossMix: this.bossMixAt(), bossTarget: this.bossFade.target,
      sampleBytes: [...this.buffers.values()].reduce((n, b) => n + b.length * 4 * b.numberOfChannels, 0),
    };
  }
  dispose() {
    [...this.voices].forEach(v => { try { v.source.stop(); } catch { /* Ended. */ } this.release(v); });
    this.voices = [];
    this.nodes.forEach(n => n.disconnect()); this.buffers.clear();
  }
}
