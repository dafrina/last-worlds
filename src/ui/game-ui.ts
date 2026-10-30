import { VIEW, type Difficulty, type GameUi, type GraphicsQuality, type MissionId, type RunConfig, type RunState, type UiActions, type WeaponId } from '../shared/contracts';
import { SITES } from '../content/sites';
import { PICKUP_TINTS } from '../content/pickup-tints';
import { missionText } from './missions';
import { MISSION_ORDER, menuMarkup } from './menu-markup';
import { createPlanetPreview, prebakePlanets } from './planet-preview';
import { MISSION_PLANET } from '../content/missions';
import { createFlightLog, recordId } from './flight-log';
import { campaignConfig, cleared, createCampaignProfile, endlessConfig, lookOf, unlockedMissions, type AttemptOutcome, type Slot } from '../campaign/profile';
import { CREDIT_MULTIPLIER, SHIPS, REWARDS, SHIELD_TECH, SPECIALS } from '../content/equipment';
import { itemText, renderHangar, renderShipyard } from './hangar';
import './styles.css';

const shipGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 15 10 21 15 21 19 14 17 14 21 10 21 10 17 3 19 3 15 9 10Z"/></svg>';
const shieldGlyph = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M3 4 10 2 17 4 17 12Q17 17 10 22Q3 17 3 12Z"/></svg>';
const weaponNames: Record<WeaponId, string> = { pulse: 'Twin Pulse', fan: 'Fan Cannon', seeker: 'Seeker Array', rail: 'Rail Driver' };
/** Special button glyph per special: a bolt (Shockwave), stacked chevrons (Seeker Rack), a beam (Siege Lance), a ring
 * around a core (Gravity Well). */
