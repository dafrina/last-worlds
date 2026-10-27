/**
 * The playground's roster (user, 27 October: "make a model viewer for each enemy and the hero ... classify them by
 * type/tier of enemy and make me able to simulate its attacks"): every enemy kind by role and tier, with the formation the
 * lab spawns it in, and the model it flies on each world, read from the renderer's own tables (src/render/scene.ts) so the
 * roster can never disagree with the game.
 */
import { ENEMIES } from '../content/balance';
import { HUNTERS } from '../sim/hunters';
import { BOSS_ASSETS } from '../render/boss-assets';
import { KHEPRI_NODE, NACRE_CRAFT, UMBRA_CRAFT, UMBRA_DRONE_SCALE, VESPER_CRAFT, VESPER_KINDS } from '../render/scene';
import type { EnemyKind, PlanetId } from '../shared/contracts';
import type { FormationId } from '../content/formations';

export interface RosterKind {
  kind: EnemyKind; name: string; role: string;
  /** The lab's single spawn and its squad. */
  solo: FormationId; squad?: FormationId;
  /** What it does (shown beside its stats). */
  attack: string;
  /** Only on these worlds in the campaign (the Wraith is Umbra's). */
  worlds?: readonly PlanetId[];
}
export interface RosterTier { title: string; note: string; kinds: readonly RosterKind[] }

export const ROSTER: readonly RosterTier[] = [
  { title: 'Tier I · Light fighters', note: 'Fast, fragile, in numbers.', kinds: [
    { kind: 'dart', name: 'Dart', role: 'Interceptor', solo: 'solo-dart', squad: 'arrow-5', attack: 'Aimed shot at the ship after a short windup.' },
    { kind: 'needle', name: 'Needle', role: 'Interceptor', solo: 'needle-solo', squad: 'needle-column-5', attack: 'A very narrow locked beam down its lane.' },
  ] },
  { title: 'Tier II · Escorts', note: 'Tougher, patterned fire.', kinds: [
    { kind: 'weaver', name: 'Weaver', role: 'Heavy fighter', solo: 'solo-weaver', squad: 'snake-weaver-5', attack: 'A pair of aimed shots while it weaves.' },
    { kind: 'lancer', name: 'Lancer', role: 'Elite hunter', solo: 'solo-lancer', squad: 'diamond-lancer', attack: 'A beam down the screen after a long, marked windup.' },
  ] },
  { title: 'Tier III · Heavies', note: 'Big hulls, sustained pressure.', kinds: [
    { kind: 'diamond', name: 'Diamond', role: 'Drone carrier / heavy', solo: 'diamond-solo', squad: 'diamond-convoy', attack: 'Three-shot volleys from alternating wings.' },
    { kind: 'pulsar', name: 'Pulsar', role: 'Artillery', solo: 'pulsar-solo', squad: 'pulsar-pair', attack: 'A stream whose every shot aims at the ship: keep moving.' },
  ] },
  { title: 'Tier IV · Predators', note: 'A world\'s apex hunter.', kinds: [
    { kind: 'wraith', name: 'Wraith', role: 'Phase predator', solo: 'wraith-solo', attack: 'Feints, warps beside you, fires a rapid triplet; twice, five seconds apart.', worlds: ['umbra'] },
  ] },
  { title: 'Ground', note: 'On the terrain, scrolling with it.', kinds: [
    { kind: 'turret', name: 'Battery', role: 'Defense turret', solo: 'solo-turret', squad: 'battery-4', attack: 'Three-shot spread at the ship.' },
    { kind: 'missile', name: 'Missile battery', role: 'Artillery mortar', solo: 'missile-2', squad: 'missile-3', attack: 'Fast straight missiles down its own marked column.' },
    { kind: 'fuel', name: 'Fuel depot', role: 'Loot', solo: 'fuel-pair', squad: 'fuel-depot', attack: 'Never fires; bursts and damages what stands near it.' },
  ] },
];

/** The world's hunter kind: an elite, shielded copy of one of its kinds. */
export const hunterKind = (planet: PlanetId): EnemyKind => HUNTERS.kinds[planet];

/** A model in a GLB: the node (null = the whole scene, the bosses) and the scale the game draws it at. */
export interface ModelRef { file: string; node: string | null; scale: number }

