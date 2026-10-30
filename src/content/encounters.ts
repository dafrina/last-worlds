import type { EnemyKind, SiteId, WeaponId } from '../shared/contracts';
import { FORMATIONS, slotFlies, type FormationId, type FormationRank } from './formations';

/**
 * One authored squadron placement. 'view' anchors the template to the camera center when the cue is admitted
 * (the mandatory battle follows the player across the wide map); 'world' pins it to a world x for optional
 * side routes. `x` is the anchor's lateral offset and `mirror` flies the validated mirror image.
 */
export interface FormationPlacement {
  readonly formation: FormationId;
  readonly x?: number;
  readonly anchor?: 'view' | 'world';
  readonly mirror?: boolean;
}

/** Pressure arc labels (docs/03 §6): introduction, pressure, recovery, pressure, climax, recovery. */
export type PacingPhase = 'intro' | 'pressure' | 'recovery' | 'climax';

export interface EncounterCue {
  readonly at: number;
  readonly id: string;
  readonly phase: PacingPhase;
  readonly formations: readonly FormationPlacement[];
  readonly message?: string;
  /** A strike site's side route (docs/33): which site and on which side; its guard is in `formations`. */
  readonly site?: { readonly id: SiteId; readonly side: -1 | 1 };
  readonly pickup?: { readonly x: number; readonly s: number; readonly kind: 'credit' | 'power' | 'weapon'; readonly value: number; readonly weapon?: WeaponId };
}

/** Seconds between a two-flank alert and the members' entry. */
export const ALERT_LEAD = 1.4;

/** A view-anchored placement: the formation at lateral offset `x`, optionally its validated mirror image. */
export const f = (formation: FormationId, x = 0, mirror = false): FormationPlacement => ({ formation, x, mirror });

/*
 * The authored arcs of every campaign mission and endless stage, and the encounter deck that resolves them into the
 * concrete cue list a run flies, live in src/content/encounter-deck.ts (docs/33 § 4).
 *
 * Cue times are the earliest admission times. At most one air squadron flies in a stretch of airspace at once
 * (src/sim/airspace.ts), so a later air squadron waits until the previous one is destroyed or gone; ground
 * batteries may arrive beneath it. A pilot who destroys squadrons quickly therefore meets the next one sooner.
 */

/** Enemy kinds a cue admits at the given rank: the complete group, never trimmed. */
export function cueRoster(cue: EncounterCue, rank: FormationRank): EnemyKind[] {
  return cue.formations.flatMap(placement => FORMATIONS[placement.formation].slots
    .filter(slot => slotFlies(slot, rank)).map(slot => slot.kind));
}

/** Alert text a cue must show before its members enter (two-flank entries). */
export function cueAlert(cue: EncounterCue): string | undefined {
  return cue.formations.map(placement => FORMATIONS[placement.formation].alert).find(text => text !== undefined);
}
