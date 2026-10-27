import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE_TOP } from './common';

interface Hop {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  onLand: () => void;
}

interface Particle {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  kind: 'confetti' | 'smoke';
}

const CONFETTI = ['#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#ff6bcb', '#eccc68'];

/** One-shot effects: parcel hop, confetti, LIDAR scan ripple, chimney smoke. */
export class Fx {
  readonly group = new THREE.Group();
  private readonly hops: Hop[] = [];
  private readonly parcelGeo = new RoundedBoxGeometry(0.2, 0.15, 0.2, 2, 0.02);
  private readonly parcelMat = new THREE.MeshStandardMaterial({ color: '#c89159', roughness: 0.8 });
  private readonly tapeMat = new THREE.MeshStandardMaterial({ color: '#f3e3c3', roughness: 0.6 });
  private readonly tapeGeo = new THREE.BoxGeometry(0.205, 0.155, 0.04);

  private readonly confetti: THREE.InstancedMesh;
  private readonly smoke: THREE.InstancedMesh;
  private readonly confettiP: Particle[] = [];
  private readonly smokeP: Particle[] = [];

  private readonly ripples: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; t: number }[] = [];

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.06, 0.035),
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, emissive: '#222' }),
      240,
    );
    this.smoke = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.07, 1),
      new THREE.MeshStandardMaterial({ color: '#e8e8ee', roughness: 1, flatShading: true, transparent: true, opacity: 0.85 }),
      90,
    );
    const col = new THREE.Color();
    for (let i = 0; i < 240; i++) {
      this.confetti.setMatrixAt(i, this.hidden);
      this.confetti.setColorAt(i, col.set(CONFETTI[i % CONFETTI.length]));
      this.confettiP.push(blank('confetti'));
    }
    for (let i = 0; i < 90; i++) {
      this.smoke.setMatrixAt(i, this.hidden);
      this.smokeP.push(blank('smoke'));
    }
    this.confetti.frustumCulled = this.smoke.frustumCulled = false;
    this.group.add(this.confetti, this.smoke);

    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1, 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 2.6), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.ripples.push({ mesh, t: 1 });
      this.group.add(mesh);
    }
  }

  /** A parcel arcs from the robot to the house door, then `onLand` fires. */
  parcelHop(from: THREE.Vector3, to: THREE.Vector3, onLand: () => void): void {
    const mesh = new THREE.Mesh(this.parcelGeo, this.parcelMat);
    const tape = new THREE.Mesh(this.tapeGeo, this.tapeMat);
    mesh.add(tape);
    mesh.castShadow = true;
    this.group.add(mesh);
    this.hops.push({ mesh, from: from.clone().setY(from.y + 0.5), to: to.clone(), t: 0, onLand });
  }

  burst(at: THREE.Vector3, n = 60): void {
    let spawned = 0;
    for (const p of this.confettiP) {
      if (p.alive) continue;
      const a = Math.random() * Math.PI * 2;
      const up = 2.2 + Math.random() * 1.8;
      const out = 0.6 + Math.random() * 1.4;
      p.alive = true;
      p.p.copy(at);
      p.v.set(Math.cos(a) * out, up, Math.sin(a) * out);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
      p.life = 0;
      p.max = 1.4 + Math.random() * 0.8;
      if (++spawned >= n) break;
    }
  }

  ripple(at: THREE.Vector3): void {
    const r = this.ripples.reduce((a, b) => (a.t > b.t ? a : b));
    r.t = 0;
    r.mesh.position.set(at.x, TILE_TOP + 0.03, at.z);
    r.mesh.visible = true;
  }

  puff(at: THREE.Vector3): void {
    const p = this.smokeP.find((s) => !s.alive);
    if (!p) return;
    p.alive = true;
    p.p.copy(at);
    p.v.set((Math.random() - 0.5) * 0.08 + 0.12, 0.35 + Math.random() * 0.15, (Math.random() - 0.5) * 0.08);
    p.life = 0;
    p.max = 2 + Math.random();
    p.size = 0.7 + Math.random() * 0.6;
  }

  update(dt: number): void {
    // Parcel hops
    for (let i = this.hops.length - 1; i >= 0; i--) {
      const h = this.hops[i];
      h.t += dt / 0.75;
      const k = Math.min(1, h.t);
      h.mesh.position.lerpVectors(h.from, h.to, k);
      h.mesh.position.y += Math.sin(k * Math.PI) * 0.9;
      h.mesh.rotation.set(k * Math.PI * 2, k * Math.PI, 0);
      h.mesh.scale.setScalar(k > 0.85 ? 1 - (k - 0.85) / 0.15 * 0.7 : 1);
      if (h.t >= 1) {
        this.group.remove(h.mesh);
        this.hops.splice(i, 1);
        h.onLand();
      }
    }

    // Confetti
    for (let i = 0; i < this.confettiP.length; i++) {
      const p = this.confettiP[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life > p.max) {
        p.alive = false;
        this.confetti.setMatrixAt(i, this.hidden);
        continue;
      }
      p.v.y -= 6 * dt;
      p.v.multiplyScalar(1 - 1.8 * dt); // air drag → flutter
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < TILE_TOP + 0.02) {
        p.p.y = TILE_TOP + 0.02;
        p.v.set(0, 0, 0);
        p.spin.multiplyScalar(0.9);
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const fade = Math.min(1, (p.max - p.life) * 3);
      this.m.compose(p.p, this.q.setFromEuler(p.rot), this.s.setScalar(fade));
      this.confetti.setMatrixAt(i, this.m);
    }
    this.confetti.instanceMatrix.needsUpdate = true;

    // Smoke
    for (let i = 0; i < this.smokeP.length; i++) {
      const p = this.smokeP[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life > p.max) {
        p.alive = false;
        this.smoke.setMatrixAt(i, this.hidden);
        continue;
      }
      const k = p.life / p.max;
      p.p.addScaledVector(p.v, dt);
      const sc = p.size * Math.sin(Math.min(1, k * 1.4) * Math.PI) * (0.6 + k * 1.2);
      this.m.compose(p.p, this.q.identity(), this.s.setScalar(Math.max(0.001, sc)));
      this.smoke.setMatrixAt(i, this.m);
    }
    this.smoke.instanceMatrix.needsUpdate = true;

    // Scan ripples
    for (const r of this.ripples) {
      if (!r.mesh.visible) continue;
      r.t += dt / 1.1;
      const k = Math.min(1, r.t);
      r.mesh.scale.setScalar(0.3 + k * 3.2);
      r.mesh.material.opacity = (1 - k) * 0.9;
      if (k >= 1) r.mesh.visible = false;
    }
  }
}

function blank(kind: Particle['kind']): Particle {
  return {
    alive: false,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    rot: new THREE.Euler(),
    spin: new THREE.Vector3(),
    life: 0,
    max: 1,
    size: 1,
    kind,
  };
}
