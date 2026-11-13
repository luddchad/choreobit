import type { Vector2 } from '@choreobit/core';
import type { ScheduledOperation } from '../scheduling/types';
import { applyEasing, clamp01 } from './easing';

/**
 * Numeric interpolation and the elapsed-fraction computation that drives it.
 *
 * A continuous operation (`move`, and the numeric case of `set`) interpolates a
 * value over its interval `[start, end]` using an {@link Easing} curve. These
 * helpers are the pure, renderer-agnostic math behind that interpolation: the
 * operation interpreters in `./operations` call them but add no timing logic of
 * their own.
 */

/**
 * The linear interpolation of two scalars by a fraction `t` in `[0, 1]`.
 *
 * `t = 0` yields `from`, `t = 1` yields `to`. The fraction is whatever the
 * caller supplies (typically an eased fraction from {@link applyEasing}); the
 * function does not clamp, so it can also produce extrapolations.
 */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * The linear interpolation of two {@link Vector2}s by a fraction `t` in `[0, 1]`,
 * applied independently to each axis.
 */
export function lerpPosition(from: Vector2, to: Vector2, t: number): Vector2 {
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
}

/**
 * The eased elapsed fraction of a scheduled operation at time `time`.
 *
 * The raw fraction `(time - start) / duration` is clamped to `[0, 1]` and passed
 * through the operation's easing curve. This makes the value well-defined at and
 * beyond the interval boundaries:
 *
 * - before `start` the fraction is `0` (the eased value `from`);
 * - at or after `end` the fraction is `1` (the eased value `to`);
 * - an operation of duration `0` is instantaneous, so its fraction is `1` at or
 *   after `start` (the eased value `to`).
 *
 * The clamping here is the single place the interval's edges are enforced, so an
 * interpreter reads a fraction already in `[0, 1]`.
 */
export function progressFor(
  time: number,
  scheduled: Pick<ScheduledOperation, 'start' | 'duration' | 'operation'>,
): number {
  const { start, duration, operation } = scheduled;
  if (duration <= 0) {
    // An instantaneous operation is fully applied from its start onward.
    return time >= start ? 1 : 0;
  }
  const raw = (time - start) / duration;
  const clamped = clamp01(raw);
  return applyEasing(clamped, operation.easing);
}
