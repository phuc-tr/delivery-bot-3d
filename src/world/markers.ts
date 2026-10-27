import * as THREE from 'three';
import { type Cell, cellKey } from '../sim/grid';
import { cellToWorld, damp, easeOutBack, merge, part, vertexColorMat } from './common';

interface Marker {
  obj: THREE.Object3D;
  base: THREE.Vector3;
  show: number;
  want: boolean;
  phase: number;
}

const BADGE_COLORS = ['#ff4757', '#ff8c42', '#ffc93c', '#7bd389', '#4dabf7'];

/** Floating pins for pending orders, numbered coins for the delivery sequence, and the stuck "!". */
export class Markers {
  readonly group = new THREE.Group();
  private readonly pins = new Map<string, Marker>();
  private readonly badges = new Map<string, Marker & { n: number }>();
  private readonly pinGeo: THREE.BufferGeometry;
  private readonly pinMat = vertexColorMat({ flatShading: false, roughness: 0.35, emissive: '#ff9f1c', emissiveIntensity: 0.25 });
  private readonly coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 28).rotateX(Math.PI / 2);
  private readonly faceGeo = new THREE.CircleGeometry(0.17, 28);
  private readonly coinMats = new Map<number, { rim: THREE.Material; face: THREE.Material }>();
  readonly alert: THREE.Group;
  private alertShow = 0;
  private readonly camPos = new THREE.Vector3();

  constructor() {
    // Map pin: sphere head + cone tip, with a little white dot
    this.pinGeo = merge([
      part(new THREE.SphereGeometry(0.16, 20, 14), '#ffa62b', [0, 0.26, 0]),
      part(new THREE.ConeGeometry(0.115, 0.28, 20), '#ffa62b', [0, 0.1, 0], [Math.PI, 0, 0]),
      part(new THREE.SphereGeometry(0.065, 14, 10), '#fff6e0', [0, 0.27, 0.12]),
      part(new THREE.SphereGeometry(0.065, 14, 10), '#fff6e0', [0, 0.27, -0.12]),
    ]);
    this.alert = this.buildAlert();
    this.group.add(this.alert);
  }

  /** Pending pins: one per house that has orders waiting (count scales the pin a little). */
  setPending(cells: Cell[]): void {
    const counts = new Map<string, { cell: Cell; n: number }>();
    for (const c of cells) {
      const k = cellKey(c);
      counts.set(k, { cell: c, n: (counts.get(k)?.n ?? 0) + 1 });
    }
    for (const [k, m] of this.pins) m.want = counts.has(k);
    for (const [k, { cell, n }] of counts) {
      let m = this.pins.get(k);
      if (!m) {
        const obj = new THREE.Mesh(this.pinGeo, this.pinMat);
        obj.castShadow = true;
        m = { obj, base: cellToWorld(cell, new THREE.Vector3(), 1.15), show: 0, want: true, phase: Math.random() * 6 };
        this.pins.set(k, m);
        this.group.add(obj);
      }
      m.want = true;
      m.obj.userData.size = 1 + (n - 1) * 0.15;
    }
  }

  /** Numbered coins over the houses in delivery order. */
  setSequence(cells: Cell[]): void {
    const wanted = new Map<string, { cell: Cell; n: number }>();
    cells.forEach((c, i) => {
      const k = cellKey(c);
      if (!wanted.has(k)) wanted.set(k, { cell: c, n: i + 1 });
    });
    for (const [k, b] of this.badges) {
      const w = wanted.get(k);
      b.want = !!w && w.n === b.n;
    }
    for (const [k, { cell, n }] of wanted) {
      const b = this.badges.get(k);
      if (b && b.n === n) continue;
      if (b) {
        // Number changed (replan): drop the old coin, spawn a fresh one.
        b.want = false;
        this.badges.set(`${k}#old${Math.random()}`, b);
      }
      const mats = this.coinMat(n);
      const obj = new THREE.Group();
      const rim = new THREE.Mesh(this.coinGeo, mats.rim);
      rim.castShadow = true;
      const front = new THREE.Mesh(this.faceGeo, mats.face);
      front.position.z = 0.026;
      const back = new THREE.Mesh(this.faceGeo, mats.face);
      back.position.z = -0.026;
      back.rotation.y = Math.PI;
      obj.add(rim, front, back);
      this.group.add(obj);
      this.badges.set(k, { obj, base: cellToWorld(cell, new THREE.Vector3(), 1.62), show: 0, want: true, phase: n, n });
    }
  }

  setAlert(on: boolean): void {
    this.alert.userData.want = on;
  }

  update(dt: number, t: number, camera: THREE.Camera, robotPos: THREE.Vector3): void {
    camera.getWorldPosition(this.camPos);

    for (const [k, m] of this.pins) {
      m.show = damp(m.show, m.want ? 1 : 0, m.want ? 6 : 10, dt);
      if (!m.want && m.show < 0.02) {
        this.group.remove(m.obj);
        this.pins.delete(k);
        continue;
      }
      const s = easeOutBack(Math.min(1, m.show)) * (m.obj.userData.size ?? 1);
      m.obj.scale.setScalar(Math.max(0.001, s));
      m.obj.position.copy(m.base).setY(m.base.y + Math.sin(t * 1.4 + m.phase) * 0.04);
      m.obj.rotation.y = t * 0.6 + m.phase;
    }

    for (const [k, b] of this.badges) {
      b.show = damp(b.show, b.want ? 1 : 0, b.want ? 7 : 12, dt);
      if (!b.want && b.show < 0.02) {
        this.group.remove(b.obj);
        this.badges.delete(k);
        continue;
      }
      b.obj.scale.setScalar(Math.max(0.001, easeOutBack(Math.min(1, b.show))));
      b.obj.position.copy(b.base).setY(b.base.y + Math.sin(t * 1.3 + b.phase) * 0.03);
      // Face the camera like a coin standing on its edge, with an occasional flip
      b.obj.lookAt(this.camPos.x, b.obj.position.y, this.camPos.z);
      const flip = (t * 0.35 + b.phase * 0.27) % 1;
      if (flip < 0.12) b.obj.rotateY((flip / 0.12) * Math.PI * 2);
    }

    const a = this.alert;
    this.alertShow = damp(this.alertShow, a.userData.want ? 1 : 0, 9, dt);
    a.visible = this.alertShow > 0.02;
    if (a.visible) {
      a.position.copy(robotPos).setY(robotPos.y + 1.35 + Math.sin(t * 5) * 0.05);
      a.lookAt(this.camPos.x, a.position.y, this.camPos.z);
      a.rotateZ(Math.sin(t * 14) * 0.12);
      a.scale.setScalar(easeOutBack(Math.min(1, this.alertShow)) * 0.9);
    }
  }

  private coinMat(n: number): { rim: THREE.Material; face: THREE.Material } {
    let mats = this.coinMats.get(n);
    if (!mats) {
      const color = BADGE_COLORS[(n - 1) % BADGE_COLORS.length];
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d')!;
      x.fillStyle = color;
      x.beginPath();
      x.arc(64, 64, 64, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.9)';
      x.lineWidth = 8;
      x.beginPath();
      x.arc(64, 64, 52, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = '#ffffff';
      x.font = '800 74px "Fredoka", "Trebuchet MS", system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(n), 64, 70);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const face = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.4 });
      const rim = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 });
      mats = { rim, face };
      this.coinMats.set(n, mats);
    }
    return mats;
  }

  private buildAlert(): THREE.Group {
    const g = new THREE.Group();
    const bubble = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.08, 28).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 0.6, roughness: 0.4 }),
    );
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 3).rotateZ(Math.PI), bubble.material);
    tail.position.set(0, -0.23, 0);
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.6 });
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 8), white);
    bar.position.set(0, 0.04, 0.05);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), white);
    dot.position.set(0, -0.11, 0.05);
    const bar2 = bar.clone();
    bar2.position.z = -0.05;
    const dot2 = dot.clone();
    dot2.position.z = -0.05;
    g.add(bubble, tail, bar, dot, bar2, dot2);
    g.visible = false;
    g.userData.want = false;
    return g;
  }
}
