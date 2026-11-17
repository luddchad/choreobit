import type { SemanticStep, SemanticSteps, SourceLocation } from '@choreobit/core';
import { CodeSyncError } from './error';

/**
 * `@choreobit/player` code synchronizer — a pure, deterministic mapping from
 * *scene-relative playback time* to the semantic steps and source locations that
 * are active at that instant.
 *
 * This module is the bridge between an animation's *visual* timeline (which the
 * {@link import('./player').Player} plays) and its *semantic* one (the
 * `SemanticStep`s and their `SourceLocation`s, described in core). Given the
 * steps of a scene and a time within that scene, it answers: *which step(s) are
 * in flight, and which lines of source code are therefore on screen?*
 *
 * It is deliberately pure: it owns no clock, no subscription, and no animation
 * state. The {@link Player} owns the single playback clock; the example wires
 * this resolver to the player via `player.subscribe((state) =>
 * resolveCodeSync(steps, state.currentTime))`. Keeping the mapping a function of
 * `(steps, sceneId, time)` means it is trivially testable, side-effect free, and
 * reusable outside a browser.
 *
 * The interval convention is half-open `[start, end)`: a step is active at its
 * `start` and inactive at its `end`, so adjacent steps never overlap and a
 * zero-duration step (`start === end`) is active at no time. This matches the
 * evaluator's "an operation is live on `[start, end)`" semantics, so the code a
 * student reads lines up with the frame the player draws.
 */

/**
 * The active mapping at one instant of a scene.
 *
 * It is the value the resolver returns and the value a code viewer renders. Both
 * fields are plain, readonly, freshly-allocated arrays, so a caller may read or
 * hold them without leaking the resolver's internals or aliasing a prior
 * result.
 */
export interface CodeSyncResolution {
  /**
   * The ids of the steps active at the queried time, in the steps' declared
   * order. Empty when no step covers the time (before the first, after the
   * last, or between non-overlapping steps).
   */
  readonly activeStepIds: readonly string[];
  /**
   * The source locations active at the queried time: the union of the
   * `sourceLocations` of the active steps, de-duplicated by position and ordered
   * by line then column. A step with no `sourceLocations` contributes none, and
   * several steps may contribute the same line.
   */
  readonly activeLocations: readonly SourceLocation[];
}

/**
 * A pre-validated, scene-scoped resolver for the hot playback loop.
 *
 * Building a resolver validates the steps once (for the given `sceneId`) and
 * caches the active steps for that scene, so calling {@link resolve} on every
 * frame is a cheap scan over already-checked data. It is the form a host uses
 * inside a `player.subscribe` callback; {@link resolveCodeSync} is the
 * equivalent one-shot form.
 */
export interface CodeSyncResolver {
  /**
   * Resolve the active steps and locations at a scene-relative `time` (seconds).
   *
   * @param time - A finite, non-negative scene-relative time in seconds. A
   *   non-finite time throws a {@link CodeSyncError}.
   * @returns The {@link CodeSyncResolution} for that time.
   */
  resolve(time: number): CodeSyncResolution;
  /** The scene this resolver was built for. */
  readonly sceneId: string;
}

/**
 * Validate that a single {@link SemanticStep} is well-formed for resolution.
 *
 * The checks are the ones a malformed authoring could violate and that would
 * otherwise corrupt a resolution silently:
 * - `start` and `end` must be finite and non-negative;
 * - `end` must not precede `start` (a zero-length `[start, start)` is allowed but
 *   resolves to nothing);
 * - every `sourceLocation` must have a positive-integer `line`, and when it
 *   spans lines, an `endLine` that is a positive integer not less than `line`.
 *
 * A malformed step throws a {@link CodeSyncError} rather than being skipped, so
 * a defect surfaces at build/seek time instead of hiding behind an empty
 * resolution.
 */
