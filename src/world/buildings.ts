import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { hash, part } from './common';

export type YardKind = 'cafe' | 'garden' | 'fountain' | 'playground';

/** A building in local space: footprint W×D (world units), ground at y = 0, entrance facing +z. */
export interface BuildingModel {
  solid: THREE.BufferGeometry[];
  windows: THREE.BufferGeometry[];
  /** What an attached lawn block should hold. */
  yard: YardKind;
}

export type Builder = (seed: number, W: number, D: number) => BuildingModel;

const pick = <T>(arr: T[], seed: number, salt: number) => arr[Math.floor(hash(seed, salt) * arr.length)];
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const glass = (w: number, h: number, pos: [number, number, number], side = false) =>
  part(box(side ? 0.015 : w, h, side ? w : 0.015), '#fff', pos);

function prism(width: number, height: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(0, height);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

/** Windows on all four faces of a W×D box, `floors` storeys of height `fh` from y0. */
function windowGrid(W: number, D: number, y0: number, floors: number, fh: number, out: THREE.BufferGeometry[], skipFrontGround = false) {
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh + fh * 0.55;
    const nx = Math.max(1, Math.floor(W / 0.2));
    for (let i = 0; i < nx; i++) {
      const x = -W / 2 + (W / nx) * (i + 0.5);
      if (!(skipFrontGround && f === 0)) out.push(glass(0.1, 0.13, [x, y, D / 2 + 0.006]));
      out.push(glass(0.1, 0.13, [x, y, -D / 2 - 0.006]));
    }
    const nz = Math.max(1, Math.floor(D / 0.2));
    for (let i = 0; i < nz; i++) {
      const z = -D / 2 + (D / nz) * (i + 0.5);
      out.push(glass(0.1, 0.13, [W / 2 + 0.006, y, z], true));
      out.push(glass(0.1, 0.13, [-W / 2 - 0.006, y, z], true));
    }
  }
}

// ---------------------------------------------------------------- any size

/** Apartments: balconies, entrance canopy, rooftop garden. */
const apartments: Builder = (seed, W, D) => {
  const wall = pick(['#e9c46a', '#f4a261', '#8ecae6', '#cdb4db', '#d8d2c4'], seed, 2);
  const FH = 0.28, H = FH * 2;
  const solid = [
    part(box(W, H, D), wall, [0, H / 2, 0]),
    part(box(W + 0.03, 0.04, D + 0.03), '#f7f4ee', [0, H, 0]),
    part(box(W + 0.02, 0.025, D + 0.02), '#f7f4ee', [0, FH, 0]),
    part(box(W - 0.12, 0.04, D - 0.12), '#86b25a', [0, H + 0.04, 0]),
    part(box(0.22, 0.02, 0.12), '#f7f4ee', [0, 0.24, D / 2 + 0.06]),
    part(box(0.12, 0.2, 0.02), '#3d405b', [0, 0.1, D / 2 + 0.006]),
  ];
  for (let i = 0; i < Math.max(2, Math.round(W / 0.25)); i++) {
    solid.push(part(new THREE.IcosahedronGeometry(0.06, 0), '#d0662a', [-W / 2 + 0.12 + hash(seed, i) * (W - 0.24), H + 0.09, -D / 2 + 0.12 + hash(i, seed) * (D - 0.24)]));
  }
  const nb = Math.max(2, Math.round(W / 0.4));
  for (let i = 0; i < nb; i++) {
    const x = -W / 2 + (W / nb) * (i + 0.5);
    if (Math.abs(x) < 0.12) continue;
    solid.push(part(box(0.22, 0.02, 0.1), '#f7f4ee', [x, FH + 0.03, D / 2 + 0.05]), part(box(0.22, 0.07, 0.01), '#9fb4c7', [x, FH + 0.075, D / 2 + 0.1]));
  }
  const windows: THREE.BufferGeometry[] = [];
  windowGrid(W, D, 0, 2, FH, windows, true);
  return { solid, windows, yard: pick<YardKind>(['playground', 'garden'], seed, 3) };
};

