import * as THREE from 'three';
import { GRID_H, GRID_W, hash, merge, part, vertexColorMat } from './common';

const FIELDS = ['#9cbf63', '#b5c46a', '#88b05a', '#d6b85a', '#c79a4e', '#a9b860', '#7fa956', '#e0c77a'];
const AUTUMN = ['#e07a2f', '#c9482b', '#e9b23a', '#d0662a', '#b9a33f', '#7fa04a'];

/**
 * Countryside around the city: ground that runs to the horizon, patchwork fields, scattered
 * trees, roads heading out of town, and a ring of snow-capped mountains fading into the haze.
 */
export class Landscape {
  readonly group = new THREE.Group();

  constructor() {
    // Ground far bigger than the fog distance, so its edge is never visible
    const ground = new THREE.Mesh(new THREE.CircleGeometry(700, 64), new THREE.MeshStandardMaterial({ color: '#9bbd66', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.group.add(ground);

    const solid: THREE.BufferGeometry[] = [];
    this.fields(solid);
    this.roads(solid);
    this.trees(solid);
    this.group.add(new THREE.Mesh(merge(solid), vertexColorMat({ roughness: 1 })));
    this.group.add(this.mountains());
  }

  /** Is this point on the city plate or one of the outbound roads? Keep it clear. */
  private reserved(x: number, z: number): boolean {
    if (Math.abs(x) < GRID_W / 2 + 3 && Math.abs(z) < GRID_H / 2 + 3) return true;
    if (Math.abs(x - 4.5) < 2.2 && z < 0) return true; // road north
    if (Math.abs(z - 3) < 2.2 && x > 0) return true; // road east
    return false;
  }

  /** Patchwork of slightly raised field plots in rings around the town. */
  private fields(out: THREE.BufferGeometry[]): void {
    const S = 7;
    for (let gx = -14; gx <= 14; gx++) {
      for (let gz = -14; gz <= 14; gz++) {
        const x = gx * S + (hash(gx, gz) - 0.5) * 2, z = gz * S + (hash(gz, gx) - 0.5) * 2;
        if (Math.hypot(x, z) > 95 || this.reserved(x, z)) continue;
        const w = S * (0.7 + hash(gx, gz + 9) * 0.25), d = S * (0.7 + hash(gx + 9, gz) * 0.25);
        if (this.reserved(x - w / 2, z - d / 2) || this.reserved(x + w / 2, z + d / 2) || this.reserved(x - w / 2, z + d / 2) || this.reserved(x + w / 2, z - d / 2)) continue;
        out.push(part(new THREE.BoxGeometry(w, 0.04, d), FIELDS[Math.floor(hash(gx * 3, gz * 7) * FIELDS.length)], [x, 0, z], [0, (hash(gx, gz + 4) - 0.5) * 0.3, 0]));
      }
    }
  }

  /** Two roads leaving town and running off to the horizon. */
  private roads(out: THREE.BufferGeometry[]): void {
    const L = 300;
    out.push(part(new THREE.BoxGeometry(2.2, 0.06, L), '#80848b', [4.5, 0.02, -GRID_H / 2 - L / 2]));
    out.push(part(new THREE.BoxGeometry(L, 0.06, 2.2), '#80848b', [GRID_W / 2 + L / 2, 0.02, 3]));
    for (let t = 3; t < L; t += 3) {
      out.push(part(new THREE.BoxGeometry(0.12, 0.065, 1.2), '#e4e1d6', [4.5, 0.025, -GRID_H / 2 - t]));
      out.push(part(new THREE.BoxGeometry(1.2, 0.065, 0.12), '#e4e1d6', [GRID_W / 2 + t, 0.025, 3]));
    }
  }

  /** A sparse scatter of autumn trees, a little denser near town and thinning out with distance. */
  private trees(out: THREE.BufferGeometry[]): void {
    for (let i = 0; i < 90; i++) {
      const a = hash(i, 1) * Math.PI * 2;
      const r = 15 + Math.pow(hash(i, 2), 1.6) * 85;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.reserved(x, z)) continue;
      const k = 0.8 + hash(i, 3) * 0.9;
      out.push(part(new THREE.CylinderGeometry(0.08 * k, 0.12 * k, 0.6 * k, 6), '#6e4a32', [x, 0.3 * k, z]));
      const col = AUTUMN[Math.floor(hash(i, 4) * AUTUMN.length)];
      if (hash(i, 5) < 0.3) {
        out.push(part(new THREE.ConeGeometry(0.5 * k, 1.3 * k, 7), '#5f7f45', [x, 1.1 * k, z]));
      } else {
        out.push(part(new THREE.IcosahedronGeometry(0.6 * k, 0), col, [x, 1.0 * k, z], [hash(i, 6), hash(i, 7) * 6, 0]));
      }
    }
  }

  /** Two rings of low-poly peaks; the far ring is taller and bluer for depth. */
  private mountains(): THREE.Mesh {
    const parts: THREE.BufferGeometry[] = [];
    const ring = (count: number, radius: number, hMin: number, hMax: number, rock: string, salt: number) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + hash(i, salt) * 0.25;
        const r = radius + (hash(i, salt + 1) - 0.5) * radius * 0.25;
        const h = hMin + hash(i, salt + 2) * (hMax - hMin);
        const base = h * (1.1 + hash(i, salt + 3) * 0.6);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const yaw = hash(i, salt + 4) * 6;
        parts.push(part(new THREE.ConeGeometry(base, h, 6 + Math.floor(hash(i, salt + 5) * 3)), rock, [x, h / 2 - 0.5, z], [0, yaw, 0]));
        // Snow cap: the top quarter of the same cone, slightly fattened
        if (h > hMin + (hMax - hMin) * 0.35) {
          const ch = h * 0.28;
          parts.push(part(new THREE.ConeGeometry(base * 0.29, ch, 6 + Math.floor(hash(i, salt + 5) * 3)), '#f4f6f8', [x, h - ch / 2 - 0.45, z], [0, yaw, 0]));
        }
      }
    };
    ring(26, 150, 18, 34, '#7d8f7a', 10);
    ring(34, 230, 32, 62, '#7f8ea6', 20);
    return new THREE.Mesh(merge(parts), vertexColorMat({ roughness: 1 }));
  }
}
