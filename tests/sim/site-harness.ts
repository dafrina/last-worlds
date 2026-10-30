import type { EncounterCue } from '../../src/content/encounters';
import { FORMATIONS } from '../../src/content/formations';
import { SITES, siteCue } from '../../src/content/sites';
import { VIEW, type PlanetId, type RunConfig, type RunState, type SiteId } from '../../src/shared/contracts';

/**
 * Strike-site test harness (docs/33). The encounter deck draws sites into side slots by the run's seed; tests that need
 * particular sites inject them into the resolved playlists. A test file mocks src/content/encounter-deck so that
 * `resolvePlaylist` consults `injection` first:
 *
 *   vi.mock('../../src/content/encounter-deck', async importOriginal => {
 *     const actual = await importOriginal<typeof import('../../src/content/encounter-deck')>();
 *     const { injection } = await import('./site-harness');
 *     return { ...actual, resolvePlaylist: (config: Pick<RunConfig, 'mode' | 'mission'>, sector: number, seed: number) => {
 *       const base = actual.resolvePlaylist(config, sector, seed);
 *       return injection.playlist?.(config, sector, base) ?? base;
 *     } };
 *   });
 */
export const injection: {
  playlist?: (config: Pick<RunConfig, 'mode' | 'mission'>, sector: number, base: readonly EncounterCue[]) => readonly EncounterCue[] | undefined;
} = {};

/** The side routes of a playlist: its strike-site cues (the deck's side slots). */
export const sideRoutes = (cues: readonly EncounterCue[]) => cues.filter(cue => cue.site);

/** A playlist whose side slots show `sites`: the i-th site cue becomes `sites[i % sites.length]`, at its time and on its side. */
export function withSites(cues: readonly EncounterCue[], sites: readonly SiteId[], planet: PlanetId): EncounterCue[] {
  const routes = sideRoutes(cues);
  return cues.map(cue => {
    const index = routes.indexOf(cue);
    if (index < 0 || !sites.length) return cue;
    const placed = siteCue(sites[index % sites.length], cue.site!.side, cue.at, planet);
    return cue.pickup ? { ...placed, pickup: cue.pickup } : placed;
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
