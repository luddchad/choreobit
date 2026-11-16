# examples

Runnable ChoreoBit examples. Each imports the **built** packages through an import
map, so build first (`pnpm install && pnpm build`), then serve the repo root over
HTTP.

- [`canvas-renderer`](./canvas-renderer/) — the `scheduleTimeline` →
  `evaluateSceneAt` → `renderScene` pipeline on a Canvas 2D surface, driven by a
  hand-rolled `requestAnimationFrame` loop.
- [`browser-player`](./browser-player/) — the `@choreobit/player` controller
  driving that same pipeline with a transport bar (play, pause, restart, loop,
  rate).
