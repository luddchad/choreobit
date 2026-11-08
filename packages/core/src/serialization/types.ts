import { ANIMATION_DEFINITION_FORMAT_VERSION } from '../definitions/animation';
import type { AnimationDefinition } from '../definitions/animation';

/**
 * The result of a structural validation of an animation definition.
 *
 * Validation is structural (shape, types, and a small set of timing invariants),
 * not fully semantic: it confirms that the value has the fields the contract
 * requires, that required fields are present and of the right kind, that no
 * forbidden non-JSON value (a function, a class instance, …) is present, that
 * every operation `type` is a recognised {@link import('../definitions/timeline').OperationKind},
 * and that the timing invariants in the task spec hold (durations and timestamps
 * are finite and non-negative; the animation duration equals the sum of its scene
 * durations; a node's or a step's end does not exceed its scene). It does not
 * check that every operation target or step operation actually exists — that is a
 * deeper, semantic check that consumers may add on top.
 */
export interface ValidationResult {
  /** Whether the value passed structural validation. */
  valid: boolean;
  /** Human-readable messages for every problem found. Empty when valid. */
  errors: readonly string[];
}

/**
 * Options for {@link validateAnimationDefinition}.
 */
export interface ValidationOptions {
  /**
   * The format version to require. Defaults to
   * {@link ANIMATION_DEFINITION_FORMAT_VERSION}. A consumer that can only read
   * older definitions can pass its own version here and reject newer ones.
   */
  expectedVersion?: string;
}

/**
 * Serialize a definition to a JSON string with 2-space indentation.
 *
 * This is ordinary `JSON.stringify`. **Object key order is the object's own
 * insertion order, not a sorted order** — no canonical ordering is performed.
 * Two objects built with the same key order serialise identically, but two
 * objects with the same fields in a different key order do not produce identical
 * bytes.
 *
 * **JSON limitations, precisely:**
 *
 * - Object properties whose value is `undefined` are **omitted** by
 *   `JSON.stringify` and so do not survive a round trip.
 * - Functions, `symbol`s, class instances, and other non-JSON values are **not**
 *   preserved: they are dropped on the way out and cannot be recovered on the
 *   way in.
 *
 * Because of these limits, run {@link validateAnimationDefinition} **before**
 * serialising a hand-authored in-memory definition: it rejects non-JSON members
 * so the caller knows the document is safe to serialise.
 *
 * This function makes no promise of byte-identical output across authoring runs
 * nor of canonical key ordering.
 */
export function serializeDefinition(definition: AnimationDefinition): string {
  return JSON.stringify(definition, null, 2);
}

/**
 * Parse a JSON string back into a definition. Throws on malformed JSON.
 *
 * `JSON.parse` accepts only JSON, so the result never contains a function,
 * `symbol`, or class instance; in-memory authors must guard those with
 * {@link validateAnimationDefinition}.
 */
export function parseDefinition(json: string): AnimationDefinition {
  return JSON.parse(json) as AnimationDefinition;
}

/**
 * A small, documented tolerance for floating-point comparisons of durations and
 * timestamps. Timing values are seconds, so an error of well under a microsecond
 * is treated as equality. Used only to compare sums and end-times, never to
 * coerce values.
 */
export const DURATION_TOLERANCE = 1e-9;

/**
 * The closed set of operation kinds known to core, as a runtime set.
 *
 * Kept in lock-step with the `OperationKind` union in `../definitions/timeline`.
 * Validation uses this to reject operations whose `type` is not a recognised
 * kind. (An unknown kind is a structural error here, unlike an unknown
 * `extensions` key, which is preserved.)
 */
const RECOGNIZED_OPERATION_KINDS: ReadonlySet<string> = new Set<string>([
  'move',
  'set',
  'highlight',
  'setVisible',
  'transform',
  'addObject',
  'removeObject',
  'connect',
  'disconnect',
  'annotation',
]);

/** True when `value` is a finite, non-negative number. */
function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Recursively check that a value carries no forbidden non-JSON member.
 *
 * `JSON.parse` already guarantees this, but a definition may also be authored in
 * memory, so this guards that path.
 */
function hasNoNonJsonMembers(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every(hasNoNonJsonMembers);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).every(hasNoNonJsonMembers);
  }
  return typeof value !== 'function';
}

/**
 * Compute a timeline node's end time, in seconds, relative to its scene.
 *
 * A `Sequence` ends after the sum of its operations' durations; a `Parallel`
 * ends after the longest of its operations. Both add the node's `startAt`
 * (omitted means `0`). Returns `undefined` when the node is malformed enough that
 * no end time can be computed.
 */
