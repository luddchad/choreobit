import type { JsonValue, StableId } from './common';
import type { VisualObject } from './object';
import type { Timeline } from './timeline';

/**
 * A scene: an ordered container of {@link VisualObject}s and a {@link Timeline}.
 *
 * A scene is one segment of an {@link AnimationDefinition}. Scenes are executed
 * one after another in array order. Each scene carries its own objects and
 * timeline, so a definition can present a concept in stages (e.g. "set up the
 * array", "run the search", "explain the result").
 */
export interface Scene {
  /** A stable identifier, unique within the definition. */
  id: StableId;
  /**
   * The scene's duration, in seconds. This is the time the scene occupies when
   * its timeline is played; the timeline's own end time should not exceed it.
   */
  duration: number;
  /** The visual objects present in this scene, in authoring order. */
  objects: readonly VisualObject[];
  /** The ordered composition nodes that animate this scene. */
  timeline: Timeline;
  /**
   * Scene-specific configuration (e.g. a caption, a transition from the previous
   * scene). Free-form JSON so scenes can carry metadata without changing core.
   */
  config?: { [key: string]: JsonValue };
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}