const specialGlyphs: Record<string, string> = {
  shockwave: 'M14 2 4 16H11L9 26 20 11H13Z',
  'seeker-rack': 'M12 3 21 11 18 13 12 8 6 13 3 11ZM12 11 21 19 18 21 12 16 6 21 3 19Z',
  'siege-lance': 'M10 2H14V18L17 21V26H7V21L10 18Z',
  'gravity-well': 'M12 4A10 10 0 1 1 11.99 4ZM12 7A7 7 0 1 0 12.01 7ZM12 10A4 4 0 1 1 11.99 10Z',
};
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
  const campaign = createCampaignProfile(storage);
  /** Campaign attempt IDs by run: each attempt banks exactly once (campaign/profile.ts receipts). */
  const attempts = new WeakMap<RunState, string>();
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
      <div class="last-life-alarm" aria-hidden="true"></div>
      <header class="flight-hud" hidden>
        <div class="protection-icons">
          <div class="lives-icons" role="img" aria-label="3 lives remaining"></div>
          <div class="shield-icons" role="img" aria-label="3 shield charges remaining"></div>
        </div>
        <div class="hud-right">
          <span class="score" aria-label="Score">000000</span>
          <span class="hud-credits" aria-label="Campaign credits" hidden><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6Z"/></svg><b>0</b></span>
          <button type="button" class="pause-button" aria-label="Pause flight" data-no-steer><span aria-hidden="true">Ⅱ</span></button>
        </div>
      </header>
      <div class="steering-hints" aria-hidden="true" hidden>
        <span><b>‹</b> HOLD LEFT</span><span>HOLD RIGHT <b>›</b></span>
      </div>
      <p class="flight-message" role="status" hidden></p>
      <span class="site-marker" aria-hidden="true" hidden>?</span>
      <button type="button" class="special-button" aria-label="Activate shockwave" data-no-steer hidden>
        <span class="charge-ring" aria-hidden="true"></span>
        <svg class="special-glyph" viewBox="0 0 24 28" aria-hidden="true"><path d="M14 2 4 16H11L9 26 20 11H13Z"/></svg>
      </button>
      <div class="flight-overlay" data-no-steer>
        ${menuMarkup}
        <section class="loading-panel short-panel" role="status" aria-live="polite" hidden>
          <p class="eyebrow">LAST WORLDS</p><h2>PREPARING<br>FLIGHT</h2>
          <div class="loading-bar" aria-hidden="true"><span></span></div>
          <button type="button" class="arcade-button secondary" data-action="loading-cancel">RETURN TO MENU</button>
        </section>
        <section class="pause-panel short-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden>
          <p class="eyebrow">FLIGHT SUSPENDED</p><h2 id="pause-title">PAUSED</h2>
          <p class="pause-description"></p>
          <dl class="pause-loadout"><div><dt>MAIN</dt><dd class="pause-weapon"></dd></div><div><dt>SPECIAL</dt><dd class="pause-special"></dd></div><div><dt>SHIELD / SHIP</dt><dd class="pause-tech"></dd></div></dl>
          <p class="resume-countdown" role="status" hidden></p>
          <button type="button" class="arcade-button primary" data-action="resume">RESUME <span aria-hidden="true">↗</span></button>
          <button type="button" class="arcade-button secondary" data-action="quit">RETURN TO MENU</button>
          <button type="button" class="text-button" data-action="pause-settings">SETTINGS</button>
        </section>
        <section class="results-panel short-panel" role="dialog" aria-modal="true" aria-labelledby="results-title" hidden>
          <p class="eyebrow result-mode"></p><h2 id="results-title">FLIGHT<br>ENDED</h2>
          <p class="result-subtitle"></p>
          <dl class="result-stats"><div class="result-score-row"><dt>SCORE</dt><dd class="result-score"></dd></div><div><dt>HOSTILES DOWN</dt><dd class="result-kills"></dd></div><div><dt>FLIGHT TIME</dt><dd class="result-time"></dd></div><div class="result-sector-row"><dt>SECTOR REACHED</dt><dd class="result-sector"></dd></div></dl>
          <div class="result-credits" hidden><p class="result-breakdown"></p><p class="result-earned"><b></b><span></span></p><p class="result-parts" hidden></p><p class="result-unlock" hidden></p><p class="result-salvage" hidden></p></div>
          <button type="button" class="arcade-button primary" data-action="retry">FLY AGAIN <span aria-hidden="true">↗</span></button>
          <button type="button" class="arcade-button secondary" data-action="menu">RETURN TO MENU</button>
          <p class="panel-note result-note"></p>
        </section>
        <section class="error-panel short-panel" role="alert" hidden><p class="eyebrow">FLIGHT UNAVAILABLE</p><h2>NO SIGNAL</h2><p class="error-message"></p><p class="panel-note">Try a browser with WebGL 2 and hardware acceleration enabled.</p></section>
      </div>
    </section>
    <div class="rotate-notice" role="alert" aria-live="assertive">
      <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="16" y="6" width="16" height="30" rx="3"/><path d="M10 40Q24 48 38 40M34 36l4 4-5 2"/></svg>
      <p>TURN YOUR PHONE UPRIGHT</p><small>Last Worlds flies in portrait.</small>
    </div>
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
  const hudCredits = find<HTMLElement>('.hud-credits');
  /** Campaign: the saved balance when each run started, for the live coin counter. */
  const startBalance = new WeakMap<RunState, number>();
  let creditsShown = -1;
  const hints = find<HTMLElement>('.steering-hints');
  const lastLifeAlarm = find<HTMLElement>('.last-life-alarm');
  const message = find<HTMLElement>('.flight-message');
  let messageShown = '';
  const siteMarker = find<HTMLElement>('.site-marker');
  let markerShown = '';
  let chargeShown = -1;
  let endingTimer: ReturnType<typeof setTimeout> | null = null;
  /*
   * Selectors (no dropdowns): radio groups whose checked button carries the value. Click or arrow keys move the
   * glowing indicator; `onSelect` hears every change.
   */
  const selectorListeners = new Map<string, (value: string) => void>();
  function check(group: HTMLElement, button: HTMLElement) {
    for (const radio of group.querySelectorAll<HTMLElement>('[role="radio"]')) {
      const on = radio === button;
      radio.setAttribute('aria-checked', String(on)); radio.tabIndex = on ? 0 : -1;
    }
    selectorListeners.get(group.dataset.selector ?? '')?.(button.dataset.value ?? '');
  }
  for (const group of shell.querySelectorAll<HTMLElement>('[role="radiogroup"]')) {
    group.addEventListener('click', event => {
      const radio = (event.target as HTMLElement).closest<HTMLElement>('[role="radio"]');
      if (radio && group.contains(radio)) check(group, radio);
    }, options);
    group.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      event.preventDefault(); event.stopPropagation();
      const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
      const current = radios.findIndex(radio => radio.getAttribute('aria-checked') === 'true');
      const next = radios[(current + step + radios.length) % radios.length];
      check(group, next); next.focus();
    }, options);
  }
  const selected = (name: string) => find<HTMLElement>(`[data-selector="${name}"] [aria-checked="true"]`).dataset.value ?? '';
  const missionDots = find<HTMLElement>('.mission-dots');
  missionDots.dataset.selector = 'mission';
  const preview = createPlanetPreview(find<HTMLCanvasElement>('.planet-preview'));
  // Open on the furthest mission the pilot has unlocked.
  let missionIndex = Math.max(0, MISSION_ORDER.findIndex(([id]) => id === unlockedMissions(campaign.read()).at(-1)));
  function showMission(index: number) {
    missionIndex = (index + MISSION_ORDER.length) % MISSION_ORDER.length;
    const id = MISSION_ORDER[missionIndex][0] as MissionId, mission = missionText(id);
    for (const dot of missionDots.querySelectorAll<HTMLElement>('[role="radio"]')) {
      const on = dot.dataset.value === id;
      dot.setAttribute('aria-checked', String(on)); dot.tabIndex = on ? 0 : -1;
    }
    text('.mission-count', `${missionIndex + 1} / ${MISSION_ORDER.length}`);
    text('.mission-world', mission.world);
    text('.mission-name', mission.name);
    text('.mission-description', mission.brief);
    find('.mission-threat').setAttribute('aria-label', `Threat ${mission.threat} of 4`);
    find<HTMLElement>('.threat-pips').querySelectorAll('i').forEach((pip, i) => pip.classList.toggle('on', i < mission.threat));
    const stage = find<HTMLElement>('.planet-stage');
    stage.classList.remove('is-switching'); void stage.offsetWidth; stage.classList.add('is-switching');
    preview.show(MISSION_PLANET[id]);
    // Progression: a mission opens once the one before it has been cleared on any difficulty.
    const profile = campaign.read(), open = unlockedMissions(profile).includes(id), previous = MISSION_ORDER[missionIndex - 1]?.[1];
    stage.classList.toggle('is-locked', !open);
    const record = profile.missions[id];
    const best = record && (['veteran', 'standard', 'relaxed'] as const).find(level => record.best[level] !== undefined);
    text('.mission-record', !open ? `LOCKED · CLEAR ${previous?.toUpperCase()} TO UNLOCK`
      : best ? `CLEARED · BEST ${duration(record!.best[best]!)} ON ${difficultyNames[best].toUpperCase()}` : cleared(profile, id) ? 'CLEARED' : 'NOT YET CLEARED');
    find('.mission-record').classList.toggle('is-locked', !open);
    find<HTMLButtonElement>('[data-action="launch-campaign"]').disabled = !open;
  }
  /** Credit balance, loadout summary and the selected mission's lock state, from the saved profile. */
  function refreshCampaign() {
    const profile = campaign.read();
    showBalances(profile);
    for (const slot of ['weapon', 'special', 'shield', 'ship'] as const) text(`[data-loadout="${slot}"]`, itemText(slot, profile.loadout[slot]).name);
    showMission(missionIndex);
    actions.preloadHero?.(profile.loadout.ship, lookOf(profile, profile.loadout.ship));
  }
  /** Credit and parts balances (docs/33) on the campaign and hangar pages. */
  function showBalances(profile = campaign.read()) {
    for (const balance of shell.querySelectorAll('.credit-balance b')) balance.textContent = profile.credits.toLocaleString();
    for (const balance of shell.querySelectorAll('.parts-balance b')) balance.textContent = profile.parts.toLocaleString();
  }
  let hangarSlot: Slot = 'weapon';
  function refreshHangar() {
    renderHangar(find<HTMLElement>('.hangar-items'), campaign.read(), hangarSlot, {
      buy(slot, id) { if (campaign.buy(slot, id)) campaign.equip(slot, id); refreshHangar(); },
      equip(slot, id) { campaign.equip(slot, id); refreshHangar(); },
      assemble(ship) { if (campaign.assemble(ship)) campaign.equip('ship', ship); refreshHangar(); },
      upgrade(weapon) { campaign.upgrade(weapon); refreshHangar(); },
    });
    const yard = find<HTMLElement>('.shipyard');
    yard.hidden = hangarSlot !== 'ship';
    if (hangarSlot === 'ship') renderShipyard(yard, campaign.read(), {
      buyDesign(ship, slot, design) { campaign.buyDesign(ship, slot, design); },
      setLook(ship, look) { campaign.setLook(ship, look); refreshHangar(); },
      picture: (ship, look, width, height) => actions.heroPreview?.(ship, look, width, height) ?? Promise.resolve(null),
      preload: (ship, look) => actions.preloadHero?.(ship, look),
    });
    showBalances();
    text('.hangar-note', hangarSlot === 'ship' ? 'Ships come from the listed mission clears, on any difficulty. Their designs and paint are cosmetic: a design costs parts and credits once, then switches freely. Parts come from strike sites.' : 'Credits come from campaign missions. Changing equipped gear is free.');
  }
  selectorListeners.set('mission', value => showMission(MISSION_ORDER.findIndex(([id]) => id === value)));
  for (const arrow of shell.querySelectorAll<HTMLElement>('[data-mission-step]')) {
    arrow.addEventListener('click', () => showMission(missionIndex + Number(arrow.dataset.missionStep)), options);
  }
  // Swipe the planet left or right to change mission.
  {
    const stage = find<HTMLElement>('.planet-stage');
    let swipe: { id: number; x: number } | null = null;
    stage.addEventListener('pointerdown', event => { if (!(event.target as HTMLElement).closest('button')) swipe = { id: event.pointerId, x: event.clientX }; }, options);
    stage.addEventListener('pointerup', event => {
      if (!swipe || swipe.id !== event.pointerId) return;
      const dx = event.clientX - swipe.x; swipe = null;
      if (Math.abs(dx) > 36) showMission(missionIndex + (dx < 0 ? 1 : -1));
    }, options);
    stage.addEventListener('pointercancel', () => { swipe = null; }, options);
  }
  showMission(missionIndex);
  preview.stop();
  prebakePlanets(MISSION_ORDER.map(([id]) => MISSION_PLANET[id]));
  let lastState: RunState | null = null;
  let displayedPhase = 'menu';
  let lastConfig: RunConfig = { mode: 'endless', seed: 1 };
  let iconKey = '';
  let error = false, loading = false;
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
    if (className !== 'results-panel') overlay.classList.remove('is-ending', 'is-victory', 'is-settled');
    // (A loading panel shown over the launch warp keeps the warp state; setLoadingWarp decides.)
    overlay.classList.remove('is-leaving');
    overlay.hidden = false;
    currentPanel = className;
    overlay.dataset.page = className;
    overlay.scrollTop = 0;
    for (const panel of panels) panel.hidden = !panel.classList.contains(className);
    const target = focusSelector ? find<HTMLElement>(focusSelector) : find<HTMLElement>(`.${className} button`);
    target.focus({ preventScroll: true });
  }
  /**
   * Banks a campaign attempt once: complete or failed when the run ended, abandoned when the pilot leaves mid-flight
   * (half the collected credits). Endless never touches the campaign profile.
   */
  function settleAttempt(state: RunState) {
    const id = attempts.get(state);
    if (!id || state.config.mode !== 'campaign') return null;
    const outcome: AttemptOutcome = state.phase === 'complete' ? 'complete' : state.phase === 'over' ? 'failed' : 'abandoned';
    return campaign.settle({ id, mission: state.config.mission ?? 'training', difficulty: state.config.difficulty ?? 'standard', outcome,
      credits: state.credits, bossKilled: state.boss?.phase === 'destroyed', seconds: state.time, parts: state.parts ?? 0 });
  }
  function launch(config: RunConfig) {
    cancelResume();
    if (lastState) { settleAttempt(lastState); flightLog.observe(lastState, true); }
    lastConfig = config;
    actions.start(config);
    surface.focus({ preventScroll: true });
  }
  function onAction(action: string, handler: () => void) {
    find(`[data-action="${action}"]`).addEventListener('click', handler, options);
  }
  onAction('loading-cancel', () => actions.quit());
  // Endless uses the equipped ship and its perk; weapons, shield array and weapon tier start at baseline.
  onAction('endless', () => launch(endlessConfig(campaign.read(), seed())));
  onAction('campaign', () => { refreshCampaign(); showPanel('campaign-panel', '.campaign-panel .back-button'); preview.show(MISSION_PLANET[MISSION_ORDER[missionIndex][0]]); });
  onAction('hangar', () => { refreshHangar(); showPanel('hangar-panel', '.hangar-panel .back-button'); });
  selectorListeners.set('slot', value => { hangarSlot = value as Slot; refreshHangar(); });
  function renderStatistics() {
    const log = flightLog.read();
    const totals = log[statisticsMode];
    const campaign = statisticsMode === 'campaign';
    for (const tab of shell.querySelectorAll<HTMLButtonElement>('[data-stats-mode]')) {
      const selected = tab.dataset.statsMode === statisticsMode;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
    find('#statistics-content').setAttribute('aria-labelledby', `stats-${statisticsMode}-tab`);
    text('.stats-record-label', campaign ? 'MISSIONS CLEARED' : 'BEST SCORE');
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
    else if (currentPanel === 'hangar-panel') { refreshCampaign(); showPanel('campaign-panel', '[data-action="hangar"]'); }
    else if (currentPanel === 'statistics-panel') showPanel('menu-panel', '[data-action="statistics"]');
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-back], [data-settings-back], [data-help-back]')) button.addEventListener('click', navigateBack, options);
  onAction('launch-campaign', () => {
    const mission = MISSION_ORDER[missionIndex][0], profile = campaign.read();
    if (!unlockedMissions(profile).includes(mission)) return;
    launch(campaignConfig(profile, mission, selected('difficulty') as Difficulty, seed()));
  });
  onAction('resume', resume);
  onAction('quit', () => { cancelResume(); actions.quit(); });
  onAction('menu', () => { cancelResume(); actions.quit(); });
  onAction('retry', () => launch({ ...lastConfig, seed: seed() }));
  find('.pause-button').addEventListener('click', () => actions.pause(), options);
  selectorListeners.set('graphics', value => actions.setQuality(value as GraphicsQuality));
  selectorListeners.set('sound', value => { muted = value === 'off'; actions.setMuted(muted); });

  // Keep keyboard navigation inside whichever modal panel is actually visible.
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentPanel === 'pause-panel') {
      event.preventDefault();
      resume();
    } else if (event.key === 'Escape') {
      event.preventDefault(); navigateBack();
    } else if (currentPanel === 'campaign-panel' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault(); showMission(missionIndex + (event.key === 'ArrowRight' ? 1 : -1));
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
    loading = false;
    cancelResume();
    if (lastState) { settleAttempt(lastState); flightLog.observe(lastState, true); }
    error = false;
    displayedPhase = 'menu';
    lastState = null;
    surface.dataset.inputActive = 'false';
    surface.classList.remove('is-playing');
    hud.hidden = specialButton.hidden = hints.hidden = message.hidden = true;
    showPanel('menu-panel', '[data-action="campaign"]');
  }

  function update(state: RunState | null) {
    if (error || loading) return;
    if (!state) {
      if (displayedPhase !== 'menu') showMenu();
      return;
    }
    lastConfig = state.config;
    flightLog.observe(state);
    if (state.config.mode === 'campaign' && !attempts.has(state) && state.time <= 1 && state.tick <= 60) attempts.set(state, recordId());
    const changed = displayedPhase !== state.phase || lastState !== state;
    lastState = state;
    displayedPhase = state.phase;
    const playing = state.phase === 'playing';
    surface.dataset.inputActive = String(playing);
    surface.classList.toggle('is-playing', playing);
    hud.hidden = !playing;
    specialButton.hidden = !playing;
    hints.hidden = !playing || state.time >= 3;
    // The last life: a red glow at the screen's edges (user, 22 October).
    lastLifeAlarm.classList.toggle('is-on', playing && state.player.lives === 1);
    score.hidden = state.config.mode !== 'endless';
    // Campaign coin counter: the saved balance plus this run's pickups as they will be paid (×REWARDS.scale and the
    // difficulty multiplier); mission, boss and first-clear rewards are added on the results screen.
    hudCredits.hidden = state.config.mode !== 'campaign';
    if (state.config.mode === 'campaign') {
      if (!startBalance.has(state)) { startBalance.set(state, campaign.read().credits); creditsShown = -1; }
      const live = startBalance.get(state)! + Math.floor(state.credits * REWARDS.scale * CREDIT_MULTIPLIER[state.config.difficulty ?? 'standard']);
      if (live !== creditsShown) {
        if (creditsShown >= 0 && live > creditsShown) { hudCredits.classList.remove('is-gain'); void hudCredits.offsetWidth; hudCredits.classList.add('is-gain'); }
        creditsShown = live; hudCredits.querySelector('b')!.textContent = live.toLocaleString();
      }
    }
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
    const special = state.config.special ?? 'shockwave', specialName = SPECIALS[special].label;
    if (specialButton.dataset.special !== special) {
      specialButton.dataset.special = special;
      specialButton.querySelector('.special-glyph path')?.setAttribute('d', specialGlyphs[special]);
    }
    const chargeLabel = ready ? `Activate ${specialName.toLowerCase()}. Ready.` : `${specialName} recharging. ${Math.floor(charge * 100)} percent.`;
    if (specialButton.getAttribute('aria-label') !== chargeLabel) specialButton.setAttribute('aria-label', chargeLabel);
    // The recharge fills a glowing ring around the button border (CSS --charge, 0..1); steps of 1% keep style writes rare.
    const chargeStep = Math.floor(charge * 100);
    if (chargeStep !== chargeShown) { chargeShown = chargeStep; specialButton.style.setProperty('--charge', String(chargeStep / 100)); }
    // A lost flight keeps its last word on screen through the afterglow, until the results veil covers it.
    const activeMessage = playing && state.messageUntil > state.time ? state.message : state.phase === 'over' || state.phase === 'complete' ? state.message : '';
    if (messageShown !== activeMessage) { messageShown = activeMessage; showMessage(message, activeMessage); }
    message.hidden = !activeMessage;
    // A strike site off to the side: a faint "?" at that screen edge, level with it (user, 30 October: "render a question
    // mark icon, very subtle in gray maybe on the edge of the screen like an indicator").
    let marker = '';
    const core = playing ? state.enemies.find(enemy => enemy.site && enemy.hp > 0 && enemy.s > VIEW.minS + 1 && enemy.s < VIEW.maxS + 10) : undefined;
    if (core && Math.abs(core.x - state.cameraX) > VIEW.width / 2 - .5) {
      const level = 100 * (1 - (core.s - VIEW.minS) / (VIEW.maxS - VIEW.minS));
      marker = `${core.x < state.cameraX ? 'left' : 'right'}:${Math.round(Math.min(78, Math.max(16, level)))}`;
    }
    if (markerShown !== marker) {
      markerShown = marker; siteMarker.hidden = !marker;
      if (marker) { const [side, top] = marker.split(':'); siteMarker.dataset.side = side; siteMarker.style.top = `${top}%`; }
    }

    if (playing) {
      overlay.hidden = true;
    } else if (changed && state.phase === 'paused') {
      text('.pause-description', state.config.mode === 'endless'
        ? `Endless · Sector ${state.sector}`
        : `${missionText(state.config.mission).name} · ${difficultyNames[state.config.difficulty ?? 'standard']}`);
      text('.pause-weapon', `${weaponNames[state.player.weapon]} · TIER ${state.player.power + 1}`);
      text('.pause-special', SPECIALS[state.config.special ?? 'shockwave'].label);
      text('.pause-tech', `${SHIELD_TECH[state.config.shield ?? 'standard'].label.split(' ')[0]} / ${SHIPS[state.config.ship ?? 'scrapper'].label.split(' ')[0]}`);
      showPanel('pause-panel', '[data-action="resume"]');
    } else if (changed && (state.phase === 'over' || state.phase === 'complete')) {
      const campaign = state.config.mode === 'campaign';
      text('.result-mode', campaign ? `CAMPAIGN / ${missionText(state.config.mission).name.toUpperCase()}` : `ENDLESS / ${(state.planet ?? 'khepri').toUpperCase()}`);
      text('#results-title', state.phase === 'complete' ? 'MISSION COMPLETE' : 'FLIGHT ENDED');
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
        : 'Every endless flight starts with the same loadout.');
      // Campaign: bank the attempt (once) and show what it earned and anything it unlocked.
      const pay = settleAttempt(state);
      find<HTMLElement>('.result-credits').hidden = !pay;
      if (pay) {
        const parts = [`COLLECTED ${pay.collected}`];
        if (state.phase === 'complete') parts.push(`MISSION ${pay.mission}`, ...(pay.boss ? [`BOSS ${pay.boss}`] : []));
        else parts.push('HALF BANKED');
        if (pay.multiplier !== 1) parts.push(`×${pay.multiplier.toFixed(2)}`);
        if (pay.firstClear) parts.push(`FIRST CLEAR +${pay.firstClear}`);
        text('.result-breakdown', parts.join(' · '));
        text('.result-earned b', `+${pay.total.toLocaleString()} CR`);
        text('.result-earned span', `BALANCE ${pay.balance.toLocaleString()} CR`);
        // Parts from strike sites (docs/33), banked in full whatever the outcome.
        const partsLine = find<HTMLElement>('.result-parts'); partsLine.hidden = !pay.parts;
        partsLine.textContent = `+${pay.parts} ${pay.parts === 1 ? 'PART' : 'PARTS'} · ${pay.partsBalance} IN THE HANGAR`;
        const salvage = find<HTMLElement>('.result-salvage'); salvage.hidden = !pay.salvage.length;
        salvage.textContent = `PARTS RECOVERED · ${pay.salvage.join(' · ')}`;
        const unlock = find<HTMLElement>('.result-unlock');
        unlock.hidden = !pay.unlocked;
        if (pay.unlocked) {
          unlock.textContent = `NEW MISSION UNLOCKED · ${missionText(pay.unlocked).name.toUpperCase()}`;
          // The campaign page opens on the mission just unlocked.
          missionIndex = Math.max(0, MISSION_ORDER.findIndex(([id]) => id === pay.unlocked));
        }
      }
      showPanel('results-panel', '[data-action="retry"]');
      // Endings ease out over the afterglow (main.ts): a lost flight drifts on in slow motion, a completed one jumps to
      // hyperdrive and the results arrive after its flash. Taps reach the buttons only once they are visible.
      overlay.classList.remove('is-ending', 'is-victory', 'is-settled');
      void overlay.offsetWidth;
      overlay.classList.add('is-ending');
      overlay.classList.toggle('is-victory', state.phase === 'complete');
      if (endingTimer !== null) clearTimeout(endingTimer);
      endingTimer = setTimeout(() => { endingTimer = null; overlay.classList.add('is-settled'); }, state.phase === 'complete' ? 2300 : 1500);
    }
  }

  return {
    canvas, surface, specialButton, update, showMenu,
    /**
     * Fades the loading overlay out over the prepared scene (user, 21 October: the loading screen was "so abrupt"); resolves
     * when it is gone, so the flight's clock starts after the fade. Reduced motion: a short plain fade.
     */
    fadeLoading(): Promise<void> {
      if (!loading || error) return Promise.resolve();
      overlay.classList.add('is-leaving');
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      return new Promise(resolve => setTimeout(resolve, reduced ? 150 : 450));
    },
    setLoadingWarp(warp: boolean) { overlay.classList.toggle('is-warping', warp); },
    showLoading(active: boolean) {
      if (loading === active || error) return;
      loading = active;
      if (active) overlay.classList.remove('is-leaving');
      else overlay.classList.remove('is-warping');
      if (!active) { displayedPhase = 'loading'; return; }
      cancelResume();
      surface.dataset.inputActive = 'false'; surface.classList.remove('is-playing');
      hud.hidden = specialButton.hidden = hints.hidden = message.hidden = true;
      showPanel('loading-panel', '[data-action="loading-cancel"]');
    },
    showError(errorMessage: string) {
      cancelResume();
      error = true;
      overlay.classList.remove('is-leaving', 'is-warping');
      surface.dataset.inputActive = 'false';
      surface.classList.remove('is-playing');
      hud.hidden = specialButton.hidden = hints.hidden = message.hidden = true;
      text('.error-message', errorMessage);
      overlay.hidden = false;
      currentPanel = 'error-panel';
      for (const panel of panels) panel.hidden = !panel.classList.contains('error-panel');
    },
    dispose() { preview.stop(); if (lastState) flightLog.observe(lastState, false, true); cancelResume(); if (endingTimer !== null) clearTimeout(endingTimer); abort.abort(); shell.remove(); },
  };
}

