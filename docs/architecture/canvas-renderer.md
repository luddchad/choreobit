# Canvas 2D rendering backend

This document describes the rendering backend owned by `@choreobit/renderer`:
`renderScene`. It is the third piece of _interpretation_ ChoreoBit applies to its
contracts, after scheduling (`timeline-scheduling.md`) and evaluation
(`visual-state-evaluation.md`). Where evaluation reads a `TimelineSchedule` back
into a frame, the renderer draws that frame: it consumes a
`SceneVisualState` (the output of `@choreobit/animation`) and issues a sequence of
commands on a `Canvas2DContext`.

Status: Canvas 2D rendering backend (Task 0.6). No PixiJS, no React, no WebGL, no
FFmpeg. No browser API in the renderer source — the canvas and its context live on
the consumer side.

## 1. What it does

`renderScene(ctx: Canvas2DContext, scene: SceneVisualState, options: RenderOptions):
void` is a **pure drawing pass**. It walks the objects of an evaluated scene and
draws each one, in document order, onto the supplied 2D context.

It does **not**:

- own a surface, a clock, or a timer;
- read the DOM or any browser API;
- mutate its inputs (the scene and its objects are read only);
- schedule or evaluate anything — it draws exactly what it is given;
- depend on a previous render call. Each render starts from a fresh surface.

The renderer is the boundary between the framework's pure core and a concrete
drawing surface. Everything before it (scheduling, evaluation) is environment-free;
everything after it (the canvas, a compositor, a file) is. The renderer is the only
part that talks to a surface, and it does so through a structural interface, so the
framework core stays free of any drawing technology.

## 2. Public API

```ts
import {
  renderScene,
  SUPPORTED_OBJECT_TYPES,
  DEFAULT_STYLE,
  HIGHLIGHT_STYLE,
  RENDERER_ERROR_CODES,
  RendererError,
  isRendererError,
} from '@choreobit/renderer';

// Types (imported for use, re-exported for consumers):
// Canvas2DContext, RenderOptions, Renderer, RendererErrorCode,
// RendererErrorDetails.
```

### `renderScene(ctx, scene, options?)`

The entry point. It clears the surface (see §3), then walks
`scene.objects` depth-first and draws each object and its subtree. It returns
`void`. On an unsupported object type, or a malformed property, it throws a
`RendererError` carrying the offending object and property.

### `Canvas2DContext`

A **structural** interface — the minimal subset of the 2D canvas API the renderer
uses. A real `CanvasRenderingContext2D` satisfies it (that is how the example draws
onto a real canvas), and so does any test mock. Defining the renderer against this
interface — never the DOM type — is what keeps the renderer free of browser APIs.

```ts
interface Canvas2DContext {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  textAlign: string;
  textBaseline: string;
  font: string;
  globalAlpha: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
}
```

### `RenderOptions`

```ts
interface RenderOptions {
  width: number;
  height: number;
  background?: string;
  highlightColor?: string;
  clear?: boolean;
}
```

`width` and `height` are required: the renderer clears and lays out for them, and
never reads them off a surface it does not own. `background`, when present, is the
fill used to clear; when absent, the surface is cleared to transparent.
`highlightColor` is the outline color for highlighted objects, overridden per
object (see §5). `clear` defaults to `true`; when `false`, the surface is left
untouched, letting a caller composite onto existing content.

## 3. Render algorithm

`renderScene` runs two phases:

1. **Clear** (when `clear !== false`). If `background` is present, the surface is
   filled over `[0,0,width,height]` with it. Otherwise the surface is cleared to
   transparent over the same rectangle.
