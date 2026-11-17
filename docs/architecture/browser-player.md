# Browser playback controller

This document describes the playback controller owned by `@choreobit/player`:
`Player`. It is the fourth piece of _interpretation_ ChoreoBit applies to its
contracts, after scheduling (`timeline-scheduling.md`), evaluation
(`visual-state-evaluation.md`), and rendering (`canvas-renderer.md`). Where
rendering draws one frame, the player runs the loop that _produces_ frames over
time: it schedules a `Scene`'s timeline once, then advances a clock, evaluates a
frame, and renders it — repeating until the scene ends or loops.

Status: browser playback controller (Task 0.7), with the code synchronizer added in
Task 0.8 (`code-synchronization.md`). No React, no video export, no semantic
stepping. The player source is browser-free: the only browser reference is inside
`createRequestAnimationFrameScheduler`, and it is reached through a capability
check on `globalThis`, so the module type-checks with no DOM `lib` and still runs
in a browser.

## 1. What it does

`new Player(options)` binds one `Scene`, one `Canvas2DContext`, one
`RenderOptions`, and one `FrameScheduler`, and owns the logic of an animation
loop:

- **Advance time** by a measured interval, scaled by the playback rate.
- **Evaluate** the scene at the new time with `evaluateSceneAt` (reusing the
  schedule computed once in the constructor).
- **Render** the resulting `SceneVisualState` with `renderScene`.
- **Stop or loop** when the scene reaches its end, depending on the loop flag.
- **Surface state** to subscribers and report failures.

It does **not**:

- own a clock or call `requestAnimationFrame` itself — timing is delegated to the
  `FrameScheduler`;
- read the DOM; the canvas, its context, and the scheduler live on the consumer
  side;
- mutate the scene or re-schedule it — the schedule is computed once at
  construction and reused across every frame;
- perform semantic stepping, code synchronization, or any authoring-side
  concern — it plays a fixed scene.

The player is the boundary between the framework's pure core and a real
animation loop. Everything before it (scheduling, evaluation, rendering) is
environment-free and deterministic; the loop is the first piece that needs a
clock, and it gets one through a structural contract, so the framework core stays
free of any timing technology.

## 2. Public API

```ts
import {
  Player,
  createRequestAnimationFrameScheduler,
  PlayerError,
  isPlayerError,
  PLAYER_ERROR_CODES,
} from '@choreobit/player';

// Types (imported for use, re-exported for consumers):
// FrameHandle, FrameScheduler, PlayerOptions, PlayerState,
// PlayerStateListener, PlayerErrorCode.
```

### `Player`

The controller. Its public surface:

| Member                  | Effect                                                         |
| ----------------------- | -------------------------------------------------------------- |
| `constructor(options)`  | Bind scene/context/options/scheduler; schedule the timeline.   |
| `play()`                | Start or resume from the current time. No-op if playing.       |
| `pause()`               | Stop the loop, keeping the current time. No-op if not playing. |
| `restart()`             | Return to time 0, paused, clearing any error. Does not play.   |
| `seek(time)`            | Jump to a clamped time, paused.                                |
| `setPlaybackRate(rate)` | Set the rate (must be finite and positive).                    |
| `setLoop(loop)`         | Toggle looping.                                                |
| `getState()`            | Return a fresh immutable `PlayerState` snapshot.               |
| `subscribe(listener)`   | Subscribe to state changes; returns an unsubscribe function.   |
| `destroy()`             | Cancel the pending frame, clear subscribers, mark destroyed.   |

Public readonly fields: `scene`, `context`, `renderOptions`, `frameScheduler`,
`schedule`, `duration`.

### `PlayerOptions`

```ts
interface PlayerOptions {
  scene: Scene;
  context: Canvas2DContext;
  renderOptions: RenderOptions;
  frameScheduler: FrameScheduler;
  playbackRate?: number; // default 1
  loop?: boolean; // default false
}
```

`scene`, `context`, and `renderOptions` are required: a player renders a fixed
scene onto a fixed surface, and a render must know the surface's `width`/`height`
(see `canvas-renderer.md` §2). `frameScheduler` is the only timing source; a
browser supplies `createRequestAnimationFrameScheduler()`, a test supplies a
deterministic fake. `playbackRate` defaults to `1` and `loop` to `false`.

