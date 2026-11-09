# Timeline scheduling

This document describes the scheduling transform owned by `@choreobit/animation`:
`scheduleTimeline`. It is the first piece of _interpretation_ ChoreoBit applies
to the timeline contracts owned by `@choreobit/core`. Where `core` is **data
only** — it describes _what_ an animation contains but computes nothing at
runtime — `animation` places the operations of a `Timeline` onto the
scene-relative timeline.

Status: deterministic scheduling transform (Task 0.4). No interpolation, easing
evaluation, or rendering exists yet.

## 1. What it does

`scheduleTimeline(timeline: Timeline): TimelineSchedule` is a **pure,
deterministic** transformation. It flattens every operation of every top-level
node of a `Timeline` into a single, chronologically ordered list, and reports the
overall end time.

It does **not**:

- interpolate values or evaluate easing curves;
- render frames or touch any surface;
- mutate its input;
- use any timer, clock, or host-environment API.

It performs only the placement of operations on the timeline.

## 2. Public API

```ts
import { scheduleTimeline } from '@choreobit/animation';
import type { ScheduledOperation, TimelineSchedule } from '@choreobit/animation';
```

### `scheduleTimeline(timeline: Timeline): TimelineSchedule`

Takes a `Timeline` (from `@choreobit/core`) and returns a `TimelineSchedule`. The
input is read only and never mutated.

### `ScheduledOperation`

A single operation, positioned on the scene-relative timeline:

| Field            | Type                       | Meaning                                                               |
| ---------------- | -------------------------- | --------------------------------------------------------------------- |
| `operation`      | `Operation`                | The original operation, **by reference** (never copied).              |
| `operationId`    | `string`                   | The operation's id, copied out for convenience.                       |
| `start`          | `number`                   | Seconds relative to the scene at which the operation begins.          |
| `end`            | `number`                   | `start` + `duration`.                                                 |
| `duration`       | `number`                   | The operation's own duration; `0` is an instantaneous change.         |
| `nodeIndex`      | `number`                   | Position of the containing node among the timeline's top-level nodes. |
| `operationIndex` | `number`                   | Position of the operation within its node.                            |
| `nodeKind`       | `'sequence' \| 'parallel'` | The kind of the containing node.                                      |

### `TimelineSchedule`

| Field        | Type                            | Meaning                                                          |
| ------------ | ------------------------------- | ---------------------------------------------------------------- |
| `operations` | `readonly ScheduledOperation[]` | The flattened operations, in chronological order.                |
| `duration`   | `number`                        | The overall end time: the largest node end time; `0` when empty. |

## 3. Scheduling rules

The rules implement, as computation, the semantics `core` describes as data. See
`core-domain-model.md` §"Timeline scheduling" for the source of truth on the
data side.

- **An omitted `startAt` is `0`.** A node that names no `startAt` begins at the
  start of the scene.
- **`Sequence`: operations run consecutively in array order.** The first
  operation begins at the sequence's `startAt`; each subsequent operation begins
  when the previous one finishes. The sequence's duration is the sum of its
  operations' durations, so its end time is `startAt` + that sum.
- **`Parallel`: operations run simultaneously.** Every operation begins at the
  group's `startAt` and runs for its own duration, so operations with different
  durations end at different times. The group's duration is the maximum of its
  operations' durations, so its end time is `startAt` + that maximum.
- **Independent top-level nodes are not chained.** Each node's `startAt` is
  relative to the containing scene, not to the preceding node. Two top-level
  nodes may overlap on the scene timeline.
- **Empty nodes.** A node with no operations has duration `0` and an end time of
  `startAt` (an omitted `startAt` is `0`).
- **Overall duration.** `TimelineSchedule.duration` is the largest node end time
  across all top-level nodes, or `0` when the timeline has no nodes.

## 4. Order

`TimelineSchedule.operations` is ordered by the total order

```
(start, nodeIndex, operationIndex)
```

Ties on `start` are broken by the operation's source position: first by the
containing node's index among the top-level nodes, then by the operation's index
within its node. Because the comparator is a total order, the result is
deterministic and does **not** depend on the host runtime's `Array.prototype.sort`
stability.

