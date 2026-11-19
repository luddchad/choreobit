# TypeScript authoring API

This document describes the developer-facing authoring API owned by
`@choreobit/authoring`, with the visual-object constructors of
`@choreobit/primitives`. It is the _authoring_ side of ChoreoBit, the opposite end
of the pipeline from the interpretation packages: where `@choreobit/animation`
schedules and evaluates a timeline and `@choreobit/renderer` draws a frame, the
authoring API is how a human _builds_ the `AnimationDefinition` those packages
consume. It is the ergonomic, typed entry point for assembling an animation by hand
in TypeScript, in the spirit of Manim's `Scene`/`construct`.

Status: TypeScript authoring API (Task 1.0). The builders produce plain
`@choreobit/core` data — they never schedule, evaluate, render, or read a clock,
and they introduce no second animation model. A definition built here runs through
the very same `@choreobit/animation` schedule + evaluate and `@choreobit/renderer`
pass as any other definition; the `browser-player` example loads it through an
import map to prove the output is browser-runnable.

## 1. What it does

`@choreobit/authoring` is a set of pure builders that turn a developer's intent
into a portable, JSON-serializable `AnimationDefinition`. A builder takes plain
arguments and returns one of the `core` contracts: an `Operation`, a composition
node, a `Scene`, a `SemanticStep`, a `SourceCode`, or the `AnimationDefinition`
itself. `@choreobit/primitives` supplies the visual-object constructors a scene's
`objects` are built from: `rectangle`, `circle`, `text`, and `group`.

The two packages split the work:

- `@choreobit/primitives` builds **objects** — the static things on a canvas —
  into lean `VisualObject`s.
- `@choreobit/authoring` builds **time** — the operations that move those objects,
  the composition that places them on a timeline, and the steps and source code
  that map the timeline back to an algorithm.

It does **not**:

- interpret the timeline (no scheduling or evaluation — that is
  `@choreobit/animation`);
- draw anything (no rendering — that is `@choreobit/renderer`);
- own a clock or read the DOM (it is environment-free);
- generate ids (every id is the caller's to supply);
- mutate its inputs (each builder copies the arrays and maps it is given).

The authoring API is the boundary between a developer and the framework's pure
core. Everything after it (scheduling, evaluation, rendering, playback) is
deterministic and environment-free; the authoring API is the only part that
knows a human is at the keyboard, and it expresses that human's intent as the
same data the rest of the pipeline already speaks.

## 2. Public API

```ts
import {
  // composition
  sequence,
  parallel,
  // operations
  move,
  set,
  highlight,
  setVisible,
  // scene + definition
  defineScene,
  defineAnimation,
  // algorithm-to-code mapping
  semanticStep,
  sourceCode,
  // the error a builder throws on a malformed input
  AuthoringError,
} from '@choreobit/authoring';

// The visual-object constructors come from @choreobit/primitives and are
// re-exported through @choreobit/authoring for convenience.
import { rectangle, circle, text, group } from '@choreobit/authoring';

// Validation of an assembled definition, from @choreobit/core.
import { validateAnimationDefinition } from '@choreobit/authoring';
```

`@choreobit/authoring`'s entry point re-exports everything from `@choreobit/core`
and `@choreobit/primitives`, so a single import gives a caller the domain
contracts, the object constructors, and the builders.

### Visual objects (`@choreobit/primitives`)

Each constructor produces a `VisualObject` with a `type` of the matching
`PrimitiveShape` and a lean initial `VisualObjectState`:

| Constructor                     | `type`      | Notes                                                                                                              |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `rectangle(id, options?)`       | `rectangle` | Geometry (`width`, `height`, `fill`, `stroke`, `lineWidth`) lives in `options.properties`.                         |
| `circle(id, options?)`          | `circle`    | `radius`, `fill`, `stroke` live in `options.properties`.                                                           |
| `text(id, content?, options?)`  | `text`      | The `content` argument is stored as `properties.text` and wins over `options.properties.text` when both are given. |
| `group(id, children, options?)` | `group`     | A structural container, not a rendered shape; the renderer composites its `children`.                              |

All four share `PrimitiveOptions`: an optional `position`, `opacity`, `visible`,
`highlighted`, `properties`, and `extensions`. Each field is written to the
object's state **only when the caller supplies it** (and `visible`/`highlighted`
only when they take the non-default value), so a typical object's state stays lean
and the renderer's own defaults stay authoritative for everything left out. None
of the constructors fill in shape defaults.

### Composition nodes

| Builder                      | Produces   | Effect                                                                                                |
| ---------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `sequence(startAt?, ...ops)` | `Sequence` | The operations run back-to-back, the first at `startAt` and each next one when the previous finishes. |
| `parallel(startAt?, ...ops)` | `Parallel` | Every operation begins together at `startAt` and runs for its own duration.                           |

Both accept an optional `startAt` (an omitted `startAt` is `0`) at which the group
begins on its containing scene's timeline, and copy the operations array so the
caller may keep mutating its own list. A composition node is data only: it carries
the operations and their relative placement; the timing of each operation is
computed by `@choreobit/animation` when the timeline is scheduled.

### Operations

