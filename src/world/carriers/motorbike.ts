import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { damp, merge, part, shadowed, vertexColorMat } from '../common';
import { Carrier, blinkOn, labelTexture, parcelGeo, stick } from './base';

export interface BikeStyle {
  paint: string;
  jacket: string;
  helmet: string;
  box: { size: THREE.Vector3Tuple; color: string; label: string; labelColor: string };
  /** Parcel stack spots, in cargo order. */
  slots: THREE.Vector3Tuple[];
}

export const GROB: BikeStyle = {
  paint: '#262b36',
  jacket: '#00b14f',
  helmet: '#00a246',
  box: { size: [0.22, 0.2, 0.2], color: '#00b14f', label: 'Grob', labelColor: '#ffffff' },
  slots: [
    [0, 0.205, 0.07], // on the footboard, between the rider's feet
    [0, 0.576, -0.31],
    [0, 0.651, -0.31],
  ],
};

export const SHOPOO: BikeStyle = {
  paint: '#eef0f4',
  jacket: '#ee4d2d',
  helmet: '#f2683f',
  box: { size: [0.27, 0.27, 0.25], color: '#ee4d2d', label: 'Shopoo', labelColor: '#ffffff' },
  slots: [
    [0, 0.646, -0.31],
    [0, 0.721, -0.31],
    [0, 0.796, -0.31],
  ],
};

const WHEEL_R = 0.1;
const REAR: THREE.Vector3Tuple = [0, WHEEL_R, -0.25];
const X = new THREE.Vector3(1, 0, 0);

/** A Vietnamese step-through scooter with a rider and a delivery box on the rack. */
export class Motorbike extends Carrier {
  override readonly doorGap = 0.72;

  /** Rolls into turns, around the tyres' contact line. */
  private readonly tilt = new THREE.Group();
  /** Pitches for wheelies, around the rear hub. */
  private readonly chassis = new THREE.Group();
  private readonly rider = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly fork = new THREE.Group();
  private readonly slots: THREE.Mesh[] = [];
  private readonly lamps: THREE.MeshStandardMaterial;
  private readonly blinkers: THREE.MeshStandardMaterial;
  private readonly spot: THREE.SpotLight;
  private readonly pivot = new THREE.Vector3(...REAR);
  private readonly tmp = new THREE.Vector3();
  private roll = 0;
  private wheelie = 0;

  constructor(style: BikeStyle) {
    super();
    this.group.add(this.tilt);
    this.tilt.add(this.chassis);
    const mat = vertexColorMat({ roughness: 0.55, flatShading: false });
    const { paint } = style;

    const body = merge([
      part(new THREE.BoxGeometry(0.15, 0.03, 0.26), '#30343d', [0, 0.19, 0.05]), // footboard
      part(new RoundedBoxGeometry(0.18, 0.15, 0.32, 2, 0.05), paint, [0, 0.27, -0.16]), // rear cowl
      part(new RoundedBoxGeometry(0.15, 0.045, 0.27, 2, 0.02), '#1c1f26', [0, 0.36, -0.13]), // seat
      part(new RoundedBoxGeometry(0.18, 0.27, 0.05, 2, 0.02), paint, [0, 0.32, 0.2], [-0.25, 0, 0]), // leg shield
      part(new RoundedBoxGeometry(0.12, 0.08, 0.09, 2, 0.03), paint, [0, 0.5, 0.24]), // headset
      part(new THREE.BoxGeometry(0.16, 0.012, 0.15), '#9aa1ad', [0, 0.37, -0.32]), // rack
      part(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 8), '#a7adb8', [0.08, 0.13, -0.19], [Math.PI / 2, 0, 0]), // exhaust
      part(new THREE.BoxGeometry(0.06, 0.02, 0.18), paint, [0, 0.2, -0.27]), // rear fender
    ]);
    this.chassis.add(new THREE.Mesh(body, mat));

