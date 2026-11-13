import { describe, expect, it } from 'vitest';
import { BED, BossArranger, bossStage, bossStep, switchStep, type BossStage } from '../../src/audio/boss-score';
import { modeAt, soundingSteps, UNPITCHED } from '../../src/audio/harmony';
import { BASE_PITCH, INSTRUMENT_SECONDS, LEVEL_INSTRUMENTS, RECOMPOSED_INSTRUMENTS } from '../../src/audio/instruments';
import { SAMPLE_IDS, synthesize } from '../../src/audio/samples';
import { scoreStep, SIDECHAIN, THEMES, type Note } from '../../src/audio/score';
import type { PlanetId } from '../../src/shared/contracts';

const PLANETS = Object.keys(THEMES) as PlanetId[];
const BASSES: string[] = ['bass', 'round-bass', 'foundry-bass', 'bio-bass', 'void-bass', 'drive-bass', 'growl'];
const STEPS = 512; // the full 32-bar cycle
const fnv = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};
const cycle = (planet: PlanetId, stage: BossStage) => Array.from({ length: STEPS }, (_, s) => bossStep(planet, s, stage));
/** Pitch class, rounded so that fractional (microtonal) pitches compare reliably. */
const pitchClass = (n: number) => Math.round((((n % 12) + 12) % 12) * 1e6) / 1e6 % 12;

