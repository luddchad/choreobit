# Visual-state evaluation

This document describes the evaluation transform owned by
`@choreobit/animation`: `evaluateSceneAt`. It is the second piece of _interpretation_
ChoreoBit applies to the timeline contracts owned by `@choreobit/core`, after
scheduling (`timeline-scheduling.md`). Where scheduling places the operations of a
`Timeline` onto the scene-relative timeline, evaluation reads them back into a
frame: the total visual state of every object at one instant.

Status: deterministic evaluation transform (Task 0.5). No rendering, no surface,
no clock, no host-environment API.

## 1. What it does

`evaluateSceneAt(scene: Scene, schedule: TimelineSchedule, time: number):
SceneEvaluation` is a **pure, total, deterministic** function. It produces the
visual state of every object of a `Scene` at one time by replaying, on each
object's initial state, every scheduled operation that has begun by that time.

It does **not**:

- render a frame or touch any surface;
- advance a clock or read a timer;
- mutate its inputs;
- throw. A scene it cannot interpret yields an error in the result, not a
  throw.

## 2. Public API

```ts
import {
  evaluateScene,
  evaluateSceneAt,
  SUPPORTED_OPERATION_KINDS,
  EVALUATION_ERROR_CODES,
  EvaluationError,
  applyEasing,
  clamp01,
  lerp,
  lerpPosition,
  progressFor,
} from '@choreobit/animation';
import type {
  EvaluatedObjectState,
  EvaluatedVisualObject,
  SceneVisualState,
  SceneEvaluation,
  EvaluationErrorCode,
} from '@choreobit/animation';
```

### `evaluateSceneAt(scene, schedule, time): SceneEvaluation`

The evaluator. `scene` is a `Scene` (from `@choreobit/core`); `schedule` is the
`TimelineSchedule` of the scene's timeline; `time` is the instant, in seconds,
relative to the scene. The result is a `SceneEvaluation` (below). The inputs are
read, never mutated.

The `schedule` need not be the one `scheduleTimeline(scene.timeline)` returns; a
caller may reuse a prebuilt schedule across many times.

### `evaluateScene(scene, time): SceneEvaluation`

A convenience: it schedules the scene's timeline and evaluates it in one step —
the composition `evaluateSceneAt(scene, scheduleTimeline(scene.timeline), time)`,
for a caller that has a `Scene` but not a prebuilt schedule.

### `SceneEvaluation`

The result of an evaluation. It is a discriminated union:

```ts
type SceneEvaluation =
  | { readonly ok: true; readonly state: SceneVisualState }
  | { readonly ok: false; readonly error: EvaluationError };
```

A well-formed evaluation yields a `SceneVisualState`; a scene that asks for
something the evaluator cannot interpret yields an `EvaluationError`.

### `SceneVisualState` / `EvaluatedVisualObject` / `EvaluatedObjectState`

A fresh snapshot of the scene's visual state at the evaluation time:

| Field     | Type                               | Meaning                                         |
| --------- | ---------------------------------- | ----------------------------------------------- |
| `time`    | `number`                           | The evaluated time, in seconds.                 |
| `objects` | `readonly EvaluatedVisualObject[]` | The scene's evaluated objects, in source order. |

Each `EvaluatedVisualObject` mirrors the source `VisualObject` — `id`, `type`, and
`children` (always present, in source order) — but its `state` is the total
`EvaluatedObjectState`:

| Field             | Type               | Meaning                                                                  |
| ----------------- | ------------------ | ------------------------------------------------------------------------ |
| `position?`       | `{ x; y }`         | Present when the source or a `move` set it; else absent.                 |
| `opacity?`        | `number`           | Present when the source or a `set opacity` set it; else absent.          |
| `visible`         | `boolean`          | **Always present.** Defaults `true`; a `setVisible` may make it `false`. |
| `highlighted`     | `boolean`          | **Always present.** Defaults `false`; a `highlight` makes it `true`.     |
| `highlightColor?` | `unknown`          | Present only when an active `highlight` carries a `color`.               |
| `properties`      | `{ [k]: unknown }` | **Always present** (empty when none). Numeric values interpolate.        |
| `extensions?`     | `{ [k]: unknown }` | Copied through from the source object's state.                           |

