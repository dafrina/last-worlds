import './styles.css';
import { AudioMixer } from '../audio/mixer';
import { prefetchSamples } from '../audio/sample-bank';
import { MENU_LEVEL, fitted } from '../audio/menu-theme';
import type { Note } from '../audio/score';
import {
  SONG_IDS, STEPS, edited, harmonyAt, loadForm, notesAt, pitchName, saveForm, sectionAt, song, templateAt,
  type LineNote, type SavedEdits, type SongId,
} from './model';

/**
 * The melody editor (melody.html; user, 20 November 2026): a piano roll over a song's lead for its 32 bars, played through
 * the game's own mixer and instruments with the rest of the arrangement. Edits are kept in this browser and, on the
 * development server, saved to lookdev/melody-edits.json for the agent to write into the score.
 */
const STORAGE = 'last-worlds.melody-edits.v1', LAST = 'last-worlds.melody-song';
const KEY = 66, RULER = 46, VEL = 72, ROW = 14;
type Edit = { line: LineNote[]; comment: string };

const root = document.getElementById('melody')!;
root.innerHTML = `
  <header class="mel-bar">
    <strong class="mel-title">Melody Editor</strong>
    <select class="mel-song" aria-label="Song"></select>
    <button class="mel-play" type="button" title="Play / stop (Space)">▶ Play</button>
    <label class="mel-field">Loop bars <input class="mel-from" type="number" min="1" max="32" value="1"> – <input class="mel-to" type="number" min="1" max="32" value="32"></label>
    <span class="mel-seg" role="group" aria-label="Hear"><button type="button" data-hear="edited" class="on">Edited</button><button type="button" data-hear="original">Original</button></span>
    <label class="mel-check"><input class="mel-solo" type="checkbox"> Lead only</label>
    <label class="mel-check"><input class="mel-ghost" type="checkbox" checked> Show original</label>
    <label class="mel-check"><input class="mel-follow" type="checkbox" checked> Follow</label>
    <label class="mel-field">Snap <select class="mel-snap"><option value="1">1/16</option><option value="2">1/8</option><option value="4">1/4</option><option value="16">Bar</option></select></label>
    <label class="mel-field">Zoom <input class="mel-zoom" type="range" min="6" max="44" value="18"></label>
    <span class="mel-group">
      <button type="button" class="mel-undo" title="Undo (Ctrl+Z)">Undo</button>
      <button type="button" class="mel-redo" title="Redo (Ctrl+Shift+Z)">Redo</button>
      <button type="button" class="mel-reset" title="Back to the song's original line">Reset song</button>
    </span>
    <span class="mel-group">
      <button type="button" class="mel-save primary" title="Save for Claude">Save</button>
      <button type="button" class="mel-download">Download</button>
      <button type="button" class="mel-import">Import</button>
      <input class="mel-file" type="file" accept="application/json,.json" hidden>
    </span>
    <span class="mel-status" role="status"></span>
  </header>
  <div class="mel-roll"><canvas></canvas><div class="mel-scroll" tabindex="0"><div class="mel-spacer"></div></div></div>
  <footer class="mel-foot">
    <div class="mel-info"></div>
    <textarea class="mel-comment" rows="2" placeholder="Notes for Claude about this song (what you changed and why, what still feels off)…"></textarea>
    <p class="mel-help">Click the grid to add a note · drag to move · right-click or double-click to delete · ↑↓ a semitone (Shift an octave, Alt a quarter tone) · ←→ by the snap · drag in the Level lane for loudness · click the bar numbers to set where playback and paste start · Space play · Ctrl+Z undo · Ctrl+C / Ctrl+V copy and paste · Ctrl+wheel zoom. Green notes are your changes; outlines are the original.</p>
  </footer>`;
const find = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
const songSelect = find<HTMLSelectElement>('.mel-song'), playButton = find<HTMLButtonElement>('.mel-play');
const fromInput = find<HTMLInputElement>('.mel-from'), toInput = find<HTMLInputElement>('.mel-to');
const soloInput = find<HTMLInputElement>('.mel-solo'), ghostInput = find<HTMLInputElement>('.mel-ghost'), followInput = find<HTMLInputElement>('.mel-follow');
const snapSelect = find<HTMLSelectElement>('.mel-snap'), zoomInput = find<HTMLInputElement>('.mel-zoom');
const status = find<HTMLElement>('.mel-status'), info = find<HTMLElement>('.mel-info'), comment = find<HTMLTextAreaElement>('.mel-comment');
const canvas = find<HTMLCanvasElement>('canvas'), scroll = find<HTMLDivElement>('.mel-scroll'), spacer = find<HTMLDivElement>('.mel-spacer');
const ctx = canvas.getContext('2d')!;

