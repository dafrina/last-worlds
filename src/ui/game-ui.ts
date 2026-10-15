import type { Difficulty, GameUi, GraphicsQuality, MissionId, RunConfig, RunState, UiActions, WeaponId } from '../shared/contracts';
import { missionText } from './missions';
import { menuMarkup } from './menu-markup';
import { createFlightLog } from './flight-log';
import './styles.css';

const shipGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 15 10 21 15 21 19 14 17 14 21 10 21 10 17 3 19 3 15 9 10Z"/></svg>';
const shieldGlyph = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M3 4 10 2 17 4 17 12Q17 17 10 22Q3 17 3 12Z"/></svg>';
const weaponNames: Record<WeaponId, string> = { pulse: 'Pulse / straight', fan: 'Scatter / fan', seeker: 'Seeker / homing' };
const difficultyNames: Record<Difficulty, string> = { relaxed: 'Relaxed', standard: 'Standard', veteran: 'Veteran' };

function seed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function createUi(root: HTMLElement, actions: UiActions): GameUi {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* Private storage may be unavailable. */ }
  const flightLog = createFlightLog(storage);
  const shell = document.createElement('main');
  shell.className = 'last-worlds-shell';
  shell.innerHTML = `
    <aside class="flight-rail rail-left" aria-hidden="true">
      <span class="rail-mark">LW / 01</span>
      <span class="rail-rule"></span>
      <p>LOW ORBIT.<br>NO WAY BACK.</p>
      <span class="rail-foot">LAST WORLDS<br>FLIGHT COMMAND</span>
    </aside>
    <section class="flight-frame" tabindex="0" aria-label="Flight area. Hold the left or right half to steer." data-input-active="false">
      <canvas class="flight-canvas" aria-label="Three-dimensional arcade flight"></canvas>
      <div class="flight-grain" aria-hidden="true"></div>
      <header class="flight-hud" hidden>
        <div class="protection-icons">
          <div class="lives-icons" role="img" aria-label="3 lives remaining"></div>
          <div class="shield-icons" role="img" aria-label="3 shield charges remaining"></div>
        </div>
        <div class="hud-right">
          <span class="score" aria-label="Score">000000</span>
          <button type="button" class="pause-button" aria-label="Pause flight" data-no-steer><span aria-hidden="true">Ⅱ</span></button>
        </div>
      </header>
      <div class="steering-hints" aria-hidden="true" hidden>
        <span><b>‹</b> HOLD LEFT</span><span>HOLD RIGHT <b>›</b></span>
      </div>
      <p class="flight-message" role="status" hidden></p>
      <button type="button" class="special-button" aria-label="Activate shockwave" data-no-steer hidden>
        <svg class="special-glyph" viewBox="0 0 24 28" aria-hidden="true"><path d="M14 2 4 16H11L9 26 20 11H13Z"/></svg>
        <span class="charge-ticks" aria-hidden="true">${Array.from({ length: 6 }, () => '<i></i>').join('')}</span>
      </button>
      <div class="flight-overlay" data-no-steer>
        ${menuMarkup}
        <section class="pause-panel short-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden>
          <p class="eyebrow">FLIGHT SUSPENDED</p><h2 id="pause-title">PAUSED</h2>
          <p class="pause-description"></p>
          <dl class="pause-loadout"><div><dt>MAIN</dt><dd class="pause-weapon"></dd></div><div><dt>SPECIAL</dt><dd>Shockwave</dd></div><div><dt>SHIELD / REACTOR</dt><dd>Standard / Balanced</dd></div></dl>
          <p class="resume-countdown" role="status" hidden></p>
          <button type="button" class="arcade-button primary" data-action="resume">RESUME <span aria-hidden="true">↗</span></button>
          <button type="button" class="arcade-button secondary" data-action="quit">RETURN TO MENU</button>
          <button type="button" class="text-button" data-action="pause-settings">SETTINGS</button>
        </section>
        <section class="results-panel short-panel" role="dialog" aria-modal="true" aria-labelledby="results-title" hidden>
          <p class="eyebrow result-mode"></p><h2 id="results-title">FLIGHT<br>ENDED</h2>
          <p class="result-subtitle"></p>
          <dl class="result-stats"><div class="result-score-row"><dt>SCORE</dt><dd class="result-score"></dd></div><div><dt>HOSTILES DOWN</dt><dd class="result-kills"></dd></div><div><dt>FLIGHT TIME</dt><dd class="result-time"></dd></div><div class="result-sector-row"><dt>SECTOR REACHED</dt><dd class="result-sector"></dd></div></dl>
          <button type="button" class="arcade-button primary" data-action="retry">FLY AGAIN <span aria-hidden="true">↗</span></button>
          <button type="button" class="arcade-button secondary" data-action="menu">RETURN TO MENU</button>
          <p class="panel-note result-note"></p>
        </section>
        <section class="error-panel short-panel" role="alert" hidden><p class="eyebrow">FLIGHT UNAVAILABLE</p><h2>NO SIGNAL</h2><p class="error-message"></p><p class="panel-note">Try a browser with WebGL 2 and hardware acceleration enabled.</p></section>
      </div>
    </section>
    <aside class="flight-rail rail-right" aria-hidden="true">
      <span class="rail-coordinate">LW / 01</span><span class="rail-rule"></span>
      <p>HOLD YOUR LINE.<br>FIND YOUR WAY.</p>
      <span class="rail-foot">A / D &nbsp; STEER<br>SPACE &nbsp; SPECIAL<br>ESC &nbsp; PAUSE</span>
    </aside>`;
  root.replaceChildren(shell);

  function find<T extends Element = HTMLElement>(selector: string): T {
    const found = shell.querySelector<T>(selector);
    if (!found) throw new Error(`Missing UI element: ${selector}`);
    return found;
  }
  const surface = find<HTMLElement>('.flight-frame');
  const canvas = find<HTMLCanvasElement>('canvas');
  const specialButton = find<HTMLButtonElement>('.special-button');
  const overlay = find<HTMLElement>('.flight-overlay');
  const panels = [...overlay.querySelectorAll<HTMLElement>('section')];
  const hud = find<HTMLElement>('.flight-hud');
  const lives = find<HTMLElement>('.lives-icons');
  const shields = find<HTMLElement>('.shield-icons');
  const score = find<HTMLElement>('.score');
  const hints = find<HTMLElement>('.steering-hints');
  const message = find<HTMLElement>('.flight-message');
  const ticks = [...specialButton.querySelectorAll<HTMLElement>('.charge-ticks i')];
  const difficultySelect = find<HTMLSelectElement>('[name="difficulty"]');
  const weaponSelect = find<HTMLSelectElement>('[name="weapon"]');
  const missionSelect = find<HTMLSelectElement>('[name="mission"]');
  missionSelect.addEventListener('change', () => text('.mission-description', missionText(missionSelect.value as MissionId).brief), options);
  let lastState: RunState | null = null;
  let displayedPhase = 'menu';
  let lastConfig: RunConfig = { mode: 'endless', seed: 1 };
  let iconKey = '';
  let error = false;
  let muted = false;
  let currentPanel = 'menu-panel';
  let settingsParent = 'menu-panel';
  let helpParent = 'menu-panel';
  let statisticsMode: 'campaign' | 'endless' = 'endless';
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;
  const resumeButton = find<HTMLButtonElement>('[data-action="resume"]');
  const countdown = find<HTMLElement>('.resume-countdown');

  function cancelResume() {
    if (resumeTimer !== null) clearTimeout(resumeTimer);
    resumeTimer = null;
    countdown.hidden = true;
    resumeButton.disabled = false;
  }
  function resume() {
    if (resumeTimer !== null || displayedPhase !== 'paused') return;
    let remaining = 3;
    resumeButton.disabled = true;
    countdown.hidden = false;
    countdown.textContent = `READY IN ${remaining}`;
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) {
        cancelResume();
        actions.resume();
        surface.focus({ preventScroll: true });
      } else {
        countdown.textContent = `READY IN ${remaining}`;
        resumeTimer = setTimeout(next, 1000);
      }
    };
    resumeTimer = setTimeout(next, 1000);
  }

  function text(selector: string, value: string) {
    const element = find<HTMLElement>(selector);
    if (element.textContent !== value) element.textContent = value;
  }
  function showPanel(className: string, focusSelector?: string) {
    overlay.hidden = false;
    currentPanel = className;
    overlay.dataset.page = className;
    overlay.scrollTop = 0;
    for (const panel of panels) panel.hidden = !panel.classList.contains(className);
    const target = focusSelector ? find<HTMLElement>(focusSelector) : find<HTMLElement>(`.${className} button`);
    target.focus({ preventScroll: true });
  }
  function launch(config: RunConfig) {
    cancelResume();
    if (lastState) flightLog.observe(lastState, true);
    lastConfig = config;
    actions.start(config);
    surface.focus({ preventScroll: true });
  }
  function onAction(action: string, handler: () => void) {
    find(`[data-action="${action}"]`).addEventListener('click', handler, options);
  }
  onAction('endless', () => launch({ mode: 'endless', seed: seed() }));
  onAction('campaign', () => showPanel('campaign-panel', '.campaign-panel .back-button'));
  function renderStatistics() {
    const log = flightLog.read();
    const totals = log[statisticsMode];
    const campaign = statisticsMode === 'campaign';
    for (const tab of shell.querySelectorAll<HTMLButtonElement>('[data-stats-mode]')) {
      const selected = tab.dataset.statsMode === statisticsMode;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
    find('#statistics-content').setAttribute('aria-labelledby', `stats-${statisticsMode}-tab`);
    text('.stats-record-label', campaign ? 'SORTIES CLEARED' : 'BEST SCORE');
    text('.stats-record-value', totals.flights ? (campaign ? String(totals.clears) : totals.bestScore.toLocaleString()) : '—');
    text('[data-stat="flights"]', String(totals.flights));
    text('[data-stat="kills"]', totals.kills.toLocaleString());
    text('[data-stat="time"]', duration(totals.seconds));
    text('[data-stat="lives"]', String(totals.livesLost));
    text('[data-stat="specials"]', String(totals.specials));
    text('.stats-progress-label', campaign ? 'CLEAR RATE' : 'FURTHEST SECTOR');
    const finalized = totals.clears + totals.lost + totals.retired;
    text('[data-stat="progress"]', campaign ? (finalized ? `${Math.round(totals.clears / finalized * 100)}%` : '—') : totals.bestSector ? String(totals.bestSector) : '—');
    const recent = log.recent.filter(record => record.mode === statisticsMode).slice(0, 3);
    find<HTMLElement>('.statistics-empty').hidden = recent.length > 0;
    const history = find<HTMLOListElement>('.statistics-history');
    history.replaceChildren(...recent.map(record => {
      const li = document.createElement('li');
      const title = document.createElement('span');
      const detail = document.createElement('small');
      const value = document.createElement('b');
      const outcome = { interrupted: 'Interrupted', complete: 'Cleared', lost: 'Lost', retired: 'Retired' }[record.outcome];
      title.textContent = campaign ? record.mission : `Sector ${record.sector}`;
      detail.textContent = `${campaign ? `${difficultyNames[record.difficulty]} · ` : ''}${outcome} · ${duration(record.seconds)}`;
      value.textContent = campaign ? `${record.kills} down` : record.score.toLocaleString();
      title.append(detail); li.append(title, value); return li;
    }));
    text('.statistics-note', flightLog.status() === 'saved' ? 'Saved on this browser. Flights count from this build onward.'
      : flightLog.status() === 'unreadable' ? 'Previous log could not be read and was kept intact. New stats are session-only.' : 'Storage unavailable. Stats last for this session.');
  }
  onAction('statistics', () => { renderStatistics(); showPanel('statistics-panel'); });
  for (const tab of shell.querySelectorAll<HTMLButtonElement>('[data-stats-mode]')) {
    tab.addEventListener('click', () => { statisticsMode = tab.dataset.statsMode as typeof statisticsMode; renderStatistics(); }, options);
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      statisticsMode = event.key === 'Home' ? 'endless' : event.key === 'End' ? 'campaign' : statisticsMode === 'endless' ? 'campaign' : 'endless';
      renderStatistics(); find<HTMLElement>(`[data-stats-mode="${statisticsMode}"]`).focus();
    }, options);
  }
  function openSettings(parent: string) { cancelResume(); settingsParent = parent; showPanel('settings-panel'); }
  onAction('settings', () => openSettings('menu-panel'));
  onAction('pause-settings', () => openSettings('pause-panel'));
  onAction('help', () => { helpParent = 'menu-panel'; showPanel('help-panel'); });
  onAction('settings-help', () => { helpParent = 'settings-panel'; showPanel('help-panel'); });
  function navigateBack() {
    if (currentPanel === 'settings-panel') showPanel(settingsParent, settingsParent === 'pause-panel' ? '[data-action="pause-settings"]' : '[data-action="settings"]');
    else if (currentPanel === 'help-panel') showPanel(helpParent, helpParent === 'settings-panel' ? '[data-action="settings-help"]' : '[data-action="help"]');
    else if (currentPanel === 'campaign-panel') showPanel('menu-panel', '[data-action="campaign"]');
    else if (currentPanel === 'statistics-panel') showPanel('menu-panel', '[data-action="statistics"]');
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-back], [data-settings-back], [data-help-back]')) button.addEventListener('click', navigateBack, options);
  onAction('launch-campaign', () => launch({
    mode: 'campaign', seed: seed(), difficulty: difficultySelect.value as Difficulty,
    weapon: weaponSelect.value as WeaponId, mission: missionSelect.value as MissionId,
  }));
  onAction('resume', resume);
  onAction('quit', () => { cancelResume(); actions.quit(); });
  onAction('menu', () => { cancelResume(); actions.quit(); });
  onAction('retry', () => launch({ ...lastConfig, seed: seed() }));
  find('.pause-button').addEventListener('click', () => actions.pause(), options);
  const soundButtons = [...shell.querySelectorAll<HTMLButtonElement>('[data-sound]')];
  const graphicsSelects = [...shell.querySelectorAll<HTMLSelectElement>('[data-graphics]')];
  for (const select of graphicsSelects) {
    select.addEventListener('change', () => {
      const quality = select.value as GraphicsQuality;
      actions.setQuality(quality);
      for (const other of graphicsSelects) other.value = quality;
    }, options);
  }
  for (const button of soundButtons) {
    button.addEventListener('click', () => {
      muted = !muted;
      actions.setMuted(muted);
      for (const soundButton of soundButtons) {
        soundButton.textContent = muted ? 'OFF' : 'ON';
        soundButton.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
        soundButton.setAttribute('aria-pressed', String(muted));
      }
    }, options);
  }

  // Keep keyboard navigation inside whichever modal panel is actually visible.
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentPanel === 'pause-panel') {
      event.preventDefault();
      resume();
    } else if (event.key === 'Escape') {
      event.preventDefault(); navigateBack();
    }
    if (event.key !== 'Tab') return;
    const focusables = [...overlay.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]')]
      .filter((element) => !element.closest('[hidden]') && !element.hasAttribute('disabled') && element.tabIndex >= 0);
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first && last) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last && first) {
      event.preventDefault(); first.focus();
    }
  }, options);
  window.addEventListener('blur', cancelResume, options);
  window.addEventListener('pagehide', () => { if (lastState) flightLog.observe(lastState, false, true); }, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelResume(); if (lastState) flightLog.observe(lastState, false, true); }
  }, options);

  function showMenu() {
    cancelResume();
    if (lastState) flightLog.observe(lastState, true);
    error = false;
    displayedPhase = 'menu';
    lastState = null;
    surface.dataset.inputActive = 'false';
    surface.classList.remove('is-playing');
    hud.hidden = specialButton.hidden = hints.hidden = message.hidden = true;
    showPanel('menu-panel', '[data-action="campaign"]');
  }

  function update(state: RunState | null) {
    if (error) return;
    if (!state) {
      if (displayedPhase !== 'menu') showMenu();
      return;
    }
    lastConfig = state.config;
    flightLog.observe(state);
    const changed = displayedPhase !== state.phase || lastState !== state;
    lastState = state;
    displayedPhase = state.phase;
    const playing = state.phase === 'playing';
    surface.dataset.inputActive = String(playing);
    surface.classList.toggle('is-playing', playing);
    hud.hidden = !playing;
    specialButton.hidden = !playing;
    hints.hidden = !playing || state.time >= 3;
    score.hidden = state.config.mode !== 'endless';
    const scoreText = String(Math.floor(state.score)).padStart(6, '0');
    if (score.textContent !== scoreText) score.textContent = scoreText;
    const nextIconKey = `${state.player.lives}/${state.player.shields}/${state.player.maxShields}`;
    if (iconKey !== nextIconKey) {
      iconKey = nextIconKey;
      lives.innerHTML = Array.from({ length: Math.max(0, state.player.lives) }, () => shipGlyph).join('');
      lives.setAttribute('aria-label', `${state.player.lives} lives remaining`);
      shields.innerHTML = Array.from({ length: state.player.maxShields }, (_, index) =>
        `<span class="${index < state.player.shields ? 'charged' : 'empty'}">${shieldGlyph}</span>`,
      ).join('');
      shields.setAttribute('aria-label', `${state.player.shields} of ${state.player.maxShields} shield charges remaining`);
    }
    const charge = Math.max(0, Math.min(1, state.player.specialCharge));
    const ready = charge >= 1;
    specialButton.classList.toggle('is-ready', ready);
    specialButton.setAttribute('aria-disabled', String(!ready));
    const chargeLabel = ready ? 'Activate shockwave. Ready.' : `Shockwave recharging. ${Math.floor(charge * 100)} percent.`;
    if (specialButton.getAttribute('aria-label') !== chargeLabel) specialButton.setAttribute('aria-label', chargeLabel);
    ticks.forEach((tick, index) => tick.classList.toggle('charged', (index + 1) / ticks.length <= charge));
    const activeMessage = playing && state.messageUntil > state.time ? state.message : '';
    if (message.textContent !== activeMessage) message.textContent = activeMessage;
    message.hidden = !activeMessage;

    if (playing) {
      overlay.hidden = true;
    } else if (changed && state.phase === 'paused') {
      text('.pause-description', state.config.mode === 'endless'
        ? `Endless · Sector ${state.sector}`
        : `${missionText(state.config.mission).name} · ${difficultyNames[state.config.difficulty ?? 'standard']}`);
      text('.pause-weapon', weaponNames[state.player.weapon]);
      showPanel('pause-panel', '[data-action="resume"]');
    } else if (changed && (state.phase === 'over' || state.phase === 'complete')) {
      const campaign = state.config.mode === 'campaign';
      text('.result-mode', campaign ? 'CAMPAIGN FLIGHT' : `ENDLESS / ${(state.planet ?? 'khepri').toUpperCase()}`);
      text('#results-title', state.phase === 'complete' ? 'SORTIE COMPLETE' : 'FLIGHT ENDED');
      text('.result-subtitle', state.phase === 'complete'
        ? missionText(state.config.mission).complete
        : state.boss ? `${missionText(state.config.mission).boss ?? 'The enemy'} is still standing. Fly again.` : 'Every flight leaves a mark.');
      text('.result-score', String(Math.floor(state.score)).padStart(6, '0'));
      text('.result-kills', String(state.kills));
      text('.result-time', duration(state.time));
      text('.result-sector', String(state.sector));
      find<HTMLElement>('.result-sector-row').hidden = campaign;
      find<HTMLElement>('.result-score-row').hidden = campaign;
      text('.result-note', campaign
        ? `${difficultyNames[state.config.difficulty ?? 'standard']} · ${weaponNames[state.config.weapon ?? 'pulse']}`
        : 'New flight. Same starter. A higher score.');
      showPanel('results-panel', '[data-action="retry"]');
    }
  }

  return {
    canvas, surface, specialButton, update, showMenu,
    showError(errorMessage: string) {
      cancelResume();
      error = true;
      surface.dataset.inputActive = 'false';
      surface.classList.remove('is-playing');
      hud.hidden = specialButton.hidden = hints.hidden = message.hidden = true;
      text('.error-message', errorMessage);
      overlay.hidden = false;
      currentPanel = 'error-panel';
      for (const panel of panels) panel.hidden = !panel.classList.contains('error-panel');
    },
    dispose() { if (lastState) flightLog.observe(lastState, false, true); cancelResume(); abort.abort(); shell.remove(); },
  };
}