describe('the level scores are the approved compositions, changed only where the user asked', () => {
  it('plays every note, gain, pan, send and timing of each 32-bar cycle exactly as approved', () => {
    // Fingerprints of scoreStep over steps 0–511. A change here is a change to the authored music itself, never a side
    // effect of sound design. Corona and Umbra were recomposed on 10 November (user: Corona's score was a copy; Umbra
    // "very ominous ... reversed instruments and alien harmonics"). On 11 November the user loved Umbra ("i love love
    // love the umbra sound"): it is frozen as it is (see the next test), and the user asked for the other five to be
    // reworked to its and Corona's quality, and for Corona's harp to be less regular, with an Arabic colour. Phase 5
    // (user: "just relax the amount of notes, simpler melodies"; Corona "more mysterious ... not so happy"): fewer,
    // plainer notes everywhere but Umbra, and Corona over a drone.
    const approved: Record<PlanetId, [string, number]> = {
      luna: ['e74f0442', 457], khepri: ['77f4f3dd', 627], nahara: ['36377a12', 457] /* its own, 13 November (docs/39), awaiting the user's listen */, nacre: ['94419145', 444], vesper: ['8d3fa594', 195], amnion: ['9a59f964', 378],
      corona: ['d5d2fdfa', 327], umbra: ['544dfdfb', 542],
    };
    for (const planet of PLANETS) {
      const notes = Array.from({ length: STEPS }, (_, s) => scoreStep(planet, s));
      expect([fnv(JSON.stringify(notes)), notes.flat().length], planet).toEqual(approved[planet]);
    }
    expect(PLANETS.map(p => THEMES[p].bpm)).toEqual([94, 118, 106, 88, 92, 110, 84, 90]);
  });
  it('keeps Umbra frozen, note for note and sample for sample', () => {
    // The user loved it (11 November). Its 32-bar cycle and every sample it plays are exactly as approved: its kick is
    // its own (the other worlds moved to snappier kicks), and nothing in its score keys the sidechain.
    const notes = Array.from({ length: STEPS }, (_, s) => scoreStep('umbra', s));
    expect([fnv(JSON.stringify(notes)), notes.flat().length]).toEqual(['544dfdfb', 542]);
    expect(notes.flat().some(n => n.duck || n.bend)).toBe(false);
    const pcm = (id: string) => {
      const bytes = new Uint8Array(synthesize(id as never).buffer);
      let h = 2166136261;
      for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
      return (h >>> 0).toString(16).padStart(8, '0');
    };
    const used = [...new Set(notes.flat().map(n => n.instrument))].sort();
    expect(Object.fromEntries(used.map(id => [id, pcm(id)]))).toEqual({
      glint: '6fe63243', inhale: '0f8e2e23', kick: '380d4e9a', obsidian: '42757aaf', 'void-bass': 'e5bc99b7', 'void-tick': '22ef1a1a',
    });
    for (const planet of PLANETS.filter(p => p !== 'umbra')) {
      expect(Array.from({ length: STEPS }, (_, s) => scoreStep(planet, s)).flat().some(n => n.instrument === 'kick'), planet).toBe(false);
    }
  });
  it('keys the sidechain from each world\'s kick and the fights\' kick, at the depths in its table', () => {
    for (const planet of PLANETS) {
      const kicks = Array.from({ length: STEPS }, (_, s) => scoreStep(planet, s)).flat().filter(n => n.duck);
      if (planet === 'umbra') { expect(kicks).toEqual([]); continue; }
      expect(kicks.length, planet).toBeGreaterThan(16);
      for (const n of kicks) {
        expect(n.duck!.depth, planet).toBe(SIDECHAIN[planet].level);
        expect(n.duck!.release, planet).toBeGreaterThanOrEqual(.08); expect(n.duck!.release, planet).toBeLessThanOrEqual(.15);
        expect(UNPITCHED.has(n.instrument), `${planet} ${n.instrument}`).toBe(true);
      }
      for (const stage of [1, 2, 3] as const) {
        const keyed = cycle(planet, stage).flat().filter(n => n.instrument === 'boss-kick');
        expect(keyed.length, `${planet} ${stage}`).toBeGreaterThan(0);
        for (const n of keyed) expect(n.duck?.depth, `${planet} ${stage}`).toBe(SIDECHAIN[planet].boss[stage - 1]);
      }
    }
    // Deeper in the fights than in flight, and deepest in overload; gentle in the ambient worlds.
    for (const planet of PLANETS) {
      const { level, boss } = SIDECHAIN[planet];
      expect(boss[0] <= boss[1] && boss[1] <= boss[2] && boss[0] >= level, planet).toBe(true);
    }
    expect(SIDECHAIN.vesper.level).toBeLessThan(SIDECHAIN.khepri.level);
    expect(SIDECHAIN.nacre.level).toBeLessThan(SIDECHAIN.luna.level);
  });
  it('gives Corona and Umbra scores of their own voices, apart from the worlds around them', () => {
    const voices = (planet: PlanetId) => new Set(Array.from({ length: STEPS }, (_, s) => scoreStep(planet, s)).flat().map(n => n.instrument));
    const corona = voices('corona'), umbra = voices('umbra');
    for (const id of ['harp', 'harp-high', 'solar', 'bowed', 'ember', 'doum', 'tek']) expect(corona.has(id as never), id).toBe(true);
    for (const id of ['inhale', 'glint', 'obsidian', 'void-bass', 'void-tick']) expect(umbra.has(id as never), id).toBe(true);
    // No borrowed lead, pad or signature voice from Khepri, Vesper, Amnion or each other.
    for (const id of ['saw-lead', 'foundry-bass', 'anvil', 'glass', 'frost', 'pearl', 'nerve', 'breath-pad', 'heart', 'bone']) {
      expect(corona.has(id as never) || umbra.has(id as never), id).toBe(false);
    }
    expect([...corona].some(id => umbra.has(id))).toBe(false);
    // Umbra's harmony leaves the twelve-note grid: harmonic-series tones and quarter-tone melody steps.
    expect(Array.from({ length: STEPS }, (_, s) => scoreStep('umbra', s)).flat().some(n => !Number.isInteger(n.pitch))).toBe(true);
  });
  it('lands Umbra\'s reversed voices exactly on the grid', () => {
    const sixteenth = 15 / THEMES.umbra.bpm;
    for (let step = 0; step < STEPS; step++) {
      for (const n of scoreStep('umbra', step).filter(n => n.instrument === 'inhale' || n.instrument === 'glint')) {
        // Where it stops, measured from this step's downbeat, in sixteenths: always a whole number, at least one ahead.
        const seconds = INSTRUMENT_SECONDS[n.instrument] / 2 ** ((n.pitch - BASE_PITCH[n.instrument]) / 12);
        const lands = ((n.offset ?? 0) + seconds) / sixteenth;
        expect(Math.abs(lands - Math.round(lands)), `${step} ${n.instrument}`).toBeLessThan(1e-6);
        expect(lands).toBeGreaterThanOrEqual(1);
        if (n.instrument === 'inhale') expect((step + Math.round(lands)) % 16, `${step}`).toBe(0);
      }
    }
  });
  it('keeps the level instruments sounding at the notes they were written for', () => {
    // Same base notes as the 20 October mapping, so every authored pitch lands where it did.
    for (const id of LEVEL_INSTRUMENTS.filter(id => !(RECOMPOSED_INSTRUMENTS as string[]).includes(id))) {
      const old = id.endsWith('bass') || id === 'kick' || id === 'heart' ? 36 : ['pad', 'bloom-pad', 'breath-pad', 'void-air'].includes(id) ? 48 : 60;
      expect(BASE_PITCH[id], id).toBe(old);
    }
  });
});

