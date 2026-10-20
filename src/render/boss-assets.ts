/** Switch a filename here to roll a boss back; archived GLBs are kept alongside it.
 * v2 = last published models, v3-study = the following reference-sheet study.
 * v4-approved = reduced and articulated copies of the user's approved GLBs.
 * v5-remodel = clean Blender remodels traced over those GLBs (tools/blender/boss_remodel.py).
 */
export const BOSS_ASSETS = {
  veil: 'nacre/the-veil-v5-remodel.glb',
  bastion: 'khepri/bastion-9-v5-remodel.glb',
  ark: 'vesper/helion-ark-v5-remodel.glb',
  warden: 'luna/warden-v5-remodel.glb',
} as const;
