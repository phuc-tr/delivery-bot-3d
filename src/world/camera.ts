import * as THREE from 'three';
import type { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { GRID_H, GRID_W } from './common';

const HOME_POS = new THREE.Vector3(0, 17, 21);
const HOME_TARGET = new THREE.Vector3(0, 0, 0.5);
const PAN_KEYS: Record<string, [number, number]> = {
  w: [0, 1], arrowup: [0, 1],
  s: [0, -1], arrowdown: [0, -1],
  a: [-1, 0], arrowleft: [-1, 0],
  d: [1, 0], arrowright: [1, 0],
};

/**
 * Smooth camera on top of MapControls: keyboard panning with inertia, Q/E rotation,
 * a fly-to tween (intro, H to recentre), robot follow, and clamping to the island.
 */
export class CameraRig {
  follow = false;
  /** Called when the user takes manual control, so the host can untoggle follow. */
  onManual: () => void = () => {};

  private readonly held = new Set<string>();
  private readonly vel = new THREE.Vector2();
  private spin = 0;
  /** Eased dolly toward a target distance (auto zoom on departure); any user zoom cancels it. */
  private zoom: { to: number; rate: number } | null = null;
  private tween: { fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3; t: number; dur: number } | null = null;

  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly controls: MapControls) {
    controls.addEventListener('start', () => {
      this.tween = null;
      this.zoom = null;
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k in PAN_KEYS || k === 'q' || k === 'e') {
        e.preventDefault();
        this.held.add(k);
        this.tween = null;
        if (k in PAN_KEYS) this.manual();
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.held.clear());
  }

  /** User grabbed the camera with a pan gesture: stop following. */
  manual(): void {
    if (this.follow) this.onManual();
  }

  intro(from: THREE.Vector3): void {
    this.camera.position.copy(from);
    this.flyTo(HOME_POS, HOME_TARGET, 2.6);
  }

  home(): void {
    this.flyTo(HOME_POS, HOME_TARGET, 1.1);
  }

  /** Glide in (or out) to `dist` from the target, keeping the current viewing angle. */
  zoomTo(dist: number, rate = 2.2): void {
    this.zoom = { to: dist, rate };
  }

  get busy(): boolean {
    return !!this.tween;
  }

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, dur: number): void {
    this.tween = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: pos.clone(),
      toTarget: target.clone(),
      t: 0,
      dur,
    };
  }

  update(dt: number, robot: THREE.Vector3): void {
    const c = this.controls;
    const cam = this.camera;

    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = 1 - Math.pow(1 - tw.t, 3);
      cam.position.lerpVectors(tw.fromPos, tw.toPos, k);
      c.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
      if (tw.t >= 1) this.tween = null;
      c.update();
      return;
    }

    // Keyboard pan with acceleration and glide, scaled by zoom distance
    let ix = 0, iz = 0;
    for (const k of this.held) {
      const v = PAN_KEYS[k];
      if (v) { ix += v[0]; iz += v[1]; }
    }
    const dist = cam.position.distanceTo(c.target);
    const top = dist * 0.9;
    const a = 1 - Math.exp(-(ix || iz ? 8 : 5) * dt);
    this.vel.x += (ix * top - this.vel.x) * a;
    this.vel.y += (iz * top - this.vel.y) * a;
    if (this.vel.lengthSq() > 1e-5) {
      cam.getWorldDirection(this.fwd).setY(0).normalize();
      this.right.crossVectors(this.fwd, cam.up).normalize();
      this.delta.copy(this.right).multiplyScalar(this.vel.x * dt).addScaledVector(this.fwd, this.vel.y * dt);
      c.target.add(this.delta);
      cam.position.add(this.delta);
    }

    // Q/E orbit around the target
    const turn = (this.held.has('q') ? 1 : 0) - (this.held.has('e') ? 1 : 0);
    this.spin += (turn * 1.6 - this.spin) * (1 - Math.exp(-8 * dt));
    if (Math.abs(this.spin) > 1e-3) {
      this.offset.subVectors(cam.position, c.target).applyAxisAngle(cam.up, this.spin * dt);
      cam.position.copy(c.target).add(this.offset);
    }

    // Follow: glide the target toward the robot. Zoom stays the user's: no distance is enforced.
    if (this.follow) {
      this.delta.subVectors(robot, c.target).setY(0).multiplyScalar(1 - Math.exp(-4 * dt));
      c.target.add(this.delta);
      cam.position.add(this.delta);
    }

    if (this.zoom) {
      this.offset.subVectors(cam.position, c.target);
      const len = this.offset.length();
      const next = len + (this.zoom.to - len) * (1 - Math.exp(-this.zoom.rate * dt));
      cam.position.copy(c.target).addScaledVector(this.offset, next / len);
      if (Math.abs(next - this.zoom.to) < 0.05) this.zoom = null;
    }

    // Keep the view over the island
    const hx = GRID_W / 2 + 1, hz = GRID_H / 2 + 1;
    this.delta.set(
      THREE.MathUtils.clamp(c.target.x, -hx, hx) - c.target.x,
      -c.target.y,
      THREE.MathUtils.clamp(c.target.z, -hz, hz) - c.target.z,
    );
    if (this.delta.lengthSq() > 0) {
      c.target.add(this.delta);
      cam.position.add(this.delta);
    }

    c.update();
  }
}
