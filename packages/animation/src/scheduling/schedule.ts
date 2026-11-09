import type { Timeline, TimelineNode } from '@choreobit/core';
import type { ScheduledNodeKind, ScheduledOperation, TimelineSchedule } from './types';

/**
 * Deterministic timeline scheduling.
 *
 * `scheduleTimeline` is a pure transformation: it turns a declarative
 * {@link Timeline} (the data owned by `@choreobit/core`) into a flat,
 * chronologically ordered {@link TimelineSchedule}. It performs no interpolation
 * and no rendering — only the placement of operations on the timeline, which
 * `core` describes as data but never computes.
 *
 * The transformation is side-effect free: it reads its input and returns a fresh
 * `TimelineSchedule`, never mutating the source timeline or its operations.
 */

/**
 * The start time, relative to the containing scene, of a node. An omitted
 * `startAt` is interpreted as `0`.
 */
function nodeStart(node: TimelineNode): number {
  return node.startAt ?? 0;
}

/**
 * A node's duration: the sum of its operations' durations for a `Sequence`, the
 * maximum for a `Parallel`. An empty node has duration `0`.
 */
function nodeDuration(node: TimelineNode): number {
  if (node.kind === 'sequence') {
    return node.operations.reduce((sum, op) => sum + op.duration, 0);
  }
  if (node.operations.length === 0) return 0;
  let max = -Infinity;
  for (const op of node.operations) {
    if (op.duration > max) max = op.duration;
  }
  return max;
}

/**
 * A node's end time, relative to the scene: its start plus its duration.
 */
function nodeEnd(node: TimelineNode): number {
  return nodeStart(node) + nodeDuration(node);
}

/**
 * Place the operations of a single node onto the scene-relative timeline.
 *
 * A `Sequence` chains its operations back-to-back from the sequence's start; a
 * `Parallel` starts every operation together at the group's start. Either way the
 * returned array is in source order, so the caller's flat list is already in
 * node/array order before the final sort.
 */
function scheduleNode(node: TimelineNode, nodeIndex: number): readonly ScheduledOperation[] {
  const kind: ScheduledNodeKind = node.kind;
  const start = nodeStart(node);

  if (node.kind === 'sequence') {
    const scheduled: ScheduledOperation[] = [];
    let running = start;
    for (let operationIndex = 0; operationIndex < node.operations.length; operationIndex++) {
      const op = node.operations[operationIndex]!;
      scheduled.push({
        operation: op,
        operationId: op.id,
        start: running,
        end: running + op.duration,
        duration: op.duration,
        nodeIndex,
        operationIndex,
        nodeKind: kind,
      });
      running += op.duration;
    }
    return scheduled;
  }

  const scheduled: ScheduledOperation[] = [];
  for (let operationIndex = 0; operationIndex < node.operations.length; operationIndex++) {
    const op = node.operations[operationIndex]!;
    scheduled.push({
      operation: op,
      operationId: op.id,
      start,
      end: start + op.duration,
      duration: op.duration,
      nodeIndex,
      operationIndex,
      nodeKind: kind,
    });
  }
  return scheduled;
}

/**
 * Total-order comparator for scheduled operations: by `start`, then by source
 * position (`nodeIndex`, then `operationIndex`). The position tie-break makes the
 * order deterministic regardless of the host `Array.prototype.sort` stability, so
 * the same timeline always schedules to the same order.
 */
function compareScheduled(a: ScheduledOperation, b: ScheduledOperation): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.nodeIndex !== b.nodeIndex) return a.nodeIndex - b.nodeIndex;
  return a.operationIndex - b.operationIndex;
}

/**
 * Flatten and order a timeline into a {@link TimelineSchedule}.
 *
 * The returned `operations` list is ordered by `(start, nodeIndex,
 * operationIndex)`. `duration` is the largest node end time, or `0` for an empty
 * timeline. The input timeline is never mutated.
 */
export function scheduleTimeline(timeline: Timeline): TimelineSchedule {
  const operations: ScheduledOperation[] = [];
  let duration = 0;

  for (let nodeIndex = 0; nodeIndex < timeline.nodes.length; nodeIndex++) {
    const node = timeline.nodes[nodeIndex]!;
    for (const scheduled of scheduleNode(node, nodeIndex)) {
      operations.push(scheduled);
    }
    const end = nodeEnd(node);
    if (end > duration) duration = end;
  }

  operations.sort(compareScheduled);

  return { operations, duration };
}
