import { describe, expect, it } from 'vitest';
import type { SemanticStep } from '@choreobit/core';
import { CodeSyncError, createSemanticStepper, isCodeSyncError, resolveStepStops } from '../index';

/**
 * Semantic-stepping tests.
 *
 * These exercise the pure {@link resolveStepStops} helper and its companion
 * {@link createSemanticStepper}. The stepper owns no clock or animation state, so
 * a test fixes the steps, a scene id, and a duration, then asserts the stop times
 * and the navigation answers exactly — no player, no scheduler, no browser.
 */

/**
 * Build a `SemanticStep` with sensible defaults and the given overrides.
 *
 * `start` is taken from the overrides (defaulting to `0`); `end` defaults to
 * `start + 1` so a step that only specifies a `start` still has a valid,
 * non-inverted interval. A test that needs a specific `end` (or a malformed one)
 * supplies it explicitly.
 */
function step(overrides: Partial<SemanticStep> & Pick<SemanticStep, 'id'>): SemanticStep {
  const start = overrides.start ?? 0;
  return {
    sceneId: 's',
    description: overrides.id,
    start,
    end: overrides.end ?? start + 1,
    operations: [],
    ...overrides,
  };
}

describe('resolveStepStops — stop times', () => {
  it('returns an empty array for no steps', () => {
    expect(resolveStepStops([], 's', 10)).toEqual([]);
  });

  it('returns the single start of a single step', () => {
    expect(resolveStepStops([step({ id: 'a', start: 3, end: 5 })], 's', 10)).toEqual([3]);
  });

  it('returns the distinct starts sorted ascending', () => {
    const steps = [
      step({ id: 'a', start: 5, end: 6 }),
      step({ id: 'b', start: 1, end: 2 }),
      step({ id: 'c', start: 3, end: 4 }),
    ];
    expect(resolveStepStops(steps, 's', 10)).toEqual([1, 3, 5]);
  });

  it('de-duplicates steps that begin at the same time', () => {
    const steps = [step({ id: 'a', start: 2, end: 3 }), step({ id: 'b', start: 2, end: 4 })];
    expect(resolveStepStops(steps, 's', 10)).toEqual([2]);
  });

  it('ignores steps of another scene', () => {
    const steps = [
      step({ id: 'a', sceneId: 's', start: 1, end: 2 }),
      step({ id: 'b', sceneId: 'other', start: 5, end: 6 }),
    ];
    expect(resolveStepStops(steps, 's', 10)).toEqual([1]);
  });

  it('includes steps with no sceneId (definition-wide)', () => {
    const steps = [
      step({ id: 'a', sceneId: 's', start: 1, end: 2 }),
      step({ id: 'b', sceneId: undefined as unknown as string, start: 4, end: 5 }),
    ];
    expect(resolveStepStops(steps, 's', 10)).toEqual([1, 4]);
  });

  it('ignores end times, using only starts', () => {
    const steps = [step({ id: 'a', start: 1, end: 9 }), step({ id: 'b', start: 4, end: 9 })];
    expect(resolveStepStops(steps, 's', 10)).toEqual([1, 4]);
  });
});

describe('resolveStepStops — scene scoping', () => {
  it('scopes by the scene id and collects only that scene’s starts', () => {
    const steps = [
      step({ id: 'a', sceneId: 's1', start: 1, end: 2 }),
      step({ id: 'b', sceneId: 's1', start: 4, end: 5 }),
      step({ id: 'c', sceneId: 's2', start: 7, end: 8 }),
    ];
    expect(resolveStepStops(steps, 's1', 10)).toEqual([1, 4]);
    expect(resolveStepStops(steps, 's2', 10)).toEqual([7]);
    expect(resolveStepStops(steps, 's3', 10)).toEqual([]);
  });
});

describe('resolveStepStops — validation', () => {
  it('throws on a non-finite duration', () => {
    expect(() => resolveStepStops([], 's', Number.NaN)).toThrow(CodeSyncError);
    expect(() => resolveStepStops([], 's', Number.POSITIVE_INFINITY)).toThrow(CodeSyncError);
  });

  it('throws on a negative duration', () => {
    expect(() => resolveStepStops([], 's', -1)).toThrow(/negative/);
  });

  it('throws on a non-finite start', () => {
    expect(() => resolveStepStops([step({ id: 'a', start: Number.NaN })], 's', 10)).toThrow(
      /start is not finite/,
    );
  });

  it('throws on a negative start', () => {
    expect(() => resolveStepStops([step({ id: 'a', start: -1 })], 's', 10)).toThrow(
      /start is negative/,
    );
  });

  it('throws on a start beyond the duration', () => {
    expect(() => resolveStepStops([step({ id: 'a', start: 11 })], 's', 10)).toThrow(
      /start exceeds duration/,
    );
  });

  it('throws on a non-finite end', () => {
    expect(() => resolveStepStops([step({ id: 'a', end: Number.NaN })], 's', 10)).toThrow(
      /end is not finite/,
    );
  });

  it('throws on a negative end', () => {
    expect(() => resolveStepStops([step({ id: 'a', end: -1 })], 's', 10)).toThrow(
      /end is negative/,
    );
  });

  it('throws on an end that precedes the start', () => {
    expect(() => resolveStepStops([step({ id: 'a', start: 5, end: 2 })], 's', 10)).toThrow(
      /end precedes its start/,
    );
  });

  it('throws on an end beyond the duration', () => {
    expect(() => resolveStepStops([step({ id: 'a', end: 11 })], 's', 10)).toThrow(
      /end exceeds duration/,
    );
  });

  it('throws on a duplicate id within the scope', () => {
    expect(() =>
      resolveStepStops([step({ id: 'a', start: 1 }), step({ id: 'a', start: 4 })], 's', 10),
    ).toThrow(/duplicate step id/);
  });

  it('allows a duplicate id across different scenes', () => {
    const steps = [
      step({ id: 'a', sceneId: 's1', start: 1 }),
      step({ id: 'a', sceneId: 's2', start: 4 }),
    ];
    expect(resolveStepStops(steps, 's1', 10)).toEqual([1]);
    expect(resolveStepStops(steps, 's2', 10)).toEqual([4]);
  });

  it('accepts a step that ends exactly at the duration', () => {
    const steps = [step({ id: 'a', start: 0, end: 10 })];
    expect(resolveStepStops(steps, 's', 10)).toEqual([0]);
  });

  it('accepts a zero-duration step as a stop at its start', () => {
    const steps = [step({ id: 'a', start: 3, end: 3 })];
    expect(resolveStepStops(steps, 's', 10)).toEqual([3]);
  });

  it('validates only in-scope steps, ignoring another scene’s bad step', () => {
    const steps = [
      step({ id: 'a', sceneId: 's', start: 1, end: 2 }),
      step({ id: 'b', sceneId: 'other', start: -1 }),
    ];
    expect(resolveStepStops(steps, 's', 10)).toEqual([1]);
  });
});

