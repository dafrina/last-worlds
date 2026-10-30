import { describe, expect, it } from 'vitest';
import { createControlState } from '../../src/input/controls';

describe('barrel-roll input', () => {
  it('queues one barrel roll (a sidestep) after two separate same-side taps, across sampled frames', () => {
    let time = 100; const input = createControlState(() => time);
    input.pointerDown(1, 'left'); expect(input.sample().dashPressed).toBeUndefined();
    input.pointerUp(1); time += 180;
    input.pointerDown(2, 'left'); expect(input.sample().dashPressed).toBe(-1);
    expect(input.sample().dashPressed).toBeUndefined();
  });
  it('ignores holds, crossing the centre, opposing taps and long gaps', () => {
    let time = 100; const input = createControlState(() => time);
    input.pointerDown(1, 'left'); input.pointerDown(2, 'left');
    input.pointerMove(1, 'right'); expect(input.sample().dashPressed).toBeUndefined();
    input.clear(); input.pointerDown(1, 'left'); input.pointerUp(1);
    input.pointerDown(1, 'right'); expect(input.sample().dashPressed).toBeUndefined(); input.pointerUp(1);
    time += 400; input.pointerDown(1, 'right'); expect(input.sample().dashPressed).toBeUndefined();
  });
  it('supports keyboard doubles, ignores repeat, and clears tap memory on blur/pause', () => {
    let time = 100; const input = createControlState(() => time);
    input.keyDown('KeyD'); input.keyDown('KeyD', true); expect(input.sample().dashPressed).toBeUndefined();
    input.keyUp('KeyD'); time += 180; input.keyDown('KeyD'); expect(input.sample().dashPressed).toBe(1);
    input.clear(); input.keyDown('KeyD'); expect(input.sample().dashPressed).toBeUndefined();
    input.clear(); input.pointerDown(1, 'special'); input.pointerUp(1); input.pointerDown(2, 'special');
    expect(input.sample().dashPressed).toBeUndefined();
  });
  it('cancelled touches and simultaneous direction aliases never count as a second tap', () => {
    const input = createControlState(() => 100);
    input.pointerDown(1, 'left'); input.pointerCancel(1); input.pointerDown(2, 'left');
    expect(input.sample().dashPressed).toBeUndefined();
    input.clear(); input.keyDown('KeyA'); input.keyDown('ArrowLeft');
    expect(input.sample().dashPressed).toBeUndefined();
  });
});
