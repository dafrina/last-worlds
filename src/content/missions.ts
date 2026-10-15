import type { MissionId, PlanetId, RunConfig } from '../shared/contracts';

/**
 * Which planet each campaign mission flies over (docs/17 §2). Endless always stays on Khepri. The combat agent
 * fills Cold Vector's encounters; this table only selects the world.
 */
export const MISSION_PLANET: Readonly<Record<MissionId, PlanetId>> = {
  training: 'khepri',
  bastion: 'khepri',
  'cold-vector': 'vesper',
};

/** The planet a run flies over: its mission's planet in the campaign, Khepri in endless. */
export function runPlanet(config: Pick<RunConfig, 'mode' | 'mission'>): PlanetId {
  return config.mode === 'campaign' && config.mission ? MISSION_PLANET[config.mission] : 'khepri';
}
