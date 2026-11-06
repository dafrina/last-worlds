import { ECLIPSE } from './eclipse';

/**
 * THE HELIOPHAGE, Corona's boss (docs/37): the user's Tripo GLB, adapted (public/assets/corona/the-heliophage-v1-approved.glb,
 * tools/blender/approved_heliophage.py), lying flat with its spires away from the player and its claws toward them, 16
 * units wide (user, 5 November: "Make it 16 units wide, the eclipse is the final boss"), its depth squashed so it hovers
 * between the plateau and the flight plane. Its fight is THE ECLIPSE's (user: "same gameplay"); only where its targets
 * stand comes from its own model: the two armoured blocks' vent grilles (the first pair), the central tower's glowing
 * column (the third first-phase target, as THE ECLIPSE's prow vent) and the caged molten core.
 * Positions are the targets' visible centres relative to the core (approved_heliophage.py report, rounded), on a target
 * plane at the targets' height.
 */
export const HELIOPHAGE = {
  ...ECLIPSE,
  /**
   * It flies in from beyond the top of the screen to its row, as THE VEIL glides in (user, 6 November: it "should not
   * rise from the depths ... it should come in from top of the screen"); THE ECLIPSE rises in place.
   */
  entryS: 30,
  /** The targets' visible faces stand 1.64-1.87 over the model's origin (its mid-plane). */
  targetHeight: 1.7,
  ventOffset: 5.0,
  ventS: 0.65,
  ventRadius: 0.95,
  reactorS: -0.8,
  reactorRadius: 1.25,
  /** The central tower's glowing column, behind the core (away from the player). */
  prowS: 4.7,
  prowRadius: 0.8,
  /** Its drone bays: the claws' tips, toward the player. */
  bays: [{ x: -3.6, s: -2.6 }, { x: 3.6, s: -2.6 }],
};
