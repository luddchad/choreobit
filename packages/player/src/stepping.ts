import type { SemanticStep } from '@choreobit/core';
import { CodeSyncError } from './error';

/**
 * `@choreobit/player` semantic stepping — navigation between the *semantic*
 * beats of a scene, expressed as jumps along its existing timeline.
 *
 * This module sits beside the {@link import('./code-sync').CodeSyncResolver}.
 * Where the resolver answers *"what is on screen now?"* (a function of time),
 * the stepper answers *"what is the next (or previous) beat?"* — it is the
 * inverse, mapping a position on the timeline to the nearest boundary of a
 * semantic step.
 *
 * A *stop* is the `start` time of an in-scope step. Stepping forward from a
 * time finds the smallest stop strictly after it; stepping backward finds the
 * largest stop strictly before it. The boundaries are the step starts because a
 * step's `start` is the instant its beat begins, so landing on one shows the
 * step about to play. A stop at the queried time is *not* a target: stepping
 * from `t` moves to the next distinct stop, so a held position does not loop
 * onto itself.
 *
 * The stepper is deliberately pure: it owns no clock and no animation state.
 * {@link import('./player').Player} owns the single playback clock and the
 * single evaluation path; the stepper only computes target times and the player
 * reaches them with its ordinary {@link import('./player').Player.seek}.
 * Navigation is therefore deterministic and independent of playback rate,
 * history, and loop mode.
 */

/**
 * Resolve the ordered, de-duplicated stop times of a scene's steps.
 *
 * The stop times are the distinct `start` times of the steps in scope, sorted
 * ascending. A step is *in scope* when its `sceneId` is `undefined` (a
 * definition-wide step) or equals `sceneId`; steps of another scene are
 * ignored, mirroring the code-sync resolver's scoping. The list is a `Set`
 * of starts, so two steps that begin together yield one stop.
 *
 * Each in-scope step is validated so a malformed step surfaces at build time
 * rather than steering navigation to a place the player cannot reach:
 * - `start` and `end` are finite;
 * - `start` is within `[0, duration]` (the player can only seek there);
 * - `end` is within `[0, duration]` and does not precede `start`;
 * - no two in-scope steps share an `id`.
 *
 * @param steps - The semantic steps to resolve (typically a scene's, or the
 *   full animation's when scoped by `sceneId`).
 * @param sceneId - The scene whose steps to collect; steps of another scene are
 *   ignored.
 * @param duration - The scene's duration, in seconds. A step whose `start` or
 *   `end` falls outside `[0, duration]` is malformed.
 * @returns The distinct stop times, sorted ascending. Empty when no step is in
 *   scope.
 * @throws {@link CodeSyncError} when `duration` is not a non-negative finite
 *   number, or any in-scope step or its id is malformed.
 */
export function resolveStepStops(
  steps: readonly SemanticStep[],
  sceneId: string,
  duration: number,
): number[] {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new CodeSyncError('duration is not a non-negative finite number');
  }

  const seenIds = new Set<string>();
  const stops = new Set<number>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step === undefined) continue;
    if (step.sceneId !== undefined && step.sceneId !== sceneId) continue;

    if (seenIds.has(step.id)) {
      throw new CodeSyncError(`duplicate step id "${step.id}"`);
    }
    seenIds.add(step.id);

    if (!Number.isFinite(step.start)) {
      throw new CodeSyncError(`step[${i}].start is not finite`);
    }
    if (step.start < 0) {
      throw new CodeSyncError(`step[${i}].start is negative`);
    }
    if (step.start > duration) {
      throw new CodeSyncError(`step[${i}].start exceeds duration`);
    }
    if (!Number.isFinite(step.end)) {
      throw new CodeSyncError(`step[${i}].end is not finite`);
    }
    if (step.end < 0) {
      throw new CodeSyncError(`step[${i}].end is negative`);
    }
    if (step.end < step.start) {
      throw new CodeSyncError(`step[${i}].end precedes its start`);
    }
    if (step.end > duration) {
      throw new CodeSyncError(`step[${i}].end exceeds duration`);
    }

    stops.add(step.start);
  }

  return [...stops].sort((a, b) => a - b);
}

/**
 * A pre-validated navigator over a scene's semantic beats.
 *
 * Building a stepper resolves and validates the stop times once, so each
 * navigation call is a cheap linear scan over already-checked data. It is the
 * form a host uses inside the player; {@link resolveStepStops} is the
 * equivalent one-shot form that yields the raw stop times.
 *
 * All navigation is by strict comparison: {@link nextStop} returns the smallest
 * stop strictly greater than its argument, {@link previousStop} the largest stop
 * strictly less. A `null` result means there is no further (or earlier) beat.
 */
export interface SemanticStepper {
  /**
   * The distinct stop times, sorted ascending and frozen. Empty when no step is
   * in scope.
   */
  readonly stopTimes: readonly number[];
  /**
   * The smallest stop strictly greater than `after`, or `null` when there is
   * none (already at or past the last stop).
   */
  nextStop(after: number): number | null;
  /**
   * The largest stop strictly less than `before`, or `null` when there is none
   * (already at or before the first stop).
   */
  previousStop(before: number): number | null;
  /** `true` when {@link nextStop} of `after` exists. */
  hasNext(after: number): boolean;
  /** `true` when {@link previousStop} of `before` exists. */
  hasPrevious(before: number): boolean;
}

/**
 * Build a {@link SemanticStepper} for a scene's steps.
 *
 * @param steps - The semantic steps to navigate (typically a scene's, or the
 *   full animation's when scoped by `sceneId`).
 * @param sceneId - The scene whose stops to collect; steps of another scene are
 *   ignored.
 * @param duration - The scene's duration, in seconds.
 * @returns A frozen {@link SemanticStepper}.
 * @throws {@link CodeSyncError} when `duration` is malformed or any in-scope
 *   step or its id is malformed — validation happens eagerly at construction so
 *   a defect surfaces before the first navigation.
 */
export function createSemanticStepper(
  steps: readonly SemanticStep[],
  sceneId: string,
  duration: number,
): SemanticStepper {
  const stopTimes = Object.freeze(resolveStepStops(steps, sceneId, duration));

  function nextStop(after: number): number | null {
    for (const stop of stopTimes) {
      if (stop > after) return stop;
    }
    return null;
  }

  function previousStop(before: number): number | null {
    for (let i = stopTimes.length - 1; i >= 0; i--) {
      const stop = stopTimes[i];
      if (stop !== undefined && stop < before) return stop;
    }
    return null;
  }

  function hasNext(after: number): boolean {
    return nextStop(after) !== null;
  }

  function hasPrevious(before: number): boolean {
    return previousStop(before) !== null;
  }

  return { stopTimes, nextStop, previousStop, hasNext, hasPrevious };
}
