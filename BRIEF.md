# Delivery Bot 3D — Project Brief

A browser-native 3D remake of
[phuc-tr/autonomous-delivery-robot](https://github.com/phuc-tr/autonomous-delivery-robot):
a self-adaptive delivery robot driven by a **MAPE-K** loop (Monitor → Analyze →
Plan → Execute over shared Knowledge), now rendered as a living, lit, animated
miniature town instead of a 2D canvas grid.

---

## 1. Goals

| # | Goal | Measure of success |
|---|------|--------------------|
| G1 | **Same brain.** Port the MAPE-K simulation 1:1 so behaviour matches the original. | Same map, same A\*, same brute-force sequencer (≤5 stops), same mission rules (capacity 3, 30 s timeout, replans on block/unblock, stuck detection). |
| G2 | **Everything is 3D.** No 2D icons on the board: robot, houses, supermarket, trees, roadblocks, path, pins and sequence badges are all real geometry in a lit scene. | Every board object casts/receives shadows and can be orbited around. |
| G3 | **Runs smoothly.** 60 fps on a mid-range laptop iGPU, and stays usable on phones. | ≤ ~60 draw calls, instanced repeated props, no per-frame allocations, DPR capped, quality toggle. |
| G4 | **Zero backend.** Static site: `npm run dev` / `npm run build` → deploy anywhere. | No Python, Docker or sockets needed. The sim runs client-side. |
| G5 | **Charm.** Small touches that make you want to keep playing with it (see §6). | — |

Non-goals: multiplayer, external 3D model files (everything is procedural, so
there are no downloads and no licensing issues), and physics engines.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Renderer | **three.js** (vanilla, r17x) | The most mature WebGL library. Direct control over instancing, shaders and post-processing, with no framework overhead. |
| Language / build | **TypeScript + Vite** | Fast HMR, tree-shaken three imports, one-command static build. |
| Camera | `OrbitControls` (damped, clamped) + custom follow-cam | Tactile orbiting, and you can still ride along with the robot. |
| Post-FX | `EffectComposer` → `RenderPass` → `UnrealBloomPass` (subtle) → `OutputPass` | Makes emissives (lamps, path, robot eyes) glow, especially at night. Disabled in "Low" quality. |
| Text in 3D | `CanvasTexture` (supermarket sign, robot face, sequence badges) | Crisp, cheap, and needs no font-loading pipeline. |
| Audio | WebAudio synth (oscillators and envelopes) | Beeps and chimes with zero asset files. Muted by default until the first interaction. |
| UI | Plain DOM overlay + CSS (glass panels) | Accessible, crisp text, and doesn't compete with the canvas. |

---

## 3. Architecture

```
src/
├── sim/                 # Pure TS, no three.js — the original Python, ported
│   ├── grid.ts          # GridWorld (22×15 map, trees, houses, dynamic obstacles)
│   ├── pathfinding.ts   # AStar + DeliveryPlanner (permutations ≤5, NN fallback)
│   ├── robot.ts         # Robot + Order
│   ├── knowledge.ts     # Knowledge base + metrics
│   ├── monitor.ts / analyze.ts / plan.ts / execute.ts
│   └── system.ts        # DeliverySystem: tick(), click(), state + event stream
├── world/               # Rendering — reads sim state, never mutates it
│   ├── stage.ts         # renderer, camera, lights, sky, fog, composer, resize
│   ├── board.ts         # diorama island, paving tiles, grass, picking & hover
│   ├── props.ts         # instanced trees, houses, supermarket, lamps, clouds
│   ├── carriers/        # who delivers: shared motion rig (base.ts) + robot, Grob/Shopoo
│   │                    #   scooters, taxi, quang gánh vendor; swappable at runtime
│   ├── roadblocks.ts    # barrier pool with drop-in / pop-out animation
│   ├── pathline.ts      # flowing-dash ribbon (blue = deliveries, red = return)
│   ├── markers.ts       # pending pins, sequence badges, stuck "!" bubble
│   └── fx.ts            # parcel hop, confetti, scan ripple, chimney smoke
├── ui/hud.ts            # stats, countdown ring, MAPE-K phase ring, event log, controls
├── audio.ts
└── main.ts              # wiring + the fixed-step sim clock + render loop
```

**Sim ↔ render contract.** The sim advances on a fixed step (0.4 s × speed
multiplier, the same default as the original). Each `tick()` returns a list of
**events** (`move`, `mission_start`, `deliver`, `replan`, `stuck`,
`mission_end`, `order_added`, `obstacle_added/removed`). The renderer
interpolates the robot between the previous and current cell using the
fraction of the step that has elapsed, so motion is continuous at any frame
rate and fully decoupled from the sim. Events trigger one-shot effects.

**Sim clock.** Timers (30 s auto-start, delivery times) use a *sim* clock that
speeds up with the speed slider and freezes when paused, instead of wall time.

### Small, intentional deviations from the original

1. The supermarket's three back cells `(0,0) (0,1) (1,0)` are solid (that's
   the building). The robot docks at `(1,1)`, which is the base location in the
   original too, so it never drives through walls.
2. A replan that fails while the robot is already stuck doesn't increment the
   "Replans" metric every tick. Only real adaptations are counted.

