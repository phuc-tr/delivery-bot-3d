import * as THREE from 'three';
import { type Cell, sameCell } from './sim/grid';
import type { SimEvent } from './sim/knowledge';
import { DeliverySystem, type TickResult } from './sim/system';
import { Stage } from './world/stage';
import { Board } from './world/board';
import { Props } from './world/props';
import { carrierInfo, type Carrier, type CarrierKind } from './world/carriers';
import { Roadblocks } from './world/roadblocks';
import { PathLine } from './world/pathline';
import { Markers } from './world/markers';
import { HouseLabel } from './world/houselabel';
import { Fx } from './world/fx';
import { City } from './world/city';
import { Landscape } from './world/landscape';
import { CameraRig } from './world/camera';
import { cellToWorld } from './world/common';
import { Hud, type LogKind } from './ui/hud';
import { HelpPanel } from './ui/help';
import { loadCourier, picker, saveCourier } from './courier';
import { Sfx } from './audio';

const BASE_STEP = 0.4; // seconds per MAPE-K iteration at 1× (same as the original)

// ---------- scene ----------
const app = document.getElementById('app')!;
const stage = new Stage(app);
let sys = new DeliverySystem();
const board = new Board(sys.world);
const props = new Props(sys.world);
// Picked on the boot screen just before this module was loaded
let carrierKind = loadCourier();
let robot: Carrier = carrierInfo(carrierKind).make();
const blocks = new Roadblocks();
const path = new PathLine();
const markers = new Markers();
const houseLabel = new HouseLabel();
new HelpPanel();
const fx = new Fx();
const city = new City(sys.world);
const rig = new CameraRig(stage.camera, stage.controls);
rig.onManual = () => setFollow(false);
stage.scene.add(new Landscape().group, city.group, board.group, props.group, robot.group, blocks.group, path.mesh, markers.group, fx.group, houseLabel.sprite);
stage.onNight((n) => {
  props.setNight(n);
  city.setNight(n);
  robot.setNight(n);
});

const sfx = new Sfx();

// ---------- state ----------
let paused = false;
let speed = 1;
let follow = false;
let acc = 0;
let moved = false;
let moveFrom: Cell = sys.robot.position;
// Visual endpoints of the current step. Houses fill their cell, so the robot parks on the doorstep.
const fromV = new THREE.Vector3();
const toV = new THREE.Vector3();
let t = 0;
const stepDur = () => BASE_STEP / speed;

const hud = new Hud({
  pause: () => setPaused(!paused),
  speed: (v) => setSpeed(v),
  follow: () => setFollow(!follow),
  sound: () => setMuted(!sfx.muted),
  quality: () => setQuality(stage.quality === 'high' ? 'low' : 'high'),
  reset: () => reset(),
  carrier: () => picker.show(carrierKind, true),
});
picker.onPick = (k) => setCarrier(k, true);

function setPaused(p: boolean) {
  paused = p;
  hud.setPaused(p);
}
function setSpeed(v: number) {
  speed = v;
  hud.setSpeed(v);
}
function setFollow(on: boolean) {
  follow = on;
  rig.follow = on;
  // Wheel still zooms while following, but toward the courier rather than the cursor,
  // otherwise each notch would drag the view off it and the follow would fight back.
  stage.controls.zoomToCursor = !on;
  hud.setFollow(on);
}
function setMuted(m: boolean) {
  sfx.muted = m;
  if (!m) sfx.unlock();
  hud.setMuted(m);
}
function setQuality(q: 'high' | 'low') {
  stage.setQuality(q);
  hud.setQuality(q);
}
/** Swap who does the deliveries, mid-run if need be: the new carrier picks up exactly where the old one was. */
function setCarrier(kind: CarrierKind, announce = false) {
  const info = carrierInfo(kind);
  hud.setCarrier(info.name);
  if (kind === carrierKind) return;
  carrierKind = kind;
  saveCourier(kind);
  const next = info.make();
  next.place(robotWorld, robot.heading);
  next.cargo = robot.cargo;
  next.stuck = robot.stuck;
  next.expression = robot.expression === 'happy' ? 'idle' : robot.expression;
  next.setNight(stage.night);
  robot.dispose();
  robot = next;
  stage.scene.add(robot.group);
  fx.ripple(robotWorld);
  if (announce) {
    sfx.order();
    log(`🔄 ${info.hello}`);
  }
}

