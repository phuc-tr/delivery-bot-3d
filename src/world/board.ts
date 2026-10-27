import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Cell, GridWorld } from '../sim/grid';
import type { ClickIntent } from '../sim/system';
import { GRID_H, GRID_W, PLAZA_TOP, TILE_TOP, cellToWorld, hash, worldToCell } from './common';

const PAVING = ['#ddd5c6', '#d8cfbf', '#e2dacc', '#d5ccbb'];
const ASPHALT = ['#80848b', '#7d8188', '#83878e', '#7f838a'];
const CURSOR_COLORS: Record<ClickIntent, string> = {
  order: '#ffb547',
  block: '#ff5a4f',
  unblock: '#ffffff',
  none: '#8b93a8',
};

/** The floating island, paving tiles, grass, and tile picking. */
export class Board {
  readonly group = new THREE.Group();
  readonly cursor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_TOP);
  private readonly hit = new THREE.Vector3();
  private readonly cursorTarget = new THREE.Vector3();
  private cursorShown = false;

  constructor(world: GridWorld) {
    this.group.add(this.buildBase(), this.buildTiles(world));
    this.cursor = this.buildCursor();
    this.group.add(this.cursor);
  }

  /** The town plate: a low pavement slab with a curb, sitting on the countryside. */
  private buildBase(): THREE.Object3D {
    const w = GRID_W + 1.4, d = GRID_H + 1.4;
    const plate = new THREE.Mesh(
      new RoundedBoxGeometry(w, 0.3, d, 3, 0.12),
      new THREE.MeshStandardMaterial({ color: '#c3c5c9', roughness: 0.9 }),
    );
    plate.position.y = -0.12;
    return plate;
  }

  private buildTiles(world: GridWorld): THREE.InstancedMesh {
    const cells: Cell[] = [];
    for (let r = 0; r < world.height; r++) {
      for (let c = 0; c < world.width; c++) {
        const z = world.zone([r, c]);
        if (z === '.' || z === 'B') cells.push([r, c]);
      }
    }
    const geo = new THREE.BoxGeometry(1.0, 0.14, 1.0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const p = new THREE.Vector3();
    cells.forEach((cell, i) => {
      cellToWorld(cell, p, TILE_TOP - 0.07);
      m.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
      // Streets are asphalt; the market square, park path and planters get stone paving
      const street = world.zone(cell) === '.';
      const pal = street ? ASPHALT : PAVING;
      mesh.setColorAt(i, col.set(pal[Math.floor(hash(cell[1], cell[0]) * pal.length)]));
    });
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildCursor() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { color: { value: new THREE.Color(CURSOR_COLORS.none) }, time: { value: 0 }, opacity: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform float time, opacity;
        varying vec2 vUv;
        float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        void main() {
          float d = sdRoundBox(vUv - 0.5, vec2(0.46), 0.1);
          float ring = smoothstep(0.035, 0.0, abs(d + 0.025));
          float fill = smoothstep(0.0, -0.02, d) * 0.16;
          float pulse = 0.85 + 0.15 * sin(time * 2.5);
          gl_FragColor = vec4(color * 2.2, (ring * pulse + fill) * opacity);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    return mesh;
  }

  /** Cell under the pointer ray, or null if it misses the grid. */
  pick(ray: THREE.Ray, world: GridWorld): Cell | null {
    if (!ray.intersectPlane(this.pickPlane, this.hit)) return null;
    const cell = worldToCell(this.hit.x, this.hit.z);
    return world.inBounds(cell) ? cell : null;
  }

  setCursor(cell: Cell | null, intent: ClickIntent): void {
    this.cursorShown = !!cell;
    if (!cell) return;
    cellToWorld(cell, this.cursorTarget, (intent === 'order' ? PLAZA_TOP : TILE_TOP) + 0.012);
    this.cursor.material.uniforms.color.value.set(CURSOR_COLORS[intent]);
    if (this.cursor.material.uniforms.opacity.value < 0.05) this.cursor.position.copy(this.cursorTarget);
  }

  update(dt: number, t: number): void {
    const u = this.cursor.material.uniforms;
    u.time.value = t;
    u.opacity.value += ((this.cursorShown ? 1 : 0) - u.opacity.value) * Math.min(1, dt * 14);
    this.cursor.position.lerp(this.cursorTarget, Math.min(1, dt * 22));
  }
}
