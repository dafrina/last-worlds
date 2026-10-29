import type { Page } from '@playwright/test';
import { CAMPAIGN_KEY, freshProfile, type CampaignProfile } from '../../src/campaign/profile';

/**
 * Seeds this page's campaign save before the app loads (docs/21). `veteranPilot` has cleared every mission and owns
 * every item, with plenty of credits; pass overrides for anything else.
 */
export async function seedCampaign(page: Page, change: (profile: CampaignProfile) => void = veteranPilot) {
  const profile = freshProfile();
  change(profile);
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [CAMPAIGN_KEY, JSON.stringify(profile)] as const);
}
export function veteranPilot(profile: CampaignProfile) {
  profile.credits = 5000; profile.parts = 12;
  profile.owned = { weapon: ['pulse', 'fan', 'seeker'], special: ['shockwave', 'seeker-rack', 'siege-lance'], shield: ['standard', 'bulwark', 'aegis'], ship: ['scrapper', 'ironclad', 'interceptor', 'spectre'] };
  for (const mission of ['training', 'bastion', 'cold-vector', 'deep-bloom'] as const) {
    profile.missions[mission] = { clears: { relaxed: 0, standard: 1, veteran: 0 }, best: { standard: 200 }, firstClearPaid: true };
  }
}
