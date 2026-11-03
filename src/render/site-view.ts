import { liveInstances } from './instances';
import * as THREE from 'three';
import { VIEW, type PlanetId, type RunState, type SiteId } from '../shared/contracts';
import { FORMATIONS, siteCoreFormation } from '../content/formations';
import { SITE_CORE_HEIGHT } from '../content/sites';
import { lensEye } from '../shared/lens';
import { loadTexturedNodes, type TexturedPart } from './models';
import { SITE_MODELS, SITE_PARTS, SITE_ROOF_CLEARANCE, siteFile, siteFinish, siteNode, sitesWithModels, type SitePart } from './site-models';
import type { ViewFootprint } from './view-footprint';
import { SITE_PADS, SITE_PAD_KEEPS, sitePadGround, sitePadWeight, type SitePad, type SitePadKeep } from './terrain-kit';
import { PLANETS } from '../world/terrain-planet';
import { PONTOON_DECK } from '../world/run-route';
import { SITE_DROP_MAX } from '../sim/sites';
import { SITE_FIRE, type SiteBlast, type WorldPoint } from './fx-particles';

/**
 * Strike sites (docs/33 § 6), render only. The live enemies with `site` set are a site's core targets (one, or the
 * sealed vault's three seals, one formation group); the site's Blender model stands at their seat (src/sim/sites.ts:
 * the floor the cores rest on) in the current world's finish, each core drawn at its own anchor. The model draws the
 * cores, so scene.ts skips their own models (`hidesCore`). A killed core leaves its broken remains; when the last one
 * falls the site stays where it stood as a destroyed site (darkened, lamps out, debris and a scorch) until it scrolls
 * out of view. Any drop under the floor is filled with foundations; the site's rectangle is a terrain clearing and is
 * reserved from battery compounds.
 *
 * Destruction (user, 3 November: "a memorable destruction effect comparable in style to boss explosions, but scaled
 * appropriately"): the frame the last core falls, `onBlast` hands src/render/fx-particles.ts the site's sequence in world
 * space (its core, floor, footprint and main masses: `siteMasses`), which replaces the core's kill explosion; a vault seal
 * breaking before the last gets one blast. The site turns to its ruin in that frame, under the blast's white-hot flash, and
 * the ruin takes over smoothly: its lamps flicker out, its paint darkens to charcoal under the fire, its scorch, debris and
 * embers spread out with the shock ring and glow with the blast's heat, cooling to the resting ruin as the sequence ends
 * (SITE_HEAT).
 *
 * Assets: `public/assets/shared/sites/<site>-<finish>.glb` (tools/blender/strike_sites.py), loaded with the planet in
 * `prepare` and drawn once hidden for the warm-up, so a site never compiles a program mid-flight. Never simulation:
 * nothing here changes a target, a collision or loot.
 */
export interface SiteStats {
  loaded: boolean;
  /** Sites tracked now, and how many are destroyed. */
  count: number; destroyed: number;
  /** Sites drawn this frame, foundation blocks drawn, and each loaded finish's source. */
  drawn: number; foundations: number; files: Record<string, 'loading' | 'ready' | 'failed'>;
  /** Each tracked site, for the browser checks. */
  sites: { key: string; site: SiteId; finish: PlanetId; cores: number; destroyed: boolean; base: number; squash: number }[];
}
interface Rect { minX: number; maxX: number; minS: number; maxS: number }
export interface SiteView {
  /** Starts loading a world's site finishes (with the planet, ahead of its first site). */
  prepare(planet: PlanetId): Promise<void>;
  isReady(planet: PlanetId): boolean;
  warmupObjects(): THREE.Object3D[];
  /**
   * Before the enemies are drawn: tracks site cores, kills and scroll-outs, and places the models. `ground` is the
   * terrain surface (scene.ts), sampled once per site for its foundations.
   */
  update(state: RunState, planet: PlanetId, view: ViewFootprint, ground?: (x: number, s: number) => number): void;
  /** This enemy is a site core whose model the site draws: scene.ts leaves its own craft model out. */
  hidesCore(enemyId: number): boolean;
  /** World rectangles of the tracked sites: terrain clearings, and reserved from battery compounds. */
  readonly clearings: Rect[];
  /** The ground pads under the sites nearest the view (at most SITE_PADS): the terrain levels to each site's floor there. */
  readonly pads: SitePad[];
  /** The ground batteries near those pads, whose ground the pads leave as it is (at most SITE_PAD_KEEPS). */
  readonly keeps: SitePadKeep[];
  readonly stats: SiteStats;
  dispose(): void;
}