    // Steering column, front wheel and bars turn together
    this.fork.position.set(0, 0, 0.26);
    const forkGeo = merge([
      stick([0, WHEEL_R, 0], [0, 0.48, -0.06], 0.012, '#7c8492'),
      part(new THREE.BoxGeometry(0.06, 0.025, 0.14), paint, [0, 0.21, 0]), // front fender
      part(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6), '#1c1f26', [0, 0.53, -0.04], [0, 0, Math.PI / 2]),
      stick([0.11, 0.53, -0.04], [0.12, 0.62, -0.05], 0.005, '#7c8492'),
      stick([-0.11, 0.53, -0.04], [-0.12, 0.62, -0.05], 0.005, '#7c8492'),
      part(new THREE.BoxGeometry(0.045, 0.03, 0.01), '#cfd6e2', [0.12, 0.63, -0.05]),
      part(new THREE.BoxGeometry(0.045, 0.03, 0.01), '#cfd6e2', [-0.12, 0.63, -0.05]),
    ]);
    this.fork.add(new THREE.Mesh(forkGeo, mat));
    this.chassis.add(this.fork);

    // Lights: headlamp, tail lamp, four blinkers for hazards
    this.lamps = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6d8', emissiveIntensity: 0.6 });
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), this.lamps);
    head.position.set(0, 0.5, 0.286);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.03, 0.01),
      new THREE.MeshStandardMaterial({ color: '#7a0d12', emissive: '#ff2030', emissiveIntensity: 1.2 }),
    );
    tail.position.set(0, 0.3, -0.325);
    this.blinkers = new THREE.MeshStandardMaterial({ color: '#8a5a10', emissive: '#ffa21a', emissiveIntensity: 0 });
    for (const [x, y, z] of [[0.07, 0.5, 0.285], [-0.07, 0.5, 0.285], [0.07, 0.3, -0.32], [-0.07, 0.3, -0.32]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 0.018), this.blinkers);
      b.position.set(x, y, z);
      this.chassis.add(b);
    }
    this.spot = new THREE.SpotLight('#fff1cc', 0, 4, 0.6, 0.6, 1.2);
    this.spot.position.set(0, 0.5, 0.3);
    this.spot.target.position.set(0, 0, 1.8);
    this.chassis.add(head, tail, this.spot, this.spot.target);

    // Delivery box with decals on both flanks and the back
    const [bw, bh, bd] = style.box.size;
    const box = new THREE.Mesh(
      new RoundedBoxGeometry(bw, bh, bd, 2, 0.02),
      new THREE.MeshStandardMaterial({ color: style.box.color, roughness: 0.6 }),
    );
    box.position.set(0, 0.376 + bh / 2, -0.31);
    const decal = new THREE.MeshBasicMaterial({ map: labelTexture(style.box.label, style.box.color, style.box.labelColor), color: '#dddddd' });
    for (const [x, z, ry, w] of [[bw / 2 + 0.002, 0, Math.PI / 2, bd], [-bw / 2 - 0.002, 0, -Math.PI / 2, bd], [0, -bd / 2 - 0.002, Math.PI, bw]]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, w * 0.32), decal);
      d.position.set(x, 0, z);
      d.rotation.y = ry;
      box.add(d);
    }
    this.chassis.add(box);

    const pg = parcelGeo(0.12, 0.075, 0.11);
    for (const s of style.slots) {
      const p = new THREE.Mesh(pg, mat);
      p.position.set(...s);
      p.rotation.y = (s[1] * 37) % 0.5 - 0.25;
      p.visible = false;
      this.slots.push(p);
      this.chassis.add(p);
    }

    // Rider: jacketed, helmeted, hands on the bars
    const skin = '#e3b089';
    const pants = '#2c3446';
    const riderGeo = merge([
      ...[-1, 1].flatMap((s) => [
        stick([s * 0.05, 0.41, -0.1], [s * 0.065, 0.43, 0.08], 0.03, pants), // thigh
        stick([s * 0.065, 0.43, 0.08], [s * 0.06, 0.22, 0.11], 0.026, pants), // shin
        part(new THREE.BoxGeometry(0.05, 0.035, 0.09), '#1c1f26', [s * 0.06, 0.215, 0.13]),
        stick([s * 0.085, 0.6, -0.06], [s * 0.11, 0.5, 0.06], 0.025, style.jacket), // upper arm
        stick([s * 0.11, 0.5, 0.06], [s * 0.13, 0.53, 0.21], 0.022, style.jacket), // forearm
        part(new THREE.SphereGeometry(0.022, 8, 6), '#30343d', [s * 0.13, 0.53, 0.22]), // glove
      ]),
      part(new RoundedBoxGeometry(0.17, 0.23, 0.11, 2, 0.04), style.jacket, [0, 0.52, -0.08], [0.22, 0, 0]),
      part(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), skin, [0, 0.645, -0.04]),
      part(new THREE.SphereGeometry(0.055, 14, 10), skin, [0, 0.7, -0.03]),
      part(new THREE.SphereGeometry(0.067, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), style.helmet, [0, 0.71, -0.035]),
      part(new THREE.BoxGeometry(0.09, 0.012, 0.04), style.helmet, [0, 0.715, 0.035], [0.25, 0, 0]), // peak
      part(new THREE.BoxGeometry(0.1, 0.012, 0.012), '#111', [0, 0.705, 0.028]), // goggle band hint
    ]);
    this.rider.add(new THREE.Mesh(riderGeo, mat));
    this.chassis.add(this.rider);

    // Wheels with spokes so the roll reads
    const wheelGeo = merge([
      part(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.045, 16), '#20242c', [0, 0, 0], [0, 0, Math.PI / 2]),
      part(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), '#c7ccd6', [0, 0, 0], [0, 0, Math.PI / 2]),
      part(new THREE.BoxGeometry(0.052, 0.12, 0.016), '#8a93a3'),
      part(new THREE.BoxGeometry(0.052, 0.016, 0.12), '#8a93a3'),
    ]);
    const front = new THREE.Mesh(wheelGeo, mat);
    front.position.set(0, WHEEL_R, 0);
    this.fork.add(front);
    const rear = new THREE.Mesh(wheelGeo, mat);
    rear.position.set(...REAR);
    this.chassis.add(rear);
    this.wheels.push(front, rear);

    shadowed(this.group, true, false);
  }

  override setNight(n: number): void {
    super.setNight(n);
    this.lamps.emissiveIntensity = 0.6 + n * 3;
    this.spot.intensity = n * 6;
  }

  protected animate(dt: number, t: number): void {
    const moving = Math.min(1, this.speed);
    const parked = this.expression === 'sleep' && this.speed < 0.05;

    // Lean into turns; rest on the kickstand when parked
    const want = parked ? 0.12 : THREE.MathUtils.clamp(-this.turn * this.speed * 0.06, -0.4, 0.4);
    this.roll = damp(this.roll, want, 6, dt);
    this.tilt.rotation.z = this.roll;
    this.fork.rotation.y = damp(this.fork.rotation.y, THREE.MathUtils.clamp(this.turn * 0.08, -0.4, 0.4), 10, dt);

    // A celebratory wheelie, pivoting on the rear hub
    const happy = this.expression === 'happy';
    this.wheelie = damp(this.wheelie, happy ? 0.38 : THREE.MathUtils.clamp(-this.accel * 0.004, -0.04, 0.06), happy ? 7 : 5, dt);
    const a = -this.wheelie;
    this.chassis.rotation.x = a;
    this.tmp.copy(this.pivot).applyAxisAngle(X, a);
    this.chassis.position.subVectors(this.pivot, this.tmp);

    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / WHEEL_R;
    // Engine judder + road bumps on the rider
    this.rider.position.y = Math.abs(Math.sin(t * 19)) * 0.006 * moving + (this.speed < 0.05 && !parked ? Math.sin(t * 40) * 0.0015 : 0);
    this.rider.rotation.x = damp(this.rider.rotation.x, happy ? -0.15 : 0, 6, dt);

    this.blinkers.emissiveIntensity = this.stuck && blinkOn(t) ? 2.5 : 0;
    for (let i = 0; i < this.slots.length; i++) this.slots[i].visible = i < this.cargo;
  }
}