/** The model a kind flies on a world, in the renderer's order of precedence (src/render/scene.ts, the enemy batches). */
export function modelOf(planet: PlanetId, kind: EnemyKind, pod = false): ModelRef {
  if (kind === 'fuel') return { file: 'shared/loot-props.glb', node: 'loot_fuel', scale: 1 };
  if (planet === 'umbra') {
    if (pod) return { file: 'umbra/umbra-craft.glb', node: 'umbra_drone', scale: UMBRA_DRONE_SCALE };
    if (kind === 'wraith') return { file: 'umbra/wraith-v2.glb', node: 'umbra_wraith', scale: 0.76 };
    return { file: 'umbra/umbra-craft.glb', node: UMBRA_CRAFT[kind].node, scale: UMBRA_CRAFT[kind].scale };
  }
  if (planet === 'nacre' || planet === 'amnion') {
    if (pod) return { file: 'nacre/nacre-craft.glb', node: 'nacre_pod', scale: 1 };
    if (planet === 'amnion' && kind === 'diamond') return { file: 'amnion/brood-heavy-v1.glb', node: 'amnion_brood_heavy', scale: 0.82 };
    return { file: 'nacre/nacre-craft.glb', node: NACRE_CRAFT[kind].node, scale: NACRE_CRAFT[kind].scale };
  }
  const vesper = VESPER_CRAFT[kind];
  if (vesper && (planet === 'vesper' || VESPER_KINDS.has(kind))) return { file: 'vesper/vesper-craft.glb', node: vesper.node, scale: vesper.scale };
  return { file: 'khepri/khepri-craft.glb', node: KHEPRI_NODE[kind], scale: 1 };
}

export const WORLDS: readonly { planet: PlanetId; name: string }[] = [
  { planet: 'luna', name: 'Luna' }, { planet: 'khepri', name: 'Khepri' }, { planet: 'vesper', name: 'Vesper' },
  { planet: 'nacre', name: 'Nacre' }, { planet: 'amnion', name: 'Amnion' }, { planet: 'umbra', name: 'Umbra' },
];

/** A viewer entry: one model, the group it is listed in, and who flies it where. */
export interface ViewerModel extends ModelRef { id: string; group: string; label: string; uses: string[] }

/** Every model the viewer lists: the hero, each faction's craft (who flies them, where), the loot skid and the bosses. */
export function viewerModels(): ViewerModel[] {
  const models = new Map<string, ViewerModel>();
  const add = (group: string, file: string, node: string | null, label: string, use?: string) => {
    const id = `${file}#${node ?? '*'}`;
    const entry = models.get(id) ?? { id, group, label, file, node, scale: 1, uses: [] };
    if (use && !entry.uses.includes(use)) entry.uses.push(use);
    models.set(id, entry);
  };
  add('Hero', 'shared/hero-scrapper.glb', 'hero_scrapper', 'Scrapper', 'the player\'s ship');
  const group = (file: string) => file.startsWith('khepri') ? 'Khepri craft (also Luna)' : file.startsWith('vesper') ? 'Vesper craft'
    : file.startsWith('nacre') ? 'Nacre craft (also Amnion)' : file.startsWith('amnion') ? 'Amnion' : file.startsWith('umbra') ? 'Umbral fleet' : 'Loot';
  for (const tier of ROSTER) for (const entry of tier.kinds) for (const { planet, name } of WORLDS) {
    if (entry.worlds && !entry.worlds.includes(planet)) continue;
    const model = modelOf(planet, entry.kind);
    add(group(model.file), model.file, model.node, model.node ?? model.file, `${entry.name} on ${name}`);
  }
  for (const { planet, name } of WORLDS) {
    const pod = modelOf(planet, 'dart', true);
    if (planet === 'nacre' || planet === 'amnion' || planet === 'umbra') add(group(pod.file), pod.file, pod.node, pod.node ?? pod.file, `boss pod wave on ${name}`);
    add(group(modelOf(planet, hunterKind(planet)).file), modelOf(planet, hunterKind(planet)).file, modelOf(planet, hunterKind(planet)).node, modelOf(planet, hunterKind(planet)).node ?? '', `hunter on ${name}`);
  }
  for (const [boss, file] of Object.entries(BOSS_ASSETS)) add('Bosses', file, null, boss.toUpperCase(), 'boss');
  const order = ['Hero', 'Khepri craft (also Luna)', 'Vesper craft', 'Nacre craft (also Amnion)', 'Amnion', 'Umbral fleet', 'Loot', 'Bosses'];
  return [...models.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.label.localeCompare(b.label));
}

/** One line of a kind's gameplay numbers. */
export function statsLine(kind: EnemyKind): string {
  const e = ENEMIES[kind];
  return `hp ${e.hp} · radius ${e.radius} · ${e.attackEvery === Infinity ? 'never fires' : `attacks every ${e.attackEvery} s after a ${e.warning} s warning`}${e.shotSpeed ? ` · shots ${e.shotSpeed}` : ''}`;
}
