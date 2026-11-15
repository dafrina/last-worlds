import { describe, expect, it } from 'vitest';
import { auditMenu } from '../../src/audio/harmony-audit';
import { clash, heardWindowAt, pitchClass, UNPITCHED } from '../../src/audio/harmony';
import { BASE_PITCH, type Instrument } from '../../src/audio/instruments';
import { MENU_INSTRUMENTS, MENU_THEME, menuChord, menuMelody, menuStep } from '../../src/audio/menu-theme';
import { SAMPLE_IDS, synthesize, type UiSound } from '../../src/audio/samples';

const STEPS = MENU_THEME.bars * 16;
const fnv = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};
const pcm = (id: string) => {
  const bytes = new Uint8Array(synthesize(id as never).buffer);
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};

describe('the title theme', () => {
  it('is the approved 32-bar cycle, D minor at 100 BPM, and loops without a seam', () => {
    // A change here is a change to the composition itself (heroic and mysterious; its melody made familiar, 15 November; its drums refined, 16 November).
    const notes = Array.from({ length: STEPS }, (_, s) => menuStep(s));
    expect([fnv(JSON.stringify(notes)), notes.flat().length]).toEqual(['b7f1370d', 963]);
    expect(MENU_THEME).toMatchObject({ bpm: 100, root: 50, bars: 32 });
    for (const s of [0, 37, 255, 511]) expect(menuStep(s + STEPS)).toEqual(menuStep(s));
  });
  it('calls its hook 1-5-8 on a dotted rhythm and answers it in a familiar heroic line', () => {
    const bar = (b: number) => Array.from({ length: 16 }, (_, k) => menuMelody(b * 16 + k)).flatMap((p, k) => p === null ? [] : [[k, p]]);
    // The pickup A3, then D4, A4, D5 on a dotted quarter, an eighth and a half.
    expect(bar(3)).toEqual([[14, 57]]);
    expect(bar(4)).toEqual([[0, 62], [6, 69], [8, 74]]);
    // Answered 3-2-1 (F, E, D); rising over B♭ and C to the question on E; the call again; the climax F, G, A; down
    // B♭'s arpeggio; home on A, C, D.
    expect([5, 6, 7, 9, 10, 11].map(bar)).toEqual([
      [[0, 77], [6, 76], [8, 74]], [[0, 70], [6, 72], [8, 74]], [[0, 72], [6, 74], [8, 76], [14, 57]],
      [[0, 77], [6, 79], [8, 81]], [[0, 77], [6, 74], [8, 70]], [[0, 69], [6, 72], [8, 74]],
    ]);
    expect(bar(8)).toEqual(bar(4));
    expect(bar(20)).toEqual(bar(4));
    // D natural minor only (no E♭, no C♯, no B), at most two notes a beat, and every strong beat (the bar's first and
    // third beats) a tone of the chord sounding: D minor, B♭, C, E♭, G minor or A minor.
    const TRIAD: Record<number, number[]> = { 2: [2, 5, 9], 10: [10, 2, 5], 0: [0, 4, 7], 3: [3, 7, 10], 7: [7, 10, 2], 9: [9, 0, 4] };
    for (let s = 0; s < STEPS; s++) {
      const pitch = menuMelody(s);
      if (pitch === null) continue;
      expect([2, 4, 5, 7, 9, 10, 0], `${s}`).toContain(pitchClass(pitch));
      if (s % 8 === 0) expect(TRIAD[pitchClass(menuChord(s).root)], `${s} ${pitch}`).toContain(pitchClass(pitch));
      if (s % 4 < 3) expect(menuMelody(s + 1), `${s}`).toBeNull();
    }
    // Its phrases end home: the hook on D, the B section on A (the dominant), into the hook's pickup.
    expect(bar(11).at(-1)?.[1]).toBe(74);
    expect(bar(19)[0][1]).toBe(69);
    // No thirds under it: every chord is an open fifth (root, fifth, octave) or a suspended second (root, fifth, ninth).
    for (let b = 0; b < MENU_THEME.bars; b++) {
      const [root, ...rest] = menuChord(b * 16).tones;
      expect([[7, 12], [7, 14]], `bar ${b}`).toContainEqual(rest.map(t => t - root));
    }
    // Simple and uncluttered: about two lead notes a bar, never two at once.
    const lead = Array.from({ length: STEPS }, (_, s) => menuStep(s).filter(n => n.instrument === 'anthem').length);
    expect(Math.max(...lead)).toBe(1);
    expect(lead.reduce((a, b) => a + b, 0) / MENU_THEME.bars).toBeLessThan(2.5);
  });
  it('has no clash anywhere in its cycle, the accompaniment against itself included, and no note outside its mode', () => {
    expect(auditMenu()).toEqual([]);
    for (let s = 0; s < STEPS; s++) for (const n of menuStep(s)) {
      if (UNPITCHED.has(n.instrument) || n.instrument === 'riser') continue;
      // A reversed swell belongs to the chord it lands on.
      const { tones, scale } = menuChord(heardWindowAt(MENU_THEME.bpm, n, s).chordStep ?? s), allowed = new Set([...scale, ...tones].map(pitchClass));
      expect(allowed.has(pitchClass(n.pitch)), `${s} ${n.instrument} ${n.pitch}`).toBe(true);
    }
  });
  it('lets no note, tail, release or early reflection sound against the chord at any 32nd, across the loop too', () => {
    // 15 November polish (user: "towards the end of the bars its a bit off"). A pitched note is heard from its sample's
    // first to its last moment within 30 dB of its peak, cut short by its release (`hold`, silent 150 ms later) or by the
    // next note of its line (the lead's part, the bass), plus 90 ms of the hall's early reflections if it is sent there.
    // At every 32nd it must not grind against the chord sounding then: not one of its tones and a minor second, major
    // seventh or tritone from one. Two cycles, so tails crossing the loop's seam are heard too.
    const sixteenth = 15 / MENU_THEME.bpm, thirtySecond = sixteenth / 2, spans = new Map<Instrument, [number, number]>();
    const span = (id: Instrument) => {
      let found = spans.get(id);
      if (!found) {
        const samples = synthesize(id);
        let peak = 0;
        for (const v of samples) peak = Math.max(peak, Math.abs(v));
        const floor = peak * 10 ** (-30 / 20);
        let first = 0, last = samples.length - 1;
        while (first < last && Math.abs(samples[first]) < floor) first++;
        while (last > first && Math.abs(samples[last]) < floor) last--;
        found = [first / 32000, (last + 1) / 32000]; spans.set(id, found);
      }
      return found;
    };
    const grinds = (pitch: number, step: number) => {
      const tones = menuChord(step).tones.map(pitchClass), pc = pitchClass(pitch);
      return !tones.includes(pc) && tones.some(t => clash(pc, t) !== 0);
    };
    const heard = Array.from({ length: 2 * STEPS }, (_, s) => menuStep(s).map(note => ({ note, start: s * sixteenth + (note.offset ?? 0) })))
      .flat().filter(({ note }) => !UNPITCHED.has(note.instrument) && note.instrument !== 'riser');
    const bad = new Set<string>();
    heard.forEach(({ note, start }, k) => {
      const rate = 2 ** ((note.pitch - BASE_PITCH[note.instrument]) / 12), [first, last] = span(note.instrument), skip = note.skip ?? 0;
      let end = start + (last - skip) / rate;
      if (note.hold !== undefined) end = Math.min(end, start + note.hold + .15);
      const line = note.part ?? (note.instrument === 'round-bass' ? 'bass' : undefined);
      const next = line && heard.slice(k + 1).find(h => h.start > start + 1e-6 && (h.note.part ?? (h.note.instrument === 'round-bass' ? 'bass' : undefined)) === line);
      if (next) end = Math.min(end, next.start + (note.part ? .1 : .06));
      if (note.wet > 0) end += .09;
      for (let t = Math.ceil((start + Math.max(0, first - skip) / rate) / thirtySecond) * thirtySecond; t < end; t += thirtySecond) {
        const step = Math.floor(t / sixteenth + 1e-9);
        if (step >= STEPS && step < 2 * STEPS && grinds(note.pitch, step)) bad.add(`bar ${Math.floor((step - STEPS) / 16)} ${note.instrument} ${note.pitch}`);
      }
    });
    expect([...bad]).toEqual([]);
  });
  it('lists every voice it plays (it waits for all of them to be made), and its lead is its own sample', () => {
    const used = new Set(Array.from({ length: STEPS }, (_, s) => menuStep(s)).flat().map(n => n.instrument));
    expect([...used].every(id => MENU_INSTRUMENTS.includes(id)), [...used].join(' ')).toBe(true);
    expect(pcm('anthem')).toBe('7796e0c6');
  });
});

describe('the menu sounds', () => {
  const SOUNDS: Record<UiSound, string> = {
    'ui-press': '3cbaf211', 'ui-back': '9266461e', 'ui-select': 'f4533090', 'ui-tick': 'ea86db82', 'ui-purchase': 'ed1953c0',
    'ui-equip': '21d2ebc6', 'ui-deny': '70a1b56b',
  };
  it('are made first at boot, short and pinned', () => {
    // First in the boot order: a tap in the menu never waits for (or makes) its sound.
    expect(SAMPLE_IDS.slice(0, 7).sort()).toEqual(Object.keys(SOUNDS).sort());
    for (const [id, hash] of Object.entries(SOUNDS)) {
      const samples = synthesize(id as UiSound);
      expect(pcm(id), id).toBe(hash);
      expect(samples.length / 32000, id).toBeLessThanOrEqual(.55);
      expect(Math.max(...samples.map(Math.abs)), id).toBeLessThanOrEqual(.6);
    }
  });
});
