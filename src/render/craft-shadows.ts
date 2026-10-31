import * as THREE from 'three';

/**
 * Low-tier craft shadows (polish pass, 31 October; user: "I want similar shadows for enemies like for my hero"). Low has no
 * shadow map, so each craft's own model is drawn again flattened along the planet's sun onto the ground under it: the same
 * silhouette, offset and direction as the High shadow map gives, in one extra draw per craft batch. The flattened copy
 * darkens what is below it by multiplying (never stacking: a stencil bit lets each pixel darken once), by about as much as
 * the High shadow takes away there. Presentation only.
 */
export const SILHOUETTE_STENCIL = 2;

/** Projection along the sun onto the horizontal plane at `height` (a point p goes to p − sun·(p.y − height)/sun.y). */
export function planarShadow(sun: THREE.Vector3, height: number, target = new THREE.Matrix4()): THREE.Matrix4 {
  const y = Math.max(.05, sun.y), kx = sun.x / y, kz = sun.z / y;
  return target.set(
    1, -kx, 0, kx * height,
    0, 0, 0, height,
    0, -kz, 1, kz * height,
    0, 0, 0, 1);
}

/** The light a planet's ground keeps in shadow, per channel (linear): hemisphere and bounce stay, the sun loses `intensity`. */
export interface ShadowLight { sun: [number, number]; sunElevation: number; hemisphere: [number, number, number]; bounce: [number, number]; shadowIntensity: number }
export function silhouetteShade(look: ShadowLight, target = new THREE.Color()): THREE.Color {
  const sky = new THREE.Color(look.hemisphere[0]).multiplyScalar(look.hemisphere[2]);
  const bounce = new THREE.Color(look.bounce[0]).multiplyScalar(look.bounce[1] * .3);
  const sun = new THREE.Color(look.sun[0]).multiplyScalar(look.sun[1] * Math.sin(THREE.MathUtils.degToRad(look.sunElevation)));
  const ratio = (a: number, s: number) => (a + s * (1 - look.shadowIntensity)) / Math.max(1e-4, a + s);
  return target.setRGB(ratio(sky.r + bounce.r, sun.r), ratio(sky.g + bounce.g, sun.g), ratio(sky.b + bounce.b, sun.b));
}

export function createSilhouetteMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x808080, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false,
    // Multiply: result = destination × colour.
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    stencilWrite: true, stencilRef: SILHOUETTE_STENCIL, stencilFuncMask: SILHOUETTE_STENCIL, stencilWriteMask: SILHOUETTE_STENCIL,
    stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  });
}