describe('four musically distinct boss states', () => {
  it('maps the simulation phases onto flight, modules, core and overload', () => {
    expect([undefined, 'arrival', 'batteries', 'core', 'overload', 'destroyed'].map(p => bossStage(p as never))).toEqual([0, 1, 1, 2, 3, 0]);
    expect(cycle('luna', 0).flat()).toEqual([]);
  });
  it('grows by arrangement in every world: denser subdivisions, new layers, new voices per stage', () => {
    for (const planet of PLANETS) {
      const [modules, core, overload] = ([1, 2, 3] as const).map(stage => cycle(planet, stage));
      const count = (c: Note[][]) => c.flat().length;
      expect(count(core), planet).toBeGreaterThan(count(modules) * 1.3);
      expect(count(overload), planet).toBeGreaterThan(count(core) * 1.4);
      // Off-beat sixteenths: sparse in modules, nearly all of them in overload (its ostinato rests only where no chord
      // tone sits with the melody's passing note).
      const odd = (c: Note[][]) => c.filter((notes, s) => s % 2 === 1 && notes.length > 0).length / (STEPS / 2);
      expect(odd(overload), planet).toBeGreaterThan(.95);
      expect(odd(modules), planet).toBeLessThan(odd(overload));
      // The bass: long notes in modules, then eighths (plus the riff's own notes), never sixteenths.
      const bassSteps = (c: Note[][]) => c.filter(notes => notes.some(n => BASSES.includes(n.instrument))).length;
      expect(bassSteps(modules), planet).toBeLessThan(bassSteps(core) / 2);
      expect(bassSteps(overload), planet).toBeGreaterThan(STEPS / 2 * .9);
      expect(bassSteps(overload), planet).toBeLessThan(STEPS * .8);
      // The spiccato strings: a pulse on the beat, then the ostinato, then the ostinato doubled over low sixteenths.
      const strokes = (c: Note[][]) => c.flat().filter(n => n.instrument === 'spiccato').length;
      expect(strokes(core), planet).toBeGreaterThan(strokes(modules) * 1.9);
      expect(strokes(overload), planet).toBeGreaterThan(strokes(core) * 1.9);
      // Layers each state introduces.
      const voices = (c: Note[][]) => new Set(c.flat().map(n => n.instrument));
      for (const id of ['timpani', 'strings', 'spiccato', 'braam', 'tom']) expect(voices(modules).has(id as never), `${planet} ${id}`).toBe(true);
      expect(voices(core).has('stab'), planet).toBe(true);
      for (const accent of ['stab', 'boom', 'crash', 'braam', 'riser']) expect(voices(overload).has(accent as never), `${planet} ${accent}`).toBe(true);
      for (const accent of ['boom', 'crash', 'riser']) expect(voices(core).has(accent as never), `${planet} ${accent}`).toBe(false);
    }
  });
  it('sounds like an orchestra, not a drum machine: no kick, hats or claps, and the snare only fills into a phrase', () => {
    for (const planet of PLANETS) for (const stage of [1, 2, 3] as const) {
      const c = cycle(planet, stage), used = new Set(c.flat().map(n => n.instrument));
      for (const id of ['kick', 'hat']) expect(used.has(id as never), `${planet} ${stage} ${id}`).toBe(false);
      c.forEach((notes, s) => {
        const bar = Math.floor(s / 16) % 8, beat = s % 16;
        const fill = (bar === 7 && beat >= 12) || (stage === 2 && bar % 4 === 3 && beat >= 14);
        if (!fill) expect(notes.some(n => n.instrument === 'snare' || n.instrument === 'brush'), `${planet} ${stage} ${s}`).toBe(false);
      });
      // The big drum never marks all four beats of a bar with nothing between: no four-on-the-floor.
      const drum = (s: number) => c[s].some(n => ['taiko', 'heart', 'doum', 'boss-kick'].includes(n.instrument));
      for (let bar = 0; bar < STEPS / 16; bar++) {
        const on = [0, 4, 8, 12].every(b => drum(bar * 16 + b)), between = [2, 6, 10, 14].some(b => drum(bar * 16 + b));
        expect(on && !between, `${planet} ${stage} bar ${bar}`).toBe(false);
      }
    }
  });
  it('keeps each world recognisable in its boss stem', () => {
    const signatures = PLANETS.map(planet => JSON.stringify(cycle(planet, 2)));
    expect(new Set(signatures).size).toBe(PLANETS.length);
    const uses = (planet: PlanetId, instrument: string) => cycle(planet, 2).flat().some(n => n.instrument === instrument);
    expect(uses('luna', 'brush') && uses('nacre', 'brush')).toBe(true);
    expect(uses('khepri', 'anvil')).toBe(true);
    expect(uses('amnion', 'heart') && uses('amnion', 'bone') && uses('amnion', 'bio-bass') && !uses('amnion', 'taiko')).toBe(true);
    expect(uses('umbra', 'void-tick') && uses('umbra', 'void-bass') && uses('umbra', 'inhale')).toBe(true);
    expect(uses('corona', 'doum') && uses('corona', 'tek')).toBe(true);
    expect(uses('nahara', 'stone-drum') && uses('nahara', 'rattle')).toBe(true);
    // The spacious worlds keep their core ostinato in eighths.
    for (const planet of ['vesper', 'umbra'] as const) {
      expect(cycle(planet, 2).some((notes, s) => s % 2 === 1 && notes.some(n => n.instrument === 'spiccato')), planet).toBe(false);
    }
    // Umbra's overload sucks reversed glass into every beat.
    expect(cycle('umbra', 3).flat().filter(n => n.instrument === 'glint').length).toBeGreaterThanOrEqual(STEPS / 4 - 2);
    // Luna's stem keeps the score's played timing.
    expect(cycle('luna', 2).flat().some(n => (n.offset ?? 0) > .01)).toBe(true);
    expect(cycle('khepri', 2).flat().every(n => !n.offset || n.instrument === 'snare')).toBe(true);
  });
  it('never doubles the level lead or pads, and never steps outside the harmony', () => {
    const leads = ['frost', 'pearl', 'signal', 'bloom-pad', 'breath-pad', 'piano', 'glass', 'saw-lead', 'harp', 'harp-high', 'solar', 'obsidian'];
    for (const planet of PLANETS) {
      const theme = THEMES[planet];
      for (const stage of [1, 2, 3] as const) {
        for (let step = 0; step < STEPS; step++) {
          const chord = theme.chords[Math.floor(step / 32) % 4], root = theme.root + chord[0];
          const allowed = new Set(chord.map(c => pitchClass(theme.root + c)));
          const riff = theme.bass[step % 16];
          for (const n of bossStep(planet, step, stage)) {
            expect(leads.includes(n.instrument), `${planet} ${n.instrument}`).toBe(false);
            expect(Number.isFinite(n.pitch) && n.gain > 0 && n.gain <= .5, planet).toBe(true);
            // A note still heard after the next chord change may instead be a tone of the mode common to both chords.
            const crosses = Math.floor((step + soundingSteps(planet, n) - 1) / 32) !== Math.floor(step / 32);
            const fits = allowed.has(pitchClass(n.pitch)) || (crosses && modeAt(planet, step).has(pitchClass(n.pitch)));
            if (BASSES.includes(n.instrument) || ['boom', 'braam', 'timpani'].includes(n.instrument)) {
              // Bass, booms and timpani, centred: the level riff where it plays (unless that would clash with the
              // melody), otherwise a tone of the current chord.
              const interval = n.pitch - (root - 12);
              if (riff >= 0 && BASSES.includes(n.instrument) && interval === riff) continue;
              expect(fits, `${planet} ${step} ${n.instrument}`).toBe(true);
              expect(n.pan).toBe(0);
            } else if (['strings', 'stab', 'spiccato', 'tom'].includes(n.instrument)) {
              expect(fits, `${planet} ${step} ${n.instrument} ${n.pitch}`).toBe(true);
            } else if (n.instrument === 'inhale' || n.instrument === 'glint') {
              // A reversed voice is emitted early and belongs to the chord it stops on.
              const seconds = INSTRUMENT_SECONDS[n.instrument] / 2 ** ((n.pitch - BASE_PITCH[n.instrument]) / 12);
              const landing = step + Math.round(((n.offset ?? 0) + seconds) * theme.bpm / 15);
              const landed = theme.chords[Math.floor(landing / 32) % 4];
              expect(landed.map(c => pitchClass(theme.root + c)), `${planet} ${step} ${n.instrument}`).toContain(pitchClass(n.pitch));
            }
          }
        }
      }
    }
  });
  it('lets the level score step back a little as the stem takes the weight', () => {
    expect([...BED]).toEqual([1, 1, .94, .84]);
    for (const stage of [1, 2, 3] as const) expect(bossStep('vesper', 32, stage)[0].bed).toBe(BED[stage]);
    expect(bossStep('vesper', 33, 3).every(n => n.bed === undefined)).toBe(true);
  });
});

