import type { GameInput, InputFrame } from '../shared/contracts';

export type PointerRole = 'left' | 'right' | 'special';

/** Input ownership is fixed at pointer-down, even when a finger crosses the screen. */
export function createControlState() {
  const pointers = new Map<number, PointerRole>();
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
    pointerUp(id: number) { pointers.delete(id); },
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
    sample(): InputFrame {
      const roles = [...pointers.values()];
      const left = roles.includes('left') || leftKeys.some((key) => keys.has(key));
      const right = roles.includes('right') || rightKeys.some((key) => keys.has(key));
      const horizontal = left === right ? 0 : left ? -1 : 1;
      const frame: InputFrame = { horizontal, specialPressed, pausePressed };
      specialPressed = false;
      pausePressed = false;
      return frame;
    },
    clear() {
      pointers.clear();
      keys.clear();
      specialPressed = false;
      pausePressed = false;
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
  for (const element of [surface, specialButton]) {
    element.addEventListener('pointerup', release, options);
    element.addEventListener('pointercancel', release, options);
    element.addEventListener('lostpointercapture', release, options);
  }
  window.addEventListener('pointerup', release, options);
  window.addEventListener('pointercancel', release, options);
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
