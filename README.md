# Delivery Bot 3D 🤖📦

A browser-native 3D remake of
[autonomous-delivery-robot](https://github.com/phuc-tr/autonomous-delivery-robot).
A self-adaptive courier, driven by a **MAPE-K** loop, delivers parcels around a
tiny floating town. It's built with **three.js + TypeScript + Vite** and needs
no backend.

See [`BRIEF.md`](BRIEF.md) for the full design brief.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static site in dist/ — host anywhere
```

## Controls

| Action | Input |
|---|---|
| Order a parcel | Click a house |
| Place / remove roadblock | Click an empty tile / a roadblock |
| Orbit · pan · zoom | Left-drag (one finger) · middle- or right-drag (two fingers) · wheel/pinch (zooms toward the cursor) |
| Move / turn camera | `W` `A` `S` `D` or arrows · `Q` `E` |
| Recentre camera | `H` |
| Choose courier (robot, Grob, Shopoo, taxi, quang gánh) | `C` or the dock button · popup opens on start |
| Pause | `Space` |
| Speed ½× / 1× / 2× / 4× | `1` `2` `3` `4` |
| Follow cam | `F` |
| Mute | `M` |
| Reset | `R` |

## How it maps to the original

| Python original | Here |
|---|---|
| `environment/grid_world.py`, `robot.py` | `src/sim/grid.ts`, `src/sim/robot.ts` |
| `mape_k/*.py` | `src/sim/{knowledge,monitor,analyze,plan,execute}.ts` |
| `utils/pathfinding.py` | `src/sim/pathfinding.ts` (same A\* tie-breaking, brute force for ≤5 stops) |
| Flask + Socket.IO loop | `src/sim/system.ts` + fixed-step loop in `src/main.ts` |
| Canvas grid + PNG icons | `src/world/*` (procedural 3D, all geometry generated in code) |

The simulation runs on a fixed 0.4 s step, the same default as the original,
and the renderer interpolates between steps, so motion stays smooth at any
frame rate. In the console, `sim()` returns the live `DeliverySystem`.