/** Orders delivered per house (cellKey → count), for the hover card. */
const deliveredAt = new Map<string, number>();
/** Who lives where, in map order. */
const HOUSE_NAMES = [
  'Rose Cottage', 'Maple House', 'Willow Lodge', 'Ivy Corner', 'Sunny Nook', 'Oak Villa', 'Lavender Den',
  'Birch Bungalow', 'Pebble Place', 'Honey Hut', 'Fern Hollow', 'Cedar Cabin', 'Poppy Patch', 'Juniper Home',
  'Clover Court', 'Daisy Dell',
];
const houseName = (cell: Cell) => {
  const i = sys.world.deliveryLocations.findIndex((d) => sameCell(d, cell));
  return HOUSE_NAMES[i] ?? `House ${i + 1}`;
};
const robotWorld = new THREE.Vector3();
const tmpA = new THREE.Vector3();

function log(text: string, kind: LogKind = 'info') {
  hud.log(text, kind);
}

// ---------- sim → world ----------
function handleEvents(events: SimEvent[]) {
  for (const ev of events) {
    switch (ev.type) {
      case 'order_added': {
        sfx.order();
        const h = props.houseAt(ev.order.deliveryLocation);
        if (h) h.bounce = 1;
        log(`📦 ${ev.order.orderId} queued for ${houseName(ev.order.deliveryLocation)}`);
        hud.fadeHint();
        break;
      }
      case 'obstacle_added':
        sfx.block();
        log(`🚧 Roadblock placed at (${ev.cell[0]}, ${ev.cell[1]})`, 'warn');
        break;
      case 'obstacle_removed':
        sfx.unblock();
        log(`🧹 Roadblock cleared at (${ev.cell[0]}, ${ev.cell[1]})`);
        break;
      case 'move':
        moved = true;
        moveFrom = ev.from;
        fromV.copy(toV);
        cellToWorld(ev.to, toV);
        if (sys.world.isHouse(ev.to)) toV.lerp(cellToWorld(ev.from, tmpA), robot.doorGap); // stop at the front door
        break;
      case 'mission_start': {
        sfx.depart();
        // Lock the camera onto the bot; panning (middle/right drag or WASD) breaks free again
        setFollow(true);
        // ...and glide in close for the ride. Scrolling cancels it and zoom stays free after.
        rig.zoomTo(8);
        props.pulsePad();
        const route = ev.sequence.map((c) => houseName(c)).join(' → ');
        log(`🚀 Departing with ${ev.orders.length} order${ev.orders.length > 1 ? 's' : ''}: ${route} (${ev.length} cells)`, 'good');
        break;
      }
      case 'replan': {
        sfx.replan();
        fx.ripple(robotWorld);
        const d = ev.delta === 0 ? 'same length' : `${ev.delta > 0 ? '+' : ''}${ev.delta} cells`;
        log(`🔁 Replanned: ${ev.reason.toLowerCase()} (${d})`, 'warn');
        break;
      }
      case 'stuck':
        sfx.stuck();
        fx.ripple(robotWorld);
        log('⛔ No route left! Waiting for a roadblock to clear', 'bad');
        break;
      case 'deliver': {
        const dk = `${ev.order.deliveryLocation}`;
        deliveredAt.set(dk, (deliveredAt.get(dk) ?? 0) + 1);
        const h = props.houseAt(ev.order.deliveryLocation);
        robot.celebrate(t);
        if (h) {
          fx.parcelHop(robotWorld, h.door, () => {
            fx.burst(h.door);
            sfx.deliver();
            h.bounce = 1;
          });
        }
        log(`✅ ${ev.order.orderId} delivered to ${houseName(ev.order.deliveryLocation)} in ${ev.seconds.toFixed(1)} s`, 'good');
        break;
      }
      case 'mission_end':
        sfx.home();
        props.pulsePad();
        log('🏠 Back at base. Mission complete');
        break;
    }
  }
}

