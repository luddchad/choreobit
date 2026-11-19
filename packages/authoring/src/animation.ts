import type {
  AnimationAuthoring,
  AnimationDefinition,
  Background,
  JsonValue,
  Scene,
  SemanticStep,
  SourceCode,
} from '@choreobit/core';
import { ANIMATION_DEFINITION_FORMAT_VERSION } from '@choreobit/core';
import { AuthoringError } from './errors';
import { requireId, requireNonNegative } from './internal';

/**
 * Compose a complete {@link AnimationDefinition} via {@link defineAnimation}.
 *
 * This is the top-level entry point of the authoring API: it stitches scenes,
 * semantic steps, and source-code presentation into one portable,
 * JSON-serializable document that `@choreobit/video` renders and
 * `@choreobit/player` plays back.
 *
 * When `duration` is omitted, the builder computes it as the sum of its scenes'
 * durations — the authoritative total — so a caller does not have to keep the
 * total in sync by hand. When `duration` is given, it is used as-is (the caller
 * is then responsible for it matching the scenes).
 */

/**
 * The configuration a {@link defineAnimation} call accepts.
 */
export interface AnimationConfig {
  /** A unique identifier for the definition, stable across authoring and playback. */
  id: string;
  /** A human-readable name. */
  name: string;
  /** A human-readable description. */
  description?: string;
  /**
   * The definition format version. Defaults to
   * {@link ANIMATION_DEFINITION_FORMAT_VERSION}.
   */
  formatVersion?: string;
  /** Optional authoring metadata. */
  authoring?: AnimationAuthoring;
  /** The logical width of the animation, in logical units. */
  width: number;
  /** The logical height of the animation, in logical units. */
  height: number;
  /** The background configuration. */
  background?: Background;
  /**
   * The total duration of the animation, in seconds. When omitted, it is the sum
   * of the scenes' durations.
   */
  duration?: number;
  /** The ordered scenes that make up the animation. */
  scenes: readonly Scene[];
  /**
   * The semantic algorithm steps, in execution order. The meaningful units of the
   * algorithm, decoupled from individual frames.
   */
  semanticSteps?: readonly SemanticStep[];
  /** Optional source-code presentation. */
  sourceCode?: SourceCode;
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}

/**
 * Build an {@link AnimationDefinition} from an {@link AnimationConfig}.
 *
 * Every array is copied and every present map is spread, so the produced
 * definition shares no references with the caller's input. `formatVersion`
 * defaults to {@link ANIMATION_DEFINITION_FORMAT_VERSION}; `duration`, when
 * omitted, is the sum of the scenes' durations.
 *
 * Throws an {@link AuthoringError} when the id or name is empty, or `width` or
 * `height` is not a finite, non-negative number.
 */
export function defineAnimation(config: AnimationConfig): AnimationDefinition {
  requireId(config.id, 'definition.id');

  if (typeof config.name !== 'string' || config.name.length === 0) {
    throw new AuthoringError('definition.name: must be a non-empty string');
  }

  const width = requireNonNegative(config.width, 'definition.width');
  const height = requireNonNegative(config.height, 'definition.height');

  const scenes = config.scenes.map((scene) => scene);
  const duration =
    config.duration === undefined
      ? scenes.reduce((sum, scene) => sum + scene.duration, 0)
      : requireNonNegative(config.duration, 'definition.duration');

  const definition: AnimationDefinition = {
    id: config.id,
    name: config.name,
    formatVersion: config.formatVersion ?? ANIMATION_DEFINITION_FORMAT_VERSION,
    width,
    height,
    duration,
    scenes,
  };

  if (config.description !== undefined) {
    definition.description = config.description;
  }
  if (config.authoring !== undefined) {
    definition.authoring = {
      ...config.authoring,
      metadata:
        config.authoring.metadata !== undefined ? { ...config.authoring.metadata } : undefined,
    };
  }
  if (config.background !== undefined) {
    definition.background = { ...config.background };
  }
  if (config.semanticSteps !== undefined) {
    definition.semanticSteps = config.semanticSteps.map((step) => step);
  }
  if (config.sourceCode !== undefined) {
    definition.sourceCode = config.sourceCode;
  }
  if (config.extensions !== undefined) {
    definition.extensions = { ...config.extensions };
  }

  return definition;
}
