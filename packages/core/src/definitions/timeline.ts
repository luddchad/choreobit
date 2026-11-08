import type { Easing, JsonValue, StableId } from './common';

/**
 * The closed set of operation kinds known to core.
 *
 * `OperationKind` is a **closed union**. `validateAnimationDefinition` rejects
 * an operation whose `type` is not one of these members, and **adding a new
 * built-in kind is a versioned core change** (it widens this union, which older
 * consumers that type-check against core will see).
 *
 * Operation-specific *parameter interpretation* is **not** core's concern:
 * `params` is free-form JSON and a consumer package (for example
 * `@choreobit/animation` or `@choreobit/renderer`) decides what `{ x, y }`
 * means for `move` or `{ name, value }` for `set`. Core validates that the
 * *document structure* and the *operation kind* are well-formed; it does not
 * validate that an operation's `params` are meaningful for its `type`.
 *
 * This is distinct from unknown *document extension* fields: an unknown key
 * inside an `extensions` map is preserved and accepted, whereas an unrecognized
 * operation `type` is rejected. See {@link validateAnimationDefinition}.
 *
 * These kinds cover the examples in the design: move, change a property,
 * highlight, change visibility, transform, add/remove an object, and
 * connect/disconnect objects.
 */
export type OperationKind =
  | 'move'
  | 'set'
  | 'highlight'
  | 'setVisible'
  | 'transform'
  | 'addObject'
  | 'removeObject'
  | 'connect'
  | 'disconnect'
  | 'annotation';

/** A single timeline operation. */
export interface Operation {
  /** A stable identifier for the operation, unique within its scene. */
  id: StableId;
  /** The kind of change. See {@link OperationKind}. */
  type: OperationKind;
  /**
   * The id of the object the operation targets. Absent for scene-level
   * operations such as `addObject`/`removeObject`, which carry the affected ids
   * in `params`.
   */
  target?: StableId;
  /**
   * Operation parameters. Free-form JSON so any operation can carry its own data
   * (e.g. `{ x, y }` for `move`, `{ name, value }` for `set`).
   */
  params?: { [key: string]: JsonValue };
  /**
   * The duration, in seconds. `0` means an instantaneous change (e.g. toggling
   * visibility).
   *
   * An operation carries **no start time of its own**: when it begins is a
   * property of the container that holds it. In a {@link Sequence} the first
   * operation begins at the sequence's `startAt` and each subsequent operation
   * begins when the previous one finishes; in a {@link Parallel} every operation
   * begins at the group's `startAt`. See the scheduling rules documented on
   * {@link Sequence} and {@link Parallel}.
   */
  duration: number;
  /** Optional easing applied over the operation's duration. */
  easing?: Easing;
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}

/**
 * A sequence of operations that advance one after another.
 *
 * **Scheduling semantics.** The operations run consecutively in array order:
 * the first operation begins at the sequence's `startAt` (an omitted `startAt`
 * is `0`), and each subsequent operation begins exactly when the previous one
 * finishes. Operation objects carry no start of their own (see
 * {@link Operation.duration}), so the start of the `n`th operation is the
 * `startAt` plus the sum of the durations of the operations before it.
 *
 * The **duration of the sequence** is therefore the sum of its operations'
 * durations, and the sequence's end time is `startAt` + that sum.
 *
 * A sequence is a data description only: core computes nothing at runtime. The
 * future `@choreobit/animation` package interprets these rules.
 */
export interface Sequence {
  /** The node kind, used as the discriminant of {@link TimelineNode}. */
  kind: 'sequence';
  /** The operations, in execution order. */
  operations: readonly Operation[];
  /**
   * The time, in seconds, at which the sequence begins, relative to the
   * containing scene. Omitted means `0`. The first operation starts here and
   * subsequent operations follow back-to-back.
   */
  startAt?: number;
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}

/**
 * A group of operations that advance concurrently.
 *
 * **Scheduling semantics.** Every operation in the group begins simultaneously
 * at the group's `startAt` (an omitted `startAt` is `0`) and runs for its own
 * duration. Because they start together, operations with different durations
 * naturally end at different times; that is expected.
 *
 * The **duration of the group** is the maximum of its operations' durations, so
 * the group's end time is `startAt` + that maximum.
 *
 * A group is a data description only: core computes nothing at runtime. The
 * future `@choreobit/animation` package interprets these rules.
 */
export interface Parallel {
  /** The node kind, used as the discriminant of {@link TimelineNode}. */
  kind: 'parallel';
  /** The operations that run together. */
  operations: readonly Operation[];
  /**
   * The time, in seconds, at which the group begins, relative to the containing
   * scene. Omitted means `0`. Every operation starts here simultaneously.
   */
  startAt?: number;
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}

/**
 * A timeline composition node: a {@link Sequence} or a {@link Parallel} group.
 *
 * The `kind` field discriminates the two so consumers can narrow without
 * casting.
 */
export type TimelineNode = Sequence | Parallel;

/**
 * The ordered list of composition nodes that make up a scene's animation.
 *
 * A scene's timeline is a flat, ordered list of {@link TimelineNode}s. This
 * keeps the model serializable (no nested closures).
 *
 * **Placement.** Each node's `startAt` is relative to the containing scene.
 * Independent top-level nodes are **not** chained: their start times are not
 * constrained by array order, so two nodes may overlap on the scene timeline.
 * Consecutiveness and simultaneity are properties of the *node kind*
 * ({@link Sequence} vs {@link Parallel}), not of the list ordering.
 */
export interface Timeline {
  /** The composition nodes. */
  nodes: readonly TimelineNode[];
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}
