import { describe, expect, it } from 'vitest';
import type { Operation, OperationKind, Parallel, Sequence, Timeline } from '@choreobit/core';
import { scheduleTimeline } from '../index';
import type { ScheduledOperation } from '../index';

/**
 * Fixtures and small builders.
 *
 * `scheduleTimeline` is a pure transformation, so every fixture here is a plain
 * `Timeline` literal. Decimal durations are not exactly representable in floating
 * point (for example 0.5 + 0.2 is 0.7000000000000001), so cumulative and sum
 * assertions use `toBeCloseTo` rather than exact equality — the same precision
 * `@choreobit/core` uses when it validates duration sums.
 */

/**
 * Build an operation with an `id`, a duration, and an optional kind. A bare
 * `set` is the default, which is all scheduling needs: placement depends only on
 * duration and container, not on the operation kind or its parameters.
 */
function op(id: string, duration: number, type: OperationKind = 'set'): Operation {
  return { id, type, duration };
}

/** Build a `Sequence` node with the given operations and an optional `startAt`. */
function sequence(operations: readonly Operation[], startAt = 0): Sequence {
  return { kind: 'sequence', startAt, operations };
}

/** Build a `Parallel` node with the given operations and an optional `startAt`. */
function parallel(operations: readonly Operation[], startAt = 0): Parallel {
  return { kind: 'parallel', startAt, operations };
}

/** The scheduled operation ids, in the order the schedule returned them. */
function idsOf(schedule: ReturnType<typeof scheduleTimeline>): string[] {
  return schedule.operations.map((s) => s.operationId);
}

describe('empty timeline', () => {
  it('yields no operations and a zero duration', () => {
    const schedule = scheduleTimeline({ nodes: [] });
    expect(schedule.operations).toEqual([]);
    expect(schedule.duration).toBe(0);
  });

  it('is a fresh result even for the same empty input', () => {
    const timeline: Timeline = { nodes: [] };
    const a = scheduleTimeline(timeline);
    const b = scheduleTimeline(timeline);
    expect(a).not.toBe(b);
    expect(a.operations).not.toBe(b.operations);
  });
});

describe('a single-operation sequence', () => {
  it('starts at startAt and ends at startAt + duration', () => {
    const schedule = scheduleTimeline({
      nodes: [sequence([op('op-1', 0.5)], 0.25)],
    });
    expect(schedule.operations.length).toBe(1);
    const s = schedule.operations[0]!;
    expect(s.start).toBe(0.25);
    expect(s.end).toBe(0.75);
    expect(s.duration).toBe(0.5);
    expect(schedule.duration).toBe(0.75);
  });

  it('treats an omitted startAt as 0', () => {
    const timeline: Timeline = { nodes: [sequence([op('op-1', 0.5)])] };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.operations[0]!.start).toBe(0);
    expect(schedule.operations[0]!.end).toBe(0.5);
  });
});

describe('sequence chaining', () => {
  it('places operations at cumulative offsets from startAt', () => {
    const timeline: Timeline = {
      nodes: [sequence([op('op-a', 0.5), op('op-b', 0.2), op('op-c', 0.3)], 0)],
    };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.operations.map((s) => s.start)).toEqual([0, 0.5, 0.7]);
    expect(schedule.operations[0]!.end).toBe(0.5);
    expect(schedule.operations[1]!.end).toBe(0.7);
    expect(schedule.operations[2]!.end).toBeCloseTo(1.0, 9);
    expect(schedule.duration).toBeCloseTo(1.0, 9);
  });

  it('chains from a non-zero startAt', () => {
    const timeline: Timeline = {
      nodes: [sequence([op('op-a', 0.5), op('op-b', 0.2)], 1.0)],
    };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.operations.map((s) => s.start)).toEqual([1.0, 1.5]);
    expect(schedule.duration).toBeCloseTo(1.7, 9);
  });

  it('treats a sequence duration as the sum of its operations', () => {
    const timeline: Timeline = { nodes: [sequence([op('op-a', 0.25), op('op-b', 0.25)])] };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.duration).toBe(0.5);
  });
});

