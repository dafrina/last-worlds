import type { GameAudio } from './engine';
import './settings.css';

/** Isolated addition to the existing settings panel; no gameplay UI or shared contract changes. */
export function mountAudioSettings(root: HTMLElement, audio: GameAudio) {
  const list = root.querySelector('.settings-list');
  if (!list) return () => {};
  const rows: HTMLElement[] = [];
  const abort = new AbortController();
  let after = list.firstElementChild;
  for (const [key, title] of [['music', 'Music'], ['effects', 'Effects']] as const) {
    const row = document.createElement('label'); row.className = 'audio-volume';
    const name = document.createElement('span'); name.textContent = title;
    const control = document.createElement('span'); control.className = 'audio-volume-control';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '5';
    slider.setAttribute('aria-label', `${title} volume`);
    slider.value = String(Math.round(audio.settings()[key] * 100));
    const value = document.createElement('output'); value.setAttribute('aria-hidden', 'true');
    value.textContent = slider.value;
    slider.addEventListener('input', () => {
      value.textContent = slider.value;
      audio.setSettings({ [key]: Number(slider.value) / 100 });
    }, { signal: abort.signal });
    control.append(slider, value); row.append(name, control);
    after?.after(row); after = row; rows.push(row);
  }
  // Restore the existing accessible Sound radio group through its own handler.
  if (audio.settings().muted) root.querySelector<HTMLButtonElement>('[data-selector="sound"] [data-value="off"]')?.click();
  return () => { abort.abort(); rows.forEach(row => row.remove()); };
}
