import type { GameAudio } from '../audio/engine';
import type { UiSound } from '../audio/samples';

/** The menu sounds' names a button may carry in `data-sound` (the hangar's buy, equip and fitting buttons). */
const NAMED = new Set<string>(['ui-press', 'ui-back', 'ui-select', 'ui-purchase', 'ui-equip']);
/** Buttons whose press is gameplay or a launch: the special has its own sound, a launch the warp's whoosh. */
const SILENT = '.special-button, [data-no-ui-sound], [data-action="launch-campaign"], [data-action="endless"], [data-action="retry"]';
/** Leaving: closing a panel, returning to the menu. */
const BACK = '.back-button, [data-back], [data-settings-back], [data-help-back], [data-action="quit"], [data-action="menu"], [data-action="loading-cancel"]';
/** Choosing among options: radio groups (settings, hangar slots, mission dots), tabs, mission arrows. */
const SELECT = '[role="radio"], [role="tab"], [data-mission-step]';

/** Which menu sound a button makes. */
export function uiSoundOf(button: HTMLElement): UiSound | null {
  if (button.matches(SILENT)) return null;
  const named = button.dataset.sound;
  if (named && NAMED.has(named)) return named as UiSound;
  if (button.matches(BACK)) return 'ui-back';
  if (button.matches(SELECT)) return 'ui-select';
  return 'ui-press';
}

/**
 * The menu's sounds (15 November, user: "sounds for button presses etc in the menu"), wired once for the whole UI with
 * delegated listeners on the root, so every button, in the menus and in a paused flight's panels, gets its sound without
 * a hook of its own. They respect the Effects volume and Sound off (engine.ts `ui`); the mixer keeps repeats apart.
 * Capture listeners run before a button's own handler, so a button that rebuilds its panel still sounds.
 */
export function installUiSounds(root: HTMLElement, audio: GameAudio) {
  const abort = new AbortController(), options = { signal: abort.signal, capture: true };
  const buttonOf = (event: Event) => (event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null);
  root.addEventListener('click', event => {
    const button = buttonOf(event);
    if (!button || button.disabled) return;
    const sound = uiSoundOf(button);
    if (sound) audio.ui(sound);
  }, options);
  // A disabled button (not enough credits, a tier not bought, a mission still locked) refuses the press, where the browser
  // delivers it (pointer events reach a disabled button in current Chromium; elsewhere it stays silent).
  root.addEventListener('pointerdown', event => {
    const button = buttonOf(event);
    if (button?.disabled && !button.matches(SILENT)) audio.ui('ui-deny');
  }, options);
  // The volume sliders tick as they move, pitched by their value over an octave (the mixer keeps ticks 50 ms apart).
  root.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'range') return;
    const min = Number(input.min || 0), max = Number(input.max || 100);
    audio.ui('ui-tick', Math.round((Number(input.value) - min) / ((max - min) || 1) * 12) - 6);
  }, options);
  // A paint colour chosen, a box ticked: a selection.
  root.addEventListener('change', event => {
    const input = event.target;
    if (input instanceof HTMLInputElement && (input.type === 'color' || input.type === 'checkbox')) audio.ui('ui-select');
  }, options);
  return () => abort.abort();
}
