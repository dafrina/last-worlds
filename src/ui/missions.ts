import type { MissionId } from '../shared/contracts';

/** Player-facing mission names and lines (docs/15, docs/17). One table for menu, pause, results and the log. */
export const MISSION_TEXT: Readonly<Record<MissionId, { name: string; brief: string; boss?: string; complete: string }>> = {
  bastion: { name: 'Rolling Thunder', brief: 'Bring down the Bastion-9 fortress.', boss: 'Bastion-9', complete: 'Bastion-9 is down. Extraction complete.' },
  'cold-vector': { name: 'Cold Vector', brief: 'Vesper. Break the Helion Ark on open water.', boss: 'The Helion Ark', complete: 'The Helion Ark is sinking. Extraction complete.' },
  training: { name: 'Training', brief: 'Practice movement and weapons.', complete: 'You made it through the proving ground.' },
};
export const missionText = (mission: MissionId | undefined) => MISSION_TEXT[mission ?? 'training'];
