import * as THREE from 'three';
import { damp, dampAngle, merge, part } from '../common';

export type Expression = 'idle' | 'happy' | 'stuck' | 'sleep';
export type CarrierKind = 'robot' | 'grob' | 'shopoo' | 'taxi' | 'ganh';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Shared rig for anything that carries parcels around town: follows `target`, derives heading,
 * speed, acceleration and turn rate from how it moved, and leaves the look to subclasses.
 * Every carrier owns exactly one SpotLight so swapping them never changes the scene's light count.
 */
export abstract class Carrier {
  readonly group = new THREE.Group();
  /** Where the carrier should be this frame (set by the host). */
  readonly target = new THREE.Vector3();
  expression: Expression = 'sleep';
  cargo = 0;
  stuck = false;
  /** Where it parks in front of a house: 0 = house centre, 1 = previous cell centre. */
  readonly doorGap: number = 0.68;

  protected yaw = 0;
  protected speed = 0;
  protected accel = 0;
  /** Smoothed yaw rate (rad/s), positive when turning toward +x. */
  protected turn = 0;
  protected happyUntil = 0;
  protected night = 0;
  private readonly prev = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();

  get heading(): number {
    return this.yaw;
  }

  setNight(n: number): void {
    this.night = n;
  }

  /** Teleport without animation (reset). */
  place(p: THREE.Vector3, yaw = Math.PI / 2): void {
    this.target.copy(p);
    this.group.position.copy(p);
    this.prev.copy(p);
    this.yaw = yaw;
    this.group.rotation.y = yaw;
  }

  celebrate(t: number): void {
    this.happyUntil = t + 1.6;
  }

  update(dt: number, t: number): void {
    const g = this.group;
    g.position.copy(this.target);

    this.vel.subVectors(g.position, this.prev).divideScalar(Math.max(dt, 1e-4));
    this.prev.copy(g.position);
    const v = this.vel.length();
    this.accel = (v - this.speed) / Math.max(dt, 1e-4);
    this.speed = damp(this.speed, v, 10, dt);
    const before = this.yaw;
    if (v > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 9, dt);
    let dy = this.yaw - before;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.turn = damp(this.turn, dy / Math.max(dt, 1e-4), 8, dt);
    g.rotation.y = this.yaw;

    this.expression = this.stuck ? 'stuck' : t < this.happyUntil ? 'happy' : this.expression === 'happy' ? 'idle' : this.expression;
    this.animate(dt, t);
  }

  protected abstract animate(dt: number, t: number): void;

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const sm = mat as THREE.MeshStandardMaterial;
        sm.map?.dispose();
        sm.emissiveMap?.dispose();
        mat.dispose();
      }
    });
  }
}

/** A cylinder running from `a` to `b` (limbs, ropes, poles), painted for merging. */
export function stick(a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, r: number, color: THREE.ColorRepresentation, seg = 6): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(va);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(va.x + (b[0] - a[0]) / 2, va.y + (b[1] - a[1]) / 2, va.z + (b[2] - a[2]) / 2);
  return part(g, color);
}

/** A taped cardboard parcel, centred on its base. */
export function parcelGeo(w = 0.12, h = 0.08, d = 0.11): THREE.BufferGeometry {
  return merge([
    part(new THREE.BoxGeometry(w, h, d), '#c89159', [0, h / 2, 0]),
    part(new THREE.BoxGeometry(w + 0.004, h + 0.004, d * 0.22), '#e9d3a6', [0, h / 2, 0]),
  ]);
}

/** Text on a coloured plate, for signs and box decals. */
export function labelTexture(text: string, bg: string, fg: string, w = 256, h = 96): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.fillStyle = fg;
  x.font = `700 ${Math.round(h * 0.62)}px Fredoka, 'Trebuchet MS', sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + h * 0.04, w * 0.9);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Hazard / indicator blink: true for the "on" half of a ~1.5 Hz cycle. */
export const blinkOn = (t: number) => Math.sin(t * 9.5) > 0;