`EvaluatedObjectState` is the renderer-facing counterpart of `VisualObjectState`.
Where the source state is fully optional, an evaluated state is **total**: the
fields a renderer always reads (`visible`, `highlighted`, `properties`) are
present with deterministic defaults, so a frame can be rendered without a second
pass of default-filling.

### The math helpers

The pure, renderer-agnostic math behind interpolation, exported for reuse and
testing:

| Function                         | Meaning                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `lerp(from, to, t)`              | Linear interpolation of two scalars by `t` in `[0,1]`.     |
| `lerpPosition(from, to, t)`      | Linear interpolation of two `Vector2`s, per axis.          |
| `progressFor(time, scheduled)`   | The eased elapsed fraction of a scheduled operation.       |
| `applyEasing(fraction, easing?)` | A fraction through a named easing curve; identity if none. |
| `clamp01(x)`                     | Clamp into `[0, 1]`.                                       |
| `EASING_CURVES`                  | The closed table of named curves.                          |

## 3. The replay

Evaluation is a deterministic replay, but the operations do **not** run against a
single running value. Instead, each object owns an independent **channel** for
every kind of value it can hold — `position`, `opacity`, `visible`, `highlight`,
and one channel per property name. Each operation contributes a segment to the
channel of the value it writes, and the channels are sampled independently at the
evaluation time.

For each object, the evaluator:

1. **Seeds** each channel from the object's initial `VisualObjectState` and the
   fixed defaults — `visible` defaults to `true` (an explicit `false` is
   respected), `highlighted` defaults to `false`, `position` defaults to the
   origin when positioned, `opacity` is absent unless the source or a `set` gives
   it one. The seeds are **deep copies**, so the source scene is never aliased.
2. **Routes** every scheduled operation to the channel of the value it writes,
   in the schedule's chronological order. Routing one operation never reads or
   writes another object's channels, so the routing pass is independent of which
   object an operation targets.
3. **Freezes** each channel's value at `time` into a renderer-facing
   `EvaluatedObjectState`.

Children are simulated independently: each object in the scene tree gets its own
set of channels and its own routing; the snapshot mirrors the source tree so a
renderer can walk it the same way.

Because each operation writes one channel and the channels are independent,
evaluation is a pure function of `time`: it reads the schedule and the source
state, never a value computed by an earlier call.

### Overlapping operations

Two operations on the same channel may overlap on the timeline. Each operation
captures its `from` value from the channel's settled state **at its own start**
(its predecessor's value at that instant, or the seed if it is first), then takes
**precedence from its start onward**. A later operation that starts inside an
earlier one's interval interpolates from the earlier value at the later start;
the earlier one keeps governing until the later one begins. This is
history-independent: a segment's `from` is fixed at route time, so re-evaluating
at a different `time`, or evaluating later times first, never changes an earlier
time's result. When two operations start at the same instant, the one later in
the schedule is the active segment.

## 4. The supported operations

The evaluator interprets the kinds in `SUPPORTED_OPERATION_KINDS`:

```
move, set, highlight, setVisible
```

- **`move`** interpolates the object's position from its current value (or the
  origin `{0, 0}` if never positioned) to `params.{x, y}` over the operation's
  interval. `x` and `y` must both be finite numbers; a missing or non-numeric
  coordinate is a malformed operation.
- **`set`** writes a single value, selected by `params.name`, to either the
  object's opacity (name `'opacity'`) or a named property. `params.name` must be a
  string and `params.value` must be present. When both the current value and the
  target are finite numbers the value **interpolates** over the interval;
  otherwise it **snaps** to the target at the start (a discrete change).