/** Corner café: glass shopfront, striped awning, roof sign. */
const cafe: Builder = (seed, W, D) => {
  const wall = pick(['#fefae0', '#e9edc9', '#ffe5d9'], seed, 2);
  const stripe = pick(['#e63946', '#2a9d8f', '#3a86ff'], seed, 4);
  const H = 0.42;
  const n = Math.max(6, Math.round(W / 0.1));
  const solid: THREE.BufferGeometry[] = [
    part(box(W, H, D), wall, [0, H / 2, 0]),
    part(box(W + 0.03, 0.05, D + 0.03), stripe, [0, H, 0]),
    part(box(Math.min(0.6, W * 0.55), 0.1, 0.03), '#2b2d42', [0, H + 0.1, D / 2 - 0.04]),
    part(box(Math.min(0.56, W * 0.5), 0.06, 0.01), '#ffd166', [0, H + 0.1, D / 2 - 0.02]),
    part(box(W - 0.06, 0.02, 0.02), '#2b2d42', [0, 0.28, D / 2 + 0.01]),
  ];
  for (let i = 0; i < n; i++) solid.push(part(box(W / n, 0.02, 0.16), i % 2 ? '#ffffff' : stripe, [-W / 2 + W / (2 * n) + (i * W) / n, 0.33, D / 2 + 0.07], [0.45, 0, 0]));
  for (let x = -W / 2 + 0.2; x < W / 2 - 0.1; x += 0.2) solid.push(part(box(0.02, 0.26, 0.02), '#2b2d42', [x, 0.15, D / 2 + 0.01]));
  const windows = [glass(W - 0.08, 0.24, [0, 0.15, D / 2 + 0.004]), glass(D * 0.6, 0.14, [W / 2 + 0.006, 0.2, 0], true), glass(D * 0.6, 0.14, [-W / 2 - 0.006, 0.2, 0], true)];
  return { solid, windows, yard: 'cafe' };
};

/** Glass office with vertical fins and rooftop plant. */
const office: Builder = (seed, W, D) => {
  const frame = pick(['#e5e5e5', '#2b2d42', '#adb5bd'], seed, 2);
  const H = 0.62;
  const solid: THREE.BufferGeometry[] = [
    part(box(W - 0.04, H, D - 0.04), '#9fb3c8', [0, H / 2, 0]),
    part(box(W + 0.02, 0.04, D + 0.02), frame, [0, H, 0]),
    part(box(W + 0.02, 0.04, D + 0.02), frame, [0, 0.02, 0]),
    part(box(W + 0.01, 0.02, D + 0.01), frame, [0, H / 2, 0]),
    part(box(0.2, 0.08, 0.16), '#c9d3df', [-W / 4, H + 0.06, -D / 5]),
    part(box(0.14, 0.06, 0.12), '#c9d3df', [W / 4, H + 0.05, D / 5]),
    part(box(0.18, 0.04, 0.12), frame, [0, 0.22, D / 2 + 0.06]),
  ];
  const fins = Math.round(W / 0.12);
  for (let i = 0; i <= fins; i++) {
    const x = -W / 2 + (W / fins) * i;
    solid.push(part(box(0.015, H, 0.03), frame, [x, H / 2, D / 2]), part(box(0.015, H, 0.03), frame, [x, H / 2, -D / 2]));
  }
  const windows = [
    glass(W - 0.06, H - 0.08, [0, H / 2, D / 2 - 0.015]),
    glass(W - 0.06, H - 0.08, [0, H / 2, -D / 2 + 0.015]),
    glass(D - 0.06, H - 0.08, [W / 2 - 0.015, H / 2, 0], true),
    glass(D - 0.06, H - 0.08, [-W / 2 + 0.015, H / 2, 0], true),
  ];
  return { solid, windows, yard: 'fountain' };
};

