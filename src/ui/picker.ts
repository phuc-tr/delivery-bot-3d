import * as THREE from 'three';
import type { Carrier, CarrierInfo, CarrierKind } from '../world/carriers';

interface Card {
  info: CarrierInfo;
  el: HTMLButtonElement;
  /** The empty stage inside the card that the overlay renders this carrier into. */
  slot: HTMLDivElement;
  turntable: THREE.Group;
  carrier: Carrier;
}

/**
 * Full-screen "choose your courier" popup. Every carrier spins on its own turntable. A single
 * transparent WebGL canvas lies over the whole popup and each carrier is drawn straight into its
 * card's rectangle via viewport + scissor: no per-card canvases, no GPU→CPU copies, one extra
 * WebGL context, and nothing at all while closed.
 */
export class CarrierPicker {
  isOpen = false;
  private readonly root: HTMLDivElement;
  private readonly cards: Card[] = [];
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 220 / 176, 0.1, 20);
  private readonly box: HTMLDivElement;
  private readonly clock = new THREE.Clock();
  private readonly tmpSize = new THREE.Vector2();
  private focus = 0;
  private dismissable = false;

  constructor(list: CarrierInfo[], public onPick: (kind: CarrierKind) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'picker-gl';
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 0.8, 1.95);
    this.camera.lookAt(0, 0.36, 0);
    this.scene.add(new THREE.HemisphereLight('#dfefff', '#4a3f35', 2.2));
    const sun = new THREE.DirectionalLight('#fff3dd', 2.4);
    sun.position.set(2, 3, 2.5);
    this.scene.add(sun);

    this.root = document.createElement('div');
    this.root.className = 'picker';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'picker-title');
    this.root.innerHTML = `
      <div class="picker-box">
        <h2 id="picker-title">Choose your courier</h2>
        <div class="picker-grid"></div>
      </div>`;
    this.root.append(this.renderer.domElement);
    this.box = this.root.querySelector('.picker-box')!;
    const grid = this.root.querySelector('.picker-grid')!;

    list.forEach((info, i) => {
      const el = document.createElement('button');
      el.className = 'picker-card';
      el.dataset.carrier = info.kind;
      const slot = document.createElement('div');
      slot.className = 'picker-stage';
      el.append(slot);
      el.insertAdjacentHTML('beforeend', `<b>${info.name}</b>`);
      el.onclick = () => this.pick(i);
      el.onpointerenter = () => this.setFocus(i, false);
      grid.append(el);

      const carrier = info.make();
      carrier.cargo = 3;
      carrier.expression = 'idle';
      carrier.place(new THREE.Vector3(), 0);
      carrier.update(1 / 60, 0); // settle into a still pose once; previews only spin, they don't animate
      const turntable = new THREE.Group();
      turntable.add(carrier.group);
      turntable.visible = false;
      this.scene.add(turntable);
      this.cards.push({ info, el, slot, turntable, carrier });
    });

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root && this.dismissable) this.hide();
    });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    document.body.append(this.root);
  }

  /** Open the popup. `dismissable` = there's already a carrier, so Esc / backdrop just closes. */
  show(current: CarrierKind, dismissable: boolean): void {
    this.dismissable = dismissable;
    const wasOpen = this.isOpen;
    this.isOpen = true;
    this.root.classList.add('open');
    const i = Math.max(0, this.cards.findIndex((c) => c.info.kind === current));
    this.cards.forEach((c, j) => c.el.classList.toggle('current', j === i && dismissable));
    this.setFocus(i, true);
    if (wasOpen) return;
    this.clock.getDelta();
    this.loop();
  }

  hide(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }

  private pick(i: number): void {
    this.hide();
    this.onPick(this.cards[i].info.kind);
  }

  private setFocus(i: number, moveDom: boolean): void {
    this.focus = (i + this.cards.length) % this.cards.length;
    this.cards.forEach((c, j) => c.el.classList.toggle('focus', j === this.focus));
    if (moveDom) this.cards[this.focus].el.focus({ preventScroll: true });
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    // Swallow everything so the game's shortcuts don't fire underneath
    e.stopImmediatePropagation();
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        this.setFocus(this.focus + 1, true);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        this.setFocus(this.focus - 1, true);
        break;
      case 'Enter':
      case ' ':
        this.pick(this.focus);
        break;
      case 'Escape':
        if (this.dismissable) this.hide();
        break;
      default: {
        const n = Number(e.key);
        if (n >= 1 && n <= this.cards.length) this.pick(n - 1);
        return;
      }
    }
    e.preventDefault();
  }

  private loop = (): void => {
    if (!this.isOpen) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const r = this.renderer;
    const vw = innerWidth, vh = innerHeight;
    const size = r.getSize(this.tmpSize);
    if (size.x !== vw || size.y !== vh) r.setSize(vw, vh, false);

    r.setScissor(0, 0, vw, vh);
    r.clear();
    // The grid scrolls on small screens: clip each card's stage to the popup box
    const clip = this.box.getBoundingClientRect();
    this.cards.forEach((c, i) => {
      c.turntable.rotation.y += dt * (i === this.focus ? 1.6 : 0.7);
      const b = c.slot.getBoundingClientRect();
      const left = Math.max(b.left, clip.left), right = Math.min(b.right, clip.right);
      const top = Math.max(b.top, clip.top), bottom = Math.min(b.bottom, clip.bottom);
      if (right <= left || bottom <= top) return;
      this.camera.aspect = b.width / b.height;
      this.camera.updateProjectionMatrix();
      r.setViewport(b.left, vh - b.bottom, b.width, b.height);
      r.setScissor(left, vh - bottom, right - left, bottom - top);
      c.turntable.visible = true;
      r.render(this.scene, this.camera);
      c.turntable.visible = false;
    });
  };
}
