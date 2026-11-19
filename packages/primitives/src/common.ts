import type { JsonObject, StableId, VisualObject, VisualObjectState } from '@choreobit/core';

/**
 * The shared options a visual-object primitive accepts.
 *
 * A primitive's identity comes from the `id` passed to its constructor, not from
 * this object. Everything here is optional so a caller may specify just what it
 * needs; the primitive folds each present option into a lean
 * {@link VisualObjectState}, and a renderer fills in whatever is left out.
 *
 * Note that an object's *initial* state never carries a highlight color or a
 * transform: a highlight is produced by a {@link import('@choreobit/core').Operation}
 * of kind `'highlight'` (which sets `highlightColor` on the evaluated state), and
 * a transform by an operation of kind `'transform'`. They are timeline concerns,
 * not authoring-time initial state, so they are absent here.
 */
export interface PrimitiveOptions {
  /**
   * The object's initial position. When omitted, no `position` is written to the
   * object's state, leaving it to the renderer's default (the origin).
   */
  position?: { x: number; y: number };
  /**
   * The object's initial opacity in `[0, 1]`. Omitted means fully opaque, which
   * the renderer treats as the default; it is written to state only when given.
   */
  opacity?: number;
  /**
   * Whether the object starts visible. Defaults to `true`; the primitive writes
   * `visible` only when this is `false`, so a visible object keeps a lean state.
   */
  visible?: boolean;
  /**
   * Whether the object starts highlighted. Defaults to `false`; written to state
   * only when `true`.
   */
  highlighted?: boolean;
  /**
   * Type-specific properties merged into the object's state `properties`. The
   * primitive never fills in shape defaults here; a renderer owns them, so a
   * property the caller omits is the renderer's to default.
   */
  properties?: JsonObject;
  /**
   * Vendor/extension state copied through to the object's state `extensions`.
   */
  extensions?: JsonObject;
}

/**
 * The options a {@link import('./rectangle').rectangle}-style constructor takes:
 * its stable id plus its shared options.
 */
export interface PrimitiveConfig {
  /** The object's stable id. */
  id: StableId;
  /** The shared options. */
  options?: PrimitiveOptions;
}

/**
 * The primitive shapes the constructors build, as a string union. The first
 * three are the shapes `@choreobit/renderer` draws; `group` is a structural
 * container, not a rendered shape.
 */
export type PrimitiveShape = 'rectangle' | 'circle' | 'text' | 'group';

/**
 * Assemble the shared part of a primitive object's {@link VisualObjectState} from
 * the options, writing each field only when the option is present.
 *
 * A field is omitted (rather than set to a default) whenever the caller did not
 * supply it, so the produced object carries exactly what was asked for and the
 * renderer's own defaults stay authoritative for everything else. `visible` and
 * `highlighted` are written only when they take the non-default value (`false`
 * and `true` respectively), keeping a typical object's state lean.
 */
function buildState(options: PrimitiveOptions): VisualObjectState {
  const state: VisualObjectState = {};

  if (options.position !== undefined) {
    state.position = { x: options.position.x, y: options.position.y };
  }
  if (options.opacity !== undefined) {
    state.opacity = options.opacity;
  }
  if (options.visible === false) {
    state.visible = false;
  }
  if (options.highlighted === true) {
    state.highlighted = true;
  }
  if (options.properties !== undefined) {
    state.properties = { ...options.properties };
  }
  if (options.extensions !== undefined) {
    state.extensions = { ...options.extensions };
  }

  return state;
}

/**
 * Build a {@link VisualObject} from a shape, an id, and options.
 *
 * The shape is the object's `type`; the options are folded into a lean
 * `state`. A `children` array, when supplied, is attached so a group composes
 * its parts. The returned object is freshly allocated and shares no references
 * with the caller's option objects, so the caller may keep mutating its inputs.
 */
export function createPrimitive(
  shape: PrimitiveShape,
  config: PrimitiveConfig,
  children?: readonly VisualObject[],
): VisualObject {
  const state = buildState(config.options ?? {});
  const object: VisualObject = {
    id: config.id,
    type: shape,
    state,
  };
  if (children !== undefined) {
    object.children = children.map((child) => child);
  }
  return object;
}
