import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Cell } from '../sim/grid';

export const GRID_W = 22;
export const GRID_H = 15;
/** Height of the paving surface the robot drives on. */
export const TILE_TOP = 0.1;
/** Height of raised pavement blocks (curbs, house lots, city blocks). */
export const PLAZA_TOP = 0.2;

export function cellToWorld(cell: Cell, out = new THREE.Vector3(), y = TILE_TOP): THREE.Vector3 {
  return out.set(cell[1] - (GRID_W - 1) / 2, y, cell[0] - (GRID_H - 1) / 2);
}

export function worldToCell(x: number, z: number): Cell {
  return [Math.round(z + (GRID_H - 1) / 2), Math.round(x + (GRID_W - 1) / 2)];
}

/** Deterministic 0..1 hash so the town looks the same on every load. */
export function hash(a: number, b = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Bake a flat vertex colour into a geometry (for merging many parts into one draw call). */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Position/rotate a geometry in place and give it a colour. */
export function part(
  g: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(1, 1, 1),
  );
  g.applyMatrix4(m);
  return paint(g, color);
}

/** Merge painted parts; normalises indexed/non-indexed and drops UVs so anything merges. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'color', 'aSway'].includes(name)) g.deleteAttribute(name);
    }
    return g;
  });
  const out = mergeGeometries(clean, false)!;
  out.computeBoundingSphere();
  return out;
}

export const vertexColorMat = (opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, ...opts });

export function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeOutBounce = (t: number) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

export const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}
