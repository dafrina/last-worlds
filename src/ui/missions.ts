import type { MissionId } from '../shared/contracts';

/** Player-facing mission names and lines (docs/15, docs/17). One table for menu, pause, results and the log. */
export const MISSION_TEXT: Readonly<Record<MissionId, { name: string; world: string; threat: number; brief: string; boss?: string; complete: string }>> = {
  bastion: { name: 'Rolling Thunder', world: 'KHEPRI · RUST BADLANDS', threat: 2, brief: 'Bring down the Bastion-9 fortress.', boss: 'Bastion-9', complete: 'Bastion-9 is down.' },
  'deep-bloom': { name: 'Deep Bloom', world: 'NACRE · LUMINOUS MIRE', threat: 4, brief: 'Cross the glowing mire and bring down THE VEIL.', boss: 'THE VEIL', complete: 'THE VEIL has fallen into the mire.' },
  'cold-vector': { name: 'Cold Vector', world: 'VESPER · GLASS FRONTIER', threat: 3, brief: 'Break the Helion Ark on open water.', boss: 'The Helion Ark', complete: 'The Helion Ark is sinking.' },
  'brood-strike': { name: 'Brood Strike', world: 'AMNION · BROOD WASTES', threat: 5, brief: 'Burn through the brood wastes and bring down THE CRADLE.', boss: 'THE CRADLE', complete: 'THE CRADLE is burning.' },
  training: { name: 'Training', world: 'LUNA · PROVING GROUND', threat: 1, brief: 'Learn to steer and read warnings, then bring down WARDEN-1.', boss: 'WARDEN-1', complete: 'WARDEN-1 is down. Training complete.' },
};
export const missionText = (mission: MissionId | undefined) => MISSION_TEXT[mission ?? 'training'];
