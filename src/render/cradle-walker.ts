import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CRADLE_GROUND } from '../world/terrain-amnion';
import { type LegRest, type Pose } from './cradle-gait';

/**
 * THE CRADLE's walking rig (docs/27 §5, docs/43 §4-7): the model's parts (public/assets/amnion/the-cradle.glb, built by
 * tools/blender/boss_cradle.py) put together for the carrier view. Render-only.
 *
 * - The body's static pieces (cradle_body, _carapace, _underside, _vents, _heart_cavity) merge into one draw under `body`,
 *   the group the gait moves and tilts; the view hangs the weak points (brood chambers, heart, crest shutters) there too.
 * - The 32 leg segments (cradle_leg_<k>_<segment>) merge into one skinned mesh, each segment rigidly bound to its own bone
 *   (one draw for all eight legs); the gait's joints become the bones' positions and turns.
 */
export const WALKER = {
  /**
   * The visual target plane over the floor (render-only, the projection's height: the brood chambers and the heart sit on
   * the camera rays through their unchanged combat targets at this height; boss_cradle.py TARGET_Z). The simulation's own
   * CRADLE.targetHeight is unchanged.
   */
  targetHeight: 4,
  /** It stands on its lowered terrace of Amnion's crust (src/world/terrain-amnion.ts CRADLE_GROUND): its seat's ground level. */
  floor: CRADLE_GROUND.floor,
  /** Body pieces merged into one mesh, and the leg segments in their order. */
  bodyParts: ['body', 'carapace', 'underside', 'vents', 'heart_cavity', 'body_core'],
  segments: ['coxa', 'femur', 'tibia', 'tarsus'] as const,
  legs: 8,
} as const;

export function isWalker(model: THREE.Object3D, prefix: string): boolean {
  return !!model.getObjectByName(`${prefix}leg_0_coxa`);
}

export interface WalkerRig {
  body: THREE.Group; legs: THREE.SkinnedMesh; rests: LegRest[];
  /** The body's pivot (rig frame): the height its tilt turns about. */
  pivot: THREE.Vector3;
  apply(pose: Pose): void;
  dispose(): void;
}

const scratch = { q: new THREE.Quaternion(), yaw: new THREE.Quaternion(), pitch: new THREE.Quaternion(), axis: new THREE.Vector3(), v: new THREE.Vector3(),
  r: new THREE.Vector3(), euler: new THREE.Euler(0, 0, 0, 'ZYX') };

/**
 * The turn taking a segment from its rest direction to a new one without roll: a turn about the vertical to the new
 * azimuth, then a tilt in the leg's vertical plane to the new elevation (legs never point straight up or down).
 */
export function segmentTurn(rest: THREE.Vector3, to: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const a0 = Math.atan2(rest.x, rest.z), a1 = Math.atan2(to.x, to.z);
  const e0 = Math.atan2(rest.y, Math.hypot(rest.x, rest.z)), e1 = Math.atan2(to.y, Math.hypot(to.x, to.z));
  scratch.yaw.setFromAxisAngle(scratch.axis.set(0, 1, 0), a1 - a0);
  // The horizontal axis of the new vertical plane: raising the direction toward +y.
  scratch.axis.set(Math.cos(a1), 0, -Math.sin(a1));
  scratch.pitch.setFromAxisAngle(scratch.axis, -(e1 - e0));
  return out.copy(scratch.pitch).multiply(scratch.yaw);
}

export function createWalkerRig(model: THREE.Group, prefix: string, material: THREE.Material, chassis: THREE.Group): WalkerRig {
  model.updateMatrixWorld(true);
  const node = (name: string) => model.getObjectByName(prefix + name);
  const body = new THREE.Group(); body.name = 'cradle walker body'; chassis.add(body);
  // One mesh for the body's static pieces (all the walker's material).
  const meshesOf = (object: THREE.Object3D | undefined) => { const out: THREE.Mesh[] = []; object?.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); }); return out; };
  const pieces = WALKER.bodyParts.flatMap(name => meshesOf(node(name))).map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  const merged = mergeGeometries(pieces); pieces.forEach(g => g.dispose());
  const hull = new THREE.Mesh(merged ?? new THREE.BufferGeometry(), material); hull.name = `${prefix}hull`; hull.castShadow = true; hull.receiveShadow = true;
  body.add(hull);
  // Legs: rest joints from the segments' origins and the foot markers.
  const rests: LegRest[] = [], segmentGeometries: THREE.BufferGeometry[] = [], bones: THREE.Bone[] = [];
  const position = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3());
  for (let k = 0; k < WALKER.legs; k++) {
    const joints = WALKER.segments.map(segment => position(node(`leg_${k}_${segment}`)!));
    joints.push(position(node(`leg_${k}_foot`)!));
    rests.push({ joints: joints.map(p => [p.x, p.y, p.z] as const) as unknown as LegRest['joints'] });
    WALKER.segments.forEach((segment, s) => {
      const index = k * WALKER.segments.length + s;
      for (const mesh of meshesOf(node(`leg_${k}_${segment}`))) {
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        const count = geometry.getAttribute('position').count;
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4).map((_, i) => i % 4 === 0 ? index : 0), 4));
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(count * 4).map((_, i) => i % 4 === 0 ? 1 : 0), 4));
        segmentGeometries.push(geometry);
      }
      const bone = new THREE.Bone(); bone.name = `${prefix}leg_${k}_${segment}_bone`; bone.position.copy(joints[s]); bones.push(bone);
    });
  }
  const legGeometry = mergeGeometries(segmentGeometries) ?? new THREE.BufferGeometry(); segmentGeometries.forEach(g => g.dispose());
  const legs = new THREE.SkinnedMesh(legGeometry, material); legs.name = `${prefix}legs`;
  legs.castShadow = true; legs.receiveShadow = true; legs.frustumCulled = false;
  bones.forEach(bone => legs.add(bone));
  chassis.add(legs); legs.updateMatrixWorld(true);
  legs.bind(new THREE.Skeleton(bones));
  const restDirections = rests.map(rest => WALKER.segments.map((_, s) => new THREE.Vector3(...rest.joints[s + 1]).sub(new THREE.Vector3(...rest.joints[s]))));
  const pivot = new THREE.Vector3(0, rests[0].joints[0][1], 0);
  return {
    body, legs, rests, pivot,
    apply(pose: Pose) {
      // The body: its offset, then pitch and roll about the pivot.
      scratch.euler.set(pose.pitch, 0, pose.roll); body.quaternion.setFromEuler(scratch.euler);
      body.position.copy(pivot).sub(scratch.v.copy(pivot).applyQuaternion(body.quaternion)).add(scratch.r.set(...pose.body));
      pose.legs.forEach((joints, k) => {
        WALKER.segments.forEach((_, s) => {
          const bone = bones[k * WALKER.segments.length + s];
          bone.position.set(...joints[s]);
          segmentTurn(restDirections[k][s], scratch.v.set(joints[s + 1][0] - joints[s][0], joints[s + 1][1] - joints[s][1], joints[s + 1][2] - joints[s][2]), bone.quaternion);
        });
      });
    },
    dispose() { body.removeFromParent(); legs.removeFromParent(); hull.geometry.dispose(); legGeometry.dispose(); legs.skeleton.dispose(); },
  };
}
