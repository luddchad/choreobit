import type { JsonValue, Vector2 } from '@choreobit/core';
import { deepCloneJsonMap, deepCloneJsonValue } from './cloning';
import { EvaluationError } from './error';
import { lerp, lerpPosition, progressFor } from './interpolation';
import type { ScheduledOperation } from '../scheduling/types';
import type { EvaluatedObjectState } from './types';

/**
 * Per-channel interpretation of the supported operation kinds, with deep
 * immutability.
 *
 * The evaluator does not accumulate a running value as it walks the schedule.
 * Instead each object's state is split into independent **channels** — `position`,
 * `opacity`, a `prop:<name>` channel per named property, `visible`, and
 * `highlight` — and each channel holds its own ordered list of operations.
 *
 * Each operation on a channel captures its **from** value at its own `start`
 * time, independent of the order in which operations are evaluated:
 *
 * - the first operation on a channel interpolates from the object's seeded value;
 * - every later operation captures, as its `from`, the value its immediate
 *   predecessor holds at the later operation's `start`. For a continuous
 *   predecessor that is the predecessor's interpolated value at that instant; for
 *   a discrete predecessor it is the predecessor's `to`.
 *
 * Because each `from` is fixed at its operation's own start, two operations that
 * overlap on the timeline do not interfere: each animates on its own interval, and
 * the later one takes precedence from its own `start` onward. This is the
 * history-independent overlap semantics.
 *
 * At evaluation time the active operation on a channel is the last one whose
 * `start <= time`; a continuous active operation is sampled by its eased
 * progress, a discrete one yields its `to`.
 *
 * A malformed or unsupported operation does not corrupt any state: its
 * interpreter throws an {@link EvaluationError}, which the walk turns into the
 * `{ ok: false }` result before any output is built.
 */

/**
 * The channel a `move`/`set`/`highlight`/`setVisible` operation writes.
 *
 * `position`, `opacity`, and the per-name `prop:<name>` channels carry numeric
 * values that interpolate; `visible` and `highlight` carry discrete values that
 * snap at the start.
 */
export type ChannelKey = 'position' | 'opacity' | 'visible' | 'highlight' | `prop:${string}`;

/** The `prop:<name>` prefix, kept in one place so build and sample agree. */
const PROP_PREFIX = 'prop:';

/**
 * The value a channel holds. Numeric channels (`position`, `opacity`, and the
 * `prop:<name>` channels that interpolate) carry a number or a {@link Vector2};
 * the discrete channels carry a boolean or a free-form color.
 */
export type ChannelValue = number | Vector2 | boolean | JsonValue | undefined;

/**
 * One operation's contribution to a single channel.
 *
 * `from` is captured at the operation's own `start` (the predecessor's value at
 * that instant); `to` is the operation's target. `continuous` records whether the
 * value animates over the interval (both ends finite numbers, or a position) or
 * snaps at the start. `color` carries a `highlight` operation's optional color.
 */
export interface ChannelSegment {
  /** The scheduled operation that produced this segment. */
  readonly scheduled: ScheduledOperation;
  /** The value the channel holds before this operation begins, captured at `start`. */
  readonly from: ChannelValue;
  /** The value the operation drives the channel to. */
  readonly to: ChannelValue;
  /** Whether the value interpolates over the interval (`true`) or snaps (`false`). */
  readonly continuous: boolean;
  /** A `highlight` segment's optional color, carried through to the snapshot. */
  readonly color?: JsonValue;
  /** The object the operation targeted. */
  readonly target: string;
}

/**
 * The per-object, per-channel view of the schedule: one ordered list of segments
 * per channel.
 *
 * The lists are built in the schedule's chronological order, with each segment's
 * `from` captured from its predecessor. At evaluation time the active segment per
 * channel is selected and sampled.
 */
export interface ChannelTable {
  position: ChannelSegment[];
  opacity: ChannelSegment[];
  visible: ChannelSegment[];
  highlight: ChannelSegment[];
  props: Map<string, ChannelSegment[]>;
}

