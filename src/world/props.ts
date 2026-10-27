import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { type Cell, type GridWorld, sameCell } from '../sim/grid';
import { GRID_H, GRID_W, PLAZA_TOP, TILE_TOP, cellToWorld, damp, hash, merge, part, shadowed, vertexColorMat } from './common';

const HOUSE_STYLES = [
  { wall: '#f7efe2', roof: '#e2574c', trim: '#c9b79c' },
  { wall: '#fde3a7', roof: '#4f7cac', trim: '#d9b26f' },
  { wall: '#dff2e1', roof: '#e98a3a', trim: '#a8c7ab' },
  { wall: '#f6d6d6', roof: '#5b5f97', trim: '#d3a9a9' },
  { wall: '#e4ecf7', roof: '#2f9c95', trim: '#aebdd2' },
  { wall: '#fff6d6', roof: '#9b5de5', trim: '#d8cc9a' },
];

export interface House {
  cell: Cell;
  index: number;
  group: THREE.Group;
  chimney: THREE.Vector3;
  door: THREE.Vector3;
  hover: number;
  bounce: number;
}

/** Static scenery: trees, houses, supermarket, lamps, clouds, water. */
export class Props {
  readonly group = new THREE.Group();
  readonly houses: House[] = [];
  readonly padMat: THREE.MeshStandardMaterial;
  private readonly windowMat: THREE.MeshStandardMaterial;
  private readonly lampMat: THREE.MeshStandardMaterial;
  private readonly signMat: THREE.MeshStandardMaterial;
  private glassMat?: THREE.MeshStandardMaterial;
  private readonly clouds: THREE.Object3D[] = [];
  private readonly time = { value: 0 };
  private night = 0;
  private padPulse = 0;

  constructor(world: GridWorld) {
    this.windowMat = new THREE.MeshStandardMaterial({ color: '#a9d6ef', emissive: '#ffc76a', emissiveIntensity: 0, roughness: 0.3 });
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd27a', emissiveIntensity: 0.2 });
    this.padMat = new THREE.MeshStandardMaterial({ color: '#173a4a', emissive: '#2ee6ff', emissiveIntensity: 0.6, roughness: 0.4 });
    const sign = signTexture();
    this.signMat = new THREE.MeshStandardMaterial({ map: sign, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.15 });

    world.deliveryLocations.forEach((cell, i) => this.group.add(this.buildHouse(world, cell, i)));
    this.group.add(this.buildSupermarket(world));
    this.group.add(this.buildLamps());
    this.group.add(this.buildClouds());
  }

  setNight(n: number): void {
    this.night = n;
    this.windowMat.emissiveIntensity = n * 2.2;
    this.lampMat.emissiveIntensity = 0.2 + n * 3.5;
    this.signMat.emissiveIntensity = 0.15 + n * 1.3;
    if (this.glassMat) this.glassMat.emissiveIntensity = 0.2 + n * 1.4;
  }

  /** Pad glow pulses while the robot is loading at base. */
  pulsePad(): void {
    this.padPulse = 1;
  }

  houseAt(cell: Cell | null): House | undefined {
    return cell ? this.houses.find((h) => sameCell(h.cell, cell)) : undefined;
  }

  update(dt: number, t: number, hovered: House | undefined): void {
    this.time.value = t;
    for (const h of this.houses) {
      h.hover = damp(h.hover, h === hovered ? 1 : 0, 12, dt);
      h.bounce = Math.max(0, h.bounce - dt * 2.2);
      const b = Math.sin(h.bounce * Math.PI * 3) * h.bounce;
      h.group.position.y = PLAZA_TOP + h.hover * 0.08;
      h.group.scale.set(1 + h.hover * 0.04 - b * 0.08, 1 + h.hover * 0.04 + b * 0.14, 1 + h.hover * 0.04 - b * 0.08);
    }
    this.padPulse = Math.max(0, this.padPulse - dt * 0.6);
    this.padMat.emissiveIntensity = 0.6 + this.night * 0.8 + this.padPulse * (1.5 + Math.sin(t * 10) * 0.8);
    for (const c of this.clouds) {
      c.position.x += dt * c.userData.speed;
      if (c.position.x > 70) c.position.x = -70;
    }
  }