| Builder                                            | `type`       | `params`                                                                                                                        |
| -------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `move(id, target, to, duration, options?)`         | `move`       | `{ x, y }` of `to`                                                                                                              |
| `set(id, target, name, value, duration, options?)` | `set`        | `{ name, value }`                                                                                                               |
| `highlight(id, target, options?)`                  | `highlight`  | `{ color }` when a color is given; none otherwise (the renderer's default applies). `duration` defaults to `0` (instantaneous). |
| `setVisible(id, target, options?)`                 | `setVisible` | `{ visible }`; `visible` defaults to `true`, `duration` to `0`.                                                                 |

`move` and `set` take an explicit `duration`; `highlight` and `setVisible` take an
options object whose `duration` defaults to `0`. Every operation builder accepts
the shared `OperationBuilderOptions` (an optional `easing` and `extensions`),
threaded onto the produced `Operation`. Only the fields a builder was given are
written: a missing `params`, `easing`, `extensions`, or `target` stays absent, so
the produced operation carries exactly what the caller asked for. The `id`,
`type`, and `duration` are always present.

### Scene and definition

| Builder                   | Produces              | Effect                                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineScene(config)`     | `Scene`               | Build a scene from its `objects` and a `nodes` timeline. `objects` and `nodes` are copied; `timeline` is always a fresh object with `nodes` defaulting to `[]`.                                                                                                         |
| `defineAnimation(config)` | `AnimationDefinition` | Stitch `scenes`, `semanticSteps`, and `sourceCode` into one portable document. `formatVersion` defaults to `ANIMATION_DEFINITION_FORMAT_VERSION`; `duration`, when omitted, is the **sum of the scenes' durations**, so a caller never keeps the total in sync by hand. |

### Algorithm-to-code mapping

| Builder                    | Produces       | Effect                                                                                                                                                                                                                                                                                                             |
| -------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `semanticStep(id, config)` | `SemanticStep` | Author one meaningful unit of an algorithm that may span many frames. A step is **not** a frame: it can drive several operations over many frames, or have none at all (a pure reasoning step). `start`/`end` are scene-relative and `start` must not exceed `end`. `operations` and `sourceLocations` are copied. |
| `sourceCode(config)`       | `SourceCode`   | Attach the code a student reads alongside the animation: a `language` plus either inlined `content` or an external `reference`. The step-to-source mapping lives on each step's `sourceLocations`, not here.                                                                                                       |

## 3. Errors

Every builder enforces the same rules through shared helpers, throwing an
`AuthoringError` (part of the public API, so a caller can `instanceof` a thrown
value) when given a malformed input:

- an **id** must be a non-empty string (`scene.id`, `move.target`, …);
- a **duration** must be a finite, non-negative number;
- a **coordinate** must be two finite numbers (`move`'s `to`);
- a **start time** must be a finite, non-negative number (`startAt`, step `start`/`end`);
- a `set` **name** must be a non-empty string;
- a step's **description** must be a non-empty string and its **operations** an array of non-empty ids;
- a step's `start` must not exceed its `end`;
- a `sourceCode` **language** must be a non-empty string;
- a definition's **name** must be a non-empty string and its `width`/`height` finite, non-negative numbers.

The point is that a mistake surfaces **at authoring time**, with a message naming
the failing argument, rather than deep in the player. For structural correctness of
an _assembled_ definition, `validateAnimationDefinition` (from `@choreobit/core`,
re-exported here) reuses the same validation the serialization layer uses.

## 4. Putting it together

```ts
const scene = defineScene({
  id: 'binary-search',
  duration: 10,
  objects: [
    title,
    ...cells,
    highlightOverlay,
    text('ptr-low', 'low', { position: { x: 60, y: 190 } }),
    text('ptr-high', 'high', { position: { x: 480, y: 190 } }),
    text('ptr-mid', 'mid', { position: { x: 60, y: 190 } }),
  ],
  nodes: [
    parallel(1.5, move('op-mid-1', 'ptr-mid', { x: 300, y: 190 }, 1)),
    parallel(3, move('op-low-1', 'ptr-low', { x: 360, y: 190 }, 1)),
  ],
});

const animation = defineAnimation({
  id: 'binary-search',
  name: 'Binary Search',
  width,
  height,
  background: { kind: 'solid', color: '#1a1f2b' },
  scenes: [scene],
  semanticSteps: steps,
  sourceCode: sourceCode({ language: 'python', filename: 'binary_search.py', content }),
});
```

`duration` is left to default (the sum of the scenes), so the total is
authoritative and never drifts from the scene. `validateAnimationDefinition`
confirms the assembled definition is well-formed before it reaches the player, so
a malformed authoring surfaces there rather than mid-playback. The
`browser-player` example follows exactly this shape.

## 5. Dependency direction

`authoring` sits above `core`, `primitives`, and `animation` and below nothing: it
is a leaf of the dependency graph, the last package a developer touches. It
produces data only, so it depends on **no rendering package** — keeping the same
definition usable by both `@choreobit/video` and `@choreobit/player`. Because it
depends on no Node-only package, its built `dist/` loads in a browser through an
import map (see `browser-player.md` and the `browser-player` example). The
dependency-boundary check (`scripts/check-deps.mjs`) enforces the approved edge
set; `authoring`'s approved edges are `core`, `primitives`, and `animation`.

A built `authoring` `dist/index.js` carries bare runtime imports of
`@choreobit/core` and `@choreobit/primitives` (the cross-package type imports are
erased), so a browser import map must bind the whole transitive chain the example
uses — `@choreobit/core`, `@choreobit/primitives`, `@choreobit/authoring`,
`@choreobit/player`, `@choreobit/animation`, and `@choreobit/renderer` — to their
built `dist/index.js`.

## 6. Deferred

- A component-style `Scene`/`construct` base class (the current API is flat
  builders; a Manim-style class layer would compose over them).
- A declarative timeline DSL (a string or data-format for the operations a scene
  runs), layered over the composition nodes here.
- Authoring-time previews (rendering a definition in the editor before it is
  exported) — decided when a UI surface exists.
- Validation feedback for an editor (diagnostics from
  `validateAnimationDefinition` surfaced as live errors), decided with the editor.
