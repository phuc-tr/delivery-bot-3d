import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { damp, merge, part, shadowed, vertexColorMat } from '../common';
import { Carrier } from './base';

const ACCENT = '#14b8c8';
const WHEEL_R = 0.09;

/** The six-wheeled courier, its rig and its moods. */
export class Robot3D extends Carrier {
  private readonly chassis = new THREE.Group();
  private readonly lidPivot = new THREE.Group();
  private readonly lidar = new THREE.Group();
  private readonly flag: THREE.Mesh;
  private readonly tip: THREE.MeshStandardMaterial;
  private readonly wheels: THREE.Mesh[] = [];
  private readonly leds: THREE.MeshStandardMaterial[] = [];
  private readonly lamps: THREE.MeshStandardMaterial;
  private readonly spot: THREE.SpotLight;
  private readonly face: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string };

  private lean = 0;
  private lid = 0;
  private lidTarget = 0;
  private nextBlink = 2;

  constructor() {
    super();
    const g = this.group;
    g.add(this.chassis);

    // Body shell with an accent belt and bumper.
    const body = merge([
      part(new RoundedBoxGeometry(0.5, 0.3, 0.62, 3, 0.08), '#f7f8fb', [0, 0.27, 0]),
      part(new RoundedBoxGeometry(0.515, 0.06, 0.635, 2, 0.03), ACCENT, [0, 0.2, 0]),
      part(new RoundedBoxGeometry(0.44, 0.06, 0.06, 2, 0.025), '#3a4150', [0, 0.15, 0.31]),
      part(new RoundedBoxGeometry(0.44, 0.06, 0.06, 2, 0.025), '#3a4150', [0, 0.15, -0.31]),
      // Face bezel
      part(new RoundedBoxGeometry(0.36, 0.17, 0.02, 2, 0.03), '#1b2130', [0, 0.32, 0.309]),
    ]);
    this.chassis.add(new THREE.Mesh(body, vertexColorMat({ roughness: 0.45, flatShading: false })));

    // Lid (hinged at the back, opens on delivery)
    this.lidPivot.position.set(0, 0.42, -0.3);
    const lid = new THREE.Mesh(
      new RoundedBoxGeometry(0.48, 0.05, 0.6, 2, 0.025),
      new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.4 }),
    );
    lid.position.set(0, 0.02, 0.3);
    const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: '#c89159' }));
    parcel.position.set(0, 0.38, 0.02);
    this.lidPivot.add(lid);
    this.chassis.add(this.lidPivot, parcel);

    // Face screen
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.face = { ctx: canvas.getContext('2d')!, tex, key: '' };
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.14),
      new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.8, 1.8, 1.8) }),
    );
    screen.position.set(0, 0.32, 0.321);
    this.chassis.add(screen);

    // Headlights + a spot that only matters at night
    this.lamps = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6d8', emissiveIntensity: 0.6 });
    for (const x of [-0.17, 0.17]) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), this.lamps);
      l.position.set(x, 0.2, 0.3185);
      this.chassis.add(l);
    }
    this.spot = new THREE.SpotLight('#fff1cc', 0, 4, 0.7, 0.6, 1.2);
    this.spot.position.set(0, 0.25, 0.3);
    this.spot.target.position.set(0, 0, 1.6);
    this.chassis.add(this.spot, this.spot.target);

    // Cargo LEDs on both flanks
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshStandardMaterial({ color: '#1b2130', emissive: '#000000' });
      this.leds.push(m);
      for (const side of [-1, 1]) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.07), m);
        led.position.set(side * 0.252, 0.31, -0.12 + i * 0.1);
        this.chassis.add(led);
      }
    }

    // LIDAR puck
    const puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: '#232a38', roughness: 0.3, metalness: 0.6 }),
    );
    puck.position.y = 0.03;
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.02, 0.02),
      new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff3355', emissiveIntensity: 3 }),
    );
    eye.position.set(0, 0.035, 0.062);
    this.lidar.add(puck, eye);
    this.lidar.position.set(0.12, 0.47, 0.16);
    this.chassis.add(this.lidar);

    // Antenna with the classic orange safety flag
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.6, 6), new THREE.MeshStandardMaterial({ color: '#d9dde5', metalness: 0.6, roughness: 0.3 }));
    pole.position.set(-0.17, 0.75, -0.24);
    this.tip = new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 2 });
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), this.tip);
    tip.position.set(-0.17, 1.06, -0.24);
    const flagGeo = new THREE.PlaneGeometry(0.17, 0.11, 4, 1);
    flagGeo.translate(0.085, 0, 0);
    this.flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: '#ff7a1a', side: THREE.DoubleSide, roughness: 0.7 }));
    this.flag.position.set(-0.17, 0.98, -0.24);
    this.flag.rotation.y = Math.PI / 2;
    this.chassis.add(pole, tip, this.flag);

    // Wheels: tyre + hub + spokes so the roll reads clearly
    const wheelGeo = merge([
      part(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.06, 16), '#22262f', [0, 0, 0], [0, 0, Math.PI / 2]),
      part(new THREE.CylinderGeometry(0.05, 0.05, 0.065, 12), '#c7ccd6', [0, 0, 0], [0, 0, Math.PI / 2]),
      part(new THREE.BoxGeometry(0.068, 0.11, 0.02), '#8a93a3', [0, 0, 0]),
      part(new THREE.BoxGeometry(0.068, 0.02, 0.11), '#8a93a3', [0, 0, 0]),
    ]);
    const wheelMat = vertexColorMat({ roughness: 0.7 });
    for (const z of [-0.21, 0, 0.21]) {
      for (const x of [-0.27, 0.27]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.position.set(x, WHEEL_R, z);
        this.wheels.push(w);
        g.add(w);
      }
    }

    shadowed(g, true, false);
    this.drawFace(false);
  }

  override setNight(n: number): void {
    super.setNight(n);
    this.lamps.emissiveIntensity = 0.6 + n * 3;
    this.spot.intensity = n * 6;
  }

  override celebrate(t: number): void {
    super.celebrate(t);
    this.lidTarget = 1;
  }

  protected animate(dt: number, t: number): void {
    // Lean and wheel roll
    this.lean = damp(this.lean, THREE.MathUtils.clamp(-this.accel * 0.01, -0.08, 0.08), 6, dt);
    this.chassis.rotation.x = this.lean;
    this.chassis.position.y = Math.abs(Math.sin(t * 22)) * 0.006 * Math.min(1, this.speed);
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / WHEEL_R;

    // Lid closes again after a delivery
    if (t > this.happyUntil - 0.6) this.lidTarget = 0;
    this.lid = damp(this.lid, this.lidTarget, 9, dt);
    this.lidPivot.rotation.x = -this.lid * 1.15;

    this.lidar.rotation.y += dt * (this.expression === 'sleep' ? 1 : 7);
    const flap = Math.min(1, this.speed * 1.5);
    this.flag.rotation.y = Math.PI / 2 + Math.sin(t * (6 + flap * 10)) * (0.15 + flap * 0.25) + flap * 0.6;
    this.tip.emissiveIntensity = (Math.sin(t * 4) > 0.6 ? 3 : 0.4) * (this.stuck ? 1.8 : 1);

    for (let i = 0; i < 3; i++) {
      const m = this.leds[i];
      if (this.stuck) {
        m.emissive.set('#ff2d2d');
        m.emissiveIntensity = 1 + Math.sin(t * 9) * 0.9;
      } else if (i < this.cargo) {
        m.emissive.set('#3dff8a');
        m.emissiveIntensity = 1.8;
      } else {
        m.emissiveIntensity = 0;
      }
    }

    // Face: expression + blink
    if (t > this.nextBlink + 0.12) this.nextBlink = t + 2 + Math.random() * 3;
    const blinking = t > this.nextBlink;
    this.drawFace(blinking);
  }

  private drawFace(blink: boolean): void {
    const key = `${this.expression}|${blink}|${this.night > 0.5}`;
    if (key === this.face.key) return;
    this.face.key = key;
    const x = this.face.ctx;
    x.fillStyle = '#071018';
    x.fillRect(0, 0, 128, 64);
    const col = this.expression === 'stuck' ? '#ff5a4f' : this.expression === 'happy' ? '#7dffb2' : '#5ce8ff';
    x.fillStyle = col;
    x.strokeStyle = col;
    x.lineWidth = 7;
    x.lineCap = 'round';
    x.shadowColor = col;
    x.shadowBlur = 10;
    for (const cx of [40, 88]) {
      x.beginPath();
      switch (this.expression) {
        case 'happy':
          x.arc(cx, 38, 12, Math.PI * 1.1, Math.PI * 1.9);
          x.stroke();
          break;
        case 'stuck': {
          const s = cx < 64 ? 1 : -1;
          x.moveTo(cx - 10 * s, 22);
          x.lineTo(cx + 8 * s, 32);
          x.lineTo(cx - 10 * s, 42);
          x.stroke();
          break;
        }
        case 'sleep':
          x.moveTo(cx - 11, 36);
          x.quadraticCurveTo(cx, 42, cx + 11, 36);
          x.stroke();
          break;
        default:
          if (blink) {
            x.moveTo(cx - 10, 33);
            x.lineTo(cx + 10, 33);
            x.stroke();
          } else {
            x.roundRect(cx - 9, 18, 18, 30, 8);
            x.fill();
          }
      }
    }
    this.face.tex.needsUpdate = true;
  }
}