/** Brick loft with a sawtooth factory roof. */
const loft: Builder = (seed, W, D) => {
  const brick = pick(['#b5523b', '#a44a3f', '#c46d4b'], seed, 2);
  const H = 0.36;
  const solid: THREE.BufferGeometry[] = [
    part(box(W, H, D), brick, [0, H / 2, 0]),
    part(box(W + 0.02, 0.03, D + 0.02), '#e8dcc8', [0, H, 0]),
    part(box(0.16, 0.24, 0.02), '#2f3e46', [0, 0.12, D / 2 + 0.006]),
    part(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 10), brick, [W / 2 - 0.1, H + 0.15, -D / 2 + 0.1]),
  ];
  const windows: THREE.BufferGeometry[] = [];
  const teeth = Math.max(2, Math.round(D / 0.23));
  const t = D / teeth;
  for (let i = 0; i < teeth; i++) {
    const z = -D / 2 + t / 2 + i * t;
    const s = new THREE.Shape();
    s.moveTo(-t / 2, 0);
    s.lineTo(t / 2, 0);
    s.lineTo(t / 2, 0.16);
    s.closePath();
    const tooth = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false }).translate(0, 0, -W / 2);
    solid.push(part(tooth, '#5c677d', [0, H, z], [0, Math.PI / 2, 0]));
    windows.push(glass(W - 0.06, 0.13, [0, H + 0.08, z - t / 2 - 0.006]));
  }
  for (let x = -W / 2 + 0.14; x < W / 2 - 0.08; x += 0.14) if (Math.abs(x) > 0.1) windows.push(glass(0.08, 0.22, [x, 0.17, D / 2 + 0.006]));
  for (let z = -D / 2 + 0.15; z < D / 2 - 0.08; z += 0.2) windows.push(glass(0.09, 0.22, [W / 2 + 0.006, 0.17, z], true), glass(0.09, 0.22, [-W / 2 - 0.006, 0.17, z], true));
  return { solid, windows, yard: 'garden' };
};

/** Civic library: steps, colonnade, pediment. */
const library: Builder = (seed, W, D) => {
  const stone = pick(['#efe6d2', '#e3dccb', '#f2efe6'], seed, 2);
  const roof = pick(['#4a6670', '#7a6c5d', '#5b6c8f'], seed, 3);
  const H = 0.36;
  const solid: THREE.BufferGeometry[] = [
    part(box(W, H, D - 0.12), stone, [0, H / 2 + 0.04, -0.06]),
    part(box(W + 0.06, 0.04, D + 0.08), '#d6cfbf', [0, 0.02, 0]),
    part(box(W - 0.1, 0.03, 0.1), '#d6cfbf', [0, 0.055, D / 2 - 0.02]),
    part(box(W + 0.04, 0.04, D), stone, [0, H + 0.06, 0]),
    part(prism(W + 0.06, 0.16, D + 0.02), roof, [0, H + 0.08, 0]),
    part(prism(W - 0.06, 0.11, 0.02), stone, [0, H + 0.095, D / 2 + 0.005]),
    part(box(0.12, 0.2, 0.02), '#5a3a26', [0, 0.14, D / 2 - 0.18]),
  ];
  const cols = Math.max(4, Math.round(W / 0.16));
  for (let i = 0; i < cols; i++) {
    const x = -W / 2 + 0.08 + ((W - 0.16) / (cols - 1)) * i;
    if (Math.abs(x) > 0.07) solid.push(part(new THREE.CylinderGeometry(0.025, 0.028, H, 10), '#ffffff', [x, H / 2 + 0.04, D / 2 - 0.06]));
  }
  const windows = [glass(0.08, 0.16, [-W / 3, 0.2, D / 2 - 0.18]), glass(0.08, 0.16, [W / 3, 0.2, D / 2 - 0.18]), glass(D * 0.5, 0.16, [W / 2 + 0.006, 0.2, -0.06], true), glass(D * 0.5, 0.16, [-W / 2 - 0.006, 0.2, -0.06], true)];
  return { solid, windows, yard: 'garden' };
};

