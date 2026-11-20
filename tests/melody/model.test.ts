import { describe, expect, it } from 'vitest';
import { scoreStep } from '../../src/audio/score';
import { menuStep } from '../../src/audio/menu-theme';
import { SONG_IDS, STEPS, edited, loadForm, notesAt, pitchName, saveForm, song, templateAt, type LineNote } from '../../src/melody/model';

const key = (notes: readonly object[]) => notes.map(n => JSON.stringify(n, Object.keys(n).sort())).sort();

describe('melody editor model', () => {
  it.each(SONG_IDS)('%s unedited plays exactly the score, every sixteenth of its 32 bars', id => {
    const target = song(id);
    expect(target.original.length).toBeGreaterThan(8);
    for (let step = 0; step < STEPS; step++) {
      const score = id === 'title' ? menuStep(step) : scoreStep(id, step);
      expect(key(notesAt(target, step, target.original))).toEqual(key(score));
    }
    expect(edited(target, target.original)).toBe(false);
  });

  it('moves an edited note and the notes that double it, and leaves the accompaniment alone', () => {
    // Corona's return doubles the lament's tonic an octave down; the doubling follows the edited note.
    const corona = song('corona');
    const doubled = corona.original.find(n => corona.companions[n.step].length > 0)!;
    const line = corona.original.map(n => (n === doubled ? { ...n, pitch: n.pitch + 2 } : n));
    const before = notesAt(corona, doubled.step, corona.original), after = notesAt(corona, doubled.step, line);
    const lead = after.find(n => n.part === 'lead')!, double = after.find(n => n.instrument === 'harp-high' && !n.part)!;
    expect(lead.pitch).toBe(doubled.pitch + 2);
    expect(double.pitch).toBe(lead.pitch - 12);
    expect(key(after.filter(n => n.instrument !== 'harp-high'))).toEqual(key(before.filter(n => n.instrument !== 'harp-high')));
    expect(edited(corona, line)).toBe(true);
  });

  it('plays only the accompaniment or only the lead on request', () => {
    const nacre = song('nacre'), step = nacre.original[0].step;
    expect(notesAt(nacre, step, nacre.original, { lead: false }).some(n => n.part === 'lead')).toBe(false);
    expect(notesAt(nacre, step, nacre.original, { accompaniment: false }).every(n => n.part === 'lead')).toBe(true);
  });

  it('saves edits readably and loads them back with the score notes at their places', () => {
    const luna = song('luna');
    const line: LineNote[] = [...luna.original.slice(1), { step: 3, pitch: 69.5, gain: .1, template: templateAt(luna, 3) }];
    const saved = saveForm(new Map([['luna', { line, comment: 'softer opening' }]]), new Date('2026-11-20T12:00:00Z'));
    const first = saved.songs.luna!.notes[0];
    expect(first).toEqual({ step: 3, bar: 1, sixteenth: 3, pitch: 69.5, name: 'A4 +50¢', gain: .1 });
    expect(saved.songs.luna!.comment).toBe('softer opening');
    const loaded = loadForm(JSON.parse(JSON.stringify(saved))).get('luna')!;
    expect(loaded.comment).toBe('softer opening');
    expect(loaded.line.map(n => [n.step, n.pitch, n.gain])).toEqual(saved.songs.luna!.notes.map(n => [n.step, n.pitch, n.gain]));
    // A note where the score had one plays as that note; a new place takes the nearest note's sound without its slide.
    expect(loaded.line.find(n => n.step === luna.original[1].step)!.template).toBe(luna.original[1].template);
    expect(loaded.line.find(n => n.step === 3)!.template.instrument).toBe('piano');
  });

  it('skips unknown songs and malformed notes when loading', () => {
    const loaded = loadForm({ songs: { umbra: { notes: [] }, nacre: { notes: [{ step: 600, pitch: 60, gain: .1 }, { step: 4, pitch: 'x', gain: .1 }, { step: 4, pitch: 62, gain: .12 }] } } });
    expect([...loaded.keys()]).toEqual(['nacre']);
    expect(loaded.get('nacre')!.line.map(n => n.step)).toEqual([4]);
  });

  it('names pitches with their cents off the grid', () => {
    expect(pitchName(60)).toBe('C4');
    expect(pitchName(70)).toBe('B♭4');
    expect(pitchName(65.5)).toBe('F4 +50¢');
  });
});