/**
 * The seeded per-channel starting values of an object, read from its initial
 * {@link import('@choreobit/core').VisualObjectState}.
 *
 * `position` seeds to the source position (or `undefined`, which the position
 * channel treats as the origin `{0, 0}` for interpolation — presence is tracked
 * separately). `opacity` and `prop:<name>` seed to the source value, which may be
 * `undefined` (a first operation then snaps). `visible` defaults to `true`;
 * `highlight` has no seed. The `properties` bag is deep-cloned so the simulation
 * never writes through to the source scene.
 */
export interface InitialChannels {
  position: Vector2 | undefined;
  opacity: number | undefined;
  visible: boolean | undefined;
  properties: { [key: string]: JsonValue } | undefined;
  extensions: { [key: string]: JsonValue } | undefined;
}

/**
 * Read an object's initial state into the per-channel seeds, deep-copying the
 * mutable `properties` and `extensions` bags.
 */
export function readInitialChannels(
  state: import('@choreobit/core').VisualObjectState | undefined,
): InitialChannels {
  return {
    position: state?.position,
    opacity: state?.opacity,
    visible: state?.visible,
    properties: deepCloneJsonMap(state?.properties),
    extensions: deepCloneJsonMap(state?.extensions),
  };
}

/**
 * The channel key a `set` operation writes to. A name of `'opacity'` targets the
 * top-level opacity channel; any other name targets a `prop:<name>` channel.
 */
function channelForSet(name: string): ChannelKey {
  return name === 'opacity' ? 'opacity' : `${PROP_PREFIX}${name}`;
}

/**
 * The seeded value of a channel from an object's initial channels.
 *
 * `position` seeds to the source position, or the origin `{0, 0}` when the
 * object has none (presence of a position is tracked separately). `opacity` and
 * `prop:<name>` seed to the source value, which may be `undefined` (a first
 * operation then snaps). `visible` defaults to `true` only when the source state
 * does not set it; an explicit `false` is preserved. `highlight` has no seed.
 */
function seedFor(key: ChannelKey, initial: InitialChannels): ChannelValue {
  switch (key) {
    case 'position':
      return initial.position ?? { x: 0, y: 0 };
    case 'opacity':
      return initial.opacity;
    case 'visible':
      return initial.visible === undefined ? true : initial.visible;
    case 'highlight':
      return false;
    default:
      return initial.properties?.[key.slice(PROP_PREFIX.length)] ?? undefined;
  }
}

/**
 * The channel key and `to` value a single non-highlight operation writes.
 *
 * Returns the channel and target value; the interpolation decision
 * (`continuous`) is computed by the caller once the `from` is known. Throws an
 * {@link EvaluationError} naming the operation for a missing target or a
 * malformed or unsupported operation.
 */
function classifyTarget(
  scheduled: ScheduledOperation,
  inits: Map<string, InitialChannels>,
): { key: ChannelKey; to: ChannelValue } | null {
  const { operation, operationId } = scheduled;
  const target = operation.target;
  if (target === undefined || !inits.has(target)) {
    throw new EvaluationError({
      code: 'missingTarget',
      message: `operation "${operationId}" targets object "${target ?? ''}" which is not in the scene`,
      operationId,
      operationType: operation.type,
      target,
    });
  }

  switch (operation.type) {
    case 'move': {
      const x = operation.params?.x;
      const y = operation.params?.y;
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        throw new EvaluationError({
          code: 'malformedOperation',
          message: `move operation "${operationId}" requires numeric params x and y`,
          operationId,
          operationType: operation.type,
          target,
        });
      }
      return { key: 'position', to: { x, y } };
    }
    case 'set': {
      const name = operation.params?.name;
      const value = operation.params?.value;
      if (typeof name !== 'string' || value === undefined) {
        throw new EvaluationError({
          code: 'malformedOperation',
          message: `set operation "${operationId}" requires a string params.name and a params.value`,
          operationId,
          operationType: operation.type,
          target,
        });
      }
      return { key: channelForSet(name), to: deepCloneJsonValue(value) };
    }
    case 'highlight':
      return null;
    case 'setVisible': {
      const visible = operation.params?.visible;
      if (visible === undefined) {
        return { key: 'visible', to: true };
      }
      if (typeof visible !== 'boolean') {
        throw new EvaluationError({
          code: 'malformedOperation',
          message: `setVisible operation "${operationId}" requires a boolean params.visible`,
          operationId,
          operationType: operation.type,
          target,
        });
      }
      return { key: 'visible', to: visible };
    }
    default:
      throw new EvaluationError({
        code: 'unsupportedOperation',
        message: `operation "${operationId}" uses an unsupported kind "${operation.type}"`,
        operationId,
        operationType: operation.type,
        target,
      });
  }
}

