import { describe, expect, it } from 'vitest';
import { DRAG_DEAD, DRAG_RESPONSE, createControlState, dragSteer } from '../../src/input/controls';

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

describe('drag steering (relative to the first touch, user 15 November)', () => {
  const view = { worldPerPx: 0.05 }; // 20 px of finger travel = 1 world unit
  it('steers toward the ship x at touch-down plus the finger travel, and settles in the dead zone', () => {
    const input = createControlState();
    input.dragDown(1, 200, 2);
    // No travel yet: the target is where the ship was, so a ship still there does not move.
    expect(input.sample({ shipX: 2, ...view }).horizontal).toBe(0);
    input.dragMove(1, 260); // +3 units: target 5
    expect(input.sample({ shipX: 2, ...view }).horizontal).toBe(1);
    expect(input.sample({ shipX: 4.7, ...view }).horizontal).toBeCloseTo(dragSteer(5, 4.7));
    expect(input.sample({ shipX: 5 - DRAG_DEAD / 2, ...view }).horizontal).toBe(0);
    input.dragMove(1, 140); // −3 units from the start: target −1, the ship at 5 goes left
    expect(input.sample({ shipX: 5, ...view }).horizontal).toBe(-1);
  });

  it('stops on release, re-anchors on the next touch, and leaves the special pointer and keys their roles', () => {
    const input = createControlState();
    input.dragDown(1, 100, 0);
    input.dragMove(1, 200);
    expect(input.sample({ shipX: 0, ...view }).horizontal).toBe(1);
    input.pointerUp(1);
    expect(input.sample({ shipX: 3, ...view }).horizontal).toBe(0);
    // A new touch anchors to the ship's x now, not to the old finger.
    input.dragDown(2, 300, 3);
    expect(input.sample({ shipX: 3, ...view }).horizontal).toBe(0);
    // The special button's pointer fires without steering; a held key wins over the drag.
    input.pointerDown(9, 'special');
    const frame = input.sample({ shipX: 3, ...view });
    expect(frame.specialPressed).toBe(true); expect(frame.horizontal).toBe(0);
    input.dragMove(2, 400);
    input.keyDown('ArrowLeft');
    expect(input.sample({ shipX: 3, ...view }).horizontal).toBe(-1);
    input.keyUp('ArrowLeft');
    expect(input.sample({ shipX: 3, ...view }).horizontal).toBe(1);
  });

  it('ignores a drag touch-down outside a flight (no ship x)', () => {
    const input = createControlState();
    input.dragDown(1, 100, null);
    input.dragMove(1, 300);
    expect(input.sample({ shipX: 0, ...view }).horizontal).toBe(0);
  });

  it('maps the proportional share: full beyond DRAG_RESPONSE, zero within DRAG_DEAD', () => {
    expect(dragSteer(DRAG_RESPONSE * 2, 0)).toBe(1);
    expect(dragSteer(-DRAG_RESPONSE * 2, 0)).toBe(-1);
    expect(dragSteer(DRAG_DEAD / 2, 0)).toBe(0);
    expect(dragSteer(DRAG_RESPONSE / 2, 0)).toBeCloseTo(.5);
  });
});
