import * as THREE from 'three';
import type { Cell } from '../sim/grid';
import { TILE_TOP, cellToWorld } from './common';

const WIDTH = 0.15;
const CORNER = 0.32;
const Y = TILE_TOP + 0.02;

/**
 * Flowing-dash ribbon along the remaining plan. Blue = delivery leg, red = return leg.
 * Rebuilt once per sim tick; `progress` clips the part the robot has already covered.
 */
export class PathLine {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private firstSegLen = 1;

  constructor() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 },
        clip: { value: 0 },
        deliver: { value: new THREE.Color('#2f9bff') },
        ret: { value: new THREE.Color('#ff4d4d') },
        glow: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aDist; attribute float aLeg; attribute float aSide;
        varying float vDist; varying float vLeg; varying float vSide;
        void main() {
          vDist = aDist; vLeg = aLeg; vSide = aSide;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float time, clip, glow; uniform vec3 deliver, ret;
        varying float vDist; varying float vLeg; varying float vSide;
        void main() {
          if (vDist < clip) discard;
          float edge = smoothstep(1.0, 0.55, abs(vSide));
          float dash = smoothstep(0.42, 0.5, fract(vDist * 2.2 - time * 0.8));
          float fadeIn = smoothstep(clip, clip + 0.35, vDist);
          vec3 c = mix(deliver, ret, step(0.5, vLeg));
          float a = edge * mix(0.55, 1.0, dash) * fadeIn;
          gl_FragColor = vec4(c * mix(0.9, 1.25, dash) * glow, a * 0.85);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  /**
   * @param cells remaining path starting at the cell the robot is leaving
   * @param returnFrom index in `cells` from which the leg is the return trip
   */
  set(cells: Cell[], returnFrom: number): void {
    const old = this.mesh.geometry;
    this.mesh.geometry = cells.length < 2 ? new THREE.BufferGeometry() : this.build(cells, returnFrom);
    old.dispose();
  }

  /** @param alpha fraction of the current step the robot has completed */
  update(t: number, alpha: number, night: number): void {
    const u = this.mesh.material.uniforms;
    u.time.value = t;
    u.clip.value = alpha * this.firstSegLen;
    u.glow.value = 1 + night * 0.6;
  }

  private build(cells: Cell[], returnFrom: number): THREE.BufferGeometry {
    // 1. Centre-line with rounded corners
    const pts: THREE.Vector3[] = [];
    const legs: number[] = [];
    const centers = cells.map((c) => cellToWorld(c, new THREE.Vector3(), Y));
    const tmp = new THREE.Vector3();
    this.firstSegLen = 1;
    for (let i = 0; i < centers.length; i++) {
      const p = centers[i];
      const leg = i >= returnFrom && returnFrom >= 0 ? 1 : 0;
      if (i === 0 || i === centers.length - 1) {
        pts.push(p.clone());
        legs.push(leg);
        continue;
      }
      const din = tmp.subVectors(p, centers[i - 1]).normalize().clone();
      const dout = new THREE.Vector3().subVectors(centers[i + 1], p).normalize();
      if (din.dot(dout) > 0.99 || din.lengthSq() === 0 || dout.lengthSq() === 0) {
        pts.push(p.clone());
        legs.push(leg);
        continue;
      }
      const a = p.clone().addScaledVector(din, -CORNER);
      const b = p.clone().addScaledVector(dout, CORNER);
      for (let s = 0; s <= 6; s++) {
        const u = s / 6;
        // quadratic bezier a → p → b
        pts.push(new THREE.Vector3().copy(a).multiplyScalar((1 - u) * (1 - u)).addScaledVector(p, 2 * u * (1 - u)).addScaledVector(b, u * u));
        legs.push(leg);
      }
      if (i === 1) this.firstSegLen = 1 - CORNER + 0.5 * CORNER * 1.1;
    }

    // 2. Extrude to a flat ribbon with cumulative distance for dashes
    const n = pts.length;
    const pos = new Float32Array(n * 2 * 3);
    const dist = new Float32Array(n * 2);
    const leg = new Float32Array(n * 2);
    const side = new Float32Array(n * 2);
    const idx: number[] = [];
    let d = 0;
    const dir = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      if (i > 0) d += pts[i].distanceTo(pts[i - 1]);
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
      dir.subVectors(p1, p0).normalize();
      nrm.set(-dir.z, 0, dir.x).multiplyScalar(WIDTH / 2);
      pos.set([pts[i].x + nrm.x, Y, pts[i].z + nrm.z, pts[i].x - nrm.x, Y, pts[i].z - nrm.z], i * 6);
      dist[i * 2] = dist[i * 2 + 1] = d;
      leg[i * 2] = leg[i * 2 + 1] = legs[i];
      side[i * 2] = 1;
      side[i * 2 + 1] = -1;
      if (i < n - 1) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
    g.setAttribute('aLeg', new THREE.BufferAttribute(leg, 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setIndex(idx);
    return g;
  }
}
