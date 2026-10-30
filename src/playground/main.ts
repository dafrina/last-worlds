/**
 * Light playground (playground.html; user, 22 October: "a playground where I can play on static versions of the levels
 * with fog and light ... so I can give you the settings I like best for each"). The real renderer, terrain, infrastructure
 * and kits of each campaign level, frozen: no enemies, no combat, no simulation steps. A panel tunes each level's look
 * live (lights, grade, bloom, fog); settings persist in the browser, the dev server also writes them to
 * lookdev/playground-looks.json, and "Copy settings" puts them on the clipboard. Presentation only.
 *
 * "Boss fight" (user, 24 October: "can i preview it somewhere? maybe add a feature to the playground with a toggle boss
 * fight") runs the level's boss for real in its arena: the simulation steps, the ship hovers where "Ship x" puts it and
 * cannot die, and buttons replay the arrival, burst the flank weak points (the core phase: shutters open, launches),
 * overload the core or destroy it.
 *
 * Organised in tabs (user, 27 October: "can you make a model viewer for each enemy and the hero. maybe organise the
 * playground some better too ... classify them by type/tier of enemy and make me able to simulate its attacks or
 * something, also placed in the playground on the real map"): Level, Look, Boss, Enemies (the roster by tier, spawned
 * live over the real map: src/playground/lab.ts) and Models (a turntable viewer for the hero, every faction's craft and
 * the bosses: src/playground/viewer.ts).
 */
import { HERO_CHASSIS, HERO_DEFAULT_PAINT, HERO_SLOTS, assembleHero, heroDesigns, randomHeroBuild, type HeroBuild, type HeroChassis, type HeroDesign, type HeroSlot } from '../render/hero-assembly';
import { loadHeroModel } from '../render/hero-craft';
import { HERO_REMODELLED } from '../content/hero-parts';
import { createRun, stepRun } from '../sim/game';
import { arenaScroll, bossTarget, resolveBossPhase, startBoss } from '../sim/bastion';
import { missionBoss } from '../content/bosses';
import { createRenderer, type PlanetLook } from '../render/scene';
import type { GraphicsQuality, PlanetId, RunConfig, RunState, SpecialId, WeaponId } from '../shared/contracts';
import { ENEMIES, WEAPONS } from '../content/balance';
import { SPECIALS, SPECIAL_IDS, WEAPON_BLURB, WEAPON_IDS, WEAPON_TIERS } from '../content/equipment';
import { EMPTY_INPUT, STEP, VIEW } from '../shared/contracts';
import { FORMATIONS } from '../content/formations';
import { ROSTER, hunterKind, modelOf, statsLine, viewerModels, WORLDS } from './roster';
import { attackNow, holdDirector, labClock, spawnFormation, spawnHunter } from './lab';
import { createModelViewer } from './viewer';
import { destroySites, hitSites, placeSite, type SiteSpot } from './sites-lab';
import { SITES } from '../content/sites';
import { SITE_MODELS } from '../render/site-models';
import { SITE_IDS, type SiteId } from '../shared/contracts';
import './playground.css';

type Mission = NonNullable<RunConfig['mission']>;
const LEVELS: readonly { mission: Mission; name: string; planet: PlanetId }[] = [
  { mission: 'training', name: 'Training · Luna', planet: 'luna' },
  { mission: 'bastion', name: 'Rolling Thunder · Khepri', planet: 'khepri' },
  { mission: 'cold-vector', name: 'Cold Vector · Vesper', planet: 'vesper' },
  { mission: 'deep-bloom', name: 'Deep Bloom · Nacre', planet: 'nacre' },
  { mission: 'brood-strike', name: 'Brood Strike · Amnion', planet: 'amnion' },
  { mission: 'final-horizon', name: 'Final Horizon · Umbra', planet: 'umbra' },
];
const STORE = 'last-worlds.playground.looks', VIEW_STORE = 'last-worlds.playground.view';

/** One panel control: a path into the look, its kind and range. */
type Control = { path: string; label: string } & ({ kind: 'color' } | { kind: 'range'; min: number; max: number; step: number });
const range = (path: string, label: string, min: number, max: number, step: number): Control => ({ path, label, kind: 'range', min, max, step });
const color = (path: string, label: string): Control => ({ path, label, kind: 'color' });
const GROUPS: readonly { title: string; controls: readonly Control[] }[] = [
  { title: 'Sun and sky', controls: [
    range('sunElevation', 'Sun elevation (°)', 10, 85, 1), color('sun.0', 'Sun colour'), range('sun.1', 'Sun intensity', 0, 8, .05),
    color('hemisphere.0', 'Sky fill colour'), color('hemisphere.1', 'Ground fill colour'), range('hemisphere.2', 'Sky fill intensity', 0, 3, .01),
    color('bounce.0', 'Bounce colour'), range('bounce.1', 'Bounce intensity', 0, 3, .01),
    range('shadowIntensity', 'Shadow strength', 0, 1, .01), color('blobShadow', 'Low-tier shadow colour'), color('background', 'Background'),
  ] },
  { title: 'Fog', controls: [
    color('post.fog.color', 'Fog colour'), range('post.fog.energy', 'Fog brightness', 0, 2, .01),
    range('post.fog.height.0', 'Fog top (clear above)', -10, 4, .05), range('post.fog.height.1', 'Fog full at', -10, 4, .05),
    range('post.fog.height.2', 'Low fog amount', 0, 1, .01),
    range('post.fog.distance.0', 'Haze start distance', 20, 90, .5), range('post.fog.distance.1', 'Haze density', 0, .2, .001),
    range('post.fog.distance.2', 'Haze amount (in the low layer)', 0, 1, .01),
    range('post.haze.3', 'Top-of-screen haze', 0, .3, .005),
  ] },
  { title: 'Exposure and bloom (High)', controls: [
    range('post.exposure', 'Exposure', .4, 2.2, .01), range('post.threshold', 'Bloom threshold', .3, 3, .01), range('post.knee', 'Bloom knee', 0, 1, .01),
    range('post.strength', 'Bloom strength', 0, 2, .01), range('lowExposure', 'Exposure (Low tier)', .4, 2.2, .01),
  ] },
  { title: 'Grade', controls: [
    range('post.saturation', 'Saturation', 0, 1.6, .01), range('post.contrast', 'Contrast', .7, 1.5, .01), range('post.vignette', 'Vignette', 0, .6, .01),
    range('post.lift.0', 'Shadow lift red', 0, .03, .0005), range('post.lift.1', 'Shadow lift green', 0, .03, .0005), range('post.lift.2', 'Shadow lift blue', 0, .03, .0005),
  ] },
];