// ---------------------------------------------------------------- 2×1

/** A row of narrow, colourful townhouses with mixed rooflines. */
const townRow: Builder = (seed, W, D) => {
  const colors = ['#f4a6a6', '#86c5da', '#f9dc8c', '#a8d5ba', '#cdb4db', '#ffb4a2'];
  const n = Math.max(3, Math.round(W / 0.3));
  const w = W / n;
  const solid: THREE.BufferGeometry[] = [];
  const windows: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + w / 2 + i * w;
    const h = 0.42 + hash(seed, i) * 0.2;
    const c = colors[(Math.floor(hash(seed, 9) * colors.length) + i) % colors.length];
    solid.push(part(box(w - 0.01, h, D), c, [x, h / 2, 0]));
    if (i % 2) solid.push(part(prism(w + 0.02, 0.16, D + 0.04), '#4a4e69', [x, h, 0]));
    else solid.push(part(box(w + 0.01, 0.04, D + 0.02), '#ffffff', [x, h, 0]));
    solid.push(part(box(0.08, 0.17, 0.02), pick(['#e63946', '#1d3557', '#2a9d8f', '#ffb703'], seed, i + 20), [x - w * 0.18, 0.085, D / 2 + 0.006]));
    solid.push(part(box(0.12, 0.03, 0.06), '#d6cfbf', [x - w * 0.18, 0.015, D / 2 + 0.03]));
    windows.push(glass(0.07, 0.1, [x + w * 0.2, 0.14, D / 2 + 0.006]), glass(w * 0.55, 0.1, [x, h * 0.72, D / 2 + 0.006]), glass(w * 0.55, 0.1, [x, h * 0.72, -D / 2 - 0.006]));
  }
  return { solid, windows, yard: 'garden' };
};

/** Retro diner: rounded chrome-banded body and a big neon sign. */
const diner: Builder = (seed, W, D) => {
  const body = pick(['#9ee6cf', '#ffc8dd', '#bde0fe'], seed, 2);
  const H = 0.34;
  const solid: THREE.BufferGeometry[] = [
    part(new RoundedBoxGeometry(W, H, D * 0.8, 4, 0.12), body, [0, H / 2, 0]),
    part(new RoundedBoxGeometry(W + 0.01, 0.04, D * 0.8 + 0.01, 3, 0.02), '#d9dde3', [0, 0.1, 0]),
    part(new RoundedBoxGeometry(W + 0.04, 0.04, D * 0.8 + 0.04, 3, 0.02), '#e63946', [0, H, 0]),
    part(box(0.02, 0.22, 0.02), '#d9dde3', [0, H + 0.11, 0]),
    part(box(0.12, 0.2, 0.02), '#d9dde3', [-W / 2 + 0.16, 0.1, D * 0.4 + 0.006]),
  ];
  const windows = [
    glass(W - 0.4, 0.12, [0.08, 0.22, D * 0.4 + 0.006]),
    glass(W - 0.2, 0.12, [0, 0.22, -D * 0.4 - 0.006]),
    // Neon sign
    part(new RoundedBoxGeometry(0.42, 0.14, 0.04, 3, 0.05), '#fff', [0, H + 0.26, 0]),
  ];
  return { solid, windows, yard: 'cafe' };
};

