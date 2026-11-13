import type { OperationKind } from '@choreobit/core';
import type { EvaluationError } from './error';

/**
 * The evaluated visual state of a single object at one instant.
 *
 * This is the renderer-facing counterpart of {@link VisualObjectState}. Where the
 * source state is fully optional (a renderer fills in whatever is missing), an
 * evaluated state is **total**: the fields a renderer always reads are present
 * with deterministic defaults, so a frame can be rendered without a second pass
 * of default-filling.
 *
 * The evaluator derives this by replaying the scheduled operations that have
 * begun by the evaluation time onto the object's initial {@link
 * VisualObjectState}. It never mutates the source scene.
 */
export interface EvaluatedObjectState {
  /**
   * The object's logical position at the evaluation time. Present whenever the
   * source state supplied a position or a `move` operation targets it; absent
   * otherwise, leaving the position to renderer defaults.
   */
  position?: { x: number; y: number };
  /**
   * The object's opacity in `[0, 1]` at the evaluation time. Present whenever the
   * source state supplied an opacity or a `set` operation targets the `opacity`
   * property; absent otherwise.
   */
  opacity?: number;
  /**
   * Whether the object is visible. Always present: it defaults to `true` unless a
   * `setVisible` operation (or the source state) made it `false`.
   */
  visible: boolean;
  /**
   * Whether the object is the current focus of attention. Always present: it
   * defaults to `false` unless a `highlight` operation has begun by the
   * evaluation time.
   */
  highlighted: boolean;
  /**
   * The color a `highlight` operation attached to the object, as free-form JSON.
   * Present only when an active highlight carries a `color`; otherwise absent.
   */
  highlightColor?: unknown;
  /**
   * The object's type-specific properties at the evaluation time. Always present
   * (an empty object when none apply). Numeric properties that a `set` operation
   * is mid-interpolating hold the interpolated value.
   */
  properties: { [key: string]: unknown };
  /** Vendor/extension state copied through from the source object's state. */
  extensions?: { [key: string]: unknown };
}

/**
 * An object of the evaluated scene: its identity, its evaluated state, and its
 * evaluated children.
 *
 * The structure mirrors the source {@link import('@choreobit/core').VisualObject}
 * tree so a renderer can walk it the same way; only `state` changes shape (from
 * the optional {@link VisualObjectState} to the total {@link
 * EvaluatedObjectState}).
 */
export interface EvaluatedVisualObject {
  /** Copied from the source object; the evaluated tree keeps stable ids. */
  readonly id: string;
  /** Copied from the source object. */
  readonly type: string;
  /** The object's state at the evaluation time. */
  readonly state: EvaluatedObjectState;
  /** The object's evaluated children, in source order. */
  readonly children: readonly EvaluatedVisualObject[];
}

/**
 * The complete visual state of a scene at one instant.
 *
 * This is the `ok` payload of a {@link SceneEvaluation}. It is a fresh snapshot
 * derived from the source scene and the schedule; it shares no references with
 * the source scene, so it is safe to hand to a renderer and to compare between
 * frames.
 */
export interface SceneVisualState {
  /** The evaluated time, in seconds, relative to the scene. */
  readonly time: number;
  /** The scene's evaluated objects, in source order. */
  readonly objects: readonly EvaluatedVisualObject[];
}

/**
 * The result of evaluating a scene at one time.
 *
 * Evaluation is total: it never throws. A well-formed evaluation yields a
 * `SceneVisualState`; a scene that asks for something the evaluator cannot
 * interpret (an unsupported operation kind, a missing target, or malformed
 * parameters) yields an {@link EvaluationError} instead, describing the first
 * offending operation so a caller can surface it.
 */
export type SceneEvaluation =
  | {
      /** The evaluation succeeded. */
      readonly ok: true;
      /** The evaluated visual state. */
      readonly state: SceneVisualState;
    }
  | {
      /** The evaluation could not be completed. */
      readonly ok: false;
      /** The first error encountered during the walk. */
      readonly error: EvaluationError;
    };

/**
 * The closed set of operation kinds the evaluator interprets.
 *
 * These are the kinds whose parameter meaning is fixed by `@choreobit/animation`:
 * moving an object, setting a property (including `opacity`), highlighting, and
 * toggling visibility. The remaining {@link OperationKind}s (`transform`,
 * `addObject`, `removeObject`, `connect`, `disconnect`, `annotation`) are not yet
 * interpreted; encountering one at or before the evaluation time is a reported
 * error, not a silent no-op, so a gap in interpretation can never hide in a
 * rendered frame.
 */
export const SUPPORTED_OPERATION_KINDS = [
  'move',
  'set',
  'highlight',
  'setVisible',
] as const satisfies readonly OperationKind[];

/** The closed set of operation kinds the evaluator interprets. */
export type SupportedOperationKind = (typeof SUPPORTED_OPERATION_KINDS)[number];