const get = (look: PlanetLook, path: string): number => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], look) as number;
function set(look: PlanetLook, path: string, value: number) {
  const keys = path.split('.'), last = keys.pop()!;
  const parent = keys.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], look) as Record<string, number>;
  parent[last] = value;
}
const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
const load = <T>(key: string): T | null => { try { const text = localStorage.getItem(key); return text ? JSON.parse(text) as T : null; } catch { return null; } };
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep going */ } };

const root = document.getElementById('playground')!;
const TABS = [['level', 'Level'], ['look', 'Look'], ['boss', 'Boss'], ['enemies', 'Enemies'], ['weapons', 'Weapons'], ['sites', 'Sites'], ['models', 'Models'], ['hangar', 'Hangar']] as const;
type Tab = (typeof TABS)[number][0];
root.innerHTML = `
  <div class="pg-stage"><canvas class="pg-canvas"></canvas><div class="pg-viewer" hidden></div><div class="pg-hud"></div></div>
  <button class="pg-toggle" type="button">Settings</button>
  <aside class="pg-panel">
    <header><strong>Playground</strong><span class="pg-sync"></span></header>
    <nav class="pg-tabs">${TABS.map(([id, name]) => `<button type="button" data-tab="${id}">${name}</button>`).join('')}</nav>
    <section class="pg-scene" data-pane="level"></section>
    <section data-pane="look">
      <div class="pg-groups"></div>
      <footer>
        <button type="button" data-act="copy">Copy settings</button>
        <button type="button" data-act="reset">Reset this level</button>
        <button type="button" data-act="reset-all">Reset all</button>
      </footer>
    </section>
    <section class="pg-boss-pane" data-pane="boss"></section>
    <section class="pg-lab" data-pane="enemies"></section>
    <section class="pg-weapons" data-pane="weapons"></section>
    <section class="pg-sites" data-pane="sites"></section>
    <section class="pg-models" data-pane="models"></section>
    <section class="pg-hangar" data-pane="hangar"></section>
  </aside>`;
const canvas = root.querySelector<HTMLCanvasElement>('.pg-canvas')!, stage = root.querySelector<HTMLElement>('.pg-stage')!;
const hud = root.querySelector<HTMLElement>('.pg-hud')!, panel = root.querySelector<HTMLElement>('.pg-panel')!, sync = root.querySelector<HTMLElement>('.pg-sync')!;
root.querySelector('.pg-toggle')!.addEventListener('click', () => panel.classList.toggle('is-open'));

const renderer = createRenderer(canvas);
const defaults = Object.fromEntries(LEVELS.map(level => [level.planet, renderer.lookOf!(level.planet) as PlanetLook])) as Record<PlanetId, PlanetLook>;
/** The tuned looks (only levels that differ from their shipped look are saved). */
const looks = Object.fromEntries(LEVELS.map(level => [level.planet, structuredClone(defaults[level.planet])])) as Record<PlanetId, PlanetLook>;

interface ViewSettings {
  mission: Mission; distance: number; x: number; fly: boolean; speed: number; quality: GraphicsQuality; ship: boolean; seed: number; boss: boolean;
  /** The enemy lab is live (enemies over the map, the world flying on); the open tab; the viewer's model and light. */
  lab: boolean; tab: Tab; model: string; wire: boolean; spin: boolean; worldLight: boolean;
  /** Weapons tab: the hero's main weapon and tier (0–2), and its special; the hero fires in the lab while that tab is open. */
  weapon: WeaponId; tier: number; special: SpecialId;
  /** Sites tab: the lab's world holds still (no simulation steps) for a steady look at a site. */
  hold: boolean;
}
const view: ViewSettings = { mission: 'bastion', distance: 120, x: 0, fly: false, speed: 5, quality: 'high', ship: true, seed: 8831, boss: false,
  lab: false, tab: 'level', model: 'shared/hero-scrapper.glb#hero_scrapper', wire: false, spin: true, worldLight: false,
  weapon: 'rail', tier: 0, special: 'gravity-well', hold: false, ...load<Partial<ViewSettings>>(VIEW_STORE) };
