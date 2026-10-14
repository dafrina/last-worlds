import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASTION } from '../content/bastion';
import { VIEW, type BossPart, type RunState } from '../shared/contracts';

/** Self-contained functional fortress art. Terrain and ordinary craft remain owned by their renderers. */
export function createBastionView(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'Bastion-9'; root.visible = false; scene.add(root);
  const armor = new THREE.MeshStandardMaterial({ color: 0x827864, roughness: .64, metalness: .5 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x333a38, roughness: .7, metalness: .4 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x684736, roughness: .85, metalness: .2 });
  const hullParts: THREE.Mesh[] = [];
  function box(group: THREE.Group, size: [number, number, number], position: [number, number, number], material: THREE.Material, batch = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); group.add(mesh);
    if (batch) hullParts.push(mesh);
    return mesh;
  }
  box(root, [5.4, .6, 4.8], [0, .65, -.4], edge, true);
  box(root, [4.6, .42, 4.3], [0, 1.08, -.5], armor, true);
  box(root, [2.1, .32, 1.5], [0, 1.4, 1.15], rust, true);
  for (const side of [-1, 1]) {
    box(root, [1.05, .72, 5.7], [side * 2.85, .4, -.4], edge, true);
    box(root, [.9, .14, 5.3], [side * 2.85, .86, -.4], armor, true);
    for (let i = 0; i < 9; i++) box(root, [1.08, .12, .16], [side * 2.85, .06, -2.8 + i * .6], rust, true);
    for (let i = 0; i < 5; i++) box(root, [.4, .05, .12], [side * .76, 1.62, .7 + i * .18], edge, true);
    box(root, [.12, .12, 3.8], [side * 1.45, 1.37, -.6], edge, true);
    box(root, [.4, .24, .35], [side * 2.8, 1.04, 2.1], rust, true);
  }
  root.updateMatrixWorld(true);
  for (const material of [armor, edge, rust]) {
    const meshes = hullParts.filter(mesh => mesh.material === material);
    const geometries = meshes.map(mesh => { const geometry = mesh.geometry.clone(); geometry.applyMatrix4(mesh.matrixWorld); return geometry; });
    const merged = mergeGeometries(geometries);
    if (merged) root.add(new THREE.Mesh(merged, material));
    geometries.forEach(geometry => geometry.dispose());
    meshes.forEach(mesh => { root.remove(mesh); mesh.geometry.dispose(); });
  }
  const modules = new Map<BossPart, { group: THREE.Group; glow: THREE.Mesh; material: THREE.MeshBasicMaterial; shutter: THREE.Mesh; gun?: THREE.Mesh }>();
  for (const part of ['left', 'right', 'core'] as const) {
    const core = part === 'core', group = new THREE.Group(); root.add(group);
    group.position.set(core ? 0 : part === 'left' ? -BASTION.batteryOffset : BASTION.batteryOffset, 0, core ? -BASTION.coreRowOffset : 0);
    box(group, core ? [3.1, .2, 2.9] : [1.25, .36, 1.5], [0, 1.24, 0], edge);
    const shutter = box(group, core ? [2.9, .15, 2.7] : [1.05, .18, 1.25], [0, BASTION.targetHeight + .09, 0], armor);
    const material = new THREE.MeshBasicMaterial({ color: 0xffb77c, depthTest: false, depthWrite: false });
    const ring = new THREE.RingGeometry(core ? 1 : .23, core ? 1.25 : .4, core ? 24 : 12);
    ring.rotateX(-Math.PI / 2);
    const glow = new THREE.Mesh(ring, material);
    glow.name = `bastion-target-${part}`;
    glow.position.y = BASTION.targetHeight; glow.renderOrder = 4; group.add(glow);
    if (core) {
      const chamber = new THREE.Mesh(new THREE.CylinderGeometry(.97, 1.02, .12, 24), edge);
      chamber.position.y = BASTION.targetHeight - .09; group.add(chamber);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.38, .46, .2, 8), armor);
      hub.position.y = BASTION.targetHeight; group.add(hub);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const brace = box(group, [.13, .07, .6], [Math.sin(angle) * .66, BASTION.targetHeight, Math.cos(angle) * .66], rust);
        brace.rotation.y = angle;
      }
    }
    let gun: THREE.Mesh | undefined;
    if (!core) gun = box(group, [.22, .18, 1.3], [0, 1.45, .9], edge);
    modules.set(part, { group, glow, material, shutter, gun });
  }
  // A faint silhouette preserves recognition when a deep canyon lip occludes the actual chassis.
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(6.7, .1, 5.7), new THREE.MeshBasicMaterial({ color: 0xd5aa7c, transparent: true, opacity: .06, depthTest: false, depthWrite: false }));
  ghost.position.set(0, .95, -.4); ghost.renderOrder = 2; root.add(ghost);
  const vertices = new Float32Array(256 * 3);
  const colors = new Float32Array(256 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const markers = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
  markers.frustumCulled = false; markers.renderOrder = 9; scene.add(markers);
  const tint = new THREE.Color();
  return {
    update(state: RunState, placement: { baseHeight: number; s: number } | null) {
      const boss = state.boss;
      root.visible = !!boss; markers.visible = !!boss;
      if (!boss || !placement) return;
      root.position.set(boss.x, placement.baseHeight, -placement.s);
      root.rotation.set(0, 0, 0);
      const destroyed = boss.phase === 'destroyed';
      if (destroyed) { root.rotation.z = Math.min(.07, (state.time - boss.phaseStartedAt) * .03); }
      let cursor = 0;
      const line = (x: number, s: number, xx: number, ss: number, color: number) => {
        tint.setHex(color); vertices.set([x, VIEW.flightHeight + .03, -s, xx, VIEW.flightHeight + .03, -ss], cursor * 3);
        colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], cursor * 3); cursor += 2;
      };
      for (const enemy of state.enemies) {
        if (!enemy.bossPart) continue;
        const part = modules.get(enemy.bossPart)!;
        part.glow.visible = enemy.hp > 0 && enemy.damageable !== false;
        part.shutter.visible = enemy.hp > 0 && enemy.damageable === false;
        if (part.gun) { part.gun.visible = enemy.hp > 0; part.gun.rotation.y = enemy.warning > 0 ? Math.atan2(enemy.aimX - enemy.x, enemy.s) : 0; }
        part.group.rotation.z = enemy.hp > 0 ? 0 : (enemy.bossPart === 'left' ? -.14 : .14);
        part.material.color.setHex(enemy.warning > 0 ? 0xffecd0 : 0xffb77c).multiplyScalar(.45 + .55 * Math.max(0, enemy.hp / enemy.maxHp));
        if (enemy.hp <= 0 || enemy.damageable === false) continue;
        const r = enemy.radius + .15, color = enemy.warning > 0 ? 0xffd59a : 0xdbbe8b;
        for (const x of [-1, 1]) for (const s of [-1, 1]) {
          line(enemy.x + x * r, enemy.s + s * r, enemy.x + x * (r - .25), enemy.s + s * r, color);
          line(enemy.x + x * r, enemy.s + s * r, enemy.x + x * r, enemy.s + s * (r - .25), color);
        }
        if (enemy.warning > 0 && boss.attack === 'burst') {
          for (let i = 0; i < 6; i++) {
            const a = i / 6, b = (i + .45) / 6;
            line(THREE.MathUtils.lerp(enemy.x, enemy.aimX, a), enemy.s * (1 - a), THREE.MathUtils.lerp(enemy.x, enemy.aimX, b), enemy.s * (1 - b), 0xd1a275);
          }
        }
      }
      geometry.setDrawRange(0, cursor);
      geometry.getAttribute('position').needsUpdate = true; geometry.getAttribute('color').needsUpdate = true;
    },
  };
}
