import type { EncounterCue } from '../../src/content/encounters';
import { FORMATIONS } from '../../src/content/formations';
import { SITES, siteCue } from '../../src/content/sites';
import { VIEW, type MissionId, type PlanetId, type RunState, type SiteId } from '../../src/shared/contracts';

/**
 * Strike-site test harness (docs/33): until the encounter deck (workstream A) draws sites into side slots, tests inject
 * site cues into the authored playlists. A test file mocks src/content/encounters so that `campaignPlaylist` and
 * `endlessPlaylist` consult `injection` first:
 *
 *   vi.mock('../../src/content/encounters', async importOriginal => {
 *     const actual = await importOriginal<typeof import('../../src/content/encounters')>();
 *     const { injection } = await import('./site-harness');
 *     return { ...actual, campaignPlaylist: (m: MissionId) => injection.campaign?.(m, actual.campaignPlaylist(m)) ?? actual.campaignPlaylist(m),
 *       endlessPlaylist: (s: number) => injection.endless?.(s, actual.endlessPlaylist(s)) ?? actual.endlessPlaylist(s) };
 *   });
 */
export const injection: {
  campaign?: (mission: MissionId, base: readonly EncounterCue[]) => readonly EncounterCue[] | undefined;
  endless?: (sector: number, base: readonly EncounterCue[]) => readonly EncounterCue[] | undefined;
} = {};

/** The authored side routes of a playlist: recovery cues whose squadrons are world-anchored off the centre line. */
export const sideRoutes = (cues: readonly EncounterCue[]) => cues.filter(cue => cue.phase === 'recovery'
  && cue.formations.length > 0 && cue.formations.every(placement => placement.anchor === 'world' && Math.abs(placement.x ?? 0) > 3));

/**
 * A playlist whose side routes are strike sites, as the deck's side slots will be: the i-th side route becomes
 * `sites[i % sites.length]`, at its time and on its side.
 */
export function withSites(cues: readonly EncounterCue[], sites: readonly SiteId[], planet: PlanetId): EncounterCue[] {
  const routes = sideRoutes(cues);
  return cues.map(cue => {
    const index = routes.indexOf(cue);
    if (index < 0 || !sites.length) return cue;
    const side = Math.sign(cue.formations[0].x ?? 1) as -1 | 1;
    return siteCue(sites[index % sites.length], side, cue.at, planet);
  });
}

/** Parts a site drops in the campaign (0 for the others). */
export const siteParts = (id: SiteId) => SITES[id].loot.kind === 'part' ? SITES[id].loot.value : 0;

/**
 * Where a site-hunting pilot wants to be (perfectPilot's `prefer`): over a part, else under a live site core while it
 * approaches, else over a shield cell, else wherever the perfect pilot would go. It still dodges everything (the evasion
 * solver decides).
 */
export function siteSeeker(seen: RunState, now: RunState): number | null {
  const pickup = (kind: string) => now.pickups.filter(p => p.kind === kind && p.s > -1 && p.s < VIEW.maxS).sort((a, b) => a.s - b.s)[0];
  const part = pickup('part');
  if (part) return part.x;
  const core = seen.enemies.filter(enemy => enemy.site && enemy.hp > 0 && enemy.s > 1.5 && enemy.s < VIEW.maxS + 12)
    .sort((a, b) => a.s - b.s)[0];
  if (core) return core.x;
  return pickup('shield')?.x ?? null;
}

/** Whether a placement belongs to a site's guard or core (for tests that inspect spawned site enemies). */
export const isSiteFormation = (template: string | undefined) => !!template && template in FORMATIONS && template.startsWith('site-');
