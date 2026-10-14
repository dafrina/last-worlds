import { describe, expect, it } from 'vitest';
import { createControlState } from '../../src/input/controls';

describe('pointer and keyboard ownership', () => {
  it('ignores a repeated pointer-down for a pointer that is already held', () => {
    const input = createControlState();
    input.pointerDown(7, 'left');
    input.pointerDown(7, 'right');
    expect(input.sample().horizontal).toBe(-1);
    input.pointerUp(7);
    input.pointerDown(7, 'right');
    expect(input.sample().horizontal).toBe(1);
  });

  it('switches direction when a held steering finger slides across the middle', () => {
    const input = createControlState();
    input.pointerDown(3, 'left');
    expect(input.sample().horizontal).toBe(-1);
    input.pointerMove(3, 'right');
    expect(input.sample().horizontal).toBe(1);
    input.pointerMove(3, 'left');
    expect(input.sample().horizontal).toBe(-1);
    // A second finger held on the other side still neutralises, and lifting it restores the switched finger.
    input.pointerDown(4, 'right');
    expect(input.sample().horizontal).toBe(0);
    input.pointerUp(4);
    expect(input.sample().horizontal).toBe(-1);
  });

  it('never lets the special button pointer steer, even when it moves', () => {
    const input = createControlState();
    input.pointerDown(9, 'special');
    input.pointerMove(9, 'left');
    expect(input.roleOf(9)).toBe('special');
    expect(input.sample().horizontal).toBe(0);
  });

  it('allows special while steering and makes opposing fingers neutral', () => {
    const input = createControlState();
    input.pointerDown(1, 'left');
    input.pointerDown(2, 'special');
    expect(input.sample()).toEqual({ horizontal: -1, specialPressed: true, pausePressed: false });
    expect(input.sample().specialPressed).toBe(false);
    input.pointerDown(3, 'right');
    expect(input.sample().horizontal).toBe(0);
    input.pointerUp(1);
    expect(input.sample().horizontal).toBe(1);
    input.pointerUp(2);
    expect(input.sample().horizontal).toBe(1);
  });

  it('does not lose a held side when another finger on that same side lifts', () => {
    const input = createControlState();
    input.pointerDown(1, 'left');
    input.pointerDown(2, 'left');
    input.pointerUp(1);
    expect(input.sample().horizontal).toBe(-1);
  });

  it('combines keyboard and touch without allowing repeated special activations', () => {
    const input = createControlState();
    input.pointerDown(1, 'right');
    input.keyDown('KeyA');
    expect(input.sample().horizontal).toBe(0);
    input.keyDown('Space');
    expect(input.sample().specialPressed).toBe(true);
    input.keyDown('Space', true);
    expect(input.sample().specialPressed).toBe(false);
    input.keyUp('Space');
    input.keyDown('Space');
    expect(input.sample().specialPressed).toBe(true);
  });

  it('clears every held and queued action on interruption', () => {
    const input = createControlState();
    input.pointerDown(1, 'left');
    input.pointerDown(2, 'special');
    input.keyDown('KeyD');
    input.keyDown('Escape');
    input.clear();
    expect(input.sample()).toEqual({ horizontal: 0, specialPressed: false, pausePressed: false });
    input.pointerUp(1);
    input.keyUp('KeyD');
    expect(input.sample().horizontal).toBe(0);
  });
});
