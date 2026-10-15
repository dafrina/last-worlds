/** Menu-only surfaces. Gameplay HUD and input stay in game-ui.ts. */

/** Campaign missions in selector order (progression: the moon first). */
export const MISSION_ORDER = [['training', 'Training'], ['bastion', 'Rolling Thunder'], ['cold-vector', 'Cold Vector']] as const;

/**
 * A segmented selector (no dropdowns): one radio button per choice, the checked one lit with a glowing indicator.
 * game-ui.ts wires clicks and arrow keys; `data-selector` names the value it carries.
 */
export function selector(name: string, label: string, choices: readonly (readonly [string, string])[], value: string): string {
  return `<div class="selector" role="radiogroup" aria-label="${label}" data-selector="${name}">${choices.map(([id, text]) =>
    `<button type="button" role="radio" data-value="${id}" aria-checked="${id === value}" tabindex="${id === value ? 0 : -1}"><span>${text}</span></button>`).join('')}</div>`;
}

export const menuMarkup = `
  <section class="menu-panel" role="dialog" aria-modal="true" aria-labelledby="game-title">
    <div class="menu-topline"><span>LW / FLIGHT COMMAND</span><span class="status-dot">KHEPRI</span></div>
    <div class="wordmark"><h1 id="game-title">LAST<br>WORLDS</h1><p class="menu-tagline">LOW ORBIT. NO WAY BACK.</p></div>
    <div class="orbital-art" aria-hidden="true">
      <svg viewBox="0 0 340 180" fill="none"><circle cx="235" cy="131" r="99" fill="#0c2340"/><circle cx="235" cy="131" r="99" stroke="#355678" stroke-width=".7"/><path d="M128 149C188 93 265 64 338 59M130 156C192 103 272 76 339 73" stroke="#527394" stroke-width=".7"/><path d="M36 138H93M64 110V166M148 35H166M157 26V44" stroke="#55708b" stroke-width=".7"/><circle cx="298" cy="23" r="1.2" fill="#9db8d5"/><circle cx="102" cy="54" r="1" fill="#7893ae"/><circle cx="196" cy="17" r=".8" fill="#7893ae"/><path d="M234 40L235 34L237 40L240 43L236 42L235 44L234 42L230 43Z" fill="#d9e6ef"/></svg>
    </div>
    <nav class="menu-launches" aria-label="Game modes">
      <button type="button" class="arcade-button primary" data-action="campaign"><span>CAMPAIGN FLIGHT</span><span class="button-arrow" aria-hidden="true">↗</span></button>
      <button type="button" class="arcade-button secondary" data-action="endless"><span>ENDLESS</span><span class="button-arrow" aria-hidden="true">↗</span></button>
    </nav>
    <nav class="menu-utility" aria-label="Flight command"><button type="button" data-action="statistics">STATISTICS</button><button type="button" data-action="settings">SETTINGS</button></nav>
    <div class="menu-footer"><span>FLIGHT PROTOTYPE</span><button type="button" data-action="help">HOW TO PLAY <span aria-hidden="true">?</span></button></div>
  </section>
  <section class="campaign-panel page-panel" role="dialog" aria-modal="true" aria-labelledby="campaign-title" hidden>
    <button type="button" class="back-button" data-back="menu-panel">← BACK</button>
    <div class="eyebrow campaign-eyebrow"><h2 id="campaign-title">CAMPAIGN</h2><span aria-hidden="true">·</span><span class="mission-count">2 / 3</span></div>
    <div class="planet-stage">
      <button type="button" class="mission-arrow" data-mission-step="-1" aria-label="Previous mission">‹</button>
      <canvas class="planet-preview" aria-hidden="true"></canvas>
      <button type="button" class="mission-arrow" data-mission-step="1" aria-label="Next mission">›</button>
    </div>
    <div class="mission-dots selector-dots" role="radiogroup" aria-label="Campaign mission">${MISSION_ORDER.map(([id, name]) => `<button type="button" role="radio" data-value="${id}" aria-label="${name}" aria-checked="false"></button>`).join('')}</div>
    <p class="mission-world"></p>
    <h3 class="mission-name"></h3>
    <p class="mission-description"></p>
    <p class="mission-threat" aria-label="Threat"><span>THREAT</span><span class="threat-pips"><i></i><i></i><i></i></span></p>
    <div class="setup-group"><span class="setup-label" id="difficulty-label">DIFFICULTY</span>${selector('difficulty', 'Campaign difficulty', [['relaxed', 'Relaxed'], ['standard', 'Standard'], ['veteran', 'Veteran']], 'standard')}</div>
    <div class="setup-group"><span class="setup-label">MAIN WEAPON</span>${selector('weapon', 'Main weapon', [['pulse', 'Pulse'], ['fan', 'Scatter'], ['seeker', 'Seeker']], 'pulse')}</div>
    <p class="loadout-line">SPECIAL Shockwave · SHIELD Standard · REACTOR Balanced</p>
    <button type="button" class="arcade-button primary" data-action="launch-campaign">LAUNCH SORTIE <span aria-hidden="true">↗</span></button>
  </section>
  <section class="statistics-panel page-panel" role="dialog" aria-modal="true" aria-labelledby="statistics-title" hidden>
    <button type="button" class="back-button" data-back="menu-panel">← BACK</button>
    <p class="eyebrow">FLIGHT LOG</p><h2 id="statistics-title">STATISTICS</h2>
    <div class="mode-tabs" role="tablist" aria-label="Statistics mode"><button id="stats-endless-tab" type="button" role="tab" data-stats-mode="endless" aria-selected="true" aria-controls="statistics-content">ENDLESS</button><button id="stats-campaign-tab" type="button" role="tab" data-stats-mode="campaign" aria-selected="false" aria-controls="statistics-content" tabindex="-1">CAMPAIGN</button></div>
    <div id="statistics-content" role="tabpanel" aria-labelledby="stats-endless-tab">
      <div class="stats-record"><p class="stats-record-label">BEST SCORE</p><p class="stats-record-value">—</p></div>
      <dl class="statistics-grid"><div><dt>FLIGHTS</dt><dd data-stat="flights">0</dd></div><div><dt>HOSTILES DOWN</dt><dd data-stat="kills">0</dd></div><div><dt>FLIGHT TIME</dt><dd data-stat="time">0:00</dd></div><div><dt class="stats-progress-label">FURTHEST SECTOR</dt><dd data-stat="progress">—</dd></div><div><dt>LIVES LOST</dt><dd data-stat="lives">0</dd></div><div><dt>SPECIALS USED</dt><dd data-stat="specials">0</dd></div></dl>
      <div class="recent-flights"><h3>RECENT FLIGHTS</h3><p class="statistics-empty">Your flight log starts here.</p><ol class="statistics-history"></ol></div>
    </div>
    <p class="panel-note statistics-note">Saved on this browser. Flights count from this build onward.</p>
  </section>
  <section class="settings-panel page-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
    <button type="button" class="back-button" data-settings-back>← BACK</button>
    <p class="eyebrow">FLIGHT COMMAND</p><h2 id="settings-title">SETTINGS</h2>
    <div class="settings-list"><div><span>Sound</span>${selector('sound', 'Sound', [['on', 'On'], ['off', 'Off']], 'on')}</div><div><span>Graphics</span>${selector('graphics', 'Graphics quality', [['high', 'High'], ['low', 'Low']], 'high')}</div></div>
    <p class="panel-note">Use Low graphics for a smoother flight.</p>
    <button type="button" class="arcade-button secondary settings-help" data-action="settings-help">HOW TO PLAY <span aria-hidden="true">↗</span></button>
  </section>
  <section class="help-panel page-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" hidden>
    <button type="button" class="back-button" data-help-back>← BACK</button>
    <p class="eyebrow">FLIGHT MANUAL</p><h2 id="help-title">HOLD YOUR<br>LINE.</h2>
    <ol class="control-guide"><li><span>01</span><div><h3>STEER</h3><p>Hold the left or right half of the screen.</p></div></li><li><span>02</span><div><h3>LINE UP</h3><p>Your main weapon fires when a target enters its firing path.</p></div></li><li><span>03</span><div><h3>BREAK THROUGH</h3><p>Tap the center button for a shockwave. Wait for it to recharge.</p></div></li></ol>
    <dl class="keyboard-controls"><div><dt>STEER</dt><dd>A / D or ← / →</dd></div><div><dt>SPECIAL</dt><dd>Space</dd></div><div><dt>PAUSE</dt><dd>Esc</dd></div></dl>
  </section>`;
