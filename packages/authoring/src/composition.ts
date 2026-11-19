import type { Operation, Parallel, Sequence } from '@choreobit/core';
import { requireStartAt } from './internal';

/**
 * Compose operations into timeline composition nodes.
 *
 * A {@link Sequence} runs its operations back-to-back; a {@link Parallel} runs
 * them together. Both accept an optional `startAt` (an omitted `startAt` is `0`)
 * at which the group begins on the containing scene's timeline.
 *
 * A composition node is data only: it carries the operations and their relative
 * placement. The timing of each operation is computed by
 * `@choreobit/animation` when the timeline is scheduled.
 */

/**
 * Build a {@link Sequence}: the operations run consecutively, the first beginning
 * at `startAt` and each following one beginning when the previous finishes.
 *
 * The returned node is freshly allocated; the `operations` array is copied so the
 * caller may keep mutating its own list.
 */
export function sequence(startAt = 0, ...operations: readonly Operation[]): Sequence {
  requireStartAt(startAt);
  const built = operations.map((operation) => operation);
  const node: Sequence = {
    kind: 'sequence',
    operations: built,
    startAt,
  };
  return node;
}

/**
 * Build a {@link Parallel}: every operation begins simultaneously at `startAt` and
 * runs for its own duration.
 *
 * The returned node is freshly allocated; the `operations` array is copied so the
 * caller may keep mutating its own list.
 */
export function parallel(startAt = 0, ...operations: readonly Operation[]): Parallel {
  requireStartAt(startAt);
  const built = operations.map((operation) => operation);
  const node: Parallel = {
    kind: 'parallel',
    operations: built,
    startAt,
  };
  return node;
}