describe('parallel grouping', () => {
  it('starts every operation at the group startAt', () => {
    const timeline: Timeline = {
      nodes: [parallel([op('op-x', 0.5), op('op-y', 0.3)], 0.4)],
    };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.operations.map((s) => s.start)).toEqual([0.4, 0.4]);
  });

  it('ends operations at different times when their durations differ', () => {
    const timeline: Timeline = { nodes: [parallel([op('op-x', 0.5), op('op-y', 0.2)])] };
    const schedule = scheduleTimeline(timeline);
    const byId = new Map(schedule.operations.map((s) => [s.operationId, s]));
    expect(byId.get('op-x')!.end).toBe(0.5);
    expect(byId.get('op-y')!.end).toBe(0.2);
    expect(schedule.duration).toBe(0.5);
  });

  it('treats a parallel duration as the maximum of its operations', () => {
    const timeline: Timeline = {
      nodes: [parallel([op('op-x', 0.3), op('op-y', 0.7), op('op-z', 0.5)])],
    };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.duration).toBe(0.7);
  });

  it('schedules a single-operation parallel at its startAt', () => {
    const timeline: Timeline = { nodes: [parallel([op('op-only', 0.6)], 0.2)] };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.operations[0]!.start).toBe(0.2);
    expect(schedule.operations[0]!.end).toBe(0.8);
    expect(schedule.duration).toBe(0.8);
  });

  it('handles an empty parallel node (duration 0, end at startAt)', () => {
    const timeline: Timeline = { nodes: [parallel([], 0.3)] };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.operations).toEqual([]);
    expect(schedule.duration).toBe(0.3);
  });

  it('handles an empty sequence node (duration 0, end at startAt)', () => {
    const timeline: Timeline = { nodes: [sequence([], 0.3)] };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.operations).toEqual([]);
    expect(schedule.duration).toBe(0.3);
  });
});

describe('top-level node independence', () => {
  it('does not chain top-level nodes to one another', () => {
    // Two independent nodes both starting at 0: they overlap; neither is offset
    // by the other's end time.
    const timeline: Timeline = {
      nodes: [sequence([op('op-a', 0.5)], 0), parallel([op('op-b', 0.5)], 0)],
    };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.operations.map((s) => s.start)).toEqual([0, 0]);
    expect(schedule.duration).toBe(0.5);
  });

  it('computes the overall duration as the largest node end time', () => {
    const timeline: Timeline = {
      nodes: [sequence([op('op-a', 0.5)], 0), sequence([op('op-b', 0.3)], 1.2)],
    };
    const schedule = scheduleTimeline(timeline);
    expect(schedule.duration).toBeCloseTo(1.5, 9);
  });
});

