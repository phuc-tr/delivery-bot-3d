import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { damp, merge, part, shadowed, vertexColorMat } from '../common';
import { Carrier, parcelGeo, stick } from './base';

const SKIN = '#d9a274';
const SHIRT = '#a56cc1'; // áo bà ba
const PANTS = '#262630';
const STRAW = '#e6cf92';
const WEAVE = '#a47637';
const ROPE_LEN = 0.3;
const POLE_HALF = 0.47;

interface Basket {
  hanger: THREE.Group;
  /** Pendulum state: fore-aft angle and angular velocity. */
  a: number;
  w: number;
}

/**
 * A skinny street vendor in a nón lá, sprinting with a bamboo đòn gánh on her shoulder:
 * a basket swinging off each end, a lantern for night shifts and a chicken that came along for the ride.
 */
export class GanhCarrier extends Carrier {
  override readonly doorGap = 0.95;

  /** Bobs with each stride; legs hang off it so she leaves the ground mid-run. */
  private readonly rig = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly pole = new THREE.Group();
  private readonly thighs: THREE.Group[] = [];
  private readonly knees: THREE.Group[] = [];
  private readonly armL = new THREE.Group();
  private readonly baskets: Basket[] = [];
  private readonly slots: THREE.Mesh[] = [];
  private readonly chicken = new THREE.Group();
  private readonly lantern: THREE.MeshStandardMaterial;
  private readonly spot: THREE.SpotLight;
  private phase = 0;
  private run = 0;
  private lean = 0;

