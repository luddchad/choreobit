/**
 * `@choreobit/authoring` — the developer-facing authoring API.
 *
 * Where `@choreobit/core` is data only and `@choreobit/primitives` builds the
 * visual objects, this package is the ergonomic, typed entry point for assembling
 * an {@link AnimationDefinition} by hand in TypeScript:
 *
 * - {@link defineAnimation} composes scenes, semantic steps, and source code into
 *   one portable definition (defaulting its `duration` to the sum of its scenes);
 * - {@link defineScene} builds a scene from its objects and a timeline of
 *   composition nodes;
 * - {@link sequence} and {@link parallel} lay operations back-to-back or together;
 * - {@link move}, {@link set}, {@link highlight}, and {@link setVisible} build the
 *   operations a timeline runs;
 * - {@link semanticStep} and {@link sourceCode} attach the algorithm-to-code
 *   mapping a player shows beside the animation.
 *
 * The builders produce the very same `@choreobit/core` types the rest of the
 * pipeline consumes, so a definition built here runs through
 * `@choreobit/animation` (schedule + evaluate) and `@choreobit/renderer` without
 * any translation. They never mutate their input and never generate ids: every id
 * is the caller's to supply.
 */

// The domain contracts every builder produces, re-exported for convenience.
export * from '@choreobit/core';

// The visual-object constructors a scene's `objects` are built from.
export * from '@choreobit/primitives';

// The authoring builders.
export { AuthoringError } from './errors';
export { move, set, highlight, setVisible } from './operations';
export type {
  HighlightOptions,
  MoveOptions,
  OperationBuilderOptions,
  SetOptions,
  SetVisibleOptions,
} from './operations';
export { parallel, sequence } from './composition';
export { defineScene } from './scene';
export type { SceneConfig } from './scene';
export { semanticStep } from './semantic-step';
export type { SemanticStepConfig } from './semantic-step';
export { sourceCode } from './source-code';
export type { SourceCodeConfig } from './source-code';
export { defineAnimation } from './animation';
export type { AnimationConfig } from './animation';
