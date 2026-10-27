import * as THREE from 'three';

/**
 * The hero's pixels carry this stencil value (user, 27 October: the ship stays visible through the warp and flies over a
 * boss's death blasts). The hero writes it where it is drawn (src/render/scene.ts, `markHero`).
 */
export const HERO_STENCIL = 1;
/** Material parameters for an overlay that draws everywhere except over the hero (the jump veil, death-blast particles). */
export const AROUND_HERO = { stencilWrite: true, stencilWriteMask: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: HERO_STENCIL } as const;
