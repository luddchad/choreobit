# canvas-renderer example

A minimal, dependency-free demonstration of the ChoreoBit pipeline on a Canvas 2D
surface. It schedules a core `Scene` once with `scheduleTimeline`, evaluates a
frame with `evaluateSceneAt` on every animation frame, and hands the resulting
`SceneVisualState` to `renderScene`, which draws it onto a real 2D canvas
context.

## What it shows

- The renderer is a **pure drawing pass**: it issues commands on a
  `Canvas2DContext` and touches no DOM. The canvas element and its context live
  on the consumer side.
- The pipeline is **end to end**: `scheduleTimeline` → `evaluateSceneAt` →
  `renderScene`. The evaluator reads a `Scene` and a `TimelineSchedule` and
  returns a fresh `SceneVisualState`; the renderer draws it. Neither mutates its
  inputs.
- A `SceneVisualState` is the renderer's only input: each object carries a total
  `EvaluatedObjectState` (position, opacity, and properties) plus a subtree of
  children. The contract carries **no rotation or scale**, so the renderer draws
  position and opacity only; the one `move` operation drives the rectangle's
  horizontal sweep via the translation the renderer applies.
- The renderer supports `rectangle`, `circle`, and `text` objects, with fills,
  strokes, opacity composition, and highlighted outlines.

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

Open `http://localhost:3000/examples/canvas-renderer/index.html`.

## Files

- `index.html` — the canvas and the import map that binds `@choreobit/animation`
  and `@choreobit/renderer` to their built `dist/index.js`.
- `main.mjs` — schedules a `Scene` (a rectangle that sweeps horizontally, a
  stationary circle, and a text label), then evaluates and renders each frame.

This example uses no PixiJS, React, WebGL, or FFmpeg.