/**
 * A value that is a finite number (the only values interpolatable or mappable).
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Whether a channel value is a `{x, y}` vector (the position channel's value),
 * duck-typed so the position channel is handled separately from the scalar
 * channels without an `instanceof` on a plain object.
 */
function isVector2(value: ChannelValue): value is Vector2 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { x?: unknown; y?: unknown };
  return (
    isFiniteNumber(candidate.x as number | undefined) &&
    isFiniteNumber(candidate.y as number | undefined)
  );
}

/**
 * Whether two channel values can interpolate into one another: both finite
 * numbers, or both vectors. A mismatch (e.g. a string target) is discrete.
 */
function canInterpolate(from: ChannelValue, to: ChannelValue): boolean {
  if (isVector2(to)) {
    return isVector2(from);
  }
  return isFiniteNumber(from) && isFiniteNumber(to);
}

/**
 * The value a channel holds at time `time`, read from its segment list.
 *
 * The active segment is the last one whose `start <= time`. A continuous segment
 * is sampled by its eased progress; a discrete one yields its `to`. With no
 * active segment the channel holds its seeded value.
 */
function sampleChannel(segments: ChannelSegment[], seed: ChannelValue, time: number): ChannelValue {
  let active: ChannelSegment | undefined;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.scheduled.start <= time) {
      active = segment;
    } else {
      break;
    }
  }
  if (active === undefined) {
    return seed;
  }
  if (active.continuous) {
    return sampleContinuous(active, time);
  }
  return active.to;
}

/**
 * The eased value of a continuous segment at `time`: its `from` interpolated to
 * its `to` by the segment's progress, per axis for a position.
 */
function sampleContinuous(segment: ChannelSegment, time: number): ChannelValue {
  const progress = progressFor(time, segment.scheduled);
  if (isVector2(segment.to)) {
    return lerpPosition(segment.from as Vector2, segment.to, progress);
  }
  return lerp(segment.from as number, segment.to as number, progress);
}

/**
 * Route the schedule's operations onto the per-object channel tables.
 *
 * A single chronological pass over the whole schedule: each operation is routed
 * to the table of the object it targets, and its `from` is captured from that
 * channel's predecessor at the operation's own `start` (so overlapping
 * operations on a channel are history-independent). An operation that targets an
 * id absent from the scene throws a `missingTarget` {@link EvaluationError} here,
 * in schedule order, so the first offender is named; the malformed/unsupported
 * validation lives in {@link classifyTarget}, reached for every in-schedule
 * operation regardless of which object it targets.
 */
export function routeSchedule(
  inits: Map<string, InitialChannels>,
  tables: Map<string, ChannelTable>,
  schedule: readonly ScheduledOperation[],
): void {
  for (const scheduled of schedule) {
    const targetId = scheduled.operation.target;
    if (targetId === undefined || !inits.has(targetId)) {
      throw new EvaluationError({
        code: 'missingTarget',
        message: `operation "${scheduled.operationId}" targets object "${targetId ?? ''}" which is not in the scene`,
        operationId: scheduled.operationId,
        operationType: scheduled.operation.type,
        target: targetId,
      });
    }
    const table = tables.get(targetId)!;
    const initial = inits.get(targetId)!;

    if (scheduled.operation.type === 'highlight') {
      const color = scheduled.operation.params?.color;
      const list = table.highlight;
      list.push({
        scheduled,
        from: list.length === 0 ? false : sampleChannel(list, false, scheduled.start),
        to: true,
        continuous: false,
        color: deepCloneJsonValue(color),
        target: targetId,
      });
      continue;
    }

    const classified = classifyTarget(scheduled, inits);
    if (classified === null) {
      continue;
    }

    const { key } = classified;
    // A non-numeric opacity value erases the opacity channel rather than writing
    // it; a numeric one interpolates.
    const to = key === 'opacity' && !isFiniteNumber(classified.to) ? undefined : classified.to;
    const list = channelList(table, key);
    const from =
      list.length === 0
        ? seedFor(key, initial)
        : sampleChannel(list, seedFor(key, initial), scheduled.start);
    list.push({
      scheduled,
      from,
      to,
      continuous: canInterpolate(from, to),
      target: targetId,
    });
  }
}

