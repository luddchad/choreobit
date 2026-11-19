import type { JsonValue, SemanticStep, SourceLocation, StableId } from '@choreobit/core';
import { AuthoringError } from './errors';
import { requireId, requireNonNegative } from './internal';

/**
 * Author a {@link SemanticStep}: a meaningful unit of an algorithm that may span
 * many animation frames.
 *
 * A step is *not* a frame. One step can drive several operations over many
 * frames, and a step can also have no visible animation (a pure reasoning step).
 * The builder copies the `operations` and `sourceLocations` arrays so the caller
 * may keep mutating its own lists.
 *
 * Timing is relative to the step's scene: `start` positions the step on its
 * scene's timeline, `end` is when it finishes, and `start` must not exceed `end`.
 */

/**
 * The configuration a {@link semanticStep} call accepts.
 */
export interface SemanticStepConfig {
  /** The id of the scene this step belongs to. */
  sceneId: string;
  /** A human-readable description of what the step expresses. */
  description: string;
  /** The time, in seconds (within the step's scene), at which the step begins. */
  start: number;
  /**
   * The time, in seconds (within the step's scene), at which the step ends. Must
   * be greater than or equal to {@link SemanticStepConfig.start}.
   */
  end: number;
  /**
   * The operation ids this step drives. A step may drive several operations; a
   * step with no operations is a non-visual step.
   */
  operations: readonly StableId[];
  /**
   * The source locations this step maps to. A step may reference several
   * locations, and several steps may reference the same location. Absent for a
   * purely explanatory step.
   */
  sourceLocations?: readonly SourceLocation[];
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}

/**
 * Build a {@link SemanticStep} from an id and a {@link SemanticStepConfig}.
 *
 * The `operations` and `sourceLocations` arrays are copied, and any present
 * `extensions` map is spread, so the produced step shares no references with the
 * caller's input.
 *
 * Throws an {@link AuthoringError} when the id or scene id is empty, the
 * description is empty, `start` or `end` is not a finite, non-negative number, or
 * `start` exceeds `end`.
 */
export function semanticStep(id: StableId, config: SemanticStepConfig): SemanticStep {
  requireId(id, 'step.id');
  requireId(config.sceneId, 'step.sceneId');

  if (typeof config.description !== 'string' || config.description.length === 0) {
    throw new AuthoringError('step.description: must be a non-empty string');
  }

  const start = requireNonNegative(config.start, 'step.start');
  const end = requireNonNegative(config.end, 'step.end');

  if (start - end > 0) {
    throw new AuthoringError(`step: start ${start} is greater than end ${end}`);
  }

  if (config.operations === undefined) {
    throw new AuthoringError('step.operations: must be an array of operation ids');
  }
  for (let i = 0; i < config.operations.length; i++) {
    const opId = config.operations[i];
    if (typeof opId !== 'string' || opId.length === 0) {
      throw new AuthoringError(`step.operations[${i}]: must be a non-empty string`);
    }
  }

  const step: SemanticStep = {
    id,
    sceneId: config.sceneId,
    description: config.description,
    start,
    end,
    operations: config.operations.map((opId) => opId),
  };

  if (config.sourceLocations !== undefined) {
    step.sourceLocations = config.sourceLocations.map((location) => ({ ...location }));
  }
  if (config.extensions !== undefined) {
    step.extensions = { ...config.extensions };
  }

  return step;
}
