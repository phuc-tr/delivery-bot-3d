import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type Quality = 'high' | 'low';

interface Look {
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  skyBottom: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  exposure: number;
  bloomStrength: number;
  bloomThreshold: number;
}

const look = (o: Record<string, string | number>): Look => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === 'string' ? new THREE.Color(v) : v;
  return out as unknown as Look;
};

const DAY = look({
  skyTop: '#6ea8dc', skyHorizon: '#e6dccb', skyBottom: '#a9c9de',
  sun: '#ffecd2', sunIntensity: 2.5,
  hemiSky: '#e8eef5', hemiGround: '#8a7a62', hemiIntensity: 1.05,
  exposure: 0.97, bloomStrength: 0.0, bloomThreshold: 1.0,
});

const NIGHT = look({
  skyTop: '#060a22', skyHorizon: '#2a2c5c', skyBottom: '#10143a',
  sun: '#8ea6ff', sunIntensity: 0.45,
  hemiSky: '#4a5aa8', hemiGround: '#141026', hemiIntensity: 0.35,
  exposure: 1.15, bloomStrength: 0.85, bloomThreshold: 0.55,
});

/** Renderer, camera, lighting, sky and post-processing. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: MapControls;
  readonly sun: THREE.DirectionalLight;
  /** 0 = noon, 1 = midnight. Eased toward `nightTarget`. */
  night = 0;
  nightTarget = 0;
  quality: Quality = 'high';

  private readonly hemi: THREE.HemisphereLight;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly stars: THREE.Points;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly nightListeners: ((n: number) => void)[] = [];
  private readonly tmpLook: Look = Object.fromEntries(
    Object.entries(DAY).map(([k, v]) => [k, v instanceof THREE.Color ? v.clone() : v]),
  ) as unknown as Look;

  constructor(container: HTMLElement) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = false;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
    this.camera.position.set(0, 17, 21);

    // Left-drag orbits, middle/right-drag pans, wheel zooms toward the cursor.
    const c = (this.controls = new MapControls(this.camera, r.domElement));
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    // Stop the browser's middle-click autoscroll from hijacking the pan.
    r.domElement.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());
    c.enableDamping = true;
    c.dampingFactor = 0.07;
    c.zoomToCursor = true;
    c.zoomSpeed = 0.9;
    c.rotateSpeed = 0.55;
    c.panSpeed = 1.0;
    c.minDistance = 4;
    c.maxDistance = 42;
    c.maxPolarAngle = Math.PI * 0.47;
    c.minPolarAngle = 0.12;
    c.screenSpacePanning = false;
    c.target.set(0, 0, 0.5);

    // Sky dome: three-stop vertical gradient.
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: DAY.skyTop.clone() },
          horizon: { value: DAY.skyHorizon.clone() },
          bottom: { value: DAY.skyBottom.clone() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top, horizon, bottom;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.75, h), 0.8))
                             : mix(horizon, bottom, smoothstep(0.0, -0.35, h));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(DAY.skyHorizon.clone(), 70, 330);

    this.stars = makeStars();
    this.scene.add(this.stars);

    this.hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemiIntensity);
    this.scene.add(this.hemi);

    const s = (this.sun = new THREE.DirectionalLight(DAY.sun, DAY.sunIntensity));
    s.position.set(-11, 12, 9);
    s.castShadow = false;
    s.shadow.mapSize.set(2048, 2048);
    const sc = s.shadow.camera;
    sc.left = -15; sc.right = 15; sc.top = 12; sc.bottom = -12; sc.near = 2; sc.far = 45;
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.02;
    s.shadow.radius = 3;
    this.scene.add(s, s.target);

    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), DAY.bloomStrength, 0.55, DAY.bloomThreshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.setQuality(this.quality);
    window.addEventListener('resize', () => this.resize());
  }

  onNight(fn: (n: number) => void): void {
    this.nightListeners.push(fn);
    fn(this.night);
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
    const map = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== map) {
      this.sun.shadow.mapSize.set(map, map);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    // Pull back on portrait screens so the whole island fits.
    this.camera.fov = w / h < 1 ? 52 : 38;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  update(dt: number): void {
    if (Math.abs(this.night - this.nightTarget) > 1e-3) {
      const k = 1 - Math.exp(-dt * 1.8);
      this.night += (this.nightTarget - this.night) * k;
      this.applyLook();
    }
  }

  render(): void {
    if (this.quality === 'high') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private applyLook(): void {
    const n = this.night;
    const L = this.tmpLook;
    for (const key of Object.keys(DAY) as (keyof Look)[]) {
      const a = DAY[key], b = NIGHT[key];
      if (a instanceof THREE.Color) (L[key] as THREE.Color).copy(a).lerp(b as THREE.Color, n);
      else (L[key] as number) = a + ((b as number) - a) * n;
    }
    const u = this.sky.material.uniforms;
    u.top.value.copy(L.skyTop);
    u.horizon.value.copy(L.skyHorizon);
    u.bottom.value.copy(L.skyBottom);
    (this.scene.fog as THREE.Fog).color.copy(L.skyHorizon);
    this.sun.color.copy(L.sun);
    this.sun.intensity = L.sunIntensity;
    // The sun swings over to the other side and becomes the moon.
    const a = -0.9 + n * 1.6;
    this.sun.position.set(Math.sin(a) * 14, 12 + n * 3, Math.cos(a) * 10);
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiIntensity;
    this.renderer.toneMappingExposure = L.exposure;
    this.bloom.strength = L.bloomStrength;
    this.bloom.threshold = L.bloomThreshold;
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, n * 1.2 - 0.2);
    this.stars.visible = n > 0.05;
    for (const fn of this.nightListeners) fn(n);
  }
}

function makeStars(): THREE.Points {
  const N = 600;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = 0.08 + Math.random() * 0.9;
    const r = 560;
    pos.set([Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r, Math.sin(u) * Math.sqrt(1 - v * v) * r], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xffffff, size: 3, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false,
  });
  const p = new THREE.Points(g, m);
  p.visible = false;
  return p;
}
