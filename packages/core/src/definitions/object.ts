import type { JsonValue, StableId } from './common';

/**
 * The serializable visual state of an object at a point in time.
 *
 * This is a snapshot of how an object looks, independent of any renderer. Fields
 * are optional because an object need not specify everything; a renderer supplies
 * defaults for whatever is missing.
 */
export interface VisualObjectState {
  /** Logical position of the object, in the document's units. */
  position?: { x: number; y: number };
  /** Opacity in `[0, 1]`. */
  opacity?: number;
  /** Whether the object is visible. */
  visible?: boolean;
  /** Whether the object is the current focus of attention (e.g. a highlight). */
  highlighted?: boolean;
  /** Type-specific state, kept as JSON so any object type can extend it. */
  properties?: { [key: string]: JsonValue };
  /** Vendor/extension state for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}

/**
 * A generic, extensible visual object.
 *
 * Core does not know how any object type is rendered. An object is identified by
 * a stable id and a free-form type identifier; concrete types (array, tree node,
 * pointer, …) are provided by `@choreobit/primitives` and rendered by
 * `@choreobit/renderer`.
 */
export interface VisualObject {
  /** A stable identifier, unique within its scene. */
  id: StableId;
  /**
   * The object's type identifier. Free-form so the core never enumerates
   * concrete primitives (e.g. `'array'`, `'tree.node'`, `'pointer'`, `'edge'`).
   */
  type: string;
  /** The object's serializable visual state, or `undefined` for renderer defaults. */
  state?: VisualObjectState;
  /** Optional child objects, enabling compositional structures. */
  children?: readonly VisualObject[];
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}
