import * as THREE from 'three';

/**
 * Corona's colossal glowing arcs (docs/37; user, 5 November 2026: "colossal glowing arcs crossing between the islands"):
 * magnetic loops of plasma rising out of the sea and falling back into it, render-only.
 *
 * - Seeded by the run seed and fixed in the terrain frame: slot k covers distance [k·SLOT, (k+1)·SLOT); a slot holds at
 *   most one arc, both of whose feet stand in open plasma (the caller's ground test), so no arc grows out of rock.
 * - Never in the way: the apex stays at least APEX_CLEARANCE under the flight plane, the arcs draw under the ships and
 *   every shot (shots skip the depth test), and the colour is the plasma's gold, not a hostile hue.
 * - Phone-cheap: a handful of small tubes (two draws each: a white-hot core and a soft additive halo), built when a slot
 *   comes into view and released when it leaves. Uses no simulation state and no Math.random.
 */
const SLOT = 26, CHANCE = .75, CORE = .1, HALO = .38, APEX_CLEARANCE = 2.2, SEGMENTS = 48;

const VERTEX = /* glsl */`
varying float vAlong; varying vec3 vNormal; varying vec3 vView;
void main() {
  vAlong = uv.x;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vNormal = normalize( normalMatrix * normal ); vView = normalize( -mv.xyz );
  gl_Position = projectionMatrix * mv;
}`;
const FRAGMENT = /* glsl */`
uniform float arcTime; uniform vec3 arcColor; uniform float arcEnergy; uniform float arcHalo; uniform float arcPhase;
varying float vAlong; varying vec3 vNormal; varying vec3 vView;
void main() {
  // Pulses of plasma run up one leg and down the other; the feet burn brightest where the loop meets the sea.
  float pulse = 0.55 + 0.45 * sin( vAlong * 34.0 - arcTime * 3.2 + arcPhase );
  float feet = 1.0 + 0.8 * ( 1.0 - smoothstep( 0.0, 0.18, min( vAlong, 1.0 - vAlong ) ) );
  float rim = abs( dot( vNormal, vView ) );
  // Core: solid, hot. Halo: soft at its silhouette, so the tube reads as a glow, not a pipe.
  float shape = arcHalo > 0.5 ? pow( rim, 2.2 ) * 0.4 : 1.0;
  gl_FragColor = vec4( arcColor * arcEnergy * pulse * feet * shape, 1.0 );
}`;

interface Arc { core: THREE.Mesh; halo: THREE.Mesh }

export function createCoronaArcs(scene: THREE.Scene) {
  const group = new THREE.Group(); group.name = 'Corona arcs'; scene.add(group);
  const uniforms = (color: number, energy: number, halo: number, phase: number) => ({
    arcTime: shared.arcTime, arcColor: { value: new THREE.Color().setHex(color, THREE.SRGBColorSpace) }, arcEnergy: { value: energy },
    arcHalo: { value: halo }, arcPhase: { value: phase },
  });
  const shared = { arcTime: { value: 0 } };
  const material = (color: number, energy: number, halo: number, phase: number) => new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: uniforms(color, energy, halo, phase),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const arcs = new Map<number, Arc | null>();
  let key = '';

  const hash = (seed: number, k: number, salt: number) => {
    let h = Math.imul(seed ^ 0x636f726f, 0x9e3779b1) ^ Math.imul(k + 0x51ed, 0x85ebca6b) ^ Math.imul(salt + 7, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };

  /** One slot's arc, or null: feet in open plasma, apex under the flight plane. */
  function build(seed: number, k: number, ground: (x: number, s: number) => number, sea: number, flightHeight: number): Arc | null {
    if (hash(seed, k, 0) > CHANCE) return null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const cx = (hash(seed, k, 1 + attempt * 5) * 2 - 1) * 15, cs = (k + .15 + .7 * hash(seed, k, 2 + attempt * 5)) * SLOT;
      const half = 3.2 + 3.6 * hash(seed, k, 3 + attempt * 5), yaw = (hash(seed, k, 4 + attempt * 5) - .5) * Math.PI * .9;
      const dx = Math.cos(yaw) * half, ds = Math.sin(yaw) * half;
      const feet: [number, number][] = [[cx - dx, cs - ds], [cx + dx, cs + ds]];
      if (feet.some(([x, s]) => ground(x, s) >= sea - .01)) continue;
      const rise = Math.min(half * (1.1 + .5 * hash(seed, k, 5 + attempt * 5)), flightHeight - APEX_CLEARANCE - sea);
      // A loop in its own vertical plane: x along the chord, y up; local z = 0. Placed in terrain s (world z = −s).
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => {
        const t = i / 12, a = Math.PI * t;
        return new THREE.Vector3(-Math.cos(a) * half, sea - .3 + Math.sin(a) * (rise + .3), 0);
      }));
      const phase = hash(seed, k, 6) * 6.28;
      const core = new THREE.Mesh(new THREE.TubeGeometry(curve, SEGMENTS, CORE, 5, false), material(0xfff4dc, 4.2, 0, phase));
      const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, SEGMENTS, HALO, 7, false), material(0xffb040, 2.4, 1, phase));
      for (const mesh of [core, halo]) {
        mesh.position.set(cx, 0, -cs); mesh.rotation.y = yaw; mesh.renderOrder = 2; mesh.frustumCulled = true;
        mesh.userData.s = cs; group.add(mesh);
      }
      return { core, halo };
    }
    return null;
  }
  function release(arc: Arc | null) {
    if (!arc) return;
    for (const mesh of [arc.core, arc.halo]) { group.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  }
  function clear() { for (const arc of arcs.values()) release(arc); arcs.clear(); }

  return {
    /**
     * `active`: the world under the camera is Corona. `minS`/`maxS`: the view's ground footprint in run-relative s.
     * `ground(x, s)`: terrain height at absolute distance s.
     */
    update(time: number, seed: number, distance: number, minS: number, maxS: number, active: boolean, ground: (x: number, s: number) => number, sea: number, flightHeight: number) {
      group.visible = active;
      if (!active) { if (arcs.size) clear(); return; }
      if (`${seed}` !== key) { clear(); key = `${seed}`; }
      shared.arcTime.value = time;
      const from = Math.floor((distance + minS - 8) / SLOT), to = Math.floor((distance + maxS + 8) / SLOT);
      for (const [k, arc] of arcs) if (k < from || k > to) { release(arc); arcs.delete(k); }
      for (let k = from; k <= to; k++) if (!arcs.has(k)) arcs.set(k, build(seed, k, ground, sea, flightHeight));
      // The group rides the terrain frame: absolute s → world z = distance − s.
      group.position.z = distance;
    },
    clear,
    dispose() { clear(); scene.remove(group); },
  };
}