// ---- State ----
const edits = new Map<SongId, Edit>();
const history = new Map<SongId, { undo: LineNote[][]; redo: LineNote[][] }>();
let current: SongId = (() => { try { const id = localStorage.getItem(LAST); return (SONG_IDS as readonly string[]).includes(id ?? '') ? id as SongId : 'luna'; } catch { return 'luna' as SongId; } })();
let selection = new Set<LineNote>();
let stepW = 18, lo = 48, hi = 84, cursor = 0, hear: 'edited' | 'original' = 'edited';
let clipboard: { offset: number; pitch: number; gain: number }[] = [];
let savedText = '';

const target = () => song(current);
const lineOf = (id: SongId) => edits.get(id)?.line ?? song(id).original;
const line = () => lineOf(current);
const snap = () => Number(snapSelect.value);
const maxGain = () => Math.max(.25, ...target().original.map(n => n.gain * 1.6));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** The editable line of the current song (copied from the original on its first edit). */
function editable(): LineNote[] {
  let edit = edits.get(current);
  if (!edit) { edit = { line: target().original.map(n => ({ ...n })), comment: comment.value }; edits.set(current, edit); }
  return edit.line;
}
function pushUndo() {
  const h = history.get(current) ?? { undo: [], redo: [] };
  h.undo.push(editable().map(n => ({ ...n }))); h.redo = []; if (h.undo.length > 200) h.undo.shift();
  history.set(current, h);
}
function restore(from: 'undo' | 'redo') {
  const h = history.get(current);
  const snapshot = h?.[from].pop();
  if (!h || !snapshot) return;
  h[from === 'undo' ? 'redo' : 'undo'].push(editable().map(n => ({ ...n })));
  edits.get(current)!.line = snapshot; selection = new Set(); changed();
}