- **`highlight`** marks the object as the current focus. It is a discrete change
  that takes effect at the start and **persists** (there is no un-highlight
  operation), so it is independent of duration and easing. An optional
  `params.color` is carried through as `highlightColor`.
- **`setVisible`** toggles visibility. `params.visible` selects the new
  visibility; an omitted value defaults to `true`. A present value must be a
  boolean; any other type is a malformed operation. The change is discrete and
  takes effect at the start.

The interpreters **compose per channel**: each operation contributes a segment to
the channel of the value it writes, and a later segment interpolates from the
earlier segment's value at the later start. A second `move` interpolates from the
first `move`'s result; a `set` on `opacity` interpolates from a prior opacity.
Segments on different channels (`position` vs. `opacity` vs. a property) are
independent and may overlap freely.

### Easing

A continuous operation (`move`, and the numeric case of `set`) interpolates over
its interval `[start, end]` using the operation's `easing` curve. The raw
fraction `(time - start) / duration` is clamped to `[0, 1]` and passed through the
curve, so the value is well-defined at and beyond the boundaries: before `start`
the fraction is `0` (the eased `from`), at or after `end` it is `1` (the eased
`to`), and an operation of duration `0` is instantaneous (`1` at or after its
start). `progressFor` is the single place the interval's edges are enforced; an
interpreter reads a fraction already in `[0, 1]`.

## 5. Errors

The remaining `OperationKind`s (`transform`, `addObject`, `removeObject`,
`connect`, `disconnect`, `annotation`) are **not** yet interpreted. Encountering
one at or before the evaluation time is a **reported error**, not a silent no-op,
so a gap in interpretation can never hide in a rendered frame.

Evaluation is total: it never throws. A broken scene yields an
`EvaluationError` in the `{ ok: false }` branch, naming the **first** offending
operation, so a caller can surface where evaluation stopped. The walk halts at
that operation; later operations are not applied.

`EvaluationErrorCode` is the closed set of failure classes:

| Code                   | When it is reported                                                         |
| ---------------------- | --------------------------------------------------------------------------- |
| `unsupportedOperation` | A scheduled operation uses a kind the evaluator does not interpret.         |
| `missingTarget`        | A scheduled operation targets an object id absent from the scene.           |
| `malformedOperation`   | A scheduled operation's parameters are missing a field or of a wrong shape. |

`EVALUATION_ERROR_CODES` exposes the same members as a readonly tuple, so a
caller can enumerate the codes (e.g. to build a UI) without re-typing them.

`EvaluationError` extends `Error` (it has `message` and `stack`, and
`name === 'EvaluationError'`) and also carries the structured fields:

| Field            | Type                  | Meaning                               |
| ---------------- | --------------------- | ------------------------------------- |
| `code`           | `EvaluationErrorCode` | The class of failure.                 |
| `operationId?`   | `string`              | The id of the offending operation.    |
| `operationType?` | `OperationKind`       | The kind of the offending operation.  |
| `target?`        | `string`              | The object id the operation targeted. |

The `message` is human-readable and self-describing: it incorporates the
offending operation's id and kind, so an error stands alone without a second
lookup. A malformed parameter that surfaces as a host `TypeError` (for example,
`params` is not an object) is wrapped into a `malformedOperation`
`EvaluationError`, so the result is still a `SceneEvaluation`.

## 6. Purity and determinism

`evaluateSceneAt` is pure:

- It reads its inputs and returns a fresh `SceneVisualState` on every call.
- It never mutates the `Scene`, its objects, or the `TimelineSchedule`.
- It has no side effects: no timers, no I/O, no global state.
- Two calls on equal inputs produce structurally equal snapshots (different
  object identities, equal by deep equality), and the snapshots do **not** alias
  one another.
- For a given `(scene, schedule, time)` the result is fixed.

