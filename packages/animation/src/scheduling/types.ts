import type { Operation } from '@choreobit/core';

/**
 * The kind of {@link import('@choreobit/core').TimelineNode} that contained a
 * scheduled operation. Mirrors the discriminant of `TimelineNode`.
 */
export type ScheduledNodeKind = 'sequence' | 'parallel';

/**
 * A single operation of a {@link import('@choreobit/core').Timeline}, positioned
 * on the scene-relative timeline.
 *
 * A schedule is a *derived* view: it does not change the source {@link
 * import('@choreobit/core').Operation}, and an operation's own start time is not
 * stored on it. Instead the position is computed from the container that holds
 * the operation. {@link operation} is a reference to the original operation
 * (identity is preserved, never copied), so a consumer can read its `id`,
 * `type`, `params`, and `easing` without a second lookup.
 */
export interface ScheduledOperation {
  /**
   * The original operation, by reference. Not a copy: mutating the source
   * timeline and re-scheduling is what reflects through, but `scheduleTimeline`
   * itself never mutates its input.
   */
  readonly operation: Operation;
  /** The stable identifier of the operation. Copied out for convenience. */
  readonly operationId: string;
  /**
   * The time, in seconds relative to the containing scene, at which the
   * operation begins. For a `Sequence` this is the cumulative offset (the
   * sequence's `startAt` plus the durations of the operations before it); for a
   * `Parallel` it is the group's `startAt`.
   */
  readonly start: number;
  /** The time, in seconds, at which the operation ends (`start` + `duration`). */
  readonly end: number;
  /** The operation's own duration, in seconds. `0` is an instantaneous change. */
  readonly duration: number;
  /**
   * The position of this operation within the source `Timeline`, in array order
   * of the top-level nodes. Independent top-level nodes are not chained, so this
   * is the node's own index, not a cumulative counter.
   */
  readonly nodeIndex: number;
  /** The position of this operation within its containing node. */
  readonly operationIndex: number;
  /** The kind of the node that contained this operation. */
  readonly nodeKind: ScheduledNodeKind;
}

/**
 * The flat, chronologically ordered schedule of a {@link
 * import('@choreobit/core').Timeline}.
 *
 * Every operation of every top-level node is flattened into a single list and
 * ordered by `(start, nodeIndex, operationIndex)`. The list is total-ordered by
 * an explicit comparator, so its order does not depend on the host runtime's
 * sort stability.
 *
 * An empty timeline (no nodes) yields an empty `operations` list and a
 * `duration` of `0`.
 */
export interface TimelineSchedule {
  /**
   * The operations, in chronological order. Ties are broken by source position
   * (`nodeIndex`, then `operationIndex`) so the order is deterministic.
   */
  readonly operations: readonly ScheduledOperation[];
  /**
   * The overall end time, in seconds: the largest node end time (`startAt` +
   * node duration). `0` when the timeline has no nodes.
   */
  readonly duration: number;
}
