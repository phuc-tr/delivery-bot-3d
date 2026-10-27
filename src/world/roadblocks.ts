import * as THREE from 'three';
import { type Cell, cellKey } from '../sim/grid';
import { cellToWorld, easeOutBounce, hash, merge, part, shadowed, vertexColorMat } from './common';

interface Block {
  obj: THREE.Group;
  age: number;
  leaving: boolean;
  seed: number;
}

/** Striped A-frame barriers that drop in with a bounce and shrink away, plus a see-through hover preview. */
export class Roadblocks {
  readonly group = new THREE.Group();
  private readonly blocks = new Map<string, Block>();
  private readonly frame: THREE.BufferGeometry;
  private readonly boardGeo: THREE.BoxGeometry;
  private readonly boardMat: THREE.MeshStandardMaterial[];
  private readonly frameMat = vertexColorMat({ roughness: 0.6 });
  private readonly lampMat = new THREE.MeshStandardMaterial({ color: '#ff8a00', emissive: '#ff6a00', emissiveIntensity: 2 });
  private readonly lampGeo = new THREE.SphereGeometry(0.045, 10, 8);
  /** Translucent barrier shown exactly where a click would place one. */
  private readonly ghost: THREE.Group;
  private readonly ghostMats: THREE.Material[];
  private ghostOn = false;
  private ghostOpacity = 0;

  constructor() {
    const legs: THREE.BufferGeometry[] = [];
    for (const x of [-0.33, 0.33]) {
      for (const s of [-1, 1]) {
        legs.push(part(new THREE.BoxGeometry(0.04, 0.5, 0.04), '#3a3f4b', [x, 0.24, s * 0.08], [s * 0.3, 0, 0]));
      }
      legs.push(part(new THREE.BoxGeometry(0.08, 0.03, 0.26), '#3a3f4b', [x, 0.015, 0]));
    }
    // A cone parked in front of the barrier
    legs.push(part(new THREE.ConeGeometry(0.08, 0.22, 12), '#ff7a1a', [0.26, 0.11, 0.27]));
    legs.push(part(new THREE.CylinderGeometry(0.062, 0.07, 0.03, 12), '#ffffff', [0.26, 0.1, 0.27]));
    legs.push(part(new THREE.BoxGeometry(0.2, 0.02, 0.2), '#ff7a1a', [0.26, 0.01, 0.27]));
    this.frame = merge(legs);

    const stripes = stripeTexture();
    this.boardGeo = new THREE.BoxGeometry(0.82, 0.13, 0.035);
    const plain = new THREE.MeshStandardMaterial({ color: '#f5f5f5' });
    const striped = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 });
    this.boardMat = [plain, plain, plain, plain, striped, striped];

    // Depth-writing transparent copies: the ghost hides its own back faces instead of showing a
    // tangle of see-through legs, and renders after opaque geometry so the road shows through.
    const see = <T extends THREE.Material>(m: T): T => Object.assign(m.clone(), { transparent: true, opacity: 0 });
    const gPlain = see(plain), gStriped = see(striped), gFrame = see(this.frameMat), gLamp = see(this.lampMat);
    this.ghostMats = [gPlain, gStriped, gFrame, gLamp];
    this.ghost = this.build(gFrame, [gPlain, gPlain, gPlain, gPlain, gStriped, gStriped], gLamp);
    this.ghost.visible = false;
    this.group.add(this.ghost);
  }

  /** Show the placement preview on `cell`, or fade it out with null. */
  preview(cell: Cell | null): void {
    this.ghostOn = !!cell;
    if (cell) this.place(this.ghost, cell);
  }

  private build(frameMat: THREE.Material, boardMat: THREE.Material[], lampMat: THREE.Material): THREE.Group {
    const obj = new THREE.Group();
    const frame = new THREE.Mesh(this.frame, frameMat);
    const top = new THREE.Mesh(this.boardGeo, boardMat);
    top.position.set(0, 0.42, 0);
    const low = new THREE.Mesh(this.boardGeo, boardMat);
    low.position.set(0, 0.22, 0);
    low.scale.set(0.9, 0.8, 1);
    const lamp = new THREE.Mesh(this.lampGeo, lampMat);
    lamp.position.set(-0.33, 0.53, 0);
    obj.add(frame, top, low, lamp);
    return obj;
  }

  /** Drop a barrier on its cell at a slightly random (but per-cell stable) angle. */
  private place(obj: THREE.Group, cell: Cell): number {
    cellToWorld(cell, obj.position);
    const seed = cell[0] * 37 + cell[1];
    obj.rotation.y = (hash(seed, 1) - 0.5) * 0.3 + (hash(seed, 2) > 0.5 ? Math.PI / 2 : 0);
    obj.userData.base = obj.position.y;
    return seed;
  }

  sync(cells: Iterable<Cell>): void {
    const live = new Set<string>();
    for (const cell of cells) {
      const key = cellKey(cell);
      live.add(key);
      const existing = this.blocks.get(key);
      if (existing) {
        existing.leaving = false;
        continue;
      }
      this.blocks.set(key, this.spawn(cell));
    }
    for (const [key, b] of this.blocks) if (!live.has(key)) b.leaving = true;
  }

  private spawn(cell: Cell): Block {
    const obj = this.build(this.frameMat, this.boardMat, this.lampMat);
    shadowed(obj, true, false);
    const seed = this.place(obj, cell);
    this.group.add(obj);
    return { obj, age: 0, leaving: false, seed };
  }

  update(dt: number, t: number): void {
    this.lampMat.emissiveIntensity = Math.sin(t * 7) > 0 ? 3.2 : 0.3;

    this.ghostOpacity += ((this.ghostOn ? 1 : 0) - this.ghostOpacity) * Math.min(1, dt * 16);
    this.ghost.visible = this.ghostOpacity > 0.01;
    if (this.ghost.visible) for (const m of this.ghostMats) m.opacity = this.ghostOpacity * 0.6;

    for (const [key, b] of this.blocks) {
      const o = b.obj;
      if (b.leaving) {
        b.age = Math.min(b.age, 0.5) - dt;
        const s = Math.max(0, b.age / 0.5);
        o.scale.setScalar(s);
        o.rotation.y += dt * 6;
        if (s <= 0) {
          this.group.remove(o);
          this.blocks.delete(key);
        }
        continue;
      }
      b.age += dt;
      const k = Math.min(1, b.age / 0.6);
      o.position.y = o.userData.base + (1 - easeOutBounce(k)) * 1.6;
      // Squash on landing
      const land = Math.max(0, 1 - Math.abs(b.age - 0.32) * 8);
      o.scale.set(1 + land * 0.12, 1 - land * 0.18, 1 + land * 0.12);
    }
  }
}

function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 40;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 256, 40);
  x.fillStyle = '#e63946';
  for (let i = -2; i < 12; i++) {
    x.beginPath();
    x.moveTo(i * 28, 40);
    x.lineTo(i * 28 + 14, 40);
    x.lineTo(i * 28 + 34, 0);
    x.lineTo(i * 28 + 20, 0);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
