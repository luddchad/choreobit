# video-render example

A minimal, dependency-free demonstration of `@choreobit/video` producing a
**deterministic filmstrip** offline. An `AnimationDefinition` is rendered to a
Canvas 2D context at a chosen frame rate, and a grid of frames is captured at
evenly spaced times. It is the offline, batch end of the pipeline — the thing a
downstream encoder or still-frame exporter consumes — as opposed to the
[canvas-renderer](../canvas-renderer/) and
[browser-player](../browser-player/) examples, which draw one frame at a time.

## What it shows

- The renderer is **deterministic by construction**. Frame `n` is `n / fps`
  seconds in, resolved to a scene and local time, evaluated, and drawn — a pure
  function of its index, independent of how many frames were already produced. The
  same index always yields the same frame, so a render is reproducible.
- **Random access**. `renderFrameAtTime(t)` resolves `t` to its nearest frame and
  renders just that one, so the filmstrip can jump to its sample points without
  paying for the frames in between. The sequential `frames()` generator is the lazy
  counterpart a real encoder would drive; both yield identical frames.
- **Scene resolution**. The demo is two scenes, so a global time resolves to the
  scene whose cumulative interval contains it, and to the time relative to that
  scene's start — the renderer's `sceneIndex` / `localTime` are shown on each tile.
- **Not total.** A frame whose evaluation or draw fails throws a `VideoError`
  naming the fault (`'evaluation'` or `'render'`); the example surfaces it to the
  page and stops, because a bad frame is a hard failure, not a skipped one.
- The renderer is **browser-free**: it never owns a clock or an animation frame.
  The canvas, its context, and the offscreen thumbnail canvases live here, on the
  consumer side; a real `CanvasRenderingContext2D` satisfies the renderer's
  `Canvas2DContext` contract by shape.
- The animation is authored with `@choreobit/authoring` over `@choreobit/primitives`
  and validated with `validateAnimationDefinition`, exactly like the player example,
  so the same definition runs through the same `scheduleTimeline` →
  `evaluateSceneAt` → `renderScene` pass. Each scene's timeline is scheduled once at
  construction and reused, so a sampled frame never re-schedules.

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

Open `http://localhost:3000/examples/video-render/index.html`.

## Files

- `index.html` — the filmstrip canvas and the import map that binds
  `@choreobit/core`, `@choreobit/primitives`, `@choreobit/animation`,
  `@choreobit/renderer`, `@choreobit/authoring`, and `@choreobit/video` to their
  built `dist/index.js`.
- `main.mjs` — builds and validates a two-scene `AnimationDefinition`, then renders
  a grid of sampled frames onto a Canvas 2D context with random access.

This example uses no PixiJS, React, WebGL, FFmpeg, audio, or narration — those are
later concerns layered on the deterministic frame sequence this package produces.
