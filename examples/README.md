# examples

Runnable ChoreoBit examples. Each imports the **built** packages through an import
map, so build first (`pnpm install && pnpm build`), then serve the repo root over
HTTP.

- [`canvas-renderer`](./canvas-renderer/) — the `scheduleTimeline` →
  `evaluateSceneAt` → `renderScene` pipeline on a Canvas 2D surface, driven by a
  hand-rolled `requestAnimationFrame` loop.
- [`browser-player`](./browser-player/) — the `@choreobit/player` controller
  driving that same pipeline with a transport bar (play, pause, restart, loop,
  rate, prev/next step). The binary-search scene is authored with
  `@choreobit/authoring` + `@choreobit/primitives`, validated with
  `validateAnimationDefinition`, and shown next to a source viewer the
  synchronizer keeps in step with the same clock.
- [`video-render`](./video-render/) — `@choreobit/video`'s `createFrameRenderer`
  producing a deterministic filmstrip offline: a two-scene `AnimationDefinition`
  authored with `@choreobit/authoring` + `@choreobit/primitives` is rendered to a
  Canvas 2D context by random access, one sampled frame per tile. No clock, no
  `requestAnimationFrame` — the production end of the pipeline a downstream encoder
  would consume.
