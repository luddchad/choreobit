# Deterministic video-frame rendering

This document describes the frame renderer owned by `@choreobit/video`:
`createFrameRenderer` and the `FrameRenderer` it returns. It is the fourth piece of
_interpretation_ ChoreoBit applies to its contracts, after scheduling
(`timeline-scheduling.md`), evaluation (`visual-state-evaluation.md`), and drawing
(`canvas-renderer.md`). Where `renderer` draws one evaluated frame, this package
stitches the whole pipeline — scheduling, evaluation, drawing — into a reproducible
sequence of frames at a chosen frame rate: the thing a downstream encoder or a
still-frame export consumes.

Status: deterministic frame rendering (Task 1.1). No encoding, no audio, no
narration, no browser API in the source — a real `CanvasRenderingContext2D`
satisfies the renderer's `Canvas2DContext` by shape, and a test supplies a
recording mock of the same shape.

## 1. What it does

`createFrameRenderer(definition, fps, context, options?)` returns a `FrameRenderer`
that turns an `AnimationDefinition` into a sequence of frames on a
`Canvas2DContext`. Each frame is produced by the same three-step pass the rest of
the pipeline runs: resolve the frame's timestamp to a scene and a local time,
evaluate that scene at the local time, and draw the resulting `SceneVisualState`.

It does **not**:

- own a surface, a clock, or a timer;
- create a `document`, an animation frame, or any browser object;
- encode, mix audio, or narrate — those are later layers on the frame sequence;
- mutate the source definition or its scenes. It reads them and hands the renderer a
  fresh `SceneVisualState` per frame;
- re-schedule a timeline. Each scene's `TimelineSchedule` is built once at
  construction and reused for every frame.

The renderer is the boundary between the framework's pure core and a frame stream a
downstream consumer reads. Everything before it (scheduling, evaluation, drawing one
frame) is environment-free; the renderer is what adds a _frame rate_ and turns the
continuous timeline into a discrete, index-addressable sequence.

## 2. Public API

```ts
import {
  createFrameRenderer,
  FrameRenderer,
  frameTimestamp,
  getFrameCount,
  resolveSceneAtTime,
  VIDEO_ERROR_CODES,
  VideoError,
  isVideoError,
} from '@choreobit/video';

// Types (imported for use, re-exported for consumers):
// FrameInfo, FrameRendererOptions, ResolvedScene,
// VideoErrorCode, VideoErrorDetails.
```

### `createFrameRenderer(definition, fps, context, options?)`

The entry point. It validates its arguments once, precomputes each scene's
`TimelineSchedule`, and returns a `FrameRenderer` bound to that definition, frame
rate, and context. It is the only constructor; a caller never builds a
`FrameRenderer` directly.

### `FrameRendererOptions`

```ts
interface FrameRendererOptions {
  clear?: boolean;
  background?: string;
  width?: number;
  height?: number;
  highlightColor?: string;
}
```

Every field is optional and falls back to a value derived from the definition: the
canvas size defaults to the definition's `width`/`height`, the background to the
definition's solid background color (when it has one), and `clear` to `true`. A
caller supplies a field only to override one of these. The `background` and
`highlightColor` are threaded into the renderer's `RenderOptions`; the width,
height, and `clear` complete the `RenderOptions` the renderer needs (it reads none
off the context, which it does not own).

### `FrameInfo`

```ts
interface FrameInfo {
  readonly index: number;
  readonly time: number;
  readonly sceneIndex: number;
  readonly localTime: number;
  readonly state: SceneVisualState;
}
```

The result of one frame render. It names the frame produced (`index`, `time`), the
scene it resolved to (`sceneIndex`, `localTime`), and the fresh `SceneVisualState`
that was drawn (`state`) — so a caller can log progress, write sidecar metadata, or
drive a downstream encoder without re-deriving any of it. `state` shares no
references with the source scene.

## 3. Frame timing

An `AnimationDefinition` carries all timing in **seconds** and no frame rate; the
renderer selects a frame rate and converts time to frame indices as it renders. Two
pure helpers do the conversion.

### `frameTimestamp(index, fps)`

Frame `index` is rendered at `index / fps` seconds. This is the value a frame's
`time` field holds, and the inverse of the index conversion applied when a
timestamp is the input (see §4). It has no zero-guard: `fps` is validated positive
at construction, so a zero rate never reaches it — and a bare `0 / 0` is `NaN` by
JavaScript's arithmetic, which the tests assert.

### `getFrameCount(duration, fps)`

The count is `ceil(duration * fps)`: a duration that ends mid-frame still earns its
final frame, so the last frame's timestamp never precedes the duration. A
floating-point guard then trims any spurious extra frame that rounding inflated past
the duration (e.g. `3.0000001s` at `30fps` would otherwise yield `91` frames instead
of `90`). A non-positive duration or a non-positive rate yields `0` frames, so a
zero-duration animation has no frames to render.

## 4. Scene resolution

### `resolveSceneAtTime(scenes, time)`

Returns a `ResolvedScene` — the scene that owns a global `time`, its index, and the
time relative to the scene's start:

```ts
interface ResolvedScene {
  readonly scene: Scene;
  readonly sceneIndex: number;
  readonly localTime: number;
}
```