const level = () => LEVELS.find(entry => entry.mission === view.mission) ?? LEVELS[1];

let state: RunState = makeState();
function makeState(): RunState {
  const run = createRun({ mode: 'campaign', mission: view.mission, difficulty: 'standard', seed: view.seed, weapon: view.weapon, special: view.special, rank: view.tier });
  run.enemies = []; run.projectiles = []; run.hazards = []; run.pickups = []; run.nextEncounterAt = Infinity; run.nextVolleyAt = Infinity;
  run.player.invulnerableUntil = -1; run.message = ''; run.messageUntil = 0;
  if (view.lab) {
    // The lab flies the real map from the panel's position: the mission's clock where its scroll is there (lab.ts).
    run.time = labClock(view.mission, view.distance).time;
    holdDirector(run);
  } else if (view.boss) {
    // The boss's own arena: the scroll as it eases to its stop, then the boss arrives (as the boss fixture sets it up).
    const def = missionBoss(view.mission);
    if (def) {
      run.time = def.arrivesAt;
      const scroll = arenaScroll(run.time, null, def.arena); run.distance = scroll.distance; run.scrollSpeed = scroll.speed;
      startBoss(run, def);
    }
  }
  return run;
}
/** Boss controls: the flank weak points down (core phase), the core into overload, or everything destroyed. */
function bossAct(act: string) {
  if (!state.boss) return;
  if (act === 'replay') { state = makeState(); return; }
  if (state.boss.phase === 'arrival') return;
  const kill = (part: 'left' | 'right' | 'core', hp = 0) => { const target = bossTarget(state, part); if (target) target.hp = hp; };
  if (act === 'flanks' || act === 'overload' || act === 'destroy') { kill('left'); kill('right'); resolveBossPhase(state); }
  if (act === 'overload') { const core = bossTarget(state, 'core'); if (core) { core.hp = Math.min(core.hp, core.maxHp * .39); resolveBossPhase(state); } }
  if (act === 'destroy') { kill('core'); resolveBossPhase(state); }
}

// ── Saving: the browser, the dev server's file (lookdev/playground-looks.json) and the clipboard. ──
function exported() {
  const changed: Record<string, { look: PlanetLook; changes: Record<string, [number, number]> }> = {};
  for (const { planet, name } of LEVELS) {
    const changes: Record<string, [number, number]> = {};
    for (const group of GROUPS) for (const control of group.controls) {
      const was = get(defaults[planet], control.path), now = get(looks[planet], control.path);
      if (Math.abs(was - now) > 1e-9) changes[control.path] = [was, now];
    }
    if (Object.keys(changes).length) changed[planet] = { look: looks[planet], changes };
    void name;
  }
  return { version: 1, savedAt: new Date().toISOString(), levels: changed };
}
let saveTimer = 0;
function persist() {
  const data = exported();
  save(STORE, data);
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    try {
      const response = await fetch('./__playground/looks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data, null, 2) });
      sync.textContent = response.ok ? 'saved to lookdev/playground-looks.json' : 'saved in this browser';
    } catch { sync.textContent = 'saved in this browser'; }
  }, 400);
}
function restore(data: ReturnType<typeof exported> | null) {
  if (!data?.levels) return;
  for (const [planet, entry] of Object.entries(data.levels)) if (planet in looks) looks[planet as PlanetId] = { ...structuredClone(defaults[planet as PlanetId]), ...structuredClone(entry.look) };
}

// ── Panel ──
const scene = root.querySelector<HTMLElement>('.pg-scene')!;
scene.innerHTML = `
  <label>Level <select data-view="mission">${LEVELS.map(entry => `<option value="${entry.mission}">${entry.name}</option>`).join('')}</select></label>
  <label>Position along the level <input data-view="distance" type="range" min="0" max="1600" step="1"><output></output></label>
  <label>Ship x <input data-view="x" type="range" min="-11" max="11" step=".1"><output></output></label>
  <label class="pg-row"><input data-view="fly" type="checkbox"> Fly forward</label>
  <label>Flight speed <input data-view="speed" type="range" min="1" max="30" step="1"><output></output></label>
  <label>Quality <select data-view="quality"><option value="high">High</option><option value="low">Low</option></select></label>
  <label class="pg-row"><input data-view="ship" type="checkbox"> Show the ship</label>
  <label>Terrain seed <input data-view="seed" type="number" min="1" step="1"></label>
  <div class="pg-row"><button type="button" data-act="boom">Explosion</button><button type="button" data-act="blast">Fuel blast</button></div>`;
const bossPane = root.querySelector<HTMLElement>('.pg-boss-pane')!;
bossPane.innerHTML = `
  <label class="pg-row"><input data-view="boss" type="checkbox"> Boss fight (the level's boss, live; the ship cannot die)</label>
  <p class="pg-note">Steer with "Ship x" on the Level tab.</p>
  <div class="pg-row pg-boss"><button type="button" data-boss="replay">Replay arrival</button><button type="button" data-boss="flanks">Open the core</button><button type="button" data-boss="overload">Overload</button><button type="button" data-boss="destroy">Destroy</button></div>`;

