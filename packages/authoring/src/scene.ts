import type { JsonValue, Scene, TimelineNode, VisualObject } from '@choreobit/core';
import { requireDuration, requireId } from './internal';

/**
 * Author a {@link Scene}: the typed entry point for assembling one segment of an
 * animation.
 *
 * A scene carries its own objects and a {@link import('@choreobit/core').Timeline}
 * of composition nodes ({@link import('./composition').sequence} /
 * {@link import('./composition').parallel}). The builder copies the `objects` and
 * `nodes` arrays so the caller may keep mutating its own lists, and threads a
 * `config` and `extensions` map through unchanged.
 */

/**
 * The configuration a {@link defineScene} call accepts.
 */
export interface SceneConfig {
  /** A stable identifier for the scene, unique within the definition. */
  id: string;
  /**
   * The scene's duration, in seconds. This is the time the scene occupies when
   * its timeline is played; the timeline's own end time should not exceed it.
   */
  duration: number;
  /** The visual objects present in this scene, in authoring order. */
  objects?: readonly VisualObject[];
  /**
   * The composition nodes that animate this scene. Omitted means an empty
   * timeline (no animation).
   */
  nodes?: readonly TimelineNode[];
  /**
   * Scene-specific configuration (e.g. a caption, a transition from the previous
   * scene). Free-form JSON so scenes can carry metadata without changing core.
   */
  config?: { [key: string]: JsonValue };
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}

/**
 * Build a {@link Scene} from a {@link SceneConfig}.
 *
 * The `objects` and `nodes` arrays are copied, and any present `config` or
 * `extensions` map is spread, so the produced scene shares no references with the
 * caller's input. The `timeline` is always a fresh object, with `nodes` defaulting
 * to an empty array.
 *
 * Throws an {@link AuthoringError} when the id is empty or the duration is not a
 * finite, non-negative number.
 */
export function defineScene(config: SceneConfig): Scene {
  requireId(config.id, 'scene.id');
  requireDuration(config.duration);

  const scene: Scene = {
    id: config.id,
    duration: config.duration,
    objects: (config.objects ?? []).map((object) => object),
    timeline: { nodes: (config.nodes ?? []).map((node) => node) },
  };

  if (config.config !== undefined) {
    scene.config = { ...config.config };
  }
  if (config.extensions !== undefined) {
    scene.extensions = { ...config.extensions };
  }

  return scene;
}