### `FrameScheduler`

```ts
interface FrameScheduler {
  request(callback: (timeMs: number) => void): FrameHandle;
  cancel(handle: FrameHandle): void;
}

type FrameHandle = number;
```

The minimal frame-clock contract the loop is driven through. The player never
inspects a handle — it only passes it back to the same scheduler that produced
it, so a handle may be any value the host runtime returns (a browser
`requestAnimationFrame` returns a positive integer; a test may return an
incrementing counter). Cancelling a handle that is already fired, already
cancelled, or unknown is a no-op: the player always cancels its own handle on
pause/seek/destroy, and a host must tolerate being asked to cancel something it
no longer holds.

Decoupling timing from logic is what makes the player unit-testable without a
browser and without `Date.now`: a fake scheduler hands the player whatever
timestamps it chooses, so a test drives playback exactly.

### `createRequestAnimationFrameScheduler()`

Builds a `FrameScheduler` on top of the host's
`requestAnimationFrame`/`cancelAnimationFrame`. It is the **only** place the
player touches the browser frame clock, and it does so through a capability check
on `globalThis` (not a hard reference), throwing a plain `Error` when the two
functions are absent. That is why the module type-checks under the library
`tsconfig` (which sets `lib: ["ES2022"]`, `types: []` — no DOM globals) yet still
compiles and runs in a browser. The returned scheduler is the value a browser host
hands to a player.

### `PlayerState`

An immutable snapshot handed to every subscriber on a change; a fresh object is
produced for each notification, so a subscriber may hold the last one without it
mutating underneath it. It is a _projection_ of the player's full state — enough
for a UI to render a transport bar — not the whole internal state.

```ts
interface PlayerState {
  readonly status: 'paused' | 'playing' | 'ended';
  readonly currentTime: number;
  readonly duration: number;
  readonly playbackRate: number;
  readonly loop: boolean;
  readonly error?: PlayerError;
}
```

## 3. The loop

Each tick the scheduler invokes the player with the host's timestamp (in
milliseconds):

1. **Seed or measure.** The first tick after a (re)start seeds the clock — it
   records `lastFrameMs` and advances no time — so the next tick measures a real
   delta. Subsequent ticks advance by
   `deltaSeconds = (timeMs - lastFrameMs) / 1000`.
2. **Advance and fold.** The raw time `currentTime + deltaSeconds * playbackRate`
   is folded into the current time: when looping, it wraps into `[0, duration)`
   (guarded by a non-zero duration); otherwise it is clamped to `[0, duration]`,
   and reaching the duration ends playback.
3. **Render.** The frame at the new time is evaluated and rendered (see §4).
4. **Continue.** If playback is still live after the frame — not ended by the
   advance and not failed by the render — the next frame is scheduled.

A zero-duration scene ends immediately after rendering its single frame: `play()`
renders `t = 0`, sets the status to `'ended'`, and schedules no further frames.

The loop is **single-pending**: at most one frame callback is outstanding at a
time. `play`, `pause`, `restart`, and `seek` cancel the pending frame before
rescheduling or stopping, so a rapid sequence of calls never leaves two callbacks
queued.

## 4. Per-frame evaluation and render

Each frame runs through the same pipeline the renderer document describes, twice
over its two stages:

1. **Evaluate.** `evaluateSceneAt(scene, schedule, time)` returns a discriminated
   union: `{ ok: true; state }` or `{ ok: false; error }`.
2. **Render.** On `ok`, `renderScene(context, state, renderOptions)` draws the
   frame; a successful render clears any prior error and notifies subscribers
   (even when the status did not change, so a UI can refresh its time readout
   every frame).

A failure surfaces instead of drawing a partial frame:

- **Evaluation failure** (`ok: false`) stops the loop, sets the status to
  `'paused'`, records a `PlayerError` of code `'evaluation'` (wrapping the
  underlying `EvaluationError` as its `cause`), and notifies. No frame is
  rendered.
- **Render failure** (a thrown `RendererError` or any error) stops the loop,
  sets the status to `'paused'`, records a `PlayerError` of code `'render'`
  (wrapping the thrown value as its `cause`), and notifies. No further frame is
  rendered.

