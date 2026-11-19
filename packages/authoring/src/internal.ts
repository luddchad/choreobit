import type { StableId } from '@choreobit/core';
import { AuthoringError } from './errors';

/**
 * The shared, non-public validation helpers the authoring builders use to turn a
 * malformed input into an {@link AuthoringError} at authoring time.
 *
 * These are not re-exported from the package entry point; they exist so every
 * builder enforces the same rules (a non-empty id, a finite non-negative
 * duration, a finite coordinate, a finite non-negative start time) in one place.
 */

/** True when `value` is a finite number. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Assert that an id is a non-empty string, throwing an {@link AuthoringError}
 * otherwise. Returns the id so the caller can chain the check.
 */
export function requireId(value: unknown, field: string): StableId {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AuthoringError(`${field}: must be a non-empty string`);
  }
  return value;
}

/**
 * Assert that a duration is a finite, non-negative number, throwing an
 * {@link AuthoringError} otherwise.
 */
export function requireDuration(value: number): number {
  if (!isFiniteNumber(value) || value < 0) {
    throw new AuthoringError(`duration: must be a finite, non-negative number`);
  }
  return value;
}

/**
 * Assert that a start time is a finite, non-negative number, throwing an
 * {@link AuthoringError} otherwise.
 */
export function requireStartAt(value: number): number {
  if (!isFiniteNumber(value) || value < 0) {
    throw new AuthoringError(`startAt: must be a finite, non-negative number`);
  }
  return value;
}

/**
 * Assert that a value is a finite, non-negative number, throwing an
 * {@link AuthoringError} that names `field` otherwise. Used for scene and step
 * durations and step `start`/`end` timestamps.
 */
export function requireNonNegative(value: number, field: string): number {
  if (!isFiniteNumber(value) || value < 0) {
    throw new AuthoringError(`${field}: must be a finite, non-negative number`);
  }
  return value;
}

/**
 * Assert that a coordinate pair carries two finite numbers, throwing an
 * {@link AuthoringError} otherwise.
 */
export function requireVector(
  to: { x: number; y: number },
  field: string,
): { x: number; y: number } {
  if (!isFiniteNumber(to.x) || !isFiniteNumber(to.y)) {
    throw new AuthoringError(`${field}: x and y must be finite numbers`);
  }
  return { x: to.x, y: to.y };
}
