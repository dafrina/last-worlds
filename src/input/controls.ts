import { VIEW, type GameInput, type InputFrame } from '../shared/contracts';
import { LENS_FOLLOW, lensRowHalfWidth } from '../shared/lens';
import type { TiltSource } from './tilt';

export type PointerRole = 'left' | 'right' | 'special' | 'drag';

/**
 * Drag steering (Settings → Steering → Drag; user, 15 November 2026: "the ship follows where we touch, relative to
 * first touch"). A held finger sets a target: the ship's x when it touched down plus the finger's sideways travel since,
 * DRAG_GAIN view widths per screen width. Steering then pulls toward that target with a proportional share (full beyond
 * DRAG_RESPONSE world units, nothing within DRAG_DEAD), so the ship keeps its usual top speed and acceleration.
 */
export const DRAG_GAIN = 1.5;
export const DRAG_RESPONSE = 0.6;
export const DRAG_DEAD = 0.06;
/** The steering share toward a drag target from the ship's x. */
export function dragSteer(target: number, shipX: number): number {
  const delta = target - shipX;
  return Math.abs(delta) < DRAG_DEAD ? 0 : Math.max(-1, Math.min(1, delta / DRAG_RESPONSE));
}

/**
 * Follow steering (Settings → Steering → Follow; user, 19 November 2026: "The ship basically follows the touch
 * horizontally ... Just add the fixed speed touch control"). A held finger's target is the world x under it at the
 * ship's row, through the release lens (src/shared/lens.ts), and the ship heads there with dragSteer: its usual top
 * speed and acceleration, never faster. The camera follows the ship, so a finger held further out than the camera's
 * dead zone (wider with Follow: BALANCE.camera.followDeadZone) keeps the ship travelling that way until the camera stops
 * at the map's edge.
 */
const ROW_HALF_WIDTH = lensRowHalfWidth();
/** The world x under a finger `share` of the way across the play surface (0 its left edge, 1 its right). */
export function followTarget(share: number, cameraX: number): number {
  return cameraX * LENS_FOLLOW + (2 * share - 1) * ROW_HALF_WIDTH;
}

/**
 * Pointer roles are assigned at pointer-down. Holding the left half of the play surface steers left, the right half
 * steers right (user decision, 21 October 2026, back from steering relative to the ship). A held steering finger that
 * slides across the middle switches direction (user decision, 14 October); the special button's pointer never steers.
 */
export function createControlState() {
  const pointers = new Map<number, PointerRole>();
  /** Drag pointers: where the finger touched down and is now (screen px), the ship's x at touch-down, and whether it
   *  follows the finger's own position (Follow) rather than its travel (Drag). */
  const drags = new Map<number, { startPx: number; px: number; shipX: number; follow: boolean }>();
  const keys = new Set<string>();
  let specialPressed = false;
  let pausePressed = false;
  const leftKeys = ['ArrowLeft', 'KeyA'];
  const rightKeys = ['ArrowRight', 'KeyD'];
  const acceptedKeys = new Set([...leftKeys, ...rightKeys, 'Space', 'Escape']);

  return {
    pointerDown(id: number, role: PointerRole) {
      if (pointers.has(id)) return;
      pointers.set(id, role);
      if (role === 'special') specialPressed = true;
    },
    /** A drag pointer: the first one held steers; it remembers the ship's x at touch-down (null: no flight, no drag).
     *  `follow`: it steers to the world x under the finger (Follow) instead of by the finger's travel (Drag). */
    dragDown(id: number, px: number, shipX: number | null, follow = false) {
      if (pointers.has(id) || shipX === null) return;
      pointers.set(id, 'drag'); drags.set(id, { startPx: px, px, shipX, follow });
    },
    dragMove(id: number, px: number) { const drag = drags.get(id); if (drag) drag.px = px; },
    /** A drag finger is held (the only time drag steering needs the ship's x and the surface's width). */
    dragging() { return drags.size > 0; },
    pointerUp(id: number) { pointers.delete(id); drags.delete(id); },
    pointerCancel(id: number) { pointers.delete(id); drags.delete(id); },
    /** A held steering pointer now over the other half steers that way; special pointers keep their role. */
    pointerMove(id: number, side: 'left' | 'right') {
      const role = pointers.get(id);
      if (role === 'left' || role === 'right') pointers.set(id, side);
    },
    roleOf(id: number): PointerRole | undefined { return pointers.get(id); },
    keyDown(code: string, repeat = false) {
      if (!acceptedKeys.has(code)) return false;
      if (keys.has(code) || repeat) return true;
      keys.add(code);
      if (code === 'Space') specialPressed = true;
      if (code === 'Escape') pausePressed = true;
      return true;
    },
    keyUp(code: string) { keys.delete(code); },
    activateSpecial() { specialPressed = true; },
    /** `drag`: the ship's x now and world units per screen pixel, for a held drag pointer (keys win over it), and for a
     *  Follow pointer the world x under a screen px. */
    sample(drag?: { shipX: number; worldPerPx: number; worldAt?: (px: number) => number }): InputFrame {
      const roles = [...pointers.values()];
      const left = roles.includes('left') || leftKeys.some((key) => keys.has(key));
      const right = roles.includes('right') || rightKeys.some((key) => keys.has(key));
      let horizontal = left === right ? 0 : left ? -1 : 1;
      const held = drags.values().next().value;
      if (!left && !right && held && drag) {
        const target = held.follow && drag.worldAt ? drag.worldAt(held.px) : held.shipX + (held.px - held.startPx) * drag.worldPerPx;
        horizontal = dragSteer(target, drag.shipX);
      }
      const frame: InputFrame = { horizontal, specialPressed, pausePressed };
      specialPressed = false;
      pausePressed = false;
      return frame;
    },
    clear() {
      pointers.clear();
      drags.clear();
      keys.clear();
      specialPressed = false;
      pausePressed = false;
    },
  };
}

