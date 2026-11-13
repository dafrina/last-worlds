import type { MissionId } from '../shared/contracts';

/** Player-facing mission names and lines (docs/15, docs/17). One table for menu, pause, results and the log. */
export const MISSION_TEXT: Readonly<Record<MissionId, { name: string; world: string; threat: number; brief: string; boss?: string; complete: string }>> = {
  bastion: { name: 'Rolling Thunder', world: 'KHEPRI', threat: 2, brief: 'Bring down the BASTION-9 fortress.', boss: 'BASTION-9', complete: 'BASTION-9 is down.' },
  'deep-bloom': { name: 'Deep Bloom', world: 'NACRE', threat: 4, brief: 'Cross the glowing mire and bring down VEIL.', boss: 'VEIL', complete: 'VEIL has fallen into the mire.' },
  'cold-vector': { name: 'Cold Vector', world: 'VESPER', threat: 3, brief: 'Break HELION ARK on open water.', boss: 'HELION ARK', complete: 'HELION ARK is sinking.' },
  'brood-strike': { name: 'Brood Strike', world: 'AMNION', threat: 5, brief: 'Burn through the brood wastes and bring down CRADLE.', boss: 'CRADLE', complete: 'CRADLE is burning.' },
  'dying-star': { name: 'Dying Star', world: 'CORONA', threat: 5, brief: 'Fly the plasma seas of a world its star is tearing apart and bring down HELIOPHAGE.', boss: 'HELIOPHAGE', complete: 'HELIOPHAGE sinks into the star-fire.' },
  'silent-empire': { name: 'The Silent Empire', world: 'NAHARA', threat: 5, brief: 'Follow the canyons of a vanished civilisation, where its ancient defences are waking, and bring down CITADEL.', boss: 'CITADEL', complete: 'CITADEL is silent. The empire sleeps again.' },
  'final-horizon': { name: 'Final Horizon', world: 'UMBRA', threat: 5, brief: 'Cross the shattered obsidian of the final planet and bring down ECLIPSE.', boss: 'ECLIPSE', complete: 'ECLIPSE has fallen. The last world is free.' },
  training: { name: 'Training', world: 'LUNA', threat: 1, brief: 'Learn to steer and read warnings, then bring down WARDEN-1.', boss: 'WARDEN-1', complete: 'WARDEN-1 is down. Training complete.' },
};
export const missionText = (mission: MissionId | undefined) => MISSION_TEXT[mission ?? 'training'];