Scenes execute sequentially in array order; scene `i` occupies the half-open
interval `[start_i, start_i + duration_i)`, where `start_i` is the sum of the
durations of all earlier scenes. A global time resolves to the scene whose interval
contains it, and `localTime` is `time - start_i`, clamped to
`[0, scene.duration]`.

The intervals are half-open on the right, so a time exactly on a boundary (e.g.
`t = duration_0`) belongs to the _next_ scene at `localTime = 0`, never to the one
that just ended. A time at or past the total duration resolves to the final scene,
clamped to its end. The caller guarantees `scenes` is non-empty — an empty array is
rejected at construction, not here.

## 5. The frame renderer

`FrameRenderer` owns one definition, one frame rate, and one context. Three entry
points expose its frames; all three delegate to `renderFrame`, so they produce
identical frames for identical indices.

### `renderFrame(index)`

Renders the frame at `index` and returns its `FrameInfo`. `index` must be an integer
in `[0, framesCount)`. The frame's timestamp is `index / fps`; it resolves to a
scene and local time, that scene is evaluated, and the result is drawn. The frame is
independent of every frame already produced — only its index and the frame rate
matter.

### `renderFrameAtTime(time)`

Renders the frame nearest `time`, in seconds. The time is clamped to
`[0, duration]` and rounded to the nearest frame index at the renderer's rate, then
delegated to `renderFrame`. Because the time is clamped, the index always falls in
range for a non-empty animation, so this never throws `'invalidFrameIndex'` (a
zero-duration animation has no frames and does). It is the random-access entry point:
a filmstrip or a seek jumps to a sample point without paying for the frames in
between.

### `frames()`

A lazy generator that yields every frame's `FrameInfo` in order. It draws frame
`n` only when the caller asks for it, so a caller can stop early without paying for
the remaining frames. It is the sequential counterpart to `renderFrame`'s random
access — the one a real encoder drives — and it yields the same frames.

The getters `framesCount`, `frameRate`, and `duration` report the renderer's
parameters without re-deriving them.

## 6. Determinism and totality

The renderer is **deterministic by construction**. Frame `n` is `n / fps` seconds
in, resolved to a scene and local time, evaluated, and drawn — a pure function of
its index and the frame rate. The same index always yields the same frame, so a
render is reproducible and independent of how the frames were produced: a
`renderFrameAtTime` filmstrip and a sequential `frames()` pass agree frame for
frame. Each scene's timeline is scheduled once at construction, so no frame
re-schedules, and the renderer mutates nothing but the context it draws on.

Rendering is **not** total. A frame whose evaluation fails throws a `VideoError`
with code `'evaluation'`, and a frame whose draw throws throws one with code
`'render'`. A bad frame is a hard failure, not a skipped one, so a defect can never
hide inside a produced frame.

## 7. Errors

`VIDEO_ERROR_CODES` is the closed set of frame-render failures:

- `invalidDefinition` — construction received a definition with an empty `scenes`
  array, or a non-finite/non-positive `duration`, `width`, or `height`.
- `invalidFps` — construction received a non-finite or non-positive frame rate.
- `invalidFrameIndex` — `renderFrame` received a non-integer or out-of-range index.
- `evaluation` — a frame's evaluation failed, wrapping the underlying
  `EvaluationError`.
- `render` — a frame's draw threw, wrapping the underlying `RendererError`.

Each is thrown as a `VideoError` carrying a `code`, a `message`, and a `cause` (the
underlying error, when the failure wrapped one), so a caller can branch on the code,
read the message, or recover the original failure. The codes are deliberately
distinct from `EvaluationErrorCode` and `RendererErrorCode`: a `VideoError` unifies
the failures of both, plus its own, under one type it owns — mirroring how
`@choreobit/player`'s `PlayerError` unifies the same two. `isVideoError` narrows an
unknown thrown value.

## 8. Dependency direction

The renderer depends on the framework core's contracts only: `@choreobit/core`
(the `AnimationDefinition`, `Scene`, and timing types), `@choreobit/animation`
(the `scheduleTimeline` and `evaluateSceneAt` it drives, and the `SceneVisualState`
it draws), and `@choreobit/renderer` (`renderScene` and the structural
`Canvas2DContext`). It is the production end of the pipeline — it consumes the
outputs of scheduling, evaluation, and drawing, and produces a frame sequence. The
dependency-boundary check (`scripts/check-deps.mjs`) enforces this: `@choreobit/video`
is allowed to depend on `@choreobit/core`, `@choreobit/animation`, and
`@choreobit/renderer` only.

## 9. Why a structural context and a browser-free package

Rendering is the moment a framework usually reaches for a specific technology and a
browser. Defining the renderer against `Canvas2DContext` — the structural subset
`renderer` already uses, never the DOM `CanvasRenderingContext2D` — keeps
`video` free of any browser API: a real canvas context satisfies it by shape, a
test supplies a recording mock of the same shape, and no `document`, animation
frame, or clock appears in the source. The same holds for the package as a whole:
it is environment-agnostic and could run in the browser, but its purpose is offline
production, so it is checked by `scripts/check-deps.mjs` for absence of
Node-only dependencies just as the browser packages are checked for absence of
Node-only ones. The package draws frames; it never decides what consumes them.