/** A destroyed site: its structure darkened to this share of its paint, its lamps out (its ash and embers stay). */
export const SITE_RUIN_SHADE = .26;
/** …toward this burnt charcoal (linear), so a white hull reads as scorched under any world light. */
const SCORCH = new THREE.Color(.02, .016, .014);
/** A hit on a core brightens its glow for this long (s), as enemies flash. */
const FLASH = .14;
/**
 * A destroyed site's ruin cools from the blast for this long (s): its paint darkens to its destroyed twin's over SCORCH_TIME,
 * its lamps flicker out over LAMP_TIME, its scorch and debris glow with the blast's heat (the world's, SITE_FIRE) and its
 * embers flare, settling to the resting ruin exactly at SITE_HEAT. Its blast marks spread out from the core over RUIN_SPREAD.
 */
export const SITE_HEAT = 2.4;
const SCORCH_TIME = .8, LAMP_TIME = .7, RUIN_SPREAD = .45;
/** The heat's glow on the scorch and on everything else (the darkening paint, the debris) at the kill. */
const HEAT_SCORCH = .3, HEAT_BODY = .1;
/** The flattest a site on high ground is squashed about its core (docs/25 rule 3). */
const SQUASH_MIN = .35;
/** Foundations fill drops under a site's floor down to this depth (the seat search keeps seats within it, src/sim/sites.ts). */
export const SITE_FOUNDATION_MAX = SITE_DROP_MAX;
/** Foundation blocks in each world's ground tone (Vesper's ice-shelf blocks, Umbra's obsidian). */
const FOUNDATION_COLOR: Readonly<Record<PlanetId, number>> = {
  luna: 0x8a8884, khepri: 0x7a4a2c, vesper: 0xd6e4f0, nacre: 0x2e2a42, amnion: 0x9a7a62, umbra: 0x17151f,
};
const FOUNDATION_CAPACITY = 240;
/**
 * The ground under a site is levelled to its floor (render only, src/render/terrain-kit.ts site pads): flat over its model's
 * rectangle, easing back to the terrain across this band around it (scenery in the band is cleared with the site). The
 * ground under a battery within SITE_PAD_KEEP of it stays as it is.
 */
export const SITE_PAD_BLEND = .9;
export const SITE_PAD_KEEP = 1.1;

interface Instance {
  group: THREE.Group; body: THREE.Group; wreck: THREE.Group; cores: { core: THREE.Group; ruin: THREE.Group }[]; site: SiteId; finish: PlanetId;
  /** Its wreck and ruins wear the template's cooling twins (`hot`), not the resting ones. */
  hot: boolean;
}
interface Template {
  site: SiteId; finish: PlanetId;
  parts: Record<SitePart, TexturedPart[]>;
  /** Each live material's destroyed twin (darkened; glow off). */
  dead: Map<THREE.Material, THREE.MeshStandardMaterial>;
  /**
   * Each live material's cooling twin: the destroyed twin's program (a clone: nothing to compile), its colours driven from
   * the live look to the destroyed one over SITE_HEAT by the latest destroyed site of this template (`hotOwner`).
   */
  hot: Map<THREE.Material, THREE.MeshStandardMaterial>;
  hotOwner: Placed | null;
  /** The cores' glow materials (hit flash) and their authored intensity. */
  glow: THREE.MeshStandardMaterial[];
  /** The body's main masses in the model's frame (siteMasses), and the core's glow (sRGB hex). */
  masses: WorldPoint[]; accent: number;
  free: Instance[]; used: Set<Instance>;
}
interface Core {
  id: number;
  /** Its anchor relative to the site's centre (ground units). */
  dx: number; ds: number;
  alive: boolean; destroyed: boolean; hp: number; hitAt: number;
  /** Its gameplay position last seen (to match its kill explosion). */
  lastX: number; lastS: number;
  /** Its kill explosion (the simulation's effect id), when matched; when its destruction was handed to the effects. */
  effect?: number; diedAt?: number;
}
interface Placed {
  key: string; site: SiteId; finish: PlanetId;
  /** The site's centre (world x, world s) and its floor. */
  x: number; worldS: number; base: number;
  cores: Core[]; squash: number;
  /** Ground batteries seen near it (by enemy id): their ground stays as it is while the site is tracked, so a battery's
   * wreck keeps its ground after the battery falls. */
  kept: Map<number, SitePadKeep>;
  /** Foundation blocks under it (world x, s, bottom, height, half sizes), sampled once. */
  foundations: { x: number; s: number; y: number; h: number; hx: number; hs: number }[] | null;
  instance?: Instance;
  /** When its last core fell (simulation time). */
  diedAt?: number;
}

