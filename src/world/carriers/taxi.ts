import * as THREE from 'three';
import { damp, merge, part, shadowed, vertexColorMat } from '../common';
import { Carrier, blinkOn, labelTexture, parcelGeo } from './base';

const WHEEL_R = 0.085;
const PAINT = '#f6c21c';
const WHITE = '#f4f6f8';
const STRIPE = '#22252c';

/** A boxy yellow-and-white city taxi, with parcels strapped to a roof rack. */
export class Taxi extends Carrier {
  override readonly doorGap = 0.8;

  private readonly chassis = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly steer: THREE.Group[] = [];
  private readonly slots: THREE.Mesh[] = [];
  private readonly lamps: THREE.MeshStandardMaterial;
  private readonly blinkers: THREE.MeshStandardMaterial;
  private readonly sign: THREE.MeshStandardMaterial;
  private readonly signPlain: THREE.MeshStandardMaterial;
  private readonly spot: THREE.SpotLight;
  private pitch = 0;
  private hop = 0;

  constructor() {
    super();
    this.group.add(this.chassis);
    const mat = vertexColorMat({ roughness: 0.45 });
    const glass = '#1a2433';
    const box = (w: number, h: number, d: number, c: string, pos: THREE.Vector3Tuple) => part(new THREE.BoxGeometry(w, h, d), c, pos);

    // A boxy three-box sedan: flat panels, square cabin, straight pillars
    const body = merge([
      box(0.5, 0.16, 0.88, PAINT, [0, 0.2, 0]), // lower body
      box(0.44, 0.16, 0.44, WHITE, [0, 0.36, -0.05]), // cabin
      box(0.506, 0.025, 0.886, STRIPE, [0, 0.235, 0]), // belt stripe
      box(0.47, 0.012, 0.42, '#dfe3ea', [0, 0.444, -0.05]), // roof panel line
      // Windscreen and rear screen
      box(0.38, 0.11, 0.006, glass, [0, 0.365, 0.173]),
      box(0.38, 0.1, 0.006, glass, [0, 0.365, -0.273]),
      // Side windows: front and rear door, split by a B-pillar
      ...[-1, 1].flatMap((s) => [
        box(0.006, 0.1, 0.17, glass, [s * 0.221, 0.365, 0.055]),
        box(0.006, 0.1, 0.17, glass, [s * 0.221, 0.365, -0.155]),
        box(0.004, 0.11, 0.84, '#e0ab12', [s * 0.252, 0.17, 0]), // door sill
        box(0.004, 0.012, 0.035, '#c9ced8', [s * 0.252, 0.21, 0.07]), // handles
        box(0.004, 0.012, 0.035, '#c9ced8', [s * 0.252, 0.21, -0.14]),
        box(0.04, 0.03, 0.03, WHITE, [s * 0.245, 0.31, 0.15]), // mirrors
        box(0.012, 0.015, 0.4, '#3a404c', [s * 0.17, 0.458, -0.06]), // roof rails
      ]),
      box(0.5, 0.05, 0.03, '#2b303a', [0, 0.13, 0.445]), // bumpers
      box(0.5, 0.05, 0.03, '#2b303a', [0, 0.13, -0.445]),
      box(0.2, 0.04, 0.006, '#2b303a', [0, 0.2, 0.442]), // grille
      box(0.13, 0.04, 0.006, '#f2f2f2', [0, 0.14, -0.462]), // plate
    ]);
    this.chassis.add(new THREE.Mesh(body, mat));

    // Roof sign, lit at night
    const tex = labelTexture('TAXI', '#ffffff', '#1a1a1a', 256, 80);
    this.sign = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.15 });
    const plain = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d0', emissiveIntensity: 0.1 });
    this.signPlain = plain;
    // Box face order: +x, -x, +y, -y, +z, -z. Lettering front and back only.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), [plain, plain, plain, plain, this.sign, this.sign]);
    sign.position.set(0, 0.48, 0.1);
    this.chassis.add(sign);

    this.lamps = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6d8', emissiveIntensity: 0.6 });
    const tailMat = new THREE.MeshStandardMaterial({ color: '#7a0d12', emissive: '#ff2030', emissiveIntensity: 1.2 });
    this.blinkers = new THREE.MeshStandardMaterial({ color: '#8a5a10', emissive: '#ffa21a', emissiveIntensity: 0 });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.012), this.lamps);
      h.position.set(s * 0.17, 0.205, 0.442);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.012), tailMat);
      tl.position.set(s * 0.18, 0.205, -0.442);
      this.chassis.add(h, tl);
      for (const z of [0.443, -0.443]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.014), this.blinkers);
        b.position.set(s * 0.225, 0.17, z);
        this.chassis.add(b);
      }
    }
    this.spot = new THREE.SpotLight('#fff1cc', 0, 4.5, 0.75, 0.6, 1.2);
    this.spot.position.set(0, 0.22, 0.45);
    this.spot.target.position.set(0, 0, 1.8);
    this.chassis.add(this.spot, this.spot.target);

    const pg = parcelGeo(0.14, 0.08, 0.13);
    for (const s of [[-0.08, 0.463, -0.12], [0.08, 0.463, -0.14], [0, 0.543, -0.13]] as THREE.Vector3Tuple[]) {
      const p = new THREE.Mesh(pg, mat);
      p.position.set(...s);
      p.rotation.y = s[0] * 0.6;
      p.visible = false;
      this.slots.push(p);
      this.chassis.add(p);
    }

    const wheelGeo = merge([
      part(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.06, 16), '#1d2028', [0, 0, 0], [0, 0, Math.PI / 2]),
      part(new THREE.CylinderGeometry(0.05, 0.05, 0.065, 10), '#c7ccd6', [0, 0, 0], [0, 0, Math.PI / 2]),
      part(new THREE.BoxGeometry(0.068, 0.09, 0.018), '#8a93a3'),
      part(new THREE.BoxGeometry(0.068, 0.018, 0.09), '#8a93a3'),
    ]);
    for (const z of [0.27, -0.27]) {
      for (const x of [-0.23, 0.23]) {
        const w = new THREE.Mesh(wheelGeo, mat);
        this.wheels.push(w);
        if (z > 0) {
          const s = new THREE.Group();
          s.position.set(x, WHEEL_R, z);
          s.add(w);
          this.steer.push(s);
          this.group.add(s);
        } else {
          w.position.set(x, WHEEL_R, z);
          this.group.add(w);
        }
      }
    }

    shadowed(this.group, true, false);
  }

  override setNight(n: number): void {
    super.setNight(n);
    this.lamps.emissiveIntensity = 0.6 + n * 3;
    this.sign.emissiveIntensity = 0.15 + n * 1.6;
    this.signPlain.emissiveIntensity = 0.1 + n * 1.2;
    this.spot.intensity = n * 7;
  }

  protected animate(dt: number, t: number): void {
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / WHEEL_R;
    const steer = THREE.MathUtils.clamp(this.turn * 0.1, -0.45, 0.45);
    for (const s of this.steer) s.rotation.y = damp(s.rotation.y, steer, 10, dt);

    // Squat under acceleration, roll a touch in corners, bounce on happy
    this.pitch = damp(this.pitch, THREE.MathUtils.clamp(-this.accel * 0.006, -0.06, 0.06), 6, dt);
    this.chassis.rotation.x = this.pitch;
    this.chassis.rotation.z = damp(this.chassis.rotation.z, THREE.MathUtils.clamp(this.turn * this.speed * 0.012, -0.06, 0.06), 6, dt);
    this.hop = this.expression === 'happy' ? Math.abs(Math.sin(t * 11)) * 0.06 : damp(this.hop, 0, 10, dt);
    const idle = this.expression === 'sleep' ? 0 : Math.sin(t * 34) * 0.0012; // engine idle shake
    this.chassis.position.y = this.hop + idle + Math.abs(Math.sin(t * 15)) * 0.004 * Math.min(1, this.speed);

    this.blinkers.emissiveIntensity = this.stuck && blinkOn(t) ? 2.5 : 0;
    for (let i = 0; i < this.slots.length; i++) this.slots[i].visible = i < this.cargo;
  }
}