// ── Enemies: the roster by tier, spawned live over the level's real map (lab.ts, roster.ts). ──
const labPane = root.querySelector<HTMLElement>('.pg-lab')!;
const GROUND: ReadonlySet<string> = new Set(['turret', 'missile', 'fuel']);
const kindName = (kind: string) => ROSTER.flatMap(tier => tier.kinds).find(entry => entry.kind === kind)?.name ?? kind;
function buildLab() {
  const planet = level().planet, hunter = hunterKind(planet);
  labPane.innerHTML = `
    <label class="pg-row"><input data-view="lab" type="checkbox"> Enemy lab: live over this level's map, flying on from "Position" (Level tab); the ship cannot die</label>
    <div class="pg-row"><button type="button" data-lab="attack">Attack now</button><button type="button" data-lab="clear">Clear</button><button type="button" data-lab="restart">Restart here</button></div>
    <p class="pg-note">Models as this world flies them. Its hunter is a shielded ${kindName(hunter)}. Steer the ship with "Ship x".</p>
    ${ROSTER.map(tier => `<details open><summary>${tier.title} <span class="pg-dim">${tier.note}</span></summary>${tier.kinds.map(entry => {
      const model = modelOf(planet, entry.kind), off = entry.worlds && !entry.worlds.includes(planet);
      return `<div class="pg-kind${off ? ' is-off' : ''}">
        <div><strong>${entry.name}</strong> <span class="pg-dim">${entry.role}${entry.kind === hunter ? ' · this world\'s hunter' : ''}${off ? ' · not flown on this world' : ''}</span></div>
        <div class="pg-dim">${model.node ?? model.file} · ${statsLine(entry.kind)}</div>
        <div class="pg-dim">${entry.attack}</div>
        <div class="pg-row pg-wrap"><button type="button" data-spawn="${entry.solo}">Spawn</button>${entry.squad ? `<button type="button" data-spawn="${entry.squad}">${FORMATIONS[entry.squad].name}</button>` : ''}${GROUND.has(entry.kind) ? '' : `<button type="button" data-hunter="${entry.kind}">As hunter</button>`}<button type="button" data-show="${model.file}#${model.node}">Model</button></div>
      </div>`;
    }).join('')}</details>`).join('')}
    <details><summary>Every formation</summary><div class="pg-row pg-wrap">${Object.values(FORMATIONS).filter(template => template.entry !== 'bay').map(template => `<button type="button" data-spawn="${template.id}">${template.name}</button>`).join('')}</div></details>`;
  syncView();
}
/** Turns the lab on (the boss fight off) for a spawn from the roster. */
function ensureLab() {
  if (view.lab) return;
  view.lab = true; view.boss = false; save(VIEW_STORE, view); state = makeState(); syncView(); syncBoss();
}
labPane.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  const { spawn, hunter, lab, show } = target.dataset;
  if (spawn) { ensureLab(); spawnFormation(state, spawn as keyof typeof FORMATIONS); }
  if (hunter) { ensureLab(); spawnHunter(state, hunter as Parameters<typeof spawnHunter>[1]); }
  if (lab === 'attack') attackNow(state);
  if (lab === 'clear') { state.enemies = state.enemies.filter(enemy => enemy.bossPart); state.projectiles = state.projectiles.filter(shot => shot.friendly); }
  if (lab === 'restart') state = makeState();
  if (show) { view.model = show; save(VIEW_STORE, view); switchTab('models'); }
});

