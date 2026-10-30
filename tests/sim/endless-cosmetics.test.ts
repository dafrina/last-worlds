import { describe, expect, it } from 'vitest';
import { createCampaignProfile, endlessConfig, freshProfile } from '../../src/campaign/profile';
import { SHIP_IDS, STARTER } from '../../src/content/equipment';
import { DEFAULT_LOOK, shownHero } from '../../src/content/hero-parts';
import { EMPTY_INPUT, VIEW, type HeroLook, type RunConfig, type RunState } from '../../src/shared/contracts';
import { playerKinematics } from '../../src/sim/fairness';
import { createRun, stepRun } from '../../src/sim/game';
import { perfectPilot } from './pilots';

const look: HeroLook = { parts: { hull: 'e', wings: 'c', engines: 'b', cockpit: 'd' }, paint: { primary: 0x224466, glow: 0xff2200 } };

/** An endless flight that kills, collects and fires its special, so every chassis perk would have a chance to act. */
function flight(config: RunConfig, seconds = 75): RunState {
  const state = createRun(config), pilot = perfectPilot();
  while (state.phase === 'playing' && state.time < seconds) {
    const input = pilot(state);
    stepRun(state, { ...input, specialPressed: state.player.specialCharge >= 1 });
  }
  return state;
}
const withoutConfig = ({ config: _config, ...rest }: RunState) => rest;

describe('endless flies the campaign ship as cosmetic parts and global chassis perks', () => {
  it('keeps the chassis perk and look while resetting campaign equipment', () => {
    const state = createRun({ mode: 'endless', seed: 1, heroShip: 'spectre', hero: look, ship: 'ironclad', weapon: 'rail', special: 'gravity-well', shield: 'aegis', rank: 2 });
    expect(state.config).toMatchObject({ ...STARTER, ship: 'spectre', rank: 0, heroShip: 'spectre', hero: look });
    expect(state.player).toMatchObject({ lives: 3, shields: 3, weapon: 'pulse', power: 0 });
    // A look that does not fit the chassis, or an unknown chassis, is dropped: the default Scrapper shows.
    expect(createRun({ mode: 'endless', seed: 1, heroShip: 'bogus' as never, hero: look }).config).not.toHaveProperty('heroShip');
    expect(createRun({ mode: 'endless', seed: 1, heroShip: 'ironclad', hero: { parts: { hull: 'z' } } as never }).config.hero).toBeUndefined();
  });

  it('keeps starter weapons, shields, handling and hit region for all chassis; parts stay cosmetic', () => {
    for (const ship of SHIP_IDS) {
      const base = flight({ mode: 'endless', seed: 23, heroShip: ship }, 10);
      const painted = flight({ mode: 'endless', seed: 23, heroShip: ship, hero: look, weapon: 'seeker', rank: 2 }, 10);
      expect(withoutConfig(painted)).toEqual(withoutConfig(base));
      expect(playerKinematics(painted)).toEqual(playerKinematics(base));
      expect(painted.config).toMatchObject({ ...STARTER, ship, rank: 0 });
    }
    expect(VIEW.playerRadius).toBe(0.42);
  });

  it('shows the ship the profile has equipped, with its look; the campaign shows its own chassis', () => {
    const profile = freshProfile();
    profile.owned.ship = ['scrapper', 'interceptor']; profile.loadout.ship = 'interceptor';
    profile.looks = { interceptor: look };
    profile.designs = ['interceptor:hull:e', 'interceptor:wings:c', 'interceptor:engines:b', 'interceptor:cockpit:d'];
    const store = createCampaignProfile({ getItem: () => JSON.stringify(profile), setItem() {} });
    const config = endlessConfig(store.read(), 9);
    expect(config).toEqual({ mode: 'endless', seed: 9, heroShip: 'interceptor', hero: look });
    expect(shownHero(createRun(config).config)).toEqual(['interceptor', look]);
    expect(shownHero(createRun({ mode: 'endless', seed: 9 }).config)).toEqual(['scrapper', DEFAULT_LOOK]);
    expect(shownHero(createRun({ mode: 'campaign', seed: 9, ship: 'ironclad', hero: look }).config)).toEqual(['ironclad', look]);
    // Endless keeps starter equipment while selecting the equipped chassis perk.
    expect(createRun(config).config).toMatchObject({ ...STARTER, ship: 'interceptor' });
    expect(stepRun(createRun(config), EMPTY_INPUT)).toBeUndefined();
  });
});