/**
 * The mutable segment list for a channel, allocating the per-name `props` list on
 * first use.
 */
function channelList(table: ChannelTable, key: ChannelKey): ChannelSegment[] {
  switch (key) {
    case 'position':
      return table.position;
    case 'opacity':
      return table.opacity;
    case 'visible':
      return table.visible;
    case 'highlight':
      return table.highlight;
    default: {
      const name = key.slice(PROP_PREFIX.length);
      let list = table.props.get(name);
      if (list === undefined) {
        list = [];
        table.props.set(name, list);
      }
      return list;
    }
  }
}

/**
 * Assemble an object's total visual state at one time from its channel table, into
 * a renderer-facing {@link EvaluatedObjectState}.
 *
 * The position and opacity channels are present when the object was seeded with
 * one or a set has begun; `visible` and `highlighted` are always present (their
 * defaults). Every value copied into the snapshot is deep-cloned, so the frame
 * shares no references with the source scene or with a sibling frame.
 */
export function freezeChannels(
  table: ChannelTable,
  initial: InitialChannels,
  time: number,
): EvaluatedObjectState {
  const state: EvaluatedObjectState = {
    visible: sampleChannel(table.visible, seedFor('visible', initial), time) as boolean,
    highlighted: sampleChannel(table.highlight, false, time) as boolean,
    properties: {},
  };

  // Position: present when seeded with one or a move has begun.
  const moveActive = table.position.length > 0 && table.position[0]!.scheduled.start <= time;
  if (initial.position !== undefined || moveActive) {
    const position = sampleChannel(table.position, seedFor('position', initial), time) as Vector2;
    state.position = { x: position.x, y: position.y };
  }

  // Opacity: present when the source state set one or an opacity set has begun.
  const opacityActive = table.opacity.length > 0 && table.opacity[0]!.scheduled.start <= time;
  if (initial.opacity !== undefined || opacityActive) {
    state.opacity = sampleChannel(table.opacity, seedFor('opacity', initial), time) as number;
  }

  // Properties: every seeded property plus every property channel that has begun,
  // each value deep-cloned so the frame owns its nested structure.
  const propKeys = new Set<string>([
    ...(initial.properties ? Object.keys(initial.properties) : []),
    ...table.props.keys(),
  ]);
  for (const key of propKeys) {
    const list = table.props.get(key);
    const active = list !== undefined && list.length > 0 && list[0]!.scheduled.start <= time;
    if (!active) {
      const seed = initial.properties?.[key];
      if (seed !== undefined) {
        state.properties[key] = deepCloneJsonValue(seed);
      }
      continue;
    }
    state.properties[key] = sampleChannel(list, initial.properties?.[key] ?? undefined, time);
  }

  // Highlight color: the active highlight segment's color, deep-cloned.
  const highlightActive = table.highlight.length > 0 && table.highlight[0]!.scheduled.start <= time;
  if (highlightActive) {
    let color: JsonValue | undefined;
    for (let i = 0; i < table.highlight.length; i++) {
      const segment = table.highlight[i]!;
      if (segment.scheduled.start <= time) {
        color = segment.color;
      } else {
        break;
      }
    }
    if (color !== undefined) {
      state.highlightColor = deepCloneJsonValue(color);
    }
  }

  if (initial.extensions !== undefined) {
    state.extensions = deepCloneJsonMap(initial.extensions) as { [key: string]: unknown };
  }

  return state;
}