  private buildHouse(world: GridWorld, cell: Cell, index: number): THREE.Group {
    // Neighbouring houses use different styles so a terrace reads as separate homes
    const style = HOUSE_STYLES[(index * 7 + cell[0]) % HOUSE_STYLES.length];
    const v = 0.9 + hash(index, 40) * 0.2; // per-house proportions
    // Wide enough that houses in a row stand shoulder to shoulder, like a terrace
    const W = 0.86, D = 0.6, H = 0.42 * v;

    const roof = new THREE.CylinderGeometry(0.56, 0.56, D + 0.1, 3, 1);
    roof.scale(1.0, 1, 0.62 * v);
    const body = merge([
      part(new THREE.BoxGeometry(W, H, D), style.wall, [0, H / 2, 0]),
      part(new THREE.BoxGeometry(W + 0.04, 0.05, D + 0.04), style.trim, [0, 0.025, 0]),
      part(roof, style.roof, [0, H + 0.13 * v, 0], [-Math.PI / 2, 0, 0]),
      part(new THREE.BoxGeometry(0.11, 0.3, 0.11), '#9c6b53', [0.18, H + 0.22, -0.1]),
      part(new THREE.BoxGeometry(0.14, 0.04, 0.14), '#5b4038', [0.18, H + 0.38, -0.1]),
      part(new THREE.BoxGeometry(0.16, 0.26, 0.03), '#7b4a2e', [-0.13, 0.13, D / 2 + 0.01]),
      part(new THREE.SphereGeometry(0.015, 6, 4), '#ffd166', [-0.08, 0.13, D / 2 + 0.03]),
      part(new THREE.BoxGeometry(0.24, 0.025, 0.12), '#b9a68a', [-0.13, 0.012, D / 2 + 0.07]),
      // Window frames
      part(new THREE.BoxGeometry(0.2, 0.17, 0.02), style.trim, [0.15, H * 0.55, D / 2 + 0.005]),
      part(new THREE.BoxGeometry(0.02, 0.17, D * 0.5), style.trim, [W / 2 + 0.005, H * 0.55, 0]),
      part(new THREE.BoxGeometry(0.02, 0.17, D * 0.5), style.trim, [-W / 2 - 0.005, H * 0.55, 0]),
    ]);
    const windows = merge([
      part(new THREE.BoxGeometry(0.15, 0.12, 0.02), '#ffffff', [0.15, H * 0.55, D / 2 + 0.012]),
      part(new THREE.BoxGeometry(0.02, 0.12, D * 0.38), '#ffffff', [W / 2 + 0.012, H * 0.55, 0]),
      part(new THREE.BoxGeometry(0.02, 0.12, D * 0.38), '#ffffff', [-W / 2 - 0.012, H * 0.55, 0]),
    ]);

    const group = new THREE.Group();
    group.add(shadowed(new THREE.Mesh(body, houseMat())), new THREE.Mesh(windows, this.windowMat));
    // Front door faces the street the house sits on
    const street = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).find(([dr, dc]) => {
      const n: Cell = [cell[0] + dr, cell[1] + dc];
      return world.inBounds(n) && world.zone(n) === '.';
    }) ?? [1, 0];
    group.rotation.y = Math.atan2(street[1], street[0]);
    cellToWorld(cell, group.position, PLAZA_TOP);

