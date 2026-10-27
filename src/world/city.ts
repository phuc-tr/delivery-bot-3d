import * as THREE from 'three';
import { type Cell, type GridWorld, type Zone, cellKey } from '../sim/grid';
import { PLAZA_TOP, TILE_TOP, cellToWorld, hash, merge, part, shadowed, vertexColorMat } from './common';
import { pickBuilding, type YardKind } from './buildings';

const CONCRETE = ['#cfd1d4', '#cbcdd1', '#d3d5d8'];
const ROCKS = ['#9a9ca3', '#a8a7a2', '#8d9098'];
const PLAZA_H = PLAZA_TOP - TILE_TOP + 0.06;
const FLOWERS = ['#ff6b9a', '#ffd23f', '#ffffff', '#b28dff', '#ff8c42'];
const NEIGHBOURS: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
/** Autumn canopy palette: amber, rust, gold, a little late green. */
const AUTUMN = ['#e07a2f', '#c9482b', '#e9b23a', '#d0662a', '#b9a33f', '#a63d2a'];

interface Region {
  zone: Zone;
  cells: Cell[];
  r0: number;
  c0: number;
  rows: number;
  cols: number;
  /** Whether the cells fill their bounding box. */
  rect: boolean;
  seed: number;
}

type Plan =
  | { kind: 'building'; footprint: Cell[]; lawn: Cell[] }
  | { kind: 'park' }
  | { kind: 'rocks' };

/**
 * City blocks: every block of the map becomes a building (1×1 up to 3×2) that may share its
 * block with a fenced lawn, a pocket park with big trees, or a rock garden. Houses and the
 * supermarket live in Props.
 */
export class City {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly windowMat = new THREE.MeshStandardMaterial({ color: '#a9d6ef', emissive: '#ffcf80', emissiveIntensity: 0, roughness: 0.25, metalness: 0.2 });

  constructor(private readonly world: GridWorld) {
    const solid: THREE.BufferGeometry[] = [];
    const windows: THREE.BufferGeometry[] = [];
    const canopy: THREE.BufferGeometry[] = [];

    findRegions(world).forEach((r, i) => {
      const curb = (col: string) => slab(r.cells, 0.04, PLAZA_H, PLAZA_TOP - PLAZA_H / 2, col, solid);
      if (r.zone === 'M' || r.zone === 'H') {
        curb('#d9d4c8');
        return;
      }
      curb(CONCRETE[r.seed % CONCRETE.length]);
      const plan = planBlock(r, i);
      if (plan.kind === 'building') this.building(plan.footprint, plan.lawn, r.seed, solid, windows, canopy);
      else if (plan.kind === 'park') this.park(r, solid, canopy);
      else this.rocks(r, solid);
    });

    this.group.add(shadowed(new THREE.Mesh(merge(solid), vertexColorMat({ roughness: 0.85 }))));
    this.group.add(new THREE.Mesh(merge(windows), this.windowMat));
    if (canopy.length) this.group.add(shadowed(new THREE.Mesh(merge(canopy), this.canopyMat())));
    this.group.add(this.laneMarks());
  }

  setNight(n: number): void {
    this.windowMat.emissiveIntensity = n * 1.8;
  }

  update(t: number): void {
    this.time.value = t;
  }

  private isStreet(r: number, c: number): boolean {
    return this.world.inBounds([r, c]) && this.world.zone([r, c]) === '.';
  }