const key = (site: SiteId, finish: PlanetId) => `${site}:${finish}`;
const glowing = (material: THREE.Material) => /glow/i.test(material.name);
const ember = (material: THREE.Material) => /ember/i.test(material.name);
const ash = (material: THREE.Material) => /_ash$/i.test(material.name);
const scorch = (material: THREE.Material) => /scorch/i.test(material.name);

/**
 * A site's main masses in its model's frame (x, y up, z = −s; the core's ground anchor at the origin), for the secondary
 * blasts of its destruction: over its tallest parts (a tower, the hangars, the freighter's halves, the gate's pillars), at
 * most `count`, at least 1.6 apart and 1.1 from the core (which has its own blast). From the body's vertices on a 6 × 6 grid
 * over its bounds: each cell's highest point, and the middle of what stands over half that height; a mass stands at 60% of
 * its cell's height. Cells under 0.5 high are taken only when too few are taller (none under 0.3).
 */
export function siteMasses(positions: readonly ArrayLike<number>[], count = 4): WorldPoint[] {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of positions) for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]); }
  if (!(maxX > minX && maxZ > minZ)) return [];
  const N = 6, top = new Float32Array(N * N).fill(-Infinity), sx = new Float32Array(N * N), sz = new Float32Array(N * N), n = new Float32Array(N * N);
  const cell = (x: number, z: number) => Math.min(N - 1, Math.floor((z - minZ) / (maxZ - minZ) * N)) * N + Math.min(N - 1, Math.floor((x - minX) / (maxX - minX) * N));
  for (const p of positions) for (let i = 0; i < p.length; i += 3) { const c = cell(p[i], p[i + 2]); top[c] = Math.max(top[c], p[i + 1]); }
  for (const p of positions) for (let i = 0; i < p.length; i += 3) { const c = cell(p[i], p[i + 2]); if (p[i + 1] >= top[c] * .5) { sx[c] += p[i]; sz[c] += p[i + 2]; n[c]++; } }
  const cells = [...top.keys()].filter(c => n[c] > 0).map(c => ({ x: sx[c] / n[c], z: sz[c] / n[c], h: top[c] })).sort((a, b) => b.h - a.h);
  const out: WorldPoint[] = [];
  for (const least of [.5, .3]) for (const c of cells) {
    if (out.length >= count || c.h < least || Math.hypot(c.x, c.z) < 1.1 || out.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 1.6)) continue;
    out.push({ x: c.x, y: c.h * .6, z: c.z });
  }
  return out;
}
/** How far the lens spreads a gameplay offset on the ground at height y (cores share the floor, so one factor). */
const spreadAt = (y: number) => { const eye = lensEye(0).y; return (eye - y) / (eye - VIEW.flightHeight); };
const destroyed = (entry: Placed) => entry.cores.every(core => core.destroyed);

/**
 * `onReady` when a world's site finishes have loaded (the warm-up runs again); `onBlast` once for each destroyed site (and
 * each vault seal broken before its last), in the frame it falls (src/render/fx-particles.ts `siteBlast`).
 */
