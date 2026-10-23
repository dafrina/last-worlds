import type { MissionId, PlanetId, RunConfig } from '../shared/contracts';

/**
 * Which world each campaign mission flies over (docs/17 §2). Training flies over Luna, Khepri's moon (docs/19).
 */
export const MISSION_PLANET: Readonly<Record<MissionId, PlanetId>> = {
  training: 'luna',
  bastion: 'khepri',
  'deep-bloom': 'nacre',
  'cold-vector': 'vesper',
  'brood-strike': 'amnion',
};

/** The planet a run starts over: its mission's planet in the campaign; endless opens on Luna (docs/19). */
export function runPlanet(config: Pick<RunConfig, 'mode' | 'mission'>): PlanetId {
  return config.mode === 'campaign' && config.mission ? MISSION_PLANET[config.mission] : 'luna';
}