const SITE_NAMES = new Set(Object.values(SITES).map(site => site.name));
const LOOT_TINTS: Readonly<Record<string, string>> = {
  PARTS: PICKUP_TINTS.part, 'PARTS?': PICKUP_TINTS.part, SHIELD: PICKUP_TINTS.shield, CREDITS: PICKUP_TINTS.credit,
  POWER: PICKUP_TINTS.power, WEAPON: PICKUP_TINTS.weapon,
};
/**
 * The flight message. A strike site's (`AIRFIELD · WEST · PARTS`, docs/33) is highlighted (user, 30 October: "color the
 * text ... potential [parts in that orange] or [shields in that icon blue]"): the site's name bright, its side with an
 * arrow, each loot word in its pickup icon's tint.
 */
function showMessage(element: HTMLElement, text: string) {
  const words = text.split(' · ');
  if (!SITE_NAMES.has(words[0])) { element.textContent = text; return; }
  element.replaceChildren(...words.flatMap((word, index) => {
    const span = document.createElement('span');
    span.textContent = word;
    if (index === 0) span.className = 'message-site';
    else if (word === 'WEST' || word === 'EAST') { span.className = 'message-side'; span.textContent = word === 'WEST' ? '◂ WEST' : 'EAST ▸'; }
    else if (LOOT_TINTS[word]) { span.className = word.endsWith('?') ? 'message-loot is-maybe' : 'message-loot'; span.style.color = LOOT_TINTS[word]; }
    return index ? [document.createTextNode(' · '), span] : [span];
  }));
}
