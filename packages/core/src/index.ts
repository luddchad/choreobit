/**
 * `@choreobit/core` — the dependency root of ChoreoBit.
 *
 * This package owns the portable, renderer-agnostic domain contracts that every
 * ChoreoBit package builds on: the animation document, scenes, visual objects,
 * the timeline, semantic algorithm steps, source-code mappings, and the
 * serialization/validation helpers.
 *
 * Core is data only. It describes *what* an animation contains; it does not
 * execute, interpolate, or render. Those concerns live in `@choreobit/animation`,
 * `@choreobit/renderer`, `@choreobit/video`, and `@choreobit/player`.
 */

// Shared value contracts.
export type {
  Easing,
  EasingName,
  JsonObject,
  JsonValue,
  StableId,
  Transform,
  Vector2,
} from './definitions/common';

// The animation document and its composition.
export { ANIMATION_DEFINITION_FORMAT_VERSION } from './definitions/animation';
export type { AnimationAuthoring, AnimationDefinition, Background } from './definitions/animation';
export type { Scene } from './definitions/scene';
export type { VisualObject, VisualObjectState } from './definitions/object';
export type {
  Operation,
  OperationKind,
  Parallel,
  Sequence,
  Timeline,
  TimelineNode,
} from './definitions/timeline';
export type { SemanticStep, SemanticSteps } from './definitions/semantic-step';
export type { SourceCode, SourceLocation } from './definitions/source-code';

// Serialization and validation.
export {
  parseDefinition,
  serializeDefinition,
  validateAnimationDefinition,
} from './serialization/types';
export type { ValidationResult, ValidationOptions } from './serialization/types';
