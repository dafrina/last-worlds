import type { Difficulty, GameUi, GraphicsQuality, RunConfig, RunState, UiActions, WeaponId } from '../shared/contracts';
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
  const shell = document.createElement('main');
  shell.className = 'last-worlds-shell';
  shell.innerHTML = `
    <aside class="flight-rail rail-left" aria-hidden="true">
      <span class="rail-mark">LW / 01</span>
      <span class="rail-rule"></span>
      <p>LOW ORBIT.<br>NO WAY BACK.</p>
      <span class="rail-foot">KHEPRI EXPEDITION<br>FLIGHT PROTOTYPE</span>
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
        <section class="menu-panel" role="dialog" aria-modal="true" aria-labelledby="game-title">
          <div class="menu-topline"><span>01 / KHEPRI</span><span class="status-dot">FLIGHT PROTOTYPE</span></div>
          <div class="wordmark"><p class="eyebrow">AN ARCADE EXPEDITION</p><h1 id="game-title">LAST<br>WORLDS</h1></div>
          <p class="menu-intro">One fighter.<br>An unfamiliar world below.</p>
          <div class="menu-launches">
            <button type="button" class="arcade-button primary" data-action="endless"><span>ENDLESS</span><span class="button-arrow" aria-hidden="true">↗</span></button>
            <p class="button-caption">A fresh ship. An escalating fight.</p>
            <button type="button" class="arcade-button secondary" data-action="campaign" aria-expanded="false" aria-controls="campaign-options"><span>CAMPAIGN FLIGHT</span><span class="button-arrow" aria-hidden="true">+</span></button>
            <div id="campaign-options" class="campaign-options" hidden>
              <p>120-second test sortie</p>
              <div class="setup-fields"><label>DIFFICULTY<select name="difficulty" aria-label="Campaign difficulty"><option value="relaxed">Relaxed</option><option value="standard" selected>Standard</option><option value="veteran">Veteran</option></select></label><label>MAIN WEAPON<select name="weapon" aria-label="Main weapon"><option value="pulse">Pulse · straight</option><option value="fan">Scatter · fan</option><option value="seeker">Seeker · homing</option></select></label></div>
              <button type="button" class="arcade-button compact" data-action="launch-campaign">LAUNCH SORTIE <span aria-hidden="true">↗</span></button>
            </div>
          </div>
          <div class="menu-instructions"><p>HOLD EITHER SIDE TO STEER</p><p>Main fire opens when a target is in range.<br>Tap the center button for a shockwave.</p><p class="keyboard-help">A / D or ← / → · SPACE special · ESC pause</p></div>
          <p class="prototype-note">Procedural terrain. Authored battles.<br>Campaign progression is still in development.</p>
          <div class="flight-settings"><button type="button" class="sound-toggle" data-sound aria-label="Mute sound" aria-pressed="false">SOUND ON</button><label>GRAPHICS<select data-graphics aria-label="Graphics quality"><option value="high">High</option><option value="low">Low</option></select></label></div>
        </section>
        <section class="pause-panel short-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden>
          <p class="eyebrow">FLIGHT SUSPENDED</p><h2 id="pause-title">PAUSED</h2>
          <p class="pause-description"></p>
          <dl class="pause-loadout"><div><dt>MAIN</dt><dd class="pause-weapon"></dd></div><div><dt>SPECIAL</dt><dd>Shockwave</dd></div><div><dt>SHIELD / REACTOR</dt><dd>Standard / Balanced</dd></div></dl>
          <p class="resume-countdown" role="status" hidden></p>
          <button type="button" class="arcade-button primary" data-action="resume">RESUME <span aria-hidden="true">↗</span></button>
          <button type="button" class="arcade-button secondary" data-action="quit">RETURN TO MENU</button>
          <p class="panel-note">Hold left or right to steer. Space or the center button triggers your special.</p>
          <div class="flight-settings"><button type="button" class="sound-toggle" data-sound aria-label="Mute sound" aria-pressed="false">SOUND ON</button><label>GRAPHICS<select data-graphics aria-label="Graphics quality"><option value="high">High</option><option value="low">Low</option></select></label></div>
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
      <span class="rail-coordinate">36° / 12°</span><span class="rail-rule"></span>
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
  const campaignToggle = find<HTMLButtonElement>('[data-action="campaign"]');
  const campaignOptions = find<HTMLElement>('.campaign-options');
  const difficultySelect = find<HTMLSelectElement>('[name="difficulty"]');
  const weaponSelect = find<HTMLSelectElement>('[name="weapon"]');
  let lastState: RunState | null = null;
  let displayedPhase = 'menu';
  let lastConfig: RunConfig = { mode: 'endless', seed: 1 };
  let iconKey = '';
  let error = false;
  let muted = false;
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
    for (const panel of panels) panel.hidden = !panel.classList.contains(className);
    if (focusSelector) find<HTMLElement>(focusSelector).focus({ preventScroll: true });
  }
  function launch(config: RunConfig) {
    cancelResume();
    lastConfig = config;
    actions.start(config);
    surface.focus({ preventScroll: true });
  }
  function onAction(action: string, handler: () => void) {
    find(`[data-action="${action}"]`).addEventListener('click', handler, options);
  }
  onAction('endless', () => launch({ mode: 'endless', seed: seed() }));
  onAction('campaign', () => {
    campaignOptions.hidden = !campaignOptions.hidden;
    campaignToggle.setAttribute('aria-expanded', String(!campaignOptions.hidden));
    const arrow = campaignToggle.querySelector('.button-arrow');
    if (arrow) arrow.textContent = campaignOptions.hidden ? '+' : '−';
    if (!campaignOptions.hidden) difficultySelect.focus({ preventScroll: true });
  });
  onAction('launch-campaign', () => launch({
    mode: 'campaign', seed: seed(), difficulty: difficultySelect.value as Difficulty,
    weapon: weaponSelect.value as WeaponId,
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
        soundButton.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
        soundButton.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
        soundButton.setAttribute('aria-pressed', String(muted));
      }
    }, options);
  }

  // Keep keyboard navigation inside whichever modal panel is actually visible.
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && displayedPhase === 'paused') {
      event.preventDefault();
      resume();
    }
    if (event.key !== 'Tab') return;
    const focusables = [...overlay.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]')]
      .filter((element) => !element.closest('[hidden]') && !element.hasAttribute('disabled'));
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first && last) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last && first) {
      event.preventDefault(); first.focus();
    }
  }, options);
  window.addEventListener('blur', cancelResume, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelResume();
  }, options);

  function showMenu() {
    cancelResume();
    error = false;
    displayedPhase = 'menu';
    lastState = null;
    surface.dataset.inputActive = 'false';
    surface.classList.remove('is-playing');
    hud.hidden = specialButton.hidden = hints.hidden = message.hidden = true;
    showPanel('menu-panel', '[data-action="endless"]');
  }

  function update(state: RunState | null) {
    if (error) return;
    if (!state) {
      if (displayedPhase !== 'menu') showMenu();
      return;
    }
    lastConfig = state.config;
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
        : `Campaign flight · ${difficultyNames[state.config.difficulty ?? 'standard']}`);
      text('.pause-weapon', weaponNames[state.player.weapon]);
      showPanel('pause-panel', '[data-action="resume"]');
    } else if (changed && (state.phase === 'over' || state.phase === 'complete')) {
      const campaign = state.config.mode === 'campaign';
      text('.result-mode', campaign ? 'CAMPAIGN FLIGHT' : 'ENDLESS / KHEPRI');
      text('#results-title', state.phase === 'complete' ? 'SORTIE COMPLETE' : 'FLIGHT ENDED');
      text('.result-subtitle', state.phase === 'complete' ? 'You made it through the proving ground.' : 'Every flight leaves a mark.');
      text('.result-score', String(Math.floor(state.score)).padStart(6, '0'));
      text('.result-kills', String(state.kills));
      text('.result-time', duration(state.time));
      text('.result-sector', String(state.sector));
      find<HTMLElement>('.result-sector-row').hidden = campaign;
      find<HTMLElement>('.result-score-row').hidden = campaign;
      text('.result-note', campaign
        ? `${difficultyNames[state.config.difficulty ?? 'standard']} · ${weaponNames[state.config.weapon ?? 'pulse']}. This test sortie does not save campaign progress.`
        : 'Every new run begins with the same starter equipment. Campaign progress never carries over.');
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
      showPanel('error-panel');
    },
    dispose() { cancelResume(); abort.abort(); shell.remove(); },
  };
}
