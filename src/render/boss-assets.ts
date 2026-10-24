/** Switch a filename here to roll a boss back; archived GLBs are kept alongside it.
 * v2 = last published models, v3-study = the following reference-sheet study.
 * v4-approved = reduced and articulated copies of the user's approved GLBs.
 * v5-remodel = clean Blender remodels traced over those GLBs (tools/blender/boss_remodel.py).
 * v6-treads = the same Bastion v5 hull/atlas, with articulated, instanced track links.
 */
export const BOSS_ASSETS = {
  veil: 'nacre/the-veil-v6-remodel.glb',
  /** v7 = v6 with the rear deck's silver tubes replaced by turrets and greebles (tools/blender/bastion_v7.py, 24 October 2026). */
  bastion: 'khepri/bastion-9-v7.glb',
  /** v6 = the user's new Tripo GLB, adapted in Blender (tools/blender/approved_ark.py, 24 October 2026). */
  ark: 'vesper/helion-ark-v6-approved.glb',
  warden: 'luna/warden-v5-remodel.glb',
  /** v2 = the user's Tripo GLB itself, adapted in Blender (tools/blender/approved_cradle.py, 24 October 2026). */
  cradle: 'amnion/the-cradle-v2-approved.glb',
} as const;
