import type { JsonValue, StableId } from './common';
import type { SourceLocation } from './source-code';

/**
 * A semantic algorithm step: a meaningful unit of an algorithm that may span many
 * animation frames.
 *
 * A semantic step is *not* a frame. One step (e.g. "compute the midpoint of the
 * search range") can drive several concurrent operations over many frames. A step
 * can also have no visible animation (a pure reasoning step), and a purely
 * explanatory animation can belong to a step with no source reference.
 *
 * The mapping between source lines and semantic steps is intentionally not
 * one-to-one: a step's {@link SemanticStep.sourceLocations} may list several
 * lines, and many steps may reference the same line.
 */
export interface SemanticStep {
  /** A stable identifier, unique within the definition. */
  id: StableId;
  /**
   * The id of the scene this step belongs to. A step's `start`/`end` are
   * interpreted **relative to this scene's timeline**, so a step is unambiguously
   * located even when a definition has several scenes.
   */
  sceneId: StableId;
  /** A human-readable description of what the step expresses. */
  description: string;
  /**
   * The time, in seconds (within the step's scene), at which the step begins.
   * This positions the step on its scene's timeline even when the step drives no
   * visible animation.
   */
  start: number;
  /**
   * The time, in seconds (within the step's scene), at which the step ends.
   * Must be greater than or equal to {@link start}.
   */
  end: number;
  /**
   * The operation ids that this step drives. A step may drive several
   * operations; a step with no operations is a non-visual step.
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
 * The ordered semantic steps of a definition, in execution order.
 *
 * Steps belong to the definition as a whole, but each step names the scene it
 * is measured against via {@link SemanticStep.sceneId}; a step's timing is
 * relative to that scene.
 */
export interface SemanticSteps {
  /** The steps, in execution order. */
  steps: readonly SemanticStep[];
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}