Consequences worth noting:

- Operations with equal `start` keep their source order (node order, then
  operation-in-node order).
- The order is independent of the order in which nodes were authored: scheduling
  the same nodes in any authoring order yields the same `operations` order,
  because position is recovered from `nodeIndex`/`operationIndex`, not from input
  position.
- Independent top-level nodes that share a start are **not** interleaved by any
  priority; they keep node order.

## 5. Worked example

```
Timeline
  node 0  Sequence  startAt 0
    op-a  duration 0.5   → [0.0, 0.5)
    op-b  duration 0.3   → [0.5, 0.8)
  node 1  Parallel  startAt 0.5
    op-c  duration 0.4   → [0.5, 0.9)
    op-d  duration 0.2   → [0.5, 0.7)
```

Scheduled:

| operation | start | end | nodeIndex | operationIndex | nodeKind |
| --------- | ----- | --- | --------- | -------------- | -------- |
| op-a      | 0.0   | 0.5 | 0         | 0              | sequence |
| op-b      | 0.5   | 0.8 | 0         | 1              | sequence |
| op-c      | 0.5   | 0.9 | 1         | 0              | parallel |
| op-d      | 0.5   | 0.7 | 1         | 1              | parallel |

The three operations that start at `0.5` are ordered `op-b`, `op-c`, `op-d`: by
`nodeIndex` (node 0 before node 1) and then by `operationIndex` (within node 1,
`op-c` before `op-d`). The overall duration is the largest end time, `0.9`.

Note that node 1 is **not** chained to node 0: it begins at `0.5` because its
`startAt` is `0.5`, not because node 0 ends there. A node with the same `startAt`
but a different end time would produce an identical schedule.

## 6. Purity and determinism

`scheduleTimeline` is pure:

- It reads its input and returns a fresh `TimelineSchedule` on every call.
- It never mutates the input `Timeline`, its nodes, or its operations.
- It has no side effects: no timers, no I/O, no global state.
- Two calls on an equal input produce structurally equal schedules (different
  object identities, equal by deep equality).
- For a given input the `operations` order and `duration` are fixed.

The `operation` field is a **reference** to the original operation, not a copy.
This lets a consumer read `type`, `params`, and `easing` through the scheduled
entry without a second lookup, and it makes the "no mutation" guarantee
observable: the scheduled view and the source share the same operation objects.

## 7. What this is not

- **Not interpolation.** No intermediate values are computed; `start`, `end`, and
  `duration` are placement, not sampled motion.
- **Not rendering.** No surface, frame, or pixel is touched.
- **Not scene-level.** `scheduleTimeline` schedules one `Timeline` (one scene's
  worth). A definition has one timeline per scene; scheduling across scenes is a
  later concern.
- **Not a clock.** It is a function of its argument only.

## 8. Source layout

```
packages/animation/src/
├── index.ts                  # public API re-exports
├── scheduling/
│   ├── types.ts             # ScheduledNodeKind, ScheduledOperation, TimelineSchedule
│   ├── schedule.ts          # scheduleTimeline (and internal placement helpers)
│   └── __tests__/
│       └── schedule.test.ts  # the scheduling test suite
```

The internal helpers (`nodeStart`, `nodeDuration`, `nodeEnd`, `scheduleNode`,
`compareScheduled`) are not exported.

## 9. Tests

`packages/animation/src/__tests__/schedule.test.ts` covers: the empty timeline;
a single-operation sequence; sequence chaining at zero and non-zero `startAt`;
parallel simultaneity, differing end times, and maximum-duration; omitted
`startAt`; independent top-level nodes; overall duration as the largest end;
ascending-start ordering; tie-breaks by node index and by operation index;
interleaving across node kinds; zero-duration operations; recorded
`nodeIndex`/`operationIndex`/`nodeKind`; operation-id copy and reference
preservation; purity (no mutation); determinism; and a mixed
sequence-plus-parallel timeline.

Run them with `pnpm test` from the repository root.