export function createSiteView(scene: THREE.Scene, onReady: () => void, onBlast: (blast: SiteBlast) => void = () => undefined): SiteView {
  const templates = new Map<string, Template | 'loading' | 'failed'>(), loads = new Map<string, Promise<void>>();
  const placed = new Map<string, Placed>(), byCore = new Map<number, string>();
  let disposed = false, config: RunState['config'] | null = null, lastTick = -1, current: PlanetId | null = null, prefetched: PlanetId | null = null, lastDistance = 0;
  let drawn = 0;
  /** Ground batteries (not site cores) near tracked sites, this frame: the pads keep their ground. */
  let keeps: SitePadKeep[] = [];
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  const foundations = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, metalness: .02 }), FOUNDATION_CAPACITY);
  foundations.name = 'site foundations'; foundations.count = 0; foundations.frustumCulled = false;
  foundations.castShadow = foundations.receiveShadow = true; foundations.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < FOUNDATION_CAPACITY; i++) foundations.setColorAt(i, tint.setRGB(1, 1, 1));
  scene.add(foundations);

  function instance(template: Template): Instance {
    const reuse = template.free.pop();
    if (reuse) { template.used.add(reuse); return reuse; }
    const group = new THREE.Group();
    group.name = `site ${template.site} ${template.finish}`;
    const make = (list: TexturedPart[], dead: boolean, parent: THREE.Object3D = group) => {
      const part = new THREE.Group();
      for (const { geometry, material } of list) {
        const mesh = new THREE.Mesh(geometry, dead ? template.dead.get(material)! : material);
        mesh.castShadow = !glowing(material); mesh.receiveShadow = true;
        // A destroyed part remembers its live material: it wears that one's resting or cooling twin (`wear`).
        if (dead) mesh.userData.live = material;
        part.add(mesh);
      }
      parent.add(part);
      return part;
    };
    // `wreck`: the body with its destroyed materials (the same geometry, the darkened twins); a core and its ruin per seal.
    const seals = FORMATIONS[siteCoreFormation(template.site)].slots.length;
    const made: Instance = {
      group, body: make(template.parts.body, false), wreck: make(template.parts.body, true), site: template.site, finish: template.finish,
      cores: Array.from({ length: seals }, () => ({ core: make(template.parts.core, false), ruin: make(template.parts.ruin, true) })), hot: false,
    };
    group.visible = false;
    scene.add(group);
    template.used.add(made);
    return made;
  }
  /** Dresses an instance's wreck and ruins in the template's cooling twins or its resting ones. */
  function wear(made: Instance, template: Template, hot: boolean) {
    made.hot = hot;
    for (const part of [made.wreck, ...made.cores.map(({ ruin }) => ruin)]) for (const mesh of part.children as THREE.Mesh[]) {
      const live = mesh.userData.live as THREE.Material | undefined;
      if (live) mesh.material = (hot ? template.hot : template.dead).get(live)!;
    }
  }
  function release(entry: Placed) {
    const made = entry.instance, template = made && templates.get(key(made.site, made.finish));
    if (!made) return;
    entry.instance = undefined; made.group.visible = false;
    if (typeof template === 'object') {
      if (made.hot) wear(made, template, false);
      for (const { ruin } of made.cores) ruin.scale.setScalar(1);
      template.used.delete(made); template.free.push(made);
    }
  }
  function forget(entry: Placed) {
    const template = ready(entry.site, entry.finish);
    if (template?.hotOwner === entry) template.hotOwner = null;
    release(entry);
    placed.delete(entry.key);
    for (const core of entry.cores) byCore.delete(core.id);
  }
  function load(site: SiteId, finish: PlanetId): Promise<void> {
    const id = key(site, finish);
    if (loads.has(id)) return loads.get(id)!;
    templates.set(id, 'loading');
    const names = SITE_PARTS.map(part => siteNode(site, finish, part));
    const loading = loadTexturedNodes(`${import.meta.env.BASE_URL}assets/${siteFile(site, finish)}`, names).then(found => {
      const free = () => found.forEach(list => list.forEach(({ geometry }) => geometry.dispose()));
      if (disposed || names.some(name => !found.has(name))) {
        free();
        if (!disposed) { templates.set(id, 'failed'); console.warn(`Site model ${site} (${finish}) is incomplete; its cores keep their own model.`); }
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
        // Embers (`ember_glow`) smoulder on in the wreck and the blast's pale ash (`ash`) keeps its colour, so the ruin reads
        // on charcoal and on dark ground; every other lamp goes out.
        if (/ember/i.test(material.name)) twin.emissiveIntensity = material.emissiveIntensity * .8;
        else if (/_ash$/i.test(material.name)) { /* ash keeps its paint */ }
        else if (glowing(material)) { twin.color.setRGB(.035, .03, .03); twin.emissive.setRGB(0, 0, 0); }
        else { twin.color.multiplyScalar(SITE_RUIN_SHADE).lerp(SCORCH, .3); twin.roughness = Math.max(twin.roughness, .85); twin.metalness *= .5; }
        dead.set(material, twin);
      }
      for (const { material } of parts.core) if (glowing(material) && !glow.includes(material)) { material.userData.siteGlow = material.emissiveIntensity; glow.push(material); }
      // The cooling twins: clones of the destroyed ones (the same program), driven by `cool`.
      const hot = new Map<THREE.Material, THREE.MeshStandardMaterial>();
      dead.forEach((twin, material) => { const warm = twin.clone(); warm.name = `${material.name} cooling`; hot.set(material, warm); });
      // The core's glow colour (its brightest glow material) for the blast's first flash and its ring.
      const lit = glow.reduce<THREE.MeshStandardMaterial | null>((best, material) => !best || material.emissiveIntensity > best.emissiveIntensity ? material : best, null);
      const masses = siteMasses(parts.body.map(({ geometry }) => geometry.getAttribute('position').array));
      const template: Template = { site, finish, parts, dead, hot, hotOwner: null, glow, masses, accent: lit ? lit.emissive.getHex() : SITE_FIRE[finish].flash, free: [], used: new Set() };
      templates.set(id, template);
      // One hidden instance per finish from the start: the warm-up compiles its live and destroyed programs.
      const warm = instance(template);
      template.used.delete(warm); template.free.push(warm);
      onReady();
    }).catch(error => { templates.set(id, 'failed'); console.warn(`Site model ${site} (${finish}) unavailable; its cores keep their own model.`, error); });
    loads.set(id, loading);
    return loading;
  }
  function dispose(id: string) {
    const template = templates.get(id);
    templates.delete(id); loads.delete(id);
    if (typeof template !== 'object') return;
    for (const made of [...template.free, ...template.used]) scene.remove(made.group);
    for (const list of Object.values(template.parts)) for (const { geometry } of list) geometry.dispose();
    const materials = new Set<THREE.Material>([...template.dead.keys(), ...template.dead.values(), ...template.hot.values()]);
    // The file's own textures (atlas, normal, metal/roughness; the twins share them) go too: a revisited world reloads its
    // sites, and textures left behind stayed on the GPU for the rest of the session (mobile performance pass, 3 November).
    const textures = new Set<THREE.Texture>();
    materials.forEach(material => { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); });
    materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
  }
  const prepare = (planet: PlanetId) => Promise.all(sitesWithModels(planet).map(site => load(site, planet))).then(() => undefined);
  const ready = (site: SiteId, finish: PlanetId) => { const template = templates.get(key(site, finish)); return typeof template === 'object' ? template : null; };
  const bounds = (entry: Placed): Rect => {
    const model = SITE_MODELS[entry.site]!;
    return { minX: entry.x + model.x[0], maxX: entry.x + model.x[1], minS: entry.worldS + model.s[0], maxS: entry.worldS + model.s[1] };
  };
  const padOf = (entry: Placed): SitePad => {
    // A site on a deck over the sea (Nacre's mire, Vesper's sea) stands in the shallows: the seabed fills only to under the water.
    const sea = PLANETS[entry.finish].seaLevel, afloat = sea !== null && entry.base <= sea + PONTOON_DECK + 1e-3;
    return { ...bounds(entry), level: entry.base, blend: SITE_PAD_BLEND, fill: afloat ? sea - .05 : entry.base };
  };
  /** Foundation blocks under the model's rectangle wherever the levelled ground (the pad, less near batteries) still drops below the floor. */
  function foundationsOf(entry: Placed, terrain: (x: number, s: number) => number): Placed['foundations'] {
    const pad = padOf(entry), near = keeps.filter(keep => keep.x > pad.minX - 2 && keep.x < pad.maxX + 2 && keep.s > pad.minS - 2 && keep.s < pad.maxS + 2);
    const ground = (x: number, s: number) => sitePadGround(pad, terrain(x, s), sitePadWeight(pad, x, s, near));
    const b = bounds(entry), out: NonNullable<Placed['foundations']> = [], inset = .25;
    const nx = Math.max(1, Math.round((b.maxX - b.minX - 2 * inset) / 1.1)), ns = Math.max(1, Math.round((b.maxS - b.minS - 2 * inset) / 1.1));
    const hx = (b.maxX - b.minX - 2 * inset) / nx / 2, hs = (b.maxS - b.minS - 2 * inset) / ns / 2;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ns; j++) {
      const x = b.minX + inset + hx * (2 * i + 1), s = b.minS + inset + hs * (2 * j + 1);
      const low = Math.min(...[[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([u, v]) => ground(x + u * hx, s + v * hs)));
      const drop = Math.min(SITE_FOUNDATION_MAX, entry.base - low);
      if (drop > .12) out.push({ x, s, y: entry.base - drop - .15, h: drop + .1, hx, hs });
    }
    return out;
  }

  /** The simulation's kill explosion for a core (at its gameplay position last seen), if it is in this snapshot. */
  const killOf = (state: RunState, core: Core) =>
    state.effects.find(effect => effect.kind === 'explosion' && Math.abs(effect.x - core.lastX) < .6 && Math.abs(effect.s - core.lastS) < .8);
  /** A site's (or a seal's) blast in this frame's world space: its points from the site's placement and its model's masses. */
  function blastOf(kind: SiteBlast['kind'], entry: Placed, template: Template, core: Core, state: RunState, covers: readonly Core[] = [core]): SiteBlast {
    const model = SITE_MODELS[entry.site]!, c = SITE_CORE_HEIGHT[entry.site], floor = entry.base + c * (1 - entry.squash), z0 = -(entry.worldS - state.distance);
    return {
      kind, finish: entry.finish, effects: covers.flatMap(other => other.effect === undefined ? [] : [other.effect]), floor, accent: template.accent, seed: entry.cores[0].id,
      core: { x: entry.x + core.dx, y: entry.base + c, z: z0 - core.ds },
      centre: { x: entry.x + (model.x[0] + model.x[1]) / 2, z: z0 - (model.s[0] + model.s[1]) / 2 },
      half: { x: (model.x[1] - model.x[0]) / 2, z: (model.s[1] - model.s[0]) / 2 },
      masses: template.masses.map(mass => ({ x: entry.x + mass.x, y: floor + mass.y * entry.squash, z: z0 + mass.z })),
    };
  }
  /**
   * Hands each core destroyed since the last frame to the effects, once: with the last one the whole site (it falls now,
   * `diedAt`, and its ruin cools as its template's latest; its blast covers vault seals broken in the same frame), before
   * it a seal's blast each. Only a site that drew its cores (a finish that failed or was still loading leaves the kill
   * explosion as it is).
   */
  function announce(entry: Placed, template: Template, gone: boolean, state: RunState) {
    const fresh = entry.cores.filter(core => core.destroyed && core.diedAt === undefined);
    if (!fresh.length) return;
    for (const core of fresh) core.diedAt = state.time;
    if (gone) entry.diedAt = state.time;
    if (!entry.instance) return;
    if (gone) template.hotOwner = entry;
    if (gone) onBlast(blastOf('site', entry, template, fresh[fresh.length - 1], state, fresh));
    else for (const core of fresh) onBlast(blastOf('seal', entry, template, core, state));
  }
  const warmth = new THREE.Color(), heat = new THREE.Color();
  /**
   * The cooling twins `age` seconds after the kill: lamps flicker out over LAMP_TIME, paint darkens from its live look over
   * SCORCH_TIME, the scorch (and faintly the rest) glows with the world's heat and the embers flare, all reaching the
   * destroyed twins' values exactly at SITE_HEAT (where the ruin changes back to them).
   */
  function cool(template: Template, age: number) {
    const t = Math.min(1, age / SITE_HEAT), heatLeft = (1 - t) ** 3, darken = THREE.MathUtils.smoothstep(age, 0, SCORCH_TIME);
    const lamp = age < LAMP_TIME ? (1 - age / LAMP_TIME) * (.55 + .45 * Math.sin(age * 53)) : 0;
    warmth.setHex(SITE_FIRE[template.finish].heat);
    template.hot.forEach((hot, material) => {
      const live = material as THREE.MeshStandardMaterial, dead = template.dead.get(material)!;
      if (ash(live)) return;
      if (ember(live)) { hot.emissiveIntensity = dead.emissiveIntensity * (1 + 1.5 * heatLeft); return; }
      if (glowing(live)) {
        hot.color.copy(dead.color).lerp(live.color, lamp);
        hot.emissive.copy(live.emissive); hot.emissiveIntensity = ((live.userData.siteGlow as number | undefined) ?? live.emissiveIntensity) * lamp;
        return;
      }
      hot.color.copy(live.color).lerp(dead.color, darken);
      hot.roughness = live.roughness + (dead.roughness - live.roughness) * darken; hot.metalness = live.metalness + (dead.metalness - live.metalness) * darken;
      hot.emissiveIntensity = Math.max(1e-3, dead.emissiveIntensity);
      hot.emissive.copy(dead.emissive).add(heat.copy(warmth).multiplyScalar(heatLeft * (scorch(live) ? HEAT_SCORCH : HEAT_BODY) / hot.emissiveIntensity));
    });
  }

  return {
    prepare(planet) { prefetched = planet; return prepare(planet); },
    isReady(planet) { return sitesWithModels(planet).every(site => { const template = templates.get(key(site, planet)); return template !== undefined && template !== 'loading'; }); },
    warmupObjects() {
      const out: THREE.Object3D[] = [foundations];
      templates.forEach(template => { if (typeof template === 'object') for (const made of [...template.free, ...template.used]) out.push(made.group); });
      return out;
    },
    hidesCore(enemyId) { const entry = placed.get(byCore.get(enemyId) ?? ''); return !!entry?.instance; },
    // The pad's blend band is cleared too: a rock there would stand on ground the pad has moved.
    get clearings() { return [...placed.values()].map(entry => { const b = bounds(entry); return { minX: b.minX - SITE_PAD_BLEND, maxX: b.maxX + SITE_PAD_BLEND, minS: b.minS - SITE_PAD_BLEND, maxS: b.maxS + SITE_PAD_BLEND }; }); },
    get keeps() { return keeps; },
    get pads() {
      // The sites nearest the view's middle row first (a pad levels the ground only while it is in the shader's list).
      return [...placed.values()].sort((a, b) => Math.abs(a.worldS - lastDistance - 8) - Math.abs(b.worldS - lastDistance - 8)).slice(0, SITE_PADS).map(padOf);
    },
    get stats(): SiteStats {
      const all = [...placed.values()];
      return {
        loaded: current !== null && this.isReady(current), count: all.length, destroyed: all.filter(destroyed).length, drawn, foundations: foundations.count,
        files: Object.fromEntries([...templates].map(([id, template]) => [id, typeof template === 'object' ? 'ready' : template])),
        sites: all.map(entry => ({ key: entry.key, site: entry.site, finish: entry.finish, cores: entry.cores.length, destroyed: destroyed(entry),
          base: Math.round(entry.base * 100) / 100, squash: Math.round(entry.squash * 100) / 100 })),
      };
    },
    update(state, planet, view, ground) {
      if (config !== state.config || state.tick < lastTick) { placed.forEach(release); placed.clear(); byCore.clear(); config = state.config; }
      lastTick = state.tick; current = planet; lastDistance = state.distance;
      void prepare(planet);
      const seen = new Set<number>();
      for (const enemy of state.enemies) {
        if (!enemy.site || enemy.bossPart || !enemy.ground) continue;
        const finish = siteFinish(enemy.site, planet);
        if (!finish) continue;
        seen.add(enemy.id);
        const anchor = { x: enemy.ground.x, s: state.distance + enemy.ground.s };
        let entry = placed.get(byCore.get(enemy.id) ?? '');
        if (!entry) {
          // The site's centre: this core's anchor less its seat in the group (the vault's seals sit around it).
          const member = enemy.formation, slot = member ? FORMATIONS[member.template as keyof typeof FORMATIONS]?.slots[member.slot] : undefined;
          const spread = spreadAt(enemy.ground.base + SITE_CORE_HEIGHT[enemy.site]);
          const dx = (slot?.dx ?? 0) * (member?.mirror ?? 1) * spread, ds = (slot?.ds ?? 0) * spread;
          const groupKey = `${enemy.site}:${member?.group ?? enemy.id}`;
          entry = placed.get(groupKey);
          if (!entry) {
            entry = { key: groupKey, site: enemy.site, finish, x: anchor.x - dx, worldS: anchor.s - ds, base: enemy.ground.base, cores: [], squash: 1, kept: new Map(), foundations: null };
            placed.set(groupKey, entry);
          }
          entry.cores.push({ id: enemy.id, dx: anchor.x - entry.x, ds: anchor.s - entry.worldS, alive: true, destroyed: false, hp: enemy.hp, hitAt: -9, lastX: enemy.x, lastS: enemy.s });
          byCore.set(enemy.id, groupKey);
        }
        const core = entry.cores.find(other => other.id === enemy.id)!;
        if (enemy.hp < core.hp) core.hitAt = state.time;
        core.hp = enemy.hp; core.lastX = enemy.x; core.lastS = enemy.s;
        if (enemy.hp <= 0 && !core.destroyed) { core.destroyed = true; core.effect = killOf(state, core)?.id; }
      }
      for (const entry of placed.values()) for (const core of entry.cores) {
        if (seen.has(core.id) || !core.alive) continue;
        core.alive = false;
        // Killed: it vanished with the simulation's kill explosion at its position (as ground wrecks are matched in scene.ts).
        const kill = core.destroyed ? undefined : killOf(state, core);
        if (kill) { core.destroyed = true; core.effect = kill.id; }
      }
      // Ground batteries near a site keep their ground (remembered per site: a fallen battery's wreck stays where it stood).
      if (placed.size) for (const enemy of state.enemies) {
        if (enemy.site || !enemy.ground || enemy.bossPart) continue;
        const x = enemy.ground.x, s = state.distance + enemy.ground.s;
        for (const entry of placed.values()) {
          const b = bounds(entry), m = SITE_PAD_BLEND + SITE_PAD_KEEP;
          if (!entry.kept.has(enemy.id) && x > b.minX - m && x < b.maxX + m && s > b.minS - m && s < b.maxS + m) entry.kept.set(enemy.id, { x, s, radius: SITE_PAD_KEEP });
        }
      }
      keeps = [...placed.values()].flatMap(entry => [...entry.kept.values()]).slice(0, SITE_PAD_KEEPS);
      drawn = 0; foundations.count = 0;
      const flash = new Map<Template, number>(), cooling = new Map<Template, number>();
      for (const entry of [...placed.values()]) {
        const model = SITE_MODELS[entry.site]!, b = bounds(entry), gone = destroyed(entry);
        if (b.maxS - state.distance < VIEW.minS - 4) { forget(entry); continue; }
        const template = ready(entry.site, entry.finish);
        if (!template) continue;
        // docs/25 rule 3: on high ground the site is squashed about its core (which stays where the target is) so its
        // roofs stay SITE_ROOF_CLEARANCE under the flight plane.
        const c = SITE_CORE_HEIGHT[entry.site], roof = VIEW.flightHeight - SITE_ROOF_CLEARANCE - entry.base;
        entry.squash = entry.base + model.top > VIEW.flightHeight - SITE_ROOF_CLEARANCE ? Math.max(SQUASH_MIN, Math.min(1, (roof - c) / (model.top - c))) : 1;
        // Destroyed this frame: its blast (or a seal's), handed over once, in this frame's world space (in view or not).
        announce(entry, template, gone, state);
        const inView = b.maxX > view.minX - 1 && b.minX < view.maxX + 1 && b.minS - state.distance < view.maxS + 1 && b.maxS - state.distance > view.minS - 1;
        // Keep the instance while a core lives (hidesCore), even out of view; a destroyed site only while seen.
        if (!inView && gone) { release(entry); continue; }
        entry.instance ??= instance(template);
        const made = entry.instance, group = made.group;
        group.visible = inView;
        if (!inView) continue;
        drawn++;
        group.position.set(entry.x, entry.base + c * (1 - entry.squash), -(entry.worldS - state.distance));
        group.scale.set(1, entry.squash, 1);
        // The swap happens the frame the last core falls, under the blast's white-hot flash; the ruin then cools (`cool`)
        // while it is its template's latest.
        made.body.visible = !gone; made.wreck.visible = gone;
        const hot = gone && template.hotOwner === entry && state.time - entry.diedAt! < SITE_HEAT;
        if (made.hot !== hot) wear(made, template, hot);
        if (hot) cooling.set(template, state.time - entry.diedAt!);
        made.cores.forEach(({ core, ruin }, i) => {
          const seal = entry.cores[i];
          core.visible = !!seal && !seal.destroyed; ruin.visible = !!seal && seal.destroyed;
          for (const part of [core, ruin]) part.position.set(seal?.dx ?? 0, 0, -(seal?.ds ?? 0));
          // Its blast marks (scorch, ash, debris) spread out from the core with the shock ring.
          const spread = seal?.diedAt === undefined ? 1 : Math.min(1, Math.max(0, state.time - seal.diedAt) / RUIN_SPREAD), k = .3 + .7 * (1 - (1 - spread) ** 2);
          ruin.scale.set(k, 1, k);
          // A floating crystal keeps its shape on a squashed site: unsquashed about its own centre (the target).
          if (model.spin) { core.scale.y = 1 / entry.squash; core.position.y = c - c / entry.squash; }
          if (model.spin) core.rotation.y = state.time * model.spin + i * 2.1;
          if (seal && !seal.destroyed) flash.set(template, Math.max(flash.get(template) ?? 0, Math.max(0, 1 - (state.time - seal.hitAt) / FLASH)));
        });
        // Foundations under its floor (sampled once), in the world's ground tone.
        if (ground && !entry.foundations) entry.foundations = foundationsOf(entry, ground);
        for (const block of entry.foundations ?? []) {
          if (foundations.count >= FOUNDATION_CAPACITY) break;
          transform.position.set(block.x, block.y, -(block.s - state.distance)); transform.scale.set(block.hx * 2, block.h, block.hs * 2);
          transform.updateMatrix();
          foundations.setMatrixAt(foundations.count, transform.matrix);
          foundations.setColorAt(foundations.count++, tint.setHex(FOUNDATION_COLOR[entry.finish], THREE.SRGBColorSpace));
        }
      }
      liveInstances(foundations, foundations.count);
      templates.forEach((template, id) => {
        if (typeof template !== 'object') return;
        const kick = flash.get(template) ?? 0;
        for (const material of template.glow) material.emissiveIntensity = (material.userData.siteGlow as number) * (1 + 1.8 * kick);
        const age = cooling.get(template);
        if (age !== undefined) cool(template, age);
        // A world left behind releases its sites once none of them is tracked (endless revisits reload them).
        if (template.finish !== planet && template.finish !== prefetched && ![...placed.values()].some(entry => entry.finish === template.finish)) dispose(id);
      });
    },
    dispose() {
      disposed = true;
      [...templates.keys()].forEach(dispose);
      placed.clear(); byCore.clear();
      scene.remove(foundations); foundations.geometry.dispose(); (foundations.material as THREE.Material).dispose(); foundations.dispose();
    },
  };
}
