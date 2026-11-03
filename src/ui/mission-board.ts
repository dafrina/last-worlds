import { DIFFICULTY_TAG, type WorldMission } from '../content/world-missions';
import type { BoardEntry, MissionNote, WorldBoard } from '../campaign/missions';

/*
 * World missions on screen (docs/35 § 6): the board on the campaign page, a compact live list on the pause panel, a small
 * throttled note in flight and the results screen's list of missions paid. Plain text in the menus' existing style; no
 * meters or ornaments over the flight (AGENTS.md invariant 3).
 */

const creditGlyph = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6Z"/></svg>';
const partGlyph = '<svg viewBox="0 0 12 12" aria-hidden="true"><path fill-rule="evenodd" d="M4 1H8L11 4V8L8 11H4L1 8V4ZM6 4A2 2 0 1 0 6.01 4Z"/></svg>';
const escape = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** A mission's reward as glyphs: credits, and parts when it pays any. */
function reward(def: WorldMission): string {
  return `<span class="board-reward" aria-label="Reward ${def.credits} credits${def.parts ? ` and ${def.parts} part` : ''}">`
    + `<span class="board-credits">${creditGlyph}${def.credits}</span>${def.parts ? `<span class="board-parts">${partGlyph}${def.parts}</span>` : ''}</span>`;
}
/** One open mission: name and progress, its line, its minimum difficulty, scope and reward. */
function item(entry: BoardEntry, live: boolean): string {
  const { def, progress } = entry, counted = def.goal > 1;
  const scope = def.scope === 'career' ? 'ACROSS RUNS' : live ? 'THIS RUN' : progress > 0 ? 'LAST RUN' : 'ONE RUN';
  return `<li class="board-item${progress >= def.goal ? ' is-done' : ''}">`
    + `<div class="board-line"><b>${escape(def.name)}</b>${counted ? `<span class="board-value">${progress}/${def.goal}</span>` : ''}</div>`
    + `<p class="board-text">${escape(def.text)}</p>`
    + `<div class="board-meta"><span class="board-tag${def.difficulty === 'relaxed' ? '' : ' is-gated'}">${DIFFICULTY_TAG[def.difficulty]}</span><span class="board-scope">${scope}</span>${reward(def)}</div>`
    + (counted ? `<span class="board-bar" aria-hidden="true"><i style="width:${Math.round(100 * progress / def.goal)}%"></i></span>` : '')
    + '</li>';
}

/** The campaign page's board for a world (`null`: the saved board could not be read). */
export function renderBoard(section: HTMLElement, board: WorldBoard | null, world: string): void {
  const title = `MISSIONS · ${world.toUpperCase()}`;
  if (!board) {
    section.innerHTML = `<div class="board-head"><h3 class="setup-label">${title}</h3></div><p class="board-note">Mission progress could not be read. It was kept intact; missions are paused on this browser.</p>`;
    return;
  }
  const history = board.history.slice(-3).reverse();
  section.innerHTML = `<div class="board-head"><h3 class="setup-label" id="board-title">${title}</h3><span class="board-count">${board.done} / ${board.total} DONE</span></div>`
    + (board.visible.length ? `<ol class="board-list">${board.visible.map(entry => item(entry, false)).join('')}</ol>` : '<p class="board-note">Every mission on this world is done.</p>')
    + (history.length ? `<p class="board-history"><span>DONE</span> ${history.map(def => escape(def.name)).join(' · ')}${board.history.length > history.length ? ` · +${board.history.length - history.length} MORE` : ''}</p>` : '');
}

/** The pause panel's compact list: the visible missions with this run's live progress. */
export function renderLiveBoard(list: HTMLElement, entries: readonly BoardEntry[]): void {
  list.hidden = !entries.length;
  list.innerHTML = entries.map(({ def, progress, gated }) => `<li><span>${escape(def.name)}</span><b>${gated ? DIFFICULTY_TAG[def.difficulty]
    : progress >= def.goal ? 'DONE' : def.goal > 1 ? `${progress}/${def.goal}` : '—'}</b></li>`).join('');
}

/** The results screen: the missions this run paid, with their rewards. */
export function renderResultMissions(element: HTMLElement, paid: readonly WorldMission[]): void {
  element.hidden = !paid.length;
  element.innerHTML = paid.length ? `<p class="result-missions-title">MISSIONS COMPLETE</p><ul>${paid.map(def => `<li><span>${escape(def.name)}</span>${reward(def)}</li>`).join('')}</ul>` : '';
}

/** Notes in flight: one at a time, each shown SHOW_MS, the next no sooner than GAP after; newer progress replaces a queued note. */
const SHOW_MS = 1800, GAP = 400;
export function createMissionNotes(element: HTMLElement) {
  const queue: MissionNote[] = [];
  let shownAt = -Infinity, showing = false;
  const hide = () => { if (showing) { showing = false; element.classList.remove('is-on'); } };
  return {
    push(notes: readonly MissionNote[]) {
      for (const note of notes) {
        const queued = queue.findIndex(other => other.id === note.id && !other.complete);
        if (queued >= 0) queue.splice(queued, 1);
        queue.push(note);
      }
      // A long backlog keeps every completion and only the latest progress.
      while (queue.length > 4) { const old = queue.findIndex(note => !note.complete); if (old < 0) break; queue.splice(old, 1); }
    },
    /** Each frame: shows the next note when one is due, only while the flight is playing. */
    frame(playing: boolean, now = performance.now()) {
      if (!playing) { hide(); return; }
      if (showing && now - shownAt >= SHOW_MS) hide();
      if (showing || !queue.length || now - shownAt < SHOW_MS + GAP) return;
      const note = queue.shift()!;
      element.textContent = note.text;
      element.classList.toggle('is-complete', note.complete);
      element.classList.remove('is-on'); void element.offsetWidth; element.classList.add('is-on');
      showing = true; shownAt = now;
    },
    clear() { queue.length = 0; hide(); shownAt = -Infinity; },
  };
}
