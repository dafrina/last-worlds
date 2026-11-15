import { describe, expect, it } from 'vitest';
import { auditMenu } from '../../src/audio/harmony-audit';
import { heardWindowAt, pitchClass, UNPITCHED } from '../../src/audio/harmony';
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
    // A change here is a change to the composition itself (the second take, heroic and mysterious, 15 November).
    const notes = Array.from({ length: STEPS }, (_, s) => menuStep(s));
    expect([fnv(JSON.stringify(notes)), notes.flat().length]).toEqual(['66b54e4b', 827]);
    expect(MENU_THEME).toMatchObject({ bpm: 100, root: 50, bars: 32 });
    for (const s of [0, 37, 255, 511]) expect(menuStep(s + STEPS)).toEqual(menuStep(s));
  });
  it('calls its hook with a rising fourth, fifth and fourth to the octave on a dotted rhythm, over open fifths', () => {
    const bar = (b: number) => Array.from({ length: 16 }, (_, k) => menuMelody(b * 16 + k)).flatMap((p, k) => p === null ? [] : [[k, p]]);
    // The pickup A3, then D4, A4, D5 on a dotted quarter, an eighth and a half.
    expect(bar(3)).toEqual([[14, 57]]);
    expect(bar(4)).toEqual([[0, 62], [6, 69], [8, 74]]);
    // Answered E–F–D, called again from F over B♭, answered G–F–D; the second time the answer lands on E♭ over E♭.
    expect(bar(5)).toEqual([[0, 76], [6, 77], [8, 74], [14, 60]]);
    expect(bar(6)).toEqual([[0, 65], [6, 72], [8, 77]]);
    expect(bar(11)).toEqual([[0, 79], [6, 77], [8, 75]]);
    expect(bar(8)).toEqual(bar(4));
    expect(bar(20)).toEqual(bar(4));
    // No thirds under it: every chord is an open fifth (root, fifth, octave) or a suspended fourth.
    for (let b = 0; b < MENU_THEME.bars; b++) {
      const [root, ...rest] = menuChord(b * 16).tones;
      expect([[7, 12], [5, 12]], `bar ${b}`).toContainEqual(rest.map(t => t - root));
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
  it('lists every voice it plays (it waits for all of them to be made), and its lead is its own sample', () => {
    const used = new Set(Array.from({ length: STEPS }, (_, s) => menuStep(s)).flat().map(n => n.instrument));
    expect([...used].every(id => MENU_INSTRUMENTS.includes(id)), [...used].join(' ')).toBe(true);
    expect(pcm('anthem')).toBe('f5e03902');
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