The returned snapshot shares **no references** with the source scene: the mutable
fields are deep-copied out (position, properties, and extensions by structural
copy), so the evaluator is free to run again from the same source without seeing a
prior frame's writes, and two snapshots of the same scene do not alias one
another.

## 7. What this is not

- **Not scheduling.** It consumes a `TimelineSchedule`; it does not place
  operations. A caller may pass any schedule, not only the one
  `scheduleTimeline` produces.
- **Not rendering.** No surface, frame, or pixel is touched; the snapshot is data
  a renderer consumes.
- **Not a clock.** It is a function of its argument `time` only.
- **Not partial.** It is total: it never throws, and an uninterpretable scene
  yields an error in the result.
- **Not a subset of the kinds.** Only `move`, `set`, `highlight`, and
  `setVisible` are interpreted; the others are reported errors, not no-ops.

## 8. Source layout

```
packages/animation/src/
├── index.ts                  # public API re-exports
├── scheduling/               # Task 0.4: scheduleTimeline
│   ├── types.ts
│   └── schedule.ts
├── evaluation/
│   ├── types.ts             # EvaluatedObjectState, EvaluatedVisualObject,
│   │                        # SceneVisualState, SceneEvaluation,
│   │                        # SUPPORTED_OPERATION_KINDS
│   ├── error.ts             # EvaluationErrorCode, EVALUATION_ERROR_CODES,
│   │                        # EvaluationError
│   ├── easing.ts            # EASING_CURVES, applyEasing, clamp01
│   ├── interpolation.ts     # lerp, lerpPosition, progressFor
│   ├── operations.ts        # channel model: InitialChannels, ChannelTable,
│   │                        # routeSchedule, sampleChannel, freezeChannels
│   ├── cloning.ts           # deepCloneJsonValue, deepCloneJsonMap
│   └── evaluate.ts          # evaluateSceneAt, evaluateScene
└── __tests__/
    ├── schedule.test.ts      # the scheduling suite (Task 0.4)
    └── evaluate.test.ts      # the evaluation suite
```

The internal helpers in `operations.ts`, `cloning.ts`, and `evaluate.ts`
(`seedFor`, `classifyTarget`, `routeSchedule`, `sampleChannel`,
`deepCloneJsonValue`, and the per-channel samplers) are not exported.

## 9. Tests

`packages/animation/src/__tests__/evaluate.test.ts` covers: the evaluation
primitives (`lerp`, `progressFor`, `applyEasing`, `clamp01`); the full named-easing
set; a scene with no timeline (initial state, default `visible`/`highlighted`,
empty `properties`, extensions, nested children); `move` interpolation from the
origin and from an initial position, at and beyond the interval end, with easing,
and the malformed-coordinate case; `set` for numeric interpolation, discrete
snapping, and the `opacity` special case, plus the malformed `name`/`value`
cases; `highlight` persistence and `highlightColor`; `setVisible` toggling, the
`true` default, and the non-boolean case; the three error classes
(`unsupportedOperation`, `missingTarget`, `malformedOperation`), including that
the walk names the first offending operation and stops; operation composition
(a later `move` from an earlier `move`, a later `set` from an earlier one, a
discrete and a continuous change on one object); overlapping operations
(a later overlapping move captures its `from` at its own start and takes
precedence from there, overlap independence of evaluation order, a discrete set
erasing the opacity channel, a move and a set overlapping on different channels,
sequential chaining, and same-start precedence); operations that begin after the
time are not applied; `evaluateScene` convenience; deep immutability (a snapshot
owns its nested `properties`/`extensions` structure, a `set`'s cloned value does
not alias the source, two evaluations do not alias one another, and a source
mutation after evaluation does not reach a prior snapshot); and
purity/determinism (no mutation of the source, equal and non-aliasing repeated
snapshots).

Run them with `pnpm test` from the repository root.
