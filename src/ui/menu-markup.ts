/** Menu-only surfaces. Gameplay HUD and input stay in game-ui.ts. */
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
    <p class="eyebrow">01 / KHEPRI</p><h2 id="campaign-title">CAMPAIGN</h2>
    <div class="mission-select setup-fields"><label>MISSION<select name="mission" aria-label="Campaign mission"><option value="bastion">Rolling Thunder</option><option value="training">Training</option></select></label></div>
    <p class="mission-description">Bring down the Bastion-9 fortress.</p>
    <div class="setup-fields"><label>DIFFICULTY<select name="difficulty" aria-label="Campaign difficulty"><option value="relaxed">Relaxed</option><option value="standard" selected>Standard</option><option value="veteran">Veteran</option></select></label></div>
    <div class="equipment-preview"><h3>LOADOUT</h3><dl>
      <div><dt><label for="main-weapon">Main</label></dt><dd><select id="main-weapon" name="weapon" aria-label="Main weapon"><option value="pulse">Pulse · straight</option><option value="fan">Scatter · fan</option><option value="seeker">Seeker · homing</option></select></dd></div>
      <div><dt>Special</dt><dd>Shockwave</dd></div><div><dt>Shield</dt><dd>Standard</dd></div><div><dt>Reactor</dt><dd>Balanced</dd></div>
    </dl></div>
    <button type="button" class="arcade-button primary" data-action="launch-campaign">LAUNCH SORTIE <span aria-hidden="true">↗</span></button>
    <p class="panel-note">Equipment upgrades arrive in a later build.</p>
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
    <div class="settings-list"><div><span>Sound</span><button type="button" class="sound-toggle" data-sound aria-label="Mute sound" aria-pressed="false">ON</button></div><label><span>Graphics</span><select data-graphics aria-label="Graphics quality"><option value="high">High</option><option value="low">Low</option></select></label></div>
    <p class="panel-note">Use Low graphics for a smoother flight.</p>
    <button type="button" class="arcade-button secondary settings-help" data-action="settings-help">HOW TO PLAY <span aria-hidden="true">↗</span></button>
  </section>
  <section class="help-panel page-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" hidden>
    <button type="button" class="back-button" data-help-back>← BACK</button>
    <p class="eyebrow">FLIGHT MANUAL</p><h2 id="help-title">HOLD YOUR<br>LINE.</h2>
    <ol class="control-guide"><li><span>01</span><div><h3>STEER</h3><p>Hold the left or right half of the screen.</p></div></li><li><span>02</span><div><h3>LINE UP</h3><p>Your main weapon fires when a target enters its firing path.</p></div></li><li><span>03</span><div><h3>BREAK THROUGH</h3><p>Tap the center button for a shockwave. Wait for it to recharge.</p></div></li></ol>
    <dl class="keyboard-controls"><div><dt>STEER</dt><dd>A / D or ← / →</dd></div><div><dt>SPECIAL</dt><dd>Space</dd></div><div><dt>PAUSE</dt><dd>Esc</dd></div></dl>
  </section>`;