// ── Weapons: the hero's guns and specials, firing live in the lab at spawned targets (docs/32). ──
const weaponsPane = root.querySelector<HTMLElement>('.pg-weapons')!;
let specialQueued = false;
const firing = () => view.lab && view.tab === 'weapons';
function buildWeapons() {
  const weapon = WEAPONS[view.weapon], special = SPECIALS[view.special];
  const on = (yes: boolean) => yes ? ' class="is-on"' : '';
  weaponsPane.innerHTML = `
    <label class="pg-row"><input data-view="lab" type="checkbox"> Live over this level's map (Level tab), the ship firing; it cannot die</label>
    <p class="pg-note">Steer with "Ship x" (Level tab) or the buttons below. Targets drift down from the top.</p>
    <h4>Main weapon</h4>
    <div class="pg-row pg-wrap">${WEAPON_IDS.map(id => `<button type="button" data-weapon="${id}"${on(id === view.weapon)}>${WEAPONS[id].label}</button>`).join('')}</div>
    <div class="pg-row pg-wrap">${[0, 1, 2].map(tier => `<button type="button" data-tier="${tier}"${on(tier === view.tier)}>Tier ${tier + 1}</button>`).join('')}</div>
    <p class="pg-dim">${WEAPON_BLURB[view.weapon]} ${WEAPON_TIERS[view.weapon][view.tier]} · ${weapon.damage} a hit · range ${weapon.range}</p>
    <h4>Special</h4>
    <div class="pg-row pg-wrap">${SPECIAL_IDS.map(id => `<button type="button" data-special="${id}"${on(id === view.special)}>${SPECIALS[id].label}</button>`).join('')}</div>
    <p class="pg-dim">${special.blurb}</p>
    <div class="pg-row pg-wrap"><button type="button" data-fire="special">Fire special</button></div>
    <h4>Targets</h4>
    <div class="pg-row pg-wrap">
      <button type="button" data-target="column">Column above the ship</button>
      <button type="button" data-target="snake-weaver-5">Weaver column</button>
      <button type="button" data-target="arrow-5">Arrowhead</button>
      <button type="button" data-target="line-weaver-4">Line abreast</button>
      <button type="button" data-target="hunter">Hunter</button>
      <button type="button" data-target="attack">Enemies fire now</button>
      <button type="button" data-target="clear">Clear</button>
    </div>
    <div class="pg-row pg-wrap"><button type="button" data-nudge="-2">◀ Ship</button><button type="button" data-nudge="0">Centre</button><button type="button" data-nudge="2">Ship ▶</button></div>`;
  syncView();
}
weaponsPane.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  const data = target.dataset;
  if (data.weapon || data.tier) {
    if (data.weapon) view.weapon = data.weapon as WeaponId;
    if (data.tier) view.tier = Number(data.tier);
    state.player.weapon = view.weapon; state.player.power = view.tier; state.mainSequence = undefined; state.nextVolleyAt = state.time;
  }
  if (data.special) { view.special = data.special as SpecialId; state.config.special = view.special; state.well = null; state.lance = null; state.shockwave = null; }
  if (data.fire) { ensureLab(); specialQueued = true; }
  if (data.nudge !== undefined) { view.x = data.nudge === '0' ? 0 : Math.max(-11, Math.min(11, view.x + Number(data.nudge))); syncView(); }
  if (data.target) {
    ensureLab();
    const planet = level().planet;
    if (data.target === 'column') {
      // Four harmless darts in a line straight above the ship: the Rail Driver's ideal shot.
      for (const s of [11, 13.5, 16, 18.5]) {
        const hp = ENEMIES.dart.hp;
        state.enemies.push({ id: state.nextId++, kind: 'dart', x: view.x, s, originX: view.x, hp, maxHp: hp, radius: ENEMIES.dart.radius, age: 0, nextAttack: Infinity, warning: 0, aimX: view.x, groundHeight: VIEW.flightHeight });
      }
    } else if (data.target === 'hunter') spawnHunter(state, hunterKind(planet));
    else if (data.target === 'attack') attackNow(state);
    else if (data.target === 'clear') { state.enemies = state.enemies.filter(enemy => enemy.bossPart); state.projectiles = []; state.well = null; }
    else spawnFormation(state, data.target as keyof typeof FORMATIONS);
  }
  save(VIEW_STORE, view);
  if (data.weapon || data.tier || data.special) buildWeapons();
});

// ── Sites: strike-site models around fake site cores over the level's real map (sites-lab.ts, docs/33). ──
const sitesPane = root.querySelector<HTMLElement>('.pg-sites')!;
function buildSites() {
  const planet = level().planet;
  sitesPane.innerHTML = `
    <label class="pg-row"><input data-view="lab" type="checkbox"> Live over this level's map (Level tab: level and position)</label>
    <label class="pg-row"><input data-view="hold" type="checkbox"> Hold the world still</label>
    <div class="pg-row pg-wrap"><button type="button" data-site-act="hit">Hit the cores</button><button type="button" data-site-act="destroy">Destroy the cores</button><button type="button" data-site-act="clear">Clear</button></div>
    <p class="pg-note">A site's core is a harmless ground target; the site stands around it in this world's finish and stays, destroyed, after the core falls.</p>
    ${SITE_IDS.map(id => {
      const model = SITE_MODELS[id], here = SITES[id].worlds.includes(planet) && !!model?.finishes.includes(planet);
      const note = !model ? 'not modelled yet' : model.finishes.includes(planet) ? `finishes: ${model.finishes.join(', ')}` : `no ${planet} finish (${model.finishes.join(', ')})`;
      return `<div class="pg-kind${here ? '' : ' is-off'}"><div><strong>${SITES[id].name}</strong> <span class="pg-dim">${note}</span></div>
        <div class="pg-row pg-wrap"><button type="button" data-site="${id}" data-spot="-1">West</button><button type="button" data-site="${id}" data-spot="0">Ahead</button><button type="button" data-site="${id}" data-spot="1">East</button></div></div>`;
    }).join('')}`;
  syncView();
}
const siteLab = {
  place(site: SiteId, spot: SiteSpot, row?: number) { ensureLab(); return placeSite(state, level().planet, site, spot, row); },
  destroy() { destroySites(state); },
  hit() { hitSites(state); },
  clear() { state.enemies = state.enemies.filter(enemy => !enemy.site); },
  /** Removes lingering effects (a held world never ages its kill explosion). */
  calm() { state.effects = []; },
};
// Lookdev automation (development builds only): window.siteLab.place('airfield', 1).
if (import.meta.env.DEV) (window as unknown as { siteLab: typeof siteLab }).siteLab = siteLab;
sitesPane.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  const { site, spot, siteAct } = target.dataset;
  if (site) siteLab.place(site as SiteId, Number(spot) as SiteSpot);
  if (siteAct === 'destroy') siteLab.destroy();
  if (siteAct === 'hit') siteLab.hit();
  if (siteAct === 'clear') siteLab.clear();
});