function validateStep(step: SemanticStep, index: number): void {
  const time = step.start;
  if (!Number.isFinite(time)) {
    throw new CodeSyncError(`step[${index}].start is not finite`);
  }
  if (step.start < 0) {
    throw new CodeSyncError(`step[${index}].start is negative`);
  }
  if (!Number.isFinite(step.end)) {
    throw new CodeSyncError(`step[${index}].end is not finite`);
  }
  if (step.end < 0) {
    throw new CodeSyncError(`step[${index}].end is negative`);
  }
  if (step.end < step.start) {
    throw new CodeSyncError(`step[${index}].end precedes its start`);
  }
  const locations = step.sourceLocations;
  if (locations !== undefined) {
    locations.forEach((location, locationIndex) => {
      validateLocation(index, locationIndex, location);
    });
  }
}

/**
 * Validate one {@link SourceLocation} inside a step.
 *
 * A location must name a positive-integer line. When it spans a range, the
 * end columns/line must be positive integers and the end position must not
 * precede the start position. A location that fails is rejected so a viewer
 * never tries to highlight a meaningless line.
 */
function validateLocation(
  stepIndex: number,
  locationIndex: number,
  location: SourceLocation,
): void {
  const prefix = `step[${stepIndex}].sourceLocations[${locationIndex}]`;
  if (!Number.isInteger(location.line) || location.line < 1) {
    throw new CodeSyncError(`${prefix}.line is not a positive integer`);
  }
  if (
    location.column !== undefined &&
    (!Number.isInteger(location.column) || location.column < 1)
  ) {
    throw new CodeSyncError(`${prefix}.column is not a positive integer`);
  }
  if (
    location.endColumn !== undefined &&
    (!Number.isInteger(location.endColumn) || location.endColumn < 1)
  ) {
    throw new CodeSyncError(`${prefix}.endColumn is not a positive integer`);
  }
  if (location.endLine !== undefined) {
    if (!Number.isInteger(location.endLine) || location.endLine < 1) {
      throw new CodeSyncError(`${prefix}.endLine is not a positive integer`);
    }
    if (location.endLine < location.line) {
      throw new CodeSyncError(`${prefix}.endLine precedes its line`);
    }
    // When both endLine and endColumn are present and endLine === line, the
    // end column must not precede the start column on that same line.
    if (
      location.endLine === location.line &&
      location.column !== undefined &&
      location.endColumn !== undefined &&
      location.endColumn < location.column
    ) {
      throw new CodeSyncError(`${prefix}.endColumn precedes its column`);
    }
  }
}

/**
 * The positional identity of a {@link SourceLocation}, used to de-duplicate.
 *
 * Two locations are "the same" when they name the same span — same line, and the
 * same optional column / endLine / endColumn. A `description` never counts, so
 * two steps that both point at line 6 with no column collapse to one highlight,
 * while a column-qualified location stays distinct from a bare line.
 */
function locationKey(location: SourceLocation): string {
  return [
    location.line,
    location.column ?? '',
    location.endLine ?? '',
    location.endColumn ?? '',
  ].join(':');
}

/**
 * Resolve the active steps and locations at a scene-relative time.
 *
 * @param steps - The semantic steps to resolve. Pass the steps of a single
 *   scene; the `sceneId` is used only to validate each step's `sceneId` matches
 *   when a scene id is supplied.
 * @param sceneId - The id of the scene being resolved. Steps whose `sceneId`
 *   is set to a *different* id are ignored, so a resolver can be handed the
 *   full `semanticSteps` of an animation and still resolve one scene at a time.
 *   Omit it (pass `undefined`) to resolve across every step regardless of scene.
 * @param time - A finite, non-negative scene-relative time in seconds.
 * @returns The {@link CodeSyncResolution} active at `time`.
 * @throws {@link CodeSyncError} when `time` is non-finite or any applicable
 *   step or location is malformed.
 */