  /**
   * A building on a rectangular footprint, optionally with a lawn on the rest of the block.
   * The entrance faces the lawn, or a street when there is none.
   */
  private building(footprint: Cell[], lawn: Cell[], seed: number, solid: THREE.BufferGeometry[], windows: THREE.BufferGeometry[], canopy: THREE.BufferGeometry[]): void {
    const rows = new Set(footprint.map((c) => c[0])).size;
    const cols = new Set(footprint.map((c) => c[1])).size;
    const centre = centroid(footprint).setY(PLAZA_TOP);

    // Default: face a side that has street along it (prefer south, then east, west, north)
    const r0 = Math.min(...footprint.map((c) => c[0])), c0 = Math.min(...footprint.map((c) => c[1]));
    const sideHasStreet = (dr: number, dc: number) =>
      footprint.some(([r, c]) => (dr > 0 ? r === r0 + rows - 1 : dr < 0 ? r === r0 : dc > 0 ? c === c0 + cols - 1 : c === c0) && this.isStreet(r + dr, c + dc));
    let yaw = sideHasStreet(1, 0) ? 0 : sideHasStreet(0, 1) ? Math.PI / 2 : sideHasStreet(0, -1) ? -Math.PI / 2 : Math.PI;
    if (lawn.length) {
      const d = centroid(lawn).sub(centre);
      yaw = Math.abs(d.x) > Math.abs(d.z) ? (d.x > 0 ? Math.PI / 2 : -Math.PI / 2) : d.z > 0 ? 0 : Math.PI;
    }
    const sideways = Math.abs(Math.sin(yaw)) > 0.5;
    const W = (sideways ? rows : cols) - 0.22;
    const D = (sideways ? cols : rows) - 0.22;

    const model = pickBuilding(rows * cols, seed)(seed, W, D);
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(centre);
    for (const g of model.solid) solid.push(g.applyMatrix4(m));
    for (const g of model.windows) windows.push(g.applyMatrix4(m));

    if (lawn.length) this.yard(lawn, footprint, model.yard, seed, solid, canopy);
  }

  /**
   * One connected yard over all the lawn cells: a single surface, a fence around the outside,
   * sometimes the building's signature feature, and a different extra on a few other cells.
   */
  private yard(cells: Cell[], building: Cell[], kind: YardKind, seed: number, solid: THREE.BufferGeometry[], canopy: THREE.BufferGeometry[]): void {
    const mine = new Set(cells.map(cellKey));
    const near = new Set(building.map(cellKey));
    slab(cells, 0.07, 0.02, PLAZA_TOP + 0.005, '#86c766', solid);

    const E = 0.46;
    for (const cell of cells) {
      const p = cellToWorld(cell, new THREE.Vector3(), PLAZA_TOP);
      for (const [dr, dc] of NEIGHBOURS) {
        const k = cellKey([cell[0] + dr, cell[1] + dc]);
        if (mine.has(k) || near.has(k)) continue;
        const alongX = dr !== 0;
        const ex = p.x + dc * E, ez = p.z + dr * E;
        for (let t = -E; t <= E + 1e-6; t += 0.092) {
          solid.push(part(new THREE.BoxGeometry(0.024, 0.11, 0.024), '#f4f1ea', [ex + (alongX ? t : 0), p.y + 0.06, ez + (alongX ? 0 : t)]));
        }
        for (const y of [0.04, 0.085]) {
          solid.push(part(new THREE.BoxGeometry(alongX ? 2 * E : 0.012, 0.016, alongX ? 0.012 : 2 * E), '#f4f1ea', [ex, p.y + y, ez]));
        }
      }
    }

    // Plenty of plain grass: a third of yards skip the feature, half the other cells stay empty
    const touching = (c: Cell) => NEIGHBOURS.some(([dr, dc]) => near.has(cellKey([c[0] + dr, c[1] + dc])));
    const first = cells.find(touching) ?? cells[0];
    const withFeature = hash(seed, 300) > 0.33;
    const extras = shuffle([...EXTRAS, 'shed' as const, 'bigtree' as const], seed);
    let e = 0;
    cells.forEach((cell, i) => {
      const p = cellToWorld(cell, new THREE.Vector3(), PLAZA_TOP);
      if (cell === first) {
        if (withFeature) FEATURES[kind](p, seed, solid);
        return;
      }
      if (hash(seed, 310 + i) <= 0.5) return;
      const x = extras[e++ % extras.length];
      if (x === 'shed') shed(p, seed + i, solid);
      else if (x === 'bigtree') bigTree(p, seed + i, 0.85, solid, canopy);
      else EXTRA_BUILDERS[x](p, seed + i, solid);
    });
  }

