import type { JsonValue, StableId } from './common';
import type { SemanticStep } from './semantic-step';
import type { Scene } from './scene';
import type { SourceCode } from './source-code';

/**
 * The version of the ChoreoBit animation-definition format.
 *
 * This is the single source of truth for the current schema version. Consumers
 * compare it against a definition's `formatVersion` to decide whether they can
 * read the definition. It is a plain, comparable version string.
 */
export const ANIMATION_DEFINITION_FORMAT_VERSION = '1.0.0';

/** Authoring metadata describing who made a definition and when. */
export interface AnimationAuthoring {
  /** The name of the author. */
  author?: string;
  /** An ISO-8601 timestamp for when the definition was authored. */
  createdAt?: string;
  /** Free-form authoring metadata (e.g. tags, course id). */
  metadata?: { [key: string]: JsonValue };
}

/**
 * Background configuration for the animation's logical canvas.
 *
 * A renderer interprets this; core only carries the data. `solid` is a single
 * colour; `gradient` is a list of colour stops.
 */
export interface Background {
  /** The background kind. */
  kind: 'solid' | 'gradient' | 'transparent';
  /** A single colour for a solid background (e.g. `'#111827'`). */
  color?: string;
  /** Colour stops for a gradient background. */
  stops?: readonly string[];
  /** Optional direction for a gradient, in degrees. */
  angle?: number;
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}

/**
 * The top-level, portable representation of an authored animation.
 *
 * This is the document that `@choreobit/video` renders and `@choreobit/player`
 * plays back. It is renderer-agnostic and JSON-serializable: the same
 * definition can be consumed by any backend.
 *
 * **Frame-rate independence.** Every timing value in this document is a plain
 * number in **seconds**; there is no frame-rate field. The same authored
 * definition can therefore be rendered at 24, 30, or 60 FPS — or stepped through
 * interactively — without any of its timing values changing: the consuming
 * backend selects a frame rate and converts `t` to a frame index as it renders.
 *
 * Every field is JSON-serializable by construction: all timing and dimensions are
 * plain numbers, and no field holds a function, class instance, or
 * environment-specific object.
 */
export interface AnimationDefinition {
  /** A unique identifier for the definition, stable across authoring and playback. */
  id: StableId;
  /** A human-readable name. */
  name: string;
  /** A human-readable description. */
  description?: string;
  /**
   * The definition format version. Consumers use it to detect incompatible
   * definitions. Compare against {@link ANIMATION_DEFINITION_FORMAT_VERSION}.
   */
  formatVersion: string;
  /** Optional authoring metadata. */
  authoring?: AnimationAuthoring;
  /** The logical width of the animation, in logical units. */
  width: number;
  /** The logical height of the animation, in logical units. */
  height: number;
  /** The background configuration. */
  background?: Background;
  /**
   * The total duration of the animation, in seconds. This is the sum of the
   * scenes' durations; it is the authoritative total.
   */
  duration: number;
  /** The ordered scenes that make up the animation. */
  scenes: readonly Scene[];
  /**
   * The semantic algorithm steps, in execution order. These are the meaningful
   * units of the algorithm, decoupled from individual frames.
   */
  semanticSteps?: readonly SemanticStep[];
  /** Optional source-code presentation. */
  sourceCode?: SourceCode;
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}
