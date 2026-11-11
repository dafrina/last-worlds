/** Offline-render helpers for the audio lab: WAV encoding and level measurements. Development fixture only. */

export interface RenderMetrics {
  seconds: number; peak: number; rms: number; monoRms: number; clipped: number; nonFinite: number;
  /** Per second: full band, low band (below 180 Hz), phone band (300 Hz–4 kHz) and air (above 6 kHz), mono. */
  windows: { rms: number; bassRms: number; midRms: number; highRms: number }[];
}

/** One-pole coefficient for a cutoff in Hz. */
const pole = (hz: number, rate: number) => 1 - Math.exp(-2 * Math.PI * hz / rate);

export function measure(result: AudioBuffer): RenderMetrics {
  const left = result.getChannelData(0), right = result.getChannelData(1), rate = result.sampleRate;
  let peak = 0, sum = 0, mono = 0, clipped = 0, nonFinite = 0;
  for (let i = 0; i < left.length; i++) {
    if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) { nonFinite++; continue; }
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    sum += left[i] ** 2 + right[i] ** 2;
    mono += ((left[i] + right[i]) / 2) ** 2;
    if (Math.abs(left[i]) >= 1 || Math.abs(right[i]) >= 1) clipped++;
  }
  const windows: RenderMetrics['windows'] = [];
  const bassA = pole(180, rate), midLowA = pole(300, rate), midHighA = pole(4000, rate), airA = pole(6000, rate);
  let bassLow = 0, midLow = 0, midHigh = 0, air = 0;
  for (let start = 0; start < left.length; start += rate) {
    let full = 0, bass = 0, mid = 0, high = 0;
    const end = Math.min(start + rate, left.length);
    for (let i = start; i < end; i++) {
      const m = Number.isFinite(left[i] + right[i]) ? (left[i] + right[i]) / 2 : 0;
      bassLow += bassA * (m - bassLow);
      midLow += midLowA * (m - midLow); midHigh += midHighA * (m - midHigh);
      air += airA * (m - air);
      const band = midHigh - midLow, top = m - air;
      full += m * m; bass += bassLow * bassLow; mid += band * band; high += top * top;
    }
    const n = end - start;
    windows.push({ rms: Math.sqrt(full / n), bassRms: Math.sqrt(bass / n), midRms: Math.sqrt(mid / n), highRms: Math.sqrt(high / n) });
  }
  return { seconds: left.length / rate, peak, rms: Math.sqrt(sum / left.length / 2), monoRms: Math.sqrt(mono / left.length), clipped, nonFinite, windows };
}

/** Stereo PCM16 WAV, base64, for local review; these previews are not runtime downloads. */
export function wav(result: AudioBuffer): string {
  const left = result.getChannelData(0), right = result.getChannelData(1), rate = result.sampleRate;
  const bytes = new Uint8Array(44 + result.length * 4), view = new DataView(bytes.buffer);
  const str = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, result.length * 4, true);
  for (let i = 0; i < result.length; i++) {
    view.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, left[i] || 0)) * 32767), true);
    view.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, right[i] || 0)) * 32767), true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export type PreviewPhase = 'arrival' | 'batteries' | 'core' | 'overload' | 'destroyed' | null;
/** A planned offline render, measured in bars of the planet's own tempo so every world plays the same musical span. */
export interface PreviewJob {
  planet: string; bars: number;
  /** Score position of the excerpt's first sixteenth (128 = the developed second phrase). */
  startStep?: number;
  /** Boss phases as the game would report them, in bars from the excerpt's start. `immediate` puts that phase's
   * arrangement in place at once, without its stinger (steady-state excerpts). */
  phases?: { bar: number; phase: PreviewPhase; immediate?: boolean }[];
  /** Also play the game's boss effect cues at those moments (arrival, phase, kill, death roar). */
  cues?: boolean;
  /** Weapon volleys, explosions and a shield break over the music: combat clarity. */
  combat?: boolean;
  /** Analysis only: render the boss stem without the level score. */
  stemOnly?: boolean;
  /** Any other effect cues, in seconds from the render's start (sound-effect previews); `transpose` in semitones. */
  extra?: { at: number; sound: string; gain: number; pan: number; transpose?: number }[];
}
export type PreviewCue = { at: number; sound: 'boss-arrival' | 'boss-phase' | 'heavy' | 'boss-death' | 'pulse' | 'explosion' | 'shield-break'; gain: number; pan: number };

/** The first sixteenth sounds this long after the render starts. */
export const START = .05;

/** The effect cues the game's observer (src/audio/events.ts) plays for these phase changes, plus optional combat. */
export function previewCues(job: PreviewJob, barSeconds: number, seconds: number) {
  const cues: PreviewCue[] = [];
  let previous: PreviewPhase = null;
  for (const { bar, phase } of job.cues ? job.phases ?? [] : []) {
    const at = START + bar * barSeconds;
    if (phase === previous) continue;
    if (phase === 'destroyed') cues.push({ at, sound: 'heavy', gain: .9, pan: 0 }, { at: at + 2.4, sound: 'boss-death', gain: 1, pan: 0 });
    else if (phase && !previous) cues.push({ at, sound: 'boss-arrival', gain: 1, pan: 0 });
    else if (phase) cues.push({ at, sound: 'boss-phase', gain: .8, pan: 0 });
    previous = phase;
  }
  if (job.combat) {
    for (let i = 0, at = .3; at < seconds - 1; i++, at = .3 + i * .26) {
      cues.push({ at, sound: i % 7 === 6 ? 'explosion' : 'pulse', gain: i % 7 === 6 ? .8 : 1, pan: Math.sin(i) * .3 });
    }
    cues.push({ at: seconds * .55, sound: 'shield-break', gain: 1, pan: 0 });
  }
  return cues.sort((a, b) => a.at - b.at);
}

/** The live score schedules 120 ms ahead: a step is decided this long before it sounds (src/audio/score.ts ScoreClock). */
export const LOOKAHEAD = .12;