/** Fire station: red brick, garage doors, hose tower. */
const fireStation: Builder = (_seed, W, D) => {
  const H = 0.46;
  const doors = Math.max(2, Math.round((W - 0.3) / 0.28));
  const solid: THREE.BufferGeometry[] = [
    part(box(W, H, D), '#b23a30', [0, H / 2, 0]),
    part(box(W + 0.03, 0.04, D + 0.03), '#f1e3c8', [0, H, 0]),
    part(box(0.24, 0.84, 0.24), '#9b2f27', [W / 2 - 0.14, 0.42, -D / 2 + 0.14]),
    part(prism(0.3, 0.12, 0.3), '#3a3f4b', [W / 2 - 0.14, 0.84, -D / 2 + 0.14]),
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), '#ffd166', [-W / 2 + 0.14, H - 0.12, D / 2 + 0.01], [Math.PI / 2, 0, 0]),
  ];
  const span = W - 0.3;
  for (let i = 0; i < doors; i++) {
    const x = -W / 2 + 0.3 + (span / doors) * (i + 0.5);
    solid.push(part(box(span / doors - 0.06, 0.28, 0.02), '#f4f1ea', [x, 0.14, D / 2 + 0.006]));
    for (let k = 1; k < 4; k++) solid.push(part(box(span / doors - 0.08, 0.008, 0.025), '#c9c6bd', [x, k * 0.07, D / 2 + 0.008]));
  }
  const windows: THREE.BufferGeometry[] = [];
  for (let x = -W / 2 + 0.15; x < W / 2 - 0.1; x += 0.2) windows.push(glass(0.1, 0.08, [x, 0.37, D / 2 + 0.006]));
  return { solid, windows, yard: 'garden' };
};

/** Greenhouse: brick plinth with a glass barrel vault. */
const greenhouse: Builder = (seed, W, D) => {
  const vault = new THREE.CylinderGeometry(D / 2 - 0.02, D / 2 - 0.02, W - 0.04, 20, 1, false, 0, Math.PI);
  const solid: THREE.BufferGeometry[] = [
    part(box(W, 0.1, D), pick(['#a44a3f', '#c9b79c'], seed, 2), [0, 0.05, 0]),
    part(new THREE.CylinderGeometry(D / 2, D / 2, 0.02, 20, 1, false, 0, Math.PI), '#2f3e46', [-W / 2 + 0.01, 0.1, 0], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(D / 2, D / 2, 0.02, 20, 1, false, 0, Math.PI), '#2f3e46', [W / 2 - 0.01, 0.1, 0], [0, 0, Math.PI / 2]),
  ];
  // Ribs across the vault
  for (let x = -W / 2 + 0.15; x < W / 2 - 0.1; x += 0.15) {
    solid.push(part(new THREE.TorusGeometry(D / 2 - 0.015, 0.008, 4, 16, Math.PI), '#2f3e46', [x, 0.1, 0], [0, Math.PI / 2, 0]));
  }
  return { solid, windows: [part(vault, '#fff', [0, 0.1, 0], [0, 0, Math.PI / 2])], yard: 'garden' };
};

// ---------------------------------------------------------------- 2×2 and bigger