describe('chronological ordering', () => {
  it('orders operations by ascending start time', () => {
    // Author the nodes out of chronological order; the schedule re-orders them.
    const timeline: Timeline = {
      nodes: [
        sequence([op('op-late', 0.1)], 1.0),
        sequence([op('op-early', 0.1)], 0.0),
        sequence([op('op-mid', 0.1)], 0.5),
      ],
    };
    const schedule = scheduleTimeline(timeline);
    expect(idsOf(schedule)).toEqual(['op-early', 'op-mid', 'op-late']);
    expect(schedule.operations.map((s) => s.start)).toEqual([0, 0.5, 1.0]);
  });

  it('breaks ties on start by node index', () => {
    // Two top-level nodes whose first operations both start at 0: the earlier
    // node (index 0) comes first.
    const timeline: Timeline = {
      nodes: [parallel([op('op-node0', 0.5)], 0), sequence([op('op-node1', 0.5)], 0)],
    };
    const schedule = scheduleTimeline(timeline);
    expect(idsOf(schedule)).toEqual(['op-node0', 'op-node1']);
    expect(schedule.operations[0]!.nodeIndex).toBe(0);
    expect(schedule.operations[1]!.nodeIndex).toBe(1);
  });

  it('breaks ties on start and node by operation index', () => {
    // Within one parallel, both operations share a start and a node; the lower
    // operation index comes first.
    const timeline: Timeline = {
      nodes: [parallel([op('op-0', 0.5), op('op-1', 0.5), op('op-2', 0.5)], 0.3)],
    };
    const schedule = scheduleTimeline(timeline);
    expect(idsOf(schedule)).toEqual(['op-0', 'op-1', 'op-2']);
    expect(schedule.operations.map((s) => s.operationIndex)).toEqual([0, 1, 2]);
  });

  it('interleaves nodes by start time across kinds', () => {
    const timeline: Timeline = {
      nodes: [parallel([op('op-p', 0.4)], 0.5), sequence([op('op-s1', 0.3), op('op-s2', 0.2)], 0)],
    };
    const schedule = scheduleTimeline(timeline);
    // op-s1 @0, op-s2 @0.3, op-p @0.5
    expect(idsOf(schedule)).toEqual(['op-s1', 'op-s2', 'op-p']);
    expect(schedule.operations.map((s) => s.start)).toEqual([0, 0.3, 0.5]);
  });
});

describe('recorded fields', () => {
  it('records nodeIndex and operationIndex', () => {
    const timeline: Timeline = {
      nodes: [
        sequence([op('op-0a', 0.1), op('op-0b', 0.1)], 0),
        parallel([op('op-1a', 0.1), op('op-1b', 0.1)], 0),
      ],
    };
    const schedule = scheduleTimeline(timeline);
    const byId = new Map(schedule.operations.map((s) => [s.operationId, s]));
    expect(byId.get('op-0a')!.nodeIndex).toBe(0);
    expect(byId.get('op-0a')!.operationIndex).toBe(0);
    expect(byId.get('op-0b')!.nodeIndex).toBe(0);
    expect(byId.get('op-0b')!.operationIndex).toBe(1);
    expect(byId.get('op-1a')!.nodeIndex).toBe(1);
    expect(byId.get('op-1a')!.operationIndex).toBe(0);
    expect(byId.get('op-1b')!.nodeIndex).toBe(1);
    expect(byId.get('op-1b')!.operationIndex).toBe(1);
  });

  it('records the containing node kind', () => {
    const timeline: Timeline = {
      nodes: [sequence([op('op-seq', 0.1)], 0), parallel([op('op-par', 0.1)], 0)],
    };
    const schedule = scheduleTimeline(timeline);
    const byId = new Map(schedule.operations.map((s) => [s.operationId, s]));
    expect(byId.get('op-seq')!.nodeKind).toBe('sequence');
    expect(byId.get('op-par')!.nodeKind).toBe('parallel');
  });

  it('copies the operation id and preserves a reference to the original operation', () => {
    const original = op('op-keep', 0.5);
    const timeline: Timeline = { nodes: [sequence([original], 0)] };
    const schedule = scheduleTimeline(timeline);
    const s = schedule.operations[0]!;
    expect(s.operationId).toBe('op-keep');
    expect(s.operation).toBe(original);
    // The reference is the original, so its other fields are read through.
    expect(s.operation.type).toBe('set');
    expect(s.duration).toBe(original.duration);
  });

  it("preserves an operation's params and easing through the schedule", () => {
    const original: Operation = {
      id: 'op-move',
      type: 'move',
      target: 'obj-1',
      duration: 0.6,
      params: { x: 10, y: 20, label: 'from origin', nested: { a: 1, b: 'two', c: true } },
      easing: { name: 'easeInOutCubic', tension: 0.5, bounciness: 0.25 },
    };
    const timeline: Timeline = { nodes: [sequence([original], 0)] };
    const schedule = scheduleTimeline(timeline);
    const s = schedule.operations[0]!;
    // 1. references the exact original operation object
    expect(s.operation).toBe(original);
    // 2. params equal the original params
    expect(s.operation.params).toEqual(original.params);
    // 3. easing equals the original easing
    expect(s.operation.easing).toEqual(original.easing);
    // 4. id and duration preserved
    expect(s.operationId).toBe('op-move');
    expect(s.duration).toBe(0.6);
  });

  it('records a zero-duration operation at its position with end equal to start', () => {
    const timeline: Timeline = {
      nodes: [sequence([op('op-t1', 0.3), op('op-instant', 0), op('op-t3', 0.3)], 0.4)],
    };
    const schedule = scheduleTimeline(timeline);
    const byId = new Map(schedule.operations.map((s) => [s.operationId, s]));
    expect(byId.get('op-instant')!.start).toBeCloseTo(0.7, 9);
    expect(byId.get('op-instant')!.end).toBeCloseTo(0.7, 9);
    expect(byId.get('op-instant')!.duration).toBe(0);
  });
});

