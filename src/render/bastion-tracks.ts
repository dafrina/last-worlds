import * as THREE from 'three';

/** The v6 asset contains four original, textured links and their authored belt dimensions.
 * Four instanced draws circulate those links; the painted hull/atlas never scrolls. */
export function createBastionTracks(model: THREE.Group, chassis: THREE.Group) {
  const belts: { mesh: THREE.InstancedMesh; x: number; path: THREE.Vector2[]; lengths: number[]; length: number; offset: number }[] = [];
  const transform = new THREE.Object3D();
  for (const side of ['left', 'right']) for (const index of [0, 1]) {
    const node = model.getObjectByName(`bastion_track_link_${side}_${index}`);
    if (!node) continue; // Older selectable assets keep their legacy UV animation.
    const data = node.userData, path: THREE.Vector2[] = [];
    const radius = Number(data.track_radius), front = Number(data.track_front), rear = Number(data.track_rear);
    const segments = Number(data.track_segments), pitch = Number(data.track_pitch);
    if (![radius, front, rear, segments, pitch, data.track_x, data.track_offset].every(Number.isFinite)
      || radius <= 0 || pitch <= 0 || segments < 2 || segments > 64) continue;
    // Blender (forward, up) profile, exported to game (up, -forward). Same faceted
    // drum as the approved hull, so the links hug its surface around both sprockets.
    for (const [center, start] of [[rear, -Math.PI / 2], [front, Math.PI / 2]])
      for (let i = 0; i <= segments; i++) {
        const angle = start + Math.PI * i / segments;
        path.push(new THREE.Vector2(radius + radius * Math.sin(angle), -(center + radius * Math.cos(angle))));
      }
    const lengths = [0];
    for (let i = 0; i < path.length; i++) lengths.push(lengths[i] + path[i].distanceTo(path[(i + 1) % path.length]));
    const length = lengths.at(-1)!;
    node.updateWorldMatrix(true, true);
    const origin = node.getWorldPosition(new THREE.Vector3());
    node.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld).translate(-origin.x, -origin.y, -origin.z);
      const mesh = new THREE.InstancedMesh(geometry, object.material, Math.round(length / pitch));
      mesh.name = `${node.name}_moving`; mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      chassis.add(mesh);
      belts.push({ mesh, x: data.track_x, path, lengths, length, offset: data.track_offset });
    });
    node.removeFromParent();
  }
  let travel = 0;
  function place() {
    for (const { mesh, x, path, lengths, length, offset } of belts) {
      for (let i = 0; i < mesh.count; i++) {
        const distance = ((i + .5) * length / mesh.count + travel % length + length) % length;
        let segment = 0;
        while (segment < path.length - 1 && lengths[segment + 1] <= distance) segment++;
        const a = path[segment], b = path[(segment + 1) % path.length], span = lengths[segment + 1] - lengths[segment];
        const ty = (b.x - a.x) / span, tz = (b.y - a.y) / span, t = (distance - lengths[segment]) / span;
        // Outward normal is (tz,-ty); at the top, links advance toward the nose (+z).
        transform.position.set(x, a.x + (b.x - a.x) * t + tz * offset, a.y + (b.y - a.y) * t - ty * offset);
        transform.rotation.set(Math.atan2(-ty, tz), 0, 0); transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  place();
  return {
    get count() { return belts.reduce((sum, belt) => sum + belt.mesh.count, 0); },
    get travel() { return travel; },
    advance(forward: number, dt: number) { if (forward && dt > 0) { travel += forward * dt; place(); } },
    dispose() { for (const { mesh } of belts) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); } },
  };
}