`play()` clears any recorded error before resuming, so a recovered player plays
on. A subsequent successful frame clears a stale error the same way.

## 5. Errors

`PLAYER_ERROR_CODES` is the closed set of player failures:

- `evaluation` — a frame failed to evaluate (an underlying `EvaluationError`).
- `render` — a frame's render threw (an underlying `RendererError`).
- `invalid` — an argument to a player method was invalid (e.g. a non-positive or
  non-finite playback rate).
- `destroyed` — a player method was called after `destroy()`.

A `PlayerError` carries a machine-readable `code`, a human-readable `message`,
and a `cause` (the standard `Error` `cause`, available both as `error.cause` and
through `error.stack`). `isPlayerError` narrows an unknown thrown value.

A player surfaces failures two ways. A **usage** failure (an invalid argument, a
call after destruction) throws a `PlayerError` synchronously — `setPlaybackRate`
rejects a non-positive or non-finite rate with code `'invalid'`, and every method
after `destroy()` throws with code `'destroyed'`. A **playback** failure (a frame
that fails to evaluate or render) does **not** throw: it stops the loop, sets the
status to `'paused'`, records the `PlayerError` on the state, and notifies, so a
host UI can show "paused because …" without an unhandled exception. The same error
type carries both, distinguished by `code`.

## 6. Subscribers and notifications

`subscribe(listener)` adds a listener and returns an unsubscribe function. A
listener receives a fresh `PlayerState` snapshot whenever the player's status,
time, rate, loop flag, or error changes — on `play`, `pause`, `restart`, `seek`,
and on every tick. Each listener is invoked through a `try`/`catch` so a throwing
listener neither aborts the loop nor prevents other listeners from being notified.

By design, `setPlaybackRate` and `setLoop` are **silent** mutations: they update
the player's state but do not notify. Their effects are observed on the next tick
(or read through `getState()`), keeping the notification stream tied to the
frames a UI actually renders.

## 7. Dependency direction

The player depends on the framework's contracts and its two interpretation
stages: `@choreobit/core` (the `Scene` it plays and the object/state types),
`@choreobit/animation` (`scheduleTimeline`, `evaluateSceneAt`, the
`TimelineSchedule`, and the `SceneVisualState`/`EvaluatedObjectState` it
evaluates into), and `@choreobit/renderer` (`renderScene`, and the
`Canvas2DContext`/`RenderOptions` contracts it draws through). It is the top of
the runtime interpretation chain — `renderer` is a leaf, the player sits above
it — and `@choreobit/react` (when built) will sit above the player. The
dependency-boundary check (`scripts/check-deps.mjs`) enforces the approved edge
set, and `player` is one of the two browser-facing runtime packages checked for
the absence of Node-only dependencies.

A built player's `dist/index.js` carries bare runtime imports of
`@choreobit/animation` and `@choreobit/renderer` (the cross-package `Scene`/
`RenderOptions` imports are type-only and erased), so a browser import map must
bind all three — `@choreobit/player`, `@choreobit/animation`, and
`@choreobit/renderer` — to their built `dist/index.js`.

## 8. Why a structural scheduler

An animation loop is the moment a framework usually reaches for a specific
technology: `requestAnimationFrame`, a `window.setInterval`, a game-loop library.
Defining the loop against `FrameScheduler` — a structural two-method contract,
never a concrete timer — keeps the player free of any timing source, so the same
loop can run on a real `requestAnimationFrame`, a deterministic test fake, or
(later) a different clock without changing a line of the player. The player
advances and renders; it never decides what clock drives it.

## 9. Deferred

- Semantic stepping (jumping to meaningful moments in a scene) — out of scope for
  this task; a future concern built on top of the schedule.
- Source-code synchronization (linking frames to editor state) — delivered in
  Task 0.8 as the code synchronizer; see `code-synchronization.md`.
- A React binding (`@choreobit/react`) that wraps a `Player` in a component —
  decided when `react` is built.
- A seek UI (a draggable scrubber) — the `seek` API exists and is exercised by
  tests; the browser example wires play/pause/restart/loop/rate and leaves the
  scrubber to the consumer.