2. **Draw** the tree, depth-first. Each object is rendered on a saved drawing
   state: its position is applied by translating the origin, its opacity
   multiplies the inherited alpha, and the highlight color is resolved once.
   The renderer draws only what the evaluation contract carries — position and
   opacity (plus highlight) — because `EvaluatedObjectState` has no rotation or
   scale channel; it therefore never issues a `rotate` or `scale`, and a `move`
   operation's effect on an object is the translation the renderer applies.
   Children inherit the translation (their positions are relative to the parent)
   and the accumulated alpha — each child's effective alpha is the parent's
   effective alpha times the child's own, composed all the way down the tree, then
   apply their own. A non-visible object draws neither itself nor its subtree, and
   its save/restore is skipped entirely.

The clear is a full-rectangle operation, never a context reset: it does not touch
the transform, the styles, or the alpha, so it never destroys accumulated state.
A render is **idempotent**: rendering the same scene twice yields the same
sequence of commands, because no state carries between calls and no input is
mutated.

## 4. Supported objects

`SUPPORTED_OBJECT_TYPES` is the closed set the renderer draws:

- **`rectangle`** — a centered box from `width`/`height` (both required, both
  positive). Filled with `fill` (default `DEFAULT_STYLE.fill`), and stroked with
  `stroke` at `lineWidth` when a stroke color is present.
- **`circle`** — a centered disc from `radius` (required, positive). Filled with
  `fill`, stroked with `stroke` at `lineWidth` when present.
- **`text`** — a label from `text` (required, a string). Colored with `color`
  (note: text uses `color`, not `fill`), set by `font` composed from
  `fontSize`/`fontFamily` and aligned by `textAlign`/`textBaseline`.

Each shape reads its geometry and style from the object's `properties` (the
user-authored fields of `EvaluatedObjectState`), falling back to `DEFAULT_STYLE`.
A property that is absent, non-numeric where a number is required, or non-positive
where a positive dimension is required raises a `RendererError`. The renderer
never guesses a missing dimension.

## 5. Highlights

When an object's state reports `highlighted`, the renderer draws an outline
emphasizing it:

- A rectangle is outlined with `strokeRect`, padded outward by
  `HIGHLIGHT_STYLE.pad` on every side.
- A circle is outlined with a `stroke` of a path whose arc radius is `radius + pad`.
- A text label is outlined with `strokeText`.

The outline uses `HIGHLIGHT_STYLE.color` and `HIGHLIGHT_STYLE.lineWidth`,
overridden first by the object's own `highlightColor` (when it is a string) and
then by the render option's `highlightColor`. A non-string per-object value is
ignored, so a malformed highlight color never crashes the render — it falls back
to the default.

## 6. Errors

`RENDERER_ERROR_CODES` is the closed set of render failures:

- `unsupportedType` — an object whose type is not in `SUPPORTED_OBJECT_TYPES`.
- `missingProperty` — a required property is absent (e.g. a rectangle with no
  `width`, a text with no `text`).
- `malformedProperty` — a property is present but unusable (e.g. a non-numeric or
  non-positive dimension).
- `invalidContext` — reserved for a context that fails the structural contract.

Each is thrown as a `RendererError` carrying the offending `objectId`, `objectType`,
and (for property errors) `property`, so a caller can locate and report the problem
without parsing the message. `isRendererError` narrows an unknown thrown value.

## 7. Dependency direction

The renderer depends on the framework core's contracts only: `@choreobit/core`
(the object and style types) and `@choreobit/animation` (the `SceneVisualState`,
`EvaluatedVisualObject`, and `EvaluatedObjectState` it draws). It is a leaf in the
dependency graph — nothing it depends on draws, and nothing it draws depends on a
surface. The dependency-boundary check (`scripts/check-deps.mjs`) enforces this.

## 8. Why a structural context

Rendering is the moment a framework usually reaches for a specific technology.
Defining the renderer against `Canvas2DContext` — a structural subset, never the
DOM `CanvasRenderingContext2D` — keeps the renderer free of any browser API, so the
same drawing pass can target a real canvas, a test mock, or (later) a different
surface without changing a line of the renderer. The renderer draws; it never
decides what surface it draws onto.
