# browser-player example

A minimal, dependency-free demonstration of the `@choreobit/player` controller
driving a real animation loop in the browser, **with the code synchronizer
wired to the same playback clock**. An `AnimationDefinition` is assembled with
the `@choreobit/authoring` builders over the `@choreobit/primitives` object
constructors, validated with `validateAnimationDefinition`, and its scene is
bound to a canvas 2D context and a `requestAnimationFrame` scheduler; a transport
bar exercises the player's public surface, and a side-by-side source viewer
highlights the lines the active semantic step maps to.

## What it shows

- The **animation is authored with the published API**. The binary-search scene
  is built with `defineScene` (from `@choreobit/authoring`) over `text` and
  `rectangle` objects (from `@choreobit/primitives`), its beats are `parallel`
  nodes of `move`/`set` operations, its `SemanticStep`s come from
  `semanticStep`, and its `SourceCode` from `sourceCode` — all composed into one
  `AnimationDefinition` by `defineAnimation`. The result runs through the very
  same `@choreobit/animation` schedule + evaluate and `@choreobit/renderer` pass
  as any other definition.
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
- The **animation is a binary search** of `23` in the sorted array
  `[2, 5, 8, 12, 16, 23, 38, 56, 72]` (found at index 5). Three iterations:
  `mid = 4` (`16 < 23` → `low = 5`), `mid = 6` (`38 > 23` → `high = 5`),
  `mid = 5` (`23 == 23` → found). Each beat is a `Parallel` node on the scene
  timeline; the `low`, `high`, and `mid` pointers and a highlight overlay move
  with the search range.
- **Validation.** Before the player is constructed, the assembled definition is
  passed to `validateAnimationDefinition`; a malformed authoring throws here rather
  than mid-playback.
- **Code synchronisation.** The scene carries seven `SemanticStep`s, each bound
  to the scene and to one or more source lines of `binary_search.py`. A
  `createCodeSyncResolver(steps, sceneId)` is built once; a single
  `player.subscribe` listener resolves the active step and locations from
  `state.currentTime` and lights up the matching source lines. The highlighted
  lines are always the lines the rendered frame corresponds to, because the
  resolver is a pure function of the same clock the player draws.
- The **transport bar** is a thin projection of `PlayerState`: the same
  `subscribe` listener mirrors `status`, `currentTime`, and `duration` onto the
  DOM and feeds the resolver, while the controls call `play`, `pause`,
  `restart`, `setLoop`, and `setPlaybackRate`.
- **Semantic stepping.** The same `steps` feed `Player`'s `semanticSteps`, so the
  transport's **Prev**/**Next** buttons call `player.stepBackward`/`stepForward`,
  jumping the single clock to the next or previous beat's start time (a `seek`),
  and a `beat N of M` readout counts the stops passed. Stepping never starts a
  second clock: it walks the existing `seek` path.
- The renderer supports `rectangle`, `circle`, and `text` objects. This scene is
  a title, nine `text` array cells, three `text` pointers, a `rectangle`
  highlight overlay, and a result label — position and the `text`/`highlight`
  channels only (the contract carries no rotation or scale).

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

Open `http://localhost:3000/examples/browser-player/index.html`, then press
**Play**. As the search runs, the `binary_search.py` source on the right lights
up the line(s) the current iteration is on.

## Files

- `index.html` — the two-panel layout: the canvas and transport on the left, the
  source viewer on the right; plus an import map that binds the six built packages
  (`@choreobit/core`, `@choreobit/primitives`, `@choreobit/authoring`,
  `@choreobit/player`, `@choreobit/animation`, `@choreobit/renderer`) to their
  built `dist/index.js`.
- `main.mjs` — builds the binary-search scene and its semantic steps, creates a
  `Player` with a `requestAnimationFrame` scheduler, builds the source viewer from
  the `binary_search.py` source lines, and wires one `player.subscribe` listener to
  the transport and to a `createCodeSyncResolver`.

This example uses no PixiJS, React, WebGL, FFmpeg, code-editor dependency, or
second playback clock.
