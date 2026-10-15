import { AIRSPACE, ENEMIES, GROUND_KINDS } from '../content/balance';
import type { FormationPlacement } from '../content/encounters';
import { FORMATIONS, slotFlies, type FormationRank } from '../content/formations';
import { VIEW, type EnemyKind, type FormationMember, type RunState } from '../shared/contracts';
import { clamp } from './geometry';
import { enemyClockRate, memberPosition, positionAfter } from './motion';

/**
 * Squadron airspace (docs/03 §6). A cue is admitted only if, over the new squadrons' flight, no member of one
 * squadron comes within AIRSPACE.separation of a member of another, and no two air squadrons that could share
 * the screen (lateral extents within one view width) occupy overlapping forward bands. Ground batteries are
 * terrain targets: they keep separation from each other but may pass beneath air squadrons. The rules use
 * world positions only, so they do not depend on where the camera happens to be.
 */
/**
 * View anchors follow the camera but stay 2 units inside its range, so a squadron never pins the ship against
 * a world edge: at the camera limit the squadron still sits fully in view with open sky beyond it.
 */
export const ANCHOR_LIMIT = (VIEW.worldWidth - VIEW.width) / 2 - 2;

export function resolveAnchor(state: Pick<RunState, 'cameraX'>, placement: FormationPlacement): number {
  return placement.anchor === 'world' ? placement.x ?? 0 : clamp(state.cameraX + (placement.x ?? 0), -ANCHOR_LIMIT, ANCHOR_LIMIT);
}

export interface PlannedMember { member: FormationMember; kind: EnemyKind }

/** Members a list of placements would spawn now. Planned groups get negative ids until they spawn. */
export function plannedMembers(state: RunState, placements: readonly FormationPlacement[], rank: FormationRank): PlannedMember[] {
  return placements.flatMap((placement, index) => {
    const template = FORMATIONS[placement.formation];
    const anchorX = resolveAnchor(state, placement);
    return template.slots.flatMap((slot, slotIndex) => slotFlies(slot, rank)
      ? [{ kind: slot.kind, member: { template: template.id, slot: slotIndex, anchorX, mirror: placement.mirror ? -1 as const : 1 as const, group: -1 - index } }]
      : []);
  });
}

interface Track { group: number; air: boolean; radius: number; at(t: number): { x: number; s: number } }

/** The visible band plus a margin: squadrons still above the view (entering or leaving) cannot be seen to overlap. */
const inAirspace = (s: number) => s > VIEW.minS && s < VIEW.maxS + 1.5;

interface GroupSample { air: boolean; x0: number; x1: number; s0: number; s1: number; points: { x: number; s: number }[] }

function sample(tracks: readonly Track[], t: number): Map<number, GroupSample> {
  const groups = new Map<number, GroupSample>();
  for (const track of tracks) {
    const p = track.at(t);
    if (!inAirspace(p.s)) continue;
    let g = groups.get(track.group);
    if (!g) { g = { air: track.air, x0: Infinity, x1: -Infinity, s0: Infinity, s1: -Infinity, points: [] }; groups.set(track.group, g); }
    g.x0 = Math.min(g.x0, p.x - track.radius); g.x1 = Math.max(g.x1, p.x + track.radius);
    g.s0 = Math.min(g.s0, p.s - track.radius); g.s1 = Math.max(g.s1, p.s + track.radius);
    g.points.push(p);
  }
  return groups;
}

/**
 * Extents swept over one sampling interval (the union of both ends), so fast squadrons closing on each other
 * cannot slip between samples. Separation is still judged on same-instant positions.
 */
function sweep(now: Map<number, GroupSample>, next: Map<number, GroupSample>): Map<number, GroupSample> {
  const out = new Map(now);
  for (const [id, b] of next) {
    const a = out.get(id);
    out.set(id, a ? { ...a, x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), s0: Math.min(a.s0, b.s0), s1: Math.max(a.s1, b.s1) } : { ...b, points: [] });
  }
  return out;
}

/** True if two squadron samples break the airspace rules. Exported for the offline validator. */
export function airspaceConflict(a: GroupSample, b: GroupSample, margin = 0): boolean {
  if (a.air !== b.air) return false;
  for (const p of a.points) for (const q of b.points) if (Math.hypot(p.x - q.x, p.s - q.s) < AIRSPACE.separation + margin) return true;
  if (!a.air) return false;
  const couldShareScreen = a.x0 < b.x1 + VIEW.width + margin && b.x0 < a.x1 + VIEW.width + margin;
  const gap = AIRSPACE.bandGap + margin;
  const bandsOverlap = a.s0 < b.s1 + gap && b.s0 < a.s1 + gap;
  return couldShareScreen && bandsOverlap;
}

/** Group samples of the live squadrons right now, for the validator's independent observation. */
export function liveGroups(state: RunState): Map<number, GroupSample> {
  const tracks: Track[] = state.enemies.filter(enemy => enemy.hp > 0 && enemy.formation && !enemy.bossPart)
    .map(enemy => ({ group: enemy.formation!.group, air: !GROUND_KINDS.has(enemy.kind), radius: enemy.radius, at: () => ({ x: enemy.x, s: enemy.s }) }));
  return sample(tracks, 0);
}

export function airspaceClear(state: RunState, planned: readonly PlannedMember[]): boolean {
  const live: Track[] = state.enemies.filter(enemy => enemy.hp > 0 && enemy.formation && !enemy.bossPart).map(enemy => {
    const rate = enemyClockRate(state, enemy);
    return { group: enemy.formation!.group, air: !GROUND_KINDS.has(enemy.kind), radius: enemy.radius, at: (t: number) => t === 0 ? { x: enemy.x, s: enemy.s } : positionAfter(enemy, t, rate) };
  });
  const fresh: Track[] = planned.map(({ member, kind }) => {
    const rate = GROUND_KINDS.has(kind) ? state.scrollSpeed / VIEW.scrollSpeed : state.pace;
    return { group: member.group, air: !GROUND_KINDS.has(kind), radius: ENEMIES[kind].radius, at: (t: number) => memberPosition(member, t * rate) };
  });
  const freshGroups = new Set(fresh.map(track => track.group));
  const tracks = live.concat(fresh);
  for (let t = 0; t <= AIRSPACE.horizon + 1e-9; t += AIRSPACE.step) {
    const groups = sweep(sample(tracks, t), sample(tracks, t + AIRSPACE.step));
    for (const [id, group] of groups) {
      if (!freshGroups.has(id)) continue;
      // Predictions are sampled, so they keep an extra margin over the exact rule the validator observes.
      for (const [other, sample] of groups) if (other !== id && airspaceConflict(group, sample, AIRSPACE.predictionMargin)) return false;
    }
  }
  return true;
}
