import { describe, expect, it } from 'vitest';
import { createMissionNotes } from '../../src/ui/mission-board';

/** Just what the note element needs: its text and classes (no DOM in unit tests). */
function element() {
  const classes = new Set<string>();
  return { textContent: '', offsetWidth: 0, classList: { add: (c: string) => classes.add(c), remove: (...c: string[]) => c.forEach(x => classes.delete(x)), toggle: (c: string, on: boolean) => { if (on) classes.add(c); else classes.delete(c); } }, classes };
}

describe('in-flight mission notes (docs/35 § 6)', () => {
  it('shows one note at a time, throttled; newer progress replaces a queued note; completions are never dropped', () => {
    const el = element(), notes = createMissionNotes(el as unknown as HTMLElement);
    notes.push([{ id: 'a', text: 'A 1/5', complete: false }]);
    notes.frame(true, 0);
    expect(el.textContent).toBe('A 1/5');
    notes.push([{ id: 'a', text: 'A 2/5', complete: false }, { id: 'b', text: 'B DONE', complete: true }, { id: 'a', text: 'A 3/5', complete: false }]);
    notes.frame(true, 1000);
    expect(el.textContent).toBe('A 1/5'); // still showing
    notes.frame(true, 1900);
    expect(el.classes.has('is-on')).toBe(false); // shown 1.8 s, then a short gap
    notes.frame(true, 2250);
    expect(el.textContent).toBe('B DONE');
    expect(el.classes.has('is-complete')).toBe(true);
    notes.frame(true, 4500);
    expect(el.textContent).toBe('A 3/5'); // A 2/5 was replaced while queued
    // Paused: nothing shows, and nothing is lost.
    notes.push([{ id: 'c', text: 'C 1/3', complete: false }]);
    notes.frame(false, 9000);
    expect(el.classes.has('is-on')).toBe(false);
    notes.frame(true, 9100);
    expect(el.textContent).toBe('C 1/3');
    notes.clear();
    notes.frame(true, 20000);
    expect(el.classes.has('is-on')).toBe(false);
  });
});