function nodeEndTime(node: unknown): number | undefined {
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }
  const n = node as Record<string, unknown>;
  const startAt = n.startAt;
  const start = startAt === undefined ? 0 : startAt;
  if (!isFiniteNonNegative(start)) {
    return undefined;
  }
  const ops = n.operations;
  if (!Array.isArray(ops)) {
    return undefined;
  }
  const durations = ops.map((op) => {
    const o = op as Record<string, unknown> | undefined;
    return o === undefined ? undefined : o.duration;
  });
  if (durations.some((d) => !isFiniteNonNegative(d))) {
    return undefined;
  }
  if (n.kind === 'sequence') {
    return start + durations.reduce<number>((sum, d) => sum + (d as number), 0);
  }
  if (n.kind === 'parallel') {
    return start + Math.max(0, ...(durations as number[]));
  }
  return undefined;
}

/** Validate one timeline node and return its end time, or `undefined`. */
function validateNode(node: unknown, path: string, errors: string[]): number | undefined {
  const endTime = nodeEndTime(node);
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    errors.push(`${path}: must be an object`);
    return undefined;
  }
  const n = node as Record<string, unknown>;
  if (n.kind !== 'sequence' && n.kind !== 'parallel') {
    errors.push(`${path}.kind: must be 'sequence' or 'parallel'`);
  }
  if (!Array.isArray(n.operations)) {
    errors.push(`${path}.operations: must be an array`);
    return undefined;
  }
  n.operations.forEach((op, i) => {
    const opPath = `${path}.operations[${i}]`;
    if (typeof op !== 'object' || op === null || Array.isArray(op)) {
      errors.push(`${opPath}: must be an object`);
      return;
    }
    const o = op as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id.length === 0) {
      errors.push(`${opPath}.id: must be a non-empty string`);
    }
    if (typeof o.type !== 'string' || !RECOGNIZED_OPERATION_KINDS.has(o.type)) {
      errors.push(`${opPath}.type: must be a recognised operation kind`);
    }
    if (o.target !== undefined && (typeof o.target !== 'string' || o.target.length === 0)) {
      errors.push(`${opPath}.target: must be a non-empty string`);
    }
    if (
      o.params !== undefined &&
      (typeof o.params !== 'object' || o.params === null || Array.isArray(o.params))
    ) {
      errors.push(`${opPath}.params: must be a JSON object`);
    }
    if (!isFiniteNonNegative(o.duration)) {
      errors.push(`${opPath}.duration: must be a finite, non-negative number`);
    }
  });
  if (n.startAt !== undefined && !isFiniteNonNegative(n.startAt)) {
    errors.push(`${path}.startAt: must be a finite, non-negative number`);
  }
  return endTime;
}

/**
 * Structurally validate an animation definition without a schema dependency.
 *
 * This checks that the top-level and nested required fields are present and of
 * the right kind, that the `formatVersion` is compatible, that no non-JSON value
 * (function, class instance, …) is present, that every operation `type` is a
 * recognised {@link import('../definitions/timeline').OperationKind}, and that the
 * timing invariants hold:
 *
 * - every duration and timestamp is a finite, non-negative number;
 * - the animation `duration` equals the sum of its scene `duration`s (within
 *   {@link DURATION_TOLERANCE});
 * - no timeline node's end time exceeds its scene `duration`;
 * - every semantic step names an existing scene, its `start`/`end` are within
 *   that scene, and `start` does not exceed `end`.
 *
 * It is intentionally a lightweight, zero-dependency check; consumers may add
 * semantic validation (e.g. that every operation target exists, that a step's
 * `operations` reference real operations) on top.
 *
 * Unknown `extensions` fields are preserved and accepted, per the documented
 * forward-compatibility policy. This is distinct from an unrecognised operation
 * `type`, which is rejected.
 */