// ── Models: a turntable viewer for the hero, every faction's craft, the loot skid and the bosses (viewer.ts). ──
const modelsPane = root.querySelector<HTMLElement>('.pg-models')!, viewerHost = root.querySelector<HTMLElement>('.pg-viewer')!;
const viewer = createModelViewer(viewerHost), MODELS = viewerModels();
modelsPane.innerHTML = `
  <div class="pg-row pg-wrap"><label class="pg-row"><input data-view="spin" type="checkbox"> Turn</label><label class="pg-row"><input data-view="wire" type="checkbox"> Wireframe</label><label class="pg-row"><input data-view="worldLight" type="checkbox"> This level's light</label></div>
  <div class="pg-model-info"></div>
  ${[...new Set(MODELS.map(model => model.group))].map(group => `<details open><summary>${group}</summary><div class="pg-row pg-wrap">${MODELS.filter(model => model.group === group).map(model => `<button type="button" data-model="${model.id}">${model.label}</button>`).join('')}</div></details>`).join('')}`;
const modelInfo = modelsPane.querySelector<HTMLElement>('.pg-model-info')!;
async function showModel(id: string) {
  const model = MODELS.find(entry => entry.id === id) ?? MODELS[0];
  for (const button of modelsPane.querySelectorAll<HTMLElement>('[data-model]')) button.classList.toggle('is-on', button.dataset.model === model.id);
  modelInfo.textContent = `Loading ${model.label}…`;
  const info = await viewer.show(model);
  if (!info) { modelInfo.textContent = `${model.label}: not found in ${model.file}`; return; }
  modelInfo.innerHTML = `<strong>${model.label}</strong> <span class="pg-dim">${model.group}</span>
    <div class="pg-dim">${model.file}${model.node ? ` · node ${model.node}` : ''}</div>
    <div>${info.triangles.toLocaleString()} triangles · ${info.size.join(' × ')} units (x, height, z) · materials ${info.materials.join(', ')}</div>
    ${model.uses.length ? `<div class="pg-dim">Flies as: ${model.uses.join('; ')}</div>` : ''}`;
}
modelsPane.addEventListener('click', event => {
  const id = (event.target as HTMLElement).closest<HTMLElement>('[data-model]')?.dataset.model;
  if (id) { view.model = id; save(VIEW_STORE, view); void showModel(id); }
});
/** The viewer's light: a neutral studio, or the open level's sun, sky fill and background. */
function applyViewerLight() {
  if (!view.worldLight) { viewer.studio(); return; }
  const look = looks[level().planet];
  viewer.setLight(look.sun[0], look.sun[1], look.hemisphere[0], look.hemisphere[1], look.hemisphere[2], look.background);
}

// ── Hangar: the modular hero ships (src/render/hero-assembly.ts), any chassis, one design per slot, recoloured. ──
const HANGAR_STORE = 'last-worlds.playground.hangar';
const hangarPane = root.querySelector<HTMLElement>('.pg-hangar')!;
const hangar: HeroBuild = load<HeroBuild>(HANGAR_STORE) ?? { chassis: 'scrapper', parts: { hull: 'a', wings: 'a', engines: 'a', cockpit: 'a' } };
function hangarControls() {
  const paint = { ...HERO_DEFAULT_PAINT[hangar.chassis], ...hangar.paint };
  hangarPane.innerHTML = `
    <div class="pg-row pg-wrap">${HERO_CHASSIS.map(chassis => `<button type="button" data-chassis="${chassis}" class="${chassis === hangar.chassis ? 'is-on' : ''}">${chassis[0].toUpperCase() + chassis.slice(1)}</button>`).join('')}</div>
    ${HERO_SLOTS.map(slot => `<div class="pg-row"><span class="pg-dim" style="min-width:5em">${slot}</span>${heroDesigns(hangar.chassis).map(design => `<button type="button" data-slot="${slot}" data-design="${design}" class="${hangar.parts[slot] === design ? 'is-on' : ''}">${design.toUpperCase()}</button>`).join('')}</div>`).join('')}
    <div class="pg-row pg-wrap">${(['primary', 'glow'] as const).map(role => `<label class="pg-color">${role} <input data-paint="${role}" type="color" value="${hex(paint[role])}"></label>`).join('')}</div>
    <div class="pg-row pg-wrap"><button type="button" data-hangar="shuffle">Shuffle parts</button><button type="button" data-hangar="reset">Default paint</button></div>
    <div class="pg-hangar-info pg-dim"></div>`;
}
async function showHangar(controls = true) {
  save(HANGAR_STORE, hangar); if (controls) hangarControls();
  // A remodelled chassis is drawn as the game draws it (textured parts); the others as their kit.
  const object = HERO_REMODELLED.has(hangar.chassis)
    ? (await loadHeroModel(hangar.chassis, { parts: hangar.parts, paint: hangar.paint }))?.object
    : (await assembleHero(hangar)).object;
  if (!object) return;
  const info = viewer.showObject(object);
  hangarPane.querySelector<HTMLElement>('.pg-hangar-info')!.textContent = `${info.triangles.toLocaleString()} triangles · ${info.size.join(' × ')} units`;
}
hangarPane.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  if (target.dataset.chassis) {
    hangar.chassis = target.dataset.chassis as HeroChassis; hangar.paint = undefined;
    const designs = heroDesigns(hangar.chassis);
    for (const slot of HERO_SLOTS) if (!designs.includes(hangar.parts[slot])) hangar.parts[slot] = 'a';
  }
  else if (target.dataset.slot) hangar.parts[target.dataset.slot as HeroSlot] = target.dataset.design as HeroDesign;
  else if (target.dataset.hangar === 'shuffle') hangar.parts = randomHeroBuild(hangar.chassis).parts;
  else if (target.dataset.hangar === 'reset') hangar.paint = undefined;
  else return;
  void showHangar();
});
hangarPane.addEventListener('input', event => {
  const input = event.target as HTMLInputElement, role = input.dataset.paint as 'primary' | 'secondary' | 'glow' | undefined;
  if (!role) return;
  hangar.paint = { ...hangar.paint, [role]: parseInt(input.value.slice(1), 16) };
  void showHangar(false);
});

