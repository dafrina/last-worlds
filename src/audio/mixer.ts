import type { Cue } from './events';
import type { Note } from './score';
import { BASE_PITCH, type Instrument } from './instruments';
import { noiseSource, SAMPLE_IDS, SAMPLE_RATE, type SampleId, type Sound } from './samples';
import { takeSample } from './sample-bank';

export interface AudioSettings { muted: boolean; music: number; effects: number }
/** The level score, the additive boss stem (its own pool, so it can never thin the score) and combat effects. */
type Group = 'music' | 'boss' | 'effects';
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
export const VOICE_LIMITS = { music: 36, boss: 24, effects: 20 } as const;
const PADS = new Set<Instrument>(['pad', 'bloom-pad', 'breath-pad', 'solar', 'inhale']);
/** Sustained voices that also feed the stereo ensemble. */
const ENSEMBLE = new Set<Instrument>(['pad', 'bloom-pad', 'breath-pad', 'solar', 'inhale', 'strings']);

/** Shared by live playback and OfflineAudioContext previews: those previews use the actual game's mix. */
export class AudioMixer {
  private buffers = new Map<SampleId, AudioBuffer>();
  private voices: Voice[] = [];
  private cooldown = new Map<Sound, number>();
  private music: GainNode;
  /** The level score's dry voices; it dips briefly under the boss stem's kick (see `pump`). */
  private bed: GainNode;
  private boss: GainNode;
  private bossFade = { from: 0, target: 0, start: 0, end: 0 };
  private effects: GainNode;
  private duck: GainNode;
  private gate: GainNode;
  private reverb: ConvolverNode;
  private delay: GainNode;
  private echoes: DelayNode[];
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
    // The boss stem has its own gentle bus compressor: it glues the added drums and bass and keeps their peaks from
    // pushing the shared master compressor, which would otherwise pump the combat sounds.
    this.boss = gain(0);
    const glue = context.createDynamicsCompressor();
    glue.threshold.value = -12; glue.knee.value = 8; glue.ratio.value = 2.5; glue.attack.value = .006; glue.release.value = .14;
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
    // One stereo room for the entire score: 12 ms pre-delay, a few early reflections, then a tail whose highs die
    // first (a darker, larger room than the first pass). The convolver normalizes by power, so wet level follows the
    // impulse length: the return is scaled to keep the 20 October room's wet energy.
    this.reverb = context.createConvolver();
    const roomSeconds = 1.8, ir = context.createBuffer(2, Math.ceil(context.sampleRate * roomSeconds), context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c), noise = noiseSource(815 + c * 79), rate = context.sampleRate;
      let low = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / rate, cutoff = 700 + 3600 * Math.exp(-t * 2.2);
        low += (noise() - low) * (1 - Math.exp(-2 * Math.PI * cutoff / rate));
        data[i] = t < .012 ? 0 : low * Math.exp(-t * 4.2) * Math.min(1, (t - .012) * 90);
      }
      (c ? [.019, .029, .043, .061] : [.023, .034, .047, .067]).forEach((at, k) => { data[Math.round(at * rate)] += (.5 - k * .1) * (c ? -1 : 1); });
    }
    this.reverb.buffer = ir; this.reverb.connect(gain(.34 * Math.sqrt(1.45 / roomSeconds))).connect(this.music);
    // A tempo-synced, damped ping-pong echo (dotted eighths, left then right; see setTempo). The send is summed to mono
    // first, so the two sides carry the same echoes and mono playback loses nothing.
    this.delay = gain(.24);
    this.delay.channelCount = 1; this.delay.channelCountMode = 'explicit';
    const left = context.createDelay(1), right = context.createDelay(1), merger = context.createChannelMerger(2);
    const damp = filter('lowpass', 2600), clear = filter('highpass', 220), cross = gain(.42), feedback = gain(.42);
    this.delay.connect(damp).connect(left);
    left.connect(merger, 0, 0); left.connect(cross).connect(right); right.connect(merger, 0, 1);
    right.connect(feedback).connect(damp);
    merger.connect(clear).connect(this.music);
    this.echoes = [left, right];
    this.nodes.push(this.reverb, left, right, merger);
    this.setTempo(94);
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
  /** The score's tempo: the echo repeats on its dotted eighths. Set when a planet's music starts. */
  setTempo(bpm: number) {
    const dotted = 45 / bpm;
    for (const line of this.echoes) line.delayTime.setValueAtTime(dotted, this.context.currentTime);
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
  /**
   * The level bed breathes under a boss kick (a sidechain-style dip of `depth` for about a tenth of a second), so the
   * stem lands with weight instead of extra loudness. Only scheduled boss notes call it; between dips the bed rests at
   * `bedLevel`, which the boss stages lower slightly so the stem can step forward (1 outside fights).
   */
  private bedLevel = 1;
  private pump(at: number, depth: number) {
    this.bed.gain.setTargetAtTime(this.bedLevel * (1 - depth), at, .004);
    this.bed.gain.setTargetAtTime(this.bedLevel, at + .05, .085);
  }
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
    const pool = this.voices.filter(v => v.group === group && v.end > at);
    if (pool.length >= VOICE_LIMITS[group]) {
      const victim = pool.reduce((a, b) => a.priority < b.priority || (a.priority === b.priority && a.end < b.end) ? a : b);
      if (victim.priority > priority) { this.dropped++; return false; }
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
    out.connect(group === 'music' ? this.bed : group === 'boss' ? this.boss : this.effects);
    const voice: Voice = { source, gain, pan: panner, group, priority, end: at + (source.buffer.duration - skip) / rate };
    if (wet > 0 && group !== 'effects') {
      const send = this.context.createGain(); send.gain.value = wet;
      out.connect(send); send.connect(this.reverb); send.connect(this.delay); voice.send = send;
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
  /** A score note, or with `boss` a note of the additive boss stem (its own voice pool, priorities and fader). */
  note(note: Note, at: number, boss = false) {
    if (boss && !this.bossActiveAt(at)) return;
    const start = at + (note.offset ?? 0), pad = PADS.has(note.instrument);
    const priority = boss ? note.priority ?? 0 : pad ? 0 : 1;
    const played = this.play(note.instrument, start, 2 ** ((note.pitch - BASE_PITCH[note.instrument]) / 12), note.gain, note.pan,
      boss ? 'boss' : 'music', priority, note.wet, note.skip ?? 0);
    if (!played || !boss) return;
    if (note.bed !== undefined) this.setBed(note.bed, start);
    if (note.pump) this.pump(start, note.pump);
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