/** School: U-shaped wings around a courtyard, clock tower, flagpole. */
const school: Builder = (seed, W, D) => {
  const wall = pick(['#f2cc8f', '#e9d8a6', '#f6bd60'], seed, 2);
  const roof = '#6d597a';
  const H = 0.4, wing = 0.32;
  const solid: THREE.BufferGeometry[] = [
    part(box(W, H, wing), wall, [0, H / 2, -D / 2 + wing / 2]),
    part(box(wing, H, D - wing), wall, [-W / 2 + wing / 2, H / 2, wing / 2]),
    part(box(wing, H, D - wing), wall, [W / 2 - wing / 2, H / 2, wing / 2]),
    part(box(W + 0.03, 0.04, wing + 0.03), roof, [0, H, -D / 2 + wing / 2]),
    part(box(wing + 0.03, 0.04, D - wing), roof, [-W / 2 + wing / 2, H, wing / 2]),
    part(box(wing + 0.03, 0.04, D - wing), roof, [W / 2 - wing / 2, H, wing / 2]),
    // Courtyard: playground surface and a tree
    part(box(W - 2 * wing, 0.015, D - wing), '#e76f51', [0, 0.008, wing / 2]),
    part(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 7), '#6e4a32', [0.1, 0.1, 0.2]),
    part(new THREE.IcosahedronGeometry(0.13, 0), '#e9a23a', [0.1, 0.27, 0.2]),
    // Clock tower over the main wing
    part(box(0.2, 0.42, 0.2), wall, [0, H + 0.21, -D / 2 + wing / 2]),
    part(new THREE.ConeGeometry(0.17, 0.2, 4), roof, [0, H + 0.52, -D / 2 + wing / 2], [0, Math.PI / 4, 0]),
    part(new THREE.CylinderGeometry(0.065, 0.065, 0.015, 20), '#ffffff', [0, H + 0.3, -D / 2 + wing / 2 + 0.105], [Math.PI / 2, 0, 0]),
    part(box(0.01, 0.05, 0.01), '#222', [0, H + 0.32, -D / 2 + wing / 2 + 0.115]),
    part(box(0.035, 0.01, 0.01), '#222', [0.015, H + 0.3, -D / 2 + wing / 2 + 0.115]),
    // Flagpole
    part(box(0.012, 0.5, 0.012), '#d9dde3', [W / 2 - 0.05, 0.25, D / 2 - 0.05]),
    part(box(0.13, 0.08, 0.005), '#3a86ff', [W / 2 - 0.12, 0.45, D / 2 - 0.05]),
  ];
  const windows: THREE.BufferGeometry[] = [];
  for (let x = -W / 2 + 0.1; x < W / 2 - 0.05; x += 0.16) windows.push(glass(0.09, 0.14, [x, 0.22, -D / 2 - 0.006]));
  for (let z = -D / 2 + wing + 0.1; z < D / 2 - 0.05; z += 0.16) {
    windows.push(glass(0.09, 0.14, [W / 2 + 0.006, 0.22, z], true), glass(0.09, 0.14, [-W / 2 - 0.006, 0.22, z], true));
    windows.push(glass(0.09, 0.14, [W / 2 - wing - 0.006, 0.22, z], true), glass(0.09, 0.14, [-W / 2 + wing + 0.006, 0.22, z], true));
  }
  return { solid, windows, yard: 'playground' };
};

/** Hospital: white block, red cross, rooftop helipad. */
const hospital: Builder = (_seed, W, D) => {
  const FH = 0.3, H = FH * 2;
  const solid: THREE.BufferGeometry[] = [
    part(box(W, H, D), '#f4f6f8', [0, H / 2, 0]),
    part(box(W + 0.02, 0.05, D + 0.02), '#4ea8de', [0, FH, 0]),
    part(box(W + 0.03, 0.04, D + 0.03), '#4ea8de', [0, H, 0]),
    // Entrance canopy
    part(box(0.5, 0.03, 0.2), '#ffffff', [0, 0.22, D / 2 + 0.1]),
    part(box(0.02, 0.22, 0.02), '#d9dde3', [-0.22, 0.11, D / 2 + 0.18]),
    part(box(0.02, 0.22, 0.02), '#d9dde3', [0.22, 0.11, D / 2 + 0.18]),
    // Red cross sign
    part(box(0.16, 0.05, 0.02), '#e63946', [0, H - 0.1, D / 2 + 0.012]),
    part(box(0.05, 0.16, 0.02), '#e63946', [0, H - 0.1, D / 2 + 0.012]),
    // Helipad
    part(new THREE.CylinderGeometry(Math.min(W, D) * 0.3, Math.min(W, D) * 0.3, 0.02, 32), '#3a3f4b', [0, H + 0.03, -0.05]),
    part(new THREE.TorusGeometry(Math.min(W, D) * 0.26, 0.012, 4, 32), '#ffd166', [0, H + 0.045, -0.05], [Math.PI / 2, 0, 0]),
    part(box(0.03, 0.005, 0.18), '#ffffff', [-0.06, H + 0.042, -0.05]),
    part(box(0.03, 0.005, 0.18), '#ffffff', [0.06, H + 0.042, -0.05]),
    part(box(0.12, 0.005, 0.03), '#ffffff', [0, H + 0.042, -0.05]),
  ];
  const windows: THREE.BufferGeometry[] = [];
  windowGrid(W, D, 0, 2, FH, windows, true);
  windows.push(glass(0.3, 0.16, [0, 0.1, D / 2 + 0.006]));
  return { solid, windows, yard: 'garden' };
};

