import { STRONGHOLD_MODEL, type StrongholdModel } from '../world/stronghold-seat';

/**
 * HELION STRONGHOLD's two models (user, 19 November 2026: "rebuild the boss model ... use it as a stencil for your own
 * optimized model ... Keep the current version so we can easily switch back"): the clean remodel built over the adapted
 * fortress (boss_stronghold_remodel.py), and the user's fortress GLB adapted (boss_stronghold.py). Both carry the same rig,
 * and targets; STRONGHOLD_MODEL (src/world/stronghold-seat.ts, beside each one's seat) picks the one that ships, and `?stronghold=adapted|remodel` overrides it for a
 * comparison.
 */
export const STRONGHOLD_MODELS: Readonly<Record<StrongholdModel, string>> = { remodel: 'vesper/helion-stronghold-remodel.glb', adapted: 'vesper/helion-stronghold.glb' };
/**
 * Each boss's model under public/assets and its Blender builder (tools/blender). Earlier versions are in git history
 * (user, 17 November 2026: "we still have it in git history"); a rollback restores the file from there.
 */
export const BOSS_ASSETS = {
  /** The old CRADLE (the user's Tripo hive GLB) adapted and repainted as an ancient relic (boss_veil.py, 17 November 2026;
   * the traced spacecraft before it is in git history). */
  veil: 'nacre/the-veil.glb',
  /** A clean remodel traced over the user's tank GLB, its rear deck with turrets and greebles, instanced tread links
   * (boss_bastion.py, 24 October 2026). */
  bastion: 'khepri/bastion-9.glb',
  /** HELION STRONGHOLD (the boss id stays `ark`): STRONGHOLD_MODELS (the flying HELION ARK before 17 November 2026). */
  ark: STRONGHOLD_MODELS[STRONGHOLD_MODEL],
  /** A bulky remodel after the user's design sheet (boss_warden.py, 20 October 2026). */
  warden: 'luna/warden.glb',
  /** The user's spider GLB adapted into a walking brood hive, its legs cut at their joints (boss_cradle.py, 17 November
   * 2026; the flying hive before it is THE VEIL's model now). */
  cradle: 'amnion/the-cradle.glb',
  /** The user's Tripo GLB, adapted with its broken wing tip mended, plus the prow vent, its third first-phase target
   * (boss_eclipse.py, 24 and 31 October 2026). */
  eclipse: 'umbra/the-eclipse.glb',
  /** The user's Tripo GLB, adapted in Blender, laid flat and squashed, 16 wide (boss_heliophage.py, 5 November 2026). */
  heliophage: 'corona/the-heliophage.glb',
  /** The temple rebuilt of Nahara's ruin kit, the user's Tripo model its shape guide (boss_citadel.py, 13 November 2026;
   * the Tripo mesh adapted was rejected: "its color is off"). */
  citadel: 'nahara/the-citadel.glb',
} as const;