/** `flight`: the flying ship's x and the camera's (null when no flight), which Drag and Follow steering anchor to. */
export function createInput(surface: HTMLElement, specialButton: HTMLButtonElement, tilt?: TiltSource,
  flight?: () => { shipX: number; cameraX: number } | null): GameInput {
  const state = createControlState();
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const active = () => surface.dataset.inputActive !== 'false';
  const dragMode = () => tilt?.mode === 'drag' || tilt?.mode === 'follow';
  const isField = (target: EventTarget | null) => target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
  const capture = (element: HTMLElement, id: number) => {
    try { element.setPointerCapture?.(id); } catch { /* Pointer may already be canceled. */ }
  };
  const release = (event: PointerEvent) => state.pointerUp(event.pointerId);
  const cancel = (event: PointerEvent) => state.pointerCancel(event.pointerId);

  surface.addEventListener('pointerdown', (event) => {
    if (!active() || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(
      'button, input, select, textarea, a, [data-no-steer], [role="button"]',
    )) return;
    const rect = surface.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) return;
    event.preventDefault();
    if (dragMode()) state.dragDown(event.pointerId, event.clientX, flight?.()?.shipX ?? null, tilt?.mode === 'follow');
    else state.pointerDown(event.pointerId, event.clientX < rect.left + rect.width / 2 ? 'left' : 'right');
    capture(surface, event.pointerId);
    surface.focus({ preventScroll: true });
  }, options);

  // Crossing the middle switches a held steering finger; a small dead band stops flicker on the centre line.
  surface.addEventListener('pointermove', (event) => {
    const role = state.roleOf(event.pointerId);
    if (active() && role === 'drag') { state.dragMove(event.pointerId, event.clientX); return; }
    if (!active() || (role !== 'left' && role !== 'right')) return;
    const rect = surface.getBoundingClientRect(), centre = rect.left + rect.width / 2, band = rect.width * .03;
    if (role === 'left' && event.clientX > centre + band) state.pointerMove(event.pointerId, 'right');
    else if (role === 'right' && event.clientX < centre - band) state.pointerMove(event.pointerId, 'left');
  }, options);

  specialButton.addEventListener('pointerdown', (event) => {
    if (!active() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    state.pointerDown(event.pointerId, 'special');
    capture(specialButton, event.pointerId);
  }, options);
  // Enter and assistive activation produce a click without a physical pointer.
  specialButton.addEventListener('click', (event) => {
    if (active() && event.detail === 0) state.activateSpecial();
  }, options);
  // iOS Safari starts its long-press loupe, callout and text selection from touch events, which a
  // pointerdown preventDefault does not cancel. Steering and special touches cancel them; other
  // buttons and menu controls keep their default so taps still produce clicks.
  const suppressTouchGestures = (event: TouchEvent) => {
    if (!active() || !event.cancelable) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && !specialButton.contains(target) &&
        target.closest('button, input, select, textarea, a, [data-no-steer], [role="button"]')) return;
    event.preventDefault();
  };
  for (const type of ['touchstart', 'touchmove'] as const) {
    surface.addEventListener(type, suppressTouchGestures, { signal: abort.signal, passive: false });
  }
  surface.addEventListener('contextmenu', (event) => { if (active()) event.preventDefault(); }, options);
  for (const element of [surface, specialButton]) {
    element.addEventListener('pointerup', release, options);
    element.addEventListener('pointercancel', cancel, options);
    // Normal pointer-up also releases capture: preserve double-tap memory in that case.
    element.addEventListener('lostpointercapture', event => { if (state.roleOf(event.pointerId)) cancel(event); }, options);
  }
  window.addEventListener('pointerup', release, options);
  window.addEventListener('pointercancel', cancel, options);
  window.addEventListener('keydown', (event) => {
    if (!active() || isField(event.target)) return;
    if (event.target instanceof Element && event.target.closest('button') &&
        event.target.closest('button') !== specialButton && event.code !== 'Escape') return;
    if (state.keyDown(event.code, event.repeat)) event.preventDefault();
  }, options);
  window.addEventListener('keyup', (event) => state.keyUp(event.code), options);
  window.addEventListener('blur', () => state.clear(), options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.clear();
  }, options);

  return {
    sample() {
      if (!active()) state.clear();
      // Measured only while a drag finger is held: a layout read every frame would cost every mode on every phone.
      const now = dragMode() && state.dragging() ? flight?.() ?? null : null;
      const rect = now === null ? null : surface.getBoundingClientRect();
      const frame = state.sample(now === null || !rect || rect.width <= 0 ? undefined : {
        shipX: now.shipX, worldPerPx: VIEW.width * DRAG_GAIN / rect.width,
        worldAt: px => followTarget((px - rect.left) / rect.width, now.cameraX),
      });
      // Tilt steering (optional): a held half or key wins, otherwise the phone's lean steers.
      if (frame.horizontal === 0 && tilt) frame.horizontal = tilt.value();
      // Follow holds the camera over its wider dead zone whether a finger is down or not, so a release never pans it.
      if (tilt?.mode === 'follow') frame.follow = true;
      return frame;
    },
    clear: state.clear,
    dispose() { abort.abort(); state.clear(); },
  };
}
