import type { Easing, JsonValue, Operation, OperationKind, StableId } from '@choreobit/core';
import { AuthoringError } from './errors';
import { requireDuration, requireId, requireVector } from './internal';

/**
 * The options an operation builder accepts alongside its core arguments: an
 * optional easing and vendor extensions, threaded onto the produced
 * {@link Operation}.
 */
export interface OperationBuilderOptions {
  /** Optional easing applied over the operation's duration. */
  easing?: Easing;
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}

/**
 * The options the {@link move} builder accepts: the destination coordinates plus
 * the shared {@link OperationBuilderOptions}.
 */
export interface MoveOptions extends OperationBuilderOptions {
  /** The destination x coordinate in logical units. */
  x: number;
  /** The destination y coordinate in logical units. */
  y: number;
}

/**
 * The options the {@link set} builder accepts: the property to set and its
 * value, plus the shared {@link OperationBuilderOptions}.
 */
export interface SetOptions extends OperationBuilderOptions {
  /** The property name to set on the target object. */
  name: string;
  /** The JSON value to set the property to. */
  value: JsonValue;
}

/**
 * The options the {@link highlight} builder accepts: an optional `duration`
 * (defaulting to `0`, an instantaneous highlight), an optional highlight color,
 * and the shared {@link OperationBuilderOptions}.
 */
export interface HighlightOptions extends OperationBuilderOptions {
  /** The duration, in seconds. Defaults to `0` (instantaneous). */
  duration?: number;
  /** The highlight color, as free-form JSON. Omitted means the default. */
  color?: JsonValue;
}

/**
 * The options the {@link setVisible} builder accepts: an optional `duration`
 * (defaulting to `0`, an instantaneous toggle) and an optional `visible`
 * (defaulting to `true`), plus the shared {@link OperationBuilderOptions}.
 */
export interface SetVisibleOptions extends OperationBuilderOptions {
  /** The duration, in seconds. Defaults to `0` (instantaneous). */
  duration?: number;
  /** Whether the target becomes visible. Defaults to `true` when omitted. */
  visible?: boolean;
}

/**
 * Assemble a {@link Operation} from its kind, target, duration, and parameters.
 *
 * Only the fields the builder was given are written: a missing `params`, `easing`,
 * `extensions`, or `target` stays absent so the produced operation carries exactly
 * what the caller asked for. The `id`, `type`, and `duration` are always present.
 */
function buildOperation(
  id: StableId,
  type: OperationKind,
  input: {
    target?: StableId;
    duration: number;
    params?: { [key: string]: JsonValue };
    easing?: Easing;
    extensions?: { [key: string]: JsonValue };
  },
): Operation {
  const operation: Operation = {
    id,
    type,
    duration: input.duration,
  };
  if (input.target !== undefined) {
    operation.target = input.target;
  }
  if (input.params !== undefined) {
    operation.params = input.params;
  }
  if (input.easing !== undefined) {
    operation.easing = input.easing;
  }
  if (input.extensions !== undefined) {
    operation.extensions = input.extensions;
  }
  return operation;
}

/**
 * Move `target` to the destination `to`, over `duration` seconds, with an
 * optional easing. Produces a `move` operation whose `params` are `{ x, y }`.
 */
export function move(
  id: StableId,
  target: StableId,
  to: { x: number; y: number },
  duration: number,
  options: OperationBuilderOptions = {},
): Operation {
  requireId(id, 'move.id');
  requireId(target, 'move.target');
  requireVector(to, 'move.to');
  requireDuration(duration);
  const params: { x: number; y: number } = { x: to.x, y: to.y };
  return buildOperation(id, 'move', {
    target,
    duration,
    params,
    easing: options.easing,
    extensions: options.extensions,
  });
}

/**
 * Set the property `name` on `target` to `value`, over `duration` seconds.
 * Produces a `set` operation whose `params` are `{ name, value }`.
 */
export function set(
  id: StableId,
  target: StableId,
  name: string,
  value: JsonValue,
  duration: number,
  options: OperationBuilderOptions = {},
): Operation {
  requireId(id, 'set.id');
  requireId(target, 'set.target');
  if (typeof name !== 'string' || name.length === 0) {
    throw new AuthoringError('set.name: must be a non-empty string');
  }
  requireDuration(duration);
  const params: { name: string; value: JsonValue } = { name, value };
  return buildOperation(id, 'set', {
    target,
    duration,
    params,
    easing: options.easing,
    extensions: options.extensions,
  });
}

/**
 * Highlight `target` (optionally with a `color`), over an optional `duration`
 * (defaulting to `0`, an instantaneous highlight). Produces a `highlight`
 * operation whose `params` are `{ color }` when a color is given, and no `params`
 * otherwise (the renderer's default highlight applies).
 */
export function highlight(
  id: StableId,
  target: StableId,
  options: HighlightOptions = {},
): Operation {
  requireId(id, 'highlight.id');
  requireId(target, 'highlight.target');
  const duration = options.duration === undefined ? 0 : requireDuration(options.duration);
  const input: {
    target: StableId;
    duration: number;
    params?: { [key: string]: JsonValue };
    easing?: Easing;
    extensions?: { [key: string]: JsonValue };
  } = { target, duration, easing: options.easing, extensions: options.extensions };
  if (options.color !== undefined) {
    input.params = { color: options.color };
  }
  return buildOperation(id, 'highlight', input);
}

/**
 * Set `target`'s visibility, over an optional `duration` (defaulting to `0`, an
 * instantaneous toggle). Produces a `setVisible` operation whose `params` are
 * `{ visible }`; `visible` defaults to `true` when omitted.
 */
export function setVisible(
  id: StableId,
  target: StableId,
  options: SetVisibleOptions = {},
): Operation {
  requireId(id, 'setVisible.id');
  requireId(target, 'setVisible.target');
  const duration = options.duration === undefined ? 0 : requireDuration(options.duration);
  const params: { visible: boolean } = { visible: options.visible ?? true };
  return buildOperation(id, 'setVisible', {
    target,
    duration,
    params,
    easing: options.easing,
    extensions: options.extensions,
  });
}