  constructor() {
    super();
    const mat = vertexColorMat({ roughness: 0.75, flatShading: false });
    const mesh = (g: THREE.BufferGeometry) => new THREE.Mesh(g, mat);
    this.group.add(this.rig);
    this.rig.position.y = 0.36;

    // Legs: thigh → knee → shin + sandal, each joint its own pivot
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.032, 0, 0);
      thigh.add(mesh(stick([0, 0.01, 0], [0, -0.17, 0], 0.017, PANTS)));
      const knee = new THREE.Group();
      knee.position.y = -0.17;
      knee.add(
        mesh(
          merge([
            stick([0, 0, 0], [0, -0.11, 0], 0.016, PANTS),
            stick([0, -0.11, 0], [0, -0.165, 0], 0.01, SKIN),
            part(new THREE.BoxGeometry(0.032, 0.014, 0.068), '#5b3a22', [0, -0.172, 0.016]),
          ]),
        ),
      );
      thigh.add(knee);
      this.rig.add(thigh);
      this.thighs.push(thigh);
      this.knees.push(knee);
    }

    // Torso, back bundle and the arm that steadies the pole
    this.rig.add(this.body);
    this.body.add(
      mesh(
        merge([
          part(new RoundedBoxGeometry(0.105, 0.21, 0.072, 2, 0.03), SHIRT, [0, 0.11, 0]),
          part(new RoundedBoxGeometry(0.115, 0.05, 0.078, 2, 0.02), SHIRT, [0, 0.02, 0]), // hem
          part(new THREE.BoxGeometry(0.075, 0.03, 0.06), PANTS, [0, -0.005, 0]),
          part(new THREE.CylinderGeometry(0.016, 0.018, 0.04, 8), SKIN, [0, 0.225, 0]), // neck
          part(new THREE.SphereGeometry(0.055, 10, 8), '#3f7fbf', [0, 0.1, -0.07], [0, 0, 0.4]), // cloth bundle
          part(new THREE.BoxGeometry(0.008, 0.11, 0.008), '#2f5f8f', [0.03, 0.16, -0.04], [0.5, 0, -0.4]), // its knot
          stick([0.06, 0.2, 0], [0.085, 0.13, 0.065], 0.014, SHIRT),
          stick([0.085, 0.13, 0.065], [0.07, 0.228, 0.115], 0.012, SKIN),
          part(new THREE.SphereGeometry(0.017, 8, 6), SKIN, [0.07, 0.235, 0.115]),
        ]),
      ),
    );

    this.armL.position.set(-0.062, 0.2, 0);
    this.armL.add(
      mesh(
        merge([
          stick([0, 0, 0], [-0.012, -0.09, 0], 0.014, SHIRT),
          stick([-0.012, -0.09, 0], [-0.014, -0.16, 0.012], 0.011, SKIN),
          part(new THREE.SphereGeometry(0.016, 8, 6), SKIN, [-0.014, -0.17, 0.014]),
        ]),
      ),
    );
    this.body.add(this.armL);

    // Head with a hair bun, a cheerful face and a nón lá
    this.head.position.y = 0.28;
    this.head.add(
      mesh(
        merge([
          part(new THREE.SphereGeometry(0.046, 14, 10), SKIN),
          part(new THREE.SphereGeometry(0.047, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), '#1b1716', [0, 0.002, -0.008], [-0.5, 0, 0]),
          part(new THREE.SphereGeometry(0.022, 8, 6), '#1b1716', [0, -0.004, -0.05]),
          part(new THREE.SphereGeometry(0.0065, 6, 4), '#1b1716', [0.017, 0.004, 0.042]),
          part(new THREE.SphereGeometry(0.0065, 6, 4), '#1b1716', [-0.017, 0.004, 0.042]),
          part(new THREE.SphereGeometry(0.009, 6, 4), '#e8837a', [0.028, -0.012, 0.034]),
          part(new THREE.SphereGeometry(0.009, 6, 4), '#e8837a', [-0.028, -0.012, 0.034]),
          part(new THREE.TorusGeometry(0.012, 0.003, 4, 10, Math.PI), '#7a2a2a', [0, -0.016, 0.042], [0, 0, Math.PI]),
          part(new THREE.ConeGeometry(0.14, 0.085, 20), STRAW, [0, 0.062, 0]),
          part(new THREE.TorusGeometry(0.139, 0.004, 4, 24), '#cdb274', [0, 0.02, 0], [Math.PI / 2, 0, 0]),
          stick([0.038, 0.02, 0.0], [0.03, -0.04, 0.01], 0.002, '#f2f2f2'), // chin strap
          stick([-0.038, 0.02, 0.0], [-0.03, -0.04, 0.01], 0.002, '#f2f2f2'),
        ]),
      ),
    );
    this.body.add(this.head);

    // Bamboo đòn gánh on the right shoulder, running fore and aft
    this.pole.position.set(0.062, 0.24, 0);
    this.pole.add(
      mesh(
        merge([
          part(new THREE.CylinderGeometry(0.011, 0.011, POLE_HALF * 2 + 0.06, 8), '#c9a35b', [0, 0, 0], [Math.PI / 2, 0, 0]),
          ...[-0.3, -0.1, 0.1, 0.3].map((z) => part(new THREE.CylinderGeometry(0.0125, 0.0125, 0.008, 8), '#a8833f', [0, 0, z], [Math.PI / 2, 0, 0])),
        ]),
      ),
    );
    this.body.add(this.pole);

    const basketGeo = merge([
      part(new THREE.CylinderGeometry(0.12, 0.08, 0.1, 16), WEAVE, [0, -ROPE_LEN - 0.05, 0]),
      part(new THREE.TorusGeometry(0.12, 0.009, 5, 18), '#7d5627', [0, -ROPE_LEN, 0], [Math.PI / 2, 0, 0]),
      part(new THREE.CylinderGeometry(0.11, 0.11, 0.004, 16), '#5e4122', [0, -ROPE_LEN + 0.001, 0]),
      ...[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => stick([0, 0, 0], [Math.cos(a) * 0.11, -ROPE_LEN, Math.sin(a) * 0.11], 0.003, '#6b4f2a', 4)),
    ]);
    for (const z of [POLE_HALF, -POLE_HALF]) {
      const hanger = new THREE.Group();
      hanger.position.z = z;
      hanger.add(mesh(basketGeo));
      this.pole.add(hanger);
      this.baskets.push({ hanger, a: 0, w: 0 });
    }
    const [front, back] = this.baskets.map((b) => b.hanger);

    // Front basket: a heap of oranges and pomelos
    front.add(
      mesh(
        merge(
          [
            [0.05, 0.03, '#f39a1e'], [-0.05, 0.02, '#f5a623'], [0, -0.05, '#f39a1e'], [0.02, 0.06, '#9cc43b'],
            [-0.04, -0.05, '#f5a623'], [0.06, -0.04, '#9cc43b'],
          ].map(([x, z, c], i) => part(new THREE.SphereGeometry(0.036 + (i % 3) * 0.006, 8, 6), c as string, [x as number, -ROPE_LEN + 0.02, z as number])),
        ),
      ),
    );

    // Back basket: greens and a hen who is very much along for the ride
    back.add(
      mesh(
        merge([
          ...[0, 1, 2, 3].map((i) => part(new THREE.ConeGeometry(0.02, 0.1, 5), '#4c9a3a', [Math.cos(i * 1.7) * 0.07, -ROPE_LEN + 0.04, Math.sin(i * 1.7) * 0.07], [0.3 * Math.cos(i), 0, 0.3 * Math.sin(i)])),
        ]),
      ),
    );
    this.chicken.position.set(-0.03, -ROPE_LEN + 0.04, -0.02);
    this.chicken.add(
      mesh(
        merge([
          part(new THREE.SphereGeometry(0.045, 10, 8), '#fbf7ee', [0, 0.025, 0]),
          part(new THREE.SphereGeometry(0.027, 10, 8), '#fbf7ee', [0, 0.075, 0.03]),
          part(new THREE.BoxGeometry(0.008, 0.022, 0.03), '#e23b2e', [0, 0.1, 0.028]), // comb
          part(new THREE.ConeGeometry(0.009, 0.022, 5), '#f2b134', [0, 0.072, 0.064], [Math.PI / 2, 0, 0]),
          part(new THREE.SphereGeometry(0.006, 6, 4), '#111', [0.016, 0.082, 0.045]),
          part(new THREE.SphereGeometry(0.006, 6, 4), '#111', [-0.016, 0.082, 0.045]),
          part(new THREE.ConeGeometry(0.025, 0.05, 5), '#efe6d2', [0, 0.05, -0.045], [-0.9, 0, 0]), // tail
        ]),
      ),
    );
    back.add(this.chicken);

    // Parcels nestle on top: front, back, then stacked on the front
    const pg = parcelGeo(0.13, 0.075, 0.12);
    for (const [h, y, ry] of [[front, 0.03, 0.2], [back, 0.04, -0.3], [front, 0.105, -0.25]] as [THREE.Group, number, number][]) {
      const p = new THREE.Mesh(pg, mat);
      p.position.set(0.01, -ROPE_LEN + y, 0.01);
      p.rotation.y = ry;
      p.visible = false;
      this.slots.push(p);
      h.add(p);
    }

    // Paper lantern on the pole tip lights the way at night
    this.lantern = new THREE.MeshStandardMaterial({ color: '#e0412f', emissive: '#ff6a3d', emissiveIntensity: 0.2, roughness: 0.6 });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), this.lantern);
    lantern.scale.y = 1.25;
    lantern.position.set(0, -0.06, 0.04);
    const string = mesh(stick([0, 0, 0.035], [0, -0.03, 0.04], 0.002, '#3a2a1a', 4));
    front.add(lantern, string);
    this.spot = new THREE.SpotLight('#ffc48a', 0, 3.5, 0.9, 0.7, 1.2);
    this.spot.position.set(0, -0.06, 0.06);
    this.spot.target.position.set(0, -0.6, 1.2);
    front.add(this.spot, this.spot.target);

    shadowed(this.group, true, false);
  }

  override setNight(n: number): void {
    super.setNight(n);
    this.lantern.emissiveIntensity = 0.2 + n * 3.2;
    this.spot.intensity = n * 4;
  }

  protected animate(dt: number, t: number): void {
    const happy = this.expression === 'happy';
    const stuck = this.expression === 'stuck';
    const sleep = this.expression === 'sleep';

    // Tiny, frantic steps: cadence climbs with speed until it's a blur of sandals
    this.run = damp(this.run, Math.min(1, this.speed / 1.2), 8, dt);
    const r = this.run;
    this.phase += dt * Math.min(55, 5 + this.speed * 11) * (r > 0.03 ? 1 : 0);
    const p = this.phase;
    for (let i = 0; i < 2; i++) {
      const q = p + i * Math.PI;
      const swing = Math.sin(q) * 0.95 * r;
      this.thighs[i].rotation.x = -swing;
      this.knees[i].rotation.x = r * (0.25 + 1.3 * Math.max(0, Math.cos(q)));
    }
    if (stuck) {
      // Impatient stomping on the spot
      const k = Math.max(0, Math.sin(t * 14));
      this.thighs[0].rotation.x = -k * 0.5;
      this.knees[0].rotation.x = k * 0.9;
    }

    const bob = Math.abs(Math.cos(p)) * 0.035 * r;
    const jump = happy ? Math.abs(Math.sin(t * 10)) * 0.08 : 0;
    this.rig.position.y = 0.36 + bob + jump + (sleep ? Math.sin(t * 2) * 0.002 : 0);
    this.rig.rotation.z = Math.sin(p) * 0.07 * r; // waddle
    this.lean = damp(this.lean, 0.3 * r + THREE.MathUtils.clamp(this.accel * 0.01, -0.1, 0.1), 6, dt);
    this.body.rotation.x = this.lean;
    this.head.rotation.x = -this.lean * 0.6 + (sleep ? 0.3 : 0) + Math.sin(p * 2) * 0.05 * r;
    this.head.rotation.y = stuck ? Math.sin(t * 11) * 0.5 : damp(this.head.rotation.y, 0, 6, dt);

    // Free arm pumps with the stride, or waves when a parcel lands
    if (happy) {
      this.armL.rotation.x = damp(this.armL.rotation.x, -2.7, 12, dt);
      this.armL.rotation.z = -0.3 + Math.sin(t * 16) * 0.35;
    } else {
      this.armL.rotation.x = damp(this.armL.rotation.x, Math.sin(p) * 0.9 * r + (stuck ? -0.4 : 0), 14, dt);
      this.armL.rotation.z = damp(this.armL.rotation.z, stuck ? 0.9 : 0, 8, dt);
    }

    // Pole flexes with each footfall; baskets swing as damped pendulums that try to hang plumb
    this.pole.rotation.x = Math.sin(p * 2) * 0.05 * r;
    this.pole.position.y = 0.24 - Math.abs(Math.cos(p)) * 0.012 * r;
    const tilt = this.lean + this.pole.rotation.x;
    const kick = Math.sin(p * 2) * 9 * r;
    for (let i = 0; i < this.baskets.length; i++) {
      const b = this.baskets[i];
      const force = -(9.8 / ROPE_LEN) * Math.sin(b.a) - 3 * b.w - (this.accel / ROPE_LEN) * 0.5 + (i ? -kick : kick);
      b.w += force * dt;
      b.a = THREE.MathUtils.clamp(b.a + b.w * dt, -0.9, 0.9);
      b.hanger.rotation.x = b.a - tilt;
      b.hanger.rotation.z = damp(b.hanger.rotation.z, THREE.MathUtils.clamp(this.turn * this.speed * 0.05, -0.5, 0.5), 5, dt);
    }

    // The hen bobs her head, and panics a little when they're stuck
    this.chicken.rotation.y = Math.sin(t * (stuck ? 18 : 3)) * (stuck ? 0.6 : 0.3);
    this.chicken.position.y = -ROPE_LEN + 0.04 + (this.cargo >= 2 ? 0.06 : 0) + Math.abs(Math.sin(t * 6)) * 0.01;

    for (let i = 0; i < this.slots.length; i++) this.slots[i].visible = i < this.cargo;
  }
}