export function resolveCodeSync(
  steps: readonly SemanticStep[],
  sceneId: string | undefined,
  time: number,
): CodeSyncResolution {
  if (!Number.isFinite(time)) {
    throw new CodeSyncError('time is not finite');
  }
  if (time < 0) {
    throw new CodeSyncError('time is negative');
  }

  const activeStepIds: string[] = [];
  // A de-duplication set keyed by positional identity, with a map back to the
  // first-seen location so the emitted array carries a real SourceLocation.
  const seen = new Set<string>();
  const activeLocations: SourceLocation[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step === undefined) continue;
    if (sceneId !== undefined && step.sceneId !== undefined && step.sceneId !== sceneId) {
      continue;
    }
    validateStep(step, i);
    // Half-open [start, end): active at start, inactive at end.
    if (time >= step.start && time < step.end) {
      activeStepIds.push(step.id);
      const locations = step.sourceLocations;
      if (locations !== undefined) {
        for (const location of locations) {
          const key = locationKey(location);
          if (!seen.has(key)) {
            seen.add(key);
            activeLocations.push(location);
          }
        }
      }
    }
  }

  // De-duplicated in first-seen order, but a code viewer wants a stable,
  // position-sorted highlight: sort by line, then column, then end range.
  activeLocations.sort(compareLocations);

  return { activeStepIds, activeLocations };
}

/**
 * Order two {@link SourceLocation}s by line, then column, then end range.
 *
 * A total order so the de-duplicated location list is deterministic regardless of
 * the order steps and their locations were declared in.
 */
function compareLocations(a: SourceLocation, b: SourceLocation): number {
  if (a.line !== b.line) return a.line - b.line;
  if ((a.column ?? Infinity) !== (b.column ?? Infinity)) {
    return (a.column ?? Infinity) - (b.column ?? Infinity);
  }
  if ((a.endLine ?? Infinity) !== (b.endLine ?? Infinity)) {
    return (a.endLine ?? Infinity) - (b.endLine ?? Infinity);
  }
  return (a.endColumn ?? Infinity) - (b.endColumn ?? Infinity);
}

/**
 * Build a scene-scoped resolver that validates its steps once and resolves on
 * demand.
 *
 * @param steps - The semantic steps to resolve (typically one scene's, or the
 *   full animation's when a `sceneId` scopes the lookups).
 * @param sceneId - The scene this resolver resolves for, or `undefined` to
 *   resolve across every step.
 * @throws {@link CodeSyncError} when any applicable step or location is
 *   malformed — validation happens eagerly at construction so a defect surfaces
 *   before the first frame rather than on some later seek.
 */
export function createCodeSyncResolver(
  steps: readonly SemanticStep[],
  sceneId: string | undefined,
): CodeSyncResolver {
  // Validate eagerly so a malformed mapping fails fast, independent of time.
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step === undefined) continue;
    if (sceneId !== undefined && step.sceneId !== undefined && step.sceneId !== sceneId) {
      continue;
    }
    validateStep(step, i);
  }

  // Pre-filter to the steps this resolver applies to, in declared order.
  const scoped = steps.filter(
    (step): step is SemanticStep =>
      step !== undefined &&
      (sceneId === undefined || step.sceneId === undefined || step.sceneId === sceneId),
  );

  return {
    sceneId: sceneId ?? '',
    resolve(time: number): CodeSyncResolution {
      if (!Number.isFinite(time)) {
        throw new CodeSyncError('time is not finite');
      }
      if (time < 0) {
        throw new CodeSyncError('time is negative');
      }
      const activeStepIds: string[] = [];
      const seen = new Set<string>();
      const activeLocations: SourceLocation[] = [];
      for (const step of scoped) {
        if (time >= step.start && time < step.end) {
          activeStepIds.push(step.id);
          const locations = step.sourceLocations;
          if (locations !== undefined) {
            for (const location of locations) {
              const key = locationKey(location);
              if (!seen.has(key)) {
                seen.add(key);
                activeLocations.push(location);
              }
            }
          }
        }
      }
      activeLocations.sort(compareLocations);
      return { activeStepIds, activeLocations };
    },
  };
}

/**
 * Resolve the active mapping for an {@link SemanticSteps} container.
 *
 * A thin convenience over {@link resolveCodeSync} for callers that hold a
 * `SemanticSteps` value (as an `AnimationDefinition.semanticSteps` provides)
 * rather than a bare step array. It resolves across the container's steps,
 * optionally scoped to one scene.
 */
export function resolveSteps(
  container: SemanticSteps,
  sceneId: string | undefined,
  time: number,
): CodeSyncResolution {
  return resolveCodeSync(container.steps, sceneId, time);
}