function refresh() {
  const k = sys.knowledge;
  blocks.sync(sys.world.dynamicObstacles.values());
  markers.setPending(k.pendingOrders.map((o) => o.deliveryLocation));
  markers.setSequence(k.missionInProgress ? k.deliverySequence : []);
  markers.setAlert(k.isStuck);

  const plan = k.currentPlan;
  if (plan && k.missionInProgress) {
    const start = Math.max(0, k.currentPlanIndex - 1);
    let cells = plan.slice(start);
    let offset = start;
    if (moved) {
      cells = [moveFrom, ...cells];
      offset -= 1;
    }
    path.set(cells, sys.returnLegStart() - offset);
  } else {
    path.set([], 0);
  }

  robot.cargo = sys.robot.loadedOrders.length;
  robot.stuck = k.isStuck;
  if (robot.expression !== 'happy') robot.expression = !k.missionInProgress && !k.pendingOrders.length ? 'sleep' : 'idle';

  hud.setStatus(sys.robot.position, robot.cargo, sys.robot.maxCapacity, k.pendingOrders.length, k.isStuck);
  hud.setMetrics(k.getMetrics());
}

function tick() {
  moved = false;
  const res: TickResult = sys.tick();
  handleEvents(res.events);
  refresh();
}

function reset() {
  sys = new DeliverySystem();
  deliveredAt.clear();
  acc = 0;
  moved = false;
  moveFrom = sys.robot.position;
  cellToWorld(moveFrom, toV);
  fromV.copy(toV);
  robotWorld.copy(toV);
  robot.place(toV);
  log('↺ Simulation reset');
  refresh();
}

// ---------- input ----------
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let pointerInside = false;
let downAt: { x: number; y: number } | null = null;
let dragged = false;
const canvas = stage.renderer.domElement;

function pickCell(): Cell | null {
  raycaster.setFromCamera(pointer, stage.camera);
  return board.pick(raycaster.ray, sys.world);
}

canvas.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pointerInside = e.pointerType === 'mouse';
  // A middle/right-drag pans the map, which takes over from follow cam.
  if (downAt && !dragged && (e.buttons & 6) && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) {
    dragged = true;
    rig.manual();
  }
});
canvas.addEventListener('pointerleave', () => (pointerInside = false));
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  downAt = { x: e.clientX, y: e.clientY };
  dragged = false;
});
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || e.button !== 0) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return; // that was an orbit drag
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const cell = pickCell();
  if (!cell) return;
  handleEvents(sys.click(cell));
  refresh();
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  sfx.unlock();
  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      setPaused(!paused);
      break;
    case 'f': setFollow(!follow); break;
    case 'r': reset(); break;
    case 'm': setMuted(!sfx.muted); break;
    case 'h': rig.home(); break;
    case 'c': picker.show(carrierKind, true); break;
    case '1': setSpeed(0.5); break;
    case '2': setSpeed(1); break;
    case '3': setSpeed(2); break;
    case '4': setSpeed(4); break;
  }
});

// ---------- loop ----------
const clock = new THREE.Clock();
let smokeTimer = 0;
const introFrom = new THREE.Vector3(-14, 34, 40);
let fpsFrames = 0;
let fpsTime = 0;
let fpsChecked = false;