describe('createSemanticStepper — navigation', () => {
  it('exposes the frozen stop times', () => {
    const stepper = createSemanticStepper([step({ id: 'a', start: 2 })], 's', 10);
    expect(stepper.stopTimes).toEqual([2]);
    expect(Object.isFrozen(stepper.stopTimes)).toBe(true);
  });

  it('finds the smallest stop strictly after a time', () => {
    const stepper = createSemanticStepper(
      [step({ id: 'a', start: 1 }), step({ id: 'b', start: 4 })],
      's',
      10,
    );
    expect(stepper.nextStop(0)).toBe(1);
    expect(stepper.nextStop(1)).toBe(4);
    expect(stepper.nextStop(1.5)).toBe(4);
    expect(stepper.nextStop(3.9)).toBe(4);
  });

  it('returns null past the last stop', () => {
    const stepper = createSemanticStepper([step({ id: 'a', start: 4 })], 's', 10);
    expect(stepper.nextStop(4)).toBeNull();
    expect(stepper.nextStop(4.1)).toBeNull();
  });

  it('skips the stop at the query time (strict comparison)', () => {
    const stepper = createSemanticStepper(
      [step({ id: 'a', start: 0 }), step({ id: 'b', start: 5 })],
      's',
      10,
    );
    expect(stepper.nextStop(0)).toBe(5);
  });

  it('finds the largest stop strictly before a time', () => {
    const stepper = createSemanticStepper(
      [step({ id: 'a', start: 1 }), step({ id: 'b', start: 4 })],
      's',
      10,
    );
    expect(stepper.previousStop(10)).toBe(4);
    expect(stepper.previousStop(4)).toBe(1);
    expect(stepper.previousStop(3.9)).toBe(1);
  });

  it('returns null at or before the first stop', () => {
    const stepper = createSemanticStepper([step({ id: 'a', start: 1 })], 's', 10);
    expect(stepper.previousStop(1)).toBeNull();
    expect(stepper.previousStop(0.5)).toBeNull();
  });

  it('hasNext / hasPrevious mirror nextStop / previousStop', () => {
    const stepper = createSemanticStepper(
      [step({ id: 'a', start: 1 }), step({ id: 'b', start: 4 })],
      's',
      10,
    );
    expect(stepper.hasNext(0)).toBe(true);
    expect(stepper.hasNext(4)).toBe(false);
    expect(stepper.hasPrevious(10)).toBe(true);
    expect(stepper.hasPrevious(1)).toBe(false);
  });

  it('reports no navigation when there are no steps', () => {
    const stepper = createSemanticStepper([], 's', 10);
    expect(stepper.stopTimes).toEqual([]);
    expect(stepper.nextStop(0)).toBeNull();
    expect(stepper.previousStop(10)).toBeNull();
    expect(stepper.hasNext(0)).toBe(false);
    expect(stepper.hasPrevious(10)).toBe(false);
  });

  it('navigates through a realistic sequence of beats', () => {
    const stepper = createSemanticStepper(
      [
        step({ id: 'init', start: 0, end: 1.5 }),
        step({ id: 'mid-1', start: 1.5, end: 3 }),
        step({ id: 'narrow-low', start: 3, end: 4.5 }),
        step({ id: 'found', start: 9, end: 10 }),
      ],
      's',
      10,
    );
    expect(stepper.nextStop(0)).toBe(1.5);
    expect(stepper.nextStop(1.5)).toBe(3);
    expect(stepper.nextStop(3)).toBe(9);
    expect(stepper.nextStop(4.5)).toBe(9);
    expect(stepper.nextStop(9)).toBeNull();
    expect(stepper.previousStop(10)).toBe(9);
    expect(stepper.previousStop(9)).toBe(3);
    expect(stepper.previousStop(4.5)).toBe(3);
    expect(stepper.previousStop(3)).toBe(1.5);
    expect(stepper.previousStop(1.5)).toBe(0);
    expect(stepper.previousStop(0)).toBeNull();
  });

  it('propagates a malformed step from resolveStepStops', () => {
    expect(() => createSemanticStepper([step({ id: 'a', start: 11 })], 's', 10)).toThrow(
      CodeSyncError,
    );
    expect(isCodeSyncError(new CodeSyncError('x'))).toBe(true);
  });
});