// ---- Persistence ----
function form(): SavedEdits {
  const keep = new Map<SongId, Edit>();
  for (const [id, edit] of edits) if (edited(song(id), edit.line) || edit.comment.trim()) keep.set(id, edit);
  return saveForm(keep);
}
let persistTimer: ReturnType<typeof setTimeout> | undefined;
function changed() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify(form())); } catch { /* Private mode: the session keeps it. */ } }, 300);
  refreshSongs(); draw(); describe();
}
async function load() {
  let local: SavedEdits | null = null, server: SavedEdits | null = null;
  try { local = JSON.parse(localStorage.getItem(STORAGE) ?? 'null'); } catch { /* none */ }
  try { const response = await fetch('/__melody/edits', { cache: 'no-store' }); if (response.ok) server = await response.json(); } catch { /* not the dev server */ }
  const newest = [local, server].filter(Boolean).sort((a, b) => String(b!.saved).localeCompare(String(a!.saved)))[0];
  if (newest) for (const [id, edit] of loadForm(newest)) edits.set(id, edit);
  // What the saved file holds (nothing yet: no edits), to tell unsaved changes.
  savedText = server ? JSON.stringify(saveForm(loadForm(server)).songs) : JSON.stringify({});
}
function download(text: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); link.download = 'melody-edits.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
async function save() {
  const data = form(), text = JSON.stringify(data, null, 2);
  try {
    const response = await fetch('/__melody/edits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: text });
    if (response.status === 204) { savedText = JSON.stringify(data.songs); say('Saved to lookdev/melody-edits.json. Tell Claude to incorporate it.'); refreshSongs(); return; }
  } catch { /* not the dev server */ }
  download(text); say('Downloaded melody-edits.json (no development server to save to). Send it to Claude.');
}
let sayTimer: ReturnType<typeof setTimeout> | undefined;
function say(text: string, sticky = false) {
  status.textContent = text; clearTimeout(sayTimer);
  if (!sticky) sayTimer = setTimeout(() => { status.textContent = unsaved() ? 'Unsaved changes' : ''; }, 6000);
}
const unsaved = () => JSON.stringify(form().songs) !== savedText;

// ---- Songs ----
function refreshSongs() {
  const pick = current;
  songSelect.replaceChildren(...SONG_IDS.map(id => {
    const option = document.createElement('option'), s = song(id), edit = edits.get(id);
    option.value = id; option.textContent = `${s.world} · ${s.title}${edit && edited(s, edit.line) ? ' •' : ''}`;
    return option;
  }));
  songSelect.value = pick;
  if (!status.textContent || status.textContent === 'Unsaved changes' || status.textContent === '') status.textContent = unsaved() ? 'Unsaved changes' : '';
}
function setSong(id: SongId) {
  const was = playing;
  if (was) stop();
  current = id; selection = new Set(); cursor = 0;
  try { localStorage.setItem(LAST, id); } catch { /* fine */ }
  const pitches = [...song(id).original, ...line()].map(n => n.pitch);
  lo = Math.floor(Math.min(...pitches)) - 10; hi = Math.ceil(Math.max(...pitches)) + 10;
  comment.value = edits.get(id)?.comment ?? '';
  layout();
  const first = Math.min(...line().map(n => n.step));
  scroll.scrollLeft = Math.max(0, first * stepW - 40);
  scroll.scrollTop = Math.max(0, ((hi - (Math.max(...pitches) + Math.min(...pitches)) / 2) * ROW) - (scroll.clientHeight - RULER - VEL) / 2);
  refreshSongs(); draw(); describe();
  if (was) void play();
}

// ---- Geometry ----
const sx = () => scroll.scrollLeft, sy = () => scroll.scrollTop;
const xOf = (step: number) => KEY + step * stepW - sx();
const yOf = (pitch: number) => RULER + (hi - pitch) * ROW - sy();
function layout() {
  spacer.style.width = `${KEY + STEPS * stepW + 40}px`;
  spacer.style.height = `${RULER + (hi - lo + 1) * ROW + VEL}px`;
}
/** Drawn length of each note: to the next note's start (the lead is one voice: the next note damps it), at most a bar. */
function lengths(notes: readonly LineNote[]) {
  const starts = [...new Set(notes.map(n => n.step))].sort((a, b) => a - b), result = new Map<LineNote, number>();
  for (const note of notes) {
    const next = starts.find(s => s > note.step) ?? STEPS + (starts[0] ?? 0);
    result.set(note, clamp(next - note.step, 1, 16));
  }
  return result;
}
const pc = (p: number) => ((Math.round(p * 1000) / 1000 % 12) + 12) % 12;
/** A title-theme note that would grind into the next chord and is left out (menu-theme.ts `fitted`). */
function silent(note: LineNote) {
  if (!target().menu) return false;
  const { hold: _hold, ...written } = note.template;
  return fitted({ ...written, pitch: note.pitch, gain: note.gain }, note.step) === null;
}

// ---- Drawing ----
let playStep = -1;
function draw() {
  const dpr = Math.min(2, devicePixelRatio || 1), W = scroll.clientWidth, H = scroll.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#070f1c'; ctx.fillRect(0, 0, W, H);
  const s0 = Math.max(0, Math.floor(sx() / stepW) - 1), s1 = Math.min(STEPS, Math.ceil((sx() + W - KEY) / stepW) + 1);
  const pTop = Math.min(hi, hi - Math.floor(sy() / ROW) + 1), pBottom = Math.max(lo, pTop - Math.ceil((H - RULER - VEL) / ROW) - 2);
  const from = (Number(fromInput.value) - 1) * 16, to = Number(toInput.value) * 16;

  ctx.save(); ctx.beginPath(); ctx.rect(KEY, RULER, W - KEY, H - RULER - VEL); ctx.clip();
  // The harmony under each bar: chord tones brightest, the mode's other tones lighter, the rest dark.
  for (let bar = Math.floor(s0 / 16); bar * 16 < s1; bar++) {
    const h = harmonyAt(current, bar * 16), tones = h.tones.map(pc), x = xOf(bar * 16);
    for (let p = pBottom; p <= pTop; p++) {
      const c = pc(p), chordTone = tones.some(t => Math.abs(t - c) < .01), inScale = h.scale.some(t => Math.abs(pc(t) - c) < .01);
      ctx.fillStyle = Math.abs(pc(h.root) - c) < .01 ? '#21456b' : chordTone ? '#1a3656' : inScale ? '#11233a' : '#0a1525';
      ctx.fillRect(x, yOf(p), 16 * stepW, ROW - 1);
    }
  }
  // Outside the loop: dimmed.
  ctx.fillStyle = '#00000066';
  if (from > s0) ctx.fillRect(KEY, RULER, xOf(from) - KEY, H);
  if (to < s1) ctx.fillRect(xOf(to), RULER, W, H);
  for (let s = s0; s <= s1; s++) {
    if (s % 16 && stepW < 9 && s % 4) continue;
    ctx.fillStyle = s % 16 === 0 ? '#4a6c92' : s % 4 === 0 ? '#25405f' : '#132338';
    ctx.fillRect(Math.round(xOf(s)), RULER, 1, H - RULER - VEL);
  }
  for (let p = pBottom; p <= pTop; p++) if (pc(p) === 0) { ctx.fillStyle = '#2d4b6c'; ctx.fillRect(KEY, yOf(p) + ROW - 1, W, 1); }
  // The original line, outlined, where it differs.
  const notes = line(), lengthOf = lengths(notes), originalLength = lengths(target().original);
  const here = new Set(notes.map(n => `${n.step}:${n.pitch}`));
  if (ghostInput.checked && edits.has(current)) {
    ctx.setLineDash([3, 3]); ctx.strokeStyle = '#ffffff80'; ctx.lineWidth = 1;
    for (const n of target().original) {
      if (here.has(`${n.step}:${n.pitch}`) || n.step < s0 - 16 || n.step > s1) continue;
      ctx.strokeRect(xOf(n.step) + 1.5, yOf(n.pitch) + 1.5, originalLength.get(n)! * stepW - 3, ROW - 4);
    }
    ctx.setLineDash([]);
  }
  const was = new Set(target().original.map(n => `${n.step}:${n.pitch}:${n.gain}`)), top = maxGain();
  ctx.font = '10px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'middle';
  for (const n of notes) {
    if (n.step < s0 - 16 || n.step > s1) continue;
    const x = xOf(n.step) + 1, y = yOf(n.pitch) + 1, w = lengthOf.get(n)! * stepW - 2, picked = selection.has(n);
    const fresh = !was.has(`${n.step}:${n.pitch}:${n.gain}`), level = .45 + .55 * clamp(n.gain / top, 0, 1);
    ctx.globalAlpha = level;
    ctx.fillStyle = picked ? '#ffd36e' : fresh ? '#8af0a0' : '#7fd3ff';
    ctx.fillRect(x, y, w, ROW - 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = picked ? '#fff3c4' : '#ffffff';
    ctx.fillRect(x, y, 2, ROW - 3);
    if (silent(n)) { ctx.strokeStyle = '#ff7a7a'; ctx.setLineDash([2, 2]); ctx.strokeRect(x + .5, y + .5, w - 1, ROW - 4); ctx.setLineDash([]); }
    if (w > 40) { ctx.fillStyle = '#061325'; ctx.fillText(pitchName(n.pitch), x + 5, y + (ROW - 3) / 2 + .5); }
  }
  if (playStep >= 0) { ctx.fillStyle = '#ff6b6b'; ctx.fillRect(Math.round(xOf(playStep + .5)), RULER, 2, H); }
  ctx.fillStyle = '#ffd36e99'; ctx.fillRect(Math.round(xOf(cursor)), RULER, 1, H);
  if (marquee) {
    ctx.strokeStyle = '#ffd36e'; ctx.fillStyle = '#ffd36e22';
    const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1), w = Math.abs(marquee.x1 - marquee.x0), h = Math.abs(marquee.y1 - marquee.y0);
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x + .5, y + .5, w, h);
  }
  ctx.restore();

  // The level lane.
  const laneTop = H - VEL;
  ctx.fillStyle = '#081426'; ctx.fillRect(0, laneTop, W, VEL);
  ctx.fillStyle = '#2b4566'; ctx.fillRect(0, laneTop, W, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(KEY, laneTop, W - KEY, VEL); ctx.clip();
  for (const n of notes) {
    if (n.step < s0 || n.step > s1) continue;
    const h = clamp(n.gain / top, 0, 1) * (VEL - 14);
    ctx.fillStyle = selection.has(n) ? '#ffd36e' : '#7fd3ff';
    ctx.fillRect(xOf(n.step) + 1, H - 6 - h, Math.max(3, stepW - 4), h);
  }
  ctx.restore();
  ctx.fillStyle = '#8fa6bf'; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Level', 10, laneTop + 18);

  // The ruler: bars, chords and sections.
  ctx.fillStyle = '#0a1628'; ctx.fillRect(0, 0, W, RULER);
  ctx.fillStyle = '#2b4566'; ctx.fillRect(0, RULER - 1, W, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(KEY, 0, W - KEY, RULER); ctx.clip();
  ctx.fillStyle = '#ffd36e22'; ctx.fillRect(xOf(from), RULER - 8, (to - from) * stepW, 6);
  for (let bar = Math.floor(s0 / 16); bar * 16 < s1; bar++) {
    const x = xOf(bar * 16), section = sectionAt(current, bar), h = harmonyAt(current, bar * 16);
    ctx.fillStyle = '#4a6c92'; ctx.fillRect(Math.round(x), 0, 1, RULER);
    if (section) { ctx.fillStyle = '#ffd36e'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(section, x + 4, 13); }
    ctx.fillStyle = '#d6e6f4'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText(String(bar + 1), x + 4, 29);
    if (stepW * 16 > 60) { ctx.fillStyle = '#8fa6bf'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(pitchName(Math.round(h.root)).replace(/-?\d+$/, ''), x + 24, 29); }
  }
  ctx.fillStyle = '#ffd36e'; ctx.beginPath(); const cx = xOf(cursor); ctx.moveTo(cx - 5, RULER - 10); ctx.lineTo(cx + 5, RULER - 10); ctx.lineTo(cx, RULER - 2); ctx.fill();
  ctx.restore();

  // The keys.
  ctx.save(); ctx.beginPath(); ctx.rect(0, RULER, KEY, H - RULER - VEL); ctx.clip();
  ctx.textBaseline = 'middle';
  for (let p = pBottom; p <= pTop; p++) {
    const black = [1, 3, 6, 8, 10].includes(pc(p)), y = yOf(p);
    ctx.fillStyle = black ? '#0d1726' : '#1a2a40'; ctx.fillRect(0, y, KEY, ROW - 1);
    ctx.fillStyle = pc(p) === 0 ? '#ffffff' : black ? '#6e86a3' : '#a9bdd3';
    ctx.font = `${pc(p) === 0 ? '600 ' : ''}10px system-ui, sans-serif`; ctx.fillText(pitchName(p), 8, y + ROW / 2);
  }
  ctx.restore();
  ctx.fillStyle = '#0a1628'; ctx.fillRect(0, 0, KEY, RULER);
  ctx.fillStyle = '#8fa6bf'; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${target().bpm} BPM`, 8, 18); ctx.fillText(target().instrument, 8, 34);
}

function describe() {
  const picked = [...selection];
  const count = line().length, changedNotes = edits.has(current) && edited(target(), line());
  const where = (n: LineNote) => `bar ${Math.floor(n.step / 16) + 1} · beat ${Math.floor((n.step % 16) / 4) + 1}.${n.step % 4 + 1}`;
  info.textContent = picked.length === 1
    ? `${pitchName(picked[0].pitch)} · ${where(picked[0])} · level ${picked[0].gain.toFixed(3)}${silent(picked[0]) ? ' · silent: it would grind into the next chord' : ''}`
    : picked.length ? `${picked.length} notes selected` : `${count} notes${changedNotes ? ' · edited' : ' · original'} · cursor at bar ${Math.floor(cursor / 16) + 1}`;
}

// ---- Sound ----
let context: AudioContext | null = null, mixer: AudioMixer | null = null;
function audio() {
  if (!context) {
    try {
      context = new AudioContext({ latencyHint: 'interactive' });
      mixer = new AudioMixer(context, { muted: false, music: 1, effects: .55 });
      mixer.setActive(true); mixer.setMenuMix(MENU_LEVEL, 0);
    } catch { say('This browser has no Web Audio.'); return null; }
  }
  if (context.state !== 'running') void context.resume();
  return mixer;
}
function audition(note: LineNote) {
  const m = audio();
  if (!m || !context) return;
  const { hold: _hold, ...written } = note.template, at = context.currentTime + .02;
  m.note({ ...written, pitch: note.pitch, gain: note.gain, offset: 0, ...(target().menu ? { hold: .6 } : {}) } as Note, at, false, undefined, false, target().menu);
}
let playing = false, nextStep = 0, nextAt = 0, timer: ReturnType<typeof setInterval> | undefined;
const queued: { step: number; at: number }[] = [];
function loopRange() {
  const a = clamp(Math.round(Number(fromInput.value)) || 1, 1, 32), b = clamp(Math.round(Number(toInput.value)) || 32, a, 32);
  return { from: (a - 1) * 16, to: b * 16 };
}
async function play() {
  const m = audio();
  if (!m || !context) return;
  const needed = new Set<string>();
  for (let s = 0; s < STEPS; s++) for (const note of notesAt(target(), s, line())) needed.add(note.instrument);
  while ([...needed].some(id => !m.ready(id as Note['instrument']))) {
    say('Preparing the instruments…', true);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  say('');
  const { from, to } = loopRange();
  playing = true; playButton.textContent = '■ Stop'; playButton.classList.add('on');
  nextStep = cursor >= from && cursor < to ? cursor : from; nextAt = context.currentTime + .08; queued.length = 0;
  clearInterval(timer); timer = setInterval(tick, 25); tick();
  requestAnimationFrame(frame);
}
function tick() {
  if (!playing || !context || !mixer) return;
  const t = target(), duration = 15 / t.bpm, { from, to } = loopRange();
  const lead = hear === 'original' ? t.original : line();
  while (nextAt < context.currentTime + .15) {
    if (nextStep < from || nextStep >= to) nextStep = from;
    for (const note of notesAt(t, nextStep, lead, { accompaniment: !soloInput.checked })) mixer.note(note, nextAt, false, nextStep, t.legacy, t.menu);
    queued.push({ step: nextStep, at: nextAt });
    nextAt += duration; nextStep++;
  }
}
function stop() {
  playing = false; clearInterval(timer); timer = undefined; playStep = -1; queued.length = 0;
  mixer?.stopGroup('music'); mixer?.stopGroup('menu');
  playButton.textContent = '▶ Play'; playButton.classList.remove('on'); draw();
}
function frame() {
  if (!playing || !context) return;
  const now = context.currentTime;
  while (queued.length > 1 && queued[1].at <= now) queued.shift();
  if (queued.length && queued[0].at <= now) playStep = queued[0].step;
  if (followInput.checked && playStep >= 0 && !drag) {
    const x = playStep * stepW, view = scroll.clientWidth - KEY;
    if (x < sx() || x > sx() + view - 40) scroll.scrollLeft = Math.max(0, x - view * .2);
  }
  draw();
  requestAnimationFrame(frame);
}

// ---- Editing ----
type Drag =
  | { kind: 'move'; x0: number; y0: number; origin: Map<LineNote, { step: number; pitch: number }>; pushed: boolean; last: string }
  | { kind: 'level'; notes: LineNote[] }
  | { kind: 'marquee' };
let drag: Drag | null = null;
let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
const point = (event: PointerEvent | MouseEvent | WheelEvent) => {
  const rect = scroll.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};
const stepAt = (x: number) => (x - KEY + sx()) / stepW;
const pitchAt = (y: number) => hi - Math.floor((y - RULER + sy()) / ROW);
function hit(x: number, y: number): LineNote | null {
  const notes = line(), lengthOf = lengths(notes);
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i], nx = xOf(n.step), ny = yOf(n.pitch);
    if (x >= nx && x < nx + lengthOf.get(n)! * stepW && y >= ny && y < ny + ROW) return n;
  }
  return null;
}
function levelAt(y: number) { return Math.round(clamp((scroll.clientHeight - 6 - y) / (VEL - 14), .02, 1) * maxGain() * 1000) / 1000; }
function remove(notes: Iterable<LineNote>) {
  const gone = new Set(notes);
  if (!gone.size) return;
  pushUndo();
  const edit = edits.get(current)!;
  edit.line = edit.line.filter(n => !gone.has(n));
  selection = new Set(); changed();
}
/** The editable note matching a note of the shown line (the original until the first edit copies it). */
function match(note: LineNote) { return editable().find(n => n.step === note.step && n.pitch === note.pitch && n.gain === note.gain); }
/** Ensures the selection refers to the editable copies. */
function own() {
  if (edits.has(current)) return;
  const picked = [...selection];
  editable();
  selection = new Set(picked.map(match).filter((n): n is LineNote => !!n));
}

scroll.addEventListener('contextmenu', event => event.preventDefault());
scroll.addEventListener('pointerdown', event => {
  const { x, y } = point(event);
  if (x > scroll.clientWidth || y > scroll.clientHeight) return; // The scrollbars.
  scroll.focus({ preventScroll: true });
  if (y < RULER && x > KEY) {
    const raw = Math.floor(stepAt(x));
    cursor = clamp(event.shiftKey ? raw : Math.floor(raw / 16) * 16, 0, STEPS - 1);
    if (playing) { stop(); void play(); }
    draw(); describe(); return;
  }
  if (x < KEY && y > RULER && y < scroll.clientHeight - VEL) {
    audition({ step: 0, pitch: pitchAt(y), gain: target().original[0]?.gain ?? .12, template: templateAt(target(), 0) }); return;
  }
  if (y > scroll.clientHeight - VEL && x > KEY) {
    const s = stepAt(x), notes = line();
    const under = notes.filter(n => s >= n.step && s < n.step + Math.max(1, 4 / stepW + .99)).sort((a, b) => b.step - a.step)[0]
      ?? notes.reduce<LineNote | null>((best, n) => (n.step <= s && (!best || n.step > best.step) ? n : best), null);
    if (!under) return;
    own(); pushUndo();
    const mine = match(under) ?? under, targets = selection.has(mine) ? [...selection] : [mine];
    for (const n of targets) n.gain = levelAt(y);
    drag = { kind: 'level', notes: targets };
    scroll.setPointerCapture(event.pointerId); changed(); return;
  }
  if (x < KEY || y < RULER || y > scroll.clientHeight - VEL) return;
  const found = hit(x, y);
  if (event.button === 2) { if (found) { own(); remove([match(found) ?? found]); } return; }
  if (found) {
    own();
    const mine = match(found) ?? found;
    if (event.shiftKey) { if (selection.has(mine)) selection.delete(mine); else selection.add(mine); }
    else if (!selection.has(mine)) selection = new Set([mine]);
    audition(mine);
  } else if (event.shiftKey) {
    marquee = { x0: x, y0: y, x1: x, y1: y }; drag = { kind: 'marquee' };
    scroll.setPointerCapture(event.pointerId); draw(); return;
  } else {
    pushUndo();
    const step = clamp(Math.floor(Math.floor(stepAt(x)) / snap()) * snap(), 0, STEPS - 1), pitch = clamp(pitchAt(y), lo, hi);
    const template = templateAt(target(), step);
    const note: LineNote = { step, pitch, gain: target().original.find(n => n.step === step)?.gain ?? template.gain, template };
    editable().push(note); selection = new Set([note]); audition(note); changed();
    drag = { kind: 'move', x0: x, y0: y, origin: new Map([[note, { step, pitch }]]), pushed: true, last: '0:0' };
    scroll.setPointerCapture(event.pointerId); return;
  }
  drag = { kind: 'move', x0: x, y0: y, origin: new Map([...selection].map(n => [n, { step: n.step, pitch: n.pitch }])), pushed: false, last: '0:0' };
  scroll.setPointerCapture(event.pointerId); draw(); describe();
});
scroll.addEventListener('pointermove', event => {
  if (!drag) return;
  const { x, y } = point(event);
  if (drag.kind === 'level') { for (const n of drag.notes) n.gain = levelAt(y); changed(); return; }
  if (drag.kind === 'marquee' && marquee) {
    marquee.x1 = x; marquee.y1 = y;
    const a = Math.min(marquee.x0, x), b = Math.max(marquee.x0, x), c = Math.min(marquee.y0, y), d = Math.max(marquee.y0, y);
    own();
    selection = new Set(line().filter(n => xOf(n.step) + stepW > a && xOf(n.step) < b && yOf(n.pitch) + ROW > c && yOf(n.pitch) < d));
    draw(); describe(); return;
  }
  if (drag.kind !== 'move') return;
  const dStep = Math.round((x - drag.x0) / stepW / snap()) * snap(), dPitch = Math.round((drag.y0 - y) / ROW), key = `${dStep}:${dPitch}`;
  if (key === drag.last) return;
  const pitchMoved = Number(drag.last.split(':')[1]) !== dPitch;
  if (!drag.pushed) { pushUndo(); drag.pushed = true; }
  drag.last = key;
  for (const [n, o] of drag.origin) {
    n.step = clamp(o.step + dStep, 0, STEPS - 1); n.pitch = clamp(o.pitch + dPitch, lo, hi);
    n.template = templateAt(target(), n.step);
  }
  if (pitchMoved) { const first = drag.origin.keys().next().value; if (first) audition(first); }
  changed();
});
const endDrag = () => { if (drag?.kind === 'marquee') marquee = null; drag = null; draw(); describe(); };
scroll.addEventListener('pointerup', endDrag);
scroll.addEventListener('pointercancel', endDrag);
scroll.addEventListener('dblclick', event => {
  const { x, y } = point(event), found = hit(x, y);
  if (found) remove([match(found) ?? found]);
});
scroll.addEventListener('wheel', event => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const { x } = point(event), at = stepAt(x);
  stepW = clamp(stepW * (event.deltaY < 0 ? 1.15 : 1 / 1.15), 6, 44); zoomInput.value = String(Math.round(stepW));
  layout(); scroll.scrollLeft = Math.max(0, at * stepW - (x - KEY)); draw();
}, { passive: false });
scroll.addEventListener('scroll', () => draw());
new ResizeObserver(() => draw()).observe(scroll);

function nudge(dStep: number, dPitch: number) {
  if (!selection.size) return;
  own(); pushUndo();
  for (const n of selection) {
    n.step = clamp(n.step + dStep, 0, STEPS - 1); n.pitch = clamp(Math.round((n.pitch + dPitch) * 100) / 100, lo, hi);
    n.template = templateAt(target(), n.step);
  }
  if (dPitch) audition([...selection][0]);
  changed();
}
window.addEventListener('keydown', event => {
  const typing = event.target instanceof HTMLElement && event.target.closest('input, textarea, select');
  if (typing) return;
  const mod = event.ctrlKey || event.metaKey;
  if (event.code === 'Space') { event.preventDefault(); if (playing) stop(); else void play(); }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(selection); }
  else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault(); const sign = event.key === 'ArrowUp' ? 1 : -1;
    nudge(0, sign * (event.shiftKey ? 12 : event.altKey ? .5 : 1));
  } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !mod) {
    event.preventDefault(); nudge((event.key === 'ArrowRight' ? 1 : -1) * snap(), 0);
  } else if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); restore(event.shiftKey ? 'redo' : 'undo'); }
  else if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); restore('redo'); }
  else if (mod && event.key.toLowerCase() === 'a') { event.preventDefault(); own(); selection = new Set(line()); draw(); describe(); }
  else if (mod && event.key.toLowerCase() === 'c') {
    const picked = [...selection]; if (!picked.length) return;
    const first = Math.min(...picked.map(n => n.step));
    clipboard = picked.map(n => ({ offset: n.step - first, pitch: n.pitch, gain: n.gain })); say(`Copied ${picked.length} notes`);
  } else if (mod && event.key.toLowerCase() === 'v') {
    if (!clipboard.length) return;
    event.preventDefault(); pushUndo();
    const pasted = clipboard.filter(c => cursor + c.offset < STEPS).map(c => {
      const step = cursor + c.offset;
      return { step, pitch: c.pitch, gain: c.gain, template: templateAt(target(), step) };
    });
    editable().push(...pasted); selection = new Set(pasted); changed(); say(`Pasted ${pasted.length} notes at bar ${Math.floor(cursor / 16) + 1}`);
  } else if (event.key === 'Escape') { selection = new Set(); draw(); describe(); }
});

// ---- Controls ----
songSelect.addEventListener('change', () => setSong(songSelect.value as SongId));
playButton.addEventListener('click', () => { if (playing) stop(); else void play(); });
for (const input of [fromInput, toInput]) input.addEventListener('change', () => draw());
for (const button of root.querySelectorAll<HTMLButtonElement>('[data-hear]')) {
  button.addEventListener('click', () => {
    hear = button.dataset.hear as typeof hear;
    for (const other of root.querySelectorAll('[data-hear]')) other.classList.toggle('on', other === button);
  });
}
ghostInput.addEventListener('change', () => draw());
zoomInput.addEventListener('input', () => {
  const middle = stepAt(KEY + (scroll.clientWidth - KEY) / 2);
  stepW = Number(zoomInput.value); layout(); scroll.scrollLeft = Math.max(0, middle * stepW - (scroll.clientWidth - KEY) / 2); draw();
});
find('.mel-undo').addEventListener('click', () => restore('undo'));
find('.mel-redo').addEventListener('click', () => restore('redo'));
find('.mel-reset').addEventListener('click', () => {
  if (!edits.has(current) || !confirm(`Reset ${target().world}'s lead to the original? (Undo brings it back.)`)) return;
  pushUndo(); edits.get(current)!.line = target().original.map(n => ({ ...n })); selection = new Set(); changed();
});
find('.mel-save').addEventListener('click', () => void save());
find('.mel-download').addEventListener('click', () => { download(JSON.stringify(form(), null, 2)); say('Downloaded melody-edits.json'); });
const fileInput = find<HTMLInputElement>('.mel-file');
find('.mel-import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]; fileInput.value = '';
  if (!file) return;
  try {
    const loaded = loadForm(JSON.parse(await file.text()));
    for (const [id, edit] of loaded) edits.set(id, edit);
    history.clear(); setSong(current); changed(); say(`Imported ${loaded.size} song${loaded.size === 1 ? '' : 's'}`);
  } catch { say('That file is not a melody edit file.'); }
});
comment.addEventListener('input', () => {
  const edit = edits.get(current);
  if (edit) edit.comment = comment.value;
  else edits.set(current, { line: target().original.map(n => ({ ...n })), comment: comment.value });
  changed();
});
window.addEventListener('beforeunload', event => { if (unsaved()) event.preventDefault(); });

prefetchSamples();
void load().then(() => setSong(current));