// ── Tabs ──
function switchTab(tab: Tab) {
  view.tab = tab; save(VIEW_STORE, view);
  for (const pane of root.querySelectorAll<HTMLElement>('[data-pane]')) pane.hidden = pane.dataset.pane !== tab;
  for (const button of root.querySelectorAll<HTMLElement>('[data-tab]')) button.classList.toggle('is-on', button.dataset.tab === tab);
  viewerHost.hidden = tab !== 'models' && tab !== 'hangar';
  if (tab === 'models') { resize(); viewer.setWireframe(view.wire); viewer.setAutoRotate(view.spin); applyViewerLight(); viewer.start(); void showModel(view.model); }
  else if (tab === 'hangar') { resize(); viewer.setWireframe(false); viewer.setAutoRotate(true); viewer.studio(); viewer.start(); void showHangar(); }
  else viewer.stop();
}
root.querySelector('.pg-tabs')!.addEventListener('click', event => {
  const tab = (event.target as HTMLElement).dataset?.tab as Tab | undefined;
  if (tab) switchTab(tab);
});

const groups = root.querySelector<HTMLElement>('.pg-groups')!;
function buildControls() {
  const look = looks[level().planet];
  groups.innerHTML = GROUPS.map(group => `<details open><summary>${group.title}</summary>${group.controls.map(control => {
    const value = get(look, control.path), changed = Math.abs(value - get(defaults[level().planet], control.path)) > 1e-9 ? ' is-changed' : '';
    return control.kind === 'color'
      ? `<label class="pg-color${changed}">${control.label} <input data-path="${control.path}" type="color" value="${hex(value)}"></label>`
      : `<label class="${changed}">${control.label} <input data-path="${control.path}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}"><output>${value}</output></label>`;
  }).join('')}</details>`).join('');
}
groups.addEventListener('input', event => {
  const input = event.target as HTMLInputElement, path = input.dataset.path;
  if (!path) return;
  const look = looks[level().planet], value = input.type === 'color' ? parseInt(input.value.slice(1), 16) : Number(input.value);
  set(look, path, value);
  const output = input.parentElement?.querySelector('output'); if (output) output.textContent = String(value);
  input.parentElement?.classList.toggle('is-changed', Math.abs(value - get(defaults[level().planet], path)) > 1e-9);
  renderer.tuneLook!(level().planet, look);
  persist();
});
function syncView() {
  for (const input of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.pg-panel [data-view]')) {
    const key = input.dataset.view as keyof ViewSettings, value = view[key];
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = value as boolean; else input.value = String(value);
    const output = input.parentElement?.querySelector('output'); if (output) output.textContent = String(value);
  }
}
root.querySelector('.pg-panel')!.addEventListener('input', event => {
  const input = event.target as HTMLInputElement, key = input.dataset.view as keyof ViewSettings | undefined;
  if (!key) return;
  const value = input.type === 'checkbox' ? input.checked : input.type === 'range' || input.type === 'number' ? Number(input.value) : input.value;
  const previous = { mission: view.mission, seed: view.seed, quality: view.quality };
  (view as unknown as Record<string, unknown>)[key] = value;
  const output = input.parentElement?.querySelector('output'); if (output) output.textContent = String(value);
  save(VIEW_STORE, view);
  // The boss fight and the lab both run the simulation: one at a time.
  if (key === 'boss' && view.boss) view.lab = false;
  if (key === 'lab' && view.lab) view.boss = false;
  if (key === 'boss' || key === 'lab') syncView();
  if (view.quality !== previous.quality) renderer.setQuality(view.quality);
  if (view.mission !== previous.mission || view.seed !== previous.seed) void switchLevel();
  else if (key === 'boss' || key === 'lab') { state = makeState(); syncBoss(); }
  if (key === 'wire') viewer.setWireframe(view.wire);
  if (key === 'spin') viewer.setAutoRotate(view.spin);
  if (key === 'worldLight') applyViewerLight();
  if (key === 'mission') { buildLab(); buildSites(); if (view.tab === 'models') applyViewerLight(); }
});
function syncBoss() { root.querySelector<HTMLElement>('.pg-boss')!.hidden = !view.boss; }
root.addEventListener('click', event => {
  const act = (event.target as HTMLElement).dataset?.boss;
  if (act) bossAct(act);
});
root.addEventListener('click', async event => {
  const act = (event.target as HTMLElement).dataset?.act;
  if (!act) return;
  if (act === 'copy') {
    const text = JSON.stringify(exported(), null, 2);
    try { await navigator.clipboard.writeText(text); sync.textContent = 'settings copied'; }
    catch { const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); sync.textContent = 'settings copied'; }
  } else if (act === 'reset' || act === 'reset-all') {
    for (const { planet } of act === 'reset' ? [level()] : LEVELS) { looks[planet] = structuredClone(defaults[planet]); renderer.tuneLook!(planet, looks[planet]); }
    buildControls(); persist();
  } else if (act === 'boom' || act === 'blast') {
    // A presentation effect a few rows ahead of the ship; nothing is simulated.
    state.effects.push({ id: state.nextId++, kind: act === 'boom' ? 'explosion' : 'blast', x: state.player.x + (act === 'boom' ? -1.5 : 2), s: act === 'boom' ? 8 : 12, ttl: 1, duration: 1 });
  }
});

