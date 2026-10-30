import type { GameInput, InputFrame } from '../shared/contracts';
import { SHIP_PERKS } from '../sim/ship-perks';

export type PointerRole = 'left' | 'right' | 'special';

/**
 * Pointer roles are assigned at pointer-down. Holding the left half of the play surface steers left, the right half
 * steers right (user decision, 21 October 2026, back from steering relative to the ship). A held steering finger that
 * slides across the middle switches direction (user decision, 14 October); the special button's pointer never steers.
 */
export function createControlState(now: () => number = () => performance.now()) {
  const pointers = new Map<number, PointerRole>();
  const keys = new Set<string>();
  let specialPressed = false;
  let pausePressed = false;
  let dashPressed: -1 | 1 | undefined;
  let lastTap: { direction: -1 | 1; at: number } | undefined;
  const tap = (direction: -1 | 1) => {
    const at = now();
    if (lastTap?.direction === direction && at - lastTap.at <= SHIP_PERKS.doubleTapMs) {
      dashPressed = direction; lastTap = undefined;
    } else lastTap = { direction, at };
  };
  const leftKeys = ['ArrowLeft', 'KeyA'];
  const rightKeys = ['ArrowRight', 'KeyD'];
  const acceptedKeys = new Set([...leftKeys, ...rightKeys, 'Space', 'Escape']);

  return {
    pointerDown(id: number, role: PointerRole) {
      if (pointers.has(id)) return;
      // Two simultaneously held fingers are not a double tap.
      if (role !== 'special' && ![...pointers.values()].some(r => r !== 'special')) tap(role === 'left' ? -1 : 1);
      pointers.set(id, role);
      if (role === 'special') specialPressed = true;
    },
    pointerUp(id: number) { pointers.delete(id); },
    pointerCancel(id: number) { pointers.delete(id); lastTap = undefined; dashPressed = undefined; },
    /** A held steering pointer now over the other half steers that way; special pointers keep their role. */
    pointerMove(id: number, side: 'left' | 'right') {
      const role = pointers.get(id);
      if (role === 'left' || role === 'right') pointers.set(id, side);
    },
    roleOf(id: number): PointerRole | undefined { return pointers.get(id); },
    keyDown(code: string, repeat = false) {
      if (!acceptedKeys.has(code)) return false;
      if (keys.has(code) || repeat) return true;
      const held = [...leftKeys, ...rightKeys].some(key => keys.has(key)) || [...pointers.values()].some(role => role !== 'special');
      keys.add(code);
      if (!held && leftKeys.includes(code)) tap(-1);
      if (!held && rightKeys.includes(code)) tap(1);
      if (code === 'Space') specialPressed = true;
      if (code === 'Escape') pausePressed = true;
      return true;
    },
    keyUp(code: string) { keys.delete(code); },
    activateSpecial() { specialPressed = true; },
    sample(): InputFrame {
      const roles = [...pointers.values()];
      const left = roles.includes('left') || leftKeys.some((key) => keys.has(key));
      const right = roles.includes('right') || rightKeys.some((key) => keys.has(key));
      const horizontal = left === right ? 0 : left ? -1 : 1;
      const frame: InputFrame = { horizontal, specialPressed, pausePressed, ...(dashPressed ? { dashPressed } : {}) };
      dashPressed = undefined;
      specialPressed = false;
      pausePressed = false;
      return frame;
    },
    clear() {
      pointers.clear();
      keys.clear();
      specialPressed = false;
      pausePressed = false;
      dashPressed = undefined;
      lastTap = undefined;
    },
  };
}

export function createInput(surface: HTMLElement, specialButton: HTMLButtonElement): GameInput {
  const state = createControlState();
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const active = () => surface.dataset.inputActive !== 'false';
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
    state.pointerDown(event.pointerId, event.clientX < rect.left + rect.width / 2 ? 'left' : 'right');
    capture(surface, event.pointerId);
    surface.focus({ preventScroll: true });
  }, options);

  // Crossing the middle switches a held steering finger; a small dead band stops flicker on the centre line.
  surface.addEventListener('pointermove', (event) => {
    const role = state.roleOf(event.pointerId);
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
      return state.sample();
    },
    clear: state.clear,
    dispose() { abort.abort(); state.clear(); },
  };
}
