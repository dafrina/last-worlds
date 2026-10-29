import { describe, expect, it, vi } from 'vitest';
import type { MissionId, SiteId } from '../../src/shared/contracts';
import { MISSION_PLANET } from '../../src/content/missions';
import { sitePool } from '../../src/content/sites';
import { CAMPAIGN_ORDER } from '../../src/content/equipment';
import { createRun } from '../../src/sim/game';
import { campaignPlaylist } from '../../src/content/encounters';
import { fly, perfectPilot } from './pilots';
import { injection, sideRoutes, siteParts, siteSeeker, withSites } from './site-harness';

/** The sweep's report file (no Node types in this project: read through globalThis). */
const REPORT = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.SITE_ECONOMY;

vi.mock('../../src/content/encounters', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/content/encounters')>();
  const { injection } = await import('./site-harness');
  return {
    ...actual,
    campaignPlaylist: (mission: MissionId) => injection.campaign?.(mission, actual.campaignPlaylist(mission)) ?? actual.campaignPlaylist(mission),
    endlessPlaylist: (sector: number) => injection.endless?.(sector, actual.endlessPlaylist(sector)) ?? actual.endlessPlaylist(sector),
  };
});

/** One campaign mission (Standard) with its side routes replaced by `sites`, flown by the site-hunting perfect pilot. */
function flyMission(mission: MissionId, sites: readonly SiteId[], seed = 5, rank = 0) {
  injection.campaign = (m, base) => m === mission ? withSites(base, sites, MISSION_PLANET[mission]) : undefined;
  try {
    const state = createRun({ mode: 'campaign', mission, difficulty: 'standard', seed, rank });
    const log = fly(state, perfectPilot(siteSeeker), 420);
    return { state, log, parts: state.parts ?? 0, destroyed: state.sites?.destroyed ?? 0 };
  } finally { injection.campaign = undefined; }
}

describe('strike-site economy (docs/33 § 3, measured with the test pilot)', () => {
  it('a perfect pilot clears Training with two parts sites in its side slots, without losing a life', () => {
    expect(sideRoutes(campaignPlaylist('training'))).toHaveLength(2); // Training's two side routes (the mock is off here)
    const { state, log, parts, destroyed } = flyMission('training', ['crash-site', 'airfield'], 5, 2);
    expect(state.phase).toBe('complete');
    expect(log.livesLost).toBe(0);
    expect(destroyed).toBeGreaterThanOrEqual(1);
    expect(parts).toBe(destroyed);
  });

  /*
   * The economy sweep (several minutes; SITE_ECONOMY=<report file> npx vitest run tests/sim/site-economy.test.ts): every
   * mission with each of its world's parts sites in all of its side slots, flown by the site-hunting perfect pilot at
   * tier 1 and tier 3 of the Twin Pulse over three seeds. It reports the parts banked per site encounter and the expected
   * parts per mission when the side slots draw from the world's pool by weight.
   */
  it.runIf(REPORT)('reports parts per site and per typical mission on every world', async () => {
    const rows: string[] = ['Parts per mission (Standard, perfect site-hunting pilot, seeds 5/6/7)'];
    for (const rank of [0, 2]) for (const mission of CAMPAIGN_ORDER) {
      const planet = MISSION_PLANET[mission], pool = sitePool(planet), routes = sideRoutes(campaignPlaylist(mission)).length;
      const perSite: Record<string, number> = {};
      let lives = 0;
      for (const site of pool.filter(site => siteParts(site.id) > 0)) {
        let parts = 0, encounters = 0;
        for (const seed of [5, 6, 7]) {
          const run = flyMission(mission, [site.id], seed, rank);
          parts += run.parts; encounters += routes; lives += run.log.livesLost;
        }
        perSite[site.id] = parts / encounters;
      }
      const weight = pool.reduce((sum, site) => sum + site.weight, 0);
      const perSlot = pool.reduce((sum, site) => sum + site.weight * (perSite[site.id] ?? 0), 0) / weight;
      const ceiling = pool.reduce((sum, site) => sum + site.weight * siteParts(site.id), 0) / weight;
      rows.push(`tier ${rank + 1} ${mission} (${planet}, ${routes} side slots): banked per encounter ${Object.entries(perSite).map(([id, n]) => `${id} ${n.toFixed(2)}`).join(', ')}; `
        + `expected ${(perSlot * routes).toFixed(2)} parts per mission (all collected: ${(ceiling * routes).toFixed(2)}); lives lost ${lives}`);
    }
    const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { appendFileSync(path: string, data: string): void };
    fs.appendFileSync(REPORT!, rows.join('\n') + '\n');
    expect(rows.length).toBe(13);
  });
});
