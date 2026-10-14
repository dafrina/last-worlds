import { describe, expect, it } from 'vitest';
import { createControlState } from '../../src/input/controls';

describe('pointer and keyboard ownership', () => {
  it('keeps the initial steering side until that pointer is released', () => {
    const input = createControlState();
    input.pointerDown(7, 'left');
    input.pointerDown(7, 'right');
    expect(input.sample().horizontal).toBe(-1);
    input.pointerUp(7);
    input.pointerDown(7, 'right');
    expect(input.sample().horizontal).toBe(1);
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