  /** Pocket park: open lawn, a few big autumn trees, sometimes a pond, fountain or playground. */
  private park(r: Region, solid: THREE.BufferGeometry[], canopy: THREE.BufferGeometry[]): void {
    slab(r.cells, 0.09, 0.02, PLAZA_TOP + 0.005, '#7cbd5c', solid);
    const big = r.cells.length >= 4;
    const spot = r.cells[Math.floor(hash(r.seed, 1) * r.cells.length)];
    if (big && hash(r.seed, 2) < 0.7) {
      const p = cellToWorld(spot, new THREE.Vector3(), PLAZA_TOP);
      const pick = hash(r.seed, 3);
      if (pick < 0.4) {
        solid.push(part(new THREE.CylinderGeometry(1, 1, 0.015, 28).scale(0.34, 1, 0.26), '#5fb4d9', [p.x, PLAZA_TOP + 0.02, p.z]));
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          solid.push(part(new THREE.DodecahedronGeometry(0.045, 0), '#b9b6ad', [p.x + Math.cos(a) * 0.36, PLAZA_TOP + 0.03, p.z + Math.sin(a) * 0.28]));
        }
      } else {
        FEATURES[pick < 0.7 ? 'fountain' : 'playground'](p, r.seed, solid);
      }
    }
    r.cells.forEach((cell, i) => {
      if (cell === spot && big) return;
      if (hash(r.seed, i + 10) < (big ? 0.45 : 0.15)) return;
      const p = cellToWorld(cell, new THREE.Vector3(), PLAZA_TOP).add(new THREE.Vector3((hash(i, r.seed) - 0.5) * 0.3, 0, (hash(r.seed, i) - 0.5) * 0.3));
      bigTree(p, r.seed + i, 0.9 + hash(r.seed, i + 20) * 0.3, solid, canopy);
    });
    // A bench on a street-facing edge
    const edge = r.cells.find(([y, x]) => this.isStreet(y + 1, x));
    if (edge) {
      const p = cellToWorld(edge, new THREE.Vector3(), PLAZA_TOP).add(new THREE.Vector3(0.1, 0, 0.32));
      solid.push(part(new THREE.BoxGeometry(0.28, 0.025, 0.08), '#8a5a3b', [p.x, p.y + 0.08, p.z]));
      solid.push(part(new THREE.BoxGeometry(0.28, 0.07, 0.015), '#8a5a3b', [p.x, p.y + 0.12, p.z - 0.04]));
      solid.push(part(new THREE.BoxGeometry(0.24, 0.07, 0.05), '#3a3f4b', [p.x, p.y + 0.035, p.z]));
    }
  }

  /** Rock garden: boulders, gravel and a shrub or two. */
  private rocks(r: Region, solid: THREE.BufferGeometry[]): void {
    slab(r.cells, 0.09, 0.015, PLAZA_TOP + 0.004, '#d8d0bf', solid);
    let n = 0;
    for (const cell of r.cells) {
      const p = cellToWorld(cell, new THREE.Vector3(), PLAZA_TOP);
      const count = 2 + Math.floor(hash(r.seed, n) * 2);
      for (let i = 0; i < count; i++, n++) {
        const s = 0.1 + hash(r.seed, n + 30) * 0.16;
        const g = new THREE.DodecahedronGeometry(s, 0);
        g.scale(1.25, 0.75 + hash(r.seed, n + 40) * 0.5, 1);
        const o = new THREE.Vector3(hash(r.seed, n + 50) - 0.5, 0, hash(r.seed, n + 60) - 0.5).multiplyScalar(0.55);
        solid.push(part(g, ROCKS[n % ROCKS.length], [p.x + o.x, p.y + s * 0.4, p.z + o.z], [hash(r.seed, n + 70), hash(r.seed, n + 80) * 6, 0]));
      }
      solid.push(part(new THREE.IcosahedronGeometry(0.1, 0), '#7a9a45', [p.x + 0.25, p.y + 0.07, p.z - 0.22]));
    }
  }

  private canopyMat(): THREE.Material {
    const mat = vertexColorMat({ roughness: 0.9 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = 'uniform float uTime;\nattribute float aSway;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sway = sin(uTime * 0.9 + position.x * 0.5 + position.z * 0.7) * 0.03 * aSway;
        transformed.x += sway;
        transformed.z += sway * 0.5;`,
      );
    };
    return mat;
  }

  /** Dashed centre lines down straight streets, zebra crossings where they meet a junction. */
  private laneMarks(): THREE.InstancedMesh {
    const st = (r: number, c: number) => this.isStreet(r, c);
    const degree = (r: number, c: number) => [st(r - 1, c), st(r + 1, c), st(r, c - 1), st(r, c + 1)].filter(Boolean).length;
    const junction = (r: number, c: number) => st(r, c) && degree(r, c) >= 3;
    const marks: { x: number; z: number; w: number; d: number }[] = [];
    const p = new THREE.Vector3();
    for (let r = 0; r < this.world.height; r++) {
      for (let c = 0; c < this.world.width; c++) {
        if (!st(r, c)) continue;
        const horizontal = st(r, c - 1) && st(r, c + 1) && !st(r - 1, c) && !st(r + 1, c);
        const vertical = st(r - 1, c) && st(r + 1, c) && !st(r, c - 1) && !st(r, c + 1);
        if (!horizontal && !vertical) continue; // only proper street segments get markings
        cellToWorld([r, c], p);
        const nearJ = horizontal ? (junction(r, c - 1) ? -1 : junction(r, c + 1) ? 1 : 0) : junction(r - 1, c) ? -1 : junction(r + 1, c) ? 1 : 0;
        if (nearJ && hash(r, c) < 0.6) {
          for (let i = -2; i <= 2; i++) {
            if (horizontal) marks.push({ x: p.x + nearJ * 0.3, z: p.z + i * 0.17, w: 0.3, d: 0.08 });
            else marks.push({ x: p.x + i * 0.17, z: p.z + nearJ * 0.3, w: 0.08, d: 0.3 });
          }
        } else if (horizontal) {
          marks.push({ x: p.x, z: p.z, w: 0.36, d: 0.045 });
        } else {
          marks.push({ x: p.x, z: p.z, w: 0.045, d: 0.36 });
        }
      }
    }

    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.006, 1), new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.7 }), marks.length);
    const m = new THREE.Matrix4();
    marks.forEach((k, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(k.x, TILE_TOP + 0.003, k.z), new THREE.Quaternion(), new THREE.Vector3(k.w, 1, k.d))));
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Decide what a block holds: a building (with or without a lawn), a pocket park, or rocks. */
function planBlock(r: Region, i: number): Plan {
  const roll = hash(r.seed, i + 0.5);
  const n = r.cells.length;
  const all = r.cells;
  const sub = (rows: number, cols: number, atStart: boolean): Cell[] =>
    all.filter(([y, x]) => (atStart ? y < r.r0 + rows && x < r.c0 + cols : y > r.r0 + r.rows - 1 - rows && x > r.c0 + r.cols - 1 - cols));

  if (n === 1) return roll < 0.4 ? { kind: 'building', footprint: all, lawn: [] } : roll < 0.75 ? { kind: 'park' } : { kind: 'rocks' };

  if (r.rect) {
    if (roll < 0.4) return { kind: 'building', footprint: all, lawn: [] };
    if (roll < 0.7) {
      // Building on part of the block, lawn on the rest (cut across the long side)
      const longRows = r.rows >= r.cols;
      const long = longRows ? r.rows : r.cols;
      const keep = Math.max(1, long - 1);
      const atStart = hash(r.seed, 3) < 0.5;
      const fp = longRows ? sub(keep, r.cols, atStart) : sub(r.rows, keep, atStart);
      return { kind: 'building', footprint: fp, lawn: all.filter((c) => !fp.includes(c)) };
    }
    return roll < 0.9 ? { kind: 'park' } : { kind: 'rocks' };
  }

  // Irregular block: the biggest rectangle inside it gets a building, the rest is lawn
  if (roll < 0.65) {
    const keys = new Set(all.map(cellKey));
    let best: Cell[] = [all[0]];
    for (const [y, x] of all) {
      for (const [h, w] of [[3, 2], [2, 3], [2, 2], [2, 1], [1, 2]]) {
        const rect: Cell[] = [];
        for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) rect.push([y + a, x + b]);
        if (rect.every((c) => keys.has(cellKey(c))) && rect.length > best.length) best = rect.map((c) => all.find((q) => q[0] === c[0] && q[1] === c[1])!);
      }
    }
    return { kind: 'building', footprint: best, lawn: all.filter((c) => !best.includes(c)) };
  }
  return roll < 0.9 ? { kind: 'park' } : { kind: 'rocks' };
}

function centroid(cells: Cell[]): THREE.Vector3 {
  const v = new THREE.Vector3();
  for (const c of cells) v.add(cellToWorld(c, new THREE.Vector3(), 0));
  return v.divideScalar(cells.length);
}

/** A big round autumn tree with a swaying canopy. */
function bigTree(p: THREE.Vector3, seed: number, k: number, solid: THREE.BufferGeometry[], canopy: THREE.BufferGeometry[]): void {
  const trunkH = 0.38 * k;
  solid.push(part(new THREE.CylinderGeometry(0.05 * k, 0.08 * k, trunkH, 7), '#6e4a32', [p.x, p.y + trunkH / 2, p.z]));
  const col = new THREE.Color(AUTUMN[Math.floor(hash(seed, 6) * AUTUMN.length)]);
  const blobs: [number, number, number, number][] = [[0, 0.2, 0, 0.3], [0.14, 0.12, 0.05, 0.22], [-0.12, 0.14, -0.06, 0.22], [0.02, 0.36, -0.02, 0.2]];
  blobs.forEach(([x, y, z, rad], i) => {
    const g = new THREE.IcosahedronGeometry(rad * k, 0);
    g.scale(1, 0.8, 1);
    const geo = part(g, col.clone().offsetHSL(0, 0, (i % 2) * 0.05).getStyle(), [p.x + x * k, p.y + trunkH + y * k, p.z + z * k], [hash(seed, i), hash(seed, i + 5) * 6, 0]);
    const pos = geo.attributes.position;
    const sway = new Float32Array(pos.count);
    for (let v = 0; v < pos.count; v++) sway[v] = Math.max(0, pos.getY(v) - p.y - trunkH * 0.6);
    geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    canopy.push(geo);
  });
}

/** A little garden shed. */
function shed(p: THREE.Vector3, seed: number, out: THREE.BufferGeometry[]): void {
  const wall = ['#a3c4bc', '#e9c46a', '#cdb4db', '#f4a261'][seed % 4];
  out.push(part(new THREE.BoxGeometry(0.26, 0.2, 0.2), wall, [p.x + 0.15, p.y + 0.1, p.z - 0.1]));
  out.push(part(new THREE.BoxGeometry(0.3, 0.025, 0.26), '#6d597a', [p.x + 0.15, p.y + 0.21, p.z - 0.1], [0.15, 0, 0]));
  out.push(part(new THREE.BoxGeometry(0.08, 0.14, 0.01), '#7b4a2e', [p.x + 0.15, p.y + 0.07, p.z + 0.005]));
}

/** Rectangular regions of the same zone (4-connected). */
function findRegions(world: GridWorld): Region[] {
  const seen = new Set<string>();
  const out: Region[] = [];
  for (let r = 0; r < world.height; r++) {
    for (let c = 0; c < world.width; c++) {
      const zone = world.zone([r, c]);
      if (zone === '.' || zone === 'B' || seen.has(cellKey([r, c]))) continue;
      const cells: Cell[] = [];
      const stack: Cell[] = [[r, c]];
      seen.add(cellKey([r, c]));
      while (stack.length) {
        const cur = stack.pop()!;
        cells.push(cur);
        for (const [dr, dc] of NEIGHBOURS) {
          const n: Cell = [cur[0] + dr, cur[1] + dc];
          if (world.inBounds(n) && world.zone(n) === zone && !seen.has(cellKey(n))) {
            seen.add(cellKey(n));
            stack.push(n);
          }
        }
      }
      const rs = cells.map((x) => x[0]), cs = cells.map((x) => x[1]);
      const r0 = Math.min(...rs), c0 = Math.min(...cs);
      const rows = Math.max(...rs) - r0 + 1, cols = Math.max(...cs) - c0 + 1;
      out.push({ zone, cells, r0, c0, rows, cols, rect: rows * cols === cells.length, seed: r0 * 31 + c0 });
    }
  }
  return out;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed, i + 200) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A flat slab over a set of cells, inset only on edges that face outside the set (so it reads as one piece). */
function slab(cells: Cell[], inset: number, h: number, y: number, color: string, out: THREE.BufferGeometry[]): void {
  const keys = new Set(cells.map(cellKey));
  const open = (c: Cell, dr: number, dc: number) => !keys.has(cellKey([c[0] + dr, c[1] + dc]));
  for (const cell of cells) {
    const p = cellToWorld(cell, new THREE.Vector3(), y);
    const x0 = -0.5 + (open(cell, 0, -1) ? inset : 0), x1 = 0.5 - (open(cell, 0, 1) ? inset : 0);
    const z0 = -0.5 + (open(cell, -1, 0) ? inset : 0), z1 = 0.5 - (open(cell, 1, 0) ? inset : 0);
    out.push(part(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), color, [p.x + (x0 + x1) / 2, p.y, p.z + (z0 + z1) / 2]));
  }
}

// ---------------------------------------------------------------- yard dressing

type Dress = (p: THREE.Vector3, seed: number, out: THREE.BufferGeometry[]) => void;

const umbrellaTables: Dress = (p, _s, out) => {
  for (const [x, z, col] of [[-0.2, -0.18, '#e63946'], [0.2, 0.15, '#ffb703'], [-0.15, 0.22, '#2a9d8f']] as const) {
    out.push(part(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 12), '#ffffff', [p.x + x, p.y + 0.09, p.z + z]));
    out.push(part(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6), '#555', [p.x + x, p.y + 0.13, p.z + z]));
    out.push(part(new THREE.ConeGeometry(0.15, 0.07, 10), col, [p.x + x, p.y + 0.28, p.z + z]));
    for (const s of [-1, 1]) out.push(part(new THREE.BoxGeometry(0.05, 0.05, 0.05), '#6b4a32', [p.x + x + s * 0.1, p.y + 0.03, p.z + z]));
  }
};

const fountain: Dress = (p, _s, out) => {
  out.push(part(new THREE.CylinderGeometry(0.26, 0.28, 0.07, 24), '#d6d3cc', [p.x, p.y + 0.04, p.z]));
  out.push(part(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), '#5fb4d9', [p.x, p.y + 0.075, p.z]));
  out.push(part(new THREE.CylinderGeometry(0.03, 0.04, 0.16, 10), '#d6d3cc', [p.x, p.y + 0.14, p.z]));
  out.push(part(new THREE.SphereGeometry(0.06, 12, 8), '#8fd3f0', [p.x, p.y + 0.24, p.z]));
};

const playground: Dress = (p, _s, out) => {
  const x = p.x - 0.12, z = p.z + 0.05;
  out.push(part(new THREE.BoxGeometry(0.14, 0.02, 0.14), '#ffb703', [x, p.y + 0.18, z]));
  for (const [dx, dz] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) out.push(part(new THREE.BoxGeometry(0.02, 0.18, 0.02), '#e63946', [x + dx, p.y + 0.09, z + dz]));
  out.push(part(new THREE.BoxGeometry(0.1, 0.015, 0.3), '#2a9d8f', [x, p.y + 0.1, z + 0.18], [0.62, 0, 0]));
  out.push(part(new THREE.BoxGeometry(0.24, 0.04, 0.24), '#b07a4f', [p.x + 0.2, p.y + 0.02, p.z - 0.18]));
  out.push(part(new THREE.BoxGeometry(0.2, 0.042, 0.2), '#ecd9a0', [p.x + 0.2, p.y + 0.022, p.z - 0.18]));
};

/** Garden signature: a little hexagonal gazebo. */
const gazebo: Dress = (p, seed, out) => {
  const roof = ['#e76f51', '#2a9d8f', '#6d597a'][seed % 3];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    out.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), '#ffffff', [p.x + Math.cos(a) * 0.17, p.y + 0.12, p.z + Math.sin(a) * 0.17]));
  }
  out.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 6), '#d6cfbf', [p.x, p.y + 0.012, p.z]));
  out.push(part(new THREE.ConeGeometry(0.25, 0.14, 6), roof, [p.x, p.y + 0.3, p.z]));
};

const FEATURES: Record<YardKind, Dress> = {
  cafe: umbrellaTables,
  fountain,
  playground,
  garden: gazebo,
};

const EXTRAS = ['tree', 'pond', 'picnic', 'flowers', 'swing', 'birdbath', 'topiary', 'hammock'] as const;
type Extra = (typeof EXTRAS)[number];

const EXTRA_BUILDERS: Record<Extra, Dress> = {
  tree: (p, s, out) => {
    out.push(part(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 7), '#6e4a32', [p.x + 0.1, p.y + 0.11, p.z - 0.05]));
    out.push(part(new THREE.IcosahedronGeometry(0.16, 0), AUTUMN[Math.floor(hash(s, 1) * AUTUMN.length)], [p.x + 0.1, p.y + 0.32, p.z - 0.05]));
    out.push(part(new THREE.IcosahedronGeometry(0.1, 0), '#c07a2e', [p.x - 0.22, p.y + 0.07, p.z + 0.2]));
  },
  pond: (p, _s, out) => {
    out.push(part(new THREE.CylinderGeometry(1, 1, 0.012, 24).scale(0.28, 1, 0.2), '#5fb4d9', [p.x, p.y + 0.02, p.z]));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      out.push(part(new THREE.DodecahedronGeometry(0.035, 0), '#b9b6ad', [p.x + Math.cos(a) * 0.3, p.y + 0.025, p.z + Math.sin(a) * 0.22]));
    }
    out.push(part(new THREE.CylinderGeometry(0.035, 0.035, 0.005, 10), '#6fbf5a', [p.x + 0.06, p.y + 0.03, p.z - 0.04]));
  },
  picnic: (p, _s, out) => {
    out.push(part(new THREE.BoxGeometry(0.28, 0.02, 0.14), '#a0744a', [p.x, p.y + 0.1, p.z]));
    for (const s of [-1, 1]) out.push(part(new THREE.BoxGeometry(0.28, 0.015, 0.05), '#a0744a', [p.x, p.y + 0.06, p.z + s * 0.12]));
    out.push(part(new THREE.BoxGeometry(0.02, 0.1, 0.24), '#8a5a3b', [p.x - 0.1, p.y + 0.05, p.z]));
    out.push(part(new THREE.BoxGeometry(0.02, 0.1, 0.24), '#8a5a3b', [p.x + 0.1, p.y + 0.05, p.z]));
    out.push(part(new THREE.BoxGeometry(0.2, 0.004, 0.1), '#e63946', [p.x, p.y + 0.112, p.z]));
  },
  flowers: (p, s, out) => {
    for (let row = 0; row < 3; row++) {
      out.push(part(new THREE.BoxGeometry(0.6, 0.03, 0.09), '#6b4a32', [p.x, p.y + 0.015, p.z - 0.2 + row * 0.2]));
      for (let i = 0; i < 7; i++) out.push(part(new THREE.SphereGeometry(0.024, 6, 5), FLOWERS[(s + row) % FLOWERS.length], [p.x - 0.26 + i * 0.087, p.y + 0.045, p.z - 0.2 + row * 0.2]));
    }
  },
  swing: (p, _s, out) => {
    for (const x of [-0.18, 0.18]) for (const z of [-0.06, 0.06]) out.push(part(new THREE.BoxGeometry(0.015, 0.3, 0.015), '#3a86ff', [p.x + x, p.y + 0.14, p.z + z], [z > 0 ? -0.2 : 0.2, 0, 0]));
    out.push(part(new THREE.BoxGeometry(0.4, 0.015, 0.015), '#3a86ff', [p.x, p.y + 0.28, p.z]));
    for (const x of [-0.08, 0.08]) {
      out.push(part(new THREE.BoxGeometry(0.005, 0.18, 0.005), '#555', [p.x + x, p.y + 0.19, p.z]));
      out.push(part(new THREE.BoxGeometry(0.07, 0.012, 0.04), '#ffb703', [p.x + x, p.y + 0.1, p.z]));
    }
  },
  birdbath: (p, _s, out) => {
    out.push(part(new THREE.CylinderGeometry(0.025, 0.04, 0.14, 10), '#d6d3cc', [p.x, p.y + 0.07, p.z]));
    out.push(part(new THREE.CylinderGeometry(0.09, 0.05, 0.03, 16), '#d6d3cc', [p.x, p.y + 0.15, p.z]));
    out.push(part(new THREE.CylinderGeometry(0.075, 0.075, 0.005, 16), '#8fd3f0', [p.x, p.y + 0.165, p.z]));
    for (let i = 0; i < 5; i++) out.push(part(new THREE.SphereGeometry(0.06, 8, 6), '#b8862f', [p.x + Math.cos(i * 1.3) * 0.3, p.y + 0.05, p.z + Math.sin(i * 1.3) * 0.3]));
  },
  topiary: (p, _s, out) => {
    for (const [x, z] of [[-0.2, -0.2], [0.2, 0.2], [0.2, -0.2], [-0.2, 0.2]]) {
      out.push(part(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 10), '#b5523b', [p.x + x, p.y + 0.03, p.z + z]));
      out.push(part(new THREE.SphereGeometry(0.07, 12, 10), '#6f7a2c', [p.x + x, p.y + 0.12, p.z + z]));
      out.push(part(new THREE.SphereGeometry(0.045, 10, 8), '#6f7a2c', [p.x + x, p.y + 0.21, p.z + z]));
    }
  },
  hammock: (p, _s, out) => {
    for (const x of [-0.22, 0.22]) {
      out.push(part(new THREE.CylinderGeometry(0.02, 0.03, 0.26, 7), '#6e4a32', [p.x + x, p.y + 0.13, p.z]));
      out.push(part(new THREE.IcosahedronGeometry(0.12, 0), '#d9822b', [p.x + x, p.y + 0.32, p.z]));
    }
    out.push(part(new THREE.CylinderGeometry(1, 1, 0.3, 12, 1, true, 0, Math.PI).scale(0.06, 1, 0.05), '#f4a261', [p.x, p.y + 0.14, p.z], [0, 0, Math.PI / 2]));
  },
};