describe('transitions on the score clock', () => {
  const lead = (notes: Note[]) => notes.map(n => n.instrument);
  it('lands every change on the grid after the sixteenths already scheduled, never restarting anything', () => {
    for (let next = 0; next < 64; next++) {
      const entrance = switchStep(0, 1, next), core = switchStep(1, 2, next), overload = switchStep(2, 3, next);
      expect(entrance % 16).toBe(0); expect(entrance - next).toBeGreaterThanOrEqual(6); expect(entrance - next).toBeLessThan(22);
      expect(core % 4).toBe(0); expect(core - next).toBeGreaterThanOrEqual(2); expect(core - next).toBeLessThan(6);
      expect(overload % 8).toBe(0); expect(overload - next).toBeGreaterThanOrEqual(4); expect(overload - next).toBeLessThan(12);
    }
  });
  it('plays each stage from its switch, with a distinct stinger into each and a riser that peaks on the hit', () => {
    for (const planet of PLANETS) {
      const boss = new BossArranger(), bpm = THEMES[planet].bpm, sixteenth = 15 / bpm;
      // Arrival observed while sixteenth 101 was the first not yet scheduled: the entrance lands on bar line 112.
      boss.request(1, 101);
      expect(boss.target).toBe(1); expect(boss.pending(101)?.at).toBe(112);
      expect(boss.stageAt(111)).toBe(0); expect(boss.stageAt(112)).toBe(1);
      const riser = boss.notes(planet, 101).find(n => n.instrument === 'riser')!;
      // Played at the landing chord's root, so its length is the sample's over its rate (`skip` is in sample seconds).
      expect((riser.offset ?? 0) + (INSTRUMENT_SECONDS.riser - (riser.skip ?? 0)) / 2 ** ((riser.pitch - 60) / 12)).toBeCloseTo(11 * sixteenth, 9);
      expect(modeAt(planet, 112).has(pitchClass(riser.pitch)), planet).toBe(true);
      // Before the entrance only the stinger's lead-in sounds: no stem yet.
      for (let s = 101; s < 112; s++) expect(boss.notes(planet, s).every(n => ['riser', 'tom'].includes(n.instrument)), `${planet} ${s}`).toBe(true);
      const entrance = lead(boss.notes(planet, 112));
      expect(entrance).toEqual(expect.arrayContaining(['crash', 'boom', 'braam']));
      // Batteries is the same stage: nothing changes.
      boss.request(1, 140); expect(boss.pending(140)).toBeUndefined();
      // Core on the next beat with room for a pickup.
      boss.request(2, 161);
      expect(boss.pending(161)?.at).toBe(164); expect(boss.stageAt(163)).toBe(1); expect(boss.stageAt(164)).toBe(2);
      const core = lead(boss.notes(planet, 164));
      expect(core).toEqual(expect.arrayContaining(['crash', 'stab', 'boom'])); expect(core).not.toContain('braam');
      // Overload on the next half bar: riser, roll, one sixteenth of silence in the stem, then its own hit.
      boss.request(3, 205);
      expect(boss.pending(205)?.at).toBe(216);
      expect(boss.notes(planet, 205).some(n => n.instrument === 'riser')).toBe(true);
      expect(boss.notes(planet, 215).every(n => n.priority === 3), planet).toBe(true);
      const overload = boss.notes(planet, 216);
      expect(lead(overload)).toEqual(expect.arrayContaining(['crash', 'boom', 'braam', 'stab', 'timpani']));
      expect(overload.filter(n => n.instrument === 'stab')).toHaveLength(4);
      expect(overload.some(n => n.bed === BED[3])).toBe(true);
      expect(boss.stageAt(216)).toBe(3);
      // The kill: the stem keeps playing its last stage for the bar its fader closes over, then rests.
      boss.request(0, 300);
      expect(boss.stageAt(315)).toBe(3); expect(boss.stageAt(316)).toBe(0);
      expect(boss.notes(planet, 330)).toEqual([]);
    }
  });
  it('lets a quick second phase take over a pending switch, and skips stingers the clock jumped past', () => {
    const boss = new BossArranger();
    boss.request(1, 3); boss.request(2, 5);
    // Core asked for during the entrance riser: the same bar line, the entrance hit, straight into core.
    expect(boss.pending(5)?.at).toBe(16); expect(boss.stageAt(16)).toBe(2);
    expect(lead(boss.notes('nacre', 16))).toEqual(expect.arrayContaining(['braam']));
    // A resumed clock re-enters at a chord boundary far ahead: no backlog of stingers, just the stage in force.
    boss.request(3, 40);
    expect(boss.notes('nacre', 96).filter(n => n.priority === 3 && n.instrument !== 'riser')).toEqual([]);
    expect(boss.stageAt(96)).toBe(3);
    boss.reset();
    expect(boss.target).toBe(0); expect(boss.notes('nacre', 96)).toEqual([]);
  });
  it('is a pure observer: requests never change the level score', () => {
    const before = Array.from({ length: 64 }, (_, s) => scoreStep('corona', s));
    const boss = new BossArranger();
    for (let s = 0; s < 64; s++) { boss.request(((s / 8) | 0) % 4 as BossStage, s); boss.notes('corona', s); }
    expect(Array.from({ length: 64 }, (_, s) => scoreStep('corona', s))).toEqual(before);
  });
});