    const chimney = new THREE.Vector3(0.18, H + 0.42, -0.1).applyEuler(group.rotation).add(group.position);
    const door = new THREE.Vector3(-0.13, 0.15, D / 2 + 0.1).applyEuler(group.rotation).add(group.position);
    this.houses.push({ cell, index, group, chimney, door, hover: 0, bounce: 0 });
    return group;
  }

  /** The supermarket: a big shopfront on the market block, facing the square and the loading pad. */
  private buildSupermarket(world: GridWorld): THREE.Group {
    const cells: Cell[] = [];
    for (let r = 0; r < world.height; r++) for (let c = 0; c < world.width; c++) if (world.zone([r, c]) === 'M') cells.push([r, c]);
    const rows = cells.map((x) => x[0]), cols = cells.map((x) => x[1]);
    const r0 = Math.min(...rows), r1 = Math.max(...rows), c0 = Math.min(...cols), c1 = Math.max(...cols);
    const origin = cellToWorld([(r0 + r1) / 2, (c0 + c1) / 2], new THREE.Vector3(), PLAZA_TOP);
    const g = new THREE.Group();
    g.position.copy(origin);

    const W = c1 - c0 + 1 - 0.2, D = r1 - r0 + 1 - 0.2, H = 1.05;
    const green = '#2fbf71';
    const stripes: THREE.BufferGeometry[] = [];
    const n = Math.round(W / 0.24);
    for (let i = 0; i < n; i++) {
      stripes.push(part(new THREE.BoxGeometry(W / n, 0.03, 0.5), i % 2 ? '#ffffff' : green, [-W / 2 + W / (2 * n) + (i * W) / n, 0.62, D / 2 + 0.2], [0.42, 0, 0]));
    }
    const body = merge([
      part(new RoundedBoxGeometry(W, H, D, 2, 0.05), '#f4f1ea', [0, H / 2, 0]),
      part(new THREE.BoxGeometry(W + 0.12, 0.1, D + 0.12), green, [0, H + 0.05, 0]),
      part(new THREE.BoxGeometry(W + 0.06, 0.08, D + 0.06), '#cfc7b8', [0, 0.04, 0]),
      // Shopfront mullions and the entrance frame
      ...Array.from({ length: 7 }, (_, i) => -W / 2 + 0.25 + i * ((W - 0.5) / 6)).map((x) => part(new THREE.BoxGeometry(0.04, 0.5, 0.03), '#6b7280', [x, 0.3, D / 2 + 0.02])),
      part(new THREE.BoxGeometry(0.7, 0.06, 0.08), green, [0, 0.58, D / 2 + 0.04]),
      ...stripes,
      // Rooftop plant and skylights
      part(new THREE.BoxGeometry(0.45, 0.2, 0.32), '#b8c0cc', [-W / 2 + 0.45, H + 0.2, -D / 2 + 0.35]),
      part(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), '#6b7280', [-W / 2 + 0.45, H + 0.32, -D / 2 + 0.35]),
      part(new THREE.BoxGeometry(0.4, 0.16, 0.3), '#b8c0cc', [W / 2 - 0.45, H + 0.18, -D / 2 + 0.35]),
      ...[-0.5, 0.5].map((x) => part(new THREE.BoxGeometry(0.45, 0.06, 0.35), '#9fd8f0', [x, H + 0.12, 0.05])),
      // Shopping carts by the door
      ...[0, 1, 2].map((i) => part(new THREE.BoxGeometry(0.1, 0.08, 0.14), '#c9ced6', [0.45 + i * 0.07, 0.12, D / 2 + 0.25])),
      // Crates of produce on display
      ...[-W / 2 + 0.2, -W / 2 + 0.5, W / 2 - 0.5, W / 2 - 0.2].map((x, i) => part(new THREE.BoxGeometry(0.26, 0.12, 0.2), ['#e63946', '#ffb703', '#7fb800', '#f77f00'][i], [x, 0.1, D / 2 + 0.22])),
    ]);
    g.add(shadowed(new THREE.Mesh(body, vertexColorMat({ roughness: 0.7 }))));

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.4, 0.5, 0.02),
      new THREE.MeshStandardMaterial({ color: '#9fd8f0', emissive: '#bfe8ff', emissiveIntensity: 0.2, roughness: 0.08, metalness: 0.3 }),
    );
    glass.position.set(0, 0.3, D / 2 + 0.005);
    this.glassMat = glass.material;
    g.add(glass);

    // Big rooftop sign, readable from across town
    const sign = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, (W - 0.2) / 4.4, 0.08), [
      ...Array(4).fill(new THREE.MeshStandardMaterial({ color: '#1f6f45' })),
      this.signMat,
      new THREE.MeshStandardMaterial({ color: '#1f6f45' }),
    ]);
    sign.position.set(0, H + 0.38, D / 2 - 0.2);
    for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), new THREE.MeshStandardMaterial({ color: '#2f3542' }));
      leg.position.set(x, H + 0.1, D / 2 - 0.22);
      g.add(leg);
    }
    shadowed(sign);
    g.add(sign);

    // Charging / loading pad at the base cell, out in the square
    const padPos = cellToWorld(world.baseLocation, new THREE.Vector3(), TILE_TOP + 0.005).sub(origin);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.025, 32), this.padMat);
    pad.position.copy(padPos);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.018, 6, 40),
      new THREE.MeshStandardMaterial({ color: '#0b1c24', emissive: '#7af3ff', emissiveIntensity: 1.6 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(padPos).setY(padPos.y + 0.02);
    pad.receiveShadow = true;
    g.add(pad, ring);
    return g;
  }

  /** Street lamps around the island rim. */
  private buildLamps(): THREE.Group {
    const spots: [number, number][] = [];
    for (let x = -9; x <= 9; x += 4.5) spots.push([x, -GRID_H / 2 - 0.35], [x, GRID_H / 2 + 0.35]);
    for (let z = -4; z <= 4; z += 4) spots.push([-GRID_W / 2 - 0.35, z], [GRID_W / 2 + 0.35, z]);

    const post = merge([
      part(new THREE.CylinderGeometry(0.03, 0.045, 0.9, 6), '#2f3542', [0, 0.45, 0]),
      part(new THREE.CylinderGeometry(0.08, 0.1, 0.06, 8), '#2f3542', [0, 0.03, 0]),
      part(new THREE.ConeGeometry(0.11, 0.08, 8), '#2f3542', [0, 1.02, 0]),
    ]);
    const bulb = new THREE.SphereGeometry(0.075, 12, 8);
    const g = new THREE.Group();
    const posts = new THREE.InstancedMesh(post, vertexColorMat({ roughness: 0.5, metalness: 0.4 }), spots.length);
    const bulbs = new THREE.InstancedMesh(bulb, this.lampMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      posts.setMatrixAt(i, m.makeTranslation(x, 0, z));
      bulbs.setMatrixAt(i, m.makeTranslation(x, 0.95, z));
    });
    posts.castShadow = true;
    g.add(posts, bulbs);
    return g;
  }

  private buildClouds(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 9; i++) {
      const puffs: THREE.BufferGeometry[] = [];
      const n = 3 + Math.floor(hash(i, 50) * 3);
      for (let j = 0; j < n; j++) {
        const r = 0.7 + hash(i, j + 51) * 0.7;
        puffs.push(part(new THREE.IcosahedronGeometry(r, 1), '#ffffff', [j * 0.9 - n * 0.45, hash(i, j + 60) * 0.4, hash(i, j + 70) * 0.6 - 0.3]));
      }
      const cloud = new THREE.Mesh(merge(puffs), mat);
      cloud.scale.set(1, 0.6, 0.8);
      // Keep them around the island, not between it and the camera.
      const side = i % 2 ? 1 : -1;
      // High over the countryside, mostly beyond the town so they don't block the view
      cloud.position.set(-60 + hash(i, 80) * 120, 14 + hash(i, 81) * 10, side > 0 ? -20 - hash(i, 82) * 40 : 25 + hash(i, 83) * 30);
      cloud.scale.multiplyScalar(2.2);
      cloud.userData.speed = 0.25 + hash(i, 84) * 0.35;
      this.clouds.push(cloud);
      g.add(cloud);
    }
    return g;
  }

}

let sharedHouseMat: THREE.MeshStandardMaterial | null = null;
const houseMat = () => (sharedHouseMat ??= vertexColorMat({ roughness: 0.8 }));

function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 116;
  const x = c.getContext('2d')!;
  const draw = () => {
    x.fillStyle = '#1f6f45';
    x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#ffe066';
    x.lineWidth = 8;
    x.strokeRect(8, 8, c.width - 16, c.height - 16);
    x.fillStyle = '#ffe066';
    x.font = '700 58px "Fredoka", "Trebuchet MS", system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('SUPER MARKET', c.width / 2, c.height / 2 + 4, c.width - 44);
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // Redraw once the web font arrives.
  void document.fonts?.ready.then(() => {
    draw();
    t.needsUpdate = true;
  });
  return t;
}