let levelRevision = 0;
async function switchLevel() {
  const revision = ++levelRevision, next = level(), nextState = makeState();
  hud.textContent = `Loading ${next.name}…`;
  await renderer.prepare(next.planet);
  if (revision !== levelRevision) return;
  state = nextState; accumulator = 0;
  renderer.tuneLook!(next.planet, looks[next.planet]);
  hud.textContent = '';
  buildControls();
}

function resize() {
  const rect = stage.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
  viewer.resize(rect.width, rect.height);
}
new ResizeObserver(resize).observe(stage);

let last = performance.now(), frames = 0, fpsAt = last, accumulator = 0;
function frame(now: number) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (view.lab && view.tab !== 'models') {
    // The lab runs for real at the fixed step over the real map; the ship holds its slider position and cannot die. Short of
    // the boss's approach it starts over at the panel's position (the campaign's playlist, hunters and boss stay out).
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      // The Weapons tab lets the hero fire (the lab otherwise holds its guns) and fires a queued special.
      const volley = state.nextVolleyAt;
      state.player.x = view.x; state.player.vx = 0; holdDirector(state);
      if (firing()) state.nextVolleyAt = Number.isFinite(volley) ? volley : state.time;
      if (specialQueued) state.player.specialCharge = 1;
      // Held (Sites tab): no simulation step; only the clock and the effects age, so a kill's explosion plays out.
      if (view.hold && view.tab === 'sites') { state.player.x = view.x; state.cameraX = Math.max(-(VIEW.worldWidth - VIEW.width) / 2, Math.min((VIEW.worldWidth - VIEW.width) / 2, view.x)); state.time += STEP; state.tick++; state.effects = state.effects.filter(effect => (effect.ttl -= STEP) > 0); continue; }
      if (state.phase === 'playing') stepRun(state, specialQueued ? { ...EMPTY_INPUT, specialPressed: true } : EMPTY_INPUT);
      specialQueued = false;
      state.player.lives = Math.max(state.player.lives, 2);
      if (state.time > labClock(view.mission, view.distance).limit) { const enemies = state.enemies; state = makeState(); state.enemies = enemies; }
    }
    renderer.render(state, accumulator / STEP);
  } else if (view.tab === 'models') {
    // The viewer draws on its own canvas; the level waits.
  } else if (view.boss && state.boss) {
    // The fight runs for real at the fixed step; the ship holds its slider position and cannot die.
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      state.player.x = view.x; state.player.vx = 0;
      if (state.phase === 'playing') stepRun(state, EMPTY_INPUT);
      state.player.lives = Math.max(state.player.lives, 2);
    }
    renderer.render(state, accumulator / STEP);
  } else {
    if (view.fly) { view.distance += view.speed * dt; if (view.distance > 1600) view.distance = 0; }
    state.time += dt; state.tick += 1;
    state.distance = view.distance; state.scrollSpeed = view.fly ? view.speed : 0;
    state.player.x = view.x; state.cameraX = Math.max(-(VIEW.worldWidth - VIEW.width) / 2, Math.min((VIEW.worldWidth - VIEW.width) / 2, view.x));
    state.player.lives = view.ship ? 3 : 0;
    renderer.render(state, 0);
  }
  frames++;
  if (now - fpsAt > 1000) {
    const distance = scene.querySelector<HTMLInputElement>('[data-view="distance"]');
    if (view.fly && distance) { distance.value = String(Math.round(view.distance)); distance.parentElement!.querySelector('output')!.textContent = String(Math.round(view.distance)); }
    const fight = view.lab ? ` · enemy lab · ${state.enemies.filter(enemy => enemy.hp > 0).length} enemies` : view.boss && state.boss ? ` · ${state.boss.id.toUpperCase()} ${state.phase === 'playing' ? state.boss.phase : 'cleared'}` : '';
    if (!hud.textContent?.startsWith('Loading')) hud.textContent = `${level().name}${fight} · ${Math.round(frames * 1000 / (now - fpsAt))} fps`;
    frames = 0; fpsAt = now;
  }
  requestAnimationFrame(frame);
}

// Settings from the dev server's file first (so a suggestion written there shows up on reload), else this browser.
const fromFile = await fetch('./__playground/looks').then(response => response.ok ? response.json() : null).catch(() => null) as ReturnType<typeof exported> | null;
restore(fromFile ?? load(STORE));
for (const { planet } of LEVELS) renderer.tuneLook!(planet, looks[planet]);
renderer.setQuality(view.quality);
buildLab();
buildWeapons();
buildSites();
syncView();
syncBoss();
switchTab(view.tab);
await switchLevel();
resize();
requestAnimationFrame(frame);