describe('synthesized instruments', () => {
  it('are finite, deterministic, peak-limited and DC-free, within the cached-PCM budget', () => {
    let bytes = 0;
    for (const id of SAMPLE_IDS) {
      const pcm = synthesize(id); bytes += pcm.byteLength;
      let peak = 0, sum = 0;
      for (const value of pcm) {
        if (!Number.isFinite(value)) throw new Error(`${id} has a non-finite sample`);
        peak = Math.max(peak, Math.abs(value)); sum += value;
      }
      expect(peak, id).toBeLessThanOrEqual(.851);
      expect(peak, id).toBeGreaterThan(.05);
      expect(Math.abs(sum / pcm.length), id).toBeLessThan(.002);
    }
    expect(synthesize('frost')).toEqual(synthesize('frost'));
    // 8.9 MiB before the boss instruments and the recomposed worlds' voices; 12.3 MiB with the 11 November orchestral
    // voices (taiko, timpani, spiccato) and the longer glass and harp; 13.4 MiB with the reworked worlds' voices; 14.3 MiB
    // with Nahara's own (13 November: its horn, choir, stone drum, sistrum and crystal).
    expect(bytes).toBeLessThan(15 * 1024 * 1024);
  });
  it('rise to their peak at the very end only for the riser, which must land on a downbeat', () => {
    const riser = synthesize('riser'), quarter = Math.floor(riser.length / 4);
    const level = (from: number, to: number) => Math.sqrt(riser.subarray(from, to).reduce((s, v) => s + v * v, 0) / (to - from));
    expect(level(riser.length - quarter, riser.length)).toBeGreaterThan(level(0, quarter) * 8);
  });
});