describe('purity and determinism', () => {
  it('does not mutate the input timeline or its operations', () => {
    const timeline: Timeline = {
      nodes: [
        sequence([op('op-a', 0.5), op('op-b', 0.2)], 0.1),
        parallel([op('op-c', 0.3), op('op-d', 0.7)], 0.4),
      ],
    };
    const snapshot = JSON.parse(JSON.stringify(timeline)) as Timeline;
    scheduleTimeline(timeline);
    scheduleTimeline(timeline);
    expect(timeline).toEqual(snapshot);
  });

  it('produces an equal schedule on repeated calls', () => {
    const timeline: Timeline = {
      nodes: [parallel([op('op-p', 0.4)], 0.5), sequence([op('op-s1', 0.3), op('op-s2', 0.2)], 0)],
    };
    const a = scheduleTimeline(timeline);
    const b = scheduleTimeline(timeline);
    expect(a).toEqual(b);
  });

  it('returns a total order independent of input authoring order', () => {
    const nodes = [
      sequence([op('op-c', 0.1)], 0.2),
      parallel([op('op-b', 0.1)], 0.1),
      sequence([op('op-a', 0.1)], 0.0),
    ];
    const forward: Timeline = { nodes };
    const backward: Timeline = { nodes: [...nodes].reverse() };
    const a = scheduleTimeline(forward);
    const b = scheduleTimeline(backward);
    expect(a.operations.map((s: ScheduledOperation) => s.operationId)).toEqual(
      b.operations.map((s) => s.operationId),
    );
  });
});

describe('a mixed sequence and parallel timeline', () => {
  it('flattens and orders every operation across node kinds', () => {
    const timeline: Timeline = {
      nodes: [
        // setup: instant
        sequence([op('op-setup', 0)], 0),
        // findMid: two ops together at 0.5
        parallel([op('op-mid-appear', 0), op('op-mid-highlight', 0.3)], 0.5),
        // narrow: chained at 0.8
        sequence([op('op-low-nudge', 0.4), op('op-found', 0.2)], 0.8),
      ],
    };
    const schedule = scheduleTimeline(timeline);

    expect(idsOf(schedule)).toEqual([
      'op-setup',
      'op-mid-appear',
      'op-mid-highlight',
      'op-low-nudge',
      'op-found',
    ]);
    const starts = schedule.operations.map((s) => s.start);
    const expectedStarts = [0, 0.5, 0.5, 0.8, 1.2];
    expect(starts.length).toBe(expectedStarts.length);
    for (let i = 0; i < expectedStarts.length; i++) {
      expect(starts[i]!).toBeCloseTo(expectedStarts[i]!, 9);
    }
    // The last operation ends at 1.2 + 0.2 = 1.4; that is the overall duration.
    expect(schedule.duration).toBeCloseTo(1.4, 9);
  });
});
