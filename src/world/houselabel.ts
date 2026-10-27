import * as THREE from 'three';
import type { Cell } from '../sim/grid';
import { cellToWorld, damp, easeOutBack } from './common';

export interface HouseInfo {
  cell: Cell;
  name: string;
  waiting: number;
  delivered: number;
}

const W = 512;
const H = 172;
/** Card width in view-space units at distance 1: a constant on-screen size, about 1/6 of the view height tall. */
const SIZE = 0.25;

/**
 * Clay card floating over the hovered house: its name and how many orders it has placed.
 * A camera-facing sprite in the scene (not DOM), drawn over everything.
 */
export class HouseLabel {
  readonly sprite: THREE.Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly base = new THREE.Vector3();
  private key = '';
  private want = false;
  private show = 0;

  constructor() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, sizeAttenuation: false }),
    );
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 10;
    this.sprite.visible = false;
  }

  /** Point the card at a house, or null to fade it away. */
  set(info: HouseInfo | null): void {
    this.want = !!info;
    if (!info) return;
    cellToWorld(info.cell, this.base, 1.62); // clears the pending-order pin
    const key = `${info.name}|${info.waiting}|${info.delivered}`;
    if (key !== this.key) {
      this.key = key;
      this.draw(info);
    }
    if (this.show < 0.05) this.sprite.position.copy(this.base);
  }

  update(dt: number, t: number): void {
    this.show = damp(this.show, this.want ? 1 : 0, this.want ? 12 : 16, dt);
    this.sprite.visible = this.show > 0.02;
    if (!this.sprite.visible) return;
    const s = SIZE * easeOutBack(Math.min(1, this.show));
    this.sprite.scale.set(s, (s * H) / W, 1);
    this.sprite.material.opacity = Math.min(1, this.show * 1.4);
    this.sprite.position.lerp(this.base, Math.min(1, dt * 18));
    this.sprite.position.y = this.base.y + Math.sin(t * 2) * 0.02;
  }

  private draw({ name, waiting, delivered }: HouseInfo): void {
    const x = this.ctx;
    x.clearRect(0, 0, W, H);
    const font = (w: number, px: number) => `${w} ${px}px Fredoka, 'Trebuchet MS', sans-serif`;

    // Card with a soft drop shadow, a little tail pointing at the roof, and clay highlights
    const cx = 14, cy = 10, cw = W - 28, ch = H - 52, r = 40;
    x.save();
    x.shadowColor = 'rgba(90, 60, 30, 0.35)';
    x.shadowBlur = 18;
    x.shadowOffsetY = 8;
    x.fillStyle = '#f3ece2';
    x.beginPath();
    x.roundRect(cx, cy, cw, ch, r);
    x.moveTo(W / 2 - 22, cy + ch - 1);
    x.lineTo(W / 2, cy + ch + 26);
    x.lineTo(W / 2 + 22, cy + ch - 1);
    x.fill();
    x.restore();
    const shade = x.createLinearGradient(0, cy, 0, cy + ch);
    shade.addColorStop(0, 'rgba(255,255,255,0.7)');
    shade.addColorStop(0.35, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(150,125,100,0.16)');
    x.fillStyle = shade;
    x.beginPath();
    x.roundRect(cx, cy, cw, ch, r);
    x.fill();

    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#3b3346';
    x.font = font(700, 46);
    x.fillText(name, cx + 32, cy + 60, cw - 64 - 150); // leave room for the order count

    // Orders placed, as a big number with its breakdown
    const placed = waiting + delivered;
    x.textAlign = 'right';
    x.font = font(700, 46);
    x.fillStyle = placed ? '#ff8a4c' : '#b3a99c';
    x.fillText(String(placed), cx + cw - 32, cy + 60);
    const numW = x.measureText(String(placed)).width;
    x.font = font(600, 22);
    x.fillStyle = '#8a8094';
    x.fillText(placed === 1 ? 'order' : 'orders', cx + cw - 40 - numW, cy + 58);

    x.textAlign = 'left';
    x.font = font(500, 26);
    x.fillStyle = '#8a8094';
    x.fillText(placed ? `${waiting} waiting · ${delivered} delivered` : 'No orders yet', cx + 32, cy + 102);


    this.tex.needsUpdate = true;
  }
}
