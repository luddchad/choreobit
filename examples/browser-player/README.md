# browser-player example

A minimal, dependency-free demonstration of the `@choreobit/player` controller
driving a real animation loop in the browser. A core `Scene` is bound to a canvas
2D context and a `requestAnimationFrame` scheduler, and a transport bar exercises
the player's public surface: play, pause, restart, loop, and playback rate.

## What it shows

- The **player is browser-free**. It owns the _logic_ of an animation loop —
  advancing time, evaluating a frame, rendering it, looping or ending — and
  delegates the _timing_ to a `FrameScheduler`. This example supplies the only
  browser-dependent piece, `createRequestAnimationFrameScheduler()`, plus the
  canvas element and its `CanvasRenderingContext2D`.
- The pipeline is **end to end**: `scheduleTimeline` (once, inside the
  constructor) → `evaluateSceneAt` (each frame) → `renderScene` (each frame), all
  imported from the _built_ packages through the import map.
- A `Player` renders a **fixed** scene and **fixed** context. It schedules the
  timeline once and reuses the `TimelineSchedule` across every evaluation; it
  never mutates the scene and never re-schedules.
- The **transport bar** is a thin projection of `PlayerState`: a `subscribe`
  listener mirrors `status`, `currentTime`, and `duration` onto the DOM, while the
  controls call `play`, `pause`, `restart`, `setLoop`, and `setPlaybackRate`.
- The renderer supports `rectangle`, `circle`, and `text` objects. This scene is a
  rectangle that sweeps horizontally over the scene duration, a stationary circle,
  and a text label — position and opacity only (the contract carries no rotation or
  scale).

## Run it

The example imports the **built** packages through an import map, so build them
first:

```sh
pnpm install
pnpm build
```

Then serve the repo root over HTTP (the import map and module script both need a
server, not `file://`):

```sh
npx serve
```

Open `http://localhost:3000/examples/browser-player/index.html`, then press **Play**.

## Files

- `index.html` — the canvas, the transport controls, and the import map that binds
  `@choreobit/player`, `@choreobit/animation`, and `@choreobit/renderer` to their
  built `dist/index.js`.
- `main.mjs` — builds a `Player` over a sweeping-rectangle scene with a
  `requestAnimationFrame` scheduler, then wires the transport controls to its
  public methods and a `PlayerState` subscription.

This example uses no PixiJS, React, WebGL, or FFmpeg.