/** Museum: colonnaded front and a big dome on a drum. */
const museum: Builder = (seed, W, D) => {
  const stone = pick(['#efe6d2', '#e9e4da'], seed, 2);
  const dome = pick(['#5fa8a0', '#c9a227', '#7d8fb3'], seed, 3);
  const H = 0.42;
  const r = Math.min(W, D) * 0.26;
  const solid: THREE.BufferGeometry[] = [
    part(box(W + 0.06, 0.05, D + 0.06), '#d6cfbf', [0, 0.025, 0]),
    part(box(W, H, D), stone, [0, H / 2 + 0.05, 0]),
    part(box(W + 0.04, 0.05, D + 0.04), '#d6cfbf', [0, H + 0.07, 0]),
    part(new THREE.CylinderGeometry(r, r, 0.14, 28), stone, [0, H + 0.16, 0]),
    part(new THREE.SphereGeometry(r * 1.02, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), dome, [0, H + 0.23, 0]),
    part(new THREE.SphereGeometry(0.03, 10, 8), '#ffd166', [0, H + 0.24 + r, 0]),
    // Portico
    part(prism(W * 0.55, 0.14, 0.2), stone, [0, H + 0.05, D / 2 + 0.06]),
    part(box(W * 0.55, 0.04, 0.2), '#d6cfbf', [0, H + 0.03, D / 2 + 0.06]),
    part(box(W * 0.5, 0.03, 0.14), '#d6cfbf', [0, 0.065, D / 2 + 0.08]),
  ];
  for (let i = 0; i < 6; i++) {
    const x = -W * 0.25 + (W * 0.5 / 5) * i;
    solid.push(part(new THREE.CylinderGeometry(0.025, 0.03, H - 0.03, 10), '#ffffff', [x, H / 2 + 0.05, D / 2 + 0.12]));
  }
  const windows: THREE.BufferGeometry[] = [];
  for (let z = -D / 2 + 0.2; z < D / 2 - 0.1; z += 0.25) windows.push(glass(0.08, 0.2, [W / 2 + 0.006, 0.26, z], true), glass(0.08, 0.2, [-W / 2 - 0.006, 0.26, z], true));
  return { solid, windows, yard: 'fountain' };
};

/** Shopping mall: low and wide, colourful storefront blocks, glass pyramid atrium. */
const mall: Builder = (seed, W, D) => {
  const H = 0.38;
  const solid: THREE.BufferGeometry[] = [
    part(box(W, H, D), '#ece7df', [0, H / 2, 0]),
    part(box(W + 0.03, 0.04, D + 0.03), '#b8c0ca', [0, H, 0]),
  ];
  const shops = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b'];
  const n = Math.max(3, Math.round(W / 0.35));
  const windows: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (W / n) * (i + 0.5);
    if (Math.abs(x) < 0.15) continue;
    solid.push(part(box(W / n - 0.06, 0.06, 0.03), shops[(i + Math.floor(hash(seed, 2) * 5)) % shops.length], [x, 0.28, D / 2 + 0.012]));
    windows.push(glass(W / n - 0.08, 0.16, [x, 0.12, D / 2 + 0.006]));
  }
  // Entrance and atrium pyramid
  solid.push(part(box(0.3, 0.3, 0.06), '#6c757d', [0, 0.15, D / 2 + 0.03]));
  windows.push(glass(0.22, 0.22, [0, 0.11, D / 2 + 0.065]));
  const pyr = new THREE.ConeGeometry(Math.min(W, D) * 0.32, 0.3, 4);
  windows.push(part(pyr, '#fff', [0, H + 0.15, 0], [0, Math.PI / 4, 0]));
  for (const x of [-W / 3, W / 3]) solid.push(part(box(0.22, 0.08, 0.16), '#c9d3df', [x, H + 0.06, -D / 4]));
  return { solid, windows, yard: 'fountain' };
};