let frozen = false;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  // While the courier popup is up the town sits frozen behind it: one last frame, then no work
  // at all, so the previews (and the backdrop blur over a static image) get the whole GPU.
  if (picker.isOpen) {
    if (!frozen) stage.render();
    frozen = true;
    return;
  }
  frozen = false;
  t += dt;

  // The sim holds still while the courier popup is up
  if (!paused && !picker.isOpen) {
    sys.time += dt * speed;
    acc += dt;
    let guard = 0;
    while (acc >= stepDur() && guard++ < 8) {
      acc -= stepDur();
      tick();
    }
    if (guard >= 8) acc = 0;
  }
  const alpha = paused ? Math.min(1, acc / stepDur()) : acc / stepDur();

  // Robot position: interpolate along the cell it is crossing this step
  robotWorld.lerpVectors(fromV, toV, moved ? Math.min(1, alpha) : 1);
  robot.target.copy(robotWorld);
  robot.update(dt, t);
  path.update(t, moved ? Math.min(1, alpha) : 0, stage.night);

  // Hover cursor + house highlight
  let hovered;
  if (pointerInside) {
    const cell = pickCell();
    const intent = cell ? sys.intentAt(cell) : 'none';
    board.setCursor(cell, intent);
    // Translucent barrier where a click would drop one (hidden mid-drag so orbiting stays clean)
    blocks.preview(intent === 'block' && !downAt ? cell : null);
    hovered = props.houseAt(cell);
    // Stays up through clicks: ordering just updates the numbers in place
    if (hovered) {
      const key = `${hovered.cell}`;
      const mine = (o: { deliveryLocation: Cell }) => `${o.deliveryLocation}` === key;
      houseLabel.set({
        cell: hovered.cell,
        name: houseName(hovered.cell),
        waiting: sys.knowledge.pendingOrders.filter(mine).length + sys.robot.loadedOrders.filter(mine).length,
        delivered: deliveredAt.get(key) ?? 0,
      });
    } else {
      houseLabel.set(null);
    }
    hud.setCanClick(intent !== 'none');
  } else {
    board.setCursor(null, 'none');
    blocks.preview(null);
    houseLabel.set(null);
  }

  board.update(dt, t);
  city.update(t);
  props.update(dt, t, hovered);
  blocks.update(dt, t);
  markers.update(dt, t, stage.camera, robotWorld);
  houseLabel.update(dt, t);
  fx.update(dt);

  // Chimney smoke over houses still waiting for their parcel
  smokeTimer -= dt;
  if (smokeTimer <= 0) {
    smokeTimer = 0.3;
    const waiting = new Set([...sys.knowledge.pendingOrders, ...sys.robot.loadedOrders].map((o) => `${o.deliveryLocation}`));
    for (const h of props.houses) if (waiting.has(`${h.cell}`)) fx.puff(h.chimney);
  }

  const k = sys.knowledge;
  hud.setCountdown(sys.countdown(), k.missionTimeout, k.pendingOrders.length, k.missionInProgress);

  rig.update(dt, robotWorld);
  stage.update(dt);
  stage.render();

  // Drop to low quality if this device is struggling
  if (!fpsChecked && !rig.busy) {
    fpsFrames++;
    fpsTime += dt;
    if (fpsTime > 3) {
      fpsChecked = true;
      if (fpsFrames / fpsTime < 38 && stage.quality === 'high') {
        setQuality('low');
        log('⚙️ Switched to LQ graphics for smoother frames');
      }
    }
  }
}

// ---------- boot ----------
const lowEnd = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
setQuality(lowEnd ? 'low' : 'high');
setPaused(false);
setSpeed(1);
setFollow(false);
setMuted(false);
setCarrier(carrierKind);
cellToWorld(sys.robot.position, toV);
fromV.copy(toV);
robotWorld.copy(toV);
robot.place(toV);
rig.intro(introFrom);
refresh();
log('👋 Welcome! Click houses to order parcels');
stage.renderer.setAnimationLoop(frame);
requestAnimationFrame(() => requestAnimationFrame(() => hud.hideLoader()));

// Exposed for debugging in the console
Object.assign(window, {
  sim: () => sys,
  carrier: (k: CarrierKind) => setCarrier(k, true),
  clickCell: (r: number, c: number) => {
    handleEvents(sys.click([r, c]));
    refresh();
  },
});
