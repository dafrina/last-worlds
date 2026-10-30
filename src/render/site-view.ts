import * as THREE from 'three';
import { VIEW, type PlanetId, type RunState, type SiteId } from '../shared/contracts';
import { loadTexturedNodes, type TexturedPart } from './models';
import { SITE_CORE_HEIGHT, SITE_MODELS, SITE_PARTS, SITE_ROOF_CLEARANCE, siteFile, siteFinish, siteNode, sitesWithModels, type SitePart } from './site-models';
import type { ViewFootprint } from './view-footprint';

/**
 * Strike sites (docs/33 § 6), render only: each live enemy with `site` set is a site's core target, and the site's
 * Blender model stands around it in the current world's finish, anchored to the ground like a battery's plant (the
 * pivot is the core's ground anchor). The model draws the core itself, so scene.ts skips the enemy's own model
 * (`hidesCore`). When the core is killed (it vanishes with the simulation's kill explosion), the site stays where it
 * stood as a destroyed site: the core hidden, its broken remains shown, lamps out and the structure darkened, until it
 * scrolls out of view. A site's rectangle is a terrain clearing and is reserved from battery compounds.
 *
 * Assets: `public/assets/shared/sites/<site>-<finish>.glb` (tools/blender/strike_sites.py), loaded with the planet in
 * `prepare` and drawn once hidden for the warm-up, so a site never compiles a program mid-flight. Never simulation:
 * nothing here changes a target, a collision or loot.
 */
export interface SiteStats {
  loaded: boolean;
  /** Sites tracked now, and how many are destroyed. */
  count: number; destroyed: number;
  /** Sites drawn this frame, and each loaded finish's source. */
  drawn: number; files: Record<string, 'loading' | 'ready' | 'failed'>;
  /** Each tracked site, for the browser checks. */
  sites: { id: number; site: SiteId; finish: PlanetId; destroyed: boolean; rise: number; squash: number }[];
}
interface Rect { minX: number; maxX: number; minS: number; maxS: number }
export interface SiteView {
  /** Starts loading a world's site finishes (with the planet, ahead of its first site). */
  prepare(planet: PlanetId): Promise<void>;
  isReady(planet: PlanetId): boolean;
  warmupObjects(): THREE.Object3D[];
  /**
   * Before the enemies are drawn: tracks site cores, kills and scroll-outs, and places the models. `ground` is the
   * terrain surface (scene.ts), sampled once per site to seat it.
   */
  update(state: RunState, planet: PlanetId, view: ViewFootprint, ground?: (x: number, s: number) => number): void;
  /** This enemy is a site core whose model the site draws: scene.ts leaves its own craft model out. */
  hidesCore(enemyId: number): boolean;
  /** World rectangles of the tracked sites: terrain clearings, and reserved from battery compounds. */
  readonly clearings: Rect[];
  readonly stats: SiteStats;
  dispose(): void;
}

/** A destroyed site: its structure darkened to this share of its paint, its lamps out. */
export const SITE_RUIN_SHADE = .16;
/** …toward this burnt charcoal (linear), so a white hull reads as scorched under any world light. */
const SCORCH = new THREE.Color(.02, .016, .014);
/** A hit on the core brightens its glow for this long (s), as enemies flash. */
const FLASH = .14;
/**
 * A site on rising ground is lifted onto it, at most this much over its core's anchor, so the terrain does not bury it.
 * The core rises with it: its glow then stands up to this much over the target's proxy (about 0.7 of it on screen).
 */
export const SITE_RISE_MAX = .4;
/** The flattest a site on high ground is squashed about its core (docs/25 rule 3). */
const SQUASH_MIN = .55;

