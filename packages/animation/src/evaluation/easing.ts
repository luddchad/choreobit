import type { Easing, EasingName } from '@choreobit/core';

/**
 * Named easing curves, after Robert Penner.
 *
 * Each curve maps a normalized elapsed fraction `t` in `[0, 1]` to an eased
 * fraction in `[0, 1]`. The named set is exactly the {@link EasingName}s core
 * permits, so `applyEasing` is exhaustive over the closed set: a future curve is
 * a versioned core change (it widens the union) that must add a curve here.
 */

/**
 * The identity curve: the eased fraction equals the elapsed fraction. The
 * default when an operation carries no easing.
 */
function linear(t: number): number {
  return t;
}

/** Quadratic ease-in: slow at the start, accelerating. `t` in `[0, 1]`. */
function easeInQuad(t: number): number {
  return t * t;
}

/** Quadratic ease-out: fast at the start, decelerating. `t` in `[0, 1]`. */
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Quadratic ease-in-out. `t` in `[0, 1]`. */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Cubic ease-in: a sharper acceleration than quadratic. `t` in `[0, 1]`. */
function easeInCubic(t: number): number {
  return t * t * t;
}

/** Cubic ease-out: a sharper deceleration than quadratic. `t` in `[0, 1]`. */
function easeOutCubic(t: number): number {
  const c = 1 - t;
  return 1 - c * c * c;
}

/** Cubic ease-in-out. `t` in `[0, 1]`. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Sine ease-in. `t` in `[0, 1]`. */
function easeInSine(t: number): number {
  return 1 - Math.cos((t * Math.PI) / 2);
}

/** Sine ease-out. `t` in `[0, 1]`. */
function easeOutSine(t: number): number {
  return Math.sin((t * Math.PI) / 2);
}

/** Sine ease-in-out. `t` in `[0, 1]`. */
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * The table of named curves. Keyed by {@link EasingName}, the closed set core
 * permits. `applyEasing` reads this table, so a name core accepts always finds
 * a curve; a name absent here is unreachable (core rejects it at validation).
 */
const CURVES: Readonly<Record<EasingName, (t: number) => number>> = {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInSine,
  easeOutSine,
  easeInOutSine,
};

/**
 * The eased fraction of an operation at a normalized elapsed `t` in `[0, 1]`.
 *
 * `t` is clamped to `[0, 1]` first, so the curve is well-defined even if the
 * caller passes a fraction slightly outside (as can happen at the exact start or
 * end of an interval). The `Easing.name` selects the curve; `tension` and
 * `bounciness` are accepted but unused by these named curves — they are
 * parameters for curves core may add later, and ignoring them keeps the named
 * set free of behavior the names do not describe.
 */
export function applyEasing(t: number, easing: Easing | undefined): number {
  const clamped = clamp01(t);
  const curve = easing === undefined ? linear : CURVES[easing.name];
  return curve(clamped);
}

/**
 * The closed set of easing curves, exported for consumers (and tests) that need
 * to enumerate or inspect them. The values are the same functions the table
 * holds.
 */
export const EASING_CURVES = CURVES;

/**
 * Clamp a value into `[0, 1]`. Used by {@link applyEasing} to keep the curves
 * well-defined at interval boundaries.
 */
export function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}