Everything else (map layout, house coordinates, tie-break rule "closer stops
first", nearest-neighbour fallback) is kept as-is.

---

## 4. The world (art direction)

**Mood:** a warm, toy-like **floating diorama** of a tiny town. Low-poly,
flat-shaded, soft shadows, slightly saturated pastel palette, gentle fog
fading into a gradient sky. Think *Monument Valley meets a Starship delivery
bot*.

| Object | 3D treatment |
|---|---|
| **Board** | A thick floating island slab (grass top, layered soil and rock sides) carrying 22×15 cells. Walkable cells are sandstone paving tiles with subtle per-tile colour jitter, drawn as one `InstancedMesh`. Tree cells are grass tufts. |
| **Trees** | Two or three low-poly species (round, cone pine, bushy) with randomised scale and yaw, all instanced (trunks plus foliage, about 4 draw calls total) and a soft wind sway. |
| **Houses (12)** | Procedural cottages: body, gable roof, chimney, door, windows. Colours vary per house. Windows glow warmly at night. Hovering one lifts it slightly and outlines its tile. |
| **Supermarket (base)** | A 2-cell shopfront with a striped awning, glass windows, a "SUPER MARKET" sign on a canvas texture, and a glowing **charging/loading pad** at the base cell. |
| **Robot** | A six-wheeled, rounded-box courier with a lid, an LED face screen (eyes blink, and the expression changes: 🙂 normal, 😵 stuck, 😄 delivered), a spinning LIDAR puck and an antenna with an orange safety flag. Wheels roll with distance, the body yaws smoothly into turns and leans a little on acceleration. Small LEDs on its side show the cargo count (0–3). |
| **Roadblocks** | Striped A-frame barriers with a blinking red lamp and a traffic cone. They drop in with a squash-and-stretch bounce and shrink away when removed. |
| **Path** | A ribbon floating just above the tiles with rounded corners and dashes that flow toward the robot's destination. **Blue** marks the delivery leg and **red** the return leg, the same colour code as the original. Only the remaining path is shown. |
| **Pending orders** | A floating, slowly spinning amber map pin over the house. |
| **Delivery sequence** | Numbered badges (1, 2, 3) bobbing above the target houses. |
| **Environment** | Drifting low-poly clouds, street lamps, and a subtle water plane far below the island. |

**Lighting:** hemisphere fill, one shadow-casting sun (PCF soft, 2048² map
fitted tightly to the island) and ACES filmic tone mapping. A **day ↔ night**
toggle eases the sun, sky colours, fog and exposure; at night the lamps,
windows, path and robot eyes are carried by the bloom pass.

---

## 5. Interaction

| Action | Input |
|---|---|
| Add a delivery order | Click a house |
| Place or remove a roadblock | Click an empty tile / an existing roadblock |
| Orbit / zoom / pan | Drag / wheel or pinch / right-drag |
| Follow cam | `F` or button |
| Pause / resume | `Space` or button |
| Sim speed | Slider: 0.5× to 4× |
| Day / night | `N` or button |
| Reset | `R` or button |
| Sound | Mute toggle |
| Quality | High (bloom, 2× DPR, 2048 shadows) / Low (no bloom, 1× DPR, 1024 shadows) |

Hovering a tile shows a glowing cursor whose colour depends on what a click
would do: amber for "order", red for "block", white for "remove", grey for
"not allowed".

---

## 6. Creative touches

1. **MAPE-K phase ring in the HUD.** Four segments (M, A, P, E) light up in
   sequence every tick, and the segment that triggered an adaptation flashes
   with its reason ("Path blocked → replan"). This turns the architecture from
   the original course into something you can *watch*.
2. **Event log.** A short scrolling feed: "📦 ORD_004 queued for House 7",
   "🚧 Replanned around (5,8), +4 cells", "✅ Delivered in 12.3 s".
3. **Parcel hop.** On delivery the lid flips open and a little parcel arcs out
   to the house's door, followed by a confetti puff and a chime.
4. **LIDAR scan ripple.** A translucent ring sweeps outward from the robot
   whenever it replans.
5. **Stuck drama.** A red "!" bubble, the worried face, and the cargo LEDs
   pulse red until a path opens up again.
6. **Countdown ring.** A circular timer for the 30 s auto-start that fills
   with pending-order dots (●●○).
7. **Chimney smoke** curling from houses that are waiting on a delivery.
8. **Docking.** The pad glows brighter and pulses while the robot is loading
   at base.

---

## 7. Performance budget

- Instanced meshes for tiles, grass, trunks, foliage and lamps. Houses are
  merged per house. Target is about 60 draw calls or fewer.
- Shared materials and geometries. No allocations in the render loop
  (temporary vectors are reused).
- Path geometry is rebuilt **only when the plan changes**. Dash flow is a
  uniform.
- Shadow camera is fitted to the island. Static shadows are cheap with a
  single light.
- `devicePixelRatio` is capped at 2 (or 1 in Low quality), and Low quality is
  picked automatically on small or touch screens.
- The render loop sleeps when the tab is hidden (`requestAnimationFrame`
  handles this).

---

## 8. Deliverables & milestones

1. **Sim port** (`src/sim`) behaving like the Python original.
2. **Stage and board.** Island, tiles, lighting, sky, camera and picking.
3. **Props.** Trees, houses, supermarket, lamps and clouds.
4. **Robot.** Model, motion interpolation and expressions.
5. **Dynamic layer.** Roadblocks, path ribbon, pins and badges.
6. **HUD and controls.** Metrics, countdown, MAPE-K ring, log and settings.
7. **Polish.** FX, audio, day/night, quality tiers.
8. **Ship.** `npm run build` produces a static `dist/`, plus a README.