interface Instance { group: THREE.Group; parts: Record<SitePart | 'wreck', THREE.Group>; site: SiteId; finish: PlanetId }
interface Template {
  site: SiteId; finish: PlanetId;
  parts: Record<SitePart, TexturedPart[]>;
  /** Each live material's destroyed twin (darkened; glow off). */
  dead: Map<THREE.Material, THREE.MeshStandardMaterial>;
  /** The core's glow materials (hit flash) and their authored intensity. */
  glow: THREE.MeshStandardMaterial[];
  free: Instance[]; used: Set<Instance>;
}
interface Placed {
  id: number; site: SiteId; finish: PlanetId;
  /** World x, world s of the core's ground anchor, and its ground height. */
  x: number; worldS: number; base: number;
  /** The lift onto rising ground (NaN until sampled). */
  rise: number;
  alive: boolean; destroyed: boolean; hp: number; hitAt: number;
  /** The core's gameplay position last seen (to match its kill explosion). */
  lastX: number; lastS: number; squash: number;
  instance?: Instance;
}

const key = (site: SiteId, finish: PlanetId) => `${site}:${finish}`;
const glowing = (material: THREE.Material) => /glow/i.test(material.name);

export function createSiteView(scene: THREE.Scene, onReady: () => void): SiteView {
  const templates = new Map<string, Template | 'loading' | 'failed'>(), loads = new Map<string, Promise<void>>();
  const placed = new Map<number, Placed>();
  let disposed = false, config: RunState['config'] | null = null, lastTick = -1, current: PlanetId | null = null, prefetched: PlanetId | null = null, drawn = 0;

  function instance(template: Template): Instance {
    const reuse = template.free.pop();
    if (reuse) { template.used.add(reuse); return reuse; }
    const group = new THREE.Group();
    group.name = `site ${template.site} ${template.finish}`;
    const make = (list: TexturedPart[], dead: boolean) => {
      const part = new THREE.Group();
      for (const { geometry, material } of list) {
        const mesh = new THREE.Mesh(geometry, dead ? template.dead.get(material)! : material);
        mesh.castShadow = !glowing(material); mesh.receiveShadow = true;
        part.add(mesh);
      }
      group.add(part);
      return part;
    };
    // `wreck`: the body with its destroyed materials (the same geometry, the darkened twins).
    const parts = { body: make(template.parts.body, false), wreck: make(template.parts.body, true), core: make(template.parts.core, false), ruin: make(template.parts.ruin, true) };
    group.visible = false;
    scene.add(group);
    const made: Instance = { group, parts, site: template.site, finish: template.finish };
    template.used.add(made);
    return made;
  }
  function release(entry: Placed) {
    const made = entry.instance, template = made && templates.get(key(made.site, made.finish));
    if (!made) return;
    entry.instance = undefined; made.group.visible = false;
    if (typeof template === 'object') { template.used.delete(made); template.free.push(made); }
  }
  function load(site: SiteId, finish: PlanetId): Promise<void> {
    const id = key(site, finish);
    if (loads.has(id)) return loads.get(id)!;
    templates.set(id, 'loading');
    const names = SITE_PARTS.map(part => siteNode(site, finish, part));
    const loading = loadTexturedNodes(`${import.meta.env.BASE_URL}assets/${siteFile(site, finish)}`, names).then(found => {
      const release = () => found.forEach(list => list.forEach(({ geometry }) => geometry.dispose()));
      if (disposed || names.some(name => !found.has(name))) {
        release();
        if (!disposed) { templates.set(id, 'failed'); console.warn(`Site model ${site} (${finish}) is incomplete; its core keeps its own model.`); }
        return;
      }
      const parts = Object.fromEntries(SITE_PARTS.map(part => [part, found.get(siteNode(site, finish, part))!])) as Record<SitePart, TexturedPart[]>;
      const dead = new Map<THREE.Material, THREE.MeshStandardMaterial>(), glow: THREE.MeshStandardMaterial[] = [];
      for (const list of Object.values(parts)) for (const { material } of list) {
        material.envMapIntensity = .85;
        if (dead.has(material)) continue;
        // The destroyed twin: same program (same features), darker paint, no light.
        const twin = material.clone();
        twin.name = `${material.name} destroyed`;
        if (glowing(material)) { twin.color.setRGB(.035, .03, .03); twin.emissive.setRGB(0, 0, 0); }
        else { twin.color.multiplyScalar(SITE_RUIN_SHADE).lerp(SCORCH, .3); twin.roughness = Math.max(twin.roughness, .85); twin.metalness *= .5; }
        dead.set(material, twin);
      }
      for (const { material } of parts.core) if (glowing(material) && !glow.includes(material)) { material.userData.siteGlow = material.emissiveIntensity; glow.push(material); }
      const template: Template = { site, finish, parts, dead, glow, free: [], used: new Set() };
      templates.set(id, template);
      // One hidden instance per finish from the start: the warm-up compiles its live and destroyed programs.
      template.free.push(instance(template)); template.used.clear();
      onReady();
    }).catch(error => { templates.set(id, 'failed'); console.warn(`Site model ${site} (${finish}) unavailable; its core keeps its own model.`, error); });
    loads.set(id, loading);
    return loading;
  }
  function dispose(id: string) {
    const template = templates.get(id);
    templates.delete(id); loads.delete(id);
    if (typeof template !== 'object') return;
    for (const made of [...template.free, ...template.used]) scene.remove(made.group);
    for (const list of Object.values(template.parts)) for (const { geometry } of list) geometry.dispose();
    const materials = new Set<THREE.Material>([...template.dead.keys(), ...template.dead.values()]);
    materials.forEach(material => material.dispose());
  }
  const prepare = (planet: PlanetId) => Promise.all(sitesWithModels(planet).map(site => load(site, planet))).then(() => undefined);
  const ready = (site: SiteId, finish: PlanetId) => { const template = templates.get(key(site, finish)); return typeof template === 'object' ? template : null; };
  const bounds = (entry: Placed): Rect => {
    const model = SITE_MODELS[entry.site]!;
    return { minX: entry.x + model.x[0], maxX: entry.x + model.x[1], minS: entry.worldS + model.s[0], maxS: entry.worldS + model.s[1] };
  };

  return {
    prepare(planet) { prefetched = planet; return prepare(planet); },
    isReady(planet) { return sitesWithModels(planet).every(site => { const template = templates.get(key(site, planet)); return template !== undefined && template !== 'loading'; }); },
    warmupObjects() {
      const out: THREE.Object3D[] = [];
      templates.forEach(template => { if (typeof template === 'object') for (const made of [...template.free, ...template.used]) out.push(made.group); });
      return out;
    },
    hidesCore(enemyId) { return !!placed.get(enemyId)?.instance; },
    get clearings() { return [...placed.values()].map(bounds); },
    get stats(): SiteStats {
      const all = [...placed.values()];
      return {
        loaded: current !== null && this.isReady(current), count: all.length, destroyed: all.filter(entry => entry.destroyed).length, drawn,
        files: Object.fromEntries([...templates].map(([id, template]) => [id, typeof template === 'object' ? 'ready' : template])),
        sites: all.map(entry => ({ id: entry.id, site: entry.site, finish: entry.finish, destroyed: entry.destroyed, rise: Math.round(entry.rise * 100) / 100, squash: Math.round(entry.squash * 100) / 100 })),
      };
    },
    update(state, planet, view, ground) {
      if (config !== state.config || state.tick < lastTick) { placed.forEach(release); placed.clear(); config = state.config; }
      lastTick = state.tick; current = planet;
      void prepare(planet);
      const seen = new Set<number>();
      for (const enemy of state.enemies) {
        if (!enemy.site || enemy.bossPart || !enemy.ground) continue;
        const finish = siteFinish(enemy.site, planet);
        if (!finish) continue;
        seen.add(enemy.id);
        let entry = placed.get(enemy.id);
        if (!entry) {
          entry = { id: enemy.id, site: enemy.site, finish, x: 0, worldS: 0, base: 0, rise: NaN, alive: true, destroyed: false, hp: enemy.hp, hitAt: -9,
            lastX: enemy.x, lastS: enemy.s, squash: 1 };
          placed.set(enemy.id, entry);
        }
        // The anchor is fixed in the world (src/sim/ground.ts); follow it anyway, as the gun's own model does.
        entry.x = enemy.ground.x; entry.worldS = state.distance + enemy.ground.s; entry.base = enemy.ground.base;
        if (enemy.hp < entry.hp) entry.hitAt = state.time;
        entry.hp = enemy.hp; entry.lastX = enemy.x; entry.lastS = enemy.s;
        if (enemy.hp <= 0) entry.destroyed = true;
      }
      for (const entry of placed.values()) {
        if (seen.has(entry.id) || !entry.alive) continue;
        entry.alive = false;
        // Killed: it vanished with the simulation's kill explosion at its position (as ground wrecks are matched in scene.ts).
        if (state.effects.some(effect => effect.kind === 'explosion' && Math.abs(effect.x - entry.lastX) < .6 && Math.abs(effect.s - entry.lastS) < .8)) entry.destroyed = true;
      }
      drawn = 0;
      const flash = new Map<Template, number>();
      for (const [id, entry] of placed) {
        const model = SITE_MODELS[entry.site]!, b = bounds(entry);
        if (b.maxS - state.distance < VIEW.minS - 4) { release(entry); placed.delete(id); continue; }
        const template = ready(entry.site, entry.finish);
        if (!template) continue;
        const inView = b.maxX > view.minX - 1 && b.minX < view.maxX + 1 && b.minS - state.distance < view.maxS + 1 && b.maxS - state.distance > view.minS - 1;
        // Keep the instance while the core lives (hidesCore), even out of view; a destroyed site only while seen.
        if (!inView && entry.destroyed) { release(entry); continue; }
        entry.instance ??= instance(template);
        const made = entry.instance, group = made.group;
        group.visible = inView;
        if (!inView) continue;
        drawn++;
        // docs/25 rule 3: on high ground the site is squashed about its core (which stays where the target is) so its
        // roofs stay SITE_ROOF_CLEARANCE under the flight plane; the foundation skirt covers the raised floor.
        if (Number.isNaN(entry.rise)) entry.rise = ground ? riseOf(entry, model, ground) : 0;
        const c = SITE_CORE_HEIGHT, seat = entry.base + entry.rise, roof = VIEW.flightHeight - SITE_ROOF_CLEARANCE - seat;
        entry.squash = seat + model.top > VIEW.flightHeight - SITE_ROOF_CLEARANCE ? Math.max(SQUASH_MIN, Math.min(1, (roof - c) / (model.top - c))) : 1;
        group.position.set(entry.x, seat + c * (1 - entry.squash), -(entry.worldS - state.distance));
        group.scale.set(1, entry.squash, 1);
        made.parts.body.visible = made.parts.core.visible = !entry.destroyed;
        made.parts.wreck.visible = made.parts.ruin.visible = entry.destroyed;
        if (model.spin) made.parts.core.rotation.y = state.time * model.spin;
        if (!entry.destroyed) flash.set(template, Math.max(flash.get(template) ?? 0, Math.max(0, 1 - (state.time - entry.hitAt) / FLASH)));
      }
      templates.forEach((template, id) => {
        if (typeof template !== 'object') return;
        const kick = flash.get(template) ?? 0;
        for (const material of template.glow) material.emissiveIntensity = (material.userData.siteGlow as number) * (1 + 1.8 * kick);
        // A world left behind releases its sites once none of them is tracked (endless revisits reload them).
        if (template.finish !== planet && template.finish !== prefetched && ![...placed.values()].some(entry => entry.finish === template.finish)) dispose(id);
      });
    },
    dispose() {
      disposed = true;
      [...templates.keys()].forEach(dispose);
      placed.clear();
    },
  };
}

/**
 * How far to lift a site onto the ground under it: the ground three quarters of the way up its footprint's samples
 * (a few high bumps may still show through; lower ground is covered by the foundation skirt), at most SITE_RISE_MAX.
 */
function riseOf(entry: Placed, model: NonNullable<(typeof SITE_MODELS)[SiteId]>, ground: (x: number, s: number) => number): number {
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const x = entry.x + model.x[0] * .8 + (model.x[1] - model.x[0]) * .8 * i / 4, s = entry.worldS + model.s[0] * .8 + (model.s[1] - model.s[0]) * .8 * j / 4;
    samples.push(ground(x, s));
  }
  samples.sort((a, b) => a - b);
  return Math.max(0, Math.min(SITE_RISE_MAX, samples[Math.floor(samples.length * .75)] - .03 - entry.base));
}
