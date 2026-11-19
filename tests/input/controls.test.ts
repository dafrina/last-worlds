import { describe, expect, it } from 'vitest';
import { DRAG_DEAD, DRAG_RESPONSE, createControlState, dragSteer, followTarget } from '../../src/input/controls';
import { VIEW } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';

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

describe('follow steering (the finger\'s own x at normal speed, user 19 November)', () => {
  // A 400 px wide surface at x 0: the finger's share across it is px / 400.
  const at = (cameraX: number) => ({ worldPerPx: 0.05, worldAt: (px: number) => followTarget(px / 400, cameraX) });

  it('targets the world x under the finger, wherever the ship was at touch-down', () => {
    const input = createControlState();
    input.dragDown(1, 200, -3, true); // the centre of the screen, the ship 3 left of it
    expect(input.sample({ shipX: -3, ...at(0) }).horizontal).toBe(1);
    expect(input.sample({ shipX: 0, ...at(0) }).horizontal).toBe(0);
    input.dragMove(1, 100); // a quarter across: left of the centre
    expect(followTarget(.25, 0)).toBeLessThan(-2);
    expect(input.sample({ shipX: 0, ...at(0) }).horizontal).toBe(-1);
    input.pointerUp(1);
    expect(input.sample({ shipX: 0, ...at(0) }).horizontal).toBe(0);
  });

  it('spans the view at the ship\'s row and reaches past the ship\'s limit at the camera\'s', () => {
    expect(followTarget(.5, 0)).toBe(0);
    expect(followTarget(1, 0)).toBeCloseTo(-followTarget(0, 0));
    const cameraLimit = (VIEW.worldWidth - VIEW.width) / 2, shipLimit = VIEW.worldWidth / 2 - VIEW.playerRadius;
    expect(followTarget(1, cameraLimit)).toBeGreaterThanOrEqual(shipLimit);
    expect(followTarget(0, -cameraLimit)).toBeLessThanOrEqual(-shipLimit);
  });

  // Fixed speed: the ship never outruns its usual handling, settles under a finger inside the camera's dead zone, and a
  // finger held near the edge carries it (and the camera) to the map's side.
  const fly = (share: number, seconds: number) => {
    const state = createRun({ mode: 'endless', ship: 'scrapper', seed: 3 }), input = createControlState();
    input.dragDown(1, share * 400, state.player.x, true);
    let fastest = 0;
    for (let t = 0; t < seconds * 60; t++) {
      const frame = input.sample({ shipX: state.player.x, ...at(state.cameraX) });
      stepRun(state, frame); fastest = Math.max(fastest, Math.abs(state.player.vx));
    }
    return { state, fastest };
  };
  it('settles under a finger near the middle at no more than the normal top speed', () => {
    const halves = createRun({ mode: 'endless', ship: 'scrapper', seed: 3 });
    for (let t = 0; t < 30; t++) stepRun(halves, { horizontal: 1, specialPressed: false, pausePressed: false });
    expect(Math.abs(halves.player.vx)).toBeGreaterThan(5);
    const { state, fastest } = fly(.65, 2);
    expect(Math.abs(state.player.x - followTarget(.65, state.cameraX))).toBeLessThan(DRAG_DEAD + .02);
    expect(fastest).toBeLessThanOrEqual(Math.abs(halves.player.vx) + 1e-9);
  });
  it('carries the ship to the map side under a finger held at the edge', () => {
    const { state } = fly(.97, 6);
    expect(state.player.x).toBeGreaterThan(VIEW.worldWidth / 2 - 1.5);
    expect(state.cameraX).toBeCloseTo((VIEW.worldWidth - VIEW.width) / 2);
  });
});
