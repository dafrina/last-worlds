import type { MissionId } from '../shared/contracts';

/** Player-facing mission names and lines (docs/15, docs/17). One table for menu, pause, results and the log. */
export const MISSION_TEXT: Readonly<Record<MissionId, { name: string; world: string; threat: number; brief: string; boss?: string; complete: string }>> = {
  bastion: { name: 'Rolling Thunder', world: 'KHEPRI · RUST BADLANDS', threat: 2, brief: 'Bring down the Bastion-9 fortress.', boss: 'Bastion-9', complete: 'Bastion-9 is down. Extraction complete.' },
  'cold-vector': { name: 'Cold Vector', world: 'VESPER · GLASS FRONTIER', threat: 3, brief: 'Break the Helion Ark on open water.', boss: 'The Helion Ark', complete: 'The Helion Ark is sinking. Extraction complete.' },
  training: { name: 'Training', world: 'LUNA · PROVING GROUND', threat: 1, brief: 'Learn to steer, line up your shots and read enemy warnings.', complete: 'Training complete. You are cleared to fly.' },
};
export const missionText = (mission: MissionId | undefined) => MISSION_TEXT[mission ?? 'training'];
