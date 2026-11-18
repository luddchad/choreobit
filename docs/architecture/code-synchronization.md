# Code synchronization

This document describes the code synchronizer owned by `@choreobit/player`:
`resolveCodeSync` and its companions `createCodeSyncResolver`, `resolveSteps`, and
`CodeSyncError`. It is the bridge between an animation's _visual_ timeline and the
_source code_ a student reads alongside it. Where the player (§
`browser-player.md`) runs the loop that produces frames over time, the code
synchronizer answers a different question at each instant: **which semantic step —
and which lines of source — does the frame at time `t` correspond to?**

Status: code synchronizer (Task 0.8). The resolver is a pure function of
`(steps, sceneId, time)`: it owns no clock, no state, and no DOM, so it is
trivially testable and may be driven by the player's own clock without the two
ever sharing one. A code _viewer_ (the DOM that paints highlighted lines) is a
consumer concern, demonstrated in `examples/browser-player/`.

## 1. What it does

Given the semantic steps of a scene and a scene-relative time, the resolver
returns the steps active at that time and the union of the source locations those
steps reference:

- **Active steps.** A step is active at `t` when `start <= t < end`, in the
  steps' declared order. Steps whose `sceneId` does not match the resolver's
  `sceneId` are ignored; a step with no `sceneId` matches any scene (and is
  included when resolving across all scenes).
- **Active locations.** The union of the `sourceLocations` of the active steps,
  de-duplicated by position and ordered by line then column. A step with no
  `sourceLocations` contributes none; several steps may contribute the same line.

The mapping is intentionally **not** one-to-one: a step may reference several
lines (e.g. `mid = (low + high) // 2` and `if a[mid] == target`), and several
steps may reference the same line (every iteration of a loop re-runs the same
source lines). The resolver's output is the value a code viewer renders.

## 2. Public API

```ts
import {
  resolveCodeSync,
  createCodeSyncResolver,
  resolveSteps,
  CodeSyncError,
  isCodeSyncError,
} from '@choreobit/player';

// Types (imported for use, re-exported for consumers):
// CodeSyncResolution, CodeSyncResolver.
```

### `CodeSyncResolution`

The active mapping at one instant of a scene, and the value a code viewer
renders:

```ts
interface CodeSyncResolution {
  readonly activeStepIds: readonly string[];
  readonly activeLocations: readonly SourceLocation[];
}
```

Both fields are plain, freshly-allocated, readonly arrays, so a caller may read
or hold a result without aliasing a prior one or leaking the resolver's
internals.

### `resolveCodeSync(steps, sceneId, time)`

```ts
function resolveCodeSync(
  steps: readonly SemanticStep[],
  sceneId: string | undefined,
  time: number,
): CodeSyncResolution;
```

The pure core. `sceneId` scopes the lookup to one scene (or `undefined` to
resolve across every step); `time` is a finite, non-negative scene-relative time
in seconds. It validates the steps (see §4) and returns the active steps and
locations at `time`.

### `createCodeSyncResolver(steps, sceneId)`

```ts
interface CodeSyncResolver {
  resolve(time: number): CodeSyncResolution;
  readonly sceneId: string;
}

function createCodeSyncResolver(
  steps: readonly SemanticStep[],
  sceneId: string | undefined,
): CodeSyncResolver;
```

A pre-validated, scene-scoped resolver for the hot playback loop. Building one
validates the steps **once** (for the given `sceneId`) and caches the active
steps for that scene, so calling `resolve(time)` on every frame re-runs only the
cheap time test — no re-validation, no re-allocation of the step list. The
returned `sceneId` is the id the resolver was built for (or `''` when resolving
across all scenes).

### `resolveSteps(steps, sceneId)`

```ts
function resolveSteps(
  steps: readonly SemanticStep[],
  sceneId: string | undefined,
): readonly SemanticStep[];
```

The scoping step on its own: it returns the subset of `steps` that apply to
`sceneId` (or all of them when `sceneId` is `undefined`). It is the part
`resolveCodeSync` and `createCodeSyncResolver` share.

### `CodeSyncError`

```ts
class CodeSyncError extends Error {}
function isCodeSyncError(value: unknown): value is CodeSyncError;
```

A `CodeSyncError` carries a human-readable `message` and a machine-readable
`name`/`code` (`'invalid'`). `isCodeSyncError` narrows an unknown thrown value.

## 3. Wiring to the player

The resolver and the player share one clock but no state. The player owns the
playback clock and notifies subscribers with a `PlayerState` snapshot that
carries `currentTime`; the resolver reads that time. A single
`player.subscribe` listener projects the same `PlayerState` onto both a transport
bar and a code viewer:

```ts
const resolver = createCodeSyncResolver(steps, scene.id);

player.subscribe((state) => {
  // transport bar: status, currentTime, duration, error
  applyResolution(resolver.resolve(state.currentTime)); // code viewer
});
```

Because `resolve` is a pure function of `state.currentTime`, the highlighted lines
are always the lines the frame the player draws corresponds to. There is **no**
second playback clock and **no** second evaluator: the player is the single source
of time, and the resolver is a read-only view onto it. A code viewer is the
consumer-side DOM that paints the highlighted lines; the resolver itself never
touches the DOM.

## 4. Validation

Both `resolveCodeSync` and `createCodeSyncResolver` validate their steps, throwing
a `CodeSyncError` on the first violation:

- a step whose `start` or `end` is not finite, is negative, or whose `end`
  precedes its `start`;
- a `sourceLocation` whose `line` is not a positive integer.

`createCodeSyncResolver` validates once, at construction, so a malformed step
surfaces before the first frame; `resolveCodeSync` validates on every call.

## 5. Dependency direction

The synchronizer lives in `@choreobit/player` alongside the controller, because
it is driven by the player's clock and reads the player's `PlayerState`. It
depends on `@choreobit/core` for the `SemanticStep`, `SemanticSteps`, and
`SourceLocation`/`SourceCode` types it maps over; it adds no new runtime
dependency and no new third-party package. The dependency-boundary check
(`scripts/check-deps.mjs`) enforces the approved edge set; the synchronizer
introduces none.

## 6. What it is not

- It is **not** semantic _stepping_ — it does not advance or jump time; it only
  reports what is active at a given time. Stepping is a sibling concern
  (`stepping.ts`), built from the same steps but answering the inverse question:
  "what is the next (or previous) beat?" rather than "what is active now?".
- It is **not** a code editor or a syntax highlighter — it maps time to line
  numbers; painting (and any language-aware highlighting) is the viewer's job.
- It is **not** a second clock or a second evaluator — it reads the player's
  clock and never re-derives scene state.

## 7. Deferred

- A language-aware code viewer (tokenized highlighting) — a consumer concern;
  the resolver supplies line numbers, the viewer supplies the rendering.
- Cross-scene scrubbing UI — the resolver resolves one scene at a time; a
  multi-scene scrubber is the consumer's to build.
