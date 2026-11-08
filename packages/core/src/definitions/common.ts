/**
 * Shared, renderer-agnostic value contracts for ChoreoBit animation definitions.
 *
 * Every value here is JSON-serializable: no functions, class instances, or
 * environment-specific objects are permitted. This is the foundation on which
 * every ChoreoBit package builds its data model.
 */

/** A string identifier that is stable across authoring, serialization, and playback. */
export type StableId = string;

/**
 * A coordinate in the logical 2-D space of an animation.
 *
 * Coordinates are plain numbers in the document's own logical units (defined by
 * {@link AnimationDefinition.width} and {@link AnimationDefinition.height}).
 * No physical unit (pixels, cm, …) is implied, so a definition is independent of
 * any rendering surface.
 */
export interface Vector2 {
  /** The horizontal coordinate in logical units. */
  x: number;
  /** The vertical coordinate in logical units. */
  y: number;
}

/**
 * An affine transform expressed as a 3×2 matrix.
 *
 * Rows store the linear part and the translation part:
 *
 * ```
 * | a b |
 * | c d |
 * | e f |
 * ```
 *
 * A point `(px, py)` maps to `(a·px + b·py + e, c·px + d·py + f)`.
 * `a`..`d` are the linear part; `e`, `f` are the translation.
 */
export interface Transform {
  /** Top-left linear coefficient. */
  a: number;
  /** Top-right linear coefficient. */
  b: number;
  /** Bottom-left linear coefficient. */
  c: number;
  /** Bottom-right linear coefficient. */
  d: number;
  /** Horizontal translation. */
  e: number;
  /** Vertical translation. */
  f: number;
}

/**
 * A named easing curve.
 *
 * This is metadata only. Core defines the name; the concrete interpolation is a
 * concern of `@choreobit/animation`. A definition never embeds a function.
 */
export type EasingName =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInSine'
  | 'easeOutSine'
  | 'easeInOutSine';

/**
 * An easing specification attached to an operation.
 *
 * The `name` is always present; `tension`/`bounciness` are optional parameters
 * that a concrete interpolation may or may not use.
 */
export interface Easing {
  /** The named easing curve. */
  name: EasingName;
  /** Optional tension parameter, in `[0, 1]`. */
  tension?: number;
  /** Optional bounciness parameter, in `[0, 1]`. */
  bounciness?: number;
}

/**
 * An opaque value held by an object's initial state or an operation's parameters.
 *
 * JSON-only. This is the union of everything a definition may carry without
 * naming a type, keeping the model open to any object type.
 */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object with string keys and JSON values. */
export type JsonObject = { [key: string]: JsonValue };