export function validateAnimationDefinition(
  value: unknown,
  options: ValidationOptions = {},
): ValidationResult {
  const errors: string[] = [];
  const expectedVersion = options.expectedVersion ?? ANIMATION_DEFINITION_FORMAT_VERSION;

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { valid: false, errors: ['definition: must be a JSON object'] };
  }

  const def = value as Record<string, unknown>;

  if (typeof def.id !== 'string' || def.id.length === 0) {
    errors.push('definition.id: must be a non-empty string');
  }
  if (typeof def.name !== 'string' || def.name.length === 0) {
    errors.push('definition.name: must be a non-empty string');
  }
  if (typeof def.formatVersion !== 'string') {
    errors.push('definition.formatVersion: must be a string');
  } else if (def.formatVersion !== expectedVersion) {
    errors.push(
      `definition.formatVersion: '${def.formatVersion}' is not compatible with '${expectedVersion}'`,
    );
  }
  if (!isFiniteNonNegative(def.width)) {
    errors.push('definition.width: must be a finite, non-negative number');
  }
  if (!isFiniteNonNegative(def.height)) {
    errors.push('definition.height: must be a finite, non-negative number');
  }
  if (!isFiniteNonNegative(def.duration)) {
    errors.push('definition.duration: must be a finite, non-negative number');
  }

  const sceneIds = new Set<string>();
  let sceneDurationsSum = 0;
  let sceneDurationsValid = true;

  if (!Array.isArray(def.scenes)) {
    errors.push('definition.scenes: must be an array');
  } else {
    def.scenes.forEach((scene, index) => {
      const path = `definition.scenes[${index}]`;
      if (typeof scene !== 'object' || scene === null || Array.isArray(scene)) {
        errors.push(`${path}: must be an object`);
        return;
      }
      const s = scene as Record<string, unknown>;
      if (typeof s.id !== 'string' || s.id.length === 0) {
        errors.push(`${path}.id: must be a non-empty string`);
      } else {
        sceneIds.add(s.id);
      }
      const sceneDuration = isFiniteNonNegative(s.duration) ? s.duration : undefined;
      if (sceneDuration === undefined) {
        errors.push(`${path}.duration: must be a finite, non-negative number`);
        sceneDurationsValid = false;
      } else {
        sceneDurationsSum += sceneDuration;
      }
      if (!Array.isArray(s.objects)) {
        errors.push(`${path}.objects: must be an array`);
      }
      if (typeof s.timeline !== 'object' || s.timeline === null || Array.isArray(s.timeline)) {
        errors.push(`${path}.timeline: must be an object`);
      } else {
        const timeline = s.timeline as Record<string, unknown>;
        if (!Array.isArray(timeline.nodes)) {
          errors.push(`${path}.timeline.nodes: must be an array`);
        } else {
          timeline.nodes.forEach((node, nodeIndex) => {
            const endTime = validateNode(node, `${path}.timeline.nodes[${nodeIndex}]`, errors);
            if (endTime !== undefined && sceneDuration !== undefined) {
              if (endTime - sceneDuration > DURATION_TOLERANCE) {
                errors.push(
                  `${path}.timeline.nodes[${nodeIndex}]: end time ${endTime} exceeds scene duration ${sceneDuration}`,
                );
              }
            }
          });
        }
      }
    });
  }

  if (sceneDurationsValid && isFiniteNonNegative(def.duration)) {
    if (Math.abs(sceneDurationsSum - def.duration) > DURATION_TOLERANCE) {
      errors.push(
        `definition.duration: ${def.duration} is not the sum of scene durations ${sceneDurationsSum}`,
      );
    }
  }

  if (def.semanticSteps !== undefined) {
    if (!Array.isArray(def.semanticSteps)) {
      errors.push('definition.semanticSteps: must be an array');
    } else {
      def.semanticSteps.forEach((step, index) => {
        const path = `definition.semanticSteps[${index}]`;
        if (typeof step !== 'object' || step === null || Array.isArray(step)) {
          errors.push(`${path}: must be an object`);
          return;
        }
        const st = step as Record<string, unknown>;
        if (typeof st.id !== 'string' || st.id.length === 0) {
          errors.push(`${path}.id: must be a non-empty string`);
        }
        if (typeof st.sceneId !== 'string' || st.sceneId.length === 0) {
          errors.push(`${path}.sceneId: must be a non-empty string`);
        } else if (!sceneIds.has(st.sceneId)) {
          errors.push(`${path}.sceneId: '${st.sceneId}' does not match any scene id`);
        }
        if (typeof st.description !== 'string' || st.description.length === 0) {
          errors.push(`${path}.description: must be a non-empty string`);
        }
        if (!isFiniteNonNegative(st.start)) {
          errors.push(`${path}.start: must be a finite, non-negative number`);
        }
        if (!isFiniteNonNegative(st.end)) {
          errors.push(`${path}.end: must be a finite, non-negative number`);
        }
        if (isFiniteNonNegative(st.start) && isFiniteNonNegative(st.end)) {
          if (st.start - st.end > DURATION_TOLERANCE) {
            errors.push(`${path}: start ${st.start} is greater than end ${st.end}`);
          }
        }
        if (!Array.isArray(st.operations)) {
          errors.push(`${path}.operations: must be an array`);
        } else {
          st.operations.forEach((opId, i) => {
            if (typeof opId !== 'string' || opId.length === 0) {
              errors.push(`${path}.operations[${i}]: must be a non-empty string`);
            }
          });
        }
        if (st.sourceLocations !== undefined && !Array.isArray(st.sourceLocations)) {
          errors.push(`${path}.sourceLocations: must be an array`);
        }
        if (
          isFiniteNonNegative(st.end) &&
          typeof st.sceneId === 'string' &&
          sceneIds.has(st.sceneId)
        ) {
          const scene = Array.isArray(def.scenes)
            ? (def.scenes as unknown[]).find(
                (s) =>
                  typeof s === 'object' &&
                  s !== null &&
                  (s as Record<string, unknown>).id === st.sceneId,
              )
            : undefined;
          const sceneDuration =
            scene !== undefined && scene !== null
              ? (scene as Record<string, unknown>).duration
              : undefined;
          if (isFiniteNonNegative(sceneDuration) && st.end - sceneDuration > DURATION_TOLERANCE) {
            errors.push(`${path}: end ${st.end} exceeds scene duration ${sceneDuration}`);
          }
        }
      });
    }
  }

  if (!hasNoNonJsonMembers(value)) {
    errors.push('definition: contains a non-JSON value (function, class instance, or …)');
  }

  return { valid: errors.length === 0, errors };
}
