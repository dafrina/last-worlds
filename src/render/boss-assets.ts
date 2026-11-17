/**
 * Each boss's model under public/assets and its Blender builder (tools/blender). Earlier versions are in git history
 * (user, 17 November 2026: "we still have it in git history"); a rollback restores the file from there.
 */
export const BOSS_ASSETS = {
  /** A clean remodel traced over the user's spacecraft GLB, without the bow pods (boss_veil.py, 24 October 2026). */
  veil: 'nacre/the-veil.glb',
  /** A clean remodel traced over the user's tank GLB, its rear deck with turrets and greebles, instanced tread links
   * (boss_bastion.py, 24 October 2026). */
  bastion: 'khepri/bastion-9.glb',
  /** HELION STRONGHOLD (the boss id stays `ark`): the user's fortress GLB, adapted in Blender, its barrels turned toward the
   * player, a reactor chamber built behind its door (boss_stronghold.py, 17 November 2026; the flying HELION ARK before). */
  ark: 'vesper/helion-stronghold.glb',
  /** A bulky remodel after the user's design sheet (boss_warden.py, 20 October 2026). */
  warden: 'luna/warden.glb',
  /** The user's Tripo GLB itself, adapted in Blender (boss_cradle.py, 24 October 2026). */
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