/** Train station: brick headhouses with a long arched train shed, clock and a train inside. */
const trainStation: Builder = (seed, W, D) => {
  const brick = pick(['#a44a3f', '#b5703f'], seed, 2);
  const shedR = D / 2 - 0.04;
  const shed = new THREE.CylinderGeometry(shedR, shedR, W - 0.5, 24, 1, true, -Math.PI / 2, Math.PI);
  const solid: THREE.BufferGeometry[] = [
    // Headhouses at each end
    part(box(0.26, 0.5, D), brick, [-W / 2 + 0.13, 0.25, 0]),
    part(box(0.26, 0.5, D), brick, [W / 2 - 0.13, 0.25, 0]),
    part(prism(D + 0.04, 0.14, 0.3), '#3a3f4b', [-W / 2 + 0.13, 0.5, 0], [0, Math.PI / 2, 0]),
    part(prism(D + 0.04, 0.14, 0.3), '#3a3f4b', [W / 2 - 0.13, 0.5, 0], [0, Math.PI / 2, 0]),
    // Clock tower
    part(box(0.18, 0.86, 0.18), brick, [-W / 2 + 0.13, 0.43, D / 2 - 0.12]),
    part(new THREE.ConeGeometry(0.15, 0.18, 4), '#3a3f4b', [-W / 2 + 0.13, 0.95, D / 2 - 0.12], [0, Math.PI / 4, 0]),
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 20), '#ffffff', [-W / 2 + 0.13, 0.72, D / 2 - 0.025], [Math.PI / 2, 0, 0]),
    // Platform and the train
    part(box(W - 0.5, 0.05, D * 0.3), '#c9c6bd', [0, 0.025, D * 0.22]),
    part(new RoundedBoxGeometry(W - 0.7, 0.16, 0.18, 3, 0.06), '#e63946', [0, 0.11, -D * 0.12]),
    part(box(W - 0.72, 0.03, 0.185), '#ffffff', [0, 0.12, -D * 0.12]),
  ];
  // Arched shed ribs
  for (let x = -W / 2 + 0.3; x <= W / 2 - 0.3; x += 0.22) {
    solid.push(part(new THREE.TorusGeometry(shedR, 0.012, 4, 20, Math.PI), '#4a4e69', [x, 0.05, 0], [0, Math.PI / 2, 0]));
  }
  const windows: THREE.BufferGeometry[] = [part(shed, '#fff', [0, 0.05, 0], [0, 0, Math.PI / 2])];
  for (let x = -W / 2 + 0.4; x < W / 2 - 0.4; x += 0.12) windows.push(glass(0.07, 0.05, [x, 0.14, -D * 0.12 + 0.095]));
  for (const s of [-1, 1]) windows.push(glass(0.1, 0.16, [s * (W / 2 - 0.13), 0.28, D / 2 + 0.006]));
  return { solid, windows, yard: 'garden' };
};

const SMALL: Builder[] = [apartments, cafe, office, loft, library];
const WIDE: Builder[] = [townRow, diner, fireStation, greenhouse, apartments, loft, cafe];
const LARGE: Builder[] = [school, hospital, museum, fireStation, mall, office];
const HUGE: Builder[] = [trainStation, mall, museum, school];

/** Pick a building that suits a footprint of `tiles` cells. */
export function pickBuilding(tiles: number, seed: number): Builder {
  const set = tiles >= 6 ? HUGE : tiles >= 4 ? LARGE : tiles >= 2 ? WIDE : SMALL;
  return set[Math.floor(hash(seed, 11) * set.length)];
}
